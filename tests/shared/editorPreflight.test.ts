import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EDITOR_MEMORY_BUDGET_BYTES,
  MAX_EDITOR_MEMORY_BUDGET_BYTES,
  MIN_EDITOR_MEMORY_BUDGET_BYTES,
  assessEditorImage,
  detectedDeviceMemoryGb,
  editorBypassWarning,
  editorMemoryBudget,
  formatEditorImageIdentity,
  readPngMetadata,
} from "@shared/utils/editorPreflight";

function pngHeader(width: number, height: number, extraBytes = 0): string {
  const bytes = new Uint8Array(24 + extraBytes);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `data:image/png;base64,${btoa(binary)}`;
}

describe("large-image editor preflight", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as Navigator & { deviceMemory?: unknown }).deviceMemory;
  });

  it("reads dimensions from PNG IHDR without decoding the whole image", () => {
    expect(readPngMetadata(pngHeader(1600, 8088))).toEqual({
      width: 1600,
      height: 8088,
      pixels: 12_940_800,
      encodedBytes: 24,
    });
    expect(readPngMetadata("data:image/png;base64,AAAA")).toBeNull();
    expect(readPngMetadata("data:image/jpeg;base64,AAAA")).toBeNull();
  });

  it("rejects truncated, corrupt, zero-sized and unsafe PNG headers", () => {
    expect(readPngMetadata(`data:image/png;base64,${"A".repeat(33)}`)).toBeNull();
    const shortAtob = vi.spyOn(globalThis, "atob").mockReturnValue("short");
    expect(readPngMetadata(`data:image/png;base64,${"A".repeat(32)}`)).toBeNull();
    shortAtob.mockRestore();

    const corrupt = pngHeader(10, 10).replace("iVBOR", "AAAAA");
    expect(readPngMetadata(corrupt)).toBeNull();
    expect(readPngMetadata(pngHeader(0, 10))).toBeNull();
    expect(readPngMetadata(pngHeader(0xffff_ffff, 0xffff_ffff))).toBeNull();

    vi.spyOn(globalThis, "atob").mockImplementation(() => { throw new Error("decode failed"); });
    expect(readPngMetadata(`data:image/png;base64,${"A".repeat(32)}`)).toBeNull();
  });

  it("accounts for base64 padding in the encoded byte estimate", () => {
    expect(readPngMetadata(pngHeader(2, 3, 1))?.encodedBytes).toBe(25);
    expect(readPngMetadata(pngHeader(2, 3, 2))?.encodedBytes).toBe(26);
  });

  it("derives a bounded memory budget from coarse device memory", () => {
    expect(editorMemoryBudget()).toBe(DEFAULT_EDITOR_MEMORY_BUDGET_BYTES);
    expect(editorMemoryBudget(Number.NaN)).toBe(DEFAULT_EDITOR_MEMORY_BUDGET_BYTES);
    expect(editorMemoryBudget(0)).toBe(DEFAULT_EDITOR_MEMORY_BUDGET_BYTES);
    expect(editorMemoryBudget(-1)).toBe(DEFAULT_EDITOR_MEMORY_BUDGET_BYTES);
    expect(editorMemoryBudget(1)).toBe(MIN_EDITOR_MEMORY_BUDGET_BYTES);
    expect(editorMemoryBudget(64)).toBe(MAX_EDITOR_MEMORY_BUDGET_BYTES);
  });

  it("accepts only a finite positive navigator device-memory value", () => {
    expect(detectedDeviceMemoryGb()).toBeUndefined();
    Object.defineProperty(navigator, "deviceMemory", { value: "8", configurable: true });
    expect(detectedDeviceMemoryGb()).toBeUndefined();
    Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });
    expect(detectedDeviceMemoryGb()).toBe(8);
  });

  it("allows the reported 8088px image when its total working set is safe", () => {
    const decision = assessEditorImage(pngHeader(1600, 8088), 8);
    expect(decision.mode).toBe("EDIT");
    expect(decision.reason).toBe("SAFE");
    expect(formatEditorImageIdentity(decision.metadata!)).toBe("1600 × 8088 · 12.9 MP");
  });

  it("bypasses editing when a dimension exceeds the current canvas policy", () => {
    const decision = assessEditorImage(pngHeader(20_000, 100), 8);
    expect(decision.mode).toBe("BYPASS");
    expect(decision.reason).toBe("DIMENSION_LIMIT");
    expect(editorBypassWarning(decision)).toContain("20000×100px");
    expect(editorBypassWarning(decision)).toContain("saved without opening the editor");
  });

  it("bypasses editing when the hard pixel cap is exceeded", () => {
    const decision = assessEditorImage(pngHeader(10_000, 5_000), 8);
    expect(decision.mode).toBe("BYPASS");
    expect(decision.reason).toBe("PIXEL_LIMIT");
    expect(editorBypassWarning(decision)).toContain("editor limit");
  });

  it("bypasses editing when decoded surfaces exceed the device budget", () => {
    const decision = assessEditorImage(pngHeader(8_000, 3_000), 2);
    expect(decision.mode).toBe("BYPASS");
    expect(decision.reason).toBe("MEMORY_LIMIT");
    expect(decision.estimatedWorkingBytes).toBeGreaterThan(decision.memoryBudgetBytes);
    expect(editorBypassWarning(decision)).toContain("safe memory budget");
  });

  it("keeps legacy unverified inputs explicit instead of inventing dimensions", () => {
    const decision = assessEditorImage("data:image/png;base64,AAAA", 8);
    expect(decision.mode).toBe("UNVERIFIED");
    expect(decision.metadata).toBeNull();
    expect(editorBypassWarning(decision)).toBe("The image could not be opened safely in the editor.");
  });

  it("uses a defensive generic limit for a bypass decision with an unknown reason", () => {
    const safe = assessEditorImage(pngHeader(10, 10), 8);
    const warning = editorBypassWarning({ ...safe, mode: "BYPASS", reason: "SAFE" });
    expect(warning).toContain("safe editor budget");
  });
});
