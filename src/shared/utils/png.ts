const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
export const MAX_CAPTURE_PNG_BYTES = 25 * 1024 * 1024;

/** Fast boundary validation for PNG data URLs without decoding the payload. */
export function validPngDataUrl(dataUrl: unknown, maxBytes = MAX_CAPTURE_PNG_BYTES): dataUrl is string {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(PNG_DATA_URL_PREFIX)) return false;
  const base64 = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  if (
    base64.length === 0
    || base64.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
    || !base64.startsWith("iVBORw0KGgo")
  ) return false;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return ((base64.length / 4) * 3) - padding <= maxBytes;
}
