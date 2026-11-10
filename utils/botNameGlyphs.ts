import { botNameGlyphTables, botNameGlyphCheck } from '../game/BotNames';
import type { BotNameGlyphTables } from '../game/BotNames';
import { HUD_FONT_FAMILY } from './hudArras';

const SLICE_MS = 4;
const BOX_W = 72;
const BOX_H = 44;
const DRAW_X = 24;
const DRAW_Y = 31;
const CHECK_FONT = 'bold 24px sans-serif';
const ALPHA_TOLERANCE = 40;
const DIFFERENT_PIXELS = 3;
const NOBODY_HAS_A = 0x0378;
const NOBODY_HAS_B = 0x0379;
const NOBODY_HAS_WIDE = 0x3fffd;

const MODE_UNKNOWN = 0;
const MODE_ONE_BOX = 1;
const MODE_NUMBER_BOX = 2;
const MODE_BLANK = 3;
const MODE_OFF = -1;

export const BOT_NAME_GLYPHS = {
  mode: MODE_UNKNOWN,
  done: false,
  tested: 0,
  missing: 0,
  fonts: 0, fontsOk: 0, styles: 0, stylesOk: 0, emoji: 0, emojiOk: 0, premade: 0, premadeOk: 0, extra: 0, extraOk: 0,
  ms: 0,
};

let _allowed = false;
let _scheduled = false;
let _started = false;
let _ctx: CanvasRenderingContext2D | null = null;
let _tables: BotNameGlyphTables | null = null;
let _mode = MODE_UNKNOWN;
let _refA: Uint8ClampedArray | null = null;
let _refWide: Uint8ClampedArray | null = null;
let _refWidth = 0;
let _refWidthWide = 0;
const _known = new Map<number, boolean>();
let _table = 0;
let _entry = 0;

function _showsNothing(cp: number): boolean {
  return cp === 0x20 || cp === 0xa0 || cp === 0x34f || cp === 0x61c || cp === 0x115f || cp === 0x1160
    || cp === 0x180e || (cp >= 0x2000 && cp <= 0x200f) || (cp >= 0x2028 && cp <= 0x202f)
    || (cp >= 0x205f && cp <= 0x206f) || cp === 0x2800 || cp === 0x3000 || cp === 0x3164
    || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0xfeff || cp === 0xffa0 || (cp >= 0xe0100 && cp <= 0xe01ef);
}

function _picture(cp: number): Uint8ClampedArray {
  const c = _ctx as CanvasRenderingContext2D;
  c.clearRect(0, 0, BOX_W, BOX_H);
  c.fillText(String.fromCodePoint(cp), DRAW_X, DRAW_Y);
  return c.getImageData(0, 0, BOX_W, BOX_H).data;
}

function _hasInk(px: Uint8ClampedArray): boolean {
  for (let i = 3; i < px.length; i += 4) if (px[i] > ALPHA_TOLERANCE) return true;
  return false;
}

function _samePicture(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  let diff = 0;
  for (let i = 3; i < a.length; i += 4) {
    const d = a[i] - b[i];
    if ((d > ALPHA_TOLERANCE || d < -ALPHA_TOLERANCE) && ++diff >= DIFFERENT_PIXELS) return false;
  }
  return true;
}

function _draws(cp: number): boolean {
  if (cp < 0x80 || _showsNothing(cp)) return true;
  const hit = _known.get(cp);
  if (hit !== undefined) return hit;
  let ok: boolean;
  if (_mode === MODE_NUMBER_BOX) {
    const w = (_ctx as CanvasRenderingContext2D).measureText(String.fromCodePoint(cp)).width;
    ok = w !== (cp > 0xffff ? _refWidthWide : _refWidth);
  } else {
    const px = _picture(cp);
    if (_mode === MODE_BLANK) ok = _hasInk(px);
    else ok = !_samePicture(px, _refA as Uint8ClampedArray) && !_samePicture(px, _refWide as Uint8ClampedArray);
  }
  _known.set(cp, ok);
  BOT_NAME_GLYPHS.tested++;
  if (!ok) BOT_NAME_GLYPHS.missing++;
  return ok;
}

function _drawsAll(text: string): boolean {
  let ok = true;
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i) as number;
    if (cp > 0xffff) i++;
    if (!_draws(cp)) ok = false;
  }
  return ok;
}

function _start(): boolean {
  _started = true;
  try {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    canvas.width = BOX_W;
    canvas.height = BOX_H;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    if (!c || typeof c.getImageData !== 'function' || typeof c.measureText !== 'function') return false;
    _ctx = c;
    c.font = `bold 16px ${HUD_FONT_FAMILY}`;
    c.fillText('aěαἀяҍệ', DRAW_X, DRAW_Y);
    c.font = CHECK_FONT;
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#000';
    const a = _picture(NOBODY_HAS_A).slice();
    const b = _picture(NOBODY_HAS_B).slice();
    const wide = _picture(NOBODY_HAS_WIDE).slice();
    if (!_hasInk(a) && !_hasInk(b)) _mode = MODE_BLANK;
    else if (_samePicture(a, b)) _mode = MODE_ONE_BOX;
    else _mode = MODE_NUMBER_BOX;
    _refA = a;
    _refWide = wide;
    _refWidth = c.measureText(String.fromCodePoint(NOBODY_HAS_A)).width;
    _refWidthWide = c.measureText(String.fromCodePoint(NOBODY_HAS_WIDE)).width;
    if (!_hasInk(_picture(0x4d))) return false;
    _tables = botNameGlyphTables();
    const t = _tables;
    BOT_NAME_GLYPHS.fonts = t.fontText.length;
    BOT_NAME_GLYPHS.styles = t.styleText.length;
    BOT_NAME_GLYPHS.emoji = t.emoji.length;
    BOT_NAME_GLYPHS.premade = t.premade.length;
    BOT_NAME_GLYPHS.extra = t.extra.length;
    return true;
  } catch {
    return false;
  }
}

function _step(): void {
  const t = _tables as BotNameGlyphTables;
  const list = _table === 0 ? t.fontText : _table === 1 ? t.emoji : _table === 2 ? t.styleText : _table === 3 ? t.premade : t.extra;
  if (_entry >= list.length) {
    _table++;
    _entry = 0;
    if (_table > 4) { BOT_NAME_GLYPHS.done = true; _ctx = null; _refA = null; _refWide = null; }
    return;
  }
  const i = _entry++;
  let ok = false;
  try { ok = _drawsAll(list[i]); } catch { ok = false; }
  if (!ok) return;
  if (_table === 0) { t.fontOk[i] = 1; BOT_NAME_GLYPHS.fontsOk++; }
  else if (_table === 1) { t.emojiOk[i] = 1; BOT_NAME_GLYPHS.emojiOk++; }
  else if (_table === 2) { t.styleOk[i] = 1; BOT_NAME_GLYPHS.stylesOk++; }
  else if (_table === 3) { t.premadeOk[i] = 1; BOT_NAME_GLYPHS.premadeOk++; }
  else { t.extraOk[i] = 1; BOT_NAME_GLYPHS.extraOk++; }
}

function _slice(): void {
  _scheduled = false;
  if (!_allowed || BOT_NAME_GLYPHS.done) return;
  const t0 = performance.now();
  let now = t0;
  while (!BOT_NAME_GLYPHS.done && now - t0 < SLICE_MS) {
    _step();
    now = performance.now();
  }
  BOT_NAME_GLYPHS.ms += now - t0;
  if (!BOT_NAME_GLYPHS.done) _schedule();
}

function _schedule(): void {
  if (_scheduled) return;
  _scheduled = true;
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(_slice, { timeout: 500 });
  else setTimeout(_slice, 30);
}

export function botNameGlyphsRun(allowed: boolean): void {
  _allowed = allowed;
  if (!allowed || BOT_NAME_GLYPHS.done) return;
  if (!_started) {
    if (!_start()) {
      _mode = MODE_OFF;
      BOT_NAME_GLYPHS.mode = MODE_OFF;
      BOT_NAME_GLYPHS.done = true;
      _ctx = null;
      return;
    }
    BOT_NAME_GLYPHS.mode = _mode;
    botNameGlyphCheck(true);
    try { (window as unknown as { __botNameGlyphs?: typeof BOT_NAME_GLYPHS }).__botNameGlyphs = BOT_NAME_GLYPHS; } catch { }
  }
  if (_mode === MODE_OFF) return;
  _schedule();
}
