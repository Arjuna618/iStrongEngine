import React from 'react';
import { MousePointer2 } from '../ui/icons';
import { SNAP_COUNTS } from '../../types';
import { ButtonTooltip } from './HelpTooltip';
import { AURA_DEFAULT, AURA_RANGE, AURA_TYPES } from '../../utils/aura';
import { ToggleRow, SliderRow, SelectRow, FieldRow, Segmented, Button } from '../kit/kit';
import { Reveal } from '../kit/Collapse';

export type TurretActionPart =
  | 'listActions'
  | 'primary'
  | 'instructions'
  | 'syncs'
  | 'colorMatch'
  | 'baseMotion'
  | 'healAura'
  | 'above'
  | 'aim';

interface Props {
  part: TurretActionPart;
  mirrorMode: boolean;
  selectMode: boolean;
  autoPlacement: boolean;
  autoPlacementCount: number;
  snapPlacement: boolean;
  snapPlacementCount: number;
  aboveTankBody: boolean;
  bodySides: number;
  syncsSkillsToggle?: boolean;
  showSyncsSkills?: boolean;
  hideAboveTankBody?: boolean;
  autoCircleColorMatch?: boolean;
  isAutoTurret?: boolean;
  autoCircleSpin?: boolean;
  autoCircleSpinMode?: 'fixed' | 'withBody';
  autoCircleSpinSpeed?: number;
  autoCircleSpinDirection?: 1 | -1;
  healerToggle?: boolean;
  autoCircleHealer?: boolean;
  aura?: boolean;
  auraType?: 'damage' | 'heal';
  auraSize?: number;
  auraStrength?: number;
  auraOpacity?: number;
  onPatchAura?: (patch: { aura?: boolean; auraType?: 'damage' | 'heal'; auraSize?: number; auraStrength?: number; auraOpacity?: number }) => void;
  autoCircleFixed?: boolean;
  hideHealerToggle?: boolean;
  onToggleMirror: (v: boolean) => void;
  onToggleCompass: (v: boolean) => void;
  onSetAutoPlacementCount: (v: number) => void;
  onToggleSnap: (v: boolean) => void;
  onSetSnapCount: (v: number) => void;
  onToggleAbove: (v: boolean) => void;
  onToggleCircleColorMatch?: (v: boolean) => void;
  onToggleSyncsSkills?: (v: boolean) => void;
  onToggleCircleSpin?: (v: boolean) => void;
  onSetCircleSpinMode?: (v: 'fixed' | 'withBody') => void;
  onSetCircleSpinSpeed?: (v: number) => void;
  onSetCircleSpinDirection?: (v: 1 | -1) => void;
  onToggleHealer?: (v: boolean) => void;
  onToggleAutoCircleHealer?: (v: boolean) => void;
  onToggleCircleFixed?: (v: boolean) => void;

  useCustomAimDirection?: boolean;
  onToggleCustomAimDirection?: (v: boolean) => void;

  cameraZoomEnabled?: boolean;
  cameraZoomDistance?: number;
  onToggleCameraZoom?: (v: boolean) => void;
  onSetCameraZoomDistance?: (v: number) => void;

  canMakePrimary: boolean;
  onMakePrimary: () => void;
  onUndoLast?: () => void;
  canUndoLast?: boolean;

  inheritMode?: boolean;
  canInherit?: boolean;
  onToggleInherit?: () => void;

  instructionContext?: 'tank' | 'projectile' | 'auto-turret';
}

const SPIN_MODES = [
  { value: 'fixed', label: 'Fixed Speed' },
  { value: 'withBody', label: 'Spin With Body' },
];
const SPIN_DIRECTIONS = [
  { value: '-1', label: 'CW', title: 'Clockwise' },
  { value: '1', label: 'CCW', title: 'Counterclockwise' },
];
const AURA_TYPE_OPTIONS = AURA_TYPES.map(o => ({ value: o.value, label: o.label }));

export function turretActionPartShows(part: TurretActionPart, p: Pick<Props, 'isAutoTurret' | 'onToggleCircleColorMatch' | 'onToggleCircleSpin' | 'onToggleCircleFixed' | 'onToggleAutoCircleHealer' | 'onPatchAura' | 'hideHealerToggle' | 'showSyncsSkills' | 'onToggleSyncsSkills' | 'hideAboveTankBody' | 'onToggleCustomAimDirection' | 'onToggleCameraZoom'>): boolean {
  switch (part) {
    case 'colorMatch': return !!p.isAutoTurret && !!p.onToggleCircleColorMatch;
    case 'baseMotion': return !!p.isAutoTurret && (!!p.onToggleCircleSpin || !!p.onToggleCircleFixed);
    case 'healAura': return !!p.isAutoTurret && ((!p.hideHealerToggle && !!p.onToggleAutoCircleHealer) || !!p.onPatchAura);
    case 'syncs': return !!p.showSyncsSkills && !!p.onToggleSyncsSkills;
    case 'above': return !p.hideAboveTankBody;
    case 'aim': return !!p.onToggleCustomAimDirection || !!p.onToggleCameraZoom;
    default: return true;
  }
}

export const TurretActionBar: React.FC<Props> = ({
  part,
  mirrorMode,
  selectMode,
  autoPlacement,
  autoPlacementCount,
  snapPlacement,
  snapPlacementCount,
  aboveTankBody,
  bodySides,
  syncsSkillsToggle,
  showSyncsSkills,
  hideAboveTankBody,
  autoCircleColorMatch,
  isAutoTurret,
  autoCircleSpin,
  autoCircleSpinMode,
  autoCircleSpinSpeed,
  autoCircleSpinDirection,
  autoCircleHealer,
  aura,
  auraType,
  auraSize,
  auraStrength,
  auraOpacity,
  onPatchAura,
  autoCircleFixed,
  hideHealerToggle,
  onToggleMirror,
  onToggleCompass,
  onSetAutoPlacementCount,
  onToggleSnap,
  onSetSnapCount,
  onToggleAbove,
  onToggleCircleColorMatch,
  onToggleSyncsSkills,
  onToggleCircleSpin,
  onSetCircleSpinMode,
  onSetCircleSpinSpeed,
  onSetCircleSpinDirection,
  onToggleAutoCircleHealer,
  onToggleCircleFixed,
  useCustomAimDirection,
  onToggleCustomAimDirection,
  cameraZoomEnabled,
  cameraZoomDistance,
  onToggleCameraZoom,
  onSetCameraZoomDistance,
  canMakePrimary,
  onMakePrimary,
  onUndoLast,
  canUndoLast,
  inheritMode,
  canInherit,
  onToggleInherit,
  instructionContext = 'tank',
}) => {
  const isComboMode = autoPlacement && snapPlacement && bodySides >= 3;
  const compassMax = bodySides >= 3 ? bodySides : 8;
  const targetName = instructionContext === 'projectile' ? 'projectile preview' : 'canvas';

  switch (part) {
    case 'listActions': return (
      <div>
        {onToggleInherit && (
          <ButtonTooltip text="Click another turret to copy its properties.">
            <Button size="sm" block variant={inheritMode ? 'primary' : 'secondary'}
              onClick={onToggleInherit} disabled={!canInherit && !inheritMode}>Inherit Settings</Button>
          </ButtonTooltip>
        )}
      </div>
    );

    case 'primary': return (
      <ButtonTooltip text="Sets this turret as the mouse aiming reference.">
        <Button size="sm" block icon={<MousePointer2 size={14} />} onClick={onMakePrimary} disabled={!canMakePrimary}>Make Primary</Button>
      </ButtonTooltip>
    );

    case 'instructions': return (
      <p className={inheritMode || selectMode ? 'k-hint k-hint-strong' : 'k-hint'}>
        {inheritMode ? 'Select a turret to copy settings from.'
          : !selectMode ? (
            autoPlacement
              ? isComboMode
                ? `Click ${targetName} to place ${Math.min(autoPlacementCount, bodySides)} turret${Math.min(autoPlacementCount, bodySides) > 1 ? 's' : ''} on face midpoints.`
                : `Click ${targetName} to place ${autoPlacementCount} turrets evenly.`
              : snapPlacement
              ? bodySides >= 3
                ? `Click ${targetName} to place. Snapping to ${bodySides} face midpoints.`
                : `Click ${targetName} to place. Snapping to ${SNAP_COUNTS[snapPlacementCount]} directions.`
              : instructionContext === 'projectile'
              ? 'Click projectile preview to place. Hold Shift to snap angle.'
              : instructionContext === 'auto-turret'
              ? 'Click canvas to place on circle. Hold Shift to snap angle.'
              : 'Click canvas to place. Hold Shift to snap angle.'
          ) : instructionContext === 'auto-turret'
            ? 'Click a sub turret on the circle to edit it.'
            : `Click a turret on the ${instructionContext === 'projectile' ? 'projectile' : 'tank'} to edit it.`}
      </p>
    );

    case 'syncs': return (<>
      {showSyncsSkills && onToggleSyncsSkills && (
        <ToggleRow label="Syncs Skills (Live Upgrades)" description="Living drones get upgrades at once." help="Living drones/minions instantly reflect stat upgrades."
          checked={syncsSkillsToggle ?? false} onChange={onToggleSyncsSkills} />
      )}
    </>);

    case 'colorMatch': return isAutoTurret && onToggleCircleColorMatch ? (
      <ToggleRow label="Base Circle Color Match" description="The base wears the body color." help="Circle base matches the tank body color."
        checked={autoCircleColorMatch ?? false} onChange={onToggleCircleColorMatch} />
    ) : null;

    case 'baseMotion': return isAutoTurret ? (<>
      {onToggleCircleSpin && (<>
        <ToggleRow label="Auto Circle Spin" description="Spins the base. Turrets won't aim." help="Spins the circle base. Sub turrets won't aim."
          checked={autoCircleSpin ?? false} onChange={onToggleCircleSpin} />
        <Reveal when={autoCircleSpin}><div className="space-y-3">
          <FieldRow label="Spin Mode" stacked help="Fixed Speed spins the base at its own speed and direction. Spin With Body turns it together with the tank body.">
            <Segmented block value={autoCircleSpinMode ?? 'fixed'} onChange={v => onSetCircleSpinMode?.(v === 'withBody' ? 'withBody' : 'fixed')} options={SPIN_MODES} />
          </FieldRow>
          <Reveal when={(autoCircleSpinMode ?? 'fixed') === 'fixed'}><div className="space-y-3">
            <SliderRow label="Speed" help="How fast the base spins while it spins at a fixed speed." value={autoCircleSpinSpeed ?? 50} onChange={v => onSetCircleSpinSpeed?.(v)} min={0} max={500} step={1} />
            <FieldRow label="Direction" help="Which way the base spins.">
              <Segmented value={(autoCircleSpinDirection ?? 1) === -1 ? '-1' : '1'} onChange={v => onSetCircleSpinDirection?.(v === '-1' ? -1 : 1)} options={SPIN_DIRECTIONS} />
            </FieldRow>
          </div></Reveal>
        </div></Reveal>
      </>)}
      <Reveal when={onToggleCircleFixed && !autoCircleSpin}>
        <ToggleRow label="Fixed Position" description="Fires where it points." help="No targeting. Fires in barrel direction."
          checked={autoCircleFixed ?? false} onChange={onToggleCircleFixed} />
      </Reveal>
    </>) : null;

    case 'healAura': return isAutoTurret ? (<>
      {!hideHealerToggle && onToggleAutoCircleHealer && (
        <ToggleRow label="Healer" description="Its turrets heal teammates." help="Shows red cross. All mounted turrets heal teammates."
          checked={autoCircleHealer ?? false} onChange={onToggleAutoCircleHealer} />
      )}
      {onPatchAura && (<>
        <ToggleRow label="Aura" description="Hurts or heals inside a ring." help="A ring around this base that hurts or heals what stands inside it. It appears after the grace period."
          checked={aura ?? false} onChange={on => onPatchAura(on
            ? { aura: true, auraType: auraType ?? 'damage', auraSize: auraSize ?? AURA_DEFAULT.size, auraStrength: auraStrength ?? AURA_DEFAULT.strength, auraOpacity: auraOpacity ?? AURA_DEFAULT.opacity }
            : { aura: false })} />
        <Reveal when={aura}><div className="space-y-3">
          <SelectRow label="Aura Type" help="Damage hurts what stands inside the ring, Heal heals it. A Damage ring is drawn in the named color Blue and a Heal ring in Red." value={auraType ?? 'damage'} onChange={(v) => onPatchAura({ auraType: v === 'heal' ? 'heal' : 'damage' })} options={AURA_TYPE_OPTIONS} />
          <SliderRow label="Aura Size" help="How wide the ring is, counted in the size of the tank it sits on: 1 reaches the edge of the body, 3 reaches three times as far." value={auraSize ?? AURA_DEFAULT.size} onChange={v => onPatchAura({ auraSize: v })}
            min={AURA_RANGE.size.min} max={AURA_RANGE.size.max} step={AURA_RANGE.size.step} display={(auraSize ?? AURA_DEFAULT.size).toFixed(2)} />
          <SliderRow label="Aura Strength" help="How hard the ring hurts or heals. Bullet Damage points make it stronger. A Heal ring heals a third of what the same Damage ring would take." value={auraStrength ?? AURA_DEFAULT.strength} onChange={v => onPatchAura({ auraStrength: v })}
            min={AURA_RANGE.strength.min} max={AURA_RANGE.strength.max} step={AURA_RANGE.strength.step} display={(auraStrength ?? AURA_DEFAULT.strength).toFixed(2)} />
          <SliderRow label="Aura Opacity" help="How solid the ring is drawn. It only changes the look." value={auraOpacity ?? AURA_DEFAULT.opacity} onChange={v => onPatchAura({ auraOpacity: v })}
            min={AURA_RANGE.opacity.min} max={AURA_RANGE.opacity.max} step={AURA_RANGE.opacity.step} display={(auraOpacity ?? AURA_DEFAULT.opacity).toFixed(2)} />
        </div></Reveal>
      </>)}
    </>) : null;

    case 'above': return !hideAboveTankBody ? (
      <ToggleRow label="Above Tank Body" description="Draws it and its bullets on top." help="Renders turret and bullets above the body."
        checked={aboveTankBody} onChange={onToggleAbove} />
    ) : null;

    case 'aim': return (<>
      {onToggleCustomAimDirection && (
        <ToggleRow label="Direct Aim" description="The body faces the mouse." help="Body faces mouse directly. Disables primary turret aiming."
          checked={useCustomAimDirection ?? false} onChange={onToggleCustomAimDirection} />
      )}
      {onToggleCameraZoom && (<>
        <ToggleRow label="Sniper Zoom" description="Right click looks ahead." help="Right click shifts camera in aim direction."
          checked={cameraZoomEnabled ?? false} onChange={onToggleCameraZoom} />
        {onSetCameraZoomDistance && (
          <Reveal when={cameraZoomEnabled}>
            <SliderRow label="Zoom Distance" help="How far the camera moves ahead in the aim direction while you hold the right mouse button." value={cameraZoomDistance ?? 225} onChange={v => onSetCameraZoomDistance(Number(v))} min={50} max={800} step={25} />
          </Reveal>
        )}
      </>)}
    </>);
  }
};
