/**
 * Element reference model — Parotia never persists or stores raw DOM nodes.
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
