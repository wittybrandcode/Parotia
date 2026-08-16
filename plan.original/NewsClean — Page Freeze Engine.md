# NewsClean
## Page Freeze Engine

**Document ID:** 04-FREEZE-ENGINE  
**Version:** 0.1.0  
**Status:** Foundation  
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`

---

## 1. Purpose

The Freeze Engine is responsible for transforming a dynamic webpage into a stable working state in which NewsClean can safely inspect, clean, compose, and capture the page.

The engine sits between:

```text
Dynamic Web Runtime
        ↓
   Freeze Engine
        ↓
Controlled Working DOM
```

The Freeze Engine does not decide what content is relevant.

It does not remove advertisements.

It does not identify articles.

It does not perform capture.

Its only responsibility is:

> **Stabilize the current webpage sufficiently for deterministic editorial manipulation.**

---

## 2. The Fundamental Problem

A modern webpage is not a static document.

Even after the article appears visually complete, the page may continue executing:

```text
JavaScript
Timers
MutationObserver
Fetch
XHR
WebSocket
Lazy Loading
Animations
Video
Ads
Personalization
Infinite Scroll
React/Vue/Angular Rendering
```

An operator may remove an element and see it return two seconds later.

An operator may start a capture while an advertisement is still loading.

An image may change after capture begins.

A sticky banner may appear unexpectedly.

Therefore:

```text
Screenshot ≠ Stable Page
```

NewsClean requires an explicit stabilization layer.

---

## 3. Freeze Definition

For NewsClean, "frozen" means:

> The page has entered a controlled visual and structural state where new unwanted activity is minimized and NewsClean can perform deterministic operations.

Freeze does **not** mean that every JavaScript execution context inside the webpage can be mathematically stopped.

Browser security boundaries make that unrealistic.

Therefore the product defines Freeze as a **graduated stabilization process**.

---

## 4. Freeze Modes

The engine supports two primary modes:

```text
SOFT_FREEZE
HARD_FREEZE
```

Soft Freeze is the default.

Hard Freeze is an advanced mode intended for difficult pages.

---

# 5. Soft Freeze

Soft Freeze should be fast, minimally invasive, and compatible with most webpages.

The conceptual pipeline is:

```text
Current Page
    ↓
Capture Current State
    ↓
Stop Pending Navigation/Loading
    ↓
Disable Visual Motion
    ↓
Stabilize Layout
    ↓
Observe Remaining Mutations
    ↓
FROZEN
```

Soft Freeze should avoid aggressively overriding webpage JavaScript APIs.

---

## 6. Soft Freeze Responsibilities

Soft Freeze should attempt to:

- Stop further page loading.
- Disable CSS animations.
- Disable CSS transitions.
- Pause media where possible.
- Prevent unnecessary visual movement.
- Record the current page state.
- Stabilize the viewport.
- Establish a MutationObserver.
- Mark the page as frozen.
- Allow NewsClean to continue inspecting and editing.

The implementation must prioritize page stability over theoretical completeness.

---

# 7. Hard Freeze

Hard Freeze is an escalation mechanism.

Its purpose is to deal with pages that continue changing after Soft Freeze.

Conceptually:

```text
Soft Freeze
     ↓
Page still changing?
     ↓
Hard Freeze
```

Hard Freeze may introduce more invasive controls around:

```text
Timers
Animation
Mutation
Media
Dynamic rendering
```

However, it must never assume that all page execution can safely be disabled.

---

## 8. Why Hard Freeze Is Dangerous

Web applications depend heavily on browser APIs.

For example:

```text
setTimeout()
setInterval()
requestAnimationFrame()
fetch()
MutationObserver()
ResizeObserver()
IntersectionObserver()
```

Blindly replacing or disabling these APIs can break:

- Article rendering
- Image loading
- Layout
- Menus
- Text rendering
- Framework state
- React/Vue applications
- Embedded components

Therefore Hard Freeze must be selective.

The rule is:

> **Freeze the visual and editorial state, not the entire JavaScript universe.**

---

# 9. Freeze Pipeline

The complete pipeline is:

```text
┌─────────────────────┐
│     PAGE ACTIVE     │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ CAPTURE PRE-FREEZE  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   STOP LOADING      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ FREEZE VISUALS      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ STABILIZE LAYOUT    │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ OBSERVE MUTATIONS   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ VERIFY STABILITY    │
└──────────┬──────────┘
           ↓
       FROZEN
```

---

# 10. Phase 1 — Capture Pre-Freeze State

Before applying modifications, the engine should record the minimum state required for restoration.

The state should include:

```text
URL
Viewport width
Viewport height
Scroll position
Document dimensions
Active media state where relevant
Freeze mode
Timestamp
```

The engine should not serialize the entire webpage.

The Freeze Engine is not a page snapshot engine.

---

# 11. Phase 2 — Stop Loading

The engine should attempt to stop continued document loading.

The first mechanism is:

```text
window.stop()
```

This is a best-effort operation.

It should be treated as:

```text
STOP PENDING LOADS
```

not:

```text
BLOCK ALL FUTURE NETWORK ACTIVITY
```

The distinction is important.

---

# 12. Network-Level Blocking

Network request control should not be implemented by attempting to convert the Freeze Engine into a generic network proxy.

Manifest V3 does not provide ordinary extensions with the previous `webRequestBlocking` model; Chrome recommends Declarative Net Request for declarative request blocking.

Therefore the MVP should not make network interception the core Freeze mechanism.

The Freeze Engine should primarily operate at the page/runtime level.

If future versions require known-host or known-resource blocking, a dedicated network filtering subsystem may use `chrome.declarativeNetRequest`.

That subsystem must remain separate from the Freeze Engine.

---

# 13. Phase 3 — Freeze Visual Motion

Dynamic visual motion is one of the biggest problems during capture.

The engine should inject an isolated freeze stylesheet that effectively disables:

```text
animation
transition
scroll behavior
```

Conceptually:

```css
*,
*::before,
*::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
}
```

The exact implementation must be scoped carefully.

NewsClean should not permanently modify the original stylesheet.

The freeze stylesheet exists only during the session.

---

# 14. Animation Policy

The engine should distinguish between:

```text
CSS Animation
CSS Transition
JavaScript Animation
Video Animation
Canvas Animation
```

CSS animation and transition are relatively easy to neutralize.

JavaScript-driven animation is more difficult.

The MVP should not attempt to intercept every possible JavaScript animation API.

The goal is visual stabilization, not complete execution suspension.

---

# 15. requestAnimationFrame

`requestAnimationFrame()` is commonly used for visual animation.

Hard Freeze may optionally intercept it.

However, this must not be performed globally by default.

Potential strategy:

```text
Soft Freeze
→ Do not override requestAnimationFrame

Hard Freeze
→ Optional controlled interception
```

If implemented, the original function must be preserved so that it can be restored.

---

# 16. Timer Strategy

The same principle applies to:

```text
setTimeout()
setInterval()
```

The MVP should not globally replace timers during Soft Freeze.

Hard Freeze may provide a controlled timer strategy.

Potential model:

```text
Timer created before freeze
→ allow current callback to complete

Timer created after freeze
→ optionally suppress
```

This is safer than indiscriminately cancelling every timer.

---

# 17. MutationObserver Strategy

MutationObserver is especially important because modern websites frequently use it to inject new content.

However, NewsClean should not attempt to disable every MutationObserver registered by the page.

Instead, the engine should install its own observer.

Conceptually:

```text
Page
 ↓
MutationObserver
 ↓
NewsClean Stability Monitor
```

The observer detects:

- Added nodes
- Removed nodes
- Attribute changes
- Large DOM changes

The purpose is detection, not immediate suppression.

---

# 18. Stability Monitor

After Freeze begins, the engine enters a monitoring period.

Conceptually:

```text
Freeze initiated
      ↓
Observe mutations
      ↓
Mutation detected?
      ├── YES → reset stability timer
      └── NO
             ↓
        stable window
             ↓
          FROZEN
```

This gives NewsClean a measurable concept of stability.

---

# 19. Stability Window

The engine should define a configurable stability window.

Initial recommendation:

```text
STABILITY_WINDOW = 500 ms
```

Meaning:

> If no significant DOM or layout-changing activity is detected for approximately 500 ms after the freeze operations, the page is considered visually stable enough for normal inspection.

This is a heuristic, not a guarantee.

The value should be configurable internally for testing.

---

# 20. Mutation Classification

Not every DOM mutation means the page is visually unstable.

For example:

```text
analytics attribute update
```

may have no visual effect.

Therefore mutations should be classified.

Categories:

```text
STRUCTURAL
VISUAL
ATTRIBUTE
TEXT
NON_VISUAL
UNKNOWN
```

Examples:

```text
Added advertisement
→ STRUCTURAL / VISUAL

Changed article text
→ TEXT / VISUAL

Tracking attribute
→ ATTRIBUTE / NON_VISUAL
```

Only relevant mutations should reset the stability timer.

---

# 21. Layout Stability

DOM stability alone is insufficient.

An element may remain in the DOM while its dimensions continue changing.

The engine should therefore optionally monitor:

```text
ResizeObserver
```

for important regions.

At minimum:

```text
document.documentElement
body
selected article container
```

should be considered during capture preparation.

---

# 22. Scroll Stability

The page must not automatically scroll while the operator is cleaning.

The engine should record:

```text
scrollX
scrollY
```

when Freeze begins.

During the frozen state, unexpected scroll changes should be detected.

The system should not continuously force the scroll position unless necessary because that could interfere with user interaction.

---

# 23. Sticky Elements

Sticky headers and floating elements are common sources of capture noise.

Freeze itself should not decide whether a sticky element is editorially useful.

Instead, Freeze should stabilize its position.

Cleanup Engine later decides:

```text
KEEP
HIDE
DELETE
```

This separation is important.

---

# 24. Lazy-Loaded Images

Lazy loading creates a special problem.

A page may appear incomplete because images are still waiting for:

```text
IntersectionObserver
```

or scrolling.

The engine should not freeze too early if important visual resources are still loading.

The preferred sequence is:

```text
Page loaded
↓
Image readiness check
↓
Freeze
```

when the page is already visually usable.

If the user activates NewsClean immediately, the engine should stabilize the current state rather than endlessly waiting for every resource.

---

# 25. Image Readiness

The engine may inspect:

```text
img.complete
```

and natural dimensions.

An image is considered visually ready when:

```text
complete === true
```

and, where applicable:

```text
naturalWidth > 0
```

Broken images should not block freezing indefinitely.

---

# 26. Video Policy

Video is normally considered non-essential for an article capture.

Soft Freeze should attempt to pause HTML media elements:

```text
video
audio
```

where appropriate.

The engine should not remove them.

That is the responsibility of Cleanup Engine.

Conceptually:

```text
VIDEO
 ↓
Pause
 ↓
Freeze
 ↓
User decides:
Keep / Hide / Delete
```

---

# 27. Canvas Policy

Canvas content is difficult because its visual state may be generated dynamically.

The MVP should not attempt to reconstruct canvas rendering.

The engine should simply stabilize the page as far as possible.

Capture must preserve visible canvas content when the browser's capture mechanism supports it.

---

# 28. WebSocket Policy

WebSockets may continue receiving data after the page visually appears complete.

The MVP should not attempt to globally terminate arbitrary page WebSockets.

Doing so could break the page.

Instead:

```text
Soft Freeze
→ detect ongoing dynamic changes

Hard Freeze
→ optional advanced intervention
```

Network-level blocking remains outside the core Freeze Engine.

---

# 29. Fetch and XHR

The same rule applies to:

```text
fetch()
XMLHttpRequest
```

NewsClean should not globally monkey-patch these APIs in Soft Freeze.

Doing so risks breaking modern websites.

The engine instead monitors the resulting DOM and visual state.

---

# 30. Hard Freeze Strategy

Hard Freeze should operate as a layered escalation.

```text
Layer 1
Stop loading

Layer 2
Disable visual animation

Layer 3
Pause media

Layer 4
Monitor DOM mutations

Layer 5
Monitor layout changes

Layer 6
Optional timer intervention

Layer 7
Optional animation-frame intervention
```

Each layer must be independently enabled.

The engine should never jump directly to maximum intervention.

---

# 31. Hard Freeze Profiles

Future implementations may expose:

```text
NORMAL
AGGRESSIVE
CAPTURE
```

### NORMAL

Equivalent to Soft Freeze.

### AGGRESSIVE

More aggressive suppression of dynamic activity.

### CAPTURE

Optimized specifically for deterministic screenshot rendering.

These profiles should remain implementation details until real-world testing demonstrates their value.

---

# 32. Freeze State Machine

The Freeze Engine has its own state machine:

```text
IDLE
  ↓
PREPARING
  ↓
STOPPING
  ↓
STABILIZING
  ↓
VERIFYING
  ↓
FROZEN
```

Failure:

```text
ANY STATE
   ↓
DEGRADED
```

Unfreeze:

```text
FROZEN
   ↓
RESTORING
   ↓
IDLE
```

---

# 33. Freeze State Definitions

### IDLE

No freeze operation is active.

### PREPARING

The engine records required session state.

### STOPPING

The engine performs loading/media stabilization.

### STABILIZING

The engine disables visual motion and monitors mutations.

### VERIFYING

The engine determines whether the page has reached a stable state.

### FROZEN

The page is considered stable enough for NewsClean operations.

### DEGRADED

The page could not be fully stabilized.

### RESTORING

Temporary Freeze modifications are being removed.

---

# 34. Freeze Contract

The Freeze Engine should expose a minimal interface:

```text
freeze(mode)
unfreeze()
getState()
getDiagnostics()
```

Conceptually:

```ts
interface FreezeEngine {
  freeze(mode: FreezeMode): Promise<FreezeResult>;
  unfreeze(): Promise<void>;
  getState(): FreezeState;
  getDiagnostics(): FreezeDiagnostics;
}
```

The actual implementation may evolve.

---

# 35. Freeze Result

A freeze operation should return structured information.

Conceptually:

```json
{
  "success": true,
  "mode": "SOFT",
  "stabilityReached": true,
  "durationMs": 842,
  "mutationsObserved": 13,
  "visualMotionDisabled": true,
  "mediaPaused": true
}
```

If the page is only partially stabilized:

```json
{
  "success": false,
  "mode": "SOFT",
  "stabilityReached": false,
  "degraded": true
}
```

This allows the UI to communicate meaningful status.

---

# 36. Freeze Diagnostics

Development diagnostics should expose:

```text
Freeze Mode
Start Time
End Time
Duration
Mutation Count
Relevant Mutation Count
Layout Changes
Media Paused
Animation CSS Applied
Stability Window
Degraded State
```

Diagnostics should not expose or log article content unnecessarily.

---

# 37. Freeze CSS Isolation

The injected freeze stylesheet should belong to the NewsClean runtime.

It should be identifiable:

```text
data-newsclean-freeze="true"
```

or equivalent internal identification.

This makes restoration deterministic.

The Cleanup Engine must never mistake the freeze stylesheet for webpage content.

---

# 38. Restoration

Unfreeze must remove all temporary NewsClean freeze modifications.

This includes:

```text
Freeze stylesheet
Temporary attributes
Temporary listeners
Mutation observers
Resize observers
Media state changes where restoration is appropriate
Timer overrides
Animation-frame overrides
```

Restoration must be idempotent.

Calling:

```text
unfreeze()
unfreeze()
```

must not create errors.

---

# 39. Restoration Principle

NewsClean should restore the page to the closest practical state before Freeze.

However, if the user performed cleanup operations during the session, those changes must remain according to the active session model.

Therefore there are two distinct concepts:

```text
Freeze State
```

and:

```text
Editorial Mutation State
```

Unfreeze removes Freeze-specific modifications.

It does not automatically undo editorial cleanup.

---

# 40. Reload Behavior

A page reload naturally destroys the current Content Runtime.

The extension should consider the session invalid after a reload.

The page returns to its original website state.

The extension must not attempt to reconstruct arbitrary DOM modifications automatically unless a future feature explicitly supports persistent session restoration.

---

# 41. Navigation Behavior

If the tab navigates to another URL:

```text
Current Session
    ↓
INVALIDATED
```

A new session must be created.

Presets may be reapplied if appropriate.

Session mutations must not leak into the next page.

---

# 42. Browser Navigation Constraints

The extension Service Worker cannot directly manipulate the page DOM. Chrome's extension architecture separates the Service Worker from page DOM access; DOM manipulation belongs in content scripts or appropriate page contexts.

Therefore:

```text
Service Worker
→ request freeze

Content Runtime
→ execute freeze
```

Communication should use Chrome extension messaging.

If runtime injection is required, `chrome.scripting` supports programmatic injection in MV3 with appropriate permissions.

---

# 43. Activation Strategy

When the user clicks NewsClean:

```text
Toolbar
 ↓
Service Worker
 ↓
Ensure Content Runtime
 ↓
START_SESSION
 ↓
FREEZE
```

The extension should not depend exclusively on a popup remaining open.

The Content Runtime should own the active session after activation.

---

# 44. Freeze Overlay

During freezing, NewsClean should display a minimal state indicator.

Example:

```text
┌─────────────────────────────┐
│ FREEZING PAGE...            │
│ Stabilizing content         │
└─────────────────────────────┘
```

After completion:

```text
● FROZEN
```

If degraded:

```text
△ PARTIALLY FROZEN
```

The indicator must not appear in the final capture.

---

# 45. User Experience

The user should not need to understand the technical process.

The visible workflow should be:

```text
Clean Page
      ↓
Freezing...
      ↓
Frozen
```

The technical complexity remains internal.

---

# 46. Failure Handling

Possible failure conditions:

```text
Content script unavailable
Page inaccessible
Browser restricted page
DOM continuously mutating
Extreme animation
Cross-origin iframe
Rendering instability
```

The engine must classify failures.

Example:

```text
FULL_FREEZE
PARTIAL_FREEZE
FAILED
```

---

# 47. Partial Freeze

Partial Freeze is an important state.

The system may successfully stabilize:

```text
Main document
Article
Images
Layout
```

while being unable to control:

```text
Cross-origin iframe
Embedded player
External widget
```

The user should still be able to continue.

Therefore:

> **Partial success is preferable to total failure.**

---

# 48. Restricted Pages

Some browser pages cannot be controlled by normal content scripts.

Examples may include:

```text
chrome://
Chrome Web Store
Extension internal pages
Other browser-controlled surfaces
```

The extension must detect unsupported contexts and refuse activation gracefully.

---

# 49. Performance Requirements

Soft Freeze should normally complete within:

```text
< 1 second
```

for ordinary news pages after the initial stabilization period.

Large pages may take longer.

The engine must not perform repeated full DOM scans during stabilization.

Mutation monitoring should be incremental.

---

# 50. Memory Requirements

The Freeze Engine must avoid storing:

```text
Entire DOM
Entire HTML document
All page resources
```

unless explicitly required by a future capture architecture.

The engine should retain only:

```text
Session state
Freeze modifications
Observers
Diagnostics
Restoration metadata
```

---

# 51. Interaction with Cleanup Engine

The dependency is strictly:

```text
Freeze Engine
       ↓
Stable Page
       ↓
Cleanup Engine
```

Cleanup Engine must not invoke arbitrary Freeze internals.

It may request:

```text
getState()
```

to verify that the page is frozen.

If cleanup starts while the page is not frozen, the Workflow Engine should decide whether to initiate Freeze.

---

# 52. Interaction with Capture Engine

Capture should preferably require:

```text
Freeze State = FROZEN
```

or:

```text
Freeze State = DEGRADED
```

with explicit user confirmation.

The Capture Engine must not silently capture a page known to be unstable.

---

# 53. Freeze Gate

Before capture:

```text
if state === FROZEN
    allow capture

if state === DEGRADED
    warn / allow explicit confirmation

if state !== FROZEN
    request freeze
```

This creates deterministic capture behavior.

---

# 54. Security Considerations

The Freeze Engine operates against untrusted webpages.

Page-controlled data must never be treated as extension commands.

Messages between the Content Runtime and Service Worker must be validated.

Chrome explicitly recommends treating content-script messages as less trustworthy and validating/sanitizing inputs.

The Freeze Engine must therefore accept only typed commands.

Example:

```text
FREEZE_PAGE
UNFREEZE_PAGE
GET_FREEZE_STATE
```

not arbitrary executable instructions.

---

# 55. No Remote Freeze Code

All Freeze Engine code must be packaged with the extension.

Manifest V3 does not permit remotely hosted extension code, reinforcing the requirement that runtime logic be locally bundled.

The page itself remains untrusted.

---

# 56. Architectural Invariants

The following rules are mandatory:

```text
1. Soft Freeze is the default.
2. Hard Freeze is an escalation strategy.
3. Freeze does not perform editorial cleanup.
4. Freeze does not identify article relevance.
5. Freeze does not perform capture.
6. window.stop() is best-effort, not a complete network firewall.
7. Soft Freeze must not globally disable page JavaScript APIs.
8. Mutation monitoring is preferred to indiscriminate interception.
9. Temporary freeze modifications must be reversible.
10. Unfreeze must be idempotent.
11. Partial Freeze is a valid state.
12. Cross-origin frames are treated as browser boundaries.
13. Network blocking is not part of the core Freeze Engine.
14. DOM mutations remain owned by the Mutation Engine.
15. Freeze state must be explicit.
```

---

# 57. Recommended Implementation Order

Implementation should proceed in this order:

```text
Phase 1
Freeze State Machine

Phase 2
Pre-Freeze State Capture

Phase 3
window.stop()

Phase 4
Freeze CSS

Phase 5
Media Pause

Phase 6
Mutation Stability Monitor

Phase 7
Layout Stability Monitor

Phase 8
Freeze Verification

Phase 9
Restoration

Phase 10
Hard Freeze Experiments
```

Hard Freeze should not block the initial MVP.

Soft Freeze should be implemented and tested against real newsroom websites first.

---

# 58. Test Matrix

The engine must be tested against representative page types.

### Static article

Expected:

```text
FULL FREEZE
```

### Heavy advertising page

Expected:

```text
FULL / PARTIAL FREEZE
```

### React article

Expected:

```text
FULL FREEZE
```

without breaking article content.

### Infinite-scroll page

Expected:

```text
FREEZE CURRENT STATE
```

without forcing additional content loading.

### Video-heavy page

Expected:

```text
MEDIA PAUSED
```

where technically possible.

### Continuously updating page

Expected:

```text
PARTIAL FREEZE
```

rather than hanging indefinitely.

### Cross-origin iframe

Expected:

```text
MAIN PAGE FROZEN
IFRAME TREATED AS BOUNDARY
```

---

# 59. Acceptance Criteria

The Freeze Engine is considered MVP-complete when:

```text
1. A user can activate Freeze on a normal article.
2. Pending loading is stopped on a best-effort basis.
3. CSS animation and transition are visually disabled.
4. HTML media can be paused where applicable.
5. The engine detects significant DOM changes.
6. The engine waits for a defined stability window.
7. The engine exposes explicit FROZEN state.
8. The inspector can operate after Freeze.
9. Cleanup operations can operate after Freeze.
10. Capture can verify Freeze state.
11. Freeze modifications can be removed.
12. Unfreeze does not corrupt the page.
13. Reload invalidates the session.
14. Unsupported browser pages fail gracefully.
15. Continuous dynamic pages can enter PARTIAL FREEZE rather than hanging indefinitely.
```

---

# 60. Future Extensions

Potential future capabilities:

```text
Network-aware Freeze
Advanced Resource Blocking
Intelligent Mutation Classification
Visual Difference Detection
Layout Stability Scoring
AI Dynamic Content Classification
Per-Site Freeze Profiles
Capture-specific Freeze Profiles
```

These must be implemented as extensions to the Freeze architecture rather than by turning the Freeze Engine into a general-purpose browser automation system.

---

# 61. Final Freeze Model

The final conceptual model is:

```text
                 WEB PAGE
                    │
                    ▼
             ┌──────────────┐
             │ PREPARE      │
             └──────┬───────┘
                    ▼
             ┌──────────────┐
             │ STOP LOADING │
             └──────┬───────┘
                    ▼
             ┌──────────────┐
             │ FREEZE VISUAL│
             └──────┬───────┘
                    ▼
             ┌──────────────┐
             │ PAUSE MEDIA  │
             └──────┬───────┘
                    ▼
             ┌──────────────┐
             │ MONITOR DOM  │
             └──────┬───────┘
                    ▼
             ┌──────────────┐
             │ VERIFY       │
             │ STABILITY    │
             └──────┬───────┘
                    ▼
          ┌─────────────────────┐
          │       FROZEN        │
          │                     │
          │ Inspect             │
          │ Clean               │
          │ Compose             │
          │ Capture             │
          └─────────────────────┘
```

The essential architectural principle is:

> **NewsClean does not need to stop the entire Web. It needs to create a sufficiently stable editorial state from the current Web page.**

This distinction keeps the Freeze Engine technically realistic, compatible with Manifest V3, and safe enough for arbitrary news websites.