import type { CaptureMode } from "./preset";

export interface UserSettings {
  language: "ar" | "fr" | "en";
  toolbar: ToolbarSettings;
  capture: CaptureSettings;
  behavior: BehaviorSettings;
}

export interface ToolbarSettings {
  position: "TOP_CENTER" | "TOP_RIGHT" | "TOP_LEFT";
  compact: boolean;
}

export interface CaptureSettings {
  defaultMode?: CaptureMode;
  respectDevicePixelRatio: boolean;
}

export interface BehaviorSettings {
  showPresetSuggestions: boolean;
  confirmBulkCleanup: boolean;
  showOnboarding: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  language: "en",
  toolbar: { position: "TOP_RIGHT", compact: true },
  capture: { respectDevicePixelRatio: true },
  behavior: { showPresetSuggestions: true, confirmBulkCleanup: true, showOnboarding: true },
};
