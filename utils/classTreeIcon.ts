import type { TankConfig, Turret, BodyLayer, PlacedLook } from '../types';
import { getRealSizeFactor } from './p5Utils';
import { bodyColorIn, bodyFillIn, turretFillIn, healerCrossFillIn } from './gameColors';
import { cmMapOf } from './colorMap';
import { lookList, lookUnit } from './placedLook';
import { outlineFansFromMiddle, cleanOutline } from './halloween';
import { outlineFillTriangles } from './outlineFill';
import { layerOutlineOf } from './layerOutline';
import { layerColourOf, LAYER_BODY, LAYER_TEAM } from '../game/teamColourSwitch';
import { autoBaseDepth, autoBaseTurn } from './autoBaseShape';
import {
  GRID_SPACING, HEALER_CROSS_SCALE, mapVal,
  sortTurretsByLayer, bodyLayerCmp, buildTurretLayerFlags, getTurretOnLayer, getTurretLayerOrder,
} from '../components/shared/tankIconRenderer';
import { computeCircumcircle } from '../components/TankPreview';

export const CT_ICON_FACING = -Math.PI / 4;

export const CT_MESH_BARREL = 0;
export const CT_MESH_CIRCLE = 1;
export const CT_MESH_POLY0 = 2;
export const CT_MESH_POLY_MAX_SIDES = 16;
export const CT_MESH_CROSS = 16;
export const CT_MESH_STAR0 = 17;
export const ctStarMeshes: { sides: number; depth: number; curved: boolean; outline?: [number, number][]; line?: boolean }[] = [];
const _starIds = new Map<string, number>();

export function ctOutlineMesh(pts: [number, number][]): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < pts.length; i++) { h = Math.imul(h ^ Math.round(pts[i][0] * 4096), 16777619) >>> 0; h = Math.imul(h ^ Math.round(pts[i][1] * 4096), 16777619) >>> 0; }
  const key = 'o' + pts.length + '_' + h.toString(36);
  let id = _starIds.get(key);
  if (id === undefined) { id = CT_MESH_STAR0 + ctStarMeshes.length; ctStarMeshes.push({ sides: 0, depth: 0, curved: false, outline: pts }); _starIds.set(key, id); }
  return id;
}
export function ctLineMesh(): number {
  let id = _starIds.get('line');
  if (id === undefined) { id = CT_MESH_STAR0 + ctStarMeshes.length; ctStarMeshes.push({ sides: 0, depth: 0, curved: false, line: true }); _starIds.set('line', id); }
  return id;
}

export function ctStarMesh(sides: number, depth: number, curved: boolean): number {
  const q = Math.round(depth * 100);
  const key = (curved ? 'c' : 's') + sides + '_' + q;
  let id = _starIds.get(key);
  if (id === undefined) {
    id = CT_MESH_STAR0 + ctStarMeshes.length;
    ctStarMeshes.push({ sides, depth: q / 100, curved });
    _starIds.set(key, id);
  }
  return id;
}

export function polyMesh(sides: number): number {
  return sides >= 3 && sides <= CT_MESH_POLY_MAX_SIDES ? CT_MESH_POLY0 + sides - 3 : CT_MESH_CIRCLE;
}

export function ctLookMesh(p: { kind: string; sides?: number; inner?: number; points?: [number, number][] }): number {
  if (p.kind === 'circle') return CT_MESH_CIRCLE;
  if (p.kind === 'polygon') return polyMesh(p.sides as number);
  if (p.kind === 'star') return ctStarMesh(p.sides as number, 1 - (p.inner as number), false);
  if (p.kind === 'line') return ctLineMesh();
  if (p.kind === 'outline') {
    const pts = cleanOutline(p.points as [number, number][]);
    if (outlineFansFromMiddle(pts) || outlineFillTriangles(pts) !== null) return ctOutlineMesh(pts);
  }
  return -1;
}

export const CT_PART_STRIDE = 10;

function mapBody(c: string, dark: boolean): string { return bodyColorIn(c, dark); }
const _rgb = new Map<string, [number, number, number]>();
function rgbOf(hex: string): [number, number, number] {
  let v = _rgb.get(hex);
  if (!v) {
    let c = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    const n = parseInt(c, 16) || 0;
    v = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    _rgb.set(hex, v);
  }
  return v;
}
const BLACK_RGB: [number, number, number] = [0, 0, 0];

export function ctIconSpan(config: TankConfig): number {
  const sizePx = mapVal(config.tankSize ?? 9, 1, 100, GRID_SPACING, 10 * GRID_SPACING);
  const cc = computeCircumcircle(config.turrets || [], sizePx, config.tankSides ?? 0, config.bodyLayers);
  return sizePx > 0 && cc.radius > 0 ? (2 * cc.radius) / sizePx : 1;
}

export function ctIconParts(config: TankConfig, dark: boolean, bodyOverride: string | undefined, out: number[], layerTeam?: string): void {
  const tankSides = config.tankSides ?? 0;
  const turrets: Turret[] = config.turrets || [];
  const layers: BodyLayer[] | undefined = config.bodyLayers;
  const sizePx = mapVal(config.tankSize ?? 9, 1, 100, GRID_SPACING, 10 * GRID_SPACING);

  const cc = computeCircumcircle(turrets, sizePx, tankSides, layers);
  const k = cc.radius > 0 ? 1 / (2 * cc.radius) : 0;
  const cF = Math.cos(CT_ICON_FACING), sF = Math.sin(CT_ICON_FACING);
  const emit = (mesh: number, x: number, y: number, rot: number, sx: number, sy: number,
    col: readonly number[], aspect: number) => {
    const dx = x - cc.centerX, dy = y - cc.centerY;
    out.push(mesh, k * (dx * cF - dy * sF), k * (dx * sF + dy * cF), rot + CT_ICON_FACING,
      k * sx, k * sy, col[0], col[1], col[2], aspect);
  };

  const body = rgbOf(bodyOverride !== undefined ? mapBody(bodyOverride, dark)
    : bodyFillIn(config.tankColor ?? '#3ca4cb', cmMapOf(config.tankColorMap), dark));
  const turretCol = (t: Turret) => rgbOf(turretFillIn(t.color, cmMapOf(t.colorMap), dark));

  const look = (lk: PlacedLook, cx: number, cy: number, facing: number, bodySz: number) => {
    const items = lookList(lk).items; const unit = lookUnit(lk, bodySz);
    const cF2 = Math.cos(facing), sF2 = Math.sin(facing);
    for (let i = 0; i < items.length; i++) {
      const it = items[i], p = it.part;
      const mesh = ctLookMesh(p);
      if (mesh < 0) continue;
      const R = p.radius * unit;
      emit(mesh, cx + (it.lx * cF2 - it.ly * sF2) * unit, cy + (it.lx * sF2 + it.ly * cF2) * unit,
        p.kind === 'circle' ? 0 : facing + it.rot, R, p.kind === 'line' ? 1 : R, rgbOf(bodyFillIn(p.color, p.colorMap, dark)), 1);
    }
  };
  const barrel = (t: Turret, sz: number, angle: number) => {
    const mx = t.xOffset * sz / 2, my = t.yOffset * sz / 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    if (t.look !== undefined) { look(t.look, mx * c - my * s, mx * s + my * c, angle + t.angle, sz); return; }
    emit(CT_MESH_BARREL, mx * c - my * s, mx * s + my * c, angle + t.angle,
      mapVal(t.length, 1, 100, sz * 0.01, sz / 2 + sz * 10), mapVal(t.width, 0, 50, 0, sz * 0.96), turretCol(t), t.aspect ?? 1);
  };
  const auto = (t: Turret, sz: number, angle: number) => {
    const wa = angle + t.angle;
    const mx = t.xOffset * sz / 2, my = t.yOffset * sz / 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    const wx = mx * c - my * s, wy = mx * s + my * c;
    const r = mapVal(t.autoCircleSize ?? 25, 0, 50, 0, sz * 0.96) * 0.7;
    const subs = t.autoSubTurrets && t.autoSubTurrets.length > 1
      ? t.autoSubTurrets.slice().sort((p, q) => (p.renderLayer ?? 0) - (q.renderLayer ?? 0)) : t.autoSubTurrets;
    const subsOf = (above: boolean) => {
      if (!subs || subs.length === 0) return;
      const ssz = r * 2;
      const ca = Math.cos(wa), sa = Math.sin(wa);
      for (let i = 0; i < subs.length; i++) {
        const u = subs[i];
        if ((u.aboveBase === true) !== above) continue;
        const ux = u.xOffset * ssz / 2, uy = u.yOffset * ssz / 2;
        if (u.look !== undefined) { look(u.look, wx + ux * ca - uy * sa, wy + ux * sa + uy * ca, wa + u.angle, sz); continue; }
        emit(CT_MESH_BARREL, wx + ux * ca - uy * sa, wy + ux * sa + uy * ca, wa + u.angle,
          mapVal(u.length, 1, 100, ssz * 0.01, ssz / 2 + ssz * 10), mapVal(u.width, 0, 50, 0, ssz * 0.96), turretCol(u), u.aspect ?? 1);
      }
    };
    subsOf(false);
    if (!t.autoCircleHidden) {
      const col = t.autoCircleColorMatch ? body : turretCol(t);
      const ab = t.autoCircleBaseSides ?? 0;
      const abd = autoBaseDepth(ab, t.autoCircleBaseDepth);
      if (ab >= 3) emit(abd > 0 ? ctStarMesh(Math.floor(ab), abd, false) : polyMesh(ab), wx, wy, wa + autoBaseTurn(ab, abd), r, r, col, 1);
      else emit(CT_MESH_CIRCLE, wx, wy, 0, r, r, col, 1);
      if (t.autoCircleHealer) emit(CT_MESH_CROSS, wx, wy, wa, HEALER_CROSS_SCALE * r * 2, HEALER_CROSS_SCALE * r * 2, rgbOf(healerCrossFillIn(dark)), 1);
    }
    subsOf(true);
  };
  const turret = (t: Turret, sz: number, angle: number) => {
    if (t.turretType === 'auto') auto(t, sz, angle); else barrel(t, sz, angle);
  };

  const sorted: Turret[] = turrets.length > 0 ? sortTurretsByLayer(turrets).slice() : [];
  buildTurretLayerFlags(sorted, layers);
  const onLayer = getTurretOnLayer().slice(0, sorted.length);
  const layerOf = getTurretLayerOrder().slice(0, sorted.length);
  const layerList: BodyLayer[] = layers && layers.length > 0 ? layers.slice().sort(bodyLayerCmp) : [];

  const layer = (L: BodyLayer) => {
    const lsz = sizePx * L.sizeRatio;
    const lw = layerColourOf(L, bodyOverride !== undefined, layerTeam !== undefined);
    let col = lw === LAYER_BODY ? body : lw === LAYER_TEAM ? rgbOf(mapBody(layerTeam!, dark)) : rgbOf(bodyFillIn(L.color, cmMapOf(L.colorMap), dark));
    if (dark && L.intangible) col = BLACK_RGB;
    for (let i = 0; i < sorted.length; i++) if (!sorted[i].aboveTankBody && layerOf[i] === L.renderOrder) turret(sorted[i], lsz, 0);
    const half = lsz / 2;
    const init = L.initialAngle || 0;
    const lo = layerOutlineOf(L) !== null ? ctLookMesh({ kind: 'outline', points: L.outline }) : -1;
    if (lo >= 0) {
      const n = L.copies > 1 ? L.copies : 1;
      for (let c = 0; c < n; c++) emit(lo, 0, 0, (Math.PI * 2 * c) / n + init, half, half, col, 1);
    } else if (L.sides < 3) {
      emit(CT_MESH_CIRCLE, 0, 0, 0, half, half, col, 1);
    } else {
      const vh = half * getRealSizeFactor(L.sides);
      const mesh = L.starDepth > 0 ? ctStarMesh(L.sides, L.starDepth, L.starCurved) : polyMesh(L.sides);
      const n = L.copies > 1 ? L.copies : 1;
      for (let c = 0; c < n; c++) emit(mesh, 0, 0, (Math.PI * 2 * c) / n + init, vh, vh, col, 1);
    }
    if (L.showHealerCross) emit(CT_MESH_CROSS, 0, 0, init, HEALER_CROSS_SCALE * lsz, HEALER_CROSS_SCALE * lsz, rgbOf(healerCrossFillIn(dark)), 1);
    for (let i = 0; i < sorted.length; i++) if (sorted[i].aboveTankBody && layerOf[i] === L.renderOrder) turret(sorted[i], lsz, 0);
  };

  for (const L of layerList) if (L.renderOrder >= 0) layer(L);
  for (let i = 0; i < sorted.length; i++) if (!sorted[i].aboveTankBody && !onLayer[i]) turret(sorted[i], sizePx, 0);
  if (tankSides < 3) {
    emit(CT_MESH_CIRCLE, 0, 0, 0, sizePx / 2, sizePx / 2, body, 1);
  } else {
    const n = Math.floor(tankSides);
    const vh = (sizePx / 2) * getRealSizeFactor(n);
    const rot = ((n >= 4 && n % 2 === 0) ? -Math.PI / n : 0) + (tankSides % 1) * Math.PI * 2;
    const depth = config.tankShapeDepth ?? 0;
    emit(depth > 0 ? ctStarMesh(n, depth, config.tankShapeCurved ?? false) : polyMesh(n), 0, 0, rot, vh, vh, body, 1);
  }
  if (config.isHealer) emit(CT_MESH_CROSS, 0, 0, 0, HEALER_CROSS_SCALE * sizePx, HEALER_CROSS_SCALE * sizePx, rgbOf(healerCrossFillIn(dark)), 1);
  for (let i = 0; i < sorted.length; i++) if (sorted[i].aboveTankBody && !onLayer[i]) turret(sorted[i], sizePx, 0);
  for (const L of layerList) if (L.renderOrder < 0) layer(L);
}
