import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundCommand } from "@shared/types";
import { captureByMode, clearCaptureForTab } from "@background/captureCoordinator";
import { captureVisibleArea } from "@background/captureModes/visibleCapture";
import { captureRegion } from "@background/captureModes/regionCapture";
import { captureElement } from "@background/captureModes/elementCapture";
import { captureFullPage } from "@background/captureModes/fullPageCapture";

type CaptureCommand = Extract<BackgroundCommand, { type: "CAPTURE" }>;

function capture(mode: CaptureCommand["payload"]["mode"], elementId?: string): CaptureCommand {
  return { type: "CAPTURE", payload: { sessionId: "session", mode, ...(elementId ? { elementId } : {}) } };
}

describe("background capture mode boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects every mode without a verified tab context", async () => {
    await expect(captureVisibleArea(undefined, capture("VISIBLE"))).rejects.toThrow("No tab context");
    await expect(captureRegion(undefined, capture("REGION"))).rejects.toThrow("No tab context");
    await expect(captureElement(undefined, capture("ELEMENT", "element"))).rejects.toThrow("No tab context");
    await expect(captureFullPage(undefined, capture("FULL_PAGE"))).rejects.toThrow("No tab context");
  });

  it("returns a clear element result before touching Chrome when selection is missing", async () => {
    await expect(captureElement(4, capture("ELEMENT"))).resolves.toEqual({
      success: false,
      error: "No element selected for capture",
    });
    expect(chrome.tabs.get).not.toHaveBeenCalled();
  });

  it("serializes captures per tab and releases the lock after failure", async () => {
    let rejectTab!: (error: Error) => void;
    (chrome.tabs.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((_resolve, reject) => {
      rejectTab = reject;
    }));

    const first = captureByMode(41, capture("VISIBLE"));
    const firstFailure = expect(first).rejects.toThrow("tab closed");
    await expect(captureByMode(41, capture("REGION"))).rejects.toThrow("already running");
    rejectTab(new Error("tab closed"));
    await firstFailure;

    (chrome.tabs.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("second attempt reached mode"));
    await expect(captureByMode(41, capture("VISIBLE"))).rejects.toThrow("second attempt reached mode");
  });

  it("can explicitly clear an abandoned tab lock", async () => {
    let rejectFirst!: (error: Error) => void;
    (chrome.tabs.get as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectFirst = reject;
    }));
    const first = captureByMode(42, capture("VISIBLE"));
    const firstFailure = expect(first).rejects.toThrow("old capture ended");

    clearCaptureForTab(42);
    (chrome.tabs.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("new capture started"));
    await expect(captureByMode(42, capture("VISIBLE"))).rejects.toThrow("new capture started");
    rejectFirst(new Error("old capture ended"));
    await firstFailure;
  });
});
