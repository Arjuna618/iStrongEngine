import React, { useState } from 'react';
import type { GameModeConfig } from '../types';
import { Group, FieldRow, headerIcon } from './kit/kit';
import { NumberBox } from './kit/NumberBox';
import { HdBoxingGlove01 } from './ui/icons';
import { TANK_KINDS, DEBUFF_RESIST_MIN, DEBUFF_HEALTH_MIN, DEBUFF_HEALTH_MAX, type TankKindId, type TankDebuff } from '../game/tankDebuffs';

export const DebuffBox: React.FC<{ value: number | undefined; min: number; max: number; step?: number; placeholder: string; label: string; onChange: (v: number | undefined) => void }> = ({ value, min, max, step, placeholder, label, onChange }) => {
  const [text, setText] = useState<string | null>(null);
  return (
    <NumberBox className="k-field k-ev-num" value={text !== null ? text : (value ?? '')} min={min} max={max} step={step} placeholder={placeholder} aria-label={label}
      onFocus={() => setText(value === undefined ? '' : String(value))}
      onChange={e => { const t = e.target.value; setText(t); const s = t.trim(); const v = Number(s); if (s === '') onChange(undefined); else if (Number.isFinite(v)) onChange(v); }}
      onBlur={() => setText(null)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
};

export const TankDebuffsCard: React.FC<{ config: GameModeConfig; onChange: (kind: TankKindId, patch: TankDebuff) => void }> = ({ config, onChange }) => (
  <Group title="Tank Debuffs" icon={headerIcon(HdBoxingGlove01)}>
    {TANK_KINDS.map(k => {
      const d = config.tankDebuffs?.[k.id];
      return (
        <React.Fragment key={k.id}>
          <FieldRow label={`${k.one} Resist`}
            help={`How much of each hit a ${k.one} shrugs off in this mode. Empty: its own ${k.fileResist}, which makes it almost unkillable. At 1 it takes hits like an ordinary tank, and a first hit takes its whole shield.`}>
            <DebuffBox value={d?.resist} min={DEBUFF_RESIST_MIN} max={k.fileResist} step={0.1} placeholder={String(k.fileResist)} label={`${k.one} resist`}
              onChange={v => onChange(k.id, { resist: v })} />
          </FieldRow>
          <FieldRow label={`${k.one} Health`}
            help={`How much of its own health a ${k.one} keeps in this mode. Empty: all of it. Measured on a server: with Resist 1 and 71 %, a full offense Annihilator kills a Dominator in about 13 shots.`}>
            <span className="k-ev-numbox">
              <DebuffBox value={d?.health} min={DEBUFF_HEALTH_MIN} max={DEBUFF_HEALTH_MAX} placeholder="100" label={`${k.one} health`}
                onChange={v => onChange(k.id, { health: v })} />
              <span className="k-unit">%</span>
            </span>
          </FieldRow>
        </React.Fragment>
      );
    })}
  </Group>
);
