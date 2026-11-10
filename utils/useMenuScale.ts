import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  getEffectiveViewportWidth,
  getEffectiveViewportHeight,
  getZoomCompensation,
  onZoomChange,
} from './zoomCompensation';
import { isPhoneUi, isTouchScreen } from './device';
import { safeInsets } from './safeArea';

const REF_WIDTH = 2560;
const REF_HEIGHT = 1440;
const MIN_SCALE = 0.90;
const MIN_CHROME_SCALE = 0.80;

export const UI_SCALE = 1.3;

const UI_SIZE_KEY = 'istrong_ui_scale';
export const UI_SIZE_MIN = 0.67;
export const UI_SIZE_MAX = 1.5;
export const UI_SIZE_DEFAULT = 1.3;
export const UI_SIZE_DEFAULT_TOUCH = UI_SIZE_MIN;
export function uiSizeDefault(): number {
  try { return isTouchScreen() ? UI_SIZE_DEFAULT_TOUCH : UI_SIZE_DEFAULT; } catch { return UI_SIZE_DEFAULT; }
}

function clampUiSize(v: number): number {
  return Number.isFinite(v) ? Math.max(UI_SIZE_MIN, Math.min(UI_SIZE_MAX, v)) : uiSizeDefault();
}

let _uiSizeSetting = UI_SIZE_DEFAULT;
try {
  const saved = localStorage.getItem(UI_SIZE_KEY);
  _uiSizeSetting = saved == null ? uiSizeDefault() : clampUiSize(parseFloat(saved));
} catch { }

const _uiSizeListeners = new Set<() => void>();

export function getUiSizeSetting(): number {
  return _uiSizeSetting;
}

export function setUiSizeSetting(v: number): void {
  const next = clampUiSize(v);
  if (next === _uiSizeSetting) return;
  _uiSizeSetting = next;
  try { localStorage.setItem(UI_SIZE_KEY, String(next)); } catch { }
  _uiSizeListeners.forEach(fn => fn());
}

export const PHONE_UI_BASE = 1;
export const PHONE_EDGE = 16;
export const PHONE_NEED_H = 340;
export const PHONE_NEED_W = 240;

export function getMenuScale(): number {
  if (typeof window === 'undefined') return 1;
  if (isPhoneUi()) {
    const s = PHONE_UI_BASE * _uiSizeSetting;
    const room = Math.min((getEffectiveViewportHeight() - 2 * PHONE_EDGE) / PHONE_NEED_H, (getEffectiveViewportWidth() - 2 * PHONE_EDGE) / PHONE_NEED_W);
    return Math.min(s, Math.max(Math.min(1, s), room));
  }
  const w = getEffectiveViewportWidth();
  const h = getEffectiveViewportHeight();
  const raw = Math.min(w / REF_WIDTH, h / REF_HEIGHT);
  return UI_SCALE * Math.max(MIN_SCALE, Math.min(1, raw)) * _uiSizeSetting;
}

export function useMenuScale(): number {
  const [scale, setScale] = useState<number>(() =>
    typeof window === 'undefined' ? 1 : getMenuScale()
  );
  useEffect(() => {
    let rafId = 0;
    const onResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const next = getMenuScale();
        setScale(prev => (prev === next ? prev : next));
      });
    };
    const onUiSize = () => {
      const next = getMenuScale();
      setScale(prev => (prev === next ? prev : next));
    };
    window.addEventListener('resize', onResize);
    _uiSizeListeners.add(onUiSize);
    return () => {
      window.removeEventListener('resize', onResize);
      _uiSizeListeners.delete(onUiSize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
  return scale;
}

export function getChromeScale(): number {
  if (typeof window === 'undefined') return 1;
  const w = getEffectiveViewportWidth();
  const h = getEffectiveViewportHeight();
  const raw = Math.min(w / REF_WIDTH, h / REF_HEIGHT);
  return UI_SCALE * Math.max(MIN_CHROME_SCALE, Math.min(1, raw)) * _uiSizeSetting;
}

export function useChromeScale(): number {
  const [scale, setScale] = useState<number>(() =>
    typeof window === 'undefined' ? 1 : getChromeScale()
  );
  useEffect(() => {
    let rafId = 0;
    const onResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const next = getChromeScale();
        setScale(prev => (prev === next ? prev : next));
      });
    };
    const onUiSize = () => {
      const next = getChromeScale();
      setScale(prev => (prev === next ? prev : next));
    };
    window.addEventListener('resize', onResize);
    _uiSizeListeners.add(onUiSize);
    return () => {
      window.removeEventListener('resize', onResize);
      _uiSizeListeners.delete(onUiSize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
  return scale;
}

export function useZoomCompensation(): number {
  const [comp, setComp] = useState<number>(() =>
    typeof window === 'undefined' ? 1 : getZoomCompensation()
  );
  useEffect(() => onZoomChange(setComp), []);
  return comp;
}

export function usePortalMenuScale(): number {
  return useMenuScale() * useZoomCompensation();
}

export function useFitScale(
  cardRef: React.RefObject<HTMLElement | null>,
  baseScale: number,
  active: boolean,
  margin = 24,
): number {
  const [fit, setFit] = useState(baseScale);
  useLayoutEffect(() => {
    if (!active) return;
    const el = cardRef.current;
    if (!el) { setFit(baseScale); return; }
    const compute = () => {
      const availW = getEffectiveViewportWidth() - margin * 2;
      const availH = getEffectiveViewportHeight() - margin * 2;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let s = baseScale;
      if (w > 0 && h > 0) s = Math.min(baseScale, availW / w, availH / h);
      setFit(prev => (Math.abs(prev - s) < 0.001 ? prev : s));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [cardRef, baseScale, active, margin]);
  return active ? fit : baseScale;
}

const MODAL_VIEWPORT_MARGIN = 28;
const MODAL_MIN_HEIGHT = 200;

export function getModalMaxHeightPx(margin?: number): number {
  if (typeof window === 'undefined') return 640;
  const m = margin ?? (isPhoneUi() ? PHONE_EDGE : MODAL_VIEWPORT_MARGIN);
  const avail = getEffectiveViewportHeight() - safeInsets.t - safeInsets.b - m * 2;
  const scale = getMenuScale();
  return Math.max(MODAL_MIN_HEIGHT, scale > 0 ? avail / scale : avail);
}

export function getModalMaxWidthPx(margin?: number): number {
  if (typeof window === 'undefined') return 1200;
  const m = margin ?? (isPhoneUi() ? PHONE_EDGE : 16);
  const avail = getEffectiveViewportWidth() - safeInsets.l - safeInsets.r - m * 2;
  const scale = getMenuScale();
  return Math.max(240, scale > 0 ? avail / scale : avail);
}

export function useModalMaxWidth(margin?: number): number {
  const [maxW, setMaxW] = useState<number>(() => (typeof window === 'undefined' ? 1200 : getModalMaxWidthPx(margin)));
  useEffect(() => {
    let rafId = 0;
    const recompute = () => { const next = getModalMaxWidthPx(margin); setMaxW(prev => (Math.abs(prev - next) < 0.5 ? prev : next)); };
    const onResize = () => { if (rafId) return; rafId = requestAnimationFrame(() => { rafId = 0; recompute(); }); };
    window.addEventListener('resize', onResize);
    _uiSizeListeners.add(recompute);
    return () => { window.removeEventListener('resize', onResize); _uiSizeListeners.delete(recompute); if (rafId) cancelAnimationFrame(rafId); };
  }, [margin]);
  return maxW;
}

export function useModalMaxHeight(margin?: number): number {
  const [maxH, setMaxH] = useState<number>(() =>
    typeof window === 'undefined' ? 640 : getModalMaxHeightPx(margin)
  );
  useEffect(() => {
    let rafId = 0;
    const recompute = () => {
      const next = getModalMaxHeightPx(margin);
      setMaxH(prev => (Math.abs(prev - next) < 0.5 ? prev : next));
    };
    const onResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; recompute(); });
    };
    window.addEventListener('resize', onResize);
    _uiSizeListeners.add(recompute);
    return () => {
      window.removeEventListener('resize', onResize);
      _uiSizeListeners.delete(recompute);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [margin]);
  return maxH;
}
