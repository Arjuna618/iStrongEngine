import type { ExportFile, GameModeConfig, MapConfig, MultiAreaMapConfig } from '@/types';
import { PORTAL_THINGS_WORDS } from '@/types';
import { MAZE_TYPE_CUSTOM, INITIAL_GAME_STATE, PORTAL_TIMING_DEFAULTS, createDefaultMapConfig, DEFAULT_MAP_CONFIG, DEFAULT_SHAPE_SPAWN_CONFIG, SHAPE_SPAWN_CONFIG_OF_BEFORE, SNAP_COUNTS } from '@/types';
import { SHAPES_ARRAS, SHAPE_SCORES, SHAPE_SPAWN_PLAN } from './shapesSwitch';
import { SPAWN_ZONE_MIN_SCALE, SPAWN_ZONE_MAX_SCALE, MAP_GRID_MIN, MAP_GRID_MAX_SIDE, MAP_SCALE_MIN, MAP_SCALE_MAX, clampGridSize, areaGapOf , cleanMapPaint } from './MapSystem';
import { rockTilesOf } from './portalModes';
import { ALL_MODES } from './allModesSwitch';
import {
  BASE_PROTECTOR_MAX_COUNT, BASE_PROTECTOR_MAX_PUSH_STRENGTH,
  BASE_PROTECTOR_MIN_RANGE, BASE_PROTECTOR_MAX_RANGE, BASE_PROTECTOR_DEFAULT_RANGE,
} from './BaseProtector';
import {
  MAP_EDIT_MAX_WALLS, MAP_EDIT_MAX_ROCKS, MAP_EDIT_MAX_ZONES, MAP_READ_MAX_ZONES, MAP_EDIT_MAX_PORTALS,
  MAP_EDIT_WALL_MIN_CELLS,
  rockSizeHeldLimits,
} from './MapEditor';
import { GRID_SPACING } from './constants';
import { CM_USE, cmHex, cmMapOf, cmTurretColorSafe } from '@/utils/colorMap';
import { roundCanNest, autoSubCanNest } from './roundLayers';
import { EXPLODE_MAX_COUNT, EXPLODE_MAX_RINGS } from './explode';
import { SMALL_FIX } from './smallFixSwitch';
import { clampBossGroups } from './BossSpawn';
import { MAX_TURRETS_PER_LIST, MAX_TURRET_GROUPS } from './turretLimits';
import { AURA_RANGE } from '@/utils/aura';
import { clampEventsDoc, keepZoneWords } from './mapEvents/clamp';
import { clampTankDebuffs } from './tankDebuffs';
import { cleanHalloweenLook } from '../utils/halloween';
import { cleanLayerOutline } from '../utils/layerOutline';
import { clampGrowthRules } from './growthRules';
import { STARTING_SCORE_MAX } from './vampirism';
import { cleanMagicMazeField } from './magicMaze';

interface Range { min: number; max: number; fallback: number }

const CLAMP01_HARD_BOUNDS = 1;

const FREE = { min: -Infinity, max: Infinity };

export const CANVAS_EXTENT = 256;

const MAX_POLY_SIDES = 32;

export const KNOCKBACK_HARD_MIN = -28.5;

function clampField(obj: any, field: string, r: Range): void {
  const v = obj[field];
  if (v === undefined || v === null) return;
  if (typeof v !== 'number' || !isFinite(v)) {
    obj[field] = r.fallback;
  } else {
    if (v < r.min) obj[field] = r.min;
    else if (v > r.max) obj[field] = r.max;
  }
}

function clampNullsTo(obj: any, ranges: Record<string, Range>, how: 'absent' | 'fallback'): void {
  if (SMALL_FIX.R776 === 0 || !obj || typeof obj !== 'object') return;
  for (const k in ranges) if (obj[k] === null) { if (how === 'absent') delete obj[k]; else obj[k] = ranges[k].fallback; }
}

function clampFields(obj: any, ranges: Record<string, Range>): void {
  if (!obj || typeof obj !== 'object') return;
  for (const k in ranges) clampField(obj, k, ranges[k]);
}

const TURRET_RANGES: Record<string, Range> = {
  length:              { min: -CANVAS_EXTENT, max: CANVAS_EXTENT, fallback: 9.5 },
  width:               { min: 0,             max: CANVAS_EXTENT, fallback: 21  },
  xOffset:             { min: -CANVAS_EXTENT, max: CANVAS_EXTENT, fallback: 0   },
  yOffset:             { min: -CANVAS_EXTENT, max: CANVAS_EXTENT, fallback: 0   },
  autoTurretLength:    { min: -CANVAS_EXTENT, max: CANVAS_EXTENT, fallback: 7   },
  autoTurretWidth:     { min: 0,             max: CANVAS_EXTENT, fallback: 20  },
  autoCircleSize:      { min: SMALL_FIX.R776 !== 0 ? 1 : 0, max: CANVAS_EXTENT, fallback: 25  },

  aspect:              { ...FREE, fallback: 1   },
  bps:                 { ...FREE, fallback: 2   },
  speed:               SMALL_FIX.R775 !== 0 ? { min: -1000, max: 1000, fallback: 5 } : { ...FREE, fallback: 5   },
  bulletDamage:        { ...FREE, fallback: 5   },
  delay:               { ...FREE, fallback: 0   },
  spread:              { ...FREE, fallback: 45  },
  bulletPenetration:   { ...FREE, fallback: 1   },
  bulletLifetime:      { ...FREE, fallback: 3   },
  fov:                 { ...FREE, fallback: 200 },
  maxTurnSpeed:        SMALL_FIX.GH286 !== 0 ? { min: 0, max: Infinity, fallback: 4.5 } : { ...FREE, fallback: 4.5 },
  autoFireDelay:       { ...FREE, fallback: 0   },
  autoCircleSpinSpeed: SMALL_FIX.GH296 !== 0 ? { min: -2500, max: 2500, fallback: 50 } : { ...FREE, fallback: 50  },
  renderLayer:         { ...FREE, fallback: 0   },
  wifiRangeValue:      { ...FREE, fallback: 50  },

  knockback:           { min: KNOCKBACK_HARD_MIN, max: SMALL_FIX.R775 !== 0 ? 10000 : Infinity, fallback: 3 },
  fovSize:             { min: 0,     max: 100,      fallback: 10 },
  autoCircleBaseSides: { min: 0,     max: 16,       fallback: 0  },
  autoCircleBaseDepth: { min: 0,     max: 1,        fallback: 0  },
};

const PROJECTILE_TYPE_RANGES: Record<string, Range> = {
  shape:       { min: -MAX_POLY_SIDES, max: MAX_POLY_SIDES, fallback: 0 },
  size:        { min: 1e-6,   max: 18,      fallback: 1   },
  touchScale:  { min: 0.1,    max: 1,       fallback: 1   },
  growRate:    { min: -Infinity, max: 22,   fallback: 1   },
  ...(SMALL_FIX.GH294 !== 0 ? { motorDampLn: { min: -10, max: Infinity, fallback: 0 } } : {}),
  density:     { min: SMALL_FIX.R774D !== 0 ? 0.05 : 1e-9, max: Infinity, fallback: 1  },
  ...(SMALL_FIX.R775 !== 0 ? { topSpeedRatio: { min: -100, max: 100, fallback: 1 } } : {}),
  spinSpeed:   { min: 0,      max: 30,      fallback: 0.05 * 60 / (2 * Math.PI) },
  bounciness:  { min: -1,     max: 1,       fallback: 0.9 },
  maxAlive:    { ...FREE, fallback: 0 },
  lifetime:    { ...FREE, fallback: 0 },
  trapDepth:   { ...FREE, fallback: 0 },
  friction:    { ...FREE, fallback: 0 },
};

const BEHAVIOR_RANGES: Record<string, Range> = {
  responseLag:        { ...FREE, fallback: 0.1  },
  predictionStrength: { ...FREE, fallback: 50   },
  orbitRadius:        { ...FREE, fallback: 100  },
  spinSpeed:          { ...FREE, fallback: 3    },
  friction:           { ...FREE, fallback: 0    },
  targetRange:        { min: 0,          max: 20000, fallback: 0  },
  accelRate:          { min: 0,          max: Infinity, fallback: 1 },
  accelTopSpeed:      { min: -Infinity,  max: 5000,  fallback: 15 },
  growRate:           { min: -Infinity,  max: 100,   fallback: 1  },
};

const VISUAL_LAYER_RANGES: Record<string, Range> = {
  size:       { min: -CANVAS_EXTENT, max: CANVAS_EXTENT, fallback: 20 },
  width:      { min: 0,              max: CANVAS_EXTENT, fallback: 21 },
  xOffset:    { min: -CANVAS_EXTENT, max: CANVAS_EXTENT, fallback: 0  },
  yOffset:    { min: -CANVAS_EXTENT, max: CANVAS_EXTENT, fallback: 0  },
  sides:      { min: 0,    max: MAX_POLY_SIDES, fallback: 0 },
  aspect:     { ...FREE, fallback: 1  },
  layer:      { ...FREE, fallback: 0  },
  shootAnim:  { ...FREE, fallback: 50 },
};

const TANK_CONFIG_RANGES: Record<string, Range> = {
  tankSides:          { min: 0,   max: MAX_POLY_SIDES, fallback: 0 },
  snapPlacementCount: { min: 0,   max: SNAP_COUNTS.length - 1, fallback: 0 },
  tankSize:           { min: -7.99, max: 512, fallback: 9 },
  tankHP:             { min: 1e-9, max: SMALL_FIX.GH304 !== 0 ? 4.188e307 : 6.904805285865275e307,  fallback: 220 },
  tankBodyDamage:     { min: -Infinity, max: 8.802522314377863e307, fallback: 5 },
  tankShieldCapacity: { min: SMALL_FIX.GH298 !== 0 ? 0 : -Infinity, max: SMALL_FIX.GH304 !== 0 ? 2.171e307 : 5.980551299650688e307, fallback: 65 },
  maxPointsPerSkill:  { min: -Infinity, max: 1000, fallback: 10 },
  cameraZoomDistance: { min: -288230376151711740, max: 288230376151711740, fallback: 225 },
  tankShapeDepth:     { ...FREE, fallback: 0   },
  tankMovementSpeed:  SMALL_FIX.GH285 !== 0 ? { min: -1000, max: 1000, fallback: 3 } : { ...FREE, fallback: 3   },
  tankShieldRegen:    { ...FREE, fallback: 3   },
  maxSkillPoints:     { ...FREE, fallback: 42  },
  bonusSkillPoints:   { ...FREE, fallback: 42  },
  baseSpinSpeed:      { min: -1000, max: 1000, fallback: 100 },
  tankPushability:    SMALL_FIX.R775 !== 0 ? { min: -100, max: 100, fallback: 0.2 } : { ...FREE, fallback: 0.2 },
  tankResistBase:     { ...FREE, fallback: 1 },
  tankPenetrationBase: { ...FREE, fallback: 1.05 },
  tankTouchScale:     { min: 0.1, max: 1, fallback: 1 },
  tankPushShare:      { min: 0, max: 1, fallback: 1.6 / 6.85 },
  globalMaxAlive:     { ...FREE, fallback: 0   },
};

const BODY_LAYER_RANGES: Record<string, Range> = {
  sides:       { min: 0,   max: MAX_POLY_SIDES, fallback: 5 },
  copies:      { min: 1,   max: 64,  fallback: 1   },
  sizeRatio:   { min: -Infinity, max: 100, fallback: 1.4 },
  renderOrder: { min: -128, max: 127, fallback: 0  },
  starDepth:   { min: 0,   max: 1,   fallback: 0   },
  spinSpeed:   { min: -2000, max: 2000, fallback: 50 },
  maxAlive:    { ...FREE, fallback: 0  },
};

const MAP_CONFIG_RANGES: Record<string, Range> = {
  mazeType:          { min: MAZE_TYPE_CUSTOM, max: 80, fallback: ALL_MODES.ON !== 0 ? 21 : 0 },
  seed:              { min: 1,    max: 2147483647,  fallback: 1   },
  gridCells:         { min: MAP_GRID_MIN, max: MAP_GRID_MAX_SIDE, fallback: 32 },
  gridCellsY:        { min: MAP_GRID_MIN, max: MAP_GRID_MAX_SIDE, fallback: 32 },
  mapScale:          { min: MAP_SCALE_MIN, max: MAP_SCALE_MAX, fallback: 5 },
  portalCount:       { min: 1,    max: 16,          fallback: 1   },
  rockDensity:       { min: 0,    max: 1000,        fallback: 500 },
  rockExclusionSize: { min: 1,    max: 100,         fallback: 10  },
  rockSizeVariation: { min: 0,    max: 100,         fallback: 100 },
  erosionIntensity:  { min: 0.25, max: 2.0,         fallback: 1.0 },
  baseProtectorPushStrength: { min: 0, max: BASE_PROTECTOR_MAX_PUSH_STRENGTH, fallback: 100 },
  baseProtectorRange:        { min: BASE_PROTECTOR_MIN_RANGE, max: BASE_PROTECTOR_MAX_RANGE,
                               fallback: BASE_PROTECTOR_DEFAULT_RANGE },
};

const SHAPE_SPAWN_RANGES: Record<string, Range> = {
  sizeRandomization:       { min: 0,       max: 100,         fallback: 0       },
  crasherCap:              { min: 0,       max: 50,          fallback: 10      },
  sentryCap:               { min: 0,       max: 20,          fallback: 5       },
  crasherChaseRange:       { min: 100,     max: 2000,        fallback: 500     },
  crasherSpeed:            { min: 0,       max: 200,         fallback: 100     },
  groupSpawnChance:        { min: 0,       max: 100,         fallback: 20      },
  groupMaxSize:            { min: 1,       max: 10,          fallback: 3       },
  scaledVariantCenterZone: { min: 0,       max: 100,         fallback: 50      },
  foodCap:                 { min: 0,       max: SHAPE_SPAWN_PLAN !== 0 ? 500 : 300, fallback: 80 },
  shinyChance:             { min: SHAPE_SPAWN_PLAN !== 0 ? 1 : 100, max: SHAPE_SPAWN_PLAN !== 0 ? 1e10 : 200000, fallback: 20000 },
  legendaryChance:         { min: SHAPE_SPAWN_PLAN !== 0 ? 1 : 1000, max: SHAPE_SPAWN_PLAN !== 0 ? 1e10 : 5000000, fallback: 200000 },
  shadowChance:            { min: SHAPE_SPAWN_PLAN !== 0 ? 1 : 10000, max: SHAPE_SPAWN_PLAN !== 0 ? 1e10 : 50000000, fallback: 2000000 },
  rainbowChance:           { min: SHAPE_SPAWN_PLAN !== 0 ? 1 : 100000, max: SHAPE_SPAWN_PLAN !== 0 ? 1e10 : 500000000, fallback: 20000000 },
  transChance:             { min: SHAPE_SPAWN_PLAN !== 0 ? 1 : 1000000, max: SHAPE_SPAWN_PLAN !== 0 ? 1e10 : 1000000000, fallback: 200000000 },
  polyhedraChance:         { min: SHAPE_SPAWN_PLAN !== 0 ? (SMALL_FIX.R904 !== 0 ? 0 : 1) : 1000, max: SHAPE_SPAWN_PLAN !== 0 ? 1e10 : 5000000, fallback: 500000 },
  rarityTestMultiplier:    { min: 1,       max: 100000,      fallback: 1       },

  baseShapeCap:            { min: 0,       max: 150,         fallback: 0       },
  rarityCap:               { min: 0,       max: 100,         fallback: 0       },
  labyCap:                 { min: 0,       max: 100,         fallback: 0       },
  specialShapeCap:         { min: 0,       max: 50,          fallback: 0       },
  scaledVariantCap:        { min: 0,       max: SHAPE_SPAWN_PLAN !== 0 ? 500 : 50, fallback: 15 },
  sentinelCap:             { min: 0,       max: 10,          fallback: 3       },

  baseShapeRateLevel:      { min: -10,     max: 10,          fallback: 0       },
  scaledVariantRateLevel:  { min: -10,     max: 10,          fallback: 0       },
  rarityRateLevel:         { min: -10,     max: 10,          fallback: 0       },
  labyRateLevel:           { min: -10,     max: 10,          fallback: 0       },
  specialShapeRateLevel:   { min: -10,     max: 10,          fallback: 0       },
  crasherRateLevel:        { min: -10,     max: 10,          fallback: 0       },
  sentryRateLevel:         { min: -10,     max: 10,          fallback: 0       },
  sentinelRateLevel:       { min: -10,     max: 10,          fallback: 0       },
};

function heaviestDefaultShapeMass(): number {
  let max = 0;
  const walk = (o: any, depth: number): void => {
    if (!o || typeof o !== 'object' || depth > 4) return;
    if (typeof o.mass === 'number' && Number.isFinite(o.mass) && o.mass > max) max = o.mass;
    for (const k in o) if (o[k] && typeof o[k] === 'object') walk(o[k], depth + 1);
  };
  walk(DEFAULT_SHAPE_SPAWN_CONFIG(), 0);
  return max;
}

const BASE_SHAPE_RANGES: Record<string, Range> = {
  size:        { min: 3,   max: SHAPES_ARRAS !== 0 ? 600 : 200, fallback: 20  },
  hp:          { min: SHAPES_ARRAS !== 0 ? 0.1 : 1,   max: SHAPES_ARRAS !== 0 ? 1e9 : 500, fallback: 10  },
  mass:        { min: 1,   max: SMALL_FIX.R769 !== 0 ? Math.max(10000, 10 * heaviestDefaultShapeMass()) : 10000, fallback: 30 },
  bodyDamage:  { min: 0,   max: 100, fallback: 10  },
  pushability: { min: 0,   max: 10,  fallback: 1   },
  elasticity:  { min: 0,   max: 5,   fallback: 1   },
  driftSpeed:  { min: 0,   max: 200, fallback: 100 },
  shield:      { min: 0,   max: SHAPES_ARRAS !== 0 ? 1e8 : 100, fallback: 2   },
  shieldRegen: { min: 0,   max: 20,  fallback: 2   },
  xpValue:     { min: 0,   max: SHAPES_ARRAS !== 0 ? 1e13 : 500, fallback: 30  },
  spawnWeight: { min: 0,   max: 100, fallback: 50  },
  centerBias:  { min: 0,   max: 100, fallback: 0   },
};

const CUSTOM_PROJECTILE_DESIGN_RANGES: Record<string, Range> = {
  shape:      { min: 0,    max: MAX_POLY_SIDES, fallback: 0 },
  size:       { min: 1e-6, max: 18,      fallback: 1   },
  tankTouchScale: { min: 0.1, max: 1, fallback: 1 },
  density:    { min: SMALL_FIX.R774D !== 0 ? 0.05 : 1e-9, max: Infinity, fallback: 1  },
  bounciness: { min: -1,   max: 1,       fallback: 0.9 },
  growRate:   { ...FREE, fallback: 1 },
  trapDepth:  { ...FREE, fallback: 0 },
  friction:   { ...FREE, fallback: 0 },
};

const AREA_CONFIG_RANGES: Record<string, Range> = {
  spawnRate: { min: 0, max: 100, fallback: 50 },
};

const LEGACY_UI_BOUNDS: Array<[Record<string, Range>, Record<string, [number, number]>]> = [
  [TURRET_RANGES, {
    length: [1, 100], width: [0, 50], aspect: [0.1, 3], xOffset: [-5, 5], yOffset: [-5, 5],
    bps: [0.1, 100], speed: [1, 15], delay: [0, 10], knockback: [0, 100], spread: [0, 100],
    bulletDamage: [0, 1000], bulletPenetration: [0, 1000], bulletLifetime: [0, 1000],
    fov: [10, 360], fovSize: [0, 100], maxTurnSpeed: [0.5, 10], autoFireDelay: [0, 3],
    autoCircleSize: [0, 50], autoCircleBaseSides: [0, 20], autoCircleSpinSpeed: [0, 500],
    autoTurretLength: [1, 100], autoTurretWidth: [0, 50], renderLayer: [0, 10],
    wifiRangeValue: [1, 100],
  }],
  [PROJECTILE_TYPE_RANGES, {
    shape: [-8, 13], size: [0.1, 5], maxAlive: [0, 20], lifetime: [0, 30], growRate: [0.5, 10],
    trapDepth: [0, 100], friction: [0, 0.5], density: [0.5, 10], bounciness: [0, 1],
  }],
  [BEHAVIOR_RANGES, {
    responseLag: [0, 1], predictionStrength: [0, 100],
    targetRange: [0, 2000], orbitRadius: [0, 1000],
    spinSpeed: [0.5, 10], accelRate: [0.1, 5],
    accelTopSpeed: [1, 30], friction: [0, 0.5], growRate: [0.5, 10],
  }],
  [VISUAL_LAYER_RANGES, {
    size: [1, 100], width: [0, 50], aspect: [0.1, 3], xOffset: [-5, 5], yOffset: [-5, 5],
    sides: [0, 12], layer: [0, 10], shootAnim: [0, 100],
  }],
  [TANK_CONFIG_RANGES, {
    tankSides: [0, 13], tankShapeDepth: [0, 1], tankSize: [1, 100], tankHP: [1, 10000],
    tankBodyDamage: [0, 1000], tankMovementSpeed: [0, 100], tankShieldRegen: [0, 100],
    tankShieldCapacity: [0, 10000], maxSkillPoints: [0, 100], maxPointsPerSkill: [1, 30],
    bonusSkillPoints: [0, 100], baseSpinSpeed: [0, 100], tankPushability: [0.01, 10],
    globalMaxAlive: [0, 200], cameraZoomDistance: [50, 800],
  }],
  [BODY_LAYER_RANGES, {
    sides: [0, 13], copies: [1, 8], sizeRatio: [0.1, 5], spinSpeed: [0, 500],
    renderOrder: [-5, 10], maxAlive: [0, 200],
  }],
  [CUSTOM_PROJECTILE_DESIGN_RANGES, {
    shape: [0, 13], size: [0.2, 5], growRate: [0.5, 10], trapDepth: [0, 100],
    friction: [0, 0.5], density: [0.5, 10], bounciness: [0, 1],
  }],
];

if (!CLAMP01_HARD_BOUNDS) {
  for (const [table, legacy] of LEGACY_UI_BOUNDS) {
    for (const field in legacy) {
      if (!table[field]) continue;
      table[field].min = legacy[field][0];
      table[field].max = legacy[field][1];
    }
  }
}

function clampBehavior(b: any): void {
  if (!b || typeof b !== 'object') return;
  clampFields(b, BEHAVIOR_RANGES);
  if (b.frictionSet !== undefined) b.frictionSet = !!b.frictionSet;
  clampScalarFinite(b, 'chaseAccel', undefined);
  clampScalarFinite(b, 'minionAccel', undefined);
  clampScalarFinite(b, 'swarmSteer', undefined);
  if (b.snakeOnAlt !== undefined) b.snakeOnAlt = !!b.snakeOnAlt;
  clampScalarFinite(b, 'snakeSwing', undefined);
  clampScalarFinite(b, 'snakeRate', undefined);
  clampScalarFinite(b, 'snakeDelay', undefined);
  clampScalarFinite(b, 'invisFadeInRate', undefined);
  clampScalarFinite(b, 'invisFadeOutRate', undefined);
}

function clampVisualLayer(l: any): void {
  if (!l || typeof l !== 'object') return;
  clampFields(l, VISUAL_LAYER_RANGES);
  clampAngleField(l, 'angle', true);
}

function clampBodyLayer(l: any): void {
  if (!l || typeof l !== 'object') return;
  clampFields(l, BODY_LAYER_RANGES);
  if (!Array.isArray(l.turretIds)) l.turretIds = [];
  else l.turretIds = l.turretIds.filter((id: any) => typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id)));
  clampSignField(l, 'spinDirection');
  clampAngleField(l, 'initialAngle', true);
  clampAngleField(l, '_currentAngle');
  if (l.outline !== undefined) { const o = cleanLayerOutline(l.outline); if (o) l.outline = o; else delete l.outline; }
  if (l.label !== undefined && typeof l.label !== 'string') delete l.label;
  if (l.tag !== undefined && typeof l.tag !== 'string') delete l.tag;
  if (l.color !== undefined && typeof l.color !== 'string') delete l.color;
}

function clampProjectileType(pt: any, layer: number = 1): void {
  if (!pt || typeof pt !== 'object') return;
  clampNullsTo(pt, PROJECTILE_TYPE_RANGES, 'fallback');
  clampFields(pt, PROJECTILE_TYPE_RANGES);
  if (SMALL_FIX.R301 !== 0 && pt.colorMap !== undefined) { const m = cmMapOf(pt.colorMap); if (m === undefined) delete pt.colorMap; else pt.colorMap = m; }
  if (pt.customProjectileDesign) clampCustomProjectileDesign(pt.customProjectileDesign, layer);
  if (!roundCanNest(layer) && Array.isArray(pt.subTurrets) && pt.subTurrets.length > 0) {
    pt.subTurrets.length = 0;
    _layerTrimmed = true;
  }
  if (pt.subTurrets !== undefined && !Array.isArray(pt.subTurrets)) pt.subTurrets = [];
  else if (Array.isArray(pt.subTurrets)) {
    pt.subTurrets = pt.subTurrets.filter((r: any) => r && typeof r === 'object' && !Array.isArray(r));
    for (const r of pt.subTurrets) {
      r.childBehaviors = Array.isArray(r.childBehaviors) ? r.childBehaviors.filter((b: any) => typeof b === 'string') : [];
    }
  }
  if (pt.tankAsProjectile !== undefined && typeof pt.tankAsProjectile !== 'string') pt.tankAsProjectile = undefined;
  if (pt.tankAsProjectileCycle !== undefined && !Array.isArray(pt.tankAsProjectileCycle)) pt.tankAsProjectileCycle = undefined;
  else if (Array.isArray(pt.tankAsProjectileCycle)) pt.tankAsProjectileCycle = pt.tankAsProjectileCycle.filter((s: any) => typeof s === 'string');
  if (pt.cycleProjectilesEnabled !== undefined) pt.cycleProjectilesEnabled = !!pt.cycleProjectilesEnabled;
}

const MAX_TURRETS_PER_NODE = MAX_TURRETS_PER_LIST;
const MAX_ARRAY_ROWS = 256;
export function clampAuraFields(t: any): void {
  if (!t || typeof t !== 'object') return;
  const R = AURA_RANGE;
  if (t.auraSize !== undefined) { if (typeof t.auraSize !== 'number' || !isFinite(t.auraSize)) delete t.auraSize; else t.auraSize = Math.min(R.size.max, Math.max(R.size.min, t.auraSize)); }
  if (t.auraStrength !== undefined) { if (typeof t.auraStrength !== 'number' || !isFinite(t.auraStrength)) delete t.auraStrength; else t.auraStrength = Math.min(R.strength.max, Math.max(R.strength.min, t.auraStrength)); }
  if (t.auraOpacity !== undefined) { if (typeof t.auraOpacity !== 'number' || !isFinite(t.auraOpacity)) delete t.auraOpacity; else t.auraOpacity = Math.min(R.opacity.max, Math.max(R.opacity.min, t.auraOpacity)); }
}

function clampTurret(t: any, layer: number = 1, hops: number = 0): void {
  if (!t || typeof t !== 'object') return;
  if (SMALL_FIX.GH337 !== 0) clampAuraFields(t);
  if (t.wifiRange === true && t.wifiRangeValue === 0) {
    t.wifiRange = false;
  }
  clampNullsTo(t, TURRET_RANGES, 'absent');
  clampFields(t, TURRET_RANGES);
  if (t.projectileType) clampProjectileType(t.projectileType, layer);
  if (t.projectileBehaviors !== undefined && !Array.isArray(t.projectileBehaviors)) delete t.projectileBehaviors;
  if (t.visualLayers !== undefined && !Array.isArray(t.visualLayers)) delete t.visualLayers;
  if (t.autoSubTurrets !== undefined && !Array.isArray(t.autoSubTurrets)) delete t.autoSubTurrets;
  if (Array.isArray(t.projectileBehaviors)) {
    if (t.projectileBehaviors.length > MAX_ARRAY_ROWS) t.projectileBehaviors.length = MAX_ARRAY_ROWS;
    for (let i = 0; i < t.projectileBehaviors.length; i++) clampBehavior(t.projectileBehaviors[i]);
  }
  if (Array.isArray(t.visualLayers)) {
    if (t.visualLayers.length > MAX_ARRAY_ROWS) t.visualLayers.length = MAX_ARRAY_ROWS;
    for (let i = 0; i < t.visualLayers.length; i++) clampVisualLayer(t.visualLayers[i]);
  }
  if (Array.isArray(t.autoSubTurrets)) {
    t.autoSubTurrets = t.autoSubTurrets.filter((r: any) => r && typeof r === 'object' && !Array.isArray(r));
    if (t.autoSubTurrets.length > MAX_TURRETS_PER_NODE) t.autoSubTurrets.length = MAX_TURRETS_PER_NODE;
    if (autoSubCanNest(hops)) {
      for (let i = 0; i < t.autoSubTurrets.length; i++) clampTurret(t.autoSubTurrets[i], layer, hops + 1);
    } else if (t.autoSubTurrets.length > 0) {
      t.autoSubTurrets.length = 0;
      t.primarySubTurretId = null;
    }
  }
  if (t.explode !== undefined) clampExplode(t, layer);
  clampScalarFinite(t, 'gunStatScale', 1.0);
  if (SMALL_FIX.GH305 !== 0 && typeof t.gunStatScale === 'number') t.gunStatScale = Math.max(-1000, Math.min(1000, t.gunStatScale));
  clampScalarFinite(t, 'bulletHealthBase', undefined);
  clampScalarFinite(t, 'shootResist', undefined);
  clampScalarFinite(t, 'fightResist', undefined);
  clampScalarFinite(t, 'shootDensity', undefined);
  clampScalarFinite(t, 'shudder', undefined);
  if (SMALL_FIX.R775 !== 0) {
    if (typeof t.shootDensity === 'number') t.shootDensity = Math.max(0.0026, Math.min(81, t.shootDensity));
    if (typeof t.shudder === 'number') t.shudder = Math.max(-10, Math.min(10, t.shudder));
  }
  clampAngleField(t, 'angle', true);
  clampAngleField(t, '_lastAutoRestAngle');
  cmTurretColorSafe(t);
}

const EXPLODE_RING_RANGES: Record<string, Range> = {
  count:    { min: 1,    max: EXPLODE_MAX_COUNT, fallback: 1 },
  startDeg: { min: -180, max: 180,               fallback: 0 },
  arcDeg:   { min: 1,    max: 360,               fallback: 360 },
};

function clampExplode(t: any, layer: number): void {
  const ex = t.explode;
  if (ex === null || typeof ex !== 'object' || !Array.isArray(ex.rings)) { delete t.explode; return; }
  if (!roundCanNest(layer)) {
    if (ex.rings.length > 0) _layerTrimmed = true;
    delete t.explode;
    return;
  }
  ex.enabled = ex.enabled === true;
  ex.anyDeath = ex.anyDeath === true;
  if (ex.rings.length > EXPLODE_MAX_RINGS) ex.rings.length = EXPLODE_MAX_RINGS;
  for (let i = 0; i < ex.rings.length; i++) {
    const r = ex.rings[i];
    if (!r || typeof r !== 'object' || !r.fragment || typeof r.fragment !== 'object' || Array.isArray(r.fragment)) {
      ex.rings.splice(i, 1);
      i--;
      continue;
    }
    clampFields(r, EXPLODE_RING_RANGES);
    if (typeof r.count === 'number') r.count = Math.round(r.count);
    if (SMALL_FIX.GH349 !== 0 && typeof r.fragment.id === 'string' && r.fragment.id.charCodeAt(0) === 126) r.fragment.id = 'piece' + r.fragment.id.replace(/^~+/, '');
    clampTurret(r.fragment, layer + 1, 0);
  }
}

function clampScalarFinite(obj: any, field: string, fallback: number | undefined): void {
  const v = obj[field];
  if (v === undefined || v === null) return;
  if (typeof v !== 'number' || !isFinite(v)) {
    if (fallback === undefined) delete obj[field];
    else obj[field] = fallback;
  }
}

function clampSignField(obj: any, field: string): void {
  const v = obj[field];
  if (v === undefined || v === null) return;
  if (typeof v !== 'number') return;
  if (!isFinite(v)) { delete obj[field]; return; }
  if (v < -1) obj[field] = -1;
  else if (v > 1) obj[field] = 1;
}

const MAX_ANGLE = Math.PI * 4;
function clampSkillTable(obj: any, field: string): void {
  const t = obj[field];
  if (t === undefined || t === null) return;
  if (typeof t !== 'object' || Array.isArray(t)) { delete obj[field]; return; }
  for (const k of Object.keys(t)) {
    const v = t[k];
    if (typeof v !== 'number' || !isFinite(v)) { delete t[k]; continue; }
    t[k] = Math.min(1000, Math.max(0, Math.round(v)));
  }
}

function clampAngleField(obj: any, field: string, rest = false): void {
  const v = obj[field];
  if (v === undefined || v === null) return;
  if (typeof v !== 'number' || !isFinite(v)) { if (rest && SMALL_FIX.R776 !== 0) obj[field] = 0; else delete obj[field]; return; }
  if (v < -MAX_ANGLE) obj[field] = -MAX_ANGLE;
  else if (v > MAX_ANGLE) obj[field] = MAX_ANGLE;
}

function clampBaseShapes(shapes: any): void {
  if (!shapes || typeof shapes !== 'object') return;
  for (const key in shapes) {
    if (shapes[key] && typeof shapes[key] === 'object') {
      clampFields(shapes[key], BASE_SHAPE_RANGES);
    }
  }
}

function carryShapeRowsToTheBook(ssc: any): void {
  if (SHAPES_ARRAS === 0 || ssc.shapeBook === 1) return;
  const was = SHAPE_SPAWN_CONFIG_OF_BEFORE(), now = DEFAULT_SHAPE_SPAWN_CONFIG();
  if (ssc.baseShapes && typeof ssc.baseShapes === 'object') {
    for (const key in ssc.baseShapes) {
      const row = ssc.baseShapes[key], a = was.baseShapes[key], b = now.baseShapes[key];
      if (!row || typeof row !== 'object' || !a || !b) continue;
      if (typeof row.size === 'number' && a.size > 0) row.size = b.size * (row.size / a.size);
      if (typeof row.hp === 'number' && a.hp > 0) row.hp = b.hp * (row.hp / a.hp);
    }
  }
  if (ssc.scaleVariants && typeof ssc.scaleVariants === 'object') {
    for (const key in ssc.scaleVariants) {
      const row = ssc.scaleVariants[key], b = now.scaleVariants[key];
      if (!row || typeof row !== 'object' || !b) continue;
      row.size = b.size; row.hp = b.hp; row.shield = b.shield;
    }
  }
  ssc.shapeBook = 1;
}

function carryShapeScoresToTheBook(ssc: any): void {
  if (SHAPE_SCORES === 0 || ssc.shapeScores === 1) return;
  const was = SHAPE_SPAWN_CONFIG_OF_BEFORE(), now = DEFAULT_SHAPE_SPAWN_CONFIG();
  if (ssc.baseShapes && typeof ssc.baseShapes === 'object') {
    for (const key in ssc.baseShapes) {
      const row = ssc.baseShapes[key], a = was.baseShapes[key], b = now.baseShapes[key];
      if (!row || typeof row !== 'object' || !a || !b) continue;
      if (typeof row.xpValue === 'number' && a.xpValue > 0) row.xpValue = b.xpValue * (row.xpValue / a.xpValue);
    }
  }
  if (ssc.scaleVariants && typeof ssc.scaleVariants === 'object') {
    for (const key in ssc.scaleVariants) {
      const row = ssc.scaleVariants[key], b = now.scaleVariants[key];
      if (!row || typeof row !== 'object' || !b) continue;
      row.xpValue = b.xpValue;
    }
  }
  ssc.shapeScores = 1;
}

export function clampShapeSpawnLimits(ssc: any): void {
  if (!ssc || typeof ssc !== 'object') return;
  clampFields(ssc, SHAPE_SPAWN_RANGES);
  clampSpawnPlan(ssc);
}

const PLAN_BASE_KEYS = new Set(['egg', 'square', 'triangle', 'pentagon', 'hexagon']);
const PLAN_RELIC_KEYS = new Set(['egg', 'square', 'triangle', 'pentagon', 'hexagon', 'betaPentagon', 'alphaPentagon']);
function clampSpawnPlan(ssc: any): void {
  if (SHAPE_SPAWN_PLAN === 0 || ssc.plan === undefined) return;
  const p = ssc.plan; if (!p || typeof p !== 'object' || Array.isArray(p)) { delete ssc.plan; return; }
  const num = (v: any, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  p.profile = typeof p.profile === 'string' ? p.profile.slice(0, 40) : 'ordinary';
  p.noFood = !!p.noFood; p.eggToGem = !!p.eggToGem;
  p.nestSize = num(p.nestSize, 0, 100, 0); p.nestShare = num(p.nestShare, 0, 100, 0); p.nestCap = num(p.nestCap, 0, 500, 0);
  for (const k of ['crasherOneIn', 'nestCrasherOneIn', 'gemOneIn', 'jewelOneIn', 'scaledOneIn', 'relicOneIn']) p[k] = num(p[k], 0, 1e12, 0);
  const tiers = Array.isArray(p.tierOneIn) ? p.tierOneIn : []; p.tierOneIn = [0, 1, 2, 3, 4, 5].map((i) => (i === 0 ? 0 : num(tiers[i], 0, 1e12, 0)));
  const weights = (o: any, keys: Set<string>) => { const r: Record<string, number> = {}; if (o && typeof o === 'object') for (const k of Object.keys(o)) if (keys.has(k)) r[k] = num(o[k], 0, 1e6, 0); return r; };
  p.nestWeights = weights(p.nestWeights, PLAN_BASE_KEYS); p.relicWeights = weights(p.relicWeights, PLAN_RELIC_KEYS);
  if (p.nestPace !== undefined) p.nestPace = num(p.nestPace, 0, 1000, 0);
  if (p.crowd !== undefined) {
    const c = p.crowd;
    if (!c || typeof c !== 'object' || Array.isArray(c)) delete p.crowd;
    else {
      c.on = !!c.on;
      c.enemyFirst = num(c.enemyFirst, 0, 100, 0); c.enemyNext = num(c.enemyNext, 0, 100, 0); c.enemyKeep = num(c.enemyKeep, 0, 0.99, 0);
      c.teamFirst = num(c.teamFirst, 0, 100, 0); c.teamKeep = num(c.teamKeep, 0, 0.99, 0); c.margin = num(c.margin, 0, 500, 0);
      const kinds: Record<string, number> = {};
      if (c.kinds && typeof c.kinds === 'object') for (const k of Object.keys(c.kinds)) if (PLAN_BASE_KEYS.has(k)) kinds[k] = num(c.kinds[k], 0, 4, 0);
      c.kinds = kinds;
    }
  }
}

function clampShapeSpawnConfig(ssc: any): void {
  if (!ssc || typeof ssc !== 'object') return;
  carryShapeRowsToTheBook(ssc);
  carryShapeScoresToTheBook(ssc);
  clampFields(ssc, SHAPE_SPAWN_RANGES);
  clampSpawnPlan(ssc);
  if (ssc.baseShapes) clampBaseShapes(ssc.baseShapes);
  if (ssc.scaleVariants) clampBaseShapes(ssc.scaleVariants);
}

function clampSpawnZoneScales(data: any): void {
  if (data.spawnZoneSync !== undefined) data.spawnZoneSync = !!data.spawnZoneSync;
  const arr = data.spawnZoneScales;
  if (arr === undefined) return;
  if (!Array.isArray(arr)) {
    delete data.spawnZoneScales;
    return;
  }
  if (arr.length > 4) arr.length = 4;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!e || typeof e !== 'object') {
      arr[i] = { w: 100, h: 100 };
      continue;
    }
    const w = Number(e.w), h = Number(e.h);
    e.w = Number.isFinite(w) ? Math.min(SPAWN_ZONE_MAX_SCALE, Math.max(SPAWN_ZONE_MIN_SCALE, w)) : 100;
    e.h = Number.isFinite(h) ? Math.min(SPAWN_ZONE_MAX_SCALE, Math.max(SPAWN_ZONE_MIN_SCALE, h)) : 100;
  }
}

function finiteInt(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function finiteNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeRows<T>(arr: any, max: number, keep: (row: any) => T | null): T[] {
  if (!Array.isArray(arr)) return [];
  const out: T[] = [];
  const seenIds = new Set<number>();
  for (let i = 0; i < arr.length && out.length < max; i++) {
    const row = keep(arr[i]);
    if (row === null) continue;
    const id = (row as any).id;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    out.push(row);
  }
  return out;
}

function keepWall(r: any): import('@/types').PlacedWall | null {
  if (!r || typeof r !== 'object') return null;
  const id = finiteInt(r.id), gx = finiteInt(r.gx), gy = finiteInt(r.gy);
  const cw = finiteInt(r.cw), ch = finiteInt(r.ch);
  if (id === null || id < 0 || gx === null || gy === null || cw === null || ch === null) return null;
  if (gx < 0 || gy < 0) return null;
  const out: import('@/types').PlacedWall = {
    id, gx, gy,
    cw: Math.max(MAP_EDIT_WALL_MIN_CELLS, cw),
    ch: Math.max(MAP_EDIT_WALL_MIN_CELLS, ch),
  };
  const lgx = finiteInt(r.lookGx), lgy = finiteInt(r.lookGy);
  if (lgx !== null && lgy !== null) { out.lookGx = lgx; out.lookGy = lgy; }
  return out;
}

function keepRock(r: any, limits: { min: number; max: number }): import('@/types').PlacedRock | null {
  if (!r || typeof r !== 'object') return null;
  const id = finiteInt(r.id), cx = finiteNum(r.cx), cy = finiteNum(r.cy);
  const size = finiteNum(r.size), rotation = finiteNum(r.rotation);
  if (id === null || id < 0 || cx === null || cy === null || size === null) return null;
  const kind = (r.kind === 'stone' || r.kind === 'gravel') ? r.kind : 'rock';
  const out: import('@/types').PlacedRock = {
    id, cx, cy,
    size: Math.min(limits.max, Math.max(limits.min, size)),
    rotation: rotation === null ? 0 : rotation,
    kind,
  };
  const lcx = finiteNum(r.lookCx), lcy = finiteNum(r.lookCy);
  if (lcx !== null && lcy !== null) { out.lookCx = lcx; out.lookCy = lcy; }
  return out;
}

function rockLimitsForConfig(data: any): { min: number; max: number } {
  const raw = typeof data.mapScale === 'number' && isFinite(data.mapScale)
    ? data.mapScale : DEFAULT_MAP_CONFIG.mapScale;
  const scale = Math.min(MAP_SCALE_MAX, Math.max(MAP_SCALE_MIN, raw));
  return rockSizeHeldLimits(scale * GRID_SPACING);
}

function keepZone(r: any): import('@/types').PlacedZone | null {
  if (!r || typeof r !== 'object') return null;
  const id = finiteInt(r.id), gx = finiteInt(r.gx), gy = finiteInt(r.gy);
  const cw = finiteInt(r.cw), ch = finiteInt(r.ch), team = finiteInt(r.team);
  if (id === null || id < 0 || gx === null || gy === null || cw === null || ch === null) return null;
  if (gx < 0 || gy < 0 || cw < 1 || ch < 1) return null;
  const t = (team === null ? 0 : Math.min(3, Math.max(0, team))) as 0 | 1 | 2 | 3;
  const z: import('@/types').PlacedZone = { id, gx, gy, cw, ch, team: t };
  if (r.kind === 'cosmetic' || r.kind === 'bouncy' || r.kind === 'kill') z.kind = r.kind;
  if (typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color)) z.color = r.color;
  if (typeof r.colorFree === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.colorFree)) z.colorFree = r.colorFree;
  if (typeof r.colorMap === 'number' && Number.isInteger(r.colorMap) && r.colorMap >= -1 && r.colorMap < 20) z.colorMap = r.colorMap;
  if (typeof r.opacity === 'number' && Number.isFinite(r.opacity)) z.opacity = Math.min(1, Math.max(0, r.opacity));
  if (typeof r.bounce === 'number' && Number.isFinite(r.bounce)) z.bounce = Math.min(10, Math.max(0, r.bounce));
  if (Array.isArray(r.spare)) z.spare = r.spare.filter((s: unknown) => typeof s === 'string' && s.length > 0 && s.length < 80).slice(0, 64);
  keepZoneWords(r, z as unknown as Record<string, unknown>);
  return z;
}

function keepPortal(r: any): import('@/types').PlacedPortal | null {
  if (!r || typeof r !== 'object') return null;
  const id = finiteInt(r.id), gx = finiteInt(r.gx), gy = finiteInt(r.gy);
  if (id === null || id < 0 || gx === null || gy === null) return null;
  if (gx < 0 || gy < 0) return null;
  const out: import('@/types').PlacedPortal = { id, gx, gy, staticPos: !!r.staticPos };
  if (r.appear === 'fixed' || r.appear === 'map' || r.appear === 'area') out.appear = r.appear;
  const ia = finiteInt(r.inArea); if (ia !== null && ia >= 0) out.inArea = ia;
  return out;
}

const EDIT_ID_MAX = 0x3fffffff;

function repairNextId(claimed: any, ...lists: { id: number }[][]): number {
  let maxId = 0;
  for (let i = 0; i < lists.length; i++) {
    const l = lists[i];
    for (let j = 0; j < l.length; j++) if (l[j].id > maxId) maxId = l[j].id;
  }
  const n = finiteInt(claimed);
  return Math.max(maxId + 1, n === null || n < 1 ? 1 : Math.min(n, EDIT_ID_MAX));
}

function rewritePortalRows(data: any, remap: Map<number, number>): void {
  const rewrite = (rows: any) => {
    if (!Array.isArray(rows)) return;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || typeof r !== 'object') continue;
      const to = remap.get(r.portalId);
      if (to !== undefined) r.portalId = to;
    }
  };
  rewrite(data.portalLinks);
  rewrite(data.portalTimings);
  rewrite(data.portalLevels);
  rewrite(data.portalKinds);
  rewrite(data.portalBotOdds);
  rewrite(data.portalBossBlacklist);
  if (Array.isArray(data.portalKinds)) {
    for (const r of data.portalKinds) {
      if (!r || typeof r !== 'object' || (r.exitAreaId !== undefined && r.exitAreaId !== '')) continue;
      const to = remap.get(r.exitPortalId);
      if (to !== undefined) r.exitPortalId = to;
    }
  }
}

function renumberHugeIds(data: any, portals: { id: number }[] | null, ...lists: { id: number }[][]): void {
  let maxId = 0;
  for (let i = 0; i < lists.length; i++) {
    const l = lists[i];
    for (let j = 0; j < l.length; j++) if (l[j].id <= EDIT_ID_MAX && l[j].id > maxId) maxId = l[j].id;
  }
  let next = maxId + 1;
  let remap: Map<number, number> | null = null;
  for (let i = 0; i < lists.length; i++) {
    const l = lists[i];
    for (let j = 0; j < l.length; j++) {
      if (l[j].id <= EDIT_ID_MAX) continue;
      const id = next++;
      if (l === portals) (remap ??= new Map()).set(l[j].id, id);
      l[j].id = id;
    }
  }
  if (remap) rewritePortalRows(data, remap);
}

function renumberLowPortalIds(data: any, cm: any): void {
  if (data.mazeType !== MAZE_TYPE_CUSTOM) return;
  let next = cm.nextId;
  const remap = new Map<number, number>();
  for (let i = 0; i < cm.portals.length; i++) {
    const p = cm.portals[i];
    if (p.id >= MAP_EDIT_MAX_PORTALS) continue;
    let id = next++;
    while (id < MAP_EDIT_MAX_PORTALS) id = next++;
    remap.set(p.id, id);
    p.id = id;
  }
  if (remap.size === 0) return;
  cm.nextId = next;
  rewritePortalRows(data, remap);
}

function clampCustomMap(data: any): Map<number, number> | null {
  const cm = data.customMap;
  if (cm === undefined) return null;
  if (!cm || typeof cm !== 'object') { delete data.customMap; return null; }
  const rl = rockLimitsForConfig(data);
  cm.walls   = sanitizeRows(cm.walls,   MAP_EDIT_MAX_WALLS,   keepWall);
  cm.rocks   = sanitizeRows(cm.rocks,   MAP_EDIT_MAX_ROCKS,   (r: any) => keepRock(r, rl));
  cm.zones   = sanitizeRows(cm.zones,   SMALL_FIX.R770 !== 0 ? MAP_READ_MAX_ZONES : MAP_EDIT_MAX_ZONES,   keepZone);
  cm.portals = sanitizeRows(cm.portals, MAP_EDIT_MAX_PORTALS, keepPortal);
  const custom = data.mazeType === MAZE_TYPE_CUSTOM;
  const before: number[] | null = custom ? cm.portals.map((p: { id: number }) => p.id) : null;
  renumberHugeIds(data, custom ? cm.portals : null,
    cm.walls, cm.rocks, cm.zones, cm.portals);
  cm.nextId  = repairNextId(cm.nextId, cm.walls, cm.rocks, cm.zones, cm.portals);
  renumberLowPortalIds(data, cm);
  if (before === null) return null;
  let moved: Map<number, number> | null = null;
  for (let i = 0; i < before.length; i++) {
    if (cm.portals[i].id !== before[i]) (moved ??= new Map()).set(before[i], cm.portals[i].id);
  }
  return moved;
}

function clampMapPortals(data: any): void {
  const mp = data.mapPortals;
  if (mp === undefined) return;
  if (!mp || typeof mp !== 'object' || !Array.isArray(mp.portals)) { delete data.mapPortals; return; }
  mp.portals = sanitizeRows(mp.portals, 64, keepPortal);
  const n = finiteInt(mp.nextId);
  let next = n !== null && n >= 0 && n <= EDIT_ID_MAX ? n : 16;
  for (const q of mp.portals) if (q.id >= next) next = q.id + 1;
  mp.nextId = next;
}

function clampMapAreas(data: any): void {
  const ma = data.mapAreas;
  if (ma === undefined) return;
  if (!ma || typeof ma !== 'object') { delete data.mapAreas; return; }
  ma.zones = sanitizeRows(ma.zones, MAP_READ_MAX_ZONES, keepZone);
  for (const z of ma.zones) if (!z.kind) z.kind = 'cosmetic';
  renumberHugeIds(data, null, ma.zones);
  ma.nextId = repairNextId(ma.nextId, ma.zones);
}

function clampMapEvents(data: any): void {
  if (data.events === undefined) return;
  const zones = [...(data.customMap?.zones ?? []), ...(data.mapAreas?.zones ?? [])];
  const d = clampEventsDoc(data.events, zones);
  if (d) data.events = d; else delete data.events;
}

function clampMapTweaks(data: any): void {
  const mt = data.mapTweaks;
  if (mt === undefined) return;
  if (!mt || typeof mt !== 'object') { delete data.mapTweaks; return; }
  const rl = rockLimitsForConfig(data);
  mt.walls = sanitizeRows(mt.walls, MAP_EDIT_MAX_WALLS, keepWall);
  mt.rocks = sanitizeRows(mt.rocks, MAP_EDIT_MAX_ROCKS, (r: any) => keepRock(r, rl));
  mt.removedRockKeys = Array.isArray(mt.removedRockKeys)
    ? mt.removedRockKeys.filter((k: any) => typeof k === 'string').slice(0, MAP_EDIT_MAX_ROCKS)
    : [];
  renumberHugeIds(data, null, mt.walls, mt.rocks);
  mt.nextId = repairNextId(mt.nextId, mt.walls, mt.rocks);
  if (mt.layoutKey !== undefined && typeof mt.layoutKey !== 'string') delete mt.layoutKey;
}

function clampMapConfigRequiredFields(data: any): void {
  if (!data.tileOverrides || typeof data.tileOverrides !== 'object' || Array.isArray(data.tileOverrides)) {
    data.tileOverrides = {};
  } else {
    for (const key in data.tileOverrides) {
      const v = Number(data.tileOverrides[key]);
      if (!Number.isFinite(v) || v < 0 || v > 255) delete data.tileOverrides[key];
      else data.tileOverrides[key] = Math.round(v);
    }
  }

  const types = Array.isArray(data.rockTypes)
    ? data.rockTypes.filter((t: any) => t === 'rock' || t === 'stone' || t === 'gravel')
    : [];
  data.rockTypes = types.length > 0 ? types : [...DEFAULT_MAP_CONFIG.rockTypes];
  if (data.rocksLeftOut !== undefined) {
    const lo = Array.isArray(data.rocksLeftOut)
      ? data.rocksLeftOut.filter((t: any, i: number, a: any[]) => (t === 'stone' || t === 'gravel') && a.indexOf(t) === i)
      : [];
    if (lo.length > 0) data.rocksLeftOut = lo; else delete data.rocksLeftOut;
  }

  if (typeof data.name !== 'string') data.name = DEFAULT_MAP_CONFIG.name;

  for (const key of ['portalLinks', 'portalTimings', 'portalLevels', 'portalKinds', 'portalBotOdds', 'portalBossBlacklist'] as const) {
    const rows = (data as any)[key];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) { delete (data as any)[key]; continue; }
    (data as any)[key] = rows.filter((row: any) => row && typeof row === 'object' && Number.isFinite(row.portalId));
  }
  if (Array.isArray(data.portalBotOdds)) {
    data.portalBotOdds = data.portalBotOdds.filter((r: any) => Number.isFinite(r.odds));
    for (const r of data.portalBotOdds) {
      r.odds = Math.max(0, Math.min(100, r.odds));
      if (r.known !== undefined && typeof r.known !== 'boolean') delete r.known;
      for (const k of ['highLevel', 'oddsHigh', 'dreadShare']) if (r[k] !== undefined) { if (typeof r[k] !== 'number' || !Number.isFinite(r[k])) delete r[k]; else r[k] = Math.max(0, k === 'highLevel' ? Math.min(1000, Math.round(r[k])) : Math.min(100, r[k])); }
    }
  }
  if (Array.isArray(data.portalBossBlacklist)) {
    data.portalBossBlacklist = data.portalBossBlacklist.filter((r: any) => typeof r.on === 'boolean');
  }
  if (Array.isArray(data.portalKinds)) {
    data.portalKinds = data.portalKinds.filter((r: any) => r.kind === 'blackHole' || r.kind === 'wormhole');
    for (const r of data.portalKinds) {
      for (const k of ['reach', 'pull', 'jump', 'exitDistance', 'exitThrow', 'exitPortalId', 'emitAngle'] as const) if (r[k] !== undefined && !Number.isFinite(r[k])) delete r[k];
      for (const k of ['invisible', 'showName', 'bothWays', 'reachSquare', 'keepSpeed'] as const) if (r[k] !== undefined && typeof r[k] !== 'boolean') delete r[k];
      if (r.exitAreaId !== undefined && typeof r.exitAreaId !== 'string') delete r.exitAreaId;
      for (const k of ['shapes', 'rounds'] as const) if (r[k] !== undefined && !PORTAL_THINGS_WORDS.includes(r[k])) delete r[k];
      if (r.toMode !== undefined && (typeof r.toMode !== 'string' || r.toMode.length > 64)) delete r.toMode;
      if (r.inArea !== undefined && !Number.isInteger(r.inArea)) delete r.inArea;
      for (const k of ['theme', 'themeUseMap'] as const) if (r[k] !== undefined && typeof r[k] !== 'boolean') delete r[k];
      if (r.themeHex !== undefined && !(typeof r.themeHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.themeHex))) delete r.themeHex;
      if (r.themeMap !== undefined && !(Number.isInteger(r.themeMap) && r.themeMap >= 0 && r.themeMap < 20)) delete r.themeMap;
      for (const k of ['particleCountRand', 'particleSpeedRand'] as const) if (r[k] !== undefined) { if (!Number.isFinite(r[k])) delete r[k]; else r[k] = Math.max(0, Math.min(100, r[k])); }
    }
  }
  if (data.wallBlocks !== undefined && typeof data.wallBlocks !== 'boolean') delete data.wallBlocks;
  for (const k of ['wallPaint', 'rockPaint'] as const) { if (data[k] !== undefined) { const p = cleanMapPaint(data[k]); if (p) data[k] = p; else delete data[k]; } }
  const _cm = data.customMap as { walls?: { paint?: unknown }[]; rocks?: { paint?: unknown }[] } | undefined;
  if (_cm && typeof _cm === 'object') for (const list of [_cm.walls, _cm.rocks]) if (Array.isArray(list)) for (const r of list) if (r && typeof r === 'object' && r.paint !== undefined) { const p = cleanMapPaint(r.paint); if (p) r.paint = p; else delete r.paint; }
  cleanMagicMazeField(data);
  if (Array.isArray(data.portalTimings)) {
    for (const t of data.portalTimings) {
      t.timed = !!t.timed;
      if (!(Number.isFinite(t.appearDuration) && t.appearDuration > 0)) t.appearDuration = PORTAL_TIMING_DEFAULTS.appearDuration;
      if (!(Number.isFinite(t.disappearDuration) && t.disappearDuration > 0)) t.disappearDuration = PORTAL_TIMING_DEFAULTS.disappearDuration;
      if (!(Number.isFinite(t.initialDelay) && t.initialDelay >= 0)) t.initialDelay = PORTAL_TIMING_DEFAULTS.initialDelay;
    }
  }
  if (data.bossGroups !== undefined) {
    const groups = clampBossGroups(data.bossGroups);
    if (groups) data.bossGroups = groups; else delete data.bossGroups;
  }
}

function clampBaseProtector(data: any): void {
  if (data.enableBaseProtectors !== undefined) data.enableBaseProtectors = !!data.enableBaseProtectors;
  if (data.baseProtectorPush !== undefined) data.baseProtectorPush = !!data.baseProtectorPush;
  if (data.baseProtectorOnMinimap !== undefined) data.baseProtectorOnMinimap = !!data.baseProtectorOnMinimap;

  const arr = data.baseProtectorTeams;
  if (arr === undefined) return;
  if (!Array.isArray(arr)) {
    delete data.baseProtectorTeams;
    return;
  }
  if (arr.length > 4) arr.length = 4;
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (e === undefined || e === null) continue;
    if (typeof e !== 'object' || Array.isArray(e)) { arr[i] = {}; continue; }
    if (e.enabled !== undefined) e.enabled = !!e.enabled;
    if (e.tank !== undefined && (typeof e.tank !== 'string' || e.tank.trim() === '')) delete e.tank;
    if (e.count !== undefined) {
      const c = Number(e.count);
      e.count = Number.isFinite(c)
        ? Math.max(1, Math.min(BASE_PROTECTOR_MAX_COUNT, Math.round(c)))
        : 1;
    }
    if (e.arrangement !== undefined && e.arrangement !== 'center' && e.arrangement !== 'corners') delete e.arrangement;
    if (e.smart !== undefined) e.smart = !!e.smart;
  }
}

function clampMapGrid(data: any): void {
  if (typeof data.gridCells !== 'number') return;
  if (typeof data.gridCellsY === 'number') {
    const g = clampGridSize(data.gridCells, data.gridCellsY, 'h');
    if (g.w !== data.gridCells) data.gridCells = g.w;
    if (g.h !== data.gridCellsY) data.gridCellsY = g.h;
  } else {
    const g = clampGridSize(data.gridCells, data.gridCells, 'both');
    if (g.w !== data.gridCells) data.gridCells = g.w;
  }
}

function clampMapConfig(data: any): Map<number, number> | null {
  if (!data || typeof data !== 'object') return null;
  const base: any = createDefaultMapConfig();
  for (const k in base) if (data[k] === undefined || data[k] === null) data[k] = base[k];
  clampFields(data, MAP_CONFIG_RANGES);
  clampMapGrid(data);
  if (data.rockTiles !== undefined) {
    if (data.rockTiles && typeof data.rockTiles === 'object' && !Array.isArray(data.rockTiles)) data.rockTiles = rockTilesOf(data.rockTiles);
    else delete data.rockTiles;
  }
  clampMapConfigRequiredFields(data);
  clampSpawnZoneScales(data);
  clampBaseProtector(data);
  const portalRemap = clampCustomMap(data);
  clampMapTweaks(data);
  clampMapAreas(data);
  clampMapPortals(data);
  clampMapEvents(data);
  return portalRemap;
}

function dedupeTankIdentities(data: any): void {
  const turrets: any[] = Array.isArray(data.turrets) ? data.turrets : [];
  const layers: any[] = Array.isArray(data.bodyLayers) ? data.bodyLayers : [];

  const mint = (base: string, taken: Set<string>): string => {
    let n = 2;
    let candidate = `${base || 'id'}_${n}`;
    while (taken.has(candidate)) { n++; candidate = `${base || 'id'}_${n}`; }
    taken.add(candidate);
    return candidate;
  };

  const allTurretIds = new Set<string>();
  for (const t of turrets) if (t && typeof t.id === 'string') allTurretIds.add(t.id);
  const seenTurretIds = new Set<string>();
  const splits = new Map<string, string[]>();
  const reserved = (id: string) => SMALL_FIX.GH349 !== 0 && id.charCodeAt(0) === 126;
  for (const t of turrets) {
    if (!t || typeof t !== 'object') continue;
    const id = typeof t.id === 'string' ? t.id : '';
    if (id !== '' && !reserved(id) && !seenTurretIds.has(id)) { seenTurretIds.add(id); continue; }
    const fresh = mint(id !== '' && !reserved(id) ? id : 'turret', allTurretIds);
    t.id = fresh;
    if (reserved(id) && !seenTurretIds.has(id)) {
      seenTurretIds.add(id);
      if (data.primaryTurretId === id) data.primaryTurretId = fresh;
    }
    seenTurretIds.add(fresh);
    if (id !== '') {
      const list = splits.get(id);
      if (list) list.push(fresh); else splits.set(id, [fresh]);
    }
  }

  const tankSub = SMALL_FIX.GH318 !== 0 ? new Set<string>() : null;
  const takenAll = new Set<string>();
  if (tankSub) for (const t of turrets) if (t && Array.isArray(t.autoSubTurrets)) for (const s of t.autoSubTurrets) if (s && typeof s.id === 'string') takenAll.add(s.id);
  for (const t of turrets) {
    if (!t || !Array.isArray(t.autoSubTurrets)) continue;
    const takenSub = tankSub ? takenAll : new Set<string>();
    if (!tankSub) for (const s of t.autoSubTurrets) if (s && typeof s.id === 'string') takenSub.add(s.id);
    const seenSub = new Set<string>();
    for (const s of t.autoSubTurrets) {
      if (!s || typeof s !== 'object') continue;
      const sid = typeof s.id === 'string' ? s.id : '';
      if (reserved(sid)) {
        s.id = mint('sub', takenSub);
        seenSub.add(s.id);
        if (tankSub) tankSub.add(s.id);
        if (t.primarySubTurretId === sid) t.primarySubTurretId = s.id;
        continue;
      }
      if (sid !== '' && !seenSub.has(sid)) {
        seenSub.add(sid);
        if (!tankSub || !tankSub.has(sid)) { if (tankSub) tankSub.add(sid); continue; }
        s.id = mint(sid, takenSub);
        tankSub.add(s.id);
        if (t.primarySubTurretId === sid) t.primarySubTurretId = s.id;
        continue;
      }
      s.id = mint(sid || 'sub', takenSub);
      seenSub.add(s.id);
      if (tankSub) tankSub.add(s.id);
    }
  }

  if (splits.size > 0) {
    for (const l of layers) {
      if (!l || !Array.isArray(l.turretIds)) continue;
      const extra: string[] = [];
      for (const ref of l.turretIds) {
        const added = splits.get(ref);
        if (added) for (const id of added) if (!l.turretIds.includes(id) && !extra.includes(id)) extra.push(id);
      }
      if (extra.length > 0) l.turretIds = [...l.turretIds, ...extra];
    }
  }
  if (SMALL_FIX.G606 !== 0) {
    const owned = new Set<string>();
    for (const l of layers) {
      if (!l || !Array.isArray(l.turretIds)) continue;
      const keep = l.turretIds.filter((id: unknown) => { if (typeof id !== 'string') return true; if (owned.has(id)) return false; owned.add(id); return true; });
      if (keep.length !== l.turretIds.length) l.turretIds = keep;
    }
  }

  const allLayerIds = new Set<string>();
  for (const l of layers) if (l && typeof l.id === 'string') allLayerIds.add(l.id);
  allLayerIds.add('main');
  const seenLayerIds = new Set<string>(['main']);
  for (const l of layers) {
    if (!l || typeof l !== 'object') continue;
    const id = typeof l.id === 'string' ? l.id : '';
    if (id !== '' && !seenLayerIds.has(id) && !(id in Object.prototype)) { seenLayerIds.add(id); continue; }
    l.id = mint(id || 'layer', allLayerIds);
    seenLayerIds.add(l.id);
  }
}

export function clampTankConfig(data: any): void {
  if (!data || typeof data !== 'object') return;
  clampFields(data, TANK_CONFIG_RANGES);
  if (data.turrets !== undefined && !Array.isArray(data.turrets)) delete data.turrets;
  if (data.bodyLayers !== undefined && !Array.isArray(data.bodyLayers)) delete data.bodyLayers;
  if (data.turretGroups !== undefined && !Array.isArray(data.turretGroups)) delete data.turretGroups;
  if (Array.isArray(data.turretGroups) && data.turretGroups.length > MAX_TURRET_GROUPS) data.turretGroups.length = MAX_TURRET_GROUPS;
  if (Array.isArray(data.turrets)) {
    data.turrets = data.turrets.filter((r: any) => r && typeof r === 'object' && !Array.isArray(r));
    if (data.turrets.length > MAX_TURRETS_PER_NODE) data.turrets.length = MAX_TURRETS_PER_NODE;
    for (let i = 0; i < data.turrets.length; i++) clampTurret(data.turrets[i], 1);
  }
  if (typeof data.snapPlacementCount === 'number' && Number.isFinite(data.snapPlacementCount)) data.snapPlacementCount = Math.round(data.snapPlacementCount);
  clampScalarFinite(data, 'fovMultiplier', undefined);
  clampAngleField(data, 'customAimAngle');
  clampSkillTable(data, 'skillCaps');
  clampSkillTable(data, 'preDefinedSkills');
  clampSignField(data, 'baseSpinDirection');
  if (data.tankColor !== undefined && typeof data.tankColor !== 'string') data.tankColor = INITIAL_GAME_STATE.tankColor;
  if (Array.isArray(data.bodyLayers)) {
    data.bodyLayers = data.bodyLayers.filter((l: any) => l && typeof l === 'object');
    if (data.bodyLayers.length > 10) data.bodyLayers.length = 10;
    for (let i = 0; i < data.bodyLayers.length; i++) clampBodyLayer(data.bodyLayers[i]);
  }
  dedupeTankIdentities(data);
}

function clampMultiAreaMapConfig(data: any): void {
  if (!data || typeof data !== 'object') return;
  if (!Array.isArray(data.areas)) return;
  data.areas = data.areas.filter((a: any) =>
    a && typeof a === 'object' && typeof a.id === 'string'
    && a.mapConfig && typeof a.mapConfig === 'object' && !Array.isArray(a.mapConfig));
  {
    const seenAreaIds = new Set<string>();
    const allAreaIds = new Set<string>(data.areas.map((a: any) => a.id));
    for (let i = 0; i < data.areas.length; i++) {
      const area = data.areas[i];
      if (area.id !== '' && !seenAreaIds.has(area.id)) { seenAreaIds.add(area.id); continue; }
      let n = 2;
      let candidate = `${area.id || 'area'}_${n}`;
      while (seenAreaIds.has(candidate) || allAreaIds.has(candidate)) { n++; candidate = `${area.id || 'area'}_${n}`; }
      area.id = candidate;
      seenAreaIds.add(candidate);
      allAreaIds.add(candidate);
    }
  }
  let portalRemaps: Map<string, Map<number, number>> | null = null;
  for (let i = 0; i < data.areas.length; i++) {
    const area = data.areas[i];
    clampFields(area, AREA_CONFIG_RANGES);
    const remap = clampMapConfig(area.mapConfig);
    if (remap) (portalRemaps ??= new Map()).set(area.id, remap);
    if (area.shapeSpawnConfig !== undefined
        && (!area.shapeSpawnConfig || typeof area.shapeSpawnConfig !== 'object' || Array.isArray(area.shapeSpawnConfig))) {
      delete area.shapeSpawnConfig;
    }
    if (typeof area.name !== 'string') area.name = area.mapConfig.name;
    if (area.shapeSpawnConfig) clampShapeSpawnConfig(area.shapeSpawnConfig);
    if (area.gapBefore !== undefined) {
      if (typeof area.gapBefore === 'number' && Number.isFinite(area.gapBefore)) area.gapBefore = areaGapOf(area);
      else delete area.gapBefore;
    }
  }
  const ids = new Set(data.areas.map((a: any) => a.id));
  for (let i = 0; i < data.areas.length; i++) {
    const links = data.areas[i].mapConfig.portalLinks;
    if (!Array.isArray(links)) continue;
    data.areas[i].mapConfig.portalLinks = links.filter(
      (l: any) => l && typeof l === 'object' && ids.has(l.destinationAreaId));
  }
  if (portalRemaps) {
    for (let i = 0; i < data.areas.length; i++) {
      const kinds = data.areas[i].mapConfig.portalKinds;
      if (!Array.isArray(kinds)) continue;
      for (const r of kinds) {
        if (!r || typeof r !== 'object' || typeof r.exitAreaId !== 'string' || r.exitAreaId === '') continue;
        const to = portalRemaps.get(r.exitAreaId)?.get(r.exitPortalId);
        if (to !== undefined) r.exitPortalId = to;
      }
    }
  }
  if (typeof data.enableMultiArea !== 'boolean') data.enableMultiArea = data.areas.length > 0;
  if (data.areaLayout !== undefined && data.areaLayout !== 'near' && data.areaLayout !== 'far') delete data.areaLayout;
  if (data.areaStack !== undefined && data.areaStack !== 'column') delete data.areaStack;
  if (data.minimapAllAreas !== undefined && typeof data.minimapAllAreas !== 'boolean') delete data.minimapAllAreas;
  if (typeof data.activeAreaId !== 'string' || !ids.has(data.activeAreaId)) {
    data.activeAreaId = data.areas.length > 0 ? data.areas[0].id : '';
  }
}

function clampCustomProjectileDesign(data: any, parentLayer: number = 0): void {
  if (!data || typeof data !== 'object') return;
  clampNullsTo(data, CUSTOM_PROJECTILE_DESIGN_RANGES, 'fallback');
  clampFields(data, CUSTOM_PROJECTILE_DESIGN_RANGES);
  if (data.color !== undefined && typeof data.color !== 'string') delete data.color;
  if (data.bodyColor !== undefined && typeof data.bodyColor !== 'string') delete data.bodyColor;
  if (data.turrets !== undefined && !Array.isArray(data.turrets)) delete data.turrets;
  if (Array.isArray(data.turrets)) {
    data.turrets = data.turrets.filter((r: any) => r && typeof r === 'object' && !Array.isArray(r));
    if (data.turrets.length > MAX_TURRETS_PER_NODE) data.turrets.length = MAX_TURRETS_PER_NODE;
    if (parentLayer > 0 && !roundCanNest(parentLayer)) {
      if (data.turrets.length > 0) _layerTrimmed = true;
      data.turrets.length = 0;
    } else {
      for (let i = 0; i < data.turrets.length; i++) clampTurret(data.turrets[i], parentLayer + 1, 0);
    }
  }
  if (data.bodyLayers !== undefined && !Array.isArray(data.bodyLayers)) delete data.bodyLayers;
  if (Array.isArray(data.bodyLayers)) {
    data.bodyLayers = data.bodyLayers.filter((l: any) => l && typeof l === 'object');
    if (data.bodyLayers.length > 10) data.bodyLayers = data.bodyLayers.slice(0, 10);
    for (let i = 0; i < data.bodyLayers.length; i++) clampBodyLayer(data.bodyLayers[i]);
  }
  dedupeTankIdentities(data);
}

function clampTurretCollection(data: any): void {
  if (!data || typeof data !== 'object') return;
  if (data.category !== undefined && typeof data.category !== 'string') delete data.category;
  if (data.turrets !== undefined && !Array.isArray(data.turrets)) delete data.turrets;
  if (Array.isArray(data.turrets)) {
    data.turrets = data.turrets.filter((r: any) => r && typeof r === 'object' && !Array.isArray(r));
    if (data.turrets.length > MAX_TURRETS_PER_NODE) data.turrets.length = MAX_TURRETS_PER_NODE;
    for (let i = 0; i < data.turrets.length; i++) clampTurret(data.turrets[i], 1);
  }
  if (data.layers !== undefined && !Array.isArray(data.layers)) delete data.layers;
  if (Array.isArray(data.layers)) {
    data.layers = data.layers.filter((r: any) => r && typeof r === 'object' && !Array.isArray(r));
    if (data.layers.length > MAX_TURRETS_PER_NODE) data.layers.length = MAX_TURRETS_PER_NODE;
    for (let i = 0; i < data.layers.length; i++) clampTurret(data.layers[i], 1);
  }
  clampScalarFinite(data, 'baseSize', 20);
}

export const FOOD_SHAPE_RANGES = {
  sides:        { min: 0,   max: 16,  fallback: 0   },
  size:         { min: 4,   max: 600, fallback: 20  },
  hp:           { min: 0.1, max: 1e9, fallback: 10  },
  bodyDamage:   { min: 0,   max: 1e6, fallback: 5   },
  shield:       { min: 0,   max: 1e8, fallback: 0   },
  shieldRegen:  { min: 0,   max: 1e6, fallback: 0   },
  xpValue:      { min: 0,   max: 1e13, fallback: 30 },
  pushability:  { min: 0,   max: 5,   fallback: 0.6 },
  driftSpeed:   { min: 0,   max: 500, fallback: 100 },
  centerBias:   { min: 0,   max: 100, fallback: 0   },
  resist:       { min: 1,   max: 100, fallback: 1   },
  penetration:  { min: 0.1, max: 100, fallback: 1   },
  crasherSpeed: { min: 0,   max: 50,  fallback: 0   },
  labyLevel:    { min: 0,   max: 5,   fallback: 0   },
} satisfies Record<string, Range>;

function clampOptionalShapeNumber(data: any, key: string, min: number, max: number): void {
  const v = data[key];
  if (v === undefined) return;
  if (typeof v !== 'number' || !isFinite(v)) { delete data[key]; return; }
  data[key] = v < min ? min : v > max ? max : v;
}

export function clampFoodShapeDesign(data: any): void {
  if (!data || typeof data !== 'object') return;
  for (const k in FOOD_SHAPE_RANGES) {
    if (data[k] === undefined || data[k] === null) data[k] = FOOD_SHAPE_RANGES[k].fallback;
  }
  clampFields(data, FOOD_SHAPE_RANGES);
  data.sides = Math.round(data.sides);
  if (data.sides === 1 || data.sides === 2) data.sides = 3;
  data.labyLevel = Math.round(data.labyLevel);
  data.isCrasher = !!data.isCrasher;
  if (typeof data.color === 'string') data.color = data.color.toLowerCase();
  clampOptionalShapeNumber(data, 'hitOnRounds', 0, 1e6);
  clampOptionalShapeNumber(data, 'sizeRandomization', 0, 100);
  clampOptionalShapeNumber(data, 'pathTurn', 0, 500);
  clampOptionalShapeNumber(data, 'ramHealthScale', 0.0001, 1e6);
  if (data.correspondsTo !== undefined && typeof data.correspondsTo !== 'string') delete data.correspondsTo;
  const _cm = cmMapOf(data.colorMap);
  if (_cm === undefined) delete data.colorMap; else data.colorMap = _cm;
  if (_cm !== undefined && _cm >= 0) data.color = cmHex(_cm, false, CM_USE.SHAPE);
  if (_cm !== undefined && _cm >= 0 && typeof data.colorFree === 'string') data.colorFree = data.colorFree.toLowerCase();
  else delete data.colorFree;
  if (data.look && typeof data.look === 'object') evenOtherColours(data.look.body, 0);
}

let _layerTrimmed = false;
const _layerTrimmedFiles = new WeakSet<object>();
export function wasLayerTrimmed(file: object | null | undefined): boolean {
  return !!file && _layerTrimmedFiles.has(file);
}

function evenOtherColours(part: any, depth: number): void {
  if (!part || typeof part !== 'object' || depth > 8) return;
  if (typeof part.color === 'string') part.color = part.color.toLowerCase();
  if (Array.isArray(part.parts)) for (let i = 0; i < part.parts.length; i++) evenOtherColours(part.parts[i], depth + 1);
}

function clampModeOfFile(c: GameModeConfig): void {
  c.mode = (SMALL_FIX.GH612 !== 0 && c.mode === 'sandbox') ? 'sandbox' : 'scripted';
  delete c.preset;
  delete c.overlay;
  c.teams = Math.max(2, Math.min(4, Math.round(Number(c.teams)) || 2));
  c.playerTeam = Math.max(1, Math.min(4, Math.round(Number(c.playerTeam)) || 1));
  c.levelCap = Math.max(1, Math.min(1000, Math.round(Number(c.levelCap)) || 45));
  c.growth = c.growth === true;
  c.armsRace = c.armsRace === true ? true : undefined;
  if (c.maxTanksAlive !== undefined) c.maxTanksAlive = Math.max(1, Math.min(600, Math.round(Number(c.maxTanksAlive)) || 50));
  if (c.tankDebuffs !== undefined) { const d = clampTankDebuffs(c.tankDebuffs); if (d) c.tankDebuffs = d; else delete c.tankDebuffs; }
  if (c.halloween !== undefined) { const h = cleanHalloweenLook(c.halloween); if (h) c.halloween = h; else delete c.halloween; }
  if (c.vampirism !== true) delete c.vampirism;
  if (c.startingScore !== undefined) { const v = Math.round(Number(c.startingScore)); if (Number.isFinite(v) && v > 0) c.startingScore = Math.min(STARTING_SCORE_MAX, v); else delete c.startingScore; }
  if (c.growthModel !== undefined && c.growthModel !== 'simple' && c.growthModel !== 'rules') delete c.growthModel;
  if (c.growthRules !== undefined) { const r = clampGrowthRules(c.growthRules); if (r) c.growthRules = r; else delete c.growthRules; }
  if (!c.teamEnemyConfig || typeof c.teamEnemyConfig !== 'object') c.teamEnemyConfig = { team1: 0, team2: 0, team3: 0, team4: 0, ffa: 0 } as GameModeConfig['teamEnemyConfig'];
  for (const k of Object.keys(c.teamEnemyConfig) as (keyof GameModeConfig['teamEnemyConfig'])[]) c.teamEnemyConfig[k] = Math.max(0, Math.min(60, Math.round(Number(c.teamEnemyConfig[k])) || 0)) as never;
}
export function sanitizeImport(file: ExportFile): ExportFile {
  const data = file.data;
  if (!data || typeof data !== 'object') return file;
  _layerTrimmed = false;

  switch (file.type) {
    case 'Tank':              clampTankConfig(data);              break;
    case 'CustomProjectile':  clampCustomProjectileDesign(data);  break;
    case 'TurretPreset':      clampTurretCollection(data);        break;
    case 'CustomTurret':      clampTurretCollection(data);        break;
    case 'Map':               clampMapConfig(data);               break;
    case 'GameMode': {
      const f = data as unknown as { map: MapConfig; config: GameModeConfig; areas?: MultiAreaMapConfig };
      clampMapConfig(f.map); clampModeOfFile(f.config);
      if (f.areas) clampMultiAreaMapConfig(f.areas);
      break;
    }
    case 'MultiAreaMap':      clampMultiAreaMapConfig(data);      break;
    case 'FoodShape':         clampFoodShapeDesign(data);         break;
    case 'Other':             evenOtherColours((data as any).body, 0); break;
    default:
      break;
  }
  if (_layerTrimmed) { _layerTrimmedFiles.add(file); _layerTrimmed = false; }
  return file;
}
