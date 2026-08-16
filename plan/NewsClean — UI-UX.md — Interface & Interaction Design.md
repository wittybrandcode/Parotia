# NewsClean — UI / UX: Interface & Interaction Design

**Document ID:** `10-UI-UX`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `07-ARTICLE-EXTRACTION.md`, `08-CAPTURE-ENGINE.md`, `09-PRESET-SYSTEM.md`

## Purpose

NewsClean is not a conventional popup extension. It is a production tool for newsroom operators who transform a noisy news webpage into a clean, capture-ready editorial asset with minimum interaction.

Optimize for: Speed, Precision, Visibility, Reversibility, Low cognitive load.

Primary workflow: OPEN ARTICLE → FREEZE → INSPECT / EXTRACT → CLEAN → REVIEW → CAPTURE PNG.

## UX Principle

> The webpage remains the workspace. NewsClean becomes a temporary control surface over it.

The user should never feel that they left the article to operate the extension. The primary interface is therefore an overlay on the current page, not a large extension popup.

## UX Priorities

Interaction hierarchy:

1. Capture
2. Clean
3. Inspect
4. Undo / Restore
5. Preset
6. Extraction information
7. Configuration

The primary workflow must remain visually dominant.

## Core Interface

- Not a popup; the primary interface is an overlay on the page.
- Single root: `<div id="newsclean-root"></div>`, isolated from page styles.
- UI layers: Toolbar, Inspector Overlay, Selection Overlay, Proposal Overlay, Toast Layer, Modal Layer.
- Main UI is a compact floating toolbar attached to the browser viewport (top center or top right; exact position configurable). It must avoid interfering with the website's primary content.

### Toolbar Structure

`● NewsClean │ Freeze │ Inspect │ Clean │ PNG`

The active mode must be visually obvious.

### Toolbar Density

- Compact: icon + short label + tooltip.
- Avoid: large cards, large headings, excessive explanatory text.
- The operator should understand the interface within seconds.

### Actions

Primary: Freeze, Inspect, Clean, Capture.
Secondary: Undo, Redo, Reset, Preset, Settings.

### Freeze Button

States: `FREEZE`, `FREEZING`, `FROZEN`, `DEGRADED`. Visually distinguish "not frozen" from "stable capture state".

Click: `FREEZE` → `FREEZING...` → `FROZEN`, with a small confirmation toast ("Page frozen"), never a blocking dialog.

Freeze failure: show "Freeze unavailable" with an actionable explanation (e.g. "Page is still changing. Capture may be unstable."). The user may still inspect the page where possible.

### Capture Button

- Label: `CAPTURE PNG` — the output format must be immediately clear.
- Mode menu: Visible View / Selected Element / Full Page; Scale 1× / 2× (MVP may expose only Visible / Element / Full Page with scale automatically determined).
- Default mode: if the article has been successfully extracted, `Capture Article` is the preferred action; otherwise `Visible View` is the safe default.
- Preparation checklist (compact status indicator): Page frozen ✓ / Cleanup applied ✓ / Target validated ✓ / Fonts ready ✓ / Images ready ✓. The NewsClean UI must disappear before the browser screenshot occurs.
- Progress: "Capturing article… Segment 3 / 8". The progress UI must disappear before each actual screenshot segment.
- Completion: "PNG ready", dimensions, size, `[Save PNG]` `[Copy]`. Copy may be disabled in MVP if clipboard support is not yet implemented.
- Preview: shows the actual PNG, not another live DOM representation; optional if performance becomes an issue for very large PNGs.
- Failure: "Capture failed" + what happened (e.g. "The page exceeds the maximum safe image size.") + actionable alternatives (Capture Selected Element, Reduce capture scale).

### Undo / Redo

- Undo is one of the most important controls, located on the toolbar. Its tooltip describes the actual operation (e.g. "Undo Delete Sidebar").
- Redo appears only when available; its disabled state must be visually clear. Undo is disabled when history is empty.

### Reset Cleanup

- Undo = one logical operation. Reset = all NewsClean cleanup changes.
- Reset requires confirmation. Exact dialog copy:

  ```
  Reset cleanup?

  All deletions, hidden elements and Keep rules
  from this session will be cleared.

  [Cancel] [Reset]
  ```

  The dialog must explicitly state: "Freeze state remains active."

### Preset Indicator & Panel

- When a site preset is detected, the toolbar shows "Preset: Example News" / `● Example News`; clicking opens the preset panel.
- Panel shows name, version, health, per-role checkmarks and [Apply Preset]:

  ```
  Example News
  Preset v3
  Healthy
  Article ✓  Title ✓  Hero Image ✓  Body ✓
  Ads 4  Sidebar 1
  [Apply Preset]
  ```

- Status: `Preset ✓` or `Preset stale`; when stale, `[Review]` is available.
- Application flow: Preset detected → Review → Apply. The UI must never immediately mutate the page; the user sees the proposed cleanup before committing.
- Proposal view:

  ```
  Preset will:
  Remove: Advertisements × 4, Sidebar × 1, Newsletter × 1
  Protect: Article, Title, Hero image
  [Cancel] [Apply]
  ```

### Smart Cleanup

- Same review model as presets:

  ```
  SMART CLEANUP — Likely noise detected:
  Advertisement 97%  Newsletter 94%
  Related content 88%  Sidebar 81%
  [Review]
  ```

  Confidence values are internal ranking indicators, not guarantees.
- Review: user approves each category individually (✓ Advertisement, ✓ Newsletter, ☐ Sidebar, ☐ Related content), then `[Apply Selected]`. This prevents aggressive automated cleanup.

## Inspect Mode

Inspect is the primary manual cleanup interaction. When activated (`INSPECT ACTIVE`), the page enters selection mode and the cursor changes to indicate SELECT ELEMENT.

- **Hover:** a lightweight NewsClean overlay around the target element. It must never modify the page's own CSS and must use the NewsClean overlay layer. A compact, unobtrusive label is shown (e.g. `ARTICLE.article`, `DIV.sidebar`).
- **Selection:** clicking selects the element, which receives a stronger visual outline. A contextual action bar appears: `DELETE │ HIDE │ KEEP │ MORE`.
- **Auto-positioning:** the contextual bar appears close to the selected element but stays inside the viewport; never clipped by the browser or viewport edge. It dynamically chooses top / bottom / left / right based on available space.
- **Selection info:** element label (e.g. `DIV.article-sidebar`) plus optional secondary info (e.g. `7 matches`) for selector-based operations.
- **Actions (MVP):** Delete, Hide, Keep. Secondary (progressively introduced): Delete Similar, Inspect Parent, Inspect Children, Copy Selector.

### Delete

- DELETE immediately removes the selected element. No confirmation is required for a single explicit user action. Undo becomes available immediately after.
- Feedback: temporary toast (e.g. "Sidebar removed"); the region disappears naturally. No animation is required; a very short fade is allowed if it does not interfere with page geometry.

### Hide

- HIDE visually removes the element while preserving its DOM representation. Feedback: "Element hidden"; the selected region disappears from the page.

### Keep

- KEEP is a protection operation and must be visually distinct. After clicking, the element receives a subtle persistent marker while editing:

  ```
  [KEEP]
  Article Body
  ```

  The marker disappears during final capture.
- Semantics: "Protect this content from automated cleanup." It must NOT imply "delete everything else immediately." Keep Mode may later turn this into a cleanup proposal.

### Delete Similar

- High-value interaction: the user selects an element (e.g. `<div class="advertisement">`) and chooses DELETE SIMILAR. NewsClean identifies the selector (`.advertisement`) and shows "5 matching elements" before applying.
- Because it affects multiple elements, a compact confirmation is required:

  ```
  Delete 5 matching elements?

  Selector:
  .advertisement

  [Cancel] [Delete 5]
  ```

- Selector preview: `Selector: .advertisement` / `Matches: 5`, with optional `[Highlight all]` so the user sees exactly what will be removed. Highlights are NewsClean overlays and never enter the capture output.

### Breadcrumb & Selector

- Compact DOM breadcrumb: `BODY › MAIN › ARTICLE › DIV.article-body › P`. Helps technical users understand the selected element; must not become a full developer inspector.
- A compact, copyable selector representation (`.article-body`) must be available; particularly useful for creating presets.

### Parent / Child Selection

- Select Parent (e.g. `P ↓ DIV.article-body ↓ ARTICLE`) makes selecting larger editorial regions faster.
- Select Child may be useful when the selection is too broad; exposed via `More` in MVP rather than the primary toolbar.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| F | Freeze / Unfreeze |
| I | Inspect |
| C | Capture |
| Delete | Delete selected |
| H | Hide selected |
| K | Keep selected |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Esc | Cancel |

- Shortcuts act only when NewsClean has focus or is in the appropriate mode.
- Never hijack normal webpage shortcuts unnecessarily.
- Esc has a consistent meaning: cancels the current inspection/selection; cancels capture when capture preparation is active and cancellation is supported.

## Feedback Model

### Toasts vs Dialogs

- **Toasts** for short-lived state changes: Page frozen, Element deleted, Element hidden, Rule applied, Preset applied, Capture complete. Never use toasts for complex decisions.
- **Dialogs** are reserved for: Reset, bulk destructive actions, preset application with significant changes, irrecoverable actions. A single manual deletion never triggers a dialog.

### Confirmation Philosophy

| Case | Treatment |
|---|---|
| Explicit + reversible | no confirmation |
| Explicit + bulk | compact confirmation |
| Automated + destructive | review |
| Irreversible | confirmation |

### Empty / Error States (exact copy)

- No article detected:

  ```
  No article structure detected.

  You can select the article manually.
  [Inspect Article]
  ```

- No matching elements for selector cleanup: "No matching elements found." Never create a fake success state.
- Errors identify What happened / Why / What the user can do:

  ```
  Preset could not identify the article.

  The site structure may have changed.

  [Use Standard Extraction]
  [Inspect Manually]
  ```

## Article Extraction

- Indicator: when extraction succeeds, "Article detected"; the toolbar shows `ARTICLE ✓` (✓ = high confidence, `?` = uncertain). Clicking opens the Article Structure panel.
- **Structure panel:** per-role checkmarks (Title, Subtitle, Hero Image, Author, Date, Body, Source) + Confidence.
- **Confidence:** communicated only as High / Medium / Low, never raw scores. Detailed numerical scores belong in diagnostics.
- **Manual override:** if extraction is uncertain (e.g. "Article: Medium confidence"), show `[Select Manually]`; the user then uses the Inspector.

## States & Modes

- **Mode indicator:** the toolbar always communicates the current mode (e.g. `MODE: INSPECT` or a highlighted `Inspect`). The user should never wonder why clicking the page selects elements instead of behaving normally.
- **Exits:** every modal mode has an obvious exit: Inspect → Esc; Preset Review → Cancel; Smart Cleanup → Cancel; Capture → Cancel where possible. No mode traps the user.
- **Disabled states:** Undo when history is empty; Capture while capture is already running; Apply Preset when preset validation fails.
- **Loading:** small indicators only ("Analyzing…", "Preparing…", "Capturing…"); avoid large blocking spinners.

### Browser Interaction Preservation

- Outside Inspect Mode, click, scroll, text selection and links behave normally.
- During Inspect Mode, click is repurposed for element selection. Inspect Mode must not navigate to links — clicking a link selects the element instead; original link behavior resumes when Inspect Mode exits.
- Inspect Mode may temporarily disable normal text selection if necessary; it must return immediately on exit.
- The browser's native right-click context menu remains available; MVP avoids replacing it.

### Interaction State Machine

```
NORMAL → FREEZE → FROZEN
       → INSPECT → INSPECTING → SELECTED
       → CLEAN → CLEANING
       → PRESET → REVIEWING
       → CAPTURE → PREPARING → CAPTURING → PREVIEW
```

Every temporary state must have a safe exit.

## UI Architecture

- **Root:** `<div id="newsclean-root"></div>`, isolated from page styles.
- **Layers:** Toolbar, Inspector Overlay, Selection Overlay, Proposal Overlay, Toast Layer, Modal Layer.
- **Style isolation:** Shadow DOM for Toolbar, Inspector controls, Modals, Toasts. This prevents website styles from affecting buttons, fonts, icons, spacing and colors inside the NewsClean interface. The overlay itself still needs viewport-coordinate calculations against the page.
- **Overlay layer:** `position: fixed` relative to the viewport; must not affect page layout.
- **Z-index:** controlled range with a centralized z-index token system; avoid arbitrary extremely large values. Order: Website → NewsClean Overlay → Toolbar → Modal.
- **Geometry:** overlays calculate target rectangles via `getBoundingClientRect()` and render at the corresponding viewport coordinates; the page is never wrapped or repositioned.
- **Scrolling:** remains natural during inspection; the overlay updates hovered/selected element geometry after scrolling.
- **Resize:** toolbar, overlay and context menu reposition on viewport resize; no horizontal overflow.
- **Responsive:** targets desktop Chrome; minimum viewport 1024px width; functional on smaller desktop windows; mobile browser support is outside MVP.

### State Ownership & Events

- The UI must not own domain state. Source of truth stays with the engines: Freeze state → Freeze Engine; Cleanup history → Cleanup / History Engine; Extraction result → Extraction Engine; Preset state → Preset Engine; Capture state → Capture Engine. The UI reflects these states.
- Event flow: ENGINE → DOMAIN EVENT → UI STATE UPDATE → RENDER (e.g. Cleanup Engine → `ELEMENT_DELETED` → Toolbar counter → "8 removed").
- UI components must not directly mutate the DOM (no `element.remove()`). The UI emits commands (e.g. `DELETE_ELEMENT`); the Cleanup Engine performs the mutation.
- Command model:

  ```
  type UICommand =
    | "FREEZE" | "INSPECT_START" | "DELETE_SELECTED"
    | "HIDE_SELECTED" | "KEEP_SELECTED"
    | "UNDO" | "REDO" | "RESET"
    | "APPLY_PRESET" | "CAPTURE";
  ```

  The command layer translates UI interaction into domain operations.

### Performance

- Inspector overlays must avoid full DOM re-render on every mouse movement; update only the necessary geometry.
- On `mousemove`: throttle / requestAnimationFrame → resolve element → update overlay; avoid expensive DOM analysis for every pointer event.
- Use `transform` where practical instead of repeatedly changing layout properties.
- Animation is minimal: toolbar appearance, context menu appearance, toast entrance. Avoid animated page elements during cleanup/capture. Respect `prefers-reduced-motion`.

## Visual Design

- **Visual language:** restrained and professional — dark neutral surface, high-contrast text, compact controls, subtle borders, minimal shadows, small radius, strong active state. Exact tokens finalized during implementation.
- **Avoid visual noise:** large gradients, heavy glass effects, large shadows, oversized icons, animated panels, decorative graphics. The page itself is the visual content.
- **Color semantics** communicate state, not decoration: Neutral = normal; Accent = active mode; Warning = degraded / uncertain; Destructive = delete; Success = completed. The exact palette belongs in Design Tokens.
- **Destructive styling:** DELETE has a clear destructive state, but the default toolbar must not become visually dominated by red; use destructive styling primarily on hover, on confirmation, and in contextual actions.
- **Keep state:** positive protection visual, clearly different from Delete and Hide.
- **Design tokens:** centralized tokens for color (bg, surface, text, muted, accent, danger, warning, success), radius (sm, md), spacing (1–3), shadow (sm). Values are implementation details.
- **Typography:** neutral system interface font; never inject the site's typography; the interface stays visually stable across websites.
- **Iconography:** simple, consistent, recognizable (Freeze, Inspect, Trash, Eye Off, Shield, Undo, Redo, Camera, Settings); always with accessible labels.

## Status & Counters

- **Status bar** (compact): Frozen / Preset: Example News / Removed: 8 / Kept: 2 — operational context without opening panels.
- **Cleanup counter:** persistent "8 removed"; clicking it opens Cleanup History (future feature).
- **Extraction status:** `Article ✓` (✓ = high confidence) or `Article ?` (? = uncertain). Do not expose implementation terminology unnecessarily.
- **Preset status:** `Preset ✓` or `Preset stale`; when stale, `[Review]` is available.

## Progressive Disclosure & Expert Mode

- Primary: Freeze, Inspect, Clean, Capture. Secondary: Preset, Extraction, Rules. Advanced: Selector, Diagnostics, Confidence, Engine state. This keeps the normal workflow fast.
- **Expert Mode (future):** CSS selector, DOM path, match count, element dimensions, computed style, extraction score, preset rule ID — valuable for technical newsroom users; must not clutter the default interface.

## Interaction with the Page

- NewsClean never permanently modifies header, navigation, CSS, JavaScript, cookies or localStorage, except explicit working-DOM transformations during the session.
- **Visual restoration:** when NewsClean is disabled or the session ends, NewsClean UI and temporary overlays are removed; cleanup modifications remain only per the active working-session lifecycle; the original page navigation is restored on reload/navigation.
- **Capture isolation:** NewsClean UI hides before capture and restores after; avoid a visible flicker where practical.

## Accessibility

- Mandatory support: keyboard navigation, visible focus, ARIA labels, screen-reader meaningful names, sufficient contrast. The interface is primarily visual, but basic accessibility remains mandatory.
- **Focus management:** opening a modal moves focus to the first actionable control; closing returns focus to the previously active control; page focus is not lost unnecessarily.
- **Tooltips:** explain unfamiliar icons (e.g. ↶ "Undo last cleanup"); avoid tooltips for obvious textual buttons.
- **Labels** describe the action, not just the icon: "Freeze page", "Inspect page elements", "Delete selected element", "Hide selected element", "Keep selected element", "Undo last cleanup", "Capture PNG".

## Onboarding

- No long tutorial. The product is learnable from the Toolbar, Tooltips and contextual hints; the basic workflow is learnable in under 1 minute. Onboarding is short and dismissible: "Freeze the page before cleaning." → "Hover to inspect elements." → "Delete unwanted elements." → Capture.
- Contextual help examples (auto-disappear): Inspect activated → "Click any page element to inspect it. Press Esc to exit." Capture opened → "Choose the visible page, selected element, or full page."

## Privacy & Telemetry

- MVP sends no external behavioral telemetry. Local diagnostics only (operation duration, capture duration, preset validation, errors) for debugging.
- Article content, page URLs and screenshots are potentially sensitive: no external analytics, no screenshot uploads, no content telemetry in MVP.

## Internationalization

- Support Arabic, French and English from the beginning; strings must not be hardcoded into components; UI language is selectable independently of the webpage language.
- Arabic UI supports `direction: rtl` for the toolbar, menus, dialogs and breadcrumbs; directional icons adapted where necessary; the page itself remains untouched.

## User Journeys

- **Primary:** Open article → NewsClean → Freeze → Preset detected → Review cleanup proposal → Apply → Inspect manually if necessary → Capture PNG → Select Article → PNG generated → Save. Minimize interactions without hiding important destructive decisions.
- **Power user:** Open → Freeze → Preset → Capture Article; eventually Open → Auto Freeze → Trusted Preset → Capture. The architecture supports this without changing the underlying engines.

## Core UX Invariants

Mandatory rules:

1. The webpage remains the primary workspace.
2. NewsClean UI remains visually secondary.
3. Manual single-element deletion does not require confirmation.
4. Bulk destructive operations require review.
5. Automated cleanup requires review before mutation.
6. Every destructive action is undoable where technically possible.
7. Freeze state is always visible.
8. Active mode is always visible.
9. NewsClean UI never appears in final PNG captures.
10. Inspector overlays never appear in final PNG captures.
11. UI components do not directly mutate page DOM.
12. Domain engines remain the source of truth.
13. User intent overrides automation.
14. Errors provide actionable recovery.
15. UI remains responsive on large pages.
16. No external analytics or screenshot uploads in MVP.
17. The interface supports RTL.
18. The interface supports keyboard navigation.
19. Temporary modes have clear exits.
20. Complexity is progressively disclosed.
