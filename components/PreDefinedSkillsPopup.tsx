import React, { useState } from 'react';
import type { UpgradeStat, StatNamesType } from '../types';
import { getStatLabel } from '../types';
import { Modal } from './kit/Modal';
import { sliderFillStyle } from './shared/sliderMath';
import { SlidersHorizontal } from './ui/icons';
import { STAT_COLORS, STAT_IDS } from '../utils/gameColors';
import { hudStatDot } from '../utils/hudArras';
import { useGameDark } from '../utils/useGameTheme';

interface Props {
  preDefinedSkills: Record<UpgradeStat, number>;
  skillCaps: Record<UpgradeStat, number>;
  statNamesType?: StatNamesType;
  onConfirm: (skills: Record<UpgradeStat, number>) => void;
  onClose: () => void;
}

export const PreDefinedSkillsPopup: React.FC<Props> = ({ preDefinedSkills, skillCaps, statNamesType, onConfirm, onClose }) => {
  const dark = useGameDark();
  const [local, setLocal] = useState<Record<UpgradeStat, number>>({ ...preDefinedSkills });
  const update = (stat: UpgradeStat, val: number) => setLocal(prev => ({ ...prev, [stat]: val }));
  return (
    <Modal title="Predefined Skills" icon={<SlidersHorizontal size={18} />} size="md" width={480} onClose={onClose}
      footer={(close) => <>
        <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={close}>Return</button>
        <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => onConfirm(local)}>Confirm</button>
      </>}>
      <div className="k-stat-rows">
        {STAT_IDS.map(id => {
          const cap = skillCaps[id] || 0;
          const locked = cap === 0;
          return (
            <div key={id} className={`k-stat-row${locked ? ' k-row-disabled' : ''}`}>
              <span className="k-dot" style={{ backgroundColor: hudStatDot(id, dark, STAT_COLORS[id]) }} />
              <span className="k-stat-name">{getStatLabel(id, statNamesType)}</span>
              <input type="range" min="0" max={cap} step="1" value={Math.min(local[id], cap)} onChange={e => update(id, parseInt(e.target.value))}
                className="flex-1 min-w-0" disabled={locked} style={sliderFillStyle(Math.min(local[id], cap), 0, cap)} />
              <span className="k-stat-value">{locked ? 0 : Math.min(local[id], cap)}</span>
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
