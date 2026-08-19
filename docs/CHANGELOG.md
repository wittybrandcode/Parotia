# Changelog

All notable changes to Parotia are documented here.

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
