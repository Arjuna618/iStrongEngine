import type { MapConfig, MultiAreaMapConfig, LibraryItem } from '../types';
import type { MapPool, MapPoolRow } from './modeWorlds';
import { clampErosion } from './MazeGenerator';
import { ROCK_FORMATIONS, type RockFormationWord } from './rockFormations.generated';
import { isRockFormation } from './rockFormationWord';
import { ARRAS_ROCK_VARIATION } from './constants';

export function mapPoolShares(rows: readonly MapPoolRow[], can: (r: MapPoolRow) => boolean): Map<number, number> {
  let total = 0;
  for (const r of rows) if (can(r)) total += Math.max(0, r.share);
  const out = new Map<number, number>();
  for (const r of rows) out.set(r.id, total > 0 && can(r) ? Math.round((Math.max(0, r.share) / total) * 100) : 0);
  return out;
}

export function pickPoolRow(rows: readonly MapPoolRow[], can: (r: MapPoolRow) => boolean, roll: number): MapPoolRow | null {
  let total = 0;
  for (const r of rows) if (can(r)) total += Math.max(0, r.share);
  if (total <= 0) return null;
  let at = roll * total;
  let last: MapPoolRow | null = null;
  for (const r of rows) {
    if (!can(r) || r.share <= 0) continue;
    last = r;
    at -= r.share;
    if (at < 0) return r;
  }
  return last;
}

export function poolRowMap(base: MapConfig, row: MapPoolRow, seed: number): MapConfig {
  const m: MapConfig = { ...base, seed };
  if (row.kind === 'maze' && row.maze !== undefined) {
    m.mazeType = row.maze;
    m.enableMaze = true;
    m.enableRocks = false;
    m.erosionIntensity = clampErosion(row.maze, base.erosionIntensity ?? 1);
  } else if (row.kind === 'rock' && row.rock) {
    m.enableMaze = false;
    m.enableRocks = true;
    m.rockPattern = row.rock as MapConfig['rockPattern'];
    if (isRockFormation(row.rock)) {
      m.rockDensity = ROCK_FORMATIONS[row.rock as RockFormationWord].mean;
      m.rockSizeVariation = ARRAS_ROCK_VARIATION;
      m.rockTypes = ['rock', 'stone', 'gravel'];
      m.rockExclusionZone = false;
    }
  }
  return m;
}

export function poolFileWorld(item: LibraryItem): { map?: MapConfig; areas?: MultiAreaMapConfig } | null {
  const f = item.fileData;
  if (f.type === 'Map') return { map: structuredClone(f.data as MapConfig) };
  if (f.type === 'MultiAreaMap') return { areas: structuredClone(f.data as MultiAreaMapConfig) };
  return null;
}

export function poolRand(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cleanMapPool(p: unknown): MapPool | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const q = p as { on?: unknown; rows?: unknown };
  if (!Array.isArray(q.rows)) return undefined;
  const rows: MapPoolRow[] = [];
  const seen = new Set<number>();
  for (const r0 of q.rows) {
    const r = r0 as Partial<MapPoolRow>;
    if (!r || (r.kind !== 'maze' && r.kind !== 'rock' && r.kind !== 'file')) continue;
    const id = Number.isFinite(r.id) && !seen.has(r.id as number) ? (r.id as number) : rows.length + 1000;
    seen.add(id);
    rows.push({ id, kind: r.kind, maze: typeof r.maze === 'number' ? r.maze : undefined, rock: typeof r.rock === 'string' ? r.rock : undefined, file: typeof r.file === 'string' ? r.file : undefined, name: typeof r.name === 'string' ? r.name : 'Map', share: Number.isFinite(r.share) ? Math.max(0, Math.min(1000, r.share as number)) : 0 });
  }
  return { on: q.on === true, rows };
}
