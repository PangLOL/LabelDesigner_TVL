import { readFileSync } from "node:fs";
import { parse } from "opentype.js";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { LUBAN_UNITS_PER_MM } from "../types";
import { groupSwatch } from "../palette";
import { isLabelCsv, projectFromCsv, projectToCsv } from "../export/csv";
import { buildSvgZip } from "../export/download";
import { renderLabelSvg, renderPlateSvg, renderSheetSvg } from "../export/svg";
import { BUILTIN_FONTS } from "./fonts";
import { formatMm, formatNum, parseLabelList, roundedRectPath, transformPath } from "./format";
import { GROUP_BAND, QTY_BAND, groupSections, paginate, sheetBanner } from "./layout";
import { blankProject, sanitizeProject } from "./project";
import { reducer } from "./reducer";
import { resolveAll } from "./resolve";
import { joinLayouts, joinedSize, orderedPieceIds, separateParts } from "./compose";
import { applyDieCutSize, buildLabelArt } from "./text";
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
    product: partial.product ?? "acrylic",
    quantity: partial.quantity ?? 1,
    backgroundColor: partial.backgroundColor ?? "#ffffff",
    plateColor: partial.plateColor ?? "#ffffff",
    textColor: partial.textColor ?? "#000000",
    dimensionColor: partial.dimensionColor ?? groupSwatch(partial.groupIndex ?? 0),
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
    quantity: 1,
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
      description: "",
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
          product: "acrylic" as const,
          backgroundColor: "#fff1cc",
          plateColor: "#1f4b99",
          textColor: "#f4f1ea",
          dimensionColor: "#c4491d",
        },
      ],
      labels: [grouped, ownHeight, ownFace],
      sheet: { preset: "a4" as const, width: 210, height: 297, margin: 14, gap: 6, showDimensions: true, showCalibration: true },
      plate: { preset: "a350" as const, width: 320, height: 350, margin: 8, gap: 4, outline: true, outlineMode: "cut" as const },
    };
    const on = resolveAll(project).find((label) => label.id === "on");
    const hold = resolveAll(project).find((label) => label.id === "hold");
    const fuse = resolveAll(project).find((label) => label.id === "fuse");
    expect(on).toMatchObject({
      height: 12,
      heightSource: "group",
      fontSize: 5,
      typefaceId: "inter-semibold",
      backgroundColor: "#fff1cc",
      plateColor: "#1f4b99",
      textColor: "#f4f1ea",
      dimensionColor: "#c4491d",
    });
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
    expect(svg).toContain('data-group-product="Layered Acrylic Engraved Label"');
  });

  it("prints the quantity above the label and leaves that room on the sheet", () => {
    const label = box({ id: "on", text: "ON", width: 30, height: 12, fontSize: 5, quantity: 4 });
    const frame = { width: 200, height: 120, margin: 10, gap: 4, showDimensions: false, bottomInset: 10 };
    const pages = paginate([label], frame, { groupRows: true, showQuantity: true });
    expect(pages[0].placements[0]?.y).toBe(10 + GROUP_BAND + QTY_BAND);
    const svg = renderSheetSvg(pages[0], 200, 120, new Map([[label.id, buildLabelArt(inter, label)]]), mono, {
      preview: false,
      showDimensions: false,
      showCalibration: false,
      showQuantity: true,
    });
    expect(svg).toContain('data-label-qty="4"');
    expect(svg).toContain("qty 4");
    const plate = paginate([label], frame);
    expect(plate[0].placements[0]?.y).toBe(10);
    const plateSvg = renderPlateSvg(plate[0], 200, 120, "mm", true, "cut", new Map([[label.id, buildLabelArt(inter, label)]]), { preview: false, part: "text" });
    expect(plateSvg).not.toContain("data-label-qty");
  });

  it("prints the title and description, and leaves a die-cut sticker without a frame", () => {
    const acrylic = box({ id: "a", text: "ON", width: 30, height: 12, fontSize: 5, groupId: "g1", groupName: "Power", groupIndex: 0, product: "acrylic" });
    const sticker = box({ id: "b", text: "UP", width: 30, height: 12, fontSize: 5, groupId: "g2", groupName: "Marks", groupIndex: 1, product: "die-cut-pp" });
    const banner = sheetBanner(mono, "Door, west", "Night shift\nBay 2", 210, 14);
    expect(banner.titleLines.map((line) => line.text)).toEqual(["Door, west"]);
    expect(banner.descriptionLines.map((line) => line.text)).toEqual(["Night shift", "Bay 2"]);
    expect(banner.contentTop).toBeGreaterThan(14);

    const frame = { width: 210, height: 297, margin: 14, gap: 6, showDimensions: false, bottomInset: 14 };
    const pages = paginate([acrylic, sticker], frame, { groupRows: true, firstPageTop: banner.contentTop });
    expect(pages[0].headings[0]?.y).toBe(banner.contentTop);
    expect(pages[0].placements[0]?.y).toBe(banner.contentTop + 8);
    expect(pages[0].headings.map((heading) => heading.productName)).toEqual([
      "Layered Acrylic Engraved Label",
      "Die-cut PP Sticker",
    ]);

    const arts = new Map([
      [acrylic.id, buildLabelArt(inter, acrylic)],
      [sticker.id, buildLabelArt(inter, sticker)],
    ]);
    const svg = renderSheetSvg(pages[0], 210, 297, arts, mono, {
      preview: false,
      showDimensions: false,
      showCalibration: false,
      banner,
    });
    expect(svg).toContain('data-sheet-title="Door, west"');
    expect(svg).toContain('data-sheet-description="Night shift\nBay 2"');
    expect(svg).toContain('data-group-product="Die-cut PP Sticker"');
    expect(svg.match(/label-edge/g)).toHaveLength(1);

    const stickerArt = arts.get(sticker.id);
    if (!stickerArt) throw new Error("missing sticker art");
    const cut = renderLabelSvg(sticker, stickerArt, "mm", true, "cut", "outline");
    const engrave = renderLabelSvg(sticker, stickerArt, "mm", true, "cut", "text");
    expect(cut).not.toContain("label-edge");
    expect(cut).toContain('stroke="#ff0000"');
    expect(engrave).toContain('fill="#000000"');
    expect(engrave).not.toContain("#ff0000");
  });

  it("sizes a die-cut sticker to the lettering and draws no rectangle", () => {
    const sticker = box({
      text: "350KPa",
      width: 40,
      height: 20,
      fontSize: 20,
      padding: 1.4,
      product: "die-cut-pp",
    });
    const art = buildLabelArt(inter, sticker);
    expect(art.overflow).toBe(false);
    expect(art.borderPath).toBe("");
    expect(art.dieCut).toBeDefined();
    if (!art.dieCut) return;
    expect(art.dieCut.width).toBeGreaterThan(40);
    expect(art.dieCut.height).toBeLessThan(20);
    expect(art.dieCut.height).toBeGreaterThan(10);

    const sized = applyDieCutSize([sticker], new Map([[sticker.id, art]]))[0];
    expect(sized.width).toBe(art.dieCut.width);
    expect(sized.height).toBe(art.dieCut.height);

    const frame = { width: 210, height: 297, margin: 14, gap: 6, showDimensions: true, bottomInset: 14 };
    const pages = paginate([sized], frame, { groupRows: true });
    const sheet = renderSheetSvg(pages[0], 210, 297, new Map([[sticker.id, art]]), mono, {
      preview: false,
      showDimensions: true,
      showCalibration: false,
    });
    expect(sheet).not.toContain("label-edge");
    expect(sheet).not.toContain("<rect");
    expect(sheet).toContain(`350KPa — ${formatMm(sized.width)} × ${formatMm(sized.height)} mm`);

    const cut = renderLabelSvg(sized, art, "mm", true, "cut", "outline");
    expect(cut).not.toContain("label-edge");
    expect(cut).not.toContain("<rect");
    expect(cut).toContain(`width="${formatNum(sized.width)}mm"`);
    expect(cut).toContain(`height="${formatNum(sized.height)}mm"`);
    expect(cut).toContain('stroke="#ff0000"');

    const selected = renderSheetSvg(pages[0], 210, 297, new Map([[sticker.id, art]]), mono, {
      preview: true,
      showDimensions: false,
      showCalibration: false,
      selected: new Set([sticker.id]),
    });
    expect(selected).not.toContain('class="selection"');
    expect(selected).toContain('stroke="#c4491d"');
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
    expect(isLabelCsv(csv)).toBe(true);
    expect(isLabelCsv("\uFEFFrecord;group\r\n")).toBe(true);
    expect(isLabelCsv('{"version":1}')).toBe(false);
  });

  it("opens a csv on another computer, including an older sheet and a combined label", () => {
    let project = blankProject();
    project = { ...project, name: "Door, west" };
    project = reducer(project, { type: "describe", description: "Night shift" });
    project = reducer(project, { type: "setMasterHeight", height: 18 });
    const groupId = project.groups[0].id;
    project = reducer(project, { type: "updateGroup", id: groupId, patch: { padding: 2, align: "left", masterTypefaceId: "noto-sans-cjk-tc-bold", product: "die-cut-pp" } });
    project = reducer(project, { type: "addLabel", groupId });
    project = reducer(project, { type: "addLabel", groupId });
    const [first, second] = project.labels;
    project = reducer(project, { type: "setPieceText", labelId: first.id, pieceId: first.pieces[0].id, text: "UP\nDOWN" });
    project = reducer(project, { type: "updateLine", labelId: first.id, pieceId: first.pieces[0].id, index: 0, patch: { fontSize: 4, align: "left" } });
    project = reducer(project, { type: "updateLabel", id: second.id, patch: { width: 22, text: "SIDE" } });
    project = reducer(project, { type: "updateLabel", id: first.id, patch: { quantity: 6 } });
    project = reducer(project, { type: "setPieceText", labelId: second.id, pieceId: second.pieces[0].id, text: "SIDE" });
    project = reducer(project, { type: "combine", targetId: first.id, guestIds: [second.id], edge: "right" });
    project = reducer(project, { type: "setSheet", patch: { margin: 11, gap: 5, showCalibration: false } });
    project = reducer(project, { type: "setPlate", patch: { margin: 9, outlineMode: "engrave" } });
    const custom = [{ id: "shop-face", name: "Shop Font" }];

    const restored = projectFromCsv(projectToCsv(project, custom), custom);
    expect(restored?.name).toBe("Door, west");
    expect(restored?.description).toBe("Night shift");
    expect(restored?.masterHeight).toBe(18);
    expect(restored?.groups[0]).toMatchObject({
      name: "Group 1",
      masterHeight: 18,
      masterTypefaceId: "noto-sans-cjk-tc-bold",
      padding: 2,
      align: "left",
      product: "die-cut-pp",
    });
    expect(restored?.sheet).toMatchObject({ preset: "a4", width: 210, height: 297, margin: 11, gap: 5, showCalibration: false });
    expect(restored?.plate).toMatchObject({ preset: "a350", margin: 9, outlineMode: "engrave" });
    expect(restored?.labels).toHaveLength(1);
    expect(restored?.labels[0]?.quantity).toBe(6);
    const label = restored?.labels[0];
    expect(label?.width).toBe(62);
    expect(label?.height).toBe(18);
    expect(label?.layout.kind).toBe("join");
    const pieceText = (id: string) => label?.pieces.find((piece) => piece.id === id)?.lines.map((line) => [line.text, line.fontSize, line.align]);
    const ids = label ? orderedPieceIds(label.layout) : [];
    expect(pieceText(ids[0] ?? "")).toEqual([
      ["UP", 4, "left"],
      ["DOWN", null, null],
    ]);
    expect(pieceText(ids[1] ?? "")).toEqual([["SIDE", null, null]]);
    const parts = label ? separateParts(label) : null;
    expect(parts?.[0]?.width).toBeCloseTo(40, 2);
    expect(parts?.[1]?.width).toBeCloseTo(22, 2);

    const legacy = [
      "record,group,text,width_mm,height_mm,height_from,typeface,typeface_from,font_height_mm,font_height_from,lines,line_font_mm,line_align,sheet_mm,plate_mm,master_height_mm",
      "project,,Pump room,,,,,,,,,,,210 x 297,230 x 250,",
      "group,Power,,,20,,Noto Sans CJK TC Bold,,12,,,,,,",
      "label,Power,充電座,45,20,group,Noto Sans CJK TC Bold,group,12,group,充電座 | 座,,,",
    ].join("\r\n");
    const opened = projectFromCsv(legacy);
    expect(opened?.name).toBe("Pump room");
    expect(opened?.sheet.preset).toBe("a4");
    expect(opened?.sheet.margin).toBe(14);
    expect(opened?.plate).toMatchObject({ preset: "a250", width: 230, height: 250, margin: 8 });
    expect(opened?.labels[0]).toMatchObject({
      width: 45,
      height: 20,
      heightMode: "group",
      typefaceId: "noto-sans-cjk-tc-bold",
      typefaceMode: "group",
      fontSize: 12,
      fontSizeMode: "group",
    });
    expect(opened?.labels[0].pieces[0].lines.map((line) => line.text)).toEqual(["充電座", "座"]);
    expect(opened?.labels[0]?.quantity).toBe(1);
    expect(opened?.groups[0].masterFontSize).toBe(12);
    expect(opened?.groups[0]).toMatchObject({
      backgroundColor: "#ffffff",
      plateColor: "#ffffff",
      textColor: "#000000",
      dimensionColor: groupSwatch(0),
    });
  });

  it("round-trips maker colours and leaves the plate blank for die-cut PP", () => {
    let project = blankProject();
    const acrylicId = project.groups[0].id;
    project = reducer(project, {
      type: "updateGroup",
      id: acrylicId,
      patch: { product: "thermal", backgroundColor: "#112233", plateColor: "#abcdef", textColor: "#445566", dimensionColor: "#ffff00" },
    });
    project = reducer(project, { type: "addGroup" });
    const stickerId = project.groups[1].id;
    project = reducer(project, {
      type: "updateGroup",
      id: stickerId,
      patch: { product: "die-cut-pp", backgroundColor: "#ddeecc", plateColor: "#ff00aa", textColor: "#101010", dimensionColor: "#ffffff" },
    });
    const csv = projectToCsv(project);
    expect(csv).toContain("background_colour,plate_colour,text_colour,dimension_colour");
    expect(csv).toContain("#112233");
    expect(csv).toContain("#abcdef");
    expect(csv).toContain("#ddeecc");
    expect(csv).not.toContain("#ff00aa");

    const restored = projectFromCsv(csv);
    expect(restored?.groups[0]).toMatchObject({
      product: "thermal",
      backgroundColor: "#112233",
      plateColor: "#abcdef",
      textColor: "#445566",
      dimensionColor: "#ffff00",
    });
    expect(restored?.groups[1]).toMatchObject({
      product: "die-cut-pp",
      backgroundColor: "#ddeecc",
      plateColor: "#ffffff",
      textColor: "#101010",
      dimensionColor: "#ffffff",
    });

    const american = [
      "record,group,label_product,background_color,plate_color,text_color,dimension_color",
      "group,Power,Layered Acrylic Engraved Label,#abc,#123456,#010203,#ff0",
      "group,Marks,Die-cut PP Sticker,#445566,#ff00aa,#0a0a0a,",
    ].join("\n");
    const opened = projectFromCsv(american);
    expect(opened?.groups[0]).toMatchObject({ backgroundColor: "#aabbcc", plateColor: "#123456", textColor: "#010203", dimensionColor: "#ffff00" });
    expect(opened?.groups[1]).toMatchObject({
      product: "die-cut-pp",
      backgroundColor: "#445566",
      plateColor: "#ffffff",
      textColor: "#0a0a0a",
      dimensionColor: groupSwatch(1),
    });

    const british = [
      "record,group,dimension_colour",
      "group,One,#00e5ff",
      "group,Two,green",
    ].join("\n");
    const spelled = projectFromCsv(british);
    expect(spelled?.groups.map((group) => group.dimensionColor)).toEqual(["#00e5ff", groupSwatch(1)]);
  });

  it("opens the FSD sheet, which has no colour columns, as black lettering on white", () => {
    const opened = projectFromCsv(FSD_SHEET);
    expect(opened?.name).toBe("FSD MFV");
    expect(opened?.description).toBe("This are the drafted labels for FSD MRVs.");
    expect(opened?.groups.map((group) => [group.name, group.product, group.backgroundColor, group.plateColor, group.textColor])).toEqual([
      ["Group 1", "acrylic", "#ffffff", "#ffffff", "#000000"],
      ["Group 3", "die-cut-pp", "#ffffff", "#ffffff", "#000000"],
    ]);
    expect(opened?.groups.map((group) => group.dimensionColor)).toEqual([groupSwatch(0), groupSwatch(1)]);
    const legacyJson = sanitizeProject({
      version: 1,
      name: "Old",
      groups: [
        { id: "a", name: "One" },
        { id: "b", name: "Two" },
      ],
      labels: [],
    });
    expect(legacyJson?.groups.map((group) => group.dimensionColor)).toEqual([groupSwatch(0), groupSwatch(1)]);
    expect(opened?.labels).toHaveLength(7);
    const saved = sanitizeProject(JSON.parse(JSON.stringify(opened)));
    expect(saved?.groups[0].backgroundColor).toBe("#ffffff");
    const coloured = sanitizeProject({
      ...saved,
      groups: saved?.groups.map((group, index) =>
        index === 0
          ? { ...group, backgroundColor: "red", plateColor: "#abc", textColor: "#445566", dimensionColor: "#ff0" }
          : { ...group, backgroundColor: "#e7f2ea", plateColor: "#ff00aa", textColor: "navy", dimensionColor: "yellow" },
      ),
    });
    expect(coloured?.groups[0]).toMatchObject({ backgroundColor: "#ffffff", plateColor: "#aabbcc", textColor: "#445566", dimensionColor: "#ffff00" });
    expect(coloured?.groups[1]).toMatchObject({ backgroundColor: "#e7f2ea", plateColor: "#ff00aa", textColor: "#000000", dimensionColor: groupSwatch(1) });
  });
});

const FSD_SHEET = `record,group,text,width_mm,height_mm,height_from,typeface,typeface_from,font_height_mm,font_height_from,lines,line_font_mm,line_align,padding_mm,align,vertical,radius_mm,tracking_mm,line_gap_mm,sheet_mm,plate_mm,master_height_mm,layout,sheet_margin_mm,sheet_gap_mm,sheet_dimensions,sheet_calibration,plate_margin_mm,plate_gap_mm,plate_outline,plate_outline_mode,description,label_product,quantity
project,,FSD MFV,,,,,,,,,,,,,,,,,210 x 297,320 x 350,,,14,6,yes,yes,8,4,yes,cut,This are the drafted labels for FSD MRVs.,,
group,Group 1,,,20,,Noto Sans CJK TC Bold,,12,,,,,1.4,center,middle,0,0,0.4,,,,,,,,,,,,,,Layered Acrylic Engraved Label,
group,Group 3,,,16.24,,Noto Sans CJK TC Bold,,16.24,,,,,1.4,center,middle,0,0,0.4,,,,,,,,,,,,,,Die-cut PP Sticker,
label,Group 1,櫃門鎖,45,20,group,Noto Sans CJK TC Bold,group,12,group,櫃門鎖,,,1.4,center,middle,0,0,0.4,,,,p0,,,,,,,,,,,2
label,Group 1,先鎖後開尾門,80,20,group,Noto Sans CJK TC Bold,group,12,group,先鎖後開尾門,,,1.4,center,middle,0,0,0.4,,,,p0,,,,,,,,,,,1
label,Group 1,充電座,45,20,group,Noto Sans CJK TC Bold,group,12,group,充電座,,,1.4,center,middle,0,0,0.4,,,,p0,,,,,,,,,,,1
label,Group 1,無鉛汽油,55,20,group,Noto Sans CJK TC Bold,group,12,group,無鉛汽油,,,1.4,center,middle,0,0,0.4,,,,p0,,,,,,,,,,,1
label,Group 1,電池總制在內,80,20,group,Noto Sans CJK TC Bold,group,12,group,電池總制在內,,,1.4,center,middle,0,0,0.4,,,,p0,,,,,,,,,,,1
label,Group 3,280kPa,69.7,16.24,group,Noto Sans CJK TC Bold,group,16.24,group,280kPa,,,1.4,center,middle,0,0,0.4,,,,p0,,,,,,,,,,,2
label,Group 3,350kPa,69.88,16.24,group,Noto Sans CJK TC Bold,group,16.24,group,350kPa,,,1.4,center,middle,0,0,0.4,,,,p0,,,,,,,,,,,2
`;

describe("maker colours", () => {
  it("fills each group section on the sheet and paints a plate only for acrylic and thermal", () => {
    const acrylic = box({
      id: "a",
      text: "ON",
      width: 30,
      height: 12,
      fontSize: 5,
      groupId: "g1",
      groupName: "Group 1",
      groupIndex: 0,
      product: "acrylic",
      backgroundColor: "#fff1cc",
      plateColor: "#1f4b99",
      textColor: "#f4f1ea",
    });
    const thermal = box({
      id: "t",
      text: "HOT",
      width: 30,
      height: 12,
      fontSize: 5,
      groupId: "g2",
      groupName: "Group 2",
      groupIndex: 1,
      product: "thermal",
      backgroundColor: "#f3d2cf",
      plateColor: "#8a3010",
      textColor: "#1c1b17",
    });
    const sticker = box({
      id: "b",
      text: "UP",
      width: 30,
      height: 12,
      fontSize: 5,
      groupId: "g3",
      groupName: "Group 3",
      groupIndex: 2,
      product: "die-cut-pp",
      backgroundColor: "#e7f2ea",
      plateColor: "#ff00aa",
      textColor: "#143028",
    });
    const banner = sheetBanner(mono, "FSD MFV", "Draft", 210, 14);
    const frame = { width: 210, height: 297, margin: 14, gap: 6, showDimensions: true, bottomInset: 16 };
    const pages = paginate([acrylic, thermal, sticker], frame, { groupRows: true, firstPageTop: banner.contentTop, showQuantity: true });
    const sections = groupSections(pages[0], 210, { showDimensions: true, showQuantity: true });
    expect(sections.map((section) => section.groupId)).toEqual(["g1", "g2", "g3"]);
    expect(sections[0].y).toBe(banner.contentTop);
    expect(sections[0].x).toBe(14);
    expect(sections[0].width).toBe(182);
    expect(sections[0].height).toBeLessThan(80);
    expect(sections[0].y + sections[0].height).toBeLessThan(sections[1].y);
    expect(sections[1].y + sections[1].height).toBeLessThan(sections[2].y);
    expect(sections[2].y + sections[2].height).toBeLessThan(297);

    const arts = new Map([
      [acrylic.id, buildLabelArt(inter, acrylic)],
      [thermal.id, buildLabelArt(inter, thermal)],
      [sticker.id, buildLabelArt(inter, sticker)],
    ]);
    const svg = renderSheetSvg(pages[0], 210, 297, arts, mono, {
      preview: false,
      showDimensions: true,
      showCalibration: true,
      showQuantity: true,
      banner,
    });
    expect(svg).toContain('fill="#fff1cc"');
    expect(svg).toContain('fill="#f3d2cf"');
    expect(svg).toContain('fill="#e7f2ea"');
    expect(svg.match(/class="label-plate"/g)).toHaveLength(2);
    expect(svg).toContain('fill="#1f4b99"');
    expect(svg).toContain('fill="#8a3010"');
    expect(svg).toContain('fill="#f4f1ea"');
    expect(svg).toContain('fill="#143028"');
    expect(svg).not.toContain("#ff00aa");
    expect(svg).not.toContain('data-section-y="0"');
    expect(svg).toContain('data-section-width="182"');
    expect(svg).toContain('data-section-height="');
    const plateCut = renderPlateSvg(pages[0], 320, 350, "mm", true, "cut", arts, { preview: false, part: "outline" });
    expect(plateCut).not.toContain("label-plate");
    expect(plateCut).not.toContain("#1f4b99");
  });

  it("prints the FSD sheet as red acrylic on white plates and white die-cut lettering on black", () => {
    const acrylic = box({
      id: "lock",
      text: "櫃門鎖",
      width: 45,
      height: 20,
      fontSize: 12,
      groupId: "g1",
      groupName: "Group 1",
      groupIndex: 0,
      product: "acrylic",
      backgroundColor: "#ff0000",
      plateColor: "#ffffff",
      textColor: "#ff0000",
    });
    const sticker = box({
      id: "kpa",
      text: "280kPa",
      width: 70,
      height: 16,
      fontSize: 16,
      groupId: "g3",
      groupName: "Group 3",
      groupIndex: 1,
      product: "die-cut-pp",
      backgroundColor: "#000000",
      plateColor: "#ff00aa",
      textColor: "#ffffff",
    });
    const banner = sheetBanner(mono, "FSD MFV", "This are the drafted labels for FSD MRVs.", 210, 14);
    const frame = { width: 210, height: 297, margin: 14, gap: 6, showDimensions: true, bottomInset: 16 };
    const pages = paginate([acrylic, sticker], frame, { groupRows: true, firstPageTop: banner.contentTop, showQuantity: true });
    const sections = groupSections(pages[0], 210, { showDimensions: true, showQuantity: true });
    expect(sections.map((section) => section.name)).toEqual(["Group 1", "Group 3"]);
    expect(sections[0].y).toBeGreaterThan(0);
    expect(sections[0].width).toBe(182);
    expect(sections[0].y + sections[0].height).toBeLessThan(sections[1].y);
    expect(sections[1].y + sections[1].height).toBeLessThan(297);

    const arts = new Map([
      [acrylic.id, buildLabelArt(inter, acrylic)],
      [sticker.id, buildLabelArt(inter, sticker)],
    ]);
    const svg = renderSheetSvg(pages[0], 210, 297, arts, mono, {
      preview: false,
      showDimensions: true,
      showCalibration: true,
      showQuantity: true,
      banner,
    });
    expect(svg).toMatch(/data-group-name="Group 1"[^>]*fill="#ff0000"/);
    expect(svg).toMatch(/data-group-name="Group 3"[^>]*fill="#000000"/);
    expect(svg.match(/class="label-plate"/g)).toHaveLength(1);
    expect(svg).toMatch(/class="label-plate"[^>]*fill="#ffffff"/);
    expect(svg).not.toContain("#ff00aa");
    const acrylicInk = svg.slice(svg.indexOf('data-label-id="lock"'), svg.indexOf('data-label-id="kpa"'));
    const stickerInk = svg.slice(svg.indexOf('data-label-id="kpa"'));
    expect(acrylicInk).toContain('fill="#ffffff"');
    expect(acrylicInk).toContain('fill="#ff0000"');
    expect(stickerInk).not.toContain("label-plate");
    expect(stickerInk).toContain('fill="#ffffff"');
    expect(stickerInk).not.toContain('fill="#ff0000"');
  });

  it("paints dimension marks, quantity, and the heading in the group's dimension colour", () => {
    const acrylic = box({
      id: "lock",
      text: "ON",
      width: 40,
      height: 16,
      fontSize: 8,
      quantity: 2,
      groupId: "g1",
      groupName: "Group 1",
      groupIndex: 0,
      product: "acrylic",
      backgroundColor: "#ff0000",
      plateColor: "#ffffff",
      textColor: "#ff0000",
      dimensionColor: "#ffff00",
    });
    const sticker = box({
      id: "kpa",
      text: "280",
      width: 40,
      height: 16,
      fontSize: 8,
      quantity: 2,
      groupId: "g3",
      groupName: "Group 3",
      groupIndex: 1,
      product: "die-cut-pp",
      backgroundColor: "#000000",
      plateColor: "#ff00aa",
      textColor: "#ffffff",
      dimensionColor: "#ffffff",
    });
    const frame = { width: 210, height: 297, margin: 14, gap: 6, showDimensions: true, bottomInset: 16 };
    const pages = paginate([acrylic, sticker], frame, { groupRows: true, showQuantity: true });
    const arts = new Map([
      [acrylic.id, buildLabelArt(inter, acrylic)],
      [sticker.id, buildLabelArt(inter, sticker)],
    ]);
    const svg = renderSheetSvg(pages[0], 210, 297, arts, mono, {
      preview: false,
      showDimensions: true,
      showCalibration: true,
      showQuantity: true,
    });
    const heading = svg.slice(svg.indexOf('data-group-heading="Group 1"'), svg.indexOf('data-group-heading="Group 3"'));
    const redGuides = svg.slice(svg.indexOf('data-label-id="lock"'), svg.indexOf('data-label-id="kpa"'));
    const blackGuides = svg.slice(svg.indexOf('data-label-id="kpa"'));
    expect(heading).toContain('fill="#ffff00"');
    expect(heading).toContain('stroke="#ffff00"');
    expect(heading).not.toContain(groupSwatch(0));
    expect(redGuides).toContain('data-dimensions="lock"');
    expect(redGuides).toContain('stroke="#ffff00"');
    expect(redGuides).toContain('fill="#ffff00"');
    expect(redGuides).not.toContain(groupSwatch(0));
    expect(blackGuides).toContain('data-dimensions="kpa"');
    expect(blackGuides).toContain('stroke="#ffffff"');
    expect(blackGuides).toContain('data-label-qty="2"');
    expect(blackGuides).not.toContain(groupSwatch(1));
    expect(svg).toContain('stroke="#1b1914"');

    const plate = renderPlateSvg(pages[0], 320, 350, "mm", true, "cut", arts, { preview: false, part: "both" });
    const cut = renderLabelSvg(acrylic, arts.get(acrylic.id)!, "mm", true, "cut", "outline");
    const engrave = renderLabelSvg(acrylic, arts.get(acrylic.id)!, "mm", true, "engrave", "text");
    expect(plate).not.toContain("#ffff00");
    expect(plate).not.toContain("data-dimensions");
    expect(plate).toContain('stroke="#ff0000"');
    expect(plate).toContain('fill="#000000"');
    expect(cut).toContain('stroke="#ff0000"');
    expect(cut).not.toContain("#ffff00");
    expect(engrave).toContain('fill="#000000"');
    expect(engrave).not.toContain("#ffff00");
    expect(engrave).not.toContain("#ff0000");
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

  it("writes filled lettering and the cut outline as separate files", async () => {
    const label = box({ text: "ON", width: 32, height: 12, fontSize: 5 });
    const art = buildLabelArt(inter, label);
    const text = renderLabelSvg(label, art, "mm", false, "engrave", "text");
    const cut = renderLabelSvg(label, art, "mm", false, "engrave", "outline");
    expect(text).toContain('fill="#000000"');
    expect(text).not.toContain("label-edge");
    expect(cut).toContain('class="label-edge"');
    expect(cut).toContain('stroke="#ff0000"');
    expect(cut).not.toContain('fill="#000000"');
    expect(text).toContain('viewBox="0 0 32 12"');
    expect(cut).toContain('viewBox="0 0 32 12"');

    const page = { placements: [{ label, x: 8, y: 8, oversized: false }], headings: [] };
    const plateText = renderPlateSvg(page, 160, 200, "mm", false, "engrave", new Map([[label.id, art]]), { preview: false, part: "text" });
    const plateCut = renderPlateSvg(page, 160, 200, "mm", false, "engrave", new Map([[label.id, art]]), { preview: false, part: "outline" });
    expect(plateText).toContain('data-width-mm="160"');
    expect(plateText).toContain('data-height-mm="200"');
    expect(plateText).toContain('fill="#000000"');
    expect(plateText).not.toContain("label-edge");
    expect(plateCut).toContain('stroke="#ff0000"');
    expect(plateCut).not.toContain('fill="#000000"');

    const zip = await buildSvgZip({
      unit: "mm",
      labels: true,
      plate: true,
      resolved: [label],
      arts: new Map([[label.id, art]]),
      platePages: [page],
      plateSettings: { preset: "custom", width: 160, height: 200, margin: 8, gap: 4, outline: true, outlineMode: "cut" },
    });
    const archive = await JSZip.loadAsync(await zip.arrayBuffer());
    expect(Object.keys(archive.files).sort()).toEqual([
      "READ-ME.txt",
      "cut/",
      "cut/01-on-32x12mm.svg",
      "cut/plate-1-160x200mm.svg",
      "engrave/",
      "engrave/01-on-32x12mm.svg",
      "engrave/plate-1-160x200mm.svg",
    ]);
    const engrave = await archive.file("engrave/01-on-32x12mm.svg")?.async("string");
    const outline = await archive.file("cut/01-on-32x12mm.svg")?.async("string");
    expect(engrave).toContain('fill="#000000"');
    expect(engrave).not.toContain("label-edge");
    expect(outline).toContain('stroke="#ff0000"');
    expect(outline).not.toContain('fill="#000000"');
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
