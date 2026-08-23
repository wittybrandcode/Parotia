import type { BackgroundCommand } from "@shared/types";
export { validPngDataUrl } from "@shared/utils/png";
import { downloadPng } from "./downloadService";
import {
  EDITOR_IMAGE_PREFIX,
  EDITOR_TICKET_PREFIX,
  purgeStaleCaptureData,
  type StoredEditorTicket,
} from "./temporaryStorage";

const EDITOR_TICKET_TTL_MS = 10 * 60 * 1000;

export function createEditorToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class EditorTicketManager {
  private readonly consuming = new Set<string>();

  async stage(tabId: number, sessionId: string, dataUrl: string): Promise<{
    editorToken: string;
    imageKey: string;
    ticketKey: string;
  }> {
    await purgeStaleCaptureData();
    const editorToken = createEditorToken();
    const imageKey = `${EDITOR_IMAGE_PREFIX}${editorToken}`;
    const ticketKey = `${EDITOR_TICKET_PREFIX}${editorToken}`;
    const ticket: StoredEditorTicket = {
      imageKey,
      tabId,
      sessionId,
      expiresAt: Date.now() + EDITOR_TICKET_TTL_MS,
    };
    await chrome.storage.local.set({ [imageKey]: dataUrl, [ticketKey]: ticket });
    return { editorToken, imageKey, ticketKey };
  }

  async revoke(imageKey: string, ticketKey: string): Promise<void> {
    await chrome.storage.local.remove([imageKey, ticketKey]);
  }

  async consume(
    command: Extract<BackgroundCommand, { type: "DOWNLOAD_EDITOR_RESULT" | "DISCARD_EDITOR_RESULT" }>,
    sender: chrome.runtime.MessageSender,
    expectedEditorUrl: string,
  ): Promise<{ success: boolean; filename?: string }> {
    if (!this.isTrustedEditorSender(sender.url, expectedEditorUrl)) {
      throw new Error("Editor command rejected: untrusted sender");
    }
    const { editorToken } = command.payload;
    if (this.consuming.has(editorToken)) {
      throw new Error("Editor command rejected: token is already being consumed");
    }
    this.consuming.add(editorToken);
    try {
      await purgeStaleCaptureData();
      const ticketKey = `${EDITOR_TICKET_PREFIX}${editorToken}`;
      const stored = await chrome.storage.local.get(ticketKey);
      const ticket = stored?.[ticketKey] as StoredEditorTicket | undefined;
      if (!ticket || typeof ticket.imageKey !== "string" || typeof ticket.expiresAt !== "number" || ticket.expiresAt < Date.now()) {
        await chrome.storage.local.remove([
          ticketKey,
          ...(typeof ticket?.imageKey === "string" ? [ticket.imageKey] : []),
        ]);
        throw new Error("Editor command rejected: expired or invalid token");
      }
      if (sender.tab?.id !== ticket.tabId) {
        throw new Error("Editor command rejected: sender tab does not own token");
      }

      // Consume first. A failed download must not make the capability replayable.
      await chrome.storage.local.remove([ticketKey, ticket.imageKey]);
      if (command.type === "DISCARD_EDITOR_RESULT") return { success: true };
      const downloadId = await downloadPng(command.payload.dataUrl, command.payload.filename);
      if (downloadId === null) {
        throw new Error("Failed to save the file. Check your downloads folder and try again.");
      }
      return { success: true, filename: command.payload.filename };
    } finally {
      this.consuming.delete(editorToken);
    }
  }

  private isTrustedEditorSender(actualUrl: string | undefined, expectedUrl: string): boolean {
    try {
      const actual = new URL(actualUrl ?? "");
      const expected = new URL(expectedUrl);
      return actual.origin === expected.origin && actual.pathname === expected.pathname;
    } catch {
      return false;
    }
  }
}
