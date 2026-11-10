import type { MapState } from '@/types';

export interface ExactNavGrid {
  R: number;
  K: number;
  F: number;
  FY: number;
  fineCS: number;
  mapHalf: number;
  mapHalfY: number;
  ready: boolean;
  open: Uint8Array;
  comp: Uint16Array;
  portalA: Int32Array;
  portalB: Int32Array;
  portalCost: Int32Array;
  portalPath: Float32Array;
  portalPathStart: Int32Array;
  portalByCell: Map<number, number[]>;
  fences: number;
  doors: number;
  lastUseMs: number;
  _phase: number;
  _cursor: number;
  _pairJ: number;
  _doorScratch: number[] | null;
  _portalCells: number[] | null;
  _portalPaths: number[][] | null;
}

export interface ExactGridHost {
  exactGrids: Map<number, ExactNavGrid>;
  exactDemand: number[];
  gridCells: number;
  gridCellsY: number;
  cellSize: number;
  mapHalf: number;
  mapHalfY: number;
  rockOffX: number;
  rockOffY: number;
  exactOff?: boolean;
}

export const EXACT_GRID_MAX = 40;

export const NAV_EXACT_SWITCH = { OWN_DOORS: 1 };
export const EXACT_IDLE_EVICT_MS = 30000;

export const NAV_EXACT_TEST_KNOBS = { disableFences: false, disableDoors: false };
const DOOR_BAND_CELLS = 3;
const DOOR_WALK_MAX = 64;

export function exactBucketOf(R: number): number {
  const b = Math.floor(R);
  return b < 1 ? 1 : b;
}

let _nowMs = 0;

export function getExactGrid(host: ExactGridHost, R: number): ExactNavGrid | null {
  if (host.exactOff === true) return null;
  const key = exactBucketOf(R);
  const g = host.exactGrids.get(key);
  if (g) {
    g.lastUseMs = _nowMs;
    return g.ready ? g : null;
  }
  if (host.exactDemand.indexOf(key) < 0) host.exactDemand.push(key);
  return null;
}

export function exactIdxOf(g: ExactNavGrid, lx: number, ly: number): number {
  const ix = Math.floor((lx + g.mapHalf) / g.fineCS);
  const iy = Math.floor((ly + g.mapHalfY) / g.fineCS);
  if (ix < 0 || ix >= g.F || iy < 0 || iy >= g.FY) return -1;
  return ix * g.FY + iy;
}

export function exactOpenAt(g: ExactNavGrid, lx: number, ly: number): boolean {
  const i = exactIdxOf(g, lx, ly);
  return i >= 0 && g.open[i] !== 0;
}

export function exactCompNear(g: ExactNavGrid, lx: number, ly: number): number {
  const ix = Math.floor((lx + g.mapHalf) / g.fineCS);
  const iy = Math.floor((ly + g.mapHalfY) / g.fineCS);
  if (ix < 0 || ix >= g.F || iy < 0 || iy >= g.FY) return 0;
  const c0 = g.comp[ix * g.FY + iy];
  if (c0 !== 0) return c0;
  for (let dy = -1; dy <= 1; dy++) {
    const ny = iy + dy;
    if (ny < 0 || ny >= g.FY) continue;
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = ix + dx;
      if (nx < 0 || nx >= g.F) continue;
      const c = g.comp[nx * g.FY + ny];
      if (c !== 0) return c;
    }
  }
  return 0;
}

export function pumpExactGrids(
  ms: MapState, host: ExactGridHost, offX: number, offY: number,
  budgetMs: number = 3,
): void {
  const deadline = performance.now() + budgetMs;
  _nowMs = deadline - budgetMs;
  for (;;) {
    let g: ExactNavGrid | null = null;
    for (const gg of host.exactGrids.values()) {
      if (!gg.ready) { g = gg; break; }
    }
    if (!g) {
      const key = host.exactDemand.shift();
      if (key === undefined) return;
      if (host.exactGrids.has(key)) continue;
      while (host.exactGrids.size >= EXACT_GRID_MAX) {
        let oldK = -1, oldT = Infinity;
        for (const [k, gg] of host.exactGrids) {
          if (gg.ready && gg.lastUseMs < oldT) { oldT = gg.lastUseMs; oldK = k; }
        }
        if (oldK < 0 || _nowMs - oldT < EXACT_IDLE_EVICT_MS) break;
        host.exactGrids.delete(oldK);
      }
      if (host.exactGrids.size >= EXACT_GRID_MAX) continue;
      g = allocGrid(host, key);
      host.exactGrids.set(key, g);
    }
    buildSlice(ms, g, offX, offY, deadline);
    if (!g.ready) return;
    if (performance.now() >= deadline) return;
  }
}

function allocGrid(host: ExactGridHost, key: number): ExactNavGrid {
  const gc = host.gridCells;
  const gcY = host.gridCellsY;
  const big = gc > gcY ? gc : gcY;
  const K = big <= 64 ? 4 : big <= 128 ? 2 : 1;
  const F = gc * K;
  const FY = gcY * K;
  return {
    R: key, K, F, FY,
    fineCS: host.cellSize / K,
    mapHalf: host.mapHalf,
    mapHalfY: host.mapHalfY,
    ready: false,
    open: new Uint8Array(F * FY).fill(1),
    comp: new Uint16Array(F * FY),
    portalA: new Int32Array(0),
    portalB: new Int32Array(0),
    portalCost: new Int32Array(0),
    portalPath: new Float32Array(0),
    portalPathStart: new Int32Array(1),
    portalByCell: new Map(),
    fences: 0,
    doors: 0,
    lastUseMs: _nowMs,
    _phase: 1,
    _cursor: 0,
    _pairJ: -1,
    _doorScratch: [],
    _portalCells: [],
    _portalPaths: [],
  };
}

function buildSlice(ms: MapState, g: ExactNavGrid, offX: number, offY: number, deadline: number): void {
  const { F, FY, fineCS, mapHalf: mh, mapHalfY: mhY, R } = g;
  const open = g.open;
  const c0 = -mh + fineCS / 2;
  const c0Y = -mhY + fineCS / 2;
  const rocks = ms.rocks;
  const walls = ms.walls;

  if (g._phase === 1) {
    while (g._cursor < rocks.length) {
      const r = rocks[g._cursor++];
      if (!r.active) continue;
      const rlx = r.x - offX, rly = r.y - offY;
      const rr = r.size + R;
      const rr2 = rr * rr;
      const ixMin = Math.max(0, Math.floor((rlx - rr + mh) / fineCS));
      const ixMax = Math.min(F - 1, Math.floor((rlx + rr + mh) / fineCS));
      const iyMin = Math.max(0, Math.floor((rly - rr + mhY) / fineCS));
      const iyMax = Math.min(FY - 1, Math.floor((rly + rr + mhY) / fineCS));
      for (let ix = ixMin; ix <= ixMax; ix++) {
        const px = c0 + ix * fineCS - rlx;
        const col = ix * FY;
        for (let iy = iyMin; iy <= iyMax; iy++) {
          const py = c0Y + iy * fineCS - rly;
          if (px * px + py * py < rr2) open[col + iy] = 0;
        }
      }
      if ((g._cursor & 15) === 0 && performance.now() >= deadline) return;
    }
    g._phase = 2; g._cursor = 0;
  }

  if (g._phase === 2) {
    while (g._cursor < walls.length) {
      const w = walls[g._cursor++];
      if (!w.active) continue;
      const wlx = w.x - offX, wly = w.y - offY;
      const L = wlx - w.halfW, Rt = wlx + w.halfW, T = wly - w.halfH, B = wly + w.halfH;
      const ixMin = Math.max(0, Math.floor((L - R + mh) / fineCS));
      const ixMax = Math.min(F - 1, Math.floor((Rt + R + mh) / fineCS));
      const iyMin = Math.max(0, Math.floor((T - R + mhY) / fineCS));
      const iyMax = Math.min(FY - 1, Math.floor((B + R + mhY) / fineCS));
      const R2 = R * R;
      for (let ix = ixMin; ix <= ixMax; ix++) {
        const px = c0 + ix * fineCS;
        const cx = px < L ? L : (px > Rt ? Rt : px);
        const dx = px - cx;
        const col = ix * FY;
        for (let iy = iyMin; iy <= iyMax; iy++) {
          const py = c0Y + iy * fineCS;
          const cy = py < T ? T : (py > B ? B : py);
          const dy = py - cy;
          if (dx * dx + dy * dy < R2) open[col + iy] = 0;
        }
      }
      if ((g._cursor & 15) === 0 && performance.now() >= deadline) return;
    }
    const gcY = ms.gridCellsY, K = g.K;
    const wallGrid = ms.wallGrid;
    for (let ix = 0; ix < F; ix++) {
      const cgx = (ix / K) | 0;
      const col = ix * FY;
      for (let iy = 0; iy < FY; iy++) {
        if (wallGrid[cgx * gcY + ((iy / K) | 0)] >= 0) open[col + iy] = 0;
      }
    }
    g._phase = 3; g._cursor = 0; g._pairJ = -1;
  }

  if (g._phase === 3) {
    if (!fenceSlice(ms, g, offX, offY, deadline)) return;
    g._phase = 4; g._cursor = 0; g._pairJ = -1;
  }

  if (g._phase === 4) {
    if (!doorSlice(ms, g, offX, offY, deadline)) return;
    finishDoors(g);
    g._phase = 5;
  }

  if (g._phase === 5) {
    labelComponents(g);
    g._doorScratch = null;
    g.ready = true;
  }
}

function sealSegment(g: ExactNavGrid, ax: number, ay: number, bx: number, by: number): void {
  const { F, FY, fineCS, mapHalf: mh, mapHalfY: mhY } = g;
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / (fineCS * 0.35)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const ix = Math.floor((ax + (bx - ax) * t + mh) / fineCS);
    const iy = Math.floor((ay + (by - ay) * t + mhY) / fineCS);
    if (ix >= 0 && ix < F && iy >= 0 && iy < FY) g.open[ix * FY + iy] = 0;
  }
}

function rectClosest(px: number, py: number, lx: number, ly: number, hw: number, hh: number, out: { x: number; y: number }): void {
  const L = lx - hw, R = lx + hw, T = ly - hh, B = ly + hh;
  out.x = px < L ? L : (px > R ? R : px);
  out.y = py < T ? T : (py > B ? B : py);
}

const _rcA = { x: 0, y: 0 };
const _rcB = { x: 0, y: 0 };

function fenceSlice(ms: MapState, g: ExactNavGrid, offX: number, offY: number, deadline: number): boolean {
  const rocks = ms.rocks, walls = ms.walls;
  const R = g.R;
  const doorMax = 2 * R + DOOR_BAND_CELLS * g.fineCS;
  const scratch = g._doorScratch!;
  const nR = rocks.length, nW = walls.length;
  const total = nR + nW;

  while (g._cursor < total) {
    const i = g._cursor;
    const iIsRock = i < nR;
    const iEnt = iIsRock ? rocks[i] : walls[i - nR];
    if (!iEnt.active) { g._cursor++; g._pairJ = -1; continue; }
    const jStart = g._pairJ >= 0 ? g._pairJ : i + 1;
    for (let j = jStart; j < total; j++) {
      if (j > jStart && (j & 63) === 0 && performance.now() >= deadline) { g._pairJ = j; return false; }
      const jIsRock = j < nR;
      const jEnt = jIsRock ? rocks[j] : walls[j - nR];
      if (!jEnt.active) continue;

      let ax: number, ay: number, bx: number, by: number, gap: number;
      if (iIsRock && jIsRock) {
        const a = iEnt as typeof rocks[number], b = jEnt as typeof rocks[number];
        const alx = a.x - offX, aly = a.y - offY, blx = b.x - offX, bly = b.y - offY;
        const dx = blx - alx, dy = bly - aly;
        const cd = Math.hypot(dx, dy);
        if (cd <= 1e-6) continue;
        gap = cd - a.size - b.size;
        if (gap >= doorMax) continue;
        const ux = dx / cd, uy = dy / cd;
        ax = alx + ux * a.size; ay = aly + uy * a.size;
        bx = blx - ux * b.size; by = bly - uy * b.size;
      } else if (iIsRock !== jIsRock) {
        const r = (iIsRock ? iEnt : jEnt) as typeof rocks[number];
        const w = (iIsRock ? jEnt : iEnt) as typeof walls[number];
        const rlx = r.x - offX, rly = r.y - offY;
        rectClosest(rlx, rly, w.x - offX, w.y - offY, w.halfW, w.halfH, _rcA);
        const dx = _rcA.x - rlx, dy = _rcA.y - rly;
        const cd = Math.hypot(dx, dy);
        if (cd <= 1e-6) continue;
        gap = cd - r.size;
        if (gap >= doorMax) continue;
        const ux = dx / cd, uy = dy / cd;
        ax = rlx + ux * r.size; ay = rly + uy * r.size;
        bx = _rcA.x; by = _rcA.y;
      } else {
        const a = iEnt as typeof walls[number], b = jEnt as typeof walls[number];
        rectClosest(b.x - offX, b.y - offY, a.x - offX, a.y - offY, a.halfW, a.halfH, _rcA);
        rectClosest(_rcA.x, _rcA.y, b.x - offX, b.y - offY, b.halfW, b.halfH, _rcB);
        rectClosest(_rcB.x, _rcB.y, a.x - offX, a.y - offY, a.halfW, a.halfH, _rcA);
        ax = _rcA.x; ay = _rcA.y; bx = _rcB.x; by = _rcB.y;
        gap = Math.hypot(bx - ax, by - ay);
        if (gap <= 1e-6) continue;
        if (gap >= doorMax) continue;
      }

      if (gap < 2 * R) {
        if (NAV_EXACT_TEST_KNOBS.disableFences) continue;
        g.fences++;
        sealSegment(g, ax, ay, bx, by);
      } else {
        if (NAV_EXACT_TEST_KNOBS.disableDoors) continue;
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const dl = Math.hypot(bx - ax, by - ay);
        scratch.push(mx, my, (by - ay) / dl, -(bx - ax) / dl);
      }
    }
    g._cursor++; g._pairJ = -1;
  }
  return true;
}

function clearanceAt(ms: MapState, offX: number, offY: number, lx: number, ly: number): number {
  let c = Infinity;
  const rocks = ms.rocks;
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    if (!r.active) continue;
    const ax = lx - (r.x - offX);
    const ay = ly - (r.y - offY);
    const absX = ax < 0 ? -ax : ax;
    if (absX - r.size >= c) continue;
    const absY = ay < 0 ? -ay : ay;
    if (absY - r.size >= c) continue;
    const d = Math.sqrt(ax * ax + ay * ay) - r.size;
    if (d < c) c = d;
  }
  const walls = ms.walls;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (!w.active) continue;
    const wx = w.x - offX, wy = w.y - offY;
    const absX = lx - wx < 0 ? wx - lx : lx - wx;
    if (absX - w.halfW >= c) continue;
    const absY = ly - wy < 0 ? wy - ly : ly - wy;
    if (absY - w.halfH >= c) continue;
    rectClosest(lx, ly, wx, wy, w.halfW, w.halfH, _rcA);
    const ex = lx - _rcA.x, ey = ly - _rcA.y;
    const d = Math.sqrt(ex * ex + ey * ey);
    if (d < c) c = d;
  }
  return c;
}

function sweptClear(ms: MapState, offX: number, offY: number, R: number,
                    x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const sMinX = x0 < x1 ? x0 : x1, sMaxX = x0 < x1 ? x1 : x0;
  const sMinY = y0 < y1 ? y0 : y1, sMaxY = y0 < y1 ? y1 : y0;
  const rocks = ms.rocks;
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    if (!r.active) continue;
    const rr = r.size + R;
    const rx = r.x - offX, ry = r.y - offY;
    if (rx + rr < sMinX || rx - rr > sMaxX || ry + rr < sMinY || ry - rr > sMaxY) continue;
    const fx = rx - x0, fy = ry - y0;
    let t = len2 > 0 ? (fx * dx + fy * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = fx - dx * t, ey = fy - dy * t;
    if (ex * ex + ey * ey < rr * rr) return false;
  }
  const walls = ms.walls;
  const R2 = R * R;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (!w.active) continue;
    const wx = w.x - offX, wy = w.y - offY;
    const ew = w.halfW + R, eh = w.halfH + R;
    if (wx + ew < sMinX || wx - ew > sMaxX || wy + eh < sMinY || wy - eh > sMaxY) continue;
    if (segRectDist2(x0, y0, x1, y1, wx, wy, w.halfW, w.halfH) < R2) return false;
  }
  return true;
}

function segRectDist2(px: number, py: number, qx: number, qy: number,
                      cx: number, cy: number, hw: number, hh: number): number {
  const L = cx - hw, R = cx + hw, T = cy - hh, B = cy + hh;
  if ((px >= L && px <= R && py >= T && py <= B) || (qx >= L && qx <= R && qy >= T && qy <= B)) return 0;
  let best = Infinity;
  best = Math.min(best, segSegDist2(px, py, qx, qy, L, T, R, T));
  best = Math.min(best, segSegDist2(px, py, qx, qy, R, T, R, B));
  best = Math.min(best, segSegDist2(px, py, qx, qy, R, B, L, B));
  best = Math.min(best, segSegDist2(px, py, qx, qy, L, B, L, T));
  return best;
}

function segSegDist2(p1x: number, p1y: number, q1x: number, q1y: number,
                     p2x: number, p2y: number, q2x: number, q2y: number): number {
  const d1x = q1x - p1x, d1y = q1y - p1y;
  const d2x = q2x - p2x, d2y = q2y - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s: number, t: number;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
  else if (a <= 1e-12) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-12) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = d1x * d2x + d1y * d2y;
      const den = a * e - b * b;
      s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  const cx1 = p1x + d1x * s, cy1 = p1y + d1y * s;
  const cx2 = p2x + d2x * t, cy2 = p2y + d2y * t;
  const dx = cx1 - cx2, dy = cy1 - cy2;
  return dx * dx + dy * dy;
}

const _doorPts: number[] = [];

const _portalCellsShared: number[] = [];
const _portalPathsShared: number[][] = [];

function doorSlice(ms: MapState, g: ExactNavGrid, offX: number, offY: number, deadline: number): boolean {
  const scratch = g._doorScratch!;
  const { F, FY, fineCS, mapHalf: mh, mapHalfY: mhY, R } = g;
  const _own = NAV_EXACT_SWITCH.OWN_DOORS !== 0;
  const _portalCells = _own ? g._portalCells! : _portalCellsShared;
  const _portalPaths = _own ? g._portalPaths! : _portalPathsShared;
  if (g._cursor === 0 && g._pairJ === -1) { _portalCells.length = 0; _portalPaths.length = 0; g._pairJ = 0; }

  let _worked = false;
  while (g._cursor < scratch.length) {
    if (_worked && performance.now() >= deadline) return false;
    _worked = true;
    const mx = scratch[g._cursor], my = scratch[g._cursor + 1];
    const pdx = scratch[g._cursor + 2], pdy = scratch[g._cursor + 3];
    g._cursor += 4;

    _doorPts.length = 0;
    let landA = -1, landB = -1;
    for (let side = 0; side < 2; side++) {
      const dir = side === 0 ? 1 : -1;
      let hx = pdx * dir, hy = pdy * dir;
      let x = mx, y = my;
      let landed = -1;
      const sideStart = _doorPts.length;
      for (let s = 0; s < DOOR_WALK_MAX; s++) {
        let bx = NaN, by = NaN, bc = -Infinity, bhx = 0, bhy = 0;
        const baseAng = Math.atan2(hy, hx);
        for (let a = -2; a <= 2; a++) {
          const ang = baseAng + a * (Math.PI / 5);
          const nhx = Math.cos(ang), nhy = Math.sin(ang);
          const nx = x + nhx * fineCS * 0.5, ny = y + nhy * fineCS * 0.5;
          if (!sweptClear(ms, offX, offY, R, x, y, nx, ny)) continue;
          const c = clearanceAt(ms, offX, offY, nx, ny);
          if (c > bc) { bc = c; bx = nx; by = ny; bhx = nhx; bhy = nhy; }
        }
        if (bc < R) break;
        x = bx; y = by; hx = bhx; hy = bhy;
        _doorPts.push(x, y);
        const ix = Math.floor((x + mh) / fineCS), iy = Math.floor((y + mhY) / fineCS);
        if (ix >= 0 && ix < F && iy >= 0 && iy < FY && g.open[ix * FY + iy]) {
          landed = ix * FY + iy;
          break;
        }
      }
      if (landed < 0) { _doorPts.length = sideStart; if (side === 0) break; }
      if (side === 0) landA = landed; else landB = landed;
    }
    if (landA >= 0 && landB >= 0 && landA !== landB) {
      const path: number[] = [];
      let split = 0;
      for (let p = 0; p < _doorPts.length; p += 2) {
        const ix = Math.floor((_doorPts[p] + mh) / fineCS), iy = Math.floor((_doorPts[p + 1] + mhY) / fineCS);
        if (ix * FY + iy === landA) { split = p + 2; break; }
      }
      for (let p = split - 2; p >= 0; p -= 2) path.push(_doorPts[p], _doorPts[p + 1]);
      path.push(mx, my);
      for (let p = split; p < _doorPts.length; p += 2) path.push(_doorPts[p], _doorPts[p + 1]);
      _portalCells.push(landA, landB);
      _portalPaths.push(path);
      g.doors++;
    }
  }
  return true;
}

function finishDoors(g: ExactNavGrid): void {
  const _own = NAV_EXACT_SWITCH.OWN_DOORS !== 0;
  const _portalCells = _own ? g._portalCells! : _portalCellsShared;
  const _portalPaths = _own ? g._portalPaths! : _portalPathsShared;
  const n = g.doors;
  g.portalA = new Int32Array(n);
  g.portalB = new Int32Array(n);
  g.portalCost = new Int32Array(n);
  g.portalPathStart = new Int32Array(n + 1);
  let pathLen = 0;
  for (let d = 0; d < n; d++) pathLen += _portalPaths[d].length;
  g.portalPath = new Float32Array(pathLen);
  let off = 0;
  for (let d = 0; d < n; d++) {
    g.portalA[d] = _portalCells[d * 2];
    g.portalB[d] = _portalCells[d * 2 + 1];
    g.portalPathStart[d] = off;
    const p = _portalPaths[d];
    g.portalPath.set(p, off);
    off += p.length;
    let plen = 0;
    for (let q = 2; q < p.length; q += 2) plen += Math.hypot(p[q] - p[q - 2], p[q + 1] - p[q - 1]);
    g.portalCost[d] = Math.max(1, Math.round(plen / g.fineCS));
  }
  g.portalPathStart[n] = off;
  g.portalByCell.clear();
  for (let d = 0; d < n; d++) {
    for (const cell of [g.portalA[d], g.portalB[d]]) {
      let list = g.portalByCell.get(cell);
      if (!list) { list = []; g.portalByCell.set(cell, list); }
      list.push(d);
    }
  }
  _portalCells.length = 0;
  _portalPaths.length = 0;
  g._portalCells = null;
  g._portalPaths = null;
}

let _bfsQ: Int32Array = new Int32Array(0);

function labelComponents(g: ExactNavGrid): void {
  const { F, FY, open, comp } = g;
  const total = F * FY;
  comp.fill(0);
  if (_bfsQ.length < total) _bfsQ = new Int32Array(total);
  const q = _bfsQ;
  let next = 1;
  for (let s = 0; s < total; s++) {
    if (!open[s] || comp[s] !== 0) continue;
    if (next >= 65535) return;
    const id = next++;
    let qh = 0, qt = 0;
    q[qt++] = s; comp[s] = id;
    while (qh < qt) {
      const cur = q[qh++];
      const cx = (cur / FY) | 0, cy = cur - cx * FY;
      if (cx + 1 < F) { const ni = cur + FY; if (open[ni] && comp[ni] === 0) { comp[ni] = id; q[qt++] = ni; } }
      if (cx - 1 >= 0) { const ni = cur - FY; if (open[ni] && comp[ni] === 0) { comp[ni] = id; q[qt++] = ni; } }
      if (cy + 1 < FY) { const ni = cur + 1; if (open[ni] && comp[ni] === 0) { comp[ni] = id; q[qt++] = ni; } }
      if (cy - 1 >= 0) { const ni = cur - 1; if (open[ni] && comp[ni] === 0) { comp[ni] = id; q[qt++] = ni; } }
      const doors = g.portalByCell.get(cur);
      if (doors) {
        for (let k = 0; k < doors.length; k++) {
          const d = doors[k];
          const other = g.portalA[d] === cur ? g.portalB[d] : g.portalA[d];
          if (open[other] && comp[other] === 0) { comp[other] = id; q[qt++] = other; }
        }
      }
    }
  }
}
