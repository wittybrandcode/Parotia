# NewsClean — Page Freeze Engine

**Document ID:** 04-FREEZE-ENGINE  
**Version:** 0.1.0  
**Status:** Foundation  
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`

---

## 1. Purpose

The Freeze Engine is responsible for transforming a dynamic webpage into a stable working state in which NewsClean can safely inspect, clean, compose, and capture the page.

The engine sits between the dynamic web runtime and the controlled working DOM: the runtime supplies a live, changing page, and the engine hands a stable page to everything downstream.

The Freeze Engine has a deliberately narrow scope. It does not decide what content is relevant. It does not remove advertisements. It does not identify articles. It does not perform capture. Its only responsibility is:

> **Stabilize the current webpage sufficiently for deterministic editorial manipulation.**

## 2. The Fundamental Problem

A modern webpage is not a static document. Even after the article appears visually complete, the page may continue executing:

- JavaScript
- Timers
- MutationObservers
- Fetch / XHR
- WebSockets
- Lazy loading
- Animations
- Video
- Ads
- Personalization
- Infinite scroll
- React/Vue/Angular rendering

These systems keep the page alive in ways that break editorial work. An operator may remove an element and see it return two seconds later. A capture may start while an advertisement is still loading. An image may change after capture begins. A sticky banner may appear unexpectedly.

A screenshot of a live page is therefore not a snapshot of a stable page. NewsClean requires an explicit stabilization layer between the operator's intent and any deterministic operation.

## 3. Freeze Definition

For NewsClean, "frozen" means the page has entered a controlled visual and structural state where new unwanted activity is minimized and NewsClean can perform deterministic operations.

Freeze does **not** mean that every JavaScript execution context inside the webpage can be mathematically stopped. Browser security boundaries make that unrealistic. The product therefore defines Freeze as a **graduated stabilization process** rather than an all-or-nothing execution lockdown.

The essential architectural principle is:

> **NewsClean does not need to stop the entire Web. It needs to create a sufficiently stable editorial state from the current Web page.**

This distinction keeps the Freeze Engine technically realistic, compatible with Manifest V3, and safe enough to run against arbitrary news websites.

## 4. Freeze Modes

The engine supports two primary modes:

- **`SOFT_FREEZE`** — the default. Fast, minimally invasive, and compatible with most webpages. Soft Freeze should avoid aggressively overriding webpage JavaScript APIs.
- **`HARD_FREEZE`** — an advanced escalation intended for pages that remain difficult after Soft Freeze.

## 5. Freeze Pipeline

Both modes follow the same pipeline:

```
PAGE ACTIVE
   ↓
CAPTURE PRE-FREEZE STATE
   ↓
STOP LOADING
   ↓
FREEZE VISUAL MOTION
   ↓
STABILIZE LAYOUT
   ↓
OBSERVE MUTATIONS
   ↓
VERIFY STABILITY
   ↓
FROZEN
```

## 6. Soft Freeze Responsibilities

Soft Freeze should attempt to:

- Stop further page loading.
- Disable CSS animations and transitions.
- Pause media where possible.
- Prevent unnecessary visual movement.
- Record the current page state.
- Stabilize the viewport.
- Establish a MutationObserver.
- Mark the page as frozen.
- Allow NewsClean to continue inspecting and editing.

The implementation must prioritize page stability over theoretical completeness.

## 7. Capture Pre-Freeze State

Before applying any modification, the engine records the minimum state required for restoration:

- URL
- Viewport width and viewport height
- Scroll position
- Document dimensions
- Active media state where relevant
- Freeze mode
- Timestamp

The engine must not serialize the entire webpage. The Freeze Engine is not a page snapshot engine.

## 8. Stop Loading

The engine attempts to stop continued document loading, starting with `window.stop()`.

`window.stop()` is a best-effort operation. It must be treated as **STOP PENDING LOADS**, not **BLOCK ALL FUTURE NETWORK ACTIVITY**. The distinction matters: the page is being quieted, not firewalled, and the engine should never pretend it controls the network.

## 9. Network-Level Blocking

Network request control must not turn the Freeze Engine into a generic network proxy.

Manifest V3 does not provide ordinary extensions with the previous `webRequestBlocking` model; Chrome recommends Declarative Net Request for declarative request blocking. Consequently, network interception is **not** the core Freeze mechanism in the MVP. The Freeze Engine operates primarily at the page/runtime level.

If future versions require known-host or known-resource blocking, a dedicated network filtering subsystem may use `chrome.declarativeNetRequest`. That subsystem must remain separate from the Freeze Engine.

## 10. Freeze Visual Motion

Dynamic visual motion is one of the biggest problems during capture. The engine injects an isolated freeze stylesheet that effectively disables animation, transition, and scroll behavior:

```css
*, *::before, *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
}
```

The exact implementation must be scoped carefully. NewsClean must not permanently modify the original stylesheet — the freeze stylesheet exists only during the session.

## 11. Animation Policy

The engine distinguishes between CSS animation, CSS transition, JavaScript animation, video animation, and canvas animation.

CSS animation and transition are relatively easy to neutralize. JavaScript-driven animation is more difficult, so the MVP does not attempt to intercept every possible JavaScript animation API. The goal is visual stabilization, not complete execution suspension.

## 12. requestAnimationFrame

`requestAnimationFrame()` is commonly used for visual animation and is a candidate for interception in Hard Freeze only:

- **Soft Freeze** → do not override `requestAnimationFrame`.
- **Hard Freeze** → optional controlled interception.

This must not be performed globally by default. If interception is implemented, the original function must be preserved so it can be restored when the session ends.

## 13. Timer Strategy

The same principle applies to `setTimeout()` and `setInterval()`. The MVP must not globally replace timers during Soft Freeze; Hard Freeze may provide a controlled timer strategy:

- **Timer created before freeze** → allow the current callback to complete.
- **Timer created after freeze** → optionally suppress.

This is safer than indiscriminately cancelling every timer, which would break legitimate page behavior.

## 14. MutationObserver Strategy

Modern websites frequently use MutationObserver to inject new content, which is why this API matters most. NewsClean must not attempt to disable every observer registered by the page; instead, the engine installs its own observer that detects:

- Added nodes
- Removed nodes
- Attribute changes
- Large DOM changes

The purpose is **detection, not immediate suppression**. Detection feeds the stability monitor; suppression would risk breaking the page's own rendering.

## 15. Stability Monitor

After Freeze begins, the engine enters a monitoring period. It observes mutations; a detected mutation resets the stability timer. If no significant activity occurs within the stable window, the engine reaches FROZEN.

This gives NewsClean a measurable concept of stability instead of an arbitrary waiting period.

## 16. Stability Window

The engine defines a configurable stability window:

```
STABILITY_WINDOW = 500 ms
```

> If no significant DOM or layout-changing activity is detected for approximately 500 ms after the freeze operations, the page is considered visually stable enough for normal inspection.

This is a heuristic, not a guarantee, and the value must be configurable internally for testing.

## 17. Mutation Classification

Not every DOM mutation means the page is visually unstable. An analytics attribute update, for example, may have no visual effect. Mutations are therefore classified:

- `STRUCTURAL`
- `VISUAL`
- `ATTRIBUTE`
- `TEXT`
- `NON_VISUAL`
- `UNKNOWN`

Examples of classification:

- Added advertisement → STRUCTURAL / VISUAL
- Changed article text → TEXT / VISUAL
- Tracking attribute → ATTRIBUTE / NON_VISUAL

Only relevant mutations should reset the stability timer.

## 18. Layout Stability

DOM stability alone is insufficient: an element may remain in the DOM while its dimensions continue changing. The engine should therefore optionally monitor a `ResizeObserver` for important regions.

At minimum, `document.documentElement`, `body`, and the selected article container should be considered during capture preparation.

## 19. Scroll Stability

The page must not automatically scroll while the operator is cleaning. The engine records `scrollX` and `scrollY` when Freeze begins and, during the frozen state, detects unexpected scroll changes.

The system must not continuously force the scroll position unless necessary, because that could interfere with user interaction.

## 20. Sticky Elements

Sticky headers and floating elements are common sources of capture noise. Freeze itself does not decide whether a sticky element is editorially useful — it stabilizes the element's position.

The Cleanup Engine later decides whether to KEEP, HIDE, or DELETE the element. This separation of responsibilities is important.

## 21. Lazy-Loaded Images

Lazy loading creates a special problem: a page may appear incomplete because images are still waiting on an `IntersectionObserver` or scrolling. The engine must not freeze too early if important visual resources are still loading.

The preferred sequence is **page loaded → image readiness check → freeze**, applied when the page is already visually usable.

If the user activates NewsClean immediately, the engine stabilizes the current state rather than endlessly waiting for every resource.

## 22. Image Readiness

The engine may inspect `img.complete` and the image's natural dimensions. An image is considered visually ready when:

- `complete === true`
- and, where applicable, `naturalWidth > 0`

Broken images must not block freezing indefinitely.

## 23. Video Policy

Video is normally non-essential for an article capture. Soft Freeze should attempt to pause HTML media elements (`video`, `audio`) where appropriate.

The engine must not remove media elements — removal is the Cleanup Engine's responsibility, and the user ultimately decides between Keep, Hide, and Delete.

## 24. Canvas Policy

Canvas content is difficult because its visual state may be generated dynamically. The MVP must not attempt to reconstruct canvas rendering; the engine simply stabilizes the page as far as possible.

Capture must preserve visible canvas content when the browser's capture mechanism supports it.

## 25. WebSocket Policy

WebSockets may continue receiving data after the page visually appears complete. The MVP must not attempt to globally terminate arbitrary page WebSockets — doing so could break the page.

Instead:

- **Soft Freeze** → detect ongoing dynamic changes.
- **Hard Freeze** → optional advanced intervention.

Network-level blocking remains outside the core Freeze Engine.

## 26. Fetch and XHR

The same rule applies to `fetch()` and `XMLHttpRequest`: NewsClean must not globally monkey-patch these APIs in Soft Freeze, because doing so risks breaking modern websites.

The engine instead monitors the resulting DOM and visual state.

## 27. Hard Freeze Strategy

Hard Freeze operates as a layered escalation:

1. Stop loading
2. Disable visual animation
3. Pause media
4. Monitor DOM mutations
5. Monitor layout changes
6. Optional timer intervention
7. Optional animation-frame intervention

Each layer must be independently enabled, and the engine should never jump directly to maximum intervention.

### Why Hard Freeze Is Dangerous

Web applications depend heavily on browser APIs: `setTimeout()`, `setInterval()`, `requestAnimationFrame()`, `fetch()`, `MutationObserver()`, `ResizeObserver()`, `IntersectionObserver()`.

Blindly replacing or disabling these APIs can break:

- Article rendering
- Image loading
- Layout
- Menus
- Text rendering
- Framework state (React/Vue applications)
- Embedded components

Hard Freeze must therefore be selective, and it must never assume that all page execution can safely be disabled:

> **Freeze the visual and editorial state, not the entire JavaScript universe.**

### Hard Freeze Profiles (future)

Future implementations may expose:

- **`NORMAL`** — equivalent to Soft Freeze.
- **`AGGRESSIVE`** — stronger suppression of dynamic activity.
- **`CAPTURE`** — optimized specifically for deterministic screenshot rendering.

These profiles should remain implementation details until real-world testing demonstrates their value.

## 28. Freeze State Machine

The Freeze Engine has its own explicit state machine:

```
IDLE → PREPARING → STOPPING → STABILIZING → VERIFYING → FROZEN
```

Failure from any state:

```
ANY STATE → DEGRADED
```

Unfreeze:

```
FROZEN → RESTORING → IDLE
```

State definitions:

- **IDLE** — no freeze operation is active.
- **PREPARING** — the engine records required session state.
- **STOPPING** — the engine performs loading/media stabilization.
- **STABILIZING** — the engine disables visual motion and monitors mutations.
- **VERIFYING** — the engine determines whether the page has reached a stable state.
- **FROZEN** — the page is considered stable enough for NewsClean operations.
- **DEGRADED** — the page could not be fully stabilized.
- **RESTORING** — temporary Freeze modifications are being removed.

## 29. Freeze Contract

The Freeze Engine exposes a minimal interface that other engines depend on:

```ts
interface FreezeEngine {
  freeze(mode: FreezeMode): Promise<FreezeResult>;
  unfreeze(): Promise<void>;
  getState(): FreezeState;
  getDiagnostics(): FreezeDiagnostics;
}
```

The actual implementation may evolve, but the responsibilities should remain stable.

## 30. FreezeResult

A freeze operation returns structured information:

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

This allows the UI to communicate meaningful status to the operator.

## 31. Freeze Diagnostics

Development diagnostics should expose:

- Freeze mode
- Start time, end time, and duration
- Mutation count and relevant mutation count
- Layout changes
- Media paused
- Animation CSS applied
- Stability window
- Degraded state

Diagnostics must not expose or log article content unnecessarily.

## 32. Freeze CSS Isolation

The injected freeze stylesheet belongs to the NewsClean runtime and must be identifiable via an internal marker, e.g. `data-newsclean-freeze="true"`.

This makes restoration deterministic, and the Cleanup Engine must never mistake the freeze stylesheet for webpage content.

## 33. Restoration

Unfreeze must remove all temporary NewsClean freeze modifications:

- Freeze stylesheet
- Temporary attributes
- Temporary listeners
- Mutation observers
- Resize observers
- Media state changes where restoration is appropriate
- Timer overrides
- Animation-frame overrides

Restoration must be **idempotent**: calling `unfreeze()` twice must not produce errors.

## 34. Restoration Principle

NewsClean restores the page to the closest practical state before Freeze. If the user performed cleanup operations during the session, those changes remain according to the active session model.

Two distinct concepts apply:

- **Freeze State** — the set of temporary freeze modifications.
- **Editorial Mutation State** — the user's cleanup work.

Unfreeze removes freeze-specific modifications only; it does not automatically undo editorial cleanup.

## 35. Reload and Navigation

A page reload naturally destroys the current Content Runtime, so the extension must consider the session invalid after a reload.

The page returns to its original website state. The extension must not attempt to reconstruct arbitrary DOM modifications automatically unless a future feature explicitly supports persistent session restoration.

If the tab navigates to another URL, the current session is **INVALIDATED**. A new session must be created; presets may be reapplied if appropriate; session mutations must not leak into the next page.

## 36. Browser Navigation Constraints

The extension Service Worker cannot directly manipulate the page DOM. Chrome's extension architecture separates the Service Worker from page DOM access; DOM manipulation belongs in content scripts or appropriate page contexts.

Therefore:

- Service Worker → request freeze.
- Content Runtime → execute freeze.

Communication should use Chrome extension messaging. If runtime injection is required, `chrome.scripting` supports programmatic injection in MV3 with appropriate permissions.

## 37. Activation Strategy

When the user clicks NewsClean:

```
Toolbar → Service Worker → Ensure Content Runtime → START_SESSION → FREEZE
```

The extension must not depend exclusively on a popup remaining open. The Content Runtime should own the active session after activation.

## 38. Freeze Overlay and UX

During freezing, NewsClean displays a minimal state indicator, e.g. "FREEZING PAGE... / Stabilizing content". After completion it shows `● FROZEN`, or `△ PARTIALLY FROZEN` when degraded. The indicator must not appear in the final capture.

The user should not need to understand the technical process. The visible workflow is simply Clean Page → Freezing… → Frozen, and the technical complexity remains internal.

## 39. Failure Handling

Possible failure conditions:

- Content script unavailable
- Page inaccessible
- Browser restricted page
- DOM continuously mutating
- Extreme animation
- Cross-origin iframe
- Rendering instability

The engine must classify failures: `FULL_FREEZE`, `PARTIAL_FREEZE`, or `FAILED`.

## 40. Partial Freeze

Partial Freeze is an important, valid state. The system may successfully stabilize the main document, article, images, and layout while being unable to control a cross-origin iframe, an embedded player, or an external widget. The user must still be able to continue.

> **Partial success is preferable to total failure.**

## 41. Restricted Pages

Some browser pages cannot be controlled by normal content scripts, including:

- `chrome://` pages
- Chrome Web Store
- Extension internal pages
- Other browser-controlled surfaces

The extension must detect unsupported contexts and refuse activation gracefully.

## 42. Performance Requirements

Soft Freeze should normally complete within **< 1 second** for ordinary news pages after the initial stabilization period; large pages may take longer.

The engine must not perform repeated full DOM scans during stabilization — mutation monitoring must be incremental.

## 43. Memory Requirements

The Freeze Engine must avoid storing the entire DOM, the entire HTML document, or all page resources unless explicitly required by a future capture architecture.

It should retain only:

- Session state
- Freeze modifications
- Observers
- Diagnostics
- Restoration metadata

## 44. Interaction with Cleanup Engine

The dependency is strictly directional:

```
Freeze Engine → Stable Page → Cleanup Engine
```

Cleanup Engine must not invoke arbitrary Freeze internals. It may request `getState()` to verify that the page is frozen.

If cleanup starts while the page is not frozen, the Workflow Engine should decide whether to initiate Freeze.

## 45. Interaction with Capture Engine

Capture should preferably require Freeze State `FROZEN`, or `DEGRADED` with explicit user confirmation.

The Capture Engine must not silently capture a page known to be unstable.

## 46. Freeze Gate

Before capture:

- `state === FROZEN` → allow capture.
- `state === DEGRADED` → warn / allow explicit confirmation.
- `state !== FROZEN` → request freeze.

This creates deterministic capture behavior.

## 47. Security Considerations

The Freeze Engine operates against untrusted webpages. Page-controlled data must never be treated as extension commands, and messages between the Content Runtime and Service Worker must be validated.

Chrome explicitly recommends treating content-script messages as less trustworthy and validating/sanitizing inputs. The Freeze Engine must therefore accept only typed commands — e.g. `FREEZE_PAGE`, `UNFREEZE_PAGE`, `GET_FREEZE_STATE` — never arbitrary executable instructions.

All Freeze Engine code must be packaged with the extension. Manifest V3 does not permit remotely hosted extension code, reinforcing the requirement that runtime logic be locally bundled. The page itself remains untrusted.

## 48. Architectural Invariants

The following rules are mandatory:

1. Soft Freeze is the default.
2. Hard Freeze is an escalation strategy.
3. Freeze does not perform editorial cleanup.
4. Freeze does not identify article relevance.
5. Freeze does not perform capture.
6. `window.stop()` is best-effort, not a complete network firewall.
7. Soft Freeze must not globally disable page JavaScript APIs.
8. Mutation monitoring is preferred to indiscriminate interception.
9. Temporary freeze modifications must be reversible.
10. Unfreeze must be idempotent.
11. Partial Freeze is a valid state.
12. Cross-origin frames are treated as browser boundaries.
13. Network blocking is not part of the core Freeze Engine.
14. DOM mutations remain owned by the Mutation Engine.
15. Freeze state must be explicit.

## 49. Recommended Implementation Order

1. Freeze State Machine
2. Pre-Freeze State Capture
3. `window.stop()`
4. Freeze CSS
5. Media Pause
6. Mutation Stability Monitor
7. Layout Stability Monitor
8. Freeze Verification
9. Restoration
10. Hard Freeze Experiments

Hard Freeze must not block the initial MVP. Soft Freeze should be implemented and tested against real newsroom websites first.

## 50. Test Matrix

The engine must be tested against representative page types:

| Page type | Expected |
|---|---|
| Static article | FULL FREEZE |
| Heavy advertising page | FULL / PARTIAL FREEZE |
| React article | FULL FREEZE without breaking article content |
| Infinite-scroll page | FREEZE CURRENT STATE without forcing additional content loading |
| Video-heavy page | MEDIA PAUSED where technically possible |
| Continuously updating page | PARTIAL FREEZE rather than hanging indefinitely |
| Cross-origin iframe | MAIN PAGE FROZEN; IFRAME TREATED AS BOUNDARY |

## 51. Acceptance Criteria

The Freeze Engine is MVP-complete when:

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

## 52. Future Extensions

Potential future capabilities:

- Network-aware Freeze
- Advanced resource blocking
- Intelligent mutation classification
- Visual difference detection
- Layout stability scoring
- AI dynamic content classification
- Per-site freeze profiles
- Capture-specific freeze profiles

These must be implemented as extensions to the Freeze architecture rather than by turning the Freeze Engine into a general-purpose browser automation system.
