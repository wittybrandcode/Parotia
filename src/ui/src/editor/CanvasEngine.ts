/**
 * Canvas state management for the image editor. Handles image loading,
 * rendering, resize, filtering, and export. EditorHistory owns the single
 * user-visible undo/redo timeline.
 */

export interface CanvasEngine {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;

  loadImage(dataUrl: string): Promise<void>;
  toDataURL(type?: string): string;
  toBlob(type?: string): Promise<Blob>;
  resize(width: number, height: number): void;
  applyFilter(filter: string): void;
  destroy(): void;
}

export function createCanvasEngine(canvas: HTMLCanvasElement): CanvasEngine {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("Cannot get 2d context");
  const ctx = maybeCtx;

  let currentW = 0;
  let currentH = 0;

  async function loadImage(dataUrl: string): Promise<void> {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = dataUrl;
    });
    currentW = img.naturalWidth;
    currentH = img.naturalHeight;
    canvas.width = currentW;
    canvas.height = currentH;
    ctx.drawImage(img, 0, 0);
  }

  function toDataURL(type = "image/png"): string {
    return canvas.toDataURL(type);
  }

  async function toBlob(type = "image/png"): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export blob"));
      }, type);
    });
  }

  function resize(w: number, h: number): void {
    canvas.width = w;
    canvas.height = h;
    currentW = w;
    currentH = h;
  }

  function applyFilter(filter: string): void {
    if (currentW === 0 || currentH === 0) return;
    const current = ctx.getImageData(0, 0, currentW, currentH);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = currentW;
    tempCanvas.height = currentH;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.putImageData(current, 0, 0);
    ctx.clearRect(0, 0, currentW, currentH);
    ctx.filter = filter;
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.filter = "none";
  }

  function destroy(): void {
    canvas.width = 0;
    canvas.height = 0;
  }

  return {
    get canvas() { return canvas; },
    get width() { return currentW; },
    get height() { return currentH; },
    loadImage,
    toDataURL,
    toBlob,
    resize,
    applyFilter,
    destroy,
  };
}
