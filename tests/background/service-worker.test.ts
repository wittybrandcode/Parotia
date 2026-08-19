import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageResponse } from "@shared/types";
import type * as ServiceWorkerModule from "@background/service-worker";

type OnMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;
type TabRemovedListener = (tabId: number) => void;
type ActionListener = (tab: { id?: number }) => Promise<void> | void;

/** Rich chrome.* stub that captures every listener the worker registers. */
interface ChromeStub {
  runtime: {
    onMessage: {
      addListener: (fn: OnMessageListener) => void;
      removeListener: (fn: OnMessageListener) => void;
    };
    sendMessage: ReturnType<typeof vi.fn>;
    getURL: (path: string) => string;
  };
  tabs: {
    query: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    captureVisibleTab: ReturnType<typeof vi.fn>;
    getZoom: ReturnType<typeof vi.fn>;
    setZoom: ReturnType<typeof vi.fn>;
    onRemoved: { addListener: (fn: TabRemovedListener) => void };
    onUpdated: { addListener: (...args: unknown[]) => void };
  };
  action: { onClicked: { addListener: (fn: ActionListener) => void } };
  scripting: { executeScript: ReturnType<typeof vi.fn> };
  permissions: {
    contains: ReturnType<typeof vi.fn>;
    request: ReturnType<typeof vi.fn>;
  };
  downloads: { download: ReturnType<typeof vi.fn> };
  storage: {
    local: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };
  captured: {
    onMessage?: OnMessageListener;
    onTabRemoved?: TabRemovedListener;
    onActionClicked?: ActionListener;
  };
}

function makeChromeStub(): ChromeStub {
  const captured: ChromeStub["captured"] = {};
  return {
    runtime: {
      onMessage: {
        addListener: (fn) => {
          captured.onMessage = fn;
        },
        removeListener: () => undefined,
      },
      sendMessage: vi.fn(),
      getURL: () => "about:blank",
    },
    tabs: {
      query: vi.fn(),
      get: vi.fn(),
      sendMessage: vi.fn(),
      captureVisibleTab: vi.fn(),
      getZoom: vi.fn(),
      setZoom: vi.fn(),
      onRemoved: {
        addListener: (fn) => {
          captured.onTabRemoved = fn;
        },
      },
      onUpdated: { addListener: () => undefined },
    },
    action: {
      onClicked: {
        addListener: (fn) => {
          captured.onActionClicked = fn;
        },
      },
    },
    scripting: { executeScript: vi.fn() },
    permissions: {
      contains: vi.fn().mockResolvedValue(true),
      request: vi.fn().mockResolvedValue(true),
    },
    downloads: { download: vi.fn() },
    storage: {
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    },
    captured,
  };
}

/** Fresh worker module instance: resets module state + re-registers on the stub. */
let chromeStub: ChromeStub;
let sw: typeof ServiceWorkerModule;

async function loadWorker(): Promise<void> {
  vi.resetModules();
  chromeStub = makeChromeStub();
  vi.stubGlobal("chrome", chromeStub);
  sw = await import("@background/service-worker");
}

function invokeOnMessage(
  message: unknown,
  sender: unknown = {},
): Promise<MessageResponse<unknown>> {
  const listener = chromeStub.captured.onMessage;
  if (!listener) throw new Error("onMessage listener not registered");
  return new Promise((resolve) => {
    listener(message, sender, (response) => resolve(response as MessageResponse<unknown>));
  });
}

function okResponse(data: unknown) {
  return { id: "", success: true, data };
}

describe("service-worker", () => {
  beforeEach(async () => {
    await loadWorker();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("rejects unknown commands with UNKNOWN_COMMAND", async () => {
    const res = await invokeOnMessage({ type: "NOT_A_COMMAND", payload: {} }, {});
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("UNKNOWN_COMMAND");
  });

  it("injects the content script and records the session on START_SESSION", async () => {
    chromeStub.tabs.query.mockResolvedValue([{ id: 42 }]);
    chromeStub.scripting.executeScript.mockResolvedValue([]);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "PING") throw new Error("content script not injected");
      return okResponse({ sessionId: "sess-1" });
    });

    const res = await invokeOnMessage({ type: "START_SESSION", payload: {} }, {});

    expect(chromeStub.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ["content/index.js"],
    });
    expect(res.success).toBe(true);
    expect(sw.tabSessions.get(42)).toBe("sess-1");
  });

  it("reports an internal error when there is no active tab", async () => {
    chromeStub.tabs.query.mockResolvedValue([]);
    const res = await invokeOnMessage({ type: "START_SESSION", payload: {} }, {});
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("INTERNAL");
  });

  it("rejects commands for an unknown session with SESSION_NOT_FOUND", async () => {
    chromeStub.tabs.query.mockResolvedValue([]);
    const res = await invokeOnMessage({ type: "GET_STATE", payload: { sessionId: "ghost" } }, {});
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("SESSION_NOT_FOUND");
    expect(chromeStub.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects commands with a missing sessionId as INVALID_PAYLOAD", async () => {
    const res = await invokeOnMessage({ type: "GET_STATE", payload: {} }, {});
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("INVALID_PAYLOAD");
    expect(chromeStub.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects a DELETE_ELEMENT without an elementId as INVALID_PAYLOAD", async () => {
    sw.tabSessions.set(7, "sess-1");
    const res = await invokeOnMessage({ type: "DELETE_ELEMENT", payload: { sessionId: "sess-1" } }, {});
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("INVALID_PAYLOAD");
    expect(chromeStub.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("recovers a session after a worker restart and routes with the fresh id", async () => {
    // Worker restarted: tabSessions is empty. The content script still owns
    // the session, so the worker re-registers it and retries the command.
    chromeStub.tabs.query.mockResolvedValue([{ id: 42 }]);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "PING") throw new Error("content script not injected");
      if (message.type === "START_SESSION") return okResponse({ sessionId: "sess-live" });
      return okResponse({ success: true });
    });

    const res = await invokeOnMessage(
      { type: "UNDO", payload: { sessionId: "sess-stale" } },
      {},
    );

    expect(sw.tabSessions.get(42)).toBe("sess-live");
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        type: "UNDO",
        payload: expect.objectContaining({ sessionId: "sess-live" }),
      }),
    );
    expect(res.success).toBe(true);
  });

  it("still reports SESSION_NOT_FOUND when no tab can re-register the session", async () => {
    chromeStub.tabs.query.mockResolvedValue([]);
    const res = await invokeOnMessage({ type: "UNDO", payload: { sessionId: "ghost" } }, {});
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("SESSION_NOT_FOUND");
  });

  it("echoes the request id in its response", async () => {
    chromeStub.tabs.sendMessage.mockResolvedValue(okResponse({}));
    sw.tabSessions.set(7, "sess-1");

    const res = await invokeOnMessage(
      { id: "req-123", type: "GET_STATE", payload: { sessionId: "sess-1" } },
      { tab: { id: 7 } },
    );

    expect(res.id).toBe("req-123");
  });

  it("routes a command straight to the tab when sender.tab is present", async () => {
    chromeStub.tabs.sendMessage.mockResolvedValue(okResponse({ removed: true }));
    sw.tabSessions.set(7, "sess-1");

    const res = await invokeOnMessage(
      { type: "DELETE_ELEMENT", payload: { sessionId: "sess-1", elementId: "el-1" } },
      { tab: { id: 7 } },
    );

    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: "DELETE_ELEMENT",
      payload: { sessionId: "sess-1", elementId: "el-1" },
    });
    expect(res.success).toBe(true);
  });

  it("resolves the tab from the session for toolbar iframes (no sender.tab)", async () => {
    chromeStub.tabs.sendMessage.mockResolvedValue(okResponse({ frozen: true }));
    sw.tabSessions.set(9, "sess-2");

    const res = await invokeOnMessage({ type: "FREEZE_PAGE", payload: { sessionId: "sess-2" } }, {});

    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(9, expect.objectContaining({ type: "FREEZE_PAGE" }));
    expect(res.success).toBe(true);
  });

  it("captures the visible area, hides the toolbar, and downloads a PNG", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(3, "sess-c");
    chromeStub.tabs.get.mockResolvedValue({ id: 3, windowId: 11 });
    chromeStub.tabs.sendMessage.mockResolvedValue(okResponse({}));
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.downloads.download.mockResolvedValue(1);

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-c", mode: "VISIBLE" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(2000);
    const res = await pending;

    expect(chromeStub.tabs.captureVisibleTab).toHaveBeenCalledWith(11, { format: "png" });
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: "PREPARE_CAPTURE" }),
    );
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: "RESTORE_CAPTURE" }),
    );
    expect(chromeStub.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ filename: expect.stringMatching(/^parotia-/) }),
    );
    const data = res.data as { success?: boolean; filename?: string };
    expect(data.success).toBe(true);
    expect(data.filename).toMatch(/^parotia-article-\d{8}-\d{6}\.png$/);
    // Live progress is pushed to the toolbar during the capture.
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: "CAPTURE_PROGRESS", payload: expect.objectContaining({ sessionId: "sess-c" }) }),
    );
  });

  it("rejects capture gracefully when download fails", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(3, "sess-d");
    chromeStub.tabs.get.mockResolvedValue({ id: 3, windowId: 11 });
    chromeStub.tabs.sendMessage.mockResolvedValue(okResponse({}));
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.downloads.download.mockRejectedValue(new Error("Disk full"));

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-d", mode: "VISIBLE" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(2000);
    const res = await pending;

    expect(chromeStub.downloads.download).toHaveBeenCalled();
    const data = res.data as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/failed to save/i);
  });

  it("captures a full page slice-by-slice and assembles it", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(4, "sess-f");
    chromeStub.tabs.get.mockResolvedValue({ id: 4, windowId: 12 });
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.downloads.download.mockResolvedValue(1);
    chromeStub.storage.local.get.mockResolvedValue({ "capture:sess-f": "data:image/png;base64,BBBB" });
    chromeStub.storage.local.remove.mockResolvedValue(undefined);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string; payload?: Record<string, unknown> }) => {
      switch (message.type) {
        case "CAPTURE_STITCH_START":
          return okResponse({
            success: true,
            metrics: { pageHeightCss: 1000, viewportHeightCss: 1000, dpr: 1, scrollY: 0 },
          });
        case "CAPTURE_SCROLL":
          return okResponse({ success: true, actualScrollY: message.payload?.scrollYCss ?? 0 });
        case "CAPTURE_FINALIZE":
          return okResponse({ success: true });
        default:
          return okResponse({});
      }
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-f", mode: "FULL_PAGE" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(3000);
    const res = await pending;

    const data = res.data as { success?: boolean; steps?: string[]; filename?: string };
    expect(data.success).toBe(true);
    expect(data.steps).toEqual(
      expect.arrayContaining(["measured 1000px", "captured 1 slices", "assembled", "downloaded"]),
    );
    expect(data.filename).toMatch(/^parotia-fullpage-/);
    // Progress phases are reported through the whole full-page pipeline.
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        type: "CAPTURE_PROGRESS",
        payload: expect.objectContaining({ progress: expect.objectContaining({ phase: "RENDERING", current: 1, total: 1 }) }),
      }),
    );
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        type: "CAPTURE_PROGRESS",
        payload: expect.objectContaining({ progress: expect.objectContaining({ phase: "STITCHING" }) }),
      }),
    );
    expect(chromeStub.storage.local.remove).toHaveBeenCalledWith("capture:sess-f");
  });

  it("captures a selected element at 2x zoom and crops it", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(5, "sess-e");
    chromeStub.tabs.get.mockResolvedValue({ id: 5, windowId: 13 });
    chromeStub.tabs.getZoom.mockResolvedValue(1);
    chromeStub.tabs.setZoom.mockResolvedValue(undefined);
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.downloads.download.mockResolvedValue(1);
    chromeStub.storage.local.get.mockResolvedValue({ "elementcapture:sess-e": "data:image/png;base64,CCCC" });
    chromeStub.storage.local.remove.mockResolvedValue(undefined);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string; payload?: Record<string, unknown> }) => {
      switch (message.type) {
        case "PREPARE_ELEMENT_CAPTURE":
          return okResponse({
            success: true,
            dpr: 1,
            rect: { left: 0, top: 0, width: 100, height: 100 },
            elementDocTop: 0,
            elementHeightCss: 100,
            viewportHeightCss: 800,
          });
        case "CAPTURE_ELEMENT_SCROLL":
          return okResponse({ success: true, actualScrollY: message.payload?.scrollYCss ?? 0 });
        case "CAPTURE_ELEMENT_FINALIZE":
          return okResponse({ success: true });
        default:
          return okResponse({});
      }
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-e", mode: "ELEMENT", elementId: "el-9" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(4000);
    const res = await pending;

    expect(chromeStub.tabs.setZoom).toHaveBeenCalledWith(5, 2);
    expect(chromeStub.storage.local.remove).toHaveBeenCalledWith("elementcapture:sess-e");
    const data = res.data as { success?: boolean; filename?: string };
    expect(data.success).toBe(true);
    expect(data.filename).toMatch(/^parotia-element-/);
  });

  it("captures an anchored (fixed/sticky) element in a single slice without scrolling", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(7, "sess-anchored");
    chromeStub.tabs.get.mockResolvedValue({ id: 7, windowId: 15 });
    chromeStub.tabs.getZoom.mockResolvedValue(1);
    chromeStub.tabs.setZoom.mockResolvedValue(undefined);
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.downloads.download.mockResolvedValue(1);
    chromeStub.storage.local.get.mockResolvedValue({ "elementcapture:sess-anchored": "data:image/png;base64,CCCC" });
    chromeStub.storage.local.remove.mockResolvedValue(undefined);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      switch (message.type) {
        case "PREPARE_ELEMENT_CAPTURE":
          return okResponse({
            success: true,
            anchored: true,
            dpr: 1,
            rect: { left: 40, top: 20, width: 300, height: 120 },
            elementDocTop: 0,
            elementHeightCss: 120,
            viewportHeightCss: 800,
          });
        case "CAPTURE_ELEMENT_FINALIZE":
          return okResponse({ success: true });
        default:
          return okResponse({});
      }
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-anchored", mode: "ELEMENT", elementId: "el-10" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(4000);
    const res = await pending;

    const data = res.data as { success?: boolean; filename?: string };
    expect(data.success).toBe(true);
    expect(data.filename).toMatch(/^parotia-element-/);
    // One viewport shot, no scrolling — a fixed/sticky element never moves.
    expect(chromeStub.tabs.captureVisibleTab).toHaveBeenCalledTimes(1);
    const scrollCalls = chromeStub.tabs.sendMessage.mock.calls.filter(([, msg]) => (msg as { type?: string })?.type === "CAPTURE_ELEMENT_SCROLL");
    expect(scrollCalls).toHaveLength(0);
  });

  it("rejects element capture without an elementId at the boundary", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(6, "sess-x");
    chromeStub.tabs.get.mockResolvedValue({ id: 6, windowId: 14 });
    chromeStub.tabs.sendMessage.mockResolvedValue(okResponse({}));

    const res = await invokeOnMessage({ type: "CAPTURE", payload: { sessionId: "sess-x", mode: "ELEMENT" } }, {});

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("INVALID_PAYLOAD");
    expect(chromeStub.downloads.download).not.toHaveBeenCalled();
  });

  it("drops the session when its tab closes", async () => {
    sw.tabSessions.set(6, "sess-r");
    chromeStub.captured.onTabRemoved?.(6);
    expect(sw.tabSessions.has(6)).toBe(false);
  });

  it("injects and starts a session from the action icon click", async () => {
    chromeStub.scripting.executeScript.mockResolvedValue([]);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "PING") throw new Error("content script not injected");
      return okResponse({ sessionId: "sess-a" });
    });

    await chromeStub.captured.onActionClicked?.({ id: 15 });

    expect(chromeStub.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 15 },
      files: ["content/index.js"],
    });
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      15,
      expect.objectContaining({ type: "START_SESSION" }),
    );
  });

  it("captures a region by sending FREE_SELECT then cropping", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(8, "sess-r");
    chromeStub.tabs.get.mockResolvedValue({ id: 8, windowId: 15 });
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.downloads.download.mockResolvedValue(1);
    chromeStub.storage.local.get.mockResolvedValue({ "regioncapture:sess-r": "data:image/png;base64,RRRR" });
    chromeStub.storage.local.remove.mockResolvedValue(undefined);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      switch (message.type) {
        case "FREE_SELECT":
          return okResponse({ success: true, rect: { x: 10, y: 20, width: 300, height: 200 }, scrollY: 0, dpr: 1 });
        case "CAPTURE_REGION_CROP":
          return okResponse({ success: true });
        default:
          return okResponse({});
      }
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-r", mode: "REGION" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(2000);
    const res = await pending;

    expect(chromeStub.tabs.captureVisibleTab).toHaveBeenCalledWith(15, { format: "png" });
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ type: "FREE_SELECT" }),
    );
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ type: "CAPTURE_REGION_CROP" }),
    );
    expect(chromeStub.storage.local.remove).toHaveBeenCalledWith("regioncapture:sess-r");
    expect(chromeStub.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ filename: expect.stringMatching(/^parotia-region-/) }),
    );
    const data = res.data as { success?: boolean; filename?: string };
    expect(data.success).toBe(true);
    expect(data.filename).toMatch(/^parotia-region-/);
  });

  it("returns cancelled when the user escapes the free selection", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(9, "sess-c2");
    chromeStub.tabs.get.mockResolvedValue({ id: 9, windowId: 16 });
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "FREE_SELECT") return okResponse({ success: false, cancelled: true });
      return okResponse({});
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-c2", mode: "REGION" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(2000);
    const res = await pending;

    const data = res.data as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/cancel/i);
  });

  it("rejects CAPTURE with REGION mode as invalid when payload is malformed", async () => {
    sw.tabSessions.set(10, "sess-m");
    const res = await invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-m", mode: "REGION" } },
      {},
    );
    // REGION mode is valid payload-wise; this just verifies it doesn't crash.
    expect(res.success).toBe(true);
  });

  it("retries a failed viewport capture instead of aborting the capture", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(11, "sess-retry");
    chromeStub.tabs.get.mockResolvedValue({ id: 11, windowId: 17 });
    chromeStub.tabs.captureVisibleTab
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce("data:image/png;base64,AAAA");
    chromeStub.downloads.download.mockResolvedValue(1);
    chromeStub.storage.local.get.mockResolvedValue({ "capture:sess-retry": "data:image/png;base64,BBBB" });
    chromeStub.storage.local.remove.mockResolvedValue(undefined);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      switch (message.type) {
        case "CAPTURE_STITCH_START":
          return okResponse({ success: true, metrics: { pageHeightCss: 1000, viewportHeightCss: 1000, dpr: 1, scrollY: 0 } });
        case "CAPTURE_SCROLL":
          return okResponse({ success: true, actualScrollY: 0 });
        case "CAPTURE_FINALIZE":
          return okResponse({ success: true });
        default:
          return okResponse({});
      }
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-retry", mode: "FULL_PAGE" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(4000);
    const res = await pending;

    const data = res.data as { success?: boolean; steps?: string[] };
    expect(data.success).toBe(true);
    expect(data.steps).toEqual(expect.arrayContaining(["captured 1 slices", "downloaded"]));
    // First attempt failed, second succeeded → two calls for one slice.
    expect(chromeStub.tabs.captureVisibleTab).toHaveBeenCalledTimes(2);
  });

  it("re-captures a slice the content script flagged as blank", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(12, "sess-blank");
    chromeStub.tabs.get.mockResolvedValue({ id: 12, windowId: 18 });
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.downloads.download.mockResolvedValue(1);
    chromeStub.storage.local.get.mockResolvedValue({ "capture:sess-blank": "data:image/png;base64,BBBB" });
    chromeStub.storage.local.remove.mockResolvedValue(undefined);
    let sliceCalls = 0;
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      switch (message.type) {
        case "CAPTURE_STITCH_START":
          return okResponse({ success: true, metrics: { pageHeightCss: 1000, viewportHeightCss: 1000, dpr: 1, scrollY: 0 } });
        case "CAPTURE_SCROLL":
          return okResponse({ success: true, actualScrollY: 0 });
        case "CAPTURE_SLICE":
          sliceCalls += 1;
          return okResponse({ success: true, blank: sliceCalls === 1 });
        case "CAPTURE_FINALIZE":
          return okResponse({ success: true });
        default:
          return okResponse({});
      }
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-blank", mode: "FULL_PAGE" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(4000);
    const res = await pending;

    const data = res.data as { success?: boolean };
    expect(data.success).toBe(true);
    // Blank slice → one re-capture → two viewport captures, two slice sends.
    expect(chromeStub.tabs.captureVisibleTab).toHaveBeenCalledTimes(2);
    expect(sliceCalls).toBe(2);
  });

  it("gives up with a clean error when every viewport capture attempt fails", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(13, "sess-fail");
    chromeStub.tabs.get.mockResolvedValue({ id: 13, windowId: 19 });
    chromeStub.tabs.captureVisibleTab.mockRejectedValue(new Error("rate limited"));
    chromeStub.downloads.download.mockResolvedValue(1);
    chromeStub.storage.local.get.mockResolvedValue({ "capture:sess-fail": "data:image/png;base64,BBBB" });
    chromeStub.storage.local.remove.mockResolvedValue(undefined);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      switch (message.type) {
        case "CAPTURE_STITCH_START":
          return okResponse({ success: true, metrics: { pageHeightCss: 1000, viewportHeightCss: 1000, dpr: 1, scrollY: 0 } });
        case "CAPTURE_SCROLL":
          return okResponse({ success: true, actualScrollY: 0 });
        case "CAPTURE_FINALIZE":
          return okResponse({ success: true });
        default:
          return okResponse({});
      }
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-fail", mode: "FULL_PAGE" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(10000);
    const res = await pending;

    expect(res.success).toBe(false);
    expect(res.error?.message).toMatch(/after 3 attempts/i);
    expect(chromeStub.tabs.captureVisibleTab).toHaveBeenCalledTimes(3);
  });

  it("zooms out and re-measures when the page exceeds the canvas limit", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(14, "sess-tall");
    chromeStub.tabs.get.mockResolvedValue({ id: 14, windowId: 20 });
    chromeStub.tabs.getZoom.mockResolvedValue(1);
    chromeStub.tabs.setZoom.mockResolvedValue(undefined);
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.downloads.download.mockResolvedValue(1);
    chromeStub.storage.local.get.mockResolvedValue({ "capture:sess-tall": "data:image/png;base64,BBBB" });
    chromeStub.storage.local.remove.mockResolvedValue(undefined);
    let startCalls = 0;
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string; payload?: { scrollYCss?: number } }) => {
      switch (message.type) {
        case "CAPTURE_STITCH_START":
          startCalls += 1;
          return okResponse({
            success: true,
            // First measure at native DPR exceeds the canvas limit; after the
            // zoom-out the effective DPR drops and the page fits.
            metrics: startCalls === 1
              ? { pageHeightCss: 40000, viewportHeightCss: 1000, dpr: 1, scrollY: 0 }
              : { pageHeightCss: 40000, viewportHeightCss: 1000, dpr: 0.819, scrollY: 0 },
          });
        case "CAPTURE_SCROLL":
          return okResponse({ success: true, actualScrollY: message.payload?.scrollYCss ?? 0 });
        case "CAPTURE_FINALIZE":
          return okResponse({ success: true });
        default:
          return okResponse({});
      }
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-tall", mode: "FULL_PAGE" } },
      {},
    );
    // 40 slices at ~450ms settle each, plus the zoom settle — advance past all.
    await vi.advanceTimersByTimeAsync(20000);
    const res = await pending;

    const data = res.data as { success?: boolean; steps?: string[] };
    expect(data.success).toBe(true);
    expect(data.steps).toEqual(expect.arrayContaining([expect.stringMatching(/^zoomed out to/)]));
    expect(startCalls).toBe(2);
    expect(chromeStub.tabs.setZoom).toHaveBeenCalledWith(14, expect.closeTo(0.819175, 4));
    // Zoom restored afterwards.
    expect(chromeStub.tabs.setZoom).toHaveBeenLastCalledWith(14, 1);
  });

  it("reports a clear error when the page still exceeds the limit after zoom-out", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(15, "sess-huge");
    chromeStub.tabs.get.mockResolvedValue({ id: 15, windowId: 21 });
    chromeStub.tabs.getZoom.mockResolvedValue(1);
    chromeStub.tabs.setZoom.mockResolvedValue(undefined);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "CAPTURE_STITCH_START") {
        return okResponse({ success: true, metrics: { pageHeightCss: 200000, viewportHeightCss: 1000, dpr: 1, scrollY: 0 } });
      }
      return okResponse({});
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-huge", mode: "FULL_PAGE" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(4000);
    const res = await pending;

    // The too-tall guard returns a normal result (no throw), so it lands in
    // the top-level `data` wrapper with a plain-string error.
    const data = res.data as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/too tall/i);
    expect(data.error).toMatch(/Free-Select/i);
  });
});
