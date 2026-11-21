import React from 'react';
import { SliderRow } from '../kit/kit';
import { partOpacityOf } from '../../utils/partOpacity';
import { snapFacingDeg } from '../../utils/facingSnap';
export function trackEnd(v: number, base: number): number {
  const a = Math.abs(Number.isFinite(v) ? v : 0);
  return a > base ? Math.ceil(a) : base;
}

export function threeDecimals(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 1000) / 1000;
  return String(r === 0 ? 0 : r);
}

export function degreesOf(rad: number): number {
  const d = (rad * 180 / Math.PI) % 360;
  return d < 0 ? d + 360 : d;
}

export function aroundPatch(x: number, y: number, stored: number, deg: number): { xOffset: number; yOffset: number; angle: number } {
  const dist = Math.sqrt(x * x + y * y), a = deg * Math.PI / 180;
  return { xOffset: dist * Math.cos(a), yOffset: dist * Math.sin(a), angle: stored + (a - Math.atan2(y, x)) };
}
export function facingPatch(stored: number, facing: number, deg: number): { angle: number } {
  return { angle: stored + (deg * Math.PI / 180 - facing) };
}

interface RowProps { label: string; help: string; value: number; onChange: (v: number) => void; disabled?: boolean }

export const PlaceRow: React.FC<RowProps & { base?: number; bound: number }> = ({ label, help, value, onChange, disabled, base = 2, bound }) => {
  const end = trackEnd(value, base);
  return <SliderRow label={label} help={help} value={value} onChange={onChange} min={-end} max={end} step="any"
    inputMin={-bound} inputMax={bound} disabled={disabled} format={threeDecimals} />;
};

export const SizeRow: React.FC<RowProps & { min: number; base: number; bound: number; suffix?: string }> = ({ label, help, value, onChange, disabled, min, base, bound, suffix }) => {
  const end = trackEnd(value, base);
  return <SliderRow label={label} help={help} value={value} onChange={onChange} min={min} max={end} step="any"
    inputMin={min} inputMax={bound} disabled={disabled} format={(v) => threeDecimals(v) + (suffix ?? '')} />;
};

export const OpacityRow: React.FC<{ help: string; value: number | undefined; onChange: (v: number | undefined) => void; disabled?: boolean }> = ({ help, value, onChange, disabled }) => (
  <SliderRow label="Opacity" help={help} value={Math.round(partOpacityOf(value) * 1000) / 10} min={0} max={100} step={1} keepFraction disabled={disabled}
    format={(v) => threeDecimals(v) + '%'}
    onChange={(v) => { const o = Math.round(Math.max(0, Math.min(100, v)) * 10) / 1000; onChange(o < 1 ? o : undefined); }} />
);

export const AngleRow: React.FC<RowProps & { snapTo?: readonly number[] | null }> = ({ label, help, value, onChange, disabled, snapTo }) => (
  <SliderRow label={label} help={help} value={value} onChange={onChange} min={0} max={360} step={1} keepFraction
    disabled={disabled} format={threeDecimals} dragSnap={snapTo !== undefined ? (v) => snapFacingDeg(v, snapTo) : undefined} />
);
