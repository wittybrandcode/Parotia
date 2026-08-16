import type { CleanupCategory, CleanupRule } from "./cleanup";
import type { ExtractionRole } from "./extraction";

export type CaptureMode = "VISIBLE" | "FULL_PAGE" | "ELEMENT";

export interface PresetSiteIdentity {
  hostname: string;
}

export interface PresetMatching {
  hostnames?: string[];
  paths?: string[];
}

export interface PresetExtractionHints {
  article?: string[];
  title?: string[];
  subtitle?: string[];
  heroImage?: string[];
  body?: string[];
  author?: string[];
  publicationDate?: string[];
  source?: string[];
  logo?: string[];
}

export interface PresetCleanupConfig {
  rules: CleanupRule[];
}

export interface ProtectionRule {
  id: string;
  selector: string;
  action: "KEEP";
  enabled?: boolean;
}

export interface PresetProtectionConfig {
  rules: ProtectionRule[];
}

export interface PresetCaptureDefaults {
  mode?: CaptureMode;
}

export type PresetSource = "BUILT_IN" | "USER_CREATED" | "IMPORTED" | "COMMUNITY";

export interface PresetMetadata {
  name: string;
  author: string;
  description?: string;
  source?: PresetSource;
  createdAt?: number;
  updatedAt?: number;
}

/** Canonical persistent site preset. Contains rules, never DOM nodes or code. */
export interface SitePreset {
  schemaVersion: number;

  id: string;
  version: number;

  /**
   * Opt-in flag for automatic application. A preset is never applied to a
   * page by force: it only runs on a matching site when `enabled` is true.
   */
  enabled?: boolean;

  site: PresetSiteIdentity;
  matching?: PresetMatching;

  extraction?: PresetExtractionHints;
  cleanup?: PresetCleanupConfig;
  protection?: PresetProtectionConfig;
  capture?: PresetCaptureDefaults;

  metadata: PresetMetadata;
}

export type PresetHealth = "HEALTHY" | "DEGRADED" | "STALE" | "BROKEN";

export type ValidationStatus =
  | "PASS"
  | "NO_MATCH"
  | "MULTIPLE_MATCHES"
  | "INVALID_SELECTOR"
  | "UNEXPECTED";

export interface PresetValidationCheck {
  ruleId?: string;
  role?: ExtractionRole;
  selector: string;
  status: ValidationStatus;
  matchCount: number;
  required: boolean;
}

export interface PresetValidationResult {
  valid: boolean;
  health: PresetHealth;
  checks: PresetValidationCheck[];
}

export interface PresetSessionState {
  detected: boolean;
  preset?: SitePreset;
  validation?: PresetValidationResult;
  applied: boolean;
}

/** Declarative candidate that keeps CleanupCategory separate from engine concerns. */
export interface CleanupProposalItem {
  category: CleanupCategory;
  selector: string;
  matchCount: number;
  confidence: number;
  action: "REMOVE" | "HIDE";
}
