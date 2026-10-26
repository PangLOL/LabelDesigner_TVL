import { load, parse, type Font } from "opentype.js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BUILTIN_FONTS, FALLBACK_FONT_ID } from "../model/fonts";
import { createId } from "../model/id";
import { deleteStoredFont, listStoredFonts, saveStoredFont } from "./fontDb";

export interface CustomFont {
  id: string;
  name: string;
}

interface FontContextValue {
  fonts: Map<string, Font>;
  custom: CustomFont[];
  pending: ReadonlySet<string>;
  failed: ReadonlySet<string>;
  ready: boolean;
  error: string | null;
  ensureFonts: (ids: readonly string[]) => void;
  addFontFile: (file: File) => Promise<void>;
  removeFont: (id: string) => Promise<void>;
}

const FontContext = createContext<FontContextValue | null>(null);

function fontTitle(font: Font, fileName: string): string {
  const full = font.getEnglishName("fullName");
  const family = font.getEnglishName("fontFamily");
  return (full || family || fileName.replace(/\.[^.]+$/, "")).trim() || "Custom font";
}

export function FontProvider({ children }: { children: ReactNode }) {
  const [fonts, setFonts] = useState<Map<string, Font>>(new Map());
  const [custom, setCustom] = useState<CustomFont[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(new Set<string>());

  const ensureFonts = useCallback((ids: readonly string[]) => {
    for (const id of ids) {
      const definition = BUILTIN_FONTS.find((font) => font.id === id);
      if (!definition?.defer || started.current.has(id)) continue;
      started.current.add(id);
      setPending((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
      load(definition.url)
        .then((font) => {
          setFonts((current) => {
            const next = new Map(current);
            next.set(id, font);
            return next;
          });
          setFailed((current) => {
            if (!current.has(id)) return current;
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        })
        .catch(() => {
          started.current.delete(id);
          setFailed((current) => {
            const next = new Set(current);
            next.add(id);
            return next;
          });
        })
        .finally(() => {
          setPending((current) => {
            if (!current.has(id)) return current;
            const next = new Set(current);
            next.delete(id);
            return next;
          });
        });
    }
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const map = new Map<string, Font>();
      await Promise.all(
        BUILTIN_FONTS.filter((definition) => !definition.defer).map(async (definition) => {
          try {
            map.set(definition.id, await load(definition.url));
          } catch {
            /* A missing face is reported after the rest load. */
          }
        }),
      );
      const added: CustomFont[] = [];
      try {
        const stored = await listStoredFonts();
        for (const item of stored) {
          try {
            map.set(item.id, parse(item.buffer.slice(0)));
            added.push({ id: item.id, name: item.name });
          } catch {
            /* Skip a font the browser can no longer parse. */
          }
        }
      } catch {
        /* IndexedDB can be unavailable. Built-in faces still work. */
      }
      if (cancel) return;
      setFonts((current) => {
        const next = new Map(current);
        for (const [id, font] of map) next.set(id, font);
        return next;
      });
      setCustom(added);
      setReady(true);
      if (!map.has(FALLBACK_FONT_ID)) setError("Inter did not load, so labels cannot be drawn yet.");
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const addFontFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    let font: Font;
    try {
      font = parse(buffer.slice(0));
    } catch {
      throw new Error("Use a TTF, OTF, or WOFF file.");
    }
    const id = `custom-${createId()}`;
    const name = fontTitle(font, file.name);
    try {
      await saveStoredFont({ id, name, buffer: buffer.slice(0) });
    } catch {
      /* Keep the face for this session even if storage refuses it. */
    }
    setFonts((current) => {
      const next = new Map(current);
      next.set(id, font);
      return next;
    });
    setCustom((current) => [...current, { id, name }]);
  }, []);

  const removeFont = useCallback(async (id: string) => {
    try {
      await deleteStoredFont(id);
    } catch {
      /* Still drop it from the session. */
    }
    setFonts((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
    setCustom((current) => current.filter((font) => font.id !== id));
  }, []);

  const value = useMemo(
    () => ({ fonts, custom, pending, failed, ready, error, ensureFonts, addFontFile, removeFont }),
    [fonts, custom, pending, failed, ready, error, ensureFonts, addFontFile, removeFont],
  );

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

export function useFonts(): FontContextValue {
  const value = useContext(FontContext);
  if (!value) throw new Error("useFonts must be used inside FontProvider");
  return value;
}
