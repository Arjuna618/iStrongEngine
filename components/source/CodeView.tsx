import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { lexCode, type Tokens } from './codeLexer';
import { scrollGlide } from '../kit/presence';
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

function textPos(lines: Lines, text: string, layer: HTMLElement, node: Node, offset: number): number | null {
  let el: Node | null = node;
  if (node === layer) {
    const rowsEls = layer.querySelectorAll<HTMLElement>(':scope > .k-sc-row');
    const after = rowsEls[offset] as HTMLElement | undefined;
    if (after) return lines.starts[Number(after.dataset.i)];
    const last = rowsEls[rowsEls.length - 1] as HTMLElement | undefined;
    if (!last) return null;
    const li = Number(last.dataset.i);
    return Math.min(text.length, lines.starts[li + 1] - 1);
  }
  while (el && !(el instanceof HTMLElement && el.classList.contains('k-sc-row'))) el = el.parentNode;
  if (!el || el.parentNode !== layer) return null;
  const row = el as HTMLElement;
  const i = Number(row.dataset.i);
  const words = row.querySelector('.k-sc-text');
  const s = lines.starts[i];
  let e = Math.min(text.length, lines.starts[i + 1] - 1);
  if (e > s && text.charCodeAt(e - 1) === 13) e--;
  if (!words) return s;
  if (!words.contains(node)) {
    if (node === row && offset === 0) return s;
    return e;
  }
  const r = document.createRange();
  r.setStart(words, 0);
  r.setEnd(node, offset);
  return Math.min(e, s + r.toString().length);
}

export interface CodeViewProps {
  text: string;
  lang: string;
  find: string;
  step: { seq: number; delta: number };
  onFind: (active: number, count: number) => void;
  goLine: { line: number; seq: number } | null;
}

export const CodeView: React.FC<CodeViewProps> = React.memo(({ text, lang, find, step, onFind, goLine }) => {
  const box = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => linesOf(text), [text]);
  const [tk, setTk] = useState<Tokens | null>(() => (text.length <= SYNC_LEX ? lexCode(text, lang) : null));
  useEffect(() => {
    if (tk) return;
    let alive = true;
    lexOffThread(text, lang).then(t => { if (alive) setTk(t); });
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
  const lastLeft = useRef(0);
  const onScroll = () => {
    const el = box.current;
    if (el && el.scrollLeft !== lastLeft.current) { lastLeft.current = el.scrollLeft; el.style.setProperty('--k-sc-sl', `${el.scrollLeft}px`); }
    if (!raf.current) raf.current = requestAnimationFrame(measure);
  };

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
  const goSeq = goLine?.seq;
  useLayoutEffect(() => {
    if (!goLine) { placed.current = true; return; }
    setAskedLine(goLine.line - 1);
    markLine.current = goLine.line - 1;
    bring(goLine.line - 1);
  }, [goSeq]);
  useLayoutEffect(() => {
    if (!hits.count) { setActive(-1); return; }
    const el = box.current;
    const from = markLine.current ?? (el ? Math.max(0, Math.floor((el.scrollTop - PAD) / ROW_H)) : 0);
    const k = firstHitOf(hits, from);
    setActive(k < hits.count ? k : 0);
  }, [hits]);
  useEffect(() => {
    if (!step.seq || !hits.count) return;
    setActive(a => ((a < 0 ? 0 : a + step.delta) % hits.count + hits.count) % hits.count);
  }, [step.seq]);
  useEffect(() => { onFind(active, hits.count); }, [active, hits.count, onFind]);
  useLayoutEffect(() => {
    if (active < 0) return;
    markLine.current = hits.line[active];
    bring(hits.line[active], hits.start[active]);
  }, [active, hits]);

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
  const all = useRef<{ a: Node | null; ao: number; f: Node | null; fo: number } | null>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'a') {
      const sel = window.getSelection();
      const el = layer.current;
      if (!sel || !el || !el.firstElementChild) return;
      e.preventDefault();
      const r = document.createRange();
      r.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(r);
      all.current = { a: sel.anchorNode, ao: sel.anchorOffset, f: sel.focusNode, fo: sel.focusOffset };
    }
  };
  const onCopy = (e: React.ClipboardEvent) => {
    const sel = window.getSelection();
    const el = layer.current;
    if (!sel || !el || sel.rangeCount === 0 || sel.isCollapsed) return;
    const w = all.current;
    if (w && w.a === sel.anchorNode && w.ao === sel.anchorOffset && w.f === sel.focusNode && w.fo === sel.focusOffset) {
      e.preventDefault();
      e.clipboardData.setData('text/plain', text);
      return;
    }
    all.current = null;
    const r = sel.getRangeAt(0);
    const from = textPos(lines, text, el, r.startContainer, r.startOffset);
    const to = textPos(lines, text, el, r.endContainer, r.endOffset);
    if (from === null || to === null || to <= from) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', text.slice(from, to));
  };
  const digits = String(lines.count).length;
  const cols = Math.min(lines.widest, MAX_DRAWN + 24);

  const ticks = useMemo(() => {
    if (!hits.count) return [] as number[];
    const out: number[] = [];
    let last = -1;
    const step = Math.max(1, Math.ceil(lines.count / 400));
    for (let k = 0; k < hits.count; k++) {
      const bucket = Math.floor(hits.line[k] / step);
      if (bucket !== last) { out.push(hits.line[k]); last = bucket; }
    }
    return out;
  }, [hits, lines.count]);

  return (
    <div className="k-sc-view">
      <div ref={box} className="k-sc-scroll custom-scrollbar" onScroll={onScroll} onKeyDown={onKeyDown} onCopy={onCopy} tabIndex={0}
        role="region" aria-label="Code" style={{ ['--k-sc-digits' as string]: digits } as React.CSSProperties}>
        <div className="k-sc-rows" style={{ height: PAD * 2 + lines.count * ROW_H, width: `calc(${digits + cols}ch + ${GUTTER_PAD + 60}px)` }}>
          <Fade when={onLine !== null && onLine < lines.count}>{() => <div className="k-sc-band" style={{ top: PAD + (onLine as number) * ROW_H }} aria-hidden />}</Fade>
          <div className="k-sc-gutter" aria-hidden>{nums}</div>
          <div ref={layer} className="k-sc-lines">
            <div className="k-sc-skel" style={{ top: PAD, height: a * ROW_H }} aria-hidden />
            {rows}
            <div className="k-sc-skel" style={{ top: PAD + b * ROW_H, height: Math.max(0, lines.count - b) * ROW_H }} aria-hidden />
          </div>
        </div>
      </div>
      {ticks.length > 0 && (
        <div className="k-sc-ticks" aria-hidden>
          {ticks.map(l => <span key={l} className={active >= 0 && hits.line[active] === l ? 'k-sc-tick k-sc-tick-on' : 'k-sc-tick'} style={{ top: `${(l / Math.max(1, lines.count)) * 100}%` }} />)}
        </div>
      )}
    </div>
  );
});
CodeView.displayName = 'CodeView';
