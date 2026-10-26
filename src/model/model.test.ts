import { readFileSync } from "node:fs";
import { parse } from "opentype.js";
import { describe, expect, it } from "vitest";
import { LUBAN_UNITS_PER_MM } from "../types";
import { projectToCsv } from "../export/csv";
import { renderLabelSvg, renderPlateSvg, renderSheetSvg } from "../export/svg";
import { BUILTIN_FONTS } from "./fonts";
import { formatNum, parseLabelList, roundedRectPath, transformPath } from "./format";
import { paginate } from "./layout";
import { blankProject } from "./project";
import { reducer } from "./reducer";
import { resolveAll } from "./resolve";
import { joinLayouts, joinedSize, separateParts } from "./compose";
import { buildLabelArt } from "./text";
import type { ResolvedLabel } from "./resolve";
import type { Label } from "../types";
import type { Font } from "opentype.js";

function loadFont(file: string): Font {
  const buf = readFileSync(file);
  return parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const inter = loadFont("public/fonts/inter-semibold.woff");
const mono = loadFont("public/fonts/plex-mono.woff");

function box(partial: Partial<ResolvedLabel> & Pick<ResolvedLabel, "text" | "width" | "height" | "fontSize">): ResolvedLabel {
  const lines = partial.pieces?.[0]?.lines ?? partial.text.split("\n").map((text) => ({ text, fontSize: partial.fontSize, align: partial.align ?? "center" as const }));
  return {
    id: partial.id ?? "id",
    groupId: partial.groupId ?? "g",
    groupName: partial.groupName ?? "Group",
    groupIndex: partial.groupIndex ?? 0,
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
    pieces: partial.pieces ?? [{ id: "p", lines }],
    layout: partial.layout ?? { kind: "piece", pieceId: "p" },
    heightSource: "label",
    typefaceSource: "label",
    fontSizeSource: "label",
  };
}

function leaf(id: string, text: string, width: number, height: number): Label {
  return {
    id,
    groupId: "g",
    text,
    width,
    height,
    heightMode: "custom",
    typefaceId: "inter",
    typefaceMode: "custom",
    fontSize: 5,
    fontSizeMode: "custom",
    pieces: [{ id: `${id}-piece`, lines: [{ text, fontSize: null, align: null }] }],
    layout: { kind: "piece", pieceId: `${id}-piece` },
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
    const grouped = leaf("on", "ON", 32, 12);
    grouped.heightMode = "group";
    grouped.fontSizeMode = "group";
    grouped.typefaceMode = "group";
    const ownHeight = leaf("hold", "HOLD", 40, 18);
    ownHeight.fontSizeMode = "group";
    const ownFace = leaf("fuse", "FUSE", 40, 14);
    ownFace.heightMode = "group";
    ownFace.typefaceMode = "custom";
    ownFace.typefaceId = "inter-semibold";
    ownFace.fontSizeMode = "custom";
    ownFace.fontSize = 4.5;
    const project = {
      version: 1 as const,
      name: "Test",
      masterHeight: null,
      groups: [
        {
          id: "g",
          name: "Group",
          masterHeight: 12,
          masterTypefaceId: "inter-semibold",
          masterFontSize: 5,
          padding: 1.4,
          align: "center" as const,
          vAlign: "middle" as const,
          radius: 0,
          tracking: 0,
          lineGap: 0.4,
        },
      ],
      labels: [grouped, ownHeight, ownFace],
      sheet: { preset: "a4" as const, width: 210, height: 297, margin: 14, gap: 6, showDimensions: true, showCalibration: true },
      plate: { preset: "a350" as const, width: 320, height: 350, margin: 8, gap: 4, outline: true, outlineMode: "cut" as const },
    };
    const on = resolveAll(project).find((label) => label.id === "on");
    const hold = resolveAll(project).find((label) => label.id === "hold");
    const fuse = resolveAll(project).find((label) => label.id === "fuse");
    expect(on).toMatchObject({ height: 12, heightSource: "group", fontSize: 5, typefaceId: "inter-semibold" });
    expect(hold).toMatchObject({ height: 18, heightSource: "label", fontSizeSource: "group" });
    expect(fuse).toMatchObject({ height: 12, typefaceId: "inter-semibold", typefaceSource: "label", fontSize: 4.5 });

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

  it("starts each group on its own row and prints the group name and height", () => {
    const labels = [
      box({ id: "a", text: "A", width: 30, height: 12, fontSize: 5, groupId: "g1", groupName: "Power", groupIndex: 0 }),
      box({ id: "b", text: "B", width: 30, height: 12, fontSize: 5, groupId: "g1", groupName: "Power", groupIndex: 0 }),
      box({ id: "c", text: "C", width: 30, height: 18, fontSize: 5, groupId: "g2", groupName: "Lights", groupIndex: 1 }),
    ];
    const frame = { width: 200, height: 120, margin: 10, gap: 4, showDimensions: false, bottomInset: 10 };
    const packed = paginate(labels, frame);
    expect(packed[0].placements.map((item) => item.y)).toEqual([10, 10, 10]);

    const pages = paginate(labels, frame, { groupRows: true });
    const [first, second, third] = pages[0].placements;
    expect(first.y).toBe(second.y);
    expect(third.y).toBeGreaterThan(first.y + first.label.height);
    expect(pages[0].headings.map((heading) => [heading.name, heading.heightText])).toEqual([
      ["Power", "12 mm"],
      ["Lights", "18 mm"],
    ]);
    expect(pages[0].headings[0].y).toBeLessThan(first.y);
    expect(pages[0].headings[1].y).toBeLessThan(third.y);

    const svg = renderSheetSvg(pages[0], 200, 120, new Map(), mono, {
      preview: true,
      showDimensions: false,
      showCalibration: false,
    });
    expect(svg).toContain('data-group-heading="Power"');
    expect(svg).toContain('data-group-heading="Lights"');
  });
});

describe("project csv", () => {
  it("lists the project, the group, and each label", () => {
    let project = blankProject();
    project = { ...project, name: "Door, west" };
    const groupId = project.groups[0].id;
    project = reducer(project, { type: "addLabel", groupId });
    const label = project.labels[0];
    project = reducer(project, { type: "setPieceText", labelId: label.id, pieceId: label.pieces[0].id, text: "UP\nDOWN" });
    project = reducer(project, { type: "updateLine", labelId: label.id, pieceId: label.pieces[0].id, index: 0, patch: { fontSize: 4 } });
    const csv = projectToCsv(project);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Door, west"');
    expect(csv).toContain("Group 1");
    expect(csv).toContain("UP | DOWN");
    expect(csv).toContain("4 | ");
    expect(csv).toContain("40");
    expect(csv).toContain("210 x 297");
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
    const emergency = box({ text: "EMERGENCY", width: 26, height: 12, fontSize: 5, padding: 1.4 });
    expect(buildLabelArt(inter, emergency).overflow).toBe(true);
  });

  it("gives each line its own height inside one label", () => {
    const label = box({
      text: "UP\nFUNCTION\nDOWN",
      width: 140,
      height: 50,
      fontSize: 5,
      padding: 1,
      pieces: [
        {
          id: "p",
          lines: [
            { text: "UP", fontSize: 4, align: "center" },
            { text: "FUNCTION", fontSize: 12, align: "center" },
            { text: "DOWN", fontSize: 4, align: "center" },
          ],
        },
      ],
    });
    const art = buildLabelArt(inter, label);
    expect(art.missing).toEqual([]);
    expect(art.overflow).toBe(false);
    expect((art.inkBottom ?? 0) - (art.inkTop ?? 0)).toBeGreaterThan(12);
  });
});

describe("combined labels", () => {
  it("joins on an edge and separates back to the same outer sizes", () => {
    const host = leaf("host", "功能", 40, 30);
    const guest = leaf("guest", "上", 40, 12);
    const size = joinedSize(host, guest, "top");
    const joined: Label = {
      ...host,
      width: size.width,
      height: size.height,
      pieces: [...host.pieces, ...guest.pieces],
      layout: joinLayouts(host.layout, guest.layout, host.height, guest.height, host.width, guest.width, "top"),
    };
    expect(joined.width).toBe(40);
    expect(joined.height).toBe(42);
    const parts = separateParts(joined);
    expect(parts?.map((part) => [part.id, part.width, part.height])).toEqual([
      [expect.any(String), 40, 12],
      ["host", 40, 30],
    ]);
  });

  it("restores each piece after two joins, including a shorter cross size", () => {
    let project = blankProject();
    const groupId = project.groups[0].id;
    project = reducer(project, { type: "addLabel", groupId });
    project = reducer(project, { type: "addLabel", groupId });
    const [up, down] = project.labels;
    project = reducer(project, { type: "updateLabel", id: up.id, patch: { width: 20, height: 8, heightMode: "custom" } });
    project = reducer(project, { type: "updateLabel", id: down.id, patch: { width: 20, height: 8, heightMode: "custom" } });
    project = reducer(project, { type: "setPieceText", labelId: up.id, pieceId: up.pieces[0].id, text: "UP" });
    project = reducer(project, { type: "setPieceText", labelId: down.id, pieceId: down.pieces[0].id, text: "DOWN" });
    project = reducer(project, { type: "updateLine", labelId: up.id, pieceId: up.pieces[0].id, index: 0, patch: { fontSize: 4, align: "left" } });
    project = reducer(project, { type: "combine", targetId: up.id, guestIds: [down.id], edge: "bottom" });
    const stack = project.labels[0];
    expect(stack).toMatchObject({ id: up.id, width: 20, height: 16, text: "UP · DOWN" });

    project = reducer(project, { type: "addLabel", groupId });
    const fn = project.labels.find((label) => label.id !== up.id);
    if (!fn) throw new Error("missing function label");
    project = reducer(project, { type: "updateLabel", id: fn.id, patch: { width: 30, height: 24, heightMode: "custom" } });
    project = reducer(project, { type: "setPieceText", labelId: fn.id, pieceId: fn.pieces[0].id, text: "FUNCTION" });
    project = reducer(project, { type: "updateLine", labelId: fn.id, pieceId: fn.pieces[0].id, index: 0, patch: { fontSize: 12 } });
    project = reducer(project, { type: "combine", targetId: fn.id, guestIds: [up.id], edge: "left" });
    expect(project.labels).toHaveLength(1);
    expect(project.labels[0]).toMatchObject({ id: fn.id, width: 50, height: 24 });

    const split = reducer(project, { type: "separate", id: fn.id });
    expect(split.labels.map((label) => [label.width, label.height, label.text])).toEqual([
      [20, 16, "UP · DOWN"],
      [30, 24, "FUNCTION"],
    ]);
    expect(split.labels[1]?.id).toBe(fn.id);
    const again = reducer(split, { type: "separate", id: split.labels[0].id });
    expect(again.labels.map((label) => [label.text, label.width, label.height])).toEqual([
      ["UP", 20, 8],
      ["DOWN", 20, 8],
      ["FUNCTION", 30, 24],
    ]);
    expect(again.labels[0]?.pieces[0]?.lines[0]).toMatchObject({ fontSize: 4, align: "left" });
    expect(again.labels[2]?.pieces[0]?.lines[0]?.fontSize).toBe(12);
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
