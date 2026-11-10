import type { MapConfig } from '../types';
import { WALL_RULES, BODY_PASS, ROUND_PASS } from './wallTypes';

export const MAGIC_MAZE_TYPE = 30;
export const MAGIC_MAZE_MIN_GRID = 9;
export const MAGIC_MAZE = {
  ON: !(typeof process !== 'undefined' && !!process.env && process.env.ISTRONG_OLD_MAGIC_MAZE === '1'),
  ONE_WAY_NAV: true,
  BOT_VIEW: true,
  TRICK_OPEN: true,
  TRICK_HIDE: true,
  TW_INDEX: true,
};

const WT_N = 19;
const WT_PLAIN = 0, WT_DEADLY = 1, WT_BOUNCY = 3, WT_BREAKER = 4, WT_CHUNKS = 5, WT_OPTICAL = 6;
const WT_UP = 7, WT_DOWN = 8, WT_LEFT = 9, WT_RIGHT = 10, WT_STICKY = 11, WT_TRICK = 12;

export interface MagicMazeConfig {
  cornerMin: number;
  cornerMax: number;
  sideShare: number;
  ring: number;
  types: number[];
  moving: boolean;
  perMinute: number;
  slide: number;
  rest: number;
  edge: number;
  still: number[];
}

function defaultTypes(): number[] {
  const t = new Array<number>(WT_N).fill(0);
  t[WT_PLAIN] = 52; t[WT_TRICK] = 5.5; t[WT_STICKY] = 10.5; t[WT_BOUNCY] = 9.5;
  t[WT_UP] = 2.1; t[WT_DOWN] = 2.1; t[WT_LEFT] = 2.1; t[WT_RIGHT] = 2.1;
  t[WT_DEADLY] = 6; t[WT_CHUNKS] = 3; t[WT_BREAKER] = 2.6; t[WT_OPTICAL] = 2.5;
  return t;
}

export function magicMazeDefaults(): MagicMazeConfig {
  return { cornerMin: 60, cornerMax: 97, sideShare: 48, ring: 1, types: defaultTypes(), moving: true, perMinute: 1.2, slide: 1.99, rest: 0, edge: 4, still: [] };
}

export const MM_BOUNDS = {
  fill: [0, 100], share: [0, 200], ring: [0, 6], chance: [0, 100], perMinute: [0, 10], slide: [0.5, 10], rest: [0, 60], edge: [0, 50],
} as const;

const clampN = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? (v < lo ? lo : v > hi ? hi : v) : d;

export function magicMazeOf(c: Pick<MapConfig, 'magicMaze'> | null | undefined): MagicMazeConfig {
  const d = magicMazeDefaults();
  const m = c && c.magicMaze && typeof c.magicMaze === 'object' ? c.magicMaze as Partial<MagicMazeConfig> : null;
  if (m === null) return d;
  let lo = clampN(m.cornerMin, 0, 100, d.cornerMin), hi = clampN(m.cornerMax, 0, 100, d.cornerMax);
  if (hi < lo) { const s = lo; lo = hi; hi = s; }
  const types = d.types.slice();
  if (Array.isArray(m.types)) for (let i = 0; i < WT_N; i++) types[i] = clampN(m.types[i], 0, 100, 0);
  const still: number[] = [];
  if (Array.isArray(m.still)) for (const s of m.still) if (Number.isInteger(s) && s >= 0 && s < WT_N && still.indexOf(s) < 0) still.push(s);
  return {
    cornerMin: lo, cornerMax: hi,
    sideShare: clampN(m.sideShare, MM_BOUNDS.share[0], MM_BOUNDS.share[1], d.sideShare),
    ring: Math.round(clampN(m.ring, MM_BOUNDS.ring[0], MM_BOUNDS.ring[1], d.ring)),
    types,
    moving: typeof m.moving === 'boolean' ? m.moving : d.moving,
    perMinute: clampN(m.perMinute, MM_BOUNDS.perMinute[0], MM_BOUNDS.perMinute[1], d.perMinute),
    slide: clampN(m.slide, MM_BOUNDS.slide[0], MM_BOUNDS.slide[1], d.slide),
    rest: clampN(m.rest, MM_BOUNDS.rest[0], MM_BOUNDS.rest[1], d.rest),
    edge: Math.round(clampN(m.edge, MM_BOUNDS.edge[0], MM_BOUNDS.edge[1], d.edge)),
    still,
  };
}

export function cleanMagicMazeField(data: { magicMaze?: unknown }): void {
  if (data.magicMaze === undefined) return;
  if (data.magicMaze === null || typeof data.magicMaze !== 'object' || Array.isArray(data.magicMaze)) { delete data.magicMaze; return; }
  data.magicMaze = magicMazeOf(data as Pick<MapConfig, 'magicMaze'>);
}

export function mmRandom(seed: number): () => number {
  let a = (seed ^ 0x6d4d617a) | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollWallType(types: readonly number[], r: number): number {
  let sum = 0;
  for (let i = 0; i < WT_N; i++) sum += types[i] > 0 ? types[i] : 0;
  if (!(sum > 0)) return WT_PLAIN;
  let x = r * sum;
  for (let i = 0; i < WT_N; i++) {
    const w = types[i] > 0 ? types[i] : 0;
    if (w <= 0) continue;
    if (x < w) return i;
    x -= w;
  }
  for (let i = WT_N - 1; i >= 0; i--) if (types[i] > 0) return i;
  return WT_PLAIN;
}

export interface MagicLattice {
  gx0: number; gy0: number;
  nx: number; ny: number;
  cfg: MagicMazeConfig;
  seed: number;
  floor: Uint8Array;
}

export function spotKind(i: number, j: number): number {
  const ei = (i & 1) === 0, ej = (j & 1) === 0;
  return ei && ej ? 0 : ei || ej ? 1 : 2;
}

export function latticeIn(bx: number, by: number, w: number, h: number, cfg: MagicMazeConfig, seed: number): MagicLattice | null {
  const r = cfg.ring;
  let nx = w - 2 * r, ny = h - 2 * r;
  if (nx % 2 === 0) nx--;
  if (ny % 2 === 0) ny--;
  if (nx < 3 || ny < 3) return null;
  return { gx0: bx + r, gy0: by + r, nx, ny, cfg, seed, floor: new Uint8Array(nx * ny) };
}

export function rollMagicWalls(L: MagicLattice, out: number[]): void {
  out.length = 0;
  const cfg = L.cfg, rnd = mmRandom(L.seed);
  const pc = (cfg.cornerMin + (cfg.cornerMax - cfg.cornerMin) * rnd()) / 100;
  const ps = Math.min(1, pc * cfg.sideShare / 100);
  const nx = L.nx, ny = L.ny;
  const wall = new Int8Array(nx * ny).fill(-1);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const k = spotKind(i, j);
    if (k === 2) continue;
    if (rnd() < (k === 0 ? pc : ps)) wall[i * ny + j] = 0;
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const c = i * ny + j;
    if (wall[c] >= 0) wall[c] = rollWallType(cfg.types, rnd());
  }
  if (!movesAtAll(cfg)) openPockets(wall, nx, ny);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const t = wall[i * ny + j];
    if (t >= 0) out.push(i, j, t);
  }
}

export function mmOpenKind(kind: number | undefined): boolean {
  if (!MAGIC_MAZE.TRICK_OPEN || kind === undefined || kind <= 0) return false;
  const r = WALL_RULES[kind];
  return r !== undefined && r.body === BODY_PASS && r.round === ROUND_PASS;
}

export function movesAtAll(cfg: MagicMazeConfig): boolean {
  if (!cfg.moving || !(cfg.perMinute > 0)) return false;
  return cfg.still.length < WT_N;
}

function openPockets(wall: Int8Array, nx: number, ny: number): void {
  const N = nx * ny;
  const reach = new Uint8Array(N), cost = new Int32Array(N), prev = new Int32Array(N);
  const q = new Int32Array(N), dq = new Int32Array(2 * N + 2);
  const DI = [1, -1, 0, 0], DJ = [0, 0, 1, -1];
  const open = (c: number): boolean => wall[c] < 0 || mmOpenKind(wall[c]);
  for (let guard = 0; guard < N; guard++) {
    reach.fill(0);
    let h = 0, t = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      if (i !== 0 && j !== 0 && i !== nx - 1 && j !== ny - 1) continue;
      const c = i * ny + j;
      if (open(c) && !reach[c]) { reach[c] = 1; q[t++] = c; }
    }
    while (h < t) {
      const c = q[h++], i = (c / ny) | 0, j = c - i * ny;
      for (let d = 0; d < 4; d++) {
        const a = i + DI[d], b = j + DJ[d];
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const n = a * ny + b;
        if (reach[n] || !open(n)) continue;
        reach[n] = 1; q[t++] = n;
      }
    }
    let seed = -1;
    for (let c = 0; c < N && seed < 0; c++) if (!reach[c] && open(c)) seed = c;
    if (seed < 0) return;
    cost.fill(0x3fffffff); prev.fill(-1);
    let lo = N + 1, hi = N + 1;
    dq[hi++] = seed; cost[seed] = 0;
    let hit = -1;
    while (lo < hi) {
      const c = dq[lo++], i = (c / ny) | 0, j = c - i * ny;
      if (c !== seed && reach[c]) { hit = c; break; }
      if (open(c) && (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) && c !== seed) { hit = c; break; }
      for (let d = 0; d < 4; d++) {
        const a = i + DI[d], b = j + DJ[d];
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const n = a * ny + b;
        const w = open(n) ? 0 : spotKind(a, b) === 1 ? 1 : -1;
        if (w < 0) continue;
        const nc = cost[c] + w;
        if (nc >= cost[n]) continue;
        cost[n] = nc; prev[n] = c;
        if (w === 0) dq[--lo] = n; else dq[hi++] = n;
      }
    }
    if (hit < 0) return;
    for (let c = hit; c >= 0; c = prev[c]) if (!open(c)) wall[c] = -1;
  }
}
