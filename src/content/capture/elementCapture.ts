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
  html[data-newsclean-capture="true"] [data-newsclean-capture] {
    visibility: visible !important;
    opacity: 1 !important;
    outline: none !important;
    box-shadow: none !important;
  }
  /* Sites like X/Twitter use content-visibility:auto on feed items, which lets
     the browser skip rendering everything that is off-fold — so slices below
     the fold (and lazy images like profile avatars) would come out blank.
     Force full rendering of the target and all of its descendants. */
  html[data-newsclean-capture="true"] [data-newsclean-capture],
  html[data-newsclean-capture="true"] [data-newsclean-capture] * {
    content-visibility: visible !important;
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
  private hiddenElements: HTMLElement[] = [];

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

    // Walk every element in the DOM and set visibility:hidden via inline
    // !important on everything except the target subtree.  Inline !important
    // has specificity (1,0,0,0) which beats ANY author stylesheet rule —
    // including X/Twitter's CSS-in-JS rules that set visibility:visible on
    // tweet components (which would otherwise override the inherited hidden
    // from body > *).  This is the only way to guarantee isolation on sites
    // that explicitly set visibility on nested elements.
    this.hideAllExceptTarget(target);

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
    // Restore inline visibility overrides set by hideAllExceptTarget.
    for (const el of this.hiddenElements) {
      el.style.removeProperty("visibility");
    }
    this.hiddenElements = [];
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
        // Inline !important beats any author !important stylesheet rule.
        node.style.setProperty("opacity", "1", "important");
      }
      if (visibility === "hidden") {
        if (!this.forcedVisibility.has(node)) {
          this.forcedVisibility.set(node, node.style.visibility);
        }
        node.style.setProperty("visibility", "visible", "important");
      }
      node = node.parentElement;
    }
  }

  /**
   * Walks every element in the DOM and sets `visibility: hidden` via inline
   * `!important` on everything except the target subtree.  Inline `!important`
   * has specificity (1,0,0,0) which beats any author stylesheet rule —
   * including X/Twitter's CSS-in-JS rules that set `visibility: visible`
   * on tweet components.  The CSS `body > *` rule relies on inheritance, but
   * inherited values have zero specificity and are overridden by any direct
   * declaration on a child element.  This method closes that gap.
   */
  private hideAllExceptTarget(target: HTMLElement): void {
    this.hiddenElements = [];
    // Collect the target, all its descendants, and all its ancestors.
    // Anything outside this protected set gets inline visibility:hidden !important.
    const protectedSet = new Set<Node>();
    // Ancestors — walk up to <html>.
    let ancestor: Node | null = target;
    while (ancestor) {
      protectedSet.add(ancestor);
      ancestor = ancestor.parentNode;
    }
    // Descendants — walk the entire target subtree.
    const sub = document.createTreeWalker(target, NodeFilter.SHOW_ELEMENT);
    while (sub.nextNode()) {
      protectedSet.add(sub.currentNode);
    }
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_ELEMENT,
    );
    let node: HTMLElement | null;
    while ((node = walker.nextNode() as HTMLElement | null)) {
      if (protectedSet.has(node)) continue;
      const tag = node.tagName;
      if (tag === "HEAD" || tag === "META" || tag === "STYLE" || tag === "SCRIPT" || tag === "LINK") continue;
      node.style.setProperty("visibility", "hidden", "important");
      this.hiddenElements.push(node);
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
 *
 * On X/Twitter the avatar `<img>` starts with a tiny placeholder `src` and is
 * swapped for the real URL by JavaScript *after* our initial scan. A
 * MutationObserver watches for `src` / `srcset` / `loading` attribute changes
 * so the deadline is extended and the new image is re-kicked.
 *
 * After the image wait finishes, two `requestAnimationFrame` ticks ensure the
 * browser has composited the newly-loaded images into the frame so that
 * `captureVisibleTab` captures them.
 */
export async function waitForElementRendering(element: HTMLElement, timeoutMs = 4000): Promise<void> {
  const collect = (): HTMLImageElement[] => {
    const all = element instanceof HTMLImageElement ? [element] : Array.from(element.querySelectorAll("img"));
    return all.filter((img) => !img.complete || img.naturalWidth === 0);
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

  // Watch for new images or src/srcset changes inside the element. X/Twitter
  // swaps placeholder avatar URLs for real ones via JS; each swap resets the
  // wait deadline so the new image has time to load and paint.
  let sawChange = false;
  const observer = new MutationObserver(() => {
    sawChange = true;
  });
  try {
    observer.observe(element, {
      childList: true,
      subtree: true,
      attributeFilter: ["src", "srcset", "loading"],
    });
  } catch {
    // MutationObserver may not be available — best effort.
  }

  kick(collect());
  let deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && collect().length > 0) {
    await sleep(120);
    if (sawChange) {
      // Extend the deadline so the newly-swapped image has time to load.
      deadline = Math.max(deadline, Date.now() + timeoutMs);
      sawChange = false;
    }
    kick(collect());
  }

  observer.disconnect();

  try {
    await Promise.race([document.fonts.ready, sleep(1000)]);
  } catch {
    // Font loading is best effort.
  }

  // Two animation frames so the browser composites the newly-loaded images
  // into the frame. Without this, captureVisibleTab may capture the previous
  // paint state where the avatar was still a blank placeholder.
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );
}
