import React, { useMemo, useRef } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import { MenuBar, type MenuDef } from '../kit/MenuBar';
import type { MenuEntry } from './ContextMenu';
import { ENGINE_TOOLS, type Tool } from './engineTools';
import { toolStore } from './toolStore';
import { shortcutKeys } from './shortcuts';
import { canvasLibraryDoor, exportKindDoor, mapExportDoor, type ExportKind } from './doors';
import { editorUndo, editorRedo, editorDelete, editorEditState } from '../shared/useEditorShortcuts';
import {
  newProject, saveProject, saveProjectAs, saveToDisk, canSaveToDisk, revertToSaved, renameCurrent, downloadCurrent, backupAll, openHubItem,
  APP_FILE_ACCEPT, routeProjectFiles,
} from '../project/projectActions';
import { projectSystem } from '../project/projectSystem';
import { importFiles, filesOfInput, type PickedFile } from '../library/libraryImport';
import { importSummaryLine } from '../shared/ImportButton';
import { toast } from '../ui/Toast';
import {
  FileNew, HdFileBox, Save, SaveAs, RotateCcw, Pencil, Download, BackupAll, FileImport, FileExport, Upload, FolderOpen, House,
  Undo2, Redo2, Trash2, Settings, ContentLibraryIcon, Sun, Moon, FullScreen, BookText, Keyboard, TestTube, Discord, BadgeInfo, LegalTerms, Map as MapIcon,
  HdFileAttachment, FolderDown,
} from '../ui/icons';

const EXPORT_KINDS: { kind: ExportKind; label: string }[] = [
  { kind: 'tank', label: 'Tank' },
  { kind: 'turret-preset', label: 'Turret' },
  { kind: 'projectile', label: 'Projectile' },
  { kind: 'food-shape', label: 'Food Shape' },
];

export interface AppMenuProps {
  logic: GameLogic | null;
  enabled: boolean;
  setTool: (t: Tool) => void;
  openHub: () => void;
  openDocs: () => void;
  openUpdates: () => void;
  openShortcuts: () => void;
  openAbout: () => void;
  openTerms: () => void;
  isDark: boolean;
  toggleTheme: () => void;
  onMainMenu: () => void;
}

function pickFiles(folder: boolean): Promise<PickedFile[]> {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    if (folder) inp.setAttribute('webkitdirectory', '');
    else inp.accept = APP_FILE_ACCEPT;
    inp.onchange = () => resolve(filesOfInput(inp.files));
    inp.addEventListener('cancel', () => resolve([]));
    inp.click();
  });
}

async function importIntoProject(logic: GameLogic, folder: boolean): Promise<void> {
  const picked = routeProjectFiles(await pickFiles(folder));
  if (picked.length === 0) return;
  try {
    const sum = await importFiles(logic, picked);
    const line = importSummaryLine(sum);
    toast(line.kind, line.text);
  } catch {
    toast('error', 'The import stopped: a file could not be read.');
  }
}

function toggleFullScreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

export const AppMenuBar: React.FC<AppMenuProps> = (props) => {
  const p = useRef(props); p.current = props;
  const menus = useMemo<MenuDef[]>(() => [
    {
      id: 'file', label: 'File', entries: (): MenuEntry[] => {
        const sys = projectSystem();
        const v = sys?.session.view;
        const hub = sys?.hub;
        const recent = hub ? hub.list().filter(i => i.kind === 'project' && i.deletedAt === null).sort((a, b) => Math.max(b.opened, b.modified) - Math.max(a.opened, a.modified)).slice(0, 5) : [];
        const logic = p.current.logic;
        const shapeOnCanvas = !!logic && logic.state.canvasEntityKind === 'shape' && logic.state.editingShape !== null;
        return [
          { label: 'New Project', icon: FileNew, onSelect: () => { void newProject(); } },
          { label: 'Open Project Hub', icon: HdFileBox, hint: shortcutKeys('hub'), onSelect: p.current.openHub },
          { label: 'Open Recent', icon: FolderOpen, disabled: recent.length === 0, tip: recent.length === 0 ? 'No saved projects yet' : undefined,
            items: recent.map(it => ({ label: it.name, onSelect: () => { void openHubItem(it); } })) },
          'sep',
          { label: 'Save', icon: Save, hint: shortcutKeys('save'), disabled: !!v?.readOnly, onSelect: () => { void saveProject(); } },
          { label: 'Save As', icon: SaveAs, hint: shortcutKeys('saveAs'), onSelect: () => { void saveProjectAs(); } },
          ...(canSaveToDisk() ? [{ label: 'Save to Disk', icon: FolderDown, onSelect: () => { void saveToDisk(); } }] : []),
          { label: 'Revert to Saved', icon: RotateCcw, disabled: !v?.projectId || !v.dirty, onSelect: () => { void revertToSaved(); } },
          { label: 'Rename Project', icon: Pencil, onSelect: () => { void renameCurrent(); } },
          'sep',
          { label: 'Download Project File', icon: Download, onSelect: () => { void downloadCurrent(); } },
          { label: 'Back Up Everything', icon: BackupAll, disabled: !hub || !hub.hasBackupContent(),
            tip: !hub ? 'Projects cannot be kept in this browser window' : !hub.hasBackupContent() ? 'Nothing to back up yet. Save a project first.' : undefined,
            onSelect: () => { void backupAll(); } },
          'sep',
          { label: 'Import', icon: FileImport, disabled: !logic, items: [
            { label: 'Import Files', icon: Upload, onSelect: () => { if (logic) void importIntoProject(logic, false); } },
            { label: 'Import a Folder', icon: FolderOpen, onSelect: () => { if (logic) void importIntoProject(logic, true); } },
          ] },
          { label: 'Export', icon: FileExport, items: [
            ...EXPORT_KINDS.map(k => {
              const locked = shapeOnCanvas !== (k.kind === 'food-shape');
              return {
                label: k.label, icon: HdFileAttachment, disabled: locked,
                tip: locked ? (shapeOnCanvas ? 'A food shape is on the canvas: only Food Shape can be exported' : 'Load a food shape in the Canvas Tool first') : undefined,
                onSelect: () => { p.current.setTool('import-export'); exportKindDoor.open(k.kind); },
              };
            }),
            'sep',
            { label: 'Map', icon: MapIcon, onSelect: () => { p.current.setTool('map-designer'); mapExportDoor.open(); } },
          ] },
          'sep',
          { label: 'Main Menu', icon: House, onSelect: p.current.onMainMenu },
        ];
      },
    },
    {
      id: 'edit', label: 'Edit', entries: (): MenuEntry[] => {
        const logic = p.current.logic;
        const st = logic ? editorEditState(logic) : { canUndo: false, canRedo: false, canDelete: false };
        const onMap = toolStore.get() === 'map-designer';
        return [
          { label: 'Undo', icon: Undo2, hint: shortcutKeys('undo'), disabled: !st.canUndo, onSelect: () => { if (logic) editorUndo(logic); } },
          { label: 'Redo', icon: Redo2, hint: shortcutKeys('redo'), disabled: !st.canRedo, tip: onMap ? undefined : 'Redo works in the Map Designer', onSelect: () => { if (logic) editorRedo(logic); } },
          'sep',
          { label: 'Delete', icon: Trash2, hint: shortcutKeys('delete'), disabled: !st.canDelete, onSelect: () => { if (logic) editorDelete(logic); } },
          'sep',
          { label: 'App Settings', icon: Settings, onSelect: () => p.current.setTool('settings') },
        ];
      },
    },
    {
      id: 'view', label: 'View', entries: (): MenuEntry[] => {
        const now = toolStore.get();
        return [
          ...ENGINE_TOOLS.map(t => ({ label: t.rail, icon: t.Icon, checked: now === t.id, onSelect: () => p.current.setTool(t.id) })),
          'sep',
          { label: 'Content Library', icon: ContentLibraryIcon, onSelect: () => { p.current.setTool('turret'); requestAnimationFrame(() => canvasLibraryDoor.open()); } },
          { label: 'Theme', icon: p.current.isDark ? Moon : Sun, items: [
            { label: 'Light', icon: Sun, checked: !p.current.isDark, onSelect: () => { if (p.current.isDark) p.current.toggleTheme(); } },
            { label: 'Dark', icon: Moon, checked: p.current.isDark, onSelect: () => { if (!p.current.isDark) p.current.toggleTheme(); } },
          ] },
          { label: 'Full Screen', icon: FullScreen, hint: shortcutKeys('fullscreen'), onSelect: toggleFullScreen },
        ];
      },
    },
    {
      id: 'help', label: 'Help', entries: (): MenuEntry[] => [
        { label: 'Documentation', icon: BookText, onSelect: p.current.openDocs },
        { label: 'Keyboard Shortcuts', icon: Keyboard, onSelect: p.current.openShortcuts },
        { label: 'Update Log', icon: TestTube, onSelect: p.current.openUpdates },
        'sep',
        { label: 'Discord', icon: Discord, onSelect: () => { window.open('https://discord.gg/HTE9MTsmBm', '_blank', 'noopener,noreferrer'); } },
        { label: 'Terms of Use', icon: LegalTerms, onSelect: p.current.openTerms },
        { label: 'About iStrongEngine', icon: BadgeInfo, onSelect: p.current.openAbout },
      ],
    },
  ], []);
  return <MenuBar menus={menus} enabled={props.enabled} label="iStrongEngine menu" />;
};
