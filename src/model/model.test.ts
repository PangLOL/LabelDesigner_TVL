import { readFileSync } from "node:fs";
import { parse } from "opentype.js";
import { describe, expect, it } from "vitest";
import { LUBAN_UNITS_PER_MM } from "../types";
import { renderLabelSvg, renderPlateSvg, renderSheetSvg } from "../export/svg";
import { BUILTIN_FONTS } from "./fonts";
import { formatNum, parseLabelList, roundedRectPath, transformPath } from "./format";
import { paginate } from "./layout";
import { reducer } from "./reducer";
import { resolveAll } from "./resolve";
import { sampleProject } from "./sample";
import { buildLabelArt } from "./text";
import type { ResolvedLabel } from "./resolve";
import type { Font } from "opentype.js";

function loadFont(file: string): Font {
  const buf = readFileSync(file);
  return parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const inter = loadFont("public/fonts/inter-semibold.woff");
const mono = loadFont("public/fonts/plex-mono.woff");

function box(partial: Partial<ResolvedLabel> & Pick<ResolvedLabel, "text" | "width" | "height" | "fontSize">): ResolvedLabel {
  return {
    id: partial.id ?? "id",
    groupId: "g",
    groupName: "Group",
    groupIndex: 0,
    text: partial.text,
    width: partial.width,
    height: partial.height,
    typefaceId: "inter-semibold",
    fontSize: partial.fontSize,
    padding: partial.padding ?? 1.4,
    align: partial.align ?? "center",
    vAlign: partial.vAlign ?? "middle",
    radius: partial.radius ?? 0,
    tracking: partial.tracking ?? 0,
    lineGap: partial.lineGap ?? 0.4,
    heightSource: "label",
    typefaceSource: "label",
    fontSizeSource: "label",
  };
}

describe("Traditional Chinese faces", () => {
  it("lists Noto Sans CJK TC Bold and the other weights", () => {
    const names = BUILTIN_FONTS.filter((font) => font.family === "Noto Sans CJK TC").map((font) => font.name);
    expect(names).toEqual([
      "Noto Sans CJK TC Thin",
      "Noto Sans CJK TC Light",
      "Noto Sans CJK TC DemiLight",
      "Noto Sans CJK TC Regular",
      "Noto Sans CJK TC Medium",
      "Noto Sans CJK TC Bold",
      "Noto Sans CJK TC Black",
    ]);
    expect(BUILTIN_FONTS.find((font) => font.id === "noto-sans-cjk-tc-bold")?.defer).toBe(true);
  });

  it("draws a Traditional Chinese label in Noto Sans CJK TC Bold", () => {
    const font = loadFont("public/fonts/cjk/NotoSansTC-Bold.otf");
    const art = buildLabelArt(font, box({ text: "傳統中文標籤", width: 70, height: 16, fontSize: 8, padding: 1 }));
    expect(art.missing).toEqual([]);
    expect(art.overflow).toBe(false);
    expect(art.textPath.length).toBeGreaterThan(100);
  });
});

describe("parseLabelList", () => {
  it("reads width and height from the end of a line", () => {
    const rows = parseLabelList("ON, 40\nHELLO, WORLD, 60, 14\nRESET\t52\t18 mm\n# comment\n");
    expect(rows).toEqual([
      { text: "ON", width: 40, height: undefined },
      { text: "HELLO, WORLD", width: 60, height: 14 },
      { text: "RESET", width: 52, height: 18 },
    ]);
  });
});

describe("inheritance", () => {
  it("uses the project height, then the group, then the label", () => {
    const project = sampleProject();
    const on = resolveAll(project).find((label) => label.id === "on");
    const hold = resolveAll(project).find((label) => label.id === "hold");
    const fuse = resolveAll(project).find((label) => label.id === "fuse");
    expect(on).toMatchObject({ height: 12, heightSource: "group", fontSize: 5, typefaceId: "inter-semibold" });
    expect(hold).toMatchObject({ height: 18, heightSource: "label", fontSizeSource: "group" });
    expect(fuse).toMatchObject({ height: 14, typefaceId: "inter-semibold", typefaceSource: "label", fontSize: 4.5 });

    const locked = reducer(project, { type: "setMasterHeight", height: 10 });
    const again = resolveAll(locked);
    expect(again.find((label) => label.id === "on")?.height).toBe(10);
    expect(again.find((label) => label.id === "hold")?.height).toBe(18);
    expect(locked.groups.every((group) => group.masterHeight === 10)).toBe(true);
    expect(locked.labels.find((label) => label.id === "on")?.height).toBe(10);
  });
});

describe("paginate", () => {
  it("wraps rows and pages without stretching a label", () => {
    const labels = [1, 2, 3, 4].map((index) =>
      box({ id: String(index), text: "A", width: 40, height: 20, fontSize: 5, padding: 0 }),
    );
    const pages = paginate(labels, {
      width: 100,
      height: 30,
      margin: 0,
      gap: 0,
      showDimensions: false,
      bottomInset: 0,
    });
    expect(pages).toHaveLength(2);
    expect(pages[0].placements.map((item) => item.label.id)).toEqual(["1", "2"]);
    expect(pages[1].placements.map((item) => [item.x, item.y])).toEqual([
      [0, 0],
      [40, 0],
    ]);
    expect(pages[0].placements.every((item) => !item.oversized)).toBe(true);
  });

  it("puts a label larger than the page on its own sheet", () => {
    const pages = paginate([box({ text: "BIG", width: 120, height: 10, fontSize: 4 })], {
      width: 100,
      height: 40,
      margin: 0,
      gap: 0,
      showDimensions: false,
      bottomInset: 0,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].placements[0]?.oversized).toBe(true);
  });
});

describe("label art", () => {
  it("centers cap-height ink in the label", () => {
    const label = box({ text: "ON", width: 32, height: 12, fontSize: 5 });
    const art = buildLabelArt(inter, label);
    expect(art.textPath.length).toBeGreaterThan(20);
    expect(art.overflow).toBe(false);
    const mid = ((art.inkTop ?? 0) + (art.inkBottom ?? 0)) / 2;
    expect(Math.abs(mid - label.height / 2)).toBeLessThan(0.25);
  });

  it("flags a line that is wider than the label", () => {
    const emergency = resolveAll(sampleProject()).find((label) => label.id === "emergency");
    expect(emergency).toBeTruthy();
    expect(buildLabelArt(inter, emergency!).overflow).toBe(true);
  });
});

describe("paths and svg", () => {
  it("scales coordinates and leaves arc flags untouched", () => {
    const scaled = transformPath("M0 0H10V5H0Z", 2, 3, 2);
    expect(scaled).toBe("M4 6H24V16H4Z");
    const arc = transformPath(roundedRectPath(40, 12, 2), 0, 0, 2);
    expect(arc).toContain("A4 4 0 0 1");
  });

  it("writes millimetre and Luban 72 DPI documents at the label size", () => {
    const label = box({ text: "ON", width: 32, height: 12, fontSize: 5 });
    const art = buildLabelArt(inter, label);
    const mm = renderLabelSvg(label, art, "mm", true, "cut");
    expect(mm).toContain('width="32mm"');
    expect(mm).toContain('height="12mm"');
    expect(mm).toContain('viewBox="0 0 32 12"');
    expect(mm).toContain('stroke="#ff0000"');
    expect(mm).not.toContain("vector-effect");

    const luban = renderLabelSvg(label, art, "luban72", false, "engrave");
    const width = formatNum(32 * LUBAN_UNITS_PER_MM);
    const height = formatNum(12 * LUBAN_UNITS_PER_MM);
    expect(luban).toContain(`width="${width}px"`);
    expect(luban).toContain(`height="${height}px"`);
    expect(luban).toContain(`viewBox="0 0 ${width} ${height}"`);
    expect(luban).not.toContain("#ff0000");
    expect(luban).toContain('data-width-mm="32"');
  });

  it("keeps dimension marks off the machine plate", () => {
    const label = box({ text: "ON", width: 32, height: 12, fontSize: 5 });
    const art = buildLabelArt(inter, label);
    const plate = renderPlateSvg(
      { placements: [{ label, x: 8, y: 8, oversized: false }] },
      160,
      160,
      "luban72",
      true,
      "cut",
      new Map([[label.id, art]]),
      { preview: false },
    );
    expect(plate).toContain('data-width-mm="160"');
    expect(plate).not.toContain("Print at actual size");
    expect(plate).not.toContain("vector-effect");
    expect(plate).toContain('stroke="#ff0000"');

    const sheet = renderSheetSvg(
      { placements: [{ label, x: 14, y: 14, oversized: false }] },
      210,
      297,
      new Map([[label.id, art]]),
      mono,
      { preview: false, showDimensions: true, showCalibration: true },
    );
    expect(sheet).toContain('width="210mm"');
    expect(sheet).toContain('height="297mm"');
    expect(sheet).not.toContain("vector-effect");
    expect(sheet).not.toContain('fill="#fffcf7"');
  });
});
