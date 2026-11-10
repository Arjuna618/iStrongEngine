import React, { useState } from 'react';
import { RotateCcw } from './ui/icons';
import { GameLogic } from '../game/GameLogic';
import { TeamBotKey, TeamBotSettings, UpgradeLogic, createDefaultTeamBotSettings } from '../types';
import { Modal } from './kit/Modal';
import { NumberField, SelectRow, ToggleRow, SliderRow } from './kit/kit';

interface Props {
  logic: GameLogic;
  teamKey: TeamBotKey;
  teamLabel: string;
  teamColor: string;
  onClose: () => void;
}

const UPGRADE_OPTIONS: Record<string, string> = {
  'OffensiveWeighted': 'Offensive Weighted: Zero defense, all offense (Recommended)',
  'ByOrder': 'By Order: Cycles through stats sequentially',
  'Random': 'Random: Equal probability for all stats',
};

export const TeamBotSettingsPopup: React.FC<Props> = ({ logic, teamKey, teamLabel, teamColor, onClose }) => {
  const stored = logic.state.teamBotSettings[teamKey];

  const [baseLevel, setBaseLevel] = useState(stored.baseLevel);
  const [upgradeLogic, setUpgradeLogic] = useState<UpgradeLogic>(stored.upgradeLogic);
  const [forceAutospin, setForceAutospin] = useState(stored.forceAutospin);
  const [forceAutoshoot, setForceAutoshoot] = useState(stored.forceAutoshoot);
  const [useHardcodedColor, setUseHardcodedColor] = useState(stored.useHardcodedColor);
  const [aimbotStrength, setAimbotStrength] = useState(stored.aimbotStrength);
  const [turnSpeed] = useState(stored.turnSpeed);

  const handleSave = () => {
    const s: TeamBotSettings = {
      overridden: true,
      baseLevel, upgradeLogic, forceAutospin, forceAutoshoot,
      useHardcodedColor, aimbotStrength, turnSpeed,
    };
    logic.setTeamBotSettings(teamKey, s);
  };

  const handleReset = () => {
    logic.setTeamBotSettings(teamKey, createDefaultTeamBotSettings());
  };

  const handleLevelChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) setBaseLevel(Math.max(0, Math.min(100, num)));
    else if (value === '') setBaseLevel(0);
  };

  return (
    <Modal title={`${teamLabel} Settings`} icon={<span className="k-dot" style={{ backgroundColor: teamColor }} />} size="sm" width={400} z={50} onClose={onClose}
      themeSwitch
      footer={close => <>
        <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={() => close(() => { handleReset(); onClose(); })} title="Return this team to automatic settings">
          <RotateCcw size={15} /> Reset to Automatic
        </button>
        <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => close(() => { handleSave(); onClose(); })}>Save</button>
      </>}>
      <div className="k-stack">
        <NumberField id="team-bot-level" label="Base Level (0 to 100)" value={baseLevel} onChange={(e) => handleLevelChange(e.target.value)} min={0} max={100}
          help="Higher levels get more stat points automatically invested." />
        <SelectRow label="Upgrade Logic" help="How the bots spend their skill points: Offensive Weighted goes almost all in on attack, By Order cycles through the stats, Random picks freely." value={upgradeLogic} onChange={(val) => setUpgradeLogic(val as UpgradeLogic)} options={UPGRADE_OPTIONS} />
        <ToggleRow label="Force Autospin" description="Every bot on the team rotates constantly." checked={forceAutospin} onChange={setForceAutospin} />
        <ToggleRow label="Force Autoshoot" description="Every bot fires nonstop even with no target." checked={forceAutoshoot} onChange={setForceAutoshoot} />
        <ToggleRow label="Use Hardcoded Color" description="Bots keep their tank design colors." help="Bots keep their tank design colors instead of the team color. Team membership is unchanged. A tank with Keep Own Color turned on in its design keeps its colors even when this is off."
          checked={useHardcodedColor} onChange={setUseHardcodedColor} />
        <SliderRow label="Aimbot Strength" value={aimbotStrength} onChange={setAimbotStrength} min={0} max={100} step={1} unit="%"
          minLabel="0% No prediction" maxLabel="100% Perfect prediction"
          help="How far ahead of a moving target bots aim. Saving applies this to the whole team, so evolved forms no longer switch to their AI Behavior Category value." />
      </div>
    </Modal>
  );
};
