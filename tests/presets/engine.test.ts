import { describe, expect, it, vi } from "vitest";
import type { CleanupIntent, SitePreset } from "@shared/types";
import { DefaultPresetEngine } from "@presets/engine";
import type { PresetRepository } from "@storage/repository";

/** happy-dom's selector parser is lenient, so simulate a strict browser. */
function makeQuerySelectorThrow(selector: string) {
  const frag = document.createDocumentFragment();
  const original = frag.querySelectorAll.bind(frag);
  vi.spyOn(frag, "querySelectorAll").mockImplementation((sel: string) => {
    if (sel === selector) throw new DOMException("Syntax error", "SyntaxError");
    return original(sel);
  });
  vi.spyOn(document, "createDocumentFragment").mockReturnValue(frag);
}

function preset(overrides?: Partial<SitePreset>): SitePreset {
  return {
    schemaVersion: 1,
    id: "p1",
    version: 1,
    enabled: true,
    site: { hostname: "cnn.com" },
    cleanup: {
      rules: [{ id: "r1", selector: ".ad", action: "DELETE", category: "ADVERTISEMENT", enabled: true }],
    },
    metadata: { name: "CNN", author: "tester" },
    ...overrides,
  };
}

function fakeRepository(presets: SitePreset[]): PresetRepository {
  return {
    list: vi.fn().mockResolvedValue(presets),
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
}

describe("DefaultPresetEngine", () => {
  it("detect returns matching presets sorted by specificity (hostname+path first)", async () => {
    const exact = preset({ id: "p2", matching: { paths: ["/politics/*"] } });
    const hostOnly = preset({ id: "p1" });
    const engine = new DefaultPresetEngine(fakeRepository([hostOnly, exact]));

    const matches = await engine.detect({ hostname: "www.cnn.com", pathname: "/politics/xyz" });
    expect(matches.map((m) => m.preset.id)).toEqual(["p2", "p1"]);
    expect(matches[0]?.specificity).toBe(2);
    expect(matches[1]?.specificity).toBe(1);
  });

  it("detect skips presets that do not match the page", async () => {
    const engine = new DefaultPresetEngine(fakeRepository([preset({ site: { hostname: "bbc.com" } })]));
    const matches = await engine.detect({ hostname: "cnn.com", pathname: "/" });
    expect(matches).toHaveLength(0);
  });

  it("buildCleanupIntents emits one intent per enabled rule only", () => {
    const engine = new DefaultPresetEngine(fakeRepository([]));
    const p = preset({
      cleanup: {
        rules: [
          { id: "r1", selector: ".ad", action: "DELETE", category: "ADVERTISEMENT", enabled: true },
          { id: "r2", selector: ".side", action: "HIDE", category: "SIDEBAR", enabled: false },
        ],
      },
    });

    const intents = engine.buildCleanupIntents(p);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.action).toBe("DELETE");
    expect(intents[0]?.source).toBe("PRESET");
    expect(intents[0]?.target.selector).toBe(".ad");
    expect(intents[0]?.id).toMatch(/^intent-/);
  });

  it("apply returns APPLIED when every rule passes", async () => {
    document.body.innerHTML = `<main><div class="ad">A</div><p>story</p></main>`;
    const engine = new DefaultPresetEngine(fakeRepository([]));
    const p = preset({ cleanup: { rules: [{ id: "r1", selector: ".ad", action: "DELETE", category: "ADVERTISEMENT", enabled: true }] } });

    const result = await engine.apply(p, document);
    expect(result.status).toBe("APPLIED");
    expect(result.appliedRules).toEqual(["r1"]);
    expect(result.staleRules).toEqual([]);
  });

  it("apply is PARTIAL when an optional selector has no match (health DEGRADED but valid)", async () => {
    document.body.innerHTML = `<main><div class="ad">A</div></main>`;
    const engine = new DefaultPresetEngine(fakeRepository([]));
    const p = preset({
      cleanup: {
        rules: [
          { id: "r1", selector: ".ad", action: "DELETE", category: "ADVERTISEMENT", enabled: true },
          { id: "r2", selector: ".newsletter", action: "HIDE", category: "NEWSLETTER", enabled: true },
        ],
      },
    });

    const result = await engine.apply(p, document);
    expect(result.status).toBe("PARTIAL");
    expect(result.appliedRules).toEqual(["r1"]);
    expect(result.staleRules).toEqual(["r2"]);
  });

  it("apply is FAILED when a required selector is missing (STALE)", async () => {
    document.body.innerHTML = `<main><p>story</p></main>`;
    const engine = new DefaultPresetEngine(fakeRepository([]));
    const p = preset({
      cleanup: {
        rules: [{ id: "r1", selector: ".ad", action: "DELETE", category: "ADVERTISEMENT", enabled: true, required: true }],
      },
    });

    const result = await engine.apply(p, document);
    expect(result.status).toBe("FAILED");
    expect(result.appliedRules).toEqual([]);
    expect(result.staleRules).toEqual(["r1"]);
  });

  it("apply is FAILED when the only selector is invalid (BROKEN)", async () => {
    document.body.innerHTML = `<main><p>story</p></main>`;
    makeQuerySelectorThrow("ad[");
    const engine = new DefaultPresetEngine(fakeRepository([]));
    const p = preset({
      cleanup: {
        rules: [{ id: "r1", selector: "ad[", action: "DELETE", category: "ADVERTISEMENT", enabled: true }],
      },
    });

    const result = await engine.apply(p, document);
    expect(result.status).toBe("FAILED");
    expect(result.staleRules).toEqual(["r1"]);
  });

  it("buildCleanupIntents output targets carry preset-sourced identity", () => {
    const engine = new DefaultPresetEngine(fakeRepository([]));
    const intents = engine.buildCleanupIntents(preset());
    const intent = intents[0] as CleanupIntent | undefined;
    expect(intent?.target.id).toBe("rule-r1");
    expect(intent?.reason).toBe("preset rule r1");
  });
});
