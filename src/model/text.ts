import { Path, type Font, type Glyph } from "opentype.js";
import { fontFor } from "./fonts";
import { roundedRectPath, transformPath } from "./format";
import type { ResolvedLabel } from "./resolve";

export interface LabelArt {
  textPath: string;
  borderPath: string;
  overflow: boolean;
  missing: string[];
  /** Ink bounds in label coordinates. Null when the label has no glyphs. */
  inkTop: number | null;
  inkBottom: number | null;
}

export function capHeightMm(font: Font, fontSize: number): number | null {
  const os2 = font.tables["os2"] as { sCapHeight?: number } | undefined;
  const cap = os2?.sCapHeight;
  if (!cap || !font.unitsPerEm) return null;
  return (cap / font.unitsPerEm) * fontSize;
}

interface LineGeom {
  width: number;
  path: Path;
  top: number;
  bottom: number;
}

function lineGeom(font: Font, text: string, fontSize: number, tracking: number, missing: Set<string>): LineGeom {
  const scale = fontSize / font.unitsPerEm;
  const path = new Path();
  let x = 0;
  let previous: Glyph | null = null;
  for (const ch of Array.from(text)) {
    if (ch === "\t") {
      x += fontSize;
      previous = null;
      continue;
    }
    if (ch.trim() && !font.hasChar(ch)) missing.add(ch);
    const glyph = font.charToGlyph(ch);
    if (previous) {
      x += (font.getKerningValue(previous, glyph) / font.unitsPerEm) * fontSize;
      x += tracking;
    }
    path.extend(glyph.getPath(x, 0, fontSize));
    x += (glyph.advanceWidth ?? 0) * scale;
    previous = glyph;
  }

  let top = (-font.ascender / font.unitsPerEm) * fontSize;
  let bottom = (-font.descender / font.unitsPerEm) * fontSize;
  if (path.commands.length > 0) {
    const bounds = path.getBoundingBox();
    if (Number.isFinite(bounds.y1) && Number.isFinite(bounds.y2)) {
      top = bounds.y1;
      bottom = bounds.y2;
    }
  }
  return { width: x, path, top, bottom };
}

export function buildLabelArt(font: Font, label: ResolvedLabel): LabelArt {
  const missing = new Set<string>();
  const lines = label.text.length ? label.text.split("\n") : [];
  const geoms = lines.map((line) => lineGeom(font, line, label.fontSize, label.tracking, missing));
  const pitch = label.fontSize + label.lineGap;
  const innerWidth = label.width - label.padding * 2;

  let overflow = false;
  for (const geom of geoms) {
    if (geom.width > innerWidth + 0.05) overflow = true;
  }

  let textPath = "";
  let inkTop: number | null = null;
  let inkBottom: number | null = null;

  if (geoms.length > 0) {
    const blockTop = geoms[0]?.top ?? 0;
    const last = geoms[geoms.length - 1];
    const blockBottom = (geoms.length - 1) * pitch + (last?.bottom ?? 0);
    const blockHeight = blockBottom - blockTop;
    if (blockHeight > label.height - label.padding * 2 + 0.05) overflow = true;

    let shift = (label.height - blockHeight) / 2 - blockTop;
    if (label.vAlign === "top") shift = label.padding - blockTop;
    if (label.vAlign === "bottom") shift = label.height - label.padding - blockBottom;

    geoms.forEach((geom, index) => {
      let x = (label.width - geom.width) / 2;
      if (label.align === "left") x = label.padding;
      if (label.align === "right") x = label.width - label.padding - geom.width;
      const baseline = shift + index * pitch;
      textPath += `${transformPath(geom.path.toPathData(3), x, baseline, 1)} `;
    });
    inkTop = shift + blockTop;
    inkBottom = shift + blockBottom;
  }

  return {
    textPath: textPath.trim(),
    borderPath: roundedRectPath(label.width, label.height, label.radius),
    overflow,
    missing: [...missing],
    inkTop,
    inkBottom,
  };
}

export function buildArtMap(labels: ResolvedLabel[], fonts: Map<string, Font>): Map<string, LabelArt> {
  const arts = new Map<string, LabelArt>();
  for (const label of labels) {
    const font = fontFor(fonts, label.typefaceId);
    if (!font) continue;
    arts.set(label.id, buildLabelArt(font, label));
  }
  return arts;
}

export function labelIssues(label: ResolvedLabel, art: LabelArt | undefined, oversized: boolean): string[] {
  const issues: string[] = [];
  if (!art) return issues;
  if (art.overflow) issues.push("Text does not fit inside the label.");
  if (art.missing.length) issues.push(`Missing glyphs: ${art.missing.join(" ")}`);
  if (label.fontSize < 1.5) issues.push("Font height is under 1.5 mm. A Snapmaker laser may not hold the strokes.");
  if (oversized) issues.push("Label is larger than the page.");
  return issues;
}

/** Draw a single line of dimension text. Returns a path in its own coordinate space, baseline at y=0. */
export function textPathAt(font: Font, text: string, x: number, baseline: number, fontSize: number): string {
  const geom = lineGeom(font, text, fontSize, 0, new Set());
  return transformPath(geom.path.toPathData(3), x, baseline, 1);
}

export function measureText(font: Font, text: string, fontSize: number): number {
  return lineGeom(font, text, fontSize, 0, new Set()).width;
}
