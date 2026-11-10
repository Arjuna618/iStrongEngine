import { findTankByNameOrKey, pickBarrelWordOf } from '../../game/tankByName';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import React, { useState, useMemo } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import {
  ProjectileTypeConfig,
  FacingType, ProjectileVisual, Turret, HitsOwnType,
  CustomProjectileDesign, BehaviorConfig, LibraryItem,
} from '../../types';
import { PROJECTILE_LABELS, FACING_LABELS, LAYER_CAP_REASON, LAYER_CAP_HELP } from './labels';
import { projectileTypeResetPatch, presetBehaviorsFor, typeResetTurretFields, ALWAYS_SHOOT_VISUALS } from './projectileTypeSwap';
import { isRepickOfSelectedDesign } from './projectileDesignPick';
import { designFits } from '../../game/roundLayers';
import { SPIN_TURNS_DEFAULT } from '../../game/roundSpin';
import { renderDropdown, renderMiniSlider } from './uiHelpers';
import { Group, ToggleRow, Dim, headerIcon } from '../kit/kit';
import { Reveal, SwapInPlace } from '../kit/Collapse';
import { InlineMotion } from '../kit/TagLine';
import { ContentLibrary } from '../library/ContentLibrary';
import { ContentLibraryButton } from '../library/ContentLibraryButton';
import type { LibMode } from '../library/libraryModes';
import { projectilePickMode, designPickPatch } from '../library/projectilePickMode';
import { collectionOfItem } from '../library/catalog';
import { X, HdFileQuestionMark } from '../ui/icons';

interface Props {
  projectileType: ProjectileTypeConfig;
  onUpdate: (updates: Partial<ProjectileTypeConfig>) => void;
  projectileDesigns: CustomProjectileDesign[];
  tankLibrary: LibraryItem[];
  wifiRange?: boolean;
  wifiRangeValue?: number;
  onWifiUpdate?: (updates: { wifiRange?: boolean; wifiRangeValue?: number }) => void;
  onBehaviorsReset?: (behaviors: BehaviorConfig[]) => void;
  onTurretUpdate?: (updates: Partial<Turret>) => void;
  onTurretReset?: (updates: Partial<Turret>) => void;
  behaviors?: BehaviorConfig[];
  onBehaviorUpdate?: (behaviorType: string, updates: Partial<BehaviorConfig>) => void;
  sectionOpen?: boolean;
  onSectionToggle?: (open: boolean) => void;
  layerMaxAliveActive?: boolean;
  healerToggle?: boolean;
  onToggleHealer?: (v: boolean) => void;
  fragmentMode?: boolean;
  roundLayer: number;
  logic?: GameLogic | null;
  footer?: React.ReactNode;
}

export const ProjectileTypeEditor: React.FC<Props> = ({
  projectileType: pt,
  onUpdate,
  projectileDesigns,
  tankLibrary,
  wifiRange,
  wifiRangeValue,
  onWifiUpdate,
  onBehaviorsReset,
  onTurretUpdate,
  onTurretReset,
  behaviors,
  onBehaviorUpdate,
  sectionOpen,
  onSectionToggle,
  layerMaxAliveActive,
  healerToggle,
  onToggleHealer,
  fragmentMode,
  roundLayer,
  logic,
  footer,
}) => {
  const projectileLibraryItems: LibraryItem[] = (() => {
    if (!projectileDesigns || projectileDesigns.length === 0) return tankLibrary;
    const known = new Set<string>();
    for (const item of tankLibrary) {
      if (item.fileData.type === 'CustomProjectile') {
        const n = (item.fileData.data as CustomProjectileDesign)?.name;
        if (n) known.add(n);
      }
    }
    const extra: LibraryItem[] = [];
    for (const design of projectileDesigns) {
      if (!design?.name || known.has(design.name)) continue;
      known.add(design.name);
      extra.push({
        id: `pd-${design.name}`,
        name: design.name,
        fileData: { version: '1.0.0', type: 'CustomProjectile', name: design.name, timestamp: 0, data: design },
        loadedAt: 0,
        source: 'manual-import',
      });
    }
    return extra.length > 0 ? [...tankLibrary, ...extra] : tankLibrary;
  })();

  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = sectionOpen !== undefined ? sectionOpen : localOpen;
  const toggleOpen = () => {
    const next = !isOpen;
    if (onSectionToggle) onSectionToggle(next);
    else setLocalOpen(next);
  };

  const hasTankSelection = !!pt.tankAsProjectile || (pt.cycleProjectilesEnabled && pt.tankAsProjectileCycle && pt.tankAsProjectileCycle.length > 0);
  const hasCPDSelection = !!pt.customProjectileDesignName || !!(pt.customProjectileDesign && pt.customProjectileDesign.turrets && pt.customProjectileDesign.turrets.length > 0);
  const [customModeLocal, setCustomModeLocal] = useState(false);
  const customMode = customModeLocal || hasCPDSelection || hasTankSelection;
  const setCustomMode = setCustomModeLocal;

  const cycleEnabled = !fragmentMode && (pt.cycleProjectilesEnabled ?? false);
  const cycleList = pt.tankAsProjectileCycle ?? [];

  const selectedTankNames = useMemo(() => {
    const set = new Set<string>();
    if (cycleEnabled) {
      for (const name of cycleList) set.add(name);
    } else if (pt.tankAsProjectile) {
      set.add(pt.tankAsProjectile);
    }
    return set;
  }, [cycleEnabled, cycleList, pt.tankAsProjectile]);
  const selectedTankIds = useMemo(() => {
    if (SMALL_FIX.BH09 === 0) return null;
    const ids = new Set<string>();
    for (const w of selectedTankNames) { const it = findTankByNameOrKey(tankLibrary, w); if (it) ids.add(it.id); }
    return ids;
  }, [selectedTankNames, tankLibrary]);
  const tankShown = (w: string): string => SMALL_FIX.BH09 === 0 ? w : (findTankByNameOrKey(tankLibrary, w)?.name ?? w);

  const displayLabel = hasTankSelection
    ? (cycleEnabled ? `Cycle: ${cycleList.length} tanks` : `Tank: ${tankShown(pt.tankAsProjectile ?? '')}`)
    : hasCPDSelection
      ? (pt.customProjectileDesignName ? `Custom: ${pt.customProjectileDesignName}` : 'Custom: Unnamed')
      : PROJECTILE_LABELS[pt.visual] || 'Bullet';

  const handleTankSelect = (name: string) => {
    if (cycleEnabled) {
      const newList = cycleList.includes(name)
        ? cycleList.filter(n => n !== name)
        : [...cycleList, name];
      onUpdate({
        tankAsProjectileCycle: newList,
        tankAsProjectile: newList.length > 0 ? newList[0] : undefined,
        customProjectileDesignName: undefined,
        customProjectileDesign: null,
      });
    } else {
      const newVal = pt.tankAsProjectile === name ? undefined : name;
      onUpdate({
        tankAsProjectile: newVal,
        tankAsProjectileCycle: undefined,
        customProjectileDesignName: undefined,
        customProjectileDesign: null,
        ...(fragmentMode ? { cycleProjectilesEnabled: false } : {}),
      });
    }
  };

  const pickDesign = (design: CustomProjectileDesign): boolean => {
    if (isRepickOfSelectedDesign(pt.customProjectileDesignName, design, projectileLibraryItems, pt.customProjectileDesign)) return false;
    onUpdate(designPickPatch(design));
    return true;
  };

  const [libOpen, setLibOpen] = useState(false);
  const libMode: LibMode | null = libOpen ? projectilePickMode({
    pt, roundLayer, cycleEnabled, cycleCount: cycleList.length, selectedTankNames, hasTankSelection, hasCPDSelection,
    handleTankSelect, pickDesign, onDone: () => setLibOpen(false), library: projectileLibraryItems,
    chosenTankCollection: pt.tankAsProjectile ? collectionOfItem(findTankByNameOrKey(tankLibrary, pt.tankAsProjectile)) : undefined,
    wordOf: SMALL_FIX.BH09 !== 0 ? (it) => pickBarrelWordOf(tankLibrary, it) : undefined,
    isTankPicked: selectedTankIds ? (e) => !!e.item && selectedTankIds.has(e.item.id) : undefined,
  }) : null;

  const handleCycleToggle = (on: boolean) => {
    if (on) {
      const initial = pt.tankAsProjectile ? [pt.tankAsProjectile] : [];
      onUpdate({
        cycleProjectilesEnabled: true,
        tankAsProjectileCycle: initial,
      });
    } else {
      const first = cycleList.length > 0 ? cycleList[0] : pt.tankAsProjectile;
      onUpdate({
        cycleProjectilesEnabled: false,
        tankAsProjectile: first,
        tankAsProjectileCycle: undefined,
      });
    }
  };

  const handleRemoveCycleTag = (name: string) => {
    const newList = cycleList.filter(n => n !== name);
    onUpdate({
      tankAsProjectileCycle: newList,
      tankAsProjectile: newList.length > 0 ? newList[0] : undefined,
    });
  };

  const showDroneGroup = fragmentMode || pt.visual === 'drone' || pt.visual === 'minion' || pt.visual === 'hive';
  const minionBh = pt.visual === 'minion' && behaviors && onBehaviorUpdate ? behaviors.find(b => b.type === 'minionControl') : undefined;

  return (
    <Group title="Projectile Type" icon={headerIcon(HdFileQuestionMark)} count={hasTankSelection || hasCPDSelection ? undefined : displayLabel} collapsible open={isOpen} onToggle={() => toggleOpen()}>
      <Group title="Projectile" level={3}>
          {renderDropdown('Type', pt.visual, PROJECTILE_LABELS, (val) => {
            if (val === pt.visual) return;
            setCustomMode(false);
            const visual = val as ProjectileVisual;
            onUpdate(projectileTypeResetPatch(pt, visual));
            if (onBehaviorsReset) onBehaviorsReset(presetBehaviorsFor(visual));
            if (onTurretReset) onTurretReset(typeResetTurretFields(visual));
            if (onTurretUpdate) {
              onTurretUpdate({ alwaysShoot: ALWAYS_SHOOT_VISUALS.has(visual) });
            }
          }, 'What this turret fires: a Bullet flies straight, a Trap drifts and then sits, a Drone follows your mouse, a Swarm curves toward enemies, a Minion is a small tank of its own. Picking a type starts the projectile over with that type\'s setup.')}

          {renderMiniSlider('Size Multiplier', pt.size, (v) => onUpdate({ size: v }), 0.1, 5, 0.1, 'Projectile scale relative to muzzle.')}

          <Reveal when={!customMode && !pt.customProjectileDesignName && !hasTankSelection}>
            {renderMiniSlider('Shape Sides', pt.shape, (v) => onUpdate({ shape: v }), 0, 8, 1, 'Projectile polygon sides. 0 = circle.')}
          </Reveal>

          <Reveal when={pt.shape >= 3}><div className="space-y-3">
            {renderMiniSlider('Shape Depth', Math.round((pt.trapDepth ?? 0) * 100), (v) => onUpdate({ trapDepth: v / 100 }), 0, 100, 1, 'Star/trap indent depth.')}
            <p className="k-hint">Arras default: {Math.round((6 / (pt.shape ** 2)) * 100)}%</p>
            <Reveal when={(pt.trapDepth ?? 0) > 0}>
              <ToggleRow label="Curved Edges" description="Rounds the indents." help="Smooth curved indentations"
                checked={!!pt.trapCurved} onChange={v => onUpdate({ trapCurved: v })} />
            </Reveal>
          </div></Reveal>

          {renderDropdown('Facing', pt.facingType, FACING_LABELS, (val) => onUpdate({ facingType: val as FacingType }),
            'How the projectile points while it flies: at its target, turning smoothly, along its motion, spinning and more.')}
          <Reveal when={pt.facingType === 'spin'}>
            {renderMiniSlider('Spin Speed', pt.spinSpeed ?? SPIN_TURNS_DEFAULT, (v) => onUpdate({ spinSpeed: v }), 0, 10, 0.1,
              'Turns a second while it spins. 0 stops the spin.')}
          </Reveal>
      </Group>

      <Group title="Lifetime and Effects" level={3}>
          {renderMiniSlider('Lifetime Override', pt.lifetime, (v) => onUpdate({ lifetime: v }), 0, 30, 0.5, 'Custom lifetime. 0 = use turret\'s stat.')}
          {onToggleHealer && (
            <ToggleRow label="Healer" description="Heals teammates instead." help="Bullets heal same team entities instead of damaging."
              checked={healerToggle ?? false} onChange={onToggleHealer} />
          )}
          <ToggleRow label="Damage Fades With Range"
            help="Hits harder close to the barrel (1.75 times) and weaker at the end of its life (a quarter), as a Shotgun's shell."
            checked={pt.rangeDamage === true} onChange={v => onUpdate({ rangeDamage: v ? true : undefined })} />
          <Reveal when={pt.motionType === 'minion' || pt.buffVsFood === true}>
            <ToggleRow label="Triple Damage to Shapes"
              help="A minion with it does three times its damage to food shapes, as the tiny minions do."
              checked={pt.buffVsFood === true} onChange={v => onUpdate({ buffVsFood: v ? true : undefined })} />
          </Reveal>
          <ToggleRow label="Die at Range" description="Fades when its range runs out." help="Fades when distance runs out"
            checked={!!pt.dieAtRange} onChange={v => onUpdate({ dieAtRange: v })} />
          {([
            { key: 'persistsAfterDeath' as const, label: 'Persists After Death', desc: 'Survives parent destruction' },
          ] as const).map(({ key, label, desc }) => (
            <ToggleRow key={key} label={label} description={desc}
              checked={!!pt[key]} onChange={v => onUpdate({ [key]: v })} />
          ))}
      </Group>

      <Reveal when={showDroneGroup}>
        <Group title="Drones and Minions" level={3}>
          <Reveal when={(fragmentMode || pt.visual === 'drone' || pt.visual === 'minion' || pt.visual === 'hive')}>
            <Dim when={!fragmentMode && layerMaxAliveActive} why="Layer Max Alive is on. Turn it off to use a limit per turret.">
              {renderMiniSlider('Max Alive', pt.maxAlive, (v) => onUpdate({ maxAlive: v }), 0, 20, 1,
                fragmentMode ? 'Most of these pieces alive at once, per tank. 0 means no limit.' : 'Max drones/minions alive per turret.')}
            </Dim>
          </Reveal>
          <Reveal when={minionBh && onBehaviorUpdate}>{() => (
            renderMiniSlider('Orbit Distance', minionBh!.orbitRadius, (v) => onBehaviorUpdate!('minionControl', { orbitRadius: v }), 0, 1000, 10, 'Distance minions keep from targets. Default: 250')
          )}</Reveal>
        </Group>
      </Reveal>

      <Group title="Collision" level={3} collapsible defaultOpen={false} count={(pt.hitsOwnType ?? 'none') !== 'none' ? 'On' : undefined}>
          {renderDropdown('Hits Own Type', pt.hitsOwnType ?? 'none', {
            none: 'None (Pass through)',
            push: 'Push (Physical collision)',
            drone: 'Drone (Firmcollide)',
            hardWithBuffer: 'Necro (Firm + Buffer)',
            assembler: 'Assembler (Trap stacking)',
          }, (val) => onUpdate({ hitsOwnType: val as HitsOwnType }),
            'What happens when two of your own projectiles of this kind meet: None passes through, Push shoves them apart, Drone is the firm contact drones use, Necro the same with a little room, Assembler stacks them like traps.')}
          <Reveal when={(pt.hitsOwnType === 'push' || pt.hitsOwnType === 'assembler')}><div className="space-y-3">
            {renderMiniSlider('Density', pt.density ?? 1, (v) => onUpdate({ density: v }), 0.5, 10, 0.5, 'Mass for push physics. A trap is 2.5')}
            <ToggleRow label="Bouncy"
              description={(pt.bouncy ?? true) ? 'Elastic snooker ball bounce' : 'Soft stack (builder block style)'}
              checked={pt.bouncy ?? true} onChange={v => onUpdate({ bouncy: v })} />
            <Reveal when={(pt.bouncy ?? true)}>
              {renderMiniSlider('Bounciness', pt.bounciness ?? 0.9, (v) => onUpdate({ bounciness: v }), 0, 1, 0.05, '0 = dead stop, 0.9 = snooker balls, 1 = perfect elastic')}
            </Reveal>
          </div></Reveal>
      </Group>

      <Group title="Custom Design or Tank" level={3} collapsible defaultOpen={customMode} count={customMode ? 'On' : undefined}>
            <ToggleRow label="Custom Projectile" description="Fires a custom design or a tank." help="Use a custom design or spawn a tank"
              checked={customMode}
              onChange={on => {
                setCustomMode(on);
                if (!on) {
                  onUpdate({
                    customProjectileDesignName: undefined,
                    customProjectileDesign: null,
                    tankAsProjectile: undefined,
                    tankAsProjectileCycle: undefined,
                    cycleProjectilesEnabled: false,
                  });
                }
              }} />

            <Reveal when={customMode}><div className="space-y-3">
                {!fragmentMode && (
                  <ToggleRow label="Cycle Projectiles" description="Fires the next tank each shot." help="Cycle through multiple tanks on each fire"
                    checked={cycleEnabled} onChange={handleCycleToggle} />
                )}

                <Reveal when={cycleEnabled && cycleList.length > 0}>
                  <div className="flex flex-wrap gap-y-1.5">
                    <InlineMotion items={cycleList.map(name => ({ key: name, node: (
                      <span className="k-chip">
                        {tankShown(name)}
                        <button type="button" aria-label={`Remove ${tankShown(name)}`} title="Remove"
                          onClick={() => handleRemoveCycleTag(name)}
                          className="k-chip-x"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ) }))} />
                  </div>
                </Reveal>

                <Reveal when={hasTankSelection || hasCPDSelection}>
                  <SwapInPlace hold={false} swapKey={hasTankSelection ? (cycleEnabled ? 'cycle:' + cycleList.join('|') : 'tank:' + (pt.tankAsProjectile ?? '')) : 'custom:' + (pt.customProjectileDesignName ?? '')}>
                  <div className="k-chosen">
                    <span className="k-chosen-kind">{hasTankSelection ? (cycleEnabled ? `Cycle of ${cycleList.length}` : 'Tank') : 'Custom'}</span>
                    <span className="k-chosen-name k-fade">{hasTankSelection ? (cycleEnabled ? cycleList.map(tankShown).join(', ') : tankShown(pt.tankAsProjectile ?? '')) : (pt.customProjectileDesignName || 'Unnamed')}</span>
                  </div>
                  </SwapInPlace>
                </Reveal>
                <ContentLibraryButton onClick={() => setLibOpen(true)} disabled={!logic} />
                {libOpen && logic && libMode && <ContentLibrary logic={logic} mode={libMode} onClose={() => setLibOpen(false)} />}

                <Reveal when={!fragmentMode && hasTankSelection}>
                  <ToggleRow label="Use AI"
                    description={pt.tankAsProjectileUseAI
                      ? 'Spawns full enemy with AI, original size & settings'
                      : 'Fires as normal projectile with tank visual'}
                    checked={!!pt.tankAsProjectileUseAI}
                    onChange={v => onUpdate({ tankAsProjectileUseAI: v })} />
                </Reveal>

                <Reveal when={!fragmentMode && hasTankSelection && pt.tankAsProjectileUseAI}>
                  <ToggleRow label="XP Goes to Owner"
                    description={pt.tankAsProjectileXpToOwner !== false
                      ? 'Its kills and XP go to the tank that fired it'
                      : 'It keeps its own kills and XP and levels up'}
                    checked={pt.tankAsProjectileXpToOwner !== false}
                    onChange={v => onUpdate({ tankAsProjectileXpToOwner: v })} />
                </Reveal>
            </div></Reveal>
      </Group>

      {onWifiUpdate && (
        <Group title="Projectile Turrets" level={3} collapsible defaultOpen={false} count={wifiRange ? 'On' : undefined}>
                <ToggleRow label="Wifi Range" description="Its turrets fire only near the tank." help="Projectile auto turrets only fire within this range of the parent tank"
                  checked={wifiRange ?? false} onChange={v => onWifiUpdate({ wifiRange: v })} />
                {wifiRange && renderMiniSlider('Wifi Distance', wifiRangeValue ?? 50, (v) => onWifiUpdate({ wifiRangeValue: v }), 1, 100, 1, 'Max distance from parent tank where projectile auto turrets can fire')}
        </Group>
      )}

      {footer}
    </Group>
  );
};
