import {
  NAME_FONTS, NAME_STYLES, NAME_EMOJI_HOT, NAME_EMOJI_MORE, NAME_PREMADE, NAME_LOOKALIKE, NAME_TOUCH, NAME_TAG_SYMBOL,
} from './botNameData';
import type { NameFont } from './botNameData';
import {
  NW_HANDLE, NW_ADJ, NW_NOUN, NW_FIRST, NW_COIN_A, NW_COIN_MID, NW_COIN_B, NW_COIN_CODA, NW_TITLE, NW_TAG,
  NW_CLAN, NW_FUNNY, NW_KIND, NW_TANK, NW_PHRASE, NW_TINY, NW_N2_A, NW_N2_B,
} from './botNameWords';

export const BOT_NAME_TUNING = {
  premade: 0.13,
  font: 0.35,
  mixedCase: 0.05,
  emoji: 0.20,
  style: 0.14,
  longFrame: 0.3,
  longPremade: 0.3,
  fontClass: [0.46, 0.32, 0.12, 0.10] as readonly number[],

  fontOneWord: 0.5,
  endTag: 0.28,
  lookalike: 0.04,
  stretch: 0.05,
  touch: 0.05,
};

export const BOT_NAME_FIT = 120;
export const BOT_NAME_FRAME_FIT = 130;
export const BOT_NAME_LONG = 240;

const _W: readonly number[] = [
  0x0, 0x1f, 0, 0x20, 0x20, 4, 0x21, 0x2f, 6, 0x30, 0x39, 11, 0x3a, 0x40, 7, 0x41, 0x5a, 12, 0x5b, 0x60, 6,
  0x61, 0x7a, 10, 0x7b, 0x7e, 6, 0x7f, 0x9f, 0, 0xa0, 0xa0, 4, 0xa1, 0xbf, 8, 0xc0, 0x24f, 11,
  0x250, 0x2af, 10, 0x2b0, 0x2ff, 6, 0x300, 0x36f, 0, 0x370, 0x3ff, 11, 0x400, 0x482, 11, 0x483, 0x489, 0,
  0x48a, 0x52f, 11, 0x530, 0x58f, 11, 0x591, 0x5c7, 0, 0x5d0, 0x5ff, 9, 0x600, 0x60f, 10, 0x610, 0x61a, 0,
  0x61b, 0x64a, 9, 0x64b, 0x65f, 0, 0x660, 0x6d5, 9, 0x6d6, 0x6dc, 0, 0x6dd, 0x6de, 16, 0x6df, 0x6e8, 0,
  0x6e9, 0x6ff, 9, 0x700, 0x8ff, 10, 0x900, 0xdff, 11, 0xe00, 0xe30, 10, 0xe31, 0xe31, 0, 0xe32, 0xe33, 10,
  0xe34, 0xe3a, 0, 0xe3f, 0xe46, 10, 0xe47, 0xe4e, 0, 0xe4f, 0xeb0, 10, 0xeb1, 0xeb1, 0, 0xeb2, 0xeb3, 10,
  0xeb4, 0xebc, 0, 0xebd, 0xec7, 10, 0xec8, 0xecd, 0, 0xece, 0xeff, 10, 0xf00, 0xf17, 12, 0xf18, 0xf19, 0,
  0xf1a, 0xf34, 12, 0xf35, 0xf39, 0, 0xf3a, 0xf70, 12, 0xf71, 0xf87, 0, 0xf88, 0xfff, 12, 0x1000, 0x109f, 12,
  0x10a0, 0x10ff, 11, 0x1100, 0x11ff, 17, 0x1200, 0x139f, 14, 0x13a0, 0x13ff, 13, 0x1400, 0x167f, 14,
  0x1680, 0x16ff, 10, 0x1700, 0x1aff, 12, 0x1b00, 0x1b03, 0, 0x1b04, 0x1b33, 14, 0x1b34, 0x1b44, 0,
  0x1b45, 0x1cff, 12, 0x1d00, 0x1d2b, 10, 0x1d2c, 0x1d6a, 7, 0x1d6b, 0x1d9a, 10, 0x1d9b, 0x1dbf, 7,
  0x1dc0, 0x1dff, 0, 0x1e00, 0x1fff, 11, 0x2000, 0x200a, 5, 0x200b, 0x200f, 0, 0x2010, 0x2027, 7,
  0x2028, 0x202e, 0, 0x202f, 0x205f, 6, 0x2060, 0x206f, 0, 0x2070, 0x209f, 7, 0x20a0, 0x20cf, 11,
  0x20d0, 0x20ff, 0, 0x2100, 0x214f, 12, 0x2150, 0x218f, 13, 0x2190, 0x21ff, 15, 0x2200, 0x22ff, 13,
  0x2300, 0x23ff, 15, 0x2400, 0x245f, 12, 0x2460, 0x24ff, 17, 0x2500, 0x259f, 12, 0x25a0, 0x25ff, 14,
  0x2600, 0x26ff, 16, 0x2700, 0x27bf, 15, 0x27c0, 0x27ef, 14, 0x27f0, 0x27ff, 17, 0x2800, 0x28ff, 11,
  0x2900, 0x2bff, 16, 0x2c00, 0x2ddf, 12, 0x2de0, 0x2dff, 0, 0x2e00, 0x2e7f, 8, 0x2e80, 0x2fff, 17,
  0x3000, 0x3029, 17, 0x302a, 0x302f, 0, 0x3030, 0x3098, 17, 0x3099, 0x309a, 0, 0x309b, 0xa4cf, 17,
  0xa4d0, 0xa4ff, 11, 0xa500, 0xa63f, 14, 0xa640, 0xa66e, 12, 0xa66f, 0xa67d, 0, 0xa67e, 0xa69f, 12,
  0xa6a0, 0xa7ff, 11, 0xa800, 0xa97f, 12, 0xa980, 0xa983, 0, 0xa984, 0xa9b2, 16, 0xa9b3, 0xa9c0, 0,
  0xa9c1, 0xa9cf, 20, 0xa9d0, 0xabff, 12, 0xac00, 0xd7ff, 17, 0xe000, 0xf8ff, 12, 0xf900, 0xfaff, 17,
  0xfb00, 0xfdff, 10, 0xfe00, 0xfe0f, 0, 0xfe10, 0xfe1f, 17, 0xfe20, 0xfe2f, 0, 0xfe30, 0xfe6f, 17,
  0xfe70, 0xfefe, 10, 0xfeff, 0xfeff, 0, 0xff00, 0xff60, 17, 0xff61, 0xffdc, 9, 0xffe0, 0xffe6, 17,
  0xffe8, 0xffff, 9, 0x10000, 0x1107f, 12, 0x12000, 0x1254f, 22, 0x13000, 0x1345f, 17, 0x1d400, 0x1d7ff, 12,
  0x1f000, 0x1f0ff, 18, 0x1f100, 0x1f1ff, 18, 0x1f200, 0x1f2ff, 18, 0x1f300, 0x1faff, 20, 0x1fb00, 0x1fbff, 12,
  0x20000, 0x3ffff, 17, 0xe0000, 0xe0fff, 0,
];
const _W_N = _W.length / 3;

export function botNameCellW(cp: number): number {
  let lo = 0, hi = _W_N - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (cp < _W[m * 3]) hi = m - 1;
    else if (cp > _W[m * 3 + 1]) lo = m + 1;
    else return _W[m * 3 + 2];
  }
  return 12;
}

export function botNameCells(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i) as number;
    if (cp > 0xffff) i++;
    n += botNameCellW(cp);
  }
  return n;
}

let _sa = 0, _sb = 0, _sc = 0, _sd = 0;

function _rnd(): number {
  const t = (((_sa + _sb) | 0) + _sd) | 0;
  _sd = (_sd + 1) | 0;
  _sa = _sb ^ (_sb >>> 9);
  _sb = (_sc + (_sc << 3)) | 0;
  _sc = (_sc << 21) | (_sc >>> 11);
  _sc = (_sc + t) | 0;
  return (t >>> 0) / 4294967296;
}

function _seed(r1: number, r2: number): void {
  _sa = (r1 * 4294967296) >>> 0;
  _sb = (r2 * 4294967296) >>> 0;
  _sc = 0x9e3779b9 | 0;
  _sd = 1;
  for (let i = 0; i < 12; i++) _rnd();
}

function _ri(n: number): number { return (_rnd() * n) | 0; }
function _chance(p: number): boolean { return _rnd() < p; }
function _pick(a: readonly string[]): string { return a[(_rnd() * a.length) | 0]; }

interface FontRt {
  L: readonly string[] | null;
  U: readonly string[] | null;
  D: readonly string[] | null;
  wL: Uint8Array;
  wU: Uint8Array;
  wD: Uint8Array;
  oneCase: boolean;
  a: string; p: string; q: string; j: string; z: string;
  ca: number; cp: number; cq: number; cj: number; cz: number;
  rev: boolean;
}

export interface BotNameGlyphTables {
  fontText: readonly string[];
  styleText: readonly string[];
  emoji: readonly string[];
  premade: readonly string[];
  extra: readonly string[];
  fontOk: Uint8Array;
  styleOk: Uint8Array;
  emojiOk: Uint8Array;
  premadeOk: Uint8Array;
  extraOk: Uint8Array;
}

const _EX_LOOK = 0;
const _EX_TOUCH = NAME_LOOKALIKE.length;
const _EX_TAGSYM = _EX_TOUCH + NAME_TOUCH.length;

let _ready = false;
let _fonts: FontRt[] = [];
let _fontClass: number[][] = [[], [], [], []];
let _stylePre: string[] = [];
let _stylePost: string[] = [];
let _styleCells: Uint16Array = new Uint16Array(0);
let _premadeCells: Uint16Array = new Uint16Array(0);
let _emoji: string[] = [];
let _emojiHotN = 0;
let _tables: BotNameGlyphTables | null = null;
let _checked = false;

function _glyphList(v: string | readonly string[] | undefined): readonly string[] | null {
  if (v === undefined) return null;
  return typeof v === 'string' ? Array.from(v) : v;
}

function _widths(g: readonly string[] | null, n: number): Uint8Array {
  const w = new Uint8Array(n);
  if (g !== null) for (let i = 0; i < n && i < g.length; i++) w[i] = Math.min(255, botNameCells(g[i]));
  return w;
}

function _init(): void {
  _ready = true;
  const fontText: string[] = [];
  _fonts = [];
  _fontClass = [[], [], [], []];
  for (let i = 0; i < NAME_FONTS.length; i++) {
    const f: NameFont = NAME_FONTS[i];
    const L = _glyphList(f.l);
    const U = L === null ? null : (_glyphList(f.u) ?? L);
    const D = f.d === undefined ? null : Array.from(f.d);
    const a = f.a ?? '', p = f.p ?? '', q = f.q ?? '', j = f.j ?? '', z = f.z ?? '';
    _fonts.push({
      L, U, D, wL: _widths(L, 26), wU: _widths(U, 26), wD: _widths(D, 10),
      oneCase: L !== null && U !== null && L.join('') === U.join(''),
      a, p, q, j, z,
      ca: botNameCells(a), cp: botNameCells(p), cq: botNameCells(q), cj: botNameCells(j), cz: botNameCells(z),
      rev: f.rev === true,
    });
    _fontClass[f.t].push(i);
    fontText.push((L ? L.join('') : '') + (U ? U.join('') : '') + (D ? D.join('') : '') + a + p + q + j + z);
  }
  const styleText: string[] = [];
  _stylePre = [];
  _stylePost = [];
  _styleCells = new Uint16Array(NAME_STYLES.length);
  for (let i = 0; i < NAME_STYLES.length; i++) {
    const s = NAME_STYLES[i];
    const at = s.indexOf('{N}');
    const pre = at < 0 ? '' : s.slice(0, at);
    const post = at < 0 ? '' : s.slice(at + 3);
    _stylePre.push(pre);
    _stylePost.push(post);
    _styleCells[i] = at < 0 ? 65535 : Math.min(65535, botNameCells(pre) + botNameCells(post));
    styleText.push(pre + post);
  }
  _premadeCells = new Uint16Array(NAME_PREMADE.length);
  for (let i = 0; i < NAME_PREMADE.length; i++) _premadeCells[i] = Math.min(65535, botNameCells(NAME_PREMADE[i]));
  _emoji = NAME_EMOJI_HOT.concat(NAME_EMOJI_MORE);
  _emojiHotN = NAME_EMOJI_HOT.length;
  const extra: string[] = [];
  for (let i = 0; i < NAME_LOOKALIKE.length; i++) extra.push(NAME_LOOKALIKE[i][1]);
  for (let i = 0; i < NAME_TOUCH.length; i++) extra.push(NAME_TOUCH[i]);
  for (let i = 0; i < NAME_TAG_SYMBOL.length; i++) extra.push(NAME_TAG_SYMBOL[i]);
  _lookFrom = '';
  for (let i = 0; i < NAME_LOOKALIKE.length; i++) _lookFrom += NAME_LOOKALIKE[i][0];
  _tables = {
    fontText, styleText, emoji: _emoji, premade: NAME_PREMADE, extra,
    fontOk: new Uint8Array(NAME_FONTS.length), styleOk: new Uint8Array(NAME_STYLES.length),
    emojiOk: new Uint8Array(_emoji.length), premadeOk: new Uint8Array(NAME_PREMADE.length),
    extraOk: new Uint8Array(extra.length),
  };
}

let _lookFrom = '';

function _extraOk(i: number): boolean {
  return !_checked || (_tables as BotNameGlyphTables).extraOk[i] === 1;
}

export function botNameGlyphTables(): BotNameGlyphTables {
  if (!_ready) _init();
  return _tables as BotNameGlyphTables;
}

export function botNameGlyphCheck(on: boolean): void {
  _checked = on;
}

let _bFirst = false;
let _bCamel = false;
let _bPhrase = false;
let _bTag = false;

const _recentWords: string[] = [];
for (let i = 0; i < 64; i++) _recentWords.push('');
let _recentWordAt = 0;

function _word(bank: readonly string[]): string {
  let w = bank[_ri(bank.length)];
  for (let t = 0; t < 3 && _recentWords.indexOf(w) >= 0; t++) w = bank[_ri(bank.length)];
  _recentWords[_recentWordAt] = w;
  _recentWordAt = (_recentWordAt + 1) & 63;
  return w;
}

function _plainNumber(n: number): number {
  return (n === 69 || n === 88 || n === 420 || n === 666 || n === 911) ? n + 1 : n;
}

const _SPECIAL_NUM: readonly string[] = ['007', '123', '321', '404', '999', '1337', '2k', '3000', '9000', 'x2', '101', '360', '777', '000', '001'];

function _number(): string {
  const r = _rnd();
  if (r < 0.18) return String(1 + _ri(9));
  if (r < 0.55) return String(_plainNumber(10 + _ri(90)));
  if (r < 0.66) return '0' + (1 + _ri(9));
  if (r < 0.80) return String(_plainNumber(100 + _ri(900)));
  if (r < 0.88) return String(2005 + _ri(11));
  return _pick(_SPECIAL_NUM);
}

function _withNumber(s: string): string {
  const r = _rnd();
  if (r < 0.14) return _number() + (r < 0.07 ? ' ' : '') + s;
  return s + (r < 0.70 ? '' : r < 0.90 ? '_' : ' ') + _number();
}

function _caseWord(w: string, pTitle: number, pLower: number): string {
  const r = _rnd();
  return r < pTitle ? w : r < pTitle + pLower ? w.toLowerCase() : w.toUpperCase();
}

function _coined(): string {
  const r = _rnd();
  let s = _pick(NW_COIN_A);
  if (r < 0.18) s += _pick(NW_COIN_CODA);
  else if (r < 0.30) s += _pick(NW_COIN_MID) + _pick(NW_COIN_B);
  else s += _pick(NW_COIN_B);
  const c = _rnd();
  if (c < 0.60) return s;
  if (c < 0.88) return s.toLowerCase();
  if (c < 0.95) return s.toUpperCase();
  return s.slice(0, s.length - 1) + s.charAt(s.length - 1).toUpperCase();
}

function _join2(a: string, b: string): string {
  const r = _rnd();
  if (r < 0.21) { _bCamel = true; return a + b; }
  if (r < 0.24) { _bCamel = true; return a.toLowerCase() + b; }
  if (r < 0.54) return a + ' ' + b;
  if (r < 0.79) return (a + ' ' + b).toLowerCase();
  if (r < 0.86) return (a + ' ' + b).toUpperCase();
  if (r < 0.90) return a + '_' + b;
  if (r < 0.92) return (a + '_' + b).toLowerCase();
  if (r < 0.93) return (a + '_' + b).toUpperCase();
  if (r < 0.96) return (a + '.' + b).toLowerCase();
  if (r < 0.98) return a + '-' + b;
  return (a + '-' + b).toLowerCase();
}

function _twoWords(): string {
  let a = _word(NW_ADJ);
  let b = _chance(0.7) ? _word(NW_NOUN) : _word(NW_HANDLE);
  for (let t = 0; t < 5 && a.length + b.length > 11; t++) {
    a = _pick(NW_ADJ);
    b = _chance(0.7) ? _pick(NW_NOUN) : _pick(NW_HANDLE);
  }
  return _join2(a, b);
}

function _titled(): string {
  const t = _pick(NW_TITLE);
  let w: string;
  if (_chance(0.35)) { w = _word(NW_FIRST); _bFirst = true; } else w = _word(NW_HANDLE);
  const r = _rnd();
  if (r < 0.20) { _bCamel = true; return t + w; }
  if (r < 0.70) return t + ' ' + w;
  if (r < 0.85) return (t + ' ' + w).toLowerCase();
  if (r < 0.93) return t + '_' + w;
  return (t + ' ' + w).toUpperCase();
}

function _firstName(): string {
  _bFirst = true;
  const n = _word(NW_FIRST);
  const r = _rnd();
  if (r < 0.38) return n;
  if (r < 0.62) return n.toLowerCase();
  if (r < 0.67) return n.toUpperCase();
  if (r < 0.83) return _withNumber(_chance(0.5) ? n : n.toLowerCase());
  const tag = _pick(NW_TAG);
  const k = _rnd();
  if (k < 0.25) { _bCamel = true; return n + tag; }
  if (k < 0.60) return n + '_' + tag;
  if (k < 0.85) return n + ' ' + tag;
  return (n + ' ' + tag).toLowerCase();
}

function _phrase(): string {
  _bPhrase = true;
  const t = _pick(NW_PHRASE);
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t.charAt(i);
    if (c !== '{') { out += c; continue; }
    const k = t.charAt(i + 1);
    i += 2;
    if (k === 'a') out += _word(NW_ADJ).toLowerCase();
    else if (k === 'k') out += _pick(NW_KIND);
    else if (k === 'f') out += _pick(NW_FUNNY);
    else if (k === 'n') { out += _word(NW_FIRST).toLowerCase(); _bFirst = true; }
    else if (k === 't') out += _pick(NW_TANK);
    else if (k === 'h') out += _word(NW_HANDLE).toLowerCase();
    else if (k === 'd') out += String(_plainNumber(1 + _ri(999)));
  }
  const r = _rnd();
  if (r < 0.80) return out;
  if (r < 0.92) {
    let cap = '';
    let up = true;
    for (let i = 0; i < out.length; i++) {
      const c = out.charAt(i);
      cap += up ? c.toUpperCase() : c;
      up = c === ' ';
    }
    return cap;
  }
  return out.toUpperCase();
}

function _clan(): string {
  _bTag = true;
  let tag = _pick(NW_CLAN);
  if (_chance(0.35)) tag = tag.toLowerCase();
  const n = _chance(0.5) ? _coined() : _word(NW_HANDLE);
  const r = _rnd();
  if (r < 0.48) return '[' + tag + '] ' + n;
  if (r < 0.82) return '[' + tag + ']' + n;
  if (r < 0.87) return tag + ' | ' + n;
  if (r < 0.92) return tag + '_' + n;
  if (r < 0.97) return tag + ' ' + n;
  return tag + '.' + n;
}

function _tiny(): string {
  const r = _rnd();
  if (r < 0.40) {
    const c = String.fromCharCode(97 + _ri(26));
    return _chance(0.55) ? c : c.toUpperCase();
  }
  const w = _word(NW_TINY);
  const k = _rnd();
  return k < 0.70 ? w : k < 0.88 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
}

function _wordNumWord(): string {
  _bCamel = true;
  return _pick(NW_N2_A) + (_chance(0.5) ? '2' : '4') + _pick(NW_N2_B);
}

function _leet(): string {
  let s: string;
  if (_chance(0.5)) s = _word(NW_HANDLE);
  else {
    let a = _pick(NW_ADJ), b = _pick(NW_NOUN);
    for (let t = 0; t < 5 && a.length + b.length > 11; t++) { a = _pick(NW_ADJ); b = _pick(NW_NOUN); }
    if (_chance(0.4)) s = a + '_' + b; else { s = a + b; _bCamel = true; }
  }
  let out = '';
  let changed = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    const l = c.toLowerCase();
    const d = l === 'a' ? '4' : l === 'e' ? '3' : l === 'i' ? '1' : l === 'o' ? '0' : l === 's' ? '5' : l === 't' ? '7' : '';
    if (d !== '' && i > 0 && c === l && _chance(changed ? 0.5 : 0.8)) { out += d; changed = true; } else out += c;
  }
  return out;
}

function _spacedLetters(w: string): string {
  let out = '';
  for (let i = 0; i < w.length; i++) out += (i > 0 ? ' ' : '') + w.charAt(i);
  return out;
}

function _makeBase(): string {
  _bFirst = false;
  _bCamel = false;
  _bPhrase = false;
  _bTag = false;
  const r = _rnd();
  let s: string;
  if (r < 0.18) {
    const w = _word(NW_HANDLE);
    if (w.length <= 6 && _chance(0.04)) { BOT_NAME_LAST.kind = 'spaced letters'; return _spacedLetters(_chance(0.7) ? w.toUpperCase() : w.toLowerCase()); }
    BOT_NAME_LAST.kind = 'word';
    s = _caseWord(w, 0.50, 0.38);
  } else if (r < 0.32) { BOT_NAME_LAST.kind = 'coined'; s = _coined(); }
  else if (r < 0.51) { BOT_NAME_LAST.kind = 'two words'; s = _twoWords(); }
  else if (r < 0.56) { BOT_NAME_LAST.kind = 'title'; return _titled(); }
  else if (r < 0.63) { BOT_NAME_LAST.kind = 'first name'; return _firstName(); }
  else if (r < 0.77) { BOT_NAME_LAST.kind = 'phrase'; return _phrase(); }
  else if (r < 0.86) { BOT_NAME_LAST.kind = 'clan'; return _clan(); }
  else if (r < 0.89) { BOT_NAME_LAST.kind = 'leet'; return _leet(); }
  else if (r < 0.985) { BOT_NAME_LAST.kind = 'tiny'; return _tiny(); }
  else { BOT_NAME_LAST.kind = 'word digit word'; return _wordNumWord(); }
  return _chance(0.09) ? _withNumber(s) : s;
}

function _stretch(s: string): string {
  const n = s.length;
  if (n < 3 || n > 10) return '';
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 32)) return '';
  }
  let at = n - 1;
  if ('aeiouyAEIOUY'.indexOf(s.charAt(at)) < 0) {
    at = -1;
    for (let i = n - 2; i > 0; i--) if ('aeiouAEIOU'.indexOf(s.charAt(i)) >= 0) { at = i; break; }
    if (at < 0) return '';
  }
  const c = s.charAt(at);
  const k = 2 + _ri(3);
  let out = s.slice(0, at + 1);
  for (let i = 0; i < k; i++) out += c;
  return out + s.slice(at + 1);
}

function _lookalike(s: string): string {
  let out = s;
  const swaps = _chance(0.7) ? 1 : 2;
  for (let k = 0; k < swaps; k++) {
    let can = 0;
    for (let i = 1; i < out.length; i++) { const j = _lookFrom.indexOf(out.charAt(i)); if (j >= 0 && _extraOk(_EX_LOOK + j)) can++; }
    if (can === 0) break;
    let pick = _ri(can);
    for (let i = 1; i < out.length; i++) {
      const j = _lookFrom.indexOf(out.charAt(i));
      if (j < 0 || !_extraOk(_EX_LOOK + j)) continue;
      if (pick-- === 0) { out = out.slice(0, i) + NAME_LOOKALIKE[j][1] + out.slice(i + 1); break; }
    }
  }
  return out;
}

function _shortWord(): string {
  let w = _pick(NW_FUNNY);
  for (let t = 0; t < 4 && w.length > 5; t++) w = _pick(NW_FUNNY);
  return w.length > 5 ? _pick(NW_TINY) : w;
}

function _endTag(s: string): string {
  for (let t = 0; t < 4; t++) {
    const r = _rnd();
    let tag: string;
    if (r < 0.30) tag = _pick(NW_CLAN);
    else if (r < 0.50) tag = _pick(NW_CLAN).toLowerCase();
    else if (r < 0.68) tag = _shortWord();
    else if (r < 0.80) { const k = _pick(NW_TANK); tag = _chance(0.6) ? k.charAt(0).toUpperCase() + k.slice(1) : k; }
    else if (r < 0.88) tag = _pick(NW_TAG);
    else if (r < 0.95) { const c = String.fromCharCode(97 + _ri(26)); tag = _chance(0.5) ? c : c.toUpperCase(); }
    else {
      const i = _ri(NAME_TAG_SYMBOL.length);
      if (!_extraOk(_EX_TAGSYM + i)) continue;
      tag = NAME_TAG_SYMBOL[i];
    }
    const round = _chance(0.07);
    const out = s + (_chance(0.62) ? ' ' : '') + (round ? '(' : '[') + tag + (round ? ')' : ']');
    if (botNameCells(out) <= (t < 2 ? BOT_NAME_FIT : BOT_NAME_FRAME_FIT)) return out;
  }
  return '';
}

function _endsInDigit(s: string): boolean {
  if (s.length === 0) return false;
  let i = s.length - 1;
  const lo = s.charCodeAt(i);
  if (lo >= 0xdc00 && lo <= 0xdfff && i > 0) i--;
  return _RE_DIGIT.test(String.fromCodePoint(s.codePointAt(i) as number));
}

function _spaceCamel(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (i > 0 && c >= 65 && c <= 90) {
      const p = s.charCodeAt(i - 1);
      if ((p >= 97 && p <= 122) || (p >= 48 && p <= 57)) out += ' ';
    }
    out += s.charAt(i);
  }
  return out;
}

function _mixCase(s: string): string {
  const alternate = _chance(0.55);
  let up = _chance(0.5);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    const l = c.toLowerCase(), u = c.toUpperCase();
    if (l === u) { out += c; continue; }
    if (!alternate) up = _chance(0.5);
    out += up ? u : l;
    if (alternate) up = !up;
  }
  return out;
}

function _rtl(cp: number): boolean {
  return (cp >= 0x0590 && cp <= 0x08ff) || (cp >= 0xfb1d && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfefe)
    || (cp >= 0x10800 && cp <= 0x10fff) || (cp >= 0x1e800 && cp <= 0x1efff);
}
const _RE_LETTER = /\p{L}/u;
const _RE_MARK = /\p{M}/u;
const _RE_LOWER = /\p{Ll}/u;
const _RE_DIGIT = /\p{Nd}/u;
function _invisible(cp: number): boolean {
  return cp === 0xad || cp === 0x34f || cp === 0x115f || cp === 0x1160 || cp === 0x180e || (cp >= 0x200b && cp <= 0x200f)
    || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x2069) || cp === 0x2800 || cp === 0x3164 || cp === 0xfeff || cp === 0xffa0;
}
function _picto(cp: number): boolean {
  return (cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2b00 && cp <= 0x2bff) || cp === 0x2764 || cp === 0x2763;
}
const _MEANING_NUMBERS: readonly string[] = ['69', '88', '420', '666', '911'];

export const BOT_NAME_F_TAG_FRONT = 1;
export const BOT_NAME_F_TAG_END = 2;
export const BOT_NAME_F_TOUCH = 4;
export const BOT_NAME_F_EMOJI = 8;
export const BOT_NAME_F_FRAME = 16;
export const BOT_NAME_F_FIRST = 32;
export const BOT_NAME_F_FONT = 64;
const _RE_EMOJI_SHOWN = /\p{Emoji_Presentation}/u;
const _RE_NOT_ASCII = /[^\x00-\x7f]/;

export function botNameBroken(name: string, core: string, premade: boolean, flags: number, tagAt: number): string {
  if (name === '') return 'empty';
  if (botNameCells(name) > BOT_NAME_LONG) return 'too wide';
  if (premade) return '';
  if ((flags & BOT_NAME_F_EMOJI) !== 0 && (flags & BOT_NAME_F_FRAME) !== 0) return 'frame with emoji';
  if ((flags & BOT_NAME_F_FIRST) !== 0 && (flags & (BOT_NAME_F_EMOJI | BOT_NAME_F_FRAME | BOT_NAME_F_TAG_END | BOT_NAME_F_TOUCH)) !== 0) return 'first name decorated';
  if ((flags & BOT_NAME_F_TAG_FRONT) !== 0 && (flags & BOT_NAME_F_TAG_END) !== 0) return 'two tags';
  if ((flags & BOT_NAME_F_TAG_END) !== 0 && (flags & (BOT_NAME_F_TOUCH | BOT_NAME_F_EMOJI | BOT_NAME_F_FRAME)) !== 0) return 'something after the end tag';
  if ((flags & BOT_NAME_F_TAG_END) !== 0 && tagAt > 0 && _endsInDigit(core.slice(0, tagAt))) return 'tag after a number';
  if ((flags & BOT_NAME_F_TAG_FRONT) !== 0 && (flags & BOT_NAME_F_TOUCH) !== 0) return 'touch after a clan tag';
  if ((flags & BOT_NAME_F_FRAME) !== 0 && _endsInDigit(core)) return 'frame after a number';
  let strong = 0;
  for (let i = 0; i < name.length; i++) {
    const cp = name.codePointAt(i) as number;
    if (cp > 0xffff) i++;
    if (cp < 0x80) {
      if (cp >= 0x30 && cp <= 0x39) { if (strong === 2) return 'digit after right to left'; }
      else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) strong = 1;
      continue;
    }
    const ch = String.fromCodePoint(cp);
    if (_rtl(cp) && _RE_LETTER.test(ch)) { if (strong === 2) return 'right to left run'; strong = 2; }
    else if (_RE_DIGIT.test(ch)) { if (strong === 2) return 'digit after right to left'; }
    else if (_RE_LETTER.test(ch)) strong = 1;
  }
  if (core !== core.trim()) return 'space at an end';
  if (core.indexOf('  ') >= 0) return 'double space';
  const plainOwn = (flags & BOT_NAME_F_FONT) === 0;
  let depth = 0, sq = 0, cu = 0;
  let prev = 0, prevPrev = 0;
  for (let i = 0; i < core.length; i++) {
    const cp = core.codePointAt(i) as number;
    if (cp > 0xffff) i++;
    const isMark = cp >= 0x300 && _RE_MARK.test(String.fromCodePoint(cp));
    if (cp >= 0xad && _invisible(cp) && !(cp === 0x200d && _picto(prev))) return 'invisible character';
    if (isMark && !(cp >= 0xfe00 && cp <= 0xfe0f) && cp !== 0x20e3 && (prev === 0 || prev === 0x20)) return 'mark on nothing';
    if (plainOwn) {
      const sep = cp === 0x5f || cp === 0x2e || cp === 0x2d;
      if (sep && (prev === 0x5f || prev === 0x2e || prev === 0x2d || (prev === 0x20 && cp !== 0x2d))) return 'separators together';
      if (cp === 0x20 && (prev === 0x5f || prev === 0x2e)) return 'separators together';
      if (cp === 0x28) depth++; else if (cp === 0x29 && prev !== 0x3a) { if (--depth < 0) return 'bracket not opened'; }
      if (cp === 0x5b) sq++; else if (cp === 0x5d) { if (--sq < 0) return 'bracket not opened'; }
      if (cp === 0x7b) cu++; else if (cp === 0x7d) { if (--cu < 0) return 'bracket not opened'; }
      if (prev >= 0x2000 && prevPrev !== 0 && _RE_EMOJI_SHOWN.test(String.fromCodePoint(prev))
        && ((cp >= 0x61 && cp <= 0x7a) || (cp >= 0x80 && _RE_LOWER.test(String.fromCodePoint(cp))))
        && ((prevPrev >= 0x41 && prevPrev <= 0x5a) || (prevPrev >= 0x61 && prevPrev <= 0x7a) || (prevPrev >= 0x80 && _RE_LETTER.test(String.fromCodePoint(prevPrev))))) return 'emoji inside a word';
    }
    if (!(isMark || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x1f3fb && cp <= 0x1f3ff))) { prevPrev = prev; prev = cp; }
    else if (cp === 0x200d) prev = 0x1f000;
  }
  if (depth !== 0 || sq !== 0 || cu !== 0) return 'bracket not closed';
  const folded = _RE_NOT_ASCII.test(core) ? core.normalize('NFKC') : core;
  const runs = folded.match(/\d+/g);
  if (runs !== null) for (const r of runs) if (_MEANING_NUMBERS.indexOf(r) >= 0) return 'number with a meaning';
  return '';
}

let _outCells = 0;

function _applyFont(f: FontRt, s: string): string {
  let out = '';
  let cells = 0;
  const L = f.L, U = f.U, D = f.D;
  if (L !== null && U !== null) {
    const n = s.length;
    for (let k = 0; k < n; k++) {
      const i = f.rev ? n - 1 - k : k;
      const c = s.charCodeAt(i);
      if (c >= 97 && c <= 122) { out += L[c - 97]; cells += f.wL[c - 97]; }
      else if (c >= 65 && c <= 90) { out += U[c - 65]; cells += f.wU[c - 65]; }
      else if (c >= 48 && c <= 57 && D !== null) { out += D[c - 48]; cells += f.wD[c - 48]; }
      else { out += s.charAt(i); cells += botNameCellW(c); }
    }
  } else {
    out = f.a;
    cells = f.ca;
    let prev = false;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      const alnum = (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57);
      if (alnum) {
        if (prev) { out += f.j; cells += f.cj; }
        out += f.p + s.charAt(i) + f.q;
        cells += f.cp + botNameCellW(c) + f.cq;
      } else {
        out += s.charAt(i);
        cells += botNameCellW(c);
      }
      prev = alnum;
    }
    out += f.z;
    cells += f.cz;
  }
  _outCells = cells;
  return out;
}

function _pickFont(): number {
  const sh = BOT_NAME_TUNING.fontClass;
  const r = _rnd();
  const cls = r < sh[0] ? 0 : r < sh[0] + sh[1] ? 1 : r < sh[0] + sh[1] + sh[2] ? 2 : 3;
  const list = _fontClass[cls];
  if (list.length === 0) return -1;
  const i = list[_ri(list.length)];
  return (!_checked || (_tables as BotNameGlyphTables).fontOk[i] === 1) ? i : -1;
}

function _pickEmoji(): string {
  const ok = (_tables as BotNameGlyphTables).emojiOk;
  for (let t = 0; t < 6; t++) {
    const i = _chance(0.6) ? _ri(_emojiHotN) : _emojiHotN + _ri(_emoji.length - _emojiHotN);
    if (!_checked || ok[i] === 1) return _emoji[i];
  }
  return '';
}

export const BOT_NAME_LAST = {
  premade: false, font: -1, mixedCase: false, emoji: false, style: -1, cells: 0,
  plain: '', camel: false, first: false,
  tag: 0, fontWord: false, look: false, stretch: false, touch: false, core: '', broken: '', kind: '', tagAt: -1,
};

function _premade(): string {
  const ok = (_tables as BotNameGlyphTables).premadeOk;
  const n = NAME_PREMADE.length;
  for (let t = 0; t < 8; t++) {
    const i = _ri(n);
    if (_checked && ok[i] !== 1) continue;
    const c = _premadeCells[i];
    if (c > BOT_NAME_LONG) continue;
    if (c > BOT_NAME_FRAME_FIT && !_chance(BOT_NAME_TUNING.longPremade)) continue;
    BOT_NAME_LAST.cells = c;
    return NAME_PREMADE[i];
  }
  return '';
}

function _build(): string {
  const T = BOT_NAME_TUNING;
  const last = BOT_NAME_LAST;
  last.premade = false; last.font = -1; last.mixedCase = false; last.emoji = false; last.style = -1; last.cells = 0;
  last.plain = ''; last.camel = false; last.first = false;
  last.tag = 0; last.fontWord = false; last.look = false; last.stretch = false; last.touch = false; last.core = ''; last.kind = '';
  last.tagAt = -1;

  if (_chance(T.premade)) {
    const s = _premade();
    if (s !== '') {
      const why = botNameBroken(s, s, true, 0, -1);
      if (why === '') { last.premade = true; last.core = s; last.kind = 'ready-made'; return s; }
      last.broken = why;
      BOT_NAME_REFUSED.set(why, (BOT_NAME_REFUSED.get(why) || 0) + 1);
    }
  }

  let base = '';
  let cells = 0;
  for (let t = 0; t < 6; t++) {
    base = _makeBase();
    cells = botNameCells(base);
    if (cells <= BOT_NAME_FIT) break;
    base = '';
  }
  if (base === '') { _bFirst = false; _bCamel = false; _bPhrase = false; _bTag = false; base = _coined(); cells = botNameCells(base); last.kind = 'coined'; }
  const first = _bFirst, phrase = _bPhrase, tagFront = _bTag;
  let camel = _bCamel;
  last.first = first;
  last.camel = camel;
  if (tagFront) last.tag = 1;

  if (!first && _chance(T.stretch)) {
    const s = _stretch(base);
    if (s !== '' && botNameCells(s) <= BOT_NAME_FIT) { base = s; cells = botNameCells(s); last.stretch = true; }
  }

  if (_chance(T.mixedCase)) {
    if (camel) { base = _spaceCamel(base); camel = false; }
    base = _mixCase(base);
    cells = botNameCells(base);
    last.mixedCase = true;
  }
  last.plain = base;

  let text = base;
  if (_chance(phrase ? T.font * 0.5 : T.font)) {
    for (let t = 0; t < 8; t++) {
      const fi = _pickFont();
      if (fi < 0) continue;
      const f = _fonts[fi];
      const src = camel && f.oneCase ? _spaceCamel(base) : base;
      const sp = src.indexOf(' ');
      let out: string;
      let c: number;
      let oneWord = false;
      if (sp > 0 && _chance(T.fontOneWord)) {
        oneWord = true;
        if (_chance(0.5)) { const rest = src.slice(sp); out = _applyFont(f, src.slice(0, sp)) + rest; c = _outCells + botNameCells(rest); }
        else { const at = src.lastIndexOf(' ') + 1; const head = src.slice(0, at); out = head + _applyFont(f, src.slice(at)); c = botNameCells(head) + _outCells; }
      } else { out = _applyFont(f, src); c = _outCells; }
      if (c > BOT_NAME_FIT) continue;
      text = out;
      cells = c;
      last.font = fi;
      last.plain = src;
      last.fontWord = oneWord;
      break;
    }
  }

  if (last.font < 0 && !first && _chance(T.lookalike)) {
    const s = _lookalike(text);
    if (s !== text) { text = s; cells = botNameCells(s); last.look = true; }
  }

  let tagAt = -1;
  if (!first && !tagFront && !_endsInDigit(text) && _chance(T.endTag)) {
    const s = _endTag(text);
    if (s !== '') { tagAt = text.length; text = s; cells = botNameCells(s); last.tag = 2; }
  }
  last.tagAt = tagAt;
  const endTag = last.tag === 2;

  if (!first && last.tag === 0 && _chance(T.touch)) {
    const i = _ri(NAME_TOUCH.length);
    if (_extraOk(_EX_TOUCH + i)) {
      const s = text + NAME_TOUCH[i];
      const c = botNameCells(s);
      if (c <= BOT_NAME_FRAME_FIT) { text = s; cells = c; last.touch = true; }
    }
  }

  let emojiRolled = false;
  if (!first && !endTag && !last.touch && _chance(T.emoji)) {
    emojiRolled = true;
    const e = _pickEmoji();
    if (e !== '') {
      const r = _rnd();
      let out: string;
      if (r < 0.30) out = text + e;
      else if (r < 0.45) out = text + ' ' + e;
      else if (r < 0.60) out = e + text;
      else if (r < 0.68) out = e + ' ' + text;
      else if (r < 0.82) out = e + text + e;
      else if (r < 0.86) { const e2 = _pickEmoji(); out = e + text + (e2 !== '' ? e2 : e); }
      else if (r < 0.92) out = text + e + e;
      else {
        const sp = text.indexOf(' ');
        if (sp <= 0) out = text + e;
        else {
          const nx = text.charCodeAt(sp + 1);
          out = nx >= 65 && nx <= 90 ? text.slice(0, sp) + e + text.slice(sp + 1) : text.slice(0, sp + 1) + e + text.slice(sp);
        }
      }
      const c = botNameCells(out);
      if (c <= BOT_NAME_FRAME_FIT) { text = out; cells = c; last.emoji = true; }
    }
  }
  const core = text;
  last.core = core;
  if (!emojiRolled && !first && !endTag && !last.touch && !_endsInDigit(text) && _chance(T.style)) {
    const ok = (_tables as BotNameGlyphTables).styleOk;
    const long = _chance(T.longFrame);
    const cap = long ? BOT_NAME_LONG : BOT_NAME_FRAME_FIT;
    const n = NAME_STYLES.length;
    for (let t = 0; t < 14; t++) {
      const i = _ri(n);
      if (_checked && ok[i] !== 1) continue;
      const total = cells + _styleCells[i];
      if (total > cap) continue;
      if (long && total <= BOT_NAME_FRAME_FIT && t < 9) continue;
      text = _stylePre[i] + text + _stylePost[i];
      cells = total;
      last.style = i;
      break;
    }
  }
  last.cells = cells;
  const flags = (last.tag === 1 ? BOT_NAME_F_TAG_FRONT : 0) | (endTag ? BOT_NAME_F_TAG_END : 0) | (last.touch ? BOT_NAME_F_TOUCH : 0)
    | (last.emoji ? BOT_NAME_F_EMOJI : 0) | (last.style >= 0 ? BOT_NAME_F_FRAME : 0) | (first ? BOT_NAME_F_FIRST : 0)
    | (last.font >= 0 ? BOT_NAME_F_FONT : 0);
  const why = botNameBroken(text, core, false, flags, tagAt);
  if (why !== '') { last.broken = why; BOT_NAME_REFUSED.set(why, (BOT_NAME_REFUSED.get(why) || 0) + 1); return ''; }
  return text;
}

export const BOT_NAME_REFUSED = new Map<string, number>();

const _recent: string[] = [];
for (let i = 0; i < 256; i++) _recent.push('');
let _recentAt = 0;

export function botNameFromSeed(r1: number, r2: number): string {
  if (!_ready) _init();
  _seed(r1, r2);
  let name = '';
  for (let t = 0; t < 8; t++) {
    name = _build();
    if (name !== '' && _recent.indexOf(name) < 0) break;
  }
  if (name === '') {
    name = _coined();
    const L = BOT_NAME_LAST;
    L.premade = false; L.font = -1; L.mixedCase = false; L.emoji = false; L.style = -1; L.cells = botNameCells(name);
    L.plain = name; L.camel = false; L.first = false;
    L.tag = 0; L.fontWord = false; L.look = false; L.stretch = false; L.touch = false; L.core = name; L.kind = 'coined'; L.tagAt = -1;
  }
  _recent[_recentAt] = name;
  _recentAt = (_recentAt + 1) & 255;
  return name;
}

export function generateBotName(): string {
  const r1 = Math.random();
  const r2 = Math.random();
  return botNameFromSeed(r1, r2);
}
