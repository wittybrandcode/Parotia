import { sleep } from "./imageCodec";

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
 * Kicks `img.decode()` on each image to force the browser to fetch and decode
 * regardless of loading/content-visibility hints.
 */
export function kickImages(images: HTMLImageElement[]): void {
  for (const img of images) {
    try {
      img.decode().catch(() => undefined);
    } catch {
      // Image is not decodable yet (no src, or not connected) — skip it.
    }
  }
}

/**
 * Waits for document.fonts.ready with a best-effort timeout so font loading
 * never blocks capture indefinitely.
 */
export async function waitForFonts(timeoutMs = 1000): Promise<void> {
  try {
    await Promise.race([document.fonts.ready, sleep(timeoutMs)]);
  } catch {
    // Font loading is best effort.
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

  kickImages(imgs());
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && imgs().length > 0) {
    await sleep(120);
    kickImages(imgs());
  }

  await waitForFonts();
}
