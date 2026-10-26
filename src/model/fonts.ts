import type { Font } from "opentype.js";

export interface FontDefinition {
  id: string;
  name: string;
  family: string;
  weight: number;
  url: string;
}

const fontFile = (file: string) => `${import.meta.env.BASE_URL}fonts/${file}`;

export const BUILTIN_FONTS: FontDefinition[] = [
  { id: "inter", name: "Inter", family: "Inter", weight: 400, url: fontFile("inter-regular.woff") },
  { id: "inter-semibold", name: "Inter Semibold", family: "Inter", weight: 600, url: fontFile("inter-semibold.woff") },
  { id: "plex-sans", name: "IBM Plex Sans", family: "IBM Plex Sans", weight: 400, url: fontFile("plex-sans.woff") },
  { id: "plex-sans-medium", name: "IBM Plex Sans Medium", family: "IBM Plex Sans", weight: 500, url: fontFile("plex-sans-medium.woff") },
  { id: "plex-mono", name: "IBM Plex Mono", family: "IBM Plex Mono", weight: 400, url: fontFile("plex-mono.woff") },
  { id: "barlow-condensed", name: "Barlow Condensed", family: "Barlow Condensed", weight: 500, url: fontFile("barlow-condensed.woff") },
  { id: "space-grotesk", name: "Space Grotesk", family: "Space Grotesk", weight: 500, url: fontFile("space-grotesk.woff") },
  { id: "source-serif", name: "Source Serif 4", family: "Source Serif 4", weight: 400, url: fontFile("source-serif.woff") },
];

export const DIMENSION_FONT_ID = "plex-mono";
export const FALLBACK_FONT_ID = "inter";

export function fontFor(fonts: Map<string, Font>, id: string): Font | undefined {
  return fonts.get(id) ?? fonts.get(FALLBACK_FONT_ID);
}

export function fontName(id: string, custom: { id: string; name: string }[] = []): string {
  return BUILTIN_FONTS.find((font) => font.id === id)?.name ?? custom.find((font) => font.id === id)?.name ?? id;
}
