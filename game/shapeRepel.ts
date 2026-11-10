const _env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export const SHAPE_REPEL = {
  ON: (_env?.ISTRONG_OLD_SHAPE_PAIRS === '1' ? 0 : 1) as 0 | 1,
  ACCEL: 1.6,
  HALF_AT: 2,
};

export function shapeRepelGain(dist: number, dtFactor: number): number {
  return SHAPE_REPEL.ACCEL * 0.25 * dtFactor * dist / (dist + SHAPE_REPEL.HALF_AT);
}
