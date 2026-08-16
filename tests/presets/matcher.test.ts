import { describe, expect, it } from "vitest";
import type { SitePreset } from "@shared/types";
import {
  hostnameMatches,
  matchPresets,
  normalizeHostname,
  pathMatches,
  presetEnabled,
} from "@presets/matcher";
import { defaultPresets } from "@presets/defaultPresets";

function preset(hostname: string, paths?: string[]): SitePreset {
  return {
    schemaVersion: 1,
    id: `p-${hostname}`,
    version: 1,
    site: { hostname },
    ...(paths ? { matching: { paths } } : {}),
    metadata: { name: hostname, author: "test" },
  };
}

describe("normalizeHostname", () => {
  it("lowercases and strips www", () => {
    expect(normalizeHostname("WWW.CNN.Com")).toBe("cnn.com");
    expect(normalizeHostname("  Example.COM ")).toBe("example.com");
  });
});

describe("hostnameMatches", () => {
  it("matches exact and parent-domain presets", () => {
    expect(hostnameMatches("cnn.com", "cnn.com")).toBe(true);
    expect(hostnameMatches("cnn.com", "edition.cnn.com")).toBe(true);
    expect(hostnameMatches("cnn.com", "www.cnn.com")).toBe(true);
  });

  it("rejects unrelated and subdomain-spoofing hostnames", () => {
    expect(hostnameMatches("cnn.com", "cnn.co.uk")).toBe(false);
    expect(hostnameMatches("cnn.com", "notcnn.com")).toBe(false);
    expect(hostnameMatches("cnn.com", "cnn.com.evil.org")).toBe(false);
  });
});

describe("pathMatches", () => {
  it("matches exact and prefix-wildcard patterns", () => {
    expect(pathMatches("/world", "/world")).toBe(true);
    expect(pathMatches("/world/*", "/world/asia/1")).toBe(true);
    expect(pathMatches("/world/*", "/world/")).toBe(true);
  });

  it("rejects non-matching paths", () => {
    expect(pathMatches("/world", "/sports")).toBe(false);
    expect(pathMatches("/world/*", "/sports/1")).toBe(false);
    expect(pathMatches("/world/*", "/world")).toBe(false);
  });
});

describe("matchPresets", () => {
  it("returns only hostname matches, most specific first", () => {
    const presets = [
      preset("cnn.com", ["/world/*"]),
      preset("cnn.com"),
      preset("bbc.com"),
    ];
    const matches = matchPresets(presets, { hostname: "edition.cnn.com", pathname: "/world/asia/1" });
    expect(matches).toHaveLength(2);
    expect(matches[0]!.preset.id).toBe("p-cnn.com");
    expect(matches[0]!.specificity).toBe(2);
    expect(matches[1]!.specificity).toBe(1);
  });

  it("returns an empty list when nothing matches", () => {
    expect(matchPresets([preset("cnn.com")], { hostname: "bbc.com", pathname: "/" })).toEqual([]);
  });
});

describe("presetEnabled", () => {
  it("treats a preset without the flag as disabled (never auto-applies by force)", () => {
    expect(presetEnabled(preset("cnn.com"))).toBe(false);
  });

  it("is true only when explicitly opted in", () => {
    expect(presetEnabled({ ...preset("cnn.com"), enabled: true })).toBe(true);
    expect(presetEnabled({ ...preset("cnn.com"), enabled: false })).toBe(false);
  });
});

describe("defaultPresets", () => {
  it("ships 3 conservative built-in example presets", () => {
    const presets = defaultPresets();
    expect(presets).toHaveLength(3);
    for (const p of presets) {
      expect(p.metadata.source).toBe("BUILT_IN");
      expect(presetEnabled(p)).toBe(false);
      expect(p.cleanup?.rules.length).toBeGreaterThan(0);
      for (const rule of p.cleanup?.rules ?? []) {
        expect(rule.required).toBe(false);
        expect(rule.enabled).toBe(true);
      }
    }
    expect(presets.map((p) => p.site.hostname)).toEqual(
      expect.arrayContaining(["cnn.com", "bbc.com", "aljazeera.com"]),
    );
  });
});
