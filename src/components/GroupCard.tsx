import { useEffect, useRef, useState } from "react";
import type { Group, Label, LabelLine, LabelPiece, LabelProduct } from "../types";
import { LABEL_PRODUCTS } from "../types";
import { orderedPieceIds, pieceText } from "../model/compose";
import { fontName } from "../model/fonts";
import { formatMm } from "../model/format";
import { parseLabelList } from "../model/format";
import type { ResolvedLabel, ResolvedLine } from "../model/resolve";
import { capHeightMm, labelIssues, type LabelArt } from "../model/text";
import { groupSwatch } from "../palette";
import { useArtwork } from "../state/artwork";
import type { CustomFont } from "../state/fonts";
import { useFonts } from "../state/fonts";
import { useStore } from "../state/store";
import { FollowButton, FontSelect, MmInput } from "./fields";

export function GroupCard({ group, index }: { group: Group; index: number }) {
  const { project, dispatch, selected, setSelected } = useStore();
  const { fonts, custom } = useFonts();
  const { arts, resolved, sheetOver, plateOver } = useArtwork();
  const labels = project.labels.filter((label) => label.groupId === group.id);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");

  const remove = () => {
    if (labels.length > 0 && !window.confirm(`Delete ${group.name} and its ${labels.length} labels?`)) return;
    dispatch({ type: "deleteGroup", id: group.id });
  };

  const heightLocked = project.masterHeight != null;

  return (
    <section className="group" style={{ borderLeftColor: groupSwatch(index) }}>
      <header className="group-head">
        <input
          className="group-name"
          aria-label="Group name"
          value={group.name}
          onChange={(event) => dispatch({ type: "updateGroup", id: group.id, patch: { name: event.target.value } })}
        />
        <select
          className="field product"
          aria-label={`${group.name} label type`}
          value={group.product}
          onChange={(event) => dispatch({ type: "updateGroup", id: group.id, patch: { product: event.target.value as LabelProduct } })}
        >
          {LABEL_PRODUCTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <span className="count">
          {labels.length} {labels.length === 1 ? "label" : "labels"}
        </span>
        <button type="button" className="text-btn" onClick={() => dispatch({ type: "duplicateGroup", id: group.id })}>
          Duplicate
        </button>
        <button type="button" className="text-btn danger" onClick={remove}>
          Delete
        </button>
      </header>

      <div className="masters">
        <div>
          <span className="field-label">Height</span>
          {heightLocked ? (
            <p className="locked-value">
              {formatMm(project.masterHeight ?? 0)} mm <em>Project</em>
            </p>
          ) : group.masterHeight == null ? (
            <button
              type="button"
              className="follow-btn"
              onClick={() =>
                dispatch({
                  type: "updateGroup",
                  id: group.id,
                  patch: { masterHeight: labels[0]?.height ?? 12 },
                })
              }
            >
              Set a group height
            </button>
          ) : (
            <div className="follow">
              <MmInput
                label={`${group.name} height`}
                value={group.masterHeight}
                min={1}
                max={2000}
                onChange={(masterHeight) => dispatch({ type: "updateGroup", id: group.id, patch: { masterHeight } })}
              />
              <span className="unit">mm</span>
              <button
                type="button"
                className="follow-btn on"
                aria-pressed
                onClick={() => dispatch({ type: "updateGroup", id: group.id, patch: { masterHeight: null } })}
              >
                On
              </button>
            </div>
          )}
        </div>
        <div>
          <span className="field-label">Typeface</span>
          <FontSelect
            label={`${group.name} typeface`}
            value={group.masterTypefaceId ?? "inter"}
            custom={custom}
            onChange={(masterTypefaceId) => dispatch({ type: "updateGroup", id: group.id, patch: { masterTypefaceId } })}
          />
        </div>
        <div>
          <span className="field-label">Font height</span>
          <div className="follow">
            <MmInput
              label={`${group.name} font height`}
              value={group.masterFontSize ?? 5}
              min={0.8}
              max={400}
              step={0.1}
              onChange={(masterFontSize) => dispatch({ type: "updateGroup", id: group.id, patch: { masterFontSize } })}
            />
            <span className="unit">mm</span>
          </div>
          <CapNote typefaceId={group.masterTypefaceId ?? "inter"} fontSize={group.masterFontSize ?? 5} fonts={fonts} />
        </div>
      </div>

      <details className="spacing">
        <summary>Inset, alignment, corners</summary>
        <div className="spacing-grid">
          <label>
            Padding
            <MmInput label={`${group.name} padding`} value={group.padding} min={0} max={80} onChange={(padding) => dispatch({ type: "updateGroup", id: group.id, patch: { padding } })} />
          </label>
          <label>
            Corner radius
            <MmInput label={`${group.name} corner radius`} value={group.radius} min={0} max={200} onChange={(radius) => dispatch({ type: "updateGroup", id: group.id, patch: { radius } })} />
          </label>
          <label>
            Tracking
            <MmInput label={`${group.name} tracking`} value={group.tracking} min={-5} max={20} step={0.01} onChange={(tracking) => dispatch({ type: "updateGroup", id: group.id, patch: { tracking } })} />
          </label>
          <label>
            Line gap
            <MmInput label={`${group.name} line gap`} value={group.lineGap} min={0} max={40} onChange={(lineGap) => dispatch({ type: "updateGroup", id: group.id, patch: { lineGap } })} />
          </label>
          <div>
            <span className="field-label">Align</span>
            <div className="segment" role="group" aria-label={`${group.name} alignment`}>
              {(["left", "center", "right"] as const).map((align) => (
                <button key={align} type="button" aria-pressed={group.align === align} onClick={() => dispatch({ type: "updateGroup", id: group.id, patch: { align } })}>
                  {align}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-label">Vertical</span>
            <div className="segment" role="group" aria-label={`${group.name} vertical alignment`}>
              {(["top", "middle", "bottom"] as const).map((vAlign) => (
                <button key={vAlign} type="button" aria-pressed={group.vAlign === vAlign} onClick={() => dispatch({ type: "updateGroup", id: group.id, patch: { vAlign } })}>
                  {vAlign}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      <div className="table-head">
        <GroupCheck ids={labels.map((label) => label.id)} selected={selected} setSelected={setSelected} />
        <span>Text</span>
        <span>Width</span>
        <span>Height</span>
        <span>Typeface</span>
        <span>Font height</span>
        <span />
      </div>
      {labels.length === 0 && <p className="empty">No labels in this group yet.</p>}
      {labels.map((label) => (
        <LabelRow
          key={label.id}
          label={label}
          resolvedLabel={resolved.find((item) => item.id === label.id)}
          art={arts.get(label.id)}
          custom={custom}
          fontsReady={fonts}
          sheetOver={sheetOver.has(label.id)}
          plateOver={plateOver.has(label.id)}
        />
      ))}

      <div className="group-add">
        <button type="button" className="btn" onClick={() => dispatch({ type: "addLabel", groupId: group.id })}>
          Add label
        </button>
        <button type="button" className="btn" onClick={() => setPasteOpen((open) => !open)} aria-expanded={pasteOpen}>
          Paste list
        </button>
      </div>
      {pasteOpen && (
        <form
          className="paste"
          onSubmit={(event) => {
            event.preventDefault();
            const rows = parseLabelList(paste);
            if (rows.length === 0) return;
            dispatch({ type: "pasteLabels", groupId: group.id, rows });
            setPaste("");
            setPasteOpen(false);
          }}
        >
          <textarea
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder={"ON, 40\nRESET, 60, 14\nHELLO, WORLD, 70"}
            aria-label={`Paste labels into ${group.name}`}
            rows={4}
          />
          <p>One label per line. Text, then width, then an optional height. Commas or tabs.</p>
          <button type="submit" className="btn">
            Add these labels
          </button>
        </form>
      )}
    </section>
  );
}

function CapNote({ typefaceId, fontSize, fonts }: { typefaceId: string; fontSize: number; fonts: Map<string, import("opentype.js").Font> }) {
  const font = fonts.get(typefaceId);
  const cap = font ? capHeightMm(font, fontSize) : null;
  if (cap == null) return null;
  return <p className="cap">Cap height {formatMm(cap)} mm</p>;
}

function GroupCheck({
  ids,
  selected,
  setSelected,
}: {
  ids: string[];
  selected: Set<string>;
  setSelected: (ids: Set<string>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = ids.some((id) => selected.has(id));
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some && !all;
  }, [some, all]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select every label in this group"
      checked={all}
      onChange={() => {
        const next = new Set(selected);
        if (all) ids.forEach((id) => next.delete(id));
        else ids.forEach((id) => next.add(id));
        setSelected(next);
      }}
    />
  );
}

function LabelRow({
  label,
  resolvedLabel,
  art,
  custom,
  fontsReady,
  sheetOver,
  plateOver,
}: {
  label: Label;
  resolvedLabel: ResolvedLabel | undefined;
  art: LabelArt | undefined;
  custom: CustomFont[];
  fontsReady: Map<string, import("opentype.js").Font>;
  sheetOver: boolean;
  plateOver: boolean;
}) {
  const { dispatch, selected, toggleSelected } = useStore();
  const { pending, failed } = useFonts();
  if (!resolvedLabel) return null;
  const resolved = resolvedLabel;
  const faceState = pending.has(resolved.typefaceId)
    ? "loading"
    : failed.has(resolved.typefaceId)
      ? "failed"
      : fontsReady.has(resolved.typefaceId)
        ? "ready"
        : "missing";
  const issues = issuesFor(resolved, art, faceState, custom, sheetOver, plateOver);
  const on = selected.has(label.id);
  const joined = label.layout.kind === "join";
  const pieces = orderedPieceIds(label.layout).flatMap((id) => {
    const piece = label.pieces.find((item) => item.id === id);
    return piece ? [piece] : [];
  });
  const only = pieces.length === 1 ? pieces[0] : undefined;

  return (
    <div className={on ? "label-block on" : "label-block"} data-row-id={label.id}>
      <div
        className="row"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("input, select, textarea, button")) return;
          toggleSelected(label.id, event.shiftKey, event.metaKey || event.ctrlKey);
        }}
      >
        <input
          type="checkbox"
          aria-label={`Select ${label.text || "empty label"}`}
          checked={on}
          onChange={(event) => toggleSelected(label.id, event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey, true)}
        />
        {only ? (
          <textarea
            className="field text"
            rows={Math.min(4, Math.max(1, only.lines.length))}
            aria-label="Label text"
            value={pieceText(only)}
            onFocus={() => {
              if (!on) toggleSelected(label.id, false, false);
            }}
            onChange={(event) => dispatch({ type: "setPieceText", labelId: label.id, pieceId: only.id, text: event.target.value })}
          />
        ) : (
          <p className="summary">{label.text || "Combined label"}</p>
        )}
        <div className="metric">
          <MmInput
            label={`Width of ${label.text || "label"}`}
            value={label.width}
            min={1}
            max={2000}
            onChange={(width) => dispatch({ type: "updateLabel", id: label.id, patch: { width } })}
          />
          <span className="unit">mm</span>
        </div>
        <Measure
          linked={resolved.heightSource !== "label"}
          value={resolved.height}
          label={`Height of ${label.text || "label"}`}
          followLabel={resolved.heightSource === "project" ? "Using the project height. Set this label alone." : "Using the group height. Set this label alone."}
          ownLabel="Using this label’s height. Follow the group again."
          onToggle={() =>
            dispatch({
              type: "updateLabel",
              id: label.id,
              patch:
                label.heightMode === "group"
                  ? { heightMode: "custom", height: resolved.height }
                  : { heightMode: "group" },
            })
          }
          onChange={(height) => dispatch({ type: "updateLabel", id: label.id, patch: { height, heightMode: "custom" } })}
        />
        <div className="face-cell">
          {resolved.typefaceSource === "group" ? (
            <span className="follow-read" title={fontName(resolved.typefaceId, custom)}>
              {fontName(resolved.typefaceId, custom)}
            </span>
          ) : (
            <FontSelect
              label={`Typeface of ${label.text || "label"}`}
              value={label.typefaceId}
              custom={custom}
              onChange={(typefaceId) => dispatch({ type: "updateLabel", id: label.id, patch: { typefaceId, typefaceMode: "custom" } })}
            />
          )}
          <FollowButton
            linked={resolved.typefaceSource === "group"}
            label={resolved.typefaceSource === "group" ? "Using the group typeface. Set this label alone." : "Using this label’s typeface. Follow the group again."}
            onToggle={() =>
              dispatch({
                type: "updateLabel",
                id: label.id,
                patch:
                  label.typefaceMode === "group"
                    ? { typefaceMode: "custom", typefaceId: resolved.typefaceId }
                    : { typefaceMode: "group" },
              })
            }
          />
        </div>
        <Measure
          linked={resolved.fontSizeSource !== "label"}
          value={resolved.fontSize}
          label={`Font height of ${label.text || "label"}`}
          min={0.8}
          followLabel="Using the group font height. Set this label alone."
          ownLabel="Using this label’s font height. Follow the group again."
          onToggle={() =>
            dispatch({
              type: "updateLabel",
              id: label.id,
              patch:
                label.fontSizeMode === "group"
                  ? { fontSizeMode: "custom", fontSize: resolved.fontSize }
                  : { fontSizeMode: "group" },
            })
          }
          onChange={(fontSize) => dispatch({ type: "updateLabel", id: label.id, patch: { fontSize, fontSizeMode: "custom" } })}
        />
        <div className="row-actions">
          <button type="button" aria-label="Move up" onClick={() => dispatch({ type: "reorderLabel", id: label.id, direction: -1 })}>
            ↑
          </button>
          <button type="button" aria-label="Move down" onClick={() => dispatch({ type: "reorderLabel", id: label.id, direction: 1 })}>
            ↓
          </button>
          <button type="button" aria-label="Duplicate label" onClick={() => dispatch({ type: "duplicateLabels", ids: [label.id] })}>
            +
          </button>
          <button type="button" aria-label="Delete label" onClick={() => dispatch({ type: "deleteLabels", ids: [label.id] })}>
            ×
          </button>
        </div>
      </div>
      <div className="composition">
        {joined && (
          <div className="piece-head">
            <span>One cut outline. Separate undoes the last join.</span>
            <button type="button" className="text-btn" onClick={() => dispatch({ type: "separate", id: label.id })}>
              Separate
            </button>
          </div>
        )}
        {pieces.map((piece, pieceIndex) => (
          <div key={piece.id} className="piece">
            {joined && (
              <textarea
                className="field text"
                rows={Math.min(4, Math.max(1, piece.lines.length))}
                aria-label={`Text of part ${pieceIndex + 1}`}
                value={pieceText(piece)}
                onFocus={() => {
                  if (!on) toggleSelected(label.id, false, false);
                }}
                onChange={(event) => dispatch({ type: "setPieceText", labelId: label.id, pieceId: piece.id, text: event.target.value })}
              />
            )}
            {piece.lines.map((line, index) => {
              const resolvedLine = resolved.pieces.find((item) => item.id === piece.id)?.lines[index];
              if (!resolvedLine) return null;
              return (
                <LineEdit
                  key={`${piece.id}-${index}`}
                  labelId={label.id}
                  piece={piece}
                  line={line}
                  index={index}
                  resolvedLine={resolvedLine}
                  partLabel={joined ? `Part ${pieceIndex + 1}, line ${index + 1}` : `Line ${index + 1}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      {issues.length > 0 && <p className="issue">{issues.join(" ")}</p>}
    </div>
  );
}

function LineEdit({
  labelId,
  piece,
  line,
  index,
  resolvedLine,
  partLabel,
}: {
  labelId: string;
  piece: LabelPiece;
  line: LabelLine;
  index: number;
  resolvedLine: ResolvedLine;
  partLabel: string;
}) {
  const { dispatch } = useStore();
  const ownSize = line.fontSize != null;
  const ownAlign = line.align != null;
  return (
    <div className="line-edit">
      <span className="line-name" title={line.text}>
        {partLabel}
      </span>
      <div className="follow">
        {ownSize ? (
          <MmInput
            label={`${partLabel} font height`}
            value={line.fontSize ?? resolvedLine.fontSize}
            min={0.8}
            max={400}
            onChange={(fontSize) =>
              dispatch({ type: "updateLine", labelId, pieceId: piece.id, index, patch: { fontSize } })
            }
          />
        ) : (
          <span className="follow-read">{formatMm(resolvedLine.fontSize)}</span>
        )}
        <span className="unit">mm</span>
        <FollowButton
          linked={!ownSize}
          linkedText="Label"
          label={ownSize ? "Using this line’s font height. Follow the label again." : "Using the label font height. Set this line alone."}
          onToggle={() =>
            dispatch({
              type: "updateLine",
              labelId,
              pieceId: piece.id,
              index,
              patch: { fontSize: ownSize ? null : resolvedLine.fontSize },
            })
          }
        />
      </div>
      <div className="segment" role="group" aria-label={`${partLabel} alignment`}>
        {(["left", "center", "right"] as const).map((align) => (
          <button
            key={align}
            type="button"
            aria-pressed={resolvedLine.align === align}
            onClick={() =>
              dispatch({
                type: "updateLine",
                labelId,
                pieceId: piece.id,
                index,
                patch: { align: line.align === align ? null : align },
              })
            }
          >
            {align.slice(0, 1).toUpperCase()}
          </button>
        ))}
      </div>
      <FollowButton
        linked={!ownAlign}
        label={ownAlign ? "Using this line’s alignment. Follow the group again." : "Using the group alignment. Set this line alone."}
        onToggle={() =>
          dispatch({
            type: "updateLine",
            labelId,
            pieceId: piece.id,
            index,
            patch: { align: ownAlign ? null : resolvedLine.align },
          })
        }
      />
    </div>
  );
}

function Measure({
  linked,
  value,
  label,
  followLabel,
  ownLabel,
  onToggle,
  onChange,
  min = 1,
}: {
  linked: boolean;
  value: number;
  label: string;
  followLabel: string;
  ownLabel: string;
  onToggle: () => void;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <div className="follow">
      {linked ? (
        <span className="follow-read">{formatMm(value)}</span>
      ) : (
        <MmInput label={label} value={value} min={min} max={min === 0.8 ? 400 : 2000} onChange={onChange} />
      )}
      <FollowButton linked={linked} label={linked ? followLabel : ownLabel} onToggle={onToggle} />
    </div>
  );
}

function issuesFor(
  label: ResolvedLabel,
  art: LabelArt | undefined,
  faceState: "ready" | "loading" | "failed" | "missing",
  custom: CustomFont[],
  sheetOver: boolean,
  plateOver: boolean,
): string[] {
  const issues = labelIssues(label, art, false);
  if (faceState === "loading") issues.unshift(`Loading ${fontName(label.typefaceId, custom)}…`);
  else if (faceState === "failed") issues.unshift("This typeface did not load. Inter is used instead.");
  else if (!art && label.text.trim()) issues.unshift("Typeface is not ready yet.");
  else if (faceState === "missing") issues.unshift("This typeface is not loaded. Inter is used instead.");
  if (sheetOver) issues.push("Larger than the print sheet.");
  if (plateOver) issues.push("Larger than the build plate.");
  return issues;
}
