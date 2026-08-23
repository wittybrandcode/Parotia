import { loadBitmap, canvasToPngDataUrl } from "@shared/utils/imageCodec";
import { canvasHeightFor } from "./sliceMath";

/**
 * Stitches full-page capture slices onto a hidden off-screen canvas inside the
 * page. The canvas is position:fixed, visibility:hidden, and 0-sized in CSS so
 * it is invisible to the user and never shows up in subsequent captures or
 * affects layout.
 */
export interface SliceResult {
  /** True when the slice's pixels are essentially one flat color — usually an
   * unpainted viewport captured mid-paint. Callers should re-capture once. */
  blank?: boolean;
}

export interface StitchFinalizeResult {
  dataUrl: string;
  complete: boolean;
  capturedHeightCss: number;
  requestedHeightCss: number;
  gapCount: number;
}

export interface CaptureStitcher {
  start(pageHeightCss: number, dpr: number, baseScrollCss?: number, viewportHeightCss?: number): void;
  addSlice(dataUrl: string, scrollYCss: number): Promise<SliceResult>;
  finalize(): Promise<string>;
  /** Full-page capture may export the continuous top portion as a fallback. */
  finalizeBestEffort?(): Promise<StitchFinalizeResult>;
  dispose(): void;
}

export class DefaultCaptureStitcher implements CaptureStitcher {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private pageHeightCss = 0;
  private dpr = 1;
  private pixelScale = 1;
  private baseScrollCss = 0;
  private viewportHeightCss = 0;
  private widthSet = false;
  private painted: Array<{ start: number; end: number }> = [];

  start(pageHeightCss: number, dpr: number, baseScrollCss = 0, viewportHeightCss = 0): void {
    this.pageHeightCss = pageHeightCss;
    this.dpr = dpr || 1;
    this.pixelScale = this.dpr;
    this.baseScrollCss = baseScrollCss || 0;
    this.viewportHeightCss = viewportHeightCss > 0 ? viewportHeightCss : 0;
    this.widthSet = false;
    this.painted = [];
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = canvasHeightFor(pageHeightCss, this.dpr);
    canvas.style.width = "0px";
    canvas.style.height = "0px";
    canvas.style.position = "fixed";
    canvas.style.visibility = "hidden";
    canvas.style.pointerEvents = "none";
    document.documentElement.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  async addSlice(dataUrl: string, scrollYCss: number): Promise<SliceResult> {
    const { ctx, canvas } = this;
    if (!ctx || !canvas) throw new Error("Stitcher not started");
    const bitmap = await loadBitmap(dataUrl);
    const blank = bitmapLooksBlank(bitmap);
    if (!this.widthSet && bitmap.width > 0) {
      // captureVisibleTab's real bitmap scale can differ from the page's
      // devicePixelRatio (notably at fractional tab/OS zoom). Deriving the
      // vertical scale from the first captured viewport keeps slice positions,
      // bitmap heights and the destination canvas in the same coordinate space.
      if (this.viewportHeightCss > 0 && bitmap.height > 0) {
        const measuredScale = bitmap.height / this.viewportHeightCss;
        if (Number.isFinite(measuredScale) && measuredScale > 0) this.pixelScale = measuredScale;
      }
      canvas.width = bitmap.width;
      canvas.height = canvasHeightFor(this.pageHeightCss, this.pixelScale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.widthSet = true;
    }
    const rawY = Math.round((scrollYCss - this.baseScrollCss) * this.pixelScale);
    const sourceY = Math.max(0, -rawY);
    const y = Math.max(0, rawY);
    const remaining = Math.max(0, canvas.height - y);
    if (remaining <= 0 || sourceY >= bitmap.height) {
      bitmap.close();
      return { blank };
    }
    const drawHeight = Math.min(bitmap.height - sourceY, remaining);
    if (drawHeight > 0) {
      ctx.drawImage(bitmap, 0, sourceY, bitmap.width, drawHeight, 0, y, bitmap.width, drawHeight);
      this.recordPainted(y, y + drawHeight);
    }
    bitmap.close();
    return { blank };
  }

  finalize(): Promise<string> {
    const canvas = this.canvas;
    if (!canvas) return Promise.reject(new Error("Stitcher not started"));
    const coverage = this.painted[0];
    if (!coverage || coverage.start > 0 || coverage.end < canvas.height || this.painted.length > 1) {
      return Promise.reject(new Error("Capture slices did not cover the requested image without gaps"));
    }
    return canvasToPngDataUrl(canvas);
  }

  /**
   * Returns the complete image whenever possible. If a hostile/dynamic page
   * still leaves a real gap, export only the continuous portion starting at
   * the top instead of presenting white holes as if the capture were complete.
   */
  async finalizeBestEffort(): Promise<StitchFinalizeResult> {
    const canvas = this.canvas;
    if (!canvas) throw new Error("Stitcher not started");
    const coverage = this.painted[0];
    const complete = Boolean(
      coverage && coverage.start <= 0 && coverage.end >= canvas.height && this.painted.length === 1,
    );
    if (complete) {
      return {
        dataUrl: await canvasToPngDataUrl(canvas),
        complete: true,
        capturedHeightCss: this.pageHeightCss,
        requestedHeightCss: this.pageHeightCss,
        gapCount: 0,
      };
    }
    if (!coverage || coverage.start > 0 || coverage.end <= 0 || canvas.width <= 0) {
      throw new Error("Capture slices did not cover the top of the requested image");
    }

    const capturedHeightPx = Math.min(canvas.height, Math.floor(coverage.end));
    const partial = document.createElement("canvas");
    partial.width = canvas.width;
    partial.height = Math.max(1, capturedHeightPx);
    const partialCtx = partial.getContext("2d");
    if (!partialCtx) throw new Error("Could not create a fallback capture canvas");
    partialCtx.drawImage(
      canvas,
      0,
      0,
      canvas.width,
      partial.height,
      0,
      0,
      canvas.width,
      partial.height,
    );
    return {
      dataUrl: await canvasToPngDataUrl(partial),
      complete: false,
      capturedHeightCss: Math.min(this.pageHeightCss, Math.floor(capturedHeightPx / this.pixelScale)),
      requestedHeightCss: this.pageHeightCss,
      gapCount: Math.max(1, this.painted.length - 1),
    };
  }

  dispose(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.widthSet = false;
    this.pixelScale = 1;
    this.viewportHeightCss = 0;
    this.painted = [];
  }

  private recordPainted(start: number, end: number): void {
    const ranges = [...this.painted, { start, end }].sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (!last || range.start > last.end) merged.push({ ...range });
      else last.end = Math.max(last.end, range.end);
    }
    this.painted = merged;
  }
}


/** Probe sample size (px) used by bitmapLooksBlank. */
const BLANK_PROBE_SIZE = 32;

/**
 * True when a captured bitmap reduces to essentially a single flat color.
 * captureVisibleTab returns a fully-painted opaque frame, so a flat frame means
 * the viewport was captured before the browser painted the new scroll position
 * (or the capture itself failed). Real page content — even a sparse article —
 * has more than ~2 units of average per-channel deviation.
 */
export function bitmapLooksBlank(bitmap: ImageBitmap): boolean {
  const w = Math.min(BLANK_PROBE_SIZE, bitmap.width);
  const h = Math.min(BLANK_PROBE_SIZE, bitmap.height);
  if (w <= 0 || h <= 0) return true;
  const probe = document.createElement("canvas");
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  if (!pctx) return false; // Cannot probe — assume the slice is fine.
  pctx.drawImage(bitmap, 0, 0, w, h);
  const data = pctx.getImageData(0, 0, w, h).data;
  const pixelCount = data.length / 4;
  if (pixelCount === 0) return true;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
  }
  const rMean = r / pixelCount;
  const gMean = g / pixelCount;
  const bMean = b / pixelCount;
  let deviation = 0;
  for (let i = 0; i < data.length; i += 4) {
    deviation +=
      Math.abs((data[i] ?? 0) - rMean) +
      Math.abs((data[i + 1] ?? 0) - gMean) +
      Math.abs((data[i + 2] ?? 0) - bMean);
  }
  return deviation / (3 * pixelCount) < 2;
}
