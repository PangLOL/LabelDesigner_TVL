import { Path, type Font, type Glyph } from "opentype.js";
import type { LabelLayout } from "../types";
import { fontFor } from "./fonts";
import { roundedRectPath, transformPath } from "./format";
import type { ResolvedLabel, ResolvedPiece } from "./resolve";

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

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function drawPiece(
  font: Font,
  piece: ResolvedPiece,
  rect: Rect,
  label: ResolvedLabel,
  missing: Set<string>,
): { path: string; overflow: boolean; inkTop: number | null; inkBottom: number | null } {
  const lines = piece.lines.filter((line) => line.text.length > 0);
  const geoms = lines.map((line) => ({ line, geom: lineGeom(font, line.text, line.fontSize, label.tracking, missing) }));
  if (geoms.length === 0) return { path: "", overflow: false, inkTop: null, inkBottom: null };

  let overflow = false;
  for (const item of geoms) {
    if (item.geom.width > rect.width + 0.05) overflow = true;
  }

  const baselines: number[] = [];
  let cursor = 0;
  geoms.forEach((item, index) => {
    baselines.push(cursor);
    cursor += item.line.fontSize + (index < geoms.length - 1 ? label.lineGap : 0);
  });
  const blockTop = geoms[0]?.geom.top ?? 0;
  const last = geoms[geoms.length - 1];
  const blockBottom = (baselines[baselines.length - 1] ?? 0) + (last?.geom.bottom ?? 0);
  const blockHeight = blockBottom - blockTop;
  if (blockHeight > rect.height + 0.05) overflow = true;

  let shift = rect.y + (rect.height - blockHeight) / 2 - blockTop;
  if (label.vAlign === "top") shift = rect.y - blockTop;
  if (label.vAlign === "bottom") shift = rect.y + rect.height - blockBottom;

  let path = "";
  geoms.forEach((item, index) => {
    let x = rect.x + (rect.width - item.geom.width) / 2;
    if (item.line.align === "left") x = rect.x;
    if (item.line.align === "right") x = rect.x + rect.width - item.geom.width;
    path += `${transformPath(item.geom.path.toPathData(3), x, shift + baselines[index], 1)} `;
  });
  return { path: path.trim(), overflow, inkTop: shift + blockTop, inkBottom: shift + blockBottom };
}

function walkLayout(
  font: Font,
  layout: LabelLayout,
  rect: Rect,
  pieces: Map<string, ResolvedPiece>,
  label: ResolvedLabel,
  missing: Set<string>,
  into: { path: string[]; overflow: boolean; inkTop: number | null; inkBottom: number | null },
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  if (layout.kind === "piece") {
    const piece = pieces.get(layout.pieceId);
    if (!piece) return;
    const drawn = drawPiece(font, piece, rect, label, missing);
    if (drawn.path) into.path.push(drawn.path);
    if (drawn.overflow) into.overflow = true;
    if (drawn.inkTop != null) into.inkTop = into.inkTop == null ? drawn.inkTop : Math.min(into.inkTop, drawn.inkTop);
    if (drawn.inkBottom != null) into.inkBottom = into.inkBottom == null ? drawn.inkBottom : Math.max(into.inkBottom, drawn.inkBottom);
    return;
  }
  const total = layout.children.reduce((sum, child) => sum + child.share, 0) || 1;
  let cursor = layout.axis === "horizontal" ? rect.x : rect.y;
  for (const child of layout.children) {
    const share = child.share / total;
    const childRect =
      layout.axis === "horizontal"
        ? { x: cursor, y: rect.y, width: rect.width * share, height: rect.height }
        : { x: rect.x, y: cursor, width: rect.width, height: rect.height * share };
    if (layout.axis === "horizontal") cursor += childRect.width;
    else cursor += childRect.height;
    walkLayout(font, child.node, childRect, pieces, label, missing, into);
  }
}

export function buildLabelArt(font: Font, label: ResolvedLabel): LabelArt {
  const missing = new Set<string>();
  const pad = Math.min(label.padding, Math.min(label.width, label.height) / 2);
  const content: Rect = {
    x: pad,
    y: pad,
    width: Math.max(0, label.width - pad * 2),
    height: Math.max(0, label.height - pad * 2),
  };
  const into = { path: [] as string[], overflow: false, inkTop: null as number | null, inkBottom: null as number | null };
  const pieces = new Map((label.pieces ?? []).map((piece) => [piece.id, piece]));
  if (label.layout) walkLayout(font, label.layout, content, pieces, label, missing, into);
  return {
    textPath: into.path.join(" "),
    borderPath: roundedRectPath(label.width, label.height, label.radius),
    overflow: into.overflow,
    missing: [...missing],
    inkTop: into.inkTop,
    inkBottom: into.inkBottom,
  };
}

export function buildArtMap(
  labels: ResolvedLabel[],
  fonts: Map<string, Font>,
  skipFallback?: ReadonlySet<string>,
): Map<string, LabelArt> {
  const arts = new Map<string, LabelArt>();
  for (const label of labels) {
    const exact = fonts.get(label.typefaceId);
    const font = exact ?? (skipFallback?.has(label.typefaceId) ? undefined : fontFor(fonts, label.typefaceId));
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
