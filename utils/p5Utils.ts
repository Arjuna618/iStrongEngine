import { Vector } from "./MathUtils";
import { isGameDark } from "./gameColors";
import { flashWhite } from "./motionArras";
import { cmBorderHex, cmBorderRgb } from "./colorMap";
import { borderBlendFor, gameThemeVersion } from "./gameTheme";
import { OFFENSE_ARRAS } from "../game/offenseSwitch";

const _BORDER_LIGHT = cmBorderRgb(false);
const _BORDER_DARK = cmBorderRgb(true);
const _BORDER_DARK_CSS = `rgb(${_BORDER_DARK[0]},${_BORDER_DARK[1]},${_BORDER_DARK[2]})`;
const _BORDER_DARK_HEX = cmBorderHex(true);

let _darkenCache: Record<string, string> = Object.create(null);

let _mixWhiteCache: Record<string, string> = Object.create(null);

export function syncDarkenTheme(): void {
  _darkenCache = Object.create(null);
  _mixWhiteCache = Object.create(null);
  _darkenVer = gameThemeVersion();
}
let _darkenVer = gameThemeVersion();

export function darkenColor(col: string, factor: number): string {
  if (_darkenVer !== gameThemeVersion()) syncDarkenTheme();
  const dark = isGameDark();
  const f = factor === 0.598 ? borderBlendFor(dark) : factor;
  if (dark && (f >= 1 || factor !== 0.598)) return _BORDER_DARK_CSS;

  const key = dark ? col + '|d' : factor === 0.598 ? col : col + '|' + factor;
  const cached = _darkenCache[key];
  if (cached !== undefined) return cached;

  const to = dark ? _BORDER_DARK : _BORDER_LIGHT;
  let color = col;
  if (color.startsWith('#')) {
    color = color.slice(1);
    if (color.length === 3) color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];

    let num = parseInt(color, 16);
    let r = (num >> 16);
    let g = ((num >> 8) & 0x00FF);
    let b = (num & 0x0000FF);

    r = Math.max(0, Math.floor(r + (to[0] - r) * f));
    g = Math.max(0, Math.floor(g + (to[1] - g) * f));
    b = Math.max(0, Math.floor(b + (to[2] - b) * f));

    const result = `rgb(${r},${g},${b})`;
    _darkenCache[key] = result;
    return result;
  }
  _darkenCache[key] = col;
  return col;
}

export function mixColorToWhite(hex: string, blend: number): string {
  const qBlend = Math.round(blend * 20) / 20;
  if (qBlend <= 0) return hex;
  const white = flashWhite(isGameDark());
  const key = white === 255 ? hex + qBlend : hex + qBlend + '>' + white;
  const cached = _mixWhiteCache[key];
  if (cached !== undefined) return cached;

  let color = hex;
  if (color.startsWith('#')) {
    color = color.slice(1);
    if (color.length === 3) color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
    const num = parseInt(color, 16);
    const r = ((num >> 16) & 0xFF);
    const g = ((num >> 8) & 0xFF);
    const b = (num & 0xFF);
    const nr = (r + (white - r) * qBlend) | 0;
    const ng = (g + (white - g) * qBlend) | 0;
    const nb = (b + (white - b) * qBlend) | 0;
    const result = '#' + ((1 << 24) | (nr << 16) | (ng << 8) | nb).toString(16).slice(1);
    _mixWhiteCache[key] = result;
    return result;
  }
  _mixWhiteCache[key] = hex;
  return hex;
}

export function computeStrokeColor(fillColor: string): string {
  const dark = isGameDark();
  const factor = borderBlendFor(dark);
  if (dark && factor >= 1) return _BORDER_DARK_HEX;
  const to = dark ? _BORDER_DARK : _BORDER_LIGHT;

  let color = fillColor;
  if (color.startsWith('#')) {
    color = color.slice(1);
    if (color.length === 3) color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
    const num = parseInt(color, 16);
    const r = Math.max(0, Math.floor(((num >> 16) & 0xFF) + (to[0] - ((num >> 16) & 0xFF)) * factor));
    const g = Math.max(0, Math.floor(((num >> 8) & 0xFF) + (to[1] - ((num >> 8) & 0xFF)) * factor));
    const b = Math.max(0, Math.floor((num & 0xFF) + (to[2] - (num & 0xFF)) * factor));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  return fillColor;
}

export function distToSegment(p: Vector, v: Vector, w: Vector): number {
  let l2 = Vector.dist(v, w) ** 2;
  if (l2 === 0) return Vector.dist(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  let projX = v.x + t * (w.x - v.x);
  let projY = v.y + t * (w.y - v.y);
  return Vector.dist(p, new Vector(projX, projY));
}

const REAL_SIZE_FACTORS: Record<number, number> = {};
for (let i = 3; i <= 16; i++) {
    const circum = (2 * Math.PI) / i;
    REAL_SIZE_FACTORS[i] = Math.sqrt(circum / Math.sin(circum));
}

export function getRealSizeFactor(sides: number): number {
    if (sides < 3) return 1.0;
    return REAL_SIZE_FACTORS[sides] ?? 1.0;
}

export function getSideNorm(sides: number): number {
    if (sides < 3) return 1.0;
    return (REAL_SIZE_FACTORS[sides] ?? 1.0) * Math.sin(Math.PI / sides);
}

export function computeSideCorr(layerSides: number, mainSides: number): number {
    if (layerSides === mainSides || layerSides < 3 || mainSides < 3) return 1.0;
    return getSideNorm(layerSides) / getSideNorm(mainSides);
}

const COLLISION_FACTORS: Record<number, number> = {};
for (let i = 3; i <= 16; i++) {
    COLLISION_FACTORS[i] = REAL_SIZE_FACTORS[i] * Math.cos(Math.PI / i);
}

const SHAPE_TOUCH_K = Math.sqrt(Math.PI) / 2;

export function getCollisionFactor(sides: number): number {
    if (sides < 3) return 1.0;
    if (OFFENSE_ARRAS.SHAPE_TOUCH !== 0) return SHAPE_TOUCH_K;
    return COLLISION_FACTORS[sides] ?? 1.0;
}

export function midpointOfSide(points: {x: number, y: number}[], i: number): {x: number, y: number} {
  if (!points || points.length < 2) return {x: 0, y: 0};
  let j = (i + 1) % points.length;
  let p1 = points[i];
  let p2 = points[j];
  return { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
}
