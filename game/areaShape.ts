export interface AreaShape {
  k: 'ellipse' | 'poly';
  cx?: number; cy?: number; rx?: number; ry?: number; rot?: number;
  pts?: number[];
  sides?: number;
}

export const AREA_SHAPE_MAX_POINTS = 64;
export const AREA_SIDES_MIN = 3;
export const AREA_SIDES_MAX = 10;
export const ELLIPSE_SEGMENTS = 64;
export const AREA_SHAPE_MIN_HALF = 0.25;
const CELL_LIMIT = 100000;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function cleanAreaShape(v: unknown): AreaShape | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (s.k === 'ellipse') {
    if (!fin(s.cx) || !fin(s.cy) || !fin(s.rx) || !fin(s.ry)) return null;
    const cx = Math.max(-CELL_LIMIT, Math.min(CELL_LIMIT, s.cx)), cy = Math.max(-CELL_LIMIT, Math.min(CELL_LIMIT, s.cy));
    const rx = Math.max(AREA_SHAPE_MIN_HALF, Math.min(CELL_LIMIT, Math.abs(s.rx))), ry = Math.max(AREA_SHAPE_MIN_HALF, Math.min(CELL_LIMIT, Math.abs(s.ry)));
    const out: AreaShape = { k: 'ellipse', cx, cy, rx, ry };
    if (fin(s.rot) && s.rot !== 0) out.rot = s.rot % (Math.PI * 2);
    return out;
  }
  if (s.k === 'poly') {
    if (!Array.isArray(s.pts)) return null;
    const pts: number[] = [];
    for (let i = 0; i + 1 < s.pts.length && pts.length < AREA_SHAPE_MAX_POINTS * 2; i += 2) {
      const x = s.pts[i], y = s.pts[i + 1];
      if (!fin(x) || !fin(y)) return null;
      pts.push(Math.max(-CELL_LIMIT, Math.min(CELL_LIMIT, x)), Math.max(-CELL_LIMIT, Math.min(CELL_LIMIT, y)));
    }
    if (pts.length < 6) return null;
    const out: AreaShape = { k: 'poly', pts };
    if (fin(s.sides) && Number.isInteger(s.sides) && s.sides >= AREA_SIDES_MIN && s.sides <= AREA_SIDES_MAX && s.sides * 2 === pts.length) out.sides = s.sides;
    if (fin(s.rot) && s.rot !== 0) out.rot = s.rot % (Math.PI * 2);
    return out;
  }
  return null;
}

export function shapeBox(s: AreaShape, out: { x0: number; y0: number; x1: number; y1: number }): typeof out {
  if (s.k === 'ellipse') {
    const c = Math.cos(s.rot ?? 0), n = Math.sin(s.rot ?? 0), rx = s.rx ?? 1, ry = s.ry ?? 1;
    const hw = Math.sqrt(rx * rx * c * c + ry * ry * n * n), hh = Math.sqrt(rx * rx * n * n + ry * ry * c * c);
    out.x0 = (s.cx ?? 0) - hw; out.x1 = (s.cx ?? 0) + hw; out.y0 = (s.cy ?? 0) - hh; out.y1 = (s.cy ?? 0) + hh;
    return out;
  }
  const p = s.pts ?? [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < p.length; i += 2) {
    if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1];
  }
  if (!(x1 >= x0)) { x0 = x1 = y0 = y1 = 0; }
  out.x0 = x0; out.y0 = y0; out.x1 = x1; out.y1 = y1;
  return out;
}
const _box = { x0: 0, y0: 0, x1: 0, y1: 0 };
export function shapeCellBox(s: AreaShape): { gx: number; gy: number; cw: number; ch: number } {
  shapeBox(s, _box);
  const gx = Math.floor(_box.x0 + 1e-9), gy = Math.floor(_box.y0 + 1e-9);
  const ex = Math.ceil(_box.x1 - 1e-9), ey = Math.ceil(_box.y1 - 1e-9);
  return { gx, gy, cw: Math.max(1, ex - gx), ch: Math.max(1, ey - gy) };
}

export function shapeWorldPoly(s: AreaShape, cell: number, ox: number, oy: number): Float64Array {
  if (s.k === 'ellipse') {
    const out = new Float64Array(ELLIPSE_SEGMENTS * 2);
    const c = Math.cos(s.rot ?? 0), n = Math.sin(s.rot ?? 0);
    const cx = ox + (s.cx ?? 0) * cell, cy = oy + (s.cy ?? 0) * cell, rx = (s.rx ?? 1) * cell, ry = (s.ry ?? 1) * cell;
    for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
      const a = (i / ELLIPSE_SEGMENTS) * Math.PI * 2, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      out[i * 2] = cx + ex * c - ey * n; out[i * 2 + 1] = cy + ex * n + ey * c;
    }
    return out;
  }
  const p = s.pts ?? [];
  const out = new Float64Array(p.length - (p.length & 1));
  for (let i = 0; i + 1 < p.length; i += 2) { out[i] = ox + p[i] * cell; out[i + 1] = oy + p[i + 1] * cell; }
  return out;
}

export function shapeCellPoints(s: AreaShape): Float64Array { return shapeWorldPoly(s, 1, 0, 0); }

export function polyHas(p: ArrayLike<number>, x: number, y: number): boolean {
  let inside = false;
  const n = p.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polyEdgeDist2(p: ArrayLike<number>, x: number, y: number): number {
  let best = Infinity;
  const n = p.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = p[j * 2], ay = p[j * 2 + 1], bx = p[i * 2], by = p[i * 2 + 1];
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    let t = l2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + ex * t), dy = y - (ay + ey * t), d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
  }
  return best;
}

export function polyTouches(p: ArrayLike<number>, x: number, y: number, r: number): boolean {
  if (polyHas(p, x, y)) return true;
  return r > 0 && polyEdgeDist2(p, x, y) <= r * r;
}

export let polyNx = 0, polyNy = 0, polyQx = 0, polyQy = 0, polyD = 0;
export function polyNearest(p: ArrayLike<number>, x: number, y: number): void {
  let best = Infinity, bi = 0, bt = 0;
  const n = p.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = p[j * 2], ay = p[j * 2 + 1], bx = p[i * 2], by = p[i * 2 + 1];
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    let t = l2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + ex * t), dy = y - (ay + ey * t), d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; bi = i; bt = t; }
  }
  const j = (bi + n - 1) % n;
  const ax = p[j * 2], ay = p[j * 2 + 1], ex = p[bi * 2] - ax, ey = p[bi * 2 + 1] - ay;
  polyQx = ax + ex * bt; polyQy = ay + ey * bt;
  const d = Math.sqrt(best);
  polyD = d;
  const inside = polyHas(p, x, y);
  if (d > 1e-9) {
    const ux = (x - polyQx) / d, uy = (y - polyQy) / d;
    polyNx = inside ? -ux : ux; polyNy = inside ? -uy : uy;
    return;
  }
  const el = Math.sqrt(ex * ex + ey * ey) || 1;
  const s = polySignedArea(p) >= 0 ? 1 : -1;
  polyNx = (ey / el) * s; polyNy = (-ex / el) * s;
}

export function polySignedArea(p: ArrayLike<number>): number {
  let a = 0;
  const n = p.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) a += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
  return a * 0.5;
}
export function polyArea(p: ArrayLike<number>): number { return Math.abs(polySignedArea(p)); }

export function polyCrosses(p: ArrayLike<number>): boolean {
  const n = p.length >> 1;
  if (n < 4) return false;
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => {
    const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
  };
  for (let i = 0; i < n; i++) {
    const ax = p[i * 2], ay = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], by = p[((i + 1) % n) * 2 + 1];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const cx = p[j * 2], cy = p[j * 2 + 1], dx = p[((j + 1) % n) * 2], dy = p[((j + 1) % n) * 2 + 1];
      const s1 = side(ax, ay, bx, by, cx, cy), s2 = side(ax, ay, bx, by, dx, dy), s3 = side(cx, cy, dx, dy, ax, ay), s4 = side(cx, cy, dx, dy, bx, by);
      if (s1 * s2 < 0 && s3 * s4 < 0) return true;
    }
  }
  return false;
}
export function polyFillArea(p: ArrayLike<number>, x0: number, y0: number, x1: number, y1: number): number {
  const N = 64, w = (x1 - x0) / N, h = (y1 - y0) / N;
  if (!(w > 0) || !(h > 0)) return 0;
  let inside = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (polyHas(p, x0 + (i + 0.5) * w, y0 + (j + 0.5) * h)) inside++;
  return inside * w * h;
}

export let polyMx = 0, polyMy = 0;
export function polyMiddle(p: ArrayLike<number>): void {
  const n = p.length >> 1;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const f = p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
    a += f; cx += (p[j * 2] + p[i * 2]) * f; cy += (p[j * 2 + 1] + p[i * 2 + 1]) * f;
  }
  if (Math.abs(a) > 1e-12) { cx /= 3 * a; cy /= 3 * a; }
  else { cx = 0; cy = 0; for (let i = 0; i < n; i++) { cx += p[i * 2]; cy += p[i * 2 + 1]; } cx /= n || 1; cy /= n || 1; }
  if (polyHas(p, cx, cy)) { polyMx = cx; polyMy = cy; return; }
  let bestW = -1;
  polyMx = cx; polyMy = cy;
  shapeBox({ k: 'poly', pts: Array.from(p) }, _box);
  const by0 = _box.y0, by1 = _box.y1;
  for (let k = 0; k < 9; k++) {
    const y = by0 + (by1 - by0) * (k + 0.5) / 9;
    const xs: number[] = [];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = p[i * 2 + 1], yj = p[j * 2 + 1];
      if ((yi > y) !== (yj > y)) xs.push(p[i * 2] + (p[j * 2] - p[i * 2]) * (y - yi) / (yj - yi));
    }
    xs.sort((u, v) => u - v);
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > bestW) { bestW = xs[i + 1] - xs[i]; polyMx = (xs[i] + xs[i + 1]) / 2; polyMy = y; }
  }
}

export function tracePoly(ctx: { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void }, p: ArrayLike<number>, ox = 0, oy = 0, kx = 1, ky = kx): void {
  const n = p.length >> 1;
  if (n < 2) return;
  ctx.moveTo(ox + p[0] * kx, oy + p[1] * ky);
  for (let i = 1; i < n; i++) ctx.lineTo(ox + p[i * 2] * kx, oy + p[i * 2 + 1] * ky);
  ctx.closePath();
}

export function polyPerimeter(p: ArrayLike<number>): number {
  let s = 0;
  const n = p.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) { const dx = p[i * 2] - p[j * 2], dy = p[i * 2 + 1] - p[j * 2 + 1]; s += Math.sqrt(dx * dx + dy * dy); }
  return s;
}
export let polyAx = 0, polyAy = 0;
export function polyAlong(p: ArrayLike<number>, u: number): void {
  const n = p.length >> 1;
  let left = Math.max(0, Math.min(1, u)) * polyPerimeter(p);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = p[j * 2] - p[i * 2], dy = p[j * 2 + 1] - p[i * 2 + 1], l = Math.sqrt(dx * dx + dy * dy);
    if (left <= l || i === n - 1) { const t = l > 0 ? Math.min(1, left / l) : 0; polyAx = p[i * 2] + dx * t; polyAy = p[i * 2 + 1] + dy * t; return; }
    left -= l;
  }
  polyAx = p[0]; polyAy = p[1];
}

export function regularPolyPts(sides: number, x0: number, y0: number, x1: number, y1: number): number[] {
  const n = Math.max(AREA_SIDES_MIN, Math.min(AREA_SIDES_MAX, Math.round(sides)));
  const ux: number[] = [], uy: number[] = [];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + Math.PI / n + (i * Math.PI * 2) / n;
    const x = Math.cos(a), y = Math.sin(a);
    ux.push(x); uy.push(y);
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(x0 + (ux[i] - bx0) / (bx1 - bx0) * (x1 - x0), y0 + (uy[i] - by0) / (by1 - by0) * (y1 - y0));
  return pts;
}

export function shapeMoved(s: AreaShape, dx: number, dy: number): AreaShape {
  if (s.k === 'ellipse') return { ...s, cx: (s.cx ?? 0) + dx, cy: (s.cy ?? 0) + dy };
  const pts = (s.pts ?? []).slice();
  for (let i = 0; i + 1 < pts.length; i += 2) { pts[i] += dx; pts[i + 1] += dy; }
  return { ...s, pts };
}

export function shapeToBox(s: AreaShape, from: { x0: number; y0: number; x1: number; y1: number }, x0: number, y0: number, x1: number, y1: number): AreaShape {
  const fw = from.x1 - from.x0 || 1, fh = from.y1 - from.y0 || 1;
  const kx = (x1 - x0) / fw, ky = (y1 - y0) / fh;
  if (s.k === 'ellipse') {
    const rot = s.rot ?? 0;
    if (Math.abs(Math.sin(rot)) < 1e-9 || Math.abs(Math.cos(rot)) < 1e-9) {
      const swap = Math.abs(Math.sin(rot)) > 0.5;
      return { ...s, cx: x0 + ((s.cx ?? 0) - from.x0) * kx, cy: y0 + ((s.cy ?? 0) - from.y0) * ky, rx: Math.max(AREA_SHAPE_MIN_HALF, (s.rx ?? 1) * (swap ? ky : kx)), ry: Math.max(AREA_SHAPE_MIN_HALF, (s.ry ?? 1) * (swap ? kx : ky)) };
    }
    const k = Math.sqrt(Math.abs(kx * ky));
    return { ...s, cx: x0 + ((s.cx ?? 0) - from.x0) * kx, cy: y0 + ((s.cy ?? 0) - from.y0) * ky, rx: Math.max(AREA_SHAPE_MIN_HALF, (s.rx ?? 1) * k), ry: Math.max(AREA_SHAPE_MIN_HALF, (s.ry ?? 1) * k) };
  }
  const pts = (s.pts ?? []).slice();
  for (let i = 0; i + 1 < pts.length; i += 2) { pts[i] = x0 + (pts[i] - from.x0) * kx; pts[i + 1] = y0 + (pts[i + 1] - from.y0) * ky; }
  const out: AreaShape = { k: 'poly', pts };
  if (s.sides !== undefined) out.sides = s.sides;
  if (s.rot !== undefined) out.rot = s.rot;
  return out;
}

export function shapeTurned(s: AreaShape, a: number): AreaShape {
  if (s.k === 'ellipse') return { ...s, rot: ((s.rot ?? 0) + a) % (Math.PI * 2) };
  shapeBox(s, _box);
  const mx = (_box.x0 + _box.x1) / 2, my = (_box.y0 + _box.y1) / 2, c = Math.cos(a), n = Math.sin(a);
  const pts = (s.pts ?? []).slice();
  for (let i = 0; i + 1 < pts.length; i += 2) { const x = pts[i] - mx, y = pts[i + 1] - my; pts[i] = mx + x * c - y * n; pts[i + 1] = my + x * n + y * c; }
  const out: AreaShape = { k: 'poly', pts };
  if (s.sides !== undefined) out.sides = s.sides;
  const r = ((s.rot ?? 0) + a) % (Math.PI * 2);
  if (Math.abs(r) > 1e-9) out.rot = r;
  return out;
}

export function ellipseAsPoints(s: AreaShape, n = 16): AreaShape {
  if (s.k !== 'ellipse') return s;
  const c = Math.cos(s.rot ?? 0), sn = Math.sin(s.rot ?? 0), pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, ex = Math.cos(a) * (s.rx ?? 1), ey = Math.sin(a) * (s.ry ?? 1);
    pts.push((s.cx ?? 0) + ex * c - ey * sn, (s.cy ?? 0) + ex * sn + ey * c);
  }
  return { k: 'poly', pts };
}

export function shapeOnGrid(s: AreaShape, gc: number, gcY: number): AreaShape {
  if (s.k === 'ellipse') {
    shapeBox(s, _box);
    const hw = (_box.x1 - _box.x0) / 2, hh = (_box.y1 - _box.y0) / 2;
    const kx = hw > gc / 2 ? (gc / 2) / hw : 1, ky = hh > gcY / 2 ? (gcY / 2) / hh : 1, k = Math.min(kx, ky);
    const rx = Math.max(AREA_SHAPE_MIN_HALF, (s.rx ?? 1) * k), ry = Math.max(AREA_SHAPE_MIN_HALF, (s.ry ?? 1) * k);
    const h2w = hw * k, h2h = hh * k;
    const cx = Math.max(h2w, Math.min(gc - h2w, s.cx ?? 0)), cy = Math.max(h2h, Math.min(gcY - h2h, s.cy ?? 0));
    return { ...s, cx, cy, rx, ry };
  }
  const pts = (s.pts ?? []).slice();
  for (let i = 0; i + 1 < pts.length; i += 2) { pts[i] = Math.max(0, Math.min(gc, pts[i])); pts[i + 1] = Math.max(0, Math.min(gcY, pts[i + 1])); }
  return { ...s, pts };
}
