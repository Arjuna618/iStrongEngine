export const SKIP_MAX_MINUTES = 99999;
export const SKIP_CLIMB_S = 2;
export const SKIP_CLIMB_MAX_MS = 8000;
export const SKIP_LIFE_CAP = 6;
export const SKIP_FRESH_SHARE = 0.15;

export const SKIP_XP_BY_MINUTE: readonly number[] = [0, 18603, 36990, 102763, 183456, 384179, 580158, 769617, 875617, 1010174, 1096167];
export const SKIP_XP_PER_MIN_TAIL = 142398;
export const SKIP_MEAN_LIFE_MIN = 5;

export function skipXpAt(m: number): number {
  const t = SKIP_XP_BY_MINUTE;
  if (!(m > 0)) return 0;
  const last = t.length - 1;
  if (m >= last) return t[last] + (m - last) * SKIP_XP_PER_MIN_TAIL;
  const i = Math.floor(m), f = m - i;
  return t[i] + (t[i + 1] - t[i]) * f;
}
export function skipMinutesFor(xp: number): number {
  if (!(xp > 0)) return 0;
  const t = SKIP_XP_BY_MINUTE, last = t.length - 1;
  if (xp >= t[last]) return SKIP_XP_PER_MIN_TAIL > 0 ? last + (xp - t[last]) / SKIP_XP_PER_MIN_TAIL : last;
  for (let i = 1; i <= last; i++) if (t[i] >= xp) { const d = t[i] - t[i - 1]; return i - 1 + (d > 0 ? (xp - t[i - 1]) / d : 0); }
  return last;
}
export function skipLifeOf(u: number): number {
  const x = -Math.log(u > 1e-12 ? u : 1e-12);
  return SKIP_MEAN_LIFE_MIN * Math.min(x, SKIP_LIFE_CAP);
}

export function skipTargetXp(roomMin: number, d0: number, d1: number, d2: number, keep: ((deathXp: number) => number) | null): number {
  const room = Math.max(0, Math.min(roomMin, SKIP_MAX_MINUTES));
  if (d0 < SKIP_FRESH_SHARE) return skipXpAt(Math.min(room, d0 / SKIP_FRESH_SHARE));
  const life = skipLifeOf(d1);
  if (life >= room) return skipXpAt(room);
  let head = 0;
  if (keep !== null) {
    const before = Math.min(room - life, skipLifeOf(d2));
    head = skipMinutesFor(keep(skipXpAt(before)));
  }
  return skipXpAt(head + life);
}
