/**
 * Element reference model — NewsClean never persists or stores raw DOM nodes.
 * An {@link ElementReference} is an identity + a resolution mechanism.
 */

/** A serializable, page-bound reference to a DOM element. Never persisted across sessions. */
export interface ElementReference {
  /** Session-scoped id, e.g. `element-001`. Not valid across page reloads. */
  id: string;
  /** CSS selector used to resolve the element against the current DOM. */
  selector: string;
  tagName: string;
  className?: string;
  /** Structural context used for conservative re-resolution when the DOM changes. */
  path?: string;
}

/**
 * A selector is a resolution mechanism, not an identity guarantee.
 * Resolution happens against the current DOM. When a reference cannot be
 * resolved safely, callers must report `STALE_REFERENCE` rather than silently
 * acting on a different element.
 */
export interface ElementResolver {
  resolve(reference: ElementReference): Element | null;
}

/** Lightweight descriptive snapshot of an element — never the DOM itself. */
export interface ElementSnapshot {
  tagName: string;
  selector: string;
  textPreview?: string;
  className?: string;
  boundingBox?: Rect;
}

/** Rectangle in CSS pixels unless explicitly stated otherwise. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Outcome of attempting to resolve a reference. */
export type ResolveResult =
  | { kind: "RESOLVED"; element: Element }
  | { kind: "STALE_REFERENCE" };
