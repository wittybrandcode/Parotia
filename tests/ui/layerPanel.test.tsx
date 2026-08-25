import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorDocument, DEFAULT_EDITOR_TEXT_STYLE, type EditorDocument, type EditorLayer } from "@ui/src/editor/EditorDocument";
import { LayerPanel } from "@ui/src/editor/LayerPanel";

const rectangle: EditorLayer = {
  id: "rect-id", name: "Rectangle 1", order: 0, kind: "rectangle", visible: true, locked: false, opacity: 1,
  transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 }, width: 80, height: 60,
  cornerRadius: 0, fill: null, stroke: "#c1e899", strokeWidth: 3, strokeStyle: "solid",
};

const textLayer: EditorLayer = {
  id: "text-id", name: "Text 2", order: 1, kind: "text", visible: true, locked: false, opacity: 0.8,
  transform: { x: 30, y: 40, scaleX: 1, scaleY: 1, rotation: 0 }, ...DEFAULT_EDITOR_TEXT_STYLE, text: "Editable text",
  fontFamily: "Arial", fontSize: 24, fontWeight: 400, fontStyle: "normal", align: "left", fill: "#ffffff",
};

const arrowLayer: EditorLayer = {
  id: "arrow-id", name: "Arrow 3", order: 2, kind: "arrow", visible: true, locked: false, opacity: 1,
  transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0 }, points: [0, 0, 80, 40],
  stroke: "#ffffff", strokeWidth: 3, strokeStyle: "solid", pointerLength: 12, pointerWidth: 10,
  pointerAtBeginning: false, pointerAtEnding: true,
};

const stepLayer: EditorLayer = {
  id: "step-id", name: "Step 1", order: 3, kind: "step", visible: true, locked: false, opacity: 1,
  transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 }, number: 1, radius: 18,
  fill: "#c1e899", stroke: "#111111", strokeWidth: 2, strokeStyle: "solid", fontFamily: "Arial", fontSize: 16, textColor: "#111111",
};

function documentWithLayers(): EditorDocument {
  return { ...createEditorDocument({ source: "data:image/png;base64,AAAA", width: 200, height: 100, now: "2026-08-24T00:00:00.000Z" }), layers: [rectangle, textLayer] };
}

describe("LayerPanel", () => {
  afterEach(cleanup);

  it("shows ordered editable layers and exposes visibility, lock, order, duplicate and delete operations", () => {
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();
    const onMove = vi.fn();
    const onReorder = vi.fn();
    const onAddImage = vi.fn();
    render(<LayerPanel document={documentWithLayers()} selectedLayerIds={["rect-id"]} disabled={false}
      onSelect={onSelect} onUpdate={onUpdate} onDelete={onDelete} onDuplicate={onDuplicate} onMove={onMove} onReorder={onReorder}
      onGroup={vi.fn()} onUngroup={vi.fn()} onAlign={vi.fn()} onDistribute={vi.fn()} onCopy={vi.fn()} onPaste={vi.fn()} onAddImage={onAddImage} />);

    const list = screen.getByRole("listbox", { name: "Document layers" });
    expect(within(list).getAllByRole("option").map((row) => row.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Text 2"), expect.stringContaining("Rectangle 1")]));
    expect(screen.getByText("rect-id")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide Rectangle 1" }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "rect-id", visible: false }), "Hide Rectangle 1");
    fireEvent.click(screen.getByRole("button", { name: "Lock Rectangle 1" }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "rect-id", locked: true }), "Lock Rectangle 1");

    fireEvent.click(screen.getByRole("button", { name: "Move layer up" }));
    fireEvent.click(screen.getByRole("button", { name: "Duplicate layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Add image layer" }));
    fireEvent.keyDown(screen.getByRole("option", { name: /Rectangle 1/ }), { key: "ArrowUp", altKey: true });
    expect(onMove).toHaveBeenCalledWith("rect-id", 1);
    expect(onDuplicate).toHaveBeenCalledWith(["rect-id"]);
    expect(onDelete).toHaveBeenCalledWith(["rect-id"]);
    expect(onAddImage).toHaveBeenCalledTimes(1);
  });

  it("edits transforms, shape styles, text content and font properties", () => {
    const onUpdate = vi.fn();
    const props = {
      document: documentWithLayers(), disabled: false, onUpdate,
      onSelect: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onMove: vi.fn(), onReorder: vi.fn(),
      onGroup: vi.fn(), onUngroup: vi.fn(), onAlign: vi.fn(), onDistribute: vi.fn(), onCopy: vi.fn(), onPaste: vi.fn(), onAddImage: vi.fn(),
    };
    const { rerender } = render(<LayerPanel {...props} selectedLayerIds={["rect-id"]} />);

    fireEvent.change(screen.getByLabelText("Layer X"), { target: { value: "42" } });
    fireEvent.blur(screen.getByLabelText("Layer X"));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ transform: expect.objectContaining({ x: 42 }) }), "Transform Rectangle 1");

    fireEvent.click(screen.getByLabelText("Shape fill enabled"));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ fill: "#c1e899" }), "Change Rectangle 1 fill");
    fireEvent.change(screen.getByLabelText("Layer stroke width"), { target: { value: "8" } });
    fireEvent.blur(screen.getByLabelText("Layer stroke width"));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ strokeWidth: 8 }), "Change Rectangle 1 stroke width");

    rerender(<LayerPanel {...props} selectedLayerIds={["text-id"]} />);
    fireEvent.change(screen.getByLabelText("Layer text"), { target: { value: "Rewritten" } });
    fireEvent.blur(screen.getByLabelText("Layer text"));
    fireEvent.change(screen.getByLabelText("Layer font"), { target: { value: "Georgia" } });
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    fireEvent.change(screen.getByLabelText("Text color"), { target: { value: "#ff0000" } });
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ text: "Rewritten" }), "Edit Text 2 text");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ fontFamily: "Georgia" }), "Change Text 2 font");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ fontWeight: 700 }), "Change Text 2 weight");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ fill: "#ff0000" }), "Change Text 2 color");
  });

  it("edits multiline direction, text-box metrics, effects and reusable presets", () => {
    const onUpdate = vi.fn();
    render(<LayerPanel document={documentWithLayers()} selectedLayerIds={["text-id"]} disabled={false}
      onSelect={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onDuplicate={vi.fn()} onMove={vi.fn()} onReorder={vi.fn()}
      onGroup={vi.fn()} onUngroup={vi.fn()} onAlign={vi.fn()} onDistribute={vi.fn()} onCopy={vi.fn()} onPaste={vi.fn()} onAddImage={vi.fn()} />);

    const text = screen.getByRole("textbox", { name: "Layer text" });
    fireEvent.change(text, { target: { value: "سطر أول\nسطر ثان" } });
    fireEvent.keyDown(text, { key: "Enter", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox", { name: "Text direction" }), { target: { value: "rtl" } });
    fireEvent.change(screen.getByLabelText("Text line height"), { target: { value: "1.6" } });
    fireEvent.blur(screen.getByLabelText("Text line height"));
    fireEvent.change(screen.getByLabelText("Text box width"), { target: { value: "280" } });
    fireEvent.blur(screen.getByLabelText("Text box width"));
    fireEvent.click(screen.getByLabelText("Text background enabled"));
    fireEvent.change(screen.getByRole("combobox", { name: "Text preset" }), { target: { value: "quote" } });

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ text: "سطر أول\nسطر ثان" }), "Edit Text 2 text");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ direction: "rtl" }), "Change Text 2 direction");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ lineHeight: 1.6 }), "Change Text 2 lineHeight");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ width: 280 }), "Change Text 2 width");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ backgroundColor: "#000000" }), "Change Text 2 background");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ fontFamily: "Georgia", fontStyle: "italic" }), "Apply quote text preset");
  });

  it("loads local font family names only after the user requests browser permission", async () => {
    const queryLocalFonts = vi.fn().mockResolvedValue([{ family: "Noto Sans Arabic" }, { family: "Inter" }, { family: "Inter" }]);
    Object.defineProperty(window, "queryLocalFonts", { configurable: true, value: queryLocalFonts });
    const onUpdate = vi.fn();
    try {
      render(<LayerPanel document={documentWithLayers()} selectedLayerIds={["text-id"]} disabled={false}
        onSelect={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} onDuplicate={vi.fn()} onMove={vi.fn()} onReorder={vi.fn()}
        onGroup={vi.fn()} onUngroup={vi.fn()} onAlign={vi.fn()} onDistribute={vi.fn()} onCopy={vi.fn()} onPaste={vi.fn()} onAddImage={vi.fn()} />);

      expect(queryLocalFonts).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Load local fonts" }));
      await waitFor(() => expect(screen.getByText("2 families")).toBeInTheDocument());
      expect(queryLocalFonts).toHaveBeenCalledOnce();
      fireEvent.change(screen.getByRole("combobox", { name: "Layer font" }), { target: { value: "Noto Sans Arabic" } });
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ fontFamily: "Noto Sans Arabic" }), "Change Text 2 font");
    } finally {
      delete (window as Window & { queryLocalFonts?: unknown }).queryLocalFonts;
    }
  });

  it("edits advanced shape, arrow and step properties and exposes the style clipboard", () => {
    const onUpdate = vi.fn();
    const onCopyStyle = vi.fn();
    const onPasteStyle = vi.fn();
    const document = { ...documentWithLayers(), layers: [rectangle, textLayer, arrowLayer, stepLayer] };
    const props = {
      document, disabled: false, onUpdate, onCopyStyle, onPasteStyle, canPasteStyle: true,
      onSelect: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onMove: vi.fn(), onReorder: vi.fn(),
      onGroup: vi.fn(), onUngroup: vi.fn(), onAlign: vi.fn(), onDistribute: vi.fn(), onCopy: vi.fn(), onPaste: vi.fn(), onAddImage: vi.fn(),
    };
    const { rerender } = render(<LayerPanel {...props} selectedLayerIds={["arrow-id"]} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Layer stroke style" }), { target: { value: "dashed" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Arrow heads" }), { target: { value: "both" } });
    fireEvent.click(screen.getByRole("button", { name: "Reverse direction" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Shape preset" }), { target: { value: "alert" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy layer style" }));
    fireEvent.click(screen.getByRole("button", { name: "Paste layer style" }));

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ strokeStyle: "dashed" }), "Change Arrow 3 stroke style");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ pointerAtBeginning: true, pointerAtEnding: true }), "Change Arrow 3 heads");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ points: [80, 40, 0, 0] }), "Reverse Arrow 3");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ stroke: "#1a1a1a", strokeStyle: "dashed" }), "Apply alert shape preset");
    expect(onCopyStyle).toHaveBeenCalledWith("arrow-id");
    expect(onPasteStyle).toHaveBeenCalledWith(["arrow-id"]);

    rerender(<LayerPanel {...props} selectedLayerIds={["step-id"]} />);
    fireEvent.change(screen.getByLabelText("Step number"), { target: { value: "7" } });
    fireEvent.blur(screen.getByLabelText("Step number"));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ number: 7, name: "Step 7" }), "Renumber Step 1");
  });

  it("reorders layers once on drop and presents the insertion edge", () => {
    const onReorder = vi.fn();
    const onSelect = vi.fn();
    render(<LayerPanel document={documentWithLayers()} selectedLayerIds={[]} disabled={false}
      onSelect={onSelect} onUpdate={vi.fn()} onDelete={vi.fn()} onDuplicate={vi.fn()} onMove={vi.fn()}
      onReorder={onReorder} onGroup={vi.fn()} onUngroup={vi.fn()} onAlign={vi.fn()} onDistribute={vi.fn()} onCopy={vi.fn()} onPaste={vi.fn()} onAddImage={vi.fn()} />);
    const textRow = screen.getByRole("option", { name: /Text 2/ });
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "none", dropEffect: "none",
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? "",
    };

    fireEvent.dragStart(textRow, { dataTransfer });
    expect(onSelect).toHaveBeenCalledWith(["text-id"]);
    const rectangleRow = screen.getByRole("option", { name: /Rectangle 1/ });
    fireEvent.dragOver(rectangleRow, { dataTransfer });
    expect(rectangleRow).toHaveClass("nc-layer-drop-after");
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.drop(rectangleRow, { dataTransfer });
    expect(onReorder).toHaveBeenCalledOnce();
    expect(onReorder).toHaveBeenCalledWith(["text-id", "rect-id"]);
    expect(rectangleRow).not.toHaveClass("nc-layer-drop-after");
  });

  it("supports additive and range selection plus grouping and arrangement actions", () => {
    const onSelect = vi.fn();
    const onGroup = vi.fn();
    const onAlign = vi.fn();
    const props = {
      document: documentWithLayers(), selectedLayerIds: ["text-id", "rect-id"], disabled: false, onSelect,
      onUpdate: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onMove: vi.fn(), onReorder: vi.fn(),
      onGroup, onUngroup: vi.fn(), onAlign, onDistribute: vi.fn(), onCopy: vi.fn(), onPaste: vi.fn(), onAddImage: vi.fn(),
    };
    render(<LayerPanel {...props} />);
    expect(screen.getAllByRole("option").every((row) => row.getAttribute("aria-selected") === "true")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    fireEvent.click(screen.getByRole("button", { name: "Align left" }));
    expect(onGroup).toHaveBeenCalledOnce();
    expect(onAlign).toHaveBeenCalledWith("left");
    fireEvent.click(screen.getByRole("option", { name: /Text 2/ }), { ctrlKey: true });
    expect(onSelect).toHaveBeenCalledWith(["rect-id"]);
  });
});
