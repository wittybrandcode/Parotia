# Parotia

**clean the stage. keep the story.**

Freeze, inspect, clean and capture news pages as broadcast-ready PNGs.

## Status

Working extension (Chrome MV3), version `0.2.0`. 236 unit/integration tests across 26 files, all green.

Implemented:

- **Freeze** — soft freeze with a stability monitor (`window.stop()`, animation/transition/video suspension).
- **Inspect & clean** — pick elements, then Delete / Hide / Keep / Delete Similar, all undoable through a History Engine with an action log and Redo.
- **Site Presets** — per-site cleanup rules (CNN/BBC/Al Jazeera built-in) saved to `chrome.storage`, applied opt-in only, managed from the options page.
- **Capture** — full-page capture (viewport slicing + stitching, fixed-header removal) and single-element capture (visual isolation, ×2 zoom, crop), exported as `parotia-<title>-<timestamp>.png` via `chrome.downloads` (requested on first export).
- **Live capture progress** — the toolbar shows `Capture rendering 2/4 (50%)` while a capture runs.
- **Keyboard shortcuts** — `Shift+Alt+F` freeze, `Shift+Alt+P` pick, `Escape` / `Delete` (see `KEYBOARD_SHORTCUTS.txt`).

Security posture: command allowlist + runtime payload validation at every boundary, `postMessage` restricted to the extension origin, `tabs`/`host_permissions` removed (relies on `activeTab`), `downloads` optional, no `eval`/`document.write`.

## Scripts

```bash
npm install
npm run build          # content + background + UI + icons + manifest into dist/
npm run typecheck
npm run lint           # eslint src tests --max-warnings 0
npm run test           # vitest (happy-dom)
npm run test:coverage  # vitest coverage with enforced thresholds
npm run test:e2e       # Playwright smoke test against the built dist/ (pre-builds)
npm run dev:ui         # Vite dev server for the toolbar UI
```

## Loading in Chrome

1. `npm run build`
2. chrome://extensions → Developer mode → Load unpacked → select `dist/`.
3. Open a news article and click the extension icon (or let the injected toolbar start its own session): the toolbar appears top-right.
4. Freeze the page (click the Parotia logo), then use Pick/Delete/Hide/Keep, Delete Similar, Undo/Redo, or capture full page / selected element.
5. Open the extension's options page to enable/disable/delete site presets.

## Layout

- `src/shared` — types, constants, pure utilities (`filename`, `id`, `selector`)
- `src/storage` — chrome.storage repositories (presets) + schema
- `src/background` — MV3 service worker: routing, per-tab sessions, capture orchestration (no DOM access)
- `src/content` — page runtime (content script owns the DOM exclusively):
  - `index.ts` command bridge + state broadcasting
  - `session/` · `freeze/` · `inspector/` · `cleanup/` · `mutation/` (history) · `matching/` · `extraction/` · `keyboard/` · `overlay/` · `capture/` (stitcher, element capture, slice math, fixed headers)
- `src/presets` — default site presets, matcher, validator
- `src/ui` — React toolbar (iframe in a Shadow DOM) + options page (Vite multi-page)
- `scripts` — build tooling (esbuild bundles, manifest generation, icon generation)
- `tests` — vitest suites (happy-dom) + `tests/e2e` Playwright smoke test

## Testing

- Unit/integration: **Vitest + happy-dom** (`tests/setup.ts` stubs `chrome.*`).
- Coverage: **v8 provider** with enforced thresholds (lines/statements/functions ≥80, branches ≥75).
- E2E: **Playwright** boots the real built extension headless (full Chromium; the headless shell cannot run extensions) and verifies the MV3 service worker registers and the options page renders against real `chrome.storage`.
