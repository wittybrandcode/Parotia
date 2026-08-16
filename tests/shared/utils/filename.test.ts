import { describe, expect, it } from "vitest";
import { buildCaptureFilename, sanitizeFilenamePart, timestampPart } from "@shared/utils/filename";

describe("sanitizeFilenamePart", () => {
  it("strips path separators and reserved characters", () => {
    expect(sanitizeFilenamePart("a/b\\c:d*e?f\"g<h>i|j")).toBe("a-b-c-d-e-f-g-h-i-j");
  });

  it("replaces whitespace runs with single hyphens (leading/trailing hyphens are kept)", () => {
    expect(sanitizeFilenamePart("  Breaking   News   ")).toBe("-Breaking-News-");
  });

  it("removes control characters", () => {
    expect(sanitizeFilenamePart("head\u0000line\u0007")).toBe("headline");
  });

  it("strips leading and trailing dots", () => {
    expect(sanitizeFilenamePart("..hidden...")).toBe("hidden");
  });

  it("neutralizes dot-dot path traversal characters", () => {
    // Backslashes become hyphens; leading dots are stripped so no dot-dot remains.
    expect(sanitizeFilenamePart("..\\..\\etc")).toBe("-..-etc");
  });

  it("caps the length and falls back to a default basename", () => {
    expect(sanitizeFilenamePart("x".repeat(500))).toHaveLength(80);
    expect(sanitizeFilenamePart("...")).toBe("article");
  });
});

describe("buildCaptureFilename", () => {
  it("builds a deterministic newsroom filename", () => {
    expect(buildCaptureFilename(new Date(2026, 0, 5))).toBe("news-clean-2026-01-05-article.png");
  });
});

describe("timestampPart", () => {
  it("formats as YYYYMMDD-HHmmss", () => {
    expect(timestampPart(new Date(2026, 11, 31, 9, 8, 7))).toBe("20261231-090807");
  });

  it("pads single-digit components", () => {
    expect(timestampPart(new Date(2026, 0, 2, 3, 4, 5))).toBe("20260102-030405");
  });
});
