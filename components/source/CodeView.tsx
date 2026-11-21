import { shortcutKey } from '../../utils/shortcutKey';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useHtmlDark } from '../library/useHtmlDark';
import { uiThemeId, subscribeUiTheme } from '../../utils/uiTheme';
const classicNow = () => uiThemeId() === 'classic';
import { lexCode, type Tokens } from './codeLexer';
import { scrollGlide } from '../kit/presence';
import { ArrowUp } from '../ui/icons';
import { Fade } from '../kit/Collapse';
import { fmtCount } from './sourceIndex';

export const ROW_H = 20;
const PAD = 12;
const OVERSCAN = 40;
const MAX_DRAWN = 4000;
const GUTTER_PAD = 36;
const SYNC_LEX = 150_000;
const MAX_HITS = 20_000;

const TOK_CLASS = ['', 'k-sc-c', 'k-sc-k', 'k-sc-s', 'k-sc-n', 'k-sc-f', 'k-sc-y', 'k-sc-p', 'k-sc-u', 'k-sc-g', 'k-sc-a', 'k-sc-h'];

interface Lines { starts: Uint32Array; count: number; widest: number }

function linesOf(text: string): Lines {
  const n = text.length;
  let breaks = 0;
  for (let i = 0; i < n; i++) if (text.charCodeAt(i) === 10) breaks++;
  const endsWithBreak = n > 0 && text.charCodeAt(n - 1) === 10;
  const count = Math.max(1, endsWithBreak ? breaks : breaks + 1);
  const starts = new Uint32Array(count + 1);
  let k = 1, from = 0, tabs = 0, widest = 0;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c === 9) tabs++;
    else if (c === 10) {
      const w = i - from + tabs * 3;
      if (w > widest) widest = w;
      if (k <= count) starts[k++] = i + 1;
      from = i + 1; tabs = 0;
    }
  }
  if (from < n) { const w = n - from + tabs * 3; if (w > widest) widest = w; }
  starts[count] = endsWithBreak ? n : n + 1;
  return { starts, count, widest };
}

function lineAt(lines: Lines, pos: number): number {
  let lo = 0, hi = lines.count - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lines.starts[mid] <= pos) lo = mid; else hi = mid - 1; }
  return lo;
}
function tokenAt(tk: Tokens, pos: number): number {
  let lo = 0, hi = tk.count - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tk.starts[mid] <= pos) lo = mid; else hi = mid - 1; }
  return lo;
}

export interface Hits { line: Int32Array; start: Int32Array; end: Int32Array; count: number }
const NO_HITS: Hits = { line: new Int32Array(0), start: new Int32Array(0), end: new Int32Array(0), count: 0 };

function findHits(lower: string, q: string, lines: Lines): Hits {
  if (!q) return NO_HITS;
  const line = new Int32Array(MAX_HITS), start = new Int32Array(MAX_HITS), end = new Int32Array(MAX_HITS);
  let count = 0, from = 0, ln = 0;
  while (count < MAX_HITS) {
    const at = lower.indexOf(q, from);
    if (at < 0) break;
    while (ln + 1 < lines.count && lines.starts[ln + 1] <= at) ln++;
    line[count] = ln; start[count] = at - lines.starts[ln]; end[count] = start[count] + q.length;
    count++;
    from = at + q.length;
  }
  return { line, start, end, count };
}
function firstHitOf(h: Hits, line: number): number {
  let lo = 0, hi = h.count;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (h.line[mid] < line) lo = mid + 1; else hi = mid; }
  return lo;
}

let worker: Worker | null = null;
let workerFailed = false;
let lexSeq = 0;
const waiting = new Map<number, (t: Tokens) => void>();
function lexOffThread(text: string, lang: string): Promise<Tokens> {
  if (!worker && !workerFailed) {
    try {
      worker = new Worker(new URL('./lexWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number } & Tokens>) => {
        const done = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        done?.({ starts: e.data.starts, kinds: e.data.kinds, count: e.data.count });
      };
      worker.onerror = () => { workerFailed = true; worker = null; for (const [, done] of waiting) done({ starts: new Uint32Array([0]), kinds: new Uint8Array([0]), count: 1 }); waiting.clear(); };
    } catch { workerFailed = true; }
  }
  if (!worker) return Promise.resolve(lexCode(text, lang));
  const id = ++lexSeq;
  return new Promise(resolve => { waiting.set(id, resolve); worker!.postMessage({ id, text, lang }); });
}

const TOKENS_KEPT = 6;
const tokensKept = new Map<string, { lang: string; tk: Tokens }>();
const keepTokens = (text: string, lang: string, tk: Tokens): Tokens => {
  tokensKept.delete(text);
  tokensKept.set(text, { lang, tk });
  if (tokensKept.size > TOKENS_KEPT) tokensKept.delete(tokensKept.keys().next().value as string);
  return tk;
};
export function peekTokens(text: string, lang: string): Tokens | null {
  const k = tokensKept.get(text);
  if (k && k.lang === lang) return k.tk;
  return text.length <= SYNC_LEX ? keepTokens(text, lang, lexCode(text, lang)) : null;
}
const lexing = new Map<string, Promise<Tokens>>();
function tokensOf(text: string, lang: string): Promise<Tokens> {
  const now = peekTokens(text, lang);
  if (now) return Promise.resolve(now);
  let p = lexing.get(text);
  if (!p) {
    p = lexOffThread(text, lang).then(tk => { lexing.delete(text); return keepTokens(text, lang, tk); });
    lexing.set(text, p);
  }
  return p;
}
export function prepareCode(text: string, lang: string): Promise<void> | null {
  return peekTokens(text, lang) ? null : tokensOf(text, lang).then(() => undefined);
}

const Row = React.memo(function Row({ i, text, s, e, tk, hits, active }: {
  i: number; text: string; s: number; e: number; tk: Tokens | null; hits: Hits; active: number;
}) {
  const parts: React.ReactNode[] = [];
  const cut = Math.min(e, s + MAX_DRAWN);
  let t = tk ? tokenAt(tk, s) : -1;
  let h = hits.count ? firstHitOf(hits, i) : 0;
  let p = s, key = 0;
  while (p < cut) {
    let end = cut, kind = 0, mark = 0;
    if (tk) {
      kind = tk.kinds[t];
      if (t + 1 < tk.count && tk.starts[t + 1] < end) end = tk.starts[t + 1];
    }
    if (h < hits.count && hits.line[h] === i) {
      const hs = s + hits.start[h], he = s + hits.end[h];
      if (p < hs) { if (hs < end) end = hs; }
      else { mark = h === active ? 2 : 1; if (he < end) end = he; }
    }
    if (end <= p) end = p + 1;
    const piece = text.slice(p, end);
    const cls = mark ? (mark === 2 ? 'k-sc-hit k-sc-hit-on ' : 'k-sc-hit ') + TOK_CLASS[kind] : TOK_CLASS[kind];
    parts.push(cls ? <span key={key++} className={cls}>{piece}</span> : piece);
    p = end;
    if (tk) while (t + 1 < tk.count && tk.starts[t + 1] <= p) t++;
    if (h < hits.count && hits.line[h] === i && p >= s + hits.end[h]) h++;
  }
  return (
    <div className="k-sc-row" data-i={i} style={{ top: PAD + i * ROW_H }}>
      <span className="k-sc-text">{parts}</span>
      {e > cut && <span className="k-sc-more">{`  +${fmtCount(e - cut)} more characters`}</span>}
    </div>
  );
});

const TEXT_PAD = 48;
const isWordCh = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c > 127;
const isSpaceCh = (c: number) => c === 32 || c === 9;
let _range: Range | null = null;
function charRange(words: HTMLElement, c: number): Range | null {
  const r = _range ?? (_range = document.createRange());
  const walk = document.createTreeWalker(words, NodeFilter.SHOW_TEXT);
  let acc = 0;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const len = (n as Text).length;
    if (c < acc + len) { r.setStart(n, c - acc); r.setEnd(n, c - acc + 1); return r; }
    acc += len;
  }
  return null;
}
let _picked: () => string = () => '';
export const codeViewPicked = (): string => _picked();

export const CodeWait: React.FC<{ lines: number }> = ({ lines }) => {
  const count = Math.max(1, lines);
  const digits = String(count).length;
  const shown = Math.min(count, 120);
  const nums: React.ReactNode[] = [];
  for (let i = 0; i < shown; i++) nums.push(<span key={i} className="k-sc-num" style={{ top: PAD + i * ROW_H }}>{i + 1}</span>);
  return (
    <div className="k-sc-view" aria-busy="true">
      <div className="k-sc-scroll k-sc-waiting" style={{ ['--k-sc-digits' as string]: digits } as React.CSSProperties} aria-hidden>
        <div className="k-sc-rows" style={{ height: PAD * 2 + shown * ROW_H }}>
          <div className="k-sc-gutter">{nums}</div>
          <div className="k-sc-lines"><div className="k-sc-skel" style={{ top: PAD, height: shown * ROW_H }} /></div>
        </div>
      </div>
    </div>
  );
};

export interface CodeViewProps {
  text: string;
  lang: string;
  find: string;
  step: { seq: number; delta: number };
  onFind: (active: number, count: number) => void;
  goLine: { line: number; seq: number } | null;
  arrive?: boolean;
}

export const CodeView: React.FC<CodeViewProps> = React.memo(({ text, lang, find, step, onFind, goLine, arrive }) => {
  const box = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => linesOf(text), [text]);
  const [tk, setTk] = useState<Tokens | null>(() => peekTokens(text, lang));
  useEffect(() => {
    if (tk) return;
    let alive = true;
    tokensOf(text, lang).then(t => { if (alive) setTk(t); });
    return () => { alive = false; };
  }, [text, lang, tk]);

  const q = find.toLowerCase();
  const wantLower = !!q;
  const lower = useMemo(() => (wantLower ? text.toLowerCase() : ''), [text, wantLower]);
  const hits = useMemo(() => (q ? findHits(lower, q, lines) : NO_HITS), [lower, q, lines]);
  const [activeRaw, setActive] = useState(-1);
  const active = hits.count ? Math.min(Math.max(0, activeRaw), hits.count - 1) : -1;
  const markLine = useRef<number | null>(goLine ? goLine.line - 1 : null);

  const [view, setView] = useState({ top: 0, h: 600 });
  const raf = useRef(0);
  const measure = () => {
    raf.current = 0;
    const el = box.current;
    if (!el) return;
    const top = el.scrollTop, h = el.clientHeight || 600;
    setView(v => (Math.abs(v.top - top) < ROW_H * 8 && v.h === h ? v : { top, h }));
  };
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(() => { if (!raf.current) raf.current = requestAnimationFrame(measure); });
    ro.observe(el);
    return () => { ro.disconnect(); if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  const dark = useHtmlDark();
  const classic = useSyncExternalStore(subscribeUiTheme, classicNow, classicNow);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let fill = '';
    const alphaOf = (c: string): number => {
      if (!c || c === 'transparent') return 0;
      const slash = c.match(/\/\s*([\d.]+)(%?)\s*\)\s*$/);
      if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1);
      const m = c.match(/^rgba\(([^)]+)\)$/);
      if (m) { const parts = m[1].split(','); return parts.length > 3 ? parseFloat(parts[3]) : 1; }
      return 1;
    };
    for (let p: HTMLElement | null = el; p; p = p.parentElement) {
      const c = getComputedStyle(p).backgroundColor;
      const a = alphaOf(c);
      if (a <= 0.001) continue;
      if (a >= 0.99) fill = c;
      break;
    }
    if (fill) el.style.setProperty('--k-sc-under', fill); else el.style.removeProperty('--k-sc-under');
  }, [dark, classic]);
  const lastLeft = useRef(0);
  const [far, setFar] = useState(false);
  const onScroll = () => {
    const el = box.current;
    if (el && el.scrollLeft !== lastLeft.current) { lastLeft.current = el.scrollLeft; el.style.setProperty('--k-sc-sl', `${el.scrollLeft}px`); }
    if (el) { const next = el.scrollTop > 240; setFar(prev => (prev === next ? prev : next)); }
    if (!raf.current) raf.current = requestAnimationFrame(measure);
  };
  const toTop = () => { const el = box.current; if (el) scrollGlide(el, () => 0, { follow: 30 }); };

  const [askedLine, setAskedLine] = useState<number | null>(goLine ? goLine.line - 1 : null);
  const onLine = active >= 0 ? hits.line[active] : askedLine;

  const placed = useRef(false);
  const bring = (line: number, col?: number) => {
    const el = box.current;
    if (!el) return;
    const to = Math.max(0, PAD + line * ROW_H - el.clientHeight / 2 + ROW_H / 2);
    if (!placed.current) { el.scrollTop = to; placed.current = true; measure(); }
    else scrollGlide(el, to);
    if (col !== undefined) {
      const ch = parseFloat(getComputedStyle(el).fontSize) * 0.6;
      const gutter = String(lines.count).length * ch + GUTTER_PAD;
      const x = gutter + col * ch;
      if (x < el.scrollLeft + gutter + 8 || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - gutter - el.clientWidth / 3);
      else if (x < el.clientWidth * 0.6) el.scrollLeft = 0;
    }
  };
  const brought = useRef(false);
  const arriveAsk = useRef(false);
  const hitsSeen = useRef<Hits | null>(null);
  const goTo = (k: number) => {
    brought.current = true;
    markLine.current = hits.line[k];
    bring(hits.line[k], hits.start[k]);
  };
  const goSeq = goLine?.seq;
  useLayoutEffect(() => {
    if (!goLine) { placed.current = true; return; }
    setAskedLine(goLine.line - 1);
    markLine.current = goLine.line - 1;
    bring(goLine.line - 1);
    if (hits.count && hitsSeen.current === hits) {
      const k0 = firstHitOf(hits, goLine.line - 1), k = k0 < hits.count ? k0 : 0;
      setActive(k);
      goTo(k);
    } else arriveAsk.current = true;
  }, [goSeq]);
  useLayoutEffect(() => {
    hitsSeen.current = hits;
    if (!hits.count) { setActive(-1); brought.current = false; arriveAsk.current = false; return; }
    const el = box.current;
    const from = markLine.current ?? (el ? Math.max(0, Math.floor((el.scrollTop - PAD) / ROW_H)) : 0);
    const k0 = firstHitOf(hits, from), k = k0 < hits.count ? k0 : 0;
    setActive(k);
    if (arriveAsk.current) { arriveAsk.current = false; goTo(k); } else brought.current = false;
  }, [hits]);
  useEffect(() => {
    if (!step.seq || !hits.count) return;
    const cur = active < 0 ? 0 : active;
    const el = box.current, ln = hits.line[cur];
    const seen = !!el && PAD + ln * ROW_H >= el.scrollTop && PAD + (ln + 1) * ROW_H <= el.scrollTop + el.clientHeight;
    const k = brought.current || seen ? ((cur + step.delta) % hits.count + hits.count) % hits.count : cur;
    setActive(k);
    goTo(k);
  }, [step.seq]);
  useEffect(() => { onFind(active, hits.count); }, [active, hits.count, onFind]);

  const a = Math.max(0, Math.floor((view.top - PAD) / ROW_H) - OVERSCAN);
  const b = Math.min(lines.count, Math.ceil((view.top + view.h) / ROW_H) + OVERSCAN);
  const rows: React.ReactNode[] = [];
  const nums: React.ReactNode[] = [];
  for (let i = a; i < b; i++) {
    const s = lines.starts[i];
    let e = lines.starts[i + 1] - 1;
    if (e > text.length) e = text.length;
    if (e > s && text.charCodeAt(e - 1) === 13) e--;
    const lineActive = active >= 0 && hits.line[active] === i ? active : -1;
    rows.push(<Row key={i} i={i} text={text} s={s} e={e} tk={tk} hits={hits} active={lineActive} />);
    nums.push(<span key={i} className={onLine === i ? 'k-sc-num k-sc-num-on' : 'k-sc-num'} style={{ top: PAD + i * ROW_H }}>{i + 1}</span>);
  }

  const layer = useRef<HTMLDivElement>(null);
  const selLayer = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const sel = useRef<{ a: number; f: number } | null>(null);
  const built = useRef({ a: 0, b: 0 });
  const lineEnd = (i: number) => {
    const s = lines.starts[i];
    let e = Math.min(text.length, lines.starts[i + 1] - 1);
    if (e > s && text.charCodeAt(e - 1) === 13) e--;
    return e;
  };
  const scaleOf = (el: HTMLElement) => { const w = el.offsetWidth; return w > 0 ? el.getBoundingClientRect().width / w : 1; };
  const colW = () => { const p = probe.current; return p && p.offsetWidth > 0 ? p.offsetWidth / 32 : 7.5; };
  const wordsOf = (i: number): HTMLElement | null => {
    const row = layer.current?.querySelector<HTMLElement>(`:scope > .k-sc-row[data-i="${i}"]`);
    return row ? row.querySelector<HTMLElement>('.k-sc-text') : null;
  };
  const xOf = (words: HTMLElement, dl: number, c: number, left: number, k: number): number => {
    if (c <= 0) return 0;
    if (c >= dl) return Math.max(0, words.offsetWidth - TEXT_PAD);
    const r = charRange(words, c - 1);
    return r ? (r.getBoundingClientRect().right - left) / k : Math.max(0, words.offsetWidth - TEXT_PAD);
  };
  const colAt = (i: number, lx: number, left: number, k: number): number => {
    const s = lines.starts[i], e = lineEnd(i);
    const dl = Math.min(e, s + MAX_DRAWN) - s;
    if (lx <= 0 || dl <= 0) return lx <= 0 ? 0 : e - s;
    const words = wordsOf(i);
    if (words) {
      if (lx >= Math.max(0, words.offsetWidth - TEXT_PAD)) return e - s;
      let lo = 0, hi = dl;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (xOf(words, dl, mid, left, k) <= lx) lo = mid; else hi = mid - 1; }
      if (lo < dl && xOf(words, dl, lo + 1, left, k) - lx < lx - xOf(words, dl, lo, left, k)) lo++;
      return lo;
    }
    const cw = colW();
    let col = 0;
    for (let c = 0; c < e - s; c++) {
      const next = text.charCodeAt(s + c) === 9 ? (Math.floor(col / 4) + 1) * 4 : col + 1;
      if (lx < ((col + next) / 2) * cw) return c;
      col = next;
    }
    return e - s;
  };
  const posAt = (x: number, y: number): number => {
    const el = layer.current, sc = box.current;
    if (!el || !sc || lines.count === 0) return 0;
    const lr = el.getBoundingClientRect(), k = scaleOf(el);
    const i = Math.floor(((y - lr.top) / k - PAD) / ROW_H);
    if (i >= lines.count) return lineEnd(lines.count - 1);
    const li = Math.max(0, i);
    const lx = Math.max((x - lr.left) / k, sc.scrollLeft);
    return lines.starts[li] + colAt(li, lx, lr.left, k);
  };
  const lineOfPos = (p: number) => lineAt(lines, Math.min(p, Math.max(0, text.length - 1)));
  const wordAt = (p: number): [number, number] => {
    const i = lineOfPos(p), s = lines.starts[i], e = lineEnd(i);
    if (e <= s) return [s, s];
    const at = p < e ? p : e - 1;
    const c = text.charCodeAt(at);
    const same = isWordCh(c) ? isWordCh : isSpaceCh(c) ? isSpaceCh : null;
    if (!same) return [at, at + 1];
    let a0 = at, a1 = at + 1;
    while (a0 > s && same(text.charCodeAt(a0 - 1))) a0--;
    while (a1 < e && same(text.charCodeAt(a1))) a1++;
    return [a0, a1];
  };
  const lineSpan = (p: number): [number, number] => { const i = lineOfPos(p); return [lines.starts[i], Math.min(text.length, lines.starts[i + 1])]; };
  const picked = () => { const s = sel.current; return s && s.a !== s.f ? text.slice(Math.min(s.a, s.f), Math.max(s.a, s.f)) : ''; };
  const paint = () => {
    const host = selLayer.current, el = layer.current;
    if (!host || !el) return;
    const s = sel.current;
    const boxes: number[] = [];
    if (s && s.a !== s.f && lines.count > 0) {
      const lo = Math.min(s.a, s.f), hi = Math.max(s.a, s.f);
      const from = Math.max(lineOfPos(lo), built.current.a), to = Math.min(lineOfPos(hi), built.current.b - 1);
      if (from <= to) {
        const left = el.getBoundingClientRect().left, k = scaleOf(el), nl = colW();
        for (let i = from; i <= to; i++) {
          const words = wordsOf(i);
          if (!words) continue;
          const ls = lines.starts[i], le = lineEnd(i), dl = Math.min(le, ls + MAX_DRAWN) - ls;
          const x0 = lo <= ls ? 0 : xOf(words, dl, lo - ls, left, k);
          const x1 = hi > le ? Math.max(0, words.offsetWidth - TEXT_PAD) + nl : xOf(words, dl, hi - ls, left, k);
          if (x1 > x0) boxes.push(i, x0, x1);
        }
      }
    }
    let used = 0;
    for (let n = 0; n < boxes.length; n += 3, used++) {
      let div = host.children[used] as HTMLElement | undefined;
      if (!div) { div = document.createElement('div'); div.className = 'k-sc-selbox'; host.appendChild(div); }
      div.style.top = `${PAD + boxes[n] * ROW_H}px`;
      div.style.left = `${boxes[n + 1]}px`;
      div.style.width = `${boxes[n + 2] - boxes[n + 1]}px`;
    }
    while (host.children.length > used) host.lastChild!.remove();
  };
  useLayoutEffect(() => { built.current = { a, b }; paint(); _picked = picked; });
  useEffect(() => () => { _picked = () => ''; }, []);
  useEffect(() => { sel.current = null; paint(); }, [text]);

  const copyText = (t: string) => {
    const viaBox = () => {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { }
      ta.remove(); box.current?.focus({ preventScroll: true });
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(t).catch(viaBox); else viaBox();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = shortcutKey(e).toLowerCase();
    if (key === 'a') { e.preventDefault(); sel.current = { a: 0, f: text.length }; paint(); }
    else if (key === 'c' || key === 'insert') { const t = picked(); if (t) { e.preventDefault(); copyText(t); } }
  };

  const drag = useRef<{ mode: 'char' | 'word' | 'line'; a0: number; a1: number; x: number; y: number; raf: number; t: number } | null>(null);
  const endDrag = useRef<() => void>(() => {});
  useEffect(() => () => endDrag.current(), []);
  const extendTo = (d: { mode: 'char' | 'word' | 'line'; a0: number; a1: number }, p: number) => {
    if (d.mode === 'char') { sel.current = { a: d.a0, f: p }; return; }
    const [s0, s1] = d.mode === 'word' ? wordAt(p) : lineSpan(p);
    sel.current = p < d.a0 ? { a: d.a1, f: s0 } : { a: d.a0, f: Math.max(s1, d.a1) };
  };
  const onMouseDown = (e: React.MouseEvent) => {
    const sc = box.current, el = layer.current;
    if (e.button !== 0 || !sc || !el) return;
    const br = sc.getBoundingClientRect();
    const k = scaleOf(sc);
    if ((e.clientX - br.left) / k > sc.clientLeft + sc.clientWidth || (e.clientY - br.top) / k > sc.clientTop + sc.clientHeight) return;
    e.preventDefault();
    sc.focus({ preventScroll: true });
    const onNumbers = e.clientX < el.getBoundingClientRect().left + sc.scrollLeft * scaleOf(el);
    const p = posAt(e.clientX, e.clientY);
    const mode: 'char' | 'word' | 'line' = onNumbers || e.detail >= 3 ? 'line' : e.detail === 2 ? 'word' : 'char';
    let a0 = p, a1 = p;
    const cur = sel.current;
    if (mode === 'char' && e.shiftKey && cur) { a0 = a1 = cur.a; sel.current = { a: cur.a, f: p }; }
    else if (mode === 'char') sel.current = { a: p, f: p };
    else { [a0, a1] = mode === 'word' ? wordAt(p) : lineSpan(p); sel.current = { a: a0, f: a1 }; }
    paint();
    endDrag.current();
    const d = { mode, a0, a1, x: e.clientX, y: e.clientY, raf: 0, t: 0 };
    drag.current = d;
    const tick = (now: number) => {
      d.raf = 0;
      const s2 = box.current, l2 = layer.current;
      if (!s2 || !l2) return;
      const r = s2.getBoundingClientRect(), kk = scaleOf(s2);
      const top = r.top + s2.clientTop * kk, bottom = top + s2.clientHeight * kk;
      const left = l2.getBoundingClientRect().left + s2.scrollLeft * scaleOf(l2), right = r.left + (s2.clientLeft + s2.clientWidth) * kk;
      const maxTop = s2.scrollHeight - s2.clientHeight, maxLeft = s2.scrollWidth - s2.clientWidth;
      const dy = d.y < top && s2.scrollTop > 0 ? d.y - top : d.y > bottom && s2.scrollTop < maxTop - 0.5 ? d.y - bottom : 0;
      const dx = d.x < left && s2.scrollLeft > 0 ? d.x - left : d.x > right && s2.scrollLeft < maxLeft - 0.5 ? d.x - right : 0;
      if (dx || dy) {
        const dt = d.t ? Math.min(0.05, (now - d.t) / 1000) : 1 / 60;
        const speed = (v: number) => Math.sign(v) * Math.min(4000, 120 + Math.abs(v / kk) * 14) * dt;
        if (dy) s2.scrollTop += speed(dy);
        if (dx) s2.scrollLeft += speed(dx);
        d.t = now;
      } else d.t = 0;
      extendTo(d, posAt(d.x, d.y));
      paint();
      if (dx || dy) d.raf = requestAnimationFrame(tick);
    };
    const move = (ev: MouseEvent) => {
      if (!(ev.buttons & 1)) { endDrag.current(); return; }
      ev.preventDefault();
      d.x = ev.clientX; d.y = ev.clientY;
      if (!d.raf) d.raf = requestAnimationFrame(tick);
    };
    const up = () => endDrag.current();
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
    window.addEventListener('blur', up);
    endDrag.current = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      window.removeEventListener('blur', up);
      if (d.raf) cancelAnimationFrame(d.raf);
      if (drag.current === d) drag.current = null;
      endDrag.current = () => {};
    };
  };
  const digits = String(lines.count).length;
  const cols = Math.min(lines.widest, MAX_DRAWN + 24);

  return (
    <div className="k-sc-view">
      <div ref={box} className="k-sc-scroll custom-scrollbar" onScroll={onScroll} onKeyDown={onKeyDown} onMouseDown={onMouseDown} tabIndex={0}
        role="region" aria-label="Code" style={{ ['--k-sc-digits' as string]: digits } as React.CSSProperties}>
        <div className="k-sc-rows" style={{ height: PAD * 2 + lines.count * ROW_H, width: `calc(${digits + cols}ch + ${GUTTER_PAD + 60}px)` }}>
          <Fade when={onLine !== null && onLine < lines.count}>{() => <div className="k-sc-band" style={{ top: PAD + (onLine as number) * ROW_H }} aria-hidden />}</Fade>
          <div className="k-sc-gutter" aria-hidden>{nums}</div>
          <div ref={layer} className={arrive ? 'k-sc-lines k-sc-arrive' : 'k-sc-lines'}>
            <div ref={selLayer} className="k-sc-sel" aria-hidden />
            <span ref={probe} className="k-sc-probe" aria-hidden>{'0'.repeat(32)}</span>
            <div className="k-sc-skel" style={{ top: PAD, height: a * ROW_H }} aria-hidden />
            {rows}
            <div className="k-sc-skel" style={{ top: PAD + b * ROW_H, height: Math.max(0, lines.count - b) * ROW_H }} aria-hidden />
          </div>
        </div>
      </div>
      {arrive && <div className="k-sc-arrive-veil" style={{ ['--k-sc-digits' as string]: digits } as React.CSSProperties} aria-hidden />}
      <Fade when={far}>
        <button type="button" onClick={toTop} title="Back to the top" aria-label="Back to the top" className="k-ico k-rd-fab k-sc-fab">
          <ArrowUp size={15} />
        </button>
      </Fade>
    </div>
  );
});
CodeView.displayName = 'CodeView';
