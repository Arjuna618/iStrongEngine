import React, { useState } from 'react';
import { Trash2, HdTestTube03 } from '../ui/icons';
import { BehaviorConfig, BehaviorType, DEFAULT_BEHAVIOR_CONFIG } from '../../types';
import type { ExplodeConfig, Turret, LibraryItem } from '../../types';
import { BEHAVIOR_LABELS, behaviorLabel, behaviorDescription, EXPLODE_LABEL, withLayerCapReason } from './labels';
import { renderDropdown, renderMiniSlider } from './uiHelpers';
import { Group, ToggleRow, Switch, IconButton, headerIcon } from '../kit/kit';
import { Reveal, MotionList } from '../kit/Collapse';
import { CustomSelect } from './CustomSelect';
import { ExplodeCard } from './ExplodeCard';
import { EXPLODE_MAX_DEPTH } from '../../game/explode';
import { explodeSeedFits } from '../../game/roundLayers';
import { DRONE_ACCEL_TICK, MINION_PUSH_TICK, SWARM_A } from '../../game/Controllers';
import { MOTION_BEHAVIOR_TYPES, INCOMPATIBLE_GROUPS } from './projectileTypeSwap';
import { SMALL_FIX } from '../../game/smallFixSwitch';

const EXPLODE_OPTION = '__explode__';

function getDisabledByConflict(type: BehaviorType, behaviors: BehaviorConfig[]): BehaviorType | null {
  if (behaviors.find(b => b.type === type)?.enabled) return null;
  for (const group of INCOMPATIBLE_GROUPS) {
    if (!group.includes(type)) continue;
    for (const bh of behaviors) {
      if (bh.type !== type && bh.enabled && group.includes(bh.type)) {
        return bh.type;
      }
    }
  }
  return null;
}

interface Props {
  behaviors: BehaviorConfig[];
  onUpdate: (behaviors: BehaviorConfig[]) => void;
  sectionOpen?: boolean;
  onSectionToggle?: (open: boolean) => void;
  explode?: ExplodeConfig;
  onExplodeChange?: (ex: ExplodeConfig | undefined) => void;
  onAddExplode?: () => void;
  onAddRing?: () => void;
  onEditFragment?: (ringIndex: number) => void;
  explodeLevel?: number;
  bombTurret?: Turret;
  tankLibrary?: LibraryItem[];
  roundLayer: number;
}

export const BehaviorEditor: React.FC<Props> = ({
  behaviors, onUpdate, sectionOpen, onSectionToggle,
  explode, onExplodeChange, onAddExplode, onAddRing, onEditFragment, explodeLevel, bombTurret, tankLibrary,
  roundLayer,
}) => {
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = sectionOpen !== undefined ? sectionOpen : localOpen;
  const toggleOpen = () => {
    const next = !isOpen;
    if (onSectionToggle) onSectionToggle(next);
    else setLocalOpen(next);
  };

  const updateBehavior = (idx: number, updates: Partial<BehaviorConfig>) => {
    let next = [...behaviors];
    next[idx] = { ...next[idx], ...updates };

    if (updates.enabled === true) {
      const type = next[idx].type;
      for (const group of INCOMPATIBLE_GROUPS) {
        if (!group.includes(type)) continue;
        for (let i = 0; i < next.length; i++) {
          if (i !== idx && group.includes(next[i].type) && next[i].enabled) {
            next[i] = { ...next[i], enabled: false };
          }
        }
      }
    }

    onUpdate(next);
  };

  const addBehavior = (type: BehaviorType) => {
    let next = [...behaviors];
    if (MOTION_BEHAVIOR_TYPES.has(type)) {
      next = next.filter(b => !MOTION_BEHAVIOR_TYPES.has(b.type));
    }

    for (const group of INCOMPATIBLE_GROUPS) {
      if (!group.includes(type)) continue;
      for (let i = 0; i < next.length; i++) {
        if (group.includes(next[i].type) && next[i].enabled) {
          next[i] = { ...next[i], enabled: false };
        }
      }
    }

    next.push({ ...DEFAULT_BEHAVIOR_CONFIG, type, enabled: true });
    onUpdate(next);
  };

  const removeBehavior = (idx: number) => {
    const next = [...behaviors];
    next.splice(idx, 1);
    onUpdate(next);
  };

  const existingTypes = behaviors.map(b => b.type);
  const availableBehaviors = (Object.keys(BEHAVIOR_LABELS) as BehaviorType[]).filter(
    bt => !existingTypes.includes(bt)
  );

  const availableMotion = availableBehaviors.filter(bt => MOTION_BEHAVIOR_TYPES.has(bt));
  const availableSteering = availableBehaviors.filter(bt => !MOTION_BEHAVIOR_TYPES.has(bt));

  const level = explodeLevel ?? 1;
  const showExplodeOption = !!onAddExplode && !explode;
  const explodeTooDeep = level > EXPLODE_MAX_DEPTH;
  const explodeLayerCap = !bombTurret || !explodeSeedFits(roundLayer, bombTurret);

  const activeCount = behaviors.filter(b => b.enabled).length + (explode && explode.enabled ? 1 : 0);

  return (
    <Group title="Projectile Behaviors" icon={headerIcon(HdTestTube03)} count={activeCount > 0 ? String(activeCount) : undefined} collapsible open={isOpen} onToggle={() => toggleOpen()}>
          <p className="k-hint">Stack multiple behaviors. Later behaviors override earlier ones.</p>

          <MotionList gap={12}>
          {behaviors.map((bh, idx) => {
            const disabledBy = getDisabledByConflict(bh.type, behaviors);
            return (
              <div key={bh.type} className="k-group k-l3 k-card">
                <div className="k-card-head">
                  <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
                    <Switch checked={bh.enabled} onChange={v => updateBehavior(idx, { enabled: v })} label={behaviorLabel(bh.type)} />
                    <span className={`k-card-title truncate ${bh.enabled ? '' : 'k-card-title-off'}`}>
                      {behaviorLabel(bh.type)}
                    </span>
                  </label>
                  <IconButton label="Remove Behavior" size="sm" onClick={() => removeBehavior(idx)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                <p className="k-row-desc">{behaviorDescription(bh.type)}</p>

                <Reveal when={!!disabledBy}>
                  <p className="k-hint k-hint-strong">
                    Incompatible with {disabledBy ? behaviorLabel(disabledBy) : ''}
                  </p>
                </Reveal>

                <Reveal when={bh.enabled}>
                  <div className="k-stack">
                    {bh.type === 'followMouse' && (<>
                      {renderMiniSlider('Response Lag', bh.responseLag, (v) => updateBehavior(idx, { responseLag: v }), 0, 1, 0.05, 'Delay before responding to cursor.')}
                    </>)}

                    {bh.type === 'autoTargetEnemy' && (<>
                      {renderMiniSlider('Target Range', bh.targetRange, (v) => updateBehavior(idx, { targetRange: v }), 0, 2000, 50, 'How far a target may be. For drones and minions it is counted from the tank. 0 = automatic.')}
                      {renderMiniSlider('Prediction', bh.predictionStrength, (v) => updateBehavior(idx, { predictionStrength: v }), 0, 100, 5, 'Aim prediction accuracy. 100 = perfect.')}
                      {SMALL_FIX.R9TP === 0 && renderDropdown('Priority', bh.targetPriority, {
                        nearest: 'Nearest',
                        lowestHealth: 'Lowest Health',
                        highestThreat: 'Highest Threat',
                      }, (val) => updateBehavior(idx, { targetPriority: val as any }),
                        'Which target it goes for first: the nearest one, the one with the least health, or the one that is the biggest threat.')}
                    </>)}

                    {bh.type === 'hangNearOwnerV2' && (<>
                      {renderMiniSlider('Orbit Radius', bh.orbitRadius, (v) => updateBehavior(idx, { orbitRadius: v }), 30, 500, 10, 'Distance maintained when orbiting.')}
                    </>)}

                    {bh.type === 'spinContinuous' && (<>
                      {renderMiniSlider('Spin Speed', bh.spinSpeed, (v) => updateBehavior(idx, { spinSpeed: v }), 0.5, 10, 0.5, 'Visual rotation speed.')}
                    </>)}

                    {bh.type === 'minionControl' && (<>
                      {renderMiniSlider('Orbit Radius', bh.orbitRadius, (v) => updateBehavior(idx, { orbitRadius: v }), 0, 1000, 10, 'Distance maintained when orbiting.')}
                      {renderMiniSlider('Acceleration', Math.round((bh.minionAccel ?? MINION_PUSH_TICK) * 100) / 100, (v) => updateBehavior(idx, { minionAccel: v }), 0.05, 2, 0.01, 'How hard the minion pushes toward where it is going. Lower glides like on ice. Default 0.6.')}
                    </>)}

                    {bh.type === 'motionSwarm' && (<>
                      {renderMiniSlider('Steering', Math.round((bh.swarmSteer ?? SWARM_A) * 10) / 10, (v) => updateBehavior(idx, { swarmSteer: v }), 1, 20, 0.5, 'How hard the swarm drone turns toward where it is going. Lower makes wider curves that glide. Default 6.5.')}
                    </>)}

                    {bh.type === 'accelerate' && (<>
                      {renderMiniSlider('Acceleration', bh.accelRate, (v) => updateBehavior(idx, { accelRate: v }), 0.1, 5, 0.1, 'Speed increase per second.')}
                      {renderMiniSlider('Top Speed', bh.accelTopSpeed, (v) => updateBehavior(idx, { accelTopSpeed: v }), 1, 30, 1, 'Velocity cap after accelerating.')}
                    </>)}

                    {bh.type === 'motionGlide' && (<>
                      {renderMiniSlider('Friction', Math.round((bh.friction ?? 0) * 100) / 100, (v) => updateBehavior(idx, { friction: v, frictionSet: true }), 0, 0.5, 0.01, '0 = coast forever, 0.05 = the trap default')}
                    </>)}

                    {bh.type === 'motionChase' && (<>
                      {renderMiniSlider('Acceleration', Math.round((bh.chaseAccel ?? DRONE_ACCEL_TICK) * 1000) / 1000, (v) => updateBehavior(idx, { chaseAccel: v }), 0.01, 0.3, 0.005, 'How quickly the drone speeds up and swings round. Lower glides like on ice. Default 0.08.')}
                    </>)}

                    {bh.type === 'motionGrow' && (<>
                      {renderMiniSlider('Grow Rate', bh.growRate || 1, (v) => updateBehavior(idx, { growRate: v }), 0.5, 10, 0.5, 'Size increase rate over lifetime.')}
                    </>)}

                    {bh.type === 'invisible' && (<>
                      {renderMiniSlider('Fade In Rate', bh.invisFadeInRate ?? 0.04, (v) => updateBehavior(idx, { invisFadeInRate: v }), 0.01, 0.20, 0.005, 'Alpha recovery rate when moving.')}
                      {renderMiniSlider('Fade Out Rate', bh.invisFadeOutRate ?? 0.015, (v) => updateBehavior(idx, { invisFadeOutRate: v }), 0.005, 0.10, 0.005, 'Alpha decrease rate when idle.')}
                    </>)}

                    {bh.type === 'snake' && (<>
                      {renderMiniSlider('Swing', bh.snakeSwing ?? 48.4, (v) => updateBehavior(idx, { snakeSwing: v }), 5, 90, 0.5, 'How far the projectile turns to each side, in degrees (default 48.4).')}
                      {renderMiniSlider('Swing Speed', bh.snakeRate ?? 44.9, (v) => updateBehavior(idx, { snakeRate: v }), 5, 180, 0.5, 'How fast it swings from side to side, in degrees a second (default 44.9).')}
                      {renderMiniSlider('Straight Start', bh.snakeDelay ?? 0.475, (v) => updateBehavior(idx, { snakeDelay: v }), 0, 3, 0.025, 'How long it flies straight before the first turn, in seconds (default 0.475).')}
                      <ToggleRow label="Invert" description="The first turn goes the other way." help="Invert (first turn to the other side)"
                        checked={!!bh.snakeInvert} onChange={v => updateBehavior(idx, { snakeInvert: v })} />
                      <ToggleRow label="Right Click Only" description="Snakes only with right click held."
                        help="On: only projectiles fired while right click (or Shift) is held move like a snake. A projectile fired without it flies straight and stays straight."
                        checked={!!bh.snakeOnAlt} onChange={v => updateBehavior(idx, { snakeOnAlt: v })} />
                    </>)}
                  </div>
                </Reveal>
              </div>
            );
          })}

          {explode && onExplodeChange && (
            <ExplodeCard key="explode"
              explode={explode}
              onChange={onExplodeChange}
              onAddRing={onAddRing}
              onEditFragment={onEditFragment}
              level={level}
              roundLayer={roundLayer}
              bombTurret={bombTurret}
              tankLibrary={tankLibrary}
            />
          )}
          </MotionList>

          <Reveal when={availableBehaviors.length > 0 || showExplodeOption}>
            <CustomSelect
              value=""
              onChange={(val) => {
                if (val === EXPLODE_OPTION) { if (onAddExplode && !explodeTooDeep && !explodeLayerCap) onAddExplode(); return; }
                if (val) addBehavior(val as BehaviorType);
              }}
              placeholder="+ Add Behavior..."
              groups={[
                ...(availableMotion.length > 0 ? [{
                  label: 'Motion Physics',
                  options: availableMotion.map(bt => ({ value: bt, label: BEHAVIOR_LABELS[bt] })),
                }] : []),
                ...(availableSteering.length > 0 ? [{
                  label: 'Steering & Control',
                  options: availableSteering.map(bt => ({ value: bt, label: BEHAVIOR_LABELS[bt] })),
                }] : []),
                ...(showExplodeOption ? [{
                  label: 'On Death',
                  options: [explodeTooDeep
                    ? { value: EXPLODE_OPTION, label: `${EXPLODE_LABEL} (deepest level reached)`, disabled: true }
                    : explodeLayerCap
                      ? { value: EXPLODE_OPTION, label: withLayerCapReason(EXPLODE_LABEL), disabled: true }
                      : { value: EXPLODE_OPTION, label: EXPLODE_LABEL }],
                }] : []),
              ]}
            />
          </Reveal>
    </Group>
  );
};
