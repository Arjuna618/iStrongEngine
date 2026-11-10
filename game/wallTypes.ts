import type { WallEntity } from '../types';

export const WALL_TYPES_4S = {
  ON: true,
  CRUSH: true,
  DRAG_INTO: true,
  ONE_WAY_SIDE: true,
  ONE_WAY_TICK: true,
  STICK_CORNER: true,
  STICK_LAW: true,
  STICK_STEPK: true,
  TRIP_FAR_JUMP: true,
};

export const WT_PLAIN = 0, WT_DEADLY = 1, WT_HEALING = 2, WT_BOUNCY = 3, WT_BREAKER = 4, WT_CHUNKS = 5, WT_OPTICAL = 6;
export const WT_UP = 7, WT_DOWN = 8, WT_LEFT = 9, WT_RIGHT = 10, WT_STICKY = 11, WT_TRICK = 12, WT_PAINT = 13, WT_FILTER = 14;
export const WT_TEAM = 15, WT_BASE = 16, WT_PORTAL = 17, WT_CHECKPOINT = 18;
export const WT_COUNT = 19;

export const BODY_SOLID = 0;
export const BODY_PASS = 1;
export const BODY_COLOUR = 2;
export const BODY_TEAMMATE = 3;
export const BODY_ONE_WAY = 4;
export const BODY_STICKY = 5;
export const ROUND_DIE = 0;
export const ROUND_PASS = 1;
export const ROUND_STOP = 2;
export const ROUND_BOUNCE = 3;
export const ROUND_STICK = 4;

export interface WallRule {
  name: string;
  body: number;
  round: number;
  hit: number;
  heal: number;
  bounce: number;
  sizeAdd: number;
  view: number;
  ax: number; ay: number;
  paint: boolean;
  team: boolean;
  checkpoint: boolean;
  portal: boolean;
  crush: boolean;
  slot: number;
  alpha: number;
  nearFade: boolean;
}

const R = (name: string, body: number, round: number, o: Partial<WallRule>): WallRule => ({
  name, body, round, hit: 0, heal: 0, bounce: 0, sizeAdd: 0, view: 1, ax: 0, ay: 0,
  paint: false, team: false, checkpoint: false, portal: false, crush: body === BODY_SOLID || body === BODY_COLOUR || body === BODY_TEAMMATE, slot: 7,
  alpha: 1, nearFade: false, ...o,
});

export const WALL_RULES: readonly WallRule[] = Object.freeze([
  R('Wall', BODY_SOLID, ROUND_DIE, { slot: 7 }),
  R('Deadly Wall', BODY_SOLID, ROUND_DIE, { hit: 0.6, bounce: 9.8, slot: 12 }),
  R('Healing Wall', BODY_SOLID, ROUND_DIE, { heal: 0.6, slot: 11 }),
  R('Bouncy Wall', BODY_SOLID, ROUND_BOUNCE, { bounce: 19.6, slot: 19 }),
  R('Breaker Wall', BODY_SOLID, ROUND_STOP, { sizeAdd: 22.5, slot: 5 }),
  R('Chunks Wall', BODY_SOLID, ROUND_DIE, { sizeAdd: -12, slot: 4 }),
  R('Optical Wall', BODY_SOLID, ROUND_DIE, { view: 2.5, slot: 13 }),
  R('One-Way Wall (Up)', BODY_ONE_WAY, ROUND_DIE, { ax: 0, ay: -1, slot: 17 }),
  R('One-Way Wall (Down)', BODY_ONE_WAY, ROUND_DIE, { ax: 0, ay: 1, slot: 17 }),
  R('One-Way Wall (Left)', BODY_ONE_WAY, ROUND_DIE, { ax: -1, ay: 0, slot: 17 }),
  R('One-Way Wall (Right)', BODY_ONE_WAY, ROUND_DIE, { ax: 1, ay: 0, slot: 17 }),
  R('Sticky Wall', BODY_STICKY, ROUND_STICK, { crush: false, slot: 6 }),
  R('Trick Wall', BODY_PASS, ROUND_PASS, { crush: false, slot: 7, alpha: 0.965, nearFade: true }),
  R('Paint Wall', BODY_SOLID, ROUND_STOP, { paint: true, slot: 6 }),
  R('Filter Wall', BODY_COLOUR, ROUND_DIE, { slot: 6, alpha: 0.1 }),
  R('Team Wall', BODY_SOLID, ROUND_DIE, { team: true, slot: 12 }),
  R('Base Wall', BODY_TEAMMATE, ROUND_DIE, { hit: 0.6, bounce: 9.8, slot: 12, alpha: 0.3 }),
  R('Portal Wall', BODY_PASS, ROUND_DIE, { portal: true, crush: false, slot: 10, alpha: 0.75 }),
  R('Checkpoint Wall', BODY_PASS, ROUND_DIE, { checkpoint: true, crush: false, slot: 11, alpha: 0.5 }),
]);

export const WALL_CRUSH_TICK = 0.01;
export const WALL_CRUSH_SLACK = 2;
export const WALL_TICK_MS = 1000 / 30;
export const WALL_EDGE_INSET = 1.5;
export const WALL_ONE_WAY_PUSH = 0.9;
export const WALL_ONE_WAY_SIDE = 8.5;
export const WALL_STICK_SPEED = 13, WALL_STICK_KEEP = 0.86, WALL_STICK_OUT = 0.46, WALL_STICK_REST = 13 * 0.54 / 0.46, WALL_STICK_MAX = 18.9;
export const WALL_STICK_SETTLE = 0.14;
export const WALL_STICK_HOLD = 8, WALL_STICK_CORNER = 0;
export const WALL_STICK_LAW = Object.freeze({
  DIN: 8.26, P1: 0.86, CAP: 1.04, K: 0.12, D0: 16.5, OUT_KEEP: 0.403, OUT_TURN: 0.563, TURN_SPEED: 2.78, DRIFT: 0.2,
  C_RP: 0.575, C_RN: 0.24, C_RD: 0.219, C_R0: 10.7, C_TT: 0.931, C_TP: 0.713, C_TN: -0.0225, C_TD: 0.289, C_T0: 4.24,
});
export const WALL_DRAG_DEPTH = 1.78;
export const WALL_PORTAL_KEEP = 0.8, WALL_PORTAL_DRAW = 0.15, WALL_PORTAL_CATCH = 6.6, WALL_PORTAL_OUT = 1.3;
export const WALL_TRICK_NEAR = 60;
export function wallLookAlpha(kind: number, gap: number): number {
  const r = WALL_RULES[kind];
  if (r === undefined || r.alpha >= 1) return 1;
  if (!r.nearFade) return r.alpha;
  const near = gap >= WALL_TRICK_NEAR ? 0 : gap <= 0 ? 1 : 1 - gap / WALL_TRICK_NEAR;
  return 1 - (1 - r.alpha) * near;
}
export const WALL_TEAM = -101;

export const MSG_STUPID_DEATH = 'You have died a stupid death.';
export const MSG_RESPAWN_SET = 'Respawn point set.';
export const MSG_NO_PORTAL = 'There is no portal to travel to.';
export const MSG_PORTAL_TRIP = 'You have traveled through a portal!';

export function wallKindOf(w: WallEntity): number {
  return WALL_TYPES_4S.ON && w.kind !== undefined ? w.kind : 0;
}
export function wallSlotOf(w: WallEntity): number {
  return w.wslot !== undefined && w.wslot >= 0 ? w.wslot : WALL_RULES[w.kind ?? 0].slot;
}
export function wallTeamOf(w: WallEntity): number {
  return w.wteam !== undefined ? w.wteam : WALL_TEAM;
}

const B_NONE = 0, B_BODY = 1, B_ROUND = 2;
let _wb = B_NONE, _wbSlot = -1, _wbTeam = 0, _wbVx = 0, _wbVy = 0, _wbR = 0;
export function wallBodySet(slot: number, team: number, vx: number = 0, vy: number = 0, r: number = 0): void {
  _wb = B_BODY; _wbSlot = slot; _wbTeam = team; _wbVx = vx; _wbVy = vy; _wbR = r;
}
export function wallRoundSet(): void { _wb = B_ROUND; }
export function wallBodyClear(): void { _wb = B_NONE; }

let _sb = false, _sbSlot = -1, _sbTeam = 0, _sbOx = 0, _sbOy = 0, _sbAvoid = 0, _sbPad = 0;
export function wallSteerSet(slot: number, team: number, ox: number, oy: number, avoid: number, pad: number): void {
  _sb = WALL_TYPES_4S.ON; _sbSlot = slot; _sbTeam = team; _sbOx = ox; _sbOy = oy; _sbAvoid = avoid; _sbPad = pad > 0 ? pad : 0;
}
export function wallSteerClear(): void { _sb = false; }
export function wallSteerOn(): boolean { return _sb && _wb === B_NONE; }
export function wallSteerPad(w: WallEntity): number {
  return _sb && _wb === B_NONE && w.kind !== undefined && w.kind > 0 && ((_sbAvoid >> w.kind) & 1) !== 0 ? _sbPad : 0;
}
function _steerOneWay(w: WallEntity, r: WallRule): boolean {
  const dx = _sbOx - w.x, dy = _sbOy - w.y;
  const along = dx * r.ax + dy * r.ay, side = dx * -r.ay + dy * r.ax;
  const halfA = r.ax !== 0 ? w.halfW : w.halfH, halfS = r.ax !== 0 ? w.halfH : w.halfW;
  return (side < 0 ? -side : side) <= halfS && along <= halfA;
}

export function wallSkips(w: WallEntity, x: number, y: number): boolean {
  if (w.kind === undefined || w.kind === 0 || !WALL_TYPES_4S.ON) return false;
  if (_wb === B_NONE) {
    if (!_sb) return false;
    const s = WALL_RULES[w.kind];
    switch (s.body) {
      case BODY_PASS: return true;
      case BODY_COLOUR: return _sbSlot === wallSlotOf(w);
      case BODY_TEAMMATE: return _sbTeam === wallTeamOf(w);
      case BODY_ONE_WAY: return _steerOneWay(w, s);
      default: return false;
    }
  }
  const r = WALL_RULES[w.kind];
  if (_wb === B_ROUND) return r.round === ROUND_PASS;
  switch (r.body) {
    case BODY_PASS: case BODY_STICKY: return true;
    case BODY_COLOUR: return _wbSlot === wallSlotOf(w);
    case BODY_TEAMMATE: return _wbTeam === wallTeamOf(w);
    case BODY_ONE_WAY: return oneWayOpen(w, r, x, y);
    default: return false;
  }
}

export function oneWayOpen(w: WallEntity, r: WallRule, x: number, y: number): boolean {
  const dx = x - w.x, dy = y - w.y;
  const along = dx * r.ax + dy * r.ay, side = dx * -r.ay + dy * r.ax;
  const halfA = r.ax !== 0 ? w.halfW : w.halfH, halfS = r.ax !== 0 ? w.halfH : w.halfW;
  if ((side < 0 ? -side : side) > halfS) return false;
  return along <= halfA || (along < halfA + _wbR && _wbVx * r.ax + _wbVy * r.ay > 0);
}

export const wallN = { x: 0, y: 0 };
export function wallDepth(w: WallEntity, x: number, y: number, rad: number): number {
  const dx = x - w.x, dy = y - w.y;
  const ox = (dx < 0 ? -dx : dx) - w.halfW, oy = (dy < 0 ? -dy : dy) - w.halfH;
  if (ox <= 0 && oy <= 0) {
    if (ox > oy) { wallN.x = dx < 0 ? -1 : 1; wallN.y = 0; } else { wallN.x = 0; wallN.y = dy < 0 ? -1 : 1; }
    return rad - (ox > oy ? ox : oy);
  }
  if (ox > 0 && oy > 0) {
    const d = Math.sqrt(ox * ox + oy * oy);
    wallN.x = (dx < 0 ? -ox : ox) / d; wallN.y = (dy < 0 ? -oy : oy) / d;
    return rad - d;
  }
  if (ox > 0) { wallN.x = dx < 0 ? -1 : 1; wallN.y = 0; return rad - ox; }
  wallN.x = 0; wallN.y = dy < 0 ? -1 : 1; return rad - oy;
}
