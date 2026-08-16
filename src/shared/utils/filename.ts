import { FILENAME_FORBIDDEN_CHARS } from "../constants";

/**
 * Sanitize a page-controlled string into a safe basename.
 * Page titles can never produce a path separator, dot-dot, or reserved
 * character. Returns a trimmed basename without directory components.
 */
export function sanitizeFilenamePart(input: string, maxLength = 80): string {
  const cleaned = input
    .normalize("NFKC")
    .replace(FILENAME_FORBIDDEN_CHARS, "-")
    .replace(/\p{Control}/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.]+/, "")
    .replace(/[.]+$/, "")
    .trim();

  return cleaned.slice(0, maxLength) || "article";
}

/** Timestamp component `YYYYMMDD-HHmmss` for source-based export filenames. */
export function timestampPart(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}
