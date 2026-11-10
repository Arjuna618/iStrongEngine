import { SMALL_FIX } from '../game/smallFixSwitch';
export function outlineFillTriangles(pts: readonly (readonly [number, number])[]): number[] | null {
  const n = pts.length;
  if (n < 3) return null;
  let area2 = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    area2 += a[0] * b[1] - a[1] * b[0];
    if (a[0] < minX) minX = a[0]; if (a[0] > maxX) maxX = a[0];
    if (a[1] < minY) minY = a[1]; if (a[1] > maxY) maxY = a[1];
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(span > 0) || !(Math.abs(area2) > 1e-9 * span * span)) return null;
  const eps = 1e-12 * span * span;
  const same = 1e-9 * span;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  for (let i = 0; i < n; i++) { const q = pts[area2 > 0 ? i : n - 1 - i]; xs[i] = q[0]; ys[i] = q[1]; }
  const next = new Int32Array(n), prev = new Int32Array(n);
  for (let i = 0; i < n; i++) { next[i] = (i + 1) % n; prev[i] = (i + n - 1) % n; }
  const out: number[] = [];
  const at = (i: number, x: number, y: number): boolean => Math.abs(xs[i] - x) <= same && Math.abs(ys[i] - y) <= same;
  const into = (ux: number, uy: number, wx: number, wy: number, dx: number, dy: number): boolean =>
    ux * dy - uy * dx > eps && dx * wy - dy * wx > eps;
  const isEar = (a: number, b: number, c: number): boolean => {
    const ax = xs[a], ay = ys[a], bx = xs[b], by = ys[b], cx = xs[c], cy = ys[c];
    for (let q = next[c]; q !== a; q = next[q]) {
      const qx = xs[q], qy = ys[q];
      let k = -1;
      if (at(q, ax, ay)) k = 0; else if (at(q, bx, by)) k = 1; else if (at(q, cx, cy)) k = 2;
      if (k >= 0) {
        const px = k === 0 ? ax : k === 1 ? bx : cx, py = k === 0 ? ay : k === 1 ? by : cy;
        const ux = (k === 0 ? bx : k === 1 ? cx : ax) - px, uy = (k === 0 ? by : k === 1 ? cy : ay) - py;
        const wx = (k === 0 ? cx : k === 1 ? ax : bx) - px, wy = (k === 0 ? cy : k === 1 ? ay : by) - py;
        const p0 = prev[q], p1 = next[q];
        if (into(ux, uy, wx, wy, xs[p0] - px, ys[p0] - py) || into(ux, uy, wx, wy, xs[p1] - px, ys[p1] - py)) return false;
        continue;
      }
      const d1 = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
      const d2 = (cx - bx) * (qy - by) - (cy - by) * (qx - bx);
      const d3 = (ax - cx) * (qy - cy) - (ay - cy) * (qx - cx);
      if (d1 >= -eps && d2 >= -eps && d3 >= -eps) return false;
    }
    return true;
  };
  const turn = (v: number): number => {
    const a = prev[v], c = next[v];
    return (xs[v] - xs[a]) * (ys[c] - ys[v]) - (ys[v] - ys[a]) * (xs[c] - xs[v]);
  };
  const alive = new Uint8Array(n).fill(1);
  let count = n;
  const remove = (v: number): void => { next[prev[v]] = next[v]; prev[next[v]] = prev[v]; alive[v] = 0; count--; };
  const todo: number[] = [];
  for (let i = 0; i < n; i++) todo.push(i);
  const settle = (): void => {
    while (todo.length > 0 && count > 3) {
      const v = todo.pop() as number;
      if (alive[v] === 0 || Math.abs(turn(v)) > eps) continue;
      const a = prev[v], c = next[v];
      remove(v);
      todo.push(a, c);
    }
    todo.length = 0;
  };
  const live = (v: number): number => { while (alive[v] === 0) v = next[v]; return v; };
  settle();
  let cur = live(0);
  while (count > 3) {
    let found = false;
    for (let k = 0; k < count; k++) {
      const a = prev[cur], c = next[cur];
      if (turn(cur) > eps && isEar(a, cur, c)) {
        out.push(xs[a], ys[a], xs[cur], ys[cur], xs[c], ys[c]);
        remove(cur);
        todo.push(a, c); settle();
        cur = live(a);
        found = true;
        break;
      }
      cur = c;
    }
    if (!found) return null;
  }
  if (count === 3 && turn(cur) > eps) { const a = prev[cur], c = next[cur]; out.push(xs[a], ys[a], xs[cur], ys[cur], xs[c], ys[c]); }
  let got2 = 0;
  for (let t = 0; t < out.length; t += 6) got2 += (out[t + 2] - out[t]) * (out[t + 5] - out[t + 1]) - (out[t + 3] - out[t + 1]) * (out[t + 4] - out[t]);
  return out.length > 0 && Math.abs(got2 - Math.abs(area2)) <= 1e-6 * Math.abs(area2) ? out : null;
}

export const OUTLINE_SEAMS = { ON: true };
function _winding(p: readonly (readonly [number, number])[], x: number, y: number): number {
  let w = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const side = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
    if (a[1] <= y) { if (b[1] > y && side > 0) w++; } else if (b[1] <= y && side < 0) w--;
  }
  return w;
}
const _EDGE_MIDDLE: readonly number[] = [0.5];
const _EDGE_SAMPLES: readonly number[] = [0.05, 0.25, 0.5, 0.75, 0.95];
export function outlineStrokeLoops(pts: readonly (readonly [number, number])[]): [number, number][][] | null {
  if (!OUTLINE_SEAMS.ON) return null;
  const n = pts.length;
  if (n < 3) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { const q = pts[i]; if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0]; if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(span > 0)) return null;
  const same = 1e-9 * span;
  const next = new Int32Array(n), prev = new Int32Array(n), alive = new Uint8Array(n).fill(1);
  for (let i = 0; i < n; i++) { next[i] = (i + 1) % n; prev[i] = (i + n - 1) % n; }
  const eq = (i: number, j: number): boolean => Math.abs(pts[i][0] - pts[j][0]) <= same && Math.abs(pts[i][1] - pts[j][1]) <= same;
  let count = n, seam = false;
  const remove = (v: number): void => { next[prev[v]] = next[v]; prev[next[v]] = prev[v]; alive[v] = 0; count--; };
  const covered = (i: number, j: number, whole = false): boolean => {
    const ax = pts[i][0], ay = pts[i][1], dx = pts[j][0] - ax, dy = pts[j][1] - ay, L = Math.hypot(dx, dy);
    if (!(L > 0)) return false;
    const k = 1e-4 * span / L;
    const ts = whole && SMALL_FIX.G731 !== 0 ? _EDGE_SAMPLES : _EDGE_MIDDLE;
    for (let q = 0; q < ts.length; q++) {
      const t = ts[q], x = ax + dx * t + dy * k, y = ay + dy * t - dx * k, x2 = ax + dx * t - dy * k, y2 = ay + dy * t + dx * k;
      if (!(_winding(pts, x, y) !== 0 && _winding(pts, x2, y2) !== 0)) return false;
    }
    return true;
  };
  const todo: number[] = [];
  for (let i = n - 1; i >= 0; i--) todo.push(i);
  while (todo.length > 0 && count > 3) {
    const v = todo.pop() as number;
    if (alive[v] === 0) continue;
    if (eq(v, next[v])) { remove(v); todo.push(prev[v]); continue; }
    if (eq(prev[v], next[v])) { const a = prev[v]; if (!covered(a, v, true)) return null; remove(v); seam = true; todo.push(a, next[a]); }
  }
  let s = 0; while (alive[s] === 0) s++;
  const order: number[] = [];
  for (let v = s, k = 0; k < count; k++, v = next[v]) order.push(v);
  const m = order.length;
  if (m < 3) return null;
  const bridge = new Uint8Array(m);
  let any = seam;
  for (let k = 0; k < m; k++) {
    const a = order[k], b = order[(k + 1) % m];
    for (let j = 0; j < m; j++) if (j !== k && eq(order[j], b) && eq(order[(j + 1) % m], a)) { bridge[k] = 1; any = true; break; }
    if (bridge[k] && !covered(a, b)) return null;
  }
  if (!any) return null;
  const used = new Uint8Array(m);
  const loops: [number, number][][] = [];
  for (let k0 = 0; k0 < m; k0++) {
    if (bridge[k0] || used[k0]) continue;
    const loop: [number, number][] = [];
    let k = k0;
    for (let guard = 0; ; guard++) {
      if (guard > m) return null;
      used[k] = 1;
      loop.push([pts[order[k]][0], pts[order[k]][1]]);
      const end = order[(k + 1) % m];
      let nk = -1;
      for (let d = 1; d <= m; d++) { const j = (k + d) % m; if (!bridge[j] && eq(order[j], end)) { nk = j; break; } }
      if (nk === k0) break;
      if (nk < 0 || used[nk]) return null;
      k = nk;
    }
    if (loop.length < 3) return null;
    loops.push(loop);
  }
  return loops.length > 0 ? loops : null;
}
