import { SMALL_FIX } from '../../game/smallFixSwitch';
import React, { useState, useRef, useEffect } from 'react';
import { useEscapeOwner } from './escapeStack';
import { createPortal } from 'react-dom';
import { useBackdropClose } from './useBackdropClose';
import { getVisualScale, onZoomChange } from '../../utils/zoomCompensation';
import { useMenuStage, MENU_OUT_MS } from '../kit/motion';
import { useLeave, holdControl, motionOff } from '../kit/presence';
import { NumberBox, SpinArrows, useSpin, stepNumber } from '../kit/NumberBox';
import { labelOfBox, openTypeSheet } from '../../utils/typeSheet';

const EDIT_IN_MS = 105;

function formatDisplay(val: number): string {
  return String(parseFloat(val.toFixed(4)));
}

interface EditableValueProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  className?: string;
  displayValue?: string;
  disabled?: boolean;
  step?: number | 'any';
  keepFraction?: boolean;
}

function spinStepOf(step: number | 'any' | undefined, min: number, max: number): number {
  if (typeof step === 'number' && step > 0) return step;
  const range = Math.abs(max - min);
  return range > 0 ? Math.pow(10, Math.floor(Math.log10(range / 100))) : 1;
}

export const EditableValue: React.FC<EditableValueProps> = ({
  value,
  onChange,
  min,
  max,
  className = '',
  displayValue,
  disabled,
  step,
  keepFraction,
}) => {
  const spinStep = spinStepOf(step, min, max);
  const live = useRef({ value, onChange });
  live.current = { value, onChange };
  const startSpin = useSpin((dir: number) => {
    const { value: v, onChange: change } = live.current;
    const next = stepNumber(v, dir, spinStep, min, max);
    if (next !== v) change(next);
  }, disabled);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const spanRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0, flipUp: false, zoom: 1 });
  const movingUntil = useRef(0);
  const holdFor = (ms: number) => {
    if (motionOff()) return;
    movingUntil.current = performance.now() + ms;
    holdControl(spanRef.current, ms);
  };

  useEffect(() => {
    if (!editing) return;
    return onZoomChange(() => setEditing(false));
  }, [editing]);

  const startEditing = () => {
    if (disabled || editing || performance.now() < movingUntil.current) return;
    if (openTypeSheet({ label: labelOfBox(spanRef.current), start: String(value), done: commitText })) { holdFor(EDIT_IN_MS); return; }
    setText(String(value));
    if (spanRef.current) {
      const pz = getVisualScale(spanRef.current) || 1;
      const rect = spanRef.current.getBoundingClientRect();
      const top = rect.top / pz;
      const bottom = rect.bottom / pz;
      const right = rect.right / pz;
      const viewH = window.innerHeight / pz;
      const viewW = window.innerWidth / pz;
      const POPUP_H = 74;
      const POPUP_W = 136;
      const MARGIN = 8;
      const flipUp = bottom + 4 + POPUP_H > viewH - MARGIN && top - 4 - POPUP_H >= MARGIN;
      setPopupPos({
        top: flipUp ? top : Math.min(bottom + 4, Math.max(MARGIN, viewH - MARGIN - POPUP_H)),
        left: Math.max(MARGIN, Math.min(right - POPUP_W, viewW - MARGIN - POPUP_W)),
        flipUp,
        zoom: pz,
      });
    }
    holdFor(EDIT_IN_MS);
    setEditing(true);
  };

  const commit = () => {
    if (!editing) return;
    holdFor(MENU_OUT_MS);
    setEditing(false);
    commitText(text);
  };

  function commitText(text: string): void {
    const parsed = parseFloat(text);
    if (isNaN(parsed) || text.trim() === '') return;
    if (SMALL_FIX.R805 && text === String(value)) return;
    let clamped = Math.min(max, Math.max(min, parsed));
    if (SMALL_FIX.R819 && !keepFraction && typeof step === 'number' && Number.isInteger(step) && step >= 1) clamped = Math.min(max, min + Math.round((clamped - min) / step) * step);
    onChange(clamped);
  }

  useEscapeOwner(() => setEditing(false), editing);
  const editStage = useMenuStage<'edit'>(editing ? 'edit' : null);
  const editBoxRef = useRef<HTMLDivElement>(null);
  useLeave(editBoxRef, editStage.leaving, 'fade');
  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const n = el.value.length;
      el.setSelectionRange(n, n);
    }
  }, [editing, editStage.shown]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

  const shown = displayValue ?? formatDisplay(value);

  const backdropProps = useBackdropClose(() => { if (performance.now() >= movingUntil.current) commit(); });

  return (
    <span
      ref={spanRef}
      data-guard
      onClick={startEditing}
      className={`${className} ${disabled ? 'cursor-default opacity-50' : 'cursor-text border-b border-dashed [border-color:color-mix(in_srgb,var(--text-tertiary)_50%,transparent)] hover:bg-[var(--surface-hover)]'} transition-colors k-value-box`}
      data-kfade-row=""
      title={disabled ? undefined : 'Click to edit'}
    >
      <span className="k-value-text k-fade">{shown}</span>
      {!disabled && (
        <SpinArrows onSpin={startSpin} />
      )}
      {editStage.shown === 'edit' && createPortal(
        <>
          <div className={`fixed inset-0 z-[9998]${editStage.leaving ? ' pointer-events-none' : ''}`} {...backdropProps} />
          <div
            ref={editBoxRef}
            className={`k-edit-value fixed z-[9999] k-fade-in ${editStage.leaving ? 'pointer-events-none' : ''}`}
            style={{
              top: popupPos.flipUp ? undefined : popupPos.top,
              bottom: popupPos.flipUp ? (window.innerHeight / popupPos.zoom - popupPos.top + 4) : undefined,
              left: popupPos.left,
              ...(popupPos.zoom !== 1 ? { zoom: popupPos.zoom } : null),
            }}
          >
            <div className="k-edit-value-title">Edit Value</div>
            <NumberBox
              ref={inputRef}
              step={spinStep}
              min={min}
              max={max}
              aria-label="Edit Value"
              value={text}
              onChange={e => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              className="k-field k-edit-value-input"
            />
          </div>
        </>,
        document.body
      )}
    </span>
  );
};
