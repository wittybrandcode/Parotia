import { describe, expect, it } from "vitest";
import { identityTransform, type EditorLayer } from "@ui/src/editor/EditorDocument";
import { snapLayerSelection } from "@ui/src/editor/EditorSnap";

function rectangle(id: string, x: number, y: number, width = 20, height = 10): EditorLayer {
  return { id, name: id, order: 0, kind: "rectangle", visible: true, locked: false, opacity: 1, transform: identityTransform(x, y), width, height, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 1 };
}

describe("EditorSnap", () => {
  it("snaps a selection to canvas edges and centers within the threshold", () => {
    const layer = rectangle("moving", 12, 12);
    expect(snapLayerSelection([layer], [], { width: 200, height: 100 }, -9, -10, 5)).toEqual({
      deltaX: -12, deltaY: -12,
      guides: [{ axis: "vertical", position: 0, source: "canvas" }, { axis: "horizontal", position: 0, source: "canvas" }],
    });
    const centered = snapLayerSelection([layer], [], { width: 200, height: 100 }, 77, 32, 5);
    expect(centered).toMatchObject({ deltaX: 78, deltaY: 33 });
    expect(centered.guides.map((guide) => guide.position)).toEqual([100, 50]);
  });

  it("snaps collective bounds to other visible layer edges and centers", () => {
    const moving = [rectangle("a", 0, 0), rectangle("b", 30, 0)];
    const stationary = [rectangle("target", 80, 40, 40, 20)];
    const result = snapLayerSelection(moving, stationary, { width: 500, height: 300 }, 28, 38, 4);
    expect(result).toMatchObject({ deltaX: 30, deltaY: 40 });
    expect(result.guides).toEqual([
      { axis: "vertical", position: 80, source: "layer" },
      { axis: "horizontal", position: 40, source: "layer" },
    ]);
  });

  it("keeps the raw delta when no candidate is close or snapping is disabled", () => {
    const layer = rectangle("moving", 13, 17);
    expect(snapLayerSelection([layer], [], { width: 200, height: 100 }, 20, 10, 3)).toEqual({ deltaX: 20, deltaY: 10, guides: [] });
    expect(snapLayerSelection([layer], [], { width: 200, height: 100 }, 2, 3, 0)).toEqual({ deltaX: 2, deltaY: 3, guides: [] });
    expect(snapLayerSelection([], [], { width: 200, height: 100 }, 2, 3, 5)).toEqual({ deltaX: 2, deltaY: 3, guides: [] });
  });
});
