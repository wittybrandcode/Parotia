/** Generate a unique id. Ids must not be derived from page content. */
export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID()}`;
}
