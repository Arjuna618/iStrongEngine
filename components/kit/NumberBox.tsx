import React, { useCallback, useEffect, useRef } from 'react';
import { textBoxToStart } from '../shell/textFade';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const SPIN_HOLD_MS = 400;
const SPIN_REPEAT_MS = 60;

function decimalsOf(x: number): number {
  const s = String(x);
  const e = s.indexOf('e-');
  if (e >= 0) return Math.min(12, parseInt(s.slice(e + 2), 10) + ((s.slice(0, e).split('.')[1] ?? '').length));
  return Math.min(12, (s.split('.')[1] ?? '').length);
}

export function stepNumber(cur: number | null, dir: number, step: number, min?: number, max?: number): number {
  const lo = min ?? -Infinity, hi = max ?? Infinity;
  const base = Number.isFinite(lo) ? lo : 0;
  const s = step > 0 ? step : 1;
  if (cur == null || !Number.isFinite(cur)) return Math.min(hi, Math.max(lo, base));
  if ((dir > 0 && cur >= hi) || (dir < 0 && cur <= lo)) return cur;
  const n = (cur - base) / s;
  const k = dir > 0 ? Math.floor(n + 1e-9) + 1 : Math.ceil(n - 1e-9) - 1;
  const next = parseFloat((base + k * s).toFixed(Math.max(decimalsOf(s), decimalsOf(base))));
  return Math.min(hi, Math.max(lo, next));
}

export function useSpin(stepBy: (dir: number) => void, off?: boolean): (e: React.PointerEvent, dir: number) => void {
  const live = useRef(stepBy);
  live.current = stepBy;
  const timer = useRef(0);
  const stop = useCallback(() => { window.clearTimeout(timer.current); window.clearInterval(timer.current); timer.current = 0; }, []);
  useEffect(() => stop, [stop]);
  return useCallback((e: React.PointerEvent, dir: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (off || e.button !== 0) return;
    stop();
    live.current(dir);
    timer.current = window.setTimeout(() => { timer.current = window.setInterval(() => live.current(dir), SPIN_REPEAT_MS); }, SPIN_HOLD_MS);
    const end = () => { stop(); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, [off, stop]);
}

const SpinMark: React.FC<{ up?: boolean }> = ({ up }) => (
  <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
    <path d={up ? 'M1 4.2 L4 0.8 L7 4.2 Z' : 'M1 0.8 L4 4.2 L7 0.8 Z'} fill="currentColor" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
  </svg>
);

export const SpinArrows: React.FC<{ onSpin: (e: React.PointerEvent, dir: number) => void }> = ({ onSpin }) => (
  <span className="k-spin" onClick={e => e.stopPropagation()} onMouseDown={e => e.preventDefault()}>
    <button type="button" tabIndex={-1} aria-label="Up" onPointerDown={e => onSpin(e, 1)}><SpinMark up /></button>
    <button type="button" tabIndex={-1} aria-label="Down" onPointerDown={e => onSpin(e, -1)}><SpinMark /></button>
  </span>
);

function typeInto(el: HTMLInputElement, v: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export interface NumberBoxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'step' | 'min' | 'max'> {
  step?: number;
  min?: number;
  max?: number;
  arrows?: boolean;
}

export const NumberBox = React.forwardRef<HTMLInputElement, NumberBoxProps>(function NumberBox(
  { className, step, min, max, arrows = true, disabled, onKeyDown, inputMode, ...rest }, ref,
) {
  const own = useRef<HTMLInputElement | null>(null);
  const setRef = useCallback((el: HTMLInputElement | null) => {
    own.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
  }, [ref]);
  const stepBy = useCallback((dir: number, arrow = false) => {
    const el = own.current;
    if (!el || el.disabled) return;
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    const cur = parseFloat(el.value.replace(/,/g, ''));
    const next = stepNumber(Number.isFinite(cur) ? cur : null, dir, step ?? 1, min, max);
    if (String(next) !== el.value) typeInto(el, String(next));
    if (arrow) textBoxToStart(el);
  }, [step, min, max]);
  const spin = useSpin((dir: number) => stepBy(dir, true), disabled);
  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      stepBy(e.key === 'ArrowUp' ? 1 : -1);
    }
    onKeyDown?.(e);
  };
  const input = (cls: string | undefined) => (
    <input
      {...rest}
      ref={setRef}
      type="text"
      inputMode={inputMode ?? 'decimal'}
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      onKeyDown={keyDown}
      className={cls}
    />
  );
  if (!arrows) return input(className);
  const padDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget || disabled) return;
    e.preventDefault();
    own.current?.focus();
  };
  return (
    <span className={cx('k-numbox', className)} data-off={disabled ? '' : undefined} data-kfade-row="" onMouseDown={padDown}>
      {input('k-numbox-in')}
      {!disabled && <SpinArrows onSpin={spin} />}
    </span>
  );
});
