/**
 * Records temporary DOM mutations and restores the exact original inline
 * state. The first write to a property/attribute owns its snapshot; subsequent
 * writes during the same transaction do not overwrite that baseline.
 */
export class DomPatchLedger {
  private readonly undos: Array<() => void> = [];
  private readonly styleKeys = new WeakMap<HTMLElement, Set<string>>();
  private readonly attributeKeys = new WeakMap<Element, Set<string>>();
  private restored = false;

  setStyle(element: HTMLElement, property: string, value: string, priority = ""): void {
    if (this.restored) throw new Error("Cannot mutate through a restored DOM patch ledger");
    let keys = this.styleKeys.get(element);
    if (!keys) {
      keys = new Set();
      this.styleKeys.set(element, keys);
    }
    if (!keys.has(property)) {
      keys.add(property);
      const originalValue = element.style.getPropertyValue(property);
      const originalPriority = element.style.getPropertyPriority(property);
      this.undos.push(() => {
        if (originalValue === "") element.style.removeProperty(property);
        else element.style.setProperty(property, originalValue, originalPriority);
      });
    }
    element.style.setProperty(property, value, priority);
  }

  setAttribute(element: Element, name: string, value: string): void {
    this.rememberAttribute(element, name);
    element.setAttribute(name, value);
  }

  removeAttribute(element: Element, name: string): void {
    this.rememberAttribute(element, name);
    element.removeAttribute(name);
  }

  restore(): void {
    if (this.restored) return;
    this.restored = true;
    for (let index = this.undos.length - 1; index >= 0; index -= 1) {
      try {
        this.undos[index]?.();
      } catch {
        // Restoration is best effort per entry; one detached/hostile node must
        // not prevent the remaining page state from being restored.
      }
    }
    this.undos.length = 0;
  }

  private rememberAttribute(element: Element, name: string): void {
    if (this.restored) throw new Error("Cannot mutate through a restored DOM patch ledger");
    let keys = this.attributeKeys.get(element);
    if (!keys) {
      keys = new Set();
      this.attributeKeys.set(element, keys);
    }
    if (keys.has(name)) return;
    keys.add(name);
    const existed = element.hasAttribute(name);
    const originalValue = element.getAttribute(name);
    this.undos.push(() => {
      if (!existed) element.removeAttribute(name);
      else element.setAttribute(name, originalValue ?? "");
    });
  }
}
