import { useEffect, useState } from "react";
import { BUILTIN_FONTS, FONT_GROUPS } from "../model/fonts";
import { clamp, formatMm } from "../model/format";
import type { CustomFont } from "../state/fonts";

interface MmInputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  label: string;
  step?: number;
}

export function MmInput({ value, onChange, min, max, disabled, label, step = 0.1 }: MmInputProps) {
  const [text, setText] = useState(() => formatMm(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatMm(value));
  }, [value, focused]);

  const commit = (nextText: string) => {
    const parsed = Number(nextText);
    if (!Number.isFinite(parsed)) {
      setText(formatMm(value));
      return;
    }
    const next = clamp(parsed, min, max);
    setText(formatMm(next));
    if (next !== value) onChange(next);
  };

  return (
    <input
      className="field"
      inputMode="decimal"
      aria-label={label}
      disabled={disabled}
      value={text}
      onFocus={(event) => {
        setFocused(true);
        event.currentTarget.select();
      }}
      onBlur={() => {
        setFocused(false);
        commit(text);
      }}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const delta = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 1 : step);
        const next = clamp(Math.round((value + delta) * 1000) / 1000, min, max);
        onChange(next);
        setText(formatMm(next));
      }}
    />
  );
}

export function FontSelect({
  value,
  onChange,
  custom,
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  custom: CustomFont[];
  label: string;
}) {
  const known = BUILTIN_FONTS.some((font) => font.id === value) || custom.some((font) => font.id === value);
  return (
    <select className="field face" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {!known && <option value={value}>Missing font</option>}
      {FONT_GROUPS.map((group) => (
        <optgroup key={group} label={group}>
          {BUILTIN_FONTS.filter((font) => font.group === group).map((font) => (
            <option key={font.id} value={font.id}>
              {font.name}
            </option>
          ))}
        </optgroup>
      ))}
      {custom.length > 0 && (
        <optgroup label="Added">
          {custom.map((font) => (
            <option key={font.id} value={font.id}>
              {font.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function FollowButton({ linked, onToggle, label }: { linked: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      className={linked ? "follow-btn on" : "follow-btn"}
      aria-pressed={linked}
      aria-label={label}
      onClick={onToggle}
    >
      {linked ? "Group" : "Own"}
    </button>
  );
}
