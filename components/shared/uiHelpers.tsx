import React from 'react';
import { ChevronDown, Search } from '../ui/icons';
import { SliderRow, SelectRow, ToggleRow } from '../kit/kit';

export function LibrarySearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--k-search-icon)]" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="k-text-in w-full pl-7 pr-3 py-1.5 text-[11px] bg-[var(--k-search-bg)] border border-[var(--alpha-card-border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--k-placeholder)] focus:border-[var(--border-strong)] outline-none"
      />
    </div>
  );
}

import { sliderFillStyle, sliderDomain, type SliderStep } from './sliderMath';
export { sliderFillStyle, sliderDomain };
export type { SliderStep };

export const renderSlider = (
  label: string,
  val: number,
  onChange: (v: number) => void,
  min: number,
  max: number,
  step: SliderStep = 1,
  disabled?: boolean,
  tooltip?: string
) => <SliderRow label={label} help={tooltip} value={val} onChange={onChange} min={min} max={max} step={step} disabled={disabled} />;

export const renderMiniSlider = (
  label: string,
  val: number,
  onChange: (v: number) => void,
  min: number,
  max: number,
  step: SliderStep = 1,
  tooltip?: string,
  disabled?: boolean
) => <SliderRow label={label} help={tooltip} value={val} onChange={onChange} min={min} max={max} step={step} disabled={disabled} />;

export const renderDropdown = (
  label: string,
  value: string,
  options: Record<string, string>,
  onChange: (val: string) => void,
  tooltip?: string
) => <SelectRow label={label} help={tooltip} value={value} onChange={onChange} options={options} />;

export const renderSectionHeader = (
  label: string,
  isOpen: boolean,
  toggle: () => void,
  badge?: string
) => (
  <button type="button" onClick={toggle} aria-expanded={isOpen} className="k-group-toggle">
    <span className="k-group-head">
      <span className="k-group-title"><span className="truncate">{label}</span>{badge && <span className="k-count">{badge}</span>}</span>
      <ChevronDown size={14} className={`k-chevron${isOpen ? ' k-chevron-open' : ''}`} />
    </span>
  </button>
);

interface SectionHeaderProps {
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  isOpen?: boolean;
  onToggle?: () => void;
  rightContent?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  label, icon, badge, isOpen, onToggle, rightContent,
}) => {
  const title = (
    <span className="k-group-title">
      {icon && <span className="k-group-icon">{icon}</span>}
      <span className="truncate">{label}</span>
      {badge && <span className="k-count">{badge}</span>}
    </span>
  );
  if (onToggle) {
    return (
      <button type="button" onClick={onToggle} aria-expanded={!!isOpen} className="k-group-toggle">
        <span className="k-group-head">
          {title}
          <span className="flex items-center gap-2 shrink-0">{rightContent}<ChevronDown size={14} className={`k-chevron${isOpen ? ' k-chevron-open' : ''}`} /></span>
        </span>
      </button>
    );
  }
  return (
    <div className="k-section-head">
      {title}
      {rightContent && <span className="flex items-center gap-2 shrink-0">{rightContent}</span>}
    </div>
  );
};

import { NumberInput, NUMBER_INPUT_BASE } from './NumberInput';
export { NumberInput, NUMBER_INPUT_BASE };

export const renderToggle = (
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void,
  desc?: string
) => <ToggleRow label={label} description={desc} checked={checked} onChange={onChange} />;

export const SkeletonCard: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <div className={`bg-[var(--surface-elevated)] border border-[var(--alpha-card-border)] rounded-lg ${compact ? 'p-2' : 'p-3'}`}>
    <div className="flex items-start gap-2 mb-2">
      <div className="skeleton-shimmer w-[18px] h-[18px] rounded shrink-0 mt-1" />
      <div className="flex-1">
        <div className="skeleton-shimmer h-4 w-24 mb-2 rounded" />
        <div className="skeleton-shimmer h-3 w-16 rounded" />
      </div>
    </div>
    <div className={`skeleton-shimmer w-full ${compact ? 'h-8' : 'h-8'} rounded-lg`} />
  </div>
);
