import type { SitePreset } from "@shared/types";
import { SCHEMA_VERSION } from "@shared/constants";

/**
 * Built-in "live example" presets. They ship conservative, widely seen
 * selectors and are deliberately `required: false`, so a site redesign only
 * degrades them instead of blocking anything. They ship disabled: a preset
 * never auto-applies until the user enables it from the toolbar or options.
 */
export function defaultPresets(now = Date.now()): SitePreset[] {
  return [
    {
      schemaVersion: SCHEMA_VERSION,
      id: "preset-default-cnn",
      version: 1,
      enabled: false,
      site: { hostname: "cnn.com" },
      cleanup: {
        rules: [
          { id: "cnn-ad-top", selector: "#top_banner_ad, .ad-slot", action: "DELETE", category: "ADVERTISEMENT", enabled: true, required: false },
          { id: "cnn-ad-inline", selector: ".ad-el-slot", action: "DELETE", category: "ADVERTISEMENT", enabled: true, required: false },
          { id: "cnn-newsletter", selector: ".newsletter-signup, [data-persistent-element='newsletter']", action: "DELETE", category: "NEWSLETTER", enabled: true, required: false },
        ],
      },
      metadata: { name: "CNN (example)", author: "Parotia", source: "BUILT_IN", createdAt: now, updatedAt: now },
    },
    {
      schemaVersion: SCHEMA_VERSION,
      id: "preset-default-bbc",
      version: 1,
      enabled: false,
      site: { hostname: "bbc.com" },
      cleanup: {
        rules: [
          { id: "bbc-ad", selector: "#bbccom_leaderboard, .advert, [data-google-query-id]", action: "DELETE", category: "ADVERTISEMENT", enabled: true, required: false },
          { id: "bbc-cookie", selector: "#bbccom-splash, .cookie-banner, [id*='consent']", action: "DELETE", category: "COOKIE", enabled: true, required: false },
        ],
      },
      metadata: { name: "BBC (example)", author: "Parotia", source: "BUILT_IN", createdAt: now, updatedAt: now },
    },
    {
      schemaVersion: SCHEMA_VERSION,
      id: "preset-default-aljazeera",
      version: 1,
      enabled: false,
      site: { hostname: "aljazeera.com" },
      cleanup: {
        rules: [
          { id: "aje-ad", selector: ".advertising-slot, .ad-slot, [data-ad-slot]", action: "DELETE", category: "ADVERTISEMENT", enabled: true, required: false },
          { id: "aje-sidebar", selector: ".sticky-sidebar .more-from, .trending", action: "DELETE", category: "SIDEBAR", enabled: true, required: false },
        ],
      },
      metadata: { name: "Al Jazeera (example)", author: "Parotia", source: "BUILT_IN", createdAt: now, updatedAt: now },
    },
  ];
}
