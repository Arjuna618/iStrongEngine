import React, { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { FullScreen } from '../ui/icons';
import { isTouchScreen } from '../../utils/device';
import { enterFullscreen, fullscreenSupported, isFullscreen, subscribeFullscreen } from '../../utils/fullscreen';
import { useOpenWindowCount } from '../kit/windowStack';
import { motionOff } from '../kit/presence';
import { useTermsAgreed } from '../legal/termsConsent';

const FAB = 52;
const EDGE = 16;
const DRAG_PX = 8;
const SNAP_MS = 280;
const SNAP_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const STORE_KEY = 'istrong_fullscreen_button';

interface Spot { side: 'l' | 'r'; y: number; }
function loadSpot(): Spot {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Spot | null;
    if (v && (v.side === 'l' || v.side === 'r') && typeof v.y === 'number' && v.y >= 0 && v.y <= 1) return v;
  } catch { }
  return { side: 'r', y: 1 };
}
function saveSpot(s: Spot): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { }
}
const freeW = (): number => Math.max(0, window.innerWidth - 2 * EDGE - FAB);
const freeH = (): number => Math.max(0, window.innerHeight - 2 * EDGE - FAB);
const xOf = (s: Spot): number => (s.side === 'l' ? EDGE : EDGE + freeW());
const yOf = (s: Spot): number => EDGE + s.y * freeH();

export const FullscreenButton: React.FC<{ onMenu: boolean }> = ({ onMenu }) => {
  const full = useSyncExternalStore(subscribeFullscreen, isFullscreen, isFullscreen);
  const windows = useOpenWindowCount();
  const eligible = isTouchScreen() && fullscreenSupported();
  const agreed = useTermsAgreed();
  const shown = eligible && onMenu && agreed && !full && windows === 0;

  const boxRef = useRef<HTMLDivElement>(null);
  const spot = useRef<Spot | null>(null);
  if (spot.current === null) spot.current = loadSpot();
  const drag = useRef<{ id: number; x0: number; y0: number; bx: number; by: number; moved: boolean; x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const tapAt = useRef(0);

  const place = useCallback((glide: boolean) => {
    const el = boxRef.current, s = spot.current;
    if (!el || !s) return;
    el.style.transition = glide && !motionOff() ? `transform ${SNAP_MS}ms ${SNAP_EASE}` : 'none';
    el.style.transform = `translate3d(${xOf(s)}px, ${yOf(s)}px, 0)`;
  }, []);
  useLayoutEffect(() => { if (eligible) place(false); }, [eligible, place]);
  useEffect(() => {
    if (!eligible) return;
    const on = () => { if (!drag.current) place(false); };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [eligible, place]);

  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button > 0 || drag.current) return;
    const s = spot.current!;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, bx: xOf(s), by: yOf(s), moved: false, x: xOf(s), y: yOf(s) };
    dragged.current = false;
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && dx * dx + dy * dy < DRAG_PX * DRAG_PX) return;
    if (!d.moved) {
      d.moved = true; dragged.current = true;
      if (boxRef.current) boxRef.current.style.transition = 'none';
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
    }
    const x = Math.max(0, Math.min(window.innerWidth - FAB, d.bx + dx));
    const y = Math.max(EDGE, Math.min(EDGE + freeH(), d.by + dy));
    d.x = x; d.y = y;
    if (boxRef.current) boxRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const onUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.moved) {
      if (e.pointerType !== 'mouse') { tapAt.current = performance.now(); void enterFullscreen().then(ok => { if (!ok) tapAt.current = 0; }); }
      return;
    }
    const x = d.x, y = d.y;
    const h = freeH();
    spot.current = { side: x + FAB / 2 < window.innerWidth / 2 ? 'l' : 'r', y: h > 0 ? Math.max(0, Math.min(1, (y - EDGE) / h)) : 1 };
    saveSpot(spot.current);
    place(true);
  };
  const onClick = () => {
    if (dragged.current) { dragged.current = false; return; }
    if (performance.now() - tapAt.current < 800) return;
    void enterFullscreen();
  };

  if (!eligible) return null;
  return (
    <div ref={boxRef} className="k-fs-fab-box" aria-hidden={!shown || undefined}>
      <button type="button" className={shown ? 'k-fs-fab' : 'k-fs-fab k-fs-fab-off'} aria-label="Fullscreen" tabIndex={shown ? 0 : -1}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={onClick}>
        <FullScreen size={22} />
      </button>
    </div>
  );
};
