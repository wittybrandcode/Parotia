import { canvasHeightFor, drawHeightFor } from "./sliceMath";

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

export interface CaptureStitcher {
  start(pageHeightCss: number, dpr: number, baseScrollCss?: number): void;
  addSlice(dataUrl: string, scrollYCss: number): Promise<SliceResult>;
  finalize(): Promise<string>;
  dispose(): void;
}

export class DefaultCaptureStitcher implements CaptureStitcher {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private pageHeightCss = 0;
  private dpr = 1;
  private baseScrollCss = 0;
  private widthSet = false;

  start(pageHeightCss: number, dpr: number, baseScrollCss = 0): void {
    this.pageHeightCss = pageHeightCss;
    this.dpr = dpr || 1;
    this.baseScrollCss = baseScrollCss || 0;
    this.widthSet = false;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = canvasHeightFor(pageHeightCss, this.dpr);
    // The canvas bitmap is sized in device px above; the CSS box is collapsed so
    // it never affects layout, paint, or scroll metrics while capturing.
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
    // Flag likely-blank slices BEFORE drawing so the caller can re-capture the
    // viewport. A screenshot taken while the page is still painting renders as
    // a single flat color; genuinely blank page gaps are rare enough that a
    // single re-capture is cheap insurance.
    const blank = bitmapLooksBlank(bitmap);
    // Setting canvas.width resets (clears) the canvas — only set it once.
    if (!this.widthSet && bitmap.width > 0) {
      canvas.width = bitmap.width;
      // Fill with an opaque white background so any 1 px rounding gaps between
      // slices render as white rather than transparent (which appears gray in
      // most image viewers).
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.widthSet = true;
    }
    // For element capture the canvas is element-sized, so slices are drawn
    // relative to the element's document top (baseScrollCss).
    const rel = scrollYCss - this.baseScrollCss;
    const drawHeight = drawHeightFor(rel, this.pageHeightCss, this.dpr, bitmap.height);
    const y = Math.round(rel * this.dpr);
    if (drawHeight > 0) {
      ctx.drawImage(bitmap, 0, 0, bitmap.width, drawHeight, 0, y, bitmap.width, drawHeight);
    }
    bitmap.close();
    return { blank };
  }

  finalize(): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = this.canvas;
      if (!canvas) {
        reject(new Error("Stitcher not started"));
        return;
      }
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to encode PNG"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Failed to read PNG"));
        reader.readAsDataURL(blob);
      }, "image/png");
    });
  }

  dispose(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.widthSet = false;
  }
}

async function loadBitmap(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
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
