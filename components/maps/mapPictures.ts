import type { MapConfig, MultiAreaMapConfig } from '../../types';
import type { MmMap, MmWorldArea } from '../minimapPicture';
import { mmMapOf, type MazePicFile, type ModePicFile } from './mapPicData';
import type { PicRequest, PicResponse } from './mapPictureWorker';
import { cardAreaLayout } from './mapCatalog';

export type MapPic =
  | { kind: 'one'; map: MmMap; seedUsed: number }
  | { kind: 'world'; areas: MmWorldArea[]; minX: number; minY: number; w: number; h: number };

const KEEP = 160;
const kept = new Map<string, MapPic | 'fail'>();
const built = new Map<string, MapPic>();
const has = (key: string): boolean => kept.has(key) || built.has(key);
const subs = new Set<() => void>();
let version = 0;
function changed(): void { version++; subs.forEach(f => f()); }
function keep(key: string, p: MapPic | 'fail'): void {
  kept.delete(key);
  kept.set(key, p);
  while (kept.size > KEEP) { const k = kept.keys().next().value; if (k === undefined) break; kept.delete(k); }
}

export const mapPictures = {
  subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; },
  version(): number { return version; },
  get(key: string): MapPic | 'fail' | undefined { return kept.get(key) ?? built.get(key); },
};

export const mazePicKey = (type: number, seed: number) => `maze:${type}:${seed}`;
export const minePicKey = (id: string, loadedAt: number) => `mine:${id}:${loadedAt}`;
export const modePicKey = (key: string) => `mode:${key}`;

let builtLoad: Promise<void> | null = null;
let builtFailed = false;
export function builtMazePicturesFailed(): boolean { return builtFailed; }
export function loadBuiltMazePictures(): Promise<void> {
  if (builtLoad) return builtLoad;
  builtLoad = Promise.all([import('./mazePictures.generated.json'), import('./modePictures.generated.json')]).then(([m, n]) => {
    const f = (m as unknown as { default: MazePicFile }).default ?? (m as unknown as MazePicFile);
    for (const e of f.maps) {
      const key = mazePicKey(e.type, e.seed);
      if (!built.has(key)) built.set(key, { kind: 'one', map: mmMapOf(e), seedUsed: e.seedUsed });
    }
    const g = (n as unknown as { default: ModePicFile }).default ?? (n as unknown as ModePicFile);
    for (const e of g.modes) {
      const key = modePicKey(e.key);
      if (!built.has(key)) built.set(key, { kind: 'one', map: mmMapOf(e), seedUsed: e.seedUsed });
    }
    changed();
  }).catch(() => { builtLoad = null; builtFailed = true; changed(); });
  return builtLoad;
}

type Job = { key: string; req: { kind: 'single'; config: MapConfig } | { kind: 'multi'; mac: MultiAreaMapConfig } };
let worker: Worker | null = null;
let running: { id: number; job: Job } | null = null;
let nextId = 0;
const queue: Job[] = [];

function start(): void {
  if (running || queue.length === 0) return;
  const job = queue.pop()!;
  if (has(job.key)) { start(); return; }
  if (typeof Worker === 'undefined') { keep(job.key, 'fail'); changed(); return; }
  if (!worker) {
    worker = new Worker(new URL('./mapPictureWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PicResponse>) => {
      const r = e.data;
      if (!running || r.id !== running.id) return;
      const job = running.job;
      running = null;
      keep(job.key, picOfResponse(job, r));
      changed();
      start();
    };
    worker.onerror = () => {
      if (running) { keep(running.job.key, 'fail'); running = null; changed(); }
      worker?.terminate(); worker = null;
      start();
    };
  }
  const id = ++nextId;
  running = { id, job };
  const msg: PicRequest = job.req.kind === 'single' ? { id, kind: 'single', config: job.req.config } : { id, kind: 'multi', mac: job.req.mac };
  worker.postMessage(msg);
}

function picOfResponse(job: Job, r: PicResponse): MapPic | 'fail' {
  if (!r.ok) return 'fail';
  if (r.kind === 'single') return { kind: 'one', map: mmMapOf(r.data), seedUsed: r.seedUsed };
  if (job.req.kind !== 'multi') return 'fail';
  const L = cardAreaLayout(job.req.mac);
  const areas: MmWorldArea[] = [];
  for (const a of r.areas) {
    const box = L.areas.find(b => b.id === a.id);
    if (box) areas.push({ ms: mmMapOf(a.data), minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY, offX: a.offX, offY: a.offY });
  }
  return { kind: 'world', areas, minX: L.minX, minY: L.minY, w: L.maxX - L.minX, h: L.maxY - L.minY };
}

export function requestMapPicture(key: string, req: Job['req']): void {
  if (has(key) || (running && running.job.key === key)) return;
  const at = queue.findIndex(j => j.key === key);
  if (at >= 0) queue.splice(at, 1);
  queue.push({ key, req });
  start();
}

export function releaseMapPictures(): void {
  queue.length = 0;
  running = null;
  if (worker) { worker.terminate(); worker = null; }
}
