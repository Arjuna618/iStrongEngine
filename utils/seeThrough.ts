import { deathSpreadGain } from './motionArras';

export const SEE_THROUGH = {
  AS_SET: true,
};

export function shapePassExactAlpha(): boolean {
  return SEE_THROUGH.AS_SET;
}

export function plainRoundAlpha(
  opacity: number, fadeT: number, opacityAtDeath: number, ghostFactor: number, spread: boolean,
): number {
  let a = opacity / 255;
  if (!SEE_THROUGH.AS_SET) {
    if (fadeT >= 0) a *= deathSpreadGain(opacity, opacityAtDeath, spread);
    return ghostFactor === 1 ? a : a * ghostFactor;
  }
  if (ghostFactor !== 1) a *= ghostFactor;
  return spread && a > 0 && a < 1 ? Math.sqrt(a) : a;
}
