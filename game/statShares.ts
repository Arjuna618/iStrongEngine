import type { UpgradeStat } from '../types';

const _g = globalThis as { process?: { env?: Record<string, string | undefined> } };

export const STAT_SHARES = {
  ON: _g.process?.env?.ISTRONG_OLD_STAT_SHARES === '1' ? 0 : 1,
  EVERY_WAY: _g.process?.env?.ISTRONG_OLD_STAT_EVERY_WAY === '1' ? 0 : 1,
};

export type StatShares = Partial<Record<UpgradeStat, number>>;

export const SHARE_STATS: readonly { id: UpgradeStat; name: string }[] = [
  { id: 'maxHealth', name: 'Max Health' },
  { id: 'bodyDamage', name: 'Body Damage' },
  { id: 'bulletHealth', name: 'Bullet Health' },
  { id: 'bulletPenetration', name: 'Bullet Penetration' },
  { id: 'bulletDamage', name: 'Bullet Damage' },
  { id: 'shieldRegen', name: 'Shield Regeneration' },
  { id: 'shieldCapacity', name: 'Shield Capacity' },
  { id: 'bulletSpeed', name: 'Bullet Speed' },
  { id: 'reload', name: 'Reload' },
  { id: 'movementSpeed', name: 'Movement Speed' },
];

export const STAT_SHARE_MIN = 10;
export const STAT_SHARE_MAX = 1000;

export const BOSS_SHARE = 90;
export const BOSS_SHARE_STATS: readonly UpgradeStat[] = ['maxHealth', 'bodyDamage', 'bulletHealth', 'bulletPenetration', 'bulletDamage', 'shieldRegen', 'shieldCapacity'];

export function bossShares(): StatShares {
  const s: StatShares = {};
  for (let i = 0; i < BOSS_SHARE_STATS.length; i++) s[BOSS_SHARE_STATS[i]] = BOSS_SHARE;
  return s;
}

const _num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function clampStatShares(raw: unknown): StatShares | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: StatShares = {};
  let any = false;
  for (let i = 0; i < SHARE_STATS.length; i++) {
    const id = SHARE_STATS[i].id, v = _num(src[id]);
    if (v === undefined) continue;
    out[id] = Math.max(STAT_SHARE_MIN, Math.min(STAT_SHARE_MAX, v));
    any = true;
  }
  return any ? out : undefined;
}

export interface StatK {
  readonly maxHealth: number; readonly bodyDamage: number; readonly bulletHealth: number; readonly bulletPenetration: number;
  readonly bulletDamage: number; readonly shieldRegen: number; readonly shieldCapacity: number; readonly bulletSpeed: number;
  readonly reload: number; readonly movementSpeed: number;
  readonly key: string;
}

const _kOf = new WeakMap<object, StatK | null>();

export function statKOf(raw: StatShares | undefined | null): StatK | null {
  if (STAT_SHARES.ON === 0 || raw === null || raw === undefined || typeof raw !== 'object') return null;
  const kept = _kOf.get(raw);
  if (kept !== undefined) return kept;
  const c = clampStatShares(raw);
  let k: StatK | null = null;
  if (c) {
    const f = (id: UpgradeStat): number => (c[id] ?? 100) / 100;
    let same = true;
    for (let i = 0; i < SHARE_STATS.length; i++) if ((c[SHARE_STATS[i].id] ?? 100) !== 100) { same = false; break; }
    if (!same) {
      k = {
        maxHealth: f('maxHealth'), bodyDamage: f('bodyDamage'), bulletHealth: f('bulletHealth'), bulletPenetration: f('bulletPenetration'),
        bulletDamage: f('bulletDamage'), shieldRegen: f('shieldRegen'), shieldCapacity: f('shieldCapacity'), bulletSpeed: f('bulletSpeed'),
        reload: f('reload'), movementSpeed: f('movementSpeed'),
        key: SHARE_STATS.map(s => c[s.id] ?? 100).join(','),
      };
    }
  }
  _kOf.set(raw, k);
  return k;
}

export function shareOf(k: StatK | null | undefined, stat: UpgradeStat): number {
  return k ? k[stat] : 1;
}

export function sharesSummary(s: StatShares | undefined): { moved: number; value: number | null } {
  if (!s) return { moved: 0, value: null };
  let moved = 0, value: number | null = null, one = true;
  for (let i = 0; i < SHARE_STATS.length; i++) {
    const v = s[SHARE_STATS[i].id];
    if (v === undefined || v === 100) continue;
    moved++;
    if (value === null) value = v; else if (v !== value) one = false;
  }
  return { moved, value: one ? value : null };
}
