import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSwapStage, useGlideSize, FoldMemoryContext } from './motion';
import { glide, flowChange, motionOff, scrollGlide, noteMotion, leaveStarts, onScrollGlideStart, scrollGlideRuns } from './presence';
import { usePanelsVersion } from './panelMemory';

export const FOLD_MS = 140;
export const FOLD_FADE_MS = 105;

type Phase = 'open' | 'closed' | 'grow' | 'fadeIn' | 'fadeOut' | 'shrink';

let lastFadeOutAt = -1e9;

const reducedMotion = motionOff;

const CENTRE_SLACK = 0.1;
export function bringIntoView(top: HTMLElement, bottom: HTMLElement = top): void {
  const MARGIN = 12;
  let t = Math.min(top.getBoundingClientRect().top, bottom.getBoundingClientRect().top);
  let b = bottom.getBoundingClientRect().bottom;
  if (!(b > t)) return;
  for (let sc = bottom.parentElement; sc && sc !== document.body && sc !== document.documentElement; sc = sc.parentElement) {
    if (!/(auto|scroll)/.test(getComputedStyle(sc).overflowY) || sc.scrollHeight <= sc.clientHeight + 1) continue;
    const v = sc.getBoundingClientRect();
    const k = sc.offsetHeight > 0 ? v.height / sc.offsetHeight : 1;
    const m = MARGIN * k;
    let by = 0;
    const room = v.height - 2 * m;
    if (b - t >= room) by = t - (v.top + m);
    else {
      by = (t + b) / 2 - (v.top + v.height / 2);
      if (t >= v.top + m && b <= v.bottom - m && Math.abs(by) < v.height * CENTRE_SLACK) by = 0;
    }
    by = Math.max(-sc.scrollTop * k, Math.min((sc.scrollHeight - sc.clientHeight - sc.scrollTop) * k, by));
    if (Math.abs(by) > 0.5) scrollGlide(sc, sc.scrollTop + by / k);
    t = Math.max(t - by, v.top); b = Math.min(b - by, v.bottom);
    if (!(b > t)) return;
  }
}

export interface FoldHandle {
  readonly el: HTMLElement | null;
  isOpen(): boolean;
  open(): void;
}

export function useFoldHandle(handle: React.MutableRefObject<FoldHandle | null> | undefined, el: React.RefObject<HTMLElement | null>, isOpen: boolean, open: () => void): void {
  const live = useRef({ isOpen, open });
  live.current = { isOpen, open };
  useLayoutEffect(() => {
    if (!handle) return;
    const h: FoldHandle = {
      get el() { return el.current; },
      isOpen: () => live.current.isOpen,
      open: () => { if (!live.current.isOpen) live.current.open(); },
    };
    handle.current = h;
    return () => { if (handle.current === h) handle.current = null; };
  }, [handle, el]);
}

function scrollRest(el: HTMLElement, limitMs = 1000): Promise<void> {
  const boxes: HTMLElement[] = [];
  for (let sc = el.parentElement; sc && sc !== document.body && sc !== document.documentElement; sc = sc.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) boxes.push(sc);
  }
  return new Promise(resolve => {
    const t0 = performance.now();
    let last = boxes.map(b => b.scrollTop).join(',');
    let still = 0;
    const step = () => {
      const now = boxes.map(b => b.scrollTop).join(',');
      still = now === last ? still + 1 : 0;
      last = now;
      if (still >= 3 || performance.now() - t0 > limitMs) { resolve(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export async function revealFold(h: FoldHandle): Promise<void> {
  const el = h.el;
  if (!el || !el.isConnected) return;
  bringIntoView(el);
  await scrollRest(el);
  if (h.isOpen()) return;
  h.open();
  await new Promise(r => window.setTimeout(r, FOLD_MS + 20));
  const now = h.el;
  if (now && now.isConnected) bringIntoView(now);
}

let _pressAt = -1e9;
let _pressTarget: Element | null = null;
if (typeof window !== 'undefined') {
  const note = (e: Event) => { _pressAt = performance.now(); _pressTarget = e.target instanceof Element ? e.target : null; };
  window.addEventListener('pointerdown', note, true);
  window.addEventListener('keydown', note, true);
}
function openedByHim(fold: HTMLElement, prev: Element | null): boolean {
  const t = _pressTarget;
  if (!t || !t.isConnected || performance.now() - _pressAt > 1500) return false;
  if (prev && prev !== fold && prev.contains(t)) return true;
  const card = fold.parentElement?.closest('.k-group');
  return !!card && card.contains(t);
}

export const Collapse: React.FC<{
  open: boolean; children: React.ReactNode; className?: string;
  onBusyChange?: (busy: boolean) => void;
  gapInside?: boolean;
  gapPx?: number;
  reveal?: 'parent' | 'prev' | 'self' | 'none';
  onClosed?: () => void;
  ownAct?: boolean;
  dataKey?: string;
}> = ({ open, children, className, onBusyChange, gapInside, gapPx, reveal = 'parent', onClosed, ownAct, dataKey }) => {
  const [mounted, setMounted] = useState(open);
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const phase = useRef<Phase>(open ? 'open' : 'closed');
  const timer = useRef(0);
  const first = useRef(true);
  const pendingGrow = useRef(false);
  const gapDone = useRef(false);
  const busyCb = useRef(onBusyChange); busyCb.current = onBusyChange;
  const closedCb = useRef(onClosed); closedCb.current = onClosed;
  const revealRef = useRef(reveal); revealRef.current = reveal;
  const ownActRef = useRef(ownAct); ownActRef.current = ownAct;
  const busyNow = useRef(false);
  const setBusy = (b: boolean) => { if (busyNow.current !== b) { busyNow.current = b; busyCb.current?.(b); } };
  const kept = useRef(children);
  if (open) kept.current = children;

  const applyGap = () => {
    if (!gapInside || gapDone.current) return;
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    gapDone.current = true;
    const m = parseFloat(getComputedStyle(o).marginTop) || 0;
    if (m <= 0) return;
    o.style.marginTop = '0px';
    if ((parseFloat(getComputedStyle(o).marginTop) || 0) > 0) { o.style.marginTop = ''; return; }
    i.style.paddingTop = `${m}px`;
  };

  const settle = (p: 'open' | 'closed') => {
    phase.current = p;
    setBusy(false);
    const o = outer.current, i = inner.current;
    if (o) { o.style.height = ''; o.style.overflow = ''; o.classList.remove('k-fold-moving'); if (p === 'open') o.inert = false; }
    if (i) i.style.opacity = '';
    if (p === 'closed') { gapDone.current = false; setMounted(false); closedCb.current?.(); }
  };

  const grow = () => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    applyGap();
    window.clearTimeout(timer.current);
    const fresh = phase.current !== 'fadeOut' && phase.current !== 'shrink';
    noteMotion(FOLD_MS + FOLD_FADE_MS);
    phase.current = 'grow';
    o.inert = false;
    setBusy(true);
    const from = o.style.height ? o.offsetHeight : 0;
    if (fresh) { i.style.transition = 'none'; i.style.opacity = '0'; void i.offsetWidth; i.style.transition = ''; }
    else i.style.opacity = '0';
    o.style.overflow = 'hidden';
    o.classList.add('k-fold-moving');
    o.style.height = `${from}px`;
    void o.offsetHeight;
    o.style.height = `${i.offsetHeight}px`;
    timer.current = window.setTimeout(() => {
      phase.current = 'fadeIn';
      o.style.height = '';
      o.style.overflow = '';
      o.classList.remove('k-fold-moving');
      i.style.opacity = '1';
      const rv = revealRef.current;
      if (rv !== 'none') {
        const par = o.parentElement ?? o;
        let prev: Element | null = o.previousElementSibling;
        while (prev && prev.getClientRects().length === 0) prev = prev.previousElementSibling;
        if (!(prev instanceof HTMLElement)) prev = o;
        if (ownActRef.current || openedByHim(o, rv === 'parent' ? par : prev)) bringIntoView(rv === 'parent' ? par : rv === 'prev' ? (prev as HTMLElement) : o, rv === 'parent' ? par : o);
      }
      timer.current = window.setTimeout(() => settle('open'), FOLD_FADE_MS);
    }, FOLD_MS);
  };

  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    window.clearTimeout(timer.current);
    if (reducedMotion()) {
      if (open) { setMounted(true); settle('open'); } else settle('closed');
      return;
    }
    if (open) {
      if (phase.current === 'open' || phase.current === 'grow' || phase.current === 'fadeIn') return;
      if (outer.current) grow();
      else { pendingGrow.current = true; setMounted(true); }
      return;
    }
    if (phase.current === 'closed' || phase.current === 'shrink' || phase.current === 'fadeOut') return;
    const o = outer.current, i = inner.current;
    if (!o || !i) { pendingGrow.current = false; settle('closed'); return; }
    noteMotion(FOLD_FADE_MS + FOLD_MS);
    phase.current = 'fadeOut';
    lastFadeOutAt = performance.now();
    setBusy(true);
    o.style.height = `${o.offsetHeight}px`;
    o.style.overflow = 'hidden';
    o.classList.add('k-fold-moving');
    o.inert = true;
    leaveStarts(o);
    i.style.opacity = '0';
    timer.current = window.setTimeout(() => {
      phase.current = 'shrink';
      void o.offsetHeight;
      o.style.height = '0px';
      timer.current = window.setTimeout(() => settle('closed'), FOLD_MS);
    }, FOLD_FADE_MS);
  }, [open]);

  useLayoutEffect(() => {
    if (mounted) applyGap();
    if (mounted && pendingGrow.current) {
      pendingGrow.current = false;
      const wait = FOLD_FADE_MS - (performance.now() - lastFadeOutAt);
      const o = outer.current, i = inner.current;
      if (wait > 8 && o && i) {
        noteMotion(wait + FOLD_MS + FOLD_FADE_MS);
        phase.current = 'grow';
        setBusy(true);
        i.style.transition = 'none'; i.style.opacity = '0'; void i.offsetWidth; i.style.transition = '';
        o.style.overflow = 'hidden';
        o.style.height = '0px';
        timer.current = window.setTimeout(() => { phase.current = 'closed'; grow(); }, wait);
      } else grow();
    }
  }, [mounted]);

  useEffect(() => () => { window.clearTimeout(timer.current); if (busyNow.current) busyCb.current?.(false); }, []);

  if (!mounted) return null;
  return (
    <div ref={outer} data-ll={dataKey} className={className ? `k-fold ${className}` : 'k-fold'}>
      <div ref={inner} className="k-fold-in" style={gapPx ? { paddingTop: gapPx } : undefined}>{open ? children : kept.current}</div>
    </div>
  );
};

export const Reveal: React.FC<{ when: unknown; children: React.ReactNode | (() => React.ReactNode); className?: string }> = ({ when, children, className }) => (
  <Collapse open={!!when} gapInside reveal="prev" className={className}>
    {typeof children === 'function' ? (when ? (children as () => React.ReactNode)() : null) : children}
  </Collapse>
);

export interface ListEntry { key: string; el: React.ReactNode; leaving: boolean; opened: boolean; reveal: boolean }
export const EMPTY_KEY = '\u0000empty';

export function mergeEntries(prev: readonly ListEntry[], next: readonly { key: string; el: React.ReactNode }[]): ListEntry[] {
  const nextKeys = new Set(next.map(n => n.key));
  const at = new Map(prev.map((p, i) => [p.key, i]));
  const out: ListEntry[] = [];
  let pi = 0;
  const flushTo = (end: number) => {
    for (; pi < end; pi++) { const q = prev[pi]; if (!nextKeys.has(q.key)) out.push(q.leaving ? q : { ...q, leaving: true }); }
  };
  for (const n of next) {
    const i = at.get(n.key);
    if (i === undefined) { out.push({ key: n.key, el: n.el, leaving: false, opened: false, reveal: false }); continue; }
    flushTo(i);
    if (pi <= i) pi = i + 1;
    const p = prev[i];
    out.push({ key: n.key, el: n.el, leaving: false, opened: p.opened, reveal: p.reveal });
  }
  flushTo(prev.length);
  return out;
}

export const MotionList: React.FC<{
  gap?: number;
  empty?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}> = ({ gap = 0, empty, className, children }) => {
  const [, bump] = useState(0);
  const list = useRef<ListEntry[] | null>(null);
  const next: { key: string; el: React.ReactNode }[] = [];
  let auto = 0;
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return;
    next.push({ key: c.key != null ? String(c.key) : `\u0000i${auto++}`, el: c });
  });
  if (next.length === 0 && empty != null) next.push({ key: EMPTY_KEY, el: empty });
  const merged = list.current
    ? mergeEntries(list.current, next)
    : next.map(n => ({ key: n.key, el: n.el, leaving: false, opened: true, reveal: false }));
  list.current = merged;

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

  return (
    <div className={className} style={{ display: 'flow-root' }}>
      <div style={gap ? { marginTop: -gap } : undefined}>
        {merged.map(e => (
          <Collapse key={e.key} open={e.opened && !e.leaving} gapPx={gap} reveal={e.reveal ? 'self' : 'none'} onClosed={() => drop(e.key)}>
            {e.el}
          </Collapse>
        ))}
      </div>
    </div>
  );
};

function holdScrollThrough(el: HTMLElement | null, ms: number): void {
  let sc: HTMLElement | null = el?.parentElement ?? null;
  while (sc && sc !== document.body && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  if (!sc || sc === document.body || scrollGlideRuns(sc)) return;
  const box = sc, top = box.scrollTop, until = performance.now() + ms;
  let his = false;
  const mine = () => { his = true; };
  box.addEventListener('wheel', mine, { passive: true, once: true });
  box.addEventListener('pointerdown', mine, { once: true });
  box.addEventListener('keydown', mine, { once: true });
  const offGlide = onScrollGlideStart(g => { if (g === box) his = true; });
  const tick = () => {
    if (his || performance.now() > until) {
      box.removeEventListener('wheel', mine); box.removeEventListener('pointerdown', mine); box.removeEventListener('keydown', mine);
      offGlide();
      return;
    }
    if (Math.abs(box.scrollTop - top) > 0.5 && box.scrollHeight - box.clientHeight >= top) box.scrollTop = top;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const SwapStage: React.FC<{ swapKey: unknown; className?: string; children?: React.ReactNode; hold?: boolean }> = ({ swapKey, className, children, hold = true }) => {
  const box = useRef<HTMLDivElement>(null);
  const stage = useSwapStage(swapKey, { glide: true, box });
  const captureSize = useGlideSize(box, stage.shown, true, true);
  const lastKey = useRef(swapKey);
  useLayoutEffect(() => {
    if (Object.is(lastKey.current, swapKey)) return;
    lastKey.current = swapKey;
    lastFadeOutAt = performance.now();
    captureSize();
    if (hold) holdScrollThrough(box.current, 900);
  }, [swapKey]);
  const kept = useRef(children);
  const live = Object.is(stage.shown, swapKey);
  if (live) kept.current = children;
  return <div ref={box} inert={stage.inert} className={[className, stage.swapClass].filter(Boolean).join(' ') || undefined}>{live ? children : kept.current}</div>;
};

export const SwapBox: React.FC<{ swapKey: unknown; className?: string; children?: React.ReactNode }> = ({ swapKey, className, children }) => (
  <Collapse open={React.Children.toArray(children).length > 0} gapInside reveal="none">
    <SwapStage swapKey={swapKey} className={className}>{children}</SwapStage>
  </Collapse>
);

export const SwapInPlace = SwapStage;

export const SwapText: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const key = typeof children === 'string' || typeof children === 'number' ? children : textKey(children);
  return <SwapStage swapKey={key} hold={false} className={className ? `k-swap-text ${className}` : 'k-swap-text'}>{children}</SwapStage>;
};
function textKey(n: React.ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textKey).join('\u0001');
  if (React.isValidElement(n)) return '<' + (typeof n.type === 'string' ? n.type : 'c') + '>' + textKey((n.props as { children?: React.ReactNode }).children);
  return '';
}

export const Fade: React.FC<{ when: unknown; children: React.ReactNode | (() => React.ReactNode); className?: string; title?: string;
  keep?: boolean;
  delay?: number }> = ({ when, children, className, title, keep, delay = 0 }) => {
  const on = !!when;
  const ref = useRef<HTMLSpanElement>(null);
  const [mountedRaw, setMounted] = useState(on);
  const mounted = keep || mountedRaw;
  const first = useRef(true);
  const kept = useRef<React.ReactNode>(null);
  if (on || (keep && kept.current === null)) kept.current = typeof children === 'function' ? (children as () => React.ReactNode)() : children;
  const inDelay = () => Math.max(delay, FOLD_FADE_MS - (performance.now() - lastFadeOutAt));
  useLayoutEffect(() => {
    const el = ref.current;
    if (first.current) { first.current = false; if (el && !on) el.style.opacity = '0'; return; }
    if (on) { if (!mounted) setMounted(true); else if (el) glide(el, 'opacity', '1', FOLD_FADE_MS, { delay: inDelay() }); return; }
    if (!el) { setMounted(false); return; }
    leaveStarts(el);
    lastFadeOutAt = performance.now();
    glide(el, 'opacity', '0', FOLD_FADE_MS, { done: () => { if (!keep) setMounted(false); } });
  }, [on]);
  const wasMounted = useRef(mounted);
  useLayoutEffect(() => {
    if (mounted && !wasMounted.current && ref.current) glide(ref.current, 'opacity', '1', FOLD_FADE_MS, { from: '0', delay: inDelay() });
    wasMounted.current = mounted;
  }, [mounted]);
  if (!mounted) return null;
  return <span ref={ref} className={className} title={title} inert={!on || undefined} aria-hidden={!on || undefined}>{kept.current}</span>;
};

interface RowEntry { key: string; el: React.ReactElement; leaving: boolean }
const MotionRowItem: React.FC<{ grow?: boolean; className?: string; children: React.ReactNode }> = ({ children }) => <>{children}</>;
const MotionRowBase: React.FC<{ className?: string; style?: React.CSSProperties; children?: React.ReactNode;
  glideWidth?: boolean }> = ({ className, style, children, glideWidth }) => {
  const box = useRef<HTMLDivElement>(null);
  const [, bump] = useState(0);
  const list = useRef<RowEntry[] | null>(null);
  const fadeEnds = useRef(0);
  const timer = useRef(0);
  const committed = useRef(false);
  const next: { key: string; el: React.ReactElement }[] = [];
  React.Children.forEach(children, c => { if (React.isValidElement(c)) next.push({ key: String(c.key ?? next.length), el: c }); });
  const first = !committed.current;
  if (first) list.current = next.map(n => ({ ...n, leaving: false }));
  else {
    const prev = list.current!;
    const nextKeys = new Set(next.map(n => n.key));
    const prevAt = new Map<string, number>(prev.map((p, i) => [p.key, i] as [string, number]));
    const out: RowEntry[] = [];
    let pi = 0;
    const flushTo = (end: number) => { for (; pi < end; pi++) { const q = prev[pi]; if (!nextKeys.has(q.key)) out.push(q.leaving ? q : { ...q, leaving: true }); } };
    for (const n of next) {
      const i = prevAt.get(n.key);
      if (i !== undefined) { flushTo(i); if (pi <= i) pi = i + 1; }
      out.push({ key: n.key, el: n.el, leaving: false });
    }
    flushTo(prev.length);
    list.current = out;
  }
  useLayoutEffect(() => {
    const row = box.current;
    if (first) { committed.current = true; return; }
    if (!row) return;
    const els = new Map<string, HTMLElement>();
    row.querySelectorAll<HTMLElement>(':scope > [data-krow]').forEach(e => els.set(e.dataset.krow!, e));
    const now = performance.now();
    let work = false;
    for (const e of list.current!) {
      const el = els.get(e.key);
      if (!el) continue;
      if (e.leaving && el.dataset.on === '1') {
        el.dataset.on = 'f'; el.inert = true;
        leaveStarts(el);
        glide(el, 'opacity', '0', FOLD_FADE_MS);
        fadeEnds.current = Math.max(fadeEnds.current, now + FOLD_FADE_MS);
      } else if (!e.leaving && el.dataset.on === 'f') {
        el.dataset.on = '1'; el.inert = false;
        glide(el, 'opacity', '1', FOLD_FADE_MS);
      }
      if ((e.leaving && el.dataset.on === 'f') || (!e.leaving && el.dataset.on === 'new')) work = true;
    }
    if (!work) return;
    window.clearTimeout(timer.current);
    const reflow = () => {
      const opening: HTMLElement[] = [];
      let dropped = false;
      const moved = flowChange(row, () => {
        for (const e of list.current!) {
          const el = els.get(e.key);
          if (!el || !el.isConnected) continue;
          if (e.leaving && el.dataset.on === 'f') { el.dataset.on = '0'; el.style.display = 'none'; dropped = true; }
          else if (!e.leaving && el.dataset.on === 'new') { el.dataset.on = '1'; el.style.display = ''; el.style.opacity = '0'; opening.push(el); }
        }
      }, FOLD_MS, glideWidth);
      for (const el of opening) glide(el, 'opacity', '1', FOLD_FADE_MS, { from: '0', delay: moved ? FOLD_MS : 0 });
      if (dropped) { list.current = list.current!.filter(e => !(e.leaving && els.get(e.key)?.dataset.on === '0')); bump(n => n + 1); }
    };
    const wait = fadeEnds.current - now;
    if (wait > 4) timer.current = window.setTimeout(reflow, wait); else reflow();
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div ref={box} className={className} style={style}>
      {list.current!.map(e => {
        const p = e.el.props as { grow?: boolean; className?: string; children?: React.ReactNode };
        return (
          <div key={e.key} data-krow={e.key} className={[p.grow ? 'flex flex-1 min-w-0' : 'flex shrink-0', p.className].filter(Boolean).join(' ')}
            ref={el => { if (el && el.dataset.on === undefined) { if (first) el.dataset.on = '1'; else { el.dataset.on = 'new'; el.style.display = 'none'; } } }}>
            {p.children}
          </div>
        );
      })}
    </div>
  );
};
export const MotionRow = Object.assign(MotionRowBase, { Item: MotionRowItem });

const PAGE_TRAIL_MAX = 24;
export const PageSwap: React.FC<{ children: React.ReactElement | null }> = ({ children }) => {
  const key = children ? children.key : null;
  const stage = useSwapStage<React.Key | null>(key);
  const kept = useRef<React.ReactElement | null>(children);
  const box = useRef<HTMLDivElement>(null);
  const trail = useRef<{ key: React.Key | null; top: number }[]>([]);
  const leaving = useRef<{ key: React.Key | null; top: number } | null>(null);
  const memories = useRef(new Map<React.Key | null, Map<string, boolean>>());
  const memFor = useRef<React.Key | null | undefined>(undefined);
  const prevShown = useRef<React.Key | null>(stage.shown);
  const pver = usePanelsVersion();
  const memVer = useRef(pver);
  if (memVer.current !== pver) {
    memVer.current = pver;
    memories.current.forEach(m => m.clear());
    trail.current = [];
  }
  const viewport = (): HTMLElement | null => {
    const root = box.current?.firstElementChild;
    if (!root) return null;
    for (let c = root.lastElementChild; c; c = c.previousElementSibling) {
      const oy = getComputedStyle(c).overflowY;
      if (oy === 'auto' || oy === 'scroll') return c as HTMLElement;
    }
    return null;
  };
  useLayoutEffect(() => {
    if (Object.is(key, stage.shown)) return;
    if (!leaving.current || !Object.is(leaving.current.key, stage.shown)) leaving.current = { key: stage.shown, top: viewport()?.scrollTop ?? 0 };
  }, [key]);
  useLayoutEffect(() => {
    if (Object.is(prevShown.current, stage.shown)) return;
    prevShown.current = stage.shown;
    const t = trail.current;
    let i = -1;
    for (let j = t.length - 1; j >= 0; j--) if (Object.is(t[j].key, stage.shown)) { i = j; break; }
    const vp = viewport();
    if (i >= 0) {
      if (vp) vp.scrollTop = t[i].top;
      t.length = i;
    } else {
      if (leaving.current) { t.push(leaving.current); if (t.length > PAGE_TRAIL_MAX) t.shift(); }
      if (vp) vp.scrollTop = 0;
    }
    leaving.current = null;
  }, [stage.shown]);
  const live = Object.is(stage.shown, key);
  if (live) kept.current = children;
  const page = live ? children : kept.current;
  if (!page) return null;
  if (!Object.is(memFor.current, page.key)) {
    memFor.current = page.key;
    const back = trail.current.some(e => Object.is(e.key, page.key));
    if (!back || !memories.current.has(page.key)) memories.current.set(page.key, new Map());
    for (const k of memories.current.keys()) {
      if (Object.is(k, page.key) || (leaving.current && Object.is(leaving.current.key, k))) continue;
      if (!trail.current.some(e => Object.is(e.key, k))) memories.current.delete(k);
    }
  }
  const mem = memories.current.get(page.key)!;
  const props = page.props as { className?: string };
  const shownPage = stage.swapClass
    ? React.cloneElement(page as React.ReactElement<{ className?: string }>, { className: [props.className, stage.swapClass].filter(Boolean).join(' ') })
    : page;
  return <div ref={box} inert={stage.inert} style={{ display: 'contents' }}><FoldMemoryContext.Provider value={mem}>{shownPage}</FoldMemoryContext.Provider></div>;
};

export function usePanelSwap<K>(key: K): { hiddenOf: (k: K) => boolean; classOf: (k: K) => string; inertOf: (k: K) => boolean } {
  const stage = useSwapStage<K>(key);
  return {
    hiddenOf: (k: K) => !Object.is(stage.shown, k),
    classOf: (k: K) => (Object.is(stage.shown, k) ? stage.swapClass : ''),
    inertOf: (k: K) => Object.is(stage.shown, k) && stage.inert,
  };
}
