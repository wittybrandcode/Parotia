import { afterEach, describe, expect, it, vi } from "vitest";
import { DefaultCaptureStitcher } from "@content/capture/captureStitcher";
import { canvasHeightFor } from "@content/capture/sliceMath";

type FakeBitmap = { width: number; height: number; close: () => void };

const PNG_DATA_URL = "data:image/png;base64,AA";

function installCaptureStubs(bitmaps: FakeBitmap[]) {
  const drawImage = vi.fn();
  const fillRect = vi.fn();
  const fakeCtx = { drawImage, fillRect, fillStyle: "" } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeCtx);

  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    callback(new Blob(["png"], { type: "image/png" }));
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ blob: async () => new Blob(["png"], { type: "image/png" }) })),
  );
  vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmaps.shift() ?? { width: 0, height: 0, close: () => {} }));

  class FakeFileReader {
    result: string | ArrayBuffer | null = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
      this.result = "data:image/png;base64,AA";
      this.onload?.();
    }
  }
  vi.stubGlobal("FileReader", FakeFileReader);

  return { drawImage };
}

describe("DefaultCaptureStitcher", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("start creates a hidden, zero-sized canvas of the full page height", () => {
    installCaptureStubs([]);
    const stitcher = new DefaultCaptureStitcher();

    stitcher.start(1000, 2);
    const canvas = document.documentElement.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas?.height).toBe(canvasHeightFor(1000, 2));
    expect(canvas?.style.width).toBe("0px");
    expect(canvas?.style.height).toBe("0px");
    expect(canvas?.style.position).toBe("fixed");
    expect(canvas?.style.visibility).toBe("hidden");
    stitcher.dispose();
  });

  it("addSlice before start rejects", async () => {
    installCaptureStubs([]);
    const stitcher = new DefaultCaptureStitcher();
    await expect(stitcher.addSlice(PNG_DATA_URL, 0)).rejects.toThrow("Stitcher not started");
  });

  it("finalize before start rejects", async () => {
    installCaptureStubs([]);
    const stitcher = new DefaultCaptureStitcher();
    await expect(stitcher.finalize()).rejects.toThrow("Stitcher not started");
  });

  it("draws each slice at the device-pixel y and clips the last slice to the page bottom", async () => {
    const { drawImage } = installCaptureStubs([
      { width: 800, height: 800, close: () => {} },
      { width: 800, height: 800, close: () => {} },
    ]);
    const stitcher = new DefaultCaptureStitcher();

    stitcher.start(1000, 2);
    await stitcher.addSlice(PNG_DATA_URL, 500);
    await stitcher.addSlice(PNG_DATA_URL, 900);

    expect(drawImage).toHaveBeenCalledTimes(2);
    // rel = 500 → y = 1000 device px; remaining height 500*2 = 1000 → full slice height 800.
    expect(drawImage).toHaveBeenNthCalledWith(1, expect.anything(), 0, 0, 800, 800, 0, 1000, 800, 800);
    // rel = 900 → y = 1800; remaining height (1000-900)*2 = 200 → clipped to 200.
    expect(drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 0, 0, 800, 200, 0, 1800, 800, 200);
    stitcher.dispose();
  });

  it("sets the canvas width once, even when later slices have a different width", async () => {
    const { drawImage } = installCaptureStubs([
      { width: 800, height: 800, close: () => {} },
      { width: 400, height: 800, close: () => {} },
    ]);
    const stitcher = new DefaultCaptureStitcher();

    stitcher.start(1000, 1);
    const canvas = document.documentElement.querySelector("canvas");
    await stitcher.addSlice(PNG_DATA_URL, 0);
    await stitcher.addSlice(PNG_DATA_URL, 100);

    // First slice sets the width to 800; the second must not reset it to 400.
    expect(canvas?.width).toBe(800);
    expect(drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 0, 0, 400, 800, 0, 100, 400, 800);
    stitcher.dispose();
  });

  it("offsets element slices by the base scroll position", async () => {
    const { drawImage } = installCaptureStubs([{ width: 600, height: 900, close: () => {} }]);
    const stitcher = new DefaultCaptureStitcher();

    stitcher.start(900, 1, 200);
    await stitcher.addSlice(PNG_DATA_URL, 200);

    // rel = 200 - 200 = 0 → drawn at y = 0.
    expect(drawImage).toHaveBeenNthCalledWith(1, expect.anything(), 0, 0, 600, 900, 0, 0, 600, 900);
    stitcher.dispose();
  });

  it("finalize resolves the canvas as a PNG data URL", async () => {
    installCaptureStubs([{ width: 100, height: 100, close: () => {} }]);
    const stitcher = new DefaultCaptureStitcher();

    stitcher.start(100, 1);
    await stitcher.addSlice(PNG_DATA_URL, 0);
    await expect(stitcher.finalize()).resolves.toBe("data:image/png;base64,AA");
    stitcher.dispose();
  });

  it("dispose removes the canvas from the DOM and disables further slices", async () => {
    installCaptureStubs([]);
    const stitcher = new DefaultCaptureStitcher();

    stitcher.start(100, 1);
    stitcher.dispose();
    expect(document.documentElement.querySelector("canvas")).toBeNull();
    await expect(stitcher.addSlice(PNG_DATA_URL, 0)).rejects.toThrow("Stitcher not started");
  });
});
