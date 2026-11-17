import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useLayoutEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ToastDone, XCircle, Info, Lightbulb, X } from './icons';
import { useChromeScale, useZoomCompensation, UI_SCALE } from '../../utils/useMenuScale';
import { getCumulativeZoom } from '../../utils/zoomCompensation';
import { MotionList } from '../kit/Collapse';
import { useClassicUi } from '../shared/useClassicUi';
import { openWindowIds, useOpenWindowCount } from '../kit/windowStack';

type ToastVariant = 'success' | 'error' | 'info';
type ToastKind = ToastVariant | 'tip';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  onHide?: () => void;
  born?: number;
}

interface ToastContextValue {
  showToast: (variant: ToastVariant, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let _showToast: ToastContextValue['showToast'] | null = null;
export function toast(variant: ToastVariant, message: string): void { _showToast?.(variant, message); }
const MESSAGE_MS = 3000;

let _tipApi: { show: (text: string, life: number, onHide: () => void) => void; clear: () => void } | null = null;
export function showTipToast(text: string, life: number, onHide: () => void): void { _tipApi?.show(text, life, onHide); }
export function clearTipToasts(): void { _tipApi?.clear(); }
let _clearAll: (() => void) | null = null;
export function clearAllToasts(): void { _clearAll?.(); }

export interface ToastArea { left: number; right: number; gap: number }
let _area: ToastArea | null = null;
const _areaSubs = new Set<() => void>();
export function setToastArea(a: ToastArea | null): void {
  if (a === _area || (a && _area && a.left === _area.left && a.right === _area.right && a.gap === _area.gap)) return;
  _area = a;
  _areaSubs.forEach(f => f());
}
const areaSub = (f: () => void) => { _areaSubs.add(f); return () => { _areaSubs.delete(f); }; };
const areaNow = () => _area;
let _topRoom = 0;
export function setToastTopRoom(px: number): void {
  if (px === _topRoom) return;
  _topRoom = px;
  _areaSubs.forEach(f => f());
}
const topRoomNow = () => _topRoom;
const TOP_BAR_UI = 55;
const TOP_GAP = 12;
const COVER_SEL = '[role="dialog"], [aria-modal="true"], .k-backdrop, .modal-scrim';
function coveredNow(): boolean {
  if (typeof document === 'undefined') return false;
  const list = document.querySelectorAll<HTMLElement>(COVER_SEL);
  for (let i = 0; i < list.length; i++) if (list[i].isConnected && list[i].getClientRects().length > 0) return true;
  return false;
}
const WINDOW_GAP = Math.round(24 / UI_SCALE);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [covered, setCovered] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const idCounter = useRef(0);
  const zoomComp = useZoomCompensation();
  const chromeScale = useChromeScale();
  const toastScale = zoomComp * chromeScale;
  const area = useSyncExternalStore(areaSub, areaNow, areaNow);
  const topRoom = useSyncExternalStore(areaSub, topRoomNow, topRoomNow);
  const classicUi = useClassicUi();

  const add = useCallback((item: Omit<ToastItem, 'id'>, life: number, replaceKind?: ToastKind) => {
    const id = ++idCounter.current;
    setCovered(coveredNow());
    setToasts(prev => [...(replaceKind ? prev.filter(t => t.kind !== replaceKind) : prev), { id, born: openWindowIds().length, ...item }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, life);
  }, []);
  const showToast = useCallback((variant: ToastVariant, message: string) => {
    add({ kind: variant, message }, MESSAGE_MS);
  }, [add]);
  _showToast = showToast;
  _clearAll = () => { setToasts([]); setEpoch(e => e + 1); };
  _tipApi = {
    show: (text, life, onHide) => add({ kind: 'tip', message: text, onHide }, life, 'tip'),
    clear: () => setToasts(prev => prev.filter(t => t.kind !== 'tip')),
  };
  const hidden = useCallback((t: ToastItem) => {
    t.onHide?.();
    setToasts(prev => prev.filter(x => x.id !== t.id));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  const ui = zoomComp * chromeScale;
  const onCanvas = !!area && !covered;
  const atTop = classicUi && onCanvas;
  const left = onCanvas ? area.left * ui : 0, right = onCanvas ? area.right * ui : 0;
  const gap = onCanvas ? area.gap : WINDOW_GAP;
  const windowsNow = useOpenWindowCount();
  const under = windowsNow > 0 && toasts.length > 0 && toasts.every(t => (t.born ?? 0) < windowsNow);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className={atTop ? 'fixed z-[99999] flex justify-center pointer-events-none' : 'fixed bottom-0 z-[99999] flex justify-center pointer-events-none'}
          style={atTop ? { left, right, top: TOP_BAR_UI * ui, zIndex: under ? 45 : undefined } : { left, right, zIndex: under ? 45 : undefined }} role="status" aria-live="polite">
          <div style={{ ...(atTop ? { marginTop: TOP_GAP + topRoom } : { marginBottom: `calc(${gap}px * var(--k-toast-lift, 1))` }), ...(toastScale !== 1 ? { zoom: toastScale } : null) }}>
          <MotionList key={epoch} gap={8}>
          {toasts.map(t => (
            <div key={t.id} className="flex justify-center">
              <ToastCard t={t} roomW={() => window.innerWidth - left - right} onHide={hidden} />
            </div>
          ))}
          </MotionList>
          </div>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
};

const ToastCard: React.FC<{ t: ToastItem; roomW: () => number; onHide: (t: ToastItem) => void }> = ({ t, roomW, onHide }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const roomRef = useRef(roomW);
  roomRef.current = roomW;
  useLayoutEffect(() => {
    const compute = () => {
      const el = ref.current;
      if (!el) return;
      const w = el.offsetWidth * (getCumulativeZoom(el) || 1);
      const avail = roomRef.current() * 0.94;
      const s = w > avail ? avail / w : 1;
      setFit(prev => (Math.abs(prev - s) < 0.01 ? prev : s));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [t.message]);
  return (
    <div
      ref={ref}
      className={`k-toast${t.kind === 'tip' ? ' k-toast-tip pointer-events-auto' : ' pointer-events-none'} flex items-center gap-2 whitespace-nowrap select-none`}
      style={fit !== 1 ? { transform: `scale(${fit})`, transformOrigin: 'center bottom' } : undefined}
    >
      {t.kind === 'success' ? <ToastDone size={16} absoluteStrokeWidth className="shrink-0" />
        : t.kind === 'info' ? <Info size={16} absoluteStrokeWidth className="shrink-0" />
        : t.kind === 'tip' ? <Lightbulb size={16} absoluteStrokeWidth className="shrink-0" aria-hidden />
        : <XCircle size={16} absoluteStrokeWidth className="shrink-0" />}
      <span className="k-toast-text">{t.message}</span>
      {t.kind === 'tip' && (
        <button
          type="button"
          onClick={() => onHide(t)}
          title="Hide this tip"
          aria-label="Hide tip"
          className="k-toast-x k-ico grid h-6 w-6 shrink-0 place-items-center rounded-md opacity-60 transition-[opacity,background-color] hover:opacity-100 hover:bg-[var(--k-icon-hover)] active:scale-[0.94]"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
};
