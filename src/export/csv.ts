import type { Label, LabelPiece, Project } from "../types";
import { fontName } from "../model/fonts";
import { formatMm } from "../model/format";
import { labelsInGroupOrder, resolveLabel } from "../model/resolve";

const HEADERS = [
  "record",
  "group",
  "text",
  "width_mm",
  "height_mm",
  "height_from",
  "typeface",
  "typeface_from",
  "font_height_mm",
  "font_height_from",
  "lines",
  "line_font_mm",
  "line_align",
  "padding_mm",
  "align",
  "vertical",
  "radius_mm",
  "tracking_mm",
  "line_gap_mm",
  "sheet_mm",
  "plate_mm",
  "master_height_mm",
];

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function pieceLines(piece: LabelPiece): string {
  return piece.lines.map((line) => line.text).join(" | ");
}

function pieceFonts(piece: LabelPiece): string {
  return piece.lines.map((line) => (line.fontSize == null ? "" : formatMm(line.fontSize))).join(" | ");
}

function pieceAligns(piece: LabelPiece): string {
  return piece.lines.map((line) => line.align ?? "").join(" | ");
}

function acrossPieces(label: Label, pick: (piece: LabelPiece) => string): string {
  return label.pieces.map(pick).join(" // ");
}

/** Spreadsheet of the project. A blank line font or alignment follows the label or the group. */
export function projectToCsv(project: Project, custom: { id: string; name: string }[] = []): string {
  const rows: string[][] = [HEADERS];
  rows.push([
    "project",
    "",
    project.name,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    `${formatMm(project.sheet.width)} x ${formatMm(project.sheet.height)}`,
    `${formatMm(project.plate.width)} x ${formatMm(project.plate.height)}`,
    project.masterHeight == null ? "" : formatMm(project.masterHeight),
  ]);
  for (const group of project.groups) {
    rows.push([
      "group",
      group.name,
      "",
      "",
      group.masterHeight == null ? "" : formatMm(group.masterHeight),
      "",
      group.masterTypefaceId ? fontName(group.masterTypefaceId, custom) : "",
      "",
      group.masterFontSize == null ? "" : formatMm(group.masterFontSize),
      "",
      "",
      "",
      "",
      formatMm(group.padding),
      group.align,
      group.vAlign,
      formatMm(group.radius),
      formatMm(group.tracking),
      formatMm(group.lineGap),
      "",
      "",
      "",
    ]);
  }
  for (const label of labelsInGroupOrder(project)) {
    const resolved = resolveLabel(project, label);
    rows.push([
      "label",
      resolved.groupName,
      label.text,
      formatMm(label.width),
      formatMm(resolved.height),
      resolved.heightSource,
      fontName(resolved.typefaceId, custom),
      resolved.typefaceSource,
      formatMm(resolved.fontSize),
      resolved.fontSizeSource,
      acrossPieces(label, pieceLines),
      acrossPieces(label, pieceFonts),
      acrossPieces(label, pieceAligns),
      formatMm(resolved.padding),
      resolved.align,
      resolved.vAlign,
      formatMm(resolved.radius),
      formatMm(resolved.tracking),
      formatMm(resolved.lineGap),
      "",
      "",
      "",
    ]);
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
