import type { OtherDesign, OtherPart, HalloweenLookConfig } from '../types';
import { otherDrawList, otherReach, type OtherDrawList } from './otherDraw';
import { drawnOpacity, SEEN } from './seenRule';

try { for (const k of ['istrong_halloween_mode', 'istrong_halloween_eyes', 'istrong_halloween_pumpkins']) localStorage.removeItem(k); } catch { }

export const HALLOWEEN_FULL: Readonly<HalloweenLookConfig> = Object.freeze({ eyes: true, pumpkins: true });
export const HALLOWEEN_PUMPKINS: Readonly<HalloweenLookConfig> = Object.freeze({ eyes: false, pumpkins: true });
export const HALLOWEEN_EYES: Readonly<HalloweenLookConfig> = Object.freeze({ eyes: true, pumpkins: false });
export function halloweenPartsOf(cfg: { halloween?: HalloweenLookConfig } | null | undefined): number {
  const h = cfg ? cfg.halloween : undefined;
  return h ? (h.eyes ? 1 : 0) | (h.pumpkins ? 2 : 0) : 0;
}
export function pumpkinRocksOf(cfg: { halloween?: HalloweenLookConfig } | null | undefined): boolean { return (halloweenPartsOf(cfg) & 2) !== 0; }
export function cleanHalloweenLook(v: unknown): HalloweenLookConfig | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return { eyes: o.eyes === true, pumpkins: o.pumpkins === true };
}
export function rockWearsPumpkin(shape: number): boolean { return shape === -9 || shape === 9; }
export function halloweenLocked(inMatch: boolean, rocks: readonly { active: boolean; shape: number }[] | null | undefined): boolean {
  if (!inMatch || !rocks) return false;
  for (let i = 0; i < rocks.length; i++) if (rocks[i].active && !rockWearsPumpkin(rocks[i].shape)) return true;
  return false;
}

export const EYE_ALPHA = 0.3;
let _eyeAlpha = EYE_ALPHA;
try {
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('eyealpha') : null;
  const v = q === null ? NaN : parseFloat(q);
  if (v > 0 && v <= 1) _eyeAlpha = v;
} catch { }
export function eyeAlpha(): number { return _eyeAlpha; }

export const EYE_ID = 'other:eye';
export const PUMPKIN_ID = 'other:pumpkin';
export const EYE_SIZE_Q: readonly number[] = Object.freeze([15.06, 15.81, 17.63, 19.44, 24.56, 26.38, 29.31]);
const EYE_SIZE_AT: readonly number[] = Object.freeze([0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]);
export const EYE_MARGIN = 8;
export const EYE_WALL_INSET = 1.5;
export const EYE_LINE = 3;
export const EYE_MIN_SHARE = 0.5;
export const EYE_RANGE = 1500;
export const EYE_TURN_RATE = 6;
const EYE_RANGE_SQ = EYE_RANGE * EYE_RANGE;
const TAU = Math.PI * 2;

function _mix(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
export function placeNumber(a: number, b: number, c: number, d: number, salt: number, k: number): number {
  let h = _mix((Math.round(a * 8) | 0) ^ 0x9e3779b9);
  h = _mix(h ^ (Math.round(b * 8) | 0));
  h = _mix(h ^ (Math.round(c * 8) | 0));
  h = _mix(h ^ (Math.round(d * 8) | 0));
  h = _mix(h ^ (salt | 0));
  h = _mix(h ^ k);
  return h / 4294967296;
}
export function eyeSizeAt(u: number): number {
  for (let i = 1; i < EYE_SIZE_AT.length; i++) {
    if (u <= EYE_SIZE_AT[i]) {
      const k = (u - EYE_SIZE_AT[i - 1]) / (EYE_SIZE_AT[i] - EYE_SIZE_AT[i - 1]);
      return EYE_SIZE_Q[i - 1] + (EYE_SIZE_Q[i] - EYE_SIZE_Q[i - 1]) * k;
    }
  }
  return EYE_SIZE_Q[EYE_SIZE_Q.length - 1];
}
export function pumpkinTurn(x: number, y: number, rotation: number): number {
  return rotation !== 0 ? rotation : placeNumber(x, y, 0, 0, 0, 7) * TAU;
}
export function rockTurn(r: { x: number; y: number; rotation: number; lookDx?: number; lookDy?: number }): number {
  return pumpkinTurn(r.x + (r.lookDx || 0), r.y + (r.lookDy || 0), r.rotation);
}

export const HW_KINDS: readonly OtherPart['kind'][] = Object.freeze(['polygon', 'outline', 'line', 'circle', 'star'] as OtherPart['kind'][]);
export const HW_BATCH: Readonly<Record<OtherPart['kind'], string>> = Object.freeze({
  polygon: 'hw_polygon', outline: 'hw_outline', line: 'hw_line', circle: 'hw_circle', star: 'hw_star',
});
export const HW_VEIL = 'hw_veil';
export interface HalloweenMeshes {
  polygonSides: number; starSides: number; starInner: number; outline: readonly (readonly [number, number])[] | null;
  flatKind: OtherPart['kind'] | ''; flatSides: number; flatInner: number; flatOutline: readonly (readonly [number, number])[] | null;
}
export interface HalloweenLook {
  eye: OtherDesign | null;
  pumpkin: OtherDesign | null;
  eyeList: OtherDrawList | null;
  pumpkinList: OtherDrawList | null;
  eyeKeys: string[];
  pumpkinKeys: string[];
  meshes: HalloweenMeshes;
  eyeWorld: number;
  eyeOutline: Float64Array | null;
  eyeRound: number;
  eyeReach: number;
  pumpkinReach: number;
}

export function cleanOutline(pts: readonly (readonly [number, number])[]): [number, number][] {
  const same = (a: readonly [number, number], b: readonly [number, number]): boolean => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) { if (out.length > 0 && same(pts[i], out[out.length - 1])) continue; out.push([pts[i][0], pts[i][1]]); }
  if (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
  return out;
}
export function outlineFansFromMiddle(pts: readonly (readonly [number, number])[]): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const cross = a[0] * b[1] - a[1] * b[0];
    if (!(Math.abs(cross) > 1e-12)) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return pts.length >= 3;
}

export function makeHalloweenLook(eye: OtherDesign | null, pumpkin: OtherDesign | null): HalloweenLook | null {
  if (eye === null && pumpkin === null) return null;
  const meshes: HalloweenMeshes = { polygonSides: 0, starSides: 0, starInner: 0, outline: null, flatKind: '', flatSides: 0, flatInner: 0, flatOutline: null };
  let outlineOf: readonly (readonly [number, number])[] | null = null;
  const keysOf = (list: OtherDrawList): string[] | null => {
    const keys: string[] = []; let at = 0;
    for (let i = 0; i < list.items.length; i++) {
      const p = list.items[i].part; const k = HW_KINDS.indexOf(p.kind);
      if (k < at) return null;
      at = k;
      if (p.kind === 'polygon') { if (meshes.polygonSides !== 0 && meshes.polygonSides !== p.sides) return null; meshes.polygonSides = p.sides as number; }
      else if (p.kind === 'star') { if (meshes.starSides !== 0 && (meshes.starSides !== p.sides || meshes.starInner !== p.inner)) return null; meshes.starSides = p.sides as number; meshes.starInner = p.inner as number; }
      else if (p.kind === 'outline') {
        if (!p.points || (outlineOf !== null && outlineOf !== p.points)) return null;
        if (outlineOf === null) { const clean = cleanOutline(p.points); if (!outlineFansFromMiddle(clean)) return null; meshes.outline = clean; outlineOf = p.points; }
      }
      keys.push(HW_BATCH[p.kind]);
    }
    return keys;
  };
  const pumpkinList = pumpkin !== null ? otherDrawList(pumpkin) : null;
  const eyeList = eye !== null ? otherDrawList(eye, eye.body.parts && eye.body.parts.length > 0 ? eye.body.parts[0] : null) : null;
  const pumpkinKeys = pumpkinList !== null ? keysOf(pumpkinList) : [];
  const eyeKeys = eyeList !== null ? keysOf(eyeList) : [];
  if (pumpkinKeys === null || eyeKeys === null) return null;
  if (eyeList !== null) {
    const body = eyeList.items[0].part;
    if (eyeList.items[0].aimed || body.kind === 'line') return null;
    meshes.flatKind = body.kind;
    let inside = body.radius;
    if (body.kind === 'outline') {
      const clean = meshes.outline !== null ? meshes.outline : []; if (!outlineFansFromMiddle(clean)) return null;
      meshes.flatOutline = clean; inside = Infinity;
      for (let i = 0; i < clean.length; i++) { const a = clean[i], b = clean[(i + 1) % clean.length]; const ex = b[0] - a[0], ey = b[1] - a[1]; const d = Math.abs(a[0] * ey - a[1] * ex) / Math.hypot(ex, ey); if (d < inside) inside = d; }
      inside *= body.radius;
    } else if (body.kind === 'polygon') { meshes.flatSides = body.sides as number; inside = body.radius * Math.cos(Math.PI / (body.sides as number)); }
    else if (body.kind === 'star') { meshes.flatSides = body.sides as number; meshes.flatInner = body.inner as number; inside = body.radius * (body.inner as number) * Math.cos(Math.PI / (body.sides as number)); }
    for (let i = 1; i < eyeList.items.length; i++) {
      const it = eyeList.items[i];
      if (it.part.kind !== 'circle') return null;
      if (Math.hypot(it.ax, it.ay) + Math.hypot(it.lx, it.ly) + it.part.radius > inside + 1e-9) return null;
    }
  }
  let eyeOutline: Float64Array | null = null, eyeRound = 0;
  if (eye !== null) {
    const b = eye.body;
    if (b.kind === 'outline' && b.points) {
      eyeOutline = new Float64Array(b.points.length * 2);
      for (let i = 0; i < b.points.length; i++) { eyeOutline[i * 2] = b.points[i][0] * b.radius; eyeOutline[i * 2 + 1] = b.points[i][1] * b.radius; }
    } else eyeRound = b.radius;
  }
  return { eye, pumpkin, eyeList, pumpkinList, eyeKeys, pumpkinKeys, meshes, eyeWorld: eye !== null ? eye.size / 2 : 0, eyeOutline, eyeRound,
    eyeReach: eye !== null ? otherReach(eye.body) : 0, pumpkinReach: pumpkin !== null ? otherReach(pumpkin.body) : 0 };
}

export function findOtherDesign(library: readonly { fileData: { type: string; data: unknown } }[], id: string): OtherDesign | null {
  for (let i = 0; i < library.length; i++) {
    const d = library[i].fileData.data as OtherDesign | null;
    if (d && d.otherId === id && library[i].fileData.type === 'Other') return d;
  }
  return null;
}

export const EYE_STRIDE = 13;
const E_WX = 0, E_WY = 1, E_HW = 2, E_HH = 3, E_SALT = 4;
export const E_X = 5, E_Y = 6, E_UNIT = 7, E_TURN = 8, E_AIM = 9, E_STAMP = 10;
const E_DX = 11, E_DY = 12;
export interface EyeWall { x: number; y: number; halfW: number; halfH: number; type: number; active: boolean; noEye?: boolean; lookDx?: number; lookDy?: number; }
export interface EyeTable {
  t: Float64Array;
  n: number;
  look: HalloweenLook | null;
  frame: number;
  maxStep: number;
  mode: number;
  lastMs: number;
  drawn: Int32Array;
  drawnN: number;
}
export function makeEyeTable(): EyeTable { return { t: new Float64Array(0), n: 0, look: null, frame: 0, maxStep: -1, mode: 0, lastMs: -1, drawn: new Int32Array(256), drawnN: 0 }; }

const _ext = new Float64Array(2);
function _eyeExtents(look: HalloweenLook, turn: number): void {
  const o = look.eyeOutline;
  if (o === null) { _ext[0] = look.eyeRound; _ext[1] = look.eyeRound; return; }
  const c = Math.cos(turn), s = Math.sin(turn); let ex = 0, ey = 0;
  for (let i = 0; i < o.length; i += 2) {
    const x = Math.abs(o[i] * c - o[i + 1] * s), y = Math.abs(o[i] * s + o[i + 1] * c);
    if (x > ex) ex = x; if (y > ey) ey = y;
  }
  _ext[0] = ex; _ext[1] = ey;
}

export function placeEye(t: Float64Array, o: number, wx: number, wy: number, hw: number, hh: number, salt: number, look: HalloweenLook, dx: number = 0, dy: number = 0): void {
  t[o + E_WX] = wx; t[o + E_WY] = wy; t[o + E_HW] = hw; t[o + E_HH] = hh; t[o + E_SALT] = salt; t[o + E_DX] = dx; t[o + E_DY] = dy;
  const ax = wx + dx, ay = wy + dy;
  const turn = placeNumber(ax, ay, hw, hh, salt, 2) * TAU;
  let unit = eyeSizeAt(placeNumber(ax, ay, hw, hh, salt, 1)) * look.eyeWorld;
  _eyeExtents(look, turn);
  const roomX = hw - EYE_WALL_INSET - EYE_MARGIN - EYE_LINE, roomY = hh - EYE_WALL_INSET - EYE_MARGIN - EYE_LINE;
  if (roomX > 0 && roomY > 0 && unit > 0 && _ext[0] > 0 && _ext[1] > 0) {
    const fit = Math.min(roomX / _ext[0], roomY / _ext[1]);
    if (unit > fit) unit = fit;
    if (unit < EYE_SIZE_Q[0] * look.eyeWorld * EYE_MIN_SHARE) unit = 0;
  } else unit = 0;
  t[o + E_UNIT] = unit;
  t[o + E_TURN] = turn;
  t[o + E_AIM] = turn + (look.eyeList !== null ? look.eyeList.rest : 0);
  t[o + E_STAMP] = -2;
  if (unit === 0) { t[o + E_X] = wx; t[o + E_Y] = wy; return; }
  const freeX = Math.max(0, roomX - _ext[0] * unit), freeY = Math.max(0, roomY - _ext[1] * unit);
  t[o + E_X] = wx + (placeNumber(ax, ay, hw, hh, salt, 3) * 2 - 1) * freeX;
  t[o + E_Y] = wy + (placeNumber(ax, ay, hw, hh, salt, 4) * 2 - 1) * freeY;
}

export function syncEyes(eyes: EyeTable, walls: readonly EyeWall[], salt: number, look: HalloweenLook, follow: boolean = false): void {
  salt = salt | 0;
  const n = walls.length;
  if (eyes.t.length < n * EYE_STRIDE) {
    const t = new Float64Array((n + 64) * EYE_STRIDE);
    t.set(eyes.t);
    for (let o = eyes.t.length; o < t.length; o += EYE_STRIDE) t[o + E_HW] = -1;
    eyes.t = t;
  }
  const t = eyes.t;
  if (eyes.look !== look) { eyes.look = look; for (let o = 0; o < t.length; o += EYE_STRIDE) t[o + E_HW] = -1; }
  for (let i = 0, o = 0; i < n; i++, o += EYE_STRIDE) {
    const w = walls[i];
    if (follow && t[o + E_SALT] === salt && _followWall(t, o, w)) continue;
    const dx = w.lookDx || 0, dy = w.lookDy || 0;
    if (t[o + E_HW] !== w.halfW || t[o + E_WX] !== w.x || t[o + E_WY] !== w.y || t[o + E_HH] !== w.halfH || t[o + E_SALT] !== salt
      || t[o + E_DX] !== dx || t[o + E_DY] !== dy) placeEye(t, o, w.x, w.y, w.halfW, w.halfH, salt, look, dx, dy);
  }
  eyes.n = n;
}

function _followWall(t: Float64Array, o: number, w: EyeWall): boolean {
  if (t[o + E_HW] !== w.halfW || t[o + E_HH] !== w.halfH) return false;
  const dx = w.x - t[o + E_WX], dy = w.y - t[o + E_WY];
  if (dx !== 0 || dy !== 0) { t[o + E_WX] = w.x; t[o + E_WY] = w.y; t[o + E_X] += dx; t[o + E_Y] += dy; }
  return true;
}

export interface EyeWorld {
  state: { isTestMode: boolean; paused: boolean; enemyTanks: readonly { active: boolean; isDying: boolean; position: { x: number; y: number }; invisEnabled?: boolean; invisAlpha: number; viewAlpha?: number }[] };
  tankPos: { x: number; y: number };
  tankDying: boolean;
}
export interface EyeTargets { x: Float64Array; y: Float64Array; n: number; }
export function makeEyeTargets(): EyeTargets { return { x: new Float64Array(64), y: new Float64Array(64), n: 0 }; }
export function collectEyeTargets(world: EyeWorld, out: EyeTargets): void {
  const enemies = world.state.enemyTanks;
  if (out.x.length < enemies.length + 1) { out.x = new Float64Array(enemies.length + 65); out.y = new Float64Array(enemies.length + 65); }
  let n = 0;
  if (!world.tankDying) { out.x[n] = world.tankPos.x; out.y[n] = world.tankPos.y; n++; }
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.active || e.isDying || !(drawnOpacity(e) > SEEN.ACQUIRE)) continue;
    out.x[n] = e.position.x; out.y[n] = e.position.y; n++;
  }
  out.n = n;
}

export const EYE_REST = 0, EYE_HOLD = 1, EYE_LIVE = 2;
export function beginEyeFrame(eyes: EyeTable, world: EyeWorld, gameMs: number, targets: EyeTargets): void {
  if (!world.state.isTestMode) {
    if (eyes.mode !== EYE_REST) eyes.frame += 2;
    eyes.mode = EYE_REST; eyes.maxStep = -1; eyes.lastMs = -1; targets.n = 0; return;
  }
  if (world.state.paused) { eyes.mode = EYE_HOLD; eyes.maxStep = -1; eyes.lastMs = -1; return; }
  let dt = eyes.lastMs < 0 ? 0 : (gameMs - eyes.lastMs) / 1000;
  if (!(dt > 0)) dt = 0; else if (dt > 0.1) dt = 0.1;
  eyes.lastMs = gameMs;
  eyes.mode = EYE_LIVE;
  eyes.maxStep = EYE_TURN_RATE * dt;
  eyes.frame++;
  collectEyeTargets(world, targets);
}

export function aimEye(eyes: EyeTable, o: number, targets: EyeTargets): void {
  const t = eyes.t; const ex = t[o + E_X], ey = t[o + E_Y];
  const fresh = t[o + E_STAMP] === eyes.frame - 1;
  t[o + E_STAMP] = eyes.frame;
  let best = EYE_RANGE_SQ, bx = 0, by = 0, found = false;
  const tx = targets.x, ty = targets.y;
  for (let i = 0; i < targets.n; i++) {
    const dx = tx[i] - ex, dy = ty[i] - ey; const d = dx * dx + dy * dy;
    if (d < best) { best = d; bx = dx; by = dy; found = true; }
  }
  if (!found || best === 0) return;
  const want = Math.atan2(by, bx);
  if (!fresh) { t[o + E_AIM] = want; return; }
  let diff = want - t[o + E_AIM];
  diff -= TAU * Math.round(diff / TAU);
  const step = eyes.maxStep;
  t[o + E_AIM] = want - diff + (diff > step ? step : diff < -step ? -step : diff);
}

export function eyeRowToDraw(eyes: EyeTable, i: number, w: EyeWall, plainType: number, vl: number, vr: number, vt: number, vb: number, targets: EyeTargets): number {
  if (!w.active || w.type !== plainType || i >= eyes.n || w.noEye === true) return -1;
  const o = i * EYE_STRIDE; const t = eyes.t;
  if (t[o + E_WX] !== w.x || t[o + E_WY] !== w.y) _followWall(t, o, w);
  const unit = t[o + E_UNIT];
  if (unit === 0) return -1;
  const reach = unit * 1.5 + EYE_LINE;
  const x = t[o + E_X], y = t[o + E_Y];
  if (x + reach < vl || x - reach > vr || y + reach < vt || y - reach > vb) return -1;
  if (eyes.mode === EYE_LIVE) aimEye(eyes, o, targets);
  return o;
}
export function eyeAimOf(eyes: EyeTable, o: number): number {
  return eyes.mode === EYE_REST ? eyes.t[o + E_TURN] + (eyes.look !== null && eyes.look.eyeList !== null ? eyes.look.eyeList.rest : 0) : eyes.t[o + E_AIM];
}

export interface GeomPusher {
  pushGeomInstance(key: string, x: number, y: number, rot: number, sx: number, sy: number, r: number, g: number, b: number, dmg: number, depth: number, aspect: number, alpha: number): void;
}
export function pushOtherList(gl: GeomPusher, list: OtherDrawList, keys: readonly string[], rgb: Float32Array, cx: number, cy: number, unit: number, facing: number, aim: number, alpha: number): void {
  const items = list.items;
  const cF = Math.cos(facing), sF = Math.sin(facing), cA = Math.cos(aim), sA = Math.sin(aim);
  for (let i = 0, c = 0; i < items.length; i++, c += 3) {
    const it = items[i]; const p = it.part;
    const cb = it.aimed ? cA : cF, sb = it.aimed ? sA : sF;
    const x = cx + ((it.ax * cF - it.ay * sF) + (it.lx * cb - it.ly * sb)) * unit;
    const y = cy + ((it.ax * sF + it.ay * cF) + (it.lx * sb + it.ly * cb)) * unit;
    const R = p.radius * unit;
    if (p.kind === 'circle') gl.pushGeomInstance(keys[i], x, y, 0, R, R, rgb[c], rgb[c + 1], rgb[c + 2], 0, 0.0, 1.0, alpha);
    else gl.pushGeomInstance(keys[i], x, y, (it.aimed ? aim : facing) + it.rot, R, p.kind === 'line' ? 1 : R, rgb[c], rgb[c + 1], rgb[c + 2], 0, 0.0, 1.0, alpha);
  }
}
export function overGround(part: number, ground: number, a: number): number { return part * a + ground * (1 - a); }
export function eyeFlatColours(out: Float32Array, fills: ArrayLike<number>, lines: ArrayLike<number>, wall: ArrayLike<number>, alpha: number): void {
  for (let i = 0, o = 0; i < fills.length; i += 3, o += 6) {
    for (let c = 0; c < 3; c++) {
      out[o + c] = overGround(lines[i + c], wall[c], alpha) / 255;
      out[o + 3 + c] = overGround(fills[i + c], wall[c], alpha) / 255;
    }
  }
}
export interface EyeHide { kind: string; x: number; y: number; halfW: number; halfH: number }
export function pushEyes(gl: GeomPusher, eyes: EyeTable, walls: readonly EyeWall[], plainType: number, rgb: Float32Array, vl: number, vr: number, vt: number, vb: number, targets: EyeTargets, minUnit: number = 0, hide: EyeHide | null = null): number {
  eyes.drawnN = 0;
  const look = eyes.look; if (look === null || look.eyeList === null) return 0;
  const list = look.eyeList, keys = look.eyeKeys, t = eyes.t; let n = 0;
  for (let i = 0; i < walls.length; i++) {
    if (hide !== null) { const w = walls[i]; if (Math.abs(w.x - hide.x) < hide.halfW && Math.abs(w.y - hide.y) < hide.halfH) continue; }
    const o = eyeRowToDraw(eyes, i, walls[i], plainType, vl, vr, vt, vb, targets);
    if (o < 0 || t[o + E_UNIT] < minUnit) continue;
    pushOtherList(gl, list, keys, rgb, t[o + E_X], t[o + E_Y], t[o + E_UNIT], t[o + E_TURN], eyeAimOf(eyes, o), 1.0);
    if (n >= eyes.drawn.length) { const d = new Int32Array(eyes.drawn.length * 2); d.set(eyes.drawn); eyes.drawn = d; }
    eyes.drawn[n++] = o;
  }
  eyes.drawnN = n;
  return n;
}
const _veilRgb = new Float64Array(3);
export function pushEyeVeils(gl: GeomPusher, eyes: EyeTable, wr: number, wg: number, wb: number, alpha: number,
    rowRgb: ((row: number, out: Float64Array) => void) | null = null): number {
  const look = eyes.look; if (look === null || look.eyeList === null || !(alpha < 1)) return 0;
  const body = look.eyeList.items[0]; const t = eyes.t; const veil = 1 - alpha;
  for (let k = 0; k < eyes.drawnN; k++) {
    const o = eyes.drawn[k]; const R = body.part.radius * t[o + E_UNIT];
    let r = wr, g = wg, b = wb;
    if (rowRgb !== null) { rowRgb((o / EYE_STRIDE) | 0, _veilRgb); r = _veilRgb[0]; g = _veilRgb[1]; b = _veilRgb[2]; }
    gl.pushGeomInstance(HW_VEIL, t[o + E_X], t[o + E_Y], t[o + E_TURN] + body.rot, R, R, r, g, b, 0, 0.0, 1.0, veil);
  }
  return eyes.drawnN;
}
