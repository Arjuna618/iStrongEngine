import type { DamageContribution } from '../types';

export const KILL_SHARE_WINDOW_MS = 7000;
export const KILL_SHARE_FLOOR = 0.03;
export const KILL_ASSIST_SHARE = 0.25;
const KS_SWEEP_AT = 16;

const _pool: DamageContribution[] = [];

export function ksFresh(c: DamageContribution, now: number): boolean {
  return !(now - c.lastDamageTime > KILL_SHARE_WINDOW_MS);
}

export function ksNote(m: Map<string, DamageContribution>, id: string, dmg: number, at: number): void {
  const c = m.get(id);
  if (c !== undefined) {
    if (at - c.lastDamageTime > KILL_SHARE_WINDOW_MS) c.totalDamage = dmg; else c.totalDamage += dmg;
    c.lastDamageTime = at;
    return;
  }
  if (m.size >= KS_SWEEP_AT) ksSweep(m, at);
  const r = _pool.length > 0 ? _pool.pop()! : { ownerId: '', totalDamage: 0, lastDamageTime: 0 };
  r.ownerId = id; r.totalDamage = dmg; r.lastDamageTime = at;
  m.set(id, r);
}

export function ksSweep(m: Map<string, DamageContribution>, now: number): void {
  for (const c of m.values()) {
    if (!ksFresh(c, now)) { m.delete(c.ownerId); _pool.push(c); }
  }
}

export function ksDrop(m: Map<string, DamageContribution>, id: string): void {
  const c = m.get(id);
  if (c !== undefined) { m.delete(id); _pool.push(c); }
}

export function ksClear(m: Map<string, DamageContribution>): void {
  if (m.size === 0) return;
  for (const c of m.values()) _pool.push(c);
  m.clear();
}

export function ksEarns(c: DamageContribution, now: number, floor: number): boolean {
  return ksFresh(c, now) && c.totalDamage >= floor;
}
