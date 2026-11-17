import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPopup } from '../shared/useFloatingPopup';
import { useBackdropClose } from '../shared/useBackdropClose';
import { wordTrigger } from '../shared/useFloatingPopup';
import { useClassicUi } from '../shared/useClassicUi';

export interface DropMenuOptions {
  align?: 'start' | 'end';
  estimatedHeight?: number;
  estimatedWidth?: number;
  hangs?: boolean | 'words';
}

export function useDropMenu(opts: DropMenuOptions = {}) {
  return useFloatingPopup({
    claimsEscape: true,
    gap: 6,
    align: opts.align ?? 'start',
    estimatedHeight: opts.estimatedHeight ?? 160,
    estimatedWidth: opts.estimatedWidth,
    hangs: opts.hangs ?? 'words',
  });
}
export type DropMenuState = ReturnType<typeof useDropMenu>;

export const menuOpen = (menu: DropMenuState): boolean => menu.isOpen && !menu.leaving;

interface DropMenuProps {
  menu: DropMenuState;
  className: string;
  role?: string;
  label?: string;
  matchTriggerWidth?: boolean;
  children: React.ReactNode;
}

export const DropMenu: React.FC<DropMenuProps> = ({ menu, className, role = 'menu', label, matchTriggerWidth, children }) => {
  const backdrop = useBackdropClose(menu.close);
  const classicUi = useClassicUi();
  const [words, setWords] = useState(false);
  useLayoutEffect(() => { setWords(classicUi && wordTrigger(menu.triggerRef.current)); }, [classicUi, menu.triggerRef]);
  const sizerRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const t = menu.triggerRef.current as HTMLElement | null, sz = sizerRef.current;
    if (!words || !t || !sz) return;
    const fit = () => {
      const w = Math.ceil(sz.offsetWidth);
      if (!(w > 0)) { t.style.minWidth = ''; return; }
      t.style.minWidth = `${w}px`;
      const tr = t.getBoundingClientRect();
      const k = t.offsetWidth > 0 ? tr.width / t.offsetWidth : 1;
      let over = 0;
      for (let a = t.parentElement, i = 0; a && a !== document.body && i < 6; a = a.parentElement, i++) {
        const ar = a.getBoundingClientRect();
        const ka = a.offsetWidth > 0 ? ar.width / a.offsetWidth : k;
        over = Math.max(over, tr.right - (ar.right - (parseFloat(getComputedStyle(a).paddingRight) || 0) * ka));
      }
      if (over > 0.5) t.style.minWidth = `${Math.max(0, w - over / k)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(sz);
    if (t.parentElement) ro.observe(t.parentElement);
    return () => { ro.disconnect(); t.style.minWidth = ''; };
  }, [words, menu.triggerRef]);
  const sizer = words ? createPortal(
    <div ref={sizerRef} className={`${className} k-drop-words k-drop-sizer`} aria-hidden="true" inert>
      <div className="k-drop-in">{children}</div>
    </div>,
    document.body,
  ) : null;
  if (!menu.isOpen) return <>{sizer}{null}</>;
  const a = menu.anchor.current;
  const width = (matchTriggerWidth || words) && a ? a.right - a.left : 0;
  return <>{sizer}{createPortal(
    <>
      <div className={`fixed inset-0 z-[9998]${menu.leaving ? ' pointer-events-none' : ''}`} {...backdrop} />
      <div
        ref={menu.popupRef as React.RefObject<HTMLDivElement>}
        role={role}
        aria-label={label}
        className={`${className}${words ? ' k-drop-words' : ''} z-[9999] ${menu.dropClass}`}
        style={width > 0 ? { ...menu.popupStyle, width } : menu.popupStyle}
      >
        <div className="k-drop-in">{children}</div>
      </div>
    </>,
    document.body,
  )}</>;
};
