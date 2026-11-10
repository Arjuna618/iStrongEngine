import { CM, CM_USE, cmHex, cmRgb, cmTable, cmBorderHex, cmBorderRgb, CM_RGB_BASE } from './colorMap';

let _dark = false;

const _G = CM_USE.GENERAL;
const _FLOOR_L = cmHex(CM.BACKGROUND, false, _G), _FLOOR_D = cmHex(CM.BACKGROUND, true, _G);
const _GRID_L = cmHex(CM.GRID, false, _G), _GRID_D = cmHex(CM.GRID, true, _G);
const _BORDER_L = cmBorderHex(false), _BORDER_D = cmBorderHex(true);
const _BORDER_GREY_L = cmBorderRgb(false)[0], _BORDER_GREY_D = cmBorderRgb(true)[0];
const _WALL_L = cmHex(CM.WALLS, false, _G), _WALL_D = cmHex(CM.WALLS, true, _G);
const _BARREL_L = cmHex(CM.BARRELS, false, _G), _BARREL_D = cmHex(CM.BARRELS, true, _G);
const _HEALTH_L = cmHex(CM.HEALTH_BARS, false, _G), _HEALTH_D = cmHex(CM.HEALTH_BARS, true, _G);
const _SHIELD_L = cmHex(CM.SHIELD_BARS, false, _G), _SHIELD_D = cmHex(CM.SHIELD_BARS, true, _G);
function _outsideOf(dark: boolean): string {
  const b = cmRgb(CM.BACKGROUND, dark, _G), g = cmRgb(CM.GRID, dark, _G);
  let n = 1 << 24;
  for (let i = 0; i < 3; i++) n |= Math.round(b[i] + (g[i] - b[i]) * 0.1) << (16 - i * 8);
  return '#' + n.toString(16).slice(1);
}
const _OUT_L = _outsideOf(false), _OUT_D = _outsideOf(true);

export function setGameDarkMode(dark: boolean): boolean {
  if (_dark === dark) return false;
  _dark = dark;
  return true;
}

export function canvasBg(): string { return _dark ? _OUT_D : _OUT_L; }
export function gridBg(): string { return _dark ? _FLOOR_D : _FLOOR_L; }
export function gridStroke(): string { return _dark ? _GRID_D : _GRID_L; }
export function borderRgb(): number { return _dark ? _BORDER_GREY_D : _BORDER_GREY_L; }
export function strokeHex(): string { return _dark ? _BORDER_D : _BORDER_L; }

export function wallDefault(): string { return _dark ? _WALL_D : _WALL_L; }
export function wallFill(slot: number): string { return cmHex(slot, _dark, _G); }

export function turretGrey(): string { return _dark ? _BARREL_D : _BARREL_L; }
export function uiEmpty(): string { return _dark ? _BARREL_D : _BARREL_L; }
export function healthBarColor(): string { return _dark ? _HEALTH_D : _HEALTH_L; }
export function shieldBarColor(): string { return _dark ? _SHIELD_D : _SHIELD_L; }
const _L = (slot: number): string => cmHex(slot, false, _G);
const _SD = (slot: number): string => cmHex(slot, true, CM_USE.SHAPE);
const _SHAPE_DARK_MAP: Record<string, string> = {
  [_L(CM.SQUARES)]: _SD(CM.SQUARES),
  [_L(CM.TRIANGLES)]: _SD(CM.TRIANGLES),
  [_L(CM.PENTAGONS)]: _SD(CM.PENTAGONS),
  [_L(CM.HEXAGONS)]: _SD(CM.HEXAGONS),
  [_L(CM.CRASHERS)]: _SD(CM.CRASHERS),
  [_L(CM.PURPLE)]: _SD(CM.PURPLE),
  [_L(CM.GREEN)]: _SD(CM.GREEN),
  [_L(CM.TEXT)]: _SD(CM.BACKGROUND),
};

export const DARK_CRASHER_SENTINEL = _SD(CM.CRASHERS);

const _BODY_DARK_MAP: Record<string, string> = {
  [_L(CM.ROGUES)]: cmHex(CM.ROGUES, true, CM_USE.TANK),
  [_L(CM.BORDERS)]: cmHex(CM.BORDERS, true, CM_USE.TANK),
};

const _BODY_SHARED_SHAPE_COLORS: Record<string, string> = {
  [_L(CM.SQUARES)]: _SHAPE_DARK_MAP[_L(CM.SQUARES)],
  [_L(CM.TRIANGLES)]: _SHAPE_DARK_MAP[_L(CM.TRIANGLES)],
  [_L(CM.PENTAGONS)]: _SHAPE_DARK_MAP[_L(CM.PENTAGONS)],
  [_L(CM.HEXAGONS)]: _SHAPE_DARK_MAP[_L(CM.HEXAGONS)],
  [_L(CM.CRASHERS)]: _SHAPE_DARK_MAP[_L(CM.CRASHERS)],
};

export function mapBodyColor(color: string): string {
  if (!_dark) return color;
  return _BODY_DARK_MAP[color] ?? _BODY_SHARED_SHAPE_COLORS[color] ?? color;
}

export function bodyColorIn(color: string, dark: boolean): string {
  return dark ? (_BODY_DARK_MAP[color] ?? _BODY_SHARED_SHAPE_COLORS[color] ?? color) : color;
}

const _TANK_L = cmTable(false, CM_USE.TANK), _TANK_D = cmTable(true, CM_USE.TANK);
const _SHAPE_L = cmTable(false, CM_USE.SHAPE), _SHAPE_D = cmTable(true, CM_USE.SHAPE);

const _rgbLiveWords = new Map<number, string>();
function rgbLiveWord(v: number): string {
  let s = _rgbLiveWords.get(v);
  if (s === undefined) { s = '#' + (v - CM_RGB_BASE).toString(16).padStart(6, '0'); _rgbLiveWords.set(v, s); }
  return s;
}

export function bodyFill(color: string, map: number | undefined | null): string {
  if (map == null) return mapBodyColor(color);
  if (map < 0) return color;
  if (map >= CM_RGB_BASE) return rgbLiveWord(map);
  return (_dark ? _TANK_D : _TANK_L)[map] ?? color;
}

export function bodyFillIn(color: string, map: number | undefined | null, dark: boolean): string {
  if (map == null) return bodyColorIn(color, dark);
  if (map < 0) return color;
  if (map >= CM_RGB_BASE) return rgbLiveWord(map);
  return (dark ? _TANK_D : _TANK_L)[map] ?? color;
}

export function healerCrossFill(): string {
  return (_dark ? _TANK_D : _TANK_L)[CM.RED];
}
export function healerCrossFillIn(dark: boolean): string {
  return (dark ? _TANK_D : _TANK_L)[CM.RED];
}

export function turretFill(color: string | undefined, map: number | undefined | null): string {
  if (map == null) return _dark ? _BARREL_D : _BARREL_L;
  if (map < 0) return color || (_dark ? _BARREL_D : _BARREL_L);
  return (_dark ? _TANK_D : _TANK_L)[map] ?? (_dark ? _BARREL_D : _BARREL_L);
}

export function turretFillIn(color: string | undefined, map: number | undefined | null, dark: boolean): string {
  if (map == null) return dark ? _BARREL_D : _BARREL_L;
  if (map < 0) return color || (dark ? _BARREL_D : _BARREL_L);
  return (dark ? _TANK_D : _TANK_L)[map] ?? (dark ? _BARREL_D : _BARREL_L);
}

export function shapeFill(color: string, map: number | undefined | null, isCrasherOrSentinel: boolean): string {
  if (map == null) return mapShapeColor(color, isCrasherOrSentinel);
  if (map < 0) return color;
  return (_dark ? _SHAPE_D : _SHAPE_L)[map] ?? color;
}

export function mapShapeColor(color: string, isCrasherOrSentinel: boolean = false): string {
  if (!_dark) return color;
  if (isCrasherOrSentinel) return DARK_CRASHER_SENTINEL;
  return shapeColorIn(color, true);
}

export function shapeFillIn(color: string, map: number | undefined | null, isCrasherOrSentinel: boolean, dark: boolean): string {
  if (map == null) return dark ? (isCrasherOrSentinel ? DARK_CRASHER_SENTINEL : shapeColorIn(color, true)) : color;
  if (map < 0) return color;
  return (dark ? _SHAPE_D : _SHAPE_L)[map] ?? color;
}

export function shapeColorIn(color: string, dark: boolean): string {
  return dark ? (_SHAPE_DARK_MAP[color] ?? color) : color;
}

export function isGameDark(): boolean { return _dark; }

import type { UpgradeStat } from '../types';

export const STAT_COLORS: Record<UpgradeStat, string> = {
  bodyDamage: '#ef7064', maxHealth: '#ffc665', bulletSpeed: '#80ffea',
  bulletHealth: '#81bc00', bulletPenetration: '#ffff80', bulletDamage: '#fe5f57',
  reload: '#8aff81', movementSpeed: '#33a5d6', shieldRegen: '#ff80bf', shieldCapacity: '#9673e8',
};

export const STAT_IDS: UpgradeStat[] = [
  'bodyDamage', 'maxHealth', 'bulletSpeed', 'bulletHealth', 'bulletPenetration',
  'bulletDamage', 'reload', 'movementSpeed', 'shieldRegen', 'shieldCapacity',
];
