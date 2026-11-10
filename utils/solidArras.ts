export interface ArrasSolid {
  readonly key: string;
  readonly code: number;
  readonly faceSides: number;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly verts: Float64Array;
  readonly faces: Uint8Array;
  readonly circumradius: number;
}

const PHI = 1.618033988749895;
const IPHI = 0.6180339887498948;

function make(key: string, code: number, faceSides: number, verts: number[], faces: number[]): ArrasSolid {
  return Object.freeze({
    key, code, faceSides,
    vertexCount: verts.length / 3, faceCount: faces.length / faceSides,
    verts: Float64Array.from(verts), faces: Uint8Array.from(faces),
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

export function solidOf(key: string): ArrasSolid | undefined {
  return key === 'cube' ? SOLID_CUBE : key === 'dodecahedron' ? SOLID_DODECAHEDRON : key === 'icosahedron' ? SOLID_ICOSAHEDRON : undefined;
}

export const SOLID_TURN_UNITS = 30;
export const SOLID_STROKE_OF_BORDER = 0.6;
export const SOLID_STILL_X = 17;
export const SOLID_STILL_Y = 11;
export const SOLID_FACES_MAX = 120;

const _px = new Float64Array(20);
const _py = new Float64Array(20);
const _out = new Float64Array(SOLID_FACES_MAX);

export function solidFaces(s: ArrasSolid, X: number, Y: number, out: Float64Array): number {
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
  const K = s.faceSides, f = s.faces;
  let w = 0, shown = 0;
  for (let face = 0, nf = s.faceCount; face < nf; face++) {
    const base = face * K;
    const i0 = f[base], iN = f[base + K - 1];
    let area = _py[i0] * _px[iN] - _px[i0] * _py[iN];
    for (let k = 0; k + 1 < K; k++) {
      const p = f[base + k], q = f[base + k + 1];
      area += _px[p] * _py[q] - _py[p] * _px[q];
    }
    if (!(area > 0)) continue;
    for (let k = 0; k < K; k++) { const p = f[base + k]; out[w++] = _px[p]; out[w++] = _py[p]; }
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
  const shown = solidFaces(s, X, Y, _out);
  const K = s.faceSides;
  let w = 0;
  for (let face = 0; face < shown; face++) {
    ctx.moveTo(cx + _out[w] * r, cy + _out[w + 1] * r);
    w += 2;
    for (let k = 1; k < K; k++) { ctx.lineTo(cx + _out[w] * r, cy + _out[w + 1] * r); w += 2; }
    ctx.closePath();
  }
  return shown;
}
