# NewsClean
## Technical Architecture

**Document ID:** 03-ARCHITECTURE · **Version:** 0.1.0 · **Status:** Foundation · **Related:** `01-PRD.md`, `02-VISION.md`

## Architecture Objective

NewsClean is a Manifest V3 Chrome Extension that creates a temporary, controllable editorial representation of the currently displayed webpage.

Supports: page freezing, DOM inspection, element selection, DOM manipulation, Undo/Redo, article detection, cleanup rules, site presets, high-resolution capture, local persistence, future intelligent processing. Lightweight and modular.

The MVP requires no backend, user accounts, cloud storage, remote APIs, or AI services.

> **Keep webpage manipulation local, isolate browser concerns, and make each editorial capability independently replaceable.**

## High-Level Architecture

`Extension UI → Workflow / Session → Editorial Services → DOM Runtime → Capture Runtime → Chrome Platform`

Layer contents:

- Extension UI — toolbar, inspector, panels, capture UI
- Workflow / Session — state machine, commands, history
- Editorial Services — inspector, cleanup, extraction, presets
- DOM Runtime — selection, mutation, freeze, restore
- Capture Runtime — layout, rendering, PNG export
- Chrome Platform — MV3, tabs, storage, messaging, APIs

The webpage is the external runtime being controlled, not part of the extension architecture.

## Runtime Structure & Ownership

Parts: Service Worker, Content Runtime, UI Runtime, Capture Runtime, Storage.

Ownership: Service Worker → browser-level operations; Content Runtime → webpage state; UI Runtime → interaction state; Storage → persistent configuration; Capture Runtime → output rendering. No subsystem manipulates another's internal state; communication occurs through defined contracts.

Service Worker: extension lifecycle, toolbar activation, tab communication, runtime messaging, storage coordination, capture orchestration where browser APIs are required. Must not directly manipulate the webpage DOM.

## Content Runtime

Injected into the active webpage; owns the working DOM. Components: Page Session, Freeze Engine, DOM Inspector, Selection Engine, Mutation Engine, Cleanup Engine, Extraction Engine, History Engine, Overlay Runtime.

The most sensitive subsystem (runs inside arbitrary third-party pages) — avoid unnecessary global pollution.

## UI Runtime & Overlay

Operator-facing controls: Toolbar, Inspector Panel, Element Action Menu, Cleanup Panel, Preset Manager, Capture Panel, Status Indicator.

Isolate the UI from the target page as much as technically practical via a Shadow DOM-based overlay; do not inject ordinary UI elements into the page without isolation.

```text
document
├── Website DOM
└── NewsClean Root  (#__newsclean__)
    └── Shadow Root
        ├── Toolbar
        ├── Inspector UI
        ├── Action Menu
        └── Status UI
```

- Overlay root uses unique id `#__newsclean__` and a high stacking context.
- The Shadow Root blocks website CSS from affecting NewsClean controls; NewsClean CSS must not leak into the site.
- Never accidentally select or modify NewsClean's own UI during DOM inspection.

## Communication

Two domains bridged by Chrome runtime messaging: browser (`Service Worker ↔ Chrome APIs`) and page (`Content Runtime ↔ DOM`). Flow: `UI → Content Runtime → Service Worker → Chrome API`.

Typed, explicit messages as discriminated unions:

```text
Message = START_SESSION | FREEZE_PAGE | UNFREEZE_PAGE | SELECT_ELEMENT | APPLY_CLEANUP
        | UNDO | REDO | APPLY_PRESET | CAPTURE | EXPORT
```

Each message defines `type`, `payload`, and `requestId` where request/response semantics are required. Avoid generic untyped messages like `{ action: "doSomething" }`.

```json
{
  "type": "CAPTURE_REQUEST",
  "sessionId": "session-001",
  "mode": "FULL_ARTICLE"
}
```

## Session

Every active cleaning operation is represented by a session.

```text
NewsCleanSession { sessionId, tabId, url, hostname, state, freezeState,
                   selectionState, mutationHistory, cleanupRules,
                   extractionResult, captureState }
```

Sessions are temporary; a new page load creates a new session.

### State Machine

Explicit state, not boolean flags: avoid `isFrozen` / `isInspecting` / `isCapturing` / `isComposing` (contradictory states can occur). Prefer `state = "FROZEN"`.

Core states: `IDLE → ACTIVE → FROZEN → INSPECTING → CLEANING → COMPOSING → CAPTURING → EXPORTED` (plus `ERROR`). The session may return to earlier operational states (e.g. `COMPOSING → CLEANING`); invalid transitions are rejected.

## Page State vs UI State

Must remain separate; the UI is never the source of truth for DOM state.

- **Page state:** DOM modifications, freeze state, selected elements, hidden/removed elements, article container, cleanup rules.
- **UI state:** current panel, cursor mode, selected action, open menus, toolbar state, notification state.

Separation enables UI redesign, multiple UI surfaces, keyboard control, and future popup/panel interfaces without rewriting the page engine.

## DOM Runtime

Controlled interface to the webpage, hiding browser-specific manipulation details from higher layers. Components: ElementRegistry, SelectorEngine, MutationEngine, VisibilityEngine, RestoreEngine, PageSnapshot.

E.g. the Cleanup Engine calls `remove(element)` without knowing whether it uses `element.remove()` or another mechanism.

## Element Registry

Selected and manipulated elements use internal references, not reliance on DOM node identity.

```json
{
  "elementId": "el_001",
  "tagName": "ARTICLE",
  "id": "article",
  "classes": ["article", "news-item"],
  "selector": "article.news-item",
  "parentElementId": "el_000"
}
```

DOM nodes can disappear and be recreated; an internal element ID is not a permanent browser DOM identity.

## Selector Engine

Selector priority: `Stable ID → Stable unique class → Semantic attribute → Tag + stable attributes → Structural selector`.

Single-element selectors must verify `querySelectorAll(selector).length === 1`; reusable cleanup rules require no uniqueness.

## Mutation Engine

All DOM mutations pass through the central Mutation Engine — without centralization, components could manipulate the DOM independently and break Undo/Redo.

`Inspector / Cleanup / Preset / Keep Mode / Smart Cleanup → Mutation Engine → DOM`

Operations: `REMOVE`, `HIDE`, `RESTORE`, `REPLACE`, `ADD_MARKER`, `REMOVE_MARKER`. Higher-level services must not mutate the DOM directly. The Mutation Engine is the single point for history recording, restoration, validation, and mutation metadata.

## Command Architecture

Undo/Redo is command-driven.

```text
Command { id, type, execute(), undo(), metadata }
```

Examples: `RemoveElementCommand`, `HideElementCommand`, `RestoreElementCommand`, `ApplySelectorCommand`.

- The History Engine keeps `undoStack` / `redoStack`; a new command clears the redo stack.
- Implementations may use immutable state records or DOM restoration snapshots.
- **Every reversible DOM mutation must have a corresponding restoration strategy.**

## DOM Restoration Strategy

Storing arbitrary DOM nodes is insufficient for reliable undo. A removal command retains: parent reference, sibling position, serialized element, original attributes, original state. Restoration preserves the original position whenever possible.

## Freeze Engine

Owns page stabilization, not cleanup; its responsibility ends at `Dynamic Page → Stable Working Page`. Detailed design: `04-FREEZE-ENGINE.md`.

Strategies: `SOFT_FREEZE` (default), `HARD_FREEZE`. Stable interface — `freeze(mode)`, `unfreeze()`, `getState()` — internals can evolve without affecting the rest of the app.

## Inspector

Components: Hit Testing, Highlight Renderer, Element Metadata, Selector Generator, Action Dispatcher. Identifies elements by pointer coordinates; must not modify the page while hovering.

`pointermove → elementFromPoint() → ignore NewsClean UI → resolve target → render highlight`

## Highlight Renderer

The selection overlay stays separate from the selected element — no permanent CSS borders on arbitrary webpage elements.

`Web Element → measured rectangle → NewsClean Overlay`

Prevents layout changes. Highlights show: bounding rectangle, tag name, ID, classes, dimensions.

## Cleanup Engine

Interprets editorial cleanup operations: manual cleanup, rule-based cleanup, smart cleanup proposals, preset application, Keep Mode. Does not manage the visual inspector.

`UI → Cleanup Engine → Mutation Engine → DOM`

## Keep Mode

High-level cleanup operation.

`Keep target → determine protected subtree → identify external content → generate cleanup proposal → apply mutations`

Do not destroy the whole page at once; first produce a deterministic candidate set, keeping Keep Mode compatible with Undo/Redo.

## Smart Cleanup

Produces proposals rather than mutating the page directly.

`DOM → Analyzer → Candidates → Classification → Cleanup Proposal → User Review → Mutation Engine`

```json
{
  "category": "advertisement",
  "selector": ".ad-container",
  "confidence": 0.96,
  "action": "REMOVE"
}
```

The MVP may use deterministic heuristics; AI stays an optional future analyzer.

## Extraction Engine

Identifies editorial structures: Article, Title, Image, Author, Date, Source, Body.

`DOM → Content Analyzer → Extraction Result`

Extraction is read-only: it observes and reports; the Cleanup Engine decides what to modify via the Cleanup/Mutation pipeline.

```json
{
  "article": { "selector": "article", "confidence": 0.94 },
  "title": { "selector": "h1", "confidence": 0.99 },
  "heroImage": { "selector": "article img", "confidence": 0.87 },
  "body": { "selector": ".article-body", "confidence": 0.91 }
}
```

Confidence values are advisory; they never auto-trigger destructive operations in the MVP.

## Preset Engine

Persistent cleanup definitions.

`Preset Manager → Preset Repository → chrome.storage.local`

A preset contains: Identity, Hostname, Version, Remove Rules, Hide Rules, Keep Rules, Optional Capture Configuration. No session-specific DOM state.

Application: `Load Preset → Validate Rules → Resolve Selectors → Generate Operations → Preview / Apply → Mutation Engine`. Unmatched selectors are reported as `Rule unmatched`, not fatal.

## Storage

Chrome local storage: `settings`, `presets`, `metadata`. Session state stays in memory; persistent storage holds configuration, not temporary DOM state.

Persistent data must be: small, versioned, serializable, validatable, migratable. Do not persist entire webpages or arbitrary HTML snapshots unless a future feature explicitly requires it.

## Capture

Separated from cleanup.

`Clean Page → Capture Planner → Capture Region → Render → Encode PNG → Export`

Modes: Viewport, Full Page, Article, Selection, Composition. No single Chrome screenshot API is assumed for all modes.

| Mode | Strategy |
|------|----------|
| Visible capture | Browser screenshot API |
| Selection capture | Calculated viewport/region |
| Full article capture | Page measurement + controlled rendering |
| Composition capture | Dedicated composition renderer |

Details: `08-CAPTURE-ENGINE.md`.

### High-Resolution Rendering

Separate CSS dimensions from output pixels; the renderer explicitly computes the required scale (CSS `1920 × 1080` → Output `3840 × 2160`). Viewport size ≠ output resolution.

### Page Measurement

Deterministic geometry: document width/height, viewport width/height, devicePixelRatio, target rectangle. Measured after the page reaches a stable capture state.

### Capture Isolation

NewsClean UI must never appear in the exported image.

`Hide NewsClean Overlay → Capture → Restore Overlay`

Transactional — restore the UI if capture fails.

## Error Boundaries

Per-subsystem error boundaries: Freeze, Inspector, Cleanup, Extraction, Preset, Capture, Storage. One subsystem's failure must not necessarily terminate the session (e.g. extraction failure does not block manual cleanup).

## Security

All external page data is untrusted. Avoid: `eval()`, `new Function()`, unsafe HTML injection, untrusted template execution. Website DOM content is never treated as executable extension code.

MV3 restrictions are architectural constraints, not obstacles. No remote code execution; self-contained bundle with locally bundled dependencies.

## Permissions

Minimal: `Minimal Permissions + Active Tab Access + Local Storage`. Exact manifest permissions are defined during implementation. Additional permissions require a documented reason.

## Performance

The Content Runtime operates on potentially large pages; control expensive operations.

- Use `elementFromPoint()` for fast hit testing — no full DOM traversal during `pointermove`.
- Defer expensive metadata analysis until after selection.

### Mutation Performance

- Batch related operations where possible.
- Avoid unnecessary layout reads/writes and forced synchronous layout.
- Avoid repeated full-document queries; cache selector results where safe.
- Recalculate geometry only when required.

## Dependency Rules

Direction: `UI → Workflow → Services → DOM Runtime → Browser / Page`.

Allowed: `UI → Workflow`, `Workflow → Services`, `Services → DOM Runtime`, `Services → Storage Interfaces`, `Capture → Session / DOM Measurements`, `Service Worker → Browser APIs`.

Avoid: `DOM Runtime → React`, `DOM Runtime → UI Components`, `Extraction → Mutation`, `Preset Repository → DOM`, `Storage → DOM Nodes`.

## Project Structure

```text
newsclean/
├── src/
│   ├── background/            → service-worker.ts
│   ├── content/               → index.ts, session/, freeze/, inspector/, selection/,
│   │                             mutation/, cleanup/, extraction/, overlay/
│   ├── ui/                    → toolbar/, inspector/, cleanup/, presets/, capture/
│   ├── capture/               → planner/, renderer/, encoder/
│   ├── presets/               → repository/, schema/, validator/
│   ├── shared/                → types/, messages/, constants/, utilities/
│   └── storage/               → repository/, migrations/
├── public/                    → manifest.json
├── tests/                     → unit/, integration/, e2e/
└── docs/
```

Initial proposal, refinable during implementation without violating the subsystem boundaries.

## Technology Stack

`TypeScript`, `React`, `Manifest V3`, `Chrome Extension APIs`, `Shadow DOM`, `CSS`, `Vite`.

Mandatory: `React → NewsClean UI`, `DOM Runtime → Website DOM`. The DOM layer stays framework-independent; React must not own the target page (never mount React into the article); the interface is isolated via its own root and Shadow DOM.

## Type System

TypeScript throughout. Explicit types for core contracts: `Session`, `ElementReference`, `SelectorRule`, `CleanupOperation`, `CleanupProposal`, `Preset`, `CaptureRequest`, `CaptureResult`, `ExtensionMessage`. No untyped message payloads, no `any` in core architecture.

## Events & Observability

Internal events for loose coordination: `SESSION_STARTED`, `FREEZE_STARTED`, `FREEZE_COMPLETED`, `ELEMENT_SELECTED`, `ELEMENT_REMOVED`, `CLEANUP_PROPOSED`, `PRESET_APPLIED`, `CAPTURE_STARTED`, `CAPTURE_COMPLETED`, `ERROR_OCCURRED`. Events must not replace explicit commands where deterministic execution is required.

Debug mode exposes: session state, freeze state, selected element, selector, mutation count, undo stack size, capture state. Hidden in production; no unnecessary logging of webpage content.

## Testing

- **Unit:** selector generation, preset validation, state transitions, command history, cleanup classification, data contracts.
- **Integration:** DOM mutation, Undo/Redo, freeze behavior, preset application, extraction.
- **E2E:** real representative webpages — `Open → Activate → Freeze → Select → Delete → Undo → Capture`.

## Real-World Compatibility

Assume: invalid HTML, Shadow DOM, iframes, cross-origin frames, React/Vue/Angular applications, dynamic DOM replacement, virtualized content, lazy loading, infinite scrolling, CSP restrictions, aggressive JavaScript, anti-automation behavior. The MVP need not support every case perfectly — it must fail gracefully.

- **iframes:** cross-origin frames are a hard browser boundary; distinguish accessible frames from cross-origin ones. For cross-origin frames, treat the `<iframe>` itself as the selectable element (deletable/hidable) without inspecting its internals.
- **Shadow DOM:** detect Shadow DOM boundaries; MVP support may be limited, but never present inaccessible internal nodes as normal DOM descendants. Expandable later.
- **Dynamic DOM:** references cannot rely on object identity; re-resolve via `Selector + Structural Context + Optional Metadata` — especially after applying presets.

## MVP Boundary

The MVP ends at: `Page Control`, `DOM Inspection`, `Cleanup`, `Extraction`, `Presets`, `PNG Capture` (within Chrome). Beyond is future scope, preventing premature architectural expansion.

- **No backend:** chosen for privacy, simplicity, speed, lower operational cost, easier deployment, no authentication, no data synchronization. Revisit only if a future requirement demonstrates a real need.
- **Local presets:** stored locally in the first version (fast, private, offline-capable, simple); a future shared preset system can be added without changing the Preset Engine API.
- **No AI dependency:** an Analyzer boundary lets a heuristic analyzer (today) and an AI analyzer (future) produce the same Analysis Result.

## Architectural Invariants

1. No backend is required for MVP.
2. Core webpage processing is local.
3. React does not own the target webpage.
4. DOM mutations pass through Mutation Engine.
5. Extraction does not mutate the DOM.
6. Undo/Redo is command-driven.
7. Presets contain rules, not DOM nodes.
8. UI state is separate from page state.
9. Service Worker does not directly manipulate the DOM.
10. Capture must exclude NewsClean UI.
11. AI is optional and replaceable.
12. Browser permissions remain minimal.
13. Original webpages are never permanently modified.
14. Every destructive MVP operation has a restoration path.
15. Subsystems communicate through explicit contracts.
