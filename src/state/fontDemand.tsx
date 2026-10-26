import { useEffect, useMemo } from "react";
import { resolveAll } from "../model/resolve";
import { useFonts } from "./fonts";
import { useStore } from "./store";

/** Download a deferred typeface once a label actually uses it. */
export function FontDemand() {
  const { project } = useStore();
  const { ensureFonts } = useFonts();
  const key = useMemo(() => {
    const ids = new Set<string>();
    for (const label of resolveAll(project)) ids.add(label.typefaceId);
    return [...ids].sort().join("\n");
  }, [project]);

  useEffect(() => {
    ensureFonts(key.split("\n").filter(Boolean));
  }, [key, ensureFonts]);

  return null;
}
