# Parotia

**clean the stage. keep the story.**

Freeze, inspect, clean and capture news pages as broadcast-ready PNGs.

## Status

Early scaffold. The following vertical slice is wired end-to-end:

- **Shared**: session/freeze/cleanup/capture state models with declared lifecycle transitions (`src/shared/types`).
- **Storage**: session store (`src/storage/sessionStore.ts`) and chrome.storage repositories (`src/storage/chromeStorageRepositories.ts`).
- **Background**: service worker routes typed commands to the active tab and owns the session registry (`src/background`).
- **Content**: session + overlay (Shadow DOM toolbar iframe), History Engine, Mutation Engine (undo/redo/delete/hide/keep/reset), Freeze Engine (soft freeze with a stability monitor), DOM Inspector, extraction scoring, and the command bridge (`src/content`).
- **UI**: React toolbar running in an isolated iframe (`src/ui`).

Not yet implemented: presets, hard freeze, capture/export orchestration, keep mode, smart cleanup, events bus, e2e.

## Scripts

```bash
npm install
npm run build      # bundles content + background + UI + manifest into dist/
npm run typecheck
npm run test
npm run lint
```

## Loading in Chrome

1. `npm run build`
2. chrome://extensions → Developer mode → Load unpacked → select `dist/`.
3. Open a news article and click the extension icon: the toolbar appears top-right.
4. Freeze the page, then use Pick/Delete/Hide/Keep and Undo/Reset.

## Layout

- `src/shared` — types, constants, pure utilities (no DOM, no chrome APIs)
- `src/storage` — persistence abstractions
- `src/background` — MV3 service worker
- `src/content` — page runtime (engines + overlay)
- `src/ui` — toolbar React app
- `src/capture` — capture & export pipeline (future)
- `src/presets` — preset definitions (future)
- `tests` — unit tests (vitest + jsdom)
