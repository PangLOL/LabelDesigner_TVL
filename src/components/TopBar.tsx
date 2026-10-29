import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { SvgUnit } from "../types";
import { blankProject, sanitizeProject } from "../model/project";
import { isLabelCsv, projectFromCsv, projectToCsv } from "../export/csv";
import { buildSvgZip, downloadBlob, projectSlug } from "../export/download";
import { svgPagesToPdf } from "../export/pdf";
import { renderSheetSvg } from "../export/svg";
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

  const saveProject = () => {
    downloadBlob(
      new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
      `${projectSlug(project.name)}.labels.json`,
    );
  };

  const exportCsv = () => {
    downloadBlob(new Blob([projectToCsv(project, custom)], { type: "text/csv;charset=utf-8" }), `${projectSlug(project.name)}-parameters.csv`);
  };

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
      const blob = await buildSvgZip({
        unit: choice.unit,
        labels: choice.labels,
        plate: choice.plate,
        resolved,
        arts,
        platePages,
        plateSettings: project.plate,
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
      <button type="button" className="btn" onClick={saveProject}>
        Save
      </button>
      <button type="button" className="btn" aria-label="Export parameters as CSV" onClick={exportCsv}>
        CSV
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          if (project.labels.length > 0 && !window.confirm("Replace this project with an empty one? Save a copy first if you still need it.")) return;
          dispatch({ type: "replace", project: blankProject() });
          setSelected(new Set());
        }}
      >
        New
      </button>
      <DropMenu summary="File" panelClass="pop-panel file-panel">
        <p>Save writes a project file. Open project reads that file or a CSV, including a .txt copy of the spreadsheet. The file window lists every file, so a CSV is not greyed out on a Mac. This browser keeps the current project until you click New.</p>
        <button type="button" onClick={saveProject}>
          Save project
        </button>
        <button type="button" onClick={() => jsonRef.current?.click()}>
          Open project
        </button>
        <button type="button" onClick={exportCsv}>
          Export CSV
        </button>
      </DropMenu>
      <DropMenu summary="Fonts" panelClass="pop-panel font-panel">
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
      </DropMenu>
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
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            const text = await file.text();
            const csv = isLabelCsv(text) || file.name.toLowerCase().endsWith(".csv");
            const next = csv ? projectFromCsv(text, custom) : sanitizeProject(JSON.parse(text));
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

function DropMenu({ summary, panelClass, children }: { summary: string; panelClass: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const menu = ref.current;
      if (!menu?.open) return;
      if (event.target instanceof Node && menu.contains(event.target)) return;
      menu.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details className="pop" ref={ref}>
      <summary className="btn">{summary}</summary>
      <div
        className={panelClass}
        onClick={(event) => {
          if (!(event.target instanceof HTMLElement) || !event.target.closest("button")) return;
          if (ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
