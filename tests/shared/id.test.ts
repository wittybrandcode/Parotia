import { describe, expect, it } from "vitest";
import { createId, elementId } from "@shared/utils/id";

describe("createId", () => {
  it("prepends the given prefix", () => {
    expect(createId("nc-session").startsWith("nc-session-")).toBe(true);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => createId("nc-element")));
    expect(ids.size).toBe(5000);
  });

  it("does not depend on Math.random being deterministic", () => {
    const a = createId("nc");
    const b = createId("nc");
    expect(a).not.toBe(b);
  });
});

describe("elementId", () => {
  it("pads to a 3-digit suffix", () => {
    expect(elementId(1)).toBe("element-001");
    expect(elementId(42)).toBe("element-042");
  });
});
