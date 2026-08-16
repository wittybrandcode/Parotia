import type { PageIdentity, SitePreset } from "@shared/types";

/**
 * Preset detection: match a preset against the current page.
 * Identity = normalized hostname + optional path patterns, NOT the full URL.
 * Specificity: exact hostname+path > hostname > parent-domain.
 */
export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

export function hostnameMatches(presetHostname: string, pageHostname: string): boolean {
  const p = normalizeHostname(presetHostname);
  const page = normalizeHostname(pageHostname);
  if (p === page) return true;
  return page.endsWith(`.${p}`);
}

export function pathMatches(pattern: string, pathname: string): boolean {
  if (pattern === pathname) return true;
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return pathname.startsWith(prefix);
  }
  return false;
}

export interface PresetMatch {
  preset: SitePreset;
  specificity: number;
}

/**
 * Opt-in gate for automatic application. A preset never forces itself onto a
 * page: it only auto-applies on a matching site when this returns true.
 */
export function presetEnabled(preset: SitePreset): boolean {
  return preset.enabled === true;
}

/** Returns every preset that matches the page, most specific first. */
export function matchPresets(presets: SitePreset[], page: PageIdentity): PresetMatch[] {
  const matches: PresetMatch[] = [];
  for (const preset of presets) {
    const siteMatches = hostnameMatches(preset.site.hostname, page.hostname);
    if (!siteMatches) continue;

    let specificity = 1; // hostname only
    const paths = preset.matching?.paths ?? [];
    const pathMatched = paths.some((p) => pathMatches(p, page.pathname));
    if (pathMatched) specificity = 2; // hostname + path

    matches.push({ preset, specificity });
  }
  return matches.sort((a, b) => b.specificity - a.specificity);
}
