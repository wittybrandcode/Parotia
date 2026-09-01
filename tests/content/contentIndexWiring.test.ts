import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundCommand, ElementReference, MessageResponse } from "@shared/types";
import type * as SharedTypes from "@shared/types";

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

const wiring = vi.hoisted(() => {
  const selected: ElementReference = { id: "selected-1", selector: "#selected", tagName: "DIV" };
  const cleanup = {
    inspecting: false,
    selected: selected as ElementReference | null,
    startInspecting: vi.fn(),
    stopInspecting: vi.fn(),
    deleteTarget: vi.fn(() => true),
    hideTarget: vi.fn(() => true),
    showSelected: vi.fn(() => true),
    isHidden: vi.fn(() => false),
    previewSimilarTargets: vi.fn(() => ({
      count: 1,
      signatures: ["signature-1"],
      elements: [document.createElement("div")],
    })),
    confirmDeleteSimilar: vi.fn(() => 1),
    showPreview: vi.fn(),
    clearPreview: vi.fn(),
    setDeleteSimilarPreview: vi.fn(),
    undo: vi.fn(() => true),
    redo: vi.fn(() => true),
    undoThrough: vi.fn(() => true),
    reset: vi.fn(() => true),
    getState: vi.fn(() => ({ removedCount: 0, hiddenCount: 0, activeRules: [], selectedHidden: false })),
  };
  return {
    selected,
    cleanup,
    cleanupOptions: null as null | {
      inspectorActionHandlers: {
        onDelete(): void;
        onHide(): void;
        onShow(): void;
        isHidden(): boolean;
        onDeleteSimilar(): void;
        onCapture(): void;
      };
    },
    shortcutOptions: null as null | {
      getState(): { frozen: boolean; inspecting: boolean; hasSelection: boolean };
      dispatch(command: BackgroundCommand): void;
    },
    overlay: {
      shadow: {} as ShadowRoot,
      postToToolbar: vi.fn(() => true),
      destroy: vi.fn(),
      setVisible: vi.fn(),
    },
    editor: { show: vi.fn(), hide: vi.fn(), destroy: vi.fn() },
    shortcuts: { start: vi.fn(), stop: vi.fn() },
    freezeState: { status: "UNFROZEN" },
    freeze: vi.fn(async () => ({
      success: true,
      strategy: "SOFT_FREEZE",
      stabilityReached: true,
      durationMs: 1,
      mutationsObserved: 0,
      degraded: false,
    })),
    unfreeze: vi.fn(async () => undefined),
    startGuard: vi.fn(),
    stopGuard: vi.fn(),
    loggerError: vi.fn(),
    captureHandler: vi.fn(),
  };
});

vi.mock("@shared/types", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedTypes>();
  return {
    ...actual,
    isBackgroundCommand: (value: unknown) => {
      const type = (value as { type?: unknown } | null)?.type;
      return actual.isBackgroundCommand(value) || type === "UNHANDLED";
    },
    validateBackgroundCommandShape: (value: unknown) => {
      const record = value as { type?: unknown; bypassShape?: unknown } | null;
      if (record?.type === "UNHANDLED" || record?.bypassShape === true) return null;
      return actual.validateBackgroundCommandShape(value);
    },
  };
});

vi.mock("@shared/utils/logger", () => ({
  logger: { error: wiring.loggerError },
}));

vi.mock("@content/session/session", () => ({
  currentPageContext: vi.fn(() => ({ url: "https://example.test/story", title: "Story" })),
  createSession: vi.fn(() => ({
    id: "session-wiring",
    status: "IDLE",
    page: { url: "https://example.test/story", title: "Story" },
    createdAt: 1,
    updatedAt: 1,
  })),
  transitionSession: vi.fn((session: { status: string }, status: string) => {
    session.status = status;
    return session;
  }),
}));

vi.mock("@content/overlay/overlay", () => ({
  createOverlay: vi.fn(() => wiring.overlay),
}));

vi.mock("@content/editor/editorModal", () => ({
  createEditorModal: vi.fn(() => wiring.editor),
}));

vi.mock("@content/cleanup/cleanupEngine", () => ({
  DefaultCleanupEngine: class {
    constructor(_mutations: unknown, options: typeof wiring.cleanupOptions) {
      wiring.cleanupOptions = options;
      return wiring.cleanup;
    }
  },
}));

vi.mock("@content/keyboard/shortcuts", () => ({
  KeyboardShortcuts: class {
    constructor(options: typeof wiring.shortcutOptions) {
      wiring.shortcutOptions = options;
      return wiring.shortcuts;
    }
  },
}));

vi.mock("@content/mutation/history", () => ({
  HistoryEngine: class {
    get canUndo() { return true; }
    get canRedo() { return true; }
    get undoLabel() { return "Undo delete"; }
    get redoLabel() { return "Redo delete"; }
    log() { return []; }
  },
}));

vi.mock("@content/mutation/mutationEngine", () => ({
  DefaultMutationEngine: class {
    startRegenerationGuard = wiring.startGuard;
    stopRegenerationGuard = wiring.stopGuard;
  },
}));

vi.mock("@content/freeze/freezeEngine", () => ({
  DefaultFreezeEngine: class {
    freeze = wiring.freeze;
    unfreeze = wiring.unfreeze;
    getState() { return wiring.freezeState; }
  },
}));

vi.mock("@content/extraction/extractionEngine", () => ({
  DefaultExtractionEngine: class {
    getState() { return { status: "IDLE" }; }
  },
}));

vi.mock("@content/capture/elementCapture", () => ({ ElementCaptureIsolator: class {} }));
vi.mock("@content/capture/fixedHeaders", () => ({ FixedHeaderManager: class {} }));

vi.mock("@content/handlers/captureHandler", () => ({
  handleCaptureCommand: wiring.captureHandler,
}));

interface ChromeStub {
  listeners: Listener[];
  sendMessage: ReturnType<typeof vi.fn>;
}

let chromeStub: ChromeStub;

function installChrome(): ChromeStub {
  const listeners: Listener[] = [];
  const sendMessage = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: { addListener: (listener: Listener) => listeners.push(listener) },
      sendMessage,
      getURL: (path: string) => `chrome-extension://parotia/${path}`,
    },
    storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
  });
  return { listeners, sendMessage };
}

async function invoke(message: unknown): Promise<{ accepted: boolean; response: MessageResponse<unknown> | null }> {
  const listener = chromeStub.listeners.at(-1);
  if (!listener) throw new Error("content listener was not installed");
  return new Promise((resolve) => {
    let responded = false;
    const accepted = listener(message, {}, (response) => {
      responded = true;
      resolve({ accepted: accepted === true, response: response as MessageResponse<unknown> });
    });
    queueMicrotask(() => {
      if (!responded && accepted !== true) resolve({ accepted: false, response: null });
    });
  });
}

async function settleCommands(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function start(): Promise<void> {
  const { response } = await invoke({ type: "START_SESSION", payload: {} });
  expect(response?.success).toBe(true);
}

describe("content/index runtime wiring", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    wiring.cleanup.inspecting = false;
    wiring.cleanup.selected = wiring.selected;
    wiring.cleanupOptions = null;
    wiring.shortcutOptions = null;
    wiring.freezeState = { status: "UNFROZEN" };
    wiring.freeze.mockResolvedValue({
      success: true,
      strategy: "SOFT_FREEZE",
      stabilityReached: true,
      durationMs: 1,
      mutationsObserved: 0,
      degraded: false,
    });
    wiring.captureHandler.mockImplementation(async (command: BackgroundCommand, ctx: { dispatch(cmd: BackgroundCommand): Promise<unknown> }) => {
      if (command.type === "SELECT_REGION") {
        await ctx.dispatch({ type: "GET_STATE", payload: { sessionId: "session-wiring" } });
      }
      return { success: true };
    });
    chromeStub = installChrome();
    await import("@content/index");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the runtime once and exposes complete history state", async () => {
    await start();
    await start();

    expect(wiring.shortcuts.start).toHaveBeenCalledOnce();
    expect(wiring.cleanupOptions).not.toBeNull();
    expect(wiring.shortcutOptions).not.toBeNull();
    expect(wiring.overlay.postToToolbar).toHaveBeenCalledWith(expect.objectContaining({
      type: "STATE",
      state: expect.objectContaining({
        history: {
          canUndo: true,
          canRedo: true,
          undoLabel: "Undo delete",
          redoLabel: "Redo delete",
        },
      }),
    }));
  });

  it("wires every floating inspector action into the command pipeline", async () => {
    await start();
    const handlers = wiring.cleanupOptions?.inspectorActionHandlers;
    if (!handlers) throw new Error("inspector handlers were not installed");

    handlers.onDelete();
    handlers.onHide();
    handlers.onShow();
    expect(handlers.isHidden()).toBe(false);
    await settleCommands();

    expect(wiring.cleanup.deleteTarget).toHaveBeenCalledWith(wiring.selected);
    expect(wiring.cleanup.hideTarget).toHaveBeenCalledWith(wiring.selected);
    expect(wiring.cleanup.showSelected).toHaveBeenCalledOnce();
    expect(wiring.cleanup.isHidden).toHaveBeenCalledWith(wiring.selected);

    handlers.onDeleteSimilar();
    await settleCommands();
    expect(wiring.cleanup.previewSimilarTargets).toHaveBeenCalledWith(wiring.selected);
    handlers.onDeleteSimilar();
    await settleCommands();
    expect(wiring.cleanup.confirmDeleteSimilar).toHaveBeenCalledWith(wiring.selected, ["signature-1"]);

    handlers.onCapture();
    await settleCommands();
    expect(chromeStub.sendMessage).toHaveBeenCalledWith({
      type: "CAPTURE",
      payload: { sessionId: "session-wiring", mode: "ELEMENT", elementId: "selected-1" },
    });

    wiring.cleanup.selected = null;
    expect(handlers.isHidden()).toBe(false);
    handlers.onCapture();
    expect(chromeStub.sendMessage).toHaveBeenCalledOnce();
  });

  it("injects the owned session id into shortcut commands", async () => {
    await start();
    const shortcuts = wiring.shortcutOptions;
    if (!shortcuts) throw new Error("shortcut options were not installed");

    expect(shortcuts.getState()).toEqual({ frozen: false, inspecting: false, hasSelection: true });
    wiring.freezeState = { status: "FROZEN" };
    wiring.cleanup.inspecting = true;
    wiring.cleanup.selected = null;
    expect(shortcuts.getState()).toEqual({ frozen: true, inspecting: true, hasSelection: false });

    shortcuts.dispatch({ type: "INSPECT_STOP", payload: { sessionId: "" } });
    await settleCommands();
    expect(wiring.cleanup.stopInspecting).toHaveBeenCalled();
  });

  it("executes freeze and unfreeze, including the unsuccessful freeze branch", async () => {
    await start();
    const frozen = await invoke({
      type: "FREEZE_PAGE",
      payload: { sessionId: "session-wiring", strategy: "HARD_FREEZE" },
    });
    expect((frozen.response?.data as { success: boolean }).success).toBe(true);
    expect(wiring.freeze).toHaveBeenCalledWith("HARD_FREEZE");
    expect(wiring.startGuard).toHaveBeenCalledOnce();

    wiring.freeze.mockResolvedValueOnce({
      success: false,
      strategy: "SOFT_FREEZE",
      stabilityReached: false,
      durationMs: 1,
      mutationsObserved: 0,
      degraded: true,
    });
    await invoke({ type: "FREEZE_PAGE", payload: { sessionId: "session-wiring" } });
    expect(wiring.startGuard).toHaveBeenCalledOnce();

    const unfrozen = await invoke({ type: "UNFREEZE_PAGE", payload: { sessionId: "session-wiring" } });
    expect(unfrozen.response?.data).toEqual({ status: "UNFROZEN" });
    expect(wiring.stopGuard).toHaveBeenCalledOnce();
    expect(wiring.unfreeze).toHaveBeenCalledOnce();
  });

  it("opens the editor and fully tears down an open or already closed runtime", async () => {
    await start();
    const token = "a".repeat(48);
    expect((await invoke({
      type: "OPEN_EDITOR",
      payload: {
        sessionId: "session-wiring",
        imageKey: "capture:1",
        filename: "story.png",
        editorToken: token,
      },
    })).response?.data).toEqual({ success: true });
    expect(wiring.editor.show).toHaveBeenCalledWith("capture:1", "story.png", token);

    expect((await invoke({
      type: "CLOSE_TOOLBAR",
      payload: { sessionId: "session-wiring" },
    })).response?.data).toEqual({ success: true });
    expect(wiring.cleanup.stopInspecting).toHaveBeenCalled();
    expect(wiring.shortcuts.stop).toHaveBeenCalled();
    expect(wiring.editor.destroy).toHaveBeenCalled();
    expect(wiring.overlay.destroy).toHaveBeenCalled();

    const state = await invoke({ type: "GET_STATE", payload: { sessionId: "any-session" } });
    expect(state.response?.data).toBeNull();
    expect((await invoke({
      type: "CLOSE_TOOLBAR",
      payload: { sessionId: "any-session" },
    })).response?.data).toEqual({ success: true });
  });

  it("uses the context dispatcher supplied to capture handlers", async () => {
    await start();
    const result = await invoke({
      type: "SELECT_REGION",
      payload: {
        sessionId: "session-wiring",
        rect: { x: 1, y: 2, width: 3, height: 4 },
        scrollY: 0,
        dpr: 1,
      },
    });
    expect(result.response?.data).toEqual({ success: true });
    expect(wiring.captureHandler).toHaveBeenCalledOnce();
  });

  it("keeps notifications harmless before runtime initialization", async () => {
    const result = await invoke({
      type: "CAPTURE_PROGRESS",
      payload: { sessionId: "none", progress: { current: 0, total: 1, phase: "PREPARING" } },
    });
    expect(result).toEqual({ accepted: false, response: null });
    expect(wiring.overlay.postToToolbar).not.toHaveBeenCalled();
  });

  it("defensively rejects malformed session ids after structural validation", async () => {
    const result = await invoke({
      type: "GET_STATE",
      bypassShape: true,
      payload: { sessionId: 42 },
    });
    expect(result.response?.data).toEqual({
      success: false,
      error: { code: "INVALID_PAYLOAD", message: "Missing or invalid sessionId" },
    });
  });

  it("returns a defensive response for an allowlisted-but-unhandled command", async () => {
    const result = await invoke({ type: "UNHANDLED", payload: { sessionId: "unused" } });
    expect(result.response?.data).toEqual({ success: false, error: "Unhandled command: UNHANDLED" });
  });

  it("reports asynchronous command failures without leaking the rejection", async () => {
    await start();
    wiring.freeze.mockRejectedValueOnce(new Error("freeze exploded"));
    const result = await invoke({ type: "FREEZE_PAGE", payload: { sessionId: "session-wiring" }, id: "request-7" });

    expect(result.response).toEqual({
      id: "request-7",
      success: false,
      error: { code: "INTERNAL", message: "freeze exploded" },
    });
    expect(wiring.loggerError).toHaveBeenCalledWith(
      "content.command_failed",
      { command: "FREEZE_PAGE", sessionId: "session-wiring" },
      expect.any(Error),
    );
  });
});
