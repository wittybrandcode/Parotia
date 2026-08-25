import { describe, expect, it } from "vitest";
import {
  createEditorDocument,
  createLayerBase,
  identityTransform,
  parseEditorDocument,
  serializeEditorDocument,
  type EditorDocument,
  type EditorLayer,
} from "@ui/src/editor/EditorDocument";

function layers(): EditorLayer[] {
  const common = (id: string, order: number) => ({
    id, name: id, order, visible: true, locked: false, opacity: 1, transform: identityTransform(order * 10, order * 5),
  });
  return [
    { ...common("image", 0), kind: "image", source: "data:image/png;base64,a", width: 20, height: 10 },
    { ...common("text", 1), kind: "text", text: "مرحبا", fontFamily: "Arial", fontSize: 24, fontWeight: 400, fontStyle: "normal", align: "right", fill: "#fff" },
    { ...common("rectangle", 2), kind: "rectangle", width: 40, height: 30, cornerRadius: 2, fill: null, stroke: "#f00", strokeWidth: 3 },
    { ...common("ellipse", 3), kind: "ellipse", radiusX: 20, radiusY: 10, fill: "#000", stroke: "#fff", strokeWidth: 2 },
    { ...common("line", 4), kind: "line", points: [0, 0, 10, 10], stroke: "#fff", strokeWidth: 2, tension: 0.5 },
    { ...common("arrow", 5), kind: "arrow", points: [0, 0, 30, 20], stroke: "#fff", strokeWidth: 4, pointerLength: 12, pointerWidth: 8 },
    { ...common("callout", 6), kind: "callout", text: "Note", width: 100, height: 60, fontFamily: "Arial", fontSize: 16, textColor: "#111", fill: "#fff", stroke: "#000", strokeWidth: 1 },
  ];
}

function documentWithLayers(): EditorDocument {
  return { ...createEditorDocument({ source: "data:image/png;base64,base", width: 800, height: 600, id: "doc", now: "2026-08-24T00:00:00.000Z" }), layers: layers() };
}

describe("EditorDocument", () => {
  it("creates and round-trips a versioned document with every stable layer kind", () => {
    const document = documentWithLayers();
    const restored = parseEditorDocument(serializeEditorDocument(document));
    expect(restored).toEqual(document);
    expect(restored.schema).toBe("parotia.editor-document");
    expect(restored.version).toBe(2);
    expect(restored.layers.map((layer) => layer.kind)).toEqual(["image", "text", "rectangle", "ellipse", "line", "arrow", "callout"]);
  });

  it("normalizes layer order and returns detached serialized data", () => {
    const document = documentWithLayers();
    document.layers.reverse();
    const restored = parseEditorDocument(document);
    expect(restored.layers.map((layer) => layer.id)).toEqual(["image", "text", "rectangle", "ellipse", "line", "arrow", "callout"]);
    restored.layers[0]!.name = "Changed";
    expect(document.layers.find((layer) => layer.id === "image")?.name).toBe("image");
  });

  it("migrates the documented version-zero shape", () => {
    const migrated = parseEditorDocument({
      schema: "parotia.editor-document", version: 0, id: "legacy", width: 320, height: 200,
      backgroundDataUrl: "data:image/png;base64,legacy", createdAt: "2026-01-01", updatedAt: "2026-01-02", layers: [],
    });
    expect(migrated).toMatchObject({
      version: 2, id: "legacy", canvas: { width: 320, height: 200 },
      background: { source: "data:image/png;base64,legacy", width: 320, height: 200 },
    });
  });

  it("migrates version one and round-trips recursively grouped layers", () => {
    const legacy = { ...documentWithLayers(), version: 1 };
    const migrated = parseEditorDocument(legacy);
    const grouped: EditorLayer = {
      ...createLayerBase("group", 0), kind: "group", name: "Two shapes", children: migrated.layers.slice(0, 2).map((layer, order) => ({ ...layer, order })),
    };
    const restored = parseEditorDocument({ ...migrated, layers: [grouped] });
    expect(restored.version).toBe(2);
    expect(restored.layers[0]).toMatchObject({ kind: "group", name: "Two shapes" });
    expect(restored.layers[0]?.kind === "group" && restored.layers[0].children.map((layer) => layer.id)).toEqual(["image", "text"]);
  });

  it("rejects duplicate identifiers nested inside groups", () => {
    const child = layers()[0]!;
    const group: EditorLayer = { ...createLayerBase("group", 0), kind: "group", children: [{ ...child, order: 0 }, { ...child, order: 1 }] };
    expect(() => parseEditorDocument({ ...createEditorDocument({ source: "data:image/png;base64,a", width: 10, height: 10 }), layers: [group] })).toThrow(/unique/);
  });

  it("rejects group transforms that cannot be losslessly ungrouped", () => {
    const child = { ...layers()[0]!, order: 0 };
    const group: EditorLayer = { ...createLayerBase("group", 0), kind: "group", transform: { x: 0, y: 0, scaleX: 2, scaleY: 1, rotation: 0 }, children: [child] };
    expect(() => parseEditorDocument({ ...createEditorDocument({ source: "data:image/png;base64,a", width: 10, height: 10 }), layers: [group] })).toThrow(/uniform scale/);
  });

  it.each([
    ["invalid JSON", "{"],
    ["future version", { schema: "parotia.editor-document", version: 99 }],
    ["duplicate identifiers", { ...documentWithLayers(), layers: [layers()[0], layers()[0]] }],
    ["invalid opacity", { ...documentWithLayers(), layers: [{ ...layers()[0], opacity: 2 }] }],
    ["invalid points", { ...documentWithLayers(), layers: [{ ...layers()[4], points: [0, 1, 2] }] }],
  ])("rejects %s", (_name, value) => {
    expect(() => parseEditorDocument(value)).toThrow();
  });

  it("creates reusable identity metadata for a new layer", () => {
    const base = createLayerBase("rectangle", 2, 12, 34);
    expect(base.id).toMatch(/^editor-layer-/);
    expect(base).toMatchObject({ name: "Rectangle 3", order: 2, visible: true, locked: false, opacity: 1, transform: { x: 12, y: 34, scaleX: 1, scaleY: 1, rotation: 0 } });
  });
});
