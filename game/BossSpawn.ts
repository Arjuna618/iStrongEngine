import type { MapConfig, GameModeType, BossGroupConfig } from '../types';
import { bossShares, clampStatShares, STAT_SHARES, type StatShares } from './statShares';

export type { BossGroupConfig };

export const BOSS_SPAWN_FEATURE: number = 1;

export const BOSS_MAX_GROUPS = 16;
export const BOSS_MAX_TANKS_PER_GROUP = 128;

export const BOSS_MAX_WEIGHT = 999;

export const BOSS_DEFAULT_INITIAL_DELAY_MS = 30000;
export const BOSS_DEFAULT_COOLDOWN_MS = 60000;

export const BOSS_MIN_DELAY_MS = 0;
export const BOSS_MAX_DELAY_MS = 900000;
export const BOSS_MIN_COOLDOWN_MS = 10000;
export const BOSS_MAX_COOLDOWN_MS = 1800000;

export const BOSS_GROUP_ELITES = 'Elites';
export const BOSS_GROUP_MYSTICALS = 'Mysticals';
export const BOSS_GROUP_DELTAS = 'Deltas';
export const BOSS_GROUP_NESTERS = 'Nesters';
export const BOSS_GROUP_ROGUES = 'Rogues';

const ELITE_TANKS: readonly string[] = [
  'Elite Battleship', 'Elite Destroyer', 'Elite Gunner', 'Elite Skimmer',
  'Elite Spawner', 'Elite Spinner', 'Elite Sprayer', 'Elite Trap Guard',
  'Sprayer Legion', 'Elite Sprayer (Old)',
];
const MYSTICAL_TANKS: readonly string[] = [
  'Summoner', 'Witch', 'Sorcerer', 'Shaman', 'Enchantress', 'Exorcistor', 'Thaumaturge',
];
const DELTA_TANKS: readonly string[] = [
  'Delta Battleship', 'Delta Destroyer', 'Delta Gunner', 'Delta Sprayer',
  'Delta Skimmer', 'Delta Spawner',
];
const NESTER_TANKS: readonly string[] = [
  'Nest Keeper', 'Nest Champion', 'Nest Curator', 'Nest Deacon', 'Nest Guardian', 'Nest Warden',
];
const ROGUE_TANKS: readonly string[] = [
  'Rogue Palisade', 'Rogue Armada', 'Rogue Alcazar',
];

function cloneGroups(src: readonly { name: string; tanks: readonly string[]; weight: number }[]): BossGroupConfig[] {
  const out: BossGroupConfig[] = [];
  for (let i = 0; i < src.length; i++) {
    out.push({ name: src[i].name, tanks: src[i].tanks.slice(), weight: src[i].weight, stats: bossShares() });
  }
  return out;
}

export function copyBossGroup(g: BossGroupConfig): BossGroupConfig {
  const out: BossGroupConfig = { name: g.name, tanks: g.tanks.slice(), weight: g.weight };
  if (g.stats) out.stats = { ...g.stats };
  return out;
}

export function bossStatsOf(cfg: MapConfig | undefined, name: string): StatShares | undefined {
  const groups = bossStrengthGroupsOf(cfg);
  for (let i = 0; i < groups.length; i++) if (Array.isArray(groups[i].tanks) && groups[i].tanks.includes(name)) return groups[i].stats;
  return undefined;
}

export function defaultBossGroups(): BossGroupConfig[] {
  return cloneGroups([
    { name: BOSS_GROUP_ELITES,    tanks: ELITE_TANKS,    weight: 10 },
    { name: BOSS_GROUP_MYSTICALS, tanks: MYSTICAL_TANKS, weight: 5 },
    { name: BOSS_GROUP_DELTAS,    tanks: DELTA_TANKS,    weight: 5 },
    { name: BOSS_GROUP_ROGUES,    tanks: ROGUE_TANKS,    weight: 3 },
    { name: BOSS_GROUP_NESTERS,   tanks: NESTER_TANKS,   weight: 2 },
  ]);
}

export function growthManhuntBossGroups(): BossGroupConfig[] {
  return cloneGroups([
    { name: BOSS_GROUP_ELITES,    tanks: ELITE_TANKS,    weight: 8 },
    { name: BOSS_GROUP_MYSTICALS, tanks: MYSTICAL_TANKS, weight: 6 },
    { name: BOSS_GROUP_DELTAS,    tanks: DELTA_TANKS,    weight: 6 },
    { name: BOSS_GROUP_ROGUES,    tanks: ROGUE_TANKS,    weight: 5 },
    { name: BOSS_GROUP_NESTERS,   tanks: NESTER_TANKS,   weight: 4 },
  ]);
}

const BOSS_DISABLED_MODES: readonly GameModeType[] = [
  'old-dreadnoughts', 'duos', 'maze-duos', 'squads', 'maze-squads', 'scripted',
];

export function bossSpawnsDefaultFor(mode: GameModeType): boolean {
  if (mode === 'sandbox') return false;
  return !BOSS_DISABLED_MODES.includes(mode);
}

export function modeBossGroups(mode: GameModeType, growth: boolean, isManhunt: boolean): BossGroupConfig[] | null {
  if (!bossSpawnsDefaultFor(mode)) return null;
  return (growth && isManhunt) ? growthManhuntBossGroups() : defaultBossGroups();
}

export function bossSpawnsActive(cfg: MapConfig | undefined): boolean {
  if (!BOSS_SPAWN_FEATURE) return false;
  if (!cfg) return false;
  return cfg.enableBossSpawns === true;
}

export function bossInitialDelay(cfg: MapConfig | undefined): number {
  const v = cfg?.bossInitialDelay;
  if (typeof v !== 'number' || !isFinite(v)) return BOSS_DEFAULT_INITIAL_DELAY_MS;
  return Math.max(BOSS_MIN_DELAY_MS, Math.min(BOSS_MAX_DELAY_MS, v));
}

export function bossSpawnCooldown(cfg: MapConfig | undefined): number {
  const v = cfg?.bossSpawnCooldown;
  if (typeof v !== 'number' || !isFinite(v)) return BOSS_DEFAULT_COOLDOWN_MS;
  return Math.max(BOSS_MIN_COOLDOWN_MS, Math.min(BOSS_MAX_COOLDOWN_MS, v));
}

export function bossesCanGrow(cfg: MapConfig | undefined): boolean {
  return cfg?.bossesCanGrow === true;
}

export function bossesUsePortals(cfg: MapConfig | undefined): boolean {
  return cfg?.bossesUsePortals === true;
}

export function bossGroupsOf(cfg: MapConfig | undefined): readonly BossGroupConfig[] {
  const g = cfg?.bossGroups;
  return Array.isArray(g) ? g : [];
}

export function bossGroupEligible(g: BossGroupConfig | undefined): boolean {
  return !!g && g.weight > 0 && Array.isArray(g.tanks) && g.tanks.length > 0;
}

let _shippedForStrength: readonly BossGroupConfig[] | null = null;
export function bossStrengthGroupsOf(cfg: MapConfig | undefined): readonly BossGroupConfig[] {
  if (STAT_SHARES.EVERY_WAY !== 0 && !Array.isArray(cfg?.bossGroups)) return _shippedForStrength ?? (_shippedForStrength = defaultBossGroups());
  return bossGroupsOf(cfg);
}

export function bossStrengthEveryWay(cfg: MapConfig | undefined): boolean {
  return cfg?.bossStrengthEveryWay !== false;
}

export function bossGroupPercent(groups: readonly BossGroupConfig[], index: number, can?: (g: BossGroupConfig) => boolean): number {
  let total = 0;
  for (let i = 0; i < groups.length; i++) {
    if (bossGroupEligible(groups[i]) && (!can || can(groups[i]))) total += groups[i].weight;
  }
  if (total <= 0) return 0;
  const g = groups[index];
  if (!bossGroupEligible(g) || (can && !can(g))) return 0;
  return (g.weight / total) * 100;
}

function chanceLive(g: BossGroupConfig | undefined, can?: (g: BossGroupConfig) => boolean): boolean {
  return !!g && Array.isArray(g.tanks) && g.tanks.length > 0 && (!can || can(g));
}
const _w3 = (x: number): number => Math.round(x * 1000) / 1000;

export function bossGroupChances(groups: readonly BossGroupConfig[], can?: (g: BossGroupConfig) => boolean): number[] {
  const n = groups.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(0);
  let total = 0;
  for (let i = 0; i < n; i++) if (chanceLive(groups[i], can) && groups[i].weight > 0) total += groups[i].weight;
  if (!(total > 0)) return out;
  const live: number[] = [], frac: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (!chanceLive(groups[i], can) || !(groups[i].weight > 0)) continue;
    const exact = (groups[i].weight / total) * 100;
    out[i] = Math.floor(exact);
    frac[i] = exact - out[i];
    sum += out[i];
    live.push(i);
  }
  live.sort((a, b) => (frac[b] - frac[a]) || (a - b));
  for (let k = 0; k < 100 - sum && k < live.length; k++) out[live[k]]++;
  return out;
}

export function bossGroupsWithChance(groups: readonly BossGroupConfig[], index: number, pct: number, can?: (g: BossGroupConfig) => boolean): BossGroupConfig[] {
  const out = groups.map(copyBossGroup);
  const me = out[index];
  if (!me) return out;
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  let others = 0, count = 0;
  for (let i = 0; i < out.length; i++) if (i !== index && chanceLive(out[i], can)) { others += Math.max(0, out[i].weight); count++; }
  me.weight = _w3(p);
  if (count === 0) return out;
  const rest = 100 - p;
  for (let i = 0; i < out.length; i++) {
    if (i === index || !chanceLive(out[i], can)) continue;
    out[i].weight = _w3(others > 0 ? (rest * Math.max(0, out[i].weight)) / others : rest / count);
  }
  return out;
}

export function rollBossGroup(groups: readonly BossGroupConfig[], rnd: () => number): number {
  let total = 0;
  let last = -1;
  for (let i = 0; i < groups.length; i++) {
    if (!bossGroupEligible(groups[i])) continue;
    total += groups[i].weight;
    last = i;
  }
  if (total <= 0) return -1;

  let answer = rnd() * total;
  for (let i = 0; i < groups.length; i++) {
    if (!bossGroupEligible(groups[i])) continue;
    if (answer < groups[i].weight) return i;
    answer -= groups[i].weight;
  }
  return last;
}

export function pickBossTank(g: BossGroupConfig | undefined, rnd: () => number): string | null {
  if (!g || !Array.isArray(g.tanks) || g.tanks.length === 0) return null;
  const i = Math.floor(rnd() * g.tanks.length);
  return g.tanks[i < g.tanks.length ? i : g.tanks.length - 1] ?? null;
}

export const BOSS_ANNOUNCE_LEAD_MS: number = 10000;

export const BOSS_NAMES: readonly string[] = [
  'Archimedes', 'Akilina', 'Anastasios', 'Athena', 'Alkaios',
  'Amyntas', 'Aniketos', 'Artemis', 'Anaxagoras', 'Apollon',
];

export function bossAnyEligible(groups: readonly BossGroupConfig[]): boolean {
  for (let i = 0; i < groups.length; i++) {
    if (bossGroupEligible(groups[i])) return true;
  }
  return false;
}

export function bossNameAt(x: number, y: number): string {
  const h = Math.floor(Math.abs(x) * 131 + Math.abs(y) * 137);
  const n = BOSS_NAMES.length;
  return BOSS_NAMES[h === h && isFinite(h) ? h % n : 0];
}

export function clampBossGroups(raw: unknown): BossGroupConfig[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: BossGroupConfig[] = [];
  for (let i = 0; i < raw.length && out.length < BOSS_MAX_GROUPS; i++) {
    const g = raw[i] as Partial<BossGroupConfig> | null | undefined;
    if (!g || typeof g !== 'object') continue;

    const name = typeof g.name === 'string' && g.name.trim() !== '' ? g.name : null;
    if (name === null) continue;

    if (!Array.isArray(g.tanks)) continue;
    const tanks: string[] = [];
    const seen = new Set<string>();
    for (let t = 0; t < g.tanks.length && tanks.length < BOSS_MAX_TANKS_PER_GROUP; t++) {
      const n = g.tanks[t];
      if (typeof n === 'string' && n.trim() !== '' && !seen.has(n)) { seen.add(n); tanks.push(n); }
    }
    if (tanks.length === 0) continue;

    const w = typeof g.weight === 'number' && isFinite(g.weight) ? g.weight : 0;
    const one: BossGroupConfig = { name, tanks, weight: Math.max(0, Math.min(BOSS_MAX_WEIGHT, w)) };
    const stats = clampStatShares(g.stats);
    if (stats) one.stats = stats;
    out.push(one);
  }
  return out.length > 0 ? out : undefined;
}
