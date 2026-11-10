import type { GameModeType, MapConfig } from '../types';
import type { RockFormationWord } from './rockFormations.generated';
import { ROCK_FORMATIONS } from './rockFormations.generated';
import { ALL_MODES } from './allModesSwitch';
import { SMALL_FIX } from './smallFixSwitch';
import { ARRAS_ROCK_VARIATION } from './constants';
import { MISSING_MODES } from './missingModesSwitch';

export type BaseLayout = 'strips' | 'corner-tile' | 'corner-room' | 'strips-10' | 'corner-tile-10' | 'goal-mouths'
  | `drawn:${string}`;

const _OD_REST = ' A maze full of shapes and a Forge with no fights hang off the main arena. The Forge portal opens at level 45; once you enter it you are a Dreadnought, on the Dreadnoughts team, against every other team.';
export const OD_VARIANTS: readonly { key: string; title: string; teams: number; open: boolean; short: string; about: string }[] = [
  { key: 'old-dreadnoughts', title: 'Old Dreadnoughts 2TDM', teams: 2, open: false, short: 'Two teams, a shape maze and the Forge', about: 'Two teams with a base down each side of the main arena.' + _OD_REST },
  { key: 'old-dreadnoughts-4tdm', title: 'Old Dreadnoughts 4TDM', teams: 4, open: false, short: 'Four teams, a shape maze and the Forge', about: 'Four teams with a base in each corner of the main arena.' + _OD_REST },
  { key: 'old-dreadnoughts-open-3tdm', title: 'Old Dreadnoughts Open 3TDM', teams: 3, open: true, short: 'Three teams and no bases', about: 'Three teams and no bases in the main arena.' + _OD_REST },
  { key: 'old-dreadnoughts-open-4tdm', title: 'Old Dreadnoughts Open 4TDM', teams: 4, open: true, short: 'Four teams and no bases', about: 'Four teams and no bases in the main arena.' + _OD_REST },
];
export function odVariantOf(teams: number | undefined, open: boolean): (typeof OD_VARIANTS)[number] | null {
  for (let i = 0; i < OD_VARIANTS.length; i++) if (OD_VARIANTS[i].teams === teams && OD_VARIANTS[i].open === open) return OD_VARIANTS[i];
  return null;
}

export interface MapPoolRow {
  id: number;
  kind: 'maze' | 'rock' | 'file';
  maze?: number;
  rock?: string;
  file?: string;
  name: string;
  share: number;
}
export interface MapPool { on: boolean; rows: MapPoolRow[] }

export interface ModeWorld {
  mode: GameModeType;
  title: string;
  short: string;
  about: string;
  goal: string;
  tags: readonly string[];
  gridCells: number;
  mapScale: number;
  maze?: number;
  rocks?: RockFormationWord;
  rocksGrowth?: RockFormationWord;
  bases?: BaseLayout;
  teams?: number;
  guards?: { count: number; arrangement?: 'corners'; tileCells?: number };
  pool?: readonly Omit<MapPoolRow, 'id'>[];
  teamTwins?: Partial<Record<2 | 3 | 4, WorldId>>;
  eventOnly?: true;
  bosses?: false;
  overlay?: string;
  drawing?: string;
  oneCard?: { alsoIn: 'dreadnoughts' };
  noCard?: true;
  weakObjectives?: true;
  fixedBots?: true;
}

export type WorldId = 'ffa' | 'rock-ffa' | 'maze' | 'duos' | 'squads' | 'maze-duos' | 'maze-squads'
  | '2tdm' | '4tdm' | 'maze-2tdm' | 'maze-4tdm'
  | 'open-2tdm' | 'open-3tdm' | 'open-4tdm' | 'open-maze-2tdm' | 'open-maze-3tdm' | 'open-maze-4tdm'
  | 'manhunt' | 'manhunt-maze' | 'manhunt-rock' | 'portal-2tdm' | 'portal-4tdm' | 'portal-maze-4tdm' | 'vampirism' | 'soccer' | 'magic-maze'
  | '2-domination' | '4-domination' | 'open-2-domination' | 'open-3-domination' | 'maze-2-domination' | 'open-maze-3-domination' | 'open-maze-4-domination'
  | 'mothership' | '4-mothership' | 'maze-mothership' | 'portal-mothership'
  | 'open-3-tag' | 'open-4-tag' | 'open-maze-3-tag' | 'open-maze-4-tag'
  | 'clan-wars' | 'maze-clan-wars'
  | 'assault-bunker' | 'assault-trenches' | 'assault-line' | 'assault-branches' | 'assault-eye' | 'assault-yinyang' | 'assault-bastion' | 'assault-stronghold' | 'assault-acropolis' | 'assault-booster'
  | 'capture-the-flag' | 'labyrinth' | 'nexus' | 'forge';

const P = { maze: 21, team2: 22, team4: 23, loose: 24, vampirism: 28, soccer: 29, magic: 30 } as const;

function MISSING_WORLDS(): Partial<Record<WorldId, ModeWorld>> {
  const DOM_ABOUT = 'Dominators stand on the yellow tiles. Kill a neutral one and it joins your team; kill a taken one and it turns neutral again.';
  const ASSAULT_ABOUT = 'Blue attacks, Green defends. Blue must destroy every Green Sanctuary; Green wins by holding more than half of its Sanctuaries and Dominators until the clock runs out. Green\'s Sanctuaries are locked while Blue holds less than half of the Dominators.';
  const TAG_ABOUT = 'A tank killed by an enemy comes back on its killer\'s team. The last team left wins.';
  const SHIP = 'Each team has a Flagship, a huge slow mothership of drones. A team whose Flagship dies can no longer win.';
  const dom = (o: Partial<ModeWorld>): ModeWorld => ({ mode: 'tdm', title: '', short: '', about: DOM_ABOUT, goal: 'Take the Dominators and hold them for your team.', tags: ['Teams', 'Dominators'], gridCells: 34, mapScale: 6.4, overlay: 'domination', drawing: 'domination', weakObjectives: true, ...o } as ModeWorld);
  const assault = (key: WorldId, title: string, maze: number, gridCells: number, mapScale: number, guards: number, tiles = 2): ModeWorld => ({
    mode: 'tdm', title: `Assault ${title}`,
    short: `Blue attacks Green's Sanctuaries: ${title}`, about: ASSAULT_ABOUT, goal: 'Blue: destroy every Sanctuary. Green: hold them until the clock runs out.',
    tags: ['Teams', 'Bases', 'Maze', 'Sanctuaries'], gridCells, mapScale, maze, bases: `drawn:${key}`, teams: 2, guards: guards > 0 ? { count: guards, tileCells: tiles } : { count: 0 },
    overlay: 'assault', drawing: key, weakObjectives: true });
  const tag = (o: Partial<ModeWorld>): ModeWorld => ({ mode: 'open-tdm', title: '', short: '', about: TAG_ABOUT, goal: 'Turn every tank to your team.', tags: ['Teams', 'Tag'], gridCells: 36, mapScale: 6, overlay: 'tag', ...o } as ModeWorld);
  return {
    '2-domination': dom({ title: '2 Team Domination', short: 'Two teams fight over five Dominators', bases: 'drawn:domination', teams: 2, guards: { count: 1, tileCells: 2 }, teamTwins: { 4: '4-domination' } }),
    '4-domination': dom({ title: '4 Team Domination', short: 'Four teams fight over five Dominators', bases: 'drawn:domination', teams: 4, guards: { count: 1, tileCells: 2 }, teamTwins: { 2: '2-domination' } }),
    'open-2-domination': dom({ mode: 'open-tdm', title: 'Open 2 Team Domination', short: 'Two teams and four Dominators, no bases', gridCells: 24, mapScale: 8.5, teams: 2, drawing: 'domination-open2', teamTwins: { 3: 'open-3-domination' } }),
    'open-3-domination': dom({ mode: 'open-tdm', title: 'Open 3 Team Domination', short: 'Three teams and five Dominators, no bases', teams: 3, teamTwins: { 2: 'open-2-domination' } }),
    'maze-2-domination': dom({ title: 'Maze 2 Team Domination', short: 'Two teams fight over Dominators in a maze', tags: ['Teams', 'Bases', 'Maze', 'Dominators'], gridCells: 32, mapScale: 7, maze: P.team2, bases: 'corner-room', teams: 2, guards: { count: 1, arrangement: 'corners', tileCells: 2 }, drawing: 'domination-maze2' }),
    'open-maze-3-domination': dom({ mode: 'open-tdm', title: 'Open Maze 3 Team Domination', short: 'Three teams, four Dominators, a maze', tags: ['Teams', 'Maze', 'Dominators'], gridCells: 32, mapScale: 7, maze: P.team4, teams: 3, drawing: 'domination-maze4', teamTwins: { 4: 'open-maze-4-domination' } }),
    'open-maze-4-domination': dom({ mode: 'open-tdm', title: 'Open Maze 4 Team Domination', short: 'Four teams, four Dominators, a maze', tags: ['Teams', 'Maze', 'Dominators'], gridCells: 32, mapScale: 7, maze: P.team4, teams: 4, drawing: 'domination-maze4', teamTwins: { 3: 'open-maze-3-domination' } }),
    'mothership': { mode: 'open-tdm', title: 'Mothership', short: 'Kill the other team\'s Flagship', about: SHIP, goal: 'Destroy the other Flagship and keep yours alive.', tags: ['Teams', 'Flagship'], gridCells: 36, mapScale: 6, teams: 2, overlay: 'mothership', drawing: 'mothership', teamTwins: { 4: '4-mothership' } },
    '4-mothership': { mode: 'open-tdm', title: '4 Team Mothership', short: 'Four Flagships, one in each corner', about: SHIP, goal: 'Be the last team with a Flagship.', tags: ['Teams', 'Flagship'], gridCells: 36, mapScale: 6, teams: 4, overlay: 'mothership', drawing: 'mothership', teamTwins: { 2: 'mothership' } },
    'maze-mothership': { mode: 'open-tdm', title: 'Maze Mothership', short: 'Two Flagships at the two ends of a maze', about: SHIP + ' The paths between them are too narrow for a Flagship.', goal: 'Destroy the other Flagship and keep yours alive.', tags: ['Teams', 'Maze', 'Flagship'], gridCells: 35, mapScale: 154.3 / 30, maze: 40, teams: 2, overlay: 'mothership', drawing: 'maze-mothership' },
    'portal-mothership': { mode: 'portal-2tdm', title: 'Portal Mothership', short: 'Two Flagships, two areas, a wormhole between', about: SHIP + ' The two teams\' bases lie in one area, a field of rocks in the other.', goal: 'Destroy the other Flagship and keep yours alive.', tags: ['Teams', 'Bases', 'Multi-Area', 'Flagship'], gridCells: 11, mapScale: 13, teams: 2, overlay: 'mothership' },
    'open-3-tag': tag({ title: 'Open 3TDM Tag', short: 'Three teams: a kill turns the dead to your team', teams: 3, teamTwins: { 4: 'open-4-tag' } }),
    'open-4-tag': tag({ title: 'Open 4TDM Tag', short: 'Four teams: a kill turns the dead to your team', teams: 4, teamTwins: { 3: 'open-3-tag' } }),
    'open-maze-3-tag': tag({ title: 'Open Maze 3TDM Tag', short: 'Three teams in a small maze, kills turn sides', tags: ['Teams', 'Maze', 'Tag'], gridCells: 16, mapScale: 6.25, maze: 41, teams: 3, teamTwins: { 4: 'open-maze-4-tag' } }),
    'open-maze-4-tag': tag({ title: 'Open Maze 4TDM Tag', short: 'Four teams in a small maze, kills turn sides', tags: ['Teams', 'Maze', 'Tag'], gridCells: 16, mapScale: 6.25, maze: 41, teams: 4, teamTwins: { 3: 'open-maze-3-tag' } }),
    'clan-wars': { mode: 'squads', title: 'Clan Wars', short: 'Clans fight clans: share a tag to share a side', about: 'Tanks whose names carry the same clan tag, like [ABC], fight on one side. Put a clan\'s tag in your name to join it.', goal: 'Grow your clan and wipe out the others.', tags: ['Clans'], gridCells: 44, mapScale: 5.5, overlay: 'clan-wars' },
    'maze-clan-wars': { mode: 'maze-squads', title: 'Maze Clan Wars', short: 'Clans fight clans in a maze', about: 'Tanks whose names carry the same clan tag, like [ABC], fight on one side, in a maze. Put a clan\'s tag in your name to join it.', goal: 'Grow your clan and wipe out the others.', tags: ['Clans', 'Maze'], gridCells: 32, mapScale: 8, maze: P.maze, overlay: 'clan-wars',
      pool: [{ kind: 'maze', maze: P.maze, name: 'Plain Maze', share: 50 }, { kind: 'maze', maze: P.loose, name: 'Loose Maze', share: 50 }] },
    'assault-bunker': assault('assault-bunker', 'Bunker', 31, 32, 7, 4),
    'assault-trenches': assault('assault-trenches', 'Trenches', 16, 30, 7.5, 3),
    'assault-line': assault('assault-line', 'Line', 17, 30, 7.5, 4),
    'assault-branches': assault('assault-branches', 'Branches', 32, 30, 7.5, 3),
    'assault-eye': assault('assault-eye', 'Eye', 18, 30, 7.5, 3),
    'assault-yinyang': assault('assault-yinyang', 'Yin Yang', 20, 32, 185 / 30, 2),
    'assault-bastion': assault('assault-bastion', 'Bastion', 33, 30, 7.5, 4),
    'assault-stronghold': assault('assault-stronghold', 'Stronghold', 34, 34, 175 / 30, 3),
    'assault-acropolis': assault('assault-acropolis', 'Acropolis', 35, 35, 6, 1, 3),
    'assault-booster': assault('assault-booster', 'Booster', 36, 51, 146.6 / 30, 0),
    'capture-the-flag': { mode: 'tdm', title: 'Capture the Flag', short: 'Steal the other team\'s flags', about: 'Kill an enemy Outpost and it throws out three Flags. Kill an enemy Flag to take it (one at a time) and bring it into your base: that Outpost is destroyed. Kill your own team\'s loose Flags so nobody steals them. Destroy all of the other team\'s Outposts to win.', goal: 'Destroy every Outpost of the other team.', tags: ['Teams', 'Bases', 'Maze', 'Flags'], gridCells: 81, mapScale: 6, maze: 37, bases: 'drawn:ctf', teams: 2, guards: { count: 1, tileCells: 5 }, overlay: 'ctf', drawing: 'ctf', weakObjectives: true },
    'labyrinth': { mode: 'tdm', title: 'Labyrinth', short: 'Blue against the Dreadnoughts in a vast maze', about: 'A very big open maze with no bases. Every tank is on Blue, against the Dreadnoughts. Portals now and then lead back to the Nexus.', goal: 'Farm the maze and survive the Dreadnoughts.', tags: ['Maze', 'Dreadnoughts'], gridCells: 65, mapScale: 6, maze: 38, teams: 1, overlay: 'labyrinth', drawing: 'labyrinth', oneCard: { alsoIn: 'dreadnoughts' } },
    'nexus': { mode: 'tdm', title: 'Nexus', short: 'The hub of portals and the way to the Forge', about: 'A small peaceful hub: nobody can hurt anyone here. Portals in its rooms lead to other modes and to the Labyrinth. At level 45 you may pass into the guarded room and take the Forge portal: in the Forge you become a Dreadnought.', goal: 'Travel, grow, and become a Dreadnought.', tags: ['Portals', 'Dreadnoughts'], gridCells: 23, mapScale: 6, maze: 39, bases: 'drawn:nexus', teams: 1, guards: { count: 1, tileCells: 3 }, overlay: 'nexus', drawing: 'nexus', oneCard: { alsoIn: 'dreadnoughts' }, fixedBots: true, bosses: false },
    'forge': { mode: 'tdm', title: 'Forge', short: 'Where tanks become Dreadnoughts', about: 'The Forge, past the Nexus. Every tank here is a Dreadnought. Portals lead back to the Nexus and to other modes.', goal: 'Become a Dreadnought and go out to fight.', tags: ['Dreadnoughts', 'Portals'], gridCells: 24, mapScale: 5.5, teams: 1, overlay: 'forge', noCard: true, fixedBots: true, bosses: false },
  };
}

export const MODE_WORLDS: Readonly<Record<WorldId, ModeWorld>> = {
  'ffa': { mode: 'ffa', title: 'FFA', short: 'Everyone against everyone, no teams', about: 'Free For All. Everyone fights everyone. No teams, no team bases.', goal: 'Outlevel and outgun everyone: every tank is hostile.', tags: ['Solo', 'Rocks'], gridCells: 40, mapScale: 5, rocks: 'ffa' },
  'rock-ffa': { mode: 'rock-ffa', title: 'Rock FFA', short: 'Free For All in a field of rocks', about: 'Free For All on a wide arena densely scattered with rocks.', goal: 'Survive the crossfire and use the rocks as cover.', tags: ['Solo', 'Rocks'], gridCells: 44, mapScale: 5.5, rocks: 'rock-ffa' },
  'maze': { mode: 'maze', title: 'Maze FFA', short: 'Free For All in a maze of tight corridors', about: 'Free For All with procedural maze walls. Tight corridors and ambush points.', goal: 'Hunt through the labyrinth: ambush or be ambushed.', tags: ['Solo', 'Maze'], gridCells: 32, mapScale: 8, maze: P.maze },
  'duos': { mode: 'duos', title: 'Duos', short: 'You and a partner against other duos', about: 'Free For All in teams of 2. You and a partner against every other duo.', goal: 'Fight beside your partner and outlast every other duo.', tags: ['Teams of 2', 'Rocks'], gridCells: 40, mapScale: 5, rocks: 'ffa' },
  'squads': { mode: 'squads', title: 'Squads', short: 'Squads of 4 against every other squad', about: 'Free For All in teams of 4. Your squad against every other squad.', goal: 'Coordinate with your squad and wipe out the rest.', tags: ['Teams of 4', 'Rocks'], gridCells: 40, mapScale: 5, rocks: 'ffa' },
  'maze-duos': { mode: 'maze-duos', title: 'Maze Duos', short: 'Duos in a maze of tight corridors', about: 'Duos inside procedural maze walls. Tight corridors and shared ambushes.', goal: 'Stick with your partner and control the corridors together.', tags: ['Teams of 2', 'Maze'], gridCells: 32, mapScale: 6.25, maze: P.maze },
  'maze-squads': { mode: 'maze-squads', title: 'Maze Squads', short: 'Squads in a maze of tight corridors', about: 'Squads inside procedural maze walls. Four tanks, one labyrinth.', goal: 'Move as a squad and dominate the labyrinth.', tags: ['Teams of 4', 'Maze'], gridCells: 32, mapScale: 6.25, maze: P.maze },
  '2tdm': { mode: 'tdm', title: '2TDM', short: 'Two teams with bases on two sides', about: 'Team Deathmatch for two teams. A long base down each side of an arena with rocks, each with five guards.', goal: 'Push out of your base and wipe out the other team.', tags: ['Teams', 'Bases', 'Rocks'], gridCells: 33, mapScale: 6, rocks: '2tdm', bases: 'strips', teams: 2, guards: { count: 5, tileCells: 3 },
    pool: [{ kind: 'rock', rock: '2tdm', name: '2TDM Rocks', share: 50 }, { kind: 'rock', rock: '2tdm-more', name: '2TDM More Rocks', share: 50 }], teamTwins: { 4: '4tdm' } },
  '4tdm': { mode: 'tdm', title: '4TDM', short: 'Four teams with a base in each corner', about: 'Team Deathmatch for four teams. A base with a guard in each corner of an arena with rocks.', goal: 'Push out of your base and wipe out the other teams.', tags: ['Teams', 'Bases', 'Rocks'], gridCells: 36, mapScale: 5, rocks: '4tdm', rocksGrowth: '4tdm-more', bases: 'corner-tile', teams: 4, teamTwins: { 2: '2tdm' } },
  'maze-2tdm': { mode: 'tdm', title: 'Maze 2TDM', short: 'Two teams with bases in a maze', about: 'Team Deathmatch for two teams in a maze. Teams spawn in protected bases in opposite corners. Enemy bullets are destroyed in your base.', goal: 'Push out of your base and wipe out the other team.', tags: ['Teams', 'Bases', 'Maze'], gridCells: 32, mapScale: 7, maze: P.team2, bases: 'corner-room', teams: 2, guards: { count: 1, arrangement: 'corners', tileCells: 2 }, teamTwins: { 4: 'maze-4tdm' } },
  'maze-4tdm': { mode: 'tdm', title: 'Maze 4TDM', short: 'Four teams with bases in a maze', about: 'Team Deathmatch for four teams in a maze. Teams spawn in protected bases in the four corners. Enemy bullets are destroyed in your base.', goal: 'Push out of your base and wipe out the other teams.', tags: ['Teams', 'Bases', 'Maze'], gridCells: 32, mapScale: 7, maze: P.team4, bases: 'corner-room', teams: 4, guards: { count: 1, arrangement: 'corners', tileCells: 2 }, teamTwins: { 2: 'maze-2tdm' } },
  'open-2tdm': { mode: 'open-tdm', title: 'Open 2TDM', short: 'Two teams in an open arena, no bases', about: 'Open Team Deathmatch for two teams. No team bases, rocks round the edge of the arena.', goal: 'Team up and control the open arena, no safe bases.', tags: ['Teams', 'Rocks'], gridCells: 36, mapScale: 6, rocks: 'open-2tdm', teams: 2, teamTwins: { 3: 'open-3tdm', 4: 'open-4tdm' } },
  'open-3tdm': { mode: 'open-tdm', title: 'Open 3TDM', short: 'Three teams in an open arena, no bases', about: 'Open Team Deathmatch for three teams. No team bases, rocks at the top and the bottom of the arena.', goal: 'Team up and control the open arena, no safe bases.', tags: ['Teams', 'Rocks'], gridCells: 39, mapScale: 6, rocks: 'open-3tdm', teams: 3, teamTwins: { 2: 'open-2tdm', 4: 'open-4tdm' } },
  'open-4tdm': { mode: 'open-tdm', title: 'Open 4TDM', short: 'Four teams in an open arena, no bases', about: 'Open Team Deathmatch for four teams. No team bases, rocks spread round the arena.', goal: 'Team up and control the open arena, no safe bases.', tags: ['Teams', 'Rocks'], gridCells: 36, mapScale: 6, rocks: 'open-4tdm', teams: 4, teamTwins: { 2: 'open-2tdm', 3: 'open-3tdm' } },
  'open-maze-2tdm': { mode: 'open-tdm', title: 'Open Maze 2TDM', short: 'Two teams in a maze, no bases', about: 'Open Team Deathmatch for two teams inside maze walls. No team bases.', goal: 'Hold the corridors with your team, no safe bases.', tags: ['Teams', 'Maze'], gridCells: 32, mapScale: 6.25, maze: P.maze, teams: 2, teamTwins: { 3: 'open-maze-3tdm', 4: 'open-maze-4tdm' } },
  'open-maze-3tdm': { mode: 'open-tdm', title: 'Open Maze 3TDM', short: 'Three teams in a maze, no bases', about: 'Open Team Deathmatch for three teams inside maze walls. No team bases.', goal: 'Hold the corridors with your team, no safe bases.', tags: ['Teams', 'Maze'], gridCells: 32, mapScale: 6.25, maze: P.maze, teams: 3, teamTwins: { 2: 'open-maze-2tdm', 4: 'open-maze-4tdm' } },
  'open-maze-4tdm': { mode: 'open-tdm', title: 'Open Maze 4TDM', short: 'Four teams in a maze, no bases', about: 'Open Team Deathmatch for four teams inside maze walls. No team bases.', goal: 'Hold the corridors with your team, no safe bases.', tags: ['Teams', 'Maze'], gridCells: 32, mapScale: 6.25, maze: P.maze, teams: 4, teamTwins: { 2: 'open-maze-2tdm', 3: 'open-maze-3tdm' } },
  'manhunt': { mode: 'manhunt', title: 'Manhunt', short: 'Free For All where the leader is hunted', about: 'Free For All on a wide open arena where every kill hands you the entire score of your victim. The top player turns green as the Manhunted and can max out every skill.', goal: 'Reach the highest score to become the green Manhunted, then hold the lead.', tags: ['Solo', 'Manhunt'], gridCells: 32, mapScale: 10 },
  'manhunt-maze': { mode: 'manhunt-maze', title: 'Manhunt Maze', short: 'Manhunt in a maze of tight corridors', about: 'Manhunt inside procedural maze walls. Every kill takes the full score of your victim, and the leader turns green.', goal: 'Hunt through the maze, take the top score, and become the green Manhunted.', tags: ['Solo', 'Manhunt', 'Maze'], gridCells: 32, mapScale: 8, maze: P.maze,
    pool: [{ kind: 'maze', maze: P.maze, name: 'Plain Maze', share: 50 }, { kind: 'maze', maze: P.loose, name: 'Loose Maze', share: 50 }] },
  'manhunt-rock': { mode: 'manhunt-rock', title: 'Manhunt Rock', short: 'Manhunt on a wide arena full of rocks', about: 'Manhunt on a wide arena densely scattered with rocks. Every kill takes the full score of your victim, and the leader turns green.', goal: 'Use the rocks as cover, take the top score, and become the green Manhunted.', tags: ['Solo', 'Manhunt', 'Rocks'], gridCells: 32, mapScale: 7 },
  'portal-2tdm': { mode: 'portal-2tdm', title: 'Portal 2TDM', short: '2 teams, bases, a wormhole to the rocks', about: 'Two teams with guarded bases in one area, a field of rocks in the other, a grey gap between them. Step on the grey tile in the middle of an area to cross to the other one.', goal: 'Hold your side, cross through the middle and wipe out the other team.', tags: ['Teams', 'Bases', 'Multi-Area', 'Rocks'], gridCells: 11, mapScale: 13, teams: 2 },
  'portal-4tdm': SMALL_FIX.R855 !== 0 && ALL_MODES.ON !== 0
    ? { mode: 'portal-4tdm', title: 'Portal 4TDM', short: '4 teams, bases, a wormhole to the rocks', about: 'Four teams with guarded bases in the corners of one area, a field of rocks below it across a grey gap. Step on the grey tile in the middle of an area to cross to the other one.', goal: 'Hold your corner, cross through the middle and outlast the other three teams.', tags: ['Teams', 'Bases', 'Multi-Area', 'Rocks'], gridCells: 13, mapScale: 12, teams: 4 }
    : { mode: 'portal-4tdm', title: 'Portal 4TDM', short: '4 teams in rocks, a wormhole to open land', about: 'Four teams with guarded bases in the corners of a rocky area, an open area beside it across a grey gap. Step on the grey tile in the middle of an area to cross to the other one.', goal: 'Outlast three other teams among the rocks and in the open area.', tags: ['Teams', 'Bases', 'Multi-Area', 'Rocks'], gridCells: 13, mapScale: 12, teams: 4 },
  'portal-maze-4tdm': { mode: 'portal-maze-4tdm', title: 'Portal Maze 4TDM', short: '4 teams in a maze and a rock field', about: 'Four teams, each with a base in both areas: a maze on one side, a rock field on the other. A hidden portal in the middle of your base takes you to your base on the other side.', goal: 'Fight through the maze and the rocks and wipe out the other teams.', tags: ['Teams', 'Bases', 'Multi-Area', 'Maze'], gridCells: 22, mapScale: 10, teams: 4 },
  'soccer': { mode: 'tdm', title: 'Soccer', short: 'Blue against Green: push the ball into their base', about: 'Two teams on a walled field, a base dug into each end. Shoot or ram the ball into the other team\'s base to score.', goal: 'Score 10 goals before the other team.', tags: ['Teams', 'Bases', 'Ball'], gridCells: 28, mapScale: 9, maze: P.soccer, bases: 'goal-mouths', teams: 2, guards: { count: 0 }, eventOnly: true },
  'vampirism': { mode: 'maze', title: 'Vampirism', short: 'Free For All where your score is your health', about: 'Free For All in a wide maze with empty rooms.', goal: 'Drain the others and guard your score.', tags: ['Solo', 'Maze', 'Vampirism'], gridCells: 65, mapScale: 5, maze: P.vampirism, eventOnly: true },
  'magic-maze': { mode: 'maze', title: 'Magic Maze', short: 'Free For All in a maze whose walls move', about: 'Free For All in a maze of special walls that slide to new places all the time.', goal: 'Find your way, use the walls and outlast everyone.', tags: ['Solo', 'Maze', 'Magic Maze'], gridCells: 35, mapScale: 7, maze: P.magic, eventOnly: true, bosses: false },
  ...(MISSING_MODES.ON !== 0 ? MISSING_WORLDS() : {}),
} as Record<WorldId, ModeWorld>;
export const WORLD_IDS = Object.keys(MODE_WORLDS) as WorldId[];

export function worldWritesMap(id: WorldId): boolean {
  return id !== 'manhunt-rock' && id !== 'portal-2tdm' && id !== 'portal-4tdm' && id !== 'portal-maze-4tdm' && id !== 'portal-mothership';
}

export function isWorldId(id: unknown): id is WorldId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MODE_WORLDS, id);
}

export function worldHasBosses(world: string | undefined): boolean {
  return !(isWorldId(world) && MODE_WORLDS[world].bosses === false);
}

export function worldIdOf(mode: GameModeType, teams?: number, world?: string): WorldId | null {
  if (ALL_MODES.ON === 0) return null;
  if (isWorldId(world) && MODE_WORLDS[world].mode === mode) return world;
  switch (mode) {
    case 'tdm': return teams === 4 ? 'maze-4tdm' : 'maze-2tdm';
    case 'open-tdm': return teams === 4 ? 'open-4tdm' : teams === 3 ? 'open-3tdm' : 'open-2tdm';
    case 'ffa': case 'rock-ffa': case 'maze': case 'duos': case 'squads': case 'maze-duos': case 'maze-squads':
    case 'manhunt': case 'manhunt-maze': case 'manhunt-rock': case 'portal-2tdm': case 'portal-4tdm': case 'portal-maze-4tdm':
      return mode;
    default: return null;
  }
}

export function worldOfKey(key: string): WorldId | null {
  const base = key.replace(/^growth-/, '').replace(/^arms-/, '');
  return isWorldId(base) ? base : null;
}

export function worldRocks(w: ModeWorld, growth: boolean): RockFormationWord | undefined {
  return growth && w.rocksGrowth ? w.rocksGrowth : w.rocks;
}

export function writeWorldMap(m: MapConfig, id: WorldId, growth: boolean, teams: number): void {
  const w = MODE_WORLDS[id];
  if (!worldWritesMap(id)) return;
  m.gridCells = w.gridCells;
  m.mapScale = w.mapScale;
  delete m.gridCellsY;
  m.enableMaze = w.maze !== undefined;
  if (w.maze !== undefined) m.mazeType = w.maze;
  const rocks = worldRocks(w, growth);
  m.enableRocks = rocks !== undefined;
  if (rocks !== undefined) {
    m.rockPattern = rocks;
    m.rockDensity = ROCK_FORMATIONS[rocks].mean;
    m.rockSizeVariation = ARRAS_ROCK_VARIATION;
    m.rockTypes = ['rock', 'stone', 'gravel'];
    m.rockExclusionZone = false;
  }
  m.enablePortals = false;
  writeWorldBases(m, id, teams);
}

export function writeWorldBases(m: MapConfig, id: WorldId, teams: number): void {
  const w = MODE_WORLDS[id];
  m.enableSpawnAreas = w.bases !== undefined;
  if (w.bases !== undefined) m.spawnAreaTeamCount = teams;
  else delete m.spawnAreaTeamCount;
  const exact = w.bases !== undefined && w.teams === teams;
  if (exact) m.baseLayout = w.bases; else delete m.baseLayout;
  if (exact && w.guards && w.guards.count === 0) {
    m.enableBaseProtectors = false;
    delete m.baseProtectorTeams;
  } else if (exact && w.guards) {
    const g = w.guards; const list: NonNullable<MapConfig['baseProtectorTeams']> = [];
    for (let i = 0; i < teams; i++) list.push({ count: g.count, ...(g.arrangement ? { arrangement: g.arrangement } : {}), ...(g.tileCells ? { tileCells: g.tileCells } : {}) });
    m.baseProtectorTeams = list;
  }
}

export function worldPool(id: WorldId | null): MapPool | undefined {
  if (!id) return undefined;
  const w = MODE_WORLDS[id];
  if (!w.pool) return undefined;
  return { on: true, rows: w.pool.map((r, i) => ({ ...r, id: i + 1 })) };
}

export function worldModeName(id: WorldId, growth: boolean, armsRace: boolean): string {
  return `${growth ? 'Growth ' : ''}${armsRace ? 'Arms Race ' : ''}${MODE_WORLDS[id].title}`;
}
export function shownModeTitle(title: string): string {
  if (!title.endsWith(' FFA')) return title;
  const rest = title.slice(0, -4);
  const words = rest.split(' ');
  for (let i = 0; i < words.length; i++) if (words[i] !== 'Growth' && words[i] !== 'Arms' && words[i] !== 'Race' && words[i] !== '') return rest;
  return title;
}
export function worldHudName(id: WorldId, growth: boolean, armsRace: boolean, overlay?: string): string {
  let t = MODE_WORLDS[id].title;
  if (overlay && overlay !== id) t = `${overlay.charAt(0).toUpperCase()}${overlay.slice(1)} ${t}`;
  if (t !== 'FFA' && t.endsWith(' FFA')) t = t.slice(0, -4);
  return `${growth ? 'Growth ' : ''}${armsRace ? 'Arms Race ' : ''}${t}`;
}
