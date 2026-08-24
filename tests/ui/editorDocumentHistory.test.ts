import { describe, expect, it } from "vitest";
import { createEditorDocument, identityTransform, type EditorLayer } from "@ui/src/editor/EditorDocument";
import {
  EditorDocumentHistory,
  addLayerCommand,
  applyEditorDocumentPatch,
  removeLayerCommand,
  reorderLayersCommand,
  replaceDocumentCommand,
  replaceLayerCommand,
} from "@ui/src/editor/EditorDocumentHistory";

function rectangle(id: string, order: number, width = 20): EditorLayer {
  return {
    id, name: id, order, kind: "rectangle", visible: true, locked: false, opacity: 1,
    transform: identityTransform(), width, height: 10, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 2,
  };
}

function base() {
  return createEditorDocument({ source: "data:image/png;base64,base", width: 100, height: 80, id: "doc", now: "2026-08-24" });
}

describe("EditorDocumentHistory", () => {
  it("executes and reverses add, edit, reorder, and remove commands", () => {
    const history = new EditorDocumentHistory(base());
    const first = rectangle("first", 0);
    const second = rectangle("second", 1);
    history.execute(addLayerCommand(first));
    history.execute(addLayerCommand(second));
    history.execute(replaceLayerCommand(first, rectangle("first", 0, 50)));
    history.execute(reorderLayersCommand(["first", "second"], ["second", "first"]));
    history.execute(removeLayerCommand(history.document, second.id));

    expect(history.document.layers.map((layer) => layer.id)).toEqual(["first"]);
    expect(history.undoLabel).toBe("Remove second");
    expect(history.undo()?.layers.map((layer) => layer.id)).toEqual(["second", "first"]);
    expect(history.undo()?.layers.map((layer) => layer.id)).toEqual(["first", "second"]);
    expect(history.undo()?.layers[0]).toMatchObject({ id: "first", width: 20 });
    expect(history.redo()?.layers[0]).toMatchObject({ id: "first", width: 50 });
    expect(history.redoLabel).toBe("Reorder layers");
  });

  it("replaces a raster document reversibly without flattening command history", () => {
    const before = base();
    const after = createEditorDocument({ source: "data:image/png;base64,cropped", width: 50, height: 40, id: before.id, now: "2026-08-24" });
    const history = new EditorDocumentHistory(before);
    history.execute(replaceDocumentCommand(before, after, "Crop image"));
    expect(history.document.canvas.width).toBe(50);
    expect(history.undo()?.canvas.width).toBe(100);
    expect(history.redo()?.background.source).toContain("cropped");
  });

  it("bounds entries and retained command memory", () => {
    const history = new EditorDocumentHistory(base(), 2, 10_000);
    history.execute(addLayerCommand(rectangle("one", 0)));
    history.execute(addLayerCommand(rectangle("two", 1)));
    history.execute(addLayerCommand(rectangle("three", 2)));
    expect(history.undo()?.layers.map((layer) => layer.id)).toEqual(["one", "two"]);
    expect(history.undo()?.layers.map((layer) => layer.id)).toEqual(["one"]);
    expect(history.undo()).toBeNull();

    const tiny = new EditorDocumentHistory(base(), 10, 2_000);
    tiny.execute(addLayerCommand(rectangle("earlier", 0)));
    expect(tiny.canUndo).toBe(true);
    const large = rectangle("large", 1);
    large.name = "x".repeat(2_000);
    tiny.execute(addLayerCommand(large));
    expect(tiny.canUndo).toBe(false);
    expect(tiny.memoryBytes).toBe(0);
    expect(tiny.document.layers).toHaveLength(2);
  });

  it("clears redo on a divergent command and clears retained memory explicitly", () => {
    const history = new EditorDocumentHistory(base());
    history.execute(addLayerCommand(rectangle("one", 0)));
    history.undo();
    history.execute(addLayerCommand(rectangle("two", 0)));
    expect(history.canRedo).toBe(false);
    expect(history.memoryBytes).toBeGreaterThan(0);
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.memoryBytes).toBe(0);
  });

  it("rejects invalid patches without changing the document", () => {
    const document = base();
    const entry = rectangle("same", 0);
    const withLayer = applyEditorDocumentPatch(document, { operation: "add-layer", layer: entry });
    expect(() => applyEditorDocumentPatch(withLayer, { operation: "add-layer", layer: entry })).toThrow(/already exists/);
    expect(() => applyEditorDocumentPatch(document, { operation: "remove-layer", layer: entry })).toThrow(/does not exist/);
    expect(() => applyEditorDocumentPatch(withLayer, { operation: "reorder-layers", before: ["same"], after: ["missing"] })).toThrow(/Unknown layer/);
    expect(document.layers).toHaveLength(0);
  });
});
