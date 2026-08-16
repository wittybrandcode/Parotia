import { describe, expect, it } from "vitest";
import { createId } from "@shared/utils/id";

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
