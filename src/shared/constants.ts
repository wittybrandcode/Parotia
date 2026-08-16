/** Namespaced storage keys (avoid generic keys like `settings`, `data`, `config`). */
export const STORAGE_KEYS = {
  settings: "newsclean.settings",
  presets: "newsclean.presets",
  schemaVersion: "newsclean.schemaVersion",
} as const;

/** Current persistent schema version. Bump on breaking schema changes. */
export const SCHEMA_VERSION = 1;

/** chrome.storage.local quota (bytes) — keep persistent data far below this. */
export const STORAGE_LOCAL_QUOTA_BYTES = 10 * 1024 * 1024;

/** Overlay root used by the content runtime. */
export const OVERLAY_ROOT_ID = "__newsclean__";
/** Stable marker attribute for UI-exclusion during inspection. */
export const OVERLAY_ROOT_MARKER = "data-newsclean-root";

/** Freeze stability window (ms) before the page is declared FROZEN. */
export const STABILITY_WINDOW_MS = 500;

/** MVP history cap: logical operations retained for Undo. */
export const MAX_HISTORY_OPERATIONS = 100;

/** Performance engineering targets (see TESTING doc). */
export const PERF_TARGETS = {
  inspectorActivationMs: 100,
  inspectionFrameMs: 16,
  selectorOpMs: 50,
  presetValidationMs: 250,
  extractionMs: 500,
  captureVisibleMs: 500,
  captureSingleSegmentMs: 2000,
} as const;

/** Extraction performance targets. */
export const EXTRACTION_TARGETS = {
  passiveMs: 50,
  standardMs: 250,
} as const;

/** Confidence thresholds shared by extraction. */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.9,
  medium: 0.7,
} as const;

/** Characters that must never appear in an exported filename. */
export const FILENAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/g;

/** PNG signature used in post-capture verification. */
export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
