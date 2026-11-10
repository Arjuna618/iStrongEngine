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
  skillCaps: Record<UpgradeStat, number>;
  statNamesType?: StatNamesType;
  onConfirm: (caps: Record<UpgradeStat, number>) => void;
  onClose: () => void;
}

export const SkillCapsPopup: React.FC<Props> = ({ skillCaps, statNamesType, onConfirm, onClose }) => {
  const dark = useGameDark();
  const [local, setLocal] = useState<Record<UpgradeStat, number>>({ ...skillCaps });
  const update = (stat: UpgradeStat, val: number) => setLocal(prev => ({ ...prev, [stat]: val }));
  return (
    <Modal title="Configure Skill Caps" icon={<SlidersHorizontal size={18} />} size="md" width={480} onClose={onClose}
      footer={(close) => <>
        <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={close}>Return</button>
        <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => onConfirm(local)}>Confirm</button>
      </>}>
      <div className="k-stat-rows">
        {STAT_IDS.map(id => (
          <div key={id} className="k-stat-row">
            <span className="k-dot" style={{ backgroundColor: hudStatDot(id, dark, STAT_COLORS[id]) }} />
            <span className="k-stat-name">{getStatLabel(id, statNamesType)}</span>
            <input type="range" min="0" max="30" step="1" value={local[id]} onChange={e => update(id, parseInt(e.target.value))} className="flex-1 min-w-0" style={sliderFillStyle(local[id], 0, 30)} />
            <span className="k-stat-value">{local[id]}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
};
