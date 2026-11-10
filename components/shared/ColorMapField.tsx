import React, { useMemo } from 'react';
import { ColorPicker } from './ColorPicker';
import { CustomSelect } from './CustomSelect';
import { ToggleRow, FieldRow } from '../kit/kit';
import { Collapse, Fade, SwapInPlace, FOLD_FADE_MS } from '../kit/Collapse';
import { isGameDark } from '../../utils/gameColors';
import {
  type ColorMapValue, cmfIsNamed, cmfSlot, cmfSwitchOn, cmfSwitchOff, cmfPickName, cmfPickColor, cmfOptions,
} from './colorMapRules';

interface Props {
  value: ColorMapValue;
  use: number;
  onChange: (next: ColorMapValue) => void;
  normalize?: (hex: string) => string;
}

interface RowProps extends Props {
  label: React.ReactNode;
  help?: string;
  fixed?: string;
}

export const ColorMapControl: React.FC<RowProps> = ({ value, use, onChange, normalize, label, help, fixed }) => {
  const dark = isGameDark();
  const options = useMemo(() => cmfOptions(dark, use), [dark, use]);
  const locked = fixed != null;
  const named = !locked && cmfIsNamed(value);
  const shown = locked ? fixed : value.color;
  return (
    <div>
      <FieldRow label={label} help={help}>
        <Fade when={!named} delay={FOLD_FADE_MS} className="shrink-0">
          <SwapInPlace swapKey={locked}>
            <div className={`flex items-center gap-2${locked ? ' k-row-disabled' : ''}`}>
              <span className="text-xs font-mono text-[var(--text-tertiary)]">{shown}</span>
              <ColorPicker value={shown} onChange={(c) => onChange(cmfPickColor(value, normalize ? normalize(c) : c))} />
            </div>
          </SwapInPlace>
        </Fade>
      </FieldRow>
      <Collapse open={named} gapPx={6} reveal="self">
        <CustomSelect
          value={String(cmfSlot(value))}
          onChange={(v) => onChange(cmfPickName(value, Number(v), use))}
          options={options}
          className="w-full"
        />
      </Collapse>
    </div>
  );
};

export const ColorMapSwitch: React.FC<Props & { compact?: boolean }> = ({ value, use, onChange, compact }) => (
  <ToggleRow label="Color Map" description={compact ? undefined : 'A named color from the map.'}
    help="Pick a named color from the color map instead of your own. It follows light and dark mode."
    checked={cmfIsNamed(value)}
    onChange={on => onChange(on ? cmfSwitchOn(value, use) : cmfSwitchOff(value))} />
);
