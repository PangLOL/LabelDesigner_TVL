export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type Edge = "top" | "right" | "bottom" | "left";
export type Follow = "group" | "custom";
export type PaperPreset = "a4" | "letter" | "custom";
export type MachinePreset = "a350" | "a250" | "a150" | "custom";
export type OutlineMode = "cut" | "engrave";
export type SvgUnit = "mm" | "luban72";
export type LabelProduct = "acrylic" | "thermal" | "die-cut-pp";

export const LABEL_PRODUCTS: { id: LabelProduct; name: string }[] = [
  { id: "acrylic", name: "Layered Acrylic Engraved Label" },
  { id: "thermal", name: "Thermal Label" },
  { id: "die-cut-pp", name: "Die-cut PP Sticker" },
];

export function labelProductName(id: LabelProduct): string {
  return LABEL_PRODUCTS.find((item) => item.id === id)?.name ?? LABEL_PRODUCTS[0].name;
}

export function labelProductId(value: string): LabelProduct {
  const text = value.trim().toLowerCase();
  const found = LABEL_PRODUCTS.find((item) => item.id === text || item.name.toLowerCase() === text);
  return found?.id ?? "acrylic";
}

/** A die-cut sticker has no outer rectangle. The characters are the sticker. */
export function isDieCut(product: LabelProduct | undefined): boolean {
  return product === "die-cut-pp";
}

export interface Group {
  id: string;
  name: string;
  /** Null lets each label keep its own height. Ignored while the project master height is on. */
  masterHeight: number | null;
  masterTypefaceId: string | null;
  masterFontSize: number | null;
  padding: number;
  align: Align;
  vAlign: VAlign;
  radius: number;
  /** Millimetres added between glyphs. */
  tracking: number;
  /** Millimetres added between line boxes, on top of the font height. */
  lineGap: number;
  /** How this group is made. Die-cut stickers have no outer frame. */
  product: LabelProduct;
}

/** One row of lettering. A null size or alignment follows the label and the group. */
export interface LabelLine {
  text: string;
  fontSize: number | null;
  align: Align | null;
}

export interface LabelPiece {
  id: string;
  lines: LabelLine[];
}

export type LabelLayout =
  | { kind: "piece"; pieceId: string }
  | {
      kind: "join";
      axis: "horizontal" | "vertical";
      /** `share` is the join-axis fraction. `cross` is this piece’s fraction of the other axis, so separating restores it. */
      children: { share: number; cross: number; node: LabelLayout }[];
    };

export interface Label {
  id: string;
  groupId: string;
  /** Reading-order summary of every piece. */
  text: string;
  width: number;
  height: number;
  heightMode: Follow;
  typefaceId: string;
  typefaceMode: Follow;
  fontSize: number;
  fontSizeMode: Follow;
  pieces: LabelPiece[];
  layout: LabelLayout;
}

export interface SheetSettings {
  preset: PaperPreset;
  width: number;
  height: number;
  margin: number;
  gap: number;
  showDimensions: boolean;
  showCalibration: boolean;
}

export interface PlateSettings {
  preset: MachinePreset;
  width: number;
  height: number;
  margin: number;
  gap: number;
  outline: boolean;
  outlineMode: OutlineMode;
}

export interface Project {
  version: 1;
  name: string;
  /** Printed under the title on the sheet. */
  description: string;
  /** Live height for every grouped label that still follows its group. */
  masterHeight: number | null;
  groups: Group[];
  labels: Label[];
  sheet: SheetSettings;
  plate: PlateSettings;
}

export interface PaperSpec {
  width: number;
  height: number;
  label: string;
}

export const PAPER: Record<Exclude<PaperPreset, "custom">, PaperSpec> = {
  a4: { width: 210, height: 297, label: "A4" },
  letter: { width: 215.9, height: 279.4, label: "US Letter" },
};

export interface MachineSpec {
  width: number;
  height: number;
  label: string;
}

/** Snapmaker 2.0 work areas, width × depth, in millimetres. */
export const MACHINES: Record<Exclude<MachinePreset, "custom">, MachineSpec> = {
  a350: { width: 320, height: 350, label: "Snapmaker 2.0 A350" },
  a250: { width: 230, height: 250, label: "Snapmaker 2.0 A250" },
  a150: { width: 160, height: 160, label: "Snapmaker 2.0 A150" },
};

export const MM_PER_INCH = 25.4;
export const LUBAN_DPI = 72;
/** User units per millimetre when a file is built at 72 DPI (PostScript points). */
export const LUBAN_UNITS_PER_MM = LUBAN_DPI / MM_PER_INCH;
