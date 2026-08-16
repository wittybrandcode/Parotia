import { MAX_HISTORY_OPERATIONS } from "@shared/constants";
import type { ActionLogEntry } from "@shared/types";

/**
 * History Engine. Owns Undo/Redo; the Cleanup Engine does not.
 * New commands clear the redo stack; the undo stack is capped at
 * MAX_HISTORY_OPERATIONS (oldest discarded).
 */
export interface Command {
  readonly id: string;
  readonly label: string;
  /** Number of elements the operation touches (drives count bookkeeping). */
  readonly affectedCount?: number;
  /** When the command is a KEEP, the element that carries the marker. */
  readonly keptElement?: Element;
  execute(): void;
  undo(): void;
}

interface HistoryEntry {
  command: Command;
  /** When the command was pushed, drives the action log's relative times. */
  at: number;
}

export class HistoryEngine {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  constructor(private readonly maxOperations = MAX_HISTORY_OPERATIONS) {}

  push(command: Command): void {
    this.undoStack.push({ command, at: Date.now() });
    this.redoStack.length = 0;
    if (this.undoStack.length > this.maxOperations) {
      this.undoStack.shift();
    }
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Returns the label of the next undo target, if any (for tooltips). */
  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.command.label;
  }

  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.command.label;
  }

  /** The next command that Undo would revert, if any. */
  peekUndo(): Command | null {
    return this.undoStack.at(-1)?.command ?? null;
  }

  /** The next command that Redo would replay, if any. */
  peekRedo(): Command | null {
    return this.redoStack.at(-1)?.command ?? null;
  }

  undo(): Command | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    entry.command.undo();
    this.redoStack.push(entry);
    return entry.command;
  }

  redo(): Command | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    entry.command.execute();
    this.undoStack.push(entry);
    return entry.command;
  }

  /**
   * Undoes entries one at a time until the entry with `entryId` has been
   * undone (or the stack drains). Returns the last undone command, if any.
   */
  undoTo(entryId: string): Command | null {
    let last: Command | null = null;
    while (this.undoStack.length > 0) {
      const entry = this.undoStack.pop();
      if (!entry) break;
      entry.command.undo();
      this.redoStack.push(entry);
      last = entry.command;
      if (entry.command.id === entryId) break;
    }
    return last;
  }

  /** Reset clears all cleanup history; it does not mutate the DOM itself. */
  reset(): Command[] {
    const drained = this.undoStack.map((entry) => entry.command);
    this.undoStack = [];
    this.redoStack = [];
    return drained;
  }

  /**
   * Session action log, newest first. Undo-stack entries are undoable; redo
   * entries (already undone) are listed for context but marked non-undoable.
   */
  log(): ActionLogEntry[] {
    const chronological = [...this.undoStack, ...this.redoStack];
    return chronological.reverse().map((entry) => ({
      id: entry.command.id,
      label: entry.command.label,
      at: entry.at,
      undoable: this.undoStack.includes(entry),
    }));
  }
}
