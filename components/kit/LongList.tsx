import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Collapse, EMPTY_KEY, mergeEntries, type ListEntry } from './Collapse';
import { nearestScrollTop, scrollGlide } from './presence';

const OVERSCAN = 480;
const MARGIN = 160;
const FIRST_ROWS = 20;

function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p && p !== document.body; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}
function topsOf(keys: readonly string[], heights: ReadonlyMap<string, number>, estimate: number): Float64Array {
  const t = new Float64Array(keys.length + 1);
  let y = 0;
  for (let i = 0; i < keys.length; i++) { t[i] = y; y += heights.get(keys[i]) ?? estimate; }
  t[keys.length] = y;
  return t;
}
function rowAt(t: Float64Array, n: number, y: number): number {
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (t[mid] <= y) lo = mid; else hi = mid - 1; }
  return lo;
}
const zoomOf = (s: HTMLElement, r: DOMRect): number => (s.offsetHeight > 0 && r.height > 0 ? r.height / s.offsetHeight : 1);

export interface RowWindow {
  a: number; b: number;
  above: number; below: number;
  keys: readonly string[];
  all: ReadonlySet<string>;
  box: React.MutableRefObject<HTMLElement | null>;
  rows: React.MutableRefObject<HTMLElement | null>;
  reveal: (key: string) => void;
}

export function useRowWindow(count: number, rowKey: (i: number) => string, estimate: number): RowWindow {
  const box = useRef<HTMLElement | null>(null);
  const rows = useRef<HTMLElement | null>(null);
  const scroller = useRef<HTMLElement | null>(null);
  const heights = useRef(new Map<string, number>());
  const [range, setRange] = useState({ a: 0, b: FIRST_ROWS });
  const rangeNow = useRef(range);
  const raf = useRef(0);
  const ro = useRef<ResizeObserver | null>(null);
  const observed = useRef(new Set<Element>());

  const keys: string[] = new Array(count);
  const all = new Set<string>();
  for (let i = 0; i < count; i++) { const k = rowKey(i); keys[i] = k; all.add(k); }
  const tops = topsOf(keys, heights.current, estimate);
  const a = Math.min(range.a, count), b = Math.max(a, Math.min(range.b, count));

  const live = useRef({ keys, tops, estimate, all, dirty: false });
  live.current.keys = keys; live.current.tops = tops; live.current.estimate = estimate; live.current.all = all; live.current.dirty = false;
  const freshTops = () => {
    const L = live.current;
    if (L.dirty) { L.tops = topsOf(L.keys, heights.current, L.estimate); L.dirty = false; }
    return L.tops;
  };

  const check = useCallback(() => {
    raf.current = 0;
    const el = box.current, s = scroller.current;
    if (!el) return;
    const n = live.current.keys.length;
    const was = rangeNow.current;
    if (!s) {
      if (was.a !== 0 || was.b < n) { const r = { a: 0, b: n }; rangeNow.current = r; setRange(r); }
      return;
    }
    const t = freshTops();
    const sr = s.getBoundingClientRect(), lr = el.getBoundingClientRect();
    const top = (sr.top - lr.top) / zoomOf(s, sr) + s.clientTop, bot = top + s.clientHeight;
    const A = Math.min(was.a, n), B = Math.min(was.b, n);
    if ((A === 0 || top - t[A] >= MARGIN) && (B >= n || t[B] - bot >= MARGIN)) return;
    const na = n === 0 ? 0 : rowAt(t, n, top - OVERSCAN);
    const nb = n === 0 ? 0 : Math.min(n, rowAt(t, n, bot + OVERSCAN) + 1);
    if (na !== A || nb !== B) { const r = { a: na, b: nb }; rangeNow.current = r; setRange(r); }
  }, []);
  const soon = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(check); }, [check]);

  useLayoutEffect(() => {
    const s = scrollerOf(box.current);
    scroller.current = s;
    const seenSize = new ResizeObserver(soon);
    if (s) {
      s.addEventListener('scroll', soon, { passive: true });
      seenSize.observe(s);
      if (s.firstElementChild) seenSize.observe(s.firstElementChild);
    }
    ro.current = new ResizeObserver(entries => {
      for (const e of entries) {
        const r = e.target as HTMLElement, k = r.dataset.ll;
        if (k === undefined || !r.isConnected || !live.current.all.has(k)) continue;
        const h = r.offsetHeight;
        if (h > 0 && heights.current.get(k) !== h) { heights.current.set(k, h); live.current.dirty = true; }
      }
      if (live.current.dirty) soon();
    });
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      if (s) s.removeEventListener('scroll', soon);
      seenSize.disconnect();
      ro.current?.disconnect();
    };
  }, [soon]);

  useLayoutEffect(() => {
    const host = rows.current;
    if (host) {
      for (let c = host.firstElementChild; c; c = c.nextElementSibling) {
        const r = c as HTMLElement, k = r.dataset.ll;
        if (k === undefined || !all.has(k)) continue;
        const h = r.offsetHeight;
        if (h > 0 && heights.current.get(k) !== h) { heights.current.set(k, h); live.current.dirty = true; }
        if (!observed.current.has(r)) { observed.current.add(r); ro.current?.observe(r); }
      }
      if (observed.current.size > (b - a) + 16) observed.current.forEach(el => { if (!el.isConnected) { ro.current?.unobserve(el); observed.current.delete(el); } });
      if (heights.current.size > count * 2 + 64) heights.current.forEach((_h, k) => { if (!all.has(k)) heights.current.delete(k); });
    }
    check();
  });

  const reveal = useCallback((key: string) => {
    const s = scroller.current, el = box.current;
    if (!s || !el) return;
    const i = live.current.keys.indexOf(key);
    if (i < 0) return;
    const t = freshTops();
    const sr = s.getBoundingClientRect(), lr = el.getBoundingClientRect();
    const at = (lr.top - sr.top) / zoomOf(s, sr) - s.clientTop + s.scrollTop + t[i];
    const to = nearestScrollTop(s, at, t[i + 1] - t[i], 8);
    if (to != null) scrollGlide(s, Math.max(0, to));
  }, []);

  return { a, b, above: tops[a], below: tops[count] - tops[b], keys, all, box, rows, reveal };
}

export interface LongListProps {
  count: number;
  rowKey: (index: number) => string;
  renderRow: (index: number) => React.ReactNode;
  gap?: number;
  estimate?: number;
  empty?: React.ReactNode;
  className?: string;
  reveal?: string | null;
}

export const LongList: React.FC<LongListProps> = ({ count, rowKey, renderRow, gap = 0, estimate = 56, empty, className, reveal }) => {
  const win = useRowWindow(count, rowKey, estimate + gap);
  const [, bump] = useState(0);
  const list = useRef<ListEntry[] | null>(null);
  const known = useRef<ReadonlySet<string> | null>(null);
  const next: { key: string; el: React.ReactNode }[] = [];
  for (let i = win.a; i < win.b; i++) next.push({ key: win.keys[i], el: renderRow(i) });
  if (count === 0 && empty != null) next.push({ key: EMPTY_KEY, el: empty });
  let merged: ListEntry[];
  if (!list.current || !known.current) {
    merged = next.map(n => ({ key: n.key, el: n.el, leaving: false, opened: true, reveal: false }));
  } else {
    const inNext = new Set(next.map(n => n.key));
    const stays = list.current.filter(e => inNext.has(e.key) || e.key === EMPTY_KEY || !win.all.has(e.key));
    merged = mergeEntries(stays, next);
    for (const e of merged) if (!e.opened && !e.leaving && known.current.has(e.key)) e.opened = true;
  }
  list.current = merged;
  known.current = win.all;

  useLayoutEffect(() => {
    const fresh = list.current!.filter(e => !e.opened && !e.leaving);
    if (fresh.length === 0) return;
    const one = fresh.length === 1 && fresh[0].key !== EMPTY_KEY;
    for (const e of fresh) { e.opened = true; e.reveal = one; }
    bump(n => n + 1);
  });
  const drop = (key: string) => {
    const L = list.current;
    if (!L) return;
    const i = L.findIndex(e => e.key === key && e.leaving);
    if (i < 0) return;
    list.current = L.slice(0, i).concat(L.slice(i + 1));
    bump(n => n + 1);
  };
  const lastReveal = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (reveal === lastReveal.current) return;
    lastReveal.current = reveal;
    if (reveal != null) win.reveal(reveal);
  }, [reveal]);

  const space = (h: number): React.CSSProperties => ({ height: h, ['--vl-row' as string]: `${estimate}px` });
  return (
    <div ref={el => { win.box.current = el; }} className={className} style={{ display: 'flow-root' }}>
      <div ref={el => { win.rows.current = el; }} style={gap ? { marginTop: -gap } : undefined}>
        {win.above > 0 ? <div key={'\u0000above'} className="k-vl-skel" style={space(win.above)} aria-hidden="true" /> : null}
        {merged.map(e => (
          <Collapse key={e.key} dataKey={e.key} open={e.opened && !e.leaving} gapPx={gap} reveal={e.reveal ? 'self' : 'none'} onClosed={() => drop(e.key)}>
            {e.el}
          </Collapse>
        ))}
        {win.below > 0 ? <div key={'\u0000below'} className="k-vl-skel" style={space(win.below)} aria-hidden="true" /> : null}
      </div>
    </div>
  );
};
