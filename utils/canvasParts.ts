import type { BodyLayer } from '../types';
import { layerSolidOf } from './layerOutline';
import { solidStill, solidStillHas } from './solidArras';

export const LAYER_PLACE_MAX = 100;

type Placed = Pick<BodyLayer, 'x' | 'y'> | null | undefined;

export function layerIsPlaced(l: Placed): boolean {
  return l != null && ((l.x !== undefined && l.x !== 0) || (l.y !== undefined && l.y !== 0));
}

export function layerPlaceInto(out: { [i: number]: number }, l: Placed, r: number, cos: number, sin: number): void {
  const lx = (l && l.x ? l.x : 0) * r, ly = (l && l.y ? l.y : 0) * r;
  out[0] = lx * cos - ly * sin;
  out[1] = lx * sin + ly * cos;
}

export function addLayerPlace(out: { x: number; y: number }, l: Placed, r: number, angle: number): void {
  if (!layerIsPlaced(l)) return;
  const lx = (l!.x || 0) * r, ly = (l!.y || 0) * r;
  const c = Math.cos(angle), s = Math.sin(angle);
  out.x += lx * c - ly * s;
  out.y += lx * s + ly * c;
}

export function layerPlaceReach(l: Placed): number {
  if (!layerIsPlaced(l)) return 0;
  const x = l!.x || 0, y = l!.y || 0;
  return Math.sqrt(x * x + y * y);
}

type LayerShape = Pick<BodyLayer, 'sides' | 'starDepth' | 'starCurved' | 'copies' | 'initialAngle' | 'outline' | 'solidId'>;

export function realSizeFactor(sides: number): number {
  if (sides < 3 || sides > 16) return 1.0;
  const circum = (2 * Math.PI) / sides;
  return Math.sqrt(circum / Math.sin(circum));
}

const _SIDES_MAX = 32;
const _CURVE_STEPS = 8;
const _shapeX = new Float64Array(_SIDES_MAX * _CURVE_STEPS + 4);
const _shapeY = new Float64Array(_SIDES_MAX * _CURVE_STEPS + 4);

function _ringHas(xs: ArrayLike<number>, ys: ArrayLike<number>, n: number, px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = ys[i], yj = ys[j];
    if ((yi > py) !== (yj > py) && px < ((xs[j] - xs[i]) * (py - yi)) / (yj - yi) + xs[i]) inside = !inside;
  }
  return inside;
}

export function layerHasPoint(l: LayerShape, px: number, py: number, r: number): boolean {
  const sl = layerSolidOf(l);
  const o = sl === null && l.outline && l.outline.length >= 3 ? l.outline : null;
  if (sl === null && o === null && l.sides < 3) return px * px + py * py <= r * r;
  const copies = l.copies > 1 ? l.copies : 1;
  const init = l.initialAngle || 0;
  for (let c = 0; c < copies; c++) {
    const a = -(init + (Math.PI * 2 * c) / copies), ca = Math.cos(a), sa = Math.sin(a);
    const x = px * ca - py * sa, y = px * sa + py * ca;
    if (sl !== null) {
      if (r > 0 && solidStillHas(solidStill(sl), x / r, y / r)) return true;
      continue;
    }
    if (o !== null) {
      let inside = false;
      for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
        const xi = o[i][0] * r, yi = o[i][1] * r, xj = o[j][0] * r, yj = o[j][1] * r;
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return true;
      continue;
    }
    const n = Math.floor(l.sides), V = r * realSizeFactor(n);
    let m = 0;
    if (l.starDepth > 0 && l.starCurved) {
      const inner = V * (1 - l.starDepth);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, ah = ((i + 0.5) / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const x0 = V * Math.cos(a0), y0 = V * Math.sin(a0), cx = inner * Math.cos(ah), cy = inner * Math.sin(ah), x1 = V * Math.cos(a1), y1 = V * Math.sin(a1);
        for (let k = 0; k < _CURVE_STEPS; k++) {
          const t = k / _CURVE_STEPS, u = 1 - t;
          _shapeX[m] = u * u * x0 + 2 * u * t * cx + t * t * x1; _shapeY[m] = u * u * y0 + 2 * u * t * cy + t * t * y1; m++;
        }
      }
    } else if (l.starDepth > 0) {
      const inner = V * (1 - l.starDepth);
      for (let i = 0; i < n * 2; i++) {
        const a = (Math.PI * 2 * i) / (n * 2), rr = i % 2 === 0 ? V : inner;
        _shapeX[m] = rr * Math.cos(a); _shapeY[m] = rr * Math.sin(a); m++;
      }
    } else {
      for (let i = 0; i < n; i++) { const a = (Math.PI * 2 * i) / n; _shapeX[m] = V * Math.cos(a); _shapeY[m] = V * Math.sin(a); m++; }
    }
    if (_ringHas(_shapeX, _shapeY, m, x, y)) return true;
  }
  return false;
}

export function cleanLayerPlace(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const c = v > LAYER_PLACE_MAX ? LAYER_PLACE_MAX : v < -LAYER_PLACE_MAX ? -LAYER_PLACE_MAX : v;
  const r = Math.round(c * 1e4) / 1e4;
  return r === 0 ? undefined : r;
}
