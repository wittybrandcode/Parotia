import { canvasToPngDataUrl, loadBitmap } from "@shared/utils/imageCodec";
import { MAX_CANVAS_DIMENSION } from "./sliceMath";

/** Element exports are enlarged after capture, never by zooming the page. */
export const ELEMENT_EXPORT_SCALE = 2;
/** Conservative RGBA budget: 64M pixels ≈ 256 MiB for the output surface. */
export const MAX_SAFE_OUTPUT_PIXELS = 64 * 1024 * 1024;

export interface CaptureRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ElementCaptureMetrics {
  dpr: number;
  rect: CaptureRect;
  /** Document-relative top of the element (used only for multi-viewport stitching). */
  elementDocTop: number;
  elementHeightCss: number;
  viewportHeightCss: number;
  viewportWidthCss: number;
  /** True when one viewport screenshot contains every selected pixel. */
  fullyVisible: boolean;
}

export { loadBitmap, sleep } from "@shared/utils/imageCodec";

/** Highest scale that stays inside Chromium's dimension and memory budgets. */
export function safeOutputScale(width: number, height: number, requestedScale: number): number {
  if (![width, height, requestedScale].every(Number.isFinite)
    || width <= 0
    || height <= 0
    || requestedScale <= 0) {
    throw new Error("Output scale requires finite positive dimensions");
  }
  const dimensionScale = Math.min(MAX_CANVAS_DIMENSION / width, MAX_CANVAS_DIMENSION / height);
  const areaScale = Math.sqrt(MAX_SAFE_OUTPUT_PIXELS / (width * height));
  // Never downscale the native capture here. If the source is already beyond
  // the conservative budget, the caller still gets one best-effort native PNG.
  return Math.max(1, Math.min(requestedScale, dimensionScale, areaScale));
}

/**
 * Crops a data-URL image and optionally enlarges the result in the same render
 * pass. High-quality browser resampling avoids a second lossy intermediate and
 * keeps page layout fidelity because the site has already been captured.
 */
export async function cropDataUrlToPng(
  dataUrl: string,
  region: { x: number; y: number; width: number; height: number },
  requestedScale = 1,
): Promise<string> {
  const bitmap = await loadBitmap(dataUrl);
  try {
    if (![region.x, region.y, region.width, region.height].every(Number.isFinite)) {
      throw new Error("Crop region must contain finite coordinates");
    }
    const x = Math.max(0, Math.min(bitmap.width - 1, Math.round(region.x)));
    const y = Math.max(0, Math.min(bitmap.height - 1, Math.round(region.y)));
    const width = Math.max(1, Math.min(Math.round(region.width), bitmap.width - x));
    const height = Math.max(1, Math.min(Math.round(region.height), bitmap.height - y));
    const preferredScale = safeOutputScale(width, height, requestedScale);

    const render = async (scale: number): Promise<string> => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, x, y, width, height, 0, 0, canvas.width, canvas.height);
      return canvasToPngDataUrl(canvas);
    };

    try {
      return await render(preferredScale);
    } catch (error) {
      // A GPU/driver may enforce a tighter canvas budget than Chromium's
      // documented dimension. Preserve the capture at native size instead of
      // failing the whole operation because optional enhancement was too large.
      if (preferredScale <= 1) throw error;
      return render(1);
    }
  } finally {
    bitmap.close();
  }
}

/**
 * A read-only element capture transaction.
 *
 * Pixel fidelity depends on leaving the page's render tree untouched. In
 * particular, changing zoom, lazy-image attributes, opacity, visibility or
 * content-visibility can trigger responsive reflow and site virtualization
 * (X/Twitter is a prominent example). This class therefore only records the
 * target geometry and the original scroll position. The worker crops a native
 * viewport screenshot when the element is fully visible; scrolling is used
 * only when a genuinely taller element must be stitched.
 */
export class ElementCaptureIsolator {
  private originalScrollY = 0;
  private active = false;

  isolate(target: HTMLElement): ElementCaptureMetrics {
    if (this.active) this.restore();
    this.originalScrollY = window.scrollY;
    this.active = true;

    const rect = target.getBoundingClientRect();
    const viewportWidthCss = window.innerWidth;
    const viewportHeightCss = window.innerHeight;
    const fullyVisible = rect.left >= 0
      && rect.top >= 0
      && rect.right <= viewportWidthCss
      && rect.bottom <= viewportHeightCss;

    return {
      dpr: window.devicePixelRatio || 1,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      elementDocTop: window.scrollY + rect.top,
      elementHeightCss: rect.height,
      viewportHeightCss,
      viewportWidthCss,
      fullyVisible,
    };
  }

  /** Restores only scrolling performed by the multi-viewport capture path. */
  restore(): void {
    if (!this.active) return;
    this.active = false;
    if (Math.abs(window.scrollY - this.originalScrollY) < 0.5) return;
    try {
      window.scrollTo(0, this.originalScrollY);
    } catch {
      // Best effort if the page disappeared during capture.
    }
  }
}
