import type { Project } from "../types";
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

export interface LaidPage {
  placements: Placement[];
}

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

export function paginate(labels: ResolvedLabel[], frame: Frame): LaidPage[] {
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
  let x = box.left;
  let y = box.top;
  let rowHeight = 0;

  const commit = () => {
    pages.push({ placements });
    placements = [];
    x = box.left;
    y = box.top;
    rowHeight = 0;
  };

  for (const label of labels) {
    const cell = cellSize(label, frame.showDimensions);
    const fits = cell.width <= contentW + 0.01 && cell.height <= contentH + 0.01 && contentW > 1 && contentH > 1;
    if (!fits) {
      if (placements.length) commit();
      placements.push({ label, x: box.left, y: box.top, oversized: true });
      commit();
      continue;
    }
    if (x > box.left + 0.01 && x + cell.width > box.right + 0.01) {
      x = box.left;
      y += rowHeight + frame.gap;
      rowHeight = 0;
    }
    if (y + cell.height > box.bottom + 0.01) {
      if (placements.length) commit();
    }
    placements.push({ label, x, y, oversized: false });
    x += cell.width + frame.gap;
    rowHeight = Math.max(rowHeight, cell.height);
  }

  if (placements.length || pages.length === 0) pages.push({ placements });
  return pages;
}
