import { carryFloor, type CarryMarked } from './carryShow';

export const SEEN = {
  FAR: 250,
  NEAR: 50,
  FAINT: 0.2,
  OWN: 0.2,
  ACQUIRE: 0.05,
} as const;

const FAR_SQ = SEEN.FAR * SEEN.FAR;
const NEAR_SQ = SEEN.NEAR * SEEN.NEAR;
const INV_RANGE_SQ = 1 / (FAR_SQ - NEAR_SQ);
export const SEEN_ACQUIRE_EDGE = Math.sqrt(NEAR_SQ + (1 - SEEN.ACQUIRE / SEEN.FAINT) * (FAR_SQ - NEAR_SQ));

export function edgeDistance(centreDistSq: number, radiusSum: number): number {
  const d = Math.sqrt(centreDistSq) - radiusSum;
  return d > 0 ? d : 0;
}

export function nearness(edge: number): number {
  const sq = edge * edge;
  if (sq >= FAR_SQ) return 0;
  if (sq <= NEAR_SQ) return 1;
  return 1 - (sq - NEAR_SQ) * INV_RANGE_SQ;
}

export function shownTo(own: number, edge: number): number {
  const near = nearness(edge) * SEEN.FAINT;
  return own > near ? own : near;
}

export function tankOwnShowing(fadeAlpha: number): number {
  return fadeAlpha <= SEEN.OWN ? 0 : (fadeAlpha - SEEN.OWN) / (1 - SEEN.OWN);
}

export function fadeSecondsOfRate(rate: number): number {
  return rate > 0 ? (1 - SEEN.OWN) / (rate * 60) : 0;
}
export function fadeRateOfSeconds(seconds: number): number {
  return (1 - SEEN.OWN) / (Math.max(0.05, seconds) * 60);
}

export function drawnOpacity(t: { invisEnabled?: boolean; invisAlpha: number; viewAlpha?: number; id?: string } & CarryMarked, now: number = NaN): number {
  const a = t.invisEnabled === true && t.viewAlpha !== undefined ? t.viewAlpha : t.invisAlpha;
  if (t._carryKey === undefined || now !== now) return a;
  const f = carryFloor(t, t.id, now);
  return f > a ? f : a;
}

export function seenBy(own: number, centreDistSq: number, radiusSum: number, held: boolean): boolean {
  if (held ? own > 0 : own >= SEEN.ACQUIRE) return true;
  const lim = (held ? SEEN.FAR : SEEN_ACQUIRE_EDGE) + radiusSum;
  return centreDistSq < lim * lim;
}
