import type { Project } from "../types";
import { formatMm } from "./format";
import type { ResolvedLabel } from "./resolve";

/** Room under a label for the width dimension, in millimetres. */
export const DIM_BELOW = 7.5;
/** Room to the right of a label for the height dimension, in millimetres. */
export const DIM_SIDE = 11;

export interface Frame {
  width: number;
  height: number;
  margin: number;
  gap: number;
  showDimensions: boolean;
  /** Distance from the page bottom that content must stay above. Includes the margin. */
  bottomInset: number;
}

export interface Placement {
  label: ResolvedLabel;
  x: number;
  y: number;
  oversized: boolean;
}

export interface GroupHeading {
  name: string;
  /** Resolved group height, or a short note when the labels in the group differ. */
  heightText: string;
  groupIndex: number;
  x: number;
  y: number;
}

export interface LaidPage {
  placements: Placement[];
  headings: GroupHeading[];
}

/** Vertical room for a group name and its height, before that group's labels. */
export const GROUP_BAND = 8;

export function frameBottomInset(margin: number, calibrate: boolean): number {
  return calibrate ? Math.max(margin, 16) : margin;
}

export function sheetFrame(project: Project): Frame {
  return {
    width: project.sheet.width,
    height: project.sheet.height,
    margin: project.sheet.margin,
    gap: project.sheet.gap,
    showDimensions: project.sheet.showDimensions,
    bottomInset: frameBottomInset(project.sheet.margin, project.sheet.showCalibration),
  };
}

export function plateFrame(project: Project): Frame {
  return {
    width: project.plate.width,
    height: project.plate.height,
    margin: project.plate.margin,
    gap: project.plate.gap,
    showDimensions: false,
    bottomInset: project.plate.margin,
  };
}

export function cellSize(label: { width: number; height: number }, showDimensions: boolean): { width: number; height: number } {
  return {
    width: label.width + (showDimensions ? DIM_SIDE : 0),
    height: label.height + (showDimensions ? DIM_BELOW : 0),
  };
}

function groupHeightText(labels: ResolvedLabel[], groupId: string): string {
  const heights = new Set(labels.filter((label) => label.groupId === groupId).map((label) => formatMm(label.height)));
  if (heights.size === 1) return `${[...heights][0]} mm`;
  return "mixed heights";
}

export function paginate(labels: ResolvedLabel[], frame: Frame, options?: { groupRows?: boolean }): LaidPage[] {
  const groupRows = options?.groupRows ?? false;
  const box = {
    left: frame.margin,
    top: frame.margin,
    right: frame.width - frame.margin,
    bottom: frame.height - frame.bottomInset,
  };
  const contentW = box.right - box.left;
  const contentH = box.bottom - box.top;
  const pages: LaidPage[] = [];
  let placements: Placement[] = [];
  let headings: GroupHeading[] = [];
  let x = box.left;
  let y = box.top;
  let rowHeight = 0;
  let lastGroup: string | null = null;

  const commit = () => {
    pages.push({ placements, headings });
    placements = [];
    headings = [];
    x = box.left;
    y = box.top;
    rowHeight = 0;
  };

  const addHeading = (label: ResolvedLabel) => {
    headings.push({
      name: label.groupName,
      heightText: groupHeightText(labels, label.groupId),
      groupIndex: label.groupIndex,
      x: box.left,
      y,
    });
    y += GROUP_BAND;
  };

  for (const label of labels) {
    const cell = cellSize(label, frame.showDimensions);
    const fits = cell.width <= contentW + 0.01 && cell.height <= contentH + 0.01 && contentW > 1 && contentH > 1;
    if (!fits) {
      if (placements.length || headings.length) commit();
      placements.push({ label, x: box.left, y: box.top, oversized: true });
      commit();
      lastGroup = label.groupId;
      continue;
    }

    const newGroup = groupRows && lastGroup !== null && label.groupId !== lastGroup;
    if (newGroup && x > box.left + 0.01) {
      x = box.left;
      y += rowHeight + frame.gap;
      rowHeight = 0;
    }

    let band = groupRows && (label.groupId !== lastGroup || (placements.length === 0 && headings.length === 0)) ? GROUP_BAND : 0;
    if (y + band + cell.height > box.bottom + 0.01) {
      if (placements.length || headings.length) {
        commit();
        band = groupRows ? GROUP_BAND : 0;
      } else {
        band = 0;
      }
    }
    if (band > 0 && y + band + cell.height <= box.bottom + 0.01) addHeading(label);

    if (x > box.left + 0.01 && x + cell.width > box.right + 0.01) {
      x = box.left;
      y += rowHeight + frame.gap;
      rowHeight = 0;
      if (y + cell.height > box.bottom + 0.01 && (placements.length || headings.length)) {
        commit();
        if (groupRows && y + GROUP_BAND + cell.height <= box.bottom + 0.01) addHeading(label);
      }
    }

    placements.push({ label, x, y, oversized: false });
    x += cell.width + frame.gap;
    rowHeight = Math.max(rowHeight, cell.height);
    lastGroup = label.groupId;
  }

  if (placements.length || headings.length || pages.length === 0) pages.push({ placements, headings });
  return pages;
}
