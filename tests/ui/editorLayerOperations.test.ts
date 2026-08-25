import { describe, expect, it } from "vitest";
import { identityTransform, type EditorLayer } from "@ui/src/editor/EditorDocument";
import { alignLayers, cloneLayers, distributeLayers, groupLayers, layerBounds, ungroupLayers } from "@ui/src/editor/EditorLayerOperations";

function rectangle(id: string, order: number, x: number, y: number, width = 20, height = 10): EditorLayer {
  return { id, name: id, order, kind: "rectangle", visible: true, locked: false, opacity: 1, transform: identityTransform(x, y), width, height, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 1 };
}

describe("EditorLayerOperations", () => {
  it("computes rotated bounds and aligns layers without altering their shape data", () => {
    const first = rectangle("first", 0, 10, 20);
    const second = { ...rectangle("second", 1, 80, 40), transform: { x: 80, y: 40, scaleX: 1, scaleY: 1, rotation: 90 } };
    expect(layerBounds(second)).toMatchObject({ left: 70, top: 40, right: 80, bottom: 60 });
    const aligned = alignLayers([first, second], "left");
    expect(aligned.map((layer) => layerBounds(layer).left)).toEqual([10, 10]);
    expect(aligned[1]).toMatchObject({ kind: "rectangle", width: 20, height: 10 });
  });

  it("distributes three layers by their centers while preserving the endpoints", () => {
    const layers = [rectangle("a", 0, 0, 0), rectangle("b", 1, 80, 0), rectangle("c", 2, 100, 0)];
    const distributed = distributeLayers(layers, "horizontal");
    expect(distributed.map((layer) => layerBounds(layer).centerX)).toEqual([10, 60, 110]);
  });

  it("groups and ungroups selected layers while preserving their world transforms", () => {
    const layers = [rectangle("a", 0, 10, 20), rectangle("b", 1, 40, 50), rectangle("c", 2, 70, 80)];
    const grouped = groupLayers(layers, ["a", "b"]);
    expect(grouped.layers).toHaveLength(2);
    expect(grouped.group.children.map((layer) => layer.id)).toEqual(["a", "b"]);
    const moved = { ...grouped.group, transform: { x: 5, y: 7, scaleX: 1, scaleY: 1, rotation: 0 } };
    const restored = ungroupLayers([moved, layers[2]!], [moved.id]);
    expect(restored.selection).toEqual(["a", "b"]);
    expect(restored.layers[0]?.transform).toMatchObject({ x: 15, y: 27 });
    expect(restored.layers[1]?.transform).toMatchObject({ x: 45, y: 57 });
  });

  it("deep-clones group identifiers and offsets only the top-level transform", () => {
    const group = groupLayers([rectangle("a", 0, 1, 2), rectangle("b", 1, 3, 4)], ["a", "b"]).group;
    const copy = cloneLayers([group])[0]!;
    expect(copy.id).not.toBe(group.id);
    expect(copy.transform).toMatchObject({ x: 16, y: 16 });
    expect(copy.kind).toBe("group");
    if (copy.kind === "group") {
      expect(copy.children.map((layer) => layer.id)).not.toEqual(["a", "b"]);
      expect(copy.children[0]?.transform).toMatchObject({ x: 1, y: 2 });
    }
  });
});
