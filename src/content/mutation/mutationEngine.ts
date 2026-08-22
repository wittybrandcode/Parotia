import type { CleanupAction, CleanupAfterState, CleanupOperation, CleanupSource, ElementReference, ElementSnapshot } from "@shared/types";
import { createId } from "@shared/utils/id";
import { elementSignature } from "@shared/utils/signature";
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
  /** Returns the target plus its lookalikes WITHOUT deleting (for preview). */
  previewSimilar(ref: ElementReference): Element[] | null;
  /** Structural signature used to match lookalikes, or null when too generic. */
  signatureOf(element: Element): string | null;
  /** Deletes a list of explicit targets as one undoable unit. */
  deleteMany(refs: ElementReference[], source?: CleanupSource): number;
  hideElement(ref: ElementReference): CleanupOperation | null;
  showElement(ref: ElementReference): boolean;
  isHidden(ref: ElementReference): boolean;
  /** Undo the last command; returns the number of elements it affected. */
  undo(): number;
  /** Redo the last undone command; returns the number of elements affected. */
  redo(): number;
  /** Whether any cleanup command can be undone. */
  canUndo(): boolean;
  /** The next command that Undo would revert, if any. */
  peekUndo(): Command | null;
  reset(): number;
  /** Installs a guard that re-applies deletions/hides to re-rendered elements. */
  startRegenerationGuard(): void;
  /** Stops re-applying deletions/hides to re-rendered elements. */
  stopRegenerationGuard(): void;
}

interface ResolvedTarget {
  element: Element;
  parent: HTMLElement | null;
  nextSibling: Node | null;
}

/** Cap on how many times one signature is re-guarded before giving up (safety valve against page/guard loops). */
const MAX_REGUARD_PER_SIGNATURE = 20;

export class DefaultMutationEngine implements MutationEngine {
  private readonly registry = new Map<string, { operation: CleanupOperation; hidden: boolean; signature?: string | null }>();
  /** Signature → guard behavior, plus a re-guard counter to bound loops. */
  private readonly guardedSignatures = new Map<string, { hidden: boolean; reGuards: number }>();
  /** Nodes the engine itself re-inserted (Undo/Redo/Reset) — never re-guarded. */
  private readonly legitBack = new WeakSet<Element>();
  private guardObserver: MutationObserver | null = null;

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
        const signature = elementSignature(target.element);
        this.registry.set(ref.id, { operation: op, hidden: false, signature });
        if (signature) this.guardedSignatures.set(signature, { hidden: false, reGuards: 0 });
        target.element.remove();
      },
      undo: () => {
        const recorded = this.registry.get(ref.id);
        if (recorded?.signature) this.guardedSignatures.delete(recorded.signature);
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
      signature: elementSignature(element),
    }));

    const op = this.buildOperation(ref, "DELETE");
    const command: Command = {
      id: createId("cmd"),
      label: `Delete ${similar.length} similar ${ref.tagName}`,
      affectedCount: similar.length,
      execute: () => {
        for (const entry of targets) {
          if (entry.signature) this.guardedSignatures.set(entry.signature, { hidden: false, reGuards: 0 });
          entry.element.remove();
        }
        this.registry.set(ref.id, { operation: op, hidden: false, signature: elementSignature(target) });
      },
      undo: () => {
        // Restore in reverse document order so sibling order is preserved.
        for (const entry of [...targets].reverse()) {
          if (entry.signature) this.guardedSignatures.delete(entry.signature);
          this.restoreNode(entry);
        }
        this.registry.delete(ref.id);
      },
    };
    this.run(command);
    return similar.length;
  }

  /**
   * Preview: resolves the target and returns it plus its lookalikes WITHOUT
   * deleting anything. Null when the target is gone. Used to show the user what
   * "Delete Similar" will remove before they confirm.
   */
  previewSimilar(ref: ElementReference): Element[] | null {
    const target = document.querySelector(ref.selector);
    if (!target || !target.isConnected) return null;
    return this.match.findSimilar(target);
  }

  signatureOf(element: Element): string | null {
    return this.match.signatureOf(element);
  }

  /**
   * Deletes a list of explicit targets as ONE undoable unit
   * (batch operations). Unresolvable, already-handled, or duplicate targets are skipped.
   */
  deleteMany(refs: ElementReference[], source: CleanupSource = "USER"): number {
    const resolved: { ref: ElementReference; target: ResolvedTarget; signature: string | null }[] = [];
    for (const ref of refs) {
      if (this.registry.has(ref.id)) continue;
      const target = this.resolve(ref);
      if (!target) continue;
      if (resolved.some((r) => r.target.element === target.element)) continue;
      resolved.push({ ref, target, signature: elementSignature(target.element) });
    }
    if (resolved.length === 0) return 0;

    const op = this.buildOperation(refs[0] as ElementReference, "DELETE", source);
    const command: Command = {
      id: createId("cmd"),
      label: `Delete ${resolved.length} elements`,
      affectedCount: resolved.length,
      execute: () => {
        for (const { target, signature } of resolved) {
          if (signature) this.guardedSignatures.set(signature, { hidden: false, reGuards: 0 });
          target.element.remove();
        }
        for (const { ref, signature } of resolved) {
          this.registry.set(ref.id, { operation: op, hidden: false, signature });
        }
      },
      undo: () => {
        // Restore in reverse document order so sibling order is preserved.
        for (const { target, signature } of [...resolved].reverse()) {
          if (signature) this.guardedSignatures.delete(signature);
          this.restoreNode(target);
        }
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
        const signature = elementSignature(target.element);
        this.registry.set(ref.id, { operation: op, hidden: true, signature });
        if (signature) this.guardedSignatures.set(signature, { hidden: true, reGuards: 0 });
        (target.element as HTMLElement).style.setProperty("display", "none", "important");
      },
      undo: () => {
        const recorded = this.registry.get(ref.id);
        if (recorded?.signature) this.guardedSignatures.delete(recorded.signature);
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
        this.registry.set(ref.id, {
          operation: recorded.operation,
          hidden: false,
          ...(recorded.signature ? { signature: recorded.signature } : {}),
        });
        if (recorded.signature) this.guardedSignatures.delete(recorded.signature);
      },
      undo: () => {
        (target.element as HTMLElement).style.setProperty("display", "none", "important");
        this.registry.set(ref.id, {
          operation: recorded.operation,
          hidden: true,
          ...(recorded.signature ? { signature: recorded.signature } : {}),
        });
        if (recorded.signature) this.guardedSignatures.set(recorded.signature, { hidden: true, reGuards: 0 });
      },
    };
    this.run(command);
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

  /** Undo every cleanup command in order; returns the number of undone ops. */
  reset(): number {
    const commands = this.history.reset();
    for (const command of [...commands].reverse()) {
      command.undo();
    }
    this.registry.clear();
    this.guardedSignatures.clear();
    return commands.length;
  }

  /** Installs a MutationObserver that re-applies deletions/hides to re-inserted elements. */
  startRegenerationGuard(): void {
    if (this.guardObserver) return;
    const observer = new MutationObserver((records) => {
      if (this.guardedSignatures.size === 0) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          this.guardAddedNode(node);
        }
      }
    });
    observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
    this.guardObserver = observer;
  }

  /** Disconnects the regeneration guard. */
  stopRegenerationGuard(): void {
    this.guardObserver?.disconnect();
    this.guardObserver = null;
  }

  /**
   * Re-applies the user's decision to a re-rendered element that shares a
   * signature with a deleted/hidden one. Skips nodes the engine itself restored
   * (Undo/Redo/Reset) and stops after MAX_REGUARD_PER_SIGNATURE hits per
   * signature to bound any page/guard loop.
   */
  private guardAddedNode(node: Node): void {
    if (!(node instanceof Element) || this.legitBack.has(node)) return;
    const signature = elementSignature(node);
    if (!signature) return;
    const guarded = this.guardedSignatures.get(signature);
    if (!guarded) return;
    if (guarded.reGuards >= MAX_REGUARD_PER_SIGNATURE) {
      this.guardedSignatures.delete(signature);
      return;
    }
    guarded.reGuards += 1;
    if (guarded.hidden) {
      (node as HTMLElement).style.setProperty("display", "none", "important");
    } else {
      node.remove();
    }
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
    // Mark the node so the regeneration guard never re-deletes a node the
    // engine itself restored via Undo/Redo/Reset.
    this.legitBack.add(target.element);
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
