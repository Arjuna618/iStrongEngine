import React from 'react';
import type { UpgradeStat } from '../../types';
import { Chip, FieldRow, IconButton, RowUnit } from '../kit/kit';
import { InlineMotion } from '../kit/TagLine';
import { DropMenu, menuOpen, useDropMenu } from '../kit/DropMenu';
import { HelpTooltip } from './HelpTooltip';
import { SlidersHorizontal } from '../ui/icons';
import { DebuffBox } from '../TankDebuffsCard';
import { SHARE_STATS, STAT_SHARE_MIN, STAT_SHARE_MAX, sharesSummary, type StatShares } from '../../game/statShares';

export function withShare(s: StatShares | undefined, id: UpgradeStat, v: number | undefined): StatShares | undefined {
  const out: StatShares = { ...(s ?? {}) };
  if (v === undefined) delete out[id];
  else out[id] = Math.max(STAT_SHARE_MIN, Math.min(STAT_SHARE_MAX, v));
  return Object.keys(out).length > 0 ? out : undefined;
}

export const StatSharesGrid: React.FC<{ value: StatShares | undefined; onChange: (v: StatShares | undefined) => void; whose: string }> = ({ value, onChange, whose }) => (
  <div className="k-grid-2">
    {SHARE_STATS.map(s => (
      <label key={s.id} className="k-num">
        <span className="k-num-label"><HelpTooltip text={`${whose} ${s.name} against the file, in percent: 90 is a tenth less, 150 is half as much again. Empty: as the file.`} />{s.name}</span>
        <span className="k-strength-cell">
          <DebuffBox value={value?.[s.id]} min={STAT_SHARE_MIN} max={STAT_SHARE_MAX} step={5} placeholder="100" label={s.name}
            onChange={v => onChange(withShare(value, s.id, v))} />
          <RowUnit unit="%" />
        </span>
      </label>
    ))}
  </div>
);

export const StatSharesRow: React.FC<{ value: StatShares | undefined; onChange: (v: StatShares | undefined) => void; help: string; whose: string; asFile: string }> = ({ value, onChange, help, whose, asFile }) => {
  const menu = useDropMenu({ estimatedHeight: 330, estimatedWidth: 340 });
  const sum = sharesSummary(value);
  const stats = `${sum.moved} ${sum.moved === 1 ? 'Stat' : 'Stats'}`;
  const tags = sum.moved === 0 ? [asFile] : sum.value !== null ? [`${sum.value} %`, stats] : ['Mixed', stats];
  return (
    <>
      <FieldRow label="Strength" help={help}>
        <span className="k-ev-numfield">
          <span className="k-ev-facts"><InlineMotion items={tags.map(t => ({ key: t, node: <Chip>{t}</Chip> }))} /></span>
          <IconButton ref={menu.triggerRef as React.Ref<HTMLButtonElement>} size="sm" label="Strength, stat by stat" aria-expanded={menuOpen(menu)}
            onClick={e => menu.toggle(e.currentTarget.getBoundingClientRect())}><SlidersHorizontal size={13} /></IconButton>
        </span>
      </FieldRow>
      <DropMenu menu={menu} className="k-menu k-strength-pop popup-scrollbar" label="Strength">
        <StatSharesGrid value={value} onChange={onChange} whose={whose} />
      </DropMenu>
    </>
  );
};
