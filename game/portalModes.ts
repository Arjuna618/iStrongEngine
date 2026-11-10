import { createDefaultMapConfig, DEFAULT_SHAPE_SPAWN_CONFIG, MAZE_TYPE_CUSTOM, generateRandomSeed, TEAM_NAMES } from '@/types';
import { BASE_AREAS, teamBaseRow } from './baseAreas';
import type { AreaConfig, MapConfig, MultiAreaMapConfig, PlacedRock, PlacedWall, PlacedZone, PlacedPortal, PortalKindConfig, CustomMapData } from '@/types';
import { CM, CM_FREE, CM_USE, cmHex } from '@/utils/colorMap';
import { BASE_ARRANGE } from './BaseProtector';
import { SMALL_FIX } from './smallFixSwitch';
import { ALL_MODES } from './allModesSwitch';
import { ARRAS_ROCK_MIX, ARRAS_ROCK_SIZES, ARRAS_ROCK_VARIATION, ARRAS_ROCK_DEAL } from './constants';
import { dealRockKinds } from './rockDeal';

export type PortalModeId = 'portal-2tdm' | 'portal-4tdm' | 'portal-maze-4tdm';

export function portalModeTeams(m: PortalModeId): number { return m === 'portal-2tdm' ? 2 : 4; }

export interface RockTilesSettings {
  layout: 'checker' | 'full';
  tile: number;
  perTile: number;
  sizeMin: number; sizeMax: number;
  clearMiddle: boolean;
  clearCorners: boolean;
  mix?: boolean;
  clearRound?: boolean;
}
const _MIX: { mix?: boolean } = SMALL_FIX.R853 !== 0 && ALL_MODES.ON !== 0 ? { mix: true } : {};
export const ROCK_TILES_2TDM: RockTilesSettings = { layout: 'checker', tile: 390, perTile: 2.5, sizeMin: 51, sizeMax: 69, clearMiddle: true, clearCorners: false, ..._MIX };
export const ROCK_TILES_4TDM: RockTilesSettings = { layout: 'full', tile: ALL_MODES.ON !== 0 ? 360 : 390, perTile: 1.8, sizeMin: 51, sizeMax: 69, clearMiddle: true, clearCorners: true, ..._MIX,
  ...(SMALL_FIX.R855 !== 0 && ALL_MODES.ON !== 0 ? { clearRound: true } : {}) };
export const ROCK_TILES_LIMITS = { tileMin: 150, tileMax: 1500, perTileMin: 0.1, perTileMax: 5, sizeMin: 20, sizeMax: 150 } as const;

export function rockTilesOf(p?: Partial<RockTilesSettings> | null): RockTilesSettings {
  const d = ROCK_TILES_2TDM, L = ROCK_TILES_LIMITS;
  const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);
  const sizeMin = num(p?.sizeMin, d.sizeMin, L.sizeMin, L.sizeMax), sizeMax = num(p?.sizeMax, d.sizeMax, L.sizeMin, L.sizeMax);
  const s: RockTilesSettings = {
    layout: p?.layout === 'full' ? 'full' : p?.layout === 'checker' ? 'checker' : d.layout,
    tile: Math.round(num(p?.tile, d.tile, L.tileMin, L.tileMax)),
    perTile: Math.round(num(p?.perTile, d.perTile, L.perTileMin, L.perTileMax) * 10) / 10,
    sizeMin: Math.min(sizeMin, sizeMax), sizeMax: Math.max(sizeMin, sizeMax),
    clearMiddle: typeof p?.clearMiddle === 'boolean' ? p.clearMiddle : d.clearMiddle,
    clearCorners: typeof p?.clearCorners === 'boolean' ? p.clearCorners : d.clearCorners,
  };
  if (p?.mix === true) s.mix = true;
  if (p?.clearRound === true) s.clearRound = true;
  return s;
}

export function isRockTile(s: RockTilesSettings, cols: number, rows: number, c: number, r: number): boolean {
  const cc = Math.floor(cols / 2), rc = Math.floor(rows / 2);
  if (s.layout === 'checker' && ((c + r) & 1) !== ((cc + rc) & 1)) return false;
  const round = s.clearRound === true && SMALL_FIX.R855 !== 0;
  if (s.clearMiddle) {
    if (s.layout === 'checker') {
      if (c === cc || r === rc) return false;
      if (Math.abs(c - cc) === 1 && Math.abs(r - rc) === 1) return false;
    } else if (round) {
      if ((c - cc) * (c - cc) + (r - rc) * (r - rc) <= 4) return false;
    } else if (Math.abs(c - cc) + Math.abs(r - rc) <= 1) return false;
  }
  if (s.clearCorners) {
    const a = Math.min(c, cols - 1 - c), b = Math.min(r, rows - 1 - r);
    if (round ? a * a + b * b <= 5 : a + b <= 3) return false;
  }
  return true;
}

export function seededRand(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ROCK_TILES_MAX_ROCKS = 2000;
const ROCK_TILES_SCAN_MAX = 80000;

export function placeRockTiles(s: RockTilesSettings, cols: number, rows: number, rand: () => number, firstId: number,
    kinds?: readonly PlacedRock['kind'][]): PlacedRock[] {
  const out: PlacedRock[] = [];
  if (cols < 1 || rows < 1) return out;
  const base = Math.floor(s.perTile), frac = s.perTile - base;
  const mixOn = s.mix === true && SMALL_FIX.R853 !== 0;
  const has = (k: PlacedRock['kind']) => mixOn && (!kinds || kinds.includes(k));
  const wG = has('gravel') ? ARRAS_ROCK_MIX.gravel : 0, wS = has('stone') ? ARRAS_ROCK_MIX.stone : 0, wR = has('rock') ? ARRAS_ROCK_MIX.rock : 0;
  const wAll = wG + wS + wR, vary = ARRAS_ROCK_VARIATION / 100;
  const largest = wAll > 0 ? (wR > 0 ? ARRAS_ROCK_SIZES.rock : wS > 0 ? ARRAS_ROCK_SIZES.stone : ARRAS_ROCK_SIZES.gravel) * (1 + vary / 2) : s.sizeMax;
  const buckets = new Map<number, PlacedRock[]>();
  const reach = Math.floor((2 * largest + 10) / s.tile) + 1;
  const bucketOf = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(v)));
  const touches = (cx: number, cy: number, size: number): boolean => {
    const bc = bucketOf(cx, cols), br = bucketOf(cy, rows);
    for (let c = Math.max(0, bc - reach); c <= Math.min(cols - 1, bc + reach); c++) {
      for (let r = Math.max(0, br - reach); r <= Math.min(rows - 1, br + reach); r++) {
        const b = buckets.get(c * rows + r);
        if (!b) continue;
        for (const o of b) {
          const d = Math.hypot((o.cx - cx) * s.tile, (o.cy - cy) * s.tile);
          if (d < o.size + size + 10) return true;
        }
      }
    }
    return false;
  };
  const placeOne = (c: number, r: number, dealt?: PlacedRock['kind']): void => {
    let size: number, kind: PlacedRock['kind'] = 'rock';
    if (dealt !== undefined) {
      kind = dealt;
      size = ARRAS_ROCK_SIZES[kind] * (1 - vary / 2 + rand() * vary);
    } else if (wAll > 0) {
      const roll = rand() * wAll;
      kind = roll < wG ? 'gravel' : roll < wG + wS ? 'stone' : 'rock';
      size = ARRAS_ROCK_SIZES[kind] * (1 - vary / 2 + rand() * vary);
    } else size = s.sizeMin + Math.floor(rand() * (s.sizeMax - s.sizeMin + 1));
    const m = size / s.tile;
    if (2 * m > cols || 2 * m > rows) return;
    let cx = 0, cy = 0, clear = false;
    for (let tries = 200; tries >= 0 && !clear; tries--) {
      cx = Math.max(m, Math.min(cols - m, c + rand()));
      cy = Math.max(m, Math.min(rows - m, r + rand()));
      clear = !touches(cx, cy, size);
    }
    if (!clear) return;
    const p: PlacedRock = { id: firstId + out.length, cx, cy, size, rotation: rand() * Math.PI * 2, kind };
    out.push(p);
    const k = bucketOf(cx, cols) * rows + bucketOf(cy, rows);
    const b = buckets.get(k);
    if (b) b.push(p); else buckets.set(k, [p]);
  };

  const dealOn = SMALL_FIX.R868 !== 0 && wAll > 0;
  if (cols * rows > ROCK_TILES_SCAN_MAX) {
    const deal = dealOn ? dealRockKinds(ROCK_TILES_MAX_ROCKS, ARRAS_ROCK_DEAL, has, rand) : null;
    for (let draws = ROCK_TILES_MAX_ROCKS * 50; draws > 0 && out.length < ROCK_TILES_MAX_ROCKS; draws--) {
      const c = Math.floor(rand() * cols), r = Math.floor(rand() * rows);
      if (isRockTile(s, cols, rows, c, r)) placeOne(c, r, deal ? deal[out.length] : undefined);
    }
    return out;
  }
  let rockTiles = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (isRockTile(s, cols, rows, c, r)) rockTiles++;
  const asked = rockTiles * s.perTile;
  const keep = asked <= ROCK_TILES_MAX_ROCKS ? 1 : (ROCK_TILES_MAX_ROCKS - 2 * Math.sqrt(ROCK_TILES_MAX_ROCKS)) / asked;
  if (dealOn) {
    const plan: number[] = [];
    walk: for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!isRockTile(s, cols, rows, c, r)) continue;
      const n = base + (rand() < frac ? 1 : 0);
      for (let k = 0; k < n; k++) {
        if (keep < 1 && rand() >= keep) continue;
        if (plan.length >= ROCK_TILES_MAX_ROCKS) break walk;
        plan.push(c * rows + r);
      }
    }
    const deal = dealRockKinds(plan.length, ARRAS_ROCK_DEAL, has, rand);
    for (let i = 0; i < plan.length; i++) placeOne(Math.floor(plan[i] / rows), plan[i] % rows, deal[out.length]);
    return out;
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!isRockTile(s, cols, rows, c, r)) continue;
    const n = base + (rand() < frac ? 1 : 0);
    for (let k = 0; k < n; k++) {
      if (keep < 1 && rand() >= keep) continue;
      if (out.length >= ROCK_TILES_MAX_ROCKS) return out;
      placeOne(c, r);
    }
  }
  return out;
}

export const PORTAL_MAZE_WALLS: readonly (readonly [number, number, number])[] = [[7,1,1],[4,2,1],[6,2,2],[9,2,1],[10,2,1],[5,3,1],[9,3,1],[13,3,1],[14,3,1],[2,4,1],[19,4,2],[3,5,1],[7,5,1],[9,5,2],[12,5,3],[15,5,2],[3,6,1],[5,6,2],[7,6,1],[18,6,3],[7,7,1],[9,7,1],[10,7,1],[15,7,1],[16,7,1],[1,8,1],[6,9,1],[7,9,1],[14,9,3],[18,9,1],[19,9,2],[7,10,1],[3,11,1],[7,11,1],[3,12,1],[7,12,1],[18,12,3],[3,13,1],[5,13,1],[7,13,1],[14,13,1],[15,13,1],[16,13,1],[3,14,1],[5,14,1],[7,14,3],[13,14,1],[1,15,1],[3,15,1],[5,15,1],[10,15,1],[3,16,1],[5,16,1],[10,16,1],[11,16,1],[18,16,1],[19,16,1],[20,16,1],[2,17,1],[19,17,1],[8,18,2],[11,18,1],[13,18,1],[4,19,1],[7,19,1],[11,19,1],[13,19,1],[15,19,1],[16,19,1],[5,20,1],[8,20,1],[16,20,1]];
export const PORTAL_MAZE_ROCKS: readonly (readonly [number, number, number])[] = [[10.14,0.09,66],[18.05,0.17,66],[21.81,0.17,57],[17.48,0.26,67],[4.87,0.43,61],[0.54,0.6,57],[11.84,0.69,58],[21.81,0.69,52],[18.05,0.78,52],[0.16,0.95,69],[4.31,0.95,55],[11.27,0.95,59],[9.95,1.12,52],[12.21,1.47,68],[12.78,1.81,69],[9.95,1.9,68],[10.52,1.98,54],[11.08,2.5,57],[10.52,2.67,67],[11.46,2.67,56],[21.62,4.31,58],[0.16,4.49,59],[7.69,7.16,60],[15.04,7.16,64],[7.13,7.76,57],[1.29,9.06,52],[1.29,9.4,54],[2.05,9.92,58],[0.92,10.27,59],[21.06,10.27,66],[2.99,10.35,62],[21.81,10.35,68],[21.62,10.7,62],[0.73,10.87,60],[2.24,10.96,60],[0.16,11.13,59],[21.62,11.22,56],[19.55,11.3,53],[0.54,11.39,58],[2.42,11.39,67],[2.8,11.99,57],[1.48,12.25,62],[1.11,12.34,62],[1.67,12.94,57],[20.87,12.94,51],[14.28,14.58,57],[7.13,14.67,68],[14.85,14.84,59],[7.69,14.93,55],[14.28,14.93,53],[0.35,17.08,60],[21.62,17.77,59],[0.35,17.95,64],[21.06,17.95,62],[10.89,19.07,67],[11.65,19.15,68],[10.33,19.58,53],[10.71,19.67,58],[9.2,20.02,51],[9.76,20.19,68],[9.2,20.53,68],[9.76,20.71,59],[12.96,20.79,54],[17.48,21.05,63],[4.87,21.14,60],[11.84,21.14,67],[10.52,21.22,68],[21.44,21.31,52],[0.54,21.4,63],[21.81,21.48,65],[4.49,21.65,62],[0.92,21.91,56],[4.12,21.91,61]];

export function fitRocks(rocks: PlacedRock[], cols: number, rows: number, tile: number): PlacedRock[] {
  const hold = (r: PlacedRock) => { const m = r.size / tile; r.cx = Math.max(m, Math.min(cols - m, r.cx)); r.cy = Math.max(m, Math.min(rows - m, r.cy)); };
  for (const r of rocks) hold(r);
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < rocks.length; i++) for (let j = 0; j < i; j++) {
      const a = rocks[i], b = rocks[j];
      const dx = (a.cx - b.cx) * tile, dy = (a.cy - b.cy) * tile, d = Math.hypot(dx, dy), need = a.size + b.size + 1;
      if (d >= need) continue;
      const ux = d > 0 ? dx / d : 1, uy = d > 0 ? dy / d : 0, push = (need - d) / 2 / tile;
      a.cx += ux * push; a.cy += uy * push; b.cx -= ux * push; b.cy -= uy * push;
      hold(a); hold(b);
      moved = true;
    }
    if (!moved) break;
  }
  return rocks;
}

function greyTile(id: number, gx: number, gy: number): PlacedZone {
  if (SMALL_FIX.R660 === 0) return { id, gx, gy, cw: 1, ch: 1, team: 0, kind: 'cosmetic', color: cmHex(CM.BARRELS, false, CM_USE.GENERAL), colorMap: CM.BARRELS, opacity: 0.3 };
  return { id, gx, gy, cw: 1, ch: 1, team: 0, kind: 'cosmetic', color: '#000000', colorMap: CM_FREE, opacity: 0.3 };
}
function base(id: number, gx: number, gy: number, w: number, h: number, team: 0 | 1 | 2 | 3): PlacedZone {
  if (BASE_AREAS.ON !== 0) return { id, gx, gy, cw: w, ch: h, team, kind: 'cosmetic', name: `${TEAM_NAMES[team]} Base`, behaviors: [teamBaseRow(0, team)] };
  return { id, gx, gy, cw: w, ch: h, team };
}
interface Side { name: string; cells: number; scale: number; walls: PlacedWall[]; rocks: PlacedRock[]; zones: PlacedZone[]; portals: { id: number; gx: number; gy: number }[] }
function areaOf(id: string, side: Side, kinds: PortalKindConfig[], gapBefore: number | undefined): AreaConfig {
  const custom: CustomMapData = {
    nextId: 1000,
    walls: side.walls, rocks: side.rocks, zones: side.zones,
    portals: side.portals.map((p): PlacedPortal => ({ id: p.id, gx: p.gx, gy: p.gy, staticPos: true })),
  };
  const mapConfig: MapConfig = {
    ...createDefaultMapConfig(),
    seed: generateRandomSeed(),
    mazeType: MAZE_TYPE_CUSTOM, enableMaze: false, enableRocks: false,
    enablePortals: side.portals.length > 0, portalCount: Math.max(1, side.portals.length),
    gridCells: side.cells, mapScale: side.scale,
    customMap: custom,
    portalKinds: kinds,
    name: side.name,
  };
  const a: AreaConfig = {
    id, name: side.name, mapConfig, shapeSpawnConfig: DEFAULT_SHAPE_SPAWN_CONFIG(), spawnRate: 50,
    worldOffsetX: 0, worldOffsetY: 0, noPvp: false,
  };
  if (gapBefore !== undefined) a.gapBefore = gapBefore;
  return a;
}
function link(pid: number, toArea: string, invisible?: boolean): PortalKindConfig {
  const k: PortalKindConfig = { portalId: pid, kind: 'wormhole', exitAreaId: toArea, exitPortalId: pid, bothWays: true };
  if (invisible !== undefined) k.invisible = invisible;
  return k;
}

export function isPortalWorldAreaId(id: string): boolean {
  return /^portal-(2tdm|4tdm|maze-4tdm)-[ab]-/.test(id);
}

export function buildPortalWorld(mode: PortalModeId, stamp: number, rockSeed?: number, pumpkins = false): MultiAreaMapConfig {
  const idA = `${mode}-a-${stamp}`, idB = `${mode}-b-${stamp}`;
  const PID = 100;
  const kinds: readonly PlacedRock['kind'][] | undefined = pumpkins ? ['rock'] : undefined;
  let A: AreaConfig, B: AreaConfig;
  if (mode === 'portal-2tdm') {
    const seed = generateRandomSeed();
    const team: Side = { name: 'Bases', cells: 11, scale: 13, walls: [], rocks: [], portals: [{ id: PID, gx: 5, gy: 5 }],
      zones: [base(1, 0, 3, 1, 5, 0), base(2, 10, 3, 1, 5, 1), greyTile(3, 5, 5)] };
    const rocks: Side = { name: 'Rocks', cells: 11, scale: 13, walls: [], rocks: placeRockTiles(ROCK_TILES_2TDM, 11, 11, seededRand(seed), 10, kinds),
      portals: [{ id: PID, gx: 5, gy: 5 }], zones: [greyTile(3, 5, 5)] };
    A = areaOf(idA, team, [link(PID, idB)], undefined);
    B = areaOf(idB, rocks, [link(PID, idA)], 1560);
    if (BASE_ARRANGE !== 0) A.mapConfig.baseProtectorTeams = [{ count: 2 }, { count: 2 }];
  } else if (mode === 'portal-4tdm' && SMALL_FIX.R855 !== 0 && ALL_MODES.ON !== 0) {
    const seed = rockSeed ?? generateRandomSeed();
    const bases: Side = { name: 'Bases', cells: 13, scale: 12, walls: [], rocks: [], portals: [{ id: PID, gx: 6, gy: 6 }],
      zones: [base(1, 0, 0, 2, 2, 3), base(2, 11, 0, 2, 2, 0), base(3, 0, 11, 2, 2, 1), base(4, 11, 11, 2, 2, 2), greyTile(5, 6, 6)] };
    const rocks: Side = { name: 'Rocks', cells: 13, scale: 12, walls: [], rocks: placeRockTiles(ROCK_TILES_4TDM, 13, 13, seededRand(seed), 10, kinds),
      portals: [{ id: PID, gx: 6, gy: 6 }], zones: [greyTile(5, 6, 6)] };
    A = areaOf(idA, bases, [link(PID, idB)], undefined);
    B = areaOf(idB, rocks, [link(PID, idA)], 12 * 30 * 4);
    if (BASE_ARRANGE !== 0) A.mapConfig.baseProtectorTeams = [0, 1, 2, 3].map(() => ({ arrangement: 'corners' as const, count: 1 }));
    return { areas: [A, B], activeAreaId: idA, enableMultiArea: true, areaLayout: 'near', areaStack: 'column', minimapAllAreas: true };
  } else if (mode === 'portal-4tdm') {
    const seed = rockSeed ?? generateRandomSeed();
    const _s4 = ALL_MODES.ON !== 0 ? 12 : 13;
    const main: Side = { name: 'Bases', cells: 13, scale: _s4, walls: [], rocks: placeRockTiles(ROCK_TILES_4TDM, 13, 13, seededRand(seed), 10, kinds),
      portals: [{ id: PID, gx: 6, gy: 6 }],
      zones: [base(1, 0, 0, 2, 2, 3), base(2, 11, 0, 2, 2, 0), base(3, 0, 11, 2, 2, 1), base(4, 11, 11, 2, 2, 2), greyTile(5, 6, 6)] };
    const empty: Side = { name: 'Open Area', cells: 13, scale: _s4, walls: [], rocks: [], portals: [{ id: PID, gx: 6, gy: 6 }], zones: [greyTile(5, 6, 6)] };
    A = areaOf(idA, main, [link(PID, idB)], undefined);
    B = areaOf(idB, empty, [link(PID, idA)], _s4 * 30 * 4);
  } else {
    const ring = (id: number, gx: number, gy: number, team: 0 | 1 | 2 | 3): PlacedZone[] => [
      base(id, gx, gy, 3, 1, team), base(id + 1, gx, gy + 2, 3, 1, team), base(id + 2, gx, gy + 1, 1, 1, team),
      base(id + 3, gx + 2, gy + 1, 1, 1, team), greyTile(id + 4, gx + 1, gy + 1)];
    const bases = (): PlacedZone[] => [...ring(101, 1, 1, 0), ...ring(111, 18, 1, 2), ...ring(121, 1, 18, 1), ...ring(131, 18, 18, 3)];
    const ports = [{ id: PID, gx: 2, gy: 2 }, { id: PID + 1, gx: 19, gy: 2 }, { id: PID + 2, gx: 2, gy: 19 }, { id: PID + 3, gx: 19, gy: 19 }];
    const walls: PlacedWall[] = PORTAL_MAZE_WALLS.map(([gx, gy, k], i) => ({ id: 10 + i, gx, gy, cw: k, ch: k }));
    const rand = seededRand(generateRandomSeed());
    const pmDeal = SMALL_FIX.R868 !== 0 && ALL_MODES.ON !== 0 ? dealRockKinds(PORTAL_MAZE_ROCKS.length, ARRAS_ROCK_DEAL, (k) => !kinds || kinds.includes(k), rand) : null;
    const pmVary = ARRAS_ROCK_VARIATION / 100;
    const rocks: PlacedRock[] = fitRocks(PORTAL_MAZE_ROCKS.map(([cx, cy, size], i) => pmDeal
      ? { id: 10 + i, cx, cy, size: ARRAS_ROCK_SIZES[pmDeal[i]] * (1 - pmVary / 2 + rand() * pmVary), rotation: rand() * Math.PI * 2, kind: pmDeal[i] }
      : { id: 10 + i, cx, cy, size, rotation: rand() * Math.PI * 2, kind: 'rock' as const }), 22, 22, 300);
    const maze: Side = { name: 'Maze', cells: 22, scale: 10, walls, rocks: [], zones: bases(), portals: ports };
    const rock: Side = { name: 'Rocks', cells: 22, scale: 10, walls: [], rocks, zones: bases(), portals: ports };
    A = areaOf(idA, maze, ports.map(p => link(p.id, idB)), undefined);
    B = areaOf(idB, rock, ports.map(p => link(p.id, idA)), 1200);
    if (BASE_ARRANGE !== 0) {
      for (const s of [A, B]) s.mapConfig.baseProtectorTeams = [0, 1, 2, 3].map(() => ({ arrangement: 'corners' as const, count: 1 }));
    } else {
      A.mapConfig.enableBaseProtectors = false;
      B.mapConfig.enableBaseProtectors = false;
    }
  }
  return { areas: [A, B], activeAreaId: idA, enableMultiArea: true, areaLayout: 'near', minimapAllAreas: true };
}
