import type { TankConfig, TurretPreset, CustomProjectileDesign, OtherDesign, OtherPart } from '../../types';
import { ctIconParts, ctLookMesh, polyMesh, ctOutlineMesh, CT_MESH_CIRCLE, CT_PART_STRIDE } from '../../utils/classTreeIcon';
import { otherDrawList, otherReach } from '../../utils/otherDraw';
import { lookFromShape } from '../../utils/placedLook';
import { bodyFillIn, shapeFillIn } from '../../utils/gameColors';
import { CM, cmHex, CM_USE, cmMapOf } from '../../utils/colorMap';
import { getRealSizeFactor } from '../../utils/p5Utils';
import { labyDownscale, getAnimatedColor, RARITY_MULTIPLIERS, type ShapeDefinition } from '../../game/ShapeRegistry';
import { solidOf, solidFaces, SOLID_STILL_X, SOLID_STILL_Y, SOLID_FACES_MAX } from '../../utils/solidArras';
import type { LibEntry } from './catalog';

export interface LibPicture {
  parts: Float32Array;
  anim: string;
  alpha: number;
  veilMesh: number; veilScale: number; veilRot: number;
}

const _rgb = new Map<string, [number, number, number]>();
export function rgb01(hex: string): [number, number, number] {
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

const NONE: LibPicture = { parts: new Float32Array(0), anim: '', alpha: 1, veilMesh: -1, veilScale: 0, veilRot: 0 };

function pic(parts: number[], anim = '', alpha = 1, veilMesh = -1, veilScale = 0, veilRot = 0): LibPicture {
  return { parts: Float32Array.from(parts), anim, alpha, veilMesh, veilScale, veilRot };
}

function presetConfig(p: TurretPreset): TankConfig {
  return { tankSides: 0, tankSize: 9, tankColor: cmHex(CM.ROGUES, false, CM_USE.TANK), tankColorMap: CM.ROGUES, turrets: p.turrets || [] } as unknown as TankConfig;
}

function designConfig(d: CustomProjectileDesign): TankConfig {
  const inherit = d.color === 'inherit' || !d.color;
  return {
    tankSides: d.shape ?? 0, tankShapeDepth: d.trapDepth ?? 0, tankShapeCurved: d.trapCurved ?? false, tankSize: 9,
    tankColor: inherit ? undefined : d.color,
    tankColorMap: inherit ? undefined : (d.color === d.bodyColor ? cmMapOf(d.bodyColorMap) : undefined),
    turrets: d.turrets || [], bodyLayers: d.bodyLayers || [],
  } as unknown as TankConfig;
}

function otherParts(design: OtherDesign, dark: boolean, out: number[]): void {
  const list = otherDrawList(design, null);
  const reach = Math.max(0.05, otherReach(design.body));
  const k = 0.5 / reach;
  for (const it of list.items) {
    const p: OtherPart = it.part;
    const mesh = ctLookMesh(p as any);
    if (mesh < 0) continue;
    const R = p.radius * k;
    const col = rgb01(bodyFillIn(p.color, p.colorMap, dark));
    out.push(mesh, it.lx * k, it.ly * k, p.kind === 'circle' ? 0 : it.rot, R, p.kind === 'line' ? k : R, col[0], col[1], col[2], 1);
  }
}

const _faces = new Float64Array(SOLID_FACES_MAX);

function shapePicture(def: ShapeDefinition, dark: boolean): LibPicture {
  if (def.look) return lookPicture(def, dark);
  const anim = def.isAnimatedColor ? def.animationType : '';
  const hex = anim ? getAnimatedColor(anim, dark) : shapeFillIn(def.defaultColor, def.colorMap, def.isCrasher, dark);
  const col = rgb01(hex);
  const alpha = RARITY_MULTIPLIERS[def.rarity]?.opacity ?? def.opacity ?? 1;
  const out: number[] = [];
  if (def.isPolyhedron) {
    const solid = solidOf(def.baseShape);
    if (!solid) return NONE;
    const shown = solidFaces(solid, SOLID_STILL_X, SOLID_STILL_Y, _faces);
    const K = solid.faceSides;
    const r = 0.5 / solid.circumradius;
    for (let f = 0, w = 0; f < shown; f++, w += K * 2) {
      let cx = 0, cy = 0;
      for (let k = 0; k < K; k++) { cx += _faces[w + k * 2]; cy += _faces[w + k * 2 + 1]; }
      cx /= K; cy /= K;
      const pts: [number, number][] = [];
      for (let k = 0; k < K; k++) pts.push([Math.round((_faces[w + k * 2] - cx) * 1e4) / 1e4, Math.round((_faces[w + k * 2 + 1] - cy) * 1e4) / 1e4]);
      out.push(ctOutlineMesh(pts), cx * r, cy * r, 0, r, r, col[0], col[1], col[2], 1);
    }
    return pic(out, anim, alpha);
  }
  const sides = def.sides < 3 ? 0 : def.sides;
  const look = lookFromShape({
    id: def.id, name: def.displayName, sides, color: def.defaultColor, colorMap: typeof def.colorMap === 'number' ? def.colorMap : -1,
    nested: def.labyLevel || 0, downscale: labyDownscale(sides), realSize: getRealSizeFactor(sides),
  });
  const list = otherDrawList(look.design, null);
  const reach = Math.max(0.05, otherReach(look.design.body));
  const k = 0.5 / reach;
  let veilMesh = -1, veilScale = 0, veilRot = 0;
  for (const it of list.items) {
    const p = it.part;
    const mesh = p.kind === 'circle' ? CT_MESH_CIRCLE : polyMesh(p.sides as number);
    const R = p.radius * k;
    if (veilMesh < 0) { veilMesh = mesh; veilScale = R; veilRot = p.kind === 'circle' ? 0 : it.rot; }
    out.push(mesh, it.lx * k, it.ly * k, p.kind === 'circle' ? 0 : it.rot, R, R, col[0], col[1], col[2], 1);
  }
  return pic(out, anim, alpha, veilMesh, veilScale, veilRot);
}

function lookPicture(def: ShapeDefinition, dark: boolean): LibPicture {
  const look = def.look!;
  const facing = def.sides >= 3 && def.sides % 2 === 1 ? -Math.PI / 2 : 0;
  const c = Math.cos(facing), s = Math.sin(facing);
  const k = 0.5 / Math.max(0.05, look.reach);
  const out: number[] = [];
  for (const it of look.list.items) {
    const p: OtherPart = it.part;
    const mesh = ctLookMesh(p as any);
    if (mesh < 0) continue;
    const R = p.radius * k;
    const col = rgb01(shapeFillIn(p.color, p.colorMap, false, dark));
    out.push(mesh, (it.lx * c - it.ly * s) * k, (it.lx * s + it.ly * c) * k, p.kind === 'circle' ? 0 : facing + it.rot, R, p.kind === 'line' ? k : R, col[0], col[1], col[2], 1);
  }
  return pic(out, '', RARITY_MULTIPLIERS[def.rarity]?.opacity ?? def.opacity ?? 1);
}

export function buildPicture(e: LibEntry, dark: boolean): LibPicture {
  const out: number[] = [];
  try {
    switch (e.kind) {
      case 'tank': ctIconParts(e.item!.fileData.data as TankConfig, dark, undefined, out); break;
      case 'turret': ctIconParts(presetConfig(e.item!.fileData.data as TurretPreset), dark, undefined, out); break;
      case 'projectile': ctIconParts(designConfig(e.item!.fileData.data as CustomProjectileDesign), dark, undefined, out); break;
      case 'other': otherParts(e.item!.fileData.data as OtherDesign, dark, out); break;
      case 'sentry': ctIconParts(e.sentry!.tankConfig, dark, undefined, out); break;
      case 'shape': return e.shape ? shapePicture(e.shape, dark) : NONE;
    }
  } catch (err) {
    console.error('[ContentLibrary] picture of', e.key, err);
    return NONE;
  }
  return out.length >= CT_PART_STRIDE ? pic(out) : NONE;
}

const _pics = [new Map<string, LibPicture>(), new Map<string, LibPicture>()];
const _picSrc = [new Map<string, unknown>(), new Map<string, unknown>()];
function picSourceOf(e: LibEntry): unknown { return e.item ? e.item.fileData.data : e.sentry ? e.sentry.tankConfig : e.shape; }
export function pictureOf(e: LibEntry, dark: boolean): LibPicture {
  const i = dark ? 1 : 0, m = _pics[i];
  const src = picSourceOf(e);
  let p = m.get(e.key);
  if (!p || _picSrc[i].get(e.key) !== src) { p = buildPicture(e, dark); m.set(e.key, p); _picSrc[i].set(e.key, src); }
  return p;
}
export function hasPicture(e: LibEntry, dark: boolean): boolean {
  const i = dark ? 1 : 0;
  return _pics[i].has(e.key) && _picSrc[i].get(e.key) === picSourceOf(e);
}
export function forgetPictures(keep: ReadonlyMap<string, LibEntry>): void {
  for (let i = 0; i < 2; i++) {
    const m = _pics[i], srcs = _picSrc[i];
    for (const k of m.keys()) { const e = keep.get(k); if (!e || srcs.get(k) !== picSourceOf(e)) { m.delete(k); srcs.delete(k); } }
  }
}
