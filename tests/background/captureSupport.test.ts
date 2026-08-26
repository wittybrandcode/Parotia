import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureSliceLoop,
  captureSliceWithRetry,
  hideToolbar,
  pushProgress,
  scrollTab,
  showToolbar,
  titleSlug,
  withCaptureCleanup,
} from "@background/captureSupport";

const captureVisibleTab = vi.fn();

describe("background capture support", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.assign(chrome.tabs, { captureVisibleTab });
    captureVisibleTab.mockResolvedValue("data:image/png;base64,valid");
    (chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends progress and capture lifecycle messages with the owning session", async () => {
    pushProgress(7, "session-7", { current: 2, total: 4, phase: "RENDERING" });
    await hideToolbar(7, "session-7");
    await showToolbar(7, "session-7");
    await scrollTab(7, 320, "session-7");

    expect(chrome.tabs.sendMessage).toHaveBeenNthCalledWith(1, 7, {
      type: "CAPTURE_PROGRESS",
      payload: { sessionId: "session-7", progress: { current: 2, total: 4, phase: "RENDERING" } },
    });
    expect(chrome.tabs.sendMessage).toHaveBeenNthCalledWith(2, 7, {
      type: "PREPARE_CAPTURE",
      payload: { sessionId: "session-7" },
    });
    expect(chrome.tabs.sendMessage).toHaveBeenNthCalledWith(3, 7, {
      type: "RESTORE_CAPTURE",
      payload: { sessionId: "session-7" },
    });
    expect(chrome.tabs.sendMessage).toHaveBeenNthCalledWith(4, 7, {
      type: "CAPTURE_SCROLL",
      payload: { sessionId: "session-7", scrollYCss: 320 },
    });
  });

  it("treats toolbar and scroll messaging failures as best effort", async () => {
    (chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("tab closed"));

    await expect(hideToolbar(2, "gone")).resolves.toBeUndefined();
    await expect(showToolbar(2, "gone")).resolves.toBeUndefined();
    await expect(scrollTab(2, 10)).resolves.toBeUndefined();
  });

  it("sanitizes a title and falls back for a missing title", () => {
    expect(titleSlug({ title: "Breaking / News" } as chrome.tabs.Tab)).toBe("Breaking-News");
    expect(titleSlug({} as chrome.tabs.Tab)).toBe("article");
  });

  it("returns the first valid PNG viewport", async () => {
    await expect(captureSliceWithRetry(12)).resolves.toBe("data:image/png;base64,valid");
    expect(captureVisibleTab).toHaveBeenCalledWith(12, { format: "png" });
  });

  it("retries transient exceptions and invalid capture results", async () => {
    captureVisibleTab
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce("data:image/jpeg;base64,wrong")
      .mockResolvedValueOnce("data:image/png;base64,recovered");

    const result = captureSliceWithRetry(3);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe("data:image/png;base64,recovered");
    expect(captureVisibleTab).toHaveBeenCalledTimes(3);
  });

  it("rejects after all viewport attempts return unusable data", async () => {
    captureVisibleTab.mockResolvedValue(undefined);

    const result = captureSliceWithRetry(3);
    const rejection = expect(result).rejects.toThrow("Capture failed after 3 attempts");
    await vi.runAllTimersAsync();
    await rejection;
    expect(captureVisibleTab).toHaveBeenCalledTimes(3);
  });

  it("captures planned positions and recaptures a blank slice once", async () => {
    const scrollToY = vi.fn(async (y: number) => y + 0.5);
    const sendSlice = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    const sendProgress = vi.fn();

    const result = captureSliceLoop(8, "session-8", 4, [0], scrollToY, sendSlice, sendProgress);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBeUndefined();

    expect(scrollToY).toHaveBeenCalledWith(0);
    expect(captureVisibleTab).toHaveBeenCalledTimes(2);
    expect(sendSlice).toHaveBeenNthCalledWith(1, "data:image/png;base64,valid", 0.5);
    expect(sendSlice).toHaveBeenNthCalledWith(2, "data:image/png;base64,valid", 0.5);
    expect(sendProgress).toHaveBeenCalledWith(1, 1);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(8, {
      type: "CAPTURE_PROGRESS",
      payload: { sessionId: "session-8", progress: { current: 0, total: 1, phase: "PREPARING" } },
    });
  });

  it("does not recapture a non-blank slice", async () => {
    const sendSlice = vi.fn().mockResolvedValue(false);
    const result = captureSliceLoop(8, "session-8", 4, [10, 20], async (y) => y, sendSlice, vi.fn());

    await vi.runAllTimersAsync();
    await expect(result).resolves.toBeUndefined();
    expect(captureVisibleTab).toHaveBeenCalledTimes(2);
    expect(sendSlice).toHaveBeenCalledTimes(2);
  });

  it("runs capture cleanup after success and failure", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    await expect(withCaptureCleanup(async () => "captured", cleanup)).resolves.toBe("captured");
    expect(cleanup).toHaveBeenCalledTimes(1);

    const failure = new Error("capture failed");
    await expect(withCaptureCleanup(async () => { throw failure; }, cleanup)).rejects.toBe(failure);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
