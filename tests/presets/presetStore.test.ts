import { beforeEach, describe, expect, it } from "vitest";
import type { SitePreset } from "@shared/types";
import { ChromeStoragePresetRepository } from "@storage/chromeStorageRepositories";
import { defaultPresets } from "@presets/defaultPresets";

const PRESETS_KEY = "newsclean.presets";

function makePreset(hostname = "example.com", id = "preset-1"): SitePreset {
  return {
    schemaVersion: 1,
    id,
    version: 1,
    site: { hostname },
    cleanup: {
      rules: [{ id: "r1", selector: ".ad", action: "DELETE", enabled: true }],
    },
    metadata: { name: hostname, author: "test", source: "USER_CREATED", createdAt: 1, updatedAt: 1 },
  };
}

/** Turns the vi.fn storage stubs into an in-memory chrome.storage.local. */
function useMemoryStorage(): void {
  const data: Record<string, unknown> = {};
  const local = chrome.storage.local as unknown as {
    get: { mockImplementation: (fn: (key: string) => Promise<Record<string, unknown>>) => void };
    set: { mockImplementation: (fn: (items: Record<string, unknown>) => Promise<void>) => void };
    remove: { mockImplementation: (fn: (key: string) => Promise<void>) => void };
  };
  local.get.mockImplementation(async (key) => ({ [key]: data[key] }));
  local.set.mockImplementation(async (items) => {
    Object.assign(data, items);
  });
  local.remove.mockImplementation(async (key) => {
    delete data[key];
  });
}

describe("ChromeStoragePresetRepository", () => {
  beforeEach(() => {
    useMemoryStorage();
  });

  it("returns an empty list when storage is empty", async () => {
    const repo = new ChromeStoragePresetRepository();
    expect(await repo.list()).toEqual([]);
  });

  it("saves and reads back a preset", async () => {
    const repo = new ChromeStoragePresetRepository();
    await repo.save(makePreset());
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: "preset-1", site: { hostname: "example.com" } });
    expect(await repo.get("preset-1")).not.toBeNull();
  });

  it("merges into the existing map (save does not wipe other presets)", async () => {
    const repo = new ChromeStoragePresetRepository();
    await repo.save(makePreset("a.com", "preset-a"));
    await repo.save(makePreset("b.com", "preset-b"));
    expect(await repo.list()).toHaveLength(2);
  });

  it("updates an existing preset with the same id (merge on save)", async () => {
    const repo = new ChromeStoragePresetRepository();
    await repo.save(makePreset("a.com", "preset-a"));
    const updated = makePreset("a.com", "preset-a");
    updated.cleanup = { rules: [{ id: "r2", selector: ".banner", action: "DELETE", enabled: true }] };
    await repo.save(updated);
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.cleanup?.rules.map((r) => r.selector)).toEqual([".banner"]);
  });

  it("deletes a preset by id", async () => {
    const repo = new ChromeStoragePresetRepository();
    await repo.save(makePreset("a.com", "preset-a"));
    await repo.save(makePreset("b.com", "preset-b"));
    await repo.delete("preset-a");
    expect(await repo.list()).toHaveLength(1);
    expect(await repo.get("preset-a")).toBeNull();
  });

  it("returns null for an unknown id", async () => {
    const repo = new ChromeStoragePresetRepository();
    expect(await repo.get("missing")).toBeNull();
  });

  it("treats corrupted storage as an empty list (LOAD → VALIDATE → NORMALIZE)", async () => {
    const data: Record<string, unknown> = { [PRESETS_KEY]: { bad: "data" } };
    const local = chrome.storage.local as unknown as {
      get: { mockImplementation: (fn: (key: string) => Promise<Record<string, unknown>>) => void };
    };
    local.get.mockImplementation(async (key) => ({ [key]: data[key] }));
    const repo = new ChromeStoragePresetRepository();
    expect(await repo.list()).toEqual([]);
  });

  it("default presets validate against the schema (ready as live examples)", async () => {
    const repo = new ChromeStoragePresetRepository();
    for (const preset of defaultPresets()) {
      await expect(repo.save(preset)).resolves.not.toThrow();
    }
    expect(await repo.list()).toHaveLength(3);
  });
});
