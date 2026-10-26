import { useCallback, useRef, useState } from "react";
import type { SvgUnit } from "../types";
import { formatMm } from "../model/format";
import { blankProject, sanitizeProject } from "../model/project";
import { buildSvgZip, downloadBlob, projectSlug } from "../export/download";
import { svgPagesToPdf } from "../export/pdf";
import { labelDownloadName, renderLabelSvg, renderPlateSvg, renderSheetSvg, withXml } from "../export/svg";
import { DIMENSION_FONT_ID, FALLBACK_FONT_ID } from "../model/fonts";
import { useArtwork } from "../state/artwork";
import { useFonts } from "../state/fonts";
import { useStore } from "../state/store";
import { ExportDialog } from "./ExportDialog";

export function TopBar() {
  const { project, dispatch, setSelected } = useStore();
  const { ready, error, custom, addFontFile, removeFont, fonts } = useFonts();
  const { resolved, arts, sheetPages, platePages } = useArtwork();
  const [svgOpen, setSvgOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const fontRef = useRef<HTMLInputElement>(null);
  const closeSvg = useCallback(() => setSvgOpen(false), []);

  const exportPdf = async () => {
    setMessage(null);
    try {
      const dimensionFont = fonts.get(DIMENSION_FONT_ID) ?? fonts.get(FALLBACK_FONT_ID);
      const pages = sheetPages.map((page) => ({
        svg: renderSheetSvg(page, project.sheet.width, project.sheet.height, arts, dimensionFont, {
          preview: false,
          showDimensions: project.sheet.showDimensions,
          showCalibration: project.sheet.showCalibration,
        }),
        width: project.sheet.width,
        height: project.sheet.height,
      }));
      const blob = await svgPagesToPdf(pages, project.name || "Labels");
      downloadBlob(blob, `${projectSlug(project.name)}-1to1.pdf`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not build the PDF.");
    }
  };

  const exportSvg = async (choice: { labels: boolean; plate: boolean; unit: SvgUnit }) => {
    setMessage(null);
    setSvgOpen(false);
    try {
      const labelFiles = choice.labels ? resolved.filter((label) => arts.has(label.id)) : [];
      const plates = choice.plate ? platePages : [];
      if (labelFiles.length + plates.length === 0) {
        setMessage("Add a label before exporting SVG.");
        return;
      }
      if (labelFiles.length === 1 && plates.length === 0) {
        const label = labelFiles[0];
        const art = arts.get(label.id);
        if (!art) return;
        const svg = withXml(renderLabelSvg(label, art, choice.unit, project.plate.outline, project.plate.outlineMode));
        downloadBlob(new Blob([svg], { type: "image/svg+xml" }), labelDownloadName(0, label));
        return;
      }
      if (labelFiles.length === 0 && plates.length === 1) {
        const svg = withXml(
          renderPlateSvg(plates[0], project.plate.width, project.plate.height, choice.unit, project.plate.outline, project.plate.outlineMode, arts, {
            preview: false,
          }),
        );
        downloadBlob(
          new Blob([svg], { type: "image/svg+xml" }),
          `${projectSlug(project.name)}-plate-1-${formatMm(project.plate.width)}x${formatMm(project.plate.height)}mm.svg`,
        );
        return;
      }
      const blob = await buildSvgZip({
        unit: choice.unit,
        labels: choice.labels,
        plate: choice.plate,
        resolved,
        arts,
        platePages,
        plateSettings: project.plate,
        outline: project.plate.outline,
        outlineMode: project.plate.outlineMode,
      });
      downloadBlob(blob, `${projectSlug(project.name)}-snapmaker.zip`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not build the SVG.");
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5.5" width="13" height="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3.5 17.5h13M3.5 17.5v-2.2M16.5 17.5v-2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <div>
          <strong>Label Designer</strong>
          <span>1:1 millimetres</span>
        </div>
      </div>
      <input
        className="project-name"
        aria-label="Project name"
        value={project.name}
        onChange={(event) => dispatch({ type: "rename", name: event.target.value })}
      />
      <div className="spacer" />
      <button
        type="button"
        className="btn"
        onClick={() => {
          if (project.labels.length > 0 && !window.confirm("Replace this project with an empty one?")) return;
          dispatch({ type: "replace", project: blankProject() });
          setSelected(new Set());
        }}
      >
        New
      </button>
      <details className="pop">
        <summary className="btn">File</summary>
        <div className="pop-panel">
          <button
            type="button"
            onClick={() =>
              downloadBlob(
                new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
                `${projectSlug(project.name)}.labels.json`,
              )
            }
          >
            Download project
          </button>
          <button type="button" onClick={() => jsonRef.current?.click()}>
            Open project
          </button>
        </div>
      </details>
      <details className="pop">
        <summary className="btn">Fonts</summary>
        <div className="pop-panel font-panel">
          <p>Built-in faces cover Latin and Traditional Chinese. Add a TTF, OTF, or WOFF for another face.</p>
          <button type="button" className="btn" onClick={() => fontRef.current?.click()}>
            Add font file
          </button>
          {fontError && <p className="warn">{fontError}</p>}
          {custom.length === 0 && <p className="quiet">No added fonts yet.</p>}
          {custom.map((font) => (
            <div key={font.id} className="font-row">
              <span>{font.name}</span>
              <button type="button" onClick={() => void removeFont(font.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </details>
      <button type="button" className="btn primary" data-testid="export-pdf" disabled={!ready} onClick={() => void exportPdf()}>
        PDF 1:1
      </button>
      <button type="button" className="btn accent" data-testid="export-svg" disabled={!ready} onClick={() => setSvgOpen(true)}>
        Snapmaker SVG
      </button>
      {(message || error) && <p className="banner">{message || error}</p>}
      <input
        ref={jsonRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            const next = sanitizeProject(JSON.parse(await file.text()));
            if (!next) {
              setMessage("That file is not a label project.");
              return;
            }
            dispatch({ type: "replace", project: next });
            setSelected(new Set());
            setMessage(null);
          } catch {
            setMessage("Could not read that project file.");
          }
        }}
      />
      <input
        ref={fontRef}
        type="file"
        accept=".ttf,.otf,.woff,font/ttf,font/otf"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            await addFontFile(file);
            setFontError(null);
          } catch (reason) {
            setFontError(reason instanceof Error ? reason.message : "Could not read that font.");
          }
        }}
      />
      {svgOpen && <ExportDialog onClose={closeSvg} onExport={(choice) => void exportSvg(choice)} />}
    </header>
  );
}
