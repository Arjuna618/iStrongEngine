import { isTouchScreen } from '../../utils/device';
import { getPlayEntry } from '../../game/gameModeRegistry';
import { modeCards, entryCardConfig } from './modeCatalog';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { GameLogic } from '../../game/GameLogic';
import type { GameModeFile, MapConfig, LibraryItem, ExportFile, MultiAreaMapConfig } from '../../types';
import { MAZE_TYPE_CUSTOM } from '../../types';
import { IconButton, emptyArt, SearchEnd } from '../kit/kit';
import { ThemeSwitch } from '../kit/ThemeSwitch';
import { useSwapStage } from '../kit/motion';
import { SwapInPlace } from '../kit/Collapse';
import { useWindowFrame } from '../kit/focusScope';
import { useAfterFirstPaint } from '../kit/Deferred';
import { usePanelMemory } from '../kit/panelMemory';
import { useGameDark } from '../../utils/useGameTheme';
import { windowSize } from '../library/ContentLibrary';
import { ImportButton } from '../shared/ImportButton';
import { useEscapeOwner } from '../shared/escapeStack';
import { useBackdropClose } from '../shared/useBackdropClose';
import { usePortalMenuScale, useFitScale } from '../../utils/useMenuScale';
import { getEffectiveDPR } from '../../utils/zoomCompensation';
import { openContextMenu, type MenuEntry } from '../shell/ContextMenu';
import { findOtherDesign, PUMPKIN_ID, pumpkinRocksOf } from '../../utils/halloween';
import { hudMinimapDot, hudColors } from '../../utils/hudArras';
import { cardColors } from './mapCardColors';
import { bodyFill } from '../../utils/gameColors';
import { mmPaintMap, mmPaintWorld } from '../minimapPicture';
import { HUD_MM_BG_ALPHA } from '../../utils/hudArras';
import { mazeTypePickPatch } from '../shared/mazeTypePick';
import { mapCards, filterCards, layoutRows, mazeCardConfig, mazeCardIsLoaded, aspectOfConfig, MAP_LIB_BUILD_SEED, type MapCard, type MapFilter } from './mapCatalog';
import { rockCards, rockCardConfig, rockPicKey, rockCardIsUsed, rocksScattered, ROCK_PATTERNS, type RockPattern } from './rockCatalog';
import { mapPictures, requestMapPicture, loadBuiltMazePictures, builtMazePicturesFailed, releaseMapPictures, mazePicKey, minePicKey, modePicKey, type MapPic } from './mapPictures';
import { Search, X, Play, Trash2, Download, HdLibrary, HdMapFile, HdPaintBrush04, SearchX, EMPTY_LINE, type AppIcon } from '../ui/icons';
import type { OpenFlag } from '../library/LibraryWindowSlot';

const CLOSE_MS = 120;
const BAR_H = 36;
const ROW_H = 132;
const GAP = 12;
const PAD = 18;
const OVERSCAN = 2;
const CARD_FADE_WINDOW_MS = 250;

const TABS: { id: MapFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'maze', label: 'Maze Types' }, { id: 'mine', label: 'My Maps' }, { id: 'mode', label: 'Modes' }, { id: 'rock', label: 'Rocks' }];


function customKeyOf(c: MapConfig): string {
  const s = JSON.stringify([c.customMap ?? null, c.gridCells, c.gridCellsY ?? null, c.mapScale]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'custom:' + (h >>> 0).toString(36) + ':' + s.length;
}

const SKELETON_WAIT_MS = 150;
const CardPicture: React.FC<{ pic: MapPic | 'fail' | undefined; aspect: number; bw: number; bh: number; Icon: AppIcon; failTip?: string;
  dark: boolean; pumpkinDot: string; scale: number }> = React.memo(({ pic, aspect, bw, bh, Icon, failTip, dark, pumpkinDot, scale }) => {
  const big = Math.max(28, Math.min(48, Math.round(bh * 0.32)));
  const [held, setHeld] = useState<MapPic | 'fail' | undefined>(pic);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (pic !== undefined) { setHeld(pic); setWaited(false); return; }
    setWaited(false);
    const t = window.setTimeout(() => setWaited(true), SKELETON_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [pic]);
  const shown = pic !== undefined ? pic : !waited ? held : undefined;
  return (
    <SwapInPlace swapKey={shown === undefined ? 'wait' : shown === 'fail' ? 'fail' : shown} hold={false}>{shown === undefined
      ? <span className={`k-skel k-skel-sweep k-ml-shape${held === undefined ? ' k-skel-delay' : ''}`} style={{ width: bw, height: bh }} />
      : shown === 'fail'
        ? <span className="k-ml-shape k-ml-fail" style={{ width: bw, height: bh }} data-tip={failTip}><span className="k-hub-icon"><Icon size={big} strokeWidth={EMPTY_LINE} /></span></span>
        : <MapPicCanvas pic={shown} aspect={aspect} bw={bw} bh={bh} dark={dark} pumpkinDot={pumpkinDot} scale={scale} />}</SwapInPlace>
  );
});
CardPicture.displayName = 'CardPicture';

const MapPicCanvas: React.FC<{ pic: MapPic; aspect: number; bw: number; bh: number; dark: boolean; pumpkinDot: string; scale: number }> = ({ pic, aspect, bw, bh, dark, pumpkinDot, scale }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const k = getEffectiveDPR() * scale;
    const pw = Math.max(1, Math.round(bw * k)), ph = Math.max(1, Math.round(bh * k));
    if (cv.width !== pw) cv.width = pw;
    if (cv.height !== ph) cv.height = ph;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dotK = k * 0.6;
    const col = cardColors(dark);
    const a = aspect > 0 ? aspect : 1;
    let mw = pw, mh = pw / a;
    if (mh > ph) { mh = ph; mw = ph * a; }
    mw = Math.max(1, Math.round(mw)); mh = Math.max(1, Math.round(mh));
    const ox = Math.round((pw - mw) / 2), oy = Math.round((ph - mh) / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    if (mw < pw || mh < ph) {
      ctx.globalAlpha = HUD_MM_BG_ALPHA;
      ctx.fillStyle = (col ?? hudColors(dark)).mmBg;
      ctx.fillRect(0, 0, pw, ph);
      ctx.clearRect(ox, oy, mw, mh);
    }
    ctx.translate(ox, oy);
    if (pic.kind === 'one') mmPaintMap(ctx, dark, pic.map, mw, mh, dotK, 0, 0, pumpkinDot, col);
    else mmPaintWorld(ctx, dark, pic.areas, mw, mh, dotK, pic.minX, pic.minY, pic.w, pic.h, pumpkinDot, col);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }, [pic, aspect, bw, bh, dark, pumpkinDot, scale]);
  return <canvas ref={ref} className="k-ml-shape" style={{ width: bw, height: bh }} />;
};

export interface MapLibraryWindowProps {
  logic: GameLogic;
  config: MapConfig;
  library: readonly LibraryItem[];
  onLoadMaze: (type: number, seed: number) => void;
  onLoadCustom: () => void;
  onLoadFile: (item: LibraryItem) => void;
  onSaveFile: (file: ExportFile) => void;
  onRemove: (item: LibraryItem) => void;
  onImport: () => void;
  onFolderImported?: () => void;
  onSaveCurrent: () => void;
  onPickRock: (pattern: RockPattern) => void;
  onLoadMode: (key: string | null, item: LibraryItem | null) => void;
  startOnRocks?: boolean;
  pickOnly?: boolean;
  fillPick?: { tip: string; label: string };
  onClose: () => void;
}

export const MapLibraryWindow: React.FC<MapLibraryWindowProps> = (p) => {
  const [filter, setFilter] = usePanelMemory<MapFilter>('mapLibrary.filter', 'all', v => v === 'all' || v === 'maze' || v === 'mine' || v === 'mode');
  const [query, setQuery] = usePanelMemory<string>('mapLibrary.query', '', v => typeof v === 'string');
  const [onRocks, setOnRocks] = useState(() => !!p.startOnRocks);
  const view: MapFilter = onRocks ? 'rock' : filter;
  const [tabShown, setTabShown] = useState<MapFilter>(view);
  const pickTab = useCallback((f: MapFilter) => {
    setTabShown(f);
    if (f === 'rock') { setOnRocks(true); return; }
    setOnRocks(false); setFilter(f);
  }, [setFilter]);
  useEffect(() => { void loadBuiltMazePictures(); }, []);

  const isCustomNow = p.config.mazeType === MAZE_TYPE_CUSTOM;
  const customAspect = useMemo(() => aspectOfConfig({ ...p.config, ...(mazeTypePickPatch(p.config, MAZE_TYPE_CUSTOM) ?? {}) }), [p.config]);
  const cards = useMemo(() => p.pickOnly
    ? [...mapCards(p.library, customAspect).filter(c => c.type !== MAZE_TYPE_CUSTOM && (!p.fillPick || c.kind !== 'mine')), ...rockCards(p.config)]
    : [...mapCards(p.library, customAspect), ...modeCards(p.library), ...rockCards(p.config)], [p.library, customAspect, p.config, p.pickOnly]);
  const shown = useMemo(() => filterCards(cards, view, query), [cards, view, query]);
  const counts = useMemo(() => ({ all: filterCards(cards, 'all', query).length, maze: filterCards(cards, 'maze', query).length, mine: filterCards(cards, 'mine', query).length, rock: filterCards(cards, 'rock', query).length, mode: filterCards(cards, 'mode', query).length }), [cards, query]);
  const rockKeys = useMemo(() => {
    const k = {} as Record<RockPattern, string>;
    for (const pt of ROCK_PATTERNS) k[pt] = rockPicKey(p.config, pt);
    return k;
  }, [p.config]);
  const customKey = useMemo(() => customKeyOf(p.config), [p.config]);
  const keyOf = useCallback((c: MapCard): string => c.kind === 'mode' ? (c.item ? minePicKey(c.item.id, c.item.loadedAt ?? 0) : modePicKey(c.modeKey ?? '')) : c.kind === 'rock' ? rockKeys[c.pattern ?? 'random']
    : c.kind === 'mine' && c.item ? minePicKey(c.item.id, c.item.loadedAt ?? 0)
    : c.type === MAZE_TYPE_CUSTOM ? customKey : mazePicKey(c.type, MAP_LIB_BUILD_SEED), [rockKeys, customKey]);
  const ask = useCallback((c: MapCard, key: string) => {
    if (c.kind === 'mode') {
      if (c.item) {
        const f = c.item.fileData.data as unknown as GameModeFile;
        if (f.areas && f.areas.areas.length >= 2) requestMapPicture(key, { kind: 'multi', mac: f.areas });
        else requestMapPicture(key, { kind: 'single', config: f.map });
      } else if (builtMazePicturesFailed()) {
        const e = c.modeKey ? getPlayEntry(c.modeKey) : null;
        const cfg = e ? entryCardConfig(e) : null;
        if (cfg) requestMapPicture(key, { kind: 'single', config: cfg });
      }
    } else if (c.kind === 'rock') {
      requestMapPicture(key, { kind: 'single', config: rockCardConfig(p.config, c.pattern ?? 'random') });
    } else if (c.kind === 'mine' && c.item) {
      const f = c.item.fileData;
      if (f.type === 'MultiAreaMap') requestMapPicture(key, { kind: 'multi', mac: f.data as MultiAreaMapConfig });
      else requestMapPicture(key, { kind: 'single', config: f.data as MapConfig });
    } else if (c.type === MAZE_TYPE_CUSTOM) {
      const patch = mazeTypePickPatch(p.config, MAZE_TYPE_CUSTOM);
      requestMapPicture(key, { kind: 'single', config: { ...p.config, ...(patch ?? {}) } });
    } else if (builtMazePicturesFailed()) {
      requestMapPicture(key, { kind: 'single', config: mazeCardConfig(c.type, MAP_LIB_BUILD_SEED) });
    }
  }, [p.config]);
  const isOn = useCallback((c: MapCard) => p.pickOnly ? false : c.kind === 'rock' ? rockCardIsUsed(p.config, c.pattern ?? 'random')
    : c.kind === 'maze' && (c.type === MAZE_TYPE_CUSTOM ? isCustomNow : mazeCardIsLoaded(p.config, c.type, MAP_LIB_BUILD_SEED)), [isCustomNow, p.config]);
  const tipOf = useCallback((c: MapCard): string => {
    if (p.pickOnly) return `${c.name}. ${p.fillPick ? p.fillPick.tip : 'Click to add it to the list.'}`;
    if (c.kind === 'rock') {
      if (isCustomNow) return `${c.name}. Click to scatter rocks in this pattern. Your Custom Editor map is kept for when you open it again.`;
      if (!rocksScattered(p.config) || p.config.enableMaze) return `${c.name}. Click to turn the maze off and scatter rocks in this pattern.`;
      return `${c.name}. Click to use this pattern on your map.`;
    }
    if (c.kind === 'mode') return `${c.name}. Click to make this the mode you edit: its map, its Map Events.`;
    if (c.kind === 'mine') return `${c.name}. Click to load it.`;
    if (c.type === MAZE_TYPE_CUSTOM) return 'Custom Editor: an empty grid to build on (your own map if you made one). Click to open it.';
    return `${c.name}. Click to load it.`;
  }, [isCustomNow, p.config, p.pickOnly]);

  const load = useCallback((c: MapCard) => {
    if (c.kind === 'mode') p.onLoadMode(c.modeKey ?? null, c.item);
    else if (c.kind === 'rock') p.onPickRock(c.pattern ?? 'random');
    else if (c.kind === 'mine' && c.item) p.onLoadFile(c.item);
    else if (c.type === MAZE_TYPE_CUSTOM) p.onLoadCustom();
    else p.onLoadMaze(c.type, MAP_LIB_BUILD_SEED);
  }, [p]);
  const menu = useCallback((e: React.MouseEvent, c: MapCard, pick: (c: MapCard) => void) => {
    const entries: MenuEntry[] = [{ label: p.pickOnly ? (p.fillPick ? p.fillPick.label : 'Add To List') : c.kind === 'rock' ? 'Use Pattern' : c.kind === 'mode' ? 'Use Mode' : 'Load Map', icon: Play, onSelect: () => pick(c) }];
    if (!p.pickOnly && (c.kind === 'mine' || c.kind === 'mode') && c.item) {
      const it = c.item;
      entries.push({ label: 'Save as File', icon: Download, onSelect: () => p.onSaveFile(it.fileData) });
      if (it.source !== 'data-library') entries.push('sep', { label: 'Remove from Library', icon: Trash2, onSelect: () => p.onRemove(it) });
    }
    openContextMenu(e, entries);
  }, [p]);

  const mineEmpty = view === 'mine' && query === '' && counts.mine === 0;
  return (
    <CardsWindow logic={p.logic} title="Map Library" searchLabel="Search maps" query={query} setQuery={setQuery}
      buttons={p.pickOnly ? null : <>
        <ImportButton logic={p.logic} onImportFile={p.onImport} onFolderImported={() => p.onFolderImported?.()} />
        <button type="button" className="k-btn k-btn-secondary k-btn-md" onClick={p.onSaveCurrent} data-tip="Save the map you are editing as a file">
          <span className="k-btn-icon"><Download size={14} /></span><span className="truncate">Save Current Map</span>
        </button>
      </>}
      tabs={(
        <div className="k-win-head shrink-0 flex items-center px-5 pb-3 border-b border-[var(--alpha-divider)]">
          <div className="k-lib-tabs" role="tablist" aria-label="Show">
            {TABS.filter(t => !p.pickOnly || t.id !== 'mode').map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={t.id === tabShown} onClick={() => pickTab(t.id)}
                className={`k-lib-tab${t.id === tabShown ? ' k-lib-tab-on' : ''}`}>
                {t.label}
                <span className="k-lib-count">{counts[t.id]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      group={view} cards={shown}
      empty={mineEmpty ? (
        <div className="text-center max-w-[340px]">
          <span className="flex justify-center text-[var(--text-primary)]">{emptyArt(HdLibrary)}</span>
          <div className="sr-only">No maps of your own yet. Import a map file to keep it here.</div>
          <button type="button" onClick={p.onImport} className="k-btn k-btn-secondary k-btn-md mt-4">Import a Map File</button>
        </div>
      ) : undefined}
      keyOf={keyOf} ask={ask} isOn={isOn} tipOf={tipOf} onPick={load} onMenu={menu} onClose={p.onClose} />
  );
};

export interface CardsWindowProps {
  logic: GameLogic;
  title: string;
  searchLabel: string;
  query: string;
  setQuery: (q: string) => void;
  buttons?: React.ReactNode;
  tabs?: React.ReactNode;
  group: string;
  cards: readonly MapCard[];
  empty?: React.ReactNode;
  keyOf: (c: MapCard) => string;
  ask: (c: MapCard, key: string) => void;
  isOn: (c: MapCard) => boolean;
  tipOf: (c: MapCard) => string;
  onPick: (c: MapCard) => void;
  onMenu?: (e: React.MouseEvent, c: MapCard, pick: (c: MapCard) => void) => void;
  onClose: () => void;
}

export const CardsWindow: React.FC<CardsWindowProps> = (p) => {
  const dark = useGameDark();
  const portalScale = usePortalMenuScale();
  const scale = portalScale || 1;
  const cardRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimer = useRef(0);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);
  const onCloseRef = useRef(p.onClose);
  onCloseRef.current = p.onClose;
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const a = document.activeElement;
    if (a instanceof HTMLElement && cardRef.current && cardRef.current.contains(a)) a.blur();
    setClosing(true);
    closeTimer.current = window.setTimeout(() => { closeTimer.current = 0; onCloseRef.current(); }, CLOSE_MS);
  }, []);
  useLayoutEffect(() => () => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && cardRef.current && cardRef.current.contains(a)) {
      a.blur();
      queueMicrotask(() => document.body.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    }
  }, []);
  const [size, setSize] = useState(windowSize);
  useEffect(() => {
    let raf = 0;
    const on = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; setSize(prev => { const n = windowSize(); return n.w === prev.w && n.h === prev.h ? prev : n; }); }); };
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const fit = useFitScale(cardRef, portalScale, true);
  const bodyReady = useAfterFirstPaint();
  useEscapeOwner(close);
  const scrimRef = useRef<HTMLDivElement>(null);
  useWindowFrame({ scrim: scrimRef, card: cardRef, closing });
  const backdrop = useBackdropClose(close);
  const onKeyDown = (ev: React.KeyboardEvent) => {
    const inField = (ev.target as HTMLElement).closest('input,textarea') !== null;
    if ((ev.key === 'k' && (ev.ctrlKey || ev.metaKey)) || (ev.key === '/' && !inField)) { ev.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
  };

  const { cards: shown, query, setQuery, keyOf, ask, isOn, tipOf } = p;
  const picVer = useSyncExternalStore(mapPictures.subscribe, mapPictures.version, mapPictures.version);
  useEffect(() => () => releaseMapPictures(), []);

  const pkDesign = findOtherDesign(p.logic.state.otherLibrary, PUMPKIN_ID);
  const pumpkinDot = pkDesign !== null ? hudMinimapDot(bodyFill(pkDesign.body.color, pkDesign.body.colorMap), dark) : '';
  const wearsPumpkins = (c: MapCard): boolean => {
    if (c.kind !== 'mode') return false;
    if (c.item) return pumpkinRocksOf((c.item.fileData.data as unknown as GameModeFile | null)?.config);
    const e = c.modeKey ? getPlayEntry(c.modeKey) : null;
    return e !== null && e !== undefined && pumpkinRocksOf(e);
  };

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [vw, setVw] = useState(0);
  const [view, setView] = useState({ top: 0, h: 600 });
  useLayoutEffect(() => {
    const body = scrollEl;
    if (!body) return;
    const ro = new ResizeObserver(es => {
      const wNow = es[0].contentRect.width;
      setVw(prev => (Math.abs(prev - wNow) <= 4 ? prev : wNow));
      setView(v => (v.h === body.clientHeight ? v : { top: body.scrollTop, h: body.clientHeight }));
    });
    ro.observe(body);
    let raf = 0;
    const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; setView({ top: body.scrollTop, h: body.clientHeight }); }); };
    body.addEventListener('scroll', onScroll, { passive: true });
    return () => { ro.disconnect(); body.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [scrollEl]);
  const setKey = p.group + '\u0001' + shown.map(c => c.key).join('|');
  const setStage = useSwapStage(setKey);
  const keptSet = useRef<React.ReactNode>(null);
  const shownGroup = setStage.shown.split('\u0001')[0];
  useLayoutEffect(() => { if (scrollEl) scrollEl.scrollTop = 0; }, [shownGroup]);
  const liveKey = `${setStage.shown}\u0002${bodyReady ? 1 : 0}\u0002${vw > 0 ? 1 : 0}`;
  const live = useRef({ key: '', at: 0 });
  if (live.current.key !== liveKey) live.current = { key: liveKey, at: performance.now() };
  const setLiveAt = live.current.at;
  const rows = useMemo(() => layoutRows(shown.map(c => c.aspect), Math.max(0, vw - PAD * 2), ROW_H, GAP), [shown, vw]);
  const tops = useMemo(() => { let y = PAD; return rows.map(r => { const t = y; y += BAR_H + r.h + GAP; return t; }); }, [rows]);
  const totalH = rows.length > 0 ? tops[rows.length - 1] + BAR_H + rows[rows.length - 1].h + PAD : 0;
  const rowAt = (y: number) => { let lo = 0, hi = rows.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (tops[m] + BAR_H + rows[m].h < y) lo = m + 1; else hi = m; } return lo; };
  const first = rows.length ? Math.max(0, rowAt(view.top) - OVERSCAN) : 0;
  const last = rows.length ? Math.min(rows.length - 1, rowAt(view.top + view.h) + OVERSCAN) : -1;

  useEffect(() => {
    for (let r = last; r >= first; r--) {
      const row = rows[r];
      if (!row) continue;
      for (let i = row.end - 1; i >= row.start; i--) {
        const c = shown[i];
        const key = keyOf(c);
        if (mapPictures.get(key) === undefined) ask(c, key);
      }
    }
  }, [first, last, rows, shown, keyOf, ask, picVer]);

  const { onPick, onMenu } = p;
  const pick = useCallback((c: MapCard) => { onPick(c); close(); }, [onPick, close]);
  const menu = useCallback((e: React.MouseEvent, c: MapCard) => { if (onMenu) onMenu(e, c, pick); }, [onMenu, pick]);

  const card = (
    <div ref={scrimRef} className={`modal-scrim z-[70] animate-fadeIn ${closing ? 'pointer-events-none' : ''}`} {...backdrop}>
      <div style={{ zoom: fit }} onClick={e => e.stopPropagation()}>
        <div ref={cardRef} tabIndex={-1} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label={p.title}
          onMouseDown={(ev) => { const tg = ev.target as HTMLElement; if (!tg.closest('input,button,textarea,select') && cardRef.current && document.activeElement !== cardRef.current) cardRef.current.focus({ preventScroll: true }); }}
          className="modal-card k-lib-window k-hub-window flex flex-col outline-none animate-scaleUp"
          style={{ width: size.w, height: size.h }}>
          <div className={`k-win-head shrink-0 flex items-center gap-4 pl-5 pr-3 h-[60px]${p.tabs ? '' : ' border-b border-[var(--alpha-divider)]'}`}>
            <div className="flex items-center gap-2.5 min-w-0 w-[240px] shrink-0">
              <HdLibrary size={20} absoluteStrokeWidth className="text-[var(--text-primary)] shrink-0" />
              <h2 className="k-modal-title min-w-0 truncate">{p.title}</h2>
            </div>
            <div className="relative flex-1 max-w-[520px] mx-auto">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--k-search-icon)] pointer-events-none" />
              <input ref={searchRef} type="text" value={query} onChange={e => setQuery(e.target.value)} dir="auto" autoFocus={!isTouchScreen()}
                onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }}
                placeholder={p.searchLabel} aria-label={p.searchLabel}
                className="k-text-in k-search-bar w-full h-9 pl-9 pr-16 rounded-lg text-[13px] bg-[var(--k-search-bg)] border border-[var(--alpha-card-border)] shadow-[var(--shadow-input)] text-[var(--text-primary)] placeholder:text-[var(--k-placeholder)] outline-none" />
              <SearchEnd query={query} onClear={() => { setQuery(''); searchRef.current?.focus(); }} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {p.buttons}
              <ThemeSwitch />
              <IconButton label="Close" onClick={close}><X size={18} /></IconButton>
            </div>
          </div>

          {p.tabs}

          <div ref={setScrollEl} className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden popup-scrollbar k-lib-content">
            <div className={setStage.swapClass} inert={setStage.inert || undefined}>{(() => {
            const live = setStage.shown === setKey;
            if (!live) return keptSet.current;
            const set = (<>
            {bodyReady && shown.length === 0 && vw > 0 && (
              <div className="absolute inset-0 grid place-items-center">
                {p.empty ?? (
                  <div className="text-center max-w-[340px]">
                    <span className="flex justify-center text-[var(--text-primary)]">{emptyArt(SearchX)}</span>
                    <div className="sr-only">Nothing matches.</div>
                    {query && <button type="button" onClick={() => setQuery('')} className="k-btn k-btn-secondary k-btn-md mt-4">Clear Search</button>}
                  </div>
                )}
              </div>
            )}
            {bodyReady && (
              <div className="k-ml-grid" style={{ height: totalH }}>
                {rows.slice(first, last + 1).map((row, ri) => {
                  const r = first + ri;
                  let x = PAD;
                  const y = tops[r];
                  return row.widths.map((w, j) => {
                    const c = shown[row.start + j];
                    const left = x;
                    x += w + GAP;
                    const pic = mapPictures.get(keyOf(c));
                    return (
                      <MapCardView key={c.key} card={c} x={left} y={y} w={w} h={row.h} on={isOn(c)} tip={tipOf(c)} pic={pic} dark={dark} pumpkinDot={wearsPumpkins(c) ? pumpkinDot : ''} scale={scale}
                        setLiveAt={setLiveAt} onLoad={pick} onMenu={menu} />
                    );
                  });
                })}
              </div>
            )}
            </>);
            keptSet.current = set;
            return set;
            })()}</div>
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(card, document.body);
};

export const MapLibrarySlot: React.FC<{ flag: OpenFlag; rockFlag: OpenFlag } & Omit<MapLibraryWindowProps, 'onClose' | 'startOnRocks'>> = ({ flag, rockFlag, ...rest }) => {
  const open = useSyncExternalStore(flag.subscribe, flag.get, flag.get);
  const rocks = useSyncExternalStore(rockFlag.subscribe, rockFlag.get, rockFlag.get);
  if (!open && !rocks) return null;
  return <MapLibraryWindow {...rest} startOnRocks={rocks} onClose={() => { flag.set(false); rockFlag.set(false); }} />;
};

const MapCardView: React.FC<{
  card: MapCard; x: number; y: number; w: number; h: number; on: boolean; tip: string; pic: MapPic | 'fail' | undefined; dark: boolean; pumpkinDot: string; scale: number;
  setLiveAt: number;
  onLoad: (c: MapCard) => void; onMenu: (e: React.MouseEvent, c: MapCard) => void;
}> = React.memo(({ card, x, y, w, h, on, tip, pic, dark, pumpkinDot, scale, setLiveAt, onLoad, onMenu }) => {
  const [fadeIn] = useState(() => performance.now() - setLiveAt < CARD_FADE_WINDOW_MS);
  const Small = card.kind === 'maze' && card.type === MAZE_TYPE_CUSTOM ? HdPaintBrush04 : HdMapFile;
  return (
    <div role="button" tabIndex={0} data-tip={tip} aria-selected={on}
      className={fadeIn ? 'group k-ml-card k-ml-card-in select-none' : 'group k-ml-card select-none'}
      style={{ width: w, height: BAR_H + h, transform: `translate(${x}px, ${y}px)` }}
      onClick={() => onLoad(card)}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onLoad(card); } }}
      onContextMenu={e => onMenu(e, card)}>
      <div className="absolute inset-0 rounded-xl border bg-[var(--k-box-bg)] shadow-[var(--k-hub-card-shadow)] border-[var(--alpha-card-border)]" />
      <div className="absolute inset-0 rounded-xl shadow-[var(--shadow-raise)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none" />
      <div className="k-hub-bar">
        <Small size={14} className="shrink-0" />
        <span className="k-hub-name">{card.name}</span>
      </div>
      <div className="absolute overflow-hidden rounded-b-[11px]" style={{ left: 1, right: 1, top: BAR_H, height: h - 1 }}>
        <CardPicture pic={pic} aspect={card.aspect} bw={Math.max(4, w - 2)} bh={Math.max(4, h - 1)} Icon={Small}
          failTip={card.kind === 'maze' && card.type === MAZE_TYPE_CUSTOM ? undefined : 'This map could not be drawn'}
          dark={dark} pumpkinDot={pumpkinDot} scale={scale} />
      </div>
      <div className={`absolute inset-0 rounded-xl k-pick-ring pointer-events-none transition-opacity duration-150 ${on ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
});
MapCardView.displayName = 'MapCardView';
