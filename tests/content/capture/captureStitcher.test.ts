import { afterEach, describe, expect, it, vi } from "vitest";
import { DefaultCaptureStitcher, bitmapLooksBlank } from "@content/capture/captureStitcher";
import { canvasHeightFor } from "@content/capture/sliceMath";

type FakeBitmap = { width: number; height: number; close: () => void };

const PNG_DATA_URL = "data:image/png;base64,AA";

/** Uniform RGBA sample (all pixels identical) → bitmapLooksBlank returns true. */
function flatImageData(value: number): { data: Uint8ClampedArray; width: number; height: number } {
  return { data: new Uint8ClampedArray(32 * 32 * 4).fill(value), width: 32, height: 32 };
}

/** Alternating black/white sample → high deviation → not blank. */
function noisyImageData(): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < data.length; i += 4) {
    const on = (i / 4) % 2 === 0;
    data[i] = on ? 255 : 0;
    data[i + 1] = on ? 255 : 0;
    data[i + 2] = on ? 255 : 0;
    data[i + 3] = 255;
  }
  return { data, width: 32, height: 32 };
}

function installCaptureStubs(
  bitmaps: FakeBitmap[],
  imageData?: { data: Uint8ClampedArray; width: number; height: number },
) {
  const drawImage = vi.fn();
  const fillRect = vi.fn();
  const probeData = imageData ?? noisyImageData();
  const getImageData = vi.fn(() => probeData);
  // The stitcher's main canvas is appended to the document before getContext;
  // the blank-probe canvas is never appended. Use DOM connectivity to return a
  // distinct context per canvas so probe drawImage calls don't pollute the
  // main canvas assertions.
  const mainCtx = { drawImage, fillRect, fillStyle: "" } as unknown as CanvasRenderingContext2D;
  const probeCtx = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: "", getImageData } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return this.isConnected ? mainCtx : probeCtx;
  });

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
    document.querySelectorAll("canvas").forEach((c) => c.remove());
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
    await stitcher.addSlice(PNG_DATA_URL, 0);
    await stitcher.addSlice(PNG_DATA_URL, 600);

    expect(drawImage).toHaveBeenCalledTimes(2);
    // Slice 1 starts at document y=0.
    expect(drawImage).toHaveBeenNthCalledWith(1, expect.anything(), 0, 0, 800, 800, 0, 0, 800, 800);
    // Slice 2 is placed from its actual CSS scroll coordinate (600*2).
    expect(drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 0, 0, 800, 800, 0, 1200, 800, 800);
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
    await stitcher.addSlice(PNG_DATA_URL, 800);

    // First slice sets the width to 800; the second must not reset it to 400.
    expect(canvas?.width).toBe(800);
    // Slice 2 is clipped at the page bottom.
    expect(drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 0, 0, 400, 200, 0, 800, 400, 200);
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

  it("crops the source when an element starts below the maximum scroll position", async () => {
    const { drawImage } = installCaptureStubs([{ width: 600, height: 900, close: () => {} }]);
    const stitcher = new DefaultCaptureStitcher();

    stitcher.start(500, 1, 700);
    await stitcher.addSlice(PNG_DATA_URL, 500);

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 200, 600, 500, 0, 0, 600, 500);
    await expect(stitcher.finalize()).resolves.toBe(PNG_DATA_URL);
    stitcher.dispose();
  });

  it("overwrites an overlapping last viewport at its real coordinate without appending it", async () => {
    const { drawImage } = installCaptureStubs([
      { width: 800, height: 600, close: () => {} },
      { width: 800, height: 600, close: () => {} },
      { width: 800, height: 600, close: () => {} },
    ]);
    const stitcher = new DefaultCaptureStitcher();
    stitcher.start(1300, 1);
    await stitcher.addSlice(PNG_DATA_URL, 0);
    await stitcher.addSlice(PNG_DATA_URL, 600);
    await stitcher.addSlice(PNG_DATA_URL, 700);

    expect(drawImage).toHaveBeenNthCalledWith(3, expect.anything(), 0, 0, 800, 600, 0, 700, 800, 600);
    await expect(stitcher.finalize()).resolves.toBe(PNG_DATA_URL);
    stitcher.dispose();
  });

  it("rejects finalization when actual scroll positions leave a pixel gap", async () => {
    installCaptureStubs([
      { width: 800, height: 500, close: () => {} },
      { width: 800, height: 400, close: () => {} },
    ]);
    const stitcher = new DefaultCaptureStitcher();
    stitcher.start(1000, 1);
    await stitcher.addSlice(PNG_DATA_URL, 0);
    await stitcher.addSlice(PNG_DATA_URL, 600);
    await expect(stitcher.finalize()).rejects.toThrow("without gaps");
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

  it("addSlice reports a blank flag for a flat-color (unpainted) slice", async () => {
    installCaptureStubs([{ width: 800, height: 800, close: () => {} }], flatImageData(255));
    const stitcher = new DefaultCaptureStitcher();

    stitcher.start(1000, 1);
    const result = await stitcher.addSlice(PNG_DATA_URL, 0);

    expect(result.blank).toBe(true);
    stitcher.dispose();
  });

  it("addSlice does not flag a slice with real content", async () => {
    installCaptureStubs([{ width: 800, height: 800, close: () => {} }], noisyImageData());
    const stitcher = new DefaultCaptureStitcher();

    stitcher.start(1000, 1);
    const result = await stitcher.addSlice(PNG_DATA_URL, 0);

    expect(result.blank).toBe(false);
    stitcher.dispose();
  });

  it("bitmapLooksBlank returns true for a uniformly-transparent bitmap", () => {
    const transparent = { width: 800, height: 600, close: () => {} } as unknown as ImageBitmap;
    installCaptureStubs([], flatImageData(0));
    expect(bitmapLooksBlank(transparent)).toBe(true);
  });

  it("bitmapLooksBlank returns false when the canvas cannot be probed", () => {
    const bitmap = { width: 800, height: 600, close: () => {} } as unknown as ImageBitmap;
    installCaptureStubs([]);
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    expect(bitmapLooksBlank(bitmap)).toBe(false);
  });
});
