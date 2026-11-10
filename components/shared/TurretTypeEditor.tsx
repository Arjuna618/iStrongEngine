import React from 'react';
import { Turret, TurretType } from '../../types';
import { TURRET_TYPE_LABELS } from './labels';
import { renderDropdown, renderMiniSlider } from './uiHelpers';
import { ToggleRow, Button, Dim } from '../kit/kit';
import { Reveal, SwapBox } from '../kit/Collapse';

export type TurretTypePart = 'type' | 'subTurrets' | 'baseShape' | 'firing' | 'targeting' | 'drawOrder';

interface Props {
  part: TurretTypePart;
  turret: Omit<Turret, 'id' | 'angle' | 'animProgress'>;
  onUpdate: (updates: Partial<Turret>) => void;
  tankSize: number;
  gridSpacing: number;
  hideAlwaysShoot?: boolean;
  isSubTurret?: boolean;
  onEnterSubTurretMode?: () => void;
  sectionOpen?: boolean;
  onSectionToggle?: (open: boolean) => void;
}

export function turretTypePartShows(part: TurretTypePart, t: Pick<Turret, 'turretType'>, opts: { hideAlwaysShoot?: boolean; onEnterSubTurretMode?: unknown } = {}): boolean {
  const type = t.turretType || 'regular';
  switch (part) {
    case 'type': return true;
    case 'subTurrets': return type === 'auto' && !!opts.onEnterSubTurretMode;
    case 'baseShape': case 'targeting': return type === 'auto';
    case 'firing': return type === 'auto' || (!opts.hideAlwaysShoot && type !== 'decorative');
    case 'drawOrder': return type !== 'decorative';
  }
}

export const TurretTypeEditor: React.FC<Props> = ({
  part,
  turret: t,
  onUpdate,
  hideAlwaysShoot,
  isSubTurret,
  onEnterSubTurretMode,
}) => {
  const updateT = (updates: Partial<Turret>) => onUpdate(updates);
  const isAuto = t.turretType === 'auto';

  switch (part) {
    case 'type': return (<>
      {renderDropdown('Type', t.turretType || 'regular', isSubTurret ? Object.fromEntries(Object.entries(TURRET_TYPE_LABELS).filter(([k]) => k !== 'auto')) : TURRET_TYPE_LABELS, (val) => {
        const turretType = val as TurretType;
        if (turretType === (t.turretType || 'regular')) return;
        updateT({
          turretType,
          independent: turretType === 'auto',
          fov: turretType === 'auto' ? 200 : 360,
          aboveTankBody: turretType === 'auto',
          visualLayers: [],
          ...(turretType === 'auto' ? { xOffset: 0, yOffset: 0 } : {}),
        });
      }, 'Regular is a barrel that fires where the tank aims. Auto Turret is a turret on a round base that finds and tracks targets by itself. Decorative never fires: it is only for the look.')}
      <SwapBox swapKey={t.turretType || 'regular'}>
        {isAuto ? <p className="k-hint">Auto turrets rotate independently to track enemies</p>
          : t.turretType === 'decorative' ? <p className="k-hint">Decorative turrets don't fire, used for visual layers</p> : null}
      </SwapBox>
    </>);

    case 'subTurrets': return isAuto && onEnterSubTurretMode ? (<>
      <Button variant="primary" block onClick={onEnterSubTurretMode}>Install Turret on Circle</Button>
      <Reveal when={(t.autoSubTurrets?.length ?? 0) > 0}>
        <p className="k-hint k-hint-strong text-center">
          {t.autoSubTurrets?.length ?? 0} sub turret{(t.autoSubTurrets?.length ?? 0) !== 1 ? 's' : ''} installed
        </p>
      </Reveal>
    </>) : null;

    case 'baseShape': return isAuto ? (<>
      {renderMiniSlider('Shape Size', t.autoCircleSize ?? 25, (v) => updateT({ autoCircleSize: v }), 1, 50, 1, 'Size of the auto turret base shape.')}
      {renderMiniSlider('Base Shape Sides', t.autoCircleBaseSides ?? 0, (v) => updateT({ autoCircleBaseSides: v }), 0, 12, 1, '0 = circle. 3 = triangle, 4 = square, etc.')}
      <Reveal when={(t.autoCircleBaseSides ?? 0) >= 3}>{renderMiniSlider('Base Shape Depth', Math.round((t.autoCircleBaseDepth ?? 0) * 100), (v) => updateT({ autoCircleBaseDepth: v / 100 }), 0, 100, 1, 'Star indent depth of the base shape. 0 = a plain shape.')}</Reveal>
    </>) : null;

    case 'firing': return (<>
      <Reveal when={isAuto}><div className="space-y-3">
        {renderMiniSlider('Fire Delay', t.autoFireDelay || 0, (v) => updateT({ autoFireDelay: v }), 0, 3, 0.1, 'Seconds before firing at a new target.')}
        <ToggleRow label="Fire With Tank" description="Fires with the tank, even off target." help="Fires whenever the tank fires, even when it cannot turn to the aim"
          checked={t.fireWithTank ?? false} onChange={v => updateT({ fireWithTank: v })} />
      </div></Reveal>
      <Reveal when={!hideAlwaysShoot && t.turretType !== 'decorative'}>
        <ToggleRow label="Always Shoot" description="Fires all the time, no click needed." help="Turret fires continuously without clicking"
          checked={t.alwaysShoot ?? false} onChange={v => updateT({ alwaysShoot: v })} />
      </Reveal>
      <Reveal when={!hideAlwaysShoot && t.turretType === 'regular'}>
        <ToggleRow label="Push Only" description="Fires no bullet, it only pushes the tank." help="Each shot makes nothing and only pushes the tank back along the barrel by its Knockback, like the Bomber's rear pair. It keeps its reload and delay."
          checked={t.pushOnly ?? false} onChange={v => updateT({ pushOnly: v })} />
      </Reveal>
    </>);

    case 'targeting': return isAuto ? (<>
      {(() => {
        const hasPrimary = !!(t.primarySubTurretId && t.autoSubTurrets && t.autoSubTurrets.length > 0);
        return (
          <Dim when={!hasPrimary} why="Set a primary sub turret first." className="k-stack">
            {renderMiniSlider('FOV Range', t.fov ?? 200, (v) => updateT({ fov: v }), 10, 360, 5, 'Detection arc in degrees. 360 = full circle.')}
            {renderMiniSlider('FOV Size', t.fovSize ?? 10, (v) => updateT({ fovSize: v }), 0, 100, 1, 'How far the turret can see. It never opens fire farther than its own shots fly.')}
          </Dim>
        );
      })()}
      {renderMiniSlider('Turn Speed', t.maxTurnSpeed || 4.5, (v) => updateT({ maxTurnSpeed: v }), 0.5, 40, 0.5, 'Top rotation speed when tracking targets. At 40 nothing holds the turret back.')}
      <ToggleRow label="Manual Control" description="Left click aims, right click away." help="LMB aims at mouse, RMB aims opposite"
        checked={t.manualControl ?? false} onChange={v => updateT({ manualControl: v })} />
    </>) : null;

    case 'drawOrder': return t.turretType !== 'decorative' ? (
      <ToggleRow label="Always Above" description="Its projectiles draw over all others." help="Render projectiles above all others"
        checked={t.alwaysAbove ?? false} onChange={v => updateT({ alwaysAbove: v })} />
    ) : null;
  }
};
