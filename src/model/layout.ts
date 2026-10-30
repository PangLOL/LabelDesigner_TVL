import type { Font } from "opentype.js";
import type { Project } from "../types";
import { labelProductName } from "../types";
import { formatMm } from "./format";
import type { ResolvedLabel } from "./resolve";
import { measureText } from "./text";

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
  /** How the group is made, printed beside the name. */
  productName: string;
  groupIndex: number;
  x: number;
  y: number;
}

export interface SheetLine {
  text: string;
  y: number;
  size: number;
}

export interface SheetBanner {
  /** Where the first page’s labels may start. Later pages use the sheet margin. */
  contentTop: number;
  x: number;
  titleLines: SheetLine[];
  descriptionLines: SheetLine[];
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

function wrapLine(font: Font | undefined, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) continue;
    let line = "";
    for (const char of paragraph) {
      const next = line + char;
      const wide = font ? measureText(font, next, size) > width : next.length * size * 0.55 > width;
      if (line && wide) {
        lines.push(line);
        line = char.trim() ? char : "";
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Title and description block for the first page of the print sheet. */
export function sheetBanner(font: Font | undefined, title: string, description: string, pageWidth: number, margin: number): SheetBanner {
  const width = Math.max(40, pageWidth - margin * 2);
  const titleLines = wrapLine(font, title.trim() || "Labels", 5, width).slice(0, 2);
  const descriptionLines = description.trim() ? wrapLine(font, description.trim(), 3.2, width).slice(0, 4) : [];
  let baseline = 8;
  const titles = titleLines.map((text) => {
    const line = { text, y: baseline, size: 5 };
    baseline += 6.2;
    return line;
  });
  if (descriptionLines.length) baseline += 0.8;
  const descriptions = descriptionLines.map((text) => {
    const line = { text, y: baseline, size: 3.2 };
    baseline += 4.4;
    return line;
  });
  return { contentTop: Math.max(margin, baseline + 2.4), x: margin, titleLines: titles, descriptionLines: descriptions };
}

export function paginate(labels: ResolvedLabel[], frame: Frame, options?: { groupRows?: boolean; firstPageTop?: number }): LaidPage[] {
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
  let pageTop = Math.max(box.top, options?.firstPageTop ?? box.top);
  let y = pageTop;
  let rowHeight = 0;
  let lastGroup: string | null = null;

  const commit = () => {
    pages.push({ placements, headings });
    placements = [];
    headings = [];
    x = box.left;
    pageTop = box.top;
    y = box.top;
    rowHeight = 0;
  };

  const addHeading = (label: ResolvedLabel) => {
    headings.push({
      name: label.groupName,
      heightText: groupHeightText(labels, label.groupId),
      productName: labelProductName(label.product),
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
      placements.push({ label, x: box.left, y: pageTop, oversized: true });
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
