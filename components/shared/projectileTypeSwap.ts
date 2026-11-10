import type { BehaviorConfig, BehaviorType, ProjectileTypeConfig, ProjectileVisual, Turret } from '../../types';
import { DEFAULT_PROJECTILE_TYPE, DEFAULT_TURRET_CONFIG } from '../../types';
import { PROJECTILE_PRESET_BEHAVIORS, PROJECTILE_PRESETS } from './labels';
import { getArrasShootResist } from '../../game/arrasCombat';

export const MOTION_BEHAVIOR_TYPES: ReadonlySet<BehaviorType> = new Set<BehaviorType>([
  'motionGlide', 'motionMotor', 'motionChase', 'motionSwarm', 'motionGrow', 'motionWithMaster',
]);

export const INCOMPATIBLE_GROUPS: readonly (readonly BehaviorType[])[] = [
  ['followMouse', 'goToTarget', 'minionControl'] as const,
];

export const ALWAYS_SHOOT_VISUALS: ReadonlySet<ProjectileVisual> = new Set<ProjectileVisual>(['drone', 'minion']);

export function projectileTypeResetPatch(
  current: Readonly<Partial<ProjectileTypeConfig>> | undefined,
  visual: ProjectileVisual,
): Partial<ProjectileTypeConfig> {
  const out: Partial<ProjectileTypeConfig> = {
    ...DEFAULT_PROJECTILE_TYPE, ...PROJECTILE_PRESETS[visual], visual, subTurrets: [],
  };
  if (current) {
    for (const k of Object.keys(current)) {
      if (!(k in out)) (out as Record<string, unknown>)[k] = undefined;
    }
  }
  return out;
}

export function presetBehaviorsFor(visual: ProjectileVisual): BehaviorConfig[] {
  return (PROJECTILE_PRESET_BEHAVIORS[visual] ?? []).map(b => ({ ...b }));
}

export function typeResetTurretFields(visual: ProjectileVisual): Partial<Turret> {
  return {
    explode: undefined,
    healer: DEFAULT_TURRET_CONFIG.healer,
    wifiRange: DEFAULT_TURRET_CONFIG.wifiRange,
    wifiRangeValue: DEFAULT_TURRET_CONFIG.wifiRangeValue,
    shootResist: getArrasShootResist(PROJECTILE_PRESETS[visual]?.statCalculatorType ?? DEFAULT_PROJECTILE_TYPE.statCalculatorType),
    fightResist: undefined,
  };
}
