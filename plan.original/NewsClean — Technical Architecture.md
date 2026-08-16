# NewsClean
## Technical Architecture

**Document ID:** 03-ARCHITECTURE  
**Version:** 0.1.0  
**Status:** Foundation  
**Related Documents:** `01-PRD.md`, `02-VISION.md`

---

## 1. Architecture Objective

NewsClean is a Manifest V3 Chrome Extension whose primary responsibility is to create a temporary, controllable editorial representation of the currently displayed webpage.

The architecture must support:

- Page freezing
- DOM inspection
- Element selection
- DOM manipulation
- Undo/Redo
- Article detection
- Cleanup rules
- Site presets
- High-resolution capture
- Local persistence
- Future intelligent processing

The architecture must remain lightweight and modular.

The MVP must not require:

- Backend services
- User accounts
- Cloud storage
- Remote APIs
- AI services

The architectural principle is:

> **Keep webpage manipulation local, isolate browser concerns, and make each editorial capability independently replaceable.**

---

## 2. High-Level Architecture

The system is divided into six primary layers:

```text
┌──────────────────────────────────────────────┐
│                 Extension UI                 │
│ Toolbar / Inspector / Panels / Capture UI   │
├──────────────────────────────────────────────┤
│              Workflow / Session              │
│ State Machine / Commands / History          │
├──────────────────────────────────────────────┤
│             Editorial Services               │
│ Inspector / Cleanup / Extraction / Presets  │
├──────────────────────────────────────────────┤
│                DOM Runtime                   │
│ Selection / Mutation / Freeze / Restore     │
├──────────────────────────────────────────────┤
│              Capture Runtime                 │
│ Layout / Rendering / PNG Export             │
├──────────────────────────────────────────────┤
│             Chrome Platform                  │
│ MV3 / Tabs / Storage / Messaging / APIs    │
└──────────────────────────────────────────────┘
```

The webpage itself is not considered part of the extension architecture.

It is the external runtime being controlled.

---

## 3. Chrome Extension Architecture

NewsClean uses Manifest V3.

The extension consists of:

```text
Extension
│
├── Service Worker
│
├── Content Runtime
│
├── UI Runtime
│
├── Capture Runtime
│
└── Storage
```

### Service Worker

Responsible for browser-level orchestration.

Primary responsibilities:

- Extension lifecycle
- Toolbar activation
- Tab communication
- Runtime messaging
- Storage coordination
- Capture orchestration where browser APIs are required

The Service Worker must not directly manipulate the webpage DOM.

---

## 4. Content Runtime

The Content Runtime is injected into the active webpage.

It owns the working DOM.

Conceptually:

```text
Content Runtime
│
├── Page Session
├── Freeze Engine
├── DOM Inspector
├── Selection Engine
├── Mutation Engine
├── Cleanup Engine
├── Extraction Engine
├── History Engine
└── Overlay Runtime
```

The Content Runtime is the most sensitive subsystem because it executes inside arbitrary third-party webpages.

It must therefore avoid unnecessary global pollution.

---

## 5. UI Runtime

The UI Runtime provides the operator-facing controls.

It consists conceptually of:

```text
UI Runtime
│
├── Toolbar
├── Inspector Panel
├── Element Action Menu
├── Cleanup Panel
├── Preset Manager
├── Capture Panel
└── Status Indicator
```

The UI must be isolated from the target page as much as technically practical.

The recommended implementation is a Shadow DOM-based overlay.

---

## 6. Overlay Architecture

The extension should not inject ordinary UI elements into the page without isolation.

Recommended structure:

```text
document
│
├── Website DOM
│
└── NewsClean Root
    │
    └── Shadow Root
        ├── Toolbar
        ├── Inspector UI
        ├── Action Menu
        └── Status UI
```

The Shadow Root prevents most website CSS from affecting NewsClean controls.

Likewise, NewsClean CSS should not leak into the website.

The overlay root should use a unique identifier and a high stacking context.

Example conceptual root:

```text
#__newsclean__
```

The implementation must ensure that the extension never accidentally selects or modifies its own UI during DOM inspection.

---

## 7. Communication Architecture

The extension has two communication domains.

### Browser Domain

```text
Service Worker
      ↕
Chrome APIs
```

### Page Domain

```text
Content Runtime
      ↕
DOM
```

The bridge between them is Chrome runtime messaging.

Conceptually:

```text
UI
 │
 ▼
Content Runtime
 │
 ▼
Service Worker
 │
 ▼
Chrome API
```

Messages should be typed and explicit.

Example conceptual message:

```json
{
  "type": "CAPTURE_REQUEST",
  "sessionId": "session-001",
  "mode": "FULL_ARTICLE"
}
```

The system must avoid generic untyped messages such as:

```text
{ action: "doSomething" }
```

---

## 8. Runtime Ownership

A clear ownership model is required.

```text
Service Worker
→ browser-level operations

Content Runtime
→ webpage state

UI Runtime
→ interaction state

Storage
→ persistent configuration

Capture Runtime
→ output rendering
```

No subsystem should directly manipulate another subsystem's internal state.

Communication must occur through defined contracts.

---

## 9. Session Architecture

Every active cleaning operation is represented by a session.

Conceptually:

```text
NewsCleanSession
│
├── sessionId
├── tabId
├── url
├── hostname
├── state
├── freezeState
├── selectionState
├── mutationHistory
├── cleanupRules
├── extractionResult
└── captureState
```

The session is temporary.

It exists while the operator is working on the page.

A new page load creates a new session.

---

## 10. Session Lifecycle

The lifecycle is:

```text
CREATED
   ↓
ACTIVE
   ↓
FROZEN
   ↓
INSPECTING
   ↓
CLEANING
   ↓
COMPOSING
   ↓
CAPTURING
   ↓
EXPORTED
```

The session may return to earlier operational states.

For example:

```text
CLEANING
   ↓
INSPECTING
   ↓
CLEANING
```

or:

```text
COMPOSING
   ↓
CLEANING
```

Invalid transitions must be rejected.

---

## 11. State Machine

The state machine should be explicit rather than inferred from multiple boolean variables.

Avoid:

```text
isFrozen
isInspecting
isCapturing
isComposing
```

because contradictory states can occur.

Prefer:

```text
state = "FROZEN"
```

with additional subsystem-specific state where necessary.

Core states:

```text
IDLE
ACTIVE
FROZEN
INSPECTING
CLEANING
COMPOSING
CAPTURING
EXPORTED
ERROR
```

---

## 12. Page State vs UI State

These must remain separate.

### Page State

Represents:

- DOM modifications
- Freeze state
- Selected elements
- Hidden elements
- Removed elements
- Article container
- Cleanup rules

### UI State

Represents:

- Current panel
- Cursor mode
- Selected action
- Open menus
- Toolbar state
- Notification state

The UI must never become the source of truth for DOM state.

---

## 13. DOM Runtime

The DOM Runtime provides a controlled interface to the webpage.

Conceptually:

```text
DOM Runtime
│
├── ElementRegistry
├── SelectorEngine
├── MutationEngine
├── VisibilityEngine
├── RestoreEngine
└── PageSnapshot
```

The DOM Runtime should hide browser-specific manipulation details from higher layers.

For example, Cleanup Engine should be able to request:

```text
remove(element)
```

without knowing whether the implementation uses:

```text
element.remove()
```

or another controlled mechanism.

---

## 14. Element Registry

Selected and manipulated elements should be represented through internal references rather than relying exclusively on DOM nodes.

A conceptual element record:

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

The registry must account for the fact that DOM nodes can disappear and be recreated.

Therefore, an internal element ID must not be assumed to be a permanent browser DOM identity.

---

## 15. Selector Engine

The Selector Engine converts a DOM element into a usable selector representation.

Priority:

```text
Stable ID
   ↓
Stable unique class
   ↓
Semantic attribute
   ↓
Tag + stable attributes
   ↓
Structural selector
```

The selector generator should verify uniqueness:

```text
querySelectorAll(selector).length === 1
```

when generating a single-element selector.

For reusable cleanup rules, uniqueness is not required.

---

## 16. Mutation Engine

All DOM modifications should pass through a central Mutation Engine.

Operations:

```text
REMOVE
HIDE
RESTORE
REPLACE
ADD_MARKER
REMOVE_MARKER
```

Higher-level services must not perform uncontrolled DOM mutations.

Example:

```text
Cleanup Engine
      ↓
Mutation Engine
      ↓
DOM
```

This creates a single point for:

- History recording
- Restoration
- Validation
- Mutation metadata

---

## 17. Command Architecture

Undo/Redo should use command-based operations.

Conceptually:

```text
Command
├── execute()
├── undo()
└── metadata
```

Example:

```text
RemoveElementCommand
HideElementCommand
RestoreElementCommand
ApplySelectorCommand
```

The History Engine maintains:

```text
undoStack
redoStack
```

A new command clears the redo stack.

---

## 18. DOM Restoration Strategy

Directly storing arbitrary DOM nodes is insufficient for reliable undo.

The architecture should therefore preserve restoration information.

For a removed element, the command may retain:

```text
Parent reference
Sibling position
Serialized element
Original attributes
Original state
```

Conceptually:

```text
Parent
  │
  ├── A
  ├── B ← removed
  └── C
```

Undo must restore:

```text
Parent
  │
  ├── A
  ├── B ← restored
  └── C
```

The restoration mechanism must preserve the original position whenever possible.

---

## 19. Freeze Engine Boundary

The Freeze Engine owns page stabilization.

It must not become responsible for cleanup.

Its responsibility ends at:

```text
Dynamic Page
     ↓
Stable Working Page
```

The detailed design belongs to:

`04-FREEZE-ENGINE.md`

The architecture must allow Freeze Engine strategies to evolve independently.

---

## 20. Freeze Strategy

The architecture supports at least two strategies:

```text
SOFT_FREEZE
HARD_FREEZE
```

Soft Freeze is the default.

The Freeze Engine should expose a stable interface:

```text
freeze(mode)
unfreeze()
getState()
```

The internal mechanism can evolve without changing the rest of the application.

---

## 21. Inspector Architecture

The DOM Inspector consists of:

```text
Inspector
│
├── Hit Testing
├── Highlight Renderer
├── Element Metadata
├── Selector Generator
└── Action Dispatcher
```

The inspector should identify elements based on pointer coordinates.

Conceptually:

```text
pointermove
    ↓
elementFromPoint()
    ↓
ignore NewsClean UI
    ↓
resolve target
    ↓
render highlight
```

The inspector must not modify the page merely by hovering.

---

## 22. Highlight Renderer

The selection overlay must be separate from the selected DOM element.

Do not add permanent CSS borders to arbitrary webpage elements merely to visualize them.

Instead:

```text
Web Element
     │
     └── measured rectangle
             ↓
      NewsClean Overlay
```

This prevents page layout changes.

The highlight system should display:

- Bounding rectangle
- Tag name
- ID
- Classes
- Dimensions

---

## 23. Cleanup Engine

The Cleanup Engine interprets editorial cleanup operations.

Its responsibilities include:

```text
Manual cleanup
Rule-based cleanup
Smart cleanup proposals
Preset application
Keep Mode
```

It should not directly manage the visual inspector.

Architecture:

```text
UI
 ↓
Cleanup Engine
 ↓
Mutation Engine
 ↓
DOM
```

---

## 24. Keep Mode Architecture

Keep Mode should be implemented as a high-level cleanup operation.

Conceptually:

```text
Keep target
     ↓
Determine protected subtree
     ↓
Identify external content
     ↓
Generate cleanup proposal
     ↓
Apply mutations
```

The system must not immediately destroy the entire page.

It should first produce a deterministic set of candidates.

This makes Keep Mode compatible with Undo/Redo.

---

## 25. Smart Cleanup Architecture

Smart Cleanup should produce proposals rather than directly mutating the page.

Pipeline:

```text
DOM
 ↓
Analyzer
 ↓
Candidates
 ↓
Classification
 ↓
Cleanup Proposal
 ↓
User Review
 ↓
Mutation Engine
```

A proposal may look conceptually like:

```json
{
  "category": "advertisement",
  "selector": ".ad-container",
  "confidence": 0.96,
  "action": "REMOVE"
}
```

The MVP may use deterministic heuristics.

AI should remain an optional future analyzer.

---

## 26. Extraction Engine

The Extraction Engine identifies editorial structures.

Potential outputs:

```text
Article
Title
Image
Author
Date
Source
Body
```

Architecture:

```text
DOM
 ↓
Content Analyzer
 ↓
Extraction Result
```

Extraction must not directly mutate the DOM.

This is critical.

The Extraction Engine observes and reports.

The Cleanup Engine decides what to modify.

---

## 27. Extraction Result

A conceptual result:

```json
{
  "article": {
    "selector": "article",
    "confidence": 0.94
  },
  "title": {
    "selector": "h1",
    "confidence": 0.99
  },
  "heroImage": {
    "selector": "article img",
    "confidence": 0.87
  },
  "body": {
    "selector": ".article-body",
    "confidence": 0.91
  }
}
```

Confidence values should be treated as advisory.

They must not automatically trigger destructive operations in the MVP.

---

## 28. Preset Engine

Presets are persistent cleanup definitions.

Architecture:

```text
Preset Manager
      ↓
Preset Repository
      ↓
chrome.storage.local
```

A preset should contain:

```text
Identity
Hostname
Version
Remove Rules
Hide Rules
Keep Rules
Optional Capture Configuration
```

The Preset Engine must not store session-specific DOM state.

---

## 29. Preset Application

Preset application follows:

```text
Load Preset
    ↓
Validate Rules
    ↓
Resolve Selectors
    ↓
Generate Operations
    ↓
Preview / Apply
    ↓
Mutation Engine
```

Selectors that no longer match must not cause a fatal error.

They should be reported as:

```text
Rule unmatched
```

---

## 30. Storage Architecture

The MVP uses Chrome local storage.

Conceptually:

```text
chrome.storage.local
│
├── settings
├── presets
└── metadata
```

Session state should generally remain in memory.

Persistent storage should contain configuration rather than temporary DOM state.

---

## 31. Storage Principles

Persistent data must be:

- Small
- Versioned
- Serializable
- Validatable
- Migratable

Do not persist entire webpages.

Do not store arbitrary HTML snapshots unless a future feature explicitly requires it.

---

## 32. Capture Architecture

Capture is intentionally separated from cleanup.

The capture pipeline is:

```text
Clean Page
    ↓
Capture Planner
    ↓
Capture Region
    ↓
Render
    ↓
Encode PNG
    ↓
Export
```

The capture system must understand:

```text
Viewport
Full Page
Article
Selection
Composition
```

---

## 33. Capture Runtime

The architecture should not assume that a single Chrome screenshot API is sufficient for every capture mode.

Different capture modes may require different strategies.

For example:

```text
Visible Capture
→ Browser screenshot API

Selection Capture
→ Calculated viewport/region

Full Article Capture
→ Page measurement + controlled rendering

Composition Capture
→ Dedicated composition renderer
```

The exact implementation belongs to `08-CAPTURE-ENGINE.md`.

---

## 34. High-Resolution Rendering

The capture system should separate:

```text
CSS Dimensions
```

from:

```text
Output Pixel Dimensions
```

Example:

```text
CSS:
1920 × 1080

Output:
3840 × 2160
```

The renderer should explicitly calculate the required scale.

This avoids treating browser viewport size as synonymous with final output resolution.

---

## 35. Page Measurement

Capture requires deterministic page geometry.

The system should collect:

```text
document width
document height
viewport width
viewport height
devicePixelRatio
target rectangle
```

Measurement must happen after the page has entered a stable capture state.

---

## 36. Capture Isolation

NewsClean UI must never appear in the exported image.

Before capture:

```text
Hide NewsClean Overlay
       ↓
Capture
       ↓
Restore Overlay
```

The operation should be transactional from the user's perspective.

If capture fails, the UI must be restored.

---

## 37. Error Boundary Architecture

Each major subsystem should have an explicit error boundary.

```text
Freeze Error
Inspector Error
Cleanup Error
Extraction Error
Preset Error
Capture Error
Storage Error
```

A failure in one subsystem must not necessarily terminate the session.

For example:

```text
Extraction failed
```

must not prevent:

```text
Manual cleanup
```

---

## 38. Security Architecture

The extension operates on arbitrary webpages.

Therefore all external page data must be considered untrusted.

The architecture must avoid:

```text
eval()
new Function()
unsafe HTML injection
untrusted template execution
```

wherever possible.

DOM content from websites must not be treated as executable extension code.

---

## 39. Content Security

Manifest V3 restrictions should be treated as architectural constraints, not obstacles to bypass.

The extension should avoid remote code execution and maintain a self-contained bundle.

Dependencies should be bundled locally.

---

## 40. Permission Strategy

Permissions should remain minimal.

The exact manifest permissions will be defined during implementation.

The architectural target is:

```text
Minimal Permissions
+
Active Tab Access
+
Local Storage
```

Additional permissions must have a documented reason.

---

## 41. Performance Architecture

The Content Runtime operates directly on potentially large webpages.

Therefore expensive operations must be controlled.

Avoid continuous:

```text
full DOM traversal
```

during:

```text
pointermove
```

The inspector should use:

```text
elementFromPoint()
```

for fast hit testing.

More expensive metadata analysis should occur only after selection.

---

## 42. Mutation Performance

Cleanup operations may affect large DOM trees.

The Mutation Engine should:

- Batch related operations where possible.
- Avoid unnecessary layout reads/writes.
- Avoid repeated full-document queries.
- Cache selector results where safe.
- Recalculate geometry only when required.

The architecture should minimize forced synchronous layout.

---

## 43. Runtime Boundaries

The system should have the following dependency direction:

```text
UI
 ↓
Workflow
 ↓
Services
 ↓
DOM Runtime
 ↓
Browser / Page
```

Not:

```text
DOM
→ UI
→ Preset
→ Storage
→ Service Worker
```

The dependency graph should remain directional.

---

## 44. Recommended Project Structure

A recommended source structure:

```text
newsclean/
│
├── src/
│   │
│   ├── background/
│   │   └── service-worker.ts
│   │
│   ├── content/
│   │   ├── index.ts
│   │   ├── session/
│   │   ├── freeze/
│   │   ├── inspector/
│   │   ├── selection/
│   │   ├── mutation/
│   │   ├── cleanup/
│   │   ├── extraction/
│   │   └── overlay/
│   │
│   ├── ui/
│   │   ├── toolbar/
│   │   ├── inspector/
│   │   ├── cleanup/
│   │   ├── presets/
│   │   └── capture/
│   │
│   ├── capture/
│   │   ├── planner/
│   │   ├── renderer/
│   │   └── encoder/
│   │
│   ├── presets/
│   │   ├── repository/
│   │   ├── schema/
│   │   └── validator/
│   │
│   ├── shared/
│   │   ├── types/
│   │   ├── messages/
│   │   ├── constants/
│   │   └── utilities/
│   │
│   └── storage/
│       ├── repository/
│       └── migrations/
│
├── public/
│   └── manifest.json
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── docs/
```

This is an initial architectural proposal and may be refined during implementation without violating the subsystem boundaries defined here.

---

## 45. Technology Direction

Recommended MVP stack:

```text
TypeScript
React
Manifest V3
Chrome Extension APIs
Shadow DOM
CSS
Vite
```

The DOM manipulation layer should remain framework-independent.

React should not own the target webpage.

React is appropriate for NewsClean's own interface.

---

## 46. Framework Boundary

The following distinction is mandatory:

```text
React
→ NewsClean UI

DOM Runtime
→ Website DOM
```

Do not mount React into the article itself.

The extension's interface should be isolated through its own root and Shadow DOM.

---

## 47. Type System

TypeScript should be used throughout the application.

Core contracts should have explicit types.

Examples:

```text
Session
ElementReference
SelectorRule
CleanupOperation
CleanupProposal
Preset
CaptureRequest
CaptureResult
ExtensionMessage
```

Avoid untyped message payloads.

Avoid `any` in core architecture.

---

## 48. Command Contract

Conceptual contract:

```text
Command {
    id
    type
    execute()
    undo()
}
```

The actual implementation may use immutable state records or DOM restoration snapshots as appropriate.

The important architectural rule is:

> **Every reversible DOM mutation must have a corresponding restoration strategy.**

---

## 49. Message Contract

Messages should be discriminated unions.

Conceptually:

```text
Message =
    | START_SESSION
    | FREEZE_PAGE
    | UNFREEZE_PAGE
    | SELECT_ELEMENT
    | APPLY_CLEANUP
    | UNDO
    | REDO
    | APPLY_PRESET
    | CAPTURE
    | EXPORT
```

Each message must define:

```text
type
payload
requestId
```

where request/response semantics are required.

---

## 50. Event Architecture

Internal events may be used for loose coordination.

Examples:

```text
SESSION_STARTED
FREEZE_STARTED
FREEZE_COMPLETED
ELEMENT_SELECTED
ELEMENT_REMOVED
CLEANUP_PROPOSED
PRESET_APPLIED
CAPTURE_STARTED
CAPTURE_COMPLETED
ERROR_OCCURRED
```

Events must not replace explicit commands when an operation requires deterministic execution.

---

## 51. Observability

The MVP should include development diagnostics.

A debug mode may expose:

```text
Session State
Freeze State
Selected Element
Selector
Mutation Count
Undo Stack Size
Capture State
```

Production mode should keep diagnostics hidden.

No webpage content should be logged unnecessarily.

---

## 52. Testing Architecture

Testing is divided into:

```text
Unit
Integration
E2E
```

### Unit

Test:

- Selector generation
- Preset validation
- State transitions
- Command history
- Cleanup classification
- Data contracts

### Integration

Test:

- DOM mutation
- Undo/Redo
- Freeze behavior
- Preset application
- Extraction

### E2E

Test against real representative webpages.

Scenarios:

```text
Open
→ Activate
→ Freeze
→ Select
→ Delete
→ Undo
→ Capture
```

---

## 53. Real-World Compatibility

Websites are not controlled environments.

The architecture must assume:

- Invalid HTML
- Shadow DOM
- Iframes
- Cross-origin frames
- React/Vue/Angular applications
- Dynamic DOM replacement
- Virtualized content
- Lazy loading
- Infinite scrolling
- CSP restrictions
- Aggressive JavaScript
- Anti-automation behavior

The MVP does not need perfect support for all cases.

It must fail gracefully.

---

## 54. iframe Strategy

Cross-origin iframes represent a hard browser boundary.

NewsClean should not assume that it can inspect or modify their internal DOM.

The system should distinguish:

```text
Same-Origin / Accessible Frame
```

from:

```text
Cross-Origin Frame
```

For cross-origin frames, the MVP may treat the iframe itself as the selectable element.

Example:

```text
<iframe>
```

can be deleted or hidden without inspecting its internal contents.

---

## 55. Shadow DOM Strategy

The Inspector should detect when an element belongs to a Shadow DOM boundary.

MVP support may be limited.

The system should nevertheless avoid incorrectly presenting inaccessible internal nodes as normal DOM descendants.

Shadow DOM support can be expanded later.

---

## 56. Dynamic DOM Strategy

Some websites continually replace nodes.

Therefore element references cannot rely solely on object identity.

The system should be able to re-resolve an element using:

```text
Selector
+
Structural Context
+
Optional Metadata
```

when appropriate.

This becomes particularly important after applying presets.

---

## 57. Architectural Decision: No Backend

The MVP explicitly chooses:

```text
No Backend
```

Reasons:

- Privacy
- Simplicity
- Speed
- Lower operational cost
- Easier deployment
- No authentication
- No data synchronization requirements

This decision can be revisited only if future requirements demonstrate a real need.

---

## 58. Architectural Decision: Local Presets

Presets are stored locally in the first version.

This keeps the product:

```text
Fast
Private
Offline-capable
Simple
```

A future shared preset system can be added without changing the conceptual Preset Engine API.

---

## 59. Architectural Decision: No AI Dependency

AI is not part of the core runtime.

The architecture instead defines an Analyzer boundary.

Today:

```text
Heuristic Analyzer
```

Future:

```text
AI Analyzer
```

Both can produce the same:

```text
Analysis Result
```

This preserves architectural flexibility.

---

## 60. Architectural Decision: Mutation Centralization

All page mutations pass through the Mutation Engine.

This is a critical architectural decision.

Without centralization, different components could independently manipulate the DOM and make reliable Undo/Redo impossible.

Therefore:

```text
Inspector
Cleanup
Preset
Keep Mode
Smart Cleanup
```

must all converge on:

```text
Mutation Engine
```

---

## 61. Architectural Decision: Extraction Is Read-Only

The Extraction Engine must never directly mutate the page.

It observes:

```text
DOM
```

and returns:

```text
Extraction Result
```

Any modification must go through the Cleanup/Mutation pipeline.

This separation is required to maintain predictability.

---

## 62. Architectural Decision: UI Is Not the Source of Truth

The UI displays state.

It does not own the authoritative page state.

The session and DOM runtime own that state.

This allows:

- UI redesign
- Multiple UI surfaces
- Keyboard control
- Future popup/panel interfaces
- Automated operations

without rewriting the underlying page engine.

---

## 63. Dependency Rules

The following dependencies are allowed:

```text
UI
→ Workflow

Workflow
→ Services

Services
→ DOM Runtime

Services
→ Storage Interfaces

Capture
→ Session / DOM Measurements

Service Worker
→ Browser APIs
```

The following should be avoided:

```text
DOM Runtime → React
DOM Runtime → UI Components
Extraction → Mutation
Preset Repository → DOM
Storage → DOM Nodes
```

---

## 64. MVP Architectural Boundary

The MVP ends at:

```text
Chrome
│
├── Page Control
├── DOM Inspection
├── Cleanup
├── Extraction
├── Presets
└── PNG Capture
```

Everything beyond that is future scope.

This boundary prevents premature architectural expansion.

---

## 65. Architecture Summary

The final architecture is:

```text
                         CHROME
                            │
                 ┌──────────┴──────────┐
                 │                     │
          SERVICE WORKER          CONTENT RUNTIME
                 │                     │
        Browser Operations             │
                 │                     │
                 │        ┌────────────┴────────────┐
                 │        │                         │
                 │   SESSION / WORKFLOW             │
                 │        │                         │
                 │        ├── FREEZE ENGINE         │
                 │        ├── INSPECTOR             │
                 │        ├── SELECTION             │
                 │        ├── CLEANUP ENGINE        │
                 │        ├── EXTRACTION ENGINE     │
                 │        └── HISTORY ENGINE        │
                 │                                  │
                 │                           MUTATION ENGINE
                 │                                  │
                 │                                  ▼
                 │                              PAGE DOM
                 │
                 ├───────────────┐
                 │               │
              STORAGE        CAPTURE RUNTIME
                 │               │
              PRESETS        RENDER / PNG
                 │               │
                 └───────┬───────┘
                         │
                    EDITORIAL ASSET
```

---

## 66. Architectural Invariants

The following rules are considered architectural invariants.

```text
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
```

---

## 67. Next Architecture Document

The next subsystem document is:

`04-FREEZE-ENGINE.md`

It will define precisely how NewsClean transitions a dynamic webpage into a controlled working state, including:

```text
Soft Freeze
Hard Freeze
Network Stop
Timers
Animations
MutationObserver
Dynamic DOM
Lazy Loading
Media
WebSockets
Page Restoration
Freeze State
Failure Handling
```

The Freeze Engine must be designed carefully because it is the foundation on which reliable inspection, cleanup, and capture depend.