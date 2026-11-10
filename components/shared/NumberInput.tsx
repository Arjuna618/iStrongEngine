import React, { useState, useCallback, useRef } from 'react';
import { NumberBox } from '../kit/NumberBox';

export const NUMBER_INPUT_BASE = 'k-text-in border border-[var(--border-default)] rounded-lg px-3 h-8 text-sm tabular-nums text-left bg-[var(--surface-input)] text-[var(--text-primary)] shadow-[var(--shadow-input)]';

interface NumberInputProps {
  value: number | string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  arrows?: boolean;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value, onChange, min, max, step, placeholder, className, disabled, id, arrows,
}) => {
  const [localText, setLocalText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = useCallback(() => {
    setLocalText(String(value));
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalText(e.target.value);
    const v = parseFloat(e.target.value);
    if (isFinite(v)) onChange(e);
  }, [onChange]);

  const handleBlur = useCallback(() => {
    setLocalText(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  return (
    <NumberBox
      ref={inputRef}
      id={id}
      arrows={arrows}
      value={localText !== null ? localText : value}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      className={className ?? NUMBER_INPUT_BASE}
    />
  );
};
