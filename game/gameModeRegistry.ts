import { GameModeType, GameModeConfig, DEFAULT_GAME_MODE_CONFIG, isGroupsMode, groupSizeForMode, modeMapDefaults, MAX_ARENA_TANKS, TEAM_MODES, isTeamMode, isPortalMode, modeWearsTeamTwoGreen } from '../types';
import type { ModeMapDefaults } from '../types';
import type { HalloweenLookConfig } from '../types';
import { HALLOWEEN_FULL, HALLOWEEN_PUMPKINS, HALLOWEEN_EYES } from '../utils/halloween';
import { VAMP_STARTING_SCORE } from './vampirism';
import { GAME_MODE_TITLES } from './gameModeTitles';
import { SMALL_FIX } from './smallFixSwitch';
import { ALL_MODES } from './allModesSwitch';
import { MODE_WORLDS, WORLD_IDS, worldIdOf, worldPool, shownModeTitle, type WorldId, type ModeWorld, OD_VARIANTS, odVariantOf, type MapPool, type MapPoolRow } from './modeWorlds';
import { SERVER_DOMINATOR, clampTankDebuffs, type TankDebuffs } from './tankDebuffs';
import { odGrowthRules, growthModeRules } from './growthRules';
import { MODE_BLURBS } from './modeBlurbs';
export { modeMapDefaults };
export type { ModeMapDefaults };

import catSandbox from '../components/ui/media/gamemodes/cat-sandbox.webp';
import catNormal from '../components/ui/media/gamemodes/cat-normal.webp';
import catGrowth from '../components/ui/media/gamemodes/cat-growth.webp';
import catDreadnoughts from '../components/ui/media/gamemodes/cat-dreadnoughts.webp';
import catSiege from '../components/ui/media/gamemodes/cat-siege.png';
export function cardMapKeyOf(key: string): string { return key.replace(/^growth-/, '').replace(/^arms-/, ''); }

export interface GameModeInfo {
  id: GameModeType;
  title: string;
  description: string;
  short: string;
  goal: string;
  image: string | null;
  tags: string[];
  buildConfig: () => Partial<GameModeConfig>;
}

export const GAME_MODES: readonly GameModeInfo[] = [
  {
    id: 'sandbox',
    title: GAME_MODE_TITLES['sandbox'],
    description: 'A sandbox is a blank page, use it to create whatever you like',
    short: 'Your own rules, map and bots',
    goal: 'Set up your own rules in the Game Engine and play from there.',
    image: null,
    tags: ['Game Engine'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'ffa',
    title: GAME_MODE_TITLES['ffa'],
    description: 'Free For All. Everyone fights everyone. No teams, no team bases.',
    short: 'Everyone against everyone, no teams',
    goal: 'Outlevel and outgun everyone: every tank is hostile.',
    image: null,
    tags: ['Solo'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'rock-ffa',
    title: GAME_MODE_TITLES['rock-ffa'],
    description: 'Free For All on a wide arena densely scattered with rocks.',
    short: 'Free For All in a field of rocks',
    goal: 'Survive the crossfire and use the rocks as cover.',
    image: null,
    tags: ['Solo', 'Rocks'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'tdm',
    title: GAME_MODE_TITLES['tdm'],
    description: 'Team Deathmatch. Teams spawn in protected bases. Enemy bullets are destroyed in your base.',
    short: 'Team against team in a maze',
    goal: 'Push out of your base and wipe out the enemy teams.',
    image: null,
    tags: ['Teams', 'Bases', 'Maze'],
    buildConfig: () => ({ enableSpawnZones: true }),
  },
  {
    id: 'open-tdm',
    title: GAME_MODE_TITLES['open-tdm'],
    description: 'Open Team Deathmatch. Teams fight but with no team bases.',
    short: 'Team against team in an open arena',
    goal: 'Team up and control the open arena, no safe bases.',
    image: null,
    tags: ['Teams'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'maze',
    title: GAME_MODE_TITLES['maze'],
    description: 'Free For All with procedural maze walls. Tight corridors and ambush points.',
    short: 'Free For All in a maze of tight corridors',
    goal: 'Hunt through the labyrinth: ambush or be ambushed.',
    image: null,
    tags: ['Solo', 'Maze'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'duos',
    title: GAME_MODE_TITLES['duos'],
    description: 'Free For All in teams of 2. You and a partner against every other duo.',
    short: 'You and a partner against other duos',
    goal: 'Fight beside your partner and outlast every other duo.',
    image: null,
    tags: ['Teams of 2'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'maze-duos',
    title: GAME_MODE_TITLES['maze-duos'],
    description: 'Duos inside procedural maze walls. Tight corridors and shared ambushes.',
    short: 'Duos in a maze of tight corridors',
    goal: 'Stick with your partner and control the corridors together.',
    image: null,
    tags: ['Teams of 2', 'Maze'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'squads',
    title: GAME_MODE_TITLES['squads'],
    description: 'Free For All in teams of 4. Your squad against every other squad.',
    short: 'Squads of 4 against every other squad',
    goal: 'Coordinate with your squad and wipe out the rest.',
    image: null,
    tags: ['Teams of 4'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'maze-squads',
    title: GAME_MODE_TITLES['maze-squads'],
    description: 'Squads inside procedural maze walls. Four tanks, one labyrinth.',
    short: 'Squads in a maze of tight corridors',
    goal: 'Move as a squad and dominate the labyrinth.',
    image: null,
    tags: ['Teams of 4', 'Maze'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'manhunt',
    title: GAME_MODE_TITLES['manhunt'],
    description: 'Free For All where every kill hands you the entire score of your victim. The top player turns green as the Manhunted and can max out every skill.',
    short: 'Free For All where the leader is hunted',
    goal: 'Reach the highest score to become the green Manhunted, then hold the lead.',
    image: null,
    tags: ['Solo', 'Manhunt'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'manhunt-maze',
    title: GAME_MODE_TITLES['manhunt-maze'],
    description: 'Manhunt inside procedural maze walls. Every kill takes the full score of your victim, and the leader turns green.',
    short: 'Manhunt in a maze of tight corridors',
    goal: 'Hunt through the maze, take the top score, and become the green Manhunted.',
    image: null,
    tags: ['Solo', 'Manhunt', 'Maze'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'manhunt-rock',
    title: GAME_MODE_TITLES['manhunt-rock'],
    description: 'Manhunt on a wide arena densely scattered with rocks. Every kill takes the full score of your victim, and the leader turns green.',
    short: 'Manhunt on a wide arena full of rocks',
    goal: 'Use the rocks as cover, take the top score, and become the green Manhunted.',
    image: null,
    tags: ['Solo', 'Manhunt', 'Rocks'],
    buildConfig: () => ({ enableSpawnZones: false }),
  },
  {
    id: 'scripted',
    title: GAME_MODE_TITLES['scripted'],
    description: 'Your own map, your own rules: the Map Events window decides everything. Teams, bots and growth stay as you set them here.',
    short: 'Your own map with your own Map Events',
    goal: 'Whatever your Map Events say.',
    image: null,
    tags: ['Teams', 'Map Events'],
    buildConfig: () => ({ enableSpawnZones: false, teams: 2, playerTeam: 1, teamEnemyConfig: { team1: 10, team2: 0, team3: 0, team4: 0, ffa: 0 } }),
  },
  {
    id: 'portal-2tdm',
    title: GAME_MODE_TITLES['portal-2tdm'],
    description: 'Two teams with guarded bases in one area, a field of rocks in the other, a grey gap between them. Step on the grey tile in the middle of an area to cross to the other one.',
    short: '2 teams, bases, a wormhole to the rocks',
    goal: 'Hold your side, cross through the middle and wipe out the other team.',
    image: null,
    tags: ['Teams', 'Bases', 'Multi-Area', 'Rocks'],
    buildConfig: () => ({ enableSpawnZones: true, teams: 2 }),
  },
  {
    id: 'portal-4tdm',
    title: GAME_MODE_TITLES['portal-4tdm'],
    description: SMALL_FIX.R855 !== 0 && ALL_MODES.ON !== 0
      ? 'Four teams with guarded bases in the corners of one area, a field of rocks below it across a grey gap. Step on the grey tile in the middle of an area to cross to the other one.'
      : 'Four teams with guarded bases in the corners of a rocky area, an open area beside it across a grey gap. Step on the grey tile in the middle of an area to cross to the other one.',
    short: SMALL_FIX.R855 !== 0 && ALL_MODES.ON !== 0 ? '4 teams, bases, a wormhole to the rocks' : '4 teams in rocks, a wormhole to open land',
    goal: SMALL_FIX.R855 !== 0 && ALL_MODES.ON !== 0 ? 'Hold your corner, cross through the middle and outlast the other three teams.' : 'Outlast three other teams among the rocks and in the open area.',
    image: null,
    tags: ['Teams', 'Bases', 'Multi-Area', 'Rocks'],
    buildConfig: () => ({ enableSpawnZones: true, teams: 4 }),
  },
  {
    id: 'portal-maze-4tdm',
    title: GAME_MODE_TITLES['portal-maze-4tdm'],
    description: 'Four teams, each with a base in both areas: a maze on one side, a rock field on the other. A hidden portal in the middle of your base takes you to your base on the other side.',
    short: '4 teams in a maze and a rock field',
    goal: 'Fight through the maze and the rocks and wipe out the other teams.',
    image: null,
    tags: ['Teams', 'Bases', 'Multi-Area', 'Maze'],
    buildConfig: () => ({ enableSpawnZones: true, teams: 4 }),
  },
  {
    id: 'old-dreadnoughts',
    title: GAME_MODE_TITLES['old-dreadnoughts'],
    description: 'A three area mode with a main TDM arena (red vs blue), a maze full of shapes, and a Forge with no PvP for Dreadnought evolution. The Forge portal opens at level 45.',
    short: 'Team war, a shape maze and the Forge',
    goal: 'Reach level 45, enter the Forge and evolve into a Dreadnought.',
    image: null,
    tags: ['Teams', 'Multi-Area', 'Growth'],
    buildConfig: () => ({
      enableSpawnZones: true,
      teams: 2,
      growth: true,
      levelCap: 1000,
      growthMaxMultiplier: 1.7,
      growthPerLevel: 0.7 / 299,
      growthStartLevel: 1,
      growthFixedSpRate: true,
      growthLevelsPerSp: 6,
      growthModel: 'rules' as const,
      growthRules: odGrowthRules(),
      teamEnemyConfig: { team1: 24, team2: 24, team3: 24, team4: 24, ffa: 24 },
    }),
  },
];

export function getGameMode(id: GameModeType): GameModeInfo {
  return GAME_MODES.find(m => m.id === id) ?? GAME_MODES[0];
}

export function resolveModeConfig(id: GameModeType): GameModeConfig {
  const info = getGameMode(id);
  const cfg: GameModeConfig = { ...DEFAULT_GAME_MODE_CONFIG, ...info.buildConfig(), mode: info.id };
  cfg.teamEnemyConfig = { ...cfg.teamEnemyConfig };
  return cfg;
}

export interface GameModeDisplayStats {
  teamsLabel: string;
  playersLabel: string;
}

export function getModeDisplayStats(id: GameModeType): GameModeDisplayStats {
  if (id === 'sandbox') {
    return { teamsLabel: 'Custom', playersLabel: 'Custom' };
  }
  const cfg = resolveModeConfig(id);
  if (isGroupsMode(id)) {
    return { teamsLabel: `Teams of ${groupSizeForMode(id)}`, playersLabel: `${cfg.teamEnemyConfig.ffa} Bots` };
  }
  if (TEAM_MODES.includes(id)) {
    const perTeam = [
      cfg.teamEnemyConfig.team1, cfg.teamEnemyConfig.team2,
      cfg.teamEnemyConfig.team3, cfg.teamEnemyConfig.team4,
    ];
    let bots = 0;
    for (let t = 0; t < cfg.teams; t++) bots += perTeam[t] ?? 0;
    return { teamsLabel: `${cfg.teams} Teams`, playersLabel: `${bots} Bots` };
  }
  return { teamsLabel: 'No Teams', playersLabel: `${cfg.teamEnemyConfig.ffa} Bots` };
}

export type PlayCategoryId = 'sandbox' | 'normal' | 'growth' | 'arms-race' | 'dreadnoughts' | 'siege' | 'others';

export interface PlayCategoryInfo {
  id: PlayCategoryId;
  title: string;
  description: string;
  image: string | null;
  arras?: true;
}

export const PLAY_CATEGORIES: readonly PlayCategoryInfo[] = [
  {
    id: 'sandbox',
    title: 'Sandbox',
    description: 'Make your own rules, map and bots in the Game Engine',
    image: catSandbox,
  },
  {
    id: 'normal', arras: true,
    title: 'Normal',
    description: 'Classic arena modes, level cap 45',
    image: catNormal,
  },
  {
    id: 'growth', arras: true,
    title: 'Growth',
    description: 'Normal modes up to level 1000, and your tank grows',
    image: catGrowth,
  },
  ...(ALL_MODES.ON !== 0 ? [{
    id: 'arms-race' as const, arras: true as const,
    title: 'Arms Race',
    description: 'Every mode on the Arms Race tree, for you and the bots',
    image: catNormal,
  }] : []),
  {
    id: 'dreadnoughts', arras: true,
    title: 'Dreadnoughts',
    description: 'Large maps with areas, built around Dreadnoughts',
    image: catDreadnoughts,
  },
  {
    id: 'siege', arras: true,
    title: 'Siege',
    description: 'Your team holds the Sanctuaries against endless waves of bosses',
    image: catSiege,
  },
  {
    id: 'others' as const, arras: true as const,
    title: 'Others',
    description: 'Event modes: the lights go out, the dead rise',
    image: catNormal,
  },
];

export const PLAY_ALL = { id: 'all' as const, title: 'All', description: 'Every mode of every category, in one place' };
export function isArrasCategory(id: string): boolean { return PLAY_CATEGORIES.some(c => c.id === id && c.arras === true); }
export function inAllCategory(e: { category: string; alsoIn?: string }): boolean { return isArrasCategory(e.category) || (e.alsoIn !== undefined && isArrasCategory(e.alsoIn)); }

export interface PlayModeEntry {
  key: string;
  baseId: GameModeType;
  title: string;
  category: Exclude<PlayCategoryId, 'sandbox'>;
  alsoIn?: Exclude<PlayCategoryId, 'sandbox'>;
  world?: WorldId;
  od?: { teams: number; open: boolean };
  growth: boolean;
  info: GameModeInfo;
  preset?: string;
  armsRace?: boolean;
  sides?: string;
  tankDebuffs?: Readonly<TankDebuffs>;
  overlay?: string;
  pool?: MapPool;
  halloween?: Readonly<HalloweenLookConfig>;
  vampirism?: true;
  startingScore?: number;
}

const VARIANT_BASE_IDS: readonly GameModeType[] = ['ffa', 'rock-ffa', 'tdm', 'open-tdm', 'maze', 'duos', 'maze-duos', 'squads', 'maze-squads', 'manhunt', 'manhunt-maze', 'manhunt-rock',
  'portal-2tdm', 'portal-4tdm', 'portal-maze-4tdm'];

const SIEGE_DEBUFFS: Readonly<TankDebuffs> = { dominators: SERVER_DOMINATOR, sanctuaries: SERVER_DOMINATOR };
const SIEGE_MAP_TEXT: Readonly<Record<string, { title: string; short: string; about: string }>> = {
  citadel: { title: 'Citadel', short: 'Four Sanctuaries inside four walls', about: 'Four Sanctuaries stand in the middle of four long walls, and bosses come in from the corners through the red zones.' },
  fortress: { title: 'Fortress', short: 'Four Sanctuaries inside one square wall', about: 'Four Sanctuaries stand inside a square wall with a gap on each side, and bosses come in through the red zones at the gaps.' },
  blitz: { title: 'Blitz', short: 'Four Sanctuaries in a row, one long front', about: 'Four Sanctuaries stand in a row, and bosses come from the far side of one long red zone.' },
};
function siegeEntries(): PlayModeEntry[] {
  const out: PlayModeEntry[] = [];
  for (const map of Object.keys(SIEGE_MAP_TEXT)) {
    const t = SIEGE_MAP_TEXT[map];
    for (const armsRace of [false, true]) for (const growth of [false, true]) {
      const name = `${growth ? 'Growth ' : ''}${armsRace ? 'Arms Race ' : ''}Siege ${t.title}`;
      const extra = `${growth ? ' Levels go up to 1000 and your tank grows.' : ''}${armsRace ? ' You upgrade along the Arms Race tree.' : ''}`;
      const key = `${growth ? 'growth-' : ''}${armsRace ? 'arms-' : ''}siege-${map}`;
      out.push({
        key,
        baseId: 'scripted', preset: `siege-${map}`, armsRace: armsRace || undefined, sides: 'You vs Bosses',
        tankDebuffs: SIEGE_DEBUFFS,
        title: name, category: 'siege', growth,
        info: {
          ...getGameMode('scripted'),
          title: name,
          short: t.short,
          description: `${t.about} Keep at least one Sanctuary standing: while none stands your team cannot respawn, and after a minute it has lost. Kill a fallen Sanctuary's Dominator to bring it back.${extra}`,
          goal: 'Hold the Sanctuaries against the waves, for as long as you can.',
          tags: ['Teams', 'Waves', 'Bosses', 'Maze', ...(growth ? ['Growth'] : []), ...(armsRace ? ['Arms Race'] : [])],
        },
      });
    }
  }
  return out;
}

function worldEntry(id: WorldId, growth: boolean, armsRace: boolean): PlayModeEntry {
  const w: ModeWorld = MODE_WORLDS[id];
  const title = `${growth ? 'Growth ' : ''}${armsRace ? 'Arms Race ' : ''}${w.title}`;
  const extra = `${growth ? ' Levels go up to 1000 and your tank grows.' : ''}${armsRace ? ' You and the bots upgrade along the Arms Race tree.' : ''}`;
  const key = `${growth ? 'growth-' : ''}${armsRace ? 'arms-' : ''}${id}`;
  return {
    key,
    baseId: w.mode, world: id, title, growth, armsRace: armsRace || undefined,
    category: armsRace ? 'arms-race' : growth ? 'growth' : 'normal',
    alsoIn: w.oneCard ? w.oneCard.alsoIn : armsRace && growth ? 'growth' : undefined,
    ...(w.overlay ? { overlay: w.overlay } : {}),
    ...(w.weakObjectives ? { tankDebuffs: SIEGE_DEBUFFS } : {}),
    info: {
      ...getGameMode(w.mode), title, short: w.short, description: w.about + extra, goal: w.goal,
      tags: [...w.tags, ...(growth ? ['Growth'] : []), ...(armsRace ? ['Arms Race'] : [])],
    },
  };
}
interface EventCard { overlay?: string; world: WorldId; title: string; short: string; about: string; goal: string; tags: readonly string[]; versions: readonly (readonly [boolean, boolean])[]; pool?: readonly Omit<MapPoolRow, 'id'>[]; halloween?: true | Readonly<HalloweenLookConfig>;
  vampirism?: true }
const ALL_VERSIONS: readonly (readonly [boolean, boolean])[] = [[false, false], [false, true], [true, false], [true, true]];
const OUTBREAK_ABOUT = ' Every tank that dies, yours too, rises where it fell as a zombie: grey for a moment, then green, charging at the living. Only a Necromancer turns a zombie it kills onto its own side, and they follow it. Killing a zombie pays; killing the living pays nothing.';
const PLAIN_MAZE = 21, LOOSE_MAZE = 24;
const SOCCER_ABOUT = 'Blue against Green on a walled field, a base dug into each end. Shoot, push or ram the ball into the other team\'s base: each time it gets in, a new ball comes in the middle. The first team to 10 goals wins. Ramming the ball hurts.';
const MAGIC_ABOUT = 'Free For All in a maze of special walls. The side walls slide two cells to a free spot now and then, so the paths keep changing. Some walls hurt, some hold you, some throw you, some let you through one way, an eye wall lets you see farther and a pink wall makes you bigger. Rare relics appear inside.';
const VAMP_ABOUT = 'Free For All in a wide maze with empty rooms. Your score is your health: while you have more than you started with, a hit takes your score instead of your health, and the tank that hit you gets half of it. Once you are back at your starting score, only your health is left.';
const VAMP_DARK = ' And the lights are out: you see only your own light, round your tank, toward your aim and from your barrels.';
const EVENT_CARDS: readonly EventCard[] = [
  { overlay: 'blackout', world: 'ffa', title: 'Blackout FFA', short: 'Free For All with the lights out',
    about: 'Free For All in the dark. You see only your own light: round your tank, toward your aim and from your barrels, and walls block it. The bots, their turrets and their drones see the same way.',
    goal: 'Hunt by your own light and keep out of theirs.', tags: ['Solo', 'Rocks', 'Darkness'], versions: [[false, false]], halloween: true },
  { overlay: 'blackout', world: 'maze', title: 'Blackout Maze FFA', short: 'A dark maze, every tank for itself',
    about: 'Free For All in a maze with the lights out. You see only your own light: round your tank, toward your aim and from your barrels, and walls block it. The bots, their turrets and their drones see the same way.',
    goal: 'Feel your way through the maze and strike first.', tags: ['Solo', 'Maze', 'Darkness'], versions: [[false, false]] },
  { overlay: 'outbreak', world: 'squads', title: 'Outbreak Squads', short: 'Squads of four while the dead rise',
    about: 'Squads of four in an arena with rocks.' + OUTBREAK_ABOUT, goal: 'Keep your squad alive and thin the horde.', tags: ['Teams of 4', 'Rocks', 'Zombies'], versions: ALL_VERSIONS, halloween: true },
  { overlay: 'outbreak', world: 'maze', title: 'Outbreak Maze FFA', short: 'A maze where the dead rise, every tank for itself',
    about: 'Free For All in a loose maze.' + OUTBREAK_ABOUT, goal: 'Outrun the horde and outlast everyone.', tags: ['Solo', 'Maze', 'Zombies'], versions: ALL_VERSIONS,
    pool: [{ kind: 'maze', maze: LOOSE_MAZE, name: 'Loose Maze', share: 100 }] },
  { overlay: 'outbreak', world: 'maze-squads', title: 'Outbreak Maze Squads', short: 'Squads of four in a maze where the dead rise',
    about: 'Squads of four in a maze, plain or loose.' + OUTBREAK_ABOUT, goal: 'Hold together in the corridors and thin the horde.', tags: ['Teams of 4', 'Maze', 'Zombies'], versions: ALL_VERSIONS,
    pool: [{ kind: 'maze', maze: PLAIN_MAZE, name: 'Plain Maze', share: 50 }, { kind: 'maze', maze: LOOSE_MAZE, name: 'Loose Maze', share: 50 }] },
  { world: 'vampirism', title: 'Vampirism', short: 'Your score is your health: guard it', about: VAMP_ABOUT,
    goal: 'Drain the others and guard your score.', tags: ['Solo', 'Maze', 'Vampirism'], versions: ALL_VERSIONS, halloween: HALLOWEEN_EYES, vampirism: true },
  { overlay: 'blackout', world: 'vampirism', title: 'Blackout Vampirism', short: 'Vampirism with the lights out', about: VAMP_ABOUT + VAMP_DARK,
    goal: 'Strike from the dark and guard your score.', tags: ['Solo', 'Maze', 'Darkness', 'Vampirism'], versions: ALL_VERSIONS, halloween: HALLOWEEN_EYES, vampirism: true },
  { overlay: 'soccer', world: 'soccer', title: 'Soccer', short: 'Blue against Green: push the ball into their base', about: SOCCER_ABOUT,
    goal: 'Score 10 goals before the other team.', tags: ['Teams', 'Bases', 'Ball'], versions: ALL_VERSIONS },
  { overlay: 'magic-maze', world: 'magic-maze', title: 'Magic Maze', short: 'Free For All in a maze whose walls move', about: MAGIC_ABOUT,
    goal: 'Find your way, use the walls and outlast everyone.', tags: ['Solo', 'Maze', 'Magic Maze'], versions: ALL_VERSIONS },
];
function eventEntry(c: EventCard, growth: boolean, armsRace: boolean): PlayModeEntry {
  const base = worldEntry(c.world, growth, armsRace);
  const title = `${growth ? 'Growth ' : ''}${armsRace ? 'Arms Race ' : ''}${c.title}`;
  const extra = `${growth ? ' Levels go up to 1000 and your tank grows.' : ''}${armsRace ? ' You and the bots upgrade along the Arms Race tree.' : ''}`;
  const key = `${growth ? 'growth-' : ''}${armsRace ? 'arms-' : ''}${c.overlay && c.overlay !== c.world ? c.overlay + '-' : ''}${c.world}`;
  return {
    ...base, key, overlay: c.overlay, title, category: 'others', alsoIn: undefined,
    pool: c.pool ? { on: true, rows: c.pool.map((r, i) => ({ ...r, id: i + 1 })) } : undefined,
    halloween: c.halloween === true ? HALLOWEEN_FULL : c.halloween,
    vampirism: c.vampirism, startingScore: c.vampirism ? VAMP_STARTING_SCORE : undefined,
    info: { ...base.info, title, short: c.short, description: c.about + extra, goal: c.goal, tags: [...c.tags, ...(growth ? ['Growth'] : []), ...(armsRace ? ['Arms Race'] : [])] },
  };
}
const EVENT_ENTRIES: readonly PlayModeEntry[] = ALL_MODES.ON === 0 ? [] : EVENT_CARDS.flatMap(c => c.versions.map(([g, a]) => eventEntry(c, g, a)));
function halloweenEntry(): PlayModeEntry {
  const base = getGameMode('maze');
  const title = 'Halloween';
  return {
    key: 'halloween', baseId: 'maze', preset: 'halloween', sides: 'Free For All', title, category: 'others', growth: false,
    tankDebuffs: { dominators: SERVER_DOMINATOR },
    halloween: HALLOWEEN_PUMPKINS,
    info: {
      ...base, title,
      short: 'The Haunted Asylum: generators, doors, a pumpkin patch',
      description: 'Free For All in the Haunted Asylum. Two generators light its two halves: shoot one to turn it off or on, and it moves to another room of its side. Shoot a green button to open its door for a while. Stay too long in the pumpkin patch and its curse turns you orange: invisible for good, but one touch kills you. And everyone who dies rises as a zombie.',
      goal: 'Survive the asylum, the dark and the dead.',
      tags: ['Solo', 'Maze', 'Darkness', 'Zombies', 'Halloween'],
    },
  } as PlayModeEntry;
}
const HALLOWEEN_ENTRIES: readonly PlayModeEntry[] = ALL_MODES.ON === 0 ? [] : [halloweenEntry()];

const CARD_WORLD_IDS: readonly WorldId[] = WORLD_IDS.filter(id => !MODE_WORLDS[id].eventOnly && !MODE_WORLDS[id].noCard);
const VERSION_WORLD_IDS: readonly WorldId[] = CARD_WORLD_IDS.filter(id => !MODE_WORLDS[id].oneCard);
const WORLD_ENTRIES: readonly PlayModeEntry[] = ALL_MODES.ON === 0 ? [] : [
  ...CARD_WORLD_IDS.map(id => worldEntry(id, false, false)),
  ...VERSION_WORLD_IDS.map(id => worldEntry(id, true, false)),
  ...VERSION_WORLD_IDS.map(id => worldEntry(id, false, true)),
  ...VERSION_WORLD_IDS.map(id => worldEntry(id, true, true)),
];
export function worldPlayEntry(id: WorldId, growth = false, armsRace = false): PlayModeEntry { return worldEntry(id, growth, armsRace); }

function withBlurb(e: PlayModeEntry): PlayModeEntry {
  const b = MODE_BLURBS[cardMapKeyOf(e.key)];
  return b === undefined ? e : { ...e, info: { ...e.info, description: b } };
}

export const PLAY_MODE_ENTRIES: readonly PlayModeEntry[] = ALL_MODES.ON !== 0 ? [
  ...WORLD_ENTRIES,
  ...OD_VARIANTS.map((v): PlayModeEntry => ({
    key: v.key,
    baseId: 'old-dreadnoughts',
    title: v.title,
    category: 'dreadnoughts',
    growth: false,
    od: { teams: v.teams, open: v.open },
    info: { ...getGameMode('old-dreadnoughts'), title: v.title, short: v.short, description: v.about },
  })),
  ...siegeEntries(),
  ...EVENT_ENTRIES,
  ...HALLOWEEN_ENTRIES,
].map(withBlurb) : [
  ...VARIANT_BASE_IDS.map((id): PlayModeEntry => ({
    key: id,
    baseId: id,
    title: getGameMode(id).title,
    category: 'normal',
    growth: false,
    info: getGameMode(id),
  })),
  ...VARIANT_BASE_IDS.map((id): PlayModeEntry => ({
    key: `growth-${id}`,
    baseId: id,
    title: `Growth ${getGameMode(id).title}`,
    category: 'growth',
    growth: true,
    info: getGameMode(id),
  })),
  {
    key: 'old-dreadnoughts',
    baseId: 'old-dreadnoughts',
    title: getGameMode('old-dreadnoughts').title,
    category: 'dreadnoughts',
    growth: false,
    info: getGameMode('old-dreadnoughts'),
  },
  ...siegeEntries(),
];

export const PLAY_MENU_IMAGE_URLS: readonly string[] = Array.from(new Set(PLAY_CATEGORIES.map(c => c.image).filter((u): u is string => u !== null)));

const OLD_KEYS: Readonly<Record<string, string>> = ALL_MODES.ON === 0 ? {} : {
  'tdm': 'maze-2tdm', 'growth-tdm': 'growth-maze-2tdm', 'open-tdm': 'open-2tdm', 'growth-open-tdm': 'growth-open-2tdm',
};
export function getPlayEntry(key: string): PlayModeEntry | null {
  const k = Object.prototype.hasOwnProperty.call(OLD_KEYS, key) ? OLD_KEYS[key] : key;
  return PLAY_MODE_ENTRIES.find(e => e.key === k) ?? null;
}
export function entryDisplayStats(key: string, id: GameModeType): GameModeDisplayStats {
  const e = getPlayEntry(key);
  if (e && (e.od || (e.world && MODE_WORLDS[e.world].teams !== undefined))) {
    const cfg = resolvePlayConfig(e); const t = cfg.teams;
    const per = [cfg.teamEnemyConfig.team1, cfg.teamEnemyConfig.team2, cfg.teamEnemyConfig.team3, cfg.teamEnemyConfig.team4];
    let bots = 0; for (let i = 0; i < t; i++) bots += per[i] ?? 0;
    return { teamsLabel: `${t} Teams`, playersLabel: `${bots} Bots` };
  }
  return getModeDisplayStats(id);
}
export function entryInCategory(e: { category: string; alsoIn?: string }, c: string): boolean {
  return e.category === c || e.alsoIn === c;
}
export function entryTeamCountFixed(e: PlayModeEntry): boolean {
  return !!e.od || (!!e.world && MODE_WORLDS[e.world].teams !== undefined);
}
export function entryBotsFixed(e: PlayModeEntry): boolean { return !!e.world && MODE_WORLDS[e.world].fixedBots === true; }
export function entryTeams(e: PlayModeEntry): number {
  return e.od?.teams ?? (e.world ? MODE_WORLDS[e.world].teams : undefined) ?? resolveModeConfig(e.baseId).teams;
}

export const SCRIPTED_ROOM = 150;

export interface PlayModeSettingSpec {
  kind: 'botCount' | 'perTeam';
  label: string;
  min: number;
  max: number;
  defaultValue: number;
}

const PER_TEAM_BASE_IDS: readonly GameModeType[] = ['tdm', 'open-tdm', 'old-dreadnoughts', 'portal-2tdm', 'portal-4tdm', 'portal-maze-4tdm'];

export function isTeamModeId(id: GameModeType): boolean {
  return isTeamMode(id);
}

export function supportsTeamCountChoice(id: GameModeType): boolean {
  return isTeamModeId(id) && id !== 'old-dreadnoughts' && !isPortalMode(id);
}

export function teamCountForMode(id: GameModeType): number {
  return resolveModeConfig(id).teams;
}

export function getPlaySettingSpec(entry: PlayModeEntry, teams?: number): PlayModeSettingSpec {
  const preset = resolveModeConfig(entry.baseId);
  if (entry.world && MODE_WORLDS[entry.world].teams !== undefined) teams = MODE_WORLDS[entry.world].teams;
  if (entry.od) teams = entry.od.teams;
  if (entry.preset && isTeamModeId(entry.baseId)) return { kind: 'botCount', label: 'Bots', min: 0, max: Math.min(60, MAX_ARENA_TANKS), defaultValue: Math.min(preset.teamEnemyConfig.team1, MAX_ARENA_TANKS) };
  if (PER_TEAM_BASE_IDS.includes(entry.baseId)) {
    const t = Math.max(1, Math.round(Number(teams ?? preset.teams)) || preset.teams);
    const max = Math.max(1, Math.min(30, Math.floor(MAX_ARENA_TANKS / t)));
    return {
      kind: 'perTeam', label: 'Bots per Team', min: 0, max,
      defaultValue: Math.min(preset.teamEnemyConfig.team1, max),
    };
  }
  const ffaMax = Math.min(60, MAX_ARENA_TANKS);
  return {
    kind: 'botCount', label: 'Bots', min: 0, max: ffaMax,
    defaultValue: Math.min(preset.teamEnemyConfig.ffa, ffaMax),
  };
}

export function modeUsesMaze(mode: GameModeType, teams?: number, world?: string): boolean {
  const id = worldIdOf(mode, teams, world);
  if (id !== null && MODE_WORLDS[id].mode !== 'manhunt-rock' && !isPortalMode(mode)) return MODE_WORLDS[id].maze !== undefined;
  return mode === 'maze' || mode === 'maze-duos' || mode === 'maze-squads'
    || mode === 'manhunt-maze' || mode === 'tdm';
}

export interface PlayTeamChoice {
  teams?: number;
  playerTeam?: number;
}

export function cardWearsTeamTwoGreen(entry: PlayModeEntry, teams?: number): boolean {
  return modeWearsTeamTwoGreen(resolvePlayConfig(entry, undefined, teams !== undefined ? { teams } : undefined));
}

export function resolvePlayConfig(entry: PlayModeEntry, settingValue?: number, teamChoice?: PlayTeamChoice): GameModeConfig {
  const cfg = resolveModeConfig(entry.baseId);
  if (entry.preset) { cfg.preset = entry.preset; cfg.armsRace = entry.armsRace; cfg.maxTanksAlive = SCRIPTED_ROOM; }
  if (entry.tankDebuffs) cfg.tankDebuffs = clampTankDebuffs(entry.tankDebuffs);
  if (entry.halloween) cfg.halloween = { eyes: entry.halloween.eyes, pumpkins: entry.halloween.pumpkins };
  if (entry.vampirism) { cfg.vampirism = true; if (entry.startingScore !== undefined) cfg.startingScore = entry.startingScore; }
  if (entry.overlay) cfg.overlay = entry.overlay;
  if (entry.od) { cfg.teams = entry.od.teams; cfg.enableSpawnZones = !entry.od.open; }
  if (entry.world) {
    cfg.world = entry.world;
    if (entry.armsRace) cfg.armsRace = true;
    const _wt = MODE_WORLDS[entry.world].teams;
    if (_wt !== undefined) cfg.teams = _wt;
    const _pool = entry.pool ?? worldPool(entry.world);
    if (_pool) cfg.mapPool = _pool;
  }
  if (entry.growth) {
    cfg.growth = true;
    cfg.levelCap = 1000;
    cfg.growthMaxMultiplier = 5;
    cfg.growthPerLevel = 0.05;
    cfg.growthStartLevel = 1;
    cfg.growthFixedSpRate = false;
    cfg.growthModel = 'rules';
    cfg.growthRules = growthModeRules();
  }
  cfg.smartGrowthCap = cfg.growth && cfg.mode !== 'old-dreadnoughts'
    && (modeUsesMaze(cfg.mode, cfg.teams, cfg.world) || (SMALL_FIX.CC040 !== 0 && cfg.mode === 'portal-maze-4tdm'));

  if (teamChoice && isTeamModeId(cfg.mode) && !entry.preset) {
    if (teamChoice.teams !== undefined && supportsTeamCountChoice(cfg.mode) && !entryTeamCountFixed(entry)) {
      const t = Math.round(Number(teamChoice.teams));
      if (Number.isFinite(t) && t >= 2 && t <= 4) cfg.teams = t;
    }
    if (teamChoice.playerTeam !== undefined) {
      const p = Math.round(Number(teamChoice.playerTeam));
      if (Number.isFinite(p) && p >= 1 && p <= cfg.teams) cfg.playerTeam = p;
    }
  }
  if (settingValue !== undefined && !entryBotsFixed(entry)) {
    const spec = getPlaySettingSpec(entry, cfg.teams);
    const raw = Number(settingValue);
    const v = Number.isFinite(raw)
      ? Math.max(spec.min, Math.min(spec.max, Math.round(raw)))
      : spec.defaultValue;
    if (spec.kind === 'perTeam') {
      cfg.teamEnemyConfig.team1 = v;
      cfg.teamEnemyConfig.team2 = v;
      cfg.teamEnemyConfig.team3 = v;
      cfg.teamEnemyConfig.team4 = v;
    } else if (entry.preset && isTeamModeId(cfg.mode)) {
      cfg.teamEnemyConfig.team1 = v;
    } else {
      cfg.teamEnemyConfig.ffa = v;
    }
  }
  return cfg;
}

export const MODE_OPTIONS: Record<string, string> = Object.fromEntries(
  GAME_MODES.map(m => [m.id, m.title])
);

export const MODE_DESCRIPTIONS: Record<GameModeType, string> = Object.fromEntries(
  GAME_MODES.map(m => [m.id, m.description])
) as Record<GameModeType, string>;

export function entryMapDefaults(entry: PlayModeEntry): ModeMapDefaults | null {
  return modeMapDefaults(entry.baseId, entry.growth, entry.world);
}

export interface EngineModeOption {
  key: string;
  label: string;
}

export interface EngineModeGroup {
  label: string;
  options: EngineModeOption[];
}

const ENGINE_GROUP_TITLES: Record<PlayCategoryId, string> = {
  sandbox: 'Sandbox',
  normal: 'Normal',
  growth: 'Growth',
  'arms-race': 'Arms Race',
  dreadnoughts: 'Dreadnoughts',
  siege: 'Siege',
  others: 'Others',
};

export const ENGINE_MODE_GROUPS: readonly EngineModeGroup[] = (() => {
  const out: EngineModeGroup[] = [
    { label: ENGINE_GROUP_TITLES.sandbox, options: [{ key: 'sandbox', label: getGameMode('sandbox').title }, { key: 'scripted', label: getGameMode('scripted').title }] },
  ];
  for (const cat of PLAY_CATEGORIES) {
    if (cat.id === 'sandbox') continue;
    const options = PLAY_MODE_ENTRIES
      .filter(e => e.category === cat.id)
      .map((e): EngineModeOption => ({ key: e.key, label: shownModeTitle(e.title) }));
    if (options.length) out.push({ label: ENGINE_GROUP_TITLES[cat.id], options });
  }
  return out;
})();

export function engineModeKey(mode: GameModeType, growth: boolean, preset?: string, armsRace?: boolean, world?: string, teams?: number, spawnZones?: boolean, overlay?: string): string {
  if (preset) return `${growth ? 'growth-' : ''}${armsRace ? 'arms-' : ''}${preset}`;
  if (ALL_MODES.ON !== 0 && mode === 'old-dreadnoughts') return odVariantOf(teams ?? 2, spawnZones === false)?.key ?? mode;
  const _w = worldIdOf(mode, teams, world);
  if (_w !== null) return `${growth ? 'growth-' : ''}${armsRace ? 'arms-' : ''}${overlay && overlay !== _w && overlay !== MODE_WORLDS[_w].overlay ? overlay + '-' : ''}${_w}`;
  if (growth && VARIANT_BASE_IDS.includes(mode)) return `growth-${mode}`;
  return mode;
}

export function isCurrentEngineModeKey(cfg: Pick<GameModeConfig, 'mode' | 'growth' | 'preset' | 'armsRace' | 'world' | 'teams'> & { enableSpawnZones?: boolean; overlay?: string }, key: string): boolean {
  return engineModeKey(cfg.mode, cfg.growth, cfg.preset, cfg.armsRace, cfg.world, cfg.teams, cfg.enableSpawnZones, cfg.overlay) === key;
}

export function resolveEngineModeConfig(key: string): GameModeConfig {
  const entry = getPlayEntry(key);
  if (entry) return resolvePlayConfig(entry);
  return resolveModeConfig(key as GameModeType);
}

export function engineModeIdForKey(key: string): GameModeType {
  return getPlayEntry(key)?.baseId ?? (key as GameModeType);
}

export function engineModeLabel(key: string): string {
  const entry = getPlayEntry(key);
  if (entry) return shownModeTitle(entry.title);
  return MODE_OPTIONS[key] ?? key;
}

export function engineModeDescription(key: string): string {
  const entry = getPlayEntry(key);
  return entry?.preset || entry?.world ? entry.info.description : getGameMode(engineModeIdForKey(key)).description;
}
