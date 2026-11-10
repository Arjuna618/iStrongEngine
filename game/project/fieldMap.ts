import type { GameState } from '../../types';

export type Home = 'canvas' | 'world' | 'mode' | 'enemies' | 'library' | 'person' | 'runtime' | 'derived' | 'legacy';

export const PROJECT_FIELDS: Record<keyof GameState, Home> = {
  tankSides: 'canvas', tankShapeDepth: 'canvas', tankShapeCurved: 'canvas', tankSize: 'canvas', tankColor: 'canvas',
  tankColorMap: 'canvas', tankColorFree: 'canvas', keepOwnColor: 'canvas', tankHP: 'canvas', tankBodyDamage: 'canvas',
  tankMovementSpeed: 'canvas', tankShieldRegen: 'canvas', tankShieldCapacity: 'canvas', fovMultiplier: 'canvas',
  maxSkillPoints: 'canvas', maxPointsPerSkill: 'canvas', bonusSkillPoints: 'canvas', skillCaps: 'canvas',
  preDefinedSkills: 'canvas', canEarnSkillPoints: 'canvas',
  baseSpinEnabled: 'canvas', baseSpinSpeed: 'canvas', baseSpinDirection: 'canvas', isHealer: 'canvas', healerAI: 'canvas',
  chargeAI: 'canvas', arenaCloserAI: 'canvas', ignoresWalls: 'canvas', showHealthBar: 'canvas', invisibleEnabled: 'canvas',
  invisibleFadeInRate: 'canvas', invisibleFadeOutRate: 'canvas', invisibleAlways: 'canvas', tankPushability: 'canvas',
  tankResistBase: 'canvas', tankPushShare: 'canvas', tankPenetrationBase: 'canvas', tankTouchScale: 'canvas',
  globalMaxAliveEnabled: 'canvas', globalMaxAlive: 'canvas', _hasNecroGlobalCap: 'canvas',
  primaryTurretId: 'canvas', useCustomAimDirection: 'canvas', customAimAngle: 'canvas', cameraZoomEnabled: 'canvas',
  cameraZoomDistance: 'canvas', statNamesType: 'canvas', turretGroups: 'canvas', editorTankLabel: 'canvas',
  currentTankFileName: 'canvas', canvasIsProjectile: 'canvas',
  turrets: 'canvas', bodyLayers: 'canvas', canvasEntityKind: 'canvas', viewingOther: 'canvas', editingShape: 'canvas',
  editingTurret: 'canvas', savedEditingTurretBeforePick: 'canvas', savedEditingTurretBeforeAutoMode: 'canvas',
  savedAutoSubEditingBeforePick: 'canvas',
  editorStateByContext: 'canvas', activeBodyLayerId: 'canvas', selectMode: 'canvas', selectedTurretId: 'canvas',
  autoSubTurretEditMode: 'canvas', autoSubTurretParentId: 'canvas', autoSubTurretEditing: 'canvas',
  autoSubTurretSelectedId: 'canvas', autoSubTurretSelectMode: 'canvas',
  mirrorMode: 'canvas', autoPlacement: 'canvas', autoPlacementCount: 'canvas', snapPlacement: 'canvas', snapPlacementCount: 'canvas',
  autoSubTurretMirrorMode: 'canvas', autoSubTurretSnapPlacement: 'canvas', autoSubTurretSnapPlacementCount: 'canvas',
  autoSubTurretAutoPlacement: 'canvas', autoSubTurretAutoPlacementCount: 'canvas',

  mapSize: 'world', mapConfig: 'world', multiAreaConfig: 'world', shapeSpawnConfig: 'world', spawnRate: 'world',
  velocityInheritance: 'world', maxEnemies: 'world',

  gameModeConfig: 'mode', teamBotSettings: 'mode', respawnLevelPercent: 'mode', respawnMinLevel: 'mode', respawnMaxLevel: 'mode',

  enemyConfigs: 'enemies', aiBehaviorCategories: 'enemies',

  tankLibrary: 'library', otherLibrary: 'library', projectileDesigns: 'library', turretPresets: 'library',

  playerName: 'person', debugMode: 'person', showHPBars: 'person', showPlayerNames: 'person', showPlayerScores: 'person',
  showKillsBar: 'person', showAllMinimap: 'person',
  debugShowShapeHP: 'person', debugShowProjectileHP: 'person', debugShowAILogic: 'person', debugShowXpGain: 'person',
  debugShowAllNames: 'person',
  showSpawnStats: 'person',
  dbgHudEntities: 'person', dbgHudJitter: 'person', dbgHudPerf: 'person', dbgHudMemory: 'person', dbgHudDrawOps: 'person', dbgHudWaves: 'person', dbgShowAreaMarks: 'person',
  dbgHudOverlayCost: 'person', dbgHudAimError: 'person', dbgHudAimReact: 'person', dbgHudStalkFlee: 'person',
  dbgHudRoleRepair: 'person', dbgHudFleeReroute: 'person', dbgHudFleeDeadEnd: 'person', dbgHudFearRearm: 'person',
  dbgHudFleeStand: 'person', dbgHudFleeCommit: 'person', dbgHudBorderSqueeze: 'person', dbgHudProvokeShield: 'person',
  dbgHudRetaliate: 'person', dbgHudYield: 'person', dbgHudWallShots: 'person', dbgHudAttackAim: 'person',
  dbgHudAimSelf: 'person', dbgHudAimTruth: 'person', dbgHudAimGodly: 'person', dbgHudPlayerHunt: 'person',
  dbgHudDroneCloud: 'person', dbgHudChaseFlap: 'person', dbgHudCornerFire: 'person', dbgHudAimMount: 'person',
  dbgHudFarmAim: 'person', dbgHudCornerSidestep: 'person', dbgHudGhost: 'person', dbgHudPathBlock: 'person',
  dbgHudChaseFutile: 'person', dbgHudPeekFreeze: 'person', dbgHudStandoff: 'person', dbgHudNaN: 'person',
  dbgHudLoopErrors: 'person', dbgHudRarity: 'person',
  dbgAiAimLaser: 'person', dbgAiTargetLine: 'person', dbgAiFollowMarker: 'person', dbgAiThreatLine: 'person',
  dbgAiOrbitRing: 'person', dbgAiFearMeter: 'person', dbgAiStateLabel: 'person', dbgAiRoleColumn: 'person', dbgAiNavDebug: 'person', dbgAiLight: 'person', dbgDarkNoFog: 'person',

  tankCurrentHealth: 'runtime', tankCurrentShield: 'runtime', tankDisplayHealth: 'runtime', tankDisplayShield: 'runtime',
  lastTankDamageTime: 'runtime', tankHpBarOpacity: 'runtime', level: 'runtime', currentXp: 'runtime', skillPoints: 'runtime',
  upgrades: 'runtime', arrasResist: 'runtime', kills: 'runtime', bossKills: 'runtime', topKills: 'runtime', foodKills: 'runtime',
  playerDead: 'runtime', deathKills: 'runtime', deathLevel: 'runtime', deathFoodKills: 'runtime', deathSurvivalMs: 'runtime',
  deathCauseKind: 'runtime', deathCauseName: 'runtime', deathColorTeamIndex: 'runtime', deathMenuOpenedAt: 'runtime',
  isTestMode: 'runtime', paused: 'runtime', isDebugMenuOpen: 'runtime', currentBranchRoot: 'runtime',
  evolutionMenuVisible: 'runtime', availableEvolutions: 'runtime', evolutionBranchLabels: 'runtime', classTreeOpen: 'runtime',
  dreadUpgradeDismissed: 'runtime', devMenuBypassActive: 'runtime', playerEvolutionLocked: 'runtime', godMode: 'runtime',
  ghostMode: 'runtime', gracePeriodActive: 'runtime', gracePeriodStartTime: 'runtime', _preGraceGodMode: 'runtime',
  debugFovMultiplier: 'runtime', autoFire: 'runtime', autoSpin: 'runtime', autoOverride: 'runtime', reverseTank: 'runtime',
  tankInvisAlpha: 'runtime', playerGrowthScale: 'runtime', tankSpawning: 'runtime', tankSpawnStartTime: 'runtime',
  messages: 'runtime', presetPreviewTurrets: 'runtime', presetPreviewXform: 'runtime', inheritMode: 'runtime', inheritTargetTurretId: 'runtime',
  autoSubTurretInheritMode: 'runtime', autoSubTurretInheritTargetId: 'runtime', enemyTanks: 'runtime', playerId: 'runtime',
  manhuntLeaderId: 'runtime', leaderboardVersion: 'runtime',

  aiBehaviorCategoriesVersion: 'derived',

  shapeLimit: 'legacy', shapeConfigs: 'legacy',
};

export function fieldsOf(home: Home): (keyof GameState)[] {
  return (Object.keys(PROJECT_FIELDS) as (keyof GameState)[]).filter(k => PROJECT_FIELDS[k] === home).sort();
}
