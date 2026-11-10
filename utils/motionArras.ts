import { CM, CM_USE, cmRgb } from './colorMap';

export const MOTION_ARRAS = {
  FLASH: true,
  BLINK: true,
  DEATH: true,
  DEATH_DRIFT: true,
  GLIDE: true,
  RECOIL: true,
  VIEW_LAW: true,
  SIZE_SLIDE: true,
  VIEW_GLIDE_ALL: true,
  DEATH_CAMERA: true,
  FRESH_SLIDE: true,
};

export const FLASH_PEAK = 0.75;
export const FLASH_SEC = 0.1;
export const FLASH_DECAY_PER_SEC = FLASH_PEAK / FLASH_SEC;
export const FLASH_RESTART_AT = FLASH_PEAK * (1 - (1 / 30) / FLASH_SEC);
const FLASH_RESTART_EPS = 1e-9;
export const OLD_FLASH_PEAK = 0.7;
export const OLD_FLASH_RETRIGGER = 0.28;
export const OLD_FLASH_DECAY_PER_SEC = 12.5;

export function flashOnHit(cur: number): number {
  if (MOTION_ARRAS.FLASH) return cur <= FLASH_RESTART_AT + FLASH_RESTART_EPS ? FLASH_PEAK : cur;
  return cur < OLD_FLASH_RETRIGGER ? OLD_FLASH_PEAK : cur;
}

export const FLASH_TICK_RESTART_AT = FLASH_RESTART_AT + FLASH_DECAY_PER_SEC * (1 / 30) / 4;
export function flashOnTickHit(cur: number): number {
  if (MOTION_ARRAS.FLASH) return cur <= FLASH_TICK_RESTART_AT + FLASH_RESTART_EPS ? FLASH_PEAK : cur;
  return flashOnHit(cur);
}

export function flashDecay(cur: number, dtSec: number): number {
  const v = cur - FLASH_DECAY_PER_SEC * dtSec;
  return v > 0 ? v : 0;
}

export function flashAtDeath(cur: number): number {
  return MOTION_ARRAS.FLASH ? cur : 0;
}

export const FLASH_WHITE_LIGHT = cmRgb(CM.TEXT, false, CM_USE.GENERAL)[0];
export const FLASH_WHITE_DARK = cmRgb(CM.TEXT, true, CM_USE.GENERAL)[0];

export function flashWhite(dark: boolean): number {
  return dark && MOTION_ARRAS.FLASH ? FLASH_WHITE_DARK : FLASH_WHITE_LIGHT;
}

export const BLINK_PERIOD_MS = 200;
export const BLINK_ON_MS = 100;
export const BLINK_ADD = 0.3;
export const BLINK_KEEP = 0.7;

export function blinkCombine(flash: number, msSinceStart: number): number {
  const t = msSinceStart > 0 ? msSinceStart : 0;
  return (t % BLINK_PERIOD_MS) < BLINK_ON_MS ? flash * BLINK_KEEP + BLINK_ADD : flash;
}

export const DEATH_SEC = 0.3;
export const DEATH_MS = 300;
export const DEATH_GROW = 0.5;
export const OLD_TANK_DEATH_MS = 500;
export const OLD_TANK_DEATH_GROW = 0.3;

export function deathC(tSec: number): number {
  const c = 1 - tSec / DEATH_SEC;
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

export function deathScale(c: number): number {
  return 1 + DEATH_GROW * (1 - c);
}

export function tankDeathFadeMs(): number {
  return MOTION_ARRAS.DEATH ? DEATH_MS : OLD_TANK_DEATH_MS;
}

export function tankDeathAlpha(ms: number): number {
  if (MOTION_ARRAS.DEATH) return deathC(ms / 1000);
  const a = 1 - ms / OLD_TANK_DEATH_MS;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

export function tankDeathScale(ms: number): number {
  if (MOTION_ARRAS.DEATH) return deathScale(deathC(ms / 1000));
  const p = ms / OLD_TANK_DEATH_MS;
  return 1 + (p < 0 ? 0 : p > 1 ? 1 : p) * OLD_TANK_DEATH_GROW;
}

export function deathDrifts(ms: number): boolean {
  return MOTION_ARRAS.DEATH_DRIFT && ms < DEATH_MS;
}

export function deathDriftSec(): number {
  return MOTION_ARRAS.DEATH_DRIFT ? DEATH_SEC : 0;
}

export function fadeC(tSec: number, ruleOpacity: number, opacityAtDeath: number): number {
  if (!(opacityAtDeath > 0)) return 0;
  let c = 1 - tSec / DEATH_SEC;
  const left = ruleOpacity / opacityAtDeath;
  if (left < c) c = left;
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

export function deathSpreadGain(opacity: number, opacityAtDeath: number, spread: boolean): number {
  if (!spread || !MOTION_ARRAS.DEATH || !(opacity > 0) || !(opacityAtDeath > opacity)) return 1;
  return Math.sqrt(opacityAtDeath / opacity);
}

export function puffOutlives(fadeT: number, opacityAtDeath: number): boolean {
  return MOTION_ARRAS.DEATH && fadeT >= 0 && fadeT < DEATH_SEC && opacityAtDeath > 0;
}

export const GLIDE_KEEP_PER_60 = 0.85;
export const GLIDE_REST_EPS = 1e-12;

export function zoomGlides(zoom: number, target: number): boolean {
  if (!MOTION_ARRAS.GLIDE) return false;
  if (!(zoom > 0) || !(target > 0)) return false;
  const d = zoom - target;
  return (d < 0 ? -d : d) > GLIDE_REST_EPS * target;
}

export function glideZoom(zoom: number, target: number, dtSec: number): number {
  const k = 1 - Math.pow(GLIDE_KEEP_PER_60, 60 * dtSec);
  const inv = 1 / zoom;
  return 1 / (inv + (1 / target - inv) * k);
}

export const KICK_SEC = 0.15;
export const KICK_VALUE_PER_SEC = 3;
export const KNOCKBACK_PER_ARRAS_RECOIL = 40 / 1.4;
export const ARRAS_SPD_PER_SPEED_MULT = 1.5;
export const OLD_KICK_FRAC = 0.15;

export function kickR(speedMult: number, knockback: number): number {
  const spd = ARRAS_SPD_PER_SPEED_MULT * (speedMult > 0 ? speedMult : 0);
  const rec = knockback > 0 ? knockback / KNOCKBACK_PER_ARRAS_RECOIL : 0;
  return Math.sqrt(3 * Math.log(Math.sqrt(spd) + rec + 1) + 1) / 20;
}

export function kickCurve(tSec: number): number {
  if (!(tSec >= 0) || tSec >= KICK_SEC) return 0;
  const w = 0.7 - 1.7 * (tSec / KICK_SEC);
  return 1 - w * w;
}

export function kickSecOf(kickValue: number): number {
  return (1 - kickValue) / KICK_VALUE_PER_SEC;
}

export function kickPull(kickValue: number, bodySizePx: number, speedMult: number, knockback: number): number {
  if (!(kickValue > 0)) return 0;
  if (!MOTION_ARRAS.RECOIL) return bodySizePx * OLD_KICK_FRAC * kickValue;
  const f = kickCurve(kickSecOf(kickValue));
  return f > 0 ? kickR(speedMult, knockback) * (bodySizePx * 0.5) * f : 0;
}

export const VIEW_K = 175;
export const VIEW_POW = 0.65;
export const VIEW_NO_TANK = 2000;

export function viewOfSize(radius: number): number {
  return MOTION_ARRAS.VIEW_LAW ? VIEW_K * Math.pow(radius, VIEW_POW) : 275 * Math.sqrt(radius);
}

export const SIZE_SLIDE_KEEP = 0.9;
export const SIZE_SLIDE_HZ = 30;
export const SIZE_SLIDE_MIN_RADIUS_PER_SEC = 3;
export const SIZE_SLIDE_MIN_PX_PER_SEC = 2 * SIZE_SLIDE_MIN_RADIUS_PER_SEC;

export const FOOD_BIRTH = { OPACITY_PER_FRAME: 7, GROWTH_FROM: 0.1, GROWTH_PER_FRAME: 0.027 } as const;
export function foodBirthOpacity(ms: number): number { const a = FOOD_BIRTH.OPACITY_PER_FRAME * ms * 0.06 / 255; return a < 1 ? a : 1; }
export function foodBirthGrowth(ms: number): number { const g = FOOD_BIRTH.GROWTH_FROM + FOOD_BIRTH.GROWTH_PER_FRAME * ms * 0.06; return g < 1 ? g : 1; }
export function slideSize(cur: number, target: number, dtSec: number, minPerSec: number): number {
  const gap = target - cur;
  if (gap === 0) return target;
  if (!(dtSec > 0)) return cur;
  const a = gap < 0 ? -gap : gap;
  let step = a * (1 - Math.pow(SIZE_SLIDE_KEEP, SIZE_SLIDE_HZ * dtSec));
  const floor = minPerSec * dtSec;
  if (step < floor) step = floor;
  if (!(step < a)) return target;
  return gap > 0 ? cur + step : cur - step;
}
