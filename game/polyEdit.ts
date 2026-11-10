export const nPts = (p: readonly number[]): number => p.length >> 1;

export function movePoints(p: readonly number[], sel: readonly number[], dx: number, dy: number): number[] {
  const out = p.slice();
  for (const i of sel) if (i >= 0 && i < (out.length >> 1)) { out[i * 2] += dx; out[i * 2 + 1] += dy; }
  return out;
}

export function constrainEight(dx: number, dy: number): [number, number] {
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const ux = Math.round(Math.cos(a * Math.PI / 4)), uy = Math.round(Math.sin(a * Math.PI / 4));
  const d = ux !== 0 && uy !== 0 ? (Math.abs(dx) + Math.abs(dy)) / 2 : Math.abs(ux !== 0 ? dx : dy);
  return [ux * d, uy * d];
}

export function sideNormal(p: readonly number[], i: number): [number, number] {
  const n = nPts(p), j = (i + 1) % n;
  const ex = p[j * 2] - p[i * 2], ey = p[j * 2 + 1] - p[i * 2 + 1], l = Math.sqrt(ex * ex + ey * ey) || 1;
  let a = 0;
  for (let k = 0, m = n - 1; k < n; m = k++) a += p[m * 2] * p[k * 2 + 1] - p[k * 2] * p[m * 2 + 1];
  const s = a >= 0 ? 1 : -1;
  return [(ey / l) * s, (-ex / l) * s];
}

export function along(dx: number, dy: number, ux: number, uy: number): [number, number] {
  const d = dx * ux + dy * uy;
  return [ux * d, uy * d];
}

export function nearestSide(p: readonly number[], x: number, y: number, reach: number): { i: number; qx: number; qy: number; t: number } | null {
  const n = nPts(p);
  let best = reach * reach, out: { i: number; qx: number; qy: number; t: number } | null = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], ay = p[i * 2 + 1], ex = p[j * 2] - ax, ey = p[j * 2 + 1] - ay, l2 = ex * ex + ey * ey;
    let t = l2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t, qy = ay + ey * t, d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
    if (d2 <= best) { best = d2; out = { i, qx, qy, t }; }
  }
  return out;
}

export function nearestPoint(p: readonly number[], x: number, y: number, reach: number): number {
  for (let i = nPts(p) - 1; i >= 0; i--) if (Math.abs(x - p[i * 2]) <= reach && Math.abs(y - p[i * 2 + 1]) <= reach) return i;
  return -1;
}

export function insertPoint(p: readonly number[], i: number, x: number, y: number): number[] {
  const out = p.slice();
  out.splice(i * 2 + 2, 0, x, y);
  return out;
}

export function extrudeSide(p: readonly number[], i: number): number[] {
  const n = nPts(p), j = (i + 1) % n;
  const out = p.slice();
  out.splice(i * 2 + 2, 0, p[i * 2], p[i * 2 + 1], p[j * 2], p[j * 2 + 1]);
  return out;
}

export function removePoints(p: readonly number[], sel: readonly number[], min = 3): number[] | null {
  const drop = new Set(sel.filter(i => i >= 0 && i < nPts(p)));
  if (drop.size === 0 || nPts(p) - drop.size < min) return null;
  const out: number[] = [];
  for (let i = 0; i < nPts(p); i++) if (!drop.has(i)) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

export function pointsInBox(p: readonly number[], x0: number, y0: number, x1: number, y1: number): number[] {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const out: number[] = [];
  for (let i = 0; i < nPts(p); i++) { const x = p[i * 2], y = p[i * 2 + 1]; if (x >= ax && x <= bx && y >= ay && y <= by) out.push(i); }
  return out;
}

export function mergeTwins(p: readonly number[], eps = 1e-6): number[] {
  const out: number[] = [];
  const n = nPts(p);
  for (let i = 0; i < n; i++) {
    const x = p[i * 2], y = p[i * 2 + 1];
    if (out.length >= 2 && Math.abs(out[out.length - 2] - x) < eps && Math.abs(out[out.length - 1] - y) < eps) continue;
    out.push(x, y);
  }
  while (out.length >= 4 && Math.abs(out[0] - out[out.length - 2]) < eps && Math.abs(out[1] - out[out.length - 1]) < eps) out.length -= 2;
  return out;
}
