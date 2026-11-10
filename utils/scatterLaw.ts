function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export function normCdf(x: number): number { return 0.5 * erfc(-x / Math.SQRT2); }
function normTail(x: number): number { return 0.5 * erfc(x / Math.SQRT2); }
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a1 = -39.69683028665376, a2 = 220.9460984245205, a3 = -275.9285104469687, a4 = 138.3577518672690, a5 = -30.66479806614716, a6 = 2.506628277459239;
  const b1 = -54.47609879822406, b2 = 161.5858368580409, b3 = -155.6989798598866, b4 = 66.80131188771972, b5 = -13.28068155288572;
  const c1 = -0.007784894002430293, c2 = -0.3223964580411365, c3 = -2.400758277161838, c4 = -2.549732539343734, c5 = 4.374664141464968, c6 = 2.938163982698783;
  const d1 = 0.007784695709041462, d2 = 0.3224671290700398, d3 = 2.445134137142996, d4 = 3.754408661907416;
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q / (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
}

export function cutFromMiss(missed: number, sd: number, cut: number): number {
  const a = cut / sd;
  const v = normTail(Math.abs(missed) / sd) / normTail(a);
  const u = 0.5 + (missed < 0 ? -0.5 : 0.5) * (1 - (v > 1 ? 1 : v));
  const lo = normCdf(-a), hi = normCdf(a);
  const x = sd * normInv(lo + u * (hi - lo));
  return x >= cut ? cut * (1 - 1e-12) : x <= -cut ? -cut * (1 - 1e-12) : x;
}

let _a = 0, _b = 0, _c = 0, _d = 1;
function seedWith(seed: number): void {
  _a = 0x9e3779b9 | 0; _b = (0x243f6a88 ^ Math.imul(seed | 0, 0x85ebca6b)) | 0; _c = (0xb7e15162 ^ Math.imul((seed / 4294967296) | 0, 0xc2b2ae35)) | 0; _d = 1 | 0;
  for (let i = 0; i < 12; i++) unit();
}
function unit(): number {
  _a |= 0; _b |= 0; _c |= 0; _d |= 0;
  const t = (((_a + _b) | 0) + _d) | 0;
  _d = (_d + 1) | 0;
  _a = _b ^ (_b >>> 9);
  _b = (_c + (_c << 3)) | 0;
  _c = (_c << 21) | (_c >>> 11);
  _c = (_c + t) | 0;
  return (t >>> 0) / 4294967296;
}
export function bellFromSeed(seed: number, sd: number, cut: number): number {
  if (!(sd > 0) || !(cut > 0)) return 0;
  seedWith(seed);
  let x = 0;
  for (let i = 0; i < 64; i++) {
    const u1 = 1 - unit(), u2 = unit();
    x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sd;
    if (Math.abs(x) < cut) return x;
  }
  return cutFromMiss(x, sd, cut);
}
