import { describe, expect, it, vi } from "vitest";
import type { SitePreset } from "@shared/types";
import { validatePreset } from "@presets/validator";

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
    cleanup: { rules: [] },
    metadata: { name: "CNN", author: "tester" },
    ...overrides,
  };
}

const DOM = `<main><div class="ad">A</div><div class="ad">B</div><aside class="side">S</aside><p class="story">story</p></main>`;

describe("validatePreset", () => {
  it("is HEALTHY and valid when all rules match uniquely", () => {
    document.body.innerHTML = DOM;
    const p = preset({
      cleanup: { rules: [{ id: "r1", selector: ".side", action: "HIDE", category: "SIDEBAR", enabled: true }] },
      protection: { rules: [{ id: "prot", selector: ".story", action: "KEEP" }] },
    });

    const result = validatePreset({ preset: p, root: document });
    expect(result.valid).toBe(true);
    expect(result.health).toBe("HEALTHY");
    expect(result.checks).toHaveLength(2);
  });

  it("flags MULTIPLE_MATCHES and degrades health but stays valid", () => {
    document.body.innerHTML = DOM;
    const p = preset({
      cleanup: { rules: [{ id: "r1", selector: ".ad", action: "DELETE", category: "ADVERTISEMENT", enabled: true }] },
    });

    const result = validatePreset({ preset: p, root: document });
    expect(result.valid).toBe(true);
    expect(result.health).toBe("DEGRADED");
    expect(result.checks[0]).toMatchObject({ status: "MULTIPLE_MATCHES", matchCount: 2, required: false });
  });

  it("is STALE and invalid when a required rule has no match", () => {
    document.body.innerHTML = DOM;
    const p = preset({
      cleanup: {
        rules: [{ id: "r1", selector: ".missing", action: "DELETE", category: "ADVERTISEMENT", enabled: true, required: true }],
      },
    });

    const result = validatePreset({ preset: p, root: document });
    expect(result.valid).toBe(false);
    expect(result.health).toBe("STALE");
    expect(result.checks[0]).toMatchObject({ status: "NO_MATCH", required: true });
  });

  it("is DEGRADED but valid when an optional rule has no match", () => {
    document.body.innerHTML = DOM;
    const p = preset({
      cleanup: { rules: [{ id: "r1", selector: ".missing", action: "DELETE", category: "ADVERTISEMENT", enabled: true }] },
    });

    const result = validatePreset({ preset: p, root: document });
    expect(result.valid).toBe(true);
    expect(result.health).toBe("DEGRADED");
  });

  it("is BROKEN and invalid when any selector is syntactically invalid", () => {
    document.body.innerHTML = DOM;
    makeQuerySelectorThrow("ad[");
    const p = preset({
      cleanup: { rules: [{ id: "r1", selector: "ad[", action: "DELETE", category: "ADVERTISEMENT", enabled: true }] },
    });

    const result = validatePreset({ preset: p, root: document });
    expect(result.valid).toBe(false);
    expect(result.health).toBe("BROKEN");
    expect(result.checks[0]?.status).toBe("INVALID_SELECTOR");
  });

  it("treats protection rules as required", () => {
    document.body.innerHTML = DOM;
    const p = preset({
      protection: { rules: [{ id: "prot", selector: ".missing", action: "KEEP" }] },
    });

    const result = validatePreset({ preset: p, root: document });
    expect(result.valid).toBe(false);
    expect(result.health).toBe("STALE");
    expect(result.checks[0]).toMatchObject({ status: "NO_MATCH", required: true });
  });

  it("validates extraction hints as optional selectors tagged with the role", () => {
    document.body.innerHTML = DOM;
    const p = preset({
      extraction: { title: [".story"], heroImage: [".missing"] },
    });

    const result = validatePreset({ preset: p, root: document });
    expect(result.valid).toBe(true);
    expect(result.health).toBe("DEGRADED");
    const roles = result.checks.map((c) => c.role);
    expect(roles).toContain("title");
    expect(roles).toContain("heroImage");
  });

  it("is HEALTHY when there is nothing to validate", () => {
    document.body.innerHTML = DOM;
    const result = validatePreset({ preset: preset(), root: document });
    expect(result.valid).toBe(true);
    expect(result.health).toBe("HEALTHY");
    expect(result.checks).toHaveLength(0);
  });
});
