import { Vector } from "./utils/MathUtils";
import { CM, CM_USE, cmHex } from "./utils/colorMap";
import type { Rarity, LabyLevel } from "@/game/ShapeRegistry";
import { SHAPES_ARRAS, SHAPE_SCORES, SHAPE_SPAWN_PLAN } from "@/game/shapesSwitch";
import { applySpawnProfile, SPAWN_PROFILE_DEFAULT_ID } from "@/game/spawnPlan";
import { EDGE_ARRAS } from "@/game/edgeSwitch";
import { SHAPE_BOOK, SHAPE_BOOK_OD_ROOMS, SHAPE_BOOK_SCORE } from "@/game/shapeBook.generated";
import type { RockFormationWord } from "@/game/rockFormations.generated";
import { ALL_MODES } from "@/game/allModesSwitch";
import { SMALL_FIX } from "@/game/smallFixSwitch";
import { AI_CATEGORY_ADDED } from "@/game/aiCategoryLists.generated";
import { swapSideNamesTwoThree } from "@/game/mapEvents/doc";
import { MODE_WORLDS, worldIdOf, worldWritesMap, type BaseLayout, type MapPool } from "@/game/modeWorlds";
import type { TankDebuffs } from "@/game/tankDebuffs";
import type { GrowthRules } from "@/game/growthRules";

export const SNAP_COUNTS = [4, 8, 16, 32, 64] as const;

export interface Point {
  x: number;
  y: number;
}

export type TurretType = 'regular' | 'auto' | 'decorative';

export type ProjectileVisual =
  | 'bullet'
  | 'drone'
  | 'trap'
  | 'swarm'
  | 'boomerang'
  | 'hive'
  | 'minion';
export interface GunStats {
  reload: number;
  recoil: number;
  shudder: number;
  size: number;
  health: number;
  damage: number;
  pen: number;
  speed: number;
  maxSpeed: number;
  range: number;
  density: number;
  spray: number;
  resist: number;
}

export function combineStats(stats: Partial<GunStats>[]): GunStats {
  const result: GunStats = {
    reload: 1, recoil: 1, shudder: 1, size: 1, health: 1,
    damage: 1, pen: 1, speed: 1, maxSpeed: 1, range: 1,
    density: 1, spray: 1, resist: 1,
  };
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    result.reload *= s.reload ?? 1;
    result.recoil *= s.recoil ?? 1;
    result.shudder *= s.shudder ?? 1;
    result.size *= s.size ?? 1;
    result.health *= s.health ?? 1;
    result.damage *= s.damage ?? 1;
    result.pen *= s.pen ?? 1;
    result.speed *= s.speed ?? 1;
    result.maxSpeed *= s.maxSpeed ?? 1;
    result.range *= s.range ?? 1;
    result.density *= s.density ?? 1;
    result.spray *= s.spray ?? 1;
    result.resist *= s.resist ?? 1;
  }
  return result;
}

export const gunPresets: Record<string, Partial<GunStats>> = {
  basic:    { reload: 1, recoil: 1, shudder: 1, size: 1, health: 1, damage: 1, pen: 1, speed: 1, maxSpeed: 1, range: 1, density: 1, spray: 1, resist: 1 },
  minigun:  { reload: 0.5, recoil: 0.5, shudder: 2, damage: 0.5, health: 0.5, pen: 0.6, speed: 1.5, spray: 3, resist: 1.1 },
  sniper:   { reload: 2.5, shudder: 0.2, damage: 1.2, health: 1.5, pen: 1.5, speed: 2, range: 1.5, spray: 0.1, resist: 1.15 },
  pounder:  { reload: 1.8, recoil: 1.5, shudder: 0.5, size: 1.5, health: 1.5, damage: 2, pen: 1.1, speed: 0.7, range: 0.9, resist: 1.15 },
  destroyer:{ reload: 3, recoil: 3, shudder: 0.1, size: 2, health: 3, damage: 3, pen: 1.5, speed: 0.5, maxSpeed: 0.5, range: 0.8, resist: 3 },
  drone:    { reload: 2, size: 0.8, health: 1.5, damage: 1.2, pen: 0.8, speed: 2, maxSpeed: 0.5, range: 0.8, density: 3 },
  trap:     { reload: 1.5, recoil: 0.5, shudder: 0.2, size: 0.8, health: 2, damage: 0.5, pen: 1, speed: 0.5, maxSpeed: 0.3, range: 0.5, density: 2.5, resist: 3 },
  swarm:    { reload: 0.3, size: 0.5, health: 0.5, damage: 0.3, pen: 0.3, speed: 3, maxSpeed: 1, range: 0.3 },
  thruster: { reload: 0.5, recoil: 4, shudder: 0.2, size: 0.5, health: 0.1, damage: 0.1, pen: 0.1, speed: 2, range: 0.1, spray: 0.5, resist: 0.7 },
  aura:     { reload: 0.001, recoil: 0.001, shudder: 0.001, size: 6, speed: 0.001, maxSpeed: 0.001, spray: 0.001 },
  satellite:{ size: 0.8, reload: 3, damage: 1.875 },
  sunchip:  { reload: 5, size: 0.6, health: 0.8, damage: 0.4, pen: 0.3, speed: 0.5, range: 0.4, density: 2 },
  lowPower: { damage: 0.5, health: 0.5, pen: 0.5 },
  power:    { damage: 1.5, health: 1.5, pen: 1.5 },
  twin:     { reload: 0.5, recoil: 0.5, damage: 0.75, health: 0.75 },
  flankGuard:{ reload: 1.2, recoil: 1, shudder: 1, size: 0.8, damage: 0.7, health: 0.7, speed: 0.9 },
  overseer: { reload: 1.5, size: 1.2, health: 1.2, damage: 0.8, speed: 0.8, maxSpeed: 0.8, range: 1.2 },
};

export type BehaviorType =
  | 'followMouse'
  | 'autoTargetEnemy'
  | 'hangNearOwner'
  | 'hangNearOwnerV2'
  | 'returnToOwner'
  | 'goToTarget'
  | 'swarmAI'
  | 'patrolCircle'
  | 'fleeWhenDamaged'
  | 'alwaysFire'
  | 'spinContinuous'
  | 'minionControl'
  | 'canRepel'
  | 'onlyAcceptInArc'
  | 'targetSelf'
  | 'snake'
  | 'disableOnOverride'
  | 'scaleWithMaster'
  | 'stackGuns'
  | 'mapAltToFire'
  | 'accelerate'
  | 'motionGlide'
  | 'motionMotor'
  | 'motionChase'
  | 'motionSwarm'
  | 'motionGrow'
  | 'motionWithMaster'
  | 'waitToCycle'
  | 'startsLoaded'
  | 'destroyOldest'
  | 'independentProjectile'
  | 'invisible'
  | 'alwaysInvisible'
  | 'reverseSpinOnAlt';
export type MotionType =
  | 'glide'
  | 'motor'
  | 'chase'
  | 'swarm'
  | 'grow'
  | 'withMaster'
  | 'minion';

export type FacingType =
  | 'toTarget'
  | 'smoothToTarget'
  | 'smoothWithMotion'
  | 'turnWithSpeed'
  | 'spin'
  | 'locksFacing'
  | 'primaryTurret'
  | 'faceTarget'
  | 'smoothFaceTarget'
  | 'faceMotion';
export type HitsOwnType = 'none' | 'push' | 'drone' | 'hardWithBuffer' | 'assembler';

export type StatCalculatorType = 'bullet' | 'drone' | 'trap' | 'swarm' | 'thruster' | 'necro' | 'sustained' | 'sustainedLowspeed' | 'fixedReload';

export type StatNamesType = 'generic' | 'drone' | 'swarm' | 'trap' | 'necro' | 'mixed' | 'smasher';

export interface ProjectileTypeConfig {
  visual: ProjectileVisual;
  shape: number;
  size: number;
  touchScale?: number;
  useMuzzleSize: boolean;
  color: string;
  colorMap?: number;
  useTankColor: boolean;

  maxAlive: number;
  lifetime: number;
  dieAtRange: boolean;
  motionType: MotionType;
  facingType: FacingType;

  growRate: number;
  subTurrets: SubTurretConfig[];
  persistsAfterDeath: boolean;

  customProjectileDesignName?: string;
  customProjectileDesign?: CustomProjectileDesign | null;
  trapDepth: number;
  trapCurved: boolean;
  friction: number;
  hitsOwnType: HitsOwnType;
  rangeDamage?: boolean;
  buffVsFood?: boolean;
  density: number;
  bounciness: number;
  bouncy: boolean;
  statCalculatorType: StatCalculatorType;

  topSpeedRatio?: number;
  spinSpeed?: number;

  bodySpeed?: number;

  motorDampLn?: number;

  necroInfect?: boolean;

  tankAsProjectile?: string;
  tankAsProjectileCycle?: string[];
  cycleProjectilesEnabled?: boolean;
  tankAsProjectileUseAI?: boolean;
  tankAsProjectileXpToOwner?: boolean;
}

export interface SubTurretConfig {
  angle: number;
  length: number;
  width: number;
  xOffset: number;
  yOffset: number;
  bps: number;
  speed: number;
  damage: number;
  penetration: number;
  lifetime: number;
  knockback: number;
  isThrust: boolean;
  autoFire: boolean;
  childVisual: ProjectileVisual;
  childShape: number;
  childBehaviors: BehaviorType[];
  persistsAfterDeath: boolean;
  shootOnDeath: boolean;
  autoSubTurrets?: any[];
}

export interface BehaviorConfig {
  type: BehaviorType;
  enabled: boolean;
  acceptsFromTop: boolean;
  responseLag: number;
  predictionStrength: number;
  targetRange: number;
  orbitRadius: number;
  spinSpeed: number;
  targetPriority: 'nearest' | 'lowestHealth' | 'highestThreat';

  snakeSwing?: number;
  snakeRate?: number;
  snakeDelay?: number;
  snakeInvert: boolean;
  snakeOnAlt?: boolean;

  accelRate: number;
  accelTopSpeed: number;
  friction: number;
  frictionSet?: boolean;
  chaseAccel?: number;
  minionAccel?: number;
  swarmSteer?: number;
  growRate: number;
  invisFadeInRate: number;
  invisFadeOutRate: number;
}

export type VisualLayerType = 'circle' | 'barrel' | 'polygon';

export interface TurretVisualLayer {
  type: VisualLayerType;
  size: number;
  width: number;
  aspect?: number;
  xOffset: number;
  yOffset: number;
  color: string;
  strokeColor: string;
  customStroke: boolean;
  rotation: 'independent' | 'withTank' | 'fixed';
  sides: number;
  layer: number;
  shootAnim: number;
  angle?: number;
}

export const DEFAULT_PROJECTILE_TYPE: ProjectileTypeConfig = {
  visual: 'bullet',
  shape: 0,
  size: 1.0,
  useMuzzleSize: true,
  color: 'inherit',
  useTankColor: true,
  maxAlive: 0,
  lifetime: 0,
  dieAtRange: false,
  motionType: 'glide',
  facingType: 'toTarget',
  growRate: 1,
  subTurrets: [],
  persistsAfterDeath: false,
  trapDepth: 0,
  trapCurved: false,
  friction: 0,
  hitsOwnType: 'none' as HitsOwnType,
  density: 1,
  bounciness: 0.9,
  bouncy: true,
  customProjectileDesignName: undefined,
  customProjectileDesign: null,
  statCalculatorType: 'bullet' as StatCalculatorType,
  tankAsProjectile: undefined,
  tankAsProjectileCycle: undefined,
  cycleProjectilesEnabled: false,
};

export const DEFAULT_SUB_TURRET: SubTurretConfig = {
  angle: 180,
  length: 15,
  width: 10,
  xOffset: 0,
  yOffset: 0,
  bps: 3,
  speed: 5,
  damage: 2,
  penetration: 1,
  lifetime: 0.5,
  knockback: 10,
  isThrust: true,
  autoFire: true,
  childVisual: 'bullet',
  childShape: 0,
  childBehaviors: [],
  persistsAfterDeath: true,
  shootOnDeath: false,
};

export function convertSubTurretToTurret(st: SubTurretConfig): Turret {
  return {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    length: st.length,
    width: st.width,
    aspect: 1,
    xOffset: st.xOffset / 10,
    yOffset: st.yOffset / 10,
    bps: st.bps,
    speed: st.speed,
    delay: 0,
    knockback: st.knockback,
    spread: 0,
    shudder: 0.1,
    bulletDamage: st.damage,
    bulletHealthBase: st.damage,
    bulletPenetration: st.penetration,
    bulletLifetime: st.lifetime,
    angle: st.angle * Math.PI / 180,
    animProgress: 0,
    turretType: 'regular',
    alwaysAbove: false,
    independent: false,
    fov: 360,
    fovSize: 10,
    autoTargetPriority: 'nearest',
    maxTurnSpeed: 4.5,
    autoFireDelay: 0,
    manualControl: false,
    autoCircleSize: 25,
    autoCircleBaseSides: 0,
    autoCircleColorMatch: false,
    autoCircleHidden: false,
    autoCircleFixed: false,
    autoCircleSpin: false,
    autoCircleSpinMode: 'fixed' as 'fixed' | 'withBody',
    autoCircleSpinSpeed: 50,
    autoCircleSpinDirection: 1 as 1 | -1,
    autoCircleHealer: false,
    autoTurretLength: 10,
    autoTurretWidth: 25,
    projectileType: {
      ...DEFAULT_PROJECTILE_TYPE,
      visual: st.childVisual,
      shape: st.childShape,
      persistsAfterDeath: st.persistsAfterDeath,
    },
    projectileBehaviors: st.childBehaviors.map(bt => ({
      ...DEFAULT_BEHAVIOR_CONFIG,
      type: bt,
      enabled: true,
    })),
    visualLayers: [],
    aboveTankBody: false,
    renderLayer: 0,
    autoFire: st.autoFire,
    autoCurrentAngle: 0,
    autoTargetId: null,
    autoShapeLockId: null,
    recoilPosition: 0,
    recoilVelocity: 0,
    physRecoilPos: 0,
    physRecoilVel: 0,
    physRecoilDirX: 0,
    physRecoilDirY: 0,
    autoSubTurrets: [],
    primarySubTurretId: null,
    alwaysShoot: false,
    wifiRange: false,
    wifiRangeValue: 50,
    altFire: false,
    syncsSkills: false,
    necro: false,
    healer: false,
    gunStatScale: 1.0,
  };
}

export const DEFAULT_BEHAVIOR_CONFIG: BehaviorConfig = {
  type: 'followMouse',
  enabled: false,
  acceptsFromTop: true,
  responseLag: 0.1,
  predictionStrength: 50,
  targetRange: 0,
  orbitRadius: 100,
  spinSpeed: 3,
  targetPriority: 'nearest',
  snakeInvert: false,
  accelRate: 1,
  accelTopSpeed: 15,
  friction: 0,
  growRate: 1,
  invisFadeInRate: 0.04,
  invisFadeOutRate: 0.015,
};

export interface ExplodeRing {
  count: number;
  startDeg: number;
  arcDeg: number;
  fragment: Turret;
}
export interface ExplodeConfig {
  enabled: boolean;
  anyDeath: boolean;
  rings: ExplodeRing[];
}

export interface Turret {
  id: string;
  length: number;
  width: number;
  aspect: number;
  xOffset: number;
  yOffset: number;
  bps: number;
  speed: number;
  delay: number;
  knockback: number;
  spread: number;
  shudder: number;
  bulletDamage: number;
  bulletHealthBase: number;
  bulletPenetration: number;
  bulletLifetime: number;
  fightResist?: number;
  shootResist?: number;
  launchReversed?: boolean;
  shootDensity?: number;
  angle: number;
  animProgress: number;
  nextShotTime?: number;
  _wtcHeldAt?: number;
  _wtcLookAt?: number;
  recoilPosition: number;
  recoilVelocity: number;
  physRecoilPos: number;
  physRecoilVel: number;
  physRecoilDirX: number;
  physRecoilDirY: number;
  physRecoilShot?: number;
  physRecoilRing?: number[];
  physRecoilRingOn?: boolean;

  turretType: TurretType;
  alwaysAbove: boolean;
  alwaysShoot: boolean;
  independent: boolean;
  fov: number;
  fovSize: number;
  autoTargetPriority: 'nearest' | 'lowestHealth' | 'highestThreat';
  maxTurnSpeed: number;
  autoFireDelay: number;
  manualControl: boolean;
  fireWithTank?: boolean;
  pushOnly?: boolean;
  autoCircleSize: number;
  autoCircleBaseSides: number;
  autoCircleBaseDepth?: number;
  autoCircleColorMatch: boolean;
  autoCircleHidden: boolean;
  autoCircleFixed: boolean;
  autoCircleSpin: boolean;
  autoCircleSpinMode: 'fixed' | 'withBody';
  autoCircleSpinSpeed: number;
  autoCircleSpinDirection: 1 | -1;
  autoCircleHealer: boolean;
  aura?: boolean;
  auraType?: 'damage' | 'heal';
  auraSize?: number;
  auraStrength?: number;
  auraOpacity?: number;
  look?: PlacedLook;
  aboveBase?: boolean;
  turnsLate?: boolean;
  autoTurretLength: number;
  autoTurretWidth: number;
  projectileType: ProjectileTypeConfig;

  projectileBehaviors: BehaviorConfig[];

  explode?: ExplodeConfig;

  visualLayers: TurretVisualLayer[];

  color?: string;
  colorMap?: number;
  colorFree?: string;

  aboveTankBody: boolean;

  renderLayer: number;

  autoFire: boolean;

  autoCurrentAngle: number;
  _autoProjRef?: Bullet | null;
  _autoProjId?: number;
  _autoProjNextScan?: number;
  autoTargetId: string | null;
  autoShapeLockId: string | null;
  _healContId?: string;
  _lastAutoRestAngle?: number;
  _lateBase?: number;
  _lateTurn?: number;
  _lateAt?: number;

  autoSubTurrets: Turret[];
  primarySubTurretId?: string | null;
  wifiRange: boolean;
  wifiRangeValue: number;
  comboFaceAngle?: number;

  altFire: boolean;
  syncsSkills: boolean;
  necro: boolean;
  healer: boolean;
  gunStatScale: number;
  _wifiKey?: string;
  _fovKey?: string;
  _trKey?: string;

  _cycleIndex?: number;
  _exitHoldTime?: number;
  _bhHoldTime?: number;

  _origLength?: number;
  _origWidth?: number;
  _origXOffset?: number;
  _origYOffset?: number;
  _bakeScale?: number;
  _bakeSnap?: boolean;
  _bakeShiftX?: number;
  _bakeShiftY?: number;
  name?: string;
  tag?: string;
  groupId?: string;
}

export const TURRET_NAME_MAX = 32;
export const TURRET_TAG_MAX = 8;

export interface TurretGroup {
  id: string;
  name: string;
  scope: string;
}

export type TeamId = 'player' | 'enemy' | 'sentry' | 'team1' | 'team2' | 'team3' | 'team4' | 'team5';

export type AIState = 'idle' | 'roaming' | 'targeting_shapes' | 'attacking' | 'following' | 'fleeing' | 'protecting_base';

export type AIBehavior = 'Friendly' | 'Enemy' | 'Neutral' | 'FFA' | 'Team1' | 'Team2' | 'Team3' | 'Team4' | 'Team5';

export type UpgradeLogic = 'OffensiveWeighted' | 'ByOrder' | 'Random';

export type GameModeType = 'sandbox' | 'ffa' | 'rock-ffa' | 'tdm' | 'open-tdm' | 'maze' | 'old-dreadnoughts'
  | 'duos' | 'maze-duos' | 'squads' | 'maze-squads'
  | 'manhunt' | 'manhunt-maze' | 'manhunt-rock'
  | 'portal-2tdm' | 'portal-4tdm' | 'portal-maze-4tdm'
  | 'scripted';

export const PORTAL_MODES: readonly GameModeType[] = ['portal-2tdm', 'portal-4tdm', 'portal-maze-4tdm'];
export function isPortalMode(mode: GameModeType): boolean {
  return PORTAL_MODES.indexOf(mode) !== -1;
}

export function isScriptedMode(mode: GameModeType): boolean { return mode === 'scripted'; }
export function teamColourMode(mode: GameModeType): boolean {
  return mode === 'tdm' || mode === 'open-tdm' || mode === 'old-dreadnoughts' || isPortalMode(mode) || isScriptedMode(mode);
}

export function isFfaStyleMode(mode: GameModeType): boolean {
  return mode === 'ffa' || mode === 'rock-ffa' || mode === 'maze'
    || mode === 'duos' || mode === 'maze-duos' || mode === 'squads' || mode === 'maze-squads'
    || mode === 'manhunt' || mode === 'manhunt-maze' || mode === 'manhunt-rock';
}

export function isManhuntMode(mode: GameModeType): boolean {
  return mode === 'manhunt' || mode === 'manhunt-maze' || mode === 'manhunt-rock';
}

export function isGroupsMode(mode: GameModeType): boolean {
  return mode === 'duos' || mode === 'maze-duos' || mode === 'squads' || mode === 'maze-squads';
}

export const TEAM_MODES: readonly GameModeType[] = ['tdm', 'open-tdm', 'old-dreadnoughts', 'portal-2tdm', 'portal-4tdm', 'portal-maze-4tdm', 'scripted'];

export function isTeamMode(mode: GameModeType): boolean {
  return TEAM_MODES.indexOf(mode) !== -1;
}

const TEAM_BEHAVIORS: readonly AIBehavior[] = ['Team1', 'Team2', 'Team3', 'Team4'];

function teamNumberOf(b: AIBehavior): number {
  return b.startsWith('Team') ? parseInt(b.charAt(4)) : NaN;
}

export function dreadTeamId(): TeamId { return ALL_MODES.ON !== 0 ? 'team5' : 'team3'; }
export function dreadBehavior(): AIBehavior { return ALL_MODES.ON !== 0 ? 'Team5' : 'Team3'; }

const _sbG = globalThis as { __ISTRONG_OLD_SANDBOX?: unknown; process?: { env?: Record<string, string | undefined> } };
export const SANDBOX_TEAMS = { ON: _sbG.__ISTRONG_OLD_SANDBOX === 1 || _sbG.process?.env?.ISTRONG_OLD_SANDBOX === '1' ? 0 : 1 };
const _odG = globalThis as { __ISTRONG_OLD_DREAD_COLOR?: unknown; process?: { env?: Record<string, string | undefined> } };
export const OD_DREAD_COLOR = { ON: _odG.__ISTRONG_OLD_DREAD_COLOR === 1 || _odG.process?.env?.ISTRONG_OLD_DREAD_COLOR === '1' ? 0 : 1 };
export function sandboxTeamsOn(gm: { mode: GameModeType; sandboxFfa?: boolean }): boolean {
  return SANDBOX_TEAMS.ON !== 0 && gm.mode === 'sandbox' && gm.sandboxFfa !== true;
}
export function sandboxFfaOn(gm: { mode: GameModeType; sandboxFfa?: boolean }): boolean {
  return SANDBOX_TEAMS.ON !== 0 && gm.mode === 'sandbox' && gm.sandboxFfa === true;
}

export function allowedBehaviorsForMode(mode: GameModeType, teams: number, sandboxFfa: boolean = false): readonly AIBehavior[] {
  if (isFfaStyleMode(mode)) return ['FFA'];
  if (mode === 'sandbox' && SANDBOX_TEAMS.ON !== 0) return sandboxFfa ? ['FFA'] : ['Team1', 'Team2', 'Team3', 'Team4', 'Neutral'];
  if (mode === 'old-dreadnoughts') return ALL_MODES.ON !== 0 ? [...TEAM_BEHAVIORS.filter(b => !(teamNumberOf(b) > teams)), 'Team5'] : ['Team1', 'Team2', 'Team3'];
  if (mode === 'tdm' || mode === 'open-tdm' || isPortalMode(mode) || isScriptedMode(mode)) {
    return TEAM_BEHAVIORS.filter(b => !(teamNumberOf(b) > teams));
  }
  return ['Enemy', 'Friendly', 'Neutral'];
}

export function defaultBehaviorForMode(mode: GameModeType, sandboxFfa: boolean = false): AIBehavior {
  if (isFfaStyleMode(mode)) return 'FFA';
  if (mode === 'sandbox') return SANDBOX_TEAMS.ON === 0 ? 'Enemy' : sandboxFfa ? 'FFA' : 'Team2';
  return 'Team2';
}

export function clampBehaviorToMode(mode: GameModeType, teams: number, b: AIBehavior, sandboxFfa: boolean = false): AIBehavior {
  if (ALL_MODES.ON !== 0 && mode === 'old-dreadnoughts' && b === 'Team3' && teams < 3) return 'Team5';
  return allowedBehaviorsForMode(mode, teams, sandboxFfa).indexOf(b) !== -1 ? b : defaultBehaviorForMode(mode, sandboxFfa);
}

export function offeredBehaviorsForMode(mode: GameModeType, teams: number, sandboxFfa: boolean = false): readonly AIBehavior[] {
  const allowed = allowedBehaviorsForMode(mode, teams, sandboxFfa);
  if (mode !== 'old-dreadnoughts') return allowed;
  return allowed.filter(b => !(teamNumberOf(b) > teams));
}

export interface ModeMapDefaults {
  mapScale: number;
  gridCells: number;
}

export function modeMapDefaults(mode: GameModeType, growth: boolean, world?: string, teams?: number): ModeMapDefaults | null {
  const _worldId = worldIdOf(mode, teams, world);
  if (_worldId !== null && worldWritesMap(_worldId)) return { mapScale: MODE_WORLDS[_worldId].mapScale, gridCells: MODE_WORLDS[_worldId].gridCells };
  if (_worldId === 'manhunt-rock' && SMALL_FIX.R855M !== 0) return { mapScale: MODE_WORLDS[_worldId].mapScale, gridCells: MODE_WORLDS[_worldId].gridCells };
  if (mode === 'sandbox' || mode === 'old-dreadnoughts' || isPortalMode(mode) || isScriptedMode(mode)) return null;
  const gridCells = 32;
  if (growth) {
    if (isManhuntMode(mode)) return { mapScale: 15, gridCells };
    return { mapScale: 11, gridCells };
  }
  return { mapScale: 7, gridCells };
}

export function groupSizeForMode(mode: GameModeType): number {
  if (mode === 'duos' || mode === 'maze-duos') return 2;
  if (mode === 'squads' || mode === 'maze-squads') return 4;
  return 0;
}

export const PLAYER_GROUP_ID = 1;

export interface TeamEnemyConfig {
  team1: number;
  team2: number;
  team3: number;
  team4: number;
  ffa: number;
}

export type TeamBotKey = 'ffa' | 'team1' | 'team2' | 'team3' | 'team4';

export interface TeamBotSettings {
  overridden: boolean;
  baseLevel: number;
  upgradeLogic: UpgradeLogic;
  forceAutospin: boolean;
  forceAutoshoot: boolean;
  useHardcodedColor: boolean;
  aimbotStrength: number;
  turnSpeed: number;
}

export type TeamBotSettingsMap = Record<TeamBotKey, TeamBotSettings>;

export function createDefaultTeamBotSettings(): TeamBotSettings {
  return {
    overridden: false,
    baseLevel: 0,
    upgradeLogic: 'OffensiveWeighted',
    forceAutospin: false,
    forceAutoshoot: false,
    useHardcodedColor: false,
    aimbotStrength: 50,
    turnSpeed: 50,
  };
}

export function createDefaultTeamBotSettingsMap(): TeamBotSettingsMap {
  return {
    ffa: createDefaultTeamBotSettings(),
    team1: createDefaultTeamBotSettings(),
    team2: createDefaultTeamBotSettings(),
    team3: createDefaultTeamBotSettings(),
    team4: createDefaultTeamBotSettings(),
  };
}

export interface HalloweenLookConfig { eyes: boolean; pumpkins: boolean; }

export interface GameModeConfig {
  mode: GameModeType;
  teams: number;
  enableSpawnZones: boolean;
  growth: boolean;
  playerTeam: number;
  levelCap: number;
  preset?: string;
  overlay?: string;
  halloween?: HalloweenLookConfig;
  vampirism?: boolean;
  startingScore?: number;
  armsRace?: boolean;
  maxTanksAlive?: number;
  world?: string;
  mapPool?: MapPool;
  stopChances?: number[];
  tankDebuffs?: TankDebuffs;
  teamEnemyConfig: TeamEnemyConfig;
  growthMaxMultiplier?: number;
  growthPerLevel?: number;
  growthStartLevel?: number;
  growthFixedSpRate?: boolean;
  growthLevelsPerSp?: number;
  growthModel?: 'simple' | 'rules';
  growthRules?: GrowthRules;
  smartGrowthCap?: boolean;
  botPortalRethinkS?: number;
  botPortalRest?: boolean;
  botPortalRestMin?: number;
  sandboxFfa?: boolean;
}

export const BOT_PORTAL_DEFAULTS = { rethinkS: 30, rest: true, restMin: 3 } as const;

export const DEFAULT_GAME_MODE_CONFIG: GameModeConfig = {
  mode: 'sandbox',
  teams: 2,
  enableSpawnZones: false,
  growth: false,
  playerTeam: 1,
  levelCap: 45,
  teamEnemyConfig: { team1: 12, team2: 12, team3: 12, team4: 12, ffa: 24 },
  growthMaxMultiplier: 5,
  growthPerLevel: 0.05,
  growthStartLevel: 1,
  smartGrowthCap: false,
};

const _TEAM_SLOTS: readonly number[] = [CM.BLUE, CM.RED, CM.GREEN, CM.PURPLE, CM.NEUTRAL, CM.ROGUES, CM.HEXAGONS];
export const TEAM_IDX_NEUTRAL = 4, TEAM_IDX_ROGUES = 5, TEAM_IDX_DREAD = 6;
export const TEAM_COLORS_DARK: readonly string[] = _TEAM_SLOTS.map(s => cmHex(s, true, CM_USE.TANK));
export const TEAM_COLORS_LIGHT: readonly string[] = _TEAM_SLOTS.map(s => cmHex(s, false, CM_USE.TANK));
export const TEAM_COLORS: readonly string[] = TEAM_COLORS_LIGHT;
export function teamOverrideColor(idx: number, dark: boolean): string | undefined {
  if (!(idx >= 0)) return undefined;
  return (dark ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT)[idx];
}
export function keepsOwnColor(tankFlag: boolean | undefined, botSwitch?: boolean): boolean {
  return tankFlag === true || botSwitch === true;
}
export const TEAM_NAMES: readonly string[] = ['Blue', 'Red', 'Green', 'Purple'];

let _teamTwoGreen = false;
export function setTeamTwoGreen(on: boolean): void {
  if (on === _teamTwoGreen) return;
  _teamTwoGreen = on;
  for (const t of [TEAM_COLORS_DARK, TEAM_COLORS_LIGHT, TEAM_NAMES] as string[][]) { const a = t[1]; t[1] = t[2]; t[2] = a; }
  swapSideNamesTwoThree();
}
export function teamIdxSlot(idx: number): number {
  if (!(idx >= 0) || idx >= _TEAM_SLOTS.length) return -1;
  if (_teamTwoGreen && (idx === 1 || idx === 2)) return _TEAM_SLOTS[3 - idx];
  return _TEAM_SLOTS[idx];
}
export function modeWearsTeamTwoGreen(cfg: { mode: GameModeType; teams: number }): boolean {
  return ALL_MODES.ON !== 0 && cfg.teams === 2 && (cfg.mode === 'tdm' || cfg.mode === 'open-tdm' || cfg.mode === 'portal-2tdm' || cfg.mode === 'old-dreadnoughts');
}
export function teamTwoGreenNow(): boolean { return _teamTwoGreen; }
export function teamTableIdxFor(idx: number, green: boolean): number {
  return green !== _teamTwoGreen && (idx === 1 || idx === 2) ? 3 - idx : idx;
}


export interface GameMessage {
  id: number;
  text: string;
  createdAt: number;
  duration: number;
}

export const CAMP_NONE = 0;
export const CAMP_BOSS = 1;
export const CAMP_SHAPE = 2;
export function campsClash(a: number, b: number): boolean {
  return (a | b) === 3;
}

export interface Bullet {
  active: boolean;
  bulletId: number;
  _fsLag?: number;
  _fsDisp?: number;
  _fsDispX?: number;
  _fsDispY?: number;
  _ipStep?: number;
  _ipLife?: number;
  _ipOff?: number;
  _ipSub?: unknown;
  _ipLay?: unknown;
  _ipEnd?: number;
  _ipJump?: number;
  _ipWarp?: number;
  _ipWX?: number;
  _ipWY?: number;
  position: Vector;
  velocity: Vector;
  size: number;
  color: string;
  colorMap: number | undefined;
  spread: number;
  shudder: number;
  currentAngle: number;
  hasSpread: boolean;
  distanceTraveled: number;
  lifespanDistance: number;
  currentAge: number;
  maxAge: number;
  opacity: number;
  growth: number;
  isFading: boolean;
  damage: number;
  health: number;
  maxHealth: number;
  penetration: number;
  knockback: number;
  hitIds: Set<string>;
  initialSpeed: number;
  resist: number;
  frameProcessed: number;
  team: TeamId;
  ownerId: string;
  sourceTurretId: string;
  ownerBehavior: AIBehavior | null;
  groupId: number;
  ownerIsSentry: boolean;
  ownerIsBaseProtector: boolean;
  ownerIsBoss: boolean;
  ownerCamp: number;
  ownerAimbot: number;
  ownerIsSpawned: boolean;
  _tapRootId: string;
  ignoresWalls: boolean;
  _ownerGhost: boolean;
  _ghostCounted: boolean;
  permanent: boolean;
  projectileVisual: ProjectileVisual;
  shapeSides: number;
  trapDepth: number;
  trapCurved: boolean;
  labyLevel: number;
  necroLabyMult: number;
  motionType: MotionType;
  facingType: FacingType;
  hasControllers: boolean;
  controllerData: BulletControllerData | null;
  controllerFire: boolean;
  controllerTargetX: number;
  controllerTargetY: number;
  controllerHasTarget: boolean;
  visualAimAngle: number;
  _invisEnabled: boolean;
  _invisFadeInRate: number;
  _invisFadeOutRate: number;
  _invisAlways: boolean;
  _hideRule: number;

  _spinSign: number;
  _spinRad: number;

  maxRange: number;
  range: number;
  independentAim: boolean;
  facingAngle: number;
  ownerX: number;
  ownerY: number;

  wifiRangeSq: number;

  subTurrets: BulletSubTurret[] | null;
  persistsAfterDeath: boolean;
  parentBulletId: number;
  _kidsMade: boolean;
  _maker: Bullet | null;
  mountedTurretId: string;
  generation: number;
  shootOnDeath: boolean;
  _explode: ExplodeConfig | null;
  _explodeHandled: boolean;
  _explodeGen: number;
  _explodeBudget: number;
  _shareOf: unknown;
  _shareK: number;
  _explodeFromBarrel: boolean;
  _skDam: number;
  _skPen: number;
  _skStr: number;
  _skSpd: number;
  _skCap: number;
  _skRldMult: number;
  _grDam: number;
  _grStr: number;
  _grPen: number;
  _grSpd: number;
  _arrasHetero: number;
  _arrasDensity: number;
  _minionClass: boolean;
  _rangeDamage: boolean;
  _buffVsFood: boolean;
  _offTank: number;
  _offKnock: number;
  _offBounce: number;
  _offKindId: number;
  _rvrResist: number;
  _mbBite: number;
  _mbTake: number;
  _offSzR: number;
  _holdKey: number | string;
  _holdSeen: number;
  _holdClose: number;
  _holdSpeed: number;
  _holdKs: (number | string)[];
  _holdSs: Float64Array;
  _holdCs: Float64Array;
  _holdVs: Float64Array;
  _mbhKey: number | string;
  _mbhSeen: number;
  _mbhNext: number;
  _rkKey: number | string;
  _rkSeen: number;
  _rkNext: number;
  _mbhKs: (number | string)[];
  _mbhSs: Float64Array;
  _mbhNs: Float64Array;
  _rkKs: (number | string)[];
  _rkSs: Float64Array;
  _rkNs: Float64Array;
  _pkKey: number | string;
  _pkFrame: number;
  _carryDx: number;
  _carryDy: number;
  _carryFrame: number;
  _bornIn: number;
  _roundArea: number;
  _pushOwed: number;
  _arrasPushability: number;
  _bncKey: string | number;
  _bncFrame: number;
  _bncAge: number;
  _bncOwed: number;
  _bncOver: number;
  _bncTicks: number;
  _bncFound: number;
  _bulletBodyLayers: BodyLayer[] | null;
  _bulletBodyColor: string;
  _bulletBodyColorMap: number | undefined;
  _useTankBodyAngle: boolean;
  _tankRecoilSize: number;
  _pushability: number;
  muzzleExitTime: number;
  hasExitedMuzzle: boolean;
  ownerBodyAngleAtSpawn: number;
  spawnTime: number;
  growRate: number;
  initialSize: number;
  assemblerLevel: number;
  inExitPhase: boolean;
  exitProgress: number;
  exitBarrelLen: number;
  exitBarrelAngle: number;
  exitBaseX: number;
  exitBaseY: number;
  exitStoredSpeed: number;
  exitGunSpeed: number;
  launchBoost: number;
  exitOwnerType: number;
  exitTurretIdx: number;
  exitSubTurretIdx: number;
  exitRecoilStrength: number;
  exitLayerOffX: number;
  exitLayerOffY: number;
  exitStartProgress: number;
  friction: number;
  hitsOwnType: HitsOwnType;
  density: number;
  bounciness: number;
  bouncy: boolean;
  softCollisionTrap: boolean;
  fromSpawner: boolean;
  aboveBody: boolean;
  sourceLayerId: string;
  sourceLayerOrder: number;
  healer: boolean;
  necroInfect: boolean;
  _lnFrictionDamp: number;
  _frictionAuthored: boolean;

  _renderKey: string;
  _renderDirty: boolean;
  _keepOwn: boolean;
  _liveCol: boolean;
  _lastSzBkt: number;
  _isSettled: boolean;

  _borderTouched: boolean;

  bornOutsideMap: boolean;
  bornOutsideStartTime: number;
  topSpeedRatio: number;

  _motorDampLn: number;
  _spinPush: number;
  _thrustX: number;
  _thrustY: number;
  _bornFree: number;

  _chaseMaxSpeed: number;

  _swarmTurning: number;

  _swarmRemainingRange: number;

  knockbackVelX: number;
  knockbackVelY: number;

  damageOverlay: number;
  _fadeT: number;
  _fadeO0: number;
  _fadeG0: number;
  _ruleOpacity: number;
  _ruleGrowth: number;
  _flyAge: number;
  _joinLife: number;
  _joinSize: number;
  _touchK: number;
  _portalUntil: number;

  _snapHealth: number;
  _snapMaxHealth: number;
  _snapDamage: number;
  _snapPenetration: number;
  _nanFrames: number;

  _shotTag: number;
  _shotAimDist: number;
}

export interface BulletSubTurret {
  config: SubTurretConfig;
  turretData: Turret | null;
  nextFireTime: number;
  animProgress: number;
  kick: number;
  autoFireEnabled: boolean;
  _thClock?: boolean;
  sourceLayerId?: string;
  physRecoilPos: number;
  physRecoilVel: number;
  physRecoilDirX: number;
  physRecoilDirY: number;
  physRecoilShot?: number;
  physRecoilRing?: number[];
  physRecoilRingOn?: boolean;
}

export interface ControlIO {
  targetX: number;
  targetY: number;
  goalX: number;
  goalY: number;
  fire: boolean;
  alt: boolean;
  power: number;
  hasTarget: boolean;
  hasGoal: boolean;
}

export interface BulletControllerData {
  behaviors: BehaviorType[];
  settings: BehaviorConfig[];
  minionAccel: number;
  swarmSteer: number;

  lastMouseX: number;
  lastMouseY: number;
  lagX: number;
  lagY: number;

  targetEntityId: string | null;
  targetLockTick: number;
  leadTime: number;
  lastTargetX: number;
  lastTargetY: number;
  lastTargetVX: number;
  lastTargetVY: number;
  lastTargetIsShape: boolean;

  currentGoalX: number;
  currentGoalY: number;
  orbitTimer: number;
  initialGoalDist: number;
  goalCountdown: number;
  cruiseSpeed: number;
  blockLetGo: number;
  blockTouch: number;

  isReturning: boolean;
  throwGoalX: number;
  throwGoalY: number;

  swarmAngle: number;

  spinAngle: number;

  turnwise: number;
  pathAngle: number;
  pathTimer: number;

  configuredBulletSpeed: number;

  pauseTimer: number;
  isPaused: boolean;

  firingArc: number;
  ownerSize: number;


  snakeTurn: number;
  disabledByOverride: boolean;
  savedDamage: number;
  masterSizeRatio: number;
  accelTopSpeedWorld: number;
}

function ownSetting(settings: BehaviorConfig[], type: BehaviorType, key: 'minionAccel' | 'swarmSteer'): number {
  for (let i = 0; i < settings.length; i++) if (settings[i].type === type) { const v = settings[i][key]; return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0; }
  return 0;
}
export function createDefaultControllerData(behaviors: BehaviorConfig[], configuredBulletSpeed: number = 5, firingArc: number = 0, ownerSize: number = 30): BulletControllerData {
  const enabledTypes: BehaviorType[] = [];
  const enabledSettings: BehaviorConfig[] = [];
  for (let i = 0; i < behaviors.length; i++) {
    if (behaviors[i].enabled) {
      enabledTypes.push(behaviors[i].type);
      enabledSettings.push(behaviors[i]);
    }
  }
  return {
    behaviors: enabledTypes,
    settings: enabledSettings,
    minionAccel: ownSetting(enabledSettings, 'minionControl', 'minionAccel'),
    swarmSteer: ownSetting(enabledSettings, 'motionSwarm', 'swarmSteer'),
    lastMouseX: 0,
    lastMouseY: 0,
    lagX: NaN,
    lagY: NaN,
    targetEntityId: null,
    targetLockTick: 0,
    leadTime: 0,
    lastTargetX: 0,
    lastTargetY: 0,
    lastTargetVX: 0,
    lastTargetVY: 0,
    lastTargetIsShape: false,
    currentGoalX: 0,
    currentGoalY: 0,
    orbitTimer: 0,
    initialGoalDist: 0,
    goalCountdown: 12,
    cruiseSpeed: 0,
    blockLetGo: 0,
    blockTouch: 0,
    isReturning: false,
    throwGoalX: 0,
    throwGoalY: 0,
    swarmAngle: Math.random() * Math.PI * 2,
    spinAngle: 0,
    turnwise: 1,
    pathAngle: Math.random() * Math.PI * 2,
    pathTimer: 0,
    configuredBulletSpeed,
    pauseTimer: 0,
    isPaused: false,
    firingArc,
    ownerSize,
    snakeTurn: 0,
    disabledByOverride: false,
    savedDamage: 0,
    masterSizeRatio: 0,
    accelTopSpeedWorld: 0,
  };
}

export interface DroneTracker {
  droneIds: Set<string>;
  maxDrones: number;
}

export interface DamageContribution {
  ownerId: string;
  totalDamage: number;
  lastDamageTime: number;
}

export type ShapeType = 'circle' | 'triangle' | 'square' | 'pentagon';

export interface ShapeConfig {
  type: ShapeType;
  color: string;
  size: number;
  hp: number;
  mass: number;
  bodyDamage: number;
  pushability: number;
  elasticity: number;
  driftSpeed: number;
  shield: number;
  shieldRegen: number;
  xpValue: number;
  spawnWeight: number;
  centerBias: number;
}

export const SHAPE_ORDER: ShapeType[] = ['circle', 'triangle', 'square', 'pentagon'];

export const DEFAULT_SHAPE_CONFIGS: Record<ShapeType, ShapeConfig> = {
  circle: {
    type: 'circle', color: '#e8ebf7', size: 15, hp: 5,
    mass: 2, bodyDamage: 10, pushability: 1.5, elasticity: 1.5, driftSpeed: 100,
    shield: 1, shieldRegen: 1, xpValue: 1,
    spawnWeight: 40, centerBias: 0,
  },
  triangle: {
    type: 'triangle', color: '#e7896d', size: 30, hp: 25,
    mass: 30, bodyDamage: 10, pushability: 0.8, elasticity: 1.2, driftSpeed: 100,
    shield: 2, shieldRegen: 2, xpValue: 3,
    spawnWeight: 30, centerBias: 40,
  },
  square: {
    type: 'square', color: '#efc74b', size: 50, hp: 45,
    mass: 45, bodyDamage: 10, pushability: 0.6, elasticity: 1.0, driftSpeed: 100,
    shield: 4, shieldRegen: 2, xpValue: 5,
    spawnWeight: 35, centerBias: 15,
  },
  pentagon: {
    type: 'pentagon', color: '#8d6adf', size: 95, hp: 100,
    mass: 250, bodyDamage: 10, pushability: 0.15, elasticity: 1.5, driftSpeed: 100,
    shield: 10, shieldRegen: 4, xpValue: 10,
    spawnWeight: 5, centerBias: 80,
  },
};

export interface BaseShapeConfig {
  enabled: boolean;
  color: string;
  size: number;
  hp: number;
  mass: number;
  bodyDamage: number;
  pushability: number;
  elasticity: number;
  driftSpeed: number;
  shield: number;
  shieldRegen: number;
  xpValue: number;
  spawnWeight: number;
  centerBias: number;
}

export interface ShapeSpawnConfig {
  baseShapes: Record<string, BaseShapeConfig>;

  scaleVariants: Record<string, BaseShapeConfig>;

  rarityEnabled: Record<string, boolean>;

  labyEnabled: Record<number, Record<string, boolean>>;

  specialEnabled: Record<string, boolean>;

  crasherEnabled: boolean;
  crasherCap: number;
  sentryCap: number;
  sentinelCap: number;
  crasherChaseRange: number;
  crasherSpeed: number;

  groupSpawnChance: number;
  groupMaxSize: number;
  scaledVariantCenterZone: number;
  scaledVariantCap: number;
  baseShapeCap: number;
  rarityCap: number;
  labyCap: number;
  specialShapeCap: number;
  foodCap: number;
  shinyChance: number;
  legendaryChance: number;
  shadowChance: number;
  rainbowChance: number;
  transChance: number;
  polyhedraChance: number;

  rarityTestMultiplier: number;

  baseShapeRateLevel: number;
  scaledVariantRateLevel: number;
  rarityRateLevel: number;
  labyRateLevel: number;
  specialShapeRateLevel: number;
  crasherRateLevel: number;
  sentryRateLevel: number;
  sentinelRateLevel: number;

  sizeRandomization?: number;
  shapeBook?: number;
  shapeScores?: number;
  plan?: ShapeSpawnPlan;
}

export interface ShapeSpawnCrowd {
  on: boolean;
  enemyFirst: number;
  enemyNext: number;
  enemyKeep: number;
  teamFirst: number;
  teamKeep: number;
  margin: number;
  kinds: Record<string, number>;
}

export interface ShapeSpawnPlan {
  profile: string;
  noFood: boolean;
  nestSize: number;
  nestShare: number;
  nestCap: number;
  nestWeights: Record<string, number>;
  nestPace?: number;
  crowd?: ShapeSpawnCrowd;
  tierOneIn: number[];
  crasherOneIn: number;
  nestCrasherOneIn: number;
  gemOneIn: number;
  jewelOneIn: number;
  eggToGem: boolean;
  scaledOneIn: number;
  relicOneIn: number;
  relicWeights: Record<string, number>;
}

export interface SpawnStats {
  byRarity: Record<string, number>;
  byBaseShape: Record<string, number>;
  byScaleVariant: Record<string, number>;
  byLabyLevel: Record<number, number>;
  totalSpawned: number;
  totalCrasherSpawned: number;
  totalPolyhedraSpawned: number;
  sessionStartTime: number;
}

export function createEmptySpawnStats(): SpawnStats {
  return {
    byRarity: { normal: 0, shiny: 0, legendary: 0, shadow: 0, rainbow: 0, trans: 0 },
    byBaseShape: { egg: 0, triangle: 0, square: 0, pentagon: 0, hexagon: 0, gem: 0, jewel: 0 },
    byScaleVariant: { normal: 0, beta: 0, alpha: 0 },
    byLabyLevel: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    totalSpawned: 0,
    totalCrasherSpawned: 0,
    totalPolyhedraSpawned: 0,
    sessionStartTime: 0,
  };
}

export function SHAPE_SPAWN_CONFIG_OF_BEFORE(): ShapeSpawnConfig {
  return {
    baseShapes: {
      egg:      { enabled: true,  color: '#e8ebf7', size: 9,    hp: 5,    mass: 2,   bodyDamage: 0,  pushability: 1.5,  elasticity: 1.5, driftSpeed: 100, shield: 0,  shieldRegen: 0, xpValue: 5,   spawnWeight: 65, centerBias: 0 },
      triangle: { enabled: true,  color: '#e7896d', size: 20,   hp: 10,   mass: 65,  bodyDamage: 10, pushability: 0.8,  elasticity: 1.2, driftSpeed: 100, shield: 0,  shieldRegen: 0, xpValue: 120, spawnWeight: 64, centerBias: 0 },
      square:   { enabled: true,  color: '#efc74b', size: 28,   hp: 20,   mass: 126, bodyDamage: 10, pushability: 0.6,  elasticity: 1.0, driftSpeed: 100, shield: 0,  shieldRegen: 0, xpValue: 30,  spawnWeight: 45, centerBias: 0 },
      pentagon: { enabled: true,  color: '#8d6adf', size: 42,   hp: 50,   mass: 283, bodyDamage: 10, pushability: 0.15, elasticity: 1.5, driftSpeed: 100, shield: 0,  shieldRegen: 0, xpValue: 400, spawnWeight: 20, centerBias: 80 },
      hexagon:  { enabled: true,  color: '#7adbba', size: 50,   hp: 100,  mass: 400, bodyDamage: 15, pushability: 0.1,  elasticity: 1.2, driftSpeed: 100, shield: 0,  shieldRegen: 0, xpValue: 500, spawnWeight: 6,  centerBias: 90 },
    },
    scaleVariants: {
      betaPentagon:  { enabled: true,  color: '#8d6adf', size: 110, hp: 750,   mass: 5204, bodyDamage: 20, pushability: 0.05, elasticity: 1.2, driftSpeed: 60,  shield: 20, shieldRegen: 0,  xpValue: 2500,  spawnWeight: 3, centerBias: 95 },
      alphaPentagon: { enabled: true,  color: '#8d6adf', size: 170, hp: 5625,  mass: 12428, bodyDamage: 20, pushability: 0.02, elasticity: 1.2, driftSpeed: 40,  shield: 40, shieldRegen: 0, xpValue: 15000, spawnWeight: 2, centerBias: 100 },
      odHexagon:     { enabled: false, color: '#cc669c', size: 147, hp: 600,   mass: 9292,  bodyDamage: 20, pushability: 0.04,  elasticity: 1.2, driftSpeed: 60, shield: 40, shieldRegen: 0, xpValue: 21000, spawnWeight: 6, centerBias: 90 },
      odSeptagon:    { enabled: false, color: '#8abc3f', size: 202, hp: 750,   mass: 17545, bodyDamage: 20, pushability: 0.035, elasticity: 1.2, driftSpeed: 60, shield: 50, shieldRegen: 0, xpValue: 28000, spawnWeight: 5, centerBias: 95 },
      odOctagon:     { enabled: false, color: '#7adbba', size: 277, hp: 900,   mass: 32993, bodyDamage: 20, pushability: 0.03,  elasticity: 1.2, driftSpeed: 60, shield: 60, shieldRegen: 0, xpValue: 35000, spawnWeight: 4, centerBias: 98 },
      odNonagon:     { enabled: false, color: '#ffffff', size: 420, hp: 1050,  mass: 75852, bodyDamage: 20, pushability: 0.025, elasticity: 1.2, driftSpeed: 60, shield: 70, shieldRegen: 0, xpValue: 42000, spawnWeight: 3, centerBias: 100 },
    },
    rarityEnabled: {
      normal: true,
      shiny: true,
      legendary: true,
      shadow: true,
      rainbow: true,
      trans: true,
    },
    labyEnabled: {
      1: { egg: true, triangle: true, square: true, pentagon: true, hexagon: true },
      2: { egg: true, triangle: true, square: true, pentagon: true, hexagon: true },
      3: { egg: true, triangle: true, square: true, pentagon: true, hexagon: true },
      4: { egg: true, triangle: true, square: true, pentagon: true, hexagon: true },
      5: { egg: true, triangle: true, square: true, pentagon: true, hexagon: true },
    },
    specialEnabled: {
      gem: true, jewel: true,
      crasherEgg: true, crasherTriangle: true, crasherSquare: true, crasherPentagon: true, crasherHexagon: true,
      sentryGun: true, sentrySwarm: true, sentryTrap: true,
      sentinelGun: false, sentinelSwarm: false, sentinelTrap: false,
      shinySentryGun: false, shinySentrySwarm: false, shinySentryTrap: false,
      sentinelMinigun: false, sentinelLauncher: false, sentinelCrossbow: false,
      cube: true, dodecahedron: true, icosahedron: true,
    },
    crasherEnabled: true,
    crasherCap: 10,
    sentryCap: 6,
    sentinelCap: 3,
    crasherChaseRange: 600,
    crasherSpeed: 3.5,
    groupSpawnChance: 20,
    groupMaxSize: 6,
    scaledVariantCenterZone: 30,
    foodCap: 70,
    shinyChance: 20000,
    legendaryChance: 200000,
    shadowChance: 2000000,
    rainbowChance: 20000000,
    transChance: 200000000,
    polyhedraChance: 500000,
    rarityTestMultiplier: 1,
    scaledVariantCap: 15,
    baseShapeCap: 0,
    rarityCap: 0,
    labyCap: 0,
    specialShapeCap: 0,
    baseShapeRateLevel: 0,
    scaledVariantRateLevel: 0,
    rarityRateLevel: 0,
    labyRateLevel: 0,
    specialShapeRateLevel: 0,
    crasherRateLevel: 0,
    sentryRateLevel: 0,
    sentinelRateLevel: 0,
  };
}

export function DEFAULT_SHAPE_SPAWN_CONFIG(): ShapeSpawnConfig {
  const cfg = SHAPE_SPAWN_CONFIG_OF_BEFORE();
  if (SHAPES_ARRAS === 0) return cfg;
  cfg.shapeBook = 1;
  for (const key in cfg.baseShapes) {
    const r = SHAPE_BOOK[key];
    if (r) { cfg.baseShapes[key].size = r.size; cfg.baseShapes[key].hp = r.hp; }
  }
  for (const key in cfg.scaleVariants) {
    const r = SHAPE_BOOK[key];
    if (r) { cfg.scaleVariants[key].size = r.size; cfg.scaleVariants[key].hp = r.hp; cfg.scaleVariants[key].shield = r.shield; }
  }
  if (SHAPE_SCORES !== 0) {
    cfg.shapeScores = 1;
    for (const key in cfg.baseShapes) { const x = SHAPE_BOOK_SCORE[key]; if (x !== undefined) cfg.baseShapes[key].xpValue = x; }
    for (const key in cfg.scaleVariants) { const x = SHAPE_BOOK_SCORE[key]; if (x !== undefined) cfg.scaleVariants[key].xpValue = x; }
  }
  if (SHAPE_SPAWN_PLAN !== 0) applySpawnProfile(cfg, SPAWN_PROFILE_DEFAULT_ID);
  return cfg;
}

export function applyOldDreadnoughtsRooms(cfg: ShapeSpawnConfig): ShapeSpawnConfig {
  if (SHAPES_ARRAS === 0) return cfg;
  cfg.sizeRandomization = SHAPE_BOOK_OD_ROOMS.spread;
  for (const key in SHAPE_BOOK_OD_ROOMS.rows) {
    const row = cfg.baseShapes[key];
    if (!row) continue;
    row.size = SHAPE_BOOK_OD_ROOMS.rows[key].size;
    row.driftSpeed = row.driftSpeed * SHAPE_BOOK_OD_ROOMS.rows[key].pace;
    const roomHp = (SHAPE_BOOK_OD_ROOMS.rows[key] as { hp?: number }).hp;
    if (roomHp !== undefined) row.hp = row.hp * roomHp;
  }
  return cfg;
}

export interface FloatingPolygon {
  _carrier: string;
  _carryTh: number;
  _carryVx: number;
  _carryVy: number;
  _carryPx: number;
  _carryPy: number;
  _mev: number;
  active: boolean;
  id: string;
  type: 'circle' | 'triangle' | 'square' | 'pentagon';
  position: Vector;
  velocity: Vector;
  impactVelocity: Vector;
  mass: number;
  pushability: number;
  elasticity: number;
  size: number;
  hp: number;
  maxHp: number;
  bodyDamage: number;
  roundDamage: number;
  ramScale: number;
  resist: number;
  arrasResist: number;
  arrasShapePen: number;
  color: string;
  colorMap: number | undefined;
  opacity: number;
  growth: number;
  fadingIn: boolean;
  fadingOut: boolean;

  shield: number;
  maxShield: number;
  shieldRegen: number;
  lastShieldDamageTime: number;
  rotation: number;
  angularVelocity: number;
  spinImpulse: number;
  momentOfInertia: number;
  angularDamping: number;
  damageOverlay: number;
  _fadeT: number;
  _fadeO0: number;
  _fadeG0: number;
  _ruleOpacity: number;
  _ruleGrowth: number;
  targetVelocity: Vector;
  moveAngle: number;
  moveSpeed: number;
  moveCenter: Vector;
  moveRadius: number;

  lastDamageTime: number;
  hpBarOpacity: number;
  displayHp: number;
  displayShield: number;
  hpEaseTo: number;
  hpEaseLeft: number;
  shEaseTo: number;
  shEaseLeft: number;

  lastGoodX: number;
  lastGoodY: number;
  lastGoodVX: number;
  lastGoodVY: number;

  areaIdx: number;
  foodZone: number;
  nestBorn: number;

  frameProcessed: number;

  damageContributions: Map<string, DamageContribution>;

  lastImpactBurstFrom: Map<string, number>;

  lastBurstDealtTo: Map<string, number>;

  _hitSeen: Map<string, number>;
  _hitNext: Map<string, number>;

  _renderKey: string;
  _lastSzBkt: number;
  shapeId: string;
  baseSides: number;
  rarity: string;
  labyLevel: number;
  scaleVariant: string;
  xpValue: number;
  driftSpeedMult: number;
  isAnimatedColor: boolean;
  animationType: string;
  baseOpacity: number;
  isCrasher: boolean;
  threatId: number;
  crasherState: string;
  crasherSpeed: number;
  crasherFacingOffset: number;
  spinSign: number;
  isPolyhedron: boolean;
  polyhedronType: string;
  look: import('./utils/shapeLook').ShapeLook | null;

  isIntangible: boolean;

  penetrationDepth: number;
  _wallContact: boolean;
  _admPush: boolean;
  _admPushX: number;
  _admPushY: number;
  _penColliding: boolean;
  _knKey: string;
  _knSeen: number;
  _knPush: number;
  _knOff: number;
  _knKs: string[];
  _knSs: Float64Array;
  _knPs: Float64Array;
  _knOs: Float64Array;
  _portalUntil: number;
  _kbDens: number;
  _kbPush: number;
  _kbKeep: number;
  _rollR: number;
  _noInsideKick: boolean;
  _spinRate: number;
  _thrownUntil: number;
  _thrownSolid: boolean;
  _thrownAt: number;
  _tch: Float64Array | null;
  _tchMask: number;
  _tchSeen: Float64Array;
  _wtAt: number;
  _wtPortal: object | null;
  _wtSize: number;
  _wtBase: number;
  _wtOw: number;
  _wtOwPx: number;
  _wtOwPy: number;
  _wtOwPk: number;
  _mmAll: boolean;
  _cantDie: boolean;
  _wornSlot: number;
  _mevDeath: number;
  _mevIn: number;
  _knShareX: number;
  _knShareY: number;

  _qs: number;
}

export type MapSize = 'Very Small' | 'Small' | 'Medium' | 'Big' | 'Very Big';

export enum TileType {
  NORMAL = 0,
  WALL = 1,
  PORTAL = 3,
  BASE_BLUE = 4,
  BASE_RED = 5,
  BASE_GREEN = 6,
  BASE_PURPLE = 7,
  OUT_BORDER = 17,
  SPAWN_AREA = 18,
}

export interface WallEntity {
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  type: TileType;
  health: number;
  maxHealth: number;
  active: boolean;
  look?: import('./game/adminPanel').WallLook | null;
  noEye?: boolean;
  block?: number;
  paintSlot?: number;
  paintHex?: string;
  paintAlpha?: number;
  door?: number;
  lookDx?: number;
  lookDy?: number;
  kind?: number;
  wslot?: number;
  wteam?: number;
}

export interface PortalEntity {
  x: number;
  y: number;
  tileSize: number;
  eventHorizon: number;
  id: number;

  areaId: string;
  destinationAreaId: string | null;
  timed: boolean;
  appearDuration: number;
  disappearDuration: number;
  initialDelay: number;
  staticPos: boolean;
  _timedActive: boolean;
  _timedPhaseStart: number;
  _spinAngle: number;
  _auraPos: Float32Array;
  _auraTarget: Float32Array;
  _auraSpeed: Float32Array;
  _particleAngle: Float32Array;
  _particleT: Float32Array;
  _particleSpawnR: Float32Array;
  _particleSize: Float32Array;
  _particleOpacity: Float32Array;
  _spawnTime: number;
  _dying: boolean;
  _particlesDraining: boolean;
  _deathTime: number;
  _opacity: number;
  _scale: number;
  requireLevel: number;
  botOdds: number;
  bossBlacklist: boolean;
  botKnown: boolean;
  botHighLevel: number;
  botOddsHigh: number;
  botDreadShare: number;

  kind: number;
  invisible: boolean;
  showName: boolean;
  exitAreaId: string;
  exitPortalId: number;
  _exit: PortalEntity | null;
  reach: number;
  reachSquare: boolean;
  pullScale: number;
  exitDistance: number;
  exitThrow: number;
  keepSpeed: boolean;
  emitAngle: number;
  shapeMode: number;
  roundMode: number;
  toMode: string;
  _toModeNow: string;
  _inCells: Int32Array | null;
  _placedInArea: boolean;
  themeSlot: number;
  themeHex: string;
  pCountRand: number;
  pSpeedRand: number;
  _vN: number;
  _vK: number;
  _vSeed: number;
  _vT: Float32Array;
  _vAngle: Float32Array;
  _vSpawnR: Float32Array;
  _vSize: Float32Array;
  _vOpac: Float32Array;
}

export const PORTAL_KIND_BLACK_HOLE = 0;
export const PORTAL_KIND_WORMHOLE = 1;
export const PORTAL_THINGS_PUSH = 0;
export const PORTAL_THINGS_DESTROY = 1;
export const PORTAL_THINGS_PULL_DESTROY = 2;
export const PORTAL_THINGS_PULL_THROUGH = 3;
export const PORTAL_THINGS_WORDS = ['push', 'destroy', 'pullDestroy', 'pullThrough'] as const;
export type PortalThingsWord = typeof PORTAL_THINGS_WORDS[number];

export interface PortalKindConfig {
  showName?: boolean;
  portalId: number;
  kind: 'blackHole' | 'wormhole';
  invisible?: boolean;
  exitAreaId?: string;
  exitPortalId?: number;
  bothWays?: boolean;
  reach?: number;
  reachSquare?: boolean;
  pull?: number;
  jump?: number;
  exitDistance?: number;
  exitThrow?: number;
  keepSpeed?: boolean;
  emitAngle?: number;
  shapes?: PortalThingsWord;
  rounds?: PortalThingsWord;
  inArea?: number;
  toMode?: string;
  theme?: boolean;
  themeUseMap?: boolean;
  themeHex?: string;
  themeMap?: number;
  particleCountRand?: number;
  particleSpeedRand?: number;
}

export const PORTAL_KIND_PRESETS = {
  blackHole: { reach: 300, reachSquare: false, pull: 1, jump: 30, exitDistance: 100, exitThrow: 1, keepSpeed: true, shapes: 'push' as PortalThingsWord, rounds: 'push' as PortalThingsWord, invisible: false },
  wormhole: { reach: 150, reachSquare: true, pull: 1, jump: 15, exitDistance: 100, exitThrow: 1, keepSpeed: true, shapes: 'destroy' as PortalThingsWord, rounds: 'destroy' as PortalThingsWord, invisible: true },
} as const;
export const WORMHOLE_PULL = 200;
export const WORMHOLE_THROW = 80;

export interface RockEntity {
  x: number;
  y: number;
  size: number;
  shape: number;
  rotation: number;
  health: number;
  maxHealth: number;
  shield: number;
  active: boolean;
  lookDx?: number;
  lookDy?: number;
  paintSlot?: number;
  paintHex?: string;
  paintAlpha?: number;
}

export interface SpawnZoneScale {
  w: number;
  h: number;
}

export interface BaseProtectorTeamConfig {
  enabled?: boolean;
  tank?: string;
  count?: number;
  arrangement?: BaseProtectorArrangement;
  smart?: boolean;
  tileCells?: number;
}

export type BaseProtectorArrangement = 'center' | 'corners';

export interface BossGroupConfig {
  name: string;
  tanks: string[];
  weight: number;
}

export const MAZE_TYPE_CUSTOM = -1;

export interface MapPaint { slot?: number; hex?: string; opacity?: number }

export interface PlacedWall {
  id: number;
  gx: number;
  gy: number;
  cw: number;
  ch: number;
  lookGx?: number;
  lookGy?: number;
  paint?: MapPaint;
}

export interface PlacedRock {
  id: number;
  cx: number;
  cy: number;
  size: number;
  rotation: number;
  kind: 'rock' | 'stone' | 'gravel';
  lookCx?: number;
  lookCy?: number;
  paint?: MapPaint;
}

export interface PlacedZone {
  id: number;
  gx: number;
  gy: number;
  cw: number;
  ch: number;
  team: 0 | 1 | 2 | 3;
  kind?: ZoneKind;
  color?: string;
  colorMap?: number;
  colorFree?: string;
  opacity?: number;
  bounce?: number;
  spare?: string[];
  uid?: number;
  name?: string;
  more?: { gx: number; gy: number; cw: number; ch: number }[];
  shape?: import('./game/areaShape').AreaShape;
  fill?: AreaFill;
  behaviors?: import('./game/mapEvents/doc').Row[];
  showName?: boolean;
  clearWalls?: boolean;
  note?: string;
  modeBase?: boolean;
  modeName?: string;
}

export interface AreaFill {
  k: 'maze' | 'rocks';
  maze?: number;
  rocks?: string;
  count?: number; variation?: number; kinds?: ('rock' | 'stone' | 'gravel')[];
  erosion?: number;
  seed?: number;
}
export type ZoneKind = 'base' | 'cosmetic' | 'bouncy' | 'kill';
export const AREA_KIND_COSMETIC = 1;
export const AREA_KIND_BOUNCY = 2;
export const AREA_KIND_KILL = 3;
export const AREA_KIND_SOLID = 4;
export const AREA_KIND_CONVEYOR = 5;
export const AREA_KIND_PEACE = 6;
export const AREA_KIND_KEEPOUT = 7;
export interface CustomAreaRect {
  x0: number; y0: number; x1: number; y1: number;
  kind: number;
  color: string;
  colorMap: number | undefined;
  opacity: number;
  bounce: number;
  spare: readonly string[];
  areaId: string;
  gx: number; gy: number; cw: number; ch: number;
  uid?: number; behId?: number;
  off?: boolean;
  noDraw?: boolean;
  does?: number;
  rate?: number;
  bounceF?: unknown;
  minLevel?: number;
  line?: string;
  beltX?: number;
  beltY?: number;
  crossChance?: number;
  crossHold?: number;
  rateF?: unknown;
  centre?: boolean;
  hitsRounds?: boolean; ownerCounts?: boolean;
  food?: number;
  foodRate?: number; foodF?: unknown;
  deathLine?: string;
  spareTypes?: readonly number[]; spareTags?: readonly number[];
  groupN?: number; ux0?: number; uy0?: number; ux1?: number; uy1?: number;
  solidTest?: number;
  mask?: Uint8Array | null; maskW?: number; maskH?: number; maskCell?: number;
  poly?: Float64Array | null; pmx?: number; pmy?: number;
  isBase?: boolean;
}
export const AREA_DOES_DPS = 1;
export const AREA_DOES_PCT = 2;
export const AREA_FOOD_CRASHERS = 1;
export const AREA_FOOD_ALL = 2;
export const BOUNCE_KICK = 72;

export interface PlacedPortal {
  id: number;
  gx: number;
  gy: number;
  staticPos: boolean;
  appear?: 'fixed' | 'map' | 'area';
  inArea?: number;
}

export interface CustomMapData {
  nextId: number;
  walls: PlacedWall[];
  rocks: PlacedRock[];
  zones: PlacedZone[];
  portals: PlacedPortal[];
}

export interface MapTweaks {
  nextId: number;
  walls: PlacedWall[];
  rocks: PlacedRock[];
  removedRockKeys: string[];
  layoutKey?: string;
}

export function createCustomMapData(): CustomMapData {
  return { nextId: 1, walls: [], rocks: [], zones: [], portals: [] };
}

export function createMapTweaks(): MapTweaks {
  return { nextId: 1, walls: [], rocks: [], removedRockKeys: [] };
}

export interface MapConfig {
  mazeType: number;
  seed: number;
  gridCells: number;
  gridCellsY?: number;
  mapScale: number;
  enableMaze: boolean;
  enablePortals: boolean;
  portalCount: number;
  enableSpawnAreas: boolean;
  spawnAreaTeamCount?: number;
  baseLayout?: BaseLayout;
  spawnZoneSync?: boolean;
  spawnZoneScales?: SpawnZoneScale[];
  enableRocks: boolean;
  rockDensity: number;
  rockTypes: ('rock' | 'stone' | 'gravel')[];
  rocksLeftOut?: ('stone' | 'gravel')[];

  rockPattern?: 'random' | 'corners' | 'edges' | 'ring' | 'center' | 'scattered' | 'tiles' | 'pumpkinPatch' | RockFormationWord;
  rockTiles?: { layout?: 'checker' | 'full'; tile?: number; perTile?: number; sizeMin?: number; sizeMax?: number; clearMiddle?: boolean; clearCorners?: boolean; mix?: boolean; clearRound?: boolean };
  rockExclusionZone?: boolean;
  rockExclusionSize?: number;
  rockSizeVariation?: number;
  erosionIntensity?: number;
  tileOverrides: Record<string, TileType>;
  customMap?: CustomMapData;
  mapTweaks?: MapTweaks;

  name: string;
  portalLinks?: PortalLinkConfig[];
  portalTimings?: PortalTimingConfig[];

  portalLevels?: PortalLevelConfig[];
  portalBotOdds?: PortalBotOddsConfig[];
  portalBossBlacklist?: PortalBossBlacklistConfig[];

  portalKinds?: PortalKindConfig[];
  wallBlocks?: boolean;
  wallPaint?: MapPaint;
  rockPaint?: MapPaint;
  magicMaze?: import('./game/magicMaze').MagicMazeConfig;

  enableBaseProtectors?: boolean;
  baseProtectorTeams?: BaseProtectorTeamConfig[];
  baseProtectorPush?: boolean;
  baseProtectorPushStrength?: number;
  baseProtectorRange?: number;
  baseProtectorOnMinimap?: boolean;

  enableBossSpawns?: boolean;
  bossInitialDelay?: number;
  bossSpawnCooldown?: number;
  bossGroups?: BossGroupConfig[];
  bossesCanGrow?: boolean;
  bossesUsePortals?: boolean;

  events?: import('./game/mapEvents/doc').MapEventsDoc;
  mapAreas?: { nextId: number; zones: PlacedZone[] };
  mapPortals?: { nextId: number; portals: PlacedPortal[] };
}

export interface PortalTimingConfig {
  portalId: number;
  timed: boolean;
  appearDuration: number;
  disappearDuration: number;
  initialDelay: number;
}

export const PORTAL_TIMING_DEFAULTS = { appearDuration: 30000, disappearDuration: 20000, initialDelay: 5000 } as const;

export interface PortalLevelConfig {
  portalId: number;
  requireLevel: number;
}

export interface PortalBotOddsConfig {
  portalId: number;
  odds: number;
  known?: boolean;
  highLevel?: number;
  oddsHigh?: number;
  dreadShare?: number;
}
export interface PortalBossBlacklistConfig {
  portalId: number;
  on: boolean;
}
export const PORTAL_BOT_ODDS_DEFAULT = 80;

export interface PortalLinkConfig {
  portalId: number;
  destinationAreaId: string;
}

export interface AreaConfig {
  id: string;
  name: string;
  mapConfig: MapConfig;
  shapeSpawnConfig: ShapeSpawnConfig;
  spawnRate: number;
  worldOffsetX: number;
  worldOffsetY: number;
  startingTankFileName?: string;
  startingTankFirstEntryOnly?: boolean;
  noPvp?: boolean;
  botSpawnWeight?: number;
  botSpawnWeightByTeam?: Record<string, number>;
  gapBefore?: number;
}

export const OD_AREA_NAMES = {
  MAIN: 'Main Arena',
  MAZE: 'Maze',
  FORGE: 'Forge',
} as const;

export interface MultiAreaMapConfig {
  areas: AreaConfig[];
  activeAreaId: string;
  enableMultiArea: boolean;
  botSpawnMode?: 'simple' | 'advanced';
  areaLayout?: 'far' | 'near';
  areaStack?: 'column';
  minimapAllAreas?: boolean;
}

export interface BaseZoneRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  team: string;
}

export interface MapState {
  walls: WallEntity[];
  shrinkHX?: number;
  shrinkHY?: number;
  extraWalls?: number[];
  extraOffX?: number;
  extraOffY?: number;
  outWalls?: number[];
  outInX?: number;
  outInY?: number;
  outTiles?: number[];
  magic?: import('./game/magicMaze').MagicLattice[];
  magicHeld?: Uint8Array;
  spawnEdge?: number;
  portals: PortalEntity[];
  rocks: RockEntity[];
  customAreas?: CustomAreaRect[];
  baseZones: BaseZoneRect[];
  connectedBases: BaseZoneRect[];
  connectedBaseLabel: Int32Array;
  tileGrid: Uint8Array;
  wallGrid: Int16Array;
  rockGrid: Int16Array;
  rockBucketCell: number;
  rockBucketDim: number;
  rockBucketMinX: number;
  rockBucketMinY: number;
  rockBucketStart: Int32Array;
  rockBucketIdx: Int32Array;
  rockBucketCount: number;
  spawnableTiles: number[];
  mapHalf: number;
  mapHalfY: number;
  cellSize: number;
  gridCells: number;
  gridCellsY: number;
  wallCanvasDirty: boolean;
  areaId: string;
  navigation: import('./game/Navigation').NavigationState | null;
  seedUsed: number;
}

export function createDefaultMapConfig(): MapConfig {
  return {
    mazeType: ALL_MODES.ON !== 0 ? 21 : 0,
    seed: 1,
    gridCells: 32,
    mapScale: 5,
    enableMaze: true,
    enablePortals: false,
    portalCount: 1,
    enableSpawnAreas: false,
    enableRocks: false,
    rockDensity: ALL_MODES.ON !== 0 ? 32 : 500,
    rockTypes: ['rock', 'stone', 'gravel'],
    rockPattern: ALL_MODES.ON !== 0 ? 'ffa' : 'random',
    rockExclusionZone: ALL_MODES.ON === 0,
    rockExclusionSize: 10,
    rockSizeVariation: ALL_MODES.ON !== 0 ? 30 : 100,
    erosionIntensity: 1.0,
    tileOverrides: {},
    name: 'Untitled Map',
  };
}

export const DEFAULT_MAP_CONFIG: MapConfig = (() => {
  const c = createDefaultMapConfig();
  Object.freeze(c.rockTypes);
  Object.freeze(c.tileOverrides);
  return Object.freeze(c);
})();

let _areaIdCounter = 0;
export function createDefaultAreaId(): string {
  return `area_${Date.now()}_${_areaIdCounter++}`;
}

export function generateRandomSeed(): number {
  const t = Date.now();
  const r = (Math.random() * 0x7FFFFFFF) | 0;
  return ((t ^ r) & 0x7FFFFFFF) || 1;
}

export function createDefaultArea(name?: string): AreaConfig {
  const id = createDefaultAreaId();
  return {
    id,
    name: name || 'Area 1',
    mapConfig: { ...createDefaultMapConfig(), seed: generateRandomSeed() },
    shapeSpawnConfig: DEFAULT_SHAPE_SPAWN_CONFIG(),
    spawnRate: 50,
    worldOffsetX: 0,
    worldOffsetY: 0,
  };
}

export const DEFAULT_MULTI_AREA_CONFIG: MultiAreaMapConfig = {
  areas: [],
  activeAreaId: '',
  enableMultiArea: false,
};

export type UpgradeStat =
  | 'bodyDamage'
  | 'maxHealth'
  | 'bulletSpeed'
  | 'bulletPenetration'
  | 'bulletHealth'
  | 'bulletDamage'
  | 'reload'
  | 'movementSpeed'
  | 'shieldRegen'
  | 'shieldCapacity';

export const DEFAULT_SKILL_CAPS: Record<UpgradeStat, number> = {
  bodyDamage: 10, maxHealth: 10, bulletSpeed: 10, bulletPenetration: 10,
  bulletHealth: 10, bulletDamage: 10, reload: 10, movementSpeed: 10,
  shieldRegen: 10, shieldCapacity: 10,
};

export const ZERO_SKILLS: Record<UpgradeStat, number> = {
  bodyDamage: 0, maxHealth: 0, bulletSpeed: 0, bulletPenetration: 0,
  bulletHealth: 0, bulletDamage: 0, reload: 0, movementSpeed: 0,
  shieldRegen: 0, shieldCapacity: 0,
};

export const UPGRADE_STAT_KEYS: UpgradeStat[] = [
  'bodyDamage', 'maxHealth', 'bulletSpeed', 'bulletHealth', 'bulletPenetration',
  'bulletDamage', 'reload', 'movementSpeed', 'shieldRegen', 'shieldCapacity',
];

const DEFAULT_STAT_NAMES: Record<UpgradeStat, string> = {
  bodyDamage: 'Body Damage', maxHealth: 'Max Health', bulletSpeed: 'Bullet Speed',
  bulletHealth: 'Bullet Health', bulletPenetration: 'Bullet Penetration',
  bulletDamage: 'Bullet Damage', reload: 'Reload', movementSpeed: 'Movement Speed',
  shieldRegen: 'Shield Regeneration', shieldCapacity: 'Shield Capacity',
};

const STAT_NAME_OVERRIDES: Record<StatNamesType, Partial<Record<UpgradeStat, string>>> = {
  generic: {},
  drone: { bulletSpeed: 'Drone Speed', bulletHealth: 'Drone Health', bulletPenetration: 'Drone Penetration', bulletDamage: 'Drone Damage', reload: 'Respawn Rate' },
  swarm: { bulletSpeed: 'Swarm Speed', bulletHealth: 'Swarm Health', bulletPenetration: 'Swarm Penetration', bulletDamage: 'Swarm Damage' },
  trap: { bulletSpeed: 'Placement Speed', bulletHealth: 'Trap Health', bulletPenetration: 'Trap Penetration', bulletDamage: 'Trap Damage' },
  necro: { bulletSpeed: 'Drone Speed', bulletHealth: 'Drone Health', bulletPenetration: 'Drone Penetration', bulletDamage: 'Drone Damage', reload: 'Max Drone Count' },
  mixed: { bulletSpeed: 'Weapon Speed', bulletHealth: 'Weapon Health', bulletPenetration: 'Weapon Penetration', bulletDamage: 'Weapon Damage' },
  smasher: { reload: 'Engine Acceleration' },
};

export function isSmasherStatNames(statNamesType: StatNamesType | undefined, legacyIsSmasher?: boolean): boolean {
  return statNamesType === 'smasher' || legacyIsSmasher === true;
}

export function getStatLabel(stat: UpgradeStat, type: StatNamesType = 'generic'): string {
  return STAT_NAME_OVERRIDES[type]?.[stat] ?? DEFAULT_STAT_NAMES[stat];
}

export interface BodyLayer {
  id: string;
  label: string;
  tag?: string;
  sides: number;
  sizeRatio: number;
  color: string;
  colorMap?: number;
  colorFree?: string;
  useInheritColor: boolean;
  teamColour?: boolean;
  spinEnabled: boolean;
  spinDirection: 1 | -1;
  spinSpeed: number;
  copies: number;
  initialAngle: number;
  starDepth: number;
  starCurved: boolean;
  outline?: [number, number][];
  intangible: boolean;
  showHealerCross: boolean;
  stationary: boolean;
  turretIds: string[];
  renderOrder: number;
  maxAliveEnabled: boolean;
  maxAlive: number;
  _currentAngle: number;
}

export interface TankConfig {
  tankSides: number;
  tankShapeDepth?: number;
  tankShapeCurved?: boolean;
  tankSize: number;
  tankColor: string;
  tankColorMap?: number;
  tankColorFree?: string;
  keepOwnColor?: boolean;

  tankHP: number;
  tankBodyDamage: number;
  tankMovementSpeed: number;
  tankShieldRegen: number;
  tankShieldCapacity: number;

  maxSkillPoints: number;
  maxPointsPerSkill: number;
  bonusSkillPoints: number;
  skillCaps: Record<UpgradeStat, number>;
  preDefinedSkills: Record<UpgradeStat, number>;
  canEarnSkillPoints: boolean;
  fovMultiplier: number;

  turrets: Turret[];
  primaryTurretId?: string | null;
  useCustomAimDirection?: boolean;
  customAimAngle?: number;
  mirrorMode: boolean;
  autoPlacement: boolean;
  autoPlacementCount: number;
  snapPlacement?: boolean;
  snapPlacementCount?: number;
  baseSpinEnabled: boolean;
  baseSpinSpeed: number;
  baseSpinDirection: 1 | -1;
  bodyLayers?: BodyLayer[];
  turretGroups?: TurretGroup[];

  isSmasher?: boolean;
  isHealer?: boolean;
  healerAI?: boolean;
  chargeAI?: boolean;
  arenaCloserAI?: boolean;
  invisible?: { fadeInRate: number; fadeOutRate: number; always?: boolean } | null;
  globalMaxAliveEnabled?: boolean;
  globalMaxAlive?: number;
  tankPushability?: number;
  tankResistBase?: number;
  tankPushShare?: number;
  tankPenetrationBase?: number;
  tankTouchScale?: number;
  cameraZoomEnabled?: boolean;
  cameraZoomDistance?: number;
  statNamesType?: StatNamesType;
  ignoresWalls?: boolean;
  showHealthBar?: boolean;

  _configVersion?: number;
  [key: string]: any;
}

export interface TurretPreset {
  name: string;
  category?: string;
  turrets: Turret[];
  primaryIndex?: number;
}

export interface CustomProjectileDesign {
  name: string;
  visual: ProjectileVisual;
  shape: number;
  size: number;
  useMuzzleSize: boolean;
  color: string;
  useTankColor: boolean;
  motionType: MotionType;
  facingType: FacingType;
  growRate: number;
  turrets: Turret[];
  primaryIndex?: number;
  subTurrets?: SubTurretConfig[];
  mountedTurret: null;
  trapDepth?: number;
  trapCurved?: boolean;
  friction?: number;
  hitsOwnType?: HitsOwnType;
  density?: number;
  bounciness?: number;
  bouncy?: boolean;
  bodyLayers?: BodyLayer[];
  bodyColor?: string;
  bodyColorMap?: number;
  originalTankSize?: number;
  tankPushability?: number;
  tankTouchScale?: number;
  maxBodyLayerRatio?: number;
}

export interface FoodShapeDesign {
  _designVersion?: number;
  shapeId: string;
  name: string;
  sides: number;
  color: string;
  colorMap?: number;
  colorFree?: string;
  rarity: Rarity;
  labyLevel: LabyLevel;
  size: number;
  hp: number;
  bodyDamage: number;
  shield: number;
  shieldRegen: number;
  xpValue: number;
  pushability: number;
  driftSpeed: number;
  centerBias: number;
  resist: number;
  penetration: number;
  polyhedronType?: string;
  isIntangible?: boolean;
  isCrasher: boolean;
  crasherSpeed: number;
  crasherFacingOffset?: number;
  correspondsTo?: string;
  hitOnRounds?: number;
  sizeRandomization?: number;
  ramHealthScale?: number;
  pathTurn?: number;
  look?: { body: OtherPart };
  arras?: { name?: string; key?: string; colorSlot?: number; baseSize?: number; sizeFactor?: number; source?: string;
    designId?: string; from?: Record<string, string>;
    xpBefore?: number };
}

export interface OtherPart {
  kind: 'circle' | 'polygon' | 'star' | 'line' | 'outline';
  sides?: number;
  inner?: number;
  points?: [number, number][];
  radius: number;
  x: number;
  y: number;
  angle: number;
  turn: number;
  above: boolean;
  color: string;
  colorMap: number;
  colorCode?: number;
  wearsCarrier?: boolean;
  teamColour?: boolean;
  parts?: OtherPart[];
  arras?: { designId?: string; name?: string; colour?: number; scale?: number; offset?: number; direction?: number; mountAngle?: number };
}

export interface PlacedLook {
  kind: 'other' | 'shape';
  name: string;
  design: OtherDesign;
  shapeId?: string;
  size: number;
  alpha?: number;
  anim?: 'rainbow' | 'trans';
}

export interface OtherDesign {
  _designVersion?: number;
  otherId: string;
  name: string;
  size: number;
  body: OtherPart;
  arras?: { designId?: string; name?: string; baseSize?: number; source?: string; note?: string;
    firstSeen?: { at?: string; folder?: string; file?: string; server?: string }; from?: Record<string, string> };
}

export interface ExportFile {
  version: string;
  type: 'Tank' | 'TurretPreset' | 'CustomTurret' | 'CustomProjectile' | 'Map' | 'MultiAreaMap' | 'FoodShape' | 'Other' | 'GameMode';
  name: string;
  timestamp: number;
  category?: string;
  data: TankConfig | TurretPreset | CustomProjectileDesign | MapConfig | MultiAreaMapConfig | FoodShapeDesign | OtherDesign;
}

export interface GameModeFile { gameModeFile: 1; config: GameModeConfig; map: MapConfig; areas?: MultiAreaMapConfig; }

export interface LibraryItem {
  id: string;
  name: string;
  fileData: ExportFile;
  loadedAt: number;
  source?: 'data-library' | 'manual-import';
}

export interface DataManifestEntry {
  path: string;
  name: string;
  type: string;
  size: number;
}

export interface DataManifest {
  generatedAt: number;
  files: DataManifestEntry[];
}

export interface DataPackEntry {
  file: string;
  files: number;
  bytes: number;
}

export interface DataPackList {
  format: number;
  count: number;
  packs: DataPackEntry[];
  order: string[];
}

export interface FearState {
  isFleeing: boolean;
  fleeTarget: Vector | null;
  fleeStartTime: number;
  fearReason: 'level_gap' | 'damage_ratio' | 'burst_damage' | 'heat' | 'hunted' | null;
  fleeSourceId: string | null;
}

export interface EnemyConfig {
  id: string;
  enemyName: string;
  tankConfig: TankConfig;
  baseLevel: number;
  isBossTier?: boolean;
  aiBehavior: AIBehavior;
  upgradeLogic: UpgradeLogic;
  forceAutospin: boolean;
  forceAutoshoot: boolean;
  maxSpawnCount: number;
  autoRevival: boolean;
  enabled: boolean;
  aimbotStrength: number;
  turnSpeed: number;
  facingType: FacingType;
  isSentryEnemy?: boolean;
  isBaseProtector?: boolean;
  xpValue?: number;
  canUsePortal?: boolean;
  isAutoBot?: boolean;
  isCmdBot?: boolean;
  isStageBody?: boolean;
  bossTeam?: boolean;
  chosenBehavior?: AIBehavior;
  chosenAs?: AIBehavior;
  useHardcodedColor?: boolean;
  specialKey?: string;
  sentryTier?: 'sentry' | 'sentinel';
  sourceLibraryName?: string;
  sourceTankWord?: string;
}

export const AI_CATEGORY_SCHEMA_VERSION = 1;

export interface AICategorySettings {
  distanceFromTarget: number;
  forceAutoshoot: boolean;
  forceAutospin: boolean;
  keepAttackingThroughCover: boolean;
  aimbotStrength: number;
  fleeHpThreshold: number;
  customUpgradeLogic: CustomUpgradeLogic;
}

export interface CustomUpgradeLogic {
  enabled: boolean;
  priorities: Record<UpgradeStat, number>;
  fillRemainingRandomly: boolean;
}

export interface AIBehaviorCategory {
  id: string;
  name: string;
  tankNames: string[];
  settings: AICategorySettings;
  createdAt: number;
}

export interface AIBehaviorCategoriesState {
  version: number;
  categories: AIBehaviorCategory[];
}

export function createDefaultCustomUpgradeLogic(): CustomUpgradeLogic {
  return {
    enabled: false,
    priorities: {
      bodyDamage: 0, maxHealth: 0, bulletSpeed: 0, bulletPenetration: 0,
      bulletHealth: 0, bulletDamage: 0, reload: 0, movementSpeed: 0,
      shieldRegen: 0, shieldCapacity: 0,
    },
    fillRemainingRandomly: false,
  };
}

export function createDefaultAICategorySettings(): AICategorySettings {
  return {
    distanceFromTarget: 50,
    forceAutoshoot: false,
    forceAutospin: false,
    keepAttackingThroughCover: false,
    aimbotStrength: 25,
    fleeHpThreshold: 20,
    customUpgradeLogic: createDefaultCustomUpgradeLogic(),
  };
}

export function createDefaultAIBehaviorCategories(): AIBehaviorCategory[] {
  const cats = _categoriesHePlaced();
  if (ALL_MODES.ON !== 0) for (const c of cats) { const more = AI_CATEGORY_ADDED[c.id]; if (more) c.tankNames.push(...more); }
  return cats;
}
function _categoriesHePlaced(): AIBehaviorCategory[] {
  return [
    {
      id: 'default-offensive-tanks',
      name: 'Offensive Tanks',
      tankNames: [
        'Basic', 'Twin', 'Double Twin', 'Triple Shot', 'Gunner', 'Bulwark',
        'Triple Twin', 'Bent Double', 'Auto-Double', 'Penta Shot', 'Spreadshot',
        'Bent Hybrid', 'Triplet', 'Auto-Gunner', 'Auto-4', 'Machine Gun',
        'Gunner Trapper', 'Artillery', 'Minigun', 'Sprayer',
        'Mortar', 'Beekeeper', 'Field Gun', 'Streamliner', 'Crop Duster',
        'Barricade', 'Destroyer', 'Builder', 'Launcher', 'Shotgun', 'Conqueror',
        'Annihilator', 'Hybrid', 'Constructor', 'Auto-Builder', 'Engineer',
        'Boomer', 'Assembler', 'Architect', 'Skimmer', 'Twister', 'Swarmer',
        'Sidewinder', 'Trapper', 'Pounder',
        'Atomizer', 'Auto-3', 'Auto-5', 'Focal', 'Machine Gunner', 'Mega-3',
        'Redistributor',
      ],
      settings: {
        distanceFromTarget: 50,
        forceAutoshoot: false,
        forceAutospin: false,
        keepAttackingThroughCover: false,
        aimbotStrength: 25,
        fleeHpThreshold: 20,
        customUpgradeLogic: {
          enabled: true,
          priorities: {
            bulletHealth: 1,
            bulletPenetration: 1,
            bulletDamage: 1,
            reload: 1,
            bodyDamage: 2,
            maxHealth: 2,
            bulletSpeed: 2,
            movementSpeed: 2,
            shieldRegen: 3,
            shieldCapacity: 3,
          },
          fillRemainingRandomly: true,
        },
      },
      createdAt: 0,
    },
    {
      id: 'default-sniper-tanks',
      name: 'Sniper Tanks',
      tankNames: [
        'Sniper', 'Assassin', 'Hunter', 'Rifle', 'Marksman', 'Bushwhacker',
        'Ranger', 'Falcon', 'Stalker', 'Auto-Assassin', 'Single', 'Deadeye',
        'Predator', 'X-Hunter', 'Poacher', 'Ordnance', 'Dual', 'Nimrod',
        'Nailgun', 'Musket', 'Crossbow', 'Armsman', 'Revolver', 'Fork',
        'Trap Guard',
      ],
      settings: {
        distanceFromTarget: 100,
        forceAutoshoot: false,
        forceAutospin: false,
        keepAttackingThroughCover: false,
        aimbotStrength: 100,
        fleeHpThreshold: 30,
        customUpgradeLogic: {
          enabled: true,
          priorities: {
            bulletSpeed: 1,
            bulletHealth: 1,
            bulletPenetration: 1,
            bulletDamage: 1,
            reload: 1,
            bodyDamage: 2,
            maxHealth: 2,
            movementSpeed: 2,
            shieldRegen: 3,
            shieldCapacity: 3,
          },
          fillRemainingRandomly: true,
        },
      },
      createdAt: 1,
    },
    {
      id: 'default-spinning-tanks',
      name: 'Spinning Tanks',
      tankNames: [
        'Flank Guard', 'Hexa Tank', 'Tri-Trapper', 'Octo Tank', 'Cyclone',
        'Hexa-Trapper', 'Septa-Trapper',
      ],
      settings: {
        distanceFromTarget: 50,
        forceAutoshoot: true,
        forceAutospin: true,
        keepAttackingThroughCover: false,
        aimbotStrength: 0,
        fleeHpThreshold: 25,
        customUpgradeLogic: {
          enabled: true,
          priorities: {
            bulletHealth: 1,
            bulletPenetration: 1,
            bulletDamage: 1,
            reload: 1,
            bodyDamage: 2,
            maxHealth: 2,
            movementSpeed: 2,
            shieldRegen: 3,
            shieldCapacity: 3,
            bulletSpeed: 4,
          },
          fillRemainingRandomly: true,
        },
      },
      createdAt: 2,
    },
    {
      id: 'default-booster-tanks',
      name: 'Booster Tanks',
      tankNames: [
        'Tri-Angle', 'Fighter', 'Booster', 'Bomber', 'Auto-Tri-Angle',
        'Surfer', 'Eagle', 'Phoenix', 'Vulture',
        'Hewn Double',
      ],
      settings: {
        distanceFromTarget: 15,
        forceAutoshoot: true,
        forceAutospin: false,
        keepAttackingThroughCover: false,
        aimbotStrength: 40,
        fleeHpThreshold: 30,
        customUpgradeLogic: {
          enabled: true,
          priorities: {
            bulletHealth: 1,
            bulletPenetration: 1,
            bulletDamage: 1,
            reload: 1,
            bodyDamage: 2,
            maxHealth: 2,
            movementSpeed: 2,
            shieldRegen: 3,
            shieldCapacity: 3,
            bulletSpeed: 4,
          },
          fillRemainingRandomly: true,
        },
      },
      createdAt: 3,
    },
    {
      id: 'default-droner-tanks',
      name: 'Droner Tanks',
      tankNames: [
        'Director', 'Overseer', 'Cruiser', 'Underseer', 'Spawner', 'Manager',
        'Big Cheese', 'Overlord', 'Overtrapper', 'Overgunner', 'Banshee',
        'Auto-Overseer', 'Overdrive', 'Commander', 'Carrier', 'Battleship',
        'Fortress', 'Auto-Cruiser', 'Necromancer', 'Maleficitor', 'Infestor',
        'Auto-Spawner',
        'Factory',
      ],
      settings: {
        distanceFromTarget: 80,
        forceAutoshoot: false,
        forceAutospin: false,
        keepAttackingThroughCover: true,
        aimbotStrength: 30,
        fleeHpThreshold: 40,
        customUpgradeLogic: {
          enabled: true,
          priorities: {
            bulletHealth: 1,
            bulletPenetration: 1,
            bulletDamage: 1,
            reload: 1,
            bodyDamage: 2,
            maxHealth: 2,
            bulletSpeed: 2,
            movementSpeed: 2,
            shieldRegen: 3,
            shieldCapacity: 3,
          },
          fillRemainingRandomly: true,
        },
      },
      createdAt: 4,
    },
    {
      id: 'default-rammer-tanks',
      name: 'Rammer Tanks',
      tankNames: [
        'Mega-Smasher', 'Spike', 'Auto-Smasher', 'Landmine',
        'Bob', 'Nemesis',
        'Smasher',
      ],
      settings: {
        distanceFromTarget: 0,
        forceAutoshoot: false,
        forceAutospin: false,
        keepAttackingThroughCover: false,
        aimbotStrength: 0,
        fleeHpThreshold: 0,
        customUpgradeLogic: {
          enabled: true,
          priorities: {
            bodyDamage: 1,
            maxHealth: 1,
            movementSpeed: 1,
            shieldRegen: 2,
            shieldCapacity: 2,
            bulletSpeed: 3,
            bulletHealth: 3,
            bulletPenetration: 3,
            bulletDamage: 3,
            reload: 3,
          },
          fillRemainingRandomly: true,
        },
      },
      createdAt: 5,
    },
    {
      id: 'default-healer-tanks',
      name: 'Healer Tanks',
      tankNames: [
        'Ambulance', 'Healer', 'Medic', 'Paramedic', 'Surgeon',
      ],
      settings: {
        distanceFromTarget: 15,
        forceAutoshoot: false,
        forceAutospin: false,
        keepAttackingThroughCover: false,
        aimbotStrength: 40,
        fleeHpThreshold: 30,
        customUpgradeLogic: {
          enabled: true,
          priorities: {
            bulletHealth: 1,
            bulletPenetration: 1,
            bulletDamage: 1,
            reload: 1,
            bodyDamage: 2,
            maxHealth: 2,
            movementSpeed: 2,
            shieldRegen: 3,
            shieldCapacity: 3,
            bulletSpeed: 4,
          },
          fillRemainingRandomly: true,
        },
      },
      createdAt: 6,
    },
  ];
}

export interface EnemyTank {
  _ringBodyAt?: number;
  _fsK?: number;
  id: string;
  configId: string;
  active: boolean;
  position: Vector;
  velocity: Vector;
  knockbackVelocity: Vector;
  _knShareX?: number;
  _knShareY?: number;
  _stepX0: number;
  _stepY0: number;
  _stepV0: number;
  recoilArras?: Vector;
  angle: number;
  turretAngle: number;
  targetAngle: number;
  prevTargetAngle: number;
  targetTurretAngle: number;
  angularVelocity: number;
  handAngle: number;
  handRate: number;
  handAccel: number;
  handHull: number;
  turretAngularVelocity: number;
  mass: number;
  pushability: number;
  resistBase?: number;
  _fileResist: number;
  _toughWord: string;
  toughKind?: number;
  healthK?: number;
  pushShare?: number;
  penetrationBase?: number;
  touchScale?: number;
  isSmasher: boolean;
  size: number;
  baseSize: number;
  growthScale: number;
  sizeSlideBase: number;
  sizeSlideLive: number;

  lastGoodX: number;
  lastGoodY: number;
  lastGoodVX: number;
  lastGoodVY: number;

  aimHistT: Float64Array;
  aimHistVX: Float64Array;
  aimHistVY: Float64Array;
  aimHistHead: number;
  aimHistLen: number;
  aimHistLastT: number;
  aimReactTgtId: string | null;
  aimReactUntil: number;
  aimReactHoldX: number;
  aimReactHoldY: number;
  aimEmaFrame: number;

  frameProcessed: number;

  sides: number;
  shapeDepth?: number;
  shapeCurved?: boolean;
  color: string;
  colorMap: number | undefined;
  keepOwnColor: boolean;
  turrets: Turret[];
  primaryTurretIndex: number;
  facingType: FacingType;
  maxHealth: number;
  currentHealth: number;
  maxShield: number;
  currentShield: number;
  bodyDamage: number;
  movementSpeed: number;
  shieldRegen: number;

  lastDamageTime: number;
  hpBarOpacity: number;
  damageOverlay: number;
  displayHp: number;
  displayShield: number;
  hpEaseTo: number;
  hpEaseLeft: number;
  shEaseTo: number;
  shEaseLeft: number;

  level: number;
  currentXp: number;
  upgrades: Record<UpgradeStat, number>;
  skillPoints: number;
  maxSkillPoints: number;
  maxPointsPerSkill: number;
  bonusSkillPoints: number;
  skillCaps: Record<UpgradeStat, number>;
  preDefinedSkills: Record<UpgradeStat, number>;
  canEarnSkillPoints: boolean;
  nextUpgradeIndex: number;
  arrasResist: number;
  kills: number;
  team: TeamId;
  aiBehavior: AIBehavior;
  upgradeLogic: UpgradeLogic;
  aiState: AIState;

  groupId: number;
  isGroupLeader: boolean;
  isRegrouping: boolean;
  lastRegroupRetargetTime: number;
  fearRollAt: number;
  aiNextFullUpdate: number;
  regroupTargetX: number;
  regroupTargetY: number;

  currentTargetId: string | null;
  currentTargetType: 'player' | 'enemy' | 'shape' | null;
  previousFoodTargetId: string | null;
  targetPosition: Vector | null;
  fovRadius: number;
  _fovOwn: number;
  _fovGrown: number;
  fovMultiplier: number;
  orbitAngle: number;
  orbitDistance: number;
  orbitDirection: 1 | -1;
  roamTarget: Vector | null;
  lastDirectionChange: number;

  fear: FearState;
  recentDamageIn3s: number;
  damageTimestamps: Array<{ time: number; amount: number }>;
  fearHeat: number;
  fearFleeCooldownUntil: number;
  pressTargetId: string;
  pressMs: number;
  pressLastDealtMs: number;
  keepAttackingThroughCover?: boolean;
  minAttackDistance?: number;
  categoryPreferredDistance?: number;
  fleeHpThresholdPct?: number;
  customUpgradePriorities?: Record<UpgradeStat, number>;
  customUpgradeFillRandom?: boolean;
  _skillsFinalized?: boolean;
  isAggro: boolean;
  totalPlayerDamage: number;
  damageFromTanks: Map<string, number>;
  aggroTowards: Set<string>;
  isSentryEnemy: boolean;
  sentryTier?: 'sentry' | 'sentinel';
  isBaseProtector?: boolean;
  _mev: number;
  _mevF: number;
  _mevIn: number;
  _tch: Float64Array | null;
  _tchMask: number;
  _tchSeen: Float64Array;
  _wtAt: number;
  _wtPortal: object | null;
  _wtSize: number;
  _wtSvX: number;
  _wtSvY: number;
  _wtOw: number;
  _wtOwPx: number;
  _wtOwPy: number;
  _wtOwPk: number;
  _wtStAge: number;
  _wtStX: number;
  _wtStY: number;
  _wtStMX: number;
  _wtStMY: number;
  _mevOrder: number;
  _mevScore: number;
  _mevRouteR: number;
  _mevWay: number;
  _mevWayAt: number;
  _mevWayX: number;
  _mevWayY: number;
  _dkLostId: string;
  _dkLostAt: number;
  _dkSeenX: number;
  _dkSeenY: number;
  _dkIds: string[];
  _dkAts: Float64Array;
  _dkSX: Float64Array;
  _dkSY: Float64Array;
  _dkUse: Float64Array;
  _dkFeelAt: number;
  _dkFeelX: number;
  _dkFeelY: number;
  _dkInDark: boolean;
  _dkSeesAll: boolean;
  _intKind: number; _intZone: number; _intTargetId: string; _intUntil: number; _intTag: number; _intSeconds: number;
  _intGiveUpAt: number; _intInsideAt: number; _intLastRoam: number; _intGoX: number; _intGoY: number; _intPickAt: number; _intRouteId: string;
  _intThing: EnemyTank | FloatingPolygon | null; _intPushOn: boolean;
  _intThrough: number;
  _senseAt: number; _senseCool: Float64Array;
  _mevColour: number;
  _mevInvis: number;
  _mevSpeedK: number;
  _mevHpK: number;
  _mevPushWas: number;
  _mevFollowOf: string;
  _sideLeft: boolean;
  _zMind: boolean;
  _zAggWas: number;
  _zCourWas: number;
  _zChargeWas: boolean;
  _hordeLed: boolean;
  _hordeAt: number;
  _zPack: boolean;
  _packTargetId: string;
  _packTargetPlayer: boolean;
  _btBits: number; _btN: Int8Array;
  _ogTag: number; _ogRadius: number; _oaTag: number; _ogId: string; _ogX: number; _ogY: number; _ogLookAt: number;
  _ftTake: number; _ftSpoil: number; _ftId: string; _ftLookAt: number; _ctKite: boolean;
  _ftGo: boolean; _ftX: number; _ftY: number; _ftBestD: number; _ftGiveUpAt: number; _ftBan: string; _ftBanUntil: number;
  _esTag: number; _esMax: number; _esRadius: number; _esId: string; _esLookAt: number;
  _wtView: number; _wtViewSet: number; _wkMask: number; _wkPad: number;
  _wqMask: number; _wqEvMin: number; _wqEvMax: number; _wqChance: number; _wqHoldMin: number; _wqHoldMax: number; _wqNext: number; _wqN: number;
  _mmDo: number; _mmWi: number; _mmWx: number; _mmWy: number; _mmGx: number; _mmGy: number; _mmUntil: number; _mmGiveUpAt: number; _mmBestD: number;
  _wtTouch: WallEntity | null;
  _wtTs: (WallEntity | null)[]; _wtTk: Int8Array; _wtTn: number;
  _carryHMs: MapState | null; _carryHTeam: string; _carryHx: number; _carryHy: number;
  _hsBelow: number; _hsBack: number; _hsHealers: boolean; _hsTag: number; _hsZone: number;
  _tfHelp: boolean; _flBelow: number; _flBack: number;
  _hsOn: number; _hsId: string; _hsArea: number; _hsX: number; _hsY: number; _hsNear: number; _hsLeash: number; _hsKite: boolean; _hsPickAt: number; _hsGiveUpAt: number; _hsCoolUntil: number; _hsBestD: number;
  _tfHelpId: string; _tfLookAt: number; _flLow: boolean;
  _tfGoalId: string; _tfGoalX: number; _tfGoalY: number; _tfGoalSeenAt: number; _tfGoalBestD: number; _tfGoalGiveUpAt: number; _tfGoalArriveAt: number; _tfBanId: string; _tfBanUntil: number;
  _btRoute: string; _btWx: number; _btWy: number; _btWAt: number; _btWn: number;
  _hdMateId: string; _hdLookAt: number;
  _madeWord: string;
  _mevAimAt: number; _mevAimId: string;
  _mevBirthAt: number;
  bpAnchorX?: number;
  bpAnchorY?: number;
  bpPushImp?: number;

  isHealer: boolean;
  healerAI: boolean;
  chargeAI: boolean;
  arenaCloserAI: boolean;
  fwtTrigger: boolean;
  fgTwo: boolean;
  fgPushX: number;
  fgPushY: number;
  fgLeft: boolean;
  fgRight: boolean;
  fgSeen: boolean;
  fgLine: boolean;
  fgFlipAt: number;
  fgIntentX: number;
  fgIntentY: number;
  fgAutoshootYields: boolean;
  _hasHealGun?: boolean;

  ignoresWalls: boolean;
  showHealthBar: boolean;

  ghostMode: boolean;

  invisEnabled: boolean;
  invisFadeInRate: number;
  invisFadeOutRate: number;
  invisAlpha: number;
  invisAlways: boolean;
  viewAlpha: number;
  lastFireMs: number;
  xpOverride: number;

  isSpawning: boolean;
  spawnStartTime: number;
  _becameAt: number;
  isDying: boolean;
  deathStartTime: number;

  graceActive: boolean;
  graceEndTime: number;
  graceStartTime: number;
  tripGrace?: boolean;
  isEvolving: boolean;
  nextEvolveTime: number;
  currentTankName: string;
  evolutionComplete: boolean;
  botTreeTier: number;
  botStopStream: number;
  isAutoSpawned: boolean;
  displayName: string;
  forceAutospin: boolean;
  forceAutospinSpeed: number;
  forceAutoshoot: boolean;

  xpToOwner: boolean;

  useHardcodedColor: boolean;

  aimbotStrength: number;
  smoothedAimPos: Vector | null;
  personality: MovementPersonality;

  lastBodyBurstFrom: Map<string, number>;

  _hitSeen: Map<string, number>;
  _hitNext: Map<string, number>;

  baseSpinEnabled: boolean;
  baseSpinSpeed: number;
  baseSpinDirection: 1 | -1;
  _baseBodyAngle: number;
  bodyLayers: BodyLayer[];

  canUsePortal: boolean;
  _portalCooldown: number;
  portalSeekIdx: number;
  portalSeekUntil: number;
  portalSeekCooldownUntil: number;
  portalSeekLastScan: number;
  portalRestUntil: number;
  _koUntil: number;
  _koRoll: number;

  areaId: string;
  visitedAreaIds: Set<string>;
  navLastX: number;
  navLastY: number;
  navStuckFrames: number;
  navStuckCheckTime: number;
  navStuckLongX: number;
  navStuckLongY: number;
  navStuckLongAt: number;
  navUseFlowField: boolean;
  navLosCheckFrame: number;
  navLosStreak: number;
  navLosResult: boolean;
  navLosMuzzleOnly: boolean;
  pokeSpotX: number;
  pokeSpotY: number;
  pokeUntil: number;
  peekWallSight: boolean;
  peekShareOk: boolean;
  peekDuckUntil: number;
  peekDuckCdUntil: number;
  peekSideX: number;
  peekSideY: number;
  peekSideUntil: number;
  peekStandSince: number;
  peekStandAnchorX: number;
  peekStandAnchorY: number;
  peekStandOwned: boolean;
  peekStandBranch: number;
  peekStandTgtHp: number;
  peekStandTgtId: string;
  peekStandProgressAt: number;
  peekStandMoveAt: number;
  peekReleaseUntil: number;
  peekReleaseX: number;
  peekReleaseY: number;
  cfDryTgtId: string;
  cfDryTgtHp: number;
  cfDryProgressAt: number;
  cfDrySince: number;
  cfDryCounted: boolean;
  cfDrySeenMs: number;
  cfGunsBlocked: boolean;
  rolePower: number;
  rolePowerLevelRef: number;
  rolePowerSpRef: number;
  rolePowerGrowthQRef: number;
  rolePowerCeilRef: number;
  roleHunterFrame: number;
  roleHunterPowerSum: number;
  roleHunterCount: number;
  roleHunterPrimaryId: string;
  roleHunterBestPower: number;
  roleSeenByVictim: boolean;
  roleSeenVictimId: string;
  playerHurtAt: number;
  rolePlayerSeen: boolean;
  stalkHuntedAt: number;
  stalkHunterId: string;
  pbBlockerId: string;
  pbBlockerUntil: number;
  pbBlockerX: number;
  pbBlockerY: number;
  pbBlockerFrame: number;
  pbBlockerSeenFrame: number;
  fleeRerouteAt: number;
  fleeRerouteFromId: string;
  borderSqueezeUntil: number;
  borderSqueezeEdge: number;
  borderSqueezeLatDir: number;
  borderSqueezeExitLat: number;
  borderSqueezeCooldownUntil: number;
  borderSqueezeCheckAt: number;
  borderSqueezeTargetId: string | null;
  roleWithdrawFrame: number;
  roleWdBestGap: number;
  roleWdBestAt: number;
  roleWdCorneredUntil: number;
  roleWdAggId: string;
  weaveBackoffUntil: number;
  navFieldUnreachAt: number;
  unreachTargetId: string;
  unreachUntil: number;
  navReactiveSince: number;
  navGiveUpFor: string;
  navGiveUpSeenAt: number;
  attackEngagedAt: number;
  sightHoldSince: number;
  throttleHoldUntil: number;
  navGapSince: number;
  navGapBestD0: number;
  navGapD0At: number;
  navGapCommitAt: number;
  navGapX: number;
  navGapY: number;
  navGapSawCommit: boolean;
  pursuitRevStreak: number;
  pursuitRevBestD0: number;
  pursuitRevAt: number;
  sightFieldBadUntil: number;
  navBodyR?: number;
  navBulletR?: number;
  navLastAttackAt?: number;
  chaseAnchorId: string;
  chaseAnchorGap: number;
  chaseAnchorSeenAt: number;
  chaseAnchorAt: number;
  chaseFutileId: string;
  chaseFutileUntil: number;
  chaseStallBilledAt: number;
  chaseFutileCountedAt: number;

  _navBulletRSizeRef?: number;
  _navBulletRTurretsRef?: unknown;
  _navBulletRPrevSize?: number;
  navDbgBranch?: number;
  navDbgD0?: number;
  navDbgPath?: number[];
  navDbgPathLen?: number;
  navDbgPathStalled?: boolean;
  navDbgSteerKind?: number;
  navDbgSteerX?: number;
  navDbgSteerY?: number;
  navDbgFails?: number;
  navDbgFailsShown?: number;
  navDbgFailsAt?: number;
  navDbgVeto?: number;
  navDbgCoast?: boolean;
  navDbgCoastAt?: number;
  navDbgVetoShown?: number;
  navDbgGiveUpKind?: number;
  navDbgGiveUpAt?: number;
  fireApertures: Float64Array | null;
  fireApertureCount: number;
  _aimGunIdx?: number;
  navLastShapeLosTime: number;
  lastSawTargetTime: number;
  navTravelDirX: number;
  navTravelDirY: number;
  navLastDecisionCell: number;
  navGoalRegion: number;
  navGoalUntil: number;
  navGoalDwellUntil: number;
  navGoalRepickAt: number;
  navWaypointAt: number;
  navWaypointX: number;
  navWaypointY: number;
  navRegionSeen: Uint8Array;
  navRegionBlockedUntil: Float64Array;
  navRegionSeenAt: number;
  navHomeDwellUntil: number;
  navHomeExitCommitted: boolean;
  sgEscapeAt: number;
  sgHarassAt: number;
  sgHarassId: string;
  sgHarassX: number;
  sgHarassY: number;
  sgHarassDist: number;
  guardHurtAt: number;
  navEscapeUntil: number;



  pursuitWpOwner: number;
  pursuitWpLive: boolean;
  pursuitWpX: number;
  pursuitWpY: number;
  pursuitWpAt: number;
  pursuitWpSrcCx: number;
  pursuitWpSrcCy: number;
  pursuitWpDirX: number;
  pursuitWpDirY: number;
  pursuitWpMinD: number;
  pursuitWpMinDAt: number;
  pursuitWpCommitD: number;
  fleeEscUntil: number;
  fleeDeadEndUntil: number;
  fleeStandHeldFor: number;

  pursuitPathPts: Float32Array;
  pursuitPathLen: number;
  pursuitPathIdx: number;
  pursuitPathLive: boolean;
  pursuitPathWantReplan: boolean;
  pursuitPathPlanAt: number;
  pursuitPathSrcCx: number;
  pursuitPathSrcCy: number;
  pursuitPathTgtId: string;
  pursuitPathMinD: number;
  pursuitPathMinDAt: number;
  pursuitPathMouth: boolean;
  followVacuousPlans: number;

  pursuitYieldActive: boolean;

  pursuitYieldBestDist: number;
  pursuitYieldProgressAt: number;
  pursuitYieldBlockUntil: number;
  pursuitYieldSince: number;

  pursuitYieldRefused: boolean;

  pursuitYieldBlockByRelease: boolean;

  pathScoreNextMs: number;

  navTrappedAt: number;

  lastTankDamageAt: number;

  lastTankDamageById: string;

  fearSourceId: string;
  fearSourceAt: number;

  switchCandidateId: string;
  switchCandidateSince: number;

  threatNextEvalMs: number;
  threatDodgeRef: Bullet | null;
  threatDodgeId: number;
  threatDodgeDirX: number;
  threatDodgeDirY: number;
  threatDodgeSide: number;
  threatDodgeUntil: number;
  threatDodgeWeight: number;
  threatShootRef: Bullet | null;
  threatShootId: number;
  threatShapeRef: FloatingPolygon | null;
  threatShapeId: number;
  threatAttackerId: string;
  threatAttackerFrame: number;
  _threatAttackerDSq: number;
  _threatHeldId: string;
  aimNoseOff: number;
  threatAimActive: boolean;
  threatAimReady: boolean;
  threatEngageX: number;
  threatEngageY: number;
  threatEngageFrame: number;
  threatAimSmoothPos: Vector | null;
  threatAimSmoothId: number;
  threatAimSmoothFrame: number;
  threatAimHoldSince: number;
  threatAimHoldId: number;
  threatAimHoldFrame: number;
  threatAimCommitId: number;
  threatAimCommitUntil: number;
  threatAtkSeenMs: number;
  threatSeeShotMs: number;
  threatSeeShotId: number;

  fleeAimId: string;
  fleeAimSeenMs: number;

  fleeLegacySeenMs: number;
  fleeLegacyHolding: boolean;

  isBossTier: boolean;
  camp: number;
  dnaCourage: number;
  dnaTeamHelp: number;
  dnaAggression: number;
  dnaVengeful: number;
  dnaCaution: number;
  assistMateId: string;
  assistUntil: number;
  assistDecisionAt: number;
  healTargetId: string;
  healUntil: number;
  healDecisionAt: number;
  knownThreatId: string;
  knownThreatDirX: number;
  knownThreatDirY: number;
  knownThreatGap: number;
  knownThreatAt: number;

  extractActive: boolean;
  extractTargetX: number;
  extractTargetY: number;
  extractFast: boolean;

  combatHeldDirX: number;
  combatHeldDirY: number;
  combatTargetDirX: number;
  combatTargetDirY: number;
  combatHeldSpeed: number;
  combatHoldUntil: number;
  combatHoldIsOrbit: boolean;
  standoffEffective?: number;
  shapeHeldDirX: number;
  shapeHeldDirY: number;
  throttleMoveDirX: number;
  throttleMoveDirY: number;
  retreatUntil: number;
  retreatDirX: number;
  retreatDirY: number;
  followTargetX: number;
  followTargetY: number;
  followStartTime: number;
  followMaxDuration: number;
  spawnedByEntityId: string;
  spawnedByTurretId: string;
  _tapSpawnFrame: number;
  _tapRootId: string;
  _tapActivateTime: number;
  _globalMaxAlive?: number;
  _globalMaxAliveEnabled?: boolean;
  _hasNecroGlobalCap?: boolean;
  _ipStep?: number;
  _ipLife?: string;
  _ipOff?: number;
  _ipTur?: unknown;
  _ipLay?: unknown;
  _ipEnd?: number;
  _ipJump?: number;
  _ipWarp?: number;
  _ipWX?: number;
  _ipWY?: number;
  _kidStamp?: number;
  _kidHead?: number;
  _kidTail?: number;
}

export interface RevivalEntry {
  configId: string;
  revivalTime: number;
}

export interface XpTextAnimation {
  id: string;
  ownerId: string;
  amount: number;
  position: Vector;
  createdAt: number;
  offsetY: number;
}

export interface GameState {
  tankSides: number;
  tankShapeDepth: number;
  tankShapeCurved: boolean;
  tankSize: number;
  tankColor: string;
  tankColorMap?: number;
  tankColorFree?: string;
  keepOwnColor: boolean;
  tankHP: number;
  tankBodyDamage: number;
  tankMovementSpeed: number;
  tankShieldRegen: number;
  tankShieldCapacity: number;
  fovMultiplier: number;
  tankCurrentHealth: number;
  tankCurrentShield: number;
  tankDisplayHealth: number;
  tankDisplayShield: number;
  lastTankDamageTime: number;
  tankHpBarOpacity: number;
  
  level: number;
  currentXp: number;
  skillPoints: number;
  maxSkillPoints: number;
  maxPointsPerSkill: number;
  bonusSkillPoints: number;
  skillCaps: Record<UpgradeStat, number>;
  preDefinedSkills: Record<UpgradeStat, number>;
  canEarnSkillPoints: boolean;
  upgrades: Record<UpgradeStat, number>;
  arrasResist: number;
  playerName: string;

  kills: number;
  bossKills: number;
  topKills: number;
  foodKills: number;
  playerDead: boolean;
  deathKills: number;
  deathLevel: number;
  deathFoodKills: number;
  deathSurvivalMs: number;
  deathCauseKind: '' | 'tank' | 'shape' | 'zone' | 'area';
  deathCauseName: string;
  deathColorTeamIndex: number;
  deathMenuOpenedAt: number;

  respawnLevelPercent: number;
  respawnMinLevel: number;
  respawnMaxLevel: number;
  teamBotSettings: TeamBotSettingsMap;

  isTestMode: boolean;
  paused: boolean;
  debugMode: boolean;
  isDebugMenuOpen: boolean;
  currentTankFileName: string | null;
  editorTankLabel: string | null;
  currentBranchRoot: string | null;
  evolutionMenuVisible: boolean;
  availableEvolutions: string[];
  evolutionBranchLabels: string[];
  classTreeOpen: boolean;
  dreadUpgradeDismissed: boolean;
  devMenuBypassActive: boolean;
  playerEvolutionLocked: boolean;
  godMode: boolean;
  ghostMode: boolean;
  gracePeriodActive: boolean;
  gracePeriodStartTime: number;
  _preGraceGodMode: boolean;
  debugShowShapeHP: boolean;
  debugShowProjectileHP: boolean;
  debugShowAILogic: boolean;
  debugShowXpGain: boolean;
  debugShowAllNames: boolean;
  showSpawnStats: boolean;
  debugFovMultiplier: number;
  dbgHudEntities: boolean;
  dbgHudJitter: boolean;
  dbgHudPerf: boolean;
  dbgHudMemory: boolean;
  dbgHudDrawOps: boolean;
  dbgHudWaves: boolean;
  dbgShowAreaMarks: boolean;
  dbgHudOverlayCost: boolean;
  dbgHudAimError: boolean;
  dbgHudAimReact: boolean;
  dbgHudStalkFlee: boolean;
  dbgHudRoleRepair: boolean;
  dbgHudFleeReroute: boolean;
  dbgHudFleeDeadEnd: boolean;
  dbgHudFearRearm: boolean;
  dbgHudFleeStand: boolean;
  dbgHudFleeCommit: boolean;
  dbgHudBorderSqueeze: boolean;
  dbgHudProvokeShield: boolean;
  dbgHudRetaliate: boolean;
  dbgHudYield: boolean;
  dbgHudWallShots: boolean;
  dbgHudAttackAim: boolean;
  dbgHudAimSelf: boolean;
  dbgHudAimTruth: boolean;
  dbgHudAimGodly: boolean;
  dbgHudPlayerHunt: boolean;
  dbgHudDroneCloud: boolean;
  dbgHudChaseFlap: boolean;
  dbgHudCornerFire: boolean;
  dbgHudAimMount: boolean;
  dbgHudFarmAim: boolean;
  dbgHudCornerSidestep: boolean;
  dbgHudGhost: boolean;
  dbgHudPathBlock: boolean;
  dbgHudChaseFutile: boolean;
  dbgHudPeekFreeze: boolean;
  dbgHudStandoff: boolean;
  dbgHudNaN: boolean;
  dbgHudLoopErrors: boolean;
  dbgHudRarity: boolean;

  dbgAiAimLaser: boolean;
  dbgAiTargetLine: boolean;
  dbgAiFollowMarker: boolean;
  dbgAiThreatLine: boolean;
  dbgAiOrbitRing: boolean;
  dbgAiFearMeter: boolean;
  dbgAiStateLabel: boolean;
  dbgAiRoleColumn: boolean;
  dbgAiNavDebug: boolean;
  dbgAiLight: boolean;
  dbgDarkNoFog: boolean;
  autoFire: boolean;
  autoSpin: boolean;
  autoOverride: boolean;
  reverseTank: boolean;
  baseSpinEnabled: boolean;
  baseSpinSpeed: number;
  baseSpinDirection: 1 | -1;
  isHealer: boolean;
  healerAI: boolean;
  chargeAI: boolean;
  arenaCloserAI: boolean;
  ignoresWalls: boolean;
  showHealthBar: boolean;
  invisibleEnabled: boolean;
  invisibleFadeInRate: number;
  invisibleFadeOutRate: number;
  invisibleAlways: boolean;
  tankInvisAlpha: number;
  tankPushability: number;
  tankResistBase: number;
  tankPushShare?: number;
  tankPenetrationBase: number;
  tankTouchScale: number;
  globalMaxAliveEnabled?: boolean;
  globalMaxAlive?: number;
  _hasNecroGlobalCap?: boolean;
  spawnRate: number;
  velocityInheritance: number;
  mapSize: MapSize;
  mapConfig: MapConfig;
  multiAreaConfig: MultiAreaMapConfig;
  shapeLimit: number;
  showHPBars: boolean;
  showPlayerNames: boolean;
  showPlayerScores: boolean;
  showKillsBar: boolean;
  showAllMinimap: boolean;
  shapeConfigs: Record<ShapeType, ShapeConfig>;
  shapeSpawnConfig: ShapeSpawnConfig;
  gameModeConfig: GameModeConfig;
  playerGrowthScale: number;
  tankSpawning: boolean;
  tankSpawnStartTime: number;

  messages: GameMessage[];
  
  turrets: Turret[];
  turretGroups: TurretGroup[];

  bodyLayers: BodyLayer[];
  activeBodyLayerId: string | null;
  editingTurret: Omit<Turret, 'id' | 'angle' | 'animProgress'>;
  canvasEntityKind: 'tank' | 'shape' | 'other';
  viewingOther: OtherDesign | null;
  canvasIsProjectile: boolean;
  editingShape: FoodShapeDesign | null;
  primaryTurretId: string | null;
  useCustomAimDirection: boolean;
  customAimAngle: number;
  cameraZoomEnabled: boolean;
  cameraZoomDistance: number;
  statNamesType: StatNamesType;

  mirrorMode: boolean;
  autoPlacement: boolean;
  autoPlacementCount: number;
  selectMode: boolean;
  selectedTurretId: string | null;
  snapPlacement: boolean;
  snapPlacementCount: number;
  presetPreviewTurrets: Turret[];
  presetPreviewXform: { x: number; y: number; turn: number; size: number };

  inheritMode: boolean;
  inheritTargetTurretId: string | null;

  enemyConfigs: EnemyConfig[];
  enemyTanks: EnemyTank[];
  maxEnemies: number;
  aiBehaviorCategories: AIBehaviorCategoriesState;
  aiBehaviorCategoriesVersion: number;

  tankLibrary: LibraryItem[];
  otherLibrary: LibraryItem[];

  projectileDesigns: CustomProjectileDesign[];
  turretPresets: TurretPreset[];
  playerId: string;

  manhuntLeaderId: string | null;

  leaderboardVersion: number;

  autoSubTurretEditMode: boolean;
  autoSubTurretParentId: string | null;
  autoSubTurretEditing: Omit<Turret, 'id' | 'angle' | 'animProgress'>;
  autoSubTurretSelectedId: string | null;
  autoSubTurretSelectMode: boolean;
  autoSubTurretMirrorMode: boolean;
  autoSubTurretSnapPlacement: boolean;
  autoSubTurretSnapPlacementCount: number;
  autoSubTurretAutoPlacement: boolean;
  autoSubTurretAutoPlacementCount: number;
  autoSubTurretInheritMode: boolean;
  autoSubTurretInheritTargetId: string | null;

  savedEditingTurretBeforeAutoMode: Omit<Turret, 'id' | 'angle' | 'animProgress'> | null;

  savedEditingTurretBeforePick: Omit<Turret, 'id' | 'angle' | 'animProgress'> | null;
  savedAutoSubEditingBeforePick: Omit<Turret, 'id' | 'angle' | 'animProgress'> | null;

  editorStateByContext: Record<string, { editingTurret: Omit<Turret, 'id' | 'angle' | 'animProgress'> }>;
}

export const DEFAULT_TURRET_CONFIG: Omit<Turret, 'id' | 'angle' | 'animProgress'> = {
  length: 9.5,
  width: 21,
  aspect: 1,
  xOffset: 0,
  yOffset: 0,
  bps: 1.9,
  speed: 5,
  delay: 0,
  knockback: 40,
  spread: 5,
  shudder: 0.1,
  bulletDamage: 4.5,
  bulletHealthBase: 4.5,
  bulletPenetration: 1,
  bulletLifetime: 73 / 30,
  shootResist: 1,
  turretType: 'regular',
  alwaysAbove: false,
  alwaysShoot: false,
  independent: false,
  fov: 200,
  fovSize: 10,
  autoTargetPriority: 'nearest',
  maxTurnSpeed: 4.5,
  autoFireDelay: 0,
  manualControl: false,
  autoCircleSize: 25,
  autoCircleBaseSides: 0,
  autoCircleColorMatch: false,
  autoCircleHidden: false,
  autoCircleFixed: false,
  autoCircleSpin: false,
  autoCircleSpinMode: 'fixed' as 'fixed' | 'withBody',
  autoCircleSpinSpeed: 50,
  autoCircleSpinDirection: 1 as 1 | -1,
  autoCircleHealer: false,
  autoTurretLength: 7,
  autoTurretWidth: 20,
  projectileType: { ...DEFAULT_PROJECTILE_TYPE },
  projectileBehaviors: [],
  visualLayers: [],
  autoCurrentAngle: 0,
  autoTargetId: null,
  autoShapeLockId: null,
  aboveTankBody: false,
  renderLayer: 0,
  autoFire: false,
  wifiRange: false,
  wifiRangeValue: 50,
  recoilPosition: 0,
  recoilVelocity: 0,
  physRecoilPos: 0,
  physRecoilVel: 0,
  physRecoilDirX: 0,
  physRecoilDirY: 0,
  autoSubTurrets: [],
  primarySubTurretId: null,
  altFire: false,
  syncsSkills: false,
  necro: false,
  healer: false,
  gunStatScale: 1.0,
  _origLength: undefined,
  _origWidth: undefined,
  _origXOffset: undefined,
  _origYOffset: undefined,
};

export const MAX_ARENA_TANKS = 50;

export const RESPAWN_COOLDOWN_MS = 3000;

export const DEFAULT_RESPAWN_RULES = {
  respawnLevelPercent: 25,
  respawnMinLevel: 70,
  respawnMaxLevel: 40,
} as const;

export const INITIAL_GAME_STATE: GameState = {
  tankSides: 0,
  tankShapeDepth: 0,
  tankShapeCurved: false,
  tankSize: 9,
  tankColor: '#3ca4cb',
  keepOwnColor: false,

  tankHP: 220,
  tankBodyDamage: 3,
  tankMovementSpeed: 3,
  tankShieldRegen: 3,
  tankShieldCapacity: 65.5,
  fovMultiplier: 1.0,

  tankCurrentHealth: 220,
  tankCurrentShield: 65.5,
  tankDisplayHealth: 220,
  tankDisplayShield: 65,
  lastTankDamageTime: 0,
  tankHpBarOpacity: 0,

  level: 0,
  currentXp: 0,
  skillPoints: 0,
  maxSkillPoints: 42,
  maxPointsPerSkill: 10,
  bonusSkillPoints: 0,
  skillCaps: {
    bodyDamage: 10, maxHealth: 10, bulletSpeed: 10, bulletPenetration: 10,
    bulletHealth: 10, bulletDamage: 10, reload: 10, movementSpeed: 10,
    shieldRegen: 10, shieldCapacity: 10,
  },
  preDefinedSkills: {
    bodyDamage: 0, maxHealth: 0, bulletSpeed: 0, bulletPenetration: 0,
    bulletHealth: 0, bulletDamage: 0, reload: 0, movementSpeed: 0,
    shieldRegen: 0, shieldCapacity: 0,
  },
  canEarnSkillPoints: true,
  upgrades: {
    bodyDamage: 0,
    maxHealth: 0,
    bulletSpeed: 0,
    bulletPenetration: 0,
    bulletHealth: 0,
    bulletDamage: 0,
    reload: 0,
    movementSpeed: 0,
    shieldRegen: 0,
    shieldCapacity: 0
  },
  arrasResist: 0,

  playerName: '',
  kills: 0,
  bossKills: 0,
  topKills: 0,
  foodKills: 0,
  playerDead: false,
  deathKills: 0,
  deathLevel: 0,
  deathFoodKills: 0,
  deathSurvivalMs: 0,
  deathCauseKind: '',
  deathCauseName: '',
  deathColorTeamIndex: -1,
  deathMenuOpenedAt: 0,
  ...DEFAULT_RESPAWN_RULES,

  teamBotSettings: createDefaultTeamBotSettingsMap(),

  isTestMode: false,
  paused: false,
  debugMode: false,
  isDebugMenuOpen: false,

  currentTankFileName: null,
  editorTankLabel: null,
  currentBranchRoot: null,
  evolutionMenuVisible: false,
  availableEvolutions: [],
  evolutionBranchLabels: [],
  classTreeOpen: false,
  dreadUpgradeDismissed: false,
  devMenuBypassActive: false,
  playerEvolutionLocked: false,

  godMode: false,
  ghostMode: false,
  gracePeriodActive: false,
  gracePeriodStartTime: 0,
  _preGraceGodMode: false,

  debugShowShapeHP: false,
  debugShowProjectileHP: false,
  debugShowAILogic: false,
  debugShowXpGain: false,
  debugShowAllNames: false,
  showSpawnStats: false,
  debugFovMultiplier: 1.0,

  dbgHudEntities: false,
  dbgHudJitter: false,
  dbgHudPerf: false,
  dbgHudMemory: false,
  dbgHudDrawOps: false,
  dbgHudWaves: false,
  dbgShowAreaMarks: false,
  dbgHudOverlayCost: false,
  dbgHudAimError: false,
  dbgHudAimReact: false,
  dbgHudStalkFlee: false,
  dbgHudRoleRepair: false,
  dbgHudFleeReroute: false,
  dbgHudFleeDeadEnd: false,
  dbgHudFearRearm: false,
  dbgHudFleeStand: false,
  dbgHudFleeCommit: false,
  dbgHudBorderSqueeze: false,
  dbgHudProvokeShield: false,
  dbgHudRetaliate: false,
  dbgHudYield: false,
  dbgHudWallShots: false,
  dbgHudAttackAim: false,
  dbgHudAimSelf: false,
  dbgHudAimTruth: false,
  dbgHudAimGodly: false,
  dbgHudPlayerHunt: false,
  dbgHudDroneCloud: false,
  dbgHudChaseFlap: false,
  dbgHudFarmAim: false,
  dbgHudCornerFire: false,
  dbgHudAimMount: false,
  dbgHudCornerSidestep: false,
  dbgHudGhost: false,
  dbgHudPathBlock: false,
  dbgHudChaseFutile: false,
  dbgHudPeekFreeze: false,
  dbgHudStandoff: false,
  dbgHudNaN: false,
  dbgHudLoopErrors: false,
  dbgHudRarity: false,
  dbgAiAimLaser: false,
  dbgAiTargetLine: false,
  dbgAiFollowMarker: false,
  dbgAiThreatLine: false,
  dbgAiOrbitRing: false,
  dbgAiFearMeter: false,
  dbgAiStateLabel: false,
  dbgAiRoleColumn: false,
  dbgAiNavDebug: false,
  dbgAiLight: false,
  dbgDarkNoFog: false,

  autoFire: false,
  autoSpin: false,
  autoOverride: false,
  reverseTank: false,
  baseSpinEnabled: false,
  baseSpinSpeed: 100,
  baseSpinDirection: -1 as 1 | -1,
  isHealer: false,
  healerAI: false,
  chargeAI: false,
  arenaCloserAI: false,
  ignoresWalls: false,
  showHealthBar: true,
  invisibleEnabled: false,
  invisibleFadeInRate: 0.04,
  invisibleFadeOutRate: 0.015,
  invisibleAlways: false,
  tankInvisAlpha: 1.0,
  tankPushability: 1.0,
  tankResistBase: 1,
  tankPenetrationBase: 1.05,
  tankTouchScale: 1,

  spawnRate: 50,
  velocityInheritance: 50,
  mapSize: 'Medium',
  mapConfig: { ...createDefaultMapConfig(), seed: generateRandomSeed() },
  multiAreaConfig: { ...DEFAULT_MULTI_AREA_CONFIG, areas: [] },
  shapeLimit: 250,
  showHPBars: true,
  showPlayerNames: true,
  showPlayerScores: true,
  showKillsBar: true,
  showAllMinimap: false,
  shapeConfigs: JSON.parse(JSON.stringify(DEFAULT_SHAPE_CONFIGS)),
  shapeSpawnConfig: DEFAULT_SHAPE_SPAWN_CONFIG(),

  gameModeConfig: { ...DEFAULT_GAME_MODE_CONFIG },
  playerGrowthScale: 1.0,

  tankSpawning: false,
  tankSpawnStartTime: 0,

  messages: [],

  turrets: [],
  turretGroups: [],

  bodyLayers: [],
  activeBodyLayerId: null,

  editingTurret: { ...DEFAULT_TURRET_CONFIG },
  canvasEntityKind: 'tank',
  canvasIsProjectile: false,
  editingShape: null,
  viewingOther: null,
  editorStateByContext: { main: { editingTurret: { ...DEFAULT_TURRET_CONFIG } } },
  primaryTurretId: null,
  useCustomAimDirection: false,
  customAimAngle: 0,
  cameraZoomEnabled: false,
  cameraZoomDistance: 225,
  statNamesType: 'generic' as StatNamesType,

  mirrorMode: false,
  autoPlacement: false,
  autoPlacementCount: 1,
  selectMode: false,
  selectedTurretId: null,
  snapPlacement: false,
  snapPlacementCount: 0,
  presetPreviewTurrets: [],
  presetPreviewXform: { x: 0, y: 0, turn: 0, size: 1 },

  inheritMode: false,
  inheritTargetTurretId: null,

  enemyConfigs: [],
  enemyTanks: [],
  maxEnemies: MAX_ARENA_TANKS,

  aiBehaviorCategories: { version: AI_CATEGORY_SCHEMA_VERSION, categories: createDefaultAIBehaviorCategories() },
  aiBehaviorCategoriesVersion: 0,

  tankLibrary: [],
  otherLibrary: [],

  projectileDesigns: [],
  turretPresets: [],

  playerId: 'player-main',

  manhuntLeaderId: null,

  leaderboardVersion: 0,

  autoSubTurretEditMode: false,
  autoSubTurretParentId: null,
  autoSubTurretEditing: { ...DEFAULT_TURRET_CONFIG },
  autoSubTurretSelectedId: null,
  autoSubTurretSelectMode: false,
  autoSubTurretMirrorMode: false,
  autoSubTurretSnapPlacement: false,
  autoSubTurretSnapPlacementCount: 0,
  autoSubTurretAutoPlacement: false,
  autoSubTurretAutoPlacementCount: 1,
  autoSubTurretInheritMode: false,
  autoSubTurretInheritTargetId: null,

  savedEditingTurretBeforeAutoMode: null,
  savedEditingTurretBeforePick: null,
  savedAutoSubEditingBeforePick: null,
};

export interface MovementPersonality {
  preferredDistance: number;
  aggressiveness: number;
  circlePreference: number;
  unpredictability: number;
  nextBehaviorChange: number;
  currentMovementBias: number;
  navigationAccuracy: number;
  holdCommitment: number;
}

const AI_CONSTANTS_DEF = {
  GROUP_LEADER_RADIUS_FOV_FRAC: 0.7,
  GROUP_REGROUP_RELEASE_FRAC: 0.65,
  GROUP_REGROUP_RETARGET_MS: 1200,
  MAX_TURN_SPEED: 4.5,
  AIM_SMOOTHING: 0.18,
  MOVEMENT_NOISE: 0.3,
  STRAFE_VARIATION: 0.5,
  PREFERRED_DISTANCE_MIN: 250,
  PREFERRED_DISTANCE_MAX: 450,
  FEAR_LEVEL_THRESHOLD: 80,
  FEAR_ENEMY_LEVEL_THRESHOLD: 10,
  FEAR_DAMAGE_RATIO: 10,
  FEAR_HP_THRESHOLD: 0.95,
  FEAR_DAMAGE_WINDOW: 3000,
  FEAR_HEAT_DECAY_RATE: 4,
  FEAR_HEAT_DAMAGE_SCALE: 100,
  FEAR_HEAT_FLEE_THRESHOLD: 75,
  FEAR_HEAT_FLEE_CHANCE_PER_SEC: 0.5,
  FEAR_HEAT_DISTANCE_SCALE: 2.0,
  FEAR_HEAT_RETREAT_SCALE: 1.5,
  FEAR_HEAT_FORCE_FLEE_THRESHOLD: 80,
  FEAR_HEAT_SUPPRESS_RUSH: 50,
  FEAR_CORNERED_RANGE_MULT: 0.5,
  FOV_BASE_VISIBLE: 13.25,
  FOV_GROWTH: 0.5,
  FOV_HYSTERESIS: 1.05,
  NEUTRAL_AGGRO_THRESHOLD: 0.10,
  FRIENDLY_AGGRO_THRESHOLD: 0.05,
  REVIVAL_DELAY_MIN: 3000,
  REVIVAL_DELAY_MAX: 10000,
  ENEMY_XP_BASE: 10,
  ENEMY_XP_PER_LEVEL: 2,
  AVOIDANCE_SHAPE_RADIUS: 80,
  AVOIDANCE_BODY_RADIUS: 100,
  AVOIDANCE_STRENGTH: 0.5,
  AVOIDANCE_FALLOFF: 2.0,
  STEERING_SLOTS: 8,
  DANGER_WEIGHT: 1.8,
  INTEREST_WEIGHT: 1.0,
  DISTANCE_VARIANCE: 150,
  MINIMUM_ATTACK_DISTANCE: 180,
  BEHAVIOR_CHANGE_INTERVAL_MIN: 1500,
  BEHAVIOR_CHANGE_INTERVAL_MAX: 4000,
  CIRCLE_STRAFE_CHANCE: 0.4,
  UNPREDICTABILITY_MIN: 0.1,
  UNPREDICTABILITY_MAX: 0.4,
  MOVEMENT_BIAS_RANGE: 0.5,
  NAV_WALL_DANGER_STRENGTH: 0.7,
  NAV_WALL_PROBE_RANGE: 5,
  NAV_ROCK_AVOIDANCE_RADIUS: 120,
  NAV_FLOW_FIELD_BLEND: 0.6,
  PURSUIT_WP_TIMEOUT_MS: 2500,
  PURSUIT_WP_ARRIVE_FRAC: 0.4,
  PURSUIT_WP_SRC_SHIFT_CELLS: 2,
  PURSUIT_WP_MARCH_CELLS: 1.6,
  PURSUIT_WP_COMMIT_DOT: 0.25,
  PURSUIT_WP_ESCAPE_COMMIT_MS: 1500,
  PURSUIT_WP_STALL_MS: 400,
  PURSUIT_WEAVE_MIN_PROGRESS: 0.08,
  PURSUIT_WEAVE_PREV_BONUS: 0.06,
  PURSUIT_PATH_MAX_CELLS: 24,
  PURSUIT_PATH_CLEAR_MARGIN: 10,
  PURSUIT_PATH_ON_POINT_EPS: 12,
  FOLLOW_MOUTH_RANGE_FRAC: 0.9,
  FOLLOW_VACUOUS_PLAN_LIMIT: 3,
  PURSUIT_NODE_CLAMP_CELLS: 3,
  FARM_TANGENT_WEIGHT: 0,
  MUZZLE_FIRE_LOS: 1,
  MUZZLE_WALL_CROSS_FRAC: 0.5,
  MUZZLE_SHARE_BAR: 0,
  PEEK_COMMIT: 1,
  PEEK_COMMIT_SHARE: 1.0,
  PEEK_RELEASE: 1,
  PEEK_RELEASE_MS: 1000,
  PEEK_RELEASE_COOLDOWN_MS: 800,
  FIRE_EXIT_SPAN: 0,
  FIRE_HONESTY_WIDE: 0,
  FIRE_EXIT_RELEASE: 0,
  FIRE_EXIT_NOKILL: 0,
  SHOT_ATTRIB: 0,
  PEEK_DUCK_MS: 350,
  PEEK_DUCK_CD_MS: 1400,
  PEEK_DUCK_WEIGHT: 0.25,
  PEEK_SIDESTEP: 1,
  PEEK_SIDESTEP_PROBE: 1.0,

  PEEK_SIDESTEP_CLAMP: 0.05,
  PEEK_SIDESTEP_HOLD_MS: 700,
  FIRE_HONESTY_AUTOSPIN: 0,
  FIRE_HONESTY_OFFAIM_COS: 0.966,
  FIRE_BARREL_HONESTY: 0,
  OPPORTUNIST_SHAPE_FRAC: 0.6,
  PURSUIT_YIELD: 0,
  PURSUIT_YIELD_GATE_CELLS: 2.5,
  PURSUIT_YIELD_RELEASE_CELLS: 5,
  PURSUIT_YIELD_STALL_MS: 1200,
  PURSUIT_YIELD_PROGRESS_UNITS: 20,
  PURSUIT_YIELD_RETRY_MS: 2000,
  FARM_AIM_THROUGH_COVER: 1,
  ATTACK_AIM_THROUGH_COVER: 1,
  CHASE_HANDBACK_RANGE: 1,
  PURSUIT_YIELD_SETTLE: 1,
  PURSUIT_YIELD_RELEASE_RETRY_MS: 1000,

  CORNERFIRE_MOVE: 0,
  CORNERFIRE_GAP_MS: 500,
  CORNERFIRE_DRY_MS: 6000,
  AIM_MOUNT_EXACT: 1,
  TURN_FEED_FORWARD: 1,
  TURN_FEED_FORWARD_MAX_RAD_S: 25.0,
  CHASE_AIM_THROTTLED: 1,
  PURSUIT_YIELD_MAX_MS: 3000,
  AIM_REACTION_MS: 200,
  AIM_REACTION_SWITCH_HOLD: 1,
  AIM_REACTION_REARM_MS: 600,
  AIM_SELF_MOTION: 0,
  AIM_FLIGHT_DECEL: 1,
  AIM_GUN_TRUTH: 1,

  AIM_SHARPEN: 1,
  AIM_SHARPEN_MAX: 0.75,
  AIM_PLAYER_VEL_TRUTH: 1,
  AIM_REACTION_SAMPLE_MS: 25,
  PATH_DETOUR_FREE: 1.8,
  PATH_DETOUR_CAP: 4,
  PATH_SCORE_INTERVAL_MS: 500,
  PATH_SWITCH_FRAC: 0.95,

  FLEE_LOOKAHEAD_CELLS: 6,
  FLEE_LOOKAHEAD_INFL_CELLS: 1.5,
  FLEE_LOOKAHEAD_WEIGHT: 2.0,
  FLEE_REROUTE: 1,
  FLEE_REROUTE_HUNTED: 1,
  FLEE_REROUTE_AHEAD_DOT: -0.3,
  FLEE_REROUTE_COOLDOWN_MS: 1500,
  FLEE_DEADEND_AVOID: 1,
  FLEE_DEADEND_AVOID_WEIGHT: 3.0,
  FLEE_DEADEND_AVOID_CAP: 4,
  FLEE_DEADEND_COMMIT_MS: 2500,
  FLEE_DEADEND_PERP: 1,
  FLEE_DEADEND_TRAPPED: 1,
  FLEE_STAND_POWER: 1,
  FLEE_STAND_POWER_MAX: 1.25,
  FEAR_REARM_COOLDOWN: 1,
  MULTI_AREA_ANY_MODE: 1,
  BORDER_SQUEEZE: 1,
  BORDER_SQUEEZE_MARGIN: 15,
  BORDER_SQUEEZE_TIMEOUT_MS: 6000,
  BORDER_SQUEEZE_COOLDOWN_MS: 4500,
  BORDER_BAND_PEN: EDGE_ARRAS !== 0 ? 120.4 : 101.7,
  PRIORITY_ENGAGE_BAR_VISIBLE: 0.55,
  PRIORITY_ENGAGE_BAR_HIDDEN: 0.85,
  PRIORITY_ENGAGE_GAP_BONUS: 0.35,
  PRIORITY_ENGAGE_BAR_MAX: 0.95,
  PRIORITY_PROVOKED_MS: 7000,
  PROVOKE_SHIELD: 1,
  PROVOKE_RETALIATE: 1,
  PROVOKE_RETALIATE_MAX_GAP: 1,
  STALK_REACT: 1,
  STALK_LINGER_MS: 700,
  FLEE_LEGACY_COMMIT: 1,
  FLEE_LEGACY_LINGER_MS: 700,
  DREAD_TARGET_PER_GAP: 45,
  DREAD_RISE_PER_SEC: 25,
  TIER_TARGET_PENALTY: 2.0,
  ROAM_THREAT_AVOID_WEIGHT: 0.15,
  BASEFEAR_ROAM_AVOID: 0.9,
  BASEFEAR_WAYPOINT_AVOID: 1,
  BASEFEAR_ROUTE_BLOCK_MS: 4000,
  BASEFEAR_FARM_AVOID: 1,
  BASEFEAR_GUARD_FLEE: 1,
  SAFEZONE_TARGET: 1,
  SAFEZONE_ESCAPE: 1,
  SAFEZONE_BACKOFF: 1,
  SAFEZONE_FIGHT_LEAN: 1,
  SAFEZONE_BAND_CELLS: 1,
  SAFEZONE_ACQUIRE_CELLS: 2,
  SAFEZONE_BACKOFF_MS: 30000,
  RAM_MARGIN_RECKLESS: 1.15,
  RAM_MARGIN_CAUTIOUS: 2.5,
  RAM_OUTMATCHED_DREAD: 55,
  RAM_VETO_RESTORES_FLEE: 1,
  KNOWN_THREAT_TTL_MS: 2000,
  THREAT_SCAN_RADIUS: 700,
  THREAT_REACT_MS_MIN: 90,
  THREAT_REACT_MS_MAX: 220,
  THREAT_HORIZON_MS: 1400,
  THREAT_DODGE_MAX_DEV: 1.0,
  THREAT_DODGE_GAIN: 1,
  THREAT_SEVERITY_FLOOR_FRAC: 0.012,
  THREAT_SIDE_SWITCH_MARGIN: 1.35,
  THREAT_RAM_DODGE_SCALE: 0.15,
  THREAT_COMMIT_MS: 400,
  THREAT_CHASE_EVADE_MS: 650,
  THREAT_TRAP_CLEAR: 1,
  THREAT_DRONE_OBSTACLE: 1,
  BODY_TAN_COARSE: 1,
  THREAT_DRONE_GRID: 1,
  THREAT_DRONE_SIDE_MARGIN: 1.35,
  THREAT_DRONE_GROUP: 1,
  THREAT_AIM_GIVEUP_MS: 1200,
  THREAT_AIM_CONE_RAD: 0.05,
  THREAT_GUN_SWITCH_MARGIN: 1.35,
  THREAT_CRASHER: 1,
  AUTO_TURRET_INTERCEPT: 1,
  AUTO_TURRET_LEAD: 1,
  AUTO_TURRET_EASE_IN: 1,
  AUTO_TURRET_TARGET_HOLD: 1,
  AUTO_TURRET_TURN_LIMIT: 1,
  AUTO_TURRET_ARRIVAL_FILTER: 1,
  PRESS_POLICY: 1,
  PRESS_START_MS: 8000,
  PRESS_FULL_MS: 20000,
  PRESS_RECENT_DMG_MS: 2000,
  PRESS_DECAY_MULT: 2,
  PRESS_FLOOR_MARGIN: 60,
  PRESS_FLOOR_FRAC: 0.35,
  PRESS_REF_DIST: 350,
  PRESS_SCALE_CAP: 1.25,
  PRESS_SPOT_CONTACT_AT: 0.5,
  PRESS_RETREAT_SUPPRESS_AT: 0.75,
  PRESS_FEAR_CUTOFF: 75,
  STANDOFF_REACH: 1,
  STANDOFF_MAX_FRAC: 0.85,
  STANDOFF_MIN_FRAC: 0,
  STANDOFF_PUSH_LOS: 1,
  STANDOFF_PUSH_MAX: 2,
  STANDOFF_EYE_KEEP: 0.9,
  STANDOFF_BAND_FIX: 1,
  STANDOFF_BAND_MIN: 85,
  MOUNTED_MAX_ALIVE: 1,

  LAYER_IDENTITY_UNIFY: 1,

  PROJ_FRICTION_LIVE: 1,
  STANDOFF_EYE_LAST: 1,
  FIRE_VACATE: 1,
  ROLE_SENSE: 1,
  ROLE_PLAYER_HUNT: 1,
  ROLE_LEVEL_WEIGHT: 0,
  ROLE_SP_WEIGHT: 1,
  ROLE_GROWTH_WEIGHT: 0.5,
  ROLE_BOSS_MULT: 2,
  ROLE_AGGRESS_BAR: 1.15,
  ROLE_PROTECT_BAR: 0.85,
  ROLE_WITHDRAW: 1,
  ROLE_WITHDRAW_FULL_AT: 0.4,
  ROLE_WITHDRAW_BAND_GAIN: 1,
  ROLE_WITHDRAW_MIN_THRUST: 0.03,
  ROLE_WITHDRAW_MAX_THRUST: 0.11,
  ROLE_WITHDRAW_FEATHER_FRAC: 0.5,
  ROLE_WITHDRAW_STALL_MS: 1200,
  ROLE_WITHDRAW_CORNER_MS: 2500,
  ROLE_WITHDRAW_ORBIT_KEEP: 0.5,
  PATHBLOCK_SENSE: 1,
  PATHBLOCK_POWER_MAX: 1.75,
  PATHBLOCK_LOOKAHEAD_CELLS: 3,
  PATHBLOCK_HOLD_MS: 600,
  PATHBLOCK_BERTH: 1,
  PATHBLOCK_BERTH_RADII: 1.2,
  PATHBLOCK_ROUTE: 1,
  PATHBLOCK_ROUTE_WEIGHT: 2.0,
  PATHBLOCK_AIM: 1,
  CHASE_SPEED_FUTILE: 1,
  CHASE_FUTILE_STALL_MS: 2500,
  CHASE_FUTILE_PROGRESS_FRAC: 0.05,
  CHASE_FUTILE_HIT_GRACE_MS: 4000,
  CHASE_ANCHOR_BREAK_MS: 500,
  CHASE_FUTILE_ROUTE_GRACE: 1,
  CHASE_FUTILE_COOLDOWN_MS: 3000,
  SEEN_RULE: 1,
  INVIS_RECOIL_REVEAL: 1,
  GHOST_PERCEPTION: 1,
  GHOST_FAMILY: 1,
  GHOST_PORTAL: 1,
  GHOST_BOT: 1,
  NOPVP_PROJ_INERT: 1,
  FLEE_EGG_SKIP: 1,
  FIRE_WITH_TANK: 1,
  CAP_HULL_ONLY: 1,
  CHARGE_AI: 1,
  ARENA_CLOSER_AI: 1,
  HEALER_AI: 1,
  HEAL_SEEK_HP_FRAC: 0.85,
  HEAL_COMMIT_MS: 8000,
  HEAL_DECISION_COOLDOWN_MS: 1500,
  ASSIST_DECISION_COOLDOWN_MS: 2500,
  ASSIST_COMMIT_MS: 6000,
  ASSIST_DISTRESS_HEAT: 30,
  ASSIST_DISTRESS_HP_FRAC: 0.5,
  NAV_EXACT_PUMP_FRAME_FRAC: 0.2,
  NAV_EXACT_PUMP_MAX_MS: 3,
  NAV_EXACT_PUMP_MIN_MS: 0.5,
  NAV_LOS_CHECK_INTERVAL: 12,
  NAV_STUCK_CHECK_MS: 500,
  NAV_STUCK_THRESHOLD: 15,
  NAV_STUCK_REF_SPEED: 3,
  NAV_STUCK_LONG_MS: 2800,
  NAV_STUCK_LONG_DIST: 28,
  PURSUIT_SIGHT_BAND: 400,
  PURSUIT_WP_REV_HOLD_MS: 1200,
  PURSUIT_REV_FREE_STREAK: 1,
  PURSUIT_REV_STREAK_BREAK_MS: 2400,
  AI_THROTTLE_MS: 50,
  NAV_STUCK_ESCAPE_FRAMES: 60,
  NAV_MISTAKE_BASE_CHANCE: 0.08,
  NAV_MISTAKE_STRESS_MULT: 2.0,
  SHAPE_TARGET_MAX_DIST: 500,
  SHAPE_PREFER_CLOSER_RATIO: 0.6,
  TARGET_MEMORY_DURATION: 4000,
  ATTACKING_LOS_HYSTERESIS: 500,
  SWITCH_SIGHT_MS: 300,
  COMBAT_HOLD_MIN_MS: 600,
  COMBAT_HOLD_MAX_MS: 1200,
  COMBAT_HOLD_RETREAT_MIN_MS: 400,
  COMBAT_HOLD_RETREAT_MAX_MS: 900,
  RETREAT_TRIGGER_DIST: 220,
  COMBAT_DIR_LERP_RATE: 10,
  RETREAT_SPEED_MULT: 0.11,
  DIST_HOLD_DEADBAND: 35,
  DIST_HOLD_RAMP: 100,
  DIST_HOLD_D_GAIN: 1.2,
  DIST_HOLD_TANGENT_WEIGHT: 0.45,
  FOLLOW_MAX_DURATION_MIN: 4000,
  FOLLOW_MAX_DURATION_MAX: 8000,
  FOLLOW_SPEED_MULT: 0.11,
  DEAD_END_ESCAPE_DEPTH: 2,
  TRAVEL_TIMEOUT_MS: 45000,
  TRAVEL_ARRIVE_DWELL_MIN_MS: 12000,
  TRAVEL_ARRIVE_DWELL_MAX_MS: 30000,
  TRAVEL_REPICK_COOLDOWN_MS: 2500,
  TRAVEL_GOAL_BLOCKED_MS: 30000,
  TRAVEL_WAYPOINT_MS: 400,
  TRAVEL_WAYPOINT_CELLS: 1.6,
  TRAVEL_FAMILIARITY_GAIN: 12,
  TRAVEL_FAMILIARITY_MS: 1000,
  TRAVEL_FAMILIARITY_DECAY: 1,
  TRAVEL_DISTANCE_BIAS: 0.45,
  HOME_DWELL_MIN_MS: 2000,
  HOME_DWELL_MAX_MS: 9000,
  HOME_COMMUTE_BACKWARD_DOT: -0.2,
  HOME_COMMUTE_GRAB_CELLS: 0.55,
  PORTAL_SEEK_CHANCE: 0.8,
  PORTAL_SEEK_CHANCE_TO_MAZE: 0.8,
  PORTAL_SEEK_CHANCE_TO_MAIN: 0.5,
  PORTAL_SEEK_CHANCE_TO_FORGE: 1.0,
  PORTAL_SEEK_CHANCE_FROM_FORGE: 1.0,
  PORTAL_SEEK_RECONSIDER_MS: 30000,
  PORTAL_SEEK_TIMEOUT_MS: 12000,
  PORTAL_SEEK_SCAN_INTERVAL_MS: 1000,
  AUTOSPIN_HUMAN: 1,
};
const AI_CONST_OFF: boolean = (typeof location !== 'undefined' && /[?&]oldaiconst(?:[=&]|$)/.test(location.search))
  || (typeof process !== 'undefined' && !!process.env && process.env.ISTRONG_OLD_AICONST === '1');
function AiConstantsShell(this: typeof AI_CONSTANTS_DEF, s: typeof AI_CONSTANTS_DEF): void {
  this.GROUP_LEADER_RADIUS_FOV_FRAC = s.GROUP_LEADER_RADIUS_FOV_FRAC;
  this.GROUP_REGROUP_RELEASE_FRAC = s.GROUP_REGROUP_RELEASE_FRAC;
  this.GROUP_REGROUP_RETARGET_MS = s.GROUP_REGROUP_RETARGET_MS;
  this.MAX_TURN_SPEED = s.MAX_TURN_SPEED;
  this.AIM_SMOOTHING = s.AIM_SMOOTHING;
  this.MOVEMENT_NOISE = s.MOVEMENT_NOISE;
  this.STRAFE_VARIATION = s.STRAFE_VARIATION;
  this.PREFERRED_DISTANCE_MIN = s.PREFERRED_DISTANCE_MIN;
  this.PREFERRED_DISTANCE_MAX = s.PREFERRED_DISTANCE_MAX;
  this.FEAR_LEVEL_THRESHOLD = s.FEAR_LEVEL_THRESHOLD;
  this.FEAR_ENEMY_LEVEL_THRESHOLD = s.FEAR_ENEMY_LEVEL_THRESHOLD;
  this.FEAR_DAMAGE_RATIO = s.FEAR_DAMAGE_RATIO;
  this.FEAR_HP_THRESHOLD = s.FEAR_HP_THRESHOLD;
  this.FEAR_DAMAGE_WINDOW = s.FEAR_DAMAGE_WINDOW;
  this.FEAR_HEAT_DECAY_RATE = s.FEAR_HEAT_DECAY_RATE;
  this.FEAR_HEAT_DAMAGE_SCALE = s.FEAR_HEAT_DAMAGE_SCALE;
  this.FEAR_HEAT_FLEE_THRESHOLD = s.FEAR_HEAT_FLEE_THRESHOLD;
  this.FEAR_HEAT_FLEE_CHANCE_PER_SEC = s.FEAR_HEAT_FLEE_CHANCE_PER_SEC;
  this.FEAR_HEAT_DISTANCE_SCALE = s.FEAR_HEAT_DISTANCE_SCALE;
  this.FEAR_HEAT_RETREAT_SCALE = s.FEAR_HEAT_RETREAT_SCALE;
  this.FEAR_HEAT_FORCE_FLEE_THRESHOLD = s.FEAR_HEAT_FORCE_FLEE_THRESHOLD;
  this.FEAR_HEAT_SUPPRESS_RUSH = s.FEAR_HEAT_SUPPRESS_RUSH;
  this.FEAR_CORNERED_RANGE_MULT = s.FEAR_CORNERED_RANGE_MULT;
  this.FOV_BASE_VISIBLE = s.FOV_BASE_VISIBLE;
  this.FOV_GROWTH = s.FOV_GROWTH;
  this.FOV_HYSTERESIS = s.FOV_HYSTERESIS;
  this.NEUTRAL_AGGRO_THRESHOLD = s.NEUTRAL_AGGRO_THRESHOLD;
  this.FRIENDLY_AGGRO_THRESHOLD = s.FRIENDLY_AGGRO_THRESHOLD;
  this.REVIVAL_DELAY_MIN = s.REVIVAL_DELAY_MIN;
  this.REVIVAL_DELAY_MAX = s.REVIVAL_DELAY_MAX;
  this.ENEMY_XP_BASE = s.ENEMY_XP_BASE;
  this.ENEMY_XP_PER_LEVEL = s.ENEMY_XP_PER_LEVEL;
  this.AVOIDANCE_SHAPE_RADIUS = s.AVOIDANCE_SHAPE_RADIUS;
  this.AVOIDANCE_BODY_RADIUS = s.AVOIDANCE_BODY_RADIUS;
  this.AVOIDANCE_STRENGTH = s.AVOIDANCE_STRENGTH;
  this.AVOIDANCE_FALLOFF = s.AVOIDANCE_FALLOFF;
  this.STEERING_SLOTS = s.STEERING_SLOTS;
  this.DANGER_WEIGHT = s.DANGER_WEIGHT;
  this.INTEREST_WEIGHT = s.INTEREST_WEIGHT;
  this.DISTANCE_VARIANCE = s.DISTANCE_VARIANCE;
  this.MINIMUM_ATTACK_DISTANCE = s.MINIMUM_ATTACK_DISTANCE;
  this.BEHAVIOR_CHANGE_INTERVAL_MIN = s.BEHAVIOR_CHANGE_INTERVAL_MIN;
  this.BEHAVIOR_CHANGE_INTERVAL_MAX = s.BEHAVIOR_CHANGE_INTERVAL_MAX;
  this.CIRCLE_STRAFE_CHANCE = s.CIRCLE_STRAFE_CHANCE;
  this.UNPREDICTABILITY_MIN = s.UNPREDICTABILITY_MIN;
  this.UNPREDICTABILITY_MAX = s.UNPREDICTABILITY_MAX;
  this.MOVEMENT_BIAS_RANGE = s.MOVEMENT_BIAS_RANGE;
  this.NAV_WALL_DANGER_STRENGTH = s.NAV_WALL_DANGER_STRENGTH;
  this.NAV_WALL_PROBE_RANGE = s.NAV_WALL_PROBE_RANGE;
  this.NAV_ROCK_AVOIDANCE_RADIUS = s.NAV_ROCK_AVOIDANCE_RADIUS;
  this.NAV_FLOW_FIELD_BLEND = s.NAV_FLOW_FIELD_BLEND;
  this.PURSUIT_WP_TIMEOUT_MS = s.PURSUIT_WP_TIMEOUT_MS;
  this.PURSUIT_WP_ARRIVE_FRAC = s.PURSUIT_WP_ARRIVE_FRAC;
  this.PURSUIT_WP_SRC_SHIFT_CELLS = s.PURSUIT_WP_SRC_SHIFT_CELLS;
  this.PURSUIT_WP_MARCH_CELLS = s.PURSUIT_WP_MARCH_CELLS;
  this.PURSUIT_WP_COMMIT_DOT = s.PURSUIT_WP_COMMIT_DOT;
  this.PURSUIT_WP_ESCAPE_COMMIT_MS = s.PURSUIT_WP_ESCAPE_COMMIT_MS;
  this.PURSUIT_WP_STALL_MS = s.PURSUIT_WP_STALL_MS;
  this.PURSUIT_WEAVE_MIN_PROGRESS = s.PURSUIT_WEAVE_MIN_PROGRESS;
  this.PURSUIT_WEAVE_PREV_BONUS = s.PURSUIT_WEAVE_PREV_BONUS;
  this.PURSUIT_PATH_MAX_CELLS = s.PURSUIT_PATH_MAX_CELLS;
  this.PURSUIT_PATH_CLEAR_MARGIN = s.PURSUIT_PATH_CLEAR_MARGIN;
  this.PURSUIT_PATH_ON_POINT_EPS = s.PURSUIT_PATH_ON_POINT_EPS;
  this.FOLLOW_MOUTH_RANGE_FRAC = s.FOLLOW_MOUTH_RANGE_FRAC;
  this.FOLLOW_VACUOUS_PLAN_LIMIT = s.FOLLOW_VACUOUS_PLAN_LIMIT;
  this.PURSUIT_NODE_CLAMP_CELLS = s.PURSUIT_NODE_CLAMP_CELLS;
  this.FARM_TANGENT_WEIGHT = s.FARM_TANGENT_WEIGHT;
  this.MUZZLE_FIRE_LOS = s.MUZZLE_FIRE_LOS;
  this.MUZZLE_WALL_CROSS_FRAC = s.MUZZLE_WALL_CROSS_FRAC;
  this.MUZZLE_SHARE_BAR = s.MUZZLE_SHARE_BAR;
  this.PEEK_COMMIT = s.PEEK_COMMIT;
  this.PEEK_COMMIT_SHARE = s.PEEK_COMMIT_SHARE;
  this.PEEK_RELEASE = s.PEEK_RELEASE;
  this.PEEK_RELEASE_MS = s.PEEK_RELEASE_MS;
  this.PEEK_RELEASE_COOLDOWN_MS = s.PEEK_RELEASE_COOLDOWN_MS;
  this.FIRE_EXIT_SPAN = s.FIRE_EXIT_SPAN;
  this.FIRE_HONESTY_WIDE = s.FIRE_HONESTY_WIDE;
  this.FIRE_EXIT_RELEASE = s.FIRE_EXIT_RELEASE;
  this.FIRE_EXIT_NOKILL = s.FIRE_EXIT_NOKILL;
  this.SHOT_ATTRIB = s.SHOT_ATTRIB;
  this.PEEK_DUCK_MS = s.PEEK_DUCK_MS;
  this.PEEK_DUCK_CD_MS = s.PEEK_DUCK_CD_MS;
  this.PEEK_DUCK_WEIGHT = s.PEEK_DUCK_WEIGHT;
  this.PEEK_SIDESTEP = s.PEEK_SIDESTEP;
  this.PEEK_SIDESTEP_PROBE = s.PEEK_SIDESTEP_PROBE;
  this.PEEK_SIDESTEP_CLAMP = s.PEEK_SIDESTEP_CLAMP;
  this.PEEK_SIDESTEP_HOLD_MS = s.PEEK_SIDESTEP_HOLD_MS;
  this.FIRE_HONESTY_AUTOSPIN = s.FIRE_HONESTY_AUTOSPIN;
  this.FIRE_HONESTY_OFFAIM_COS = s.FIRE_HONESTY_OFFAIM_COS;
  this.FIRE_BARREL_HONESTY = s.FIRE_BARREL_HONESTY;
  this.OPPORTUNIST_SHAPE_FRAC = s.OPPORTUNIST_SHAPE_FRAC;
  this.PURSUIT_YIELD = s.PURSUIT_YIELD;
  this.PURSUIT_YIELD_GATE_CELLS = s.PURSUIT_YIELD_GATE_CELLS;
  this.PURSUIT_YIELD_RELEASE_CELLS = s.PURSUIT_YIELD_RELEASE_CELLS;
  this.PURSUIT_YIELD_STALL_MS = s.PURSUIT_YIELD_STALL_MS;
  this.PURSUIT_YIELD_PROGRESS_UNITS = s.PURSUIT_YIELD_PROGRESS_UNITS;
  this.PURSUIT_YIELD_RETRY_MS = s.PURSUIT_YIELD_RETRY_MS;
  this.FARM_AIM_THROUGH_COVER = s.FARM_AIM_THROUGH_COVER;
  this.ATTACK_AIM_THROUGH_COVER = s.ATTACK_AIM_THROUGH_COVER;
  this.CHASE_HANDBACK_RANGE = s.CHASE_HANDBACK_RANGE;
  this.PURSUIT_YIELD_SETTLE = s.PURSUIT_YIELD_SETTLE;
  this.PURSUIT_YIELD_RELEASE_RETRY_MS = s.PURSUIT_YIELD_RELEASE_RETRY_MS;
  this.CORNERFIRE_MOVE = s.CORNERFIRE_MOVE;
  this.CORNERFIRE_GAP_MS = s.CORNERFIRE_GAP_MS;
  this.CORNERFIRE_DRY_MS = s.CORNERFIRE_DRY_MS;
  this.AIM_MOUNT_EXACT = s.AIM_MOUNT_EXACT;
  this.TURN_FEED_FORWARD = s.TURN_FEED_FORWARD;
  this.TURN_FEED_FORWARD_MAX_RAD_S = s.TURN_FEED_FORWARD_MAX_RAD_S;
  this.CHASE_AIM_THROTTLED = s.CHASE_AIM_THROTTLED;
  this.PURSUIT_YIELD_MAX_MS = s.PURSUIT_YIELD_MAX_MS;
  this.AIM_REACTION_MS = s.AIM_REACTION_MS;
  this.AIM_REACTION_SWITCH_HOLD = s.AIM_REACTION_SWITCH_HOLD;
  this.AIM_REACTION_REARM_MS = s.AIM_REACTION_REARM_MS;
  this.AIM_SELF_MOTION = s.AIM_SELF_MOTION;
  this.AIM_FLIGHT_DECEL = s.AIM_FLIGHT_DECEL;
  this.AIM_GUN_TRUTH = s.AIM_GUN_TRUTH;
  this.AIM_SHARPEN = s.AIM_SHARPEN;
  this.AIM_SHARPEN_MAX = s.AIM_SHARPEN_MAX;
  this.AIM_PLAYER_VEL_TRUTH = s.AIM_PLAYER_VEL_TRUTH;
  this.AIM_REACTION_SAMPLE_MS = s.AIM_REACTION_SAMPLE_MS;
  this.PATH_DETOUR_FREE = s.PATH_DETOUR_FREE;
  this.PATH_DETOUR_CAP = s.PATH_DETOUR_CAP;
  this.PATH_SCORE_INTERVAL_MS = s.PATH_SCORE_INTERVAL_MS;
  this.PATH_SWITCH_FRAC = s.PATH_SWITCH_FRAC;
  this.FLEE_LOOKAHEAD_CELLS = s.FLEE_LOOKAHEAD_CELLS;
  this.FLEE_LOOKAHEAD_INFL_CELLS = s.FLEE_LOOKAHEAD_INFL_CELLS;
  this.FLEE_LOOKAHEAD_WEIGHT = s.FLEE_LOOKAHEAD_WEIGHT;
  this.FLEE_REROUTE = s.FLEE_REROUTE;
  this.FLEE_REROUTE_HUNTED = s.FLEE_REROUTE_HUNTED;
  this.FLEE_REROUTE_AHEAD_DOT = s.FLEE_REROUTE_AHEAD_DOT;
  this.FLEE_REROUTE_COOLDOWN_MS = s.FLEE_REROUTE_COOLDOWN_MS;
  this.FLEE_DEADEND_AVOID = s.FLEE_DEADEND_AVOID;
  this.FLEE_DEADEND_AVOID_WEIGHT = s.FLEE_DEADEND_AVOID_WEIGHT;
  this.FLEE_DEADEND_AVOID_CAP = s.FLEE_DEADEND_AVOID_CAP;
  this.FLEE_DEADEND_COMMIT_MS = s.FLEE_DEADEND_COMMIT_MS;
  this.FLEE_DEADEND_PERP = s.FLEE_DEADEND_PERP;
  this.FLEE_DEADEND_TRAPPED = s.FLEE_DEADEND_TRAPPED;
  this.FLEE_STAND_POWER = s.FLEE_STAND_POWER;
  this.FLEE_STAND_POWER_MAX = s.FLEE_STAND_POWER_MAX;
  this.FEAR_REARM_COOLDOWN = s.FEAR_REARM_COOLDOWN;
  this.MULTI_AREA_ANY_MODE = s.MULTI_AREA_ANY_MODE;
  this.BORDER_SQUEEZE = s.BORDER_SQUEEZE;
  this.BORDER_SQUEEZE_MARGIN = s.BORDER_SQUEEZE_MARGIN;
  this.BORDER_SQUEEZE_TIMEOUT_MS = s.BORDER_SQUEEZE_TIMEOUT_MS;
  this.BORDER_SQUEEZE_COOLDOWN_MS = s.BORDER_SQUEEZE_COOLDOWN_MS;
  this.BORDER_BAND_PEN = s.BORDER_BAND_PEN;
  this.PRIORITY_ENGAGE_BAR_VISIBLE = s.PRIORITY_ENGAGE_BAR_VISIBLE;
  this.PRIORITY_ENGAGE_BAR_HIDDEN = s.PRIORITY_ENGAGE_BAR_HIDDEN;
  this.PRIORITY_ENGAGE_GAP_BONUS = s.PRIORITY_ENGAGE_GAP_BONUS;
  this.PRIORITY_ENGAGE_BAR_MAX = s.PRIORITY_ENGAGE_BAR_MAX;
  this.PRIORITY_PROVOKED_MS = s.PRIORITY_PROVOKED_MS;
  this.PROVOKE_SHIELD = s.PROVOKE_SHIELD;
  this.PROVOKE_RETALIATE = s.PROVOKE_RETALIATE;
  this.PROVOKE_RETALIATE_MAX_GAP = s.PROVOKE_RETALIATE_MAX_GAP;
  this.STALK_REACT = s.STALK_REACT;
  this.STALK_LINGER_MS = s.STALK_LINGER_MS;
  this.FLEE_LEGACY_COMMIT = s.FLEE_LEGACY_COMMIT;
  this.FLEE_LEGACY_LINGER_MS = s.FLEE_LEGACY_LINGER_MS;
  this.DREAD_TARGET_PER_GAP = s.DREAD_TARGET_PER_GAP;
  this.DREAD_RISE_PER_SEC = s.DREAD_RISE_PER_SEC;
  this.TIER_TARGET_PENALTY = s.TIER_TARGET_PENALTY;
  this.ROAM_THREAT_AVOID_WEIGHT = s.ROAM_THREAT_AVOID_WEIGHT;
  this.BASEFEAR_ROAM_AVOID = s.BASEFEAR_ROAM_AVOID;
  this.BASEFEAR_WAYPOINT_AVOID = s.BASEFEAR_WAYPOINT_AVOID;
  this.BASEFEAR_ROUTE_BLOCK_MS = s.BASEFEAR_ROUTE_BLOCK_MS;
  this.BASEFEAR_FARM_AVOID = s.BASEFEAR_FARM_AVOID;
  this.BASEFEAR_GUARD_FLEE = s.BASEFEAR_GUARD_FLEE;
  this.SAFEZONE_TARGET = s.SAFEZONE_TARGET;
  this.SAFEZONE_ESCAPE = s.SAFEZONE_ESCAPE;
  this.SAFEZONE_BACKOFF = s.SAFEZONE_BACKOFF;
  this.SAFEZONE_FIGHT_LEAN = s.SAFEZONE_FIGHT_LEAN;
  this.SAFEZONE_BAND_CELLS = s.SAFEZONE_BAND_CELLS;
  this.SAFEZONE_ACQUIRE_CELLS = s.SAFEZONE_ACQUIRE_CELLS;
  this.SAFEZONE_BACKOFF_MS = s.SAFEZONE_BACKOFF_MS;
  this.RAM_MARGIN_RECKLESS = s.RAM_MARGIN_RECKLESS;
  this.RAM_MARGIN_CAUTIOUS = s.RAM_MARGIN_CAUTIOUS;
  this.RAM_OUTMATCHED_DREAD = s.RAM_OUTMATCHED_DREAD;
  this.RAM_VETO_RESTORES_FLEE = s.RAM_VETO_RESTORES_FLEE;
  this.KNOWN_THREAT_TTL_MS = s.KNOWN_THREAT_TTL_MS;
  this.THREAT_SCAN_RADIUS = s.THREAT_SCAN_RADIUS;
  this.THREAT_REACT_MS_MIN = s.THREAT_REACT_MS_MIN;
  this.THREAT_REACT_MS_MAX = s.THREAT_REACT_MS_MAX;
  this.THREAT_HORIZON_MS = s.THREAT_HORIZON_MS;
  this.THREAT_DODGE_MAX_DEV = s.THREAT_DODGE_MAX_DEV;
  this.THREAT_DODGE_GAIN = s.THREAT_DODGE_GAIN;
  this.THREAT_SEVERITY_FLOOR_FRAC = s.THREAT_SEVERITY_FLOOR_FRAC;
  this.THREAT_SIDE_SWITCH_MARGIN = s.THREAT_SIDE_SWITCH_MARGIN;
  this.THREAT_RAM_DODGE_SCALE = s.THREAT_RAM_DODGE_SCALE;
  this.THREAT_COMMIT_MS = s.THREAT_COMMIT_MS;
  this.THREAT_CHASE_EVADE_MS = s.THREAT_CHASE_EVADE_MS;
  this.THREAT_TRAP_CLEAR = s.THREAT_TRAP_CLEAR;
  this.THREAT_DRONE_OBSTACLE = s.THREAT_DRONE_OBSTACLE;
  this.BODY_TAN_COARSE = s.BODY_TAN_COARSE;
  this.THREAT_DRONE_GRID = s.THREAT_DRONE_GRID;
  this.THREAT_DRONE_SIDE_MARGIN = s.THREAT_DRONE_SIDE_MARGIN;
  this.THREAT_DRONE_GROUP = s.THREAT_DRONE_GROUP;
  this.THREAT_AIM_GIVEUP_MS = s.THREAT_AIM_GIVEUP_MS;
  this.THREAT_AIM_CONE_RAD = s.THREAT_AIM_CONE_RAD;
  this.THREAT_GUN_SWITCH_MARGIN = s.THREAT_GUN_SWITCH_MARGIN;
  this.THREAT_CRASHER = s.THREAT_CRASHER;
  this.AUTO_TURRET_INTERCEPT = s.AUTO_TURRET_INTERCEPT;
  this.AUTO_TURRET_LEAD = s.AUTO_TURRET_LEAD;
  this.AUTO_TURRET_EASE_IN = s.AUTO_TURRET_EASE_IN;
  this.AUTO_TURRET_TARGET_HOLD = s.AUTO_TURRET_TARGET_HOLD;
  this.AUTO_TURRET_TURN_LIMIT = s.AUTO_TURRET_TURN_LIMIT;
  this.AUTO_TURRET_ARRIVAL_FILTER = s.AUTO_TURRET_ARRIVAL_FILTER;
  this.PRESS_POLICY = s.PRESS_POLICY;
  this.PRESS_START_MS = s.PRESS_START_MS;
  this.PRESS_FULL_MS = s.PRESS_FULL_MS;
  this.PRESS_RECENT_DMG_MS = s.PRESS_RECENT_DMG_MS;
  this.PRESS_DECAY_MULT = s.PRESS_DECAY_MULT;
  this.PRESS_FLOOR_MARGIN = s.PRESS_FLOOR_MARGIN;
  this.PRESS_FLOOR_FRAC = s.PRESS_FLOOR_FRAC;
  this.PRESS_REF_DIST = s.PRESS_REF_DIST;
  this.PRESS_SCALE_CAP = s.PRESS_SCALE_CAP;
  this.PRESS_SPOT_CONTACT_AT = s.PRESS_SPOT_CONTACT_AT;
  this.PRESS_RETREAT_SUPPRESS_AT = s.PRESS_RETREAT_SUPPRESS_AT;
  this.PRESS_FEAR_CUTOFF = s.PRESS_FEAR_CUTOFF;
  this.STANDOFF_REACH = s.STANDOFF_REACH;
  this.STANDOFF_MAX_FRAC = s.STANDOFF_MAX_FRAC;
  this.STANDOFF_MIN_FRAC = s.STANDOFF_MIN_FRAC;
  this.STANDOFF_PUSH_LOS = s.STANDOFF_PUSH_LOS;
  this.STANDOFF_PUSH_MAX = s.STANDOFF_PUSH_MAX;
  this.STANDOFF_EYE_KEEP = s.STANDOFF_EYE_KEEP;
  this.STANDOFF_BAND_FIX = s.STANDOFF_BAND_FIX;
  this.STANDOFF_BAND_MIN = s.STANDOFF_BAND_MIN;
  this.MOUNTED_MAX_ALIVE = s.MOUNTED_MAX_ALIVE;
  this.LAYER_IDENTITY_UNIFY = s.LAYER_IDENTITY_UNIFY;
  this.PROJ_FRICTION_LIVE = s.PROJ_FRICTION_LIVE;
  this.STANDOFF_EYE_LAST = s.STANDOFF_EYE_LAST;
  this.FIRE_VACATE = s.FIRE_VACATE;
  this.ROLE_SENSE = s.ROLE_SENSE;
  this.ROLE_PLAYER_HUNT = s.ROLE_PLAYER_HUNT;
  this.ROLE_LEVEL_WEIGHT = s.ROLE_LEVEL_WEIGHT;
  this.ROLE_SP_WEIGHT = s.ROLE_SP_WEIGHT;
  this.ROLE_GROWTH_WEIGHT = s.ROLE_GROWTH_WEIGHT;
  this.ROLE_BOSS_MULT = s.ROLE_BOSS_MULT;
  this.ROLE_AGGRESS_BAR = s.ROLE_AGGRESS_BAR;
  this.ROLE_PROTECT_BAR = s.ROLE_PROTECT_BAR;
  this.ROLE_WITHDRAW = s.ROLE_WITHDRAW;
  this.ROLE_WITHDRAW_FULL_AT = s.ROLE_WITHDRAW_FULL_AT;
  this.ROLE_WITHDRAW_BAND_GAIN = s.ROLE_WITHDRAW_BAND_GAIN;
  this.ROLE_WITHDRAW_MIN_THRUST = s.ROLE_WITHDRAW_MIN_THRUST;
  this.ROLE_WITHDRAW_MAX_THRUST = s.ROLE_WITHDRAW_MAX_THRUST;
  this.ROLE_WITHDRAW_FEATHER_FRAC = s.ROLE_WITHDRAW_FEATHER_FRAC;
  this.ROLE_WITHDRAW_STALL_MS = s.ROLE_WITHDRAW_STALL_MS;
  this.ROLE_WITHDRAW_CORNER_MS = s.ROLE_WITHDRAW_CORNER_MS;
  this.ROLE_WITHDRAW_ORBIT_KEEP = s.ROLE_WITHDRAW_ORBIT_KEEP;
  this.PATHBLOCK_SENSE = s.PATHBLOCK_SENSE;
  this.PATHBLOCK_POWER_MAX = s.PATHBLOCK_POWER_MAX;
  this.PATHBLOCK_LOOKAHEAD_CELLS = s.PATHBLOCK_LOOKAHEAD_CELLS;
  this.PATHBLOCK_HOLD_MS = s.PATHBLOCK_HOLD_MS;
  this.PATHBLOCK_BERTH = s.PATHBLOCK_BERTH;
  this.PATHBLOCK_BERTH_RADII = s.PATHBLOCK_BERTH_RADII;
  this.PATHBLOCK_ROUTE = s.PATHBLOCK_ROUTE;
  this.PATHBLOCK_ROUTE_WEIGHT = s.PATHBLOCK_ROUTE_WEIGHT;
  this.PATHBLOCK_AIM = s.PATHBLOCK_AIM;
  this.CHASE_SPEED_FUTILE = s.CHASE_SPEED_FUTILE;
  this.CHASE_FUTILE_STALL_MS = s.CHASE_FUTILE_STALL_MS;
  this.CHASE_FUTILE_PROGRESS_FRAC = s.CHASE_FUTILE_PROGRESS_FRAC;
  this.CHASE_FUTILE_HIT_GRACE_MS = s.CHASE_FUTILE_HIT_GRACE_MS;
  this.CHASE_ANCHOR_BREAK_MS = s.CHASE_ANCHOR_BREAK_MS;
  this.CHASE_FUTILE_ROUTE_GRACE = s.CHASE_FUTILE_ROUTE_GRACE;
  this.CHASE_FUTILE_COOLDOWN_MS = s.CHASE_FUTILE_COOLDOWN_MS;
  this.SEEN_RULE = s.SEEN_RULE;
  this.INVIS_RECOIL_REVEAL = s.INVIS_RECOIL_REVEAL;
  this.GHOST_PERCEPTION = s.GHOST_PERCEPTION;
  this.GHOST_FAMILY = s.GHOST_FAMILY;
  this.GHOST_PORTAL = s.GHOST_PORTAL;
  this.GHOST_BOT = s.GHOST_BOT;
  this.NOPVP_PROJ_INERT = s.NOPVP_PROJ_INERT;
  this.FLEE_EGG_SKIP = s.FLEE_EGG_SKIP;
  this.FIRE_WITH_TANK = s.FIRE_WITH_TANK;
  this.CAP_HULL_ONLY = s.CAP_HULL_ONLY;
  this.CHARGE_AI = s.CHARGE_AI;
  this.ARENA_CLOSER_AI = s.ARENA_CLOSER_AI;
  this.HEALER_AI = s.HEALER_AI;
  this.HEAL_SEEK_HP_FRAC = s.HEAL_SEEK_HP_FRAC;
  this.HEAL_COMMIT_MS = s.HEAL_COMMIT_MS;
  this.HEAL_DECISION_COOLDOWN_MS = s.HEAL_DECISION_COOLDOWN_MS;
  this.ASSIST_DECISION_COOLDOWN_MS = s.ASSIST_DECISION_COOLDOWN_MS;
  this.ASSIST_COMMIT_MS = s.ASSIST_COMMIT_MS;
  this.ASSIST_DISTRESS_HEAT = s.ASSIST_DISTRESS_HEAT;
  this.ASSIST_DISTRESS_HP_FRAC = s.ASSIST_DISTRESS_HP_FRAC;
  this.NAV_EXACT_PUMP_FRAME_FRAC = s.NAV_EXACT_PUMP_FRAME_FRAC;
  this.NAV_EXACT_PUMP_MAX_MS = s.NAV_EXACT_PUMP_MAX_MS;
  this.NAV_EXACT_PUMP_MIN_MS = s.NAV_EXACT_PUMP_MIN_MS;
  this.NAV_LOS_CHECK_INTERVAL = s.NAV_LOS_CHECK_INTERVAL;
  this.NAV_STUCK_CHECK_MS = s.NAV_STUCK_CHECK_MS;
  this.NAV_STUCK_THRESHOLD = s.NAV_STUCK_THRESHOLD;
  this.NAV_STUCK_REF_SPEED = s.NAV_STUCK_REF_SPEED;
  this.NAV_STUCK_LONG_MS = s.NAV_STUCK_LONG_MS;
  this.NAV_STUCK_LONG_DIST = s.NAV_STUCK_LONG_DIST;
  this.PURSUIT_SIGHT_BAND = s.PURSUIT_SIGHT_BAND;
  this.PURSUIT_WP_REV_HOLD_MS = s.PURSUIT_WP_REV_HOLD_MS;
  this.PURSUIT_REV_FREE_STREAK = s.PURSUIT_REV_FREE_STREAK;
  this.PURSUIT_REV_STREAK_BREAK_MS = s.PURSUIT_REV_STREAK_BREAK_MS;
  this.AI_THROTTLE_MS = s.AI_THROTTLE_MS;
  this.NAV_STUCK_ESCAPE_FRAMES = s.NAV_STUCK_ESCAPE_FRAMES;
  this.NAV_MISTAKE_BASE_CHANCE = s.NAV_MISTAKE_BASE_CHANCE;
  this.NAV_MISTAKE_STRESS_MULT = s.NAV_MISTAKE_STRESS_MULT;
  this.SHAPE_TARGET_MAX_DIST = s.SHAPE_TARGET_MAX_DIST;
  this.SHAPE_PREFER_CLOSER_RATIO = s.SHAPE_PREFER_CLOSER_RATIO;
  this.TARGET_MEMORY_DURATION = s.TARGET_MEMORY_DURATION;
  this.ATTACKING_LOS_HYSTERESIS = s.ATTACKING_LOS_HYSTERESIS;
  this.SWITCH_SIGHT_MS = s.SWITCH_SIGHT_MS;
  this.COMBAT_HOLD_MIN_MS = s.COMBAT_HOLD_MIN_MS;
  this.COMBAT_HOLD_MAX_MS = s.COMBAT_HOLD_MAX_MS;
  this.COMBAT_HOLD_RETREAT_MIN_MS = s.COMBAT_HOLD_RETREAT_MIN_MS;
  this.COMBAT_HOLD_RETREAT_MAX_MS = s.COMBAT_HOLD_RETREAT_MAX_MS;
  this.RETREAT_TRIGGER_DIST = s.RETREAT_TRIGGER_DIST;
  this.COMBAT_DIR_LERP_RATE = s.COMBAT_DIR_LERP_RATE;
  this.RETREAT_SPEED_MULT = s.RETREAT_SPEED_MULT;
  this.DIST_HOLD_DEADBAND = s.DIST_HOLD_DEADBAND;
  this.DIST_HOLD_RAMP = s.DIST_HOLD_RAMP;
  this.DIST_HOLD_D_GAIN = s.DIST_HOLD_D_GAIN;
  this.DIST_HOLD_TANGENT_WEIGHT = s.DIST_HOLD_TANGENT_WEIGHT;
  this.FOLLOW_MAX_DURATION_MIN = s.FOLLOW_MAX_DURATION_MIN;
  this.FOLLOW_MAX_DURATION_MAX = s.FOLLOW_MAX_DURATION_MAX;
  this.FOLLOW_SPEED_MULT = s.FOLLOW_SPEED_MULT;
  this.DEAD_END_ESCAPE_DEPTH = s.DEAD_END_ESCAPE_DEPTH;
  this.TRAVEL_TIMEOUT_MS = s.TRAVEL_TIMEOUT_MS;
  this.TRAVEL_ARRIVE_DWELL_MIN_MS = s.TRAVEL_ARRIVE_DWELL_MIN_MS;
  this.TRAVEL_ARRIVE_DWELL_MAX_MS = s.TRAVEL_ARRIVE_DWELL_MAX_MS;
  this.TRAVEL_REPICK_COOLDOWN_MS = s.TRAVEL_REPICK_COOLDOWN_MS;
  this.TRAVEL_GOAL_BLOCKED_MS = s.TRAVEL_GOAL_BLOCKED_MS;
  this.TRAVEL_WAYPOINT_MS = s.TRAVEL_WAYPOINT_MS;
  this.TRAVEL_WAYPOINT_CELLS = s.TRAVEL_WAYPOINT_CELLS;
  this.TRAVEL_FAMILIARITY_GAIN = s.TRAVEL_FAMILIARITY_GAIN;
  this.TRAVEL_FAMILIARITY_MS = s.TRAVEL_FAMILIARITY_MS;
  this.TRAVEL_FAMILIARITY_DECAY = s.TRAVEL_FAMILIARITY_DECAY;
  this.TRAVEL_DISTANCE_BIAS = s.TRAVEL_DISTANCE_BIAS;
  this.HOME_DWELL_MIN_MS = s.HOME_DWELL_MIN_MS;
  this.HOME_DWELL_MAX_MS = s.HOME_DWELL_MAX_MS;
  this.HOME_COMMUTE_BACKWARD_DOT = s.HOME_COMMUTE_BACKWARD_DOT;
  this.HOME_COMMUTE_GRAB_CELLS = s.HOME_COMMUTE_GRAB_CELLS;
  this.PORTAL_SEEK_CHANCE = s.PORTAL_SEEK_CHANCE;
  this.PORTAL_SEEK_CHANCE_TO_MAZE = s.PORTAL_SEEK_CHANCE_TO_MAZE;
  this.PORTAL_SEEK_CHANCE_TO_MAIN = s.PORTAL_SEEK_CHANCE_TO_MAIN;
  this.PORTAL_SEEK_CHANCE_TO_FORGE = s.PORTAL_SEEK_CHANCE_TO_FORGE;
  this.PORTAL_SEEK_CHANCE_FROM_FORGE = s.PORTAL_SEEK_CHANCE_FROM_FORGE;
  this.PORTAL_SEEK_RECONSIDER_MS = s.PORTAL_SEEK_RECONSIDER_MS;
  this.PORTAL_SEEK_TIMEOUT_MS = s.PORTAL_SEEK_TIMEOUT_MS;
  this.PORTAL_SEEK_SCAN_INTERVAL_MS = s.PORTAL_SEEK_SCAN_INTERVAL_MS;
  this.AUTOSPIN_HUMAN = s.AUTOSPIN_HUMAN;
}
export const AI_CONSTANTS: typeof AI_CONSTANTS_DEF = AI_CONST_OFF ? AI_CONSTANTS_DEF
  : new (AiConstantsShell as unknown as { new (s: typeof AI_CONSTANTS_DEF): typeof AI_CONSTANTS_DEF })(AI_CONSTANTS_DEF);