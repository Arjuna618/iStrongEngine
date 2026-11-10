import type { MapState, WallEntity } from '@/types';
import { TileType, AI_CONSTANTS } from '@/types';
import type { ExactNavGrid } from './NavExact';
import { getExactGrid, exactCompNear } from './NavExact';
import { SMALL_FIX } from './smallFixSwitch';
import { wallSkips, wallSteerPad } from './wallTypes';
import { MAGIC_MAZE } from './magicMaze';

export interface NavigationState {
  flowDirX: Float32Array;
  flowDirY: Float32Array;
  flowDist: Uint16Array;
  flowVersion: number;
  lastTargetCellX: number;
  lastTargetCellY: number;
  flowMaskIsRockAware: boolean;
  rockOffX: number;
  rockOffY: number;
  gridCells: number;
  gridCellsY: number;
  cellSize: number;
  mapHalf: number;
  mapHalfY: number;
  deadEndDepth: Uint8Array;
  deadEndExitDirX: Int8Array;
  deadEndExitDirY: Int8Array;

  regionFlow: Uint8Array;
  regionSeedIdx: Int32Array;
  regionSeedX: Float32Array;
  regionSeedY: Float32Array;
  regionAxis: Uint8Array;
  regionAxisStart: Int32Array;
  regionAxisEnd: Int32Array;
  regionAxisY: Uint8Array;
  regionAxisStartY: Int32Array;
  regionAxisEndY: Int32Array;
  regionsBuilt: boolean;

  auxFields: AuxDistField[];

  clearance: Float32Array;
  clearanceMax: number;
  navBlocked: Uint8Array;
  navComponent: Uint16Array;

  weaveGate: (Uint8Array | null)[];

  dynEdgeBlock: Map<number, number>;

  exactGrids: Map<number, ExactNavGrid>;
  exactDemand: number[];

  isExactView?: ExactNavGrid;
  exactOff?: boolean;
  oneWay?: Int8Array;
  oneWayN?: number;
}

export interface FlowQueryResult {
  dirX: number;
  dirY: number;
  dist: number;
}

export interface AuxDistField {
  ownerId: string;
  sizeClass: number;
  sightSeeded: boolean;
  srcCellX: number;
  srcCellY: number;
  lastUseMs: number;
  dist: Uint16Array;
}

const UNREACHABLE = 0xFFFF;

const MAX_GRID = 256;
const MAX_CELLS = MAX_GRID * MAX_GRID;

const DX4 = [0, 0, 1, -1];
const DY4 = [1, -1, 0, 0];

export const EXPLORE_REGION_DIM = 3;
export const EXPLORE_REGION_COUNT = EXPLORE_REGION_DIM * EXPLORE_REGION_DIM;

const STEP_NONE = 0;
const _STEP_DX = [0, -1, 1, 0, 0];
const _STEP_DY = [0, 0, 0, -1, 1];

let _bfsQueue = new Uint32Array(MAX_CELLS);
let _bfsVisited = new Uint8Array(MAX_CELLS);
let _bfsDegree = new Uint8Array(MAX_CELLS);
let _regionBlocked = new Uint8Array(MAX_CELLS);
export function ensureNavScratch(cells: number): void {
  if (cells <= _bfsQueue.length) return;
  _bfsQueue = new Uint32Array(cells);
  _bfsVisited = new Uint8Array(cells);
  _bfsDegree = new Uint8Array(cells);
  _regionBlocked = new Uint8Array(cells);
  _selfDist = new Uint16Array(cells);
}

const _queryResult: FlowQueryResult = { dirX: 0, dirY: 0, dist: UNREACHABLE };
const _smoothResult: FlowQueryResult = { dirX: 0, dirY: 0, dist: UNREACHABLE };

const _deadEndResult = { depth: 0, exitDirX: 0, exitDirY: 0 };

const _regionStepResult = { dirX: 0, dirY: 0, ok: false };
const _regionStepSmoothResult = { dirX: 0, dirY: 0, ok: false };
const _regionWaypoint = { x: 0, y: 0, dirX: 0, dirY: 0, ok: false };

export const LOS_ROCK_BUFFER = 12;

const ROCK_BUCKET_EPS = 2;

const ROCK_BUCKET_MIN_CELL = 128;
const ROCK_BUCKET_MAX_DIM = 192;

const ROCK_BUCKET_PAD = LOS_ROCK_BUFFER + ROCK_BUCKET_EPS;
const rockQueryExcess = (radius: number) => (radius > ROCK_BUCKET_PAD ? radius - ROCK_BUCKET_PAD : 0);

let _rockQueryIdx = new Int32Array(1024);
let _rockSeen = new Int32Array(1024);
let _rockStamp = 0;

export function buildRockBuckets(ms: MapState): void {
  const rocks = ms.rocks;
  const n = rocks.length;
  ms.rockBucketCount = n;
  if (n === 0) {
    ms.rockBucketDim = 0;
    ms.rockBucketCell = 0;
    ms.rockBucketMinX = 0;
    ms.rockBucketMinY = 0;
    ms.rockBucketStart = new Int32Array(1);
    ms.rockBucketIdx = new Int32Array(0);
    return;
  }

  const _skipOut = SMALL_FIX.GH324B !== 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxR = 0;
  for (let i = 0; i < n; i++) {
    const r = rocks[i];
    if (_skipOut && r.active === false) continue;
    const pad = r.size + LOS_ROCK_BUFFER + ROCK_BUCKET_EPS;
    if (r.x - pad < minX) minX = r.x - pad;
    if (r.y - pad < minY) minY = r.y - pad;
    if (r.x + pad > maxX) maxX = r.x + pad;
    if (r.y + pad > maxY) maxY = r.y + pad;
    if (r.size > maxR) maxR = r.size;
  }

  if (!(minX < Infinity)) {
    ms.rockBucketDim = 0; ms.rockBucketCell = 0; ms.rockBucketMinX = 0; ms.rockBucketMinY = 0;
    ms.rockBucketStart = new Int32Array(1); ms.rockBucketIdx = new Int32Array(0);
    return;
  }

  let cell = Math.max(ROCK_BUCKET_MIN_CELL, 2 * (maxR + LOS_ROCK_BUFFER + ROCK_BUCKET_EPS));
  const spanX = maxX - minX, spanY = maxY - minY;
  let dim = Math.max(1, Math.ceil(Math.max(spanX, spanY) / cell));
  if (dim > ROCK_BUCKET_MAX_DIM) {
    dim = ROCK_BUCKET_MAX_DIM;
    cell = Math.max(spanX, spanY) / dim + 1;
  }

  const cells = dim * dim;
  const start = new Int32Array(cells + 1);
  const invCell = 1 / cell;

  for (let i = 0; i < n; i++) {
    const r = rocks[i];
    if (_skipOut && r.active === false) continue;
    const pad = r.size + LOS_ROCK_BUFFER + ROCK_BUCKET_EPS;
    let bx0 = Math.floor((r.x - pad - minX) * invCell); if (bx0 < 0) bx0 = 0;
    let by0 = Math.floor((r.y - pad - minY) * invCell); if (by0 < 0) by0 = 0;
    let bx1 = Math.floor((r.x + pad - minX) * invCell); if (bx1 > dim - 1) bx1 = dim - 1;
    let by1 = Math.floor((r.y + pad - minY) * invCell); if (by1 > dim - 1) by1 = dim - 1;
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let by = by0; by <= by1; by++) start[bx * dim + by + 1]++;
    }
  }
  for (let c = 0; c < cells; c++) start[c + 1] += start[c];

  const idx = new Int32Array(start[cells]);
  const cursor = new Int32Array(cells);
  for (let i = 0; i < n; i++) {
    const r = rocks[i];
    if (_skipOut && r.active === false) continue;
    const pad = r.size + LOS_ROCK_BUFFER + ROCK_BUCKET_EPS;
    let bx0 = Math.floor((r.x - pad - minX) * invCell); if (bx0 < 0) bx0 = 0;
    let by0 = Math.floor((r.y - pad - minY) * invCell); if (by0 < 0) by0 = 0;
    let bx1 = Math.floor((r.x + pad - minX) * invCell); if (bx1 > dim - 1) bx1 = dim - 1;
    let by1 = Math.floor((r.y + pad - minY) * invCell); if (by1 > dim - 1) by1 = dim - 1;
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let by = by0; by <= by1; by++) {
        const c = bx * dim + by;
        idx[start[c] + cursor[c]] = i;
        cursor[c]++;
      }
    }
  }

  ms.rockBucketCell = cell;
  ms.rockBucketDim = dim;
  ms.rockBucketMinX = minX;
  ms.rockBucketMinY = minY;
  ms.rockBucketStart = start;
  ms.rockBucketIdx = idx;

  if (_rockSeen.length < n) {
    _rockSeen = new Int32Array(n);
    _rockQueryIdx = new Int32Array(n);
    _rockStamp = 0;
  }
}

function rockIndexUsable(ms: MapState): boolean {
  return ms.rockBucketDim > 0 && ms.rockBucketCount === ms.rocks.length;
}

export function rockQueryBuf(): Int32Array { return _rockQueryIdx; }

function beginRockQuery(ms: MapState): void {
  const n = ms.rocks.length;
  if (_rockSeen.length < n) { _rockSeen = new Int32Array(n); _rockQueryIdx = new Int32Array(n); _rockStamp = 0; }
  _rockStamp++;
  if (_rockStamp === 0x7fffffff) { _rockSeen.fill(0); _rockStamp = 1; }
}

function collectBucket(ms: MapState, bx: number, by: number, count: number): number {
  const dim = ms.rockBucketDim;
  if (bx < 0 || by < 0 || bx >= dim || by >= dim) return count;
  const start = ms.rockBucketStart;
  const list = ms.rockBucketIdx;
  const c = bx * dim + by;
  const e = start[c + 1];
  for (let k = start[c]; k < e; k++) {
    const ri = list[k];
    if (_rockSeen[ri] === _rockStamp) continue;
    _rockSeen[ri] = _rockStamp;
    _rockQueryIdx[count++] = ri;
  }
  return count;
}

function sortCandidates(count: number): void {
  for (let i = 1; i < count; i++) {
    const v = _rockQueryIdx[i];
    let j = i - 1;
    while (j >= 0 && _rockQueryIdx[j] > v) { _rockQueryIdx[j + 1] = _rockQueryIdx[j]; j--; }
    _rockQueryIdx[j + 1] = v;
  }
}

export function queryRocksNearPoint(ms: MapState, x: number, y: number, radius: number): number {
  if (!rockIndexUsable(ms)) return -1;
  beginRockQuery(ms);
  const inv = 1 / ms.rockBucketCell;
  const ex_ = rockQueryExcess(radius);
  const dim = ms.rockBucketDim;
  const bx0 = Math.max(0, Math.floor((x - ex_ - ms.rockBucketMinX) * inv));
  const by0 = Math.max(0, Math.floor((y - ex_ - ms.rockBucketMinY) * inv));
  const bx1 = Math.min(dim - 1, Math.floor((x + ex_ - ms.rockBucketMinX) * inv));
  const by1 = Math.min(dim - 1, Math.floor((y + ex_ - ms.rockBucketMinY) * inv));
  let count = 0;
  for (let bx = bx0; bx <= bx1; bx++) {
    for (let by = by0; by <= by1; by++) count = collectBucket(ms, bx, by, count);
  }
  sortCandidates(count);
  return count;
}

export function queryRocksNearSegment(
  ms: MapState, x0: number, y0: number, x1: number, y1: number, radius: number
): number {
  if (!rockIndexUsable(ms)) return -1;
  const cell = ms.rockBucketCell;
  const inv = 1 / cell;
  const minX = ms.rockBucketMinX, minY = ms.rockBucketMinY;
  const dim = ms.rockBucketDim;
  const ex_ = rockQueryExcess(radius);
  const pad = Math.ceil(ex_ * inv);

  const gMinX = minX - ex_ - cell, gMinY = minY - ex_ - cell;
  const gMaxX = minX + dim * cell + ex_ + cell;
  const gMaxY = minY + dim * cell + ex_ + cell;
  const fdx = x1 - x0, fdy = y1 - y0;
  let t0 = 0, t1 = 1;
  if (fdx === 0) {
    if (x0 < gMinX || x0 > gMaxX) return 0;
  } else {
    let ta = (gMinX - x0) / fdx, tb = (gMaxX - x0) / fdx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return 0;
  }
  if (fdy === 0) {
    if (y0 < gMinY || y0 > gMaxY) return 0;
  } else {
    let ta = (gMinY - y0) / fdy, tb = (gMaxY - y0) / fdy;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return 0;
  }
  const cx0 = x0 + fdx * t0, cy0 = y0 + fdy * t0;
  const cx1 = x0 + fdx * t1, cy1 = y0 + fdy * t1;

  beginRockQuery(ms);

  let bx = Math.floor((cx0 - minX) * inv);
  let by = Math.floor((cy0 - minY) * inv);
  const ex = Math.floor((cx1 - minX) * inv);
  const ey = Math.floor((cy1 - minY) * inv);

  const dx = cx1 - cx0, dy = cy1 - cy0;
  const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
  const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const tDeltaX = stepX !== 0 ? cell / adx : Infinity;
  const tDeltaY = stepY !== 0 ? cell / ady : Infinity;
  let tMaxX = stepX !== 0
    ? ((stepX > 0 ? (bx + 1) * cell + minX - cx0 : cx0 - (bx * cell + minX)) / adx)
    : Infinity;
  let tMaxY = stepY !== 0
    ? ((stepY > 0 ? (by + 1) * cell + minY - cy0 : cy0 - (by * cell + minY)) / ady)
    : Infinity;

  let count = 0;
  const maxSteps = 2 * dim + 4;
  for (let s = 0; s < maxSteps; s++) {
    const xa = bx - pad < 0 ? 0 : bx - pad, xb = bx + pad >= dim ? dim - 1 : bx + pad;
    const ya = by - pad < 0 ? 0 : by - pad, yb = by + pad >= dim ? dim - 1 : by + pad;
    for (let qx = xa; qx <= xb; qx++) {
      for (let qy = ya; qy <= yb; qy++) count = collectBucket(ms, qx, qy, count);
    }
    if (bx === ex && by === ey) break;
    if (tMaxX <= tMaxY) { tMaxX += tDeltaX; bx += stepX; }
    else { tMaxY += tDeltaY; by += stepY; }
    if (tMaxX === Infinity && tMaxY === Infinity) break;
  }
  sortCandidates(count);
  return count;
}

export function createNavigationState(mapState: MapState): NavigationState {
  const totalCells = mapState.gridCells * mapState.gridCellsY;
  ensureNavScratch(totalCells);
  const nav: NavigationState = {
    flowDirX: new Float32Array(totalCells),
    flowDirY: new Float32Array(totalCells),
    flowDist: new Uint16Array(totalCells).fill(UNREACHABLE),
    flowVersion: 0,
    lastTargetCellX: -1,
    lastTargetCellY: -1,
    flowMaskIsRockAware: false,
    rockOffX: 0,
    rockOffY: 0,
    gridCells: mapState.gridCells,
    gridCellsY: mapState.gridCellsY,
    cellSize: mapState.cellSize,
    mapHalf: mapState.mapHalf,
    mapHalfY: mapState.mapHalfY,
    deadEndDepth: new Uint8Array(totalCells),
    deadEndExitDirX: new Int8Array(totalCells),
    deadEndExitDirY: new Int8Array(totalCells),
    regionFlow: new Uint8Array(0),
    clearance: new Float32Array(0),
    clearanceMax: 0,
    regionsBuilt: false,
    navBlocked: new Uint8Array(0),
    navComponent: new Uint16Array(0),
    weaveGate: [null, null, null, null, null],
    dynEdgeBlock: new Map(),
    exactGrids: new Map(),
    exactDemand: [],
    auxFields: [],
    regionSeedIdx: new Int32Array(EXPLORE_REGION_COUNT).fill(-1),
    regionSeedX: new Float32Array(EXPLORE_REGION_COUNT),
    regionSeedY: new Float32Array(EXPLORE_REGION_COUNT),
    regionAxis: new Uint8Array(mapState.gridCells),
    regionAxisStart: new Int32Array(EXPLORE_REGION_DIM),
    regionAxisEnd: new Int32Array(EXPLORE_REGION_DIM),
    regionAxisY: new Uint8Array(mapState.gridCellsY),
    regionAxisStartY: new Int32Array(EXPLORE_REGION_DIM),
    regionAxisEndY: new Int32Array(EXPLORE_REGION_DIM),
  };
  buildDeadEndMap(nav, mapState);
  return nav;
}

export function ensureRegionFields(
  nav: NavigationState | null,
  mapState: MapState,
  rockOffX: number = 0,
  rockOffY: number = 0
): void {
  if (!nav || nav.regionsBuilt) return;
  const needed = nav.gridCells * nav.gridCellsY * EXPLORE_REGION_COUNT;
  if (nav.regionFlow.length !== needed) nav.regionFlow = new Uint8Array(needed);
  const cells = nav.gridCells * nav.gridCellsY;
  if (nav.clearance.length !== cells) nav.clearance = new Float32Array(cells);
  if (nav.navBlocked.length !== cells) nav.navBlocked = new Uint8Array(cells);
  if (nav.navComponent.length !== cells) nav.navComponent = new Uint16Array(cells);
  nav.rockOffX = rockOffX;
  nav.rockOffY = rockOffY;
  buildRegionFields(nav, mapState, rockOffX, rockOffY);
  nav.regionsBuilt = true;
}

export function releaseNavigationState(nav: NavigationState | null): void {
}

function _extraWallHit(ms: MapState, lx: number, ly: number, r: number): boolean {
  const wx = lx + (ms.extraOffX ?? 0), wy = ly + (ms.extraOffY ?? 0);
  const ex = ms.extraWalls;
  if (ex !== undefined && ex.length > 0 && _wallListHit(ms.walls, ex, wx, wy, r)) return true;
  const rr = r > 0 ? r : 0;
  return heldWallsReach(ms, wx - rr, wy - rr, wx + rr, wy + rr) && _wallListHit(ms.walls, ms.outWalls!, wx, wy, r);
}
export function heldWallsReach(ms: MapState, x0: number, y0: number, x1: number, y1: number): boolean {
  if (ms.outWalls === undefined) return false;
  const ix = ms.outInX ?? 0, iy = ms.outInY ?? 0;
  return x0 < -ix || x1 > ix || y0 < -iy || y1 > iy;
}
function _wallListHit(walls: WallEntity[], ex: readonly number[], wx: number, wy: number, r: number): boolean {
  for (let i = 0; i < ex.length; i++) {
    const w = walls[ex[i]];
    if (w === undefined || !w.active) continue;
    if (w.kind !== undefined && wallSkips(w, wx, wy)) continue;
    const ax = wx > w.x ? wx - w.x : w.x - wx, ay = wy > w.y ? wy - w.y : w.y - wy;
    const _pd = w.kind !== undefined ? wallSteerPad(w) : 0;
    if (_pd > 0) { const qx = ax > w.halfW ? ax - w.halfW : 0, qy = ay > w.halfH ? ay - w.halfH : 0, rr = (r > 0 ? r : 0) + _pd; if (qx * qx + qy * qy < rr * rr) return true; continue; }
    if (!(r > 0)) { if (ax < w.halfW && ay < w.halfH) return true; continue; }
    const qx = ax > w.halfW ? ax - w.halfW : 0, qy = ay > w.halfH ? ay - w.halfH : 0;
    if (qx * qx + qy * qy < r * r) return true;
  }
  return false;
}
function _extraWallSeg(ms: MapState, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  const ox = ms.extraOffX ?? 0, oy = ms.extraOffY ?? 0;
  const ax = x0 + ox, ay = y0 + oy, dx = x1 - x0, dy = y1 - y0;
  const ex = ms.extraWalls;
  if (ex !== undefined && ex.length > 0 && _wallListSeg(ms.walls, ex, ax, ay, dx, dy, r)) return true;
  const rr = r > 0 ? r : 0;
  return heldWallsReach(ms, Math.min(ax, ax + dx) - rr, Math.min(ay, ay + dy) - rr, Math.max(ax, ax + dx) + rr, Math.max(ay, ay + dy) + rr)
    && _wallListSeg(ms.walls, ms.outWalls!, ax, ay, dx, dy, r);
}
function _wallListSeg(walls: WallEntity[], ex: readonly number[], ax: number, ay: number, dx: number, dy: number, r: number): boolean {
  for (let i = 0; i < ex.length; i++) {
    const w = walls[ex[i]];
    if (w === undefined || !w.active) continue;
    const hw = w.halfW + r, hh = w.halfH + r;
    let t0 = 0, t1 = 1;
    if (dx === 0) { if (ax <= w.x - hw || ax >= w.x + hw) continue; }
    else {
      let a = (w.x - hw - ax) / dx, b = (w.x + hw - ax) / dx;
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
      if (t0 >= t1) continue;
    }
    if (dy === 0) { if (ay <= w.y - hh || ay >= w.y + hh) continue; }
    else {
      let a = (w.y - hh - ay) / dy, b = (w.y + hh - ay) / dy;
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
      if (t0 >= t1) continue;
    }
    return true;
  }
  return false;
}
function _owBack(ow: Int8Array, cur: number, n: number, f: number): number {
  const oc = ow[cur], on = ow[n];
  if (oc === 0 && on === 0) return 0;
  if (oc !== 0 && oc - 1 !== f) return -1;
  if (on !== 0) return on - 1 === f ? 1 : -1;
  return 0;
}
function _buildOneWay(nav: NavigationState, ms: MapState, total: number): Int8Array | null {
  nav.oneWayN = 0;
  if (!MAGIC_MAZE.ON || !MAGIC_MAZE.ONE_WAY_NAV) return null;
  const wg = ms.wallGrid, walls = ms.walls, held = ms.magicHeld;
  let ow: Int8Array | null = null, n = 0;
  for (let i = 0; i < total; i++) {
    const wi = wg[i];
    if (wi < 0) continue;
    const k = walls[wi]?.kind;
    if (k === undefined || k < 7 || k > 10 || !walls[wi].active) continue;
    if (held !== undefined && held.length === total && held[i] !== 0) continue;
    if (ow === null) { if (nav.oneWay === undefined || nav.oneWay.length !== total) nav.oneWay = new Int8Array(total); ow = nav.oneWay; ow.fill(0); }
    ow[i] = k === 7 ? 2 : k === 8 ? 1 : k === 9 ? 4 : 3;
    n++;
  }
  if (ow === null && nav.oneWay !== undefined) nav.oneWay.fill(0);
  nav.oneWayN = n;
  return n > 0 ? ow : null;
}
function _cellWallBlocks(ms: MapState, idx: number, wx: number, wy: number): boolean {
  const w = ms.walls[ms.wallGrid[idx]];
  return w === undefined || w.kind === undefined || !wallSkips(w, wx, wy);
}
let _rebuildTiles = new Uint8Array(0);
export function rebuildNavigation(nav: NavigationState, mapState: MapState): void {
  const total = nav.gridCells * nav.gridCellsY;
  if (nav.regionsBuilt) {
    nav.navBlocked = new Uint8Array(total);
    buildRegionFields(nav, mapState, nav.rockOffX, nav.rockOffY);
  }
  if (_rebuildTiles.length < total) _rebuildTiles = new Uint8Array(total);
  const tiles = _rebuildTiles.length === total ? _rebuildTiles : _rebuildTiles.subarray(0, total);
  const wg = mapState.wallGrid;
  const gcY = nav.gridCellsY, cs = nav.cellSize, mh = nav.mapHalf, mhY = nav.mapHalfY;
  const _heldT = mapState.magicHeld !== undefined && mapState.magicHeld.length === total ? mapState.magicHeld : undefined;
  for (let i = 0; i < total; i++) {
    const gx = (i / gcY) | 0, gy = i - gx * gcY;
    tiles[i] = wg[i] >= 0 || (_heldT !== undefined && _heldT[i] !== 0) || _extraWallHit(mapState, -mh + (gx + 0.5) * cs, -mhY + (gy + 0.5) * cs, 0) ? TileType.WALL : TileType.NORMAL;
  }
  buildDeadEndMap(nav, { tileGrid: tiles, rockGrid: mapState.rockGrid } as MapState);
  nav.exactGrids.clear();
  nav.exactDemand.length = 0;
  nav.auxFields.length = 0;
  for (let i = 0; i < nav.weaveGate.length; i++) nav.weaveGate[i] = null;
  nav.dynEdgeBlock.clear();
  nav.lastTargetCellX = -1;
  nav.lastTargetCellY = -1;
  nav.flowVersion++;
}

function buildDeadEndMap(nav: NavigationState, mapState: MapState): void {
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const total = gc * gcY;
  const tileGrid = mapState.tileGrid;
  const rockGrid = mapState.rockGrid;
  const depth = nav.deadEndDepth;
  const exitX = nav.deadEndExitDirX;
  const exitY = nav.deadEndExitDirY;
  const degree = _bfsDegree;

  depth.fill(0);
  exitX.fill(0);
  exitY.fill(0);

  let qHead = 0;
  let qTail = 0;

  for (let gx = 0; gx < gc; gx++) {
    for (let gy = 0; gy < gcY; gy++) {
      const idx = gx * gcY + gy;
      if (tileGrid[idx] === TileType.WALL || rockGrid[idx] >= 0) {
        degree[idx] = 0;
        continue;
      }

      let deg = 0;
      if (gx > 0       && tileGrid[(gx - 1) * gcY + gy] !== TileType.WALL && rockGrid[(gx - 1) * gcY + gy] < 0) deg++;
      if (gx < gc - 1  && tileGrid[(gx + 1) * gcY + gy] !== TileType.WALL && rockGrid[(gx + 1) * gcY + gy] < 0) deg++;
      if (gy > 0       && tileGrid[gx * gcY + (gy - 1)] !== TileType.WALL && rockGrid[gx * gcY + (gy - 1)] < 0) deg++;
      if (gy < gcY - 1 && tileGrid[gx * gcY + (gy + 1)] !== TileType.WALL && rockGrid[gx * gcY + (gy + 1)] < 0) deg++;
      degree[idx] = deg;

      if (deg === 1) {
        _bfsQueue[qTail++] = idx;
      }
    }
  }

  while (qHead < qTail) {
    const curIdx = _bfsQueue[qHead++];
    degree[curIdx] = 0;
    const cx = (curIdx / gcY) | 0;
    const cy = curIdx - cx * gcY;

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX4[d];
      const ny = cy + DY4[d];
      if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;

      const nIdx = nx * gcY + ny;
      if (degree[nIdx] <= 1) continue;

      degree[nIdx]--;
      if (degree[nIdx] === 1) {
        _bfsQueue[qTail++] = nIdx;
      }
    }
  }

  qHead = 0;
  qTail = 0;

  for (let i = 0; i < total; i++) {
    if (degree[i] > 0) {
      _bfsQueue[qTail++] = i;
    } else if (tileGrid[i] !== TileType.WALL && rockGrid[i] < 0) {
      depth[i] = 255;
    }
  }

  while (qHead < qTail) {
    const curIdx = _bfsQueue[qHead++];
    const curDepth = depth[curIdx];
    const cx = (curIdx / gcY) | 0;
    const cy = curIdx - cx * gcY;

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX4[d];
      const ny = cy + DY4[d];
      if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;

      const nIdx = nx * gcY + ny;
      if (depth[nIdx] !== 255) continue;

      const newDepth = curDepth + 1;
      depth[nIdx] = newDepth < 254 ? newDepth : 254;
      exitX[nIdx] = cx - nx;
      exitY[nIdx] = cy - ny;
      _bfsQueue[qTail++] = nIdx;
    }
  }

  for (let i = 0; i < total; i++) {
    if (depth[i] === 255) depth[i] = 0;
  }
}

export function queryDeadEndMap(
  nav: NavigationState,
  worldX: number,
  worldY: number
): typeof _deadEndResult {
  const gx = worldToGrid(worldX, nav.mapHalf, nav.cellSize, nav.gridCells);
  const gy = worldToGrid(worldY, nav.mapHalfY, nav.cellSize, nav.gridCellsY);
  if (gx < 0 || gy < 0) {
    _deadEndResult.depth = 0;
    _deadEndResult.exitDirX = 0;
    _deadEndResult.exitDirY = 0;
    return _deadEndResult;
  }
  const idx = gx * nav.gridCellsY + gy;
  _deadEndResult.depth = nav.deadEndDepth[idx];
  _deadEndResult.exitDirX = nav.deadEndExitDirX[idx];
  _deadEndResult.exitDirY = nav.deadEndExitDirY[idx];
  return _deadEndResult;
}

function buildRegionFields(
  nav: NavigationState,
  mapState: MapState,
  rockOffX: number,
  rockOffY: number
): void {
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const total = gc * gcY;
  const cs = nav.cellSize;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const wallGrid = mapState.wallGrid;
  const flow = nav.regionFlow;

  flow.fill(STEP_NONE);
  nav.regionSeedIdx.fill(-1);

  const blocked = _regionBlocked;
  for (let i = 0; i < total; i++) blocked[i] = wallGrid[i] >= 0 ? 1 : 0;
  const _held = mapState.magicHeld;
  if (_held !== undefined && _held.length === total) for (let i = 0; i < total; i++) if (_held[i] !== 0) blocked[i] = 1;
  const _ow = _buildOneWay(nav, mapState, total);
  if ((mapState.extraWalls !== undefined && mapState.extraWalls.length > 0) || mapState.outWalls !== undefined) {
    for (let i = 0; i < total; i++) {
      if (blocked[i] !== 0) continue;
      const gx = (i / gcY) | 0, gy = i - gx * gcY;
      if (_extraWallHit(mapState, -mh + (gx + 0.5) * cs, -mhY + (gy + 0.5) * cs, 0)) blocked[i] = 1;
    }
  }
  {
    const rocks = mapState.rocks;
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      if (!r.active) continue;
      const rlx = r.x - rockOffX;
      const rly = r.y - rockOffY;
      const gxMin = Math.max(0, Math.floor((rlx - r.size + mh) / cs) - 1);
      const gxMax = Math.min(gc - 1, Math.floor((rlx + r.size + mh) / cs) + 1);
      const gyMin = Math.max(0, Math.floor((rly - r.size + mhY) / cs) - 1);
      const gyMax = Math.min(gcY - 1, Math.floor((rly + r.size + mhY) / cs) + 1);
      const r2 = r.size * r.size;
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const px = -mh + gx * cs + cs * 0.5 - rlx;
        for (let gy = gyMin; gy <= gyMax; gy++) {
          const py = -mhY + gy * cs + cs * 0.5 - rly;
          if (px * px + py * py < r2) blocked[gx * gcY + gy] = 1;
        }
      }
    }
  }

  {
    const clearance = nav.clearance;
    const clearMax = cs * 2;
    nav.clearanceMax = clearMax;
    clearance.fill(clearMax);
    const walls = mapState.walls;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (!w.active) continue;
      const wlx = w.x - rockOffX;
      const wly = w.y - rockOffY;
      const left = wlx - w.halfW;
      const right = wlx + w.halfW;
      const top = wly - w.halfH;
      const bottom = wly + w.halfH;
      const gxMin = Math.max(0, Math.floor((left - clearMax + mh) / cs));
      const gxMax = Math.min(gc - 1, Math.floor((right + clearMax + mh) / cs));
      const gyMin = Math.max(0, Math.floor((top - clearMax + mhY) / cs));
      const gyMax = Math.min(gcY - 1, Math.floor((bottom + clearMax + mhY) / cs));
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const ccx = -mh + gx * cs + cs * 0.5;
        const clX = ccx < left ? left : (ccx > right ? right : ccx);
        const ddx = ccx - clX;
        for (let gy = gyMin; gy <= gyMax; gy++) {
          const ccy = -mhY + gy * cs + cs * 0.5;
          const clY = ccy < top ? top : (ccy > bottom ? bottom : ccy);
          const ddy = ccy - clY;
          const d = Math.sqrt(ddx * ddx + ddy * ddy);
          const idx = gx * gcY + gy;
          if (d < clearance[idx]) clearance[idx] = d;
        }
      }
    }
    const rocks = mapState.rocks;
    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      if (!r.active) continue;
      const rlx = r.x - rockOffX;
      const rly = r.y - rockOffY;
      const reach = r.size + clearMax;
      const gxMin = Math.max(0, Math.floor((rlx - reach + mh) / cs));
      const gxMax = Math.min(gc - 1, Math.floor((rlx + reach + mh) / cs));
      const gyMin = Math.max(0, Math.floor((rly - reach + mhY) / cs));
      const gyMax = Math.min(gcY - 1, Math.floor((rly + reach + mhY) / cs));
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const px = -mh + gx * cs + cs * 0.5 - rlx;
        for (let gy = gyMin; gy <= gyMax; gy++) {
          const py = -mhY + gy * cs + cs * 0.5 - rly;
          let d = Math.sqrt(px * px + py * py) - r.size;
          if (d < 0) d = 0;
          const idx = gx * gcY + gy;
          if (d < clearance[idx]) clearance[idx] = d;
        }
      }
    }
  }

  if (nav.navBlocked.length === total) nav.navBlocked.set(blocked.subarray(0, total));
  if (_ow !== null) for (let i = 0; i < total; i++) if (_ow[i] !== 0) blocked[i] = 0;
  _labelComponents(nav, gc, blocked);

  const span = gc / EXPLORE_REGION_DIM;
  for (let r = 0; r < EXPLORE_REGION_DIM; r++) {
    const a0 = Math.floor(r * span);
    const a1 = r === EXPLORE_REGION_DIM - 1 ? gc : Math.floor((r + 1) * span);
    nav.regionAxisStart[r] = a0;
    nav.regionAxisEnd[r] = a1;
    for (let a = a0; a < a1; a++) nav.regionAxis[a] = r;
  }
  const spanY = gcY / EXPLORE_REGION_DIM;
  for (let r = 0; r < EXPLORE_REGION_DIM; r++) {
    const a0 = Math.floor(r * spanY);
    const a1 = r === EXPLORE_REGION_DIM - 1 ? gcY : Math.floor((r + 1) * spanY);
    nav.regionAxisStartY[r] = a0;
    nav.regionAxisEndY[r] = a1;
    for (let a = a0; a < a1; a++) nav.regionAxisY[a] = r;
  }

  for (let r = 0; r < EXPLORE_REGION_COUNT; r++) {
    const rx = r % EXPLORE_REGION_DIM;
    const ry = (r / EXPLORE_REGION_DIM) | 0;
    const gx0 = nav.regionAxisStart[rx];
    const gy0 = nav.regionAxisStartY[ry];
    const gx1 = nav.regionAxisEnd[rx];
    const gy1 = nav.regionAxisEndY[ry];

    const ccx = (gx0 + gx1 - 1) * 0.5;
    const ccy = (gy0 + gy1 - 1) * 0.5;
    let seed = -1;
    let bestD = Infinity;
    for (let gx = gx0; gx < gx1; gx++) {
      for (let gy = gy0; gy < gy1; gy++) {
        const idx = gx * gcY + gy;
        if (blocked[idx] || (_ow !== null && _ow[idx] !== 0)) continue;
        const ddx = gx - ccx;
        const ddy = gy - ccy;
        const d = ddx * ddx + ddy * ddy;
        if (d < bestD) { bestD = d; seed = idx; }
      }
    }
    if (seed < 0) continue;

    const sx = (seed / gcY) | 0;
    const sy = seed - sx * gcY;
    nav.regionSeedIdx[r] = seed;
    nav.regionSeedX[r] = -mh + sx * cs + cs * 0.5;
    nav.regionSeedY[r] = -mhY + sy * cs + cs * 0.5;

    const base = r * total;
    for (let i = 0; i < total; i++) _bfsVisited[i] = 0;
    _bfsVisited[seed] = 1;
    _bfsQueue[0] = seed;
    let qHead = 0;
    let qTail = 1;

    while (qHead < qTail) {
      const curIdx = _bfsQueue[qHead++];
      const cx = (curIdx / gcY) | 0;
      const cy = curIdx - cx * gcY;

      for (let d = 0; d < 4; d++) {
        const nx = cx + DX4[d];
        const ny = cy + DY4[d];
        if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
        const nIdx = nx * gcY + ny;
        if (_bfsVisited[nIdx]) continue;
        if (blocked[nIdx]) continue;
        if (_ow !== null && _owBack(_ow, curIdx, nIdx, d ^ 1) < 0) continue;

        _bfsVisited[nIdx] = 1;
        const sdx = cx - nx;
        const sdy = cy - ny;
        flow[base + nIdx] = sdx < 0 ? 1 : sdx > 0 ? 2 : sdy < 0 ? 3 : 4;
        _bfsQueue[qTail++] = nIdx;
      }
    }
  }
}

export function regionOfLocal(nav: NavigationState, localX: number, localY: number): number {
  const gx = worldToGrid(localX, nav.mapHalf, nav.cellSize, nav.gridCells);
  const gy = worldToGrid(localY, nav.mapHalfY, nav.cellSize, nav.gridCellsY);
  if (gx < 0 || gy < 0) return -1;
  return nav.regionAxisY[gy] * EXPLORE_REGION_DIM + nav.regionAxis[gx];
}

export function regionBoundsInto(
  nav: NavigationState,
  region: number,
  out: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  if (region < 0 || region >= EXPLORE_REGION_COUNT) return false;
  const cs = nav.cellSize;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const rx = region % EXPLORE_REGION_DIM;
  const ry = (region / EXPLORE_REGION_DIM) | 0;
  out.minX = -mh + nav.regionAxisStart[rx] * cs;
  out.minY = -mhY + nav.regionAxisStartY[ry] * cs;
  out.maxX = -mh + nav.regionAxisEnd[rx] * cs;
  out.maxY = -mhY + nav.regionAxisEndY[ry] * cs;
  return true;
}

const _regionRectTmp = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

export function regionOverlapsRect(
  nav: NavigationState,
  region: number,
  minX: number, minY: number,
  maxX: number, maxY: number
): boolean {
  if (!regionBoundsInto(nav, region, _regionRectTmp)) return false;
  return maxX >= _regionRectTmp.minX && minX <= _regionRectTmp.maxX &&
         maxY >= _regionRectTmp.minY && minY <= _regionRectTmp.maxY;
}

export function regionIsReachable(
  nav: NavigationState,
  region: number,
  localX: number,
  localY: number
): boolean {
  if (region < 0 || region >= EXPLORE_REGION_COUNT) return false;
  const seed = nav.regionSeedIdx[region];
  if (seed < 0) return false;
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const gx = worldToGrid(localX, nav.mapHalf, nav.cellSize, gc);
  const gy = worldToGrid(localY, nav.mapHalfY, nav.cellSize, gcY);
  if (gx < 0 || gy < 0) return false;
  const idx = gx * gcY + gy;
  return idx === seed || nav.regionFlow[region * gc * gcY + idx] !== STEP_NONE;
}

export function queryRegionStepSmooth(
  nav: NavigationState,
  region: number,
  localX: number,
  localY: number
): typeof _regionStepSmoothResult {
  _regionStepSmoothResult.dirX = 0;
  _regionStepSmoothResult.dirY = 0;
  _regionStepSmoothResult.ok = false;
  if (region < 0 || region >= EXPLORE_REGION_COUNT || nav.regionSeedIdx[region] < 0) {
    return _regionStepSmoothResult;
  }

  const gc = nav.gridCells;

  const gcY = nav.gridCellsY;
  const cs = nav.cellSize;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const base = region * gc * gcY;
  const flow = nav.regionFlow;

  const fx = (localX + mh) / cs - 0.5;
  const fy = (localY + mhY) / cs - 0.5;
  const gx0 = Math.floor(fx);
  const gy0 = Math.floor(fy);
  const tx = fx - gx0;
  const ty = fy - gy0;
  const gx1 = gx0 + 1;
  const gy1 = gy0 + 1;

  let sdx = 0, sdy = 0, sw = 0;

  if (gx0 >= 0 && gx0 < gc && gy0 >= 0 && gy0 < gcY) {
    const c = flow[base + gx0 * gcY + gy0];
    if (c !== STEP_NONE) { const w = (1 - tx) * (1 - ty); sdx += _STEP_DX[c] * w; sdy += _STEP_DY[c] * w; sw += w; }
  }
  if (gx1 >= 0 && gx1 < gc && gy0 >= 0 && gy0 < gcY) {
    const c = flow[base + gx1 * gcY + gy0];
    if (c !== STEP_NONE) { const w = tx * (1 - ty); sdx += _STEP_DX[c] * w; sdy += _STEP_DY[c] * w; sw += w; }
  }
  if (gx0 >= 0 && gx0 < gc && gy1 >= 0 && gy1 < gcY) {
    const c = flow[base + gx0 * gcY + gy1];
    if (c !== STEP_NONE) { const w = (1 - tx) * ty; sdx += _STEP_DX[c] * w; sdy += _STEP_DY[c] * w; sw += w; }
  }
  if (gx1 >= 0 && gx1 < gc && gy1 >= 0 && gy1 < gcY) {
    const c = flow[base + gx1 * gcY + gy1];
    if (c !== STEP_NONE) { const w = tx * ty; sdx += _STEP_DX[c] * w; sdy += _STEP_DY[c] * w; sw += w; }
  }

  if (sw > 0.001) {
    sdx /= sw; sdy /= sw;
    const m = Math.sqrt(sdx * sdx + sdy * sdy);
    if (m > 0.001) {
      _regionStepSmoothResult.dirX = sdx / m;
      _regionStepSmoothResult.dirY = sdy / m;
      _regionStepSmoothResult.ok = true;
    }
  }
  return _regionStepSmoothResult;
}

export function queryRegionStep(
  nav: NavigationState,
  region: number,
  localX: number,
  localY: number
): typeof _regionStepResult {
  _regionStepResult.dirX = 0;
  _regionStepResult.dirY = 0;
  _regionStepResult.ok = false;
  if (region < 0 || region >= EXPLORE_REGION_COUNT || nav.regionSeedIdx[region] < 0) {
    return _regionStepResult;
  }
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const gx = worldToGrid(localX, nav.mapHalf, nav.cellSize, gc);
  const gy = worldToGrid(localY, nav.mapHalfY, nav.cellSize, gcY);
  if (gx < 0 || gy < 0) return _regionStepResult;
  const c = nav.regionFlow[region * gc * gcY + gx * gcY + gy];
  if (c === STEP_NONE) return _regionStepResult;
  _regionStepResult.dirX = _STEP_DX[c];
  _regionStepResult.dirY = _STEP_DY[c];
  _regionStepResult.ok = true;
  return _regionStepResult;
}

export function computeRegionWaypoint(
  nav: NavigationState,
  ms: MapState,
  region: number,
  localX: number,
  localY: number,
  offX: number,
  offY: number,
  maxCells: number,
  bodyRadius: number = 0
): typeof _regionWaypoint {
  _regionWaypoint.ok = false;
  _regionWaypoint.x = localX;
  _regionWaypoint.y = localY;
  _regionWaypoint.dirX = 0;
  _regionWaypoint.dirY = 0;

  const raw = queryRegionStep(nav, region, localX, localY);
  if (!raw.ok) return _regionWaypoint;
  const rawX = raw.dirX;
  const rawY = raw.dirY;

  let dirX = rawX;
  let dirY = rawY;
  const blend = queryRegionStepSmooth(nav, region, localX, localY);
  if (blend.ok && blend.dirX * rawX + blend.dirY * rawY > 0) {
    dirX = blend.dirX;
    dirY = blend.dirY;
  }

  const cs = nav.cellSize;
  const probe = cs * 0.5;
  const maxDist = cs * maxCells;

  let bestDist = _marchClear(nav, ms, region, localX, localY, dirX, dirY, probe, maxDist, offX, offY, bodyRadius);

  if (bestDist <= 0 && (dirX !== rawX || dirY !== rawY)) {
    dirX = rawX;
    dirY = rawY;
    bestDist = _marchClear(nav, ms, region, localX, localY, dirX, dirY, probe, maxDist, offX, offY, bodyRadius);
  }

  if (bestDist <= 0) {
    const gc = nav.gridCells;
    const gcY = nav.gridCellsY;
    const gx = worldToGrid(localX, nav.mapHalf, nav.cellSize, gc);
    const gy = worldToGrid(localY, nav.mapHalfY, nav.cellSize, gcY);
    if (gx < 0 || gy < 0) return _regionWaypoint;
    const nx = gx + rawX;
    const ny = gy + rawY;
    if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) return _regionWaypoint;
    const cxw = -nav.mapHalf + nx * cs + cs * 0.5;
    const cyw = -nav.mapHalfY + ny * cs + cs * 0.5;
    if (!isWalkable(ms, cxw, cyw, offX, offY, bodyRadius)) return _regionWaypoint;
    _regionWaypoint.x = cxw;
    _regionWaypoint.y = cyw;
    _regionWaypoint.dirX = rawX;
    _regionWaypoint.dirY = rawY;
    _regionWaypoint.ok = true;
    return _regionWaypoint;
  }

  _regionWaypoint.x = localX + dirX * bestDist;
  _regionWaypoint.y = localY + dirY * bestDist;
  _regionWaypoint.dirX = dirX;
  _regionWaypoint.dirY = dirY;
  _regionWaypoint.ok = true;
  return _regionWaypoint;
}

function _marchClear(
  nav: NavigationState,
  ms: MapState,
  region: number,
  x: number, y: number,
  dirX: number, dirY: number,
  probe: number, maxDist: number,
  offX: number, offY: number,
  bodyRadius: number = 0
): number {
  if (bodyRadius > 0) {
    const wide = _marchClearAt(nav, ms, region, x, y, dirX, dirY, probe, maxDist,
      offX, offY, bodyRadius + AI_CONSTANTS.PURSUIT_PATH_CLEAR_MARGIN);
    if (wide > 0) return wide;
  }
  return _marchClearAt(nav, ms, region, x, y, dirX, dirY, probe, maxDist, offX, offY, bodyRadius);
}

function _marchClearAt(
  nav: NavigationState,
  ms: MapState,
  region: number,
  x: number, y: number,
  dirX: number, dirY: number,
  probe: number, maxDist: number,
  offX: number, offY: number,
  bodyRadius: number = 0
): number {
  let best = 0;
  for (let d = probe; d <= maxDist + 0.001; d += probe) {
    const px = x + dirX * d;
    const py = y + dirY * d;
    if (!isWalkable(ms, px, py, offX, offY, bodyRadius)) break;
    if (!regionIsReachable(nav, region, px, py)) break;
    best = d;
  }
  return best;
}

function worldToGrid(worldCoord: number, mapHalf: number, cellSize: number, gridCells: number): number {
  const g = Math.floor((worldCoord + mapHalf) / cellSize);
  if (g < 0 || g >= gridCells) return -1;
  return g;
}

function flatIdx(gx: number, gy: number, gcY: number): number {
  return gx * gcY + gy;
}

export function recomputeFlowField(
  nav: NavigationState,
  targetWorldX: number,
  targetWorldY: number,
  mapState: MapState
): void {
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const cs = nav.cellSize;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;

  const tgx = worldToGrid(targetWorldX, mh, cs, gc);
  const tgy = worldToGrid(targetWorldY, mhY, cs, gcY);

  if (tgx < 0 || tgy < 0) return;

  const totalCells = gc * gcY;
  const tileGrid = mapState.tileGrid;
  const rockGrid = mapState.rockGrid;

  const mask = nav.regionsBuilt && nav.navBlocked.length === totalCells ? nav.navBlocked : null;
  const maskIsRockAware = mask !== null;
  const _owFl = mask !== null && nav.oneWayN && nav.oneWay !== undefined && nav.oneWay.length === totalCells ? nav.oneWay : null;
  if (tgx === nav.lastTargetCellX && tgy === nav.lastTargetCellY &&
      maskIsRockAware === nav.flowMaskIsRockAware) return;

  nav.lastTargetCellX = tgx;
  nav.lastTargetCellY = tgy;
  nav.flowMaskIsRockAware = maskIsRockAware;
  nav.flowVersion++;

  const flowDirX = nav.flowDirX;
  const flowDirY = nav.flowDirY;
  const flowDist = nav.flowDist;

  flowDist.fill(UNREACHABLE);
  for (let i = 0; i < totalCells; i++) _bfsVisited[i] = 0;

  const seedIdx = _openSeedIdx(tileGrid, rockGrid, mask, gc, gcY, tgx, tgy);
  if (seedIdx < 0) return;

  flowDist[seedIdx] = 0;
  flowDirX[seedIdx] = 0;
  flowDirY[seedIdx] = 0;
  _bfsVisited[seedIdx] = 1;
  _bfsQueue[0] = seedIdx;

  let qHead = 0;
  let qTail = 1;

  while (qHead < qTail) {
    const curFlat = _bfsQueue[qHead++];
    const curDist = flowDist[curFlat];
    const cx = (curFlat / gcY) | 0;
    const cy = curFlat - cx * gcY;

    for (let d = 0; d < 4; d++) {
      const nx = cx + DX4[d];
      const ny = cy + DY4[d];

      if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;

      const nFlat = nx * gcY + ny;

      if (_bfsVisited[nFlat]) continue;

      const _owF = _owFl !== null ? _owBack(_owFl, curFlat, nFlat, d ^ 1) : 0;
      if (_owF < 0) continue;
      if (_owF === 0 && (mask ? mask[nFlat] !== 0 : (tileGrid[nFlat] === TileType.WALL || rockGrid[nFlat] >= 0))) continue;

      _bfsVisited[nFlat] = 1;
      flowDist[nFlat] = curDist + 1;

      flowDirX[nFlat] = cx - nx;
      flowDirY[nFlat] = cy - ny;

      _bfsQueue[qTail++] = nFlat;
    }
  }
}

export function queryFlowField(
  nav: NavigationState,
  worldX: number,
  worldY: number
): FlowQueryResult {
  const gx = worldToGrid(worldX, nav.mapHalf, nav.cellSize, nav.gridCells);
  const gy = worldToGrid(worldY, nav.mapHalfY, nav.cellSize, nav.gridCellsY);

  if (gx < 0 || gy < 0) {
    _queryResult.dirX = 0;
    _queryResult.dirY = 0;
    _queryResult.dist = UNREACHABLE;
    return _queryResult;
  }

  const idx = gx * nav.gridCellsY + gy;
  _queryResult.dirX = nav.flowDirX[idx];
  _queryResult.dirY = nav.flowDirY[idx];
  _queryResult.dist = nav.flowDist[idx];
  return _queryResult;
}

export function queryFlowFieldSmooth(
  nav: NavigationState,
  worldX: number,
  worldY: number,
  bodyRadius: number = 0
): FlowQueryResult {
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const cs = nav.cellSize;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;

  const fx = (worldX + mh) / cs - 0.5;
  const fy = (worldY + mhY) / cs - 0.5;
  const gx0 = Math.floor(fx);
  const gy0 = Math.floor(fy);
  const tx = fx - gx0;
  const ty = fy - gy0;

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  const gx1 = gx0 + 1;
  const gy1 = gy0 + 1;
  let sdx = 0, sdy = 0, sw = 0, md = UNREACHABLE;

  const clear = nav.clearance;
  const gate0 = bodyRadius > 0 && clear.length === gc * gcY && nav.clearanceMax > 0;
  for (let pass = gate0 ? 0 : 1; pass < 2; pass++) {
    const gated = pass === 0;
    sdx = 0; sdy = 0; sw = 0; md = UNREACHABLE;

    if (gx0 >= 0 && gx0 < gc && gy0 >= 0 && gy0 < gcY) {
      const idx = gx0 * gcY + gy0;
      const d = nav.flowDist[idx];
      if (d < UNREACHABLE && !(gated && clear[idx] < bodyRadius && clear[idx] < nav.clearanceMax)) {
        sdx += nav.flowDirX[idx] * w00; sdy += nav.flowDirY[idx] * w00; sw += w00; if (d < md) md = d;
      }
    }
    if (gx1 >= 0 && gx1 < gc && gy0 >= 0 && gy0 < gcY) {
      const idx = gx1 * gcY + gy0;
      const d = nav.flowDist[idx];
      if (d < UNREACHABLE && !(gated && clear[idx] < bodyRadius && clear[idx] < nav.clearanceMax)) {
        sdx += nav.flowDirX[idx] * w10; sdy += nav.flowDirY[idx] * w10; sw += w10; if (d < md) md = d;
      }
    }
    if (gx0 >= 0 && gx0 < gc && gy1 >= 0 && gy1 < gcY) {
      const idx = gx0 * gcY + gy1;
      const d = nav.flowDist[idx];
      if (d < UNREACHABLE && !(gated && clear[idx] < bodyRadius && clear[idx] < nav.clearanceMax)) {
        sdx += nav.flowDirX[idx] * w01; sdy += nav.flowDirY[idx] * w01; sw += w01; if (d < md) md = d;
      }
    }
    if (gx1 >= 0 && gx1 < gc && gy1 >= 0 && gy1 < gcY) {
      const idx = gx1 * gcY + gy1;
      const d = nav.flowDist[idx];
      if (d < UNREACHABLE && !(gated && clear[idx] < bodyRadius && clear[idx] < nav.clearanceMax)) {
        sdx += nav.flowDirX[idx] * w11; sdy += nav.flowDirY[idx] * w11; sw += w11; if (d < md) md = d;
      }
    }
    if (sw > 0.001) break;
  }

  if (sw > 0.001) {
    sdx /= sw; sdy /= sw;
    const m = Math.sqrt(sdx * sdx + sdy * sdy);
    if (m > 0.001) { _smoothResult.dirX = sdx / m; _smoothResult.dirY = sdy / m; }
    else { _smoothResult.dirX = 0; _smoothResult.dirY = 0; }
    _smoothResult.dist = md;
  } else {
    _smoothResult.dirX = 0; _smoothResult.dirY = 0; _smoothResult.dist = UNREACHABLE;
  }
  return _smoothResult;
}

export const AUX_DIST_FIELDS_MAX = 48;

const _distStepResult = { dirX: 0, dirY: 0, ok: false };
const _distStepSmoothResult = { dirX: 0, dirY: 0, ok: false };

function _openSeedIdx(
  tileGrid: Uint8Array, rockGrid: Int16Array, mask: Uint8Array | null,
  gc: number, gcY: number, tgx: number, tgy: number,
  searchRadius: number = 3,
): number {
  const seedIdx = tgx * gcY + tgy;
  const seedBlocked = mask ? mask[seedIdx] !== 0 : (tileGrid[seedIdx] === TileType.WALL || rockGrid[seedIdx] >= 0);
  if (!seedBlocked) return seedIdx;
  let bestIdx = -1;
  let bestDistSq = Infinity;
  for (let sx = -searchRadius; sx <= searchRadius; sx++) {
    for (let sy = -searchRadius; sy <= searchRadius; sy++) {
      const nx = tgx + sx;
      const ny = tgy + sy;
      if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
      const ni = nx * gcY + ny;
      const open = mask ? mask[ni] === 0 : (tileGrid[ni] !== TileType.WALL && rockGrid[ni] < 0);
      if (open) {
        const d = sx * sx + sy * sy;
        if (d < bestDistSq) { bestDistSq = d; bestIdx = ni; }
      }
    }
  }
  return bestIdx;
}

export function _edgeRockClear(
  nav: NavigationState, ms: MapState,
  ax: number, ay: number, bx: number, by: number,
  classR: number,
): boolean {
  const awx = ax + nav.rockOffX;
  const awy = ay + nav.rockOffY;
  const bwx = bx + nav.rockOffX;
  const bwy = by + nav.rockOffY;
  const mx = (awx + bwx) * 0.5;
  const my = (awy + bwy) * 0.5;
  const segHalf = Math.sqrt((bwx - awx) * (bwx - awx) + (bwy - awy) * (bwy - awy)) * 0.5;
  const n = queryRocksNearPoint(ms, mx, my, segHalf + classR);
  const rocks = ms.rocks;
  const dxs = bwx - awx;
  const dys = bwy - awy;
  const segLenSq = dxs * dxs + dys * dys;
  const lim = n >= 0 ? n : rocks.length;
  const cand = n >= 0 ? rockQueryBuf() : null;
  for (let k = 0; k < lim; k++) {
    const r = rocks[cand ? cand[k] : k];
    if (!r.active) continue;
    let t = segLenSq > 0.0001 ? ((r.x - awx) * dxs + (r.y - awy) * dys) / segLenSq : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = awx + dxs * t - r.x;
    const cy = awy + dys * t - r.y;
    const need = r.size + classR;
    if (cx * cx + cy * cy < need * need) return false;
  }
  return true;
}

function _cellWeaveOpen(nav: NavigationState, ms: MapState, cx: number, cy: number, classR: number): boolean {
  const cs = nav.cellSize;
  const bx = -nav.mapHalf + cx * cs + cs * 0.5;
  const by = -nav.mapHalfY + cy * cs + cs * 0.5;
  const oX = nav.rockOffX, oY = nav.rockOffY;
  if (isWalkable(ms, bx, by, oX, oY, classR)) return true;
  const o = cs * 0.3;
  return isWalkable(ms, bx - o, by - o, oX, oY, classR) || isWalkable(ms, bx + o, by - o, oX, oY, classR)
      || isWalkable(ms, bx - o, by + o, oX, oY, classR) || isWalkable(ms, bx + o, by + o, oX, oY, classR);
}

function _cellLatticeOpen(nav: NavigationState, ms: MapState, cx: number, cy: number, classR: number): boolean {
  const cs = nav.cellSize;
  const bx = -nav.mapHalf + cx * cs + cs * 0.5;
  const by = -nav.mapHalfY + cy * cs + cs * 0.5;
  const oX = nav.rockOffX, oY = nav.rockOffY;
  const step = cs / 7;
  for (let ix = -3; ix <= 3; ix++) {
    for (let iy = -3; iy <= 3; iy++) {
      if (isWalkable(ms, bx + ix * step, by + iy * step, oX, oY, classR)) return true;
    }
  }
  return false;
}

function _edgeLatticeOpen(
  nav: NavigationState, ms: MapState,
  ax: number, ay: number, bx: number, by: number,
  classR: number,
): boolean {
  const cs = nav.cellSize;
  const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
  let dx = bx - ax, dy = by - ay;
  const m = Math.sqrt(dx * dx + dy * dy);
  if (m < 0.001) return false;
  dx /= m; dy /= m;
  const px = -dy, py = dx;
  const oX = nav.rockOffX, oY = nav.rockOffY;
  const latStep = cs / 16;
  const chain = cs * 0.125;
  for (let k = -7; k <= 7; k++) {
    const cxp = mx + px * k * latStep, cyp = my + py * k * latStep;
    let ok = true;
    for (let c = -2; c <= 2; c++) {
      if (!isWalkable(ms, cxp + dx * c * chain, cyp + dy * c * chain, oX, oY, classR)) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function _edgeWeaveOpen(
  nav: NavigationState, ms: MapState,
  ax: number, ay: number, bx: number, by: number,
  classR: number,
): boolean {
  const cs = nav.cellSize;
  const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
  let dx = bx - ax, dy = by - ay;
  const m = Math.sqrt(dx * dx + dy * dy);
  if (m < 0.001) return false;
  dx /= m; dy /= m;
  const px = -dy, py = dx;
  const reach = cs * 0.35;
  const oX = nav.rockOffX, oY = nav.rockOffY;
  for (let k = 0; k < 5; k++) {
    const t = (k === 0 ? 0 : k === 1 ? -0.175 : k === 2 ? 0.175 : k === 3 ? -0.35 : 0.35) * cs;
    const cxp = mx + px * t, cyp = my + py * t;
    const sx = cxp - dx * reach, sy = cyp - dy * reach;
    const ex = cxp + dx * reach, ey = cyp + dy * reach;
    if (!isWalkable(ms, sx, sy, oX, oY, classR)) continue;
    if (!isWalkable(ms, cxp, cyp, oX, oY, classR)) continue;
    if (!isWalkable(ms, ex, ey, oX, oY, classR)) continue;
    if (_edgeRockClear(nav, ms, sx, sy, ex, ey, classR)) return true;
  }
  return false;
}

function _buildDistField(
  nav: NavigationState, ms: MapState, gc: number, tgx: number, tgy: number, dist: Uint16Array, classR: number = 0,
  sightBand: number = 0, srcLx: number = 0, srcLy: number = 0,
  nowMs: number = 0,
): boolean {
  const gcY = nav.gridCellsY;
  const tileGrid = ms.tileGrid;
  const rockGrid = ms.rockGrid;
  const totalCells = gc * gcY;
  const mask = nav.regionsBuilt && nav.navBlocked.length === totalCells ? nav.navBlocked : null;
  const _exG = nav.isExactView;
  const _owAux = !_exG && mask !== null && nav.oneWayN && nav.oneWay !== undefined && nav.oneWay.length === totalCells ? nav.oneWay : null;
  const clearGate = classR > 0 && nav.clearance.length === totalCells && nav.clearanceMax > 0
    ? nav.clearance : null;
  let gateMemo: Uint8Array | null = null;
  if (classR > 0 && nav.regionsBuilt) {
    const _gmIdx = Math.round((classR - 19) / 15) - 1;
    if (_gmIdx >= 0 && _gmIdx < nav.weaveGate.length) {
      gateMemo = nav.weaveGate[_gmIdx] ?? (nav.weaveGate[_gmIdx] = new Uint8Array(totalCells));
    }
  }
  let latticeBudget = 32;
  dist.fill(UNREACHABLE);
  for (let i = 0; i < totalCells; i++) _bfsVisited[i] = 0;

  const seedIdx = _openSeedIdx(tileGrid, rockGrid, mask, gc, gcY, tgx, tgy,
    _exG ? Math.max(3, Math.round(3 * ms.cellSize / nav.cellSize)) : 3);
  if (seedIdx < 0) return false;

  dist[seedIdx] = 0;
  _bfsVisited[seedIdx] = 1;
  _bfsQueue[0] = seedIdx;
  let qHead = 0;
  let qTail = 1;
  if (sightBand > 0) {
    const _ssCs = nav.cellSize;
    const _ssMh = nav.mapHalf;
    const _ssMhY = nav.mapHalfY;
    const _ssBandCells = Math.ceil(sightBand / _ssCs);
    const _ssOX = nav.rockOffX, _ssOY = nav.rockOffY;
    for (let sx = tgx - _ssBandCells; sx <= tgx + _ssBandCells; sx++) {
      for (let sy = tgy - _ssBandCells; sy <= tgy + _ssBandCells; sy++) {
        if (sx < 0 || sx >= gc || sy < 0 || sy >= gcY) continue;
        const sIdx = sx * gcY + sy;
        if (_bfsVisited[sIdx]) continue;
        if (mask ? mask[sIdx] !== 0 : (tileGrid[sIdx] === TileType.WALL || rockGrid[sIdx] >= 0)) continue;
        const _ssCx = -_ssMh + sx * _ssCs + _ssCs * 0.5;
        const _ssCy = -_ssMhY + sy * _ssCs + _ssCs * 0.5;
        const _ssDx = _ssCx - srcLx;
        const _ssDy = _ssCy - srcLy;
        if (_ssDx * _ssDx + _ssDy * _ssDy > sightBand * sightBand) continue;
        if (clearGate && clearGate[sIdx] < classR && !_cellWeaveOpen(nav, ms, sx, sy, classR)) continue;
        const _ssBulletR = 0.48 * (classR + 8);
        let _ssHit = false;
        const _ssProbes = _exG ? 9 : 1;
        for (let _ssP = 0; _ssP < _ssProbes && !_ssHit; _ssP++) {
          const _ssO = _ssCs * 0.3;
          const _ssH = _ssCs * 0.5;
          let _ssPx = _ssCx, _ssPy = _ssCy;
          if (_ssP >= 1 && _ssP <= 4) {
            _ssPx = _ssCx + (_ssP === 1 || _ssP === 3 ? -_ssO : _ssO);
            _ssPy = _ssCy + (_ssP <= 2 ? -_ssO : _ssO);
          } else if (_ssP >= 5) {
            if (_ssP === 5) _ssPy = _ssCy - _ssH;
            else if (_ssP === 6) _ssPy = _ssCy + _ssH;
            else if (_ssP === 7) _ssPx = _ssCx - _ssH;
            else _ssPx = _ssCx + _ssH;
          }
          if (_ssP > 0 && !isWalkable(ms, _ssPx, _ssPy, _ssOX, _ssOY, classR)) continue;
          if (!checkLineOfSight(ms, _ssPx, _ssPy, srcLx, srcLy, _ssOX, _ssOY)) continue;
          if (_ssBulletR > LOS_ROCK_BUFFER &&
              !_edgeRockClear(nav, ms, _ssPx, _ssPy, srcLx, srcLy, _ssBulletR)) continue;
          _ssHit = true;
        }
        if (!_ssHit) continue;
        dist[sIdx] = 0;
        _bfsVisited[sIdx] = 1;
        _bfsQueue[qTail++] = sIdx;
      }
    }
  }
  while (qHead < qTail) {
    const curFlat = _bfsQueue[qHead++];
    const curDist = dist[curFlat];
    const cx = (curFlat / gcY) | 0;
    const cy = curFlat - cx * gcY;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX4[d];
      const ny = cy + DY4[d];
      if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
      const nFlat = nx * gcY + ny;
      if (_bfsVisited[nFlat]) continue;
      const _owA = _owAux !== null ? _owBack(_owAux, curFlat, nFlat, d ^ 1) : 0;
      if (_owA < 0) continue;
      if (_owA === 0 && (mask ? mask[nFlat] !== 0 : (tileGrid[nFlat] === TileType.WALL || rockGrid[nFlat] >= 0))) continue;
      if (_owA === 0 && clearGate && clearGate[nFlat] < classR) {
        let _cwOk: boolean;
        if (gateMemo && (gateMemo[nFlat] & 1)) {
          _cwOk = (gateMemo[nFlat] & 2) !== 0;
        } else {
          _cwOk = _cellWeaveOpen(nav, ms, nx, ny, classR);
          let _cwSettled = true;
          if (!_cwOk) {
            if (latticeBudget > 0) {
              latticeBudget--;
              _cwOk = _cellLatticeOpen(nav, ms, nx, ny, classR);
            } else {
              _cwSettled = false;
            }
          }
          if (gateMemo && _cwSettled) gateMemo[nFlat] |= 1 | (_cwOk ? 2 : 0);
        }
        if (!_cwOk) continue;
      }
      const _ecIsX = nx !== cx;
      const _ecOwn = _ecIsX ? ((cx < nx ? cx : nx) * gcY + cy) : (cx * gcY + (cy < ny ? cy : ny));
      if (_owA === 0 && classR > 0 && !_exG) {
        const _ecK = _ecIsX ? 4 : 16;
        const _ecV = _ecIsX ? 8 : 32;
        let _ecOk: boolean;
        if (gateMemo && (gateMemo[_ecOwn] & _ecK)) {
          _ecOk = (gateMemo[_ecOwn] & _ecV) !== 0;
        } else {
          const _ecCs = nav.cellSize;
          const _ecMh = nav.mapHalf;
          const _ecMhY = nav.mapHalfY;
          const _ecAx = -_ecMh + cx * _ecCs + _ecCs * 0.5;
          const _ecAy = -_ecMhY + cy * _ecCs + _ecCs * 0.5;
          const _ecBx = -_ecMh + nx * _ecCs + _ecCs * 0.5;
          const _ecBy = -_ecMhY + ny * _ecCs + _ecCs * 0.5;
          _ecOk = _edgeRockClear(nav, ms, _ecAx, _ecAy, _ecBx, _ecBy, classR)
               || _edgeWeaveOpen(nav, ms, _ecAx, _ecAy, _ecBx, _ecBy, classR);
          let _ecSettled = true;
          if (!_ecOk) {
            if (latticeBudget > 0) {
              latticeBudget--;
              _ecOk = _edgeLatticeOpen(nav, ms, _ecAx, _ecAy, _ecBx, _ecBy, classR);
            } else {
              _ecSettled = false;
            }
          }
          if (gateMemo && _ecSettled) gateMemo[_ecOwn] |= _ecK | (_ecOk ? _ecV : 0);
        }
        if (!_ecOk) continue;
      }
      if (nowMs > 0 && nav.dynEdgeBlock.size > 0) {
        const _deCls = classR > 0 ? Math.round((classR - 19) / 15) : 0;
        const _deKey = _deCls * 2000000 + _ecOwn * 2 + (_ecIsX ? 0 : 1);
        const _deUntil = nav.dynEdgeBlock.get(_deKey);
        if (_deUntil !== undefined) {
          if (_deUntil > nowMs) continue;
          nav.dynEdgeBlock.delete(_deKey);
        }
      }
      _bfsVisited[nFlat] = 1;
      dist[nFlat] = curDist + 1;
      _bfsQueue[qTail++] = nFlat;
    }
    if (_exG && _exG.portalByCell.size > 0) {
      const _pl = _exG.portalByCell.get(curFlat);
      if (_pl) {
        for (let pi = 0; pi < _pl.length; pi++) {
          const _pd = _pl[pi];
          const _po = _exG.portalA[_pd] === curFlat ? _exG.portalB[_pd] : _exG.portalA[_pd];
          if (_bfsVisited[_po]) continue;
          if (mask && mask[_po] !== 0) continue;
          _bfsVisited[_po] = 1;
          const _pc = curDist + _exG.portalCost[_pd];
          dist[_po] = _pc > 65534 ? 65534 : _pc;
          _bfsQueue[qTail++] = _po;
        }
      }
    }
  }
  return true;
}

const _exactViews = new WeakMap<ExactNavGrid, NavigationState>();

export function exactFieldView(nav: NavigationState, bodyR: number): NavigationState | null {
  if (bodyR <= 0 || nav.isExactView) return null;
  const g = getExactGrid(nav, bodyR);
  if (!g) return null;
  let v = _exactViews.get(g);
  if (v) return v;
  const total = g.F * g.FY;
  ensureNavScratch(total);
  const blocked = new Uint8Array(total);
  for (let i = 0; i < total; i++) blocked[i] = g.open[i] ? 0 : 1;
  v = {
    flowDirX: new Float32Array(0),
    flowDirY: new Float32Array(0),
    flowDist: new Uint16Array(0),
    flowVersion: 0,
    lastTargetCellX: -1,
    lastTargetCellY: -1,
    flowMaskIsRockAware: false,
    rockOffX: nav.rockOffX,
    rockOffY: nav.rockOffY,
    gridCells: g.F,
    gridCellsY: g.FY,
    cellSize: g.fineCS,
    mapHalf: g.mapHalf,
    mapHalfY: g.mapHalfY,
    deadEndDepth: new Uint8Array(0),
    deadEndExitDirX: new Int8Array(0),
    deadEndExitDirY: new Int8Array(0),
    regionFlow: new Uint8Array(0),
    regionSeedIdx: new Int32Array(0),
    regionSeedX: new Float32Array(0),
    regionSeedY: new Float32Array(0),
    regionAxis: new Uint8Array(0),
    regionAxisStart: new Int32Array(0),
    regionAxisEnd: new Int32Array(0),
    regionAxisY: new Uint8Array(0),
    regionAxisStartY: new Int32Array(0),
    regionAxisEndY: new Int32Array(0),
    regionsBuilt: true,
    auxFields: [],
    clearance: new Float32Array(0),
    clearanceMax: 0,
    navBlocked: blocked,
    navComponent: g.comp,
    weaveGate: [null, null, null, null, null],
    dynEdgeBlock: new Map(),
    exactGrids: new Map(),
    exactDemand: [],
    isExactView: g,
  };
  _exactViews.set(g, v);
  return v;
}

export function ensureAuxDistField(
  nav: NavigationState,
  ms: MapState,
  ownerId: string,
  srcLocalX: number,
  srcLocalY: number,
  nowMs: number,
  bodyR: number = 0,
  sightBand: number = 0
): Uint16Array | null {
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const tgx = worldToGrid(srcLocalX, nav.mapHalf, nav.cellSize, gc);
  const tgy = worldToGrid(srcLocalY, nav.mapHalfY, nav.cellSize, gcY);
  if (tgx < 0 || tgy < 0) return null;
  const _rbK = nav.isExactView ? nav.isExactView.K : 1;
  const _rbX = (tgx / _rbK) | 0;
  const _rbY = (tgy / _rbK) | 0;

  const sizeClass = bodyR <= 34 ? 0 : bodyR <= 49 ? 1 : bodyR <= 64 ? 2
    : bodyR <= 79 ? 3 : bodyR <= 94 ? 4 : 5;
  const classR = sizeClass === 0 ? 0 : 19 + sizeClass * 15;

  const slots = nav.auxFields;
  const wantSight = sightBand > 0;
  let slot: AuxDistField | null = null;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].ownerId === ownerId && slots[i].sizeClass === sizeClass && slots[i].sightSeeded === wantSight) { slot = slots[i]; break; }
  }
  if (slot) {
    slot.lastUseMs = nowMs;
    if (slot.srcCellX === _rbX && slot.srcCellY === _rbY) return slot.dist;
    if (!_buildDistField(nav, ms, gc, tgx, tgy, slot.dist, classR, sightBand, srcLocalX, srcLocalY, nowMs)) {
      if (SMALL_FIX.NH062 !== 0) { slot.srcCellX = -1; slot.srcCellY = -1; }
      return null;
    }
    slot.srcCellX = _rbX;
    slot.srcCellY = _rbY;
    return slot.dist;
  }

  for (let i = 0; i < slots.length; i++) {
    if (slots[i].ownerId === '') { slot = slots[i]; break; }
  }
  if (!slot && slots.length < AUX_DIST_FIELDS_MAX) {
    slot = { ownerId: '', sizeClass: 0, sightSeeded: false, srcCellX: -1, srcCellY: -1, lastUseMs: 0, dist: new Uint16Array(gc * gcY) };
    slots.push(slot);
  }
  if (!slot) {
    let oldest: AuxDistField | null = null;
    for (let i = 0; i < slots.length; i++) {
      if (!oldest || slots[i].lastUseMs < oldest.lastUseMs) oldest = slots[i];
    }
    if (!oldest || oldest.lastUseMs >= nowMs) return null;
    slot = oldest;
  }
  if (!_buildDistField(nav, ms, gc, tgx, tgy, slot.dist, classR, sightBand, srcLocalX, srcLocalY, nowMs)) {
    slot.ownerId = '';
    return null;
  }
  slot.ownerId = ownerId;
  slot.sizeClass = sizeClass;
  slot.sightSeeded = wantSight;
  slot.srcCellX = _rbX;
  slot.srcCellY = _rbY;
  slot.lastUseMs = nowMs;
  return slot.dist;
}

export function peekAuxDistField(
  nav: NavigationState,
  ownerId: string,
  bodyR: number = 0,
  sightBand: number = 0
): Uint16Array | null {
  const sizeClass = bodyR <= 34 ? 0 : bodyR <= 49 ? 1 : bodyR <= 64 ? 2
    : bodyR <= 79 ? 3 : bodyR <= 94 ? 4 : 5;
  const wantSight = sightBand > 0;
  const slots = nav.auxFields;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].ownerId === ownerId && slots[i].sizeClass === sizeClass && slots[i].sightSeeded === wantSight) {
      return slots[i].dist;
    }
  }
  return null;
}

export function blockDynEdge(
  nav: NavigationState,
  lx: number, ly: number,
  dirX: number, dirY: number,
  bodyR: number, untilMs: number,
): boolean {
  const sizeClass = bodyR <= 34 ? 0 : bodyR <= 49 ? 1 : bodyR <= 64 ? 2
    : bodyR <= 79 ? 3 : bodyR <= 94 ? 4 : 5;
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const cs = nav.cellSize;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const gx = Math.floor((lx + mh) / cs);
  const gy = Math.floor((ly + mhY) / cs);
  if (gx < 0 || gx >= gc || gy < 0 || gy >= gcY) return false;
  const isX = Math.abs(dirX) >= Math.abs(dirY);
  let ox = gx, oy = gy;
  if (isX) { if (dirX < 0) ox = gx - 1; }
  else { if (dirY < 0) oy = gy - 1; }
  if (ox < 0 || oy < 0 || (isX && ox >= gc - 1) || (!isX && oy >= gcY - 1)) return false;
  const key = sizeClass * 2000000 + (ox * gcY + oy) * 2 + (isX ? 0 : 1);
  nav.dynEdgeBlock.set(key, untilMs);
  return true;
}

export function invalidateAuxFieldsFor(nav: NavigationState, ownerId: string): void {
  const slots = nav.auxFields;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].ownerId === ownerId) { slots[i].srcCellX = -1; slots[i].srcCellY = -1; }
  }
}

export const SELF_FIELD_MAX_CELLS = 24;

let _selfDist = new Uint16Array(MAX_CELLS);
export function buildSelfDistField(
  nav: NavigationState, ms: MapState, localX: number, localY: number,
): Uint16Array | null {
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const gx = worldToGrid(localX, nav.mapHalf, nav.cellSize, gc);
  const gy = worldToGrid(localY, nav.mapHalfY, nav.cellSize, gcY);
  if (gx < 0 || gy < 0) return null;
  const totalCells = gc * gcY;
  const mask = nav.regionsBuilt && nav.navBlocked.length === totalCells ? nav.navBlocked : null;
  const tileGrid = ms.tileGrid;
  const rockGrid = ms.rockGrid;
  _selfDist.fill(UNREACHABLE, 0, totalCells);

  const seedIdx = _openSeedIdx(tileGrid, rockGrid, mask, gc, gcY, gx, gy);
  if (seedIdx < 0) return null;
  _selfDist[seedIdx] = 0;
  _bfsQueue[0] = seedIdx;
  let qHead = 0;
  let qTail = 1;
  while (qHead < qTail) {
    const curFlat = _bfsQueue[qHead++];
    const curDist = _selfDist[curFlat];
    if (curDist >= SELF_FIELD_MAX_CELLS) continue;
    const cx = (curFlat / gcY) | 0;
    const cy = curFlat - cx * gcY;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX4[d];
      const ny = cy + DY4[d];
      if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
      const nFlat = nx * gcY + ny;
      if (_selfDist[nFlat] !== UNREACHABLE) continue;
      if (mask ? mask[nFlat] !== 0 : (tileGrid[nFlat] === TileType.WALL || rockGrid[nFlat] >= 0)) continue;
      _selfDist[nFlat] = curDist + 1;
      _bfsQueue[qTail++] = nFlat;
    }
  }
  return _selfDist;
}

export function distFieldCells(
  nav: NavigationState, dist: Uint16Array, localX: number, localY: number,
): number {
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const gx = worldToGrid(localX, nav.mapHalf, nav.cellSize, gc);
  const gy = worldToGrid(localY, nav.mapHalfY, nav.cellSize, gcY);
  if (gx < 0 || gy < 0) return UNREACHABLE;
  return dist[gx * gcY + gy];
}

function _labelComponents(nav: NavigationState, gc: number, blocked: Uint8Array): void {
  const gcY = nav.gridCellsY;
  const total = gc * gcY;
  const comp = nav.navComponent;
  if (comp.length !== total) return;
  comp.fill(0);
  let next = 1;
  for (let s = 0; s < total; s++) {
    if (blocked[s] !== 0 || comp[s] !== 0) continue;
    if (next >= 65535) return;
    const id = next++;
    let head = 0, tail = 0;
    _bfsQueue[tail++] = s;
    comp[s] = id;
    while (head < tail) {
      const cur = _bfsQueue[head++];
      const cx = (cur / gcY) | 0;
      const cy = cur - cx * gcY;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX4[d];
        const ny = cy + DY4[d];
        if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
        const ni = nx * gcY + ny;
        if (blocked[ni] !== 0 || comp[ni] !== 0) continue;
        comp[ni] = id;
        _bfsQueue[tail++] = ni;
      }
    }
  }
}

export function sameNavComponent(
  nav: NavigationState, ax: number, ay: number, bx: number, by: number,
  bodyR: number = 0,
): boolean {
  if (bodyR > 0) {
    const eg = getExactGrid(nav, bodyR);
    if (eg) {
      const ca = exactCompNear(eg, ax, ay);
      const cb = exactCompNear(eg, bx, by);
      if (ca !== 0 && cb !== 0) return ca === cb;
    }
  }
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const comp = nav.navComponent;
  if (!nav.regionsBuilt || comp.length !== gc * gcY) return true;
  const agx = worldToGrid(ax, nav.mapHalf, nav.cellSize, gc);
  const agy = worldToGrid(ay, nav.mapHalfY, nav.cellSize, gcY);
  const bgx = worldToGrid(bx, nav.mapHalf, nav.cellSize, gc);
  const bgy = worldToGrid(by, nav.mapHalfY, nav.cellSize, gcY);
  if (agx < 0 || agy < 0 || bgx < 0 || bgy < 0) return true;
  const a = comp[agx * gcY + agy];
  const b = comp[bgx * gcY + bgy];
  if (a === 0 || b === 0) return true;
  return a === b;
}

export function selfFieldCells(
  nav: NavigationState, ms: MapState, dist: Uint16Array, localX: number, localY: number,
): number {
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const gx = worldToGrid(localX, nav.mapHalf, nav.cellSize, gc);
  const gy = worldToGrid(localY, nav.mapHalfY, nav.cellSize, gcY);
  if (gx < 0 || gy < 0) return UNREACHABLE;
  const idx = gx * gcY + gy;
  const v = dist[idx];
  if (v !== UNREACHABLE) return v;
  const totalCells = gc * gcY;
  const blocked = nav.regionsBuilt && nav.navBlocked.length === totalCells
    ? nav.navBlocked[idx] !== 0
    : (ms.tileGrid[idx] === TileType.WALL || ms.rockGrid[idx] >= 0);
  return blocked ? UNREACHABLE : SELF_FIELD_MAX_CELLS;
}

function _corridorDanger(
  nav: NavigationState, gx: number, gy: number, dx: number, dy: number,
  px: Float64Array, py: Float64Array, w: Float64Array, n: number,
): number {
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const cs = nav.cellSize;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const totalCells = gc * gcY;
  const mask = nav.regionsBuilt && nav.navBlocked.length === totalCells ? nav.navBlocked : null;
  const infl = cs * AI_CONSTANTS.FLEE_LOOKAHEAD_INFL_CELLS;
  const inflSq = infl * infl;
  let sc = 0;
  for (let k = 1; k <= AI_CONSTANTS.FLEE_LOOKAHEAD_CELLS; k++) {
    const cx = gx + dx * k;
    const cy = gy + dy * k;
    if (cx < 0 || cx >= gc || cy < 0 || cy >= gcY) break;
    if (mask && mask[cx * gcY + cy] !== 0) break;
    const lx = -mh + cx * cs + cs * 0.5;
    const ly = -mhY + cy * cs + cs * 0.5;
    for (let i = 0; i < n; i++) {
      const ex = px[i] - lx;
      const ey = py[i] - ly;
      const dSq = ex * ex + ey * ey;
      if (dSq >= inflSq) continue;
      sc += w[i] * (1 - Math.sqrt(dSq) / infl);
    }
  }
  return sc;
}

export function queryDistanceStep(
  nav: NavigationState,
  dist: Uint16Array,
  localX: number,
  localY: number,
  ascend: boolean,
  bodyRadius: number = 0,
  dangerDirX: Float64Array | null = null,
  dangerDirY: Float64Array | null = null,
  dangerW: Float64Array | null = null,
  dangerN: number = 0,
  dangerPX: Float64Array | null = null,
  dangerPY: Float64Array | null = null,
  deAvoid: number = 0
): typeof _distStepResult {
  _distStepResult.dirX = 0;
  _distStepResult.dirY = 0;
  _distStepResult.ok = false;
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const gx = worldToGrid(localX, nav.mapHalf, nav.cellSize, gc);
  const gy = worldToGrid(localY, nav.mapHalfY, nav.cellSize, gcY);
  if (gx < 0 || gy < 0) return _distStepResult;
  const d0 = dist[gx * gcY + gy];
  if (d0 === UNREACHABLE) return _distStepResult;
  const deDepth = (deAvoid > 0 && nav.deadEndDepth.length === gc * gcY)
    ? nav.deadEndDepth : null;
  const gate0 = bodyRadius > 0 && nav.clearance.length === gc * gcY && nav.clearanceMax > 0;
  for (let pass = gate0 ? 0 : 1; pass < 2; pass++) {
    const gated = pass === 0;
    let best = d0;
    let bestDx = 0, bestDy = 0;
    let bestDanger = Infinity;
    let bestNd = ascend ? -1 : Infinity;
    let found = false;
    for (let d = 0; d < 4; d++) {
      const nx = gx + DX4[d];
      const ny = gy + DY4[d];
      if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
      const nIdx = nx * gcY + ny;
      const nd = dist[nIdx];
      if (nd === UNREACHABLE) continue;
      if (gated) {
        const cl = nav.clearance[nIdx];
        if (cl < bodyRadius && cl < nav.clearanceMax) continue;
      }
      if (dangerN > 0 || deDepth) {
        if (!(ascend ? nd > d0 : nd < d0)) continue;
        let sc = 0;
        if (deDepth) {
          const dd = deDepth[nIdx];
          sc += (dd < AI_CONSTANTS.FLEE_DEADEND_AVOID_CAP
            ? dd : AI_CONSTANTS.FLEE_DEADEND_AVOID_CAP) * deAvoid;
        }
        for (let i = 0; i < dangerN; i++) {
          const dot = DX4[d] * dangerDirX![i] + DY4[d] * dangerDirY![i];
          if (dot > 0) sc += dot * dangerW![i];
        }
        if (dangerPX && dangerPY) {
          sc += AI_CONSTANTS.FLEE_LOOKAHEAD_WEIGHT *
            _corridorDanger(nav, gx, gy, DX4[d], DY4[d], dangerPX, dangerPY, dangerW!, dangerN);
        }
        if (!found || sc < bestDanger - 1e-9 || (sc < bestDanger + 1e-9 && (ascend ? nd > bestNd : nd < bestNd))) {
          bestDanger = sc;
          bestNd = nd;
          bestDx = DX4[d];
          bestDy = DY4[d];
          found = true;
        }
      } else if (ascend ? nd > best : nd < best) {
        best = nd;
        bestDx = DX4[d];
        bestDy = DY4[d];
        found = true;
      }
    }
    if (found) {
      _distStepResult.dirX = bestDx;
      _distStepResult.dirY = bestDy;
      _distStepResult.ok = true;
      return _distStepResult;
    }
  }
  return _distStepResult;
}

export function queryDistanceStepSmooth(
  nav: NavigationState,
  dist: Uint16Array,
  localX: number,
  localY: number,
  bodyRadius: number = 0
): typeof _distStepSmoothResult {
  _distStepSmoothResult.dirX = 0;
  _distStepSmoothResult.dirY = 0;
  _distStepSmoothResult.ok = false;
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const cs = nav.cellSize;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const fx = (localX + mh) / cs - 0.5;
  const fy = (localY + mhY) / cs - 0.5;
  const gx0 = Math.floor(fx);
  const gy0 = Math.floor(fy);
  const tx = fx - gx0;
  const ty = fy - gy0;
  const gated = bodyRadius > 0 && nav.clearance.length === gc * gcY && nav.clearanceMax > 0;

  let sdx = 0, sdy = 0, sw = 0;
  for (let c = 0; c < 4; c++) {
    const cgx = gx0 + (c & 1);
    const cgy = gy0 + (c >> 1);
    if (cgx < 0 || cgx >= gc || cgy < 0 || cgy >= gcY) continue;
    const d0 = dist[cgx * gcY + cgy];
    if (d0 === UNREACHABLE) continue;
    let best = d0;
    let bdx = 0, bdy = 0;
    for (let d = 0; d < 4; d++) {
      const nx = cgx + DX4[d];
      const ny = cgy + DY4[d];
      if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
      const nIdx = nx * gcY + ny;
      const nd = dist[nIdx];
      if (nd === UNREACHABLE || nd >= best) continue;
      if (gated) {
        const cl = nav.clearance[nIdx];
        if (cl < bodyRadius && cl < nav.clearanceMax) continue;
      }
      best = nd;
      bdx = DX4[d];
      bdy = DY4[d];
    }
    if (best === d0) continue;
    const wx = (c & 1) === 0 ? (1 - tx) : tx;
    const wy = (c >> 1) === 0 ? (1 - ty) : ty;
    const w = wx * wy;
    sdx += bdx * w;
    sdy += bdy * w;
    sw += w;
  }
  if (sw > 0.001) {
    sdx /= sw;
    sdy /= sw;
    const m = Math.sqrt(sdx * sdx + sdy * sdy);
    if (m > 0.001) {
      _distStepSmoothResult.dirX = sdx / m;
      _distStepSmoothResult.dirY = sdy / m;
      _distStepSmoothResult.ok = true;
    }
  }
  return _distStepSmoothResult;
}

export function isPathClear(
  ms: MapState,
  x0: number, y0: number,
  x1: number, y1: number,
  rockOffX: number = 0,
  rockOffY: number = 0,
  bodyRadius: number = 0
): boolean {
  const cs = ms.cellSize;
  const gc = ms.gridCells;
  const gcY = ms.gridCellsY;
  const mh = ms.mapHalf;
  const mhY = ms.mapHalfY;
  const gx = Math.floor((x1 + mh) / cs);
  const gy = Math.floor((y1 + mhY) / cs);
  if (gx < 0 || gx >= gc || gy < 0 || gy >= gcY) {
    if (AI_CONSTANTS.BORDER_SQUEEZE === 0) return false;
    if (!_bandStandable(mh, x1, y1, bodyRadius, mhY)) return false;
  } else if (ms.wallGrid[gx * gcY + gy] >= 0 && _cellWallBlocks(ms, gx * gcY + gy, x1 + rockOffX, y1 + rockOffY)) return false;

  if (bodyRadius > 0 && _discHitsWall(ms, x1, y1, rockOffX, rockOffY, bodyRadius)) {
    return false;
  }
  if ((ms.extraWalls !== undefined || ms.outWalls !== undefined) && _extraWallSeg(ms, x0, y0, x1, y1, bodyRadius)) return false;

  const rocks = ms.rocks;
  if (rocks.length > 0) {
    const wx0 = x0 + rockOffX;
    const wy0 = y0 + rockOffY;
    const wx1 = x1 + rockOffX;
    const wy1 = y1 + rockOffY;
    const sdx = wx1 - wx0;
    const sdy = wy1 - wy0;
    const segLen2 = sdx * sdx + sdy * sdy;
    if (segLen2 > 0.001) {
      const invSegLen2 = 1 / segLen2;
      const nCand = queryRocksNearSegment(ms, wx0, wy0, wx1, wy1, bodyRadius);
      const cand = rockQueryBuf();
      const lim = nCand >= 0 ? nCand : rocks.length;
      for (let k = 0; k < lim; k++) {
        const r = rocks[nCand >= 0 ? cand[k] : k];
        if (!r.active) continue;
        const fx = r.x - wx0;
        const fy = r.y - wy0;
        let t = (fx * sdx + fy * sdy) * invSegLen2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const px = wx0 + t * sdx - r.x;
        const py = wy0 + t * sdy - r.y;
        const eff = r.size + bodyRadius;
        if (px * px + py * py < eff * eff) return false;
      }
    } else {
      const nCand = queryRocksNearPoint(ms, wx1, wy1, bodyRadius);
      const cand = rockQueryBuf();
      const lim = nCand >= 0 ? nCand : rocks.length;
      for (let k = 0; k < lim; k++) {
        const r = rocks[nCand >= 0 ? cand[k] : k];
        if (!r.active) continue;
        const dx = wx1 - r.x;
        const dy = wy1 - r.y;
        const eff = r.size + bodyRadius;
        if (dx * dx + dy * dy < eff * eff) return false;
      }
    }
  }
  return true;
}

export function checkShotWallsClear(
  ms: MapState,
  x0: number, y0: number,
  x1: number, y1: number,
  offX: number, offY: number,
  shotRadius: number
): boolean {
  if (ms.walls.length === 0) return true;
  const r = shotRadius > 1 ? shotRadius : 1;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return !_discHitsWall(ms, x0, y0, offX, offY, r);
  const step = ms.cellSize * 0.4;
  const ux = dx / len, uy = dy / len;
  if ((ms.extraWalls !== undefined || ms.outWalls !== undefined) && _extraWallSeg(ms, x0, y0, x1, y1, r)) return false;
  for (let s = 0; s < len; s += step) {
    if (_discHitsWall(ms, x0 + ux * s, y0 + uy * s, offX, offY, r)) return false;
  }
  return !_discHitsWall(ms, x1, y1, offX, offY, r);
}

function _bandStandable(mh: number, x: number, y: number, bodyRadius: number, mhY: number = mh): boolean {
  const b = mh - bodyRadius;
  const px = (x < 0 ? -x : x) - b;
  const py = (y < 0 ? -y : y) - (mhY - bodyRadius);
  if (px > 0 && py > 0) return false;
  return (px > py ? px : py) <= AI_CONSTANTS.BORDER_BAND_PEN;
}

function _discHitsWall(
  ms: MapState,
  localX: number, localY: number,
  offX: number, offY: number,
  bodyRadius: number
): boolean {
  const walls = ms.walls;
  if (walls.length === 0) return false;
  const cs = ms.cellSize;
  const gc = ms.gridCells;
  const gcY = ms.gridCellsY;
  const mh = ms.mapHalf;
  const mhY = ms.mapHalfY;
  const wg = ms.wallGrid;
  const minCX = Math.max(0, Math.floor((localX - bodyRadius + mh) / cs) - 1);
  const maxCX = Math.min(gc - 1, Math.floor((localX + bodyRadius + mh) / cs) + 1);
  const minCY = Math.max(0, Math.floor((localY - bodyRadius + mhY) / cs) - 1);
  const maxCY = Math.min((SMALL_FIX.CH033 ? gcY : gc) - 1, Math.floor((localY + bodyRadius + mhY) / cs) + 1);
  const wx = localX + offX;
  const wy = localY + offY;
  const r2 = bodyRadius * bodyRadius;
  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cy = minCY; cy <= maxCY; cy++) {
      const wIdx = wg[cx * gcY + cy];
      if (wIdx < 0) continue;
      const w = walls[wIdx];
      if (!w.active) continue;
      if (w.kind !== undefined && wallSkips(w, wx, wy)) continue;
      const _pd = w.kind !== undefined ? wallSteerPad(w) : 0;
      if (_pd > 0) {
        const qx = Math.max(0, Math.abs(wx - w.x) - w.halfW), qy = Math.max(0, Math.abs(wy - w.y) - w.halfH), rr = bodyRadius + _pd;
        if (qx * qx + qy * qy < rr * rr) return true;
        continue;
      }
      const left = w.x - w.halfW;
      const right = w.x + w.halfW;
      const top = w.y - w.halfH;
      const bottom = w.y + w.halfH;
      const clX = wx < left ? left : (wx > right ? right : wx);
      const clY = wy < top ? top : (wy > bottom ? bottom : wy);
      const dx = wx - clX;
      const dy = wy - clY;
      if (dx * dx + dy * dy < r2) return true;
    }
  }
  if ((ms.extraWalls !== undefined || ms.outWalls !== undefined) && _extraWallHit(ms, localX, localY, bodyRadius)) return true;
  return false;
}

export function discInWall(ms: MapState, localX: number, localY: number, offX: number, offY: number, bodyRadius: number): boolean {
  return bodyRadius > 0 && _discHitsWall(ms, localX, localY, offX, offY, bodyRadius);
}

export function bodyFitsAt(
  ms: MapState,
  localX: number,
  localY: number,
  offX: number,
  offY: number,
  bodyRadius: number
): boolean {
  if (bodyRadius > 0 && _discHitsWall(ms, localX, localY, offX, offY, bodyRadius)) return false;
  const wx = localX + offX;
  const wy = localY + offY;
  const rocks = ms.rocks;
  const nCand = queryRocksNearPoint(ms, wx, wy, bodyRadius);
  if (nCand >= 0) {
    const cand = rockQueryBuf();
    for (let k = 0; k < nCand; k++) {
      const r = rocks[cand[k]];
      if (!r.active) continue;
      const dx = wx - r.x;
      const dy = wy - r.y;
      const eff = r.size + bodyRadius;
      if (dx * dx + dy * dy < eff * eff) return false;
    }
    return true;
  }
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    if (!r.active) continue;
    const dx = wx - r.x;
    const dy = wy - r.y;
    const eff = r.size + bodyRadius;
    if (dx * dx + dy * dy < eff * eff) return false;
  }
  return true;
}

const _bodyFitResult = { ok: false, x: 0, y: 0 };

export function findNearestBodyFit(
  ms: MapState,
  localX: number,
  localY: number,
  offX: number,
  offY: number,
  bodyRadius: number
): typeof _bodyFitResult {
  _bodyFitResult.ok = false;
  _bodyFitResult.x = localX;
  _bodyFitResult.y = localY;
  const cs = ms.cellSize;
  const gc = ms.gridCells;
  const gcY = ms.gridCellsY;
  const mh = ms.mapHalf;
  const mhY = ms.mapHalfY;
  const cgx = Math.floor((localX + mh) / cs);
  const cgy = Math.floor((localY + mhY) / cs);
  const MAX_RING = 8;
  for (let ring = 0; ring <= MAX_RING; ring++) {
    let bestD = Infinity;
    let bestX = 0, bestY = 0;
    for (let gx = cgx - ring; gx <= cgx + ring; gx++) {
      if (gx < 0 || gx >= gc) continue;
      for (let gy = cgy - ring; gy <= cgy + ring; gy++) {
        if (gy < 0 || gy >= gcY) continue;
        if (ring > 0 && gx !== cgx - ring && gx !== cgx + ring && gy !== cgy - ring && gy !== cgy + ring) continue;
        const cx = -mh + gx * cs + cs * 0.5;
        const cy = -mhY + gy * cs + cs * 0.5;
        if (!bodyFitsAt(ms, cx, cy, offX, offY, bodyRadius)) continue;
        const ddx = cx - localX;
        const ddy = cy - localY;
        const d = ddx * ddx + ddy * ddy;
        if (d < bestD) { bestD = d; bestX = cx; bestY = cy; }
      }
    }
    if (bestD < Infinity) {
      _bodyFitResult.ok = true;
      _bodyFitResult.x = bestX;
      _bodyFitResult.y = bestY;
      return _bodyFitResult;
    }
  }
  return _bodyFitResult;
}

export function isWalkable(
  ms: MapState,
  worldX: number,
  worldY: number,
  rockOffX: number = 0,
  rockOffY: number = 0,
  bodyRadius: number = 0
): boolean {
  const cs = ms.cellSize;
  const gc = ms.gridCells;
  const gcY = ms.gridCellsY;
  const mh = ms.mapHalf;
  const mhY = ms.mapHalfY;
  const gx = Math.floor((worldX + mh) / cs);
  const gy = Math.floor((worldY + mhY) / cs);
  if (gx < 0 || gx >= gc || gy < 0 || gy >= gcY) {
    if (AI_CONSTANTS.BORDER_SQUEEZE === 0) return false;
    if (!_bandStandable(mh, worldX, worldY, bodyRadius, mhY)) return false;
  } else if (ms.wallGrid[gx * gcY + gy] >= 0 && _cellWallBlocks(ms, gx * gcY + gy, worldX + rockOffX, worldY + rockOffY)) return false;
  if (!(bodyRadius > 0) && (ms.extraWalls !== undefined || ms.outWalls !== undefined) && _extraWallHit(ms, worldX, worldY, 0)) return false;

  if (bodyRadius > 0 && _discHitsWall(ms, worldX, worldY, rockOffX, rockOffY, bodyRadius)) {
    return false;
  }

  const wx = worldX + rockOffX;
  const wy = worldY + rockOffY;
  const rocks = ms.rocks;
  const nCand = queryRocksNearPoint(ms, wx, wy, bodyRadius);
  if (nCand >= 0) {
    const cand = rockQueryBuf();
    for (let k = 0; k < nCand; k++) {
      const r = rocks[cand[k]];
      if (!r.active) continue;
      const dx = wx - r.x;
      const dy = wy - r.y;
      const eff = r.size + bodyRadius;
      if (dx * dx + dy * dy < eff * eff) return false;
    }
    return true;
  }
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    if (!r.active) continue;
    const dx = wx - r.x;
    const dy = wy - r.y;
    const eff = r.size + bodyRadius;
    if (dx * dx + dy * dy < eff * eff) return false;
  }
  return true;
}

const _LOS_OUT_LEFT = 1;
const _LOS_OUT_RIGHT = 2;
const _LOS_OUT_BOTTOM = 4;
const _LOS_OUT_TOP = 8;

export function checkLineOfSight(
  mapState: MapState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rockOffX: number = 0,
  rockOffY: number = 0
): boolean {
  if (x0 !== x0 || y0 !== y0 || x1 !== x1 || y1 !== y1) return false;

  const rocks = mapState.rocks;
  if (rocks.length > 0) {
    const wx0 = x0 + rockOffX;
    const wy0 = y0 + rockOffY;
    const wx1 = x1 + rockOffX;
    const wy1 = y1 + rockOffY;
    const sdx = wx1 - wx0;
    const sdy = wy1 - wy0;
    const segLen2 = sdx * sdx + sdy * sdy;
    if (segLen2 > 0.001) {
      const invSegLen2 = 1 / segLen2;
      const nCand = queryRocksNearSegment(mapState, wx0, wy0, wx1, wy1, LOS_ROCK_BUFFER);
      const cand = rockQueryBuf();
      const lim = nCand >= 0 ? nCand : rocks.length;
      for (let k = 0; k < lim; k++) {
        const r = rocks[nCand >= 0 ? cand[k] : k];
        if (!r.active) continue;
        const fx = r.x - wx0;
        const fy = r.y - wy0;
        let t = (fx * sdx + fy * sdy) * invSegLen2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const px = wx0 + t * sdx - r.x;
        const py = wy0 + t * sdy - r.y;
        const effR = r.size + LOS_ROCK_BUFFER;
        if (px * px + py * py < effR * effR) return false;
      }
    }
  }

  return checkWallLineOfSight(mapState, x0, y0, x1, y1);
}

export function checkWallLineOfSight(
  mapState: MapState,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  const gc = mapState.gridCells;
  const gcY = mapState.gridCellsY;
  const cs = mapState.cellSize;
  const mh = mapState.mapHalf;
  const mhY = mapState.mapHalfY;
  const wallGrid = mapState.wallGrid;

  if (x0 !== x0 || y0 !== y0 || x1 !== x1 || y1 !== y1) return false;
  if ((mapState.extraWalls !== undefined || mapState.outWalls !== undefined) && _extraWallSeg(mapState, x0, y0, x1, y1, 0)) return false;

  let cx0 = x0, cy0 = y0, cx1 = x1, cy1 = y1;

  let code0 = 0;
  if (cx0 < -mh) code0 |= _LOS_OUT_LEFT; else if (cx0 > mh) code0 |= _LOS_OUT_RIGHT;
  if (cy0 < -mhY) code0 |= _LOS_OUT_BOTTOM; else if (cy0 > mhY) code0 |= _LOS_OUT_TOP;
  let code1 = 0;
  if (cx1 < -mh) code1 |= _LOS_OUT_LEFT; else if (cx1 > mh) code1 |= _LOS_OUT_RIGHT;
  if (cy1 < -mhY) code1 |= _LOS_OUT_BOTTOM; else if (cy1 > mhY) code1 |= _LOS_OUT_TOP;

  if ((code0 & code1) !== 0) return true;

  if ((code0 | code1) !== 0) {
    for (let iter = 0; iter < 4 && (code0 | code1) !== 0; iter++) {
      const outCode = code0 !== 0 ? code0 : code1;
      let nx: number, ny: number;
      if (outCode & _LOS_OUT_TOP) {
        nx = cx0 + (cx1 - cx0) * (mhY - cy0) / (cy1 - cy0);
        ny = mhY;
      } else if (outCode & _LOS_OUT_BOTTOM) {
        nx = cx0 + (cx1 - cx0) * (-mhY - cy0) / (cy1 - cy0);
        ny = -mhY;
      } else if (outCode & _LOS_OUT_RIGHT) {
        ny = cy0 + (cy1 - cy0) * (mh - cx0) / (cx1 - cx0);
        nx = mh;
      } else {
        ny = cy0 + (cy1 - cy0) * (-mh - cx0) / (cx1 - cx0);
        nx = -mh;
      }

      if (outCode === code0) {
        cx0 = nx; cy0 = ny;
        code0 = 0;
        if (cx0 < -mh) code0 |= _LOS_OUT_LEFT; else if (cx0 > mh) code0 |= _LOS_OUT_RIGHT;
        if (cy0 < -mhY) code0 |= _LOS_OUT_BOTTOM; else if (cy0 > mhY) code0 |= _LOS_OUT_TOP;
      } else {
        cx1 = nx; cy1 = ny;
        code1 = 0;
        if (cx1 < -mh) code1 |= _LOS_OUT_LEFT; else if (cx1 > mh) code1 |= _LOS_OUT_RIGHT;
        if (cy1 < -mhY) code1 |= _LOS_OUT_BOTTOM; else if (cy1 > mhY) code1 |= _LOS_OUT_TOP;
      }

      if ((code0 & code1) !== 0) return true;
    }
  }

  let gx0 = Math.floor((cx0 + mh) / cs);
  let gy0 = Math.floor((cy0 + mhY) / cs);
  let gx1 = Math.floor((cx1 + mh) / cs);
  let gy1 = Math.floor((cy1 + mhY) / cs);
  if (gx0 < 0) gx0 = 0; else if (gx0 >= gc) gx0 = gc - 1;
  if (gy0 < 0) gy0 = 0; else if (gy0 >= gcY) gy0 = gcY - 1;
  if (gx1 < 0) gx1 = 0; else if (gx1 >= gc) gx1 = gc - 1;
  if (gy1 < 0) gy1 = 0; else if (gy1 >= gcY) gy1 = gcY - 1;

  let dx = Math.abs(gx1 - gx0);
  let dy = Math.abs(gy1 - gy0);
  const sx = gx0 < gx1 ? 1 : -1;
  const sy = gy0 < gy1 ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    if (wallGrid[gx0 * gcY + gy0] >= 0) return false;
    if (gx0 === gx1 && gy0 === gy1) break;

    const e2 = 2 * err;
    const stepX = e2 > -dy;
    const stepY = e2 < dx;

    if (stepX && stepY) {
      const adjA = (gx0 + sx) * gcY + gy0;
      const adjB = gx0 * gcY + (gy0 + sy);
      if (adjA >= 0 && adjA < gc * gcY && wallGrid[adjA] >= 0) return false;
      if (adjB >= 0 && adjB < gc * gcY && wallGrid[adjB] >= 0) return false;
    }

    if (stepX) {
      err -= dy;
      gx0 += sx;
    }
    if (stepY) {
      err += dx;
      gy0 += sy;
    }

    if (gx0 < 0 || gx0 >= gc || gy0 < 0 || gy0 >= gcY) return false;
  }

  return true;
}

export const NAV_UNREACHABLE = UNREACHABLE;
