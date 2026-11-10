import { MAZE_TYPE_NAMES } from '../../game/MazeGenerator';

export function MazeTypeName(type: number): string {
  return MAZE_TYPE_NAMES[type] ?? `Maze ${type}`;
}
