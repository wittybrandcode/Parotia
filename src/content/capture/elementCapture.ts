/**
 * Element Capture — isolates a picked element so the Service Worker's viewport
 * capture sees only it. Isolation is purely visual and fully reversible: a
 * scoped <style> hides every body child except the marked element (re-shown
 * with `visibility: visible`), the marker is set on both <html> and the element
 * itself so the scoped rules actually match, and `restore()` puts the page back
 * exactly as it was.
 *
 * The captured result is assembled by scrolling the element through the
 * viewport and stitching the slices (see captureStitcher.ts), so elements that
 * are taller than the viewport are captured in full instead of being cut off.
 */

export interface CaptureRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ElementCaptureMetrics {
  dpr: number;
  rect: CaptureRect;
  /** Document-relative top of the element (used as the stitch base offset). */
  elementDocTop: number;
  /** Element height in CSS px after lazy images have loaded. */
  elementHeightCss: number;
  viewportHeightCss: number;
}

export const CAPTURE_ATTR = "data-newsclean-capture";
export const CAPTURE_STYLE_ATTR = "data-newsclean-capture-style";

const ELEMENT_CAPTURE_CSS = `
  html[data-newsclean-capture="true"] body > * {
    visibility: hidden !important;
  }
  html[data-newsclean-capture="true"] [data-newsclean-root] {
    visibility: hidden !important;
  }
  /* Force full rendering and visibility on the target AND all descendants.
     X/Twitter wraps profile avatars and media in containers with opacity:0
     (or visibility:hidden) until their lazy images load. The parent rule
     would leave those wrappers hidden; this ensures everything inside the
     captured element is painted — including avatars that haven't finished
     their fade-in animation. Also overrides content-visibility:auto so
     off-fold descendants are not skipped by the browser. */
  html[data-newsclean-capture="true"] [data-newsclean-capture],
  html[data-newsclean-capture="true"] [data-newsclean-capture] * {
    visibility: visible !important;
    opacity: 1 !important;
    content-visibility: visible !important;
    outline: none !important;
    box-shadow: none !important;
  }
  /* The picker's own overlays live on <html>, not <body>, so the body rule
     above does not reach them. Hide them or they would be painted into the
     captured image (extra border, tint, and action bar). */
  html[data-newsclean-capture="true"] [data-newsclean-highlight],
  html[data-newsclean-capture="true"] .nc-action-bar {
    display: none !important;
  }
`;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Loads a data-URL image as a bitmap for cropping. */
export async function loadBitmap(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

/** Crops a data-URL image to a device-pixel region and re-encodes it as a PNG. */
export async function cropDataUrlToPng(
  dataUrl: string,
  region: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const bitmap = await loadBitmap(dataUrl);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.min(region.width, bitmap.width - region.x));
    canvas.height = Math.max(1, Math.min(region.height, bitmap.height - region.y));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, region.x, region.y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to encode element PNG"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Failed to read element PNG"));
        reader.readAsDataURL(blob);
      }, "image/png");
    });
  } finally {
    bitmap.close();
  }
}

export class ElementCaptureIsolator {
  private styleElement: HTMLStyleElement | null = null;
  private target: HTMLElement | null = null;
  private scrollY = 0;
  private loadingAttrs: Map<HTMLImageElement, string | null> | null = null;
  private forcedOpacity: Map<HTMLElement, string> | null = null;
  private forcedVisibility: Map<HTMLElement, string> | null = null;

  /** Scrolls the element into view, hides the rest, and reports its metrics. */
  isolate(target: HTMLElement): ElementCaptureMetrics {
    if (this.styleElement) this.restore();
    this.scrollY = window.scrollY;
    try {
      target.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    } catch {
      // Best effort; some environments do not implement scrollIntoView.
    }
    this.target = target;
    // The marker must live on <html> too — every isolation rule is scoped to
    // html[data-newsclean-capture="true"], so without it nothing is hidden.
    document.documentElement.setAttribute(CAPTURE_ATTR, "true");
    target.setAttribute(CAPTURE_ATTR, "true");

    const style = document.createElement("style");
    style.setAttribute(CAPTURE_STYLE_ATTR, "true");
    style.textContent = ELEMENT_CAPTURE_CSS;
    (document.head ?? document.documentElement).appendChild(style);
    this.styleElement = style;

    // Force every image inside the element to load eagerly so profile avatars
    // and media are painted for real instead of staying lazy/blank.
    this.forceEagerImages(target);

    // Sites fade media in by setting opacity:0 on a WRAPPER (e.g. X avatars)
    // until the image loads. visibility:visible on the target cannot beat that,
    // so temporarily lift any fully-transparent ancestor on the way up.
    this.forceVisiblePath(target);

    // Force a synchronous reflow so the post-scroll position is measured.
    void document.documentElement.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const scrollY = window.scrollY;
    return {
      dpr: window.devicePixelRatio || 1,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      elementDocTop: scrollY + rect.top,
      elementHeightCss: rect.height,
      viewportHeightCss: window.innerHeight,
    };
  }

  /** Removes the isolation style and markers and restores the scroll position. */
  restore(): void {
    this.styleElement?.remove();
    this.styleElement = null;
    this.target?.removeAttribute(CAPTURE_ATTR);
    this.target = null;
    document.documentElement.removeAttribute(CAPTURE_ATTR);
    // Put every image's original loading mode back.
    if (this.loadingAttrs) {
      for (const [img, value] of this.loadingAttrs) {
        if (value === null) img.removeAttribute("loading");
        else img.setAttribute("loading", value);
      }
      this.loadingAttrs = null;
    }
    // Restore any lifted ancestor opacity.
    if (this.forcedOpacity) {
      for (const [el, opacity] of this.forcedOpacity) el.style.opacity = opacity;
      this.forcedOpacity = null;
    }
    // Restore any lifted ancestor visibility.
    if (this.forcedVisibility) {
      for (const [el, vis] of this.forcedVisibility) el.style.visibility = vis;
      this.forcedVisibility = null;
    }
    try {
      window.scrollTo(0, this.scrollY);
    } catch {
      // Best effort.
    }
  }

  private forceEagerImages(target: HTMLElement): void {
    this.loadingAttrs = new Map();
    const imgs = target instanceof HTMLImageElement ? [target] : Array.from(target.querySelectorAll("img"));
    for (const img of imgs) {
      const current = img.getAttribute("loading");
      if (current !== "eager") {
        this.loadingAttrs.set(img, current);
        img.setAttribute("loading", "eager");
      }
    }
    // <picture> <source> elements may use srcset with lazy loading — force them
    // to use the largest candidate so the browser fetches the real image.
    const sources = target.querySelectorAll("picture > source");
    for (const src of sources) {
      const srcset = src.getAttribute("srcset");
      if (srcset) {
        // Parse srcset to grab the first (largest) URL and use it as the direct
        // src on the sibling <img>, bypassing the browser's media-query selection.
        const firstUrl = srcset.split(",")[0]?.trim().split(/\s+/)[0];
        const img = src.parentElement?.querySelector("img");
        if (firstUrl && img && !img.src) {
          img.src = firstUrl;
        }
      }
    }
  }

  private forceVisiblePath(target: HTMLElement): void {
    this.forcedOpacity = new Map();
    this.forcedVisibility = new Map();
    let node: HTMLElement | null = target.parentElement;
    while (node && node !== document.documentElement && node !== document.body) {
      let opacity = 1;
      let visibility = "visible";
      try {
        const cs = getComputedStyle(node);
        opacity = parseFloat(cs.opacity) || 0;
        visibility = cs.visibility;
      } catch {
        // Best effort.
      }
      if (opacity === 0) {
        if (!this.forcedOpacity.has(node)) {
          this.forcedOpacity.set(node, node.style.opacity);
        }
        node.style.opacity = "1";
      }
      if (visibility === "hidden") {
        if (!this.forcedVisibility.has(node)) {
          this.forcedVisibility.set(node, node.style.visibility);
        }
        node.style.visibility = "visible";
      }
      node = node.parentElement;
    }
  }
}

/**
 * Waits (bounded) until every image inside the element has actually painted so
 * the capture shows real media (profile avatars, tweet photos) instead of empty
 * placeholders. Just listening for `load` is not enough: a lazy image that the
 * browser never started fetching fires no event. Each pending image is kicked
 * with `img.decode()` (which forces the fetch+decode regardless of the page's
 * loading/content-visibility hints) and re-checked until complete.
 */
export async function waitForElementRendering(element: HTMLElement, timeoutMs = 4000): Promise<void> {
  const imgs = () => {
    const all = element instanceof HTMLImageElement ? [element] : Array.from(element.querySelectorAll("img"));
    return all.filter((img) => !img.complete);
  };
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
