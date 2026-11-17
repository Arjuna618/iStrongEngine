import React from 'react';

export interface GlideBox { left: number; top: number; width: number; height: number }

export const GlideSvg = React.forwardRef<SVGSVGElement, { className: string }>(({ className }, ref) => (
  <svg ref={ref} className={`k-glide-svg ${className}`} aria-hidden="true" focusable="false">
    <rect className="kg-fill" />
    <rect className="kg-low" />
    <rect className="kg-edge" />
  </svg>
));
GlideSvg.displayName = 'GlideSvg';

function scaleOf(svg: SVGSVGElement): number {
  const st = svg.style;
  if (!st.left) { st.left = '0px'; st.top = '0px'; }
  if (!(_num(st.width) > 0)) { st.width = '100px'; st.height = '10px'; }
  const b = svg.getBoundingClientRect(), w = _num(st.width);
  return w > 0 && b.width > 0 ? b.width / w : 1;
}

export function glideBoxOf(svg: SVGSVGElement, el: HTMLElement): GlideBox {
  const k = scaleOf(svg), s = svg.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { left: _num(svg.style.left) + (r.left - s.left) / k, top: _num(svg.style.top) + (r.top - s.top) / k, width: r.width / k, height: r.height / k };
}

export const glideBoxKey = (b: GlideBox): string => `${b.left.toFixed(3)},${b.top.toFixed(3)},${b.width.toFixed(3)},${b.height.toFixed(3)}`;

const _onEnd = new WeakMap<SVGSVGElement, (() => void) | null>();
const _guard = new WeakMap<SVGSVGElement, number>();
const _listening = new WeakSet<SVGSVGElement>();
const GUARD_MS = 60000;
function stillMoving(svg: SVGSVGElement): boolean {
  if (typeof svg.getAnimations !== 'function') return false;
  return svg.getAnimations({ subtree: true }).some(a => (a.playState === 'running' || a.pending) && a instanceof CSSTransition && a.transitionProperty !== 'opacity');
}
function endGlide(svg: SVGSVGElement, run: boolean): void {
  window.clearTimeout(_guard.get(svg));
  _guard.delete(svg);
  svg.classList.remove('kg-moving');
  const f = _onEnd.get(svg) ?? null;
  _onEnd.delete(svg);
  if (run && f) f();
}
function listen(svg: SVGSVGElement): void {
  if (_listening.has(svg)) return;
  _listening.add(svg);
  const check = () => { if (svg.classList.contains('kg-moving') && !stillMoving(svg)) endGlide(svg, true); };
  svg.addEventListener('transitionend', check);
  svg.addEventListener('transitioncancel', check);
}

const _len = (v: number) => `${Math.round(v * 10000) / 10000}px`;
function setRect(el: Element | null | undefined, x: number, y: number, w: number, h: number): void {
  if (!el) return;
  const st = (el as SVGRectElement).style;
  st.setProperty('x', _len(x)); st.setProperty('y', _len(y));
  st.setProperty('width', _len(Math.max(0, w))); st.setProperty('height', _len(Math.max(0, h)));
}
function drawAt(svg: SVGSVGElement, x: number, y: number, w: number, h: number, e: number, band: number, hDev: number, s: number): void {
  const [fill, low, edge] = [svg.children[0], svg.children[1], svg.children[2]];
  setRect(fill, x, y, w, h);
  const split = band > 0 ? (hDev > 0 ? Math.round(band * hDev) / s * (h / (hDev / s)) : band * h) : h;
  setRect(low, x, y + split, w, h - split);
  setRect(edge, x + e / 2, y + e / 2, w - e, h - e);
  if (edge) (edge as SVGRectElement).style.setProperty('stroke-width', _len(e));
}
const _num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const _look = new WeakMap<SVGSVGElement, { edge: number; band: number }>();
function currentBox(svg: SVGSVGElement): GlideBox | null {
  const fill = svg.children[0] as SVGRectElement | undefined;
  if (!fill || !svg.style.left) return null;
  const cs = getComputedStyle(fill);
  return { left: _num(svg.style.left) + _num(cs.x), top: _num(svg.style.top) + _num(cs.y), width: _num(cs.width), height: _num(cs.height) };
}

export function glideTo(svg: SVGSVGElement, el: HTMLElement, from: 'instant' | 'current' | GlideBox, onEnd?: () => void): GlideBox {
  const to = glideBoxOf(svg, el);
  const k = scaleOf(svg), dpr = window.devicePixelRatio || 1, s = k * dpr;
  const r = el.getBoundingClientRect();
  const wDev = Math.round(r.right * dpr) - Math.round(r.left * dpr), hDev = Math.round(r.bottom * dpr) - Math.round(r.top * dpr);
  const restW = wDev / s, restH = hDev / s;
  let look = _look.get(svg);
  if (!look) {
    const cs = getComputedStyle(svg);
    look = { edge: _num(cs.getPropertyValue('--kc-edge')) || 3, band: _num(cs.getPropertyValue('--kg-band')) };
    _look.set(svg, look);
  }
  const e = Math.max(1, Math.floor(look.edge * s + 1e-4)) / s;
  const band = look.band;
  const start = from === 'instant' ? null : from === 'current' ? currentBox(svg) : from;
  endGlide(svg, false);
  svg.classList.add('kg-still');
  const st = svg.style;
  st.left = _len(to.left); st.top = _len(to.top); st.width = _len(to.width); st.height = _len(to.height);
  if (start) drawAt(svg, start.left - to.left, start.top - to.top, start.width, start.height, e, band, 0, s);
  else drawAt(svg, 0, 0, restW, restH, e, band, hDev, s);
  void svg.getBoundingClientRect();
  svg.classList.remove('kg-still');
  if (!start) return to;
  listen(svg);
  svg.classList.add('kg-moving');
  _onEnd.set(svg, onEnd ?? null);
  _guard.set(svg, window.setTimeout(() => endGlide(svg, true), GUARD_MS));
  drawAt(svg, 0, 0, restW, restH, e, band, hDev, s);
  if (!stillMoving(svg)) endGlide(svg, true);
  return to;
}
