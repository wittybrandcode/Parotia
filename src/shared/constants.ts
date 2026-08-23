/** Overlay root used by the content runtime. */
export const OVERLAY_ROOT_ID = "__newsclean__";
/** Stable marker attribute for UI-exclusion during inspection. */
export const OVERLAY_ROOT_MARKER = "data-newsclean-root";
/** Legacy wire names remain accepted during the 1.x compatibility window. */
export const LEGACY_UI_MESSAGE_SOURCE = "newsclean-ui";
export const LEGACY_CONTENT_MESSAGE_SOURCE = "newsclean-content";
export const UI_MESSAGE_SOURCE = "parotia-ui";
export const CONTENT_MESSAGE_SOURCE = "parotia-content";

/** Freeze stability window (ms) before the page is declared FROZEN. */
export const STABILITY_WINDOW_MS = 500;
/** Absolute freeze deadline for continuously mutating pages. */
export const MAX_FREEZE_WAIT_MS = 5000;

/** MVP history cap: logical operations retained for Undo. */
export const MAX_HISTORY_OPERATIONS = 100;

/** Confidence thresholds shared by extraction. */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.9,
  medium: 0.7,
} as const;

/** Characters that must never appear in an exported filename. */
export const FILENAME_FORBIDDEN_CHARS = /[\\/:*?"<>|]/g;
