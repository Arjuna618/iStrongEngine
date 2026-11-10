import type { EnemyTank } from '../types';
import { SMALL_FIX } from './smallFixSwitch';

export const BT_HEAL = 1, BT_DUTY = 2, BT_FIGHT = 4, BT_FEAR = 8;
export const BT_WAVOID = 16, BT_WTOUCH = 32;
export const BT_GUARD = 64, BT_ATTACK = 128;
export const BT_TAKE = 256, BT_SPOIL = 512;
export const BT_ESCORT = 1024;
const _g = globalThis as { process?: { env?: Record<string, string | undefined> } };
export const BOT_TACTICS = { ON: _g.process?.env?.ISTRONG_OLD_BOT_TACTICS === '1' ? 0 : 1 };

export const BT_FIGHT_TIER = 99;

export const BT_KINDS: readonly string[] = ['seekHeal', 'healerDuty', 'teamFight', 'fearLow', 'wallAvoid', 'wallTouch', 'guardTag', 'attackTag', 'takeTag', 'spoilTag', 'escortTag'];
export const BT_WALL = {
  AVOID: [1, 11] as readonly number[], MARGIN: 40, MARGIN_MAX: 300,
  TOUCH: [6, 4] as readonly number[], EVERY_MIN: 30, EVERY_MAX: 120, CHANCE: 20, HOLD_MIN: 5, HOLD_MAX: 25, SECONDS_MAX: 3600, HOLD_CAP: 300,
  GIVE_UP_MS: 15000, NONE_MS: 5000, PROGRESS: 30,
} as const;
export function btWallMask(v: unknown, def: readonly number[]): number {
  const l = Array.isArray(v) ? v : def;
  let m = 0;
  for (const t of l) if (typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < 19) m |= 1 << t;
  return m;
}
function _sec(v: unknown, def: number, lo: number, hi: number): number { const n = typeof v === 'number' && Number.isFinite(v) ? v : def; return Math.max(lo, Math.min(hi, n)) * 1000; }
export function btDraw(e: EnemyTank, salt: number): number {
  let h = 2166136261 ^ Math.imul(e._wqN + 1, 0x9e3779b1) ^ salt;
  const id = e.id;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function btBitOf(kind: string): number {
  switch (kind) {
    case 'seekHeal': return BT_HEAL;
    case 'healerDuty': return BT_DUTY;
    case 'teamFight': return BT_FIGHT;
    case 'fearLow': return BT_FEAR;
    case 'wallAvoid': return BT_WAVOID;
    case 'wallTouch': return BT_WTOUCH;
    case 'guardTag': return BT_GUARD;
    case 'attackTag': return BT_ATTACK;
    case 'takeTag': return BT_TAKE;
    case 'spoilTag': return BT_SPOIL;
    case 'escortTag': return BT_ESCORT;
  }
  return 0;
}
const _slot = (bit: number): number => bit === BT_HEAL ? 0 : bit === BT_DUTY ? 1 : bit === BT_FIGHT ? 2 : bit === BT_FEAR ? 3 : bit === BT_WAVOID ? 4 : bit === BT_WTOUCH ? 5 : bit === BT_GUARD ? 6 : bit === BT_ATTACK ? 7 : bit === BT_TAKE ? 8 : bit === BT_SPOIL ? 9 : 10;

export function btShare(v: unknown, def: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.max(0.01, Math.min(1, n / 100));
}
export function btBackOf(below: number, back: number): number { return Math.min(1, Math.max(back, below + 0.1)); }
const _idx = (v: unknown): number => typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : -1;

export function btApply(e: EnemyTank, kind: string, on: boolean, a: Record<string, unknown>): void {
  const bit = btBitOf(kind);
  if (bit === 0) return;
  const i = _slot(bit);
  if (on) {
    if (e._btN[i] < 127) e._btN[i]++;
    e._btBits |= bit;
    btWordsOf(e, bit, a);
    return;
  }
  btOff(e, bit, i);
}
export function btWords(e: EnemyTank, kind: string, a: Record<string, unknown>): void {
  const bit = btBitOf(kind);
  if (bit === 0 || (e._btBits & bit) === 0) return;
  btWordsOf(e, bit, a);
}
function btWordsOf(e: EnemyTank, bit: number, a: Record<string, unknown>): void {
  {
    if (bit === BT_HEAL) {
      e._hsBelow = btShare(a.below, 70); e._hsBack = btBackOf(e._hsBelow, btShare(a.back, 100));
      e._hsHealers = a.healers !== false; e._hsTag = _idx(a._tag); e._hsZone = _idx(a._zone);
    } else if (bit === BT_FIGHT) {
      e._tfHelp = a.help !== false;
      if (SMALL_FIX.GH532 !== 0 && !e._tfHelp && e._tfGoalId !== '') btEndGoal(e, '', 0);
    }
    else if (bit === BT_FEAR) { e._flBelow = btShare(a.below, 20); e._flBack = btBackOf(e._flBelow, btShare(a.back, 100)); }
    else if (bit === BT_WAVOID) {
      e._wkMask = btWallMask(a.walls, BT_WALL.AVOID);
      const m = typeof a.margin === 'number' && Number.isFinite(a.margin) ? a.margin : BT_WALL.MARGIN;
      e._wkPad = Math.max(0, Math.min(BT_WALL.MARGIN_MAX, m));
    } else if (bit === BT_WTOUCH) {
      e._wqMask = btWallMask(a.walls, BT_WALL.TOUCH);
      let lo = _sec(a.everyMin, BT_WALL.EVERY_MIN, 1, BT_WALL.SECONDS_MAX), hi = _sec(a.everyMax, BT_WALL.EVERY_MAX, 1, BT_WALL.SECONDS_MAX);
      if (hi < lo) { const s = lo; lo = hi; hi = s; }
      e._wqEvMin = lo; e._wqEvMax = hi;
      e._wqChance = btShare(a.chance, BT_WALL.CHANCE) * (typeof a.chance === 'number' && a.chance <= 0 ? 0 : 1);
      let h0 = _sec(a.holdMin, BT_WALL.HOLD_MIN, 1, BT_WALL.HOLD_CAP), h1 = _sec(a.holdMax, BT_WALL.HOLD_MAX, 1, BT_WALL.HOLD_CAP);
      if (h1 < h0) { const s = h0; h0 = h1; h1 = s; }
      e._wqHoldMin = h0; e._wqHoldMax = h1;
      e._wqNext = 0;
    } else if (bit === BT_GUARD) {
      e._ogTag = _idx(a._tag);
      const r = typeof a.radius === 'number' && Number.isFinite(a.radius) ? a.radius : 900;
      e._ogRadius = Math.max(100, Math.min(6000, r)); e._ogId = ''; e._ogLookAt = 0;
    } else if (bit === BT_ATTACK) { e._oaTag = _idx(a._tag); e._ogId = ''; e._ogLookAt = 0; }
    else if (bit === BT_TAKE) { e._ftTake = _idx(a._tag); e._ftId = ''; e._ftLookAt = 0; }
    else if (bit === BT_SPOIL) { e._ftSpoil = _idx(a._tag); e._ftId = ''; e._ftLookAt = 0; }
    else if (bit === BT_ESCORT) {
      e._esTag = _idx(a._tag); e._esId = ''; e._esLookAt = 0;
      e._esMax = typeof a.max === 'number' && Number.isFinite(a.max) ? Math.max(1, Math.min(20, Math.floor(a.max))) : 3;
      e._esRadius = typeof a.radius === 'number' && Number.isFinite(a.radius) ? Math.max(150, Math.min(3000, a.radius)) : 450;
    }
  }
}
function btOff(e: EnemyTank, bit: number, i: number): void {
  if (e._btN[i] > 0) e._btN[i]--;
  if (e._btN[i] !== 0) return;
  e._btBits &= ~bit;
  if (bit === BT_HEAL) btEndTrip(e, 0);
  else if (bit === BT_FIGHT) btEndGoal(e, '', 0);
  else if (bit === BT_FEAR) e._flLow = false;
  else if (bit === BT_WAVOID) { e._wkMask = 0; e._wkPad = 0; }
  else if (bit === BT_WTOUCH) { e._wqMask = 0; e._wqNext = 0; if (e._mmDo >= 2) e._mmDo = 0; }
  else if (bit === BT_GUARD) { e._ogTag = -1; e._ogId = ''; }
  else if (bit === BT_ATTACK) { e._oaTag = -1; e._ogId = ''; }
  else if (bit === BT_TAKE) { e._ftTake = -1; e._ftId = ''; }
  else if (bit === BT_SPOIL) { e._ftSpoil = -1; e._ftId = ''; }
  else if (bit === BT_ESCORT) { e._esTag = -1; e._esId = ''; }
}

export function btEndTrip(e: EnemyTank, coolUntil: number): void {
  e._hsOn = 0; e._hsId = ''; e._hsArea = -1; e._hsPickAt = 0; e._hsGiveUpAt = 0; e._hsKite = false;
  if (coolUntil > 0) e._hsCoolUntil = coolUntil;
}
export function btEndGoal(e: EnemyTank, banId: string, banUntil: number): void {
  e._tfGoalId = ''; e._tfHelpId = ''; e._tfGoalArriveAt = 0; e._tfGoalGiveUpAt = 0;
  if (banId !== '') { e._tfBanId = banId; e._tfBanUntil = banUntil; }
}

export function btResetLife(e: EnemyTank): void {
  e._btBits = 0; e._btN.fill(0);
  btEndTrip(e, 0); e._hsCoolUntil = 0; e._hsBestD = 0;
  btEndGoal(e, '', 0); e._tfBanId = ''; e._tfBanUntil = 0; e._tfLookAt = 0; e._flLow = false;
  e._hdMateId = ''; e._hdLookAt = 0;
  e._btRoute = ''; e._btWAt = 0; e._btWn = 0;
  e._wkMask = 0; e._wkPad = 0; e._wqMask = 0; e._wqNext = 0; if (e._mmDo >= 2) e._mmDo = 0;
  e._ogTag = -1; e._oaTag = -1; e._ogId = ''; e._ogLookAt = 0;
  e._ftTake = -1; e._ftSpoil = -1; e._ftId = ''; e._ftLookAt = 0; e._ctKite = false;
  e._ftGo = false; e._ftBestD = Infinity; e._ftGiveUpAt = 0; e._ftBan = ''; e._ftBanUntil = 0;
  e._esTag = -1; e._esId = ''; e._esLookAt = 0;
}

export const BT_MF_STANDS = 2;
export function btStandsStill(o: EnemyTank): boolean {
  return BOT_TACTICS.ON !== 0 && ((o._mevF & BT_MF_STANDS) !== 0 || o.isBaseProtector === true);
}

export const BT = {
  PICK_MS: 1000, GIVE_UP_MS: 30000, GAVE_UP_COOL_MS: 8000, NONE_COOL_MS: 2000, PROGRESS: 30,
  NEAR_PAD: 150, LEASH_PAD: 150, AREA_NEAR: 1,
  RING_K: 0.85, RING_EDGE: 25, RING_OUT: 60, RING_LEASH_MIN: 80, WALK_OUT_K: 0.9,
  GOAL_LOOK_MS: 500, GOAL_STALE_MS: 6000, GOAL_STOP_K: 0.45, GOAL_WAIT_MS: 3000, GOAL_GIVE_UP_MS: 25000, GOAL_BAN_MS: 10000,
  SIDE_LOOK_MS: 1000, SIDE_GO: 0.5, SIDE_STOP: 0.35, SIDE_FRONT_K: 1.5,
  DUTY_REACH: 0.35, DUTY_KEEP: 0.45,
  WANDER_MS: 2500, WANDER_ARRIVE: 40,
} as const;

export function btHas(e: EnemyTank, bit: number): boolean { return BOT_TACTICS.ON !== 0 && (e._btBits & bit) !== 0; }

export function btFearNote(e: EnemyTank, share: number): boolean {
  if (share < e._flBelow) { e._flLow = true; return false; }
  if (share >= e._flBack && e._flLow) { e._flLow = false; return true; }
  return false;
}
export function btNoFear(e: EnemyTank): boolean {
  if (BOT_TACTICS.ON === 0 || !(e._btBits > 0)) return false;
  return ((e._btBits & BT_FEAR) !== 0 && !e._flLow) || ((e._btBits & BT_HEAL) !== 0 && e._hsOn === 1);
}

export function btWanderPick(e: EnemyTank, cx: number, cy: number, rIn: number, rOut: number, now: number): void {
  let h = 2166136261 ^ e._btWn;
  const id = e.id;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13;
  const a = Math.atan2(e.position.y - cy, e.position.x - cx) + (((h >>> 0) % 2001) / 1000 - 1) * 1.4;
  const f = (((h >>> 12) >>> 0) % 1000) / 1000;
  const r = rIn + (rOut - rIn) * f;
  e._btWx = cx + Math.cos(a) * r; e._btWy = cy + Math.sin(a) * r;
  e._btWAt = now + BT.WANDER_MS; e._btWn = (e._btWn + 1) | 0;
}
