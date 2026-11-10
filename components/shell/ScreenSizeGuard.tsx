import React, { useEffect, useRef, useState } from 'react';
import { getEffectiveViewportWidth, getEffectiveViewportHeight, onZoomChange } from '../../utils/zoomCompensation';
import { MonitorSmartphone, EMPTY_LINE } from '../ui/icons';
import { letPageGo } from '../../utils/leaveGuard';
const MIN_CANVAS_W = 360;
const MIN_RAIL_H = 440;
const WATCH_MS = 400;
const STRIKES_TO_LOCK = 2;

function measure() {
  return { w: Math.round(getEffectiveViewportWidth()), h: Math.round(getEffectiveViewportHeight()) };
}

export interface ScreenFit { tooSmall: boolean; w: number; h: number; minW: number; minH: number }

export function useScreenFit(chromeScale: number): ScreenFit {
  const [size, setSize] = useState(measure);
  useEffect(() => {
    const on = () => setSize(prev => { const n = measure(); return n.w === prev.w && n.h === prev.h ? prev : n; });
    window.addEventListener('resize', on);
    const offZoom = onZoomChange(on);
    return () => { window.removeEventListener('resize', on); offZoom(); };
  }, []);
  const minW = Math.round((64 + 320) * chromeScale + MIN_CANVAS_W);
  const minH = Math.round(55 * chromeScale + MIN_RAIL_H);
  return { tooSmall: size.w < minW || size.h < minH, w: size.w, h: size.h, minW, minH };
}

function noticeIntact(g: HTMLElement): boolean {
  if (!g.isConnected) return false;
  const cs = getComputedStyle(g);
  if (cs.display === 'none' || cs.visibility !== 'visible' || cs.pointerEvents === 'none' || cs.contentVisibility === 'hidden') return false;
  if (g.getAnimations().length === 0 && parseFloat(cs.opacity) < 0.98) return false;
  const r = g.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  if (r.left > 2 || r.top > 2 || r.right < W - 2 || r.bottom < H - 2) return false;
  const pts = [[0.5, 0.5], [0.25, 0.35], [0.75, 0.35], [0.25, 0.65], [0.75, 0.65]];
  let hits = 0;
  for (const [fx, fy] of pts) { const el = document.elementFromPoint(W * fx, H * fy); if (el && (el === g || g.contains(el))) hits++; }
  return hits >= 4;
}

function engineOff(el: HTMLElement | null): boolean {
  if (!el || !el.isConnected) return true;
  return el.hasAttribute('inert') && getComputedStyle(el).visibility === 'hidden';
}

export const ScreenSizeGuard: React.FC<{
  fit: ScreenFit;
  engineParts: React.RefObject<HTMLElement | null>[];
  onTamper: () => void;
}> = ({ fit, engineParts, onTamper }) => {
  const ref = useRef<HTMLDivElement>(null);
  const tamperRef = useRef(onTamper); tamperRef.current = onTamper;
  useEffect(() => {
    let strikes = 0, locked = false;
    const check = () => {
      if (locked) return;
      if (document.querySelector('.k-curtain')) { strikes = 0; return; }
      const g = ref.current;
      const ok = !!g && noticeIntact(g) && engineParts.every(p => engineOff(p.current));
      if (ok) { strikes = 0; return; }
      if (++strikes >= STRIKES_TO_LOCK) { locked = true; tamperRef.current(); }
    };
    const id = window.setInterval(check, WATCH_MS);
    let raf = 0;
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; check(); }); });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'inert'] });
    return () => { window.clearInterval(id); mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={ref} className="k-size-guard k-fade-in" role="alert" aria-live="polite">
      <div className="k-size-guard-card">
        <span className="k-size-guard-icon"><MonitorSmartphone size={72} strokeWidth={EMPTY_LINE} /></span>
        <h2 className="k-size-guard-title">Screen Size Not Supported</h2>
        <p className="k-size-guard-text">
          The Game Engine needs a window at least {fit.minW} by {fit.minH} pixels to fit its tools and the canvas side by side.
          This window is {fit.w} by {fit.h}. Make it bigger to keep building. Nothing is lost.
        </p>
      </div>
    </div>
  );
};

export const ScreenSizeLock: React.FC = () => (
  <div className="k-size-lock" role="alert">
    <div className="k-size-guard-card">
      <span className="k-size-guard-icon"><MonitorSmartphone size={72} strokeWidth={EMPTY_LINE} /></span>
      <h2 className="k-size-guard-title">Screen Size Not Supported</h2>
      <p className="k-size-guard-text">
        The size notice was removed or hidden, so the Game Engine stopped. Make the window bigger, then reload the page.
      </p>
      <button type="button" className="k-btn k-btn-primary k-btn-lg" onClick={() => (letPageGo(), window.location.reload())}>Reload</button>
    </div>
  </div>
);

export function ensureLockMessage(): void {
  window.setTimeout(() => {
    const l = document.querySelector('.k-size-lock');
    if (l && getComputedStyle(l).display !== 'none') return;
    document.body.innerHTML = '';
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;font:600 18px Inter,sans-serif;text-align:center;background:var(--surface-primary);color:var(--text-primary)';
    d.textContent = 'Screen Size Not Supported. Make the window bigger, then reload the page.';
    document.body.appendChild(d);
  }, 400);
}
