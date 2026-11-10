import { lbCurveLeft } from '../../utils/lbAnim';

export const CARD_FADE_MS = 105;
const SNAP_PX = 0.01;
const STANDS_PX = 3;

export interface CardPlace<T> { x: number; y: number; h: number; data: T }
export interface MovingCard<T> {
  key: string;
  data: T;
  role: 'stay' | 'leave' | 'enter';
  rx: number; ry: number;
  cx: number; cy: number;
  f: number; alpha: number;
}
export interface CardMotion<T> { last: number; hold: number; cards: MovingCard<T>[] }

const _shown = (f: number) => f * f * (3 - 2 * f);
const _inBand = (y: number, h: number, top: number, vh: number, margin: number) => y + h > top - margin && y < top + vh + margin;

export function planCardMotion<T>(
  before: ReadonlyMap<string, CardPlace<T>>, after: ReadonlyMap<string, CardPlace<T>>,
  yOld: number, yNew: number, vh: number, margin: number, cur: CardMotion<T> | null, now: number, holdMs: number = 0,
): CardMotion<T> | null {
  const shift = yNew - yOld;
  const curBy = new Map<string, MovingCard<T>>();
  if (cur) for (const c of cur.cards) curBy.set(c.key, c);
  const keys = new Set<string>();
  for (const [k, p] of before) if (_inBand(p.y, p.h, yOld, vh, margin)) keys.add(k);
  for (const [k, p] of after) if (_inBand(p.y, p.h, yNew, vh, margin)) keys.add(k);
  for (const k of curBy.keys()) keys.add(k);
  const cards: MovingCard<T>[] = [];
  let change = false;
  for (const k of keys) {
    const c = curBy.get(k), o = before.get(k), n = after.get(k);
    let shown: boolean, dx = 0, dy = 0, f = 0, h = 0, data: T | null = null;
    if (c) { shown = c.f > 0; dx = c.cx; dy = c.cy + shift; f = c.f; data = c.data; h = n ? n.h : o ? o.h : 0; }
    else if (o && _inBand(o.y, o.h, yOld, vh, margin)) { shown = true; dx = o.x; dy = o.y + shift; f = 1; data = o.data; h = o.h; }
    else shown = false;
    const inNew = !!n && _inBand(n.y, n.h, yNew, vh, margin);
    if (shown && inNew) {
      cards.push({ key: k, data: n!.data, role: 'stay', rx: n!.x, ry: n!.y, cx: dx, cy: dy, f, alpha: _shown(f) });
      if (Math.abs(n!.x - dx) > 0.5 || Math.abs(n!.y - dy) > 0.5 || f < 1) change = true;
    } else if (shown) {
      cards.push({ key: k, data: data!, role: 'leave', rx: dx, ry: dy, cx: dx, cy: dy, f, alpha: _shown(f) });
      if (_inBand(dy, h, yNew, vh, 0)) change = true;
    } else if (inNew) {
      const f0 = c ? c.f : 0;
      cards.push({ key: k, data: n!.data, role: 'enter', rx: n!.x, ry: n!.y, cx: n!.x, cy: n!.y, f: f0, alpha: _shown(f0) });
      if (_inBand(n!.y, n!.h, yNew, vh, 0)) change = true;
    }
  }
  if (!change && !cur) return null;
  return { last: now, hold: Math.max(now + holdMs, cur ? cur.hold : 0), cards };
}

export function stepCardMotion<T>(m: CardMotion<T>, now: number): boolean {
  const dt = now > m.last ? now - m.last : 0;
  if (now > m.last) m.last = now;
  const df = dt / CARD_FADE_MS;
  const cards = m.cards;
  let out = false, moving = false, stands = true, fading = false;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (c.role !== 'leave' || c.f <= 0) continue;
    c.f = c.f > df ? c.f - df : 0;
    if (c.f > 0) out = true;
  }
  if (now < m.hold) out = true;
  if (!out) {
    const k = lbCurveLeft(dt / 1000);
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (c.role === 'leave' || (c.cx === c.rx && c.cy === c.ry)) continue;
      const gx = (c.cx - c.rx) * k, gy = (c.cy - c.ry) * k;
      if (Math.abs(gx) < SNAP_PX && Math.abs(gy) < SNAP_PX) { c.cx = c.rx; c.cy = c.ry; continue; }
      c.cx = c.rx + gx; c.cy = c.ry + gy;
      moving = true;
      if (Math.abs(gx) > STANDS_PX || Math.abs(gy) > STANDS_PX) stands = false;
    }
    if (stands) {
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (c.role === 'leave' || c.f >= 1) continue;
        c.f = c.f + df < 1 ? c.f + df : 1;
        if (c.f < 1) fading = true;
      }
    } else {
      for (let i = 0; i < cards.length; i++) if (cards[i].role !== 'leave' && cards[i].f < 1) { fading = true; break; }
    }
  }
  for (let i = 0; i < cards.length; i++) cards[i].alpha = _shown(cards[i].f);
  return out || moving || fading;
}
