import { createDefaultMapConfig, MAZE_TYPE_CUSTOM } from '../../types';
import type { MapConfig, MultiAreaMapConfig, LibraryItem } from '../../types';
import { MAZE_TYPE_IDS, MAZE_TYPE_NAMES, MAZE_NATIVE_GRID, clampErosion } from '../../game/MazeGenerator';
import { builtGridOf, computeMapDimensions, areaGapOf, AREA_GAP_MAX, areasInColumn } from '../../game/MapSystem';

export const MAP_LIB_BUILD_SEED = 640;

export function mazeCardPatch(type: number, seed: number): Partial<MapConfig> {
  return {
    mazeType: type, enableMaze: true, enableRocks: false, seed,
    gridCells: Math.max(32, MAZE_NATIVE_GRID[type] || 0), gridCellsY: undefined,
    erosionIntensity: clampErosion(type, 1),
  };
}

export function mazeCardConfig(type: number, seed: number): MapConfig {
  const c: MapConfig = { ...createDefaultMapConfig(), ...mazeCardPatch(type, seed) };
  delete c.gridCellsY;
  return c;
}

export function mazeCardLoadPatch(config: MapConfig, type: number, seed: number): Partial<MapConfig> | null {
  const p = mazeCardPatch(type, seed);
  return (Object.keys(p) as (keyof MapConfig)[]).every(k => config[k] === p[k]) ? null : p;
}

export function mazeCardIsLoaded(config: MapConfig, type: number, seed: number): boolean {
  return config.enableMaze && config.mazeType === type && config.seed === seed;
}

export type MapCardKind = 'maze' | 'mine' | 'rock' | 'mode';
export interface MapCard {
  key: string;
  kind: MapCardKind;
  name: string;
  aspect: number;
  type: number;
  item: LibraryItem | null;
  lower: string;
  modeKey?: string;
  pattern?: NonNullable<MapConfig['rockPattern']>;
}

export interface CardArea { id: string; minX: number; minY: number; maxX: number; maxY: number }
export function cardAreaLayout(mac: MultiAreaMapConfig): { areas: CardArea[]; minX: number; minY: number; maxX: number; maxY: number } {
  const out: CardArea[] = [];
  if (areasInColumn(mac)) {
    let y = 0, minX = 0, maxX = 0;
    for (let i = 0; i < mac.areas.length; i++) {
      const a = mac.areas[i];
      if (i > 0) y += areaGapOf(a);
      const d = computeMapDimensions(a.mapConfig);
      out.push({ id: a.id, minX: -d.mapHalf, minY: y, maxX: d.mapHalf, maxY: y + d.mapHalfY * 2 });
      y += d.mapHalfY * 2;
      if (-d.mapHalf < minX) minX = -d.mapHalf;
      if (d.mapHalf > maxX) maxX = d.mapHalf;
    }
    return { areas: out, minX, minY: 0, maxX, maxY: y };
  }
  let x = 0, minY = 0, maxY = 0;
  const near = mac.areaLayout === 'near';
  for (let i = 0; i < mac.areas.length; i++) {
    const a = mac.areas[i];
    if (i > 0) x += near ? areaGapOf(a) : AREA_GAP_MAX;
    const d = computeMapDimensions(a.mapConfig);
    out.push({ id: a.id, minX: x, minY: -d.mapHalfY, maxX: x + d.mapHalf * 2, maxY: d.mapHalfY });
    x += d.mapHalf * 2;
    if (-d.mapHalfY < minY) minY = -d.mapHalfY;
    if (d.mapHalfY > maxY) maxY = d.mapHalfY;
  }
  return { areas: out, minX: 0, minY, maxX: x, maxY };
}

export function aspectOfConfig(c: MapConfig): number {
  const g = builtGridOf(c);
  return g.h > 0 ? g.w / g.h : 1;
}

export function aspectOfFile(item: LibraryItem): number {
  try {
    const d = item.fileData;
    if (d.type === 'Map') return aspectOfConfig(d.data as MapConfig);
    if (d.type === 'MultiAreaMap') {
      const mac = d.data as MultiAreaMapConfig;
      if (!mac || !Array.isArray(mac.areas) || mac.areas.length === 0) return 1;
      const L = cardAreaLayout(mac);
      const h = L.maxY - L.minY;
      return h > 0 ? (L.maxX - L.minX) / h : 1;
    }
  } catch { }
  return 1;
}

export function mapCards(library: readonly LibraryItem[], customAspect = 1): MapCard[] {
  const out: MapCard[] = [];
  const cname = MAZE_TYPE_NAMES[MAZE_TYPE_CUSTOM] ?? 'Custom Editor';
  out.push({ key: 'maze:custom', kind: 'maze', name: cname, aspect: customAspect > 0 ? customAspect : 1, type: MAZE_TYPE_CUSTOM, item: null, lower: cname.toLowerCase() });
  for (const t of MAZE_TYPE_IDS) {
    const name = MAZE_TYPE_NAMES[t] ?? `Maze ${t}`;
    out.push({ key: 'maze:' + t, kind: 'maze', name, aspect: aspectOfConfig(mazeCardConfig(t, MAP_LIB_BUILD_SEED)), type: t, item: null, lower: name.toLowerCase() });
  }
  const mine = library.filter(it => it.fileData && (it.fileData.type === 'Map' || it.fileData.type === 'MultiAreaMap'));
  mine.sort((a, b) => (b.loadedAt ?? 0) - (a.loadedAt ?? 0));
  for (const it of mine) out.push({ key: 'mine:' + it.id, kind: 'mine', name: it.name || 'Map', aspect: aspectOfFile(it), type: -1, item: it, lower: (it.name || 'map').toLowerCase() });
  return out;
}

export type MapFilter = 'all' | 'maze' | 'mine' | 'rock' | 'mode';
export function filterCards(cards: readonly MapCard[], filter: MapFilter, query: string): MapCard[] {
  const q = query.trim().toLowerCase();
  return cards.filter(c => (filter === 'all' ? c.kind !== 'rock' && c.kind !== 'mode' : c.kind === filter) && (q === '' || c.lower.includes(q)));
}

export const CARD_ASPECT_MIN = 0.6;
export const CARD_ASPECT_MAX = 3.2;
export interface CardRow { start: number; end: number; widths: number[]; h: number }
export function layoutRows(aspects: readonly number[], width: number, rowH: number, gap: number): CardRow[] {
  const rows: CardRow[] = [];
  if (width <= 0) return rows;
  let start = 0, sum = 0, w: number[] = [];
  const close = (end: number, stretch: boolean) => {
    if (end <= start) return;
    const room = width - gap * (end - start - 1);
    const k = stretch && sum > 0 ? Math.min(1.6, room / sum) : 1;
    rows.push({ start, end, widths: w.map(x => Math.floor(x * k)), h: Math.round(rowH * k) });
    start = end; sum = 0; w = [];
  };
  for (let i = 0; i < aspects.length; i++) {
    const a = Math.max(CARD_ASPECT_MIN, Math.min(CARD_ASPECT_MAX, aspects[i] || 1));
    const cw = Math.min(width, rowH * a);
    if (w.length > 0 && sum + cw + gap * w.length > width) close(i, true);
    w.push(cw); sum += cw;
  }
  close(aspects.length, false);
  return rows;
}
