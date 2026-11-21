export function depthOfPlainLook(sides: number): number {
  const n = Math.max(3, Math.floor(sides));
  return 1 - Math.cos(Math.PI / n);
}

export const DIAL_DEPTH_MIN = 0.0001;

export function dialOfDepth(depth: number, sides: number): number {
  if (!(depth > 0)) return 0;
  const a = depthOfPlainLook(sides);
  if (depth >= a) return a >= 1 ? 100 : Math.min(100, ((depth - a) / (1 - a)) * 100);
  return -Math.min(100, (1 - depth / a) * 100);
}

export function depthOfDial(p: number, sides: number): number {
  if (!(p === p) || p === 0) return 0;
  const a = depthOfPlainLook(sides);
  const k = Math.min(1, Math.abs(p) / 100);
  return p > 0 ? a + (1 - a) * k : Math.max(DIAL_DEPTH_MIN, a * (1 - k));
}
