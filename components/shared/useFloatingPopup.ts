import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { getVisualScale, onZoomChange } from '../../utils/zoomCompensation';
import { useEscapeOwner } from './escapeStack';
import { blurFocusedField, useBlurOnUnmount } from '../kit/motion';
import { finishLeaving, motionOff, noteMotion, leaveStarts } from '../kit/presence';

interface UseFloatingPopupOptions {
  gap?: number;
  edgeMargin?: number;
  estimatedWidth?: number;
  estimatedHeight?: number;
  align?: 'start' | 'end';
  claimsEscape: boolean;
}

interface AnchorRect {
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
}

const STYLE_EMPTY: React.CSSProperties = {};

export const DROP_SLIDE_MS = 125;
export const DROP_FADE_MS = 90;
export const DROP_EXIT_MS = DROP_FADE_MS + DROP_SLIDE_MS;
const DROP_ENTER_MS = DROP_SLIDE_MS + DROP_FADE_MS + 40;
const reducedMotion = motionOff;

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

  const fitsLeft = triggerRect.left + estimatedWidth <= viewW - edgeMargin;
  const fitsEnd = triggerRect.right - estimatedWidth >= edgeMargin;
  const anchored = align === 'end'
    ? (fitsEnd ? triggerRect.right - estimatedWidth : triggerRect.left)
    : (fitsLeft ? triggerRect.left : triggerRect.right - estimatedWidth);
  const left = Math.max(edgeMargin, Math.min(anchored, viewW - estimatedWidth - edgeMargin));

  let top: number | null = null;
  let bottom: number | null = null;

  if (flipUp) {
    const bottomPos = viewH - triggerRect.top + gap;
    const topEdge = viewH - bottomPos - height;
    if (topEdge < edgeMargin) {
      top = edgeMargin;
    } else {
      bottom = bottomPos;
    }
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

export function useFloatingPopup(options: UseFloatingPopupOptions) {
  const claimsEscape = options.claimsEscape;
  const {
    gap = 4,
    edgeMargin = 8,
    estimatedWidth,
    estimatedHeight = 200,
    align = 'start',
  } = options;

  const triggerRef = useRef<HTMLElement>(null);
  const popupRef = useRef<HTMLElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<PopupPosition | null>(null);
  const [popupZoom, setPopupZoom] = useState(1);
  const triggerRectRef = useRef<AnchorRect | null>(null);
  const popupZoomRef = useRef(1);
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef(0);
  const enterRaf = useRef(0);
  const openRef = useRef(false);
  const leavingRef = useRef(false);
  const movingUntil = useRef(0);
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef(0);
  const [flatUnder, setFlatUnder] = useState('');

  const open = useCallback((clickRect?: DOMRect, instant = false) => {
    const rect = (clickRect && typeof clickRect.top === 'number' ? clickRect : null) ?? triggerRef.current?.getBoundingClientRect() ?? null;
    setFlatUnder(blurOnScreen() ? (colourUnder(triggerRef.current) || 'var(--k-popover)') : '');
    const pz = getVisualScale(triggerRef.current) || 1;
    popupZoomRef.current = pz;
    setPopupZoom(pz);
    triggerRectRef.current = rect
      ? { top: rect.top / pz, bottom: rect.bottom / pz, left: rect.left / pz, right: rect.right / pz }
      : null;

    if (triggerRectRef.current) {
      const t0 = triggerRectRef.current;
      setPopupPos(computeBestFitPosition(t0, estimatedHeight, gap, edgeMargin, estimatedWidth ?? (t0.right - t0.left), pz, align));
    }
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(settleTimer.current);
    cancelAnimationFrame(enterRaf.current);
    leavingRef.current = false; setLeaving(false);
    setEntered(instant || reducedMotion());
    if (!instant) enterRaf.current = requestAnimationFrame(() => { enterRaf.current = requestAnimationFrame(() => setEntered(true)); });
    openRef.current = true;
    movingUntil.current = instant || reducedMotion() ? 0 : performance.now() + DROP_ENTER_MS;
    if (movingUntil.current > 0) {
      noteMotion(DROP_ENTER_MS);
      setSettling(true);
      settleTimer.current = window.setTimeout(() => setSettling(false), DROP_ENTER_MS);
    } else setSettling(false);
    setIsOpen(true);
  }, [estimatedHeight, gap, edgeMargin, estimatedWidth, align]);

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
    noteMotion(DROP_EXIT_MS);
    leaveStarts(popupRef.current);
    leavingRef.current = true;
    movingUntil.current = performance.now() + DROP_EXIT_MS;
    setLeaving(true);
    leaveTimer.current = window.setTimeout(closeNow, DROP_EXIT_MS);
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
    const actualHeight = Math.min(popup.offsetHeight, estimatedHeight * 2);
    const actualWidth = popup.offsetWidth || estimatedWidth || (tRect.right - tRect.left);
    const pos = computeBestFitPosition(tRect, actualHeight, gap, edgeMargin, actualWidth, popupZoomRef.current, align);
    setPopupPos(prev => {
      if (prev && prev.top === pos.top && prev.bottom === pos.bottom
          && prev.left === pos.left && prev.flipped === pos.flipped) {
        return prev;
      }
      return pos;
    });
  }, [isOpen, gap, edgeMargin, estimatedWidth, estimatedHeight, popupZoom, align]);

  useEffect(() => {
    if (!isOpen) return;
    return onZoomChange(closeNow);
  }, [isOpen, closeNow]);

  useEscapeOwner(close, isOpen && claimsEscape && !leaving);

  const dropClass = `k-drop${popupPos?.flipped ? ' k-drop-up' : ''}${!entered ? ' k-drop-start' : ''}${leaving ? ' k-drop-leave' : ''}${flatUnder ? ' k-drop-flat' : ''}${settling || leaving ? ' k-drop-busy' : ''}`;

  const moving = useCallback(() => performance.now() < movingUntil.current, []);
  return { triggerRef, popupRef, isOpen, open, close, closeNow, toggle, popupStyle, popupZoom, leaving, dropClass, moving };
}
