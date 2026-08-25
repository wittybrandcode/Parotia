export const SAFE_FONT_FAMILIES = ["sans-serif", "Arial", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Courier New"] as const;

interface LocalFontData { family: string }
interface LocalFontWindow extends Window { queryLocalFonts?: () => Promise<LocalFontData[]> }
interface LocalFontPolicy { allowsFeature(feature: string): boolean }
interface LocalFontDocument extends Document {
  permissionsPolicy?: LocalFontPolicy;
  featurePolicy?: LocalFontPolicy;
}

export type LocalFontAccessAvailability = "available" | "unsupported" | "policy-blocked";

export function localFontAccessAvailability(target: Window = window): LocalFontAccessAvailability {
  if (typeof (target as LocalFontWindow).queryLocalFonts !== "function") return "unsupported";

  const document = target.document as LocalFontDocument | undefined;
  const policy = document?.permissionsPolicy ?? document?.featurePolicy;
  if (policy && !policy.allowsFeature("local-fonts")) return "policy-blocked";
  return "available";
}

export function supportsLocalFontAccess(target: Window = window): boolean {
  return localFontAccessAvailability(target) === "available";
}

export async function queryLocalFontFamilies(target: Window = window): Promise<string[]> {
  const availability = localFontAccessAvailability(target);
  if (availability === "policy-blocked") {
    throw new DOMException("Local font access is blocked by this page's Permissions Policy", "NotAllowedError");
  }
  const query = (target as LocalFontWindow).queryLocalFonts;
  if (!query) throw new Error("Local font access is not supported by this browser");
  const fonts = await query.call(target);
  return [...new Set(fonts.map((font) => font.family.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function isSafeFontFamily(fontFamily: string): boolean {
  return (SAFE_FONT_FAMILIES as readonly string[]).includes(fontFamily) || ["serif", "monospace"].includes(fontFamily);
}
