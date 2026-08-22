import { elementSignature } from "@shared/utils/signature";
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

export class DefaultMatchEngine implements MatchEngine {
  signatureOf(element: Element): string | null {
    return elementSignature(element);
  }

  findSimilar(target: Element): Element[] {
    const signature = this.signatureOf(target);
    if (!signature) return [target];

    const similar: Element[] = [];
    // Scope query to the same tag name to avoid iterating every DOM node.
    const selector = target.tagName.toLowerCase();
    for (const element of Array.from(document.querySelectorAll<Element>(selector))) {
      if (element === target) continue;
      // Skip NewsClean UI, protected elements, and the target's own subtree
      // or ancestors (they would be double-deleted alongside it).
      if (isNewsCleanUi(element)) continue;
      if (target.contains(element) || element.contains(target)) continue;
      if (this.signatureOf(element) === signature) similar.push(element);
    }
    similar.unshift(target);
    return similar;
  }
}
