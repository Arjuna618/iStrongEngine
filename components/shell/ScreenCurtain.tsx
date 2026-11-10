import { SMALL_FIX } from '../../game/smallFixSwitch';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motionOff } from '../kit/presence';

export const SCREEN_OUT_MS = 210;
export const SCREEN_IN_MS = 280;
const SETTLE_MS = 35;

type CurtainPhase = 'off' | 'cover' | 'reveal';

const reducedMotion = motionOff;

export function useScreenCurtain(): { phase: CurtainPhase; go: (switchScreen: () => void) => void } {
  const [phase, setPhase] = useState<CurtainPhase>('off');
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const waiting = useRef<(() => void) | null>(null);
  const go = useCallback(function goOnce(switchScreen: () => void) {
    if (busy.current) { if (SMALL_FIX.R827) waiting.current = switchScreen; return; }
    if (reducedMotion()) { switchScreen(); return; }
    timers.current.length = 0;
    busy.current = true;
    setPhase('cover');
    timers.current.push(window.setTimeout(() => {
      switchScreen();
      timers.current.push(window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        setPhase('reveal');
        timers.current.push(window.setTimeout(() => {
          setPhase('off'); busy.current = false;
          const next = waiting.current;
          if (next !== null) { waiting.current = null; goOnce(next); }
        }, SCREEN_IN_MS));
      })), SETTLE_MS));
    }, SCREEN_OUT_MS));
  }, []);
  useEffect(() => () => { for (const id of timers.current) window.clearTimeout(id); }, []);
  return { phase, go };
}

export const ScreenCurtain: React.FC<{ phase: CurtainPhase }> = ({ phase }) => {
  if (phase === 'off') return null;
  return <div className={`k-curtain ${phase === 'cover' ? 'k-curtain-cover' : 'k-curtain-reveal'}`} aria-hidden="true" />;
};
