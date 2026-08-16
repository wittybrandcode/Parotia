import type { SitePreset } from "@shared/types";

/**
 * Repository contracts. The UI must never call `chrome.storage` directly:
 * `UI → Service → Repository → Chrome Storage`.
 */
export interface PresetRepository {
  list(): Promise<SitePreset[]>;
  get(id: string): Promise<SitePreset | null>;
  save(preset: SitePreset): Promise<void>;
  delete(id: string): Promise<void>;
}
