import { describe, expect, it } from "vitest";
import { scoreCandidate } from "@content/extraction/extractionEngine";

describe("scoreCandidate", () => {
  it("scores a long text-heavy block higher than a short one", () => {
    const long = document.createElement("div");
    long.textContent = "word ".repeat(600);

    const short = document.createElement("div");
    short.textContent = "short";

    expect(scoreCandidate(long)).toBeGreaterThan(scoreCandidate(short));
  });

  it("penalizes link-heavy blocks", () => {
    const texty = document.createElement("div");
    texty.textContent = "content ".repeat(200);

    const linky = document.createElement("div");
    linky.textContent = "content ".repeat(200);
    for (let i = 0; i < 40; i++) {
      const a = document.createElement("a");
      a.textContent = "link";
      linky.appendChild(a);
    }

    expect(scoreCandidate(texty)).toBeGreaterThan(scoreCandidate(linky));
  });

  it("returns 0 for empty content", () => {
    const empty = document.createElement("div");
    expect(scoreCandidate(empty)).toBe(0);
  });
});
