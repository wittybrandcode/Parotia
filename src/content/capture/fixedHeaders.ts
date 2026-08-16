import { isNewsCleanUi } from "../overlay/overlay";

/**
 * Fixed-header handling for full-page capture. A position:fixed/sticky header
 * stays in the viewport while the page scrolls, so it would otherwise be drawn
 * on top of every captured slice. We detect such headers once, keep them for
 * the first slice (the top of the image), then hide them for every slice that
 * comes after so the header appears exactly once at the top of the page.
 */

export interface FixedHeaderRecord {
  el: HTMLElement;
  visibility: string | null;
}

const TOP_STRIP_MAX = 140;
const MAX_HEADER_HEIGHT = 400;

function isTopFixed(el: HTMLElement): boolean {
  if (getComputedStyle(el).position !== "fixed") return false;
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top <= TOP_STRIP_MAX && rect.width > 0 && rect.height > 0 && rect.height <= MAX_HEADER_HEIGHT;
}

function isTopSticky(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.position !== "sticky") return false;
  const top = parseFloat(style.top || "");
  return !Number.isNaN(top) && top <= TOP_STRIP_MAX;
}

function hasFixedAncestor(el: HTMLElement): boolean {
  let parent = el.parentElement;
  while (parent) {
    const position = getComputedStyle(parent).position;
    if (position === "fixed" || position === "sticky") return true;
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Finds and hides fixed headers during a full-page capture. Detection records
 * the outermost fixed/sticky elements intersecting the top strip of the
 * viewport; hiding them is idempotent and restore puts every element back.
 */
export class FixedHeaderManager {
  private records: FixedHeaderRecord[] = [];
  private hidden = false;

  /** Rescan the page and record candidate headers. Returns how many were found. */
  detect(): number {
    this.records = [];
    const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"));
    for (const el of elements) {
      if (isNewsCleanUi(el)) continue;
      if (hasFixedAncestor(el)) continue;
      if (!isTopFixed(el) && !isTopSticky(el)) continue;
      this.records.push({ el, visibility: el.style.getPropertyValue("visibility") || null });
    }
    return this.records.length;
  }

  /** Hide all recorded headers (once) so later slices do not repeat them. */
  hideAll(): void {
    if (this.hidden) return;
    for (const record of this.records) {
      record.el.style.setProperty("visibility", "hidden", "important");
    }
    this.hidden = true;
  }

  /** Restore every header to its pre-capture visibility and clear the records. */
  restoreAll(): void {
    for (const record of this.records) {
      if (record.visibility === null) record.el.style.removeProperty("visibility");
      else record.el.style.setProperty("visibility", record.visibility);
    }
    this.records = [];
    this.hidden = false;
  }

  /** Restore and reset, ready for the next capture. */
  reset(): void {
    this.restoreAll();
  }
}
