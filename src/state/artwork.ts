import { useMemo } from "react";
import { plateFrame, paginate, sheetFrame } from "../model/layout";
import { resolveAll } from "../model/resolve";
import { buildArtMap } from "../model/text";
import { useFonts } from "./fonts";
import { useStore } from "./store";

export function useArtwork() {
  const { project } = useStore();
  const { fonts, ready, custom, pending } = useFonts();
  return useMemo(() => {
    const resolved = resolveAll(project);
    const arts = buildArtMap(resolved, fonts, pending);
    const sheetPages = paginate(resolved, sheetFrame(project), { groupRows: true });
    const platePages = paginate(resolved, plateFrame(project));
    const oversized = (pages: typeof sheetPages) =>
      new Set(pages.flatMap((page) => page.placements.filter((item) => item.oversized).map((item) => item.label.id)));
    return {
      resolved,
      arts,
      sheetPages,
      platePages,
      sheetOver: oversized(sheetPages),
      plateOver: oversized(platePages),
      ready,
      custom,
      fonts,
    };
  }, [project, fonts, ready, custom, pending]);
}
