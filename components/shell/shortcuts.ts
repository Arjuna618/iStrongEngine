import { shortcutKey } from '../../utils/shortcutKey';

export interface ShortcutInfo {
  id: string;
  keys: string;
  what: string;
  where: string;
}

export const SHORTCUTS: readonly ShortcutInfo[] = [
  { id: 'save', keys: 'Ctrl S', what: 'Save the project', where: 'Game Engine' },
  { id: 'saveAs', keys: 'Ctrl Shift S', what: 'Save the project under a new name', where: 'Game Engine' },
  { id: 'hub', keys: 'Ctrl O', what: 'Open the Project Hub', where: 'Game Engine' },
  { id: 'undo', keys: 'Ctrl Z', what: 'Undo', where: 'Game Engine and 3D Solid Editor' },
  { id: 'redo', keys: 'Ctrl Shift Z', what: 'Redo', where: 'Map Designer and 3D Solid Editor' },
  { id: 'redoY', keys: 'Ctrl Y', what: 'Redo', where: '3D Solid Editor' },
  { id: 'delete', keys: 'Delete', what: 'Delete what is picked', where: 'Canvas and Map Designer' },
  { id: 'tools', keys: 'Up Down', what: 'Go to the tool above or below (when no part is picked on the canvas)', where: 'Game Engine' },
  { id: 'nudge', keys: 'Arrows', what: 'Move the picked part a little (with Shift, ten times as far)', where: 'Canvas' },
  { id: 'duplicate', keys: 'Ctrl D', what: 'Copy the picked part', where: 'Canvas' },
  { id: 'copy', keys: 'Ctrl C', what: 'Remember the picked part', where: 'Canvas' },
  { id: 'paste', keys: 'Ctrl V', what: 'Add a copy of the part you remembered', where: 'Canvas' },
  { id: 'forward', keys: 'Ctrl ]', what: 'Draw the picked part one step higher', where: 'Canvas' },
  { id: 'backward', keys: 'Ctrl [', what: 'Draw the picked part one step lower', where: 'Canvas' },
  { id: 'selectTool', keys: 'V', what: 'Stop placing turrets and pick parts again (as Done)', where: 'Canvas' },
  { id: 'copyDrag', keys: 'Alt Drag', what: 'Move a copy of the part (the part stays)', where: 'Canvas' },
  { id: 'pickUnder', keys: 'Alt Click', what: 'Pick the part under the one on top', where: 'Canvas' },
  { id: 'freeDrag', keys: 'Ctrl Drag', what: 'Drag without snapping', where: 'Canvas' },
  { id: 'stepDrag', keys: 'Shift Drag', what: 'Turn by 15 degree steps, or size a barrel keeping its shape', where: 'Canvas' },
  { id: 'zoom', keys: 'Wheel', what: 'Zoom the canvas to the pointer', where: 'Canvas' },
  { id: 'pan', keys: 'Space Drag', what: 'Move the view (the middle mouse button too)', where: 'Canvas' },
  { id: 'enterBase', keys: 'Double Click', what: 'Open an auto turret base to edit its parts, or the points of a custom shape', where: 'Canvas' },
  { id: 'pen', keys: 'P', what: 'The Pen: draw a new body layer point by point', where: 'Canvas' },
  { id: 'editPoints', keys: 'A', what: 'Edit the points and curves of the picked layer', where: 'Canvas' },
  { id: 'penClose', keys: 'Enter', what: 'Close the shape the Pen is drawing', where: 'Canvas' },
  { id: 'penBack', keys: 'Backspace', what: 'Take back the Pen\'s last point', where: 'Canvas' },
  { id: 'escape', keys: 'Esc', what: 'Close, or step back', where: 'Everywhere' },
  { id: 'search', keys: 'Ctrl K', what: 'Search', where: 'Content Library and Project Hub' },
  { id: 'rename', keys: 'F2', what: 'Rename the picked card', where: 'Project Hub' },
  { id: 'fullscreen', keys: 'F11', what: 'Full screen', where: 'Everywhere' },
];

export function shortcutKeys(id: string): string | undefined {
  return SHORTCUTS.find(s => s.id === id)?.keys;
}

export const BROWSER_KEYS: readonly string[] = ['Ctrl N', 'Ctrl Shift N', 'Ctrl T', 'Ctrl Shift T', 'Ctrl W', 'Ctrl Shift W', 'Ctrl Tab', 'Ctrl Shift Tab'];

export function projectKeyOf(e: KeyboardEvent): 'save' | 'saveAs' | 'hub' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = shortcutKey(e);
  if (k === 's') return e.shiftKey ? 'saveAs' : 'save';
  if (k === 'o' && !e.shiftKey) return 'hub';
  return null;
}
