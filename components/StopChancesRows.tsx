import React from 'react';
import type { GameModeConfig } from '../types';
import { Group, FieldRow, headerIcon } from './kit/kit';
import { NumberBox } from './kit/NumberBox';
import { HdAiBrain01 } from './ui/icons';
import { BOT_STOP_CHANCES } from '../game/botStop';

export const StopChancesRows: React.FC<{ config: GameModeConfig; onChange: (v: number[]) => void }> = ({ config, onChange }) => {
  const now = config.stopChances ?? BOT_STOP_CHANCES;
  return (
    <Group title="Bots Stop Upgrading" icon={headerIcon(HdAiBrain01)}>
      {[0, 1, 2, 3].map(i => (
        <FieldRow key={i} label={`Chance To Stop At Tier ${i + 1}`} help="The chance in % that a bot stays on a tank of this tier and upgrades no further. A bot rolls on each tank it stands on. A Dreadnought never stops, whatever this says.">
          <NumberBox className="k-field k-ev-num" value={now[i] ?? 0} min={0} max={100} aria-label={`Chance to stop at tier ${i + 1}`}
            onChange={e => { const n = Number(e.target.value); const next = [...now]; next[i] = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; onChange(next); }} />
        </FieldRow>
      ))}
    </Group>
  );
};
