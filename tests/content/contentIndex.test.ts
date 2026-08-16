import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageResponse, SitePreset } from "@shared/types";

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

const PRESETS_KEY = "newsclean.presets";

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

function enabledPreset(rules: NonNullable<SitePreset["cleanup"]>["rules"], hostname = "localhost"): SitePreset {
  return {
    schemaVersion: 1,
    id: "preset-local",
    version: 1,
    enabled: true,
    site: { hostname },
    cleanup: { rules },
    metadata: { name: "Local test", author: "test" },
  };
}

/** Empty storage: preset repository sees no presets, defaults get seeded. */
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
  cleanup: { removedCount: number; hiddenCount: number; keptCount: number; activeRules: unknown[] };
  preset: { detected: boolean; applied: boolean };
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
    expect(data.cleanup.keptCount).toBe(0);
    expect(data.cleanup.activeRules).toHaveLength(0);
    expect(data.actionLog).toHaveLength(0);
    expect(data.history.canUndo).toBe(false);
    expect(data.preset.detected).toBe(false);
    expect(data.preset.applied).toBe(false);
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
        source: "newsclean-content",
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

  it("APPLY_PRESET applies the stored preset rules and reports the removed count", async () => {
    document.body.innerHTML = `<main><div class="ad">A</div><div class="ad">B</div><p>story</p></main>`;
    // Hostname does not match localhost, so START_SESSION never auto-applies it
    // — it is applied only when the toolbar asks explicitly.
    chromeStub.storage.local.get.mockImplementation(async (key: string) => {
      if (key === PRESETS_KEY) {
        return {
          [PRESETS_KEY]: {
            "preset-local": enabledPreset(
              [{ id: "r1", selector: ".ad", action: "DELETE", category: "ADVERTISEMENT", enabled: true }],
              "cnn.com",
            ),
          },
        };
      }
      return { [key]: undefined };
    });
    chromeStub.storage.local.set.mockResolvedValue(undefined);

    const { response: start } = await invokeOnMessage({ type: "START_SESSION", payload: {} });
    const sessionId = (start?.data as { sessionId: string }).sessionId;
    const { response } = await invokeOnMessage({
      type: "APPLY_PRESET",
      payload: { sessionId, presetId: "preset-local" },
    });

    expect((response?.data as { success: boolean; count: number }).count).toBe(2);
    expect(document.querySelectorAll(".ad")).toHaveLength(0);
  });

  it("auto-applies an enabled matching preset on START_SESSION", async () => {
    document.body.innerHTML = `<main><div class="ad">A</div><div class="ad">B</div><p>story</p></main>`;
    chromeStub.storage.local.get.mockImplementation(async (key: string) => {
      if (key === PRESETS_KEY) {
        return {
          [PRESETS_KEY]: {
            "preset-local": enabledPreset([
              { id: "r1", selector: ".ad", action: "DELETE", category: "ADVERTISEMENT", enabled: true },
            ]),
          },
        };
      }
      return { [key]: undefined };
    });
    chromeStub.storage.local.set.mockResolvedValue(undefined);

    const { response } = await invokeOnMessage({ type: "START_SESSION", payload: {} });

    const data = response?.data as Snapshot;
    expect(data.preset.detected).toBe(true);
    expect(data.preset.applied).toBe(true);
    expect(data.cleanup.removedCount).toBe(2);
    expect(document.querySelectorAll(".ad")).toHaveLength(0);
  });

  it("does NOT auto-apply a matching but disabled preset", async () => {
    document.body.innerHTML = `<main><div class="ad">A</div></main>`;
    const disabled = enabledPreset([
      { id: "r1", selector: ".ad", action: "DELETE", category: "ADVERTISEMENT", enabled: true },
    ]);
    disabled.enabled = false;
    chromeStub.storage.local.get.mockImplementation(async (key: string) => {
      if (key === PRESETS_KEY) return { [PRESETS_KEY]: { "preset-local": disabled } };
      return { [key]: undefined };
    });
    chromeStub.storage.local.set.mockResolvedValue(undefined);

    const { response } = await invokeOnMessage({ type: "START_SESSION", payload: {} });

    const data = response?.data as Snapshot;
    expect(data.preset.detected).toBe(true);
    expect(data.preset.applied).toBe(false);
    expect(data.cleanup.removedCount).toBe(0);
    expect(document.querySelectorAll(".ad")).toHaveLength(1);
  });
});
