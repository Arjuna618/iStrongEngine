export const AC_RAINBOW_STOPS: readonly number[] = Object.freeze([0xFF1000, 0xFF9000, 0xFFD300, 0x00E00B, 0x226EF6, 0xA913CF]);
export const AC_TRANS_BLUE = 0x55CDFC;
export const AC_TRANS_PINK = 0xF7A8B8;
export const AC_WHITE = 0xFFFFFF;

export const AC_CODE = Object.freeze({
  FLASH_BLUE_RED: 20, FLASH_BLUE_GREY: 21, FLASH_GREY_BLUE: 22, FLASH_RED_GREY: 23, FLASH_GREY_RED: 24,
  RAINBOW: 36, TRANS: 37,
} as const);

export const AC_FLASH_SLOTS: readonly (readonly [number, number])[] = Object.freeze([
  Object.freeze([10, 12] as const), Object.freeze([10, 16] as const), Object.freeze([16, 10] as const),
  Object.freeze([12, 16] as const), Object.freeze([16, 12] as const),
]);
export const AC_FLASH_PERIOD_S = 0.3;
export const AC_FLASH_FIRST_S = 0.15;
export const AC_RAINBOW_TURNS_PER_S = 0.5;

export function acLerpK(a: number, b: number, k: number): number {
  const j = 256 - k;
  return (((((b >> 16) & 255) * k + ((a >> 16) & 255) * j) >> 8) << 16)
    | (((((b >> 8) & 255) * k + ((a >> 8) & 255) * j) >> 8) << 8)
    | (((b & 255) * k + (a & 255) * j) >> 8);
}

export function acLerpW(a: number, b: number, w: number): number {
  if (w >= 1) return b;
  if (!(w > 0)) return a;
  return acLerpK(a, b, Math.trunc(w * 256));
}

const _STEPS = 257;
const _HEX2: string[] = [];
for (let i = 0; i < 256; i++) _HEX2.push((i < 16 ? '0' : '') + i.toString(16));
const _hexOf = (c: number): string => '#' + _HEX2[(c >> 16) & 255] + _HEX2[(c >> 8) & 255] + _HEX2[c & 255];

const _RAINBOW_RGB = new Int32Array(6 * _STEPS);
const _RAINBOW_HEX: string[] = [];
for (let seg = 0; seg < 6; seg++) {
  const A = AC_RAINBOW_STOPS[seg], B = AC_RAINBOW_STOPS[(seg + 1) % 6];
  for (let k = 0; k < _STEPS; k++) {
    const c = k === 256 ? B : acLerpK(A, B, k);
    _RAINBOW_RGB[seg * _STEPS + k] = c;
    _RAINBOW_HEX.push(_hexOf(c));
  }
}
const _TRANS_RGB = new Int32Array(2 * _STEPS);
const _TRANS_HEX: string[] = [];
for (let half = 0; half < 2; half++) {
  const col = half === 0 ? AC_TRANS_BLUE : AC_TRANS_PINK;
  for (let k = 0; k < _STEPS; k++) {
    const c = k === 256 ? col : acLerpK(AC_WHITE, col, k);
    _TRANS_RGB[half * _STEPS + k] = c;
    _TRANS_HEX.push(_hexOf(c));
  }
}

function _rainbowIndex(p: number): number {
  const x = p * 6;
  const m = x % 6;
  const seg = m >= 0 ? Math.trunc(m) : 0;
  const frac = x - Math.trunc(x);
  const k = frac >= 1 ? 256 : frac > 0 ? Math.trunc(frac * 256) : 0;
  return seg * _STEPS + k;
}

function _transIndex(t: number): number {
  const h = t * 0.5;
  const f = Math.sin((h - Math.trunc(h)) * Math.PI) * 5 + -2;
  const half = (t + Math.trunc(t / 4) * -4) < 2 ? 0 : 1;
  const k = f >= 1 ? 256 : f > 0 ? Math.trunc(f * 256) : 0;
  return half * _STEPS + k;
}

export function acRainbow(p: number): number { return _RAINBOW_RGB[_rainbowIndex(p)]; }

export function acTrans(t: number): number { return _TRANS_RGB[_transIndex(t)]; }

export function acFlashFirst(t: number): boolean { return (t % AC_FLASH_PERIOD_S) < AC_FLASH_FIRST_S; }

export function acCodeRgb(code: number, t: number, palette: readonly number[]): number | undefined {
  if (code === AC_CODE.RAINBOW) return acRainbow(t * AC_RAINBOW_TURNS_PER_S);
  if (code === AC_CODE.TRANS) return acTrans(t);
  if (code >= 20 && code <= 24) { const pair = AC_FLASH_SLOTS[code - 20]; return palette[acFlashFirst(t) ? pair[0] : pair[1]]; }
  return undefined;
}

export function acMix(a: number, b: number, w255: number): number { return acLerpW(a, b, w255 / 255); }

const _CLOCK_WRAP_MS = 60000;
export const AC_UI = 0;
export const AC_WORLD = 1;
const _rainbowAt = [0, 0];
const _transAt = [0, 0];
const _flashFirst = [true, true];

export function acClockSeconds(nowMs: number): number { return (nowMs % _CLOCK_WRAP_MS) / 1000; }

export function acTick(nowMs: number, clock: number = AC_UI): void {
  const t = acClockSeconds(nowMs);
  _rainbowAt[clock] = _rainbowIndex(t * AC_RAINBOW_TURNS_PER_S);
  _transAt[clock] = _transIndex(t);
  _flashFirst[clock] = acFlashFirst(t);
}

export function acRainbowHex(clock: number = AC_UI): string { return _RAINBOW_HEX[_rainbowAt[clock]]; }
export function acTransHex(clock: number = AC_UI): string { return _TRANS_HEX[_transAt[clock]]; }
export function acFlashIsFirst(clock: number = AC_UI): boolean { return _flashFirst[clock]; }
