import { createId } from "@shared/utils/id";
import { cloneEditorDocument, type EditorDocument, type EditorLayer } from "./EditorDocument";

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

export type EditorDocumentPatch =
  | { operation: "add-layer"; layer: EditorLayer }
  | { operation: "remove-layer"; layer: EditorLayer }
  | { operation: "replace-layer"; before: EditorLayer; after: EditorLayer }
  | { operation: "reorder-layers"; before: string[]; after: string[] }
  | { operation: "replace-document"; before: EditorDocument; after: EditorDocument };

export interface EditorDocumentCommand {
  id: string;
  label: string;
  timestamp: number;
  forward: EditorDocumentPatch;
  backward: EditorDocumentPatch;
}

function updated(document: EditorDocument, layers: EditorLayer[]): EditorDocument {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
    layers: layers.map((layer, order) => ({ ...layer, order })),
  };
}

function applyOrder(document: EditorDocument, order: string[]): EditorDocument {
  if (order.length !== document.layers.length || new Set(order).size !== order.length) throw new Error("Layer order must contain every layer exactly once");
  const byId = new Map(document.layers.map((layer) => [layer.id, layer]));
  const layers = order.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`Unknown layer ${id}`);
    return entry;
  });
  return updated(document, layers);
}

export function applyEditorDocumentPatch(document: EditorDocument, patch: EditorDocumentPatch): EditorDocument {
  switch (patch.operation) {
    case "add-layer":
      if (document.layers.some((layer) => layer.id === patch.layer.id)) throw new Error(`Layer ${patch.layer.id} already exists`);
      {
        const layers = [...document.layers];
        layers.splice(Math.max(0, Math.min(layers.length, Math.trunc(patch.layer.order))), 0, patch.layer);
        return updated(document, layers);
      }
    case "remove-layer": {
      if (!document.layers.some((layer) => layer.id === patch.layer.id)) throw new Error(`Layer ${patch.layer.id} does not exist`);
      return updated(document, document.layers.filter((layer) => layer.id !== patch.layer.id));
    }
    case "replace-layer": {
      const index = document.layers.findIndex((layer) => layer.id === patch.before.id);
      if (index < 0 || patch.before.id !== patch.after.id || patch.before.kind !== patch.after.kind) throw new Error("Layer replacement must preserve an existing id and kind");
      const layers = [...document.layers];
      layers[index] = patch.after;
      return updated(document, layers);
    }
    case "reorder-layers":
      return applyOrder(document, patch.after);
    case "replace-document":
      return cloneEditorDocument(patch.after);
  }
}

function command(label: string, forward: EditorDocumentPatch, backward: EditorDocumentPatch): EditorDocumentCommand {
  return { id: createId("editor-command"), label, timestamp: Date.now(), forward, backward };
}

export function addLayerCommand(layer: EditorLayer): EditorDocumentCommand {
  return command(`Add ${layer.name}`, { operation: "add-layer", layer }, { operation: "remove-layer", layer });
}

export function removeLayerCommand(document: EditorDocument, layerId: string): EditorDocumentCommand {
  const layer = document.layers.find((entry) => entry.id === layerId);
  if (!layer) throw new Error(`Layer ${layerId} does not exist`);
  return command(`Remove ${layer.name}`, { operation: "remove-layer", layer }, { operation: "add-layer", layer });
}

export function replaceLayerCommand(before: EditorLayer, after: EditorLayer, label = `Edit ${before.name}`): EditorDocumentCommand {
  return command(label, { operation: "replace-layer", before, after }, { operation: "replace-layer", before: after, after: before });
}

export function reorderLayersCommand(before: string[], after: string[]): EditorDocumentCommand {
  return command("Reorder layers", { operation: "reorder-layers", before, after }, { operation: "reorder-layers", before: after, after: before });
}

export function replaceDocumentCommand(before: EditorDocument, after: EditorDocument, label: string): EditorDocumentCommand {
  return command(label, { operation: "replace-document", before, after }, { operation: "replace-document", before: after, after: before });
}

function commandBytes(value: EditorDocumentCommand): number {
  return JSON.stringify(value).length * 2;
}

export class EditorDocumentHistory {
  private currentDocument: EditorDocument;
  private readonly undoStack: EditorDocumentCommand[] = [];
  private readonly redoStack: EditorDocumentCommand[] = [];
  private retainedBytes = 0;

  constructor(
    initialDocument: EditorDocument,
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
    private readonly maxBytes = DEFAULT_MAX_BYTES,
  ) {
    this.currentDocument = cloneEditorDocument(initialDocument);
  }

  get document(): EditorDocument { return this.currentDocument; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string | null { return this.undoStack.at(-1)?.label ?? null; }
  get redoLabel(): string | null { return this.redoStack.at(-1)?.label ?? null; }
  get memoryBytes(): number { return this.retainedBytes; }

  execute(nextCommand: EditorDocumentCommand): EditorDocument {
    const nextDocument = applyEditorDocumentPatch(this.currentDocument, nextCommand.forward);
    this.clearStack(this.redoStack);
    this.currentDocument = nextDocument;
    const bytes = commandBytes(nextCommand);
    if (bytes <= this.maxBytes && this.maxEntries > 0) {
      this.undoStack.push(nextCommand);
      this.retainedBytes += bytes;
      this.trim();
    } else {
      // An untracked command is a history boundary. Retaining older commands
      // would let Undo cross a state transition it cannot reverse safely.
      this.clearStack(this.undoStack);
    }
    return this.currentDocument;
  }

  undo(): EditorDocument | null {
    const previous = this.undoStack.at(-1);
    if (!previous) return null;
    const nextDocument = applyEditorDocumentPatch(this.currentDocument, previous.backward);
    this.undoStack.pop();
    this.currentDocument = nextDocument;
    this.redoStack.push(previous);
    return this.currentDocument;
  }

  redo(): EditorDocument | null {
    const next = this.redoStack.at(-1);
    if (!next) return null;
    const nextDocument = applyEditorDocumentPatch(this.currentDocument, next.forward);
    this.redoStack.pop();
    this.currentDocument = nextDocument;
    this.undoStack.push(next);
    return this.currentDocument;
  }

  clear(): void {
    this.clearStack(this.undoStack);
    this.clearStack(this.redoStack);
  }

  private clearStack(stack: EditorDocumentCommand[]): void {
    for (const entry of stack) this.retainedBytes -= commandBytes(entry);
    stack.length = 0;
    this.retainedBytes = Math.max(0, this.retainedBytes);
  }

  private trim(): void {
    while (this.undoStack.length > this.maxEntries || this.retainedBytes > this.maxBytes) {
      const removed = this.undoStack.shift();
      if (!removed) break;
      this.retainedBytes -= commandBytes(removed);
    }
  }
}
