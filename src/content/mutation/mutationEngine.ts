import type { CleanupAction, CleanupAfterState, CleanupOperation, CleanupSource, ElementReference, ElementSnapshot } from "@shared/types";
import { createId } from "@shared/utils/id";
import type { Command, HistoryEngine } from "./history";
import { DefaultMatchEngine, type MatchEngine } from "../matching/matchEngine";

/**
 * Mutation Engine — the single point through which every DOM mutation passes
 * (Inspector, Cleanup, Capture). Centralization makes
 * Undo/Redo reliable and guarantees restoration metadata is always recorded.
 *
 * Higher-level services must not call `element.remove()` directly.
 */

export interface MutationEngine {
  deleteElement(ref: ElementReference): CleanupOperation | null;
  /** Deletes the target and every structurally similar element as one unit. */
  deleteSimilar(ref: ElementReference): number;
  /** Deletes a list of explicit targets as one undoable unit. */
  deleteMany(refs: ElementReference[], source?: CleanupSource): number;
  hideElement(ref: ElementReference): CleanupOperation | null;
  showElement(ref: ElementReference): boolean;
  isHidden(ref: ElementReference): boolean;
  restoreElement(ref: ElementReference): boolean;
  /** Undo the last command; returns the number of elements it affected. */
  undo(): number;
  /** Redo the last undone command; returns the number of elements affected. */
  redo(): number;
  /** Whether any cleanup command can be undone. */
  canUndo(): boolean;
  /** The next command that Undo would revert, if any. */
  peekUndo(): Command | null;
  /** The next command that Redo would replay, if any. */
  peekRedo(): Command | null;
  reset(): number;
}

interface ResolvedTarget {
  element: Element;
  parent: HTMLElement | null;
  nextSibling: Node | null;
}

export class DefaultMutationEngine implements MutationEngine {
  private readonly registry = new Map<string, { operation: CleanupOperation; hidden: boolean }>();

  constructor(
    private readonly history: HistoryEngine,
    private readonly match: MatchEngine = new DefaultMatchEngine(),
  ) {}

  deleteElement(ref: ElementReference): CleanupOperation | null {
    const target = this.resolve(ref);
    if (!target) return null;

    const op = this.buildOperation(ref, "DELETE");
    const command: Command = {
      id: createId("cmd"),
      label: `Delete ${ref.tagName}`,
      affectedCount: 1,
      execute: () => {
        target.element.remove();
        this.registry.set(ref.id, { operation: op, hidden: false });
      },
      undo: () => {
        this.restoreNode(target);
        this.registry.delete(ref.id);
      },
    };
    this.run(command);
    return op;
  }

  /**
   * Deletes the target and every element sharing its structural signature as
   * ONE undoable unit. Returns the number of elements removed (0 = nothing).
   */
  deleteSimilar(ref: ElementReference): number {
    const target = document.querySelector(ref.selector);
    if (!target || !target.isConnected) return 0;

    const similar = this.match.findSimilar(target);
    if (similar.length === 0) return 0;

    const targets = similar.map((element) => ({
      element,
      parent: element.parentElement,
      nextSibling: element.nextSibling,
    }));

    const op = this.buildOperation(ref, "DELETE");
    const command: Command = {
      id: createId("cmd"),
      label: `Delete ${similar.length} similar ${ref.tagName}`,
      affectedCount: similar.length,
      execute: () => {
        for (const entry of targets) entry.element.remove();
        this.registry.set(ref.id, { operation: op, hidden: false });
      },
      undo: () => {
        // Restore in reverse document order so sibling order is preserved.
        for (const entry of [...targets].reverse()) this.restoreNode(entry);
        this.registry.delete(ref.id);
      },
    };
    this.run(command);
    return similar.length;
  }

  /**
   * Deletes a list of explicit targets as ONE undoable unit
   * (batch operations). Unresolvable, already-handled, or duplicate targets are skipped.
   */
  deleteMany(refs: ElementReference[], source: CleanupSource = "USER"): number {
    const resolved: { ref: ElementReference; target: ResolvedTarget }[] = [];
    for (const ref of refs) {
      if (this.registry.has(ref.id)) continue;
      const target = this.resolve(ref);
      if (!target) continue;
      if (resolved.some((r) => r.target.element === target.element)) continue;
      resolved.push({ ref, target });
    }
    if (resolved.length === 0) return 0;

    const op = this.buildOperation(refs[0] as ElementReference, "DELETE", source);
    const command: Command = {
      id: createId("cmd"),
      label: `Delete ${resolved.length} elements`,
      affectedCount: resolved.length,
      execute: () => {
        for (const { target } of resolved) target.element.remove();
        for (const { ref } of resolved) this.registry.set(ref.id, { operation: op, hidden: false });
      },
      undo: () => {
        // Restore in reverse document order so sibling order is preserved.
        for (const { target } of [...resolved].reverse()) this.restoreNode(target);
        for (const { ref } of resolved) this.registry.delete(ref.id);
      },
    };
    this.run(command);
    return resolved.length;
  }

  hideElement(ref: ElementReference): CleanupOperation | null {
    const target = this.resolve(ref);
    if (!target) return null;

    const op = this.buildOperation(ref, "HIDE");
    const command: Command = {
      id: createId("cmd"),
      label: `Hide ${ref.tagName}`,
      affectedCount: 1,
      execute: () => {
        (target.element as HTMLElement).style.setProperty("display", "none", "important");
        this.registry.set(ref.id, { operation: op, hidden: true });
      },
      undo: () => {
        (target.element as HTMLElement).style.removeProperty("display");
        this.registry.delete(ref.id);
      },
    };
    this.run(command);
    return op;
  }

  /** Whether the element is currently hidden by NewsClean (registry-backed). */
  isHidden(ref: ElementReference): boolean {
    return this.registry.get(ref.id)?.hidden ?? false;
  }

  /**
   * Restores a hidden element (removes `display: none`). Recorded in history,
   * so Undo re-hides it and Reset keeps every mutation reversible.
   */
  showElement(ref: ElementReference): boolean {
    const recorded = this.registry.get(ref.id);
    if (!recorded?.hidden) return false;
    const target = this.resolve(ref);
    if (!target) return false;

    const command: Command = {
      id: createId("cmd"),
      label: `Show ${ref.tagName}`,
      affectedCount: 1,
      execute: () => {
        (target.element as HTMLElement).style.removeProperty("display");
        this.registry.set(ref.id, { operation: recorded.operation, hidden: false });
      },
      undo: () => {
        (target.element as HTMLElement).style.setProperty("display", "none", "important");
        this.registry.set(ref.id, { operation: recorded.operation, hidden: true });
      },
    };
    this.run(command);
    return true;
  }

  restoreElement(ref: ElementReference): boolean {
    const recorded = this.registry.get(ref.id);
    if (!recorded) return false;
    if (recorded.hidden) {
      const target = this.resolve(ref);
      if (target) (target.element as HTMLElement).style.removeProperty("display");
    }
    this.registry.delete(ref.id);
    return true;
  }

  undo(): number {
    return this.history.undo()?.affectedCount ?? 0;
  }

  redo(): number {
    return this.history.redo()?.affectedCount ?? 0;
  }

  canUndo(): boolean {
    return this.history.canUndo;
  }

  peekUndo(): Command | null {
    return this.history.peekUndo();
  }

  peekRedo(): Command | null {
    return this.history.peekRedo();
  }

  /** Undo every cleanup command in order; returns the number of undone ops. */
  reset(): number {
    const commands = this.history.reset();
    for (const command of [...commands].reverse()) {
      command.undo();
    }
    this.registry.clear();
    return commands.length;
  }

  private run(command: Command): void {
    command.execute();
    this.history.push(command);
  }

  private resolve(ref: ElementReference): ResolvedTarget | null {
    const element = document.querySelector(ref.selector);
    if (!element || !element.isConnected) return null;
    return {
      element,
      parent: element.parentElement,
      nextSibling: element.nextSibling,
    };
  }

  private buildOperation(ref: ElementReference, action: CleanupAction, source: CleanupSource = "USER"): CleanupOperation {
    const element = document.querySelector(ref.selector);
    const after: CleanupAfterState = { status: action === "DELETE" ? "DELETED" : "HIDDEN" };
    return {
      id: createId("operation"),
      timestamp: Date.now(),
      action,
      target: ref,
      source,
      before: snapshotOf(element, ref.selector),
      after,
    };
  }

  private restoreNode(target: ResolvedTarget): void {
    const { parent, nextSibling } = target;
    if (parent) {
      if (nextSibling && nextSibling.parentNode === parent) {
        parent.insertBefore(target.element, nextSibling);
      } else {
        parent.appendChild(target.element);
      }
    } else {
      document.documentElement.appendChild(target.element);
    }
  }
}

function snapshotOf(element: Element | null, selector: string): ElementSnapshot {
  if (!element) return { tagName: "UNKNOWN", selector };
  const snapshot: ElementSnapshot = { tagName: element.tagName, selector };
  if (typeof element.className === "string") snapshot.className = element.className;
  const preview = element.textContent?.slice(0, 80).trim();
  if (preview) snapshot.textPreview = preview;
  return snapshot;
}

export type { ElementReference };
