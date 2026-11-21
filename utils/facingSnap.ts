export const FACING_SNAP_DEG = 3;

export function snapFacingDeg(v: number, ways: readonly number[] | null | undefined): number {
  let best = v, bd = FACING_SNAP_DEG + 1e-9;
  const near = (t: number) => {
    const e = t + Math.round((v - t) / 360) * 360;
    const d = Math.abs(v - e);
    if (d <= bd) { bd = d; best = Math.max(0, Math.min(360, e)); }
  };
  for (let k = 0; k <= 8; k++) near(k * 45);
  if (ways) for (let i = 0; i < ways.length; i++) near(ways[i]);
  return best;
}
