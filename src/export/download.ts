import JSZip from "jszip";
import type { OutlineMode, PlateSettings, SvgUnit } from "../types";
import { formatMm, slug } from "../model/format";
import type { LaidPage } from "../model/layout";
import type { ResolvedLabel } from "../model/resolve";
import type { LabelArt } from "../model/text";
import { labelDownloadName, renderLabelSvg, renderPlateSvg, withXml } from "./svg";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function projectSlug(name: string): string {
  return slug(name || "labels");
}

function artFor(arts: Map<string, LabelArt>, label: ResolvedLabel): LabelArt | undefined {
  return arts.get(label.id);
}

export interface SvgBundle {
  unit: SvgUnit;
  labels: boolean;
  plate: boolean;
  resolved: ResolvedLabel[];
  arts: Map<string, LabelArt>;
  platePages: LaidPage[];
  plateSettings: PlateSettings;
  outline: boolean;
  outlineMode: OutlineMode;
}

export function lubanReadme(bundle: SvgBundle): string {
  const lines = [
    "Label Designer — Snapmaker SVG",
    "",
    bundle.unit === "luban72"
      ? "Unit mode: Luban 72 DPI. Drag the file onto the Luban canvas."
      : "Unit mode: millimetres. Width and height are real mm.",
    "The file name ends with the label size in millimetres.",
    "If Luban shows the wrong size, select the object and type that width and height.",
    "Some Luban versions scale File > Import differently from dragging a file onto the canvas. Prefer drag-and-drop, then check the size.",
    "",
    "Black paths are the lettering, for a fill / engrave operation.",
  ];
  if (bundle.outline && bundle.outlineMode === "cut") {
    lines.push("Red paths are the label outline, for a cut operation. Map red and black to different operations in Luban.");
  } else if (bundle.outline) {
    lines.push("The outline is black, meant to be engraved with the lettering.");
  } else {
    lines.push("Outlines are off. The file bounds are the label size.");
  }
  lines.push(
    "",
    `Build plate: ${formatMm(bundle.plateSettings.width)} × ${formatMm(bundle.plateSettings.height)} mm (${bundle.platePages.length} file${bundle.platePages.length === 1 ? "" : "s"}).`,
    "A plate file uses the full bed. If Luban crops to the artwork, set the object size to the bed size in the file name.",
  );
  return lines.join("\n");
}

export async function buildSvgZip(bundle: SvgBundle): Promise<Blob> {
  const zip = new JSZip();
  zip.file("READ-ME.txt", lubanReadme(bundle));
  if (bundle.labels) {
    bundle.resolved.forEach((label, index) => {
      const art = artFor(bundle.arts, label);
      if (!art) return;
      const svg = withXml(renderLabelSvg(label, art, bundle.unit, bundle.outline, bundle.outlineMode));
      zip.file(`labels/${labelDownloadName(index, label)}`, svg);
    });
  }
  if (bundle.plate) {
    const { width, height } = bundle.plateSettings;
    bundle.platePages.forEach((page, index) => {
      const svg = withXml(
        renderPlateSvg(page, width, height, bundle.unit, bundle.outline, bundle.outlineMode, bundle.arts, { preview: false }),
      );
      const name = `plates/plate-${index + 1}-${formatMm(width)}x${formatMm(height)}mm.svg`;
      zip.file(name, svg);
    });
  }
  return zip.generateAsync({ type: "blob" });
}
