import { ARRAS_PARITY, ARRAS_SKILL_POINTS_BAR } from './arrasCombat';

const _g = globalThis as { __ISTRONG_OLD_BLOCKS?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_BLOCKS === 1 || _g.process?.env?.ISTRONG_OLD_BLOCKS === '1';

export const BLOCK_PUSH = {
  ON: _old ? 0 : 1,
  K: 12.8,
  R_REF: 12,
  SIZE_EXP: 0.5,
  PEN_EXP: 1.4,
  CLOSE: 0.6,
  CLOSE_PEN_EXP: 1.0,
  HOLD_S: 200 / 30,
};

const _softCache = new Float64Array(2 * 32 * 32).fill(NaN);
const _closeCache = new Float64Array(2 * 32 * 32).fill(NaN);
function _skIdx(points: number, cap: number): number { return points * 32 + cap + (ARRAS_PARITY.SKILL_PAST_CAP !== 0 ? 1024 : 0); }
function _skPenOf(points: number, cap: number): number {
  const r = ARRAS_PARITY.SKILL_PAST_CAP !== 0 ? points / ARRAS_SKILL_POINTS_BAR : Math.min(1, points / cap);
  return 1 + 2.5 * Math.log(4 * r + 1) / 1.6;
}

export function blockPenSoft(points: number, cap: number): number {
  if (!(points > 0) || !(cap > 0)) return 1;
  const whole = points === Math.floor(points) && cap === Math.floor(cap) && points < 32 && cap < 32;
  if (whole) { const v = _softCache[_skIdx(points, cap)]; if (v === v) return v; }
  const s = Math.pow(_skPenOf(points, cap), -BLOCK_PUSH.PEN_EXP);
  if (whole) _softCache[_skIdx(points, cap)] = s;
  return s;
}

export function blockPenClose(points: number, cap: number): number {
  if (!(points > 0) || !(cap > 0)) return 1;
  const whole = points === Math.floor(points) && cap === Math.floor(cap) && points < 32 && cap < 32;
  if (whole) { const v = _closeCache[_skIdx(points, cap)]; if (v === v) return v; }
  const s = Math.pow(_skPenOf(points, cap), -BLOCK_PUSH.CLOSE_PEN_EXP * 0.5);
  if (whole) _closeCache[_skIdx(points, cap)] = s;
  return s;
}

export function blockSizeSoft(r: number): number {
  const q = BLOCK_PUSH.R_REF / Math.max(r, 1e-6);
  return BLOCK_PUSH.SIZE_EXP === 0.5 ? Math.sqrt(q) : Math.pow(q, BLOCK_PUSH.SIZE_EXP);
}

export function blockPenSoftReset(): void { _softCache.fill(NaN); _closeCache.fill(NaN); }
