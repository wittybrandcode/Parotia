# NewsClean

## Data & Storage Model

**Document ID:** `11-DATA-MODEL`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `07-ARTICLE-EXTRACTION.md`, `08-CAPTURE-ENGINE.md`, `09-PRESET-SYSTEM.md`, `10-UI-UX.md`

---

## 1. Purpose

This document defines the canonical data model and storage architecture of NewsClean.

Its purpose is to establish stable contracts between:

```text
Freeze Engine
DOM Inspector
Extraction Engine
Cleanup Engine
Preset System
Capture Engine
UI
Storage
```

The central principle is:

> **NewsClean separates ephemeral page/session state from persistent configuration and generated assets.**

The system must not allow every engine to invent its own representation of elements, rules, history, presets, or capture state.

There must be one canonical domain model.

---

# 2. Data Architecture

The data architecture is divided into three primary layers:

```text
RUNTIME DATA
    ↓
SESSION DATA
    ↓
PERSISTENT DATA
```

More precisely:

```text
┌──────────────────────────────────────┐
│ PAGE RUNTIME                         │
│ Current DOM / browser state          │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│ SESSION STATE                        │
│ Freeze / Selection / Cleanup / etc. │
└──────────────────┬───────────────────┘
                   │
          ┌────────┴─────────┐
          ▼                  ▼
┌─────────────────┐  ┌─────────────────┐
│ PERSISTENT      │  │ GENERATED       │
│ CONFIGURATION   │  │ ASSETS          │
│                 │  │                 │
│ Presets         │  │ PNG             │
│ Settings        │  │ Export metadata │
└─────────────────┘  └─────────────────┘
```

---

# 3. Data Ownership Principle

Every important state object must have one owner.

```text
Page state
→ Browser / Content Runtime

Freeze state
→ Freeze Engine

Extraction result
→ Extraction Engine

Selection state
→ Inspector

Cleanup state
→ Cleanup Engine

History
→ History Manager

Preset
→ Preset Repository

Capture state
→ Capture Engine

UI state
→ UI layer
```

The UI must never become the source of truth for domain state.

---

# 4. Runtime vs Persistent

A critical distinction:

```text
Runtime:
"What is happening right now?"

Persistent:
"What should NewsClean remember?"
```

For example:

```text
Selected element
→ Runtime

Deleted element in current page
→ Session

Site preset
→ Persistent

Capture result
→ Generated asset

Undo history
→ Session
```

---

# 5. Session Model

The `NewsCleanSession` is the central runtime container.

Conceptually:

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

---

# 6. Session ID

Every session receives a unique identifier.

Example:

```text
nc-session-01J...
```

The exact ID generation mechanism is an implementation detail.

Requirements:

```text
unique
stable during session
not derived from page content
```

---

# 7. Session Lifecycle

```text
CREATED
   ↓
INITIALIZING
   ↓
ACTIVE
   ↓
CAPTURING
   ↓
ACTIVE
   ↓
COMPLETED
```

Abnormal:

```text
ACTIVE
   ↓
FAILED
```

or:

```text
ACTIVE
   ↓
CANCELLED
```

---

# 8. Session Status

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

---

# 9. Page Context

The page context identifies the browser page being processed.

```ts
interface PageContext {
  url: string;
  hostname: string;
  pathname: string;
  title: string;
  startedAt: number;
}
```

The URL should represent the current page at session initialization.

---

# 10. URL Handling

The full URL may contain:

```text
query parameters
tracking parameters
fragments
```

The system should retain the original URL for the active session when needed.

However, persistent preset identity should normally use:

```text
hostname
+
optional path pattern
```

rather than the complete URL.

---

# 11. Page Identity

Conceptually:

```ts
interface PageIdentity {
  hostname: string;
  pathname: string;
}
```

Example:

```json
{
  "hostname": "example.com",
  "pathname": "/news/2026/article"
}
```

---

# 12. Element Reference

The `ElementReference` is one of the most important objects in the system.

It represents a DOM element without storing the DOM element itself.

```ts
interface ElementReference {
  id: string;
  selector: string;
  tagName: string;
  className?: string;
  path?: string;
}
```

---

# 13. Why DOM Elements Are Not Stored

The system must never persist:

```ts
HTMLElement
```

inside session storage or persistent storage.

DOM nodes are:

```text
non-serializable
page-bound
volatile
invalid after navigation
```

Instead, NewsClean stores a reference that can be resolved against the current DOM.

---

# 14. Element Reference Identity

An element reference ID is session-scoped.

Example:

```text
element-001
element-002
element-003
```

It is not expected to remain valid across page reloads.

---

# 15. Selector as Reference

A selector is useful but not guaranteed to remain stable.

Therefore:

```text
ElementReference
=
identity
+
selector
+
descriptive metadata
```

The selector is a resolution mechanism, not an absolute identity guarantee.

---

# 16. Element Resolution

Conceptually:

```ts
interface ElementResolver {
  resolve(
    reference: ElementReference
  ): Element | null;
}
```

Resolution happens against the current DOM.

---

# 17. Stale Element Reference

An element reference becomes stale when:

```text
selector matches nothing
```

or:

```text
target structure changed
```

The system must report:

```text
STALE_REFERENCE
```

rather than silently acting on another element.

---

# 18. Element Snapshot

For diagnostics and history, NewsClean may store a lightweight snapshot.

```ts
interface ElementSnapshot {
  tagName: string;
  selector: string;
  textPreview?: string;
  className?: string;
  boundingBox?: Rect;
}
```

The snapshot is descriptive.

It is not the DOM itself.

---

# 19. Rectangle Model

All geometry uses a shared model:

```ts
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Coordinates are CSS pixels unless explicitly stated otherwise.

---

# 20. Extraction Result

The canonical extraction result is:

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

---

# 21. Extraction Status

```ts
type ExtractionStatus =
  | "NOT_RUN"
  | "RUNNING"
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED";
```

---

# 22. Confidence

Shared confidence terminology:

```ts
type ConfidenceLevel =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "NONE";
```

The same terminology should be used across:

```text
Extraction
Preset validation
Smart Cleanup
```

where applicable.

---

# 23. Extraction Candidate

```ts
interface ExtractionCandidate {
  element: ElementReference;
  role: ExtractionRole;
  score: number;
  confidence: ConfidenceLevel;
  reasons: string[];
}
```

---

# 24. Extraction Role

```ts
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

---

# 25. Cleanup Intent

Cleanup is represented as intent before it becomes a mutation.

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

---

# 26. Cleanup Action

Canonical actions:

```ts
type CleanupAction =
  | "DELETE"
  | "HIDE"
  | "KEEP";
```

No engine may introduce another action without changing the canonical model.

---

# 27. Cleanup Source

The origin of a cleanup decision must be explicit.

```ts
type CleanupSource =
  | "USER"
  | "PRESET"
  | "SMART_CLEANUP"
  | "SYSTEM";
```

This is important for:

```text
conflict resolution
history
diagnostics
UX
```

---

# 28. Cleanup Rule

A reusable cleanup rule is different from a one-time cleanup intent.

```ts
interface CleanupRule {
  id: string;
  selector: string;
  action: CleanupAction;
  category?: CleanupCategory;
  enabled: boolean;
  required?: boolean;
}
```

---

# 29. Cleanup Category

```ts
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

---

# 30. Cleanup Operation

A cleanup operation represents an actual mutation performed during the session.

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
```

---

# 31. Cleanup After State

```ts
interface CleanupAfterState {
  status: "DELETED" | "HIDDEN" | "KEPT";
}
```

The system does not need to store the entire modified DOM.

---

# 32. Why the Full DOM Is Not Stored

Storing the complete HTML before and after every operation would:

```text
consume significant memory
create large history records
make undo expensive
couple the system to serialization
```

The preferred architecture is operation-based history.

---

# 33. History Command

Undo/Redo uses commands.

```ts
interface HistoryCommand {
  id: string;
  type: HistoryCommandType;
  timestamp: number;
  operation: CleanupOperation;
}
```

---

# 34. History Command Types

```ts
type HistoryCommandType =
  | "CLEANUP"
  | "RESTORE"
  | "BATCH_CLEANUP";
```

Capture operations do not enter this history.

---

# 35. Batch Operation

Bulk cleanup must be represented as one logical operation when appropriate.

Example:

```text
Delete Similar
```

may affect:

```text
5 elements
```

but the user expects:

```text
Ctrl+Z
```

to undo the entire action.

Therefore:

```ts
interface BatchCleanupOperation {
  id: string;
  timestamp: number;
  source: CleanupSource;
  action: CleanupAction;
  targets: ElementReference[];
}
```

---

# 36. History Stack

Conceptually:

```ts
interface HistoryState {
  undo: HistoryCommand[];
  redo: HistoryCommand[];
}
```

The history is session-local.

---

# 37. History Limits

MVP should define a reasonable maximum history depth.

Example:

```text
100 logical operations
```

The exact limit can be configurable later.

When the limit is reached, the oldest operations are discarded.

---

# 38. History Semantics

After:

```text
DELETE
DELETE
HIDE
```

the stack is:

```text
UNDO
├── HIDE
├── DELETE
└── DELETE
```

Undo removes the most recent logical operation.

---

# 39. Redo Semantics

After:

```text
UNDO
```

the operation moves:

```text
undo
 ↓
redo
```

A new cleanup operation clears the Redo stack.

---

# 40. Freeze State

```ts
interface FreezeState {
  status: FreezeStatus;
  startedAt?: number;
  strategy?: string;
  diagnostics?: FreezeDiagnostics;
}
```

---

# 41. Freeze Status

```ts
type FreezeStatus =
  | "UNFROZEN"
  | "FREEZING"
  | "FROZEN"
  | "DEGRADED"
  | "FAILED";
```

---

# 42. Freeze Diagnostics

```ts
interface FreezeDiagnostics {
  animationCount?: number;
  transitionCount?: number;
  mediaCount?: number;
  mutationObserverBlocked?: boolean;
  pendingNetworkActivity?: boolean;
}
```

These are diagnostic fields and should not be required for basic operation.

---

# 43. Inspection State

```ts
interface InspectionState {
  active: boolean;
  hovered?: ElementReference;
  selected?: ElementReference;
  mode: InspectionMode;
}
```

---

# 44. Inspection Mode

```ts
type InspectionMode =
  | "IDLE"
  | "HOVER"
  | "SELECT";
```

---

# 45. Preset Model

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

---

# 46. Preset Site Identity

```ts
interface PresetSiteIdentity {
  hostname: string;
}
```

---

# 47. Preset Matching

```ts
interface PresetMatching {
  hostnames?: string[];
  paths?: string[];
}
```

The model should remain simple in MVP.

---

# 48. Preset Extraction Hints

```ts
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
```

---

# 49. Preset Cleanup Configuration

```ts
interface PresetCleanupConfig {
  rules: CleanupRule[];
}
```

---

# 50. Preset Protection Configuration

```ts
interface PresetProtectionConfig {
  rules: ProtectionRule[];
}
```

---

# 51. Protection Rule

```ts
interface ProtectionRule {
  id: string;
  selector: string;
  action: "KEEP";
  enabled?: boolean;
}
```

Protection is intentionally narrower than cleanup.

---

# 52. Preset Capture Defaults

```ts
interface PresetCaptureDefaults {
  mode?: CaptureMode;
}
```

MVP:

```ts
type CaptureMode =
  | "VISIBLE"
  | "FULL_PAGE"
  | "ELEMENT";
```

---

# 53. Preset Metadata

```ts
interface PresetMetadata {
  name: string;
  author: string;
  description?: string;
  source?: PresetSource;
  createdAt?: number;
  updatedAt?: number;
}
```

---

# 54. Preset Source

```ts
type PresetSource =
  | "BUILT_IN"
  | "USER_CREATED"
  | "IMPORTED"
  | "COMMUNITY";
```

`COMMUNITY` is future-facing but can exist in the schema.

---

# 55. Preset Validation Result

```ts
interface PresetValidationResult {
  valid: boolean;
  health: PresetHealth;

  checks: PresetValidationCheck[];
}
```

---

# 56. Preset Health

```ts
type PresetHealth =
  | "HEALTHY"
  | "DEGRADED"
  | "STALE"
  | "BROKEN";
```

---

# 57. Preset Validation Check

```ts
interface PresetValidationCheck {
  ruleId?: string;
  role?: ExtractionRole;
  selector: string;

  status: ValidationStatus;
  matchCount: number;

  required: boolean;
}
```

---

# 58. Validation Status

```ts
type ValidationStatus =
  | "PASS"
  | "NO_MATCH"
  | "MULTIPLE_MATCHES"
  | "INVALID_SELECTOR"
  | "UNEXPECTED";
```

---

# 59. Preset Session State

The persistent preset and the active session state must remain separate.

```ts
interface PresetSessionState {
  detected: boolean;
  preset?: SitePreset;
  validation?: PresetValidationResult;
  applied: boolean;
}
```

---

# 60. Preset Application Result

```ts
interface PresetApplicationResult {
  status: "APPLIED" | "PARTIAL" | "FAILED";

  appliedRules: string[];
  skippedRules: string[];
  staleRules: string[];

  extraction?: ExtractionResult;
}
```

---

# 61. Capture State

```ts
interface CaptureState {
  status: CaptureStatus;
  mode?: CaptureMode;
  target?: CaptureTarget;
  progress?: CaptureProgress;
  result?: CaptureResult;
}
```

---

# 62. Capture Status

```ts
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
```

---

# 63. Capture Target

```ts
interface CaptureTarget {
  type: "VIEWPORT" | "ELEMENT";
  element?: ElementReference;
}
```

The mode determines whether the target is:

```text
viewport
```

or:

```text
specific element
```

---

# 64. Capture Progress

```ts
interface CaptureProgress {
  current: number;
  total: number;
  phase: "PREPARING" | "RENDERING" | "ENCODING" | "STITCHING";
}
```

For a single screenshot:

```text
current = 1
total = 1
```

---

# 65. Capture Result

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
```

---

# 66. Capture Error

```ts
interface CaptureError {
  code: CaptureErrorCode;
  message: string;
}
```

---

# 67. Capture Error Codes

```ts
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
```

---

# 68. Capture Diagnostics

```ts
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

---

# 69. Export Asset

The Capture Engine produces an asset.

The Export layer receives:

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

---

# 70. Export Asset Ownership

The Capture Engine owns the creation of the asset.

The Export Engine owns delivery.

Therefore:

```text
Capture
→ ExportAsset

Export
→ filesystem / download / clipboard
```

---

# 71. Settings Model

Persistent user preferences are separate from presets.

```ts
interface UserSettings {
  language: "ar" | "fr" | "en";

  toolbar: ToolbarSettings;

  capture: CaptureSettings;

  behavior: BehaviorSettings;
}
```

---

# 72. Toolbar Settings

```ts
interface ToolbarSettings {
  position: "TOP_CENTER" | "TOP_RIGHT" | "TOP_LEFT";
  compact: boolean;
}
```

---

# 73. Capture Settings

```ts
interface CaptureSettings {
  defaultMode?: CaptureMode;
  respectDevicePixelRatio: boolean;
}
```

---

# 74. Behavior Settings

```ts
interface BehaviorSettings {
  showPresetSuggestions: boolean;
  confirmBulkCleanup: boolean;
  showOnboarding: boolean;
}
```

These defaults should be conservative.

---

# 75. Storage Architecture

NewsClean should use browser-local storage for configuration and lightweight state.

Recommended:

```text
Chrome Storage
```

for:

```text
settings
presets
small persistent preferences
```

Session state should remain primarily in memory.

---

# 76. Storage Separation

```text
┌─────────────────────────────┐
│ chrome.storage.local       │
│                             │
│ settings                   │
│ presets                    │
│ preset metadata            │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Runtime Memory              │
│                             │
│ session                    │
│ cleanup history             │
│ extraction result           │
│ inspection state            │
│ capture state               │
└─────────────────────────────┘

┌─────────────────────────────┐
│ File / Download             │
│                             │
│ PNG exports                │
└─────────────────────────────┘
```

---

# 77. Why Session State Is Not Persistent

If the user reloads the article:

```text
DOM changes
```

Therefore stale cleanup history and element references become dangerous.

Session state should normally be destroyed on:

```text
navigation
reload
tab close
```

unless a future persistence mechanism explicitly supports safe restoration.

---

# 78. Tab Isolation

Each browser tab should have its own NewsClean session.

Example:

```text
Tab A
→ Session A

Tab B
→ Session B
```

They must never share:

```text
selected element
cleanup history
freeze state
capture target
```

---

# 79. Presets Are Shared

Unlike session state:

```text
Preset
```

is reusable across tabs.

Therefore:

```text
Tab A
→ Example News preset

Tab B
→ Example News preset
```

may both load the same persistent configuration.

---

# 80. Storage Keys

Storage keys should be namespaced.

Example:

```text
newsclean.settings
newsclean.presets
newsclean.schemaVersion
```

Avoid generic keys such as:

```text
settings
data
config
```

to minimize collisions.

---

# 81. Preset Storage Shape

Conceptually:

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

The exact storage representation may be optimized during implementation.

---

# 82. Storage Validation

Everything loaded from storage is untrusted configuration.

Before use:

```text
LOAD
 ↓
SCHEMA VALIDATION
 ↓
NORMALIZE
 ↓
USE
```

Never:

```text
LOAD
 ↓
USE
```

---

# 83. Schema Validation

The implementation should use a runtime schema validation strategy.

Possible implementation:

```text
Zod
```

or an equivalent schema library.

The important requirement is not the library itself.

The requirement is:

> Runtime data must be validated before entering the domain layer.

---

# 84. Normalization

Stored configuration may contain:

```text
missing optional fields
old schema fields
legacy values
```

The repository should normalize it into the current domain model.

Example:

```text
Stored Preset v1
      ↓
Migration
      ↓
Current Preset Model
```

---

# 85. Schema Versioning

Persistent data must include:

```text
schemaVersion
```

This applies to:

```text
presets
settings
```

and future persistent entities.

---

# 86. Migration

When the schema changes:

```text
OLD DATA
 ↓
VERSION DETECTION
 ↓
MIGRATION
 ↓
VALIDATION
 ↓
CURRENT DATA
```

Migration must be deterministic.

---

# 87. Failed Migration

If migration fails:

```text
do not overwrite original data
```

Instead:

```text
report error
disable affected preset
preserve existing stored value where possible
```

---

# 88. Atomic Persistence

Persistent updates should be logically atomic.

For example:

```text
Validate preset
 ↓
Write new preset
```

not:

```text
Write half preset
 ↓
Validation
```

---

# 89. Storage Failure

If Chrome storage fails:

```text
session should continue
```

where possible.

For example, failure to save a preset should not destroy the current cleanup session.

---

# 90. Storage Quota

Presets are small.

Therefore storage usage should remain low.

The system must nevertheless avoid storing:

```text
full HTML
screenshots
base64 PNGs
large DOM snapshots
```

in `chrome.storage.local`.

---

# 91. PNG Storage

PNG assets should not normally be stored in Chrome Storage.

Instead:

```text
PNG
→ Download / File System
```

The browser handles the final asset.

---

# 92. Capture History

MVP does not require persistent capture history.

A future capture history may store:

```text
filename
timestamp
source hostname
dimensions
```

but not necessarily the full PNG.

---

# 93. Cleanup History Persistence

Cleanup history is session-scoped.

It must not persist by default.

Reason:

```text
DOM reference becomes stale
```

after navigation.

---

# 94. Session Serialization

MVP does not require full session serialization.

A future implementation may support temporary crash recovery, but only with explicit validation.

---

# 95. Domain Events

The system should use lightweight domain events to synchronize engines and UI.

Conceptually:

```ts
interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  timestamp: number;
  payload: T;
}
```

---

# 96. Core Events

Recommended events:

```text
SESSION_CREATED
SESSION_READY

FREEZE_STARTED
FREEZE_COMPLETED
FREEZE_FAILED

EXTRACTION_STARTED
EXTRACTION_COMPLETED
EXTRACTION_FAILED

INSPECTION_STARTED
ELEMENT_SELECTED
INSPECTION_ENDED

CLEANUP_PROPOSED
ELEMENT_DELETED
ELEMENT_HIDDEN
ELEMENT_KEPT
CLEANUP_BATCH_APPLIED

UNDO_PERFORMED
REDO_PERFORMED
CLEANUP_RESET

PRESET_DETECTED
PRESET_VALIDATED
PRESET_APPLIED
PRESET_FAILED

CAPTURE_STARTED
CAPTURE_COMPLETED
CAPTURE_FAILED
CAPTURE_CANCELLED

EXPORT_STARTED
EXPORT_COMPLETED
EXPORT_FAILED
```

---

# 97. Event Ownership

Events originate from the domain engine that owns the operation.

Example:

```text
Cleanup Engine
→ ELEMENT_DELETED
```

not:

```text
UI
→ ELEMENT_DELETED
```

The UI sends commands.

The engine emits events.

---

# 98. Command vs Event

The distinction is mandatory.

```text
Command:
"Do this."

Event:
"This happened."
```

Example:

```text
UI
→ DELETE_SELECTED_ELEMENT

Cleanup Engine
→ ELEMENT_DELETED
```

---

# 99. Command Model

Conceptually:

```ts
interface Command<T = unknown> {
  type: string;
  payload: T;
}
```

Commands are not persistent data.

They are runtime messages.

---

# 100. Data Flow

The canonical flow is:

```text
USER
 ↓
UI COMMAND
 ↓
DOMAIN ENGINE
 ↓
DOMAIN STATE
 ↓
DOMAIN EVENT
 ↓
UI
```

Example:

```text
Click Delete
 ↓
DELETE_ELEMENT
 ↓
Cleanup Engine
 ↓
CleanupOperation
 ↓
ELEMENT_DELETED
 ↓
Toolbar counter updates
```

---

# 101. Session Aggregate

`NewsCleanSession` acts as the runtime aggregate coordinating:

```text
Page
Freeze
Extraction
Inspection
Cleanup
Preset
Capture
```

However, it must not become a giant monolithic class.

Each domain subsystem owns its internal logic.

---

# 102. Aggregate Boundary

The session coordinates:

```text
state
events
lifecycle
```

but delegates:

```text
freeze logic
cleanup logic
extraction logic
capture logic
```

to their respective engines.

---

# 103. Data Dependency Graph

```text
PageContext
     │
     ├──────────────┐
     ▼              ▼
 Freeze         Extraction
     │              │
     │              ▼
     │        ElementReference
     │              │
     └──────┬───────┘
            ▼
       CleanupIntent
            │
            ▼
      CleanupOperation
            │
            ▼
       HistoryCommand
            │
            ▼
       Working DOM
            │
            ▼
       CaptureTarget
            │
            ▼
       CaptureResult
            │
            ▼
        ExportAsset
```

Preset:

```text
SitePreset
   │
   ├── Extraction Hints
   ├── Cleanup Rules
   ├── Protection Rules
   └── Capture Defaults
```

---

# 104. Data Ownership Matrix

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

---

# 105. Serialization Rules

Serializable:

```text
strings
numbers
booleans
arrays
plain objects
```

Non-serializable runtime objects:

```text
HTMLElement
Blob
ImageBitmap
AbortController
DOMRect
```

should never be placed directly into persistent storage.

Where needed:

```text
DOMRect
→ Rect

HTMLElement
→ ElementReference

DOMRect-like data
→ plain object
```

---

# 106. Blob Handling

`Blob` is a runtime capture artifact.

It should remain in memory until:

```text
Export
```

or:

```text
Release
```

It should not enter normal session serialization.

---

# 107. Large Data Principle

The data model follows:

> Store references and metadata, not large binary or DOM structures.

Therefore:

```text
Element
→ reference

PNG
→ external file

HTML
→ current browser page

History
→ operations
```

---

# 108. Data Integrity

Each domain object must have explicit validity rules.

Example:

```text
ElementReference
→ selector required

SitePreset
→ id required
→ schemaVersion required
→ hostname required

CaptureResult
→ width > 0
→ height > 0
→ mimeType = image/png
```

---

# 109. Runtime Validation

TypeScript types are not sufficient at runtime.

External boundaries require validation:

```text
Chrome messages
Storage
Imported presets
URL-derived configuration
```

---

# 110. Chrome Messaging Model

Extension contexts may exchange serialized messages.

Example:

```text
Content Script
      ↕
Service Worker
      ↕
Extension UI
```

Messages should use explicit contracts.

---

# 111. Message Envelope

Conceptual:

```ts
interface MessageEnvelope<T = unknown> {
  id: string;
  type: string;
  payload: T;
}
```

Responses:

```ts
interface MessageResponse<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
```

---

# 112. Message Correlation

Every request should have an ID.

Example:

```text
request:
capture-001

response:
capture-001
```

This is important when multiple operations may be in flight.

---

# 113. No Implicit Message Contracts

Do not use loose messages such as:

```json
{
  "action": "doSomething",
  "data": {}
}
```

without a documented schema.

Messages should map to known commands.

---

# 114. Session and Message Context

Messages that operate on a page should include:

```text
sessionId
```

where needed.

This prevents cross-session confusion.

---

# 115. Example Message

```json
{
  "id": "msg-001",
  "type": "DELETE_ELEMENT",
  "payload": {
    "sessionId": "session-001",
    "elementId": "element-007"
  }
}
```

---

# 116. Storage Repository Architecture

Persistent data should be accessed through repositories.

```text
UI
 ↓
Preset Service
 ↓
Preset Repository
 ↓
Chrome Storage
```

The UI should not call `chrome.storage` directly.

---

# 117. Repository Interfaces

```ts
interface PresetRepository {
  list(): Promise<SitePreset[]>;
  get(id: string): Promise<SitePreset | null>;
  save(preset: SitePreset): Promise<void>;
  delete(id: string): Promise<void>;
}
```

Settings:

```ts
interface SettingsRepository {
  get(): Promise<UserSettings>;
  save(settings: UserSettings): Promise<void>;
}
```

---

# 118. In-Memory Session Store

The runtime may use:

```ts
interface SessionStore {
  get(id: string): NewsCleanSession | null;
  set(session: NewsCleanSession): void;
  remove(id: string): void;
}
```

The implementation may use a `Map`.

---

# 119. Session Store Lifetime

The Session Store belongs to the active extension runtime.

When the tab disappears:

```text
Session
→ eligible for cleanup
```

No persistent dependency should exist.

---

# 120. Garbage Collection

Session data should be released when:

```text
tab closes
navigation occurs
session ends
```

Large temporary objects such as:

```text
CaptureResult.blob
```

must be explicitly dereferenced after export.

---

# 121. Navigation Handling

Navigation is a hard session boundary in MVP.

When:

```text
article A
→ article B
```

the existing session should be terminated.

Then:

```text
new URL
→ new session
```

This prevents stale references.

---

# 122. Preset Persistence Across Navigation

The preset repository survives navigation.

The active session does not.

Example:

```text
Article A
→ Session A
→ Preset Example News

Navigate

Article B
→ Session B
→ Same Preset Example News
```

---

# 123. User Settings Persistence

Settings survive:

```text
navigation
reload
browser restart
```

subject to Chrome storage lifecycle.

---

# 124. Preset Deletion

Deleting a preset removes it from persistent storage.

It must not modify:

```text
current page
current cleanup
current session
```

The active session may continue using the already-loaded preset configuration.

---

# 125. Preset Update During Session

If the user edits a preset while it is active:

```text
Current session
→ continues using its loaded version
```

until explicitly re-applied.

This avoids unexpected mutations.

---

# 126. Data Versioning Strategy

Current:

```text
schemaVersion: 1
```

Future:

```text
schemaVersion: 2
```

The migration layer handles evolution.

The domain model should not contain legacy representations after migration.

---

# 127. Data Model Anti-Patterns

The following are prohibited:

```text
1. Storing HTMLElement in session storage.
2. Storing full page HTML for every cleanup operation.
3. Storing PNG Base64 in Chrome Storage.
4. UI components owning domain state.
5. Presets containing JavaScript.
6. Cleanup rules directly manipulating DOM from storage.
7. Persistent references to stale DOM nodes.
8. Using URL as permanent element identity.
9. Mixing session state with user settings.
10. Using arbitrary untyped message payloads.
```

---

# 128. Example Full Session

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

  "freeze": {
    "status": "FROZEN"
  },

  "extraction": {
    "status": "SUCCESS",
    "confidence": "HIGH",
    "article": {
      "id": "element-001",
      "selector": "article.article",
      "tagName": "ARTICLE"
    },
    "title": {
      "id": "element-002",
      "selector": "h1.article-title",
      "tagName": "H1"
    },
    "body": {
      "id": "element-003",
      "selector": ".article-body",
      "tagName": "DIV"
    },
    "candidates": []
  },

  "inspection": {
    "active": false,
    "mode": "IDLE"
  },

  "cleanup": {
    "operations": []
  },

  "preset": {
    "detected": true,
    "applied": false
  },

  "capture": {
    "status": "IDLE"
  },

  "status": "ACTIVE"
}
```

---

# 129. Example Cleanup Operation

```json
{
  "id": "operation-001",
  "timestamp": 1786537212000,

  "action": "DELETE",

  "target": {
    "id": "element-009",
    "selector": ".advertisement",
    "tagName": "DIV"
  },

  "source": "USER",

  "before": {
    "tagName": "DIV",
    "selector": ".advertisement",
    "className": "advertisement",
    "textPreview": "Advertisement"
  },

  "after": {
    "status": "DELETED"
  }
}
```

---

# 130. Example Preset

```json
{
  "schemaVersion": 1,

  "id": "preset.example-news",
  "version": 3,

  "site": {
    "hostname": "example.com"
  },

  "matching": {
    "paths": [
      "/news/*"
    ]
  },

  "extraction": {
    "article": [
      "article.article"
    ],
    "title": [
      "h1.article-title"
    ],
    "body": [
      ".article-body"
    ]
  },

  "cleanup": {
    "rules": [
      {
        "id": "ads",
        "selector": ".advertisement",
        "action": "DELETE",
        "category": "ADVERTISEMENT",
        "enabled": true
      }
    ]
  },

  "capture": {
    "mode": "ELEMENT"
  },

  "metadata": {
    "name": "Example News",
    "author": "NewsClean"
  }
}
```

---

# 131. Example Capture Result

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

---

# 132. Canonical Data Relationships

The most important relationships are:

```text
SitePreset
   │
   ├── ExtractionHints
   ├── CleanupRules
   ├── ProtectionRules
   └── CaptureDefaults

NewsCleanSession
   │
   ├── PageContext
   ├── FreezeState
   ├── ExtractionResult
   ├── InspectionState
   ├── CleanupState
   ├── PresetSessionState
   └── CaptureState

CleanupOperation
   │
   └── HistoryCommand

CaptureResult
   │
   └── ExportAsset
```

---

# 133. Canonical Domain Model

At the highest level:

```text
                        NEWSCLEAN
                           │
              ┌────────────┴────────────┐
              │                         │
          PERSISTENT                 RUNTIME
              │                         │
       ┌──────┴──────┐        ┌─────────┴─────────┐
       │             │        │                   │
    Presets       Settings   Session            Events
                               │
       ┌───────────────────────┼────────────────────────┐
       │                       │                        │
     Page                   Engines                  History
       │                       │                        │
       │         ┌─────────────┼─────────────┐          │
       │         │             │             │          │
       │       Freeze      Extraction      Cleanup      │
       │                                       │        │
       │                                       ▼        │
       │                                Operations ─────┘
       │
       └───────────────────────────────┐
                                       ▼
                                   Capture
                                       │
                                       ▼
                                   PNG Asset
```

---

# 134. Data Model Invariants

The following rules are mandatory:

```text
1. DOM elements are never persistent entities.
2. ElementReference is the canonical reference to a page element.
3. Element references are session-scoped.
4. Page navigation creates a new session.
5. Cleanup operations are represented as domain operations.
6. Undo/Redo operates on logical operations, not arbitrary DOM snapshots.
7. Bulk cleanup can be represented as one logical history command.
8. Presets are persistent configuration.
9. Session state is not persistent by default.
10. User settings are independent from presets.
11. Capture results are temporary runtime assets.
12. PNG files are not stored in Chrome Storage by default.
13. Domain events originate from their owning engine.
14. UI sends commands and consumes events.
15. Persistent data must be schema-validated.
16. Persistent data must support schema versioning.
17. Imported presets are untrusted data.
18. No preset may contain executable JavaScript.
19. Large binary data must remain outside normal configuration storage.
20. Every cross-context message must use an explicit contract.
21. Session IDs isolate browser tabs.
22. User intent remains distinguishable from automated actions.
23. Data ownership must remain explicit.
24. No engine may silently redefine another engine's domain object.
25. The data model must remain smaller than the engines that consume it.
```

---

# 135. Architectural Decision

NewsClean will use a:

```text
Session-centric runtime model
+
Repository-based persistent model
+
Operation-based history
+
Reference-based DOM model
+
Event-driven engine communication
```

rather than:

```text
full DOM snapshots
+
global mutable state
+
UI-owned data
+
persistent page state
```

This decision is fundamental to keeping the extension lightweight and reliable.

---

# 136. Implementation Boundary

The data model establishes the contracts.

The next implementation layers can now be built against these contracts:

```text
UI
 ↓
Commands
 ↓
Session
 ↓
Engines
 ↓
Domain Models
 ↓
Repositories
 ↓
Chrome APIs
```

The engines should not need to know how the UI renders the data.

The UI should not need to know how an engine implements its algorithms.

---

# 137. Final Data Flow

The complete runtime data flow is:

```text
WEB PAGE
   │
   ▼
PageContext
   │
   ▼
NewsCleanSession
   │
   ├───────────────┐
   ▼               ▼
Freeze          Preset
   │               │
   │               ├── Extraction Hints
   │               ├── Cleanup Rules
   │               └── Capture Defaults
   │
   ▼
ExtractionResult
   │
   ▼
ElementReference
   │
   ▼
CleanupIntent
   │
   ▼
CleanupOperation
   │
   ▼
HistoryCommand
   │
   ▼
CLEAN WORKING DOM
   │
   ▼
CaptureTarget
   │
   ▼
CaptureResult
   │
   ▼
ExportAsset
   │
   ▼
PNG
```

---

# 138. Final Storage Model

The persistent boundary is intentionally small:

```text
Chrome Storage
│
├── newsclean.settings
│
├── newsclean.presets
│
└── newsclean.schemaVersion
```

Everything else is transient unless a future document explicitly introduces persistence.

This keeps NewsClean fundamentally:

```text
LOCAL
FAST
PRIVATE
SESSION-ORIENTED
```

while still allowing reusable site knowledge through the Preset System.

---

# 139. Next Document

`12-MESSAGING.md` — Extension Messaging & Communication Protocol

It will define the communication contracts between:

```text
Content Script
      ↕
Service Worker
      ↕
Extension UI
      ↕
Domain Engines
```

including:

```text
Command envelopes
Event envelopes
Request / response
Correlation IDs
Session isolation
Error propagation
Message validation
Capture communication
Preset communication
Lifecycle events
```
