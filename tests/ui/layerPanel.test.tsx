import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorDocument, type EditorDocument, type EditorLayer } from "@ui/src/editor/EditorDocument";
import { LayerPanel } from "@ui/src/editor/LayerPanel";

const rectangle: EditorLayer = {
  id: "rect-id", name: "Rectangle 1", order: 0, kind: "rectangle", visible: true, locked: false, opacity: 1,
  transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 }, width: 80, height: 60,
  cornerRadius: 0, fill: null, stroke: "#c1e899", strokeWidth: 3,
};

const textLayer: EditorLayer = {
  id: "text-id", name: "Text 2", order: 1, kind: "text", visible: true, locked: false, opacity: 0.8,
  transform: { x: 30, y: 40, scaleX: 1, scaleY: 1, rotation: 0 }, text: "Editable text",
  fontFamily: "Arial", fontSize: 24, fontWeight: 400, fontStyle: "normal", align: "left", fill: "#ffffff",
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
    const onAddImage = vi.fn();
    render(<LayerPanel document={documentWithLayers()} selectedLayerId="rect-id" disabled={false}
      onSelect={onSelect} onUpdate={onUpdate} onDelete={onDelete} onDuplicate={onDuplicate} onMove={onMove} onAddImage={onAddImage} />);

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
    expect(onMove).toHaveBeenCalledWith("rect-id", 1);
    expect(onDuplicate).toHaveBeenCalledWith("rect-id");
    expect(onDelete).toHaveBeenCalledWith("rect-id");
    expect(onAddImage).toHaveBeenCalledTimes(1);
  });

  it("edits transforms, shape styles, text content and font properties", () => {
    const onUpdate = vi.fn();
    const props = {
      document: documentWithLayers(), disabled: false, onUpdate,
      onSelect: vi.fn(), onDelete: vi.fn(), onDuplicate: vi.fn(), onMove: vi.fn(), onAddImage: vi.fn(),
    };
    const { rerender } = render(<LayerPanel {...props} selectedLayerId="rect-id" />);

    fireEvent.change(screen.getByLabelText("Layer X"), { target: { value: "42" } });
    fireEvent.blur(screen.getByLabelText("Layer X"));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ transform: expect.objectContaining({ x: 42 }) }), "Transform Rectangle 1");

    fireEvent.click(screen.getByLabelText("Shape fill enabled"));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ fill: "#c1e899" }), "Change Rectangle 1 fill");
    fireEvent.change(screen.getByLabelText("Layer stroke width"), { target: { value: "8" } });
    fireEvent.blur(screen.getByLabelText("Layer stroke width"));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ strokeWidth: 8 }), "Change Rectangle 1 stroke width");

    rerender(<LayerPanel {...props} selectedLayerId="text-id" />);
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
});
