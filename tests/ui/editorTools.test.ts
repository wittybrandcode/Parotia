import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdjustPanel } from "@ui/src/editor/AdjustPanel";
import { createCanvasEngine } from "@ui/src/editor/CanvasEngine";
import { createCropTool } from "@ui/src/editor/CropTool";

class TestImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  naturalWidth = 120;
  naturalHeight = 80;
  set src(_value: string) { queueMicrotask(() => this.onload?.()); }
}

function rect(width: number, height: number): DOMRect {
  return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect;
}

describe("editor tools", () => {
  const drawImage = vi.fn();
  const getImageData = vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData));
  const putImageData = vi.fn();
  const clearRect = vi.fn();
  const context = { drawImage, getImageData, putImageData, clearRect, filter: "" } as unknown as CanvasRenderingContext2D;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Image", TestImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA");
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("loads, transforms, exports and destroys a canvas image", async () => {
    const canvas = document.createElement("canvas");
    const engine = createCanvasEngine(canvas);
    await engine.loadImage("data:image/png;base64,AAAA");
    expect(engine.width).toBe(120);
    expect(engine.height).toBe(80);
    engine.applyFilter("brightness(110%)");
    engine.resize(60, 40);
    expect(engine.toDataURL()).toContain("data:image/png");
    await expect(engine.toBlob()).resolves.toBeInstanceOf(Blob);
    expect(drawImage).toHaveBeenCalled();
    engine.destroy();
    expect(canvas.width).toBe(0);
  });

  it("applies, cancels, and cleans up adjustment previews", () => {
    const preview = document.createElement("div");
    const container = document.createElement("div");
    document.body.append(preview, container);
    const onApply = vi.fn();
    const onCancel = vi.fn();
    const panel = createAdjustPanel(preview, container);

    panel.start(onApply, onCancel);
    const sliders = container.querySelectorAll<HTMLInputElement>('input[type="range"]');
    sliders[0]!.value = "130";
    sliders[0]!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(preview.style.filter).toContain("130%");
    expect(panel.getFilter()).toContain("130%");
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Apply")!.click();
    expect(onApply).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-parotia-adjust-panel]")).toBeNull();

    panel.start(onApply, onCancel);
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel")!.click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(preview.style.filter).toBe("");
  });

  it("maps crop gestures from the displayed stage back to image pixels", () => {
    const surface = document.createElement("div");
    const container = document.createElement("div");
    document.body.append(container);
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(rect(300, 200));
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(rect(300, 200));
    const apply = vi.fn();
    const cancel = vi.fn();
    const crop = createCropTool(surface, container, 1200, 800);

    crop.start(apply, cancel);
    const handles = container.querySelectorAll<HTMLDivElement>("[data-parotia-crop-overlay] > div");
    handles[1]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 300, clientY: 200 }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 250, clientY: 160 }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Crop")!.click();
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }));
    expect(container.querySelector("[data-parotia-crop-overlay]")).toBeNull();

    crop.start(apply, cancel);
    [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel")!.click();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
