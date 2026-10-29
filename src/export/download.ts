import JSZip from "jszip";
import type { PlateSettings, SvgUnit } from "../types";
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
    "Each label is two files with the same size, so they line up.",
    "engrave/ is the lettering only. The paths are filled black. Use this file as a filled engrave.",
    "cut/ is the label outline only. The path is red. Use this file as a cut.",
    "Import them as two operations. The engrave file has no border, and the cut file has no lettering.",
  ];
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
      const name = labelDownloadName(index, label);
      zip.file(`engrave/${name}`, withXml(renderLabelSvg(label, art, bundle.unit, false, "engrave", "text")));
      zip.file(`cut/${name}`, withXml(renderLabelSvg(label, art, bundle.unit, true, "cut", "outline")));
    });
  }
  if (bundle.plate) {
    const { width, height } = bundle.plateSettings;
    bundle.platePages.forEach((page, index) => {
      const name = `plate-${index + 1}-${formatMm(width)}x${formatMm(height)}mm.svg`;
      zip.file(
        `engrave/${name}`,
        withXml(renderPlateSvg(page, width, height, bundle.unit, false, "engrave", bundle.arts, { preview: false, part: "text" })),
      );
      zip.file(
        `cut/${name}`,
        withXml(renderPlateSvg(page, width, height, bundle.unit, true, "cut", bundle.arts, { preview: false, part: "outline" })),
      );
    });
  }
  return zip.generateAsync({ type: "blob" });
}
