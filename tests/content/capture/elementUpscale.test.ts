import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadBitmap: vi.fn(),
  encode: vi.fn(),
}));

vi.mock("@shared/utils/imageCodec", () => ({
  loadBitmap: mocks.loadBitmap,
  canvasToPngDataUrl: mocks.encode,
  sleep: vi.fn(async () => undefined),
}));

import { cropDataUrlToPng } from "@content/capture/elementCapture";

interface FakeContext {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  drawImage: ReturnType<typeof vi.fn>;
}

function fakeCanvas(context: FakeContext | null): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
}

describe("element PNG high-quality upscale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadBitmap.mockResolvedValue({ width: 400, height: 300, close: vi.fn() });
    mocks.encode.mockResolvedValue("data:image/png;base64,scaled");
  });

  it("crops and renders directly to exact 2x dimensions with high-quality smoothing", async () => {
    const context: FakeContext = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      drawImage: vi.fn(),
    };
    const canvas = fakeCanvas(context);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const result = await cropDataUrlToPng(
      "data:image/png;base64,input",
      { x: 10, y: 20, width: 100, height: 50 },
      2,
    );

    expect(result).toBe("data:image/png;base64,scaled");
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe("high");
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 400, height: 300 }),
      10, 20, 100, 50,
      0, 0, 200, 100,
    );
    expect(mocks.encode).toHaveBeenCalledWith(canvas);
  });

  it("falls back to native dimensions if the enhanced canvas is rejected", async () => {
    const nativeContext: FakeContext = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      drawImage: vi.fn(),
    };
    const rejected = fakeCanvas(null);
    const native = fakeCanvas(nativeContext);
    vi.spyOn(document, "createElement")
      .mockReturnValueOnce(rejected)
      .mockReturnValueOnce(native);

    await expect(cropDataUrlToPng(
      "data:image/png;base64,input",
      { x: 0, y: 0, width: 100, height: 50 },
      2,
    )).resolves.toBe("data:image/png;base64,scaled");

    expect(rejected.width).toBe(200);
    expect(rejected.height).toBe(100);
    expect(native.width).toBe(100);
    expect(native.height).toBe(50);
    expect(nativeContext.imageSmoothingQuality).toBe("high");
  });
});
