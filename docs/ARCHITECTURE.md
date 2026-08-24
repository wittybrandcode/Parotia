# Architecture

Parotia is a Manifest V3 capture extension with four isolated execution contexts. Page DOM is owned only by the content runtime; privileged browser APIs stay in the service worker.

## Contexts and ownership

```text
Toolbar iframe (React)
  -> chrome.runtime messages
Service worker
  -> validates session/tab ownership
  -> coordinates captureVisibleTab, conditional full-page zoom fallback, temporary storage and download
  -> chrome.tabs messages
Content runtime
  -> owns DOM, selection, cleanup, freeze and canvas stitching
  -> targeted postMessage
Toolbar iframe

Service worker -> one-time editor ticket -> Editor page (React + Konva)
```

| Context | Primary modules | Durable state |
|---|---|---|
| Service worker | `service-worker.ts` router, `captureCoordinator.ts`, `captureModes/*`, `captureSupport.ts`, `sessionRegistry.ts`, `editorGateway.ts`, `editorTickets.ts`, `temporaryStorage.ts`, `downloadService.ts` | tab/session ownership in `chrome.storage.session` |
| Content runtime | `content/index.ts`, `handlers/*`, engines under `content/*` | current page session and reversible DOM transactions |
| Toolbar | `ui/src/App.tsx` | rendered snapshot only |
| Editor | `ui/src/editor/*` | bounded unified visible-image history |

## Core invariants

1. A session belongs to exactly one live tab. There is no active-tab recovery fallback.
2. Every temporary DOM/style/attribute mutation records exact presence, value and CSS priority and has an idempotent restore path.
3. Slice coordinates, not arrival order, determine pixel placement. Finalization fails if painted intervals contain a gap.
4. Every render wait has a hard deadline. Continuous page mutation degrades or reports diagnostics; it cannot hold a Promise forever.
5. The worker returns one `MessageResponse<T>` envelope and unwraps the content response at the routing boundary.
6. Editor tickets are short-lived, tab-bound and consumed before a privileged download.
7. A fully visible element is a read-only, single-frame pixel crop: no page zoom, scroll, DOM isolation, forced media attributes or site-style overrides. Its finished crop is then enlarged independently to a high-quality 2× PNG within bounded canvas/memory limits.

## Capture flow

```text
CAPTURE(mode)
  -> verify session owner and serialize capture per tab
  -> content prepare transaction (toolbar; media/fixed headers only where the mode requires them)
  -> captureVisibleTab one or more times
  -> content crops or stitches by actual scroll coordinates
  -> stage PNG under capture:<session>
  -> worker removes staging key
  -> issue editor-image/editor-ticket capability
  -> editor consumes source image and later consumes/discards ticket
  -> finally restore any mode-owned scroll, zoom, toolbar, styles and media attributes
```

For a fully visible picked element, Parotia measures its current viewport rectangle, captures one native frame and crops those pixels directly. It never changes zoom or site DOM on this path, so responsive layout and virtualized-feed state remain intact. The final element crop is enlarged in the same render pass with high-quality browser resampling and lossless PNG encoding. Normal captures receive exactly 2× dimensions; unusually large captures use the highest safe scale bounded by Chromium's canvas dimension and a 64M-pixel output budget, with native-size fallback if a driver rejects the enhanced surface. Only elements extending outside the viewport fall back to `DefaultCaptureStitcher` before receiving the same safe export treatment. Full-page and fallback element stitching map `(actualScrollY - baseScrollCss) * dpr`, crop negative/overlapping source rows, merge painted intervals and reject incomplete coverage. Region and bitmap crops clamp all coordinates to the decoded bitmap.

## Reversible page changes

`DomPatchLedger` is the primitive for capture-time styles and attributes. Cleanup operations retain their original `display` value and priority. Fixed headers and iframe freeze locks retain their original inline CSS. Region/full-page preparation is owned by `CapturePreparationTransactions`, so repeated prepare/restore calls are safe.

## Media readiness

The readiness layer covers normal DOM and open Shadow DOM images, browser-selected `picture/srcset`, video posters, SVG images and CSS backgrounds. Canvas and current video frames are composited after a bounded paint window. Closed shadow roots and inaccessible iframe DOM cannot be inspected, although already-painted pixels remain part of `captureVisibleTab`.

## Session and message boundaries

`SessionRegistry` persists `{tabId, sessionId, createdAt}` in `chrome.storage.session`, validates that stored tabs still exist during hydration, and removes ownership on navigation or tab close. `validateBackgroundCommandShape()` is the shared structural validator used before side effects in both privileged boundaries; content additionally verifies that the session ID equals the page-owned session.

## Editor model

Annotations, crop and adjust commit PNG snapshots into one bounded `EditorHistory`. Undo/redo therefore follows the visible operation order. Crop, adjust, copy, share, save and close run through one exclusive operation boundary; Save moves the UI to a terminal `Saved` state and Close waits briefly for ticket discard.

Before staging an editor ticket, `assessEditorImage()` reads only the PNG IHDR and estimates the peak decoded working set: five RGBA surfaces plus encoded-string overhead. The current single-canvas editor accepts at most `16384px` per dimension, `32 Mi` pixels and a memory budget derived from the browser's coarse `deviceMemory` value, clamped to `256–512 MiB` (`384 MiB` when unavailable). A capture outside any limit bypasses ticket/image staging and downloads the unchanged PNG with a visible reason. The editor repeats the same check before its first Canvas allocation as defense in depth. Proxy/tiled editing remains a separate vNext renderer milestone; no resolution reduction is performed silently.

## Compatibility names

`data-newsclean-*`, `__newsclean__` and the deprecated `NewsCleanSession`/`isNewsCleanUi` aliases are retained for the 1.x compatibility window. New code uses `ParotiaSession`, `isParotiaUi` and `parotia-*` wire sources while receivers accept the old source names. Removing the legacy selectors requires a separately versioned migration.

## Build outputs

The lifecycle/router file is kept near 250 lines; capture modes are independent modules and share only bounded support helpers. `esbuild` emits content/background bundles, Vite emits toolbar/options/editor pages, Sharp generates icons, and `build-manifest.mjs` writes the single versioned MV3 manifest into `dist/`.
