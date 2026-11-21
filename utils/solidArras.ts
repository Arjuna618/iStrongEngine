import { normalizeSolid, SOLID_LIMITS } from './solidDesign';
import type { SolidDesign } from '../types';

export interface ArrasSolid {
  readonly key: string;
  readonly code: number;
  readonly faceSides: number;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly verts: Float64Array;
  readonly faces: Uint8Array;
  readonly faceStart: Uint16Array;
  readonly faceLen: Uint8Array;
  readonly outMax: number;
  readonly circumradius: number;
}

const PHI = 1.618033988749895;
const IPHI = 0.6180339887498948;

function make(key: string, code: number, faceSides: number, verts: number[], faces: number[]): ArrasSolid {
  const faceCount = faces.length / faceSides;
  const faceStart = new Uint16Array(faceCount), faceLen = new Uint8Array(faceCount);
  for (let f = 0; f < faceCount; f++) { faceStart[f] = f * faceSides; faceLen[f] = faceSides; }
  return Object.freeze({
    key, code, faceSides,
    vertexCount: verts.length / 3, faceCount,
    verts: Float64Array.from(verts), faces: Uint8Array.from(faces), faceStart, faceLen, outMax: faces.length * 2,
    circumradius: Math.hypot(verts[0], verts[1], verts[2]),
  });
}

export const SOLID_ICOSAHEDRON: ArrasSolid = make('icosahedron', 2051, 3, [
  0, 1, PHI, 0, 1, -PHI, 0, -1, PHI, 0, -1, -PHI,
  1, PHI, 0, 1, -PHI, 0, -1, PHI, 0, -1, -PHI, 0,
  PHI, 0, 1, PHI, 0, -1, -PHI, 0, 1, -PHI, 0, -1,
], [
  0, 8, 2, 0, 4, 8, 0, 6, 4, 0, 10, 6, 0, 2, 10, 2, 8, 5, 8, 4, 9, 4, 6, 1, 6, 10, 11, 10, 2, 7,
  2, 5, 7, 8, 9, 5, 4, 1, 9, 6, 11, 1, 10, 7, 11, 7, 5, 3, 5, 9, 3, 9, 1, 3, 1, 11, 3, 11, 7, 3,
]);

export const SOLID_CUBE: ArrasSolid = make('cube', 2052, 4, [
  1, 1, 1, 1, 1, -1, 1, -1, 1, 1, -1, -1, -1, 1, 1, -1, 1, -1, -1, -1, 1, -1, -1, -1,
], [
  0, 1, 3, 2, 6, 7, 5, 4, 0, 4, 5, 1, 3, 7, 6, 2, 0, 2, 6, 4, 5, 7, 3, 1,
]);

export const SOLID_DODECAHEDRON: ArrasSolid = make('dodecahedron', 2053, 5, [
  1, 1, 1, 1, 1, -1, 1, -1, 1, 1, -1, -1, -1, 1, 1, -1, 1, -1, -1, -1, 1, -1, -1, -1,
  0, PHI, IPHI, 0, PHI, -IPHI, 0, -PHI, IPHI, 0, -PHI, -IPHI,
  IPHI, 0, PHI, IPHI, 0, -PHI, -IPHI, 0, PHI, -IPHI, 0, -PHI,
  PHI, IPHI, 0, PHI, -IPHI, 0, -PHI, IPHI, 0, -PHI, -IPHI, 0,
], [
  12, 14, 4, 8, 0, 0, 8, 9, 1, 16, 8, 4, 18, 5, 9, 4, 14, 6, 19, 18, 14, 12, 2, 10, 6, 12, 0, 16, 17, 2,
  1, 9, 5, 15, 13, 5, 18, 19, 7, 15, 19, 6, 10, 11, 7, 10, 2, 17, 3, 11, 17, 16, 1, 13, 3, 13, 15, 7, 11, 3,
]);

export const ARRAS_SOLIDS: readonly ArrasSolid[] = Object.freeze([SOLID_CUBE, SOLID_DODECAHEDRON, SOLID_ICOSAHEDRON]);

const _his = new Map<string, ArrasSolid>();
let _hisVersion = 0;

export function solidOf(key: string): ArrasSolid | undefined {
  return key === 'cube' ? SOLID_CUBE : key === 'dodecahedron' ? SOLID_DODECAHEDRON : key === 'icosahedron' ? SOLID_ICOSAHEDRON : _his.get(key);
}

export const HIS_SOLID_ID_RE = /^solid:[\p{L}\p{N}-]{1,64}$/u;

export function solidFromDesign(design: SolidDesign): ArrasSolid {
  const nf = design.faces.length;
  let total = 0;
  for (let f = 0; f < nf; f++) total += design.faces[f].length;
  const faces = new Uint8Array(total), faceStart = new Uint16Array(nf), faceLen = new Uint8Array(nf);
  let w = 0, uniform = nf > 0 ? design.faces[0].length : 0;
  for (let f = 0; f < nf; f++) {
    const face = design.faces[f];
    faceStart[f] = w; faceLen[f] = face.length;
    if (face.length !== uniform) uniform = 0;
    for (let k = 0; k < face.length; k++) faces[w++] = face[k];
  }
  const v = design.verts;
  let reach = 0;
  for (let i = 0; i + 2 < v.length; i += 3) { const d = Math.hypot(v[i], v[i + 1], v[i + 2]); if (d > reach) reach = d; }
  return Object.freeze({
    key: design.solidId, code: 0, faceSides: uniform, vertexCount: v.length / 3, faceCount: nf,
    verts: Float64Array.from(v), faces, faceStart, faceLen, outMax: total * 2, circumradius: reach,
  });
}

export function registerSolid(design: unknown): ArrasSolid | null {
  const d = normalizeSolid(design);
  if (!d || !HIS_SOLID_ID_RE.test(d.solidId)) return null;
  const s = solidFromDesign(d);
  _his.set(d.solidId, s);
  _hisVersion++;
  return s;
}
export function unregisterSolid(id: string): boolean {
  if (!_his.delete(id)) return false;
  _hisVersion++;
  return true;
}
export function solidRegistryVersion(): number { return _hisVersion; }
export function hisSolids(): ArrasSolid[] { return Array.from(_his.values()); }

export const SOLID_TURN_UNITS = 30;
export const SOLID_STROKE_OF_BORDER = 0.6;
export const SOLID_STILL_X = 17;
export const SOLID_STILL_Y = 11;
export const SOLID_FACES_MAX = 120;
export const SOLID_OUT_MAX = SOLID_LIMITS.faces * SOLID_LIMITS.faceSides * 2;
export const SOLID_FACE_COUNT_MAX = SOLID_LIMITS.faces;

const _px = new Float64Array(SOLID_LIMITS.verts);
const _py = new Float64Array(SOLID_LIMITS.verts);
const _out = new Float64Array(SOLID_OUT_MAX);
const _sides = new Uint8Array(SOLID_FACE_COUNT_MAX);

export function solidFaces(s: ArrasSolid, X: number, Y: number, out: Float64Array, sidesOut?: Uint8Array): number {
  const a = X / SOLID_TURN_UNITS, b = Y / SOLID_TURN_UNITS;
  const s1 = Math.sin(a), c1 = Math.cos(a), s2 = Math.sin(b), c2 = Math.cos(b);
  const v = s.verts;
  for (let i = 0, n = s.vertexCount; i < n; i++) {
    const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
    const y1 = y * c1 - z * s1;
    const z1 = z * c1 + y * s1;
    _px[i] = x * c2 - s2 * z1;
    _py[i] = y1;
  }
  const f = s.faces, starts = s.faceStart, lens = s.faceLen;
  let w = 0, shown = 0;
  for (let face = 0, nf = s.faceCount; face < nf; face++) {
    const base = starts[face], K = lens[face];
    const i0 = f[base], iN = f[base + K - 1];
    let area = _py[i0] * _px[iN] - _px[i0] * _py[iN];
    for (let k = 0; k + 1 < K; k++) {
      const p = f[base + k], q = f[base + k + 1];
      area += _px[p] * _py[q] - _py[p] * _px[q];
    }
    if (!(area > 0)) continue;
    for (let k = 0; k < K; k++) { const p = f[base + k]; out[w++] = _px[p]; out[w++] = _py[p]; }
    if (sidesOut !== undefined) sidesOut[shown] = K;
    shown++;
  }
  return shown;
}

export interface SolidPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

export function solidPath(ctx: SolidPathSink, s: ArrasSolid, X: number, Y: number, cx: number, cy: number, r: number): number {
  const shown = solidFaces(s, X, Y, _out, _sides);
  let w = 0;
  for (let face = 0; face < shown; face++) {
    const K = _sides[face];
    ctx.moveTo(cx + _out[w] * r, cy + _out[w + 1] * r);
    w += 2;
    for (let k = 1; k < K; k++) { ctx.lineTo(cx + _out[w] * r, cy + _out[w + 1] * r); w += 2; }
    ctx.closePath();
  }
  return shown;
}

export interface SolidStillView {
  readonly faceCount: number;
  readonly faceLen: Uint8Array;
  readonly faceAt: Uint16Array;
  readonly xy: Float64Array;
  readonly corners: Float64Array;
  readonly cornerCount: number;
  readonly reach: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}
const _stillOf = new WeakMap<ArrasSolid, SolidStillView>();
export function solidStill(s: ArrasSolid): SolidStillView {
  let v = _stillOf.get(s);
  if (v !== undefined) return v;
  const out = new Float64Array(Math.max(2, s.outMax)), lens = new Uint8Array(Math.max(1, s.faceCount));
  const shown = solidFaces(s, SOLID_STILL_X, SOLID_STILL_Y, out, lens);
  const k = s.circumradius > 0 ? 1 / s.circumradius : 1;
  let n = 0;
  for (let f = 0; f < shown; f++) n += lens[f];
  const xy = new Float64Array(n * 2), faceLen = new Uint8Array(shown), faceAt = new Uint16Array(shown);
  for (let f = 0, c = 0; f < shown; f++) { faceLen[f] = lens[f]; faceAt[f] = c; c += lens[f]; }
  for (let i = 0; i < n * 2; i++) xy[i] = out[i] * k;
  const cs: number[] = [];
  let reach = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xy[i * 2], y = xy[i * 2 + 1];
    let seen = false;
    for (let j = 0; j < cs.length; j += 2) if (cs[j] === x && cs[j + 1] === y) { seen = true; break; }
    if (!seen) cs.push(x, y);
    const d = Math.sqrt(x * x + y * y);
    if (d > reach) reach = d;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (n === 0) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
  v = Object.freeze({ faceCount: shown, faceLen, faceAt, xy, corners: Float64Array.from(cs), cornerCount: cs.length / 2, reach, minX, maxX, minY, maxY });
  _stillOf.set(s, v);
  return v;
}

export function solidStillHas(v: SolidStillView, x: number, y: number): boolean {
  const xy = v.xy;
  for (let f = 0; f < v.faceCount; f++) {
    const a = v.faceAt[f] * 2, K = v.faceLen[f];
    let inside = false;
    for (let i = 0, j = K - 1; i < K; j = i++) {
      const xi = xy[a + i * 2], yi = xy[a + i * 2 + 1], xj = xy[a + j * 2], yj = xy[a + j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

const _stillLoopOf = new WeakMap<ArrasSolid, [number, number][] | null>();
export function solidStillOutline(s: ArrasSolid): [number, number][] | null {
  const kept = _stillLoopOf.get(s);
  return kept !== undefined ? kept : _buildStillOutline(s);
}
function _buildStillOutline(s: ArrasSolid): [number, number][] | null {
  const v = solidStill(s), xy = v.xy;
  const ea: number[] = [], eb: number[] = [];
  for (let f = 0; f < v.faceCount; f++) {
    const at = v.faceAt[f], K = v.faceLen[f];
    for (let i = 0; i < K; i++) { ea.push(at + i); eb.push(at + (i + 1) % K); }
  }
  const same = (p: number, q: number): boolean => xy[p * 2] === xy[q * 2] && xy[p * 2 + 1] === xy[q * 2 + 1];
  const outer: number[] = [];
  for (let e = 0; e < ea.length; e++) {
    let shared = false;
    for (let g = 0; g < ea.length && !shared; g++) if (g !== e && same(ea[g], eb[e]) && same(eb[g], ea[e])) shared = true;
    if (!shared) outer.push(e);
  }
  let loop: [number, number][] | null = null;
  const m = outer.length;
  if (m >= 3) {
    const used = new Uint8Array(m);
    const pts: [number, number][] = [];
    let cur = 0, ok = true;
    for (let step = 0; step < m; step++) {
      if (used[cur]) { ok = false; break; }
      used[cur] = 1;
      const e = outer[cur];
      pts.push([xy[ea[e] * 2], xy[ea[e] * 2 + 1]]);
      let next = -1, count = 0;
      for (let q = 0; q < m; q++) if (same(ea[outer[q]], eb[e])) { count++; next = q; }
      if (count !== 1) { ok = false; break; }
      cur = next;
    }
    if (ok && cur === 0) loop = pts;
  }
  _stillLoopOf.set(s, loop);
  return loop;
}
