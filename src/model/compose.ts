import type { Edge, Label, LabelLayout, LabelLine, LabelPiece } from "../types";
import { createId } from "./id";

export function singleLayout(pieceId: string): LabelLayout {
  return { kind: "piece", pieceId };
}

export function linesFromText(text: string, previous: LabelLine[] = []): LabelLine[] {
  const parts = text.split("\n");
  const rows = parts.length > 0 ? parts : [""];
  return rows.map((line, index) => ({
    text: line,
    fontSize: previous[index]?.fontSize ?? null,
    align: previous[index]?.align ?? null,
  }));
}

export function pieceText(piece: LabelPiece): string {
  return piece.lines.map((line) => line.text).join("\n");
}

export function orderedPieceIds(layout: LabelLayout): string[] {
  if (layout.kind === "piece") return [layout.pieceId];
  return layout.children.flatMap((child) => orderedPieceIds(child.node));
}

export function labelSummary(pieces: LabelPiece[], layout: LabelLayout): string {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  return orderedPieceIds(layout)
    .map((id) => pieceText(byId.get(id) ?? { id, lines: [] }).trim())
    .filter((text) => text.length > 0)
    .join(" · ")
    .slice(0, 240);
}

export function withSummary(label: Label): Label {
  return { ...label, text: labelSummary(label.pieces, label.layout) };
}

export function remapLayout(layout: LabelLayout, ids: Map<string, string>): LabelLayout {
  if (layout.kind === "piece") return { kind: "piece", pieceId: ids.get(layout.pieceId) ?? layout.pieceId };
  return {
    kind: "join",
    axis: layout.axis,
    children: layout.children.map((child) => ({ share: child.share, cross: child.cross, node: remapLayout(child.node, ids) })),
  };
}

export function cloneComposition(pieces: LabelPiece[], layout: LabelLayout): { pieces: LabelPiece[]; layout: LabelLayout } {
  const ids = new Map(pieces.map((piece) => [piece.id, createId()]));
  return {
    pieces: pieces.map((piece) => ({
      id: ids.get(piece.id) ?? piece.id,
      lines: piece.lines.map((line) => ({ ...line })),
    })),
    layout: remapLayout(layout, ids),
  };
}

function span(edge: Edge, width: number, height: number): number {
  return edge === "left" || edge === "right" ? width : height;
}

export function joinedSize(
  host: { width: number; height: number },
  guest: { width: number; height: number },
  edge: Edge,
): { width: number; height: number } {
  if (edge === "left" || edge === "right") {
    return { width: host.width + guest.width, height: Math.max(host.height, guest.height) };
  }
  return { width: Math.max(host.width, guest.width), height: host.height + guest.height };
}

export function joinLayouts(
  host: LabelLayout,
  guest: LabelLayout,
  hostSpan: number,
  guestSpan: number,
  hostCross: number,
  guestCross: number,
  edge: Edge,
): LabelLayout {
  const total = hostSpan + guestSpan;
  const hostShare = total > 0 ? hostSpan / total : 0.5;
  const guestShare = total > 0 ? guestSpan / total : 0.5;
  const crossMax = Math.max(hostCross, guestCross);
  const hostCrossShare = crossMax > 0 ? hostCross / crossMax : 1;
  const guestCrossShare = crossMax > 0 ? guestCross / crossMax : 1;
  const guestFirst = edge === "left" || edge === "top";
  const pair = guestFirst
    ? [
        { share: guestShare, cross: guestCrossShare, node: guest },
        { share: hostShare, cross: hostCrossShare, node: host },
      ]
    : [
        { share: hostShare, cross: hostCrossShare, node: host },
        { share: guestShare, cross: guestCrossShare, node: guest },
      ];
  return { kind: "join", axis: edge === "left" || edge === "right" ? "horizontal" : "vertical", children: pair };
}

export function collectPieces(layout: LabelLayout, pieces: LabelPiece[]): LabelPiece[] {
  const wanted = new Set(orderedPieceIds(layout));
  return pieces.filter((piece) => wanted.has(piece.id));
}

export function separateParts(
  label: Label,
): { id: string; width: number; height: number; pieces: LabelPiece[]; layout: LabelLayout }[] | null {
  if (label.layout.kind !== "join") return null;
  const anchor = label.pieces[0]?.id;
  const horizontal = label.layout.axis === "horizontal";
  return label.layout.children.map((child) => {
    const ids = new Set(orderedPieceIds(child.node));
    return {
      id: anchor && ids.has(anchor) ? label.id : createId(),
      width: label.width * (horizontal ? child.share : child.cross),
      height: label.height * (horizontal ? child.cross : child.share),
      pieces: collectPieces(child.node, label.pieces),
      layout: child.node,
    };
  });
}

export function pieceById(label: Label, pieceId: string): LabelPiece | undefined {
  return label.pieces.find((piece) => piece.id === pieceId);
}

export function replacePiece(label: Label, pieceId: string, piece: LabelPiece): Label {
  return withSummary({
    ...label,
    pieces: label.pieces.map((item) => (item.id === pieceId ? piece : item)),
  });
}

export function isJoined(label: { layout: LabelLayout }): boolean {
  return label.layout.kind === "join";
}

export function attachEdgeSpan(edge: Edge, label: { width: number; height: number }): number {
  return span(edge, label.width, label.height);
}

export function attachEdgeCross(edge: Edge, label: { width: number; height: number }): number {
  return edge === "left" || edge === "right" ? label.height : label.width;
}
