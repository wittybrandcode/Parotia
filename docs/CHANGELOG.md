# Changelog

All notable changes to Parotia are documented here.

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

- 242 tests across 24 files (all green: typecheck, lint, unit, build, e2e)
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
