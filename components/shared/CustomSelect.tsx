import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Plus } from '../ui/icons';
import { useFloatingPopup } from './useFloatingPopup';
import { useBackdropClose } from './useBackdropClose';
import { getVisualScale } from '../../utils/zoomCompensation';
import { SwapInPlace } from '../kit/Collapse';
import { useRowWindow } from '../kit/LongList';
import { scrollGlide, nearestScrollTop } from '../kit/presence';

export type SelectOption = { value: string; label: string; disabled?: boolean; swatch?: string };
export type SelectGroup = { label: string; options: SelectOption[] };

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options?: Record<string, string> | SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  groups?: SelectGroup[];
  addLabel?: string;
}

const SWATCH_CLS = 'inline-block w-3 h-3 rounded-sm border border-[var(--alpha-card-border)] mr-2 align-[-1px]';

function normalizeOptions(options?: Record<string, string> | SelectOption[]): SelectOption[] {
  if (!options) return [];
  if (Array.isArray(options)) return options;
  return Object.entries(options).map(([k, v]) => ({ value: k, label: v }));
}

const OptionItem: React.FC<{
  opt: SelectOption;
  selected: boolean;
  onSelect: (val: string) => void;
  active?: boolean;
  innerRef?: (el: HTMLButtonElement | null) => void;
}> = ({ opt, selected, onSelect, active, innerRef }) => (
  <button
    type="button"
    ref={innerRef}
    data-kfade-row=""
    disabled={opt.disabled}
    tabIndex={-1}
    onMouseDown={e => e.preventDefault()}
    onClick={() => { if (!opt.disabled) onSelect(opt.value); }}
    className={`w-full text-left px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors flex items-center justify-between gap-2 ${
      opt.disabled
        ? 'text-[var(--text-tertiary)] opacity-50 cursor-not-allowed'
        : selected
        ? 'bg-[var(--alpha-selected)] text-[var(--text-primary)] [font-weight:var(--fw-head)] cursor-pointer'
        : active
        ? 'bg-[var(--alpha-hover)] text-[var(--text-primary)] cursor-pointer'
        : 'text-[var(--text-secondary)] hover:bg-[var(--alpha-hover)] hover:text-[var(--text-primary)] cursor-pointer'
    }`}
  >
    <span className="truncate min-w-0">
      {opt.swatch && <span aria-hidden="true" className={SWATCH_CLS} style={{ background: opt.swatch }} />}
      {opt.label}
    </span>
    {selected && !opt.disabled && <Check size={14} className="shrink-0 text-[var(--accent)]" />}
  </button>
);

const LONG_LIST = 40;
type LongRow = { key: string; head: string; first: boolean } | { key: string; opt: SelectOption; idx: number };
const LongOptions: React.FC<{ groups?: SelectGroup[]; options: SelectOption[]; value: string; activeIndex: number; onSelect: (v: string) => void }> = ({ groups, options, value, activeIndex, onSelect }) => {
  const rows = useMemo(() => {
    const out: LongRow[] = [];
    let idx = -1;
    if (groups) groups.forEach((g, gi) => { out.push({ key: `h${gi}`, head: g.label, first: gi === 0 }); for (const opt of g.options) { idx++; out.push({ key: `o${idx}`, opt, idx }); } });
    else for (const opt of options) { idx++; out.push({ key: `o${idx}`, opt, idx }); }
    return out;
  }, [groups, options]);
  const win = useRowWindow(rows.length, i => rows[i].key, 30);
  useEffect(() => { if (activeIndex >= 0) win.reveal(`o${activeIndex}`); }, [activeIndex]);
  const space = (h: number): React.CSSProperties => ({ height: h, ['--vl-row' as string]: '30px' });
  return (
    <div ref={el => { win.box.current = el; win.rows.current = el; }}>
      {win.above > 0 ? <div key="above" className="k-vl-skel" style={space(win.above)} aria-hidden="true" /> : null}
      {rows.slice(win.a, win.b).map(r => ('head' in r
        ? <div key={r.key} data-ll={r.key}>{!r.first && <div className="border-t border-[var(--alpha-divider)] my-1" />}<div className="px-3 py-1 eyebrow">{r.head}</div></div>
        : <div key={r.key} data-ll={r.key}><OptionItem opt={r.opt} selected={r.opt.value === value} onSelect={onSelect} active={r.idx === activeIndex} /></div>))}
      {win.below > 0 ? <div key="below" className="k-vl-skel" style={space(win.below)} aria-hidden="true" /> : null}
    </div>
  );
};

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value, onChange, options, placeholder, className, disabled, groups, addLabel,
}) => {
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);

  const [menuWidth, setMenuWidth] = useState<number | undefined>(undefined);

  const { triggerRef, popupRef, isOpen, toggle, close, popupStyle, leaving, dropClass, moving } = useFloatingPopup({
    claimsEscape: true,
    estimatedHeight: 256,
    estimatedWidth: menuWidth,
  });

  const toggleAt = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    if (!isOpen) setMenuWidth(rect.width / (getVisualScale(el) || 1));
    toggle(rect);
  };

  const selectedLabel = useMemo(() => {
    if (groups) {
      for (const g of groups) {
        const found = g.options.find(o => o.value === value);
        if (found) return found.label;
      }
      return placeholder || '';
    }
    const found = normalizedOptions.find(o => o.value === value);
    return found?.label || placeholder || '';
  }, [value, normalizedOptions, groups, placeholder]);

  const selectedSwatch = useMemo(
    () => (groups ? undefined : normalizedOptions.find(o => o.value === value)?.swatch),
    [value, normalizedOptions, groups]);

  const handleSelect = (val: string) => {
    if (moving()) return;
    onChange(val);
    close();
  };

  const backdropProps = useBackdropClose(close);

  const flatOptions = useMemo(() => {
    if (!groups) return normalizedOptions;
    const out: SelectOption[] = [];
    for (const g of groups) for (const o of g.options) out.push(o);
    return out;
  }, [groups, normalizedOptions]);

  const [activeIndex, setActiveIndex] = useState(-1);
  const optionEls = useRef<(HTMLButtonElement | null)[]>([]);
  const typeAhead = useRef('');
  const typeAheadAt = useRef(0);

  const step = (from: number, dir: 1 | -1): number => {
    let i = from;
    for (;;) {
      const next = i + dir;
      if (next < 0 || next >= flatOptions.length) return i < 0 ? from : i;
      i = next;
      if (!flatOptions[i].disabled) return i;
    }
  };

  const firstSelectable = (dir: 1 | -1): number => {
    const start = dir === 1 ? -1 : flatOptions.length;
    return step(start, dir);
  };

  const openMenu = (preferIndex: number) => {
    const el = triggerRef.current as HTMLElement | null;
    if (!el) return;
    setActiveIndex(preferIndex);
    toggleAt(el);
  };

  const selectedIndex = () => flatOptions.findIndex(o => o.value === value);

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const k = e.key;

    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const dir = k === 'ArrowDown' ? 1 : -1;
      if (moving()) return;
      if (!isOpen) {
        const sel = selectedIndex();
        openMenu(sel >= 0 ? sel : firstSelectable(dir));
      } else {
        setActiveIndex(prev => (prev < 0 ? firstSelectable(dir) : step(prev, dir)));
      }
      return;
    }

    if (k === 'Home' || k === 'End') {
      if (!isOpen) return;
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex(firstSelectable(k === 'Home' ? 1 : -1));
      return;
    }

    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      e.stopPropagation();
      if (moving()) return;
      if (!isOpen) {
        const sel = selectedIndex();
        openMenu(sel >= 0 ? sel : firstSelectable(1));
      } else if (!leaving && activeIndex >= 0 && activeIndex < flatOptions.length && !flatOptions[activeIndex].disabled) {
        handleSelect(flatOptions[activeIndex].value);
      }
      return;
    }

    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typeAhead.current = (now - typeAheadAt.current > 800 ? '' : typeAhead.current) + k.toLowerCase();
      typeAheadAt.current = now;
      const term = typeAhead.current;
      const hit = flatOptions.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(term));
      if (hit < 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (!isOpen) openMenu(hit); else setActiveIndex(hit);
    }
  };

  useEffect(() => {
    if (!isOpen || activeIndex < 0 || flatOptions.length > LONG_LIST) return;
    const el = optionEls.current[activeIndex];
    const box = popupRef.current as HTMLDivElement | null;
    if (!el || !box) return;
    const to = nearestScrollTop(box, el.offsetTop, el.offsetHeight);
    if (to != null) scrollGlide(box, to);
  }, [activeIndex, isOpen, popupRef]);

  useEffect(() => { if (!isOpen) setActiveIndex(-1); }, [isOpen]);

  let flatCursor = -1;

  return (
    <div className={className}>
      <button
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        type="button"
        onClick={(e) => { if (!disabled) toggleAt(e.currentTarget); }}
        onKeyDown={onTriggerKeyDown}
        onBlur={() => { if (isOpen) close(); }}
        disabled={disabled}
        className={addLabel ? 'k-btn k-btn-secondary k-btn-sm w-full' : 'k-select-trigger'}
        data-kfade-row=""
      >
        {addLabel ? <><span className="k-btn-icon"><Plus size={13} /></span><span className="truncate">{addLabel}</span></> : <>
        <SwapInPlace swapKey={value} hold={false} className="k-swap-text min-w-0">
        <span className={`block truncate ${!value && placeholder ? 'text-[var(--text-tertiary)]' : ''}`}>
          {selectedSwatch && <span aria-hidden="true" className={SWATCH_CLS} style={{ background: selectedSwatch }} />}
          {selectedLabel}
        </span>
        </SwapInPlace>
        <ChevronDown
          size={14}
          className={`text-[var(--text-tertiary)] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
        </>}
      </button>

      {isOpen && createPortal(
        <>
          <div className={`fixed inset-0 z-[9998]${leaving ? ' pointer-events-none' : ''}`} {...backdropProps} />
          <div
            ref={popupRef as React.RefObject<HTMLDivElement>}
            className={`fixed z-[9999] k-drop-glass rounded-lg border border-[var(--alpha-card-border)] p-1 max-h-64 overflow-y-auto ${flatOptions.length > LONG_LIST ? 'popup-scrollbar' : 'custom-scrollbar'} ${dropClass}`}
            style={{ ...popupStyle, width: menuWidth }}
          >
            <div className="k-drop-in">
            {flatOptions.length > LONG_LIST
              ? <LongOptions groups={groups} options={normalizedOptions} value={value} activeIndex={activeIndex} onSelect={handleSelect} />
              : groups
              ? groups.map((g, gi) => (
                  <div key={gi}>
                    {gi > 0 && <div className="border-t border-[var(--alpha-divider)] my-1" />}
                    <div className="px-3 py-1 eyebrow">
                      {g.label}
                    </div>
                    {g.options.map(o => {
                      const idx = ++flatCursor;
                      return (
                        <OptionItem
                          key={o.value} opt={o} selected={o.value === value} onSelect={handleSelect}
                          active={idx === activeIndex}
                          innerRef={el => { optionEls.current[idx] = el; }}
                        />
                      );
                    })}
                  </div>
                ))
              : normalizedOptions.map(o => {
                  const idx = ++flatCursor;
                  return (
                    <OptionItem
                      key={o.value} opt={o} selected={o.value === value} onSelect={handleSelect}
                      active={idx === activeIndex}
                      innerRef={el => { optionEls.current[idx] = el; }}
                    />
                  );
                })
            }
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
