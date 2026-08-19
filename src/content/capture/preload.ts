/**
 * Full-page preload helpers — make sure the whole page's media is actually
 * painted before capture so the stitched image has no white gaps.
 *
 * Browsers only fetch lazy images (`loading="lazy"`, `data-src`, etc.) near the
 * current viewport. Full-page capture scrolls the page itself, but if the
 * browser never had a chance to fetch the far-from-viewport images they render
 * as blank placeholders in the screenshot. These helpers (a) promote lazy
 * images to eager, (b) force-decode every pending image, and (c) pre-roll the
 * page once bottom-to-top so the browser schedules the fetches.
 */
import { sleep } from "./elementCapture";

/** Highest-per-<source> candidate in a srcset: the first URL is the largest. */
function firstSrcsetUrl(srcset: string): string | undefined {
  return srcset.split(",")[0]?.trim().split(/\s+/)[0];
}

/**
 * Promotes lazy-loaded images so the browser fetches them immediately:
 * - `loading="lazy"` → `loading="eager"`
 * - `data-src` / `data-srcset` placeholders get their real URL assigned
 * - `<picture>` `<source>` candidates are resolved onto the sibling `<img>`
 */
export function forceEagerImages(root: ParentNode = document): void {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  for (const img of imgs) {
    img.setAttribute("loading", "eager");
    if (img.dataset.src && !img.src) img.src = img.dataset.src;
    if (img.dataset.srcset && !img.srcset) img.srcset = img.dataset.srcset;
  }
  const sources = root.querySelectorAll<HTMLSourceElement>("picture > source");
  for (const source of sources) {
    const srcset = source.getAttribute("srcset");
    if (!srcset) continue;
    const firstUrl = firstSrcsetUrl(srcset);
    const img = source.parentElement?.querySelector<HTMLImageElement>("img");
    if (firstUrl && img && !img.src) img.src = firstUrl;
  }
}

/**
 * Waits (bounded) until every image under the root has actually painted.
 * `img.decode()` forces the fetch+decode regardless of the page's loading or
 * content-visibility hints; pending images are re-kicked until complete or the
 * deadline passes. Fonts get a short best-effort wait afterwards.
 */
export async function waitForImagesReady(root: ParentNode = document, timeoutMs = 4000): Promise<void> {
  const imgs = () => Array.from(root.querySelectorAll<HTMLImageElement>("img")).filter((img) => !img.complete);
  const kick = (images: HTMLImageElement[]) => {
    for (const img of images) {
      try {
        img.decode().catch(() => undefined);
      } catch {
        // Image is not decodable yet (no src, or not connected) — skip it.
      }
    }
  };

  kick(imgs());
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && imgs().length > 0) {
    await sleep(120);
    kick(imgs());
  }

  try {
    await Promise.race([document.fonts.ready, sleep(1000)]);
  } catch {
    // Font loading is best effort.
  }
}

/** Cap on pre-roll steps so very long pages (or infinite feeds) stay bounded. */
const MAX_PREROLL_STEPS = 60;

/**
 * Scrolls the page once from the bottom to the top so the browser schedules
 * fetches for lazy images near every position. Restores the original scroll
 * position when done. Best effort — a page that re-renders or grows during the
 * roll is capped and ignored rather than allowed to grow unbounded.
 */
export async function preRollForCapture(originalScrollY = window.scrollY): Promise<void> {
  const scroller = document.scrollingElement ?? document.documentElement;
  const maxScroll = Math.max(0, scroller.scrollHeight - window.innerHeight);
  const step = Math.max(1, Math.round(window.innerHeight));
  const steps = Math.min(Math.ceil(maxScroll / step), MAX_PREROLL_STEPS);

  for (let i = steps - 1; i >= 0; i--) {
    const y = i * step;
    scroller.scrollTop = y;
    window.scrollTo(0, y);
  }
  scroller.scrollTop = 0;
  window.scrollTo(0, 0);
  // Give the browser a frame to schedule the fetches before restoring.
  await sleep(120);
  scroller.scrollTop = originalScrollY;
  window.scrollTo(0, originalScrollY);
}