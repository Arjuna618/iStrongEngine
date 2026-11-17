import { createContext, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { whenFoldsSettle, glide as glideProp, takeOver, isMoving, motionOff, noteMotion } from './presence';
import { uiThemeId } from '../../utils/uiTheme';

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

let _veilSeq = 0;
interface Veil { el: HTMLDivElement; boxes: HTMLElement[]; ro: ResizeObserver | null; cls: string }
function inkAlpha(c: string): number {
  const s = c.trim();
  if (s === 'transparent') return 0;
  if (/^rgba?\(/.test(s)) { const parts = s.slice(s.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean); return parts.length > 3 ? parseFloat(parts[3]) : 1; }
  if (/^color\(/.test(s)) { const i = s.indexOf('/'); return i < 0 ? 1 : parseFloat(s.slice(i + 1)); }
  return NaN;
}
const INK_RX = /(rgba?|color)\([^)]*\)/g;
function clearImage(img: string): boolean {
  if (!img || img === 'none') return true;
  if (/url\(/.test(img)) return false;
  const inks: string[] = img.match(INK_RX) ?? [];
  if (inks.length === 0) return false;
  if (/(hsla?|lab|lch|oklab|oklch|hwb)\(/.test(img.replace(INK_RX, ''))) return false;
  return inks.every(c => inkAlpha(c) <= 0.01);
}
function veilColour(box: HTMLElement): string | null {
  for (let p = box.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (!clearImage(cs.backgroundImage)) return null;
    const a = inkAlpha(cs.backgroundColor);
    if (!Number.isFinite(a)) return null;
    if (a >= 0.99) return cs.backgroundColor;
    if (a > 0.01) return null;
  }
  return null;
}
function veilRect(box: HTMLElement): { l: number; t: number; w: number; h: number } | null {
  const r = box.getBoundingClientRect();
  let l = r.left, t = r.top, ri = r.right, b = r.bottom;
  for (let p = box.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const q = p.getBoundingClientRect();
    l = Math.max(l, q.left); t = Math.max(t, q.top); ri = Math.min(ri, q.right); b = Math.min(b, q.bottom);
  }
  return ri - l >= 1 && b - t >= 1 ? { l, t, w: ri - l, h: b - t } : null;
}
function veilZ(box: HTMLElement): number {
  let z = 0;
  for (let p: HTMLElement | null = box; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.position === 'static') continue;
    const n = parseInt(cs.zIndex, 10);
    if (Number.isFinite(n)) z = n;
  }
  return Math.max(0, z);
}
function placeVeil(v: Veil): void {
  const box = v.boxes[0];
  const r = box ? veilRect(box) : null;
  const s = v.el.style;
  if (!r) { s.display = 'none'; return; }
  s.display = ''; s.left = `${r.l}px`; s.top = `${r.t}px`; s.width = `${r.w}px`; s.height = `${r.h}px`;
}
function holdBoxes(v: Veil): void {
  const now = Array.prototype.slice.call(document.getElementsByClassName(v.cls)) as HTMLElement[];
  for (const b of now) {
    if (v.boxes.indexOf(b) >= 0) continue;
    b.style.setProperty('opacity', '1', 'important');
    b.style.setProperty('animation', 'none', 'important');
    b.style.setProperty('transition', 'none', 'important');
    if (v.ro) v.ro.observe(b);
  }
  v.boxes = now.concat(v.boxes.filter(b => now.indexOf(b) < 0 && b.isConnected));
}
function dropVeil(v: Veil): void {
  if (v.ro) v.ro.disconnect();
  for (const b of v.boxes) { b.style.removeProperty('opacity'); b.style.removeProperty('animation'); b.style.removeProperty('transition'); }
  v.el.remove();
}
export function useSwapVeil(phase: SwapPhase): string {
  const id = useRef('');
  if (!id.current) id.current = `k-swap-at-${++_veilSeq}`;
  const veil = useRef<Veil | null>(null);
  useLayoutEffect(() => {
    let v = veil.current;
    if (phase === 'idle') { if (v) dropVeil(v); veil.current = null; return; }
    if (!v) {
      if (phase !== 'out' || uiThemeId() !== 'classic' || motionOff()) return;
      const box = document.getElementsByClassName(id.current)[0] as HTMLElement | undefined;
      const colour = box ? veilColour(box) : null;
      if (!box || !colour || !veilRect(box)) return;
      const el = document.createElement('div');
      el.className = 'k-swap-veil';
      el.setAttribute('aria-hidden', 'true');
      const s = el.style;
      s.position = 'fixed'; s.pointerEvents = 'none'; s.background = colour; s.zIndex = String(veilZ(box)); s.opacity = '0';
      document.body.appendChild(el);
      v = { el, boxes: [], ro: null, cls: id.current };
      if (typeof ResizeObserver !== 'undefined') { const made = v; v.ro = new ResizeObserver(() => placeVeil(made)); }
      veil.current = v;
      holdBoxes(v);
      placeVeil(v);
      void el.offsetWidth;
    } else holdBoxes(v);
    placeVeil(v);
    const s = v.el.style;
    if (phase === 'in') { s.transition = `opacity ${SWAP_IN_MS}ms var(--ease-default)`; s.opacity = '0'; }
    else { s.transition = `opacity ${SWAP_OUT_MS}ms var(--ease-default)`; s.opacity = '1'; }
  }, [phase]);
  useEffect(() => () => { if (veil.current) dropVeil(veil.current); veil.current = null; }, []);
  return id.current;
}

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
  const veilCls = useSwapVeil(phase);
  return { shown, swapClass: phase === 'idle' ? '' : `${swapClassOf(phase)} ${veilCls}`, busy: phase !== 'idle', phase, inert: phase === 'out' || phase === 'hold' };
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
  const veilCls = useSwapVeil(phase);
  return { swapClass: phase === 'idle' ? '' : `${swapClassOf(phase)} ${veilCls}`, run, busy: phase !== 'idle', phase, inert: phase === 'out' || phase === 'hold' };
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
