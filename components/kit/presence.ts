import { useLayoutEffect, useRef } from 'react';
import { hudEase } from '../../utils/hudEase';
import { SMALL_FIX } from '../../game/smallFixSwitch';

export const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

export function motionOff(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const _busyUntil = new WeakMap<Element, number>();
export const SWITCH_SLIDE_MS = 250;
let _cause: Element | null = null;

const CONTROL = 'button, [role="button"], [role="switch"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="checkbox"], input[type="checkbox"], input[type="radio"], label, summary, a[href], [data-guard]';
let _propsKey: string | null = null;
function _hasOnClick(el: Element): boolean {
  if (_propsKey === null) {
    for (const k of Object.keys(el)) if (k.startsWith('__reactProps$')) { _propsKey = k; break; }
    if (_propsKey === null) return false;
  }
  const p = (el as unknown as Record<string, { onClick?: unknown } | undefined>)[_propsKey];
  return !!p && typeof p.onClick === 'function';
}
let _viaLabel = false;
export function controlOf(t: EventTarget | null): Element | null {
  _viaLabel = false;
  if (!(t instanceof Element)) return null;
  let el: Element | null = t.closest(CONTROL);
  for (let n: Element | null = t; n && n !== el && n !== document.body; n = n.parentElement) {
    if (n instanceof HTMLCanvasElement || n.hasAttribute('data-guard-off')) return null;
    if (_hasOnClick(n)) { el = n; break; }
  }
  if (el instanceof HTMLLabelElement && el.control) { _viaLabel = true; return el.control; }
  return el;
}
export function noteMotion(ms: number): void {
  if (_cause === null || !(ms > 0)) return;
  holdControl(_cause, ms);
}
export function motionCause(): Element | null { return _cause; }
export function holdControl(el: Element | null, ms: number): void {
  if (!el) return;
  const until = performance.now() + ms;
  if ((_busyUntil.get(el) ?? 0) < until) _busyUntil.set(el, until);
}
export function controlBusy(el: Element | null): boolean {
  return !!el && performance.now() < (_busyUntil.get(el) ?? 0);
}
let _labelPass: Element | null = null;
function _guardClick(e: MouseEvent): void {
  const t = e.target;
  const el = controlOf(t);
  if (!el) return;
  const viaLabel = _viaLabel;
  if (el === _labelPass && t === el) { _labelPass = null; return; }
  if (controlBusy(el)) { e.stopImmediatePropagation(); e.preventDefault(); return; }
  _cause = el;
  if (viaLabel) {
    _labelPass = el;
    window.setTimeout(() => { if (_labelPass === el) _labelPass = null; }, 0);
  }
  if (el instanceof HTMLInputElement && el.type === 'checkbox' && el.closest('.toggle-ios')) holdControl(el, SWITCH_SLIDE_MS);
  let frames = 2;
  const tick = () => { if (--frames <= 0) { if (_cause === el) _cause = null; } else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
export function installSpamGuard(): () => void {
  window.addEventListener('click', _guardClick, true);
  return () => window.removeEventListener('click', _guardClick, true);
}

type Prop = 'opacity' | 'width' | 'height' | 'top' | 'left' | 'transform' | 'translate' | 'clip-path';
const camel = (p: Prop): string => (p === 'clip-path' ? 'clipPath' : p);

function moves(a: Animation, prop: Prop): boolean {
  const t = a as Animation & { transitionProperty?: string };
  if (typeof t.transitionProperty === 'string') return t.transitionProperty === prop || t.transitionProperty === 'all';
  const fx = a.effect as KeyframeEffect | null;
  if (!fx || typeof fx.getKeyframes !== 'function') return false;
  const key = camel(prop);
  return fx.getKeyframes().some(k => key in k);
}

export function isMoving(el: HTMLElement, prop: Prop): boolean {
  return typeof el.getAnimations === 'function' && el.getAnimations().some(a => moves(a, prop));
}

export function takeOver(el: HTMLElement, prop: Prop): string {
  const now = getComputedStyle(el).getPropertyValue(prop);
  if (typeof el.getAnimations === 'function') for (const a of el.getAnimations()) if (moves(a, prop)) a.cancel();
  return now;
}

export interface GlideOpts {
  from?: string | number;
  delay?: number;
  easing?: string;
  done?: () => void;
}

export function glide(el: HTMLElement, prop: Prop, to: string | number, ms: number, o: GlideOpts = {}): Animation | null {
  const from = o.from ?? takeOver(el, prop);
  if (o.from !== undefined) takeOver(el, prop);
  const key = camel(prop);
  (el.style as unknown as Record<string, string>)[key] = String(to);
  if (motionOff() || ms <= 0 || typeof el.animate !== 'function' || String(from) === String(to)) { o.done?.(); return null; }
  noteMotion(ms + (o.delay ?? 0));
  const a = el.animate([{ [key]: String(from) }, { [key]: String(to) }], { duration: ms, delay: o.delay ?? 0, easing: o.easing ?? EASE, fill: 'backwards' });
  if (o.done) { const cb = o.done; a.onfinish = () => cb(); }
  return a;
}

export type LeaveKind = 'pop' | 'fade' | 'tip' | 'menu' | 'toast';
const LEAVE_TO: Record<LeaveKind, Keyframe> = {
  pop: { opacity: 0, transform: 'translateY(6px) scale(0.98)' },
  fade: { opacity: 0 },
  tip: { opacity: 0, transform: 'scale(0.95)' },
  menu: { opacity: 0 },
  toast: { opacity: 0, transform: 'translateY(0.75rem)' },
};
export const LEAVE_MS = 120;

const _leaveWatch = new Set<(box: Element) => void>();
export function onLeaveStart(cb: (box: Element) => void): () => void {
  _leaveWatch.add(cb);
  return () => { _leaveWatch.delete(cb); };
}
export function leaveStarts(box: Element | null): void {
  if (!box || _leaveWatch.size === 0) return;
  _leaveWatch.forEach(cb => cb(box));
}

export function leaveFrom(el: HTMLElement, kind: LeaveKind, ms = LEAVE_MS, hold: Prop[] = kind === 'menu' ? ['clip-path'] : []): void {
  if (kind !== 'tip') leaveStarts(el);
  const to = LEAVE_TO[kind];
  const cs = getComputedStyle(el);
  const from: Keyframe = {};
  for (const k of Object.keys(to)) from[k] = cs.getPropertyValue(k) || (k === 'opacity' ? '1' : 'none');
  const held: [string, string][] = hold.map(p => [camel(p), cs.getPropertyValue(p)]);
  el.style.animation = 'none';
  for (const [k, v] of held) if (v) (el.style as unknown as Record<string, string>)[k] = v;
  if (typeof el.getAnimations === 'function') for (const a of el.getAnimations()) a.cancel();
  if (motionOff() || typeof el.animate !== 'function') { Object.assign(el.style, to); return; }
  noteMotion(ms);
  el.animate([from, to], { duration: ms, easing: EASE, fill: 'forwards' });
}

export function useLeave(ref: { readonly current: HTMLElement | null }, leaving: boolean, kind: LeaveKind, ms = LEAVE_MS): void {
  const played = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!leaving) {
      if (played.current && el) comeBack(el, kind, ms);
      played.current = false;
      return;
    }
    if (!el || played.current) return;
    played.current = true;
    leaveFrom(el, kind, ms);
  });
}

export function comeBack(el: HTMLElement, kind: LeaveKind, ms = LEAVE_MS): void {
  const to = LEAVE_TO[kind];
  const cs = getComputedStyle(el);
  const from: Keyframe = {};
  const rest: Keyframe = {};
  for (const k of Object.keys(to)) { from[k] = cs.getPropertyValue(k); rest[k] = k === 'opacity' ? '1' : 'none'; }
  if (typeof el.getAnimations === 'function') for (const a of el.getAnimations()) a.cancel();
  if (motionOff() || typeof el.animate !== 'function') {
    if (SMALL_FIX.GH290 !== 0) for (const k of Object.keys(to)) el.style.removeProperty(k);
    return;
  }
  noteMotion(ms);
  el.animate([from, rest], { duration: ms, easing: EASE });
}

const FLOW_MS = 160;
export function flowChange(parent: HTMLElement, apply: () => void, ms = FLOW_MS, width = false): boolean {
  const kids = Array.from(parent.children).filter((c): c is HTMLElement => c instanceof HTMLElement && !c.hidden);
  const before = new Map<HTMLElement, DOMRect>();
  for (const k of kids) before.set(k, k.getBoundingClientRect());
  const h0 = parseFloat(takeOver(parent, 'height')) || parent.offsetHeight;
  const w0 = width ? (parseFloat(takeOver(parent, 'width')) || parent.offsetWidth) : 0;
  if (width) parent.style.width = '';
  for (const k of kids) {
    takeOver(k, 'left'); takeOver(k, 'top'); k.style.left = ''; k.style.top = '';
    if (isMoving(k, 'width') && k.style.flex === '0 0 auto') { takeOver(k, 'width'); k.style.width = ''; k.style.flex = ''; }
  }
  parent.style.height = '';
  apply();
  if (motionOff()) return false;
  const h1 = parent.offsetHeight;
  let moved = false;
  const zoom = parent.offsetWidth > 0 ? parent.getBoundingClientRect().width / parent.offsetWidth : 1;
  for (const k of kids) {
    const a = before.get(k)!;
    if (!k.isConnected || a.width === 0) continue;
    const b = k.getBoundingClientRect();
    if (b.width === 0) continue;
    const dx = (a.left - b.left) / zoom, dy = (a.top - b.top) / zoom, dw = (a.width - b.width) / zoom;
    if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) {
      if (getComputedStyle(k).position === 'static') k.style.position = 'relative';
      glide(k, 'left', '0px', ms, { from: `${dx}px` });
      glide(k, 'top', '0px', ms, { from: `${dy}px` });
      moved = true;
    }
    if (Math.abs(dw) >= 0.5) {
      const w1 = b.width / zoom;
      k.style.flex = '0 0 auto';
      glide(k, 'width', `${w1}px`, ms, { from: `${w1 + dw}px`, done: () => { k.style.width = ''; k.style.flex = ''; } });
      moved = true;
    }
  }
  if (Math.abs(h1 - h0) >= 0.5) {
    glide(parent, 'height', `${h1}px`, ms, { from: `${h0}px`, done: () => { parent.style.height = ''; } });
    moved = true;
  }
  if (width) {
    const w1 = parent.offsetWidth;
    if (Math.abs(w1 - w0) >= 0.5) {
      glide(parent, 'width', `${w1}px`, ms, { from: `${w0}px`, done: () => { parent.style.width = ''; } });
      moved = true;
    }
  }
  return moved;
}

export function whenFoldsSettle(box: HTMLElement | null, cb: () => void, maxMs = 500): () => void {
  let raf = 0;
  const t0 = performance.now();
  const check = () => {
    raf = 0;
    if (!box || !box.isConnected || !box.querySelector('.k-fold-moving') || performance.now() - t0 > maxMs) { cb(); return; }
    raf = requestAnimationFrame(check);
  };
  if (!box || !box.querySelector('.k-fold-moving')) { cb(); return () => {}; }
  raf = requestAnimationFrame(check);
  return () => { if (raf) cancelAnimationFrame(raf); };
}

export function finishLeaving(el: HTMLElement | null, steps: { sel?: string; to: Keyframe; ms: number; delay?: number }[]): void {
  leaveStarts(el);
  if (!el || !el.isConnected || motionOff() || typeof el.animate !== 'function') return;
  const copy = el.cloneNode(true) as HTMLElement;
  const pairs: [HTMLElement, HTMLElement][] = [[el, copy]];
  for (const s of steps) if (s.sel) { const a = el.querySelector<HTMLElement>(s.sel), b = copy.querySelector<HTMLElement>(s.sel); if (a && b) pairs.push([a, b]); }
  for (const [a, b] of pairs) {
    const cs = getComputedStyle(a);
    b.style.opacity = cs.opacity; b.style.clipPath = cs.clipPath; b.style.transition = 'none';
  }
  copy.inert = true;
  copy.style.pointerEvents = 'none';
  copy.removeAttribute('id');
  document.body.appendChild(copy);
  let end = 0;
  for (const s of steps) {
    const target = s.sel ? copy.querySelector<HTMLElement>(s.sel) : copy;
    if (!target) continue;
    const cs = getComputedStyle(target);
    const from: Keyframe = {};
    for (const k of Object.keys(s.to)) from[k] = (cs as unknown as Record<string, string>)[k];
    target.animate([from, s.to], { duration: s.ms, delay: s.delay ?? 0, easing: EASE, fill: 'forwards' });
    end = Math.max(end, (s.delay ?? 0) + s.ms);
  }
  window.setTimeout(() => copy.remove(), end + 30);
}

export const ARRIVE_FADE_MS = 105;
export const ARRIVE_GLIDE_MS = 180;
export function arriveAfterWait(box: HTMLElement, skel: HTMLElement | null, h0: number, skelGone: () => void): () => void {
  if (motionOff() || typeof box.animate !== 'function') { skelGone(); return () => {}; }
  const anims: Animation[] = [];
  let t = 0;
  if (skel) {
    const a = skel.animate([{ opacity: getComputedStyle(skel).opacity }, { opacity: 0 }], { duration: ARRIVE_FADE_MS, easing: EASE, fill: 'forwards' });
    a.onfinish = skelGone;
    anims.push(a);
    t = ARRIVE_FADE_MS;
  } else skelGone();
  const h1 = box.offsetHeight;
  if (h0 > 0 && Math.abs(h1 - h0) >= 2) {
    box.style.overflow = 'hidden';
    const g = box.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: ARRIVE_GLIDE_MS, delay: t, easing: EASE, fill: 'backwards' });
    g.onfinish = g.oncancel = () => { box.style.overflow = ''; };
    anims.push(g);
    t += ARRIVE_GLIDE_MS;
  }
  for (const c of Array.from(box.children)) {
    if (c === skel || !(c instanceof HTMLElement)) continue;
    anims.push(c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ARRIVE_FADE_MS, delay: t, easing: EASE, fill: 'backwards' }));
  }
  return () => { for (const a of anims) a.cancel(); };
}

export function easeToward(x: number, target: number, dtSec: number): number {
  const d = x - target;
  if (d === 0 || !(dtSec > 0)) return d === 0 ? target : x;
  return target + Math.sign(d) * hudEase(Math.abs(d), dtSec / 0.7);
}

interface ScrollGlide { raf: number; x: number; last: number; rest: number; missing: number; wrote: number; detach: () => void }
const GLIDE_FLOOR_PX_S = 200;
function screenScaleOf(el: HTMLElement): number {
  const h = el.offsetHeight;
  const r = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().height : 0;
  const k = h > 0 && r > 0 ? r / h : 1;
  return Number.isFinite(k) && k > 0.05 ? k : 1;
}
const scrollGlides = new WeakMap<HTMLElement, ScrollGlide>();
const SCROLL_STOP_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

export function stopScrollGlide(el: HTMLElement): void {
  const g = scrollGlides.get(el);
  if (!g) return;
  cancelAnimationFrame(g.raf);
  g.detach();
  scrollGlides.delete(el);
}

const glideStartFns = new Set<(el: HTMLElement) => void>();
export function onScrollGlideStart(fn: (el: HTMLElement) => void): () => void {
  glideStartFns.add(fn);
  return () => { glideStartFns.delete(fn); };
}
export function scrollGlideRuns(el: HTMLElement): boolean { return scrollGlides.has(el); }

export function scrollGlide(el: HTMLElement, to: number | (() => number | null), o: { follow?: number; done?: () => void } = {}): void {
  glideStartFns.forEach(fn => fn(el));
  const aim = typeof to === 'function' ? to : () => to;
  const prev = scrollGlides.get(el);
  const startX = prev ? prev.x : el.scrollTop;
  if (prev) { cancelAnimationFrame(prev.raf); prev.detach(); }
  const clamp = (v: number) => Math.min(Math.max(0, el.scrollHeight - el.clientHeight), Math.max(0, v));
  if (motionOff() || typeof requestAnimationFrame !== 'function') {
    const v = aim();
    if (v != null) el.scrollTop = clamp(v);
    scrollGlides.delete(el);
    o.done?.();
    return;
  }
  const stop = () => stopScrollGlide(el);
  for (const ev of SCROLL_STOP_EVENTS) el.addEventListener(ev, stop, { passive: true });
  const g: ScrollGlide = {
    raf: 0, x: startX, last: -1, rest: 0, missing: 0, wrote: -1,
    detach: () => { for (const ev of SCROLL_STOP_EVENTS) el.removeEventListener(ev, stop); },
  };
  const follow = o.follow ?? 0;
  const floorPxS = SMALL_FIX.R889B !== 0 ? GLIDE_FLOOR_PX_S / screenScaleOf(el) : 0;
  const step = (now: number) => {
    const want = aim();
    if (want == null) {
      if (++g.missing > 5) { stop(); return; }
      g.raf = requestAnimationFrame(step);
      return;
    }
    if (SMALL_FIX.R889 !== 0 && g.wrote >= 0) { const moved = el.scrollTop - g.wrote; if (Math.abs(moved) > 0.01) g.x += moved; }
    const T = clamp(want);
    const dt = g.last < 0 ? 1 / 60 : Math.min(0.1, (now - g.last) / 1000);
    g.last = now;
    const eased = easeToward(g.x, T, dt);
    const left = T - g.x, least = floorPxS * dt;
    g.x = least > 0 && Math.abs(eased - g.x) < least ? g.x + Math.sign(left) * Math.min(least, Math.abs(left)) : eased;
    if (Math.abs(T - g.x) < 0.5) g.x = T;
    el.scrollTop = g.x;
    if (SMALL_FIX.R889 !== 0) g.wrote = el.scrollTop;
    if (g.x === T) {
      if (g.rest++ >= follow) { stop(); o.done?.(); return; }
    } else g.rest = 0;
    g.raf = requestAnimationFrame(step);
  };
  scrollGlides.set(el, g);
  g.raf = requestAnimationFrame(step);
}

export function nearestScrollTop(el: HTMLElement, top: number, height: number, margin = 0): number | null {
  if (top - margin < el.scrollTop) return top - margin;
  if (top + height + margin > el.scrollTop + el.clientHeight) return top + height + margin - el.clientHeight;
  return null;
}

export function glideIntoView(el: HTMLElement | null, margin = 8): void {
  if (!el) return;
  for (let sc = el.parentElement; sc && sc !== document.body && sc !== document.documentElement; sc = sc.parentElement) {
    if (!/(auto|scroll)/.test(getComputedStyle(sc).overflowY) || sc.scrollHeight <= sc.clientHeight + 1) continue;
    const r = el.getBoundingClientRect(), v = sc.getBoundingClientRect();
    const k = sc.offsetHeight > 0 ? v.height / sc.offsetHeight : 1;
    const top = (r.top - v.top) / k + sc.scrollTop;
    const to = nearestScrollTop(sc, top, r.height / k, margin);
    if (to != null) scrollGlide(sc, to);
    return;
  }
}

export function useHeld<T>(value: T | null | undefined): T | null | undefined {
  const last = useRef(value);
  if (value != null) last.current = value;
  return value ?? last.current;
}
