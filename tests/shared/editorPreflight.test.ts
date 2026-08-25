import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_MEMORY_BUDGET_BYTES,
  MAX_EDITOR_MEMORY_BUDGET_BYTES,
  MIN_EDITOR_MEMORY_BUDGET_BYTES,
  assessEditorImage,
  editorBypassWarning,
  editorMemoryBudget,
  formatEditorImageIdentity,
  readPngMetadata,
} from "@shared/utils/editorPreflight";

function pngHeader(width: number, height: number): string {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `data:image/png;base64,${btoa(binary)}`;
}

describe("large-image editor preflight", () => {
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

  it("derives a bounded memory budget from coarse device memory", () => {
    expect(editorMemoryBudget()).toBe(DEFAULT_EDITOR_MEMORY_BUDGET_BYTES);
    expect(editorMemoryBudget(Number.NaN)).toBe(DEFAULT_EDITOR_MEMORY_BUDGET_BYTES);
    expect(editorMemoryBudget(1)).toBe(MIN_EDITOR_MEMORY_BUDGET_BYTES);
    expect(editorMemoryBudget(64)).toBe(MAX_EDITOR_MEMORY_BUDGET_BYTES);
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
  });

  it("bypasses editing when decoded surfaces exceed the device budget", () => {
    const decision = assessEditorImage(pngHeader(8_000, 3_000), 2);
    expect(decision.mode).toBe("BYPASS");
    expect(decision.reason).toBe("MEMORY_LIMIT");
    expect(decision.estimatedWorkingBytes).toBeGreaterThan(decision.memoryBudgetBytes);
  });

  it("keeps legacy unverified inputs explicit instead of inventing dimensions", () => {
    const decision = assessEditorImage("data:image/png;base64,AAAA", 8);
    expect(decision.mode).toBe("UNVERIFIED");
    expect(decision.metadata).toBeNull();
  });
});
