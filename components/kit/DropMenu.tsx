import React from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPopup } from '../shared/useFloatingPopup';
import { useBackdropClose } from '../shared/useBackdropClose';

export interface DropMenuOptions {
  align?: 'start' | 'end';
  estimatedHeight?: number;
  estimatedWidth?: number;
}

export function useDropMenu(opts: DropMenuOptions = {}) {
  return useFloatingPopup({
    claimsEscape: true,
    gap: 6,
    align: opts.align ?? 'start',
    estimatedHeight: opts.estimatedHeight ?? 160,
    estimatedWidth: opts.estimatedWidth,
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
  if (!menu.isOpen) return null;
  const width = matchTriggerWidth ? (menu.triggerRef.current?.getBoundingClientRect().width ?? 0) / (menu.popupZoom || 1) : 0;
  return createPortal(
    <>
      <div className={`fixed inset-0 z-[9998]${menu.leaving ? ' pointer-events-none' : ''}`} {...backdrop} />
      <div
        ref={menu.popupRef as React.RefObject<HTMLDivElement>}
        role={role}
        aria-label={label}
        className={`${className} z-[9999] ${menu.dropClass}`}
        style={width > 0 ? { ...menu.popupStyle, width } : menu.popupStyle}
      >
        <div className="k-drop-in">{children}</div>
      </div>
    </>,
    document.body,
  );
};
