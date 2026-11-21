import { LAYER_OUTLINE_MAX_POINTS, LAYER_OUTLINE_MAX_REACH, cleanLayerOutline } from './layerOutline';

export type PathPoint = [number, number, number, number, number, number];

export const PATH_MAX_POINTS = LAYER_OUTLINE_MAX_POINTS;
export const PATH_CURVE_STEPS = 16;
export const PATH_MAX_HANDLE = 8;
const KAPPA = 0.5522847498307936;

const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
const curved = (a: PathPoint, b: PathPoint): boolean => a[4] !== 0 || a[5] !== 0 || b[2] !== 0 || b[3] !== 0;

export function flattenLayerPath(p: readonly PathPoint[]): [number, number][] {
  const n = p.length;
  const out: [number, number][] = [];
  if (n < 3) return out;
  let curves = 0;
  for (let i = 0; i < n; i++) if (curved(p[i], p[(i + 1) % n])) curves++;
  const steps = curves === 0 ? 1 : Math.max(1, Math.min(PATH_CURVE_STEPS, Math.floor((PATH_MAX_POINTS - (n - curves)) / curves)));
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    out.push([r4(a[0]), r4(a[1])]);
    if (!curved(a, b)) continue;
    const x0 = a[0], y0 = a[1], x1 = a[0] + a[4], y1 = a[1] + a[5], x2 = b[0] + b[2], y2 = b[1] + b[3], x3 = b[0], y3 = b[1];
    for (let k = 1; k < steps; k++) {
      const t = k / steps, u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      out.push([r4(w0 * x0 + w1 * x1 + w2 * x2 + w3 * x3), r4(w0 * y0 + w1 * y1 + w2 * y2 + w3 * y3)]);
    }
  }
  for (let i = out.length - 1; i > 0 && out.length > 3; i--) if (out[i][0] === out[i - 1][0] && out[i][1] === out[i - 1][1]) out.splice(i, 1);
  return out;
}

export function pathFromOutline(o: readonly (readonly [number, number])[]): PathPoint[] {
  const p: PathPoint[] = [];
  for (let i = 0; i < o.length && p.length < PATH_MAX_POINTS; i++) p.push([o[i][0], o[i][1], 0, 0, 0, 0]);
  return p;
}

function rsf(sides: number): number {
  if (sides < 3 || sides > 16) return 1.0;
  const c = (2 * Math.PI) / sides;
  return Math.sqrt(c / Math.sin(c));
}

export function pathOfLayerShape(l: { sides: number; starDepth?: number; starCurved?: boolean }): PathPoint[] {
  const n = Math.floor(l.sides);
  if (n < 3) {
    const p: PathPoint[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i, c = Math.cos(a), s = Math.sin(a);
      p.push([r4(c), r4(s), r4(s * KAPPA), r4(-c * KAPPA), r4(-s * KAPPA), r4(c * KAPPA)]);
    }
    return p;
  }
  const V = rsf(n), depth = l.starDepth ?? 0;
  if (depth > 0 && l.starCurved) {
    const inner = V * (1 - depth);
    const p: PathPoint[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = V * Math.cos(a), y = V * Math.sin(a);
      const ah = ((i + 0.5) / n) * Math.PI * 2, qx = inner * Math.cos(ah), qy = inner * Math.sin(ah);
      const ab = ((i - 0.5) / n) * Math.PI * 2, bx = inner * Math.cos(ab), by = inner * Math.sin(ab);
      p.push([r4(x), r4(y), r4((bx - x) * 2 / 3), r4((by - y) * 2 / 3), r4((qx - x) * 2 / 3), r4((qy - y) * 2 / 3)]);
    }
    return p;
  }
  if (depth > 0) {
    const inner = V * (1 - depth);
    const p: PathPoint[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (Math.PI * 2 * i) / (n * 2), rr = i % 2 === 0 ? V : inner;
      p.push([r4(rr * Math.cos(a)), r4(rr * Math.sin(a)), 0, 0, 0, 0]);
    }
    return p;
  }
  const p: PathPoint[] = [];
  for (let i = 0; i < n; i++) { const a = (Math.PI * 2 * i) / n; p.push([r4(V * Math.cos(a)), r4(V * Math.sin(a)), 0, 0, 0, 0]); }
  return p;
}

export function cleanLayerPath(v: unknown): PathPoint[] | undefined {
  if (!Array.isArray(v) || v.length < 3 || v.length > PATH_MAX_POINTS) return undefined;
  const out: PathPoint[] = [];
  for (const q of v) {
    if (!Array.isArray(q) || q.length !== 6) return undefined;
    const r: number[] = [];
    for (let k = 0; k < 6; k++) { const x = Number(q[k]); if (!Number.isFinite(x)) return undefined; r.push(x); }
    if (Math.abs(r[0]) > LAYER_OUTLINE_MAX_REACH || Math.abs(r[1]) > LAYER_OUTLINE_MAX_REACH) return undefined;
    for (let k = 2; k < 6; k++) if (Math.abs(r[k]) > PATH_MAX_HANDLE) return undefined;
    out.push([r4(r[0]), r4(r[1]), r4(r[2]), r4(r[3]), r4(r[4]), r4(r[5])]);
  }
  const o = flattenLayerPath(out);
  const c = cleanLayerOutline(o);
  if (!c || c.length !== o.length) return undefined;
  return out;
}

export function pathMatchesOutline(p: readonly PathPoint[], o: readonly (readonly [number, number])[] | undefined): boolean {
  if (!o) return false;
  const f = flattenLayerPath(p);
  if (f.length !== o.length) return false;
  for (let i = 0; i < f.length; i++) if (Math.abs(f[i][0] - o[i][0]) > 1.5e-4 || Math.abs(f[i][1] - o[i][1]) > 1.5e-4) return false;
  return true;
}

export function pathReach(p: readonly PathPoint[]): number {
  let r = 0;
  for (const q of p) {
    const a = Math.hypot(q[0], q[1]), b = Math.hypot(q[0] + q[2], q[1] + q[3]), c = Math.hypot(q[0] + q[4], q[1] + q[5]);
    if (a > r) r = a; if (b > r) r = b; if (c > r) r = c;
  }
  return r;
}

export function splitPathSide(p: PathPoint[], i: number, t: number): void {
  const n = p.length, a = p[i], b = p[(i + 1) % n];
  if (!curved(a, b)) {
    p.splice(i + 1, 0, [r4(a[0] + (b[0] - a[0]) * t), r4(a[1] + (b[1] - a[1]) * t), 0, 0, 0, 0]);
    return;
  }
  const P0x = a[0], P0y = a[1], P1x = a[0] + a[4], P1y = a[1] + a[5], P2x = b[0] + b[2], P2y = b[1] + b[3], P3x = b[0], P3y = b[1];
  const L = (u: number, v: number) => u + (v - u) * t;
  const Ax = L(P0x, P1x), Ay = L(P0y, P1y), Bx = L(P1x, P2x), By = L(P1y, P2y), Cx = L(P2x, P3x), Cy = L(P2y, P3y);
  const Dx = L(Ax, Bx), Dy = L(Ay, By), Ex = L(Bx, Cx), Ey = L(By, Cy), Fx = L(Dx, Ex), Fy = L(Dy, Ey);
  a[4] = r4(Ax - P0x); a[5] = r4(Ay - P0y);
  b[2] = r4(Cx - P3x); b[3] = r4(Cy - P3y);
  p.splice(i + 1, 0, [r4(Fx), r4(Fy), r4(Dx - Fx), r4(Dy - Fy), r4(Ex - Fx), r4(Ey - Fy)]);
}

export function nearestOnSide(p: readonly PathPoint[], i: number, x: number, y: number, out: number[]): void {
  const n = p.length, a = p[i], b = p[(i + 1) % n];
  const x0 = a[0], y0 = a[1], x1 = a[0] + a[4], y1 = a[1] + a[5], x2 = b[0] + b[2], y2 = b[1] + b[3], x3 = b[0], y3 = b[1];
  const at = (t: number, k: number) => { const u = 1 - t; const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t; return k === 0 ? w0 * x0 + w1 * x1 + w2 * x2 + w3 * x3 : w0 * y0 + w1 * y1 + w2 * y2 + w3 * y3; };
  let bt = 0, bd = Infinity;
  for (let k = 0; k <= 32; k++) { const t = k / 32, dx = at(t, 0) - x, dy = at(t, 1) - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bt = t; } }
  let lo = Math.max(0, bt - 1 / 32), hi = Math.min(1, bt + 1 / 32);
  for (let it = 0; it < 24; it++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const d1 = (at(m1, 0) - x) ** 2 + (at(m1, 1) - y) ** 2, d2 = (at(m2, 0) - x) ** 2 + (at(m2, 1) - y) ** 2;
    if (d1 < d2) hi = m2; else lo = m1;
  }
  const t = (lo + hi) / 2, dx = at(t, 0) - x, dy = at(t, 1) - y;
  out[0] = t; out[1] = Math.min(bd, dx * dx + dy * dy);
}

export function togglePathPoint(p: PathPoint[], i: number): void {
  const n = p.length, q = p[i];
  if (q[2] !== 0 || q[3] !== 0 || q[4] !== 0 || q[5] !== 0) { q[2] = 0; q[3] = 0; q[4] = 0; q[5] = 0; return; }
  const a = p[(i + n - 1) % n], b = p[(i + 1) % n];
  let tx = b[0] - a[0], ty = b[1] - a[1];
  const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  const la = Math.hypot(q[0] - a[0], q[1] - a[1]) / 3, lb = Math.hypot(b[0] - q[0], b[1] - q[1]) / 3;
  q[2] = r4(-tx * la); q[3] = r4(-ty * la); q[4] = r4(tx * lb); q[5] = r4(ty * lb);
}

export function flipPath(p: PathPoint[], axis: 'x' | 'y'): void {
  for (const q of p) {
    if (axis === 'y') { q[1] = -q[1]; q[3] = -q[3]; q[5] = -q[5]; }
    else { q[0] = -q[0]; q[2] = -q[2]; q[4] = -q[4]; }
  }
}

export function stretchPath(p: PathPoint[], sx: number, sy: number): void {
  for (const q of p) { q[0] = r4(q[0] * sx); q[1] = r4(q[1] * sy); q[2] = r4(q[2] * sx); q[3] = r4(q[3] * sy); q[4] = r4(q[4] * sx); q[5] = r4(q[5] * sy); }
}

export function copyPath(p: readonly PathPoint[]): PathPoint[] { return p.map(q => [q[0], q[1], q[2], q[3], q[4], q[5]] as PathPoint); }
