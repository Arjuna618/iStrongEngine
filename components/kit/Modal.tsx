import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeOwner } from '../shared/escapeStack';
import { useBackdropClose } from '../shared/useBackdropClose';
import { usePortalMenuScale, useModalMaxHeight, useModalMaxWidth } from '../../utils/useMenuScale';

export function titleIcon(icon: React.ReactNode): React.ReactNode {
  if (!React.isValidElement(icon) || typeof icon.type === 'string') return icon;
  return React.cloneElement(icon as React.ReactElement<{ strokeWidth?: number; absoluteStrokeWidth?: boolean }>, { strokeWidth: 1.5, absoluteStrokeWidth: true });
}
import { blurFocusedField, useBlurOnUnmount } from './motion';
import { SwapText } from './Collapse';
import { useLeave } from './presence';
import { useFocusScope } from './focusScope';
import { X } from '../ui/icons';
import { IconButton, PanelFold } from './kit';
import { useAfterFirstPaint, useArrival, PanelSkeleton } from './Deferred';
import { SnapshotSkeleton, useSkeletonCapture } from './SkeletonSnapshot';
import { ThemeSwitch } from './ThemeSwitch';
import { useWindowLayer } from './windowStack';
import { isPhoneUi } from '../../utils/device';

const CLOSE_MS = 120;

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Backdrop({ onClose, z = 60, className, closing, children }: { onClose: () => void; z?: number; className?: string; closing?: boolean; children: React.ReactNode }) {
  const backdropProps = useBackdropClose(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useLeave(ref, !!closing, 'fade');
  return (
    <div ref={ref} className={cx('k-backdrop animate-fadeIn', closing && 'pointer-events-none', className)} style={{ zIndex: z }} {...backdropProps}>
      {children}
    </div>
  );
}

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';
const WIDTH: Record<ModalSize, number> = { sm: 380, md: 560, lg: 880, xl: 1180 };

interface ModalProps {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  size?: ModalSize;
  width?: number;
  headerRight?: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode | ((close: (after?: () => void) => void) => React.ReactNode);
  children: React.ReactNode;
  bodyClassName?: string;
  fit?: boolean;
  z?: number;
  closeLabel?: string;
  themeSwitch?: boolean;
  surface?: 'panel' | 'content';
  defer?: boolean;
  waitHeight?: number;
  phoneFull?: boolean;
}

const ModalCloseContext = React.createContext<((after?: () => void) => void) | null>(null);
export function useModalClose(): (after?: () => void) => void {
  const c = React.useContext(ModalCloseContext);
  return c ?? ((after?: () => void) => { after?.(); });
}

const bodyHeights = new Map<string, number>();

export function Modal({ title, icon, onClose, size = 'md', width, headerRight, subtitle, footer, children, bodyClassName, fit, z = 60, closeLabel = 'Close', themeSwitch, surface = 'panel', defer, waitHeight = 240, phoneFull }: ModalProps) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useBlurOnUnmount(dialogRef);
  const close = useCallback((after?: unknown) => {
    if (closingRef.current) return;
    closingRef.current = true;
    blurFocusedField(dialogRef.current);
    setClosing(true);
    window.setTimeout(typeof after === 'function' ? (after as () => void) : onClose, CLOSE_MS);
  }, [onClose]);
  useEscapeOwner(close);
  useFocusScope(dialogRef);
  const layer = useWindowLayer(!closing);
  useLeave(dialogRef, closing || layer.covered, 'pop');
  const menuScale = usePortalMenuScale();
  const full = !!phoneFull && isPhoneUi();
  const maxH = useModalMaxHeight(full ? 0 : undefined);
  const maxW = useModalMaxWidth(full ? 0 : undefined);
  const deferOn = defer ?? size !== 'sm';
  const painted = useAfterFirstPaint();
  const ready = painted || !deferOn;
  const bodyRef = useRef<HTMLDivElement>(null);
  const skelRef = useRef<HTMLDivElement>(null);
  const arriving = useArrival(bodyRef, skelRef, ready, deferOn);
  const skelOn = !ready || arriving;
  useLayoutEffect(() => { if (ready && deferOn && bodyRef.current) bodyHeights.set(title, bodyRef.current.scrollHeight); }, [ready, deferOn, title]);
  const waitH = Math.min(bodyHeights.get(title) ?? waitHeight, Math.max(120, maxH - 140));
  useSkeletonCapture(deferOn ? 'modal:' + title : null, bodyRef, ready);
  const flush = !!bodyClassName?.includes('k-modal-body-flush');
  return createPortal(
    <Backdrop onClose={close} z={z} closing={closing} className={layer.over ? 'k-scrim-over' : undefined}>
      <div style={{ zoom: menuScale }}>
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
          className={cx('k-modal animate-scaleUp', surface === 'content' && 'k-modal-content', full && 'k-modal-full', (closing || layer.covered) && 'pointer-events-none')}
          style={full ? { width: maxW, height: maxH } : { width: Math.min(width ?? WIDTH[size], maxW), maxHeight: maxH }} onClick={e => e.stopPropagation()}>
          <header className="k-modal-head">
            {icon && <span className="k-modal-icon">{titleIcon(icon)}</span>}
            <div className="min-w-0 flex-1">
              <h2 className="k-modal-title truncate"><SwapText className="truncate">{title}</SwapText></h2>
              {subtitle && <div className="k-modal-sub truncate"><SwapText className="truncate">{subtitle}</SwapText></div>}
            </div>
            {headerRight}
            {(themeSwitch ?? size !== 'sm') && <ThemeSwitch />}
            <IconButton label={closeLabel} onClick={close}><X size={18} /></IconButton>
          </header>
          <div ref={bodyRef} className={cx('k-modal-body', fit ? 'overflow-hidden' : 'overflow-y-auto popup-scrollbar', bodyClassName, skelOn && 'relative')}
            style={ready ? undefined : { minHeight: waitH }} aria-busy={ready ? undefined : true}>
            <ModalCloseContext.Provider value={close}><PanelFold on={false}>{ready && children}</PanelFold></ModalCloseContext.Provider>
            {skelOn && (
              <div ref={skelRef} className="k-skel-delay absolute inset-0 overflow-hidden" aria-hidden={ready || undefined}>
                <SnapshotSkeleton id={'modal:' + title} fallback={<div className={flush ? 'p-4' : 'px-5 py-4'}><PanelSkeleton /></div>} />
              </div>
            )}
          </div>
          {footer && <footer className="k-modal-foot">{typeof footer === 'function' ? footer(close) : footer}</footer>}
        </div>
      </div>
    </Backdrop>,
    document.body,
  );
}

export function ConfirmDialog({ title, icon, message, confirmLabel, cancelLabel = 'Cancel', onConfirm, onClose }: {
  title: string; icon?: React.ReactNode; message: React.ReactNode; confirmLabel: string; cancelLabel?: string; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} icon={icon} onClose={onClose} size="sm"
      footer={close => <>
        <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={() => close()}>{cancelLabel}</button>
        <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => close(() => { onConfirm(); onClose(); })}>{confirmLabel}</button>
      </>}>
      <p className="k-modal-text">{message}</p>
    </Modal>
  );
}
