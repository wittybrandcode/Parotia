import { describe, expect, it } from "vitest";
import { DEFAULT_EDITOR_TEXT_STYLE, identityTransform, type EditorTextLayer } from "@ui/src/editor/EditorDocument";
import { bakeTextTransform, convertTextMode, editorFontStack, estimateTextBox, justifiedLinePlacement, resolveTextDirection } from "@ui/src/editor/EditorTypography";
import { applyTextPreset } from "@ui/src/editor/EditorTextPresets";

function textLayer(overrides: Partial<EditorTextLayer> = {}): EditorTextLayer {
  return {
    id: "text", name: "Text", order: 0, visible: true, locked: false, opacity: 1,
    transform: identityTransform(), ...DEFAULT_EDITOR_TEXT_STYLE, kind: "text", text: "Hello", ...overrides,
  };
}

describe("EditorTypography", () => {
  it("justifies full lines and positions the final line left, center or right", () => {
    expect(justifiedLinePlacement(300, 240, 3, false, "right")).toEqual({ offsetX: 0, wordSpacing: 20 });
    expect(justifiedLinePlacement(300, 180, 2, true, "left")).toEqual({ offsetX: 0, wordSpacing: 0 });
    expect(justifiedLinePlacement(300, 180, 2, true, "center")).toEqual({ offsetX: 60, wordSpacing: 0 });
    expect(justifiedLinePlacement(300, 180, 2, true, "right")).toEqual({ offsetX: 120, wordSpacing: 0 });
    expect(justifiedLinePlacement(100, 120, 0, false, "left")).toEqual({ offsetX: 0, wordSpacing: 0 });
  });

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

  it("converts point and paragraph text without leaving invalid box geometry", () => {
    const point = textLayer();
    expect(convertTextMode(point, "point")).toBe(point);
    const paragraph = convertTextMode(point, "paragraph");
    expect(paragraph).toMatchObject({ textMode: "paragraph", width: expect.any(Number), height: expect.any(Number) });
    expect(convertTextMode({ ...paragraph, align: "justify" }, "point")).toMatchObject({ textMode: "point", align: "left" });
    expect(convertTextMode({ ...paragraph, align: "justify" }, "point")).not.toHaveProperty("width");
    expect(convertTextMode({ ...paragraph, align: "right" }, "point")).toMatchObject({ textMode: "point", align: "right" });
  });

  it("bakes point-text scaling into real typographic metrics", () => {
    const point = textLayer({ fontSize: 20, padding: 5, letterSpacing: 2 });
    const resized = bakeTextTransform(point, { x: 12, y: 18, scaleX: 1.5, scaleY: 2, rotation: 15 });
    expect(resized).toMatchObject({
      fontSize: 40, padding: 10, letterSpacing: 4,
      transform: { x: 12, y: 18, scaleX: 1, scaleY: 1, rotation: 15 },
    });
  });

  it("resizes only the paragraph container and preserves every font metric", () => {
    const paragraph = convertTextMode(textLayer({ fontSize: 20, padding: 5, letterSpacing: 2, shadowBlur: 3 }), "paragraph");
    const resized = bakeTextTransform(paragraph, { x: 12, y: 18, scaleX: 1.5, scaleY: 2, rotation: 15 });
    expect(resized).toMatchObject({
      width: paragraph.width! * 1.5, height: paragraph.height! * 2,
      fontSize: 20, padding: 5, letterSpacing: 2, shadowBlur: 3,
      transform: { x: 12, y: 18, scaleX: 1, scaleY: 1, rotation: 15 },
    });
    const clamped = bakeTextTransform(paragraph, { x: 0, y: 0, scaleX: 0, scaleY: 0, rotation: 0 });
    expect(clamped.width).toBeGreaterThan(0);
    expect(clamped.height).toBeGreaterThan(0);
  });
});
