import type { Font } from "opentype.js";

export interface FontDefinition {
  id: string;
  name: string;
  family: string;
  weight: number;
  url: string;
  group: "Latin" | "Traditional Chinese";
  /** Large faces download when a label uses them, not with the first page. */
  defer?: boolean;
}

const fontFile = (file: string) => `${import.meta.env.BASE_URL}fonts/${file}`;

const cjk = (
  id: string,
  name: string,
  family: string,
  weight: number,
  file: string,
): FontDefinition => ({
  id,
  name,
  family,
  weight,
  url: fontFile(`cjk/${file}`),
  group: "Traditional Chinese",
  defer: true,
});

export const BUILTIN_FONTS: FontDefinition[] = [
  { id: "inter", name: "Inter", family: "Inter", weight: 400, url: fontFile("inter-regular.woff"), group: "Latin" },
  { id: "inter-semibold", name: "Inter Semibold", family: "Inter", weight: 600, url: fontFile("inter-semibold.woff"), group: "Latin" },
  { id: "plex-sans", name: "IBM Plex Sans", family: "IBM Plex Sans", weight: 400, url: fontFile("plex-sans.woff"), group: "Latin" },
  { id: "plex-sans-medium", name: "IBM Plex Sans Medium", family: "IBM Plex Sans", weight: 500, url: fontFile("plex-sans-medium.woff"), group: "Latin" },
  { id: "plex-mono", name: "IBM Plex Mono", family: "IBM Plex Mono", weight: 400, url: fontFile("plex-mono.woff"), group: "Latin" },
  { id: "barlow-condensed", name: "Barlow Condensed", family: "Barlow Condensed", weight: 500, url: fontFile("barlow-condensed.woff"), group: "Latin" },
  { id: "space-grotesk", name: "Space Grotesk", family: "Space Grotesk", weight: 500, url: fontFile("space-grotesk.woff"), group: "Latin" },
  { id: "source-serif", name: "Source Serif 4", family: "Source Serif 4", weight: 400, url: fontFile("source-serif.woff"), group: "Latin" },
  cjk("noto-sans-cjk-tc-thin", "Noto Sans CJK TC Thin", "Noto Sans CJK TC", 100, "NotoSansTC-Thin.otf"),
  cjk("noto-sans-cjk-tc-light", "Noto Sans CJK TC Light", "Noto Sans CJK TC", 300, "NotoSansTC-Light.otf"),
  cjk("noto-sans-cjk-tc-demilight", "Noto Sans CJK TC DemiLight", "Noto Sans CJK TC", 350, "NotoSansTC-DemiLight.otf"),
  cjk("noto-sans-cjk-tc-regular", "Noto Sans CJK TC Regular", "Noto Sans CJK TC", 400, "NotoSansTC-Regular.otf"),
  cjk("noto-sans-cjk-tc-medium", "Noto Sans CJK TC Medium", "Noto Sans CJK TC", 500, "NotoSansTC-Medium.otf"),
  cjk("noto-sans-cjk-tc-bold", "Noto Sans CJK TC Bold", "Noto Sans CJK TC", 700, "NotoSansTC-Bold.otf"),
  cjk("noto-sans-cjk-tc-black", "Noto Sans CJK TC Black", "Noto Sans CJK TC", 900, "NotoSansTC-Black.otf"),
  cjk("noto-serif-cjk-tc-regular", "Noto Serif CJK TC Regular", "Noto Serif CJK TC", 400, "NotoSerifTC-Regular.otf"),
  cjk("noto-serif-cjk-tc-bold", "Noto Serif CJK TC Bold", "Noto Serif CJK TC", 700, "NotoSerifTC-Bold.otf"),
  cjk("iansui", "Iansui 芫荽", "Iansui", 400, "Iansui-Regular.ttf"),
  cjk("jf-open-huninn", "jf open 粉圓", "jf open 粉圓", 400, "jf-openhuninn-2.1.ttf"),
];

export const FONT_GROUPS = ["Latin", "Traditional Chinese"] as const;

export const DIMENSION_FONT_ID = "plex-mono";
export const FALLBACK_FONT_ID = "inter";

export function fontFor(fonts: Map<string, Font>, id: string): Font | undefined {
  return fonts.get(id) ?? fonts.get(FALLBACK_FONT_ID);
}

export function fontName(id: string, custom: { id: string; name: string }[] = []): string {
  return BUILTIN_FONTS.find((font) => font.id === id)?.name ?? custom.find((font) => font.id === id)?.name ?? id;
}
