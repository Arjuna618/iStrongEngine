import React, { useState, useCallback } from 'react';
import { GameLogic } from '../game/GameLogic';
import { AreaConfig, ShapeSpawnConfig } from '../types';
import { Shapes } from './ui/icons';
import { HelpTooltip } from './shared/HelpTooltip';
import { Group, SliderRow as KitSliderRow, ToggleRow, SelectRow, Button } from './kit/kit';
import { Reveal } from './kit/Collapse';
import { FarmableShapesWindow } from './FarmableShapesWindow';

interface Props {
  logic: GameLogic;
  onUpdate: () => void;
}

const STARTING_TANK_OPTIONS: { value: string; label: string }[] = [
  { value: '',                  label: 'Blank' },
  { value: 'basic',             label: 'Basic' },
  { value: 'dreadOfficialV1',   label: 'Dreads V1' },
  { value: 'menu_sentries',     label: 'Sentries' },
  { value: 'menu_elites',       label: 'Elites' },
  { value: 'menu_mysticals',    label: 'Mysticals' },
  { value: 'menu_nesters',      label: 'Nesters' },
  { value: 'menu_rogues',       label: 'Rogues' },
  { value: 'menu_rammers',      label: 'Rammers' },
  { value: 'menu_terrestrials', label: 'Terrestrials' },
  { value: 'menu_celestials',   label: 'Celestials' },
  { value: 'menu_eternals',     label: 'Eternals' },
  { value: 'menu_motherships',  label: 'Motherships' },
  { value: 'menu_dominators',   label: 'Dominators' },
  { value: 'menu_sanctuaries',  label: 'Sanctuaries' },
];

const SliderRow: React.FC<{
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
  suffix?: string; display?: string; leftLabel?: string; rightLabel?: string; tooltip?: string;
}> = ({ label, value, onChange, min, max, step = 1, suffix, display, leftLabel, rightLabel, tooltip }) => (
  <KitSliderRow label={label} value={value} onChange={onChange} min={min} max={max} step={step} help={tooltip}
    display={display ?? (suffix ? `${Math.round(value * 100) / 100}${suffix}` : String(Math.round(value * 100) / 100))}
    minLabel={leftLabel} maxLabel={rightLabel} />
);

export const SandboxSettingsSection: React.FC<Props> = ({ logic, onUpdate }) => {
  const s = logic.state;
  const mac = s.multiAreaConfig;
  const isMultiArea = mac.enableMultiArea && mac.areas.length > 0;

  const [shapesOpen, setShapesOpen] = useState(false);

  const _foundIdx = isMultiArea ? mac.areas.findIndex(a => a.id === mac.activeAreaId) : -1;
  const areaIdx = _foundIdx >= 0 ? _foundIdx : 0;
  const activeAreaName = isMultiArea ? mac.areas[areaIdx].name : '';

  const cfg = isMultiArea ? mac.areas[areaIdx].shapeSpawnConfig : s.shapeSpawnConfig;
  const areaSpawnRate = isMultiArea ? mac.areas[areaIdx].spawnRate : s.spawnRate;

  const handleChange = useCallback((key: string, val: any) => {
    logic.updateState({ [key]: val });
    onUpdate();
  }, [logic, onUpdate]);

  const updateSpawnCfg = useCallback((patch: Partial<ShapeSpawnConfig>) => {
    if (isMultiArea) {
      const newAreas = [...mac.areas];
      newAreas[areaIdx] = { ...newAreas[areaIdx], shapeSpawnConfig: { ...newAreas[areaIdx].shapeSpawnConfig, ...patch } };
      handleChange('multiAreaConfig', { ...mac, areas: newAreas });
    } else {
      const newCfg = { ...cfg, ...patch };
      handleChange('shapeSpawnConfig', newCfg);
    }
  }, [cfg, handleChange, isMultiArea, mac, areaIdx]);

  const updateAreaSpawnRate = useCallback((val: number) => {
    if (isMultiArea) {
      const newAreas = [...mac.areas];
      newAreas[areaIdx] = { ...newAreas[areaIdx], spawnRate: val };
      handleChange('multiAreaConfig', { ...mac, areas: newAreas });
    } else {
      handleChange('spawnRate', val);
    }
  }, [handleChange, isMultiArea, mac, areaIdx]);

  const updateAreaField = useCallback(<K extends keyof AreaConfig>(field: K, val: AreaConfig[K]) => {
    if (!isMultiArea) return;
    const newAreas = [...mac.areas];
    newAreas[areaIdx] = { ...newAreas[areaIdx], [field]: val };
    handleChange('multiAreaConfig', { ...mac, areas: newAreas });
  }, [handleChange, isMultiArea, mac, areaIdx]);

  const _hasStartingTank = isMultiArea && !!mac.areas[areaIdx].startingTankFileName;

  return (
    <div className="space-y-3">
      <Reveal when={isMultiArea}>{() => (
        <div className="flex items-center gap-2 px-1">
          <span className="k-subhead">Editing</span>
          <span className="text-xs [font-weight:var(--fw-head)] text-[var(--text-primary)] truncate">{activeAreaName}</span>
          <HelpTooltip text="These settings apply to the area selected in the Areas tab. Switch areas there to edit a different one." />
        </div>
      )}</Reveal>

      <Reveal when={isMultiArea}>{() => (
        <Group title="Area Rules" level={3} collapsible defaultOpen={false}>
          <SelectRow label="Starting Tank"
            help="When a tank enters this area via portal, force convert to this tank. 'Blank' means the entity keeps whatever tank it currently has (no override)."
            value={mac.areas[areaIdx].startingTankFileName ?? ''}
            onChange={v => updateAreaField('startingTankFileName', v || undefined)}
            options={STARTING_TANK_OPTIONS} />
          <ToggleRow label="Apply only on first entry"
            description="Reentries preserve current tank."
            why="No effect when Starting Tank is Blank."
            help="When ON, the starting tank is forced only the FIRST time the player or a bot enters this area per game session. Reentries preserve the entity's current tank, e.g. a player who evolved to dread in Forge keeps their dread on return to Main."
            checked={mac.areas[areaIdx].startingTankFirstEntryOnly === true}
            disabled={!_hasStartingTank}
            onChange={v => updateAreaField('startingTankFirstEntryOnly', v || undefined)} />
          <ToggleRow label="No PvP" description="No tank vs tank damage. Healing works."
            help="No tank vs tank damage in this area. Healing still works."
            checked={mac.areas[areaIdx].noPvp === true}
            onChange={v => updateAreaField('noPvp', v)} />
        </Group>
      )}</Reveal>

      <Group title="Environment Config" level={3}>
        <SliderRow
          label="Shape Spawn Multiplier" value={areaSpawnRate}
          onChange={updateAreaSpawnRate} min={0} max={100}
          leftLabel="None" rightLabel="Max (x3)"
          tooltip="How fast shapes respawn. 0 = disabled."
        />
        <SliderRow
          label="Food Cap" value={cfg.foodCap}
          onChange={v => updateSpawnCfg({ foodCap: Math.round(v) })} min={0} max={300}
          leftLabel="None" rightLabel="Chaos"
          tooltip="Maximum shapes on the map at once."
        />
        <div className="k-stack pt-2 border-t border-[var(--alpha-divider)]">
          <SliderRow
            label="Velocity Inheritance" value={s.velocityInheritance}
            onChange={v => handleChange('velocityInheritance', v)} min={0} max={100} suffix="%"
            leftLabel="None" rightLabel="Full Physics"
            tooltip="How much of a tank's own speed its bullets get when it drives the way it shoots: a bullet starts faster, then slows to its own speed. Driving backward or sideways changes nothing. At 50 (the normal) a bullet gets the tank's whole speed, at 0 nothing, at 100 twice its speed. Guns on auto turrets add nothing. Applies to every tank in the whole game, not only the selected area."
          />
        </div>
      </Group>

      <Group title="Farmable Shapes" level={3}>
        <Button block icon={<Shapes size={16} />} onClick={() => setShapesOpen(true)}>Open Farmable Shapes</Button>
      </Group>
      {shapesOpen && (
        <FarmableShapesWindow cfg={cfg} updateSpawnCfg={updateSpawnCfg} areaName={activeAreaName} onClose={() => setShapesOpen(false)} />
      )}

      <Group title="Global Spawn Settings" level={3} collapsible defaultOpen={false}>
        <SliderRow label="Group Spawn Chance" value={cfg.groupSpawnChance}
          onChange={v => updateSpawnCfg({ groupSpawnChance: Math.round(v) })}
          min={0} max={100} suffix="%" leftLabel="Never" rightLabel="Always"
          tooltip="How often a food spawn arrives as a little cluster of shapes instead of one shape, in percent." />
        <SliderRow label="Group Max Size" value={cfg.groupMaxSize}
          onChange={v => updateSpawnCfg({ groupMaxSize: Math.round(v) })}
          min={1} max={10} leftLabel="Solo" rightLabel="Cluster"
          tooltip="The most shapes in one cluster. Each cluster holds from 1 shape up to this many." />
      </Group>
    </div>
  );
};
