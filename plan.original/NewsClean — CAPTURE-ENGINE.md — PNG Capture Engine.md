# NewsClean

## PNG Capture Engine

**Document ID:** `08-CAPTURE-ENGINE`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `07-ARTICLE-EXTRACTION.md`

---

## 1. Purpose

The PNG Capture Engine is the final rendering layer of NewsClean.

Its responsibility is to transform the cleaned editorial webpage into a deterministic PNG asset suitable for newsroom use.

The engine receives the page after:

```text
FREEZE
   ↓
EXTRACTION
   ↓
INSPECTION
   ↓
CLEANUP
   ↓
CAPTURE
```

Its fundamental responsibility is:

> **Render the current editorial state exactly as intended and produce a clean PNG without NewsClean interface elements.**

The Capture Engine does not decide what content is relevant.

It does not perform cleanup.

It does not identify advertisements.

It does not modify editorial content.

It renders the current working state.

---

# 2. Core Principle

The Capture Engine follows:

```text
INPUT
Clean Working DOM
      ↓
VALIDATE
Capture State
      ↓
PREPARE
Rendering Environment
      ↓
CAPTURE
Visible / Full Page / Region
      ↓
ENCODE
PNG
      ↓
EXPORT
Final Asset
```

The final PNG must represent the editorial state at the exact moment of capture.

---

# 3. Capture Objective

The MVP must support:

```text
VISIBLE
FULL_PAGE
ELEMENT
```

### VISIBLE

Capture the currently visible browser viewport.

### FULL_PAGE

Capture the entire cleaned article/page vertically.

### ELEMENT

Capture a specific DOM element or extracted article region.

Future modes:

```text
COMPOSED
CUSTOM_REGION
MULTI_PAGE
```

are outside the MVP.

---

# 4. Capture Modes

Conceptual enum:

```ts
type CaptureMode =
  | "VISIBLE"
  | "FULL_PAGE"
  | "ELEMENT";
```

Each mode uses the same rendering pipeline but different geometry.

---

# 5. Visible Capture

Visible Capture represents:

```text
Current viewport
```

Example:

```text
┌──────────────────────────────┐
│ Browser viewport             │
│                              │
│ Article                      │
│ Title                        │
│ Image                        │
│ Text                         │
│                              │
└──────────────────────────────┘
```

The capture must exclude:

```text
NewsClean toolbar
Inspector overlay
Selection highlight
Cleanup proposal overlays
Freeze indicator
Capture UI
```

---

# 6. Full Page Capture

Full Page Capture renders the complete relevant page vertically.

Example:

```text
┌──────────────────────┐
│ Header               │
├──────────────────────┤
│ Article title        │
│ Hero image           │
│                      │
│ Article body         │
│                      │
│ Article body         │
│                      │
│ Article body         │
├──────────────────────┤
│ Footer / remaining   │
└──────────────────────┘
```

The user should not need to manually scroll and stitch screenshots.

---

# 7. Element Capture

Element Capture targets a specific element.

Examples:

```text
ARTICLE
MAIN
.article-body
```

The engine obtains the target geometry and renders that region.

This mode is especially important when the user has manually selected an article container.

---

# 8. Capture Preconditions

Capture should normally require:

```text
Freeze State = FROZEN
```

and:

```text
Cleanup State = READY
```

Extraction is optional.

Therefore:

```text
FROZEN
   ↓
CLEAN
   ↓
CAPTURE
```

If the page is not frozen, the Capture Engine should request Freeze rather than silently capture an unstable page.

---

# 9. Capture Gate

Before capture:

```text
if pageState !== FROZEN
    request freeze

if freezeState === DEGRADED
    warn

if target is invalid
    abort

if NewsClean UI cannot be hidden
    abort
```

The Capture Engine must not generate a final asset from a known invalid state.

---

# 10. Capture Session

Each capture belongs to the current NewsClean session.

Conceptual:

```ts
interface CaptureSession {
  id: string;
  mode: CaptureMode;
  startedAt: number;
  viewport: ViewportState;
  target: CaptureTarget | null;
  scale: number;
}
```

The session should remain isolated from previous pages.

---

# 11. Capture Target

Conceptual:

```ts
interface CaptureTarget {
  type: "VIEWPORT" | "ELEMENT";
  selector?: string;
  elementId?: string;
}
```

For `VISIBLE`:

```text
type = VIEWPORT
```

For `ELEMENT`:

```text
type = ELEMENT
```

---

# 12. Capture Preparation

Before rendering, the engine enters:

```text
PREPARING
```

It must:

```text
Hide NewsClean UI
Hide inspection overlays
Hide selection overlays
Hide proposal overlays
Freeze visual state
Resolve capture geometry
Verify target
```

Only after preparation succeeds may capture begin.

---

# 13. Capture State Machine

The Capture Engine uses:

```text
IDLE
  ↓
PREPARING
  ↓
VALIDATING
  ↓
RENDERING
  ↓
ENCODING
  ↓
READY
  ↓
EXPORTING
  ↓
COMPLETED
```

Failure:

```text
ANY STATE
   ↓
FAILED
```

Cancellation:

```text
PREPARING / RENDERING
   ↓
CANCELLED
```

---

# 14. Capture States

### IDLE

No capture operation.

### PREPARING

Temporary capture conditions are established.

### VALIDATING

Target and rendering state are verified.

### RENDERING

Browser screenshot mechanism is executing.

### ENCODING

Captured bitmap is being encoded as PNG.

### READY

PNG asset exists in memory and is ready for export.

### EXPORTING

Asset is being transferred to the user's selected destination.

### COMPLETED

Capture successfully finished.

### FAILED

Capture could not be completed safely.

---

# 15. Browser Capture Strategy

The architecture should distinguish between:

```text
Page-side preparation
```

and:

```text
Extension-level capture
```

The Content Runtime prepares the page.

The extension Service Worker / appropriate extension context coordinates browser-level capture.

For visible screenshots, Chrome's `chrome.tabs.captureVisibleTab()` can capture the visible area of a tab.

The implementation must respect Chrome's capture permissions and operational constraints.

---

# 16. Why Capture Must Not Be Implemented in DOM Code

The Content Runtime cannot simply treat the browser viewport as a bitmap.

Its responsibility is:

```text
DOM → prepare
```

The browser capture layer performs:

```text
rendered tab → bitmap
```

Therefore:

```text
Content Runtime
       ↓
Prepare Capture State
       ↓
Service Worker / Extension Capture
       ↓
PNG
```

---

# 17. Capture Without NewsClean UI

The extension UI must never appear in the final PNG.

The preferred architecture is:

```text
Before capture
↓
Hide NewsClean overlays
↓
Capture
↓
Restore overlays
```

The hiding operation must happen synchronously enough to guarantee that the screenshot does not include the UI.

---

# 18. Capture Isolation

All NewsClean visual components should have a common internal root:

```text
[data-newsclean-root]
```

The Capture Engine can temporarily hide this root:

```text
visibility: hidden
```

or an equivalent strategy.

This is preferable to individually hiding every toolbar component.

---

# 19. Freeze Indicator

The Freeze Engine may display:

```text
FROZEN
```

during normal operation.

Before capture:

```text
FROZEN INDICATOR
       ↓
TEMPORARILY HIDDEN
       ↓
CAPTURE
       ↓
RESTORE
```

The freeze state itself remains active.

---

# 20. Inspector Overlay

If the Inspector is active:

```text
highlight rectangle
selection border
action menu
```

must be removed from the rendering layer.

Capture should automatically switch to:

```text
CAPTURE MODE
```

where editorial overlays are disabled.

---

# 21. Cleanup Proposal Overlay

If a proposal is being previewed:

```text
candidate highlights
```

must not be included in the PNG.

The user must either:

```text
APPLY
```

or:

```text
CANCEL
```

the proposal before capture.

---

# 22. Capture Lock

When capture begins, the page enters:

```text
CAPTURE_LOCK
```

This prevents concurrent operations.

During Capture Lock:

```text
Delete
Hide
Keep
Inspect
Reset
```

should be temporarily disabled.

This prevents the DOM from changing during rendering.

---

# 23. Capture Lock State

Conceptually:

```text
CLEANING
   ↓
READY
   ↓
CAPTURE_LOCK
   ↓
RENDER
   ↓
RELEASE
```

The lock should be short-lived.

---

# 24. Geometry

The Capture Engine must calculate:

```text
viewport width
viewport height
document width
document height
target width
target height
scroll position
```

All geometry must initially be represented in CSS pixels.

---

# 25. Device Pixel Ratio

Browser rendering uses:

```text
CSS pixels
```

while screenshots are represented in:

```text
physical pixels
```

The relationship is:

```text
physicalWidth = cssWidth × devicePixelRatio
physicalHeight = cssHeight × devicePixelRatio
```

The Capture Engine must account for this when calculating output dimensions.

---

# 26. Capture Scale

The engine should support:

```ts
interface CaptureScale {
  type: "DEVICE" | "FIXED";
  value?: number;
}
```

Default:

```text
DEVICE
```

meaning the browser's effective device pixel ratio is respected.

Future options may include:

```text
1×
2×
3×
```

where supported.

---

# 27. Maximum Bitmap Constraints

Browsers and image encoders impose practical limits on bitmap dimensions.

A very long article can exceed:

```text
maximum bitmap height
maximum bitmap area
maximum memory
```

The engine must detect this before attempting full-page capture.

It must not allocate a massive bitmap blindly.

---

# 28. Long Article Strategy

For long articles:

```text
Article
   ↓
Geometry exceeds safe bitmap limit
   ↓
Segmented capture
```

The engine should capture multiple vertical segments internally.

Example:

```text
Segment 01
Segment 02
Segment 03
Segment 04
```

These can later be stitched into one PNG if the final dimensions remain within safe limits.

---

# 29. Segment Capture

Segmented capture must maintain:

```text
same width
same scale
same visual state
same scroll position relationship
```

Each segment is captured sequentially.

The DOM must remain frozen throughout the operation.

---

# 30. Segment Overlap

To prevent stitching gaps caused by browser rounding or fixed elements, segments may use a small overlap.

Conceptually:

```text
Segment A
████████████████
       ███
       overlap
       ███
████████████████
Segment B
```

The overlap strategy belongs to the stitching implementation.

The final PNG must contain no duplicated visual region.

---

# 31. Sticky Elements During Full-Page Capture

Sticky elements are problematic.

For example:

```text
position: sticky
```

may appear repeatedly during segmented capture.

The engine must distinguish:

```text
Editorial content
```

from:

```text
Viewport-fixed UI
```

For MVP, the recommended strategy is to temporarily neutralize known fixed/sticky non-editorial elements only when they have already been explicitly hidden or deleted by Cleanup.

The Capture Engine itself must not arbitrarily remove page content.

---

# 32. Fixed Elements

If a fixed element remains after cleanup:

```text
Capture Engine
```

must preserve it because it is part of the current editorial state.

The Capture Engine should not make editorial decisions.

---

# 33. Full-Page Capture Semantics

Full-page capture means:

> Capture the current working document as it visually exists across its complete vertical extent.

It does not automatically mean:

```text
capture only article
```

Article-only capture is handled through:

```text
ELEMENT
```

using the extracted article container.

---

# 34. Article Capture

The preferred workflow for article-only PNG:

```text
Extraction
 ↓
Article Container
 ↓
Inspector / User Confirmation
 ↓
Cleanup
 ↓
ELEMENT CAPTURE
```

This produces a focused editorial asset.

---

# 35. Element Geometry

For element capture:

```text
const rect = element.getBoundingClientRect()
```

The engine calculates:

```text
x
y
width
height
```

and converts viewport coordinates into the capture coordinate system.

---

# 36. Element Overflow

An element may contain content exceeding its visible rectangle.

The engine must determine whether the target represents:

```text
visible box
```

or:

```text
full content box
```

MVP recommendation:

```text
ELEMENT
→ capture rendered element bounds
```

Future versions may support:

```text
ELEMENT_FULL_CONTENT
```

for overflowing containers.

---

# 37. Scroll Position

For visible capture:

```text
current scroll position
```

must be preserved.

For element capture:

```text
target coordinates
```

may require temporary scrolling.

If scrolling is necessary:

```text
save scroll
↓
scroll target into capture position
↓
wait for stable render
↓
capture
↓
restore scroll
```

---

# 38. Scroll Restoration

After capture:

```text
scrollX
scrollY
```

must be restored.

The user should return to exactly the same viewport position where practical.

---

# 39. Scroll-Induced Mutation

Scrolling may trigger:

```text
lazy loading
sticky transitions
intersection observers
```

Therefore, if the engine scrolls during capture, it must verify stability again.

The sequence becomes:

```text
SCROLL
 ↓
WAIT
 ↓
VERIFY
 ↓
CAPTURE
```

---

# 40. Lazy-Loaded Content During Capture

If new images appear during capture, the engine must not silently produce an inconsistent asset.

Possible policy:

```text
image loading detected
↓
wait for stability
↓
capture
```

with a bounded timeout.

If the page continues loading indefinitely:

```text
PARTIAL CAPTURE
```

may be reported.

---

# 41. Image Readiness

Before capture, relevant images should be checked.

For each visible target image:

```text
img.complete
```

and where relevant:

```text
img.naturalWidth > 0
```

should be evaluated.

Broken images should not block the entire capture indefinitely.

---

# 42. Web Fonts

Web fonts can change layout after the article appears.

Before capture, the engine should attempt to verify:

```text
document.fonts.ready
```

where available.

The capture should occur only after the current font set is sufficiently resolved.

---

# 43. Font Failure

If a font fails to load:

```text
fallback font
```

may change geometry.

The Capture Engine should not attempt to download missing fonts itself.

It should capture the actual current rendered state.

---

# 44. Animation During Capture

The Freeze Engine should already have disabled visual animation.

The Capture Engine must nevertheless verify:

```text
Freeze State = FROZEN
```

before rendering.

Capture should never become a second animation-freezing subsystem.

---

# 45. Media During Capture

Videos should normally be paused by Freeze.

If a video remains active:

```text
Capture
```

should capture the currently rendered frame.

The Capture Engine should not replace it with a poster image automatically.

---

# 46. Canvas During Capture

Canvas is treated as rendered visual content.

The Capture Engine should capture the browser-rendered canvas state where the browser capture mechanism supports it.

It should not attempt to reconstruct the canvas from JavaScript.

---

# 47. Cross-Origin Content

Cross-origin iframes are browser-controlled rendering boundaries.

The Capture Engine should capture them as part of the visible browser output when the browser permits it.

It must not attempt to inspect or rewrite their internal DOM.

---

# 48. Browser Security Restrictions

Certain pages cannot be captured or manipulated in the same way as ordinary websites.

Examples may include:

```text
chrome://
Chrome Web Store
browser internal pages
extension pages
```

The Capture Engine must detect unsupported contexts.

---

# 49. Capture Result

Conceptual:

```ts
interface CaptureResult {
  success: boolean;
  mode: CaptureMode;
  width: number;
  height: number;
  scale: number;
  mimeType: "image/png";
  blob?: Blob;
  error?: CaptureError;
}
```

---

# 50. PNG Requirement

The MVP output format is:

```text
image/png
```

The engine must not output:

```text
JPEG
WEBP
AVIF
```

as the primary capture format.

Future export formats can be added later.

---

# 51. PNG Encoding

The capture pipeline is:

```text
Browser Screenshot
      ↓
Bitmap
      ↓
PNG Encoding
      ↓
Blob
      ↓
Export
```

The encoded asset should preserve:

```text
pixel fidelity
alpha channel where applicable
```

---

# 52. Alpha Channel

For ordinary webpage screenshots:

```text
opaque background
```

is expected.

Transparent PNG output should not be assumed.

A future Composition Engine may support transparent backgrounds.

The Capture Engine should remain compatible with alpha-capable rendering pipelines.

---

# 53. Color Fidelity

The Capture Engine should preserve the browser-rendered colors.

It must not apply:

```text
color grading
compression filters
brightness adjustments
```

The final PNG represents the webpage rendering.

---

# 54. No Editorial Processing

The Capture Engine must never:

```text
sharpen
blur
recolor
resize editorial content
rewrite text
remove logos
```

Those are outside its responsibility.

---

# 55. Output Dimensions

The final PNG dimensions must be explicitly known.

Example:

```text
CSS:
1280 × 2400

DPR:
1.0

PNG:
1280 × 2400
```

At DPR 2:

```text
PNG:
2560 × 4800
```

The UI should display final output dimensions before export when practical.

---

# 56. Filename Strategy

The default filename should be deterministic and newsroom-friendly.

Example:

```text
news-clean-2026-08-12-article.png
```

A better future strategy can use extracted information:

```text
SOURCE_ARTICLE_DATE.png
```

Example:

```text
al24news-2026-08-12-article.png
```

Filename generation must sanitize:

```text
/ \ : * ? " < > |
```

and other filesystem-invalid characters.

---

# 57. Filename Source

Preferred hierarchy:

```text
User-provided filename
↓
Article title
↓
Source + date
↓
Hostname + timestamp
```

The engine must not expose sensitive URL query parameters in filenames.

---

# 58. Timestamp

Timestamp may use:

```text
YYYYMMDD-HHmmss
```

Example:

```text
20260812-132410
```

This avoids filesystem ambiguity.

---

# 59. Export Strategy

The Capture Engine should produce a `Blob` or equivalent binary representation.

Export is a separate responsibility.

Conceptually:

```text
Capture Engine
 ↓
PNG Blob
 ↓
Export Manager
 ↓
User File
```

The Capture Engine should not tightly couple rendering with filesystem operations.

---

# 60. Export Manager

Future document:

```text
09-EXPORT-ENGINE.md
```

may define:

```text
Download
Save As
Clipboard
File System Access
Naming
Metadata
```

For this document, Capture stops at:

```text
PNG asset ready
```

---

# 61. Clipboard

Clipboard export is a future feature.

Potential workflow:

```text
Capture
 ↓
PNG
 ↓
Clipboard
```

It must remain separate from core capture.

---

# 62. Capture Preview

After rendering, the UI may display:

```text
Capture Preview
```

with:

```text
dimensions
file size
capture mode
```

The preview must not alter the PNG.

---

# 63. Preview vs Final Asset

The preview is a UI representation.

The final PNG is the actual capture result.

The preview must never be captured recursively.

The Capture Engine must explicitly exclude all NewsClean UI.

---

# 64. Capture Cancellation

Long full-page captures must support cancellation.

Conceptual:

```text
CAPTURING...
[Cancel]
```

On cancellation:

```text
stop segment processing
release Capture Lock
restore scroll
restore NewsClean UI
discard incomplete PNG
```

---

# 65. Capture Timeout

The engine must use bounded waits.

Potential waits:

```text
Font readiness
Image readiness
Scroll stabilization
DOM stabilization
Browser capture
```

No capture step should wait indefinitely.

---

# 66. Timeout Result

If timeout occurs:

```text
{
  "success": false,
  "error": "CAPTURE_TIMEOUT"
}
```

The page must be restored to its pre-capture state.

---

# 67. Capture Failure Recovery

Failure recovery must always attempt:

```text
Release Capture Lock
Restore NewsClean UI
Restore scroll
Restore temporary capture state
```

The cleanup state itself must remain intact.

---

# 68. Capture Isolation

The Capture Engine must not alter editorial mutations.

Example:

```text
Before capture:
12 ads deleted
3 elements hidden
1 article kept
```

After failed capture:

```text
12 ads deleted
3 elements hidden
1 article kept
```

Capture failure must not trigger Cleanup Reset.

---

# 69. Capture and Undo

Capture itself should not create an Undo history entry.

Example:

```text
DELETE
DELETE
CAPTURE
UNDO
```

Undo should undo the last cleanup operation, not the capture.

---

# 70. Capture Lock and Undo

While:

```text
CAPTURE_LOCK
```

Undo and Redo should be disabled.

After capture:

```text
CAPTURE_LOCK released
```

normal history operations resume.

---

# 71. Capture Diagnostics

Development diagnostics should include:

```text
Capture Mode
Target
Viewport
Scroll Position
CSS Dimensions
Output Dimensions
DPR
Segment Count
Render Duration
Encoding Duration
File Size
Warnings
```

---

# 72. Capture Performance Targets

For a normal visible capture:

```text
Target:
< 500 ms
```

excluding browser scheduling overhead.

For a standard article:

```text
Target:
< 2 seconds
```

for a single-segment capture.

Large pages may exceed these targets.

The engine must prioritize correctness over artificial speed.

---

# 73. Memory Management

Large PNGs can consume significant memory.

The engine should avoid maintaining unnecessary copies.

Bad:

```text
Bitmap
+
Blob
+
Base64
+
Duplicate Blob
```

Good:

```text
Bitmap
 ↓
PNG Blob
 ↓
Export
 ↓
Release
```

Base64 should not be used as the primary internal representation.

---

# 74. Base64 Policy

Base64 increases memory usage and is unnecessary for binary export.

The Capture Engine should prefer:

```text
Blob
ArrayBuffer
ImageBitmap
```

where appropriate.

Base64 may only be used at an explicit compatibility boundary.

---

# 75. Segment Memory

For segmented capture:

```text
Segment 1
Segment 2
Segment 3
```

should not all remain decoded in memory if unnecessary.

The stitching strategy should stream or release intermediate resources where possible.

---

# 76. Stitching

For segmented captures, the conceptual process is:

```text
Segment A
Segment B
Segment C
      ↓
STITCHER
      ↓
Final Bitmap
      ↓
PNG
```

The Stitcher belongs conceptually inside the Capture Engine but should remain a separable internal module.

---

# 77. Stitching Alignment

Every segment must use consistent:

```text
X offset
Scale
Viewport width
Rendering state
```

Any mismatch can create:

```text
seams
duplication
missing rows
```

The engine must verify dimensions before stitching.

---

# 78. Stitch Verification

After stitching:

```text
finalWidth === expectedWidth
finalHeight === expectedHeight
```

must be verified.

If dimensions are inconsistent:

```text
capture failed
```

rather than exporting a corrupted image.

---

# 79. Element Capture and Scrolling

If the target is below the fold:

```text
scroll target into view
```

then:

```text
wait for stability
```

then capture.

The original scroll position must be restored.

---

# 80. Target Visibility

Before capture, the target must satisfy:

```text
target.isConnected === true
```

and have meaningful geometry:

```text
width > 0
height > 0
```

unless the user intentionally captures a zero-size target, which should be rejected in MVP.

---

# 81. Target Mutation During Capture

If the target changes during preparation:

```text
target geometry changed
```

the engine should:

```text
recalculate
```

rather than blindly using stale coordinates.

---

# 82. Capture Stability Verification

Immediately before rendering:

```text
Freeze State
+
Target Valid
+
Images Ready
+
Fonts Ready
+
UI Hidden
```

must be verified.

Only then:

```text
CAPTURE
```

---

# 83. Capture Readiness

Conceptual:

```ts
interface CaptureReadiness {
  frozen: boolean;
  stable: boolean;
  targetValid: boolean;
  imagesReady: boolean;
  fontsReady: boolean;
  overlaysHidden: boolean;
}
```

Capture proceeds only when mandatory fields are valid.

---

# 84. Capture Preparation Contract

Conceptual:

```ts
interface CapturePreparation {
  hideUI(): Promise<void>;
  hideOverlays(): Promise<void>;
  resolveTarget(): Promise<CaptureTarget>;
  verifyReadiness(): Promise<CaptureReadiness>;
  restore(): Promise<void>;
}
```

---

# 85. Capture Engine Contract

Conceptual:

```ts
interface CaptureEngine {
  capture(
    options: CaptureOptions
  ): Promise<CaptureResult>;

  cancel(): void;

  getState(): CaptureState;

  getDiagnostics(): CaptureDiagnostics;
}
```

---

# 86. Capture Options

Conceptual:

```ts
interface CaptureOptions {
  mode: CaptureMode;
  scale?: number;
  target?: CaptureTarget;
  background?: "PAGE";
  filename?: string;
}
```

For MVP:

```text
background = PAGE
```

should be the default and only supported semantic behavior.

---

# 87. Capture Target Resolution

Target resolution should use the same selector/reference principles defined by the DOM Inspector.

The Capture Engine must not invent its own incompatible target system.

Therefore:

```text
Inspector ElementReference
        ↓
CaptureTarget
```

---

# 88. Extraction Target Integration

If the user chooses:

```text
Capture Article
```

the engine may receive:

```text
ExtractionResult.article.selector
```

The Capture Engine then validates the selector against the current DOM.

---

# 89. Stale Extraction Target

If the extracted article selector no longer matches:

```text
querySelector(selector)
```

the Capture Engine must not blindly capture a replacement.

Instead:

```text
Target unavailable.
Please re-analyze or select manually.
```

---

# 90. Manual Target Priority

If the user manually selected:

```text
articleElement
```

and Extraction identified a different candidate:

```text
manual target
>
automatic target
```

The user's explicit selection wins.

---

# 91. Capture Modes and UI

Recommended UI:

```text
CAPTURE
────────────────────
Visible View
Full Page
Selected Element
────────────────────
PNG
1280 × 720
2.4 MB
────────────────────
[Capture]
```

The interface should remain minimal.

---

# 92. Capture Progress

For long full-page captures:

```text
Capturing...
Segment 3 / 8
```

The progress indicator belongs to NewsClean UI and must disappear before the actual bitmap is captured.

---

# 93. Capture Timing

The UI should separate:

```text
Preparation
```

from:

```text
Actual screenshot
```

The screenshot itself should happen only after:

```text
UI hidden
```

and:

```text
capture-ready
```

state.

---

# 94. Race Between UI Hiding and Capture

A critical implementation detail:

```text
hide UI
↓
browser must render hidden state
↓
capture
```

The engine should ensure that the browser has committed the visual state before capturing.

A controlled rendering synchronization step may be required.

---

# 95. Render Synchronization

Conceptual:

```text
Hide UI
 ↓
requestAnimationFrame
 ↓
requestAnimationFrame
 ↓
Capture
```

Two rendering frames provide a practical synchronization window.

The exact implementation should be validated experimentally.

---

# 96. Capture and Browser Zoom

Browser zoom affects visual rendering.

The Capture Engine should capture the actual browser-rendered result.

It must not reinterpret zoom as a cleanup or scaling operation.

Output dimensions should be calculated from actual capture output.

---

# 97. Browser Window Size

Visible capture depends on the browser viewport.

The engine should expose:

```text
viewportWidth
viewportHeight
```

before capture.

The user can understand what will be captured.

---

# 98. Full Page Width

For full-page capture, the engine should determine the effective document width.

Potential sources:

```text
document.documentElement.scrollWidth
document.body.scrollWidth
```

The implementation should choose the stable maximum appropriate for the current page.

---

# 99. Full Page Height

Likewise:

```text
document.documentElement.scrollHeight
document.body.scrollHeight
```

must be considered.

The engine should not assume:

```text
body.scrollHeight
```

is always authoritative.

---

# 100. Horizontal Overflow

If the page has horizontal overflow:

```text
document width > viewport width
```

the Capture Engine must decide according to mode.

For:

```text
VISIBLE
```

capture only the viewport.

For:

```text
FULL_PAGE
```

capture the full effective page width where technically supported.

For:

```text
ELEMENT
```

capture the target bounds.

---

# 101. Horizontal Scroll

Full-page capture should normally start at:

```text
scrollX = 0
```

if horizontal document rendering requires it.

After capture:

```text
restore original scrollX
```

The engine must not permanently change the user's position.

---

# 102. Capture Background

The capture represents the actual page.

Therefore:

```text
background = PAGE
```

is the MVP policy.

If the page background is white:

```text
white
```

If dark:

```text
dark
```

The Capture Engine does not normalize the background.

---

# 103. Transparency

Transparent output is not part of the MVP.

If the browser screenshot mechanism produces an opaque page screenshot, that result is accepted.

Transparent composition belongs to a future Composition Engine.

---

# 104. Capture Integrity

The final PNG must satisfy:

```text
No NewsClean UI
No inspector overlays
No capture controls
No loading indicator
No partial rendering
No duplicated segments
No unexpected blank regions
```

unless the page itself contains those visual elements as part of its cleaned state.

---

# 105. Page Content Integrity

The final asset must preserve:

```text
Typography
Images
Layout
Spacing
Colors
Source identity
Article content
```

exactly as rendered.

---

# 106. Capture Verification

After capture, the engine may perform lightweight validation:

```text
PNG signature valid
width > 0
height > 0
blob.size > 0
```

For segmented captures:

```text
dimensions correct
```

must also be verified.

---

# 107. PNG Signature

A valid PNG begins with the standard PNG signature.

The implementation may verify this at the binary level.

This is primarily a defensive diagnostic check.

---

# 108. File Size

The engine should expose:

```text
fileSizeBytes
```

after encoding.

The UI may display:

```text
2.8 MB
```

for user awareness.

---

# 109. Compression

PNG compression should prioritize:

```text
image integrity
```

over aggressive compression.

The browser or encoding implementation may determine compression behavior.

The engine should not introduce lossy compression.

---

# 110. Metadata

The MVP should not inject unnecessary metadata into the PNG.

Potential future metadata:

```text
source URL
capture timestamp
NewsClean version
```

must be considered carefully because URL metadata may expose information the user does not want embedded.

For MVP:

```text
No custom metadata injection.
```

---

# 111. Privacy

The Capture Engine must not:

```text
upload PNG
send article content to a server
send screenshot telemetry
```

The capture remains local.

---

# 112. Security

The page is untrusted.

The Capture Engine must not execute arbitrary page content.

The captured bitmap is treated as binary data.

No extracted webpage text should be interpreted as:

```text
JavaScript
HTML
extension command
```

---

# 113. Restricted Capture Context

If Chrome denies capture:

```text
CAPTURE_PERMISSION_DENIED
```

the engine must return a structured failure.

It should not retry indefinitely.

---

# 114. Error Model

Recommended errors:

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

# 115. Error Result

Example:

```json
{
  "success": false,
  "mode": "FULL_PAGE",
  "error": {
    "code": "BITMAP_TOO_LARGE",
    "message": "The page exceeds the safe PNG dimensions."
  }
}
```

No partial file should be exported as the final asset unless the user explicitly chooses a future partial-capture mode.

---

# 116. Failure Recovery Contract

Regardless of failure:

```text
Capture Lock → RELEASE
UI → RESTORE
Inspector → RESTORE
Scroll → RESTORE
Cleanup → PRESERVE
Freeze → PRESERVE
```

This is mandatory.

---

# 117. Capture and Session Lifecycle

Normal workflow:

```text
SESSION START
      ↓
FREEZE
      ↓
EXTRACT
      ↓
INSPECT
      ↓
CLEAN
      ↓
READY
      ↓
CAPTURE
      ↓
EXPORT
```

The session remains active after capture.

The user may perform another capture without rebuilding the page.

---

# 118. Multiple Captures

A session may perform:

```text
Visible Capture
↓
Element Capture
↓
Full Page Capture
```

without resetting cleanup state.

Each capture is independent.

---

# 119. Capture Repetition

If the user captures the same target twice without DOM changes:

```text
result should be visually deterministic
```

subject only to browser rendering differences outside NewsClean's control.

---

# 120. Capture Cache

The MVP should not cache final PNGs automatically.

A future cache may be introduced for repeated captures.

For now:

```text
Capture
→ Encode
→ Export
→ Release
```

keeps memory management simple.

---

# 121. Capture Diagnostics Example

```json
{
  "mode": "ELEMENT",
  "target": ".article",
  "cssWidth": 960,
  "cssHeight": 1840,
  "scale": 1,
  "outputWidth": 960,
  "outputHeight": 1840,
  "segments": 1,
  "renderDurationMs": 412,
  "encodeDurationMs": 87,
  "fileSizeBytes": 384921
}
```

---

# 122. Acceptance Criteria

The PNG Capture Engine is MVP-complete when:

```text
1. It captures the visible viewport.
2. It captures a selected DOM element.
3. It can capture a full page within safe browser limits.
4. It produces PNG output.
5. NewsClean UI is excluded from the final image.
6. Inspector overlays are excluded.
7. Cleanup proposal overlays are excluded.
8. Capture requires a stable/frozen state.
9. Capture Lock prevents concurrent mutations.
10. Scroll position is restored after capture.
11. Target validity is checked.
12. Image readiness is considered.
13. Font readiness is considered where available.
14. Large pages are handled safely.
15. Segmented capture can be used for long pages where necessary.
16. Failed captures do not destroy cleanup state.
17. Capture can be cancelled.
18. Capture failures return structured errors.
19. PNG dimensions are reported.
20. PNG file size is reported.
21. No screenshot is uploaded externally.
22. Capture itself does not create Undo history.
23. Manual target selection overrides automatic extraction.
24. The final PNG contains only the cleaned page state.
```

---

# 123. Future Extensions

Potential future capabilities:

```text
High-resolution export
2× / 3× capture
Transparent composition
Custom crop
Region selection
Automatic article framing
Multi-page PDF
JPEG / WebP export
Clipboard PNG
Drag-and-drop export
Capture presets
Batch capture
Watermarking
Editorial annotations
Template-based composition
```

These should be implemented outside the core PNG rendering contract where possible.

---

# 124. Architectural Invariants

The following rules are mandatory:

```text
1. Capture Engine renders; it does not clean.
2. Capture Engine does not identify article content.
3. Capture Engine does not classify advertisements.
4. Capture requires a stable page state.
5. Capture must exclude NewsClean UI.
6. Capture must not alter editorial mutations.
7. Capture must not create Undo history.
8. Capture Lock prevents concurrent DOM operations.
9. Target references must be validated before capture.
10. Scroll position must be restored.
11. Temporary capture state must be restored after success or failure.
12. Long pages must be handled without uncontrolled memory allocation.
13. Segmented capture must produce deterministic geometry.
14. PNG is the canonical MVP output.
15. Capture remains local.
16. No article content is uploaded externally.
17. Cross-origin iframe boundaries must be respected.
18. Browser restrictions must produce explicit errors.
19. Capture failure must never corrupt the cleanup session.
20. The final asset must contain no NewsClean interface elements.
```

---

# 125. Final Capture Architecture

The final architecture is:

```text
                         CLEAN WORKING PAGE
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ CAPTURE GATE    │
                         └────────┬────────┘
                                  │
                     ┌────────────┼────────────┐
                     │            │            │
                     ▼            ▼            ▼
                  VISIBLE       ELEMENT      FULL PAGE
                     │            │            │
                     └────────────┼────────────┘
                                  ▼
                         ┌─────────────────┐
                         │ PREPARE         │
                         │                 │
                         │ Hide UI         │
                         │ Hide overlays   │
                         │ Validate target│
                         │ Verify fonts   │
                         │ Verify images  │
                         └────────┬────────┘
                                  ▼
                         ┌─────────────────┐
                         │ CAPTURE LOCK    │
                         └────────┬────────┘
                                  ▼
                         ┌─────────────────┐
                         │ BROWSER RENDER  │
                         └────────┬────────┘
                                  ▼
                         ┌─────────────────┐
                         │ SEGMENT /       │
                         │ STITCH          │
                         └────────┬────────┘
                                  ▼
                         ┌─────────────────┐
                         │ PNG ENCODER     │
                         └────────┬────────┘
                                  ▼
                         ┌─────────────────┐
                         │ VALIDATE PNG    │
                         └────────┬────────┘
                                  ▼
                            PNG ASSET
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ EXPORT MANAGER  │
                         └─────────────────┘
```

---

# 126. Final Product Flow

With the previous documents, the complete NewsClean editorial pipeline is now:

```text
                         NEWS WEB PAGE
                              │
                              ▼
                    ┌──────────────────┐
                    │ 04 FREEZE ENGINE │
                    │                  │
                    │ Stabilize page  │
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ 07 EXTRACTION    │
                    │                  │
                    │ Find article     │
                    │ title            │
                    │ image            │
                    │ body             │
                    │ source           │
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ 05 DOM INSPECTOR │
                    │                  │
                    │ Select elements  │
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ 06 CLEANUP       │
                    │                  │
                    │ Delete           │
                    │ Hide             │
                    │ Keep             │
                    │ Rules            │
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ CLEAN WORKING DOM│
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ 08 CAPTURE       │
                    │                  │
                    │ Visible          │
                    │ Element          │
                    │ Full Page        │
                    └────────┬─────────┘
                             ▼
                         ┌───────┐
                         │  PNG  │
                         └───────┘
```

The key architectural boundary is now clear:

```text
FREEZE
    = stabilize

EXTRACTION
    = understand

INSPECTOR
    = select

CLEANUP
    = transform

CAPTURE
    = render

EXPORT
    = deliver
```

This separation must remain intact as NewsClean evolves.
