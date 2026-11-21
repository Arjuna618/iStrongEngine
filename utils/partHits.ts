import { layerIsPlaced, layerPlaceInto, layerHasPoint, realSizeFactor } from './canvasParts';
import { layerOutlineOf, layerSolidOf } from './layerOutline';
import { solidStill, type ArrasSolid } from './solidArras';

export type PartHitKind = 'none' | 'circle' | 'exact';
export const PART_HIT_SIZE = Object.freeze({ min: 1, max: 400, circle: 100, exact: 90 });
export const PART_HIT_STRIDE = 8;
export const PART_HITS_MAX = 10;

type LayerLike = { sides: number; sizeRatio: number; intangible?: boolean; x?: number; y?: number; hits?: string; hitSize?: number;
  starDepth: number; starCurved: boolean; copies: number; initialAngle: number; outline?: [number, number][]; solidId?: string; stationary?: boolean; _currentAngle: number };

export function layerHitKind(l: LayerLike): PartHitKind {
  if (!layerIsPlaced(l as never) || l.intangible) return 'none';
  if (l.hits === 'none' || l.hits === 'circle' || l.hits === 'exact') return l.hits;
  return 'circle';
}
export function layerHitFrac(l: LayerLike, kind: PartHitKind): number {
  const v = typeof l.hitSize === 'number' && Number.isFinite(l.hitSize) ? Math.max(PART_HIT_SIZE.min, Math.min(PART_HIT_SIZE.max, l.hitSize))
    : kind === 'exact' ? PART_HIT_SIZE.exact : PART_HIT_SIZE.circle;
  return v / 100;
}
export function cleanHitKind(v: unknown): PartHitKind | undefined { return v === 'none' || v === 'circle' || v === 'exact' ? v : undefined; }

function sampleArea(l: LayerLike): number {
  let inside = 0;
  const N = 48;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = -2 + 4 * (i + 0.5) / N, y = -2 + 4 * (j + 0.5) / N;
    if (layerHasPoint(l as never, x, y, 1)) inside++;
  }
  return inside * (16 / (N * N));
}
const _areaOfOutline = new WeakMap<object, Map<number, number>>();
const _areaOfLayer = new WeakMap<object, { sides: number; depth: number; curved: boolean; copies: number; a: number }>();
const _areaOfSolid = new WeakMap<ArrasSolid, Map<number, number>>();
function unitArea(l: LayerLike): number {
  const copies = l.copies > 1 ? l.copies : 1;
  const sl = layerSolidOf(l);
  if (sl !== null) {
    let byCopies = _areaOfSolid.get(sl);
    if (byCopies === undefined) { byCopies = new Map(); _areaOfSolid.set(sl, byCopies); }
    let a = byCopies.get(copies);
    if (a === undefined) { a = sampleArea(l); byCopies.set(copies, a); }
    return a;
  }
  if (l.outline && l.outline.length >= 3) {
    let byCopies = _areaOfOutline.get(l.outline);
    if (byCopies === undefined) { byCopies = new Map(); _areaOfOutline.set(l.outline, byCopies); }
    let a = byCopies.get(copies);
    if (a === undefined) { a = sampleArea(l); byCopies.set(copies, a); }
    return a;
  }
  let r = _areaOfLayer.get(l);
  if (r === undefined || r.sides !== l.sides || r.depth !== l.starDepth || r.curved !== l.starCurved || r.copies !== copies) {
    const a = sampleArea(l);
    if (r === undefined) { r = { sides: l.sides, depth: l.starDepth, curved: l.starCurved, copies, a }; _areaOfLayer.set(l, r); }
    else { r.sides = l.sides; r.depth = l.starDepth; r.curved = l.starCurved; r.copies = copies; r.a = a; }
  }
  return r.a;
}

export function collectPartHits(layers: readonly LayerLike[] | null | undefined, sizePx: number, bodyAngle: number, out: Float64Array): number {
  if (!layers || layers.length === 0) return 0;
  const R = sizePx / 2, c = Math.cos(bodyAngle), s = Math.sin(bodyAngle);
  let n = 0;
  for (let i = 0; i < layers.length && n < PART_HITS_MAX; i++) {
    const l = layers[i];
    const kind = layerHitKind(l);
    if (kind === 'none') continue;
    const frac = layerHitFrac(l, kind);
    layerPlaceInto(_pl, l as never, R, c, s);
    const lr = R * l.sizeRatio;
    const o = n * PART_HIT_STRIDE;
    out[o] = kind === 'circle' ? 1 : 2;
    out[o + 1] = i;
    out[o + 2] = _pl[0]; out[o + 3] = _pl[1];
    if (kind === 'circle') {
      out[o + 4] = lr * frac;
      out[o + 6] = lr * frac;
    } else {
      const sl = layerSolidOf(l);
      const shapeReach = sl !== null ? solidStill(sl).reach : layerOutlineOf(l) ? outlineReachOf(l.outline!) : l.sides >= 3 ? realSizeFactor(Math.floor(l.sides)) : 1;
      out[o + 4] = lr * frac * shapeReach;
      out[o + 6] = lr * frac * Math.sqrt(unitArea(l) / Math.PI);
    }
    out[o + 5] = bodyAngle + (l.stationary ? -bodyAngle : l._currentAngle);
    out[o + 7] = frac;
    n++;
  }
  return n;
}
const _pl: number[] = [0, 0];
function outlineReachOf(o: readonly (readonly [number, number])[]): number {
  let r = 0;
  for (const q of o) { const d = Math.sqrt(q[0] * q[0] + q[1] * q[1]); if (d > r) r = d; }
  return r || 1;
}
export function partHitsReach(out: Float64Array, n: number): number {
  let r = 0;
  for (let k = 0; k < n; k++) { const o = k * PART_HIT_STRIDE, d = Math.sqrt(out[o + 2] * out[o + 2] + out[o + 3] * out[o + 3]) + out[o + 4]; if (d > r) r = d; }
  return r;
}
export function partHitTouch(layers: readonly LayerLike[], out: Float64Array, k: number, sizePx: number, px: number, py: number, br: number): boolean {
  const o = k * PART_HIT_STRIDE;
  const dx = px - out[o + 2], dy = py - out[o + 3];
  if (out[o] === 1) { const rr = out[o + 4] + br; return dx * dx + dy * dy <= rr * rr; }
  const reach = out[o + 4] + br;
  if (dx * dx + dy * dy > reach * reach) return false;
  const l = layers[out[o + 1]];
  const a = -out[o + 5], c = Math.cos(a), s = Math.sin(a);
  return layerHasPoint(l as never, dx * c - dy * s, dx * s + dy * c, (sizePx / 2) * l.sizeRatio * out[o + 7] + br);
}
