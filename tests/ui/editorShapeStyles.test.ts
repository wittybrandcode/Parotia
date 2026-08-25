import { describe, expect, it } from "vitest";
import { DEFAULT_EDITOR_TEXT_STYLE, identityTransform, type EditorLayer } from "@ui/src/editor/EditorDocument";
import {
  applyEditorLayerStyle, applyShapePreset, canApplyEditorLayerStyle, continueStepSequence, copyEditorLayerStyle,
  nextStepNumber, reverseArrow, strokeDash,
} from "@ui/src/editor/EditorShapeStyles";

function rectangle(id = "rect"): Extract<EditorLayer, { kind: "rectangle" }> {
  return {
    id, name: id, order: 0, kind: "rectangle", visible: true, locked: false, opacity: 0.8, transform: identityTransform(),
    width: 100, height: 60, cornerRadius: 4, fill: "#ffffff", stroke: "#111111", strokeWidth: 2, strokeStyle: "solid",
  };
}

function arrow(): Extract<EditorLayer, { kind: "arrow" }> {
  return {
    id: "arrow", name: "Arrow", order: 0, kind: "arrow", visible: true, locked: false, opacity: 1, transform: identityTransform(),
    points: [0, 0, 10, 20, 30, 40], stroke: "#ff0000", strokeWidth: 3, strokeStyle: "dashed",
    pointerLength: 12, pointerWidth: 9, pointerAtBeginning: false, pointerAtEnding: true,
  };
}

function step(id: string, number: number): Extract<EditorLayer, { kind: "step" }> {
  return {
    id, name: `Step ${number}`, order: number - 1, kind: "step", visible: true, locked: false, opacity: 1, transform: identityTransform(),
    number, radius: 18, fill: "#c1e899", stroke: "#111111", strokeWidth: 2, strokeStyle: "solid",
    fontFamily: "Arial", fontSize: 16, textColor: "#111111",
  };
}

describe("EditorShapeStyles", () => {
  it("derives stable dash patterns from the persisted stroke style", () => {
    expect(strokeDash("solid", 3)).toEqual([]);
    expect(strokeDash("dashed", 3)).toEqual([12, 6]);
    expect(strokeDash("dotted", 3)).toEqual([3, 6]);
  });

  it("copies shape appearance without geometry and applies it across compatible shapes", () => {
    const style = copyEditorLayerStyle({ ...rectangle(), fill: null, cornerRadius: 12, stroke: "#00ff00", strokeStyle: "dotted" });
    expect(style).toMatchObject({ category: "shape", fill: null, cornerRadius: 12, stroke: "#00ff00", strokeStyle: "dotted" });
    const target = { ...rectangle("target"), width: 320, height: 180 };
    expect(canApplyEditorLayerStyle(target, style)).toBe(true);
    expect(applyEditorLayerStyle(target, style!)).toMatchObject({ id: "target", width: 320, height: 180, fill: null, cornerRadius: 12, stroke: "#00ff00", strokeStyle: "dotted" });
  });

  it("keeps text and shape style clipboards type-safe", () => {
    const text: EditorLayer = {
      id: "text", name: "Text", order: 0, kind: "text", visible: true, locked: false, opacity: 1,
      transform: identityTransform(), ...DEFAULT_EDITOR_TEXT_STYLE, text: "Keep content", fontFamily: "Georgia", fontSize: 30,
    };
    const style = copyEditorLayerStyle(text)!;
    expect(style.category).toBe("text");
    expect(canApplyEditorLayerStyle(rectangle(), style)).toBe(false);
    expect(applyEditorLayerStyle(rectangle(), style)).toEqual(rectangle());
    expect(applyEditorLayerStyle({ ...text, text: "Other", fontFamily: "Arial" }, style)).toMatchObject({ text: "Other", fontFamily: "Georgia" });
  });

  it("applies presets while preserving shape geometry", () => {
    expect(applyShapePreset(rectangle(), "alert")).toMatchObject({ width: 100, height: 60, fill: "#ffd43b", stroke: "#1a1a1a", strokeStyle: "dashed" });
    expect(applyShapePreset(arrow(), "outline")).toMatchObject({ points: [0, 0, 10, 20, 30, 40], stroke: "#ff4d4f", strokeWidth: 4 });
  });

  it("reverses arrow geometry without destroying its head configuration", () => {
    expect(reverseArrow(arrow())).toMatchObject({ points: [30, 40, 10, 20, 0, 0], pointerAtBeginning: false, pointerAtEnding: true });
  });

  it("continues step numbering recursively for duplicated groups", () => {
    const existing: EditorLayer[] = [step("one", 1), step("four", 4)];
    const group: EditorLayer = {
      id: "group", name: "Group", order: 0, kind: "group", visible: true, locked: false, opacity: 1,
      transform: identityTransform(), children: [step("copy-a", 1), step("copy-b", 2)],
    };
    expect(nextStepNumber(existing)).toBe(5);
    const continued = continueStepSequence([group], existing)[0]!;
    expect(continued.kind === "group" && continued.children.map((entry) => entry.kind === "step" ? entry.number : 0)).toEqual([5, 6]);
  });
});
