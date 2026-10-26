import type { Group, Label, Project } from "../types";

function group(partial: Group): Group {
  return partial;
}

function label(partial: Label): Label {
  return partial;
}

export function sampleProject(): Project {
  const switches = "group-switches";
  const panels = "group-panels";
  const parts = "group-parts";
  return {
    version: 1,
    name: "Workshop labels",
    masterHeight: null,
    groups: [
      group({
        id: switches,
        name: "Switches",
        masterHeight: 12,
        masterTypefaceId: "inter-semibold",
        masterFontSize: 5,
        padding: 1.4,
        align: "center",
        vAlign: "middle",
        radius: 0.5,
        tracking: 0.08,
        lineGap: 0.35,
      }),
      group({
        id: panels,
        name: "Panels",
        masterHeight: 22,
        masterTypefaceId: "space-grotesk",
        masterFontSize: 9,
        padding: 2,
        align: "center",
        vAlign: "middle",
        radius: 0,
        tracking: 0,
        lineGap: 0.5,
      }),
      group({
        id: parts,
        name: "Parts",
        masterHeight: 8,
        masterTypefaceId: "plex-mono",
        masterFontSize: 3.2,
        padding: 0.7,
        align: "center",
        vAlign: "middle",
        radius: 0,
        tracking: 0.02,
        lineGap: 0.25,
      }),
    ],
    labels: [
      label({ id: "on", groupId: switches, text: "ON", width: 32, height: 12, heightMode: "group", typefaceId: "inter-semibold", typefaceMode: "group", fontSize: 5, fontSizeMode: "group" }),
      label({ id: "off", groupId: switches, text: "OFF", width: 32, height: 12, heightMode: "group", typefaceId: "inter-semibold", typefaceMode: "group", fontSize: 5, fontSizeMode: "group" }),
      label({ id: "reset", groupId: switches, text: "RESET", width: 48, height: 12, heightMode: "group", typefaceId: "inter-semibold", typefaceMode: "group", fontSize: 5, fontSizeMode: "group" }),
      label({ id: "hold", groupId: switches, text: "HOLD", width: 40, height: 18, heightMode: "custom", typefaceId: "inter-semibold", typefaceMode: "group", fontSize: 5, fontSizeMode: "group" }),
      label({ id: "emergency", groupId: switches, text: "EMERGENCY", width: 26, height: 12, heightMode: "group", typefaceId: "inter-semibold", typefaceMode: "group", fontSize: 5, fontSizeMode: "group" }),
      label({ id: "power", groupId: panels, text: "POWER", width: 78, height: 22, heightMode: "group", typefaceId: "space-grotesk", typefaceMode: "group", fontSize: 9, fontSizeMode: "group" }),
      label({ id: "aux", groupId: panels, text: "AUX", width: 52, height: 22, heightMode: "group", typefaceId: "space-grotesk", typefaceMode: "group", fontSize: 9, fontSizeMode: "group" }),
      label({ id: "dimmer", groupId: panels, text: "DIMMER", width: 72, height: 22, heightMode: "group", typefaceId: "space-grotesk", typefaceMode: "group", fontSize: 9, fontSizeMode: "group" }),
      label({ id: "sn", groupId: parts, text: "SN-2041", width: 38, height: 8, heightMode: "group", typefaceId: "plex-mono", typefaceMode: "group", fontSize: 3.2, fontSizeMode: "group" }),
      label({ id: "rev", groupId: parts, text: "REV C", width: 26, height: 8, heightMode: "group", typefaceId: "plex-mono", typefaceMode: "group", fontSize: 3.2, fontSizeMode: "group" }),
      label({ id: "volts", groupId: parts, text: "5V 2A", width: 30, height: 8, heightMode: "group", typefaceId: "plex-mono", typefaceMode: "group", fontSize: 3.2, fontSizeMode: "group" }),
      label({ id: "fuse", groupId: parts, text: "FUSE 2A", width: 40, height: 14, heightMode: "custom", typefaceId: "inter-semibold", typefaceMode: "custom", fontSize: 4.5, fontSizeMode: "custom" }),
    ],
    sheet: {
      preset: "a4",
      width: 210,
      height: 297,
      margin: 14,
      gap: 6,
      showDimensions: true,
      showCalibration: true,
    },
    plate: {
      preset: "a350",
      width: 320,
      height: 350,
      margin: 8,
      gap: 4,
      outline: true,
      outlineMode: "cut",
    },
  };
}
