import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionRegistry } from "@background/sessionRegistry";

const sessionStorage = chrome.storage.session as unknown as {
  get: {
    mockReset(): void;
    mockResolvedValue(value: Record<string, unknown>): void;
    mockRejectedValue(error: unknown): void;
  };
  set: {
    mockReset(): void;
    mockResolvedValue(value: undefined): void;
    mockRejectedValue(error: unknown): void;
  };
};
const tabsGet = chrome.tabs.get as unknown as {
  mockReset(): void;
  mockImplementation(fn: (tabId: number) => Promise<{ id: number }>): void;
};

describe("SessionRegistry", () => {
  beforeEach(() => {
    sessionStorage.get.mockReset();
    sessionStorage.get.mockResolvedValue({});
    sessionStorage.set.mockReset();
    sessionStorage.set.mockResolvedValue(undefined);
    tabsGet.mockReset();
    tabsGet.mockImplementation(async (tabId) => ({ id: tabId }));
  });

  it("hydrates exact tab ownership and persists registrations/removals", async () => {
    sessionStorage.get.mockResolvedValue({
      "sessions:test": {
        "4": { sessionId: "s4", createdAt: 1 },
        invalid: { sessionId: "bad", createdAt: 1 },
      },
    });
    const registry = new SessionRegistry("sessions:test");
    await registry.hydrate();
    expect(registry.findTab("s4")).toBe(4);
    expect(registry.findTab("bad")).toBeUndefined();
    await registry.register(9, "s9");
    expect(registry.sessions.get(9)).toBe("s9");
    registry.remove(9);
    expect(registry.sessions.has(9)).toBe(false);
    expect(chrome.storage.session.set).toHaveBeenCalled();
  });

  it("fails closed when session storage is unavailable", async () => {
    sessionStorage.get.mockRejectedValue(new Error("unavailable"));
    const registry = new SessionRegistry("sessions:test");
    await registry.hydrate();
    expect(registry.findTab("unknown")).toBeUndefined();
  });

  it("drops ownership records for tabs that no longer exist", async () => {
    sessionStorage.get.mockResolvedValue({
      "sessions:test": { "7": { sessionId: "stale", createdAt: 1 } },
    });
    tabsGet.mockImplementation(async () => { throw new Error("No tab"); });
    const registry = new SessionRegistry("sessions:test");
    await registry.hydrate();
    expect(registry.findTab("stale")).toBeUndefined();
  });

  it("shares one hydration operation and ignores malformed or mismatched records", async () => {
    sessionStorage.get.mockResolvedValue({
      "sessions:test": {
        "0": { sessionId: "zero", createdAt: 1 },
        "-2": { sessionId: "negative", createdAt: 1 },
        "2.5": { sessionId: "fraction", createdAt: 1 },
        "3": { sessionId: "", createdAt: 1 },
        "4": { sessionId: 44, createdAt: 1 },
        "5": { sessionId: "mismatch", createdAt: 1 },
        "6": { sessionId: "valid", createdAt: 1 },
      },
    });
    tabsGet.mockImplementation(async (tabId) => ({ id: tabId === 5 ? 50 : tabId }));
    const registry = new SessionRegistry("sessions:test");

    const first = registry.hydrate();
    const second = registry.hydrate();
    expect(second).toBe(first);
    await first;

    expect(registry.sessions).toEqual(new Map([[6, "valid"]]));
    expect(registry.hydrate()).toBe(first);
  });

  it.each([undefined, null, "invalid"])("ignores a non-record persisted value %#", async (value) => {
    sessionStorage.get.mockResolvedValue({ "sessions:test": value });
    const registry = new SessionRegistry("sessions:test");

    await expect(registry.hydrate()).resolves.toBeUndefined();
    expect(registry.sessions.size).toBe(0);
    expect(chrome.tabs.get).not.toHaveBeenCalled();
  });

  it("keeps in-memory ownership when persistence fails", async () => {
    sessionStorage.set.mockRejectedValue(new Error("storage unavailable"));
    const registry = new SessionRegistry("sessions:test");

    await expect(registry.register(12, "session-12")).resolves.toBeUndefined();
    expect(registry.findTab("session-12")).toBe(12);

    registry.remove(12);
    await vi.waitFor(() => expect(sessionStorage.set).toHaveBeenCalledTimes(2));
    expect(registry.findTab("session-12")).toBeUndefined();
  });
});
