export interface SessionRecord {
  sessionId: string;
  createdAt: number;
}

type StoredSessions = Record<string, SessionRecord>;

/** MV3-safe tab/session ownership registry backed by chrome.storage.session. */
export class SessionRegistry {
  readonly sessions = new Map<number, string>();
  private hydration: Promise<void> | null = null;

  constructor(private readonly storageKey = "parotia:tab-sessions:v1") {}

  hydrate(): Promise<void> {
    if (this.hydration) return this.hydration;
    this.hydration = (async () => {
      try {
        const stored = await chrome.storage.session.get(this.storageKey);
        const entries = stored?.[this.storageKey] as StoredSessions | undefined;
        if (!entries || typeof entries !== "object") return;
        const candidates: Array<[number, string]> = [];
        for (const [rawTabId, record] of Object.entries(entries)) {
          const tabId = Number(rawTabId);
          if (Number.isInteger(tabId) && tabId > 0 && typeof record?.sessionId === "string" && record.sessionId) {
            candidates.push([tabId, record.sessionId]);
          }
        }
        await Promise.all(candidates.map(async ([tabId, sessionId]) => {
          try {
            const tab = await chrome.tabs.get(tabId);
            if (tab.id === tabId) this.sessions.set(tabId, sessionId);
          } catch {
            // Closed tabs never regain ownership from a stale persisted record.
          }
        }));
      } catch {
        // Action click can re-establish ownership if session storage is unavailable.
      }
    })();
    return this.hydration;
  }

  findTab(sessionId: string): number | undefined {
    for (const [tabId, candidate] of this.sessions) {
      if (candidate === sessionId) return tabId;
    }
    return undefined;
  }

  async register(tabId: number, sessionId: string): Promise<void> {
    this.sessions.set(tabId, sessionId);
    await this.persist();
  }

  remove(tabId: number): void {
    this.sessions.delete(tabId);
    void this.persist();
  }

  private async persist(): Promise<void> {
    const value: StoredSessions = {};
    for (const [tabId, sessionId] of this.sessions) {
      value[String(tabId)] = { sessionId, createdAt: Date.now() };
    }
    try {
      await chrome.storage.session.set({ [this.storageKey]: value });
    } catch {
      // The in-memory ownership remains valid for this worker lifetime.
    }
  }
}
