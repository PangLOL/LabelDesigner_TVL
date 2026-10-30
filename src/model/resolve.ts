import type { Align, Group, Label, LabelLayout, LabelProduct, Project } from "../types";

export type HeightSource = "project" | "group" | "label";
export type FieldSource = "group" | "label";

export interface ResolvedLine {
  text: string;
  fontSize: number;
  align: Align;
}

export interface ResolvedPiece {
  id: string;
  lines: ResolvedLine[];
}

export interface ResolvedLabel {
  id: string;
  groupId: string;
  groupName: string;
  groupIndex: number;
  product: LabelProduct;
  text: string;
  width: number;
  height: number;
  typefaceId: string;
  fontSize: number;
  padding: number;
  align: Group["align"];
  vAlign: Group["vAlign"];
  radius: number;
  tracking: number;
  lineGap: number;
  pieces: ResolvedPiece[];
  layout: LabelLayout;
  heightSource: HeightSource;
  typefaceSource: FieldSource;
  fontSizeSource: FieldSource;
}

export function labelsInGroupOrder(project: Project): Label[] {
  const ordered: Label[] = [];
  const seen = new Set<string>();
  project.groups.forEach((group) => {
    for (const label of project.labels) {
      if (label.groupId === group.id) {
        ordered.push(label);
        seen.add(label.id);
      }
    }
  });
  for (const label of project.labels) {
    if (!seen.has(label.id)) ordered.push(label);
  }
  return ordered;
}

export function resolveLabel(project: Project, label: Label): ResolvedLabel {
  const groupIndex = project.groups.findIndex((group) => group.id === label.groupId);
  const group = groupIndex >= 0 ? project.groups[groupIndex] : undefined;

  let height = label.height;
  let heightSource: HeightSource = "label";
  if (label.heightMode === "group") {
    if (project.masterHeight != null) {
      height = project.masterHeight;
      heightSource = "project";
    } else if (group?.masterHeight != null) {
      height = group.masterHeight;
      heightSource = "group";
    }
  }

  let typefaceId = label.typefaceId;
  let typefaceSource: FieldSource = "label";
  if (label.typefaceMode === "group" && group?.masterTypefaceId) {
    typefaceId = group.masterTypefaceId;
    typefaceSource = "group";
  }

  let fontSize = label.fontSize;
  let fontSizeSource: FieldSource = "label";
  if (label.fontSizeMode === "group" && group?.masterFontSize != null) {
    fontSize = group.masterFontSize;
    fontSizeSource = "group";
  }

  const align = group?.align ?? "center";
  return {
    id: label.id,
    groupId: label.groupId,
    groupName: group?.name ?? "Ungrouped",
    groupIndex: Math.max(0, groupIndex),
    product: group?.product ?? "acrylic",
    text: label.text,
    width: label.width,
    height,
    typefaceId,
    fontSize,
    padding: group?.padding ?? 1.2,
    align,
    vAlign: group?.vAlign ?? "middle",
    radius: group?.radius ?? 0,
    tracking: group?.tracking ?? 0,
    lineGap: group?.lineGap ?? 0.4,
    pieces: label.pieces.map((piece) => ({
      id: piece.id,
      lines: piece.lines.map((line) => ({
        text: line.text,
        fontSize: line.fontSize ?? fontSize,
        align: line.align ?? align,
      })),
    })),
    layout: label.layout,
    heightSource,
    typefaceSource,
    fontSizeSource,
  };
}

export function resolveAll(project: Project): ResolvedLabel[] {
  return labelsInGroupOrder(project).map((label) => resolveLabel(project, label));
}

export function inheritedHeight(project: Project, group: Group | undefined): number | null {
  if (project.masterHeight != null) return project.masterHeight;
  return group?.masterHeight ?? null;
}
