export const SAFE_FONT_FAMILIES = ["sans-serif", "Arial", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Courier New"] as const;

interface LocalFontData { family: string }
interface LocalFontWindow extends Window { queryLocalFonts?: () => Promise<LocalFontData[]> }

export function supportsLocalFontAccess(target: Window = window): boolean {
  return typeof (target as LocalFontWindow).queryLocalFonts === "function";
}

export async function queryLocalFontFamilies(target: Window = window): Promise<string[]> {
  const query = (target as LocalFontWindow).queryLocalFonts;
  if (!query) throw new Error("Local font access is not supported by this browser");
  const fonts = await query.call(target);
  return [...new Set(fonts.map((font) => font.family.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function isSafeFontFamily(fontFamily: string): boolean {
  return (SAFE_FONT_FAMILIES as readonly string[]).includes(fontFamily) || ["serif", "monospace"].includes(fontFamily);
}
