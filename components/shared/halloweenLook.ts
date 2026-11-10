import type { GameLogic } from '../../game/GameLogic';
import type { OtherDesign, OtherPart } from '../../types';
import { bodyFill, isGameDark, wallDefault } from '../../utils/gameColors';
import { darkenColor } from '../../utils/p5Utils';
import { drawOtherList, drawOtherListMany, setOtherInstance, OTHER_INST_STRIDE, type OtherDrawList } from '../../utils/otherDraw';
import {
  halloweenPartsOf, makeHalloweenLook, findOtherDesign, EYE_ID, PUMPKIN_ID,
  makeEyeTable, makeEyeTargets, syncEyes, beginEyeFrame, placeEye, eyeAimOf, eyeAlpha, eyeFlatColours, overGround,
  EYE_STRIDE, E_X, E_Y, E_UNIT, E_TURN,
  type HalloweenLook, type EyeTable, type EyeTargets,
} from '../../utils/halloween';

let _lib: unknown = null, _libLen = -1;
let _eyeD: OtherDesign | null = null, _pkD: OtherDesign | null = null;
let _look: HalloweenLook | null = null;
let _parts = 3;

export function halloweenLook(logic: GameLogic): HalloweenLook | null {
  const parts = halloweenPartsOf(logic.state.gameModeConfig);
  if (parts === 0) return null;
  if (parts !== _parts) { _parts = parts; _lib = null; _eyeD = null; _pkD = null; _look = null; }
  const lib = logic.state.otherLibrary;
  if (lib !== _lib || lib.length !== _libLen || (_eyeD !== null && findOtherDesign(lib, EYE_ID) !== _eyeD) || (_pkD !== null && findOtherDesign(lib, PUMPKIN_ID) !== _pkD) || (_look === null && _lib === null)) {
    _lib = lib; _libLen = lib.length;
    const eye = (_parts & 1) !== 0 ? findOtherDesign(lib, EYE_ID) : null, pk = (_parts & 2) !== 0 ? findOtherDesign(lib, PUMPKIN_ID) : null;
    if (eye !== _eyeD || pk !== _pkD || (_look === null && (eye !== null || pk !== null))) {
      _eyeD = eye; _pkD = pk;
      _look = makeHalloweenLook(eye, pk);
      if (_look === null && eye !== null && pk !== null) _look = makeHalloweenLook(null, pk) ?? makeHalloweenLook(eye, null);
    }
  }
  return _look;
}

export const hwFillOf = (color: string, map: number): string => bodyFill(color, map);
export const hwLineOf = (fill: string): string => darkenColor(fill, 0.598);
let _muted = '#888888';
const _mutedFillOf = (_color: string, _map: number): string => _muted;

let _rgbLook: HalloweenLook | null = null, _rgbDark = false, _rgbAlpha = -1, _rgbWall = '';
let _eyeRgb = new Float32Array(0), _pkRgb = new Float32Array(0), _eyeShown = new Float32Array(0);
const _wallRgb = new Float32Array(3);
function _rgbOf(css: string, out: number[], o: number): void {
  if (css.charCodeAt(0) === 35) {
    const hex = css.length === 4 ? css[1] + css[1] + css[2] + css[2] + css[3] + css[3] : css.slice(1);
    const n = parseInt(hex, 16); out[o] = (n >> 16) & 255; out[o + 1] = (n >> 8) & 255; out[o + 2] = n & 255; return;
  }
  const m = css.match(/-?\d+(?:\.\d+)?/g);
  out[o] = m ? +m[0] : 0; out[o + 1] = m ? +m[1] : 0; out[o + 2] = m ? +m[2] : 0;
}
const _eyeFillCss = new Map<string, string[]>();
const _eyeLineCss = new Map<string, string>();
const _css = (r: number, g: number, b: number): string => 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
function _eyeColours(look: HalloweenLook, alpha: number, wallHex: string): Float32Array {
  _eyeFillCss.clear(); _eyeLineCss.clear();
  const list = look.eyeList; if (list === null) return new Float32Array(0);
  const n = list.items.length; const fills: number[] = new Array(n * 3), lines: number[] = new Array(n * 3), wall = [0, 0, 0];
  _rgbOf(wallHex, wall, 0);
  for (let i = 0; i < n; i++) {
    const p = list.items[i].part; const fill = bodyFill(p.color, p.colorMap);
    _rgbOf(fill, fills, i * 3); _rgbOf(darkenColor(fill, 0.598), lines, i * 3);
    const f = _css(overGround(fills[i * 3], wall[0], alpha), overGround(fills[i * 3 + 1], wall[1], alpha), overGround(fills[i * 3 + 2], wall[2], alpha));
    const l = _css(overGround(lines[i * 3], wall[0], alpha), overGround(lines[i * 3 + 1], wall[1], alpha), overGround(lines[i * 3 + 2], wall[2], alpha));
    let by = _eyeFillCss.get(p.color); if (by === undefined) { by = []; _eyeFillCss.set(p.color, by); }
    by[p.colorMap + 1] = f; _eyeLineCss.set(f, l);
  }
  const out = new Float32Array(n * 6);
  eyeFlatColours(out, fills, lines, wall, alpha);
  return out;
}
const _eyeFillOf = (color: string, map: number): string => { const by = _eyeFillCss.get(color); const c = by !== undefined ? by[map + 1] : undefined; return c !== undefined ? c : bodyFill(color, map); };
const _eyeLineOf = (fill: string): string => { const c = _eyeLineCss.get(fill); return c !== undefined ? c : darkenColor(fill, 0.598); };
function _fillRgb(list: OtherDrawList | null): Float32Array {
  if (list === null) return new Float32Array(0);
  const out = new Float32Array(list.items.length * 3);
  for (let i = 0; i < list.items.length; i++) {
    const p = list.items[i].part;
    let hex = bodyFill(p.color, p.colorMap);
    if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    const n = parseInt(hex.slice(1), 16);
    out[i * 3] = ((n >> 16) & 255) / 255; out[i * 3 + 1] = ((n >> 8) & 255) / 255; out[i * 3 + 2] = (n & 255) / 255;
  }
  return out;
}
function _rgbFor(look: HalloweenLook): void {
  const dark = isGameDark(); const alpha = eyeAlpha(); const wall = wallDefault();
  if (look === _rgbLook && dark === _rgbDark && alpha === _rgbAlpha && wall === _rgbWall) return;
  _rgbLook = look; _rgbDark = dark; _rgbAlpha = alpha; _rgbWall = wall;
  _eyeShown = _eyeColours(look, alpha, wall); _eyeRgb = _fillRgb(look.eyeList); _pkRgb = _fillRgb(look.pumpkinList);
  const w = [0, 0, 0]; _rgbOf(wall, w, 0); _wallRgb[0] = w[0] / 255; _wallRgb[1] = w[1] / 255; _wallRgb[2] = w[2] / 255;
}
export function hwEyeRgb(look: HalloweenLook): Float32Array { _rgbFor(look); return _eyeRgb; }
export function hwEyeShown(look: HalloweenLook): Float32Array { _rgbFor(look); return _eyeShown; }
export function hwWallRgb(look: HalloweenLook): Float32Array { _rgbFor(look); return _wallRgb; }
export function hwPumpkinRgb(look: HalloweenLook): Float32Array { _rgbFor(look); return _pkRgb; }

const _eyes: EyeTable = makeEyeTable();
const _targets: EyeTargets = makeEyeTargets();
let _eyesMap: unknown = null, _eyesWalls = -1, _eyesSeed = 0;
export function hwBeginEyes(logic: GameLogic, look: HalloweenLook): EyeTable | null {
  const ms = logic.mapState;
  if (look.eyeList === null || !ms) return null;
  const seed = logic.state.mapConfig.seed | 0;
  if (ms !== _eyesMap || ms.walls.length !== _eyesWalls || seed !== _eyesSeed || _eyes.look !== look) {
    const follow = ms === _eyesMap && seed === _eyesSeed && _eyes.look === look;
    _eyesMap = ms; _eyesWalls = ms.walls.length; _eyesSeed = seed;
    syncEyes(_eyes, ms.walls, seed, look, follow);
  }
  beginEyeFrame(_eyes, logic, logic.gameNow(), _targets);
  return _eyes;
}
export function hwEyeTargets(): EyeTargets { return _targets; }
export function hwEyeTable(): EyeTable { return _eyes; }

const SCRATCH_MAX = 1024;
let _scr: HTMLCanvasElement | null = null, _sctx: CanvasRenderingContext2D | null = null;
function _drawFaded(
  ctx: CanvasRenderingContext2D, list: OtherDrawList, reach: number,
  cx: number, cy: number, width: number, facing: number, aim: number, lineWidth: number,
  fillOf: (color: string, map: number) => string, lineOf: (fill: string) => string,
  alpha: number, pxPerWorld: number,
): void {
  const half = reach * width / 2 + lineWidth;
  let scale = pxPerWorld > 0 ? pxPerWorld : 1;
  let px = Math.ceil(half * 2 * scale) + 4;
  if (px > SCRATCH_MAX) { scale *= SCRATCH_MAX / px; px = SCRATCH_MAX; }
  if (px < 2) return;
  if (_scr === null) { _scr = document.createElement('canvas'); _scr.width = 256; _scr.height = 256; _sctx = _scr.getContext('2d'); }
  if (_sctx === null) return;
  if (_scr.width < px) { const s = Math.min(SCRATCH_MAX, Math.ceil(px / 128) * 128); _scr.width = s; _scr.height = s; }
  _sctx.setTransform(1, 0, 0, 1, 0, 0);
  _sctx.clearRect(0, 0, _scr.width, _scr.height);
  _sctx.setTransform(scale, 0, 0, scale, px / 2, px / 2);
  drawOtherList(_sctx, list, 0, 0, width, facing, aim, lineWidth, fillOf, lineOf);
  const was = ctx.globalAlpha;
  ctx.globalAlpha = was * alpha;
  const w = px / scale;
  ctx.drawImage(_scr, 0, 0, px, px, cx - w / 2, cy - w / 2, w, w);
  ctx.globalAlpha = was;
}

export const PUMPKIN_FULL_PX = 14;
export const EYE_MIN_PX = 4;
let _q = new Float64Array(256 * OTHER_INST_STRIDE), _qn = 0;
function _queue(x: number, y: number, unit: number, facing: number, aim: number): void {
  if ((_qn + 1) * OTHER_INST_STRIDE > _q.length) { const q = new Float64Array(_q.length * 2); q.set(_q); _q = q; }
  setOtherInstance(_q, _qn++, x, y, unit, facing, aim);
}
export function hwQueuePumpkin(x: number, y: number, r: number, turn: number): void {
  _queue(x, y, r, turn, turn);
}
export function hwFlushPumpkins(ctx: CanvasRenderingContext2D, look: HalloweenLook, lineWidth: number, pxPerWorld: number, fullPx: number = PUMPKIN_FULL_PX): void {
  const n = _qn; _qn = 0;
  if (n === 0 || look.pumpkinList === null) return;
  drawOtherListMany(ctx, look.pumpkinList, n, _q, lineWidth, hwFillOf, hwLineOf, pxPerWorld, fullPx);
}
export function hwQueueEye(eyes: EyeTable, o: number): void {
  const t = eyes.t;
  _queue(t[o + E_X], t[o + E_Y], t[o + E_UNIT], t[o + E_TURN], eyeAimOf(eyes, o));
}
export function hwFlushEyes(ctx: CanvasRenderingContext2D, eyes: EyeTable, lineWidth: number, pxPerWorld: number): void {
  const n = _qn; _qn = 0;
  const look = eyes.look;
  if (n === 0 || look === null || look.eyeList === null) return;
  _rgbFor(look);
  drawOtherListMany(ctx, look.eyeList, n, _q, lineWidth, _eyeFillOf, _eyeLineOf, pxPerWorld, 0);
}

export function hwDrawPumpkinGhost(ctx: CanvasRenderingContext2D, look: HalloweenLook, x: number, y: number, r: number, turn: number, lineWidth: number, alpha: number, pxPerWorld: number, muted: string | null): void {
  if (muted !== null) _muted = muted;
  _drawFaded(ctx, look.pumpkinList as OtherDrawList, look.pumpkinReach, x, y, r * 2, turn, turn, lineWidth, muted !== null ? _mutedFillOf : hwFillOf, hwLineOf, alpha, pxPerWorld);
}
const _ghostRow = new Float64Array(EYE_STRIDE);
export function hwDrawWallGhostEye(ctx: CanvasRenderingContext2D, logic: GameLogic, look: HalloweenLook, x: number, y: number, halfW: number, halfH: number, lineWidth: number): void {
  if (look.eyeList === null) return;
  const me = logic.mapEditor;
  placeEye(_ghostRow, 0, x, y, halfW, halfH, logic.state.mapConfig.seed | 0, look, me.ghostLookDx, me.ghostLookDy);
  const unit = _ghostRow[E_UNIT];
  if (unit === 0) return;
  const turn = _ghostRow[E_TURN];
  _rgbFor(look);
  drawOtherList(ctx, look.eyeList, _ghostRow[E_X], _ghostRow[E_Y], unit * 2, turn, turn + look.eyeList.rest, lineWidth, _eyeFillOf, _eyeLineOf);
}
export function hwPumpkinBodyPath(ctx: CanvasRenderingContext2D, look: HalloweenLook, r: number): void {
  const b = (look.pumpkin as OtherDesign).body as OtherPart; const R = b.radius * r;
  if (b.kind === 'polygon' && b.sides) {
    const n = b.sides;
    for (let i = 0; i < n; i++) { const a = b.turn + (i / n) * Math.PI * 2; if (i === 0) ctx.moveTo(R * Math.cos(a), R * Math.sin(a)); else ctx.lineTo(R * Math.cos(a), R * Math.sin(a)); }
    ctx.closePath();
    return;
  }
  ctx.moveTo(R, 0);
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.closePath();
}
