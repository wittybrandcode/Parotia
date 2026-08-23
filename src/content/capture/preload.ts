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
import { sleep } from "@shared/utils/imageCodec";
import { forceEagerImages, waitForImagesReady, waitForVisualAssets } from "@shared/utils/media";

export { forceEagerImages, waitForImagesReady, waitForVisualAssets };

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
