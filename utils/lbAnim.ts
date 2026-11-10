import { lbBlendValue, lbMaxFold, LB_BLEND_US } from './hudEase';

export const LB_UPDATE_SEC = 0.2;
export const LB_CURVE_BASE = 0.85;
export const LB_CURVE_HZ = 60;
export const LB_EXIT_DELETE_US = 4000000;
export const LB_SNAP_PX = 0.01;

export const LB_PITCH = 19;
export const LB_SLIDE = 300;
export const LB_BAR_LEN = 200;

export function lbCurveLeft(dtSec: number): number {
  return dtSec > 0 ? Math.pow(LB_CURVE_BASE, LB_CURVE_HZ * dtSec) : 1;
}

export interface LbRow {
  old: number;
  now: number;
  stampUs: number;
  rank: number;
  rankTo: number;
  off: number;
  offTo: number;
  leaving: boolean;
  leftUs: number;
  seen: number;
  shown: number;
}

export interface LbBoard<R extends LbRow> {
  rows: Map<string, R>;
  held: R[];
  gen: number;
}

export function lbNewBoard<R extends LbRow>(): LbBoard<R> {
  return { rows: new Map(), held: [], gen: 0 };
}

export function lbClearBoard<R extends LbRow>(board: LbBoard<R>): void {
  board.rows.clear();
  board.held.length = 0;
}

export function lbApplyUpdate<R extends LbRow, E extends { id: string; score: number }>(
  board: LbBoard<R>, list: readonly E[], clockUs: number, make: (e: E) => R,
): void {
  const gen = ++board.gen;
  const rows = board.rows;
  const stamp = clockUs > 0 ? clockUs : 1;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    let r = rows.get(e.id);
    if (r === undefined) {
      r = make(e);
      r.old = 0; r.now = e.score; r.stampUs = stamp;
      r.rank = i; r.rankTo = i;
      r.off = 1; r.offTo = 0;
      r.leaving = false; r.leftUs = 0;
      r.shown = 0;
      rows.set(e.id, r);
    } else {
      if (!Object.is(e.score, r.now)) {
        r.old = lbBlendValue(r.old, r.now, r.stampUs, clockUs);
        r.now = e.score;
        r.stampUs = stamp;
      }
      r.rankTo = i;
      r.offTo = 0;
      r.leaving = false;
    }
    r.seen = gen;
  }
  const held = board.held;
  held.length = 0;
  for (const [id, r] of rows) {
    if (r.seen !== gen) {
      if (!r.leaving) {
        r.leaving = true;
        r.leftUs = clockUs;
        r.offTo = 1;
      } else if (clockUs - r.leftUs >= LB_EXIT_DELETE_US) {
        rows.delete(id);
        continue;
      }
    }
    held.push(r);
  }
}

export function lbStep<R extends LbRow>(board: LbBoard<R>, dtSec: number, rankPx: number, offPx: number): boolean {
  const k = lbCurveLeft(dtSec);
  const held = board.held;
  let moving = false;
  for (let i = 0; i < held.length; i++) {
    const r = held[i];
    if (r.rank !== r.rankTo) {
      const g = (r.rank - r.rankTo) * k;
      r.rank = Math.abs(g) * rankPx < LB_SNAP_PX ? r.rankTo : r.rankTo + g;
      if (r.rank !== r.rankTo) moving = true;
    }
    if (r.off !== r.offTo) {
      const g = (r.off - r.offTo) * k;
      r.off = Math.abs(g) * offPx < LB_SNAP_PX ? r.offTo : r.offTo + g;
      if (r.off !== r.offTo) moving = true;
    }
  }
  return moving;
}

export function lbMoving<R extends LbRow>(board: LbBoard<R>): boolean {
  const held = board.held;
  for (let i = 0; i < held.length; i++) {
    const r = held[i];
    if (r.rank !== r.rankTo || r.off !== r.offTo) return true;
  }
  return false;
}

export function lbFoldValues<R extends LbRow>(board: LbBoard<R>, clockUs: number): number {
  const held = board.held;
  let max = 1.0;
  for (let i = 0; i < held.length; i++) {
    const r = held[i];
    r.shown = lbBlendValue(r.old, r.now, r.stampUs, clockUs);
    max = lbMaxFold(max, r.shown);
  }
  return max;
}

export function lbBlending<R extends LbRow>(board: LbBoard<R>, clockUs: number): boolean {
  const held = board.held;
  for (let i = 0; i < held.length; i++) {
    const r = held[i];
    if (r.stampUs !== 0 && clockUs - r.stampUs < LB_BLEND_US) return true;
  }
  return false;
}

export function lbTitleOff<R extends LbRow>(board: LbBoard<R>): number {
  const held = board.held;
  let m = 1;
  for (let i = 0; i < held.length; i++) if (held[i].off < m) m = held[i].off;
  return m;
}

export function lbFillFrac(shown: number, max: number): number {
  const f = shown / max;
  return f > 0 ? (f < 1 ? f : 1) : 0;
}

export function lbRowPrefix(name: string, tank: string): string {
  return (name ? name + ' - ' + tank : tank) + ': ';
}

export const LB_LABEL_MAX = LB_BAR_LEN + 4;
export const LB_ELLIPSIS = '...';

export const LB_NUM_MASKS: readonly string[] = ['8', '88', '888', '8.88k', '88.88k', '888.8k', '8.88m', '88.88m', '888.8m', '8.88b'];

export function lbNumShape(n: number): number {
  if (n < 1000) return n < 10 ? 0 : n < 100 ? 1 : 2;
  if (n >= 1e9) return 9;
  const m = n >= 1e6;
  const s = m ? Math.floor(n / 1000) : n;
  return (m ? 6 : 3) + (s < 10000 ? 0 : s <= 99999 ? 1 : 2);
}

interface LbSegmenter { segment(s: string): Iterable<{ index: number; segment: string }>; }
let _lbSegmenter: LbSegmenter | null | undefined;
const _LB_JOINS_PREVIOUS = /^[\p{M}\u200d\ufe00-\ufe0f]$/u;

export function lbCharEnds(s: string): number[] {
  const out: number[] = [];
  if (_lbSegmenter === undefined) {
    const I = (globalThis as { Intl?: { Segmenter?: new (l?: string, o?: { granularity: string }) => LbSegmenter } }).Intl;
    _lbSegmenter = I && typeof I.Segmenter === 'function' ? new I.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  }
  if (_lbSegmenter) {
    for (const g of _lbSegmenter.segment(s)) out.push(g.index + g.segment.length);
    return out;
  }
  let i = 0;
  while (i < s.length) {
    let cp = s.codePointAt(i) as number;
    i += cp > 0xffff ? 2 : 1;
    while (i < s.length) {
      const next = s.codePointAt(i) as number;
      const ch = String.fromCodePoint(next);
      if (!_LB_JOINS_PREVIOUS.test(ch) && cp !== 0x200d) break;
      cp = next;
      i += next > 0xffff ? 2 : 1;
    }
    out.push(i);
  }
  return out;
}

function _lbTrimEnd(s: string): string {
  let e = s.length;
  while (e > 0 && s.charCodeAt(e - 1) === 32) e--;
  return e === s.length ? s : s.slice(0, e);
}

export function lbFitName(name: string, room: number, measure: (s: string) => number): string {
  if (name === '') return name;
  const whole = measure(name);
  if (whole <= room) return name;
  const ends = lbCharEnds(name);
  if (ends.length < 2) return name;
  let lo = 1, hi = ends.length - 1, best = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measure(_lbTrimEnd(name.slice(0, ends[mid - 1])) + LB_ELLIPSIS) <= room) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  const cut = _lbTrimEnd(name.slice(0, ends[best - 1])) + LB_ELLIPSIS;
  return measure(cut) < whole ? cut : name;
}

export function lbFitPrefix(name: string, tank: string, numW: number, room: number, measure: (s: string) => number): string {
  if (!name) return lbRowPrefix(name, tank);
  const rest = ' - ' + tank + ': ';
  return lbFitName(name, room - numW - measure(rest), measure) + rest;
}

export const LB_FFA_ICON = 1;
export const LB_FFA_BAR = 2;
const LB_MANHUNT_GREEN = 2;

export function lbIconColorIndex(idx: number, ffaStyle: boolean): number {
  return idx < 0 ? -1 : (ffaStyle && idx !== LB_MANHUNT_GREEN) ? LB_FFA_ICON : idx;
}

export function lbBarColorIndex(idx: number, ffaStyle: boolean): number {
  return idx < 0 ? -1 : (ffaStyle && idx !== LB_MANHUNT_GREEN) ? LB_FFA_BAR : idx;
}
