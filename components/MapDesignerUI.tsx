import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { usePanelMemory, isOneOf } from './kit/panelMemory';
import { GameLogic, GRID_SPACING } from '../game/GameLogic';
import { SMALL_FIX } from '../game/smallFixSwitch';
import { sameProjectUndo } from './shared/sameProjectUndo';
import { isPortalMode } from '../types';
import { MapConfig, createDefaultMapConfig, ExportFile, LibraryItem, MultiAreaMapConfig, AreaConfig, createDefaultArea, PortalLinkConfig, PortalLevelConfig, DEFAULT_SHAPE_SPAWN_CONFIG, SpawnZoneScale, TEAM_COLORS_DARK, TEAM_COLORS_LIGHT, TEAM_NAMES, MAZE_TYPE_CUSTOM, type CustomMapData } from '../types';
import { isTeamModeId } from '../game/gameModeRegistry';
import { MAZE_TYPE_NAMES, MAZE_EROSION_RANGES, MAZE_NATIVE_GRID, MAZE_MIN_GRID } from '../game/MazeGenerator';
import { computeMapDimensions, gridCellsYOf, areaGapOf, AREA_GAP_MIN, AREA_GAP_MAX, normalizeSpawnZoneScales, resolveSpawnZoneExtent, spawnZoneMaxScale, SPAWN_ZONE_MIN_SCALE, configPaintsBaseTiles, configBaseTeamSpan, builtGridOf } from '../game/MapSystem';
import {
  isCustomMap, touchesMapGeneration, cancelMapEditInteraction, clearMapEditSelection,
  MAP_CONFIG_NON_GENERATION_KEYS, handEditsDropFor, gridResizeShift, firstFreeName, changedOfPartial, mapHasHandWork, firstAreaAfterToggle,
  editZones, editPortals, findPortalConflictsAtScale, rockSizeLimits, findPlacedPortal,
} from '../game/MapEditor';
import { PortalPanel } from './shared/PortalPanel';
import { PLACED_PORTALS } from '../game/placedPortalsSwitch';
import { MapScaleConflictPopup } from './MapScaleConflictPopup';
import { isGameDark } from '../utils/gameColors';
import { mazeTypePickPatch } from './shared/mazeTypePick';
import { gridBoxesOf, gridCommitPatch, scaleCommitPatch } from './shared/mapGridBoxes';
import { CommitNumberInput } from './shared/CommitNumberInput';
import { NumberBox } from './kit/NumberBox';
import { MapLibrarySlot } from './maps/MapLibraryWindow';
import { MapLibraryButton } from './maps/MapLibraryButton';
import { ROCK_PATTERN_NAMES, rockPatternOf, rockCardPickPatch } from './maps/rockCatalog';
import { useOpenFlag } from './library/LibraryWindowSlot';
import { mazeCardLoadPatch } from './maps/mapCatalog';
import { rockTilesOf, ROCK_TILES_2TDM, ROCK_TILES_4TDM, ROCK_TILES_LIMITS, type RockTilesSettings } from '../game/portalModes';
import { CollapsibleSection, SliderRow, ToggleItem, SegButton } from './shared/mapDesignerControls';
import { PaintRows } from './shared/PaintRows';
import { MISSING_MODES } from '../game/missingModesSwitch';
import { Reveal, MotionList, SwapBox, SwapInPlace, SwapText, Fade, revealFold, type FoldHandle } from './kit/Collapse';
import { BaseProtectorSettings } from './shared/BaseProtectorSettings';
import { BossSpawnSettings } from './shared/BossSpawnSettings';
import { PortalLinkRow, PortalTimingRow, PortalLevelRow, PortalBotOddsRow, PortalBossBlacklistRow } from './shared/PortalSettings';
import { CustomEditorSection } from './CustomEditorSection';
import { askChoice } from './project/dialogs';
import { sanitizeImport } from '../game/ValueClamp';
import { resolveEngineModeConfig, engineModeLabel } from '../game/gameModeRegistry';
import type { GameModeFile } from '../types';
import { MapObjectsCard } from './mapEvents/MapObjectsCard';
import { MAP_KINDS } from '../game/MapEditorInput';
import { MAP_EVENTS } from '../game/mapEventsSwitch';
import type { MapEditorKind } from '../game/MapEditor';
import { ImportButton } from './shared/ImportButton';
import { openContextMenu } from './shell/ContextMenu';
import { mapLoadDoor, mapExportDoor, whenToolShown } from './shell/doors';
import { keepExportCopy, routeProjectFiles, isProjectFileName, APP_FILE_ACCEPT, askBeforeModeSwitch } from './project/projectActions';
import { VirtualList } from './kit/VirtualList';
import { shiftEventsDoc, shiftZoneRows, shiftShape } from '../game/mapEvents/doc';
import { BASE_AREAS, fitZonesToGrid } from '../game/baseAreas';
const AREA_ROW_H = 31;
const AREA_ROWS = 8;
import { Shuffle, Copy, Download, Upload, Trash2, Play, Plus, Layers, SlidersHorizontal, Pencil, HdGlobalRefresh, HdSphere, HdFileManagement, HdDashboardSquareAdd, HdInboxDownload, HdPaintBrush04, HdMapFile } from './ui/icons';
import { DataRegistry } from '../game/DataRegistry';
import { importChangedNotice, PUMPKIN_ROCKS_ONLY_TIP } from './shared/labels';
import { useToast } from './ui/Toast';
import { ScrollArea } from './ui/ScrollArea';
import { SandboxSettingsSection } from './SandboxSettingsSection';
import { MagicMazeSettings } from './MagicMazeSettings';
import { MAGIC_MAZE_TYPE } from '../game/magicMaze';
import { fireTip } from '../utils/tips';
import { useMenuScale } from '../utils/useMenuScale';
import { headerIcon, Segmented, Chip, RowLabel, Group } from './kit/kit';
import { ConfirmDialog } from './kit/Modal';

interface Props {
  logic: GameLogic | null;
  dataRegistry: DataRegistry | null;
  className?: string;
}

function botShare(mac: MultiAreaMapConfig, areaIndex: number, teamId: string): number {
  const a = mac.areas[areaIndex];
  if (!a) return 0;
  if (mac.botSpawnMode === 'advanced' && a.botSpawnWeightByTeam) {
    const w = a.botSpawnWeightByTeam[teamId];
    if (typeof w === 'number' && isFinite(w)) return w < 0 ? 0 : w;
  }
  const s = a.botSpawnWeight;
  if (typeof s === 'number' && isFinite(s)) return s < 0 ? 0 : s;
  return areaIndex === 0 ? 100 : 0;
}

function BotSpawnAreasSection({ logic, multiArea, forceRender }: {
  logic: GameLogic;
  multiArea: MultiAreaMapConfig;
  forceRender: React.Dispatch<React.SetStateAction<number>>;
}) {
  const gm = logic.state.gameModeConfig;
  const advancedAvailable = isTeamModeId(gm.mode) && (gm.teams ?? 0) > 1;
  const mode = (multiArea.botSpawnMode === 'advanced' && advancedAvailable) ? 'advanced' : 'simple';
  const teamCount = Math.max(2, Math.min(4, gm.teams ?? 2));
  const [teamIdx, setTeamIdx] = usePanelMemory('map.botTeam', 0, v => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 4);
  const activeTeam = mode === 'advanced' ? 'team' + (Math.min(teamIdx, teamCount - 1) + 1) : '';
  const teamColors = isGameDark() ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;

  const write = useCallback((mutate: (areas: AreaConfig[]) => AreaConfig[], patch?: Partial<MultiAreaMapConfig>) => {
    const mac = logic.state.multiAreaConfig;
    logic.updateState({ multiAreaConfig: { ...mac, ...patch, areas: mutate(mac.areas) } });
    forceRender(n => n + 1);
  }, [logic, forceRender]);

  const setShare = useCallback((areaIndex: number, v: number) => {
    write(areas => areas.map((a, i) => {
      if (i !== areaIndex) return a;
      if (mode === 'advanced') {
        return { ...a, botSpawnWeightByTeam: { ...(a.botSpawnWeightByTeam || {}), [activeTeam]: v } };
      }
      return { ...a, botSpawnWeight: v };
    }));
  }, [write, mode, activeTeam]);

  const shares = multiArea.areas.map((_, i) => botShare(multiArea, i, activeTeam));
  const total = shares.reduce((s, v) => s + v, 0);
  const pct = (i: number) => (total > 0 ? Math.round((shares[i] / total) * 100) : (i === 0 ? 100 : 0));

  return (
    <Group title="Bot Spawn Areas" level={3} collapsible defaultOpen={false}>

      <Reveal when={advancedAvailable}><div className="k-row-stack">
        <RowLabel label="Shares For" help="All Bots: one set of shares for every bot. Per Team: each team has its own shares; pick the team with the chips below." />
        <Segmented block value={mode} onChange={m => write(a => a, { botSpawnMode: m })}
          options={[{ value: 'simple', label: 'All Bots' }, { value: 'advanced', label: 'Per Team' }]} />
      </div></Reveal>

      <Reveal when={mode === 'advanced'}>
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: teamCount }, (_, t) => (
            <Chip key={t} active={teamIdx === t} onClick={() => setTeamIdx(t)}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: teamColors[t] }} />
              {TEAM_NAMES[t]}
            </Chip>
          ))}
        </div>
      </Reveal>

      <MotionList gap={8}>
      {multiArea.areas.map((area, i) => (
        <div key={area.id}>
          <SliderRow
            label={`${area.name || `Area ${i + 1}`} (${pct(i)}%)`}
            value={shares[i]}
            onChange={v => setShare(i, v)}
            min={0} max={100} step={1}
            tooltip="Where new bots start: this area's share of them. Shares do not have to add up to 100; the percent after the name is how much of the new bots this area gets. Set it to 0 to keep bots out of this area."
          />
        </div>
      ))}
      </MotionList>

      <Reveal when={total === 0}>
        <p className="text-[11px] text-[var(--text-primary)] leading-snug">
          Every area is set to 0, so all bots start in the first area.
        </p>
      </Reveal>
    </Group>
  );
}

export const MapDesignerUI: React.FC<Props> = ({ logic, dataRegistry, className }) => {
  if (!logic) return null;

  const [, forceRender] = useState(0);
  const menuScale = useMenuScale();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [openFeature, setOpenFeature] = usePanelMemory<string | null>('map.openFeature', null, isOneOf([null, 'maze', 'rocks', 'look', 'portals', 'zones', 'bosses', 'protectors']));
  const [scaleConflict, setScaleConflict] = useState<
    { mapScale: number; nextCm: CustomMapData; rockIds: number[]; portalIds: number[] } | null
  >(null);
  const regenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regenCountRef = useRef(0);
  const { showToast } = useToast();
  const lastFailedSeedRef = useRef<number | null>(null);

  const multiArea = logic.state.multiAreaConfig;
  const isMultiArea = multiArea.enableMultiArea && multiArea.areas.length > 0;

  const activeArea = isMultiArea
    ? multiArea.areas.find(a => a.id === multiArea.activeAreaId) || multiArea.areas[0]
    : null;
  const config = activeArea ? activeArea.mapConfig : logic.state.mapConfig;

  const activeMapState = isMultiArea && activeArea
    ? (logic.areaStates.find(s => s.areaId === activeArea.id) || logic.mapState)
    : logic.mapState;
  const scheduleRegen = useCallback(async () => {
    const thisRegen = ++regenCountRef.current;
    setIsRegenerating(true);
    logic.centerMapForRegeneration();

    const applied = await logic.regenerateMapAsync();

    if (thisRegen !== regenCountRef.current) return;

    setIsRegenerating(false);
    forceRender(n => n + 1);
    if (applied) logic.fitMapToView();
    if (!applied) return;

    if (isMultiArea) return;

    const ms = logic.mapState;
    if (!ms) return;
    const requestedSeed = logic.state.mapConfig.seed;

    if (logic.state.mapConfig.enableMaze && ms.walls.length === 0) {
      if (lastFailedSeedRef.current !== requestedSeed) {
        lastFailedSeedRef.current = requestedSeed;
        showToast('error', 'Map generation failed. Try a different seed or erosion value.');
      }
    } else if (ms.seedUsed !== requestedSeed) {
      lastFailedSeedRef.current = null;
      const newConfig = { ...logic.state.mapConfig, seed: ms.seedUsed };
      logic.updateState({ mapConfig: newConfig });
      forceRender(n => n + 1);
    } else {
      lastFailedSeedRef.current = null;
    }
  }, [logic, isMultiArea, showToast]);

  const scaleRockTool = useCallback((newScale: number) => {
    const prev = config.mapScale;
    if (!prev || prev <= 0 || newScale === prev) return;
    const lim = rockSizeLimits(newScale * GRID_SPACING);
    const me = logic.mapEditor;
    me.rockSize = Math.min(lim.max, Math.max(lim.min, me.rockSize * (newScale / prev)));
  }, [logic, config.mapScale]);

  const updateConfig = useCallback((partial: Partial<MapConfig>) => {
    { const left = changedOfPartial(partial, SMALL_FIX.R823 && !activeArea ? logic.state.mapConfig : config); if (left === null) return; partial = left; }
    if (partial.mazeType !== undefined) {
      const native = SMALL_FIX.R768 !== 0 ? Math.max(MAZE_NATIVE_GRID[partial.mazeType] || 0, MAZE_MIN_GRID[partial.mazeType] || 0) : (MAZE_NATIVE_GRID[partial.mazeType] || 0);
      const currentGc = partial.gridCells ?? config.gridCells;
      if (native > currentGc) {
        partial = { ...partial, gridCells: native };
      }
    }
    if (('gridCells' in partial || 'gridCellsY' in partial) && !('customMap' in partial)
        && (isCustomMap(config) || SMALL_FIX.R810) && config.customMap) {
      const next = { ...config, ...partial };
      const dx = gridResizeShift(next.gridCells, config.gridCells);
      const dy = gridResizeShift(gridCellsYOf(next), gridCellsYOf(config));
      const _sides = BASE_AREAS.ON !== 0 && (next.gridCells !== config.gridCells || gridCellsYOf(next) !== gridCellsYOf(config));
      if (dx !== 0 || dy !== 0 || _sides) {
        const cm = config.customMap;
        partial = { ...partial, customMap: {
          nextId: cm.nextId,
          walls: cm.walls.map(w => ({ ...w, gx: w.gx + dx, gy: w.gy + dy })),
          rocks: cm.rocks.map(r => ({ ...r, cx: r.cx + dx, cy: r.cy + dy })),
          zones: BASE_AREAS.ON !== 0 ? fitZonesToGrid(cm.zones, config.gridCells, gridCellsYOf(config), next.gridCells, gridCellsYOf(next), gridResizeShift, shiftShape) : shiftZoneRows(cm.zones, dx, dy),
          portals: cm.portals.map(p => ({ ...p, gx: p.gx + dx, gy: p.gy + dy })),
        } };
      }
    }
    if ('gridCells' in partial || 'gridCellsY' in partial) {
      const next = { ...config, ...partial };
      const dx = gridResizeShift(next.gridCells, config.gridCells);
      const dy = gridResizeShift(gridCellsYOf(next), gridCellsYOf(config));
      const _ga = builtGridOf(config), _gb = builtGridOf(next);
      if (BASE_AREAS.ON !== 0 && config.mapAreas && !('mapAreas' in partial) && (_ga.w !== _gb.w || _ga.h !== _gb.h)) partial = { ...partial, mapAreas: { nextId: config.mapAreas.nextId, zones: fitZonesToGrid(config.mapAreas.zones, _ga.w, _ga.h, _gb.w, _gb.h, gridResizeShift, shiftShape) } };
      if (dx !== 0 || dy !== 0) {
        if (BASE_AREAS.ON === 0 && config.mapAreas && !('mapAreas' in partial)) partial = { ...partial, mapAreas: { nextId: config.mapAreas.nextId, zones: shiftZoneRows(config.mapAreas.zones, dx, dy) } };
        if (config.events && !('events' in partial)) partial = { ...partial, events: shiftEventsDoc(config.events, dx, dy) };
      }
    }
    if (partial.mapScale !== undefined && !('customMap' in partial)
        && (isCustomMap(config) || SMALL_FIX.R810) && config.customMap
        && config.mapScale > 0 && partial.mapScale !== config.mapScale) {
      const k = partial.mapScale / config.mapScale;
      const cm = config.customMap;
      const nextCm: CustomMapData = { ...cm, rocks: cm.rocks.map(r => ({ ...r, size: r.size * k })) };

      if (k < 1 && isCustomMap(config)) {
        const conflict = findPortalConflictsAtScale(nextCm, partial.mapScale * GRID_SPACING, cm, config.mapScale * GRID_SPACING);
        if (conflict.rockIds.length > 0 || conflict.portalIds.length > 0) {
          setScaleConflict({ mapScale: partial.mapScale, nextCm, ...conflict });
          return;
        }
      }
      partial = { ...partial, customMap: nextCm };
      if (isCustomMap(config)) scaleRockTool(partial.mapScale);
    }
    if (touchesMapGeneration(partial)) {
      const live: MapConfig = isMultiArea && activeArea
        ? (logic.state.multiAreaConfig.areas.find(a => a.id === activeArea.id)?.mapConfig ?? activeArea.mapConfig)
        : logic.state.mapConfig;
      const dropEdits = handEditsDropFor(live, partial);
      if (dropEdits !== null) partial = { ...partial, ...dropEdits };
      logic.clearMapEditHistory();
      cancelMapEditInteraction(logic.mapEditor);
      clearMapEditSelection(logic.mapEditor);
      const held = logic.mapEditor.tool;
      if (partial.mazeType !== undefined && partial.mazeType !== MAZE_TYPE_CUSTOM
          && held !== 'select' && !(held === 'eraser' && MAP_EVENTS.ON !== 0) && (held === 'none' || held === 'eraser' || !MAP_KINDS[held as MapEditorKind].onEveryMap)) {
        logic.mapEditor.tool = 'none';
      }
    }
    if (isMultiArea && activeArea) {
      const newAreaConfig = { ...activeArea.mapConfig, ...partial };
      if (newAreaConfig.gridCellsY === undefined) delete newAreaConfig.gridCellsY;
      const newAreas = multiArea.areas.map(a =>
        a.id === activeArea.id ? { ...a, mapConfig: newAreaConfig } : a
      );
      logic.updateState({
        multiAreaConfig: { ...multiArea, areas: newAreas },
        mapConfig: activeArea.id === multiArea.areas[0]?.id ? newAreaConfig : logic.state.mapConfig,
      });
    } else {
      const newConfig = { ...logic.state.mapConfig, ...partial };
      if (newConfig.gridCellsY === undefined) delete newConfig.gridCellsY;
      logic.updateState({ mapConfig: newConfig });
    }
    forceRender(n => n + 1);

    const _needsRegen = Object.keys(partial).some(k => !MAP_CONFIG_NON_GENERATION_KEYS.includes(k));

    if (_needsRegen && !logic.state.isTestMode) {
      if (regenTimerRef.current !== null) clearTimeout(regenTimerRef.current);
      regenTimerRef.current = setTimeout(() => {
        regenTimerRef.current = null;
        if (logic.state.isTestMode) return;
        scheduleRegen();
      }, 50);
    }
  }, [logic, scheduleRegen, isMultiArea, activeArea, multiArea, config.gridCells,
      config.mapScale, config.customMap, config.mazeType, scaleRockTool]);

  const confirmScaleConflict = useCallback(() => {
    if (!scaleConflict) return;
    const { mapScale, nextCm, rockIds, portalIds } = scaleConflict;
    const dropRocks = new Set(rockIds), dropPortals = new Set(portalIds);
    const pruned: CustomMapData = {
      ...nextCm,
      rocks: nextCm.rocks.filter(r => !dropRocks.has(r.id)),
      portals: nextCm.portals.filter(p => !dropPortals.has(p.id)),
    };
    const extra = pruned.portals.length === 0 ? { enablePortals: false } : {};
    setScaleConflict(null);
    scaleRockTool(mapScale);
    updateConfig({ mapScale, customMap: pruned, ...extra });
  }, [scaleConflict, updateConfig, scaleRockTool]);

  const updateMultiAreaConfig = useCallback((partial: Partial<MultiAreaMapConfig>) => {
    const newMAC = { ...logic.state.multiAreaConfig, ...partial };
    logic.updateState({ multiAreaConfig: newMAC });
    forceRender(n => n + 1);

    const _keys = Object.keys(partial);
    const _isUIOnly = _keys.length === 1 && _keys[0] === 'activeAreaId';
    if (_isUIOnly) return;

    if (!logic.state.isTestMode) {
      if (regenTimerRef.current !== null) clearTimeout(regenTimerRef.current);
      regenTimerRef.current = setTimeout(() => {
        regenTimerRef.current = null;
        if (logic.state.isTestMode) return;
        scheduleRegen();
      }, 50);
    }
  }, [logic, scheduleRegen]);

  const restoreWorld = useCallback((mac: MultiAreaMapConfig, map: MapConfig) => {
    if (logic.state.isTestMode) return;
    logic.clearMapEditHistory();
    cancelMapEditInteraction(logic.mapEditor);
    clearMapEditSelection(logic.mapEditor);
    logic.updateState({ multiAreaConfig: mac, mapConfig: map });
    forceRender(n => n + 1);
    if (regenTimerRef.current !== null) clearTimeout(regenTimerRef.current);
    regenTimerRef.current = setTimeout(() => { regenTimerRef.current = null; scheduleRegen(); }, 50);
  }, [logic, scheduleRegen]);

  const addArea = useCallback(() => {
    const areas = [...multiArea.areas];
    const newArea = createDefaultArea(SMALL_FIX.R802 ? firstFreeName('Area', areas.map(a => a.name)) : `Area ${areas.length + 1}`);
    areas.push(newArea);
    updateMultiAreaConfig({ areas, activeAreaId: newArea.id });
    if (logic && !logic.state.isTestMode) {
      if (regenTimerRef.current !== null) clearTimeout(regenTimerRef.current);
      regenTimerRef.current = setTimeout(async () => {
        regenTimerRef.current = null;
        if (logic.state.isTestMode) return;
        await scheduleRegen();
        logic.fitAreaToView(newArea.id);
      }, 50);
    }
  }, [multiArea, updateMultiAreaConfig, logic, scheduleRegen]);

  const removeArea = useCallback((areaId: string) => {
    const oldIdx = multiArea.areas.findIndex(a => a.id === areaId);
    const areas = multiArea.areas
      .filter(a => a.id !== areaId)
      .map(a => {
        const links = a.mapConfig.portalLinks;
        if (!links || !links.some(l => l.destinationAreaId === areaId)) return a;
        return {
          ...a,
          mapConfig: {
            ...a.mapConfig,
            portalLinks: links.filter(l => l.destinationAreaId !== areaId),
          },
        };
      });
    let newActiveId: string;
    if (multiArea.activeAreaId !== areaId) {
      newActiveId = multiArea.activeAreaId;
    } else if (areas.length > 0) {
      newActiveId = areas[Math.max(0, oldIdx - 1)].id;
    } else {
      newActiveId = '';
    }
    const newMAC = { ...multiArea, areas, activeAreaId: newActiveId };
    const beforeMac = multiArea, beforeMap = logic.state.mapConfig, gone = multiArea.areas[oldIdx];
    if (SMALL_FIX.R811 && gone) showToast('success', `Removed "${gone.name || `Area ${oldIdx + 1}`}".`, { label: 'Undo', run: sameProjectUndo(logic, showToast, () => {
      const now = logic.state.multiAreaConfig;
      if (now === newMAC) { restoreWorld(beforeMac, beforeMap); return; }
      if (now.areas.some(a => a.id === gone.id)) return;
      const at = Math.min(oldIdx, now.areas.length);
      const back = [...now.areas.slice(0, at), gone, ...now.areas.slice(at)];
      restoreWorld({ ...now, areas: back, activeAreaId: gone.id }, back[0].mapConfig);
    }) });
    logic.clearMapEditHistory();
    cancelMapEditInteraction(logic.mapEditor);
    clearMapEditSelection(logic.mapEditor);
    logic.updateState({
      multiAreaConfig: newMAC,
      mapConfig: areas.length > 0 ? areas[0].mapConfig : logic.state.mapConfig,
    });
    forceRender(n => n + 1);
    if (!logic.state.isTestMode) {
      if (regenTimerRef.current !== null) clearTimeout(regenTimerRef.current);
      regenTimerRef.current = setTimeout(async () => {
        regenTimerRef.current = null;
        await scheduleRegen();
        if (newActiveId) logic.fitAreaToView(newActiveId);
      }, 50);
    }
  }, [multiArea, logic, scheduleRegen, forceRender]);

  const selectArea = useCallback((areaId: string) => {
    logic.endMapEditStroke();
    cancelMapEditInteraction(logic.mapEditor);
    clearMapEditSelection(logic.mapEditor);
    updateMultiAreaConfig({ activeAreaId: areaId });
    if (logic) logic.fitAreaToView(areaId);
  }, [multiArea, updateMultiAreaConfig, logic]);

  const renameArea = useCallback((areaId: string, name: string) => {
    const mac = logic.state.multiAreaConfig;
    const areas = mac.areas.map(a => (a.id === areaId ? { ...a, name } : a));
    logic.updateState({ multiAreaConfig: { ...mac, areas } });
    forceRender(n => n + 1);
  }, [logic, forceRender]);

  const zoneSync = config.spawnZoneSync ?? true;

  const updateZoneScale = useCallback((zoneIndex: number, patch: Partial<SpawnZoneScale>) => {
    const sync = config.spawnZoneSync ?? true;
    const base = normalizeSpawnZoneScales(config.spawnZoneScales);
    const next = base.map((s, i) => (sync || i === zoneIndex ? { ...s, ...patch } : s));
    updateConfig({ spawnZoneScales: next });
  }, [config.spawnZoneSync, config.spawnZoneScales, updateConfig]);

  const toggleZoneSync = useCallback(() => {
    const sync = config.spawnZoneSync ?? true;
    const base = normalizeSpawnZoneScales(config.spawnZoneScales);
    if (sync) {
      updateConfig({ spawnZoneSync: false, spawnZoneScales: base });
    } else {
      const src = base[0];
      updateConfig({ spawnZoneSync: true, spawnZoneScales: base.map(() => ({ ...src })) });
    }
  }, [config.spawnZoneSync, config.spawnZoneScales, updateConfig]);

  const randomizeSeed = useCallback(() => {
    updateConfig({ seed: Math.floor(Math.random() * 999999) + 1 });
    fireTip('seedRandomized');
  }, [updateConfig]);

  const copySeed = useCallback(() => {
    navigator.clipboard.writeText(String(config.seed));
  }, [config.seed]);

  useEffect(() => {
    return () => {
      if (regenTimerRef.current !== null) clearTimeout(regenTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (logic.state.isTestMode && regenTimerRef.current !== null) {
      clearTimeout(regenTimerRef.current);
      regenTimerRef.current = null;
    }
  }, [logic.state.isTestMode]);

  const mapLibFlag = useOpenFlag();
  const rockLibFlag = useOpenFlag();

  const isCustom = isCustomMap(config);
  const activeAreaId = isMultiArea && activeArea ? activeArea.id : '';
  const _me = logic?.mapEditor;
  const pickedPortal = PLACED_PORTALS.ON !== 0 && !isCustomMap(config) && _me && _me.hasSelection && _me.selection.kind === 'portal' && _me.selection.areaId === activeAreaId ? findPlacedPortal(config, _me.selection.id) : null;

  const erosionRange = MAZE_EROSION_RANGES[config.mazeType] ?? { min: 0.25, max: 2.0 };

  const { cellSize, mapHalf, mapHalfY } = computeMapDimensions(config);
  const totalMapSize = mapHalf * 2;

  const _libLen = (logic.state.tankLibrary || []).length;
  const mapLibrary = useMemo(() => (logic.state.tankLibrary || []).filter(
    item => item.fileData.type === 'Map' || item.fileData.type === 'MultiAreaMap'
  ), [_libLen, SMALL_FIX.R825 ? logic.libraryRev : 0]);
  const saveMapFile = useCallback((exportData: ExportFile, fileName: string) => writeMapFile(exportData, fileName), [dataRegistry]);
  const handleExport = useCallback(async () => {
    let exportData: ExportFile;
    let fileName: string;

    if (isMultiArea) {
      const macName = (SMALL_FIX.R818 ? activeArea?.mapConfig.name : undefined) || multiArea.areas[0]?.mapConfig.name || 'Untitled Multi Area';
      exportData = {
        version: '2.0.0',
        type: 'MultiAreaMap',
        name: macName,
        timestamp: Date.now(),
        data: multiArea,
      };
      fileName = `map-${macName.toLowerCase().replace(/\s+/g, '-')}.json`;
    } else {
      exportData = {
        version: '1.0.0',
        type: 'Map',
        name: config.name,
        timestamp: Date.now(),
        data: config,
      };
      fileName = `map-${config.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    }
    await saveMapFile(exportData, fileName);
  }, [config, isMultiArea, multiArea, saveMapFile]);

  async function writeMapFile(exportData: ExportFile, fileName: string): Promise<void> {
    try {
      if (dataRegistry) {
        const saveResult = await dataRegistry.smartExport(exportData, fileName);
        if (saveResult === 'saved') keepExportCopy(exportData);
        if (saveResult !== 'unsupported') return;
      }
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      keepExportCopy(exportData);
    } catch (e) {
    }
  }

  const [pendingMapLoad, setPendingMapLoad] = useState<{ file: ExportFile; record: boolean; areas: number } | null>(null);
  const applyImportedFile = useCallback((parsed: ExportFile, recordInLibrary = true, areasConfirmed = false) => {
    if (parsed.type === 'GameMode') {
      sanitizeImport(parsed);
      logic.addToLibrary({ id: DataRegistry.libraryIdFor(parsed), name: parsed.name || 'Game Mode', fileData: parsed, loadedAt: Date.now(), source: 'manual-import' });
      showToast('success', `"${parsed.name}" is in the Map Library, under Modes.`);
      forceRender(n => n + 1);
      return;
    }
    if ((parsed.type === 'MultiAreaMap' || parsed.type === 'Map') && parsed.data && logic.state.isTestMode) {
      if (recordInLibrary) {
        logic.addToLibrary({ id: DataRegistry.libraryIdFor(parsed), name: parsed.name || 'Imported Map', fileData: parsed, loadedAt: Date.now(), source: 'manual-import' });
        showToast('info', 'The map finished loading after the game started. It is in the library: load it from there after the game.');
      }
      return;
    }
    const _worldAreas = logic.state.multiAreaConfig.areas.length;
    if (parsed.type === 'Map' && parsed.data && _worldAreas >= 2 && !areasConfirmed) {
      setPendingMapLoad({ file: parsed, record: recordInLibrary, areas: _worldAreas });
      return;
    }
    const isMapFile = (parsed.type === 'MultiAreaMap' || parsed.type === 'Map') && !!parsed.data;
    const undoMac = logic.state.multiAreaConfig, undoMap = logic.state.mapConfig;
    const replacesWork = isMapFile && (undoMac.areas.length >= 2 || undoMac.areas.some(a => mapHasHandWork(a.mapConfig)) || mapHasHandWork(undoMap));
    if (isMapFile) {
      logic.clearMapEditHistory();
      cancelMapEditInteraction(logic.mapEditor);
      clearMapEditSelection(logic.mapEditor);
    }

    if (parsed.type === 'MultiAreaMap' && parsed.data) {
      const imported = parsed.data as MultiAreaMapConfig;
      for (const area of imported.areas) {
        if (!area.shapeSpawnConfig) (area as any).shapeSpawnConfig = DEFAULT_SHAPE_SPAWN_CONFIG();
        if (area.spawnRate === undefined) (area as any).spawnRate = 50;
        if (area.mapConfig.portalLinks) {
          area.mapConfig.portalLinks = area.mapConfig.portalLinks.filter(link =>
            imported.areas.some(a => a.id === link.destinationAreaId)
          );
        }
      }
      logic.updateState({
        multiAreaConfig: imported,
        mapConfig: imported.areas.length > 0 ? imported.areas[0].mapConfig : logic.state.mapConfig,
      });
      logic.dropLeakedLabyrinthLook(true);
      forceRender(n => n + 1);
      if (!logic.state.isTestMode) {
        if (regenTimerRef.current !== null) clearTimeout(regenTimerRef.current);
        regenTimerRef.current = setTimeout(() => { regenTimerRef.current = null; scheduleRegen(); }, 50);
      }
    } else if (parsed.type === 'Map' && parsed.data) {
      const imported = parsed.data as MapConfig;
      const full: MapConfig = { ...createDefaultMapConfig(), ...imported };
      const native = SMALL_FIX.R768 !== 0 ? Math.max(MAZE_NATIVE_GRID[full.mazeType] || 0, MAZE_MIN_GRID[full.mazeType] || 0) : (MAZE_NATIVE_GRID[full.mazeType] || 0);
      if (native > full.gridCells) full.gridCells = native;

      logic.updateState({
        mapConfig: full,
        multiAreaConfig: areasConfirmed
          ? { ...logic.state.multiAreaConfig, enableMultiArea: false, areas: [], activeAreaId: '' }
          : { ...logic.state.multiAreaConfig, enableMultiArea: false },
      });
      logic.dropLeakedLabyrinthLook(true);
      { const held = logic.mapEditor.tool;
        if (!isCustomMap(full) && held !== 'select' && !(held === 'eraser' && MAP_EVENTS.ON !== 0) && (held === 'none' || held === 'eraser' || !MAP_KINDS[held as MapEditorKind].onEveryMap)) logic.mapEditor.tool = 'none'; }
      forceRender(n => n + 1);
      if (!logic.state.isTestMode) {
        if (regenTimerRef.current !== null) clearTimeout(regenTimerRef.current);
        regenTimerRef.current = setTimeout(() => { regenTimerRef.current = null; scheduleRegen(); }, 50);
      }
    }

    if (SMALL_FIX.R811 && replacesWork) showToast('success', `Loaded "${parsed.name || 'the map'}".`, { label: 'Undo', run: sameProjectUndo(logic, showToast, () => restoreWorld(undoMac, undoMap)) });
    if (!recordInLibrary) return;
    const newItem: LibraryItem = {
      id: DataRegistry.libraryIdFor(parsed),
      name: parsed.name || 'Imported Map',
      fileData: parsed,
      loadedAt: Date.now(),
      source: 'manual-import',
    };
    logic.addToLibrary(newItem);
    const changed = importChangedNotice(newItem.name, parsed);
    if (changed) showToast('info', changed);
  }, [logic, scheduleRegen, forceRender, showToast]);

  useEffect(() => { mapLoadDoor.set(file => applyImportedFile(file, false)); return () => mapLoadDoor.set(null); }, [applyImportedFile]);
  const exportFold = useRef<FoldHandle | null>(null);
  const customEditorFold = useRef<FoldHandle | null>(null);
  const mapObjectsFold = useRef<FoldHandle | null>(null);
  useEffect(() => {
    mapExportDoor.set(() => { void whenToolShown('map-designer').then(ok => { if (ok && exportFold.current) void revealFold(exportFold.current); }); });
    return () => mapExportDoor.set(null);
  }, []);

  const handleImport = useCallback(async () => {
    try {
      if (dataRegistry) {
        const result = await dataRegistry.smartImport(file => { routeProjectFiles([{ file, path: file.name }]); });
        if (result === 'cancelled' || result === 'routed') return;
        if (result === 'invalid') { showToast('error', 'Invalid format. Nothing was imported.'); return; }
        if (result !== false) {
          applyImportedFile(result as ExportFile);
          return;
        }
      }
      const file = await new Promise<File>((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = APP_FILE_ACCEPT;
        input.onchange = () => input.files?.[0] ? resolve(input.files[0]) : reject();
        input.click();
      });
      if (isProjectFileName(file.name)) { routeProjectFiles([{ file, path: file.name }]); return; }
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validated = DataRegistry.validateImport(parsed);
      if (validated) applyImportedFile(validated);
      else showToast('error', 'Invalid format. Nothing was imported.');
    } catch (e) {
    }
  }, [applyImportedFile, dataRegistry, showToast]);

  return (
    <ScrollArea className={className || ''} contentClassName="p-4 space-y-3 overflow-x-hidden">
      <SwapInPlace swapKey={isMultiArea ? multiArea.activeAreaId : 'single'} className="space-y-3">
      <CollapsibleSection title="Map Generation" icon={headerIcon(HdGlobalRefresh)} defaultOpen={true}>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <RowLabel label="Maze Type" help="The wall pattern the map is built with. The Map Library button below opens a window with every maze type and your own maps as pictures, from Normal and the team layouts to Fortress, Siege, Yin Yang and the huge Labyrinth. Custom Editor gives you an empty grid to build on." />
            <span className="k-value-text truncate min-w-0">{config.enableMaze || isCustom ? (MAZE_TYPE_NAMES[config.mazeType] ?? 'Maze') : 'No Maze'}</span>
          </div>
          <MapLibraryButton onClick={() => mapLibFlag.set(true)} />
        </div>

        <Reveal when={!isCustom}>
        <div className="flex items-center gap-2">
          <RowLabel label="Seed" help="The random number behind the layout. The same seed with the same settings always builds the same map. The shuffle button rolls a new one and the copy button copies it." className="w-24 shrink-0" />
          {SMALL_FIX.R822 ? <CommitNumberInput value={config.seed} onCommit={v => updateConfig({ seed: Math.round(v) || 1 })} ariaLabel="Seed" title="Seed" className="k-field flex-1 min-w-0 tabular-nums" /> : <NumberBox
            inputMode="numeric"
            value={config.seed}
            onChange={e => updateConfig({ seed: parseInt(e.target.value, 10) || 1 })}
            className="k-field flex-1 min-w-0 tabular-nums"
          />}
          <button onClick={randomizeSeed} className="k-icon-btn k-icon-btn-sm" title="Randomize">
            <Shuffle size={14} />
          </button>
          <button onClick={copySeed} className="k-icon-btn k-icon-btn-sm" title="Copy seed">
            <Copy size={14} />
          </button>
        </div>
        </Reveal>

        {(() => {
          const _g = gridBoxesOf(config);
          const _commit = (w: number, h: number, changed: 'w' | 'h') => {
            const p = gridCommitPatch(config, w, h, changed);
            if (p !== null) updateConfig(p);
          };
          return (
            <div className="flex items-center gap-2">
              <RowLabel label="Grid" help="The map's size in cells, width and height. Type a number and press Enter. A side takes 8 to 1,000 cells and the whole map up to 80,000 cells; for a bigger world raise Map Scale. A maze grows a grid smaller than its own drawing to fit it." className="w-24 shrink-0" />
              <div className="k-stepper k-stepper-ink k-md-size flex-1 min-w-0">
                <CommitNumberInput value={_g.w} onCommit={v => _commit(v, _g.h, 'w')} ariaLabel="Grid width" title="Width" className="k-stepper-input" arrows={false} />
                <span className="k-md-size-x" aria-hidden="true">&times;</span>
                <CommitNumberInput value={_g.h} onCommit={v => _commit(_g.w, v, 'h')} ariaLabel="Grid height" title="Height" className="k-stepper-input" arrows={false} />
              </div>
            </div>
          );
        })()}

        <div className="flex items-center gap-2">
          <RowLabel label="Map Scale" help="How big one grid cell is: 30 units times this number. Type a whole number from 2 to 100 and press Enter. A bigger scale makes the whole map bigger, its walls and rooms with it. A mode's own map may stand between two whole numbers, as the Rock mode's 5.5; typing rounds it." className="w-24 shrink-0" />
          <CommitNumberInput
            value={config.mapScale}
            onCommit={v => { const p = scaleCommitPatch(config, v); if (p !== null) updateConfig(p); }}
            ariaLabel="Map Scale"
            className="k-field flex-1 min-w-0 tabular-nums"
          />
        </div>

      </CollapsibleSection>

      <Reveal when={MAP_EVENTS.ON !== 0}>
        <CollapsibleSection title="Map Objects" icon={headerIcon(HdMapFile)} defaultOpen={true} handle={mapObjectsFold}>
          <MapObjectsCard logic={logic} areaId={activeAreaId} onUpdate={() => forceRender(n => n + 1)} fold={mapObjectsFold} />
        </CollapsibleSection>
      </Reveal>

      <Reveal when={!!pickedPortal}>{() => (
        <CollapsibleSection title="Portal" icon={headerIcon(HdMapFile)} defaultOpen={true}>
          <PortalPanel logic={logic!} config={config} updateConfig={updateConfig} activeArea={activeArea} isMultiArea={isMultiArea} areas={multiArea.areas} areaId={activeAreaId} portal={pickedPortal!}
            apply={m => { logic!.applyMapEdit(activeAreaId, m); forceRender(n => n + 1); }} />
        </CollapsibleSection>
      )}</Reveal>

      <Reveal when={isCustom}>
        <CollapsibleSection title="Custom Editor" icon={headerIcon(HdPaintBrush04)} defaultOpen={true} handle={customEditorFold}>
          <CustomEditorSection
            logic={logic}
            config={config}
            updateConfig={updateConfig}
            activeArea={activeArea}
            isMultiArea={isMultiArea}
            areas={multiArea.areas}
            areaId={activeAreaId}
            onUpdate={() => forceRender(n => n + 1)}
            fold={customEditorFold}
          />
        </CollapsibleSection>
      </Reveal>

      <CollapsibleSection title="Map Features" icon={headerIcon(HdSphere)} defaultOpen={true}>
        <Reveal when={!isCustom}>
        <CollapsibleSection nested title="Maze" open={openFeature === 'maze'} onToggle={o => setOpenFeature(o ? 'maze' : null)}>
        {!isCustom && (
        <ToggleItem
          label="Enable Maze"
          checked={config.enableMaze}
          onChange={v => updateConfig({ enableMaze: v, ...(v ? { enableRocks: false } : {}) })}
          desc="Generates walls using the selected algorithm."
        />
        )}

        <Reveal when={config.enableMaze && !isCustom && config.mazeType === MAGIC_MAZE_TYPE}>
          <MagicMazeSettings config={config} updateConfig={updateConfig} />
        </Reveal>
        <Reveal when={config.enableMaze && !isCustom && config.mazeType !== MAGIC_MAZE_TYPE}>
          <SliderRow
            label="Erosion"
            value={Math.round((config.erosionIntensity ?? 1.0) * 100)}
            onChange={v => updateConfig({ erosionIntensity: v / 100 })}
            min={Math.round(erosionRange.min * 100)}
            max={Math.round(erosionRange.max * 100)}
            step={5}
            suffix="%"
            tooltip="Wall removal intensity. Higher = more open. Valid range varies by map type, slider auto adjusts when you switch maps."
          />
        </Reveal>
        </CollapsibleSection>
        </Reveal>

        <Reveal when={!isCustom}>
        <CollapsibleSection nested title="Rocks" open={openFeature === 'rocks'} onToggle={o => setOpenFeature(o ? 'rocks' : null)}>
        {!isCustom && (
        <ToggleItem
          label="Scatter Rocks"
          checked={config.enableRocks}
          onChange={v => updateConfig({ enableRocks: v, ...(v ? { enableMaze: false } : {}) })}
          desc="Places rocks instead of maze walls."
        />
        )}
        <Reveal when={config.enableRocks && !isCustom}>
          <div className="space-y-3">
            <Reveal when={(config.rockPattern ?? 'random') !== 'tiles'}>
            <SliderRow
              label="Rock Density"
              value={config.rockDensity}
              onChange={v => updateConfig({ rockDensity: v })}
              min={1} max={1000} step={1}
              tooltip="Number of scattered rock obstacles."
            />
            </Reveal>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <RowLabel label="Placement Pattern" help="Where the rocks go on the map. The Rocks Library button below opens a window with every pattern as a picture of your map: anywhere at random, in the corners, along the edges, in a ring, in the center, scattered, or Rock Tiles: a few rocks in each tile of a grid, as the portal maps lay them." />
                <span className="k-value-text truncate min-w-0"><SwapText>{ROCK_PATTERN_NAMES[rockPatternOf(config)]}</SwapText></span>
              </div>
              <MapLibraryButton label="Rocks Library" onClick={() => rockLibFlag.set(true)} />
            </div>

            <Reveal when={(config.rockPattern ?? 'random') === 'tiles'}>
              {() => {
                const rt = rockTilesOf(config.rockTiles);
                const set = (p: Partial<RockTilesSettings>) => {
                  const n: RockTilesSettings = { ...rt, ...p };
                  if (n.mix !== true) delete n.mix;
                  if (n.clearRound !== true) delete n.clearRound;
                  updateConfig({ rockTiles: n });
                };
                const L = ROCK_TILES_LIMITS;
                const like = JSON.stringify(rt) === JSON.stringify(ROCK_TILES_2TDM) ? '2tdm' : JSON.stringify(rt) === JSON.stringify(ROCK_TILES_4TDM) ? '4tdm' : null;
                return (
                  <div className="space-y-3">
                    <div className="k-row-stack">
                      <RowLabel label="Like" help="Sets every slider below to the rock field of a portal map." />
                      <Segmented block value={like} onChange={v => updateConfig({ rockTiles: { ...(v === '2tdm' ? ROCK_TILES_2TDM : ROCK_TILES_4TDM) } })}
                        options={[{ value: '2tdm', label: 'Portal 2TDM' }, { value: '4tdm', label: 'Portal 4TDM' }]} />
                    </div>
                    <div className="k-row-stack">
                      <RowLabel label="Tiles" help="Every Other Tile lays the rocks on a checkerboard; Every Tile fills them all." />
                      <Segmented block value={rt.layout} onChange={v => set({ layout: v })}
                        options={[{ value: 'checker', label: 'Every Other Tile' }, { value: 'full', label: 'Every Tile' }]} />
                    </div>
                    <SliderRow label="Tile Size" value={rt.tile} onChange={v => set({ tile: v })} min={L.tileMin} max={L.tileMax} step={30} suffix="u"
                      tooltip="The side of one rock tile in units. The tiles are laid from the middle of the map." />
                    <SliderRow label="Rocks per Tile" value={rt.perTile} onChange={v => set({ perTile: v })} min={L.perTileMin} max={L.perTileMax} step={0.1}
                      tooltip="How many rocks a rock tile holds on average: 2.5 gives 2 or 3, each as likely." />
                    <div className="k-row-stack">
                      <RowLabel label="Rock Sizes" help="Real Mix lays Gravel, Stone and Rock as the portal maps do, from the Rock Types below. Even Range spreads every rock evenly between the two sizes you set." />
                      <Segmented block value={rt.mix === true ? 'mix' : 'even'} onChange={v => set({ mix: v === 'mix' })}
                        options={[{ value: 'mix', label: 'Real Mix' }, { value: 'even', label: 'Even Range' }]} />
                    </div>
                    <Reveal when={rt.mix !== true}>
                      <div className="space-y-3">
                        <SliderRow label="Smallest Rock" value={rt.sizeMin} onChange={v => set({ sizeMin: v })} min={L.sizeMin} max={L.sizeMax} step={1} suffix="u"
                          tooltip="The smallest rock's radius in units." />
                        <SliderRow label="Largest Rock" value={rt.sizeMax} onChange={v => set({ sizeMax: v })} min={L.sizeMin} max={L.sizeMax} step={1} suffix="u"
                          tooltip="The largest rock's radius in units." />
                      </div>
                    </Reveal>
                    <ToggleItem label="Clear Middle" checked={rt.clearMiddle} onChange={v => set({ clearMiddle: v })}
                      desc="No rocks on the middle of the map: a cross through it on a checkerboard, a spot round the middle tile otherwise." />
                    <ToggleItem label="Clear Corners" checked={rt.clearCorners} onChange={v => set({ clearCorners: v })}
                      desc="No rocks near the four corners, where the bases are." />
                    <Reveal when={rt.clearMiddle || rt.clearCorners}>
                      <div className="k-row-stack">
                        <RowLabel label="Clear Shape" help="Steps clears a staircase at each corner and the middle tile with the four beside it. Round clears a round spot at each corner and a wider one in the middle, as Portal 4TDM does. On a checkerboard the middle stays a cross." />
                        <Segmented block value={rt.clearRound === true ? 'round' : 'steps'} onChange={v => set({ clearRound: v === 'round' })}
                          options={[{ value: 'steps', label: 'Steps' }, { value: 'round', label: 'Round' }]} />
                      </div>
                    </Reveal>
                  </div>
                );
              }}
            </Reveal>

            <Reveal when={(config.rockPattern ?? 'random') !== 'tiles' || rockTilesOf(config.rockTiles).mix === true}>
            <div className="flex gap-1">
              {(['rock', 'stone', 'gravel'] as const).map(type => {
                const leftOut: readonly string[] = config.rocksLeftOut ?? [];
                const usable = (t: string) => !logic.pumpkinRocks || t === 'rock';
                const used = (t: string) => usable(t) && !leftOut.includes(t);
                const active = config.rockTypes.includes(type) && used(type);
                return (
                  <SegButton
                    key={type}
                    active={active}
                    unusable={usable(type) ? undefined : PUMPKIN_ROCKS_ONLY_TIP}
                    onClick={() => {
                      if (active) {
                        const newTypes = config.rockTypes.filter(t => t !== type);
                        if (newTypes.some(used)) updateConfig({ rockTypes: newTypes });
                      } else if (leftOut.includes(type)) {
                        const lo = (config.rocksLeftOut ?? []).filter(t => t !== type);
                        updateConfig({ rocksLeftOut: lo.length > 0 ? lo : undefined });
                      } else {
                        updateConfig({ rockTypes: [...config.rockTypes, type] });
                      }
                    }}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SegButton>
                );
              })}
            </div>
            </Reveal>

            <Reveal when={(config.rockPattern ?? 'random') !== 'tiles'}>
            <SliderRow
              label="Size Variation"
              value={config.rockSizeVariation ?? 50}
              onChange={v => updateConfig({ rockSizeVariation: v })}
              min={0} max={100} step={1}
              tooltip="Random variation in rock sizes."
            />
            </Reveal>

            <ToggleItem
              label="Center Exclusion Zone"
              checked={config.rockExclusionZone ?? false}
              onChange={v => updateConfig({ rockExclusionZone: v })}
              desc="Keeps the map center clear of rocks."
              disabled={(config.rockPattern ?? 'random') === 'center'}
            />
            <Reveal when={(config.rockExclusionZone ?? false) && (config.rockPattern ?? 'random') !== 'center'}>
              <SliderRow
                label="Exclusion Size"
                value={config.rockExclusionSize ?? 10}
                onChange={v => updateConfig({ rockExclusionSize: v })}
                min={1} max={100} step={1}
                tooltip="Radius of rock free center zone."
              />
            </Reveal>
          </div>
        </Reveal>
        </CollapsibleSection>
        </Reveal>

        {MISSING_MODES.ON !== 0 && (
        <CollapsibleSection nested title="Wall And Rock Look" open={openFeature === 'look'} onToggle={o => setOpenFeature(o ? 'look' : null)}>
          <PaintRows what="Wall" whose="this map's walls" paint={config.wallPaint} onChange={p => updateConfig({ wallPaint: p })} />
          <ToggleItem
            label="Walls As Blocks"
            checked={config.wallBlocks === true}
            onChange={v => updateConfig({ wallBlocks: v })}
            desc="On: every cell of a wall is drawn as a block of its own, with its own edge. Off: a long wall is one piece. Only the look changes."
          />
          <PaintRows what="Rock" whose="this map's rocks" paint={config.rockPaint} onChange={p => updateConfig({ rockPaint: p })} />
        </CollapsibleSection>
        )}

        <Reveal when={!isCustom && PLACED_PORTALS.ON === 0}>
        <CollapsibleSection nested title="Portals" open={openFeature === 'portals'} onToggle={o => setOpenFeature(o ? 'portals' : null)}>
        <ToggleItem
          label="Enable Portals"
          checked={config.enablePortals}
          onChange={v => { updateConfig({ enablePortals: v }); if (v) fireTip('portalsEnabled'); }}
          desc="Places teleporters on the map."
        />
        <Reveal when={config.enablePortals && !isCustom}>
          <div className="space-y-3">
          <SliderRow
            label="Portal Count"
            value={config.portalCount}
            onChange={v => updateConfig({ portalCount: v })}
            min={1} max={16} step={1}
            tooltip="Number of teleporters in this area."
          />

          <Reveal when={isMultiArea && multiArea.areas.length > 1}>
            <div className="space-y-2 mt-1">
              <MotionList gap={8}>
              {Array.from({ length: config.portalCount }, (_, pIdx) => (
                <PortalLinkRow
                  key={pIdx}
                  logic={logic} config={config} updateConfig={updateConfig}
                  activeArea={activeArea} isMultiArea={isMultiArea}
                  portalId={pIdx} label={`Portal ${pIdx + 1}`} areas={multiArea.areas}
                />
              ))}
              </MotionList>
            </div>
          </Reveal>

          <div className="space-y-2 mt-1">
            <MotionList gap={8}>
            {Array.from({ length: config.portalCount }, (_, pIdx) => (
              <PortalTimingRow
                key={pIdx}
                logic={logic} config={config} updateConfig={updateConfig}
                activeArea={activeArea} isMultiArea={isMultiArea}
                portalId={pIdx} label={`Portal ${pIdx + 1}`}
              />
            ))}
            </MotionList>
          </div>

          <div className="space-y-2 mt-1">
            <MotionList gap={8}>
            {Array.from({ length: config.portalCount }, (_, pIdx) => (
              <PortalLevelRow
                key={pIdx}
                logic={logic} config={config} updateConfig={updateConfig}
                activeArea={activeArea} isMultiArea={isMultiArea}
                portalId={pIdx} label={`Portal ${pIdx + 1}`}
              />
            ))}
            </MotionList>
          </div>

          <Reveal when={isMultiArea && multiArea.areas.length > 1}>
            <div className="space-y-2 mt-1">
              <MotionList gap={8}>
              {Array.from({ length: config.portalCount }, (_, pIdx) => (
                <PortalBotOddsRow
                  key={pIdx}
                  logic={logic} config={config} updateConfig={updateConfig}
                  activeArea={activeArea} isMultiArea={isMultiArea}
                  portalId={pIdx} label={`Portal ${pIdx + 1}`}
                />
              ))}
              </MotionList>
              <MotionList gap={8}>
              {Array.from({ length: config.portalCount }, (_, pIdx) => (
                <PortalBossBlacklistRow
                  key={pIdx}
                  logic={logic} config={config} updateConfig={updateConfig}
                  activeArea={activeArea} isMultiArea={isMultiArea}
                  portalId={pIdx} label={`Portal ${pIdx + 1}`}
                />
              ))}
              </MotionList>
            </div>
          </Reveal>
          </div>
        </Reveal>
        </CollapsibleSection>
        </Reveal>

        <Reveal when={BASE_AREAS.ON === 0 && config.enableSpawnAreas && !isCustom}>
        <CollapsibleSection nested title="Team Bases" open={openFeature === 'zones'} onToggle={o => setOpenFeature(o ? 'zones' : null)}>
        {config.enableSpawnAreas && !isCustom && (() => {
          const _gc = activeMapState?.gridCells ?? config.gridCells;
          const _gcY = activeMapState?.gridCellsY ?? gridCellsYOf(config);
          const _teams = config.spawnAreaTeamCount ?? 2;
          const _maxScale = spawnZoneMaxScale(_gc, _teams, _gcY);
          const _scales = normalizeSpawnZoneScales(config.spawnZoneScales);
          const _palette = isGameDark() ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;
          const _clamp = (v: number, max: number) =>
            Math.min(max, Math.max(SPAWN_ZONE_MIN_SCALE, v));

          const _footprint = (zoneIndex: number) => {
            const e = resolveSpawnZoneExtent(config, _gc, _teams, zoneIndex, _gcY);
            const wPct = Math.round((e.w / _gc) * 100);
            const hPct = Math.round((e.h / _gcY) * 100);
            return `${e.w} x ${e.h} cells | ${wPct}% x ${hPct}% of map`;
          };

          const _sliders = (zoneIndex: number) => (
            <>
              <SliderRow
                label="Base Width"
                value={_clamp(_scales[zoneIndex].w, _maxScale.w)}
                onChange={v => updateZoneScale(zoneIndex, { w: v })}
                min={SPAWN_ZONE_MIN_SCALE} max={_maxScale.w} step={5}
                suffix="%"
                tooltip="Horizontal size, as a percent of this game mode's default. 100% is the mode's normal width. A zone can never cover more than 30% of the map's width."
              />
              <SliderRow
                label="Base Height"
                value={_clamp(_scales[zoneIndex].h, _maxScale.h)}
                onChange={v => updateZoneScale(zoneIndex, { h: v })}
                min={SPAWN_ZONE_MIN_SCALE} max={_maxScale.h} step={5}
                suffix="%"
                tooltip="Vertical size, as a percent of this game mode's default. 100% is the mode's normal height."
              />
              <div className="text-[11px] text-[var(--text-tertiary)]">{_footprint(zoneIndex)}</div>
            </>
          );

          return (
            <div className="space-y-2 mt-1">
              <ToggleItem
                label="Same Base Size For Every Team"
                checked={zoneSync}
                onChange={v => { if (v !== zoneSync) toggleZoneSync(); }}
                desc="On: every team base shares one size (Team 1's). Off: each team's base is sized on its own."
              />

              <SwapBox swapKey={zoneSync} className="space-y-2">
              {zoneSync ? (
                <div className="space-y-1.5">{_sliders(0)}</div>
              ) : (
                Array.from({ length: _teams }, (_, i) => (
                  <div key={i} className={`space-y-1.5 ${i > 0 ? 'pt-2 border-t border-[var(--alpha-divider)]' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: _palette[i] }} />
                      <span className="text-[11px] [font-weight:var(--fw-head)] text-[var(--text-secondary)]">{TEAM_NAMES[i]} Base</span>
                    </div>
                    {_sliders(i)}
                  </div>
                ))
              )}
              </SwapBox>
            </div>
          );
        })()}
        </CollapsibleSection>
        </Reveal>

        <CollapsibleSection nested title="Boss Spawns" open={openFeature === 'bosses'} onToggle={o => setOpenFeature(o ? 'bosses' : null)}>
        <BossSpawnSettings
          config={config}
          placeKey={activeArea ? activeArea.id : ''}
          updateConfig={updateConfig}
          tankLibrary={logic?.state.tankLibrary ?? []}
          logic={logic}
        />
        </CollapsibleSection>

        <Reveal when={(BASE_AREAS.ON === 0 || configPaintsBaseTiles(config) || !!config.enableSpawnAreas) && (config.enableSpawnAreas || isCustom || configPaintsBaseTiles(config) || configBaseTeamSpan(config) > 0)}>
        <CollapsibleSection nested title="Base Protectors" open={openFeature === 'protectors'} onToggle={o => setOpenFeature(o ? 'protectors' : null)}>
        {(BASE_AREAS.ON === 0 || configPaintsBaseTiles(config) || !!config.enableSpawnAreas) && (config.enableSpawnAreas || isCustom || configPaintsBaseTiles(config) || configBaseTeamSpan(config) > 0) && (
          <BaseProtectorSettings
            config={config}
            updateConfig={updateConfig}
            teamCount={Math.max(config.spawnAreaTeamCount ?? 2, configBaseTeamSpan(config))}
            tankLibrary={logic?.state.tankLibrary ?? []}
            logic={logic}
            onRangePreview={v => {
              if (!logic) return;
              logic.baseProtectorRangePreviewAreaId = activeArea ? activeArea.id : '';
              logic.baseProtectorRangePreview = v;
            }}
          />
        )}
        </CollapsibleSection>
        </Reveal>

      </CollapsibleSection>

      <CollapsibleSection title="Sandbox Settings" icon={headerIcon(HdFileManagement)} defaultOpen={false}>
        <SandboxSettingsSection logic={logic} onUpdate={() => forceRender(n => n + 1)} />
      </CollapsibleSection>
      </SwapInPlace>

      <CollapsibleSection title="Areas" icon={headerIcon(HdDashboardSquareAdd)} defaultOpen={false}
count={multiArea.areas.length > 0 ? multiArea.areas.length : undefined}>
        <ToggleItem
          label="Enable Multi Area"
          checked={multiArea.enableMultiArea}
          desc="Splits the world into linked areas."
          onChange={v => {
            const newMAC = { ...multiArea, enableMultiArea: v };
            if (!v) logic.multiOffMap = logic.state.mapConfig;
            if (v && SMALL_FIX.R812 && newMAC.areas.length >= 2) {
              const m = logic.state.gameModeConfig.mode;
              newMAC.areas = firstAreaAfterToggle(newMAC.areas, () => createDefaultArea('Area 1'), logic.state.mapConfig, logic.multiOffMap, m === 'old-dreadnoughts' || isPortalMode(m), logic.state.shapeSpawnConfig, logic.state.spawnRate);
            } else if (v && newMAC.areas.length === 0) {
              newMAC.areas = firstAreaAfterToggle(newMAC.areas, () => createDefaultArea('Area 1'), logic.state.mapConfig, null, false, logic.state.shapeSpawnConfig, logic.state.spawnRate);
              newMAC.activeAreaId = newMAC.areas[0].id;
            } else if (v && newMAC.areas.length === 1) {
              const only = newMAC.areas[0];
              newMAC.areas = [{ ...only, mapConfig: { ...logic.state.mapConfig } }];
              newMAC.activeAreaId = only.id;
            }
            logic.clearMapEditHistory();
            cancelMapEditInteraction(logic.mapEditor);
            logic.updateState({ multiAreaConfig: newMAC });
            forceRender(n => n + 1);
            if (!logic.state.isTestMode) {
              if (regenTimerRef.current !== null) clearTimeout(regenTimerRef.current);
              regenTimerRef.current = setTimeout(async () => {
                regenTimerRef.current = null;
                await scheduleRegen();
                if (!v) logic.fitMapToView();
              }, 50);
            }
          }}
        />

        <Reveal when={multiArea.enableMultiArea}>
          <div className="space-y-3">
            <div className="k-list">
              <VirtualList count={multiArea.areas.length} rowHeight={AREA_ROW_H} maxRows={AREA_ROWS} revealNew
                rowKey={i => multiArea.areas[i].id}
                renderRow={idx => { const area = multiArea.areas[idx]; return (
                <div
                  onClick={() => selectArea(area.id)}
                  onContextMenu={e => {
                    if ((e.target as Element).tagName === 'INPUT') return;
                    const row = e.currentTarget;
                    openContextMenu(e, [
                      { label: 'Edit', icon: SlidersHorizontal, disabled: multiArea.activeAreaId === area.id, onSelect: () => selectArea(area.id) },
                      { label: 'Rename', icon: Pencil, onSelect: () => { const inp = row.querySelector('input'); if (inp) { inp.focus(); inp.select(); } } },
                      ...(multiArea.areas.length > 1 ? ['sep' as const, { label: 'Remove Area', icon: Trash2, onSelect: () => removeArea(area.id) }] : []),
                    ]);
                  }}
                  className={`k-list-row cursor-pointer${multiArea.activeAreaId === area.id ? ' k-list-row-on' : ''}`}
                >
                  <Layers size={13} className={`shrink-0 ${multiArea.activeAreaId === area.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`} />
                  <input
                    type="text"
                    value={area.name}
                    onChange={e => { e.stopPropagation(); renameArea(area.id, e.target.value); }}
                    onClick={e => e.stopPropagation()}
                    {...(SMALL_FIX.R806 ? {
                      maxLength: 32,
                      onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                        const clean = e.target.value.replace(/\s+/g, ' ').trim();
                        const nm = clean || firstFreeName('Area', multiArea.areas.filter(a => a.id !== area.id).map(a => a.name));
                        if (nm !== area.name) renameArea(area.id, nm);
                      },
                    } : {})}
                    className={`flex-1 bg-transparent border-none outline-none text-xs min-w-0 ${multiArea.activeAreaId === area.id ? '[font-weight:var(--fw-head)]' : ''}`}
                    placeholder={`Area ${idx + 1}`}
                  />
                  <Fade when={multiArea.areas.length > 1} keep>
                    <button
                      onClick={e => { e.stopPropagation(); removeArea(area.id); }}
                      className="k-list-del"
                      aria-label={`Remove ${area.name || `Area ${idx + 1}`}`}
                      title="Remove area"
                    >
                      <Trash2 size={12} />
                    </button>
                  </Fade>
                </div>
); }} />
            </div>

            <button
              onClick={addArea}
              className="k-btn k-btn-secondary k-btn-sm w-full"
            >
              <Plus size={12} /> Add Area
            </button>

            <Reveal when={multiArea.areas.length > 1}>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <RowLabel label="Layout" help="Far apart: every area is a world of its own, as before. Near: the areas lie side by side like the portal maps, with a grey gap between them that nothing can walk through." className="w-24 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Segmented block value={multiArea.areaLayout === 'near' ? 'near' : 'far'}
                      onChange={v => updateMultiAreaConfig({ areaLayout: v === 'near' ? 'near' : undefined })}
                      options={[{ value: 'far', label: 'Far Apart' }, { value: 'near', label: 'Near' }]} />
                  </div>
                </div>
                <Reveal when={multiArea.areaLayout === 'near'}>
                  {() => {
                    const _ai = multiArea.areas.findIndex(a => a.id === multiArea.activeAreaId);
                    const _area = _ai > 0 ? multiArea.areas[_ai] : null;
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <RowLabel label="Gap Before" help={`The distance from the area before this one, in units: ${AREA_GAP_MIN} to ${AREA_GAP_MAX.toLocaleString()} (the portal maps' own gap). Pick an area in the list to set its gap; the first area has none.`} className="w-24 shrink-0" />
                          {_area !== null ? (
                            <CommitNumberInput value={areaGapOf(_area)} ariaLabel="Gap before this area"
                              onCommit={v => {
                                const g = areaGapOf({ gapBefore: v });
                                if (g === areaGapOf(_area)) return;
                                updateMultiAreaConfig({ areas: multiArea.areas.map(a => a.id === _area.id ? { ...a, gapBefore: g } : a) });
                              }}
                              className="k-field flex-1 min-w-0 tabular-nums" />
                          ) : (
                            <span className="k-hint flex-1 min-w-0">The first area has no area before it</span>
                          )}
                        </div>
                        <ToggleItem
                          label="Minimap Shows All Areas"
                          checked={multiArea.minimapAllAreas === true}
                          desc="The minimap shows every area and the gaps between them, not only the area you are in."
                          onChange={v => updateMultiAreaConfig({ minimapAllAreas: v ? true : undefined })}
                        />
                      </div>
                    );
                  }}
                </Reveal>
              </div>
            </Reveal>

            <Reveal when={multiArea.areas.length > 1}>
              <BotSpawnAreasSection logic={logic} multiArea={multiArea} forceRender={forceRender} />
            </Reveal>
          </div>
        </Reveal>
      </CollapsibleSection>

      <CollapsibleSection title="Export / Import" icon={headerIcon(HdInboxDownload)} defaultOpen={false} handle={exportFold}>
        <div className="flex items-center gap-2">
          <RowLabel label="Map Name" help="The map's name. An exported map file is named after it." className="w-24 shrink-0" />
          <input
            type="text"
            value={config.name}
            onChange={e => updateConfig({ name: e.target.value })}
            className="k-field flex-1"
            placeholder="Untitled Map"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="k-btn k-btn-secondary k-btn-md k-btn-compact flex-1"
          >
            <Download size={14} />
            Export
          </button>
          <div className="flex-1 min-w-0">
            <ImportButton logic={logic} block compact onImportFile={() => { void handleImport(); }} onFolderImported={() => forceRender(n => n + 1)} />
          </div>
        </div>
      </CollapsibleSection>

      <MapLibrarySlot flag={mapLibFlag} rockFlag={rockLibFlag} logic={logic} config={config} library={mapLibrary}
        onPickRock={pattern => { const patch = rockCardPickPatch(config, pattern); if (patch) updateConfig(patch); }}
        onLoadMaze={(type, seed) => {
          const patch = mazeCardLoadPatch(config, type, seed);
          if (patch === null) return;
          updateConfig(patch);
          fireTip('mazeTypeChanged');
        }}
        onLoadCustom={() => {
          const patch = mazeTypePickPatch(config, MAZE_TYPE_CUSTOM);
          if (patch === null) return;
          updateConfig(patch);
          fireTip('customEditorOpened');
        }}
        onLoadMode={(key, item) => {
          const go = () => {
            if (item) logic.applyGameModeFile(item.fileData.data as unknown as GameModeFile);
            else if (key) { const c = resolveEngineModeConfig(key); logic.applyGameMode(c); logic.regenerateMap(); }
            forceRender(n => n + 1);
          };
          if (SMALL_FIX.R898 !== 0) {
            const work = logic.worldHoldsWork(activeAreaId);
            const goClean = () => { logic.convertCustomMapsToGenerated(); go(); };
            if (work && (logic.state.gameModeConfig.mode !== 'sandbox' || SMALL_FIX.R898S !== 0)) void askBeforeModeSwitch(item ? item.name : key ? engineModeLabel(key) : 'This mode').then(ok => { if (ok) goClean(); });
            else goClean();
          } else if (logic.worldHasHandRows(activeAreaId) || logic.isCustomMapActive()) void askChoice('This Map Holds Work', 'This mode takes the place of this map, its Map Events and its Custom Areas.', [{ value: 'yes', label: 'Use This Mode', primary: true }, { value: 'no', label: 'Cancel' }], 'no').then(a => { if (a === 'yes') { logic.convertCustomMapsToGenerated(); go(); } });
          else go();
        }}
        onLoadFile={item => applyImportedFile(item.fileData, false)}
        onSaveFile={file => { void saveMapFile(file, `map-${(file.name || 'map').toLowerCase().replace(/\s+/g, '-')}.json`); }}
        onRemove={item => {
          const at = logic.state.tankLibrary.indexOf(item);
          logic.removeFromLibrary(item.id);
          if (SMALL_FIX.R811 && at >= 0) showToast('success', `Removed "${item.name}" from the library.`, { label: 'Undo', run: sameProjectUndo(logic, showToast, () => logic.restoreToLibrary(item, at)) });
        }}
        onImport={() => { void handleImport(); }}
        onFolderImported={() => forceRender(n => n + 1)}
        onSaveCurrent={() => { void handleExport(); }} />

      <div className="px-1">
        <div className="k-hint space-y-0.5 tabular-nums">
          <div>Grid: {activeMapState?.gridCells ?? config.gridCells}x{activeMapState?.gridCellsY ?? gridCellsYOf(config)} | Cell: {cellSize}u | Map: {(activeMapState?.mapHalf ?? mapHalf) * 2}x{(activeMapState?.mapHalfY ?? mapHalfY) * 2}u</div>
          <div>Walls: {activeMapState?.walls.filter(w => w.active).length ?? 0} | Rocks: {activeMapState?.rocks.length ?? 0} | Portals: {isCustom ? editPortals(config).length : (activeMapState?.portals.length ?? 0)}{isCustom ? ` | Zones: ${editZones(config).length}` : ''}</div>
        </div>
      </div>

      {pendingMapLoad && (
        <ConfirmDialog title="Load map"
          message={`This map replaces your world of ${pendingMapLoad.areas} areas. Loading it removes those areas.`}
          confirmLabel="Load"
          onConfirm={() => { const p = pendingMapLoad; setPendingMapLoad(null); applyImportedFile(p.file, p.record, true); }}
          onClose={() => setPendingMapLoad(null)} />
      )}

      {scaleConflict && (
        <MapScaleConflictPopup
          rockCount={scaleConflict.rockIds.length}
          portalCount={scaleConflict.portalIds.length}
          menuScale={menuScale}
          onRemove={confirmScaleConflict}
          onCancel={() => setScaleConflict(null)}
        />
      )}
    </ScrollArea>
  );
};
