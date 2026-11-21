import type { SolidDesign, ExportFile, LibraryItem } from '../types';
import { nameSlug, nameSlugLegacy } from './nameSlug';

export const SOLID_LIMITS = Object.freeze({ verts: 64, faces: 96, faceSides: 12, coord: 4, name: 40 });
export const SOLID_FILE_TYPE = 'Solid' as const;
export const SOLID_GAME_IDS: readonly string[] = Object.freeze(['cube', 'dodecahedron', 'icosahedron']);
const SOLID_SLUG_MAX = 48;

export function makeSolidId(name: string): string {
  return 'solid:' + (nameSlug(name, SOLID_SLUG_MAX) || 'solid');
}
export function makeSolidIdLegacy(name: string): string {
  return 'solid:' + (nameSlugLegacy(name, SOLID_SLUG_MAX) || 'solid');
}

function newell(v: readonly number[], f: readonly number[]): [number, number, number] {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < f.length; i++) {
    const a = f[i] * 3, b = f[(i + 1) % f.length] * 3;
    nx += (v[a + 1] - v[b + 1]) * (v[a + 2] + v[b + 2]);
    ny += (v[a + 2] - v[b + 2]) * (v[a] + v[b]);
    nz += (v[a] - v[b]) * (v[a + 1] + v[b + 1]);
  }
  return [nx, ny, nz];
}

export function orientFaces(verts: readonly number[], faces: number[][]): number[][] {
  const n = verts.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += verts[i * 3]; cy += verts[i * 3 + 1]; cz += verts[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  return faces.map((f) => {
    const [nx, ny, nz] = newell(verts, f);
    let fx = 0, fy = 0, fz = 0;
    for (const k of f) { fx += verts[k * 3]; fy += verts[k * 3 + 1]; fz += verts[k * 3 + 2]; }
    fx = fx / f.length - cx; fy = fy / f.length - cy; fz = fz / f.length - cz;
    return nx * fx + ny * fy + nz * fz > 0 ? f.slice().reverse() : f.slice();
  });
}

export function normalizeSolid(d: unknown): SolidDesign | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const vin = o.verts, fin = o.faces;
  if (!Array.isArray(vin) || vin.length % 3 !== 0) return null;
  const nv = vin.length / 3;
  if (nv < 4 || nv > SOLID_LIMITS.verts) return null;
  const verts: number[] = [];
  for (const x of vin) {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < -SOLID_LIMITS.coord || x > SOLID_LIMITS.coord) return null;
    verts.push(x);
  }
  if (!Array.isArray(fin) || fin.length < 4 || fin.length > SOLID_LIMITS.faces) return null;
  const faces: number[][] = [];
  for (const f of fin) {
    if (!Array.isArray(f) || f.length < 3 || f.length > SOLID_LIMITS.faceSides) return null;
    const seen = new Set<number>();
    const face: number[] = [];
    for (const k of f) {
      if (typeof k !== 'number' || !Number.isInteger(k) || k < 0 || k >= nv || seen.has(k)) return null;
      seen.add(k); face.push(k);
    }
    faces.push(face);
  }
  const name = (typeof o.name === 'string' ? o.name.trim() : '').slice(0, SOLID_LIMITS.name).trim() || 'Solid';
  const id = typeof o.solidId === 'string' && o.solidId.trim() !== '' ? o.solidId.trim() : makeSolidId(name);
  return { _designVersion: 1, solidId: id, name, verts, faces: orientFaces(verts, faces) };
}

export function solidFileOf(design: SolidDesign, timestamp: number): ExportFile {
  return { version: '1.0.0', type: SOLID_FILE_TYPE, name: design.name, timestamp, category: 'Solids', data: design };
}
export function solidFileNameOf(design: SolidDesign): string {
  const words = design.solidId.startsWith('solid:') ? design.solidId.slice(6) : '';
  return 'solid-' + (words || 'solid') + '.json';
}
export function solidLibraryItem(design: SolidDesign, timestamp: number): LibraryItem {
  return { id: 'user-solid/' + design.solidId, name: design.name, fileData: solidFileOf(design, timestamp), loadedAt: timestamp };
}

const R3 = Math.sqrt(3);
function starter(name: string, verts: number[], faces: number[][]): SolidDesign {
  return { _designVersion: 1, solidId: makeSolidId(name), name, verts, faces: orientFaces(verts, faces) };
}
export const SOLID_STARTERS: readonly SolidDesign[] = Object.freeze([
  starter('Tetrahedron', [1.5, 1.5, 1.5, 1.5, -1.5, -1.5, -1.5, 1.5, -1.5, -1.5, -1.5, 1.5], [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]),
  starter('Octahedron', [R3, 0, 0, -R3, 0, 0, 0, R3, 0, 0, -R3, 0, 0, 0, R3, 0, 0, -R3],
    [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]]),
  starter('Triangular Prism', [0, 2, 1, R3, -1, 1, -R3, -1, 1, 0, 2, -1, R3, -1, -1, -R3, -1, -1],
    [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]]),
  starter('Square Pyramid', [1, -1, 1, 1, -1, -1, -1, -1, -1, -1, -1, 1, 0, 1.6, 0],
    [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]),
  starter('Hexagonal Prism', (() => { const v: number[] = []; for (const z of [1, -1]) for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; v.push(1.15 * Math.cos(a), 1.15 * Math.sin(a), z); } return v; })(),
    [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11], [0, 1, 7, 6], [1, 2, 8, 7], [2, 3, 9, 8], [3, 4, 10, 9], [4, 5, 11, 10], [5, 0, 6, 11]]),
]);
