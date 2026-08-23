export const EDITOR_IMAGE_PREFIX = "editor-image:";
export const EDITOR_TICKET_PREFIX = "editor-ticket:";
const CAPTURE_KEY_RE = /^(capture|elementcapture|regioncapture):/;

export interface StoredEditorTicket {
  imageKey: string;
  tabId: number;
  sessionId: string;
  expiresAt: number;
}

/** Removes abandoned capture payloads and expired/orphaned editor records. */
export async function purgeStaleCaptureData(now = Date.now()): Promise<void> {
  try {
    const all = await chrome.storage.local.get(null);
    const staleKeys = Object.keys(all).filter((key) => CAPTURE_KEY_RE.test(key));
    const liveImages = new Set<string>();
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(EDITOR_TICKET_PREFIX)) continue;
      const ticket = value as Partial<StoredEditorTicket>;
      if (typeof ticket.imageKey === "string" && typeof ticket.expiresAt === "number" && ticket.expiresAt >= now) {
        liveImages.add(ticket.imageKey);
      } else {
        staleKeys.push(key);
        if (typeof ticket.imageKey === "string") staleKeys.push(ticket.imageKey);
      }
    }
    for (const key of Object.keys(all)) {
      if (key.startsWith(EDITOR_IMAGE_PREFIX) && !liveImages.has(key)) staleKeys.push(key);
    }
    if (staleKeys.length > 0) await chrome.storage.local.remove([...new Set(staleKeys)]);
  } catch {
    // Best effort. The next worker wake or editor operation retries cleanup.
  }
}

/** Removes editor capabilities owned by a tab that has been closed. */
export async function purgeEditorDataForTab(tabId: number): Promise<void> {
  try {
    const all = await chrome.storage.local.get(null);
    const staleKeys: string[] = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(EDITOR_TICKET_PREFIX)) continue;
      const ticket = value as Partial<StoredEditorTicket>;
      if (ticket.tabId !== tabId) continue;
      staleKeys.push(key);
      if (typeof ticket.imageKey === "string") staleKeys.push(ticket.imageKey);
    }
    if (staleKeys.length > 0) await chrome.storage.local.remove([...new Set(staleKeys)]);
  } catch {
    // Startup/lazy cleanup remains the fallback.
  }
}
