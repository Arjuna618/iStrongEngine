import React, { useEffect, useMemo } from 'react';
import { uiThemeId } from '../../utils/uiTheme';
import { joinTextRuns } from './skeletonLines';

const TEXT = 0, BLOCK = 1;
interface Snap { v: 5; w: number; h: number; b: number[]; s: number[]; p: string[] }
const S_LEN = 11;
const STORE = 'istrong_skel5:';
const OLD_STORES = ['istrong_skel1:', 'istrong_skel2:', 'istrong_skel3:', 'istrong_skel4:'];
const MAX_BOXES = 360;
const MAX_SURFACES = 260;
const mem = new Map<string, Snap | null>();
const pics = new Map<string, { surf: string; mask: string }>();

const radiusOf = (cs: CSSStyleDeclaration) => Math.min(999, Math.round(parseFloat(cs.borderTopLeftRadius) || 0));

const classicNow = () => uiThemeId() === 'classic';
const darkNow = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
const themed = (id: string) => (classicNow() ? 'classic:' : '') + (darkNow() ? 'dark:' : '') + id;

function readSnap(idIn: string): Snap | null {
  const id = themed(idIn);
  if (mem.has(id)) return mem.get(id) ?? null;
  let s: Snap | null = null;
  try { const raw = localStorage.getItem(STORE + id); if (raw) { const p = JSON.parse(raw); if (p && p.v === 5 && Array.isArray(p.b) && Array.isArray(p.s) && Array.isArray(p.p)) s = p as Snap; } } catch { }
  mem.set(id, s);
  return s;
}

export function snapshotOf(id: string): Snap | null { return readSnap(id); }

const LEAF_SEL = 'input:not([type=hidden]), textarea, select, [role=switch], .toggle-ios, .k-select-trigger, .k-stepper, .k-seg, .k-badge, .k-count, .k-chip, .k-kbd, kbd, .k-swatch';
const BLOCK_SEL = 'canvas, img, svg, video';

function visible(el: Element, hidden?: boolean): boolean {
  const cv = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  return cv ? cv.call(el, { checkOpacity: !hidden, checkVisibilityCSS: true }) : el.getClientRects().length > 0;
}

const clearColour = (c: string) => !c || c === 'transparent' || /rgba\([^)]*,\s*0(\.0+)?\)$/.test(c) || /\/\s*0(\.0+)?\)$/.test(c);
const TWO_BANDS = /^linear-gradient\((rgba?\([^)]*\)|color\([^)]*\))\s+([\d.]+)%,\s*(rgba?\([^)]*\)|color\([^)]*\))\s+([\d.]+)%\)$/;

export function captureSkeleton(idIn: string, root: HTMLElement, maxH?: number, hidden?: boolean): void {
  const id = themed(idIn);
  if (!root.isConnected || (!hidden && !visible(root))) return;
  const rr = root.getBoundingClientRect();
  const scale = root.offsetWidth > 0 ? rr.width / root.offsetWidth : 1;
  if (!(scale > 0) || rr.width <= 0) return;
  const W = root.offsetWidth, H = Math.min(maxH ?? root.clientHeight, 4000);
  const b: number[] = [];
  const s: number[] = [];
  const p: string[] = [];
  const paint = (v: string): number => { let i = p.indexOf(v); if (i < 0) { i = p.length; p.push(v); } return i; };
  const local = (r: DOMRect): [number, number, number, number] | null => {
    let x = (r.left - rr.left) / scale, y = (r.top - rr.top) / scale;
    const w = r.width / scale; let h = r.height / scale;
    if (w < 2 || h < 2 || y > H || y + h < 0 || x > W || x + w < 0) return null;
    if (y < 0) { h += y; y = 0; }
    if (y + h > H) h = H - y;
    if (x < 0) x = 0;
    return [x, y, w, h];
  };
  const tq: number[] = [];
  const bq: number[] = [];
  const content = (r: DOMRect, kind: number, rad: number) => {
    if (tq.length / 4 + bq.length / 5 >= MAX_BOXES * 2) return;
    const q = local(r);
    if (!q) return;
    if (kind === TEXT) tq.push(q[0], q[1], q[2], q[3]);
    else bq.push(q[0], q[1], q[2], q[3], rad);
  };
  const surface = (el: Element, r: DOMRect, cs: CSSStyleDeclaration): boolean => {
    if (s.length >= MAX_SURFACES * S_LEN) return false;
    const bt = parseFloat(cs.borderTopWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0, bl = parseFloat(cs.borderLeftWidth) || 0;
    const edgeColour = bt > 0 && cs.borderTopStyle !== 'none' && !clearColour(cs.borderTopColor) ? cs.borderTopColor
      : bb > 0 && cs.borderBottomStyle !== 'none' && !clearColour(cs.borderBottomColor) ? cs.borderBottomColor
      : bl > 0 && cs.borderLeftStyle !== 'none' && !clearColour(cs.borderLeftColor) ? cs.borderLeftColor
      : br > 0 && cs.borderRightStyle !== 'none' && !clearColour(cs.borderRightColor) ? cs.borderRightColor : '';
    const bands = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage.match(TWO_BANDS) : null;
    const fill = bands ? `g:${bands[1]}|${bands[3]}|${bands[2]}` : !clearColour(cs.backgroundColor) && !(el as HTMLElement).matches?.(':hover') ? cs.backgroundColor : '';
    if (!fill && !edgeColour) return false;
    if (r.width / scale >= W * 0.98 && r.height / scale >= H * 0.9) return false;
    const q = local(r);
    if (!q) return false;
    s.push(Math.round(q[0]), Math.round(q[1]), Math.round(q[2]), Math.round(q[3]), radiusOf(cs), fill ? paint(fill) : -1, edgeColour ? paint(edgeColour) : -1,
      +bt.toFixed(2), +br.toFixed(2), +bb.toFixed(2), +bl.toFixed(2));
    return true;
  };
  const rootCs = classicNow() ? getComputedStyle(document.documentElement) : null;
  const trackWhite = rootCs ? rootCs.getPropertyValue('--kc-white').trim() : '', trackInk = rootCs ? rootCs.getPropertyValue('--kc-ink').trim() : '';
  const classicTrack = rootCs && trackWhite && trackInk ? { white: trackWhite, ink: trackInk, edge: parseFloat(rootCs.getPropertyValue('--kc-edge')) || 3 } : null;
  const range = document.createRange();
  const walk = (el: Element) => {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        if (!(n.nodeValue && n.nodeValue.trim())) continue;
        range.selectNodeContents(n);
        const rs = range.getClientRects();
        for (let i = 0; i < rs.length; i++) content(rs[i], TEXT, 4);
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
      const cs = getComputedStyle(c);
      if (hidden && !(c instanceof SVGElement) && cs.opacity === '0') continue;
      if (c.matches(BLOCK_SEL)) { content(r, BLOCK, c instanceof SVGElement ? 4 : radiusOf(cs)); continue; }
      if (c.matches('input[type=range]')) {
        if (classicTrack) { const q = local(new DOMRect(r.left, r.top + r.height / 2 - 8 * scale, r.width, 16 * scale)); if (q && s.length < MAX_SURFACES * S_LEN) { const e = classicTrack.edge; s.push(Math.round(q[0]), Math.round(q[1]), Math.round(q[2]), Math.round(q[3]), 0, paint(classicTrack.white), paint(classicTrack.ink), e, e, e, e); } }
        else content(new DOMRect(r.left, r.top + r.height / 2 - 3 * scale, r.width, 6 * scale), BLOCK, 3);
        continue;
      }
      const drew = surface(c, r, cs);
      if (c.matches(LEAF_SEL)) {
        if (!drew && !c.matches('input, textarea, select')) content(r, BLOCK, c.matches('[role=switch], .toggle-ios, .k-badge, .k-count, .k-chip') ? 999 : radiusOf(cs));
        if (c.matches('[role=switch], .toggle-ios')) for (let k = c.firstElementChild; k; k = k.nextElementSibling) { const kr = k.getBoundingClientRect(); const kc = getComputedStyle(k); if (kr.width > 2) surface(k, kr, kc); }
        continue;
      }
      walk(c);
    }
  };
  walk(root);
  const items: number[] = [];
  const lines = joinTextRuns(tq);
  for (let i = 0; i < lines.length; i += 4) {
    const h = lines[i + 3], th = Math.max(6, Math.min(h * 0.62, 14));
    items.push(lines[i], lines[i + 1] + (h - th) / 2, lines[i + 2], th, TEXT, 4);
  }
  for (let i = 0; i < bq.length; i += 5) items.push(bq[i], bq[i + 1], bq[i + 2], bq[i + 3], BLOCK, bq[i + 4]);
  const byTop: number[] = [];
  for (let i = 0; i < items.length; i += 6) byTop.push(i);
  byTop.sort((a, c) => items[a + 1] - items[c + 1]);
  for (const i of byTop) {
    if (b.length >= MAX_BOXES * 6) break;
    const x0 = Math.round(items[i]), y0 = Math.round(items[i + 1]), x1 = Math.round(items[i] + items[i + 2]), y1 = Math.round(items[i + 1] + items[i + 3]);
    if (x1 > x0 && y1 > y0) b.push(x0, y0, x1 - x0, y1 - y0, items[i + 4], items[i + 5]);
  }
  if (b.length === 0 && s.length === 0) return;
  const snap: Snap = { v: 5, w: Math.round(W), h: Math.round(H), b, s, p };
  mem.set(id, snap);
  pics.delete(id);
  keep(id, snap);
}

const KEPT_MAX = 32;
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

const esc = (v: string) => v.replace(/"/g, "'");
function picsOf(idIn: string, snap: Snap): { surf: string; mask: string } {
  const id = themed(idIn);
  const have = pics.get(id);
  if (have) return have;
  const classic = classicNow();
  let defs = '', body = '';
  const gradIds = new Map<number, string>();
  const fillOf = (i: number): string => {
    const v = snap.p[i];
    if (!v.startsWith('g:')) return esc(v);
    let g = gradIds.get(i);
    if (!g) {
      g = 'g' + i; gradIds.set(i, g);
      const [top, bottom, stop] = v.slice(2).split('|');
      const o = Math.max(0, Math.min(100, parseFloat(stop) || 50)) / 100;
      defs += `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(top)}"/><stop offset="${o}" stop-color="${esc(top)}"/><stop offset="${o}" stop-color="${esc(bottom)}"/><stop offset="1" stop-color="${esc(bottom)}"/></linearGradient>`;
    }
    return `url(#${g})`;
  };
  const S = snap.s;
  for (let i = 0; i < S.length; i += S_LEN) {
    const x = S[i], y = S[i + 1], w = S[i + 2], h = S[i + 3], r = Math.min(S[i + 4], h / 2, w / 2), f = S[i + 5], e = S[i + 6];
    const bt = S[i + 7], br = S[i + 8], bb = S[i + 9], bl = S[i + 10];
    if (f >= 0) body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fillOf(f)}"/>`;
    if (e < 0) continue;
    const ec = esc(snap.p[e]);
    if (bt > 0 && bt === br && bt === bb && bt === bl) {
      body += `<rect x="${x + bt / 2}" y="${y + bt / 2}" width="${Math.max(0, w - bt)}" height="${Math.max(0, h - bt)}" rx="${Math.max(0, r - bt / 2)}" fill="none" stroke="${ec}" stroke-width="${bt}"/>`;
    } else {
      if (bt > 0) body += `<rect x="${x}" y="${y}" width="${w}" height="${bt}" fill="${ec}"/>`;
      if (bb > 0) body += `<rect x="${x}" y="${y + h - bb}" width="${w}" height="${bb}" fill="${ec}"/>`;
      if (bl > 0) body += `<rect x="${x}" y="${y}" width="${bl}" height="${h}" fill="${ec}"/>`;
      if (br > 0) body += `<rect x="${x + w - br}" y="${y}" width="${br}" height="${h}" fill="${ec}"/>`;
    }
  }
  const svg = (inner: string) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${snap.w}" height="${snap.h}" viewBox="0 0 ${snap.w} ${snap.h}" preserveAspectRatio="none">${inner}</svg>`)}")`;
  let m = '';
  const B = snap.b;
  for (let i = 0; i < B.length; i += 6) m += `<rect x="${B[i]}" y="${B[i + 1]}" width="${B[i + 2]}" height="${B[i + 3]}" rx="${classic ? 0 : Math.min(B[i + 5], B[i + 3] / 2)}"/>`;
  const out = { surf: body ? svg((defs ? `<defs>${defs}</defs>` : '') + body) : '', mask: m ? svg(m) : '' };
  pics.set(id, out);
  return out;
}

const masked = (m: string): React.CSSProperties => ({ WebkitMaskImage: m, maskImage: m, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' });

export function SnapshotSkeleton({ id, fallback, width, className }: { id: string | null; fallback: React.ReactNode; width?: number; className?: string }) {
  const snap = id ? readSnap(id) : null;
  const sx = snap && width && width > 0 ? width / snap.w : 1;
  const usable = !!snap && sx > 0.75 && sx < 1.33;
  const p = useMemo(() => (snap && usable && id ? picsOf(id, snap) : null), [snap, usable, id]);
  if (!snap || !usable || !p) return <>{fallback}</>;
  return (
    <div className={className ? `k-snap ${className}` : 'k-snap'} style={{ height: snap.h }} aria-hidden>
      {p.surf && <div className="k-snap-surf" style={{ backgroundImage: p.surf }} />}
      {p.mask && <div className="k-snap-boxes" style={masked(p.mask)} />}
      {p.mask && <div className="k-snap-sweep" style={masked(p.mask)} />}
    </div>
  );
}
