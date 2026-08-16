# NewsClean

## PNG Capture Engine

**Document ID:** `08-CAPTURE-ENGINE`
**Version:** `0.1.0`
**Status:** Foundation
**Related Documents:** `01-PRD.md`, `02-VISION.md`, `03-ARCHITECTURE.md`, `04-FREEZE-ENGINE.md`, `05-DOM-INSPECTOR.md`, `06-CLEANUP-ENGINE.md`, `07-ARTICLE-EXTRACTION.md`

---

## 1. Purpose

The PNG Capture Engine is the final rendering layer of NewsClean. It transforms the cleaned editorial webpage into a deterministic PNG asset for newsroom use, receiving the page after Freeze, Extraction, Inspection, and Cleanup.

> **Render the current editorial state exactly as intended and produce a clean PNG without NewsClean interface elements.**

The Capture Engine does not decide content relevance, perform cleanup, identify advertisements, or modify editorial content. It renders the current working state.

---

## 2. Core Principle

Clean Working DOM → VALIDATE Capture State → PREPARE Rendering Environment → CAPTURE (Visible / Full Page / Region) → ENCODE PNG → EXPORT Final Asset. The final PNG must represent the editorial state at the exact moment of capture.

---

## 3. Capture Modes

```ts
type CaptureMode =
  | "VISIBLE"
  | "FULL_PAGE"
  | "ELEMENT";
```

Each mode uses the same rendering pipeline but different geometry.

- **VISIBLE** — captures the currently visible browser viewport.
- **FULL_PAGE** — captures the entire cleaned article/page vertically. The user should not need to manually scroll and stitch screenshots.
- **ELEMENT** — captures a specific DOM element or extracted article region (e.g. `ARTICLE`, `MAIN`, `.article-body`).

Future modes `COMPOSED`, `CUSTOM_REGION`, `MULTI_PAGE` are outside the MVP.

---

## 4. Preconditions and Capture Gate

Capture requires `Freeze State = FROZEN` and `Cleanup State = READY`; Extraction is optional. If not frozen, the engine requests Freeze rather than silently capturing an unstable page.

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

---

## 5. Capture Session and Target

```ts
interface CaptureSession {
  id: string;
  mode: CaptureMode;
  startedAt: number;
  viewport: ViewportState;
  target: CaptureTarget | null;
  scale: number;
}

interface CaptureTarget {
  type: "VIEWPORT" | "ELEMENT";
  selector?: string;
  elementId?: string;
}
```

`VISIBLE` → `type = VIEWPORT`; `ELEMENT` → `type = ELEMENT`. The session is isolated from previous pages.

---

## 6. State Machine

```text
IDLE → PREPARING → VALIDATING → RENDERING → ENCODING → READY → EXPORTING → COMPLETED

Failure:      ANY STATE → FAILED
Cancellation: PREPARING / RENDERING → CANCELLED
```

- **IDLE** — no capture operation.
- **PREPARING** — temporary capture conditions are established.
- **VALIDATING** — target and rendering state are verified.
- **RENDERING** — browser screenshot mechanism is executing.
- **ENCODING** — captured bitmap is encoded as PNG.
- **READY** — PNG asset exists in memory, ready for export.
- **EXPORTING** — asset is transferred to the user's destination.
- **COMPLETED** — capture finished successfully.
- **FAILED** — capture could not be completed safely.

---

## 7. Browser Capture Strategy

Distinguish **page-side preparation** from **extension-level capture**:

- **Content Runtime** prepares the page (DOM → prepare).
- **Service Worker / extension context** coordinates browser-level capture (rendered tab → bitmap).

For visible screenshots, Chrome's `chrome.tabs.captureVisibleTab()` can capture the visible tab area. The implementation must respect Chrome's capture permissions and operational constraints.

---

## 8. UI Exclusion

The extension UI must never appear in the final PNG:

```text
Before capture → Hide NewsClean overlays → Capture → Restore overlays
```

The hiding operation must be synchronous enough to guarantee the screenshot does not include the UI.

All NewsClean visual components share a common internal root, `[data-newsclean-root]`, which the engine temporarily hides with `visibility: hidden` (or an equivalent strategy) — preferable to hiding every toolbar component individually.

The captured output must exclude: NewsClean toolbar, inspector overlay (highlight rectangle, selection border, action menu), selection highlight, cleanup proposal overlays (candidate highlights), freeze indicator, and capture controls/progress UI.

- The Freeze indicator is temporarily hidden before capture and restored after; the freeze state itself remains active.
- If the Inspector is active, capture switches to a CAPTURE MODE with editorial overlays disabled.
- If a proposal is being previewed, the user must APPLY or CANCEL it before capture.

A Capture Preview (dimensions, file size, capture mode) may be shown after rendering; it must not alter the PNG and must never be captured recursively.

---

## 9. Capture Lock

On capture start the page enters `CAPTURE_LOCK` to prevent concurrent operations: Delete, Hide, Keep, Inspect, Reset, Undo, and Redo are disabled, preventing DOM changes during rendering. The lock is short-lived:

```text
CLEANING → READY → CAPTURE_LOCK → RENDER → RELEASE
```

---

## 10. Capture Preparation

Before rendering, the engine enters `PREPARING` and must:

- Hide NewsClean UI, inspection overlays, selection overlays, and proposal overlays.
- Freeze visual state.
- Resolve capture geometry.
- Verify target.

---

## 11. Geometry and Device Pixel Ratio

The engine must calculate viewport width/height, document width/height, target width/height, and scroll position, all initially in CSS pixels. Screenshots are represented in physical pixels:

```text
physicalWidth  = cssWidth  × devicePixelRatio
physicalHeight = cssHeight × devicePixelRatio
```

```ts
interface CaptureScale {
  type: "DEVICE" | "FIXED";
  value?: number;
}
```

Default is `DEVICE`, respecting the browser's effective device pixel ratio; future options may include fixed 1× / 2× / 3× capture where supported.

Example: CSS 1280 × 2400 at DPR 1.0 → PNG 1280 × 2400; at DPR 2 → PNG 2560 × 4800. The UI should display final output dimensions before export when practical.

---

## 12. Maximum Bitmap Constraints and Segmentation

Browsers and image encoders impose practical limits on bitmap height, area, and memory. The engine must detect when geometry exceeds the safe limit before full-page capture and must not allocate a massive bitmap blindly.

For long articles, the engine captures multiple vertical segments internally, stitched into one PNG if final dimensions remain within safe limits. Every segment must maintain the **same width**, **same scale**, **same visual state**, and **same scroll position relationship**. Segments are captured sequentially; the DOM must remain frozen throughout.

### Segment Overlap

Segments may use a small overlap to prevent stitching gaps caused by browser rounding or fixed elements; the overlap strategy belongs to the stitching implementation. The final PNG must contain no duplicated visual region.

### Sticky / Fixed Elements

Sticky elements (`position: sticky`) may repeat during segmented capture. The engine must distinguish editorial content from viewport-fixed UI. MVP: temporarily neutralize known fixed/sticky non-editorial elements only when already explicitly hidden or deleted by Cleanup; the engine never arbitrarily removes page content. Fixed elements remaining after cleanup are preserved as part of the current editorial state.

---

## 13. Stitching

The Stitcher belongs conceptually inside the Capture Engine but remains a separable internal module: Segment A/B/C → STITCHER → Final Bitmap → PNG.

Every segment must use a consistent X offset, scale, viewport width, and rendering state; any mismatch can create seams, duplication, or missing rows. Verify dimensions before stitching, then after stitching require:

```text
finalWidth  === expectedWidth
finalHeight === expectedHeight
```

If dimensions are inconsistent, the capture fails rather than exporting a corrupted image.

---

## 14. Full-Page Semantics and Element Geometry

Full-page capture means capturing the current working document across its complete vertical extent; it does not automatically mean article-only. Article-only capture is handled through `ELEMENT` using the extracted article container: Extraction → Article Container → Inspector / User Confirmation → Cleanup → ELEMENT CAPTURE.

For element capture:

```text
const rect = element.getBoundingClientRect()
```

The engine calculates x, y, width, height and converts viewport coordinates into the capture coordinate system.

### Element Overflow

An element may contain content exceeding its visible rectangle. MVP: `ELEMENT` captures rendered element bounds. Future versions may support `ELEMENT_FULL_CONTENT` for overflowing containers.

### Target Validity

Before capture, the target must satisfy `target.isConnected === true` and have meaningful geometry (`width > 0`, `height > 0`). Zero-size targets are rejected in MVP. If target geometry changes during preparation, recalculate rather than use stale coordinates.

---

## 15. Scroll Handling

- **VISIBLE** — preserve the current scroll position.
- **ELEMENT** — target coordinates may require temporary scrolling: save scroll → scroll target into capture position → wait for stable render → capture → restore scroll.

After capture, `scrollX` / `scrollY` must be restored; the user should return to the same viewport position where practical.

Scrolling may trigger lazy loading, sticky transitions, and intersection observers; if the engine scrolls during capture it must verify stability again: SCROLL → WAIT → VERIFY → CAPTURE.

---

## 16. Readiness and Stability

Immediately before rendering, verify: Freeze State, Target Valid, Images Ready, Fonts Ready, UI Hidden.

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

### Images

For each visible target image, evaluate `img.complete` and, where relevant, `img.naturalWidth > 0`. Broken images must not block capture indefinitely.

### Lazy-Loaded Content

If new images appear during capture, wait for stability with a bounded timeout rather than silently producing an inconsistent asset; if the page never settles, report `PARTIAL_CAPTURE`.

### Web Fonts

Verify `document.fonts.ready` where available and capture only after the current font set is sufficiently resolved. If a font fails to load, a fallback font may change geometry — do not download missing fonts; capture the actual current rendered state.

### Animation, Media, Canvas, Cross-Origin

- Freeze should already disable visual animation; verify `Freeze State = FROZEN` before rendering. Capture must never become a second animation-freezing subsystem.
- Videos are normally paused by Freeze; if one remains active, capture the currently rendered frame — do not replace it with a poster image automatically.
- Canvas is rendered visual content; capture the browser-rendered state where supported; do not reconstruct it from JavaScript.
- Cross-origin iframes are browser-controlled rendering boundaries; capture them as part of visible browser output where the browser permits, and never inspect or rewrite their internal DOM.

---

## 17. Browser Security Restrictions

Some pages cannot be captured like ordinary websites (e.g. `chrome://`, Chrome Web Store, browser internal pages, extension pages). Detect unsupported contexts and return a structured failure; if Chrome denies capture (`CAPTURE_PERMISSION_DENIED`), do not retry indefinitely.

---

## 18. Output and PNG

### Result Schema

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

### Format

MVP output is `image/png`; do not output JPEG, WEBP, or AVIF as the primary capture format. Future export formats can be added later.

Encoding pipeline: Browser Screenshot → Bitmap → PNG Encoding → Blob → Export. Preserve pixel fidelity and the alpha channel where applicable.

### Alpha and Color

Opaque background is expected for ordinary webpage screenshots; transparent PNG output should not be assumed. A future Composition Engine may support transparent backgrounds; the Capture Engine remains compatible with alpha-capable pipelines.

Preserve browser-rendered colors: no color grading, compression filters, or brightness adjustments.

### No Editorial Processing

The engine must never sharpen, blur, recolor, resize editorial content, rewrite text, or remove logos.

### Compression and Metadata

PNG compression prioritizes image integrity over aggressive compression; the encoding implementation may determine compression behavior, but the engine must not introduce lossy compression.

MVP injects no custom metadata. Future metadata (source URL, capture timestamp, NewsClean version) must be considered carefully because URL metadata may expose information the user does not want embedded.

### Integrity and Verification

The final PNG must contain no NewsClean UI, inspector overlays, capture controls, loading indicator, partial rendering, duplicated segments, or unexpected blank regions — unless the page itself contains them as part of its cleaned state. Preserve Typography, Images, Layout, Spacing, Colors, Source identity, and Article content exactly as rendered.

After capture, perform lightweight validation:

- PNG signature bytes valid — `89 50 4E 47 0D 0A 1A 0A` (binary-level defensive diagnostic check).
- `width > 0`, `height > 0`, `blob.size > 0`.
- For segmented captures, dimensions correct (`finalWidth === expectedWidth`, `finalHeight === expectedHeight`).

Expose `fileSizeBytes` after encoding (UI may display e.g. `2.8 MB`).

---

## 19. Filename Strategy

Default filename must be deterministic and newsroom-friendly, e.g. `news-clean-2026-08-12-article.png`. A future strategy uses extracted information: `SOURCE_ARTICLE_DATE.png`, e.g. `al24news-2026-08-12-article.png`.

Sanitize `/ \ : * ? " < > |` and other filesystem-invalid characters; use the basename only. Source hierarchy:

```text
User-provided filename
↓
Article title
↓
Source + date
↓
Hostname + timestamp
```

Do not expose sensitive URL query parameters in filenames. Timestamp uses `YYYYMMDD-HHmmss` (e.g. `20260812-132410`), which avoids filesystem ambiguity.

---

## 20. Export Boundary

The engine produces a `Blob` (or equivalent binary representation). Export is a separate responsibility — the engine must not tightly couple rendering with filesystem operations:

```text
Capture Engine → PNG Blob → Export Manager → User File
```

A future `09-EXPORT-ENGINE.md` may define Download, Save As, Clipboard, File System Access, Naming, Metadata. For this document, Capture stops at "PNG asset ready." Clipboard export is a future feature, separate from core capture.

---

## 21. Cancellation, Timeout, and Failure Recovery

### Cancellation

Long full-page captures must support cancellation: stop segment processing, release Capture Lock, restore scroll, restore NewsClean UI, discard the incomplete PNG.

### Timeout

All waits are bounded: font readiness, image readiness, scroll stabilization, DOM stabilization, browser capture; no step waits indefinitely. On timeout: `{ "success": false, "error": "CAPTURE_TIMEOUT" }` and the page must be restored to its pre-capture state.

### Failure Recovery

Always attempt: release Capture Lock, restore NewsClean UI, restore scroll, restore temporary capture state. Cleanup state remains intact.

Capture isolation: the engine must not alter editorial mutations (e.g. 12 ads deleted, 3 elements hidden, 1 article kept must be unchanged after a failed capture). Capture failure must not trigger Cleanup Reset.

### Undo

Capture itself must not create an Undo history entry; Undo undoes the last cleanup operation, not the capture. While `CAPTURE_LOCK` is active, Undo and Redo are disabled; normal history resumes after release.

### Recovery Contract (mandatory)

```text
Capture Lock → RELEASE
UI           → RESTORE
Inspector    → RESTORE
Scroll       → RESTORE
Cleanup      → PRESERVE
Freeze       → PRESERVE
```

---

## 22. Contracts

### Capture Preparation Contract

```ts
interface CapturePreparation {
  hideUI(): Promise<void>;
  hideOverlays(): Promise<void>;
  resolveTarget(): Promise<CaptureTarget>;
  verifyReadiness(): Promise<CaptureReadiness>;
  restore(): Promise<void>;
}
```

### Capture Engine Contract

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

### Capture Options

```ts
interface CaptureOptions {
  mode: CaptureMode;
  scale?: number;
  target?: CaptureTarget;
  background?: "PAGE";
  filename?: string;
}
```

`background = PAGE` is the MVP default and only supported semantic behavior.

### Target Resolution

Target resolution reuses the DOM Inspector's selector/reference principles — the engine must not invent an incompatible target system: Inspector `ElementReference` → `CaptureTarget`. For "Capture Article", the engine may receive `ExtractionResult.article.selector` and must validate it against the current DOM.

If the selector no longer matches `querySelector(selector)`, do not blindly capture a replacement; report "Target unavailable. Please re-analyze or select manually."

Manual target priority: a user's explicit selection wins over an Extraction candidate (`manual target > automatic target`).

---

## 23. Capture Timing

The UI separates preparation from the actual screenshot; the screenshot happens only after UI hidden and the capture-ready state. Race condition: hide UI → browser must render hidden state → capture. Ensure the browser has committed the visual state before capturing; a controlled rendering synchronization step may be required.

```text
Hide UI
 ↓
requestAnimationFrame
 ↓
requestAnimationFrame
 ↓
Capture
```

Two rendering frames provide a practical synchronization window; validate experimentally.

---

## 24. Zoom, Window Size, and Document Dimensions

- **Zoom** — capture the actual browser-rendered result; do not reinterpret zoom as a cleanup or scaling operation. Output dimensions come from actual capture output.
- **Window size** — expose `viewportWidth` / `viewportHeight` before capture so the user understands what will be captured.
- **Full-page width/height** — derive width from `document.documentElement.scrollWidth` / `document.body.scrollWidth` and height from `document.documentElement.scrollHeight` / `document.body.scrollHeight`; choose the stable maximum appropriate for the current page; do not assume `body.scrollHeight` is always authoritative.
- **Horizontal overflow** — if document width > viewport width: `VISIBLE` captures the viewport only; `FULL_PAGE` captures the full effective page width where technically supported; `ELEMENT` captures the target bounds.
- **Horizontal scroll** — full-page capture starts at `scrollX = 0` if horizontal rendering requires it, then restores the original `scrollX`; never permanently change the user's position.

---

## 25. Background Policy

`background = PAGE` is the MVP policy: the capture represents the actual page — white stays white, dark stays dark, no normalization. Transparency is not MVP; an opaque browser screenshot is accepted. Transparent composition belongs to a future Composition Engine.

---

## 26. Privacy and Security

- **Privacy** — never upload PNGs, send article content to a server, or send screenshot telemetry. Capture remains local.
- **Security** — the page is untrusted; never execute arbitrary page content. The captured bitmap is binary data; no extracted webpage text should be interpreted as JavaScript, HTML, or an extension command.

---

## 27. Diagnostics

Diagnostics include: Capture Mode, Target, Viewport, Scroll Position, CSS Dimensions, Output Dimensions, DPR, Segment Count, Render Duration, Encoding Duration, File Size, Warnings.

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

## 28. Performance and Memory

### Performance Targets

- Normal visible capture: **< 500 ms** (excluding browser scheduling overhead).
- Standard article, single-segment capture: **< 2 seconds**.
- Large pages may exceed these targets.

Prioritize correctness over artificial speed.

### Memory Management

Avoid unnecessary copies. Bad: Bitmap + Blob + Base64 + Duplicate Blob. Good: Bitmap → PNG Blob → Export → Release.

- **Base64 policy** — Base64 increases memory usage and is unnecessary for binary export. Prefer `Blob`, `ArrayBuffer`, `ImageBitmap` where appropriate; use Base64 only at an explicit compatibility boundary.
- **Segment memory** — do not keep all segments decoded in memory if unnecessary; the stitching strategy should stream or release intermediate resources where possible.

---

## 29. Session Lifecycle

```text
SESSION START → FREEZE → EXTRACT → INSPECT → CLEAN → READY → CAPTURE → EXPORT
```

The session remains active after capture; further captures need not rebuild the page. A session may perform Visible, Element, and Full Page captures without resetting cleanup state; each capture is independent. Same-target captures without DOM changes should be visually deterministic, subject only to browser rendering differences outside NewsClean's control.

The MVP must not cache final PNGs automatically; Capture → Encode → Export → Release keeps memory management simple. A future cache may serve repeated captures.

---

## 30. Error Model

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

## 31. Acceptance Criteria

The PNG Capture Engine is MVP-complete when:

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

---

## 32. Future Extensions

Potential future capabilities: high-resolution export, 2× / 3× capture, transparent composition, custom crop, region selection, automatic article framing, multi-page PDF, JPEG / WebP export, clipboard PNG, drag-and-drop export, capture presets, batch capture, watermarking, editorial annotations, template-based composition. These should be implemented outside the core PNG rendering contract where possible.

---

## 33. Architectural Invariants

The following rules are mandatory:

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
