import type { CleanupState, CleanupRule, ElementReference, SitePreset } from "@shared/types";
import type { ExtractionEngine } from "../extraction/extractionEngine";
import type { Inspector, InspectorActionHandlers } from "../inspector/inspector";
import { DefaultInspector, elementReferenceOf } from "../inspector/inspector";import type { MutationEngine } from "../mutation/mutationEngine";

/**
 * Cleanup Engine — coordinates article cleanup: pick element → act
 * (delete/hide/keep) → track counts. DOM changes always go through the
 * Mutation Engine so Undo/Redo/Reset stay correct.
 */

export interface CleanupEngine {
  startInspecting(): void;
  stopInspecting(): void;
  get inspecting(): boolean;
  deleteTarget(ref: ElementReference): boolean;
  /** Deletes the picked element plus lookalikes; returns the removed count. */
  deleteSimilarTargets(ref: ElementReference): number;
  hideTarget(ref: ElementReference): boolean;
  keepTarget(ref: ElementReference): boolean;
  showSelected(): boolean;
  isHidden(ref: ElementReference): boolean;
  undo(): boolean;
  redo(): boolean;
  /** Undoes entries step by step until the given history entry is undone. */
  undoThrough(entryId: string): boolean;
  reset(): boolean;
  getState(): CleanupState;
  /**
   * Applies a preset's cleanup rules through the Mutation Engine (one undoable
   * batch) and its protection rules as keep markers. Returns removed count.
   */
  applyPreset(preset: SitePreset): number;
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
    keptCount: 0,
    activeRules: [],
    protectedTargets: [],
    selectedHidden: false,
  };

  private lastSelection: ElementReference | null = null;
  /** Rules removed by Undo, restored by Redo (keeps counts action-aware). */
  private undoneRules: CleanupRule[] = [];
  /** Every element this engine has marked keep — cleared by Reset. */
  private readonly keptElements = new Set<Element>();

  constructor(
    private readonly mutations: MutationEngine,
    private readonly extraction: ExtractionEngine,
    options?: CleanupEngineOptions,
  ) {
    // Selection mode: remember the element; the toolbar decides the action
    // (delete/hide/keep) via a follow-up command.
    this.inspector = new DefaultInspector(options?.inspectorActionHandlers);
  }

  /** The most recently picked element, or null if none. */
  get selected(): ElementReference | null {
    return this.lastSelection;
  }

  startInspecting(): void {
    this.lastSelection = null;
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
    return count;
  }

  hideTarget(ref: ElementReference): boolean {
    const op = this.mutations.hideElement(ref);
    if (!op) return false;
    this.state.hiddenCount += 1;
    this.state.activeRules.push(this.ruleFor(op.target, "HIDE"));
    return true;
  }

  keepTarget(ref: ElementReference): boolean {
    const op = this.mutations.keepElement(ref);
    if (!op) return false;
    this.state.keptCount += 1;
    this.state.protectedTargets.push(op.target);
    const element = safeQueryOne(ref.selector);
    if (element) this.keptElements.add(element);
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

  /** Whether the currently selected element is hidden by NewsClean. */
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
    const command = this.mutations.peekUndo();
    const count = this.mutations.undo();
    if (count <= 0) return false;
    if (command?.keptElement) {
      // A Keep was undone: the marker is gone, so drop it from bookkeeping.
      this.state.keptCount = Math.max(0, this.state.keptCount - count);
      const element = command.keptElement;
      this.state.protectedTargets = this.state.protectedTargets.filter((t) => !safeMatches(element, t.selector));
      return true;
    }
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
    const command = this.mutations.peekRedo();
    const count = this.mutations.redo();
    if (count <= 0) return false;
    if (command?.keptElement) {
      // The Keep marker was re-applied by the command; restore bookkeeping.
      this.state.keptCount += count;
      this.state.protectedTargets.push(elementReferenceOf(command.keptElement as HTMLElement));
      return true;
    }
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
    let clearedMarkers = false;
    for (const element of this.keptElements) {
      element.removeAttribute("data-newsclean-keep");
      clearedMarkers = true;
    }
    this.keptElements.clear();
    if (undone > 0 || clearedMarkers) {
      this.state.removedCount = 0;
      this.state.hiddenCount = 0;
      this.state.keptCount = 0;
      this.state.activeRules = [];
      this.state.protectedTargets = [];
      this.undoneRules = [];
    }
    return undone > 0 || clearedMarkers;
  }

  getState(): CleanupState {
    return {
      ...this.state,
      selectedHidden: this.selected ? this.mutations.isHidden(this.selected) : false,
    };
  }

  /**
   * Applies a preset's rules: protection rules first (keep markers), then every
   * enabled DELETE rule as ONE undoable batch, then HIDE rules individually.
   * Unmatched or protected elements are skipped; nothing crashes on a bad
   * selector. Returns the number of deleted elements.
   */
  applyPreset(preset: SitePreset): number {
    for (const rule of preset.protection?.rules ?? []) {
      if (rule.enabled === false) continue;
      this.applyProtectionRule(rule.selector);
    }

    let removed = 0;
    const deleteRefs: ElementReference[] = [];
    const hideRules: CleanupRule[] = [];
    for (const rule of preset.cleanup?.rules ?? []) {
      if (!rule.enabled) continue;
      if (rule.action === "HIDE") {
        hideRules.push(rule);
        continue;
      }
      for (const element of safeQueryAll(rule.selector)) {
        if (!element.isConnected || element.closest("[data-newsclean-keep]")) continue;
        deleteRefs.push(elementReferenceOf(element));
      }
    }

    const deleted = this.mutations.deleteMany(deleteRefs, "PRESET");
    removed += deleted;
    if (deleted > 0) {
      this.state.removedCount += deleted;
      this.state.activeRules.push({
        id: `rule-preset-${preset.id}`,
        selector: preset.cleanup?.rules.filter((r) => r.enabled && r.action === "DELETE").map((r) => r.selector).join(", ") ?? "",
        action: "DELETE",
        enabled: true,
      });
    }

    for (const rule of hideRules) {
      for (const element of safeQueryAll(rule.selector)) {
        if (!element.isConnected || element.closest("[data-newsclean-keep]")) continue;
        const op = this.mutations.hideElement(elementReferenceOf(element));
        if (op) {
          this.state.hiddenCount += 1;
          this.state.activeRules.push(this.ruleFor(op.target, "HIDE"));
        }
      }
    }
    return removed;
  }

  private applyProtectionRule(selector: string): void {
    for (const element of safeQueryAll(selector)) {
      if (!element.isConnected) continue;
      element.setAttribute("data-newsclean-keep", "true");
      this.keptElements.add(element);
      this.state.protectedTargets.push(elementReferenceOf(element));
    }
  }
}

function safeQueryAll(selector: string): HTMLElement[] {
  try {
    return Array.from(document.querySelectorAll(selector)) as HTMLElement[];
  } catch {
    return [];
  }
}

function safeQueryOne(selector: string): HTMLElement | null {
  try {
    return document.querySelector(selector) as HTMLElement | null;
  } catch {
    return null;
  }
}

function safeMatches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}
