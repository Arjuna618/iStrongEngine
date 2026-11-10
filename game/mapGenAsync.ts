import { generateMap, generateMultiAreaMap, primeMazeMemo } from './MapSystem';
import { ensureNavScratch } from './Navigation';
import { SMALL_FIX } from './smallFixSwitch';
import type { MapConfig, MapState, MultiAreaMapConfig } from '@/types';
import type { MapWorkerResponse, MultiAreaResult } from './mapWorker';

function growNavScratchFor(st: MapState): void {
  const nav = SMALL_FIX.CH034 !== 0 ? st.navigation : null;
  if (nav) ensureNavScratch(nav.gridCells * nav.gridCellsY);
}

let _worker: Worker | null = null;
let _nextGenId = 0;

type PendingEntry =
  | { kind: 'single'; resolve: (state: MapState) => void; reject: (err: Error) => void }
  | { kind: 'multi'; resolve: (result: MultiAreaResult) => void; reject: (err: Error) => void };

const _pending = new Map<number, PendingEntry>();

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL('./mapWorker.ts', import.meta.url), { type: 'module' });

    _worker.onmessage = (e: MessageEvent<MapWorkerResponse>) => {
      const data = e.data;
      const entry = _pending.get(data.genId);
      if (!entry) {
        return;
      }
      _pending.delete(data.genId);
      if (data.kind === 'single' && entry.kind === 'single') {
        primeMazeMemo(data.runs);
        growNavScratchFor(data.state);
        entry.resolve(data.state);
      } else if (data.kind === 'multi' && entry.kind === 'multi') {
        primeMazeMemo(data.runs, data.result.areaStates.length);
        for (let i = 0; i < data.result.areaStates.length; i++) growNavScratchFor(data.result.areaStates[i]);
        entry.resolve(data.result);
      } else {
        entry.reject(new Error('Map worker response kind mismatch'));
      }
    };

    _worker.onerror = (err) => {
      for (const [, entry] of _pending) {
        entry.reject(new Error('Map worker error: ' + err.message));
      }
      _pending.clear();
      _worker?.terminate();
      _worker = null;
    };
  }
  return _worker;
}

export function abortPendingMapGen(): void {
  if (_pending.size === 0) return;
  for (const [, entry] of _pending) entry.reject(new Error('map-gen superseded'));
  _pending.clear();
  _worker?.terminate();
  _worker = null;
}

export function generateMapAsync(config: MapConfig): { promise: Promise<MapState>; genId: number } {
  abortPendingMapGen();
  const genId = ++_nextGenId;

  if (typeof Worker === 'undefined') {
    return { promise: Promise.resolve(generateMap(config)), genId };
  }

  const promise = new Promise<MapState>((resolve, reject) => {
    _pending.set(genId, { kind: 'single', resolve, reject });
    getWorker().postMessage({ kind: 'single', config, genId });
  });

  return { promise, genId };
}

export function generateMultiAreaMapAsync(
  multiConfig: MultiAreaMapConfig
): { promise: Promise<MultiAreaResult>; genId: number } {
  abortPendingMapGen();
  const genId = ++_nextGenId;

  if (typeof Worker === 'undefined') {
    return { promise: Promise.resolve(generateMultiAreaMap(multiConfig)), genId };
  }

  const promise = new Promise<MultiAreaResult>((resolve, reject) => {
    _pending.set(genId, { kind: 'multi', resolve, reject });
    getWorker().postMessage({ kind: 'multi', multiConfig, genId });
  });

  return { promise, genId };
}

export function getLatestGenId(): number {
  return _nextGenId;
}
