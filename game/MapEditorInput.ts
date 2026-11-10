import { SMALL_FIX } from './smallFixSwitch';
import type { GameLogic } from './GameLogic';
import type { MapConfig, PlacedZone, AreaFill } from '@/types';
import { PORTAL_BODY_RADIUS } from './constants';
import { MAP_EVENTS } from './mapEventsSwitch';
import type { EntityType } from './mapEvents/doc';
import { zoneShapeOf } from './mapEvents/doc';
import { BASE_AREAS, zoneBaseTeam } from './baseAreas';
import { PLACED_PORTALS } from './placedPortalsSwitch';
import {
  shapeBox, shapeCellBox, shapeOnGrid, shapeToBox, shapeTurned, regularPolyPts, ellipseAsPoints, polyArea, polyHas,
  AREA_SIDES_MIN, AREA_SIDES_MAX, AREA_SHAPE_MAX_POINTS, type AreaShape,
} from './areaShape';
import { nPts, movePoints, constrainEight, sideNormal, along, nearestSide, nearestPoint, insertPoint, extrudeSide, removePoints, pointsInBox, mergeTwins } from './polyEdit';
import {
  EDIT_IGNORE, clearEditIgnore,
  resolveEditArea, hitTestEntity, hitMapObject, isCustomMap,
  snapCell, snapFineToCellCoord, cellCoordToLocal, cellCenterLocal,
  canPlaceWall, canPlaceRock, canPlacePortal, canPlaceZone, canPlaceEntity,
  editWalls, editRocks, editZones, editPortals, editEntities,
  findPlacedWall, findPlacedRock, findPlacedZone, findPlacedPortal, findPlacedEntity, entityShownCell, entityStartFormId, portalBuiltAt,
  resolveGeneratedWall, resolveGeneratedRock,
  opPlaceWall, opPlaceRock, opPlacePortal, opWriteZone, opPlaceEntity, opMoveEntity, opMoveEntityShown, opPatchZone, opZoneRect, opAddZoneRect,
  opMoveWall, opMoveRock, opMovePortal, opDelete, opShapeZone, zoneCellPoly,
  opResizeWall, opUpdateRock,
  setMapEditSelection, clearMapEditSelection, cancelMapEditInteraction,
  MAP_EDIT_MAX_WALLS, MAP_EDIT_MAX_ROCKS, MAP_EDIT_MAX_ZONES, MAP_EDIT_MAX_PORTALS, MAP_EDIT_MAX_ENTITIES,
  MAP_EDIT_DRAG_THRESHOLD_PX,
  type EditAreaRef, type MapEditorSelection, type MapEditorKind, type MapEditorTool,
  type RockKind, type MapEditorState, ROCK_GAP, type AreaToolShape,
} from './MapEditor';

export interface SelGeom {
  kind: MapEditorKind;
  gx: number; gy: number; cw: number; ch: number;
  lx: number; ly: number; halfW: number; halfH: number;
  radius: number;
  size: number; rotation: number; rockKind: RockKind; rockIdx: number;
  team: 0 | 1 | 2 | 3; staticPos: boolean;
  lookDx: number; lookDy: number;
}

const _geom: SelGeom = {
  kind: 'wall', gx: 0, gy: 0, cw: 1, ch: 1,
  lx: 0, ly: 0, halfW: 0, halfH: 0, radius: 0,
  size: 0, rotation: 0, rockKind: 'rock', rockIdx: -1,
  team: 0, staticPos: false,
  lookDx: 0, lookDy: 0,
};

function shapeToRockKind(shape: number, size: number): RockKind {
  if (shape === -9) return 'rock';
  return size >= 24 ? 'stone' : 'gravel';
}

export const PUMPKIN_ROCK_MIN_SIZE = 40;
export function toolRockKind(logic: GameLogic): RockKind { return logic.pumpkinRocks ? 'rock' : logic.mapEditor.rockKind; }
export function rockSizeFloor(logic: GameLogic): number { return logic.pumpkinRocks ? PUMPKIN_ROCK_MIN_SIZE : 0; }
export function toolRockSize(logic: GameLogic): number { return Math.max(logic.mapEditor.rockSize, rockSizeFloor(logic)); }
export function setToolRockSize(logic: GameLogic, size: number): boolean {
  const floor = rockSizeFloor(logic);
  logic.mapEditor.rockSize = Math.max(size, floor);
  return size < floor;
}

export function resolveSelection(ref: EditAreaRef, sel: MapEditorSelection): SelGeom | null {
  _geom.lookDx = 0; _geom.lookDy = 0;
  return MAP_KINDS[sel.kind].resolve(ref, sel) ? _geom : null;
}

function resolveWall(ref: EditAreaRef, sel: MapEditorSelection): boolean {
  const st = ref.state;
  const cfg = ref.cfg;
  const cs = st.cellSize, mh = st.mapHalf;
  const mhY = st.mapHalfY;
  if (sel.id >= 0) {
    const w = findPlacedWall(cfg, sel.id);
    if (!w) return false;
    _geom.kind = 'wall';
    _geom.gx = w.gx; _geom.gy = w.gy; _geom.cw = w.cw; _geom.ch = w.ch;
    if (typeof w.lookGx === 'number' && typeof w.lookGy === 'number') { _geom.lookDx = (w.lookGx - w.gx) * cs; _geom.lookDy = (w.lookGy - w.gy) * cs; }
  } else {
    const gen = resolveGeneratedWall(st, sel.genKey);
    if (!gen) return false;
    const w = st.walls[gen.idx];
    _geom.kind = 'wall';
    _geom.gx = Math.round((w.x - ref.offX - w.halfW + mh) / cs);
    _geom.gy = Math.round((w.y - ref.offY - w.halfH + mhY) / cs);
    _geom.cw = Math.max(1, Math.round((w.halfW * 2) / cs));
    _geom.ch = Math.max(1, Math.round((w.halfH * 2) / cs));
    _geom.lookDx = w.lookDx || 0; _geom.lookDy = w.lookDy || 0;
  }
  _geom.halfW = (_geom.cw * cs) / 2;
  _geom.halfH = (_geom.ch * cs) / 2;
  _geom.lx = -mh + _geom.gx * cs + _geom.halfW;
  _geom.ly = -mhY + _geom.gy * cs + _geom.halfH;
  _geom.radius = 0;
  _geom.rockIdx = -1;
  return true;
}

function resolveRock(ref: EditAreaRef, sel: MapEditorSelection): boolean {
  const st = ref.state;
  const cfg = ref.cfg;
  const cs = st.cellSize, mh = st.mapHalf;
  const mhY = st.mapHalfY;
  let lx: number, ly: number, size: number, rotation: number, kind: RockKind;
  if (sel.id >= 0) {
    const r = findPlacedRock(cfg, sel.id);
    if (!r) return false;
    lx = cellCoordToLocal(r.cx, mh, cs);
    ly = cellCoordToLocal(r.cy, mhY, cs);
    size = r.size; rotation = r.rotation; kind = r.kind;
    if (typeof r.lookCx === 'number' && typeof r.lookCy === 'number') { _geom.lookDx = (r.lookCx - r.cx) * cs; _geom.lookDy = (r.lookCy - r.cy) * cs; }
  } else {
    const idx = resolveGeneratedRock(st, sel.genKey, ref.offX, ref.offY);
    if (idx < 0) return false;
    const r = st.rocks[idx];
    lx = r.x - ref.offX; ly = r.y - ref.offY; size = r.size; rotation = r.rotation;
    kind = shapeToRockKind(r.shape, r.size);
    _geom.lookDx = r.lookDx || 0; _geom.lookDy = r.lookDy || 0;
  }
  _geom.kind = 'rock';
  _geom.lx = lx; _geom.ly = ly;
  _geom.radius = size;
  _geom.halfW = size; _geom.halfH = size;
  _geom.size = size; _geom.rotation = rotation; _geom.rockKind = kind;
  _geom.rockIdx = liveRockIndex(st, lx + ref.offX, ly + ref.offY);
  _geom.gx = snapCell(lx, mh, cs, st.gridCells);
  _geom.gy = snapCell(ly, mhY, cs, st.gridCellsY);
  _geom.cw = 1; _geom.ch = 1;
  return true;
}

function resolveZone(ref: EditAreaRef, sel: MapEditorSelection): boolean {
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf;
  const mhY = st.mapHalfY;
  const z = findPlacedZone(ref.cfg, sel.id);
  if (!z) return false;
  _geom.kind = 'zone';
  _geom.gx = z.gx; _geom.gy = z.gy; _geom.cw = z.cw; _geom.ch = z.ch;
  _geom.halfW = (z.cw * cs) / 2;
  _geom.halfH = (z.ch * cs) / 2;
  _geom.lx = -mh + z.gx * cs + _geom.halfW;
  _geom.ly = -mhY + z.gy * cs + _geom.halfH;
  _geom.radius = 0;
  _geom.team = z.team;
  _geom.rockIdx = -1;
  return true;
}

function resolveEntity(ref: EditAreaRef, sel: MapEditorSelection): boolean {
  const st = ref.state;
  const e = findPlacedEntity(ref.cfg, sel.id);
  if (!e) return false;
  _geom.kind = 'entity';
  const at = entityShownCell(ref.cfg.events, e);
  _geom.lx = cellCoordToLocal(at.cx, st.mapHalf, st.cellSize);
  _geom.ly = cellCoordToLocal(at.cy, st.mapHalfY, st.cellSize);
  _geom.radius = Math.max(ref.host?.mapEntityRadius?.(e.id, ref.areaId) ?? 0, 14);
  _geom.halfW = _geom.radius; _geom.halfH = _geom.radius;
  _geom.gx = snapCell(_geom.lx, st.mapHalf, st.cellSize, st.gridCells);
  _geom.gy = snapCell(_geom.ly, st.mapHalfY, st.cellSize, st.gridCellsY);
  _geom.cw = 1; _geom.ch = 1;
  _geom.rockIdx = -1;
  return true;
}

function resolvePortal(ref: EditAreaRef, sel: MapEditorSelection): boolean {
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf;
  const mhY = st.mapHalfY;
  const p = findPlacedPortal(ref.cfg, sel.id);
  if (!p) return false;
  _geom.kind = 'portal';
  const at = portalBuiltAt(ref, p);
  _geom.gx = at ? Math.floor((at.x + mh) / cs) : p.gx; _geom.gy = at ? Math.floor((at.y + mhY) / cs) : p.gy; _geom.cw = 1; _geom.ch = 1;
  _geom.lx = at ? at.x : cellCenterLocal(p.gx, mh, cs);
  _geom.ly = at ? at.y : cellCenterLocal(p.gy, mhY, cs);
  _geom.radius = PORTAL_BODY_RADIUS;
  _geom.halfW = _geom.radius; _geom.halfH = _geom.radius;
  _geom.staticPos = p.staticPos;
  _geom.rockIdx = -1;
  return true;
}

function liveRockIndex(st: { rocks: { x: number; y: number; active: boolean }[] }, wx: number, wy: number): number {
  for (let i = 0; i < st.rocks.length; i++) {
    const r = st.rocks[i];
    if (r.active && r.x === wx && r.y === wy) return i;
  }
  return -1;
}

function underCap(cfg: MapConfig, kind: MapEditorKind): boolean {
  return MAP_KINDS[kind].underCap(cfg);
}

function blankGhost(logic: GameLogic): void {
  logic.mapEditor.hasGhost = false;
  logic.mapEditor.hasHover = false;
}

export function effectiveMapEditorTool(logic: GameLogic): MapEditorTool {
  const me = logic.mapEditor;
  if (me.tool === 'none' || me.tool === 'select') return me.tool;
  if (MAP_EVENTS.ON !== 0 && (me.tool === 'eraser' || MAP_KINDS[me.tool].onEveryMap)) return me.tool;
  return logic.isCustomMapActive() ? me.tool : 'none';
}

function normalizeMapEditorTool(logic: GameLogic): MapEditorTool {
  const me = logic.mapEditor;
  const tool = effectiveMapEditorTool(logic);
  if (tool !== me.tool) {
    me.tool = tool;
    cancelMapEditInteraction(me);
    clearMapEditSelection(me);
  }
  return tool;
}

function noteHover(me: GameLogic['mapEditor'], ref: EditAreaRef, hit: MapEditorSelection, g: SelGeom): void {
  me.hasHover = true;
  me.hoverKind = hit.kind;
  me.hoverId = hit.id;
  me.hoverGenKey = hit.genKey;
  me.hoverAreaId = ref.areaId;
  me.hoverX = g.lx + ref.offX;
  me.hoverY = g.ly + ref.offY;
  me.hoverW = g.halfW * 2;
  me.hoverH = g.halfH * 2;
  me.hoverR = g.radius;
  me.hoverRotation = g.kind === 'rock' ? g.rotation : 0;
}

export function refreshMapEditorVisuals(logic: GameLogic, worldX: number, worldY: number): void {
  const me = logic.mapEditor;
  if (!logic.isMapDesignerActive || logic.state.isTestMode) {
    blankGhost(logic);
    return;
  }
  if (shapeVisuals(logic, worldX, worldY)) return;
  if (normalizeMapEditorTool(logic) === 'none') {
    blankGhost(logic);
    if (MAP_EVENTS.ON !== 0 && !me.clickArmed) {
      const ref = resolveEditArea(logic, worldX, worldY);
      const hit = ref ? hitMapObject(ref, worldX - ref.offX, worldY - ref.offY) : null;
      const g = ref && hit ? resolveSelection(ref, hit) : null;
      if (ref && hit && g) noteHover(me, ref, hit, g);
    }
    return;
  }
  const dragArea = me.dragActive && me.hasSelection ? me.dragAreaId
    : me.zoneDragActive ? me.zoneDragAreaId : null;
  const ref = dragArea !== null ? areaRefById(logic, dragArea) : resolveEditArea(logic, worldX, worldY);
  if (!ref) { blankGhost(logic); return; }
  me.cacheState = logic.mapState;

  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf, gc = st.gridCells;
  const gcY = st.gridCellsY;
  const mhY = st.mapHalfY;
  const localX = worldX - ref.offX;
  const localY = worldY - ref.offY;
  const custom = isCustomMap(ref.cfg);

  if (me.dragActive && me.hasSelection) {
    const g = resolveSelection(ref, me.selection);
    if (!g) { blankGhost(logic); return; }
    computeDragGhost(logic, ref, g, localX, localY);
    me.hasHover = false;
    return;
  }

  if (me.zoneDragActive && me.zoneDragShaped) {
    me.zoneFx1 = Math.max(0, Math.min(gc, snapQ(localX / cs + mh / cs)));
    me.zoneFy1 = Math.max(0, Math.min(gcY, snapQ(localY / cs + mhY / cs)));
    const b = toolDragBox(me);
    me.zoneDragValid = b.x1 - b.x0 >= AREA_SHAPE_MIN && b.y1 - b.y0 >= AREA_SHAPE_MIN && underCap(ref.cfg, 'zone');
    me.hasGhost = false;
    me.hasHover = false;
    return;
  }
  if (me.zoneDragActive) {
    const gx = snapCell(localX, mh, cs, gc);
    const gy = snapCell(localY, mhY, cs, gcY);
    me.zoneGx = Math.min(me.zoneAnchorGx, gx);
    me.zoneGy = Math.min(me.zoneAnchorGy, gy);
    me.zoneCw = Math.abs(gx - me.zoneAnchorGx) + 1;
    me.zoneCh = Math.abs(gy - me.zoneAnchorGy) + 1;
    me.zoneDragValid = me.zoneResizeId >= 0 ? canPlaceZone(ref, me.zoneGx, me.zoneGy, me.zoneCw, me.zoneCh, me.zoneResizeId)
      : me.zoneAddTo >= 0 ? canPlaceZone(ref, me.zoneGx, me.zoneGy, me.zoneCw, me.zoneCh, me.zoneAddTo)
      : underCap(ref.cfg, 'zone') && canPlaceZone(ref, me.zoneGx, me.zoneGy, me.zoneCw, me.zoneCh, -1);
    me.hasGhost = false;
    me.hasHover = false;
    return;
  }

  if (me.tool === 'select' || me.tool === 'eraser') {
    me.hasGhost = false;
    const hit = hitTestEntity(ref, localX, localY, custom,
      logic.placedWallIndexFor(st, ref.areaId, ref.cfg, ref.offX, ref.offY));
    if (!hit) { me.hasHover = false; return; }
    const g = resolveSelection(ref, hit);
    if (!g) { me.hasHover = false; return; }
    noteHover(me, ref, hit, g);
    return;
  }

  me.hasHover = false;
  clearEditIgnore(EDIT_IGNORE);
  me.ghostLookDx = 0; me.ghostLookDy = 0;

  const kind = MAP_KINDS[me.tool as MapEditorKind];
  if (MAP_EVENTS.ON !== 0 && !kind.onEveryMap && !custom) { blankGhost(logic); return; }
  kind.placeGhost(logic, ref, localX, localY, custom);
}

function placeGhostWall(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number): void {
  const me = logic.mapEditor;
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf, gc = st.gridCells;
  const gcY = st.gridCellsY, mhY = st.mapHalfY;
  const n = me.wallCells;
  let gx = Math.round((localX + mh) / cs - n / 2);
  let gy = Math.round((localY + mhY) / cs - n / 2);
  gx = Math.max(0, Math.min(gc - n, gx));
  gy = Math.max(0, Math.min(gcY - n, gy));
  me.hasGhost = true;
  me.ghostKind = 'wall';
  me.ghostW = n * cs;
  me.ghostH = n * cs;
  me.ghostX = ref.offX - mh + gx * cs + me.ghostW / 2;
  me.ghostY = ref.offY - mhY + gy * cs + me.ghostH / 2;
  me.ghostR = 0;
  me.pendGx = gx; me.pendGy = gy;
  me.ghostValid = gc >= n && gcY >= n && underCap(ref.cfg, 'wall') && canPlaceWall(ref, gx, gy, n, n, null);
}

function placeGhostRock(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number): void {
  const me = logic.mapEditor;
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf;
  const mhY = st.mapHalfY;
  const cx = snapFineToCellCoord(localX, mh, cs);
  const cy = snapFineToCellCoord(localY, mhY, cs);
  const lx = cellCoordToLocal(cx, mh, cs);
  const ly = cellCoordToLocal(cy, mhY, cs);
  me.hasGhost = true;
  me.ghostKind = 'rock';
  me.ghostX = lx + ref.offX;
  me.ghostY = ly + ref.offY;
  const size = toolRockSize(logic);
  me.ghostR = size;
  me.ghostW = size * 2;
  me.ghostH = size * 2;
  me.ghostRot = me.rockRotation;
  me.pendCx = cx; me.pendCy = cy;
  me.ghostValid = underCap(ref.cfg, 'rock') && canPlaceRock(ref, lx, ly, size, null);
}

function placeGhostPortal(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number, custom: boolean): void {
  const me = logic.mapEditor;
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf, gc = st.gridCells;
  const gcY = st.gridCellsY, mhY = st.mapHalfY;
  const gx = snapCell(localX, mh, cs, gc);
  const gy = snapCell(localY, mhY, cs, gcY);
  me.hasGhost = true;
  me.ghostKind = 'portal';
  me.ghostX = cellCenterLocal(gx, mh, cs) + ref.offX;
  me.ghostY = cellCenterLocal(gy, mhY, cs) + ref.offY;
  me.ghostR = PORTAL_BODY_RADIUS;
  me.ghostW = PORTAL_BODY_RADIUS * 2; me.ghostH = PORTAL_BODY_RADIUS * 2;
  me.pendGx = gx; me.pendGy = gy;
  me.ghostValid = (custom || PLACED_PORTALS.ON !== 0) && underCap(ref.cfg, 'portal') && canPlacePortal(ref, gx, gy, null);
}

function placeGhostZone(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number, custom: boolean): void {
  const me = logic.mapEditor;
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf, gc = st.gridCells;
  const gcY = st.gridCellsY, mhY = st.mapHalfY;
  const gx = snapCell(localX, mh, cs, gc);
  const gy = snapCell(localY, mhY, cs, gcY);
  me.hasGhost = true;
  me.ghostKind = 'zone';
  me.ghostW = cs; me.ghostH = cs;
  me.ghostX = ref.offX - mh + gx * cs + cs / 2;
  me.ghostY = ref.offY - mhY + gy * cs + cs / 2;
  me.ghostR = 0;
  me.ghostTeam = me.zoneTeam;
  me.ghostZone = null;
  me.ghostValid = (custom || MAP_KINDS.zone.onEveryMap) && (me.zoneAddTo >= 0 || underCap(ref.cfg, 'zone')) && canPlaceZone(ref, gx, gy, 1, 1, me.zoneAddTo >= 0 ? me.zoneAddTo : -1);
}

function armedType(logic: GameLogic, ref: EditAreaRef): EntityType | null {
  const id = logic.mapEditor.entityType;
  return id >= 0 ? ref.cfg.events?.types?.find(t => t.id === id) ?? null : null;
}
function placeGhostEntity(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number): void {
  const me = logic.mapEditor;
  const st = ref.state;
  const type = armedType(logic, ref);
  if (type === null && !me.entityTank) { blankGhost(logic); return; }
  const cx = snapFineToCellCoord(localX, st.mapHalf, st.cellSize);
  const cy = snapFineToCellCoord(localY, st.mapHalfY, st.cellSize);
  const lx = cellCoordToLocal(cx, st.mapHalf, st.cellSize);
  const ly = cellCoordToLocal(cy, st.mapHalfY, st.cellSize);
  me.hasGhost = true;
  me.ghostKind = 'entity';
  me.ghostX = lx + ref.offX;
  me.ghostY = ly + ref.offY;
  const r = logic.mapEntityGhostAt(ref.areaId, type ? type.id : -1, me.entityTank, me.ghostX, me.ghostY);
  me.ghostR = r;
  me.ghostW = r * 2; me.ghostH = r * 2;
  me.pendCx = cx; me.pendCy = cy;
  me.ghostValid = underCap(ref.cfg, 'entity') && canPlaceEntity(ref, lx, ly, r, type, null);
}
function dragGhostEntity(logic: GameLogic, ref: EditAreaRef, g: SelGeom, localX: number, localY: number): void {
  const me = logic.mapEditor;
  const st = ref.state;
  const row = findPlacedEntity(ref.cfg, me.selection.id);
  const type = row ? ref.cfg.events?.types?.find(t => t.id === row.type.id) ?? null : null;
  const cx = snapFineToCellCoord(localX - me.dragGrabDX, st.mapHalf, st.cellSize);
  const cy = snapFineToCellCoord(localY - me.dragGrabDY, st.mapHalfY, st.cellSize);
  const lx = cellCoordToLocal(cx, st.mapHalf, st.cellSize);
  const ly = cellCoordToLocal(cy, st.mapHalfY, st.cellSize);
  me.ghostX = lx + ref.offX;
  me.ghostY = ly + ref.offY;
  if (type) logic.mapEntityGhostAt(ref.areaId, type.id, '', me.ghostX, me.ghostY, SMALL_FIX.GH713B !== 0 && row ? entityStartFormId(ref.cfg.events, row) : -1);
  me.ghostR = g.radius;
  me.ghostW = g.radius * 2; me.ghostH = g.radius * 2;
  me.pendCx = cx; me.pendCy = cy;
  me.ghostValid = canPlaceEntity(ref, lx, ly, g.radius, type, null);
}
function placeStepEntity(logic: GameLogic): void {
  const me = logic.mapEditor;
  const cx = me.pendCx, cy = me.pendCy, type = me.entityType, tank = me.entityTank;
  const name = tank ? logic.mapThingName(tank) : '';
  let made = -1;
  logic.mapEditStrokeStep(cfg => { made = opPlaceEntity(cfg, type, tank, name, cx, cy).typeId; });
  if (made >= 0) { me.entityType = made; me.entityTank = ''; }
}
function moveEntity(logic: GameLogic, ref: EditAreaRef, _g: SelGeom, sel: MapEditorSelection, areaId: string): void {
  const me = logic.mapEditor;
  const destCx = me.pendCx, destCy = me.pendCy;
  const row = findPlacedEntity(ref.cfg, sel.id);
  const from = row ? entityShownCell(ref.cfg.events, row) : null;
  const dx = from ? destCx - from.cx : 0, dy = from ? destCy - from.cy : 0;
  const others = me.marks.filter(id => id !== sel.id);
  logic.applyMapEdit(areaId, cfg => {
    if (SMALL_FIX.GH713 !== 0) {
      opMoveEntityShown(cfg, sel.id, destCx, destCy);
      for (const id of others) { const e = findPlacedEntity(cfg, id); if (e) { const at = entityShownCell(cfg.events, e); opMoveEntityShown(cfg, id, at.cx + dx, at.cy + dy); } }
      return;
    }
    opMoveEntity(cfg, sel.id, destCx, destCy);
    for (const id of others) { const e = findPlacedEntity(cfg, id); if (e) opMoveEntity(cfg, id, e.cx + dx, e.cy + dy); }
  });
}

function computeDragGhost(
  logic: GameLogic, ref: EditAreaRef, g: SelGeom, localX: number, localY: number
): void {
  const me = logic.mapEditor;
  clearEditIgnore(EDIT_IGNORE);
  me.hasGhost = true;
  me.ghostKind = g.kind;
  me.ghostLookDx = 0; me.ghostLookDy = 0;
  MAP_KINDS[g.kind].dragGhost(logic, ref, g, localX, localY);
}

function dragGhostBlock(logic: GameLogic, ref: EditAreaRef, g: SelGeom, localX: number, localY: number): void {
  const me = logic.mapEditor;
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf, gc = st.gridCells;
  const gcY = st.gridCellsY, mhY = st.mapHalfY;
  const anchorLx = localX - me.dragGrabDX;
  const anchorLy = localY - me.dragGrabDY;
  let gx = Math.round((anchorLx + mh) / cs);
  let gy = Math.round((anchorLy + mhY) / cs);
  gx = Math.max(0, Math.min(gc - g.cw, gx));
  gy = Math.max(0, Math.min(gcY - g.ch, gy));
  me.ghostW = g.cw * cs;
  me.ghostH = g.ch * cs;
  me.ghostX = ref.offX - mh + gx * cs + me.ghostW / 2;
  me.ghostY = ref.offY - mhY + gy * cs + me.ghostH / 2;
  me.ghostR = 0;
  me.pendGx = gx; me.pendGy = gy;
  if (g.kind === 'wall') {
    me.ghostLookDx = g.lx + g.lookDx - (me.ghostX - ref.offX); me.ghostLookDy = g.ly + g.lookDy - (me.ghostY - ref.offY);
    EDIT_IGNORE.wallGx = g.gx; EDIT_IGNORE.wallGy = g.gy;
    EDIT_IGNORE.wallCw = g.cw; EDIT_IGNORE.wallCh = g.ch;
    me.ghostValid = gc >= g.cw && gcY >= g.ch && canPlaceWall(ref, gx, gy, g.cw, g.ch, EDIT_IGNORE) && (me.selection.id >= 0 || underCap(ref.cfg, 'wall'));
  } else {
    me.ghostTeam = g.team;
    me.ghostZone = findPlacedZone(ref.cfg, me.selection.id);
    me.ghostValid = canPlaceZone(ref, gx, gy, g.cw, g.ch, me.selection.id);
  }
}

function dragGhostRock(logic: GameLogic, ref: EditAreaRef, g: SelGeom, localX: number, localY: number): void {
  const me = logic.mapEditor;
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf;
  const mhY = st.mapHalfY;
  const cx = snapFineToCellCoord(localX - me.dragGrabDX, mh, cs);
  const cy = snapFineToCellCoord(localY - me.dragGrabDY, mhY, cs);
  const lx = cellCoordToLocal(cx, mh, cs);
  const ly = cellCoordToLocal(cy, mhY, cs);
  me.ghostX = lx + ref.offX;
  me.ghostY = ly + ref.offY;
  me.ghostR = g.size;
  me.ghostW = g.size * 2; me.ghostH = g.size * 2;
  me.ghostRot = g.rotation;
  me.ghostLookDx = g.lx + g.lookDx - lx; me.ghostLookDy = g.ly + g.lookDy - ly;
  me.pendCx = cx; me.pendCy = cy;
  EDIT_IGNORE.rockIdx = me.dragRockIdx;
  me.ghostValid = canPlaceRock(ref, lx, ly, g.size, EDIT_IGNORE) && (me.selection.id >= 0 || underCap(ref.cfg, 'rock'));
}

function dragGhostPortal(logic: GameLogic, ref: EditAreaRef, g: SelGeom, localX: number, localY: number): void {
  const me = logic.mapEditor;
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf, gc = st.gridCells;
  const gcY = st.gridCellsY, mhY = st.mapHalfY;
  const gx = snapCell(localX - me.dragGrabDX, mh, cs, gc);
  const gy = snapCell(localY - me.dragGrabDY, mhY, cs, gcY);
  me.ghostX = cellCenterLocal(gx, mh, cs) + ref.offX;
  me.ghostY = cellCenterLocal(gy, mhY, cs) + ref.offY;
  me.ghostR = PORTAL_BODY_RADIUS;
  me.ghostW = PORTAL_BODY_RADIUS * 2; me.ghostH = PORTAL_BODY_RADIUS * 2;
  me.pendGx = gx; me.pendGy = gy;
  EDIT_IGNORE.portalGx = g.gx; EDIT_IGNORE.portalGy = g.gy; EDIT_IGNORE.portalOn = true;
  me.ghostValid = canPlacePortal(ref, gx, gy, EDIT_IGNORE);
}

export function mapEditorPointerDown(
  logic: GameLogic, worldX: number, worldY: number, screenX: number, screenY: number
): boolean {
  const me = logic.mapEditor;
  if (me.placeStrokeActive || me.eraseStrokeActive) return true;
  if (!logic.isMapDesignerActive || logic.state.isTestMode) return false;
  if (normalizeMapEditorTool(logic) === 'none') {
    if (MAP_EVENTS.ON === 0) return false;
    const on = resolveEditArea(logic, worldX, worldY);
    if (on) {
      const lx = worldX - on.offX, ly = worldY - on.offY;
      if (pressShapeHandle(logic, on, lx, ly, screenX, screenY)) { me.tool = 'select'; me.pressTool = true; return true; }
      if (pressZoneHandle(logic, on, lx, ly)) { me.tool = 'select'; me.pressTool = true; return true; }
      if (me.hasSelection && me.selection.kind !== 'zone' && me.selection.areaId === on.areaId) {
        const h = hitTestEntity(on, lx, ly, isCustomMap(on.cfg), logic.placedWallIndexFor(on.state, on.areaId, on.cfg, on.offX, on.offY));
        if (h && h.kind === me.selection.kind && h.id === me.selection.id && h.genKey === me.selection.genKey) { me.tool = 'select'; me.pressTool = true; }
      }
    }
    if (me.tool === 'none') { me.clickArmed = true; me.clickX = screenX; me.clickY = screenY; return false; }
  }

  const ref = resolveEditArea(logic, worldX, worldY);
  if (!ref) return false;
  focusAreaForEdit(logic, ref.areaId);

  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf;
  const mhY = st.mapHalfY;
  const localX = worldX - ref.offX;
  const localY = worldY - ref.offY;
  const custom = isCustomMap(ref.cfg);

  if (me.tool !== 'eraser' && me.tool !== 'select') {
    const kind = MAP_KINDS[me.tool as MapEditorKind];
    if (MAP_EVENTS.ON !== 0 && !kind.onEveryMap && !custom) return true;
    kind.press(logic, ref, localX, localY, worldX, worldY, custom);
    return true;
  }

  if (me.tool === 'eraser') {
    logic.beginMapEditStroke(ref.areaId);
    me.eraseStrokeActive = true;
    me.strokeAreaId = ref.areaId;
    me.strokeButton = 0;
    me.strokeLastWorldX = worldX; me.strokeLastWorldY = worldY;
    me.strokeHasLast = true;
    eraseAtPoint(logic, ref, worldX, worldY);
    refreshMapEditorVisuals(logic, worldX, worldY);
    return true;
  }

  if (MAP_EVENTS.ON !== 0 && (pressShapeHandle(logic, ref, localX, localY, screenX, screenY) || pressZoneHandle(logic, ref, localX, localY))) return true;
  const hit = hitTestEntity(ref, localX, localY, custom,
    logic.placedWallIndexFor(st, ref.areaId, ref.cfg, ref.offX, ref.offY));
  if (!hit) {
    clearMapEditSelection(me);
    if (logic.onStateChange) logic.onStateChange(logic.state);
    return false;
  }

  setMapEditSelection(me, hit);
  const g = resolveSelection(ref, me.selection);
  if (g) {
    me.dragArmed = true;
    me.dragActive = false;
    me.dragAreaId = ref.areaId;
    me.dragStartScreenX = screenX;
    me.dragStartScreenY = screenY;
    me.dragRockIdx = g.rockIdx;
    if (MAP_KINDS[g.kind].grabByCorner) {
      me.dragGrabDX = localX - (-mh + g.gx * cs);
      me.dragGrabDY = localY - (-mhY + g.gy * cs);
    } else {
      me.dragGrabDX = localX - g.lx;
      me.dragGrabDY = localY - g.ly;
    }
  }
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return true;
}

export function mapEditorPointerMove(
  logic: GameLogic, worldX: number, worldY: number, screenX: number, screenY: number
): void {
  const me = logic.mapEditor;

  if (me.placeStrokeActive) {
    strokeAlong(logic, me.strokeLastWorldX, me.strokeLastWorldY, worldX, worldY, placeStepAtPoint);
    me.strokeLastWorldX = worldX; me.strokeLastWorldY = worldY;
    refreshMapEditorVisuals(logic, worldX, worldY);
    return;
  }
  if (me.eraseStrokeActive) {
    strokeAlong(logic, me.strokeLastWorldX, me.strokeLastWorldY, worldX, worldY, eraseStepAtPoint);
    me.strokeLastWorldX = worldX; me.strokeLastWorldY = worldY;
    if (me.strokeButton === 2 && me.tool !== 'eraser') me.deleteFlashAt = performance.now() + 500;
    refreshMapEditorVisuals(logic, worldX, worldY);
    return;
  }

  mapEditorClickMoved(logic, screenX, screenY);
  if (me.dragArmed && !me.dragActive) {
    const dx = screenX - me.dragStartScreenX;
    const dy = screenY - me.dragStartScreenY;
    const t = MAP_EDIT_DRAG_THRESHOLD_PX * logic.dpr;
    if (dx * dx + dy * dy >= t * t) me.dragActive = true;
  }
  refreshMapEditorVisuals(logic, worldX, worldY);
}

export function mapEditorClickMoved(logic: GameLogic, screenX: number, screenY: number): void {
  const me = logic.mapEditor;
  if (!me.clickArmed) return;
  const dx = screenX - me.clickX, dy = screenY - me.clickY;
  const t = MAP_EDIT_DRAG_THRESHOLD_PX * logic.dpr;
  if (dx * dx + dy * dy >= t * t) me.clickArmed = false;
}

function clickPick(logic: GameLogic, worldX: number, worldY: number): void {
  const me = logic.mapEditor;
  if (normalizeMapEditorTool(logic) !== 'none') return;
  const ref = resolveEditArea(logic, worldX, worldY);
  const x = ref ? worldX - ref.offX : 0, y = ref ? worldY - ref.offY : 0;
  const custom = !!ref && isCustomMap(ref.cfg);
  const hit = !ref ? null : custom ? hitTestEntity(ref, x, y, custom, logic.placedWallIndexFor(ref.state, ref.areaId, ref.cfg, ref.offX, ref.offY)) : hitMapObject(ref, x, y);
  if (!hit) {
    if (!me.hasSelection) return;
    clearMapEditSelection(me);
  } else {
    focusAreaForEdit(logic, ref!.areaId);
    setMapEditSelection(me, hit);
  }
  refreshMapEditorVisuals(logic, worldX, worldY);
  if (logic.onStateChange) logic.onStateChange(logic.state);
}

export function mapEditorPointerUp(logic: GameLogic, worldX: number, worldY: number): void {
  const me = logic.mapEditor;
  if (me.clickArmed) { me.clickArmed = false; clickPick(logic, worldX, worldY); return; }
  pointerUpOfTool(logic, worldX, worldY);
  if (me.pressTool) { me.pressTool = false; me.tool = 'none'; if (logic.onStateChange) logic.onStateChange(logic.state); }
}

function pointerUpOfTool(logic: GameLogic, worldX: number, worldY: number): void {
  const me = logic.mapEditor;

  if ((me.placeStrokeActive || me.eraseStrokeActive) && me.strokeButton === 0) {
    me.placeStrokeActive = false;
    me.eraseStrokeActive = false;
    me.strokeHasLast = false;
    logic.endMapEditStroke();
    refreshMapEditorVisuals(logic, worldX, worldY);
    if (logic.onStateChange) logic.onStateChange(logic.state);
    return;
  }

  if (me.vtxDrag !== -1) { commitShapeEdit(logic); refreshMapEditorVisuals(logic, worldX, worldY); if (logic.onStateChange) logic.onStateChange(logic.state); return; }
  if (me.zoneDragActive && me.zoneDragShaped) { commitToolShape(logic); refreshMapEditorVisuals(logic, worldX, worldY); if (logic.onStateChange) logic.onStateChange(logic.state); return; }
  if (me.zoneDragActive) {
    const areaId = me.zoneDragAreaId;
    const gx = me.zoneGx, gy = me.zoneGy, cw = me.zoneCw, ch = me.zoneCh;
    const valid = me.zoneDragValid;
    const resize = me.zoneResizeId, rect = me.zoneResizeRect, addTo = me.zoneAddTo;
    me.zoneDragActive = false;
    me.zoneResizeId = -1;
    me.zoneAddTo = -1;
    if (valid) {
      const ref = areaRefById(logic, areaId);
      if (ref) {
        const mh = ref.state.mapHalf, cs = ref.state.cellSize;
        const mhY = ref.state.mapHalfY;
        const team = me.zoneTeam;
        if (resize >= 0) {
          const old = findPlacedZone(ref.cfg, resize);
          const isBase = !!old && (BASE_AREAS.ON !== 0 ? zoneBaseTeam(old) >= 0 : !old.kind || old.kind === 'base') && rect < 0;
          logic.applyMapEdit(areaId, cfg => { if (isBase) opWriteZone(cfg, resize, gx, gy, cw, ch, old!.team, mh, cs, 'base', mhY); else opZoneRect(cfg, resize, rect, gx, gy, cw, ch); });
        } else if (addTo >= 0) {
          logic.applyMapEdit(areaId, cfg => opAddZoneRect(cfg, addTo, gx, gy, cw, ch));
          me.tool = 'select';
        } else {
          let made = -1;
          logic.applyMapEdit(areaId, cfg => {
            made = opWriteZone(cfg, -1, gx, gy, cw, ch, team, mh, cs, 'cosmetic', mhY);
          });
          if (made >= 0 && MAP_EVENTS.ON !== 0) {
            setMapEditSelection(me, { areaId, kind: 'zone', id: made, genKey: '' });
            me.focusNameOf = made;
          }
        }
      }
    }
    refreshMapEditorVisuals(logic, worldX, worldY);
    if (logic.onStateChange) logic.onStateChange(logic.state);
    return;
  }

  if (me.dragActive && me.hasSelection) {
    commitDrag(logic);
    me.dragArmed = false;
    me.dragActive = false;
    me.dragRockIdx = -1;
    refreshMapEditorVisuals(logic, worldX, worldY);
    return;
  }

  me.dragArmed = false;
  me.dragActive = false;
  me.dragRockIdx = -1;
}

function commitPlacementStep(logic: GameLogic): void {
  const me = logic.mapEditor;
  if (me.tool === 'none' || me.tool === 'select' || me.tool === 'eraser') return;
  MAP_KINDS[me.tool].placeStep(logic);
}

function placeStepWall(logic: GameLogic): void {
  const me = logic.mapEditor;
  const n = me.wallCells, gx = me.pendGx, gy = me.pendGy;
  const paint = me.wallPaint;
  logic.mapEditStrokeStep(cfg => { opPlaceWall(cfg, gx, gy, n, n, gx, gy, paint); });
}
function placeStepRock(logic: GameLogic): void {
  const me = logic.mapEditor;
  const cx = me.pendCx, cy = me.pendCy;
  const size = toolRockSize(logic), rot = me.rockRotation, rk = toolRockKind(logic);
  const paint = me.rockPaint;
  logic.mapEditStrokeStep(cfg => { opPlaceRock(cfg, cx, cy, size, rot, rk, cx, cy, paint); });
}
function placeStepPortal(logic: GameLogic): void {
  const me = logic.mapEditor;
  const gx = me.pendGx, gy = me.pendGy, sp = me.portalStatic;
  logic.mapEditStrokeStep(cfg => { opPlacePortal(cfg, gx, gy, sp); });
}

function pressZone(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number, _worldX: number, _worldY: number, custom: boolean): void {
  const me = logic.mapEditor;
  if (!custom && !MAP_KINDS.zone.onEveryMap) return;
  const st = ref.state;
  if (me.zoneAddTo < 0 && me.zoneShape === 'free') { pressFreePoint(logic, ref, localX, localY); return; }
  if (me.zoneAddTo < 0 && (me.zoneShape === 'ellipse' || me.zoneShape === 'poly')) {
    me.zoneDragActive = true;
    me.zoneDragShaped = true;
    me.zoneDragAreaId = ref.areaId;
    me.zoneFx0 = me.zoneFx1 = Math.max(0, Math.min(st.gridCells, snapQ((localX + st.mapHalf) / st.cellSize)));
    me.zoneFy0 = me.zoneFy1 = Math.max(0, Math.min(st.gridCellsY, snapQ((localY + st.mapHalfY) / st.cellSize)));
    me.zoneDragValid = false;
    return;
  }
  me.zoneDragShaped = false;
  me.zoneDragActive = true;
  me.zoneDragAreaId = ref.areaId;
  me.zoneAnchorGx = snapCell(localX, st.mapHalf, st.cellSize, st.gridCells);
  me.zoneAnchorGy = snapCell(localY, st.mapHalfY, st.cellSize, st.gridCellsY);
  me.zoneGx = me.zoneAnchorGx; me.zoneGy = me.zoneAnchorGy;
  me.zoneCw = 1; me.zoneCh = 1;
  me.zoneDragValid = (me.zoneAddTo >= 0 || underCap(ref.cfg, 'zone')) && canPlaceZone(ref, me.zoneGx, me.zoneGy, 1, 1, me.zoneAddTo >= 0 ? me.zoneAddTo : -1);
}

export const ZONE_HANDLE_PX = 9;
function pressZoneHandle(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number): boolean {
  const me = logic.mapEditor;
  if (!me.hasSelection || me.selection.kind !== 'zone' || me.selection.areaId !== ref.areaId) return false;
  const z = findPlacedZone(ref.cfg, me.selection.id);
  if (!z || zoneShapeOf(z) !== null) return false;
  const st = ref.state;
  const cs = st.cellSize, mh = st.mapHalf, mhY = st.mapHalfY;
  const reach = ZONE_HANDLE_PX * logic.dpr / logic.mapDesignerZoom;
  const n = z.more ? z.more.length : 0;
  for (let k = -1; k < n; k++) {
    const q = k < 0 ? z : z.more![k];
    for (let c = 0; c < 4; c++) {
      const cx = -mh + (q.gx + ((c & 1) !== 0 ? q.cw : 0)) * cs, cy = -mhY + (q.gy + ((c & 2) !== 0 ? q.ch : 0)) * cs;
      if (Math.abs(localX - cx) > reach || Math.abs(localY - cy) > reach) continue;
      me.zoneResizeId = z.id; me.zoneResizeRect = k;
      me.zoneDragActive = true;
      me.zoneDragAreaId = ref.areaId;
      me.zoneAnchorGx = (c & 1) !== 0 ? q.gx : q.gx + q.cw - 1;
      me.zoneAnchorGy = (c & 2) !== 0 ? q.gy : q.gy + q.ch - 1;
      me.zoneGx = q.gx; me.zoneGy = q.gy; me.zoneCw = q.cw; me.zoneCh = q.ch;
      me.zoneDragValid = true;
      return true;
    }
  }
  return false;
}
function pressStroke(logic: GameLogic, ref: EditAreaRef, _localX: number, _localY: number, worldX: number, worldY: number): void {
  const me = logic.mapEditor;
  logic.beginMapEditStroke(ref.areaId);
  me.placeStrokeActive = true;
  me.strokeAreaId = ref.areaId;
  me.strokeButton = 0;
  me.strokeLastWorldX = worldX; me.strokeLastWorldY = worldY;
  me.strokeHasLast = true;
  refreshMapEditorVisuals(logic, worldX, worldY);
  if (me.hasGhost && me.ghostValid) commitPlacementStep(logic);
}
function pressOne(logic: GameLogic, ref: EditAreaRef, _localX: number, _localY: number, worldX: number, worldY: number): void {
  const me = logic.mapEditor;
  refreshMapEditorVisuals(logic, worldX, worldY);
  if (me.hasGhost && me.ghostValid) {
    logic.beginMapEditStroke(ref.areaId);
    commitPlacementStep(logic);
    logic.endMapEditStroke();
    if (logic.onStateChange) logic.onStateChange(logic.state);
  }
}

function eraseAtPoint(logic: GameLogic, ref: EditAreaRef, worldX: number, worldY: number): boolean {
  const st = ref.state;
  const localX = worldX - ref.offX;
  const localY = worldY - ref.offY;
  const custom = isCustomMap(ref.cfg);
  const b = _batch;
  const skip = b !== null && SMALL_FIX.G722 !== 0 ? (h: MapEditorSelection) => b.erased.has(`${h.areaId}|${h.kind}|${h.id}|${h.genKey ?? ''}`) : undefined;
  const hit = hitTestEntity(ref, localX, localY, custom,
    logic.placedWallIndexFor(st, ref.areaId, ref.cfg, ref.offX, ref.offY), skip);
  if (!hit) return false;
  const sel: MapEditorSelection = {
    areaId: hit.areaId, kind: hit.kind, id: hit.id, genKey: hit.genKey,
  };
  const key = `${hit.areaId}|${hit.kind}|${hit.id}|${hit.genKey ?? ''}`;
  if (_batch) { if (_batch.erased.has(key)) return false; _batch.erased.add(key); }
  return logic.mapEditStrokeStep(cfg => opDelete(cfg, sel));
}

function placeStepAtPoint(logic: GameLogic, worldX: number, worldY: number): void {
  const me = logic.mapEditor;
  const ref = resolveEditArea(logic, worldX, worldY);
  if (!ref || ref.areaId !== me.strokeAreaId) return;
  refreshMapEditorVisuals(logic, worldX, worldY);
  if (!me.hasGhost || !me.ghostValid) return;
  if (_batch && !batchAllows(_batch, me, ref.state.spawnableTiles.length)) return;
  commitPlacementStep(logic);
  if (_batch) batchNote(_batch, me);
}

interface StrokeBatch {
  walls: { x0: number; y0: number; x1: number; y1: number }[];
  rocks: { x: number; y: number; r: number }[];
  covered: number;
  erased: Set<string>;
}
let _batch: StrokeBatch | null = null;
function circleTouchesBox(cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const nx = Math.max(x0, Math.min(cx, x1)), ny = Math.max(y0, Math.min(cy, y1));
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
function batchAllows(b: StrokeBatch, me: MapEditorState, spawnable: number): boolean {
  if (me.ghostKind === 'wall') {
    const x0 = me.ghostX - me.ghostW / 2 + 0.5, x1 = me.ghostX + me.ghostW / 2 - 0.5;
    const y0 = me.ghostY - me.ghostH / 2 + 0.5, y1 = me.ghostY + me.ghostH / 2 - 0.5;
    for (const w of b.walls) if (x0 < w.x1 && x1 > w.x0 && y0 < w.y1 && y1 > w.y0) return false;
    for (const r of b.rocks) if (circleTouchesBox(r.x, r.y, r.r, x0, y0, x1, y1)) return false;
    const cells = me.wallCells * me.wallCells;
    return spawnable - b.covered - cells >= 1;
  }
  if (me.ghostKind === 'rock') {
    for (const r of b.rocks) { const dx = me.ghostX - r.x, dy = me.ghostY - r.y, reach = me.ghostR + r.r + ROCK_GAP; if (dx * dx + dy * dy < reach * reach) return false; }
    for (const w of b.walls) if (circleTouchesBox(me.ghostX, me.ghostY, me.ghostR, w.x0, w.y0, w.x1, w.y1)) return false;
  }
  return true;
}
function batchNote(b: StrokeBatch, me: MapEditorState): void {
  if (me.ghostKind === 'wall') {
    b.walls.push({ x0: me.ghostX - me.ghostW / 2, y0: me.ghostY - me.ghostH / 2, x1: me.ghostX + me.ghostW / 2, y1: me.ghostY + me.ghostH / 2 });
    b.covered += me.wallCells * me.wallCells;
  } else if (me.ghostKind === 'rock') {
    b.rocks.push({ x: me.ghostX, y: me.ghostY, r: me.ghostR });
  }
}

function eraseStepAtPoint(logic: GameLogic, worldX: number, worldY: number): void {
  const me = logic.mapEditor;
  const ref = resolveEditArea(logic, worldX, worldY);
  if (!ref || ref.areaId !== me.strokeAreaId) return;
  eraseAtPoint(logic, ref, worldX, worldY);
}

function strokeAlong(
  logic: GameLogic, x0: number, y0: number, x1: number, y1: number,
  step: (logic: GameLogic, wx: number, wy: number) => void
): void {
  const ref = resolveEditArea(logic, x1, y1);
  const cs = ref ? ref.state.cellSize : 30;
  const spacing = Math.max(8, cs * 0.5);
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const n = Math.min(64, Math.floor(dist / spacing));
  _batch = { walls: [], rocks: [], covered: 0, erased: new Set() };
  logic.beginMapEditBatch();
  try {
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      step(logic, x0 + dx * t, y0 + dy * t);
    }
    step(logic, x1, y1);
  } finally {
    _batch = null;
    logic.flushMapEditBatch();
  }
}

export function mapEditorRightPointerDown(logic: GameLogic, worldX: number, worldY: number): boolean {
  const me = logic.mapEditor;
  if (!logic.isMapDesignerActive || logic.state.isTestMode) return false;

  if (me.dragArmed || me.dragActive || me.zoneDragActive || me.vtxDrag !== -1 || me.freeActive
      || me.placeStrokeActive || me.eraseStrokeActive) {
    cancelMapEditInteraction(me);
    logic.endMapEditStroke();
    refreshMapEditorVisuals(logic, worldX, worldY);
    if (logic.onStateChange) logic.onStateChange(logic.state);
    return false;
  }

  const ref = resolveEditArea(logic, worldX, worldY);
  if (!ref) return false;

  if (!isCustomMap(ref.cfg) && me.tool !== 'select' && me.tool !== 'eraser') return false;

  logic.beginMapEditStroke(ref.areaId);
  me.eraseStrokeActive = true;
  me.strokeAreaId = ref.areaId;
  me.strokeButton = 2;
  me.strokeLastWorldX = worldX; me.strokeLastWorldY = worldY;
  me.strokeHasLast = true;
  eraseAtPoint(logic, ref, worldX, worldY);
  if (me.tool !== 'eraser') me.deleteFlashAt = performance.now() + 650;
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return true;
}

export function mapEditorRightPointerUp(logic: GameLogic, worldX: number, worldY: number): void {
  const me = logic.mapEditor;
  if (!me.eraseStrokeActive || me.strokeButton !== 2) return;
  me.eraseStrokeActive = false;
  me.strokeHasLast = false;
  logic.endMapEditStroke();
  refreshMapEditorVisuals(logic, worldX, worldY);
  if (logic.onStateChange) logic.onStateChange(logic.state);
}

function commitDrag(logic: GameLogic): void {
  const me = logic.mapEditor;
  if (!me.ghostValid) return;

  const ref = areaRefById(logic, me.dragAreaId);
  if (!ref) return;
  const g = resolveSelection(ref, me.selection);
  if (!g) return;
  if (SMALL_FIX.R804 && (g.kind === 'rock' ? (cellCoordToLocal(me.pendCx, ref.state.mapHalf, ref.state.cellSize) === g.lx && cellCoordToLocal(me.pendCy, ref.state.mapHalfY, ref.state.cellSize) === g.ly) : (me.pendGx === g.gx && me.pendGy === g.gy))) return;
  if (me.selection.id < 0 && (g.kind === 'wall' || g.kind === 'rock') && !underCap(ref.cfg, g.kind)) return;

  const sel: MapEditorSelection = {
    areaId: me.selection.areaId, kind: me.selection.kind,
    id: me.selection.id, genKey: me.selection.genKey,
  };
  MAP_KINDS[g.kind].move(logic, ref, g, sel, me.dragAreaId);
}

function moveWall(logic: GameLogic, ref: EditAreaRef, g: SelGeom, sel: MapEditorSelection, areaId: string): void {
  const me = logic.mapEditor;
  const cs = ref.state.cellSize;
  const destGx = me.pendGx, destGy = me.pendGy;
  const cw = g.cw, ch = g.ch;
  const lookGx = g.gx + Math.round(g.lookDx / cs), lookGy = g.gy + Math.round(g.lookDy / cs);
  if (sel.id >= 0) {
    logic.applyMapEdit(areaId, cfg => opMoveWall(cfg, sel.id, destGx, destGy));
  } else {
    let newId = -1;
    logic.applyMapEdit(areaId, cfg => {
      opDelete(cfg, sel);
      newId = opPlaceWall(cfg, destGx, destGy, cw, ch, lookGx, lookGy);
    });
    if (newId >= 0) { me.selection.id = newId; me.selection.genKey = ''; }
  }
}

function moveRock(logic: GameLogic, ref: EditAreaRef, g: SelGeom, sel: MapEditorSelection, areaId: string): void {
  const me = logic.mapEditor;
  const cs = ref.state.cellSize, mh = ref.state.mapHalf;
  const mhY = ref.state.mapHalfY;
  const destCx = me.pendCx, destCy = me.pendCy;
  if (sel.id >= 0) {
    logic.applyMapEdit(areaId, cfg => opMoveRock(cfg, sel.id, destCx, destCy));
  } else {
    const size = g.size, rot = g.rotation, rk = g.rockKind;
    const lookCx = (g.lx + g.lookDx + mh) / cs, lookCy = (g.ly + g.lookDy + mhY) / cs;
    let newId = -1;
    logic.applyMapEdit(areaId, cfg => {
      opDelete(cfg, sel);
      newId = opPlaceRock(cfg, destCx, destCy, size, rot, rk, lookCx, lookCy);
    });
    if (newId >= 0) { me.selection.id = newId; me.selection.genKey = ''; }
  }
}

function moveZone(logic: GameLogic, ref: EditAreaRef, g: SelGeom, sel: MapEditorSelection, areaId: string): void {
  const me = logic.mapEditor;
  const cs = ref.state.cellSize, mh = ref.state.mapHalf;
  const mhY = ref.state.mapHalfY;
  const destGx = me.pendGx, destGy = me.pendGy;
  const cw = g.cw, ch = g.ch, team = g.team;
  const dx = destGx - g.gx, dy = destGy - g.gy;
  const others = me.marks.filter(id => id !== sel.id);
  const gc = ref.state.gridCells, gcY = ref.state.gridCellsY;
  logic.applyMapEdit(areaId, cfg => {
    opWriteZone(cfg, sel.id, destGx, destGy, cw, ch, team, mh, cs, 'base', mhY);
    for (const id of others) {
      const z = findPlacedZone(cfg, id);
      if (z && z.gx + dx >= 0 && z.gy + dy >= 0 && z.gx + dx + z.cw <= gc && z.gy + dy + z.ch <= gcY) opWriteZone(cfg, id, z.gx + dx, z.gy + dy, z.cw, z.ch, z.team, mh, cs, 'base', mhY);
    }
  });
}

function movePortal(logic: GameLogic, _ref: EditAreaRef, _g: SelGeom, sel: MapEditorSelection, areaId: string): void {
  const me = logic.mapEditor;
  const destGx = me.pendGx, destGy = me.pendGy;
  logic.applyMapEdit(areaId, cfg => opMovePortal(cfg, sel.id, destGx, destGy));
}

export interface MapKindDef {
  onEveryMap: boolean;
  underCap(cfg: MapConfig): boolean;
  resolve(ref: EditAreaRef, sel: MapEditorSelection): boolean;
  placeGhost(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number, custom: boolean): void;
  dragGhost(logic: GameLogic, ref: EditAreaRef, g: SelGeom, localX: number, localY: number): void;
  press(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number, worldX: number, worldY: number, custom: boolean): void;
  placeStep(logic: GameLogic): void;
  grabByCorner: boolean;
  move(logic: GameLogic, ref: EditAreaRef, g: SelGeom, sel: MapEditorSelection, areaId: string): void;
}
const noPlaceStep = (): void => {};

export const MAP_KINDS: Record<MapEditorKind, MapKindDef> = {
  wall: { onEveryMap: false, underCap: cfg => editWalls(cfg).length < MAP_EDIT_MAX_WALLS, resolve: resolveWall, placeGhost: placeGhostWall, dragGhost: dragGhostBlock, press: pressStroke, placeStep: placeStepWall, grabByCorner: true, move: moveWall },
  rock: { onEveryMap: false, underCap: cfg => editRocks(cfg).length < MAP_EDIT_MAX_ROCKS, resolve: resolveRock, placeGhost: placeGhostRock, dragGhost: dragGhostRock, press: pressStroke, placeStep: placeStepRock, grabByCorner: false, move: moveRock },
  zone: { onEveryMap: MAP_EVENTS.ON !== 0, underCap: cfg => editZones(cfg).length < MAP_EDIT_MAX_ZONES, resolve: resolveZone, placeGhost: placeGhostZone, dragGhost: dragGhostBlock, press: pressZone, placeStep: noPlaceStep, grabByCorner: true, move: moveZone },
  portal: { onEveryMap: PLACED_PORTALS.ON !== 0, underCap: cfg => editPortals(cfg).length < MAP_EDIT_MAX_PORTALS, resolve: resolvePortal, placeGhost: placeGhostPortal, dragGhost: dragGhostPortal, press: pressOne, placeStep: placeStepPortal, grabByCorner: false, move: movePortal },
  entity: { onEveryMap: MAP_EVENTS.ON !== 0, underCap: cfg => editEntities(cfg).length < MAP_EDIT_MAX_ENTITIES, resolve: resolveEntity, placeGhost: placeGhostEntity, dragGhost: dragGhostEntity, press: pressOne, placeStep: placeStepEntity, grabByCorner: false, move: moveEntity },
};

export function areaRefById(logic: GameLogic, areaId: string): EditAreaRef | null {
  if (!areaId) return resolveEditArea(logic, 0, 0);
  const bounds = logic.areaBounds;
  for (let i = 0; i < bounds.length; i++) {
    if (bounds[i].id === areaId) return resolveEditArea(logic, bounds[i].centerX, bounds[i].centerY);
  }
  return null;
}

function focusAreaForEdit(logic: GameLogic, areaId: string): void {
  if (!areaId) return;
  const mac = logic.state.multiAreaConfig;
  if (!mac.enableMultiArea || mac.activeAreaId === areaId) return;
  logic.updateState({ multiAreaConfig: { ...mac, activeAreaId: areaId } });
}

const _outline = { kind: 'wall' as MapEditorKind, x: 0, y: 0, w: 0, h: 0, r: 0, rotation: 0 };

export function selectionOutline(logic: GameLogic): typeof _outline | null {
  const me = logic.mapEditor;
  if (!me.hasSelection) return null;
  const ref = areaRefById(logic, me.selection.areaId);
  if (!ref) return null;
  const g = resolveSelection(ref, me.selection);
  if (!g) return null;
  _outline.kind = g.kind;
  _outline.x = g.lx + ref.offX;
  _outline.y = g.ly + ref.offY;
  _outline.w = g.halfW * 2;
  _outline.h = g.halfH * 2;
  _outline.r = g.radius;
  _outline.rotation = g.kind === 'rock' ? g.rotation : 0;
  return _outline;
}

const _dragHide = {
  kind: 'wall' as MapEditorKind, areaId: '',
  x: 0, y: 0, halfW: 0, halfH: 0, radius: 0,
  gx: 0, gy: 0, cw: 0, ch: 0,
  uid: -1,
};

export function dragHideInfo(logic: GameLogic): typeof _dragHide | null {
  const me = logic.mapEditor;
  if (!me.dragActive || !me.hasSelection) return null;
  const ref = areaRefById(logic, me.selection.areaId);
  if (!ref) return null;
  const g = resolveSelection(ref, me.selection);
  if (!g) return null;
  _dragHide.kind = g.kind;
  _dragHide.areaId = ref.areaId;
  _dragHide.x = g.lx + ref.offX;
  _dragHide.y = g.ly + ref.offY;
  _dragHide.halfW = g.halfW;
  _dragHide.halfH = g.halfH;
  _dragHide.radius = g.radius;
  _dragHide.gx = g.gx; _dragHide.gy = g.gy;
  _dragHide.cw = g.cw; _dragHide.ch = g.ch;
  _dragHide.uid = g.kind === 'zone' ? (findPlacedZone(ref.cfg, me.selection.id)?.uid ?? -1) : -1;
  return _dragHide;
}

const _zoneRect = { x: 0, y: 0, w: 0, h: 0 };

export function zoneDragRect(logic: GameLogic): typeof _zoneRect | null {
  const me = logic.mapEditor;
  if (!me.zoneDragActive) return null;
  const ref = areaRefById(logic, me.zoneDragAreaId);
  if (!ref) return null;
  const cs = ref.state.cellSize, mh = ref.state.mapHalf;
  const mhY = ref.state.mapHalfY;
  _zoneRect.x = ref.offX - mh + me.zoneGx * cs;
  _zoneRect.y = ref.offY - mhY + me.zoneGy * cs;
  _zoneRect.w = me.zoneCw * cs;
  _zoneRect.h = me.zoneCh * cs;
  return _zoneRect;
}

export function resizeSelectedWall(logic: GameLogic, cells: number): boolean {
  const me = logic.mapEditor;
  if (!me.hasSelection || me.selection.kind !== 'wall' || me.selection.id < 0) return false;
  const ref = areaRefById(logic, me.selection.areaId);
  if (!ref) return false;
  const w = findPlacedWall(ref.cfg, me.selection.id);
  if (!w) return false;
  const n = Math.round(cells);
  if (n === w.cw && n === w.ch) return true;
  const id = w.id, gx = w.gx, gy = w.gy;
  clearEditIgnore(EDIT_IGNORE);
  EDIT_IGNORE.wallGx = gx; EDIT_IGNORE.wallGy = gy;
  EDIT_IGNORE.wallCw = w.cw; EDIT_IGNORE.wallCh = w.ch;
  if (!canPlaceWall(ref, gx, gy, n, n, EDIT_IGNORE)) return false;
  logic.applyMapEdit(me.selection.areaId, cfg => opResizeWall(cfg, id, n, n));
  return true;
}

export function resizeSelectedRock(logic: GameLogic, size: number): boolean {
  const me = logic.mapEditor;
  if (!me.hasSelection || me.selection.kind !== 'rock' || me.selection.id < 0) return false;
  const ref = areaRefById(logic, me.selection.areaId);
  if (!ref) return false;
  const g = resolveSelection(ref, me.selection);
  if (!g) return false;
  const lx = g.lx, ly = g.ly, rockIdx = g.rockIdx, current = Math.round(g.size);
  const s = Math.round(Math.max(size, rockSizeFloor(logic)));
  if (s === current) return true;
  clearEditIgnore(EDIT_IGNORE);
  EDIT_IGNORE.rockIdx = rockIdx;
  if (!canPlaceRock(ref, lx, ly, s, EDIT_IGNORE)) return false;
  const id = me.selection.id;
  logic.applyMapEdit(me.selection.areaId, cfg => opUpdateRock(cfg, id, { size: s }));
  return true;
}

export function updateSelectedZone(
  logic: GameLogic, patch: { cw?: number; ch?: number; team?: 0 | 1 | 2 | 3 }
): boolean {
  const me = logic.mapEditor;
  if (!me.hasSelection || me.selection.kind !== 'zone') return false;
  const ref = areaRefById(logic, me.selection.areaId);
  if (!ref) return false;
  const z = findPlacedZone(ref.cfg, me.selection.id);
  if (!z) return false;
  const cw = patch.cw !== undefined ? Math.round(patch.cw) : z.cw;
  const ch = patch.ch !== undefined ? Math.round(patch.ch) : z.ch;
  const team = patch.team !== undefined ? patch.team : z.team;
  if (cw === z.cw && ch === z.ch && team === z.team) return true;
  const extentChanged = cw !== z.cw || ch !== z.ch;
  if (extentChanged && !canPlaceZone(ref, z.gx, z.gy, cw, ch, z.id)) return false;
  const id = z.id, gx = z.gx, gy = z.gy;
  const mh = ref.state.mapHalf, cs = ref.state.cellSize;
  const mhY = ref.state.mapHalfY;
  logic.applyMapEdit(me.selection.areaId, cfg => {
    opWriteZone(cfg, id, gx, gy, cw, ch, team, mh, cs, 'base', mhY);
  });
  return true;
}

export function updateSelectedZoneArea(
  logic: GameLogic,
  patch: Partial<Pick<PlacedZone, 'kind' | 'color' | 'colorMap' | 'colorFree' | 'opacity' | 'bounce' | 'spare' | 'name' | 'showName'>>
): boolean {
  const me = logic.mapEditor;
  if (!me.hasSelection || me.selection.kind !== 'zone') return false;
  const ref = areaRefById(logic, me.selection.areaId);
  if (!ref) return false;
  const z = findPlacedZone(ref.cfg, me.selection.id);
  if (!z) return false;
  if (patch.kind === 'base' && z.kind && z.kind !== 'base' && !canPlaceZone(ref, z.gx, z.gy, z.cw, z.ch, -1, true)) return false;
  const id = z.id;
  const mh = ref.state.mapHalf, cs = ref.state.cellSize;
  const mhY = ref.state.mapHalfY;
  logic.applyMapEdit(me.selection.areaId, cfg => {
    opPatchZone(cfg, id, patch);
    if (patch.kind === 'base') {
      const q = findPlacedZone(cfg, id);
      if (q) opWriteZone(cfg, id, q.gx, q.gy, q.cw, q.ch, q.team, mh, cs, 'base', mhY);
    }
  });
  return true;
}

export function selectionAreaState(logic: GameLogic, areaId: string) {
  const ref = areaRefById(logic, areaId);
  return ref ? ref.state : logic.mapState;
}

export function deleteMapEditorSelection(logic: GameLogic): boolean {
  const me = logic.mapEditor;
  if (!me.hasSelection || logic.state.isTestMode) return false;
  if (me.vtxMode && me.vtxSels.length > 0 && removePickedPoints(logic)) return true;
  const sel: MapEditorSelection = {
    areaId: me.selection.areaId, kind: me.selection.kind,
    id: me.selection.id, genKey: me.selection.genKey,
  };
  logic.endMapEditStroke();
  const marked = me.marks.filter(id => id !== sel.id);
  logic.applyMapEdit(sel.areaId, cfg => {
    opDelete(cfg, sel);
    for (const id of marked) opDelete(cfg, { areaId: sel.areaId, kind: sel.kind, id, genKey: '' });
  });
  me.marks = [];
  clearMapEditSelection(me);
  cancelMapEditInteraction(me);
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return true;
}

const AREA_SNAP = 4;
const snapQ = (v: number): number => Math.round(v * AREA_SNAP) / AREA_SNAP;
const AREA_SHAPE_MIN = 0.5;
export const VTX_BOX = 1000;
const DOUBLE_MS = 400, DOUBLE_PX = 6;

export function noteMapEditorMods(logic: GameLogic, shift: boolean, alt: boolean): void {
  logic.mapEditor.modShift = shift; logic.mapEditor.modAlt = alt;
}

function regularAspect(sides: number): number {
  const p = regularPolyPts(sides, 0, 0, 1, 1);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const n = Math.max(AREA_SIDES_MIN, Math.min(AREA_SIDES_MAX, Math.round(sides)));
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + Math.PI / n + (i * Math.PI * 2) / n, x = Math.cos(a), y = Math.sin(a);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return p.length > 0 ? (y1 - y0) / (x1 - x0) : 1;
}

const _toolBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
export function toolDragBox(me: MapEditorState): typeof _toolBox {
  let dx = me.zoneFx1 - me.zoneFx0, dy = me.zoneFy1 - me.zoneFy0;
  if (me.modShift) {
    const asp = me.zoneShape === 'poly' ? regularAspect(me.zoneSides) : 1;
    const w = Math.max(Math.abs(dx), Math.abs(dy) / asp);
    dx = dx < 0 ? -w : w; dy = (dy < 0 ? -1 : 1) * w * asp;
  }
  if (me.modAlt) { _toolBox.x0 = me.zoneFx0 - Math.abs(dx); _toolBox.x1 = me.zoneFx0 + Math.abs(dx); _toolBox.y0 = me.zoneFy0 - Math.abs(dy); _toolBox.y1 = me.zoneFy0 + Math.abs(dy); }
  else { _toolBox.x0 = Math.min(me.zoneFx0, me.zoneFx0 + dx); _toolBox.x1 = Math.max(me.zoneFx0, me.zoneFx0 + dx); _toolBox.y0 = Math.min(me.zoneFy0, me.zoneFy0 + dy); _toolBox.y1 = Math.max(me.zoneFy0, me.zoneFy0 + dy); }
  return _toolBox;
}
export function toolShapeOfBox(me: MapEditorState, b: { x0: number; y0: number; x1: number; y1: number }): AreaShape {
  if (me.zoneShape === 'ellipse') return { k: 'ellipse', cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, rx: (b.x1 - b.x0) / 2, ry: (b.y1 - b.y0) / 2 };
  const n = Math.max(AREA_SIDES_MIN, Math.min(AREA_SIDES_MAX, Math.round(me.zoneSides)));
  return { k: 'poly', pts: regularPolyPts(n, b.x0, b.y0, b.x1, b.y1), sides: n };
}

function placeShapedArea(logic: GameLogic, areaId: string, shape: AreaShape): boolean {
  const me = logic.mapEditor;
  const ref = areaRefById(logic, areaId);
  if (!ref || !underCap(ref.cfg, 'zone')) return false;
  const st = ref.state;
  const s = shapeOnGrid(shape, st.gridCells, st.gridCellsY);
  const b = shapeCellBox(s);
  let made = -1;
  logic.applyMapEdit(areaId, cfg => {
    made = opWriteZone(cfg, -1, Math.max(0, b.gx), Math.max(0, b.gy), b.cw, b.ch, me.zoneTeam, st.mapHalf, st.cellSize, 'cosmetic', st.mapHalfY);
    if (made >= 0) opShapeZone(cfg, made, s, st.gridCells, st.gridCellsY);
  });
  if (made < 0) return false;
  if (MAP_EVENTS.ON !== 0) { setMapEditSelection(me, { areaId, kind: 'zone', id: made, genKey: '' }); me.focusNameOf = made; }
  return true;
}
function commitToolShape(logic: GameLogic): void {
  const me = logic.mapEditor;
  const areaId = me.zoneDragAreaId, valid = me.zoneDragValid;
  const shape = toolShapeOfBox(me, toolDragBox(me));
  me.zoneDragActive = false; me.zoneDragShaped = false;
  if (valid) placeShapedArea(logic, areaId, shape);
}

function pressFreePoint(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number): void {
  const me = logic.mapEditor;
  const st = ref.state;
  const fx = Math.max(0, Math.min(st.gridCells, snapQ((localX + st.mapHalf) / st.cellSize)));
  const fy = Math.max(0, Math.min(st.gridCellsY, snapQ((localY + st.mapHalfY) / st.cellSize)));
  if (!me.freeActive || me.freeAreaId !== ref.areaId) {
    if (!underCap(ref.cfg, 'zone')) return;
    me.freeActive = true; me.freeAreaId = ref.areaId; me.freePts.length = 0; me.freePts.push(fx, fy);
    me.freeX = fx; me.freeY = fy;
    return;
  }
  const p = me.freePts, n = p.length >> 1;
  const reach = ZONE_HANDLE_PX * logic.dpr / logic.mapDesignerZoom / st.cellSize;
  if (n >= 3 && ((Math.abs(fx - p[0]) <= reach && Math.abs(fy - p[1]) <= reach) || (Math.abs(fx - p[p.length - 2]) <= reach * 0.5 && Math.abs(fy - p[p.length - 1]) <= reach * 0.5))) { closeFreeShape(logic); return; }
  if (Math.abs(fx - p[p.length - 2]) < 1e-9 && Math.abs(fy - p[p.length - 1]) < 1e-9) return;
  if (n >= AREA_SHAPE_MAX_POINTS) { closeFreeShape(logic); return; }
  p.push(fx, fy);
}
export function closeFreeShape(logic: GameLogic): boolean {
  const me = logic.mapEditor;
  if (!me.freeActive) return false;
  const pts = me.freePts.slice(), areaId = me.freeAreaId;
  me.freeActive = false; me.freePts.length = 0; me.freeAreaId = '';
  if (pts.length < 6 || polyArea(pts) < 0.25) { if (logic.onStateChange) logic.onStateChange(logic.state); return false; }
  const ok = placeShapedArea(logic, areaId, { k: 'poly', pts });
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return ok;
}
export function undoFreePoint(logic: GameLogic): boolean {
  const me = logic.mapEditor;
  if (!me.freeActive) return false;
  me.freePts.length = Math.max(0, me.freePts.length - 2);
  if (me.freePts.length === 0) { me.freeActive = false; me.freeAreaId = ''; }
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return true;
}

interface PickedShape { ref: EditAreaRef; z: PlacedZone; sh: AreaShape }
let _picked: PickedShape | null = null;
export function pickedShape(logic: GameLogic, ref: EditAreaRef | null): PickedShape | null {
  const me = logic.mapEditor;
  if (!me.hasSelection || me.selection.kind !== 'zone' || (ref !== null && me.selection.areaId !== ref.areaId)) return null;
  const r = ref ?? areaRefById(logic, me.selection.areaId);
  if (!r) return null;
  const z = findPlacedZone(r.cfg, me.selection.id);
  const sh = z ? zoneShapeOf(z) : null;
  if (!z || !sh) return null;
  if (_picked === null) _picked = { ref: r, z, sh };
  else { _picked.ref = r; _picked.z = z; _picked.sh = sh; }
  return _picked;
}
const _hb = { x0: 0, y0: 0, x1: 0, y1: 0 };
export function boxHandleAt(b: { x0: number; y0: number; x1: number; y1: number }, k: number, out: { x: number; y: number }): void {
  const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
  out.x = k === 0 || k === 6 || k === 7 ? b.x0 : k === 1 || k === 5 ? mx : b.x1;
  out.y = k <= 2 ? b.y0 : k === 3 || k === 7 ? my : b.y1;
}
const _hp = { x: 0, y: 0 };
export const VTX_SIDE = 2000, VTX_EXTRUDE = 3000, VTX_MARQUEE = 4000;
const VTX_MOVE_PX = 3;

function handleUnder(logic: GameLogic, ps: PickedShape, sh: AreaShape, fx: number, fy: number): number {
  const me = logic.mapEditor;
  const reach = ZONE_HANDLE_PX * logic.dpr / logic.mapDesignerZoom / ps.ref.state.cellSize;
  if (me.vtxMode) return sh.k === 'poly' ? nearestPoint(sh.pts!, fx, fy, reach) : -1;
  shapeBox(sh, _hb);
  for (let k = 0; k < 8; k++) { boxHandleAt(_hb, k, _hp); if (Math.abs(fx - _hp.x) <= reach && Math.abs(fy - _hp.y) <= reach) return VTX_BOX + k; }
  return -1;
}
function sideUnder(logic: GameLogic, ps: PickedShape, sh: AreaShape, fx: number, fy: number): number {
  if (!logic.mapEditor.vtxMode || sh.k !== 'poly') return -1;
  const reach = ZONE_HANDLE_PX * logic.dpr / logic.mapDesignerZoom / ps.ref.state.cellSize;
  const s = nearestSide(sh.pts!, fx, fy, reach);
  if (s === null) return -1;
  logic.mapEditor.vtxEdgeX = snapQ(s.qx); logic.mapEditor.vtxEdgeY = snapQ(s.qy);
  return s.i;
}
function liveSels(me: MapEditorState, sh: AreaShape): number[] {
  const n = sh.k === 'poly' ? nPts(sh.pts!) : 0;
  return me.vtxSels.filter(i => i >= 0 && i < n);
}

function pressShapeHandle(logic: GameLogic, ref: EditAreaRef, localX: number, localY: number, screenX: number, screenY: number): boolean {
  const me = logic.mapEditor;
  const ps = pickedShape(logic, ref);
  const now = performance.now();
  const dbl = now - me.lastPressT < DOUBLE_MS && Math.abs(screenX - me.lastPressX) < DOUBLE_PX * logic.dpr && Math.abs(screenY - me.lastPressY) < DOUBLE_PX * logic.dpr;
  me.lastPressT = now; me.lastPressX = screenX; me.lastPressY = screenY;
  if (ps === null) return false;
  const st = ref.state;
  const fx = (localX + st.mapHalf) / st.cellSize, fy = (localY + st.mapHalfY) / st.cellSize;
  const sh = ps.sh;
  const tell = (): true => { if (logic.onStateChange) logic.onStateChange(logic.state); return true; };
  const begin = (code: number, orig: AreaShape): void => {
    me.vtxDrag = code; me.vtxOrig = orig; me.vtxShape = orig; me.vtxStartX = fx; me.vtxStartY = fy; me.vtxCurX = fx; me.vtxCurY = fy; me.vtxMoved = false;
  };
  if (dbl && polyHas(zoneCellPoly(ps.z, sh), fx, fy) && (sh.k === 'poly' || me.vtxMode)) {
    me.vtxMode = !me.vtxMode; me.vtxSels = []; me.vtxSel = -1; me.vtxDrag = -1;
    return tell();
  }
  const h = handleUnder(logic, ps, sh, fx, fy);
  if (h >= VTX_BOX) { begin(h, sh); return tell(); }
  if (h >= 0) {
    if (me.modAlt) { removePickedPoints(logic, [h]); return true; }
    let sels = liveSels(me, sh);
    if (me.modShift) {
      const at = sels.indexOf(h);
      if (at >= 0) { sels.splice(at, 1); me.vtxSels = sels; me.vtxSel = sels.length ? sels[sels.length - 1] : -1; return tell(); }
      sels.push(h);
    } else if (!sels.includes(h)) sels = [h];
    me.vtxSels = sels; me.vtxSel = h;
    begin(h, sh);
    return tell();
  }
  const side = sideUnder(logic, ps, sh, fx, fy);
  if (side >= 0) {
    if (me.modAlt && nPts(sh.pts!) + 2 <= AREA_SHAPE_MAX_POINTS) {
      const pts = extrudeSide(sh.pts!, side);
      const s2: AreaShape = { k: 'poly', pts };
      if (sh.rot !== undefined) s2.rot = sh.rot;
      const nrm = sideNormal(sh.pts!, side);
      me.vtxNx = nrm[0]; me.vtxNy = nrm[1];
      me.vtxSels = [side + 1, side + 2]; me.vtxSel = side + 2;
      begin(VTX_EXTRUDE + side, s2);
      return tell();
    }
    const nrm = sideNormal(sh.pts!, side);
    me.vtxNx = nrm[0]; me.vtxNy = nrm[1];
    me.vtxPendX = me.vtxEdgeX; me.vtxPendY = me.vtxEdgeY;
    begin(VTX_SIDE + side, sh);
    return tell();
  }
  if (me.vtxMode && sh.k === 'poly') {
    shapeBox(sh, _hb);
    if (fx >= _hb.x0 && fx <= _hb.x1 && fy >= _hb.y0 && fy <= _hb.y1) { begin(VTX_MARQUEE, sh); return tell(); }
  }
  return false;
}

function dragShapeHandle(logic: GameLogic, ps: PickedShape, fx: number, fy: number): void {
  const me = logic.mapEditor;
  const orig = me.vtxOrig!;
  const st = ps.ref.state;
  me.vtxCurX = fx; me.vtxCurY = fy;
  const movedPx = Math.hypot(fx - me.vtxStartX, fy - me.vtxStartY) * st.cellSize * logic.mapDesignerZoom / logic.dpr;
  if (movedPx >= VTX_MOVE_PX) me.vtxMoved = true;
  if (me.vtxDrag === VTX_MARQUEE) return;
  let dx = snapQ(fx) - snapQ(me.vtxStartX), dy = snapQ(fy) - snapQ(me.vtxStartY);
  if (me.vtxDrag < VTX_BOX) {
    if (!me.vtxMoved) return;
    if (me.modShift) [dx, dy] = constrainEight(dx, dy);
    me.vtxShape = shapeWithPts(orig, keepOnGrid(movePoints(orig.pts!, liveSels(me, orig), dx, dy), st.gridCells, st.gridCellsY));
    return;
  }
  if (me.vtxDrag >= VTX_SIDE && me.vtxDrag < VTX_EXTRUDE) {
    if (!me.vtxMoved) { me.vtxShape = orig; return; }
    const i = me.vtxDrag - VTX_SIDE, n = nPts(orig.pts!);
    if (me.modShift) { [dx, dy] = along(dx, dy, me.vtxNx, me.vtxNy); dx = snapQ(dx); dy = snapQ(dy); }
    me.vtxShape = shapeWithPts(orig, keepOnGrid(movePoints(orig.pts!, [i, (i + 1) % n], dx, dy), st.gridCells, st.gridCellsY));
    return;
  }
  if (me.vtxDrag >= VTX_EXTRUDE && me.vtxDrag < VTX_MARQUEE) {
    [dx, dy] = along(fx - me.vtxStartX, fy - me.vtxStartY, me.vtxNx, me.vtxNy);
    if (Math.abs(me.vtxNx) < 1e-9 || Math.abs(me.vtxNy) < 1e-9) { dx = snapQ(dx); dy = snapQ(dy); }
    const i = me.vtxDrag - VTX_EXTRUDE;
    me.vtxShape = shapeWithPts(orig, keepOnGrid(movePoints(orig.pts!, [i + 1, i + 2], dx, dy), st.gridCells, st.gridCellsY));
    return;
  }
  const px = Math.max(0, Math.min(st.gridCells, snapQ(fx))), py = Math.max(0, Math.min(st.gridCellsY, snapQ(fy)));
  const k = me.vtxDrag - VTX_BOX;
  const from = shapeBox(orig, { x0: 0, y0: 0, x1: 0, y1: 0 });
  let x0 = from.x0, y0 = from.y0, x1 = from.x1, y1 = from.y1;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const left = k === 0 || k === 6 || k === 7, right = k === 2 || k === 3 || k === 4, top = k <= 2, bottom = k >= 4 && k <= 6;
  if (left) x0 = Math.min(px, x1 - AREA_SHAPE_MIN); if (right) x1 = Math.max(px, x0 + AREA_SHAPE_MIN);
  if (top) y0 = Math.min(py, y1 - AREA_SHAPE_MIN); if (bottom) y1 = Math.max(py, y0 + AREA_SHAPE_MIN);
  if (me.modAlt) {
    if (left) x1 = mx + (mx - x0); if (right) x0 = mx - (x1 - mx);
    if (top) y1 = my + (my - y0); if (bottom) y0 = my - (y1 - my);
  }
  if (me.modShift) {
    const fw = from.x1 - from.x0, fh = from.y1 - from.y0;
    const kx = (x1 - x0) / fw, ky = (y1 - y0) / fh;
    const kk = (left || right) && (top || bottom) ? Math.max(kx, ky) : (left || right) ? kx : ky;
    const w = fw * kk, h = fh * kk;
    if (me.modAlt) { x0 = mx - w / 2; x1 = mx + w / 2; y0 = my - h / 2; y1 = my + h / 2; }
    else {
      if (left) x0 = x1 - w; else if (right) x1 = x0 + w; else { x0 = mx - w / 2; x1 = mx + w / 2; }
      if (top) y0 = y1 - h; else if (bottom) y1 = y0 + h; else { y0 = my - h / 2; y1 = my + h / 2; }
    }
  }
  me.vtxShape = shapeToBox(orig, from, x0, y0, x1, y1);
}
function shapeWithPts(orig: AreaShape, pts: number[]): AreaShape {
  const s: AreaShape = { k: 'poly', pts };
  if (orig.rot !== undefined) s.rot = orig.rot;
  return s;
}
function keepOnGrid(pts: number[], gc: number, gcY: number): number[] {
  for (let i = 0; i + 1 < pts.length; i += 2) { pts[i] = Math.max(0, Math.min(gc, pts[i])); pts[i + 1] = Math.max(0, Math.min(gcY, pts[i + 1])); }
  return pts;
}
function commitShapeEdit(logic: GameLogic): void {
  const me = logic.mapEditor;
  const code = me.vtxDrag, shape = me.vtxShape, orig = me.vtxOrig, moved = me.vtxMoved;
  me.vtxDrag = -1; me.vtxShape = null; me.vtxOrig = null;
  const ps = pickedShape(logic, null);
  if (ps === null || shape === null || orig === null) return;
  const st = ps.ref.state, id = ps.z.id;
  if (code === VTX_MARQUEE) {
    if (!moved) { if (!me.modShift) { me.vtxSels = []; me.vtxSel = -1; } return; }
    const got = pointsInBox(ps.sh.pts!, me.vtxStartX, me.vtxStartY, me.vtxCurX, me.vtxCurY);
    me.vtxSels = me.modShift ? [...new Set([...liveSels(me, ps.sh), ...got])] : got;
    me.vtxSel = me.vtxSels.length ? me.vtxSels[me.vtxSels.length - 1] : -1;
    return;
  }
  let next: AreaShape | null = null;
  if (code >= VTX_SIDE && code < VTX_EXTRUDE && !moved) {
    const i = code - VTX_SIDE;
    if (nPts(ps.sh.pts!) >= AREA_SHAPE_MAX_POINTS) return;
    next = shapeWithPts(ps.sh, insertPoint(ps.sh.pts!, i, me.vtxPendX, me.vtxPendY));
    me.vtxSels = [i + 1]; me.vtxSel = i + 1;
  } else if (code >= VTX_EXTRUDE && code < VTX_MARQUEE && !moved) {
    me.vtxSels = []; me.vtxSel = -1;
    return;
  } else {
    if (shape === ps.sh || (code < VTX_BOX && !moved)) return;
    next = shape;
    if (next.k === 'poly') {
      const merged = mergeTwins(next.pts!);
      if (merged.length !== next.pts!.length) { next = shapeWithPts(next, merged); me.vtxSels = []; me.vtxSel = -1; }
      if (nPts(next.pts!) < 3) return;
    }
  }
  logic.applyMapEdit(ps.ref.areaId, cfg => opShapeZone(cfg, id, next, st.gridCells, st.gridCellsY));
}
export function removePickedPoints(logic: GameLogic, which?: readonly number[]): boolean {
  const me = logic.mapEditor;
  const ps = pickedShape(logic, null);
  if (ps === null || ps.sh.k !== 'poly') return false;
  const pts = removePoints(ps.sh.pts!, which ?? liveSels(me, ps.sh));
  if (pts === null) return false;
  const s2 = shapeWithPts(ps.sh, pts);
  const st = ps.ref.state, id = ps.z.id;
  logic.endMapEditStroke();
  logic.applyMapEdit(ps.ref.areaId, cfg => opShapeZone(cfg, id, s2, st.gridCells, st.gridCellsY));
  me.vtxSels = []; me.vtxSel = -1; me.vtxHover = -1;
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return true;
}
export function nudgePickedPoints(logic: GameLogic, dx: number, dy: number): boolean {
  const me = logic.mapEditor;
  if (!me.vtxMode || me.vtxDrag !== -1) return false;
  const ps = pickedShape(logic, null);
  if (ps === null || ps.sh.k !== 'poly') return false;
  const sels = liveSels(me, ps.sh);
  if (sels.length === 0) return false;
  const st = ps.ref.state, id = ps.z.id;
  const s2 = shapeWithPts(ps.sh, keepOnGrid(movePoints(ps.sh.pts!, sels, dx, dy), st.gridCells, st.gridCellsY));
  logic.endMapEditStroke();
  logic.applyMapEdit(ps.ref.areaId, cfg => opShapeZone(cfg, id, s2, st.gridCells, st.gridCellsY));
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return true;
}
export function pickAllPoints(logic: GameLogic): boolean {
  const me = logic.mapEditor;
  const ps = pickedShape(logic, null);
  if (!me.vtxMode || ps === null || ps.sh.k !== 'poly') return false;
  me.vtxSels = Array.from({ length: nPts(ps.sh.pts!) }, (_, i) => i);
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return true;
}

function shapeVisuals(logic: GameLogic, worldX: number, worldY: number): boolean {
  const me = logic.mapEditor;
  if (me.freeActive) {
    const ref = areaRefById(logic, me.freeAreaId);
    if (ref) { me.freeX = snapQ((worldX - ref.offX + ref.state.mapHalf) / ref.state.cellSize); me.freeY = snapQ((worldY - ref.offY + ref.state.mapHalfY) / ref.state.cellSize); }
    me.hasGhost = false; me.hasHover = false;
    return true;
  }
  if (me.vtxDrag !== -1) {
    const ps = pickedShape(logic, null);
    if (ps === null || me.vtxOrig === null) { me.vtxDrag = -1; me.vtxShape = null; me.vtxOrig = null; return false; }
    const st = ps.ref.state;
    dragShapeHandle(logic, ps, (worldX - ps.ref.offX + st.mapHalf) / st.cellSize, (worldY - ps.ref.offY + st.mapHalfY) / st.cellSize);
    me.hasGhost = false; me.hasHover = false;
    return true;
  }
  me.vtxHover = -1; me.vtxEdge = -1;
  const ps = pickedShape(logic, null);
  if (ps !== null && (me.tool === 'none' || me.tool === 'select')) {
    const st = ps.ref.state;
    const fx = (worldX - ps.ref.offX + st.mapHalf) / st.cellSize, fy = (worldY - ps.ref.offY + st.mapHalfY) / st.cellSize;
    me.vtxHover = handleUnder(logic, ps, ps.sh, fx, fy);
    if (me.vtxHover < 0) me.vtxEdge = sideUnder(logic, ps, ps.sh, fx, fy);
  }
  return false;
}

export function setPickedAreaShape(logic: GameLogic, kind: AreaToolShape, sides?: number): boolean {
  const me = logic.mapEditor;
  if (!me.hasSelection || me.selection.kind !== 'zone') return false;
  const ref = areaRefById(logic, me.selection.areaId);
  if (!ref) return false;
  const z = findPlacedZone(ref.cfg, me.selection.id);
  if (!z || (BASE_AREAS.ON === 0 && (!z.kind || z.kind === 'base'))) return false;
  const st = ref.state;
  const sh = zoneShapeOf(z);
  const b = sh !== null ? shapeBox(sh, { x0: 0, y0: 0, x1: 0, y1: 0 }) : { x0: z.gx, y0: z.gy, x1: z.gx + z.cw, y1: z.gy + z.ch };
  let next: AreaShape | null;
  if (kind === 'rect') next = null;
  else if (kind === 'ellipse') next = { k: 'ellipse', cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, rx: (b.x1 - b.x0) / 2, ry: (b.y1 - b.y0) / 2 };
  else if (kind === 'poly') { const n = Math.max(AREA_SIDES_MIN, Math.min(AREA_SIDES_MAX, Math.round(sides ?? (sh?.sides ?? me.zoneSides)))); next = { k: 'poly', pts: regularPolyPts(n, b.x0, b.y0, b.x1, b.y1), sides: n }; }
  else next = sh === null ? { k: 'poly', pts: [b.x0, b.y0, b.x1, b.y0, b.x1, b.y1, b.x0, b.y1] } : sh.k === 'ellipse' ? ellipseAsPoints(sh) : { k: 'poly', pts: sh.pts!.slice(), ...(sh.rot !== undefined ? { rot: sh.rot } : {}) };
  const id = z.id;
  logic.endMapEditStroke();
  logic.applyMapEdit(ref.areaId, cfg => opShapeZone(cfg, id, next, st.gridCells, st.gridCellsY));
  me.vtxMode = kind === 'free'; me.vtxSel = -1; me.vtxSels = [];
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return true;
}
export function setPickedAreaTurn(logic: GameLogic, deg: number): boolean {
  const ps = pickedShape(logic, null);
  if (ps === null) return false;
  const now = ps.sh.rot ?? 0, want = (deg * Math.PI) / 180;
  if (Math.abs(want - now) < 1e-9) return true;
  const st = ps.ref.state, id = ps.z.id;
  const next = shapeTurned(ps.sh, want - now);
  logic.endMapEditStroke();
  logic.applyMapEdit(ps.ref.areaId, cfg => opShapeZone(cfg, id, next, st.gridCells, st.gridCellsY));
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return true;
}
export function togglePickedAreaPoints(logic: GameLogic): void {
  const me = logic.mapEditor;
  const ps = pickedShape(logic, null);
  if (ps === null) return;
  if (ps.sh.k === 'ellipse') { setPickedAreaShape(logic, 'free'); return; }
  me.vtxMode = !me.vtxMode; me.vtxSel = -1; me.vtxSels = [];
  if (logic.onStateChange) logic.onStateChange(logic.state);
}

export function setPickedAreaFill(logic: GameLogic, fill: AreaFill | null): boolean {
  const me = logic.mapEditor;
  if (!me.hasSelection || me.selection.kind !== 'zone') return false;
  const ref = areaRefById(logic, me.selection.areaId);
  if (!ref) return false;
  const z = findPlacedZone(ref.cfg, me.selection.id);
  if (!z || (BASE_AREAS.ON === 0 && (!z.kind || z.kind === 'base'))) return false;
  const id = z.id;
  logic.endMapEditStroke();
  logic.applyMapEdit(ref.areaId, cfg => opPatchZone(cfg, id, { fill: fill ?? undefined }));
  if (logic.onStateChange) logic.onStateChange(logic.state);
  return true;
}
