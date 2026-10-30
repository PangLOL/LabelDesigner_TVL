import type { Align, Follow, Group, Label, LabelLayout, LabelLine, LabelPiece, LabelProduct, MachinePreset, OutlineMode, PaperPreset, Project, SheetSettings, PlateSettings, VAlign } from "../types";
import { labelProductId } from "../types";
import { MACHINES, PAPER } from "../types";
import { labelSummary, linesFromText, singleLayout } from "./compose";
import { clamp } from "./format";
import { createId } from "./id";

const FOLLOWS = new Set<Follow>(["group", "custom"]);
const ALIGNS = new Set<Align>(["left", "center", "right"]);
const VALIGNS = new Set<VAlign>(["top", "middle", "bottom"]);
const PAPERS = new Set<PaperPreset>(["a4", "letter", "custom"]);
const MACHINES_SET = new Set<MachinePreset>(["a350", "a250", "a150", "custom"]);
const OUTLINES = new Set<OutlineMode>(["cut", "engrave"]);
const PRODUCTS = new Set<LabelProduct>(["acrylic", "thermal", "die-cut-pp"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
}

function numOrNull(value: unknown, min: number, max: number): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return null;
  return clamp(parsed, min, max);
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : fallback;
}

function sanitizeGroup(value: unknown): Group | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    name: str(value.name, "Group").slice(0, 80) || "Group",
    masterHeight: numOrNull(value.masterHeight, 1, 2000),
    masterTypefaceId: typeof value.masterTypefaceId === "string" ? value.masterTypefaceId : null,
    masterFontSize: numOrNull(value.masterFontSize, 0.8, 400),
    padding: num(value.padding, 1.2, 0, 80),
    align: oneOf(value.align, ALIGNS, "center"),
    vAlign: oneOf(value.vAlign, VALIGNS, "middle"),
    radius: num(value.radius, 0, 0, 200),
    tracking: num(value.tracking, 0, -5, 20),
    lineGap: num(value.lineGap, 0.4, 0, 40),
    product: oneOf(value.product, PRODUCTS, labelProductId(typeof value.product === "string" ? value.product : "")),
  };
}

function sanitizeLine(value: unknown): LabelLine | null {
  if (!isRecord(value)) return null;
  return {
    text: str(value.text, "").slice(0, 80),
    fontSize: numOrNull(value.fontSize, 0.8, 400),
    align: typeof value.align === "string" && ALIGNS.has(value.align as Align) ? (value.align as Align) : null,
  };
}

function sanitizeLayout(value: unknown, pieceIds: Set<string>): LabelLayout | null {
  if (!isRecord(value)) return null;
  if (value.kind === "piece" && typeof value.pieceId === "string" && pieceIds.has(value.pieceId)) {
    return { kind: "piece", pieceId: value.pieceId };
  }
  if (value.kind !== "join" || (value.axis !== "horizontal" && value.axis !== "vertical") || !Array.isArray(value.children)) return null;
  const children = value.children.flatMap((child) => {
    if (!isRecord(child)) return [];
    const node = sanitizeLayout(child.node, pieceIds);
    const share = num(child.share, 0, 0, 1);
    const cross = num(child.cross, 1, 0, 1);
    return node ? [{ share, cross, node }] : [];
  });
  if (children.length < 2) return null;
  const total = children.reduce((sum, child) => sum + child.share, 0);
  const safe = total > 0 ? children : children.map((child) => ({ ...child, share: 1 / children.length }));
  const scale = total > 0 ? total : 1;
  return { kind: "join", axis: value.axis, children: safe.map((child) => ({ share: child.share / scale, cross: child.cross, node: child.node })) };
}

function compositionFromText(text: string): { pieces: LabelPiece[]; layout: LabelLayout } {
  const id = createId();
  return { pieces: [{ id, lines: linesFromText(text) }], layout: singleLayout(id) };
}

function sanitizeLabel(value: unknown, groupIds: Set<string>): Label | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.groupId !== "string") return null;
  if (!groupIds.has(value.groupId)) return null;
  const fallback = compositionFromText(str(value.text, "").slice(0, 200));
  let pieces: LabelPiece[] = [];
  if (Array.isArray(value.pieces)) {
    pieces = value.pieces.flatMap((piece) => {
      if (!isRecord(piece) || typeof piece.id !== "string" || !Array.isArray(piece.lines)) return [];
      const lines = piece.lines.map(sanitizeLine).filter((line): line is LabelLine => line !== null).slice(0, 12);
      if (lines.length === 0) return [];
      return [{ id: piece.id, lines }];
    });
  }
  const pieceIds = new Set(pieces.map((piece) => piece.id));
  const layout = pieces.length > 0 ? sanitizeLayout(value.layout, pieceIds) : null;
  const composition = layout ? { pieces, layout } : fallback;
  const label: Label = {
    id: value.id,
    groupId: value.groupId,
    text: "",
    width: num(value.width, 40, 1, 2000),
    height: num(value.height, 12, 1, 2000),
    heightMode: oneOf(value.heightMode, FOLLOWS, "group"),
    typefaceId: str(value.typefaceId, "inter"),
    typefaceMode: oneOf(value.typefaceMode, FOLLOWS, "group"),
    fontSize: num(value.fontSize, 5, 0.8, 400),
    fontSizeMode: oneOf(value.fontSizeMode, FOLLOWS, "group"),
    pieces: composition.pieces,
    layout: composition.layout,
  };
  label.text = labelSummary(label.pieces, label.layout);
  return label;
}

export function sanitizeProject(value: unknown): Project | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const groups = Array.isArray(value.groups) ? value.groups.map(sanitizeGroup).filter((group): group is Group => group !== null) : [];
  if (groups.length === 0) return null;
  const groupIds = new Set(groups.map((group) => group.id));
  const labels = Array.isArray(value.labels)
    ? value.labels.map((label) => sanitizeLabel(label, groupIds)).filter((label): label is Label => label !== null)
    : [];
  const sheetRaw = isRecord(value.sheet) ? value.sheet : {};
  const plateRaw = isRecord(value.plate) ? value.plate : {};
  const sheetPreset = oneOf(sheetRaw.preset, PAPERS, "a4");
  const platePreset = oneOf(plateRaw.preset, MACHINES_SET, "a350");
  const sheet: SheetSettings = {
    preset: sheetPreset,
    width: num(sheetRaw.width, PAPER.a4.width, 20, 2000),
    height: num(sheetRaw.height, PAPER.a4.height, 20, 2000),
    margin: num(sheetRaw.margin, 14, 0, 150),
    gap: num(sheetRaw.gap, 6, 0, 100),
    showDimensions: sheetRaw.showDimensions !== false,
    showCalibration: sheetRaw.showCalibration !== false,
  };
  const plate: PlateSettings = {
    preset: platePreset,
    width: num(plateRaw.width, MACHINES.a350.width, 20, 2000),
    height: num(plateRaw.height, MACHINES.a350.height, 20, 2000),
    margin: num(plateRaw.margin, 8, 0, 150),
    gap: num(plateRaw.gap, 4, 0, 100),
    outline: plateRaw.outline !== false,
    outlineMode: oneOf(plateRaw.outlineMode, OUTLINES, "cut"),
  };
  return {
    version: 1,
    name: str(value.name, "Labels").slice(0, 80) || "Labels",
    description: str(value.description, "").slice(0, 400),
    masterHeight: numOrNull(value.masterHeight, 1, 2000),
    groups,
    labels,
    sheet,
    plate,
  };
}

export function blankProject(): Project {
  const id = createId();
  return {
    version: 1,
    name: "Labels",
    description: "",
    masterHeight: null,
    groups: [
      {
        id,
        name: "Group 1",
        masterHeight: 12,
        masterTypefaceId: "inter",
        masterFontSize: 5,
        padding: 1.4,
        align: "center",
        vAlign: "middle",
        radius: 0,
        tracking: 0,
        lineGap: 0.4,
        product: "acrylic",
      },
    ],
    labels: [],
    sheet: {
      preset: "a4",
      width: PAPER.a4.width,
      height: PAPER.a4.height,
      margin: 14,
      gap: 6,
      showDimensions: true,
      showCalibration: true,
    },
    plate: {
      preset: "a350",
      width: MACHINES.a350.width,
      height: MACHINES.a350.height,
      margin: 8,
      gap: 4,
      outline: true,
      outlineMode: "cut",
    },
  };
}
