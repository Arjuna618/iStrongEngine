import React from 'react';
import type { AICategorySettings, UpgradeStat } from '../types';
import { getStatLabel } from '../types';
import { STAT_COLORS, STAT_IDS } from '../utils/gameColors';
import { hudStatDot } from '../utils/hudArras';
import { useGameDark } from '../utils/useGameTheme';
import { Group, ToggleRow, SliderRow, Switch, headerIcon } from './kit/kit';
import { HdRabbit, HdAsteroid02, HdMagicWand03 } from './ui/icons';
import { Reveal } from './kit/Collapse';
import { NumberBox } from './kit/NumberBox';

function previewDistance(v: number): number {
  if (v <= 5) return 0;
  if (v <= 50) return Math.round(180 + (v - 5) / 45 * 170);
  return Math.round(350 + (v - 50) / 50 * 350);
}

function distanceLabel(v: number): string {
  if (v <= 5) return 'Now: ram mode, it charges straight in and does not circle its target.';
  return `Now: about ${previewDistance(v)} units from its target.`;
}

function fleeLabel(v: number): string {
  if (v === 0) return 'Now: never runs away on low health. It can still run from heavy damage taken quickly.';
  if (v === 20) return 'Now: 20%, the same as the game\'s own low health safety net.';
  if (v === 100) return 'Now: always tries to run away.';
  return `Now: runs away when its health drops to ${v}%.`;
}

interface Props {
  value: AICategorySettings;
  onChange: (next: AICategorySettings) => void;
}

export const AICategorySettingsPanel: React.FC<Props> = ({ value: local, onChange }) => {
  const dark = useGameDark();
  const update = <K extends keyof AICategorySettings>(key: K, val: AICategorySettings[K]) => {
    onChange({ ...local, [key]: val });
  };
  const setCulEnabled = (enabled: boolean) => {
    onChange({ ...local, customUpgradeLogic: { ...local.customUpgradeLogic, enabled } });
  };
  const priorities = local.customUpgradeLogic.priorities;
  const toggleSkill = (stat: UpgradeStat) => {
    onChange({ ...local, customUpgradeLogic: { ...local.customUpgradeLogic, priorities: { ...priorities, [stat]: priorities[stat] > 0 ? 0 : 1 } } });
  };
  const setPriorityInput = (stat: UpgradeStat, raw: string) => {
    let n = 1;
    if (raw !== '') {
      const p = parseInt(raw, 10);
      if (!Number.isFinite(p)) return;
      n = Math.max(1, Math.min(99, p));
    }
    onChange({ ...local, customUpgradeLogic: { ...local.customUpgradeLogic, priorities: { ...priorities, [stat]: n } } });
  };
  const setFillRandom = (v: boolean) => {
    onChange({ ...local, customUpgradeLogic: { ...local.customUpgradeLogic, fillRemainingRandomly: v } });
  };
  const enabledCount = STAT_IDS.reduce((acc, id) => acc + (priorities[id] > 0 ? 1 : 0), 0);

  return (
    <div className="space-y-3">
      <Group title="Movement" icon={headerIcon(HdRabbit)} level={3}>
        <SliderRow label="Distance From Target" value={local.distanceFromTarget} onChange={v => update('distanceFromTarget', Math.round(v))}
          min={0} max={100} step={1} minLabel="0 Ram" maxLabel="100 Sniper"
          help={`Where the tank likes to stand from its target. 50 is the default. ${distanceLabel(local.distanceFromTarget)}`} />
        <SliderRow label="Flee HP Threshold" value={local.fleeHpThreshold} onChange={v => update('fleeHpThreshold', Math.round(v))}
          min={0} max={100} step={1} unit="%" minLabel="0 Never" maxLabel="100 Always"
          help={`The health at which the tank runs away. 20 is the default. ${fleeLabel(local.fleeHpThreshold)}`} />
        <ToggleRow label="Force Autospin" description="The body keeps turning."
          help="Tank body continuously rotates regardless of target. Useful for smasher / spike archetypes."
          checked={local.forceAutospin} onChange={v => update('forceAutospin', v)} />
      </Group>

      <Group title="Shooting" icon={headerIcon(HdAsteroid02)} level={3}>
        <SliderRow label="Aimbot Strength" help="Aim quality for every tank in the category: its main guns, the Auto Turrets on it and the Auto Turrets on its projectiles. At 0 it aims at where the target is now; higher, it leads a moving target." value={local.aimbotStrength} onChange={v => update('aimbotStrength', Math.round(v))}
          min={0} max={100} step={1} unit="%" minLabel="0% No prediction" maxLabel="100% Perfect" />
        <ToggleRow label="Force Autoshoot" description="Fires even with no target."
          help="Tank fires continuously even without a visible target."
          checked={local.forceAutoshoot} onChange={v => update('forceAutoshoot', v)} />
        <ToggleRow label="Keep Attacking Through Cover" description="Keeps firing around walls."
          help="For drone / minion / swarm tanks. Tank keeps targeting and firing while navigating around walls or rocks. Bullets still collide normally."
          checked={local.keepAttackingThroughCover} onChange={v => update('keepAttackingThroughCover', v)} />
      </Group>

      <Group title="Skill Upgrades" icon={headerIcon(HdMagicWand03)} level={3}>
        <ToggleRow label="Custom Upgrade Logic" description="Pick the skills and their order."
          help="Pick which skills the tanks of this category upgrade, and in what order. Turn a skill on and give it a number: the number is its place in the order, not how many points it gets. 1 is upgraded first, 99 last. Skills with the same number share their points at random, and a number gets points only once every skill with a lower number is full. When off, the tank uses its normal upgrade logic (Offensive Weighted, By Order or Random)."
          checked={local.customUpgradeLogic.enabled} onChange={setCulEnabled} />
        <Reveal when={local.customUpgradeLogic.enabled}>
        <div className="space-y-3">
          <div className="k-stack">
            {STAT_IDS.map(id => {
              const on = priorities[id] > 0;
              const label = getStatLabel(id, undefined);
              return (
                <div key={id} className={`flex items-center gap-2 h-8${on ? '' : ' k-dim'}`}>
                  <span className="k-dot" style={{ backgroundColor: hudStatDot(id, dark, STAT_COLORS[id]) }} />
                  <span className="flex-1 min-w-0 truncate text-[12px] text-[var(--text-secondary)]">{label}</span>
                  <Switch checked={on} onChange={() => toggleSkill(id)} label={`${label} enabled`} />
                  <NumberBox
                    inputMode="numeric" min={1} max={99}
                    value={on ? (priorities[id] || 1) : ''}
                    placeholder={on ? '' : '-'}
                    disabled={!on}
                    onChange={e => setPriorityInput(id, e.target.value)}
                    className="k-field k-num-box text-center tabular-nums"
                    aria-label={`${label} priority`}
                  />
                </div>
              );
            })}
          </div>
          <ToggleRow label="Fill remaining points randomly" description="Spends left over points on the rest."
            help="When ON: after every enabled skill is fully maxed, any remaining skill points are spent randomly on the disabled skills above (until they're maxed too). When OFF: once enabled skills are maxed, the AI stops upgrading and remaining skill points accumulate unspent."
            checked={local.customUpgradeLogic.fillRemainingRandomly} onChange={setFillRandom} />
          <Reveal when={enabledCount === 0}>
            <p className="k-hint k-hint-strong">No skills enabled. Saved like this, the AI upgrades its skills at random.</p>
          </Reveal>
        </div>
        </Reveal>
      </Group>
    </div>
  );
};
