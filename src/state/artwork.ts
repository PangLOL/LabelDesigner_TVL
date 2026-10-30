import { useMemo } from "react";
import { plateFrame, paginate, sheetBanner, sheetFrame } from "../model/layout";
import { DIMENSION_FONT_ID, FALLBACK_FONT_ID } from "../model/fonts";
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
    const frame = sheetFrame(project);
    const banner = sheetBanner(fonts.get(DIMENSION_FONT_ID) ?? fonts.get(FALLBACK_FONT_ID), project.name, project.description, frame.width, frame.margin);
    const sheetPages = paginate(resolved, frame, { groupRows: true, firstPageTop: banner.contentTop });
    const platePages = paginate(resolved, plateFrame(project));
    const oversized = (pages: typeof sheetPages) =>
      new Set(pages.flatMap((page) => page.placements.filter((item) => item.oversized).map((item) => item.label.id)));
    return {
      resolved,
      arts,
      sheetPages,
      platePages,
      banner,
      sheetOver: oversized(sheetPages),
      plateOver: oversized(platePages),
      ready,
      custom,
      fonts,
    };
  }, [project, fonts, ready, custom, pending]);
}
