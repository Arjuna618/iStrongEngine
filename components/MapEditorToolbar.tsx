import React, { useEffect, useRef, useState } from 'react';
import { BrickWall, Stone, MevAreas, BlackHole, Eraser, MevEntities, Square, AreaEllipse, AreaPolygon, AreaFree, type LucideIcon } from './ui/icons';
import { THING_KINDS, thingWordOf } from './mapEvents/fields';
import { ContentLibrary } from './library/ContentLibrary';
import type { LibMode } from './library/libraryModes';
import { pickWordOf, shownNameOfWord } from '../game/tankByName';
import { MAP_EVENTS } from '../game/mapEventsSwitch';
import type { GameLogic } from '../game/GameLogic';
import type { MapEditorTool, AreaToolShape } from '../game/MapEditor';
import { AREA_SIDES_MIN, AREA_SIDES_MAX } from '../game/areaShape';
import { cancelMapEditInteraction, clearMapEditSelection,
  MAP_EDIT_WALL_MIN_CELLS, MAP_EDIT_WALL_MAX_CELLS,
  rockSizeLimits } from '../game/MapEditor';
import { sliderFillStyle } from './shared/uiHelpers';
import { GRID_SPACING } from '../game/constants';
import { rockSizeFloor, toolRockSize, setToolRockSize } from '../game/MapEditorInput';
import { toastPumpkinRockMin } from './shared/labels';
import { useToast } from './ui/Toast';
import { MotionRow, Fade } from './kit/Collapse';
import { useIsActiveTool } from './shell/toolStore';
import { PLACED_PORTALS } from '../game/placedPortalsSwitch';

interface Props {
  logic: GameLogic;
  leftInset: number;
  chromeScale?: number;
  rightInset: number;
}

const ICON_SIZE = 20;
const TERRAIN: { id: MapEditorTool; label: string; Icon: LucideIcon }[] = [
  { id: 'wall',   label: 'Wall',    Icon: BrickWall },
  { id: 'rock',   label: 'Rock',    Icon: Stone },
  { id: 'portal', label: 'Portal',  Icon: BlackHole },
];
const OBJECTS: { id: MapEditorTool; label: string; Icon: LucideIcon }[] = [
  { id: 'zone',   label: 'Custom Area', Icon: MevAreas },
  { id: 'entity', label: 'Map Entity', Icon: MevEntities },
  { id: 'eraser', label: 'Eraser (right click deletes with any tool)', Icon: Eraser },
];

export const MapEditorToolbar: React.FC<Props> = ({ logic, leftInset, rightInset, chromeScale = 1 }) => {
  const [, force] = useState(0);
  const me = logic.mapEditor;
  const onMapTool = useIsActiveTool('map-designer');
  const [picking, setPicking] = useState(false);
  const toolWas = useRef(me.tool);
  useEffect(() => {
    if (me.tool === 'entity' && toolWas.current !== 'entity') setPicking(true);
    if (me.tool !== 'entity') setPicking(false);
    toolWas.current = me.tool;
  }, [me.tool]);

  const now = performance.now();
  const flashing = me.deleteFlashAt > now;
  useEffect(() => {
    if (!flashing) return;
    const t = setTimeout(() => force(n => n + 1), Math.max(20, me.deleteFlashAt - performance.now() + 20));
    return () => clearTimeout(t);
  }, [flashing, me.deleteFlashAt]);

  const custom = logic.isCustomMapActive();
  const shown = onMapTool && logic.isMapDesignerActive && !logic.state.isTestMode && (custom || MAP_EVENTS.ON !== 0);

  const setTool = (tool: MapEditorTool) => {
    const next: MapEditorTool = me.tool === tool ? 'none' : tool;
    if (next !== 'none') clearMapEditSelection(me);
    me.tool = next;
    me.zoneAddTo = -1;
    logic.endMapEditStroke();
    cancelMapEditInteraction(me);
    if (logic.onStateChange) logic.onStateChange(logic.state);
  };

  const activeTool: MapEditorTool = flashing ? 'eraser' : me.tool;

  const sizeTool = me.tool === 'wall' ? 'wall' : me.tool === 'rock' ? 'rock' : null;

  return (
    <div
      className="absolute top-4 z-30 flex justify-center pointer-events-none"
      style={{ left: `${leftInset}px`, right: `${rightInset}px` }}
    >
      <Fade when={shown} className="block">{() => (
      <MotionRow className="flex items-center gap-2" style={chromeScale !== 1 ? { zoom: chromeScale } : undefined}>
        <MotionRow.Item key="tools"><div className="pointer-events-auto flex items-center gap-0.5 rounded-xl p-1 bg-[var(--k-strip-bg)] border border-[var(--k-strip-edge)] shadow-[var(--shadow-pop)]">
          {(custom ? TERRAIN : TERRAIN.filter(t => PLACED_PORTALS.ON !== 0 && t.id === 'portal')).map(t => <ToolButton key={t.id} {...t} active={activeTool === t.id} onPick={setTool} />)}
          {custom || PLACED_PORTALS.ON !== 0 ? <span className="k-ev-tool-gap" aria-hidden="true" /> : null}
          {OBJECTS.filter(t => custom || MAP_EVENTS.ON !== 0 || t.id !== 'entity').map(t => <ToolButton key={t.id} {...t} active={activeTool === t.id} onPick={setTool} />)}
        </div></MotionRow.Item>

        {sizeTool && <MotionRow.Item key={'size-' + sizeTool}><SizePill logic={logic} tool={sizeTool} /></MotionRow.Item>}
        {me.tool === 'zone' && me.zoneAddTo < 0 && <MotionRow.Item key="area-shape"><AreaShapePill logic={logic} /></MotionRow.Item>} { }
        {me.tool === 'zone' && me.zoneAddTo < 0 && me.zoneShape === 'poly' && <MotionRow.Item key="area-sides"><SidesPill logic={logic} /></MotionRow.Item>} { }
      </MotionRow>
      )}</Fade>
      {picking && me.tool === 'entity' ? <EntityPicker logic={logic} onClose={() => setPicking(false)} /> : null}
    </div>
  );
};

const ToolButton: React.FC<{ id: MapEditorTool; label: string; Icon: LucideIcon; active: boolean; onPick: (t: MapEditorTool) => void }> = ({ id, label, Icon, active, onPick }) => (
  <button
    type="button"
    onClick={() => onPick(id)}
    title={label}
    data-tip-side="bottom"
    aria-label={label}
    aria-pressed={active}
    className={`k-ico grid h-10 w-10 place-items-center rounded-lg transition-colors ${
      active
        ? 'bg-[var(--k-strip-hover)] text-[var(--k-rail-icon-on)]'
        : 'text-[var(--k-rail-icon)] hover:bg-[var(--k-strip-hover)] hover:text-[var(--k-rail-icon-on)]'
    }`}
  >
    <Icon size={ICON_SIZE} />
  </button>
);

const EntityPicker: React.FC<{ logic: GameLogic; onClose: () => void }> = ({ logic, onClose }) => {
  const me = logic.mapEditor;
  const lib = logic.state.tankLibrary;
  const tell = () => { if (logic.onStateChange) logic.onStateChange(logic.state); };
  const choose = (w: string) => {
    const mac = logic.state.multiAreaConfig;
    const cfg = mac.enableMultiArea ? mac.areas.find(a => a.id === mac.activeAreaId)?.mapConfig : logic.state.mapConfig;
    const same = (cfg?.events?.types ?? []).find(t => t.forms.length === 1 && t.forms[0].tank === w);
    if (same) { me.entityType = same.id; me.entityTank = ''; } else { me.entityType = -1; me.entityTank = w; }
    tell();
  };
  const mode: LibMode = {
    place: 'mapEntity', title: 'Map Entity', subtitle: 'Anything of the Content Library can stand on a map.', kinds: THING_KINDS,
    actionsOf: e => { const w = thingWordOf(e, lib); return w ? [{ id: 'pick', label: 'Choose', run: () => { choose(w); return true; } }] : []; },
  };
  return <ContentLibrary logic={logic} mode={mode} onClose={onClose} />;
};

const SizePill: React.FC<{ logic: GameLogic; tool: 'wall' | 'rock' }> = ({ logic, tool }) => {
  const me = logic.mapEditor;
  const isWall = tool === 'wall';
  const _mac = logic.state.multiAreaConfig;
  const _activeCfg = (_mac.enableMultiArea && _mac.areas.length > 0)
    ? (_mac.areas.find(a => a.id === _mac.activeAreaId) || _mac.areas[0]).mapConfig
    : logic.state.mapConfig;
  const _rl = rockSizeLimits(_activeCfg.mapScale * GRID_SPACING);
  const floor = rockSizeFloor(logic);
  const min = isWall ? MAP_EDIT_WALL_MIN_CELLS : Math.max(1, Math.round(_rl.min));
  const max = isWall ? MAP_EDIT_WALL_MAX_CELLS : Math.max(Math.round(_rl.max), floor);
  const value = isWall ? me.wallCells : Math.round(toolRockSize(logic));
  const label = isWall ? `${value}x${value}` : String(value);
  const { showToast } = useToast();

  const onChange = (v: number) => {
    if (isWall) me.wallCells = Math.round(v);
    else if (setToolRockSize(logic, v)) toastPumpkinRockMin(showToast);
    if (logic.onStateChange) logic.onStateChange(logic.state);
  };

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-xl py-1.5 pl-3 pr-3 bg-[var(--k-strip-bg)] border border-[var(--k-strip-edge)] shadow-[var(--shadow-pop)]">
      <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">Size</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        title={isWall ? 'Wall block size in cells' : 'Rock radius in world units'}
        aria-label={isWall ? 'Wall size' : 'Rock size'}
        className="w-24 h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
        style={sliderFillStyle(value, min, max)}
      />
      <span className="w-8 text-right text-[11px] font-mono text-[var(--text-tertiary)] shrink-0">{label}</span>
    </div>
  );
};

const AREA_SHAPES: { id: AreaToolShape; label: string; Icon: LucideIcon }[] = [
  { id: 'rect', label: 'Rectangle, on the cells', Icon: Square },
  { id: 'ellipse', label: 'Ellipse (Shift: a circle)', Icon: AreaEllipse },
  { id: 'poly', label: 'Polygon (Shift: a regular one)', Icon: AreaPolygon },
  { id: 'free', label: 'Free Shape, a click a point', Icon: AreaFree },
];
const AreaShapePill: React.FC<{ logic: GameLogic }> = ({ logic }) => {
  const me = logic.mapEditor;
  const pick = (s: AreaToolShape) => {
    if (me.zoneShape === s) return;
    me.zoneShape = s;
    logic.endMapEditStroke();
    cancelMapEditInteraction(me);
    if (logic.onStateChange) logic.onStateChange(logic.state);
  };
  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl p-1 bg-[var(--k-strip-bg)] border border-[var(--k-strip-edge)] shadow-[var(--shadow-pop)]">
      {AREA_SHAPES.map(t => (
        <button key={t.id} type="button" onClick={() => pick(t.id)} title={t.label} data-tip-side="bottom" aria-label={t.label} aria-pressed={me.zoneShape === t.id}
          className={`k-ico grid h-8 w-8 place-items-center rounded-lg transition-colors ${me.zoneShape === t.id
            ? 'bg-[var(--k-strip-hover)] text-[var(--k-rail-icon-on)]'
            : 'text-[var(--k-rail-icon)] hover:bg-[var(--k-strip-hover)] hover:text-[var(--k-rail-icon-on)]'}`}>
          <t.Icon size={18} />
        </button>
      ))}
    </div>
  );
};
const SidesPill: React.FC<{ logic: GameLogic }> = ({ logic }) => {
  const me = logic.mapEditor;
  const value = Math.max(AREA_SIDES_MIN, Math.min(AREA_SIDES_MAX, me.zoneSides));
  const onChange = (v: number) => { me.zoneSides = Math.round(v); if (logic.onStateChange) logic.onStateChange(logic.state); };
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-xl py-1.5 pl-3 pr-3 bg-[var(--k-strip-bg)] border border-[var(--k-strip-edge)] shadow-[var(--shadow-pop)]">
      <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">Sides</span>
      <input type="range" min={AREA_SIDES_MIN} max={AREA_SIDES_MAX} step={1} value={value} onChange={e => onChange(Number(e.target.value))}
        title="How many sides the polygon has" aria-label="Polygon sides"
        className="w-20 h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent)]" style={sliderFillStyle(value, AREA_SIDES_MIN, AREA_SIDES_MAX)} />
      <span className="w-5 text-right text-[11px] font-mono text-[var(--text-tertiary)] shrink-0">{value}</span>
    </div>
  );
};
