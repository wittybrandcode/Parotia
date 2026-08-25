import { describe, expect, it } from "vitest";
import { DEFAULT_EDITOR_TEXT_STYLE, identityTransform, type EditorTextLayer } from "@ui/src/editor/EditorDocument";
import { editorFontStack, estimateTextBox, resolveTextDirection } from "@ui/src/editor/EditorTypography";
import { applyTextPreset } from "@ui/src/editor/EditorTextPresets";

function textLayer(overrides: Partial<EditorTextLayer> = {}): EditorTextLayer {
  return {
    id: "text", name: "Text", order: 0, visible: true, locked: false, opacity: 1,
    transform: identityTransform(), ...DEFAULT_EDITOR_TEXT_STYLE, kind: "text", text: "Hello", ...overrides,
  };
}

describe("EditorTypography", () => {
  it("resolves automatic direction from the first strong character", () => {
    expect(resolveTextDirection("123 — مرحبا بالعالم", "auto")).toBe("rtl");
    expect(resolveTextDirection("123 — Hello world", "auto")).toBe("ltr");
    expect(resolveTextDirection("مرحبا English", "ltr")).toBe("ltr");
    expect(resolveTextDirection("123 !", "auto")).toBe("ltr");
  });

  it("builds an escaped font stack with an explicit fallback", () => {
    expect(editorFontStack("Noto Sans Arabic", "sans-serif")).toBe('"Noto Sans Arabic", sans-serif');
    expect(editorFontStack('Family "One"', "serif")).toBe('"Family \\"One\\"", serif');
    expect(editorFontStack("monospace", "monospace")).toBe("monospace");
  });

  it("estimates multiline bounds and honors explicit text-box dimensions", () => {
    const natural = estimateTextBox(textLayer({ text: "one\nlonger", fontSize: 20, lineHeight: 1.5, letterSpacing: 1, padding: 6 }));
    expect(natural.width).toBeGreaterThan(80);
    expect(natural.height).toBe(72);
    expect(estimateTextBox(textLayer({ width: 240, height: 100 }))).toEqual({ width: 240, height: 100 });
  });

  it("applies reusable presets without replacing layer identity or content", () => {
    const original = textLayer({ text: "Keep me" });
    const preset = applyTextPreset(original, "quote");
    expect(preset).toMatchObject({ id: "text", text: "Keep me", fontFamily: "Georgia", fontFallback: "serif", fontStyle: "italic" });
    expect(applyTextPreset(original, "missing" as "headline")).toBe(original);
  });
});
