const DEFAULT_MAX_ENTRIES = 30;
const DEFAULT_MAX_CHARS = 32 * 1024 * 1024;

/**
 * One visible history for every editor operation. PNG data URLs are compressed
 * compared with ImageData and the total retained string budget is bounded.
 */
export class EditorHistory {
  private current: string | null = null;
  private readonly undoStack: string[] = [];
  private readonly redoStack: string[] = [];

  constructor(
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
    private readonly maxChars = DEFAULT_MAX_CHARS,
  ) {}

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get value(): string | null { return this.current; }

  initialize(value: string): void {
    this.current = value;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  commit(value: string): void {
    if (this.current === null) {
      this.initialize(value);
      return;
    }
    if (value === this.current) return;
    this.undoStack.push(this.current);
    this.current = value;
    this.redoStack.length = 0;
    this.trim();
  }

  undo(): string | null {
    const previous = this.undoStack.pop();
    if (previous === undefined || this.current === null) return null;
    this.redoStack.push(this.current);
    this.current = previous;
    this.trim();
    return previous;
  }

  redo(): string | null {
    const next = this.redoStack.pop();
    if (next === undefined || this.current === null) return null;
    this.undoStack.push(this.current);
    this.current = next;
    this.trim();
    return next;
  }

  clear(): void {
    this.current = null;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private trim(): void {
    while (this.undoStack.length > this.maxEntries) this.undoStack.shift();
    while (this.redoStack.length > this.maxEntries) this.redoStack.shift();
    const retainedChars = (): number =>
      (this.current?.length ?? 0)
      + this.undoStack.reduce((sum, value) => sum + value.length, 0)
      + this.redoStack.reduce((sum, value) => sum + value.length, 0);
    while (this.undoStack.length > 0 && retainedChars() > this.maxChars) this.undoStack.shift();
    while (this.redoStack.length > 0 && retainedChars() > this.maxChars) this.redoStack.shift();
  }
}
