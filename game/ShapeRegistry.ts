import type { FoodShapeDesign } from '@/types';
import { CM, CM_USE, cmHex, cmMapOf } from '@/utils/colorMap';
import { solidOf } from '@/utils/solidArras';
import { acTick, acRainbowHex, acTransHex, acFlashIsFirst, AC_FLASH_SLOTS, AC_UI, AC_WORLD } from '@/utils/animColorArras';
import { SHAPES_ARRAS, SHAPE_SCORES } from './shapesSwitch';
import { SHAPE_BOOK, SHAPE_BOOK_SCORE, SHAPE_SCORE_RARE_TIMES } from './shapeBook.generated';
import type { ShapeBookRow } from './shapeBook.generated';
import { makeShapeLook, type ShapeLook } from '@/utils/shapeLook';
import { nameSlug, nameSlugLegacy } from '@/utils/nameSlug';

export type BaseShape = 'egg' | 'triangle' | 'square' | 'pentagon' | 'hexagon';
export type SpecialShapeType =
  | 'gem' | 'jewel'
  | 'crasherEgg' | 'crasherTriangle' | 'crasherSquare' | 'crasherPentagon' | 'crasherHexagon' | 'crasher' | 'megaCrasher'
  | 'cube' | 'dodecahedron' | 'icosahedron';

export type Rarity = 'normal' | 'shiny' | 'legendary' | 'shadow' | 'rainbow' | 'trans';
export type LabyLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type ScaleVariant = 'normal' | 'beta' | 'alpha';

export type ShapeCategory =
  | 'base' | 'scaled' | 'rarity' | 'laby'
  | 'special' | 'crasher' | 'polyhedron'
  | 'user';
export function categoryRateMultiplier(level: number): number {
  if (!level) return 1;
  if (level >= 0) return 1 + level * 0.9;
  return 1 / (1 + (-level) * 0.9);
}

export const RARITY_TIER_ORDER = ['trans', 'rainbow', 'shadow', 'legendary', 'shiny'] as const;
export type RarityTier = typeof RARITY_TIER_ORDER[number];
export const RARITY_P_LEN = 5;

export interface RarityChanceConfig {
  shinyChance: number;
  legendaryChance: number;
  shadowChance: number;
  rainbowChance: number;
  transChance: number;
  rarityEnabled: Record<string, boolean>;
  rarityRateLevel?: number;
  rarityTestMultiplier?: number;
}

function rarityTierRawShare(denom: number, rtm: number, enabled: boolean | undefined): number {
  if (!enabled || !(denom > 0)) return 0;
  const p = rtm / denom;
  return p > 0 && p < Infinity ? p : 0;
}

export function computeRarityTierProbabilities(cfg: RarityChanceConfig, out: Float64Array): number {
  const testMult = (cfg.rarityTestMultiplier ?? 1) > 1 ? (cfg.rarityTestMultiplier as number) : 1;
  const rtm = categoryRateMultiplier(cfg.rarityRateLevel ?? 0) * testMult;
  const en = cfg.rarityEnabled;

  out[0] = rarityTierRawShare(cfg.transChance, rtm, en?.['trans']);
  out[1] = rarityTierRawShare(cfg.rainbowChance, rtm, en?.['rainbow']);
  out[2] = rarityTierRawShare(cfg.shadowChance, rtm, en?.['shadow']);
  out[3] = rarityTierRawShare(cfg.legendaryChance, rtm, en?.['legendary']);
  out[4] = rarityTierRawShare(cfg.shinyChance, rtm, en?.['shiny']);

  let sum = out[0] + out[1] + out[2] + out[3] + out[4];
  if (sum > 1) {
    const scale = 1 / sum;
    out[0] *= scale; out[1] *= scale; out[2] *= scale;
    out[3] *= scale; out[4] *= scale;
    sum = 1;
  }
  return sum;
}

export interface ShapeDefinition {
  id: string;
  displayName: string;
  category: ShapeCategory;
  baseShape: string;
  sides: number;
  rarity: Rarity;
  labyLevel: LabyLevel;
  scaleVariant: ScaleVariant;

  defaultSize: number;
  defaultHp: number;
  defaultBodyDamage: number;
  defaultShield: number;
  defaultShieldRegen: number;
  defaultXpValue: number;
  defaultMass: number;
  defaultPushability: number;
  defaultElasticity: number;
  defaultDriftSpeed: number;
  defaultCenterBias: number;
  defaultSpawnWeight: number;
  defaultResist: number;
  defaultPenetration: number;
  defaultColor: string;
  colorMap?: number;
  opacity: number;
  isAnimatedColor: boolean;
  animationType: AnimationType;
  nestedLayers: number;

  isCrasher: boolean;
  isHostile: boolean;
  isPolyhedron: boolean;

  spawnTier: 'regular' | 'shiny' | 'legendary' | 'nest' | 'crasher' | 'special';

  userCrasherSpeed?: number;
  userIntangible?: boolean;
  userCrasherFacingOffset?: number;

  roundDamage?: number;
  sizeRandomization?: number;
  paceTravel?: number;
  paceTurn?: number;
  ramHealthScale?: number;
  look?: ShapeLook | null;
}

export const RARITY_MULTIPLIERS: Record<Rarity, {
  hpMult: number;
  damageMult: number;
  densityMult: number;
  xpMult: number;
  penetrationMult: number;
  opacity: number;
  isAnimatedColor: boolean;
  animationType: AnimationType;
}> = {
  normal:    { hpMult: 1,   damageMult: 1,   densityMult: 1,   xpMult: 1,    penetrationMult: 1,   opacity: 1.0,  isAnimatedColor: false, animationType: 'none' },
  shiny:     { hpMult: 2,   damageMult: 1,   densityMult: 1,   xpMult: 100,  penetrationMult: 1.5, opacity: 1.0,  isAnimatedColor: false, animationType: 'none' },
  legendary: { hpMult: 4,   damageMult: 1,   densityMult: 1,   xpMult: 500,  penetrationMult: 1.5, opacity: 1.0,  isAnimatedColor: false, animationType: 'none' },
  shadow:    { hpMult: 4,   damageMult: 2,   densityMult: 2,   xpMult: 2000, penetrationMult: 2,   opacity: 0.20, isAnimatedColor: false, animationType: 'none' },
  rainbow:   { hpMult: 6,   damageMult: 2.5, densityMult: 2.5, xpMult: 4000, penetrationMult: 2.5, opacity: 1.0,  isAnimatedColor: true,  animationType: 'rainbow' },
  trans:     { hpMult: 8,   damageMult: 2.5, densityMult: 2.5, xpMult: 5000, penetrationMult: 2.5, opacity: 1.0,  isAnimatedColor: true,  animationType: 'trans' },
};

export const RARITY_COLORS: Record<Rarity, string> = {
  normal:    '',
  shiny:     cmHex(CM.HEALTH_BARS, false, CM_USE.SHAPE),
  legendary: cmHex(CM.SHIELD_BARS, false, CM_USE.SHAPE),
  shadow:    cmHex(CM.ROGUES, false, CM_USE.SHAPE),
  rainbow:   '',
  trans:     '',
};

export const RARITY_COLOR_MAP: Record<Rarity, number | undefined> = {
  normal:    undefined,
  shiny:     CM.HEALTH_BARS,
  legendary: CM.SHIELD_BARS,
  shadow:    CM.ROGUES,
  rainbow:   undefined,
  trans:     undefined,
};

export const ALL_RARITIES: Rarity[] = ['normal', 'shiny', 'legendary', 'shadow', 'rainbow', 'trans'];
export const RARITY_LABELS: Record<Rarity, string> = {
  normal: 'Normal', shiny: 'Shiny', legendary: 'Legendary',
  shadow: 'Shadow', rainbow: 'Rainbow', trans: 'Trans',
};

export const LABY_LABELS: Record<number, string> = {
  0: '', 1: 'Beta', 2: 'Alpha', 3: 'Omega', 4: 'Gamma', 5: 'Delta',
};

export function labyDownscale(sides: number): number {
  return Math.cos(Math.PI / Math.max(sides, 3));
}

export const ARRAS_POLY_INDEX: Record<string, number> = {
  egg: 0, square: 1, triangle: 2, pentagon: 3, hexagon: 4,
};

export const LABY_TIER_TO_HEALTH: Record<number, number> = {
  0: 0.25,
  1: 10,
  2: 20,
  3: 150,
  4: 300,
};

export const LABY_RARITY_TO_HEALTH: Record<number, number> = {
  0: 1, 1: 2, 2: 4, 3: 6, 4: 8, 5: 10,
};

export const RARITY_TO_INDEX: Record<string, number> = {
  normal: 0, shiny: 1, legendary: 2, shadow: 3, rainbow: 4, trans: 5,
};

export const LABY_RARITY_TO_SCORE: Record<number, number> = {
  0: 1, 1: 5, 2: 10, 3: 40, 4: 100, 5: 250,
};

export function getReversedJackpot(x: number): number {
  return x > 39450 ? Math.pow(x - 26300, 1.15) + 26300 : x * 1.5;
}

export function arrasLabyXp(tier: number, level: number, rarity: number): number {
  const raw = tier === 0
    ? 30 * (level > 1 ? Math.pow(6, level - 1) : level) + 8
    : 30 * Math.pow(5, tier + level - 1);
  const rarityScore = LABY_RARITY_TO_SCORE[rarity] ?? 1;
  return getReversedJackpot(Math.min(5e6, raw * rarityScore));
}

export const SHAPE_CATEGORY_DENSITY: Record<ShapeCategory, number> = {
  base:       0.20,
  scaled:     0.43,
  rarity:     0.20,
  laby:       0.20,
  special:    0.009,
  crasher:    0.023,
  polyhedron: 0.55,
  user:       0.20,
};

const MASS_SIZE_CAP = 180;

export function autoMass(size: number, category: ShapeCategory): number {
  const density = SHAPE_CATEGORY_DENSITY[category] ?? SHAPE_CATEGORY_DENSITY.base;
  const s = Math.min(size, MASS_SIZE_CAP);
  return density * (s * s + 1);
}

const AUTO_ELASTICITY_MIN = 0.85;
const AUTO_ELASTICITY_MAX = 1.5;
const AUTO_ELASTICITY_REF = 200;
const AUTO_ELASTICITY_POW = 0.5;
export function autoElasticity(size: number): number {
  const t = Math.min(size / AUTO_ELASTICITY_REF, 1.0);
  const curved = Math.pow(t, AUTO_ELASTICITY_POW);
  return AUTO_ELASTICITY_MAX - (AUTO_ELASTICITY_MAX - AUTO_ELASTICITY_MIN) * curved;
}

export const BASE_SHAPES: Record<BaseShape, {
  sides: number;
  size: number;
  hp: number;
  bodyDamage: number;
  shield: number;
  shieldRegen: number;
  xpValue: number;
  mass: number;
  pushability: number;
  elasticity: number;
  driftSpeed: number;
  centerBias: number;
  spawnWeight: number;
  resist: number;
  penetration: number;
  color: string;
  arrasColor: string;
}> = {
  egg: {
    sides: 0, size: 9, hp: 5, bodyDamage: 0, shield: 1, shieldRegen: 1,
    xpValue: 5, mass: 2, pushability: 1.5, elasticity: 1.5, driftSpeed: 100,
    centerBias: 0, spawnWeight: 65, resist: 1.0, penetration: 1,
    color: '#e8ebf7', arrasColor: '#e8ebf7',
  },
  triangle: {
    sides: 3, size: 20, hp: 30, bodyDamage: 5, shield: 2, shieldRegen: 2,
    xpValue: 120, mass: 65, pushability: 0.8, elasticity: 1.2, driftSpeed: 100,
    centerBias: 40, spawnWeight: 64, resist: 1.15, penetration: 1.5,
    color: '#e7896d', arrasColor: '#e7896d',
  },
  square: {
    sides: 4, size: 28, hp: 10, bodyDamage: 5, shield: 4, shieldRegen: 2,
    xpValue: 30, mass: 126, pushability: 0.6, elasticity: 1.0, driftSpeed: 100,
    centerBias: 15, spawnWeight: 45, resist: 1.0, penetration: 2,
    color: '#efc74b', arrasColor: '#efc74b',
  },
  pentagon: {
    sides: 5, size: 42, hp: 100, bodyDamage: 8, shield: 10, shieldRegen: 4,
    xpValue: 400, mass: 283, pushability: 0.15, elasticity: 1.5, driftSpeed: 100,
    centerBias: 80, spawnWeight: 7, resist: 1.25, penetration: 1.1,
    color: '#8d6adf', arrasColor: '#8d6adf',
  },
  hexagon: {
    sides: 6, size: 50, hp: 200, bodyDamage: 15, shield: 500, shieldRegen: 6,
    xpValue: 500, mass: 400, pushability: 0.1, elasticity: 1.2, driftSpeed: 100,
    centerBias: 90, spawnWeight: 1, resist: 1.3, penetration: 1.1,
    color: '#7adbba', arrasColor: '#7adbba',
  },
};

export const BASE_SHAPE_ORDER: BaseShape[] = ['egg', 'triangle', 'square', 'pentagon', 'hexagon'];

export const SCALED_VARIANTS: Record<string, {
  baseShape: BaseShape;
  scaleVariant: ScaleVariant;
  displayName: string;
  sides: number;
  size: number;
  hp: number;
  bodyDamage: number;
  shield: number;
  shieldRegen: number;
  xpValue: number;
  mass: number;
  pushability: number;
  centerBias: number;
  spawnWeight: number;
  resist: number;
  penetration: number;
  color: string;
}> = {
  betaPentagon: {
    baseShape: 'pentagon', scaleVariant: 'beta', displayName: 'Beta Pentagon', sides: 5,
    size: 110, hp: 750, bodyDamage: 10, shield: 200, shieldRegen: 8,
    xpValue: 2500, mass: 5204, pushability: 0.05, centerBias: 95,
    spawnWeight: 3, resist: 1.5625, penetration: 1.1, color: '#8d6adf',
  },
  alphaPentagon: {
    baseShape: 'pentagon', scaleVariant: 'alpha', displayName: 'Alpha Pentagon', sides: 5,
    size: 170, hp: 5625, bodyDamage: 10, shield: 400, shieldRegen: 12,
    xpValue: 15000, mass: 12428, pushability: 0.02, centerBias: 100,
    spawnWeight: 2, resist: 1.953125, penetration: 1.1, color: '#8d6adf',
  },
  odHexagon: {
    baseShape: 'pentagon', scaleVariant: 'alpha', displayName: 'OD Hexagon', sides: 6,
    size: 147, hp: 600, bodyDamage: 10, shield: 40, shieldRegen: 4,
    xpValue: 21000, mass: 9292, pushability: 0.04, centerBias: 90,
    spawnWeight: 6, resist: 1.953125, penetration: 1.1, color: '#cc669c',
  },
  odSeptagon: {
    baseShape: 'pentagon', scaleVariant: 'alpha', displayName: 'OD Septagon', sides: 7,
    size: 202, hp: 750, bodyDamage: 10, shield: 50, shieldRegen: 5,
    xpValue: 28000, mass: 17545, pushability: 0.035, centerBias: 95,
    spawnWeight: 5, resist: 1.953125, penetration: 1.1, color: '#8abc3f',
  },
  odOctagon: {
    baseShape: 'pentagon', scaleVariant: 'alpha', displayName: 'OD Octagon', sides: 8,
    size: 277, hp: 900, bodyDamage: 10, shield: 60, shieldRegen: 6,
    xpValue: 35000, mass: 32993, pushability: 0.03, centerBias: 98,
    spawnWeight: 4, resist: 1.953125, penetration: 1.1, color: '#7adbba',
  },
  odNonagon: {
    baseShape: 'pentagon', scaleVariant: 'alpha', displayName: 'OD Nonagon', sides: 9,
    size: 420, hp: 1050, bodyDamage: 10, shield: 70, shieldRegen: 7,
    xpValue: 42000, mass: 75852, pushability: 0.025, centerBias: 100,
    spawnWeight: 3, resist: 1.953125, penetration: 1.1, color: '#ffffff',
  },
};

export const SPECIAL_SHAPES: Record<string, {
  sides: number;
  size: number;
  hp: number;
  bodyDamage: number;
  shield: number;
  shieldRegen: number;
  xpValue: number;
  mass: number;
  pushability: number;
  centerBias: number;
  resist: number;
  penetration: number;
  color: string;
}> = {
  gem: {
    sides: 6, size: 9, hp: 10, bodyDamage: 1, shield: 0, shieldRegen: 0,
    xpValue: 2000, mass: 20, pushability: 0.25, centerBias: 0,
    resist: 2.0, penetration: 2, color: '#7adbba',
  },
  jewel: {
    sides: 6, size: 16, hp: 50, bodyDamage: 1, shield: 0, shieldRegen: 0,
    xpValue: 100000, mass: 40, pushability: 0.25, centerBias: 0,
    resist: 2.0, penetration: 2, color: '#fdf380',
  },
};

export const CRASHER_DEFS: Record<string, {
  sides: number;
  size: number;
  hp: number;
  bodyDamage: number;
  xpValue: number;
  mass: number;
  speed: number;
  color: string;
  facingOffset: number;
  spawnWeight: number;
}> = {
  crasherEgg:      { sides: 0, size: 9,  hp: 5,  bodyDamage: 12, xpValue: 15,  mass: 1.5, speed: 4.5, color: '#ef99c3', facingOffset: 0,                  spawnWeight: 30 },
  crasherTriangle: { sides: 3, size: 10, hp: 15, bodyDamage: 25, xpValue: 50,  mass: 2.0, speed: 3.5, color: '#ef99c3', facingOffset: Math.PI / 2,         spawnWeight: 25 },
  crasherSquare:   { sides: 4, size: 28, hp: 8,  bodyDamage: 30, xpValue: 75,  mass: 2.5, speed: 3.0, color: '#ef99c3', facingOffset: 0,                  spawnWeight: 20 },
  crasherPentagon: { sides: 5, size: 42, hp: 38, bodyDamage: 40, xpValue: 130, mass: 3.0, speed: 2.5, color: '#ef99c3', facingOffset: Math.PI / 2,         spawnWeight: 15 },
  crasherHexagon:  { sides: 6, size: 50, hp: 60, bodyDamage: 55, xpValue: 200, mass: 3.5, speed: 2.0, color: '#ef99c3', facingOffset: Math.PI / 2,         spawnWeight: 10 },
  crasher:         { sides: 3, size: 5,  hp: 4.63,  bodyDamage: 13.89, xpValue: 47, mass: 1.0, speed: 3.5, color: '#ef99c3', facingOffset: Math.PI / 2,         spawnWeight: 0 },
  megaCrasher:     { sides: 3, size: 10, hp: 18.52, bodyDamage: 27.78, xpValue: 188, mass: 2.0, speed: 3.0, color: '#ef99c3', facingOffset: Math.PI / 2,        spawnWeight: 0 },
};

export const RETIRED_POLYHEDRA: ReadonlySet<string> = new Set(['sphere', 'tetrahedron', 'octahedron', 'tesseract']);

export const POLYHEDRA_DEFS: Record<string, {
  size: number;
  hp: number;
  bodyDamage: number;
  xpValue: number;
  mass: number;
  resist: number;
  penetration: number;
  color: string;
}> = {
  cube: {
    size: 20, hp: 200, bodyDamage: 24, xpValue: 20000000,
    mass: 193, resist: 1.25, penetration: 17.5, color: '#e8ebf7',
  },
  dodecahedron: {
    size: 36, hp: 350, bodyDamage: 35, xpValue: 50000000,
    mass: 623, resist: 1.25, penetration: 32.5, color: '#e8ebf7',
  },
  icosahedron: {
    size: 40, hp: 400, bodyDamage: 45, xpValue: 100000000,
    mass: 769, resist: 1.25, penetration: 35, color: '#e8ebf7',
  },
};
Object.setPrototypeOf(POLYHEDRA_DEFS, null);

export const SHAPE_COLOR_MAP: Readonly<Record<string, number | undefined>> = Object.freeze({
  egg: CM.EGGS, triangle: CM.TRIANGLES, square: CM.SQUARES, pentagon: CM.PENTAGONS, hexagon: CM.HEXAGONS,
  betaPentagon: CM.PENTAGONS, alphaPentagon: CM.PENTAGONS,
  odHexagon: CM.PURPLE, odSeptagon: CM.GREEN, odOctagon: CM.HEXAGONS,
  gem: CM.HEXAGONS, jewel: CM.NEUTRAL,
  crasherEgg: CM.CRASHERS, crasherTriangle: CM.CRASHERS, crasherSquare: CM.CRASHERS,
  crasherPentagon: CM.CRASHERS, crasherHexagon: CM.CRASHERS, crasher: CM.CRASHERS, megaCrasher: CM.CRASHERS,
  cube: CM.EGGS, dodecahedron: CM.EGGS, icosahedron: CM.EGGS,
});


export function polyhedronExtent(key: string): number { return solidOf(key)?.circumradius ?? 1; }

export type AnimationType = 'none' | 'rainbow' | 'trans'
  | 'flashBlueRed' | 'flashBlueGrey' | 'flashGreyBlue' | 'flashRedGrey' | 'flashGreyRed';

const _FLASH_INDEX: Record<string, number> = { flashBlueRed: 0, flashBlueGrey: 1, flashGreyBlue: 2, flashRedGrey: 3, flashGreyRed: 4 };

let _lastColorFrame = -1;
let _lastWorldColorFrame = -1;

export function updateAnimatedColors(frameCount: number): void {
  if (frameCount === _lastColorFrame) return;
  _lastColorFrame = frameCount;
  acTick(Date.now(), AC_UI);
}

export function updateWorldAnimatedColors(frameCount: number, gameNowMs: number): void {
  if (frameCount === _lastWorldColorFrame) return;
  _lastWorldColorFrame = frameCount;
  acTick(gameNowMs, AC_WORLD);
}

export function getRainbowColor(): string { return acRainbowHex(AC_UI); }
export function getTransColor(): string { return acTransHex(AC_UI); }

function _animatedColorOn(clock: number, type: string, dark: boolean): string {
  if (type === 'rainbow') return acRainbowHex(clock);
  const flash = _FLASH_INDEX[type];
  if (flash === undefined) return acTransHex(clock);
  const pair = AC_FLASH_SLOTS[flash];
  return cmHex(acFlashIsFirst(clock) ? pair[0] : pair[1], dark, CM_USE.SHAPE);
}
export function getAnimatedColor(type: string, dark: boolean): string { return _animatedColorOn(AC_UI, type, dark); }
export function getWorldAnimatedColor(type: string, dark: boolean): string { return _animatedColorOn(AC_WORLD, type, dark); }

export const SHAPE_DEFINITIONS: Map<string, ShapeDefinition> = new Map();
export const SHAPE_DEFS_BY_CATEGORY: Map<ShapeCategory, ShapeDefinition[]> = new Map();

function makeDef(partial: Partial<ShapeDefinition> & { id: string; displayName: string; category: ShapeCategory }): ShapeDefinition {
  return {
    baseShape: 'egg',
    sides: 0,
    rarity: 'normal',
    labyLevel: 0 as LabyLevel,
    scaleVariant: 'normal',
    defaultSize: 15,
    defaultHp: 5,
    defaultBodyDamage: 10,
    defaultShield: 0,
    defaultShieldRegen: 0,
    defaultXpValue: 5,
    defaultMass: 2,
    defaultPushability: 0.6,
    defaultElasticity: 1.0,
    defaultDriftSpeed: 100,
    defaultCenterBias: 0,
    defaultSpawnWeight: 0,
    defaultResist: 1.0,
    defaultPenetration: 1.0,
    defaultColor: '#ffffff',
    opacity: 1.0,
    isAnimatedColor: false,
    animationType: 'none' as const,
    nestedLayers: 0,
    isCrasher: false,
    isHostile: false,
    isPolyhedron: false,
    spawnTier: 'regular' as const,
    ...partial,
  };
}

function registerDef(def: ShapeDefinition): void {
  SHAPE_DEFINITIONS.set(def.id, def);
  let list = SHAPE_DEFS_BY_CATEGORY.get(def.category);
  if (!list) { list = []; SHAPE_DEFS_BY_CATEGORY.set(def.category, list); }
  list.push(def);
}

function buildRegistry(): void {
  for (const key of BASE_SHAPE_ORDER) {
    const b = BASE_SHAPES[key];
    registerDef(makeDef({
      id: key,
      displayName: key.charAt(0).toUpperCase() + key.slice(1),
      category: 'base',
      baseShape: key,
      sides: b.sides,
      defaultSize: b.size,
      defaultHp: b.hp,
      defaultBodyDamage: b.bodyDamage,
      defaultShield: b.shield,
      defaultShieldRegen: b.shieldRegen,
      defaultXpValue: b.xpValue,
      defaultMass: b.mass,
      defaultPushability: b.pushability,
      defaultElasticity: b.elasticity,
      defaultDriftSpeed: b.driftSpeed,
      defaultCenterBias: b.centerBias,
      defaultSpawnWeight: b.spawnWeight,
      defaultResist: b.resist,
      defaultPenetration: b.penetration,
      defaultColor: b.color,
      colorMap: SHAPE_COLOR_MAP[key],
      spawnTier: 'regular',
    }));
  }

  const nonNormalRarities: Rarity[] = ['shiny', 'legendary', 'shadow', 'rainbow', 'trans'];
  for (const key of BASE_SHAPE_ORDER) {
    const b = BASE_SHAPES[key];
    for (const rar of nonNormalRarities) {
      const rm = RARITY_MULTIPLIERS[rar];
      const rarColor = RARITY_COLORS[rar] || b.color;
      const id = `${rar}${key.charAt(0).toUpperCase() + key.slice(1)}`;
      const displayName = `${RARITY_LABELS[rar]} ${key.charAt(0).toUpperCase() + key.slice(1)}`;
      registerDef(makeDef({
        id,
        displayName,
        category: 'rarity',
        baseShape: key,
        sides: b.sides,
        rarity: rar,
        defaultSize: b.size,
        defaultHp: b.hp * rm.hpMult,
        defaultBodyDamage: b.bodyDamage * rm.damageMult,
        defaultShield: b.shield,
        defaultShieldRegen: b.shieldRegen,
        defaultXpValue: b.xpValue * rm.xpMult,
        defaultMass: b.mass * rm.densityMult,
        defaultPushability: b.pushability,
        defaultElasticity: b.elasticity,
        defaultDriftSpeed: b.driftSpeed,
        defaultCenterBias: b.centerBias,
        defaultSpawnWeight: b.spawnWeight,
        defaultResist: b.resist,
        defaultPenetration: b.penetration,
        defaultColor: rarColor,
        colorMap: RARITY_COLORS[rar] ? RARITY_COLOR_MAP[rar] : SHAPE_COLOR_MAP[key],
        opacity: rm.opacity,
        isAnimatedColor: rm.isAnimatedColor,
        animationType: rm.animationType,
        spawnTier: rar === 'shiny' ? 'shiny' : rar === 'legendary' ? 'legendary' : 'regular',
      }));
    }
  }

  for (const key of BASE_SHAPE_ORDER) {
    const b = BASE_SHAPES[key];
    for (let lvl = 1; lvl <= 5; lvl++) {
      const label = LABY_LABELS[lvl];
      const capKey = key.charAt(0).toUpperCase() + key.slice(1);
      const isLabyPentagonCollision = key === 'pentagon' && (lvl === 1 || lvl === 2);
      const id = isLabyPentagonCollision ? `laby${label}${capKey}` : `${label.toLowerCase()}${capKey}`;
      const displayName = `${label} ${capKey}`;
      const healthMultiplier = Math.pow(5, lvl) - (lvl > 2 ? Math.pow(5, lvl) / Math.pow(5, lvl - 2) : 0);
      const polyIndex = ARRAS_POLY_INDEX[key] ?? 0;
      const tierHealthBase = LABY_TIER_TO_HEALTH[polyIndex] ?? 0.25;
      const ds = labyDownscale(b.sides);
      const sizeMult = 1 / Math.pow(ds, lvl);
      const triScale = key === 'triangle' ? 2 / 3 : 1;
      registerDef(makeDef({
        id,
        displayName,
        category: 'laby',
        baseShape: key,
        sides: b.sides,
        labyLevel: lvl as LabyLevel,
        defaultSize: b.size * sizeMult * triScale,
        defaultHp: tierHealthBase * Math.max(1, healthMultiplier),
        defaultBodyDamage: b.bodyDamage,
        defaultShield: b.shield * (1 + lvl),
        defaultShieldRegen: b.shieldRegen * (1 + lvl * 0.5),
        defaultXpValue: arrasLabyXp(polyIndex, lvl, 0),
        defaultMass: b.mass * sizeMult * 2,
        defaultPushability: Math.max(0.01, b.pushability / sizeMult),
        defaultElasticity: b.elasticity,
        defaultDriftSpeed: Math.max(20, b.driftSpeed - lvl * 15),
        defaultCenterBias: Math.min(100, b.centerBias + lvl * 10),
        defaultSpawnWeight: 0,
        defaultResist: b.resist,
        defaultPenetration: b.penetration,
        defaultColor: b.color,
        colorMap: SHAPE_COLOR_MAP[key],
        nestedLayers: lvl,
        spawnTier: 'regular',
      }));
    }
  }

  for (const key of BASE_SHAPE_ORDER) {
    const b = BASE_SHAPES[key];
    for (let lvl = 1; lvl <= 5; lvl++) {
      const labyLabel = LABY_LABELS[lvl];
      const healthMultiplier = Math.pow(5, lvl) - (lvl > 2 ? Math.pow(5, lvl) / Math.pow(5, lvl - 2) : 0);
      const polyIndex = ARRAS_POLY_INDEX[key] ?? 0;
      const tierHealthBase = LABY_TIER_TO_HEALTH[polyIndex] ?? 0.25;
      const ds = labyDownscale(b.sides);
      const sizeMult = 1 / Math.pow(ds, lvl);
      const triScale = key === 'triangle' ? 2 / 3 : 1;
      const capKey = key.charAt(0).toUpperCase() + key.slice(1);

      for (const rar of nonNormalRarities) {
        const rm = RARITY_MULTIPLIERS[rar];
        const rarColor = RARITY_COLORS[rar] || b.color;
        const rarIdx = RARITY_TO_INDEX[rar] ?? 0;
        const labyRarHealth = LABY_RARITY_TO_HEALTH[rarIdx] ?? 1;
        const isLabyPentagonCollision = key === 'pentagon' && (lvl === 1 || lvl === 2);
        const id = isLabyPentagonCollision ? `${rar}Laby${labyLabel}${capKey}` : `${rar}${labyLabel}${capKey}`;
        const displayName = `${RARITY_LABELS[rar]} ${labyLabel} ${capKey}`;
        registerDef(makeDef({
          id,
          displayName,
          category: 'laby',
          baseShape: key,
          sides: b.sides,
          rarity: rar,
          labyLevel: lvl as LabyLevel,
          defaultSize: b.size * sizeMult * triScale,
          defaultHp: tierHealthBase * Math.max(1, healthMultiplier) * labyRarHealth,
          defaultBodyDamage: b.bodyDamage * rm.damageMult,
          defaultShield: b.shield * (1 + lvl),
          defaultShieldRegen: b.shieldRegen * (1 + lvl * 0.5),
          defaultXpValue: arrasLabyXp(polyIndex, lvl, rarIdx),
          defaultMass: b.mass * sizeMult * 2 * rm.densityMult,
          defaultPushability: Math.max(0.01, b.pushability / sizeMult),
          defaultElasticity: b.elasticity,
          defaultDriftSpeed: Math.max(20, b.driftSpeed - lvl * 15),
          defaultCenterBias: Math.min(100, b.centerBias + lvl * 10),
          defaultSpawnWeight: 0,
          defaultResist: b.resist,
          defaultPenetration: b.penetration,
          defaultColor: rarColor,
          colorMap: RARITY_COLORS[rar] ? RARITY_COLOR_MAP[rar] : SHAPE_COLOR_MAP[key],
          opacity: rm.opacity,
          isAnimatedColor: rm.isAnimatedColor,
          animationType: rm.animationType,
          nestedLayers: lvl,
          spawnTier: 'regular',
        }));
      }
    }
  }

  for (const [key, sv] of Object.entries(SCALED_VARIANTS)) {
    registerDef(makeDef({
      id: key,
      displayName: `${sv.displayName} (Scaled)`,
      category: 'scaled',
      baseShape: sv.baseShape,
      sides: sv.sides,
      scaleVariant: sv.scaleVariant,
      defaultSize: sv.size,
      defaultHp: sv.hp,
      defaultBodyDamage: sv.bodyDamage,
      defaultShield: sv.shield,
      defaultShieldRegen: sv.shieldRegen,
      defaultXpValue: sv.xpValue,
      defaultMass: sv.mass,
      defaultPushability: sv.pushability,
      defaultElasticity: 1.2,
      defaultDriftSpeed: 60,
      defaultCenterBias: sv.centerBias,
      defaultSpawnWeight: sv.spawnWeight,
      defaultResist: sv.resist,
      defaultPenetration: sv.penetration,
      defaultColor: sv.color,
      colorMap: SHAPE_COLOR_MAP[key],
      spawnTier: 'regular',
    }));
  }

  for (const [key, sv] of Object.entries(SCALED_VARIANTS)) {
    const capKey = key.charAt(0).toUpperCase() + key.slice(1);
    const variantLabel = sv.displayName;
    for (const rar of nonNormalRarities) {
      const rm = RARITY_MULTIPLIERS[rar];
      const rarColor = RARITY_COLORS[rar] || sv.color;
      const id = `${rar}${capKey}`;
      const displayName = `${RARITY_LABELS[rar]} ${variantLabel}`;
      registerDef(makeDef({
        id,
        displayName,
        category: 'scaled',
        baseShape: sv.baseShape,
        sides: sv.sides,
        rarity: rar,
        scaleVariant: sv.scaleVariant,
        defaultSize: sv.size,
        defaultHp: sv.hp * rm.hpMult,
        defaultBodyDamage: sv.bodyDamage * rm.damageMult,
        defaultShield: sv.shield,
        defaultShieldRegen: sv.shieldRegen,
        defaultXpValue: sv.xpValue * rm.xpMult,
        defaultMass: sv.mass * rm.densityMult,
        defaultPushability: sv.pushability,
        defaultElasticity: 1.2,
        defaultDriftSpeed: 60,
        defaultCenterBias: sv.centerBias,
        defaultSpawnWeight: sv.spawnWeight,
        defaultResist: sv.resist,
        defaultPenetration: sv.penetration,
        defaultColor: rarColor,
        colorMap: RARITY_COLORS[rar] ? RARITY_COLOR_MAP[rar] : SHAPE_COLOR_MAP[key],
        opacity: rm.opacity,
        isAnimatedColor: rm.isAnimatedColor,
        animationType: rm.animationType,
        spawnTier: rar === 'shiny' ? 'shiny' : rar === 'legendary' ? 'legendary' : 'regular',
      }));
    }
  }

  for (const [key, sp] of Object.entries(SPECIAL_SHAPES)) {
    registerDef(makeDef({
      id: key,
      displayName: key.charAt(0).toUpperCase() + key.slice(1),
      category: 'special',
      baseShape: key,
      sides: sp.sides,
      defaultSize: sp.size,
      defaultHp: sp.hp,
      defaultBodyDamage: sp.bodyDamage,
      defaultShield: sp.shield,
      defaultShieldRegen: sp.shieldRegen,
      defaultXpValue: sp.xpValue,
      defaultMass: sp.mass,
      defaultPushability: sp.pushability,
      defaultElasticity: 1.0,
      defaultDriftSpeed: 100,
      defaultCenterBias: sp.centerBias,
      defaultSpawnWeight: 0,
      defaultResist: sp.resist,
      defaultPenetration: sp.penetration,
      defaultColor: sp.color,
      colorMap: SHAPE_COLOR_MAP[key],
      spawnTier: key === 'gem' ? 'shiny' : 'legendary',
    }));
  }

  for (const [key, cr] of Object.entries(CRASHER_DEFS)) {
    const shapeName = key.slice(7);
    const label = 'Crasher ' + shapeName.charAt(0).toUpperCase() + shapeName.slice(1);
    registerDef(makeDef({
      id: key,
      displayName: label,
      category: 'crasher',
      baseShape: key,
      sides: cr.sides,
      defaultSize: cr.size,
      defaultHp: cr.hp,
      defaultBodyDamage: cr.bodyDamage,
      defaultShield: 0,
      defaultShieldRegen: 0,
      defaultXpValue: cr.xpValue,
      defaultMass: cr.mass,
      defaultPushability: 0.3,
      defaultElasticity: 1.0,
      defaultDriftSpeed: 100,
      defaultCenterBias: 50,
      defaultSpawnWeight: 1,
      defaultColor: cr.color,
      colorMap: SHAPE_COLOR_MAP[key],
      isCrasher: true,
      isHostile: true,
      spawnTier: 'crasher',
    }));
  }

  for (const [key, ph] of Object.entries(POLYHEDRA_DEFS)) {
    registerDef(makeDef({
      id: key,
      displayName: key.charAt(0).toUpperCase() + key.slice(1),
      category: 'polyhedron',
      baseShape: key,
      sides: -1,
      defaultSize: ph.size,
      defaultHp: ph.hp,
      defaultBodyDamage: ph.bodyDamage,
      defaultShield: 0,
      defaultShieldRegen: 0,
      defaultXpValue: ph.xpValue,
      defaultMass: ph.mass,
      defaultPushability: 0.02,
      defaultElasticity: 1.0,
      defaultDriftSpeed: 30,
      defaultCenterBias: 100,
      defaultSpawnWeight: 0,
      defaultResist: ph.resist,
      defaultPenetration: ph.penetration,
      defaultColor: ph.color,
      colorMap: SHAPE_COLOR_MAP[key],
      isPolyhedron: true,
      spawnTier: 'special',
    }));
  }
}

function applyShapeBook(): void {
  layShapeBookRows(SHAPE_BOOK);
  if (SHAPE_SCORES !== 0) {
    for (const id in SHAPE_BOOK_SCORE) {
      const def = SHAPE_DEFINITIONS.get(id);
      if (def) def.defaultXpValue = SHAPE_BOOK_SCORE[id];
    }
  }
}

export function layShapeBookRows(book: Readonly<Record<string, ShapeBookRow>>): void {
  for (const id in book) {
    const def = SHAPE_DEFINITIONS.get(id);
    if (!def) continue;
    const r = book[id];
    def.defaultSize = r.size;
    def.defaultHp = r.hp;
    def.defaultShield = r.shield;
    def.defaultShieldRegen = 0;
    def.roundDamage = r.hit;
    def.sizeRandomization = r.spread;
    def.paceTravel = r.travel;
    def.paceTurn = r.turn;
    def.ramHealthScale = r.ram;
    if (r.bd !== undefined) def.defaultBodyDamage = r.bd;
  }
}

buildRegistry();
if (SHAPES_ARRAS !== 0) applyShapeBook();

export function isBuiltInShapeId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  const def = SHAPE_DEFINITIONS.get(id);
  return !!def && def.category !== 'user';
}

export function getShapeDef(id: string): ShapeDefinition | undefined {
  return SHAPE_DEFINITIONS.get(id);
}

export function getDefsForCategory(cat: ShapeCategory): ShapeDefinition[] {
  return SHAPE_DEFS_BY_CATEGORY.get(cat) || [];
}

export function getAllShapeDefs(): ShapeDefinition[] {
  return Array.from(SHAPE_DEFINITIONS.values());
}

export function shapeSayName(def: ShapeDefinition | undefined): string {
  if (!def) return '';
  if (def.category === 'polyhedron') return 'The ' + def.displayName;
  return def.displayName.replace(/ \(Scaled\)$/, '');
}

export function shapeKillLineName(def: ShapeDefinition | undefined): string {
  if (!def || def.category === 'user') return '';
  const said = def.rarity !== 'normal'
    || def.category === 'special'
    || def.category === 'polyhedron'
    || (def.category === 'laby' && def.labyLevel >= 2)
    || def.id === 'betaPentagon' || def.id === 'alphaPentagon';
  return said ? shapeSayName(def) : '';
}

let _shapeRegistryVersion = 0;
export function getShapeRegistryVersion(): number { return _shapeRegistryVersion; }

const USER_SHAPE_ID_PREFIX = 'user:';
const USER_SHAPE_SLUG_MAX = 48;

export function makeUserShapeId(name: string): string {
  return USER_SHAPE_ID_PREFIX + (nameSlug(name, USER_SHAPE_SLUG_MAX) || 'shape');
}
export function makeUserShapeIdLegacy(name: string): string {
  return USER_SHAPE_ID_PREFIX + (nameSlugLegacy(name, USER_SHAPE_SLUG_MAX) || 'shape');
}

function getUserShapeList(): ShapeDefinition[] {
  let list = SHAPE_DEFS_BY_CATEGORY.get('user');
  if (!list) { list = []; SHAPE_DEFS_BY_CATEGORY.set('user', list); }
  return list;
}

export function effectiveShapeColor(design: Pick<FoodShapeDesign, 'rarity' | 'color'>): string {
  return RARITY_COLORS[design.rarity] || design.color;
}

export function effectiveShapeColorMap(design: Pick<FoodShapeDesign, 'rarity' | 'colorMap'>): number | undefined {
  return RARITY_COLORS[design.rarity] ? RARITY_COLOR_MAP[design.rarity] : cmMapOf(design.colorMap);
}

export function userShapeMass(design: Pick<FoodShapeDesign, 'size' | 'polyhedronType' | 'isCrasher'>): number {
  const cat: ShapeCategory = design.polyhedronType && POLYHEDRA_DEFS[design.polyhedronType] ? 'polyhedron'
    : design.isCrasher ? 'crasher' : 'user';
  return autoMass(design.size, cat);
}

export function buildUserShapeDef(design: FoodShapeDesign): ShapeDefinition {
  const rm = RARITY_MULTIPLIERS[design.rarity];
  const isCrasher = design.isCrasher === true;
  const poly = design.polyhedronType && POLYHEDRA_DEFS[design.polyhedronType] ? design.polyhedronType : null;
  return {
    id: design.shapeId,
    displayName: design.name,
    category: 'user',
    baseShape: poly ?? (isCrasher ? 'crasher' : 'user'),
    sides: poly ? -1 : design.sides,
    rarity: design.rarity,
    labyLevel: design.labyLevel,
    scaleVariant: 'normal',
    defaultSize: design.size,
    defaultHp: design.hp,
    defaultBodyDamage: design.bodyDamage,
    defaultShield: design.shield,
    defaultShieldRegen: design.shieldRegen,
    defaultXpValue: SHAPE_SCORES === 0 && typeof design.arras?.xpBefore === 'number' ? design.arras.xpBefore : design.xpValue,
    defaultMass: userShapeMass(design),
    defaultPushability: design.pushability,
    defaultElasticity: autoElasticity(design.size),
    defaultDriftSpeed: design.driftSpeed,
    defaultCenterBias: design.centerBias,
    defaultSpawnWeight: 0,
    defaultResist: design.resist,
    defaultPenetration: design.penetration,
    defaultColor: effectiveShapeColor(design),
    colorMap: effectiveShapeColorMap(design),
    opacity: rm.opacity,
    isAnimatedColor: rm.isAnimatedColor,
    animationType: rm.animationType,
    nestedLayers: design.labyLevel,
    isCrasher,
    isHostile: isCrasher,
    isPolyhedron: poly !== null,
    spawnTier: isCrasher ? 'crasher' : 'regular',
    userCrasherSpeed: design.crasherSpeed,
    userIntangible: design.isIntangible === true,
    userCrasherFacingOffset: design.crasherFacingOffset
      ?? ((design.sides === 3 || design.sides === 5 || design.sides === 6) ? Math.PI / 2 : 0),
    ...(SHAPES_ARRAS !== 0 && typeof design.hitOnRounds === 'number' ? { roundDamage: design.hitOnRounds } : null),
    ...(SHAPES_ARRAS !== 0 && typeof design.sizeRandomization === 'number' && design.sizeRandomization > 0 ? { sizeRandomization: design.sizeRandomization } : null),
    ...(SHAPES_ARRAS !== 0 && typeof design.pathTurn === 'number' ? { paceTurn: design.pathTurn / 100 } : null),
    ...(SHAPES_ARRAS !== 0 && typeof design.ramHealthScale === 'number' && design.ramHealthScale > 0 ? { ramHealthScale: design.ramHealthScale } : null),
    ...(design.look !== undefined ? { look: makeShapeLook(design.look) } : null),
  };
}

export function baseColorOfDef(def: ShapeDefinition): string {
  if (!RARITY_COLORS[def.rarity]) return def.defaultColor;
  if (def.category === 'scaled') {
    const key = def.id.charAt(def.rarity.length).toLowerCase() + def.id.slice(def.rarity.length + 1);
    return SCALED_VARIANTS[key]?.color ?? def.defaultColor;
  }
  if (def.category === 'special') return SPECIAL_SHAPES[def.baseShape]?.color ?? def.defaultColor;
  return (BASE_SHAPES as Record<string, { color: string }>)[def.baseShape]?.color ?? def.defaultColor;
}

export function baseColorMapOfDef(def: ShapeDefinition): number | undefined {
  if (!RARITY_COLORS[def.rarity]) return def.colorMap;
  if (def.category === 'user') return undefined;
  if (def.category === 'scaled') {
    const key = def.id.charAt(def.rarity.length).toLowerCase() + def.id.slice(def.rarity.length + 1);
    return SCALED_VARIANTS[key] ? SHAPE_COLOR_MAP[key] : undefined;
  }
  return SHAPE_COLOR_MAP[def.baseShape];
}

export function designFromShapeDef(def: ShapeDefinition): FoodShapeDesign {
  return {
    _designVersion: 1,
    shapeId: makeUserShapeId(def.displayName),
    name: def.displayName,
    sides: def.sides < 0 ? 0 : def.sides,
    polyhedronType: def.isPolyhedron ? def.baseShape : undefined,
    color: baseColorOfDef(def),
    ...(baseColorMapOfDef(def) !== undefined ? { colorMap: baseColorMapOfDef(def) } : null),
    isIntangible: def.baseShape === 'egg' ? true : undefined,
    crasherFacingOffset: CRASHER_DEFS[def.baseShape]?.facingOffset,
    rarity: def.rarity,
    labyLevel: def.labyLevel,
    size: def.defaultSize,
    hp: def.defaultHp,
    bodyDamage: def.defaultBodyDamage,
    shield: def.defaultShield,
    shieldRegen: def.defaultShieldRegen,
    xpValue: def.defaultXpValue,
    pushability: def.defaultPushability,
    driftSpeed: def.defaultDriftSpeed,
    centerBias: def.defaultCenterBias,
    resist: def.defaultResist,
    penetration: def.defaultPenetration,
    isCrasher: def.isCrasher,
    crasherSpeed: def.userCrasherSpeed ?? CRASHER_DEFS[def.baseShape]?.speed ?? 0,
    ...(def.paceTravel !== undefined ? { driftSpeed: def.paceTravel * 100 } : null),
    ...(def.paceTurn !== undefined ? { pathTurn: def.paceTurn * 100 } : null),
    ...(def.roundDamage !== undefined ? { hitOnRounds: def.roundDamage } : null),
    ...(def.sizeRandomization !== undefined ? { sizeRandomization: def.sizeRandomization } : null),
    ...(def.ramHealthScale !== undefined ? { ramHealthScale: def.ramHealthScale } : null),
    ...(def.look ? { look: { body: def.look.body } } : null),
  };
}

export function inverseReversedJackpot(y: number): number {
  const upperStart = Math.pow(39450 - 26300, 1.15) + 26300;
  return y > upperStart ? Math.pow(y - 26300, 1 / 1.15) + 26300 : y / 1.5;
}

export function rescaleDesignForRarity(design: FoodShapeDesign, next: Rarity): FoodShapeDesign {
  const from = RARITY_MULTIPLIERS[design.rarity];
  const to = RARITY_MULTIPLIERS[next];
  let hp: number;
  let xpValue: number;
  if (SHAPE_SCORES !== 0) {
    xpValue = design.xpValue * ((SHAPE_SCORE_RARE_TIMES[next] ?? 1) / (SHAPE_SCORE_RARE_TIMES[design.rarity] ?? 1));
    hp = design.labyLevel > 0
      ? design.hp * ((LABY_RARITY_TO_HEALTH[RARITY_TO_INDEX[next] ?? 0] ?? 1) / (LABY_RARITY_TO_HEALTH[RARITY_TO_INDEX[design.rarity] ?? 0] ?? 1))
      : design.hp * (to.hpMult / from.hpMult);
  } else if (design.labyLevel > 0) {
    const fi = RARITY_TO_INDEX[design.rarity] ?? 0;
    const ti = RARITY_TO_INDEX[next] ?? 0;
    hp = design.hp * ((LABY_RARITY_TO_HEALTH[ti] ?? 1) / (LABY_RARITY_TO_HEALTH[fi] ?? 1));
    xpValue = design.xpValue * ((LABY_RARITY_TO_SCORE[ti] ?? 1) / (LABY_RARITY_TO_SCORE[fi] ?? 1));
  } else {
    hp = design.hp * (to.hpMult / from.hpMult);
    xpValue = design.xpValue * (to.xpMult / from.xpMult);
  }
  return {
    ...design,
    rarity: next,
    hp,
    bodyDamage: design.bodyDamage * (to.damageMult / from.damageMult),
    xpValue,
  };
}

export function registerUserShapeDef(def: ShapeDefinition): void {
  if (def.category !== 'user' || typeof def.id !== 'string' || !def.id.startsWith(USER_SHAPE_ID_PREFIX)) {
    throw new Error(`registerUserShapeDef refused "${def.id}": only a category 'user' def with a 'user:' id may be registered at runtime.`);
  }
  const list = getUserShapeList();
  const existing = SHAPE_DEFINITIONS.get(def.id);
  if (existing) {
    if (existing.category !== 'user') {
      throw new Error(`registerUserShapeDef refused "${def.id}": that id belongs to a built-in.`);
    }
    const idx = list.indexOf(existing);
    if (idx >= 0) list[idx] = def; else list.push(def);
  } else {
    list.push(def);
  }
  SHAPE_DEFINITIONS.set(def.id, def);
  _shapeRegistryVersion++;
}

export function unregisterUserShapeDef(id: string): boolean {
  const existing = SHAPE_DEFINITIONS.get(id);
  if (!existing || existing.category !== 'user') return false;
  SHAPE_DEFINITIONS.delete(id);
  const list = SHAPE_DEFS_BY_CATEGORY.get('user');
  if (list) {
    const idx = list.indexOf(existing);
    if (idx >= 0) list.splice(idx, 1);
  }
  _shapeRegistryVersion++;
  return true;
}

export function getUserShapeDefs(): ShapeDefinition[] {
  return getUserShapeList();
}

export function legacyTypeToBaseShape(oldType: string): BaseShape {
  if (oldType === 'circle') return 'egg';
  if (oldType === 'triangle' || oldType === 'square' || oldType === 'pentagon' || oldType === 'hexagon') return oldType as BaseShape;
  return 'egg';
}

export function baseShapeToLegacyType(base: string): string {
  if (base === 'egg') return 'circle';
  return base;
}

export const SPAWN_TIER_WEIGHTS = {
  regular: { egg: 65, triangle: 64, square: 45, pentagon: 7, hexagon: 1 },
  shiny: { gem: 625, triangle: 125, square: 25, pentagon: 5, hexagon: 1 },
  legendary: { jewel: 1296, triangle: 216, square: 36, pentagon: 6, hexagon: 1 },
};
