export const CM = Object.freeze({
  SHIELD_BARS: 0, HEALTH_BARS: 1, TRIANGLES: 2, NEUTRAL: 3, HEXAGONS: 4, CRASHERS: 5, EGGS: 6, WALLS: 7,
  TEXT: 8, BORDERS: 9, BLUE: 10, GREEN: 11, RED: 12, SQUARES: 13, PENTAGONS: 14, PURPLE: 15,
  BARRELS: 16, ROGUES: 17, BACKGROUND: 18, GRID: 19,
} as const);

export const CM_COUNT = 20;

export const CM_NAMES: readonly string[] = Object.freeze([
  'Shield Bars', 'Health Bars', 'Triangles', 'Neutral', 'Hexagons', 'Crashers', 'Eggs', 'Walls',
  'Text', 'Borders', 'Blue', 'Green', 'Red', 'Squares', 'Pentagons', 'Purple',
  'Barrels', 'Rogues', 'Background', 'Grid',
]);

export const CM_ARRAS_LIGHT: readonly string[] = Object.freeze([
  '#7ad3db',
  '#b9e87e',
  '#e7896d',
  '#fdf380',
  '#7adbba',
  '#ef99c3',
  '#e8ebf7',
  '#a4a4ad',
  '#ffffff',
  '#484848',
  '#3ca4cb',
  '#8abc3f',
  '#e03e41',
  '#efc74b',
  '#8d6adf',
  '#cc669c',
  '#a7a7af',
  '#726f6f',
  '#dbdbdb',
  '#000000',
]);

export const CM_ARRAS_DARK: readonly string[] = Object.freeze([
  '#6ecedc',
  '#26bf57',
  '#c46748',
  '#caca4e',
  '#62caa7',
  '#d153cc',
  '#1e1e1e',
  '#3c3a3a',
  '#f2f2f2',
  '#131313',
  '#379fc6',
  '#8abc3f',
  '#ff6c6e',
  '#ffc665',
  '#9673e8',
  '#c8679b',
  '#635f5f',
  '#73747a',
  '#0a0a0a',
  '#ffffff',
]);

export const CM_BORDER_LIGHT = '#484848';
export const CM_BORDER_DARK = '#000000';

export const CM_BORDER_BLEND_LIGHT = 0.598;
export const CM_BORDER_BLEND_DARK = 1;

export const CM_USE = Object.freeze({
  GENERAL: 0,
  SHAPE: 1,
  TANK: 2,
} as const);

export const CM_FREE = -1;
export const CM_RGB_BASE = 0x1000000;
export function cmRgbLive(hex: unknown): number {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex) ? CM_RGB_BASE + parseInt(hex.slice(1), 16) : -1;
}

export function cmMapOf(v: unknown): number | undefined {
  return typeof v === 'number' && (v === CM_FREE || (v >= 0 && v < CM_COUNT && Math.floor(v) === v)) ? v : undefined;
}

const _HEX6 = /^#[0-9a-fA-F]{6}$/;

export function cmTurretColorSafe(t: any): void {
  if (t.colorMap === undefined) return;
  const m = cmMapOf(t.colorMap);
  if (m === undefined || (m < 0 && !(typeof t.color === 'string' && _HEX6.test(t.color)))) {
    delete t.color; delete t.colorMap; delete t.colorFree;
    return;
  }
  if (m >= 0 && t.color !== CM_ARRAS_LIGHT[m]) t.color = CM_ARRAS_LIGHT[m];
  if (t.colorFree !== undefined && !(m >= 0 && typeof t.colorFree === 'string' && _HEX6.test(t.colorFree))) delete t.colorFree;
}

export const CM_TAB_ORDER: readonly number[] = Object.freeze([
  CM.BLUE, CM.EGGS, CM.WALLS, CM.GREEN, CM.SQUARES, CM.HEALTH_BARS, CM.RED, CM.TRIANGLES, CM.SHIELD_BARS,
  CM.PURPLE, CM.PENTAGONS, CM.BARRELS, CM.NEUTRAL, CM.HEXAGONS, CM.BACKGROUND, CM.ROGUES, CM.CRASHERS, CM.GRID,
  CM.TEXT, CM.BORDERS,
]);

export type CmRgb = readonly [number, number, number];

function rgbOf(hex: string): CmRgb {
  const n = parseInt(hex.slice(1), 16);
  return Object.freeze<[number, number, number]>([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}

function hisDark(use: number): readonly string[] {
  const d = CM_ARRAS_DARK.slice();
  d[CM.BORDERS] = CM_BORDER_DARK;
  if (use !== CM_USE.GENERAL) d[CM.EGGS] = CM_ARRAS_LIGHT[CM.EGGS];
  return Object.freeze(d);
}

const _HEX: readonly (readonly (readonly string[])[])[] = Object.freeze([
  Object.freeze([CM_ARRAS_LIGHT, hisDark(CM_USE.GENERAL)]),
  Object.freeze([CM_ARRAS_LIGHT, hisDark(CM_USE.SHAPE)]),
  Object.freeze([CM_ARRAS_LIGHT, hisDark(CM_USE.TANK)]),
]);
const _RGB: readonly (readonly (readonly CmRgb[])[])[] =
  Object.freeze(_HEX.map(modes => Object.freeze(modes.map(t => Object.freeze(t.map(rgbOf))))));
const _BORDER_RGB_LIGHT = rgbOf(CM_BORDER_LIGHT);
const _BORDER_RGB_DARK = rgbOf(CM_BORDER_DARK);

export function cmHex(slot: number, dark: boolean, use: number): string {
  return _HEX[use][dark ? 1 : 0][slot];
}

export function cmRgb(slot: number, dark: boolean, use: number): CmRgb {
  return _RGB[use][dark ? 1 : 0][slot];
}

export function customAreaFill(look: { color: string; colorMap?: number }, dark: boolean): string {
  return look.colorMap !== undefined && look.colorMap >= 0 ? cmHex(look.colorMap, dark, CM_USE.GENERAL) : look.color;
}

export function cmTable(dark: boolean, use: number): readonly string[] {
  return _HEX[use][dark ? 1 : 0];
}

export function cmDesignHex(color: string, map: number | undefined, use: number): string {
  return map !== undefined && map >= 0 ? _HEX[use][0][map] : color;
}

export function cmBorderHex(dark: boolean): string {
  return dark ? CM_BORDER_DARK : CM_BORDER_LIGHT;
}

export function cmBorderRgb(dark: boolean): CmRgb {
  return dark ? _BORDER_RGB_DARK : _BORDER_RGB_LIGHT;
}
