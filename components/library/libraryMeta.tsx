import type { CustomProjectileDesign } from '../../types';
import { ROUND, ROUND_KEYS, FACT } from './catalogCore';
import type { LibEntry } from './catalog';
import { RARITY_LABELS } from '../../game/ShapeRegistry';

export const ROUND_WORD: Record<string, string> = {
  BULLET: 'Bullets', DRONE: 'Drones', MINION: 'Minions', TRAP: 'Traps', SWARM: 'Swarm drones',
  MISSILE: 'Missiles', HIVE: 'Hives', TANK: 'Tanks', BOMB: 'Bombs', BOOMERANG: 'Boomerangs',
};

export function roundsOf(rounds: number): string[] {
  const out: string[] = [];
  for (const k of ROUND_KEYS) if (rounds & (ROUND as Record<string, number>)[k]) out.push(k);
  return out;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export function cardFacts(e: LibEntry): string[] {
  const [, flags, barrels, sides] = e.facts;
  switch (e.kind) {
    case 'tank':
    case 'sentry':
      if (barrels === 0) return [(flags & FACT.SMASHER) ? 'Smasher' : 'No barrels'];
      return [plural(barrels, 'barrel', 'barrels')];
    case 'turret':
      if (flags & FACT.AUTO) return barrels > 0 ? ['Auto turret', plural(barrels, 'barrel', 'barrels')] : ['Auto turret'];
      return [plural(barrels, 'barrel', 'barrels')];
    case 'projectile': {
      const d = e.item?.fileData.data as CustomProjectileDesign | undefined;
      const n = d?.turrets?.length ?? 0;
      return [n > 0 ? `Carries ${plural(n, 'turret', 'turrets')}` : 'No turrets'];
    }
    case 'other': return [sides <= 1 ? 'One shape' : `${sides} shapes`];
    case 'shape': {
      const s = e.shape;
      if (!s) return [];
      const bits: string[] = [];
      if (s.isPolyhedron) bits.push('Solid');
      if (s.rarity !== 'normal') bits.push(RARITY_LABELS[s.rarity]);
      if (s.labyLevel > 0) bits.push(`${s.labyLevel} nested`);
      if (s.isCrasher) bits.push('Crasher');
      if (s.scaleVariant !== 'normal') bits.push(s.scaleVariant === 'alpha' ? 'Alpha' : 'Beta');
      return bits.length > 0 ? bits : ['Normal'];
    }
  }
  return [];
}

export function cardMeta(e: LibEntry): string {
  return cardFacts(e).join(', ');
}
