import { canvasHeightFor, drawHeightFor } from "./sliceMath";

/**
 * Stitches full-page capture slices onto a hidden off-screen canvas inside the
 * page. The canvas is position:fixed, visibility:hidden, and 0-sized in CSS so
 * it is invisible to the user and never shows up in subsequent captures or
 * affects layout.
 */
export interface CaptureStitcher {
  start(pageHeightCss: number, dpr: number, baseScrollCss?: number): void;
  addSlice(dataUrl: string, scrollYCss: number): Promise<void>;
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

  async addSlice(dataUrl: string, scrollYCss: number): Promise<void> {
    const { ctx, canvas } = this;
    if (!ctx || !canvas) throw new Error("Stitcher not started");
    const bitmap = await loadBitmap(dataUrl);
    // Setting canvas.width resets (clears) the canvas — only set it once.
    if (!this.widthSet && bitmap.width > 0) {
      canvas.width = bitmap.width;
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
