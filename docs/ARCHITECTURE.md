# Architecture

Parotia is a Manifest V3 Chrome extension built with a strict separation between three execution contexts that never share memory.

---

## Execution Contexts

```
┌─────────────────────────────────────────────────────────┐
│                    Service Worker                         │
│              src/background/service-worker.ts             │
│          (737 lines — NO DOM access)                      │
│                                                           │
│  chrome.tabs.*  chrome.downloads.*  chrome.storage.*      │
└──────────────────────┬──────────────────────────────────┘
                       │ chrome.tabs.sendMessage
                       │ chrome.runtime.onMessage
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    Content Runtime                        │
│              src/content/index.ts (hub)                   │
│          (566 lines — OWNS the page DOM)                  │
│                                                           │
│  session · freeze · inspector · cleanup · mutation         │
│  extraction · capture · matching · keyboard · overlay      │
│  selection                                                  │
└──────────────────────┬──────────────────────────────────┘
                       │ postMessage (targeted origin)
                       │ chrome.runtime.sendMessage
                       ▼
┌─────────────────────────────────────────────────────────┐
│                      Toolbar UI                           │
│              src/ui/src/App.tsx                            │
│          (410 lines — React 18, Shadow DOM)               │
│                                                           │
│  Freeze toggle · Pick · Delete · Hide · Capture            │
│  Free Select · History · Undo/Redo · Reset                 │
└─────────────────────────────────────────────────────────┘
```

### Service Worker (Background)

**Never touches the page DOM.** Responsible for:

- Extension lifecycle and toolbar activation
- Tab ↔ session mapping (`Map<tabId, sessionId>`)
- Capture orchestration (screenshot, scroll, stitch, download)
- Payload validation at the privileged boundary
- Session recovery after SW restarts
- Stale data cleanup on startup

### Content Runtime

**Owns the page DOM exclusively.** Injected via `chrome.scripting.executeScript`. Central hub (`index.ts`) wires all engines:

| Engine | File | Lines | Purpose |
|--------|------|-------|---------|
| Session | `session/session.ts` | 55 | Lifecycle state machine, page context capture |
| Freeze | `freeze/freezeEngine.ts` | 197 | `window.stop()`, CSS injection, MutationObserver stability |
| Inspector | `inspector/inspector.ts` | 456 | Element picker, hover overlay, action bar |
| Cleanup | `cleanup/cleanupEngine.ts` | 196 | Delete/hide coordination, count tracking |
| Mutation | `mutation/mutationEngine.ts` | 290 | Central DOM mutation point, undo/redo |
| History | `mutation/history.ts` | 119 | LIFO undo/redo stack (cap: 100) |
| Extraction | `extraction/extractionEngine.ts` | 121 | Article candidate scoring |
| Capture Stitcher | `capture/captureStitcher.ts` | 101 | Viewport slice stitching on canvas |
| Element Capture | `capture/elementCapture.ts` | 281 | Element isolation, eager images, forced visibility |
| Fixed Headers | `capture/fixedHeaders.ts` | 87 | Detect/hide sticky headers during capture |
| Slice Math | `capture/sliceMath.ts` | 45 | Pure math for slice planning (shared with SW) |
| Match Engine | `matching/matchEngine.ts` | 66 | "Delete Similar" — structural similarity |
| Keyboard | `keyboard/shortcuts.ts` | 106 | Shift+Alt+F/P, Escape, Delete |
| Overlay | `overlay/overlay.ts` | 167 | Shadow DOM iframe container |
| Free Select | `selection/freeSelect.ts` | 379 | Draw rectangle → crop capture |

### Toolbar UI

React 18 application rendered inside a Shadow DOM iframe. Communicates via:

- **Outbound:** `chrome.runtime.sendMessage()` → Service Worker
- **Inbound:** `postMessage` from content runtime (state broadcasts, progress updates)

---

## Data Flow

### 1. Session Start

```
User clicks icon → service-worker.ts:handleCommand("START_SESSION")
  → ensureContentScriptInjected() → chrome.scripting.executeScript
  → content/index.ts:createSession()
  → broadcastState() → postMessage → App.tsx:setState()
```

### 2. Freeze

```
User clicks logo → App.tsx → chrome.runtime.sendMessage("FREEZE_PAGE")
  → service-worker → chrome.tabs.sendMessage("FREEZE_PAGE")
  → content/freezeEngine.ts → window.stop() + CSS + MutationObserver
  → broadcastState() → toolbar updates
```

### 3. Element Cleanup

```
User clicks Pick → inspector.ts starts hover overlay
  → User clicks element → elementReferenceOf() → serialize to ElementReference
  → User clicks Delete → mutationEngine.execute(Command)
  → DOM removal → history.push() → broadcastState()
```

### 4. Capture

```
User clicks Capture → "CAPTURE" command
  → service-worker: captureFullPage() or captureElement() or captureRegion()
  → chrome.tabs.captureVisibleTab() (repeated for full page)
  → data URLs staged in chrome.storage.local
  → content: stitcher.ts assembles on canvas
  → data URL → blob → downloadPng() → chrome.downloads.download()
```

---

## Shared Module

`src/shared/` contains code shared between Service Worker and Content Runtime:

| Module | Used By |
|--------|---------|
| `types/*` | All contexts |
| `constants.ts` | Freeze engine, history, capture |
| `utils/id.ts` | Session, inspector, mutation, extraction |
| `utils/filename.ts` | Service worker (download naming) |
| `utils/selector.ts` | Tests only (inspector has its own) |

---

## Build Pipeline

```
src/ (TypeScript)
  ├── esbuild → dist/content/index.js (90 KB)
  ├── esbuild → dist/background/service-worker.js (24 KB)
  ├── Vite → dist/ui/index.html + options.html + assets/
  ├── sharp → dist/icons/icon{16,32,48,128}.png
  └── build-manifest.mjs → dist/manifest.json
```

---

## State Machine

Session lifecycle follows defined transitions:

```
CREATED → FROZEN → UNFROZEN → FROZEN → ...
    ↓        ↓
  CLOSED  DEGRADED (MutationObserver failed)
```

Valid transitions are enforced by `SESSION_TRANSITIONS` in `src/shared/types/session.ts`.

---

## Key Design Decisions

1. **Element references are serializable** — DOM nodes are never stored; only `ElementReference` objects (id + selector + tagName + className + path). This enables clean undo/redo without holding DOM references.

2. **Single mutation point** — All DOM changes go through `MutationEngine`. This guarantees undo/redo consistency and enables action logging.

3. **Shadow DOM isolation** — Toolbar lives in Shadow DOM, immune to page CSS injection and protected from accidental selection during capture.

4. **Canvas white fill** — Stitcher canvas is filled with `#ffffff` after resize to prevent transparent gaps between slices.

5. **Cross-context shared code** — `sliceMath.ts` is imported by both service worker and content script via esbuild path aliases, avoiding code duplication.
