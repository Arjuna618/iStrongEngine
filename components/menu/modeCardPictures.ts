import type { TankConfig } from '../../types';
import { teamOverrideColor, setTeamTwoGreen, teamTwoGreenNow } from '../../types';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import { mmMapOf, ENT_STRIDE, ENT_TEAM_BASE, type ModePicFile, type ModePicEntry } from '../maps/mapPicData';
import { mmPaintMap } from '../minimapPicture';
import { cardColors } from '../maps/mapCardColors';
import { hudColors, hudMinimapDot, HUD_MM_BG_ALPHA } from '../../utils/hudArras';
import { hudBuildIcon, hudDrawIcon, type HudIcon } from '../../utils/hudIcon2d';
import { ctIconSpan } from '../../utils/classTreeIcon';
import { cmHex, CM_USE } from '../../utils/colorMap';
import { bodyFill } from '../../utils/gameColors';
import { getPlayEntry, cardWearsTeamTwoGreen } from '../../game/gameModeRegistry';
import { CARD_ASPECT_MIN as ASPECT_MIN, CARD_ASPECT_MAX as ASPECT_MAX } from '../maps/mapCatalog';
import { pumpkinRocksOf, findOtherDesign, PUMPKIN_ID } from '../../utils/halloween';
import type { LibraryItem } from '../../types';

const PIC_H = 360;
const OUTLINE_MIN_PX = 0.6;

let _file: ModePicFile | null = null;
let _load: Promise<ModePicFile | null> | null = null;
const _byKey = new Map<string, ModePicEntry>();
const _url = new Map<string, string>();
const _making = new Map<number, Promise<void>>();
const _subs = new Set<() => void>();
let _version = 0;
const changed = (): void => { _version++; _subs.forEach(f => f()); };

export const modeCardPictures = {
  subscribe(fn: () => void): () => void { _subs.add(fn); return () => { _subs.delete(fn); }; },
  version(): number { return _version; },
};

function loadFile(): Promise<ModePicFile | null> {
  if (_load) return _load;
  _load = import('../maps/modePictures.generated.json').then((m) => {
    const f = ((m as unknown as { default?: ModePicFile }).default ?? (m as unknown as ModePicFile));
    _file = f;
    for (const e of f.modes) _byKey.set(e.key, e);
    changed();
    return f;
  }).catch(() => { _load = null; return null; });
  return _load;
}

export function modeCardAspect(mapKey: string): number {
  const e = _byKey.get(mapKey);
  if (!e || !(e.mapHalfY > 0)) return 16 / 9;
  return Math.max(ASPECT_MIN, Math.min(ASPECT_MAX, e.mapHalf / e.mapHalfY));
}
export function modeCardUrl(mapKey: string, dark: boolean): string | null { return _url.get(mapKey + (dark ? '|1' : '|0')) ?? null; }

const _icons = new Map<string, HudIcon>();
const _spans = new Map<number, number>();
function iconOf(t: number, c: number, dark: boolean, design: TankConfig): HudIcon {
  const key = t + '|' + c + '|' + (dark ? 1 : 0) + (teamTwoGreenNow() ? '|g' : '');
  let ic = _icons.get(key);
  if (!ic) {
    const over = c >= ENT_TEAM_BASE ? teamOverrideColor(c - ENT_TEAM_BASE, dark) : c >= 0 ? cmHex(c, dark, CM_USE.TANK) : undefined;
    ic = hudBuildIcon(design, dark, over);
    _icons.set(key, ic);
  }
  return ic;
}

function paint(e: ModePicEntry, dark: boolean, pumpkinDot: string, designs: readonly unknown[]): OffscreenCanvas | HTMLCanvasElement | null {
  const aspect = e.mapHalfY > 0 ? Math.max(ASPECT_MIN, Math.min(ASPECT_MAX, e.mapHalf / e.mapHalfY)) : 1;
  const h = PIC_H, w = Math.max(1, Math.round(PIC_H * aspect));
  const cv: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  const col = cardColors(dark);
  const real = e.mapHalfY > 0 ? e.mapHalf / e.mapHalfY : 1;
  let mw = w, mh = w / real;
  if (mh > h) { mh = h; mw = h * real; }
  mw = Math.max(1, Math.round(mw)); mh = Math.max(1, Math.round(mh));
  const ox = Math.round((w - mw) / 2), oy = Math.round((h - mh) / 2);
  if (mw < w || mh < h) {
    ctx.globalAlpha = HUD_MM_BG_ALPHA;
    ctx.fillStyle = (col ?? hudColors(dark)).mmBg;
    ctx.fillRect(0, 0, w, h);
    ctx.clearRect(ox, oy, mw, mh);
    ctx.globalAlpha = 1;
  }
  ctx.translate(ox, oy);
  const map = mmMapOf(e);
  map.marks = undefined;
  mmPaintMap(ctx, dark, map, mw, mh, 1.2, 0, 0, pumpkinDot, col);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  const ents = e.ents;
  if (ents && ents.length > 0) {
    const sx = mw / (2 * e.mapHalf), sy = mh / (2 * e.mapHalfY);
    const outline = Math.max(OUTLINE_MIN_PX, 3 * sx);
    for (let i = 0; i + ENT_STRIDE - 1 < ents.length; i += ENT_STRIDE) {
      const t = ents[i + 5], design = designs[t] as TankConfig | undefined;
      if (!design) continue;
      let span = _spans.get(t);
      if (span === undefined) { span = ctIconSpan(design); _spans.set(t, span); }
      const size = ents[i + 2] * span * sx;
      if (!(size > 0.3)) continue;
      hudDrawIcon(ctx, iconOf(t, ents[i + 4], dark, design), ox + (ents[i] + e.mapHalf) * sx, oy + (ents[i + 1] + e.mapHalfY) * sy, size, ents[i + 3], outline, 1);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return cv;
}

async function toUrl(cv: OffscreenCanvas | HTMLCanvasElement): Promise<string | null> {
  try {
    const blob = 'convertToBlob' in cv
      ? await cv.convertToBlob({ type: 'image/webp', quality: 0.92 })
      : await new Promise<Blob | null>((res) => (cv as HTMLCanvasElement).toBlob(res, 'image/webp', 0.92));
    return blob ? URL.createObjectURL(blob) : null;
  } catch { return null; }
}

export function prepareModeCardPictures(dark: boolean, others: readonly LibraryItem[]): Promise<void> {
  const k = dark ? 1 : 0;
  const was = _making.get(k);
  if (was) return was;
  const job = (async () => {
    const f = await loadFile();
    if (!f) return;
    const pk = findOtherDesign(others as LibraryItem[], PUMPKIN_ID);
    const pumpkin = pk !== null ? hudMinimapDot(bodyFill(pk.body.color, pk.body.colorMap), dark) : '';
    const designs = f.designs ?? [];
    let slice = performance.now();
    for (const e of f.modes) {
      const key = e.key + (dark ? '|1' : '|0');
      if (_url.has(key)) continue;
      const entry = getPlayEntry(e.key);
      const was = teamTwoGreenNow(), green = SMALL_FIX.R936 !== 0 && entry ? cardWearsTeamTwoGreen(entry) : was;
      if (green !== was) setTeamTwoGreen(green);
      let cv: ReturnType<typeof paint>;
      try { cv = paint(e, dark, entry && pumpkinRocksOf(entry) ? pumpkin : '', designs); } finally { if (green !== was) setTeamTwoGreen(was); }
      if (!cv) continue;
      const url = await toUrl(cv);
      if (url) _url.set(key, url);
      if (performance.now() - slice > 8) { changed(); await new Promise((r) => setTimeout(r, 0)); slice = performance.now(); }
    }
    changed();
  })();
  _making.set(k, job);
  job.catch(() => { _making.delete(k); });
  return job;
}

export function loadModeCardData(): Promise<unknown> { return loadFile(); }
