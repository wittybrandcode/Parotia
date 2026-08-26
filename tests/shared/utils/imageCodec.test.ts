import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasToPngDataUrl, loadBitmap, sleep } from "@shared/utils/imageCodec";

describe("imageCodec", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves sleep only after the requested delay", async () => {
    vi.useFakeTimers();
    const resolved = vi.fn();
    const pending = sleep(25).then(resolved);
    await vi.advanceTimersByTimeAsync(24);
    expect(resolved).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(resolved).toHaveBeenCalledOnce();
  });

  it("loads a fetched blob through createImageBitmap", async () => {
    const blob = new Blob(["image"], { type: "image/png" });
    const bitmap = { width: 2, height: 3 } as ImageBitmap;
    const fetchMock = vi.fn(async () => new Response(blob));
    const createBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", createBitmap);

    await expect(loadBitmap("data:image/png;base64,AAAA")).resolves.toBe(bitmap);
    expect(fetchMock).toHaveBeenCalledWith("data:image/png;base64,AAAA");
    expect(createBitmap).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("rejects when Canvas returns no PNG blob", async () => {
    const canvas = { toBlob: (callback: BlobCallback) => callback(null) } as HTMLCanvasElement;
    await expect(canvasToPngDataUrl(canvas)).rejects.toThrow("Failed to encode PNG");
  });

  it("resolves the FileReader result and reports reader failures", async () => {
    const canvas = { toBlob: (callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })) } as HTMLCanvasElement;
    class SuccessfulReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.result = "data:image/png;base64,cG5n"; this.onload?.(); }
    }
    vi.stubGlobal("FileReader", SuccessfulReader);
    await expect(canvasToPngDataUrl(canvas)).resolves.toBe("data:image/png;base64,cG5n");

    class FailingReader extends SuccessfulReader {
      override readAsDataURL() { this.onerror?.(); }
    }
    vi.stubGlobal("FileReader", FailingReader);
    await expect(canvasToPngDataUrl(canvas)).rejects.toThrow("Failed to read PNG");
  });
});

