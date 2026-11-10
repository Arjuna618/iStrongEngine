import { createContext, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { whenFoldsSettle, glide as glideProp, takeOver, isMoving, motionOff, noteMotion } from './presence';

export const MENU_OUT_MS = 120;

export interface MenuStage<K extends string> {
  shown: K | null;
  leaving: boolean;
  fresh: boolean;
  next: K | null;
}

export function useMenuStage<K extends string>(key: K | null): MenuStage<K> {
  const [shown, setShown] = useState<K | null>(key);
  const [leaving, setLeaving] = useState(false);
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    if (key === shown) { setLeaving(false); return; }
    if (shown === null) { setShown(key); setFresh(true); setLeaving(false); return; }
    setLeaving(true);
    const id = window.setTimeout(() => { setShown(key); setFresh(false); setLeaving(false); }, MENU_OUT_MS);
    return () => window.clearTimeout(id);
  }, [key]);
  return { shown, leaving, fresh, next: key };
}

export const FoldMemoryContext = createContext<Map<string, boolean> | null>(null);

export const SWAP_OUT_MS = 100;
export const SWAP_IN_MS = 140;
const reducedMotion = motionOff;
export type SwapPhase = 'idle' | 'out' | 'hold' | 'in';
const swapClassOf = (p: SwapPhase) => (p === 'out' || p === 'hold' ? 'k-swap-out' : p === 'in' ? 'k-swap-in' : '');

export const GLIDE_MS = 160;

export function useSwapStage<K>(key: K, opts?: { glide?: boolean; box?: { readonly current: HTMLElement | null } }): { shown: K; swapClass: string; busy: boolean; phase: SwapPhase; inert: boolean } {
  const glide = !!opts?.glide;
  const boxOpt = opts?.box;
  const [shown, setShown] = useState<K>(key);
  const [phase, setPhase] = useState<SwapPhase>('idle');
  const shownRef = useRef<K>(key), latest = useRef<K>(key), phaseRef = useRef<SwapPhase>('idle'), t = useRef(0);
  const cancelSettle = useRef<() => void>(() => {});
  latest.current = key;
  useLayoutEffect(() => {
    if (Object.is(key, shownRef.current) && phaseRef.current !== 'out') return;
    if (reducedMotion()) { shownRef.current = key; setShown(key); return; }
    if (phaseRef.current === 'out') return;
    noteMotion(SWAP_OUT_MS + (glide ? GLIDE_MS : 0) + SWAP_IN_MS);
    phaseRef.current = 'out'; setPhase('out');
    window.clearTimeout(t.current);
    const fadeIn = () => {
      phaseRef.current = 'in'; setPhase('in');
      t.current = window.setTimeout(() => { phaseRef.current = 'idle'; setPhase('idle'); }, SWAP_IN_MS);
    };
    t.current = window.setTimeout(() => {
      shownRef.current = latest.current; setShown(latest.current);
      if (glide) {
        phaseRef.current = 'hold'; setPhase('hold');
        t.current = window.setTimeout(() => { cancelSettle.current = whenFoldsSettle(boxOpt?.current ?? null, fadeIn); }, GLIDE_MS);
      } else fadeIn();
    }, SWAP_OUT_MS);
  }, [key]);
  useEffect(() => () => { window.clearTimeout(t.current); cancelSettle.current(); }, []);
  return { shown, swapClass: swapClassOf(phase), busy: phase !== 'idle', phase, inert: phase === 'out' || phase === 'hold' };
}

export function useGlideHeight(ref: { readonly current: HTMLElement | null }, key: unknown): void {
  useGlideSize(ref, key, false);
}

export function useGlideSize(ref: { readonly current: HTMLElement | null }, key: unknown, width = true,
  manual = false): () => void {
  const lastH = useRef<number | null>(null);
  const lastW = useRef<number | null>(null);
  const prevKey = useRef<unknown>(key);
  const observed = useRef<HTMLElement | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const capture = useCallback(() => {
    const b = ref.current;
    if (!b) return;
    if (!isMoving(b, 'height')) lastH.current = b.offsetHeight;
    if (!isMoving(b, 'width')) lastW.current = b.offsetWidth;
  }, [ref]);
  useLayoutEffect(() => {
    if (manual) return;
    const el = ref.current;
    if (el === observed.current) return;
    ro.current?.disconnect();
    observed.current = el;
    if (!el || typeof ResizeObserver === 'undefined') return;
    lastH.current = el.offsetHeight; lastW.current = el.offsetWidth;
    if (!ro.current) ro.current = new ResizeObserver(() => {
      const b = ref.current;
      if (!b) return;
      if (!isMoving(b, 'height')) lastH.current = b.offsetHeight;
      if (!isMoving(b, 'width')) lastW.current = b.offsetWidth;
    });
    ro.current.observe(el);
  });
  useEffect(() => () => { ro.current?.disconnect(); }, []);
  useLayoutEffect(() => {
    if (Object.is(prevKey.current, key)) return;
    prevKey.current = key;
    const el = ref.current;
    if (!el || motionOff()) return;
    const axes: ('height' | 'width')[] = width ? ['height', 'width'] : ['height'];
    const from: Record<string, number | null> = {};
    for (const ax of axes) {
      from[ax] = isMoving(el, ax) ? parseFloat(takeOver(el, ax)) : (ax === 'height' ? lastH.current : lastW.current);
      el.style[ax] = '';
    }
    const settle = () => {
      if (isMoving(el, 'height') || isMoving(el, 'width')) return;
      el.style.overflow = '';
      lastH.current = el.offsetHeight; lastW.current = el.offsetWidth;
    };
    for (const ax of axes) {
      const f = from[ax];
      const to = ax === 'height' ? el.offsetHeight : el.offsetWidth;
      if (f == null || !Number.isFinite(f) || Math.abs(to - f) < 1) continue;
      el.style.overflow = 'hidden';
      glideProp(el, ax, `${to}px`, GLIDE_MS, { from: `${f}px`, done: () => { el.style[ax] = ''; settle(); } });
    }
  });  return capture;
}

export function useSwapFade(opts?: { glide?: boolean }): { swapClass: string; run: (fn: () => void) => void; busy: boolean; phase: SwapPhase; inert: boolean } {
  const glide = !!opts?.glide;
  const [phase, setPhase] = useState<SwapPhase>('idle');
  const pending = useRef<(() => void) | null>(null), phaseRef = useRef<SwapPhase>('idle'), t = useRef(0);
  const run = useCallback((fn: () => void) => {
    if (reducedMotion()) { fn(); return; }
    pending.current = fn;
    if (phaseRef.current === 'out') return;
    noteMotion(SWAP_OUT_MS + (glide ? GLIDE_MS : 0) + SWAP_IN_MS);
    phaseRef.current = 'out'; setPhase('out');
    window.clearTimeout(t.current);
    const fadeIn = () => {
      phaseRef.current = 'in'; setPhase('in');
      t.current = window.setTimeout(() => { phaseRef.current = 'idle'; setPhase('idle'); }, SWAP_IN_MS);
    };
    t.current = window.setTimeout(() => {
      const f = pending.current; pending.current = null;
      if (f) f();
      if (glide) { phaseRef.current = 'hold'; setPhase('hold'); t.current = window.setTimeout(fadeIn, GLIDE_MS); } else fadeIn();
    }, SWAP_OUT_MS);
  }, [glide]);
  useEffect(() => () => window.clearTimeout(t.current), []);
  return { swapClass: swapClassOf(phase), run, busy: phase !== 'idle', phase, inert: phase === 'out' || phase === 'hold' };
}

export function blurFocusedField(inside?: HTMLElement | null): void {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement)) return;
  if (inside) { if (!inside.contains(a)) return; }
  else if (!(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a.isContentEditable)) return;
  a.blur();
}
const _noBox: { readonly current: HTMLElement | null } = { current: null };
export function useBlurOnUnmount(box: { readonly current: HTMLElement | null }): void {
  useLayoutEffect(() => () => {
    const el = box.current, a = document.activeElement;
    if (el && a instanceof HTMLElement && el.contains(a)) {
      a.blur();
      queueMicrotask(() => document.body.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    }
  }, [box]);
}

export function useClosing(onClose: () => void, box?: { readonly current: HTMLElement | null }): { closing: boolean; close: () => void } {
  const [closing, setClosing] = useState(false);
  const ref = useRef(false);
  const cb = useRef(onClose); cb.current = onClose;
  const boxRef = box ?? _noBox;
  useBlurOnUnmount(boxRef);
  const close = useCallback(() => {
    if (ref.current) return;
    ref.current = true;
    blurFocusedField(boxRef.current);
    setClosing(true);
    window.setTimeout(() => cb.current(), MENU_OUT_MS);
  }, [boxRef]);
  return { closing, close };
}

export function useClosingWith(): { closing: boolean; closeWith: (fn: () => void) => void } {
  const [closing, setClosing] = useState(false);
  const ref = useRef(false);
  const closeWith = useCallback((fn: () => void) => {
    if (ref.current) return;
    ref.current = true;
    blurFocusedField();
    setClosing(true);
    window.setTimeout(fn, MENU_OUT_MS);
  }, []);
  return { closing, closeWith };
}
