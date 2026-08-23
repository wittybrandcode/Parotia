/**
 * Pure helpers for full-page capture. Capture works by scrolling the page one
 * viewport at a time, capturing each viewport with captureVisibleTab, and
 * stitching the slices onto a canvas whose height equals the page height.
 */

export const MAX_CANVAS_DIMENSION = 32767;

/**
 * Adjacent viewport captures deliberately overlap by a few CSS pixels. Chrome
 * can round the captured bitmap height down at fractional DPR/tab zoom while
 * scroll coordinates round up; without overlap that creates a one-pixel hole
 * which the stitcher's completeness check correctly rejects.
 */
export const CAPTURE_SLICE_OVERLAP_CSS = 8;

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
  const pageHeight = Math.max(0, Math.round(pageHeightCss));
  const viewportHeight = Math.max(1, Math.round(viewportHeightCss));
  const maxScroll = Math.max(0, pageHeight - viewportHeight);
  if (maxScroll === 0) return [0];

  const overlap = Math.min(CAPTURE_SLICE_OVERLAP_CSS, viewportHeight - 1);
  const step = Math.max(1, viewportHeight - overlap);
  const scrollYs: number[] = [];
  for (let y = 0; y < maxScroll; y += step) scrollYs.push(y);
  if (scrollYs.at(-1) !== maxScroll) scrollYs.push(maxScroll);
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
