import { useEffect, useState } from "react";
import type { Edge } from "../types";
import { clamp } from "../model/format";
import { useStore } from "../state/store";
import { useFonts } from "../state/fonts";
import { FontSelect, MmInput } from "./fields";
import { GroupCard } from "./GroupCard";

export function Editor() {
  const { project, dispatch, selected, setSelected } = useStore();
  const { custom } = useFonts();
  const ids = [...selected];
  const [bulkFace, setBulkFace] = useState("inter");
  const [targetId, setTargetId] = useState("");
  const targets = project.labels.filter((label) => !selected.has(label.id));
  const target = targets.some((label) => label.id === targetId) ? targetId : "";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [role=dialog]")) return;
      if (document.querySelector("[role=dialog]")) return;
      const chosen = [...selected];
      if (chosen.length === 0) return;
      event.preventDefault();
      if (chosen.length > 1 && !window.confirm(`Delete ${chosen.length} labels?`)) return;
      dispatch({ type: "deleteLabels", ids: chosen });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, selected]);

  return (
    <div className="editor">
      <section className="project-master">
        <div>
          <h2>Master height</h2>
          <p>One height for every group. A label can still keep its own.</p>
        </div>
        <div className="follow">
          <button
            type="button"
            className={project.masterHeight != null ? "lock on" : "lock"}
            aria-pressed={project.masterHeight != null}
            onClick={() =>
              dispatch({
                type: "setMasterHeight",
                height: project.masterHeight == null ? (project.groups[0]?.masterHeight ?? 12) : null,
              })
            }
          >
            {project.masterHeight != null ? "On for every group" : "Off"}
          </button>
          {project.masterHeight != null && (
            <>
              <MmInput
                label="Master height for every group"
                value={project.masterHeight}
                min={1}
                max={2000}
                onChange={(height) => dispatch({ type: "setMasterHeight", height })}
              />
              <span className="unit">mm</span>
            </>
          )}
        </div>
      </section>

      {project.groups.map((group, index) => (
        <GroupCard key={group.id} group={group} index={index} />
      ))}

      <button type="button" className="btn add-group" onClick={() => dispatch({ type: "addGroup" })}>
        Add group
      </button>

      {ids.length > 0 && (
        <div className="bulk" role="region" aria-label="Selected labels">
          <strong>
            {ids.length} selected
          </strong>
          <ApplyNumber
            label="Width"
            min={1}
            max={2000}
            onApply={(width) => dispatch({ type: "bulk", ids, patch: { width } })}
          />
          <ApplyNumber
            label="Height"
            min={1}
            max={2000}
            onApply={(height) => dispatch({ type: "bulk", ids, patch: { height, heightMode: "custom" } })}
          />
          <ApplyNumber
            label="Font height"
            min={0.8}
            max={400}
            onApply={(fontSize) => dispatch({ type: "bulk", ids, patch: { fontSize, fontSizeMode: "custom" } })}
          />
          <label className="bulk-face">
            Typeface
            <FontSelect
              label="Typeface for selected labels"
              value={bulkFace}
              custom={custom}
              onChange={(typefaceId) => {
                setBulkFace(typefaceId);
                dispatch({ type: "bulk", ids, patch: { typefaceId, typefaceMode: "custom" } });
              }}
            />
          </label>
          <label>
            Move to
            <select
              className="field"
              aria-label="Move selected labels to a group"
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                dispatch({ type: "moveLabels", ids, groupId: event.target.value });
              }}
            >
              <option value="">Choose</option>
              {project.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: "bulk",
                ids,
                patch: { heightMode: "group", typefaceMode: "group", fontSizeMode: "group" },
              })
            }
          >
            Follow groups
          </button>
          <div className="attach-set">
            <label>
              Attach selected to
              <select
                className="field"
                aria-label="Label that receives the selected labels"
                value={target}
                onChange={(event) => setTargetId(event.target.value)}
              >
                <option value="">Choose a label</option>
                {targets.map((label) => {
                  const group = project.groups.find((item) => item.id === label.groupId);
                  return (
                    <option key={label.id} value={label.id}>
                      {(label.text || "Empty").slice(0, 40)}
                      {group ? ` · ${group.name}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="attach" role="group" aria-label="Edge to attach on">
              {(["top", "right", "bottom", "left"] as const satisfies readonly Edge[]).map((edge) => (
                <button
                  key={edge}
                  type="button"
                  disabled={!target}
                  onClick={() => {
                    if (!target) return;
                    dispatch({ type: "combine", targetId: target, guestIds: ids, edge });
                    setSelected(new Set([target]));
                  }}
                >
                  {edge}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => dispatch({ type: "duplicateLabels", ids })}>
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              if (ids.length > 1 && !window.confirm(`Delete ${ids.length} labels?`)) return;
              dispatch({ type: "deleteLabels", ids });
              setSelected(new Set());
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ApplyNumber({ label, min, max, onApply }: { label: string; min: number; max: number; onApply: (value: number) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const value = Number(text);
        if (!Number.isFinite(value)) return;
        onApply(clamp(value, min, max));
        setText("");
      }}
    >
      <label>
        {label}
        <input className="field" inputMode="decimal" aria-label={`${label} for selected labels`} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <button type="submit">Set</button>
    </form>
  );
}
