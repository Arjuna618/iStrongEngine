import type { GameLogic } from '../../game/GameLogic';
import { mapEditorInk } from './mapEditorOverlay';
import { drawCanvasTooltip } from './canvasTooltip';
import { collectPartHits, PART_HIT_STRIDE, PART_HITS_MAX } from '../../utils/partHits';
import { flattenLayerPath, pathOfLayerShape } from '../../utils/layerPath';
import { layerOutlineOf, layerSolidOf } from '../../utils/layerOutline';
import { solidStill, solidStillOutline } from '../../utils/solidArras';
import { tankSizeFromSlider } from '../../game/GameLogic';

const PAPER_DARK = '#111112';
const PAPER_LIGHT = '#fffffe';
let _dashDpr = -1;
let _dash: number[] = [];
const _noDash: number[] = [];

export function drawCanvasGesture(ctx: CanvasRenderingContext2D, logic: GameLogic, width: number, height: number, dark: boolean): void {
  if (logic.state.isTestMode || (!logic.ceActive() && !logic.ceSubActive())) return;
  drawShapeEdit(ctx, logic, width, height, dark);
  if (logic.showHitAreas) drawHitAreas(ctx, logic, width, height, dark);
  const b = logic.ceBox();
  const ce = logic.ce;
  const guides = ce.phase === 2 && (ce.guideX === ce.guideX || ce.guideY === ce.guideY || ce.guideR === ce.guideR);
  const box = b.ok && b.kind !== 'body';
  if (!box && !guides && !(ce.phase === 2 && ce.label !== '')) return;
  const dpr = logic.dpr || 1;
  const z = logic.zoom;
  const ox = width / 2 + (logic.tankPos.x - logic.cameraX) * z, oy = height / 2 + (logic.tankPos.y - logic.cameraY) * z;
  const ink = mapEditorInk(dark), paper = dark ? PAPER_DARK : PAPER_LIGHT;
  const lw = Math.max(1, dpr);
  ctx.save();
  ctx.lineWidth = lw;
  if (guides) {
    if (_dashDpr !== dpr) { _dashDpr = dpr; _dash = [4 * dpr, 4 * dpr]; }
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash(_dash);
    ctx.beginPath();
    if (ce.guideX === ce.guideX) { const x = Math.round(ox + ce.guideX * z) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    if (ce.guideY === ce.guideY) { const y = Math.round(oy + ce.guideY * z) + 0.5; ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
    if (ce.guideR === ce.guideR) { ctx.beginPath(); ctx.arc(ox, oy, ce.guideR * z, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash(_noDash);
    ctx.globalAlpha = 1;
  }
  if (box) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    const cx = ox + b.cx * z, cy = oy + b.cy * z, hw = b.hw * z, hh = b.hh * z;
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(cx + c * hw - s * hh, cy + s * hw + c * hh);
    ctx.lineTo(cx - c * hw - s * hh, cy - s * hw + c * hh);
    ctx.lineTo(cx - c * hw + s * hh, cy - s * hw - c * hh);
    ctx.lineTo(cx + c * hw + s * hh, cy + s * hw - c * hh);
    ctx.closePath();
    for (let i = 0; i < b.n; i++) if (b.hk[i] === 3) { ctx.moveTo(ox + b.turnFromX * z, oy + b.turnFromY * z); ctx.lineTo(ox + b.hx[i] * z, oy + b.hy[i] * z); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    const hs = 4 * dpr;
    const held = ce.phase === 2 ? ce.mode : '';
    for (let i = 0; i < b.n; i++) {
      const x = ox + b.hx[i] * z, y = oy + b.hy[i] * z, k = b.hk[i];
      const on = held !== '' && held !== 'move' && ((k <= 2 && held === 'size') || (k === 3 && held === 'turn') || (k === 4 && held === 'length')
        || (k === 5 && held === 'width') || (k === 6 && held === 'aspect') || (k === 7 && held === 'base') || (k === 8 && held === 'look'));
      ctx.fillStyle = on ? ink : paper;
      ctx.strokeStyle = ink;
      if (k === 3) {
        ctx.beginPath(); ctx.arc(x, y, hs, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2);
        ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2);
      }
    }
  }
  ctx.restore();
  if (ce.phase === 2 && ce.label !== '') {
    const visibleRight = width - 320 * dpr * logic.chromeScale, visibleLeft = 64 * dpr * logic.chromeScale;
    drawCanvasTooltip(ctx, ce.label, logic.mouseX, logic.mouseY - 18 * dpr, visibleRight, logic.chromeScale, dark, visibleLeft);
  }
}

const _sf = { frameA: 0, frameS: 1, frameX: 0, frameY: 0 };
let _ox = 0, _oy = 0, _z = 1, _c = 1, _s = 0;
function frameTo(ox: number, oy: number, z: number, turn: number): void { _ox = ox; _oy = oy; _z = z; _c = Math.cos(_sf.frameA + turn); _s = Math.sin(_sf.frameA + turn); }
const SX = (u: number, v: number): number => _ox + (_sf.frameX + (u * _c - v * _s) * _sf.frameS) * _z;
const SY = (u: number, v: number): number => _oy + (_sf.frameY + (u * _s + v * _c) * _sf.frameS) * _z;
function tracePath(ctx: CanvasRenderingContext2D, p: readonly (readonly number[])[], ox: number, oy: number, z: number, turn: number): void {
  frameTo(ox, oy, z, turn);
  const X = SX, Y = SY;
  const n = p.length;
  ctx.moveTo(X(p[0][0], p[0][1]), Y(p[0][0], p[0][1]));
  for (let i = 0; i < n; i++) {
    const q = p[i], r = p[(i + 1) % n];
    if (q[4] === 0 && q[5] === 0 && r[2] === 0 && r[3] === 0) ctx.lineTo(X(r[0], r[1]), Y(r[0], r[1]));
    else ctx.bezierCurveTo(X(q[0] + q[4], q[1] + q[5]), Y(q[0] + q[4], q[1] + q[5]), X(r[0] + r[2], r[1] + r[3]), Y(r[0] + r[2], r[1] + r[3]), X(r[0], r[1]), Y(r[0], r[1]));
  }
  ctx.closePath();
}
function drawShapeEdit(ctx: CanvasRenderingContext2D, logic: GameLogic, width: number, height: number, dark: boolean): void {
  const pen = logic.pen.on, ce = logic.ce;
  const stretching = ce.phase === 2 && ce.mode === 'stretch' && logic.pe.path !== null;
  const peL = logic.pointEditLayer();
  if (!pen && !peL && !stretching) return;
  const dpr = logic.dpr || 1, z = logic.zoom;
  const ox = width / 2 + (logic.tankPos.x - logic.cameraX) * z, oy = height / 2 + (logic.tankPos.y - logic.cameraY) * z;
  const ink = mapEditorInk(dark), paper = dark ? PAPER_DARK : PAPER_LIGHT, hs = 4 * dpr;
  ctx.save();
  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeStyle = ink;
  if (pen) {
    const P = logic.pen.pts, n = P.length / 6;
    if (n > 0) {
      ctx.beginPath();
      ctx.moveTo(ox + P[0] * z, oy + P[1] * z);
      for (let i = 1; i < n; i++) {
        const a = (i - 1) * 6, b = i * 6;
        if (P[a + 4] === 0 && P[a + 5] === 0 && P[b + 2] === 0 && P[b + 3] === 0) ctx.lineTo(ox + P[b] * z, oy + P[b + 1] * z);
        else ctx.bezierCurveTo(ox + (P[a] + P[a + 4]) * z, oy + (P[a + 1] + P[a + 5]) * z, ox + (P[b] + P[b + 2]) * z, oy + (P[b + 1] + P[b + 3]) * z, ox + P[b] * z, oy + P[b + 1] * z);
      }
      ctx.stroke();
      if (!logic.pen.held) {
        const mx = logic.mouseX, my = logic.mouseY, j = (n - 1) * 6;
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(ox + P[j] * z, oy + P[j + 1] * z); ctx.lineTo(mx, my); ctx.stroke(); ctx.globalAlpha = 1;
        if (n >= 3 && Math.hypot(mx - (ox + P[0] * z), my - (oy + P[1] * z)) <= 8 * dpr) { ctx.beginPath(); ctx.arc(ox + P[0] * z, oy + P[1] * z, hs * 2.2, 0, Math.PI * 2); ctx.stroke(); }
      }
      const j = (n - 1) * 6;
      if (P[j + 4] !== 0 || P[j + 5] !== 0) {
        ctx.beginPath(); ctx.moveTo(ox + (P[j] + P[j + 2]) * z, oy + (P[j + 1] + P[j + 3]) * z); ctx.lineTo(ox + (P[j] + P[j + 4]) * z, oy + (P[j + 1] + P[j + 5]) * z); ctx.stroke();
        for (let k = 2; k <= 4; k += 2) { ctx.beginPath(); ctx.arc(ox + (P[j] + P[j + k]) * z, oy + (P[j + 1] + P[j + k + 1]) * z, hs * 0.8, 0, Math.PI * 2); ctx.fillStyle = paper; ctx.fill(); ctx.stroke(); }
      }
      for (let i = 0; i < n; i++) { const x = ox + P[i * 6] * z, y = oy + P[i * 6 + 1] * z; ctx.fillStyle = i === n - 1 ? ink : paper; ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2); ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2); }
    }
    ctx.restore();
    return;
  }
  let L = peL;
  if (!L && stretching) { const id = ce.id; for (const l of logic.state.bodyLayers) if (l.id === id) { L = l; break; } }
  const path = L ? (logic.pe.path ?? logic.layerPathOf(L)) : null;
  if (!L || !path || path.length < 3) { ctx.restore(); return; }
  logic.shapeFrameOf(L, _sf);
  const copies = L.copies > 1 ? L.copies : 1;
  for (let k = copies - 1; k >= 0; k--) {
    ctx.globalAlpha = k === 0 ? 0.9 : 0.35;
    ctx.beginPath(); tracePath(ctx, path, ox, oy, z, (Math.PI * 2 * k) / copies); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (!peL) { ctx.restore(); return; }
  frameTo(ox, oy, z, 0);
  const sx = SX, sy = SY;
  const pk = logic.pe.pick;
  if (pk >= 0 && pk < path.length) {
    const q = path[pk];
    for (let k = 2; k <= 4; k += 2) {
      if (q[k] === 0 && q[k + 1] === 0) continue;
      const hx = sx(q[0] + q[k], q[1] + q[k + 1]), hy = sy(q[0] + q[k], q[1] + q[k + 1]);
      ctx.beginPath(); ctx.moveTo(sx(q[0], q[1]), sy(q[0], q[1])); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, hs * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = (logic.pe.part === 1 && k === 2) || (logic.pe.part === 2 && k === 4) ? ink : paper; ctx.fill(); ctx.stroke();
    }
  }
  for (let i = 0; i < path.length; i++) {
    const q = path[i], x = sx(q[0], q[1]), y = sy(q[0], q[1]);
    const round = q[2] !== 0 || q[3] !== 0 || q[4] !== 0 || q[5] !== 0;
    ctx.fillStyle = i === pk && logic.pe.part === 0 ? ink : paper;
    if (round) { ctx.beginPath(); ctx.arc(x, y, hs, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else { ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2); ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2); }
  }
  ctx.restore();
}

const _hb = new Float64Array(PART_HIT_STRIDE * PART_HITS_MAX);
const _shapeOf = new WeakMap<object, { sides: number; depth: number; curved: boolean; pts: [number, number][] }>();
function plainShapeOf(L: GameLogic['state']['bodyLayers'][number]): [number, number][] {
  let r = _shapeOf.get(L);
  if (r === undefined || r.sides !== L.sides || r.depth !== L.starDepth || r.curved !== L.starCurved) {
    const pts = flattenLayerPath(pathOfLayerShape(L));
    if (r === undefined) { r = { sides: L.sides, depth: L.starDepth, curved: L.starCurved, pts }; _shapeOf.set(L, r); }
    else { r.sides = L.sides; r.depth = L.starDepth; r.curved = L.starCurved; r.pts = pts; }
  }
  return r.pts;
}
let _hDashDpr = -1, _hDash: number[] = [];
function drawHitAreas(ctx: CanvasRenderingContext2D, logic: GameLogic, width: number, height: number, dark: boolean): void {
  const only = logic.state.activeBodyLayerId;
  if (only === null) return;
  drawPartHitAreasAt(ctx, logic.state.bodyLayers, tankSizeFromSlider(logic.state.tankSize), logic.tankAngle, logic.tankPos.x, logic.tankPos.y, logic, width, height, dark,
    logic.partHides.size > 0 ? logic.partHides : null, only);
}
export function drawMatchHitAreas(ctx: CanvasRenderingContext2D, logic: GameLogic, width: number, height: number, dark: boolean): void {
  if (!logic.tankDying) drawPartHitAreasAt(ctx, logic.state.bodyLayers, tankSizeFromSlider(logic.state.tankSize) * logic.state.playerGrowthScale,
    logic.tankAngle, logic.tankPos.x, logic.tankPos.y, logic, width, height, dark);
  const es = logic.state.enemyTanks;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (!e.active || e.isDying || !e.bodyLayers || e.bodyLayers.length === 0) continue;
    drawPartHitAreasAt(ctx, e.bodyLayers, e.size, e.angle, e.position.x, e.position.y, logic, width, height, dark);
  }
}
function drawPartHitAreasAt(ctx: CanvasRenderingContext2D, layers: GameLogic['state']['bodyLayers'], sizePx: number, angle: number, wx: number, wy: number,
  logic: GameLogic, width: number, height: number, dark: boolean, hidden: ReadonlySet<string> | null = null, only: string | null = null): void {
  const n = collectPartHits(layers, sizePx, angle, _hb);
  if (n === 0) return;
  const dpr = logic.dpr || 1, z = logic.zoom;
  const ox = width / 2 + (wx - logic.cameraX) * z, oy = height / 2 + (wy - logic.cameraY) * z;
  if (_hDashDpr !== dpr) { _hDashDpr = dpr; _hDash = [6 * dpr, 4 * dpr]; }
  ctx.save();
  ctx.strokeStyle = mapEditorInk(dark); ctx.lineWidth = Math.max(1, 1.5 * dpr); ctx.setLineDash(_hDash); ctx.globalAlpha = 0.8;
  for (let k = 0; k < n; k++) {
    if (hidden !== null && hidden.has(layers[_hb[k * PART_HIT_STRIDE + 1]].id)) continue;
    if (only !== null && layers[_hb[k * PART_HIT_STRIDE + 1]].id !== only) continue;
    const o = k * PART_HIT_STRIDE, cx = ox + _hb[o + 2] * z, cy = oy + _hb[o + 3] * z;
    ctx.beginPath();
    if (_hb[o] === 1) ctx.arc(cx, cy, _hb[o + 4] * z, 0, Math.PI * 2);
    else {
      const L = layers[_hb[o + 1]];
      const sl = layerSolidOf(L);
      const pts = sl !== null ? solidStillOutline(sl) : layerOutlineOf(L) ?? plainShapeOf(L);
      const r = (sizePx / 2) * L.sizeRatio * _hb[o + 7] * z, copies = L.copies > 1 ? L.copies : 1;
      for (let cI = 0; cI < copies; cI++) {
        const a = _hb[o + 5] + (L.initialAngle || 0) + (Math.PI * 2 * cI) / copies, c = Math.cos(a), s = Math.sin(a);
        if (pts !== null) {
          for (let i = 0; i < pts.length; i++) { const x = cx + (pts[i][0] * c - pts[i][1] * s) * r, y = cy + (pts[i][0] * s + pts[i][1] * c) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.closePath();
        } else if (sl !== null) {
          const v = solidStill(sl), q = v.xy;
          for (let f = 0; f < v.faceCount; f++) {
            const at = v.faceAt[f];
            for (let i = 0; i < v.faceLen[f]; i++) { const px = q[(at + i) * 2], py = q[(at + i) * 2 + 1], x = cx + (px * c - py * s) * r, y = cy + (px * s + py * c) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.closePath();
          }
        }
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

const _RESIZE = ['var(--cur-resize-ew)', 'var(--cur-resize-nwse)', 'var(--cur-resize-ns)', 'var(--cur-resize-nesw)'];
function handleCursor(logic: GameLogic, h: number): string {
  const b = logic.ceBoxOut;
  if (b.hk[h] === 3) return 'var(--cur-rotate)';
  let a = Math.atan2(b.hy[h] - b.cy, b.hx[h] - b.cx);
  if (a < 0) a += Math.PI;
  return _RESIZE[Math.round(a / (Math.PI / 4)) % 4];
}

let _cx = NaN, _cy = NaN, _cz = NaN, _cT: string | null = null, _cS: string | null = null, _cL: string | null = null, _cP = false, _cWas = '';
export function canvasGestureCursor(logic: GameLogic): string {
  const sub = logic.ceSubActive();
  if (logic.state.isTestMode || (!sub && (!logic.ceActive() || logic.cePlacing()))) return '';
  if (logic.pen.on) return 'var(--cur-crosshair)';
  if (logic.ce.phase === 2) return logic.ce.mode === 'move' ? 'var(--cur-grabbing)' : _cWas !== '' && _cWas !== 'var(--cur-move)' ? _cWas : 'var(--cur-crosshair)';
  const s = logic.state;
  if (logic.mouseX === _cx && logic.mouseY === _cy && logic.zoom === _cz && s.selectedTurretId === _cT && s.autoSubTurretSelectedId === _cS
      && s.activeBodyLayerId === _cL && logic.partPicked === _cP) return _cWas;
  _cx = logic.mouseX; _cy = logic.mouseY; _cz = logic.zoom; _cT = s.selectedTurretId; _cS = s.autoSubTurretSelectedId; _cL = s.activeBodyLayerId; _cP = logic.partPicked;
  const h = logic.ceHandleAt();
  _cWas = h >= 0 ? handleCursor(logic, h) : logic.ceOverPick() ? 'var(--cur-move)' : '';
  return _cWas;
}
