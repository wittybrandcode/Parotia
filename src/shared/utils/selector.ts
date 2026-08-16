/**
 * Selector generation and validation. Selector priority:
 * `Stable ID → unique class → semantic attribute → tag + stable attrs → structural`.
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

/** Stable, shortest reasonable selector for a single element. */
export function generateSelector(element: Element): string {
  if (element.id) {
    const byId = `#${escapeForSelector(element.id)}`;
    try {
      if (document.querySelectorAll(byId).length === 1) return byId;
    } catch {
      /* fall through */
    }
  }

  const classes = Array.from(element.classList).filter((c) => /^[a-zA-Z_-][\w-]*$/.test(c));
  for (let i = classes.length; i > 0; i--) {
    // Try the most specific class combinations first.
    const combos = combinations(classes, i);
    for (const combo of combos) {
      const candidate = `${element.tagName.toLowerCase()}.${combo.map(escapeForSelector).join(".")}`;
      try {
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      } catch {
        /* continue */
      }
    }
  }

  const tag = element.tagName.toLowerCase();
  try {
    if (document.querySelectorAll(tag).length === 1) return tag;
  } catch {
    /* continue */
  }

  return structuralSelector(element);
}

function escapeForSelector(token: string): string {
  return token.replace(/[:.#[\],]/g, (ch) => `\\${ch}`);
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [head, ...tail] = items;
  if (head === undefined) return combinations(tail, size);
  return [...combinations(tail, size - 1).map((c) => [head, ...c]), ...combinations(tail, size)];
}

/** Structural selector with minimal `nth-child` depth — a last resort. */
function structuralSelector(element: Element): string {
  const path: string[] = [];
  let node: Element | null = element;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    if (node.id) {
      path.unshift(`#${escapeForSelector(node.id)}`);
      break;
    }
    const parent: Element | null = node.parentElement;
    if (!parent || parent === document.documentElement) {
      path.unshift(node.tagName.toLowerCase());
      break;
    }
    const siblings = Array.from(parent.children).filter((s) => s.tagName === node?.tagName);
    const index = siblings.indexOf(node) + 1;
    path.unshift(siblings.length > 1 ? `${node.tagName.toLowerCase()}:nth-child(${index})` : node.tagName.toLowerCase());
    node = parent;
  }
  return path.join(" > ");
}
