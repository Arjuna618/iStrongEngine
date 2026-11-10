import { CM, CM_USE, cmHex, cmRgb, CM_BORDER_BLEND_LIGHT, CM_BORDER_BLEND_DARK } from './colorMap';
import { setGameDarkMode } from './gameColors';

export type GameThemeId = 'light' | 'dark';
export const GAME_THEMES: readonly { id: GameThemeId; label: string }[] = Object.freeze([
  { id: 'light' as const, label: 'Light' },
  { id: 'dark' as const, label: 'Dark' },
]);

const KEY = 'istrong-game-theme';

const _tg = globalThis as { __ISTRONG_OLD_THEME_SYNC?: unknown; process?: { env?: Record<string, string | undefined> } };
export const THEME_SYNC_LOCKED: boolean = !(_tg.__ISTRONG_OLD_THEME_SYNC === 1 || _tg.process?.env?.ISTRONG_OLD_THEME_SYNC === '1');

let _pick: GameThemeId = 'light';
let _sync = true;
let _blend: number | null = null;
let _idNow: GameThemeId = 'light';
let _darkNow = false;
let _blendNow = CM_BORDER_BLEND_LIGHT;
let _version = 0;
const _subs = new Set<() => void>();

function uiDark(): boolean {
  if (typeof document === 'undefined') return false;
  const cl = document.documentElement?.classList;
  return !!cl && typeof cl.contains === 'function' && cl.contains('dark');
}
function idNow(): GameThemeId {
  return _sync ? (uiDark() ? 'dark' : 'light') : _pick;
}
export function themeOwnBlend(id: GameThemeId): number {
  return id === 'dark' ? CM_BORDER_BLEND_DARK : CM_BORDER_BLEND_LIGHT;
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ pick: _pick, sync: _sync, blend: _blend, blendOf: _idNow }));
  } catch { }
}

(function load(): void {
  let blendOf: unknown = null;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const o = JSON.parse(raw) as { pick?: unknown; sync?: unknown; blend?: unknown; blendOf?: unknown };
      if (o.pick === 'light' || o.pick === 'dark') _pick = o.pick;
      if (typeof o.sync === 'boolean' && !THEME_SYNC_LOCKED) _sync = o.sync;
      if (typeof o.blend === 'number' && o.blend >= 0 && o.blend <= 1) _blend = o.blend;
      blendOf = o.blendOf;
    }
  } catch { }
  _idNow = idNow();
  if (blendOf !== _idNow) _blend = null;
  _darkNow = _idNow === 'dark';
  _blendNow = _blend !== null ? _blend : themeOwnBlend(_idNow);
  writeHudTokens(_darkNow);
})();

function writeHudTokens(dark: boolean): void {
  if (typeof document === 'undefined') return;
  const st = document.documentElement?.style;
  if (!st || typeof st.setProperty !== 'function') return;
  const G = CM_USE.GENERAL;
  const ink = cmRgb(CM.BORDERS, dark, G);
  st.setProperty('--ig-stroke', cmHex(CM.BORDERS, dark, G));
  st.setProperty('--ig-text', cmHex(CM.TEXT, dark, G));
  st.setProperty('--ig-empty', cmHex(CM.BARRELS, dark, G));
  st.setProperty('--ig-pill-bg', `rgba(${ink[0]}, ${ink[1]}, ${ink[2]}, 0.5)`);
  st.setProperty('--ig-kills', cmHex(CM.BLUE, dark, G));
}

function changed(): void {
  const id = idNow();
  if (id !== _idNow) { _idNow = id; _blend = null; }
  const dark = id === 'dark';
  const blend = _blend !== null ? _blend : themeOwnBlend(id);
  save();
  setGameDarkMode(dark);
  if (dark === _darkNow && blend === _blendNow) return;
  if (dark !== _darkNow) writeHudTokens(dark);
  _darkNow = dark; _blendNow = blend;
  _version++;
  _subs.forEach(fn => fn());
}

export function gameThemeId(): GameThemeId { return _idNow; }
export function gameDark(): boolean { return _darkNow; }
export function borderBlend(): number { return _blendNow; }
export function borderBlendFor(dark: boolean): number { return dark === _darkNow ? _blendNow : themeOwnBlend(dark ? 'dark' : 'light'); }
export function gameThemeVersion(): number { return _version; }
export function gameThemeSync(): boolean { return _sync; }
export function borderBlendIsThemes(): boolean { return _blend === null; }

export function gameThemeUiChanged(): void { changed(); }
export function setGameThemeSync(on: boolean): void {
  if (THEME_SYNC_LOCKED) on = true;
  if (_sync === on) return;
  if (!on) _pick = _idNow;
  _sync = on;
  changed();
}
export function setGameThemePick(id: GameThemeId): void {
  _pick = id;
  if (_idNow === id && !_sync) { _blend = null; changed(); return; }
  changed();
}
export function setBorderBlend(v: number | null): void {
  _blend = v === null ? null : Math.max(0, Math.min(1, v));
  changed();
}

export function setPhotoGameTheme(id: GameThemeId | null): void {
  const own = idNow();
  const dark = (id ?? own) === 'dark';
  const blend = id !== null ? themeOwnBlend(id) : (_blend !== null ? _blend : themeOwnBlend(own));
  setGameDarkMode(dark);
  if (dark === _darkNow && blend === _blendNow) return;
  if (dark !== _darkNow) writeHudTokens(dark);
  _darkNow = dark; _blendNow = blend;
  _version++;
  _subs.forEach(fn => fn());
}

export function subscribeGameTheme(fn: () => void): () => void {
  _subs.add(fn);
  return () => { _subs.delete(fn); };
}
