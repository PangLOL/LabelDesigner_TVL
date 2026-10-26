import type { Font } from "opentype.js";
import { LUBAN_UNITS_PER_MM, type OutlineMode, type SvgUnit } from "../types";
import { escapeXml, formatMm, formatNum, slug, transformPath } from "../model/format";
import type { LaidPage } from "../model/layout";
import type { ResolvedLabel } from "../model/resolve";
import type { LabelArt } from "../model/text";
import { measureText, textPathAt } from "../model/text";
import { groupSwatch } from "../palette";

export interface ArtMap {
  get(id: string): LabelArt | undefined;
}

function unitScale(unit: SvgUnit): number {
  return unit === "luban72" ? LUBAN_UNITS_PER_MM : 1;
}

function safeComment(value: string): string {
  return value.replace(/--/g, " ").replace(/[<>]/g, "").slice(0, 240);
}

export function svgDocument(widthMm: number, heightMm: number, unit: SvgUnit, body: string): string {
  const scale = unitScale(unit);
  const width = formatNum(widthMm * scale);
  const height = formatNum(heightMm * scale);
  const widthAttr = unit === "mm" ? `${width}mm` : `${width}px`;
  const heightAttr = unit === "mm" ? `${height}mm` : `${height}px`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" height="${heightAttr}" viewBox="0 0 ${width} ${height}" data-width-mm="${formatNum(widthMm)}" data-height-mm="${formatNum(heightMm)}">${body}</svg>`;
}

function dimensionPaths(label: ResolvedLabel, font: Font): { lines: string; text: string } {
  const yLine = label.height + 2.8;
  const xLine = label.width + 2.6;
  const widthLabel = formatMm(label.width);
  const heightLabel = formatMm(label.height);
  const widthLabelWidth = measureText(font, widthLabel, 2);
  const text = [
    textPathAt(font, widthLabel, label.width / 2 - widthLabelWidth / 2, yLine + 4.35, 2),
    textPathAt(font, heightLabel, xLine + 1.7, label.height / 2 + 0.7, 2),
  ].join(" ");
  const lines = [
    `M0 ${formatNum(yLine)}H${formatNum(label.width)}`,
    `M0 ${formatNum(yLine - 1.25)}V${formatNum(yLine + 1.25)}`,
    `M${formatNum(label.width)} ${formatNum(yLine - 1.25)}V${formatNum(yLine + 1.25)}`,
    `M${formatNum(xLine)} 0V${formatNum(label.height)}`,
    `M${formatNum(xLine - 1.25)} 0H${formatNum(xLine + 1.25)}`,
    `M${formatNum(xLine - 1.25)} ${formatNum(label.height)}H${formatNum(xLine + 1.25)}`,
  ].join("");
  return { lines, text };
}

function calibrationPaths(pageWidth: number, pageHeight: number, font: Font): { lines: string; text: string } | null {
  const available = pageWidth - 28;
  const length = available >= 100 ? 100 : available >= 50 ? 50 : 0;
  if (!length) return null;
  const x = (pageWidth - length) / 2;
  const y = pageHeight - 9;
  const caption = `${length} mm. Print at actual size.`;
  const captionWidth = measureText(font, caption, 2.3);
  return {
    lines: `M${formatNum(x)} ${formatNum(y)}H${formatNum(x + length)}M${formatNum(x)} ${formatNum(y - 1.5)}V${formatNum(y + 1.5)}M${formatNum(x + length)} ${formatNum(y - 1.5)}V${formatNum(y + 1.5)}`,
    text: textPathAt(font, caption, x + length / 2 - captionWidth / 2, y - 1.7, 2.3),
  };
}

function edge(art: LabelArt, x: number, y: number, scale: number, stroke: string, strokeWidth: number, vectorEffect: boolean): string {
  const d = transformPath(art.borderPath, x, y, scale);
  const effect = vectorEffect ? ` vector-effect="non-scaling-stroke"` : "";
  return `<path class="label-edge" d="${d}" fill="none" stroke="${stroke}" stroke-width="${formatNum(strokeWidth)}" stroke-linejoin="miter"${effect}/>`;
}

export function renderLabelSvg(label: ResolvedLabel, art: LabelArt, unit: SvgUnit, outline: boolean, outlineMode: OutlineMode): string {
  const scale = unitScale(unit);
  const stroke = outlineMode === "cut" ? "#ff0000" : "#000000";
  const parts = [
    `<!-- ${safeComment(`${label.text} · ${formatMm(label.width)} mm × ${formatMm(label.height)} mm · ${label.typefaceId} · font height ${formatMm(label.fontSize)} mm`)} -->`,
    `<path d="${transformPath(art.textPath, 0, 0, scale)}" fill="#000000" fill-rule="nonzero"/>`,
  ];
  if (outline) parts.push(edge(art, 0, 0, scale, stroke, (outlineMode === "cut" ? 0.08 : 0.15) * scale, false));
  return svgDocument(label.width, label.height, unit, parts.join(""));
}

export function renderPlateSvg(
  page: LaidPage,
  width: number,
  height: number,
  unit: SvgUnit,
  outline: boolean,
  outlineMode: OutlineMode,
  arts: ArtMap,
  options: { preview: boolean; selected?: ReadonlySet<string> },
): string {
  const scale = options.preview ? 1 : unitScale(unit);
  const unitForDoc: SvgUnit = options.preview ? "mm" : unit;
  const stroke = outlineMode === "cut" ? "#ff0000" : "#000000";
  const body: string[] = [
    `<!-- ${safeComment(`Build plate ${formatMm(width)} mm × ${formatMm(height)} mm. Black is lettering. ${outline ? (outlineMode === "cut" ? "Red is the cut outline." : "The outline is engraved with the lettering.") : "Outlines are off."}`)} -->`,
  ];
  if (options.preview) {
    body.push(`<rect x="0" y="0" width="${formatNum(width)}" height="${formatNum(height)}" fill="#fffcf7"/>`);
    body.push(`<rect x="0.4" y="0.4" width="${formatNum(width - 0.8)}" height="${formatNum(height - 0.8)}" fill="none" stroke="#c9c0b2" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
  }
  for (const placement of page.placements) {
    const art = arts.get(placement.label.id);
    if (!art) continue;
    const selected = options.selected?.has(placement.label.id) ?? false;
    const title = `${placement.label.text || "Empty"} — ${formatMm(placement.label.width)} × ${formatMm(placement.label.height)} mm`;
    body.push(`<g data-label-id="${escapeXml(placement.label.id)}"${selected ? ` class="is-selected"` : ""}>`);
    body.push(`<title>${escapeXml(title)}</title>`);
    if (options.preview) {
      body.push(
        `<rect class="hit" x="${formatNum(placement.x)}" y="${formatNum(placement.y)}" width="${formatNum(placement.label.width)}" height="${formatNum(placement.label.height)}" fill="transparent"/>`,
      );
    }
    body.push(`<path d="${transformPath(art.textPath, placement.x, placement.y, scale)}" fill="#000000" fill-rule="nonzero"/>`);
    if (outline) {
      const strokeWidth = options.preview ? 1 : (outlineMode === "cut" ? 0.08 : 0.15) * scale;
      body.push(edge(art, placement.x, placement.y, scale, options.preview && outlineMode === "cut" ? "#ff0000" : stroke, strokeWidth, options.preview));
    } else if (options.preview) {
      body.push(edge(art, placement.x, placement.y, scale, "#b7ad9c", 1, true));
    }
    if (selected) {
      body.push(
        `<rect class="selection" x="${formatNum(placement.x - 0.8)}" y="${formatNum(placement.y - 0.8)}" width="${formatNum(placement.label.width + 1.6)}" height="${formatNum(placement.label.height + 1.6)}" fill="none" stroke="#c4491d" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`,
      );
    }
    body.push("</g>");
  }
  return svgDocument(width, height, unitForDoc, body.join(""));
}

export function renderSheetSvg(
  page: LaidPage,
  width: number,
  height: number,
  arts: ArtMap,
  dimensionFont: Font | undefined,
  options: { preview: boolean; showDimensions: boolean; showCalibration: boolean; selected?: ReadonlySet<string> },
): string {
  const body: string[] = [];
  if (options.preview) {
    body.push(`<rect x="0" y="0" width="${formatNum(width)}" height="${formatNum(height)}" fill="#fffcf7"/>`);
  }
  for (const placement of page.placements) {
    const art = arts.get(placement.label.id);
    if (!art) continue;
    const label = placement.label;
    const selected = options.selected?.has(label.id) ?? false;
    const color = groupSwatch(label.groupIndex);
    body.push(`<g data-label-id="${escapeXml(label.id)}"${selected ? ` class="is-selected"` : ""}>`);
    body.push(`<title>${escapeXml(`${label.text || "Empty"} — ${formatMm(label.width)} × ${formatMm(label.height)} mm`)}</title>`);
    if (options.preview) {
      body.push(
        `<rect class="hit" x="${formatNum(placement.x)}" y="${formatNum(placement.y)}" width="${formatNum(label.width)}" height="${formatNum(label.height)}" fill="transparent"/>`,
      );
    }
    body.push(`<path d="${transformPath(art.textPath, placement.x, placement.y, 1)}" fill="#000000" fill-rule="nonzero"/>`);
    body.push(edge(art, placement.x, placement.y, 1, "#000000", options.preview ? 1 : 0.12, options.preview));
    if (options.showDimensions && dimensionFont) {
      const dims = dimensionPaths(label, dimensionFont);
      body.push(
        `<path d="${transformPath(dims.lines, placement.x, placement.y, 1)}" fill="none" stroke="${color}" stroke-width="${options.preview ? 1 : 0.12}"${options.preview ? ` vector-effect="non-scaling-stroke"` : ""} stroke-linecap="square"/>`,
      );
      body.push(`<path d="${transformPath(dims.text, placement.x, placement.y, 1)}" fill="${color}"/>`);
    }
    if (selected) {
      body.push(
        `<rect class="selection" x="${formatNum(placement.x - 0.7)}" y="${formatNum(placement.y - 0.7)}" width="${formatNum(label.width + 1.4)}" height="${formatNum(label.height + 1.4)}" fill="none" stroke="#c4491d" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`,
      );
    }
    body.push("</g>");
  }
  if (options.showCalibration && dimensionFont) {
    const bar = calibrationPaths(width, height, dimensionFont);
    if (bar) {
      body.push(`<path d="${bar.lines}" fill="none" stroke="#1b1914" stroke-width="${options.preview ? 1 : 0.18}"${options.preview ? ` vector-effect="non-scaling-stroke"` : ""}/>`);
      body.push(`<path d="${bar.text}" fill="#1b1914"/>`);
    }
  }
  return svgDocument(width, height, "mm", body.join(""));
}

export function withXml(svg: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
}

export function labelDownloadName(index: number, label: ResolvedLabel): string {
  return `${String(index + 1).padStart(2, "0")}-${slug(label.text || "empty")}-${formatMm(label.width)}x${formatMm(label.height)}mm.svg`;
}
