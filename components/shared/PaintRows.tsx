import React from 'react';
import type { MapPaint } from '../../types';
import { ColorMapControl, ColorMapSwitch } from './ColorMapField';
import type { ColorMapValue } from './colorMapRules';
import { SliderRow } from './mapDesignerControls';
import { CM_USE, CM_FREE, cmHex } from '../../utils/colorMap';
import { PAINT_DEFAULT_SLOT } from '../../game/MapSystem';

const HEX = /^#[0-9a-fA-F]{6}$/;

export function paintValue(p: MapPaint | null | undefined): ColorMapValue {
  if (p && typeof p.slot === 'number' && p.slot >= 0) return { color: cmHex(p.slot, false, CM_USE.GENERAL), colorMap: p.slot, colorFree: p.hex && HEX.test(p.hex) ? p.hex : undefined };
  if (p && p.hex && HEX.test(p.hex)) return { color: p.hex, colorMap: CM_FREE, colorFree: undefined };
  return { color: cmHex(PAINT_DEFAULT_SLOT, false, CM_USE.GENERAL), colorMap: PAINT_DEFAULT_SLOT, colorFree: undefined };
}

function paintOf(v: ColorMapValue, opacity: number): MapPaint {
  const named = typeof v.colorMap === 'number' && v.colorMap >= 0;
  const free = named ? v.colorFree : v.color;
  const out: MapPaint = {};
  if (named) out.slot = v.colorMap as number;
  if (free && HEX.test(free)) out.hex = free;
  if (opacity < 1) out.opacity = opacity;
  return out;
}

export const PaintRows: React.FC<{
  what: 'Wall' | 'Rock';
  paint: MapPaint | null | undefined;
  onChange: (p: MapPaint) => void;
  whose: string;
}> = ({ what, paint, onChange, whose }) => {
  const value = paintValue(paint);
  const opacity = paint && typeof paint.opacity === 'number' && Number.isFinite(paint.opacity) ? Math.max(0.05, Math.min(1, paint.opacity)) : 1;
  const thing = what === 'Wall' ? 'walls' : 'rocks';
  return (
    <div className="space-y-2">
      <ColorMapControl value={value} use={CM_USE.GENERAL} onChange={v => onChange(paintOf(v, opacity))} label={`${what} Color`}
        help={`The color of ${whose}. With Color Map on it is a named color that follows light and dark mode. The usual one is Walls.`} />
      <ColorMapSwitch value={value} use={CM_USE.GENERAL} compact onChange={v => onChange(paintOf(v, opacity))} />
      <SliderRow label={`${what} Opacity`} value={Math.round(opacity * 100)} onChange={v => onChange(paintOf(value, Math.max(5, Math.min(100, v)) / 100))}
        min={5} max={100} step={1} suffix="%" tooltip={`How solid ${whose} look. Under 100 percent you see the ground through them, and ${thing} that touch show a darker line where their edges lie over each other. Only the look changes.`} />
    </div>
  );
};
