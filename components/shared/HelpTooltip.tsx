import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { getVisualScale, onZoomChange } from '../../utils/zoomCompensation';
import { useEscapeOwner } from './escapeStack';
import { HelpBubble } from '../ui/icons';
import { useMenuStage, SWAP_OUT_MS, SWAP_IN_MS } from '../kit/motion';
import { glide, motionOff, useLeave, onLeaveStart } from '../kit/presence';
import { FADE_SELECTOR } from '../shell/textFade';
import { toolStore } from '../shell/toolStore';

const MARGIN = 8;
const MAX_TIP_WIDTH = 320;
export const TIP_Z = 100000;

const TIP_CHARS_PER_LINE = 38;
const TIP_LINE_HEIGHT = 15.2;
const TIP_VERTICAL_PADDING = 18;
const TIP_MIN_HEIGHT = 33;

function estimateTipHeight(content: React.ReactNode): number {
  const text = typeof content === 'string' ? content : 'x'.repeat(160);
  const lines = Math.max(1, Math.ceil((text ? text.length : 0) / TIP_CHARS_PER_LINE));
  return Math.max(TIP_MIN_HEIGHT, lines * TIP_LINE_HEIGHT + TIP_VERTICAL_PADDING);
}

const TIP_GAP = 6;
const ARROW_INSET = 10;
export type TipSide = 'top' | 'bottom' | 'left' | 'right';
const OPPOSITE: Record<TipSide, TipSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
function hugLines(el: HTMLElement): void {
  el.style.width = '';
  const t = el.querySelector<HTMLElement>(':scope > .k-tip-text');
  if (!t) return;
  const lines = t.getClientRects();
  if (lines.length < 2) return;
  let widest = 0;
  for (let i = 0; i < lines.length; i++) widest = Math.max(widest, lines[i].width);
  const drawn = el.getBoundingClientRect().width;
  const toLocal = drawn > 0 ? el.offsetWidth / drawn : 1;
  const cs = getComputedStyle(el);
  const frame = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  const w = Math.ceil(widest * toLocal + frame + 0.5);
  if (w < el.offsetWidth) el.style.width = `${w}px`;
}
const TooltipPopup: React.FC<{ text: React.ReactNode; rect: DOMRect; zoom: number; position: 'below' | 'above' | TipSide; leaving?: boolean }> = ({ text: liveText, rect, zoom, position, leaving }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: TipSide; arrow: number } | null>(null);
  const want: TipSide = position === 'below' ? 'bottom' : position === 'above' ? 'top' : position;
  const [text, setText] = useState(liveText);
  const swapped = useRef(false);
  useLayoutEffect(() => {
    if (Object.is(liveText, text)) return;
    const el = boxRef.current;
    if (!el || leaving || !pos || motionOff()) { setText(liveText); return; }
    const from = getComputedStyle(el).opacity;
    el.style.animation = 'none';
    glide(el, 'opacity', '0', SWAP_OUT_MS, { from, done: () => { swapped.current = true; setText(liveText); } });
  }, [liveText]);
  useLayoutEffect(() => {
    if (!swapped.current) return;
    swapped.current = false;
    const el = boxRef.current;
    if (el) glide(el, 'opacity', '1', SWAP_IN_MS, { from: '0' });
  }, [text]);
  useLeave(boxRef, !!leaving, 'tip');

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    hugLines(el);
    const vw = window.innerWidth / zoom;
    const vh = window.innerHeight / zoom;
    const w = el.offsetWidth || MAX_TIP_WIDTH;
    const h = el.offsetHeight || estimateTipHeight(text);
    const cx = (rect.left + rect.width / 2) / zoom;
    const cy = (rect.top + rect.height / 2) / zoom;
    const rTop = rect.top / zoom, rBottom = rect.bottom / zoom, rLeft = rect.left / zoom, rRight = rect.right / zoom;
    const room: Record<TipSide, number> = {
      bottom: vh - MARGIN - (rBottom + TIP_GAP), top: (rTop - TIP_GAP) - MARGIN,
      right: vw - MARGIN - (rRight + TIP_GAP), left: (rLeft - TIP_GAP) - MARGIN,
    };
    const need = (s: TipSide) => (s === 'top' || s === 'bottom' ? h : w);
    const other = OPPOSITE[want];
    const side: TipSide = need(want) <= room[want] ? want : need(other) <= room[other] ? other : room[want] >= room[other] ? want : other;
    let left: number, top: number;
    if (side === 'top' || side === 'bottom') {
      left = cx - w / 2;
      top = side === 'bottom' ? rBottom + TIP_GAP : rTop - h - TIP_GAP;
    } else {
      left = side === 'right' ? rRight + TIP_GAP : rLeft - w - TIP_GAP;
      top = cy - h / 2;
    }
    if (left + w > vw - MARGIN) left = vw - MARGIN - w;
    if (left < MARGIN) left = MARGIN;
    if (top + h > vh - MARGIN) top = vh - MARGIN - h;
    if (top < MARGIN) top = MARGIN;
    const arrow = side === 'top' || side === 'bottom'
      ? Math.max(ARROW_INSET, Math.min(w - ARROW_INSET, cx - left))
      : Math.max(ARROW_INSET, Math.min(h - ARROW_INSET, cy - top));
    setPos(p => (p && p.left === left && p.top === top && p.side === side && p.arrow === arrow ? p : { left, top, side, arrow }));
  }, [rect, zoom, want, text]);

  const origin = !pos ? undefined
    : pos.side === 'bottom' ? `${pos.arrow}px top` : pos.side === 'top' ? `${pos.arrow}px bottom`
    : pos.side === 'right' ? `left ${pos.arrow}px` : `right ${pos.arrow}px`;
  const inClass = !pos ? '' : { bottom: 'k-tip-in-below', top: 'k-tip-in-above', right: 'k-tip-in-right', left: 'k-tip-in-left' }[pos.side];
  const arrowClass = !pos ? '' : { bottom: 'k-tip-arrow-top', top: 'k-tip-arrow-bottom', right: 'k-tip-arrow-left', left: 'k-tip-arrow-right' }[pos.side];
  const arrowStyle = !pos ? undefined : (pos.side === 'top' || pos.side === 'bottom') ? { left: pos.arrow } : { top: pos.arrow };

  return createPortal(
    <div
      ref={boxRef}
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos ? pos.left : -9999,
        top: pos ? pos.top : -9999,
        zIndex: TIP_Z,
        pointerEvents: 'none',
        visibility: pos ? undefined : 'hidden',
        transformOrigin: origin,
        ...(zoom !== 1 ? { zoom } : null),
      }}
      className={`k-tip ${pos ? inClass : ''}`}
    >
      {typeof text === 'string' ? <span className="k-tip-text">{text}</span> : text}
      {pos && <span aria-hidden className={`k-tip-arrow ${arrowClass}`} style={arrowStyle} />}
    </div>,
    document.body,
  );
};

const TIP_OUT_MS = 120;
const TIP_IN_MS = 150;
const TIP_DELAY_MS = 300;
type HoverTip = { id: number; el: Element; text: string; rect: DOMRect; zoom: number; side: TipSide };

function useTipHover(): { show: boolean; enter: (now?: boolean) => void; leave: () => void; closeNow: () => void } {
  const [show, setShow] = useState(false);
  const showing = useRef(false);
  const shownAt = useRef(0);
  const timer = useRef(0);
  const wait = useRef(0);
  const closeNow = useCallback(() => {
    window.clearTimeout(timer.current); timer.current = 0;
    window.clearTimeout(wait.current); wait.current = 0;
    showing.current = false; setShow(false);
  }, []);
  const enter = useCallback((now = false) => {
    window.clearTimeout(timer.current); timer.current = 0;
    if (showing.current || wait.current) return;
    const go = () => { wait.current = 0; showing.current = true; shownAt.current = performance.now(); setShow(true); };
    if (now) go(); else wait.current = window.setTimeout(go, TIP_DELAY_MS);
  }, []);
  const leave = useCallback(() => {
    if (wait.current) { window.clearTimeout(wait.current); wait.current = 0; return; }
    if (!showing.current || timer.current) return;
    const left = TIP_IN_MS - (performance.now() - shownAt.current);
    if (left <= 0) closeNow(); else timer.current = window.setTimeout(closeNow, left);
  }, [closeNow]);
  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(wait.current); }, []);
  return { show, enter, leave, closeNow };
}

function useTipHost(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  const cb = useRef(close); cb.current = close;
  useEffect(() => {
    if (!open) return;
    const off = onLeaveStart(box => { const el = ref.current; if (el && box.contains(el)) cb.current(); });
    let raf = 0;
    const at = ref.current?.getBoundingClientRect();
    const tick = () => {
      raf = 0;
      const el = ref.current;
      if (!el || !el.isConnected || el.closest('[inert]') || !hostShown(el, el.getBoundingClientRect(), at)) { cb.current(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { off(); if (raf) cancelAnimationFrame(raf); };
  }, [open, ref]);
}
const TIP_SELECTOR = '[title]:not([title=""]),[data-tip]:not([data-tip=""]),[data-k-tip-hold]';

function reactTitle(el: Element): { known: boolean; title?: string } {
  for (const k in el) {
    if (k.startsWith('__reactProps$')) {
      const p = (el as unknown as Record<string, Record<string, unknown> | undefined>)[k];
      if (p && 'title' in p) return { known: true, title: typeof p.title === 'string' ? p.title : undefined };
      return { known: false };
    }
  }
  return { known: false };
}
function tipTextOf(el: Element): string {
  const d = el.getAttribute('data-tip');
  if (d) return d;
  return el.getAttribute('title') || el.getAttribute('data-k-tip-hold') || '';
}
function liftTitle(el: Element) {
  const t = el.getAttribute('title');
  if (t) { el.setAttribute('data-k-tip-hold', t); el.removeAttribute('title'); }
}
function restoreTitle(el: Element) {
  const held = el.getAttribute('data-k-tip-hold');
  if (held === null) return;
  el.removeAttribute('data-k-tip-hold');
  if (el.hasAttribute('title')) return;
  const r = reactTitle(el);
  const t = r.known ? r.title : held;
  if (t) el.setAttribute('title', t);
}
function tipWords(el: Element, text: string): string {
  if (!text) return '';
  const own: string[] = [];
  if (el.matches(FADE_SELECTOR)) own.push((el.textContent || '').trim());
  const inner = el.querySelectorAll(FADE_SELECTOR);
  for (let i = 0; i < inner.length && i < 8; i++) own.push((inner[i].textContent || '').trim());
  const t = text.trim();
  for (const name of own) {
    if (!name) continue;
    if (t === name) return '';
    if (t.startsWith(name + '. ')) return t.slice(name.length + 2).trim();
  }
  return text;
}
function isTextSlide(target: EventTarget | null): boolean {
  return target instanceof Element && target.hasAttribute('data-kfade');
}
function hostShown(el: Element, r: DOMRect, at?: DOMRect): boolean {
  if (r.bottom <= 0 || r.right <= 0 || r.top >= window.innerHeight || r.left >= window.innerWidth) return false;
  if (at && (Math.abs(r.left - at.left) > 2 || Math.abs(r.top - at.top) > 2)) return false;
  const seen = (el as Element & { checkVisibility?: (o?: { visibilityProperty?: boolean }) => boolean }).checkVisibility;
  return !seen || seen.call(el, { visibilityProperty: true });
}
function sideOf(el: Element): TipSide {
  const s = el.closest('[data-tip-side]')?.getAttribute('data-tip-side');
  return s === 'bottom' || s === 'left' || s === 'right' ? s : 'top';
}

export const GlobalTips: React.FC = () => {
  const [tip, setTip] = useState<HoverTip | null>(null);
  const [gone, setGone] = useState<HoverTip[]>([]);
  const cur = useRef<HoverTip | null>(null);
  const muted = useRef<Element | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let watch: MutationObserver | null = null;
    let held: Element | null = null;
    const letGo = () => {
      if (!held) return;
      watch?.disconnect(); watch = null;
      restoreTitle(held);
      held = null;
    };
    let goneNow: HoverTip[] = [];
    const goneEnds = new Map<number, number>();
    const drop = (t: HoverTip) => {
      goneNow = [...goneNow, t]; setGone(goneNow);
      goneEnds.set(t.id, window.setTimeout(() => {
        goneEnds.delete(t.id);
        goneNow = goneNow.filter(x => x.id !== t.id); setGone(goneNow);
      }, TIP_OUT_MS));
    };
    let shownAt = 0;
    let waitFor: Element | null = null;
    let waitTimer = 0;
    const clearWait = () => { if (waitTimer) { window.clearTimeout(waitTimer); waitTimer = 0; } waitFor = null; };
    let pending = 0;
    const cancelPending = () => { if (pending) { window.clearTimeout(pending); pending = 0; } };
    let raf = 0;
    const watchHost = () => {
      raf = 0;
      const t = cur.current;
      if (!t) return;
      if (!t.el.isConnected) { hide(true); return; }
      if (t.el.closest('[inert]') || !hostShown(t.el, t.el.getBoundingClientRect(), t.rect)) { muted.current = t.el; hide(); return; }
      raf = requestAnimationFrame(watchHost);
    };
    const hide = (left = false) => {
      cancelPending();
      clearWait();
      const t = cur.current;
      if (left) letGo();
      if (!t) return;
      cur.current = null;
      setTip(null);
      drop(t);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const leave = () => {
      clearWait();
      if (!cur.current) { letGo(); return; }
      if (pending) return;
      const wait = TIP_IN_MS - (performance.now() - shownAt);
      if (wait <= 0) hide(true);
      else pending = window.setTimeout(() => { pending = 0; hide(true); }, wait);
    };
    const show = (el: Element, now = false) => {
      if (cur.current?.el === el) { cancelPending(); return; }
      if (waitFor === el) return;
      hide();
      if (held && held !== el) letGo();
      const text = tipWords(el, tipTextOf(el));
      if (held !== el) {
        liftTitle(el);
        held = el;
        watch = new MutationObserver(() => {
          if (held !== el) return;
          if (el.getAttribute('title') !== null) liftTitle(el);
          if (!cur.current || cur.current.el !== el) return;
          const nt = tipTextOf(el);
          if (nt === cur.current.text) return;
          const words = tipWords(el, nt);
          if (!words) { hide(); return; }
          const t = { ...cur.current, text: words };
          cur.current = t; setTip(t);
        });
        watch.observe(el, { attributes: true, attributeFilter: ['title', 'data-tip'] });
      }
      if (!text) return;
      if (!now) {
        waitFor = el;
        waitTimer = window.setTimeout(() => {
          waitTimer = 0; waitFor = null;
          if (held !== el || !el.isConnected) return;
          const words = tipWords(el, tipTextOf(el));
          if (words) draw(el, words);
        }, TIP_DELAY_MS);
        return;
      }
      draw(el, text);
    };
    const draw = (el: Element, text: string) => {
      const rect = el.getBoundingClientRect();
      if (!hostShown(el, rect)) return;
      const back = goneNow.find(g => g.el === el);
      if (back) {
        window.clearTimeout(goneEnds.get(back.id)); goneEnds.delete(back.id);
        goneNow = goneNow.filter(g => g !== back); setGone(goneNow);
      }
      const t: HoverTip = { id: back ? back.id : ++seq.current, el, text, rect, zoom: getVisualScale(el) || 1, side: sideOf(el) };
      cur.current = t;
      shownAt = performance.now();
      setTip(t);
      if (!raf) raf = requestAnimationFrame(watchHost);
    };
    const offLeave = onLeaveStart(box => {
      const t = cur.current;
      if (t && box.contains(t.el)) { muted.current = t.el; hide(); }
    });
    const anchorOf = (target: EventTarget | null): Element | null => {
      if (!(target instanceof Element)) return null;
      if (target.closest('[data-k-own-tip]')) return null;
      const a = target.closest(TIP_SELECTOR);
      if (!a || a.closest('[data-tip-native]')) return null;
      return a;
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (cur.current && !cur.current.el.isConnected) hide(true);
      if (held && !held.isConnected) letGo();
      const a = anchorOf(e.target);
      if (a === muted.current) return;
      muted.current = null;
      if (a) show(a); else leave();
    };
    const onOut = (e: PointerEvent) => {
      const to = e.relatedTarget as Node | null;
      if (muted.current && !(to && muted.current.contains(to))) muted.current = null;
      const el = cur.current?.el ?? held;
      if (el && !(to && el.contains(to))) leave();
    };
    const onDown = () => { clearWait(); if (cur.current) { muted.current = cur.current.el; hide(); } };
    const onScroll = (e: Event) => { if (!isTextSlide(e.target)) hide(); };
    const onWheel = () => hide();
    const onWindowBlur = () => hide(true);
    const onZoom = () => hide();
    const onFocus = (e: FocusEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el || !el.matches(':focus-visible')) return;
      const a = anchorOf(el);
      if (a === el && a !== muted.current) show(a, true);
    };
    const onBlur = (e: FocusEvent) => { if (cur.current && cur.current.el === e.target) hide(); };
    const opts = { capture: true, passive: true } as const;
    document.addEventListener('pointerover', onOver, opts);
    document.addEventListener('pointerout', onOut, opts);
    document.addEventListener('pointerdown', onDown, opts);
    document.addEventListener('scroll', onScroll, opts);
    document.addEventListener('wheel', onWheel, opts);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('focusout', onBlur, true);
    window.addEventListener('blur', onWindowBlur);
    const offZoom = onZoomChange(onZoom);
    return () => {
      hide(true);
      offLeave();
      goneEnds.forEach(id => window.clearTimeout(id));
      document.removeEventListener('pointerover', onOver, opts);
      document.removeEventListener('pointerout', onOut, opts);
      document.removeEventListener('pointerdown', onDown, opts);
      document.removeEventListener('scroll', onScroll, opts);
      document.removeEventListener('wheel', onWheel, opts);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('focusout', onBlur, true);
      window.removeEventListener('blur', onWindowBlur);
      offZoom();
    };
  }, []);

  const all = tip ? [...gone, tip] : gone;
  return (
    <>
      {all.map(t => <TooltipPopup key={t.id} text={t.text} rect={t.rect} zoom={t.zoom} position={t.side} leaving={t !== tip} />)}
    </>
  );
};

export const HelpTooltip: React.FC<{
  text: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ text, icon }) => {
  const hover = useTipHover();
  const show = hover.show;
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [zoom, setZoom] = useState(1);

  const place = useCallback(() => {
    if (!ref.current) return false;
    setRect(ref.current.getBoundingClientRect());
    setZoom(getVisualScale(ref.current) || 1);
    return true;
  }, []);
  const { enter, leave, closeNow } = hover;
  const setShow = useCallback((v: boolean) => { if (v) enter(); else closeNow(); }, [enter, closeNow]);
  const onEnter = useCallback(() => { if (place()) enter(); }, [place, enter]);
  const onFocusIn = useCallback(() => { if (place()) enter(true); }, [place, enter]);
  const onLeave = leave;
  const onTap = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPinned(p => { const n = !p; if (n) place(); return n; });
  }, [place]);
  const unpin = useCallback(() => { setPinned(false); setShow(false); }, []);
  useEscapeOwner(unpin, pinned);

  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setPinned(false); };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [pinned]);
  useEffect(() => {
    if (!pinned) return;
    return toolStore.subscribe(() => { setPinned(false); setShow(false); });
  }, [pinned]);

  const open = show || pinned;
  const tipStage = useMenuStage<'tip'>(open ? 'tip' : null);
  useTipHost(ref, open, () => { setPinned(false); closeNow(); });

  useEffect(() => {
    if (!open) return;
    return onZoomChange(() => { setShow(false); setPinned(false); });
  }, [open, setShow]);

  return (
    <span ref={ref} data-k-own-tip className="k-ico inline-flex items-center align-middle pointer-events-auto" onMouseEnter={onEnter} onMouseLeave={onLeave}
      onClick={onTap} onFocus={onFocusIn} onBlur={onLeave} tabIndex={0} role="button" aria-label="Help" aria-expanded={open}>
      <span className="k-ico-art w-[14px] h-[14px] flex items-center justify-center cursor-help shrink-0 select-none text-[var(--k-help-ink)] hover:text-[var(--text-secondary)] transition-colors">{icon ?? <HelpBubble size={14} />}</span>
      {tipStage.shown && rect && <TooltipPopup text={text} rect={rect} zoom={zoom} position="below" leaving={tipStage.leaving} />}
    </span>
  );
};

export const ButtonTooltip: React.FC<{ text: string; children: React.ReactNode; fit?: boolean }> = ({ text, children, fit }) => {
  const { show, enter, leave, closeNow } = useTipHover();
  const ref = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [zoom, setZoom] = useState(1);

  const onEnter = useCallback(() => {
    if (ref.current) {
      setRect(ref.current.getBoundingClientRect());
      setZoom(getVisualScale(ref.current) || 1);
      enter();
    }
  }, [enter]);
  const onLeave = leave;
  const tipStage = useMenuStage<'tip'>(show ? 'tip' : null);
  useTipHost(ref, show, closeNow);

  useEffect(() => {
    if (!show) return;
    return onZoomChange(closeNow);
  }, [show, closeNow]);

  return (
    <span ref={ref} data-k-own-tip className={fit ? "inline-flex" : "inline-flex w-full"} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
      {tipStage.shown && rect && <TooltipPopup text={text} rect={rect} zoom={zoom} position="above" leaving={tipStage.leaving} />}
    </span>
  );
};
