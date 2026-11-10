import { lbU32, lbAbbrev, lbScoreOf } from './hudEase';
import { hudColors, hudHpBarAlpha, HUD_FONT_FAMILY } from './hudArras';
import { drawnOpacity } from './seenRule';
import { SMALL_FIX } from '../game/smallFixSwitch';

export const TAG_NAME_FONT = 0.55;
export const TAG_SCORE_FONT = 0.3;
export const TAG_NAME_TOP = 2.4;
export const TAG_NAME_TOP_ALONE = 2.0;
export const TAG_SCORE_TOP = 1.75;
export const TAG_STROKE_F = 0.2;
export const TAG_STROKE_MIN_WORLD = 2;
export const TAG_OP_FLOOR = 0.1;
export const TAG_VIEW_ASPECT = 16 / 9;

export function tagRound10(v: number): number {
  return Math.ceil(10 * v) / 10;
}

export function tagStrokeWorld(fontWorld: number): number {
  const a = TAG_STROKE_F * fontWorld;
  return a > TAG_STROKE_MIN_WORLD ? a : TAG_STROKE_MIN_WORLD;
}

export function tagReachWorld(t: TagTank, showNames: boolean, showScores: boolean, scoreStart = 0): number {
  if (!tagNamed(t)) return 0;
  const size = t.size * 0.5;
  if (!(size > 0)) return 0;
  const doName = showNames && t.displayName.length > 0;
  const doScore = showScores && lbU32(lbScoreOf(t, scoreStart)) > 0;
  if (!doName && !doScore) return 0;
  const topR = doName ? (doScore ? TAG_NAME_TOP : TAG_NAME_TOP_ALONE) : TAG_SCORE_TOP;
  return topR * size + tagStrokeWorld((doName ? TAG_NAME_FONT : TAG_SCORE_FONT) * size) * 0.5;
}

export function tagWanted(name: string, score: number, isPlayer: boolean): boolean {
  return !isPlayer && (name.length > 0 || lbU32(score) > 0);
}

export function tagNameTop(sy: number, R: number, scoreLine: boolean): number {
  return sy - (scoreLine ? TAG_NAME_TOP : TAG_NAME_TOP_ALONE) * R;
}

export function tagScoreTop(sy: number, R: number): number {
  return sy - TAG_SCORE_TOP * R;
}

export function tagBoxW(w: number, lw: number): number { return Math.ceil(w + lw) + 2; }
export function tagBoxH(font: number, lw: number): number { return Math.ceil(font + lw) + 2; }
export function tagBoxTop(top: number, lw: number): number { return Math.floor(top - lw / 2); }
export function tagBoxLeft(x: number, w: number, lw: number): number { return Math.floor(x - (w + lw) / 2) - 1; }
export function tagTextX(w: number, lw: number): number { return 1 + (w + lw) / 2; }
export function tagTextY(font: number, lw: number): number { return 1 + (font + lw) / 2; }

export function tagHalfView(canvasW: number, canvasH: number, zoom: number): number {
  const a = canvasW / 2;
  const b = TAG_VIEW_ASPECT * canvasH / 2;
  return (a > b ? a : b) / zoom;
}

export function tagEdge(dx: number, size: number, halfView: number): number {
  if (!(size > 0)) return 1;
  const p = ((dx < 0 ? -dx : dx) - (halfView + size)) / (2 * size);
  return p <= 0 ? 1 : p >= 1 ? 0 : 1 - p;
}

export function tagDeathFade(elapsedMs: number, deathMs: number): number {
  const c = 1 - elapsedMs / deathMs;
  return c > 0 ? (c < 1 ? c : 1) : 0;
}

export function tagFade(E: number, c: number, op: number): number {
  if (!(op > TAG_OP_FLOOR)) return 0;
  const g = E * c * (op - TAG_OP_FLOOR) / (1 - TAG_OP_FLOOR);
  return g > 0 ? (g < 1 ? g : 1) : 0;
}

export function tagBarAlpha(g: number): number {
  return g >= 1 ? 1 : g > 0 ? 1 - Math.sqrt(1 - g) : 0;
}

export function tagBarAlphaAt(E: number, op: number): number {
  return E >= 1 ? hudHpBarAlpha(op) : tagBarAlpha(tagFade(E, 1, op));
}

export function tagFillCss(dark: boolean): string { return hudColors(dark).text; }
export function tagOutlineCss(dark: boolean): string { return hudColors(dark).ink; }

export function tagFontCss(px: number): string {
  return `bold ${px}px ${HUD_FONT_FAMILY}`;
}

export function tagScoreKey(n: number): number {
  if (n < 1000) return n;
  if (n < 100000) return 100000 + Math.floor(n / 10);
  if (n < 1000000) return 200000 + Math.floor(n / 100);
  if (n < 100000000) return 300000 + Math.floor(n / 10000);
  if (n < 1000000000) return 400000 + Math.floor(n / 100000);
  return 500000 + Math.floor(n / 10000000);
}

export function tagScoreText(score: number): string {
  return lbAbbrev(lbU32(score));
}

export const TAG_BUCKETS = 8;
export const TAG_SHRINK_MIN = Math.pow(2, -1 / TAG_BUCKETS);
export const TAG_SETTLE_MS = 150;
export const TAG_SETTLE_MAX_MS = 2400;
export const TAG_REST_MS = 2000;
export const TAG_RETRY_MS = 250;

export function tagBucketOf(f10: number): number {
  return Math.ceil(Math.log2(f10 / 10) * TAG_BUCKETS - 1e-9);
}

export function tagBucketF10(b: number): number {
  return Math.ceil(10 * Math.pow(2, b / TAG_BUCKETS));
}

export const TAG_ATLAS_W = 2048;
export const TAG_ATLAS_H = 1024;
export const TAG_IDLE_MS = 10000;
export const TAG_IDLE_PRESSURE_MS = 1000;

const SHELF_STEP = 4;
const SLOT_GUTTER = 1;

interface TagShelf {
  y: number;
  h: number;
  used: number;
  free: number[];
}

export interface TagEntry {
  text: string;
  f10: number; l10: number;
  font: number; lw: number;
  dark: boolean;
  x: number; y: number; bw: number; bh: number; w: number;
  u0: number; v0: number; uw: number; vh: number;
  lastUse: number;
  idx: number;
  key: number;
  shelf: TagShelf;
  span: number;
}

export interface TagSink {
  clock(): number;
  measure(text: string, fontPx: number): number;
  raster(text: string, fontPx: number, lwPx: number, w: number, bw: number, bh: number,
         x: number, y: number, dark: boolean): void;
}

export const TAG_QUAD_FLOATS = 9;

function spanTake(free: number[], need: number): number {
  for (let i = 0; i < free.length; i += 2) {
    if (free[i + 1] >= need) {
      const x = free[i];
      if (free[i + 1] === need) free.splice(i, 2);
      else { free[i] += need; free[i + 1] -= need; }
      return x;
    }
  }
  return -1;
}

function spanGive(free: number[], x: number, w: number): void {
  let i = 0;
  while (i < free.length && free[i] < x) i += 2;
  free.splice(i, 0, x, w);
  if (i + 2 < free.length && free[i] + free[i + 1] === free[i + 2]) { free[i + 1] += free[i + 3]; free.splice(i + 2, 2); }
  if (i >= 2 && free[i - 2] + free[i - 1] === free[i]) { free[i - 1] += free[i + 1]; free.splice(i, 2); }
}

export class TagAtlas {
  readonly W: number;
  readonly H: number;
  private shelves: TagShelf[] = [];
  private live: TagEntry[] = [];
  private byText = new Map<string, Map<number, TagEntry>>();
  private _ax = 0;
  private budgetMs = 0;
  private spentMs = 0;
  private tries = 0;

  miss = 0;
  fit = 1;

  rasters = 0;
  uploadBytes = 0;
  evictions = 0;
  deferred = 0;
  failed = 0;
  resets = 0;

  constructor(w: number = TAG_ATLAS_W, h: number = TAG_ATLAS_H) {
    this.W = w;
    this.H = h;
  }

  get count(): number { return this.live.length; }

  reset(): void {
    for (let i = 0; i < this.live.length; i++) this.live[i].idx = -1;
    this.live.length = 0;
    this.byText.clear();
    this.shelves.length = 0;
    this.resets++;
  }

  beginFrame(budgetMs: number): void {
    this.budgetMs = budgetMs;
    this.spentMs = 0;
    this.tries = 0;
  }

  owns(e: TagEntry): boolean {
    return e.idx >= 0 && this.live[e.idx] === e;
  }

  get(text: string, f10: number, l10: number, dark: boolean, now: number, sink: TagSink): TagEntry | null {
    const key = (f10 * 65536 + l10) * 2 + (dark ? 1 : 0);
    let m = this.byText.get(text);
    if (m !== undefined) {
      const hit = m.get(key);
      if (hit !== undefined) { this.miss = 0; return hit; }
    }
    if (this.tries > 0 && this.spentMs >= this.budgetMs) { this.miss = 1; this.deferred++; return null; }
    const t0 = sink.clock();
    this.tries++;
    const font = f10 / 10, lw = l10 / 10;
    const w = sink.measure(text, font);
    const bw = tagBoxW(w, lw), bh = tagBoxH(font, lw);
    let shelf: TagShelf | null = null;
    let need = 0;
    if (bw <= this.W && bh <= this.H) {
      need = bw + SLOT_GUTTER <= this.W ? bw + SLOT_GUTTER : bw;
      const hb = Math.ceil(bh / SHELF_STEP) * SHELF_STEP;
      shelf = this._alloc(need, hb);
      if (shelf === null && this._evict(now, TAG_IDLE_MS) > 0) shelf = this._alloc(need, hb);
      if (shelf === null && this._evict(now, TAG_IDLE_PRESSURE_MS) > 0) shelf = this._alloc(need, hb);
    }
    if (shelf === null) {
      this.miss = 2;
      if (SMALL_FIX.R213 !== 0 && (bw > this.W || bh > this.H)) {
        this.miss = 3;
        const fw = (this.W - SLOT_GUTTER) / bw, fh = this.H / bh;
        this.fit = fw < fh ? fw : fh;
      }
      this.failed++;
      this.spentMs += sink.clock() - t0;
      return null;
    }
    const x = this._ax, y = shelf.y;
    sink.raster(text, font, lw, w, bw, bh, x, y, dark);
    const e: TagEntry = {
      text, f10, l10, font, lw, dark, x, y, bw, bh, w,
      u0: x / this.W, v0: y / this.H, uw: bw / this.W, vh: bh / this.H,
      lastUse: now, idx: this.live.length, key, shelf, span: need,
    };
    this.live.push(e);
    if (m === undefined) { m = new Map<number, TagEntry>(); this.byText.set(text, m); }
    m.set(key, e);
    this.rasters++;
    this.uploadBytes += bw * bh * 4;
    this.spentMs += sink.clock() - t0;
    this.miss = 0;
    return e;
  }

  budgetOpen(): boolean {
    return this.tries === 0 || this.spentMs < this.budgetMs;
  }

  charge(ms: number): void {
    this.tries++;
    this.spentMs += ms;
  }

  place(bw: number, bh: number, now: number): TagEntry | null {
    let shelf: TagShelf | null = null;
    let need = 0;
    if (bw > 0 && bh > 0 && bw <= this.W && bh <= this.H) {
      need = bw + SLOT_GUTTER <= this.W ? bw + SLOT_GUTTER : bw;
      const hb = Math.ceil(bh / SHELF_STEP) * SHELF_STEP;
      shelf = this._alloc(need, hb);
      if (shelf === null && this._evict(now, TAG_IDLE_MS) > 0) shelf = this._alloc(need, hb);
      if (shelf === null && this._evict(now, TAG_IDLE_PRESSURE_MS) > 0) shelf = this._alloc(need, hb);
    }
    if (shelf === null) {
      this.miss = 2;
      this.failed++;
      return null;
    }
    const x = this._ax, y = shelf.y;
    const e: TagEntry = {
      text: '', f10: 0, l10: 0, font: 0, lw: 0, dark: false, x, y, bw, bh, w: 0,
      u0: x / this.W, v0: y / this.H, uw: bw / this.W, vh: bh / this.H,
      lastUse: now, idx: this.live.length, key: -1, shelf, span: need,
    };
    this.live.push(e);
    this.rasters++;
    this.uploadBytes += bw * bh * 4;
    this.miss = 0;
    return e;
  }

  private _alloc(need: number, hb: number): TagShelf | null {
    const sh = this.shelves;
    for (let i = 0; i < sh.length; i++) {
      const s = sh[i];
      if (s.h !== hb) continue;
      const x = spanTake(s.free, need);
      if (x >= 0) { s.used++; this._ax = x; return s; }
    }
    let best = -1;
    for (let i = 0; i < sh.length; i++) {
      const s = sh[i];
      if (s.used === 0 && s.h > hb && (best < 0 || s.h < sh[best].h)) best = i;
    }
    if (best >= 0) {
      const s = sh[best];
      sh.splice(best + 1, 0, { y: s.y + hb, h: s.h - hb, used: 0, free: [0, this.W] });
      s.h = hb;
      this._ax = spanTake(s.free, need);
      s.used++;
      return s;
    }
    const top = sh.length > 0 ? sh[sh.length - 1].y + sh[sh.length - 1].h : 0;
    if (top + hb <= this.H) {
      const s: TagShelf = { y: top, h: hb, used: 0, free: [0, this.W] };
      sh.push(s);
      this._ax = spanTake(s.free, need);
      s.used++;
      return s;
    }
    return null;
  }

  private _release(e: TagEntry): void {
    const s = e.shelf;
    spanGive(s.free, e.x, e.span);
    s.used--;
    if (s.used !== 0) return;
    const sh = this.shelves;
    let i = sh.indexOf(s);
    if (i < 0) return;
    if (i + 1 < sh.length && sh[i + 1].used === 0) { s.h += sh[i + 1].h; sh.splice(i + 1, 1); }
    if (i > 0 && sh[i - 1].used === 0) { sh[i - 1].h += s.h; sh.splice(i, 1); i--; }
    if (i === sh.length - 1) sh.pop();
  }

  private _evict(now: number, idleMs: number): number {
    let n = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      if (now - e.lastUse < idleMs) continue;
      const last = this.live.pop()!;
      if (last !== e) { this.live[i] = last; last.idx = i; }
      e.idx = -1;
      const m = this.byText.get(e.text);
      if (m !== undefined) { m.delete(e.key); if (m.size === 0) this.byText.delete(e.text); }
      this._release(e);
      n++;
    }
    this.evictions += n;
    return n;
  }
}

export interface TagLine {
  text: string;
  dark: boolean;
  f10: number; l10: number;
  since: number;
  settle: number;
  hadExact: boolean;
  exact: TagEntry | null;
  bucket: TagEntry | null;
  bIdx: number; rIdx: number;
  cur: TagEntry | null;
  nextTry: number;
}

export interface TagCache {
  name: TagLine;
  score: TagLine;
  scoreKey: number;
  scoreText: string;
  life: string | undefined;
}

function newLine(): TagLine {
  return {
    text: '', dark: false, f10: -1, l10: -1, since: 0, settle: TAG_SETTLE_MS, hadExact: false,
    exact: null, bucket: null, bIdx: 0, rIdx: 0, cur: null, nextTry: 0,
  };
}

export const TAG_STATS = { scoreTexts: 0, caches: 0 };

const _caches = new WeakMap<object, TagCache>();

function fitEntry(atlas: TagAtlas, text: string, f10: number, r: number, dark: boolean, now: number, sink: TagSink): TagEntry | null {
  const ff10 = Math.floor(f10 * atlas.fit * 0.97);
  if (ff10 < 1) return null;
  return atlas.get(text, ff10, Math.ceil(r * ff10 / 64), dark, now, sink);
}

function lineEntry(
  line: TagLine, keepOnNewText: boolean, text: string, f10: number, l10: number, r: number,
  v: TagView, atlas: TagAtlas, sink: TagSink,
): TagEntry | null {
  const now = v.clock;
  const dark = v.dark;
  if (line.text !== text || line.dark !== dark) {
    line.text = text;
    line.dark = dark;
    line.exact = null;
    line.bucket = null;
    line.nextTry = 0;
    if (!keepOnNewText) line.cur = null;
  }
  if (f10 !== line.f10 || l10 !== line.l10) {
    if (line.f10 < 0) {
      line.since = now - TAG_SETTLE_MS;
    } else {
      if (now - line.since >= TAG_REST_MS) line.settle = TAG_SETTLE_MS;
      else if (line.hadExact) line.settle = line.settle * 2 < TAG_SETTLE_MAX_MS ? line.settle * 2 : TAG_SETTLE_MAX_MS;
      line.since = now;
    }
    line.f10 = f10;
    line.l10 = l10;
    line.exact = null;
    line.hadExact = false;
  }

  if (now - line.since >= line.settle) {
    let e = line.exact;
    if (e === null || !atlas.owns(e)) {
      e = null;
      line.exact = null;
      if (now >= line.nextTry) {
        e = atlas.get(text, f10, l10, dark, now, sink);
        if (e === null && atlas.miss === 3) e = fitEntry(atlas, text, f10, r, dark, now, sink);
        if (e !== null) { line.exact = e; line.hadExact = true; }
        else if (atlas.miss === 2 || atlas.miss === 3) line.nextTry = now + TAG_RETRY_MS;
      }
    }
    if (e !== null) { e.lastUse = now; line.cur = e; return e; }
  }

  let e = line.cur;
  if (e !== null && e.f10 >= f10 && e.f10 * TAG_SHRINK_MIN <= f10 && e.text === text && e.dark === dark && atlas.owns(e)) {
    e.lastUse = now;
    return e;
  }

  const b = tagBucketOf(f10);
  e = line.bucket;
  if (e === null || line.bIdx !== b || line.rIdx !== r || !atlas.owns(e)) {
    e = null;
    if (now >= line.nextTry) {
      const bf10 = tagBucketF10(b);
      e = atlas.get(text, bf10, Math.ceil(r * bf10 / 64), dark, now, sink);
      if (e === null && atlas.miss === 3) e = fitEntry(atlas, text, bf10, r, dark, now, sink);
      if (e !== null) { line.bucket = e; line.bIdx = b; line.rIdx = r; }
      else if (atlas.miss === 2 || atlas.miss === 3) line.nextTry = now + TAG_RETRY_MS;
    }
  }
  if (e !== null) { e.lastUse = now; line.cur = e; return e; }

  e = line.cur;
  if (e !== null && atlas.owns(e)) { e.lastUse = now; return e; }
  return null;
}

export interface TagTank {
  active: boolean;
  isDying: boolean;
  deathStartTime: number;
  position: { x: number; y: number };
  size: number;
  displayName: string;
  currentXp: number;
  invisAlpha: number;
  invisEnabled?: boolean;
  viewAlpha?: number;
  isSentryEnemy: boolean;
  spawnedByEntityId: string;
  isBaseProtector?: boolean;
  _mevF?: number;
  id?: string;
}

export interface TagView {
  camX: number; camY: number; zoom: number; W: number; H: number;
  minX: number; maxX: number; minY: number; maxY: number;
  now: number; clock: number;
  deathMs: number;
  dark: boolean;
  showNames: boolean;
  showScores: boolean;
  allNames?: boolean;
  startOf?: (t: TagTank) => number;
}

export function tagNamed(t: TagTank): boolean {
  return !t.isSentryEnemy && !t.isBaseProtector && !t.spawnedByEntityId && ((t._mevF ?? 0) & 64) === 0;
}

export function runNameTags(
  tanks: ArrayLike<TagTank>, n: number, v: TagView, atlas: TagAtlas, sink: TagSink, out: Float32Array,
): number {
  if (!v.showNames && !v.showScores) return 0;
  const zoom = v.zoom;
  const halfView = tagHalfView(v.W, v.H, zoom);
  const halfW = v.W * 0.5, halfH = v.H * 0.5;
  const room = Math.floor(out.length / TAG_QUAD_FLOATS);
  let quads = 0;
  for (let i = 0; i < n; i++) {
    const t = tanks[i];
    if (!t.active) continue;
    const px = t.position.x, py = t.position.y;
    const reach = t.size * 2;
    if (px + reach < v.minX || px - reach > v.maxX || py + reach < v.minY || py - reach > v.maxY) continue;
    if (!tagNamed(t)) continue;

    const name = t.displayName;
    const n32 = lbU32(lbScoreOf(t, v.startOf ? v.startOf(t) : 0));
    const doName = v.showNames && name.length > 0;
    const doScore = v.showScores && n32 > 0;
    if (!doName && !doScore) continue;

    const size = t.size * 0.5;
    if (!(size > 0)) continue;
    const E = tagEdge(px - v.camX, size, halfView);
    if (E <= 0) continue;
    const c = t.isDying ? tagDeathFade(v.now - t.deathStartTime, v.deathMs) : 1;
    const g = tagFade(E, c, v.allNames === true ? 1 : drawnOpacity(t, v.now));
    if (!(g > 0)) continue;

    const R = size * zoom;
    const sx = (px - v.camX) * zoom + halfW;
    const sy = (py - v.camY) * zoom + halfH;
    let cache = _caches.get(t);
    if (cache === undefined) {
      cache = { name: newLine(), score: newLine(), scoreKey: -1, scoreText: '', life: t.id };
      _caches.set(t, cache);
      TAG_STATS.caches++;
    } else if (cache.life !== t.id) {
      cache.name = newLine(); cache.score = newLine(); cache.scoreKey = -1; cache.scoreText = ''; cache.life = t.id;
    }

    for (let k = 0; k < 2; k++) {
      let line: TagLine, text: string, fontW: number, top: number;
      if (k === 0) {
        if (!doName) continue;
        line = cache.name;
        text = name;
        fontW = TAG_NAME_FONT * size;
        top = tagNameTop(sy, R, doScore);
      } else {
        if (!doScore) continue;
        const key = tagScoreKey(n32);
        if (key !== cache.scoreKey) {
          cache.scoreKey = key;
          cache.scoreText = lbAbbrev(n32);
          TAG_STATS.scoreTexts++;
        }
        line = cache.score;
        text = cache.scoreText;
        fontW = TAG_SCORE_FONT * size;
        top = tagScoreTop(sy, R);
      }
      const font = fontW * zoom;
      const lw = tagStrokeWorld(fontW) * zoom;
      const f10 = Math.ceil(10 * font), l10 = Math.ceil(10 * lw);
      if (f10 < 1) continue;
      let r = Math.round(lw / font * 64);
      if (r < 1) r = 1; else if (r > 1024) r = 1024;
      const e = lineEntry(line, k === 1, text, f10, l10, r, v, atlas, sink);
      if (e === null) continue;
      if (quads >= room) return quads;

      const L = l10 / 10;
      let cx: number, cy: number, qw: number, qh: number;
      if (e.f10 === f10 && e.l10 === l10) {
        qw = e.bw;
        qh = e.bh;
        cx = tagBoxLeft(sx, e.w, L) + qw / 2;
        cy = tagBoxTop(top, L) + qh / 2;
      } else {
        const s = f10 / e.f10;
        const wS = e.w * s;
        qw = e.bw * s;
        qh = e.bh * s;
        cx = tagBoxLeft(sx, wS, L) + tagTextX(wS, L) - s * tagTextX(e.w, e.lw) + qw / 2;
        cy = tagBoxTop(top, L) + tagTextY(f10 / 10, L) - s * tagTextY(e.font, e.lw) + qh / 2;
      }
      if (cx + qw * 0.5 <= 0 || cx - qw * 0.5 >= v.W || cy + qh * 0.5 <= 0 || cy - qh * 0.5 >= v.H) continue;
      const o = quads * TAG_QUAD_FLOATS;
      out[o] = cx; out[o + 1] = cy; out[o + 2] = qw; out[o + 3] = qh; out[o + 4] = g;
      out[o + 5] = e.u0; out[o + 6] = e.v0; out[o + 7] = e.uw; out[o + 8] = e.vh;
      quads++;
    }
  }
  return quads;
}
