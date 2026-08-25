import { beforeEach, describe, expect, it, vi } from "vitest";
import { finishCapture } from "@background/editorGateway";

function pngHeader(width: number, height: number): string {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return `data:image/png;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}`;
}

describe("editor gateway preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.downloads.download as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(91);
    (chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  it("stages a safe image and opens the editor normally", async () => {
    const dataUrl = pngHeader(1600, 8088);
    const result = await finishCapture(4, "session-safe", dataUrl, "safe.png") as {
      success?: boolean;
      editor?: boolean;
      editorBypassed?: boolean;
    };

    expect(result).toEqual(expect.objectContaining({ success: true, editor: true }));
    expect(result.editorBypassed).toBeUndefined();
    const staged = (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(Object.entries(staged ?? {}).some(([key, value]) => key.startsWith("editor-image:") && value === dataUrl)).toBe(true);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(4, expect.objectContaining({
      type: "OPEN_EDITOR",
      payload: expect.objectContaining({ filename: "safe.png", sessionId: "session-safe" }),
    }));
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it("downloads an oversized original without staging or opening the editor", async () => {
    const dataUrl = pngHeader(20_000, 100);
    const result = await finishCapture(4, "session-large", dataUrl, "large.png") as {
      success?: boolean;
      editor?: boolean;
      editorBypassed?: boolean;
      warning?: string;
      preflight?: { reason?: string; width?: number; height?: number };
    };

    expect(result).toEqual(expect.objectContaining({
      success: true,
      editor: false,
      editorBypassed: true,
      warning: expect.stringContaining("saved without opening the editor"),
      preflight: expect.objectContaining({ reason: "DIMENSION_LIMIT", width: 20_000, height: 100 }),
    }));
    expect(chrome.downloads.download).toHaveBeenCalledWith(expect.objectContaining({ url: dataUrl, filename: "large.png" }));
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("reports a save failure without attempting to open an oversized image", async () => {
    (chrome.downloads.download as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Disk full"));
    const result = await finishCapture(4, "session-large", pngHeader(20_000, 100), "large.png") as {
      success?: boolean;
      error?: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("too large for safe editing");
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
