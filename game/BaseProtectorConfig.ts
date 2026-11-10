import type { EnemyConfig, TankConfig, AIBehavior, UpgradeStat } from '../types';
import baseProtectorJson from '../Data/Tanks/baseProtector.json';
import { BASE_PROTECTOR_DEFAULT_TANK } from './BaseProtector';

export const BASE_PROTECTOR_ARRAS_SKILLS: Partial<Record<UpgradeStat, number>> = {
  reload: 9,
  bulletPenetration: 9,
  bulletHealth: 9,
  bulletDamage: 9,
  bulletSpeed: 9,
};

export function baseProtectorConfigId(teamIndex: number): string {
  return `__base_protector_team${teamIndex + 1}__`;
}

const TEAM_BEHAVIORS: AIBehavior[] = ['Team1', 'Team2', 'Team3', 'Team4'];

export function makeBaseProtectorConfig(
  teamIndex: number,
  tankConfig: TankConfig,
  maxAlive: number,
  displayName: string,
): EnemyConfig {
  tankConfig.tankMovementSpeed = 0;

  const _hasAutoTurret = (tankConfig.turrets ?? []).some(t => t.turretType === 'auto');
  if (!_hasAutoTurret) tankConfig.baseSpinEnabled = false;

  tankConfig.preDefinedSkills = {
    ...(tankConfig.preDefinedSkills ?? {}),
    ...BASE_PROTECTOR_ARRAS_SKILLS,
  } as Record<UpgradeStat, number>;

  return {
    id: baseProtectorConfigId(teamIndex),
    enemyName: displayName,
    tankConfig,
    baseLevel: 0,
    aiBehavior: TEAM_BEHAVIORS[teamIndex] ?? 'Team1',
    upgradeLogic: 'OffensiveWeighted',
    forceAutospin: false,
    forceAutoshoot: false,
    maxSpawnCount: Math.max(1, maxAlive),
    autoRevival: false,
    enabled: true,
    aimbotStrength: 0,
    turnSpeed: 50,
    facingType: 'primaryTurret',
    isBaseProtector: true,
    xpValue: 0,
  };
}

export function cloneDefaultBaseProtectorTank(): TankConfig {
  return JSON.parse(JSON.stringify((baseProtectorJson as { data: unknown }).data)) as TankConfig;
}

export { BASE_PROTECTOR_DEFAULT_TANK };
