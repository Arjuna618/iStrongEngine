import type { Turret, ProjectileTypeConfig } from '../../types';
import { otherPartCount } from '../../utils/otherDraw';
import { explodeActive } from '../../game/explode';

export const ROUND = {
  BULLET: 1, DRONE: 2, MINION: 4, TRAP: 8, SWARM: 16, MISSILE: 32, HIVE: 64, TANK: 128, BOMB: 256, BOOMERANG: 512,
} as const;
export const ROUND_KEYS = ['BULLET', 'DRONE', 'MINION', 'TRAP', 'SWARM', 'MISSILE', 'HIVE', 'TANK', 'BOMB', 'BOOMERANG'] as const;

export const FACT = {
  HEALS: 1, AUTO: 2, LAYERED: 4, INVISIBLE: 8, SMASHER: 16, STAR_BODY: 32, CARRIES_TURRETS: 64, AURA: 128,
} as const;

export type CatalogFacts = [number, number, number, number];

export type DesignKindOf = (designName: string, carried?: unknown) => number | undefined;

export interface DesignOfName { kind: number; data: any; id: string; content?: string }

export function designContent(d: unknown): string {
  return JSON.stringify(d, (_k, v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) o[k] = (v as Record<string, unknown>)[k];
    return o;
  }) ?? '';
}

function designBuild(d: any): string {
  if (!d || typeof d !== 'object') return '';
  const r = (v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : null);
  const guns = Array.isArray(d.turrets) ? d.turrets.map((t: any) => t && [t.turretType ?? null, r(t.xOffset), r(t.yOffset), r(t.angle), r(t.length), r(t.width),
    t.projectileType ? (t.projectileType.visual ?? null) : null, t.projectileType ? (t.projectileType.customProjectileDesignName ?? null) : null]) : [];
  return JSON.stringify([d.visual ?? null, r(d.shape), r(d.size), d.color ?? null, Array.isArray(d.bodyLayers) ? d.bodyLayers.length : 0, guns]);
}

export function designOfName(list: readonly DesignOfName[] | undefined, carried: unknown): DesignOfName | undefined {
  if (!list || list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  if (!carried || typeof carried !== 'object') return undefined;
  const c = designContent(carried);
  for (const d of list) { if (d.content === undefined) d.content = designContent(d.data); if (d.content === c) return d; }
  const one = (same: (d: DesignOfName) => boolean): DesignOfName | null | undefined => {
    let hit: DesignOfName | undefined;
    for (const d of list) if (same(d)) { if (hit) return null; hit = d; }
    return hit;
  };
  const b = designBuild(carried);
  const byBuild = one(d => designBuild(d.data) === b);
  if (byBuild !== undefined) return byBuild ?? undefined;
  const own = roundOfDesignData(carried as { visual?: string; turrets?: any[] });
  return one(d => roundOfDesignData(d.data) === own) ?? undefined;
}

export function roundKindOfDesignCategory(category: string | undefined): number | undefined {
  switch (category) {
    case 'Missiles': return ROUND.MISSILE;
    case 'Hives': return ROUND.HIVE;
    case 'Traps': return ROUND.TRAP;
    case 'Drones': return ROUND.DRONE;
    case 'Minions': return ROUND.MINION;
    case 'Splitters': return ROUND.MISSILE;
    default: return undefined;
  }
}

function roundOfVisual(visual: string | undefined): number {
  switch (visual) {
    case 'drone': return ROUND.DRONE;
    case 'minion': return ROUND.MINION;
    case 'trap': return ROUND.TRAP;
    case 'swarm': return ROUND.SWARM;
    case 'hive': return ROUND.HIVE;
    case 'boomerang': return ROUND.BOOMERANG;
    default: return ROUND.BULLET;
  }
}

function roundOfDesignData(d: { visual?: string; turrets?: any[] } | null | undefined): number {
  if (!d) return ROUND.MISSILE;
  if (d.visual && d.visual !== 'bullet') return roundOfVisual(d.visual);
  if (!Array.isArray(d.turrets) || d.turrets.length === 0) return ROUND.BULLET;
  for (const t of d.turrets) {
    const v = t && t.projectileType ? t.projectileType.visual : undefined;
    if (v === 'swarm' || v === 'drone') return ROUND.HIVE;
  }
  return ROUND.MISSILE;
}

export function roundOfGun(pt: ProjectileTypeConfig | undefined, designKindOf: DesignKindOf): number {
  if (!pt) return ROUND.BULLET;
  if (pt.tankAsProjectile || (pt.cycleProjectilesEnabled && pt.tankAsProjectileCycle && pt.tankAsProjectileCycle.length > 0)) return ROUND.TANK;
  const name = pt.customProjectileDesignName;
  if (name) return designKindOf(name, pt.customProjectileDesign) ?? roundOfDesignData(pt.customProjectileDesign);
  if (pt.customProjectileDesign && Array.isArray(pt.customProjectileDesign.turrets) && pt.customProjectileDesign.turrets.length > 0) return roundOfDesignData(pt.customProjectileDesign);
  return roundOfVisual(pt.visual);
}

interface GunTally { rounds: number; barrels: number; flags: number; }

function tallyTurrets(turrets: readonly Turret[] | undefined, designKindOf: DesignKindOf, out: GunTally): void {
  if (!turrets) return;
  for (let i = 0; i < turrets.length; i++) {
    const t = turrets[i];
    if (!t || t.look !== undefined) continue;
    if (t.aura) out.flags |= FACT.AURA;
    if (t.turretType === 'auto') {
      out.flags |= FACT.AUTO;
      if (t.autoCircleHealer) out.flags |= FACT.HEALS;
      tallyTurrets(t.autoSubTurrets, designKindOf, out);
      continue;
    }
    if (t.turretType === 'decorative') continue;
    out.barrels++;
    out.rounds |= roundOfGun(t.projectileType, designKindOf);
    if (explodeActive(t.explode)) out.rounds |= ROUND.BOMB;
    if (t.healer) out.flags |= FACT.HEALS;
  }
}

export function catalogFacts(type: string, data: any, designKindOf: DesignKindOf): CatalogFacts {
  const tally: GunTally = { rounds: 0, barrels: 0, flags: 0 };
  let sides = 0;
  if (!data || typeof data !== 'object') return [0, 0, 0, 0];
  if (type === 'Tank') {
    tallyTurrets(data.turrets, designKindOf, tally);
    if (Array.isArray(data.bodyLayers)) {
      if (data.bodyLayers.length > 0) tally.flags |= FACT.LAYERED;
    }
    if (data.isHealer) tally.flags |= FACT.HEALS;
    if (data.invisible) tally.flags |= FACT.INVISIBLE;
    if (data.statNamesType === 'smasher' || data.isSmasher === true) tally.flags |= FACT.SMASHER;
    sides = Math.floor(typeof data.tankSides === 'number' ? data.tankSides : 0);
    if ((data.tankShapeDepth ?? 0) > 0) tally.flags |= FACT.STAR_BODY;
  } else if (type === 'TurretPreset') {
    tallyTurrets(data.turrets, designKindOf, tally);
  } else if (type === 'CustomProjectile') {
    tallyTurrets(data.turrets, designKindOf, tally);
    if (Array.isArray(data.turrets) && data.turrets.length > 0) tally.flags |= FACT.CARRIES_TURRETS;
    if (Array.isArray(data.bodyLayers) && data.bodyLayers.length > 0) tally.flags |= FACT.LAYERED;
    sides = Math.floor(typeof data.shape === 'number' ? data.shape : 0);
    if ((data.trapDepth ?? 0) > 0) tally.flags |= FACT.STAR_BODY;
  } else if (type === 'Other') {
    sides = data.body && typeof data.body === 'object' ? otherPartCount(data.body) : 0;
  } else if (type === 'FoodShape') {
    sides = Math.floor(typeof data.sides === 'number' ? data.sides : 0);
  }
  return [tally.rounds, tally.flags, tally.barrels, sides];
}

export interface CatalogRecord { id: string; type: string; category?: string; name?: string; data: any; }

export function addDesignOfName(m: Map<string, DesignOfName[]>, id: string, name: string | undefined, category: string | undefined, data: any): void {
  if (!data) return;
  const nm = typeof data.name === 'string' && data.name !== '' ? data.name : name;
  if (!nm) return;
  let l = m.get(nm);
  if (!l) { l = []; m.set(nm, l); }
  l.push({ kind: roundKindOfDesignCategory(category) ?? roundOfDesignData(data), data, id });
}

export function designsByNameOf(records: readonly CatalogRecord[]): Map<string, DesignOfName[]> {
  const m = new Map<string, DesignOfName[]>();
  for (const r of records) if (r.type === 'CustomProjectile') addDesignOfName(m, r.id, r.name, r.category, r.data);
  return m;
}

export function designKindFrom(byName: ReadonlyMap<string, DesignOfName[]>): DesignKindOf {
  return (n, carried) => {
    const l = byName.get(n);
    if (!l || l.length === 0) return undefined;
    let same = true;
    for (let i = 1; i < l.length; i++) if (l[i].kind !== l[0].kind) { same = false; break; }
    return same ? l[0].kind : designOfName(l, carried)?.kind;
  };
}

export const CATALOG_FORMAT = 1;

export interface BuiltCatalog { format: number; facts: Record<string, CatalogFacts>; designKinds: Record<string, number>; }

export function buildCatalogFacts(records: readonly CatalogRecord[]): BuiltCatalog {
  const byName = designsByNameOf(records);
  const kindOf = designKindFrom(byName);
  const facts: Record<string, CatalogFacts> = {};
  for (const r of records) facts[r.id] = catalogFacts(r.type, r.data, kindOf);
  const designKinds: Record<string, number> = {};
  for (const [k, l] of byName) if (l.every(d => d.kind === l[0].kind)) designKinds[k] = l[0].kind;
  return { format: CATALOG_FORMAT, facts, designKinds };
}
