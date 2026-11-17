export type SpawnKind = 'tank' | 'wall' | 'rock' | 'body' | 'prop' | 'shape';

const WALL_TYPE_OF: Readonly<Record<string, number>> = Object.freeze({
  'other:wall': 0, 'other:wall-dark': 0, 'other:deadly-wall': 1, 'other:healing-wall': 2, 'other:bouncy-wall': 3, 'other:breaker-wall': 4,
  'other:chunks-wall': 5, 'other:optical-wall': 6, 'other:one-way-wall-up': 7, 'other:one-way-wall-down': 8, 'other:one-way-wall-left': 9,
  'other:one-way-wall-right': 10, 'other:sticky-wall': 11, 'other:trick-wall': 12, 'other:paint-wall': 13, 'other:filter-wall': 14,
  'other:team-wall': 15, 'other:base-wall': 16, 'other:portal-wall': 17, 'other:checkpoint-wall': 18,
});
const BODY_IDS: ReadonlySet<string> = new Set(['other:ball', 'other:flag', 'other:mysterious-egg', 'other:mysterious-egg-six-sides']);
export const PUMPKIN_OTHER_ID = 'other:pumpkin';

export function wallTypeOf(otherId: string): number {
  return Object.prototype.hasOwnProperty.call(WALL_TYPE_OF, otherId) ? WALL_TYPE_OF[otherId] : -1;
}
export function otherKindOf(otherId: string): SpawnKind {
  if (wallTypeOf(otherId) >= 0) return 'wall';
  if (otherId === PUMPKIN_OTHER_ID) return 'rock';
  if (BODY_IDS.has(otherId)) return 'body';
  return 'prop';
}

export const SPAWN_DIST_MIN = 0, SPAWN_DIST_MAX = 3000, SPAWN_DIST_START = 300;
export const SPAWN_COUNT_TANK = 20, SPAWN_COUNT_LAYERED = 6, SPAWN_COUNT_BOSS = 3;
export const SPAWN_WALL_CELLS_MAX = 10;
export const SPAWN_DOUBLE_MS = 400, SPAWN_DOUBLE_PX = 24;
export const SPAWN_TURN_STEP = Math.PI / 12;
export const SPAWN_GHOST_ALPHA = 0.6;

export function spawnCountCap(isBoss: boolean, layerCount: number): number {
  if (isBoss) return SPAWN_COUNT_BOSS;
  if (layerCount > 0) return SPAWN_COUNT_LAYERED;
  return SPAWN_COUNT_TANK;
}

export function defaultSpawnTeam(collection: string, group: string, name: string, teams: readonly (readonly [string, number])[], playerTeam: string): string {
  const has = (t: string) => teams.some(x => x[0] === t);
  const rogue = group === 'Rogues' || /^rogue\b/i.test(name.trim());
  if (rogue && has('Rogues')) return 'Rogues';
  const bossy = collection === 'bosses' || collection === 'celestials' || collection === 'sentries' || collection === 'sentinels';
  if (bossy && has('Bosses')) return 'Bosses';
  if (has(playerTeam)) return playerTeam;
  return teams.length > 0 ? teams[0][0] : 'FFA';
}

export interface SpawnTankChoices {
  team: string;
  aiOn: boolean;
  respawn: boolean;
  count: number;
  dist: number;
  level: number;
  xp: number;
  skillPoints: number;
  upgrades: Record<string, number>;
}
export interface SpawnThingChoices {
  dist: number;
  cells: number;
  team: string;
}

export interface HoldView { on: boolean; kind: SpawnKind; name: string; turns: boolean }
let _hold: HoldView = { on: false, kind: 'tank', name: '', turns: false };
const _subs = new Set<() => void>();
export const spawnHoldStore = {
  get: (): HoldView => _hold,
  subscribe: (fn: () => void): (() => void) => { _subs.add(fn); return () => { _subs.delete(fn); }; },
  set(v: HoldView): void {
    if (v.on === _hold.on && v.kind === _hold.kind && v.name === _hold.name && v.turns === _hold.turns) return;
    _hold = v;
    for (const fn of _subs) fn();
  },
};
