import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerContext } from "@content/handlers/types";

const mocks = vi.hoisted(() => ({
  addSlice: vi.fn(),
  finalize: vi.fn(),
  finalizeBestEffort: vi.fn(),
  start: vi.fn(),
  dispose: vi.fn(),
  crop: vi.fn(),
  loadBitmap: vi.fn(),
  preRoll: vi.fn(),
  waitVisual: vi.fn(),
  forceEager: vi.fn(),
  waitFonts: vi.fn(),
  freeSelect: vi.fn(),
  collectImages: vi.fn(),
  kickImages: vi.fn(),
}));

vi.mock("@content/capture/captureStitcher", () => ({
  DefaultCaptureStitcher: class {
    start(...args: unknown[]) { return mocks.start(...args); }
    addSlice(...args: unknown[]) { return mocks.addSlice(...args); }
    finalize(...args: unknown[]) { return mocks.finalize(...args); }
    finalizeBestEffort(...args: unknown[]) { return mocks.finalizeBestEffort(...args); }
    dispose(...args: unknown[]) { return mocks.dispose(...args); }
  },
}));

vi.mock("@content/capture/elementCapture", () => ({
  ELEMENT_EXPORT_SCALE: 2,
  cropDataUrlToPng: mocks.crop,
  loadBitmap: mocks.loadBitmap,
  sleep: vi.fn(async () => undefined),
}));

vi.mock("@content/capture/preload", () => ({
  forceEagerImages: mocks.forceEager,
  preRollForCapture: mocks.preRoll,
  waitForVisualAssets: mocks.waitVisual,
}));

vi.mock("@shared/utils/media", () => ({
  collectImages: mocks.collectImages,
  kickImages: mocks.kickImages,
  waitForFonts: mocks.waitFonts,
}));

vi.mock("@content/selection/freeSelect", () => ({ startFreeSelect: mocks.freeSelect }));

import { handleCaptureCommand } from "@content/handlers/captureHandler";

function command(type: string, payload: Record<string, unknown> = {}) {
  return { type, payload } as never;
}

function makeContext(): HandlerContext {
  return {
    session: null,
    overlay: { setVisible: vi.fn() } as never,
    cleanup: { stopInspecting: vi.fn(), selected: null } as never,
    stitcher: null,
    shortcuts: null,
    fixedHeaders: {
      reset: vi.fn(), detect: vi.fn(() => 2), hideAll: vi.fn(), restoreAll: vi.fn(),
    } as never,
    mutations: {} as never,
    freeze: {} as never,
    extraction: {} as never,
    elementCapture: { isolate: vi.fn(), restore: vi.fn() } as never,
    deleteSimilarPreviews: new Map(),
    deleteSimilarToken: null,
    broadcastState: vi.fn(),
    ensureRuntime: vi.fn(),
    dispatch: vi.fn(),
  };
}

const ledger = { restore: vi.fn(), setStyle: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 1200 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  mocks.forceEager.mockReturnValue(ledger);
  mocks.collectImages.mockReturnValue([]);
  mocks.preRoll.mockResolvedValue(undefined);
  mocks.waitVisual.mockResolvedValue(undefined);
  mocks.waitFonts.mockResolvedValue(undefined);
  mocks.addSlice.mockResolvedValue({ blank: false });
  mocks.finalize.mockResolvedValue("data:image/png;base64,stitched");
  mocks.finalizeBestEffort.mockResolvedValue({
    dataUrl: "data:image/png;base64,stitched",
    complete: true,
    capturedHeightCss: 1200,
    requestedHeightCss: 1200,
    gapCount: 0,
  });
  mocks.crop.mockResolvedValue("data:image/png;base64,cropped");
  mocks.loadBitmap.mockResolvedValue({ width: 100, height: 80, close: vi.fn() });
  (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe("capture command handler", () => {
  it("keeps worker-only capture local and prepares/restores the page", async () => {
    const ctx = makeContext();
    expect(await handleCaptureCommand(command("CAPTURE"), ctx)).toEqual(expect.objectContaining({ success: false }));
    await handleCaptureCommand(command("PREPARE_CAPTURE"), ctx);
    expect(ctx.cleanup?.stopInspecting).toHaveBeenCalled();
    expect(ctx.overlay?.setVisible).toHaveBeenCalledWith(false);
    await handleCaptureCommand(command("RESTORE_CAPTURE"), ctx);
    expect(ctx.overlay?.setVisible).toHaveBeenLastCalledWith(true);
    expect(ctx.fixedHeaders.restoreAll).toHaveBeenCalled();
  });

  it("rejects a missing or zero-area selected element and restores isolation", async () => {
    const ctx = makeContext();
    expect(await handleCaptureCommand(command("PREPARE_ELEMENT_CAPTURE", { elementId: "gone" }), ctx))
      .toEqual(expect.objectContaining({ success: false }));

    const el = document.createElement("article");
    el.id = "target";
    document.body.append(el);
    (ctx.cleanup as never as { selected: unknown }).selected = { id: "one", selector: "#target" };
    vi.mocked(ctx.elementCapture.isolate).mockReturnValue({
      dpr: 1, rect: { left: 0, top: 0, width: 0, height: 10 }, elementDocTop: 0,
      elementHeightCss: 10, viewportHeightCss: 600, viewportWidthCss: 1000, fullyVisible: false,
    });
    expect(await handleCaptureCommand(command("PREPARE_ELEMENT_CAPTURE", { elementId: "one" }), ctx))
      .toEqual(expect.objectContaining({ success: false }));
    expect(ctx.elementCapture.restore).toHaveBeenCalled();
  });

  it("starts native coordinate stitching without pre-roll for an offscreen element", async () => {
    const ctx = makeContext();
    const el = document.createElement("article");
    el.id = "target";
    el.getBoundingClientRect = () => ({ left: 5, top: 0, width: 200, height: 900, right: 205, bottom: 900, x: 5, y: 0, toJSON: () => ({}) });
    document.body.append(el);
    (ctx.cleanup as never as { selected: unknown }).selected = { id: "one", selector: "#target" };
    vi.mocked(ctx.elementCapture.isolate).mockReturnValue({
      dpr: 1, rect: { left: 5, top: 0, width: 200, height: 900 }, elementDocTop: 100,
      elementHeightCss: 900, viewportHeightCss: 600, viewportWidthCss: 1000, fullyVisible: false,
    });
    const result = await handleCaptureCommand(command("PREPARE_ELEMENT_CAPTURE", { elementId: "one" }), ctx);
    expect(result).toEqual(expect.objectContaining({ success: true, elementHeightCss: 900 }));
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledWith(900, 1, 100);
    expect(ctx.stitcher).not.toBeNull();
  });

  it("rejects an element that exceeds the canvas limit", async () => {
    const ctx = makeContext();
    const el = document.createElement("div");
    el.id = "target";
    document.body.append(el);
    (ctx.cleanup as never as { selected: unknown }).selected = { id: "one", selector: "#target" };
    vi.mocked(ctx.elementCapture.isolate).mockReturnValue({
      dpr: 2, rect: { left: 0, top: 0, width: 10, height: 20_000 }, elementDocTop: 0,
      elementHeightCss: 20_000, viewportHeightCss: 600, viewportWidthCss: 1000, fullyVisible: false,
    });
    expect(await handleCaptureCommand(command("PREPARE_ELEMENT_CAPTURE", { elementId: "one" }), ctx))
      .toEqual(expect.objectContaining({ success: false, tooTall: true }));
  });

  it("keeps a fully visible element on the one-frame path", async () => {
    const ctx = makeContext();
    const el = document.createElement("article");
    el.id = "target";
    document.body.append(el);
    (ctx.cleanup as never as { selected: unknown }).selected = { id: "one", selector: "#target" };
    vi.mocked(ctx.elementCapture.isolate).mockReturnValue({
      dpr: 2, rect: { left: 20, top: 30, width: 300, height: 200 }, elementDocTop: 30,
      elementHeightCss: 200, viewportHeightCss: 600, viewportWidthCss: 1000, fullyVisible: true,
    });

    const result = await handleCaptureCommand(command("PREPARE_ELEMENT_CAPTURE", { elementId: "one" }), ctx);

    expect(result).toEqual(expect.objectContaining({ success: true, fullyVisible: true }));
    expect(mocks.start).not.toHaveBeenCalled();
    expect(ctx.stitcher).toBeNull();
  });

  it("crops a fully visible element from one native viewport frame", async () => {
    const ctx = makeContext();
    const payload = {
      sessionId: "e", dataUrl: "png", dpr: 2,
      rect: { left: 5, top: 7, width: 20, height: 30 },
    };

    expect(await handleCaptureCommand(command("CAPTURE_ELEMENT_CROP", payload), ctx)).toEqual({ success: true });
    expect(mocks.crop).toHaveBeenCalledWith("png", { x: 10, y: 14, width: 40, height: 60 }, 2);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ "elementcapture:e": "data:image/png;base64,cropped" });
  });

  it("reports one-frame element crop and staging failures", async () => {
    const ctx = makeContext();
    const payload = {
      sessionId: "e", dataUrl: "png", dpr: 1,
      rect: { left: 5, top: 7, width: 20, height: 30 },
    };
    mocks.crop.mockRejectedValueOnce(new Error("decode failed"));
    expect(await handleCaptureCommand(command("CAPTURE_ELEMENT_CROP", payload), ctx))
      .toEqual({ success: false, error: "decode failed" });

    (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("quota"));
    expect(await handleCaptureCommand(command("CAPTURE_ELEMENT_CROP", payload), ctx))
      .toEqual(expect.objectContaining({ success: false, error: expect.stringContaining("quota") }));
  });

  it("handles element scroll, slice and restore commands", async () => {
    const ctx = makeContext();
    expect(await handleCaptureCommand(command("CAPTURE_ELEMENT_SCROLL", { scrollYCss: 42 }), ctx))
      .toEqual(expect.objectContaining({ success: true }));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 42);
    expect(await handleCaptureCommand(command("CAPTURE_ELEMENT_SLICE", { dataUrl: "x", scrollYCss: 0 }), ctx))
      .toEqual(expect.objectContaining({ success: false }));
    ctx.stitcher = { addSlice: mocks.addSlice, finalize: mocks.finalize, dispose: mocks.dispose, start: mocks.start };
    expect(await handleCaptureCommand(command("CAPTURE_ELEMENT_SLICE", { dataUrl: "x", scrollYCss: 10 }), ctx))
      .toEqual({ success: true, blank: false });
    mocks.addSlice.mockRejectedValueOnce(new Error("decode failed"));
    expect(await handleCaptureCommand(command("CAPTURE_ELEMENT_SLICE", { dataUrl: "x", scrollYCss: 10 }), ctx))
      .toEqual(expect.objectContaining({ success: false, error: "decode failed" }));
    await handleCaptureCommand(command("CAPTURE_ELEMENT_RESTORE"), ctx);
    expect(ctx.elementCapture.restore).toHaveBeenCalled();
  });

  it("finalizes, horizontally crops and stages element output", async () => {
    const ctx = makeContext();
    ctx.stitcher = { addSlice: mocks.addSlice, finalize: mocks.finalize, dispose: mocks.dispose, start: mocks.start };
    const result = await handleCaptureCommand(command("CAPTURE_ELEMENT_FINALIZE", {
      sessionId: "s", dpr: 2, rect: { left: 5, top: 0, width: 20, height: 40 },
    }), ctx);
    expect(result).toEqual({ success: true });
    expect(mocks.crop).toHaveBeenCalledWith(expect.any(String), { x: 10, y: 0, width: 40, height: 80 }, 2);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ "elementcapture:s": "data:image/png;base64,cropped" });
    expect(ctx.stitcher).toBeNull();
  });

  it("reports element finalization and staging failures and always disposes", async () => {
    const ctx = makeContext();
    ctx.stitcher = { addSlice: mocks.addSlice, finalize: mocks.finalize, dispose: mocks.dispose, start: mocks.start };
    (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("quota"));
    expect(await handleCaptureCommand(command("CAPTURE_ELEMENT_FINALIZE", {
      sessionId: "s", dpr: 1, rect: { left: 0, top: 0, width: 100, height: 80 },
    }), ctx)).toEqual(expect.objectContaining({ success: false, error: expect.stringContaining("quota") }));
    ctx.stitcher = { addSlice: mocks.addSlice, finalize: mocks.finalize, dispose: mocks.dispose, start: mocks.start };
    mocks.finalize.mockRejectedValueOnce(new Error("gap"));
    expect(await handleCaptureCommand(command("CAPTURE_ELEMENT_FINALIZE", {
      sessionId: "s", dpr: 1, rect: { left: 0, top: 0, width: 100, height: 80 },
    }), ctx)).toEqual(expect.objectContaining({ success: false, error: "gap" }));
    expect(mocks.dispose).toHaveBeenCalledTimes(2);
  });

  it("returns cancellation or a selected free region", async () => {
    const ctx = makeContext();
    mocks.freeSelect.mockResolvedValueOnce(null);
    expect(await handleCaptureCommand(command("FREE_SELECT"), ctx)).toEqual({ success: false, cancelled: true });
    mocks.freeSelect.mockResolvedValueOnce({ rect: { x: 1, y: 2, width: 3, height: 4 }, scrollY: 8, dpr: 2 });
    expect(await handleCaptureCommand(command("FREE_SELECT"), ctx)).toEqual(expect.objectContaining({ success: true, dpr: 2 }));
  });

  it("crops a region and reports crop or storage failures", async () => {
    const ctx = makeContext();
    const payload = { sessionId: "r", dataUrl: "png", rect: { x: -2, y: 3, width: 4, height: 5 }, dpr: 2 };
    expect(await handleCaptureCommand(command("CAPTURE_REGION_CROP", payload), ctx)).toEqual({ success: true });
    expect(mocks.crop).toHaveBeenCalledWith("png", { x: 0, y: 6, width: 8, height: 10 });
    (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("quota"));
    expect(await handleCaptureCommand(command("CAPTURE_REGION_CROP", payload), ctx))
      .toEqual(expect.objectContaining({ success: false, error: expect.stringContaining("quota") }));
    mocks.crop.mockRejectedValueOnce(new Error("bad image"));
    expect(await handleCaptureCommand(command("CAPTURE_REGION_CROP", payload), ctx))
      .toEqual(expect.objectContaining({ success: false, error: "bad image" }));
  });

  it("prepares and exactly restores region media patches", async () => {
    const ctx = makeContext();
    const wrapper = document.createElement("div");
    const image = document.createElement("img");
    wrapper.style.opacity = "0";
    wrapper.append(image);
    document.body.append(wrapper);
    const pendingImage = { complete: false, naturalWidth: 0 };
    mocks.collectImages.mockReturnValueOnce([pendingImage]);
    mocks.kickImages.mockImplementationOnce(() => {
      pendingImage.complete = true;
      pendingImage.naturalWidth = 100;
    });
    await handleCaptureCommand(command("PREPARE_REGION_CAPTURE"), ctx);
    expect(document.head.querySelector("style")).not.toBeNull();
    expect(mocks.forceEager).toHaveBeenCalledWith(document);
    await handleCaptureCommand(command("RESTORE_REGION_CAPTURE"), ctx);
    expect(document.head.querySelector("style")).toBeNull();
    expect(ledger.restore).toHaveBeenCalled();
  });

  it("starts full-page capture with measured coordinates and media readiness", async () => {
    const ctx = makeContext();
    const result = await handleCaptureCommand(command("CAPTURE_STITCH_START"), ctx);
    expect(result).toEqual(expect.objectContaining({
      success: true,
      metrics: expect.objectContaining({ pageHeightCss: 1200, viewportHeightCss: 600, dpr: 2, fixedHeaders: 2 }),
    }));
    expect(mocks.preRoll).toHaveBeenCalledWith(0);
    expect(mocks.waitVisual).toHaveBeenCalledWith(document);
    expect(mocks.start).toHaveBeenCalledWith(1200, 2, 0, 600);
    expect(document.head.querySelector("[data-parotia-full-page-capture]")).not.toBeNull();

    await handleCaptureCommand(command("RESTORE_CAPTURE"), ctx);
    expect(document.head.querySelector("[data-parotia-full-page-capture]")).toBeNull();
  });

  it("scrolls, hides fixed headers and handles full-page slices", async () => {
    const ctx = makeContext();
    expect(await handleCaptureCommand(command("CAPTURE_SCROLL", { scrollYCss: 400 }), ctx))
      .toEqual(expect.objectContaining({ success: true }));
    expect(ctx.fixedHeaders.hideAll).toHaveBeenCalled();
    expect(await handleCaptureCommand(command("CAPTURE_SLICE", { dataUrl: "png", scrollYCss: 0 }), ctx))
      .toEqual(expect.objectContaining({ success: false }));
    ctx.stitcher = { addSlice: mocks.addSlice, finalize: mocks.finalize, dispose: mocks.dispose, start: mocks.start };
    expect(await handleCaptureCommand(command("CAPTURE_SLICE", { dataUrl: "png", scrollYCss: 0 }), ctx))
      .toEqual({ success: true, blank: false });
  });

  it("stages full-page output and cleans up on success or failure", async () => {
    const ctx = makeContext();
    expect(await handleCaptureCommand(command("CAPTURE_FINALIZE", { sessionId: "none" }), ctx))
      .toEqual(expect.objectContaining({ success: false }));
    ctx.stitcher = { addSlice: mocks.addSlice, finalize: mocks.finalize, dispose: mocks.dispose, start: mocks.start };
    expect(await handleCaptureCommand(command("CAPTURE_FINALIZE", { sessionId: "full" }), ctx)).toEqual({
      success: true,
      partial: false,
      capturedHeightCss: 0,
      requestedHeightCss: 0,
      gapCount: 0,
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ "capture:full": "data:image/png;base64,stitched" });
    expect(ctx.fixedHeaders.restoreAll).toHaveBeenCalled();

    ctx.stitcher = { addSlice: mocks.addSlice, finalize: mocks.finalize, dispose: mocks.dispose, start: mocks.start };
    (chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("quota"));
    expect(await handleCaptureCommand(command("CAPTURE_FINALIZE", { sessionId: "full" }), ctx))
      .toEqual(expect.objectContaining({ success: false, error: expect.stringContaining("quota") }));
  });

  it("stages a clearly marked partial full-page fallback", async () => {
    const ctx = makeContext();
    mocks.finalizeBestEffort.mockResolvedValueOnce({
      dataUrl: "data:image/png;base64,partial",
      complete: false,
      capturedHeightCss: 4200,
      requestedHeightCss: 8088,
      gapCount: 1,
    });
    const stitcher = new (await import("@content/capture/captureStitcher")).DefaultCaptureStitcher();
    ctx.stitcher = stitcher;

    expect(await handleCaptureCommand(command("CAPTURE_FINALIZE", { sessionId: "partial" }), ctx)).toEqual({
      success: true,
      partial: true,
      capturedHeightCss: 4200,
      requestedHeightCss: 8088,
      gapCount: 1,
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      "capture:partial": "data:image/png;base64,partial",
    });
  });

  it("keeps SELECT_REGION worker-owned", async () => {
    expect(await handleCaptureCommand(command("SELECT_REGION"), makeContext()))
      .toEqual(expect.objectContaining({ success: false }));
  });
});
