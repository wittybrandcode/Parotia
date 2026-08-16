import type { BackgroundCommand } from "@shared/types";

/**
 * Keyboard shortcuts — run the most important commands without touching the
 * toolbar. The shortcuts reuse the exact same command pipeline as the toolbar,
 * so state, counts and Undo stay consistent. Shortcuts only use Shift+Alt
 * combos (never Ctrl/Cmd) so they never clash with browser shortcuts.
 *
 * - Shift+Alt+F — Freeze / Unfreeze the page
 * - Shift+Alt+P — Toggle the element picker
 * - Escape      — Stop the picker (and dismiss its action bar)
 * - Delete/Backspace — Delete the selected element (only while picking)
 */

export interface ShortcutContext {
  /** Whether the page is currently frozen. */
  frozen: boolean;
  /** Whether the picker is active. */
  inspecting: boolean;
  /** Whether an element is currently selected. */
  hasSelection: boolean;
}

export interface KeyboardShortcutsOptions {
  getState: () => ShortcutContext;
  dispatch: (command: BackgroundCommand) => void;
}

/** True when an element is a form control / editable region (never hijack it). */
function isEditable(element: unknown): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return true;
  }
  if (element.isContentEditable) return true;
  const editableRegion = element.closest("[contenteditable]");
  return editableRegion !== null && editableRegion.getAttribute("contenteditable") !== "false";
}

export class KeyboardShortcuts {
  private readonly handler: (event: KeyboardEvent) => void;
  private installed = false;

  constructor(private readonly options: KeyboardShortcutsOptions) {
    this.handler = (event) => this.handle(event);
  }

  start(): void {
    if (this.installed) return;
    this.installed = true;
    window.addEventListener("keydown", this.handler, { capture: true });
  }

  stop(): void {
    if (!this.installed) return;
    this.installed = false;
    window.removeEventListener("keydown", this.handler, { capture: true });
  }

  get active(): boolean {
    return this.installed;
  }

  private handle(event: KeyboardEvent): void {
    // Respect typing in form fields: event.target in real browsers, and the
    // focused element as a fallback for synthetic/iframe dispatch.
    if (isEditable(event.target) || isEditable(document.activeElement)) return;
    const { frozen, inspecting, hasSelection } = this.options.getState();

    if (event.shiftKey && event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.code === "KeyF") {
        event.preventDefault();
        this.dispatch({
          type: frozen ? "UNFREEZE_PAGE" : "FREEZE_PAGE",
          payload: { sessionId: "" },
        });
        return;
      }
      if (event.code === "KeyP") {
        event.preventDefault();
        this.dispatch({
          type: inspecting ? "INSPECT_STOP" : "INSPECT_START",
          payload: { sessionId: "" },
        });
        return;
      }
    }

    if (event.key === "Escape") {
      if (inspecting) {
        event.preventDefault();
        this.dispatch({ type: "INSPECT_STOP", payload: { sessionId: "" } });
      }
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && inspecting && hasSelection) {
      event.preventDefault();
      this.dispatch({ type: "DELETE_ELEMENT", payload: { sessionId: "", elementId: "" } });
    }
  }

  private dispatch(command: BackgroundCommand): void {
    this.options.dispatch(command);
  }
}
