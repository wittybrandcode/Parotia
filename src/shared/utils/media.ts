import { sleep } from "./imageCodec";
import { DomPatchLedger } from "./domPatchLedger";

/**
 * Promotes lazy-loaded images so the browser fetches them immediately:
 * - `loading="lazy"` → `loading="eager"`
 * - `data-src` / `data-srcset` placeholders get their real URL assigned
 * - `<picture>` `<source>` candidates are resolved onto the sibling `<img>`
 */
export function forceEagerImages(
  root: ParentNode = document,
  ledger = new DomPatchLedger(),
): DomPatchLedger {
  const imgs = collectImages(root);
  for (const img of imgs) {
    ledger.setAttribute(img, "loading", "eager");
    if (img.dataset.src && !img.getAttribute("src")) ledger.setAttribute(img, "src", img.dataset.src);
    if (img.dataset.srcset && !img.getAttribute("srcset")) ledger.setAttribute(img, "srcset", img.dataset.srcset);
  }
  // Do not copy an arbitrary <source> candidate to img.src. The order of
  // srcset candidates is not a quality contract; the browser's currentSrc is
  // the authoritative responsive choice.
  return ledger;
}

/**
 * Kicks `img.decode()` on each image to force the browser to fetch and decode
 * regardless of loading/content-visibility hints.
 */
export function kickImages(images: HTMLImageElement[]): void {
  for (const img of images) {
    void img.decode().catch(() => undefined);
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
export async function waitForImagesReady(root: ParentNode = document, timeoutMs = 4000): Promise<number> {
  const imgs = () => collectImages(root).filter((img) => !img.complete || img.naturalWidth === 0);

  kickImages(imgs());
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && imgs().length > 0) {
    await sleep(120);
    kickImages(imgs());
  }

  await waitForFonts(Math.max(0, deadline - Date.now()));
  return imgs().length;
}

/** Traverses normal DOM plus open shadow roots without crossing iframe origins. */
export function collectImages(root: ParentNode = document): HTMLImageElement[] {
  const result: HTMLImageElement[] = [];
  const visit = (node: ParentNode): void => {
    if (node instanceof HTMLImageElement) result.push(node);
    if (node instanceof Element && node.shadowRoot) visit(node.shadowRoot);
    result.push(...Array.from(node.querySelectorAll<HTMLImageElement>("img")));
    const elements = node.querySelectorAll<HTMLElement>("*");
    for (const element of elements) {
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(root);
  return [...new Set(result)];
}

function visualAssetUrls(root: ParentNode): string[] {
  const urls = new Set<string>();
  const addCss = (value: string | null | undefined): void => {
    if (!value) return;
    for (const match of value.matchAll(/url\((?:["']?)(.*?)(?:["']?)\)/g)) {
      const url = match[1]?.trim();
      if (url && !url.startsWith("data:")) urls.add(url);
    }
  };
  const addDirect = (value: string | null | undefined): void => {
    const url = value?.trim();
    if (url && !url.startsWith("data:")) urls.add(url);
  };
  const scan = (node: ParentNode): void => {
    if (node instanceof HTMLElement) {
      try { addCss(getComputedStyle(node).backgroundImage); } catch { /* best effort */ }
      if (node.shadowRoot) scan(node.shadowRoot);
    }
    for (const video of node.querySelectorAll<HTMLVideoElement>("video[poster]")) {
      addDirect(video.poster || video.getAttribute("poster"));
    }
    for (const image of node.querySelectorAll<SVGImageElement>("svg image")) {
      addDirect(image.getAttribute("href") ?? image.getAttribute("xlink:href"));
    }
    for (const element of node.querySelectorAll<HTMLElement>("*")) {
      try {
        addCss(getComputedStyle(element).backgroundImage);
      } catch {
        // Detached or browser-owned elements are best effort.
      }
      if (element.shadowRoot) scan(element.shadowRoot);
    }
  };
  scan(root);
  return [...urls];
}

function preloadUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = () => resolve(url);
    image.src = url;
  });
}

export interface VisualReadinessResult {
  timedOut: boolean;
  pendingImages: number;
  pendingExternalAssets: string[];
}

/**
 * Waits for every visual asset type that can be observed from the isolated
 * content world. Canvas/video frames need no network mutation; two paint frames
 * below ensure their current pixels are composited.
 */
export async function waitForVisualAssets(root: ParentNode = document, timeoutMs = 4000): Promise<VisualReadinessResult> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const imageWait = waitForImagesReady(root, Math.max(0, deadline - Date.now()));
  const assetUrls = visualAssetUrls(root);
  const completedAssets = new Set<string>();
  const externalAssets = Promise.all(assetUrls.map(async (url) => {
    completedAssets.add(await preloadUrl(url));
  }));
  await Promise.race([
    Promise.all([imageWait, externalAssets]),
    sleep(Math.max(0, deadline - Date.now())),
  ]);
  await waitForFonts(Math.min(1000, Math.max(0, deadline - Date.now())));
  const remaining = Math.max(0, deadline - Date.now());
  if (remaining > 0) {
    await Promise.race([
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      sleep(Math.min(100, remaining)),
    ]);
  }
  const pendingImages = collectImages(root).filter((img) => !img.complete || img.naturalWidth === 0).length;
  const pendingExternalAssets = assetUrls.filter((url) => !completedAssets.has(url));
  return {
    timedOut: Date.now() >= deadline && (pendingImages > 0 || pendingExternalAssets.length > 0),
    pendingImages,
    pendingExternalAssets,
  };
}
