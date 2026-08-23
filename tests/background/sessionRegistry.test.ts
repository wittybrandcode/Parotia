import { beforeEach, describe, expect, it } from "vitest";
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
});
