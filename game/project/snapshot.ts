import type {
  CustomProjectileDesign, EnemyConfig, FoodShapeDesign, GameState, LibraryItem, MapConfig, MultiAreaMapConfig, OtherDesign,
  TurretPreset, TankConfig,
} from '../../types';

export interface CanvasData {
  kind: 'tank' | 'shape' | 'other';
  design?: { tank: Record<string, unknown>; turrets: unknown[]; layers: unknown[] };
  ref?: { libraryId: string };
  pick: Record<string, unknown>;
  libraryId: string | null;
  shape?: FoodShapeDesign | null;
  other?: { libraryId: string } | { design: OtherDesign } | null;
}

export interface WorldData {
  mapSize: GameState['mapSize'];
  mapConfig: MapConfig;
  multiAreaConfig: MultiAreaMapConfig;
  shapeSpawnConfig: GameState['shapeSpawnConfig'];
  spawnRate: number;
  velocityInheritance: number;
  maxEnemies: number;
}

export interface ModeData {
  gameModeConfig: GameState['gameModeConfig'];
  teamBotSettings: GameState['teamBotSettings'];
  respawnLevelPercent: number;
  respawnMinLevel: number;
  respawnMaxLevel: number;
  sandboxMapMemory: { mapConfig: MapConfig; multiAreaConfig: MultiAreaMapConfig } | null;
}

export type EnemyConfigData = Omit<EnemyConfig, 'tankConfig'> & { tankConfig?: TankConfig; tankRef?: { libraryId: string } };

export interface EnemiesData {
  configs: EnemyConfigData[];
  aiBehaviorCategories: GameState['aiBehaviorCategories'];
}

export interface LibraryData {
  items: LibraryItem[];
  designs: CustomProjectileDesign[];
  presets: TurretPreset[];
}

export interface EditorData {
  camera: { x: number; y: number; zoom: number } | null;
  mapEditor: { wallCells: number; rockSize: number; rockRotation: number; rockKind: string; zoneTeam: number; portalStatic: boolean };
}

export interface EngineSnapshot {
  canvas: CanvasData;
  world: WorldData;
  mode: ModeData;
  enemies: EnemiesData;
  library: LibraryData;
  editor: EditorData;
}

export interface ApplyReport {
  missing: string[];
}
