import type { SitePreset } from "@shared/types";
import { SCHEMA_VERSION } from "@shared/constants";
import type { PresetRepository } from "./repository";
import { SitePresetSchema, StoredPresetsSchema, normalizePreset } from "./schema";

const KEYS = {
  presets: "newsclean.presets",
} as const;

/** Simple async mutex to prevent read-modify-write races on the preset map. */
let presetLock: Promise<unknown> = Promise.resolve();

function withPresetLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = presetLock.then(() => {
    let resolve!: () => void;
    presetLock = new Promise<void>((r) => { resolve = r; });
    return resolve;
  });
  return release.then((resolve) => fn().finally(resolve));
}

/**
 * chrome.storage.local backed repository. Values written atomically after
 * validation; reads always pass through `LOAD → VALIDATE → NORMALIZE → USE`.
 */
export class ChromeStoragePresetRepository implements PresetRepository {
  async list(): Promise<SitePreset[]> {
    const store = await chrome.storage.local.get(KEYS.presets);
    const raw = store[KEYS.presets];
    if (raw === undefined) return [];
    const parsed = StoredPresetsSchema.safeParse(raw);
    if (!parsed.success) return [];
    return Object.values(parsed.data)
      .filter((p) => p.schemaVersion <= SCHEMA_VERSION)
      .map(normalizePreset);
  }

  async get(id: string): Promise<SitePreset | null> {
    const all = await this.list();
    return all.find((p) => p.id === id) ?? null;
  }

  async save(preset: SitePreset): Promise<void> {
    return withPresetLock(async () => {
      // Validate before writing — never write half then validate.
      const parsed = SitePresetSchema.safeParse(preset);
      if (!parsed.success) {
        throw new Error("Preset validation failed before save");
      }
      const store = await chrome.storage.local.get(KEYS.presets);
      const current = StoredPresetsSchema.safeParse(store[KEYS.presets]).success
        ? (store[KEYS.presets] as Record<string, SitePreset>)
        : {};
      current[preset.id] = preset;
      await chrome.storage.local.set({ [KEYS.presets]: current });
    });
  }

  async delete(id: string): Promise<void> {
    return withPresetLock(async () => {
      const store = await chrome.storage.local.get(KEYS.presets);
      const current = StoredPresetsSchema.safeParse(store[KEYS.presets]).success
        ? (store[KEYS.presets] as Record<string, SitePreset>)
        : {};
      delete current[id];
      await chrome.storage.local.set({ [KEYS.presets]: current });
    });
  }
}
