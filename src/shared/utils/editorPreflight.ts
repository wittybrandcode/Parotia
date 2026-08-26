const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/** Conservative cross-GPU limit for the current single-canvas/Konva editor. */
export const MAX_EDITOR_DIMENSION = 16_384;
/** Hard cap independent of reported device memory. */
export const MAX_EDITOR_PIXELS = 32 * 1024 * 1024;
/** Decoded source + engine + Konva + snapshot/export + transient work surface. */
export const EDITOR_RGBA_SURFACE_COUNT = 5;
export const DEFAULT_EDITOR_MEMORY_BUDGET_BYTES = 384 * MIB;
export const MIN_EDITOR_MEMORY_BUDGET_BYTES = 256 * MIB;
export const MAX_EDITOR_MEMORY_BUDGET_BYTES = 512 * MIB;

export interface PngMetadata {
  width: number;
  height: number;
  pixels: number;
  encodedBytes: number;
}

export type EditorPreflightReason =
  | "SAFE"
  | "UNVERIFIED"
  | "DIMENSION_LIMIT"
  | "PIXEL_LIMIT"
  | "MEMORY_LIMIT";

export interface EditorPreflightDecision {
  mode: "EDIT" | "BYPASS" | "UNVERIFIED";
  reason: EditorPreflightReason;
  metadata: PngMetadata | null;
  memoryBudgetBytes: number;
  estimatedWorkingBytes: number;
  maxPixels: number;
  maxDimension: number;
}

function encodedByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, ((base64.length / 4) * 3) - padding);
}

function readUint32(bytes: string, offset: number): number {
  return (
    ((bytes.charCodeAt(offset) & 0xff) * 0x1000000)
    + ((bytes.charCodeAt(offset + 1) & 0xff) << 16)
    + ((bytes.charCodeAt(offset + 2) & 0xff) << 8)
    + (bytes.charCodeAt(offset + 3) & 0xff)
  );
}

/** Reads PNG IHDR dimensions by decoding only the first 24 bytes. */
export function readPngMetadata(dataUrl: unknown): PngMetadata | null {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const base64 = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  if (base64.length < 32 || base64.length % 4 !== 0) return null;
  try {
    const header = atob(base64.slice(0, 32));
    if (header.length < 24) return null;
    if (
      header.charCodeAt(0) !== 0x89
      || header.slice(1, 4) !== "PNG"
      || header.charCodeAt(4) !== 0x0d
      || header.charCodeAt(5) !== 0x0a
      || header.charCodeAt(6) !== 0x1a
      || header.charCodeAt(7) !== 0x0a
      || header.slice(12, 16) !== "IHDR"
    ) return null;
    const width = readUint32(header, 16);
    const height = readUint32(header, 20);
    const pixels = width * height;
    if (width <= 0 || height <= 0 || !Number.isSafeInteger(pixels) || pixels <= 0) return null;
    return { width, height, pixels, encodedBytes: encodedByteLength(base64) };
  } catch {
    return null;
  }
}

/** Uses a bounded fraction of reported RAM; deviceMemory is coarse by design. */
export function editorMemoryBudget(deviceMemoryGb?: number): number {
  if (deviceMemoryGb === undefined || !Number.isFinite(deviceMemoryGb) || deviceMemoryGb <= 0) {
    return DEFAULT_EDITOR_MEMORY_BUDGET_BYTES;
  }
  const proportional = Math.floor(deviceMemoryGb * GIB * 0.1);
  return Math.min(MAX_EDITOR_MEMORY_BUDGET_BYTES, Math.max(MIN_EDITOR_MEMORY_BUDGET_BYTES, proportional));
}

export function detectedDeviceMemoryGb(): number | undefined {
  const value = (globalThis.navigator as Navigator & { deviceMemory?: unknown } | undefined)?.deviceMemory;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Estimates peak working memory before any image decode or Canvas allocation.
 * The current editor is safe only in EDIT mode. BYPASS means download the
 * original PNG without opening the editor; UNVERIFIED preserves compatibility
 * for legacy/internal inputs whose IHDR cannot be read.
 */
export function assessEditorImage(dataUrl: unknown, deviceMemoryGb?: number): EditorPreflightDecision {
  const metadata = readPngMetadata(dataUrl);
  const memoryBudgetBytes = editorMemoryBudget(deviceMemoryGb);
  if (!metadata) {
    return {
      mode: "UNVERIFIED",
      reason: "UNVERIFIED",
      metadata: null,
      memoryBudgetBytes,
      estimatedWorkingBytes: 0,
      maxPixels: MAX_EDITOR_PIXELS,
      maxDimension: MAX_EDITOR_DIMENSION,
    };
  }

  const decodedSurfaceBytes = metadata.pixels * 4;
  const estimatedWorkingBytes = (decodedSurfaceBytes * EDITOR_RGBA_SURFACE_COUNT) + (metadata.encodedBytes * 2);
  let reason: EditorPreflightReason = "SAFE";
  if (metadata.width > MAX_EDITOR_DIMENSION || metadata.height > MAX_EDITOR_DIMENSION) {
    reason = "DIMENSION_LIMIT";
  } else if (metadata.pixels > MAX_EDITOR_PIXELS) {
    reason = "PIXEL_LIMIT";
  } else if (estimatedWorkingBytes > memoryBudgetBytes) {
    reason = "MEMORY_LIMIT";
  }
  return {
    mode: reason === "SAFE" ? "EDIT" : "BYPASS",
    reason,
    metadata,
    memoryBudgetBytes,
    estimatedWorkingBytes,
    maxPixels: MAX_EDITOR_PIXELS,
    maxDimension: MAX_EDITOR_DIMENSION,
  };
}

function megapixels(pixels: number): string {
  return (pixels / 1_000_000).toFixed(1);
}

function mebibytes(bytes: number): string {
  return Math.ceil(bytes / MIB).toString();
}

export function editorBypassWarning(decision: EditorPreflightDecision): string {
  const metadata = decision.metadata;
  if (!metadata || decision.mode !== "BYPASS") {
    return "The image could not be opened safely in the editor.";
  }
  const identity = `${metadata.width}×${metadata.height}px (${megapixels(metadata.pixels)} MP)`;
  let limit: string;
  switch (decision.reason) {
    case "DIMENSION_LIMIT":
      limit = `the ${decision.maxDimension}px editor dimension limit`;
      break;
    case "PIXEL_LIMIT":
      limit = `the ${(decision.maxPixels / 1_000_000).toFixed(1)} MP editor limit`;
      break;
    case "MEMORY_LIMIT":
      limit = `the ${mebibytes(decision.memoryBudgetBytes)} MiB safe memory budget`;
      break;
    default:
      limit = "the safe editor budget";
      break;
  }
  return `Image ${identity} exceeds ${limit}. The original PNG was saved without opening the editor to prevent the tab from running out of memory.`;
}

export function formatEditorImageIdentity(metadata: PngMetadata): string {
  return `${metadata.width} × ${metadata.height} · ${megapixels(metadata.pixels)} MP`;
}
