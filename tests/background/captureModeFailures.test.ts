import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundCommand } from "@shared/types";
import { captureElement } from "@background/captureModes/elementCapture";
import { captureFullPage } from "@background/captureModes/fullPageCapture";
import { captureRegion } from "@background/captureModes/regionCapture";

type CaptureCommand = Extract<BackgroundCommand, { type: "CAPTURE" }>;

const captureVisibleTab = vi.fn();
const getZoom = vi.fn();
const setZoom = vi.fn();
Object.assign(chrome.tabs, { captureVisibleTab, getZoom, setZoom });

const tabsGet = chrome.tabs.get as unknown as ReturnType<typeof vi.fn>;
const sendMessage = chrome.tabs.sendMessage as unknown as ReturnType<typeof vi.fn>;
const local = chrome.storage.local as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};
const downloads = chrome.downloads.download as unknown as ReturnType<typeof vi.fn>;

function command(mode: CaptureCommand["payload"]["mode"], elementId?: string): CaptureCommand {
  return { type: "CAPTURE", payload: { sessionId: "session", mode, ...(elementId ? { elementId } : {}) } };
}

function pngHeader(width = 800, height = 600): string {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return `data:image/png;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}`;
}

async function expectTimedRejection(promise: Promise<unknown>, message: string): Promise<void> {
  const rejection = expect(promise).rejects.toThrow(message);
  await vi.runAllTimersAsync();
  await rejection;
}

describe("capture mode failure and restoration contracts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tabsGet.mockReset().mockResolvedValue({ id: 4, windowId: 9, title: "Test page" });
    sendMessage.mockReset().mockResolvedValue({ id: "", success: true, data: {} });
    captureVisibleTab.mockReset().mockResolvedValue("data:image/png;base64,viewport");
    getZoom.mockReset().mockResolvedValue(1);
    setZoom.mockReset().mockResolvedValue(undefined);
    local.get.mockReset().mockResolvedValue({});
    local.set.mockReset().mockResolvedValue(undefined);
    local.remove.mockReset().mockResolvedValue(undefined);
    downloads.mockReset().mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports element preparation details and tolerates restore failure", async () => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "PREPARE_ELEMENT_CAPTURE") {
        return { id: "", success: true, data: { success: false, error: "element detached" } };
      }
      if (message.type === "CAPTURE_ELEMENT_RESTORE") throw new Error("tab closed during restore");
      return { id: "", success: true, data: {} };
    });

    await expect(captureElement(4, command("ELEMENT", "element"))).rejects.toThrow(
      "Element capture failed [start]: Could not prepare the element for capture: element detached",
    );
  });

  it.each([
    [{ success: false, error: { message: "object detail" } }, "object detail"],
    [{ success: false }, "Could not prepare the element for capture"],
  ])("normalizes an element preparation response %#", async (data, expected) => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => (
      message.type === "PREPARE_ELEMENT_CAPTURE"
        ? { id: "", success: true, data }
        : { id: "", success: true, data: {} }
    ));

    await expect(captureElement(4, command("ELEMENT", "element"))).rejects.toThrow(expected);
  });

  it("uses safe element defaults and rejects a missing viewport measurement", async () => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => (
      message.type === "PREPARE_ELEMENT_CAPTURE"
        ? { id: "", success: true, data: {
            success: true,
            rect: { left: 0, top: 0, width: 500, height: 600 },
            elementHeightCss: 600,
          } }
        : { id: "", success: true, data: {} }
    ));

    await expect(captureElement(4, command("ELEMENT", "element"))).rejects.toThrow("Could not determine the viewport size");
  });

  it("rejects an element that exceeds the Canvas height limit", async () => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => (
      message.type === "PREPARE_ELEMENT_CAPTURE"
        ? { id: "", success: true, data: {
            success: true,
            rect: { left: 0, top: 0, width: 500, height: 40_000 },
            elementHeightCss: 40_000,
            viewportHeightCss: 1_000,
            dpr: 1,
          } }
        : { id: "", success: true, data: {} }
    ));

    await expect(captureElement(4, command("ELEMENT", "element"))).resolves.toEqual({
      success: false,
      error: expect.stringMatching(/too tall/),
    });
  });

  it.each([
    [{ id: "", success: true, data: { success: false, error: "slice gap" } }, "slice gap"],
    [{ id: "", success: false, error: { code: "FINALIZE", message: "outer element finalize error" } }, "outer element finalize error"],
    [undefined, "Failed to assemble the element image"],
  ])("normalizes an element stitching failure %#", async (finalizeResponse, expected) => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string; payload?: { scrollYCss?: number } }) => {
      switch (message.type) {
        case "PREPARE_ELEMENT_CAPTURE":
          return { id: "", success: true, data: {
            success: true,
            rect: { left: 0, top: 0, width: 500, height: 1_500 },
            elementHeightCss: 1_500,
            elementDocTop: 100,
            viewportHeightCss: 1_000,
            dpr: 1,
            fullyVisible: false,
          } };
        case "CAPTURE_ELEMENT_SCROLL":
          return { id: "", success: true, data: {} };
        case "CAPTURE_ELEMENT_SLICE":
          return { id: "", success: true, data: { blank: false } };
        case "CAPTURE_ELEMENT_FINALIZE":
          return finalizeResponse;
        default:
          return { id: "", success: true, data: {} };
      }
    });

    await expectTimedRejection(captureElement(4, command("ELEMENT", "element")), expected);
  });

  it.each([
    [{ id: "", success: false, error: { code: "CROP", message: "outer crop error" } }, "outer crop error"],
    [undefined, "Failed to crop the element image"],
  ])("normalizes a single-frame crop failure %#", async (cropResponse, expected) => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "PREPARE_ELEMENT_CAPTURE") return { id: "", success: true, data: {
        success: true,
        rect: { left: 0, top: 0, width: 500, height: 600 },
        elementHeightCss: 600,
        viewportHeightCss: 800,
        fullyVisible: true,
      } };
      if (message.type === "CAPTURE_ELEMENT_CROP") return cropResponse;
      return { id: "", success: true, data: {} };
    });

    await expect(captureElement(4, command("ELEMENT", "element"))).rejects.toThrow(expected);
  });

  it("normalizes a non-Error element runtime failure", async () => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "PREPARE_ELEMENT_CAPTURE") throw "element channel failed";
      return { id: "", success: true, data: {} };
    });

    await expect(captureElement(4, command("ELEMENT", "element"))).rejects.toThrow("element channel failed");
  });

  it("rejects a successful element crop whose staged image disappeared", async () => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "PREPARE_ELEMENT_CAPTURE") return { id: "", success: true, data: {
        success: true,
        rect: { left: 0, top: 0, width: 500, height: 600 },
        elementHeightCss: 600,
        viewportHeightCss: 800,
        dpr: 1,
        fullyVisible: true,
      } };
      if (message.type === "CAPTURE_ELEMENT_CROP") return { id: "", success: true, data: { success: true } };
      return { id: "", success: true, data: {} };
    });

    await expect(captureElement(4, command("ELEMENT", "element"))).rejects.toThrow("Element image missing from storage");
  });

  it("returns failed editor/download state with completed element steps", async () => {
    const image = pngHeader();
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "PREPARE_ELEMENT_CAPTURE") return { id: "", success: true, data: {
        success: true,
        rect: { left: 0, top: 0, width: 500, height: 600 },
        elementHeightCss: 600,
        viewportHeightCss: 800,
        dpr: 1,
        fullyVisible: true,
      } };
      if (message.type === "CAPTURE_ELEMENT_CROP") return { id: "", success: true, data: { success: true } };
      if (message.type === "OPEN_EDITOR") throw new Error("editor unavailable");
      return { id: "", success: true, data: {} };
    });
    local.get.mockImplementation(async (key: unknown) => key === "elementcapture:session"
      ? { "elementcapture:session": image }
      : {});
    downloads.mockRejectedValue(new Error("disk full"));

    const result = await captureElement(4, command("ELEMENT", "element"));
    expect(result).toEqual(expect.objectContaining({
      success: false,
      steps: ["captured current pixels in one frame"],
    }));
  });

  it("reports page-measurement failure even when the Zoom API is unavailable", async () => {
    getZoom.mockRejectedValue(new Error("zoom unavailable"));
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => (
      message.type === "CAPTURE_STITCH_START"
        ? { id: "", success: false, error: { code: "MEASURE", message: "document vanished" } }
        : { id: "", success: true, data: {} }
    ));

    await expect(captureFullPage(4, command("FULL_PAGE"))).rejects.toThrow("Could not measure the page: document vanished");
  });

  it.each([
    [{ id: "", success: true, data: { success: false, error: { message: "data measurement error" } } }, "data measurement error"],
    [{ id: "", success: true, data: { success: false, error: {} } }, "Could not measure the page"],
    [undefined, "no response from content script"],
  ])("normalizes a page measurement failure %#", async (startResponse, expected) => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => (
      message.type === "CAPTURE_STITCH_START" ? startResponse : { id: "", success: true, data: {} }
    ));

    await expect(captureFullPage(4, command("FULL_PAGE"))).rejects.toThrow(expected);
  });

  it("falls back to a clear limit result when zoom-out itself fails", async () => {
    setZoom.mockRejectedValue(new Error("zoom blocked"));
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => (
      message.type === "CAPTURE_STITCH_START"
        ? { id: "", success: true, data: { success: true, metrics: {
            pageHeightCss: 200_000,
            viewportHeightCss: 1_000,
            dpr: 1,
            scrollY: 0,
          } } }
        : { id: "", success: true, data: {} }
    ));

    await expect(captureFullPage(4, command("FULL_PAGE"))).resolves.toEqual(expect.objectContaining({
      success: false,
      error: expect.stringMatching(/too tall/),
    }));
  });

  it.each([
    ["finalize", "Failed to assemble the full-page image: stitch failed"],
    ["storage", "Full-page image missing from storage"],
  ])("rejects a full-page %s boundary failure", async (failure, expected) => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string; payload?: { scrollYCss?: number } }) => {
      switch (message.type) {
        case "CAPTURE_STITCH_START":
          return { id: "", success: true, data: { success: true, metrics: {
            pageHeightCss: 800, viewportHeightCss: 800, dpr: 1, scrollY: 0, fixedHeaders: 2,
          } } };
        case "CAPTURE_SCROLL":
          return { id: "", success: true, data: {} };
        case "CAPTURE_SLICE":
          return { id: "", success: true, data: { blank: false } };
        case "CAPTURE_FINALIZE":
          return failure === "finalize"
            ? { id: "", success: true, data: { success: false, error: { message: "stitch failed" } } }
            : { id: "", success: true, data: { success: true } };
        default:
          return { id: "", success: true, data: {} };
      }
    });

    await expectTimedRejection(captureFullPage(4, command("FULL_PAGE")), expected);
  });

  it.each([
    [{ id: "", success: false, error: { code: "FINALIZE", message: "outer finalize error" } }, "outer finalize error"],
    [undefined, "Failed to assemble the full-page image"],
  ])("normalizes a full-page finalize response %#", async (finalizeResponse, expected) => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      switch (message.type) {
        case "CAPTURE_STITCH_START":
          return { id: "", success: true, data: { success: true, metrics: {
            pageHeightCss: 800, viewportHeightCss: 800, dpr: 1, scrollY: 0,
          } } };
        case "CAPTURE_SCROLL":
          return { id: "", success: true, data: {} };
        case "CAPTURE_SLICE":
          return { id: "", success: true, data: { blank: false } };
        case "CAPTURE_FINALIZE":
          return finalizeResponse;
        default:
          return { id: "", success: true, data: {} };
      }
    });

    await expectTimedRejection(captureFullPage(4, command("FULL_PAGE")), expected);
  });

  it("normalizes a non-Error full-page runtime failure", async () => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "CAPTURE_STITCH_START") throw "full-page channel failed";
      return { id: "", success: true, data: {} };
    });

    await expect(captureFullPage(4, command("FULL_PAGE"))).rejects.toThrow("full-page channel failed");
  });

  it("returns failed editor/download state with completed full-page steps", async () => {
    const image = pngHeader();
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string; payload?: { scrollYCss?: number } }) => {
      switch (message.type) {
        case "CAPTURE_STITCH_START":
          return { id: "", success: true, data: { success: true, metrics: {
            pageHeightCss: 800, viewportHeightCss: 800, dpr: 1, scrollY: 0,
          } } };
        case "CAPTURE_SCROLL":
          return { id: "", success: true, data: { actualScrollY: message.payload?.scrollYCss } };
        case "CAPTURE_SLICE":
          return { id: "", success: true, data: { blank: false } };
        case "CAPTURE_FINALIZE":
          return { id: "", success: true, data: { success: true } };
        case "OPEN_EDITOR":
          throw new Error("editor unavailable");
        default:
          return { id: "", success: true, data: {} };
      }
    });
    local.get.mockImplementation(async (key: unknown) => key === "capture:session"
      ? { "capture:session": image }
      : {});
    downloads.mockRejectedValue(new Error("disk full"));

    const pending = captureFullPage(4, command("FULL_PAGE"));
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual(expect.objectContaining({
      success: false,
      steps: ["measured 800px", "captured 1 slices", "assembled"],
    }));
  });

  it("restores best-effort zoom after a successful limit-aware capture", async () => {
    let starts = 0;
    setZoom.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("restore blocked"));
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string; payload?: { scrollYCss?: number } }) => {
      switch (message.type) {
        case "CAPTURE_STITCH_START": {
          starts += 1;
          const pageHeightCss = starts === 1 ? 40_000 : 800;
          return { id: "", success: true, data: { success: true, metrics: {
            pageHeightCss, viewportHeightCss: 800, dpr: 1, scrollY: 0,
            ...(starts === 2 ? { fixedHeaders: 2 } : {}),
          } } };
        }
        case "CAPTURE_SCROLL":
          return { id: "", success: true, data: { actualScrollY: message.payload?.scrollYCss } };
        case "CAPTURE_SLICE":
          return { id: "", success: true, data: { blank: false } };
        case "CAPTURE_FINALIZE":
          return { id: "", success: true, data: { success: true } };
        default:
          return { id: "", success: true, data: {} };
      }
    });
    local.get.mockImplementation(async (key: unknown) => key === "capture:session"
      ? { "capture:session": pngHeader() }
      : {});

    const pending = captureFullPage(4, command("FULL_PAGE"));
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual(expect.objectContaining({ success: true }));
    expect(setZoom).toHaveBeenCalledTimes(2);
  });

  it("keeps region cancellation successful when region restoration fails", async () => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "FREE_SELECT") return { id: "", success: true, data: {} };
      if (message.type === "RESTORE_REGION_CAPTURE") throw new Error("tab closed");
      return { id: "", success: true, data: {} };
    });

    await expect(captureRegion(4, command("REGION"))).resolves.toEqual({
      success: false,
      error: "Selection cancelled",
    });
  });

  it("defaults region DPR and rejects a missing cropped image", async () => {
    sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "FREE_SELECT") return { id: "", success: true, data: {
        rect: { x: 10, y: 20, width: 300, height: 200 },
      } };
      return { id: "", success: true, data: {} };
    });
    local.get.mockResolvedValue({ "regioncapture:session": 42 });

    await expectTimedRejection(captureRegion(4, command("REGION")), "Region image missing from storage");
    expect(sendMessage).toHaveBeenCalledWith(4, expect.objectContaining({
      type: "CAPTURE_REGION_CROP",
      payload: expect.objectContaining({ dpr: 1 }),
    }));
  });
});
