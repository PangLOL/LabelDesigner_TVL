export const GROUP_SWATCHES = [
  "#c4491d",
  "#1f5c45",
  "#20456e",
  "#6e4b16",
  "#6b2d44",
  "#3f4a34",
] as const;

export function groupSwatch(index: number): string {
  return GROUP_SWATCHES[index % GROUP_SWATCHES.length];
}
