import type {
  EditorArrowLayer, EditorLayer, EditorStrokeStyle, EditorTextLayer,
} from "./EditorDocument";

export type EditorShapeLayer = Extract<EditorLayer, { kind: "rectangle" | "ellipse" | "line" | "arrow" | "callout" | "step" }>;
export type EditorStylableLayer = EditorShapeLayer | EditorTextLayer;

export interface EditorLayerStyle {
  version: 1;
  category: "shape" | "text";
  opacity: number;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: EditorStrokeStyle;
  fill?: string | null;
  cornerRadius?: number;
  pointerLength?: number;
  pointerWidth?: number;
  pointerAtBeginning?: boolean;
  pointerAtEnding?: boolean;
  fontFamily?: string;
  fontFallback?: EditorTextLayer["fontFallback"];
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: EditorTextLayer["fontStyle"];
  direction?: EditorTextLayer["direction"];
  align?: EditorTextLayer["align"];
  justifyLastLine?: EditorTextLayer["justifyLastLine"];
  verticalAlign?: EditorTextLayer["verticalAlign"];
  textColor?: string;
  lineHeight?: number;
  letterSpacing?: number;
  padding?: number;
  backgroundColor?: string | null;
  borderColor?: string | null;
  borderWidth?: number;
  shadowColor?: string | null;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export interface EditorShapePreset {
  id: "highlight" | "outline" | "editorial" | "alert";
  label: string;
  fill: string | null;
  stroke: string;
  strokeWidth: number;
  strokeStyle: EditorStrokeStyle;
  textColor: string;
}

export const EDITOR_SHAPE_PRESETS: readonly EditorShapePreset[] = [
  { id: "highlight", label: "Highlight", fill: "#c1e899", stroke: "#65834e", strokeWidth: 3, strokeStyle: "solid", textColor: "#111111" },
  { id: "outline", label: "Outline", fill: null, stroke: "#ff4d4f", strokeWidth: 4, strokeStyle: "solid", textColor: "#ff4d4f" },
  { id: "editorial", label: "Editorial", fill: "#111111", stroke: "#ffffff", strokeWidth: 2, strokeStyle: "solid", textColor: "#ffffff" },
  { id: "alert", label: "Alert", fill: "#ffd43b", stroke: "#1a1a1a", strokeWidth: 3, strokeStyle: "dashed", textColor: "#111111" },
] as const;

export function strokeDash(style: EditorStrokeStyle, width: number): number[] {
  if (style === "dashed") return [Math.max(4, width * 4), Math.max(2, width * 2)];
  if (style === "dotted") return [Math.max(1, width), Math.max(2, width * 2)];
  return [];
}

export function isStylableLayer(layer: EditorLayer): layer is EditorStylableLayer {
  return layer.kind !== "image" && layer.kind !== "group";
}

export function isShapeLayer(layer: EditorLayer): layer is EditorShapeLayer {
  return isStylableLayer(layer) && layer.kind !== "text";
}

export function copyEditorLayerStyle(layer: EditorLayer): EditorLayerStyle | null {
  if (!isStylableLayer(layer)) return null;
  if (layer.kind === "text") return {
    version: 1, category: "text", opacity: layer.opacity, fontFamily: layer.fontFamily, fontFallback: layer.fontFallback,
    fontSize: layer.fontSize, fontWeight: layer.fontWeight, fontStyle: layer.fontStyle, direction: layer.direction,
    align: layer.align, justifyLastLine: layer.justifyLastLine, verticalAlign: layer.verticalAlign, textColor: layer.fill, lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing, padding: layer.padding, backgroundColor: layer.backgroundColor,
    borderColor: layer.borderColor, borderWidth: layer.borderWidth, cornerRadius: layer.cornerRadius,
    shadowColor: layer.shadowColor, shadowBlur: layer.shadowBlur, shadowOffsetX: layer.shadowOffsetX, shadowOffsetY: layer.shadowOffsetY,
  };
  const style: EditorLayerStyle = {
    version: 1, category: "shape", opacity: layer.opacity, stroke: layer.stroke, strokeWidth: layer.strokeWidth, strokeStyle: layer.strokeStyle,
    ...("fill" in layer ? { fill: layer.fill } : {}),
    ...(layer.kind === "rectangle" || layer.kind === "callout" ? { cornerRadius: layer.cornerRadius } : {}),
    ...(layer.kind === "arrow" ? {
      pointerLength: layer.pointerLength, pointerWidth: layer.pointerWidth,
      pointerAtBeginning: layer.pointerAtBeginning, pointerAtEnding: layer.pointerAtEnding,
    } : {}),
    ...(layer.kind === "callout" || layer.kind === "step" ? {
      fontFamily: layer.fontFamily, fontSize: layer.fontSize, textColor: layer.textColor,
    } : {}),
  };
  return style;
}

export function canApplyEditorLayerStyle(layer: EditorLayer, style: EditorLayerStyle | null): boolean {
  if (!style || !isStylableLayer(layer)) return false;
  return (layer.kind === "text") === (style.category === "text");
}

export function applyEditorLayerStyle(layer: EditorLayer, style: EditorLayerStyle): EditorLayer {
  if (!canApplyEditorLayerStyle(layer, style)) return layer;
  if (layer.kind === "text") return {
    ...layer, opacity: style.opacity, fontFamily: style.fontFamily ?? layer.fontFamily,
    fontFallback: style.fontFallback ?? layer.fontFallback, fontSize: style.fontSize ?? layer.fontSize,
    fontWeight: style.fontWeight ?? layer.fontWeight, fontStyle: style.fontStyle ?? layer.fontStyle,
    direction: style.direction ?? layer.direction,
    align: layer.textMode === "point" && style.align === "justify" ? layer.align : style.align ?? layer.align,
    justifyLastLine: style.justifyLastLine ?? layer.justifyLastLine,
    verticalAlign: layer.textMode === "point" ? "top" : style.verticalAlign ?? layer.verticalAlign, fill: style.textColor ?? layer.fill,
    lineHeight: style.lineHeight ?? layer.lineHeight, letterSpacing: style.letterSpacing ?? layer.letterSpacing,
    padding: style.padding ?? layer.padding, backgroundColor: style.backgroundColor === undefined ? layer.backgroundColor : style.backgroundColor,
    borderColor: style.borderColor === undefined ? layer.borderColor : style.borderColor,
    borderWidth: style.borderWidth ?? layer.borderWidth, cornerRadius: style.cornerRadius ?? layer.cornerRadius,
    shadowColor: style.shadowColor === undefined ? layer.shadowColor : style.shadowColor,
    shadowBlur: style.shadowBlur ?? layer.shadowBlur, shadowOffsetX: style.shadowOffsetX ?? layer.shadowOffsetX,
    shadowOffsetY: style.shadowOffsetY ?? layer.shadowOffsetY,
  };
  if (!isShapeLayer(layer)) return layer;
  let next: EditorShapeLayer = {
    ...layer, opacity: style.opacity, stroke: style.stroke ?? layer.stroke,
    strokeWidth: style.strokeWidth ?? layer.strokeWidth, strokeStyle: style.strokeStyle ?? layer.strokeStyle,
  };
  if ("fill" in next && style.fill !== undefined) next = { ...next, fill: style.fill };
  if ((next.kind === "rectangle" || next.kind === "callout") && style.cornerRadius !== undefined) next = { ...next, cornerRadius: style.cornerRadius };
  if (next.kind === "arrow") next = {
    ...next, pointerLength: style.pointerLength ?? next.pointerLength, pointerWidth: style.pointerWidth ?? next.pointerWidth,
    pointerAtBeginning: style.pointerAtBeginning ?? next.pointerAtBeginning, pointerAtEnding: style.pointerAtEnding ?? next.pointerAtEnding,
  };
  if ((next.kind === "callout" || next.kind === "step")) next = {
    ...next, fontFamily: style.fontFamily ?? next.fontFamily, fontSize: style.fontSize ?? next.fontSize,
    textColor: style.textColor ?? next.textColor,
  };
  return next;
}

export function applyShapePreset(layer: EditorShapeLayer, presetId: EditorShapePreset["id"]): EditorShapeLayer {
  const preset = EDITOR_SHAPE_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return layer;
  let next: EditorShapeLayer = { ...layer, stroke: preset.stroke, strokeWidth: preset.strokeWidth, strokeStyle: preset.strokeStyle };
  if ("fill" in next) next = { ...next, fill: preset.fill };
  if (next.kind === "callout" || next.kind === "step") next = { ...next, textColor: preset.textColor };
  return next;
}

export function reverseArrow(layer: EditorArrowLayer): EditorArrowLayer {
  const pairs: number[][] = [];
  for (let index = 0; index < layer.points.length; index += 2) pairs.push([layer.points[index]!, layer.points[index + 1]!]);
  return { ...layer, points: pairs.reverse().flat() };
}

function visitSteps(layers: EditorLayer[], visitor: (layer: Extract<EditorLayer, { kind: "step" }>) => void): void {
  for (const layer of layers) {
    if (layer.kind === "step") visitor(layer);
    else if (layer.kind === "group") visitSteps(layer.children, visitor);
  }
}

export function nextStepNumber(layers: EditorLayer[]): number {
  let maximum = 0;
  visitSteps(layers, (layer) => { maximum = Math.max(maximum, layer.number); });
  return maximum + 1;
}

export function continueStepSequence(copies: EditorLayer[], existing: EditorLayer[]): EditorLayer[] {
  let number = nextStepNumber(existing);
  const renumber = (layer: EditorLayer): EditorLayer => {
    if (layer.kind === "step") {
      const next = number++;
      return { ...layer, number: next, name: `Step ${next}` };
    }
    return layer.kind === "group" ? { ...layer, children: layer.children.map(renumber) } : layer;
  };
  return copies.map(renumber);
}
