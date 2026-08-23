
import type { BackgroundCommand, MessageResponse } from "@shared/types";
import { isBackgroundCommand, validateBackgroundCommandShape } from "@shared/types";
import { SessionRegistry } from "./sessionRegistry";
import { purgeEditorDataForTab, purgeStaleCaptureData } from "./temporaryStorage";
import { captureByMode, clearCaptureForTab } from "./captureCoordinator";
import { handleEditorResult } from "./editorGateway";

/**
 * Parotia service worker.
 * Owns: extension lifecycle, toolbar activation, tab communication, runtime
 * messaging, storage coordination. Must NEVER directly manipulate the webpage DOM.
 *
 * MV3: this worker is event-driven and may be stopped when idle. Runtime
 * state must be reconstructable (sessions are re-created from the tab, and
 * persistent config lives in chrome.storage.local).
 */

/** Tracks the live session id for each tab. Rebuilt on tab start via START_SESSION. */
const sessionRegistry = new SessionRegistry();
const tabSessions = sessionRegistry.sessions;
const sessionHydration = sessionRegistry.hydrate();

const CONTENT_SCRIPT = "content/index.js";

class CommandBoundaryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Reverse lookup: which tab owns the given session? (toolbar iframes send no sender.tab). */
function findTabForSession(sessionId: string): number | undefined {
  for (const [tabId, id] of tabSessions) {
      if (id === sessionId) return tabId;
  }
  return undefined;
}

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING", payload: {} });
  } catch {
    // Content script not present yet — inject it.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT],
    });
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await ensureContentScriptInjected(tab.id);
    const response = (await chrome.tabs.sendMessage(tab.id, {
      type: "START_SESSION",
      payload: {},
    } satisfies BackgroundCommand)) as MessageResponse<{ sessionId?: string }> | undefined;
    const sessionId = response?.data?.sessionId;
    if (typeof sessionId === "string" && sessionId) await sessionRegistry.register(tab.id, sessionId);
  } catch {
    // Cannot inject into this page (chrome://, PDF, restricted origins).
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    const id = typeof (message as { id?: unknown })?.id === "string" ? (message as { id: string }).id : "";
    if (!isBackgroundCommand(message)) {
      sendResponse({ id, success: false, error: { code: "UNKNOWN_COMMAND", message: "Unknown command" } });
      return false;
    }

    const cmd = message as BackgroundCommand;
    dispatch(cmd, sender, id).then(
      (response) => sendResponse(response),
      (error: Error) =>
        sendResponse({
          id,
          success: false,
          error: { code: "INTERNAL", message: error.message },
        }),
    );
    return true; // async response
  },
);

/**
 * Resolves the target tab for a command and runs it. The response always
 * echoes the request's correlation `id` so the toolbar can pair replies.
 */
async function dispatch(
  command: BackgroundCommand,
  sender: chrome.runtime.MessageSender,
  id: string,
): Promise<MessageResponse> {
  await sessionHydration;
  const invalid = validateBackgroundCommandShape(command);
  if (invalid) return { id, success: false, error: { code: "INVALID_PAYLOAD", message: invalid } };

  // Toolbar iframes are extension pages, so sender.tab is undefined. Resolve
  // the target tab from the session id when that is the case.
  const sessionId = (command.payload as { sessionId?: string }).sessionId;
  const ownerTabId = typeof sessionId === "string" ? findTabForSession(sessionId) : undefined;
  const senderTabId = sender.tab?.id;
  const tabId = command.type === "START_SESSION"
    ? (senderTabId ?? ownerTabId)
    : ownerTabId;

  if (command.type === "DOWNLOAD_EDITOR_RESULT" || command.type === "DISCARD_EDITOR_RESULT") {
    try {
      const data = await handleEditorResult(command, sender);
      return { id, success: true, data };
    } catch (error) {
      return { id, success: false, error: { code: "INVALID_PAYLOAD", message: error instanceof Error ? error.message : String(error) } };
    }
  }

  if (command.type !== "START_SESSION") {
    if (senderTabId !== undefined && ownerTabId !== undefined && senderTabId !== ownerTabId) {
      return { id, success: false, error: { code: "SESSION_NOT_FOUND", message: "Session does not belong to the sender tab" } };
    }
    if (typeof sessionId !== "string" || sessionId === "" || tabId === undefined) {
      if (typeof sessionId !== "string" || sessionId === "") {
        return { id, success: false, error: { code: "INVALID_PAYLOAD", message: "Missing or invalid sessionId" } };
      }
      return { id, success: false, error: { code: "SESSION_NOT_FOUND", message: "Session not found" } };
    }
  }

  try {
    const data = await handleCommand(command, tabId);
    return { id, success: true, data };
  } catch (error) {
    return {
      id,
      success: false,
      error: {
        code: error instanceof CommandBoundaryError ? error.code : "INTERNAL",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function handleCommand(command: BackgroundCommand, tabId: number | undefined) {
  switch (command.type) {
    case "START_SESSION": {
      let targetTabId = tabId;
      if (targetTabId === undefined) {
        const requested = command.payload.sessionId;
        targetTabId = requested ? findTabForSession(requested) : undefined;
      }
      if (targetTabId === undefined) throw new Error("No verified tab for session start");
      await ensureContentScriptInjected(targetTabId);
      const response = (await chrome.tabs.sendMessage(targetTabId, command)) as MessageResponse | undefined;
      const sessionId = (response?.data as { sessionId?: string } | undefined)?.sessionId;
      if (typeof sessionId === "string" && sessionId !== "") {
        await sessionRegistry.register(targetTabId, sessionId);
      }
      if (!response?.success) {
        throw new CommandBoundaryError(
          response?.error?.code ?? "INTERNAL",
          response?.error?.message ?? "Content runtime rejected session start",
        );
      }
      return response.data;
    }
    case "FREEZE_PAGE":
    case "UNFREEZE_PAGE":
    case "INSPECT_START":
    case "INSPECT_STOP":
    case "DELETE_ELEMENT":
    case "HIDE_ELEMENT":
    case "SHOW_ELEMENT":
    case "DELETE_MATCHING":
    case "UNDO":
    case "REDO":
    case "UNDO_TO":
    case "RESET":
    case "GET_STATE":
    case "CLOSE_TOOLBAR":
      return routeToTab(tabId, command);
    case "CAPTURE": {
      const capture = command as Extract<BackgroundCommand, { type: "CAPTURE" }>;
      if (tabId === undefined) throw new Error("No tab context for capture");
      return captureByMode(tabId, capture);
    }
    case "PREPARE_CAPTURE":
    case "RESTORE_CAPTURE":
    case "PREPARE_ELEMENT_CAPTURE":
    case "CAPTURE_ELEMENT_CROP":
    case "CAPTURE_ELEMENT_SCROLL":
    case "CAPTURE_ELEMENT_SLICE":
    case "CAPTURE_ELEMENT_FINALIZE":
    case "CAPTURE_ELEMENT_RESTORE":
    case "CAPTURE_STITCH_START":
    case "CAPTURE_SCROLL":
    case "CAPTURE_SLICE":
    case "CAPTURE_FINALIZE":
    case "FREE_SELECT":
    case "SELECT_REGION":
    case "CAPTURE_REGION_CROP":
    case "PREPARE_REGION_CAPTURE":
    case "RESTORE_REGION_CAPTURE":
      return routeToTab(tabId, command);
    case "OPEN_EDITOR":
      return routeToTab(tabId, command);
    case "DOWNLOAD_EDITOR_RESULT":
    case "DISCARD_EDITOR_RESULT":
      throw new Error("Editor results must be handled at the message boundary");
    default: {
      const exhaustive: never = command;
      throw new Error(`Unhandled command: ${exhaustive}`);
    }
  }
}

async function routeToTab(tabId: number | undefined, command: BackgroundCommand) {
  if (tabId === undefined) throw new Error("No tab context for command");
  const response = (await chrome.tabs.sendMessage(tabId, command)) as MessageResponse | undefined;
  if (!response?.success) {
    throw new CommandBoundaryError(
      response?.error?.code ?? "INTERNAL",
      response?.error?.message ?? "Content runtime did not return a successful response",
    );
  }
  return response.data;
}

// Sessions end with their tab; drop tracking on close.
chrome.tabs.onRemoved.addListener((tabId) => {
  sessionRegistry.remove(tabId);
  clearCaptureForTab(tabId);
  void purgeEditorDataForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url && changeInfo.status !== "loading") return;
  sessionRegistry.remove(tabId);
  clearCaptureForTab(tabId);
});

// Run cleanup on service worker startup (MV3 wakes the SW on events).
void purgeStaleCaptureData();

export { tabSessions };
