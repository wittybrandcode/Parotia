/**
 * Pure helpers for full-page capture. Capture works by scrolling the page one
 * viewport at a time, capturing each viewport with captureVisibleTab, and
 * stitching the slices onto a canvas whose height equals the page height.
 */

export const MAX_CANVAS_DIMENSION = 32767;

export interface PageMetrics {
  scrollHeight: number;
  viewportHeight: number;
  dpr: number;
  scrollY: number;
}

export function exceedsCanvasLimit(pageHeightCss: number, dpr: number): boolean {
  return Math.round(pageHeightCss * (dpr || 1)) > MAX_CANVAS_DIMENSION;
}

export function canvasHeightFor(pageHeightCss: number, dpr: number): number {
  return Math.min(MAX_CANVAS_DIMENSION, Math.max(1, Math.round(pageHeightCss * (dpr || 1))));
}

/** Scroll positions (CSS px) to capture, covering the whole page. */
export function planSlices(pageHeightCss: number, viewportHeightCss: number): number[] {
  const step = Math.max(1, Math.round(viewportHeightCss));
  const scrollYs: number[] = [];
  for (let y = 0; y < pageHeightCss; y += step) scrollYs.push(y);
  if (scrollYs.length === 0) scrollYs.push(0);
  return scrollYs;
}

/**
 * Height (device px) of the slice to actually draw at a given scroll position.
 * The last slice may reach below the page content — clip it to the page bottom.
 */
export function drawHeightFor(
  scrollYCss: number,
  pageHeightCss: number,
  dpr: number,
  sliceHeightPx: number,
): number {
  const remainingPx = Math.round((pageHeightCss - scrollYCss) * (dpr || 1));
  return Math.min(sliceHeightPx, Math.max(0, remainingPx));
}
