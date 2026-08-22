/**
 * Structural identity of an element: sorted class set + semantic data-*
 * attributes. Returns null when the element is too generic to match safely
 * (no classes, no semantic data attributes).
 *
 * Used by both MatchEngine (preview) and MutationEngine (regeneration guard)
 * to ensure the same identity criteria are applied everywhere.
 */

/** data-* attributes that carry structural meaning (not instance identity). */
const SEMANTIC_DATA_ATTRS = [
  "data-ad-slot",
  "data-google-ad",
  "data-placement",
  "data-component",
  "data-role",
  "data-type",
  "data-slot",
  "data-testid",
] as const;

export function elementSignature(element: Element): string | null {
  const classes = Array.from(element.classList).sort().join(".");
  const dataAttrs: string[] = [];
  for (const name of SEMANTIC_DATA_ATTRS) {
    const value = element.getAttribute(name);
    if (value !== null) dataAttrs.push(`${name}=${value}`);
  }
  const tokens = [classes, dataAttrs.join("&")].filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  return `${element.tagName}|${tokens.join("|")}`;
}
