/**
 * Selector generation and validation. Selector priority:
 * `Stable ID → data-testid → unique class → structural nth-of-type path`.
 * Single-element selectors must resolve uniquely.
 */

export type SelectorValidation =
  | { ok: true; matchCount: number }
  | { ok: false; reason: "INVALID_SELECTOR" | "NO_MATCH" };

export function isSelectorSyntaxValid(selector: string): boolean {
  try {
    document.createDocumentFragment().querySelectorAll(selector);
    return true;
  } catch {
    return false;
  }
}

/** Returns match count, or an explicit failure — never a crash on invalid input. */
export function validateSelector(root: ParentNode, selector: string): SelectorValidation {
  if (!isSelectorSyntaxValid(selector)) {
    return { ok: false, reason: "INVALID_SELECTOR" };
  }
  let matches: NodeListOf<Element>;
  try {
    matches = root.querySelectorAll(selector);
  } catch {
    return { ok: false, reason: "INVALID_SELECTOR" };
  }
  if (matches.length === 0) {
    return { ok: false, reason: "NO_MATCH" };
  }
  return { ok: true, matchCount: matches.length };
}

const MAX_STABLE_CLASSES = 3;

/** Stable, shortest reasonable selector for a single element. */
export function stableSelector(element: Element): string {
  const uniqueMatch = (candidate: string): string | null => {
    try {
      const matches = document.querySelectorAll(candidate);
      return matches.length === 1 && matches[0] === element ? candidate : null;
    } catch {
      return null;
    }
  };

  if (element.id) {
    const byId = uniqueMatch(`#${CSS.escape(element.id)}`);
    if (byId) return byId;
  }
  if (element.hasAttribute("data-testid")) {
    const byTestId = uniqueMatch(
      `[data-testid="${CSS.escape(element.getAttribute("data-testid") ?? "")}"]`,
    );
    if (byTestId) return byTestId;
  }
  if (element.classList.length > 0) {
    const byClass = uniqueMatch(
      `${element.tagName.toLowerCase()}${Array.from(element.classList)
        .slice(0, MAX_STABLE_CLASSES)
        .map((c) => `.${CSS.escape(c)}`)
        .join("")}`,
    );
    if (byClass) return byClass;
  }
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const siblings = Array.from(parent.children).filter((c) => c.tagName === node?.tagName);
    const index = siblings.indexOf(node) + 1;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
    node = parent;
  }
  parts.unshift("body");
  return parts.join(" > ");
}
