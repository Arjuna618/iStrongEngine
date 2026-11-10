import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPopup } from './useFloatingPopup';
import { useBackdropClose } from './useBackdropClose';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

function safeHexToHsv(hex: string): [number, number, number] | null {
  return HEX6_RE.test(hex) ? hexToHsv(hex) : null;
}

function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function hueToHex(h: number): string {
  return hsvToHex(h, 1, 1);
}

const PRESET_COLORS: string[] = [
  '#3ca4cb', '#e03e41', '#8abc3f', '#cc669c', '#ef99c3', '#8e6bdf',
  '#b9e87d', '#e6896d', '#efc74b', '#9872ef', '#c6f886', '#fdf380',
  '#eec74c', '#f099c4', '#7adabc', '#7adbba', '#e8eaf7', '#716f70',
];

const PresetGrid: React.FC<{
  selected: string;
  onSelect: (color: string) => void;
}> = ({ selected, onSelect }) => (
  <div className="grid grid-cols-6 gap-2 mb-3">
    {PRESET_COLORS.map((color, i) => {
      const isSelected = selected.toLowerCase() === color.toLowerCase();
      return (
        <button
          key={`${color}-${i}`}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(color)}
          className="k-swatch w-7 h-7 rounded-lg cursor-pointer"
          style={{
            backgroundColor: color,
            outline: isSelected ? '2px solid var(--accent)' : 'none',
            outlineOffset: '2px',
          }}
        />
      );
    })}
  </div>
);

const SaturationValuePicker: React.FC<{
  hue: number;
  saturation: number;
  brightness: number;
  onChange: (s: number, v: number) => void;
  onDragStateChange: (dragging: boolean) => void;
}> = ({ hue, saturation, brightness, onChange, onDragStateChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handlePointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    onChangeRef.current(s, v);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    try { el.setPointerCapture(e.pointerId); } catch { }
    onDragStateChange(true);
    handlePointer(e);

    const pointerId = e.pointerId;
    const onMove = (ev: PointerEvent) => { if (ev.pointerId === pointerId) handlePointer(ev); };
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
      onDragStateChange(false);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
  }, [handlePointer, onDragStateChange]);

  const hueHex = hueToHex(hue);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg cursor-crosshair overflow-hidden"
      style={{ height: 140, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
    >
      <div className="absolute inset-0" style={{ backgroundColor: hueHex }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #ffffff, transparent)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, #000000)' }} />
      <div
        className="absolute w-3.5 h-3.5 rounded-full border-2 border-white pointer-events-none"
        style={{
          left: `${saturation * 100}%`,
          top: `${(1 - brightness) * 100}%`,
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 2px rgba(0,0,0,0.6)',
        }}
      />
    </div>
  );
};

const HueSlider: React.FC<{
  hue: number;
  onChange: (h: number) => void;
  onDragStateChange: (dragging: boolean) => void;
}> = ({ hue, onChange, onDragStateChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handlePointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChangeRef.current(pct * 360);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = trackRef.current;
    if (!el) return;
    try { el.setPointerCapture(e.pointerId); } catch { }
    onDragStateChange(true);
    handlePointer(e);

    const pointerId = e.pointerId;
    const onMove = (ev: PointerEvent) => { if (ev.pointerId === pointerId) handlePointer(ev); };
    const onEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
      onDragStateChange(false);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
  }, [handlePointer, onDragStateChange]);

  return (
    <div
      ref={trackRef}
      className="relative w-full h-3 rounded-full cursor-pointer mt-2"
      style={{
        background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
    >
      <div
        className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-white pointer-events-none"
        style={{
          left: `${(hue / 360) * 100}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 3px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  );
};

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  size?: 'sm' | 'md';
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, size = 'md' }) => {
  const { triggerRef, popupRef, isOpen, toggle, close, popupStyle, leaving, dropClass } = useFloatingPopup({
    claimsEscape: true,
    estimatedWidth: 248,
    estimatedHeight: 334,
  });

  const [hsv, setHsv] = useState<[number, number, number]>(() => safeHexToHsv(value) ?? [0, 0, 0]);
  const [hexInput, setHexInput] = useState(value);

  const prevValue = useRef(value);
  const draggingRef = useRef(false);
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  useEffect(() => {
    if (value !== prevValue.current && !draggingRef.current) {
      prevValue.current = value;
      const parsed = safeHexToHsv(value);
      if (parsed) setHsv(parsed);
      setHexInput(value);
    }
  }, [value]);

  const handleDragStateChange = useCallback((dragging: boolean) => {
    draggingRef.current = dragging;
    if (!dragging) {
      const v = latestValueRef.current;
      if (v !== prevValue.current) {
        prevValue.current = v;
        const parsed = safeHexToHsv(v);
        if (parsed) setHsv(parsed);
        setHexInput(v);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen && draggingRef.current) handleDragStateChange(false);
  }, [isOpen, handleDragStateChange]);

  const updateFromHsv = useCallback((h: number, s: number, v: number) => {
    setHsv([h, s, v]);
    const hex = hsvToHex(h, s, v);
    setHexInput(hex);
    prevValue.current = hex;
    onChange(hex);
  }, [onChange]);

  const handlePreset = useCallback((color: string) => {
    prevValue.current = color;
    onChange(color);
    setHsv(hexToHsv(color));
    setHexInput(color);
  }, [onChange]);

  const handleHexInput = useCallback((rawValue: string) => {
    const withHash = '#' + rawValue;
    setHexInput(withHash);
    if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
      const lower = withHash.toLowerCase();
      prevValue.current = lower;
      onChange(lower);
      setHsv(hexToHsv(lower));
    }
  }, [onChange]);

  const handleHexBlur = useCallback(() => {
    const cleaned = hexInput.startsWith('#') ? hexInput : '#' + hexInput;
    if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
      setHexInput(cleaned.toLowerCase());
    } else {
      setHexInput(value);
    }
  }, [hexInput, value]);

  const swatchClass = size === 'sm'
    ? 'w-6 h-6 rounded'
    : 'w-8 h-6 rounded';

  const backdropProps = useBackdropClose(close);

  return (
    <>
      <div
        ref={triggerRef as React.RefObject<HTMLDivElement>}
        onClick={(e) => toggle(e.currentTarget.getBoundingClientRect())}
        className={`${swatchClass} border border-[var(--border-subtle)] cursor-pointer hover:ring-2 hover:[--tw-ring-color:color-mix(in_srgb,var(--accent)_20%,transparent)] transition-shadow shrink-0`}
        style={{ backgroundColor: value }}
      />
      {isOpen && createPortal(
        <>
          <div className={`fixed inset-0 z-[9998]${leaving ? ' pointer-events-none' : ''}`} {...backdropProps} />
          <div
            ref={popupRef as React.RefObject<HTMLDivElement>}
            className={`fixed z-[9999] bg-[var(--k-popover)] rounded-lg border border-[var(--alpha-card-border)] shadow-[var(--k-drop-shadow)] p-3 ${dropClass}`}
            style={{ ...popupStyle, width: 240, boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="k-drop-in">
            <PresetGrid selected={hexInput} onSelect={handlePreset} />
            <SaturationValuePicker
              hue={hsv[0]}
              saturation={hsv[1]}
              brightness={hsv[2]}
              onChange={(s, v) => updateFromHsv(hsv[0], s, v)}
              onDragStateChange={handleDragStateChange}
            />
            <HueSlider
              hue={hsv[0]}
              onChange={(h) => updateFromHsv(h, hsv[1], hsv[2])}
              onDragStateChange={handleDragStateChange}
            />
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-[var(--text-tertiary)] tabular-nums">#</span>
              <input
                type="text"
                value={hexInput.replace('#', '')}
                onChange={e => handleHexInput(e.target.value)}
                onBlur={handleHexBlur}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleHexBlur(); }
                }}
                maxLength={6}
                className="k-text-in flex-1 border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-xs tabular-nums text-[var(--text-primary)] bg-[var(--surface-input)]"
              />
            </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
};
