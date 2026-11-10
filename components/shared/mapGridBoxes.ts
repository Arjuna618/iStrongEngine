import { MAZE_TYPE_CUSTOM } from '../../types';
import type { MapConfig } from '../../types';
import { builtGridOf, clampGridSize, clampMapScale } from '../../game/MapSystem';
import { MAZE_NATIVE_SHAPE_TYPES } from '../../game/MazeGenerator';

export function gridBoxesOf(config: MapConfig): { w: number; h: number } {
  return builtGridOf(config);
}

export function gridCommitPatch(config: MapConfig, w: number, h: number, changed: 'w' | 'h'): Partial<MapConfig> | null {
  const g = clampGridSize(w, h, changed);
  const generated = config.enableMaze && config.mazeType !== MAZE_TYPE_CUSTOM;
  const keepSquare = g.w === g.h && !(generated && MAZE_NATIVE_SHAPE_TYPES.has(config.mazeType));
  const patch: Partial<MapConfig> = { gridCells: g.w, gridCellsY: keepSquare ? undefined : g.h };
  const shown = builtGridOf(config);
  const next = builtGridOf({ ...config, ...patch });
  return next.w === shown.w && next.h === shown.h ? null : patch;
}

export function scaleCommitPatch(config: MapConfig, s: number): Partial<MapConfig> | null {
  const v = clampMapScale(s);
  return v === config.mapScale ? null : { mapScale: v };
}
