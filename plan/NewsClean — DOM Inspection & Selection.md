# NewsClean — DOM Inspection & Selection

**Document ID:** 05-DOM-INSPECTOR  
**Version:** 0.1.0  
**Status:** Foundation  
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`

---

## 1. Purpose

The DOM Inspector is the primary interaction layer between the newsroom operator and the structure of a webpage.

Its purpose is to make the DOM visually understandable without requiring the operator to know HTML or CSS. The system converts a pointer hit into an editorial action:

```
Pointer → Visual Element → DOM Node → Element Information → Editorial Action
```

The operator should be able to point at any accessible webpage component and understand what it represents structurally.

The core principle is:

> **Select visually, understand structurally, act precisely.**

## 2. Problem

A modern webpage may contain hundreds or thousands of DOM nodes. A visual screenshot does not reveal element tags (`<div>`, `<article>`, `<aside>`, `<header>`, `<section>`, `<img>`, `<iframe>`) nor their identifying information (`#id`, `.class`, `[data-*]`, `role`, CSS selector).

Traditional browser developer tools expose this information but are too technical and disruptive for newsroom workflows. NewsClean therefore provides a specialized visual inspector.

## 3. Product Objective

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

## 4. Inspector Workflow

The basic workflow:

```
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

Example: hover over an ADVERTISEMENT → select → inspect the DIV `.ad-container` (320 × 250) → Delete.

## 5. Inspector Activation

Inspection should only become active when explicitly requested.

Primary action: **Inspect**. Keyboard shortcut: **I**, when not conflicting with the active page or browser environment.

When Inspector Mode is active, the cursor becomes the inspection cursor. The page itself must remain usable.

## 6. Inspection Modes

The MVP supports `HOVER` and `SELECT`.

Future modes may include:

- `MULTI_SELECT`
- `KEEP_REGION`
- `COMPARE`

## 7. Hover Detection

The inspector uses pointer coordinates to identify the target element via `document.elementFromPoint(x, y)`. This is preferable to traversing the entire DOM on every pointer movement.

The algorithm:

```
pointermove → coordinates → elementFromPoint() → resolve target → filter NewsClean UI → highlight
```

## 8. Pointer Event Throttling

`pointermove` can fire at high frequency, so the inspector must not perform expensive work on every event.

Recommended strategy: throttle hit testing through `requestAnimationFrame`, synchronizing inspection work with the browser rendering cycle.

During hover, the inspector must avoid:

- Full DOM traversal
- Computed-style extraction
- Selector generation

Those operations occur only after target stabilization or selection.

## 9. Target Resolution

The target returned by `elementFromPoint()` may be:

- NewsClean overlay
- Webpage element
- Text node proxy
- SVG element
- Shadow DOM host

The inspector must normalize this into a selectable element, and NewsClean's own UI must always be ignored.

The selected target must be an `Element`. If a pointer resolves to a special node that cannot be directly represented as an element, the inspector resolves it to the nearest valid element:

- Text → parent element
- SVG child → SVG element
- Pseudo-element → owning element

## 10. NewsClean UI Exclusion

The inspector must never select `#__newsclean__` or any descendant of the NewsClean root:

```
if (target.closest("[data-newsclean-root]")) ignore
```

The exact implementation should use an internal marker rather than relying only on an ID.

## 11. Element Highlighting

The inspector must never visually highlight elements by modifying their own CSS.

`element.style.outline` is a bad approach because it can:

- Change layout
- Trigger style recalculation
- Conflict with site CSS
- Remain after inspection
- Pollute Undo/Redo

Instead, NewsClean uses a separate overlay renderer.

## 12. Highlight Overlay

The overlay derives its rectangle from `getBoundingClientRect()` and tracks:

- `top`
- `left`
- `width`
- `height`

The overlay must be positioned independently of the target element.

## 13. Highlight Overlay Synchronization

The highlight overlay must update when the page changes:

- Scroll
- Resize
- Zoom
- DOM mutation
- Selected element geometry changes

Updates should be throttled through `requestAnimationFrame`. The inspector should not attach expensive independent listeners for every element.

## 14. Highlight Label

During hover, the UI may display a compact label such as:

```
DIV
.advertisement
320 × 250
```

The label must not obstruct the target. The positioning algorithm chooses top-right, top-left, bottom-right, or bottom-left depending on available viewport space.

## 15. Selection State

The inspector maintains `hoveredElement` and `selectedElement` as distinct values:

- **Hover** — temporary.
- **Selection** — persistent until an action, a new selection, or exiting the inspector.

## 16. Element Reference Model

The system must not pass raw DOM nodes throughout the application. Instead, it creates an internal reference describing the current target:

```json
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

## 17. Element Metadata

Required:

- TAG
- ID
- CLASS
- CSS SELECTOR
- WIDTH
- HEIGHT

Optional:

- ROLE
- ARIA LABEL
- DATA ATTRIBUTES
- POSITION
- PARENT
- CHILD COUNT

## 18. Staged Metadata Strategy

Metadata should be collected in stages to reduce runtime overhead.

**Hover** — lightweight information only:

- tagName
- id
- class
- dimensions

**Selection** — deeper information:

- attributes
- selector
- parent
- children
- role
- aria

## 19. Display Normalization

HTML tags are normalized to uppercase for display (DIV, ARTICLE, HEADER, ASIDE, IMG, VIDEO, IFRAME, SECTION, NAV). The underlying DOM value remains lowercase as provided by the browser.

If an element has multiple classes, the UI may display them joined, e.g. `.article.news.featured`. Long class lists should be truncated visually while remaining accessible through the detailed inspector.

If an ID exists (e.g. `#article-content`), it is displayed separately from classes, and the selector engine may use it as the primary selector candidate.

## 20. CSS Selector Generation

Selector generation is a core capability. The system should attempt to produce the shortest stable selector that identifies the intended element, using this priority:

1. Unique ID
2. Unique stable class
3. Semantic attributes
4. Tag + class
5. Tag + attribute
6. Structural selector

## 21. Selector Validation

Every generated selector must be tested against the current DOM:

```
document.querySelectorAll(selector).length === 1
```

If the selector is not unique, it must be refined. The engine must never display a selector as "unique" without validation.

## 22. Stable Selector Principle

A structural selector such as `body > div:nth-child(4) > div:nth-child(2)` may technically identify an element but is fragile. Prefer `.article-sidebar` when it is stable and sufficiently specific.

The selector engine should optimize for:

1. Stability
2. Readability
3. Specificity

in that order.

The inspector may expose specificity levels:

- ELEMENT → `DIV`
- CLASS → `.advertisement`
- CSS SELECTOR → `div.advertisement`
- UNIQUE SELECTOR → `#top-banner`

This gives advanced users control without forcing them to manually construct selectors.

## 23. Parent Navigation

The inspector supports **Select Parent** using `current.parentElement` rather than generic DOM traversal.

The system stops at `document.documentElement` and must never move into the NewsClean root.

Example progression: SPAN → DIV → ARTICLE → MAIN.

This is critical when a user initially selects a small child inside a larger unwanted block — the operator can progressively move upward.

## 24. Children Navigation

The inspector also supports **Select Child**. For multiple children, the UI exposes a list:

```
ARTICLE
├── HEADER
├── H1
├── IMG
├── DIV
└── FOOTER
```

The user can select one descendant.

A future expanded Child Explorer (HEADER, H1, IMG, DIV.article-body, FOOTER) is particularly useful when visual elements overlap or are difficult to select directly.

## 25. Delete Action

After selection, **Delete** should dispatch `RemoveElementCommand`. The inspector itself must never call `element.remove()` directly — the action must pass through the Mutation Engine defined in `03-ARCHITECTURE.md`.

## 26. Hide Action

**Hide** should create a reversible visual mutation. The inspector dispatches `HideElementCommand`; the DOM Mutation Engine owns the actual implementation.

## 27. Keep Action

**Keep** creates an editorial protection state. Keep must not permanently alter the page by itself; it creates an editorial rule or protected reference.

The flow: selectedElement → KEEP → Cleanup Engine.

## 28. Delete All Matching

The inspector should expose **Delete All Matching** when the selected element has a meaningful selector.

Example:

```
Selected: .advertisement
Matches:  7 elements
```

The UI should show the count before applying the action (e.g. "Delete 7 matching elements?"). The operation must be represented as one logical command for Undo/Redo.

## 29. Match Preview

Before deleting multiple matches, NewsClean should visually preview them. The overlay may highlight all matching regions, and the user can then Apply or Cancel.

This prevents accidental mass deletion.

## 30. Action Dispatch Chain

The inspector translates UI actions into domain commands. For example, clicking Delete follows the chain: User clicks Delete → Inspector → Action Dispatcher → `RemoveElementCommand` → Mutation Engine → History Engine → DOM.

This preserves the architecture established in `03-ARCHITECTURE.md`.

## 31. Multi-Selection

Multi-selection is not mandatory for the MVP. However, the architecture should permit `selectedElements[]` instead of hard-coding a single selected element.

This enables future features such as:

- Delete Selected
- Hide Selected
- Keep Selected
- Group as Rule

## 32. Selection History

Selection itself does not need to enter the Undo/Redo mutation history. Selecting A, then B, then C should not produce three Undo states. Only DOM/editorial mutations enter the command history.

## 33. Selection Persistence

The selected element should remain selected while the inspector action panel is open. If the element is removed, `selectedElement` becomes null and the inspector automatically returns to hover mode.

## 34. Removed Element Handling

If a selected element is removed by another operation, the inspector must detect that its DOM reference is no longer connected:

```
element.isConnected === false → clear selection
```

The system must never attempt to access stale nodes.

## 35. Dynamic DOM Re-resolution

Modern frameworks can replace DOM nodes without changing the visible content, so an element reference may become invalid. The inspector should re-resolve the selection where possible using the element reference metadata.

Re-resolution signals:

- Selector
- Tag
- ID
- Class
- Parent context

Re-resolution must be conservative:

> **Incorrectly selecting a different element is worse than losing the selection.**

## 36. Shadow DOM

Shadow DOM creates a boundary between the host and internal nodes. The MVP should:

- Detect shadow hosts.
- Avoid misleading selector generation.
- Clearly indicate when the target is inside a Shadow DOM.
- Avoid pretending that inaccessible internal elements are normal document descendants.

Advanced Shadow DOM inspection may be implemented later.

## 37. iframe Handling

For same-origin accessible frames, inspection may eventually be extended. For cross-origin iframes, the `<iframe>` itself is treated as the selectable unit — the inspector must not attempt unauthorized DOM traversal into the frame.

## 38. SVG Handling

SVG elements must be treated as regular selectable DOM elements:

- svg
- path
- g
- circle
- rect

The inspector should display their tag names correctly. For SVG, bounding-box measurement may require SVG-specific handling where `getBoundingClientRect()` is insufficient for semantic interpretation.

## 39. Image Handling

For `<img>` elements, the inspector should expose:

- Rendered width
- Rendered height
- Natural width
- Natural height
- Source availability

The actual source URL should not be exposed unnecessarily in the compact UI; advanced inspection may reveal it.

## 40. Text Content

The inspector should not display full text content during hover — this could cause performance problems, expose large article text unnecessarily, and make the UI noisy.

After selection, the inspector may display a short truncated text preview, e.g. "Le gouvernement annonce...".

## 41. Computed Style

Computed style is expensive and should not be collected continuously. It is an advanced selected-element feature exposing:

- display
- position
- visibility
- overflow
- z-index
- font-size

This can help diagnose why an element behaves unexpectedly, but it is not required for basic cleanup.

## 42. Bounding Geometry

The inspector must use `getBoundingClientRect()` for visual geometry, covering:

- x, y
- width, height
- top, right, bottom, left

The values should be normalized to CSS pixels.

## 43. Scroll Awareness

Bounding rectangles are viewport-relative. The inspector should understand the difference between viewport coordinates and document coordinates.

When document coordinates are needed — important for full-page capture:

```
documentX = rect.left + scrollX
documentY = rect.top + scrollY
```

## 44. Zoom Handling

Browser zoom can change the relationship between CSS pixels and physical pixels. The inspector should operate primarily in CSS pixel coordinates.

Capture scaling belongs to the Capture Engine; the inspector must not attempt to compensate for output resolution.

## 45. Overlay Synchronization Recap

The highlight overlay updates on scroll, resize, zoom, DOM mutation, and geometry changes, throttled through `requestAnimationFrame`, without per-element listeners. This keeps inspection responsive on large pages.

## 46. Inspector UI Structure

Recommended panel layout:

```
DIV
.advertisement
320 × 250
#ad-top
──────────────────
Delete   Hide   Keep
Parent   Children
Delete All Matching
```

Advanced section:

- Selector
- CSS Path
- Role
- ARIA
- Attributes

## 47. Contextual Action Menu

The action menu should appear near the selected element and not always remain fixed to the viewport. If the selected element is near the edge of the viewport, the menu must reposition automatically.

Priority:

1. Near target
2. Inside viewport
3. No overlap with critical content

## 48. Inspector Toolbar

The main toolbar should show `Inspect ●` when active, e.g. `[Frozen] [Inspecting] [Undo] [Redo] [Capture]`. The current mode must be obvious.

## 49. Escape Behavior

`Esc` should close the action menu. If no menu is open, it exits inspection mode.

Esc must not automatically unfreeze the page — Freeze state and Inspector state are independent.

## 50. Click Behavior

Clicking an element while inspecting turns the hovered element into the selected element. Selection persists until an action, a new selection, or exiting the inspector.

## 51. Double Click

Double-click may eventually be used for Select Parent, but should not be part of the MVP unless testing demonstrates clear usability value. Avoid overloaded gestures.

## 52. Right Click

Right-click should not replace the browser context menu in the MVP; a custom context menu may be considered later. Preserving native browser interaction reduces interference with websites.

## 53. Accessibility

The NewsClean UI must itself be accessible:

- Keyboard navigation
- Visible focus
- ARIA labels
- Sufficient contrast
- Screen-reader labels

The target webpage's accessibility should not be degraded unnecessarily by the inspector overlay.

## 54. Performance Budget

Inspector operations should follow this budget:

| Operation | Budget |
|---|---|
| Pointer hit test | O(1) browser hit test |
| Hover | Minimal DOM work |
| Selection | Moderate metadata work |
| Selector generation | Only after selection |
| Computed style | Optional / advanced |
| Full subtree analysis | Explicit action only |

The inspector must never perform a complete DOM analysis on every mouse movement.

## 55. DOM Traversal Rules

General traversal should be explicit. Allowed operations include:

- `parentElement`
- `children`
- `querySelector`
- `querySelectorAll`
- `closest`
- `matches`

Avoid uncontrolled `document.querySelectorAll("*")` during normal interaction. Full-document scans belong to explicit analysis operations.

## 56. Inspector Service Contract

```ts
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

## 57. Selection Service Contract

The Selection Engine should remain separate from the visual inspector, which allows future multi-selection:

```ts
interface SelectionEngine {
  setHovered(element: Element | null): void;
  setSelected(element: Element | null): void;
  getHovered(): Element | null;
  getSelected(): Element | null;
  clear(): void;
}
```

## 58. Selector Service Contract

The Selector Engine must remain independent from the UI:

```ts
interface SelectorEngine {
  generate(element: Element): SelectorResult;
  matches(selector: string): Element[];
  isUnique(selector: string): boolean;
}
```

## 59. Selector Result

```json
{
  "selector": ".article-sidebar",
  "unique": true,
  "specificity": "class",
  "matchCount": 1,
  "confidence": 0.94
}
```

The `confidence` field is optional and should not imply AI; it can represent selector stability heuristics.

## 60. Error Handling

Potential errors:

- Target disappeared
- Selector invalid
- Selector no longer matches
- Cross-origin boundary
- Shadow DOM boundary
- Element detached
- DOM changed during operation

The inspector should handle these without crashing the session — e.g. "Element is no longer available. Select another element."

## 61. Security

Page DOM is untrusted input. The inspector must not execute:

- Inline scripts
- Attribute event handlers
- Page-provided JavaScript

Attribute values displayed in the UI must be treated as text. Never inject arbitrary page strings into `innerHTML`; use safe text rendering.

## 62. Inspector and Freeze Dependency

The inspector should normally activate after Freeze State = `FROZEN`. The architecture may allow inspection in `ACTIVE` for diagnostic purposes.

Production UX should prefer `FREEZE → INSPECT`, because the goal is deterministic cleanup.

## 63. Inspector and Cleanup Dependency

The inspector identifies targets; Cleanup owns editorial decisions. The inspector should not contain rules such as "ads are bad" — that belongs to the Cleanup Engine.

## 64. Inspector and Presets

The inspector may generate a selector that becomes a preset rule:

```
Select Element → Generate Selector → Save as Rule → Preset
```

This is an important bridge between manual work and automation.

## 65. Inspector and Capture

The inspector supports **Capture Selection** by providing a selected element reference to the Capture Engine, which then determines the actual rendering strategy. The inspector must not perform image rendering.

## 66. Acceptance Criteria

The DOM Inspector is MVP-complete when the user can:

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

## 67. Architectural Invariants

The following rules are mandatory:

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

## 68. Future Extensions

Potential future capabilities:

- Multi-select
- DOM tree explorer
- Advanced CSS selector editor
- Computed style inspector
- Accessibility tree inspection
- Shadow DOM inspection
- Same-origin iframe inspection
- Visual grouping
- Element labeling
- Smart semantic classification
- AI-powered element identification

These must extend the existing inspector architecture rather than bypassing it.
