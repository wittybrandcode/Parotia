import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ELEMENT_EXPORT_SCALE,
  MAX_SAFE_OUTPUT_PIXELS,
  ElementCaptureIsolator,
  safeOutputScale,
} from "@content/capture/elementCapture";
import { MAX_CANVAS_DIMENSION } from "@content/capture/sliceMath";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("ElementCaptureIsolator fidelity contract", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = `
      <div id="outside" style="visibility: collapse !important">Other content</div>
      <article id="target">
        <div style="opacity: 0.5"><img loading="lazy" data-src="avatar.png" /></div>
        <p>Capturable element</p>
      </article>
    `;
    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  it("measures the current frame without changing any DOM, style, media attribute, or scroll", () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) throw new Error("target missing");
    target.getBoundingClientRect = () => rect(80, 40, 600, 500);
    const beforeHtml = document.documentElement.outerHTML;
    const isolator = new ElementCaptureIsolator();

    const metrics = isolator.isolate(target);

    expect(metrics).toEqual({
      dpr: 2,
      rect: { left: 80, top: 40, width: 600, height: 500 },
      elementDocTop: 160,
      elementHeightCss: 500,
      viewportHeightCss: 800,
      viewportWidthCss: 1000,
      fullyVisible: true,
    });
    expect(document.documentElement.outerHTML).toBe(beforeHtml);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it.each([
    rect(-1, 20, 100, 100),
    rect(20, -1, 100, 100),
    rect(950, 20, 100, 100),
    rect(20, 750, 100, 100),
  ])("uses stitching when any selected pixel is outside the viewport", (targetRect) => {
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) throw new Error("target missing");
    target.getBoundingClientRect = () => targetRect;

    expect(new ElementCaptureIsolator().isolate(target).fullyVisible).toBe(false);
  });

  it("restores only the original scroll after a stitched capture", () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) throw new Error("target missing");
    target.getBoundingClientRect = () => rect(0, 0, 500, 1200);
    const isolator = new ElementCaptureIsolator();
    isolator.isolate(target);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 900 });

    isolator.restore();

    expect(window.scrollTo).toHaveBeenCalledWith(0, 120);
    expect(document.querySelector("style[data-newsclean-capture-style]")).toBeNull();
  });

  it("is idempotent and never overwrites site-owned attributes", () => {
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) throw new Error("target missing");
    target.setAttribute("data-newsclean-capture", "site-owned");
    target.getBoundingClientRect = () => rect(10, 10, 100, 100);
    const before = document.documentElement.outerHTML;
    const isolator = new ElementCaptureIsolator();

    isolator.isolate(target);
    isolator.restore();
    isolator.restore();

    expect(document.documentElement.outerHTML).toBe(before);
  });
});

describe("safe element export scaling", () => {
  it("uses an exact 2x output for normal captures", () => {
    expect(safeOutputScale(1800, 2000, ELEMENT_EXPORT_SCALE)).toBe(2);
  });

  it("chooses the highest safe scale for unusually large captures", () => {
    const width = 20_000;
    const height = 1_000;
    const scale = safeOutputScale(width, height, ELEMENT_EXPORT_SCALE);

    expect(scale).toBeGreaterThanOrEqual(1);
    expect(scale).toBeLessThan(2);
    expect(Math.floor(width * scale)).toBeLessThanOrEqual(MAX_CANVAS_DIMENSION);
    expect(Math.floor(width * scale) * Math.floor(height * scale)).toBeLessThanOrEqual(MAX_SAFE_OUTPUT_PIXELS);
  });

  it("rejects invalid dimensions instead of allocating an unsafe canvas", () => {
    expect(() => safeOutputScale(Number.NaN, 100, 2)).toThrow(/finite positive/i);
    expect(() => safeOutputScale(100, 100, 0)).toThrow(/finite positive/i);
  });
});
