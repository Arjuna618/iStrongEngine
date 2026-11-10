import { NAME_FONTS, NAME_LOOKALIKE } from '../game/botNameData';
import { SMALL_FIX } from '../game/smallFixSwitch';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

let _glyphs: Map<string, string> | null = null;

function isInvisible(cp: number): boolean {
  return (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060 || cp === 0xfeff
    || (cp >= 0xe0100 && cp <= 0xe01ef);
}

function bare(g: string): string {
  let s = '';
  for (const ch of g) if (!isInvisible(ch.codePointAt(0)!)) s += ch;
  return s;
}

function glyphMap(): Map<string, string> {
  if (_glyphs !== null) return _glyphs;
  const m = new Map<string, string>();
  const put = (glyph: string, plain: string) => {
    const k = bare(glyph);
    if (k.length === 0) return;
    if (k.length === 1 && k.charCodeAt(0) < 128) return;
    if (!m.has(k)) m.set(k, plain);
  };
  const each = (set: string | readonly string[] | undefined, plain: string) => {
    if (set === undefined) return;
    const list = typeof set === 'string' ? [...set] : set;
    for (let i = 0; i < list.length && i < plain.length; i++) put(list[i], plain[i]);
  };
  for (const cls of [0, 1, 3, 2]) {
    for (const f of NAME_FONTS) {
      if (f.t !== cls) continue;
      each(f.l, LETTERS);
      each(f.u ?? f.l, LETTERS);
      each(f.d, DIGITS);
    }
  }
  for (const [plain, look] of NAME_LOOKALIKE) put(look, plain.toLowerCase());
  _glyphs = m;
  return m;
}

const RE_LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;
const RE_MARKS = /\p{M}/gu;

export function plainName(s: string): string {
  const m = glyphMap();
  let out = '';
  const cps = [...s].filter((ch) => !isInvisible(ch.codePointAt(0)!));
  for (let i = 0; i < cps.length; i++) {
    const ch = cps[i];
    const c = ch.charCodeAt(0);
    if (ch.length === 1 && c < 128) {
      if ((c >= 48 && c <= 57) || (c >= 97 && c <= 122)) out += ch;
      else if (c >= 65 && c <= 90) out += String.fromCharCode(c + 32);
      continue;
    }
    if (i + 1 < cps.length) {
      const two = m.get(ch + cps[i + 1]);
      if (two !== undefined) { out += two; i++; continue; }
    }
    const one = m.get(ch);
    if (one !== undefined) { out += one; continue; }
    if (SMALL_FIX.R782) { const un = UNFOLDED[ch]; if (un !== undefined) { out += un; continue; } }
    const d = ch.normalize('NFKD').replace(RE_MARKS, '').toLowerCase();
    let alnum = true;
    for (let k = 0; k < d.length; k++) { const q = d.charCodeAt(k); if (!((q >= 48 && q <= 57) || (q >= 97 && q <= 122))) { alnum = false; break; } }
    if (!alnum || d.length === 0) continue;
    if (d.length === 1 || RE_LETTER_OR_NUMBER.test(ch)) out += d;
  }
  return out;
}

let _readings: Map<string, Set<string>> | null = null;

const UNFOLDED: Record<string, string> = {
  'æ': 'ae', 'Æ': 'ae', 'œ': 'oe', 'Œ': 'oe', 'ø': 'o', 'Ø': 'o', 'ß': 'ss', 'ð': 'd', 'Ð': 'd', 'þ': 'th', 'Þ': 'th',
  'ł': 'l', 'Ł': 'l', 'đ': 'd', 'Đ': 'd', 'ħ': 'h', 'Ħ': 'h', 'ŧ': 't', 'Ŧ': 't', 'ı': 'i', 'ŋ': 'n', 'Ŋ': 'n',
};

function readingMap(): Map<string, Set<string>> {
  if (_readings !== null) return _readings;
  const m = new Map<string, Set<string>>();
  const add = (glyph: string, plain: string) => {
    const k = bare(glyph);
    if (k.length === 0) return;
    let s = m.get(k);
    if (s === undefined) { s = new Set(); m.set(k, s); }
    s.add(plain);
  };
  const each = (set: string | readonly string[] | undefined, plain: string) => {
    if (set === undefined) return;
    const list = typeof set === 'string' ? [...set] : set;
    for (let i = 0; i < list.length && i < plain.length; i++) add(list[i], plain[i]);
  };
  for (const f of NAME_FONTS) {
    each(f.l, LETTERS);
    each(f.u ?? f.l, LETTERS);
    each(f.d, DIGITS);
  }
  for (const [plain, look] of NAME_LOOKALIKE) add(look, plain.toLowerCase());
  for (const g in UNFOLDED) add(g, UNFOLDED[g]);
  _readings = m;
  return m;
}

function foldOf(ch: string): string {
  const d = ch.normalize('NFKD').replace(RE_MARKS, '').toLowerCase();
  if (d.length === 0) return '';
  for (let k = 0; k < d.length; k++) { const q = d.charCodeAt(k); if (!((q >= 48 && q <= 57) || (q >= 97 && q <= 122))) return ''; }
  return d.length === 1 || RE_LETTER_OR_NUMBER.test(ch) ? d : '';
}

function readingsOf(ch: string, out: Set<string>): void {
  out.clear();
  const c = ch.charCodeAt(0);
  const fontReadings = readingMap().get(ch);
  if (fontReadings !== undefined) for (const r of fontReadings) out.add(r);
  if (ch.length === 1 && c < 128) {
    if ((c >= 48 && c <= 57) || (c >= 97 && c <= 122)) out.add(ch);
    else if (c >= 65 && c <= 90) out.add(String.fromCharCode(c + 32));
    else out.add('');
    return;
  }
  const f = foldOf(ch);
  if (f.length > 0) out.add(f);
  if (out.size === 0 || !RE_LETTER_OR_NUMBER.test(ch)) out.add('');
}

function readingsHold(items: readonly (readonly string[])[], w: string): boolean {
  const L = w.length, n = items.length;
  const reach: Set<number>[] = [];
  for (let i = 0; i <= n; i++) reach.push(new Set<number>());
  for (let i = 0; i < n; i++) {
    const from = reach[i], to = reach[i + 1];
    for (const r of items[i]) {
      if (r.length === 0) { for (const j of from) to.add(j); continue; }
      const starts = [...from, 0];
      for (const j0 of starts) {
        for (let o = 0; o < (j0 === 0 ? r.length : 1); o++) {
          let k = j0, ok = true;
          for (let q = o; q < r.length; q++) {
            if (w.charCodeAt(k) !== r.charCodeAt(q)) { ok = false; break; }
            if (++k === L) return true;
          }
          if (ok && k > 0) to.add(k);
        }
      }
    }
  }
  return false;
}

const R773_MAX_WORDS = 6;

export function plainHas(name: string, plainWord: string): boolean {
  if (plainWord.length === 0) return false;
  if (SMALL_FIX.R773 !== 0) {
    const cps = [...name].filter((ch) => !isInvisible(ch.codePointAt(0)!));
    const map = readingMap(), one = new Set<string>();
    const words: string[][][] = [[]];
    for (let i = 0; i < cps.length; i++) {
      const two = i + 1 < cps.length ? map.get(cps[i] + cps[i + 1]) : undefined;
      if (two !== undefined) { words[words.length - 1].push([...two]); i++; continue; }
      if (/\s/.test(cps[i])) { if (words[words.length - 1].length > 0) words.push([]); continue; }
      readingsOf(cps[i], one);
      words[words.length - 1].push([...one]);
    }
    if (words[words.length - 1].length === 0) words.pop();
    let rw = '';
    for (let i = plainWord.length - 1; i >= 0; i--) rw += plainWord[i];
    const flips = words.length <= R773_MAX_WORDS ? 1 << words.length : 1;
    for (let mask = 0; mask < flips; mask++) {
      const items: string[][] = [];
      for (let wi = 0; wi < words.length; wi++) {
        const wd = words[wi];
        if ((mask >> wi) & 1) for (let t = wd.length - 1; t >= 0; t--) items.push(wd[t].map((r) => [...r].reverse().join('')));
        else for (let t = 0; t < wd.length; t++) items.push(wd[t]);
      }
      if (readingsHold(items, plainWord) || readingsHold(items, rw)) return true;
    }
    return false;
  }
  const p = plainName(name);
  if (p.indexOf(plainWord) >= 0) return true;
  let r = '';
  for (let i = p.length - 1; i >= 0; i--) r += p[i];
  return r.indexOf(plainWord) >= 0;
}
