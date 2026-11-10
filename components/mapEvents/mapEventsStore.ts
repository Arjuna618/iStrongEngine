import { useSyncExternalStore } from 'react';

export interface MapEventsOpen { areaId: string; page: string; focus: number | null; }
let _open: MapEventsOpen | null = null;
const _subs = new Set<() => void>();
const tell = () => _subs.forEach(f => f());

export function openMapEvents(areaId: string, page = 'overview', focus: number | null = null): void { _open = { areaId, page, focus }; tell(); }
let _test: (() => void) | null = null;
export function setEngineTestDoor(fn: (() => void) | null): void { _test = fn; }
export function runEngineTest(): void { _test?.(); }
export function closeMapEvents(): void { _open = null; tell(); }
export function useMapEventsOpen(): MapEventsOpen | null {
  return useSyncExternalStore(f => { _subs.add(f); return () => { _subs.delete(f); }; }, () => _open);
}
