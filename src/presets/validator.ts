import type {
  ExtractionRole,
  PresetHealth,
  PresetValidationCheck,
  PresetValidationResult,
  SitePreset,
} from "@shared/types";
import { validateSelector } from "@shared/utils/selector";

interface ValidatorInput {
  preset: SitePreset;
  root: ParentNode;
}

/**
 * Validate every selector in a preset against the current DOM.
 * Required selectors that do not match make the preset STALE; any invalid
 * selector makes it BROKEN. Unmatched optional selectors only degrade health.
 * The page must never crash on a bad selector.
 */
export function validatePreset({ preset, root }: ValidatorInput): PresetValidationResult {
  const checks: PresetValidationCheck[] = [];

  for (const rule of preset.cleanup?.rules ?? []) {
    checks.push(validateOne(rule.id, rule.selector, rule.required === true, root));
  }

  for (const rule of preset.protection?.rules ?? []) {
    checks.push(validateOne(rule.id, rule.selector, true, root));
  }

  for (const [role, selectors] of Object.entries(preset.extraction ?? {})) {
    for (const selector of selectors) {
      checks.push(validateOne(undefined, selector, false, root, role));
    }
  }

  let hasInvalid = false;
  let hasRequiredMiss = false;
  let hasMiss = false;
  let hasMultiple = false;

  for (const check of checks) {
    switch (check.status) {
      case "INVALID_SELECTOR":
        hasInvalid = true;
        break;
      case "NO_MATCH":
        if (check.required) hasRequiredMiss = true;
        else hasMiss = true;
        break;
      case "MULTIPLE_MATCHES":
        hasMultiple = true;
        break;
      default:
        break;
    }
  }

  let health: PresetHealth;
  if (hasInvalid) {
    health = "BROKEN";
  } else if (hasRequiredMiss) {
    health = "STALE";
  } else if (hasMiss || hasMultiple) {
    health = "DEGRADED";
  } else {
    health = "HEALTHY";
  }

  const valid = !hasInvalid && !hasRequiredMiss;
  return { valid, health, checks };
}

function validateOne(
  ruleId: string | undefined,
  selector: string,
  required: boolean,
  root: ParentNode,
  role?: string,
): PresetValidationCheck {
  const check: PresetValidationCheck = {
    selector,
    status: "NO_MATCH",
    matchCount: 0,
    required,
  };
  if (ruleId !== undefined) check.ruleId = ruleId;
  if (role !== undefined) check.role = role as ExtractionRole;

  const result = validateSelector(root, selector);
  if (!result.ok) {
    check.status = result.reason === "INVALID_SELECTOR" ? "INVALID_SELECTOR" : "NO_MATCH";
    return check;
  }
  check.matchCount = result.matchCount;
  check.status = result.matchCount > 1 ? "MULTIPLE_MATCHES" : "PASS";
  return check;
}
