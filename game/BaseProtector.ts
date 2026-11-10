import type { MapConfig, BaseProtectorTeamConfig, BaseProtectorArrangement } from '../types';

export const BASE_PROTECTOR_FEATURE: number = 1;

export const BASE_PROTECTOR_MAX_COUNT = 8;

const _gBa = globalThis as { __ISTRONG_OLD_BASE_ARRANGE?: unknown; process?: { env?: Record<string, string | undefined> } };
const _oldArrange = _gBa.__ISTRONG_OLD_BASE_ARRANGE === 1 || _gBa.process?.env?.ISTRONG_OLD_BASE_ARRANGE === '1';

export const BASE_ARRANGE: number = _oldArrange ? 0 : 1;

export const BASE_PROTECTOR_CORNER_MAX = 4;

export const BASE_PROTECTOR_SMART_MAX = 16;

const EDGE_OUT = 1;
const EDGE_STEP = 15;

export const BASE_PROTECTOR_DEFAULT_TANK = 'Base Protector';

export const BASE_PROTECTOR_PUSH_IMPULSE = 1.5;

export const BASE_PROTECTOR_DEFAULT_RANGE = 1225;

export function baseProtectorFovSize(rangeUnits: number): number {
  return rangeUnits / 60;
}

export const BASE_PROTECTOR_MIN_RANGE = 100;
export const BASE_PROTECTOR_MAX_RANGE = 3000;

export const BASE_PROTECTOR_MAX_PUSH_STRENGTH = 300;

export function baseProtectorsActive(cfg: MapConfig | undefined, hasBaseZones: boolean): boolean {
  if (!BASE_PROTECTOR_FEATURE) return false;
  if (!cfg || !hasBaseZones) return false;
  return cfg.enableBaseProtectors ?? true;
}

export interface ResolvedBaseProtector {
  enabled: boolean;
  tank: string;
  count: number;
  arrangement: BaseProtectorArrangement;
  smart: boolean;
  tileCells: number;
}

export function resolveBaseProtectorTeam(
  cfg: MapConfig | undefined,
  teamIndex: number,
): ResolvedBaseProtector {
  const entry: BaseProtectorTeamConfig | undefined = cfg?.baseProtectorTeams?.[teamIndex];
  const count = entry?.count;
  const arrangement: BaseProtectorArrangement = BASE_ARRANGE !== 0 && entry?.arrangement === 'corners' ? 'corners' : 'center';
  const cap = arrangement === 'corners' ? BASE_PROTECTOR_CORNER_MAX : BASE_PROTECTOR_MAX_COUNT;
  return {
    enabled: entry?.enabled ?? true,
    tank: entry?.tank || BASE_PROTECTOR_DEFAULT_TANK,
    count: count == null ? 1 : Math.max(1, Math.min(cap, Math.floor(count))),
    arrangement,
    smart: BASE_ARRANGE !== 0 && arrangement === 'center' && entry?.smart === true,
    tileCells: entry?.tileCells !== undefined && entry.tileCells >= 1 ? Math.floor(entry.tileCells) : 1,
  };
}

export function baseProtectorPushImpulse(cfg: MapConfig | undefined): number {
  if (!BASE_PROTECTOR_FEATURE) return 0;
  if (!(cfg?.baseProtectorPush ?? true)) return 0;
  const pct = cfg?.baseProtectorPushStrength;
  const scale = (pct == null ? 100 : Math.max(0, Math.min(BASE_PROTECTOR_MAX_PUSH_STRENGTH, pct))) / 100;
  return BASE_PROTECTOR_PUSH_IMPULSE * scale;
}

export function baseProtectorRange(cfg: MapConfig | undefined): number {
  const r = cfg?.baseProtectorRange;
  if (r == null) return BASE_PROTECTOR_DEFAULT_RANGE;
  return Math.max(BASE_PROTECTOR_MIN_RANGE, Math.min(BASE_PROTECTOR_MAX_RANGE, r));
}

export function baseProtectorPositions(
  minX: number, minY: number, maxX: number, maxY: number,
  count: number,
  out: { x: number; y: number }[],
  maxCount: number = BASE_PROTECTOR_MAX_COUNT,
): number {
  const n = Math.max(1, Math.min(maxCount, Math.floor(count)));
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);

  if (n === 1) {
    out[0] = out[0] || { x: 0, y: 0 };
    out[0].x = minX + w * 0.5;
    out[0].y = minY + h * 0.5;
    return 1;
  }

  let cols = Math.max(1, Math.round(Math.sqrt(n * (w / h))));
  cols = Math.min(cols, n);
  let rows = Math.ceil(n / cols);
  const altRows = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * (h / w)))));
  const altCols = Math.ceil(n / altRows);
  if (altRows * altCols < rows * cols) { cols = altCols; rows = altRows; }

  const cellW = w / cols;
  const cellH = h / rows;

  let written = 0;
  for (let r = 0; r < rows && written < n; r++) {
    const inRow = Math.min(cols, n - written);
    const rowOffset = (cols - inRow) * cellW * 0.5;
    for (let c = 0; c < inRow; c++) {
      const p = out[written] || (out[written] = { x: 0, y: 0 });
      p.x = minX + rowOffset + (c + 0.5) * cellW;
      p.y = minY + (r + 0.5) * cellH;
      written++;
    }
  }
  return written;
}

export function baseProtectorTilePositions(minX: number, minY: number, maxX: number, maxY: number, count: number, tile: number, out: { x: number; y: number }[]): number {
  const n = Math.max(1, Math.min(BASE_PROTECTOR_MAX_COUNT, Math.floor(count)));
  const w = maxX - minX, h = maxY - minY, tall = h >= w;
  const long = tall ? h : w;
  const step = Math.min(2 * tile, (long - (tall ? w : h)) / Math.max(1, n - 1));
  const cx = minX + w * 0.5, cy = minY + h * 0.5;
  for (let i = 0; i < n; i++) {
    const p = out[i] || (out[i] = { x: 0, y: 0 });
    const d = (i - (n - 1) / 2) * step;
    p.x = tall ? cx : cx + d;
    p.y = tall ? cy + d : cy;
  }
  return n;
}

const CORNER_ORDER: readonly (readonly number[])[] = [[], [0], [0, 1], [0, 2, 3], [0, 1, 2, 3]];
const _cx = [0, 0, 0, 0], _cy = [0, 0, 0, 0], _rank = [0, 0, 0, 0];

export function baseProtectorCornerPositions(
  minX: number, minY: number, maxX: number, maxY: number,
  count: number, cell: number, midX: number, midY: number,
  out: { x: number; y: number }[],
): number {
  const n = Math.max(1, Math.min(BASE_PROTECTOR_CORNER_MAX, Math.floor(count)));
  const w = maxX - minX, h = maxY - minY;
  const ix = w >= 2 * cell - 1e-6 ? cell * 0.5 : w * 0.5;
  const iy = h >= 2 * cell - 1e-6 ? cell * 0.5 : h * 0.5;
  _cx[0] = minX + ix; _cy[0] = minY + iy;
  _cx[1] = maxX - ix; _cy[1] = minY + iy;
  _cx[2] = maxX - ix; _cy[2] = maxY - iy;
  _cx[3] = minX + ix; _cy[3] = maxY - iy;
  let inner = 0, bestD = Infinity;
  for (let k = 0; k < 4; k++) {
    const dx = _cx[k] - midX, dy = _cy[k] - midY, d = dx * dx + dy * dy;
    if (d < bestD - 1e-6) { bestD = d; inner = k; }
  }
  const a = (inner + 1) & 3, b = (inner + 3) & 3;
  const da = (_cx[a] - midX) ** 2 + (_cy[a] - midY) ** 2, db = (_cx[b] - midX) ** 2 + (_cy[b] - midY) ** 2;
  _rank[0] = inner; _rank[1] = (inner + 2) & 3;
  if (db < da - 1e-6 || (Math.abs(db - da) <= 1e-6 && b < a)) { _rank[2] = b; _rank[3] = a; } else { _rank[2] = a; _rank[3] = b; }
  const order = CORNER_ORDER[n];
  let written = 0;
  for (let i = 0; i < order.length; i++) {
    const k = _rank[order[i]];
    let dup = false;
    for (let q = 0; q < written; q++) if (Math.abs(out[q].x - _cx[k]) < 1e-6 && Math.abs(out[q].y - _cy[k]) < 1e-6) { dup = true; break; }
    if (dup) continue;
    const p = out[written] || (out[written] = { x: 0, y: 0 });
    p.x = _cx[k]; p.y = _cy[k];
    written++;
  }
  return written;
}

export function baseOutlineWorstGap(
  lab: ArrayLike<number>, label: number, gc: number, gcY: number, cs: number, mh: number, mhY: number,
  gx0: number, gx1: number, gy0: number, gy1: number, pts: { x: number; y: number }[], n: number,
): number {
  let worst = 0;
  const test = (px: number, py: number) => {
    let d = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = pts[i].x - px, dy = pts[i].y - py, dd = dx * dx + dy * dy;
      if (dd < d) d = dd;
    }
    if (d > worst) worst = d;
  };
  const steps = Math.max(1, Math.ceil(cs / EDGE_STEP));
  const has = (gx: number, gy: number) => gx >= 0 && gx < gc && gy >= 0 && gy < gcY && lab[gx * gcY + gy] === label;
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      if (!has(gx, gy)) continue;
      const x0 = -mh + gx * cs, y0 = -mhY + gy * cs;
      for (let s = 0; s <= steps; s++) {
        const t = cs * s / steps;
        if (gy > 0 && !has(gx, gy - 1)) test(x0 + t, y0 - EDGE_OUT);
        if (gy < gcY - 1 && !has(gx, gy + 1)) test(x0 + t, y0 + cs + EDGE_OUT);
        if (gx > 0 && !has(gx - 1, gy)) test(x0 - EDGE_OUT, y0 + t);
        if (gx < gc - 1 && !has(gx + 1, gy)) test(x0 + cs + EDGE_OUT, y0 + t);
      }
    }
  }
  return Math.sqrt(worst);
}

export function baseEdgeWorstGap(
  minX: number, minY: number, maxX: number, maxY: number,
  pts: { x: number; y: number }[], n: number,
  mapMinX: number, mapMinY: number, mapMaxX: number, mapMaxY: number,
): number {
  let worst = 0;
  const test = (px: number, py: number) => {
    if (px < mapMinX || px > mapMaxX || py < mapMinY || py > mapMaxY) return;
    let d = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = pts[i].x - px, dy = pts[i].y - py, dd = dx * dx + dy * dy;
      if (dd < d) d = dd;
    }
    if (d > worst) worst = d;
  };
  const x0 = minX - EDGE_OUT, x1 = maxX + EDGE_OUT, y0 = minY - EDGE_OUT, y1 = maxY + EDGE_OUT;
  const sx = Math.max(1, Math.ceil((x1 - x0) / EDGE_STEP)), sy = Math.max(1, Math.ceil((y1 - y0) / EDGE_STEP));
  for (let i = 0; i <= sx; i++) { const x = x0 + (x1 - x0) * i / sx; test(x, y0); test(x, y1); }
  for (let i = 1; i < sy; i++) { const y = y0 + (y1 - y0) * i / sy; test(x0, y); test(x1, y); }
  return Math.sqrt(worst);
}
