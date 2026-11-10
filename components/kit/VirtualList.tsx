import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FOLD_MS, FOLD_FADE_MS } from './Collapse';
import { EASE, motionOff, isMoving, takeOver as takeOverProp, scrollGlide, stopScrollGlide, nearestScrollTop } from './presence';

const EMPTY_GHOST = '\u0000empty';
const FRESH_KEEP_MS = 1500;
interface Ghost { id: number; key: string; node: React.ReactNode; top: number; h: number; w: number; started: boolean; fadeEnds: number }
let ghostSeq = 0;
interface Drawn {
  empty: boolean; keys: string[]; tops: Float64Array; natural: number; frameH: number; frameW: number; rowW: number;
  shown: Map<string, { node: React.ReactNode; top: number; h: number }>;
}

const reducedMotion = motionOff;
function takeOver(el: HTMLElement, prop: 'top' | 'height'): number | null {
  if (!isMoving(el, prop)) return null;
  const v = parseFloat(takeOverProp(el, prop));
  return Number.isFinite(v) ? v : null;
}
function glideScroll(el: HTMLElement, to: number): void { scrollGlide(el, to); }

export interface VirtualListProps {
  count: number;
  rowHeight: number | ((index: number) => number);
  maxHeight?: number;
  maxRows?: number;
  overscan?: number;
  renderRow: (index: number) => React.ReactNode;
  rowKey: (index: number) => string;
  stickToEnd?: boolean;
  revealNew?: boolean;
  className?: string;
  empty?: React.ReactNode;
  boxRef?: React.MutableRefObject<HTMLDivElement | null>;
  boxProps?: React.HTMLAttributes<HTMLDivElement>;
}

function rowTops(count: number, h: number | ((i: number) => number)): Float64Array {
  const tops = new Float64Array(count + 1);
  if (typeof h === 'number') { for (let i = 0; i <= count; i++) tops[i] = i * h; return tops; }
  let y = 0;
  for (let i = 0; i < count; i++) { tops[i] = y; y += h(i); }
  tops[count] = y;
  return tops;
}
function rowAt(tops: Float64Array, count: number, y: number): number {
  let lo = 0, hi = count - 1;
  if (count <= 0) return 0;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tops[mid] <= y) lo = mid; else hi = mid - 1; }
  return lo;
}

export function virtualRowAtPoint(box: HTMLDivElement | null, clientY: number): number {
  if (!box) return -1;
  const rows = box.querySelectorAll<HTMLElement>(':scope > .k-vl-row');
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (clientY >= r.top && clientY < r.bottom) return Number(rows[i].dataset.vlIndex);
  }
  return -1;
}

export function scrollVirtualRowIntoView(box: HTMLDivElement | null, top: number, height: number): void {
  if (!box) return;
  const to = nearestScrollTop(box, top, height);
  if (to != null) scrollGlide(box, to);
}

export const VirtualList: React.FC<VirtualListProps> = ({ count, rowHeight, maxHeight, maxRows = 8, overscan = 160, renderRow, rowKey, stickToEnd, revealNew, className, empty, boxRef, boxProps }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const tops = useMemo(() => rowTops(count, rowHeight), [count, rowHeight]);
  const total = tops[count];
  const boxH = Math.min(total, maxHeight ?? maxRows * (typeof rowHeight === 'number' ? rowHeight : 40));
  const natural = Math.min(total, boxH + 2);
  const [view, setView] = useState({ top: 0, h: boxH });
  const raf = useRef(0);
  const atEnd = useRef(true);
  const lastTotal = useRef(total);
  const seen = useRef<Set<string> | null>(null);
  const fresh = useRef<Set<string>>(new Set());
  const unbuilt = useRef<Map<string, number>>(new Map());
  const drawn = useRef<Drawn | null>(null);
  const ghosts = useRef<Ghost[]>([]);
  const building = useRef<Drawn['shown']>(new Map());
  const keysNow = useRef<string[]>([]);
  const scrollAtRender = useRef(0);
  const lastEmpty = useRef<React.ReactNode>(null);
  const [, setTick] = useState(0);
  const timers = useRef<number[]>([]);

  const measure = useCallback(() => {
    raf.current = 0;
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop, h = Math.max(el.clientHeight || 0, boxH);
    atEnd.current = top + el.clientHeight >= el.scrollHeight - 2;
    setView(prev => (prev.top === top && prev.h === h ? prev : { top, h }));
  }, [boxH]);
  const onScroll = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(measure); }, [measure]);

  const isEmpty = count === 0 && !!empty;

  useLayoutEffect(() => {
    const el = ref.current, frame = frameRef.current;
    const before = drawn.current;
    const keys = keysNow.current;
    const grew = total > lastTotal.current;
    lastTotal.current = total;
    const stickTo = el && stickToEnd && grew && atEnd.current ? Math.max(0, total - natural) : null;
    const emptyEl = frame ? frame.querySelector<HTMLElement>(':scope > .k-vl-empty') : null;
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => { const at = timers.current.indexOf(id); if (at >= 0) timers.current.splice(at, 1); fn(); }, ms);
      timers.current.push(id);
    };
    if (frame && before && !reducedMotion()) {
      const now = performance.now();
      const leaving = ghosts.current.filter(g => !g.started);
      for (const g of leaving) {
        g.started = true;
        g.fadeEnds = now + FOLD_FADE_MS;
        const gel = frame.querySelector<HTMLElement>(`[data-vl-ghost="${g.id}"]`);
        gel?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FOLD_FADE_MS, easing: EASE, fill: 'forwards' });
        later(() => {
          ghosts.current = ghosts.current.filter(x => x !== g);
          setTick(t => t + 1);
        }, FOLD_FADE_MS + FOLD_MS);
      }
      let fadesEnd = now;
      for (const g of ghosts.current) if (g.started) fadesEnd = Math.max(fadesEnd, g.fadeEnds);
      const delayMove = Math.max(0, fadesEnd - now);
      let moved = false;
      if (before.empty !== isEmpty) {
        const from = takeOver(frame, 'height') ?? before.frameH;
        const to = isEmpty ? (emptyEl ? emptyEl.offsetHeight : 0) : natural;
        if (Math.abs(from - to) > 0.5) {
          frame.animate([{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }],
            { duration: FOLD_MS, delay: delayMove, easing: EASE, fill: 'backwards' });
          moved = true;
        }
      }
      const entering: HTMLElement[] = [];
      if (!isEmpty && el) {
        let changed = before.keys.length !== keys.length || before.natural !== natural || el.scrollTop !== scrollAtRender.current;
        for (let i = 0; !changed && i < keys.length; i++) changed = before.keys[i] !== keys[i] || before.tops[i] !== tops[i];
        if (changed) {
          const was = new Map<string, number>();
          for (let i = 0; i < before.keys.length; i++) was.set(before.keys[i], i);
          const scrollNow = el.scrollTop;
          const rowsEls = el.querySelectorAll<HTMLElement>(':scope > .k-vl-row');
          for (let r = 0; r < rowsEls.length; r++) {
            const row = rowsEls[r];
            const k = row.dataset.vlKey ?? '';
            const i = Number(row.dataset.vlIndex);
            if (fresh.current.has(k)) { entering.push(row); continue; }
            const pi = was.get(k);
            if (pi === undefined) continue;
            const dy = (before.tops[pi] - scrollAtRender.current) - (tops[i] - scrollNow) + (takeOver(row, 'top') ?? 0);
            if (Math.abs(dy) < 0.5) continue;
            row.animate([{ top: `${dy}px` }, { top: '0px' }], { duration: FOLD_MS, delay: delayMove, easing: EASE, fill: 'backwards' });
            moved = true;
          }
          if (!before.empty && before.natural !== natural) {
            const from = takeOver(el, 'height') ?? before.natural;
            el.animate([
              { height: `${from}px`, maxHeight: 'none', overflowY: 'hidden' },
              { height: `${natural}px`, maxHeight: 'none', overflowY: 'hidden' },
            ], { duration: FOLD_MS, delay: delayMove, easing: EASE, fill: 'backwards' });
            moved = true;
          }
        }
      }
      if (stickTo !== null && el && stickTo > el.scrollTop + 0.5) {
        const target = stickTo;
        if (delayMove > 0) later(() => glideScroll(el, target), delayMove);
        else glideScroll(el, target);
        moved = true;
      }
      if (el && unbuilt.current.size > 0) {
        const rowsEls = el.querySelectorAll<HTMLElement>(':scope > .k-vl-row');
        for (let r = 0; r < rowsEls.length; r++) {
          const k = rowsEls[r].dataset.vlKey ?? '';
          if (unbuilt.current.has(k)) { unbuilt.current.delete(k); if (!entering.includes(rowsEls[r])) entering.push(rowsEls[r]); }
        }
      }
      const delayIn = delayMove + (moved ? FOLD_MS : 0);
      for (const row of entering) row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FOLD_FADE_MS, delay: delayIn, easing: EASE, fill: 'backwards' });
      if (isEmpty && !before.empty && emptyEl) emptyEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FOLD_FADE_MS, delay: delayIn, easing: EASE, fill: 'backwards' });
    } else if (stickTo !== null && el) {
      el.scrollTop = stickTo;
    }
    const firstRow = el ? el.querySelector<HTMLElement>(':scope > .k-vl-row') : null;
    drawn.current = {
      empty: isEmpty, keys, tops, natural,
      frameH: isEmpty ? (emptyEl ? emptyEl.offsetHeight : 0) : natural,
      frameW: frame ? frame.clientWidth : 0,
      rowW: firstRow ? firstRow.offsetWidth : (frame ? frame.clientWidth : 0),
      shown: building.current,
    };
    if (fresh.current.size > 0) {
      const t = performance.now();
      fresh.current.forEach(k => { if (!building.current.has(k)) unbuilt.current.set(k, t); });
    }
    if (unbuilt.current.size > 0) {
      const t = performance.now();
      unbuilt.current.forEach((at, k) => { if (t - at > FRESH_KEEP_MS || !seen.current?.has(k)) unbuilt.current.delete(k); });
    }
    if (el && revealNew && fresh.current.size > 0) {
      for (let i = 0; i < count; i++) {
        if (!fresh.current.has(keys[i])) continue;
        scrollVirtualRowIntoView(el, tops[i], tops[i + 1] - tops[i]);
        break;
      }
    }
    measure();
  });
  useLayoutEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    for (const t of timers.current) window.clearTimeout(t);
    if (ref.current) stopScrollGlide(ref.current);
  }, []);

  const keys: string[] = new Array(count);
  const first = seen.current === null;
  const nowSeen = new Set<string>();
  fresh.current = new Set();
  for (let i = 0; i < count; i++) {
    const k = rowKey(i);
    keys[i] = k;
    nowSeen.add(k);
    if (!first && !seen.current!.has(k)) fresh.current.add(k);
  }
  seen.current = nowSeen;
  keysNow.current = keys;
  const scrollNow = ref.current ? ref.current.scrollTop : 0;
  scrollAtRender.current = scrollNow;
  const prev = drawn.current;
  if (prev && !reducedMotion()) {
    prev.shown.forEach((d, k) => {
      if (!nowSeen.has(k) && !ghosts.current.some(g => g.key === k)) {
        ghosts.current.push({ id: ++ghostSeq, key: k, node: d.node, top: d.top - scrollNow, h: d.h, w: prev.rowW, started: false, fadeEnds: 0 });
      }
    });
    if (prev.empty && !isEmpty && lastEmpty.current && !ghosts.current.some(g => g.key === EMPTY_GHOST)) {
      ghosts.current.push({ id: ++ghostSeq, key: EMPTY_GHOST, node: lastEmpty.current, top: 0, h: prev.frameH, w: prev.frameW, started: false, fadeEnds: 0 });
    }
  }
  building.current = new Map();

  let content: React.ReactNode;
  if (isEmpty) {
    lastEmpty.current = empty;
    content = <div className="k-vl-empty">{empty}</div>;
  } else {
    const vTop = Math.min(view.top, Math.max(0, total - natural));
    const a = Math.max(0, rowAt(tops, count, vTop - overscan));
    const b = Math.min(count, rowAt(tops, count, vTop + view.h + overscan) + 1);
    const rows: React.ReactNode[] = [];
    for (let i = a; i < b; i++) {
      const k = keys[i];
      const node = renderRow(i);
      const h = tops[i + 1] - tops[i];
      building.current.set(k, { node, top: tops[i], h });
      rows.push(<div key={k} data-vl-index={i} data-vl-key={k} className="k-vl-row" style={{ height: h }}>{node}</div>);
    }
    const fixedH = typeof rowHeight === 'number' ? rowHeight : 40;
    const vars = { ['--vl-row' as string]: `${fixedH}px` } as React.CSSProperties;
    content = (
      <div {...boxProps} ref={(el) => { ref.current = el; if (boxRef) boxRef.current = el; }} onScroll={onScroll}
        className={className ? ['k-vl custom-scrollbar', className].join(' ') : 'k-vl custom-scrollbar'}
        style={{ ...vars, maxHeight: boxH + 2, ...(boxProps?.style ?? {}) }}>
        <div className="k-vl-skel" style={{ height: tops[a] }} aria-hidden="true" />
        {rows}
        <div className="k-vl-skel" style={{ height: total - tops[b] }} aria-hidden="true" />
      </div>
    );
  }
  return (
    <div ref={frameRef} className="k-vl-frame">
      {content}
      {ghosts.current.length > 0 && (
        <div className="k-vl-ghosts" aria-hidden="true">
          {ghosts.current.map(g => (
            <div key={'ghost:' + g.id} data-vl-ghost={g.id} className="k-vl-ghost" style={{ top: g.top, height: g.h, width: g.w }}>{g.node}</div>
          ))}
        </div>
      )}
    </div>
  );
};
