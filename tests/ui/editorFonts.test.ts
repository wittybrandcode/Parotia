import { describe, expect, it, vi } from "vitest";
import { isSafeFontFamily, localFontAccessAvailability, queryLocalFontFamilies, supportsLocalFontAccess } from "@ui/src/editor/EditorFonts";

describe("EditorFonts", () => {
  it("detects Local Font Access and returns normalized unique families", async () => {
    const target = {
      queryLocalFonts: vi.fn().mockResolvedValue([
        { family: " Noto Sans Arabic " }, { family: "Arial" }, { family: "Noto Sans Arabic" }, { family: "" },
      ]),
    } as unknown as Window;
    expect(supportsLocalFontAccess(target)).toBe(true);
    await expect(queryLocalFontFamilies(target)).resolves.toEqual(["Arial", "Noto Sans Arabic"]);
  });

  it("reports unsupported or rejected local access without hiding the cause", async () => {
    const unsupported = {} as Window;
    expect(supportsLocalFontAccess(unsupported)).toBe(false);
    await expect(queryLocalFontFamilies(unsupported)).rejects.toThrow(/not supported/i);
    const denied = { queryLocalFonts: vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError")) } as unknown as Window;
    await expect(queryLocalFontFamilies(denied)).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  it("does not invoke the browser API when Permissions Policy blocks local fonts", async () => {
    const queryLocalFonts = vi.fn();
    const blocked = {
      queryLocalFonts,
      document: { permissionsPolicy: { allowsFeature: vi.fn().mockReturnValue(false) } },
    } as unknown as Window;

    expect(localFontAccessAvailability(blocked)).toBe("policy-blocked");
    expect(supportsLocalFontAccess(blocked)).toBe(false);
    await expect(queryLocalFontFamilies(blocked)).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(queryLocalFonts).not.toHaveBeenCalled();
  });

  it("distinguishes deterministic safe families from fonts that require local verification", () => {
    expect(isSafeFontFamily("Arial")).toBe(true);
    expect(isSafeFontFamily("serif")).toBe(true);
    expect(isSafeFontFamily("Installed Family")).toBe(false);
  });
});
