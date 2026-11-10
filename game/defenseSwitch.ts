const _g = globalThis as { __ISTRONG_OLD_DEFENSE?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_DEFENSE === 1 || _g.process?.env?.ISTRONG_OLD_DEFENSE === '1';
const _oldRegen = _g.process?.env?.ISTRONG_OLD_REGEN === '1';
const _oldMhbd = _g.process?.env?.ISTRONG_OLD_REGEN_MHBD === '1';

export const REGEN_1019 = Object.freeze({
  REGEN_1103: 0, REGEN_B: 0.12, REGEN_W: 40, REGEN_C: 0.45, REGEN_A_ABS: 0.1 * 0.046 * 220, SR_FULL: 7, REGEN_R0: 0.0002, HP_FULL_SHIELD: 0,
  HUMP_HP: 0, HUMP_BD: 0,
});
export const REGEN_MHBD = Object.freeze({ HUMP_HP: 0.095, HUMP_BD: 0.169 });
export const REGEN_1103 = Object.freeze({
  REGEN_1103: 1, REGEN_B: 0.1793, REGEN_W: 55.37, REGEN_C: 0.3929, REGEN_A_ABS: 0.04425 * 0.046 * 220, SR_FULL: 37.54, REGEN_R0: 0.00006078,
  HP_FULL_SHIELD: 32.0,
});
const _rg = _oldRegen ? REGEN_1019 : REGEN_1103;

const FULL_ATTRIB = Math.log(5) / 1.6;

export const DEFENSE_ARRAS = {
  ON: _old ? 0 : 1,
  ROUND_TAKE: 1 / 1.8,
  SHIELD_K: 0.046 * 220 / 65.5,
  SC_FULL: 7.8,
  REGEN_1103: _rg.REGEN_1103,
  REGEN_B: _rg.REGEN_B, REGEN_W: _rg.REGEN_W, REGEN_C: _rg.REGEN_C, REGEN_A_ABS: _rg.REGEN_A_ABS,
  SR_FULL: _rg.SR_FULL,
  REGEN_R0: _rg.REGEN_R0,
  HP_REGEN: 0.0168,
  HP_FULL_SHIELD: _rg.HP_FULL_SHIELD,
  HUMP_HP: _oldRegen || _oldMhbd ? 0 : REGEN_MHBD.HUMP_HP, HUMP_BD: _oldRegen || _oldMhbd ? 0 : REGEN_MHBD.HUMP_BD,
  BRST_HEALTH: 0.105, BRST_BODY: 0, BRST_REGEN: 0,
  ATK_ROUNDS_FULL: 2.3,
};

export function defenseOnBody(resistBase: number | undefined): boolean {
  return DEFENSE_ARRAS.ON !== 0 && !(resistBase !== undefined && resistBase > 1);
}
export function defenseShieldMult(a: number): number {
  return DEFENSE_ARRAS.SHIELD_K * (1 + (DEFENSE_ARRAS.SC_FULL - 1) * a / FULL_ATTRIB);
}
export function defenseBrst(aBd: number, aHp: number, aRgn: number): number {
  return DEFENSE_ARRAS.BRST_BODY * aBd + DEFENSE_ARRAS.BRST_HEALTH * aHp + DEFENSE_ARRAS.BRST_REGEN * aRgn;
}
export function defenseAtkVsRounds(aBd: number): number {
  return 1 + (DEFENSE_ARRAS.ATK_ROUNDS_FULL - 1) * aBd / FULL_ATTRIB;
}
export function defenseHumpK(aHp: number, aBd: number): number {
  return 1 / (1 + (DEFENSE_ARRAS.HUMP_HP * aHp + DEFENSE_ARRAS.HUMP_BD * aBd) / FULL_ATTRIB);
}
export function defenseShieldStep(cur: number, max: number, aRgn: number, dt: number, rgnK = 1, srK = 1): number {
  if (!(max > 0)) return cur;
  if (cur >= max) return max;
  const D = DEFENSE_ARRAS;
  const r = cur / max;
  if (r <= 0) return D.REGEN_R0 * max;
  const q = Math.sqrt(r * 0.5) - D.REGEN_C;
  const hump = Math.exp(-D.REGEN_W * q * q);
  const rate = D.REGEN_B * r * max + D.REGEN_A_ABS * (1 + (D.SR_FULL - 1) * aRgn / FULL_ATTRIB * srK) * rgnK * hump;
  const next = cur + rate * dt;
  return next < max ? next : max;
}
export function defenseHealthStep(cur: number, max: number, dt: number, shieldFull = false): number {
  if (!(max > 0) || cur >= max || cur <= 0) return cur;
  const D = DEFENSE_ARRAS;
  const next = cur + (D.HP_REGEN * max + (shieldFull ? D.HP_FULL_SHIELD : 0)) * dt;
  return next < max ? next : max;
}
