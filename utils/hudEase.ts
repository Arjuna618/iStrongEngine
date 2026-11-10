export function hudEase(a: number, t: number): number {
  if (a <= 1) { const q = Math.pow(a, 0.2) - t; return q > 0 ? Math.pow(q, 5) : 0; }
  const l = Math.log(a);
  const e = l + (t * -5);
  if (e >= 0) return Math.exp(e);
  const q = ((l / 5) + 1) - t;
  return q > 0 ? Math.pow(q, 5) : 0;
}

function signum(x: number): number {
  return x !== x ? NaN : (x > 0 || Object.is(x, 0)) ? 1 : -1;
}

export function roundHalfAway(x: number): number {
  const r = Math.trunc(x);
  return Math.abs(x - r) >= 0.5 ? r + Math.sign(x) : r;
}

export interface HudEaseRecord { stampUs: number; x: number; T: number; }

export function hudEaseStep(rec: HudEaseRecord, S: number, clockUs: number): number {
  const m = clockUs > 1 ? clockUs : 1;
  const t = (m > rec.stampUs ? m - rec.stampUs : 0) / 1000000 / 0.7;
  const d = rec.x - rec.T;
  const x2 = rec.T + (signum(d) * hudEase(Math.abs(d), t));
  rec.stampUs = m;
  rec.x = x2;
  rec.T = S;
  const d2 = x2 - S;
  return (signum(d2) * hudEase(Math.abs(d2), 0)) + S;
}

export function hudXpAdvance(rec: HudEaseRecord, S: number, clockUs: number, easeDrops = false): number {
  if ((!(S >= rec.T) && !(easeDrops && S === S)) || rec.x !== rec.x) { rec.x = S; rec.T = S; }
  return hudEaseStep(rec, S, clockUs);
}

export function hudLevelFloor(s: number, coeff: number): number {
  return Math.floor(Math.cbrt(s / coeff));
}

export function hudXpFill(s: number, F: number, coeff: number): number {
  const a = ((F + 1) * ((F + 1) * (F + 1))) * coeff;
  const b = (F * (F * F)) * coeff;
  return (s - b) / (a - b);
}

export interface HudXpView { level: number; pct: number; }

export function hudXpView(v: number, coeff: number, offset: number, cap: number, out: HudXpView): void {
  const s = roundHalfAway(v);
  const F = hudLevelFloor(s, coeff);
  const level = F + 1 - offset;
  out.level = level;
  out.pct = level >= cap ? 100 : hudXpFill(s, F, coeff) * 100;
}

export function hudScoreOfXp(xp: number, base: number): number {
  return Math.floor(xp) + base;
}

export const LB_BLEND_US = 250000;

export function lbBlendValue(old: number, now: number, stampUs: number, clockUs: number): number {
  if (stampUs === 0) return now;
  const m = clockUs > 1 ? clockUs : 1;
  const dd = m > stampUs ? m - stampUs : 0;
  if (dd < LB_BLEND_US) { const t = (dd / 1000000) * 4; return ((1 - t) * old) + (t * now); }
  return now;
}

export function lbMaxFold(acc: number, value: number): number {
  const a1 = acc !== acc ? value : acc;
  const v1 = value !== value ? a1 : value;
  return a1 > v1 ? a1 : v1;
}

export function lbScoreOf(t: { currentXp: number }, start = 0): number {
  return t.currentXp + start;
}

export function lbU32(v: number): number {
  return !(v >= 0) ? 0 : !(v <= 4294967295) ? 4294967295 : Math.trunc(v);
}

export function lbAbbrev(n: number): string {
  if (n < 1000) return String(n);
  if (n >= 1e9) {
    const x = Math.floor(n / 1e6);
    const h = Math.floor((x % 1000) / 10);
    return `${Math.floor(x / 1000)}.${h < 10 ? '0' : ''}${h}b`;
  }
  const s = n >= 1e6 ? Math.floor(n / 1000) : n;
  const unit = n >= 1e6 ? 'm' : 'k';
  const f = s % 1000;
  if (s <= 99999) {
    const h = Math.floor(f / 10);
    return `${Math.floor(s / 1000)}.${h < 10 ? '0' : ''}${h}${unit}`;
  }
  return `${Math.floor(s / 1000)}.${Math.floor(f / 100)}${unit}`;
}

export const ENTITY_EASE_SEC = 1 / 30;

export function entityEase(drawn: number, to: number, left: number, dt: number): number {
  return dt >= left ? to : drawn + (to - drawn) * (dt / left);
}

export function barGlide(drawn: number, to: number, max: number, dt: number): number {
  if (!(max > 0) || !(to > drawn)) return to;
  const a = (to - drawn) / max * 255;
  return to - hudEase(a, dt / 0.7) * max / 255;
}

const KILLS_BAR_LERP = 0.1;
export const KILLS_BAR_LERP_HZ = 60;
const KILLS_BAR_MAX_STEP = 0.1;

export function killsBarLerpStep(elapsedSec: number): number {
  const e = Math.min(Math.max(elapsedSec, 0), KILLS_BAR_MAX_STEP);
  return 1 - Math.pow(1 - KILLS_BAR_LERP, e * KILLS_BAR_LERP_HZ);
}
