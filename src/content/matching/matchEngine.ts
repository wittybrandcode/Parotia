import { isNewsCleanUi } from "../overlay/overlay";

/**
 * Match Engine — finds elements that look like a picked element so a whole
 * family of lookalikes (e.g. a row of ad slots) can be deleted at once
 * ("Delete Similar"). Similarity is structural: same tag name + same class
 * set + same semantic data-* attributes. An element with no classes and no
 * semantic data attributes is "too generic" to match safely and matches
 * nothing but itself.
 */

export interface MatchEngine {
  /** Structural signature of an element, or null when it is too generic. */
  signatureOf(element: Element): string | null;
  /**
   * Elements to delete together with `target` (document order, including the
   * target itself). Returns just `[target]` when the target is too generic
   * to match anything.
   */
  findSimilar(target: Element): Element[];
}

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

export class DefaultMatchEngine implements MatchEngine {
  signatureOf(element: Element): string | null {
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

  findSimilar(target: Element): Element[] {
    const signature = this.signatureOf(target);
    if (!signature) return [target];

    const similar: Element[] = [];
    for (const element of Array.from(document.querySelectorAll<Element>("body *"))) {
      if (element === target) continue;
      // Skip NewsClean UI, protected elements, and the target's own subtree
      // or ancestors (they would be double-deleted alongside it).
      if (isNewsCleanUi(element)) continue;
      if (element.closest("[data-newsclean-keep]")) continue;
      if (target.contains(element) || element.contains(target)) continue;
      if (this.signatureOf(element) === signature) similar.push(element);
    }
    similar.unshift(target);
    return similar;
  }
}
