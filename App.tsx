import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { TankEditorUI } from './components/TankEditorUI';
import { FoodShapeEditorUI } from './components/FoodShapeEditorUI';
import { TurretManagerUI } from './components/TurretManagerUI';
import { SandboxSettingsUI } from './components/SandboxSettingsUI';
import { ImportExportUI } from './components/ImportExportUI';
import { EnemyToolUI } from './components/EnemyToolUI';
import { LeaderboardUI } from './components/LeaderboardUI';
import { GameLogic, PLAYER_NAME_MAX } from './game/GameLogic';
import { installTravel } from './game/travelTrip';
installTravel(GameLogic as unknown as { travelHooks: unknown });
import { INITIAL_GAME_STATE } from './types';
import { EditPlayerStatsPopup } from './components/EditPlayerStatsPopup';
import { DebugVisibilityPopup } from './components/DebugVisibilityPopup';
import { ShapeSpawnerPopup } from './components/ShapeSpawnerPopup';
import { LoadingScreen } from './components/LoadingScreen';
import { DeathMenu } from './components/DeathMenu';
import { ArrasDeathScreen } from './components/ArrasDeathScreen';
import { DEATH_ARRAS } from './utils/deathArras';
import { FullscreenButton } from './components/mobile/FullscreenButton';
import { TypeSheet } from './components/kit/TypeSheet';
import { DataRegistry } from './game/DataRegistry';
import type { DataLoadProgress } from './game/DataRegistry';
import { MapDesignerUI } from './components/MapDesignerUI';
import { MapEditorToolbar } from './components/MapEditorToolbar';
import { CanvasCornerTools } from './components/shell/CanvasCornerTools';
import { ScreenSizeGuard, ScreenSizeLock, useScreenFit, ensureLockMessage } from './components/shell/ScreenSizeGuard';
import { ScreenCurtain, useScreenCurtain } from './components/shell/ScreenCurtain';
import { useMenuStage } from './components/kit/motion';
import { useLeave, installSpamGuard, noteMotion } from './components/kit/presence';
import { SwapText } from './components/kit/Collapse';
import { useWindowFrame } from './components/kit/focusScope';
import { cancelMapEditInteraction } from './game/MapEditor';
import { GameModeDesignerUI } from './components/GameModeDesignerUI';
import { MevEvents, Box, Dna, Settings, FolderDown, Check, Bot, UserCog, LogOut, X, Shapes, Map, Pause, Play as PlayIcon, Bug, ShieldPlus, Ghost, Sun, Moon, Joystick, House, BookText, Undo2, Eye, GameEngine, ArrowLeft, Megaphone, SourceCode } from './components/ui/icons';
import { checkGpuAcceleration } from '@/utils/gpuDetect';
import type { GpuCheckResult } from '@/utils/gpuDetect';
import { GpuWarningModal } from '@/components/GpuWarningModal';
import { NumberInput } from './components/shared/uiHelpers';
import { useBackdropClose } from './components/shared/useBackdropClose';
import appLogo from './components/ui/media/logo5.webp';
import { ToastProvider, useToast, toast } from './components/ui/Toast';
import { TipToastHost } from './components/ui/TipToast';
import { DocsPopup } from './components/docs/DocsPopup';
import { SOURCE_CODE_ON } from './components/source/sourceSwitch';
const SourceCodeWindow = SOURCE_CODE_ON ? React.lazy(() => import('./components/source/SourceCodeWindow')) : null;
import { MapEventsSlot } from './components/mapEvents/MapEventsWindow';
import { openMapEvents, setEngineTestDoor } from './components/mapEvents/mapEventsStore';
import { MapEventsMonitor } from './components/mapEvents/MapEventsMonitor';
import { UpdateLogPopup } from './components/updates/UpdateLogPopup';
import { VersionChip } from './components/updates/VersionChip';
import { CURRENT_VERSION, CURRENT_VERSION_DATE } from './components/updates/version';
import { hasUnseenUpdates } from './components/updates/updatesRegistry';
import { fireTip } from './utils/tips';
import { registerEditorNoticeHost } from './utils/editorNotice';
import { installHistoryRecorder, pokeDesignHistory, flushDesignHistory } from './components/shell/historyRecorder';
import { ContextMenuHost, installContextMenuGuard } from './components/shell/ContextMenu';
import { installTextFade, setTextFadePlaying } from './components/shell/textFade';
import { MainMenu } from './components/menu/MainMenu';
import { menuScenes } from './components/menuScene/sceneClient';
import { PlayMenu } from './components/menu/PlayMenu';
import { PLAY_MENU_IMAGE_URLS, MODE_OPTIONS, engineModeKey, engineModeLabel } from './game/gameModeRegistry';
import { prepareModeCardPictures } from './components/menu/modeCardPictures';
import { PHOTO_MODE, setPhotoHide } from './game/photoMode';
import { setPhotoGameTheme, gameDark, subscribeGameTheme } from './utils/gameTheme';
import type { GameModeConfig } from './types';

import { getStoredTheme, startTheme, toggleTheme } from './utils/theme';
import { getZoomCompensation, onZoomChange, blockBrowserZoomInputs } from './utils/zoomCompensation';
import { useMenuScale, useChromeScale, useFitScale } from './utils/useMenuScale';
import { useEditorShortcuts } from './components/shared/useEditorShortcuts';
import { type Tool, ENGINE_TOOLS, engineTool, toolRailLabel, toolTitle } from './components/shell/engineTools';
import { Button, IconButton, Group, SliderRow, PanelFold, headerIcon } from './components/kit/kit';
import { PanelSkeleton, usePresence, useFadePresence } from './components/kit/Deferred';
import { SnapshotSkeleton, useSkeletonCapture, captureSkeleton, snapshotOf } from './components/kit/SkeletonSnapshot';
import { toolStore, useActiveTool, useIsActiveTool } from './components/shell/toolStore';
import { prewarmCatalog } from './components/library/catalog';
import { prewarmPreviewGL } from './components/shared/tankPreviewGL';
import { HdJoker, GpuWarning } from './components/ui/icons';
import { Reveal, usePanelSwap } from './components/kit/Collapse';
import { GameMenuCard, MenuCard, MenuDoor, MenuSwitch, KeyChip } from './components/shell/GameMenu';
import { HelpTooltip } from './components/shared/HelpTooltip';
import { Modal } from './components/kit/Modal';
import { isPhoneDevice, isTouchScreen } from './utils/device';

const DVH_OK = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('height', '1dvh');
const rootVh = (): string => (DVH_OK && isTouchScreen() ? 'dvh' : 'vh');
import { SMALL_FIX } from './game/smallFixSwitch';
import { startProjectSystem, projectSystem } from './components/project/projectSystem';
import { PanelScope } from './components/kit/panelMemory';
import { useProjectKeys } from './components/project/useProjectKeys';
import { ProjectDialogs } from './components/project/dialogs';
import { ProjectNotices } from './components/project/ProjectNotices';
import { ProjectButton } from './components/project/ProjectButton';
import { hubWindow } from './components/project/hubWindow';
import { AppMenuBar } from './components/shell/AppMenuBar';
import { KeyboardShortcutsPopup, AboutPopup } from './components/shell/HelpPopups';
import { LegalWindow, LEGAL_HASH, legalPageOfHash, type LegalPage } from './components/legal/LegalWindow';
import { termsAgreed, agreeToTerms, useTermsAgreed } from './components/legal/termsConsent';
import { ProjectHubSlot } from './components/project/ProjectHub';
import { dragWatch } from './components/kit/dragWatch';

startTheme();


function toolSlot<P extends object>(Panel: React.ComponentType<P>, scope: string) {
  return React.memo(function ToolSlot(props: P & { refresh: number }) {
    const { refresh: _refresh, ...rest } = props;
    return <PanelScope.Provider value={scope}><Panel {...(rest as unknown as P)} /></PanelScope.Provider>;
  });
}
const TankEditorSlot = toolSlot(TankEditorUI, 'tool:tank');
const FoodShapeEditorSlot = toolSlot(FoodShapeEditorUI, 'tool:shape');
const TurretManagerSlot = toolSlot(TurretManagerUI, 'tool:turret');
const SandboxSettingsSlot = toolSlot(SandboxSettingsUI, 'tool:settings');
const ImportExportSlot = toolSlot(ImportExportUI, 'tool:import-export');
const EnemyToolSlot = toolSlot(EnemyToolUI, 'tool:enemy');
const MapDesignerSlot = toolSlot(MapDesignerUI, 'tool:map-designer');
const GameModeDesignerSlot = toolSlot(GameModeDesignerUI, 'tool:game-mode');
const TOOL_SWAP_MS = 280;

function measureHidden(id: string, el: HTMLElement): void {
  el.classList.add('k-tool-layer-measure');
  try { captureSkeleton(id, el, undefined, true); }
  finally {
    el.classList.remove('k-tool-layer-measure');
    el.style.transition = 'none'; void getComputedStyle(el).contentVisibility; el.style.transition = '';
  }
}

const LAYER_FOOT = 3;
const LAYER_GAP = LAYER_FOOT;
const RAIL_W = 60;
const TOP_BAR_H = 55;

const RAIL_ICON_STROKE = 1.125;

const EngineToolPanels = React.memo(function EngineToolPanels({
  logic, chromeScale, isTestMode, panelsOutOfLayout, engineScreen,
  panelRefresh, onUpdate, dataRegistry, showTool,
}: {
  logic: GameLogic | null;
  chromeScale: number;
  isTestMode: boolean;
  panelsOutOfLayout: boolean;
  engineScreen: boolean;
  panelRefresh: number;
  onUpdate: () => void;
  dataRegistry: DataRegistry;
  showTool: (tool: Tool) => void;
}) {
  const activeTool = useActiveTool();
  const tool = engineTool(activeTool);
  const ToolIcon = tool.Icon;
  const panelTitle = toolTitle(activeTool, logic?.state);
  const [shownTool, setShownTool] = useState(activeTool);
  const lastOtherName = useRef('');
  if (logic?.state.viewingOther?.name) lastOtherName.current = logic.state.viewingOther.name;
  useEffect(() => {
    if (shownTool === activeTool) return;
    let raf = requestAnimationFrame(() => { raf = 0; setShownTool(activeTool); });
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [activeTool, shownTool]);
  const layerOn = (t: Tool) => shownTool === t;
  const switching = activeTool !== shownTool;
  const switchStart = useRef(0);
  useLayoutEffect(() => {
    if (!switching) return;
    switchStart.current = performance.now();
    noteMotion(TOOL_SWAP_MS);
  }, [switching]);
  const skelShown = !switching && switchStart.current > 0 && performance.now() - switchStart.current > 150;
  const skel = usePresence(switching, skelShown ? 120 : 0);
  const frozenKeys = useRef<Partial<Record<Tool, number>>>({});
  const live = (tool: Tool) => {
    if (shownTool === tool) { frozenKeys.current[tool] = panelRefresh; return panelRefresh; }
    return frozenKeys.current[tool] ?? -1;
  };
  const turretLive = shownTool === 'turret' || !!logic?.state.autoSubTurretEditMode;
  if (turretLive) frozenKeys.current.turret = panelRefresh;
  const turretRefresh = turretLive ? panelRefresh : (frozenKeys.current.turret ?? -1);
  const entityKind: 'tank' | 'shape' | 'other' = logic?.state.canvasEntityKind === 'shape' ? 'shape' : logic?.state.canvasEntityKind === 'other' ? 'other' : 'tank';
  const kindSwap = usePanelSwap(entityKind);
  const skelId = (t: Tool) => 'tool:' + t + (t === 'tank' ? ':' + entityKind : '');
  const layerEls = useRef<Partial<Record<Tool, HTMLDivElement | null>>>({});
  const shownToolRef = useRef(shownTool); shownToolRef.current = shownTool;
  const shownLayer = useMemo(() => ({ get current() { return layerEls.current[shownToolRef.current] ?? null; } }), []);
  useSkeletonCapture(engineScreen && !isTestMode ? skelId(shownTool) : null, shownLayer, !switching);
  const layerRefs = useMemo(() => {
    const m = {} as Record<Tool, (el: HTMLDivElement | null) => void>;
    for (const t of ['tank', 'turret', 'settings', 'import-export', 'enemy', 'map-designer', 'game-mode'] as Tool[]) m[t] = (el) => { layerEls.current[t] = el; };
    return m;
  }, []);
  const genRaw = !!logic?.isMapGenerating && engineScreen && !isTestMode;
  const genWas = useRef(false);
  if (genRaw && !genWas.current) { const t = shownToolRef.current, el = layerEls.current[t]; if (el) captureSkeleton(skelId(t), el); }
  genWas.current = genRaw;
  const genSkel = useFadePresence(genRaw, 700);
  const skelIdRef = useRef(skelId); skelIdRef.current = skelId;
  const entityKindRef = useRef(entityKind); entityKindRef.current = entityKind;
  useEffect(() => {
    if (!engineScreen || isTestMode) return;
    const ric: (cb: () => void) => number = typeof requestIdleCallback === 'function'
      ? (cb) => requestIdleCallback(cb, { timeout: 3000 }) : (cb) => window.setTimeout(cb, 200);
    const unric = (h: number) => { if (typeof cancelIdleCallback === 'function') cancelIdleCallback(h); else window.clearTimeout(h); };
    const queue: Tool[] = ['turret', 'map-designer', 'game-mode', 'enemy', 'settings', 'import-export', 'tank'];
    let h = 0;
    const step = () => {
      h = 0;
      const t = queue.shift();
      if (!t) return;
      const id = skelIdRef.current(t), el = layerEls.current[t];
      const kindOk = t !== 'tank' || !!el?.querySelector(`:scope > [data-kind="${entityKindRef.current}"]:not([hidden])`);
      if (el && kindOk && t !== shownToolRef.current && !snapshotOf(id)) measureHidden(id, el);
      if (queue.length) h = ric(step);
    };
    h = ric(step);
    return () => { if (h) unric(h); };
  }, [engineScreen, isTestMode]);
  const [, bumpSkel] = useState(0);
  useLayoutEffect(() => {
    if (!switching || isTestMode) return;
    const id = skelIdRef.current(activeTool), el = layerEls.current[activeTool];
    const kindOk = activeTool !== 'tank' || !!el?.querySelector(`:scope > [data-kind="${entityKindRef.current}"]:not([hidden])`);
    if (!el || !kindOk || snapshotOf(id)) return;
    measureHidden(id, el);
    if (snapshotOf(id)) bumpSkel(n => n + 1);
  }, [switching, activeTool, isTestMode]);

  return (
        <aside
            className={`w-80 panel-gradient z-20 flex flex-col transition-transform duration-300 absolute top-0 ${isTestMode ? 'translate-x-full' : 'translate-x-0'}`}
            style={{ zoom: chromeScale, contentVisibility: panelsOutOfLayout ? 'hidden' : 'visible', right: isTestMode ? 0 : LAYER_GAP, bottom: isTestMode ? 0 : LAYER_FOOT }}
        >
            <div className="h-12 tool-headline flex items-center gap-2.5 px-4 shrink-0">
                <ToolIcon size={18.29} strokeWidth={1.576} absoluteStrokeWidth className="text-[var(--text-primary)] shrink-0" />
                <h2 key={panelTitle} className="k-panel-title truncate k-title-swap">{panelTitle}</h2>
            </div>

            <div className="flex-1 relative overflow-hidden z-[2]">
              <PanelFold on>
                <div ref={layerRefs['tank']} data-tool-layer="tank" className={`absolute inset-0 k-tool-layer ${layerOn('tank') ? 'k-tool-layer-on opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-2 z-0'}${shownTool === 'tank' ? '' : ' pointer-events-none'}`}>
                     <div data-kind="tank" className={`absolute inset-0 ${kindSwap.classOf('tank')}`} hidden={kindSwap.hiddenOf('tank')}>
                         <TankEditorSlot refresh={live('tank')} logic={logic} onUpdate={onUpdate} className="h-full" showTool={showTool} />
                     </div>
                     <div data-kind="other" className={`absolute inset-0 p-4 ${kindSwap.classOf('other')}`} hidden={kindSwap.hiddenOf('other')}>
                         <Group title={logic?.state.viewingOther?.name ?? lastOtherName.current} icon={headerIcon(HdJoker)}>
                             <p className="k-row-desc">
                                 It has no settings yet. Your tank is kept exactly as it was.
                             </p>
                             <Button block size="sm" icon={<ArrowLeft size={14} />} onClick={() => { logic?.exitOtherViewing(); onUpdate(); }}>
                                 Back to Tank
                             </Button>
                         </Group>
                     </div>
                     <div data-kind="shape" className={`absolute inset-0 ${kindSwap.classOf('shape')}`} hidden={kindSwap.hiddenOf('shape')}>
                         <FoodShapeEditorSlot refresh={live('tank')} logic={logic} onUpdate={onUpdate} className="h-full" />
                     </div>
                </div>

                <div ref={layerRefs['turret']} data-tool-layer="turret" className={`absolute inset-0 k-tool-layer ${layerOn('turret') ? 'k-tool-layer-on opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-2 z-0'}${shownTool === 'turret' ? '' : ' pointer-events-none'}`}>
                     <TurretManagerSlot refresh={turretRefresh} logic={logic} onUpdate={onUpdate} className="h-full"
                         panelVisible={engineScreen && shownTool === 'turret' && !isTestMode} showTool={showTool} />
                </div>

                <div ref={layerRefs['settings']} data-tool-layer="settings" className={`absolute inset-0 k-tool-layer ${layerOn('settings') ? 'k-tool-layer-on opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-2 z-0'}${shownTool === 'settings' ? '' : ' pointer-events-none'}`}>
                     <SandboxSettingsSlot refresh={live('settings')} logic={logic} onUpdate={onUpdate} className="h-full" />
                </div>

                <div ref={layerRefs['import-export']} data-tool-layer="import-export" className={`absolute inset-0 k-tool-layer ${layerOn('import-export') ? 'k-tool-layer-on opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-2 z-0'}${shownTool === 'import-export' ? '' : ' pointer-events-none'}`}>
                     <ImportExportSlot refresh={live('import-export')} logic={logic} dataRegistry={dataRegistry} className="h-full" />
                </div>

                <div ref={layerRefs['enemy']} data-tool-layer="enemy" className={`absolute inset-0 k-tool-layer ${layerOn('enemy') ? 'k-tool-layer-on opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-2 z-0'}${shownTool === 'enemy' ? '' : ' pointer-events-none'}`}>
                     <EnemyToolSlot refresh={live('enemy')} logic={logic} className="h-full" />
                </div>

                <div ref={layerRefs['map-designer']} data-tool-layer="map-designer" className={`absolute inset-0 k-tool-layer ${layerOn('map-designer') ? 'k-tool-layer-on opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-2 z-0'}${shownTool === 'map-designer' ? '' : ' pointer-events-none'}`}>
                     <MapDesignerSlot refresh={live('map-designer')} logic={logic} dataRegistry={dataRegistry} className="h-full" />
                </div>

                {skel.mounted && (
                  <div className={`absolute inset-0 z-20 panel-gradient k-skel-layer k-skel-delay${skel.leaving ? ' k-skel-leave pointer-events-none' : ''}`} aria-busy="true">
                    <SnapshotSkeleton id={skelId(activeTool)} fallback={<div className="p-4"><PanelSkeleton /></div>} />
                  </div>
                )}

                {genSkel.mounted && (
                  <div className="absolute inset-0 z-[21] panel-gradient" style={genSkel.style} aria-busy="true">
                    <SnapshotSkeleton id={skelId(shownTool)} fallback={<div className="p-4"><PanelSkeleton /></div>} />
                  </div>
                )}

                <div ref={layerRefs['game-mode']} data-tool-layer="game-mode" className={`absolute inset-0 k-tool-layer ${layerOn('game-mode') ? 'k-tool-layer-on opacity-100 translate-y-0 z-10' : 'opacity-0 translate-y-2 z-0'}${shownTool === 'game-mode' ? '' : ' pointer-events-none'}`}>
                     <GameModeDesignerSlot refresh={live('game-mode')} logic={logic} onUpdate={onUpdate} className="h-full" />
                </div>
              </PanelFold>
            </div>
        </aside>
  );
});

type AppScreen = 'menu' | 'play' | 'engine';

function preloadMenuImages(timeoutMs: number): Promise<void> {
  return new Promise(resolve => {
    let remaining = PLAY_MENU_IMAGE_URLS.length;
    if (remaining === 0) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, timeoutMs);
    const settle = () => {
      if (--remaining === 0) {
        clearTimeout(timer);
        resolve();
      }
    };
    for (const url of PLAY_MENU_IMAGE_URLS) {
      const img = new Image();
      img.onload = settle;
      img.onerror = settle;
      img.src = url;
    }
  });
}

function ToastSink({ sink }: { sink: React.MutableRefObject<((variant: 'success' | 'error' | 'info', message: string) => void) | null> }) {
  const { showToast } = useToast();
  useEffect(() => { sink.current = showToast; return () => { sink.current = null; }; }, [sink, showToast]);
  useEffect(() => registerEditorNoticeHost((message) => showToast('info', message)), [showToast]);
  return null;
}

export default function App() {
  const [logic, setLogic] = useState<GameLogic | null>(null);
  const [tick, setTick] = useState(0);
  const [showDocs, setShowDocs] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [showPhoneEngineNotice, setShowPhoneEngineNotice] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [updatesUnseen, setUpdatesUnseen] = useState(() => hasUnseenUpdates(CURRENT_VERSION_DATE));
  const closeUpdates = useCallback(() => { setShowUpdates(false); setUpdatesUnseen(hasUnseenUpdates(CURRENT_VERSION_DATE)); }, []);

  const [screen, setScreen] = useState<AppScreen>(() =>
    window.location.search.includes('__harness') ? 'engine' : 'menu'
  );
  useEffect(() => { menuScenes.setScreen(screen); }, [screen]);
  const [showMenuConfirm, setShowMenuConfirm] = useState(false);
  const [playLaunching, setPlayLaunching] = useState(false);

  const [debugLevelInput, setDebugLevelInput] = useState('');
  const [debugPointsInput, setDebugPointsInput] = useState('');
  const [showEditPlayerStats, setShowEditPlayerStats] = useState(false);
  const [showDebugVisibility, setShowDebugVisibility] = useState(false);
  const [showMapMonitor, setShowMapMonitor] = useState(false);
  const [showShapeSpawner, setShowShapeSpawner] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showMenuSettings, setShowMenuSettings] = useState(false);
  const [isDark, setIsDark] = useState(getStoredTheme() === 'dark');
  const [gpuCheck, setGpuCheck] = useState<GpuCheckResult | null>(null);
  const [showGpuModal, setShowGpuModal] = useState(false);

  const appRootRef = useRef<HTMLDivElement>(null);
  useEffect(() => onZoomChange(() => {
    const el = appRootRef.current;
    if (!el) return;
    const comp = getZoomCompensation();
    el.style.zoom = String(comp);
    el.style.width = `${100 / comp}vw`;
    el.style.height = `${100 / comp}${rootVh()}`;
  }), []);

  useEffect(() => blockBrowserZoomInputs(), []);
  useEffect(() => installSpamGuard(), []);

  const menuScale = useMenuScale();
  const chromeScale = useChromeScale();
  useEffect(() => {
    if (logic) { logic.chromeScale = chromeScale; logic.topBarOverCanvas = TOP_BAR_H; }
  }, [logic, chromeScale]);

  const handleThemeToggle = useCallback(() => {
    const newTheme = toggleTheme();
    setIsDark(newTheme === 'dark');
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    const mo = new MutationObserver(() => setIsDark(el.classList.contains('dark')));
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  const closeDebugMenu = useCallback(() => {
    if (logic) logic.updateState({ isDebugMenuOpen: false });
  }, [logic]);
  const debugBackdropProps = useBackdropClose(closeDebugMenu);

  const closePauseMenu = useCallback(() => {
    if (logic) logic.setPaused(false);
  }, [logic]);
  const pauseBackdropProps = useBackdropClose(closePauseMenu);

  const closeMenuConfirm = useCallback(() => setShowMenuConfirm(false), []);

  const handleEscapeToMenu = useCallback(() => {
    setShowMenuConfirm(v => !v);
  }, []);
  const openMenuConfirm = useCallback(() => setShowMenuConfirm(true), []);
  const openHub = useCallback(() => hubWindow.set(true), []);
  const openDocs = useCallback(() => setShowDocs(true), []);
  const openUpdates = useCallback(() => afterTerms(() => setShowUpdates(true)), []);
  const openShortcuts = useCallback(() => setShowShortcuts(true), []);
  const openAbout = useCallback(() => setShowAbout(true), []);
  const [legal, setLegal] = useState<{ page: LegalPage; ask: boolean; then?: () => void } | null>(null);
  const openLegal = useCallback((page: LegalPage) => setLegal({ page, ask: !termsAgreed() }), []);
  const openTerms = useCallback(() => openLegal('terms'), [openLegal]);
  const afterTerms = useCallback((then: () => void) => {
    if (termsAgreed()) { then(); return; }
    setLegal({ page: 'terms', ask: true, then });
  }, []);
  const agreedNow = useTermsAgreed();

  const curtainGo = useRef<(switchScreen: () => void) => void>((f) => f());
  const launchPlayMode = useCallback((config: GameModeConfig) => {
    if (!logic || playLaunching) return;
    setPlayLaunching(true);
    logic.beginPlaySession(config)
      .then(() => curtainGo.current(() => { setScreen('engine'); setPlayLaunching(false); }))
      .catch(err => { console.error('Play session start failed:', err); setPlayLaunching(false); });
  }, [logic, playLaunching]);

  const handlePlayMode = useCallback((config: GameModeConfig) => {
    if (!logic || playLaunching) return;
    launchPlayMode(config);
  }, [logic, playLaunching, launchPlayMode]);
  useEffect(() => {
    if (!PHOTO_MODE || !logic) return;
    const w = window as unknown as { __photoHide?: (on: boolean) => void; __photoTheme?: (theme: 'light' | 'dark' | null) => void; __photoMode?: () => { key: string; title: string }; __photoDebug?: () => boolean };
    w.__photoHide = (on: boolean) => setPhotoHide(on);
    w.__photoDebug = () => {
      if (!logic.state.isTestMode) return false;
      if (logic.playSessionActive) { logic.admin.photoConductor(); return logic.admin.conductor && logic.state.debugMode === true; }
      if (!logic.state.debugMode) logic.updateState({ debugMode: true });
      return logic.state.debugMode === true;
    };
    w.__photoTheme = (theme: 'light' | 'dark' | null) => setPhotoGameTheme(theme);
    w.__photoMode = () => {
      const g = logic.state.gameModeConfig;
      const key = engineModeKey(g.mode, !!g.growth, g.preset, g.armsRace, g.world, g.teams, g.enableSpawnZones, g.overlay);
      return { key, title: engineModeLabel(key) };
    };
  }, [logic]);

  const [dataLoadProgress, setDataLoadProgress] = useState<DataLoadProgress>({ phase: 'manifest', loaded: 0, total: 0 });
  const [showLoading, setShowLoading] = useState(true);
  const showLoadingRef = useRef(true);
  showLoadingRef.current = showLoading;
  useEffect(() => {
    if (showLoading) return;
    const fromHash = () => {
      const page = legalPageOfHash(window.location.hash);
      if (page) setLegal(cur => (cur ? cur : { page, ask: !termsAgreed() }));
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [showLoading]);
  const legalHashTo = useCallback((page: LegalPage | null) => {
    try {
      const want = page ? LEGAL_HASH[page] : '';
      if (window.location.hash === want) return;
      history.replaceState(history.state, '', window.location.pathname + window.location.search + want);
    } catch { }
  }, []);
  useEffect(() => { if (legal) legalHashTo(legal.page); }, [legal, legalHashTo]);
  const [loadingMounted, setLoadingMounted] = useState(true);
  const unmountLoadingScreen = useCallback(() => setLoadingMounted(false), []);
  useEffect(() => {
    if (!logic || showLoading) return;
    prewarmCatalog(() => ({ tankLibrary: logic.state.tankLibrary, otherLibrary: logic.state.otherLibrary, projectileDesigns: logic.state.projectileDesigns, rev: logic.libraryRev }));
    prewarmPreviewGL();
  }, [logic, showLoading]);
  const loadStartTimeRef = useRef(Date.now());
  const [dataRegistryOnce] = useState(() => new DataRegistry());
  const dataRegistryRef = useRef<DataRegistry>(dataRegistryOnce);
  const retryDataLoadRef = useRef<(() => void) | null>(null);
  const retryDataLoad = useCallback(() => retryDataLoadRef.current?.(), []);
  const projectBootRef = useRef<Promise<unknown> | null>(null);
  const [restoring, setRestoring] = useState(false);

  const handleInit = useCallback((gameLogic: GameLogic) => {
    const gpuResult = checkGpuAcceleration();
    document.documentElement.classList.toggle('no-glass', gpuResult.status !== 'hardware');
    if (gpuResult.status !== 'hardware') {
      setGpuCheck(gpuResult);
      setShowGpuModal(true);
    }

    setLogic(gameLogic);
    gameLogic.isTurretPlacementEnabled = false;
    gameLogic.isTankToolActive = toolStore.get() === 'tank';

    gameLogic.onStateChange = () => {
       setTick(t => t + 1);
       pokeDesignHistory();
       projectSystem()?.poke();
    };

    const sysReady = startProjectSystem(gameLogic, CURRENT_VERSION);
    sysReady.then(sys => { sys.onTool = (t) => setToolRef.current(t); sys.installPageHooks(); });

    const registry = dataRegistryRef.current;
    const menuImagesReady = preloadMenuImages(5000);
    menuImagesReady.then(() => performance.mark('app:menu-images'));
    const startDataLoad = () => registry.loadFromManifest(gameLogic, (progress) => {
      setDataLoadProgress(progress);
      if (progress.phase === 'done') {
        if (!projectBootRef.current) {
          setRestoring(true);
          projectBootRef.current = sysReady.then(s => s.boot()).catch(e => console.error('[project] boot failed', e)).finally(() => setRestoring(false));
        }
        const others = gameLogic.state.otherLibrary;
        const cardsReady = Promise.race([prepareModeCardPictures(gameDark(), others), new Promise<void>(r => setTimeout(r, 3000))]);
        cardsReady.then(() => setTimeout(() => { void prepareModeCardPictures(!gameDark(), gameLogic.state.otherLibrary); }, 1500));
        subscribeGameTheme(() => { void prepareModeCardPictures(gameDark(), gameLogic.state.otherLibrary); });
        Promise.all([menuImagesReady, projectBootRef.current, cardsReady]).then(() => {
          const elapsed = Date.now() - loadStartTimeRef.current;
          const remaining = Math.max(0, 300 - elapsed);
          setTimeout(() => {
            setShowLoading(false);
            import('./game/harness').then(({ readHarnessURLParams, runHarnessMatchup }) => {
              const opts = readHarnessURLParams();
              if (opts) {
                (globalThis as any).__dataRegistry = registry;
                runHarnessMatchup(gameLogic, opts).catch((err) => {
                  console.error('[HARNESS] runHarnessMatchup failed:', err);
                });
              }
            });
          }, remaining);
        });
      }
    });
    retryDataLoadRef.current = startDataLoad;
    startDataLoad();
  }, []);

  const forceUpdate = useCallback(() => setTick(t => t + 1), []);

  const toastRef = useRef<((variant: 'success' | 'error' | 'info', message: string) => void) | null>(null);
  const handleTestTank = useCallback(() => {
    if (!logic) return;
    if (logic.playWouldStartAsProjectile()) {
      toastRef.current?.('info', 'You cannot play as a projectile. Load a tank first.');
      return;
    }
    flushDesignHistory();
    { const sure = logic.mapEventsProblems().filter(p => !p.warn).length;
      if (sure > 0) toast('info', `${sure} ${sure === 1 ? 'Problem' : 'Problems'} in this map's Map Events: what it names will not run.`, { label: 'See', run: () => openMapEvents(logic.state.multiAreaConfig.enableMultiArea ? logic.state.multiAreaConfig.activeAreaId : '', 'problems') }); }
    logic.enterTestMode();
    setTick(t => t + 1);
  }, [logic]);

  useEffect(() => { setEngineTestDoor(handleTestTank); return () => setEngineTestDoor(null); }, [handleTestTank]);
  const setTool = useCallback((tool: Tool) => {
    const prevTool = toolStore.get();
    const wasMapDesigner = prevTool === 'map-designer';
    if (tool !== prevTool) {
      if (tool === 'enemy') fireTip('enemyToolOpened');
      else if (tool === 'import-export') fireTip('importExportOpened');
      else if (tool === 'settings') fireTip('settingsOpened');
    }
    toolStore.set(tool);
    if (logic) {
      logic.isTurretPlacementEnabled = (tool === 'turret');
      logic.isTankToolActive = (tool === 'tank');
      logic.isMapDesignerActive = (tool === 'map-designer');
      if (tool !== 'map-designer') { logic.endMapEditStroke(); cancelMapEditInteraction(logic.mapEditor); }
      if (tool === 'map-designer' && !logic.state.isTestMode) {
        const keepCamera = logic.projectTakeCameraHold();
        const epoch = logic.projectEpoch;
        requestAnimationFrame(() => {
          if (toolStore.get() !== 'map-designer' || logic.state.isTestMode) return;
          logic.regenerateMapAsync()
            .then((ok) => { if (!keepCamera && ok !== false && logic.projectEpoch === epoch) logic.fitMapToView(); })
            .catch(err => console.error('Map regen failed:', err));
          if (!keepCamera) logic.fitMapToView();
        });
      }
      if (wasMapDesigner && tool !== 'map-designer' && !logic.state.isTestMode) {
        const home = logic.getEditorHomePosition();
        logic.tankPos.set(home.x, home.y);
        logic.zoom = 1;
      }
    }
  }, [logic]);

  const setToolRef = useRef(setTool);
  setToolRef.current = setTool;
  const showTool = useCallback((tool: Tool) => setToolRef.current(tool), []);

  const isTestMode = logic?.state.isTestMode || false;
  const isDebugMenuOpen = logic?.state.isDebugMenuOpen || false;

  const curtain = useScreenCurtain();
  curtainGo.current = curtain.go;
  const screenFit = useScreenFit(chromeScale);
  const sizeGate = screen === 'engine' && !isTestMode && screenFit.tooSmall;
  const mapGlass = useFadePresence(!!logic?.isMapGenerating && screen === 'engine' && !isTestMode && !sizeGate, 700);
  const [sizeLocked, setSizeLocked] = useState(false);
  const engineHeadRef = useRef<HTMLElement>(null);
  const engineWorkRef = useRef<HTMLDivElement>(null);
  const engineParts = useMemo(() => [engineHeadRef, engineWorkRef] as React.RefObject<HTMLElement | null>[], []);
  const lockEngine = useCallback(() => { setSizeLocked(true); ensureLockMessage(); }, []);

  const [panelsOutOfLayout, setPanelsOutOfLayout] = useState(false);
  useEffect(() => {
    if (!isTestMode) {
      setPanelsOutOfLayout(false);
      return;
    }
    const id = window.setTimeout(() => setPanelsOutOfLayout(true), 320);
    return () => window.clearTimeout(id);
  }, [isTestMode]);

  const deathMenuOpen = isTestMode && !!logic?.state.playerDead;
  const pauseMenuOpen = isTestMode && !!logic?.state.paused && !isDebugMenuOpen && !deathMenuOpen;
  const debugMenuOpen = isTestMode && !!logic?.state.paused && isDebugMenuOpen && !deathMenuOpen;
  const stage = useMenuStage<'pause' | 'debug'>(debugMenuOpen ? 'debug' : pauseMenuOpen ? 'pause' : null);
  const deathStage = useMenuStage<'death'>(deathMenuOpen ? 'death' : null);
  const childOverMenu = isTestMode && (showEditPlayerStats || showDebugVisibility || showMapMonitor || showShapeSpawner || showAppSettings);
  const stageScrimClass = (stage.fresh ? 'animate-fadeIn' : '') + (stage.leaving ? ' pointer-events-none' : '');
  const stageCardClass = 'animate-scaleUp' + (stage.leaving || childOverMenu ? ' pointer-events-none' : '');
  useEffect(() => {
    const on = childOverMenu && stage.shown !== null;
    document.documentElement.classList.toggle('k-stacked-menu', on);
    return () => { document.documentElement.classList.remove('k-stacked-menu'); };
  }, [childOverMenu, stage.shown]);
  const menuConfirmOpen = screen === 'engine' && !isTestMode && showMenuConfirm;
  const pauseCardRef = useRef<HTMLDivElement>(null);
  const debugCardRef = useRef<HTMLDivElement>(null);
  const deathCardRef = useRef<HTMLDivElement>(null);
  const stageScrimRef = useRef<HTMLDivElement>(null);
  useLeave(stageScrimRef, stage.leaving && stage.next === null, 'fade');
  useLeave(pauseCardRef, stage.leaving || childOverMenu, 'pop');
  useLeave(debugCardRef, stage.leaving || childOverMenu, 'pop');
  const pauseFitScale = useFitScale(pauseCardRef, menuScale, stage.shown === 'pause');
  const debugFitScale = useFitScale(debugCardRef, menuScale, stage.shown === 'debug');
  const deathFitScale = useFitScale(deathCardRef, menuScale, SMALL_FIX.R744 !== 0 ? deathStage.shown === 'death' : deathMenuOpen);
  const stageTouch = isTouchScreen();
  const stageStyle = (fit: number): React.CSSProperties => (stageTouch ? { zoom: menuScale } : { transform: `scale(${fit})`, transformOrigin: 'center center', willChange: 'transform' });

  useEffect(() => { if (!isTestMode || !logic?.state.paused) setShowAppSettings(false); }, [isTestMode, logic?.state.paused]);
  const handleRespawn = useCallback(() => { logic?.respawnPlayer(); }, [logic]);
  const handleDeathExit = useCallback(() => { curtain.go(() => { logic?.exitTestMode(); }); }, [logic, curtain]);
  useEffect(() => {
    if (!logic) return;
    const go = () => { curtain.go(() => { logic.exitTestMode(); }); };
    logic.onRequestExit = go;
    return () => { if (logic.onRequestExit === go) logic.onRequestExit = null; };
  }, [logic, curtain]);
  const handlePlayerNameChange = useCallback((name: string) => { logic?.setPlayerName(name); }, [logic]);

  useEffect(() => {
    if (logic && !isTestMode && logic.playSessionActive && !logic.tripping) {
      logic.endPlaySession();
      setScreen('play');
    }
  }, [logic, isTestMode]);

  const historyScreenRef = useRef(screen);
  historyScreenRef.current = screen;
  useEffect(() => {
    if (!logic) return;
    return installHistoryRecorder(logic, () => historyScreenRef.current === 'engine' && !showLoadingRef.current);
  }, [logic]);
  const ctxTestRef = useRef(isTestMode);
  ctxTestRef.current = isTestMode;
  useEffect(() => installContextMenuGuard(() => historyScreenRef.current === 'engine' && !ctxTestRef.current && !showLoadingRef.current), []);
  useEffect(() => installTextFade(), []);
  useEffect(() => { setTextFadePlaying(isTestMode); }, [isTestMode]);
  useEffect(() => { pokeDesignHistory(); }, [screen]);

  useEditorShortcuts({
    logic, setTool, isTestMode,
    enabled: screen === 'engine' && !showDocs && !showUpdates && !showSource && !sizeGate,
    onEscapeToMenu: handleEscapeToMenu,
  });
  useProjectKeys(screen === 'engine' && !isTestMode && !sizeGate);
  const strayRef = useRef(false); strayRef.current = screen === 'engine' && !isTestMode;
  useEffect(() => {
    if (screen !== 'engine' || isTestMode || sizeGate) return;
    let seen = true;
    try { seen = localStorage.getItem('istrong-projects-tip-seen') === '1'; } catch { seen = true; }
    if (seen) return;
    const t = window.setTimeout(() => {
      fireTip('projectsIntroduced');
      try { localStorage.setItem('istrong-projects-tip-seen', '1'); } catch { }
    }, 1500);
    return () => window.clearTimeout(t);
  }, [screen, isTestMode, sizeGate]);
  useEffect(() => {
    dragWatch.install();
    dragWatch.setOnStray(() => { if (strayRef.current) toastRef.current?.('info', 'Open the Project Hub to add files.'); });
    return () => dragWatch.setOnStray(null);
  }, []);

  const panelRefresh = isTestMode ? -1 : tick;

  if (sizeLocked) return <ScreenSizeLock />;

  return (
    <ToastProvider>
    <ToastSink sink={toastRef} />
    <ContextMenuHost />
    <div ref={appRootRef} data-app-root="" className="flex flex-col bg-[var(--surface-primary)] text-[var(--text-primary)] font-sans overflow-hidden" style={{ zoom: getZoomCompensation(), width: `${100 / getZoomCompensation()}vw`, height: `${100 / getZoomCompensation()}${rootVh()}` }}>

      {loadingMounted && (
        <LoadingScreen progress={dataLoadProgress} visible={showLoading} onRetry={retryDataLoad} onHidden={unmountLoadingScreen} restoring={restoring} />
      )}

      {screen === 'menu' && (
        <MainMenu
          onPlay={() => afterTerms(() => curtain.go(() => setScreen('play')))}
          onEngine={() => afterTerms(() => { if (isPhoneDevice()) { setShowPhoneEngineNotice(true); return; } curtain.go(() => setScreen('engine')); })}
          isDark={isDark}
          onOpenUpdates={() => afterTerms(() => setShowUpdates(true))}
          onOpenSource={SOURCE_CODE_ON ? () => afterTerms(() => setShowSource(true)) : undefined}
          onOpenTerms={() => openLegal('terms')}
          onOpenSettings={() => setShowMenuSettings(true)}
          updatesUnseen={updatesUnseen}
          ready={!showLoading}
        />
      )}
      {screen === 'play' && (
        <PlayMenu
          playerName={logic?.state.playerName ?? ''}
          onPlayerNameChange={handlePlayerNameChange}
          playerNameMax={PLAYER_NAME_MAX}
          onBack={() => curtain.go(() => setScreen('menu'))}
          onPlayMode={handlePlayMode}
          onSandbox={() => { if (isPhoneDevice()) { setShowPhoneEngineNotice(true); return; } curtain.go(() => { setTool('game-mode'); setScreen('engine'); }); }}
          launching={playLaunching}
          isDark={isDark}
          keysSuspended={showPhoneEngineNotice}
        />
      )}

      {menuConfirmOpen && (
        <Modal title="Main Menu" icon={<House size={18} />} size="sm" z={40} onClose={closeMenuConfirm}
          footer={close => <>
            <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={() => close()}>Stay In Editor</button>
            <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => close(() => curtain.go(() => { setShowMenuConfirm(false); setScreen('menu'); }))}>Back To Main Menu</button>
          </>}>
          <p className="k-modal-text">Go back to the main menu? Your work is kept, so you can come back to it later.</p>
        </Modal>
      )}

      {showGpuModal && gpuCheck && (
        <GpuWarningModal
          status={gpuCheck.status as 'software' | 'unavailable'}
          renderer={gpuCheck.renderer}
          onDismiss={() => setShowGpuModal(false)}
        />
      )}

      {screen === 'engine' && !isTestMode && <TipToastHost />}

      {showDocs && <DocsPopup onClose={() => setShowDocs(false)} />}

      {showSource && agreedNow && SourceCodeWindow && (
        <React.Suspense fallback={null}><SourceCodeWindow onClose={() => setShowSource(false)} /></React.Suspense>
      )}

      {screen === 'engine' && <MapEventsSlot logic={logic} />} { }

      <ProjectHubSlot logic={logic} setTool={setTool} />
      <ProjectDialogs />
      <ProjectNotices active={screen === 'engine' && !isTestMode && !sizeGate} />
      {showShortcuts && <KeyboardShortcutsPopup onClose={() => setShowShortcuts(false)} />}
      {showAbout && <AboutPopup onClose={() => setShowAbout(false)} onOpenLegal={openLegal} />}
      {legal && <LegalWindow page={legal.page} ask={legal.ask} onPage={legalHashTo} onClose={() => { legalHashTo(null); setLegal(null); }}
        onAgree={() => { const then = legal.then; legalHashTo(null); agreeToTerms(); setLegal(null); then?.(); }} />}

      {sizeGate && <ScreenSizeGuard fit={screenFit} engineParts={engineParts} onTamper={lockEngine} />}

      <ScreenCurtain phase={curtain.phase} />

      <FullscreenButton onMenu={screen === 'menu' && !isTestMode} />

      {isTouchScreen() && <TypeSheet />} { }

      {showMenuSettings && logic && (
        <Modal title="App Settings" icon={<Settings size={18} strokeWidth={1.5} absoluteStrokeWidth />} size="md" bodyClassName="k-modal-body-flush"
          onClose={() => setShowMenuSettings(false)}>
          <SandboxSettingsUI logic={logic} onUpdate={forceUpdate} />
        </Modal>
      )}

      {showPhoneEngineNotice && (
        <Modal title="Game Engine" icon={<GameEngine size={18} strokeWidth={1.5} absoluteStrokeWidth />} size="sm" onClose={() => setShowPhoneEngineNotice(false)}
          footer={close => <Button variant="primary" onClick={() => close()}>OK</Button>}>
          <p className="k-modal-text">The Game Engine needs a bigger screen. Open iStrongEngine on a tablet or a computer to build tanks, maps and game modes. You can play every game mode here.</p>
        </Modal>
      )}

      {showUpdates && agreedNow && <UpdateLogPopup onClose={closeUpdates} />}

      <header ref={engineHeadRef} inert={sizeGate || screen !== 'engine' || isTestMode || undefined} style={sizeGate ? { zoom: chromeScale, visibility: 'hidden' } : { zoom: chromeScale }} className={`k-bar k-chrome h-[55px] bg-[var(--k-chrome)] grid grid-cols-[1fr_auto_1fr] items-center gap-4 z-30 relative transition-transform duration-300 ${isTestMode ? '-translate-y-full -mt-[55px]' : 'translate-y-0 mt-0'}`}>
        <div className="flex items-center min-w-0">
            <h1 className="sr-only">iStrongEngine</h1>
            <button type="button" className="k-tb-logo" onClick={openAbout} aria-label="About iStrongEngine">
              <img src={appLogo} alt="" className="k-tb-logo-img" draggable={false} />
            </button>
            <AppMenuBar logic={logic} enabled={screen === 'engine' && !isTestMode && !sizeGate} setTool={setTool}
              openHub={openHub} openDocs={openDocs} openUpdates={openUpdates} openShortcuts={openShortcuts} openAbout={openAbout} openTerms={openTerms}
              isDark={isDark} toggleTheme={handleThemeToggle} onMainMenu={openMenuConfirm} />
        </div>
        <div className="flex justify-center min-w-0">
            <ProjectButton active={screen === 'engine' && !isTestMode && !sizeGate} />
        </div>
        <div className="flex items-center gap-1 justify-end min-w-0 pr-3">
          <span className="mr-1 shrink-0">
            <VersionChip
              version={CURRENT_VERSION}
              icon={<Megaphone size={13} />}
              unseen={updatesUnseen}
              onClick={() => afterTerms(() => setShowUpdates(true))}
              title="Beta version: view the update log"
            />
          </span>
          {gpuCheck && (
            <IconButton label={gpuCheck.status === 'software' ? 'GPU problem: software rendering' : 'GPU problem: no WebGL'} onClick={() => setShowGpuModal(true)}>
              <GpuWarning size={18} strokeWidth={1.5} absoluteStrokeWidth />
            </IconButton>
          )}
          <IconButton label="Documentation" onClick={() => setShowDocs(true)}>
            <BookText size={18} strokeWidth={1.5} absoluteStrokeWidth />
          </IconButton>
          {SOURCE_CODE_ON && (
            <IconButton label="Source Code" onClick={() => afterTerms(() => setShowSource(true))}>
              <SourceCode size={18} strokeWidth={1.5} absoluteStrokeWidth />
            </IconButton>
          )}
          <IconButton label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={handleThemeToggle}>
            {isDark ? <Moon size={18} strokeWidth={1.5} absoluteStrokeWidth /> : <Sun size={18} strokeWidth={1.5} absoluteStrokeWidth />}
          </IconButton>
          <span className="w-px h-6 bg-[var(--alpha-divider)] mx-2" />
          <Button variant="primary" size="md"
            icon={<PlayIcon size={16} strokeWidth={1.5} absoluteStrokeWidth fill="currentColor" />}
            onClick={handleTestTank}
            disabled={!!logic?.isMapGenerating}
            title="Test Tank">
            <SwapText>{logic?.isMapGenerating ? 'Generating map' : `Play ${engineModeLabel(engineModeKey(logic?.state.gameModeConfig.mode ?? 'sandbox', !!logic?.state.gameModeConfig.growth, logic?.state.gameModeConfig.preset, logic?.state.gameModeConfig.armsRace, logic?.state.gameModeConfig.world, logic?.state.gameModeConfig.teams, logic?.state.gameModeConfig.enableSpawnZones, logic?.state.gameModeConfig.overlay))}`}</SwapText>
          </Button>
        </div>
      </header>

      <div ref={engineWorkRef} inert={sizeGate || screen !== 'engine' || undefined} style={sizeGate ? { visibility: 'hidden' } : undefined} className="flex flex-1 relative overflow-x-clip">

        <div aria-hidden className={`k-frame-glass${isTestMode || sizeGate ? ' k-frame-glass-off' : ''}`}
            style={{ top: isTestMode ? 0 : -TOP_BAR_H * chromeScale,
              ['--k-fg-t' as string]: (isTestMode || sizeGate ? 0 : TOP_BAR_H * chromeScale) + 'px',
              ['--k-fg-l' as string]: (isTestMode || sizeGate ? 0 : Math.floor(RAIL_W * chromeScale)) + 'px',
              ['--k-fg-r' as string]: (isTestMode || sizeGate ? 0 : Math.round(LAYER_GAP * chromeScale)) + 'px',
              ['--k-fg-b' as string]: (isTestMode || sizeGate ? 0 : Math.round(LAYER_FOOT * chromeScale)) + 'px',
              ['--k-fg-rad' as string]: (isTestMode || sizeGate ? 0 : Math.round(10 * chromeScale)) + 'px' } as React.CSSProperties} />

        <aside
            className={`toolbar-rail k-chrome w-[60px] bg-[var(--k-chrome)] z-20 transition-transform duration-300 absolute left-0 h-full ${isTestMode ? '-translate-x-full' : 'translate-x-0'}`}
            style={{ zoom: chromeScale }}
            inert={isTestMode || undefined}
        >
          <div className="rail-stack">
            {ENGINE_TOOLS.filter(t => t.group !== 'app').map((t, i, arr) => (
              <React.Fragment key={t.id}>
                {i > 0 && arr[i - 1].group !== t.group && <div className="rail-divider" />}
                <ToolbarIcon
                    toolId={t.id}
                    onClick={() => setTool(t.id)}
                    icon={<t.Icon size={20} strokeWidth={RAIL_ICON_STROKE} absoluteStrokeWidth />}
                    label={toolRailLabel(t.id, logic?.state)}
                />
              </React.Fragment>
            ))}
            <div className="rail-spacer" />
            <div className="rail-divider" />
            {ENGINE_TOOLS.filter(t => t.group === 'app').map(t => (
              <React.Fragment key={t.id}>
                <ToolbarIcon
                    toolId={t.id}
                    onClick={() => setTool(t.id)}
                    icon={<t.Icon size={20} strokeWidth={RAIL_ICON_STROKE} absoluteStrokeWidth />}
                    label={toolRailLabel(t.id, logic?.state)}
                />
              </React.Fragment>
            ))}
            <ToolbarIcon
                active={false}
                onClick={() => curtain.go(() => setScreen('menu'))}
                icon={<House size={20} strokeWidth={RAIL_ICON_STROKE} absoluteStrokeWidth />}
                label="Main Menu"
            />
          </div>
        </aside>

        <main className="flex-1 relative bg-[var(--surface-canvas)] shadow-inner dark:shadow-none">
             {mapGlass.mounted && (
               <div aria-hidden className="k-mapgen-glass" style={{ ...mapGlass.style, left: RAIL_W * chromeScale, right: (320 + LAYER_GAP) * chromeScale }} />
             )}
             <div className="absolute left-0 right-0 bottom-0" style={{ top: isTestMode ? 0 : -TOP_BAR_H * chromeScale }}>
               <GameCanvas gameState={INITIAL_GAME_STATE} onInit={handleInit} suspended={(screen !== 'engine' && !isTestMode) || sizeGate} />
             </div>

             {logic && screen === 'engine' && (
                 <CanvasCornerTools logic={logic} rightInset={(320 + LAYER_GAP) * chromeScale} chromeScale={chromeScale} />
             )}
             {logic && (
                 <MapEditorToolbar
                     logic={logic}
                     leftInset={RAIL_W * chromeScale}
                     rightInset={(320 + LAYER_GAP) * chromeScale}
                     chromeScale={chromeScale}
                 />
             )}

             <LeaderboardUI logic={logic} />

             {deathStage.shown === 'death' && logic && DEATH_ARRAS !== 0 && (
                  <ArrasDeathScreen
                     leaving={deathStage.leaving}
                     logic={logic}
                     onRespawn={handleRespawn}
                     onExit={handleDeathExit}
                     fromPlayMenu={logic.playSessionActive}
                  />
             )}
             {deathStage.shown === 'death' && logic && DEATH_ARRAS === 0 && (
                  <DeathMenu
                     leaving={deathStage.leaving}
                     logic={logic}
                     isDark={isDark}
                     fitScale={deathFitScale}
                     cardRef={deathCardRef}
                     onRespawn={handleRespawn}
                     onExit={handleDeathExit}
                     fromPlayMenu={logic.playSessionActive}
                  />
             )}

             {stage.shown === 'pause' && logic && (
                  <div ref={stageScrimRef} className={`absolute inset-0 k-glass flex items-center justify-center pointer-events-auto z-50 ${stageScrimClass}`} {...pauseBackdropProps}>
                     <div style={stageStyle(pauseFitScale)} onClick={e => e.stopPropagation()}>
                     <GameMenuCard ref={pauseCardRef} className={stageCardClass} icon={<Pause size={18} absoluteStrokeWidth />} title="Paused"
                        titleTip="Game logic stopped." onClose={() => logic.setPaused(false)} closeLabel="Resume"
                        footer={
                            <button type="button" className="k-btn k-btn-secondary k-btn-lg"
                                onClick={() => curtain.go(() => logic.exitTestMode())}>
                                <LogOut size={16} />
                                {logic.playSessionActive ? 'Back to Play Menu' : 'Return to Editor'}
                            </button>
                        }>
                        <button type="button" className="k-btn k-btn-primary k-btn-lg w-full relative" onClick={() => logic.setPaused(false)}
                            title="Resume the game (Esc)">
                            <PlayIcon size={16} /> Resume
                            <KeyChip>Esc</KeyChip>
                        </button>

                        <Reveal when={logic.debugAccess()}>
                        <MenuCard>
                            <MenuSwitch id="pause-debug-mode" icon={<SourceCode size={15} />} label="Debug Mode"
                                help="Turns on the debug tools for testing: the Debug Menu, the shape spawner, stat editing and the debug readouts. The same switch as in App Settings."
                                checked={logic.state.debugMode}
                                onChange={newVal => { if (!logic.debugAccess()) return; if (newVal) logic.updateState({ debugMode: true }); else logic._debugPowersOff(); }} />
                            <Reveal when={logic.state.debugMode}>
                                <MenuDoor icon={<Bug size={15} />} label="Debug Menu"
                                    help="Opens the debug tools: the Shape Spawner, Manage Players, Debug Visibility, God and Ghost Mode, your level and skill points, and the camera zoom."
                                    onClick={() => {
                                    if (!logic.debugAccess()) return;
                                    setDebugLevelInput(logic.state.level.toString());
                                    setDebugPointsInput(logic.state.skillPoints.toString());
                                    logic.updateState({ isDebugMenuOpen: true });
                                }} />
                            </Reveal>
                        </MenuCard>
                        </Reveal>

                        <button type="button" className="k-btn k-btn-primary k-btn-lg w-full" onClick={() => setShowAppSettings(true)}>
                            <Settings size={16} /> App Settings
                        </button>
                     </GameMenuCard>
                     </div>
                  </div>
             )}

             {stage.shown === 'debug' && logic && (
                 <div ref={stageScrimRef} className={`absolute inset-0 k-glass flex items-center justify-center pointer-events-auto z-50 ${stageScrimClass}`} {...debugBackdropProps}>
                     <div style={stageStyle(debugFitScale)} onClick={e => e.stopPropagation()}>
                     <GameMenuCard ref={debugCardRef} className={stageCardClass} icon={<Bug size={18} absoluteStrokeWidth />} title="Debug Menu"
                        onClose={() => logic.updateState({ isDebugMenuOpen: false })} closeLabel="Back to Pause"
                        footer={
                            <button type="button" className="k-btn k-btn-secondary k-btn-lg" onClick={() => logic.updateState({ isDebugMenuOpen: false })}>
                                <ArrowLeft size={16} /> Back to Pause
                            </button>
                        }>
                        <MenuCard>
                            <MenuDoor icon={<Shapes size={15} />} label="Shape Spawner"
                                help="Places any shape near your tank, as many as you pick."
                                onClick={() => setShowShapeSpawner(true)} />
                            <MenuDoor icon={<UserCog size={15} />} label="Manage Players"
                                help="Changes the tank, level, skill points and upgrades of you or any bot, and lets you take over a bot."
                                onClick={() => setShowEditPlayerStats(true)} />
                            <MenuDoor icon={<Eye size={15} />} label="Debug Visibility"
                                help="Shows or hides each debug drawing in the game, such as the bots' thinking, their paths and the ranges."
                                onClick={() => setShowDebugVisibility(true)} />
                            <Reveal when={logic.mapEventsRunning()}>
                                <MenuDoor icon={<MevEvents size={15} />} label="Map Events Monitor"
                                    help="This match's waves, Map Events and Map Entities, with a log of what happened."
                                    onClick={() => setShowMapMonitor(true)} />
                            </Reveal>
                        </MenuCard>

                        <MenuCard>
                            {(() => {
                                const userGodIntent = logic.state.gracePeriodActive
                                    ? logic.state._preGraceGodMode
                                    : logic.state.godMode;
                                return (
                                    <MenuSwitch id="debug-god-mode" icon={<ShieldPlus size={15} />} label="God Mode"
                                        help="Takes no damage, can still attack." checked={!!userGodIntent}
                                        onChange={newVal => {
                                            if (logic.state.gracePeriodActive) {
                                                logic.updateState({ _preGraceGodMode: newVal });
                                            } else {
                                                logic.updateState({ godMode: newVal });
                                            }
                                        }} />
                                );
                            })()}
                            <MenuSwitch id="debug-ghost-mode" icon={<Ghost size={15} />} label="Ghost Mode"
                                help="Invisible, no collision, 4x speed." checked={logic.state.ghostMode}
                                onChange={v => logic.updateState({ ghostMode: v })} />
                        </MenuCard>

                        <div className="k-group">
                            <div className="k-group-body k-debug-progress">
                                <form className="k-row" onSubmit={e => { e.preventDefault(); logic.setLevel(parseInt(debugLevelInput) || 0); }}
                                    onKeyDownCapture={e => { if (e.key === 'Enter') { e.preventDefault(); logic.setLevel(parseInt(debugLevelInput) || 0); } }}>
                                    <label htmlFor="debug-set-level" className="k-row-label">
                                        <span className="k-row-lead"><HelpTooltip text={`Sets your level at once, from 0 to this mode's cap (${logic.getDebugMaxSettableLevel()}). Type it, then press the check or Enter.`} /></span>
                                        <span className="k-row-label-text">Level</span>
                                    </label>
                                    <span className="k-value">
                                        <NumberInput id="debug-set-level" value={debugLevelInput} onChange={(e) => setDebugLevelInput(e.target.value)}
                                            className="k-field k-debug-num" placeholder={`0-${logic.getDebugMaxSettableLevel()}`} />
                                        <IconButton type="submit" label="Set level" size="md"><Check size={16} /></IconButton>
                                    </span>
                                </form>
                                <form className="k-row" onSubmit={e => { e.preventDefault(); logic.setSkillPoints(parseInt(debugPointsInput) || 0); }}
                                    onKeyDownCapture={e => { if (e.key === 'Enter') { e.preventDefault(); logic.setSkillPoints(parseInt(debugPointsInput) || 0); } }}>
                                    <label htmlFor="debug-set-skill-points" className="k-row-label">
                                        <span className="k-row-lead"><HelpTooltip text="Sets your unspent skill points at once. Type it, then press the check or Enter." /></span>
                                        <span className="k-row-label-text">Skill Points</span>
                                    </label>
                                    <span className="k-value">
                                        <NumberInput id="debug-set-skill-points" value={debugPointsInput}
                                            onChange={(e) => { if (e.target.value.length <= 9) setDebugPointsInput(e.target.value); }}
                                            className="k-field k-debug-num" placeholder="Amount" />
                                        <IconButton type="submit" label="Set skill points" size="md"><Check size={16} /></IconButton>
                                    </span>
                                </form>
                            </div>
                        </div>

                        <div className="k-group">
                            <div className="k-group-body">
                                <SliderRow label="Field of View" help="Camera zoom on top of the tank's own view. The admin panel's minus and equals keys move it too, and it goes back to 1x when your tank changes or dies."
                                    value={logic.state.debugFovMultiplier ?? 1} min={logic.debugFovMin()} max={logic.debugFovMax()} step={0.01} logScale
                                    display={`${(logic.state.debugFovMultiplier ?? 1).toFixed(2)}x`}
                                    onChange={v => logic.setDebugFov(Math.abs(Math.log(v)) < 0.006 ? 1 : v)}
                                    action={
                                        <IconButton label="Reset to 1x" size="sm"
                                            onClick={() => logic.setDebugFov(1)}>
                                            <Undo2 size={13} />
                                        </IconButton>
                                    } />
                            </div>
                        </div>
                     </GameMenuCard>
                     </div>
                  </div>
             )}

             {showEditPlayerStats && logic && (
                <EditPlayerStatsPopup
                    logic={logic}
                    onClose={() => setShowEditPlayerStats(false)}
                />
             )}

             {showMapMonitor && logic && <MapEventsMonitor logic={logic} onClose={() => setShowMapMonitor(false)} onShow={() => { logic.updateState({ isDebugMenuOpen: false }); logic.setPaused(false); }} />} { }
             {showDebugVisibility && logic && (
                <DebugVisibilityPopup
                    logic={logic}
                    onClose={() => setShowDebugVisibility(false)}
                />
             )}

             {showAppSettings && logic && (
                <Modal title="App Settings" icon={<Settings size={18} strokeWidth={1.5} absoluteStrokeWidth />} size="md" bodyClassName="k-modal-body-flush"
                    onClose={() => setShowAppSettings(false)}>
                    <SandboxSettingsUI logic={logic} onUpdate={forceUpdate} developer />
                </Modal>
             )}

             {showShapeSpawner && logic && (
                <ShapeSpawnerPopup
                    logic={logic}
                    onClose={() => setShowShapeSpawner(false)}
                />
             )}
        </main>

        <div aria-hidden className={`k-layer-frame${isTestMode || sizeGate ? ' k-layer-frame-off' : ''}`}
            style={{ left: Math.floor(RAIL_W * chromeScale), ['--k-layer-gap' as string]: Math.round(LAYER_GAP * chromeScale) + 'px', ['--k-layer-foot' as string]: Math.round(LAYER_FOOT * chromeScale) + 'px', ['--k-layer-panel' as string]: Math.round((320 + LAYER_GAP) * chromeScale) + 'px', ['--k-layer-r' as string]: Math.round(10 * chromeScale) + 'px' } as React.CSSProperties}>
          <div className="k-layer-frame-box" />
          <div className="k-layer-frame-edge" />
        </div>

        <EngineToolPanels
            logic={logic}
            chromeScale={chromeScale}
            isTestMode={isTestMode}
            panelsOutOfLayout={panelsOutOfLayout}
            engineScreen={screen === 'engine'}
            panelRefresh={panelRefresh}
            onUpdate={forceUpdate}
            dataRegistry={dataRegistryRef.current}
            showTool={showTool}
        />

      </div>
    </div>
    </ToastProvider>
  );
}

function ToolbarIcon({ active: activeProp, toolId, onClick, icon, label }: { active?: boolean, toolId?: Tool, onClick: () => void, icon: React.ReactNode, label: string }) {
    const isActive = useIsActiveTool(toolId ?? ('' as Tool));
    const active = toolId ? isActive : !!activeProp;
    return (
        <button
            onClick={onClick}
            aria-label={label}
            data-tip={label}
            data-tip-side="right"
            className={`toolbar-icon w-10 h-10 rounded-lg flex items-center justify-center active:scale-[0.97] relative ${active ? 'toolbar-icon-active' : 'text-[var(--k-rail-icon)] hover:bg-[var(--k-icon-hover)] hover:text-[var(--k-rail-icon-on)]'}`}
        >
            {icon}
        </button>
    );
}
