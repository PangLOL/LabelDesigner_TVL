import { useEffect, useRef } from "react";
import type { SvgUnit } from "../types";
import { useStore } from "../state/store";

export function ExportDialog({
  onClose,
  onExport,
}: {
  onClose: () => void;
  onExport: (choice: { labels: boolean; plate: boolean; unit: SvgUnit }) => void;
}) {
  const { project } = useStore();
  const unit = useRef<SvgUnit>("luban72");
  const what = useRef<"labels" | "plate" | "both">("both");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="svg-title"
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="svg-title">Snapmaker SVG</h2>
        <p>
          The download is a zip with two files for each label, both {project.plate.width} × {project.plate.height} mm on a plate file, or cropped tight for a single label.
          <strong> engrave/</strong> is the lettering only, filled black, for a filled engrave. <strong> cut/</strong> is the label outline only, for a cut.
          Import each file as its own operation.
        </p>
        <fieldset>
          <legend>What to export</legend>
          <label>
            <input type="radio" name="what" defaultChecked={false} onChange={() => { what.current = "labels"; }} />
            Each label, as engrave and cut
          </label>
          <label>
            <input type="radio" name="what" defaultChecked={false} onChange={() => { what.current = "plate"; }} />
            Build plate
          </label>
          <label>
            <input type="radio" name="what" defaultChecked onChange={() => { what.current = "both"; }} />
            Plate and individual labels
          </label>
        </fieldset>
        <fieldset>
          <legend>Units</legend>
          <label>
            <input type="radio" name="unit" defaultChecked onChange={() => { unit.current = "luban72"; }} />
            Luban 72 DPI — drag onto the canvas
          </label>
          <label>
            <input type="radio" name="unit" onChange={() => { unit.current = "mm"; }} />
            Millimetres — Inkscape, LightBurn, Illustrator
          </label>
        </fieldset>
        <p className="dialog-note">
          The file name ends with the size in millimetres. If Luban scales it wrong, select the object and type that width and height.
          Dragging a file onto the canvas and File → Import have disagreed in some Luban versions. Check the size either way.
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn accent"
            onClick={() =>
              onExport({
                labels: what.current !== "plate",
                plate: what.current !== "labels",
                unit: unit.current,
              })
            }
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
