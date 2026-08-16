import { z } from "zod";
import type { SitePreset } from "@shared/types";

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

/** The stored preset map shape under `newsclean.presets`. */
export const StoredPresetsSchema = z.record(z.string(), SitePresetSchema);
