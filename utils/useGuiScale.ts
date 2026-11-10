import { useState, useEffect } from 'react';
import { getEffectiveViewportWidth, getEffectiveViewportHeight } from './zoomCompensation';
import { mobileActive, subscribeMobile } from './mobileMode';
import { mobHudFactor } from './mobileArras';
import { safeInsets } from './safeArea';

export function getGuiScale(): number {
  const w = getEffectiveViewportWidth();
  const h = getEffectiveViewportHeight();
  const raw = Math.max(w, 11 * h / 9) / Math.min(1920, Math.max(w, 1280));
  return Math.min(1, raw);
}

export function getGuiScaleUnclamped(): number {
  const w = getEffectiveViewportWidth();
  const h = getEffectiveViewportHeight();
  return Math.max(w, 11 * h / 9) / Math.min(1920, Math.max(w, 1280));
}

export function useGuiScale(): number {
  const [scale, setScale] = useState<number>(getGuiScale);
  useEffect(() => {
    const onResize = () => {
      const next = getGuiScale();
      setScale(prev => (prev === next ? prev : next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

export function useGuiScaleUnclamped(): number {
  const [scale, setScale] = useState<number>(getGuiScaleUnclamped);
  useEffect(() => {
    const onResize = () => {
      const next = getGuiScaleUnclamped();
      setScale(prev => (prev === next ? prev : next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

export function getNewArrasHudScale(): number {
  let w = getEffectiveViewportWidth();
  let h = getEffectiveViewportHeight();
  const mob = mobileActive();
  if (mob) { w -= safeInsets.l + safeInsets.r; h -= safeInsets.t + safeInsets.b; }
  const s1 = Math.max(w / 1920, h / 1080);
  return mob ? s1 * mobHudFactor(w, h) : s1;
}

export function getHudScale(): number {
  return getNewArrasHudScale();
}

export function useHudScale(): number {
  return useNewArrasHudScale();
}

export function useNewArrasHudScale(): number {
  const [scale, setScale] = useState<number>(getNewArrasHudScale);
  useEffect(() => {
    const onResize = () => {
      const next = getNewArrasHudScale();
      setScale(prev => (prev === next ? prev : next));
    };
    window.addEventListener('resize', onResize);
    const unsub = subscribeMobile(onResize);
    return () => { window.removeEventListener('resize', onResize); unsub(); };
  }, []);
  return scale;
}
