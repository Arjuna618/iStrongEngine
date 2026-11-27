import type { SolidDesign, LibraryItem } from '../../types';
import { ARRAS_SOLIDS, type ArrasSolid } from '../../utils/solidArras';
import { SOLID_LIMITS, SOLID_STARTERS, SOLID_GAME_IDS, SOLID_FILE_TYPE, makeSolidId, normalizeSolid, solidLibraryItem } from '../../utils/solidDesign';
import { solidReach, type Vec3 } from './solidView';
import { cutName } from '../../game/project/hubNaming';
import { SMALL_FIX } from '../../game/smallFixSwitch';
export interface SolidSource {
  readonly key: string;
  readonly design: SolidDesign;
  readonly itemId?: string;
}

function gameDesign(s: ArrasSolid): SolidDesign {
  const faces: number[][] = [];
  for (let k = 0; k < s.faceCount; k++) faces.push(Array.from(s.faces.subarray(s.faceStart[k], s.faceStart[k] + s.faceLen[k])));
  return { _designVersion: 1, solidId: s.key, name: s.key.charAt(0).toUpperCase() + s.key.slice(1), verts: Array.from(s.verts), faces };
}
export const GAME_SOLID_DESIGNS: readonly SolidDesign[] = Object.freeze(ARRAS_SOLIDS.map(gameDesign));

export const STARTER_SOURCES: readonly SolidSource[] = Object.freeze(SOLID_STARTERS.map(d => ({ key: 'starter:' + d.solidId, design: d })));
export const GAME_SOURCES: readonly SolidSource[] = Object.freeze(GAME_SOLID_DESIGNS.map(d => ({ key: 'game:' + d.solidId, design: d })));

export function savedSources(library: readonly LibraryItem[] | null | undefined): SolidSource[] {
  const out: SolidSource[] = [];
  if (!library) return out;
  for (const it of library) {
    if (!it || !it.fileData || it.fileData.type !== SOLID_FILE_TYPE) continue;
    const d = normalizeSolid(it.fileData.data);
    if (!d || SOLID_GAME_IDS.includes(d.solidId)) continue;
    out.push({ key: 'saved:' + it.id, design: d, itemId: it.id });
  }
  return out;
}

export function startOf(design: SolidDesign | null, library: readonly LibraryItem[] | null | undefined): { source: SolidSource; bad: boolean } {
  if (!design) return { source: STARTER_SOURCES[0], bad: false };
  const d = normalizeSolid(design);
  if (!d) return { source: STARTER_SOURCES[0], bad: true };
  if (SOLID_GAME_IDS.includes(d.solidId)) return { source: { key: 'game:' + d.solidId, design: d }, bad: false };
  for (const s of savedSources(library)) if (s.design.solidId === d.solidId) return { source: { key: s.key, design: d, itemId: s.itemId }, bad: false };
  return { source: { key: '', design: d }, bad: false };
}

export function nameToSave(name: string): string {
  return cutName(name.trim(), SOLID_LIMITS.name) || 'Solid';
}

export function designToSave(verts: readonly number[], faces: readonly (readonly number[])[], name: string): SolidDesign | null {
  const nm = nameToSave(name);
  return normalizeSolid({ _designVersion: 1, solidId: makeSolidId(nm), name: nm, verts, faces });
}

export type SolidSavePlan =
  | { kind: 'new'; item: LibraryItem }
  | { kind: 'replace'; item: LibraryItem; asks: boolean }
  | { kind: 'clash'; name: string }
  | { kind: 'bad' };
export function planSave(verts: readonly number[], faces: readonly (readonly number[])[], name: string, library: readonly LibraryItem[] | null | undefined, now: number, editingKey: string = ''): SolidSavePlan {
  const d = designToSave(verts, faces, name);
  if (!d) return { kind: 'bad' };
  let same: SolidSource | undefined;
  for (const s of savedSources(library)) if (s.design.solidId === d.solidId) { same = s; break; }
  if (same && same.design.name !== d.name) return { kind: 'clash', name: same.design.name };
  const item = solidLibraryItem(d, now);
  if (same && same.itemId !== undefined && same.itemId !== item.id) item.id = same.itemId;
  if (!same) return { kind: 'new', item };
  return { kind: 'replace', item, asks: editingKey !== 'saved:' + item.id };
}

export function orientInPlace(verts: ArrayLike<number>, faces: number[][]): number {
  const n = verts.length / 3;
  if (!(n > 0)) return 0;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += verts[i * 3]; cy += verts[i * 3 + 1]; cz += verts[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  let turned = 0;
  for (let k = 0; k < faces.length; k++) {
    const f = faces[k], K = f.length;
    let nx = 0, ny = 0, nz = 0, fx = 0, fy = 0, fz = 0;
    for (let i = 0; i < K; i++) {
      const a = f[i] * 3, b = f[(i + 1) % K] * 3;
      nx += (verts[a + 1] - verts[b + 1]) * (verts[a + 2] + verts[b + 2]);
      ny += (verts[a + 2] - verts[b + 2]) * (verts[a] + verts[b]);
      nz += (verts[a] - verts[b]) * (verts[a + 1] + verts[b + 1]);
    }
    for (let i = 0; i < K; i++) { const p = f[i] * 3; fx += verts[p]; fy += verts[p + 1]; fz += verts[p + 2]; }
    fx = fx / K - cx; fy = fy / K - cy; fz = fz / K - cz;
    if (nx * fx + ny * fy + nz * fz > 0) {
      for (let i = 0, j = K - 1; i < j; i++, j--) { const t = f[i]; f[i] = f[j]; f[j] = t; }
      turned++;
    }
  }
  return turned;
}

export const SOLID_SIZE_MIN = 0.25;
export const SOLID_SIZE_MAX = 4;
const _factor = { k: 0.5 };
function factorInto(from: ArrayLike<number>, target: number, out: { k: number }): void {
  let m = 0, far = 0;
  for (let i = 0; i + 2 < from.length; i += 3) {
    const d = from[i] * from[i] + from[i + 1] * from[i + 1] + from[i + 2] * from[i + 2];
    if (d > m) m = d;
  }
  for (let i = 0; i < from.length; i++) { const a = from[i] < 0 ? -from[i] : from[i]; if (a > far) far = a; }
  const reach = Math.sqrt(m);
  if (!(reach > 1e-9) || !(target > 0) || !(target - target === 0)) { out.k = 1; return; }
  const k = target / reach, cap = far > 0 ? SOLID_LIMITS.coord / far : k;
  out.k = k < cap ? k : cap;
}
export function sizeFactor(from: ArrayLike<number>, target: number): number {
  factorInto(from, target, _factor);
  return _factor.k;
}

interface CleanMark { name: string; verts: number[]; faces: number[][] }
interface SolidSnap { key: string; name: string; solidId: string; verts: number[]; faces: number[][]; pick: number; clean: CleanMark; dirty: boolean }
interface MoveStep { kind: 'move'; corner: number; from: [number, number, number]; to: [number, number, number]; by: string; open: boolean }
interface ShapeStep { kind: 'shape'; from: number[]; to: number[]; by: string; open: boolean }
interface LoadStep { kind: 'load'; before: SolidSnap; after: SolidSnap }
type SolidStep = MoveStep | ShapeStep | LoadStep;

export const SOLID_HISTORY_MAX = 200;

const COORD = SOLID_LIMITS.coord;
const held = (v: number): number => (v > COORD ? COORD : v < -COORD ? -COORD : v);
const callEach = (fn: () => void): void => { fn(); };
function markOf(d: { name: string; verts: readonly number[]; faces: readonly (readonly number[])[] }): CleanMark {
  return { name: d.name, verts: d.verts.slice(), faces: d.faces.map(f => f.slice()) };
}
function snapOf(d: SolidDesign, key: string): SolidSnap {
  return { key, name: d.name, solidId: d.solidId, verts: d.verts.slice(), faces: d.faces.map(f => f.slice()), pick: -1, clean: markOf(d), dirty: false };
}
function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class SolidEdit {
  key = '';
  name = '';
  solidId = '';
  verts: number[] = [];
  faces: number[][] = [];
  pick = -1;
  rev = 0;
  live = 0;
  private undos: SolidStep[] = [];
  private redos: SolidStep[] = [];
  private subs = new Set<() => void>();
  private clean: CleanMark = { name: '', verts: [], faces: [] };
  private sizeFrom: number[] | null = null;

  constructor(design: SolidDesign, key: string) { this.apply(snapOf(design, key)); }

  subscribe = (fn: () => void): (() => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  getRev = (): number => this.rev;
  getLive = (): number => this.live;
  private told(): void { this.rev++; this.live++; this.subs.forEach(callEach); }
  touchLive(): void { this.live++; this.subs.forEach(callEach); }

  get count(): number { return (this.verts.length / 3) | 0; }
  get canUndo(): boolean { return this.undos.length > 0; }
  get canRedo(): boolean { return this.redos.length > 0; }
  reach(): number { return solidReach(this.verts); }

  private differs(): boolean {
    const c = this.clean;
    if (nameToSave(this.name) !== nameToSave(c.name) || !sameNumbers(this.verts, c.verts) || this.faces.length !== c.faces.length) return true;
    for (let k = 0; k < this.faces.length; k++) if (!sameNumbers(this.faces[k], c.faces[k])) return true;
    return false;
  }
  get dirty(): boolean {
    if (this.differs()) return true;
    for (const s of this.undos) if (s.kind === 'load' && s.before.dirty) return true;
    return false;
  }

  private snap(): SolidSnap {
    return { key: this.key, name: this.name, solidId: this.solidId, verts: this.verts.slice(), faces: this.faces.map(f => f.slice()), pick: this.pick,
      clean: this.clean, dirty: this.differs() };
  }
  private apply(s: SolidSnap): void {
    this.key = s.key; this.name = s.name; this.solidId = s.solidId;
    this.verts = s.verts.slice(); this.faces = s.faces.map(f => f.slice()); this.pick = s.pick;
    this.clean = s.clean;
    this.sizeFrom = null;
  }
  private push(s: SolidStep): void {
    this.undos.push(s);
    if (this.undos.length > SOLID_HISTORY_MAX) {
      let i = 0;
      if (SMALL_FIX.G947 !== 0) while (i < this.undos.length - 1 && this.undos[i].kind === 'load' && (this.undos[i] as LoadStep).before.dirty) i++;
      this.undos.splice(i, 1);
    }
    this.redos.length = 0;
  }
  private orient(): void { orientInPlace(this.verts, this.faces); }
  private writeCorner(i: number, p: readonly number[]): void {
    const o = i * 3;
    this.verts[o] = p[0]; this.verts[o + 1] = p[1]; this.verts[o + 2] = p[2];
    this.orient();
  }
  private writeAll(p: readonly number[]): void {
    if (p.length !== this.verts.length) return;
    for (let i = 0; i < p.length; i++) this.verts[i] = p[i];
    this.orient();
  }

  cornerInto(i: number, out: Vec3): boolean {
    if (!(i >= 0 && i < this.count)) return false;
    const o = i * 3;
    out.x = this.verts[o]; out.y = this.verts[o + 1]; out.z = this.verts[o + 2];
    return true;
  }

  setCorner(i: number, x: number, y: number, z: number): void {
    if (!(i >= 0 && i < this.count) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const o = i * 3;
    this.verts[o] = held(x); this.verts[o + 1] = held(y); this.verts[o + 2] = held(z);
    this.orient();
  }

  commitMove(i: number, fx: number, fy: number, fz: number, by: string): boolean {
    if (!(i >= 0 && i < this.count)) return false;
    const o = i * 3, v = this.verts;
    const last = this.undos[this.undos.length - 1];
    if (by !== 'drag' && last !== undefined && last.kind === 'move' && last.open && last.corner === i && last.by === by) {
      last.to = [v[o], v[o + 1], v[o + 2]];
      if (last.to[0] === last.from[0] && last.to[1] === last.from[1] && last.to[2] === last.from[2]) this.undos.pop();
      this.redos.length = 0;
      this.told();
      return true;
    }
    if (v[o] === fx && v[o + 1] === fy && v[o + 2] === fz) return false;
    this.push({ kind: 'move', corner: i, from: [fx, fy, fz], to: [v[o], v[o + 1], v[o + 2]], by, open: by !== 'drag' });
    this.told();
    return true;
  }
  seal(): void {
    const last = this.undos[this.undos.length - 1];
    if (last !== undefined && last.kind !== 'load') last.open = false;
  }

  resize(target: number, by: string, live: boolean): boolean {
    if (!(target > 0) || !(target - target === 0)) return false;
    if (live) {
      if (this.sizeFrom === null || this.sizeFrom.length !== this.verts.length) this.sizeFrom = this.verts.slice();
      const from = this.sizeFrom;
      factorInto(from, target, _factor);
      const k = _factor.k;
      for (let i = 0; i < from.length; i++) this.verts[i] = held(from[i] * k);
      this.orient();
      return true;
    }
    const from = this.sizeFrom !== null && this.sizeFrom.length === this.verts.length ? this.sizeFrom : this.verts.slice();
    this.sizeFrom = null;
    factorInto(from, target, _factor);
    const k = _factor.k;
    for (let i = 0; i < from.length; i++) this.verts[i] = held(from[i] * k);
    this.orient();
    const last = this.undos[this.undos.length - 1];
    if (by !== 'drag' && last !== undefined && last.kind === 'shape' && last.open && last.by === by) {
      last.to = this.verts.slice();
      if (sameNumbers(last.to, last.from)) this.undos.pop();
      this.redos.length = 0;
      this.told();
      return true;
    }
    if (sameNumbers(this.verts, from)) { this.told(); return false; }
    this.push({ kind: 'shape', from, to: this.verts.slice(), by, open: by !== 'drag' });
    this.told();
    return true;
  }
  endResize(): void {
    const from = this.sizeFrom;
    if (from === null) return;
    this.sizeFrom = null;
    this.writeAll(from);
    this.touchLive();
  }

  load(src: SolidSource): boolean {
    if (this.key !== '' && src.key === this.key) return false;
    const before = this.snap();
    this.apply(snapOf(src.design, src.key));
    this.push({ kind: 'load', before, after: this.snap() });
    this.told();
    return true;
  }

  undo(): boolean {
    if (this.sizeFrom !== null) this.endResize();
    const s = this.undos.pop();
    if (s === undefined) return false;
    if (s.kind === 'move') { s.open = false; this.writeCorner(s.corner, s.from); this.pick = s.corner; }
    else if (s.kind === 'shape') { s.open = false; this.writeAll(s.from); }
    else this.apply(s.before);
    this.redos.push(s);
    this.told();
    return true;
  }
  redo(): boolean {
    if (this.sizeFrom !== null) this.endResize();
    const s = this.redos.pop();
    if (s === undefined) return false;
    if (s.kind === 'move') { this.writeCorner(s.corner, s.to); this.pick = s.corner; }
    else if (s.kind === 'shape') this.writeAll(s.to);
    else this.apply(s.after);
    this.undos.push(s);
    this.told();
    return true;
  }

  setPick(i: number): void {
    const p = i >= 0 && i < this.count ? i : -1;
    if (p === this.pick) return;
    this.pick = p;
    this.told();
  }
  setName(v: string): void {
    if (v === this.name) return;
    this.name = v;
    this.told();
  }

  planSave(library: readonly LibraryItem[] | null | undefined, now: number): SolidSavePlan {
    return planSave(this.verts, this.faces, this.name, library, now, this.key);
  }
  saved(item: LibraryItem): void {
    const d = item.fileData.data as SolidDesign;
    this.key = 'saved:' + item.id; this.name = d.name; this.solidId = d.solidId;
    if (d.verts.length === this.verts.length) for (let i = 0; i < d.verts.length; i++) this.verts[i] = d.verts[i];
    let sameShape = d.faces.length === this.faces.length;
    for (let k = 0; sameShape && k < d.faces.length; k++) if (d.faces[k].length !== this.faces[k].length) sameShape = false;
    if (sameShape) { for (let k = 0; k < d.faces.length; k++) for (let j = 0; j < d.faces[k].length; j++) this.faces[k][j] = d.faces[k][j]; }
    else this.faces = d.faces.map(f => f.slice());
    this.clean = markOf(this);
    this.told();
  }
}
