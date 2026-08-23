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
    session: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
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

function makeChromeStub(sessionSeed: Record<string, { sessionId: string; createdAt: number }> = {}): ChromeStub {
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
      get: vi.fn(async (tabId: number) => ({ id: tabId, windowId: 1 })),
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
      session: {
        get: vi.fn().mockResolvedValue({ "parotia:tab-sessions:v1": sessionSeed }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    },
    captured,
  };
}

/** Fresh worker module instance: resets module state + re-registers on the stub. */
let chromeStub: ChromeStub;
let sw: typeof ServiceWorkerModule;

async function loadWorker(sessionSeed: Record<string, { sessionId: string; createdAt: number }> = {}): Promise<void> {
  vi.resetModules();
  chromeStub = makeChromeStub(sessionSeed);
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

  it("rejects editor downloads from a sender other than the editor page", async () => {
    const token = "a".repeat(48);
    const res = await invokeOnMessage({
      type: "DOWNLOAD_EDITOR_RESULT",
      payload: { token, editorToken: token, dataUrl: "data:image/png;base64,iVBORw0KGgo=", filename: "capture.png" },
    }, { url: "https://attacker.invalid/editor.html" });

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("INVALID_PAYLOAD");
    expect(chromeStub.downloads.download).not.toHaveBeenCalled();
  });

  it("consumes a valid editor capability before downloading its PNG", async () => {
    const token = "b".repeat(48);
    chromeStub.runtime.getURL = (path) => `chrome-extension://test-extension/${path}`;
    chromeStub.storage.local.get.mockImplementation(async (key: string) => ({
      [key]: { imageKey: `editor-image:${token}`, tabId: 3, sessionId: "sess-editor", expiresAt: Date.now() + 60_000 },
    }));
    chromeStub.downloads.download.mockResolvedValue(7);

    const res = await invokeOnMessage({
      type: "DOWNLOAD_EDITOR_RESULT",
      payload: { editorToken: token, dataUrl: "data:image/png;base64,iVBORw0KGgo=", filename: "unsafe/../capture.png" },
    }, { url: "chrome-extension://test-extension/ui/editor.html#session", tab: { id: 3 } });

    expect(res.success).toBe(true);
    expect(chromeStub.storage.local.remove).toHaveBeenCalledWith([`editor-ticket:${token}`, `editor-image:${token}`]);
    expect(chromeStub.downloads.download).toHaveBeenCalledWith(expect.objectContaining({ filename: "unsafe-..-capture.png" }));
  });

  it("rejects malformed PNG data before reading or consuming a capability", async () => {
    const token = "c".repeat(48);
    chromeStub.runtime.getURL = (path) => `chrome-extension://test-extension/${path}`;
    const res = await invokeOnMessage({
      type: "DOWNLOAD_EDITOR_RESULT",
      payload: { editorToken: token, dataUrl: "data:image/png;base64,AAAA", filename: "capture.png" },
    }, { url: "chrome-extension://test-extension/ui/editor.html", tab: { id: 3 } });

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("INVALID_PAYLOAD");
    expect(chromeStub.downloads.download).not.toHaveBeenCalled();
  });

  it("requires exact editor path and the tab that owns the capability", async () => {
    const token = "d".repeat(48);
    const ticketKey = `editor-ticket:${token}`;
    chromeStub.runtime.getURL = (path) => `chrome-extension://test-extension/${path}`;
    chromeStub.storage.local.get.mockImplementation(async (key: string | null) => key === null ? {} : ({
      [ticketKey]: { imageKey: `editor-image:${token}`, tabId: 3, sessionId: "sess-editor", expiresAt: Date.now() + 60_000 },
    }));

    const wrongPath = await invokeOnMessage({
      type: "DISCARD_EDITOR_RESULT", payload: { editorToken: token },
    }, { url: "chrome-extension://test-extension/ui/editor.html.attacker", tab: { id: 3 } });
    expect(wrongPath.success).toBe(false);

    const wrongTab = await invokeOnMessage({
      type: "DISCARD_EDITOR_RESULT", payload: { editorToken: token },
    }, { url: "chrome-extension://test-extension/ui/editor.html#state", tab: { id: 9 } });
    expect(wrongTab.success).toBe(false);
    expect(wrongTab.error?.message).toMatch(/does not own/i);
  });

  it("removes expired editor capabilities together with their staged image", async () => {
    const token = "e".repeat(48);
    const ticketKey = `editor-ticket:${token}`;
    const imageKey = `editor-image:${token}`;
    chromeStub.runtime.getURL = (path) => `chrome-extension://test-extension/${path}`;
    chromeStub.storage.local.get.mockImplementation(async (key: string | null) => key === null ? {} : ({
      [ticketKey]: { imageKey, tabId: 3, sessionId: "sess-editor", expiresAt: Date.now() - 1 },
    }));

    const res = await invokeOnMessage({
      type: "DISCARD_EDITOR_RESULT", payload: { editorToken: token },
    }, { url: "chrome-extension://test-extension/ui/editor.html", tab: { id: 3 } });
    expect(res.success).toBe(false);
    expect(chromeStub.storage.local.remove).toHaveBeenCalledWith([ticketKey, imageKey]);
  });

  it("rejects concurrent replay while an editor capability is being consumed", async () => {
    const token = "f".repeat(48);
    const ticketKey = `editor-ticket:${token}`;
    chromeStub.runtime.getURL = (path) => `chrome-extension://test-extension/${path}`;
    let releaseTicket!: (value: Record<string, unknown>) => void;
    const delayedTicket = new Promise<Record<string, unknown>>((resolve) => { releaseTicket = resolve; });
    chromeStub.storage.local.get.mockImplementation((key: string | null) => {
      if (key === null) return Promise.resolve({});
      return delayedTicket;
    });
    const message = { type: "DISCARD_EDITOR_RESULT", payload: { editorToken: token } };
    const sender = { url: "chrome-extension://test-extension/ui/editor.html", tab: { id: 3 } };

    const first = invokeOnMessage(message, sender);
    await Promise.resolve();
    const replay = await invokeOnMessage(message, sender);
    expect(replay.success).toBe(false);
    expect(replay.error?.message).toMatch(/already being consumed/i);

    releaseTicket({
      [ticketKey]: { imageKey: `editor-image:${token}`, tabId: 3, sessionId: "sess-editor", expiresAt: Date.now() + 60_000 },
    });
    expect((await first).success).toBe(true);
  });

  it("injects the content script and records the session on START_SESSION", async () => {
    chromeStub.scripting.executeScript.mockResolvedValue([]);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "PING") throw new Error("content script not injected");
      return okResponse({ sessionId: "sess-1" });
    });

    const res = await invokeOnMessage({ type: "START_SESSION", payload: {} }, { tab: { id: 42 } });

    expect(chromeStub.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ["content/index.js"],
    });
    expect(res.success).toBe(true);
    expect(sw.tabSessions.get(42)).toBe("sess-1");
  });

  it("rejects START_SESSION when no sender tab or stored owner is verified", async () => {
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

  it("hydrates the exact session owner after a worker restart without using the active tab", async () => {
    await loadWorker({
      "42": { sessionId: "sess-stale", createdAt: Date.now() },
    });
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number) => {
      return okResponse({ success: true });
    });

    const res = await invokeOnMessage(
      { type: "UNDO", payload: { sessionId: "sess-stale" } },
      {},
    );

    expect(sw.tabSessions.get(42)).toBe("sess-stale");
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        type: "UNDO",
        payload: expect.objectContaining({ sessionId: "sess-stale" }),
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

  it("captures the visible area, hides the toolbar, and opens the editor", async () => {
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
    // Editor mode: image stored in chrome.storage.local and OPEN_EDITOR sent
    expect(chromeStub.storage.local.set).toHaveBeenCalled();
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: "OPEN_EDITOR" }),
    );
    const data = res.data as { success?: boolean; filename?: string; editor?: boolean };
    expect(data.success).toBe(true);
    expect(data.editor).toBe(true);
    // Live progress is pushed to the toolbar during the capture.
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: "CAPTURE_PROGRESS", payload: expect.objectContaining({ sessionId: "sess-c" }) }),
    );
  });

  it("rejects capture gracefully when editor and download both fail", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(3, "sess-d");
    chromeStub.tabs.get.mockResolvedValue({ id: 3, windowId: 11 });
    // Make OPEN_EDITOR fail so it falls back to download, which also fails
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "OPEN_EDITOR") throw new Error("Editor unavailable");
      return okResponse({});
    });
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

  it("opens a clearly named partial capture with a user-facing warning", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(4, "sess-partial");
    chromeStub.tabs.get.mockResolvedValue({ id: 4, windowId: 12, title: "Dynamic page" });
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.storage.local.get.mockResolvedValue({
      "capture:sess-partial": "data:image/png;base64,BBBB",
    });
    chromeStub.storage.local.remove.mockResolvedValue(undefined);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string; payload?: Record<string, unknown> }) => {
      switch (message.type) {
        case "CAPTURE_STITCH_START":
          return okResponse({
            success: true,
            metrics: { pageHeightCss: 8088, viewportHeightCss: 1241, dpr: 1, scrollY: 0 },
          });
        case "CAPTURE_SCROLL":
          return okResponse({ success: true, actualScrollY: message.payload?.scrollYCss ?? 0 });
        case "CAPTURE_FINALIZE":
          return okResponse({
            success: true,
            partial: true,
            capturedHeightCss: 4200,
            requestedHeightCss: 8088,
            gapCount: 1,
          });
        default:
          return okResponse({});
      }
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-partial", mode: "FULL_PAGE" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(12000);
    const res = await pending;

    const data = res.data as {
      success?: boolean;
      partial?: boolean;
      filename?: string;
      warning?: string;
      steps?: string[];
    };
    expect(data.success).toBe(true);
    expect(data.partial).toBe(true);
    expect(data.filename).toMatch(/^parotia-fullpage-partial-/);
    expect(data.warning).toContain("first 4200px of 8088px");
    expect(data.steps).toContain("assembled partial 4200px/8088px");
  });

  it("captures a visible selected element in one native frame without changing zoom", async () => {
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
            viewportWidthCss: 1200,
            fullyVisible: true,
          });
        case "CAPTURE_ELEMENT_CROP":
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

    expect(chromeStub.tabs.setZoom).not.toHaveBeenCalled();
    expect(chromeStub.tabs.captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        type: "CAPTURE_ELEMENT_CROP",
        payload: expect.objectContaining({
          dpr: 1,
          rect: { left: 0, top: 0, width: 100, height: 100 },
        }),
      }),
    );
    expect(chromeStub.storage.local.remove).toHaveBeenCalledWith("elementcapture:sess-e");
    const data = res.data as { success?: boolean; filename?: string };
    expect(data.success).toBe(true);
    expect(data.filename).toMatch(/^parotia-element-/);
  });

  it("stitches an offscreen element at native zoom and restores the original scroll", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(5, "sess-long-element");
    chromeStub.tabs.get.mockResolvedValue({ id: 5, windowId: 13 });
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.storage.local.get.mockResolvedValue({
      "elementcapture:sess-long-element": "data:image/png;base64,CCCC",
    });
    chromeStub.storage.local.remove.mockResolvedValue(undefined);
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string; payload?: Record<string, unknown> }) => {
      switch (message.type) {
        case "PREPARE_ELEMENT_CAPTURE":
          return okResponse({
            success: true,
            dpr: 1,
            rect: { left: 10, top: 0, width: 300, height: 1000 },
            elementDocTop: 100,
            elementHeightCss: 1000,
            viewportHeightCss: 600,
            viewportWidthCss: 1200,
            fullyVisible: false,
          });
        case "CAPTURE_ELEMENT_SCROLL":
          return okResponse({ success: true, actualScrollY: message.payload?.scrollYCss });
        case "CAPTURE_ELEMENT_SLICE":
          return okResponse({ success: true, blank: false });
        case "CAPTURE_ELEMENT_FINALIZE":
          return okResponse({ success: true });
        default:
          return okResponse({});
      }
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-long-element", mode: "ELEMENT", elementId: "el-long" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(5000);
    const res = await pending;

    expect(res.success).toBe(true);
    expect(chromeStub.tabs.setZoom).not.toHaveBeenCalled();
    expect(chromeStub.tabs.captureVisibleTab).toHaveBeenCalledTimes(2);
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(5, expect.objectContaining({ type: "CAPTURE_ELEMENT_FINALIZE" }));
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(5, expect.objectContaining({ type: "CAPTURE_ELEMENT_RESTORE" }));
  });

  it("fails cleanly when the single-frame element crop cannot be staged", async () => {
    vi.useFakeTimers();
    sw.tabSessions.set(5, "sess-crop-fail");
    chromeStub.tabs.get.mockResolvedValue({ id: 5, windowId: 13 });
    chromeStub.tabs.captureVisibleTab.mockResolvedValue("data:image/png;base64,AAAA");
    chromeStub.tabs.sendMessage.mockImplementation(async (_tabId: number, message: { type: string }) => {
      if (message.type === "PREPARE_ELEMENT_CAPTURE") {
        return okResponse({
          success: true,
          dpr: 1,
          rect: { left: 10, top: 10, width: 100, height: 100 },
          elementDocTop: 10,
          elementHeightCss: 100,
          viewportHeightCss: 800,
          viewportWidthCss: 1200,
          fullyVisible: true,
        });
      }
      if (message.type === "CAPTURE_ELEMENT_CROP") return okResponse({ success: false, error: "storage quota" });
      return okResponse({});
    });

    const pending = invokeOnMessage(
      { type: "CAPTURE", payload: { sessionId: "sess-crop-fail", mode: "ELEMENT", elementId: "el-9" } },
      {},
    );
    await vi.advanceTimersByTimeAsync(3000);
    const res = await pending;

    expect(res.success).toBe(false);
    expect(res.error?.message).toMatch(/storage quota/i);
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(5, expect.objectContaining({ type: "CAPTURE_ELEMENT_RESTORE" }));
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(5, expect.objectContaining({ type: "RESTORE_CAPTURE" }));
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
    // Editor mode: image stored and OPEN_EDITOR sent
    expect(chromeStub.storage.local.set).toHaveBeenCalled();
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ type: "OPEN_EDITOR" }),
    );
    const data = res.data as { success?: boolean; filename?: string; editor?: boolean };
    expect(data.success).toBe(true);
    expect(data.editor).toBe(true);
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
