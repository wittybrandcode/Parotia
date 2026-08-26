import type { BackgroundCommand } from "@shared/types";
import {
  assessEditorImage,
  detectedDeviceMemoryGb,
  editorBypassWarning,
} from "@shared/utils/editorPreflight";
import { logger } from "@shared/utils/logger";
import { downloadPng } from "./downloadService";
import { EditorTicketManager } from "./editorTickets";

const editorTickets = new EditorTicketManager();

type EditorOpenResult = "OPENED" | "DOWNLOADED" | "FAILED";

export interface FinishCaptureResult {
  success: boolean;
  filename?: string;
  editor?: boolean;
  editorBypassed?: boolean;
  editorFallback?: boolean;
  warning?: string;
  error?: string;
  preflight?: {
    reason?: string;
    width?: number | undefined;
    height?: number | undefined;
    pixels?: number | undefined;
    estimatedWorkingBytes?: number | undefined;
    memoryBudgetBytes?: number | undefined;
  };
}

function editorPageUrl(): string {
  return chrome.runtime.getURL("ui/editor.html");
}

/**
 * Opens the image editor in the content script instead of downloading
 * directly. Stores the image and a short-lived one-time editor capability in
 * chrome.storage.local, then sends OPEN_EDITOR to the tab.
 */
async function openEditor(tabId: number, sessionId: string, dataUrl: string, filename: string): Promise<EditorOpenResult> {
  const { editorToken, imageKey, ticketKey } = await editorTickets.stage(tabId, sessionId, dataUrl);
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "OPEN_EDITOR",
      payload: { sessionId, imageKey, filename, editorToken },
    } satisfies BackgroundCommand);
    return "OPENED";
  } catch (e) {
    logger.debug("editor.open_failed", { tabId, sessionId }, e);
    await editorTickets.revoke(imageKey, ticketKey);
    const downloadId = await downloadPng(dataUrl, filename);
    return downloadId === null ? "FAILED" : "DOWNLOADED";
  }
}

/** Validates and consumes an editor capability before a privileged download. */
export async function handleEditorResult(
  command: Extract<BackgroundCommand, { type: "DOWNLOAD_EDITOR_RESULT" | "DISCARD_EDITOR_RESULT" }>,
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; filename?: string }> {
  return editorTickets.consume(command, sender, editorPageUrl());
}

/** Wraps download-or-edit logic shared by all capture paths. */
export async function finishCapture(tabId: number, sessionId: string, dataUrl: string, filename: string): Promise<FinishCaptureResult> {
  const preflight = assessEditorImage(dataUrl, detectedDeviceMemoryGb());
  if (preflight.mode === "BYPASS") {
    const downloadId = await downloadPng(dataUrl, filename);
    if (downloadId === null) {
      return { success: false, error: "The image is too large for safe editing and could not be saved." };
    }
    return {
      success: true,
      filename,
      editor: false,
      editorBypassed: true,
      warning: editorBypassWarning(preflight),
      preflight: {
        reason: preflight.reason,
        width: preflight.metadata?.width,
        height: preflight.metadata?.height,
        pixels: preflight.metadata?.pixels,
        estimatedWorkingBytes: preflight.estimatedWorkingBytes,
        memoryBudgetBytes: preflight.memoryBudgetBytes,
      },
    };
  }
  const result = await openEditor(tabId, sessionId, dataUrl, filename);
  if (result === "OPENED") return { success: true, filename, editor: true };
  if (result === "DOWNLOADED") {
    return {
      success: true,
      filename,
      editor: false,
      editorFallback: true,
      warning: "The editor could not be opened, so the original capture was downloaded instead.",
    };
  }
  return { success: false, error: "Failed to save the file. Check your downloads folder and try again." };
}
