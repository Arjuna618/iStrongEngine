import { TileType, WallEntity, PortalEntity, RockEntity, MapConfig, MapState, BaseZoneRect, AreaConfig, MultiAreaMapConfig, SpawnZoneScale, MAZE_TYPE_CUSTOM } from '@/types';
import { PORTAL_KIND_BLACK_HOLE, PORTAL_KIND_WORMHOLE, PORTAL_THINGS_PUSH, PORTAL_THINGS_PULL_DESTROY, PORTAL_THINGS_PULL_THROUGH, PORTAL_THINGS_WORDS, PORTAL_KIND_PRESETS, WORMHOLE_PULL, PORTAL_BOT_ODDS_DEFAULT } from '@/types';
import type { PortalKindConfig, PortalThingsWord, CustomAreaRect, PlacedZone, PlacedPortal } from '@/types';
import { AREA_KIND_COSMETIC, AREA_KIND_BOUNCY, AREA_KIND_KILL, AREA_KIND_SOLID, AREA_KIND_CONVEYOR, AREA_KIND_PEACE, AREA_KIND_KEEPOUT, AREA_DOES_DPS, AREA_DOES_PCT, AREA_FOOD_CRASHERS, AREA_FOOD_ALL } from '@/types';
import { MAP_EVENTS } from './mapEventsSwitch';
import { behaviorsOf, rectsOf, zoneShapeOf, takeId, shiftShape, shiftEventsDoc } from './mapEvents/doc';
import { BASE_AREAS, zoneBaseTeam, teamBaseRow, fitZonesToGrid } from './baseAreas';
import { PLACED_PORTALS } from './placedPortalsSwitch';
import { TEAM_NAMES } from '@/types';
import { shapeWorldPoly, polyMiddle, polyMx, polyMy, polyTouches, polyHas, polyEdgeDist2 } from './areaShape';
import type { AreaFill, MapPaint } from '@/types';
import { DEFAULT_MAP_CONFIG } from '@/types';
import { evalNum } from './mapEvents/num';
import { MazeGenerator, MAZE_NATIVE_GRID, MAZE_PATTERN_GRID, MAZE_MIN_GRID, MAZE_TEMPLATE_DIMS, MAZE_NATIVE_SHAPE_TYPES, MAZE_TYPE_IDS } from './MazeGenerator';
import { MAP_RECT, MAP_HALF_EXACT } from './mapRectSwitch';
import { drawnLayoutOf } from './modeDrawings';
import { MISSING_MODES } from './missingModesSwitch';
import { SMALL_FIX } from './smallFixSwitch';
import { isRockFormation } from './rockFormationWord';
import { rockTilesOf, placeRockTiles } from './portalModes';
import { dealRockKinds, rockDealOf, rockCircleTooNear } from './rockDeal';
import { wallSkips } from './wallTypes';
import { MAGIC_MAZE, MAGIC_MAZE_TYPE, MAGIC_MAZE_MIN_GRID, magicMazeOf, latticeIn, rollMagicWalls, mmOpenKind, type MagicLattice } from './magicMaze';
export const MAP_RULES = { ROCK_NO_OVERLAP: 1 };
import { darkenColor } from '@/utils/p5Utils';
import { CM, CM_USE, cmHex, customAreaFill } from '@/utils/colorMap';
import { GRID_SPACING, PORTAL_TILE_SIZE, PORTAL_EVENT_HORIZON, GEN_ROCK_SIZES, ARRAS_ROCK_SIZES, ARRAS_ROCK_MIX, ARRAS_ROCK_VARIATION } from './constants';
import { ROCK_FORMATIONS, type RockFormationWord } from './rockFormations.generated';
import { createNavigationState, buildRockBuckets, heldWallsReach } from './Navigation';
import {
  editWalls, editRocks, editZones, editPortals, editRemovedRockKeys,
  generatedRockKey, cellCoordToLocal, rockShapeFor, isCustomMap, mapTweaksLive, gridResizeShift,
} from './MapEditor';

export const PORTAL_GRAVITY = 33500;
export const PORTAL_RING_DRAG: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
export const PORTAL_RING_PUSH: readonly number[] = [0, 0.005, 0.01, 0.02, 0.04, 0.08, 0.15, 0.35, 1.0, 3.0, 15.0];
export const PORTAL_COOLDOWN = 200;
const PORTAL_SPIN_SPEED = 0.05;
const PORTAL_AURA_COUNT = 3;
const PORTAL_AURA_SPRING = 0.048;
const PORTAL_AURA_MIN_SPEED = 0.01;
const PORTAL_AURA_SNAP = 0.08;
const PORTAL_PARTICLE_COUNT = 15;
const PORTAL_PARTICLE_CAP = PORTAL_PARTICLE_COUNT * 2;
export const PORTAL_PARTICLE_RAND_DEFAULT = 30;
function _vRand(p: PortalEntity): number {
  let t = (p._vSeed = (p._vSeed + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function portalParticleRoll(p: PortalEntity): void {
  const c = p.pCountRand, s = p.pSpeedRand;
  p._vN = Math.max(1, Math.min(PORTAL_PARTICLE_CAP, Math.round(PORTAL_PARTICLE_COUNT * (1 + (_vRand(p) * 2 - 1) * c))));
  p._vK = Math.max(0.05, 1 + (_vRand(p) * 2 - 1) * s);
  for (let r = 0; r < PORTAL_PARTICLE_CAP; r++) {
    p._vAngle[r] = _vRand(p) * 6.283185307;
    p._vT[r] = -(_vRand(p) * 1.5);
    p._vSpawnR[r] = PORTAL_PARTICLE_SPAWN_MIN + _vRand(p) * (PORTAL_PARTICLE_SPAWN_MAX - PORTAL_PARTICLE_SPAWN_MIN);
    p._vSize[r] = PORTAL_PARTICLE_DOT_MIN + _vRand(p) * (PORTAL_PARTICLE_DOT_MAX - PORTAL_PARTICLE_DOT_MIN);
    p._vOpac[r] = 0.2 + _vRand(p) * 0.1;
  }
}
export function portalRandomised(p: PortalEntity): boolean { return p.pCountRand > 0 || p.pSpeedRand > 0; }
const PORTAL_PARTICLE_SPEED = 0.0225;
const PORTAL_PARTICLE_SPAWN_MIN = 5.0;
const PORTAL_PARTICLE_SPAWN_MAX = 12.0;
const PORTAL_PARTICLE_END_R = 0.2;
const PORTAL_PARTICLE_DOT_MIN = 7;
const PORTAL_PARTICLE_DOT_MAX = 11;
const PORTAL_SPAWN_DURATION = 500;
const PORTAL_DEATH_DURATION = 300;

export const ROCK_HP = 10000;
export const ROCK_SHIELD = 10000;

export const WALL_COLORS: Partial<Record<TileType, string>> = {
  [TileType.WALL]:       cmHex(CM.WALLS, false, CM_USE.GENERAL),
  [TileType.BASE_BLUE]:  '#768dfc',
  [TileType.BASE_RED]:   '#f04f54',
  [TileType.BASE_GREEN]: '#89ff69',
  [TileType.BASE_PURPLE]:'#bf7ff5',
};

let _wallStrokeCache: Record<string, string> = {};
export function getWallStroke(hex: string): string {
  let s = _wallStrokeCache[hex];
  if (s === undefined) {
    s = darkenColor(hex, 0.598);
    _wallStrokeCache[hex] = s;
  }
  return s;
}

export function clearWallStrokeCache(): void {
  _wallStrokeCache = {};
}

export interface WallCollisionResult {
  hit: boolean;
  pushX: number;
  pushY: number;
  wallType: TileType;
  faceAxis: number;
  wallIndex: number;
  zeroVelX: boolean;
  zeroVelY: boolean;
}

const _collResult: WallCollisionResult = {
  hit: false, pushX: 0, pushY: 0,
  wallType: TileType.NORMAL, faceAxis: 0, wallIndex: -1,
  zeroVelX: false, zeroVelY: false,
};

const _tempColl: WallCollisionResult = {
  hit: false, pushX: 0, pushY: 0,
  wallType: TileType.NORMAL, faceAxis: 0, wallIndex: -1,
  zeroVelX: false, zeroVelY: false,
};

const _processedWalls = new Int16Array(64);
let _processedWallCount = 0;

export const WALL_ID_MAX = 32767;

interface MazeRun {
  squares: ReturnType<MazeGenerator['placeMinimal']>['squares'];
  seedUsed: number;
  width: number;
  height: number;
}

const _MAZE_MEMO_MAX = 4;
let _mazeMemoCap = _MAZE_MEMO_MAX;
const _mazeMemo = new Map<string, MazeRun>();

let _mazeRunLog: string[] | null = null;
export interface PackedMazeRun { key: string; squares: Float64Array; seedUsed: number; width: number; height: number }
export function beginMazeRunLog(): void { _mazeRunLog = []; }
export function takeMazeRunLog(): PackedMazeRun[] {
  const keys = _mazeRunLog ?? [];
  _mazeRunLog = null;
  const out: PackedMazeRun[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (keys.indexOf(keys[i]) !== i) continue;
    const run = _mazeMemo.get(keys[i]);
    if (run === undefined) continue;
    const sq = new Float64Array(run.squares.length * 3);
    for (let k = 0; k < run.squares.length; k++) { const q = run.squares[k]; sq[k * 3] = q.x; sq[k * 3 + 1] = q.y; sq[k * 3 + 2] = q.size; }
    out.push({ key: keys[i], squares: sq, seedUsed: run.seedUsed, width: run.width, height: run.height });
  }
  return out;
}
export function primeMazeMemo(runs: readonly PackedMazeRun[] | undefined, areaCount: number = 0): void {
  if (!runs || runs.length === 0) return;
  if (areaCount > 0) _mazeMemoCap = Math.max(_MAZE_MEMO_MAX, areaCount);
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (_mazeMemo.has(r.key)) continue;
    const squares: MazeRun['squares'] = [];
    for (let k = 0; k + 2 < r.squares.length; k += 3) squares.push({ x: r.squares[k], y: r.squares[k + 1], size: r.squares[k + 2] });
    while (_mazeMemo.size >= _mazeMemoCap) {
      const oldest = _mazeMemo.keys().next();
      if (oldest.done) break;
      _mazeMemo.delete(oldest.value);
    }
    _mazeMemo.set(r.key, { squares, seedUsed: r.seedUsed, width: r.width, height: r.height });
  }
}
export function clearMazeMemo(): void { _mazeMemo.clear(); }

function runMazeGenerator(gc: number, mazeType: number, seed: number, erosion: number, growW = 0, growH = 0): MazeRun {
  const key = mazeType + '|' + seed + '|' + erosion + '|' + gc + (growW > 0 ? '|g' + growW + 'x' + growH : '');
  if (_mazeRunLog !== null) _mazeRunLog.push(key);
  const hit = _mazeMemo.get(key);
  if (hit !== undefined) {
    _mazeMemo.delete(key);
    _mazeMemo.set(key, hit);
    return hit;
  }
  const gen = new MazeGenerator(gc);
  if (growW > 0) gen.setGrowTarget(growW, growH);
  const result = gen.placeMinimal(mazeType, seed, erosion);
  const dims = gen.getDimensions();
  const run: MazeRun = {
    squares: result.squares,
    seedUsed: result.seedUsed,
    width: dims.width,
    height: dims.height,
  };
  while (_mazeMemo.size >= _mazeMemoCap) {
    const oldest = _mazeMemo.keys().next();
    if (oldest.done) break;
    _mazeMemo.delete(oldest.value);
  }
  _mazeMemo.set(key, run);
  return run;
}

export function gridCellsYOf(config: { gridCells: number; gridCellsY?: number }): number {
  if (MAP_RECT === 0) return config.gridCells;
  const y = config.gridCellsY;
  return typeof y === 'number' && Number.isFinite(y) && y > 0 ? y : config.gridCells;
}

export interface MazeGridPlan { gcX: number; gcY: number; arras: boolean; k: number; growW: number; growH: number }
export function mazeGridPlan(config: MapConfig): MazeGridPlan {
  let gx0 = config.gridCells, gy0 = gridCellsYOf(config);
  const generated = config.enableMaze && config.mazeType !== MAZE_TYPE_CUSTOM;
  if (generated && MAGIC_MAZE.ON && config.mazeType === MAGIC_MAZE_TYPE) {
    const gcX = Math.max(gx0, MAGIC_MAZE_MIN_GRID), gcY = Math.max(gy0, MAGIC_MAZE_MIN_GRID);
    return { gcX, gcY, arras: true, k: 1, growW: gcX, growH: gcY };
  }
  const native = MAZE_NATIVE_SHAPE_TYPES.has(config.mazeType);
  const bigLab = SMALL_FIX.CC008 !== 0 && config.mazeType === 80 && gx0 * gy0 > MAZE_PATTERN_MAX_CELLS;
  const arras = generated && MAP_RECT === 1 && (gx0 !== gy0 || native || bigLab);
  if (!arras) return { gcX: gx0, gcY: gy0, arras: false, k: 1, growW: 0, growH: 0 };
  const dims = MAZE_TEMPLATE_DIMS[config.mazeType] ?? MAZE_TEMPLATE_DIMS[0];
  if (native && config.gridCellsY === undefined) {
    const kn = Math.max(1, Math.round(config.gridCells / Math.max(dims[0], dims[1])));
    gx0 = dims[0] * kn; gy0 = dims[1] * kn;
  }
  const gcX = Math.max(gx0, dims[0]), gcY = Math.max(gy0, dims[1]);
  const k = config.mazeType === 80
    ? Math.max(1, Math.ceil(Math.sqrt((gcX * gcY) / MAZE_PATTERN_MAX_CELLS)))
    : Math.max(1, Math.floor(Math.min(gcX / dims[0], gcY / dims[1])));
  let growW = Math.floor(gcX / k), growH = Math.floor(gcY / k);
  if (growW * growH > MAZE_PATTERN_MAX_CELLS) {
    if (growW >= growH) growW = Math.max(dims[0], Math.floor(MAZE_PATTERN_MAX_CELLS / growH));
    else growH = Math.max(dims[1], Math.floor(MAZE_PATTERN_MAX_CELLS / growW));
  }
  return { gcX, gcY, arras: true, k, growW, growH };
}
export const MAZE_PATTERN_MAX_CELLS = 128 * 128;

export const MAP_GRID_MIN = 8;
export const MAP_GRID_MAX_SIDE = 1000;
export const MAP_GRID_MAX_CELLS = 80000;
export const MAP_SCALE_MIN = 1;
export const MAP_SCALE_MAX = 100;
export const MAP_SCALE_TYPED_MIN = 2;

export function clampGridSize(w: number, h: number, changed: 'w' | 'h' | 'both' = 'both'): { w: number; h: number } {
  const side = (v: number) => Math.max(MAP_GRID_MIN, Math.min(MAP_GRID_MAX_SIDE, Math.round(Number.isFinite(v) ? v : MAP_GRID_MIN)));
  let W = side(w), H = side(h);
  if (W * H > MAP_GRID_MAX_CELLS) {
    if (changed === 'w') W = Math.max(MAP_GRID_MIN, Math.floor(MAP_GRID_MAX_CELLS / H));
    else if (changed === 'h') H = Math.max(MAP_GRID_MIN, Math.floor(MAP_GRID_MAX_CELLS / W));
    else { const f = Math.sqrt(MAP_GRID_MAX_CELLS / (W * H)); W = Math.max(MAP_GRID_MIN, Math.floor(W * f)); H = Math.max(MAP_GRID_MIN, Math.floor(H * f)); }
  }
  return { w: W, h: H };
}

export function clampMapScale(s: number): number {
  return Math.max(MAP_SCALE_TYPED_MIN, Math.min(MAP_SCALE_MAX, Math.round(Number.isFinite(s) ? s : 5)));
}

export function builtGridOf(config: MapConfig): { w: number; h: number } {
  const plan = mazeGridPlan(config);
  if (plan.arras) return { w: plan.gcX, h: plan.gcY };
  let w = config.gridCells, h = plan.gcY;
  if (config.enableMaze && config.mazeType !== MAZE_TYPE_CUSTOM) {
    if (SMALL_FIX.R768 !== 0) {
      const minGc = MAZE_MIN_GRID[config.mazeType];
      if (minGc && minGc > w) w = minGc;
    } else {
    const nativeGc = MAZE_NATIVE_GRID[config.mazeType];
    if (nativeGc && nativeGc > w) w = nativeGc;
    const patternGc = MAZE_PATTERN_GRID[config.mazeType];
    if (patternGc && patternGc > w) w = patternGc;
    }
    h = w;
  }
  return { w, h };
}

export function computeMapDimensions(config: MapConfig): { cellSize: number; mapHalf: number; mapHalfY: number } {
  const cellSize = config.mapScale * GRID_SPACING;
  const g = builtGridOf(config);
  const mapHalf = mapHalfOf(cellSize, g.w);
  const mapHalfY = g.h === g.w ? mapHalf : mapHalfOf(cellSize, g.h);
  return { cellSize, mapHalf, mapHalfY };
}

export function mapHalfOf(cellSize: number, cells: number): number {
  if (MAP_HALF_EXACT !== 0) return (cellSize * cells) / 2;
  return Math.ceil((cellSize * cells) / 2 / GRID_SPACING) * GRID_SPACING;
}

export const SPAWN_ZONE_MIN_CELLS = 2;
export const SPAWN_ZONE_MAX_WIDTH_FRAC = 0.30;
export const SPAWN_ZONE_MIN_SCALE = 50;
export const SPAWN_ZONE_MAX_SCALE = 1000;

export interface SpawnZoneRect {
  gxStart: number; gyStart: number; gxEnd: number; gyEnd: number; type: TileType;
  anchorX: -1 | 0 | 1;
  anchorY: -1 | 0 | 1;
}

const BASE_TYPES: readonly TileType[] = [
  TileType.BASE_BLUE, TileType.BASE_RED, TileType.BASE_GREEN, TileType.BASE_PURPLE,
];

function sanitizeSpawnZoneScale(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 100;
}

export function normalizeSpawnZoneScales(arr: SpawnZoneScale[] | undefined): SpawnZoneScale[] {
  const out: SpawnZoneScale[] = new Array(4);
  for (let i = 0; i < 4; i++) {
    const s = Array.isArray(arr) ? arr[i] : undefined;
    out[i] = { w: sanitizeSpawnZoneScale(s?.w), h: sanitizeSpawnZoneScale(s?.h) };
  }
  return out;
}

export function spawnZoneDefaultExtent(gc: number, teamCount: number, gcY: number = gc): { w: number; h: number } {
  const zoneSize = Math.max(3, Math.floor(gc * 0.12));
  const zoneSizeY = gcY === gc ? zoneSize : Math.max(3, Math.floor(gcY * 0.12));
  const wLimit = SMALL_FIX.R795 ? Math.max(SPAWN_ZONE_MIN_CELLS, Math.floor(gc * SPAWN_ZONE_MAX_WIDTH_FRAC)) : Infinity;
  if (teamCount === 2) return { w: Math.min(zoneSize, wLimit), h: gcY };
  if (teamCount === 3) {
    const halfZone = Math.floor(zoneSize * 1.2);
    return { w: Math.min(halfZone * 2, wLimit), h: zoneSizeY };
  }
  return { w: Math.min(zoneSize, wLimit), h: zoneSizeY };
}

export function spawnZoneMaxExtent(gc: number, teamCount: number, gcY: number = gc): { w: number; h: number } {
  const def = spawnZoneDefaultExtent(gc, teamCount, gcY);
  const wCap = Math.floor(gc * SPAWN_ZONE_MAX_WIDTH_FRAC);
  const hCap = teamCount === 2 ? gcY : (SMALL_FIX.R795 ? Math.floor((gcY - 1) / 2) : Math.floor(gcY / 2));
  return {
    w: Math.min(gc, Math.max(def.w, wCap)),
    h: Math.min(gcY, Math.max(def.h, hCap)),
  };
}

export function spawnZoneMaxScale(gc: number, teamCount: number, gcY: number = gc): { w: number; h: number } {
  const def = spawnZoneDefaultExtent(gc, teamCount, gcY);
  const max = spawnZoneMaxExtent(gc, teamCount, gcY);
  return {
    w: Math.max(100, Math.floor((max.w / def.w) * 100)),
    h: Math.max(100, Math.floor((max.h / def.h) * 100)),
  };
}

export function resolveSpawnZoneScale(config: MapConfig, zoneIndex: number): SpawnZoneScale {
  const sync = config.spawnZoneSync ?? true;
  const arr = config.spawnZoneScales;
  const src = Array.isArray(arr) ? arr[sync ? 0 : zoneIndex] : undefined;
  return { w: sanitizeSpawnZoneScale(src?.w), h: sanitizeSpawnZoneScale(src?.h) };
}

export function resolveSpawnZoneExtent(
  config: MapConfig, gc: number, teamCount: number, zoneIndex: number, gcY: number = gc
): { w: number; h: number } {
  const def = baseLayoutExtent(config, gc, gcY) ?? spawnZoneDefaultExtent(gc, teamCount, gcY);
  const max = spawnZoneMaxExtent(gc, teamCount, gcY);
  const s = resolveSpawnZoneScale(config, zoneIndex);
  const w = Math.min(Math.max(Math.round((def.w * s.w) / 100), SPAWN_ZONE_MIN_CELLS), max.w);
  const h = Math.min(Math.max(Math.round((def.h * s.h) / 100), SPAWN_ZONE_MIN_CELLS), max.h);
  return { w, h };
}

function baseLayoutExtent(config: MapConfig, gc: number, gcY: number): { w: number; h: number } | null {
  switch (config.baseLayout) {
    case 'strips': return { w: Math.max(1, Math.round(gc / 11)), h: gcY };
    case 'corner-tile': return { w: Math.max(1, Math.round(gc / 9)), h: Math.max(1, Math.round(gcY / 9)) };
    case 'corner-room': return { w: Math.max(1, Math.round(gc / 8)), h: Math.max(1, Math.round(gcY / 8)) };
    case 'strips-10': return { w: Math.max(1, Math.round(gc / 10)), h: gcY };
    case 'corner-tile-10': return { w: Math.max(1, Math.round(gc / 10)), h: Math.max(1, Math.round(gcY / 10)) };
    case 'goal-mouths': return { w: Math.max(1, Math.round(gc * 2 / 28)), h: Math.max(1, Math.round(gcY * 4 / 20)) };
    default: return null;
  }
}

export function computeSpawnZoneRects(
  config: MapConfig, gc: number, teamCount: number, gcY: number = gc
): SpawnZoneRect[] {
  const _dl = drawnLayoutOf(config.baseLayout);
  if (_dl) {
    const out: SpawnZoneRect[] = [];
    const sx = gc / _dl.w, sy = gcY / _dl.h;
    for (const b of _dl.bases) {
      if (b.forTeams && !b.forTeams.includes(teamCount)) continue;
      if (b.team < 1 || b.team > 4 || b.team > Math.max(teamCount, 1) && !b.forTeams) continue;
      const x0 = Math.max(0, Math.round(b.gx * sx)), y0 = Math.max(0, Math.round(b.gy * sy));
      out.push({ gxStart: x0, gyStart: y0, gxEnd: Math.min(gc, Math.max(x0 + 1, Math.round((b.gx + b.cw) * sx))), gyEnd: Math.min(gcY, Math.max(y0 + 1, Math.round((b.gy + b.ch) * sy))), type: BASE_TYPES[b.team - 1], anchorX: 0, anchorY: 0 });
    }
    return out;
  }
  const ext = (i: number) => resolveSpawnZoneExtent(config, gc, teamCount, i, gcY);
  const mid = (extent: number) => Math.floor((gc - extent) / 2);
  const midY = (extent: number) => Math.floor((gcY - extent) / 2);
  const rects: SpawnZoneRect[] = [];

  if (config.baseLayout === 'goal-mouths' && teamCount === 2) {
    const inX = Math.round(gc * 2 / 28);
    for (let i = 0; i < 2; i++) {
      const z = ext(i), right = i === 1, y0 = Math.floor((gcY - z.h) / 2);
      rects.push({ gxStart: right ? gc - inX - z.w : inX, gyStart: y0, gxEnd: right ? gc - inX : inX + z.w, gyEnd: y0 + z.h, type: BASE_TYPES[i], anchorX: right ? 1 : -1, anchorY: 0 });
    }
  } else if (config.baseLayout === 'corner-room') {
    const inX = Math.round(gc / 16), inY = Math.round(gcY / 16);
    const room = (i: number, right: boolean, down: boolean) => {
      const z = ext(i);
      rects.push({
        gxStart: right ? gc - inX - z.w : inX, gyStart: down ? gcY - inY - z.h : inY,
        gxEnd: right ? gc - inX : inX + z.w, gyEnd: down ? gcY - inY : inY + z.h,
        type: BASE_TYPES[i], anchorX: right ? 1 : -1, anchorY: down ? 1 : -1,
      });
    };
    if (teamCount === 2) { room(0, false, false); room(1, true, true); }
    else { room(0, false, false); room(1, true, false); room(2, false, true); if (teamCount >= 4) room(3, true, true); }
  } else if (teamCount === 2) {
    const z0 = ext(0), z1 = ext(1);
    const y0 = midY(z0.h), y1 = midY(z1.h);
    rects.push({ gxStart: 0, gyStart: y0, gxEnd: z0.w, gyEnd: y0 + z0.h, type: BASE_TYPES[0], anchorX: -1, anchorY: 0 });
    rects.push({ gxStart: gc - z1.w, gyStart: y1, gxEnd: gc, gyEnd: y1 + z1.h, type: BASE_TYPES[1], anchorX: 1, anchorY: 0 });
  } else if (teamCount === 3) {
    const z0 = ext(0), z1 = ext(1), z2 = ext(2);
    const x0 = mid(z0.w);
    rects.push({ gxStart: x0, gyStart: 0, gxEnd: x0 + z0.w, gyEnd: z0.h, type: BASE_TYPES[0], anchorX: 0, anchorY: -1 });
    rects.push({ gxStart: 0, gyStart: gcY - z1.h, gxEnd: z1.w, gyEnd: gcY, type: BASE_TYPES[1], anchorX: -1, anchorY: 1 });
    rects.push({ gxStart: gc - z2.w, gyStart: gcY - z2.h, gxEnd: gc, gyEnd: gcY, type: BASE_TYPES[2], anchorX: 1, anchorY: 1 });
  } else {
    const z0 = ext(0), z1 = ext(1), z2 = ext(2), z3 = ext(3);
    rects.push({ gxStart: 0, gyStart: 0, gxEnd: z0.w, gyEnd: z0.h, type: BASE_TYPES[0], anchorX: -1, anchorY: -1 });
    rects.push({ gxStart: gc - z1.w, gyStart: 0, gxEnd: gc, gyEnd: z1.h, type: BASE_TYPES[1], anchorX: 1, anchorY: -1 });
    rects.push({ gxStart: 0, gyStart: gcY - z2.h, gxEnd: z2.w, gyEnd: gcY, type: BASE_TYPES[2], anchorX: -1, anchorY: 1 });
    rects.push({ gxStart: gc - z3.w, gyStart: gcY - z3.h, gxEnd: gc, gyEnd: gcY, type: BASE_TYPES[3], anchorX: 1, anchorY: 1 });
  }

  const loMid = Math.floor(gc / 2);
  const hiMid = Math.ceil(gc / 2);
  const loMidY = Math.floor(gcY / 2);
  const hiMidY = Math.ceil(gcY / 2);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.anchorX === -1) r.gxEnd = Math.min(r.gxEnd, loMid);
    else if (r.anchorX === 1) r.gxStart = Math.max(r.gxStart, hiMid);
    if (r.anchorY === -1) r.gyEnd = Math.min(r.gyEnd, loMidY);
    else if (r.anchorY === 1) r.gyStart = Math.max(r.gyStart, hiMidY);
    r.gxStart = Math.max(0, r.gxStart);
    r.gyStart = Math.max(0, r.gyStart);
    r.gxEnd = Math.min(gc, r.gxEnd);
    r.gyEnd = Math.min(gcY, r.gyEnd);
  }
  return rects;
}

function modeGaveBaseName(t: number, name: string | undefined): boolean {
  if (name === undefined) return true;
  const own = t === 0 ? ['Blue'] : t === 1 || t === 2 ? ['Red', 'Green'] : t === 3 ? ['Purple'] : [];
  for (let i = 0; i < own.length; i++) if (name === `${own[i]} Base`) return true;
  return false;
}
export function layModeBases(config: MapConfig, want: boolean): MapConfig {
  if (BASE_AREAS.ON === 0 || MAP_EVENTS.ON === 0 || isCustomMap(config)) return config;
  const zones = config.mapAreas?.zones ?? [];
  const laid = zones.filter(z => z.modeBase === true);
  if (!want) {
    if (laid.length === 0 && !config.enableSpawnAreas) return config;
    const next: MapConfig = { ...config, enableSpawnAreas: false };
    if (laid.length > 0) next.mapAreas = { nextId: config.mapAreas!.nextId, zones: zones.filter(z => z.modeBase !== true) };
    return next;
  }
  const g = builtGridOf(config);
  const rects = computeSpawnZoneRects(config, g.w, config.spawnAreaTeamCount ?? 2, g.h);
  const byTeam = new Map<number, PlacedZone>();
  for (const z of laid) { const t = zoneBaseTeam(z); if (t >= 0 && !byTeam.has(t)) byTeam.set(t, z); }
  let nextId = config.mapAreas?.nextId ?? 1;
  for (const z of zones) if (z.id >= nextId) nextId = z.id + 1;
  const doc = config.events ? { ...config.events } : null;
  const bases: PlacedZone[] = [];
  for (const r of rects) {
    const t = BASE_TYPES.indexOf(r.type);
    if (t < 0) continue;
    const was = byTeam.get(t);
    byTeam.delete(t);
    const z: PlacedZone = was ? { ...was } : {
      id: nextId++, gx: 0, gy: 0, cw: 1, ch: 1, team: t as 0 | 1 | 2 | 3, kind: 'cosmetic', opacity: 0,
      ...(doc ? { uid: takeId(doc) } : {}), name: `${TEAM_NAMES[t]} Base`, behaviors: [teamBaseRow(doc ? takeId(doc) : 0, t)],
    };
    z.gx = r.gxStart; z.gy = r.gyStart; z.cw = r.gxEnd - r.gxStart; z.ch = r.gyEnd - r.gyStart; z.team = t as 0 | 1 | 2 | 3; z.modeBase = true;
    if (SMALL_FIX.GH637 !== 0) {
      if (!was || (was.modeName !== undefined ? was.name === was.modeName : modeGaveBaseName(t, was.name))) { z.name = `${TEAM_NAMES[t]} Base`; z.modeName = z.name; }
    } else if (was && /^(Blue|Red|Green|Purple) Base$/.test(was.name ?? '')) z.name = `${TEAM_NAMES[t]} Base`;
    delete z.shape; delete z.more;
    bases.push(z);
  }
  const out: MapConfig = { ...config, enableSpawnAreas: false, mapAreas: { nextId, zones: [...zones.filter(z => z.modeBase !== true), ...bases] } };
  if (doc) out.events = doc;
  return out;
}

export function fitAreasToBuiltGrid(next: MapConfig, prev: MapConfig): MapConfig {
  if (BASE_AREAS.ON === 0) return next;
  const a = builtGridOf(prev), b = builtGridOf(next);
  if (a.w === b.w && a.h === b.h) return next;
  const out: MapConfig = { ...next };
  if (next.mapAreas) out.mapAreas = { nextId: next.mapAreas.nextId, zones: fitZonesToGrid(next.mapAreas.zones, a.w, a.h, b.w, b.h, gridResizeShift, shiftShape) };
  if (next.customMap && isCustomMap(next)) out.customMap = { ...next.customMap, zones: fitZonesToGrid(next.customMap.zones, a.w, a.h, b.w, b.h, gridResizeShift, shiftShape) };
  if (next.events) { const dx = gridResizeShift(b.w, a.w), dy = gridResizeShift(b.h, a.h); if (dx !== 0 || dy !== 0) out.events = shiftEventsDoc(next.events, dx, dy); }
  return out;
}

const _carveWallIdx: number[] = [];
const _carveSeen = new Set<number>();
let _cbSeen = new Uint8Array(0);
let _cbQueue = new Int32Array(0);
const _noKeys: string[] = [];

function carveZoneRects(
  tileGrid: Uint8Array, wallGrid: Int16Array, walls: WallEntity[],
  zones: SpawnZoneRect[], gc: number, cellSize: number, mapHalf: number,
  gcY: number = gc, mapHalfY: number = mapHalf
): void {
  _carveWallIdx.length = 0;
  _carveSeen.clear();
  for (let z = 0; z < zones.length; z++) {
    const zone = zones[z];
    for (let gx = zone.gxStart; gx < zone.gxEnd; gx++) {
      for (let gy = zone.gyStart; gy < zone.gyEnd; gy++) {
        const idx = gx * gcY + gy;
        tileGrid[idx] = zone.type;
        const wIdx = wallGrid[idx];
        if (wIdx >= 0) {
          const w = walls[wIdx];
          if (w && w.active && !_carveSeen.has(wIdx)) {
            _carveSeen.add(wIdx);
            _carveWallIdx.push(wIdx);
          }
          wallGrid[idx] = -1;
        }
      }
    }
  }

  for (let i = 0; i < _carveWallIdx.length; i++) {
    const wIdx = _carveWallIdx[i];
    const w = walls[wIdx];
    w.active = false;

    const x0 = Math.max(0, Math.round((w.x - w.halfW + mapHalf) / cellSize));
    const y0 = Math.max(0, Math.round((w.y - w.halfH + mapHalfY) / cellSize));
    const x1 = Math.min(gc, Math.round((w.x + w.halfW + mapHalf) / cellSize));
    const y1 = Math.min(gcY, Math.round((w.y + w.halfH + mapHalfY) / cellSize));

    for (let gx = x0; gx < x1; gx++) {
      for (let gy = y0; gy < y1; gy++) {
        if (wallGrid[gx * gcY + gy] !== wIdx) continue;
        let ex = gx + 1;
        while (ex < x1 && wallGrid[ex * gcY + gy] === wIdx) ex++;
        let ey = gy + 1;
        deepen: while (ey < y1) {
          for (let cx = gx; cx < ex; cx++) {
            if (wallGrid[cx * gcY + ey] !== wIdx) break deepen;
          }
          ey++;
        }
        if (walls.length >= WALL_ID_MAX) {
          for (let cx = gx; cx < ex; cx++) {
            for (let cy = gy; cy < ey; cy++) {
              wallGrid[cx * gcY + cy] = -1;
              tileGrid[cx * gcY + cy] = TileType.NORMAL;
            }
          }
          continue;
        }
        const halfW = ((ex - gx) * cellSize) / 2;
        const halfH = ((ey - gy) * cellSize) / 2;
        const sub: WallEntity = {
          x: -mapHalf + gx * cellSize + halfW,
          y: -mapHalfY + gy * cellSize + halfH,
          halfW, halfH,
          type: w.type,
          health: w.health,
          maxHealth: w.maxHealth,
          active: true,
          lookDx: 0, lookDy: 0,
        };
        const subIdx = walls.length;
        walls.push(sub);
        for (let cx = gx; cx < ex; cx++) {
          for (let cy = gy; cy < ey; cy++) wallGrid[cx * gcY + cy] = subIdx;
        }
      }
    }
  }
  _carveSeen.clear();
  _carveWallIdx.length = 0;
}

function generateSpawnZones(
  tileGrid: Uint8Array, wallGrid: Int16Array, walls: WallEntity[],
  gc: number, teamCount: number, cellSize: number, mapHalf: number, config: MapConfig,
  gcY: number = gc, mapHalfY: number = mapHalf
): void {
  carveZoneRects(tileGrid, wallGrid, walls,
    computeSpawnZoneRects(config, gc, teamCount, gcY), gc, cellSize, mapHalf, gcY, mapHalfY);
}

export function layModePortals(config: MapConfig): MapConfig {
  if (PLACED_PORTALS.ON === 0 || MAP_EVENTS.ON === 0 || isCustomMap(config) || config.mapPortals || !config.enablePortals) return config;
  const n = Math.max(0, Math.min(64, Math.floor(config.portalCount || 0)));
  const portals: PlacedPortal[] = [];
  for (let i = 0; i < n; i++) {
    const k = config.portalKinds?.find(r => r.portalId === i);
    const inArea = MISSING_MODES.ON !== 0 && k && typeof k.inArea === 'number' ? k.inArea : undefined;
    portals.push(inArea !== undefined ? { id: i, gx: 0, gy: 0, staticPos: false, appear: 'area', inArea } : { id: i, gx: 0, gy: 0, staticPos: false, appear: 'map' });
  }
  return { ...config, mapPortals: { nextId: Math.max(n, 16), portals } };
}

function baseAreaRects(config: MapConfig, gc: number, gcY: number, cellSize: number, mapHalf: number, mapHalfY: number): SpawnZoneRect[] {
  const out: SpawnZoneRect[] = [];
  for (const z of editZones(config)) {
    const t = zoneBaseTeam(z);
    if (t < 0) continue;
    const type = BASE_TYPES[t];
    const sh = zoneShapeOf(z);
    if (sh !== null) {
      const poly = shapeWorldPoly(sh, cellSize, -mapHalf, -mapHalfY);
      const x0 = Math.max(0, z.gx), y0 = Math.max(0, z.gy), x1 = Math.min(gc, z.gx + z.cw), y1 = Math.min(gcY, z.gy + z.ch);
      for (let cx = x0; cx < x1; cx++) for (let cy = y0; cy < y1; cy++)
        if (polyHas(poly, -mapHalf + (cx + 0.5) * cellSize, -mapHalfY + (cy + 0.5) * cellSize)) out.push({ gxStart: cx, gyStart: cy, gxEnd: cx + 1, gyEnd: cy + 1, type, anchorX: 0, anchorY: 0 });
      continue;
    }
    for (const q of rectsOf(z)) {
      const gxStart = Math.max(0, q.gx), gyStart = Math.max(0, q.gy), gxEnd = Math.min(gc, q.gx + q.cw), gyEnd = Math.min(gcY, q.gy + q.ch);
      if (gxEnd > gxStart && gyEnd > gyStart) out.push({ gxStart, gyStart, gxEnd, gyEnd, type, anchorX: 0, anchorY: 0 });
    }
  }
  return out;
}

function customZoneRects(config: MapConfig, gc: number, gcY: number = gc): SpawnZoneRect[] {
  const zones = editZones(config);
  const out: SpawnZoneRect[] = [];
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.kind && z.kind !== 'base') continue;
    const gxStart = Math.max(0, z.gx);
    const gyStart = Math.max(0, z.gy);
    const gxEnd = Math.min(gc, z.gx + z.cw);
    const gyEnd = Math.min(gcY, z.gy + z.ch);
    if (gxEnd <= gxStart || gyEnd <= gyStart) continue;
    out.push({
      gxStart, gyStart, gxEnd, gyEnd,
      type: BASE_TYPES[z.team] ?? BASE_TYPES[0],
      anchorX: 0, anchorY: 0,
    });
  }
  return out;
}

export function customAreasOf(config: MapConfig, gc: number, cellSize: number, mapHalf: number, gcY: number = gc, mapHalfY: number = mapHalf): CustomAreaRect[] {
  const out: CustomAreaRect[] = [];
  const mev = MAP_EVENTS.ON !== 0;
  if (!mev && !isCustomMap(config)) return out;
  const zones = editZones(config);
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if ((!z.kind || z.kind === 'base') && !(BASE_AREAS.ON !== 0 && mev)) continue;
    if (mev) { areaRowsOf(out, z, gc, cellSize, mapHalf, gcY, mapHalfY); continue; }
    const gxStart = Math.max(0, z.gx), gyStart = Math.max(0, z.gy);
    const gxEnd = Math.min(gc, z.gx + z.cw), gyEnd = Math.min(gcY, z.gy + z.ch);
    if (gxEnd <= gxStart || gyEnd <= gyStart) continue;
    out.push({
      x0: -mapHalf + gxStart * cellSize, y0: -mapHalfY + gyStart * cellSize,
      x1: -mapHalf + gxEnd * cellSize, y1: -mapHalfY + gyEnd * cellSize,
      kind: z.kind === 'bouncy' ? AREA_KIND_BOUNCY : z.kind === 'kill' ? AREA_KIND_KILL : AREA_KIND_COSMETIC,
      ...customAreaLook(z),
      bounce: z.bounce ?? 1,
      spare: z.spare ?? [],
      areaId: '', gx: z.gx, gy: z.gy, cw: z.cw, ch: z.ch,
      poly: null, pmx: 0, pmy: 0,
    });
  }
  return out;
}
interface FillJob { fill: AreaFill; id: number; mask: Uint8Array; gx: number; gy: number; w: number; h: number; poly: Float64Array | null }
function fillsOf(config: MapConfig, gc: number, gcY: number, cellSize: number, mapHalf: number, mapHalfY: number): FillJob[] {
  const out: FillJob[] = [];
  for (const z of editZones(config)) {
    const fill = (z as PlacedZone).fill;
    if (!fill || (fill.k !== 'maze' && fill.k !== 'rocks')) continue;
    const sh = zoneShapeOf(z);
    const poly = sh !== null ? shapeWorldPoly(sh, cellSize, -mapHalf, -mapHalfY) : null;
    const rects = sh !== null ? [] : rectsOf(z);
    let bx0 = z.gx, by0 = z.gy, bx1 = z.gx + z.cw, by1 = z.gy + z.ch;
    if (SMALL_FIX.GH431) for (const r of rects) { if (r.gx < bx0) bx0 = r.gx; if (r.gy < by0) by0 = r.gy; if (r.gx + r.cw > bx1) bx1 = r.gx + r.cw; if (r.gy + r.ch > by1) by1 = r.gy + r.ch; }
    const gx = Math.max(0, bx0), gy = Math.max(0, by0), ex = Math.min(gc, bx1), ey = Math.min(gcY, by1);
    if (ex <= gx || ey <= gy) continue;
    const w = ex - gx, h = ey - gy, mask = new Uint8Array(w * h);
    let any = false;
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const cx = gx + x, cy = gy + y;
      let inside: boolean;
      if (poly !== null) inside = polyHas(poly, -mapHalf + (cx + 0.5) * cellSize, -mapHalfY + (cy + 0.5) * cellSize);
      else { inside = false; for (const r of rects) if (cx >= r.gx && cx < r.gx + r.cw && cy >= r.gy && cy < r.gy + r.ch) { inside = true; break; } }
      if (inside) { mask[x * h + y] = 1; any = true; }
    }
    if (any) out.push({ fill, id: typeof z.uid === 'number' ? z.uid : z.id, mask, gx, gy, w, h, poly });
  }
  return out;
}
function fillSeed(f: FillJob, config: MapConfig): number {
  if (typeof f.fill.seed === 'number' && Number.isFinite(f.fill.seed)) return Math.abs(Math.floor(f.fill.seed)) % 2147483647;
  return Math.abs(((config.seed | 0) ^ Math.imul(f.id + 1, 2654435761)) | 0) % 2147483647;
}
function fillMapOf(f: FillJob, config: MapConfig, density?: number, round = 0): MapState {
  const sub: MapConfig = {
    ...DEFAULT_MAP_CONFIG,
    mapScale: config.mapScale, gridCells: f.w, gridCellsY: f.h, seed: round === 0 ? fillSeed(f, config) : ((fillSeed(f, config) ^ Math.imul(round, 0x9e3779b1)) >>> 0) || 1,
    enableMaze: f.fill.k === 'maze', mazeType: f.fill.k === 'maze' && MAZE_TYPE_IDS.includes(f.fill.maze ?? -2) ? f.fill.maze! : DEFAULT_MAP_CONFIG.mazeType,
    erosionIntensity: typeof f.fill.erosion === 'number' ? Math.max(0, Math.min(2, f.fill.erosion)) : (config.erosionIntensity ?? 1),
    enableRocks: f.fill.k === 'rocks', rockPattern: fillPatternOf(f.fill), rockDensity: density ?? fillCountOf(f.fill, config),
    rockTypes: fillKindsOf(f.fill, config), rockSizeVariation: fillVariationOf(f.fill, config), rockExclusionZone: false,
    rocksLeftOut: undefined,
    enablePortals: false, portalCount: 0, enableSpawnAreas: false, tileOverrides: {},
    customMap: undefined, mapTweaks: undefined, mapAreas: undefined, events: undefined,
  } as MapConfig;
  return generateMap(sub, true);
}
export function fillPatternOf(fill: AreaFill): NonNullable<MapConfig['rockPattern']> {
  const w = fill.rocks;
  return (typeof w === 'string' && (isRockFormation(w) || ['random', 'corners', 'edges', 'ring', 'center', 'scattered', 'tiles', 'pumpkinPatch'].includes(w)) ? w : 'pumpkinPatch') as NonNullable<MapConfig['rockPattern']>;
}
export function fillCountOf(fill: AreaFill, config: MapConfig): number {
  if (typeof fill.count === 'number' && Number.isFinite(fill.count)) return Math.max(0, Math.min(1000, Math.round(fill.count)));
  const p = fillPatternOf(fill);
  return p === 'pumpkinPatch' ? PUMPKIN_PATCH.count : isRockFormation(p) ? ROCK_FORMATIONS[p as RockFormationWord].mean : (config.rockDensity ?? DEFAULT_MAP_CONFIG.rockDensity);
}
export function fillKindsOf(fill: AreaFill, config: MapConfig): ('rock' | 'stone' | 'gravel')[] {
  const k = Array.isArray(fill.kinds) ? fill.kinds.filter(x => x === 'rock' || x === 'stone' || x === 'gravel') : [];
  if (k.length > 0) return k;
  const p = fillPatternOf(fill);
  return p === 'pumpkinPatch' ? ['rock'] : isRockFormation(p) ? ['rock', 'stone', 'gravel'] : (config.rockTypes?.length ? config.rockTypes.slice() as ('rock' | 'stone' | 'gravel')[] : ['rock']);
}
export function fillVariationOf(fill: AreaFill, config: MapConfig): number {
  if (typeof fill.variation === 'number' && Number.isFinite(fill.variation)) return Math.max(0, Math.min(100, fill.variation));
  const p = fillPatternOf(fill);
  return p === 'pumpkinPatch' ? PUMPKIN_PATCH.variation : isRockFormation(p) ? ARRAS_ROCK_VARIATION : (config.rockSizeVariation ?? 50);
}
export const PUMPKIN_PATCH = { count: 125, variation: 30 } as const;
function subCellOf(sub: MapState, f: FillJob, x: number, y: number): number {
  const sx = Math.min(sub.gridCells - 1, Math.floor((x + 0.5) * sub.gridCells / f.w));
  const sy = Math.min(sub.gridCellsY - 1, Math.floor((y + 0.5) * sub.gridCellsY / f.h));
  return sx * sub.gridCellsY + sy;
}
function applyMazeFill(f: FillJob, config: MapConfig, tileGrid: Uint8Array, wallGrid: Int16Array, walls: WallEntity[], gc: number, gcY: number, cellSize: number, mapHalf: number, mapHalfY: number, magic: MagicLattice[] | null = null): void {
  const open: SpawnZoneRect[] = [];
  for (let x = 0; x < f.w; x++) for (let y = 0; y < f.h; y++) {
    if (f.mask[x * f.h + y] !== 1) continue;
    const t = tileGrid[(f.gx + x) * gcY + f.gy + y];
    if (t >= TileType.BASE_BLUE && t <= TileType.BASE_PURPLE) continue;
    open.push({ gxStart: f.gx + x, gyStart: f.gy + y, gxEnd: f.gx + x + 1, gyEnd: f.gy + y + 1, type: TileType.NORMAL, anchorX: 0, anchorY: 0 });
  }
  if (open.length > 0) carveZoneRects(tileGrid, wallGrid, walls, open, gc, cellSize, mapHalf, gcY, mapHalfY);
  if (MAGIC_MAZE.ON && f.fill.maze === MAGIC_MAZE_TYPE) {
    const L = latticeIn(f.gx, f.gy, f.w, f.h, magicMazeOf(config), fillSeed(f, config));
    if (L === null) return;
    layMagicWalls(L, f, tileGrid, wallGrid, walls, gcY, cellSize, mapHalf, mapHalfY);
    if (magic !== null) magic.push(L);
    return;
  }
  const sub = fillMapOf(f, config);
  const want = new Uint8Array(f.w * f.h);
  for (let x = 0; x < f.w; x++) for (let y = 0; y < f.h; y++) {
    if (f.mask[x * f.h + y] !== 1) continue;
    if (tileGrid[(f.gx + x) * gcY + f.gy + y] !== TileType.NORMAL) continue;
    if (sub.tileGrid[subCellOf(sub, f, x, y)] === TileType.WALL) want[x * f.h + y] = 1;
  }
  for (let x = 0; x < f.w; x++) for (let y = 0; y < f.h; y++) {
    if (want[x * f.h + y] !== 1) continue;
    let ex = x + 1;
    while (ex < f.w && want[ex * f.h + y] === 1) ex++;
    let ey = y + 1;
    deepen: while (ey < f.h) { for (let cx = x; cx < ex; cx++) if (want[cx * f.h + ey] !== 1) break deepen; ey++; }
    if (walls.length >= WALL_ID_MAX) return;
    const wIdx = walls.length, halfW = ((ex - x) * cellSize) / 2, halfH = ((ey - y) * cellSize) / 2;
    walls.push({ x: -mapHalf + (f.gx + x) * cellSize + halfW, y: -mapHalfY + (f.gy + y) * cellSize + halfH, halfW, halfH, type: TileType.WALL, health: Infinity, maxHealth: Infinity, active: true, lookDx: 0, lookDy: 0 });
    for (let cx = x; cx < ex; cx++) for (let cy = y; cy < ey; cy++) {
      want[cx * f.h + cy] = 0;
      const idx = (f.gx + cx) * gcY + f.gy + cy;
      tileGrid[idx] = TileType.WALL; wallGrid[idx] = wIdx;
    }
  }
}
function layMagicWalls(L: MagicLattice, f: FillJob | null, tileGrid: Uint8Array, wallGrid: Int16Array, walls: WallEntity[], gcY: number, cellSize: number, mapHalf: number, mapHalfY: number): void {
  for (let i = 0; i < L.nx; i++) for (let j = 0; j < L.ny; j++) {
    const gx = L.gx0 + i, gy = L.gy0 + j, idx = gx * gcY + gy;
    const inShape = f === null || f.mask[(gx - f.gx) * f.h + (gy - f.gy)] === 1;
    const t = tileGrid[idx];
    L.floor[i * L.ny + j] = !inShape || wallGrid[idx] >= 0 || (t >= TileType.BASE_BLUE && t <= TileType.BASE_PURPLE) ? 255 : t;
  }
  const cells: number[] = [];
  rollMagicWalls(L, cells);
  const half = cellSize / 2;
  for (let k = 0; k < cells.length; k += 3) {
    const i = cells[k], j = cells[k + 1];
    if (L.floor[i * L.ny + j] === 255) continue;
    if (walls.length >= WALL_ID_MAX) return;
    const gx = L.gx0 + i, gy = L.gy0 + j, idx = gx * gcY + gy, wIdx = walls.length;
    walls.push({ x: -mapHalf + gx * cellSize + half, y: -mapHalfY + gy * cellSize + half, halfW: half, halfH: half, type: TileType.WALL, health: Infinity, maxHealth: Infinity, active: true, lookDx: 0, lookDy: 0, noEye: true, kind: cells[k + 2] });
    tileGrid[idx] = TileType.WALL; wallGrid[idx] = wIdx;
  }
}
function applyRockFills(fills: readonly FillJob[], config: MapConfig, rocks: RockEntity[], genKinds: string[], tileGrid: Uint8Array, gc: number, gcY: number, cellSize: number, mapHalf: number, mapHalfY: number): void {
  const onMask = (f: FillJob, x: number, y: number): boolean => {
    const cx = Math.floor((x + mapHalf) / cellSize) - f.gx, cy = Math.floor((y + mapHalfY) / cellSize) - f.gy;
    return cx >= 0 && cy >= 0 && cx < f.w && cy < f.h && f.mask[cx * f.h + cy] === 1;
  };
  for (let i = rocks.length - 1; i >= 0; i--) {
    const r = rocks[i];
    for (const f of fills) if (onMask(f, r.x, r.y)) { rocks.splice(i, 1); genKinds.splice(i, 1); break; }
  }
  const wallNear = (x: number, y: number, r: number): boolean => {
    const m = 10 + r, hs = cellSize / 2;
    const gx0 = Math.max(0, Math.floor((x - m + mapHalf) / cellSize)), gx1 = Math.min(gc - 1, Math.floor((x + m + mapHalf) / cellSize));
    const gy0 = Math.max(0, Math.floor((y - m + mapHalfY) / cellSize)), gy1 = Math.min(gcY - 1, Math.floor((y + m + mapHalfY) / cellSize));
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const t = tileGrid[gx * gcY + gy];
      if (t >= TileType.BASE_BLUE && t <= TileType.BASE_PURPLE) { const cx = -mapHalf + (gx + 0.5) * cellSize, cy = -mapHalfY + (gy + 0.5) * cellSize; if (Math.abs(x - cx) < m + hs && Math.abs(y - cy) < m + hs) return true; continue; }
      if (t !== TileType.WALL) continue;
      const cx = -mapHalf + (gx + 0.5) * cellSize, cy = -mapHalfY + (gy + 0.5) * cellSize;
      if (Math.abs(x - cx) < m + hs && Math.abs(y - cy) < m + hs) return true;
    }
    return false;
  };
  const rockNear = (x: number, y: number, r: number): boolean => {
    for (let j = 0; j < rocks.length; j++) { const e = rocks[j]; if (Math.abs(x - e.x) < 10 + r + e.size && Math.abs(y - e.y) < 10 + r + e.size) return true; }
    return false;
  };
  for (const f of fills) {
    if (f.fill.k !== 'rocks') continue;
    let cells = 0;
    for (let i = 0; i < f.mask.length; i++) cells += f.mask[i];
    const want = fillCountOf(f.fill, config), share = Math.max(0.05, cells / (f.w * f.h));
    let laid = 0;
    const bx = -mapHalf + f.gx * cellSize, by = -mapHalfY + f.gy * cellSize, bw = f.w * cellSize, bh = f.h * cellSize;
    for (let round = 0; round < FILL_ROCK_ROUNDS && laid < want; round++) {
    const sub = fillMapOf(f, config, Math.min(4000, Math.ceil(want / share)), round);
    for (let i = 0; i < sub.rocks.length; i++) {
      const r = sub.rocks[i];
      if (!r.active) continue;
      const x = bx + ((r.x + sub.mapHalf) / (sub.mapHalf * 2)) * bw, y = by + ((r.y + sub.mapHalfY) / (sub.mapHalfY * 2)) * bh;
      if (f.poly !== null ? !(polyHas(f.poly, x, y) && polyEdgeDist2(f.poly, x, y) >= r.size * r.size) : !(onMask(f, x - r.size, y - r.size) && onMask(f, x + r.size, y - r.size) && onMask(f, x - r.size, y + r.size) && onMask(f, x + r.size, y + r.size))) continue;
      if (outsidePlayfieldOf(x, y, r.size, mapHalf, mapHalfY)) continue;
      if (wallNear(x, y, r.size) || rockNear(x, y, r.size)) continue;
      if (laid >= want) break;
      rocks.push({ x, y, size: r.size, shape: r.shape, rotation: r.rotation, health: ROCK_HP, maxHealth: ROCK_HP, shield: ROCK_SHIELD, active: true, lookDx: 0, lookDy: 0 });
      genKinds.push(r.shape === -9 ? 'rock' : r.size >= 24 ? 'stone' : 'gravel');
      laid++;
    }
    }
  }
}
const FILL_ROCK_ROUNDS = 6;

function buildDoorWalls(config: MapConfig, tileGrid: Uint8Array, wallGrid: Int16Array, walls: WallEntity[], gc: number, gcY: number, cellSize: number, mapHalf: number, mapHalfY: number): Set<number> {
  const cells = new Set<number>();
  for (const z of editZones(config)) {
    const door = behaviorsOf(z).find(b => b.k === 'door');
    if (!door || typeof z.uid !== 'number') continue;
    const shut = door.off !== true;
    const sh = zoneShapeOf(z);
    const poly = sh !== null ? shapeWorldPoly(sh, cellSize, -mapHalf, -mapHalfY) : null;
    const rects = sh !== null ? [z] : rectsOf(z);
    for (const r of rects) for (let gx = Math.max(0, r.gx); gx < Math.min(gc, r.gx + r.cw); gx++) for (let gy = Math.max(0, r.gy); gy < Math.min(gcY, r.gy + r.ch); gy++) {
      const idx = gx * gcY + gy;
      if (cells.has(idx) || tileGrid[idx] === TileType.WALL || (tileGrid[idx] >= TileType.BASE_BLUE && tileGrid[idx] <= TileType.BASE_PURPLE)) continue;
      const x = -mapHalf + (gx + 0.5) * cellSize, y = -mapHalfY + (gy + 0.5) * cellSize;
      if (poly !== null && !polyHas(poly, x, y)) continue;
      if (walls.length >= WALL_ID_MAX) return cells;
      const wIdx = walls.length;
      walls.push({ x, y, halfW: cellSize / 2, halfH: cellSize / 2, type: TileType.WALL, health: Infinity, maxHealth: Infinity, active: shut, lookDx: 0, lookDy: 0, door: z.uid, noEye: true });
      cells.add(idx);
      if (shut) { tileGrid[idx] = TileType.WALL; wallGrid[idx] = wIdx; }
    }
  }
  return cells;
}

function _areaNum(v: unknown, dflt: number): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : dflt;
  if (v === undefined || v === null) return dflt;
  const n = evalNum(v, 1);
  return Number.isFinite(n) ? n : dflt;
}
const _areaFormula = (v: unknown): unknown => (v === undefined || v === null || typeof v === 'number' ? null : v);
function _areaWords(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const w of v) if (typeof w === 'string') out.push(w);
  return out;
}
const AREA_MASK_MIN = 4;
function areaRowsOf(out: CustomAreaRect[], z: PlacedZone, gc: number, cellSize: number, mapHalf: number, gcY: number, mapHalfY: number): void {
  const look = customAreaLook(z);
  const all = behaviorsOf(z);
  const rects = rectsOf(z);
  const sh = zoneShapeOf(z);
  const poly0 = sh !== null ? shapeWorldPoly(sh, cellSize, -mapHalf, -mapHalfY) : null;
  let pmx = 0, pmy = 0, px0 = 0, py0 = 0, px1 = 0, py1 = 0;
  if (poly0 !== null) {
    polyMiddle(poly0); pmx = polyMx; pmy = polyMy;
    px0 = Infinity; py0 = Infinity; px1 = -Infinity; py1 = -Infinity;
    for (let i = 0; i + 1 < poly0.length; i += 2) { const x = poly0[i], y = poly0[i + 1]; if (x < px0) px0 = x; if (x > px1) px1 = x; if (y < py0) py0 = y; if (y > py1) py1 = y; }
  }
  let painted = false;
  const isBase = BASE_AREAS.ON !== 0 && zoneBaseTeam(z) >= 0;
  for (let b = 0; b <= all.length; b++) {
    const r = b < all.length ? all[b] : null;
    if (r !== null && r.k !== 'kill' && r.k !== 'bounce' && r.k !== 'solid' && !((r.k === 'conveyor' || r.k === 'peace' || r.k === 'keepOut') && MISSING_MODES.ON !== 0)) continue;
    if (r === null && painted) break;
    const a = (r !== null && r.a ? r.a : {}) as Record<string, unknown>;
    const isKill = r !== null && r.k === 'kill', isBounce = r !== null && r.k === 'bounce', isSolid = r !== null && r.k === 'solid';
    const isBelt = r !== null && r.k === 'conveyor';
    const isPeace = r !== null && r.k === 'peace', isKeepOut = r !== null && r.k === 'keepOut';
    const beltDeg = isBelt ? _areaNum(a.angle, 0) : 0, beltSpeed = isBelt ? Math.max(0, Math.min(3000, _areaNum(a.speed, 300))) : 0;
    const does = !isKill ? 0 : a.does === 'dps' ? AREA_DOES_DPS : a.does === 'pct' ? AREA_DOES_PCT : 0;
    const rateWord = does === AREA_DOES_DPS ? a.dps : does === AREA_DOES_PCT ? a.pct : undefined;
    const spare = isKill || isBounce ? _areaWords(a.whitelist) : [];
    const first = out.length;
    let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
    for (let q = 0; q < rects.length; q++) {
      const c = rects[q];
      const gxStart = Math.max(0, c.gx), gyStart = Math.max(0, c.gy);
      const gxEnd = Math.min(gc, c.gx + c.cw), gyEnd = Math.min(gcY, c.gy + c.ch);
      if (gxEnd <= gxStart || gyEnd <= gyStart) continue;
      const x0 = poly0 !== null ? px0 : -mapHalf + gxStart * cellSize, y0 = poly0 !== null ? py0 : -mapHalfY + gyStart * cellSize;
      const x1 = poly0 !== null ? px1 : -mapHalf + gxEnd * cellSize, y1 = poly0 !== null ? py1 : -mapHalfY + gyEnd * cellSize;
      if (x0 < ux0) ux0 = x0; if (y0 < uy0) uy0 = y0; if (x1 > ux1) ux1 = x1; if (y1 > uy1) uy1 = y1;
      out.push({
        x0, y0, x1, y1,
        kind: isBounce ? AREA_KIND_BOUNCY : isKill ? AREA_KIND_KILL : isSolid ? AREA_KIND_SOLID : isBelt ? AREA_KIND_CONVEYOR : isPeace ? AREA_KIND_PEACE : isKeepOut ? AREA_KIND_KEEPOUT : AREA_KIND_COSMETIC,
        ...(isKeepOut ? { crossChance: Math.max(0, Math.min(100, _areaNum(a.chance, 10))), crossHold: Math.max(1, Math.min(600, _areaNum(a.hold, 30))) * 1000 } : {}),
        color: look.color, colorMap: look.colorMap, opacity: look.opacity,
        beltX: isBelt ? Math.cos(beltDeg * Math.PI / 180) * beltSpeed : 0, beltY: isBelt ? Math.sin(beltDeg * Math.PI / 180) * beltSpeed : 0,
        bounce: isBounce ? _areaNum(a.strength, z.bounce ?? 1) : (z.bounce ?? 1),
        spare,
        areaId: '', gx: c.gx, gy: c.gy, cw: c.cw, ch: c.ch,
        uid: typeof z.uid === 'number' ? z.uid : -1, behId: r !== null ? r.id : 0,
        off: r !== null && r.off === true, noDraw: painted,
        does, rate: does === AREA_DOES_PCT ? _areaNum(rateWord, 100) : does === AREA_DOES_DPS ? _areaNum(rateWord, 1500) : 0, rateF: _areaFormula(rateWord),
        centre: isKill && a.test === 'centre',
        hitsRounds: isBelt ? a.rounds === true : a.hitsRounds !== false, ownerCounts: a.ownerCounts !== false,
        food: !isKill ? 0 : a.food === 'crashers' ? AREA_FOOD_CRASHERS : a.food === 'all' ? AREA_FOOD_ALL : 0,
        foodRate: _areaNum(a.foodPct, 100), foodF: _areaFormula(a.foodPct),
        bounceF: isBounce ? _areaFormula(a.strength) : null,
        minLevel: isBounce && typeof a.minLevel === 'number' && Number.isFinite(a.minLevel) ? Math.max(0, Math.floor(a.minLevel)) : 0,
        line: isBounce && typeof a.line === 'string' ? a.line.slice(0, 200) : '',
        deathLine: typeof a.deathLine === 'string' ? a.deathLine : '',
        spareTypes: undefined, spareTags: undefined,
        groupN: 1, ux0: x0, uy0: y0, ux1: x1, uy1: y1, solidTest: -1,
        mask: null, maskW: 0, maskH: 0, maskCell: 0,
        poly: poly0 !== null ? Float64Array.from(poly0) : null, pmx, pmy,
        isBase,
      });
    }
    if (out.length > first) {
      const n = out.length - first, h = out[first];
      h.groupN = n; h.ux0 = ux0; h.uy0 = uy0; h.ux1 = ux1; h.uy1 = uy1;
      for (let k = first + 1; k < out.length; k++) out[k].groupN = 0;
      if (n >= AREA_MASK_MIN && h.centre === true) {
        const w = Math.round((ux1 - ux0) / cellSize), hgt = Math.round((uy1 - uy0) / cellSize);
        const mask = new Uint8Array(w * hgt);
        for (let k = first; k < out.length; k++) {
          const c = out[k];
          const ax = Math.round((c.x0 - ux0) / cellSize), bx = Math.round((c.x1 - ux0) / cellSize);
          const ay = Math.round((c.y0 - uy0) / cellSize), by = Math.round((c.y1 - uy0) / cellSize);
          for (let x = ax; x < bx; x++) for (let y = ay; y < by; y++) mask[x * hgt + y] = 1;
        }
        h.mask = mask; h.maskW = w; h.maskH = hgt; h.maskCell = cellSize;
      }
      painted = true;
    }
  }
}
export function shiftAreaRows(rows: readonly CustomAreaRect[], ox: number, oy: number, areaId: string): void {
  for (const ca of rows) {
    ca.x0 += ox; ca.x1 += ox; ca.y0 += oy; ca.y1 += oy; ca.areaId = areaId;
    if (ca.poly) { const p = ca.poly; for (let i = 0; i + 1 < p.length; i += 2) { p[i] += ox; p[i + 1] += oy; } ca.pmx! += ox; ca.pmy! += oy; }
    if (ca.ux0 !== undefined) { ca.ux0 += ox; ca.ux1! += ox; ca.uy0! += oy; ca.uy1! += oy; }
  }
}
export const CUSTOM_AREA_DEFAULT_LOOK = { color: cmHex(CM.PENTAGONS, false, CM_USE.GENERAL), colorMap: CM.PENTAGONS as number | undefined, opacity: 0.5 } as const;

export interface CustomAreaLook { color: string; colorMap: number | undefined; opacity: number }
export function customAreaLook(z: PlacedZone, out?: CustomAreaLook): CustomAreaLook {
  const o = out ?? { color: '', colorMap: undefined, opacity: 0 };
  o.color = z.color ?? CUSTOM_AREA_DEFAULT_LOOK.color;
  o.colorMap = z.color === undefined && z.colorMap === undefined ? CUSTOM_AREA_DEFAULT_LOOK.colorMap : z.colorMap;
  o.opacity = z.opacity ?? (BASE_AREAS.ON !== 0 && zoneBaseTeam(z) >= 0 ? 0 : CUSTOM_AREA_DEFAULT_LOOK.opacity);
  return o;
}

export { customAreaFill };

export function configPaintsBaseTiles(config: { mazeType?: number; tileOverrides?: Record<string, number> } | null | undefined): boolean {
  if (!config || !config.tileOverrides || config.mazeType === MAZE_TYPE_CUSTOM) return false;
  for (const k in config.tileOverrides) {
    const t = config.tileOverrides[k];
    if (t >= TileType.BASE_BLUE && t <= TileType.BASE_PURPLE) return true;
  }
  return false;
}

export function configBaseTeamSpan(config: {
  mazeType?: number; enableSpawnAreas?: boolean; spawnAreaTeamCount?: number;
  tileOverrides?: Record<string, number>; customMap?: { zones?: { team: number }[] } | null; mapAreas?: { zones?: PlacedZone[] } | null;
} | null | undefined): number {
  if (!config) return 0;
  let span = 0;
  if (BASE_AREAS.ON !== 0) {
    const zs = (config.mazeType === MAZE_TYPE_CUSTOM ? config.customMap?.zones : config.mapAreas?.zones) as PlacedZone[] | undefined;
    if (Array.isArray(zs)) for (const z of zs) { const t = z ? zoneBaseTeam(z) : -1; if (t + 1 > span) span = t + 1; }
    if (config.mazeType === MAZE_TYPE_CUSTOM) return span;
  } else if (config.mazeType === MAZE_TYPE_CUSTOM) {
    const zs = config.customMap && config.customMap.zones;
    if (Array.isArray(zs)) for (let i = 0; i < zs.length; i++) { const t = zs[i] && zs[i].team; if (typeof t === 'number' && t + 1 > span) span = t + 1; }
    return span;
  }
  if (config.enableSpawnAreas) span = Math.max(span, config.spawnAreaTeamCount ?? 2);
  if (config.tileOverrides) {
    for (const k in config.tileOverrides) {
      const t = config.tileOverrides[k];
      if (t >= TileType.BASE_BLUE && t <= TileType.BASE_PURPLE && t - TileType.BASE_BLUE + 1 > span) span = t - TileType.BASE_BLUE + 1;
    }
  }
  return span;
}

export function getBaseTeamFromTile(tile: TileType): string | null {
  switch (tile) {
    case TileType.BASE_BLUE: return 'team1';
    case TileType.BASE_RED: return 'team2';
    case TileType.BASE_GREEN: return 'team3';
    case TileType.BASE_PURPLE: return 'team4';
    default: return null;
  }
}

export function baseTileOfTeam(teamId: string): number {
  switch (teamId) {
    case 'team1': return TileType.BASE_BLUE;
    case 'team2': return TileType.BASE_RED;
    case 'team3': return TileType.BASE_GREEN;
    case 'team4': return TileType.BASE_PURPLE;
    default: return -1;
  }
}

export function getTeamSpawnPosition(mapState: MapState, teamId: string): { x: number; y: number } | null {
  const gcY = mapState.gridCellsY;
  const cs = mapState.cellSize;
  const mh = mapState.mapHalf;
  const mhY = mapState.mapHalfY;
  const tg = mapState.tileGrid;

  const baseTile = baseTileOfTeam(teamId);
  if (baseTile < 0) return null;

  const candidates: number[] = [];
  for (let i = 0; i < tg.length; i++) {
    if (tg[i] === baseTile) candidates.push(i);
  }

  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const gx = Math.floor(chosen / gcY);
  const gy = chosen % gcY;
  return {
    x: -mh + (gx + 0.5) * cs,
    y: -mhY + (gy + 0.5) * cs,
  };
}

export function makePortal(
  id: number, gx: number, gy: number,
  cellSize: number, mapHalf: number, staticPos: boolean, mapHalfY: number = mapHalf
): PortalEntity {
  const prng = Math.random;
  const particleAngle = new Float32Array(PORTAL_PARTICLE_COUNT);
  const particleT = new Float32Array(PORTAL_PARTICLE_COUNT);
  const particleSpawnR = new Float32Array(PORTAL_PARTICLE_COUNT);
  const particleSize = new Float32Array(PORTAL_PARTICLE_COUNT);
  const particleOpacity = new Float32Array(PORTAL_PARTICLE_COUNT);
  for (let ri = 0; ri < PORTAL_PARTICLE_COUNT; ri++) {
    particleAngle[ri] = prng() * Math.PI * 2;
    particleT[ri] = -(prng() * 1.5);
    particleSpawnR[ri] = PORTAL_PARTICLE_SPAWN_MIN + prng() * (PORTAL_PARTICLE_SPAWN_MAX - PORTAL_PARTICLE_SPAWN_MIN);
    particleSize[ri] = PORTAL_PARTICLE_DOT_MIN + prng() * (PORTAL_PARTICLE_DOT_MAX - PORTAL_PARTICLE_DOT_MIN);
    particleOpacity[ri] = 0.2 + prng() * 0.1;
  }
  const auraPos = new Float32Array(PORTAL_AURA_COUNT);
  const auraTarget = new Float32Array(PORTAL_AURA_COUNT);
  const auraSpeed = new Float32Array(PORTAL_AURA_COUNT);
  for (let i = 0; i < PORTAL_AURA_COUNT; i++) {
    auraPos[i] = (i / PORTAL_AURA_COUNT) + prng() * 0.25;
    auraTarget[i] = ((i & 1) ? 0.85 : 0.0) + prng() * 0.15;
    auraSpeed[i] = PORTAL_AURA_SPRING * (0.6 + prng() * 0.8);
  }
  const _p: PortalEntity = {
    x: -mapHalf + gx * cellSize + cellSize / 2,
    y: -mapHalfY + gy * cellSize + cellSize / 2,
    tileSize: PORTAL_TILE_SIZE,
    eventHorizon: PORTAL_EVENT_HORIZON,
    id,
    areaId: '',
    destinationAreaId: null,
    timed: false,
    appearDuration: 0,
    disappearDuration: 0,
    initialDelay: 0,
    staticPos,
    _timedActive: true,
    _timedPhaseStart: 0,
    _spinAngle: prng() * Math.PI * 2,
    _auraPos: auraPos,
    _auraTarget: auraTarget,
    _auraSpeed: auraSpeed,
    _particleAngle: particleAngle,
    _particleT: particleT,
    _particleSpawnR: particleSpawnR,
    _particleSize: particleSize,
    _particleOpacity: particleOpacity,
    _spawnTime: 0,
    _dying: false,
    _particlesDraining: false,
    _deathTime: 0,
    _opacity: 1,
    _scale: 0,
    requireLevel: 0,
    botOdds: PORTAL_BOT_ODDS_DEFAULT,
    bossBlacklist: false,
    botKnown: false, botHighLevel: 0, botOddsHigh: 0, botDreadShare: -1,
    kind: PORTAL_KIND_BLACK_HOLE,
    invisible: false,
    showName: true,
    exitAreaId: '',
    exitPortalId: -1,
    _exit: null,
    reach: PORTAL_TILE_SIZE * 2,
    reachSquare: false,
    pullScale: 1,
    exitDistance: PORTAL_KIND_PRESETS.blackHole.exitDistance,
    exitThrow: 1,
    keepSpeed: true,
    emitAngle: NaN,
    shapeMode: PORTAL_THINGS_PUSH,
    roundMode: PORTAL_THINGS_PUSH,
    toMode: '',
    _toModeNow: '',
    _inCells: null,
    _placedInArea: false,
    themeSlot: -1, themeHex: '',
    pCountRand: MISSING_MODES.ON !== 0 ? PORTAL_PARTICLE_RAND_DEFAULT / 100 : 0, pSpeedRand: MISSING_MODES.ON !== 0 ? PORTAL_PARTICLE_RAND_DEFAULT / 100 : 0,
    _vN: PORTAL_PARTICLE_COUNT, _vK: 1, _vSeed: ((id + 1) * 2654435761 + gx * 40503 + gy * 977) >>> 0,
    _vT: new Float32Array(PORTAL_PARTICLE_CAP), _vAngle: new Float32Array(PORTAL_PARTICLE_CAP), _vSpawnR: new Float32Array(PORTAL_PARTICLE_CAP),
    _vSize: new Float32Array(PORTAL_PARTICLE_CAP), _vOpac: new Float32Array(PORTAL_PARTICLE_CAP),
  };
  if (portalRandomised(_p)) portalParticleRoll(_p);
  return _p;
}

export function applyPortalKind(p: PortalEntity, kc: PortalKindConfig): void {
  const wh = kc.kind === 'wormhole';
  const pre = wh ? PORTAL_KIND_PRESETS.wormhole : PORTAL_KIND_PRESETS.blackHole;
  const num = (v: number | undefined, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const things = (w: PortalThingsWord | undefined, d: PortalThingsWord) => {
    const i = PORTAL_THINGS_WORDS.indexOf((w ?? d) as PortalThingsWord);
    const m = i < 0 ? PORTAL_THINGS_WORDS.indexOf(d) : i;
    return !wh && m === PORTAL_THINGS_PULL_THROUGH ? PORTAL_THINGS_PULL_DESTROY : m;
  };
  p.kind = wh ? PORTAL_KIND_WORMHOLE : PORTAL_KIND_BLACK_HOLE;
  if (MISSING_MODES.ON !== 0) {
    const okHex = typeof kc.themeHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(kc.themeHex);
    p.themeSlot = kc.theme === true && kc.themeUseMap === true && Number.isInteger(kc.themeMap) && (kc.themeMap as number) >= 0 && (kc.themeMap as number) < 20 ? kc.themeMap as number : -1;
    p.themeHex = kc.theme === true && kc.themeUseMap !== true && okHex ? kc.themeHex as string : '';
    p.pCountRand = num(kc.particleCountRand, PORTAL_PARTICLE_RAND_DEFAULT, 0, 100) / 100;
    p.pSpeedRand = num(kc.particleSpeedRand, PORTAL_PARTICLE_RAND_DEFAULT, 0, 100) / 100;
    portalParticleRoll(p);
  }
  p.invisible = kc.invisible ?? pre.invisible;
  p.showName = kc.showName !== false;
  p.exitAreaId = wh ? (kc.exitAreaId ?? '') : '';
  p.exitPortalId = wh && typeof kc.exitPortalId === 'number' ? kc.exitPortalId : -1;
  p.reach = num(kc.reach, pre.reach, 20, 3000);
  p.reachSquare = kc.reachSquare ?? pre.reachSquare;
  p.pullScale = num(kc.pull, pre.pull, 0, 10);
  p.eventHorizon = num(kc.jump, pre.jump, 1, 500);
  p.exitDistance = num(kc.exitDistance, pre.exitDistance, 0, 1000);
  p.exitThrow = num(kc.exitThrow, pre.exitThrow, 0, 10);
  p.keepSpeed = kc.keepSpeed ?? pre.keepSpeed;
  p.emitAngle = wh && typeof kc.emitAngle === 'number' && Number.isFinite(kc.emitAngle) ? ((((kc.emitAngle % 360) + 360) % 360) - 90) * Math.PI / 180 : NaN;
  p.shapeMode = things(kc.shapes, pre.shapes);
  p.roundMode = things(kc.rounds, pre.rounds);
  p.toMode = MISSING_MODES.ON !== 0 && !wh && typeof kc.toMode === 'string' ? kc.toMode.slice(0, 64) : '';
  p._toModeNow = p.toMode === 'random' ? '' : p.toMode;
}

export function cleanMapPaint(p: unknown): MapPaint | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as { slot?: unknown; hex?: unknown; opacity?: unknown };
  const out: MapPaint = {};
  if (Number.isInteger(o.slot) && (o.slot as number) >= 0 && (o.slot as number) < 20) out.slot = o.slot as number;
  if (typeof o.hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.hex)) out.hex = o.hex.toLowerCase();
  if (out.slot === undefined && out.hex === undefined) return null;
  if (typeof o.opacity === 'number' && Number.isFinite(o.opacity) && o.opacity < 1) out.opacity = Math.max(0.05, o.opacity);
  return out;
}
export const PAINT_DEFAULT_SLOT = 7;
function _paintOn(e: { paintSlot?: number; paintHex?: string; paintAlpha?: number }, p: MapPaint | undefined, asMap: boolean): void {
  const c = cleanMapPaint(p);
  if (c === null) return;
  if (asMap && c.slot === PAINT_DEFAULT_SLOT && c.opacity === undefined) return;
  if (c.slot !== undefined) e.paintSlot = c.slot; else e.paintHex = c.hex;
  if (c.opacity !== undefined) e.paintAlpha = c.opacity;
}

export function portalNameAreaId(p: PortalEntity, inMatch: boolean): string | null {
  if (p.invisible && inMatch) return null;
  if (p.kind === PORTAL_KIND_WORMHOLE) return p._exit !== null && p._exit.areaId !== p.areaId ? p._exit.areaId : null;
  return p.destinationAreaId ? p.destinationAreaId : null;
}

export function portalLeadsSomewhere(p: PortalEntity): boolean {
  return p.kind === PORTAL_KIND_WORMHOLE ? p._exit !== null : p.destinationAreaId !== null || p.toMode !== '';
}
export function portalArrivalAreaId(p: PortalEntity): string | null {
  if (p.kind === PORTAL_KIND_WORMHOLE) return p._exit !== null ? p._exit.areaId : null;
  return p.destinationAreaId;
}

export function resolvePortalExits(portals: PortalEntity[]): void {
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];
    p._exit = null;
    if (p.kind !== PORTAL_KIND_WORMHOLE || p.exitPortalId < 0) continue;
    const area = p.exitAreaId === '' ? p.areaId : p.exitAreaId;
    for (let j = 0; j < portals.length; j++) {
      const q = portals[j];
      if (q !== p && q.id === p.exitPortalId && q.areaId === area) { p._exit = q; break; }
    }
  }
}

export function spawnableTilesOf(tileGrid: Uint8Array): number[] {
  const spawnableTiles: number[] = [];
  for (let i = 0; i < tileGrid.length; i++) {
    const t = tileGrid[i];
    if (t === TileType.NORMAL || t === TileType.SPAWN_AREA ||
        t === TileType.BASE_BLUE || t === TileType.BASE_RED ||
        t === TileType.BASE_GREEN || t === TileType.BASE_PURPLE) {
      spawnableTiles.push(i);
    }
  }
  return spawnableTiles;
}
export function baseZonesOf(tileGrid: Uint8Array, gc: number, gcY: number, cellSize: number, mapHalf: number, mapHalfY: number): { baseZones: BaseZoneRect[]; connectedBases: BaseZoneRect[]; connectedBaseLabel: Int32Array } {
  const baseZones: BaseZoneRect[] = [];
  const connectedBases: BaseZoneRect[] = [];
  let connectedBaseLabel = new Int32Array(0);
    const baseMinX: number[] = [Infinity, Infinity, Infinity, Infinity];
    const baseMinY: number[] = [Infinity, Infinity, Infinity, Infinity];
    const baseMaxX: number[] = [-Infinity, -Infinity, -Infinity, -Infinity];
    const baseMaxY: number[] = [-Infinity, -Infinity, -Infinity, -Infinity];
    const baseTypes = [TileType.BASE_BLUE, TileType.BASE_RED, TileType.BASE_GREEN, TileType.BASE_PURPLE];
    for (let gx = 0; gx < gc; gx++) {
      for (let gy = 0; gy < gcY; gy++) {
        const t = tileGrid[gx * gcY + gy];
        for (let b = 0; b < baseTypes.length; b++) {
          if (t === baseTypes[b]) {
            const wxMin = -mapHalf + gx * cellSize;
            const wyMin = -mapHalfY + gy * cellSize;
            if (wxMin < baseMinX[b]) baseMinX[b] = wxMin;
            if (wyMin < baseMinY[b]) baseMinY[b] = wyMin;
            if (wxMin + cellSize > baseMaxX[b]) baseMaxX[b] = wxMin + cellSize;
            if (wyMin + cellSize > baseMaxY[b]) baseMaxY[b] = wyMin + cellSize;
          }
        }
      }
    }
    for (let b = 0; b < baseTypes.length; b++) {
      if (baseMinX[b] < Infinity) {
        const _bTeam = getBaseTeamFromTile(baseTypes[b]);
        if (_bTeam !== null) {
          baseZones.push({
            minX: baseMinX[b], minY: baseMinY[b],
            maxX: baseMaxX[b], maxY: baseMaxY[b],
            team: _bTeam,
          });
        }
      }
    }

    if (baseZones.length > 0) {
      const n = gc * gcY;
      if (_cbSeen.length < n) { _cbSeen = new Uint8Array(n); _cbQueue = new Int32Array(n); }
      else _cbSeen.fill(0, 0, n);
      connectedBaseLabel = new Int32Array(n);
      for (let b = 0; b < baseTypes.length; b++) {
        const bt = baseTypes[b];
        const team = getBaseTeamFromTile(bt);
        if (team === null) continue;
        for (let s = 0; s < n; s++) {
          if (tileGrid[s] !== bt || _cbSeen[s] !== 0) continue;
          let head = 0, tail = 0;
          const lab = connectedBases.length + 1;
          _cbQueue[tail++] = s; _cbSeen[s] = 1;
          let gx0 = gc, gx1 = -1, gy0 = gcY, gy1 = -1;
          while (head < tail) {
            const c = _cbQueue[head++];
            connectedBaseLabel[c] = lab;
            const cx = (c / gcY) | 0, cy = c - cx * gcY;
            if (cx < gx0) gx0 = cx;
            if (cx > gx1) gx1 = cx;
            if (cy < gy0) gy0 = cy;
            if (cy > gy1) gy1 = cy;
            if (cx > 0)       { const m = c - gcY; if (_cbSeen[m] === 0 && tileGrid[m] === bt) { _cbSeen[m] = 1; _cbQueue[tail++] = m; } }
            if (cx < gc - 1)  { const m = c + gcY; if (_cbSeen[m] === 0 && tileGrid[m] === bt) { _cbSeen[m] = 1; _cbQueue[tail++] = m; } }
            if (cy > 0)       { const m = c - 1;   if (_cbSeen[m] === 0 && tileGrid[m] === bt) { _cbSeen[m] = 1; _cbQueue[tail++] = m; } }
            if (cy < gcY - 1) { const m = c + 1;   if (_cbSeen[m] === 0 && tileGrid[m] === bt) { _cbSeen[m] = 1; _cbQueue[tail++] = m; } }
          }
          const wx0 = -mapHalf + gx0 * cellSize, wy0 = -mapHalfY + gy0 * cellSize;
          const wx1 = -mapHalf + gx1 * cellSize, wy1 = -mapHalfY + gy1 * cellSize;
          connectedBases.push({ minX: wx0, minY: wy0, maxX: wx1 + cellSize, maxY: wy1 + cellSize, team });
        }
      }
    }
  return { baseZones, connectedBases, connectedBaseLabel };
}

export function rockGridOf(rocks: RockEntity[], gc: number, gcY: number, cellSize: number, mapHalf: number, mapHalfY: number): Int16Array {
  const TANK_RADIUS_ESTIMATE = 25;
  const HALF_DIAG = cellSize * 0.70710678;
  const rockGrid = new Int16Array(gc * gcY).fill(-1);
  for (let ri = 0; ri < rocks.length; ri++) {
    const rock = rocks[ri];
    if (!rock.active) continue;
    const effR = rock.size + TANK_RADIUS_ESTIMATE - HALF_DIAG;
    if (effR <= 0) continue;
    const effR2 = effR * effR;
    const minGx = Math.max(0, Math.floor((rock.x - effR + mapHalf) / cellSize));
    const maxGx = Math.min(gc - 1, Math.floor((rock.x + effR + mapHalf) / cellSize));
    const minGy = Math.max(0, Math.floor((rock.y - effR + mapHalfY) / cellSize));
    const maxGy = Math.min(gcY - 1, Math.floor((rock.y + effR + mapHalfY) / cellSize));
    for (let gx = minGx; gx <= maxGx; gx++) {
      const cx = -mapHalf + (gx + 0.5) * cellSize;
      const dx = cx - rock.x;
      for (let gy = minGy; gy <= maxGy; gy++) {
        const cy = -mapHalfY + (gy + 0.5) * cellSize;
        const dy = cy - rock.y;
        if (dx * dx + dy * dy < effR2) {
          const idx = gx * gcY + gy;
          if (rockGrid[idx] < 0) rockGrid[idx] = ri;
        }
      }
    }
  }
  return rockGrid;
}
export function generateMap(config: MapConfig, forFill = false): MapState {
  const { cellSize, mapHalf: snappedHalf, mapHalfY: snappedHalfY } = computeMapDimensions(config);
  const plan = mazeGridPlan(config);
  let gc = plan.gcX;
  let gcY = plan.gcY;
  let mapHalf = snappedHalf;
  let mapHalfY = snappedHalfY;

  const isCustom = config.mazeType === MAZE_TYPE_CUSTOM;

  let tileGrid = new Uint8Array(gc * gcY);
  let wallGrid = new Int16Array(gc * gcY).fill(-1);

  const walls: WallEntity[] = [];
  let seedUsed = config.seed;
  const magic: MagicLattice[] = [];
  let spawnEdge = 0;
  if (config.enableMaze && !isCustom && MAGIC_MAZE.ON && config.mazeType === MAGIC_MAZE_TYPE) {
    const L = latticeIn(0, 0, gc, gcY, magicMazeOf(config), config.seed);
    if (L !== null) { layMagicWalls(L, null, tileGrid, wallGrid, walls, gcY, cellSize, mapHalf, mapHalfY); magic.push(L); spawnEdge = L.cfg.edge; }
  } else if (config.enableMaze && !isCustom) {
    const run = plan.arras
      ? runMazeGenerator(gc, config.mazeType, config.seed, config.erosionIntensity ?? 1.0, plan.growW, plan.growH)
      : runMazeGenerator(gc, config.mazeType, config.seed, config.erosionIntensity ?? 1.0);
    const squares = run.squares;
    seedUsed = run.seedUsed;
    const genDims = { width: run.width, height: run.height };
    let scaleX: number, scaleY: number, offX = 0, offY = 0;
    if (plan.arras) {
      scaleX = plan.k;
      scaleY = plan.k;
      offX = Math.max(0, Math.floor((gc - genDims.width * plan.k) / 2));
      offY = Math.max(0, Math.floor((gcY - genDims.height * plan.k) / 2));
    } else {
      const nativeGc = Math.max(genDims.width, genDims.height);
      if (nativeGc > gc) {
        gc = nativeGc;
        gcY = nativeGc;
        mapHalf = mapHalfOf(cellSize, gc);
        mapHalfY = mapHalf;
        tileGrid = new Uint8Array(gc * gcY);
        wallGrid = new Int16Array(gc * gcY).fill(-1);
      }
      scaleX = gc / genDims.width;
      scaleY = gcY / genDims.height;
    }

    const occupiedCells = new Uint8Array(gc * gcY);

    for (let i = 0; i < squares.length; i++) {
      const sq = squares[i];
      const sqX = offX + Math.floor(sq.x * scaleX);
      const sqY = offY + Math.floor(sq.y * scaleY);
      const sqEndX = Math.min(gc, offX + Math.floor((sq.x + sq.size) * scaleX));
      const sqEndY = Math.min(gcY, offY + Math.floor((sq.y + sq.size) * scaleY));
      const sqW = sqEndX - sqX;
      const sqH = sqEndY - sqY;
      if (sqW <= 0 || sqH <= 0) continue;

      let alreadyFull = true;
      for (let gx = sqX; gx < sqEndX && alreadyFull; gx++) {
        for (let gy = sqY; gy < sqEndY && alreadyFull; gy++) {
          if (!occupiedCells[gx * gcY + gy]) alreadyFull = false;
        }
      }
      if (alreadyFull) continue;
      if (walls.length >= WALL_ID_MAX) break;

      const halfW = (sqW * cellSize) / 2;
      const halfH = (sqH * cellSize) / 2;
      const wx = -mapHalf + sqX * cellSize + halfW;
      const wy = -mapHalfY + sqY * cellSize + halfH;

      const wall: WallEntity = {
        x: wx, y: wy,
        halfW, halfH,
        type: TileType.WALL,
        health: Infinity,
        maxHealth: Infinity,
        active: true,
        lookDx: 0, lookDy: 0,
      };
      const wIdx = walls.length;
      walls.push(wall);

      for (let gx = sqX; gx < sqEndX; gx++) {
        for (let gy = sqY; gy < sqEndY; gy++) {
          const idx = gx * gcY + gy;
          tileGrid[idx] = TileType.WALL;
          wallGrid[idx] = wIdx;
          occupiedCells[idx] = 1;
        }
      }
    }
  }

  const overrideKeys = isCustom ? _noKeys : Object.keys(config.tileOverrides);
  const staleDeletes = !isCustom && !mapTweaksLive(config);
  const updatedWalls = new Set<number>();
  const paintedBase: SpawnZoneRect[] = [];
  for (let i = 0; i < overrideKeys.length; i++) {
    const key = overrideKeys[i];
    const parts = key.split(',');
    const gx = parseInt(parts[0], 10);
    const gy = parseInt(parts[1], 10);
    if (gx >= 0 && gx < gc && gy >= 0 && gy < gcY) {
      const newType = config.tileOverrides[key];
      if (staleDeletes && newType === TileType.NORMAL) continue;
      const idx = gx * gcY + gy;
      if (isWallType(newType) && walls.length >= WALL_ID_MAX && !(wallGrid[idx] >= 0 && walls[wallGrid[idx]]?.active)) continue;
      tileGrid[idx] = newType;

      if (isWallType(newType)) {
        const existingWallIdx = wallGrid[idx];
        if (existingWallIdx >= 0 && walls[existingWallIdx] && walls[existingWallIdx].active) {
          if (!updatedWalls.has(existingWallIdx)) {
            const w = walls[existingWallIdx];
            w.type = newType;
            w.health = Infinity;
            w.maxHealth = Infinity;
            updatedWalls.add(existingWallIdx);
            const startGx = Math.round((w.x - w.halfW + mapHalf) / cellSize);
            const startGy = Math.round((w.y - w.halfH + mapHalfY) / cellSize);
            const endGx = Math.round((w.x + w.halfW + mapHalf) / cellSize);
            const endGy = Math.round((w.y + w.halfH + mapHalfY) / cellSize);
            for (let cx = startGx; cx < endGx; cx++) {
              for (let cy = startGy; cy < endGy; cy++) {
                if (cx >= 0 && cx < gc && cy >= 0 && cy < gcY) {
                  tileGrid[cx * gcY + cy] = newType;
                }
              }
            }
          }
        } else {
          const halfW = cellSize / 2;
          const wx = -mapHalf + gx * cellSize + halfW;
          const wy = -mapHalfY + gy * cellSize + halfW;
          const wall: WallEntity = {
            x: wx, y: wy,
            halfW, halfH: halfW,
            type: newType,
            health: Infinity,
            maxHealth: Infinity,
            active: true,
            lookDx: 0, lookDy: 0,
          };
          const wIdx = walls.length;
          walls.push(wall);
          wallGrid[idx] = wIdx;
        }
      } else if (newType === TileType.NORMAL) {
        const existingWallIdx = wallGrid[idx];
        if (existingWallIdx >= 0 && walls[existingWallIdx] && !updatedWalls.has(existingWallIdx)) {
          const w = walls[existingWallIdx];
          w.active = false;
          updatedWalls.add(existingWallIdx);
          const startGx = Math.round((w.x - w.halfW + mapHalf) / cellSize);
          const startGy = Math.round((w.y - w.halfH + mapHalfY) / cellSize);
          const endGx = Math.round((w.x + w.halfW + mapHalf) / cellSize);
          const endGy = Math.round((w.y + w.halfH + mapHalfY) / cellSize);
          for (let cx = startGx; cx < endGx; cx++) {
            for (let cy = startGy; cy < endGy; cy++) {
              if (cx >= 0 && cx < gc && cy >= 0 && cy < gcY) {
                const cellIdx = cx * gcY + cy;
                wallGrid[cellIdx] = -1;
                tileGrid[cellIdx] = TileType.NORMAL;
              }
            }
          }
        }
        wallGrid[idx] = -1;
      } else if (newType >= TileType.BASE_BLUE && newType <= TileType.BASE_PURPLE) {
        paintedBase.push({ gxStart: gx, gyStart: gy, gxEnd: gx + 1, gyEnd: gy + 1, type: newType, anchorX: 0, anchorY: 0 });
      }
    }
  }
  if (paintedBase.length > 0) carveZoneRects(tileGrid, wallGrid, walls, paintedBase, gc, cellSize, mapHalf, gcY, mapHalfY);

  const _placedWalls = editWalls(config);
  for (let i = 0; i < _placedWalls.length; i++) {
    const pw = _placedWalls[i];
    const cw = pw.cw, ch = pw.ch;
    if (cw < 1 || ch < 1) continue;
    if (pw.gx < 0 || pw.gy < 0 || pw.gx + cw > gc || pw.gy + ch > gcY) continue;
    let blocked = false;
    for (let x = pw.gx; x < pw.gx + cw && !blocked; x++) {
      for (let y = pw.gy; y < pw.gy + ch && !blocked; y++) {
        if (tileGrid[x * gcY + y] !== TileType.NORMAL) blocked = true;
      }
    }
    if (blocked) continue;
    if (walls.length >= WALL_ID_MAX) break;
    const halfW = (cw * cellSize) / 2;
    const halfH = (ch * cellSize) / 2;
    const wIdx = walls.length;
    walls.push({
      x: -mapHalf + pw.gx * cellSize + halfW,
      y: -mapHalfY + pw.gy * cellSize + halfH,
      halfW, halfH,
      type: TileType.WALL,
      health: Infinity,
      maxHealth: Infinity,
      active: true,
      lookDx: typeof pw.lookGx === 'number' ? (pw.lookGx - pw.gx) * cellSize : 0,
      lookDy: typeof pw.lookGy === 'number' ? (pw.lookGy - pw.gy) * cellSize : 0,
      ...(config.wallBlocks === true ? { block: cellSize } : {}),
    });
    if (MISSING_MODES.ON !== 0 && pw.paint !== undefined) _paintOn(walls[wIdx], pw.paint, false);
    for (let x = pw.gx; x < pw.gx + cw; x++) {
      for (let y = pw.gy; y < pw.gy + ch; y++) {
        const idx = x * gcY + y;
        tileGrid[idx] = TileType.WALL;
        wallGrid[idx] = wIdx;
      }
    }
  }

  if (BASE_AREAS.ON !== 0) {
    const _baseRects = baseAreaRects(config, gc, gcY, cellSize, mapHalf, mapHalfY);
    if (!isCustom && config.enableSpawnAreas) for (const r of computeSpawnZoneRects(config, gc, config.spawnAreaTeamCount ?? 2, gcY)) _baseRects.push(r);
    if (_baseRects.length > 0) carveZoneRects(tileGrid, wallGrid, walls, _baseRects, gc, cellSize, mapHalf, gcY, mapHalfY);
  } else if (isCustom) {
    const _customRects = customZoneRects(config, gc, gcY);
    if (_customRects.length > 0) {
      carveZoneRects(tileGrid, wallGrid, walls, _customRects, gc, cellSize, mapHalf, gcY, mapHalfY);
    }
  } else if (config.enableSpawnAreas) {
    const teamCount = config.spawnAreaTeamCount ?? 2;
    generateSpawnZones(tileGrid, wallGrid, walls, gc, teamCount, cellSize, mapHalf, config, gcY, mapHalfY);
  }

  {
    const _open: SpawnZoneRect[] = [];
    for (const z of editZones(config)) {
      if ((z as { clearWalls?: boolean }).clearWalls !== true) continue;
      const _sh = SMALL_FIX.GH503 ? zoneShapeOf(z) : null;
      if (_sh !== null) {
        const _poly = shapeWorldPoly(_sh, cellSize, -mapHalf, -mapHalfY);
        const x0 = Math.max(0, z.gx), y0 = Math.max(0, z.gy), x1 = Math.min(gc, z.gx + z.cw), y1 = Math.min(gcY, z.gy + z.ch);
        for (let cx = x0; cx < x1; cx++) for (let cy = y0; cy < y1; cy++)
          if (polyHas(_poly, -mapHalf + (cx + 0.5) * cellSize, -mapHalfY + (cy + 0.5) * cellSize)) _open.push({ gxStart: cx, gyStart: cy, gxEnd: cx + 1, gyEnd: cy + 1, type: TileType.NORMAL, anchorX: 0, anchorY: 0 });
        continue;
      }
      for (const q of [z, ...(z.more ?? [])]) {
        const gxStart = Math.max(0, q.gx), gyStart = Math.max(0, q.gy), gxEnd = Math.min(gc, q.gx + q.cw), gyEnd = Math.min(gcY, q.gy + q.ch);
        if (gxEnd > gxStart && gyEnd > gyStart) _open.push({ gxStart, gyStart, gxEnd, gyEnd, type: TileType.NORMAL, anchorX: 0, anchorY: 0 });
      }
    }
    if (_open.length > 0) carveZoneRects(tileGrid, wallGrid, walls, _open, gc, cellSize, mapHalf, gcY, mapHalfY);
  }
  const _fills = forFill ? [] : fillsOf(config, gc, gcY, cellSize, mapHalf, mapHalfY);
  for (const f of _fills) if (f.fill.k === 'maze') applyMazeFill(f, config, tileGrid, wallGrid, walls, gc, gcY, cellSize, mapHalf, mapHalfY, magic);
  const _doorCells = forFill ? null : buildDoorWalls(config, tileGrid, wallGrid, walls, gc, gcY, cellSize, mapHalf, mapHalfY);

  for (const L of magic) for (let i = 0; i < L.nx; i++) for (let j = 0; j < L.ny; j++) {
    const idx = (L.gx0 + i) * gcY + (L.gy0 + j), wi = wallGrid[idx];
    if (wi >= 0 && walls[wi].active && mmOpenKind(walls[wi].kind)) { wallGrid[idx] = -1; const f = L.floor[i * L.ny + j]; tileGrid[idx] = f === 255 ? TileType.NORMAL : f; }
  }
  const spawnableTiles = spawnableTilesOf(tileGrid);
  if (_doorCells !== null && _doorCells.size > 0) { let n = 0; for (let i = 0; i < spawnableTiles.length; i++) if (!_doorCells.has(spawnableTiles[i])) spawnableTiles[n++] = spawnableTiles[i]; spawnableTiles.length = n; }

  const spawnZoneAABBs: { xMin: number; yMin: number; xMax: number; yMax: number }[] = [];
  const { baseZones, connectedBases, connectedBaseLabel } = baseZonesOf(tileGrid, gc, gcY, cellSize, mapHalf, mapHalfY);
  {
    if (baseZones.length > 0) {
      for (let i = 0; i < connectedBases.length; i++) {
        const cb = connectedBases[i];
        spawnZoneAABBs.push({ xMin: cb.minX, yMin: cb.minY, xMax: cb.maxX, yMax: cb.maxY });
      }
    }
  }

  const rockCandidateTiles: number[] = [];
  for (let i = 0; i < spawnableTiles.length; i++) {
    const t = tileGrid[spawnableTiles[i]];
    if (t === TileType.NORMAL) rockCandidateTiles.push(spawnableTiles[i]);
  }
  const rocks: RockEntity[] = [];
  const genKinds: string[] = [];

  const outsidePlayfield = (x: number, y: number, r: number): boolean => outsidePlayfieldOf(x, y, r, mapHalf, mapHalfY);

  if (config.enableRocks && !isCustom && rockCandidateTiles.length > 0) {
    const prng = mulberry32(config.seed + 7777);
    const rockPattern = config.rockPattern ?? 'random';
    const count = config.rockDensity;
    const typeArr = config.rockTypes;
    const variation = (config.rockSizeVariation ?? 50) / 100;
    const useExclusion = rockPattern === 'center' ? false : (config.rockExclusionZone ?? false);
    const exclHalf = useExclusion
      ? mapHalf * Math.sqrt((config.rockExclusionSize ?? 10) / 100)
      : 0;
    const exclHalfY = mapHalfY === mapHalf ? exclHalf : (useExclusion ? mapHalfY * Math.sqrt((config.rockExclusionSize ?? 10) / 100) : 0);

    const pickRock = (): { shape: number; size: number; kind: string } => {
      const rockType = typeArr[Math.floor(prng() * typeArr.length)] || 'rock';
      let shape: number;
      let baseSize: number;
      if (rockType === 'rock') { shape = -9; baseSize = GEN_ROCK_SIZES.rock; }
      else if (rockType === 'stone') { shape = -7; baseSize = GEN_ROCK_SIZES.stone; }
      else { shape = -7; baseSize = GEN_ROCK_SIZES.gravel; }
      const sizeMult = 1 - variation * 0.5 + prng() * variation;
      return { shape, size: baseSize * sizeMult, kind: rockType };
    };

    const inExclusion = (x: number, y: number): boolean =>
      useExclusion && Math.abs(x) < exclHalf && Math.abs(y) < exclHalfY;

    const inSpawnZone = (x: number, y: number, r: number): boolean => {
      const checkR = 10 + r;
      for (let z = 0; z < spawnZoneAABBs.length; z++) {
        const zone = spawnZoneAABBs[z];
        if (x + checkR > zone.xMin && x - checkR < zone.xMax &&
            y + checkR > zone.yMin && y - checkR < zone.yMax) return true;
      }
      return false;
    };

    const tooCloseToExisting = (x: number, y: number, r: number): boolean => {
      const checkR = 10 + r;
      for (let j = 0; j < rocks.length; j++) {
        const e = rocks[j];
        if (Math.abs(x - e.x) < checkR + e.size && Math.abs(y - e.y) < checkR + e.size) return true;
      }
      return false;
    };

    const touchesWall = (x: number, y: number, r: number): boolean => {
      if (MAP_RULES.ROCK_NO_OVERLAP === 0) return false;
      const m = 10 + r, hs = cellSize / 2;
      const gx0 = Math.max(0, Math.floor((x - m + mapHalf) / cellSize)), gx1 = Math.min(gc - 1, Math.floor((x + m + mapHalf) / cellSize));
      const gy0 = Math.max(0, Math.floor((y - m + mapHalfY) / cellSize)), gy1 = Math.min(gcY - 1, Math.floor((y + m + mapHalfY) / cellSize));
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
        if (tileGrid[gx * gcY + gy] !== TileType.WALL) continue;
        const cx = -mapHalf + (gx + 0.5) * cellSize, cy = -mapHalfY + (gy + 0.5) * cellSize;
        if (Math.abs(x - cx) < m + hs && Math.abs(y - cy) < m + hs) return true;
      }
      return false;
    };

    const isSpawnableTile = (wx: number, wy: number): boolean => {
      const gx = Math.floor((wx + mapHalf) / cellSize);
      const gy = Math.floor((wy + mapHalfY) / cellSize);
      if (gx < 0 || gx >= gc || gy < 0 || gy >= gcY) return false;
      const t = tileGrid[gx * gcY + gy];
      return t === TileType.NORMAL;
    };

    if (rockPattern === 'tiles') {
      const s = rockTilesOf(config.rockTiles);
      const cols = Math.floor((mapHalf * 2) / s.tile), rows = Math.floor((mapHalfY * 2) / s.tile);
      const ox = -cols * s.tile / 2, oy = -rows * s.tile / 2;
      const leftOutT: readonly string[] = config.rocksLeftOut ?? [];
      const kindsT = (['rock', 'stone', 'gravel'] as const).filter(k => typeArr.includes(k) && !leftOutT.includes(k));
      const placedTiles = placeRockTiles(s, cols, rows, prng, 0, kindsT);
      for (let i = 0; i < placedTiles.length; i++) {
        const p = placedTiles[i];
        const rx = ox + p.cx * s.tile, ry = oy + p.cy * s.tile;
        if (inExclusion(rx, ry)) continue;
        if (!isSpawnableTile(rx, ry)) continue;
        if (inSpawnZone(rx, ry, p.size)) continue;
        if (touchesWall(rx, ry, p.size)) continue;
        rocks.push({
          x: rx, y: ry, size: p.size, shape: rockShapeFor(p.kind), rotation: 0,
          health: ROCK_HP, maxHealth: ROCK_HP, shield: ROCK_SHIELD, active: true, lookDx: 0, lookDy: 0,
        });
        genKinds.push(p.kind);
      }
    } else if (isRockFormation(rockPattern)) {
      const f = ROCK_FORMATIONS[rockPattern as RockFormationWord];
      const tw = (mapHalf * 2) / f.across, th = (mapHalfY * 2) / f.across;
      const on: (readonly [number, number, number])[] = [];
      let usual = 0;
      for (let i = 0; i < f.tiles.length; i++) {
        const t = f.tiles[i];
        usual += t[2];
        if (t[2] >= 1 || prng() < t[2]) on.push(t);
      }
      const spread = count === f.mean ? f.count[1] - f.count[0] : 0;
      const wanted = Math.round((count * on.length) / Math.max(1, usual)) + (usual === f.tiles.length && spread > 0 ? Math.floor(prng() * (spread + 1)) - Math.floor(spread / 2) : 0);
      const leftOut: readonly string[] = config.rocksLeftOut ?? [];
      const useKind = (k: 'rock' | 'stone' | 'gravel') => typeArr.includes(k) && !leftOut.includes(k);
      const mRock = useKind('rock') ? ARRAS_ROCK_MIX.rock : 0, mStone = useKind('stone') ? ARRAS_ROCK_MIX.stone : 0, mGravel = useKind('gravel') ? ARRAS_ROCK_MIX.gravel : 0;
      const mAll = mRock + mStone + mGravel;
      if (mAll > 0 && on.length > 0) {
        const deal = SMALL_FIX.R868 !== 0 ? dealRockKinds(wanted, rockDealOf(rockPattern), useKind, prng) : null;
        let placed = 0;
        for (let att = 0; placed < wanted && att < wanted * 200; att++) {
          const t = on[Math.floor(prng() * on.length)];
          let kind: 'rock' | 'stone' | 'gravel';
          if (deal) kind = deal[placed];
          else { const roll = prng() * mAll; kind = roll < mGravel ? 'gravel' : roll < mGravel + mStone ? 'stone' : 'rock'; }
          const size = ARRAS_ROCK_SIZES[kind] * (1 - variation * 0.5 + prng() * variation);
          const rx = Math.max(-mapHalf + size, Math.min(mapHalf - size, -mapHalf + (t[0] + prng()) * tw));
          const ry = Math.max(-mapHalfY + size, Math.min(mapHalfY - size, -mapHalfY + (t[1] + prng()) * th));
          if (inExclusion(rx, ry)) continue;
          if (!isSpawnableTile(rx, ry)) continue;
          if (inSpawnZone(rx, ry, size)) continue;
          if (touchesWall(rx, ry, size)) continue;
          if (SMALL_FIX.R868 !== 0 ? rockCircleTooNear(rocks, rx, ry, size) : tooCloseToExisting(rx, ry, size)) continue;
          rocks.push({ x: rx, y: ry, size, shape: kind === 'rock' ? -9 : -7, rotation: 0, health: ROCK_HP, maxHealth: ROCK_HP, shield: ROCK_SHIELD, active: true, lookDx: 0, lookDy: 0 });
          genKinds.push(kind);
          placed++;
        }
      }
    } else if (rockPattern === 'scattered') {
      const cols = Math.max(1, Math.round(Math.sqrt(mapHalfY === mapHalf ? count : count * (mapHalf / mapHalfY))));
      const rows = Math.max(1, Math.round(count / cols));
      const sCellW = (mapHalf * 2) / cols;
      const sCellH = (mapHalfY * 2) / rows;

      for (let row = 0; row < rows && rocks.length < count; row++) {
        for (let col = 0; col < cols && rocks.length < count; col++) {
          let rx = 0, ry = 0;
          let placed = false;
          for (let att = 0; att < 200; att++) {
            rx = -mapHalf + col * sCellW + prng() * sCellW;
            ry = -mapHalfY + row * sCellH + prng() * sCellH;
            if (inExclusion(rx, ry)) continue;
            if (!isSpawnableTile(rx, ry)) continue;
            const { shape, size, kind } = pickRock();
            if (inSpawnZone(rx, ry, size)) continue;
            if (outsidePlayfield(rx, ry, size)) continue;
            if (touchesWall(rx, ry, size)) continue;
            if (tooCloseToExisting(rx, ry, size)) continue;
            rocks.push({
              x: rx, y: ry, size, shape, rotation: 0,
              health: ROCK_HP, maxHealth: ROCK_HP, shield: ROCK_SHIELD, active: true, lookDx: 0, lookDy: 0,
            });
            genKinds.push(kind);
            placed = true;
            break;
          }
          if (!placed) { pickRock(); }
        }
      }
    } else {
      let candidateTiles: number[];
      if (rockPattern === 'random' || rockPattern === 'pumpkinPatch') {
        candidateTiles = rockCandidateTiles;
      } else {
        candidateTiles = [];
        const centerG = gc / 2;
        const maxR = gc / 2;
        const centerGY = gcY / 2;
        for (let t = 0; t < rockCandidateTiles.length; t++) {
          const idx = rockCandidateTiles[t];
          const gx = Math.floor(idx / gcY);
          const gy = idx % gcY;
          const nx = gx / gc;
          const ny = gy / gcY;
          const dx = gx - centerG;
          const dy = gy - centerGY;
          const distR = gc === gcY
            ? Math.sqrt(dx * dx + dy * dy) / maxR
            : Math.sqrt((dx / centerG) * (dx / centerG) + (dy / centerGY) * (dy / centerGY));

          let include = false;
          if (rockPattern === 'corners') {
            include = (nx < 0.2 || nx > 0.8) && (ny < 0.2 || ny > 0.8);
          } else if (rockPattern === 'edges') {
            include = nx < 0.1 || nx > 0.9 || ny < 0.1 || ny > 0.9;
          } else if (rockPattern === 'ring') {
            include = distR >= 0.25 && distR <= 0.4;
          } else if (rockPattern === 'center') {
            include = distR <= 0.2;
          }
          if (include) candidateTiles.push(idx);
        }
        if (candidateTiles.length < 5) candidateTiles = rockCandidateTiles;
      }

      const maxCount = Math.min(count, candidateTiles.length * 3);
      let placed = 0;
      let globalAttempts = 0;
      const maxGlobalAttempts = maxCount * 200;

      while (placed < maxCount && globalAttempts < maxGlobalAttempts) {
        globalAttempts++;
        const tileIdx = candidateTiles[Math.floor(prng() * candidateTiles.length)];
        const gx = Math.floor(tileIdx / gcY);
        const gy = tileIdx % gcY;
        const rx = -mapHalf + gx * cellSize + prng() * cellSize;
        const ry = -mapHalfY + gy * cellSize + prng() * cellSize;

        if (inExclusion(rx, ry)) continue;

        const { shape, size, kind } = pickRock();
        if (inSpawnZone(rx, ry, size)) continue;
        if (outsidePlayfield(rx, ry, size)) continue;
        if (touchesWall(rx, ry, size)) continue;
        if (tooCloseToExisting(rx, ry, size)) continue;

        rocks.push({
          x: rx, y: ry, size, shape, rotation: 0,
          health: ROCK_HP, maxHealth: ROCK_HP, shield: ROCK_SHIELD, active: true, lookDx: 0, lookDy: 0,
        });
        genKinds.push(kind);
        placed++;
      }
    }
  }

  if (_fills.length > 0) applyRockFills(_fills, config, rocks, genKinds, tileGrid, gc, gcY, cellSize, mapHalf, mapHalfY);

  const _removedRockKeys = editRemovedRockKeys(config);
  if (_removedRockKeys.length > 0 && rocks.length > 0) {
    const removed = new Set(_removedRockKeys);
    const _oldDX = SMALL_FIX.CH035 !== 0 ? Math.ceil(mapHalf / GRID_SPACING) * GRID_SPACING - mapHalf : 0;
    const _oldDY = SMALL_FIX.CH035 !== 0 ? Math.ceil(mapHalfY / GRID_SPACING) * GRID_SPACING - mapHalfY : 0;
    const _oldFrame = _oldDX !== 0 || _oldDY !== 0;
    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i];
      if (removed.has(generatedRockKey(r.x, r.y)) || (_oldFrame && removed.has(generatedRockKey(r.x - _oldDX, r.y - _oldDY)))) {
        rocks.splice(i, 1); genKinds.splice(i, 1);
      }
    }
  }
  const _leftOut = config.rocksLeftOut;
  if (_leftOut !== undefined && _leftOut.length > 0 && rocks.length > 0) {
    for (let i = rocks.length - 1; i >= 0; i--) if ((_leftOut as readonly string[]).includes(genKinds[i])) rocks.splice(i, 1);
  }

  const _placedRocks = editRocks(config);
  let _genRockEnd = rocks.length;
  const _noOverlap = MAP_RULES.ROCK_NO_OVERLAP !== 0;
  for (let i = 0; i < _placedRocks.length; i++) {
    const pr = _placedRocks[i];
    const rx = cellCoordToLocal(pr.cx, mapHalf, cellSize);
    const ry = cellCoordToLocal(pr.cy, mapHalfY, cellSize);
    if (rx - pr.size < -mapHalf || rx + pr.size > mapHalf ||
        ry - pr.size < -mapHalfY || ry + pr.size > mapHalfY) continue;
    if (_noOverlap) {
      let _onOwn = false;
      for (let k = _genRockEnd; k < rocks.length; k++) { const o = rocks[k], dx = rx - o.x, dy = ry - o.y, rr = pr.size + o.size; if (dx * dx + dy * dy < rr * rr) { _onOwn = true; break; } }
      if (_onOwn) continue;
      for (let k = _genRockEnd - 1; k >= 0; k--) { const o = rocks[k], cr = 10 + pr.size + o.size; if (Math.abs(rx - o.x) < cr && Math.abs(ry - o.y) < cr) { rocks.splice(k, 1); _genRockEnd--; } }
    }
    rocks.push({
      x: rx, y: ry,
      size: pr.size,
      shape: rockShapeFor(pr.kind),
      rotation: pr.rotation,
      health: ROCK_HP, maxHealth: ROCK_HP, shield: ROCK_SHIELD, active: true,
      lookDx: typeof pr.lookCx === 'number' ? (pr.lookCx - pr.cx) * cellSize : 0,
      lookDy: typeof pr.lookCy === 'number' ? (pr.lookCy - pr.cy) * cellSize : 0,
    });
    if (MISSING_MODES.ON !== 0 && pr.paint !== undefined) _paintOn(rocks[rocks.length - 1], pr.paint, false);
  }

  const rockGrid = rockGridOf(rocks, gc, gcY, cellSize, mapHalf, mapHalfY);

  const portals: PortalEntity[] = [];
  const _pp = PLACED_PORTALS.ON !== 0;
  const _rowsOn = isCustom || (_pp && !!config.mapPortals);
  const _rowsAll: readonly PlacedPortal[] = _rowsOn ? editPortals(config) : [];
  const _fixedRow = (pp: PlacedPortal): boolean => !_pp || (pp.appear === undefined ? isCustom : pp.appear === 'fixed');
  const _randomIds: number[] = [];
  const _needArea = new Set<PortalEntity>();
  const _rowsSay = SMALL_FIX.R911 !== 0 && _pp && !isCustom && !!config.mapPortals;
  const _willStandInArea = (id: number): boolean => (_pp && _rowsAll.some(r => r.id === id && r.appear === 'area' && typeof r.inArea === 'number'))
    || (MISSING_MODES.ON !== 0 && !isCustom && !_rowsSay && !!config.portalKinds && config.portalKinds.some(k => k.portalId === id && typeof k.inArea === 'number'));
  if (_rowsOn) { for (const pp of _rowsAll) if (!_fixedRow(pp)) _randomIds.push(pp.id); }
  else if (config.enablePortals) for (let i = 0; i < config.portalCount; i++) _randomIds.push(i);
  if (_rowsOn) {
    {
      const _placedPortals = _rowsAll;
      for (let i = 0; i < _placedPortals.length; i++) {
        const pp = _placedPortals[i];
        if (!_fixedRow(pp)) continue;
        if (pp.gx < 0 || pp.gy < 0 || pp.gx >= gc || pp.gy >= gcY) continue;
        const tileIdx = pp.gx * gcY + pp.gy;
        if (tileGrid[tileIdx] === TileType.WALL) continue;
        const _existingTile = tileGrid[tileIdx];
        if (_existingTile !== TileType.SPAWN_AREA &&
            !(_existingTile >= TileType.BASE_BLUE && _existingTile <= TileType.BASE_PURPLE)) {
          tileGrid[tileIdx] = TileType.PORTAL;
        }
        portals.push(makePortal(pp.id, pp.gx, pp.gy, cellSize, mapHalf, pp.staticPos, mapHalfY));
      }
    }
  }
  if (_randomIds.length > 0 && spawnableTiles.length > 0) {
    const portalEligibleTiles: number[] = [];
    for (let i = 0; i < spawnableTiles.length; i++) {
      if (tileGrid[spawnableTiles[i]] === TileType.NORMAL) {
        portalEligibleTiles.push(spawnableTiles[i]);
      }
    }
    const count = Math.min(_randomIds.length, portalEligibleTiles.length);
    const prng = Math.random;
    const usedIndices = new Set<number>();
    const minRockDist2 = (PORTAL_TILE_SIZE * 0.8) * (PORTAL_TILE_SIZE * 0.8);
    const portalEdgeRadius = PORTAL_TILE_SIZE * 0.5;
    const minPortalDist2 = (cellSize * 4) * (cellSize * 4);

    for (let p = 0; p < count; p++) {
      let tileIdx = -1;
      let portalGx = 0, portalGy = 0;

      for (let attempts = 0; attempts < 200; attempts++) {
        const tIdx = portalEligibleTiles[Math.floor(prng() * portalEligibleTiles.length)];
        if (usedIndices.has(tIdx)) continue;
        const gx = Math.floor(tIdx / gcY);
        const gy = tIdx % gcY;
        const px = -mapHalf + gx * cellSize + cellSize / 2;
        const py = -mapHalfY + gy * cellSize + cellSize / 2;
        if (
          (gx > 0 && tileGrid[(gx - 1) * gcY + gy] === TileType.WALL) ||
          (gx < gc - 1 && tileGrid[(gx + 1) * gcY + gy] === TileType.WALL) ||
          (gy > 0 && tileGrid[gx * gcY + (gy - 1)] === TileType.WALL) ||
          (gy < gcY - 1 && tileGrid[gx * gcY + (gy + 1)] === TileType.WALL)
        ) continue;
        if (outsidePlayfield(px, py, portalEdgeRadius)) continue;
        let blocked = false;
        for (let ri = 0; ri < rocks.length; ri++) {
          const dx = px - rocks[ri].x, dy = py - rocks[ri].y;
          if (dx * dx + dy * dy < minRockDist2) { blocked = true; break; }
        }
        if (blocked) continue;
        for (let pi = 0; pi < portals.length; pi++) {
          const dx = px - portals[pi].x, dy = py - portals[pi].y;
          if (dx * dx + dy * dy < minPortalDist2) { blocked = true; break; }
        }
        if (blocked) continue;
        tileIdx = tIdx; portalGx = gx; portalGy = gy;
        break;
      }

      if (tileIdx < 0) {
        for (let attempts = 0; attempts < 50; attempts++) {
          const tIdx = portalEligibleTiles[Math.floor(prng() * portalEligibleTiles.length)];
          if (usedIndices.has(tIdx)) continue;
          const gx = Math.floor(tIdx / gcY);
          const gy = tIdx % gcY;
          const px = -mapHalf + gx * cellSize + cellSize / 2;
          const py = -mapHalfY + gy * cellSize + cellSize / 2;
          if (
            (gx > 0 && tileGrid[(gx - 1) * gcY + gy] === TileType.WALL) ||
            (gx < gc - 1 && tileGrid[(gx + 1) * gcY + gy] === TileType.WALL) ||
            (gy > 0 && tileGrid[gx * gcY + (gy - 1)] === TileType.WALL) ||
            (gy < gcY - 1 && tileGrid[gx * gcY + (gy + 1)] === TileType.WALL)
          ) continue;
          if (outsidePlayfield(px, py, portalEdgeRadius)) continue;
          let blocked = false;
          for (let ri = 0; ri < rocks.length; ri++) {
            const dx = px - rocks[ri].x, dy = py - rocks[ri].y;
            if (dx * dx + dy * dy < minRockDist2) { blocked = true; break; }
          }
          if (blocked) continue;
          tileIdx = tIdx; portalGx = gx; portalGy = gy;
          break;
        }
      }

      if (tileIdx < 0) {
        for (let attempts = 0; attempts < 50; attempts++) {
          const tIdx = portalEligibleTiles[Math.floor(prng() * portalEligibleTiles.length)];
          if (usedIndices.has(tIdx)) continue;
          const gx = Math.floor(tIdx / gcY);
          const gy = tIdx % gcY;
          const px = -mapHalf + gx * cellSize + cellSize / 2;
          const py = -mapHalfY + gy * cellSize + cellSize / 2;
          if (
            (gx > 0 && tileGrid[(gx - 1) * gcY + gy] === TileType.WALL) ||
            (gx < gc - 1 && tileGrid[(gx + 1) * gcY + gy] === TileType.WALL) ||
            (gy > 0 && tileGrid[gx * gcY + (gy - 1)] === TileType.WALL) ||
            (gy < gcY - 1 && tileGrid[gx * gcY + (gy + 1)] === TileType.WALL)
          ) continue;
          if (outsidePlayfield(px, py, portalEdgeRadius)) continue;
          tileIdx = tIdx; portalGx = gx; portalGy = gy;
          break;
        }
      }

      if (tileIdx < 0) {
        if (SMALL_FIX.G647 !== 0 && _willStandInArea(_randomIds[p])) { const pe = makePortal(_randomIds[p], 0, 0, cellSize, mapHalf, false, mapHalfY); _needArea.add(pe); portals.push(pe); }
        continue;
      }

      usedIndices.add(tileIdx);

      const gx = portalGx;
      const gy = portalGy;
      const _existingTile = tileGrid[tileIdx];
      if (_existingTile !== TileType.SPAWN_AREA &&
          !(_existingTile >= TileType.BASE_BLUE && _existingTile <= TileType.BASE_PURPLE)) {
        tileGrid[tileIdx] = TileType.PORTAL;
      }

      portals.push(makePortal(_randomIds[p], gx, gy, cellSize, mapHalf, false, mapHalfY));
    }
  }

  if (config.portalLevels) {
    for (const lc of config.portalLevels) {
      const portal = portals.find(p => p.id === lc.portalId);
      if (portal) {
        portal.requireLevel = lc.requireLevel;
      }
    }
  }

  if (config.portalBotOdds) {
    for (const oc of config.portalBotOdds) {
      const portal = portals.find(p => p.id === oc.portalId);
      if (portal && Number.isFinite(oc.odds)) portal.botOdds = Math.max(0, Math.min(100, oc.odds));
      if (portal && MISSING_MODES.ON !== 0) {
        portal.botKnown = oc.known === true;
        portal.botHighLevel = typeof oc.highLevel === 'number' && Number.isFinite(oc.highLevel) ? Math.max(0, Math.round(oc.highLevel)) : 0;
        portal.botOddsHigh = typeof oc.oddsHigh === 'number' && Number.isFinite(oc.oddsHigh) ? Math.max(0, Math.min(100, oc.oddsHigh)) : portal.botOdds;
        portal.botDreadShare = typeof oc.dreadShare === 'number' && Number.isFinite(oc.dreadShare) ? Math.max(0, Math.min(100, oc.dreadShare)) : -1;
      }
    }
  }
  if (config.portalBossBlacklist) {
    for (const bc of config.portalBossBlacklist) {
      const portal = portals.find(p => p.id === bc.portalId);
      if (portal && typeof bc.on === 'boolean') portal.bossBlacklist = bc.on;
    }
  }

  if (config.portalTimings) {
    for (const tc of config.portalTimings) {
      const portal = portals.find(p => p.id === tc.portalId);
      if (portal) {
        portal.timed = tc.timed;
        portal.appearDuration = tc.appearDuration;
        portal.disappearDuration = tc.disappearDuration;
        portal.initialDelay = tc.initialDelay;
        if (portal.timed) {
          portal._timedActive = tc.initialDelay <= 0;
          if (!portal._timedActive) {
            portal._opacity = 0;
            portal._scale = 0;
          }
        }
      }
    }
  }

  if (config.portalKinds || (_pp && _rowsAll.some(r => r.appear === 'area'))) {
    const _inArea: PortalEntity[] = [];
    for (const kc of config.portalKinds ?? []) {
      const portal = portals.find(p => p.id === kc.portalId);
      if (portal) applyPortalKind(portal, kc);
      if (portal && MISSING_MODES.ON !== 0 && typeof kc.inArea === 'number' && !_rowsSay) {
        portal._inCells = portalAreaCells(config, kc.inArea, tileGrid, gc, gcY);
        _inGridOf.set(portal, { gcY, hx: mapHalf, hy: mapHalfY, cs: cellSize });
        if (portal._inCells !== null && portal._inCells.length > 0 && !isCustom) _inArea.push(portal);
      }
    }
    if (_pp) for (const pp of _rowsAll) {
      if (pp.appear !== 'area' || typeof pp.inArea !== 'number') continue;
      const portal = portals.find(q => q.id === pp.id);
      if (!portal || _inArea.includes(portal)) continue;
      portal._inCells = portalAreaCells(config, pp.inArea, tileGrid, gc, gcY);
      _inGridOf.set(portal, { gcY, hx: mapHalf, hy: mapHalfY, cs: cellSize });
      if (portal._inCells !== null && portal._inCells.length > 0) _inArea.push(portal);
    }
    if (_inArea.length > 0) {
      const ok = (c: number): boolean => { const cx = (c / gcY) | 0, cy = c - cx * gcY; return tileGrid[c] !== TileType.WALL && !_wallBeside(tileGrid, gc, gcY, cx, cy); };
      const put = (p: PortalEntity, c: number): void => { const gx = (c / gcY) | 0, gy = c - gx * gcY; p.x = -mapHalf + gx * cellSize + cellSize / 2; p.y = -mapHalfY + gy * cellSize + cellSize / 2; };
      let best: number[] | null = null, bestGap = -1;
      for (let attempt = 0; attempt < 40; attempt++) {
        for (const p of _inArea) p._placedInArea = false;
        const pick: number[] = [];
        let fit = true;
        for (const p of _inArea) {
          const cells = p._inCells!;
          let ci = -1;
          for (let k = 0; k < 40; k++) {
            const c = cells[(Math.random() * cells.length) | 0];
            if (!ok(c)) continue;
            const cx = (c / gcY) | 0, cy = c - cx * gcY;
            if (!_portalGapClear(p, -mapHalf + cx * cellSize + cellSize / 2, -mapHalfY + cy * cellSize + cellSize / 2, portals, true)) continue;
            ci = c; break;
          }
          if (ci < 0) { fit = false; ci = cells[(Math.random() * cells.length) | 0]; }
          put(p, ci); p._placedInArea = true; pick.push(ci);
        }
        let closest = Infinity;
        for (let i = 0; i < _inArea.length; i++) for (let j = i + 1; j < _inArea.length; j++) closest = Math.min(closest, Math.hypot(_inArea[i].x - _inArea[j].x, _inArea[i].y - _inArea[j].y));
        if (closest > bestGap) { bestGap = closest; best = pick; }
        if (fit) break;
      }
      if (best !== null) for (let i = 0; i < _inArea.length; i++) { put(_inArea[i], best[i]); _inArea[i]._placedInArea = true; }
    }
    if (_needArea.size > 0) for (let i = portals.length - 1; i >= 0; i--) if (_needArea.has(portals[i]) && !portals[i]._placedInArea) portals.splice(i, 1);
    resolvePortalExits(portals);
  }

  if (MISSING_MODES.ON !== 0) {
    for (const w of walls) {
      if (w.type !== TileType.WALL || w.door !== undefined || (w.kind !== undefined && w.kind !== 0)) continue;
      if (w.paintSlot === undefined && w.paintHex === undefined) _paintOn(w, config.wallPaint, true);
      if (config.wallBlocks === true && w.block === undefined) w.block = cellSize;
    }
    for (const r of rocks) if (r.paintSlot === undefined && r.paintHex === undefined) _paintOn(r, config.rockPaint, true);
  }

  const state: MapState = {
    walls,
    portals,
    rocks,
    customAreas: customAreasOf(config, gc, cellSize, mapHalf, gcY, mapHalfY),
    baseZones,
    connectedBases,
    connectedBaseLabel,
    tileGrid,
    wallGrid,
    rockGrid,
    rockBucketCell: 0,
    rockBucketDim: 0,
    rockBucketMinX: 0,
    rockBucketMinY: 0,
    rockBucketStart: new Int32Array(1),
    rockBucketIdx: new Int32Array(0),
    rockBucketCount: 0,
    spawnableTiles,
    mapHalf,
    mapHalfY,
    cellSize,
    gridCells: gc,
    gridCellsY: gcY,
    wallCanvasDirty: false,
    areaId: '',
    navigation: null,
    seedUsed,
    ...(magic.length > 0 ? { magic, spawnEdge } : {}),
  };

  buildRockBuckets(state);

  if (!forFill) state.navigation = createNavigationState(state);

  return state;
}

let _resizeSeq = 0;
const _mapLine = new WeakMap<MapState, number>();
const _resizedMaps = new WeakSet<MapState>();
export function isResizedMap(ms: MapState): boolean { return _resizedMaps.has(ms); }
export function mapLineOf(ms: MapState): number {
  let n = _mapLine.get(ms);
  if (n === undefined) { n = ++_resizeSeq; _mapLine.set(ms, n); }
  return n;
}
function portalAreaCells(config: MapConfig, uid: number, tileGrid: Uint8Array, gc: number, gcY: number): Int32Array | null {
  const zones = (config.mazeType === MAZE_TYPE_CUSTOM ? config.customMap?.zones : config.mapAreas?.zones) ?? [];
  const z = zones.find(q => q.uid === uid);
  if (!z) return null;
  const sh = SMALL_FIX.R912 !== 0 ? zoneShapeOf(z as unknown as Parameters<typeof zoneShapeOf>[0]) : null;
  const poly = sh !== null ? shapeWorldPoly(sh, 1, 0, 0) : null;
  const walk = (inside: boolean): { open: number[]; clear: number[] } => {
    const open: number[] = [], clear: number[] = [];
    const wallAt = (x: number, y: number) => x >= 0 && y >= 0 && x < gc && y < gcY && tileGrid[x * gcY + y] === TileType.WALL;
    for (const r of rectsOf(z as unknown as Parameters<typeof rectsOf>[0])) {
      for (let x = Math.max(0, r.gx); x < Math.min(gc, r.gx + r.cw); x++) for (let y = Math.max(0, r.gy); y < Math.min(gcY, r.gy + r.ch); y++) {
        const t = tileGrid[x * gcY + y];
        if (t === TileType.WALL) continue;
        if (inside && poly !== null && !polyHas(poly, x + 0.5, y + 0.5)) continue;
        open.push(x * gcY + y);
        if (!wallAt(x - 1, y) && !wallAt(x + 1, y) && !wallAt(x, y - 1) && !wallAt(x, y + 1)) clear.push(x * gcY + y);
      }
    }
    return { open, clear };
  };
  let w = walk(true);
  if (poly !== null && w.open.length === 0) w = walk(false);
  return Int32Array.from(w.clear.length > 0 ? w.clear : w.open);
}

const _inGridOf = new WeakMap<PortalEntity, { gcY: number; hx: number; hy: number; cs: number }>();
const _inCellsNow = new WeakMap<PortalEntity, { ms: MapState; src: Int32Array; cells: Int32Array }>();
function _inCellsOn(p: PortalEntity, src: Int32Array, ms: MapState): Int32Array {
  const g = _inGridOf.get(p);
  if (g === undefined || (g.gcY === ms.gridCellsY && g.hx === ms.mapHalf && g.hy === ms.mapHalfY && g.cs === ms.cellSize)) return src;
  const c = _inCellsNow.get(p);
  if (c !== undefined && c.ms === ms && c.src === src) return c.cells;
  const out: number[] = [];
  for (let k = 0; k < src.length; k++) {
    const ox = (src[k] / g.gcY) | 0, oy = src[k] - ox * g.gcY;
    const gx = Math.floor((-g.hx + (ox + 0.5) * g.cs + ms.mapHalf) / ms.cellSize), gy = Math.floor((-g.hy + (oy + 0.5) * g.cs + ms.mapHalfY) / ms.cellSize);
    if (gx >= 0 && gy >= 0 && gx < ms.gridCells && gy < ms.gridCellsY) out.push(gx * ms.gridCellsY + gy);
  }
  const cells = Int32Array.from(out);
  _inCellsNow.set(p, { ms, src, cells });
  return cells;
}

function _portalOnCell(portals: MapState['portals'], gx: number, gy: number, cs: number, mapHalf: number, mapHalfY: number): boolean {
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];
    if (Math.round((p.x + mapHalf - cs * 0.5) / cs) === gx && Math.round((p.y + mapHalfY - cs * 0.5) / cs) === gy) return true;
  }
  return false;
}
export function resizeMapState(old: MapState, gc: number, gcY: number): MapState {
  const cs = old.cellSize;
  const mapHalf = mapHalfOf(cs, gc), mapHalfY = mapHalfOf(cs, gcY);
  const dx = Math.round((old.mapHalf - mapHalf) / cs), dy = Math.round((old.mapHalfY - mapHalfY) / cs);
  const tileGrid = new Uint8Array(gc * gcY);
  const wallGrid = new Int16Array(gc * gcY).fill(-1);
  const ogc = old.gridCells, ogcY = old.gridCellsY, ow0 = old.walls.length;
  const cellsAll = new Int32Array(ow0), cellsIn = new Int32Array(ow0);
  const holdTiles = SMALL_FIX.GH348 !== 0;
  const outTiles: number[] = [];
  for (let ox = 0; ox < ogc; ox++) {
    const gx = ox - dx, inX = gx >= 0 && gx < gc;
    for (let oy = 0; oy < ogcY; oy++) {
      const oi = ox * ogcY + oy;
      const ow = old.wallGrid[oi];
      const gy = oy - dy, inside = inX && gy >= 0 && gy < gcY;
      if (inside) tileGrid[gx * gcY + gy] = old.tileGrid[oi];
      else if (holdTiles && ow < 0 && old.tileGrid[oi] !== TileType.NORMAL) outTiles.push((ox + 0.5) * cs - old.mapHalf, (oy + 0.5) * cs - old.mapHalfY, old.tileGrid[oi]);
      if (ow < 0 || ow >= ow0) continue;
      cellsAll[ow]++;
      if (inside) cellsIn[ow]++;
    }
  }
  const panel = new Set<number>(old.extraWalls ?? []);
  const held = new Set<number>(old.outWalls ?? []);
  for (const i of held) panel.delete(i);
  const walls: WallEntity[] = [];
  const extraWalls: number[] = [];
  const outWalls: number[] = [];
  const newIdx = new Int32Array(ow0).fill(-1);
  const keepWall = SMALL_FIX.GH322 !== 0;
  const boxCells = (w: WallEntity): [number, number, number, number] | null => {
    const fx0 = (w.x - w.halfW + mapHalf) / cs, fx1 = (w.x + w.halfW + mapHalf) / cs;
    const fy0 = (w.y - w.halfH + mapHalfY) / cs, fy1 = (w.y + w.halfH + mapHalfY) / cs;
    const gx0 = Math.round(fx0), gx1 = Math.round(fx1), gy0 = Math.round(fy0), gy1 = Math.round(fy1);
    if (Math.abs(fx0 - gx0) > 1e-6 || Math.abs(fx1 - gx1) > 1e-6 || Math.abs(fy0 - gy0) > 1e-6 || Math.abs(fy1 - gy1) > 1e-6) return null;
    return gx0 >= 0 && gy0 >= 0 && gx1 <= gc && gy1 <= gcY && gx1 > gx0 && gy1 > gy0 ? [gx0, gx1, gy0, gy1] : null;
  };
  for (let i = 0; i < ow0; i++) {
    const w = old.walls[i];
    if (w === undefined) continue;
    if (panel.has(i)) { newIdx[i] = walls.length; extraWalls.push(walls.length); walls.push(keepWall ? w : { ...w }); continue; }
    if (held.has(i)) {
      const b = boxCells(w);
      const ni = walls.length;
      newIdx[i] = ni; walls.push(keepWall ? w : { ...w });
      if (b === null) { outWalls.push(ni); continue; }
      for (let gx = b[0]; gx < b[1]; gx++) for (let gy = b[2]; gy < b[3]; gy++) { wallGrid[gx * gcY + gy] = ni; tileGrid[gx * gcY + gy] = w.type; }
      continue;
    }
    if (cellsAll[i] === 0) {
      if (SMALL_FIX.R879 !== 0 && w.active && mmOpenKind(w.kind)) { newIdx[i] = walls.length; walls.push(keepWall ? w : { ...w }); }
      continue;
    }
    const ni = walls.length;
    newIdx[i] = ni; walls.push(keepWall ? w : { ...w });
    if (cellsIn[i] !== cellsAll[i]) outWalls.push(ni);
  }
  let inX = mapHalf, inY = mapHalfY;
  for (const ni of outWalls) {
    const w = walls[ni];
    const x0 = w.x - w.halfW, x1 = w.x + w.halfW, y0 = w.y - w.halfH, y1 = w.y + w.halfH;
    if (x1 <= -inX || x0 >= inX || y1 <= -inY || y0 >= inY) continue;
    const nx = x0 > 0 ? x0 : x1 < 0 ? -x1 : 0, ny = y0 > 0 ? y0 : y1 < 0 ? -y1 : 0;
    if (nx * inY >= inX * ny) inX = nx; else inY = ny;
  }
  for (let ox = 0; ox < ogc; ox++) {
    const gx = ox - dx;
    if (gx < 0 || gx >= gc) continue;
    for (let oy = 0; oy < ogcY; oy++) {
      const gy = oy - dy;
      if (gy < 0 || gy >= gcY) continue;
      const ow = old.wallGrid[ox * ogcY + oy];
      if (ow < 0 || ow >= ow0 || cellsIn[ow] !== cellsAll[ow]) continue;
      wallGrid[gx * gcY + gy] = newIdx[ow];
    }
  }
  const heldTiles = old.outTiles;
  if (holdTiles && heldTiles !== undefined) {
    for (let k = 0; k + 2 < heldTiles.length; k += 3) {
      const gx = Math.floor((heldTiles[k] + mapHalf) / cs), gy = Math.floor((heldTiles[k + 1] + mapHalfY) / cs);
      if (gx >= 0 && gx < gc && gy >= 0 && gy < gcY) {
        const i = gx * gcY + gy;
        if (SMALL_FIX.GH358 && heldTiles[k + 2] === TileType.PORTAL && !_portalOnCell(old.portals, gx, gy, cs, mapHalf, mapHalfY)) continue;
        if (wallGrid[i] < 0 && tileGrid[i] === TileType.NORMAL) tileGrid[i] = heldTiles[k + 2];
      } else outTiles.push(heldTiles[k], heldTiles[k + 1], heldTiles[k + 2]);
    }
  }
  const rocks = old.rocks.slice();
  const portals = old.portals.slice();
  const customAreas = old.customAreas ? old.customAreas.slice() : undefined;
  let magic = old.magic;
  if (SMALL_FIX.R879 !== 0 && magic !== undefined && (dx !== 0 || dy !== 0)) {
    const moved: MagicLattice[] = [];
    for (const L of magic) {
      const gx0 = L.gx0 - dx, gy0 = L.gy0 - dy;
      if (gx0 >= 0 && gy0 >= 0 && gx0 + L.nx <= gc && gy0 + L.ny <= gcY) moved.push({ ...L, gx0, gy0 });
    }
    magic = moved;
  }
  const { baseZones, connectedBases, connectedBaseLabel } = baseZonesOf(tileGrid, gc, gcY, cs, mapHalf, mapHalfY);
  const state: MapState = {
    ...old,
    walls, portals, rocks, customAreas, magic,
    extraWalls: extraWalls.length > 0 || old.extraWalls !== undefined ? extraWalls : undefined,
    outWalls: outWalls.length > 0 ? outWalls : undefined,
    outInX: inX, outInY: inY,
    outTiles: outTiles.length > 0 ? outTiles : undefined,
    baseZones, connectedBases, connectedBaseLabel,
    tileGrid, wallGrid, rockGrid: rockGridOf(rocks, gc, gcY, cs, mapHalf, mapHalfY),
    rockBucketCell: 0, rockBucketDim: 0, rockBucketMinX: 0, rockBucketMinY: 0,
    rockBucketStart: new Int32Array(1), rockBucketIdx: new Int32Array(0), rockBucketCount: 0,
    spawnableTiles: spawnableTilesOf(tileGrid),
    mapHalf, mapHalfY, cellSize: cs, gridCells: gc, gridCellsY: gcY,
    wallCanvasDirty: true, navigation: null,
  };
  buildRockBuckets(state);
  state.navigation = createNavigationState(state);
  _mapLine.set(state, mapLineOf(old));
  _resizedMaps.add(state);
  return state;
}

export interface AreaBounds {
  id: string;
  minX: number; minY: number;
  maxX: number; maxY: number;
  centerX: number; centerY: number;
}

export const AREA_GAP_MIN = 600;
export const AREA_GAP_MAX = 1560;
export function areaGapOf(area: { gapBefore?: number }): number {
  const g = typeof area.gapBefore === 'number' && Number.isFinite(area.gapBefore) ? area.gapBefore : AREA_GAP_MAX;
  return Math.round(Math.max(AREA_GAP_MIN, Math.min(AREA_GAP_MAX, g)) / GRID_SPACING) * GRID_SPACING;
}
export function minimapShowsAllAreas(mac: MultiAreaMapConfig): boolean {
  return mac.enableMultiArea && mac.areaLayout === 'near' && mac.minimapAllAreas === true && mac.areas.length > 1;
}
export function areasInColumn(mac: { areaLayout?: string; areaStack?: string }): boolean {
  return SMALL_FIX.R855 !== 0 && mac.areaLayout === 'near' && mac.areaStack === 'column';
}

export function computeAreaLayout(multiAreaConfig: MultiAreaMapConfig): AreaBounds[] {
  const areas = multiAreaConfig.areas;
  if (areas.length === 0) return [];

  const dims = areas.map(a => computeMapDimensions(a.mapConfig));
  const bounds: AreaBounds[] = [];

  if (areas.length === 1) {
    const d = dims[0];
    areas[0].worldOffsetX = 0;
    areas[0].worldOffsetY = 0;
    bounds.push({
      id: areas[0].id,
      minX: -d.mapHalf, minY: -d.mapHalfY,
      maxX: d.mapHalf, maxY: d.mapHalfY,
      centerX: 0, centerY: 0,
    });
    return bounds;
  }

  if (areasInColumn(multiAreaConfig)) {
    let currentY = 0;
    for (let i = 0; i < areas.length; i++) {
      if (i > 0) currentY += areaGapOf(areas[i]);
      const d = dims[i];
      bounds.push({ id: areas[i].id, minX: -d.mapHalf, minY: currentY, maxX: d.mapHalf, maxY: currentY + d.mapHalfY * 2, centerX: 0, centerY: currentY + d.mapHalfY });
      currentY += d.mapHalfY * 2;
    }
    const offsetY = Math.round(currentY / 2 / GRID_SPACING) * GRID_SPACING;
    for (let i = 0; i < areas.length; i++) {
      const b = bounds[i];
      b.minY -= offsetY; b.maxY -= offsetY;
      b.minX = Math.round(b.minX / GRID_SPACING) * GRID_SPACING;
      b.maxX = Math.round(b.maxX / GRID_SPACING) * GRID_SPACING;
      b.minY = Math.round(b.minY / GRID_SPACING) * GRID_SPACING;
      b.maxY = Math.round(b.maxY / GRID_SPACING) * GRID_SPACING;
      b.centerX = (b.minX + b.maxX) / 2;
      b.centerY = (b.minY + b.maxY) / 2;
      areas[i].worldOffsetX = b.centerX;
      areas[i].worldOffsetY = b.centerY;
    }
    return bounds;
  }

  const buffer = Math.ceil(40000 / GRID_SPACING) * GRID_SPACING;
  const near = multiAreaConfig.areaLayout === 'near';
  let currentX = 0;
  for (let i = 0; i < areas.length; i++) {
    if (i > 0) currentX += near ? areaGapOf(areas[i]) : buffer;
    const d = dims[i];
    const halfW = d.mapHalf;
    const halfH = d.mapHalfY;
    areas[i].worldOffsetX = currentX + halfW;
    areas[i].worldOffsetY = 0;

    bounds.push({
      id: areas[i].id,
      minX: currentX,
      minY: -halfH,
      maxX: currentX + halfW * 2,
      maxY: halfH,
      centerX: currentX + halfW,
      centerY: 0,
    });

    currentX += halfW * 2;
  }

  const totalWidth = currentX;
  const offsetX = Math.round(totalWidth / 2 / GRID_SPACING) * GRID_SPACING;
  for (let i = 0; i < areas.length; i++) {
    areas[i].worldOffsetX -= offsetX;
    bounds[i].minX -= offsetX;
    bounds[i].maxX -= offsetX;
    bounds[i].centerX -= offsetX;
    bounds[i].minX = Math.round(bounds[i].minX / GRID_SPACING) * GRID_SPACING;
    bounds[i].maxX = Math.round(bounds[i].maxX / GRID_SPACING) * GRID_SPACING;
    bounds[i].minY = Math.round(bounds[i].minY / GRID_SPACING) * GRID_SPACING;
    bounds[i].maxY = Math.round(bounds[i].maxY / GRID_SPACING) * GRID_SPACING;
    bounds[i].centerX = (bounds[i].minX + bounds[i].maxX) / 2;
    bounds[i].centerY = (bounds[i].minY + bounds[i].maxY) / 2;
    areas[i].worldOffsetX = bounds[i].centerX;
    areas[i].worldOffsetY = bounds[i].centerY;
  }

  return bounds;
}

export function generateMultiAreaMap(
  multiAreaConfig: MultiAreaMapConfig
): { areaStates: MapState[]; unified: MapState; areaBounds: AreaBounds[] } {
  const areaBounds = computeAreaLayout(multiAreaConfig);
  const areaStates: MapState[] = [];
  _mazeMemoCap = Math.max(_MAZE_MEMO_MAX, multiAreaConfig.areas.length);
  for (let i = 0; i < multiAreaConfig.areas.length; i++) {
    const area = multiAreaConfig.areas[i];
    const state = generateMap(area.mapConfig);
    state.areaId = area.id;
    const ox = area.worldOffsetX;
    const oy = area.worldOffsetY;

    for (let w = 0; w < state.walls.length; w++) {
      state.walls[w].x += ox;
      state.walls[w].y += oy;
    }
    for (let p = 0; p < state.portals.length; p++) {
      state.portals[p].x += ox;
      state.portals[p].y += oy;
      state.portals[p].areaId = area.id;
    }
    for (let r = 0; r < state.rocks.length; r++) {
      state.rocks[r].x += ox;
      state.rocks[r].y += oy;
    }
    if (state.customAreas) shiftAreaRows(state.customAreas, ox, oy, area.id);
    buildRockBuckets(state);

    if (area.mapConfig.portalLinks) {
      for (const link of area.mapConfig.portalLinks) {
        const srcPortal = state.portals.find(p => p.id === link.portalId);
        if (srcPortal) {
          srcPortal.destinationAreaId = link.destinationAreaId;

          const destAreaState = SMALL_FIX.BH54 !== 0 ? undefined : areaStates.find(s => s.areaId === link.destinationAreaId);
          if (destAreaState) {
            const destPortal = destAreaState.portals.find(p => p.destinationAreaId === null && p.kind !== PORTAL_KIND_WORMHOLE);
            if (destPortal) {
              destPortal.destinationAreaId = area.id;
            }
          }
        }
      }
    }

    areaStates.push(state);
  }

  if (SMALL_FIX.BH54 !== 0) {
    for (let i = 0; i < multiAreaConfig.areas.length; i++) {
      const area = multiAreaConfig.areas[i];
      const links = area.mapConfig.portalLinks;
      if (!links) continue;
      const state = areaStates[i];
      for (const link of links) {
        if (!state.portals.some(p => p.id === link.portalId)) continue;
        if (link.destinationAreaId === area.id) continue;
        const di = areaStates.findIndex(s => s.areaId === link.destinationAreaId);
        if (di < 0 || isCustomMap(multiAreaConfig.areas[di].mapConfig)) continue;
        const destPortal = areaStates[di].portals.find(p => p.destinationAreaId === null && p.kind !== PORTAL_KIND_WORMHOLE);
        if (destPortal) destPortal.destinationAreaId = area.id;
      }
    }
  }

  const _exitsInUse = new Set<PortalEntity>();
  {
    const _all: PortalEntity[] = [];
    for (const s of areaStates) for (let p = 0; p < s.portals.length; p++) _all.push(s.portals[p]);
    resolvePortalExits(_all);
    for (const p of _all) if (p._exit) _exitsInUse.add(p._exit);
  }
  for (let i = 0; i < areaStates.length; i++) {
    const s = areaStates[i];
    if (multiAreaConfig.areas[i] && isCustomMap(multiAreaConfig.areas[i].mapConfig)) continue;
    s.portals = s.portals.filter(p => p.destinationAreaId !== null || p._exit !== null || _exitsInUse.has(p));
  }

  const allWalls: WallEntity[] = [];
  const allPortals: PortalEntity[] = [];
  const allRocks: RockEntity[] = [];
  for (const s of areaStates) {
    for (let w = 0; w < s.walls.length; w++) allWalls.push(s.walls[w]);
    for (let p = 0; p < s.portals.length; p++) allPortals.push(s.portals[p]);
    for (let r = 0; r < s.rocks.length; r++) allRocks.push(s.rocks[r]);
  }

  let overallHalf = 0;
  for (const b of areaBounds) {
    overallHalf = Math.max(overallHalf, Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minY), Math.abs(b.maxY));
  }
  overallHalf += 100;

  const unified: MapState = {
    walls: allWalls,
    portals: allPortals,
    rocks: allRocks,
    customAreas: areaStates.flatMap(s => s.customAreas ?? []),
    baseZones: areaStates.length > 0 ? areaStates[0].baseZones : [],
    connectedBases: areaStates.length > 0 ? areaStates[0].connectedBases : [],
    connectedBaseLabel: areaStates.length > 0 ? areaStates[0].connectedBaseLabel : new Int32Array(0),
    tileGrid: areaStates.length > 0 ? areaStates[0].tileGrid : new Uint8Array(0),
    wallGrid: areaStates.length > 0 ? areaStates[0].wallGrid : new Int16Array(0),
    rockGrid: areaStates.length > 0 ? areaStates[0].rockGrid : new Int16Array(0),
    rockBucketCell: 0,
    rockBucketDim: 0,
    rockBucketMinX: 0,
    rockBucketMinY: 0,
    rockBucketStart: new Int32Array(1),
    rockBucketIdx: new Int32Array(0),
    rockBucketCount: 0,
    spawnableTiles: areaStates.length > 0 ? areaStates[0].spawnableTiles : [],
    mapHalf: overallHalf,
    mapHalfY: overallHalf,
    cellSize: areaStates.length > 0 ? areaStates[0].cellSize : 150,
    gridCells: areaStates.length > 0 ? areaStates[0].gridCells : 32,
    gridCellsY: areaStates.length > 0 ? areaStates[0].gridCellsY : 32,
    wallCanvasDirty: true,
    areaId: '__unified__',
    navigation: null,
    seedUsed: areaStates.length > 0 ? areaStates[0].seedUsed : 0,
  };

  buildRockBuckets(unified);

  return { areaStates, unified, areaBounds };
}

export function getAreaForPosition(x: number, y: number, areaBounds: AreaBounds[]): AreaBounds | null {
  for (let i = 0; i < areaBounds.length; i++) {
    const b = areaBounds[i];
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return b;
  }
  return null;
}

export function clampToAreaBounds(
  x: number, y: number, radius: number, areaBounds: AreaBounds[]
): { x: number; y: number; clamped: boolean } {
  const area = getAreaForPosition(x, y, areaBounds);
  if (area) {
    const cx = Math.max(area.minX + radius, Math.min(area.maxX - radius, x));
    const cy = Math.max(area.minY + radius, Math.min(area.maxY - radius, y));
    return { x: cx, y: cy, clamped: cx !== x || cy !== y };
  }

  let nearest: AreaBounds | null = null;
  let minDist = Infinity;
  for (let i = 0; i < areaBounds.length; i++) {
    const b = areaBounds[i];
    const dx = x - b.centerX;
    const dy = y - b.centerY;
    const d = dx * dx + dy * dy;
    if (d < minDist) { minDist = d; nearest = b; }
  }
  if (nearest) {
    return {
      x: Math.max(nearest.minX + radius, Math.min(nearest.maxX - radius, x)),
      y: Math.max(nearest.minY + radius, Math.min(nearest.maxY - radius, y)),
      clamped: true,
    };
  }
  return { x, y, clamped: false };
}

function circleAABBCollide(
  cx: number, cy: number, r: number,
  w: WallEntity,
  skipLeft: boolean, skipRight: boolean,
  skipTop: boolean, skipBottom: boolean,
  result: WallCollisionResult
): boolean {
  const left = w.x - w.halfW;
  const right = w.x + w.halfW;
  const top = w.y - w.halfH;
  const bottom = w.y + w.halfH;

  const closestX = cx < left ? left : (cx > right ? right : cx);
  const closestY = cy < top ? top : (cy > bottom ? bottom : cy);

  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= r * r) return false;

  const isInside = (cx >= left && cx <= right && cy >= top && cy <= bottom);

  if (isInside) {
    const dxL = cx - left;
    const dxR = right - cx;
    const dyT = cy - top;
    const dyB = bottom - cy;

    let bestExit = 1e9;
    let exitPX = 0, exitPY = 0, exitAxis = 0;

    if (!skipLeft  && dxL < bestExit) { bestExit = dxL; exitPX = -(dxL + r); exitPY = 0; exitAxis = 0; }
    if (!skipRight && dxR < bestExit) { bestExit = dxR; exitPX = (dxR + r);  exitPY = 0; exitAxis = 0; }
    if (!skipTop   && dyT < bestExit) { bestExit = dyT; exitPX = 0; exitPY = -(dyT + r); exitAxis = 1; }
    if (!skipBottom && dyB < bestExit) { bestExit = dyB; exitPX = 0; exitPY = (dyB + r);  exitAxis = 1; }

    if (bestExit >= 1e9) return false;
    result.faceAxis = exitAxis;
    result.pushX = exitPX;
    result.pushY = exitPY;
    return true;
  }

  const onFaceX = (cx >= left && cx <= right);
  const onFaceY = (cy >= top && cy <= bottom);

  const dist = Math.sqrt(distSq);
  const overlap = r - dist;

  if (onFaceX && !onFaceY) {
    if ((cy < w.y && skipTop) || (cy >= w.y && skipBottom)) return false;
    result.faceAxis = 1;
    result.pushX = 0;
    result.pushY = cy < w.y ? -overlap : overlap;
  } else if (onFaceY && !onFaceX) {
    if ((cx < w.x && skipLeft) || (cx >= w.x && skipRight)) return false;
    result.faceAxis = 0;
    result.pushX = cx < w.x ? -overlap : overlap;
    result.pushY = 0;
  } else {
    const isLeftSide = cx < w.x;
    const isTopSide = cy < w.y;
    if ((isLeftSide && skipLeft) || (!isLeftSide && skipRight)) return false;
    if ((isTopSide && skipTop) || (!isTopSide && skipBottom)) return false;

    result.faceAxis = 2;
    if (dist > 0.001) {
      const invDist = overlap / dist;
      result.pushX = dx * invDist;
      result.pushY = dy * invDist;
    } else {
      result.pushX = overlap;
      result.pushY = 0;
      result.faceAxis = 0;
    }
  }
  return true;
}

export function checkWallCollision(
  x: number, y: number, radius: number,
  state: MapState,
  gridOffX = 0, gridOffY = 0
): WallCollisionResult {
  _collResult.hit = false;
  _collResult.pushX = 0;
  _collResult.pushY = 0;
  _collResult.wallType = TileType.NORMAL;
  _collResult.faceAxis = 0;
  _collResult.wallIndex = -1;
  _collResult.zeroVelX = false;
  _collResult.zeroVelY = false;

  const { walls, wallGrid, gridCells: gc, gridCellsY: gcY, cellSize, mapHalf, mapHalfY } = state;
  if (walls.length === 0) return _collResult;

  const gx0 = x - gridOffX;
  const gy0 = y - gridOffY;
  const minCellX = Math.max(0, Math.floor((gx0 - radius + mapHalf) / cellSize));
  const maxCellX = Math.min(gc - 1, Math.floor((gx0 + radius + mapHalf) / cellSize));
  const minCellY = Math.max(0, Math.floor((gy0 - radius + mapHalfY) / cellSize));
  const maxCellY = Math.min(gcY - 1, Math.floor((gy0 + radius + mapHalfY) / cellSize));

  let bestOverlap = 0;

  for (let gx = minCellX; gx <= maxCellX; gx++) {
    for (let gy = minCellY; gy <= maxCellY; gy++) {
      const wIdx = wallGrid[gx * gcY + gy];
      if (wIdx < 0) continue;

      const w = walls[wIdx];
      if (!w.active) continue;
      if (w.kind !== undefined && wallSkips(w, x, y)) continue;
      if (circleAABBCollide(x, y, radius, w, false, false, false, false, _tempColl)) {
        const ov = Math.abs(_tempColl.pushX) + Math.abs(_tempColl.pushY);
        if (ov > bestOverlap) {
          bestOverlap = ov;
          _collResult.hit = true;
          _collResult.pushX = _tempColl.pushX;
          _collResult.pushY = _tempColl.pushY;
          _collResult.faceAxis = _tempColl.faceAxis;
          _collResult.wallType = w.type;
          _collResult.wallIndex = wIdx;
        }
      }
    }
  }

  for (let L = 0; L < 2; L++) {
    const _ex = L === 0 ? state.extraWalls : (heldWallsReach(state, x - radius, y - radius, x + radius, y + radius) ? state.outWalls : undefined);
    if (_ex === undefined) continue;
    for (let i = 0; i < _ex.length; i++) {
      const w = walls[_ex[i]];
      if (w === undefined || !w.active) continue;
      if (w.kind !== undefined && wallSkips(w, x, y)) continue;
      if (circleAABBCollide(x, y, radius, w, false, false, false, false, _tempColl)) {
        const ov = Math.abs(_tempColl.pushX) + Math.abs(_tempColl.pushY);
        if (ov > bestOverlap) {
          bestOverlap = ov;
          _collResult.hit = true;
          _collResult.pushX = _tempColl.pushX;
          _collResult.pushY = _tempColl.pushY;
          _collResult.faceAxis = _tempColl.faceAxis;
          _collResult.wallType = w.type;
          _collResult.wallIndex = _ex[i];
        }
      }
    }
  }

  return _collResult;
}

export function resolveWallCollisions(
  x: number, y: number, radius: number,
  state: MapState,
  gridOffX = 0, gridOffY = 0
): WallCollisionResult {
  _collResult.hit = false;
  _collResult.pushX = 0;
  _collResult.pushY = 0;
  _collResult.wallType = TileType.NORMAL;
  _collResult.faceAxis = 0;
  _collResult.wallIndex = -1;
  _collResult.zeroVelX = false;
  _collResult.zeroVelY = false;

  const { walls, wallGrid, gridCells: gc, gridCellsY: gcY, cellSize, mapHalf, mapHalfY } = state;
  if (walls.length === 0) return _collResult;

  const gx0 = x - gridOffX;
  const gy0 = y - gridOffY;
  const minCellX = Math.max(0, Math.floor((gx0 - radius + mapHalf) / cellSize) - 1);
  const maxCellX = Math.min(gc - 1, Math.floor((gx0 + radius + mapHalf) / cellSize) + 1);
  const minCellY = Math.max(0, Math.floor((gy0 - radius + mapHalfY) / cellSize) - 1);
  const maxCellY = Math.min(gcY - 1, Math.floor((gy0 + radius + mapHalfY) / cellSize) + 1);

  let curX = x, curY = y;
  let hitAny = false;
  _processedWallCount = 0;

  for (let gx = minCellX; gx <= maxCellX; gx++) {
    for (let gy = minCellY; gy <= maxCellY; gy++) {
      const wIdx = wallGrid[gx * gcY + gy];
      if (wIdx < 0) continue;

      let already = false;
      for (let pi = 0; pi < _processedWallCount; pi++) {
        if (_processedWalls[pi] === wIdx) { already = true; break; }
      }
      if (already) continue;
      if (_processedWallCount < 64) _processedWalls[_processedWallCount++] = wIdx;

      const w = walls[wIdx];
      if (!w.active) continue;
      if (w.kind !== undefined && wallSkips(w, curX, curY)) continue;
      const trueW = w.halfW;
      const trueH = w.halfH;

      if (curX + radius < w.x - trueW ||
          curX - radius > w.x + trueW ||
          curY + radius < w.y - trueH ||
          curY - radius > w.y + trueH) continue;

      const faceLeft  = curX < w.x;
      const faceTop   = curY < w.y;
      const faceRight = curX >= w.x;
      const faceBottom = curY > w.y;

      const extLeft   = curX < w.x - trueW;
      const extTop    = curY < w.y - trueH;
      const extRight  = curX > w.x + trueW;
      const extBottom = curY > w.y + trueH;

      let faceHandled = false;

      if (faceLeft && !extBottom && !extTop) {
        curX = w.x - trueW - radius;
        _collResult.zeroVelX = true;
        hitAny = true;
        faceHandled = true;
        _collResult.wallType = w.type;
        _collResult.wallIndex = wIdx;
        _collResult.faceAxis = 0;
      }
      if (!faceHandled && faceTop && !extLeft && !extRight) {
        curY = w.y - trueH - radius;
        _collResult.zeroVelY = true;
        hitAny = true;
        faceHandled = true;
        _collResult.wallType = w.type;
        _collResult.wallIndex = wIdx;
        _collResult.faceAxis = 1;
      }
      if (!faceHandled && faceRight && !extBottom && !extTop) {
        curX = w.x + trueW + radius;
        _collResult.zeroVelX = true;
        hitAny = true;
        faceHandled = true;
        _collResult.wallType = w.type;
        _collResult.wallIndex = wIdx;
        _collResult.faceAxis = 0;
      }
      if (!faceHandled && faceBottom && !extLeft && !extRight) {
        curY = w.y + trueH + radius;
        _collResult.zeroVelY = true;
        hitAny = true;
        faceHandled = true;
        _collResult.wallType = w.type;
        _collResult.wallIndex = wIdx;
        _collResult.faceAxis = 1;
      }

      if (faceHandled) continue;

      if (faceLeft && faceTop && extLeft && extTop) {
        const cxp = w.x - trueW;
        const cyp = w.y - trueH;
        const cdx = curX - cxp;
        const cdy = curY - cyp;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cdist <= radius) {
          if (cdist > 0.001) {
            const scale = radius / cdist;
            curX = cxp + cdx * scale;
            curY = cyp + cdy * scale;
          } else {
            curX = cxp - radius;
          }
          hitAny = true;
          _collResult.wallType = w.type;
          _collResult.wallIndex = wIdx;
          _collResult.faceAxis = 2;
          continue;
        }
      }
      if (faceRight && faceTop && extRight && extTop) {
        const cxp = w.x + trueW;
        const cyp = w.y - trueH;
        const cdx = curX - cxp;
        const cdy = curY - cyp;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cdist <= radius) {
          if (cdist > 0.001) {
            const scale = radius / cdist;
            curX = cxp + cdx * scale;
            curY = cyp + cdy * scale;
          } else {
            curX = cxp + radius;
          }
          hitAny = true;
          _collResult.wallType = w.type;
          _collResult.wallIndex = wIdx;
          _collResult.faceAxis = 2;
          continue;
        }
      }
      if (faceRight && faceBottom && extRight && extBottom) {
        const cxp = w.x + trueW;
        const cyp = w.y + trueH;
        const cdx = curX - cxp;
        const cdy = curY - cyp;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cdist <= radius) {
          if (cdist > 0.001) {
            const scale = radius / cdist;
            curX = cxp + cdx * scale;
            curY = cyp + cdy * scale;
          } else {
            curX = cxp + radius;
          }
          hitAny = true;
          _collResult.wallType = w.type;
          _collResult.wallIndex = wIdx;
          _collResult.faceAxis = 2;
          continue;
        }
      }
      if (faceLeft && faceBottom && extLeft && extBottom) {
        const cxp = w.x - trueW;
        const cyp = w.y + trueH;
        const cdx = curX - cxp;
        const cdy = curY - cyp;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cdist <= radius) {
          if (cdist > 0.001) {
            const scale = radius / cdist;
            curX = cxp + cdx * scale;
            curY = cyp + cdy * scale;
          } else {
            curX = cxp - radius;
          }
          hitAny = true;
          _collResult.wallType = w.type;
          _collResult.wallIndex = wIdx;
          _collResult.faceAxis = 2;
          continue;
        }
      }
    }
  }

  for (let L = 0; L < 2; L++) {
    const _ex = L === 0 ? state.extraWalls : (heldWallsReach(state, curX - radius, curY - radius, curX + radius, curY + radius) ? state.outWalls : undefined);
    if (_ex === undefined || _ex.length === 0) continue;
    _rwX = curX; _rwY = curY; _rwHit = false;
    for (let i = 0; i < _ex.length; i++) _resolveOneWall(walls[_ex[i]], _ex[i], radius);
    curX = _rwX; curY = _rwY;
    if (_rwHit) hitAny = true;
  }

  if (hitAny) {
    _collResult.hit = true;
    _collResult.pushX = curX - x;
    _collResult.pushY = curY - y;
  }

  return _collResult;
}

let _rwX = 0, _rwY = 0, _rwHit = false;
function _resolveOneWall(w: WallEntity | undefined, wIdx: number, radius: number): void {
  if (w === undefined || !w.active) return;
  if (w.kind !== undefined && wallSkips(w, _rwX, _rwY)) return;
  const tW = w.halfW, tH = w.halfH;
  if (_rwX + radius < w.x - tW || _rwX - radius > w.x + tW || _rwY + radius < w.y - tH || _rwY - radius > w.y + tH) return;
  const fL = _rwX < w.x, fT = _rwY < w.y, fR = _rwX >= w.x, fB = _rwY > w.y;
  const eL = _rwX < w.x - tW, eT = _rwY < w.y - tH, eR = _rwX > w.x + tW, eB = _rwY > w.y + tH;
  let axis = -1;
  if (fL && !eB && !eT) { _rwX = w.x - tW - radius; _collResult.zeroVelX = true; axis = 0; }
  else if (fT && !eL && !eR) { _rwY = w.y - tH - radius; _collResult.zeroVelY = true; axis = 1; }
  else if (fR && !eB && !eT) { _rwX = w.x + tW + radius; _collResult.zeroVelX = true; axis = 0; }
  else if (fB && !eL && !eR) { _rwY = w.y + tH + radius; _collResult.zeroVelY = true; axis = 1; }
  else {
    const cx = eL ? w.x - tW : eR ? w.x + tW : NaN, cy = eT ? w.y - tH : eB ? w.y + tH : NaN;
    if (cx !== cx || cy !== cy) return;
    const dx = _rwX - cx, dy = _rwY - cy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > radius) return;
    if (d > 0.001) { _rwX = cx + dx * radius / d; _rwY = cy + dy * radius / d; }
    else _rwX = cx + (eL ? -radius : radius);
    axis = 2;
  }
  _rwHit = true;
  _collResult.wallType = w.type;
  _collResult.wallIndex = wIdx;
  _collResult.faceAxis = axis;
}

export function updatePortalVisuals(
  portals: PortalEntity[],
  dtFactor: number,
  now: number
): void {
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];

    if (p.timed && !p._timedActive && p._opacity <= 0 && !p._particlesDraining) continue;

    if (p._spawnTime === 0) p._spawnTime = now;

    if (p._particlesDraining) {
      const pT = p._particleT;
      const speed = PORTAL_PARTICLE_SPEED * dtFactor;
      for (let r = 0; r < PORTAL_PARTICLE_COUNT; r++) {
        if (pT[r] < 1.0) {
          pT[r] += speed;
          if (pT[r] > 1.0) pT[r] = 1.0;
        }
      }
      if (portalRandomised(p)) {
        const vT = p._vT, vs = speed * p._vK;
        for (let r = 0; r < p._vN; r++) if (vT[r] < 1.0) { vT[r] += vs; if (vT[r] > 1.0) vT[r] = 1.0; }
      }
      continue;
    }

    p._spinAngle += PORTAL_SPIN_SPEED * dtFactor;

    const aP = p._auraPos;
    const aT = p._auraTarget;
    const aS = p._auraSpeed;
    const minSpd = PORTAL_AURA_MIN_SPEED * dtFactor;
    for (let a = 0; a < PORTAL_AURA_COUNT; a++) {
      const delta = aT[a] - aP[a];
      const springMove = delta * aS[a] * dtFactor;
      if (Math.abs(springMove) > minSpd) {
        aP[a] += springMove;
      } else {
        aP[a] += delta > 0 ? minSpd : -minSpd;
      }
      if (Math.abs(aT[a] - aP[a]) < PORTAL_AURA_SNAP) {
        aT[a] = Math.random();
      }
    }

    const pT = p._particleT;
    const pAngle = p._particleAngle;
    const pSpawnR = p._particleSpawnR;
    const pSize = p._particleSize;
    const pOpac = p._particleOpacity;
    const speed = PORTAL_PARTICLE_SPEED * dtFactor;
    for (let r = 0; r < PORTAL_PARTICLE_COUNT; r++) {
      pT[r] += speed;
      if (pT[r] >= 1.0) {
        pAngle[r] = Math.random() * 6.283185307;
        pSpawnR[r] = PORTAL_PARTICLE_SPAWN_MIN + Math.random() * (PORTAL_PARTICLE_SPAWN_MAX - PORTAL_PARTICLE_SPAWN_MIN);
        pSize[r] = PORTAL_PARTICLE_DOT_MIN + Math.random() * (PORTAL_PARTICLE_DOT_MAX - PORTAL_PARTICLE_DOT_MIN);
        pOpac[r] = 0.2 + Math.random() * 0.1;
        pT[r] = 0;
      }
    }
    if (portalRandomised(p)) {
      const vT = p._vT, vs = speed * p._vK;
      for (let r = 0; r < p._vN; r++) {
        vT[r] += vs;
        if (vT[r] >= 1.0) {
          p._vAngle[r] = _vRand(p) * 6.283185307;
          p._vSpawnR[r] = PORTAL_PARTICLE_SPAWN_MIN + _vRand(p) * (PORTAL_PARTICLE_SPAWN_MAX - PORTAL_PARTICLE_SPAWN_MIN);
          p._vSize[r] = PORTAL_PARTICLE_DOT_MIN + _vRand(p) * (PORTAL_PARTICLE_DOT_MAX - PORTAL_PARTICLE_DOT_MIN);
          p._vOpac[r] = 0.2 + _vRand(p) * 0.1;
          vT[r] = 0;
        }
      }
    }

    if (!p._dying && p._scale < 1) {
      const elapsed = now - p._spawnTime;
      p._scale = Math.min(1, elapsed / PORTAL_SPAWN_DURATION);
      p._opacity = p._scale;
    }

    if (p._dying) {
      const elapsed = now - p._deathTime;
      const t = Math.min(1, elapsed / PORTAL_DEATH_DURATION);
      p._opacity = 1 - t;
      p._scale = 1 + 0.5 * t;
    }
  }
}

let _portalMoves = 0;
export function portalMoveCount(): number { return _portalMoves; }

export function outsidePlayfieldOf(x: number, y: number, r: number, mapHalf: number, mapHalfY: number): boolean {
  const EDGE_MARGIN = 2 * GRID_SPACING;
  const limit = mapHalf - EDGE_MARGIN - r;
  const limitY = mapHalfY - EDGE_MARGIN - r;
  return x > limit || x < -limit || y > limitY || y < -limitY;
}

const _NO_PORTAL_LIST: readonly PortalEntity[] = [];
export const PORTAL_AREA_GAP = PORTAL_TILE_SIZE * 2.4;
function _portalGapClear(p: PortalEntity, x: number, y: number, portals: readonly PortalEntity[], placedOnly: boolean): boolean {
  const g2 = PORTAL_AREA_GAP * PORTAL_AREA_GAP;
  for (let i = 0; i < portals.length; i++) {
    const q = portals[i];
    if (q === p || (placedOnly && q._placedInArea !== true)) continue;
    const dx = x - q.x, dy = y - q.y;
    if (dx * dx + dy * dy < g2) return false;
  }
  return true;
}
function _wallBeside(tileGrid: Uint8Array, gc: number, gcY: number, gx: number, gy: number): boolean {
  return (gx > 0 && tileGrid[(gx - 1) * gcY + gy] === TileType.WALL) || (gx < gc - 1 && tileGrid[(gx + 1) * gcY + gy] === TileType.WALL) ||
    (gy > 0 && tileGrid[gx * gcY + (gy - 1)] === TileType.WALL) || (gy < gcY - 1 && tileGrid[gx * gcY + (gy + 1)] === TileType.WALL);
}
function _relocateTimedPortal(
  p: PortalEntity,
  areaMs: MapState,
  offsetX: number,
  offsetY: number
): void {
  const gc = areaMs.gridCells;
  const gcY = areaMs.gridCellsY;
  const cellSize = areaMs.cellSize;
  const mapHalf = areaMs.mapHalf;
  const mapHalfY = areaMs.mapHalfY;
  const tileGrid = areaMs.tileGrid;
  const spawnableTiles = areaMs.spawnableTiles;
  if (spawnableTiles.length === 0) return;
  const inCells = SMALL_FIX.R914 !== 0 && p._inCells !== null && p._inCells.length > 0 ? _inCellsOn(p, p._inCells, areaMs) : p._inCells;

  const localX = p.x - offsetX;
  const localY = p.y - offsetY;
  const oldGx = Math.round((localX + mapHalf - cellSize * 0.5) / cellSize);
  const oldGy = Math.round((localY + mapHalfY - cellSize * 0.5) / cellSize);
  const oldIdx = oldGx * gcY + oldGy;

  let clearedOld = false;
  if (oldIdx >= 0 && oldIdx < tileGrid.length && tileGrid[oldIdx] === TileType.PORTAL) {
    tileGrid[oldIdx] = TileType.NORMAL;
    clearedOld = true;
  }

  const minDist2 = (PORTAL_TILE_SIZE * 0.8) * (PORTAL_TILE_SIZE * 0.8);
  for (let attempts = 0; attempts < 80; attempts++) {
    const tileIdx = inCells !== null && inCells.length > 0 ? inCells[(Math.random() * inCells.length) | 0] : spawnableTiles[(Math.random() * spawnableTiles.length) | 0];
    if (tileGrid[tileIdx] !== TileType.NORMAL && !(inCells !== null && tileGrid[tileIdx] === TileType.PORTAL)) continue;

    const gx = (tileIdx / gcY) | 0;
    const gy = tileIdx % gcY;

    if ((gx > 0 && tileGrid[(gx - 1) * gcY + gy] === TileType.WALL) ||
        (gx < gc - 1 && tileGrid[(gx + 1) * gcY + gy] === TileType.WALL) ||
        (gy > 0 && tileGrid[gx * gcY + (gy - 1)] === TileType.WALL) ||
        (gy < gcY - 1 && tileGrid[gx * gcY + (gy + 1)] === TileType.WALL)) continue;

    const tx = -mapHalf + gx * cellSize + cellSize * 0.5 + offsetX;
    const ty = -mapHalfY + gy * cellSize + cellSize * 0.5 + offsetY;
    if (SMALL_FIX.CC026 !== 0 && outsidePlayfieldOf(tx - offsetX, ty - offsetY, PORTAL_TILE_SIZE * 0.5, mapHalf, mapHalfY)) continue;
    let tooClose = false;
    for (let ri = 0; ri < areaMs.rocks.length; ri++) {
      const dx = tx - areaMs.rocks[ri].x, dy = ty - areaMs.rocks[ri].y;
      if (dx * dx + dy * dy < minDist2) { tooClose = true; break; }
    }
    if (tooClose) continue;
    if (inCells !== null && MISSING_MODES.ON !== 0) {
      if (!_portalGapClear(p, tx, ty, areaMs.portals, false)) continue;
      p.x = tx; p.y = ty; _portalMoves++; tileGrid[tileIdx] = TileType.PORTAL;
      return;
    }
    if (SMALL_FIX.R821) {
      const minP2 = (cellSize * 4) * (cellSize * 4);
      const others = areaMs.portals;
      let near = false;
      for (let oi = 0; oi < others.length; oi++) {
        const q = others[oi];
        if (q === p) continue;
        const dx = tx - q.x, dy = ty - q.y;
        if (dx * dx + dy * dy < minP2) { near = true; break; }
      }
      if (near || spawnHazardAt(_NO_PORTAL_LIST, areaMs.customAreas, tx, ty, PORTAL_TILE_SIZE * 0.5, true)) continue;
    }

    p.x = tx;
    p.y = ty;
    _portalMoves++;
    tileGrid[tileIdx] = TileType.PORTAL;
    return;
  }

  if (clearedOld) {
    tileGrid[oldIdx] = TileType.PORTAL;
  }
}

export function resetTimedPortalRuntime(
  state: MapState, mapConfig: MapConfig, offsetX = 0, offsetY = 0
): void {
  const timings = mapConfig.portalTimings;
  const placedPortals = editPortals(mapConfig);
  const cs = state.cellSize;
  const mh = state.mapHalf;
  const mhY = state.mapHalfY;
  const gc = state.gridCells;
  const gcY = state.gridCellsY;
  for (let i = 0; i < state.portals.length; i++) {
    const p = state.portals[i];
    for (let j = 0; j < placedPortals.length; j++) {
      const pp = placedPortals[j];
      if (pp.id !== p.id) continue;
      if (PLACED_PORTALS.ON !== 0 && (pp.appear === 'map' || pp.appear === 'area' || (pp.appear === undefined && !isCustomMap(mapConfig)))) break;
      p.staticPos = pp.staticPos;
      const homeX = -mh + pp.gx * cs + cs * 0.5 + offsetX;
      const homeY = -mhY + pp.gy * cs + cs * 0.5 + offsetY;
      if (p.x !== homeX || p.y !== homeY) {
        const oldGx = Math.round((p.x - offsetX + mh - cs * 0.5) / cs);
        const oldGy = Math.round((p.y - offsetY + mhY - cs * 0.5) / cs);
        if (oldGx >= 0 && oldGx < gc && oldGy >= 0 && oldGy < gcY) {
          const oldIdx = oldGx * gcY + oldGy;
          if (state.tileGrid[oldIdx] === TileType.PORTAL) state.tileGrid[oldIdx] = TileType.NORMAL;
        }
        p.x = homeX;
        p.y = homeY;
        _portalMoves++;
        if (pp.gx >= 0 && pp.gx < gc && pp.gy >= 0 && pp.gy < gcY) {
          const newIdx = pp.gx * gcY + pp.gy;
          const t = state.tileGrid[newIdx];
          if (t !== TileType.SPAWN_AREA && !(t >= TileType.BASE_BLUE && t <= TileType.BASE_PURPLE)) {
            state.tileGrid[newIdx] = TileType.PORTAL;
          }
        }
      }
      break;
    }
    p._timedPhaseStart = 0;
    p._spawnTime = 0;
    p._dying = false;
    p._particlesDraining = false;
    p._deathTime = 0;
    p._scale = 0;
    const tc = timings?.find(t => t.portalId === p.id);
    if (tc && tc.timed) {
      p.timed = true;
      p.appearDuration = tc.appearDuration;
      p.disappearDuration = tc.disappearDuration;
      p.initialDelay = tc.initialDelay;
      p._timedActive = tc.initialDelay <= 0;
      p._opacity = p._timedActive ? 1 : 0;
    } else {
      p.timed = false;
      p.appearDuration = 0;
      p.disappearDuration = 0;
      p.initialDelay = 0;
      p._timedActive = true;
      p._opacity = 1;
    }
  }
}

let _portalModeRoll: (() => string) | null = null;
export function setPortalModeRoll(fn: (() => string) | null): void { _portalModeRoll = fn; }
export function rollPortalMode(p: PortalEntity): void { if (p.toMode === 'random' && _portalModeRoll !== null) p._toModeNow = _portalModeRoll(); }
export function updateTimedPortals(
  portals: PortalEntity[],
  now: number,
  mapState: MapState,
  areaStates: MapState[],
  areaConfigs: AreaConfig[]
): void {
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];
    if (!p.timed) continue;

    if (p._timedPhaseStart === 0) {
      p._timedPhaseStart = now;
      if (p.initialDelay > 0) {
        p._timedActive = false;
        p._opacity = 0;
        p._scale = 0;
        continue;
      }
    }

    const elapsed = now - p._timedPhaseStart;

    if (p._timedActive) {
      if (p.appearDuration > 0 && elapsed >= p.appearDuration && !p._dying && !p._particlesDraining) {
        p._dying = true;
        p._deathTime = now;
      }
      if (p._dying && p._opacity <= 0) {
        p._dying = false;
        p._particlesDraining = true;
        if (SMALL_FIX.G613 !== 0) p._timedPhaseStart = now;
        const pT = p._particleT;
        for (let r = 0; r < pT.length; r++) {
          if (pT[r] < 0) pT[r] = 1.0;
        }
        if (portalRandomised(p)) for (let r = 0; r < p._vN; r++) if (p._vT[r] < 0) p._vT[r] = 1.0;
      }
      if (p._particlesDraining) {
        const pT = p._particleT;
        let allDone = true;
        for (let r = 0; r < pT.length; r++) {
          if (pT[r] < 1.0) { allDone = false; break; }
        }
        if (allDone && portalRandomised(p)) for (let r = 0; r < p._vN; r++) if (p._vT[r] < 1.0) { allDone = false; break; }
        const _hidEnd = SMALL_FIX.G613 !== 0 && now - p._timedPhaseStart >= (p.initialDelay > 0 ? p.initialDelay : p.disappearDuration);
        if (allDone || _hidEnd) {
          p._particlesDraining = false;
          p._timedActive = false;
          if (SMALL_FIX.G613 === 0) p._timedPhaseStart = now;
        }
      }
    } else {
      const waitDuration = p.initialDelay > 0 ? p.initialDelay : p.disappearDuration;
      if (elapsed >= waitDuration) {
        p._timedActive = true;
        p._timedPhaseStart = now;
        p._spawnTime = now;
        p._dying = false;
        p._particlesDraining = false;
        p._opacity = 0;
        p._scale = 0;
        if (p.toMode === 'random') rollPortalMode(p);
        if (portalRandomised(p)) portalParticleRoll(p);
        const _firstOpen = p.initialDelay > 0;
        p.initialDelay = 0;
        const pT = p._particleT;
        const pAngle = p._particleAngle;
        const pSpawnR = p._particleSpawnR;
        const pSize = p._particleSize;
        const pOpac = p._particleOpacity;
        for (let r = 0; r < pT.length; r++) {
          pAngle[r] = Math.random() * 6.283185307;
          pT[r] = -(Math.random() * 1.5);
          pSpawnR[r] = PORTAL_PARTICLE_SPAWN_MIN + Math.random() * (PORTAL_PARTICLE_SPAWN_MAX - PORTAL_PARTICLE_SPAWN_MIN);
          pSize[r] = PORTAL_PARTICLE_DOT_MIN + Math.random() * (PORTAL_PARTICLE_DOT_MAX - PORTAL_PARTICLE_DOT_MIN);
          pOpac[r] = 0.2 + Math.random() * 0.1;
        }

        if (p.staticPos || _firstOpen) continue;
        let areaMs: MapState;
        let offX = 0, offY = 0;
        if (areaStates.length > 0) {
          const idx = areaStates.findIndex(s => s.areaId === p.areaId);
          if (idx >= 0) {
            areaMs = areaStates[idx];
            offX = areaConfigs[idx].worldOffsetX;
            offY = areaConfigs[idx].worldOffsetY;
          } else {
            areaMs = mapState;
          }
        } else {
          areaMs = mapState;
        }
        _relocateTimedPortal(p, areaMs, offX, offY);
      }
    }
  }
}

export const PORTAL_MODE_ATTRACT = 0;
export const PORTAL_MODE_REPEL = 1;
export const PORTAL_MODE_FORCE_REPEL = 2;
export const PORTAL_MODE_GHOST = 3;

const _portalResult = { teleported: false, destinationAreaId: null as string | null, exit: null as PortalEntity | null, from: null as PortalEntity | null, toMode: '' };
export function pullAddBeforeKeep(aTick: number, lnKeep: number, dtFactor: number): number {
  if (lnKeep !== lnKeep) return aTick * 0.25 * dtFactor;
  const k = Math.exp(2 * lnKeep);
  if (k > 0.999999) return aTick * 0.25 * dtFactor;
  return (aTick * 0.5 / (1 - k)) * (Math.exp(-lnKeep * dtFactor) - 1);
}

function _portalRingPush(entity: { vx: number; vy: number }, dx: number, dy: number, dist: number, repelRadius: number, dt: number): void {
  if (dist >= repelRadius || dist <= 0) return;
  const t = 1 - dist / repelRadius;
  const seg = Math.min(9, (t * 10) | 0);
  const localT = t * 10 - seg;
  const nx = dx / dist, ny = dy / dist;
  const dtFactor = dt * 60;
  const drag = PORTAL_RING_DRAG[seg] + (PORTAL_RING_DRAG[seg + 1] - PORTAL_RING_DRAG[seg]) * localT;
  if (drag > 0) {
    const inward = entity.vx * nx + entity.vy * ny;
    if (inward > 0) { const retention = Math.exp(-drag * dtFactor); entity.vx -= nx * inward * (1 - retention); entity.vy -= ny * inward * (1 - retention); }
  }
  const push = PORTAL_RING_PUSH[seg] + (PORTAL_RING_PUSH[seg + 1] - PORTAL_RING_PUSH[seg]) * localT;
  if (push > 0) { entity.vx -= nx * push * dtFactor; entity.vy -= ny * push * dtFactor; }
}

export function portalReaches(p: PortalEntity, dx: number, dy: number): boolean {
  if (p.reachSquare) return (dx < 0 ? -dx : dx) < p.reach && (dy < 0 ? -dy : dy) < p.reach;
  return dx * dx + dy * dy <= p.reach * p.reach;
}

export const SPAWN_HAZARD_PAD = 60;
export const MM_DEADLY_PAD = 40;
export function magicSpawnBad(ms: MapState, x: number, y: number, offX: number, offY: number, pad: number, forTank: boolean): boolean {
  if (ms.magic === undefined) return false;
  const lx = x - offX, ly = y - offY, cs = ms.cellSize, gcY = ms.gridCellsY, mh = ms.mapHalf, mhY = ms.mapHalfY;
  if (forTank && ms.spawnEdge !== undefined && ms.spawnEdge > 0) {
    const edge = Math.min(mh - Math.abs(lx), mhY - Math.abs(ly));
    if (edge > ms.spawnEdge * cs) return true;
  }
  const reach = pad + MM_DEADLY_PAD;
  const gx0 = Math.max(0, Math.floor((lx - reach + mh) / cs)), gx1 = Math.min(ms.gridCells - 1, Math.floor((lx + reach + mh) / cs));
  const gy0 = Math.max(0, Math.floor((ly - reach + mhY) / cs)), gy1 = Math.min(gcY - 1, Math.floor((ly + reach + mhY) / cs));
  const held = ms.magicHeld;
  for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
    const c = gx * gcY + gy;
    const qx = Math.max(0, Math.abs(lx - (-mh + (gx + 0.5) * cs)) - cs / 2), qy = Math.max(0, Math.abs(ly - (-mhY + (gy + 0.5) * cs)) - cs / 2);
    if (held !== undefined && held[c] !== 0 && qx * qx + qy * qy < pad * pad) return true;
    const wi = ms.wallGrid[c];
    if (wi >= 0 && ms.walls[wi].kind === 1 && qx * qx + qy * qy < reach * reach) return true;
  }
  const ex = ms.extraWalls;
  if (ex !== undefined) for (let i = 0; i < ex.length; i++) {
    const w = ms.walls[ex[i]];
    if (!w || !w.active || w.kind !== 1) continue;
    const qx = Math.max(0, Math.abs(x - w.x) - w.halfW), qy = Math.max(0, Math.abs(y - w.y) - w.halfH);
    if (qx * qx + qy * qy < reach * reach) return true;
  }
  return false;
}
export function spawnHazardAt(
  portals: readonly PortalEntity[], areas: readonly CustomAreaRect[] | undefined,
  x: number, y: number, pad: number, forTank: boolean, evenClosed: boolean = false,
  guards: Float64Array | null = null, guardN: number = 0,
  areaSpares: ((a: CustomAreaRect) => boolean) | null = null,
  mm: MapState | null = null, mmOffX: number = 0, mmOffY: number = 0,
): boolean {
  if (mm !== null && mm.magic !== undefined && magicSpawnBad(mm, x, y, mmOffX, mmOffY, pad, forTank)) return true;
  if (mm !== null && mm.shrinkHX !== undefined && mm.shrinkHX > 0 && (Math.abs(x - mmOffX) + pad > mm.shrinkHX || Math.abs(y - mmOffY) + pad > (mm.shrinkHY ?? 0))) return true;
  if (forTank) for (let i = 0; i < guardN; i++) {
    const dx = x - guards![i * 3], dy = y - guards![i * 3 + 1], r = guards![i * 3 + 2] + pad;
    if (dx * dx + dy * dy < r * r) return true;
  }
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];
    if (p._dying || (!p._timedActive && !evenClosed)) continue;
    if (!forTank && p.shapeMode === PORTAL_THINGS_PUSH) continue;
    const dx = x - p.x, dy = y - p.y, r = p.reach + pad;
    if (p.reachSquare) { if ((dx < 0 ? -dx : dx) < r && (dy < 0 ? -dy : dy) < r) return true; }
    else if (dx * dx + dy * dy < r * r) return true;
  }
  if (areas) for (let i = 0; i < areas.length; i++) {
    const a = areas[i];
    if (a.kind === AREA_KIND_COSMETIC || a.kind === AREA_KIND_SOLID || a.off === true || (!forTank && a.kind === AREA_KIND_KILL)) continue;
    if (MISSING_MODES.ON !== 0 && (a.kind === AREA_KIND_PEACE || a.kind === AREA_KIND_KEEPOUT || a.kind === AREA_KIND_CONVEYOR)) continue;
    if (areaSpares !== null && a.kind === AREA_KIND_KILL && areaSpares(a)) continue;
    if (x > a.x0 - pad && x < a.x1 + pad && y > a.y0 - pad && y < a.y1 + pad && (a.poly == null || polyTouches(a.poly, x, y, pad))) return true;
  }
  return false;
}

export function applyPortalPhysics(
  entity: { x: number; y: number; vx: number; vy: number; _portalCooldown?: number },
  portals: PortalEntity[],
  dt: number,
  now: number,
  mode: number,
  entityLevel: number,
  lnKeep: number = NaN,
  bodyR: number = 0,
  bossBlocked: boolean = false
): typeof _portalResult {
  _portalResult.teleported = false;
  _portalResult.destinationAreaId = null;
  _portalResult.toMode = '';
  _portalResult.exit = null;
  _portalResult.from = null;

  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];

    if (p.timed && (!p._timedActive || p._particlesDraining)) continue;

    const dx = p.x - entity.x;
    const dy = p.y - entity.y;
    const distSq = dx * dx + dy * dy;

    if (p.kind === PORTAL_KIND_WORMHOLE) {
      if (!portalReaches(p, dx, dy)) continue;
      const wdist = Math.sqrt(distSq);
      if (mode === PORTAL_MODE_GHOST) {
        if (p.requireLevel > 0 && entityLevel < p.requireLevel) continue;
        if (bossBlocked && p.bossBlacklist) continue;
        if (wdist >= p.eventHorizon + bodyR || p._exit === null) continue;
        if (entity._portalCooldown !== undefined && now < entity._portalCooldown) continue;
        _portalResult.teleported = true; _portalResult.exit = p._exit; _portalResult.from = p;
        entity._portalCooldown = now + PORTAL_COOLDOWN;
        return _portalResult;
      }
      const wRepel = mode !== PORTAL_MODE_ATTRACT || (p.requireLevel > 0 && entityLevel < p.requireLevel)
        || (bossBlocked && p.bossBlacklist);
      if (wRepel) { if (wdist > 0) _portalRingPush(entity, dx, dy, wdist, p.reach, dt); continue; }
      if (wdist < p.eventHorizon) {
        if (p._exit === null) continue;
        if (entity._portalCooldown !== undefined && now < entity._portalCooldown) continue;
        _portalResult.teleported = true; _portalResult.exit = p._exit; _portalResult.from = p;
        entity._portalCooldown = now + PORTAL_COOLDOWN;
        return _portalResult;
      }
      if (wdist > 0) {
        const add = pullAddBeforeKeep(p.pullScale * WORMHOLE_PULL / wdist, lnKeep, dt * 60);
        entity.vx += (dx / wdist) * add;
        entity.vy += (dy / wdist) * add;
      }
      continue;
    }

    const maxRange = p.reach;
    if (p.reachSquare ? !portalReaches(p, dx, dy) : distSq > maxRange * maxRange) continue;

    const dist = Math.sqrt(distSq);

    if (mode === PORTAL_MODE_GHOST) {
      if (p.requireLevel > 0 && entityLevel < p.requireLevel) continue;
      if (bossBlocked && p.bossBlacklist) continue;
      if (dist >= p.eventHorizon) continue;
      if (entity._portalCooldown !== undefined && now < entity._portalCooldown) continue;
      if (p.destinationAreaId === null && p._toModeNow === '') continue;
      _portalResult.teleported = true;
      _portalResult.destinationAreaId = p.destinationAreaId;
      _portalResult.toMode = p._toModeNow; _portalResult.from = p;
      entity._portalCooldown = now + PORTAL_COOLDOWN;
      return _portalResult;
    }

    let effectiveMode = mode;
    if (mode === PORTAL_MODE_ATTRACT && p.requireLevel > 0 && entityLevel < p.requireLevel) {
      effectiveMode = PORTAL_MODE_REPEL;
    }
    if (bossBlocked && p.bossBlacklist) effectiveMode = PORTAL_MODE_REPEL;
    if (effectiveMode !== PORTAL_MODE_ATTRACT) {
      const repelRadius = p.reach;
      if (dist < repelRadius && dist > 0) {
        const t = 1 - dist / repelRadius;
        const seg = Math.min(9, (t * 10) | 0);
        const localT = t * 10 - seg;
        const nx = dx / dist;
        const ny = dy / dist;
        const dtFactor = dt * 60;

        const drag = PORTAL_RING_DRAG[seg] + (PORTAL_RING_DRAG[seg + 1] - PORTAL_RING_DRAG[seg]) * localT;
        if (drag > 0) {
          const inward = entity.vx * nx + entity.vy * ny;
          if (inward > 0) {
            const retention = Math.exp(-drag * dtFactor);
            entity.vx -= nx * inward * (1 - retention);
            entity.vy -= ny * inward * (1 - retention);
          }
        }

        const push = PORTAL_RING_PUSH[seg] + (PORTAL_RING_PUSH[seg + 1] - PORTAL_RING_PUSH[seg]) * localT;
        if (push > 0) {
          entity.vx -= nx * push * dtFactor;
          entity.vy -= ny * push * dtFactor;
        }
      }
      continue;
    }

    if (!p.reachSquare && distSq > p.reach * p.reach) continue;

    if (dist < p.eventHorizon) {
      if (mode !== PORTAL_MODE_ATTRACT) continue;
      if (p.requireLevel > 0 && entityLevel < p.requireLevel) continue;

      if (entity._portalCooldown !== undefined && now < entity._portalCooldown) continue;

      if (p.destinationAreaId === null && p._toModeNow === '') continue;

      _portalResult.teleported = true;
      _portalResult.destinationAreaId = p.destinationAreaId;
      _portalResult.toMode = p._toModeNow; _portalResult.from = p;
      entity._portalCooldown = now + PORTAL_COOLDOWN;
      return _portalResult;
    }

    if (dist > p.eventHorizon && dist > 0) {
      const force = PORTAL_GRAVITY * p.pullScale / (distSq + 1);
      entity.vx += (dx / dist) * force * dt;
      entity.vy += (dy / dist) * force * dt;
    }
  }

  return _portalResult;
}

export function getSpawnPosition(state: MapState, offX: number = 0, offY: number = 0): { x: number; y: number } {
  if (state.spawnableTiles.length === 0) {
    return { x: offX, y: offY };
  }

  const gcY = state.gridCellsY;
  const maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tileIdx = state.spawnableTiles[Math.floor(Math.random() * state.spawnableTiles.length)];
    const gx = Math.floor(tileIdx / gcY);
    const gy = tileIdx % gcY;

    const x = offX - state.mapHalf + gx * state.cellSize + state.cellSize / 2 + (Math.random() - 0.5) * state.cellSize * 0.5;
    const y = offY - state.mapHalfY + gy * state.cellSize + state.cellSize / 2 + (Math.random() - 0.5) * state.cellSize * 0.5;

    const safetyDist = 100;
    let wallTooClose = false;
    for (let i = 0; i < state.walls.length; i++) {
      const w = state.walls[i];
      if (!w.active) continue;
      const dx = x - w.x;
      const dy = y - w.y;
      if (Math.abs(dx) < w.halfW + safetyDist && Math.abs(dy) < w.halfH + safetyDist) {
        wallTooClose = true;
        break;
      }
    }

    if (!wallTooClose) {
      for (let i = 0; i < state.rocks.length; i++) {
        const rk = state.rocks[i];
        const rdx = x - rk.x;
        const rdy = y - rk.y;
        if (rdx * rdx + rdy * rdy < (rk.size + safetyDist) * (rk.size + safetyDist)) {
          wallTooClose = true;
          break;
        }
      }
    }

    if (!wallTooClose && spawnHazardAt(state.portals, state.customAreas, x, y, SPAWN_HAZARD_PAD, true, false, null, 0, null, state, offX, offY)) wallTooClose = true;

    if (!wallTooClose) return { x, y };
  }

  const tileIdx = state.spawnableTiles[0];
  const gx = Math.floor(tileIdx / gcY);
  const gy = tileIdx % gcY;
  return {
    x: offX - state.mapHalf + gx * state.cellSize + state.cellSize / 2,
    y: offY - state.mapHalfY + gy * state.cellSize + state.cellSize / 2,
  };
}

export function findSafeSpawnInArea(
  areaState: MapState,
  worldOffsetX: number,
  worldOffsetY: number,
  allPortals: PortalEntity[],
  allRocks: RockEntity[],
  avoidTeamZoneMargin: number = 0
): { x: number; y: number } {
  if (areaState.spawnableTiles.length === 0) {
    return { x: worldOffsetX, y: worldOffsetY };
  }

  const gc = areaState.gridCells;
  const gcY = areaState.gridCellsY;
  const maxAttempts = 30;
  const _baseScanCells = avoidTeamZoneMargin > 0 ? Math.ceil(avoidTeamZoneMargin / areaState.cellSize) : 0;
  const _baseMarginSq = avoidTeamZoneMargin * avoidTeamZoneMargin;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tileIdx = areaState.spawnableTiles[Math.floor(Math.random() * areaState.spawnableTiles.length)];
    const gx = Math.floor(tileIdx / gcY);
    const gy = tileIdx % gcY;

    const localX = -areaState.mapHalf + gx * areaState.cellSize + areaState.cellSize / 2
      + (Math.random() - 0.5) * areaState.cellSize * 0.5;
    const localY = -areaState.mapHalfY + gy * areaState.cellSize + areaState.cellSize / 2
      + (Math.random() - 0.5) * areaState.cellSize * 0.5;

    const wx = localX + worldOffsetX;
    const wy = localY + worldOffsetY;

    let tooClose = false;
    for (let i = 0; i < areaState.walls.length; i++) {
      const w = areaState.walls[i];
      if (!w.active) continue;
      if (Math.abs(wx - w.x) < w.halfW + 100 && Math.abs(wy - w.y) < w.halfH + 100) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    for (let i = 0; i < allPortals.length; i++) {
      const pp = allPortals[i];
      const pdx = wx - pp.x;
      const pdy = wy - pp.y;
      if (pdx * pdx + pdy * pdy < 200 * 200) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    for (let i = 0; i < allRocks.length; i++) {
      const rk = allRocks[i];
      const rdx = wx - rk.x;
      const rdy = wy - rk.y;
      if (rdx * rdx + rdy * rdy < (rk.size + 100) * (rk.size + 100)) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    if (spawnHazardAt(allPortals, areaState.customAreas, wx, wy, SPAWN_HAZARD_PAD, true, false, null, 0, null, areaState, worldOffsetX, worldOffsetY)) continue;

    if (avoidTeamZoneMargin > 0) {
      const cs = areaState.cellSize;
      const mh = areaState.mapHalf;
      const mhY = areaState.mapHalfY;
      const tg = areaState.tileGrid;
      let nearBase = false;
      for (let dx = -_baseScanCells; dx <= _baseScanCells && !nearBase; dx++) {
        for (let dy = -_baseScanCells; dy <= _baseScanCells; dy++) {
          const cgx = gx + dx;
          const cgy = gy + dy;
          if (cgx < 0 || cgx >= gc || cgy < 0 || cgy >= gcY) continue;
          const tt = tg[cgx * gcY + cgy];
          if (tt < TileType.BASE_BLUE || tt > TileType.BASE_PURPLE) continue;
          const baseLocalX = -mh + cgx * cs + cs / 2;
          const baseLocalY = -mhY + cgy * cs + cs / 2;
          const bdx = localX - baseLocalX;
          const bdy = localY - baseLocalY;
          if (bdx * bdx + bdy * bdy < _baseMarginSq) {
            nearBase = true;
            break;
          }
        }
      }
      if (nearBase) continue;
    }

    return { x: wx, y: wy };
  }

  if (SMALL_FIX.BH76 !== 0) {
    const tiles = areaState.spawnableTiles;
    const cs = areaState.cellSize;
    let fx = NaN, fy = NaN;
    for (let k = 0; k < tiles.length; k++) {
      const tgx = Math.floor(tiles[k] / gcY), tgy = tiles[k] % gcY;
      const wx = -areaState.mapHalf + tgx * cs + cs / 2 + worldOffsetX;
      const wy = -areaState.mapHalfY + tgy * cs + cs / 2 + worldOffsetY;
      if (k === 0) { fx = wx; fy = wy; }
      let bad = false;
      for (let i = 0; i < allPortals.length && !bad; i++) {
        const pdx = wx - allPortals[i].x, pdy = wy - allPortals[i].y;
        if (pdx * pdx + pdy * pdy < 200 * 200) bad = true;
      }
      for (let i = 0; i < allRocks.length && !bad; i++) {
        const rk = allRocks[i], rdx = wx - rk.x, rdy = wy - rk.y;
        if (rdx * rdx + rdy * rdy < (rk.size + 100) * (rk.size + 100)) bad = true;
      }
      if (!bad && spawnHazardAt(allPortals, areaState.customAreas, wx, wy, SPAWN_HAZARD_PAD, true, false, null, 0, null, areaState, worldOffsetX, worldOffsetY)) bad = true;
      if (!bad) return { x: wx, y: wy };
    }
    return { x: fx, y: fy };
  }

  return { x: worldOffsetX, y: worldOffsetY };
}

export function isWallType(type: TileType): boolean {
  return type === TileType.WALL;
}

export function getTileTypeName(type: TileType): string {
  switch (type) {
    case TileType.NORMAL: return 'Open';
    case TileType.WALL: return 'Wall';
    case TileType.PORTAL: return 'Portal';
    case TileType.BASE_BLUE: return 'Blue Base';
    case TileType.BASE_RED: return 'Red Base';
    case TileType.BASE_GREEN: return 'Green Base';
    case TileType.BASE_PURPLE: return 'Purple Base';
    case TileType.OUT_BORDER: return 'Out of Bounds';
    case TileType.SPAWN_AREA: return 'Spawn Area';
    default: return 'Unknown';
  }
}

export function getTileTypeColor(type: TileType): string {
  return WALL_COLORS[type] || '#999999';
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function() {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function releaseMapState(state: MapState | null): void {
  if (!state) return;
  state.walls.length = 0;
  state.portals.length = 0;
  state.rocks.length = 0;
  state.baseZones.length = 0;
  if (state.connectedBases) state.connectedBases.length = 0;
}
