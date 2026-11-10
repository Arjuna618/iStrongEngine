import React, { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './kit';
import { useEscapeOwner } from '../shared/escapeStack';
import { useMenuStage } from './motion';
import { EASE, glide, leaveFrom, motionOff, takeOver, useHeld, useLeave } from './presence';
import { getZoomCompensation } from '../../utils/zoomCompensation';
import {
  SHEET_EDGE, endTypeSheet, installTypeSheet, keyboardNow, keyboardRoom, onKeyboardMove, pageFullHeight, registerSheetField, sheetEnter, sheetFieldLost,
  sheetTop, sheetTyped, subscribeTypeSheet, typeSheetJob,
} from '../../utils/typeSheet';

const SHEET_MAX_W = 560;
const ROW_SHORT_BELOW = 600;
const IN_MS = 150;
const MOVE_MS = 200;

export const TypeSheet: React.FC = () => {
  const job = useSyncExternalStore(subscribeTypeSheet, typeSheetJob, typeSheetJob);
  const open = job !== null;
  const shown = useHeld(job);
  const stage = useMenuStage<'on'>(open ? 'on' : null);
  const live = open || stage.shown !== null;
  const cardRef = useRef<HTMLFormElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const fieldRef = useCallback((el: HTMLInputElement | null) => registerSheetField(el), []);
  const isUp = useRef(false);
  useEffect(() => { installTypeSheet(); }, []);
  useEscapeOwner(() => endTypeSheet('cancel'), open);
  useLeave(scrimRef, !open, 'fade');

  const place = useCallback((snap: boolean) => {
    const el = cardRef.current;
    const j = typeSheetJob();
    if (!el || !j) return;
    const z = getZoomCompensation() || 1;
    const ih = window.innerHeight, iw = window.innerWidth;
    const vv = window.visualViewport;
    const vTop = vv ? vv.offsetTop : 0;
    const vLeft = vv ? vv.offsetLeft : 0;
    const vW = vv ? vv.width : iw;
    const land = iw > pageFullHeight();
    el.style.zoom = z !== 1 ? String(z) : '';
    el.dataset.row = land && Math.min(iw, ih) < ROW_SHORT_BELOW ? '1' : '';
    const w = Math.max(0, Math.min(vW - 2 * SHEET_EDGE, SHEET_MAX_W));
    el.style.width = `${w / z}px`;
    el.style.left = `${(vLeft + (vW - w) / 2) / z}px`;
    const h = el.getBoundingClientRect().height;
    const top = sheetTop(pageFullHeight(), vTop, keyboardRoom(keyboardNow(), land, j.numeric), h);
    const was = (parseFloat(el.style.top) || 0) * z;
    if (snap || motionOff()) { takeOver(el, 'translate'); el.style.translate = ''; el.style.top = `${top / z}px`; }
    else if (Math.abs(was - top) > 0.5) {
      const drawn = takeOver(el, 'translate').trim().split(/\s+/);
      const dy = drawn.length >= 2 ? parseFloat(drawn[1]) || 0 : 0;
      el.style.top = `${top / z}px`;
      glide(el, 'translate', 'none', MOVE_MS, { from: `0px ${dy + (was - top) / z}px` });
    }
  }, []);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (open && !isUp.current) {
      isUp.current = true;
      if (typeof el.getAnimations === 'function') for (const a of el.getAnimations()) a.cancel();
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
      el.style.animation = '';
      place(true);
      if (!motionOff() && typeof el.animate === 'function') el.animate([{ opacity: 0, transform: 'translateY(6px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: IN_MS, easing: EASE });
    } else if (open) place(false);
    else if (isUp.current) { isUp.current = false; leaveFrom(el, 'pop'); }
  }, [open, job, place]);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    let raf = 0;
    const go = () => { if (raf === 0) raf = requestAnimationFrame(() => { raf = 0; place(false); }); };
    vv?.addEventListener('resize', go);
    vv?.addEventListener('scroll', go);
    window.addEventListener('resize', go);
    const offKb = onKeyboardMove(go);
    return () => {
      offKb();
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', go);
      vv?.removeEventListener('scroll', go);
      window.removeEventListener('resize', go);
    };
  }, [open, place]);

  return createPortal(
    <>
      {live && (
        <div ref={scrimRef} className={`k-type-scrim k-fade-in${open ? '' : ' pointer-events-none'}`}
          onMouseDown={e => e.preventDefault()} onClick={() => endTypeSheet('away')} />
      )}
      <form ref={cardRef} className={`k-type-sheet${live ? '' : ' k-type-sheet-idle'}${open ? '' : ' pointer-events-none'}`} aria-hidden={open ? undefined : true}
        onSubmit={e => { e.preventDefault(); sheetEnter(); }}
        onMouseDown={e => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}>
        <label htmlFor="k-type-sheet-field" className="k-type-sheet-label k-fade">{shown?.label ?? ''}</label>
        <span className="k-type-sheet-line">
          <input id="k-type-sheet-field" ref={fieldRef} type="text" className="k-field k-type-sheet-field" tabIndex={open ? 0 : -1}
            autoComplete="off" spellCheck={false}
            onInput={e => sheetTyped(e.currentTarget.value)}
            onFocus={e => { if (typeSheetJob() === null) e.currentTarget.blur(); }}
            onBlur={e => sheetFieldLost(e.relatedTarget, e.relatedTarget instanceof Node && !!cardRef.current?.contains(e.relatedTarget))} />
          <Button type="submit" variant="primary" className="k-type-sheet-done" tabIndex={open ? 0 : -1}>Done</Button>
        </span>
      </form>
    </>,
    document.body,
  );
};
