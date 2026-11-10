import { AREA_KIND_KILL } from '../types';
import type { MapState } from '../types';
import { checkLineOfSight } from './Navigation';
import { getBaseTeamFromTile } from './MapSystem';
import { polyHas } from './areaShape';

export const BASE_THREAT_FEATURE: number = 1;

export function baseThreatTeamBit(teamIndex: number): number {
  return teamIndex >= 0 && teamIndex < 4 ? (1 << teamIndex) : 0;
}

export interface BaseThreatField {
  gridCells: number;
  gridCellsY: number;
  cellSize: number;
  mapHalf: number;
  mapHalfY: number;
  mask: Uint8Array;
  maxReach: number;
  reachCells: number;
  killCells: number;
  hurts: Uint8Array | null;
}

export const BASE_THREAT_REACH_MASK = 0x0f;
export const BASE_THREAT_KILL_SHIFT = 4;

export interface BaseThreatSource {
  x: number;
  y: number;
  reach: number;
  teamIndex: number;
}

export function buildBaseThreatField(
  ms: MapState,
  sources: BaseThreatSource[],
  offX: number,
  offY: number,
): BaseThreatField {
  const gc = ms.gridCells;
  const gcY = ms.gridCellsY;
  const cs = ms.cellSize;
  const mh = ms.mapHalf;
  const mhY = ms.mapHalfY;
  const mask = new Uint8Array(gc * gcY);
  let maxReach = 0;

  const tg = ms.tileGrid;
  for (let i = 0; i < mask.length; i++) {
    const team = getBaseTeamFromTile(tg[i]);
    if (team === null) continue;
    const ti = Number(team.slice(4)) - 1;
    if (ti < 0 || ti > 3) continue;
    mask[i] |= baseThreatTeamBit(ti) << BASE_THREAT_KILL_SHIFT;
  }

  for (let si = 0; si < sources.length; si++) {
    const s = sources[si];
    const bit = baseThreatTeamBit(s.teamIndex);
    if (bit === 0 || !(s.reach > 0)) continue;
    if (s.reach > maxReach) maxReach = s.reach;
    const lx = s.x - offX;
    const ly = s.y - offY;
    const r2 = s.reach * s.reach;
    const c0x = Math.max(0, Math.floor((lx - s.reach + mh) / cs));
    const c1x = Math.min(gc - 1, Math.floor((lx + s.reach + mh) / cs));
    const c0y = Math.max(0, Math.floor((ly - s.reach + mhY) / cs));
    const c1y = Math.min(gcY - 1, Math.floor((ly + s.reach + mhY) / cs));
    for (let cx = c0x; cx <= c1x; cx++) {
      const px = -mh + (cx + 0.5) * cs;
      const ddx = px - lx;
      for (let cy = c0y; cy <= c1y; cy++) {
        const idx = cx * gcY + cy;
        if ((mask[idx] & bit) !== 0) continue;
        const py = -mhY + (cy + 0.5) * cs;
        const ddy = py - ly;
        if (ddx * ddx + ddy * ddy > r2) continue;
        if (checkLineOfSight(ms, px, py, lx, ly, offX, offY)) mask[idx] |= bit;
      }
    }
  }

  let hurts: Uint8Array | null = null;
  const rows = ms.customAreas;
  if (rows) for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    if (a.kind !== AREA_KIND_KILL || a.off === true) continue;
    let bits = 0b111111, teamless = 0;
    for (let w = 0; w < a.spare.length; w++) {
      const s = a.spare[w];
      if (s === 'team1') bits &= ~1; else if (s === 'team2') bits &= ~2; else if (s === 'team3') bits &= ~4; else if (s === 'team4') bits &= ~8;
      else if (s === 'bossCamp' || s === 'bosses') bits &= ~32;
      else if (s === 'neutral' || s === 'ffa') teamless++;
    }
    if (teamless >= 2) bits &= ~16;
    if (bits === 0) continue;
    if (hurts === null) hurts = new Uint8Array(gc * gcY);
    const cx1 = Math.min(gc, a.gx + a.cw), cy1 = Math.min(gcY, a.gy + a.ch);
    const pg = a.poly;
    for (let cx = Math.max(0, a.gx); cx < cx1; cx++) for (let cy = Math.max(0, a.gy); cy < cy1; cy++) {
      if (pg != null && !polyHas(pg, offX - mh + (cx + 0.5) * cs, offY - mhY + (cy + 0.5) * cs)) continue;
      hurts[cx * gcY + cy] |= bits;
    }
  }

  let reachCells = 0, killCells = 0;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    if ((v & BASE_THREAT_REACH_MASK) !== 0) reachCells++;
    if ((v >> BASE_THREAT_KILL_SHIFT) !== 0) killCells++;
  }

  return { gridCells: gc, gridCellsY: gcY, cellSize: cs, mapHalf: mh, mapHalfY: mhY, mask, maxReach, reachCells, killCells, hurts };
}

export function baseThreatAt(
  field: BaseThreatField | null | undefined,
  worldX: number, worldY: number,
  offX: number, offY: number,
): number {
  if (BASE_THREAT_FEATURE === 0 || !field) return 0;
  const gc = field.gridCells;
  const gcY = field.gridCellsY;
  const cx = Math.floor((worldX - offX + field.mapHalf) / field.cellSize);
  if (cx < 0 || cx >= gc) return 0;
  const cy = Math.floor((worldY - offY + field.mapHalfY) / field.cellSize);
  if (cy < 0 || cy >= gcY) return 0;
  return field.mask[cx * gcY + cy];
}

export function baseThreatHostile(
  field: BaseThreatField | null | undefined,
  worldX: number, worldY: number,
  offX: number, offY: number,
  myTeamIndex: number,
  includeKill: boolean,
): boolean {
  const v = baseThreatAt(field, worldX, worldY, offX, offY);
  if (v === 0) return false;
  const mine = myTeamIndex >= 0 && myTeamIndex < 4 ? baseThreatTeamBit(myTeamIndex) : 0;
  const hostile = BASE_THREAT_REACH_MASK & ~mine;
  if ((v & hostile) !== 0) return true;
  if (!includeKill) return false;
  return (((v >> BASE_THREAT_KILL_SHIFT) & hostile) !== 0);
}

export function baseThreatRectFraction(
  field: BaseThreatField | null | undefined,
  minX: number, minY: number, maxX: number, maxY: number,
  myTeamIndex: number,
): number {
  if (BASE_THREAT_FEATURE === 0 || !field) return 0;
  const gc = field.gridCells, cs = field.cellSize, mh = field.mapHalf;
  const gcY = field.gridCellsY, mhY = field.mapHalfY;
  const c0x = Math.max(0, Math.floor((minX + mh) / cs));
  const c1x = Math.min(gc - 1, Math.floor((maxX + mh) / cs));
  const c0y = Math.max(0, Math.floor((minY + mhY) / cs));
  const c1y = Math.min(gcY - 1, Math.floor((maxY + mhY) / cs));
  if (c1x < c0x || c1y < c0y) return 0;
  const mine = myTeamIndex >= 0 && myTeamIndex < 4 ? baseThreatTeamBit(myTeamIndex) : 0;
  const hostile = BASE_THREAT_REACH_MASK & ~mine;
  let bad = 0, total = 0;
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cy = c0y; cy <= c1y; cy++) {
      const v = field.mask[cx * gcY + cy];
      total++;
      if ((v & hostile) !== 0 || (((v >> BASE_THREAT_KILL_SHIFT) & hostile) !== 0)) bad++;
    }
  }
  return total > 0 ? bad / total : 0;
}

export const BASE_DANGER_SLOT_NONE = 4;
export const BASE_DANGER_SLOT_BOSS = 5;
export const BASE_DANGER_SLOTS = 6;

export function baseDangerSlotOf(teamIndex: number): number {
  return teamIndex >= 0 && teamIndex < 4 ? teamIndex : BASE_DANGER_SLOT_NONE;
}

export const BASE_DANGER_ZERO = 0x4000;
export const BASE_DANGER_BLOCKED = 0xFFFF;
export const BASE_DANGER_FAR = 0xFFFE;

export interface BaseDangerField {
  src: BaseThreatField;
  blockedRef: Uint8Array | null;
  slot: number;
  gridCells: number;
  gridCellsY: number;
  cellSize: number;
  mapHalf: number;
  mapHalfY: number;
  code: Uint16Array;
  dangerCells: number;
  pocketCells: number;
}

export function baseDangerHostileBits(slot: number): number {
  return slot >= 0 && slot < 4
    ? (BASE_THREAT_REACH_MASK & ~baseThreatTeamBit(slot))
    : BASE_THREAT_REACH_MASK;
}

let _bdQueue: Int32Array = new Int32Array(0);
let _bdNavComp: Int32Array = new Int32Array(0);
let _bdOutComp: Int32Array = new Int32Array(0);

export function buildBaseDangerField(
  src: BaseThreatField,
  blocked: Uint8Array | null,
  slot: number,
  pocketBand: number = -1,
): BaseDangerField {
  const gc = src.gridCells;
  const gcY = src.gridCellsY;
  const total = gc * gcY;
  const mask = src.mask;
  const code = new Uint16Array(total);
  if (_bdQueue.length < total) _bdQueue = new Int32Array(total);
  const q = _bdQueue;
  const hostile = baseDangerHostileBits(slot);
  const hurts = src.hurts, hurtBit = 1 << slot;
  const useBlocked = blocked !== null && blocked.length === total;
  const UNSET_DANGER = 0;

  let qt = 0;
  let dangerCells = 0;
  for (let i = 0; i < total; i++) {
    if (useBlocked && blocked![i] !== 0) { code[i] = BASE_DANGER_BLOCKED; continue; }
    const v = mask[i];
    if ((v & hostile) !== 0 || ((v >> BASE_THREAT_KILL_SHIFT) & hostile) !== 0 || (hurts !== null && (hurts[i] & hurtBit) !== 0)) {
      code[i] = UNSET_DANGER;
      q[qt++] = i;
      dangerCells++;
    } else {
      code[i] = BASE_DANGER_FAR;
    }
  }

  _bdOutward(code, gc, gcY, q, qt);

  let pocketCells = 0;
  if (pocketBand >= 0 && dangerCells > 0) {
    const ownKill = slot >= 0 && slot < 4 ? baseThreatTeamBit(slot) << BASE_THREAT_KILL_SHIFT : 0;
    pocketCells = _bdFoldPockets(code, gc, gcY, BASE_DANGER_ZERO + pocketBand, UNSET_DANGER, mask, ownKill);
    if (pocketCells > 0) {
      qt = 0;
      for (let i = 0; i < total; i++) {
        const v = code[i];
        if (v === BASE_DANGER_BLOCKED) continue;
        if (v === UNSET_DANGER) q[qt++] = i;
        else code[i] = BASE_DANGER_FAR;
      }
      _bdOutward(code, gc, gcY, q, qt);
      dangerCells += pocketCells;
    }
  }

  qt = 0;
  for (let i = 0; i < total; i++) if (code[i] === BASE_DANGER_ZERO) q[qt++] = i;
  let qh = 0;
  while (qh < qt) {
    const c = q[qh++];
    const cc = code[c];
    const next = cc - 1;
    if (next <= UNSET_DANGER) continue;
    const cx = (c / gcY) | 0;
    const cy = c - cx * gcY;
    if (cx > 0)      { const n = c - gcY; if (code[n] === UNSET_DANGER) { code[n] = next; q[qt++] = n; } }
    if (cx < gc - 1) { const n = c + gcY; if (code[n] === UNSET_DANGER) { code[n] = next; q[qt++] = n; } }
    if (cy > 0)      { const n = c - 1;  if (code[n] === UNSET_DANGER) { code[n] = next; q[qt++] = n; } }
    if (cy < gcY - 1) { const n = c + 1;  if (code[n] === UNSET_DANGER) { code[n] = next; q[qt++] = n; } }
  }
  for (let i = 0; i < total; i++) if (code[i] === UNSET_DANGER) code[i] = 1;

  return {
    src, blockedRef: useBlocked ? blocked : null, slot,
    gridCells: gc, gridCellsY: gcY, cellSize: src.cellSize, mapHalf: src.mapHalf, mapHalfY: src.mapHalfY,
    code, dangerCells, pocketCells,
  };
}

function _bdOutward(code: Uint16Array, gc: number, gcY: number, q: Int32Array, qt: number): void {
  let qh = 0;
  while (qh < qt) {
    const c = q[qh++];
    const cc = code[c];
    const next = cc === 0 ? BASE_DANGER_ZERO : cc + 1;
    if (next >= BASE_DANGER_FAR) continue;
    const cx = (c / gcY) | 0;
    const cy = c - cx * gcY;
    if (cx > 0)      { const n = c - gcY; if (code[n] === BASE_DANGER_FAR) { code[n] = next; q[qt++] = n; } }
    if (cx < gc - 1) { const n = c + gcY; if (code[n] === BASE_DANGER_FAR) { code[n] = next; q[qt++] = n; } }
    if (cy > 0)      { const n = c - 1;  if (code[n] === BASE_DANGER_FAR) { code[n] = next; q[qt++] = n; } }
    if (cy < gcY - 1) { const n = c + 1;  if (code[n] === BASE_DANGER_FAR) { code[n] = next; q[qt++] = n; } }
  }
}

function _bdFoldPockets(code: Uint16Array, gc: number, gcY: number, limit: number, unset: number,
                        mask: Uint8Array, ownKill: number): number {
  const total = gc * gcY;
  if (_bdNavComp.length < total) { _bdNavComp = new Int32Array(total); _bdOutComp = new Int32Array(total); }
  const nav = _bdNavComp, out = _bdOutComp, q = _bdQueue;
  nav.fill(-1, 0, total);
  out.fill(-1, 0, total);
  let nNav = 0;
  for (let s = 0; s < total; s++) {
    if (nav[s] >= 0 || code[s] === BASE_DANGER_BLOCKED) continue;
    let qh = 0, qt = 0;
    q[qt++] = s; nav[s] = nNav;
    while (qh < qt) {
      const c = q[qh++];
      const cx = (c / gcY) | 0, cy = c - cx * gcY;
      if (cx > 0)      { const n = c - gcY; if (nav[n] < 0 && code[n] !== BASE_DANGER_BLOCKED) { nav[n] = nNav; q[qt++] = n; } }
      if (cx < gc - 1) { const n = c + gcY; if (nav[n] < 0 && code[n] !== BASE_DANGER_BLOCKED) { nav[n] = nNav; q[qt++] = n; } }
      if (cy > 0)      { const n = c - 1;  if (nav[n] < 0 && code[n] !== BASE_DANGER_BLOCKED) { nav[n] = nNav; q[qt++] = n; } }
      if (cy < gcY - 1) { const n = c + 1;  if (nav[n] < 0 && code[n] !== BASE_DANGER_BLOCKED) { nav[n] = nNav; q[qt++] = n; } }
    }
    nNav++;
  }
  const outSize: number[] = [];
  const outNav: number[] = [];
  const outHome: boolean[] = [];
  const bestPerNav = new Int32Array(nNav);
  const isOut = (v: number) => v !== BASE_DANGER_BLOCKED && v >= limit;
  for (let s = 0; s < total; s++) {
    if (out[s] >= 0 || !isOut(code[s])) continue;
    const id = outSize.length;
    let qh = 0, qt = 0, n = 0, home = false;
    q[qt++] = s; out[s] = id;
    while (qh < qt) {
      const c = q[qh++];
      n++;
      if (ownKill !== 0 && (mask[c] & ownKill) !== 0) home = true;
      const cx = (c / gcY) | 0, cy = c - cx * gcY;
      if (cx > 0)      { const m = c - gcY; if (out[m] < 0 && isOut(code[m])) { out[m] = id; q[qt++] = m; } }
      if (cx < gc - 1) { const m = c + gcY; if (out[m] < 0 && isOut(code[m])) { out[m] = id; q[qt++] = m; } }
      if (cy > 0)      { const m = c - 1;  if (out[m] < 0 && isOut(code[m])) { out[m] = id; q[qt++] = m; } }
      if (cy < gcY - 1) { const m = c + 1;  if (out[m] < 0 && isOut(code[m])) { out[m] = id; q[qt++] = m; } }
    }
    outSize.push(n);
    outNav.push(nav[s]);
    outHome.push(home);
    if (n > bestPerNav[nav[s]]) bestPerNav[nav[s]] = n;
  }
  let folded = 0;
  for (let i = 0; i < total; i++) {
    const id = out[i];
    if (id < 0) continue;
    if (!outHome[id] && outSize[id] * 2 < bestPerNav[outNav[id]]) { code[i] = unset; folded++; }
  }
  return folded;
}

export function baseDangerCodeAt(
  f: BaseDangerField | null | undefined,
  worldX: number, worldY: number,
  offX: number, offY: number,
): number {
  if (BASE_THREAT_FEATURE === 0 || !f) return BASE_DANGER_FAR;
  const gc = f.gridCells;
  const gcY = f.gridCellsY;
  let cx = Math.floor((worldX - offX + f.mapHalf) / f.cellSize);
  if (cx < 0) cx = 0; else if (cx >= gc) cx = gc - 1;
  let cy = Math.floor((worldY - offY + f.mapHalfY) / f.cellSize);
  if (cy < 0) cy = 0; else if (cy >= gcY) cy = gcY - 1;
  if (!(cx >= 0 && cy >= 0)) return BASE_DANGER_FAR;
  const i = cx * gcY + cy;
  const c = f.code[i];
  if (c !== BASE_DANGER_BLOCKED) return c;
  let best = BASE_DANGER_FAR;
  if (cx > 0)      { const v = f.code[i - gcY]; if (v !== BASE_DANGER_BLOCKED && v < best) best = v; }
  if (cx < gc - 1) { const v = f.code[i + gcY]; if (v !== BASE_DANGER_BLOCKED && v < best) best = v; }
  if (cy > 0)      { const v = f.code[i - 1];  if (v !== BASE_DANGER_BLOCKED && v < best) best = v; }
  if (cy < gcY - 1) { const v = f.code[i + 1];  if (v !== BASE_DANGER_BLOCKED && v < best) best = v; }
  return best;
}

export function baseDangerRectFraction(
  f: BaseDangerField | null | undefined,
  minX: number, minY: number, maxX: number, maxY: number,
  band: number,
): number {
  if (BASE_THREAT_FEATURE === 0 || !f) return 0;
  const gc = f.gridCells, cs = f.cellSize, mh = f.mapHalf;
  const gcY = f.gridCellsY, mhY = f.mapHalfY;
  const c0x = Math.max(0, Math.floor((minX + mh) / cs));
  const c1x = Math.min(gc - 1, Math.ceil((maxX + mh) / cs) - 1);
  const c0y = Math.max(0, Math.floor((minY + mhY) / cs));
  const c1y = Math.min(gcY - 1, Math.ceil((maxY + mhY) / cs) - 1);
  if (c1x < c0x || c1y < c0y) return 0;
  const limit = BASE_DANGER_ZERO + band;
  let bad = 0, open = 0;
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cy = c0y; cy <= c1y; cy++) {
      const v = f.code[cx * gcY + cy];
      if (v === BASE_DANGER_BLOCKED) continue;
      open++;
      if (v < limit) bad++;
    }
  }
  return open > 0 ? bad / open : 0;
}
