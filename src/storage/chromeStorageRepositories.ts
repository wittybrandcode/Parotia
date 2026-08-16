import type { SitePreset, UserSettings } from "@shared/types";
import type { PresetRepository, SettingsRepository } from "./repository";
import {
  SitePresetSchema,
  StoredPresetsSchema,
  UserSettingsSchema,
  normalizePreset,
  normalizeSettings,
  requireSchemaVersion,
} from "./schema";

const KEYS = {
  settings: "newsclean.settings",
  presets: "newsclean.presets",
  schemaVersion: "newsclean.schemaVersion",
} as const;

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
    return Object.values(parsed.data).map(normalizePreset);
  }

  async get(id: string): Promise<SitePreset | null> {
    const all = await this.list();
    return all.find((p) => p.id === id) ?? null;
  }

  async save(preset: SitePreset): Promise<void> {
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
  }

  async delete(id: string): Promise<void> {
    const store = await chrome.storage.local.get(KEYS.presets);
    const current = StoredPresetsSchema.safeParse(store[KEYS.presets]).success
      ? (store[KEYS.presets] as Record<string, SitePreset>)
      : {};
    delete current[id];
    await chrome.storage.local.set({ [KEYS.presets]: current });
  }
}

export class ChromeStorageSettingsRepository implements SettingsRepository {
  async get(): Promise<UserSettings> {
    const store = await chrome.storage.local.get(KEYS.settings);
    const raw = store[KEYS.settings];
    if (raw === undefined) throw new Error("Settings not initialized");
    const parsed = UserSettingsSchema.safeParse(raw);
    if (!parsed.success) throw new Error("Settings validation failed");
    return normalizeSettings(parsed.data);
  }

  async save(settings: UserSettings): Promise<void> {
    const parsed = UserSettingsSchema.safeParse(settings);
    if (!parsed.success) {
      throw new Error("Settings validation failed before save");
    }
    await chrome.storage.local.set({ [KEYS.settings]: parsed.data });
  }
}

export async function getStoredSchemaVersion(): Promise<number> {
  const store = await chrome.storage.local.get(KEYS.schemaVersion);
  return requireSchemaVersion(store[KEYS.schemaVersion]);
}

export async function setStoredSchemaVersion(version: number): Promise<void> {
  await chrome.storage.local.set({ [KEYS.schemaVersion]: version });
}
