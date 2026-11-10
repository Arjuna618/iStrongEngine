import { SMALL_FIX } from '../../game/smallFixSwitch';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { GameLogic } from '../../game/GameLogic';
import type { ExportFile } from '../../types';
import type { HubItem } from '../../game/project/projectStore';
import { PREVIEW_TYPES, MAP_TYPES, type ProjectHub as Hub } from '../../game/project/hub';
import { buildUserShapeDef } from '../../game/ShapeRegistry';
import type { FoodShapeDesign } from '../../types';
import { useHubShown, hubWindow } from './hubWindow';
import { projectSystem, useProjectUi } from './projectSystem';
import { newProject, saveProject, openHubItem, downloadBytes, backupAll, importToHub, APP_FILE_ACCEPT } from './projectActions';
import { askChoice, dialogOpen, DIALOG_Z } from './dialogs';
import { showStorageWarning } from './ProjectNotices';
import { toast } from '../ui/Toast';
import { LibraryGrid, type GridHost, type GridPassProvider, type GridSection, type LibraryGridHandle, type HubHost } from '../library/LibraryGrid';
import { libraryGL } from '../library/libraryGL';
import { FrameLoop } from '../library/frameLoop';
import { useLibraryCanvas } from '../library/libraryCanvas';
import { windowSize } from '../library/ContentLibrary';
import type { LibEntry, LibKind } from '../library/catalog';
import { canvasActions, canvasKinds } from '../library/libraryModes';
import { importFiles, filesOfDrop, filesOfInput, type PickedFile } from '../library/libraryImport';
import { importSummaryLine } from '../shared/ImportButton';
import { useGameDark } from '../../utils/useGameTheme';
import { ThemeSwitch } from '../kit/ThemeSwitch';
import { IconButton, emptyArt, SearchEnd } from '../kit/kit';
import { DropZone } from '../kit/DropZone';
import { useWindowFrame } from '../kit/focusScope';
import { SwapInPlace } from '../kit/Collapse';
import { useSwapFade } from '../kit/motion';
import { useDropMenu, DropMenu, menuOpen } from '../kit/DropMenu';
import { useAfterFirstPaint } from '../kit/Deferred';
import { Modal, useModalClose } from '../kit/Modal';
import { openContextMenu, type MenuEntry } from '../shell/ContextMenu';
import { mapLoadDoor } from '../shell/doors';
import type { Tool } from '../shell/engineTools';
import { useEscapeOwner } from '../shared/escapeStack';
import { useBackdropClose } from '../shared/useBackdropClose';
import { usePortalMenuScale, useFitScale } from '../../utils/useMenuScale';
import { getEffectiveDPR, getZoomCompensation } from '../../utils/zoomCompensation';
import {
  HdFileBox, Search, SearchX, X, Upload, FolderOpen, ChevronDown, ArrowUpDown, Check, Plus, FileNew, Download, Copy, Pencil,
  Trash2, Info, RestoreItem, BackupAll, Map as MapIcon, EMPTY_LINE, FileBox, ShieldQuestion,
} from '../ui/icons';

const CLOSE_MS = 120;
type HubSort = 'recent' | 'name' | 'newest' | 'size';
const SORT_LABEL: Record<HubSort, string> = { recent: 'Last opened', name: 'Name', newest: 'Newest', size: 'Size' };
type CardSize = 's' | 'm' | 'l';
const VIEW_KEY = 'istrong-hub-view';

function loadView(): { size: CardSize; sort: HubSort } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    return { size: v?.size === 's' || v?.size === 'l' ? v.size : 'm', sort: v?.sort in SORT_LABEL ? v.sort : 'recent' };
  } catch { return { size: 'm', sort: 'recent' }; }
}
function saveView(v: { size: CardSize; sort: HubSort }): void { try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { } }

const EMPTY_TAGS = new Uint32Array(0);

function sizeText(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ago(t: number, now = Date.now()): string {
  if (!t) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
const fullDate = (t: number) => (t ? new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never');

const KIND_OF_TYPE: Record<string, LibKind> = { Tank: 'tank', TurretPreset: 'turret', CustomTurret: 'turret', CustomProjectile: 'projectile', Other: 'other', FoodShape: 'shape' };
const TYPE_WORD: Record<string, string> = {
  Tank: 'Tank', TurretPreset: 'Turret', CustomTurret: 'Turret', CustomProjectile: 'Projectile', Other: 'Other', FoodShape: 'Food shape',
  Map: 'Map', MultiAreaMap: 'Map with areas',
};

function entryOf(it: HubItem, file: ExportFile | undefined, openId: string | null, gpuOk: boolean): LibEntry {
  const preview = gpuOk && it.kind === 'file' && PREVIEW_TYPES.has(it.fileType ?? '');
  const icon: 'project' | 'map' | 'file' = it.kind === 'project' ? 'project' : MAP_TYPES.has(it.fileType ?? '') ? 'map' : 'file';
  const kind: LibKind = KIND_OF_TYPE[it.fileType ?? ''] ?? 'tank';
  const word = it.kind === 'project' ? 'Project' : (TYPE_WORD[it.fileType ?? ''] ?? 'File');
  const when = it.deletedAt !== null ? `deleted ${fullDate(it.deletedAt)}` : it.kind === 'project' ? `saved ${fullDate(it.modified)}` : `kept ${fullDate(it.created)}`;
  const gone = it.deletedAt !== null;
  const isOpen = it.id === openId && !gone;
  const state = `${isOpen ? 'Open now. ' : ''}${it.readOnly && !gone ? 'Read only. ' : ''}`;
  const how = gone ? '' : it.kind === 'project' ? ' Double click to open it.' : icon === 'map' ? ' Double click to load it.' : PREVIEW_TYPES.has(it.fileType ?? '') ? ' Double click to open it on the canvas.' : ' Double click to add it to the Content Library.';
  const item = file ? { id: 'hub-' + it.id, name: it.name, fileData: file, loadedAt: it.created, source: 'manual-import' as const } : null;
  let shape = null;
  if (file && file.type === 'FoodShape') { try { shape = buildUserShapeDef(file.data as FoodShapeDesign); } catch { shape = null; } }
  return {
    key: 'hub:' + it.id,
    hub: { id: it.id, kind: it.kind, icon, preview, open: it.id === openId && it.deletedAt === null, readOnly: !!it.readOnly, tip: `${state}${word}, ${sizeText(it.size)}, ${when}.${how}` },
    kind, id: it.id, name: it.name, item, shape, sentry: null, fileKey: null, mine: true, tier: 0, collection: '', group: '',
    facts: [0, 0, 0, 0], tags: EMPTY_TAGS, lower: it.name.toLowerCase(), words: [], extra: '', order: 0, loadedAt: it.modified,
  };
}

const noSub = () => () => {};
const NO_ITEMS: readonly HubItem[] = [];

export const ProjectHubSlot: React.FC<{ logic: GameLogic | null; setTool: (t: Tool) => void }> = ({ logic, setTool }) => {
  const shown = useHubShown();
  if (!shown || !logic) return null;
  return <ProjectHubWindow logic={logic} setTool={setTool} onClose={hubClosed} />;
};
const hubClosed = () => { hubWindow.set(false); hubWindow.closed(); };

const ProjectHubWindow: React.FC<{ logic: GameLogic; setTool: (t: Tool) => void; onClose: () => void }> = ({ logic, setTool, onClose }) => {
  const dark = useGameDark();
  const ui = useProjectUi();
  const sys = projectSystem();
  const hub: Hub | null = sys?.hub ?? null;
  const items = useSyncExternalStore(hub ? (f) => hub.subscribe(f) : noSub, () => (hub ? hub.list() : NO_ITEMS), () => NO_ITEMS);
  const portalScale = usePortalMenuScale();
  const cardRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimer = useRef(0);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const a = document.activeElement;
    if (a instanceof HTMLElement && cardRef.current && cardRef.current.contains(a)) a.blur();
    setClosing(true);
    closeTimer.current = window.setTimeout(() => { closeTimer.current = 0; onClose(); }, CLOSE_MS);
  }, [onClose]);
  useWindowFrame({ scrim: scrimRef, card: frameRef, focus: cardRef, closing });
  useLayoutEffect(() => () => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && cardRef.current && cardRef.current.contains(a)) {
      a.blur();
      queueMicrotask(() => document.body.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    }
  }, []);
  useEffect(() => hubWindow.subscribe(() => {
    if (!hubWindow.get()) { close(); return; }
    if (closingRef.current) {
      if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = 0; }
      closingRef.current = false;
      setClosing(false);
    }
  }), [close]);
  const [size, setSize] = useState(windowSize);
  useEffect(() => {
    let raf = 0;
    const on = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; setSize(prev => { const n = windowSize(); return n.w === prev.w && n.h === prev.h ? prev : n; }); }); };
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const fit = useFitScale(cardRef, portalScale, true);
  const bodyReady = useAfterFirstPaint();

  const [view, setView] = useState(loadView);
  const setViewKept = (v: Partial<typeof view>) => setView(prev => { const n = { ...prev, ...v }; saveView(n); return n; });
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<LibraryGridHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const sortMenu = useDropMenu({ align: 'end', estimatedHeight: 180, estimatedWidth: 184 });
  const importMenu = useDropMenu({ align: 'end', estimatedHeight: 150 });

  const decoded = useRef(new Map<string, ExportFile | null>());
  const pending = useRef(new Set<string>());
  const [decV, setDecV] = useState(0);
  const bump = useRef(0);
  const need = useCallback((e: LibEntry) => {
    const id = e.hub?.id;
    if (!id || !hub || decoded.current.has(id) || pending.current.has(id)) return;
    const it = hub.get(id);
    if (!it) return;
    pending.current.add(id);
    hub.fileOf(it).then(f => { decoded.current.set(id, f); }).catch(() => { decoded.current.set(id, null); }).finally(() => {
      pending.current.delete(id);
      if (!bump.current) bump.current = requestAnimationFrame(() => { bump.current = 0; setDecV(v => v + 1); });
    });
  }, [hub]);
  useEffect(() => () => { if (bump.current) cancelAnimationFrame(bump.current); }, []);

  const gpuOk = useMemo(() => libraryGL().available, []);
  const entryCache = useRef(new Map<string, { it: HubItem; file: ExportFile | null | undefined; open: boolean; e: LibEntry }>());
  const entries = useMemo(() => {
    const out = new Map<string, LibEntry>();
    for (const it of items) {
      const file = decoded.current.get(it.id);
      const open = it.id === ui.view.projectId;
      const c = entryCache.current.get(it.id);
      if (c && c.it === it && c.file === file && c.open === open) { out.set(it.id, c.e); continue; }
      const e = entryOf(it, file ?? undefined, ui.view.projectId, gpuOk);
      if (file === null && e.hub) e.hub.preview = false;
      entryCache.current.set(it.id, { it, file, open, e });
      out.set(it.id, e);
    }
    return out;
  }, [items, decV, ui.view.projectId, gpuOk]);

  const dq = query.trim().toLowerCase();
  const sections = useMemo<GridSection[]>(() => {
    const match = (it: HubItem) => !dq || it.name.toLowerCase().includes(dq);
    const cmp = (a: HubItem, b: HubItem): number => {
      switch (view.sort) {
        case 'name': return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
        case 'newest': return b.created - a.created;
        case 'size': return b.size - a.size;
        default: return Math.max(b.opened, b.modified) - Math.max(a.opened, a.modified);
      }
    };
    const pick = (f: (it: HubItem) => boolean, sort: (a: HubItem, b: HubItem) => number) => items.filter(it => f(it) && match(it)).sort(sort).map(it => entries.get(it.id)!).filter(Boolean);
    return [
      { id: 'projects', title: 'Projects', entries: pick(it => it.kind === 'project' && it.deletedAt === null, cmp) },
      { id: 'files', title: 'Custom User Files', entries: pick(it => it.kind === 'file' && it.deletedAt === null, cmp) },
      { id: 'deleted', title: 'Recently Deleted', entries: pick(it => it.deletedAt !== null, (a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)) },
    ];
  }, [items, entries, dq, view.sort]);
  const total = items.length;
  const shownCount = sections.reduce((n, s) => n + s.entries.length, 0);

  const firstOpen = useRef(true);
  useEffect(() => {
    if (!firstOpen.current || !bodyReady) return;
    firstOpen.current = false;
    const id = ui.view.projectId;
    if (id && entries.has(id)) { const k = 'hub:' + id; setSelectedKey(k); setFocusKey(k); requestAnimationFrame(() => gridRef.current?.scrollToKey(k)); }
  }, [bodyReady, entries, ui.view.projectId]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const sizeSwap = useSwapFade();
  const loopRef = useRef<FrameLoop | null>(null);
  if (!loopRef.current) loopRef.current = new FrameLoop();
  const loop = loopRef.current;
  const gridP = useRef<GridPassProvider | null>(null);
  const darkRef = useRef(dark); darkRef.current = dark;
  const devRef = useRef(1);
  devRef.current = (fit / (getZoomCompensation() || 1)) * getEffectiveDPR();
  const host: GridHost = useMemo(() => ({
    loop,
    setGrid: (p) => { gridP.current = p; loop.request(); },
    offsetOf: (el: HTMLElement) => {
      const body = bodyRef.current;
      let x = 0, y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== body) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
      return { x, y };
    },
  }), [loop]);
  useLibraryCanvas({ bodyRef, ready: bodyReady, loop, devRef, darkRef, gridP });
  useEffect(() => { loop.request(); }, [dark, fit, loop, sections, selectedKey, decV]);

  const itemOf = (e: LibEntry): HubItem | undefined => (e.hub ? hub?.get(e.hub.id) : undefined);
  const fileOf = async (it: HubItem): Promise<ExportFile | null> => {
    const have = decoded.current.get(it.id);
    if (have) return have;
    try { const f = await hub!.fileOf(it); decoded.current.set(it.id, f); return f; } catch { toast('error', 'This file could not be read.'); return null; }
  };
  const openProjectCard = async (it: HubItem) => { if (await openHubItem(it)) close(); };
  const openOnCanvas = async (it: HubItem, e: LibEntry) => {
    const f = await fileOf(it);
    if (!f) return;
    const lock = canvasKinds(logic).locked[e.kind];
    if (lock) { toast('info', lock); return; }
    if (f.type === 'FoodShape') {
      logic.loadFoodShapeDesignIntoCanvas(f.data as FoodShapeDesign);
      setTool('tank');
    } else {
      const en: LibEntry = { ...e, item: { id: 'hub-' + it.id, name: it.name, fileData: f, loadedAt: it.created, source: 'manual-import' } };
      const act = canvasActions({ logic, showToast: (k, t) => toast(k, t), onUpdate: () => logic.onStateChange?.(logic.state), showTool: setTool })(en)[0];
      if (!act) return;
      if (act.run(en) === false) return;
      if (e.kind !== 'other') setTool('turret');
    }
    close();
  };
  const addToLibrary = async (it: HubItem) => {
    const f = await fileOf(it);
    if (!f) return;
    const text = JSON.stringify({ ...f, name: it.name });
    const sum = await importFiles(logic, [{ file: { name: it.name + '.json' } as File, path: it.name }], async () => text);
    const line = importSummaryLine(sum);
    toast(line.kind, line.kind === 'success' ? `Added "${it.name}" to this project's Content Library.` : line.text);
  };
  const loadMap = async (it: HubItem) => {
    const f = await fileOf(it);
    if (!f) return;
    setTool('map-designer');
    requestAnimationFrame(() => { if (!mapLoadDoor.load(f)) toast('error', 'The Map Designer is not ready yet.'); });
    close();
  };
  const hubFailed = (e: unknown) => { toast('error', e instanceof Error && /quota/i.test(e.name + e.message) ? 'The browser storage is full, so that was not done.' : 'That could not be done. The browser refused to store it.'); };
  const remove = async (it: HubItem) => {
    if (!hub) return;
    try { await hub.remove(it.id); } catch (e) { hubFailed(e); return; }
    toast('success', `Moved "${it.name}" to Recently Deleted.`, { label: 'Undo', run: () => { hub.restore(it.id).catch(hubFailed); } });
  };
  const removeForGood = async (it: HubItem) => {
    if (!hub) return;
    const ans = await askChoice('Delete for Good', `Delete "${it.name}" for good? This cannot be undone.`, [{ label: 'Cancel', value: 'cancel' }, { label: 'Delete', value: 'delete', primary: true }], 'cancel', undefined, Trash2);
    if (ans === 'delete') { try { await hub.removeForGood(it.id); } catch (e) { hubFailed(e); } }
  };
  const download = async (it: HubItem) => {
    if (!hub) return;
    try {
      const d = await hub.downloadOf(it);
      downloadBytes(d.bytes, d.fileName, d.mime);
      await hub.markDownloaded(it.id);
      toast('success', `Downloaded "${d.fileName}"`);
    } catch (err) { toast('error', err instanceof Error ? err.message : 'It could not be downloaded.'); }
  };
  const activate = (e: LibEntry) => {
    const it = itemOf(e);
    if (!it || it.deletedAt !== null) return;
    if (it.kind === 'project') void openProjectCard(it);
    else if (MAP_TYPES.has(it.fileType ?? '')) void loadMap(it);
    else if (PREVIEW_TYPES.has(it.fileType ?? '')) void openOnCanvas(it, e);
    else void addToLibrary(it);
  };
  const menuOf = (e: LibEntry): MenuEntry[] => {
    const it = itemOf(e);
    if (!it || !hub) return [];
    if (it.deletedAt !== null) return [
      { label: 'Restore', icon: RestoreItem, onSelect: () => { hub.restore(it.id).catch(hubFailed); } },
      'sep',
      { label: 'Delete for Good', icon: Trash2, onSelect: () => { void removeForGood(it); } },
    ];
    const common: MenuEntry[] = [
      { label: 'Rename', icon: Pencil, hint: 'F2', onSelect: () => setRenamingKey(e.key) },
      { label: 'Duplicate', icon: Copy, onSelect: () => { const made = hub.duplicate(it.id).then(c => { if (c) toast('success', `Made "${c.name}"`); }); if (SMALL_FIX.R829) void made.catch(hubFailed); else void made; } },
      { label: 'Download', icon: Download, onSelect: () => { void download(it); } },
      { label: 'Details', icon: Info, onSelect: () => setDetailsId(it.id) },
      'sep',
      { label: 'Delete', icon: Trash2, hint: 'Delete', onSelect: () => { void remove(it); } },
    ];
    if (it.kind === 'project') return [{ label: 'Open', icon: HdFileBox, onSelect: () => { void openProjectCard(it); } }, 'sep', ...common];
    if (MAP_TYPES.has(it.fileType ?? '')) return [{ label: it.fileType === 'GameMode' ? 'Add to Map Library' : 'Load Map', icon: MapIcon, onSelect: () => { void loadMap(it); } }, 'sep', ...common];
    if (PREVIEW_TYPES.has(it.fileType ?? '')) return [
      { label: 'Open on Canvas', icon: FileBox, onSelect: () => { void openOnCanvas(it, e); } },
      { label: 'Add to Content Library', icon: Plus, onSelect: () => { void addToLibrary(it); } },
      'sep', ...common,
    ];
    return [{ label: 'Add to Content Library', icon: Plus, onSelect: () => { void addToLibrary(it); } }, 'sep', ...common];
  };
  const hubHost: HubHost = {
    renamingKey,
    onMenu: (e, ev) => { setSelectedKey(e.key); setFocusKey(e.key); openContextMenu(ev, menuOf(e)); },
    onRenameDone: (e, name) => {
      setRenamingKey(null);
      if (name === null || !hub || !e.hub) return;
      const renamed = hub.rename(e.hub.id, name).then(err => { if (err) { toast('error', err); setRenamingKey(e.key); } });
      if (SMALL_FIX.R829) void renamed.catch(hubFailed); else void renamed;
    },
    need,
  };

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);
  const runImport = useCallback((picked: PickedFile[]) => {
    if (!hub || picked.length === 0) return;
    void importToHub(picked, {
      onStart: () => { stopRef.current = false; setProgress({ done: 0, total: picked.length }); },
      onProgress: (done, tot) => setProgress({ done, total: tot }),
      stopped: () => stopRef.current,
      onAdded: (added) => {
        const first = added[0];
        setSelectedKey('hub:' + first.id); setFocusKey('hub:' + first.id);
        requestAnimationFrame(() => gridRef.current?.scrollToKey('hub:' + first.id));
      },
      open: (it) => { void openProjectCard(it); },
    }).finally(() => setProgress(null));
  }, [hub]);
  useEscapeOwner(close);
  useEscapeOwner(() => setSelectedKey(null), selectedKey !== null && renamingKey === null && detailsId === null);
  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key !== 'Escape') ev.stopPropagation();
    const t = ev.target as HTMLElement;
    const inField = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';
    if ((ev.key === 'k' && (ev.ctrlKey || ev.metaKey)) || (ev.key === '/' && !inField)) { ev.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
    if (inField && t !== searchRef.current) return;
    if ((t.tagName === 'BUTTON' || t.tagName === 'A') && (ev.key === 'Enter' || ev.key === ' ')) return;
    if (inField && ev.key !== 'ArrowDown' && ev.key !== 'Enter') return;
    const g = gridRef.current;
    if (!g) return;
    const move = (dx: number, dy: number) => {
      const cur = focusKey ?? g.firstKey();
      if (!cur) return;
      const next = focusKey ? g.neighbour(cur, dx, dy) : cur;
      if (next) { setFocusKey(next); setSelectedKey(next); g.scrollToKey(next); }
    };
    const focusedEntry = () => { const k = focusKey ?? selectedKey; if (!k) return null; const id = k.slice(4); return entries.get(id) ?? null; };
    switch (ev.key) {
      case 'ArrowRight': ev.preventDefault(); move(1, 0); break;
      case 'ArrowLeft': ev.preventDefault(); move(-1, 0); break;
      case 'ArrowDown': ev.preventDefault(); if (inField) { t.blur(); cardRef.current?.focus(); } move(0, 1); break;
      case 'ArrowUp': ev.preventDefault(); move(0, -1); break;
      case 'PageDown': ev.preventDefault(); g.page(1); break;
      case 'PageUp': ev.preventDefault(); g.page(-1); break;
      case 'Home': if (!inField) { ev.preventDefault(); g.toEdge(false); } break;
      case 'End': if (!inField) { ev.preventDefault(); g.toEdge(true); } break;
      case 'Enter': { const e = focusedEntry(); if (e) { ev.preventDefault(); activate(e); } break; }
      case 'F2': { const e = focusedEntry(); if (e && e.hub && itemOf(e)?.deletedAt === null) { ev.preventDefault(); setRenamingKey(e.key); } break; }
      case 'Delete': {
        const e = focusedEntry(); const it = e ? itemOf(e) : undefined;
        if (it) { ev.preventDefault(); if (it.deletedAt !== null) void removeForGood(it); else void remove(it); }
        break;
      }
    }
  };

  const backdrop = useBackdropClose(close);
  const facts = ui.facts;
  const [lastBackup, setLastBackup] = useState<number>(0);
  useEffect(() => { void sys?.session.storeOrNull?.getMeta<number>('lastBackupAt').then(v => setLastBackup(v ?? 0)).catch(() => {}); }, [sys, items]);
  const keptBytes = useMemo(() => (hub ? hub.keptBytes() : 0), [hub, items]);
  const nProjects = items.filter(i => i.kind === 'project' && i.deletedAt === null).length;
  const nFiles = items.filter(i => i.kind === 'file' && i.deletedAt === null).length;
  const details = detailsId ? items.find(i => i.id === detailsId) : undefined;
  const dropOk = !!hub && !dialogOpen() && renamingKey === null && detailsId === null && !closing;

  const empty = total === 0 && !dq;
  const card = (
    <div ref={scrimRef} className={`modal-scrim z-[70] animate-fadeIn ${closing ? 'pointer-events-none' : ''}`} {...backdrop}>
      <div style={{ zoom: fit }} onClick={e => e.stopPropagation()}>
        <DropZone enabled={dropOk} onDrop={dt => { void filesOfDrop(dt).then(runImport); }} sub="Projects, backups and app files, or a whole folder"
          boxRef={frameRef} className="modal-card k-lib-window k-hub-window flex flex-col outline-none animate-scaleUp"
          style={{ width: size.w, height: size.h }}>
          <div ref={cardRef} tabIndex={-1} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label="Project Hub" className="flex flex-col flex-1 min-h-0 outline-none"
            onMouseDown={(ev) => { const tg = ev.target as HTMLElement; if (!tg.closest('input,button,textarea,select') && cardRef.current && document.activeElement !== cardRef.current) cardRef.current.focus({ preventScroll: true }); }}>
            <div className="k-win-head shrink-0 flex items-center gap-4 pl-5 pr-3 h-[60px] border-b border-[var(--alpha-divider)]">
              <div className="flex items-center gap-2.5 min-w-0 w-[240px] shrink-0">
                <HdFileBox size={20} absoluteStrokeWidth className="text-[var(--text-primary)] shrink-0" />
                <h2 className="k-modal-title min-w-0 truncate">Project Hub</h2>
              </div>
              <div className="relative flex-1 max-w-[520px] mx-auto">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--k-search-icon)] pointer-events-none" />
                <input ref={searchRef} type="text" value={query} onChange={e => setQuery(e.target.value)} dir="auto"
                  onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }}
                  placeholder="Search projects and files"
                  className="k-text-in k-search-bar w-full h-9 pl-9 pr-16 rounded-lg text-[13px] bg-[var(--k-search-bg)] border border-[var(--alpha-card-border)] shadow-[var(--shadow-input)] text-[var(--text-primary)] placeholder:text-[var(--k-placeholder)] outline-none" />
                <SearchEnd query={query} onClear={() => { setQuery(''); searchRef.current?.focus(); }} />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <SwapInPlace swapKey={!!progress} hold={false} className="k-swap-text">
                {progress ? (
                  <span className="k-hub-progress flex items-center gap-2">
                    Importing {Math.min(progress.done + 1, progress.total)} of {progress.total}
                    <button type="button" className="k-btn k-btn-ghost k-btn-sm" onClick={() => { stopRef.current = true; }}>Cancel</button>
                  </span>
                ) : (
                  <div className="relative">
                    <button type="button" ref={importMenu.triggerRef as React.RefObject<HTMLButtonElement>} onClick={e => importMenu.toggle(e.currentTarget.getBoundingClientRect())}
                      aria-haspopup="menu" aria-expanded={menuOpen(importMenu)} className="k-btn k-btn-secondary k-btn-md" disabled={!hub}>
                      <span className="k-btn-icon"><Upload size={14} /></span>
                      <span className="truncate">Import</span>
                      <span className="k-btn-icon"><ChevronDown size={14} className="text-[var(--text-tertiary)]" /></span>
                    </button>
                    <DropMenu menu={importMenu} className="k-menu">
                      <button type="button" role="menuitem" onClick={() => { importMenu.close(); fileRef.current?.click(); }} className="k-menu-item">
                        <Upload size={14} className="shrink-0" />
                        <span className="k-menu-text"><span className="k-menu-title">Import Files</span><span className="k-menu-sub">Projects, backups or app files</span></span>
                      </button>
                      <button type="button" role="menuitem" onClick={() => { importMenu.close(); folderRef.current?.click(); }} className="k-menu-item">
                        <FolderOpen size={14} className="shrink-0" />
                        <span className="k-menu-text"><span className="k-menu-title">Import a Folder</span><span className="k-menu-sub">Every file inside, sub folders too</span></span>
                      </button>
                      <div className="mt-1 pt-2 px-2.5 pb-1 border-t border-[var(--alpha-divider)] text-[11px] leading-[1.45] text-[var(--text-tertiary)]">You can also drop files or a folder on this window.</div>
                    </DropMenu>
                  </div>
                )}
                </SwapInPlace>
                <input ref={fileRef} type="file" accept={APP_FILE_ACCEPT} multiple className="hidden" onChange={e => { const f = filesOfInput(e.target.files); e.target.value = ''; runImport(f); }} />
                <input ref={folderRef} type="file" multiple className="hidden" {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={e => { const f = filesOfInput(e.target.files); e.target.value = ''; runImport(f); }} />
                <button type="button" className="k-btn k-btn-primary k-btn-md" onClick={() => { void newProject().then(started => { if (started) close(); }); }}>
                  <span className="k-btn-icon"><FileNew size={14} /></span><span className="truncate">New Project</span>
                </button>
                <div className="k-lib-tabs k-lib-tabs-sm" role="radiogroup" aria-label="Card size">
                  {(['s', 'm', 'l'] as CardSize[]).map(sz => (
                    <button key={sz} type="button" role="radio" aria-checked={view.size === sz} onClick={() => { if (view.size !== sz) sizeSwap.run(() => setViewKept({ size: sz })); }}
                      title={sz === 's' ? 'Small cards' : sz === 'm' ? 'Medium cards' : 'Large cards'} aria-label={sz === 's' ? 'Small cards' : sz === 'm' ? 'Medium cards' : 'Large cards'}
                      className={`k-ico k-lib-tab k-lib-tab-icon${view.size === sz ? ' k-lib-tab-on' : ''}`}>
                      <span className="k-ico-art grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${sz === 's' ? 3 : sz === 'm' ? 2 : 1}, 1fr)` }}>
                        {Array.from({ length: sz === 's' ? 9 : sz === 'm' ? 4 : 1 }, (_, i) => <span key={i} className="block rounded-[1.5px] bg-current" style={{ width: sz === 's' ? 3 : sz === 'm' ? 5 : 11, height: sz === 's' ? 3 : sz === 'm' ? 5 : 11 }} />)}
                      </span>
                    </button>
                  ))}
                </div>
                <ThemeSwitch />
                <IconButton label="Close" onClick={close}><X size={18} /></IconButton>
              </div>
            </div>

            {!empty && (
              <div className="shrink-0 flex items-center gap-2 px-[18px] min-h-[52px] py-2 border-b border-[var(--alpha-divider)]">
                <span className="flex-1 text-[12px] text-[var(--text-secondary)] tabular-nums">{dq ? `${shownCount} found` : `${nProjects} project${nProjects === 1 ? '' : 's'}, ${nFiles} file${nFiles === 1 ? '' : 's'}`}</span>
                <div className="relative shrink-0">
                  <button type="button" ref={sortMenu.triggerRef as React.RefObject<HTMLButtonElement>} onClick={e => sortMenu.toggle(e.currentTarget.getBoundingClientRect())}
                    aria-haspopup="menu" aria-expanded={menuOpen(sortMenu)} className="k-btn k-btn-secondary k-btn-md">
                    <span className="k-btn-icon"><ArrowUpDown size={13} /></span>
                    <span className="truncate">{SORT_LABEL[view.sort]}</span>
                    <span className="k-btn-icon"><ChevronDown size={14} className="text-[var(--text-tertiary)]" /></span>
                  </button>
                  <DropMenu menu={sortMenu} className="k-lib-menu w-[184px]">
                    {(Object.keys(SORT_LABEL) as HubSort[]).map(s => (
                      <button key={s} type="button" role="menuitemradio" aria-checked={s === view.sort} onClick={() => { setViewKept({ sort: s }); sortMenu.close(); }}
                        className={`k-lib-menu-item${s === view.sort ? ' k-lib-menu-item-on' : ''}`}>
                        {SORT_LABEL[s]} {s === view.sort && <Check size={14} className="shrink-0 text-[var(--accent)]" />}
                      </button>
                    ))}
                  </DropMenu>
                </div>
              </div>
            )}

            <div ref={bodyRef} inert={sizeSwap.inert || undefined} className={`relative flex-1 min-h-0 flex k-lib-content ${sizeSwap.swapClass}`}>
              {empty ? (
                <div className="absolute inset-0 grid place-items-center">
                  <HubEmpty hasStore={!!hub} onImport={() => fileRef.current?.click()} />
                </div>
              ) : (
                <LibraryGrid
                  ref={gridRef}
                  variant="hub"
                  hubHost={hubHost}
                  sections={sections}
                  size={view.size}
                  extraH={0}
                  dark={dark}
                  selectedKey={selectedKey}
                  focusKey={focusKey}
                  chosen={EMPTY_SET}
                  favs={EMPTY_SET}
                  onSelect={e => { setSelectedKey(e.key); setFocusKey(e.key); }}
                  onActivate={activate}
                  onFav={() => {}}
                  resetKey={dq + '|' + view.sort}
                  host={host}
                  loading={!bodyReady}
                  empty={
                    <div className="text-center max-w-[340px]">
                      <span className="flex justify-center text-[var(--text-primary)]"><SearchX size={58} strokeWidth={EMPTY_LINE} /></span>
                      <div className="sr-only">Nothing matches.</div>
                      {dq && <button type="button" onClick={() => setQuery('')} className="k-btn k-btn-secondary k-btn-md mt-4">Clear Search</button>}
                    </div>
                  }
                />
              )}
            </div>

            <div className="k-hub-foot shrink-0">
              {!hub ? (
                <span className="k-hub-foot-text">This browser window cannot keep projects. Use Download Project File to keep your work.</span>
              ) : (
                <span className="k-hub-foot-facts">
                  <span className="k-hub-foot-fact"><span className="k-hub-foot-label">Total content size:</span><span className="k-badge">{total === 0 ? 'Nothing yet' : sizeText(keptBytes)}</span></span>
                  <span className="k-hub-foot-fact"><span className="k-hub-foot-label">Last backup:</span><span className="k-badge">{lastBackup ? ago(lastBackup) : 'None yet'}</span></span>
                  {facts?.protected && <span className="k-badge" data-tip="Protected from automatic cleanup: the browser will not clear your work by itself.">Protected</span>}
                </span>
              )}
              {hub && facts && !facts.protected && (
                <button type="button" className="k-btn k-btn-ghost k-btn-sm" onClick={() => { void showStorageWarning(facts, true); }}>
                  <span className="k-btn-icon"><ShieldQuestion size={14} /></span>Is my work safe?
                </button>
              )}
              {hub && (
                <button type="button" className="k-btn k-btn-ghost k-btn-sm" onClick={() => { void backupAll().then(ok => { if (ok) setLastBackup(Date.now()); }); }}>
                  <span className="k-btn-icon"><BackupAll size={14} /></span>Back Up Everything
                </button>
              )}
            </div>
          </div>
        </DropZone>
      </div>
      {details && hub && <HubDetails item={details} onClose={() => setDetailsId(null)} onRestoreVersion={(i, closeDetails) => { void openHubItem(details, i).then(ok => { if (ok) { closeDetails(() => setDetailsId(null)); close(); } }); }} />}
    </div>
  );
  return createPortal(card, document.body);
};

const EMPTY_SET: ReadonlySet<string> = new Set();

const HubEmpty: React.FC<{ hasStore: boolean; onImport: () => void }> = ({ hasStore, onImport }) => (
  <div className="k-hub-empty">
    <span className="k-empty-icon">{emptyArt(HdFileBox)}</span>
    <div className="k-hub-hints">
      <button type="button" className="k-hub-hint" onClick={() => { void newProject(); }}>New Project</button>
      <span />
      {hasStore && <>
        <button type="button" className="k-hub-hint" onClick={() => { void saveProject(); }}>Save the Open Project</button>
        <span className="k-hub-hint-keys"><span className="kbd-chip">Ctrl</span><span className="kbd-chip">S</span></span>
        <button type="button" className="k-hub-hint" onClick={onImport}>Import Files</button>
        <span />
        <span className="k-hub-hint">Drop files or a folder here</span>
        <span />
      </>}
    </div>
  </div>
);

const VersionOpen: React.FC<{ onOpen: (closeDetails: (after?: () => void) => void) => void }> = ({ onOpen }) => {
  const closeDetails = useModalClose();
  return (
    <button type="button" className="k-btn k-btn-secondary k-btn-sm" onClick={() => onOpen(closeDetails)}>
      <span className="k-btn-icon"><RestoreItem size={13} /></span>Open This Version
    </button>
  );
};

const HubDetails: React.FC<{ item: HubItem; onClose: () => void; onRestoreVersion: (index: number, closeDetails: (after?: () => void) => void) => void }> = ({ item, onClose, onRestoreVersion }) => {
  const word = item.kind === 'project' ? 'Project' : (TYPE_WORD[item.fileType ?? ''] ?? 'File');
  const versions = item.versions ?? [];
  return (
    <Modal title={item.name} icon={<Info size={18} />} size="sm" z={DIALOG_Z} onClose={onClose}>
      <dl className="k-hub-details" dir="auto">
        <dt>Kind</dt><dd>{word}{item.readOnly ? ', made with a newer version (read only)' : ''}</dd>
        <dt>Size</dt><dd>{sizeText(item.size)}</dd>
        <dt>Created</dt><dd>{fullDate(item.created)}</dd>
        <dt>{item.kind === 'project' ? 'Last saved' : 'Changed'}</dt><dd>{fullDate(item.modified)}</dd>
        {item.kind === 'project' && <><dt>Last opened</dt><dd>{fullDate(item.opened)}</dd></>}
        <dt>Last downloaded</dt><dd>{fullDate(item.downloaded)}</dd>
        {versions.length > 0 && <><dt>Made with</dt><dd>iStrongEngine {versions[versions.length - 1].appVersion}</dd></>}
      </dl>
      {item.kind === 'project' && versions.length > 1 && (
        <div className="k-hub-versions k-info-card" aria-label="Saved versions">
          {[...versions].map((v, i) => ({ v, i })).reverse().map(({ v, i }) => (
            <div key={v.sha} className="k-hub-version">
              <span className="k-hub-version-when">{i === versions.length - 1 ? 'Newest save, ' : ''}{fullDate(v.saved)}</span>
              <span className="text-[11px] text-[var(--text-tertiary)]">{sizeText(v.size)}</span>
              {i !== versions.length - 1 && <VersionOpen onOpen={c => onRestoreVersion(i, c)} />}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

