import { beforeEach, describe, expect, it } from "vitest";
import type { SitePreset } from "@shared/types";
import { DefaultCleanupEngine } from "@content/cleanup/cleanupEngine";
import type { ExtractionEngine } from "@content/extraction/extractionEngine";
import { HistoryEngine } from "@content/mutation/history";
import { DefaultMutationEngine } from "@content/mutation/mutationEngine";

const fakeExtraction: ExtractionEngine = {
  run: async () => ({ status: "SUCCESS" as const, confidence: "HIGH" as const, candidates: [] }),
  getState: () => ({ status: "NOT_RUN" as const }),
};

function preset(rules: SitePreset["cleanup"], protection?: SitePreset["protection"]): SitePreset {
  return {
    schemaVersion: 1,
    id: "preset-test",
    version: 1,
    site: { hostname: "example.com" },
    ...(rules ? { cleanup: rules } : {}),
    ...(protection ? { protection } : {}),
    metadata: { name: "Test preset", author: "test" },
  };
}

function setup() {
  const history = new HistoryEngine();
  const mutations = new DefaultMutationEngine(history);
  const cleanup = new DefaultCleanupEngine(mutations, fakeExtraction);
  return { cleanup, mutations };
}

const PAGE = `
  <main id="article">
    <div class="ad-slot">Ad one</div>
    <div class="ad-slot">Ad two</div>
    <div class="ad-slot">Ad three</div>
    <div class="newsletter">Sign up</div>
    <div class="footer-links">Links</div>
    <aside id="keep-me" class="related">Related</aside>
  </main>
`;

describe("DefaultCleanupEngine.applyPreset", () => {
  beforeEach(() => {
    document.body.innerHTML = PAGE;
  });

  it("deletes every match of enabled rules as one undoable batch", () => {
    const { cleanup } = setup();
    const p = preset({
      rules: [
        { id: "r1", selector: ".ad-slot", action: "DELETE", enabled: true },
        { id: "r2", selector: ".newsletter", action: "DELETE", enabled: true },
      ],
    });

    const count = cleanup.applyPreset(p);
    expect(count).toBe(4);
    expect(document.querySelectorAll(".ad-slot")).toHaveLength(0);
    expect(document.querySelector(".newsletter")).toBeNull();
    expect(cleanup.getState().removedCount).toBe(4);
  });

  it("skips disabled rules and unmatched selectors", () => {
    const { cleanup } = setup();
    const p = preset({
      rules: [
        { id: "r1", selector: ".ad-slot", action: "DELETE", enabled: true },
        { id: "r2", selector: ".newsletter", action: "DELETE", enabled: false },
        { id: "r3", selector: ".does-not-exist", action: "DELETE", enabled: true },
      ],
    });

    const count = cleanup.applyPreset(p);
    expect(count).toBe(3);
    expect(document.querySelector(".newsletter")).not.toBeNull();
  });

  it("marks protection-rule matches as keep and never deletes them", () => {
    const { cleanup } = setup();
    const p = preset(
      { rules: [{ id: "r1", selector: ".ad-slot", action: "DELETE", enabled: true }] },
      { rules: [{ id: "keep1", selector: "#keep-me", action: "KEEP", enabled: true }] },
    );

    const count = cleanup.applyPreset(p);
    expect(count).toBe(3);
    const kept = document.querySelector("#keep-me");
    expect(kept).not.toBeNull();
    expect(kept?.getAttribute("data-newsclean-keep")).toBe("true");
  });

  it("never crashes on an invalid selector", () => {
    const { cleanup } = setup();
    const p = preset({
      rules: [
        { id: "bad", selector: "[data-nonsense='", action: "DELETE", enabled: true },
        { id: "r1", selector: ".ad-slot", action: "DELETE", enabled: true },
      ],
    });

    expect(() => cleanup.applyPreset(p)).not.toThrow();
    expect(cleanup.getState().removedCount).toBe(3);
  });

  it("undo restores every deleted element and resets the counters", () => {
    const { cleanup } = setup();
    const p = preset({
      rules: [
        { id: "r1", selector: ".ad-slot", action: "DELETE", enabled: true },
        { id: "r2", selector: ".newsletter", action: "DELETE", enabled: true },
      ],
    });

    cleanup.applyPreset(p);
    expect(cleanup.undo()).toBe(true);
    expect(document.querySelectorAll(".ad-slot")).toHaveLength(3);
    expect(document.querySelector(".newsletter")).not.toBeNull();
    expect(cleanup.getState().removedCount).toBe(0);
  });

  it("is idempotent — applying the same preset twice removes nothing the second time", () => {
    const { cleanup } = setup();
    const p = preset({ rules: [{ id: "r1", selector: ".ad-slot", action: "DELETE", enabled: true }] });

    expect(cleanup.applyPreset(p)).toBe(3);
    expect(cleanup.applyPreset(p)).toBe(0);
    expect(cleanup.getState().removedCount).toBe(3);
  });

  it("HIDE rules hide matches through the mutation engine (undoable)", () => {
    const { cleanup } = setup();
    const p = preset({
      rules: [{ id: "r1", selector: ".ad-slot", action: "HIDE", enabled: true }],
    });

    cleanup.applyPreset(p);
    const hidden = Array.from(document.querySelectorAll(".ad-slot")).filter(
      (el) => (el as HTMLElement).style.display === "none",
    );
    expect(hidden).toHaveLength(3);
    expect(cleanup.getState().hiddenCount).toBe(3);

    // Each hidden match is its own undoable command; undo until everything is back.
    while (cleanup.undo()) {
      /* undo all */
    }
    expect(cleanup.getState().hiddenCount).toBe(0);
    expect(Array.from(document.querySelectorAll(".ad-slot")).some((el) => (el as HTMLElement).style.display === "none")).toBe(false);
  });
});
