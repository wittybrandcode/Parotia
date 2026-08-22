import type {
  ActionLogEntry,
  BackgroundCommand,
  CleanupState,
  FreezeState,
  NewsCleanSession,
} from "@shared/types";
import { isBackgroundCommand, isBackgroundNotification } from "@shared/types";
import { createOverlay, type OverlayInstance } from "./overlay/overlay";
import { currentPageContext, createSession, transitionSession } from "./session/session";
import { HistoryEngine } from "./mutation/history";
import { DefaultMutationEngine } from "./mutation/mutationEngine";
import { DefaultFreezeEngine } from "./freeze/freezeEngine";
import { DefaultExtractionEngine } from "./extraction/extractionEngine";
import { DefaultCleanupEngine } from "./cleanup/cleanupEngine";
import { type CaptureStitcher } from "./capture/captureStitcher";
import { ElementCaptureIsolator } from "./capture/elementCapture";
import { FixedHeaderManager } from "./capture/fixedHeaders";
import { KeyboardShortcuts } from "./keyboard/shortcuts";
import { handleCleanupCommand } from "./handlers/cleanupHandler";
import { handleCaptureCommand } from "./handlers/captureHandler";
import type { HandlerContext } from "./handlers/types";

/**
 * Content Runtime entry. Wires the session, engines, and overlay together and
 * bridges typed messages from the Service Worker. The page DOM is only ever
 * touched through the engines — never directly here.
 */

let session: NewsCleanSession | null = null;
let overlay: OverlayInstance | null = null;
let cleanup: DefaultCleanupEngine | null = null;
let stitcher: CaptureStitcher | null = null;
const fixedHeaders = new FixedHeaderManager();

const history = new HistoryEngine();
const mutations = new DefaultMutationEngine(history);
const freeze = new DefaultFreezeEngine();
const extraction = new DefaultExtractionEngine();
const elementCapture = new ElementCaptureIsolator();

/**
 * Pending "Delete Similar" confirmations. The first click previews the matches
 * and issues a short-lived token; the second click confirms with that token so
 * a stale confirm can never delete a different (changed) set of elements.
 */
const deleteSimilarPreviews = new Map<string, { signatures: string[]; expires: number }>();
let deleteSimilarToken: string | null = null;
let shortcuts: KeyboardShortcuts | null = null;

function buildCleanupEngine(): DefaultCleanupEngine {
  return new DefaultCleanupEngine(mutations, {
    // The floating action bar over the picked element runs the exact same
    // commands as the toolbar, so state, counts, and Undo stay consistent.
    inspectorActionHandlers: {
      onDelete: () => {
        handleCommand({
          type: "DELETE_ELEMENT",
          payload: { sessionId: session?.id ?? "", elementId: cleanup?.selected?.id ?? "" },
        }).catch(() => {});
      },
      onHide: () => {
        handleCommand({
          type: "HIDE_ELEMENT",
          payload: { sessionId: session?.id ?? "", elementId: cleanup?.selected?.id ?? "" },
        }).catch(() => {});
      },
      onShow: () => {
        handleCommand({
          type: "SHOW_ELEMENT",
          payload: { sessionId: session?.id ?? "", elementId: cleanup?.selected?.id ?? "" },
        }).catch(() => {});
      },
      isHidden: () => (cleanup?.selected ? cleanup.isHidden(cleanup.selected) : false),
      onDeleteSimilar: () => {
        handleCommand({
          type: "DELETE_MATCHING",
          payload: {
            sessionId: session?.id ?? "",
            elementId: cleanup?.selected?.id ?? "",
            ...(deleteSimilarToken ? { confirm: true, token: deleteSimilarToken } : {}),
          },
        }).catch(() => {});
      },
      // CAPTURE is orchestrated by the Service Worker, so unlike the cleanup
      // actions above this one goes straight to the extension (not the local
      // handler) so the viewport can be captured and the PNG downloaded.
      onCapture: () => {
        const ref = cleanup?.selected;
        if (!ref) return;
        chrome.runtime.sendMessage({
          type: "CAPTURE",
          payload: { sessionId: session?.id ?? "", mode: "ELEMENT", elementId: ref.id },
        } satisfies BackgroundCommand).catch(() => {});
      },
    },
  });
}

/** Session action log (newest first), derived live from the history stacks. */
function actionLogState(): ActionLogEntry[] {
  return history.log();
}

/** Undo/redo availability straight from the history stacks, driving the toolbar buttons. */
function historyState(): { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string } {
  return {
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    ...(history.undoLabel ? { undoLabel: history.undoLabel } : {}),
    ...(history.redoLabel ? { redoLabel: history.redoLabel } : {}),
  };
}

/**
 * Posts a message to the toolbar iframe. The frame starts as about:blank and
 * only navigates to the extension origin after load, so until then its window's
 * origin is the page's — posting with the extension's target origin throws and
 * would abort the caller. Dropping those early broadcasts is safe: the UI pulls
 * fresh state via GET_STATE after every action and on bootstrap.
 */
function postToToolbar(message: Record<string, unknown>): void {
  const frame = overlay?.shadow.querySelector<HTMLIFrameElement>("iframe[data-newsclean-frame]");
  if (!frame?.contentWindow) return;
  const targetOrigin = new URL(chrome.runtime.getURL("")).origin;
  try {
    frame.contentWindow.postMessage(message, targetOrigin);
  } catch {
    // Toolbar iframe not navigated to the extension origin yet — skip.
  }
}

/** Pushes the latest state to the toolbar iframe (which talks to the page). */
function broadcastState(): void {
  if (!session || !overlay) return;
  const state = {
    sessionId: session.id,
    freeze: freeze.getState() as FreezeState,
    cleanup: cleanup?.getState() as CleanupState | undefined,
    status: session.status,
    actionLog: actionLogState(),
    history: historyState(),
  };
  postToToolbar({ source: "newsclean-content", type: "STATE", state });
}

/** Relays Service Worker progress (capture) to the toolbar iframe. */
function broadcastProgress(progress: { current: number; total: number; phase: string }): void {
  postToToolbar({ source: "newsclean-content", type: "PROGRESS", progress });
}

function ensureRuntime(): void {
  if (session && overlay && cleanup && shortcuts) return;
  const page = currentPageContext();
  session = createSession(page);
  overlay = createOverlay();
  cleanup = buildCleanupEngine();
  // Keyboard shortcuts reuse the exact same command pipeline as the toolbar.
  shortcuts = new KeyboardShortcuts({
    getState: () => ({
      frozen: freeze.getState().status === "FROZEN",
      inspecting: cleanup?.inspecting ?? false,
      hasSelection: cleanup?.selected !== null,
    }),
    dispatch: (command) => {
      handleCommand({
        ...command,
        payload: { ...command.payload, sessionId: session?.id ?? "" },
      } as BackgroundCommand).catch(() => {});
    },
  });
  shortcuts.start();
  transitionSession(session, "INITIALIZING");
  transitionSession(session, "ACTIVE");
}

function buildContext(): HandlerContext {
  return {
    session, overlay, cleanup, stitcher, shortcuts,
    fixedHeaders, mutations, freeze, extraction, elementCapture,
    deleteSimilarPreviews, deleteSimilarToken,
    broadcastState,
    ensureRuntime,
    dispatch: (cmd) => handleCommand(cmd),
  };
}

function applyContextChanges(ctx: HandlerContext): void {
  session = ctx.session;
  overlay = ctx.overlay;
  cleanup = ctx.cleanup;
  stitcher = ctx.stitcher;
  shortcuts = ctx.shortcuts;
  deleteSimilarToken = ctx.deleteSimilarToken;
}

const CLEANUP_TYPES = new Set<string>([
  "INSPECT_START", "INSPECT_STOP",
  "DELETE_ELEMENT", "HIDE_ELEMENT", "SHOW_ELEMENT", "DELETE_MATCHING",
  "UNDO", "REDO", "UNDO_TO", "RESET",
]);

const CAPTURE_TYPES = new Set<string>([
  "CAPTURE", "PREPARE_CAPTURE", "RESTORE_CAPTURE",
  "PREPARE_ELEMENT_CAPTURE", "CAPTURE_ELEMENT_SCROLL",
  "CAPTURE_ELEMENT_SLICE", "CAPTURE_ELEMENT_FINALIZE", "CAPTURE_ELEMENT_RESTORE",
  "FREE_SELECT", "CAPTURE_REGION_CROP",
  "CAPTURE_STITCH_START", "CAPTURE_SCROLL", "CAPTURE_SLICE", "CAPTURE_FINALIZE",
  "SELECT_REGION",
]);

async function handleCommand(command: BackgroundCommand): Promise<unknown> {
  const invalid = validatePayload(command);
  if (invalid) return { success: false, error: { code: "INVALID_PAYLOAD", message: invalid } };

  if (CLEANUP_TYPES.has(command.type)) {
    const ctx = buildContext();
    const result = await handleCleanupCommand(command as never, ctx);
    applyContextChanges(ctx);
    return result;
  }

  if (CAPTURE_TYPES.has(command.type)) {
    const ctx = buildContext();
    const result = await handleCaptureCommand(command as never, ctx);
    applyContextChanges(ctx);
    return result;
  }

  switch (command.type) {
    case "START_SESSION":
      ensureRuntime();
      broadcastState();
      return getSnapshot();

    case "FREEZE_PAGE": {
      ensureRuntime();
      const result = await freeze.freeze(command.payload.strategy);
      if (result.success) mutations.startRegenerationGuard();
      broadcastState();
      return result;
    }

    case "UNFREEZE_PAGE":
      mutations.stopRegenerationGuard();
      await freeze.unfreeze();
      broadcastState();
      return freeze.getState();

    case "GET_STATE":
      return getSnapshot();

    case "CLOSE_TOOLBAR": {
      mutations.stopRegenerationGuard();
      deleteSimilarPreviews.clear();
      deleteSimilarToken = null;
      cleanup?.stopInspecting();
      shortcuts?.stop();
      shortcuts = null;
      overlay?.destroy();
      overlay = null;
      session = null;
      cleanup = null;
      return { success: true };
    }

    default:
      return { success: false, error: `Unhandled command: ${(command as { type: string }).type}` };
  }
}

function getSnapshot() {
  if (!session || !cleanup) return null;
  return {
    sessionId: session.id,
    status: session.status,
    freeze: freeze.getState(),
    cleanup: cleanup.getState(),
    extraction: extraction.getState(),
    actionLog: actionLogState(),
    history: historyState(),
  };
}

/**
 * Payload validation at the content boundary. Every command except START_SESSION
 * must carry the id of the session this page owns; a command for a different
 * (or absent) session is stale — e.g. after the toolbar re-synced a dead
 * session — and is rejected before any DOM side effect.
 */
function validatePayload(command: BackgroundCommand): string | null {
  if (command.type === "START_SESSION") return null;
  const payload = command.payload as { sessionId?: unknown };
  if (typeof payload.sessionId !== "string" || payload.sessionId === "") {
    return "Missing or invalid sessionId";
  }
  if (session && payload.sessionId !== session.id) {
    return "Session mismatch";
  }
  return null;
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isBackgroundCommand(message)) return false;
  const command = message as BackgroundCommand;
  const id = (message as { id?: string }).id ?? "";
  handleCommand(command).then(
    (data) => sendResponse({ id, success: true, data }),
    (error: Error) => {
      console.error("[parotia] command failed", command.type, error);
      sendResponse({ id, success: false, error: { code: "INTERNAL", message: error.message } });
    },
  );
  return true; // async response
});

// PING keeps injection checks cheap; respond immediately.
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const ping = message as { type?: string };
  if (ping?.type === "PING") {
    sendResponse({ id: "", success: true, data: { injected: true } });
    return false;
  }
  return false;
});

// Push notifications from the Service Worker (never commands): relay capture
// progress to the toolbar so it can render live progress instead of a spinner.
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isBackgroundNotification(message)) return false;
  broadcastProgress(message.payload.progress);
  return false;
});

export {};
