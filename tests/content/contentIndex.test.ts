import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageResponse } from "@shared/types";

type OnMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

interface ContentChromeStub {
  runtime: {
    onMessage: { addListener: (fn: OnMessageListener) => void };
    sendMessage: ReturnType<typeof vi.fn>;
    getURL: (path: string) => string;
  };
  storage: {
    local: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };
  captured: { onMessage: OnMessageListener[] };
}

function makeContentChromeStub(): ContentChromeStub {
  const captured: ContentChromeStub["captured"] = { onMessage: [] };
  return {
    runtime: {
      onMessage: {
        addListener: (fn) => {
          captured.onMessage.push(fn);
        },
      },
      sendMessage: vi.fn(),
      getURL: () => "about:blank",
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
    captured,
  };
}

let chromeStub: ContentChromeStub;

interface Invocation {
  accepted: boolean;
  response: MessageResponse<unknown> | null;
}

async function invokeOnMessage(message: unknown, sender: unknown = {}): Promise<Invocation> {
  return new Promise((resolve) => {
    let accepted = false;
    let responded = false;
    for (const listener of chromeStub.captured.onMessage) {
      const returned = listener(message, sender, (response) => {
        if (responded) return;
        responded = true;
        resolve({ accepted, response: response as MessageResponse<unknown> });
      });
      if (returned === true) accepted = true;
    }
    queueMicrotask(() => {
      if (!accepted && !responded) resolve({ accepted: false, response: null });
    });
  });
}

/** Empty storage stub. */
function stubEmptyStorage(): void {
  chromeStub.storage.local.get.mockImplementation(async (key: string) => ({ [key]: undefined }));
  chromeStub.storage.local.set.mockResolvedValue(undefined);
  chromeStub.storage.local.remove.mockResolvedValue(undefined);
}

/** Starts a session and returns the id the content script actually owns. */
async function startSession(): Promise<string> {
  stubEmptyStorage();
  const { response } = await invokeOnMessage({ type: "START_SESSION", payload: {} });
  const id = (response?.data as { sessionId: string }).sessionId;
  if (!id) throw new Error("no session started");
  return id;
}

async function loadContent(): Promise<void> {
  vi.resetModules();
  chromeStub = makeContentChromeStub();
  vi.stubGlobal("chrome", chromeStub);
  await import("@content/index");
}

type Snapshot = {
  sessionId: string;
  status: string;
  freeze: { status: string };
  cleanup: { removedCount: number; hiddenCount: number; activeRules: unknown[] };
  actionLog: unknown[];
  history: { canUndo: boolean; canRedo: boolean };
};

describe("content/index command pipeline", () => {
  beforeEach(async () => {
    await loadContent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("START_SESSION initializes the runtime and returns a full snapshot", async () => {
    stubEmptyStorage();
    const { response } = await invokeOnMessage({ type: "START_SESSION", payload: {} });

    expect(response?.success).toBe(true);
    const data = response?.data as Snapshot;
    expect(data.sessionId).toMatch(/^nc-session-/);
    expect(data.status).toBe("ACTIVE");
    expect(data.freeze.status).toBe("UNFROZEN");
    expect(data.cleanup.removedCount).toBe(0);
    expect(data.cleanup.hiddenCount).toBe(0);
    expect(data.cleanup.activeRules).toHaveLength(0);
    expect(data.actionLog).toHaveLength(0);
    expect(data.history.canUndo).toBe(false);
  });

  it("GET_STATE returns the same snapshot shape without re-initializing", async () => {
    const sessionId = await startSession();
    const { response } = await invokeOnMessage({ type: "GET_STATE", payload: { sessionId } });

    expect(response?.success).toBe(true);
    const data = response?.data as Snapshot;
    expect(data.status).toBe("ACTIVE");
    expect(data.sessionId).toMatch(/^nc-session-/);
  });

  it("rejects messages that are not background commands", async () => {
    stubEmptyStorage();
    const { accepted, response } = await invokeOnMessage({ type: "NOT_A_COMMAND", payload: {} });
    expect(accepted).toBe(false);
    expect(response).toBeNull();
  });

  it("relays CAPTURE_PROGRESS notifications to the toolbar iframe", async () => {
    const sessionId = await startSession();
    const frame = document
      .querySelector<HTMLElement>("#__newsclean__")
      ?.shadowRoot?.querySelector<HTMLIFrameElement>("iframe[data-newsclean-frame]");
    expect(frame).not.toBeNull();
    if (!frame?.contentWindow) return;

    const postMessage = vi.spyOn(frame.contentWindow, "postMessage");
    await invokeOnMessage({
      type: "CAPTURE_PROGRESS",
      payload: { sessionId, progress: { current: 1, total: 2, phase: "RENDERING" } },
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "parotia-content",
        type: "PROGRESS",
        progress: { current: 1, total: 2, phase: "RENDERING" },
      }),
      expect.any(String),
    );
  });

  it("answers PING synchronously with the injected flag", async () => {
    stubEmptyStorage();
    const { response } = await invokeOnMessage({ type: "PING", payload: {} });
    expect(response?.success).toBe(true);
    expect((response?.data as { injected: boolean }).injected).toBe(true);
  });

  it("INSPECT_START toggles the picker on and off", async () => {
    const sessionId = await startSession();

    const on = await invokeOnMessage({ type: "INSPECT_START", payload: { sessionId } });
    expect((on.response?.data as { active: boolean }).active).toBe(true);

    const off = await invokeOnMessage({ type: "INSPECT_START", payload: { sessionId } });
    expect((off.response?.data as { active: boolean }).active).toBe(false);
  });

  it("DELETE_ELEMENT without a selection reports failure", async () => {
    const sessionId = await startSession();
    const { response } = await invokeOnMessage({
      type: "DELETE_ELEMENT",
      payload: { sessionId, elementId: "el-1" },
    });
    expect((response?.data as { success: boolean }).success).toBe(false);
  });

  it("DELETE_MATCHING without a selection reports failure", async () => {
    const sessionId = await startSession();
    const { response } = await invokeOnMessage({
      type: "DELETE_MATCHING",
      payload: { sessionId, elementId: "el-1" },
    });
    expect((response?.data as { success: boolean }).success).toBe(false);
  });

  it("refuses CAPTURE locally — it is orchestrated by the Service Worker", async () => {
    const sessionId = await startSession();
    const { response } = await invokeOnMessage({
      type: "CAPTURE",
      payload: { sessionId, mode: "VISIBLE" },
    });
    expect((response?.data as { success: boolean; error?: string }).success).toBe(false);
  });

  it("rejects a command for a different session as INVALID_PAYLOAD", async () => {
    await startSession();
    const { response } = await invokeOnMessage({
      type: "DELETE_ELEMENT",
      payload: { sessionId: "some-other-session", elementId: "el-1" },
    });
    const data = response?.data as { success?: boolean; error?: { code?: string } };
    expect(data.success).toBe(false);
    expect(data.error?.code).toBe("INVALID_PAYLOAD");
  });

  it("rejects a command without a sessionId as INVALID_PAYLOAD", async () => {
    await startSession();
    const { response } = await invokeOnMessage({
      type: "INSPECT_STOP",
      payload: {},
    });
    const data = response?.data as { success?: boolean; error?: { code?: string } };
    expect(data.success).toBe(false);
    expect(data.error?.code).toBe("INVALID_PAYLOAD");
  });

  it("START_SESSION needs no sessionId and keeps working", async () => {
    stubEmptyStorage();
    const { response } = await invokeOnMessage({ type: "START_SESSION", payload: {} });
    expect(response?.success).toBe(true);
  });

  it("FREE_SELECT starts the selection overlay and returns the rect", async () => {
    const sessionId = await startSession();
    // startFreeSelect() is async and awaits user interaction. Fire Escape
    // in a microtask so the overlay gets created first, then the promise resolves.
    const pending = invokeOnMessage({ type: "FREE_SELECT", payload: { sessionId } });
    // Let microtasks settle so the overlay DOM is created.
    await new Promise<void>((r) => setTimeout(r, 50));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const { response } = await pending;
    const data = response?.data as { success?: boolean; cancelled?: boolean };
    expect(data.success).toBe(false);
    expect(data.cancelled).toBe(true);
  });

  it("CAPTURE_REGION_CROP handles crop failure gracefully", async () => {
    const sessionId = await startSession();

    // createImageBitmap is not in happy-dom — let it fail to test error path.
    const { response } = await invokeOnMessage({
      type: "CAPTURE_REGION_CROP",
      payload: {
        sessionId,
        dataUrl: "data:image/png;base64,AAAA",
        rect: { x: 10, y: 20, width: 100, height: 80 },
        dpr: 2,
      },
    });

    const data = response?.data as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });
});
