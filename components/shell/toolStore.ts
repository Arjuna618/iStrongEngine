import { useSyncExternalStore } from 'react';
import type { Tool } from './engineTools';

let current: Tool = 'tank';
const subs = new Set<() => void>();

export const toolStore = {
  get(): Tool { return current; },
  set(t: Tool): void { if (t === current) return; current = t; subs.forEach(f => f()); },
  subscribe(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; },
};

export function useActiveTool(): Tool {
  return useSyncExternalStore(toolStore.subscribe, toolStore.get, toolStore.get);
}

export function useIsActiveTool(t: Tool): boolean {
  const get = () => current === t;
  return useSyncExternalStore(toolStore.subscribe, get, get);
}
