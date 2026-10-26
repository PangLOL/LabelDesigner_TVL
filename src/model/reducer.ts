import type { Group, Label, PlateSettings, Project, SheetSettings } from "../types";
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

export function makeLabel(project: Project, group: Group, text = "LABEL", width = 40): Label {
  const height = inheritedHeight(project, group) ?? 12;
  return {
    id: createId(),
    groupId: group.id,
    text,
    width: clamp(width, 1, 2000),
    height,
    heightMode: "group",
    typefaceId: group.masterTypefaceId ?? "inter",
    typefaceMode: "group",
    fontSize: group.masterFontSize ?? 5,
    fontSizeMode: "group",
  };
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
      const labels = state.labels
        .filter((label) => label.groupId === source.id)
        .map((label) => ({ ...label, id: createId(), groupId: id }));
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
      const copies: Label[] = [];
      const labels = state.labels.flatMap((label) => {
        if (!ids.has(label.id)) return [label];
        const copy = { ...label, id: createId() };
        copies.push(copy);
        return [label, copy];
      });
      return copies.length ? { ...state, labels } : state;
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
