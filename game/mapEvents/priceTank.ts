import type { LibraryItem } from '../../types';
import type { MapEventsDoc, SpawnGroup } from './doc';
import { findTankByNameOrKey } from '../tankByName';

export function roundsOfTankFile(data: unknown): number {
  const d = data as { turrets?: unknown[]; bodyLayers?: { turrets?: unknown[] }[]; globalMaxAliveEnabled?: boolean; globalMaxAlive?: number } | null | undefined;
  if (!d || typeof d !== 'object') return 0;
  let n = 0;
  const each = (list: unknown[] | undefined): void => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const t = raw as { bps?: number; bulletLifetime?: number; projectileType?: { maxAlive?: number; lifetime?: number } } | null;
      if (!t) continue;
      const bps = t.bps ?? 0;
      if (!(bps > 0)) continue;
      const life = (t.projectileType?.lifetime ?? 0) > 0 ? t.projectileType!.lifetime! : t.bulletLifetime ?? 3;
      const cap = t.projectileType?.maxAlive ?? 0;
      n += cap > 0 ? cap : bps * life;
    }
  };
  each(d.turrets);
  if (Array.isArray(d.bodyLayers)) for (const l of d.bodyLayers) each(l?.turrets);
  if (d.globalMaxAliveEnabled && (d.globalMaxAlive ?? 0) > 0) n = Math.min(n, d.globalMaxAlive!);
  return n;
}

export const ROUNDS_HEAVY = 2500;

export function priceOfLine(g: SpawnGroup | undefined, doc: MapEventsDoc | undefined, lib: LibraryItem[] | null | undefined): { rounds: number; shapes: number } {
  if (!g) return { rounds: 0, shapes: 0 };
  let total = 0, rounds = 0, shapes = 0;
  for (const c of g.cards) {
    const w = c.weight > 0 ? c.weight : 0;
    total += w;
    if (c.shape !== undefined) { shapes += w; continue; }
    const type = c.type ? doc?.types?.find(t => t.id === c.type!.id) : undefined;
    const tank = type ? type.forms[0]?.tank : c.tank;
    const words = typeof tank === 'string' ? [tank] : tank && typeof tank === 'object' && 'list' in tank ? tank.list.map(x => x.word) : [];
    let sum = 0;
    for (const word of words) sum += roundsOfTankFile(findTankByNameOrKey(lib, word)?.fileData.data);
    if (words.length > 0) rounds += w * sum / words.length;
  }
  return total > 0 ? { rounds: rounds / total, shapes: shapes / total } : { rounds: 0, shapes: 0 };
}
