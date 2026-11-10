import React, { useCallback, useEffect, useRef } from 'react';
import { X, ChevronRight } from '../ui/icons';
import { IconButton, Switch } from '../kit/kit';
import { ThemeSwitch } from '../kit/ThemeSwitch';
import { titleIcon } from '../kit/Modal';
import { SwapText } from '../kit/Collapse';
import { HelpTooltip } from '../shared/HelpTooltip';
import { registerTextFadeRoot } from './textFade';
import { useFocusScope } from '../kit/focusScope';
import { isTouchScreen } from '../../utils/device';
import { useModalMaxHeight, useModalMaxWidth } from '../../utils/useMenuScale';

export const GAME_MENU_W = 380;

interface GameMenuCardProps {
  icon: React.ReactNode;
  title: string;
  titleTip?: string;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  fitted?: boolean;
  width?: number;
}

export const GameMenuCard = React.forwardRef<HTMLDivElement, GameMenuCardProps>(function GameMenuCard(
  { icon, title, titleTip, subtitle, onClose, closeLabel = 'Close', className, footer, children, fitted = false, width = GAME_MENU_W }, ref,
) {
  const own = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback((el: HTMLDivElement | null) => {
    own.current = el;
    if (typeof ref === 'function') ref(el); else if (ref) ref.current = el;
  }, [ref]);
  useEffect(() => (own.current ? registerTextFadeRoot(own.current) : undefined), []);
  useFocusScope(own);
  const touch = isTouchScreen() && !fitted;
  const maxW = useModalMaxWidth();
  const maxH = useModalMaxHeight();
  return (
    <div ref={setRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={['k-modal k-game-menu', className].filter(Boolean).join(' ')}
      style={touch ? { width: Math.min(width, maxW), maxHeight: maxH } : { width }}>
      <header className="k-modal-head">
        <span className="k-modal-icon">{titleIcon(icon)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="k-modal-title truncate" title={titleTip}><SwapText className="truncate">{title}</SwapText></h2>
          {subtitle != null && <div className="k-game-menu-sub">{subtitle}</div>}
        </div>
        <ThemeSwitch />
        {onClose && <IconButton label={closeLabel} onClick={onClose}><X size={18} /></IconButton>}
      </header>
      <div className={touch ? 'k-modal-body k-game-menu-body overflow-y-auto popup-scrollbar' : 'k-modal-body k-game-menu-body'}>{children}</div>
      {footer && <footer className="k-modal-foot k-game-menu-foot">{footer}</footer>}
    </div>
  );
});

export const MenuCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="k-gm-card">{children}</div>
);

export const MenuDoor: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; help?: string }> = ({ icon, label, onClick, help }) => (
  <button type="button" className="k-gm-item k-gm-door" onClick={onClick}>
    <span className="k-gm-icon">{icon}</span>
    <span className="k-gm-label">
      {help && <span className="k-row-lead"><HelpTooltip text={help} /></span>}
      <span className="truncate">{label}</span>
    </span>
    <ChevronRight size={14} className="k-gm-chevron" />
  </button>
);

export const MenuSwitch: React.FC<{ icon: React.ReactNode; label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; id?: string }> = ({ icon, label, help, checked, onChange, id }) => (
  <label className="k-gm-item k-row-click" htmlFor={id}>
    <span className="k-gm-icon">{icon}</span>
    <span className="k-gm-label">
      {help && <span className="k-row-lead"><HelpTooltip text={help} /></span>}
      <span className="truncate">{label}</span>
    </span>
    <Switch checked={checked} onChange={onChange} label={label} id={id} />
  </label>
);

export const KeyChip: React.FC<{ children: React.ReactNode }> = ({ children }) => <kbd className="k-btn-kbd">{children}</kbd>;
