import React from 'react';
import { Turret } from '../../types';
import { renderSlider } from './uiHelpers';
import { NumberField, ToggleRow, Dim } from '../kit/kit';
import { Reveal } from '../kit/Collapse';
import { KNOCKBACK_HARD_MIN } from '@/game/ValueClamp';
import { ColorMapControl, ColorMapSwitch } from './ColorMapField';
import { type ColorMapValue, cmfTurretValue, cmfTurretSwitchValue, cmfTurretPatch, CMF_TURRET_DEFAULT_LABEL } from './colorMapRules';
import { CM_USE } from '../../utils/colorMap';
import { turretFill } from '../../utils/gameColors';
import { LOOK_SIZE } from '../../utils/placedLook';

export type TurretPropsPart = 'size' | 'look' | 'aboveBase' | 'position' | 'shape' | 'color' | 'firing' | 'bullet' | 'drawOrder';

interface Props {
  turret: Omit<Turret, 'id' | 'angle' | 'animProgress'>;
  onUpdate: (updates: Partial<Turret>) => void;
  part: TurretPropsPart;
  disabled?: boolean;
  selectedTurretAngle?: number | null;
  hideAmmoStats?: boolean;
  onOrientationChange?: (angleDeg: number) => void;
  tankSpawnerMode?: boolean;
  fragmentMode?: boolean;
  showAboveBase?: boolean;
}

export function turretPropsPartShows(part: TurretPropsPart, t: Pick<Turret, 'turretType' | 'look'>, opts: { fragmentMode?: boolean; hideAmmoStats?: boolean; showAboveBase?: boolean } = {}): boolean {
  const lookMode = !opts.fragmentMode && t.look !== undefined;
  const showStats = !lookMode && (!!opts.fragmentMode || !opts.hideAmmoStats);
  switch (part) {
    case 'size': return !!opts.fragmentMode;
    case 'look': return lookMode;
    case 'aboveBase': return !!opts.showAboveBase;
    case 'position': case 'drawOrder': return !opts.fragmentMode;
    case 'shape': return !opts.fragmentMode && !lookMode && (t.turretType !== 'auto' || !opts.hideAmmoStats);
    case 'color': return !opts.fragmentMode && !lookMode;
    case 'firing': case 'bullet': return showStats && (!!opts.fragmentMode || t.turretType !== 'decorative');
  }
}

export const TurretPropertiesEditor: React.FC<Props> = ({
  turret: t,
  onUpdate,
  part,
  disabled,
  selectedTurretAngle,
  hideAmmoStats,
  onOrientationChange,
  tankSpawnerMode,
  fragmentMode,
  showAboveBase,
}) => {
  const updateT = (updates: Partial<Turret>) => onUpdate(updates);
  const uid = React.useId();
  const show = (p: TurretPropsPart) => part === p;
  const lookMode = !fragmentMode && t.look !== undefined;
  const showStats = !lookMode && (fragmentMode || !hideAmmoStats);
  const colorShown = cmfTurretValue(t, turretFill(undefined, undefined), CM_USE.TANK);
  const colorForSwitch = cmfTurretSwitchValue(t, colorShown, CM_USE.TANK);
  const setColorFrom = (shown: ColorMapValue) => (next: ColorMapValue) => {
    const words = cmfTurretPatch(shown, next, turretFill(undefined, undefined));
    if (words) updateT(words);
  };
  const colorOverridden = t.turretType === 'auto' && !!t.autoCircleColorMatch;

  return (
    <>
      {show('size') && fragmentMode && renderSlider('Size', t.width, (v) => updateT({ width: v }), 0, 50, 'any', disabled, 'Piece size compared with the bomb')}

      {show('look') && lookMode && t.look && (<>
        <p className="k-hint">{t.look.name}. {t.look.kind === 'shape' ? 'A food shape' : 'An Other'} placed as a picture: it does nothing a turret does.</p>
        {renderSlider('Look Size', t.look.size, (v) => updateT({ look: { ...t.look!, size: Math.min(LOOK_SIZE.max, Math.max(LOOK_SIZE.min, v)) } }), LOOK_SIZE.min, LOOK_SIZE.max, 'any', disabled, 'How big the look is, against the body it sits on. It grows with its body as every part does.')}
        {!showAboveBase && (
          <ToggleRow label="Above Tank Body" disabled={disabled}
            help="Draws the look over the body it sits on. Off: under the body, as a barrel is."
            checked={t.aboveTankBody === true} onChange={v => updateT({ aboveTankBody: v })} />
        )}
        {showAboveBase && (
          <ToggleRow label="Turns Late" description="Turns a little after its base." disabled={disabled}
            help="In a match this look follows its base's turning a little late, on top of the base's own delay. Off: it turns with its base."
            checked={t.turnsLate === true} onChange={v => updateT({ turnsLate: v })} />
        )}
      </>)}

      {show('aboveBase') && showAboveBase && (
        <ToggleRow label="Above Base" description="Draws this part over its base." disabled={disabled}
          help="Draws this part over the base it sits on. Off: under the base, as before."
          checked={t.aboveBase === true} onChange={v => updateT({ aboveBase: v })} />
      )}

      {show('position') && !fragmentMode && (<>
        {renderSlider('X Offset', t.xOffset, (v) => updateT({ xOffset: v }), -Math.max(2, Math.ceil(Math.abs(t.xOffset ?? 0))), Math.max(2, Math.ceil(Math.abs(t.xOffset ?? 0))), 'any', disabled, 'Horizontal shift from turret anchor.')}
        {renderSlider('Y Offset', t.yOffset, (v) => updateT({ yOffset: v }), -Math.max(2, Math.ceil(Math.abs(t.yOffset ?? 0))), Math.max(2, Math.ceil(Math.abs(t.yOffset ?? 0))), 'any', disabled, 'Vertical shift from turret anchor.')}
        {renderSlider(
          'Distance From Center',
          Math.sqrt(t.xOffset * t.xOffset + t.yOffset * t.yOffset),
          (v) => {
            if (selectedTurretAngle != null) {
              updateT({
                xOffset: v * Math.cos(selectedTurretAngle),
                yOffset: v * Math.sin(selectedTurretAngle),
              });
            }
          },
          0, 2, 'any',
          disabled || selectedTurretAngle == null,
          'Radial distance from tank center.'
        )}
        {renderSlider(
          'Turret Orientation',
          selectedTurretAngle != null ? ((selectedTurretAngle * 180 / Math.PI) % 360 + 360) % 360 : 0,
          (v) => { if (onOrientationChange) onOrientationChange(v); },
          0, 360, 1,
          disabled || selectedTurretAngle == null || !onOrientationChange,
          'Angle around the tank body (degrees).'
        )}
      </>)}

      {show('shape') && !fragmentMode && !lookMode && (<>
        <Reveal when={t.turretType !== 'auto'}><div className="space-y-3">
          {renderSlider('Length', t.length, (v) => updateT({ length: v }), 1, 100, 'any', disabled, 'How far the barrel extends from the body.')}
          {renderSlider('Width', t.width, (v) => updateT({ width: v }), 0, 100, 'any', disabled, 'Barrel exit width. Also sets bullet diameter.')}
        </div></Reveal>
        {!hideAmmoStats && renderSlider('Aspect', t.aspect, (v) => updateT({ aspect: v }), 0.1, 3, 'any', disabled, 'Muzzle shape ratio. Below 1 = tapered exit.')}
      </>)}

      {show('color') && !fragmentMode && !lookMode && (
        <Dim when={colorOverridden || disabled} why={colorOverridden ? 'Set by Base Circle Color Match.' : undefined} className="k-stack">
          <ColorMapControl value={colorShown} use={CM_USE.TANK} onChange={setColorFrom(colorShown)}
            label={t.turretType === 'auto' ? 'Base Circle Color' : 'Barrel Color'}
            help={t.turretType === 'auto'
              ? `The color of this auto turret's base circle. Default color for this base: ${CMF_TURRET_DEFAULT_LABEL}.`
              : `The color of this barrel. Default color for this barrel: ${CMF_TURRET_DEFAULT_LABEL}.`} />
          <ColorMapSwitch value={colorForSwitch} use={CM_USE.TANK} onChange={setColorFrom(colorForSwitch)} compact />
        </Dim>
      )}

      {show('firing') && showStats && (
        <Dim when={tankSpawnerMode} why="Stats defined by spawned tank." className="k-stack">
          {!fragmentMode && (
            <NumberField id={`${uid}-bps`} label="Reload (BPS)" help="Shots per second. A higher number fires faster." value={t.bps} min={0} max={100} step={0.1}
              onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v)) updateT({ bps: Math.max(0, Math.min(100, v)) }); }} />
          )}
          {!fragmentMode && renderSlider('Shot Delay', t.delay, (v) => updateT({ delay: v }), 0, 10, 'any', disabled, 'Delay between trigger and firing, as a share of one reload. On a barrel that rides a missile it is how long the barrel waits after the missile leaves its launcher before its first shot, counted in reloads.')}
          {renderSlider('Spread', t.spread, (v) => updateT({ spread: v }), 0, 100, 'any', disabled, 'Random angle per shot. 0 = perfect accuracy.')}
          {renderSlider('Shudder', t.shudder ?? 0, (v) => updateT({ shudder: v }), 0, 1, 'any', disabled, 'How strong the randomness of each shot is. It widens the Spread angle and gives every bullet its own speed, up to twice this share faster or slower. 0 = every bullet the same speed.')}
          {!fragmentMode && renderSlider('Knockback', t.knockback, (v) => updateT({ knockback: v }), KNOCKBACK_HARD_MIN, 300, 'any', disabled, 'Recoil force applied to the tank on fire. On a barrel that rides a missile, each shot pushes the missile forward instead, by this many units a second (a rocket speeds up this way).')}
          {!fragmentMode && (
            <ToggleRow label="Right Click Fire" disabled={disabled}
              help="Fires with the right mouse button instead of the left, as a second weapon. Bots fire it as they fire any gun."
              checked={t.altFire === true} onChange={v => updateT({ altFire: v })} />
          )}
          <ToggleRow label="Fires Backward" disabled={disabled}
            help="Its shot leaves the other way, out of the back of the barrel, on a tank or on a round."
            checked={t.launchReversed === true} onChange={v => updateT({ launchReversed: v ? true : undefined })} />
        </Dim>
      )}

      {show('bullet') && showStats && (
        <Dim when={tankSpawnerMode} why="Stats defined by spawned tank." className="k-stack">
          <div className="k-grid-2">
            <NumberField id={`${uid}-damage`} label="Damage" help="The damage each projectile deals when it hits." value={t.bulletDamage} min={-2000} max={2000} step={1}
              onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v)) updateT({ bulletDamage: Math.max(-2000, Math.min(2000, v)) }); }} />
            <NumberField id={`${uid}-bhealth`} label="Bullet Health" help="How much damage a projectile can take before it breaks." value={t.bulletHealthBase ?? t.bulletDamage} min={0} max={2000} step={1}
              onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v)) updateT({ bulletHealthBase: Math.max(0, Math.min(2000, v)) }); }} />
            <NumberField id={`${uid}-pen`} label="Penetration" help="How well projectiles push through other projectiles and shapes." value={t.bulletPenetration} min={0} max={1000} step={1}
              onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v)) updateT({ bulletPenetration: Math.max(0, Math.min(1000, v)) }); }} />
            <NumberField id={`${uid}-lifetime`} label="Lifetime (s)" help="Seconds before the projectile fades away on its own." value={t.bulletLifetime} min={0} max={1000} step={0.1}
              onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v)) updateT({ bulletLifetime: Math.max(0, Math.min(1000, v)) }); }} />
          </div>
          {renderSlider('Bullet Speed', t.speed, (v) => updateT({ speed: v }), -5, 30, 'any', disabled, 'Projectile velocity after leaving the barrel.')}
          {renderSlider('Round Weight', t.shootDensity ?? 1, (v) => updateT({ shootDensity: Math.abs(v - 1) < 1e-9 ? undefined : v }), 0.1, Math.max(10, t.shootDensity ?? 1), 0.05, disabled, 'How heavy its rounds are when they push what they hit. 1 is an ordinary round; a Destroyer fires rounds of 3, a Finger of 80.')}
          {renderSlider('Round Toughness', t.shootResist ?? 1, (v) => updateT({ shootResist: Math.abs(v - 1) < 1e-9 ? undefined : v }), 0.1, 10, 0.05, disabled, 'How much less damage its rounds take from what they hit. 1 is an ordinary round; a trap is 3.')}
          {renderSlider('Toughness Against Rounds', t.fightResist ?? t.shootResist ?? 1, (v) => updateT({ fightResist: Math.abs(v - (t.shootResist ?? 1)) < 1e-9 ? undefined : v }), 0.1, 10, 0.05, disabled, 'How its rounds stand up in a fight with other rounds. In such a fight the tougher round both takes less and deals more. 1 is an ordinary round; a trap is 3.')}
          {renderSlider('Top Speed', t.projectileType?.topSpeedRatio ?? 1, (v) => updateT({ projectileType: { ...t.projectileType, topSpeedRatio: v } }), 0, 6, 0.01, disabled, 'The speed the round slows down to, as a share of its launch speed. 1 keeps its launch speed. A swarm drone thrown faster slows back to it by itself. Pushes from its own barrels can carry a round above this.')}
        </Dim>
      )}

      {show('drawOrder') && !fragmentMode && renderSlider('Render Layer', t.renderLayer ?? 0, (v) => updateT({ renderLayer: v }), 0, 10, 1, disabled, 'Draw order. Higher = renders on top.')}
    </>
  );
};
