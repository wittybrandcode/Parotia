import type { FreezeStrategy } from "./freeze";
import type { CaptureProgress } from "./capture";
import type { Rect } from "./element";
import { validPngDataUrl } from "../utils/png";

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
  | { type: "CAPTURE_ELEMENT_CROP"; payload: { sessionId: string; dataUrl: string; dpr: number; rect: { left: number; top: number; width: number; height: number } } }
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
  | { type: "PREPARE_REGION_CAPTURE"; payload: { sessionId: string } }
  | { type: "RESTORE_REGION_CAPTURE"; payload: { sessionId: string } }
  | { type: "GET_STATE"; payload: { sessionId: string } }
  | { type: "CLOSE_TOOLBAR"; payload: { sessionId: string } }
  | { type: "OPEN_EDITOR"; payload: { sessionId: string; imageKey: string; filename: string; editorToken: string } }
  | { type: "DOWNLOAD_EDITOR_RESULT"; payload: { editorToken: string; dataUrl: string; filename: string } }
  | { type: "DISCARD_EDITOR_RESULT"; payload: { editorToken: string } };

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
  "CAPTURE_ELEMENT_CROP",
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
  "PREPARE_REGION_CAPTURE",
  "RESTORE_REGION_CAPTURE",
  "GET_STATE",
  "CLOSE_TOOLBAR",
  "OPEN_EDITOR",
  "DOWNLOAD_EDITOR_RESULT",
  "DISCARD_EDITOR_RESULT",
] as const;

export function isBackgroundCommand(value: unknown): value is BackgroundCommand {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { type?: unknown };
  return typeof v.type === "string" && (BACKGROUND_COMMAND_TYPES as readonly string[]).includes(v.type);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, max = 4096): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validRect(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return finiteNumber(value.x)
    && finiteNumber(value.y)
    && finiteNumber(value.width)
    && finiteNumber(value.height)
    && value.width > 0
    && value.height > 0;
}

/** Shared structural validation used at both privileged message boundaries. */
export function validateBackgroundCommandShape(value: unknown): string | null {
  if (!isBackgroundCommand(value)) return "Unknown command";
  if (!isRecord(value.payload)) return "Payload must be an object";
  const payload = value.payload as Record<string, unknown>;
  if (
    value.type !== "START_SESSION"
    && value.type !== "DOWNLOAD_EDITOR_RESULT"
    && value.type !== "DISCARD_EDITOR_RESULT"
    && !nonEmptyString(payload.sessionId, 256)
  ) {
    return "Missing or invalid sessionId";
  }
  switch (value.type) {
    case "START_SESSION":
      if (payload.sessionId !== undefined && !nonEmptyString(payload.sessionId, 256)) return "Invalid sessionId";
      break;
    case "FREEZE_PAGE":
      if (payload.strategy !== undefined && payload.strategy !== "SOFT_FREEZE" && payload.strategy !== "HARD_FREEZE") return "Invalid freeze strategy";
      break;
    case "DELETE_ELEMENT":
    case "HIDE_ELEMENT":
    case "SHOW_ELEMENT":
    case "DELETE_MATCHING":
    case "PREPARE_ELEMENT_CAPTURE":
      if (!nonEmptyString(payload.elementId, 512)) return "Missing or invalid elementId";
      if (value.type === "DELETE_MATCHING") {
        if (payload.confirm !== undefined && typeof payload.confirm !== "boolean") return "Invalid confirmation flag";
        if (payload.token !== undefined && !nonEmptyString(payload.token, 256)) return "Invalid confirmation token";
      }
      break;
    case "UNDO_TO":
      if (!nonEmptyString(payload.entryId, 512)) return "Missing or invalid entryId";
      break;
    case "CAPTURE":
      if (!["VISIBLE", "FULL_PAGE", "ELEMENT", "REGION"].includes(String(payload.mode))) return "Invalid capture mode";
      if (payload.mode === "ELEMENT" && !nonEmptyString(payload.elementId, 512)) return "Missing or invalid elementId";
      break;
    case "CAPTURE_SCROLL":
    case "CAPTURE_ELEMENT_SCROLL":
      if (!finiteNumber(payload.scrollYCss)) return "Invalid scrollYCss";
      break;
    case "CAPTURE_SLICE":
    case "CAPTURE_ELEMENT_SLICE":
      if (!nonEmptyString(payload.dataUrl, 150_000_000) || !String(payload.dataUrl).startsWith("data:image/png")) return "Invalid PNG data";
      if (!finiteNumber(payload.scrollYCss)) return "Invalid scrollYCss";
      break;
    case "CAPTURE_ELEMENT_CROP":
      if (!nonEmptyString(payload.dataUrl, 150_000_000) || !String(payload.dataUrl).startsWith("data:image/png")) return "Invalid PNG data";
      if (!finiteNumber(payload.dpr) || payload.dpr <= 0) return "Invalid dpr";
      if (!isRecord(payload.rect)
        || !finiteNumber(payload.rect.left)
        || !finiteNumber(payload.rect.top)
        || !finiteNumber(payload.rect.width)
        || !finiteNumber(payload.rect.height)
        || payload.rect.left < 0
        || payload.rect.top < 0
        || payload.rect.width <= 0
        || payload.rect.height <= 0) return "Invalid element rect";
      break;
    case "CAPTURE_ELEMENT_FINALIZE":
      if (!finiteNumber(payload.dpr) || payload.dpr <= 0) return "Invalid dpr";
      if (!isRecord(payload.rect)
        || !finiteNumber(payload.rect.left)
        || !finiteNumber(payload.rect.top)
        || !finiteNumber(payload.rect.width)
        || !finiteNumber(payload.rect.height)
        || payload.rect.width <= 0
        || payload.rect.height <= 0) return "Invalid element rect";
      break;
    case "SELECT_REGION":
      if (!validRect(payload.rect) || !finiteNumber(payload.scrollY) || !finiteNumber(payload.dpr) || payload.dpr <= 0) return "Invalid region payload";
      break;
    case "CAPTURE_REGION_CROP":
      if (!validRect(payload.rect) || !finiteNumber(payload.dpr) || payload.dpr <= 0) return "Invalid region payload";
      if (!nonEmptyString(payload.dataUrl, 150_000_000) || !String(payload.dataUrl).startsWith("data:image/png")) return "Invalid PNG data";
      break;
    case "OPEN_EDITOR":
      if (!nonEmptyString(payload.imageKey, 512) || !nonEmptyString(payload.filename, 255) || typeof payload.editorToken !== "string" || !/^[a-f0-9]{48}$/.test(payload.editorToken)) return "Invalid editor payload";
      break;
    case "DOWNLOAD_EDITOR_RESULT":
      if (typeof payload.editorToken !== "string" || !/^[a-f0-9]{48}$/.test(payload.editorToken) || !nonEmptyString(payload.filename, 255) || !validPngDataUrl(payload.dataUrl)) return "Invalid editor result";
      break;
    case "DISCARD_EDITOR_RESULT":
      if (typeof payload.editorToken !== "string" || !/^[a-f0-9]{48}$/.test(payload.editorToken)) return "Invalid editor token";
      break;
    default:
      break;
  }
  return null;
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
