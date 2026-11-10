import type { TagAtlas, TagEntry } from './nameTagArras';

export const HT_FIRST = 32;
export const HT_CHARS = 95;
export const HT_UNITS = 160;
export const HT_PHASES = 4;
export const HT_BIAS = 0.125;
export const HT_LINE_MAX = 256;
export const HT_STRIDE = 12;
export const HT_FONTS_MAX = 4;
export const HT_SETS_MAX = 12;
export const HT_STAMP_MS = 250;
export const HT_CHECK_MS = 500;
export const HT_RETRY_MS = 250;
export const HT_COST_MEASURE = 0.004;
export const HT_COST_JOIN = 0.05;
export const HT_COST_GLYPH = 0.03;

export function htRound10(v: number): number {
  return Math.ceil(10 * v - 1e-6);
}

export function htHalfBox(fontPx: number, lwPx: number): number {
  return 1 + (fontPx + lwPx) / 2;
}

export function htSnapMid(mid: number, fontPx: number, lwPx: number): number {
  const h2 = htHalfBox(fontPx, lwPx);
  return Math.round(mid - h2) + h2;
}

export interface HtSink {
  clock(): number;
  measure(text: string, fontPx: number, out: Float64Array): void;
  joined(a: string, b: string, fontPx: number, bx: number, w: number): boolean;
  glyph(text: string, fontPx: number, lwPx: number, fill: string, outline: string,
        ox: number, oy: number, bw: number, bh: number, x: number, y: number): void;
  mark(text: string, fontPx: number, lwPx: number, outline: string, c0: string, c1: string, span: number,
       ax: number, oy: number, bw: number, bh: number, x: number, y: number): void;
}

function isLetter(ci: number): boolean {
  return (ci >= 33 && ci <= 58) || (ci >= 65 && ci <= 90);
}

export class HtFont {
  readonly f10: number;
  readonly px: number;
  units = HT_CHARS;
  readonly text: string[] = [];
  readonly adv = new Float64Array(HT_UNITS).fill(NaN);
  readonly inkL = new Float64Array(HT_UNITS);
  readonly inkR = new Float64Array(HT_UNITS);
  readonly blank = new Uint8Array(HT_UNITS);
  readonly tail = new Uint8Array(HT_UNITS);
  readonly join = new Uint8Array(HT_UNITS * HT_CHARS);
  readonly next = new Uint8Array(HT_UNITS * HT_CHARS);
  readonly kern = new Float64Array(HT_UNITS * HT_UNITS).fill(NaN);
  asc = NaN;
  desc = NaN;
  lastUse = 0;

  constructor(f10: number) {
    this.f10 = f10;
    this.px = f10 / 10;
    for (let i = 0; i < HT_CHARS; i++) {
      this.text.push(String.fromCharCode(HT_FIRST + i));
      this.tail[i] = isLetter(i) ? 1 : 0;
    }
  }
}

const _m = new Float64Array(5);

function bill(atlas: TagAtlas, sink: HtSink, t0: number, least: number): void {
  const d = sink.clock() - t0;
  atlas.charge(d > least ? d : least);
}

function learnUnit(f: HtFont, u: number, atlas: TagAtlas, sink: HtSink): boolean {
  if (!atlas.budgetOpen()) return false;
  const t0 = sink.clock();
  sink.measure(f.text[u], f.px, _m);
  f.adv[u] = _m[0];
  f.inkL[u] = _m[1];
  f.inkR[u] = _m[2];
  f.blank[u] = _m[1] + _m[2] > 0 ? 0 : 1;
  if (f.asc !== f.asc) { f.asc = _m[3]; f.desc = _m[4]; }
  bill(atlas, sink, t0, HT_COST_MEASURE);
  return true;
}

function learnJoin(f: HtFont, u: number, ci: number, atlas: TagAtlas, sink: HtSink): number {
  if (!atlas.budgetOpen()) return 0;
  const t0 = sink.clock();
  const a = f.text[u], b = f.text[ci];
  sink.measure(a + b, f.px, _m);
  const w = _m[0], inkL = _m[1], inkR = _m[2];
  let j = 1;
  if (sink.joined(a, b, f.px, w - f.adv[ci], w)) {
    if (f.units >= HT_UNITS) j = 3;
    else {
      const g = f.units++;
      f.text[g] = a + b;
      f.adv[g] = w;
      f.inkL[g] = inkL;
      f.inkR[g] = inkR;
      f.blank[g] = 0;
      f.tail[g] = 1;
      f.next[u * HT_CHARS + ci] = g;
      j = 2;
    }
  }
  f.join[u * HT_CHARS + ci] = j;
  bill(atlas, sink, t0, HT_COST_JOIN);
  return j;
}

function learnKern(f: HtFont, u: number, v: number, atlas: TagAtlas, sink: HtSink): number {
  if (!atlas.budgetOpen()) return NaN;
  const t0 = sink.clock();
  sink.measure(f.text[u] + f.text[v], f.px, _m);
  const k = _m[0] - f.adv[u] - f.adv[v];
  f.kern[u * HT_UNITS + v] = k;
  bill(atlas, sink, t0, HT_COST_MEASURE);
  return k;
}

interface HtRow {
  text: string;
  font: HtFont | null;
  state: number;
  n: number;
  m: number;
  w: number;
  u: Uint8Array;
  x: Float64Array;
}

const _rows: HtRow[] = [];

function rowAt(r: number): HtRow {
  while (_rows.length <= r) {
    _rows.push({ text: '', font: null, state: 1, n: 0, m: 0, w: 0, u: new Uint8Array(HT_LINE_MAX), x: new Float64Array(HT_LINE_MAX) });
  }
  return _rows[r];
}

function resolve(row: HtRow, text: string, f: HtFont, atlas: TagAtlas, sink: HtSink): number {
  if (row.state !== 1 && row.text === text && row.font === f) return row.state;
  HT_STATS.rowsCut++;
  row.text = text;
  row.font = f;
  row.state = 1;
  const len = text.length;
  if (len > HT_LINE_MAX) { row.state = -1; return -1; }
  const U = row.u, X = row.x;
  let n = 0, m = 0, sum = 0;
  let prev = -1, cur = -1;
  for (let i = 0; i <= len; i++) {
    let ci = -1;
    if (i < len) {
      const c = text.charCodeAt(i);
      if (c < HT_FIRST || c >= HT_FIRST + HT_CHARS) { row.state = -1; return -1; }
      ci = c - HT_FIRST;
      if (f.adv[ci] !== f.adv[ci] && !learnUnit(f, ci, atlas, sink)) return -2;
      if (cur >= 0 && f.tail[cur] === 1 && isLetter(ci)) {
        let j = f.join[cur * HT_CHARS + ci];
        if (j === 0) { j = learnJoin(f, cur, ci, atlas, sink); if (j === 0) return -2; }
        if (j === 2) { cur = f.next[cur * HT_CHARS + ci]; continue; }
        if (j === 3) { row.state = -1; return -1; }
      }
    }
    if (cur >= 0) {
      if (prev >= 0) {
        let k = f.kern[prev * HT_UNITS + cur];
        if (k !== k) { k = learnKern(f, prev, cur, atlas, sink); if (k !== k) return -2; }
        sum += f.adv[prev] + k;
      }
      U[n] = cur;
      X[n] = sum;
      n++;
      if (f.blank[cur] === 0) m++;
      prev = cur;
    }
    cur = ci;
  }
  if (prev >= 0) sum += f.adv[prev];
  row.n = n;
  row.m = m;
  row.w = sum;
  row.state = 0;
  return 0;
}

const GEO = 6;

export class HtSet {
  readonly font: HtFont;
  readonly l10: number;
  readonly lw: number;
  readonly fill: string;
  readonly outline: string;
  readonly A: number;
  readonly bh: number;
  readonly oy: number;
  readonly h2: number;
  readonly h2f: number;
  readonly has = new Uint8Array(HT_UNITS * HT_PHASES);
  readonly geo = new Float32Array(HT_UNITS * HT_PHASES * GEO);
  readonly ent: (TagEntry | null)[] = [];
  readonly list: number[] = [];
  resets: number;
  lastUse = 0;
  lastStamp = 0;
  retryAt = 0;

  constructor(font: HtFont, l10: number, fill: string, outline: string, resets: number) {
    this.font = font;
    this.l10 = l10;
    this.lw = l10 / 10;
    this.fill = fill;
    this.outline = outline;
    this.resets = resets;
    const h2 = htHalfBox(font.px, this.lw);
    this.h2 = h2;
    this.h2f = Math.floor(h2);
    this.A = Math.ceil(font.asc + this.lw / 2) + 2;
    this.bh = this.A + Math.ceil(font.desc + this.lw / 2) + 2;
    this.oy = this.A + (h2 - this.h2f);
    for (let i = 0; i < HT_UNITS * HT_PHASES; i++) this.ent.push(null);
  }
}

function setClear(s: HtSet): void {
  for (let i = 0; i < s.list.length; i++) { const si = s.list[i]; s.has[si] = 0; s.ent[si] = null; }
  s.list.length = 0;
}

function setTouch(s: HtSet, atlas: TagAtlas, now: number): void {
  if (s.lastUse === now) return;
  if (s.resets !== atlas.resets) {
    setClear(s);
    s.resets = atlas.resets;
  } else if (now - s.lastUse > HT_CHECK_MS) {
    for (let i = s.list.length - 1; i >= 0; i--) {
      const si = s.list[i];
      if (atlas.owns(s.ent[si]!)) continue;
      s.has[si] = 0;
      s.ent[si] = null;
      s.list[i] = s.list[s.list.length - 1];
      s.list.pop();
    }
  }
  if (now - s.lastStamp >= HT_STAMP_MS) {
    for (let i = 0; i < s.list.length; i++) s.ent[s.list[i]]!.lastUse = now;
    s.lastStamp = now;
  }
  s.lastUse = now;
}

function makeSprite(s: HtSet, u: number, ph: number, si: number, atlas: TagAtlas, sink: HtSink, now: number): boolean {
  if (now < s.retryAt) return false;
  if (!atlas.budgetOpen()) return false;
  const t0 = sink.clock();
  const f = s.font;
  const half = Math.ceil(s.lw / 2) + 2;
  const inkL = f.inkL[u], inkR = f.inkR[u], adv = f.adv[u];
  const padL = (inkL > 0 ? Math.ceil(inkL) : 0) + half;
  const bw = padL + Math.ceil((inkR > adv ? inkR : adv) + (HT_PHASES - 1) / HT_PHASES) + half;
  const e = atlas.place(2 * bw, s.bh, now);
  if (e === null) { s.retryAt = now + HT_RETRY_MS; bill(atlas, sink, t0, HT_COST_GLYPH); return false; }
  sink.glyph(f.text[u], f.px, s.lw, s.fill, s.outline, padL + ph / HT_PHASES, s.oy, bw, s.bh, e.x, e.y);
  const g = si * GEO;
  s.geo[g] = e.u0;
  s.geo[g + 1] = e.v0;
  s.geo[g + 2] = e.uw / 2;
  s.geo[g + 3] = e.vh;
  s.geo[g + 4] = bw;
  s.geo[g + 5] = padL;
  s.has[si] = 1;
  s.ent[si] = e;
  s.list.push(si);
  bill(atlas, sink, t0, HT_COST_GLYPH);
  return true;
}

const _fonts: HtFont[] = [];
const _sets: HtSet[] = [];
const _used: HtSet[] = [];

function fontFor(f10: number, now: number): HtFont {
  for (let i = 0; i < _fonts.length; i++) {
    if (_fonts[i].f10 === f10) { _fonts[i].lastUse = now; return _fonts[i]; }
  }
  if (_fonts.length >= HT_FONTS_MAX) {
    let old = 0;
    for (let i = 1; i < _fonts.length; i++) if (_fonts[i].lastUse < _fonts[old].lastUse) old = i;
    const gone = _fonts[old];
    _fonts.splice(old, 1);
    for (let i = _sets.length - 1; i >= 0; i--) if (_sets[i].font === gone) _sets.splice(i, 1);
    if (_mark.font === gone) { _mark.font = null; _mark.entry = null; }
  }
  const f = new HtFont(f10);
  f.lastUse = now;
  _fonts.push(f);
  return f;
}

function setFor(f: HtFont, l10: number, fill: string, outline: string, atlas: TagAtlas, now: number): HtSet | null {
  for (let i = 0; i < _sets.length; i++) {
    const s = _sets[i];
    if (s.font === f && s.l10 === l10 && s.fill === fill && s.outline === outline) { setTouch(s, atlas, now); return s; }
  }
  if (f.asc !== f.asc) return null;
  if (_sets.length >= HT_SETS_MAX) {
    let old = 0;
    for (let i = 1; i < _sets.length; i++) if (_sets[i].lastUse < _sets[old].lastUse) old = i;
    _sets.splice(old, 1);
  }
  const s = new HtSet(f, l10, fill, outline, atlas.resets);
  _sets.push(s);
  setTouch(s, atlas, now);
  return s;
}

interface HtMark {
  text: string; font: HtFont | null; l10: number; outline: string; c0: string; c1: string; span: number;
  w: number; inkL: number; inkR: number; measured: boolean;
  axIn: number; bw: number; bh: number; A: number;
  entry: TagEntry | null;
  retryAt: number;
}

const _mark: HtMark = {
  text: '', font: null, l10: -1, outline: '', c0: '', c1: '', span: -1,
  w: 0, inkL: 0, inkR: 0, measured: false, axIn: 0, bw: 0, bh: 0, A: 0, entry: null, retryAt: 0,
};

export interface HtFrame {
  rows: number;
  text: string[];
  fill: string[];
  anchorX: number;
  firstMid: number;
  pitch: number;
  f10: number;
  l10: number;
  outline: string;
  mark: string;
  markMid: number;
  markF10: number;
  markL10: number;
  markSpan: number;
  markC0: string;
  markC1: string;
  canvasRow: Uint8Array;
  markOnCanvas: boolean;
  pending: number;
  minX: number; minY: number; maxX: number; maxY: number;
}

export function htNewFrame(): HtFrame {
  return {
    rows: 0, text: [], fill: [], anchorX: 0, firstMid: 0, pitch: 0, f10: 0, l10: 0, outline: '',
    mark: '', markMid: 0, markF10: 0, markL10: 0, markSpan: 0, markC0: '', markC1: '',
    canvasRow: new Uint8Array(64), markOnCanvas: true, pending: 0, minX: 0, minY: 0, maxX: 0, maxY: 0,
  };
}

export const HT_STATS = { fonts: 0, sets: 0, rowsCut: 0 };

export function htLayout(fr: HtFrame, atlas: TagAtlas, sink: HtSink, now: number, dst: Float32Array, room: number): number {
  let at = 0;
  let pending = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (fr.canvasRow.length < fr.rows) fr.canvasRow = new Uint8Array(fr.rows * 2);
  _used.length = 0;
  const fonts0 = _fonts.length, sets0 = _sets.length;
  const f = fontFor(fr.f10, now);
  const ax = fr.anchorX;

  for (let r = 0; r < fr.rows; r++) {
    fr.canvasRow[r] = 1;
    const text = fr.text[r];
    if (text.length === 0) { fr.canvasRow[r] = 0; continue; }
    const row = rowAt(r);
    const st = resolve(row, text, f, atlas, sink);
    if (st === -2) { pending++; continue; }
    if (st === -1) continue;
    const s = setFor(f, fr.l10, fr.fill[r], fr.outline, atlas, now);
    if (s === null) { pending++; continue; }
    if (_used.indexOf(s) < 0) _used.push(s);
    const m = row.m;
    if (m === 0) { fr.canvasRow[r] = 0; continue; }
    if (at + 2 * m > room) continue;

    const top = Math.round(fr.firstMid + r * fr.pitch - s.h2) + s.h2f - s.A;
    const cy = top + s.bh * 0.5;
    const p0 = ax - row.w;
    const U = row.u, X = row.x, blank = f.blank, has = s.has, geo = s.geo, bh = s.bh;
    let ok = true;
    let j = 0;
    for (let k = 0; k < row.n; k++) {
      const u = U[k];
      if (blank[u] === 1) continue;
      const b = p0 + X[k] + HT_BIAS;
      const ip = Math.floor(b);
      let ph = Math.floor((b - ip) * HT_PHASES);
      if (ph >= HT_PHASES) ph = HT_PHASES - 1;
      const si = u * HT_PHASES + ph;
      if (has[si] === 0 && !makeSprite(s, u, ph, si, atlas, sink, now)) { ok = false; continue; }
      if (!ok) continue;
      const g = si * GEO;
      const bw = geo[g + 4];
      const cx = ip - geo[g + 5] + bw * 0.5;
      const u0 = geo[g], v0 = geo[g + 1], uw = geo[g + 2], vh = geo[g + 3];
      let o = (at + j) * HT_STRIDE;
      dst[o] = cx; dst[o + 1] = cy; dst[o + 2] = 0; dst[o + 3] = bw; dst[o + 4] = bh; dst[o + 5] = 1;
      dst[o + 6] = u0; dst[o + 7] = v0; dst[o + 8] = uw; dst[o + 9] = vh; dst[o + 10] = 0; dst[o + 11] = 0;
      o = (at + m + j) * HT_STRIDE;
      dst[o] = cx; dst[o + 1] = cy; dst[o + 2] = 0; dst[o + 3] = bw; dst[o + 4] = bh; dst[o + 5] = 1;
      dst[o + 6] = u0 + uw; dst[o + 7] = v0; dst[o + 8] = uw; dst[o + 9] = vh; dst[o + 10] = 0; dst[o + 11] = 0;
      j++;
      const l = cx - bw * 0.5, rt = cx + bw * 0.5;
      if (l < minX) minX = l;
      if (rt > maxX) maxX = rt;
    }
    if (!ok) { pending++; continue; }
    at += 2 * m;
    fr.canvasRow[r] = 0;
    if (top < minY) minY = top;
    if (top + bh > maxY) maxY = top + bh;
  }

  fr.markOnCanvas = fr.mark.length > 0;
  if (fr.mark.length > 0) {
    const w = markInstance(fr, atlas, sink, now, dst, at, room);
    if (w === 1) {
      const o = at * HT_STRIDE;
      const l = dst[o] - dst[o + 3] * 0.5, t = dst[o + 1] - dst[o + 4] * 0.5;
      if (l < minX) minX = l;
      if (l + dst[o + 3] > maxX) maxX = l + dst[o + 3];
      if (t < minY) minY = t;
      if (t + dst[o + 4] > maxY) maxY = t + dst[o + 4];
      at++;
      fr.markOnCanvas = false;
    } else if (w === 0) pending++;
  }

  HT_STATS.fonts += _fonts.length - fonts0;
  HT_STATS.sets += _sets.length > sets0 ? _sets.length - sets0 : 0;
  fr.pending = pending;
  fr.minX = minX; fr.minY = minY; fr.maxX = maxX; fr.maxY = maxY;
  return at;
}

function markInstance(fr: HtFrame, atlas: TagAtlas, sink: HtSink, now: number, dst: Float32Array, at: number, room: number): number {
  if (at >= room) return -1;
  const mk = _mark;
  const f = fontFor(fr.markF10, now);
  if (mk.text !== fr.mark || mk.font !== f) {
    mk.text = fr.mark;
    mk.font = f;
    mk.measured = false;
    mk.entry = null;
  }
  if (!mk.measured) {
    if (!atlas.budgetOpen()) return 0;
    const t0 = sink.clock();
    sink.measure(fr.mark, f.px, _m);
    mk.w = _m[0]; mk.inkL = _m[1]; mk.inkR = _m[2];
    if (f.asc !== f.asc) { f.asc = _m[3]; f.desc = _m[4]; }
    mk.measured = true;
    bill(atlas, sink, t0, HT_COST_MEASURE);
  }
  const lw = fr.markL10 / 10;
  const h2 = htHalfBox(f.px, lw);
  const A = Math.ceil(f.asc + lw / 2) + 2;
  const bh = A + Math.ceil(f.desc + lw / 2) + 2;
  const ax = fr.anchorX;
  const left = Math.floor(ax - mk.w - lw / 2 - (mk.inkL > 0 ? mk.inkL : 0)) - 2;
  const right = Math.ceil(ax + lw / 2 + (mk.inkR > mk.w ? mk.inkR - mk.w : 0)) + 2;
  const bw = right - left;
  const axIn = ax - left;
  let e = mk.entry;
  if (e === null || !atlas.owns(e) || mk.l10 !== fr.markL10 || mk.outline !== fr.outline || mk.c0 !== fr.markC0
      || mk.c1 !== fr.markC1 || mk.span !== fr.markSpan || mk.axIn !== axIn || mk.bw !== bw || mk.bh !== bh) {
    mk.entry = null;
    if (now < mk.retryAt || !atlas.budgetOpen()) return 0;
    const t0 = sink.clock();
    e = atlas.place(bw, bh, now);
    if (e === null) { mk.retryAt = now + HT_RETRY_MS; bill(atlas, sink, t0, HT_COST_GLYPH); return 0; }
    sink.mark(fr.mark, f.px, lw, fr.outline, fr.markC0, fr.markC1, fr.markSpan, axIn, A + (h2 - Math.floor(h2)), bw, bh, e.x, e.y);
    mk.l10 = fr.markL10; mk.outline = fr.outline; mk.c0 = fr.markC0; mk.c1 = fr.markC1; mk.span = fr.markSpan;
    mk.axIn = axIn; mk.bw = bw; mk.bh = bh; mk.A = A;
    mk.entry = e;
    bill(atlas, sink, t0, HT_COST_GLYPH);
  }
  e.lastUse = now;
  const top = Math.round(fr.markMid - h2) + Math.floor(h2) - A;
  const o = at * HT_STRIDE;
  dst[o] = left + bw * 0.5; dst[o + 1] = top + bh * 0.5; dst[o + 2] = 0; dst[o + 3] = bw; dst[o + 4] = bh; dst[o + 5] = 1;
  dst[o + 6] = e.u0; dst[o + 7] = e.v0; dst[o + 8] = e.uw; dst[o + 9] = e.vh; dst[o + 10] = 0; dst[o + 11] = 0;
  return 1;
}

export function htKeepAlive(atlas: TagAtlas, now: number): void {
  for (let i = 0; i < _used.length; i++) setTouch(_used[i], atlas, now);
  const e = _mark.entry;
  if (e !== null && atlas.owns(e)) e.lastUse = now;
}

export function htReset(): void {
  _fonts.length = 0;
  _sets.length = 0;
  _used.length = 0;
  for (let i = 0; i < _rows.length; i++) { _rows[i].font = null; _rows[i].state = 1; _rows[i].text = ''; }
  _mark.font = null;
  _mark.entry = null;
  _mark.measured = false;
  _mark.text = '';
  _mark.retryAt = 0;
}

export function htCounts(): { fonts: number; sets: number } {
  return { fonts: _fonts.length, sets: _sets.length };
}
