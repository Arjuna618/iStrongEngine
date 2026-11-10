import React, { useState, useRef, useEffect, useContext } from 'react';
import { panelMemory, usePanelScope, usePanelsVersion } from '../kit/panelMemory';
import { cardStartsOpen } from '../kit/panelFolds';
import { ChevronDown } from '../ui/icons';
import { sliderFillStyle } from './sliderMath';
import { HelpTooltip } from './HelpTooltip';
import { EditableValue } from './EditableValue';
import { Switch, useWhyTip, CardNestContext } from '../kit/kit';
import { Collapse, Fade, useFoldHandle, type FoldHandle } from '../kit/Collapse';

export function CollapsibleSection({ title, defaultOpen = false, children, count, open, onToggle, nested, icon, handle }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode; count?: number;
  handle?: React.MutableRefObject<FoldHandle | null>;
  icon?: React.ReactNode;
  open?: boolean;
  onToggle?: (next: boolean) => void;
  nested?: boolean;
}) {
  const scope = usePanelScope();
  const projKey = scope ? scope + '/' + title : null;
  const nestedIn = useContext(CardNestContext);
  const startOpen = (): boolean => (!nested && !nestedIn ? cardStartsOpen(scope, title) : undefined) ?? defaultOpen;
  const kept = (): boolean => (projKey ? panelMemory.fold(projKey) : undefined) ?? startOpen();
  const [selfOpen, setSelfOpen] = useState(kept);
  const controlled = open !== undefined && onToggle !== undefined;
  const pver = usePanelsVersion();
  const seenVer = useRef(pver);
  useEffect(() => { if (seenVer.current !== pver) { seenVer.current = pver; if (!controlled) setSelfOpen(kept()); } });
  const isOpen = controlled ? open! : selfOpen;
  const foldBusy = useRef(false);
  const toggle = () => {
    if (foldBusy.current) return;
    if (controlled) { onToggle!(!isOpen); return; }
    setSelfOpen(!selfOpen);
    if (projKey) panelMemory.setFold(projKey, !selfOpen);
  };
  const selfEl = useRef<HTMLElement | null>(null);
  useFoldHandle(handle, selfEl, isOpen, toggle);

  return (
    <section ref={selfEl} className={`k-group k-titled ${nested ? 'k-l3' : 'k-l2'}`}>
      <button type="button" onClick={toggle} aria-expanded={isOpen} className="k-group-toggle">
        <span className="k-group-head">
          <span className="k-group-title">
            {icon && <span className="k-group-icon">{icon}</span>}
            <span className="truncate">{title}</span>
            {count !== undefined && <span className="k-count">{count}</span>}
          </span>
          <ChevronDown size={14} className={`k-chevron${isOpen ? ' k-chevron-open' : ''}`} />
        </span>
      </button>
      <Collapse open={isOpen} onBusyChange={b => { foldBusy.current = b; }}><div className="k-group-main k-group-body"><CardNestContext.Provider value={true}>{children}</CardNestContext.Provider></div></Collapse>
    </section>
  );
}

export function SliderRow({ label, value, onChange, min, max, step = 1, suffix = '', display, tooltip, onPreview }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; suffix?: string;
  display?: string | ((v: number) => string);
  tooltip?: string;
  onPreview?: (v: number | null) => void;
}) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const isDragging = useRef(false);
  const latestRef = useRef(value);

  const showValue = dragValue !== null ? dragValue : value;

  let displayText: string;
  if (typeof display === 'function') {
    displayText = display(showValue);
  } else if (display !== undefined) {
    displayText = display;
  } else {
    displayText = `${showValue}${suffix}`;
  }

  return (
    <div className="k-slider-row">
      <div className="k-row">
        <span className="k-row-label">{tooltip && <span className="k-row-lead"><HelpTooltip text={tooltip} /></span>}<span className="k-row-label-text">{label}</span></span>
        <span className="k-value">
          <EditableValue
            value={showValue}
            onChange={v => onChange(v)}
            min={min}
            max={max}
            displayValue={displayText}
            step={step}
            className="k-value-field"
          />
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={showValue}
        onPointerDown={() => {
          isDragging.current = true;
          latestRef.current = value;
          setDragValue(value);
          onPreview?.(value);
        }}
        onChange={e => {
          const v = Number(e.target.value);
          if (isDragging.current) {
            latestRef.current = v;
            setDragValue(v);
            onPreview?.(v);
          } else {
            onChange(v);
          }
        }}
        onPointerUp={() => {
          if (isDragging.current) {
            isDragging.current = false;
            const final = latestRef.current;
            setDragValue(null);
            onPreview?.(null);
            if (final !== value) onChange(final);
          }
        }}
        onLostPointerCapture={() => {
          if (isDragging.current) {
            isDragging.current = false;
            const final = latestRef.current;
            setDragValue(null);
            onPreview?.(null);
            if (final !== value) onChange(final);
          }
        }}
        className="w-full"
        style={sliderFillStyle(showValue, min, max)} />
    </div>
  );
}

export function ToggleItem({ label, checked, onChange, info, desc, why, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; info?: string; desc?: string;
  why?: string;
  disabled?: boolean;
}) {
  const tip = useWhyTip(desc, why);
  return (
    <label className={`k-row k-row-click${disabled ? ' k-row-disabled' : ''}`}>
      <span className="k-row-text">
        <span className="k-row-label">
          <Fade when={tip} className="k-row-lead">{() => <HelpTooltip text={tip!} />}</Fade>
          <span className="k-row-label-text">{label}</span>
          {info && <span className="k-row-info">{info}</span>}
        </span>
      </span>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </label>
  );
}

export const SegButton: React.FC<{
  active: boolean; onClick: () => void; children?: React.ReactNode; title?: string; disabled?: boolean;
  unusable?: string;
}> = ({ active, onClick, children, title, disabled, unusable }) => {
  return (
    <button
      type="button"
      onClick={unusable ? undefined : onClick}
      title={unusable ? undefined : title}
      data-tip={unusable}
      aria-disabled={unusable ? 'true' : undefined}
      disabled={disabled}
      aria-pressed={unusable ? false : active}
      className={`k-segbtn flex-1 min-w-0 truncate${active && !unusable ? ' k-segbtn-on' : ''}`}
    >
      {children}
    </button>
  );
};
