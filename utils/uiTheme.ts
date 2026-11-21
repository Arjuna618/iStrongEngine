import { CM, CM_USE, cmHex, cmRgb } from './colorMap';

export type UiThemeId = 'modern' | 'classic';

export const UI_THEMES: readonly { id: UiThemeId; label: string }[] = Object.freeze([
  { id: 'modern' as const, label: 'Modern' },
  { id: 'classic' as const, label: 'Classic (Experimental)' },
]);

const KEY = 'istrong-ui-theme';
const CLASS = 'ui-classic';

function stored(): UiThemeId {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'modern') return 'modern';
  } catch { }
  return 'classic';
}

let _now: UiThemeId = stored();
const _subs = new Set<() => void>();

export function uiThemeId(): UiThemeId { return _now; }

function applyClass(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (!html || !html.classList) return;
  const on = _now === 'classic';
  if (html.classList.contains(CLASS) === on) return;
  if (!document.head || typeof html.classList.toggle !== 'function') return;
  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { transition: none !important; }';
  document.head.appendChild(style);
  html.classList.toggle(CLASS, on);
  html.offsetHeight;
  document.head.removeChild(style);
}

export function setUiTheme(id: UiThemeId): void {
  if (id !== 'modern' && id !== 'classic') return;
  if (id === _now) return;
  _now = id;
  try { localStorage.setItem(KEY, id); } catch { }
  applyClass();
  _subs.forEach(fn => fn());
}

export function subscribeUiTheme(fn: () => void): () => void {
  _subs.add(fn);
  return () => { _subs.delete(fn); };
}

const PALETTE_KEY = 'istrong-ui-palette';

function lightnessOf(c: readonly number[]): number {
  const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const y = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : y * 24389 / 27;
}
function darkStep(body: readonly number[], lightBody: readonly number[], k: number, dark: boolean): number {
  if (!dark) return k;
  const want = lightnessOf(lightBody) - lightnessOf(lightBody.map(v => v * k));
  const top = lightnessOf(body);
  let lo = 0.3, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (top - lightnessOf(body.map(v => v * m)) > want) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

function paletteOf(dark: boolean): Record<string, string> {
  const G = CM_USE.GENERAL;
  const acc = cmRgb(CM.GREEN, dark, G);
  const body = cmRgb(CM.BARRELS, dark, G);
  const kBar = darkStep(body, cmRgb(CM.BARRELS, false, G), 0.88, dark), kSide = darkStep(body, cmRgb(CM.BARRELS, false, G), 0.8, dark);
  const shade = (c: number, k = kBar) => Math.round(c * k).toString(16).padStart(2, '0');
  const floor = cmRgb(CM.BACKGROUND, dark, G);
  const mm = [0, 1, 2].map(i => (floor[i] * 128 + body[i] * 128) >> 8);
  return {
    '--kc-mm': `rgb(${mm[0]}, ${mm[1]}, ${mm[2]})`,
    '--kc-bar': `#${shade(body[0])}${shade(body[1])}${shade(body[2])}`,
    '--kc-side': `#${shade(body[0], kSide)}${shade(body[1], kSide)}${shade(body[2], kSide)}`,
    '--kc-grey': cmHex(CM.BARRELS, dark, G),
    '--kc-ink': cmHex(CM.BORDERS, dark, G),
    '--kc-white': cmHex(CM.TEXT, dark, G),
    '--kc-acc': cmHex(CM.GREEN, dark, G),
    '--kc-acc-rgb': `${acc[0]}, ${acc[1]}, ${acc[2]}`,
    '--kc-red': cmHex(CM.RED, dark, G),
    '--kc-blue': cmHex(CM.BLUE, dark, G),
    '--kc-purple': cmHex(CM.PURPLE, dark, G),
    '--kc-tri': cmHex(CM.TRIANGLES, dark, G),
    '--kc-sq': cmHex(CM.SQUARES, dark, G),
  };
}

export function uiPaletteSync(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const st = html?.style;
  if (!st || typeof st.setProperty !== 'function' || !html.classList) return;
  const p = paletteOf(html.classList.contains('dark'));
  for (const k in p) st.setProperty(k, p[k]);
}

export function classicPalettes(): { light: Record<string, string>; dark: Record<string, string> } {
  return { light: paletteOf(false), dark: paletteOf(true) };
}

try {
  if (typeof localStorage !== 'undefined') localStorage.setItem(PALETTE_KEY, JSON.stringify(classicPalettes()));
} catch { }

applyClass();
uiPaletteSync();

export const __uiThemeHooks = { paletteOf };
