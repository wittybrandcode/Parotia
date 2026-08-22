/** Overlay root used by the content runtime. */
export const OVERLAY_ROOT_ID = "__newsclean__";
/** Stable marker attribute for UI-exclusion during inspection. */
export const OVERLAY_ROOT_MARKER = "data-newsclean-root";

/** Freeze stability window (ms) before the page is declared FROZEN. */
export const STABILITY_WINDOW_MS = 500;

/** MVP history cap: logical operations retained for Undo. */
export const MAX_HISTORY_OPERATIONS = 100;

/** Confidence thresholds shared by extraction. */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.9,
  medium: 0.7,
} as const;

/** Characters that must never appear in an exported filename. */
export const FILENAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/g;
