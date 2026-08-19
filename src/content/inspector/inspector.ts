import type { ElementReference } from "@shared/types";
import { createId } from "@shared/utils/id";
import { isNewsCleanUi } from "../overlay/overlay";

/**
 * DOM Inspector — picks elements under the cursor like the DevTools picker:
 * hovering draws an outline over the element under the pointer, clicking
 * selects it and keeps the picker active so the user can pick repeatedly.
 *
 * Highlights are absolutely-positioned overlays (not classes on page elements),
 * so they work even inside transformed/overflow-hidden content and are immune
 * to the page's own CSS. Selection and cleanup are delegated to the
 * Cleanup/Mutation engines.
 */

export type InspectorMode = "IDLE" | "PICK";

export interface Inspector {
  start(onSelect: (ref: ElementReference) => void): void;
  stop(): void;
  get active(): boolean;
  /** Marks the Delete Similar button as awaiting confirmation (shows count). */
  setDeleteSimilarPreview(count: number | null): void;
}

/** Actions shown in the floating bar anchored to the selected element. */
export interface InspectorActionHandlers {
  onDelete: () => void;
  onHide: () => void;
  /** Called instead of onHide when the selected element is already hidden. */
  onShow?: () => void;
  /** Whether the selected element is currently hidden by NewsClean. */
  isHidden?: () => boolean;
  /** Deletes the selected element together with structurally similar ones. */
  onDeleteSimilar?: () => void;
  /** Captures the selected element as a standalone PNG. */
  onCapture?: () => void;
}

const HIGHLIGHT_Z_INDEX = "2147483645";
const ACTION_BAR_Z_INDEX = "2147483647";
/** Approximate toolbar height — the action bar must stay below this. */
const TOOLBAR_HEIGHT = 60;

function overlayStyle(): Partial<CSSStyleDeclaration> {
  return {
    position: "fixed",
    zIndex: HIGHLIGHT_Z_INDEX,
    pointerEvents: "none",
    display: "none",
    boxSizing: "border-box",
  };
}

function styleOverlay(el: HTMLElement, border: string, background: string): HTMLElement {
  Object.assign(el.style, overlayStyle(), { border, background });
  el.setAttribute("data-newsclean-highlight", "true");
  return el;
}

const ACTION_BAR_STYLE = `
.nc-action-bar{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;box-sizing:border-box}
.nc-action-bar *{box-sizing:border-box;margin:0}
.nc-action-bar{display:flex;flex-direction:row;align-items:center;gap:4px;padding:5px;
  border-radius:11px;background:rgba(13,18,30,.95);border:1px solid rgba(255,255,255,.14);
  box-shadow:0 8px 24px rgba(0,0,0,.45);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.nc-action-bar .nc-ab-btn{display:grid;place-items:center;width:32px;height:32px;padding:0;
  border:none;border-radius:8px;background:transparent;color:#c3cbdb;cursor:pointer;
  transition:background .12s ease,color .12s ease,transform .06s ease}
.nc-action-bar .nc-ab-btn:hover{background:rgba(255,255,255,.12);color:#fff}
.nc-action-bar .nc-ab-btn:active{transform:scale(.92)}
.nc-action-bar .nc-ab-btn[data-nc-action="delete"]:hover{background:rgba(239,68,68,.22);color:#ff6b6b}
.nc-action-bar .nc-ab-btn[data-nc-action="delete-similar"]:hover{background:rgba(249,115,22,.22);color:#fb923c}
.nc-action-bar .nc-ab-btn[data-nc-action="delete-similar"][data-nc-confirm="true"]{background:rgba(249,115,22,.28);color:#fdba74;box-shadow:inset 0 0 0 1px rgba(249,115,22,.5)}
.nc-action-bar .nc-ab-btn[data-nc-action="capture"]:hover{background:rgba(59,130,246,.22);color:#60a5fa}
.nc-action-bar .nc-ab-btn:focus-visible{outline:2px solid #ff8a00;outline-offset:1px}
`;

const EYE_OFF_PATH =
  '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>';
const EYE_PATH =
  '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
const CAMERA_PATH =
  '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>';

function setIcon(el: HTMLElement, pathData: string): void {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = pathData;
  el.textContent = "";
  el.appendChild(svg);
}

function makeActionButton(
  action: "delete" | "delete-similar" | "hide" | "capture",
  title: string,
  pathData: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nc-ab-btn";
  button.setAttribute("data-nc-action", action);
  button.title = title;
  button.setAttribute("aria-label", title);
  setIcon(button, pathData);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

export class DefaultInspector implements Inspector {
  private hoverOverlay: HTMLElement | null = null;
  private selectionOverlay: HTMLElement | null = null;
  private actionBar: HTMLElement | null = null;
  private hovered: Element | null = null;
  private selected: Element | null = null;
  private isActive = false;
  private onSelectCallback: ((ref: ElementReference) => void) | null = null;
  private rafId: number | null = null;
  private lastEvent: { clientX: number; clientY: number } | null = null;
  private hideShowButton: HTMLButtonElement | null = null;
  private deleteSimilarButton: HTMLButtonElement | null = null;
  private lastBarPosition: { top: number; left: number } | null = null;

  constructor(private readonly actionHandlers?: InspectorActionHandlers) {}

  private readonly mouseMoveHandler = (event: MouseEvent) => {
    this.lastEvent = { clientX: event.clientX, clientY: event.clientY };
    if (this.rafId !== null) return;
    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null;
      this.updateHover();
    });
  };

  private readonly scrollHandler = () => {
    if (this.hovered) this.positionOverlay(this.hoverOverlay, this.hovered);
    if (this.selected) {
      this.positionOverlay(this.selectionOverlay, this.selected);
      this.positionActionBar();
    }
  };

  private readonly resizeHandler = () => this.scrollHandler();

  private readonly clickHandler = (event: MouseEvent) => {
    const target = this.resolveTarget(event);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.select(target);
  };

  start(onSelect: (ref: ElementReference) => void): void {
    if (this.isActive) return;
    this.isActive = true;
    this.onSelectCallback = onSelect;

    this.hoverOverlay = styleOverlay(document.createElement("div"), "2px solid #ff8a00", "rgba(255,138,0,0.12)");
    this.hoverOverlay.setAttribute("aria-hidden", "true");
    this.selectionOverlay = styleOverlay(document.createElement("div"), "2px solid #1a73e8", "rgba(26,115,232,0.14)");
    this.selectionOverlay.setAttribute("aria-hidden", "true");
    this.actionBar = this.buildActionBar();
    document.documentElement.appendChild(this.hoverOverlay);
    document.documentElement.appendChild(this.selectionOverlay);
    document.documentElement.appendChild(this.actionBar);

    window.addEventListener("mousemove", this.mouseMoveHandler, { capture: true });
    window.addEventListener("scroll", this.scrollHandler, { capture: true });
    window.addEventListener("resize", this.resizeHandler);
    window.addEventListener("click", this.clickHandler, { capture: true });
    document.body.style.cursor = "crosshair";
  }

  stop(): void {
    this.isActive = false;
    this.onSelectCallback = null;
    window.removeEventListener("mousemove", this.mouseMoveHandler, { capture: true });
    window.removeEventListener("scroll", this.scrollHandler, { capture: true });
    window.removeEventListener("resize", this.resizeHandler);
    window.removeEventListener("click", this.clickHandler, { capture: true });
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.hoverOverlay?.remove();
    this.selectionOverlay?.remove();
    this.actionBar?.remove();
    this.hoverOverlay = null;
    this.selectionOverlay = null;
    this.actionBar = null;
    this.hideShowButton = null;
    this.deleteSimilarButton = null;
    this.hovered = null;
    this.selected = null;
    this.lastBarPosition = null;
    this.lastEvent = null;
    document.body.style.cursor = "";
  }

  get active(): boolean {
    return this.isActive;
  }

  /** Toggles the Delete Similar button into "confirm" mode with the match count. */
  setDeleteSimilarPreview(count: number | null): void {
    const button = this.deleteSimilarButton;
    if (!button) return;
    if (count !== null && count > 0) {
      button.dataset.ncConfirm = "true";
      button.title = `Confirm: delete ${count} similar elements`;
      button.setAttribute("aria-label", `Confirm deleting ${count} similar elements`);
    } else {
      delete button.dataset.ncConfirm;
      button.title = "Delete similar elements";
      button.setAttribute("aria-label", "Delete similar elements");
    }
  }

  private updateHover(): void {
    const event = this.lastEvent;
    if (!event) return;
    const target = this.resolvePoint(event.clientX, event.clientY);

    // If the previously selected element was removed from the DOM (e.g. via
    // Delete), clear its selection marker and the action bar.
    this.refreshSelection();

    if (target === this.hovered) {
      this.positionOverlay(this.hoverOverlay, target);
      return;
    }
    this.hovered = target;
    if (!target) {
      if (this.hoverOverlay) this.hoverOverlay.style.display = "none";
      return;
    }
    this.positionOverlay(this.hoverOverlay, target);
  }

  private select(target: Element): void {
    this.selected = target;
    this.onSelectCallback?.(elementReferenceOf(target as HTMLElement));
    // Keep the picker active for repeated picks (DevTools behavior).
    this.positionOverlay(this.selectionOverlay, target);
    this.refreshActionBar();
    this.positionActionBar();
  }

  /** Clears the selection and action bar when the picked element is gone. */
  private refreshSelection(): void {
    if (!this.selected || this.selected.isConnected) return;
    this.selected = null;
    if (this.selectionOverlay) this.selectionOverlay.style.display = "none";
    if (this.actionBar) this.actionBar.style.display = "none";
  }

  private resolveTarget(event: MouseEvent): HTMLElement | null {
    return this.resolvePoint(event.clientX, event.clientY);
  }

  private resolvePoint(clientX: number, clientY: number): HTMLElement | null {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!element) return null;
    if (isNewsCleanUi(element)) return null;
    if (element === document.body || element === document.documentElement) return null;
    return element;
  }

  private positionOverlay(overlay: HTMLElement | null, target: Element | null): void {
    if (!overlay || !target) return;
    const rect = target.getBoundingClientRect();
    overlay.style.display = rect.width > 0 && rect.height > 0 ? "block" : "none";
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  /**
   * Keeps the action bar visible and inside the selected element. The bar
   * prefers the element's top edge (never its center, which can be off-screen
   * for very tall containers) and is clamped to the viewport so it is always
   * reachable even if the element is taller than the screen. When the element
   * is hidden (no box), the bar stays at its last position so it can be shown
   * again with the Show button.
   */
  private positionActionBar(): void {
    const bar = this.actionBar;
    if (!bar || !this.selected) return;
    const rect = this.selected.getBoundingClientRect();
    const hidden = this.actionHandlers?.isHidden?.() ?? false;
    if (rect.width <= 0 || rect.height <= 0) {
      if (hidden && this.lastBarPosition) {
        bar.style.display = "flex";
        bar.style.top = `${this.lastBarPosition.top}px`;
        bar.style.left = `${this.lastBarPosition.left}px`;
      } else {
        bar.style.display = "none";
      }
      return;
    }
    bar.style.display = "flex";
    const barHeight = bar.offsetHeight || 42;
    const barWidth = bar.offsetWidth || 124;

    // Prefer just inside the element's top-left corner.
    let top = rect.top + 8;
    let left = rect.left + 8;
    // Stay within the element's bounds.
    top = Math.max(top, rect.top);
    top = Math.min(top, rect.bottom - barHeight);
    left = Math.max(left, rect.left);
    left = Math.min(left, rect.right - barWidth);
    // Always stay fully visible in the viewport, below the toolbar.
    top = Math.max(TOOLBAR_HEIGHT, Math.min(top, window.innerHeight - barHeight - 4));
    left = Math.max(4, Math.min(left, window.innerWidth - barWidth - 4));

    this.lastBarPosition = { top, left };
    bar.style.top = `${Math.round(top)}px`;
    bar.style.left = `${Math.round(left)}px`;
  }

  /** Swaps the Hide/Show button to match the selected element's state. */
  private refreshActionBar(): void {
    const button = this.hideShowButton;
    if (!button) return;
    const hidden = this.actionHandlers?.isHidden?.() ?? false;
    const title = hidden ? "Show element" : "Hide element";
    setIcon(button, hidden ? EYE_PATH : EYE_OFF_PATH);
    button.title = title;
    button.setAttribute("aria-label", title);
  }

  private buildActionBar(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "nc-action-bar";
    bar.setAttribute("data-newsclean-root", "true");
    Object.assign(bar.style, {
      position: "fixed",
      zIndex: ACTION_BAR_Z_INDEX,
      pointerEvents: "auto",
      display: "none",
    });

    const run = (action: () => void): void => {
      action();
      window.setTimeout(() => {
        this.refreshSelection();
        this.refreshActionBar();
        this.positionActionBar();
      }, 0);
    };

    const style = document.createElement("style");
    style.textContent = ACTION_BAR_STYLE;
    bar.appendChild(style);

    bar.appendChild(
      makeActionButton(
        "delete",
        "Delete element",
        '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
        () => run(() => this.actionHandlers?.onDelete()),
      ),
    );

    // Hide ⇄ Show toggle: hides the element or brings it back if hidden.
    this.hideShowButton = makeActionButton(
      "hide",
      "Hide element",
      EYE_OFF_PATH,
      () =>
        run(() => {
          if (this.actionHandlers?.isHidden?.() ?? false) {
            this.actionHandlers?.onShow?.();
          } else {
            this.actionHandlers?.onHide();
          }
        }),
    );
    bar.appendChild(this.hideShowButton);

    // Delete Similar: removes the element and every structurally similar one.
    if (this.actionHandlers?.onDeleteSimilar) {
      this.deleteSimilarButton = makeActionButton(
        "delete-similar",
        "Delete similar elements",
        '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
        () => run(() => this.actionHandlers?.onDeleteSimilar?.()),
      );
      bar.appendChild(this.deleteSimilarButton);
    }

    // Capture: exports only this element as a crisp PNG.
    if (this.actionHandlers?.onCapture) {
      bar.appendChild(
        makeActionButton(
          "capture",
          "Capture element as PNG",
          CAMERA_PATH,
          () => run(() => this.actionHandlers?.onCapture?.()),
        ),
      );
    }

    return bar;
  }
}

/** Builds a stable-enough reference for an element (id > data attribute > css path). */
export function elementReferenceOf(element: HTMLElement): ElementReference {
  return {
    id: createId("element"),
    tagName: element.tagName.toLowerCase(),
    selector: stableSelector(element),
  };
}

function stableSelector(element: HTMLElement): string {
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
        .slice(0, 3)
        .map((c) => `.${CSS.escape(c)}`)
        .join("")}`,
    );
    if (byClass) return byClass;
  }
  // Structural nth-of-type path from root — uniquely identifies this element
  // even when many siblings share the same data-testid/classes (e.g. tweets).
  const parts: string[] = [];
  let node: HTMLElement | null = element;
  while (node && node !== document.body && node !== document.documentElement) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    const siblings = Array.from(parent.children).filter((c) => c.tagName === node?.tagName);
    const index = siblings.indexOf(node) + 1;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
    node = parent;
  }
  parts.unshift("body");
  return parts.join(" > ");
}
