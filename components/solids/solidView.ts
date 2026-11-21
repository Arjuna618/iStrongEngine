import { SOLID_LIMITS } from '../../utils/solidDesign';
import { GLIDE_KEEP_PER_60 } from '../../utils/motionArras';

export interface Vec3 { x: number; y: number; z: number }

export interface SolidTurn { yaw: number; pitch: number; cy: number; sy: number; cp: number; sp: number }

export const SOLID_VIEW_PITCH_MAX = Math.PI / 2;
export const SOLID_VIEW_TURN_PER_PX = 0.01;
export const SOLID_VIEW_START_YAW = 0.6;
export const SOLID_VIEW_START_PITCH = 0.45;
export const SOLID_VIEW_PICK_PX = 9;
export const SOLID_VIEW_MIN_REACH = 1;

export function makeTurn(yaw: number = SOLID_VIEW_START_YAW, pitch: number = SOLID_VIEW_START_PITCH): SolidTurn {
  const t: SolidTurn = { yaw: 0, pitch: 0, cy: 1, sy: 0, cp: 1, sp: 0 };
  setTurn(t, yaw, pitch);
  return t;
}

export function setTurn(t: SolidTurn, yaw: number, pitch: number): void {
  if (Number.isFinite(yaw)) t.yaw = yaw;
  if (Number.isFinite(pitch)) t.pitch = pitch;
  settleTurn(t);
}

export function dragTurn(t: SolidTurn, dxPx: number, dyPx: number): void {
  const yaw = t.yaw + dxPx * SOLID_VIEW_TURN_PER_PX, pitch = t.pitch + dyPx * SOLID_VIEW_TURN_PER_PX;
  if (yaw - yaw === 0) t.yaw = yaw;
  if (pitch - pitch === 0) t.pitch = pitch;
  settleTurn(t);
}

function settleTurn(t: SolidTurn): void {
  let yaw = t.yaw, pitch = t.pitch;
  if (yaw > Math.PI || yaw < -Math.PI) yaw -= Math.round(yaw / (2 * Math.PI)) * 2 * Math.PI;
  pitch = pitch > SOLID_VIEW_PITCH_MAX ? SOLID_VIEW_PITCH_MAX : pitch < -SOLID_VIEW_PITCH_MAX ? -SOLID_VIEW_PITCH_MAX : pitch;
  t.yaw = yaw; t.pitch = pitch;
  t.cy = Math.cos(yaw); t.sy = Math.sin(yaw);
  t.cp = Math.cos(pitch); t.sp = Math.sin(pitch);
}

export function turnInto(t: SolidTurn, x: number, y: number, z: number, out: Vec3): Vec3 {
  const x1 = x * t.cy - z * t.sy;
  const z1 = x * t.sy + z * t.cy;
  out.x = x1;
  out.y = y * t.cp - z1 * t.sp;
  out.z = z1 * t.cp + y * t.sp;
  return out;
}

export function unturnInto(t: SolidTurn, x: number, y: number, z: number, out: Vec3): Vec3 {
  const y1 = y * t.cp + z * t.sp;
  const z1 = z * t.cp - y * t.sp;
  out.x = x * t.cy + z1 * t.sy;
  out.y = y1;
  out.z = z1 * t.cy - x * t.sy;
  return out;
}

export interface SolidFrame {
  n: number;
  nf: number;
  shownCount: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  readonly shown: Uint8Array;
  readonly front: Uint8Array;
}

export function makeSolidFrame(maxVerts: number = SOLID_LIMITS.verts, maxFaces: number = SOLID_LIMITS.faces): SolidFrame {
  return {
    n: 0, nf: 0, shownCount: 0,
    x: new Float64Array(maxVerts), y: new Float64Array(maxVerts), z: new Float64Array(maxVerts),
    shown: new Uint8Array(maxFaces), front: new Uint8Array(maxVerts),
  };
}

export function frameOf(t: SolidTurn, verts: ArrayLike<number>, faces: readonly (readonly number[])[], f: SolidFrame): number {
  const cap = f.x.length;
  const nv = (verts.length / 3) | 0;
  const n = nv < cap ? nv : cap;
  const cy = t.cy, sy = t.sy, cp = t.cp, sp = t.sp;
  const X = f.x, Y = f.y, Z = f.z, front = f.front;
  for (let i = 0; i < n; i++) {
    const x = verts[i * 3], y = verts[i * 3 + 1], z = verts[i * 3 + 2];
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    X[i] = x1;
    Y[i] = y * cp - z1 * sp;
    Z[i] = z1 * cp + y * sp;
    front[i] = 0;
  }
  const fcap = f.shown.length;
  const nf = faces.length < fcap ? faces.length : fcap;
  let shown = 0;
  for (let k = 0; k < nf; k++) {
    const face = faces[k];
    const K = face.length;
    let ok = K >= 3;
    for (let j = 0; j < K && ok; j++) { const p = face[j]; if (!(p >= 0 && p < n)) ok = false; }
    if (!ok) { f.shown[k] = 0; continue; }
    const i0 = face[0], iN = face[K - 1];
    let area = Y[i0] * X[iN] - X[i0] * Y[iN];
    for (let j = 0; j + 1 < K; j++) {
      const p = face[j], q = face[j + 1];
      area += X[p] * Y[q] - Y[p] * X[q];
    }
    if (area > 0) {
      f.shown[k] = 1;
      shown++;
      for (let j = 0; j < K; j++) front[face[j]] = 1;
    } else f.shown[k] = 0;
  }
  f.n = n; f.nf = nf; f.shownCount = shown;
  return shown;
}

export function cornerAt(f: SolidFrame, px: number, py: number, cx: number, cy: number, r: number, reachPx: number = SOLID_VIEW_PICK_PX): number {
  const lim = reachPx * reachPx;
  let best = -1, bestFront = -1, bestD = 0, bestZ = 0;
  for (let i = 0; i < f.n; i++) {
    const dx = cx + f.x[i] * r - px, dy = cy + f.y[i] * r - py;
    const d = dx * dx + dy * dy;
    if (d > lim) continue;
    const fr = f.front[i];
    if (best < 0 || fr > bestFront || (fr === bestFront && (d < bestD - 1e-9 || (d <= bestD + 1e-9 && f.z[i] < bestZ)))) {
      best = i; bestFront = fr; bestD = d; bestZ = f.z[i];
    }
  }
  return best;
}

const _q: Vec3 = { x: 0, y: 0, z: 0 };
export function moveInView(t: SolidTurn, x: number, y: number, z: number, dxPx: number, dyPx: number, r: number, out: Vec3): Vec3 {
  turnInto(t, x, y, z, _q);
  return unturnInto(t, _q.x + dxPx / r, _q.y + dyPx / r, _q.z, out);
}

export function solidReach(verts: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i + 2 < verts.length; i += 3) {
    const d = verts[i] * verts[i] + verts[i + 1] * verts[i + 1] + verts[i + 2] * verts[i + 2];
    if (d > m) m = d;
  }
  return Math.sqrt(m);
}

export function viewRadius(w: number, h: number, reach: number, padPx: number): number {
  const half = (w < h ? w : h) / 2 - padPx;
  const rch = reach > SOLID_VIEW_MIN_REACH ? reach : SOLID_VIEW_MIN_REACH;
  return half > 1 ? half / rch : 1 / rch;
}

export interface SolidCam {
  zoom: number;
  zoomTo: number;
  offX: number;
  offY: number;
  ax: number;
  ay: number;
  fitting: number;
}
export const SOLID_VIEW_ZOOM_MIN = 0.25;
export const SOLID_VIEW_ZOOM_MAX = 8;
export const SOLID_VIEW_WHEEL_STEP = 1.12;
export const SOLID_VIEW_WHEEL_NOTCH_PX = 100;
export const SOLID_VIEW_WHEEL_MAX_NOTCHES = 3;
export const SOLID_VIEW_GLIDE_DONE = 1e-3;
export const SOLID_VIEW_GLIDE_DONE_PX = 0.5;

export function makeCam(): SolidCam {
  return { zoom: 1, zoomTo: 1, offX: 0, offY: 0, ax: 0, ay: 0, fitting: 0 };
}

export function camReset(c: SolidCam): void {
  c.zoom = 1; c.zoomTo = 1; c.offX = 0; c.offY = 0; c.ax = 0; c.ay = 0; c.fitting = 0;
}

export function camWheel(c: SolidCam, ax: number, ay: number, deltaPx: number): void {
  if (!(deltaPx - deltaPx === 0) || !(ax - ax === 0) || !(ay - ay === 0)) return;
  let notches = -deltaPx / SOLID_VIEW_WHEEL_NOTCH_PX;
  if (notches > SOLID_VIEW_WHEEL_MAX_NOTCHES) notches = SOLID_VIEW_WHEEL_MAX_NOTCHES;
  else if (notches < -SOLID_VIEW_WHEEL_MAX_NOTCHES) notches = -SOLID_VIEW_WHEEL_MAX_NOTCHES;
  const from = c.fitting === 1 ? c.zoom : c.zoomTo;
  let z = from * Math.pow(SOLID_VIEW_WHEEL_STEP, notches);
  z = z > SOLID_VIEW_ZOOM_MAX ? SOLID_VIEW_ZOOM_MAX : z < SOLID_VIEW_ZOOM_MIN ? SOLID_VIEW_ZOOM_MIN : z;
  c.fitting = 0;
  c.zoomTo = z;
  c.ax = ax; c.ay = ay;
}

export function camFit(c: SolidCam): void {
  c.zoomTo = 1;
  c.fitting = 1;
}

export function camHold(c: SolidCam): void {
  c.zoomTo = c.zoom;
  c.fitting = 0;
}

export function camMoving(c: SolidCam): boolean {
  return c.zoom !== c.zoomTo || (c.fitting === 1 && (c.offX !== 0 || c.offY !== 0));
}

export function camStep(c: SolidCam, dtSec: number): boolean {
  if (!camMoving(c)) { c.fitting = 0; return false; }
  const dt = dtSec > 0.1 ? 0.1 : dtSec > 0 ? dtSec : 0;
  const k = 1 - Math.pow(GLIDE_KEEP_PER_60, 60 * dt);
  const z0 = c.zoom, zt = c.zoomTo;
  let z1 = 1 / (1 / z0 + (1 / zt - 1 / z0) * k);
  const zDone = Math.abs(z1 - zt) <= SOLID_VIEW_GLIDE_DONE * zt;
  if (zDone) z1 = zt;
  if (c.fitting === 1) {
    let ox = c.offX * (1 - k), oy = c.offY * (1 - k);
    if (zDone && Math.abs(ox) < SOLID_VIEW_GLIDE_DONE_PX && Math.abs(oy) < SOLID_VIEW_GLIDE_DONE_PX) { ox = 0; oy = 0; c.fitting = 0; }
    c.offX = ox; c.offY = oy;
  } else {
    const q = z1 / z0;
    c.offX = c.ax - (c.ax - c.offX) * q;
    c.offY = c.ay - (c.ay - c.offY) * q;
  }
  c.zoom = z1;
  return true;
}
