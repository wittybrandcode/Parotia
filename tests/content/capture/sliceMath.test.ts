import { describe, expect, it } from "vitest";
import {
  MAX_CANVAS_DIMENSION,
  canvasHeightFor,
  drawHeightFor,
  exceedsCanvasLimit,
  planSlices,
} from "@content/capture/sliceMath";

describe("sliceMath", () => {
  it("plans one slice for pages shorter than the viewport", () => {
    expect(planSlices(500, 800)).toEqual([0]);
  });

  it("steps through the page one viewport at a time", () => {
    expect(planSlices(2500, 800)).toEqual([0, 800, 1600, 2400]);
  });

  it("covers an exact multiple without an extra slice", () => {
    expect(planSlices(1600, 800)).toEqual([0, 800]);
  });

  it("clips the last slice to the page bottom", () => {
    // Page 1000px tall, dpr 2, slice at y=800 is 1600px tall in device px;
    // only 200 css px (400 device px) remain below y=800.
    expect(drawHeightFor(800, 1000, 2, 1600)).toBe(400);
    // Slices fully above the bottom are drawn whole.
    expect(drawHeightFor(0, 1000, 2, 1600)).toBe(1600);
  });

  it("never draws a slice past the page bottom", () => {
    expect(drawHeightFor(900, 1000, 2, 1600)).toBe(200);
    expect(drawHeightFor(1100, 1000, 2, 1600)).toBe(0);
  });

  it("computes canvas height with dpr, capped at the browser limit", () => {
    expect(canvasHeightFor(1000, 2)).toBe(2000);
    expect(canvasHeightFor(MAX_CANVAS_DIMENSION + 500, 1)).toBe(MAX_CANVAS_DIMENSION);
    expect(exceedsCanvasLimit(MAX_CANVAS_DIMENSION, 1)).toBe(false);
    expect(exceedsCanvasLimit(MAX_CANVAS_DIMENSION + 1, 1)).toBe(true);
  });
});
