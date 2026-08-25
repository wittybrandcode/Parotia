import type { EditorTextLayer } from "./EditorDocument";

export interface EditorTextPreset {
  id: "headline" | "caption" | "quote" | "label";
  label: string;
  style: Partial<Pick<EditorTextLayer,
    "fontFamily" | "fontFallback" | "fontSize" | "fontWeight" | "fontStyle" | "fill" | "lineHeight" | "letterSpacing" | "padding"
    | "backgroundColor" | "borderColor" | "borderWidth" | "cornerRadius" | "shadowColor" | "shadowBlur" | "shadowOffsetX" | "shadowOffsetY"
  >>;
}

export const EDITOR_TEXT_PRESETS: readonly EditorTextPreset[] = [
  { id: "headline", label: "Headline", style: { fontFamily: "Arial", fontFallback: "sans-serif", fontSize: 42, fontWeight: 700, fill: "#ffffff", lineHeight: 1.05, letterSpacing: -0.5, padding: 4, backgroundColor: null, shadowColor: "#000000", shadowBlur: 3, shadowOffsetX: 1, shadowOffsetY: 2 } },
  { id: "caption", label: "Caption", style: { fontFamily: "Arial", fontFallback: "sans-serif", fontSize: 22, fontWeight: 600, fill: "#ffffff", lineHeight: 1.25, letterSpacing: 0, padding: 8, backgroundColor: "#000000", cornerRadius: 4 } },
  { id: "quote", label: "Quote", style: { fontFamily: "Georgia", fontFallback: "serif", fontSize: 30, fontWeight: 400, fontStyle: "italic", fill: "#222222", lineHeight: 1.4, letterSpacing: 0, padding: 14, backgroundColor: "#ffffff", borderColor: "#222222", borderWidth: 1, cornerRadius: 6 } },
  { id: "label", label: "Label", style: { fontFamily: "Tahoma", fontFallback: "sans-serif", fontSize: 18, fontWeight: 700, fill: "#111111", lineHeight: 1.1, letterSpacing: 0.5, padding: 7, backgroundColor: "#c1e899", cornerRadius: 5 } },
] as const;

export function applyTextPreset(layer: EditorTextLayer, presetId: EditorTextPreset["id"]): EditorTextLayer {
  const preset = EDITOR_TEXT_PRESETS.find((entry) => entry.id === presetId);
  return preset ? { ...layer, ...preset.style } : layer;
}
