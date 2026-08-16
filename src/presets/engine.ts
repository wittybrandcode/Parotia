import type {
  CleanupIntent,
  CleanupRule,
  PageIdentity,
  PresetApplicationResult,
  PresetValidationResult,
  SitePreset,
} from "@shared/types";
import { createId } from "@shared/utils/id";
import { hostnameMatches, matchPresets, type PresetMatch } from "./matcher";
import { validatePreset } from "./validator";
import type { PresetRepository } from "@storage/repository";

/**
 * Preset Engine pipeline:
 * `Resolver → Validate → Proposal → Review → Cleanup Engine`.
 * The engine never mutates the DOM itself — it resolves, validates and
 * produces cleanup intents that the Cleanup/Mutation pipeline executes.
 */
export interface PresetEngine {
  detect(page: PageIdentity): Promise<PresetMatch[]>;
  validate(preset: SitePreset, root: ParentNode): PresetValidationResult;
  buildCleanupIntents(preset: SitePreset): CleanupIntent[];
  apply(preset: SitePreset, root: ParentNode): Promise<PresetApplicationResult>;
}

export class DefaultPresetEngine implements PresetEngine {
  constructor(private readonly repository: PresetRepository) {}

  async detect(page: PageIdentity): Promise<PresetMatch[]> {
    const presets = await this.repository.list();
    return matchPresets(presets, page);
  }

  validate(preset: SitePreset, root: ParentNode): PresetValidationResult {
    return validatePreset({ preset, root });
  }

  buildCleanupIntents(preset: SitePreset): CleanupIntent[] {
    const intents: CleanupIntent[] = [];
    for (const rule of preset.cleanup?.rules ?? []) {
      if (!rule.enabled) continue;
      intents.push(ruleToIntent(rule));
    }
    return intents;
  }

  async apply(preset: SitePreset, root: ParentNode): Promise<PresetApplicationResult> {
    const validation = this.validate(preset, root);

    const appliedRules: string[] = [];
    const skippedRules: string[] = [];
    const staleRules: string[] = [];

    if (validation.valid) {
      for (const check of validation.checks) {
        if (check.status === "PASS" && check.ruleId) appliedRules.push(check.ruleId);
        else if (check.status === "NO_MATCH" && check.ruleId) staleRules.push(check.ruleId);
        else if (check.ruleId) skippedRules.push(check.ruleId);
      }
    } else {
      for (const check of validation.checks) {
        if (check.ruleId) {
          if (check.status === "INVALID_SELECTOR" || (check.status === "NO_MATCH" && check.required)) {
            staleRules.push(check.ruleId);
          } else if (check.status === "NO_MATCH") {
            skippedRules.push(check.ruleId);
          } else {
            appliedRules.push(check.ruleId);
          }
        }
      }
    }

    const status =
      appliedRules.length > 0 && staleRules.length === 0 && skippedRules.length === 0
        ? "APPLIED"
        : appliedRules.length > 0
          ? "PARTIAL"
          : "FAILED";

    return { status, appliedRules, skippedRules, staleRules };
  }
}

function ruleToIntent(rule: CleanupRule): CleanupIntent {
  return {
    id: createId("intent"),
    action: rule.action,
    target: {
      id: `rule-${rule.id}`,
      selector: rule.selector,
      tagName: "*",
    },
    source: "PRESET",
    reason: `preset rule ${rule.id}`,
  };
}

export { hostnameMatches };
