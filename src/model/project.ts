import type { Align, Follow, Group, Label, MachinePreset, OutlineMode, PaperPreset, Project, SheetSettings, PlateSettings, VAlign } from "../types";
import { MACHINES, PAPER } from "../types";
import { clamp } from "./format";
import { createId } from "./id";
import { sampleProject } from "./sample";

const FOLLOWS = new Set<Follow>(["group", "custom"]);
const ALIGNS = new Set<Align>(["left", "center", "right"]);
const VALIGNS = new Set<VAlign>(["top", "middle", "bottom"]);
const PAPERS = new Set<PaperPreset>(["a4", "letter", "custom"]);
const MACHINES_SET = new Set<MachinePreset>(["a350", "a250", "a150", "custom"]);
const OUTLINES = new Set<OutlineMode>(["cut", "engrave"]);

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
  };
}

function sanitizeLabel(value: unknown, groupIds: Set<string>): Label | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.groupId !== "string") return null;
  if (!groupIds.has(value.groupId)) return null;
  return {
    id: value.id,
    groupId: value.groupId,
    text: str(value.text, "").slice(0, 200),
    width: num(value.width, 40, 1, 2000),
    height: num(value.height, 12, 1, 2000),
    heightMode: oneOf(value.heightMode, FOLLOWS, "group"),
    typefaceId: str(value.typefaceId, "inter"),
    typefaceMode: oneOf(value.typefaceMode, FOLLOWS, "group"),
    fontSize: num(value.fontSize, 5, 0.8, 400),
    fontSizeMode: oneOf(value.fontSizeMode, FOLLOWS, "group"),
  };
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
    masterHeight: numOrNull(value.masterHeight, 1, 2000),
    groups,
    labels,
    sheet,
    plate,
  };
}

export function blankProject(): Project {
  const id = createId();
  const base = sampleProject();
  return {
    ...base,
    name: "Untitled labels",
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
      },
    ],
    labels: [],
    sheet: { ...base.sheet },
    plate: { ...base.plate },
  };
}
