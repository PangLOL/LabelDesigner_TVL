import type { Edge, Group, Label, LabelLine, PlateSettings, Project, SheetSettings } from "../types";
import { attachEdgeCross, attachEdgeSpan, cloneComposition, joinLayouts, joinedSize, linesFromText, pieceById, replacePiece, separateParts, singleLayout, withSummary } from "./compose";
import type { ParsedLabelRow } from "./format";
import { clamp } from "./format";
import { createId } from "./id";
import { inheritedHeight } from "./resolve";

export type Action =
  | { type: "replace"; project: Project }
  | { type: "rename"; name: string }
  | { type: "setMasterHeight"; height: number | null }
  | { type: "updateGroup"; id: string; patch: Partial<Group> }
  | { type: "addGroup" }
  | { type: "duplicateGroup"; id: string }
  | { type: "deleteGroup"; id: string }
  | { type: "addLabel"; groupId: string }
  | { type: "updateLabel"; id: string; patch: Partial<Label> }
  | { type: "deleteLabels"; ids: string[] }
  | { type: "duplicateLabels"; ids: string[] }
  | { type: "moveLabels"; ids: string[]; groupId: string }
  | { type: "reorderLabel"; id: string; direction: -1 | 1 }
  | { type: "pasteLabels"; groupId: string; rows: ParsedLabelRow[] }
  | { type: "setPieceText"; labelId: string; pieceId: string; text: string }
  | { type: "updateLine"; labelId: string; pieceId: string; index: number; patch: Partial<Pick<LabelLine, "fontSize" | "align">> }
  | { type: "combine"; targetId: string; guestIds: string[]; edge: Edge }
  | { type: "separate"; id: string }
  | { type: "bulk"; ids: string[]; patch: Partial<Label> }
  | { type: "setSheet"; patch: Partial<SheetSettings> }
  | { type: "setPlate"; patch: Partial<PlateSettings> };

function stampHeight(labels: Label[], groupId: string | null, height: number): Label[] {
  return labels.map((label) => {
    if (label.heightMode !== "group") return label;
    if (groupId != null && label.groupId !== groupId) return label;
    return { ...label, height };
  });
}

function stampTypeface(labels: Label[], groupId: string, typefaceId: string): Label[] {
  return labels.map((label) =>
    label.groupId === groupId && label.typefaceMode === "group" ? { ...label, typefaceId } : label,
  );
}

function stampFontSize(labels: Label[], groupId: string, fontSize: number): Label[] {
  return labels.map((label) =>
    label.groupId === groupId && label.fontSizeMode === "group" ? { ...label, fontSize } : label,
  );
}

export function makeGroup(project: Project): Group {
  return {
    id: createId(),
    name: `Group ${project.groups.length + 1}`,
    masterHeight: project.masterHeight ?? 12,
    masterTypefaceId: "inter",
    masterFontSize: 5,
    padding: 1.4,
    align: "center",
    vAlign: "middle",
    radius: 0,
    tracking: 0,
    lineGap: 0.4,
  };
}

export function makeLabel(project: Project, group: Group, text = "", width = 40): Label {
  const height = inheritedHeight(project, group) ?? 12;
  const pieceId = createId();
  return withSummary({
    id: createId(),
    groupId: group.id,
    text: "",
    width: clamp(width, 1, 2000),
    height,
    heightMode: "group",
    typefaceId: group.masterTypefaceId ?? "inter",
    typefaceMode: "group",
    fontSize: group.masterFontSize ?? 5,
    fontSizeMode: "group",
    pieces: [{ id: pieceId, lines: linesFromText(text) }],
    layout: singleLayout(pieceId),
  });
}

function copyLabel(label: Label, groupId = label.groupId): Label {
  const composition = cloneComposition(label.pieces, label.layout);
  return withSummary({ ...label, id: createId(), groupId, pieces: composition.pieces, layout: composition.layout });
}

function reorder(labels: Label[], id: string, direction: -1 | 1): Label[] {
  const label = labels.find((item) => item.id === id);
  if (!label) return labels;
  const siblings = labels.filter((item) => item.groupId === label.groupId);
  const index = siblings.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= siblings.length) return labels;
  const next = siblings.slice();
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  let cursor = 0;
  return labels.map((entry) => (entry.groupId === label.groupId ? next[cursor++] : entry));
}

export function reducer(state: Project, action: Action): Project {
  switch (action.type) {
    case "replace":
      return action.project;
    case "rename":
      return { ...state, name: action.name.slice(0, 80) };
    case "setMasterHeight": {
      if (action.height == null) return { ...state, masterHeight: null };
      const height = clamp(action.height, 1, 2000);
      return {
        ...state,
        masterHeight: height,
        groups: state.groups.map((group) => ({ ...group, masterHeight: height })),
        labels: stampHeight(state.labels, null, height),
      };
    }
    case "updateGroup": {
      let labels = state.labels;
      if (action.patch.masterHeight != null) labels = stampHeight(labels, action.id, action.patch.masterHeight);
      if (action.patch.masterTypefaceId) labels = stampTypeface(labels, action.id, action.patch.masterTypefaceId);
      if (action.patch.masterFontSize != null) labels = stampFontSize(labels, action.id, action.patch.masterFontSize);
      return {
        ...state,
        labels,
        groups: state.groups.map((group) => (group.id === action.id ? { ...group, ...action.patch } : group)),
      };
    }
    case "addGroup":
      return { ...state, groups: [...state.groups, makeGroup(state)] };
    case "duplicateGroup": {
      const source = state.groups.find((group) => group.id === action.id);
      if (!source) return state;
      const id = createId();
      const copy = { ...source, id, name: `${source.name} copy`.slice(0, 80) };
      const labels = state.labels.filter((label) => label.groupId === source.id).map((label) => copyLabel(label, id));
      const index = state.groups.findIndex((group) => group.id === source.id);
      const groups = state.groups.slice();
      groups.splice(index + 1, 0, copy);
      return { ...state, groups, labels: [...state.labels, ...labels] };
    }
    case "deleteGroup":
      return {
        ...state,
        groups: state.groups.filter((group) => group.id !== action.id),
        labels: state.labels.filter((label) => label.groupId !== action.id),
      };
    case "addLabel": {
      const group = state.groups.find((item) => item.id === action.groupId);
      if (!group) return state;
      return { ...state, labels: [...state.labels, makeLabel(state, group)] };
    }
    case "updateLabel":
      return {
        ...state,
        labels: state.labels.map((label) => (label.id === action.id ? { ...label, ...action.patch } : label)),
      };
    case "deleteLabels": {
      const ids = new Set(action.ids);
      return { ...state, labels: state.labels.filter((label) => !ids.has(label.id)) };
    }
    case "duplicateLabels": {
      const ids = new Set(action.ids);
      let copied = false;
      const labels = state.labels.flatMap((label) => {
        if (!ids.has(label.id)) return [label];
        copied = true;
        return [label, copyLabel(label)];
      });
      return copied ? { ...state, labels } : state;
    }
    case "setPieceText":
      return {
        ...state,
        labels: state.labels.map((label) => {
          if (label.id !== action.labelId) return label;
          const piece = pieceById(label, action.pieceId);
          if (!piece) return label;
          return replacePiece(label, action.pieceId, { ...piece, lines: linesFromText(action.text, piece.lines).slice(0, 12) });
        }),
      };
    case "updateLine":
      return {
        ...state,
        labels: state.labels.map((label) => {
          if (label.id !== action.labelId) return label;
          const piece = pieceById(label, action.pieceId);
          if (!piece || action.index < 0 || action.index >= piece.lines.length) return label;
          const lines = piece.lines.map((line, index) => (index === action.index ? { ...line, ...action.patch } : line));
          return replacePiece(label, action.pieceId, { ...piece, lines });
        }),
      };
    case "combine": {
      const guests = action.guestIds.filter((id) => id !== action.targetId);
      const target = state.labels.find((label) => label.id === action.targetId);
      if (!target || guests.length === 0) return state;
      const guestLabels = guests.flatMap((id) => {
        const guest = state.labels.find((label) => label.id === id);
        return guest ? [guest] : [];
      });
      if (guestLabels.length === 0) return state;
      const order = action.edge === "left" || action.edge === "top" ? [...guestLabels].reverse() : guestLabels;
      let host = target;
      for (const guest of order) {
        const size = joinedSize(host, guest, action.edge);
        host = withSummary({
          ...host,
          width: size.width,
          height: size.height,
          heightMode: "custom",
          pieces: [...host.pieces, ...guest.pieces],
          layout: joinLayouts(
            host.layout,
            guest.layout,
            attachEdgeSpan(action.edge, host),
            attachEdgeSpan(action.edge, guest),
            attachEdgeCross(action.edge, host),
            attachEdgeCross(action.edge, guest),
            action.edge,
          ),
        });
      }
      const removed = new Set(guestLabels.map((label) => label.id));
      return { ...state, labels: state.labels.filter((label) => !removed.has(label.id)).map((label) => (label.id === host.id ? host : label)) };
    }
    case "separate": {
      const label = state.labels.find((item) => item.id === action.id);
      if (!label) return state;
      const parts = separateParts(label);
      if (!parts) return state;
      const created = parts.map((part) =>
        withSummary({
          ...label,
          id: part.id,
          width: clamp(part.width, 1, 2000),
          height: clamp(part.height, 1, 2000),
          heightMode: "custom",
          pieces: part.pieces,
          layout: part.layout,
        }),
      );
      const labels: Label[] = [];
      for (const item of state.labels) {
        if (item.id !== label.id) labels.push(item);
        else labels.push(...created);
      }
      return { ...state, labels };
    }
    case "moveLabels": {
      if (!state.groups.some((group) => group.id === action.groupId)) return state;
      const ids = new Set(action.ids);
      return {
        ...state,
        labels: state.labels.map((label) => (ids.has(label.id) ? { ...label, groupId: action.groupId } : label)),
      };
    }
    case "reorderLabel":
      return { ...state, labels: reorder(state.labels, action.id, action.direction) };
    case "pasteLabels": {
      const group = state.groups.find((item) => item.id === action.groupId);
      if (!group || action.rows.length === 0) return state;
      const labels = action.rows.map((row) => {
        const created = makeLabel(state, group, row.text, row.width);
        if (row.height == null) return created;
        return { ...created, height: clamp(row.height, 1, 2000), heightMode: "custom" as const };
      });
      return { ...state, labels: [...state.labels, ...labels] };
    }
    case "bulk": {
      const ids = new Set(action.ids);
      return {
        ...state,
        labels: state.labels.map((label) => (ids.has(label.id) ? { ...label, ...action.patch } : label)),
      };
    }
    case "setSheet":
      return { ...state, sheet: { ...state.sheet, ...action.patch } };
    case "setPlate":
      return { ...state, plate: { ...state.plate, ...action.patch } };
    default:
      return state;
  }
}
