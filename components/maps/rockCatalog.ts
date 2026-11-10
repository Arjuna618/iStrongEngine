import type { MapConfig } from '../../types';
import { MAZE_TYPE_CUSTOM, DEFAULT_MAP_CONFIG } from '../../types';
import { ROCK_FORMATIONS, type RockFormationWord } from '../../game/rockFormations.generated';
import { isRockFormation } from '../../game/rockFormationWord';
import { ARRAS_ROCK_VARIATION } from '../../game/constants';
import { aspectOfConfig, type MapCard } from './mapCatalog';
import { PUMPKIN_PATCH } from '../../game/MapSystem';

export type RockPattern = NonNullable<MapConfig['rockPattern']>;

const FORMATION_WORDS = Object.keys(ROCK_FORMATIONS) as RockFormationWord[];
export const ROCK_PATTERNS: readonly RockPattern[] = [...FORMATION_WORDS, 'pumpkinPatch', 'tiles', 'random', 'corners', 'edges', 'ring', 'center', 'scattered'];

export const ROCK_PATTERN_NAMES: Record<RockPattern, string> = {
  ...(Object.fromEntries(FORMATION_WORDS.map(w => [w, ROCK_FORMATIONS[w].name])) as Record<RockFormationWord, string>),
  pumpkinPatch: 'Pumpkin Patch',
  tiles: 'Rock Tiles',
  random: 'Random (legacy)', corners: 'Corners (legacy)', edges: 'Edges (legacy)', ring: 'Ring (legacy)', center: 'Center (legacy)', scattered: 'Scattered (legacy)',
};

export function isRockFormationWord(p: RockPattern): p is RockFormationWord { return isRockFormation(p); }
export function rockPatternOf(config: MapConfig): RockPattern {
  return config.rockPattern ?? 'random';
}

export function rocksScattered(config: MapConfig): boolean {
  return config.enableRocks && config.mazeType !== MAZE_TYPE_CUSTOM;
}

export function rockCardPickPatch(config: MapConfig, pattern: RockPattern): Partial<MapConfig> | null {
  const p: Partial<MapConfig> = {};
  if (config.mazeType === MAZE_TYPE_CUSTOM) p.mazeType = DEFAULT_MAP_CONFIG.mazeType;
  if (config.enableMaze) p.enableMaze = false;
  if (!config.enableRocks) p.enableRocks = true;
  if (rockPatternOf(config) !== pattern) {
    p.rockPattern = pattern;
    if (isRockFormationWord(pattern)) {
      p.rockDensity = ROCK_FORMATIONS[pattern].mean;
      p.rockSizeVariation = ARRAS_ROCK_VARIATION;
      p.rockTypes = ['rock', 'stone', 'gravel'];
      p.rockExclusionZone = false;
    }
    if (pattern === 'pumpkinPatch') { p.rockDensity = PUMPKIN_PATCH.count; p.rockSizeVariation = PUMPKIN_PATCH.variation; p.rockTypes = ['rock']; p.rockExclusionZone = false; }
  }
  return Object.keys(p).length > 0 ? p : null;
}

export function rockCardIsUsed(config: MapConfig, pattern: RockPattern): boolean {
  return rocksScattered(config) && !config.enableMaze && rockPatternOf(config) === pattern;
}

export function rockCardConfig(config: MapConfig, pattern: RockPattern): MapConfig {
  const c = { ...config, ...(rockCardPickPatch(config, pattern) ?? {}) };
  delete c.events;
  return c;
}

export function rockPicKey(config: MapConfig, pattern: RockPattern): string {
  const { name: _name, ...rest } = rockCardConfig(config, pattern);
  const s = JSON.stringify(rest);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `rock:${pattern}:${(h >>> 0).toString(36)}:${s.length}`;
}

export function rockCards(config: MapConfig): MapCard[] {
  const aspect = aspectOfConfig(rockCardConfig(config, 'random'));
  return ROCK_PATTERNS.map(p => {
    const name = ROCK_PATTERN_NAMES[p];
    return { key: 'rock:' + p, kind: 'rock', name, aspect, type: -1, item: null, lower: name.toLowerCase(), pattern: p };
  });
}
