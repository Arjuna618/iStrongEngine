import type { GameModeType } from '../types';

export const GAME_MODE_TITLES: Readonly<Record<GameModeType, string>> = {
  'sandbox': 'Sandbox',
  'ffa': 'FFA',
  'rock-ffa': 'Rock FFA',
  'tdm': 'TDM',
  'open-tdm': 'Open TDM',
  'maze': 'Maze FFA',
  'duos': 'Duos',
  'maze-duos': 'Maze Duos',
  'squads': 'Squads',
  'maze-squads': 'Maze Squads',
  'manhunt': 'Manhunt',
  'manhunt-maze': 'Manhunt Maze',
  'manhunt-rock': 'Manhunt Rock',
  'portal-2tdm': 'Portal 2TDM',
  'portal-4tdm': 'Portal 4TDM',
  'portal-maze-4tdm': 'Portal Maze 4TDM',
  'old-dreadnoughts': 'Old Dreadnoughts',
  'scripted': 'Custom Rules',
};

export function gameModeTitleOf(id: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(GAME_MODE_TITLES, id) ? (GAME_MODE_TITLES as Record<string, string>)[id] : undefined;
}
