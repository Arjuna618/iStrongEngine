import type React from 'react';

export function sliderFillStyle(val: number, min: number, max: number): React.CSSProperties {
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  return { '--slider-pct': `${pct}%` } as React.CSSProperties;
}

export type SliderStep = number | 'any';

const DOMAIN_PAD = 0.15;

export function sliderDomain(min: number, max: number, val: number, step: SliderStep): { lo: number; hi: number } {
  if (typeof val !== 'number' || !isFinite(val) || (val >= min && val <= max)) return { lo: min, hi: max };
  if (step === 'any') {
    const pad = Math.abs(max - min) * DOMAIN_PAD || Math.abs(val) * DOMAIN_PAD || 1;
    return { lo: val < min ? val - pad : min, hi: val > max ? val + pad : max };
  }
  const s = Math.abs(step) || 1;
  return {
    lo: val < min ? min - Math.ceil((min - val) / s + 1) * s : min,
    hi: val > max ? max + Math.ceil((val - max) / s + 1) * s : max,
  };
}
