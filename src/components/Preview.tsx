import { useEffect, useMemo, useRef, useState } from "react";
import { MACHINES, PAPER, type MachinePreset, type PaperPreset } from "../types";
import { formatMm } from "../model/format";
import { DIMENSION_FONT_ID, FALLBACK_FONT_ID } from "../model/fonts";
import { renderPlateSvg, renderSheetSvg } from "../export/svg";
import { useArtwork } from "../state/artwork";
import { useFonts } from "../state/fonts";
import { useStore } from "../state/store";
import { MmInput } from "./fields";

const PX_PER_MM = 96 / 25.4;

export function Preview() {
  const { project, dispatch, selected, toggleSelected, setSelected } = useStore();
  const { fonts } = useFonts();
  const { resolved, arts, sheetPages, platePages, ready } = useArtwork();
  const [mode, setMode] = useState<"sheet" | "plate">("sheet");
  const [pageIndex, setPageIndex] = useState(0);
  const [zoomMode, setZoomMode] = useState<"fit" | "fixed">("fit");
  const [fixed, setFixed] = useState(PX_PER_MM);
  const [fitScale, setFitScale] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);

  const pages = mode === "sheet" ? sheetPages : platePages;
  const pageWidth = mode === "sheet" ? project.sheet.width : project.plate.width;
  const pageHeight = mode === "sheet" ? project.sheet.height : project.plate.height;
  const page = pages[Math.min(pageIndex, Math.max(0, pages.length - 1))];
  const scale = zoomMode === "fit" ? fitScale : fixed;
  scaleRef.current = scale;

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, pages.length - 1)));
  }, [pages.length]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const styles = getComputedStyle(frame);
      const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const next = Math.min((frame.clientWidth - padX) / pageWidth, (frame.clientHeight - padY) / pageHeight);
      setFitScale(Number.isFinite(next) && next > 0 ? next : 0.2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [pageWidth, pageHeight]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const next = scaleRef.current * (event.deltaY > 0 ? 0.9 : 1.1);
      setZoomMode("fixed");
      setFixed(Math.min(12, Math.max(0.15, next)));
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, []);

  const dimensionFont = fonts.get(DIMENSION_FONT_ID) ?? fonts.get(FALLBACK_FONT_ID);
  const selectedKey = [...selected].join("|");
  const svg = useMemo(() => {
    if (!page || !ready) return "";
    if (mode === "sheet") {
      return renderSheetSvg(page, project.sheet.width, project.sheet.height, arts, dimensionFont, {
        preview: true,
        showDimensions: project.sheet.showDimensions,
        showCalibration: project.sheet.showCalibration,
        selected,
      });
    }
    return renderPlateSvg(page, project.plate.width, project.plate.height, "mm", project.plate.outline, project.plate.outlineMode, arts, {
      preview: true,
      selected,
    });
  }, [page, ready, mode, project.sheet, project.plate, arts, dimensionFont, selected, selectedKey]);

  const shown = Math.round((scale / PX_PER_MM) * 100);
  const overflow = resolved.filter((label) => arts.get(label.id)?.overflow).length;

  return (
    <section className="preview">
      <div className="preview-tools">
        <div className="segment" role="group" aria-label="Preview">
          <button type="button" aria-pressed={mode === "sheet"} onClick={() => { setMode("sheet"); setPageIndex(0); setZoomMode("fit"); }}>
            Print sheet
          </button>
          <button type="button" aria-pressed={mode === "plate"} onClick={() => { setMode("plate"); setPageIndex(0); setZoomMode("fit"); }}>
            Build plate
          </button>
        </div>
        <label>
          Bed width
          <MmInput
            label="Build plate width"
            value={project.plate.width}
            min={20}
            max={2000}
            onChange={(width) => dispatch({ type: "setPlate", patch: { width, preset: "custom" } })}
          />
        </label>
        <label>
          Bed length
          <MmInput
            label="Build plate length"
            value={project.plate.height}
            min={20}
            max={2000}
            onChange={(height) => dispatch({ type: "setPlate", patch: { height, preset: "custom" } })}
          />
        </label>

        {mode === "sheet" ? (
          <>
            <label>
              Paper
              <select
                className="field"
                aria-label="Paper size"
                value={project.sheet.preset}
                onChange={(event) => {
                  const preset = event.target.value as PaperPreset;
                  if (preset === "custom") dispatch({ type: "setSheet", patch: { preset } });
                  else dispatch({ type: "setSheet", patch: { preset, width: PAPER[preset].width, height: PAPER[preset].height } });
                }}
              >
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Width
              <MmInput label="Sheet width" value={project.sheet.width} min={20} max={2000} onChange={(width) => dispatch({ type: "setSheet", patch: { width, preset: "custom" } })} />
            </label>
            <label>
              Height
              <MmInput label="Sheet height" value={project.sheet.height} min={20} max={2000} onChange={(height) => dispatch({ type: "setSheet", patch: { height, preset: "custom" } })} />
            </label>
            <label>
              Margin
              <MmInput label="Sheet margin" value={project.sheet.margin} min={0} max={80} onChange={(margin) => dispatch({ type: "setSheet", patch: { margin } })} />
            </label>
            <label>
              Gap
              <MmInput label="Gap between labels" value={project.sheet.gap} min={0} max={80} onChange={(gap) => dispatch({ type: "setSheet", patch: { gap } })} />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={project.sheet.showDimensions}
                onChange={(event) => dispatch({ type: "setSheet", patch: { showDimensions: event.target.checked } })}
              />
              Dimensions
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={project.sheet.showCalibration}
                onChange={(event) => dispatch({ type: "setSheet", patch: { showCalibration: event.target.checked } })}
              />
              100 mm bar
            </label>
          </>
        ) : (
          <>
            <label>
              Machine
              <select
                className="field"
                aria-label="Snapmaker model"
                value={project.plate.preset}
                onChange={(event) => {
                  const preset = event.target.value as MachinePreset;
                  if (preset === "custom") dispatch({ type: "setPlate", patch: { preset } });
                  else dispatch({ type: "setPlate", patch: { preset, width: MACHINES[preset].width, height: MACHINES[preset].height } });
                }}
              >
                <option value="a350">A350 · 320 × 350</option>
                <option value="a250">A250 · 230 × 250</option>
                <option value="a150">A150 · 160 × 160</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Margin
              <MmInput label="Plate margin" value={project.plate.margin} min={0} max={80} onChange={(margin) => dispatch({ type: "setPlate", patch: { margin } })} />
            </label>
            <label>
              Gap
              <MmInput label="Plate gap" value={project.plate.gap} min={0} max={80} onChange={(gap) => dispatch({ type: "setPlate", patch: { gap } })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={project.plate.outline} onChange={(event) => dispatch({ type: "setPlate", patch: { outline: event.target.checked } })} />
              Outline
            </label>
            <div className="segment" role="group" aria-label="Outline operation">
              <button type="button" aria-pressed={project.plate.outlineMode === "cut"} disabled={!project.plate.outline} onClick={() => dispatch({ type: "setPlate", patch: { outlineMode: "cut" } })}>
                Cut
              </button>
              <button type="button" aria-pressed={project.plate.outlineMode === "engrave"} disabled={!project.plate.outline} onClick={() => dispatch({ type: "setPlate", patch: { outlineMode: "engrave" } })}>
                Engrave
              </button>
            </div>
          </>
        )}

        <div className="zoom">
          <button type="button" onClick={() => setZoomMode("fit")}>Fit</button>
          <button
            type="button"
            onClick={() => {
              setZoomMode("fixed");
              setFixed(Math.max(0.15, scale / 1.2));
            }}
          >
            −
          </button>
          <span>{scale > 0 ? `${shown}%` : "—"}</span>
          <button
            type="button"
            onClick={() => {
              setZoomMode("fixed");
              setFixed(Math.min(12, (scale || fitScale) * 1.2));
            }}
          >
            +
          </button>
          <button type="button" onClick={() => { setZoomMode("fixed"); setFixed(PX_PER_MM); }}>
            1:1
          </button>
        </div>
      </div>

      <div
        className="frame"
        ref={frameRef}
        data-testid="preview"
        onClick={(event) => {
          const hit = (event.target as Element).closest("[data-label-id]");
          if (!hit) {
            if (!event.shiftKey) setSelected(new Set());
            return;
          }
          const id = hit.getAttribute("data-label-id");
          if (!id) return;
          toggleSelected(id, event.shiftKey, event.metaKey || event.ctrlKey);
          document.querySelector(`[data-row-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
          if (event.detail === 2) {
            document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"] textarea`)?.focus();
          }
        }}
      >
        {!ready && <p className="frame-note">Loading typefaces…</p>}
        {ready && page && scale > 0 && (
          <div
            className="sizer"
            style={{ width: pageWidth * scale, height: pageHeight * scale }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      <footer className="preview-status">
        <p>
          {resolved.length} {resolved.length === 1 ? "label" : "labels"}
          {" · "}
          page {pages.length === 0 ? 0 : Math.min(pageIndex, pages.length - 1) + 1} of {pages.length}
          {" · "}
          {formatMm(pageWidth)} × {formatMm(pageHeight)} mm
          {" · "}
          shown at {scale > 0 ? `${shown}%` : "—"} of screen size
        </p>
        <p>
          {mode === "sheet"
            ? "The PDF is the print sheet at 1:1. Print it at 100% and check the bar."
            : "Snapmaker SVG saves two files for each label: filled lettering to engrave, and the outline to cut. Bed width and length set the plate file."}
        </p>
        {overflow > 0 && (
          <p className="warn">
            {overflow} {overflow === 1 ? "label has" : "labels have"} text past the edge.
          </p>
        )}
        {pages.length > 1 && (
          <div className="pager">
            <button type="button" onClick={() => setPageIndex((current) => Math.max(0, current - 1))} disabled={pageIndex <= 0}>
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPageIndex((current) => Math.min(pages.length - 1, current + 1))}
              disabled={pageIndex >= pages.length - 1}
            >
              Next
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}
