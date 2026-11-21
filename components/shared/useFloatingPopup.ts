import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { getVisualScale, onZoomChange } from '../../utils/zoomCompensation';
import { useEscapeOwner } from './escapeStack';
import { blurFocusedField, useBlurOnUnmount } from '../kit/motion';
import { finishLeaving, motionOff, noteMotion, leaveStarts } from '../kit/presence';
import { uiThemeId } from '../../utils/uiTheme';

interface UseFloatingPopupOptions {
  gap?: number;
  edgeMargin?: number;
  estimatedWidth?: number;
  estimatedHeight?: number;
  align?: 'start' | 'end';
  claimsEscape: boolean;
  hangs?: boolean | 'words';
}

export const wordTrigger = (el: Element | null | undefined): boolean =>
  !!el && el.matches('.k-btn, .k-field, .k-select-trigger') && !el.matches('.k-icon-btn');

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface PopupPosition {
  top: number | null;
  bottom: number | null;
  left: number;
  flipped: boolean;
  maxH?: number | null;
}

const STYLE_EMPTY: React.CSSProperties = {};

export const DROP_SLIDE_MS = 125;
export const DROP_FADE_MS = 90;
export const DROP_EXIT_MS = DROP_FADE_MS + DROP_SLIDE_MS;
const DROP_ENTER_MS = DROP_SLIDE_MS + DROP_FADE_MS + 40;
const reducedMotion = motionOff;

const CLASSIC_DROP_MS = 700;
const CLASSIC_DROP_BUSY_MS = 280;
const classicDrop = () => uiThemeId() === 'classic';
function classicQ(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const ax = 3 * 0.22 - 3 * 0.36 + 1, bx = 3 * 0.36 - 6 * 0.22, cx = 3 * 0.22;
  const ay = 3 * 1 - 3 * 1 + 1, by = 3 * 1 - 6 * 1, cy = 3 * 1;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const fx = ((ax * t + bx) * t + cx) * t - x, d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(fx) < 1e-6 || d === 0) break;
    t = Math.min(1, Math.max(0, t - fx / d));
  }
  return ((ay * t + by) * t + cy) * t;
}
const CLASSIC_EDGE = 3;
const enterBusyMs = () => (classicDrop() ? CLASSIC_DROP_BUSY_MS : DROP_ENTER_MS);
const exitMs = () => (classicDrop() ? CLASSIC_DROP_MS : DROP_EXIT_MS);

export const BLUR_LAYERS = '.modal-scrim, .k-glass, .k-backdrop, .k-mapgen-glass, .k-msc-glass, .k-mm-card, .k-play-window, .toolbar-rail, .k-frame-glass, .k-bar.k-chrome';
function blurOnScreen(): boolean {
  const els = document.querySelectorAll<HTMLElement>(BLUR_LAYERS);
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (el.getClientRects().length === 0) continue;
    const cs = getComputedStyle(el);
    const f = cs.backdropFilter || cs.getPropertyValue('-webkit-backdrop-filter');
    if (f && f !== 'none') return true;
  }
  return false;
}
function colourUnder(el: HTMLElement | null): string {
  for (let p = el; p; p = p.parentElement) {
    const c = getComputedStyle(p).backgroundColor;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) continue;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    const a = parts.length > 3 ? parseFloat(parts[3]) : 1;
    if (a >= 0.99) return c;
  }
  return '';
}

function computeBestFitPosition(
  triggerRect: AnchorRect,
  height: number,
  gap: number,
  edgeMargin: number,
  estimatedWidth: number,
  zoom: number,
  align: 'start' | 'end' = 'start',
): PopupPosition {
  const viewH = window.innerHeight / zoom;
  const viewW = window.innerWidth / zoom;

  const spaceBelow = viewH - edgeMargin - (triggerRect.bottom + gap);
  const spaceAbove = triggerRect.top - gap - edgeMargin;

  let flipUp: boolean;
  if (height <= spaceBelow) {
    flipUp = false;
  } else if (height <= spaceAbove) {
    flipUp = true;
  } else {
    flipUp = spaceAbove > spaceBelow;
  }
  const classicCut = classicDrop() && height > (flipUp ? spaceAbove : spaceBelow);

  const fitsLeft = triggerRect.left + estimatedWidth <= viewW - edgeMargin;
  const fitsEnd = triggerRect.right - estimatedWidth >= edgeMargin;
  const anchored = align === 'end'
    ? (fitsEnd ? triggerRect.right - estimatedWidth : triggerRect.left)
    : (fitsLeft ? triggerRect.left : triggerRect.right - estimatedWidth);
  const left = Math.max(edgeMargin, Math.min(anchored, viewW - estimatedWidth - edgeMargin));

  let top: number | null = null;
  let bottom: number | null = null;

  if (flipUp && classicCut) {
    return { top: null, bottom: viewH - triggerRect.top + gap, left, flipped: true, maxH: Math.floor(spaceAbove) };
  } else if (flipUp) {
    const bottomPos = viewH - triggerRect.top + gap;
    const topEdge = viewH - bottomPos - height;
    if (topEdge < edgeMargin) {
      top = edgeMargin;
    } else {
      bottom = bottomPos;
    }
  } else if (classicCut) {
    return { top: triggerRect.bottom + gap, bottom: null, left, flipped: false, maxH: Math.floor(spaceBelow) };
  } else {
    let topPos = triggerRect.bottom + gap;
    if (topPos + height > viewH - edgeMargin) {
      topPos = viewH - edgeMargin - height;
    }
    if (topPos < edgeMargin) topPos = edgeMargin;
    top = topPos;
  }

  return { top, bottom, left, flipped: flipUp };
}

function wholeRowsCut(popup: HTMLElement, maxH: number): number {
  const rows = popup.querySelectorAll<HTMLElement>('[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]');
  if (rows.length === 0) return maxH;
  const cs = getComputedStyle(popup);
  const foot = (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  const pr = popup.getBoundingClientRect();
  const k = popup.offsetHeight > 0 && pr.height > 0 ? pr.height / popup.offsetHeight : 1;
  let best = 0;
  for (let i = 0; i < rows.length; i++) {
    const b = (rows[i].getBoundingClientRect().bottom - pr.top) / k;
    if (b + foot <= maxH + 0.5 && b > best) best = b;
  }
  return best > 0 ? Math.ceil(best + foot - 0.01) : maxH;
}

export function useFloatingPopup(options: UseFloatingPopupOptions) {
  const claimsEscape = options.claimsEscape;
  const {
    gap: gapAsked = 4,
    edgeMargin = 8,
    estimatedWidth,
    estimatedHeight = 200,
    align = 'start',
    hangs = false,
  } = options;
  const gapNow = () => ((hangs === true || (hangs === 'words' && wordTrigger(triggerRef.current))) && classicDrop() ? -CLASSIC_EDGE : gapAsked);

  const triggerRef = useRef<HTMLElement>(null);
  const popupRef = useRef<HTMLElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<PopupPosition | null>(null);
  const [popupZoom, setPopupZoom] = useState(1);
  const triggerRectRef = useRef<AnchorRect | null>(null);
  const popupZoomRef = useRef(1);
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const stepRaf = useRef(0);
  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!entered || leaving || !el || !classicDrop() || reducedMotion()) return;
    const up = el.classList.contains('k-drop-up') && !el.classList.contains('k-cp');
    if (!up && el.classList.contains('k-cp')) return;
    const set = (y: number) => {
      if (up) el.style.setProperty('--k-drop-cut', `${(100 - y * 100).toFixed(3)}%`);
      else { const v = `100% ${(y * 100).toFixed(3)}%`; el.style.setProperty('mask-size', v); el.style.setProperty('-webkit-mask-size', v); }
    };
    const clear = () => { el.style.removeProperty('transition'); el.style.removeProperty('mask-size'); el.style.removeProperty('-webkit-mask-size'); el.style.removeProperty('--k-drop-cut'); };
    el.style.setProperty('transition', 'none');
    set(0);
    let last = performance.now(), x = 0;
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(now - last, 1000 / 60));
      last = now;
      x = Math.min(1, x + dt / CLASSIC_DROP_MS);
      set(classicQ(x));
      if (x < 1) stepRaf.current = requestAnimationFrame(tick); else { stepRaf.current = 0; clear(); }
    };
    stepRaf.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(stepRaf.current); stepRaf.current = 0; clear(); };
  }, [entered, leaving]);
  const leaveTimer = useRef(0);
  const enterRaf = useRef(0);
  const openRef = useRef(false);
  const leavingRef = useRef(false);
  const movingUntil = useRef(0);
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef(0);
  const motionUntil = useRef(0);
  const [flatUnder, setFlatUnder] = useState('');

  const open = useCallback((clickRect?: DOMRect, instant = false) => {
    const rect = (clickRect && typeof clickRect.top === 'number' ? clickRect : null) ?? triggerRef.current?.getBoundingClientRect() ?? null;
    setFlatUnder(blurOnScreen() ? (colourUnder(triggerRef.current) || 'var(--k-popover)') : '');
    const pz = getVisualScale(triggerRef.current) || 1;
    popupZoomRef.current = pz;
    setPopupZoom(pz);
    const dpr = window.devicePixelRatio || 1;
    const onPx = (v: number) => Math.round(v * dpr) / dpr;
    triggerRectRef.current = rect
      ? { top: onPx(rect.top) / pz, bottom: onPx(rect.bottom) / pz, left: onPx(rect.left) / pz, right: onPx(rect.right) / pz }
      : null;

    if (triggerRectRef.current) {
      const t0 = triggerRectRef.current;
      setPopupPos(computeBestFitPosition(t0, estimatedHeight, gapNow(), edgeMargin, estimatedWidth ?? (t0.right - t0.left), pz, align));
    }
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(settleTimer.current);
    cancelAnimationFrame(enterRaf.current);
    leavingRef.current = false; setLeaving(false);
    setEntered(instant || reducedMotion());
    if (!instant) enterRaf.current = requestAnimationFrame(() => { enterRaf.current = requestAnimationFrame(() => setEntered(true)); });
    openRef.current = true;
    movingUntil.current = instant || reducedMotion() ? 0 : performance.now() + enterBusyMs();
    motionUntil.current = instant || reducedMotion() ? 0 : performance.now() + (classicDrop() ? CLASSIC_DROP_MS : DROP_ENTER_MS);
    if (movingUntil.current > 0) {
      if (classicDrop()) noteMotion(CLASSIC_DROP_BUSY_MS); else noteMotion(DROP_ENTER_MS);
      setSettling(true);
      settleTimer.current = window.setTimeout(() => setSettling(false), enterBusyMs());
    } else setSettling(false);
    setIsOpen(true);
  }, [estimatedHeight, gapAsked, hangs, edgeMargin, estimatedWidth, align]);

  const closeNow = useCallback(() => {
    blurFocusedField(popupRef.current);
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(settleTimer.current);
    setSettling(false);
    cancelAnimationFrame(enterRaf.current);
    openRef.current = false;
    leavingRef.current = false;
    setLeaving(false);
    setIsOpen(false);
    setPopupPos(null);
    triggerRectRef.current = null;
  }, []);

  const close = useCallback(() => {
    if (!openRef.current || leavingRef.current) return;
    if (performance.now() < movingUntil.current) return;
    if (reducedMotion()) { closeNow(); return; }
    const outMs = exitMs();
    if (classicDrop()) noteMotion(CLASSIC_DROP_MS); else noteMotion(DROP_EXIT_MS);
    leaveStarts(popupRef.current);
    leavingRef.current = true;
    movingUntil.current = performance.now() + outMs;
    motionUntil.current = performance.now() + outMs;
    setLeaving(true);
    leaveTimer.current = window.setTimeout(closeNow, outMs);
  }, [closeNow]);


  const toggle = useCallback((clickRect?: DOMRect) => {
    if (performance.now() < movingUntil.current) return;
    if (openRef.current && !leavingRef.current) close(); else open(clickRect);
  }, [open, close]);

  useEffect(() => () => { window.clearTimeout(leaveTimer.current); window.clearTimeout(settleTimer.current); cancelAnimationFrame(enterRaf.current); }, []);
  const flippedRef = useRef(false);
  flippedRef.current = !!popupPos?.flipped;
  useLayoutEffect(() => () => {
    if (!openRef.current) return;
    const el = popupRef.current;
    const inner = el?.querySelector<HTMLElement>('.k-drop-in');
    const left = inner ? parseFloat(getComputedStyle(inner).opacity) || 0 : 0;
    const shut = flippedRef.current ? 'inset(100% -24px -24px -24px)' : 'inset(-24px -24px 100% -24px)';
    if (classicDrop()) { finishLeaving(el, [{ to: { clipPath: shut }, ms: CLASSIC_DROP_MS }]); return; }
    finishLeaving(el, [
      { sel: '.k-drop-in', to: { opacity: 0 }, ms: Math.max(1, Math.round(DROP_FADE_MS * left)) },
      { to: { clipPath: flippedRef.current ? 'inset(100% -24px -24px -24px)' : 'inset(-24px -24px 100% -24px)' }, ms: DROP_SLIDE_MS, delay: Math.round(DROP_FADE_MS * left) },
    ]);
  }, []);
  useBlurOnUnmount(popupRef);

  const popupStyle: React.CSSProperties = useMemo(() => {
    if (!isOpen || !popupPos) return STYLE_EMPTY;
    const style: React.CSSProperties = { position: 'fixed' as const };
    if (popupPos.top != null) style.top = popupPos.top;
    if (popupPos.maxH != null) { style.maxHeight = popupPos.maxH; style.overflowY = 'auto'; }
    if (popupPos.bottom != null) style.bottom = popupPos.bottom;
    style.left = popupPos.left;
    const side = align === 'end' ? 'right' : 'left';
    style.transformOrigin = popupPos.flipped ? `bottom ${side}` : `top ${side}`;
    if (popupZoom !== 1) style.zoom = popupZoom;
    if (flatUnder) (style as Record<string, string | number>)['--k-drop-under'] = flatUnder;
    return style;
  }, [isOpen, popupPos, popupZoom, align, flatUnder]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const popup = popupRef.current;
    if (!popup) return;
    const tRect = triggerRectRef.current;
    if (!tRect) return;
    const cutNow = popup.style.maxHeight;
    if (cutNow) popup.style.maxHeight = '';
    const actualHeight = classicDrop() ? popup.offsetHeight : Math.min(popup.offsetHeight, estimatedHeight * 2);
    if (cutNow) popup.style.maxHeight = cutNow;
    const pw = popup.getBoundingClientRect().width / (popupZoomRef.current || 1);
    const actualWidth = (pw > 0 ? pw : 0) || estimatedWidth || (tRect.right - tRect.left);
    const pos = computeBestFitPosition(tRect, actualHeight, gapNow(), edgeMargin, actualWidth, popupZoomRef.current, align);
    if (pos.flipped && pos.maxH != null && classicDrop()) pos.maxH = wholeRowsCut(popup, pos.maxH);
    if (popup.classList.contains('k-drop-up') !== pos.flipped) { popup.style.setProperty('transition', 'none'); flipTo.current = pos.flipped ? 1 : 0; }
    setPopupPos(prev => {
      if (prev && prev.top === pos.top && prev.bottom === pos.bottom
          && prev.left === pos.left && prev.flipped === pos.flipped && (prev.maxH ?? null) === (pos.maxH ?? null)) {
        return prev;
      }
      return pos;
    });
  }, [isOpen, gapAsked, hangs, edgeMargin, estimatedWidth, estimatedHeight, popupZoom, align]);
  const flipTo = useRef(-1);
  useLayoutEffect(() => {
    const el = popupRef.current;
    if (flipTo.current < 0 || !el) return;
    if (el.classList.contains('k-drop-up') !== (flipTo.current === 1)) return;
    flipTo.current = -1;
    void el.offsetHeight;
    el.style.removeProperty('transition');
  }, [popupPos?.flipped]);

  useEffect(() => {
    if (!isOpen) return;
    return onZoomChange(closeNow);
  }, [isOpen, closeNow]);

  useEscapeOwner(close, isOpen && claimsEscape && !leaving);

  useEffect(() => {
    if (!isOpen) return;
    const still = (e: Event) => { if (performance.now() < motionUntil.current && e.cancelable) e.preventDefault(); };
    const o: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener('wheel', still, o);
    window.addEventListener('touchmove', still, o);
    return () => { window.removeEventListener('wheel', still, o); window.removeEventListener('touchmove', still, o); };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = popupRef.current;
    if (!el) return;
    const guard = (e: Event) => { if (performance.now() < movingUntil.current) { e.stopPropagation(); e.preventDefault(); } };
    el.addEventListener('pointerdown', guard, true);
    el.addEventListener('click', guard, true);
    return () => { el.removeEventListener('pointerdown', guard, true); el.removeEventListener('click', guard, true); };
  }, [isOpen]);

  const dropClass = `k-drop${popupPos?.flipped ? ' k-drop-up' : ''}${!entered ? ' k-drop-start' : ''}${leaving ? ' k-drop-leave' : ''}${flatUnder ? ' k-drop-flat' : ''}${settling || leaving ? ' k-drop-busy' : ''}`;

  const moving = useCallback(() => performance.now() < movingUntil.current, []);
  return { triggerRef, popupRef, isOpen, open, close, closeNow, toggle, popupStyle, popupZoom, leaving, dropClass, moving, anchor: triggerRectRef };
}
