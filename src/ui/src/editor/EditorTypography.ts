import type { EditorTextLayer } from "./EditorDocument";

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
