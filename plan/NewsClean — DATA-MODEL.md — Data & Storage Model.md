# NewsClean — Data & Storage Model

**Document ID:** `11-DATA-MODEL`
**Version:** `0.1.0`
**Status:** Foundation

## 1. Purpose

This document defines the canonical data model and storage architecture of NewsClean, establishing stable contracts between the Freeze Engine, DOM Inspector, Extraction Engine, Cleanup Engine, Preset System, Capture Engine, UI, and Storage.

Central principle:

> **NewsClean separates ephemeral page/session state from persistent configuration and generated assets.**

No engine may invent its own representation of elements, rules, history, presets, or capture state. There must be one canonical domain model.

## 2. Data Architecture

Three primary layers:

```
RUNTIME DATA (current DOM / browser state)
   ↓
SESSION DATA (freeze / selection / cleanup / capture state)
   ↓
PERSISTENT CONFIGURATION (presets, settings) + GENERATED ASSETS (PNG, export metadata)
```

## 3. Data Ownership Principle

Every important state object has one owner:

```text
Page state        → Browser / Content Runtime
Freeze state      → Freeze Engine
Extraction result → Extraction Engine
Selection state   → Inspector
Cleanup state     → Cleanup Engine
History           → History Manager
Preset            → Preset Repository
Capture state     → Capture Engine
UI state          → UI layer
```

The UI must never become the source of truth for domain state.

**Runtime vs Persistent:** selected element → runtime; deleted element in current page → session; site preset → persistent; capture result → generated asset; undo history → session.

## 4. Session Model

`NewsCleanSession` is the central runtime container.

```ts
interface NewsCleanSession {
  id: string;
  createdAt: number;

  page: PageContext;
  freeze: FreezeState;
  extraction: ExtractionState;
  inspection: InspectionState;
  cleanup: CleanupState;
  preset: PresetSessionState;
  capture: CaptureState;

  status: SessionStatus;
}
```

### 4.1 Session ID

Every session receives a unique identifier (e.g. `nc-session-01J...`; the exact generation mechanism is an implementation detail). Requirements: unique, stable during session, not derived from page content.

### 4.2 Session Lifecycle & Status

```text
CREATED → INITIALIZING → ACTIVE → CAPTURING → ACTIVE → COMPLETED
ACTIVE → FAILED
ACTIVE → CANCELLED
```

```ts
type SessionStatus =
  | "CREATED"
  | "INITIALIZING"
  | "ACTIVE"
  | "CAPTURING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";
```

### 4.3 Session Aggregate

`NewsCleanSession` acts as the runtime aggregate coordinating Page, Freeze, Extraction, Inspection, Cleanup, Preset, and Capture — but it must not become a giant monolithic class. The session coordinates state, events, and lifecycle while delegating freeze, cleanup, extraction, and capture logic to their respective engines. Each domain subsystem owns its internal logic.

## 5. Page Context & Identity

```ts
interface PageContext {
  url: string;
  hostname: string;
  pathname: string;
  title: string;
  startedAt: number;
}
```

The URL represents the current page at session initialization. Retain the original URL (query parameters, tracking parameters, fragments) for the active session when needed, but persistent preset identity normally uses `hostname` + optional path pattern rather than the complete URL.

```ts
interface PageIdentity {
  hostname: string;
  pathname: string;
}
```

```json
{ "hostname": "example.com", "pathname": "/news/2026/article" }
```

## 6. Element Reference Model

`ElementReference` represents a DOM element without storing the DOM element itself:

```ts
interface ElementReference {
  id: string;
  selector: string;
  tagName: string;
  className?: string;
  path?: string;
}
```

### 6.1 Why DOM Elements Are Not Stored

The system must never persist `HTMLElement` in session storage or persistent storage. DOM nodes are non-serializable, page-bound, volatile, and invalid after navigation. NewsClean instead stores a reference that can be resolved against the current DOM.

For the same reason the complete HTML is not stored before and after every operation: it would consume significant memory, create large history records, make undo expensive, and couple the system to serialization. The preferred architecture is operation-based history.

### 6.2 Reference Identity & Resolution

- Element reference IDs are session-scoped (`element-001`, `element-002`, …) and not expected to remain valid across page reloads.
- A selector is a resolution mechanism, not an absolute identity guarantee: `ElementReference = identity + selector + descriptive metadata`.

```ts
interface ElementResolver {
  resolve(reference: ElementReference): Element | null;
}
```

Resolution happens against the current DOM.

### 6.3 Stale References

A reference becomes stale when the selector matches nothing or the target structure changed. Report `STALE_REFERENCE` rather than silently acting on another element.

### 6.4 Element Snapshot

For diagnostics and history, store a lightweight descriptive snapshot (not the DOM itself):

```ts
interface ElementSnapshot {
  tagName: string;
  selector: string;
  textPreview?: string;
  className?: string;
  boundingBox?: Rect;
}
```

### 6.5 Rectangle Model

```ts
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Coordinates are CSS pixels unless explicitly stated otherwise.

## 7. Extraction Data

```ts
interface ExtractionResult {
  status: ExtractionStatus;
  confidence: ConfidenceLevel;

  article?: ElementReference;
  title?: ElementReference;
  subtitle?: ElementReference;
  heroImage?: ElementReference;
  body?: ElementReference;
  author?: ElementReference;
  publicationDate?: ElementReference;
  source?: ElementReference;
  logo?: ElementReference;

  candidates: ExtractionCandidate[];
}
```

```ts
type ExtractionStatus =
  | "NOT_RUN"
  | "RUNNING"
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED";
```

### 7.1 Confidence

Shared confidence terminology, used across Extraction, Preset validation, and Smart Cleanup where applicable:

```ts
type ConfidenceLevel =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "NONE";
```

### 7.2 Candidates

```ts
interface ExtractionCandidate {
  element: ElementReference;
  role: ExtractionRole;
  score: number;
  confidence: ConfidenceLevel;
  reasons: string[];
}

type ExtractionRole =
  | "ARTICLE"
  | "TITLE"
  | "SUBTITLE"
  | "HERO_IMAGE"
  | "BODY"
  | "AUTHOR"
  | "PUBLICATION_DATE"
  | "SOURCE"
  | "LOGO";
```

## 8. Cleanup Data

Cleanup is represented as intent before it becomes a mutation:

```ts
interface CleanupIntent {
  id: string;
  action: CleanupAction;
  target: ElementReference;
  source: CleanupSource;
  confidence?: ConfidenceLevel;
  reason?: string;
}
```

```ts
type CleanupAction = "DELETE" | "HIDE" | "KEEP";
```

No engine may introduce another action without changing the canonical model.

```ts
type CleanupSource = "USER" | "PRESET" | "SMART_CLEANUP" | "SYSTEM";
```

The origin of a cleanup decision must be explicit — important for conflict resolution, history, diagnostics, and UX.

### 8.1 Cleanup Rules & Categories

A reusable rule is different from a one-time cleanup intent:

```ts
interface CleanupRule {
  id: string;
  selector: string;
  action: CleanupAction;
  category?: CleanupCategory;
  enabled: boolean;
  required?: boolean;
}

type CleanupCategory =
  | "ADVERTISEMENT"
  | "SIDEBAR"
  | "NEWSLETTER"
  | "SOCIAL"
  | "COOKIE"
  | "RELATED"
  | "NAVIGATION"
  | "PROMOTION"
  | "OTHER";
```

### 8.2 Cleanup Operation

An operation represents an actual mutation performed during the session:

```ts
interface CleanupOperation {
  id: string;
  timestamp: number;

  action: CleanupAction;
  target: ElementReference;

  source: CleanupSource;

  before: ElementSnapshot;
  after: CleanupAfterState;
}

interface CleanupAfterState {
  status: "DELETED" | "HIDDEN" | "KEPT";
}
```

The system does not need to store the entire modified DOM.

## 9. History

Undo/Redo uses commands:

```ts
interface HistoryCommand {
  id: string;
  type: HistoryCommandType;
  timestamp: number;
  operation: CleanupOperation;
}

type HistoryCommandType =
  | "CLEANUP"
  | "RESTORE"
  | "BATCH_CLEANUP";
```

Capture operations do not enter this history.

### 9.1 Batch Operations

Bulk cleanup ("Delete Similar") may affect several elements, but the user expects Ctrl+Z to undo the entire action. Represent it as one logical operation:

```ts
interface BatchCleanupOperation {
  id: string;
  timestamp: number;
  source: CleanupSource;
  action: CleanupAction;
  targets: ElementReference[];
}
```

### 9.2 Stack & Semantics

```ts
interface HistoryState {
  undo: HistoryCommand[];
  redo: HistoryCommand[];
}
```

History is session-local. MVP limit: **100 logical operations** (exact limit configurable later); when reached, the oldest operations are discarded.

After `DELETE, DELETE, HIDE` the undo stack is `HIDE, DELETE, DELETE`. Undo removes the most recent logical operation; the operation moves undo → redo. A new cleanup operation clears the Redo stack.

## 10. Freeze Data

```ts
interface FreezeState {
  status: FreezeStatus;
  startedAt?: number;
  strategy?: string;
  diagnostics?: FreezeDiagnostics;
}

type FreezeStatus =
  | "UNFROZEN"
  | "FREEZING"
  | "FROZEN"
  | "DEGRADED"
  | "FAILED";

interface FreezeDiagnostics {
  animationCount?: number;
  transitionCount?: number;
  mediaCount?: number;
  mutationObserverBlocked?: boolean;
  pendingNetworkActivity?: boolean;
}
```

Diagnostics fields are not required for basic operation.

## 11. Inspection Data

```ts
interface InspectionState {
  active: boolean;
  hovered?: ElementReference;
  selected?: ElementReference;
  mode: InspectionMode;
}

type InspectionMode = "IDLE" | "HOVER" | "SELECT";
```

## 12. Preset Model

The canonical persistent site preset:

```ts
interface SitePreset {
  schemaVersion: number;

  id: string;
  version: number;

  site: PresetSiteIdentity;
  matching?: PresetMatching;

  extraction?: PresetExtractionHints;
  cleanup?: PresetCleanupConfig;
  protection?: PresetProtectionConfig;
  capture?: PresetCaptureDefaults;

  metadata: PresetMetadata;
}
```

### 12.1 Sub-schemas

```ts
interface PresetSiteIdentity {
  hostname: string;
}

interface PresetMatching {
  hostnames?: string[];
  paths?: string[];
}

interface PresetExtractionHints {
  article?: string[];
  title?: string[];
  subtitle?: string[];
  heroImage?: string[];
  body?: string[];
  author?: string[];
  publicationDate?: string[];
  source?: string[];
  logo?: string[];
}

interface PresetCleanupConfig {
  rules: CleanupRule[];
}

interface PresetProtectionConfig {
  rules: ProtectionRule[];
}

interface ProtectionRule {
  id: string;
  selector: string;
  action: "KEEP";
  enabled?: boolean;
}

interface PresetCaptureDefaults {
  mode?: CaptureMode;
}

type CaptureMode = "VISIBLE" | "FULL_PAGE" | "ELEMENT";

interface PresetMetadata {
  name: string;
  author: string;
  description?: string;
  source?: PresetSource;
  createdAt?: number;
  updatedAt?: number;
}

type PresetSource = "BUILT_IN" | "USER_CREATED" | "IMPORTED" | "COMMUNITY";
```

Protection is intentionally narrower than cleanup. `COMMUNITY` is future-facing but may exist in the schema. The matching model should remain simple in MVP.

### 12.2 Preset Validation

```ts
interface PresetValidationResult {
  valid: boolean;
  health: PresetHealth;

  checks: PresetValidationCheck[];
}

type PresetHealth = "HEALTHY" | "DEGRADED" | "STALE" | "BROKEN";

interface PresetValidationCheck {
  ruleId?: string;
  role?: ExtractionRole;
  selector: string;

  status: ValidationStatus;
  matchCount: number;

  required: boolean;
}

type ValidationStatus =
  | "PASS"
  | "NO_MATCH"
  | "MULTIPLE_MATCHES"
  | "INVALID_SELECTOR"
  | "UNEXPECTED";
```

### 12.3 Preset Session State & Application

The persistent preset and the active session state must remain separate:

```ts
interface PresetSessionState {
  detected: boolean;
  preset?: SitePreset;
  validation?: PresetValidationResult;
  applied: boolean;
}

interface PresetApplicationResult {
  status: "APPLIED" | "PARTIAL" | "FAILED";

  appliedRules: string[];
  skippedRules: string[];
  staleRules: string[];

  extraction?: ExtractionResult;
}
```

## 13. Capture Data

```ts
interface CaptureState {
  status: CaptureStatus;
  mode?: CaptureMode;
  target?: CaptureTarget;
  progress?: CaptureProgress;
  result?: CaptureResult;
}

type CaptureStatus =
  | "IDLE"
  | "PREPARING"
  | "VALIDATING"
  | "RENDERING"
  | "ENCODING"
  | "READY"
  | "EXPORTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

interface CaptureTarget {
  type: "VIEWPORT" | "ELEMENT";
  element?: ElementReference;
}

interface CaptureProgress {
  current: number;
  total: number;
  phase: "PREPARING" | "RENDERING" | "ENCODING" | "STITCHING";
}
```

For a single screenshot: `current = 1, total = 1`.

```ts
interface CaptureResult {
  success: boolean;

  mode: CaptureMode;

  width: number;
  height: number;

  scale: number;

  mimeType: "image/png";

  sizeBytes: number;

  blob?: Blob;

  diagnostics?: CaptureDiagnostics;

  error?: CaptureError;
}

interface CaptureError {
  code: CaptureErrorCode;
  message: string;
}

type CaptureErrorCode =
  | "NOT_FROZEN"
  | "TARGET_NOT_FOUND"
  | "TARGET_INVALID"
  | "UNSUPPORTED_PAGE"
  | "CAPTURE_PERMISSION_DENIED"
  | "CAPTURE_TIMEOUT"
  | "RENDER_FAILED"
  | "ENCODE_FAILED"
  | "STITCH_FAILED"
  | "BITMAP_TOO_LARGE"
  | "CANCELLED"
  | "UNKNOWN";

interface CaptureDiagnostics {
  cssWidth?: number;
  cssHeight?: number;

  outputWidth: number;
  outputHeight: number;

  scale: number;

  segmentCount: number;

  renderDurationMs?: number;
  encodeDurationMs?: number;
  totalDurationMs?: number;
}
```

### 13.1 Export Asset

The Capture Engine produces an asset; the Export layer receives it:

```ts
interface ExportAsset {
  id: string;

  type: "PNG";

  blob: Blob;

  filename: string;

  width: number;
  height: number;

  sizeBytes: number;

  createdAt: number;
}
```

Ownership: the Capture Engine owns creation of the asset; the Export Engine owns delivery — `Capture → ExportAsset`, `Export → filesystem / download / clipboard`.

## 14. Settings Model

Persistent user preferences are separate from presets:

```ts
interface UserSettings {
  language: "ar" | "fr" | "en";

  toolbar: ToolbarSettings;

  capture: CaptureSettings;

  behavior: BehaviorSettings;
}

interface ToolbarSettings {
  position: "TOP_CENTER" | "TOP_RIGHT" | "TOP_LEFT";
  compact: boolean;
}

interface CaptureSettings {
  defaultMode?: CaptureMode;
  respectDevicePixelRatio: boolean;
}

interface BehaviorSettings {
  showPresetSuggestions: boolean;
  confirmBulkCleanup: boolean;
  showOnboarding: boolean;
}
```

Behavior defaults should be conservative.

## 15. Storage Architecture

Use browser-local storage (Chrome Storage) for configuration and lightweight state: settings, presets, and small persistent preferences. Session state remains primarily in memory. PNG assets go to the file system / download.

```text
chrome.storage.local:  settings, presets, preset metadata
Runtime memory:        session, cleanup history, extraction result, inspection state, capture state
File / Download:       PNG exports
```

### 15.1 Session State Is Not Persistent

If the user reloads the article the DOM changes, making stale cleanup history and element references dangerous. Session state is destroyed on navigation, reload, and tab close unless a future persistence mechanism explicitly supports safe restoration.

### 15.2 Tab Isolation & Shared Presets

Each browser tab has its own session (Tab A → Session A, Tab B → Session B). Tabs never share selected element, cleanup history, freeze state, or capture target. Presets are reusable across tabs — both may load the same persistent configuration.

### 15.3 Storage Keys

Keys are namespaced:

```text
newsclean.settings
newsclean.presets
newsclean.schemaVersion
```

Avoid generic keys (`settings`, `data`, `config`) to minimize collisions. Example preset storage shape:

```json
{
  "newsclean.presets": {
    "preset.example-news": {
      "schemaVersion": 1,
      "id": "preset.example-news",
      "version": 1
    }
  }
}
```

(The exact storage representation may be optimized during implementation.)

### 15.4 Storage Validation Pipeline

Everything loaded from storage is untrusted configuration. Never `LOAD → USE`:

```text
LOAD → SCHEMA VALIDATION → NORMALIZE → USE
```

Use Zod or an equivalent runtime schema library. The requirement is not the library itself — runtime data must be validated before entering the domain layer. Normalization converts missing optional fields, old schema fields, and legacy values into the current domain model.

### 15.5 Schema Versioning & Migration

Persistent data must include `schemaVersion` (presets, settings, and future persistent entities). When the schema changes:

```text
OLD DATA → VERSION DETECTION → MIGRATION → VALIDATION → CURRENT DATA
```

Migration must be deterministic. If migration fails: do not overwrite the original data; report the error; disable the affected preset; preserve the existing stored value where possible.

### 15.6 Atomicity & Storage Failure

Persistent updates are logically atomic: `Validate preset → Write new preset`, never write half then validate. If Chrome storage fails, the session should continue where possible — e.g. a failed preset save must not destroy the current cleanup session.

### 15.7 Quota & Persistence Rules

Presets are small; storage usage stays low. Never store full HTML, screenshots, base64 PNGs, or large DOM snapshots in `chrome.storage.local`. PNG assets go to Download / File System. MVP does not require persistent capture history or full session serialization (a future crash-recovery implementation requires explicit validation). Cleanup history is session-scoped and must not persist by default — DOM references become stale after navigation.

## 16. Messaging Model

The system uses lightweight domain events to synchronize engines and UI:

```ts
interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  timestamp: number;
  payload: T;
}
```

### 16.1 Core Events

```text
SESSION_CREATED, SESSION_READY
FREEZE_STARTED, FREEZE_COMPLETED, FREEZE_FAILED
EXTRACTION_STARTED, EXTRACTION_COMPLETED, EXTRACTION_FAILED
INSPECTION_STARTED, ELEMENT_SELECTED, INSPECTION_ENDED
CLEANUP_PROPOSED, ELEMENT_DELETED, ELEMENT_HIDDEN, ELEMENT_KEPT, CLEANUP_BATCH_APPLIED
UNDO_PERFORMED, REDO_PERFORMED, CLEANUP_RESET
PRESET_DETECTED, PRESET_VALIDATED, PRESET_APPLIED, PRESET_FAILED
CAPTURE_STARTED, CAPTURE_COMPLETED, CAPTURE_FAILED, CAPTURE_CANCELLED
EXPORT_STARTED, EXPORT_COMPLETED, EXPORT_FAILED
```

### 16.2 Event Ownership & Command vs Event

Events originate from the domain engine that owns the operation (Cleanup Engine → `ELEMENT_DELETED`, never UI → `ELEMENT_DELETED`). The distinction is mandatory:

```text
Command: "Do this."       UI → DELETE_SELECTED_ELEMENT → Cleanup Engine
Event:   "This happened."  Cleanup Engine → ELEMENT_DELETED → UI
```

Commands are runtime messages, not persistent data:

```ts
interface Command<T = unknown> {
  type: string;
  payload: T;
}
```

### 16.3 Data Flow

```text
USER → UI COMMAND → DOMAIN ENGINE → DOMAIN STATE → DOMAIN EVENT → UI
```

### 16.4 Message Envelope

Extension contexts exchange serialized messages using explicit contracts:

```ts
interface MessageEnvelope<T = unknown> {
  id: string;
  type: string;
  payload: T;
}

interface MessageResponse<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```

Every request carries an ID correlated with its response (`capture-001` ↔ `capture-001`), important when multiple operations are in flight. No loose undocumented messages like `{ "action": "doSomething", "data": {} }`; messages map to known commands. Messages operating on a page include `sessionId` to prevent cross-session confusion:

```json
{
  "id": "msg-001",
  "type": "DELETE_ELEMENT",
  "payload": { "sessionId": "session-001", "elementId": "element-007" }
}
```

## 17. Repository Architecture

Persistent data is accessed through repositories; the UI must not call `chrome.storage` directly.

```text
UI → Preset Service → Preset Repository → Chrome Storage
```

```ts
interface PresetRepository {
  list(): Promise<SitePreset[]>;
  get(id: string): Promise<SitePreset | null>;
  save(preset: SitePreset): Promise<void>;
  delete(id: string): Promise<void>;
}

interface SettingsRepository {
  get(): Promise<UserSettings>;
  save(settings: UserSettings): Promise<void>;
}
```

### 17.1 Session Store

```ts
interface SessionStore {
  get(id: string): NewsCleanSession | null;
  set(session: NewsCleanSession): void;
  remove(id: string): void;
}
```

May use a `Map`. The store belongs to the active extension runtime; when the tab disappears the session is eligible for cleanup, with no persistent dependency. Session data is released on tab close, navigation, and session end. Large temporary objects such as `CaptureResult.blob` must be explicitly dereferenced after export.

## 18. Navigation & Session Boundaries

Navigation is a hard session boundary in MVP: `article A → article B` terminates the existing session, then `new URL → new session`. This prevents stale references.

- The preset repository survives navigation; the active session does not (Article A → Session A → Preset Example News; navigate; Article B → Session B → same preset).
- Settings survive navigation, reload, and browser restart (subject to Chrome storage lifecycle).
- Deleting a preset removes it from persistent storage but must not modify the current page, current cleanup, or current session; the active session may continue using the already-loaded preset configuration.
- Editing a preset while active: the current session continues using its loaded version until explicitly re-applied — avoiding unexpected mutations.

## 19. Data Integrity & Runtime Validation

Each domain object has explicit validity rules:

```text
ElementReference → selector required
SitePreset       → id required, schemaVersion required, hostname required
CaptureResult    → width > 0, height > 0, mimeType = image/png
```

TypeScript types are not sufficient at runtime. External boundaries require validation: Chrome messages, storage, imported presets, URL-derived configuration.

## 20. Serialization Rules

Serializable: strings, numbers, booleans, arrays, plain objects.

Never placed directly into persistent storage (non-serializable runtime objects): `HTMLElement`, `Blob`, `ImageBitmap`, `AbortController`, `DOMRect`. Where needed:

```text
DOMRect      → Rect
HTMLElement  → ElementReference
DOMRect-like → plain object
```

`Blob` is a runtime capture artifact; keep it in memory until Export or Release; it must not enter normal session serialization.

**Large data principle:** store references and metadata, not large binary or DOM structures:

```text
Element → reference
PNG     → external file
HTML    → current browser page
History → operations
```

## 21. Data Model Anti-Patterns (Prohibited)

1. Storing `HTMLElement` in session storage.
2. Storing full page HTML for every cleanup operation.
3. Storing PNG Base64 in Chrome Storage.
4. UI components owning domain state.
5. Presets containing JavaScript.
6. Cleanup rules directly manipulating DOM from storage.
7. Persistent references to stale DOM nodes.
8. Using URL as permanent element identity.
9. Mixing session state with user settings.
10. Using arbitrary untyped message payloads.

## 22. Data Ownership Matrix

| Data             | Owner               | Lifetime       | Persistent |
| ---------------- | ------------------- | -------------- | ---------- |
| PageContext      | Session             | Session        | No         |
| ElementReference | Inspector/Session   | Session        | No         |
| FreezeState      | Freeze Engine       | Session        | No         |
| ExtractionResult | Extraction Engine   | Session        | No         |
| CleanupIntent    | Cleanup Engine      | Session        | No         |
| CleanupOperation | Cleanup Engine      | Session        | No         |
| HistoryState     | History Manager     | Session        | No         |
| SitePreset       | Preset Repository   | Long-term      | Yes        |
| UserSettings     | Settings Repository | Long-term      | Yes        |
| CaptureState     | Capture Engine      | Session        | No         |
| CaptureResult    | Capture Engine      | Short-lived    | No         |
| ExportAsset      | Export Layer        | File lifecycle | No         |
| DomainEvent      | Event Bus           | Runtime        | No         |

## 23. Data Dependency Graph

```text
PageContext → Freeze / Extraction → ElementReference → CleanupIntent
→ CleanupOperation → HistoryCommand → Working DOM → CaptureTarget
→ CaptureResult → ExportAsset

SitePreset → Extraction Hints / Cleanup Rules / Protection Rules / Capture Defaults
```

## 24. Versioning

Current persistent schema: `schemaVersion: 1`. Future: `schemaVersion: 2`, handled by the migration layer. The domain model must not contain legacy representations after migration.

## 25. Examples

### 25.1 Full Session

```json
{
  "id": "session-001",
  "createdAt": 1786537200000,

  "page": {
    "url": "https://example.com/news/article-123",
    "hostname": "example.com",
    "pathname": "/news/article-123",
    "title": "Example Article",
    "startedAt": 1786537200000
  },

  "freeze": { "status": "FROZEN" },

  "extraction": {
    "status": "SUCCESS",
    "confidence": "HIGH",
    "article": { "id": "element-001", "selector": "article.article", "tagName": "ARTICLE" },
    "title": { "id": "element-002", "selector": "h1.article-title", "tagName": "H1" },
    "body": { "id": "element-003", "selector": ".article-body", "tagName": "DIV" },
    "candidates": []
  },

  "inspection": { "active": false, "mode": "IDLE" },
  "cleanup": { "operations": [] },
  "preset": { "detected": true, "applied": false },
  "capture": { "status": "IDLE" },
  "status": "ACTIVE"
}
```

### 25.2 Cleanup Operation

```json
{
  "id": "operation-001",
  "timestamp": 1786537212000,
  "action": "DELETE",
  "target": { "id": "element-009", "selector": ".advertisement", "tagName": "DIV" },
  "source": "USER",
  "before": {
    "tagName": "DIV",
    "selector": ".advertisement",
    "className": "advertisement",
    "textPreview": "Advertisement"
  },
  "after": { "status": "DELETED" }
}
```

### 25.3 Preset

```json
{
  "schemaVersion": 1,
  "id": "preset.example-news",
  "version": 3,
  "site": { "hostname": "example.com" },
  "matching": { "paths": ["/news/*"] },
  "extraction": {
    "article": ["article.article"],
    "title": ["h1.article-title"],
    "body": [".article-body"]
  },
  "cleanup": {
    "rules": [
      { "id": "ads", "selector": ".advertisement", "action": "DELETE", "category": "ADVERTISEMENT", "enabled": true }
    ]
  },
  "capture": { "mode": "ELEMENT" },
  "metadata": { "name": "Example News", "author": "NewsClean" }
}
```

### 25.4 Capture Result

```json
{
  "success": true,
  "mode": "ELEMENT",
  "width": 1280,
  "height": 3420,
  "scale": 1,
  "mimeType": "image/png",
  "sizeBytes": 2849211,
  "diagnostics": {
    "cssWidth": 1280,
    "cssHeight": 3420,
    "outputWidth": 1280,
    "outputHeight": 3420,
    "scale": 1,
    "segmentCount": 1,
    "renderDurationMs": 421,
    "encodeDurationMs": 103,
    "totalDurationMs": 524
  }
}
```

## 26. Architectural Decision

NewsClean uses a session-centric runtime model + repository-based persistent model + operation-based history + reference-based DOM model + event-driven engine communication — rather than full DOM snapshots + global mutable state + UI-owned data + persistent page state. This is fundamental to keeping the extension lightweight and reliable.

**Implementation boundary:** UI → Commands → Session → Engines → Domain Models → Repositories → Chrome APIs. Engines need not know how the UI renders the data; the UI need not know how an engine implements its algorithms.

**Final storage model:** the persistent boundary is intentionally small — `newsclean.settings`, `newsclean.presets`, `newsclean.schemaVersion`. Everything else is transient unless a future document explicitly introduces persistence. This keeps NewsClean LOCAL, FAST, PRIVATE, and SESSION-ORIENTED while still allowing reusable site knowledge through the Preset System.
