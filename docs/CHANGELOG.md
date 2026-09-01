# Changelog

All notable changes to Parotia are documented here.

---

## [Unreleased]

### C3 content-runtime coverage

- Added contract-level content-runtime tests for session lifecycle, toolbar teardown, freeze/unfreeze, inspector action callbacks, shortcut session binding, error envelopes and capture-handler dispatch.
- Added complete direct coverage for cleanup commands, including invalid selection, preview token expiry, confirm/delete-similar, undo/redo/reset and runtime-safe no-op paths.
- Hardened Free Select against `pointercancel` during a live gesture so a lost pointer cannot leave a capture overlay stranded; added coverage for move/resize/clamp, crossed handles, tiny regions and DPR fallback.
- Expanded toolbar-origin coverage for legacy resize handshakes, malformed resize data and `postMessage` failures.
- The suite now contains 550 passing Vitest tests across 54 files and measures 94.71% Lines/Statements, 86.85% Functions and 84.64% Branches.

### Coverage hardening foundation

- Audited the executable coverage scope, limited exclusions to documented type-only, barrel and declarative mount entries, and added an automated per-file coverage-debt report through `npm run coverage:gaps`.
- Raised the global regression floor to the measured baseline and chained the critical-file and coverage-gap checks into `npm run test:coverage`.
- Added hostile-input and boundary coverage for PNG/image decoding, selectors, reversible DOM patches, editor preflight, media readiness, logging, document history and typography.
- Completed coverage phases C1 and C2: all measured Shared utilities, keyboard shortcuts, Background services and Visible/Region/Element/Full-page capture modes now reach 100% in all four metrics.
- The suite now contains 517 passing Vitest tests across 52 files. Global coverage is 92.25% Lines/Statements, 85.12% Functions and 83.06% Branches, with a raised regression floor and 612 lines, 104 functions and 510 branches remaining.
- Hardened editor capability trust by comparing `chrome-extension:` protocol, host and path explicitly; non-standard URL origins serialize as `null` and could otherwise fail to distinguish extension IDs.
- Editor-open fallback responses now accurately report `editor: false` and `editorFallback: true` when the original capture is downloaded instead of claiming the editor opened successfully.
- Added `docs/COVERAGE-100-PLAN.md` with immutable baseline figures, phased task IDs, acceptance gates, risk controls and a continuously updated progress ledger.

### Professional layers, typography and shapes

- Added a non-destructive layer workspace with multi-selection, grouping, alignment, distribution, drag ordering, locking, visibility, clipboard workflows, keyboard controls and smart snapping guides.
- Added professional editable typography: multiline RTL/LTR text, explicit font fallback, local-font discovery after user permission, text boxes, spacing, backgrounds, borders, shadows and reusable presets.
- Split typography into click-created Point Text and drag-created Paragraph Text, added direct numeric font sizing and professional Justify Last Left/Center/Right modes without changing the normal alignment controls. Point Text resizes proportionally through corner handles; Paragraph Text updates its reflow box live while every glyph remains at a `1:1` scale and font size stays controlled exclusively by the size field.
- Delegated the `local-fonts` Permissions Policy feature to the embedded editor and added a policy-aware fallback that avoids calling `queryLocalFonts()` when the host page blocks access.
- Added editable shape geometry and solid/dashed/dotted strokes, configurable arrow heads and direction reversal, automatically continued numbered step markers, type-safe style copy/paste and four editorial shape presets.
- Advanced the editor document to schema v6 with strict text-mode and last-line justification invariants plus recursive migration from v0/v1/v2/v3/v4/v5; copied legacy layers are migrated before insertion.
- Expanded the real Chromium workflow to cover Arabic text, text presets, numbered steps, style transfer, advanced arrows and final native-resolution save.

### Non-destructive editor document foundation

- Replaced PNG-per-gesture history with a versioned `EditorDocument` and reversible `EditorDocumentHistory` command timeline bounded by both entry count and retained bytes.
- Added stable image, text, rectangle, ellipse, line, arrow and callout layer contracts with IDs, order, visibility, locking, opacity and geometric transforms.
- New annotations remain vector layers and survive document rebuilds through Undo/Redo; the old snapshot-based `EditorHistory` was removed.
- Kept Flatten/Export explicit and independent: Copy, Share and Save render the native document, while current crop/adjust operations use reversible raster-document replacement commands.
- Added strict parsing, deterministic serialization, version-zero migration and round-trip/command/integration coverage; the suite now contains 353 tests across 40 files.

### Professional editor viewport

- Added a dedicated presentation-only viewport controller with cursor-centred zoom, bounded pan, `Fit`, `Fill`, `1:1`, percentage feedback and resize-aware recentering.
- Added wheel/trackpad navigation, middle-button and `Space + Drag` panning, plus `Ctrl/Cmd +/-`, `0` and `1` shortcuts that respect editable controls.
- Konva now remains at native image dimensions while the outer surface receives a GPU-friendly CSS transform, so workspace zoom never changes annotation coordinates or exported pixels.
- Viewport gestures and controls pause while the coordinate-sensitive crop overlay is active, then resume automatically.
- Added mathematical and UI integration coverage; the suite now passes 340 tests across 39 files.

### Large-image editor preflight

- PNG dimensions are read from IHDR before image decode or Canvas allocation, and the editor estimates five decoded RGBA surfaces plus encoded-data overhead against a bounded device-memory budget.
- The current editor contract now declares limits of `16384px` per dimension and `32 Mi` pixels, with a `256–512 MiB` working budget (`384 MiB` fallback).
- Oversized captures bypass editor staging and download the unchanged original with an explicit dimensions/limit warning; the editor repeats the check before allocation as defense in depth.
- Accepted captures show dimensions and megapixels in the editor header. Proxy/tiled editing remains an explicit later milestone and no quality reduction occurs silently.
- Added focused preflight, gateway and zero-allocation editor tests; 334 Vitest tests now pass across 38 files.

---

## [1.4.1] - 2026-08-24

### Full-page capture reliability

- Full-page slices now overlap by a bounded eight CSS pixels and use only reachable scroll positions, preventing fractional DPR/tab-zoom rounding from leaving one-pixel holes that made the completeness check reject pages such as the reported `8088px` case.
- The stitcher now calibrates its pixel scale from the first real Chrome viewport bitmap instead of assuming `devicePixelRatio` exactly matches `captureVisibleTab`, eliminating persistent gaps at fractional browser/OS scaling.
- If a dynamic page still creates an unrepairable gap, Parotia exports only the continuous top portion with a `partial` filename and an explicit captured/requested-height warning instead of failing the entire operation or silently inserting blank pixels.
- Full-page preparation temporarily disables smooth scrolling, scroll snapping and scroll anchoring, then restores the page exactly after capture.
- Toolbar broadcasts now wait for a validated extension-origin iframe handshake, eliminating early `postMessage` target-origin errors while the frame is still `about:blank` at the page origin.
- Added direct coverage for the `8088px` fractional-DPR/real-bitmap-scale assembly path, partial fallback contract and iframe readiness boundary; 323 Vitest tests now pass.

---

## [1.4.0] - 2026-08-23

### Capture correctness and page safety

- Element capture now uses a fidelity-first path: a fully visible selection is captured once at native tab zoom and cropped directly from the viewport pixels. It no longer isolates the DOM, forces avatar/media styles, changes lazy-image attributes, pre-scrolls the page or zooms in; this prevents X/Twitter profile avatars and responsive layout from disappearing or shifting.
- Element PNGs are safely enlarged to 2× after the faithful crop using high-quality browser resampling in a single render pass. Canvas dimensions and output memory are bounded, with the highest safe scale/native fallback for exceptional images; the page itself is never zoomed.
- Coordinate-based stitching now handles overlap, clamped final scroll positions and non-zero element origins, and rejects incomplete pixel coverage.
- Capture-time DOM changes are transactional and restore original inline values, attribute presence and CSS `!important` priorities.
- Visual readiness covers lazy images, browser-selected `picture`, video posters, SVG images, CSS backgrounds and open Shadow DOM under hard deadlines with diagnostics.
- Region/element crop geometry is finite, positive and clamped to viewport/bitmap bounds; Twitter-like avatar fallbacks are limited to visual assets and their ancestors.

### Sessions, security and storage

- Tab/session ownership survives MV3 suspension in `chrome.storage.session`, is checked against live tabs and never falls back to the active tab.
- Message validation is centralized; content responses use a single envelope and the content runtime has one message router.
- Toolbar broadcasts now require both the hosting parent window and its exact declared origin; identifiers use `crypto.randomUUID()`, and manifest URL matching uses the canonical wildcard scheme pattern.
- Editor capabilities use exact origin/path/tab checks, PNG signature and decoded-size checks, expiry, consume-before-download replay protection and startup/lazy/tab-close cleanup.

### Editor, freeze and cleanup

- Annotation, crop and adjust now share one bounded visible history with ordered Undo/Redo.
- Crop/adjust/copy/share/save/close are serialized; Save has a terminal state and Close waits for discard with a timeout.
- Freeze has a hard stability deadline and no longer claims to patch page-world timers from the isolated world.
- Hide/Show/Undo/Reset preserve original display values/priorities and regeneration protection scans bounded descendant subtrees.

### Quality and architecture

- Added deterministic media/long-page/Twitter-like fixtures, direct critical-path tests and a real Chromium editor draw/save flow.
- Global coverage is above 90% lines/statements with critical per-file gates; 315 Vitest tests and 5 Playwright tests pass.
- Restored the protected-branch check names (`typecheck`, `lint`, `test`, `build`), made clean CI installs ignore dependency lifecycle scripts, and replaced on-demand `npx` execution with lockfile-owned Playwright npm scripts.
- Updated the official GitHub Actions to their Node 24-native releases, removing runner deprecation annotations from the stable CI baseline.
- Upgraded Vitest/coverage to patched 3.2.6, Happy DOM to 20.11.6 and esbuild to 0.28.2; a clean `npm audit` now reports zero known vulnerabilities.
- Split session registry, editor tickets, temporary storage and downloads out of the service worker; added the reversible DOM ledger and capture preparation transaction owner.
- CI builds the extension once, reuses the artifact for E2E and uploads coverage and failure artifacts.
- Began the compatibility-safe NewsClean → Parotia migration: new types/wire sources use Parotia while legacy DOM selectors and aliases remain accepted for 1.x.

## [1.1.4] - 2026-08-20

### Element Capture: X.com / Virtualized-Feed Fix

- **Removed pre-roll scroll** from `PREPARE_ELEMENT_CAPTURE` — the pre-roll scrolled through every slice position to wake lazy images, but on virtualized sites like X/Twitter, programmatic scrolling triggers feed re-rendering (cells are `transform: translateY()` + unmounted off-screen), which could reposition the target element between capture slices → scrambled/misaligned output. The `isolate()` step already forces `loading="eager"` + `img.decode()` on all images inside the element, so the pre-roll was redundant
- **Recompute `elementDocTop`** after re-measuring the element post-render — the previous code preserved the stale offset from `isolate()`, which could drift if the element moved during the pre-render wait. Now uses fresh `window.scrollY + rect.top`
- **Fixed `postMessage` throw** in `broadcastState` / `broadcastProgress` — the toolbar iframe starts as `about:blank` (page origin) and only navigates to the extension origin after load; posting with a `chrome-extension://` target origin before load threw `DOMException` and could break command handlers that called `broadcastState`

---

## [1.1.3] - 2026-08-19

### Element Capture Reverted

- **Reverted** the v1.1.1/v1.1.2 element-capture changes: the anchored (fixed/sticky) single-shot, the full-rect crop, the slice-level image wait, and the cross-origin iframe substitution introduced stray visual content and dropped the profile picture on sites like Twitter/X
- Element capture is back to the v1.1.0 behaviour (pre-roll eager sweep, `waitForElementRendering`, 2× zoom, horizontal-only crop) that captured containers correctly

---

## [1.1.2] - 2026-08-19

### Embedded Media in Captures

- **Cross-origin embeds now appear** — cross-origin iframes (YouTube, Vimeo embeds, Twitter/Instagram cards) are painted blank by `captureVisibleTab`, so during element capture they are temporarily swapped for the real media thumbnail (YouTube `img.youtube.com`, Vimeo) or a branded placeholder, then restored exactly afterwards
- YouTube thumbnails use the HD `maxresdefault` image with automatic fallback to `hqdefault`
- Parotia's own UI frames are never touched

---

## [1.1.1] - 2026-08-19

### Element Capture Completeness

- **Slice-level image readiness** — before each slice is captured the content script waits (bounded) until every lazy image visible in that slice has painted, so tweets and media-heavy containers no longer come out with missing avatars/photos
- **Additive eager loading** — lazy images a site hydrates *after* isolation (data-src swaps, infinite scroll) are flipped to eager too and fully restored afterwards
- **Fixed/sticky element capture** — elements anchored to the viewport (position:fixed/sticky) are now captured in a single shot with a precise crop instead of being mangled by scrolling
- **Full-rect crop** — the final PNG is cropped to the element's exact bounds both horizontally and vertically

---

## [1.1.0] - 2026-08-19

### Hardening Release

#### Capture Reliability

- **Slice verification** — each captured slice is checked for blank output; blank slices are re-captured automatically
- **Capture retry** — viewport captures are retried up to 3 attempts with linear backoff instead of aborting on transient failures
- **Eager image loading** — images are force-loaded (scroll pre-roll + `loading=eager` + settle wait) before stitching so lazy-loaded articles capture completely
- **Long-page fallback** — pages too tall for the canvas limit automatically zoom out and re-measure; a clear error suggests Free-Select capture when that isn't enough

#### Stability & Precision

- **Regeneration guard** — the freeze engine now blocks sites from recreating deleted elements; undo/redo restores are never blocked
- **Stronger freeze** — embedded frames are locked against interaction and repeating `setInterval` timers (carousels, ad tickers) are neutralized; both fully restored on unfreeze
- **Delete Similar preview** — a preview highlights every matching element before deletion; confirming re-validates the DOM so new matches are never silently removed

#### Technical

- 237 tests across 24 files (all green: typecheck, lint, unit, build, e2e)
- New `preload` module and regeneration-guard/preview infrastructure behind existing message types

---

## [1.0.0] - 2026-08-19

### Initial Release

#### Features

- **Freeze** — Stabilize dynamic pages with `window.stop()`, CSS injection, and MutationObserver monitoring
- **Inspect & Pick** — DevTools-style element picker with hover highlighting and floating action bar
- **Delete** — Remove unwanted elements (ads, banners, popups, cookie notices)
- **Hide** — Visually hide elements without removing them from DOM
- **Delete Similar** — Find and remove structurally similar elements
- **Undo/Redo** — Full history stack with visual action log (cap: 100 operations)
- **Reset** — Restore all removed and hidden elements
- **Full Page Capture** — Viewport slicing + stitching for long articles
- **Visible Area Capture** — Single viewport screenshot
- **Element Capture** — Isolate and capture specific elements with 2x zoom
- **Free Select Capture** — Draw rectangle on frozen page to capture arbitrary regions
- **Live Capture Progress** — Real-time progress display ("Capture rendering 2/4 (50%)")
- **Keyboard Shortcuts** — Shift+Alt+F (freeze), Shift+Alt+P (pick), Escape, Delete
- **Toolbar UI** — Glassmorphism design with Shadow DOM isolation
- **Options Page** — Bilingual (English/Arabic) with full RTL support
- **Bilingual Interface** — English and Arabic language toggle

#### Technical

- Manifest V3 (MV3) architecture
- TypeScript strict mode with `noUncheckedIndexedAccess`
- React 18 for toolbar UI
- Vite 6 for UI bundling
- esbuild for content/background bundling
- Zod for runtime validation
- Lucide React for icons
- 208 tests across 23 files
- Coverage thresholds: 80% statements/functions/lines, 75% branches
- Zero network activity — all processing local
- CSP: `script-src 'self'; object-src 'self'`

#### Security

- Command type allowlist (28 validated command types)
- Payload validation at Service Worker and Content Runtime boundaries
- Origin checks on all postMessage communication
- Shadow DOM isolation for toolbar UI
- Filename sanitization (NFKC normalization, path traversal prevention)
- Session-scoped element IDs (never persisted across sessions)
- Stale reference defense (STALE_REFERENCE error on unresolved elements)
- Stale data cleanup on service worker restart

#### Build

- Multi-tool pipeline: esbuild + Vite + sharp + custom manifest generator
- `install.bat` for one-click Windows installation
- ~315 KB total build output
- Deterministic, CI/CD-ready

---

## [0.2.0] - 2026-08-XX

### Changes

- Redesigned options page with bilingual support
- Fixed toolbar guide icons
- Removed preset system
- Removed Keep element protection feature

---

## [0.1.0] - 2026-XX-XX

### Initial Development

- Project scaffolding
- Core engine implementations
- Basic capture pipeline
- Unit test setup
