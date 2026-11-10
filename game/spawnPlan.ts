import type { ShapeSpawnConfig, ShapeSpawnCrowd } from '../types';
import { SPAWN_PROFILES, SPAWN_PROFILE_OF_WORLD, SPAWN_PROFILE_SPECIAL, SPAWN_PROFILE_DEFAULT, SPAWN_PROFILE_IDS } from './spawnPlan.generated';

export { SPAWN_PROFILES, SPAWN_PROFILE_IDS };

const BASE_KEYS = ['egg', 'square', 'triangle', 'pentagon', 'hexagon'] as const;

export function applySpawnProfile(cfg: ShapeSpawnConfig, id: string): ShapeSpawnConfig {
  const key = SPAWN_PROFILES[id] ? id : SPAWN_PROFILE_DEFAULT;
  const p = SPAWN_PROFILES[key];
  for (const k of BASE_KEYS) {
    const row = cfg.baseShapes[k];
    if (!row) continue;
    row.spawnWeight = p.outsideWeights[k] ?? 0;
    row.enabled = true;
  }
  for (const k in cfg.scaleVariants) {
    const row = cfg.scaleVariants[k];
    const w = p.scaledWeights[k] ?? 0;
    row.enabled = w > 0;
    if (w > 0) row.spawnWeight = w;
  }
  cfg.scaledVariantCap = p.scaledCap;
  for (let t = 1; t <= 5; t++) { const row = cfg.labyEnabled[t] || (cfg.labyEnabled[t] = {}); for (const k of BASE_KEYS) row[k] = true; }
  for (const r of ['normal', 'shiny', 'legendary', 'shadow', 'rainbow', 'trans']) cfg.rarityEnabled[r] = true;
  cfg.shinyChance = p.shiny || cfg.shinyChance;
  cfg.legendaryChance = p.legendary || cfg.legendaryChance;
  cfg.shadowChance = p.shadow || cfg.shadowChance;
  cfg.rainbowChance = p.rainbow || cfg.rainbowChance;
  cfg.transChance = p.trans || cfg.transChance;
  cfg.polyhedraChance = p.polyhedraOneIn;
  cfg.foodCap = p.foodCap;
  cfg.crasherEnabled = p.crasherOneIn > 0;
  cfg.plan = {
    profile: key,
    noFood: p.noFood,
    nestSize: p.nestSize, nestShare: p.nestShare, nestCap: p.nestCap,
    nestWeights: { ...p.nestWeights },
    nestPace: p.nestPace,
    crowd: { on: p.crowdOn, enemyFirst: p.crowdEnemyFirst, enemyNext: p.crowdEnemyNext, enemyKeep: p.crowdEnemyKeep, teamFirst: p.crowdTeamFirst, teamKeep: p.crowdTeamKeep, margin: p.crowdMargin, kinds: { ...p.crowdKinds } },
    tierOneIn: [...p.tierOneIn],
    crasherOneIn: p.crasherOneIn, nestCrasherOneIn: p.nestCrasherOneIn,
    gemOneIn: p.gemOneIn, jewelOneIn: p.jewelOneIn, eggToGem: p.eggToGem,
    scaledOneIn: p.scaledOneIn,
    relicOneIn: p.relicOneIn, relicWeights: { ...p.relicWeights },
  };
  return cfg;
}

export function spawnProfileOfWorld(world: string | undefined | null): string {
  return (world && SPAWN_PROFILE_OF_WORLD[world]) || SPAWN_PROFILE_DEFAULT;
}

export function spawnProfileSpecial(key: string): string {
  return SPAWN_PROFILE_SPECIAL[key] || SPAWN_PROFILE_DEFAULT;
}

export const SPAWN_PROFILE_DEFAULT_ID = SPAWN_PROFILE_DEFAULT;

export const RELIC_CORES = ['amethyst', 'citrine', 'emerald', 'ruby', 'sapphire', 'topaz'] as const;
export function relicShapeId(kind: string, core: string): string {
  return 'user:' + kind.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + '-relic-' + core;
}

export function planCrowdBoost(c: ShapeSpawnCrowd | undefined, pairs: number, mates: number): number {
  if (!c || !c.on) return 1;
  let k = 1;
  if (pairs >= 1) {
    k += c.enemyFirst;
    const ek = c.enemyKeep > 0 && c.enemyKeep < 1 ? c.enemyKeep : 0;
    if (pairs >= 2) k += ek > 0 ? c.enemyNext * (1 - Math.pow(ek, pairs - 1)) / (1 - ek) : c.enemyNext;
  }
  if (mates >= 1) {
    const tk = c.teamKeep > 0 && c.teamKeep < 1 ? c.teamKeep : 0;
    k += tk > 0 ? c.teamFirst * (1 - Math.pow(tk, mates)) / (1 - tk) : c.teamFirst;
  }
  return k;
}
