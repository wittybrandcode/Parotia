import { describe, expect, it } from "vitest";
import { validPngDataUrl } from "@shared/utils/png";

describe("validPngDataUrl", () => {
  it.each([
    undefined,
    12,
    "",
    "data:image/jpeg;base64,iVBORw0KGgo=",
    "data:image/png;base64,",
    "data:image/png;base64,abc",
    "data:image/png;base64,@@@@",
    "data:image/png;base64,QUJDRA==",
  ])("rejects malformed input %#", (value) => {
    expect(validPngDataUrl(value)).toBe(false);
  });

  it("accounts for zero, one and two base64 padding bytes", () => {
    expect(validPngDataUrl("data:image/png;base64,iVBORw0KGgoA", 9)).toBe(true);
    expect(validPngDataUrl("data:image/png;base64,iVBORw0KGgo=", 8)).toBe(true);
    expect(validPngDataUrl("data:image/png;base64,iVBORw0KGgoAAA==", 10)).toBe(true);
    expect(validPngDataUrl("data:image/png;base64,iVBORw0KGgoA", 8)).toBe(false);
  });
});
