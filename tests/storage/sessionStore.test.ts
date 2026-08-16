import { describe, expect, it } from "vitest";
import { InMemorySessionStore } from "@storage/sessionStore";
import type { NewsCleanSession } from "@shared/types";
import { createId } from "@shared/utils/id";

function makeSession(id: string): NewsCleanSession {
  const now = Date.now();
  return {
    id,
    createdAt: now,
    page: {
      url: "https://example.com/article",
      hostname: "example.com",
      pathname: "/article",
      title: "Test",
      startedAt: now,
    },
    freeze: { status: "UNFROZEN" },
    extraction: { status: "NOT_RUN" },
    inspection: { active: false, mode: "IDLE" },
    cleanup: {
      removedCount: 0,
      hiddenCount: 0,
      keptCount: 0,
      activeRules: [],
      protectedTargets: [],
      selectedHidden: false,
    },
    preset: { detected: false, applied: false },
    capture: { status: "IDLE" },
    status: "CREATED",
  };
}

describe("InMemorySessionStore", () => {
  it("stores and retrieves sessions", () => {
    const store = new InMemorySessionStore();
    const session = makeSession(createId("nc-session"));
    store.set(session);
    expect(store.get(session.id)).toEqual(session);
    expect(store.has(session.id)).toBe(true);
  });

  it("updates in place", () => {
    const store = new InMemorySessionStore();
    const session = makeSession(createId("nc-session"));
    store.set(session);
    const updated = { ...session, status: "ACTIVE" as const };
    store.set(updated);
    expect(store.get(session.id)?.status).toBe("ACTIVE");
    expect(store.count()).toBe(1);
  });

  it("removes sessions", () => {
    const store = new InMemorySessionStore();
    const session = makeSession(createId("nc-session"));
    store.set(session);
    store.remove(session.id);
    expect(store.get(session.id)).toBeNull();
    expect(store.count()).toBe(0);
  });

  it("returns null for unknown ids", () => {
    const store = new InMemorySessionStore();
    expect(store.get("nope")).toBeNull();
    expect(store.has("nope")).toBe(false);
  });
});
