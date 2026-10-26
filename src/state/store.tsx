import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from "react";
import type { Project } from "../types";
import { labelsInGroupOrder } from "../model/resolve";
import { reducer, type Action } from "../model/reducer";
import { sampleProject } from "../model/sample";
import { sanitizeProject } from "../model/project";

const STORAGE_KEY = "label-designer.project.v1";

interface StoreValue {
  project: Project;
  dispatch: Dispatch<Action>;
  selected: Set<string>;
  setSelected: (ids: Set<string>) => void;
  toggleSelected: (id: string, shift: boolean, meta: boolean) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function loadProject(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sampleProject();
    return sanitizeProject(JSON.parse(raw)) ?? sampleProject();
  } catch {
    return sampleProject();
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [project, dispatch] = useReducerProject();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    const ids = new Set(project.labels.map((label) => label.id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [project.labels]);

  const toggleSelected = (id: string, shift: boolean, meta: boolean) => {
    const order = labelsInGroupOrder(project).map((label) => label.id);
    setSelected((current) => {
      if (shift && anchor.current) {
        const start = order.indexOf(anchor.current);
        const end = order.indexOf(id);
        if (start >= 0 && end >= 0) {
          const [from, to] = start < end ? [start, end] : [end, start];
          return new Set(order.slice(from, to + 1));
        }
      }
      if (meta) {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        anchor.current = id;
        return next;
      }
      anchor.current = id;
      return new Set([id]);
    });
  };

  const value = useMemo(
    () => ({ project, dispatch, selected, setSelected, toggleSelected }),
    [project, selected],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useReducerProject(): [Project, Dispatch<Action>] {
  const [project, setProject] = useState<Project>(loadProject);
  const dispatch: Dispatch<Action> = (action) => {
    setProject((current) => reducer(current, action));
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [project]);
  return [project, dispatch];
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}
