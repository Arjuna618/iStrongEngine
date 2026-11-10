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
  { id: 'undo', keys: 'Ctrl Z', what: 'Undo', where: 'Tank, Canvas and Map Designer' },
  { id: 'redo', keys: 'Ctrl Shift Z', what: 'Redo', where: 'Map Designer' },
  { id: 'delete', keys: 'Delete', what: 'Delete what is picked', where: 'Canvas and Map Designer' },
  { id: 'tools', keys: 'Up Down', what: 'Go to the tool above or below', where: 'Game Engine' },
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
  const k = e.key.toLowerCase();
  if (k === 's') return e.shiftKey ? 'saveAs' : 'save';
  if (k === 'o' && !e.shiftKey) return 'hub';
  return null;
}
