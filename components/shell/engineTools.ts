import type { AppIcon } from '../ui/icons';
import { Box, CanvasTool, Joystick, Bot, Map, FolderDown, Settings } from '../ui/icons';
import type { GameState } from '../../types';

export type Tool = 'tank' | 'turret' | 'settings' | 'import-export' | 'enemy' | 'map-designer' | 'game-mode';
export type ToolGroup = 'build' | 'world' | 'app';

export interface EngineTool {
  id: Tool;
  group: ToolGroup;
  Icon: AppIcon;
  rail: string;
  title: string;
}

export const ENGINE_TOOLS: readonly EngineTool[] = [
  { id: 'tank', group: 'build', Icon: Box, rail: 'Tank', title: 'Tank Properties' },
  { id: 'turret', group: 'build', Icon: CanvasTool, rail: 'Canvas', title: 'Canvas Tool' },
  { id: 'game-mode', group: 'world', Icon: Joystick, rail: 'Game Mode', title: 'Game Mode' },
  { id: 'enemy', group: 'world', Icon: Bot, rail: 'Enemy Tool', title: 'Enemy Tool' },
  { id: 'map-designer', group: 'world', Icon: Map, rail: 'Map Designer', title: 'Map Designer' },
  { id: 'import-export', group: 'app', Icon: FolderDown, rail: 'Import/Export', title: 'Import / Export' },
  { id: 'settings', group: 'app', Icon: Settings, rail: 'App Settings', title: 'App Settings' },
];

export const TOOL_ORDER: readonly Tool[] = ENGINE_TOOLS.map(t => t.id);

export function engineTool(id: Tool): EngineTool {
  return ENGINE_TOOLS.find(t => t.id === id) ?? ENGINE_TOOLS[0];
}

type CanvasKindState = Pick<GameState, 'canvasEntityKind' | 'canvasIsProjectile'> | null | undefined;
export function toolRailLabel(id: Tool, s: CanvasKindState): string {
  if (id !== 'tank') return engineTool(id).rail;
  return s?.canvasEntityKind === 'other' ? 'Other' : s?.canvasEntityKind === 'shape' ? 'Food Shape' : s?.canvasIsProjectile ? 'Projectile' : 'Tank';
}
export function toolTitle(id: Tool, s: CanvasKindState): string {
  if (id !== 'tank') return engineTool(id).title;
  return s?.canvasEntityKind === 'other' ? 'Other' : s?.canvasEntityKind === 'shape' ? 'Shape Properties' : s?.canvasIsProjectile ? 'Projectile Properties' : 'Tank Properties';
}
