import { useSyncExternalStore } from 'react';

let _open = false;
let _shown = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

export const hubWindow = {
  get(): boolean { return _open; },
  shown(): boolean { return _shown; },
  set(v: boolean): void { if (_open === v) return; _open = v; if (v) _shown = true; emit(); },
  toggle(): void { hubWindow.set(!_open); },
  closed(): void { if (_open || !_shown) return; _shown = false; emit(); },
  subscribe(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; },
};

export function useHubOpen(): boolean {
  return useSyncExternalStore(hubWindow.subscribe, hubWindow.get, hubWindow.get);
}

export function useHubShown(): boolean {
  return useSyncExternalStore(hubWindow.subscribe, hubWindow.shown, hubWindow.shown);
}
