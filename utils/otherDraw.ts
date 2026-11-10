import type { OtherDesign, OtherPart } from '../types';
import { nameSlug, nameSlugLegacy } from './nameSlug';

export const OTHER_KINDS: readonly string[] = Object.freeze(['circle', 'polygon', 'star', 'line', 'outline']);
export const OTHER_MAX_DEPTH = 6;
export const OTHER_MAX_PARTS = 512;
export const OTHER_MAX_POINTS = 2048;
export const OTHER_MAX_REACH = 100;
const OTHER_ID_RE = /^other:[\p{L}\p{N}-]{1,48}$/u;
const HEX_RE = /^#[0-9a-f]{6}$/;

export function makeOtherId(name: string): string {
  return 'other:' + (nameSlug(name, 48) || 'other');
}
export function makeOtherIdLegacy(name: string): string {
  return 'other:' + (nameSlugLegacy(name, 48) || 'other');
}

const _num = (v: unknown, lo: number, hi: number): boolean => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
let _refusalParts = 0;
function _partRefusal(p: any, depth: number, where: string): string | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return `${where} is no part.`;
  if (depth > OTHER_MAX_DEPTH) return `${where} is nested deeper than ${OTHER_MAX_DEPTH} parts.`;
  if (++_refusalParts > OTHER_MAX_PARTS) return `It has more than ${OTHER_MAX_PARTS} parts.`;
  if (OTHER_KINDS.indexOf(p.kind) < 0) return `${where} has a shape the engine does not have: ${String(p.kind)}.`;
  if (!_num(p.radius, 1e-6, OTHER_MAX_REACH)) return `${where} has a radius the engine cannot use: ${String(p.radius)}.`;
  if (!_num(p.x, -OTHER_MAX_REACH, OTHER_MAX_REACH) || !_num(p.y, -OTHER_MAX_REACH, OTHER_MAX_REACH)) return `${where} has a place the engine cannot use.`;
  if (!_num(p.angle, -1000, 1000) || !_num(p.turn, -1000, 1000)) return `${where} has an angle that is no number.`;
  if (typeof p.above !== 'boolean') return `${where} does not say whether it is drawn above or below.`;
  if (typeof p.color !== 'string' || !HEX_RE.test(p.color.toLowerCase())) return `${where} has a color that is not a six digit hex code: ${String(p.color)}.`;
  if (!Number.isInteger(p.colorMap) || p.colorMap < -1 || p.colorMap > 19) return `${where} has a color name the engine does not have: ${String(p.colorMap)}.`;
  if (p.kind === 'polygon' || p.kind === 'star') { if (!Number.isInteger(p.sides) || p.sides < 3 || p.sides > 64) return `${where} has a number of sides outside 3 to 64: ${String(p.sides)}.`; }
  if (p.kind === 'star' && !_num(p.inner, 0.01, 0.99)) return `${where} is a star whose inner corners the engine cannot use: ${String(p.inner)}.`;
  if (p.kind === 'outline') {
    if (!Array.isArray(p.points) || p.points.length < 3 || p.points.length > OTHER_MAX_POINTS) return `${where} is a drawn shape with a number of points outside 3 to ${OTHER_MAX_POINTS}.`;
    for (let i = 0; i < p.points.length; i++) { const q = p.points[i]; if (!Array.isArray(q) || q.length !== 2 || !_num(q[0], -OTHER_MAX_REACH, OTHER_MAX_REACH) || !_num(q[1], -OTHER_MAX_REACH, OTHER_MAX_REACH)) return `${where} is a drawn shape with a point that is no pair of numbers.`; }
  }
  if (p.parts !== undefined) {
    if (!Array.isArray(p.parts)) return `${where} has parts that are no list.`;
    for (let i = 0; i < p.parts.length; i++) { const r = _partRefusal(p.parts[i], depth + 1, `Part ${i + 1} of ${where.charAt(0).toLowerCase() + where.slice(1)}`); if (r !== null) return r; }
  }
  return null;
}
export function otherRefusal(data: any): string | null {
  if (!data || typeof data !== 'object') return 'This file has no data.';
  if (typeof data.name !== 'string' || data.name.length === 0) return 'This Others file has no name.';
  if (typeof data.otherId !== 'string' || !OTHER_ID_RE.test(data.otherId)) return `This Others file has an id the engine cannot use: ${String(data.otherId)}.`;
  if (data.otherId !== makeOtherId(data.name) && data.otherId !== makeOtherIdLegacy(data.name)) return `This Others file has an id that does not match its name. For the name "${data.name}" the id should be ${makeOtherId(data.name)}.`;
  if (!_num(data.size, 0.01, 100000)) return `This Others file has a size the engine cannot use: ${String(data.size)}.`;
  _refusalParts = 0;
  return _partRefusal(data.body, 0, 'The body');
}
export function otherBodyRefusal(body: unknown): string | null {
  _refusalParts = 0;
  return _partRefusal(body, 0, 'The body');
}
export function otherPartCount(p: OtherPart): number {
  let n = 1;
  if (p.parts) for (let i = 0; i < p.parts.length; i++) n += otherPartCount(p.parts[i]);
  return n;
}
export function otherReach(p: OtherPart, cx = 0, cy = 0, facing = 0): number {
  let far = p.radius;
  if (p.kind === 'outline' && p.points) { far = 0; for (let i = 0; i < p.points.length; i++) { const d = Math.hypot(p.points[i][0], p.points[i][1]) * p.radius; if (d > far) far = d; } }
  let reach = Math.hypot(cx, cy) + far;
  if (p.parts) {
    const c = Math.cos(facing), s = Math.sin(facing);
    for (let i = 0; i < p.parts.length; i++) { const k = p.parts[i]; const r = otherReach(k, cx + k.x * c - k.y * s, cy + k.x * s + k.y * c, facing + k.angle); if (r > reach) reach = r; }
  }
  return reach;
}

export interface OtherCtx {
  beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void; stroke(): void; fill(): void;
  lineWidth: number; lineJoin: string; lineCap: string; strokeStyle: any; fillStyle: any;
}
export type OtherFillOf = (color: string, colorMap: number, team?: boolean) => string;
export type OtherLineOf = (fill: string) => string;

function _shapePath(ctx: OtherCtx, p: OtherPart, cx: number, cy: number, unit: number, rot: number): void {
  const R = p.radius * unit;
  ctx.beginPath();
  if (p.kind === 'circle') { ctx.arc(cx, cy, R, 0, Math.PI * 2); return; }
  if (p.kind === 'line') {
    ctx.moveTo(cx + R * Math.cos(rot), cy + R * Math.sin(rot));
    ctx.lineTo(cx - R * Math.cos(rot), cy - R * Math.sin(rot));
    return;
  }
  if (p.kind === 'outline') {
    const pts = p.points as [number, number][]; const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < pts.length; i++) {
      const x = cx + (pts[i][0] * c - pts[i][1] * s) * R, y = cy + (pts[i][0] * s + pts[i][1] * c) * R;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return;
  }
  const n = p.sides as number;
  if (p.kind === 'polygon') {
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  } else {
    const r2 = R * (p.inner as number);
    for (let i = 0; i < n * 2; i++) { const a = rot + (i / n) * Math.PI; const rr = (i & 1) === 0 ? R : r2; const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  }
  ctx.closePath();
}

function _drawPart(ctx: OtherCtx, p: OtherPart, cx: number, cy: number, unit: number, facing: number, lineWidth: number, fillOf: OtherFillOf, lineOf: OtherLineOf): void {
  const kids = p.parts; const c = Math.cos(facing), s = Math.sin(facing);
  if (kids) for (let i = 0; i < kids.length; i++) { const k = kids[i]; if (!k.above) _drawPart(ctx, k, cx + (k.x * c - k.y * s) * unit, cy + (k.x * s + k.y * c) * unit, unit, facing + k.angle, lineWidth, fillOf, lineOf); }
  const fill = fillOf(p.color, p.colorMap);
  _shapePath(ctx, p, cx, cy, unit, facing + p.turn);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = lineOf(fill);
  ctx.stroke();
  if (p.kind !== 'line') { ctx.fillStyle = fill; ctx.fill(); }
  if (kids) for (let i = 0; i < kids.length; i++) { const k = kids[i]; if (k.above) _drawPart(ctx, k, cx + (k.x * c - k.y * s) * unit, cy + (k.x * s + k.y * c) * unit, unit, facing + k.angle, lineWidth, fillOf, lineOf); }
}

export function drawOtherDesign(ctx: OtherCtx, design: OtherDesign, cx: number, cy: number, width: number, facing: number, lineWidth: number, fillOf: OtherFillOf, lineOf: OtherLineOf): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  _drawPart(ctx, design.body, cx, cy, width / 2, facing, lineWidth, fillOf, lineOf);
}

export interface OtherDrawItem {
  part: OtherPart;
  ax: number; ay: number;
  lx: number; ly: number;
  rot: number;
  aimed: boolean;
  verts: Float64Array;
}
export interface OtherDrawList {
  items: OtherDrawItem[];
  rest: number;
}

function _unitVerts(p: OtherPart, rot: number): Float64Array {
  const R = p.radius; const c = Math.cos(rot), s = Math.sin(rot);
  if (p.kind === 'circle') return new Float64Array(0);
  if (p.kind === 'line') return new Float64Array([R * c, R * s, -R * c, -R * s]);
  if (p.kind === 'outline') {
    const pts = p.points as [number, number][]; const v = new Float64Array(pts.length * 2);
    for (let i = 0; i < pts.length; i++) { v[i * 2] = (pts[i][0] * c - pts[i][1] * s) * R; v[i * 2 + 1] = (pts[i][0] * s + pts[i][1] * c) * R; }
    return v;
  }
  const n = p.sides as number;
  if (p.kind === 'polygon') {
    const v = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; v[i * 2] = R * Math.cos(a); v[i * 2 + 1] = R * Math.sin(a); }
    return v;
  }
  const r2 = R * (p.inner as number); const v = new Float64Array(n * 4);
  for (let i = 0; i < n * 2; i++) { const a = rot + (i / n) * Math.PI; const rr = (i & 1) === 0 ? R : r2; v[i * 2] = rr * Math.cos(a); v[i * 2 + 1] = rr * Math.sin(a); }
  return v;
}

export function otherDrawList(design: OtherDesign, aimedPart: OtherPart | null = null): OtherDrawList {
  const items: OtherDrawItem[] = [];
  let rest = 0;
  const walk = (p: OtherPart, px: number, py: number, f: number, inAim: boolean, ax: number, ay: number): void => {
    const kids = p.parts; const c = Math.cos(f), s = Math.sin(f);
    const child = (k: OtherPart): void => {
      const kx = px + k.x * c - k.y * s, ky = py + k.x * s + k.y * c;
      if (!inAim && k === aimedPart) { rest = f + k.angle; walk(k, 0, 0, 0, true, kx, ky); }
      else walk(k, kx, ky, f + k.angle, inAim, ax, ay);
    };
    if (kids) for (let i = 0; i < kids.length; i++) if (!kids[i].above) child(kids[i]);
    items.push({ part: p, ax, ay, lx: px, ly: py, rot: f + p.turn, aimed: inAim, verts: _unitVerts(p, f + p.turn) });
    if (kids) for (let i = 0; i < kids.length; i++) if (kids[i].above) child(kids[i]);
  };
  walk(design.body, 0, 0, 0, false, 0, 0);
  return { items, rest };
}

export function otherShapePath(ctx: OtherCtx, p: OtherPart, cx: number, cy: number, unit: number, rot: number): void {
  _shapePath(ctx, p, cx, cy, unit, rot);
}

export function drawOtherList(ctx: OtherCtx, list: OtherDrawList, cx: number, cy: number, width: number, facing: number, aim: number, lineWidth: number, fillOf: OtherFillOf, lineOf: OtherLineOf): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const unit = width / 2; const items = list.items;
  const cF = Math.cos(facing), sF = Math.sin(facing), cA = Math.cos(aim), sA = Math.sin(aim);
  for (let i = 0; i < items.length; i++) {
    const it = items[i]; const p = it.part;
    const cb = it.aimed ? cA : cF, sb = it.aimed ? sA : sF;
    const x = cx + ((it.ax * cF - it.ay * sF) + (it.lx * cb - it.ly * sb)) * unit;
    const y = cy + ((it.ax * sF + it.ay * cF) + (it.lx * sb + it.ly * cb)) * unit;
    const fill = fillOf(p.color, p.colorMap, p.teamColour === true);
    _shapePath(ctx, p, x, y, unit, (it.aimed ? aim : facing) + it.rot);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = lineOf(fill);
    ctx.stroke();
    if (p.kind !== 'line') { ctx.fillStyle = fill; ctx.fill(); }
  }
}

export const OTHER_INST_STRIDE = 7;
export function setOtherInstance(inst: Float64Array, k: number, x: number, y: number, unit: number, facing: number, aim: number): void {
  const o = k * OTHER_INST_STRIDE;
  inst[o] = x; inst[o + 1] = y; inst[o + 2] = unit;
  inst[o + 3] = Math.cos(facing); inst[o + 4] = Math.sin(facing);
  inst[o + 5] = Math.cos(aim); inst[o + 6] = Math.sin(aim);
}
export function drawOtherListMany(ctx: OtherCtx, list: OtherDrawList, n: number, inst: Float64Array, lineWidth: number, fillOf: OtherFillOf, lineOf: OtherLineOf, pxPerUnit: number, minPx: number): void {
  if (n <= 0) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = lineWidth;
  const items = list.items; const small = minPx / (pxPerUnit > 0 ? pxPerUnit : 1) / 2;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]; const p = it.part; const v = it.verts; const aimed = it.aimed; const kind = p.kind;
    let any = false;
    ctx.beginPath();
    for (let k = 0, o = 0; k < n; k++, o += OTHER_INST_STRIDE) {
      const unit = inst[o + 2];
      if (i > 0 && unit < small) continue;
      any = true;
      const cF = inst[o + 3], sF = inst[o + 4];
      const cb = aimed ? inst[o + 5] : cF, sb = aimed ? inst[o + 6] : sF;
      const x = inst[o] + ((it.ax * cF - it.ay * sF) + (it.lx * cb - it.ly * sb)) * unit;
      const y = inst[o + 1] + ((it.ax * sF + it.ay * cF) + (it.lx * sb + it.ly * cb)) * unit;
      if (kind === 'circle') { const R = p.radius * unit; ctx.moveTo(x + R, y); ctx.arc(x, y, R, 0, Math.PI * 2); continue; }
      for (let j = 0; j < v.length; j += 2) {
        const vx = x + (v[j] * cb - v[j + 1] * sb) * unit, vy = y + (v[j] * sb + v[j + 1] * cb) * unit;
        if (j === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      if (kind !== 'line') ctx.closePath();
    }
    if (!any) continue;
    const fill = fillOf(p.color, p.colorMap, p.teamColour === true);
    ctx.strokeStyle = lineOf(fill);
    ctx.stroke();
    if (kind !== 'line') { ctx.fillStyle = fill; ctx.fill(); }
  }
}
