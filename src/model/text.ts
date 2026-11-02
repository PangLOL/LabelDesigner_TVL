import { Path, type Font, type Glyph, type PathCommand } from "opentype.js";
import { isDieCut, type LabelLayout } from "../types";
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
  /**
   * Die-cut stickers have no plate. Width and height are the lettering,
   * and the sheet, PDF, and cut file use these instead of the label box.
   */
  dieCut?: { width: number; height: number };
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

interface DieCutBlock {
  width: number;
  height: number;
  path: Path;
}

function shiftCommand(command: PathCommand, dx: number, dy: number): PathCommand {
  const next = { ...command } as PathCommand & { x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };
  if (next.x != null) next.x += dx;
  if (next.y != null) next.y += dy;
  if (next.x1 != null) next.x1 += dx;
  if (next.y1 != null) next.y1 += dy;
  if (next.x2 != null) next.x2 += dx;
  if (next.y2 != null) next.y2 += dy;
  return next;
}

function shiftPath(source: Path, dx: number, dy: number): Path {
  const path = new Path();
  for (const command of source.commands) path.commands.push(shiftCommand(command, dx, dy));
  return path;
}

function extendPath(target: Path, source: Path): void {
  for (const command of source.commands) target.commands.push({ ...command });
}

/** Empty die-cut still occupies the text height, with no rectangle to cut. */
function emptyDieCut(textHeight: number): DieCutBlock {
  const height = Math.max(1, textHeight);
  return { width: Math.max(1, height * 0.35), height, path: new Path() };
}

function tighten(path: Path, textHeight: number): DieCutBlock {
  if (path.commands.length === 0) return emptyDieCut(textHeight);
  const box = path.getBoundingBox();
  if (![box.x1, box.y1, box.x2, box.y2].every((value) => Number.isFinite(value))) return emptyDieCut(textHeight);
  const width = Math.max(0.2, box.x2 - box.x1);
  const height = Math.max(0.2, box.y2 - box.y1);
  return { width, height, path: shiftPath(path, -box.x1, -box.y1) };
}

function dieCutPiece(font: Font, piece: ResolvedPiece, label: ResolvedLabel, missing: Set<string>): DieCutBlock {
  const lines = piece.lines.filter((line) => line.text.length > 0);
  const geoms = lines.map((line) => ({ line, geom: lineGeom(font, line.text, line.fontSize, label.tracking, missing) }));
  const drawn = geoms.filter((item) => item.geom.path.commands.length > 0);
  const textHeight = Math.max(label.fontSize, ...piece.lines.map((line) => line.fontSize));
  if (drawn.length === 0) return emptyDieCut(textHeight);

  const width = Math.max(...drawn.map((item) => item.geom.width), 0.2);
  const baselines: number[] = [];
  let cursor = 0;
  drawn.forEach((item, index) => {
    baselines.push(cursor);
    cursor += item.line.fontSize + (index < drawn.length - 1 ? label.lineGap : 0);
  });
  const path = new Path();
  drawn.forEach((item, index) => {
    let x = (width - item.geom.width) / 2;
    if (item.line.align === "left") x = 0;
    if (item.line.align === "right") x = width - item.geom.width;
    extendPath(path, shiftPath(item.geom.path, x, baselines[index]));
  });
  return tighten(path, textHeight);
}

function dieCutNode(
  font: Font,
  layout: LabelLayout,
  pieces: Map<string, ResolvedPiece>,
  label: ResolvedLabel,
  missing: Set<string>,
): DieCutBlock {
  if (layout.kind === "piece") {
    const piece = pieces.get(layout.pieceId);
    return piece ? dieCutPiece(font, piece, label, missing) : emptyDieCut(label.fontSize);
  }
  const children = layout.children.map((child) => dieCutNode(font, child.node, pieces, label, missing));
  if (children.length === 0) return emptyDieCut(label.fontSize);
  const horizontal = layout.axis === "horizontal";
  const width = horizontal ? children.reduce((sum, child) => sum + child.width, 0) : Math.max(...children.map((child) => child.width));
  const height = horizontal ? Math.max(...children.map((child) => child.height)) : children.reduce((sum, child) => sum + child.height, 0);
  const path = new Path();
  let cursor = 0;
  for (const child of children) {
    const x = horizontal ? cursor : (width - child.width) / 2;
    const y = horizontal ? (height - child.height) / 2 : cursor;
    extendPath(path, shiftPath(child.path, x, y));
    cursor += horizontal ? child.width : child.height;
  }
  return tighten(path, label.fontSize);
}

function buildDieCutArt(font: Font, label: ResolvedLabel): LabelArt {
  const missing = new Set<string>();
  const pieces = new Map((label.pieces ?? []).map((piece) => [piece.id, piece]));
  const block = label.layout ? dieCutNode(font, label.layout, pieces, label, missing) : emptyDieCut(label.fontSize);
  const hasInk = block.path.commands.length > 0;
  return {
    textPath: hasInk ? block.path.toPathData(3) : "",
    borderPath: "",
    overflow: false,
    missing: [...missing],
    inkTop: hasInk ? 0 : null,
    inkBottom: hasInk ? block.height : null,
    dieCut: { width: block.width, height: block.height },
  };
}

/** Replace a die-cut label’s plate size with the measured lettering. */
export function applyDieCutSize(labels: ResolvedLabel[], arts: Map<string, LabelArt>): ResolvedLabel[] {
  return labels.map((label) => {
    const size = arts.get(label.id)?.dieCut;
    if (!isDieCut(label.product) || !size) return label;
    return { ...label, width: size.width, height: size.height };
  });
}

export function buildLabelArt(font: Font, label: ResolvedLabel): LabelArt {
  if (isDieCut(label.product)) return buildDieCutArt(font, label);
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
  if (art.overflow && !isDieCut(label.product)) issues.push("Text does not fit inside the label.");
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
