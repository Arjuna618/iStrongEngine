export const SPIN_RAD_DEFAULT = 0.05;
export const SPIN_TURNS_DEFAULT = SPIN_RAD_DEFAULT * 60 / (2 * Math.PI);

export function spinRadOf(pt: { spinSpeed?: number } | null | undefined): number {
  const t = pt ? pt.spinSpeed : undefined;
  return typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t * Math.PI * 2 / 60 : SPIN_RAD_DEFAULT;
}
