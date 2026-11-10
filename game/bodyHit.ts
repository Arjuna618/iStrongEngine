import { SHAPE_BOOK } from './shapeBook.generated';
import { SMALL_FIX } from './smallFixSwitch';

const _env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export const BODY_HIT = {
  ON: (_env?.ISTRONG_OLD_RAM === '1' ? 0 : 1),
  GRACE: (_env?.ISTRONG_OLD_GRACE === '1' ? 0 : 1),
  TAKE_1019: (_env?.ISTRONG_OLD_SHAPE_RAM === '1' ? 0 : 1),
  TAKE_1020: (_env?.ISTRONG_OLD_TRI_RAM === '1' || _env?.ISTRONG_OLD_SHAPE_RAM === '1' ? 0 : 1),
  REF_HP: 220,
  TANK_K: (32 / 255) * 220 / 3,
  BRST_HEALTH: 0.15, BRST_BODY: 0.25,
  ATK_BODY: 0.052,
  TANK_KNOCK_K: 1.40,
  TANK_PEN_BD: 0.57, TANK_PEN_MH: 0.2913,
  TANK_HEALTH: 0,
  TEAM_K: 45, TEAM_A: 1, TEAM_SOAK: 0.35,
  DEATH: (_env?.ISTRONG_OLD_RAM_DEATH === '1' ? 0 : 1),
  HIT_1102: (_env?.ISTRONG_OLD_SHAPE_HIT === '1' ? 0 : 1),
  IN_HP: 0.2606, IN_BD: 0.478,
  TANK_K_1102: (31.36 / 255) * 220 / 3,
  SMASH_EACH: (_env?.ISTRONG_OLD_SMASH_PAIR === '1' ? 0 : 1 / 3),
  TANK_DEATH: (_env?.ISTRONG_OLD_TANK_DEATH === '1' ? 0 : 1),
};

export function smashPairK(aIsSmasher: boolean, bIsSmasher: boolean): number {
  return 1 + BODY_HIT.SMASH_EACH * ((aIsSmasher ? 1 : 0) + (bIsSmasher ? 1 : 0));
}

export function bothDieKeep(health: number, maxHealth: number): number {
  return health <= 0 && health > -1e-9 * maxHealth ? 1e-9 * maxHealth : health;
}

export function bodyHitDeathK(take: number, hp: number, shield: number, maxShield: number): number {
  if (!(take > 0)) return 1;
  const hpPart = shield > 0 && maxShield > 0 ? take - Math.min(take * Math.min(1, shield / maxShield), shield) : take;
  return hpPart > hp ? (hp > 0 ? hp / hpPart : 0) : 1;
}

export function graceIsSolid(): boolean {
  return BODY_HIT.ON !== 0 && BODY_HIT.GRACE !== 0;
}
export const TEAM_DV = { a: 0, b: 0 };
export function teamShareA(rA: number, rB: number): number {
  const mA = rA * rA + 1, mB = rB * rB + 1;
  return mB / (mA + mB);
}
export function teamPush(overlap: number, rA: number, rB: number): typeof TEAM_DV {
  const o = TEAM_DV;
  o.a = 0; o.b = 0;
  const small = Math.min(rA, rB);
  if (!(overlap > 0) || !(small > 0)) return o;
  const mA = rA * rA + 1, mB = rB * rB + 1;
  const f = BODY_HIT.TEAM_K * Math.pow(Math.min(overlap, rA + rB) / (2 * small), BODY_HIT.TEAM_A);
  o.a = f * mB / (mA + mB);
  o.b = f * mA / (mA + mB);
  return o;
}

const FULL_ATTRIB = Math.log(5) / 1.6;
export function tankPairPen(base: number, attribBody: number, attribHealth: number): number {
  return base + (BODY_HIT.TANK_PEN_BD * attribBody + BODY_HIT.TANK_PEN_MH * attribHealth) / FULL_ATTRIB;
}

interface HitKind { anchor: string; take: number; hit: number; anchorBd: number; resist: number; abs: number; hitPerBd: number }
const kind = (anchor: string, take: number, hit: number, anchorBd: number, resist = -1): HitKind => {
  const row = SHAPE_BOOK[anchor];
  const abs = row ? take * (row.hp + row.shield) : 0;
  return { anchor, take, hit, anchorBd, resist, abs, hitPerBd: anchorBd > 0 ? hit * BODY_HIT.REF_HP / anchorBd : 0 };
};
const TRI_TAKE = BODY_HIT.TAKE_1020 !== 0 ? 63 / 255 : BODY_HIT.TAKE_1019 !== 0 ? 74 / 255 : 0.361;
const PENT_TAKE = BODY_HIT.TAKE_1019 !== 0 ? 13.83 / 255 : 0.0734;
const HEX_TAKE = BODY_HIT.TAKE_1019 !== 0 ? 6.82 / 255 : 0.0352;
const TRI_HIT = BODY_HIT.HIT_1102 !== 0 ? 0.0273 : 0.027;
const PENT_HIT = BODY_HIT.HIT_1102 !== 0 ? 0.0405 : 0.0416;
const HEX_HIT = BODY_HIT.HIT_1102 !== 0 ? 0.0539 : 0.0549;
const SQUARE_HIT = BODY_HIT.HIT_1102 !== 0 ? 0.0132 : 0.024;
const _healthOf = (anchor: string): number => { const r = SHAPE_BOOK[anchor]; return r ? r.hp + r.shield : 0; };
const SQUARE_TAKE = _healthOf('square') > 0
  ? (TRI_TAKE * _healthOf('triangle') + PENT_TAKE * _healthOf('pentagon') + HEX_TAKE * _healthOf('hexagon')) / 3 / _healthOf('square')
  : 1.0001;
export const HIT_KINDS = {
  egg: kind('egg', 1.0001, 0, 0),
  square: kind('square', BODY_HIT.DEATH !== 0 ? SQUARE_TAKE : 1.0001, SQUARE_HIT, 10),
  triangle: kind('triangle', TRI_TAKE, TRI_HIT, 10),
  pentagon: kind('pentagon', PENT_TAKE, PENT_HIT, 10, 0),
  hexagon: kind('hexagon', HEX_TAKE, HEX_HIT, 15),
  giantBeta: kind('betaPentagon', 0.0575 * 332.369 / (825.192 + 332.369), 0.0235, 20),
  giantAlpha: kind('alphaPentagon', 0.025 * 931.884 / (6841.68 + 931.884), 0.0235, 20),
  solid: kind('pentagon', BODY_HIT.HIT_1102 !== 0 ? PENT_TAKE : 0.0734, BODY_HIT.HIT_1102 !== 0 ? PENT_HIT : 0.0416, 10),
};

export function hitKindOf(sides: number, scaleVariant: string | undefined, odGiant: boolean, polyhedron: boolean): HitKind {
  if (polyhedron) return HIT_KINDS.solid;
  if (scaleVariant === 'beta') return HIT_KINDS.giantBeta;
  if (scaleVariant === 'alpha' || odGiant) return HIT_KINDS.giantAlpha;
  if (sides <= 2) return HIT_KINDS.egg;
  if (sides === 3) return HIT_KINDS.triangle;
  if (sides === 4) return HIT_KINDS.square;
  if (sides === 5) return HIT_KINDS.pentagon;
  return HIT_KINDS.hexagon;
}

export function bodyHitResist(base: number, attribHealth: number, attribBody: number): number {
  return 1 - 1 / Math.max(1, base + BODY_HIT.BRST_HEALTH * attribHealth + BODY_HIT.BRST_BODY * attribBody);
}
export function bodyHitAtk(attribBody: number): number {
  return 1 + BODY_HIT.ATK_BODY * attribBody;
}
export function bodyHitInK(base: number, attribHealth: number, attribBody: number): number {
  return BODY_HIT.HIT_1102 !== 0 ? 1 / Math.max(1, base + BODY_HIT.IN_HP * attribHealth + BODY_HIT.IN_BD * attribBody) : -1;
}
export function tankOnTank(bodyStatA: number, atkA: number, resistA: number, resistB: number, inKB = -1): number {
  const d = inKB >= 0 ? BODY_HIT.TANK_K_1102 * bodyStatA * atkA * (resistA + inKB) : BODY_HIT.TANK_K * bodyStatA * atkA * (1 + resistA - resistB);
  return d > 0 ? d : 0;
}
export function tankOnShape(k: HitKind, bodyStat: number, atk: number, tankResist: number, ownResist: number): number {
  const r = k.resist >= 0 ? k.resist : ownResist;
  const d = k.abs * (bodyStat / 3) * atk * (1 + tankResist - r) / Math.max(0.05, 1 - r);
  return d > 0 ? d : 0;
}
export function shapeOnTank(k: HitKind, shapeBd: number, ownResist: number, tankResist: number, inK = -1): number {
  const r = k.resist >= 0 ? k.resist : ownResist;
  const per = k === HIT_KINDS.egg && SMALL_FIX.GH096 !== 0 ? HIT_KINDS.square.hitPerBd : k.hitPerBd;
  const d = inK >= 0 ? per * shapeBd * inK : per * shapeBd * (1 + r - tankResist) / (1 + r);
  return d > 0 ? d : 0;
}

export function bodyHitTicksDue(seen: Map<string, number>, next: Map<string, number>, key: string, now: number): number {
  const last = seen.get(key);
  seen.set(key, now);
  if (last === undefined || now - last > 1.0001) { next.set(key, now + 1); return 1; }
  const due = next.get(key);
  if (due === undefined) { next.set(key, now + 1); return 1; }
  if (now + 1e-9 < due) return 0;
  const n = Math.floor(now - due + 1e-9) + 1;
  next.set(key, due + n);
  return n;
}
