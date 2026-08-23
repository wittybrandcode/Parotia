import type { CleanupRule, CleanupState, ElementReference } from "@shared/types";
import type { Inspector, InspectorActionHandlers } from "../inspector/inspector";
import { DefaultInspector } from "../inspector/inspector";
import type { MutationEngine } from "../mutation/mutationEngine";

/**
 * Cleanup Engine — coordinates article cleanup: pick element → act
 * (delete/hide) → track counts. DOM changes always go through the
 * Mutation Engine so Undo/Redo/Reset stay correct.
 */

export interface CleanupEngine {
  startInspecting(): void;
  stopInspecting(): void;
  get inspecting(): boolean;
  deleteTarget(ref: ElementReference): boolean;
  /** Deletes the picked element plus lookalikes; returns the removed count. */
  deleteSimilarTargets(ref: ElementReference): number;
  /** Returns the elements "Delete Similar" would remove, without deleting. */
  previewSimilarTargets(ref: ElementReference): { count: number; signatures: string[]; elements: Element[] } | null;
  /** Deletes the pick plus lookalikes, validating they still match the preview. */
  confirmDeleteSimilar(ref: ElementReference, expectedSignatures: string[]): number;
  /** Shows orange preview boxes over the given elements. */
  showPreview(elements: Element[]): void;
  /** Removes preview boxes. */
  clearPreview(): void;
  /** Marks the Delete Similar action as awaiting confirmation (count shown). */
  setDeleteSimilarPreview(count: number | null): void;
  hideTarget(ref: ElementReference): boolean;
  showSelected(): boolean;
  isHidden(ref: ElementReference): boolean;
  undo(): boolean;
  redo(): boolean;
  /** Undoes entries step by step until the given history entry is undone. */
  undoThrough(entryId: string): boolean;
  reset(): boolean;
  getState(): CleanupState;
}

export interface CleanupEngineOptions {
  /** Handlers for the action bar anchored to the picked element. */
  inspectorActionHandlers?: InspectorActionHandlers;
}

export class DefaultCleanupEngine implements CleanupEngine {
  private readonly inspector: Inspector;
  private readonly state: CleanupState = {
    removedCount: 0,
    hiddenCount: 0,
    activeRules: [],
    selectedHidden: false,
  };
  private readonly previewOverlays: HTMLElement[] = [];

  private lastSelection: ElementReference | null = null;
  /** Rules removed by Undo, restored by Redo (keeps counts action-aware). */
  private undoneRules: CleanupRule[] = [];

  constructor(
    private readonly mutations: MutationEngine,
    options?: CleanupEngineOptions,
  ) {
    // Selection mode: remember the element; the toolbar decides the action
    // (delete/hide) via a follow-up command.
    this.inspector = new DefaultInspector(options?.inspectorActionHandlers);
  }

  /** The most recently picked element, or null if none. */
  get selected(): ElementReference | null {
    return this.lastSelection;
  }

  startInspecting(): void {
    this.lastSelection = null;
    this.clearPreview();
    this.setDeleteSimilarPreview(null);
    this.inspector.start((ref) => {
      this.lastSelection = ref;
    });
  }

  stopInspecting(): void {
    this.inspector.stop();
  }

  get inspecting(): boolean {
    return this.inspector.active;
  }

  deleteTarget(ref: ElementReference): boolean {
    const op = this.mutations.deleteElement(ref);
    if (!op) return false;
    this.state.removedCount += 1;
    this.state.activeRules.push(this.ruleFor(op.target, "DELETE"));
    return true;
  }

  /** Deletes the picked element and all structurally similar elements (one Undo). */
  deleteSimilarTargets(ref: ElementReference): number {
    const count = this.mutations.deleteSimilar(ref);
    if (count > 0) {
      this.state.removedCount += count;
      this.state.activeRules.push({
        id: `rule-batch-${ref.id}`,
        selector: ref.selector,
        action: "DELETE",
        enabled: true,
      });
    }
    this.clearPreview();
    return count;
  }

  /** Computes what "Delete Similar" would remove, without changing the DOM. */
  previewSimilarTargets(ref: ElementReference): { count: number; signatures: string[]; elements: Element[] } | null {
    const similar = this.mutations.previewSimilar(ref);
    if (!similar || similar.length === 0) return null;
    const signatures = similar
      .map((element) => this.mutations.signatureOf(element))
      .filter((s): s is string => s !== null);
    return { count: similar.length, signatures, elements: similar };
  }

  /**
   * Deletes the pick plus lookalikes after a preview. Re-computes the match set
   * at confirm time and refuses to act if the page changed the signatures the
   * user approved (prevents over-deleting on a mutated DOM).
   */
  confirmDeleteSimilar(ref: ElementReference, expectedSignatures: string[]): number {
    const current = this.previewSimilarTargets(ref);
    if (!current) return 0;
    const compareSignatures = (left: string, right: string): number => left.localeCompare(right);
    const currentSignatures = current.signatures.sort(compareSignatures).join("\u0000");
    const expected = [...expectedSignatures].sort(compareSignatures).join("\u0000");
    if (currentSignatures !== expected) return 0;
    return this.deleteSimilarTargets(ref);
  }

  showPreview(elements: Element[]): void {
    this.clearPreview();
    for (const element of elements) {
      const box = document.createElement("div");
      box.setAttribute("data-newsclean-preview", "true");
      Object.assign(box.style, {
        position: "fixed",
        zIndex: "2147483646",
        pointerEvents: "none",
        boxSizing: "border-box",
        border: "2px solid #f97316",
        background: "rgba(249,115,22,0.14)",
      } as Partial<CSSStyleDeclaration>);
      document.documentElement.appendChild(box);
      this.positionPreview(box, element);
      this.previewOverlays.push(box);
    }
  }

  clearPreview(): void {
    for (const box of this.previewOverlays) box.remove();
    this.previewOverlays.length = 0;
  }

  setDeleteSimilarPreview(count: number | null): void {
    this.inspector.setDeleteSimilarPreview(count);
  }

  private positionPreview(box: HTMLElement, element: Element): void {
    const rect = element.getBoundingClientRect();
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }

  hideTarget(ref: ElementReference): boolean {
    const op = this.mutations.hideElement(ref);
    if (!op) return false;
    this.state.hiddenCount += 1;
    this.state.activeRules.push(this.ruleFor(op.target, "HIDE"));
    return true;
  }

  /** Un-hides the currently selected element (Hide ⇄ Show toggle). */
  showSelected(): boolean {
    const ref = this.selected;
    if (!ref) return false;
    const ok = this.mutations.showElement(ref);
    if (ok) {
      this.state.hiddenCount = Math.max(0, this.state.hiddenCount - 1);
      this.state.activeRules = this.state.activeRules.filter((rule) => rule.selector !== ref.selector);
    }
    return ok;
  }

  /** Whether the currently selected element is hidden by Parotia. */
  isHidden(ref: ElementReference): boolean {
    return this.mutations.isHidden(ref);
  }

  private ruleFor(target: ElementReference, action: "DELETE" | "HIDE") {
    return {
      id: `rule-${target.id}`,
      selector: target.selector,
      action,
      enabled: true,
    };
  }

  undo(): boolean {
    const count = this.mutations.undo();
    if (count <= 0) return false;
    const rule = this.state.activeRules.pop() ?? null;
    if (rule) this.undoneRules.push(rule);
    if (rule?.action === "HIDE") {
      this.state.hiddenCount = Math.max(0, this.state.hiddenCount - count);
    } else {
      this.state.removedCount = Math.max(0, this.state.removedCount - count);
    }
    return true;
  }

  /**
   * Undoes entries one at a time until the entry with `entryId` has been
   * undone, keeping every count consistent. Used by the action log's
   * per-entry Undo button.
   */
  undoThrough(entryId: string): boolean {
    let undone = false;
    while (this.mutations.canUndo()) {
      const topId = this.mutations.peekUndo()?.id;
      const step = this.undo();
      if (!step) break;
      undone = true;
      if (topId === entryId) break;
    }
    return undone;
  }

  redo(): boolean {
    const count = this.mutations.redo();
    if (count <= 0) return false;
    const rule = this.undoneRules.pop() ?? null;
    if (rule) this.state.activeRules.push(rule);
    if (rule?.action === "HIDE") {
      this.state.hiddenCount += count;
    } else {
      this.state.removedCount += count;
    }
    return true;
  }

  reset(): boolean {
    const undone = this.mutations.reset();
    if (undone > 0) {
      this.state.removedCount = 0;
      this.state.hiddenCount = 0;
      this.state.activeRules = [];
      this.undoneRules = [];
    }
    return undone > 0;
  }

  getState(): CleanupState {
    return {
      ...this.state,
      selectedHidden: this.selected ? this.mutations.isHidden(this.selected) : false,
    };
  }
}
