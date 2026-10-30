import type { Align, Group, Label, LabelLayout, LabelLine, LabelPiece, MachinePreset, OutlineMode, PaperPreset, Project, VAlign } from "../types";
import { MACHINES, PAPER, labelProductId, labelProductName } from "../types";
import { formatMm } from "../model/format";
import { BUILTIN_FONTS, FALLBACK_FONT_ID, fontName } from "../model/fonts";
import { createId } from "../model/id";
import { sanitizeProject } from "../model/project";
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
  "layout",
  "sheet_margin_mm",
  "sheet_gap_mm",
  "sheet_dimensions",
  "sheet_calibration",
  "plate_margin_mm",
  "plate_gap_mm",
  "plate_outline",
  "plate_outline_mode",
  "description",
  "label_product",
];

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function record(fields: Record<string, string | number>): string[] {
  return HEADERS.map((header) => {
    const value = fields[header];
    return value == null ? "" : String(value);
  });
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

function formatShare(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function serializeLayout(layout: LabelLayout, index: Map<string, number>): string {
  if (layout.kind === "piece") return `p${index.get(layout.pieceId) ?? 0}`;
  const body = layout.children
    .map((child) => `${formatShare(child.share)}:${formatShare(child.cross)}:${serializeLayout(child.node, index)}`)
    .join(",");
  return `${layout.axis === "horizontal" ? "H" : "V"}(${body})`;
}

function layoutCell(label: Label): string {
  const index = new Map(label.pieces.map((piece, pieceIndex) => [piece.id, pieceIndex]));
  return serializeLayout(label.layout, index);
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

/** Spreadsheet of the project. A blank line font or alignment follows the label or the group. */
export function projectToCsv(project: Project, custom: { id: string; name: string }[] = []): string {
  const rows: string[][] = [HEADERS];
  rows.push(
    record({
      record: "project",
      text: project.name,
      sheet_mm: `${formatMm(project.sheet.width)} x ${formatMm(project.sheet.height)}`,
      plate_mm: `${formatMm(project.plate.width)} x ${formatMm(project.plate.height)}`,
      master_height_mm: project.masterHeight == null ? "" : formatMm(project.masterHeight),
      sheet_margin_mm: formatMm(project.sheet.margin),
      sheet_gap_mm: formatMm(project.sheet.gap),
      sheet_dimensions: yesNo(project.sheet.showDimensions),
      sheet_calibration: yesNo(project.sheet.showCalibration),
      plate_margin_mm: formatMm(project.plate.margin),
      plate_gap_mm: formatMm(project.plate.gap),
      plate_outline: yesNo(project.plate.outline),
      plate_outline_mode: project.plate.outlineMode,
      description: project.description,
    }),
  );
  for (const group of project.groups) {
    rows.push(
      record({
        record: "group",
        group: group.name,
        height_mm: group.masterHeight == null ? "" : formatMm(group.masterHeight),
        typeface: group.masterTypefaceId ? fontName(group.masterTypefaceId, custom) : "",
        font_height_mm: group.masterFontSize == null ? "" : formatMm(group.masterFontSize),
        padding_mm: formatMm(group.padding),
        align: group.align,
        vertical: group.vAlign,
        radius_mm: formatMm(group.radius),
        tracking_mm: formatMm(group.tracking),
        line_gap_mm: formatMm(group.lineGap),
        label_product: labelProductName(group.product),
      }),
    );
  }
  for (const label of labelsInGroupOrder(project)) {
    const resolved = resolveLabel(project, label);
    rows.push(
      record({
        record: "label",
        group: resolved.groupName,
        text: label.text,
        width_mm: formatMm(label.width),
        height_mm: formatMm(resolved.height),
        height_from: resolved.heightSource,
        typeface: fontName(resolved.typefaceId, custom),
        typeface_from: resolved.typefaceSource,
        font_height_mm: formatMm(resolved.fontSize),
        font_height_from: resolved.fontSizeSource,
        lines: acrossPieces(label, pieceLines),
        line_font_mm: acrossPieces(label, pieceFonts),
        line_align: acrossPieces(label, pieceAligns),
        padding_mm: formatMm(resolved.padding),
        align: resolved.align,
        vertical: resolved.vAlign,
        radius_mm: formatMm(resolved.radius),
        tracking_mm: formatMm(resolved.tracking),
        line_gap_mm: formatMm(resolved.lineGap),
        layout: layoutCell(label),
      }),
    );
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes(",") || !firstLine.includes(";") ? "," : ";";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\r" || char === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

function readNum(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSize(value: string): { width: number; height: number } | null {
  const match = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i.exec(value);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function near(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.05;
}

function paperPreset(width: number, height: number): PaperPreset {
  if (near(width, PAPER.a4.width) && near(height, PAPER.a4.height)) return "a4";
  if (near(width, PAPER.letter.width) && near(height, PAPER.letter.height)) return "letter";
  return "custom";
}

function machinePreset(width: number, height: number): MachinePreset {
  const found = (Object.entries(MACHINES) as [Exclude<MachinePreset, "custom">, (typeof MACHINES)["a350"]][]).find(
    ([, spec]) => near(width, spec.width) && near(height, spec.height),
  );
  return found?.[0] ?? "custom";
}

function flag(value: string, fallback: boolean): boolean {
  const text = value.trim().toLowerCase();
  if (text === "yes" || text === "true" || text === "1") return true;
  if (text === "no" || text === "false" || text === "0") return false;
  return fallback;
}

function fontId(name: string, custom: { id: string; name: string }[]): string {
  const trimmed = name.trim();
  if (!trimmed) return FALLBACK_FONT_ID;
  const builtin = BUILTIN_FONTS.find((font) => font.id === trimmed || font.name === trimmed);
  if (builtin) return builtin.id;
  const added = custom.find((font) => font.id === trimmed || font.name === trimmed);
  return added?.id ?? trimmed;
}

function isOwn(source: string): boolean {
  const text = source.trim().toLowerCase();
  return text === "label" || text === "own" || text === "custom";
}

function parseAlign(value: string, fallback: Align): Align {
  const text = value.trim().toLowerCase();
  if (text === "left" || text === "center" || text === "right") return text;
  return fallback;
}

function parseLineAlign(value: string): Align | null {
  const text = value.trim().toLowerCase();
  if (text === "left" || text === "center" || text === "right") return text;
  return null;
}

function parseVAlign(value: string): VAlign {
  const text = value.trim().toLowerCase();
  if (text === "top" || text === "middle" || text === "bottom") return text;
  return "middle";
}

function parseOutline(value: string): OutlineMode {
  return value.trim().toLowerCase() === "engrave" ? "engrave" : "cut";
}

function splitPieces(value: string): string[] {
  if (value === "") return [""];
  return value.split(" // ");
}

function splitLines(value: string): string[] {
  if (value === "") return [""];
  return value.split(" | ");
}

function splitTopLevel(source: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(source.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(source.slice(start));
  return parts.filter((part) => part.length > 0);
}

function parseLayoutNode(text: string): LabelLayout | null {
  const piece = /^p(\d+)$/.exec(text);
  if (piece) return { kind: "piece", pieceId: piece[1] };
  const join = /^([HV])\((.*)\)$/.exec(text);
  if (!join) return null;
  const children = splitTopLevel(join[2]).map((part) => {
    const first = part.indexOf(":");
    const second = first >= 0 ? part.indexOf(":", first + 1) : -1;
    if (first < 0 || second < 0) return null;
    const share = Number(part.slice(0, first));
    const cross = Number(part.slice(first + 1, second));
    const node = parseLayoutNode(part.slice(second + 1));
    if (!node || !Number.isFinite(share) || !Number.isFinite(cross)) return null;
    return { share, cross, node };
  });
  if (children.some((child) => child == null) || children.length < 2) return null;
  return {
    kind: "join",
    axis: join[1] === "H" ? "horizontal" : "vertical",
    children: children.filter((child): child is { share: number; cross: number; node: LabelLayout } => child != null),
  };
}

function layoutFits(layout: LabelLayout, pieceCount: number): boolean {
  if (layout.kind === "piece") {
    const index = Number(layout.pieceId);
    return Number.isInteger(index) && index >= 0 && index < pieceCount;
  }
  return layout.children.every((child) => layoutFits(child.node, pieceCount));
}

function defaultLayout(pieceCount: number): LabelLayout {
  if (pieceCount <= 1) return { kind: "piece", pieceId: "0" };
  const share = 1 / pieceCount;
  return {
    kind: "join",
    axis: "horizontal",
    children: Array.from({ length: pieceCount }, (_, index) => ({
      share,
      cross: 1,
      node: { kind: "piece" as const, pieceId: String(index) },
    })),
  };
}

function parseLayout(source: string, pieceCount: number): LabelLayout {
  const layout = source.trim() ? parseLayoutNode(source.trim()) : null;
  if (layout && layoutFits(layout, pieceCount)) return layout;
  return defaultLayout(pieceCount);
}

function assignPieceIds(pieces: LabelPiece[], layout: LabelLayout): { pieces: LabelPiece[]; layout: LabelLayout } {
  const ids = pieces.map(() => createId());
  const remap = (node: LabelLayout): LabelLayout => {
    if (node.kind === "piece") return { kind: "piece", pieceId: ids[Number(node.pieceId)] ?? node.pieceId };
    return { kind: "join", axis: node.axis, children: node.children.map((child) => ({ ...child, node: remap(child.node) })) };
  };
  return {
    pieces: pieces.map((piece, index) => ({ ...piece, id: ids[index] ?? piece.id })),
    layout: remap(layout),
  };
}

interface DraftGroup extends Group {
  declared: boolean;
}

function draftGroup(name: string): DraftGroup {
  return {
    id: createId(),
    name: name.slice(0, 80) || "Group",
    masterHeight: null,
    masterTypefaceId: null,
    masterFontSize: null,
    padding: 1.4,
    align: "center",
    vAlign: "middle",
    radius: 0,
    tracking: 0,
    lineGap: 0.4,
    product: "acrylic",
    declared: false,
  };
}

/** True when the text is a spreadsheet from this app, including a .txt copy. */
export function isLabelCsv(text: string): boolean {
  const body = text.replace(/^\uFEFF/, "").trimStart().toLowerCase();
  return body.startsWith("record,") || body.startsWith("record;");
}

/**
 * Reads a CSV written by this app, including an older sheet that has no layout column.
 * A blank line font or alignment follows the label or the group.
 */
export function projectFromCsv(text: string, custom: { id: string; name: string }[] = []): Project | null {
  const table = parseCsv(text);
  if (table.length < 2) return null;
  const header = table[0].map((value) => value.trim().toLowerCase());
  if (!header.includes("record")) return null;
  const index = new Map(header.map((name, column) => [name, column]));
  const raw = (row: string[], name: string) => {
    const column = index.get(name);
    if (column == null) return "";
    return row[column] ?? "";
  };
  const cell = (row: string[], name: string) => raw(row, name).trim();

  let name = "Labels";
  let description = "";
  let masterHeight: number | null = null;
  let sheetWidth = PAPER.a4.width;
  let sheetHeight = PAPER.a4.height;
  let sheetMargin = 14;
  let sheetGap = 6;
  let showDimensions = true;
  let showCalibration = true;
  let plateWidth = MACHINES.a350.width;
  let plateHeight = MACHINES.a350.height;
  let plateMargin = 8;
  let plateGap = 4;
  let outline = true;
  let outlineMode: OutlineMode = "cut";
  let sawProject = false;
  const groups: DraftGroup[] = [];
  const labels: Label[] = [];

  const groupNamed = (value: string, declared: boolean): DraftGroup => {
    const groupName = value.trim().slice(0, 80) || "Group";
    const existing = groups.find((group) => group.name === groupName && (!declared || !group.declared));
    if (existing) return existing;
    const created = draftGroup(groupName);
    groups.push(created);
    return created;
  };

  for (const row of table.slice(1)) {
    const kind = cell(row, "record").toLowerCase();
    if (kind === "project" && !sawProject) {
      sawProject = true;
      const title = cell(row, "text");
      if (title) name = title;
      if (index.has("description")) description = raw(row, "description").replace(/^\s+|\s+$/g, "").slice(0, 400);
      if (index.has("master_height_mm")) masterHeight = readNum(cell(row, "master_height_mm"));
      const sheet = parseSize(cell(row, "sheet_mm"));
      if (sheet) {
        sheetWidth = sheet.width;
        sheetHeight = sheet.height;
      }
      const plate = parseSize(cell(row, "plate_mm"));
      if (plate) {
        plateWidth = plate.width;
        plateHeight = plate.height;
      }
      const margin = readNum(cell(row, "sheet_margin_mm"));
      if (margin != null) sheetMargin = margin;
      const gap = readNum(cell(row, "sheet_gap_mm"));
      if (gap != null) sheetGap = gap;
      if (index.has("sheet_dimensions")) showDimensions = flag(cell(row, "sheet_dimensions"), true);
      if (index.has("sheet_calibration")) showCalibration = flag(cell(row, "sheet_calibration"), true);
      const plateMarginValue = readNum(cell(row, "plate_margin_mm"));
      if (plateMarginValue != null) plateMargin = plateMarginValue;
      const plateGapValue = readNum(cell(row, "plate_gap_mm"));
      if (plateGapValue != null) plateGap = plateGapValue;
      if (index.has("plate_outline")) outline = flag(cell(row, "plate_outline"), true);
      if (index.has("plate_outline_mode")) outlineMode = parseOutline(cell(row, "plate_outline_mode"));
      continue;
    }
    if (kind === "group") {
      const group = groupNamed(cell(row, "group"), true);
      group.declared = true;
      group.masterHeight = readNum(cell(row, "height_mm"));
      const face = cell(row, "typeface");
      group.masterTypefaceId = face ? fontId(face, custom) : null;
      group.masterFontSize = readNum(cell(row, "font_height_mm"));
      const padding = readNum(cell(row, "padding_mm"));
      if (padding != null) group.padding = padding;
      if (cell(row, "align")) group.align = parseAlign(cell(row, "align"), "center");
      if (cell(row, "vertical")) group.vAlign = parseVAlign(cell(row, "vertical"));
      const radius = readNum(cell(row, "radius_mm"));
      if (radius != null) group.radius = radius;
      const tracking = readNum(cell(row, "tracking_mm"));
      if (tracking != null) group.tracking = tracking;
      const lineGap = readNum(cell(row, "line_gap_mm"));
      if (lineGap != null) group.lineGap = lineGap;
      if (cell(row, "label_product")) group.product = labelProductId(cell(row, "label_product"));
      continue;
    }
    if (kind !== "label") continue;
    const group = groupNamed(cell(row, "group"), false);
    const heightFrom = cell(row, "height_from");
    const typeFrom = cell(row, "typeface_from");
    const fontFrom = cell(row, "font_height_from");
    const height = readNum(cell(row, "height_mm")) ?? group.masterHeight ?? 12;
    const width = readNum(cell(row, "width_mm")) ?? 40;
    const fontSize = readNum(cell(row, "font_height_mm")) ?? group.masterFontSize ?? 5;
    const faceName = cell(row, "typeface");
    const typefaceId = faceName ? fontId(faceName, custom) : (group.masterTypefaceId ?? FALLBACK_FONT_ID);
    if (!group.declared) {
      if (group.masterHeight == null && !isOwn(heightFrom)) group.masterHeight = height;
      if (group.masterTypefaceId == null && faceName && !isOwn(typeFrom)) group.masterTypefaceId = typefaceId;
      if (group.masterFontSize == null && !isOwn(fontFrom)) group.masterFontSize = fontSize;
      const padding = readNum(cell(row, "padding_mm"));
      if (padding != null) group.padding = padding;
    }
    if (heightFrom.trim().toLowerCase() === "project" && masterHeight == null) masterHeight = height;
    const linesField = raw(row, "lines").trim();
    const textField = raw(row, "text").trim();
    const sources = !index.has("lines") || (linesField === "" && textField !== "") ? [textField] : splitPieces(linesField);
    const fontSources = splitPieces(raw(row, "line_font_mm").trim());
    const alignSources = splitPieces(raw(row, "line_align").trim());
    const drafted: LabelPiece[] = sources.map((source, pieceIndex) => {
      const texts = splitLines(source);
      const fonts = splitLines(fontSources[pieceIndex] ?? "");
      const aligns = splitLines(alignSources[pieceIndex] ?? "");
      const lines: LabelLine[] = texts.slice(0, 12).map((line, lineIndex) => ({
        text: line.slice(0, 80),
        fontSize: readNum(fonts[lineIndex] ?? ""),
        align: parseLineAlign(aligns[lineIndex] ?? ""),
      }));
      return { id: String(pieceIndex), lines: lines.length > 0 ? lines : [{ text: "", fontSize: null, align: null }] };
    });
    const composition = assignPieceIds(drafted, parseLayout(cell(row, "layout"), drafted.length));
    labels.push({
      id: createId(),
      groupId: group.id,
      text: textField.slice(0, 240),
      width,
      height,
      heightMode: isOwn(heightFrom) ? "custom" : "group",
      typefaceId,
      typefaceMode: isOwn(typeFrom) ? "custom" : "group",
      fontSize,
      fontSizeMode: isOwn(fontFrom) ? "custom" : "group",
      pieces: composition.pieces,
      layout: composition.layout,
    });
  }

  if (groups.length === 0) return null;
  return sanitizeProject({
    version: 1,
    name,
    description,
    masterHeight,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      masterHeight: group.masterHeight,
      masterTypefaceId: group.masterTypefaceId,
      masterFontSize: group.masterFontSize,
      padding: group.padding,
      align: group.align,
      vAlign: group.vAlign,
      radius: group.radius,
      tracking: group.tracking,
      lineGap: group.lineGap,
      product: group.product,
    })),
    labels,
    sheet: {
      preset: paperPreset(sheetWidth, sheetHeight),
      width: sheetWidth,
      height: sheetHeight,
      margin: sheetMargin,
      gap: sheetGap,
      showDimensions,
      showCalibration,
    },
    plate: {
      preset: machinePreset(plateWidth, plateHeight),
      width: plateWidth,
      height: plateHeight,
      margin: plateMargin,
      gap: plateGap,
      outline,
      outlineMode,
    },
  });
}
