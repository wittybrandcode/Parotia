import type { NewsCleanSession } from "@shared/types";

/**
 * In-memory session store for the active extension runtime. Sessions are
 * destroyed on tab close, navigation and session end. Never persisted.
 */
export interface SessionStore {
  get(id: string): NewsCleanSession | null;
  has(id: string): boolean;
  count(): number;
  set(session: NewsCleanSession): void;
  remove(id: string): void;
  clear(): void;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, NewsCleanSession>();

  get(id: string): NewsCleanSession | null {
    return this.sessions.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  count(): number {
    return this.sessions.size;
  }

  set(session: NewsCleanSession): void {
    this.sessions.set(session.id, session);
  }

  remove(id: string): void {
    this.sessions.delete(id);
  }

  clear(): void {
    this.sessions.clear();
  }
}
