import { z } from "zod";
import type { SitePreset, UserSettings } from "@shared/types";
import { SCHEMA_VERSION } from "@shared/constants";

/**
 * Runtime schemas for persistent entities. Everything loaded from storage is
 * untrusted configuration: `LOAD → SCHEMA VALIDATION → NORMALIZE → USE`.
 * Never `LOAD → USE`.
 */

export const CleanupActionSchema = z.enum(["DELETE", "HIDE", "KEEP"]);

export const CleanupCategorySchema = z.enum([
  "ADVERTISEMENT",
  "SIDEBAR",
  "NEWSLETTER",
  "SOCIAL",
  "COOKIE",
  "RELATED",
  "NAVIGATION",
  "PROMOTION",
  "OTHER",
]);

export const CleanupRuleSchema = z.object({
  id: z.string().min(1),
  selector: z.string().min(1),
  action: CleanupActionSchema,
  category: CleanupCategorySchema.optional(),
  enabled: z.boolean(),
  required: z.boolean().optional(),
});

export const ProtectionRuleSchema = z.object({
  id: z.string().min(1),
  selector: z.string().min(1),
  action: z.literal("KEEP"),
  enabled: z.boolean().optional(),
});

export const PresetSiteIdentitySchema = z.object({
  hostname: z.string().min(1),
});

export const PresetMatchingSchema = z
  .object({
    hostnames: z.array(z.string()).optional(),
    paths: z.array(z.string()).optional(),
  })
  .optional();

export const PresetExtractionHintsSchema = z
  .object({
    article: z.array(z.string()).optional(),
    title: z.array(z.string()).optional(),
    subtitle: z.array(z.string()).optional(),
    heroImage: z.array(z.string()).optional(),
    body: z.array(z.string()).optional(),
    author: z.array(z.string()).optional(),
    publicationDate: z.array(z.string()).optional(),
    source: z.array(z.string()).optional(),
    logo: z.array(z.string()).optional(),
  })
  .optional();

export const PresetCleanupConfigSchema = z
  .object({
    rules: z.array(CleanupRuleSchema),
  })
  .optional();

export const PresetProtectionConfigSchema = z
  .object({
    rules: z.array(ProtectionRuleSchema),
  })
  .optional();

export const PresetCaptureDefaultsSchema = z
  .object({
    mode: z.enum(["VISIBLE", "FULL_PAGE", "ELEMENT"]).optional(),
  })
  .optional();

export const PresetSourceSchema = z.enum(["BUILT_IN", "USER_CREATED", "IMPORTED", "COMMUNITY"]);

export const PresetMetadataSchema = z.object({
  name: z.string().min(1),
  author: z.string().min(1),
  description: z.string().optional(),
  source: PresetSourceSchema.optional(),
  createdAt: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
});

/** Canonical persistent preset. Presets are configuration, never code. */
export const SitePresetSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  version: z.number().int().positive(),
  /** Opt-in auto-application. Never applied by force when absent/false. */
  enabled: z.boolean().optional(),
  site: PresetSiteIdentitySchema,
  matching: PresetMatchingSchema,
  extraction: PresetExtractionHintsSchema,
  cleanup: PresetCleanupConfigSchema,
  protection: PresetProtectionConfigSchema,
  capture: PresetCaptureDefaultsSchema,
  metadata: PresetMetadataSchema,
});

export type SitePresetDTO = z.infer<typeof SitePresetSchema>;

/**
 * Convert a validated DTO into the canonical domain shape. zod's `.optional()`
 * infers `T | undefined` on optional keys, which conflicts with the domain's
 * `exactOptionalPropertyTypes`. Normalization strips absent keys.
 */
export function normalizePreset(input: SitePresetDTO): SitePreset {
  const out: Record<string, unknown> = { ...clean(input) };
  if (out.matching && typeof out.matching === "object") {
    out.matching = clean(out.matching as Record<string, unknown>);
  }
  if (out.extraction && typeof out.extraction === "object") {
    out.extraction = clean(out.extraction as Record<string, unknown>);
  }
  if (out.capture && typeof out.capture === "object") {
    out.capture = clean(out.capture as Record<string, unknown>);
  }
  if (out.cleanup && typeof out.cleanup === "object") {
    const cleanup = out.cleanup as NonNullable<SitePresetDTO["cleanup"]>;
    out.cleanup = {
      rules: cleanup.rules.map((rule) => clean(rule as unknown as Record<string, unknown>)),
    };
  }
  if (out.protection && typeof out.protection === "object") {
    const protection = out.protection as NonNullable<SitePresetDTO["protection"]>;
    out.protection = {
      rules: protection.rules.map((rule) => clean(rule as unknown as Record<string, unknown>)),
    };
  }
  if (out.metadata && typeof out.metadata === "object") {
    out.metadata = clean(out.metadata as Record<string, unknown>);
  }
  return out as unknown as SitePreset;
}

function clean(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) result[key] = val;
  }
  return result;
}

export const ToolbarSettingsSchema = z.object({
  position: z.enum(["TOP_CENTER", "TOP_RIGHT", "TOP_LEFT"]),
  compact: z.boolean(),
});

export const CaptureSettingsSchema = z.object({
  defaultMode: z.enum(["VISIBLE", "FULL_PAGE", "ELEMENT"]).optional(),
  respectDevicePixelRatio: z.boolean(),
});

export const BehaviorSettingsSchema = z.object({
  showPresetSuggestions: z.boolean(),
  confirmBulkCleanup: z.boolean(),
  showOnboarding: z.boolean(),
});

export const UserSettingsSchema = z.object({
  language: z.enum(["ar", "fr", "en"]),
  toolbar: ToolbarSettingsSchema,
  capture: CaptureSettingsSchema,
  behavior: BehaviorSettingsSchema,
});

export type UserSettingsDTO = z.infer<typeof UserSettingsSchema>;

/** Domain-shape normalization for validated settings (see normalizePreset). */
export function normalizeSettings(input: UserSettingsDTO): UserSettings {
  const out: Record<string, unknown> = { ...clean(input) };
  if (out.toolbar && typeof out.toolbar === "object") {
    out.toolbar = clean(out.toolbar as Record<string, unknown>);
  }
  if (out.capture && typeof out.capture === "object") {
    out.capture = clean(out.capture as Record<string, unknown>);
  }
  if (out.behavior && typeof out.behavior === "object") {
    out.behavior = clean(out.behavior as Record<string, unknown>);
  }
  return out as unknown as UserSettings;
}

/** The stored preset map shape under `newsclean.presets`. */
export const StoredPresetsSchema = z.record(z.string(), SitePresetSchema);

export function requireSchemaVersion(value: unknown): number {
  if (typeof value !== "object" || value === null) return SCHEMA_VERSION;
  const v = (value as { schemaVersion?: unknown }).schemaVersion;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : SCHEMA_VERSION;
}
