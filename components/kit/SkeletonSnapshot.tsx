import React, { useEffect, useMemo } from 'react';

const TEXT = 0, BLOCK = 1, CARD = 2;
interface Snap { v: 2; w: number; h: number; b: number[] }
const STORE = 'istrong_skel2:';
const OLD_STORES = ['istrong_skel1:'];
const MAX_BOXES = 320;
const mem = new Map<string, Snap | null>();
const masks = new Map<string, string>();

const radiusOf = (cs: CSSStyleDeclaration) => Math.min(999, Math.round(parseFloat(cs.borderTopLeftRadius) || 0));

function readSnap(id: string): Snap | null {
  if (mem.has(id)) return mem.get(id) ?? null;
  let s: Snap | null = null;
  try { const raw = localStorage.getItem(STORE + id); if (raw) { const p = JSON.parse(raw); if (p && p.v === 2 && Array.isArray(p.b)) s = p as Snap; } } catch { }
  mem.set(id, s);
  return s;
}

export function snapshotOf(id: string): Snap | null { return readSnap(id); }

const CARD_SEL = '.k-group, .k-info-card, .k-skel-card, .k-mode-card, .k-card';
const BLOCK_SEL = 'input:not([type=hidden]), textarea, select, [role=switch], .toggle-ios, .k-select-trigger, .k-stepper, .k-seg, canvas, img, svg, video, .k-badge, .k-count, .k-chip, .k-kbd, kbd, .k-swatch';
const PRESS_SEL = 'button, [role=button], [role=tab]';

function visible(el: Element, hidden?: boolean): boolean {
  const cv = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  return cv ? cv.call(el, { checkOpacity: !hidden, checkVisibilityCSS: true }) : el.getClientRects().length > 0;
}

const clearColour = (c: string) => c === 'transparent' || /rgba([^)]*,s*0(.0+)?)$/.test(c);
function showsBox(cs: CSSStyleDeclaration, el: Element): boolean {
  if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && !clearColour(cs.borderTopColor)) return true;
  if (cs.boxShadow && cs.boxShadow !== 'none') return true;
  return !clearColour(cs.backgroundColor) && !el.matches(':hover');
}

export function captureSkeleton(id: string, root: HTMLElement, maxH?: number, hidden?: boolean): void {
  if (!root.isConnected || (!hidden && !visible(root))) return;
  const rr = root.getBoundingClientRect();
  const scale = root.offsetWidth > 0 ? rr.width / root.offsetWidth : 1;
  if (!(scale > 0) || rr.width <= 0) return;
  const W = root.offsetWidth, H = Math.min(maxH ?? root.clientHeight, 4000);
  const b: number[] = [];
  const push = (r: DOMRect, kind: number, rad: number) => {
    let x = (r.left - rr.left) / scale, y = (r.top - rr.top) / scale, w = r.width / scale, h = r.height / scale;
    if (w < 2 || h < 2 || y > H || y + h < 0 || x > W || x + w < 0) return;
    if (kind === TEXT) { const th = Math.max(6, Math.min(h * 0.62, 14)); y += (h - th) / 2; h = th; }
    else if (kind === BLOCK && w >= 12 && h >= 12) { x += 1; y += 1; w -= 2; h -= 2; }
    b.push(Math.round(x), Math.round(y), Math.round(w), Math.round(h), kind, rad);
  };
  const range = document.createRange();
  const walk = (el: Element) => {
    if (b.length >= MAX_BOXES * 6) return;
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        if (!(n.nodeValue && n.nodeValue.trim())) continue;
        range.selectNodeContents(n);
        const rs = range.getClientRects();
        for (let i = 0; i < rs.length; i++) push(rs[i], TEXT, 4);
        continue;
      }
      if (n.nodeType !== 1) continue;
      const c = n as Element;
      if (c.getAttribute('aria-hidden') === 'true' && !(c instanceof SVGElement)) continue;
      const rects = c.getClientRects();
      if (rects.length === 0) { if (getComputedStyle(c).display === 'contents') walk(c); continue; }
      const r = c.getBoundingClientRect();
      if ((r.top - rr.top) / scale > H) continue;
      if (!visible(c, hidden)) continue;
      if (hidden && !(c instanceof SVGElement) && getComputedStyle(c).opacity === '0') continue;
      if (c.matches('input[type=range]')) { const t = new DOMRect(r.left, r.top + r.height / 2 - 3 * scale, r.width, 6 * scale); push(t, BLOCK, 3); continue; }
      if (c.matches(CARD_SEL)) {
        if (!c.parentElement?.closest('.k-group, .k-info-card')) push(r, CARD, 14);
        walk(c);
        continue;
      }
      if (c.matches(BLOCK_SEL)) {
        const round = c.matches('[role=switch], .toggle-ios, .k-badge, .k-count, .k-chip') ? 999 : c instanceof SVGElement ? 4 : radiusOf(getComputedStyle(c));
        push(r, BLOCK, round);
        continue;
      }
      if (c.matches(PRESS_SEL)) {
        const cs = getComputedStyle(c);
        if (showsBox(cs, c)) push(r, BLOCK, radiusOf(cs)); else walk(c);
        continue;
      }
      walk(c);
    }
  };
  walk(root);
  if (b.length === 0) return;
  const snap: Snap = { v: 2, w: Math.round(W), h: Math.round(H), b };
  mem.set(id, snap);
  masks.delete(id);
  keep(id, snap);
}

const KEPT_MAX = 48;
let oldCleared = false;
function keep(id: string, snap: Snap): void {
  try {
    if (!oldCleared) {
      oldCleared = true;
      for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && OLD_STORES.some(o => k.startsWith(o))) localStorage.removeItem(k); }
    }
    let names: string[] = [];
    try { const raw = localStorage.getItem(STORE + '#order'); const p = raw ? JSON.parse(raw) : null; if (Array.isArray(p)) names = p.filter(n => typeof n === 'string'); } catch { }
    names = names.filter(n => n !== id);
    names.push(id);
    while (names.length > KEPT_MAX) localStorage.removeItem(STORE + names.shift());
    localStorage.setItem(STORE + id, JSON.stringify(snap));
    localStorage.setItem(STORE + '#order', JSON.stringify(names));
  } catch { }
}

export function useSkeletonCapture(id: string | null, ref: React.RefObject<HTMLElement | null>, when: boolean, maxH?: () => number): void {
  useEffect(() => {
    if (!id || !when) return;
    const el = ref.current;
    if (!el) return;
    let t = 0, idle = 0;
    const ric: (cb: () => void) => number = typeof requestIdleCallback === 'function'
      ? (cb) => requestIdleCallback(cb, { timeout: 2000 }) : (cb) => window.setTimeout(cb, 0);
    const cancelIdle = (h: number) => { if (typeof cancelIdleCallback === 'function') cancelIdleCallback(h); else window.clearTimeout(h); };
    const later = (ms: number) => {
      window.clearTimeout(t); if (idle) cancelIdle(idle);
      t = window.setTimeout(() => { idle = ric(() => { idle = 0; const r = ref.current; if (r) captureSkeleton(id, r, maxH ? maxH() : undefined); }); }, ms);
    };
    later(700);
    const onUp = () => later(1500);
    el.addEventListener('pointerup', onUp);
    return () => { window.clearTimeout(t); if (idle) cancelIdle(idle); el.removeEventListener('pointerup', onUp); };
  }, [id, when, ref, maxH]);
}

function maskOf(id: string, s: Snap): string {
  let m = masks.get(id);
  if (m) return m;
  let r = '';
  for (let i = 0; i < s.b.length; i += 6) {
    if (s.b[i + 4] === CARD) continue;
    r += `<rect x="${s.b[i]}" y="${s.b[i + 1]}" width="${s.b[i + 2]}" height="${s.b[i + 3]}" rx="${Math.min(s.b[i + 5], s.b[i + 3] / 2)}"/>`;
  }
  m = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}" preserveAspectRatio="none">${r}</svg>`)}")`;
  masks.set(id, m);
  return m;
}

export function SnapshotSkeleton({ id, fallback, width, className }: { id: string | null; fallback: React.ReactNode; width?: number; className?: string }) {
  const snap = id ? readSnap(id) : null;
  const sx = snap && width && width > 0 ? width / snap.w : 1;
  const usable = !!snap && sx > 0.75 && sx < 1.33;
  const nodes = useMemo(() => {
    if (!snap || !usable) return null;
    const out: React.ReactNode[] = [];
    for (let i = 0; i < snap.b.length; i += 6) {
      if (snap.b[i + 4] !== CARD) continue;
      out.push(<div key={i} className="k-snap-card" style={{ left: snap.b[i] * sx, top: snap.b[i + 1], width: snap.b[i + 2] * sx, height: snap.b[i + 3], borderRadius: Math.min(snap.b[i + 5], snap.b[i + 3] / 2) }} />);
    }
    return out;
  }, [snap, usable, sx]);
  if (!snap || !usable || !nodes) return <>{fallback}</>;
  const mask = maskOf(id!, snap);
  return (
    <div className={className ? `k-snap ${className}` : 'k-snap'} style={{ height: snap.h }} aria-hidden>
      {nodes}
      <div className="k-snap-boxes" style={{ WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' }} />
      <div className="k-snap-sweep" style={{ WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' }} />
    </div>
  );
}
