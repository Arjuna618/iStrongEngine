import type { GameLogic } from '../../game/GameLogic';
import { TEAM_COLORS_DARK, TEAM_COLORS_LIGHT } from '../../types';
import { isCustomMap, editPortals, cellCenterLocal, rockShapeFor, portalExitExists, findPlacedZone, findPlacedEntity } from '../../game/MapEditor';
import type { MapEditorKind } from '../../game/MapEditor';
import { selectionOutline, zoneDragRect, effectiveMapEditorTool, toolRockKind, dragHideInfo, areaRefById, toolDragBox, toolShapeOfBox, pickedShape, boxHandleAt, VTX_BOX, VTX_SIDE, VTX_MARQUEE } from '../../game/MapEditorInput';
import { zoneShapeOf } from '../../game/mapEvents/doc';
import { shapeBox, shapeCellPoints, tracePoly, type AreaShape } from '../../game/areaShape';
import { wallDefault } from '../../utils/gameColors';
import { getWallStroke, customAreaLook, customAreaFill, type CustomAreaLook } from '../../game/MapSystem';
import type { PlacedZone, MapConfig } from '../../types';
import { darkenColor } from '../../utils/p5Utils';
import { drawCanvasTooltip } from './canvasTooltip';
import { PORTAL_BODY_RADIUS } from '../../game/constants';
import { pumpkinTurn, rockTurn, type HalloweenLook } from '../../utils/halloween';
import { halloweenLook, hwDrawPumpkinGhost, hwDrawWallGhostEye, hwPumpkinBodyPath } from './halloweenLook';
import { BASE_AREAS, zoneBaseTeam } from '../../game/baseAreas';
const INK_DARK = '#fcfcfd';
const INK_LIGHT = '#171718';
const MUTED_DARK = '#a1a1a2';
const MUTED_LIGHT = '#737374';
export const GHOST_ALPHA = 0.6;

let _gpuMarks = false;
export function setMapEditorOverlayGpu(on: boolean): void { _gpuMarks = on; }
export function mapEditorHoverColor(logic: GameLogic, isDark: boolean): string {
  const me = logic.mapEditor;
  return (effectiveMapEditorTool(logic) === 'eraser' || me.eraseStrokeActive) ? (isDark ? INK_DARK : INK_LIGHT) : (isDark ? MUTED_DARK : MUTED_LIGHT);
}
export function mapEditorInk(isDark: boolean): string { return isDark ? INK_DARK : INK_LIGHT; }
export function mapEditorMuted(isDark: boolean): string { return isDark ? MUTED_DARK : MUTED_LIGHT; }
const LATTICE_ALPHA = 0.10;
const ZONE_FILL_ALPHA = 0.30;
const NEW_AREA: PlacedZone = { id: -1, gx: 0, gy: 0, cw: 1, ch: 1, team: 0, kind: 'cosmetic' };
const _ghostLook: CustomAreaLook = { color: '', colorMap: undefined, opacity: 0 };

const WALL_INSET = 1.5;

function strokeOuterHalf(
  ctx: CanvasRenderingContext2D,
  path: () => void,
  clipBounds: () => void,
  stroke: string, lineWidth: number
): void {
  ctx.save();
  ctx.beginPath();
  clipBounds();
  path();
  ctx.clip('evenodd');
  ctx.beginPath();
  path();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function fillStrokeNoOverlap(
  ctx: CanvasRenderingContext2D,
  path: () => void,
  clipBounds: () => void,
  fill: string, stroke: string, lineWidth: number
): void {
  strokeOuterHalf(ctx, path, clipBounds, stroke, lineWidth);
  ctx.beginPath();
  path();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawMapEditorOverlay(
  ctx: CanvasRenderingContext2D,
  logic: GameLogic,
  isDark: boolean,
  zoom: number,
  strokeWidth: number,
): void {
  if (!logic.isMapDesignerActive || logic.state.isTestMode) return;
  const me = logic.mapEditor;

  const ink = isDark ? INK_DARK : INK_LIGHT;
  const muted = isDark ? MUTED_DARK : MUTED_LIGHT;
  const teams = isDark ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;
  _hw = halloweenLook(logic);
  _hwZoom = zoom;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawPlacedPortals(ctx, logic, muted, strokeWidth);

  const tool = effectiveMapEditorTool(logic);

  if (tool !== 'none' || me.hasSelection) {
    drawCellLattice(ctx, logic, muted, zoom, tool);
    drawZoneDrag(ctx, logic, muted, isDark);
    drawFreeShape(ctx, logic, ink, muted, isDark, strokeWidth);
    const hoverColor = (tool === 'eraser' || me.eraseStrokeActive) ? ink : muted;
    drawHover(ctx, logic, hoverColor, strokeWidth);
    drawSelection(ctx, logic, ink, strokeWidth);
    if (tool !== 'none') drawGhost(ctx, logic, ink, muted, teams, strokeWidth, isDark);
  }

  ctx.restore();
}

function drawCellLattice(
  ctx: CanvasRenderingContext2D, logic: GameLogic, color: string, zoom: number,
  tool: string
): void {
  if (tool === 'none') return;

  const states = logic.areaStates.length > 0 ? logic.areaStates : null;
  const areas = states ? logic.state.multiAreaConfig.areas : null;
  const single = logic.mapState;
  const count = states ? (areas ? Math.min(states.length, areas.length) : states.length) : (single ? 1 : 0);
  if (count === 0) return;

  const halfW = (logic.width / 2) / zoom;
  const halfH = (logic.height / 2) / zoom;
  const left = logic.mapDesignerCamX - halfW;
  const right = logic.mapDesignerCamX + halfW;
  const top = logic.mapDesignerCamY - halfH;
  const bottom = logic.mapDesignerCamY + halfH;

  ctx.globalAlpha = LATTICE_ALPHA;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.5, 1 / zoom);
  ctx.beginPath();

  for (let i = 0; i < count; i++) {
    const st = states ? states[i] : single!;
    const cfg = areas ? areas[i].mapConfig : logic.state.mapConfig;
    if (!isCustomMap(cfg)) continue;
    const ox = areas ? areas[i].worldOffsetX : 0;
    const oy = areas ? areas[i].worldOffsetY : 0;
    const cs = st.cellSize, mh = st.mapHalf, gc = st.gridCells;
    const mhY = st.mapHalfY, gcY = st.gridCellsY;
    const gx0 = Math.max(0, Math.floor((left - ox + mh) / cs));
    const gx1 = Math.min(gc, Math.ceil((right - ox + mh) / cs));
    const gy0 = Math.max(0, Math.floor((top - oy + mhY) / cs));
    const gy1 = Math.min(gcY, Math.ceil((bottom - oy + mhY) / cs));
    if (gx1 < gx0 || gy1 < gy0) continue;
    const yTop = oy - mhY + gy0 * cs;
    const yBot = oy - mhY + gy1 * cs;
    const xLeft = ox - mh + gx0 * cs;
    const xRight = ox - mh + gx1 * cs;
    for (let g = gx0; g <= gx1; g++) {
      const x = ox - mh + g * cs;
      ctx.moveTo(x, yTop); ctx.lineTo(x, yBot);
    }
    for (let g = gy0; g <= gy1; g++) {
      const y = oy - mhY + g * cs;
      ctx.moveTo(xLeft, y); ctx.lineTo(xRight, y);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPlacedPortals(
  ctx: CanvasRenderingContext2D, logic: GameLogic,
  muted: string, strokeWidth: number
): void {
  const states = logic.areaStates.length > 0 ? logic.areaStates : null;
  const areas = states ? logic.state.multiAreaConfig.areas : null;
  const single = logic.mapState;
  const count = states ? (areas ? Math.min(states.length, areas.length) : states.length) : (single ? 1 : 0);
  const multi = logic.state.multiAreaConfig.enableMultiArea && (areas?.length ?? 0) > 1;
  if (!multi) return;

  for (let i = 0; i < count; i++) {
    const st = states ? states[i] : single!;
    const cfg = areas ? areas[i].mapConfig : logic.state.mapConfig;
    if (!isCustomMap(cfg)) continue;
    const portals = editPortals(cfg);
    if (portals.length === 0) continue;
    const ox = areas ? areas[i].worldOffsetX : 0;
    const oy = areas ? areas[i].worldOffsetY : 0;
    const cs = st.cellSize, mh = st.mapHalf, mhY = st.mapHalfY;

    for (let p = 0; p < portals.length; p++) {
      const pp = portals[p];
      if (hasDestination(cfg, pp.id, areas ?? [], areas ? areas[i].id : undefined)) continue;
      const x = cellCenterLocal(pp.gx, mh, cs) + ox;
      const y = cellCenterLocal(pp.gy, mhY, cs) + oy;
      ctx.beginPath();
      ctx.arc(x, y, PORTAL_BODY_RADIUS * 2.3, 0, Math.PI * 2);
      ctx.strokeStyle = muted;
      ctx.lineWidth = strokeWidth;
      ctx.setLineDash(WARN_DASH);
      ctx.stroke();
      ctx.setLineDash(EMPTY_DASH);
    }
  }
}

const EMPTY_DASH: number[] = [];
const WARN_DASH: number[] = [10, 10];

function hasDestination(cfg: MapConfig, id: number, areas: readonly { id: string; mapConfig: MapConfig }[], ownAreaId: string | undefined): boolean {
  const kinds = cfg.portalKinds;
  if (kinds) for (let i = 0; i < kinds.length; i++) {
    const k = kinds[i];
    if (k.portalId === id && k.kind === 'wormhole') return portalExitExists(k, cfg, areas, ownAreaId);
  }
  const links = cfg.portalLinks;
  if (!links) return false;
  for (let i = 0; i < links.length; i++) if (links[i].portalId === id) return true;
  return false;
}

function drawHover(
  ctx: CanvasRenderingContext2D, logic: GameLogic, color: string, strokeWidth: number
): void {
  const me = logic.mapEditor;
  if (!me.hasHover || me.dragActive) return;
  if (me.hoverKind === 'zone' && strokeShapeOf(ctx, logic, me.hoverAreaId, me.hoverId, color, strokeWidth)) return;
  highlightEntity(ctx, me.hoverKind, me.hoverX, me.hoverY, me.hoverW, me.hoverH, me.hoverR,
    me.hoverRotation, color, strokeWidth, me.hoverKind === 'rock' ? rockSidesAt(logic, me.hoverX, me.hoverY) : 9,
    me.hoverKind === 'rock' ? mapRockTurnAt(logic, me.hoverX, me.hoverY, me.hoverRotation) : 0);
}

function drawSelection(
  ctx: CanvasRenderingContext2D, logic: GameLogic, ink: string, strokeWidth: number
): void {
  const me = logic.mapEditor;
  if (!me.hasSelection || me.dragActive) return;
  const g = selectionOutline(logic);
  if (!g) return;
  if (g.kind === 'zone' && drawShapeHandles(ctx, logic, ink, strokeWidth, isDarkInk(ink))) return;
  highlightEntity(ctx, g.kind, g.x, g.y, g.w, g.h, g.r, g.rotation, ink, strokeWidth, g.kind === 'rock' ? rockSidesAt(logic, g.x, g.y) : 9,
    g.kind === 'rock' ? mapRockTurnAt(logic, g.x, g.y, g.rotation) : 0);
  if (g.kind === 'zone') drawZoneRectsAndHandles(ctx, logic, ink, strokeWidth);
}

function drawZoneRectsAndHandles(ctx: CanvasRenderingContext2D, logic: GameLogic, ink: string, strokeWidth: number): void {
  const me = logic.mapEditor;
  const ref = areaRefById(logic, me.selection.areaId);
  if (!ref) return;
  const z = findPlacedZone(ref.cfg, me.selection.id);
  if (!z) return;
  const st = ref.state;
  const cs = st.cellSize, ox = ref.offX - st.mapHalf, oy = ref.offY - st.mapHalfY;
  const hs = 5 * logic.dpr / logic.mapDesignerZoom;
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = strokeWidth;
  const n = z.more ? z.more.length : 0;
  for (let k = -1; k < n; k++) {
    const q = k < 0 ? z : z.more![k];
    const x = ox + q.gx * cs, y = oy + q.gy * cs, w = q.cw * cs, h = q.ch * cs;
    if (k >= 0) ctx.strokeRect(x, y, w, h);
    ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2);
    ctx.fillRect(x + w - hs, y - hs, hs * 2, hs * 2);
    ctx.fillRect(x - hs, y + h - hs, hs * 2, hs * 2);
    ctx.fillRect(x + w - hs, y + h - hs, hs * 2, hs * 2);
  }
}

export function mapObjectLabels(logic: GameLogic, texts: string[], xs: number[], ys: number[], under: number): number {
  const me = logic.mapEditor;
  let n = 0, firstKind = '', firstId = -1;
  const put = (kind: string, id: number, areaId: string, x: number, y: number, h: number, r: number): void => {
    if (kind === firstKind && id === firstId) return;
    const ref = areaRefById(logic, areaId);
    if (!ref) return;
    const name = kind === 'zone' ? findPlacedZone(ref.cfg, id)?.name : kind === 'entity' ? findPlacedEntity(ref.cfg, id)?.name : undefined;
    if (!name) return;
    texts[n] = name; xs[n] = x;
    ys[n] = kind === 'zone' ? y - h / 2 + under : y + r + under;
    if (n === 0) { firstKind = kind; firstId = id; }
    n++;
  };
  if (me.dragActive) return 0;
  if (me.hasSelection) { const g = selectionOutline(logic); if (g !== null) put(g.kind, me.selection.id, me.selection.areaId, g.x, g.y, g.h, g.r); }
  if (me.hasHover) put(me.hoverKind, me.hoverId, me.hoverAreaId, me.hoverX, me.hoverY, me.hoverH, me.hoverR);
  return n;
}

let _hw: HalloweenLook | null = null;
let _hwZoom = 1;

export function mapRockAt(logic: GameLogic, x: number, y: number): NonNullable<GameLogic['mapState']>['rocks'][number] | null {
  const rocks = logic.mapState ? logic.mapState.rocks : null;
  if (rocks === null) return null;
  for (let i = 0; i < rocks.length; i++) { const r = rocks[i]; if (r.active && Math.abs(r.x - x) < 1 && Math.abs(r.y - y) < 1) return r; }
  return null;
}
export function mapRockTurnAt(logic: GameLogic, x: number, y: number, rotation: number): number {
  const rock = mapRockAt(logic, x, y);
  return rock !== null ? rockTurn(rock) : pumpkinTurn(x, y, rotation);
}
function rockSidesAt(logic: GameLogic, x: number, y: number): number {
  const rock = mapRockAt(logic, x, y);
  return rock !== null ? Math.abs(rock.shape) : 9;
}

function highlightEntity(
  ctx: CanvasRenderingContext2D, kind: string,
  x: number, y: number, w: number, h: number, r: number, rotation: number,
  ink: string, strokeWidth: number, sides: number, pkTurn: number
): void {
  if (_gpuMarks && (kind === 'rock' || kind === 'wall')) return;
  ctx.strokeStyle = ink;
  ctx.lineWidth = strokeWidth;

  if (kind === 'rock') {
    const hw = _hw;
    if (hw !== null && hw.pumpkinList !== null) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(pkTurn);
      strokeOuterHalf(ctx,
        () => hwPumpkinBodyPath(ctx, hw, r),
        () => ctx.rect(-r * 2, -r * 2, r * 4, r * 4),
        ink, strokeWidth);
      ctx.restore();
      return;
    }
    if (sides < 3) return;
    ctx.save();
    ctx.translate(x, y);
    if (rotation !== 0) ctx.rotate(rotation);
    strokeOuterHalf(ctx,
      () => starPath(ctx, r, sides),
      () => ctx.rect(-r * 2, -r * 2, r * 4, r * 4),
      ink, strokeWidth);
    ctx.restore();
    return;
  }

  if (kind === 'wall') {
    const wx = x - w / 2 + WALL_INSET;
    const wy = y - h / 2 + WALL_INSET;
    const ww = w - WALL_INSET * 2;
    const wh = h - WALL_INSET * 2;
    const half = strokeWidth;
    strokeOuterHalf(ctx,
      () => ctx.rect(wx, wy, ww, wh),
      () => ctx.rect(wx - half * 2, wy - half * 2, ww + half * 4, wh + half * 4),
      ink, strokeWidth);
    return;
  }

  if (kind === 'portal' || kind === 'entity') {
    strokeOuterHalf(ctx,
      () => ctx.arc(x, y, r, 0, Math.PI * 2),
      () => ctx.rect(x - r * 3, y - r * 3, r * 6, r * 6),
      ink, strokeWidth);
    return;
  }

  const zx = x - w / 2, zy = y - h / 2;
  const pad = strokeWidth * 2;
  strokeOuterHalf(ctx,
    () => ctx.rect(zx, zy, w, h),
    () => ctx.rect(zx - pad, zy - pad, w + pad * 2, h + pad * 2),
    ink, strokeWidth);
}

function starPath(ctx: CanvasRenderingContext2D, r: number, sides: number): void {
  const dip = 1 - 6 / (sides * sides);
  ctx.moveTo(r, 0);
  for (let i = 0; i < sides; i++) {
    const halfAngle = ((i + 0.5) / sides) * Math.PI * 2;
    const nextAngle = ((i + 1) / sides) * Math.PI * 2;
    ctx.lineTo(r * dip * Math.cos(halfAngle), r * dip * Math.sin(halfAngle));
    ctx.lineTo(r * Math.cos(nextAngle), r * Math.sin(nextAngle));
  }
  ctx.closePath();
}

let _wgScr: HTMLCanvasElement | null = null, _wgCtx: CanvasRenderingContext2D | null = null;
function drawWallGhostWithEye(
  ctx: CanvasRenderingContext2D, logic: GameLogic, look: HalloweenLook,
  wx: number, wy: number, ww: number, wh: number, fill: string, stroke: string, strokeWidth: number,
  cx: number, cy: number, halfW: number, halfH: number,
): void {
  const z = logic.mapDesignerZoom;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const ox = W / 2 - logic.mapDesignerCamX * z, oy = H / 2 - logic.mapDesignerCamY * z;
  const x0 = Math.max(0, Math.floor((wx - strokeWidth) * z + ox) - 1);
  const y0 = Math.max(0, Math.floor((wy - strokeWidth) * z + oy) - 1);
  const x1 = Math.min(W, Math.ceil((wx + ww + strokeWidth) * z + ox) + 1);
  const y1 = Math.min(H, Math.ceil((wy + wh + strokeWidth) * z + oy) + 1);
  const pw = x1 - x0, ph = y1 - y0;
  if (pw <= 0 || ph <= 0) return;
  if (_wgScr === null) { _wgScr = document.createElement('canvas'); _wgScr.width = 256; _wgScr.height = 256; _wgCtx = _wgScr.getContext('2d'); }
  const s = _wgCtx;
  if (s === null) return;
  if (_wgScr.width < pw || _wgScr.height < ph) {
    _wgScr.width = Math.max(_wgScr.width, Math.ceil(pw / 256) * 256);
    _wgScr.height = Math.max(_wgScr.height, Math.ceil(ph / 256) * 256);
  }
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.clearRect(0, 0, _wgScr.width, _wgScr.height);
  s.setTransform(z, 0, 0, z, ox - x0, oy - y0);
  s.globalAlpha = 1;
  s.lineJoin = 'round';
  s.lineCap = 'round';
  const half = strokeWidth / 2;
  fillStrokeNoOverlap(s,
    () => s.rect(wx, wy, ww, wh),
    () => s.rect(wx - half * 2, wy - half * 2, ww + half * 4, wh + half * 4),
    fill, stroke, strokeWidth);
  hwDrawWallGhostEye(s, logic, look, cx, cy, halfW, halfH, strokeWidth);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(_wgScr, 0, 0, pw, ph, x0, y0, pw, ph);
  ctx.restore();
}

function drawGhost(
  ctx: CanvasRenderingContext2D, logic: GameLogic,
  ink: string, muted: string, teams: readonly string[], strokeWidth: number, isDark: boolean
): void {
  const me = logic.mapEditor;
  if (!me.hasGhost) return;
  if (_gpuMarks && (me.ghostKind === 'wall' || me.ghostKind === 'rock')) return;

  const valid = me.ghostValid;
  const body = wallDefault();
  const fill = valid ? body : muted;
  const stroke = valid ? getWallStroke(body) : darkenColor(muted, 0.598);
  ctx.globalAlpha = GHOST_ALPHA;
  GHOST_OF_KIND[me.ghostKind](ctx, logic, muted, teams, strokeWidth, isDark, valid, fill, stroke);
  ctx.globalAlpha = 1;
}

type GhostDraw = (ctx: CanvasRenderingContext2D, logic: GameLogic, muted: string, teams: readonly string[], strokeWidth: number, isDark: boolean, valid: boolean, fill: string, stroke: string) => void;
const GHOST_OF_KIND: Record<MapEditorKind, GhostDraw> = {
  wall(ctx, logic, _muted, _teams, strokeWidth, _isDark, valid, fill, stroke) {
    const me = logic.mapEditor;
    const wx = me.ghostX - me.ghostW / 2 + WALL_INSET;
    const wy = me.ghostY - me.ghostH / 2 + WALL_INSET;
    const ww = me.ghostW - WALL_INSET * 2;
    const wh = me.ghostH - WALL_INSET * 2;
    const half = strokeWidth / 2;
    if (valid && _hw !== null && _hw.eyeList !== null) {
      drawWallGhostWithEye(ctx, logic, _hw, wx, wy, ww, wh, fill, stroke, strokeWidth, me.ghostX, me.ghostY, me.ghostW / 2, me.ghostH / 2);
    } else {
      fillStrokeNoOverlap(ctx,
        () => ctx.rect(wx, wy, ww, wh),
        () => ctx.rect(wx - half * 2, wy - half * 2, ww + half * 4, wh + half * 4),
        fill, stroke, strokeWidth);
    }
  },
  rock(ctx, logic, muted, _teams, strokeWidth, _isDark, valid, fill, stroke) {
    const me = logic.mapEditor;
    if (_hw !== null && _hw.pumpkinList !== null) {
      ctx.globalAlpha = 1;
      hwDrawPumpkinGhost(ctx, _hw, me.ghostX, me.ghostY, me.ghostR, pumpkinTurn(me.ghostX + me.ghostLookDx, me.ghostY + me.ghostLookDy, me.ghostRot), strokeWidth, GHOST_ALPHA, _hwZoom, valid ? null : muted);
      return;
    }
    const r = me.ghostR;
    const dh = me.dragActive ? dragHideInfo(logic) : null;
    const dragged = dh !== null && dh.kind === 'rock' ? mapRockAt(logic, dh.x, dh.y) : null;
    const sides = dragged !== null ? Math.abs(dragged.shape) : Math.abs(rockShapeFor(toolRockKind(logic)));
    ctx.save();
    ctx.translate(me.ghostX, me.ghostY);
    if (me.ghostRot !== 0) ctx.rotate(me.ghostRot);
    fillStrokeNoOverlap(ctx,
      () => starPath(ctx, r, sides),
      () => ctx.rect(-r * 2, -r * 2, r * 4, r * 4),
      fill, stroke, strokeWidth);
    ctx.restore();
  },
  portal(ctx, logic, muted, _teams, strokeWidth, _isDark, valid) {
    const me = logic.mapEditor;
    if (!valid) {
      ctx.strokeStyle = muted;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.arc(me.ghostX, me.ghostY, me.ghostR, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  zone(ctx, logic, muted, teams, _strokeWidth, isDark, valid) {
    const me = logic.mapEditor;
    const z = me.ghostZone;
    const baseTeam = z === null ? -1 : BASE_AREAS.ON !== 0 ? zoneBaseTeam(z) : (!z.kind || z.kind === 'base') ? me.ghostTeam : -1;
    const base = baseTeam >= 0;
    const look = base ? null : customAreaLook(z ?? NEW_AREA, _ghostLook);
    ctx.globalAlpha = GHOST_ALPHA * (look ? look.opacity : ZONE_FILL_ALPHA);
    ctx.fillStyle = !valid ? muted : look ? customAreaFill(look, isDark) : (teams[baseTeam] ?? teams[0]);
    const zsh = z !== null ? zoneShapeOf(z) : null;
    if (zsh !== null && z!.cw > 0) {
      const cs = me.ghostW / z!.cw;
      ctx.beginPath();
      tracePoly(ctx, shapeCellPoints(zsh), me.ghostX - me.ghostW / 2 - z!.gx * cs, me.ghostY - me.ghostH / 2 - z!.gy * cs, cs);
      ctx.fill();
      return;
    }
    ctx.fillRect(me.ghostX - me.ghostW / 2, me.ghostY - me.ghostH / 2, me.ghostW, me.ghostH);
    if (z !== null && z.more && z.cw > 0) {
      const cs = me.ghostW / z.cw;
      for (let i = 0; i < z.more.length; i++) {
        const m = z.more[i];
        ctx.fillRect(me.ghostX - me.ghostW / 2 + (m.gx - z.gx) * cs, me.ghostY - me.ghostH / 2 + (m.gy - z.gy) * cs, m.cw * cs, m.ch * cs);
      }
    }
  },
  entity(ctx, logic, muted, _teams, strokeWidth, _isDark, valid) {
    if (valid) return;
    const me = logic.mapEditor;
    ctx.strokeStyle = muted;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.arc(me.ghostX, me.ghostY, me.ghostR, 0, Math.PI * 2);
    ctx.stroke();
  },
};

function drawZoneDrag(
  ctx: CanvasRenderingContext2D, logic: GameLogic, muted: string, isDark: boolean
): void {
  const me = logic.mapEditor;
  if (!me.zoneDragActive) return;
  if (me.zoneDragShaped) {
    const r = areaRefById(logic, me.zoneDragAreaId);
    if (!r) return;
    const look = customAreaLook(NEW_AREA, _ghostLook);
    ctx.globalAlpha = GHOST_ALPHA * look.opacity;
    ctx.fillStyle = me.zoneDragValid ? customAreaFill(look, isDark) : muted;
    ctx.beginPath();
    tracePoly(ctx, shapeCellPoints(toolShapeOfBox(me, toolDragBox(me))), r.offX - r.state.mapHalf, r.offY - r.state.mapHalfY, r.state.cellSize);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const ref = zoneDragRect(logic);
  if (!ref) return;
  const look = customAreaLook(NEW_AREA, _ghostLook);
  const fill = me.zoneDragValid ? customAreaFill(look, isDark) : muted;
  ctx.globalAlpha = GHOST_ALPHA * look.opacity;
  ctx.fillStyle = fill;
  ctx.fillRect(ref.x, ref.y, ref.w, ref.h);
  ctx.globalAlpha = 1;
}

export function drawMapEditorHint(
  ctx: CanvasRenderingContext2D, logic: GameLogic, width: number, isDark: boolean
): void {
  if (!logic.isMapDesignerActive || logic.state.isTestMode) return;
  const me = logic.mapEditor;
  if (me.tool !== 'zone' || me.zoneDragActive || (!me.hasGhost && !me.freeActive)) return;
  const visibleRight = width - 320 * logic.dpr * logic.chromeScale;
  const visibleLeft = 64 * logic.dpr * logic.chromeScale;
  const hint = me.zoneAddTo >= 0 || me.zoneShape === 'rect' ? 'Press and drag to draw a custom area'
    : me.zoneShape === 'free' ? (me.freeActive ? 'Click to add a point. Click the first point or press Enter to finish' : 'Click to place the first point of the shape')
    : 'Press and drag to draw. Shift keeps it even, Alt draws it from its middle';
  drawCanvasTooltip(ctx, hint,
    logic.mouseX, logic.mouseY - 14 * logic.dpr, visibleRight, logic.chromeScale, isDark, visibleLeft);
}

const isDarkInk = (ink: string): boolean => ink === INK_DARK;
function handle(ctx: CanvasRenderingContext2D, x: number, y: number, hs: number, ink: string, paper: string, on: boolean, lw: number): void {
  ctx.fillStyle = on ? ink : paper;
  ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2);
  ctx.strokeStyle = ink; ctx.lineWidth = lw;
  ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2);
}
function strokeShapeOf(ctx: CanvasRenderingContext2D, logic: GameLogic, areaId: string, id: number, ink: string, strokeWidth: number): boolean {
  const ref = areaRefById(logic, areaId);
  const z = ref ? findPlacedZone(ref.cfg, id) : null;
  const sh = z ? zoneShapeOf(z) : null;
  if (!ref || sh === null) return false;
  ctx.strokeStyle = ink; ctx.lineWidth = strokeWidth;
  ctx.beginPath(); tracePoly(ctx, shapeCellPoints(sh), ref.offX - ref.state.mapHalf, ref.offY - ref.state.mapHalfY, ref.state.cellSize); ctx.stroke();
  return true;
}
const _shBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
const _shPt = { x: 0, y: 0 };
function drawShapeHandles(ctx: CanvasRenderingContext2D, logic: GameLogic, ink: string, strokeWidth: number, dark: boolean): boolean {
  const me = logic.mapEditor;
  const ps = pickedShape(logic, null);
  if (ps === null) return false;
  const sh: AreaShape = me.vtxShape ?? ps.sh;
  const st = ps.ref.state, cs = st.cellSize, ox = ps.ref.offX - st.mapHalf, oy = ps.ref.offY - st.mapHalfY;
  const paper = dark ? '#111112' : '#fffffe';
  const hs = 4.5 * logic.dpr / logic.mapDesignerZoom, lw = Math.max(strokeWidth * 0.5, logic.dpr / logic.mapDesignerZoom);
  const pts = shapeCellPoints(sh);
  if (me.vtxShape !== null) {
    const look = customAreaLook(ps.z, _ghostLook);
    ctx.globalAlpha = GHOST_ALPHA * Math.max(0.15, look.opacity);
    ctx.fillStyle = customAreaFill(look, dark);
    ctx.beginPath(); tracePoly(ctx, pts, ox, oy, cs); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = ink; ctx.lineWidth = strokeWidth;
  ctx.beginPath(); tracePoly(ctx, pts, ox, oy, cs); ctx.stroke();
  if (me.vtxMode && sh.k === 'poly') {
    const p = sh.pts!, n = p.length >> 1;
    const side = me.vtxDrag >= VTX_SIDE && me.vtxDrag < VTX_MARQUEE ? -1 : me.vtxDrag === -1 ? me.vtxEdge : -1;
    if (side >= 0 && side < n) {
      const j = (side + 1) % n;
      ctx.strokeStyle = ink; ctx.lineWidth = strokeWidth * 2.2;
      ctx.beginPath(); ctx.moveTo(ox + p[side * 2] * cs, oy + p[side * 2 + 1] * cs); ctx.lineTo(ox + p[j * 2] * cs, oy + p[j * 2 + 1] * cs); ctx.stroke();
    }
    for (let i = 0; i < n; i++) handle(ctx, ox + p[i * 2] * cs, oy + p[i * 2 + 1] * cs, hs, ink, paper, me.vtxSels.includes(i) || i === me.vtxHover, lw);
    if (me.vtxEdge >= 0 && me.vtxDrag === -1) {
      ctx.beginPath(); ctx.arc(ox + me.vtxEdgeX * cs, oy + me.vtxEdgeY * cs, hs * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = paper; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke();
    }
    if (me.vtxDrag === VTX_MARQUEE && me.vtxMoved) {
      ctx.save();
      ctx.globalAlpha = 0.08; ctx.fillStyle = ink;
      const bx = ox + Math.min(me.vtxStartX, me.vtxCurX) * cs, by = oy + Math.min(me.vtxStartY, me.vtxCurY) * cs, bw = Math.abs(me.vtxCurX - me.vtxStartX) * cs, bh = Math.abs(me.vtxCurY - me.vtxStartY) * cs;
      ctx.fillRect(bx, by, bw, bh);
      ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = lw;
      ctx.setLineDash([4 * logic.dpr / logic.mapDesignerZoom, 4 * logic.dpr / logic.mapDesignerZoom]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    }
    return true;
  }
  shapeBox(sh, _shBox);
  ctx.lineWidth = lw; ctx.strokeStyle = ink;
  ctx.setLineDash([4 * logic.dpr / logic.mapDesignerZoom, 4 * logic.dpr / logic.mapDesignerZoom]);
  ctx.strokeRect(ox + _shBox.x0 * cs, oy + _shBox.y0 * cs, (_shBox.x1 - _shBox.x0) * cs, (_shBox.y1 - _shBox.y0) * cs);
  ctx.setLineDash([]);
  for (let k = 0; k < 8; k++) { boxHandleAt(_shBox, k, _shPt); handle(ctx, ox + _shPt.x * cs, oy + _shPt.y * cs, hs, ink, paper, me.vtxHover === VTX_BOX + k || me.vtxDrag === VTX_BOX + k, lw); }
  return true;
}
function drawFreeShape(ctx: CanvasRenderingContext2D, logic: GameLogic, ink: string, muted: string, dark: boolean, strokeWidth: number): void {
  const me = logic.mapEditor;
  if (!me.freeActive || me.freePts.length < 2) return;
  const ref = areaRefById(logic, me.freeAreaId);
  if (!ref) return;
  const st = ref.state, cs = st.cellSize, ox = ref.offX - st.mapHalf, oy = ref.offY - st.mapHalfY;
  const p = me.freePts, n = p.length >> 1;
  const look = customAreaLook(NEW_AREA, _ghostLook);
  if (n >= 2) {
    ctx.globalAlpha = GHOST_ALPHA * look.opacity;
    ctx.fillStyle = customAreaFill(look, dark);
    ctx.beginPath();
    ctx.moveTo(ox + p[0] * cs, oy + p[1] * cs);
    for (let i = 1; i < n; i++) ctx.lineTo(ox + p[i * 2] * cs, oy + p[i * 2 + 1] * cs);
    ctx.lineTo(ox + me.freeX * cs, oy + me.freeY * cs);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = ink; ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  ctx.moveTo(ox + p[0] * cs, oy + p[1] * cs);
  for (let i = 1; i < n; i++) ctx.lineTo(ox + p[i * 2] * cs, oy + p[i * 2 + 1] * cs);
  ctx.stroke();
  ctx.strokeStyle = muted;
  ctx.beginPath(); ctx.moveTo(ox + p[p.length - 2] * cs, oy + p[p.length - 1] * cs); ctx.lineTo(ox + me.freeX * cs, oy + me.freeY * cs); ctx.stroke();
  const paper = dark ? '#111112' : '#fffffe';
  const hs = 4.5 * logic.dpr / logic.mapDesignerZoom, lw = Math.max(strokeWidth * 0.5, logic.dpr / logic.mapDesignerZoom);
  const reach = 9 * logic.dpr / logic.mapDesignerZoom / cs;
  const closing = n >= 3 && Math.abs(me.freeX - p[0]) <= reach && Math.abs(me.freeY - p[1]) <= reach;
  for (let i = 0; i < n; i++) handle(ctx, ox + p[i * 2] * cs, oy + p[i * 2 + 1] * cs, i === 0 ? hs * 1.3 : hs, ink, paper, i === 0 && closing, lw);
}
