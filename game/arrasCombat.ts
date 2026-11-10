import { OFFENSE_ARRAS } from './offenseSwitch';
const sfFloorOf = (): number => OFFENSE_ARRAS.SF_FLOOR;
const sfPowOf = (): number => OFFENSE_ARRAS.SF_POW;
function sfOf(sf: number, pow: number | undefined): number {
  if (OFFENSE_ARRAS.SF_ONLY_DRONES === 0) return Math.min(2, Math.max(sfFloorOf(), Math.max(sf, 1) * sf));
  return (pow ?? 0.25) > 0.3 ? Math.min(2, Math.max(sfFloorOf(), sf)) : Math.max(sfFloorOf(), Math.min(1, sf));
}

export interface ArrasShootSettings {
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

export interface ArrasBodyStats {
  DAMAGE?: number;
  HEALTH?: number;
  RESIST?: number;
  PENETRATION?: number;
  SPEED?: number;
  RANGE?: number;
  DENSITY?: number;
  PUSHABILITY?: number;
  HETERO?: number;
  FOV?: number;
  SHIELD?: number;
  REGEN?: number;
  ACCELERATION?: number;
}

export interface ArrasSkill {
  rld: number;
  pen: number;
  str: number;
  dam: number;
  spd: number;
  shi: number;
  atk: number;
  hlt: number;
  rgn: number;
  mob: number;
  rst: number;
  rstFood: number;
  rstFight: number;
  brst: number;
  acl: number;
  ghost: number;
  strCurve: number;
}

export interface ArrasInterpretResult {
  SPEED: number;
  HEALTH: number;
  RESIST: number;
  DAMAGE: number;
  PENETRATION: number;
  RANGE: number;
  DENSITY: number;
  PUSHABILITY: number;
  HETERO: number;
  reloadRateFactor: number;
  childrenLimitFactor: number;
}

export type ArrasCalculator =
  | 'default'
  | 'thruster'
  | 'sustained'
  | 'sustained+lowspeed'
  | 'swarm'
  | 'trap'
  | 'block'
  | 'fixedReload'
  | 'necro'
  | 'drone';

export interface ArrasCollisionEntity {
  damage: number;
  penetration: number;
  maxSpeed: number;
  motionLength: number;
  healthResist: number;
  healthRatio: number;
  shieldRatio: number;
  heteroMultiplier: number;
  damageClass: number;
  damageType: number;
  settingsDamageEffects: boolean;
  settingsRatioEffects: boolean;
  settingsBuffVsFood: boolean;
  settingsMotionEffects: boolean;
  damageMultiplierFn: () => number;
  team: string | null;
  ownerId: string;
  isHealer: boolean;
  isInvuln: boolean;
  sfSlow?: boolean;
  sfPow?: number;
  noGraze?: boolean;

}

export interface ArrasCollideContext {
  combinedRadius: number;
  difference: number;
  componentNorm: number;
  depthMe: number;
  depthN: number;
  accelerationFactor: number;
}

export interface ArrasCollideResult {
  damageAB: number;
  damageBA: number;
  deathFactorA: number;
  deathFactorB: number;
}

export const CLASS_BULLET_BODY: ArrasBodyStats = {
  PENETRATION: 1, SPEED: 3.75, RANGE: 90, DENSITY: 1.25,
  HEALTH: 0.165, DAMAGE: 6, PUSHABILITY: 0.3,
  RESIST: 1,
};

export const CLASS_DRONE_BODY: ArrasBodyStats = {
  PENETRATION: 1.2, PUSHABILITY: 0.6, ACCELERATION: 0.085,
  HEALTH: 0.3, DAMAGE: 3.375, SPEED: 3.8, RANGE: 200,
  DENSITY: 0.03, RESIST: 1.5, FOV: 0.5,
};

export const CLASS_SWARM_BODY: ArrasBodyStats = {
  ACCELERATION: 3, PENETRATION: 1.5, HEALTH: 0.175,
  DAMAGE: 2.25, SPEED: 4.5, RESIST: 1.6, RANGE: 225,
  DENSITY: 12, PUSHABILITY: 0.6, FOV: 1.5,
};

export const CLASS_TRAP_BODY: ArrasBodyStats = {
  HEALTH: 0.5, DAMAGE: 3, RANGE: 450, DENSITY: 2.5,
  RESIST: 2.5, SPEED: 0,
};

export const CLASS_MINION_BODY: ArrasBodyStats = {
  FOV: 0.5, SPEED: 1.8, ACCELERATION: 1, HEALTH: 5, SHIELD: 0,
  DAMAGE: 1.2, RESIST: 1, PENETRATION: 1, DENSITY: 0.4,
};

export const CLASS_BOOMERANG_BODY: ArrasBodyStats = {
  SPEED: 1.25, RESIST: 1, HEALTH: 1, DAMAGE: 1, PENETRATION: 1,
};

export const CLASS_HIVE_BODY: ArrasBodyStats = {
  SPEED: 3.8, RESIST: 1.5, HEALTH: 0.3, DAMAGE: 3.375, PENETRATION: 1.2,
};

export const CLASS_DEFAULT_BODY: ArrasBodyStats = {
  HEALTH: 1, RESIST: 1, DAMAGE: 1, PENETRATION: 1, SPEED: 0,
};

export function getClassBody(motionType: string, statCalc?: string): ArrasBodyStats {
  if (statCalc === 'trap') return CLASS_TRAP_BODY;
  switch (motionType) {
    case 'chase':      return CLASS_DRONE_BODY;
    case 'swarm':      return CLASS_SWARM_BODY;
    case 'minion':     return CLASS_MINION_BODY;
    case 'boomerang':  return CLASS_BOOMERANG_BODY;
    case 'withMaster': return CLASS_HIVE_BODY;
    default:           return CLASS_BULLET_BODY;
  }
}

export function getArrasCalculator(statCalc?: string): ArrasCalculator {
  switch (statCalc) {
    case 'drone':              return 'drone';
    case 'swarm':              return 'swarm';
    case 'trap':               return 'trap';
    case 'thruster':           return 'thruster';
    case 'sustained':          return 'sustained';
    case 'sustainedLowspeed':  return 'sustained+lowspeed';
    case 'fixedReload':        return 'fixedReload';
    case 'necro':              return 'necro';
    case 'bullet':
    default:                   return 'default';
  }
}

export function getArrasShootResist(statCalc?: string): number {
  switch (statCalc) {
    case 'trap': return 3;
    default:     return 1;
  }
}

const ARRAS_LEVEL_45_SIZE_FACTOR = 2.0;
const ARRAS_GROWTH_RATE_PER_LEVEL = 0.015;

export function computeSizeFactorForIStrongLevel(iStrongLevel: number): number {
  if (iStrongLevel <= 0) return ARRAS_LEVEL_45_SIZE_FACTOR;
  return ARRAS_LEVEL_45_SIZE_FACTOR + iStrongLevel * ARRAS_GROWTH_RATE_PER_LEVEL;
}

export function computeSpeedReduce(sizeFactor: number): number {
  return Math.min(4, Math.max(1, sizeFactor));
}

export const ARRAS_SKILL_POINTS_BAR = 9;

const _skillCurveCache = new Map<number, number>();

export function arrasSkillCurve(rawPoints: number, skillCap: number): number {
  if (rawPoints <= 0) return 0;
  if (skillCap <= 0) return 0;
  const past = ARRAS_PARITY.SKILL_PAST_CAP !== 0;
  const key = past ? -(rawPoints * 100 + skillCap) : rawPoints * 100 + skillCap;
  const cached = _skillCurveCache.get(key);
  if (cached !== undefined) return cached;
  const ratio = past ? rawPoints / ARRAS_SKILL_POINTS_BAR : Math.min(1, rawPoints / skillCap);
  const value = Math.log(4 * ratio + 1) / 1.6;
  _skillCurveCache.set(key, value);
  return value;
}

function arrasApply(f: number, x: number): number {
  return x < 0 ? 1 / (1 - x * f) : f * x + 1;
}

export function arrasAccelMult(rawReloadPoints: number, skillCap: number): number {
  return arrasApply(0.5, arrasSkillCurve(rawReloadPoints, skillCap));
}

const _arrasSkillOut: ArrasSkill = {
  rld: 1, pen: 1, str: 1, dam: 1, spd: 1.5,
  shi: 1, atk: 1, hlt: 1, rgn: 1, mob: 1,
  rst: 0, rstFood: 0, rstFight: 0, brst: 0, acl: 1, ghost: 0, strCurve: 0,
};

export function computeArrasSkill(
  upgrades: Record<string, number>,
  skillCap: number,
  glassHealthFactor: number = 2
): ArrasSkill {
  const cap = skillCap > 0 ? skillCap : 9;

  const aRld = arrasSkillCurve(upgrades.reload ?? 0, cap);
  const aPen = arrasSkillCurve(upgrades.bulletPenetration ?? 0, cap);
  const aStr = arrasSkillCurve(upgrades.bulletHealth ?? 0, cap);
  const aDam = arrasSkillCurve(upgrades.bulletDamage ?? 0, cap);
  const aSpd = arrasSkillCurve(upgrades.bulletSpeed ?? 0, cap);
  const aShi = arrasSkillCurve(upgrades.shieldCapacity ?? 0, cap);
  const aAtk = arrasSkillCurve(upgrades.bodyDamage ?? 0, cap);
  const aHlt = arrasSkillCurve(upgrades.maxHealth ?? 0, cap);
  const aRgn = arrasSkillCurve(upgrades.shieldRegen ?? 0, cap);
  const aMob = arrasSkillCurve(upgrades.movementSpeed ?? 0, cap);

  _arrasSkillOut.rld = Math.pow(0.5, aRld);
  _arrasSkillOut.pen = arrasApply(OFFENSE_ARRAS.ON !== 0 ? OFFENSE_ARRAS.PEN_F : 2.5, aPen);
  _arrasSkillOut.str = arrasApply(OFFENSE_ARRAS.ON !== 0 ? OFFENSE_ARRAS.STR_F : 2, aStr);
  _arrasSkillOut.dam = arrasApply(OFFENSE_ARRAS.ON !== 0 ? OFFENSE_ARRAS.DAM_F : 3, aDam);
  _arrasSkillOut.spd = 0.5 + arrasApply(1.5, aSpd);
  _arrasSkillOut.shi = glassHealthFactor * arrasApply(3 / glassHealthFactor - 1, aShi);
  _arrasSkillOut.atk = arrasApply(0.021, aAtk);
  _arrasSkillOut.hlt = glassHealthFactor * arrasApply(2 / glassHealthFactor - 1, aHlt);
  _arrasSkillOut.rgn = arrasApply(25, aRgn);
  _arrasSkillOut.mob = arrasApply(0.8, aMob);
  _arrasSkillOut.rst = OFFENSE_ARRAS.ON !== 0 ? OFFENSE_ARRAS.RST_STR * aStr + OFFENSE_ARRAS.RST_PEN * aPen : 0.5 * aStr + 2.5 * aPen;
  _arrasSkillOut.rstFood = OFFENSE_ARRAS.ON !== 0 ? OFFENSE_ARRAS.RST_STR_FOOD * aStr + OFFENSE_ARRAS.RST_PEN_FOOD * aPen : _arrasSkillOut.rst;
  _arrasSkillOut.rstFight = 0.5 * aStr + 2.5 * aPen;
  _arrasSkillOut.brst = 0.3 * (0.5 * aAtk + 0.5 * aHlt + aRgn);
  _arrasSkillOut.acl = arrasApply(0.5, aRld);
  _arrasSkillOut.ghost = aPen;
  _arrasSkillOut.strCurve = aStr;

  return _arrasSkillOut;
}

export function arrasHealthResist(RESIST: number, brst: number): number {
  return 1 - 1 / Math.max(1, RESIST + brst);
}

export function arrasHealthRatio(amount: number, max: number): number {
  if (max <= 0) return 0;
  const diff = amount / max - 1;
  const d2 = diff * diff;
  return Math.min(1, Math.max(0, 1 - d2 * d2));
}

export function arrasShieldPermeability(shieldAmount: number, shieldMax: number): number {
  if (shieldMax <= 0) return 0;
  return Math.min(1, Math.max(0, shieldAmount / shieldMax));
}

const _arrasInterpretOut: ArrasInterpretResult = {
  SPEED: 0, HEALTH: 0, RESIST: 0, DAMAGE: 0, PENETRATION: 1,
  RANGE: 0, DENSITY: 0, PUSHABILITY: 1, HETERO: 0,
  reloadRateFactor: 1, childrenLimitFactor: 1,
};

export function arrasInterpret(
  shoot: ArrasShootSettings,
  skill: ArrasSkill,
  sizeFactor: number,
  calculator: ArrasCalculator,
  bulletBodyStats: ArrasBodyStats,
  independentChildren: boolean = false
): ArrasInterpretResult {
  const sk = skill;

  _arrasInterpretOut.SPEED = shoot.maxSpeed * sk.spd;
  _arrasInterpretOut.HEALTH = shoot.health * sk.str;
  _arrasInterpretOut.RESIST = shoot.resist + sk.rst;
  _arrasInterpretOut.DAMAGE = shoot.damage * sk.dam;
  _arrasInterpretOut.PENETRATION = Math.max(1, shoot.pen * sk.pen);
  _arrasInterpretOut.RANGE = shoot.range / Math.sqrt(Math.max(0.01, sk.spd));
  _arrasInterpretOut.DENSITY = (shoot.density * sk.pen * sk.pen) / Math.max(0.01, sizeFactor);
  _arrasInterpretOut.PUSHABILITY = 1 / Math.max(0.01, sk.pen);
  _arrasInterpretOut.HETERO = 3 - 2.8 * sk.ghost;
  _arrasInterpretOut.reloadRateFactor = sk.rld;
  _arrasInterpretOut.childrenLimitFactor = 1;

  switch (calculator) {
    case 'thruster':
      break;

    case 'sustained':
      _arrasInterpretOut.RANGE = shoot.range;
      break;

    case 'sustained+lowspeed':
      _arrasInterpretOut.RANGE = shoot.range;
      _arrasInterpretOut.SPEED = shoot.maxSpeed + sk.spd;
      break;

    case 'swarm':
      _arrasInterpretOut.PENETRATION = Math.max(1, shoot.pen * (0.5 * (sk.pen - 1) + 1));
      _arrasInterpretOut.HEALTH /= Math.max(0.01, OFFENSE_ARRAS.ON !== 0 && OFFENSE_ARRAS.SWARM_NO_PEN_CUT !== 0 ? shoot.pen : shoot.pen * sk.pen);
      break;

    case 'trap':
    case 'block':
      _arrasInterpretOut.PUSHABILITY = 1 / Math.pow(Math.max(0.01, sk.pen), 0.5);
      _arrasInterpretOut.RANGE = shoot.range;
      break;

    case 'fixedReload':
      _arrasInterpretOut.reloadRateFactor = 1;
      break;

    case 'necro':
      _arrasInterpretOut.childrenLimitFactor = sk.rld;
      _arrasInterpretOut.reloadRateFactor = 1;
      break;

    case 'drone':
      _arrasInterpretOut.PUSHABILITY = 1;
      _arrasInterpretOut.PENETRATION = Math.max(1, shoot.pen * (0.5 * (sk.pen - 1) + 1));
      const _dnpc = OFFENSE_ARRAS.ON !== 0 ? OFFENSE_ARRAS.DRONE_NO_PEN_CUT : 0;
      _arrasInterpretOut.HEALTH = (shoot.health * sk.str + sizeFactor * (OFFENSE_ARRAS.ON !== 0 ? OFFENSE_ARRAS.DRONE_SF_HP : 1)) / (_dnpc === 1 ? 1 : _dnpc === 0 ? Math.pow(Math.max(0.01, sk.pen), 0.8) : Math.pow(Math.max(0.01, sk.pen), 0.8 * (1 - _dnpc)));
      _arrasInterpretOut.DAMAGE = shoot.damage * sk.dam * Math.sqrt(Math.max(0.01, sizeFactor)) * (OFFENSE_ARRAS.ON !== 0 && OFFENSE_ARRAS.DRONE_PEN_DMG_POW !== 0.5 ? Math.pow(Math.max(0.01, shoot.pen * sk.pen), OFFENSE_ARRAS.DRONE_PEN_DMG_POW) : Math.sqrt(Math.max(0.01, shoot.pen * sk.pen)));
      break;

  }

  if (independentChildren) return _arrasInterpretOut;

  if (bulletBodyStats.SPEED       !== undefined) _arrasInterpretOut.SPEED       *= bulletBodyStats.SPEED;
  if (bulletBodyStats.HEALTH      !== undefined) _arrasInterpretOut.HEALTH      *= bulletBodyStats.HEALTH;
  if (bulletBodyStats.RESIST      !== undefined) _arrasInterpretOut.RESIST      *= bulletBodyStats.RESIST;
  if (bulletBodyStats.DAMAGE      !== undefined) _arrasInterpretOut.DAMAGE      *= bulletBodyStats.DAMAGE;
  if (bulletBodyStats.PENETRATION !== undefined) _arrasInterpretOut.PENETRATION *= bulletBodyStats.PENETRATION;
  if (bulletBodyStats.RANGE       !== undefined) _arrasInterpretOut.RANGE       *= bulletBodyStats.RANGE;
  if (bulletBodyStats.DENSITY     !== undefined) _arrasInterpretOut.DENSITY     *= bulletBodyStats.DENSITY;
  if (bulletBodyStats.PUSHABILITY !== undefined) _arrasInterpretOut.PUSHABILITY *= bulletBodyStats.PUSHABILITY;

  return _arrasInterpretOut;
}

const _arrasCollideOut: ArrasCollideResult = {
  damageAB: 0, damageBA: 0, deathFactorA: 1, deathFactorB: 1,
};

export function arrasAdvancedCollideDamage(
  a: ArrasCollisionEntity,
  b: ArrasCollisionEntity,
  ctx: ArrasCollideContext,
  damageMultiplierConfig: number = 1
): ArrasCollideResult {
  if (a.isInvuln || b.isInvuln) {
    _arrasCollideOut.damageAB = 0;
    _arrasCollideOut.damageBA = 0;
    _arrasCollideOut.deathFactorA = 1;
    _arrasCollideOut.deathFactorB = 1;
    return _arrasCollideOut;
  }

  const speedFactorA = a.maxSpeed > 0
    ? Math.pow(Math.max(0, a.motionLength) / a.maxSpeed, a.sfSlow === true ? (a.sfPow ?? sfPowOf()) : 0.25)
    : 1;
  const speedFactorB = b.maxSpeed > 0
    ? Math.pow(Math.max(0, b.motionLength) / b.maxSpeed, b.sfSlow === true ? (b.sfPow ?? sfPowOf()) : 0.25)
    : 1;

  const resistDiff = a.healthResist - b.healthResist;

  const heteroAB = 1 + b.heteroMultiplier * (a.damageClass === b.damageClass ? 1 : 0);
  const heteroBA = 1 + a.heteroMultiplier * (a.damageClass === b.damageClass ? 1 : 0);

  const buffABfood = (a.settingsBuffVsFood && b.damageType === 1) ? 3 : 1;
  const buffBAfood = (b.settingsBuffVsFood && a.damageType === 1) ? 3 : 1;

  const dmA = a.damageMultiplierFn();
  const dmB = b.damageMultiplierFn();

  const sfA = a.sfSlow === true ? sfOf(speedFactorA, a.sfPow)
    : Math.min(2, Math.max(1, Math.max(speedFactorA, 1) * speedFactorA));
  const sfB = b.sfSlow === true ? sfOf(speedFactorB, b.sfPow)
    : Math.min(2, Math.max(1, Math.max(speedFactorB, 1) * speedFactorB));

  const twoRounds = a.noGraze === true && b.noGraze === true;
  let dmgAB = damageMultiplierConfig * a.damage * (1 + (a.noGraze === true ? (b.damageType === 1 ? resistDiff * OFFENSE_ARRAS.DEALT_RST : b.damageClass === 2 ? a.healthResist * OFFENSE_ARRAS.DEALT_RST_TANK - b.healthResist : twoRounds ? a.healthResist * OFFENSE_ARRAS.RVR_OWN_RST - b.healthResist : resistDiff) : resistDiff)) * heteroAB * buffABfood * dmA * sfA;
  let dmgBA = damageMultiplierConfig * b.damage * (1 - (b.damageType === 1 && a.noGraze === true ? a.healthResist - b.healthResist * OFFENSE_ARRAS.FOOD_RST_ROUND : twoRounds ? a.healthResist - b.healthResist * OFFENSE_ARRAS.RVR_OWN_RST : resistDiff)) * heteroBA * buffBAfood * dmB * sfB;

  if (OFFENSE_ARRAS.RATIO_ON !== 0 && a.settingsRatioEffects) {
    const maxRatio = Math.max(a.healthRatio, a.shieldRatio);
    dmgAB *= Math.min(1, Math.pow(Math.max(0.001, maxRatio), 1 / Math.max(0.1, a.penetration)));
  }
  if (OFFENSE_ARRAS.RATIO_ON !== 0 && b.settingsRatioEffects) {
    const maxRatio = Math.max(b.healthRatio, b.shieldRatio);
    dmgBA *= Math.min(1, Math.pow(Math.max(0.001, maxRatio), 1 / Math.max(0.1, b.penetration)));
  }

  if (a.settingsDamageEffects) {
    const penA = Math.max(0.1, a.penetration);
    const penBSqrt = Math.sqrt(Math.max(0.1, b.penetration));
    const term2 = a.noGraze === true && !(twoRounds && OFFENSE_ARRAS.RVR_GRAZE !== 0) ? 1 : 1 + (ctx.componentNorm - 1) * (1 - ctx.depthN) / penA;
    const term3 = (a.noGraze === true && b.damageType === 1 && OFFENSE_ARRAS.DEALT_DEPTH === 0) || (twoRounds && OFFENSE_ARRAS.RVR_DEPTH === 0) ? 1 : (1 + penBSqrt * ctx.depthN - ctx.depthN) / penBSqrt;
    dmgAB *= ctx.accelerationFactor * term2 * term3;
  }
  if (b.settingsDamageEffects) {
    const penB = Math.max(0.1, b.penetration);
    const penASqrt = Math.sqrt(Math.max(0.1, a.penetration));
    const term2 = b.noGraze === true && !(twoRounds && OFFENSE_ARRAS.RVR_GRAZE !== 0) ? 1 : 1 + (ctx.componentNorm - 1) * (1 - ctx.depthMe) / penB;
    const term3 = twoRounds && OFFENSE_ARRAS.RVR_DEPTH === 0 ? 1 : (1 + penASqrt * ctx.depthMe - ctx.depthMe) / penASqrt;
    dmgBA *= ctx.accelerationFactor * term2 * term3;
  }

  if (!isFinite(dmgAB)) dmgAB = 0;
  if (!isFinite(dmgBA)) dmgBA = 0;

  const deathFactorA = (dmgBA > 0 && Math.abs(dmgBA) > 0.001)
    ? Math.min(1, Math.max(0, 1 / (1 + Math.max(0, dmgBA - 1) / 1)))
    : 1;
  _arrasCollideOut.damageAB = dmgAB;
  _arrasCollideOut.damageBA = dmgBA;
  _arrasCollideOut.deathFactorA = 1;
  _arrasCollideOut.deathFactorB = 1;
  return _arrasCollideOut;
}

export function closingBiteK(kindId: number, rvx: number, rvy: number, tvx: number, tvy: number): number {
  if (OFFENSE_ARRAS.ON === 0 || OFFENSE_ARRAS.CLOSE_ON === 0) return 1;
  if (kindId !== 1 && kindId !== 2 && kindId !== 6 && kindId !== 7) return 1;
  const own = Math.sqrt(rvx * rvx + rvy * rvy);
  if (own < 0.05) return 1;
  const r = Math.max(0.25, Math.min(2, 1 - (tvx * rvx + tvy * rvy) / (own * own)));
  if (r === 1) return 1;
  return Math.pow(r, r < 1 ? (kindId === 2 ? OFFENSE_ARRAS.CLOSE_MISSILE_AWAY : OFFENSE_ARRAS.CLOSE_AWAY) : (kindId === 2 ? OFFENSE_ARRAS.CLOSE_MISSILE_TOWARD : OFFENSE_ARRAS.CLOSE_TOWARD));
}

export function applyDeathFactor(
  rawDmgAB: number, rawDmgBA: number,
  aHealth: number, bHealth: number
): ArrasCollideResult {
  const deathFactorA = rawDmgBA > aHealth && rawDmgBA > 0.0001
    ? aHealth / rawDmgBA
    : 1;
  const deathFactorB = rawDmgAB > bHealth && rawDmgAB > 0.0001
    ? bHealth / rawDmgAB
    : 1;

  _arrasCollideOut.damageAB = rawDmgAB * deathFactorA;
  _arrasCollideOut.damageBA = rawDmgBA * deathFactorB;
  _arrasCollideOut.deathFactorA = deathFactorA;
  _arrasCollideOut.deathFactorB = deathFactorB;
  return _arrasCollideOut;
}

export const ARRAS_PARITY: { BODY_DRIVE: number; MINION_CLASS_BODY: number; PEN_HETERO: number; BULLET_TANK_PUSH: number; BODY_RESIST_BASE: number; BODY_PENETRATION: number; DRONE_SPEED: number; ROUND_SIZE: number; ROUND_TOP_SPEED: number; RECOIL: number; ROUND_BOUNCE: number; ACCEL_UNITS: number; ROUND_CLASS: number; TURRET_REACH: number; TURRET_TURN: number; SHELL_RANGE: number; MINION_FOOD: number; DRONE_REACH: number; MINION_REACH: number; MOUNTED_LEAD: number; SENTRY_LEAD: number; UPGRADE_KEEP: number; UPGRADE_NO_HEAL: number; DRONE_FULL_RELOAD: number; STARTS_LOADED: number; SPEED_WORLD: number; LIFE_BY_SPEED: number; ROUND_GUN_SPEED: number; TANK_GUN_BOOST: number; ROUND_TURRET_OWN: number; ROUND_HEADING: number; NECRO_LIMITS: number; ROUND_MAKER: number; MARKER_FREES: number; ROUND_TURRET_SELF: number; OVERRIDE_MARKED: number; MAKER_END: number; PUSH_APART: number; AIM_PICTURE: number; ROUND_GUN_HEADING: number; ROUND_DECOR_SILENT: number; CRASHER_FACE: number; ASSEMBLER_BURST: number; ASSEMBLER_JOIN: number; ASSEMBLER_GROW: number; AURA: number; TURRET_QUARTER: number; RECOIL_SHOT: number; MINION_MOTION: number; DRONE_MOTION: number; DRONE_PUSH: number; SWARM_MOTION: number; ROUND_FACE: number; BLOCK_MOTION: number; TRAP_BORN_FREE: number; BOOMERANG_RIDE: number; TRAP_SPIN: number; TRAP_LIFE_SPEED: number; ROUND_THRUST: number; GLIDE_DECAY: number; TURRET_ORDER: number; RING_WORLD: number; PUSH_ONLY: number; BURST_PIECE: number; TURRET_SHARE: number; SKILL_PAST_CAP: number; ROUND_MASS_ONE: number; NECRO_BODY: number } = {
  MINION_CLASS_BODY: 1,
  PEN_HETERO: 1,
  BULLET_TANK_PUSH: 1,
  BODY_RESIST_BASE: 1,
  BODY_PENETRATION: 1,
  DRONE_SPEED: 1,
  ROUND_SIZE: 1,
  ROUND_TOP_SPEED: 1,
  RECOIL: 1,
  ROUND_BOUNCE: 1,
  ACCEL_UNITS: 1,
  ROUND_CLASS: 1,
  TURRET_REACH: 1,
  TURRET_TURN: 1,
  SHELL_RANGE: 1,
  MINION_FOOD: 1,
  DRONE_REACH: 1,
  MINION_REACH: 1,
  MOUNTED_LEAD: 1,
  SENTRY_LEAD: 1,
  UPGRADE_KEEP: 1,
  UPGRADE_NO_HEAL: 1,
  DRONE_FULL_RELOAD: 1,
  STARTS_LOADED: 1,
  BODY_DRIVE: 1,
  SPEED_WORLD: 1,
  LIFE_BY_SPEED: 1,
  ROUND_GUN_SPEED: 1,
  TANK_GUN_BOOST: 1,
  ROUND_TURRET_OWN: 1,
  ROUND_HEADING: 1,
  NECRO_LIMITS: 1,
  ROUND_MAKER: 1,
  MARKER_FREES: 1,
  ROUND_TURRET_SELF: 1,
  OVERRIDE_MARKED: 1,
  MAKER_END: 1,
  PUSH_APART: 1,
  AIM_PICTURE: 1,
  ROUND_GUN_HEADING: 1,
  ROUND_DECOR_SILENT: 1,
  CRASHER_FACE: 1,
  ASSEMBLER_BURST: 1,
  ASSEMBLER_JOIN: 1,
  ASSEMBLER_GROW: 1,
  AURA: 1,
  TURRET_QUARTER: 1,
  RECOIL_SHOT: 1,
  MINION_MOTION: 1,
  DRONE_MOTION: 1,
  DRONE_PUSH: 1,
  SWARM_MOTION: 1,
  ROUND_FACE: 1,
  BLOCK_MOTION: 1,
  TRAP_BORN_FREE: 1,
  BOOMERANG_RIDE: 1,
  TRAP_SPIN: 1,
  TRAP_LIFE_SPEED: 1,
  ROUND_THRUST: 1,
  GLIDE_DECAY: 1,
  TURRET_ORDER: 1,
  RING_WORLD: 1,
  PUSH_ONLY: 1,
  BURST_PIECE: 1,
  TURRET_SHARE: 1,
  SKILL_PAST_CAP: 1,
  ROUND_MASS_ONE: 1,
  NECRO_BODY: 1,
};

export const ROUND_THRUST_LAMBDA = 30 * Math.log(1 / 0.9);

export const ARRAS_SPD_NO_POINTS = 1.5;
export function lifeBySpeed(seconds: number, speedMult: number, calc: string | undefined): number {
  if ((calc === 'trap' && ARRAS_PARITY.TRAP_LIFE_SPEED === 0) || calc === 'sustained' || calc === 'sustainedLowspeed' || calc === 'drone' || calc === 'necro') return seconds;
  return seconds / Math.sqrt(speedMult);
}

export const ARRAS_BODY_PUSH_SHARE = 1.6 / (5.25 + 1.6);
const BODY_PUSH_SHARE_MAX = 0.98;
const BODY_PUSH_SHARE_MIN = 0.005;
export function bodyPushShareOf(own: number | undefined): number {
  if (own === undefined || !(own >= 0)) return ARRAS_BODY_PUSH_SHARE;
  return own > BODY_PUSH_SHARE_MAX ? BODY_PUSH_SHARE_MAX : (own < BODY_PUSH_SHARE_MIN ? BODY_PUSH_SHARE_MIN : own);
}
export function arrasEngineMult(rawReloadPoints: number, skillCap: number): number {
  return arrasApply(0.8, arrasSkillCurve(rawReloadPoints, skillCap));
}
export function bodyDriveMult(pushShare: number, mob: number, eng: number): number {
  return (1 - pushShare) * mob + pushShare * eng;
}
export function bodyDriveKeep(pushShare: number, mob: number, eng: number): number {
  const top = (1 - pushShare) * mob, push = pushShare * eng;
  return top / (top + push);
}
export function bodyDriveDrag(pushShare: number, mob: number, eng: number): number {
  return (pushShare * eng) / ((1 - pushShare) * mob);
}

export const ARRAS_REST_REACH = 640 * 0.5 * Math.sqrt(4 / 3);
export const ARRAS_REST_REACH_AT_RADIUS = 24;
export function arrasRestReach(ownerRadiusArras: number): number {
  return ARRAS_REST_REACH * Math.sqrt((ownerRadiusArras > 0 ? ownerRadiusArras : ARRAS_REST_REACH_AT_RADIUS) / ARRAS_REST_REACH_AT_RADIUS);
}

export const ARRAS_TICKS_PER_SECOND = 30;

export const ARRAS_TURRET_TURN_PER_TICK = 1.5 / 4;
export const NEW_ARRAS_TURRET_TURN_PER_TICK = 1 / 4;
export function arrasTurretTurnShare(dtSec: number): number {
  const perTick = ARRAS_PARITY.TURRET_QUARTER !== 0 ? NEW_ARRAS_TURRET_TURN_PER_TICK : ARRAS_TURRET_TURN_PER_TICK;
  return 1 - Math.pow(1 - perTick, ARRAS_TICKS_PER_SECOND * dtSec);
}
export const ARRAS_RECOIL_FORCE = 1.08;
export const ARRAS_SPD_AT_REST = 1.5;
const ARRAS_RECOIL_REST = 1e-6;

export function arrasShotMotion(spd: number, recoil: number): number {
  const arg = Math.sqrt(spd > 0 ? spd : 0) + recoil + 1;
  return arg > 0 ? 3 * Math.log(arg) + 1 : 0;
}

export function arrasRecoilTicks(gun: { physRecoilPos: number; physRecoilVel: number }, ticks: number): number {
  let position = gun.physRecoilPos, motion = gun.physRecoilVel, out = 0;
  for (let i = 0; i < ticks; i++) {
    if (motion === 0 && position === 0) break;
    motion -= 0.25 * position;
    position += motion;
    if (position < 0) { position = 0; motion = -motion; }
    if (motion > 0) { motion *= 0.75; out += position; }
    if (position < ARRAS_RECOIL_REST && motion < ARRAS_RECOIL_REST && motion > -ARRAS_RECOIL_REST) { position = 0; motion = 0; }
  }
  gun.physRecoilPos = position;
  gun.physRecoilVel = motion;
  return out;
}

export const ARRAS_SHOT_RING: { first: number; second: number; q: number; fromRest: number } = (() => {
  const g = { physRecoilPos: 0, physRecoilVel: 1 };
  const out: number[] = [];
  for (let i = 0; i < 8; i++) out.push(arrasRecoilTicks(g, 1));
  const q = out[6] / out[0];
  if (!(out[0] === 1 && out[1] === 1.5 && out[2] === 0 && out[3] === 0 && out[4] === 0 && out[5] === 0 && Math.abs(out[7] / out[1] - q) < 1e-12 && q > 0 && q < 1)) {
    throw new Error('arrasCombat: the gun spring no longer rings as old arras\'s (RECOIL-SHOT-01 reads its train off it): ' + out.join(', '));
  }
  return { first: out[0], second: out[1], q, fromRest: (out[0] + out[1]) / (1 - q) };
})();
export const ARRAS_SHOT_FROM_REST = ARRAS_SHOT_RING.fromRest;
const ARRAS_SHOT_RING_REST = 1e-6;
export function arrasShotRingTicksXY(ring: number[], tick0: number, ticks: number, shot: number, dx: number, dy: number, out: { x: number; y: number }): void {
  let ox = 0, oy = 0;
  for (let i = 0; i < ticks; i++) {
    const s = (tick0 + i) % 6;
    if (i === 0 && shot > 0) {
      const a = shot * ARRAS_SHOT_RING.first, b = shot * ARRAS_SHOT_RING.second, n = s === 5 ? 0 : s + 1;
      ring[s] += a * dx; ring[s + 6] += a * dy; ring[n] += b * dx; ring[n + 6] += b * dy;
    }
    const vx = ring[s], vy = ring[s + 6];
    ox += vx; oy += vy;
    const nx = vx * ARRAS_SHOT_RING.q, ny = vy * ARRAS_SHOT_RING.q;
    if (nx * nx + ny * ny < ARRAS_SHOT_RING_REST * ARRAS_SHOT_RING_REST) { ring[s] = 0; ring[s + 6] = 0; } else { ring[s] = nx; ring[s + 6] = ny; }
  }
  out.x = ox; out.y = oy;
}
export function arrasShotRingTicks(ring: number[], tick0: number, ticks: number, shot: number): number {
  let out = 0;
  for (let i = 0; i < ticks; i++) {
    const s = (tick0 + i) % 6;
    if (i === 0 && shot > 0) { ring[s] += shot * ARRAS_SHOT_RING.first; ring[s === 5 ? 0 : s + 1] += shot * ARRAS_SHOT_RING.second; }
    const v = ring[s];
    out += v;
    const next = v * ARRAS_SHOT_RING.q;
    ring[s] = next < ARRAS_SHOT_RING_REST ? 0 : next;
  }
  return out;
}

export const ARRAS_KNOCKBACK_MULTIPLIER = 1.1;
export const ARRAS_RUN_SPEED = 1.5;
export const ARRAS_TANK_BASE_PENETRATION = 1.05;
export const ARRAS_TANK_DENSITY = (1 + 0.08 * 45) * 0.5;
export const ARRAS_TANK_DRAG = 1.6 / 5.25;

export function arrasBodyPenetration(brst: number, atkMult: number, base: number = ARRAS_TANK_BASE_PENETRATION): number {
  return base + 1.5 * (brst + 0.8 * (atkMult - 1));
}

export function arrasCollidePushOnN(
  component: number, depthMe: number, depthN: number,
  penMe: number, penN: number, hrMe: number, hrN: number,
  massMe: number, massN: number,
  pushabilityN: number, deathFactorMe: number,
  knockback: number = ARRAS_KNOCKBACK_MULTIPLIER,
): number {
  if (!(massN > 0) || !(massMe > 0)) return 0;
  const pMe = Math.max(0.01, penMe);
  const pN = Math.max(0.01, penN);
  const hMe = Math.max(0, hrMe);
  const hN = Math.max(0, hrN);
  const up = depthMe * depthN;
  const down = (1 - depthMe) * (1 - depthN);
  const elasticity = (2 - 4 * Math.atan(pMe * pN) / Math.PI) * (hMe / Math.sqrt(pMe) + hN / Math.sqrt(pN));
  const spring = 2 * Math.sqrt(hMe * hN) / ARRAS_RUN_SPEED;
  const impulse = down * down * elasticity * Math.max(0, component) * massMe * massN / (massMe + massN)
    + knockback * spring * up;
  const dv = knockback * pushabilityN / massN * deathFactorMe * impulse;
  return isFinite(dv) ? dv : 0;
}

export function clearArrasCaches(): void {
  _skillCurveCache.clear();
}
