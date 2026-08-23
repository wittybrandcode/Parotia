import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/**
 * Minimal chrome.* stub for unit tests. Only what engines touch is provided;
 * add members as tests need them rather than mocking everything.
 */
const listeners = new Set<(...args: unknown[]) => unknown>();

const chromeStub = {
  runtime: {
    onMessage: {
      addListener: (fn: (...args: unknown[]) => unknown) => {
        listeners.add(fn);
      },
      removeListener: (fn: (...args: unknown[]) => unknown) => {
        listeners.delete(fn);
      },
    },
    sendMessage: vi.fn(),
    getURL: () => "about:blank",
  },
  tabs: {
    query: vi.fn(),
    get: vi.fn(async (tabId: number) => ({ id: tabId })),
    sendMessage: vi.fn(),
    onRemoved: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() },
  },
  action: { onClicked: { addListener: vi.fn() } },
  scripting: { executeScript: vi.fn() },
  downloads: { download: vi.fn() as (...args: unknown[]) => Promise<number> },
  storage: {
    session: {
      get: vi.fn(async (_keys?: string | string[] | Record<string, unknown> | null) => ({})),
      set: vi.fn(async (_items: Record<string, unknown>) => undefined),
      remove: vi.fn(async (_keys: string | string[]) => undefined),
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
};

(globalThis as Record<string, unknown>).chrome = chromeStub;
