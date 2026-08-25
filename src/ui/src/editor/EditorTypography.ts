import type { EditorTextLayer, EditorTransform } from "./EditorDocument";

const RTL_CHARACTER = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/u;
const LTR_CHARACTER = /[A-Za-z\u00c0-\u02af\u0370-\u058f]/u;

export function resolveTextDirection(text: string, direction: EditorTextLayer["direction"]): "ltr" | "rtl" {
  if (direction !== "auto") return direction;
  for (const character of text) {
    if (RTL_CHARACTER.test(character)) return "rtl";
    if (LTR_CHARACTER.test(character)) return "ltr";
  }
  return "ltr";
}

export function editorFontStack(fontFamily: string, fallback: EditorTextLayer["fontFallback"]): string {
  if (fontFamily === fallback) return fallback;
  const escaped = fontFamily.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}", ${fallback}`;
}

export function estimateTextBox(layer: EditorTextLayer): { width: number; height: number } {
  const lines = layer.text.split("\n");
  const widest = Math.max(1, ...lines.map((line) => [...line].length));
  const naturalWidth = widest * Math.max(1, layer.fontSize * 0.62 + layer.letterSpacing) + layer.padding * 2;
  const naturalHeight = Math.max(1, lines.length) * layer.fontSize * layer.lineHeight + layer.padding * 2;
  return { width: layer.width ?? naturalWidth, height: layer.height ?? naturalHeight };
}

export function convertTextMode(layer: EditorTextLayer, textMode: EditorTextLayer["textMode"]): EditorTextLayer {
  if (layer.textMode === textMode) return layer;
  if (textMode === "point") {
    const point: EditorTextLayer = { ...layer, textMode, verticalAlign: "top", align: layer.align === "justify" ? "left" : layer.align };
    delete point.width;
    delete point.height;
    return point;
  }
  const natural = estimateTextBox(layer);
  return {
    ...layer,
    textMode,
    width: Math.max(240, natural.width),
    height: Math.max(layer.fontSize * layer.lineHeight * 3 + layer.padding * 2, natural.height),
  };
}

function scaled(value: number, factor: number): number {
  return Math.max(0, value * factor);
}

/**
 * Converts a visual Transformer scale into real typographic geometry. Text
 * layers therefore return to a 1:1 transform after every resize and can never
 * retain independent horizontal/vertical glyph scaling.
 */
export function bakeTextTransform(layer: EditorTextLayer, transform: EditorTransform): EditorTextLayer {
  const factor = Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY), Number.EPSILON);
  return {
    ...layer,
    fontSize: scaled(layer.fontSize, factor),
    letterSpacing: layer.letterSpacing * factor,
    padding: scaled(layer.padding, factor),
    borderWidth: scaled(layer.borderWidth, factor),
    cornerRadius: scaled(layer.cornerRadius, factor),
    shadowBlur: scaled(layer.shadowBlur, factor),
    shadowOffsetX: layer.shadowOffsetX * factor,
    shadowOffsetY: layer.shadowOffsetY * factor,
    ...(layer.textMode === "paragraph" ? {
      width: scaled(layer.width!, factor),
      height: scaled(layer.height!, factor),
    } : {}),
    transform: { x: transform.x, y: transform.y, scaleX: 1, scaleY: 1, rotation: transform.rotation },
  };
}
