import { MAP_EVENTS } from './mapEventsSwitch';
import { docHasWork, DEFAULT_SIDE, newEventsDoc, takeId, zoneShapeOf, shiftShape, type EntityType, type PlacedEntity } from './mapEvents/doc';
import { BASE_AREAS, zoneBaseTeam, teamBaseRow } from './baseAreas';
import { PLACED_PORTALS } from './placedPortalsSwitch';
import { shapeBox, shapeCellBox, shapeToBox, shapeOnGrid, shapeCellPoints, polyHas, type AreaShape } from './areaShape';
import {
  TileType, MAZE_TYPE_CUSTOM,
  type MapConfig, type MapState, type MultiAreaMapConfig,
  type CustomMapData, type MapTweaks,
  type PlacedWall, type PlacedRock, type PlacedZone, type PlacedPortal, type ZoneKind, type MapPaint,
  createCustomMapData, createMapTweaks, TEAM_NAMES,
} from '@/types';
import type { AreaBounds } from './MapSystem';
import { GRID_SPACING, PORTAL_TILE_SIZE, PORTAL_EVENT_HORIZON, PORTAL_BODY_RADIUS, GEN_ROCK_SIZES } from './constants';
import { SMALL_FIX } from './smallFixSwitch';
import { isPortalWorldAreaId } from './portalModes';

export const MAP_EDIT_MAX_WALLS = 4000;
export const MAP_EDIT_MAX_ROCKS = 2000;
export const MAP_EDIT_MAX_ZONES = 1000;
export const MAP_READ_MAX_ZONES = 4 * MAP_EDIT_MAX_ZONES;
export const MAP_EDIT_MAX_PORTALS = 16;
export const MAP_EDIT_MAX_ENTITIES = 256;

export const MAP_EDIT_WALL_MIN_CELLS = 1;
export const MAP_EDIT_WALL_MAX_CELLS = 8;

export const MAP_EDIT_ROCK_MIN_SIZE = 8;
export const MAP_EDIT_ROCK_MAX_SIZE = 150;

const ROCK_SIZE_REF_CELL = 150;

export function rockSizeLimits(cellSize: number): { min: number; max: number } {
  const s = cellSize > 0 ? cellSize / ROCK_SIZE_REF_CELL : 1;
  return { min: MAP_EDIT_ROCK_MIN_SIZE * s, max: MAP_EDIT_ROCK_MAX_SIZE * s };
}

export const GEN_ROCK_SIZE_MIN = GEN_ROCK_SIZES.gravel * 0.5;
export const GEN_ROCK_SIZE_MAX = GEN_ROCK_SIZES.rock * 1.5;

export function rockSizeHeldLimits(cellSize: number): { min: number; max: number } {
  const l = rockSizeLimits(cellSize);
  return { min: Math.min(l.min, GEN_ROCK_SIZE_MIN), max: Math.max(l.max, GEN_ROCK_SIZE_MAX) };
}

export const MAP_EDIT_UNDO_LIMIT = 50;

export const MAP_EDIT_DRAG_THRESHOLD_PX = 4;

export const MAP_GENERATION_KEYS: readonly string[] = [
  'mazeType', 'seed', 'gridCells', 'gridCellsY', 'mapScale', 'enableMaze', 'erosionIntensity',
  'enableRocks', 'rockDensity', 'rockTypes', 'rocksLeftOut', 'rockPattern',
  'rockExclusionZone', 'rockExclusionSize', 'rockSizeVariation',
  'enableSpawnAreas', 'spawnAreaTeamCount', 'spawnZoneSync', 'spawnZoneScales',
  'rockTiles',
];

export const MAP_CONFIG_NON_GENERATION_KEYS: readonly string[] = [
  'name',
  'enableBaseProtectors', 'baseProtectorTeams', 'baseProtectorPush',
  'baseProtectorPushStrength', 'baseProtectorRange', 'baseProtectorOnMinimap',
  'enableBossSpawns', 'bossInitialDelay', 'bossSpawnCooldown', 'bossGroups', 'bossesCanGrow',
  'bossesUsePortals',
  'events',
];

export function zoneGenWords(z: PlacedZone): unknown {
  const out: Record<string, unknown> = { id: z.id, gx: z.gx, gy: z.gy, cw: z.cw, ch: z.ch, team: z.team, kind: z.kind, color: z.color, colorMap: z.colorMap, colorFree: z.colorFree, opacity: z.opacity };
  if (MAP_EVENTS.ON === 0) { out.bounce = z.bounce; out.spare = z.spare; }
  if (z.more) out.more = z.more;
  if (z.shape) out.shape = z.shape;
  if (z.fill) out.fill = z.fill;
  const doors = (z.behaviors ?? []).filter(b => b.k === 'door');
  if (doors.length > 0) out.doors = doors.map(b => (b.off ? 0 : 1));
  if ((z as { clearWalls?: boolean }).clearWalls) out.clearWalls = true;
  if (BASE_AREAS.ON !== 0) { const t = zoneBaseTeam(z); if (t >= 0) out.base = t; }
  return out;
}

export function changedOfPartial(partial: Partial<MapConfig>, cfg: MapConfig): Partial<MapConfig> | null {
  if (!SMALL_FIX.R805) return partial;
  const out = { ...partial } as Record<string, unknown>;
  const was = cfg as unknown as Record<string, unknown>;
  for (let i = 0; i < MAP_GENERATION_KEYS.length; i++) {
    const k = MAP_GENERATION_KEYS[i];
    if (k in out && JSON.stringify(out[k]) === JSON.stringify(was[k])) delete out[k];
  }
  return Object.keys(out).length > 0 ? (out as Partial<MapConfig>) : null;
}

export function touchesMapGeneration(partial: Record<string, unknown>): boolean {
  for (let i = 0; i < MAP_GENERATION_KEYS.length; i++) {
    if (MAP_GENERATION_KEYS[i] in partial) return true;
  }
  return false;
}

export const ROCK_GAP = 10;

const PORTAL_ROCK_CLEAR = PORTAL_TILE_SIZE * 0.8;

export type MapEditorTool = 'none' | 'select' | 'wall' | 'rock' | 'zone' | 'portal' | 'eraser' | 'entity';
export type MapEditorKind = 'wall' | 'rock' | 'zone' | 'portal' | 'entity';
export type RockKind = 'rock' | 'stone' | 'gravel';
export type AreaToolShape = 'rect' | 'ellipse' | 'poly' | 'free';

export interface MapEditorSelection {
  areaId: string;
  kind: MapEditorKind;
  id: number;
  genKey: string;
}

export interface EditIgnore {
  wallGx: number; wallGy: number; wallCw: number; wallCh: number;
  zoneGx: number; zoneGy: number; zoneCw: number; zoneCh: number;
  rockIdx: number;
  portalGx: number; portalGy: number; portalOn: boolean;
}

export const EDIT_IGNORE: EditIgnore = {
  wallGx: 0, wallGy: 0, wallCw: 0, wallCh: 0,
  zoneGx: 0, zoneGy: 0, zoneCw: 0, zoneCh: 0,
  rockIdx: -1,
  portalGx: 0, portalGy: 0, portalOn: false,
};

export function clearEditIgnore(ig: EditIgnore): EditIgnore {
  ig.wallCw = 0; ig.wallCh = 0;
  ig.zoneCw = 0; ig.zoneCh = 0;
  ig.rockIdx = -1;
  ig.portalOn = false;
  return ig;
}

export interface EditAreaRef {
  areaId: string;
  areaIndex: number;
  cfg: MapConfig;
  state: MapState;
  offX: number;
  offY: number;
  host?: MapEditorHost;
}

export interface MapEditorHost {
  mapState: MapState | null;
  areaStates: MapState[];
  areaBounds: AreaBounds[];
  state: { mapConfig: MapConfig; multiAreaConfig: MultiAreaMapConfig };
  mapEntityRadius?(placedId: number, areaId?: string): number;
}

const _areaRef: EditAreaRef = {
  areaId: '', areaIndex: -1,
  cfg: null as unknown as MapConfig,
  state: null as unknown as MapState,
  offX: 0, offY: 0,
};

export function resolveEditArea(host: MapEditorHost, worldX: number, worldY: number): EditAreaRef | null {
  _areaRef.host = host;
  const bounds = host.areaBounds;
  const states = host.areaStates;
  if (states.length > 0 && bounds.length > 0) {
    const areas = host.state.multiAreaConfig.areas;
    for (let i = 0; i < bounds.length; i++) {
      const b = bounds[i];
      if (worldX < b.minX || worldX > b.maxX || worldY < b.minY || worldY > b.maxY) continue;
      const ms = states[i];
      const ac = areas[i];
      if (!ms || !ac || ms.areaId !== b.id || ac.id !== b.id) return null;
      _areaRef.areaId = b.id;
      _areaRef.areaIndex = i;
      _areaRef.cfg = ac.mapConfig;
      _areaRef.state = ms;
      _areaRef.offX = b.centerX;
      _areaRef.offY = b.centerY;
      return _areaRef;
    }
    return null;
  }
  const ms = host.mapState;
  if (!ms) return null;
  _areaRef.areaId = '';
  _areaRef.areaIndex = -1;
  _areaRef.cfg = host.state.mapConfig;
  _areaRef.state = ms;
  _areaRef.offX = 0;
  _areaRef.offY = 0;
  return _areaRef;
}

export function activeMapConfig(host: MapEditorHost): MapConfig {
  const mac = host.state.multiAreaConfig;
  if (mac.enableMultiArea && mac.areas.length > 0) {
    const a = mac.areas.find(x => x.id === mac.activeAreaId) || mac.areas[0];
    return a.mapConfig;
  }
  return host.state.mapConfig;
}

export function isCustomMap(cfg: MapConfig): boolean {
  return cfg.mazeType === MAZE_TYPE_CUSTOM;
}

export function hostHasCustomMap(host: MapEditorHost): boolean {
  const mac = host.state.multiAreaConfig;
  if (mac.enableMultiArea && mac.areas.length > 0) {
    for (let i = 0; i < mac.areas.length; i++) {
      if (SMALL_FIX.CC041 !== 0 && isPortalWorldAreaId(mac.areas[i].id)) continue;
      if (isCustomMap(mac.areas[i].mapConfig)) return true;
    }
    return false;
  }
  return isCustomMap(host.state.mapConfig);
}

const EMPTY_WALLS: readonly PlacedWall[] = [];
const EMPTY_ROCKS: readonly PlacedRock[] = [];
const EMPTY_ZONES: readonly PlacedZone[] = [];
const EMPTY_PORTALS: readonly PlacedPortal[] = [];

export function mapLayoutKey(cfg: MapConfig): string {
  const c = cfg as unknown as Record<string, unknown>;
  let s = '';
  for (let i = 0; i < MAP_GENERATION_KEYS.length; i++) {
    if (MAP_GENERATION_KEYS[i] === 'rocksLeftOut') continue;
    if (MAP_GENERATION_KEYS[i] === 'gridCellsY' && (c.gridCellsY === undefined || c.gridCellsY === c.gridCells)) continue;
    if (MAP_GENERATION_KEYS[i] === 'rockTiles' && c.rockPattern !== 'tiles') continue;
    s += _layoutCanon(c[MAP_GENERATION_KEYS[i]]) + '|';
  }
  return s;
}

export function rocksOnlyConfig(cfg: MapConfig): MapConfig {
  const leftOut = cfg.rocksLeftOut ?? [];
  const add: ('stone' | 'gravel')[] = [];
  for (let i = 0; i < cfg.rockTypes.length; i++) {
    const t = cfg.rockTypes[i];
    if (t !== 'rock' && !leftOut.includes(t) && !add.includes(t)) add.push(t);
  }
  const cm = cfg.customMap, mt = cfg.mapTweaks;
  const cmSmall = !!cm && cm.rocks.some(r => r.kind !== 'rock');
  const mtSmall = !!mt && mt.rocks.some(r => r.kind !== 'rock');
  if (add.length === 0 && !cmSmall && !mtSmall) return cfg;
  const out: MapConfig = { ...cfg };
  if (add.length > 0) out.rocksLeftOut = [...leftOut, ...add];
  if (cmSmall) out.customMap = { ...cm!, rocks: cm!.rocks.filter(r => r.kind === 'rock') };
  if (mtSmall) out.mapTweaks = { ...mt!, rocks: mt!.rocks.filter(r => r.kind === 'rock') };
  return out;
}
function _layoutCanon(v: unknown): string {
  if (v === undefined) return '~';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) { let s = '['; for (let i = 0; i < v.length; i++) s += (i ? ',' : '') + _layoutCanon(v[i]); return s + ']'; }
  const o = v as Record<string, unknown>; const keys = Object.keys(o).sort();
  let s = '{'; for (let i = 0; i < keys.length; i++) s += (i ? ',' : '') + keys[i] + ':' + _layoutCanon(o[keys[i]]); return s + '}';
}
export function mapTweaksLive(cfg: MapConfig): boolean {
  const mt = cfg.mapTweaks;
  return !mt || mt.layoutKey === undefined || mt.layoutKey === mapLayoutKey(cfg);
}
export function clearMapHandEdits(cfg: MapConfig): void {
  if (cfg.mapTweaks) cfg.mapTweaks = { nextId: cfg.mapTweaks.nextId, walls: [], rocks: [], removedRockKeys: [] };
  const to = cfg.tileOverrides;
  if (to) {
    let next: Record<string, TileType> | null = null;
    for (const k in to) if (to[k] === TileType.NORMAL) { if (next === null) next = { ...to }; delete next[k]; }
    if (next !== null) cfg.tileOverrides = next;
  }
}

export function gridResizeShift(now: number, was: number): number {
  return SMALL_FIX.R794 ? Math.floor(now / 2) - Math.floor(was / 2) : Math.floor((now - was) / 2);
}

export function portalLinksAfterPick<L extends { portalId: number; destinationAreaId: string }>(links: readonly L[], portalId: number, val: string, exists: (id: number) => boolean): L[] {
  const out = links.filter(l => l.portalId !== portalId && !(SMALL_FIX.R796 && val && l.destinationAreaId === val && !exists(l.portalId)));
  if (val) out.push({ portalId, destinationAreaId: val } as L);
  return out;
}

export function portalExitExists(row: { exitAreaId?: string; exitPortalId?: number }, own: MapConfig, areas: readonly { id: string; mapConfig: MapConfig }[], ownAreaId: string | undefined): boolean {
  const pid = row.exitPortalId ?? -1;
  if (pid < 0) return false;
  if (!SMALL_FIX.R801) return true;
  const cfg = !row.exitAreaId || row.exitAreaId === ownAreaId ? own : areas.find(a => a.id === row.exitAreaId)?.mapConfig;
  if (!cfg) return false;
  const rows = builtPortalRows(cfg);
  return rows !== null ? rows.some(p => p.id === pid) : (SMALL_FIX.R826 && !cfg.enablePortals ? false : pid < (cfg.portalCount || 0));
}

export function firstFreeName(prefix: string, taken: readonly string[], letters = false): string {
  for (let i = 0; i < 1000; i++) {
    const nm = letters && i < 26 ? `${prefix} ${String.fromCharCode(65 + i)}` : `${prefix} ${letters ? i - 25 : i + 1}`;
    if (!taken.includes(nm)) return nm;
  }
  return prefix;
}

export function mapHasHandWork(cfg: MapConfig): boolean {
  if (MAP_EVENTS.ON !== 0 && ((cfg.mapAreas && cfg.mapAreas.zones.length > 0) || docHasWork(cfg.events))) return true;
  const cm = cfg.customMap;
  if (cm && (cm.walls.length > 0 || cm.rocks.length > 0 || cm.zones.length > 0 || cm.portals.length > 0)) return true;
  const t = cfg.mapTweaks as unknown as Record<string, unknown> | undefined;
  if (t) for (const k in t) { const v = t[k]; if (Array.isArray(v) && v.length > 0) return true; }
  return false;
}

export function firstAreaAfterToggle<A extends { mapConfig: MapConfig; shapeSpawnConfig: unknown; spawnRate: number }>(
  areas: readonly A[], newArea: () => A, shown: MapConfig, offMap: MapConfig | null, ownLayout: boolean, shapes: unknown, spawnRate: number,
): A[] {
  if (areas.length === 0) {
    const first = newArea();
    first.mapConfig = { ...shown };
    if (SMALL_FIX.R815) { first.shapeSpawnConfig = structuredClone(shapes); first.spawnRate = spawnRate; }
    return [first];
  }
  if (areas.length === 1) return [{ ...areas[0], mapConfig: { ...shown } }];
  if (!SMALL_FIX.R812 || ownLayout || shown === offMap) return [...areas];
  return [{ ...areas[0], mapConfig: { ...shown } }, ...areas.slice(1)];
}

export function handEditsDropFor(live: MapConfig, partial: Partial<MapConfig>): Partial<MapConfig> | null {
  const merged = { ...live, ...partial } as MapConfig;
  if (isCustomMap(merged)) return null;
  const mt = live.mapTweaks;
  const madeOn = mt && mt.layoutKey !== undefined ? mt.layoutKey : (!isCustomMap(live) ? mapLayoutKey(live) : null);
  if (madeOn === null || mapLayoutKey(merged) === madeOn) return null;
  const cleared = { ...merged };
  clearMapHandEdits(cleared);
  let out: Partial<MapConfig> | null = null;
  if (cleared.mapTweaks !== merged.mapTweaks) out = { mapTweaks: cleared.mapTweaks };
  if (cleared.tileOverrides !== merged.tileOverrides) out = { ...(out ?? {}), tileOverrides: cleared.tileOverrides };
  return out;
}

export function editWalls(cfg: MapConfig): readonly PlacedWall[] {
  return (isCustomMap(cfg) ? cfg.customMap?.walls : (mapTweaksLive(cfg) ? cfg.mapTweaks?.walls : undefined)) ?? EMPTY_WALLS;
}
export function editRocks(cfg: MapConfig): readonly PlacedRock[] {
  return (isCustomMap(cfg) ? cfg.customMap?.rocks : (mapTweaksLive(cfg) ? cfg.mapTweaks?.rocks : undefined)) ?? EMPTY_ROCKS;
}
export function editZones(cfg: MapConfig): readonly PlacedZone[] {
  if (isCustomMap(cfg)) return cfg.customMap?.zones ?? EMPTY_ZONES;
  return (MAP_EVENTS.ON !== 0 ? cfg.mapAreas?.zones : undefined) ?? EMPTY_ZONES;
}
export function editEntities(cfg: MapConfig): readonly PlacedEntity[] {
  return (MAP_EVENTS.ON !== 0 ? cfg.events?.placed : undefined) ?? EMPTY_ENTITIES;
}
const EMPTY_ENTITIES: readonly PlacedEntity[] = [];
export function editPortals(cfg: MapConfig): readonly PlacedPortal[] {
  if (isCustomMap(cfg)) return cfg.customMap?.portals ?? EMPTY_PORTALS;
  return (PLACED_PORTALS.ON !== 0 ? cfg.mapPortals?.portals : undefined) ?? EMPTY_PORTALS;
}
export function builtPortalRows(cfg: MapConfig): readonly PlacedPortal[] | null {
  if (isCustomMap(cfg)) return editPortals(cfg);
  if (SMALL_FIX.R909 !== 0 && PLACED_PORTALS.ON !== 0 && cfg.mapPortals) return cfg.mapPortals.portals;
  return null;
}
function portalHome(cfg: MapConfig): { portals: PlacedPortal[]; nextId: number } | null {
  if (isCustomMap(cfg)) return cfg.customMap ?? null;
  if (PLACED_PORTALS.ON === 0) return null;
  if (!cfg.mapPortals) cfg.mapPortals = { nextId: MAP_EDIT_MAX_PORTALS, portals: [] };
  return cfg.mapPortals;
}
export function portalAppearOf(cfg: MapConfig, p: PlacedPortal): 'fixed' | 'map' | 'area' {
  if (p.appear === 'fixed' || p.appear === 'map' || p.appear === 'area') return p.appear;
  return isCustomMap(cfg) ? 'fixed' : 'map';
}
export function opPortalAppear(cfg: MapConfig, id: number, appear: 'fixed' | 'map' | 'area', inArea?: number): void {
  const h = portalHome(cfg);
  if (!h) return;
  h.portals = h.portals.map(q => (q.id === id ? { ...q, appear, staticPos: appear === 'fixed', ...(appear === 'area' && typeof inArea === 'number' ? { inArea } : {}) } : q));
  if (appear !== 'area') h.portals = h.portals.map(q => { if (q.id !== id) return q; const n = { ...q }; delete n.inArea; return n; });
}

export function editRemovedRockKeys(cfg: MapConfig): readonly string[] {
  return (isCustomMap(cfg) || !mapTweaksLive(cfg) ? undefined : cfg.mapTweaks?.removedRockKeys) ?? EMPTY_KEYS;
}
const EMPTY_KEYS: readonly string[] = [];

export interface MapEditorState {
  tool: MapEditorTool;
  selection: MapEditorSelection;
  hasSelection: boolean;

  wallCells: number;
  rockSize: number;
  rockRotation: number;
  rockKind: RockKind;
  wallPaint: MapPaint | null;
  rockPaint: MapPaint | null;
  zoneTeam: 0 | 1 | 2 | 3;
  portalStatic: boolean;
  entityType: number;
  entityTank: string;
  focusNameOf: number;
  zoneResizeId: number;
  zoneResizeRect: number;
  zoneAddTo: number;
  marks: number[];
  zoneShape: AreaToolShape;
  zoneSides: number;
  zoneFx0: number; zoneFy0: number; zoneFx1: number; zoneFy1: number;
  freePts: number[]; freeAreaId: string; freeX: number; freeY: number; freeActive: boolean;
  vtxDrag: number; vtxShape: AreaShape | null; vtxOrig: AreaShape | null; vtxStartX: number; vtxStartY: number;
  vtxHover: number; vtxEdge: number; vtxEdgeX: number; vtxEdgeY: number;
  vtxSel: number;
  vtxSels: number[];
  vtxMoved: boolean; vtxCurX: number; vtxCurY: number; vtxPendX: number; vtxPendY: number; vtxNx: number; vtxNy: number;
  vtxMode: boolean;
  zoneDragShaped: boolean;
  lastPressT: number; lastPressX: number; lastPressY: number;
  modShift: boolean; modAlt: boolean;

  hasHover: boolean;
  hoverKind: MapEditorKind;
  hoverId: number;
  hoverGenKey: string;
  hoverAreaId: string;
  hoverX: number; hoverY: number; hoverW: number; hoverH: number;
  hoverR: number;
  hoverRotation: number;

  hasGhost: boolean;
  ghostValid: boolean;
  ghostKind: MapEditorKind;
  ghostX: number; ghostY: number;
  ghostW: number; ghostH: number;
  ghostR: number;
  ghostRot: number;
  ghostLookDx: number; ghostLookDy: number;
  ghostTeam: number;
  ghostZone: PlacedZone | null;
  pendGx: number; pendGy: number;
  pendCx: number; pendCy: number;

  zoneDragActive: boolean;
  zoneDragValid: boolean;
  zoneDragAreaId: string;
  zoneAnchorGx: number; zoneAnchorGy: number;
  zoneGx: number; zoneGy: number; zoneCw: number; zoneCh: number;

  clickArmed: boolean;
  clickX: number;
  clickY: number;
  pressTool: boolean;
  dragArmed: boolean;
  dragActive: boolean;
  dragAreaId: string;
  dragStartScreenX: number; dragStartScreenY: number;
  dragGrabDX: number; dragGrabDY: number;
  dragRockIdx: number;

  placeStrokeActive: boolean;
  eraseStrokeActive: boolean;
  strokeAreaId: string;
  strokeButton: number;
  strokeLastWorldX: number; strokeLastWorldY: number;
  strokeHasLast: boolean;
  deleteFlashAt: number;

  cacheState: MapState | null;
}

export function createMapEditorState(): MapEditorState {
  return {
    tool: 'none',
    selection: { areaId: '', kind: 'wall', id: -1, genKey: '' },
    hasSelection: false,

    wallCells: 1,
    rockSize: rockDefaultSize('rock'),
    rockRotation: 0,
    rockKind: 'rock',
    wallPaint: null,
    rockPaint: null,
    zoneTeam: 0,
    portalStatic: true,

    hasHover: false,
    hoverKind: 'wall', hoverId: -1, hoverGenKey: '', hoverAreaId: '',
    hoverX: 0, hoverY: 0, hoverW: 0, hoverH: 0, hoverR: 0, hoverRotation: 0,

    hasGhost: false,
    ghostValid: false,
    ghostKind: 'wall',
    ghostX: 0, ghostY: 0, ghostW: 0, ghostH: 0, ghostR: 0,
    ghostRot: 0, ghostTeam: 0, ghostZone: null,
    ghostLookDx: 0, ghostLookDy: 0,
    pendGx: 0, pendGy: 0, pendCx: 0, pendCy: 0,

    zoneDragActive: false,
    zoneDragValid: false,
    zoneDragAreaId: '',
    entityType: -1,
    entityTank: '',
    focusNameOf: -1,
    zoneResizeId: -1,
    zoneResizeRect: -1,
    zoneAddTo: -1,
    marks: [],
    zoneShape: 'rect', zoneSides: 6,
    zoneFx0: 0, zoneFy0: 0, zoneFx1: 0, zoneFy1: 0,
    freePts: [], freeAreaId: '', freeX: 0, freeY: 0, freeActive: false,
    vtxDrag: -1, vtxShape: null, vtxOrig: null, vtxStartX: 0, vtxStartY: 0,
    vtxHover: -1, vtxEdge: -1, vtxEdgeX: 0, vtxEdgeY: 0, vtxSel: -1, vtxSels: [], vtxMode: false, zoneDragShaped: false,
    vtxMoved: false, vtxCurX: 0, vtxCurY: 0, vtxPendX: 0, vtxPendY: 0, vtxNx: 0, vtxNy: 0,
    lastPressT: 0, lastPressX: 0, lastPressY: 0,
    modShift: false, modAlt: false,
    zoneAnchorGx: 0, zoneAnchorGy: 0,
    zoneGx: 0, zoneGy: 0, zoneCw: 0, zoneCh: 0,

    clickArmed: false, clickX: 0, clickY: 0, pressTool: false,

    dragArmed: false,
    dragActive: false,
    dragAreaId: '',
    dragStartScreenX: 0, dragStartScreenY: 0,
    dragGrabDX: 0, dragGrabDY: 0,
    dragRockIdx: -1,

    placeStrokeActive: false,
    eraseStrokeActive: false,
    strokeAreaId: '',
    strokeButton: 0,
    strokeLastWorldX: 0, strokeLastWorldY: 0,
    strokeHasLast: false,
    deleteFlashAt: 0,

    cacheState: null,
  };
}

export function cancelMapEditInteraction(me: MapEditorState): void {
  me.clickArmed = false;
  if (me.pressTool) { me.pressTool = false; if (me.tool === 'select') me.tool = 'none'; }
  me.dragArmed = false;
  me.dragActive = false;
  me.dragRockIdx = -1;
  me.zoneDragActive = false;
  me.zoneResizeId = -1;
  me.zoneAddTo = -1;
  me.freeActive = false; me.freePts.length = 0; me.freeAreaId = '';
  me.vtxDrag = -1; me.vtxShape = null; me.vtxOrig = null; me.vtxHover = -1; me.vtxEdge = -1; me.zoneDragShaped = false;
  me.placeStrokeActive = false;
  me.eraseStrokeActive = false;
  me.strokeHasLast = false;
  me.hasGhost = false;
  me.hasHover = false;
  me.cacheState = null;
}

export function clearMapEditSelection(me: MapEditorState): void {
  me.vtxSel = -1; me.vtxSels = []; me.vtxMode = false;
  me.hasSelection = false;
  me.selection.id = -1;
  me.selection.genKey = '';
  me.selection.areaId = '';
}

export function setMapEditSelection(me: MapEditorState, sel: MapEditorSelection): void {
  if (!me.hasSelection || me.selection.id !== sel.id || me.selection.kind !== sel.kind || me.selection.areaId !== sel.areaId) { me.vtxMode = false; me.vtxSel = -1; me.vtxSels = []; }
  me.selection.areaId = sel.areaId;
  me.selection.kind = sel.kind;
  me.selection.id = sel.id;
  me.selection.genKey = sel.genKey;
  me.hasSelection = true;
}

export function ensureEditContainer(cfg: MapConfig): CustomMapData | MapTweaks {
  if (isCustomMap(cfg)) {
    if (!cfg.customMap) cfg.customMap = createCustomMapData();
    return cfg.customMap;
  }
  if (!cfg.mapTweaks) cfg.mapTweaks = createMapTweaks();
  return cfg.mapTweaks;
}

export function takeEditId(container: CustomMapData | MapTweaks): number {
  const id = container.nextId;
  container.nextId = id + 1;
  return id;
}

export function rockShapeFor(kind: RockKind): number {
  return kind === 'rock' ? -9 : -7;
}
export function rockDefaultSize(kind: RockKind, cellSize: number = ROCK_SIZE_REF_CELL): number {
  const base = kind === 'rock' ? 60 : kind === 'stone' ? 32 : 16;
  const s = cellSize > 0 ? cellSize / ROCK_SIZE_REF_CELL : 1;
  return base * s;
}

export function snapCell(localCoord: number, mapHalf: number, cellSize: number, gc: number): number {
  const c = Math.floor((localCoord + mapHalf) / cellSize);
  return c < 0 ? 0 : (c >= gc ? gc - 1 : c);
}

export function snapFineToCellCoord(localCoord: number, mapHalf: number, cellSize: number): number {
  const snapped = Math.round((localCoord + mapHalf) / GRID_SPACING) * GRID_SPACING;
  return snapped / cellSize;
}

export function cellCoordToLocal(c: number, mapHalf: number, cellSize: number): number {
  return -mapHalf + c * cellSize;
}

export function cellCenterLocal(g: number, mapHalf: number, cellSize: number): number {
  return -mapHalf + (g + 0.5) * cellSize;
}

export function generatedRockKey(localX: number, localY: number): string {
  return Math.round(localX) + '|' + Math.round(localY);
}

function cellIgnoredByWall(ig: EditIgnore | null, gx: number, gy: number): boolean {
  if (!ig || ig.wallCw < 1 || ig.wallCh < 1) return false;
  return gx >= ig.wallGx && gx < ig.wallGx + ig.wallCw
      && gy >= ig.wallGy && gy < ig.wallGy + ig.wallCh;
}

function cellIgnoredByZone(ig: EditIgnore | null, gx: number, gy: number): boolean {
  if (!ig || ig.zoneCw < 1 || ig.zoneCh < 1) return false;
  return gx >= ig.zoneGx && gx < ig.zoneGx + ig.zoneCw
      && gy >= ig.zoneGy && gy < ig.zoneGy + ig.zoneCh;
}

function circleHitsBox(cx: number, cy: number, r: number,
                       bx: number, by: number, bhw: number, bhh: number): boolean {
  const nx = cx < bx - bhw ? bx - bhw : (cx > bx + bhw ? bx + bhw : cx);
  const ny = cy < by - bhh ? by - bhh : (cy > by + bhh ? by + bhh : cy);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function keepsSpawnable(state: MapState, consumedCells: number): boolean {
  return state.spawnableTiles.length - consumedCells >= 1;
}

export function canPlaceWall(
  ref: EditAreaRef, gx: number, gy: number, cw: number, ch: number, ig: EditIgnore | null
): boolean {
  const st = ref.state;
  const gc = st.gridCells, cs = st.cellSize, mh = st.mapHalf;
  const gcY = st.gridCellsY, mhY = st.mapHalfY;
  if (cw < MAP_EDIT_WALL_MIN_CELLS || ch < MAP_EDIT_WALL_MIN_CELLS) return false;
  if (gx < 0 || gy < 0 || gx + cw > gc || gy + ch > gcY) return false;

  let newlyCovered = 0;
  for (let x = gx; x < gx + cw; x++) {
    for (let y = gy; y < gy + ch; y++) {
      if (cellIgnoredByWall(ig, x, y)) continue;
      if (st.tileGrid[x * gcY + y] !== TileType.NORMAL) return false;
      newlyCovered++;
    }
  }
  if (!keepsSpawnable(st, newlyCovered)) return false;

  const bx = -mh + (gx + cw / 2) * cs;
  const by = -mhY + (gy + ch / 2) * cs;
  const bhw = (cw * cs) / 2;
  const bhh = (ch * cs) / 2;
  for (let i = 0; i < st.rocks.length; i++) {
    if (ig && ig.rockIdx === i) continue;
    const r = st.rocks[i];
    if (!r.active) continue;
    if (circleHitsBox(r.x - ref.offX, r.y - ref.offY, r.size, bx, by, bhw, bhh)) return false;
  }

  const portals = editPortals(ref.cfg);
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];
    if (ig && ig.portalOn && p.gx === ig.portalGx && p.gy === ig.portalGy) continue;
    if (p.gx >= gx && p.gx < gx + cw && p.gy >= gy && p.gy < gy + ch) return false;
  }
  return true;
}

export function canPlaceRock(
  ref: EditAreaRef, localX: number, localY: number, size: number, ig: EditIgnore | null, walls = true
): boolean {
  const st = ref.state;
  const gc = st.gridCells, cs = st.cellSize, mh = st.mapHalf;
  const gcY = st.gridCellsY, mhY = st.mapHalfY;
  const _rl = rockSizeHeldLimits(cs);
  if (size < _rl.min - 1e-6 || size > _rl.max + 1e-6) return false;

  const limit = mh - size;
  const limitY = mhY - size;
  if (localX > limit || localX < -limit || localY > limitY || localY < -limitY) return false;

  const minGx = Math.max(0, Math.floor((localX - size + mh) / cs));
  const maxGx = Math.min(gc - 1, Math.floor((localX + size + mh) / cs));
  const minGy = Math.max(0, Math.floor((localY - size + mhY) / cs));
  const maxGy = Math.min(gcY - 1, Math.floor((localY + size + mhY) / cs));
  for (let x = minGx; x <= maxGx; x++) {
    for (let y = minGy; y <= maxGy; y++) {
      const t = st.tileGrid[x * gcY + y];
      if (t >= TileType.BASE_BLUE && t <= TileType.BASE_PURPLE && !cellIgnoredByZone(ig, x, y)) return false;
    }
  }

  if (walls) for (let x = minGx; x <= maxGx; x++) {
    for (let y = minGy; y <= maxGy; y++) {
      if (cellIgnoredByWall(ig, x, y)) continue;
      const wIdx = st.wallGrid[x * gcY + y];
      if (wIdx < 0) continue;
      const w = st.walls[wIdx];
      if (!w || !w.active) continue;
      if (circleHitsBox(localX, localY, size, w.x - ref.offX, w.y - ref.offY, w.halfW, w.halfH)) return false;
    }
  }

  for (let i = 0; i < st.rocks.length; i++) {
    if (ig && ig.rockIdx === i) continue;
    const r = st.rocks[i];
    if (!r.active) continue;
    const dx = localX - (r.x - ref.offX), dy = localY - (r.y - ref.offY);
    const reach = size + r.size + ROCK_GAP;
    if (dx * dx + dy * dy < reach * reach) return false;
  }

  const portals = editPortals(ref.cfg);
  const eventHorizon = PORTAL_EVENT_HORIZON;
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];
    if (ig && ig.portalOn && p.gx === ig.portalGx && p.gy === ig.portalGy) continue;
    const dx = localX - cellCenterLocal(p.gx, mh, cs);
    const dy = localY - cellCenterLocal(p.gy, mhY, cs);
    const reach = size + eventHorizon;
    if (dx * dx + dy * dy < reach * reach) return false;
  }
  return true;
}

export function canPlacePortal(
  ref: EditAreaRef, gx: number, gy: number, ig: EditIgnore | null
): boolean {
  const st = ref.state;
  const gc = st.gridCells, cs = st.cellSize, mh = st.mapHalf;
  const gcY = st.gridCellsY, mhY = st.mapHalfY;
  if (gx < 0 || gy < 0 || gx >= gc || gy >= gcY) return false;

  if (!cellIgnoredByWall(ig, gx, gy) && st.tileGrid[gx * gcY + gy] === TileType.WALL) return false;

  const px = cellCenterLocal(gx, mh, cs);
  const py = cellCenterLocal(gy, mhY, cs);
  const clear2 = PORTAL_ROCK_CLEAR * PORTAL_ROCK_CLEAR;
  for (let i = 0; i < st.rocks.length; i++) {
    if (ig && ig.rockIdx === i) continue;
    const r = st.rocks[i];
    if (!r.active) continue;
    const dx = px - (r.x - ref.offX), dy = py - (r.y - ref.offY);
    if (dx * dx + dy * dy < clear2) return false;
  }

  const portals = editPortals(ref.cfg);
  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];
    if (ig && ig.portalOn && p.gx === ig.portalGx && p.gy === ig.portalGy) continue;
    if (p.gx === gx && p.gy === gy) return false;
  }
  return true;
}

function zoneSparesType(words: readonly string[] | undefined, type: EntityType | null): boolean {
  if (!words) return false;
  if (type === null) { for (let i = 0; i < words.length; i++) if (words[i] === DEFAULT_SIDE || words[i].startsWith('cat:') || words[i].startsWith('tank:')) return true; return false; }
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === type.side.team) return true;
    if (w === 'bossCamp' && type.side.camp === 'boss') return true;
    if (w === 'bosses' && type.bossTier === true) return true;
    if (w === 'type:' + type.id) return true;
    if (w.startsWith('cat:') || w.startsWith('tank:')) return true;
    if (w.startsWith('tag:')) for (const f of type.forms) if (f.tags) for (const t of f.tags) if ('tag:' + t.id === w) return true;
  }
  return false;
}
export function canPlaceEntity(ref: EditAreaRef, lx: number, ly: number, r: number, type: EntityType | null, ignoreRock: EditIgnore | null): boolean {
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf, mhY = st.mapHalfY;
  if (lx - r < -mh || lx + r > mh || ly - r < -mhY || ly + r > mhY) return false;
  if (!canPlaceRock(ref, lx, ly, Math.max(1, r), ignoreRock, !(SMALL_FIX.GH454 && type?.inWalls === true))) return false;
  const gx = (lx + mh) / cs, gy = (ly + mhY) / cs;
  const zones = editZones(ref.cfg);
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const rows = z.behaviors;
    let bad = false;
    if (Array.isArray(rows)) { for (let b = 0; b < rows.length && !bad; b++) if ((rows[b].k === 'kill' && !zoneSparesType(rows[b].a.whitelist as string[] | undefined, type)) || rows[b].k === 'bounce') bad = true; }
    else if (z.kind === 'kill') bad = !zoneSparesType(z.spare, type);
    else if (z.kind === 'bouncy') bad = true;
    if (!bad) continue;
    if (gx >= z.gx && gx < z.gx + z.cw && gy >= z.gy && gy < z.gy + z.ch) return false;
    if (z.more) for (let m = 0; m < z.more.length; m++) { const q = z.more[m]; if (gx >= q.gx && gx < q.gx + q.cw && gy >= q.gy && gy < q.gy + q.ch) return false; }
  }
  return true;
}

export function canPlaceZone(
  ref: EditAreaRef, gx: number, gy: number, cw: number, ch: number, ignoreZoneId: number, asBase: boolean = false
): boolean {
  const st = ref.state;
  const gc = st.gridCells;
  const gcY = st.gridCellsY;
  if (cw < 1 || ch < 1) return false;
  if (gx < 0 || gy < 0 || gx + cw > gc || gy + ch > gcY) return false;

  const zones = editZones(ref.cfg);
  const isBaseZone = (z: PlacedZone): boolean => (BASE_AREAS.ON !== 0 ? zoneBaseTeam(z) >= 0 : !z.kind || z.kind === 'base');
  const me = ignoreZoneId >= 0 ? zones.find(z => z.id === ignoreZoneId) : undefined;
  const placingBase = me ? isBaseZone(me) : asBase;
  if (MAP_EVENTS.ON !== 0 && !placingBase) return true;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.id === ignoreZoneId) continue;
    if (MAP_EVENTS.ON !== 0 && !isBaseZone(z)) continue;
    if (gx < z.gx + z.cw && gx + cw > z.gx && gy < z.gy + z.ch && gy + ch > z.gy) return false;
  }
  return true;
}

export function findPortalConflictsAtScale(
  cm: CustomMapData, cellSize: number,
  prevCm?: CustomMapData, prevCellSize?: number,
): { rockIds: number[]; portalIds: number[] } {
  const portals = cm.portals, rocks = cm.rocks, walls = cm.walls;
  const _was = SMALL_FIX.CH039 !== 0 && prevCm !== undefined && prevCellSize !== undefined && prevCellSize > 0
    && prevCm.portals.length === portals.length && prevCm.rocks.length === rocks.length;
  const pcs = _was ? prevCellSize! : 0;
  const empty = { rockIds: [] as number[], portalIds: [] as number[] };
  if (portals.length === 0) return empty;

  const n = portals.length;
  const px: number[] = new Array(n), py: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = (portals[i].gx + 0.5) * cellSize;
    py[i] = (portals[i].gy + 0.5) * cellSize;
  }

  const adj: number[][] = new Array(n);
  const wallHit: boolean[] = new Array(n);
  const half = PORTAL_TILE_SIZE / 2;
  for (let i = 0; i < n; i++) { adj[i] = []; wallHit[i] = false; }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = px[i] - px[j], dy = py[i] - py[j];
      if (dx * dx + dy * dy < PORTAL_TILE_SIZE * PORTAL_TILE_SIZE) {
        if (_was) { const ox = (portals[i].gx - portals[j].gx) * pcs, oy = (portals[i].gy - portals[j].gy) * pcs; if (ox * ox + oy * oy < PORTAL_TILE_SIZE * PORTAL_TILE_SIZE) continue; }
        adj[i].push(j); adj[j].push(i);
      }
    }
    for (let w = 0; w < walls.length; w++) {
      const wl = walls[w];
      const x0 = wl.gx * cellSize, y0 = wl.gy * cellSize;
      const x1 = x0 + wl.cw * cellSize, y1 = y0 + wl.ch * cellSize;
      if (px[i] + half > x0 && px[i] - half < x1 && py[i] + half > y0 && py[i] - half < y1) {
        if (_was) {
          const qx = (portals[i].gx + 0.5) * pcs, qy = (portals[i].gy + 0.5) * pcs;
          const a0 = wl.gx * pcs, b0 = wl.gy * pcs, a1 = a0 + wl.cw * pcs, b1 = b0 + wl.ch * pcs;
          if (qx + half > a0 && qx - half < a1 && qy + half > b0 && qy - half < b1) continue;
        }
        wallHit[i] = true;
        break;
      }
    }
  }

  const alive: boolean[] = new Array(n).fill(true);
  for (;;) {
    let worst = -1, worstCount = 0;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      let c = wallHit[i] ? 1 : 0;
      for (let a = 0; a < adj[i].length; a++) if (alive[adj[i][a]]) c++;
      if (c > worstCount || (c === worstCount && c > 0 && worst >= 0 && portals[i].id > portals[worst].id)) {
        worst = i; worstCount = c;
      }
    }
    if (worst < 0 || worstCount === 0) break;
    alive[worst] = false;
  }

  const portalIds: number[] = [];
  for (let i = 0; i < n; i++) if (!alive[i]) portalIds.push(portals[i].id);

  const rockIds: number[] = [];
  for (let r = 0; r < rocks.length; r++) {
    const rk = rocks[r];
    const rx = rk.cx * cellSize, ry = rk.cy * cellSize;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const dx = rx - px[i], dy = ry - py[i];
      const need = Math.max(PORTAL_ROCK_CLEAR, rk.size + PORTAL_EVENT_HORIZON);
      if (dx * dx + dy * dy < need * need) {
        if (_was) {
          const pr = prevCm!.rocks[r], ox = pr.cx * pcs - (portals[i].gx + 0.5) * pcs, oy = pr.cy * pcs - (portals[i].gy + 0.5) * pcs;
          const pneed = Math.max(PORTAL_ROCK_CLEAR, pr.size + PORTAL_EVENT_HORIZON);
          if (ox * ox + oy * oy < pneed * pneed) continue;
        }
        rockIds.push(rk.id); break;
      }
    }
  }

  return { rockIds, portalIds };
}

const _hit: MapEditorSelection = { areaId: '', kind: 'wall', id: -1, genKey: '' };

export function hitTestEntity(
  ref: EditAreaRef, localX: number, localY: number, allowPortalsAndZones: boolean,
  wallIndex?: Map<number, number> | null, skip?: (h: MapEditorSelection) => boolean
): MapEditorSelection | null {
  for (let i = 0; i < HIT_ORDER.length; i++) {
    const d = MAP_KIND_CORE[HIT_ORDER[i]];
    if ((d.customOnly && !allowPortalsAndZones) || !d.hit(ref, localX, localY, wallIndex)) continue;
    if (skip !== undefined && skip(_hit)) continue;
    return _hit;
  }
  return null;
}

export function hitMapObject(ref: EditAreaRef, localX: number, localY: number): MapEditorSelection | null {
  return hitEntity(ref, localX, localY) || hitZone(ref, localX, localY) ? _hit : null;
}

export function portalBuiltAt(ref: EditAreaRef, p: PlacedPortal): { x: number; y: number } | null {
  if (PLACED_PORTALS.ON === 0 || portalAppearOf(ref.cfg, p) === 'fixed') return null;
  const e = ref.state.portals.find(q => q.id === p.id);
  return e ? { x: e.x - ref.offX, y: e.y - ref.offY } : null;
}

function hitPortal(ref: EditAreaRef, localX: number, localY: number): boolean {
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf, mhY = st.mapHalfY;
  const portals = editPortals(ref.cfg);
  const grab = PORTAL_EVENT_HORIZON;
  for (let i = portals.length - 1; i >= 0; i--) {
    const p = portals[i];
    const at = portalBuiltAt(ref, p);
    const dx = localX - (at ? at.x : cellCenterLocal(p.gx, mh, cs));
    const dy = localY - (at ? at.y : cellCenterLocal(p.gy, mhY, cs));
    if (dx * dx + dy * dy <= grab * grab) {
      _hit.areaId = ref.areaId; _hit.kind = 'portal'; _hit.id = p.id; _hit.genKey = '';
      return true;
    }
  }
  return false;
}

function hitRock(ref: EditAreaRef, localX: number, localY: number): boolean {
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf, mhY = st.mapHalfY;
  for (let i = st.rocks.length - 1; i >= 0; i--) {
    const r = st.rocks[i];
    if (!r.active) continue;
    const rlx = r.x - ref.offX, rly = r.y - ref.offY;
    const dx = localX - rlx, dy = localY - rly;
    if (dx * dx + dy * dy > r.size * r.size) continue;
    const placed = findPlacedRockAt(ref.cfg, rlx, rly, mh, cs, r.size, mhY);
    _hit.areaId = ref.areaId; _hit.kind = 'rock';
    _hit.id = placed ? placed.id : -1;
    _hit.genKey = placed ? '' : generatedRockKey(rlx, rly);
    return true;
  }
  return false;
}

function hitZone(ref: EditAreaRef, localX: number, localY: number): boolean {
  const st = ref.state;
  const gx = snapCell(localX, st.mapHalf, st.cellSize, st.gridCells);
  const gy = snapCell(localY, st.mapHalfY, st.cellSize, st.gridCellsY);
  const zones = editZones(ref.cfg);
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    let on = gx >= z.gx && gx < z.gx + z.cw && gy >= z.gy && gy < z.gy + z.ch;
    const sh = on ? zoneShapeOf(z) : null;
    if (sh !== null) on = polyHas(zoneCellPoly(z, sh), (localX + st.mapHalf) / st.cellSize, (localY + st.mapHalfY) / st.cellSize);
    if (!on && z.more && sh === null) for (let m = 0; m < z.more.length && !on; m++) { const q = z.more[m]; on = gx >= q.gx && gx < q.gx + q.cw && gy >= q.gy && gy < q.gy + q.ch; }
    if (on) {
      _hit.areaId = ref.areaId; _hit.kind = 'zone'; _hit.id = z.id; _hit.genKey = '';
      return true;
    }
  }
  return false;
}

const _cellPolys = new WeakMap<object, Float64Array>();
export function zoneCellPoly(_z: PlacedZone, sh: AreaShape): Float64Array {
  let p = _cellPolys.get(sh);
  if (p === undefined) { p = shapeCellPoints(sh); _cellPolys.set(sh, p); }
  return p;
}

const ENTITY_GRAB_MIN = 14;
function hitEntity(ref: EditAreaRef, localX: number, localY: number): boolean {
  const list = editEntities(ref.cfg);
  if (list.length === 0) return false;
  const st = ref.state;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    const at = entityShownCell(ref.cfg.events, e);
    const dx = localX - cellCoordToLocal(at.cx, st.mapHalf, st.cellSize), dy = localY - cellCoordToLocal(at.cy, st.mapHalfY, st.cellSize);
    const r = Math.max(ref.host?.mapEntityRadius?.(e.id, ref.areaId) ?? 0, ENTITY_GRAB_MIN);
    if (dx * dx + dy * dy <= r * r) {
      _hit.areaId = ref.areaId; _hit.kind = 'entity'; _hit.id = e.id; _hit.genKey = '';
      return true;
    }
  }
  return false;
}

function hitWall(ref: EditAreaRef, localX: number, localY: number, wallIndex?: Map<number, number> | null): boolean {
  const st = ref.state;
  const gcY = st.gridCellsY;
  const gx = snapCell(localX, st.mapHalf, st.cellSize, st.gridCells);
  const gy = snapCell(localY, st.mapHalfY, st.cellSize, gcY);
  const cellIdx = gx * gcY + gy;
  const wIdx = st.wallGrid[cellIdx];
  if (wIdx >= 0 && st.walls[wIdx] && st.walls[wIdx].active) {
    const placedId = wallIndex
      ? (wallIndex.get(cellIdx) ?? -1)
      : (findPlacedWallAtCell(ref.cfg, gx, gy)?.id ?? -1);
    _hit.areaId = ref.areaId; _hit.kind = 'wall';
    _hit.id = placedId;
    _hit.genKey = placedId >= 0 ? '' : (gx + ',' + gy);
    return true;
  }
  return false;
}

export function findPlacedWallAtCell(cfg: MapConfig, gx: number, gy: number): PlacedWall | null {
  const walls = editWalls(cfg);
  for (let i = walls.length - 1; i >= 0; i--) {
    const w = walls[i];
    if (gx >= w.gx && gx < w.gx + w.cw && gy >= w.gy && gy < w.gy + w.ch) return w;
  }
  return null;
}

export function buildPlacedWallIndex(cfg: MapConfig, gc: number, built?: BuiltWalls, gcY: number = gc): Map<number, number> {
  const index = new Map<number, number>();
  const walls = editWalls(cfg);
  let free: Map<string, number> | null = null;
  if (built) {
    free = new Map();
    const cs = built.cellSize, mh = built.mapHalf, mhY = built.mapHalfY ?? built.mapHalf;
    for (let i = 0; i < built.walls.length; i++) {
      const bw = built.walls[i];
      const k = Math.round((bw.x - built.offX - bw.halfW + mh) / cs) + ',' + Math.round((bw.y - built.offY - bw.halfH + mhY) / cs)
        + ',' + Math.round((bw.halfW * 2) / cs) + ',' + Math.round((bw.halfH * 2) / cs);
      free.set(k, (free.get(k) ?? 0) + 1);
    }
  }
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (free) {
      const k = w.gx + ',' + w.gy + ',' + w.cw + ',' + w.ch;
      const n = free.get(k) ?? 0;
      if (n <= 0) continue;
      free.set(k, n - 1);
    }
    for (let x = w.gx; x < w.gx + w.cw; x++) {
      if (x < 0 || x >= gc) continue;
      for (let y = w.gy; y < w.gy + w.ch; y++) {
        if (y < 0 || y >= gcY) continue;
        index.set(x * gcY + y, w.id);
      }
    }
  }
  return index;
}

export interface BuiltWalls {
  walls: ReadonlyArray<{ x: number; y: number; halfW: number; halfH: number }>;
  mapHalf: number;
  mapHalfY?: number;
  cellSize: number;
  offX: number;
  offY: number;
}

export function findPlacedRockAt(
  cfg: MapConfig, localX: number, localY: number, mapHalf: number, cellSize: number, size?: number, mapHalfY: number = mapHalf
): PlacedRock | null {
  const rocks = editRocks(cfg);
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    if (size !== undefined && r.size !== size) continue;
    if (cellCoordToLocal(r.cx, mapHalf, cellSize) === localX
        && cellCoordToLocal(r.cy, mapHalfY, cellSize) === localY) return r;
  }
  return null;
}

export function findPlacedZone(cfg: MapConfig, id: number): PlacedZone | null {
  const zones = editZones(cfg);
  for (let i = 0; i < zones.length; i++) if (zones[i].id === id) return zones[i];
  return null;
}

const _shownCell = { cx: 0, cy: 0, spot: -1 };
export function entityShownCell(doc: { types?: readonly EntityType[] } | null | undefined, e: PlacedEntity): { readonly cx: number; readonly cy: number; readonly spot: number } {
  _shownCell.cx = e.cx; _shownCell.cy = e.cy; _shownCell.spot = -1;
  const spots = e.spots;
  if (SMALL_FIX.GH713 === 0 || !Array.isArray(spots) || spots.length === 0) return _shownCell;
  const type = doc?.types?.find(t => t.id === e.type.id);
  if (!type || !Array.isArray(type.forms) || type.forms.length === 0) return _shownCell;
  let start = type.forms[0].id;
  if (typeof e.startForm === 'number') for (let i = 0; i < type.forms.length; i++) if (type.forms[i].id === e.startForm) { start = e.startForm; break; }
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    if (s && s.form === start && typeof s.cx === 'number' && typeof s.cy === 'number') { _shownCell.cx = s.cx; _shownCell.cy = s.cy; _shownCell.spot = i; break; }
  }
  return _shownCell;
}
export function entityStartFormId(doc: { types?: readonly EntityType[] } | null | undefined, e: PlacedEntity): number {
  if (typeof e.startForm !== 'number') return -1;
  const type = doc?.types?.find(t => t.id === e.type.id);
  if (!type || !Array.isArray(type.forms)) return -1;
  for (let i = 0; i < type.forms.length; i++) if (type.forms[i].id === e.startForm) return i === 0 ? -1 : e.startForm;
  return -1;
}
export function opMoveEntityShown(cfg: MapConfig, id: number, cx: number, cy: number): void {
  const e = findPlacedEntity(cfg, id);
  if (!e || !cfg.events?.placed) return;
  const k = entityShownCell(cfg.events, e).spot;
  if (k < 0) { opMoveEntity(cfg, id, cx, cy); return; }
  cfg.events = { ...cfg.events, placed: cfg.events.placed.map(p => (p.id === id ? { ...p, spots: (p.spots ?? []).map((s, i) => (i === k ? { ...s, cx, cy } : s)) } : p)) };
}

export function findPlacedEntity(cfg: MapConfig, id: number): PlacedEntity | null {
  const list = editEntities(cfg);
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

export function findPlacedPortal(cfg: MapConfig, id: number): PlacedPortal | null {
  const portals = editPortals(cfg);
  for (let i = 0; i < portals.length; i++) if (portals[i].id === id) return portals[i];
  return null;
}

export function findPlacedWall(cfg: MapConfig, id: number): PlacedWall | null {
  const walls = editWalls(cfg);
  for (let i = 0; i < walls.length; i++) if (walls[i].id === id) return walls[i];
  return null;
}

export function findPlacedRock(cfg: MapConfig, id: number): PlacedRock | null {
  const rocks = editRocks(cfg);
  for (let i = 0; i < rocks.length; i++) if (rocks[i].id === id) return rocks[i];
  return null;
}

export function resolveGeneratedWall(st: MapState, genKey: string): { idx: number } | null {
  const comma = genKey.indexOf(',');
  if (comma < 0) return null;
  const gx = parseInt(genKey.slice(0, comma), 10);
  const gy = parseInt(genKey.slice(comma + 1), 10);
  const gc = st.gridCells;
  const gcY = st.gridCellsY;
  if (!(gx >= 0 && gx < gc && gy >= 0 && gy < gcY)) return null;
  const wIdx = st.wallGrid[gx * gcY + gy];
  if (wIdx < 0 || !st.walls[wIdx] || !st.walls[wIdx].active) return null;
  return { idx: wIdx };
}

export function resolveGeneratedRock(st: MapState, genKey: string, offX: number, offY: number): number {
  for (let i = 0; i < st.rocks.length; i++) {
    const r = st.rocks[i];
    if (r.active && generatedRockKey(r.x - offX, r.y - offY) === genKey) return i;
  }
  return -1;
}

function containerOf(cfg: MapConfig): CustomMapData | MapTweaks {
  return isCustomMap(cfg) ? cfg.customMap! : cfg.mapTweaks!;
}

export function opPlaceWall(cfg: MapConfig, gx: number, gy: number, cw: number, ch: number, lookGx: number = gx, lookGy: number = gy, paint?: MapPaint | null): number {
  const c = containerOf(cfg);
  if (c.walls.length >= MAP_EDIT_MAX_WALLS) return -1;
  const id = takeEditId(c);
  const w: PlacedWall = lookGx === gx && lookGy === gy ? { id, gx, gy, cw, ch } : { id, gx, gy, cw, ch, lookGx, lookGy };
  if (paint) w.paint = { ...paint };
  c.walls.push(w);
  return id;
}

export function opPlaceRock(
  cfg: MapConfig, cx: number, cy: number, size: number, rotation: number, kind: RockKind,
  lookCx: number = cx, lookCy: number = cy, paint?: MapPaint | null,
): number {
  const c = containerOf(cfg);
  if (c.rocks.length >= MAP_EDIT_MAX_ROCKS) return -1;
  const id = takeEditId(c);
  const r: PlacedRock = lookCx === cx && lookCy === cy ? { id, cx, cy, size, rotation, kind } : { id, cx, cy, size, rotation, kind, lookCx, lookCy };
  if (paint) r.paint = { ...paint };
  c.rocks.push(r);
  return id;
}

export function opPlacePortal(cfg: MapConfig, gx: number, gy: number, staticPos: boolean): number {
  if (PLACED_PORTALS.ON !== 0 && !isCustomMap(cfg)) {
    const h = portalHome(cfg)!;
    if (h.portals.length >= MAP_EDIT_MAX_PORTALS) return -1;
    let id = Math.max(h.nextId, MAP_EDIT_MAX_PORTALS);
    for (const q of h.portals) if (q.id >= id) id = q.id + 1;
    h.nextId = id + 1;
    h.portals.push({ id, gx, gy, staticPos, appear: staticPos ? 'fixed' : 'map' });
    cfg.enablePortals = true;
    return id;
  }
  if (!cfg.customMap) return -1;
  const c = cfg.customMap;
  if (c.portals.length >= MAP_EDIT_MAX_PORTALS) return -1;
  let id = takeEditId(c);
  while (id < MAP_EDIT_MAX_PORTALS) id = takeEditId(c);
  c.portals.push({ id, gx, gy, staticPos });
  cfg.enablePortals = true;
  return id;
}

export function opWriteZone(
  cfg: MapConfig, id: number, gx: number, gy: number, cw: number, ch: number,
  team: 0 | 1 | 2 | 3, mapHalf: number, cellSize: number, newKind: ZoneKind = 'base', mapHalfY: number = mapHalf
): number {
  const c = zoneHome(cfg);
  if (!c) return -1;

  const x0 = -mapHalf + gx * cellSize;
  const y0 = -mapHalfY + gy * cellSize;
  const x1 = x0 + cw * cellSize;
  const y1 = y0 + ch * cellSize;

  const old = id >= 0 ? c.zones.find(z => z.id === id) : undefined;
  const isBase = old ? (BASE_AREAS.ON !== 0 ? zoneBaseTeam(old) >= 0 : !old.kind || old.kind === 'base') : newKind === 'base';
  if (isBase) clearUnderRect(cfg, gx, gy, cw, ch, mapHalf, cellSize, mapHalfY);

  if (id >= 0) {
    c.zones = c.zones.map(z => {
      if (z.id !== id) return z;
      const next: PlacedZone = { ...z, id, gx, gy, cw, ch, team };
      if (z.more && z.more.length > 0 && z.cw === cw && z.ch === ch && (z.gx !== gx || z.gy !== gy)) next.more = z.more.map(m => ({ ...m, gx: m.gx + gx - z.gx, gy: m.gy + gy - z.gy }));
      const sh = zoneShapeOf(z);
      if (sh !== null) {
        const moved = z.cw === cw && z.ch === ch;
        const s2 = moved ? shiftShape(sh, gx - z.gx, gy - z.gy) : shapeToBox(sh, shapeBox(sh, { x0: 0, y0: 0, x1: 0, y1: 0 }), gx, gy, gx + cw, gy + ch);
        next.shape = s2;
        const b = shapeCellBox(s2);
        next.gx = b.gx; next.gy = b.gy; next.cw = b.cw; next.ch = b.ch;
      }
      return next;
    });
    return id;
  }
  if (c.zones.length >= MAP_EDIT_MAX_ZONES) return -1;
  const newId = c.nextId++;
  if (newKind === 'base' && BASE_AREAS.ON !== 0 && MAP_EVENTS.ON !== 0) {
    const doc = cfg.events ? { ...cfg.events } : newEventsDoc();
    c.zones.push({ id: newId, gx, gy, cw, ch, team, kind: 'cosmetic', uid: takeId(doc), name: firstFreeName(`${TEAM_NAMES[team] ?? 'Team'} Base`, c.zones.map(q => q.name ?? '')), behaviors: [teamBaseRow(takeId(doc), team)] });
    cfg.events = doc;
    return newId;
  }
  if (newKind === 'base') { c.zones.push({ id: newId, gx, gy, cw, ch, team }); return newId; }
  const z: PlacedZone = { id: newId, gx, gy, cw, ch, team, kind: newKind };
  if (MAP_EVENTS.ON !== 0) {
    const doc = cfg.events ? { ...cfg.events } : newEventsDoc();
    z.uid = takeId(doc);
    z.name = firstFreeName('Area', c.zones.map(q => q.name ?? ''));
    cfg.events = doc;
  }
  c.zones.push(z);
  return newId;
}

export function clearUnderRect(cfg: MapConfig, gx: number, gy: number, cw: number, ch: number, mapHalf: number, cellSize: number, mapHalfY: number = mapHalf): void {
  const cm = cfg.customMap;
  if (!cm || !isCustomMap(cfg)) return;
  const x0 = -mapHalf + gx * cellSize, y0 = -mapHalfY + gy * cellSize;
  const x1 = x0 + cw * cellSize, y1 = y0 + ch * cellSize;
  cm.walls = cm.walls.filter(w =>
    !(gx < w.gx + w.cw && gx + cw > w.gx && gy < w.gy + w.ch && gy + ch > w.gy));
  cm.rocks = cm.rocks.filter(r => {
    const rx = cellCoordToLocal(r.cx, mapHalf, cellSize);
    const ry = cellCoordToLocal(r.cy, mapHalfY, cellSize);
    return !(rx + r.size > x0 && rx - r.size < x1 && ry + r.size > y0 && ry - r.size < y1);
  });
  cm.portals = cm.portals.filter(p =>
    !(p.gx >= gx && p.gx < gx + cw && p.gy >= gy && p.gy < gy + ch));
}

function zoneHome(cfg: MapConfig): { zones: PlacedZone[]; nextId: number } | null {
  if (cfg.customMap && isCustomMap(cfg)) return cfg.customMap;
  if (MAP_EVENTS.ON === 0) return null;
  if (!cfg.mapAreas) cfg.mapAreas = { nextId: 1, zones: [] };
  return cfg.mapAreas;
}
export function opPatchZone(cfg: MapConfig, id: number, patch: Partial<PlacedZone>): void {
  const c = zoneHome(cfg);
  if (c) c.zones = c.zones.map(z => (z.id === id ? { ...z, ...patch } : z));
}
export function opShapeZone(cfg: MapConfig, id: number, shape: AreaShape | null, gc: number, gcY: number): void {
  const c = zoneHome(cfg);
  if (!c) return;
  c.zones = c.zones.map(z => {
    if (z.id !== id) return z;
    const next: PlacedZone = { ...z };
    delete next.more;
    if (shape === null) { delete next.shape; return next; }
    const s = shapeOnGrid(shape, gc, gcY);
    const b = shapeCellBox(s);
    next.shape = s;
    next.gx = Math.max(0, b.gx); next.gy = Math.max(0, b.gy);
    next.cw = Math.max(1, Math.min(gc - next.gx, b.cw)); next.ch = Math.max(1, Math.min(gcY - next.gy, b.ch));
    return next;
  });
}
export function opZoneRect(cfg: MapConfig, id: number, rect: number, gx: number, gy: number, cw: number, ch: number): void {
  const c = zoneHome(cfg);
  if (!c) return;
  c.zones = c.zones.map(z => {
    if (z.id !== id) return z;
    if (rect < 0) return { ...z, gx, gy, cw, ch };
    const more = (z.more ?? []).slice();
    if (rect < more.length) more[rect] = { gx, gy, cw, ch };
    return { ...z, more };
  });
}
export function opAddZoneRect(cfg: MapConfig, id: number, gx: number, gy: number, cw: number, ch: number): void {
  const c = zoneHome(cfg);
  if (c) c.zones = c.zones.map(z => (z.id === id ? { ...z, more: [...(z.more ?? []), { gx, gy, cw, ch }] } : z));
}
export function opRemoveZoneRect(cfg: MapConfig, id: number, rect: number): void {
  const c = zoneHome(cfg);
  if (c) c.zones = c.zones.map(z => {
    if (z.id !== id || !z.more) return z;
    const more = z.more.filter((_, i) => i !== rect);
    const next = { ...z };
    if (more.length) next.more = more; else delete next.more;
    return next;
  });
}

export function opPlaceEntity(cfg: MapConfig, typeId: number, tank: string, tankName: string, cx: number, cy: number): { id: number; typeId: number } {
  const doc = cfg.events ? { ...cfg.events } : newEventsDoc();
  let type = doc.types?.find(t => t.id === typeId);
  if (!type) {
    if (!tank) return { id: -1, typeId: -1 };
    const names = (doc.types ?? []).map(t => t.name);
    type = { id: takeId(doc), name: names.includes(tankName) ? firstFreeName(tankName, names) : tankName, side: { team: DEFAULT_SIDE }, stands: true, forms: [{ id: takeId(doc), name: 'Form 1', tank }] };
    doc.types = [...(doc.types ?? []), type];
  }
  const id = takeId(doc);
  const row: PlacedEntity = { id, name: firstFreeName(type.name, (doc.placed ?? []).map(p => p.name)), type: { id: type.id, n: type.name }, cx, cy };
  doc.placed = [...(doc.placed ?? []), row];
  cfg.events = doc;
  return { id, typeId: type.id };
}
export function opMoveEntity(cfg: MapConfig, id: number, cx: number, cy: number): void {
  if (!cfg.events?.placed) return;
  cfg.events = { ...cfg.events, placed: cfg.events.placed.map(e => (e.id === id ? { ...e, cx, cy } : e)) };
}

export function opMoveWall(cfg: MapConfig, id: number, gx: number, gy: number): void {
  const c = containerOf(cfg);
  c.walls = c.walls.map(w => (w.id === id ? { ...w, gx, gy, lookGx: w.lookGx ?? w.gx, lookGy: w.lookGy ?? w.gy } : w));
}

export function opResizeWall(cfg: MapConfig, id: number, cw: number, ch: number): void {
  const c = containerOf(cfg);
  c.walls = c.walls.map(w => (w.id === id ? { ...w, cw, ch } : w));
}

export function opPaintWall(cfg: MapConfig, id: number, paint: MapPaint | undefined): void {
  const c = containerOf(cfg);
  c.walls = c.walls.map(w => { if (w.id !== id) return w; const n = { ...w }; if (paint) n.paint = { ...paint }; else delete n.paint; return n; });
}
export function opPaintRock(cfg: MapConfig, id: number, paint: MapPaint | undefined): void {
  const c = containerOf(cfg);
  c.rocks = c.rocks.map(r => { if (r.id !== id) return r; const n = { ...r }; if (paint) n.paint = { ...paint }; else delete n.paint; return n; });
}

export function opMoveRock(cfg: MapConfig, id: number, cx: number, cy: number): void {
  const c = containerOf(cfg);
  c.rocks = c.rocks.map(r => (r.id === id ? { ...r, cx, cy, lookCx: r.lookCx ?? r.cx, lookCy: r.lookCy ?? r.cy } : r));
}

export function opUpdateRock(
  cfg: MapConfig, id: number, patch: { size?: number; rotation?: number; kind?: RockKind }
): void {
  const c = containerOf(cfg);
  c.rocks = c.rocks.map(r => (r.id === id ? { ...r, ...patch } : r));
}

export function opRandomizeAllRockRotations(cfg: MapConfig): void {
  const c = containerOf(cfg);
  c.rocks = c.rocks.map(r => ({ ...r, rotation: Math.random() * Math.PI * 2 }));
}

export function opMovePortal(cfg: MapConfig, id: number, gx: number, gy: number): void {
  if (PLACED_PORTALS.ON !== 0) { const h = portalHome(cfg); if (h) h.portals = h.portals.map(p => (p.id === id ? (p.appear === 'map' || p.appear === 'area' || (!isCustomMap(cfg) && p.appear === undefined) ? (() => { const n: PlacedPortal = { ...p, gx, gy, appear: 'fixed', staticPos: true }; delete n.inArea; return n; })() : { ...p, gx, gy }) : p)); return; }
  if (!cfg.customMap) return;
  cfg.customMap.portals = cfg.customMap.portals.map(p => (p.id === id ? { ...p, gx, gy } : p));
}

export function opUpdatePortal(cfg: MapConfig, id: number, staticPos: boolean): void {
  if (PLACED_PORTALS.ON !== 0) { const h = portalHome(cfg); if (h) h.portals = h.portals.map(p => (p.id === id ? { ...p, staticPos } : p)); return; }
  if (!cfg.customMap) return;
  cfg.customMap.portals = cfg.customMap.portals.map(p => (p.id === id ? { ...p, staticPos } : p));
}

export function opDelete(cfg: MapConfig, sel: MapEditorSelection): void {
  MAP_KIND_CORE[sel.kind].remove(cfg, sel);
}

export interface MapKindCore {
  customOnly: boolean;
  hit(ref: EditAreaRef, localX: number, localY: number, wallIndex?: Map<number, number> | null): boolean;
  remove(cfg: MapConfig, sel: MapEditorSelection): void;
}
export const MAP_KIND_CORE: Record<MapEditorKind, MapKindCore> = {
  wall: { customOnly: false, hit: hitWall, remove: (cfg, sel) => {
    if (sel.id >= 0) { const c = containerOf(cfg); c.walls = c.walls.filter(w => w.id !== sel.id); }
    else if (sel.genKey) cfg.tileOverrides[sel.genKey] = TileType.NORMAL;
  } },
  rock: { customOnly: false, hit: hitRock, remove: (cfg, sel) => {
    if (sel.id >= 0) { const c = containerOf(cfg); c.rocks = c.rocks.filter(r => r.id !== sel.id); }
    else if (sel.genKey) {
      const c = containerOf(cfg) as MapTweaks;
      if (c.removedRockKeys && c.removedRockKeys.indexOf(sel.genKey) < 0) c.removedRockKeys.push(sel.genKey);
    }
  } },
  zone: { customOnly: MAP_EVENTS.ON === 0, hit: hitZone, remove: (cfg, sel) => {
    if (sel.id < 0) return;
    if (cfg.customMap && isCustomMap(cfg)) cfg.customMap.zones = cfg.customMap.zones.filter(z => z.id !== sel.id);
    else if (cfg.mapAreas) cfg.mapAreas = { ...cfg.mapAreas, zones: cfg.mapAreas.zones.filter(z => z.id !== sel.id) };
  } },
  entity: { customOnly: false, hit: hitEntity, remove: (cfg, sel) => {
    if (sel.id >= 0 && cfg.events?.placed) cfg.events = { ...cfg.events, placed: cfg.events.placed.filter(e => e.id !== sel.id) };
  } },
  portal: { customOnly: PLACED_PORTALS.ON === 0, hit: hitPortal, remove: (cfg, sel) => {
    if (sel.id >= 0 && cfg.customMap && isCustomMap(cfg)) cfg.customMap.portals = cfg.customMap.portals.filter(p => p.id !== sel.id);
    else if (sel.id >= 0 && PLACED_PORTALS.ON !== 0 && cfg.mapPortals) { cfg.mapPortals = { ...cfg.mapPortals, portals: cfg.mapPortals.portals.filter(p => p.id !== sel.id) }; if (cfg.mapPortals.portals.length === 0) cfg.enablePortals = false; }
  } },
};
const HIT_ORDER: readonly MapEditorKind[] = ['entity', 'portal', 'rock', 'wall', 'zone'];

export function opClearAll(cfg: MapConfig): void {
  if (!cfg.customMap) return;
  cfg.customMap.walls = [];
  cfg.customMap.rocks = [];
  cfg.customMap.zones = [];
  cfg.customMap.portals = [];
  if (cfg.events?.placed?.length) cfg.events = { ...cfg.events, placed: [] };
}
