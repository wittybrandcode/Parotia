/** Generate a unique id. Ids must not be derived from page content. */
export function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

/** Session-scoped element id, e.g. `element-001`. */
export function elementId(index: number): string {
  return `element-${String(index).padStart(3, "0")}`;
}
