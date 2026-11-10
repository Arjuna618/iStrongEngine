import type { MapConfig, MapState } from '../../types';
import type { MmMap, MmArea } from '../minimapPicture';
import { generateMap } from '../../game/MapSystem';
import { MAZE_TYPE_IDS } from '../../game/MazeGenerator';
import { mazeCardConfig, MAP_LIB_BUILD_SEED } from './mapCatalog';

export interface PicData {
  gc: number; gcY: number; cellSize: number; mapHalf: number; mapHalfY: number;
  tiles: number[]; rocks: number[]; portals: number[]; walls: number[];
  areas?: MmArea[];
  marks?: number[];
  typed?: number[];
}
export const TYPED_STRIDE = 6;
export interface MazePicEntry extends PicData { type: number; seed: number; seedUsed: number }
export interface MazePicFile { format: 1; seed: number; maps: MazePicEntry[] }
export const ENT_STRIDE = 6;
export const ENT_TEAM_BASE = 100;
export interface ModePicEntry extends PicData { key: string; seedUsed: number; ents?: number[] }
export interface ModePicFile { format: 1; seed: number; modes: ModePicEntry[]; designs?: unknown[] }

export function picDataOf(ms: MapState, config?: MapConfig, offX = 0, offY = 0): PicData {
  const tiles: number[] = [];
  const tg = ms.tileGrid;
  if (tg) {
    let v = -1, n = 0;
    for (let i = 0; i < tg.length; i++) {
      if (tg[i] === v) { n++; continue; }
      if (n > 0) tiles.push(v, n);
      v = tg[i]; n = 1;
    }
    if (n > 0) tiles.push(v, n);
  }
  const rocks: number[] = [];
  for (const r of ms.rocks) if (r.active) rocks.push(Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.size * 10) / 10, r.shape);
  const portals: number[] = [];
  for (const p of ms.portals) if (!p.invisible && (!p.timed || p._timedActive)) portals.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
  const walls: number[] = [];
  if (!tg || ms.gridCells <= 0) for (const w of ms.walls) if (w.active) walls.push(w.x, w.y, w.halfW, w.halfH);
  const d: PicData = { gc: ms.gridCells, gcY: ms.gridCellsY, cellSize: ms.cellSize, mapHalf: ms.mapHalf, mapHalfY: ms.mapHalfY, tiles, rocks, portals, walls };
  const cas = ms.customAreas ? ms.customAreas.filter(a => !(a.isBase === true && a.opacity <= 0)) : ms.customAreas;
  if (cas && cas.length > 0) d.areas = cas.map(a => (a.poly != null
    ? { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, color: a.color, colorMap: a.colorMap, opacity: a.opacity, poly: Array.from(a.poly, v => Math.round(v * 10) / 10) }
    : { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, color: a.color, colorMap: a.colorMap, opacity: a.opacity }));
  const doc = config?.events;
  if (doc?.placed && doc.placed.length > 0) {
    const marks: number[] = [];
    for (const e of doc.placed) {
      if (e.off) continue;
      if (doc.types?.find(t => t.id === e.type.id)?.brain === 'guard') continue;
      const word = doc.types?.find(t => t.id === e.type.id)?.side?.team;
      const m = typeof word === 'string' ? /^team([1-4])$/.exec(word) : null;
      marks.push(Math.round((-ms.mapHalf + e.cx * ms.cellSize) * 10) / 10, Math.round((-ms.mapHalfY + e.cy * ms.cellSize) * 10) / 10, m ? Number(m[1]) : 0);
    }
    if (marks.length > 0) d.marks = marks;
  }
  if (tg && ms.gridCells > 0) {
    const typed: number[] = [];
    for (const w of ms.walls) {
      if (!w.active || w.kind === undefined || w.kind <= 0) continue;
      typed.push(Math.round((w.x - offX) * 10) / 10, Math.round((w.y - offY) * 10) / 10, w.halfW, w.halfH, w.kind, w.wslot !== undefined && w.wslot >= 0 ? w.wslot : -1);
    }
    if (typed.length > 0) d.typed = typed;
  }
  return d;
}

export function mmMapOf(d: PicData): MmMap {
  let tileGrid: Uint8Array | null = null;
  if (d.tiles.length > 0) {
    tileGrid = new Uint8Array(d.gc * d.gcY);
    let at = 0;
    for (let i = 0; i + 1 < d.tiles.length; i += 2) { tileGrid.fill(d.tiles[i], at, at + d.tiles[i + 1]); at += d.tiles[i + 1]; }
  }
  const rocks = [];
  for (let i = 0; i + 3 < d.rocks.length; i += 4) rocks.push({ x: d.rocks[i], y: d.rocks[i + 1], size: d.rocks[i + 2], shape: d.rocks[i + 3], active: true });
  const portals = [];
  for (let i = 0; i + 1 < d.portals.length; i += 2) portals.push({ x: d.portals[i], y: d.portals[i + 1], timed: false, _timedActive: true, invisible: false });
  const walls = [];
  for (let i = 0; i + 3 < d.walls.length; i += 4) walls.push({ x: d.walls[i], y: d.walls[i + 1], halfW: d.walls[i + 2], halfH: d.walls[i + 3], active: true });
  const ty = d.typed;
  if (ty !== undefined) for (let i = 0; i + TYPED_STRIDE - 1 < ty.length; i += TYPED_STRIDE) {
    walls.push({ x: ty[i], y: ty[i + 1], halfW: ty[i + 2], halfH: ty[i + 3], active: true, kind: ty[i + 4], wslot: ty[i + 5] >= 0 ? ty[i + 5] : undefined });
  }
  return { mapHalf: d.mapHalf, mapHalfY: d.mapHalfY, tileGrid, gridCells: d.gc, gridCellsY: d.gcY, cellSize: d.cellSize, rocks, portals, walls, customAreas: d.areas, marks: d.marks };
}

export function buildMazePictures(): MazePicFile {
  const maps: MazePicEntry[] = [];
  for (const t of MAZE_TYPE_IDS) {
    const ms = generateMap(mazeCardConfig(t, MAP_LIB_BUILD_SEED));
    maps.push({ type: t, seed: MAP_LIB_BUILD_SEED, seedUsed: ms.seedUsed, ...picDataOf(ms) });
  }
  return { format: 1, seed: MAP_LIB_BUILD_SEED, maps };
}
