export const GUARD_FRAME_MS = 1500;
export const GUARD_SLOW_MS = 200, GUARD_SLOW_SUM_MS = 2400, GUARD_WINDOW_MS = 3000;
export const GUARD_HEAP_SHARE = 0.9, GUARD_HEAP_EVERY_MS = 1000;

export interface GuardHost {
  state: { isTestMode: boolean; paused: boolean };
  crashGuardOn: boolean;
  spawnerDebugCount(): number;
  crashGuardTrip(): void;
}

let _winStart = 0, _slowSum = 0, _heapAt = 0;

export function guardNoteFrame(g: GuardHost, frameMs: number, now: number): void {
  if (g.crashGuardOn || !g.state.isTestMode || g.state.paused) { _slowSum = 0; _winStart = now; return; }
  if (now - _winStart > GUARD_WINDOW_MS) { _winStart = now; _slowSum = 0; }
  let trip = false;
  if (frameMs > GUARD_FRAME_MS) trip = true;
  else if (frameMs > GUARD_SLOW_MS) { _slowSum += frameMs; if (_slowSum >= GUARD_SLOW_SUM_MS) trip = true; }
  if (!trip && now - _heapAt > GUARD_HEAP_EVERY_MS) {
    _heapAt = now;
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    if (m && m.jsHeapSizeLimit > 0 && m.usedJSHeapSize / m.jsHeapSizeLimit >= GUARD_HEAP_SHARE) trip = true;
  }
  if (!trip) return;
  _slowSum = 0; _winStart = now;
  if (g.spawnerDebugCount() <= 0) return;
  g.crashGuardTrip();
}

let _shown = false;
const _subs = new Set<() => void>();
export const crashGuardStore = {
  get: (): boolean => _shown,
  subscribe: (fn: () => void): (() => void) => { _subs.add(fn); return () => { _subs.delete(fn); }; },
  set(v: boolean): void { if (v === _shown) return; _shown = v; for (const fn of _subs) fn(); },
};
