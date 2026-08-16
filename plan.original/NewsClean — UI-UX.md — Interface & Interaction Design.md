# NewsClean

## UI / UX — Interface & Interaction Design

**Document ID:** `10-UI-UX`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `07-ARTICLE-EXTRACTION.md`, `08-CAPTURE-ENGINE.md`, `09-PRESET-SYSTEM.md`

---

## 1. Purpose

This document defines the user interface and interaction model for NewsClean.

NewsClean is not intended to behave like a conventional Chrome extension with a settings popup full of controls.

It is a production tool for newsroom operators who need to transform a noisy news webpage into a clean, capture-ready editorial asset with minimum interaction.

The UI must therefore optimize for:

```text
Speed
Precision
Visibility
Reversibility
Low cognitive load
```

The primary workflow is:

```text
OPEN ARTICLE
     ↓
FREEZE
     ↓
INSPECT / EXTRACT
     ↓
CLEAN
     ↓
REVIEW
     ↓
CAPTURE PNG
```

---

# 2. UX Principle

The central UX principle is:

> **The webpage remains the workspace. NewsClean becomes a temporary control surface over it.**

The user should never feel that they have left the article to operate the extension.

Therefore the primary interface is an overlay on the current page rather than a large extension popup.

---

# 3. Product Personality

NewsClean should feel like a professional production utility.

It should not resemble:

```text
Consumer browser extension
Generic web scraper
Developer inspector
AI chatbot
Complex CMS
```

It should feel closer to:

```text
Broadcast production tool
Editorial utility
Screenshot workstation
Technical control panel
```

---

# 4. UX Priorities

The interaction hierarchy is:

```text
1. Capture
2. Clean
3. Inspect
4. Undo / Restore
5. Preset
6. Extraction information
7. Configuration
```

The interface must keep the primary workflow visually dominant.

---

# 5. Core Interface

The primary interface consists of:

```text
┌──────────────────────────────────────────────┐
│ NewsClean                                    │
│                                              │
│ [Freeze] [Inspect] [Clean] [Capture]         │
│                                              │
└──────────────────────────────────────────────┘
```

This is conceptual.

The final UI may be a compact floating toolbar.

---

# 6. Floating Toolbar

The main UI should be a compact floating toolbar attached to the browser viewport.

Recommended position:

```text
Top center
```

or:

```text
Top right
```

The exact position may be configurable.

The toolbar must avoid interfering with the website's primary content.

---

# 7. Toolbar Structure

Recommended:

```text
┌───────────────────────────────────────────────┐
│ ● NewsClean │ Freeze │ Inspect │ Clean │ PNG │
└───────────────────────────────────────────────┘
```

The active mode should be visually obvious.

Example:

```text
Freeze [ON]
Inspect [ACTIVE]
```

---

# 8. Toolbar Density

The UI should be compact.

Avoid:

```text
large cards
large headings
excessive explanatory text
```

Prefer:

```text
icon
short label
tooltip
```

The operator should understand the interface within seconds.

---

# 9. Primary Actions

The MVP primary actions are:

```text
Freeze
Inspect
Clean
Capture
```

Secondary actions:

```text
Undo
Redo
Reset
Preset
Settings
```

---

# 10. Freeze Button

The Freeze button represents the first operational step.

States:

```text
FREEZE
FROZEN
FREEZING
DEGRADED
```

Visual state should clearly distinguish:

```text
not frozen
```

from:

```text
stable capture state
```

---

# 11. Freeze Interaction

Click:

```text
FREEZE
```

produces:

```text
FREEZING...
```

then:

```text
FROZEN
```

The user should receive a small confirmation rather than a blocking dialog.

Example:

```text
Page frozen
```

---

# 12. Freeze Failure

If freezing fails:

```text
Freeze unavailable
```

with an actionable explanation.

Example:

```text
Page is still changing.
Capture may be unstable.
```

The user should still be able to inspect the page where possible.

---

# 13. Inspect Mode

Inspect is the primary manual cleanup interaction.

When activated:

```text
INSPECT ACTIVE
```

the page enters selection mode.

The cursor changes to indicate:

```text
SELECT ELEMENT
```

---

# 14. Hover Highlight

When the cursor moves over the page, NewsClean displays a lightweight overlay around the target element.

Example:

```text
┌─────────────────────────────┐
│ Article title               │
└─────────────────────────────┘
```

The highlight must not modify the page's own CSS.

It must use the NewsClean overlay layer.

---

# 15. Element Information

The hover overlay may display a compact label:

```text
ARTICLE.article
```

or:

```text
DIV.sidebar
```

Example:

```text
┌───────────────────────────┐
│ DIV.sidebar               │
└───────────────────────────┘
```

The label should be unobtrusive.

---

# 16. Selection

Clicking an element selects it.

The selected element receives a stronger visual outline.

A contextual action bar appears:

```text
┌──────────────────────────────┐
│ DELETE │ HIDE │ KEEP │ MORE  │
└──────────────────────────────┘
```

---

# 17. Selection Context

The contextual toolbar should appear close to the selected element but remain inside the viewport.

It must never be clipped by:

```text
browser edge
viewport edge
```

The positioning system should dynamically choose:

```text
top
bottom
left
right
```

depending on available space.

---

# 18. Selection Information

The user should see enough information to understand the target.

Example:

```text
DIV.article-sidebar
```

Optional secondary information:

```text
7 matches
```

for selector-based operations.

---

# 19. Selection Actions

MVP:

```text
Delete
Hide
Keep
```

Secondary:

```text
Delete Similar
Inspect Parent
Inspect Children
Copy Selector
```

The latter may be introduced progressively.

---

# 20. Delete Interaction

Clicking:

```text
DELETE
```

immediately removes the selected element.

No confirmation is required for a single explicit user action.

Immediately after deletion:

```text
Undo
```

becomes available.

---

# 21. Delete Feedback

After deletion:

```text
Sidebar removed
```

may appear as a temporary toast.

The removed region should disappear naturally.

No animation is required.

A very short fade may be used if it does not interfere with page geometry.

---

# 22. Hide Interaction

HIDE should visually remove the element while preserving its DOM representation.

The user should receive clear feedback:

```text
Element hidden
```

The selected region should disappear from the page.

---

# 23. Keep Interaction

KEEP should be visually distinct because it is a protection operation.

After clicking:

```text
KEEP
```

the element receives a subtle persistent marker while editing.

Example:

```text
[KEEP]
Article Body
```

The marker disappears during final capture.

---

# 24. Keep Semantics

The user should understand:

```text
KEEP
```

as:

> Protect this content from automated cleanup.

It should not imply:

> Delete everything else immediately.

Keep Mode may later turn this into a cleanup proposal.

---

# 25. Delete Similar

Delete Similar is a high-value interaction.

Example:

User selects:

```text
<div class="advertisement">
```

and chooses:

```text
DELETE SIMILAR
```

NewsClean identifies:

```text
.advertisement
```

and displays:

```text
5 matching elements
```

before applying the operation.

---

# 26. Delete Similar Confirmation

Because the action affects multiple elements, a compact confirmation should be shown.

Example:

```text
Delete 5 matching elements?

Selector:
.advertisement

[Cancel] [Delete 5]
```

This is preferable to silently deleting multiple elements.

---

# 27. Selector Preview

For selector-based cleanup, the UI should show:

```text
Selector:
.advertisement

Matches:
5
```

Optionally:

```text
[Highlight all]
```

allows the user to see exactly what will be removed.

---

# 28. Highlight All Matches

When enabled, all matching elements receive a temporary overlay.

Example:

```text
.advertisement
→ 5 matches highlighted
```

The highlights are NewsClean overlays and never enter the capture output.

---

# 29. DOM Breadcrumb

The inspector may display a compact DOM breadcrumb:

```text
BODY
› MAIN
› ARTICLE
› DIV.article-body
› P
```

This helps technical users understand the selected element.

The breadcrumb should not become a full developer inspector.

---

# 30. Selector Display

A compact selector representation:

```text
.article-body
```

should be available.

The user may copy it.

This is particularly useful for creating presets.

---

# 31. Parent Selection

A common problem is selecting a child instead of the desired container.

The contextual menu should provide:

```text
Select Parent
```

Example:

```text
P
↓
DIV.article-body
↓
ARTICLE
```

This makes selecting larger editorial regions faster.

---

# 32. Child Selection

Likewise:

```text
Select Child
```

may be useful when the selected element is too broad.

The MVP may expose this through:

```text
More
```

rather than placing it on the primary toolbar.

---

# 33. Escape Interaction

`Esc` should have a consistent meaning.

Recommended:

```text
Esc
→ Cancel current inspection/selection
```

If capture preparation is active:

```text
Esc
→ Cancel capture
```

if cancellation is supported at that stage.

---

# 34. Keyboard Shortcuts

Recommended MVP shortcuts:

```text
F
Freeze / Unfreeze
I
Inspect
C
Capture
Delete
Delete selected
H
Hide selected
K
Keep selected
Ctrl/Cmd + Z
Undo
Ctrl/Cmd + Shift + Z
Redo
Esc
Cancel
```

Shortcuts should only act when NewsClean has focus or is in an appropriate mode.

The extension must not hijack normal webpage shortcuts unnecessarily.

---

# 35. Undo

Undo is one of the most important controls.

Recommended location:

```text
Toolbar
```

Example:

```text
↶
```

with tooltip:

```text
Undo Delete Sidebar
```

The tooltip should describe the actual operation.

---

# 36. Redo

Redo appears only when available.

Example:

```text
↷
```

Disabled state should be visually clear.

---

# 37. Reset Cleanup

Reset should be separated from Undo.

Undo:

```text
one logical operation
```

Reset:

```text
all NewsClean cleanup changes
```

Reset should require confirmation.

---

# 38. Reset Dialog

Recommended:

```text
Reset cleanup?

All deletions, hidden elements and Keep rules
from this session will be cleared.

[Cancel] [Reset]
```

The dialog should explicitly state that:

```text
Freeze state remains active.
```

---

# 39. Preset Indicator

When a site preset is detected:

```text
Preset: Example News
```

should appear in the toolbar.

Example:

```text
● Example News
```

Clicking opens the preset panel.

---

# 40. Preset Panel

The preset panel should show:

```text
Example News
Preset v3
Healthy

Article      ✓
Title        ✓
Hero Image   ✓
Body         ✓
Ads          4
Sidebar      1

[Apply Preset]
```

---

# 41. Preset Application

The UI should not immediately mutate the page.

Recommended flow:

```text
Preset detected
↓
Review
↓
Apply
```

The user sees the proposed cleanup before committing.

---

# 42. Preset Proposal

Example:

```text
Preset will:

Remove
• Advertisements × 4
• Sidebar × 1
• Newsletter × 1

Protect
• Article
• Title
• Hero image
```

Actions:

```text
[Cancel]
[Apply]
```

---

# 43. Smart Cleanup

Smart Cleanup should have a similar interaction model.

Example:

```text
SMART CLEANUP

Likely noise detected:

Advertisement     97%
Newsletter        94%
Related content   88%
Sidebar           81%

[Review]
```

The confidence values are internal ranking indicators, not guarantees.

---

# 44. Smart Cleanup Review

The user should be able to individually approve:

```text
✓ Advertisement
✓ Newsletter
☐ Sidebar
☐ Related content
```

Then:

```text
[Apply Selected]
```

This prevents aggressive automated cleanup.

---

# 45. Article Extraction Indicator

When extraction succeeds:

```text
Article detected
```

The toolbar may show:

```text
ARTICLE ✓
```

Clicking it opens:

```text
Article Structure
```

---

# 46. Article Structure Panel

Example:

```text
ARTICLE
────────────────────
Title       ✓
Subtitle    ✓
Hero Image  ✓
Author      ✓
Date        ✓
Body        ✓
Source      ✓
────────────────────
Confidence: High
```

---

# 47. Article Confidence

Confidence should be communicated simply.

Use:

```text
High
Medium
Low
```

rather than exposing raw scores everywhere.

Detailed numerical scores belong in diagnostics.

---

# 48. Manual Override

If extraction is uncertain:

```text
Article:
Medium confidence
```

show:

```text
[Select Manually]
```

The user can then use the Inspector.

---

# 49. Capture Button

Capture is the primary final action.

Recommended label:

```text
CAPTURE PNG
```

rather than simply:

```text
Capture
```

The output format should be immediately clear.

---

# 50. Capture Menu

Clicking Capture opens:

```text
CAPTURE PNG
────────────────
Visible View
Selected Element
Full Page
────────────────
Scale
1×
2×
────────────────
[Capture]
```

MVP may expose only:

```text
Visible
Element
Full Page
```

with scale automatically determined.

---

# 51. Default Capture Mode

If the article has been successfully extracted:

```text
Capture Article
```

may become the preferred action.

If no article target exists:

```text
Visible View
```

is the safe default.

---

# 52. Capture Preparation UI

Before capture:

```text
Preparing capture...

✓ Page frozen
✓ Cleanup applied
✓ Target validated
✓ Fonts ready
✓ Images ready
```

This should be a compact status indicator.

The actual NewsClean UI must disappear before the browser screenshot occurs.

---

# 53. Capture Progress

For a long article:

```text
Capturing article...
Segment 3 / 8
```

The progress UI must disappear before each actual screenshot segment.

---

# 54. Capture Complete

After capture:

```text
PNG ready

1280 × 3420
2.8 MB

[Save PNG]
[Copy]
```

`Copy` may be disabled in MVP if clipboard support is not yet implemented.

---

# 55. Capture Preview

The user may receive a small preview.

The preview should show:

```text
actual PNG
```

not another live DOM representation.

This verifies the final output.

---

# 56. Capture Failure

Example:

```text
Capture failed

The page exceeds the maximum safe image size.

Try:
• Capture Selected Element
• Reduce capture scale
```

The UI should suggest actionable alternatives.

---

# 57. Toast Notifications

Use toasts for short-lived state changes:

```text
Page frozen
Element deleted
Element hidden
Rule applied
Preset applied
Capture complete
```

Avoid using toasts for complex decisions.

---

# 58. Dialogs

Dialogs should be reserved for:

```text
Reset
Bulk destructive actions
Preset application with significant changes
Irrecoverable actions
```

Single manual deletion should not trigger a dialog.

---

# 59. Side Panel

A Chrome Side Panel may eventually host:

```text
Preset Management
Extraction Details
Cleanup Rules
Capture History
Settings
```

However, the primary editing interaction should remain on-page.

---

# 60. Recommended UI Architecture

```text
Chrome Page
│
├── Website DOM
│
└── NewsClean UI Layer
    │
    ├── Toolbar
    ├── Inspector Overlay
    ├── Selection Overlay
    ├── Proposal Overlay
    ├── Toast Layer
    └── Modal Layer
```

All NewsClean UI should live under a dedicated root.

---

# 61. UI Root

Recommended:

```html
<div id="newsclean-root"></div>
```

The root should be isolated from page styles.

---

# 62. Style Isolation

Website CSS can be extremely aggressive.

NewsClean UI should therefore use a style isolation mechanism.

Preferred architecture:

```text
NewsClean Root
      ↓
Shadow DOM
      ↓
NewsClean Components
```

This prevents website styles from accidentally modifying:

```text
buttons
fonts
icons
spacing
colors
```

inside the NewsClean interface.

---

# 63. Shadow DOM

The NewsClean UI should preferably use:

```text
ShadowRoot
```

for:

```text
Toolbar
Inspector controls
Modals
Toasts
```

The overlay itself may still need viewport-coordinate calculations against the page.

---

# 64. Overlay Layer

The overlay layer should use:

```text
position: fixed
```

relative to the viewport.

It must not affect page layout.

---

# 65. Z-Index Strategy

NewsClean must use a controlled z-index range.

Example conceptual:

```text id="9am7y4"
Website
   ↓
NewsClean Overlay
   ↓
NewsClean Toolbar
   ↓
Modal
```

Avoid using arbitrary extremely large z-index values everywhere.

A centralized z-index token system should be used.

---

# 66. Overlay Geometry

The Inspector must calculate target rectangles using:

```text id="l4yq2n"
getBoundingClientRect()
```

The overlay then renders at the corresponding viewport coordinates.

The page itself is never wrapped or repositioned.

---

# 67. Scrolling

During normal inspection:

```text
scroll page
```

must remain completely natural.

The overlay system must update selected/hovered element geometry after scrolling.

---

# 68. Resize

On viewport resize:

```text
toolbar
overlay
context menu
```

must reposition.

The UI should not cause horizontal overflow.

---

# 69. Responsive Behavior

NewsClean primarily targets desktop Chrome.

Minimum conceptual viewport:

```text id="4y7h3j"
1024px width
```

The interface should remain functional on smaller desktop windows but mobile browser support is outside MVP.

---

# 70. Visual Language

The UI should use a restrained professional visual language.

Recommended characteristics:

```text
Dark neutral surface
High contrast text
Compact controls
Subtle borders
Minimal shadows
Small radius
Strong active state
```

The exact design tokens should be finalized during implementation.

---

# 71. Avoid Visual Noise

The interface should not compete with the news page.

Avoid:

```text
large gradients
heavy glass effects
large shadows
oversized icons
animated panels
decorative graphics
```

The page itself is the visual content.

---

# 72. Color Semantics

Color should communicate state, not decoration.

Conceptually:

```text
Neutral
→ normal state

Accent
→ active mode

Warning
→ degraded / uncertain

Destructive
→ delete

Success
→ completed
```

The exact palette belongs in the Design Tokens implementation.

---

# 73. Destructive Actions

DELETE should have a clear destructive state.

However, the default toolbar should not become visually dominated by red.

Use destructive styling primarily:

```text
on hover
on confirmation
in contextual action
```

---

# 74. Keep State

KEEP should use a positive protection visual.

It should be visually different from:

```text
Delete
Hide
```

The user should immediately understand that it protects rather than removes.

---

# 75. Disabled States

Buttons should be disabled when actions are not valid.

Example:

```text
Undo
```

disabled when history is empty.

```text
Capture
```

disabled while capture is already running.

```text
Apply Preset
```

disabled when preset validation fails.

---

# 76. Loading States

Loading indicators should be small.

Avoid large blocking spinners.

Use:

```text
Analyzing…
Preparing…
Capturing…
```

where meaningful.

---

# 77. Mode Indicator

The toolbar should always communicate the current mode.

Example:

```text
MODE: INSPECT
```

or a highlighted:

```text
Inspect
```

The user should never wonder why clicking the page is selecting elements instead of behaving normally.

---

# 78. Exit Mode

Every modal mode must have an obvious exit.

Examples:

```text
Inspect → Esc
Preset Review → Cancel
Smart Cleanup → Cancel
Capture → Cancel where possible
```

No mode should trap the user.

---

# 79. Browser Interaction Preservation

NewsClean should interfere with the webpage only when explicitly operating.

Outside Inspect Mode:

```text
click
scroll
select text
links
```

should behave normally.

During Inspect Mode:

```text
click
```

is repurposed for element selection.

This must be clearly communicated.

---

# 80. Link Protection

Inspect Mode must not accidentally navigate to links.

Clicking a link in Inspect Mode should select the element instead of following the link.

The original link behavior resumes when Inspect Mode exits.

---

# 81. Text Selection

Inspect Mode may temporarily disable normal text selection if necessary.

Normal text selection must return immediately after exiting Inspect Mode.

---

# 82. Context Menu

The browser's native right-click context menu should remain available unless NewsClean needs a specialized interaction.

MVP should avoid replacing the native context menu.

---

# 83. Accessibility

The UI must support:

```text id="s0kr46"
keyboard navigation
visible focus
ARIA labels
screen-reader meaningful names
sufficient contrast
```

The interface is primarily visual, but basic accessibility remains mandatory.

---

# 84. Focus Management

When opening a modal:

```text
focus
 ↓
first actionable control
```

When closing:

```text
focus
 ↓
previously active control
```

The page's focus should not be lost unnecessarily.

---

# 85. Tooltips

Tooltips should explain unfamiliar icons.

Example:

```text
↶
Undo last cleanup
```

Avoid tooltips for obvious textual buttons.

---

# 86. Status Bar

A compact status area may display:

```text
Frozen
Preset: Example News
Removed: 8
Kept: 2
```

This provides operational context without opening panels.

---

# 87. Cleanup Counter

A useful persistent indicator:

```text
8 removed
```

Clicking it can open:

```text
Cleanup History
```

Future feature.

---

# 88. Extraction Status

Example:

```text
Article ✓
```

or:

```text
Article ?
```

where:

```text
✓ = high confidence
? = uncertain
```

The interface should not expose implementation terminology unnecessarily.

---

# 89. Preset Status

Example:

```text
Preset ✓
```

or:

```text
Preset stale
```

If stale:

```text
[Review]
```

should be available.

---

# 90. Empty States

When no article is detected:

```text
No article structure detected.

You can select the article manually.
```

The primary action:

```text
[Inspect Article]
```

---

# 91. No Results State

For selector cleanup:

```text
No matching elements found.
```

Do not create a fake success state.

---

# 92. Error State

Errors should identify:

```text
What happened
Why
What the user can do
```

Example:

```text
Preset could not identify the article.

The site structure may have changed.

[Use Standard Extraction]
[Inspect Manually]
```

---

# 93. Progressive Disclosure

The UI should expose complexity progressively.

Primary:

```text
Freeze
Inspect
Clean
Capture
```

Secondary:

```text
Preset
Extraction
Rules
```

Advanced:

```text
Selector
Diagnostics
Confidence
Engine state
```

This keeps the normal workflow fast.

---

# 94. Expert Mode

A future Expert Mode may expose:

```text
CSS selector
DOM path
match count
element dimensions
computed style
extraction score
preset rule ID
```

This is valuable for technical newsroom users.

It should not clutter the default interface.

---

# 95. Interaction with Existing Website UI

NewsClean should never permanently modify:

```text
header
navigation
CSS
JavaScript
cookies
localStorage
```

except for its explicit working DOM transformations during the session.

---

# 96. Visual Restoration

When NewsClean is disabled or the session ends:

```text
NewsClean UI → removed
temporary overlays → removed
```

Cleanup modifications may remain only according to the active working-session lifecycle.

The original page navigation should be restored on reload/navigation.

---

# 97. Capture Mode UI Isolation

During capture:

```text
NewsClean UI
↓
hidden
```

After capture:

```text
NewsClean UI
↓
restored
```

The user should not see a visible flicker where practical.

---

# 98. Capture Preview UX

After capture:

```text
┌───────────────────────────────┐
│ PNG Preview                   │
│                               │
│       [ image ]               │
│                               │
├───────────────────────────────┤
│ 1280 × 3420   2.8 MB          │
│                               │
│ [Save PNG]    [Close]         │
└───────────────────────────────┘
```

The preview should be optional if performance becomes an issue for very large PNGs.

---

# 99. Primary User Journey

The ideal newsroom workflow should be:

```text
1. Open news article.
2. Click NewsClean.
3. Click Freeze.
4. Preset is detected.
5. Review cleanup proposal.
6. Apply cleanup.
7. Inspect manually if necessary.
8. Click Capture PNG.
9. Select Article.
10. PNG generated.
11. Save.
```

The number of interactions should be minimized without hiding important destructive decisions.

---

# 100. Power User Journey

For experienced users:

```text
Open
→ Freeze
→ Preset
→ Capture Article
```

or eventually:

```text
Open
→ Auto Freeze
→ Trusted Preset
→ Capture
```

The architecture supports this optimization without changing the underlying engines.

---

# 101. First-Use Journey

First-time user:

```text
Open page
↓
NewsClean
↓
Short onboarding:
"Freeze the page before cleaning."
↓
Freeze
↓
"Hover to inspect elements."
↓
Inspect
↓
"Delete unwanted elements."
↓
Capture
```

Onboarding should be dismissible.

---

# 102. Onboarding Principle

Do not introduce a long tutorial.

The product should be learnable from:

```text
Toolbar
Tooltips
Contextual hints
```

The ideal learning curve is:

```text
< 1 minute
```

for the basic workflow.

---

# 103. Contextual Help

Examples:

When Inspect is activated:

```text
Click any page element to inspect it.
Press Esc to exit.
```

When Capture is opened:

```text
Choose the visible page, selected element, or full page.
```

These hints disappear automatically.

---

# 104. Interaction State Machine

The complete UI state model:

```text id="h6a4r7"
NORMAL
  │
  ├── FREEZE
  │      ↓
  │   FROZEN
  │
  ├── INSPECT
  │      ↓
  │   INSPECTING
  │      ↓
  │   SELECTED
  │
  ├── CLEAN
  │      ↓
  │   CLEANING
  │
  ├── PRESET
  │      ↓
  │   REVIEWING
  │
  └── CAPTURE
         ↓
      PREPARING
         ↓
      CAPTURING
         ↓
      PREVIEW
```

Every temporary state must have a safe exit.

---

# 105. UI State Ownership

The UI must not own domain state.

For example:

```text id="7v1g6r"
Freeze state
→ Freeze Engine

Cleanup history
→ Cleanup / History Engine

Extraction result
→ Extraction Engine

Preset state
→ Preset Engine

Capture state
→ Capture Engine
```

The UI reflects these states.

It does not become the source of truth.

---

# 106. Event Architecture

Conceptually:

```text id="2e2r1j"
ENGINE
 ↓
DOMAIN EVENT
 ↓
UI STATE UPDATE
 ↓
RENDER
```

Example:

```text id="b2h0cp"
Cleanup Engine
 ↓
ELEMENT_DELETED
 ↓
Toolbar counter
 ↓
"8 removed"
```

---

# 107. No Direct DOM Coupling

UI components must not directly perform:

```text id="x1j8qf"
element.remove()
```

The UI emits:

```text id="q9f1q5"
DELETE_ELEMENT
```

The Cleanup Engine performs the mutation.

This preserves the architecture defined in previous documents.

---

# 108. UI Command Model

Conceptually:

```ts id="m0r5yb"
type UICommand =
  | "FREEZE"
  | "INSPECT_START"
  | "DELETE_SELECTED"
  | "HIDE_SELECTED"
  | "KEEP_SELECTED"
  | "UNDO"
  | "REDO"
  | "RESET"
  | "APPLY_PRESET"
  | "CAPTURE";
```

The command layer translates UI interaction into domain operations.

---

# 109. UI Telemetry

MVP should not send behavioral telemetry externally.

Local diagnostics may record:

```text id="z5lqyl"
operation duration
capture duration
preset validation
errors
```

only for debugging.

---

# 110. Privacy

Newsroom pages may contain sensitive information.

The UI architecture must assume:

```text id="2u4ey4"
Article content
Page URLs
Screenshots
```

are potentially sensitive.

Therefore:

```text id="jjy5tp"
No external analytics
No screenshot uploads
No content telemetry
```

in MVP.

---

# 111. UI Performance

The UI must remain responsive while the page is complex.

Inspector overlays should avoid:

```text id="q2lq7g"
full DOM re-render
```

on every mouse movement.

The overlay system should update only the necessary geometry.

---

# 112. Hover Performance

On `mousemove`:

```text id="w0b8zq"
Throttle / requestAnimationFrame
↓
Resolve element
↓
Update overlay
```

Avoid expensive DOM analysis for every pointer event.

---

# 113. Overlay Performance

The overlay should use:

```text id="1q4s8x"
transform
```

where practical instead of repeatedly changing layout properties.

This reduces unnecessary browser layout work.

---

# 114. UI Animation

Animation should be minimal.

Recommended:

```text id="3e6j9k"
Toolbar appearance
Context menu appearance
Toast entrance
```

Avoid animated page elements during cleanup/capture.

---

# 115. Reduced Motion

If the user has enabled reduced motion:

```text id="w5f3zi"
prefers-reduced-motion
```

NewsClean should minimize interface animations.

---

# 116. Design Tokens

The UI should eventually define centralized tokens:

```text id="1k8p1r"
--nc-color-bg
--nc-color-surface
--nc-color-text
--nc-color-muted
--nc-color-accent
--nc-color-danger
--nc-color-warning
--nc-color-success

--nc-radius-sm
--nc-radius-md

--nc-spacing-1
--nc-spacing-2
--nc-spacing-3

--nc-shadow-sm
```

The exact token values are implementation details.

---

# 117. Typography

The UI should use a neutral system interface font.

Avoid injecting the site's typography into NewsClean.

The NewsClean interface must remain visually stable across websites.

---

# 118. Iconography

Icons should be:

```text id="q3r6k8"
simple
consistent
recognizable
```

Examples:

```text
Freeze
Inspect
Trash
Eye Off
Shield
Undo
Redo
Camera
Settings
```

Icons should always have accessible labels.

---

# 119. Internationalization

The UI architecture should support:

```text id="v7m3q2"
Arabic
French
English
```

from the beginning.

Strings must not be hardcoded into components.

---

# 120. RTL Support

Arabic UI must support:

```text id="m8q4x3"
direction: rtl
```

including:

```text
toolbar
menus
dialogs
breadcrumbs
```

Icons representing directional actions should be adapted where necessary.

The page itself remains untouched.

---

# 121. Language Strategy

The initial implementation may ship with:

```text id="x5m7q8"
English
French
Arabic
```

The language can be selected independently from the webpage language.

---

# 122. Accessibility Labels

Examples:

```text id="q3m8x2"
"Freeze page"
"Inspect page elements"
"Delete selected element"
"Hide selected element"
"Keep selected element"
"Undo last cleanup"
"Capture PNG"
```

Labels should describe the action rather than only the icon.

---

# 123. Confirmation Philosophy

The UI follows:

```text id="m7q3x8"
Explicit + reversible
→ no confirmation

Explicit + bulk
→ compact confirmation

Automated + destructive
→ review

Irreversible
→ confirmation
```

This minimizes friction while protecting against accidental mass deletion.

---

# 124. Core UX Invariants

The following rules are mandatory:

```text id="v8m2q5"
1. The webpage remains the primary workspace.
2. NewsClean UI must remain visually secondary.
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
14. Errors must provide actionable recovery.
15. UI must remain responsive on large pages.
16. No external analytics or screenshot uploads in MVP.
17. The interface must support RTL.
18. The interface must support keyboard navigation.
19. Temporary modes must have clear exits.
20. Complexity is progressively disclosed.
```

---

# 125. Final UI Architecture

```text id="5u8p3n"
                        NEWS PAGE
                           │
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
       WEBSITE CONTENT            NEWSCLEAN UI
                                      │
                              ┌───────┴────────┐
                              │                │
                              ▼                ▼
                          TOOLBAR          OVERLAYS
                              │                │
                ┌─────────────┼─────────────┐  │
                ▼             ▼             ▼  │
             FREEZE        INSPECT        CLEAN
                │             │             │
                └─────────────┼─────────────┘
                              │
                              ▼
                          CAPTURE
                              │
                              ▼
                             PNG
```

The critical separation is:

```text
UI
 ↓
Commands
 ↓
Domain Engines
 ↓
Working DOM
```

and never:

```text
UI
 ↓
Direct DOM manipulation
```

---

# 126. Final UX Flow

The complete intended interaction is:

```text
┌─────────────────────────────────────────────────┐
│                 NEWS WEB PAGE                   │
│                                                 │
│   [NewsClean]                                   │
│                                                 │
│        ┌─────────────────────────────────┐      │
│        │ Freeze │ Inspect │ Clean │ PNG  │      │
│        └─────────────────────────────────┘      │
│                                                 │
│                 ARTICLE                         │
│                                                 │
│       Title                                     │
│       Hero Image                                │
│                                                 │
│       Article Body                              │
│                                                 │
│       Article Body                              │
│                                                 │
└─────────────────────────────────────────────────┘
```

The user journey becomes:

```text
FREEZE
   ↓
ARTICLE DETECTED
   ↓
PRESET DETECTED
   ↓
CLEANUP PROPOSAL
   ↓
USER REVIEW
   ↓
APPLY
   ↓
ARTICLE CLEAN
   ↓
CAPTURE PNG
```

---

# 127. Product UX Definition

At the UX level, NewsClean should ultimately feel like this:

```text
A webpage enters the newsroom.

NewsClean freezes it.

The system understands it.

The operator removes what does not matter.

The system protects what does.

The operator captures the final editorial view.

One clean PNG leaves the browser.
```

That is the core interaction model around which all subsequent UI implementation should be built.

---

# 128. Next Document

`11-DATA-MODEL.md` — Domain Data Model

This document will define the canonical data structures shared between the engines:

```text
Session
Page
ElementReference
ExtractionResult
CleanupIntent
CleanupRule
CleanupOperation
HistoryCommand
Preset
PresetRule
CaptureTarget
CaptureResult
ExportAsset
Domain Events
```

It will establish the contracts between the previously defined modules before implementation begins.
