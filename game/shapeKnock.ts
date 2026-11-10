import { OFFENSE_ARRAS } from './offenseSwitch';

const _env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export const SHAPE_KNOCK = {
  ON: (_env?.ISTRONG_OLD_KNOCK === '1' ? 0 : 1) as 0 | 1,
  K: 2.239,
  KB: 1.1,
  TANK_DENSITY: 2.3,
  TANK_PEN_BASE: 1.05,
  PEN_BODY_DAMAGE: 0.3265,
  PEN_MAX_HEALTH: 0.2913,
  HEALTH_POW: 0.4126,
  RUN_SPEED: 1.5,
  GLIDE_PLAIN: 0.88,
  GLIDE_NESTED: 0.92,
  GLIDE_GIANT: 0.925,
  SPIN_PER_UNIT: Math.PI / 90,
  DENS_PENT: 0.8614,
  DENS_BETA_GIANT: 5.632,
  DENS_ALPHA_GIANT: 13.80,
  PUSH_PENT: 0.5296,
  get BODY_FIT(): 0 | 1 { return OFFENSE_ARRAS.SHAPE_BODY_FIT !== 0 ? 1 : 0; },
  DENS_TRIANGLE: _env?.ISTRONG_OLD_TRI_1105 === '1' ? 1.95 : 0.81, PUSH_TRIANGLE: _env?.ISTRONG_OLD_TRI_1105 === '1' ? 1.5 : 0.75,
  TRI_NEST_PUSH: _env?.ISTRONG_OLD_TRI_1105 === '1' ? [1, 1, 1, 1, 1, 1] : [1, 1.28, 1.08, 1, 1, 1],
  DENS_SQUARE: 0.97, PUSH_SQUARE: 0.35,
  PEN_SQUARE: 0.55,
  NEST_PUSH: [1, 0.6681, 0.4531, 0.1340, 0.0396, 0.0117],
  NEST_DENS: [1, 0.95, 1.88, 1.39, 1.39, 1.39],
  HEX_DENS: [0.4494, 0.6474, 0.8486, 1.094, 1.094, 1.094],
  HEX_PUSH: [0.47, 0.2869, 0.1188, 0.06161, 0.032, 0.0166],
};

export const SKILL_FULL_ATTRIB = Math.log(5) / 1.6;


export const KNOCK_BODY = { density: 1, push: 1, glide: 0.88 };

export function knockBodyOf(sides: number, nest: number, giant: number, solid: number, gem: boolean): typeof KNOCK_BODY {
  const b = KNOCK_BODY;
  const K = SHAPE_KNOCK;
  if (giant === 2) { b.density = K.DENS_ALPHA_GIANT; b.push = 1; b.glide = K.GLIDE_GIANT; return b; }
  if (giant === 1) { b.density = K.DENS_BETA_GIANT; b.push = 1; b.glide = K.GLIDE_GIANT; return b; }
  const unit = K.DENS_PENT / 8;
  if (solid > 0) { b.density = solid * unit; b.push = K.PUSH_PENT; b.glide = K.GLIDE_NESTED; return b; }
  if (gem) { b.density = 4 * unit; b.push = 0.25; b.glide = K.GLIDE_PLAIN; return b; }
  const n = nest > 0 ? Math.min(5, Math.floor(nest)) : 0;
  b.glide = n > 0 ? K.GLIDE_NESTED : K.GLIDE_PLAIN;
  if (sides >= 6) { b.density = K.HEX_DENS[n]; b.push = K.HEX_PUSH[n]; return b; }
  let d: number;
  if (sides === 5) d = K.DENS_PENT;
  else if (sides === 4) d = K.BODY_FIT !== 0 ? K.DENS_SQUARE : 4 * unit;
  else d = K.BODY_FIT !== 0 ? K.DENS_TRIANGLE : 6 * unit;
  b.density = d * K.NEST_DENS[n];
  b.push = (K.BODY_FIT !== 0 && sides === 3 ? K.PUSH_TRIANGLE * K.TRI_NEST_PUSH[n] : K.BODY_FIT !== 0 && sides === 4 ? K.PUSH_SQUARE : K.PUSH_PENT) * K.NEST_PUSH[n];
  return b;
}

export function knockTankPen(base: number, attribBodyDamage: number, attribMaxHealth: number): number {
  return base + (SHAPE_KNOCK.PEN_BODY_DAMAGE * attribBodyDamage + SHAPE_KNOCK.PEN_MAX_HEALTH * attribMaxHealth) / SKILL_FULL_ATTRIB;
}

export const KNOCK_DV = { tank: 0, shape: 0 };

export function knockTick(closing: number, overlap: number, rT: number, rS: number,
  penT: number, penS: number, hT: number, hS: number, mT: number, mS: number, pushT: number, pushS: number): typeof KNOCK_DV {
  const out = KNOCK_DV;
  out.tank = 0; out.shape = 0;
  if (!(mT > 0) || !(mS > 0)) return out;
  const dT = overlap > 0 ? Math.min(1, overlap / Math.max(2 * rT, 1e-6)) : 0;
  const dS = overlap > 0 ? Math.min(1, overlap / Math.max(2 * rS, 1e-6)) : 0;
  const down = (1 - dT) * (1 - dS), up = dT * dS;
  const pT = Math.max(0.01, penT), pS = Math.max(0.01, penS);
  const G = SHAPE_KNOCK.HEALTH_POW;
  const hTg = Math.pow(Math.max(0, Math.min(1, hT)), G), hSg = Math.pow(Math.max(0, Math.min(1, hS)), G);
  const el = (2 - 4 * Math.atan(pT * pS) / Math.PI) * (hTg / Math.sqrt(pT) + hSg / Math.sqrt(pS));
  const spring = 2 * Math.sqrt(Math.max(0, hT * hS)) / SHAPE_KNOCK.RUN_SPEED;
  const KB = SHAPE_KNOCK.KB;
  const imp = down * down * el * Math.max(0, closing) * mT * mS / (mT + mS) + KB * spring * up;
  const s = SHAPE_KNOCK.K * KB * imp;
  const dvT = s * pushT / mT, dvS = s * pushS / mS;
  out.tank = isFinite(dvT) ? dvT : 0;
  out.shape = isFinite(dvS) ? dvS : 0;
  return out;
}
