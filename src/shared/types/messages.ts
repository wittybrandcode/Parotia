import type { FreezeStrategy } from "./freeze";
import type { CaptureProgress } from "./capture";
import type { Rect } from "./element";

/**
 * Extension message contracts. Messages are typed discriminated unions with a
 * correlation id. Every payload is validated at each privileged boundary
 * before execution. Avoid generic untyped messages like `{ action: "doSomething" }`.
 */

export interface MessageResponse<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/** Commands accepted by the Service Worker (Security doc allowlist). */
export type BackgroundCommand =
  | { type: "START_SESSION"; payload: { sessionId?: string } }
  | { type: "FREEZE_PAGE"; payload: { sessionId: string; strategy?: FreezeStrategy } }
  | { type: "UNFREEZE_PAGE"; payload: { sessionId: string } }
  | { type: "INSPECT_START"; payload: { sessionId: string } }
  | { type: "INSPECT_STOP"; payload: { sessionId: string } }
  | { type: "DELETE_ELEMENT"; payload: { sessionId: string; elementId: string } }
  | { type: "HIDE_ELEMENT"; payload: { sessionId: string; elementId: string } }
  | { type: "SHOW_ELEMENT"; payload: { sessionId: string; elementId: string } }
  | { type: "DELETE_MATCHING"; payload: { sessionId: string; elementId: string; confirm?: boolean; token?: string } }
  | { type: "UNDO"; payload: { sessionId: string } }
  | { type: "REDO"; payload: { sessionId: string } }
  | { type: "UNDO_TO"; payload: { sessionId: string; entryId: string } }
  | { type: "RESET"; payload: { sessionId: string } }
  | { type: "CAPTURE"; payload: { sessionId: string; mode: "VISIBLE" | "FULL_PAGE" | "ELEMENT" | "REGION"; elementId?: string } }
  | { type: "PREPARE_CAPTURE"; payload: { sessionId: string } }
  | { type: "RESTORE_CAPTURE"; payload: { sessionId: string } }
  | { type: "PREPARE_ELEMENT_CAPTURE"; payload: { sessionId: string; elementId: string } }
  | { type: "CAPTURE_ELEMENT_SCROLL"; payload: { sessionId: string; scrollYCss: number } }
  | { type: "CAPTURE_ELEMENT_SLICE"; payload: { sessionId: string; dataUrl: string; scrollYCss: number } }
  | { type: "CAPTURE_ELEMENT_FINALIZE"; payload: { sessionId: string; dpr: number; rect: { left: number; top: number; width: number; height: number } } }
  | { type: "CAPTURE_ELEMENT_RESTORE"; payload: { sessionId: string } }
  | { type: "CAPTURE_STITCH_START"; payload: { sessionId: string } }
  | { type: "CAPTURE_SCROLL"; payload: { sessionId: string; scrollYCss: number } }
  | { type: "CAPTURE_SLICE"; payload: { sessionId: string; dataUrl: string; scrollYCss: number } }
  | { type: "CAPTURE_FINALIZE"; payload: { sessionId: string } }
  | { type: "FREE_SELECT"; payload: { sessionId: string } }
  | { type: "SELECT_REGION"; payload: { sessionId: string; rect: Rect; scrollY: number; dpr: number } }
  | { type: "CAPTURE_REGION_CROP"; payload: { sessionId: string; dataUrl: string; rect: Rect; dpr: number } }
  | { type: "GET_STATE"; payload: { sessionId: string } }
  | { type: "CLOSE_TOOLBAR"; payload: { sessionId: string } };

export const BACKGROUND_COMMAND_TYPES = [
  "START_SESSION",
  "FREEZE_PAGE",
  "UNFREEZE_PAGE",
  "INSPECT_START",
  "INSPECT_STOP",
  "DELETE_ELEMENT",
  "HIDE_ELEMENT",
  "SHOW_ELEMENT",
  "DELETE_MATCHING",
  "UNDO",
  "REDO",
  "UNDO_TO",
  "RESET",
  "CAPTURE",
  "PREPARE_CAPTURE",
  "RESTORE_CAPTURE",
  "PREPARE_ELEMENT_CAPTURE",
  "CAPTURE_ELEMENT_SCROLL",
  "CAPTURE_ELEMENT_SLICE",
  "CAPTURE_ELEMENT_FINALIZE",
  "CAPTURE_ELEMENT_RESTORE",
  "CAPTURE_STITCH_START",
  "CAPTURE_SCROLL",
  "CAPTURE_SLICE",
  "CAPTURE_FINALIZE",
  "FREE_SELECT",
  "SELECT_REGION",
  "CAPTURE_REGION_CROP",
  "GET_STATE",
  "CLOSE_TOOLBAR",
] as const;

export function isBackgroundCommand(value: unknown): value is BackgroundCommand {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { type?: unknown };
  return typeof v.type === "string" && (BACKGROUND_COMMAND_TYPES as readonly string[]).includes(v.type);
}

/** Push notifications from the Service Worker to the content script (never commands). */
export type BackgroundNotification =
  | { type: "CAPTURE_PROGRESS"; payload: { sessionId: string; progress: CaptureProgress } };

export function isBackgroundNotification(value: unknown): value is BackgroundNotification {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { type?: unknown };
  return v.type === "CAPTURE_PROGRESS";
}

export type CommandErrorCode =
  | "UNKNOWN_COMMAND"
  | "INVALID_PAYLOAD"
  | "NOT_FROZEN"
  | "TARGET_NOT_FOUND"
  | "STALE_REFERENCE"
  | "INVALID_SELECTOR"
  | "SESSION_NOT_FOUND"
  | "UNSUPPORTED_PAGE"
  | "CAPTURE_CANCELLED"
  | "PERMISSION_DENIED"
  | "INTERNAL";
