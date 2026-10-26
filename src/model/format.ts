export function formatNum(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

export function formatMm(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function slug(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return cleaned.slice(0, 48) || "label";
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ParsedLabelRow {
  text: string;
  width: number;
  height?: number;
}

function parseMeasure(token: string): number | null {
  const match = token.trim().match(/^(-?\d+(?:\.\d+)?)(?:\s*mm)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** Lines of `text, width` or `text, width, height`. Tabs work the same way. */
export function parseLabelList(raw: string): ParsedLabelRow[] {
  const rows: ParsedLabelRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const tabbed = trimmed.includes("\t");
    const parts = (tabbed ? trimmed.split("\t") : trimmed.split(",")).map((part) => part.trim());
    const measures: number[] = [];
    while (parts.length > 1 && measures.length < 2) {
      const value = parseMeasure(parts[parts.length - 1] ?? "");
      if (value == null || value <= 0) break;
      parts.pop();
      measures.unshift(value);
    }
    const text = parts.join(tabbed ? " " : ", ").trim();
    if (!text) continue;
    rows.push({
      text,
      width: measures[0] ?? 40,
      height: measures[1],
    });
  }
  return rows;
}

type PathToken = string | number;

function tokenizePath(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  const re = /[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d))) {
    const token = match[0];
    tokens.push(/[a-zA-Z]/.test(token) ? token : Number(token));
  }
  return tokens;
}

/**
 * Translate a path by (tx, ty) in its own units, then scale.
 * Output commands are absolute. Arc flags are left alone.
 */
export function transformPath(d: string, tx: number, ty: number, scale: number): string {
  if (!d) return "";
  const tokens = tokenizePath(d);
  let index = 0;
  let command = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let out = "";

  const take = (): number => {
    const token = tokens[index++];
    return typeof token === "number" ? token : 0;
  };

  const emit = (cmd: string, values: number[]) => {
    out += cmd + values.map(formatNum).join(" ");
  };

  const place = (x: number, y: number): [number, number] => [(x + tx) * scale, (y + ty) * scale];

  while (index < tokens.length) {
    const token = tokens[index];
    if (typeof token === "string") {
      command = token;
      index += 1;
    }
    if (!command) break;
    const relative = command === command.toLowerCase();
    const kind = command.toUpperCase();

    if (kind === "Z") {
      out += "Z";
      cx = sx;
      cy = sy;
      continue;
    }

    if (kind === "M" || kind === "L" || kind === "T") {
      const x = take();
      const y = take();
      const ax = relative ? cx + x : x;
      const ay = relative ? cy + y : y;
      emit(kind, place(ax, ay));
      cx = ax;
      cy = ay;
      if (kind === "M") {
        sx = ax;
        sy = ay;
        command = relative ? "l" : "L";
      }
      continue;
    }

    if (kind === "H") {
      const x = take();
      const ax = relative ? cx + x : x;
      emit("H", [place(ax, cy)[0]]);
      cx = ax;
      continue;
    }

    if (kind === "V") {
      const y = take();
      const ay = relative ? cy + y : y;
      emit("V", [place(cx, ay)[1]]);
      cy = ay;
      continue;
    }

    if (kind === "Q") {
      const x1 = take();
      const y1 = take();
      const x = take();
      const y = take();
      const ax1 = relative ? cx + x1 : x1;
      const ay1 = relative ? cy + y1 : y1;
      const ax = relative ? cx + x : x;
      const ay = relative ? cy + y : y;
      const [ox1, oy1] = place(ax1, ay1);
      const [ox, oy] = place(ax, ay);
      emit("Q", [ox1, oy1, ox, oy]);
      cx = ax;
      cy = ay;
      continue;
    }

    if (kind === "S") {
      const x2 = take();
      const y2 = take();
      const x = take();
      const y = take();
      const ax2 = relative ? cx + x2 : x2;
      const ay2 = relative ? cy + y2 : y2;
      const ax = relative ? cx + x : x;
      const ay = relative ? cy + y : y;
      const [ox2, oy2] = place(ax2, ay2);
      const [ox, oy] = place(ax, ay);
      emit("S", [ox2, oy2, ox, oy]);
      cx = ax;
      cy = ay;
      continue;
    }

    if (kind === "C") {
      const x1 = take();
      const y1 = take();
      const x2 = take();
      const y2 = take();
      const x = take();
      const y = take();
      const points = [x1, y1, x2, y2, x, y].map((value, i) => {
        if (i % 2 === 0) return relative ? cx + value : value;
        return relative ? cy + value : value;
      });
      const placed = [
        ...place(points[0], points[1]),
        ...place(points[2], points[3]),
        ...place(points[4], points[5]),
      ];
      emit("C", placed);
      cx = points[4];
      cy = points[5];
      continue;
    }

    if (kind === "A") {
      const rx = take();
      const ry = take();
      const rotation = take();
      const large = take();
      const sweep = take();
      const x = take();
      const y = take();
      const ax = relative ? cx + x : x;
      const ay = relative ? cy + y : y;
      const [ox, oy] = place(ax, ay);
      emit("A", [Math.abs(rx) * scale, Math.abs(ry) * scale, rotation, large, sweep, ox, oy]);
      cx = ax;
      cy = ay;
      continue;
    }

    break;
  }

  return out.trim();
}

export function roundedRectPath(width: number, height: number, radius: number): string {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r <= 0) return `M0 0H${formatNum(w)}V${formatNum(h)}H0Z`;
  const rr = formatNum(r);
  return [
    `M${rr} 0`,
    `H${formatNum(w - r)}`,
    `A${rr} ${rr} 0 0 1 ${formatNum(w)} ${rr}`,
    `V${formatNum(h - r)}`,
    `A${rr} ${rr} 0 0 1 ${formatNum(w - r)} ${formatNum(h)}`,
    `H${rr}`,
    `A${rr} ${rr} 0 0 1 0 ${formatNum(h - r)}`,
    `V${rr}`,
    `A${rr} ${rr} 0 0 1 ${rr} 0`,
    "Z",
  ].join("");
}
