import React, { useEffect, useSyncExternalStore } from 'react';
import type { TurretActionBar } from '../shared/TurretActionBar';

export type PlacementBarProps = Omit<React.ComponentProps<typeof TurretActionBar>, 'part'>;

let _bar: PlacementBarProps | null = null;
let _latest: PlacementBarProps | null = null;
const _listeners = new Set<() => void>();
const _delegates = new Map<string, (...a: unknown[]) => unknown>();
function _delegate(k: string): (...a: unknown[]) => unknown {
  let d = _delegates.get(k);
  if (d === undefined) {
    d = (...a: unknown[]) => { const f = (_latest as Record<string, unknown> | null)?.[k]; return typeof f === 'function' ? (f as (...x: unknown[]) => unknown)(...a) : undefined; };
    _delegates.set(k, d);
  }
  return d;
}
function _sameValues(a: PlacementBarProps, b: PlacementBarProps): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>, rb = b as Record<string, unknown>;
  for (const k of kb) {
    const va = ra[k], vb = rb[k];
    if (typeof vb === 'function') { if (typeof va !== 'function') return false; continue; }
    if (va !== vb) return false;
  }
  return true;
}
const publish = (b: PlacementBarProps | null) => {
  _latest = b;
  if (b === null) { if (_bar === null) return; _bar = null; }
  else {
    if (_bar !== null && _sameValues(_bar, b)) return;
    const snap: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b)) snap[k] = typeof v === 'function' ? _delegate(k) : v;
    _bar = snap as PlacementBarProps;
  }
  _listeners.forEach(l => l());
};
const subscribe = (l: () => void) => { _listeners.add(l); return () => { _listeners.delete(l); }; };

let _barSub = false;
export function placementBarIsSub(): boolean { return _barSub; }
const snapshot = () => _bar;

export function usePlacementBar(): PlacementBarProps | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export const PlacementBar: React.FC<{ bar: PlacementBarProps; sub: boolean }> = ({ bar, sub }) => {
  useEffect(() => { _barSub = sub; publish(bar); });
  useEffect(() => () => publish(null), []);
  return null;
};
