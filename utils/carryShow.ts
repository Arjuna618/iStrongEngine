export const CARRY_SHOW_ALPHA = 0.3;
const RISE_PER_MS = 0.04 * 60 / 1000;
const FALL_PER_MS = 0.015 * 60 / 1000;
export interface CarryMarked {
  _carryKey?: unknown;
  _carryOn?: boolean;
  _carryT0?: number;
  _carryF0?: number;
}

export function carryFloor(o: CarryMarked, key: unknown, now: number): number {
  const k = o._carryKey;
  if (k === undefined || k !== key) return 0;
  const dt = now - (o._carryT0 as number);
  const t = dt > 0 ? dt : 0;
  if (o._carryOn) { const f = (o._carryF0 as number) + RISE_PER_MS * t; return f < CARRY_SHOW_ALPHA ? f : CARRY_SHOW_ALPHA; }
  const f = (o._carryF0 as number) - FALL_PER_MS * t;
  return f > 0 ? f : 0;
}

export function carryMark(o: CarryMarked, key: unknown, on: boolean, now: number): void {
  const f = carryFloor(o, key, now);
  o._carryKey = key; o._carryOn = on; o._carryT0 = now; o._carryF0 = f;
}

export const CARRY_PLAYER_KEY = 'player';
