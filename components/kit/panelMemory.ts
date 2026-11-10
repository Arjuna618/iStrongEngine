import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PanelsData } from '../../game/project/sections';

let folds: Record<string, boolean> = {};
let values: Record<string, unknown> = {};
let scrolls: Record<string, number> = {};
let applied = 0;
const subs = new Set<() => void>();
let onChange: () => void = () => {};

function notifyChange(): void { onChange(); }

export const panelMemory = {
  setOnChange(fn: () => void): void { onChange = fn; },
  version(): number { return applied; },
  subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; },
  fold(key: string): boolean | undefined { return folds[key]; },
  setFold(key: string, open: boolean): void { if (folds[key] === open) return; folds = { ...folds, [key]: open }; notifyChange(); },
  value(key: string): unknown { return values[key]; },
  setValue(key: string, v: unknown): void { if (values[key] === v) return; values = { ...values, [key]: v }; notifyChange(); },
  capture(tool: string): PanelsData {
    const scroll: Record<string, number> = { ...scrolls };
    if (typeof document !== 'undefined') {
      document.querySelectorAll<HTMLElement>('[data-tool-layer]').forEach(layer => {
        const sc = layer.querySelector<HTMLElement>('.tool-scrollbar');
        const t = layer.dataset.toolLayer;
        if (sc && t && sc.clientHeight > 0) scroll[t] = Math.round(sc.scrollTop);
      });
    }
    scrolls = scroll;
    return { tool, folds: { ...folds }, values: { ...values }, scroll };
  },
  apply(p: PanelsData): void {
    folds = { ...p.folds };
    values = { ...p.values };
    scrolls = { ...p.scroll };
    applied++;
    subs.forEach(f => f());
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.querySelectorAll<HTMLElement>('[data-tool-layer]').forEach(layer => {
          const t = layer.dataset.toolLayer;
          const sc = layer.querySelector<HTMLElement>('.tool-scrollbar');
          if (t && sc) sc.scrollTop = typeof scrolls[t] === 'number' ? scrolls[t] : 0;
        });
      }));
    }
  },
};

export const PanelScope = createContext<string | null>(null);

export function usePanelsVersion(): number {
  return useSyncExternalStore(panelMemory.subscribe, panelMemory.version, panelMemory.version);
}

export function usePanelMemory<T>(key: string, initial: T, valid?: (v: unknown) => boolean): [T, (v: T | ((prev: T) => T)) => void] {
  const ver = usePanelsVersion();
  const read = (): T => { const v = panelMemory.value(key); return v === undefined || (valid && !valid(v)) ? initial : (v as T); };
  const [val, setVal] = useState<T>(read);
  const cur = useRef(val);
  cur.current = val;
  const seen = useRef(ver);
  useEffect(() => { if (seen.current !== ver) { seen.current = ver; setVal(read()); } });
  const set = useCallback((v: T | ((prev: T) => T)) => {
    const n = typeof v === 'function' ? (v as (prev: T) => T)(cur.current) : v;
    cur.current = n;
    setVal(n);
    panelMemory.setValue(key, n);
  }, [key]);
  return [val, set];
}

export const isBool = (v: unknown): boolean => typeof v === 'boolean';
export const isText = (max = 200) => (v: unknown): boolean => typeof v === 'string' && v.length <= max;
export const isOneOf = (list: readonly unknown[]) => (v: unknown): boolean => list.includes(v);

export function usePanelScope(): string | null { return useContext(PanelScope); }
