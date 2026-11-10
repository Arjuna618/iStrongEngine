import { DEFAULT_MAP_CONFIG, MAZE_TYPE_CUSTOM } from '../../types';
import type { MapConfig } from '../../types';
import { clampErosion } from '../../game/MazeGenerator';
import { SMALL_FIX } from '../../game/smallFixSwitch';

export function mazeTypePickPatch(config: MapConfig, newType: number): Partial<MapConfig> | null {
  let patch: Partial<MapConfig>;
  if (newType === MAZE_TYPE_CUSTOM) {
    const first = !config.customMap;
    patch = {
      mazeType: MAZE_TYPE_CUSTOM,
      enableMaze: false,
      enableRocks: false,
      ...(first && !SMALL_FIX.R809 ? { gridCells: 32, gridCellsY: undefined, mapScale: DEFAULT_MAP_CONFIG.mapScale } : {}),
    };
  } else {
    const isCustom = config.mazeType === MAZE_TYPE_CUSTOM;
    patch = {
      mazeType: newType,
      erosionIntensity: clampErosion(newType, config.erosionIntensity ?? 1.0),
      ...(config.enableMaze && !isCustom ? {} : { enableMaze: true, enableRocks: false }),
    };
  }
  const noOp = (Object.keys(patch) as (keyof MapConfig)[]).every(k => config[k] === patch[k]);
  return noOp ? null : patch;
}
