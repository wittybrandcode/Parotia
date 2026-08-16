# NewsClean
## DOM Inspection & Selection

**Document ID:** 05-DOM-INSPECTOR  
**Version:** 0.1.0  
**Status:** Foundation  
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`

---

## 1. Purpose

The DOM Inspector is the primary interaction layer between the newsroom operator and the structure of a webpage.

Its purpose is to make the DOM visually understandable without requiring the operator to know HTML or CSS.

The system converts:

```text
Pointer
   ↓
Visual Element
   ↓
DOM Node
   ↓
Element Information
   ↓
Editorial Action
```

The operator should be able to point at any accessible webpage component and understand what it represents structurally.

The core principle is:

> **Select visually, understand structurally, act precisely.**

---

# 2. Problem

A modern webpage may contain hundreds or thousands of DOM nodes.

A visual screenshot does not reveal:

```text
<div>
<article>
<aside>
<header>
<section>
<img>
<iframe>
```

nor:

```text
#id
.class
[data-*]
role
CSS selector
```

Traditional browser developer tools expose this information but are too technical and disruptive for newsroom workflows.

NewsClean therefore provides a specialized visual inspector.

---

# 3. Product Objective

The DOM Inspector must allow the user to:

1. Hover over webpage elements.
2. Visually identify the current target.
3. Select the target.
4. Display structural information.
5. Navigate to parent elements.
6. Navigate to children.
7. Generate a CSS selector.
8. Perform cleanup actions.
9. Preserve the selected element.
10. Select repeated elements using a selector.

---

# 4. Inspector Workflow

The basic workflow is:

```text id="5b5o9q"
INSPECT
   ↓
HOVER
   ↓
HIGHLIGHT
   ↓
SELECT
   ↓
IDENTIFY
   ↓
ACTION
```

Example:

```text id="i9o2t1"
Hover:
ADVERTISEMENT

↓
Select

↓
DIV
.ad-container
320 × 250

↓
Delete
```

---

# 5. Inspector Activation

Inspection should only become active when explicitly requested.

Primary action:

```text id="yd5yuj"
Inspect
```

Keyboard shortcut:

```text id="f8z0tq"
I
```

when not conflicting with the active page or browser environment.

When Inspector Mode is active:

```text id="9w5u1a"
Cursor → Inspection Cursor
```

The page itself must remain usable.

---

# 6. Inspection Modes

The MVP supports:

```text id="sgs2s7"
HOVER
SELECT
```

Future modes may include:

```text id="a7m9bn"
MULTI_SELECT
KEEP_REGION
COMPARE
```

---

# 7. Hover Detection

The inspector uses pointer coordinates to identify the target element.

Primary mechanism:

```text id="5e11y6"
document.elementFromPoint(x, y)
```

This is preferable to traversing the entire DOM on every pointer movement.

The algorithm is conceptually:

```text id="ef0v43"
pointermove
     ↓
coordinates
     ↓
elementFromPoint()
     ↓
resolve target
     ↓
filter NewsClean UI
     ↓
highlight
```

---

# 8. Pointer Event Throttling

`pointermove` can fire at high frequency.

The inspector must not perform expensive work on every event.

Recommended strategy:

```text id="6ypm4a"
pointermove
    ↓
requestAnimationFrame
    ↓
hit test
```

This synchronizes inspection work with the browser rendering cycle.

The inspector should avoid:

```text id="l1q9wd"
full DOM traversal
computed-style extraction
selector generation
```

during hover.

Those operations should occur only after target stabilization or selection.

---

# 9. Target Resolution

The target returned by `elementFromPoint()` may be:

```text id="g4r6e6"
NewsClean overlay
Webpage element
Text node proxy
SVG element
Shadow DOM host
```

The inspector must normalize this into a selectable element.

NewsClean's own UI must always be ignored.

---

# 10. NewsClean UI Exclusion

The inspector must never select:

```text id="c72y4k"
#__newsclean__
```

or any descendant of the NewsClean root.

Conceptually:

```text id="j3qzkl"
if target.closest("[data-newsclean-root]")
    ignore
```

The exact implementation should use an internal marker rather than relying only on an ID.

---

# 11. Selection Target

The selected target must be an `Element`.

If a pointer resolves to a special node that cannot be directly represented as an element, the inspector should resolve it to the nearest valid element.

Examples:

```text id="t7v5j1"
Text
 ↓
Parent element

SVG child
 ↓
SVG element

Pseudo-element
 ↓
Owning element
```

---

# 12. Element Highlighting

The inspector must never visually highlight elements by modifying their own CSS.

Bad approach:

```text id="qk2s0j"
element.style.outline = ...
```

This can:

- Change layout.
- Trigger style recalculation.
- Conflict with site CSS.
- Remain after inspection.
- Pollute Undo/Redo.

Instead, NewsClean uses a separate overlay renderer.

---

# 13. Highlight Overlay

Conceptually:

```text id="q0w9u4"
Web Element
      │
      │ getBoundingClientRect()
      ▼
NewsClean Overlay
      │
      └── Highlight Rectangle
```

The highlight should track:

```text id="0p0k3s"
top
left
width
height
```

The overlay should be positioned independently of the target element.

---

# 14. Highlight Information

During hover, the UI may display a compact label:

```text id="k3a8d4"
DIV
.advertisement
320 × 250
```

The label should not obstruct the target.

The positioning algorithm should choose:

```text id="4nqfcy"
top-right
top-left
bottom-right
bottom-left
```

depending on available viewport space.

---

# 15. Selection State

The inspector maintains:

```text id="t6x7cm"
hoveredElement
selectedElement
```

These are distinct.

Hover:

```text id="j8p4ai"
Temporary
```

Selection:

```text id="7m8r9k"
Persistent until action/change
```

---

# 16. Element Reference

The system should not pass raw DOM nodes throughout the application.

Instead, it creates an internal reference.

Conceptual model:

```json id="b3u6yr"
{
  "elementId": "el_00042",
  "tagName": "DIV",
  "id": "sidebar",
  "classes": [
    "sidebar",
    "right-column"
  ],
  "selector": "#sidebar",
  "rect": {
    "x": 1200,
    "y": 120,
    "width": 320,
    "height": 850
  }
}
```

The reference is a description of the current target.

---

# 17. Element Metadata

The inspector should expose the following metadata.

Required:

```text id="p0gy2x"
TAG
ID
CLASS
CSS SELECTOR
WIDTH
HEIGHT
```

Optional:

```text id="9f4nqm"
ROLE
ARIA LABEL
DATA ATTRIBUTES
POSITION
PARENT
CHILD COUNT
```

---

# 18. Metadata Collection Strategy

Metadata should be collected in stages.

### Hover

Only lightweight information:

```text id="6qg4o6"
tagName
id
class
dimensions
```

### Selection

Collect deeper information:

```text id="tv4h9s"
attributes
selector
parent
children
role
aria
```

This reduces runtime overhead.

---

# 19. Tag Display

HTML tags should be normalized to uppercase for display:

```text id="x5x1x7"
DIV
ARTICLE
HEADER
ASIDE
IMG
VIDEO
IFRAME
SECTION
NAV
```

The underlying DOM value remains lowercase as provided by the browser where applicable.

---

# 20. Class Display

If an element has multiple classes:

```text id="c8e4j4"
article
news
featured
```

the UI may display:

```text id="czp5ol"
.article.news.featured
```

Long class lists should be truncated visually while remaining accessible through the detailed inspector.

---

# 21. ID Display

If an ID exists:

```text id="h3l2pf"
#article-content
```

The ID should be displayed separately from classes.

The selector engine may use it as the primary selector candidate.

---

# 22. CSS Selector Generation

Selector generation is a core capability.

The system should attempt to produce the shortest stable selector that identifies the intended element.

Priority:

```text id="4s4j6u"
1. Unique ID
2. Unique stable class
3. Semantic attributes
4. Tag + class
5. Tag + attribute
6. Structural selector
```

---

# 23. Selector Validation

Every generated selector should be tested against the current DOM.

For a unique selector:

```text id="d8f7s5"
document.querySelectorAll(selector).length === 1
```

If not unique, the selector must be refined.

The engine must never display a selector as "unique" without validation.

---

# 24. Stable Selector Principle

The selector:

```text id="v1w9cc"
body > div:nth-child(4) > div:nth-child(2)
```

may technically identify an element but is fragile.

Prefer:

```text id="5syh2x"
.article-sidebar
```

if it is stable and sufficiently specific.

The selector engine should optimize for:

```text id="7p7wqg"
Stability
Readability
Specificity
```

in that order.

---

# 25. Selector Specificity Levels

The inspector may expose:

```text id="9hm8nd"
ELEMENT
CLASS
ID
CSS SELECTOR
```

For example:

```text id="20c9f0"
Element:
DIV

Class:
.advertisement

Selector:
div.advertisement

Unique Selector:
#top-banner
```

This gives advanced users control without forcing them to manually construct selectors.

---

# 26. Parent Navigation

The inspector must support:

```text id="bd0z7c"
Select Parent
```

Example:

```text id="h5d2q7"
SPAN
 ↓
DIV
 ↓
ARTICLE
 ↓
MAIN
```

The operator can progressively move upward.

This is critical when a user initially selects a small child inside a larger unwanted block.

---

# 27. Parent Selection Algorithm

When selecting a parent:

```text id="t9j8x2"
current.parentElement
```

must be used rather than generic DOM traversal.

The system should stop at:

```text id="8d2j3s"
document.documentElement
```

and must never move into the NewsClean root.

---

# 28. Children Navigation

The inspector should also support:

```text id="z1r8nv"
Select Child
```

For multiple children, the UI should expose a list.

Example:

```text id="d7qf7q"
ARTICLE
├── HEADER
├── H1
├── IMG
├── DIV
└── FOOTER
```

The user can select one descendant.

---

# 29. Child Explorer

A future expanded inspector may provide:

```text id="c3p2sa"
Children
────────────────
HEADER
H1
IMG
DIV.article-body
FOOTER
```

This is particularly useful when the visual elements overlap or are difficult to select directly.

---

# 30. Delete Action

After selection:

```text id="1ft5yb"
Delete
```

should dispatch:

```text id="3zj2qf"
RemoveElementCommand
```

The inspector itself must not call:

```text id="s2r2yh"
element.remove()
```

directly.

The action must pass through the Mutation Engine defined in `03-ARCHITECTURE.md`.

---

# 31. Hide Action

Hide should create a reversible visual mutation.

The inspector dispatches:

```text id="m3d2d7"
HideElementCommand
```

The DOM Mutation Engine owns the actual implementation.

---

# 32. Keep Action

Keep creates an editorial protection state.

Conceptually:

```text id="0m3q3g"
selectedElement
     ↓
KEEP
     ↓
Cleanup Engine
```

Keep must not permanently alter the page by itself.

It creates an editorial rule or protected reference.

---

# 33. Delete All Matching

The inspector should expose:

```text id="7a8x3y"
Delete All Matching
```

when the selected element has a meaningful selector.

Example:

```text id="8s5y6k"
Selected:
.advertisement

Matches:
7 elements
```

The UI should show the count before applying the action.

Example:

```text id="9s9j2v"
Delete 7 matching elements?
```

The operation must be represented as one logical command for Undo/Redo.

---

# 34. Match Preview

Before deleting multiple matches, NewsClean should visually preview them.

Example:

```text id="4h7b4p"
5 matching elements
```

The overlay may highlight all matching regions.

The user can then:

```text id="5h3t9a"
Apply
Cancel
```

This prevents accidental mass deletion.

---

# 35. Multi-Selection

Multi-selection is not mandatory for the MVP.

However, the architecture should permit:

```text id="0z5p2f"
selectedElements[]
```

instead of hard-coding a single selected element.

This enables future features such as:

```text id="8q6w4p"
Delete Selected
Hide Selected
Keep Selected
Group as Rule
```

---

# 36. Selection History

Selection itself does not need to enter the Undo/Redo mutation history.

Example:

```text id="b2o4r8"
Select A
Select B
Select C
```

should not produce three Undo states.

Only DOM/editorial mutations enter the command history.

---

# 37. Selection Persistence

The selected element should remain selected while the inspector action panel is open.

If the element is removed:

```text id="2o0k5m"
selectedElement → null
```

The inspector should automatically return to hover mode.

---

# 38. Removed Element Handling

If a selected element is removed by another operation, the inspector must detect that its DOM reference is no longer connected.

Check:

```text id="l6w9fj"
element.isConnected
```

If false:

```text id="8f8qf0"
clear selection
```

The system must never attempt to access stale nodes.

---

# 39. Dynamic DOM Handling

Modern frameworks can replace DOM nodes without changing the visible content.

Therefore:

```text id="7v4t1a"
element reference
```

may become invalid.

The inspector should re-resolve selection where possible using the element reference metadata.

Possible re-resolution signals:

```text id="p0u3se"
Selector
Tag
ID
Class
Parent context
```

Re-resolution must be conservative.

Incorrectly selecting a different element is worse than losing the selection.

---

# 40. Shadow DOM

Shadow DOM creates a boundary between the host and internal nodes.

The MVP should:

- Detect shadow hosts.
- Avoid misleading selector generation.
- Clearly indicate when the target is inside a Shadow DOM.
- Avoid pretending that inaccessible internal elements are normal document descendants.

Example:

```text id="y1k7b4"
DIV
Shadow Root
```

Advanced Shadow DOM inspection may be implemented later.

---

# 41. iframe Handling

For same-origin accessible frames, inspection may eventually be extended.

For cross-origin iframes:

```text id="r3h7e8"
<iframe>
```

is treated as the selectable unit.

The inspector must not attempt unauthorized DOM traversal into the frame.

---

# 42. SVG Handling

SVG elements must be treated as regular selectable DOM elements.

Examples:

```text id="11f7bq"
svg
path
g
circle
rect
```

The inspector should display their tag names correctly.

For SVG, bounding box measurement may require SVG-specific handling where `getBoundingClientRect()` is insufficient for semantic interpretation.

---

# 43. Image Handling

For:

```text id="9y7x3m"
<img>
```

the inspector should expose:

```text id="c3a4s8"
Rendered width
Rendered height
Natural width
Natural height
Source availability
```

The actual source URL should not be exposed unnecessarily in the compact UI.

Advanced inspection may reveal it.

---

# 44. Text Content

The inspector should not display full text content during hover.

This could:

- Cause performance problems.
- Expose large article text unnecessarily.
- Make the UI noisy.

After selection, the inspector may display a short text preview.

Example:

```text id="7g4f7p"
"Le gouvernement annonce..."
```

with truncation.

---

# 45. Computed Style

Computed style is expensive and should not be collected continuously.

It should be an advanced selected-element feature.

Potential information:

```text id="q5v9ae"
display
position
visibility
overflow
z-index
font-size
```

This can help diagnose why an element behaves unexpectedly.

It is not required for basic cleanup.

---

# 46. Bounding Geometry

The inspector must use `getBoundingClientRect()` for visual geometry.

Required properties:

```text id="x5x4ca"
x
y
width
height
top
right
bottom
left
```

The values should be normalized to CSS pixels.

---

# 47. Scroll Awareness

Bounding rectangles are viewport-relative.

The inspector should understand:

```text id="6q9l6c"
viewport coordinates
document coordinates
```

When needed:

```text id="yr7qv4"
documentX = rect.left + scrollX
documentY = rect.top + scrollY
```

This becomes important for full-page capture.

---

# 48. Overlay Synchronization

The highlight overlay must update when:

```text id="1c8s7r"
scroll
resize
zoom
DOM mutation
selected element geometry changes
```

Updates should be throttled through `requestAnimationFrame`.

The inspector should not attach expensive independent listeners for every element.

---

# 49. Zoom Handling

Browser zoom can change the relationship between CSS pixels and physical pixels.

The inspector should operate primarily in CSS pixel coordinates.

Capture scaling belongs to the Capture Engine.

The inspector should not attempt to compensate for output resolution.

---

# 50. Inspector UI Structure

Recommended UI:

```text id="cxh6ne"
┌───────────────────────────────┐
│ DIV                           │
│ .advertisement                │
│                               │
│ 320 × 250                     │
│                               │
│ #ad-top                       │
├───────────────────────────────┤
│ Delete     Hide      Keep     │
│ Parent     Children           │
│ Delete All Matching           │
└───────────────────────────────┘
```

Advanced section:

```text id="m7g1u9"
Selector
CSS Path
Role
ARIA
Attributes
```

---

# 51. Contextual Action Menu

The action menu should appear near the selected element.

It should not always remain fixed to the viewport.

However, if the selected element is near the edge of the viewport, the menu must reposition automatically.

Priority:

```text id="i1v7rq"
Near target
↓
Inside viewport
↓
No overlap with critical content
```

---

# 52. Inspector Toolbar

The main toolbar should show:

```text id="x4h7uq"
Inspect ●
```

when active.

Example:

```text id="w3k7r0"
[Frozen] [Inspecting] [Undo] [Redo] [Capture]
```

The current mode must be obvious.

---

# 53. Escape Behavior

`Esc` should:

```text id="l8r6yw"
close action menu
```

If no menu is open:

```text id="7e0qk3"
exit inspection mode
```

It should not automatically unfreeze the page.

Freeze state and Inspector state are independent.

---

# 54. Click Behavior

Clicking an element while inspecting:

```text id="1c5l67"
hovered element
      ↓
selected element
```

The selection should persist until:

```text id="4sl0c1"
action
new selection
exit inspector
```

---

# 55. Double Click

Double-click may eventually be used for:

```text id="r8a9x7"
Select Parent
```

but should not be part of the MVP unless testing demonstrates clear usability value.

Avoid overloaded gestures.

---

# 56. Right Click

Right-click should not replace the browser context menu in the MVP.

A custom context menu may be considered later.

Preserving native browser interaction reduces interference with websites.

---

# 57. Accessibility

The NewsClean UI must itself be accessible.

Required:

```text id="n0k7s5"
Keyboard navigation
Visible focus
ARIA labels
Sufficient contrast
Screen-reader labels
```

The target webpage's accessibility should not be degraded unnecessarily by the inspector overlay.

---

# 58. Performance Budget

Inspector operations should follow this budget:

```text id="yqv8r3"
Pointer hit test:
O(1) browser hit test

Hover:
Minimal DOM work

Selection:
Moderate metadata work

Selector generation:
Only after selection

Computed style:
Optional / advanced

Full subtree analysis:
Explicit action only
```

The inspector must never perform a complete DOM analysis on every mouse movement.

---

# 59. DOM Traversal Rules

General traversal should be explicit.

Allowed operations include:

```text id="l0l5w8"
parentElement
children
querySelector
querySelectorAll
closest
matches
```

Avoid uncontrolled:

```text id="r3y9x2"
document.querySelectorAll("*")
```

during normal interaction.

Full-document scans belong to explicit analysis operations.

---

# 60. Inspector Service Contract

Conceptual interface:

```ts id="r9f9hf"
interface DOMInspector {
  activate(): void;
  deactivate(): void;

  getHoveredElement(): ElementReference | null;
  getSelectedElement(): ElementReference | null;

  select(element: Element): void;
  selectParent(): void;
  selectChildren(): ElementReference[];

  clearSelection(): void;

  getMetadata(element: Element): ElementMetadata;
  getSelector(element: Element): SelectorResult;
}
```

The implementation may evolve, but the responsibilities should remain stable.

---

# 61. Selection Service Contract

The Selection Engine should remain separate from the visual inspector.

Conceptual interface:

```ts id="1qz7h4"
interface SelectionEngine {
  setHovered(element: Element | null): void;
  setSelected(element: Element | null): void;
  getHovered(): Element | null;
  getSelected(): Element | null;
  clear(): void;
}
```

This separation allows future multi-selection.

---

# 62. Selector Service Contract

Conceptual:

```ts id="f1s7x5"
interface SelectorEngine {
  generate(element: Element): SelectorResult;
  matches(selector: string): Element[];
  isUnique(selector: string): boolean;
}
```

The Selector Engine must remain independent from UI.

---

# 63. Selector Result

Example:

```json id="x4i5y8"
{
  "selector": ".article-sidebar",
  "unique": true,
  "specificity": "class",
  "matchCount": 1,
  "confidence": 0.94
}
```

The `confidence` field is optional and should not imply AI.

It can represent selector stability heuristics.

---

# 64. Action Dispatch

The inspector should translate UI actions into domain commands.

Example:

```text id="z9j8v3"
User clicks Delete
       ↓
Inspector
       ↓
Action Dispatcher
       ↓
RemoveElementCommand
       ↓
Mutation Engine
       ↓
History Engine
       ↓
DOM
```

This preserves the architecture established in `03-ARCHITECTURE.md`.

---

# 65. Error Handling

Potential errors:

```text id="5aj2j5"
Target disappeared
Selector invalid
Selector no longer matches
Cross-origin boundary
Shadow DOM boundary
Element detached
DOM changed during operation
```

The inspector should handle these without crashing the session.

Example:

```text id="9khp3w"
Element is no longer available.
Select another element.
```

---

# 66. Security

Page DOM is untrusted input.

The inspector must not execute:

```text id="r2w0m9"
inline scripts
attribute event handlers
page-provided JavaScript
```

Attribute values displayed in the UI must be treated as text.

Never inject arbitrary page strings into `innerHTML`.

Use safe text rendering.

---

# 67. Inspector and Freeze Dependency

The inspector should normally activate after:

```text id="5w2n0h"
Freeze State = FROZEN
```

However, the architecture may allow inspection in:

```text id="q6o4r2"
ACTIVE
```

for diagnostic purposes.

Production UX should prefer:

```text id="t3q1cv"
FREEZE → INSPECT
```

because the goal is deterministic cleanup.

---

# 68. Inspector and Cleanup Dependency

The inspector identifies targets.

Cleanup owns editorial decisions.

Therefore:

```text id="q2m8ar"
Inspector
    ↓
Target
    ↓
Cleanup Action
```

The inspector should not contain rules such as:

```text id="3zq2h1"
"ads are bad"
```

That belongs to Cleanup Engine.

---

# 69. Inspector and Presets

The inspector may generate a selector that becomes a preset rule.

Workflow:

```text id="y2x5v4"
Select Element
    ↓
Generate Selector
    ↓
Save as Rule
    ↓
Preset
```

This is an important bridge between manual work and automation.

---

# 70. Inspector and Capture

The inspector should support:

```text id="0n6yq9"
Capture Selection
```

by providing a selected element reference to the Capture Engine.

The Capture Engine then determines the actual rendering strategy.

The inspector must not perform image rendering.

---

# 71. Acceptance Criteria

The DOM Inspector is MVP-complete when the user can:

```text id="br4t8x"
1. Activate Inspector Mode.
2. Hover over webpage elements.
3. See a stable highlight.
4. Select an element.
5. See tag, ID, class and dimensions.
6. See a generated CSS selector.
7. Select the parent.
8. Inspect children.
9. Delete the selected element through Mutation Engine.
10. Hide the selected element.
11. Mark the selected element as Keep.
12. Preview matching selector elements.
13. Delete all matching elements through a single command.
14. Exit Inspector without altering page content.
15. Avoid selecting NewsClean's own UI.
16. Handle detached elements safely.
17. Handle cross-origin iframes as boundaries.
18. Continue operating on large pages without obvious pointer lag.
```

---

# 72. Future Extensions

Potential future capabilities:

```text id="u2q7r4"
Multi-select
DOM tree explorer
Advanced CSS selector editor
Computed style inspector
Accessibility tree inspection
Shadow DOM inspection
Same-origin iframe inspection
Visual grouping
Element labeling
Smart semantic classification
AI-powered element identification
```

These must extend the existing inspector architecture rather than bypassing it.

---

# 73. Final Interaction Model

The intended interaction is:

```text id="8y7v8w"
                  PAGE
                   │
                   ▼
              [ INSPECT ]
                   │
                   ▼
             HOVER ELEMENT
                   │
                   ▼
              HIGHLIGHT
                   │
                   ▼
                CLICK
                   │
                   ▼
             ELEMENT INFO
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
       DELETE     HIDE     KEEP
          │        │        │
          └────────┼────────┘
                   ▼
             DOMAIN ACTION
                   │
                   ▼
           MUTATION ENGINE
```

---

# 74. Architectural Invariants

The following rules are mandatory:

```text id="s4g5t1"
1. Inspector never directly mutates webpage content.
2. Highlighting must not modify target element styles.
3. NewsClean UI must never become an inspection target.
4. Hover operations must remain lightweight.
5. Selector generation occurs after target selection.
6. Full DOM scans are explicit operations only.
7. Undo/Redo belongs to the Mutation/History system.
8. Selection state is not mutation history.
9. Stale DOM references must be detected.
10. Cross-origin iframe boundaries must be respected.
11. Page-provided strings are untrusted.
12. React must not own the webpage DOM.
13. Inspector and Cleanup remain separate concerns.
14. Inspector state and Freeze state remain separate.
15. Multi-selection should remain architecturally possible.
```

---

# 75. Next Document

The next document is:

`06-CLEANUP-ENGINE.md`

It will define the actual editorial transformation layer:

```text id="m4x6y9"
Delete
Hide
Keep
Delete All Matching
Cleanup Rules
Smart Cleanup
Keep Mode
Mutation Commands
Undo / Redo Integration
Cleanup Proposals
Rule Evaluation
Selector Matching
Safety Checks
```

The Cleanup Engine will consume the targets produced by the DOM Inspector and transform them into controlled, reversible editorial operations.