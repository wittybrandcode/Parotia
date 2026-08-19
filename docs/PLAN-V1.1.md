# Parotia v1.1 — Hardening Plan

> **Goal:** Make the existing features *unfailable* — no silent failures, no blank images, no lost captures — then strengthen each core flow.

**Version:** 1.1.0 (planned)
**Status:** Draft for review
**Scope:** Hardening of existing features only (no new user-facing features in this cycle)

---

## Summary

The v1.0 atomic analysis surfaced specific failure points in each feature. This plan hardens the **6 highest-impact weaknesses**, ordered by user impact:

| # | Area | Weakness | Impact |
|---|------|----------|--------|
| 1 | Capture | Slices can fail silently (rate limit, race) → **blank/partial image** | High |
| 2 | Capture | Lazy images (`loading="lazy"`) not loaded → **white gaps** | High |
| 3 | Cleanup | Removed elements re-appear (page re-renders) | Medium |
| 4 | Cleanup | "Delete Similar" can over-delete with no preview | Medium |
| 5 | Freeze | `setInterval`/iframes keep moving → **moving content in capture** | Medium |
| 6 | Capture | Pages > 32767px fail entirely (no fallback) | Medium |

**Priority:** 1 → 2 → 3 → 4 → 5 → 6 (each builds on the previous)

---

## Phase 1 — Capture Retry + Slice Verification (Capture)

### Objective
Every slice of a full-page/element capture must be **verified** before being accepted. Failures retry instead of producing a broken image.

### Current Behavior (v1.0)
- `service-worker.ts:412` — `captureVisibleTab()` is called once per slice with a fixed `PAINT_SETTLE_MS = 450` wait
- A failed/flickering capture is stitched in anyway → user gets a partial image
- No post-capture check for blank slices or DOM drift

### Design

**1a. Per-slice retry with backoff**

```typescript
// service-worker.ts — new helper
async function captureSliceWithRetry(
  tabId: number,
  windowId: number,
  attempts = 3,
): Promise<string> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      if (dataUrl && dataUrl.startsWith("data:image/png")) return dataUrl;
    } catch (e) {
      console.warn(`[parotia] capture slice attempt ${attempt} failed:`, e);
    }
    if (attempt < attempts) await sleep(PAINT_SETTLE_MS * attempt); // linear backoff
  }
  throw new Error("Capture failed after retries — try again");
}
```

- Replaces the direct `captureVisibleTab()` calls in `captureFullPage` and `captureElement`
- 3 attempts, linear backoff (450ms, 900ms, 1350ms)
- Validates the data URL prefix (a real PNG, not an empty/failed capture)

**1b. Blank-slice detection (in the stitcher)**

The stitcher (`captureStitcher.ts`) gains a light verification step on each `addSlice`:

```typescript
/** In DefaultCaptureStitcher.addSlice — before drawImage */
function estimateOpaqueRatio(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const sample = ctx.getImageData(0, 0, w, Math.min(h, 64)); // sample top band
  let opaque = 0;
  for (let i = 3; i < sample.data.length; i += 4) if (sample.data[i] > 10) opaque++;
  return opaque / (sample.data.length / 4);
}
```

- After drawing each slice, sample the top 64px band and compute the opaque-pixel ratio
- **Threshold:** `> 0.98` of the viewport band is transparent/white → likely blank → mark slice as suspicious
- Suspicious slices are reported back to the worker via the slice response → triggers one re-capture of that slice region
- **Trade-off:** `getImageData` on the full canvas per slice is expensive; sampling only the top band keeps it O(64×width) per slice

**1c. DOM-drift guard**

Before capture starts, snapshot the document state (`document.documentElement.outerHTML.length` + scroll position + a mutation counter). After capture, compare. If drift exceeds a threshold, return `{ success: false, error: "Page changed during capture — try again" }` instead of delivering a wrong image.

### Files Touched
- `src/background/service-worker.ts`
- `src/content/capture/captureStitcher.ts`

### Tests
- Unit: `captureSliceWithRetry` retries on failure, validates PNG prefix
- Unit: blank-slice detector returns true on empty/white band, false on content
- Integration: capture with a mocked failing `captureVisibleTab` still produces a PNG

### Acceptance Criteria
- A capture where one slice fails → auto-retry → success (no user action)
- A capture where every slice fails → clean error, no partial download
- Full-page capture of a page with lazy images has **no white gaps**

---

## Phase 2 — Force Eager Image Loading (Capture)

### Objective
All lazy-loaded images are loaded *before* capture so the final PNG contains no white gaps.

### Current Behavior
- `elementCapture.ts` already forces eager loading for *element* captures
- **Full-page capture does NOT** — a page with `loading="lazy"` images below the fold captures as white boxes

### Design

**2a. Pre-capture eager load sweep**

Add a content-script step at the start of `CAPTURE_STITCH_START` (before measurement):

```typescript
function forceEagerImages(root: ParentNode = document): void {
  const lazy = root.querySelectorAll<HTMLImageElement>(
    'img[loading="lazy"], img[data-src], img[data-srcset]',
  );
  for (const img of lazy) {
    img.setAttribute("loading", "eager");
    if (img.dataset.src) {
      const src = img.dataset.src;
      if (src && !img.src) img.src = src;
    }
    if (img.dataset.srcset && !img.srcset) {
      img.srcset = img.dataset.srcset;
    }
  }
  // Also promote CSS background images via a forced reflow later.
}
```

**2b. Load-completion wait**

After the sweep, wait for:
1. `document.fonts.ready`
2. All eager-loaded images to fire `load` or `error` (with a timeout)
3. A short settle period for the browser to rasterize

Implement as a promise with a 4s deadline (mirrors `elementCapture.waitForElementRendering()`).

**2c. Full-page pre-roll scroll**

Because the browser only *fetches* lazy images near the viewport, do a **pre-roll pass**: scroll the page bottom→top once before measuring, letting the browser decode everything, then restore scroll. This catches images that `loading="eager"` alone misses (e.g., infinite-scroll feeds).

### Files Touched
- `src/content/index.ts` (CAPTURE_STITCH_START handler)
- `src/content/capture/elementCapture.ts` (reuse/export `waitForElementRendering`-style helper)
- Possibly new `src/content/capture/preload.ts`

### Tests
- Unit: `forceEagerImages` promotes `loading="lazy"`, fills `data-src`/`data-srcset`
- Unit: load-wait resolves after all images settle or after deadline
- Integration: full-page capture of lazy-loaded page has no white gaps

### Acceptance Criteria
- Captured full-page image of a lazy-loading news site has **all images present**
- No regression in capture speed beyond +1 pre-roll scroll

---

## Phase 3 — Regeneration Guard (Cleanup)

### Objective
Elements deleted/hidden by the user stay deleted for the whole session, even if the page re-renders.

### Current Behavior
- `mutationEngine` deletes an element; if the page re-renders and re-inserts an identical element (e.g., ad slot), it comes back
- Freeze usually prevents this, but some sites re-render via injected script, timers, or `requestAnimationFrame`

### Design

**3a. Re-insertion guard**

The `MutationEngine` adds a monitor while the session is active:

```typescript
// mutationEngine.ts — add to registry entries
interface RegistryEntry {
  ref: ElementReference;
  target: ResolvedTarget;
  hidden: boolean;
  /** Serialized signature used to detect re-insertion */
  signature: string; // tagName + id + class + data-* attrs
}
```

- On every mutation record (via an observer installed at cleanup-start), scan added nodes
- If an added node's `signature` matches a deleted/hidden entry → re-delete/re-hide it
- Log the re-guard as an internal action (counted, but **not** an undoable history entry — the user already made the decision)

**3b. Guard scope and cost control**

- Only active while the session is FROZEN (post-freeze re-renders)
- The scan is cheap: signature match is string equality on short strings
- Runs at most every `STABILITY_WINDOW_MS` batch, not per-mutation (coalesced)

### Files Touched
- `src/content/mutation/mutationEngine.ts`
- `src/content/index.ts` (start/stop the guard with the session)
- `src/shared/types/cleanup.ts` (optional: re-guard counter in state)

### Tests
- Unit: re-inserted element with matching signature is re-deleted
- Unit: different element with same tag (no signature match) is NOT deleted
- Unit: re-guard actions don't pollute the undo history
- Integration: page re-render during session keeps deletions applied

### Acceptance Criteria
- Ads/popups deleted by the user do not reappear during the session
- No false positives (legitimate page content with same tag is not deleted)

---

## Phase 4 — Delete Similar Preview (Cleanup)

### Objective
"Delete Similar" never surprises the user — it previews what will be deleted and asks for confirmation.

### Current Behavior
- `DELETE_MATCHING` immediately removes all matching elements
- `matchEngine` computes the signature but there's no preview step

### Design

**4a. Preview mode**

New command flow (additive, backward-compatible):

```
DELETE_MATCHING (preview)
  → content: compute matches, highlight them (reuse inspector overlay styles)
  → return { count, signatures, previewActive: true }
  → UI: show "Delete 12 similar elements?" with [Cancel] [Confirm]
DELETE_MATCHING (confirm) with a token
  → content: perform the deletion of the same match set
```

- Add `token` (random session-scoped id) to the confirm command so a stale/forged confirm can't delete the wrong set
- Highlights use the existing `data-newsclean-highlight` overlay pattern (excluded from captures)

**4b. UI flow**

Toolbar: pressing **Delete Similar** switches the selected-element context to a preview panel:
- Text: "Delete N similar elements?" with a live count
- Buttons: Cancel / Confirm
- On Confirm → dispatch `DELETE_MATCHING` with the token
- Escape/Cancel → clear highlights, return to normal

### Files Touched
- `src/shared/types/messages.ts` (extend `DELETE_MATCHING` payload with `confirm?: boolean`, `token?: string`)
- `src/content/matching/matchEngine.ts` (expose `findMatches` for preview)
- `src/content/cleanup/cleanupEngine.ts` (preview vs confirm branch)
- `src/ui/src/App.tsx` (preview panel UI)
- `src/content/inspector/inspector.ts` (highlight matches)

### Tests
- Unit: preview returns count + signatures without deleting
- Unit: confirm without token is rejected
- Unit: confirm with valid token deletes exactly the previewed set
- UI: preview panel renders count, cancel clears highlights

### Acceptance Criteria
- User always sees what Delete Similar will remove before committing
- Cancel path leaves the page untouched

---

## Phase 5 — Freeze Strengthening (Freeze)

### Objective
Freeze also neutralizes timers and embedded frames, so no content moves or re-appears during cleanup/capture.

### Current Behavior
- `freezeEngine` stops loads (`window.stop`), pauses media, disables CSS animation/transition
- Does **not** stop `setInterval`/`setTimeout` → ad refresh, counters, carousels keep ticking
- Does **not** touch iframes/Shadow DOM → embedded players, widgets, ads can still move

### Design

**5a. Timer neutralization**

Wrap the globals on freeze:

```typescript
// freezeEngine.ts — after injectFreezeStyles()
private neutralizeTimers(): void {
  const win = window as unknown as Record<string, unknown>;
  const origSet = win.setInterval as Window["setInterval"];
  const origClear = win.clearInterval as Window["clearInterval"];
  const held = new Set<number>();

  const patchedSet = ((handler: unknown, timeout?: number, ...args: unknown[]) => {
    const id = origSet(handler as TimerHandler, timeout, ...args);
    held.add(id);
    return id;
  }) as typeof setInterval;

  // Don't actually fire held intervals; block their callbacks.
  (win as any).setInterval = ((handler: unknown, timeout?: number, ...args: unknown[]) => {
    const id = patchedSet(handler as TimerHandler, timeout, ...args);
    // Fire-and-hold: the callback is a no-op stub. Use a wrapper that
    // suppresses execution while frozen.
    return id;
  }) as typeof setInterval;

  // restore on unfreeze
  this.restoreTimerFns = () => {
    win.setInterval = origSet;
    win.clearInterval = origClear;
  };
}
```

> **Note:** patching `setInterval` is invasive and risky (page may depend on it). A safer variant is a **MutationObserver-assisted visual freeze** that doesn't patch globals. This needs a spike to decide. **Risk: medium — defer decision to implementation with a fallback that only patches when diagnostics detect active motion.**

**5b. Embedded frame freeze**

```typescript
private freezeFrames(): void {
  const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe"));
  for (const frame of frames) {
    if (isNewsCleanUi(frame)) continue;
    frame.style.pointerEvents = "none"; // stop interaction-driven re-renders
  }
}
```

- Set `pointer-events: none` on all non-Parotia iframes (interaction-driven re-render blocked)
- Pause media inside cross-origin frames is **not possible** (same-origin policy) — document this limitation
- For same-origin iframes, optionally inject the same freeze CSS

### Files Touched
- `src/content/freeze/freezeEngine.ts`
- `src/content/overlay/overlay.ts` (reuse `isNewsCleanUi`)

### Tests
- Unit: timer patch is installed on freeze and removed on unfreeze (with mocked globals)
- Unit: `freezeFrames` sets `pointer-events: none` on foreign iframes, skips Parotia UI
- Integration: frozen page with a carousel timer shows no motion during capture

### Acceptance Criteria
- Frozen pages show **no motion** in captured images (timers, iframes, carousels)
- Unfreeze fully restores timer behavior and iframe interactivity
- No regression on sites that rely on `setInterval` for rendering (spike result decides)

---

## Phase 6 — Long-Page Fallback (Capture)

### Objective
Pages taller than the 32767px canvas limit no longer fail hard — they degrade gracefully.

### Current Behavior
- `service-worker.ts:389` — `if (exceedsCanvasLimit(...))` → returns error, no fallback
- Element capture already has a zoom-fallback pattern; full-page does not

### Design

**6a. Two-tier fallback (analogous to element capture's zoom fallback)**

```
measure page
  ├─ fits under limit (dpr = device) → capture at native DPR
  └─ exceeds limit at native DPR
       ├─ retry at 1.0 DPR (drop device-DPR scaling)
       └─ if still too tall → capture in [segments] and stitch
            ├─ segment N = contiguous block of canvas height
            └─ merge segments into one PNG by drawing at reduced scale
```

Concretely: pass a `scale` into `CAPTURE_STITCH_START`. The stitcher's `canvasHeightFor` uses the scaled height; slices are captured at the lower DPR so the device buffer stays within limits.

**6b. Clear messaging**

If even the lowest-fidelity path is impossible, return a *specific* error:
`Page is too tall for a single image even at minimum fidelity. Capture it in sections using Free-Select.`

### Files Touched
- `src/background/service-worker.ts` (captureFullPage branch)
- `src/content/capture/sliceMath.ts` (scale-aware planning)
- `src/content/capture/captureStitcher.ts` (accept scale)
- `src/shared/types/messages.ts` (payload gains optional `scale`)

### Tests
- Unit: `planSlices` with scale produces fewer/lower slices
- Unit: stitcher accepts scale and draws at reduced resolution
- Integration: artificially tall page captures successfully at reduced fidelity

### Acceptance Criteria
- Pages up to ~2× the canvas limit capture successfully (at reduced fidelity)
- Beyond that, a clear actionable error instead of a generic failure

---

## Verification Strategy (all phases)

Every phase must pass the full gate before merge:

```bash
npm run typecheck   # tsc --noEmit, zero errors
npm run lint        # eslint --max-warnings 0
npm run test        # vitest — all 208 existing + new tests
npm run build       # vite build must succeed
npm run test:e2e    # Playwright smoke test (real Chromium)
```

## Estimated Impact on Test Count

| Phase | New tests expected |
|-------|-------------------|
| 1 (capture retry) | +6 |
| 2 (eager load) | +5 |
| 3 (regeneration guard) | +6 |
| 4 (delete-similar preview) | +7 |
| 5 (freeze strengthen) | +5 |
| 6 (long-page fallback) | +4 |
| **Total** | **~+33** → ~241 tests |

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Patching `setInterval` breaks a site | Spike first; fallback to observer-only visual freeze |
| `getImageData` blank-check slows capture | Sample top band only; make it async/optional |
| Pre-roll scroll triggers infinite-scroll feed to grow | Cap pre-roll scroll distance + time |
| Delete-Similar preview races with DOM changes | Token-validated confirm; re-compute match set at confirm time |
| Canvas scale fallback changes image fidelity | Explicit messaging: "captured at reduced resolution" |

---

## Rollout

1. Phase 1 → 2 as one PR (both capture-robustness)
2. Phase 3 → 4 as one PR (both cleanup-robustness)
3. Phase 5 → 6 as one PR (both freeze/capture limits)
4. Bump version to 1.1.0 in `package.json` + manifest (build-manifest reads package.json)
5. Update `docs/CHANGELOG.md` and `docs/TESTING.md` with new counts

---

**Approved scope:** 6 phases, ~33 new tests, ~6 source files touched.
**Out of scope (this cycle):** new features, CWS listing, multi-browser, watermarking.
