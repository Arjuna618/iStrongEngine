import React, { useLayoutEffect, useRef, useState, useEffect, useSyncExternalStore } from 'react';
import { useGameDark } from '../utils/useGameTheme';
import { useHudScale } from '../utils/useGuiScale';
import { getEffectiveViewportWidth, getEffectiveViewportHeight } from '../utils/zoomCompensation';
import { hudColors, hudSlot, hudCss, HUD_SLOT, HUD_FONT_FAMILY, HUD_STROKE_F, HUD_STROKE_F_BIG } from '../utils/hudArras';
import { mobileActive } from '../utils/mobileMode';
import { safeInsets } from '../utils/safeArea';
import { useLeave, motionOff } from './kit/presence';
import { subscribeLoading, loadingView, loadingLeaving, loadingPainted, LOAD_IN_MS, LOAD_OUT_MS, type LoadingView } from '../utils/loadingScreen';

const TITLE_FONT = 30, TIP_FONT = 15, TIP_DY = 60, SIDE = 12;

let _measure: CanvasRenderingContext2D | null = null;
function textW(text: string, size: number): number {
  if (_measure === null && typeof document !== 'undefined') _measure = document.createElement('canvas').getContext('2d');
  if (_measure === null) return 0;
  _measure.font = `bold ${size}px ${HUD_FONT_FAMILY}`;
  return _measure.measureText(text).width;
}

export const ArrasLoadingScreen: React.FC = () => {
  const view = useSyncExternalStore(subscribeLoading, loadingView, loadingView);
  const leaving = useSyncExternalStore(subscribeLoading, loadingLeaving, loadingLeaving);
  return view ? <LoadingFace view={view} leaving={leaving} /> : null;
};

const LoadingFace: React.FC<{ view: LoadingView; leaving: boolean }> = ({ view, leaving }) => {
  const dark = useGameDark();
  const col = hudColors(dark);
  const hudS = useHudScale();
  const rootRef = useRef<HTMLDivElement | null>(null);
  useLeave(rootRef, leaving, 'fade', LOAD_OUT_MS);
  useLayoutEffect(() => {
    let a = 0, b = 0;
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => loadingPainted()); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, []);
  const [box, setBox] = useState(() => ({ w: getEffectiveViewportWidth(), h: getEffectiveViewportHeight() }));
  useEffect(() => {
    const on = () => setBox((b) => { const w = getEffectiveViewportWidth(), h = getEffectiveViewportHeight(); return b.w === w && b.h === h ? b : { w, h }; });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const mob = mobileActive();
  const inL = mob ? safeInsets.l : 0, inT = mob ? safeInsets.t : 0;
  const bw = box.w - (mob ? safeInsets.l + safeInsets.r : 0), bh = box.h - (mob ? safeInsets.t + safeInsets.b : 0);
  const cx = inL + bw / 2, cy = inT + bh / 2;
  const line = (text: string, font: number, y: number) => {
    const fit = Math.min(1, (bw - 2 * SIDE) / Math.max(1, textW(text, font * hudS)));
    const size = font * hudS * fit;
    return (
      <text x={cx} y={y} textAnchor="middle" dominantBaseline="central" fontFamily={HUD_FONT_FAMILY} fontWeight="bold" fontSize={size}
        fill={col.text} stroke={col.ink} strokeWidth={(font >= 20 ? HUD_STROKE_F_BIG : HUD_STROKE_F) * size} paintOrder="stroke" strokeLinejoin="round">{text}</text>
    );
  };
  return (
    <div ref={rootRef} className="k-hud k-loading" role="status" aria-live="polite" aria-label={view.title}
      style={{ background: hudCss(hudSlot(HUD_SLOT.WHITE, dark)), animation: motionOff() ? undefined : `k-dz-in ${LOAD_IN_MS}ms var(--ease-default) both` }}>
      <svg width={box.w} height={box.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
        {line(view.title, TITLE_FONT, cy)}
        {line(view.tip, TIP_FONT, cy + TIP_DY * hudS)}
      </svg>
    </div>
  );
};
