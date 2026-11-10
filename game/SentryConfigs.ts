import type { EnemyConfig, TankConfig } from '../types';
import { ARRAS_PARITY } from './arrasCombat';

import sentryGunJson      from '../Data/Tanks/sentryGun.json';
import sentrySwarmJson    from '../Data/Tanks/sentrySwarm.json';
import sentryTrapJson     from '../Data/Tanks/sentryTrap.json';
import sentinelGunJson    from '../Data/Tanks/sentinelGun.json';
import sentinelSwarmJson  from '../Data/Tanks/sentinelSwarm.json';
import sentinelTrapJson   from '../Data/Tanks/sentinelTrap.json';
import shinySentryGunJson   from '../Data/Tanks/shinySentryGun.json';
import shinySentrySwarmJson from '../Data/Tanks/shinySentrySwarm.json';
import shinySentryTrapJson  from '../Data/Tanks/shinySentryTrap.json';
import sentinelMinigunJson  from '../Data/Tanks/sentinelMinigun.json';
import sentinelLauncherJson from '../Data/Tanks/sentinelLauncher.json';
import sentinelCrossbowJson from '../Data/Tanks/sentinelCrossbow.json';

const SENTRY_ENEMY_BASE = {
  aiBehavior: 'Enemy' as const,
  upgradeLogic: 'OffensiveWeighted' as const,
  forceAutospin: false,
  forceAutoshoot: true,
  maxSpawnCount: 20,
  autoRevival: false,
  aimbotStrength: 0,
  turnSpeed: 100,
  facingType: 'faceTarget' as const,
  baseLevel: 0,
  isSentryEnemy: true,
} as const;

type SentryTier = 'sentry' | 'sentinel';

const LEGACY_ID_MAP: Record<string, string> = {
  sentryGun:   '__sentry_gun__',
  sentrySwarm: '__sentry_swarm__',
  sentryTrap:  '__sentry_trap__',
};

function resolveId(key: string): string {
  return LEGACY_ID_MAP[key] ?? `__sentry_${key}__`;
}

export function sentryAimAccuracy(key: string): number {
  if (ARRAS_PARITY.SENTRY_LEAD === 0) return 0;
  return /sentinel/i.test(key) ? 0 : 100;
}

function tankJsonToEnemyConfig(
  json: { data: unknown },
  key: string,
  tier: SentryTier,
  label: string,
  defaultEnabled: boolean,
  xpValue: number,
): EnemyConfig {
  return {
    ...SENTRY_ENEMY_BASE,
    aimbotStrength: sentryAimAccuracy(key),
    id: resolveId(key),
    enemyName: label,
    tankConfig: json.data as TankConfig,
    enabled: defaultEnabled,
    xpValue,
    specialKey: key,
    sentryTier: tier,
  };
}

const XP_SENTRY   = 1500;
const XP_SHINY    = 50000;
const XP_SENTINEL = 26668;
export const SENTRY_ENEMY_CONFIGS: Record<string, EnemyConfig> = {
  sentrySwarm:       tankJsonToEnemyConfig(sentrySwarmJson,       'sentrySwarm',       'sentry',  'Swarm Sentry',        true,  XP_SENTRY),
  sentryGun:         tankJsonToEnemyConfig(sentryGunJson,         'sentryGun',         'sentry',  'Gun Sentry',          true,  XP_SENTRY),
  sentryTrap:        tankJsonToEnemyConfig(sentryTrapJson,        'sentryTrap',        'sentry',  'Trap Sentry',         true,  XP_SENTRY),
  sentinelSwarm:     tankJsonToEnemyConfig(sentinelSwarmJson,     'sentinelSwarm',     'sentry',  'Swarm Sentinel',      false, XP_SENTRY),
  sentinelGun:       tankJsonToEnemyConfig(sentinelGunJson,       'sentinelGun',       'sentry',  'Gun Sentinel',        false, XP_SENTRY),
  sentinelTrap:      tankJsonToEnemyConfig(sentinelTrapJson,      'sentinelTrap',      'sentry',  'Trap Sentinel',       false, XP_SENTRY),
  shinySentrySwarm:  tankJsonToEnemyConfig(shinySentrySwarmJson,  'shinySentrySwarm',  'sentry',  'Shiny Swarm Sentry',  false, XP_SHINY),
  shinySentryGun:    tankJsonToEnemyConfig(shinySentryGunJson,    'shinySentryGun',    'sentry',  'Shiny Gun Sentry',    false, XP_SHINY),
  shinySentryTrap:   tankJsonToEnemyConfig(shinySentryTrapJson,   'shinySentryTrap',   'sentry',  'Shiny Trap Sentry',   false, XP_SHINY),

  sentinelMinigun:   tankJsonToEnemyConfig(sentinelMinigunJson,   'sentinelMinigun',   'sentinel', 'Minigun Sentinel',   false, XP_SENTINEL),
  sentinelLauncher:  tankJsonToEnemyConfig(sentinelLauncherJson,  'sentinelLauncher',  'sentinel', 'Missile Sentinel',   false, XP_SENTINEL),
  sentinelCrossbow:  tankJsonToEnemyConfig(sentinelCrossbowJson,  'sentinelCrossbow',  'sentinel', 'Crossbow Sentinel',  false, XP_SENTINEL),
};

type UiEntry = { label: string; tankConfig: TankConfig };

function uiEntry(key: string): UiEntry {
  const cfg = SENTRY_ENEMY_CONFIGS[key];
  return { label: cfg.enemyName, tankConfig: cfg.tankConfig };
}

export const SENTRY_TANK_CONFIGS: Record<string, UiEntry> = {
  sentrySwarm:      uiEntry('sentrySwarm'),
  sentryGun:        uiEntry('sentryGun'),
  sentryTrap:       uiEntry('sentryTrap'),
  sentinelSwarm:    uiEntry('sentinelSwarm'),
  sentinelGun:      uiEntry('sentinelGun'),
  sentinelTrap:     uiEntry('sentinelTrap'),
  shinySentrySwarm: uiEntry('shinySentrySwarm'),
  shinySentryGun:   uiEntry('shinySentryGun'),
  shinySentryTrap:  uiEntry('shinySentryTrap'),
};

export const SENTINEL_TANK_CONFIGS: Record<string, UiEntry> = {
  sentinelMinigun:  uiEntry('sentinelMinigun'),
  sentinelLauncher: uiEntry('sentinelLauncher'),
  sentinelCrossbow: uiEntry('sentinelCrossbow'),
};
