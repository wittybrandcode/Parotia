import type { BackgroundCommand } from "@shared/types";
import { logger } from "@shared/utils/logger";
import { downloadPng } from "./downloadService";
import { EditorTicketManager } from "./editorTickets";

const editorEnabled = true;
const editorTickets = new EditorTicketManager();

function editorPageUrl(): string {
  return chrome.runtime.getURL("ui/editor.html");
}

/**
 * Opens the image editor in the content script instead of downloading
 * directly. Stores the image and a short-lived one-time editor capability in
 * chrome.storage.local, then sends OPEN_EDITOR to the tab.
 */
async function openEditor(tabId: number, sessionId: string, dataUrl: string, filename: string): Promise<boolean> {
  const { editorToken, imageKey, ticketKey } = await editorTickets.stage(tabId, sessionId, dataUrl);
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "OPEN_EDITOR",
      payload: { sessionId, imageKey, filename, editorToken },
    } satisfies BackgroundCommand);
    return true;
  } catch (e) {
    logger.debug("editor.open_failed", { tabId, sessionId }, e);
    await editorTickets.revoke(imageKey, ticketKey);
    const downloadId = await downloadPng(dataUrl, filename);
    return downloadId !== null;
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
export async function finishCapture(tabId: number, sessionId: string, dataUrl: string, filename: string): Promise<unknown> {
  if (editorEnabled) {
    const ok = await openEditor(tabId, sessionId, dataUrl, filename);
    if (ok) return { success: true, filename, editor: true };
    return { success: false, error: "Failed to save the file. Check your downloads folder and try again." };
  }
  const downloadId = await downloadPng(dataUrl, filename);
  if (!downloadId) return { success: false, error: "Failed to save the file. Check your downloads folder and try again." };
  return { success: true, filename };
}
