import {
  TurretType, ProjectileVisual, BehaviorType, MotionType, FacingType,
  ProjectileTypeConfig, DEFAULT_PROJECTILE_TYPE,
  BehaviorConfig, DEFAULT_BEHAVIOR_CONFIG,
} from '../../types';
import { MAX_ROUND_LAYERS } from '../../game/constants';
import { wasLayerTrimmed } from '../../game/ValueClamp';
import { PUMPKIN_ROCK_MIN_SIZE } from '../../game/MapEditorInput';
import { importChangesOf, importChangesWords } from '../../utils/importChanges';

export const TURRET_TYPE_LABELS: Record<TurretType, string> = {
  regular: 'Regular',
  auto: 'Auto-Turret',
  decorative: 'Decorative',
};

export const PROJECTILE_LABELS: Record<string, string> = {
  bullet: 'Bullet',
  trap: 'Trap',
  drone: 'Drone',
  swarm: 'Swarm',
  minion: 'Minion',
};

export const BEHAVIOR_LABELS: Record<BehaviorType, string> = {
  followMouse: 'Follow Mouse',
  autoTargetEnemy: 'Auto Target Enemy',
  hangNearOwner: 'Guard Near Owner',
  hangNearOwnerV2: 'Guard Near Owner v2',
  returnToOwner: 'Return to Owner',
  goToTarget: 'Go To Target',
  swarmAI: 'Swarm AI',
  patrolCircle: 'Patrol Circle',
  fleeWhenDamaged: 'Flee When Damaged',
  alwaysFire: 'Always Fire',
  spinContinuous: 'Spin Continuous',
  minionControl: 'Minion Control (LMB/RMB)',
  canRepel: 'Can Repel (Alt Fire Reverse)',
  onlyAcceptInArc: 'Only Accept In Arc',
  targetSelf: 'Target Self',
  snake: 'Snake',
  disableOnOverride: 'Disable On Override',
  scaleWithMaster: 'Scale With Master',
  stackGuns: 'Stack Guns',
  mapAltToFire: 'Map Alt To Fire',
  accelerate: 'Accelerate (Speed Up)',
  motionGlide: 'Glide (Momentum)',
  motionMotor: 'Motor (Self-propelled)',
  motionChase: 'Chase (Drone default)',
  motionSwarm: 'Swarm (Smart physics)',
  motionGrow: 'Grow (Size increase)',
  motionWithMaster: 'With Master (Aura)',
  waitToCycle: 'Wait To Cycle',
  startsLoaded: 'Starts Loaded',
  destroyOldest: 'Destroy Oldest',
  independentProjectile: 'Independent Projectile',
  invisible: 'Invisible (Stealth)',
  alwaysInvisible: 'Always Invisible',
  reverseSpinOnAlt: 'Reverse Spin (Right Click)',
};

export const BEHAVIOR_DESCRIPTIONS: Record<BehaviorType, string> = {
  followMouse: 'Steers toward mouse cursor when clicking or auto aim. With responseLag=0, tracks instantly. Only active during mouse input.',
  autoTargetEnemy: 'Auto targets nearest enemy or shape. Acts as AI fallback when user is not clicking. Sets both aim and movement goals.',
  hangNearOwner: 'Smooth orbit near owner, as classic drones fly. Timer based goal selection (~30 frames between goals). Drones flow and circle smoothly. Default for migrated tanks.',
  hangNearOwnerV2: 'Proximity based orbit near owner. Goals reset when close, creating faster/chaotic "buzzy" movement. Available for custom tanks.',
  returnToOwner: 'Boomerang. Flies out, then turns back to you halfway through its lifetime.',
  goToTarget: 'Goes to clicked position then stops. Active only when clicking.',
  swarmAI: 'Swarm drift. Lets the projectile carry on under its own power when nothing else is steering it, the way swarm drones do.',
  patrolCircle: 'Moves in circular patrol pattern',
  fleeWhenDamaged: 'Retreats behind owner when low HP',
  alwaysFire: 'Continuously fires sub turrets mounted on this projectile (e.g. missile thrusters, hive bees).',
  spinContinuous: 'Spins continuously at set speed',
  minionControl: 'Full mouse control: LMB orbits cursor point, RMB repels. Minions orbit ~250 units from target.',
  canRepel: 'Reverses direction on right click (alt fire). Drones/minions flee from cursor.',
  onlyAcceptInArc: 'Block firing outside turret FOV arc',
  targetSelf: 'Always targets own position',
  snake: 'Turns left and right like a snake while it flies, and its whole path follows. It never changes the speed of the projectile.',
  disableOnOverride: 'Fades out when player takes control',
  scaleWithMaster: 'Scales size with parent upgrades',
  stackGuns: 'Coordinates multi gun firing',
  mapAltToFire: 'Maps right click to main fire trigger',
  accelerate: 'Gradually increases speed up to a configured top speed',
  motionGlide: 'Momentum based, no active propulsion. Configurable friction decay.',
  motionMotor: 'Self propelled with gentle damping. Required for steering behaviors.',
  motionChase: 'Default drone motion: speeds up toward its goal, swings round to follow it and slows to a stop near it.',
  motionSwarm: 'Swarm physics. Curves toward its goal, turning sharper as its range runs down. Friction only trims speed above the top speed, so it never coasts to a stop.',
  motionGrow: 'Projectile size increases over time. Configurable growth rate.',
  motionWithMaster: 'Zero velocity, snaps to owner position. Aura pattern.',
  waitToCycle: 'Waits one full reload before the first shot of each burst, and again before firing after Max Alive was full.',
  startsLoaded: 'With Wait To Cycle: the first shot comes at once, without the extra full reload. The Necromancer family uses it.',
  destroyOldest: 'Automatically kills the oldest active child to make room for a new spawn when at maxAlive.',
  independentProjectile: 'Marker: projectile auto targets enemies independently without following mouse input.',
  invisible: 'Projectile fades when idle. Movement or damage breaks stealth.',
  alwaysInvisible: 'The projectile is hidden for its whole life, moving or not. Others only see it from close up, and you always see your own faintly. It still hits and hurts normally.',
  reverseSpinOnAlt: 'Fired while right click (or Shift) is held, the projectile spins the opposite way. Decided when it is fired, never in flight.',
};

export function behaviorLabel(type: string): string {
  return Object.prototype.hasOwnProperty.call(BEHAVIOR_LABELS, type) ? BEHAVIOR_LABELS[type as BehaviorType] : String(type);
}
export function behaviorDescription(type: string): string {
  return Object.prototype.hasOwnProperty.call(BEHAVIOR_DESCRIPTIONS, type) ? BEHAVIOR_DESCRIPTIONS[type as BehaviorType] : 'A behavior this version does not know. It is kept as it was saved.';
}

export const EXPLODE_LABEL = 'Explode';
export const EXPLODE_DESCRIPTION = 'Splits into smaller projectiles when it dies.';

export const LAYER_CAP_REASON = `Would pass ${MAX_ROUND_LAYERS} projectile layers`;
export const LAYER_CAP_HELP = `A gun on a tank fires layer 1, a gun riding that projectile fires layer 2, and so on, up to ${MAX_ROUND_LAYERS}.`;
export const PUMPKIN_ROCKS_ONLY_TIP = "Can't be used with Pumpkin Rocks";
export const PUMPKIN_ROCK_MIN_TOAST = `Pumpkin Rocks cannot be smaller than ${PUMPKIN_ROCK_MIN_SIZE}.`;
let _pumpkinMinToastAt = -Infinity;
export function toastPumpkinRockMin(showToast: (variant: 'success' | 'error' | 'info', message: string) => void): void {
  const now = performance.now();
  if (now - _pumpkinMinToastAt < 3000) return;
  _pumpkinMinToastAt = now;
  showToast('error', PUMPKIN_ROCK_MIN_TOAST);
}

export function withLayerCapReason(label: string): string {
  return `${label} (would pass ${MAX_ROUND_LAYERS} projectile layers)`;
}
export function layerTrimmedNotice(name: string): string {
  return `Imported "${name}". Projectile layers past ${MAX_ROUND_LAYERS} were removed.`;
}
export function importChangedNotice(name: string, file: object): string | null {
  const layers = wasLayerTrimmed(file);
  const ch = importChangesOf(file);
  const words = ch ? importChangesWords(ch, layers ? 'turrets' : undefined) : '';
  if (layers) return words ? `${layerTrimmedNotice(name)} Also changed to fit the game: ${words}.` : layerTrimmedNotice(name);
  return words ? `Imported "${name}". Changed to fit the game: ${words}.` : null;
}

export const MOTION_LABELS: Record<MotionType, string> = {
  glide: 'Glide (Momentum)',
  motor: 'Motor (Self-propelled)',
  chase: 'Chase (Drone default)',
  swarm: 'Swarm (Smart physics)',
  grow: 'Grow (Size increase)',
  withMaster: 'With Master (Aura)',
  minion: 'Minion (Guard + Orbit)',
};

export const FACING_LABELS: Record<FacingType, string> = {
  toTarget: 'Snap to Target',
  smoothToTarget: 'Smooth to Target',
  smoothWithMotion: 'Follow Motion',
  turnWithSpeed: 'Turn with Speed',
  spin: 'Continuous Spin',
  locksFacing: 'Locked on Spawn',
  primaryTurret: 'Primary Turret',
  faceTarget: 'Face Target',
  smoothFaceTarget: 'Smooth Face Target',
  faceMotion: 'Face Motion',
};

export const PROJECTILE_PRESETS: Record<ProjectileVisual, Partial<ProjectileTypeConfig>> = {
  bullet:    { shape: 0, motionType: 'glide', facingType: 'toTarget', dieAtRange: false, maxAlive: 0, statCalculatorType: 'bullet' as const },
  drone:     { shape: 3, motionType: 'chase', facingType: 'smoothToTarget', dieAtRange: false, maxAlive: 6, hitsOwnType: 'drone' as const, density: 1, statCalculatorType: 'drone' as const },
  trap:      { shape: 3, motionType: 'glide', facingType: 'turnWithSpeed', dieAtRange: true, maxAlive: 0, trapDepth: 0.67, trapCurved: false, friction: 0.05, hitsOwnType: 'push' as const, density: 2.5, bounciness: 0.9, bouncy: true, statCalculatorType: 'trap' as const },
  swarm:     { shape: 3, motionType: 'swarm', facingType: 'smoothWithMotion', dieAtRange: false, maxAlive: 0, statCalculatorType: 'swarm' as const },
  boomerang: { shape: 3, motionType: 'motor', facingType: 'spin', dieAtRange: true, maxAlive: 0 },
  hive:      { shape: 5, motionType: 'motor', facingType: 'smoothToTarget', dieAtRange: false, maxAlive: 4 },
  minion:    { shape: 0, motionType: 'minion', facingType: 'smoothToTarget', dieAtRange: false, maxAlive: 5, hitsOwnType: 'drone' as const, density: 0.4, statCalculatorType: 'drone' as const },
};

export const PROJECTILE_PRESET_BEHAVIORS: Record<ProjectileVisual, BehaviorConfig[]> = {
  bullet:    [{ ...DEFAULT_BEHAVIOR_CONFIG, type: 'motionGlide', enabled: true }],
  drone:     [
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'motionChase', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'autoTargetEnemy', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'hangNearOwner', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'followMouse', enabled: true, responseLag: 0 },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'canRepel', enabled: true },
  ],
  trap:      [{ ...DEFAULT_BEHAVIOR_CONFIG, type: 'motionGlide', enabled: true, friction: 0.05 }],
  swarm:     [
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'motionSwarm', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'autoTargetEnemy', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'swarmAI', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'followMouse', enabled: true, responseLag: 0 },
  ],
  boomerang: [
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'motionMotor', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'returnToOwner', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'spinContinuous', enabled: true },
  ],
  hive:      [
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'motionMotor', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'followMouse', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'alwaysFire', enabled: true },
  ],
  minion:    [
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'motionMotor', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'autoTargetEnemy', enabled: true, targetRange: 300 },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'hangNearOwner', enabled: true },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'minionControl', enabled: true, orbitRadius: 250 },
    { ...DEFAULT_BEHAVIOR_CONFIG, type: 'canRepel', enabled: true },
  ],
};
