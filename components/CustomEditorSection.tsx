import { SMALL_FIX } from '../game/smallFixSwitch';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Undo2, Redo2, Eraser, Dices } from './ui/icons';
import type { GameLogic } from '../game/GameLogic';
import type { MapConfig, AreaConfig } from '../types';
import { SliderRow, ToggleItem, SegButton } from './shared/mapDesignerControls';
import { PortalPanel } from './shared/PortalPanel';
import { Reveal, SwapInPlace, SwapBox, SwapText, bringIntoView, FOLD_MS, FOLD_FADE_MS, type FoldHandle } from './kit/Collapse';
import { RowLabel } from './kit/kit';
import {
  editWalls, editRocks, editZones, editPortals,
  findPlacedWall, findPlacedRock, findPlacedPortal,
  clearMapEditSelection,
  opUpdateRock, opUpdatePortal, opClearAll, opRandomizeAllRockRotations, opPaintWall, opPaintRock,
  rockDefaultSize,
  MAP_EDIT_MAX_WALLS, MAP_EDIT_MAX_ROCKS, MAP_EDIT_MAX_ZONES, MAP_EDIT_MAX_PORTALS,
  MAP_EDIT_WALL_MIN_CELLS, MAP_EDIT_WALL_MAX_CELLS,
  rockSizeLimits,
  type RockKind,
} from '../game/MapEditor';
import {
  deleteMapEditorSelection, selectionAreaState,
  resizeSelectedWall, resizeSelectedRock,
  toolRockKind, rockSizeFloor,
} from '../game/MapEditorInput';
import { GRID_SPACING } from '../game/constants';
import { PUMPKIN_ROCKS_ONLY_TIP, toastPumpkinRockMin } from './shared/labels';
import { useToast } from './ui/Toast';
import { PaintRows } from './shared/PaintRows';
import { MISSING_MODES } from '../game/missingModesSwitch';
import type { MapPaint } from '../types';

interface Props {
  logic: GameLogic;
  config: MapConfig;
  updateConfig: (partial: Partial<MapConfig>) => void;
  activeArea: AreaConfig | null;
  isMultiArea: boolean;
  areas: AreaConfig[];
  areaId: string;
  onUpdate: () => void;
  fold?: React.MutableRefObject<FoldHandle | null>;
}

const ROCK_KINDS: RockKind[] = ['rock', 'stone', 'gravel'];
const paintStart = (mapPaint: MapPaint | undefined): MapPaint => (mapPaint && (typeof mapPaint.slot === 'number' || typeof mapPaint.hex === 'string') ? { ...mapPaint } : { slot: 7 });

export const CustomEditorSection: React.FC<Props> = ({
  logic, config, updateConfig, activeArea, isMultiArea, areas, areaId, onUpdate, fold,
}) => {
  const me = logic.mapEditor;
  const [confirmClear, setConfirmClear] = useState(false);
  const { showToast } = useToast();
  const pumpkins = logic.pumpkinRocks;
  const cellSize = config.mapScale * GRID_SPACING;
  const rockLimits = rockSizeLimits(cellSize);

  const walls = editWalls(config);
  const rocks = editRocks(config);
  const zones = editZones(config);
  const portals = editPortals(config);


  const editParam = useCallback(<K extends keyof typeof me>(key: K, value: (typeof me)[K]) => {
    me[key] = value;
    onUpdate();
  }, [me, onUpdate]);

  const sel = me.hasSelection && me.selection.kind !== 'zone' && me.selection.kind !== 'entity' ? me.selection : null;
  const selWall   = sel && sel.kind === 'wall'   && sel.id >= 0 ? findPlacedWall(config, sel.id) : null;
  const selRock   = sel && sel.kind === 'rock'   && sel.id >= 0 ? findPlacedRock(config, sel.id) : null;
  const selPortal = sel && sel.kind === 'portal' ? findPlacedPortal(config, sel.id) : null;
  const selIsGenerated = !!sel && sel.id < 0;
  const selPortalNumber = selPortal ? portals.findIndex(p => p.id === selPortal.id) + 1 : 0;

  const selBox = useRef<HTMLDivElement>(null);
  const selKey = sel ? `${sel.areaId}|${sel.kind}|${sel.id}|${sel.genKey}` : '';
  useEffect(() => {
    if (!selKey) return;
    let gone = false;
    const h = fold?.current;
    const opening = !!h && !h.isOpen();
    if (opening) h!.open();
    const wait = (opening ? FOLD_MS + FOLD_FADE_MS : 0) + FOLD_FADE_MS + FOLD_MS + 60;
    const t = window.setTimeout(() => { if (!gone && selBox.current?.isConnected) bringIntoView(selBox.current); }, wait);
    return () => { gone = true; window.clearTimeout(t); };
  }, [selKey]);
  const selTitle = !sel ? '' : sel.kind === 'wall' ? 'Editing Wall'
    : sel.kind === 'rock' ? 'Editing Rock'
    : `Editing Portal ${selPortalNumber}`;

  const applySel = useCallback((mutate: (cfg: MapConfig) => void) => {
    logic.applyMapEdit(areaId, mutate);
    onUpdate();
  }, [logic, areaId, onUpdate]);

  const deleteSel = useCallback(() => {
    deleteMapEditorSelection(logic);
    onUpdate();
  }, [logic, onUpdate]);

  const clearAll = useCallback(() => {
    logic.applyMapEdit(areaId, cfg => opClearAll(cfg));
    clearMapEditSelection(me);
    setConfirmClear(false);
    onUpdate();
  }, [logic, areaId, me, onUpdate]);

  const randomizeAllRockRotations = useCallback(() => {
    logic.applyMapEdit(areaId, cfg => opRandomizeAllRockRotations(cfg));
    onUpdate();
  }, [logic, areaId, onUpdate]);

  const gc = selectionAreaState(logic, areaId)?.gridCells ?? config.gridCells;
  const gcY = selectionAreaState(logic, areaId)?.gridCellsY ?? (config.gridCellsY ?? config.gridCells);

  return (
    <>
      {MISSING_MODES.ON === 0 && <ToggleItem
        label="Walls As Blocks"
        checked={config.wallBlocks === true}
        onChange={v => updateConfig({ wallBlocks: v })}
        desc="On: every cell of a wall is drawn as a block of its own, with its own edge. Off: a long wall is one piece. Only the look changes."
      />}

      {MISSING_MODES.ON !== 0 && (
      <Reveal when={me.tool === 'wall'}>
        <div className="space-y-2">
          <ToggleItem label="Own Look" checked={me.wallPaint !== null} onChange={v => { me.wallPaint = v ? paintStart(config.wallPaint) : null; onUpdate(); }}
            desc="On: the walls you place next get this color and opacity. Off: they follow the map's Wall And Rock Look." />
          <Reveal when={me.wallPaint !== null}>{() => <PaintRows what="Wall" whose="the walls you place next" paint={me.wallPaint} onChange={p => { me.wallPaint = p; onUpdate(); }} />}</Reveal>
        </div>
      </Reveal>
      )}
      <Reveal when={me.tool === 'rock'}>
        <div className="space-y-3">
          <div className="space-y-1">
            <RowLabel label="Rock Type" help="Which kind of rock this is: Rock, Stone or Gravel." />
            <div className="flex gap-1">
              {ROCK_KINDS.map(k => (
                <SegButton
                  key={k}
                  active={toolRockKind(logic) === k}
                  unusable={pumpkins && k !== 'rock' ? PUMPKIN_ROCKS_ONLY_TIP : undefined}
                  onClick={() => { me.rockKind = k; me.rockSize = rockDefaultSize(k, cellSize); onUpdate(); }}
                >
                  <span className="capitalize">{k}</span>
                </SegButton>
              ))}
            </div>
          </div>
          {MISSING_MODES.ON !== 0 && <ToggleItem label="Own Look" checked={me.rockPaint !== null} onChange={v => { me.rockPaint = v ? paintStart(config.rockPaint) : null; onUpdate(); }}
            desc="On: the rocks you place next get this color and opacity. Off: they follow the map's Wall And Rock Look." />}
          {MISSING_MODES.ON !== 0 && <Reveal when={me.rockPaint !== null}>{() => <PaintRows what="Rock" whose="the rocks you place next" paint={me.rockPaint} onChange={p => { me.rockPaint = p; onUpdate(); }} />}</Reveal>}
          <SliderRow
            label="Rotation"
            value={Math.round((me.rockRotation * 180) / Math.PI)}
            onChange={v => editParam('rockRotation', (v * Math.PI) / 180)}
            min={0} max={359} step={1}
            suffix="deg"
            tooltip="Turns the rock on the spot. Looks only, it never changes how the rock blocks anything."
          />
          <button
            onClick={randomizeAllRockRotations}
            disabled={rocks.length === 0}
            title="Randomizes the rotation of every rock on the map. One Undo puts them all back."
            className="k-btn k-btn-secondary k-btn-sm w-full"
          >
            <Dices size={13} className="shrink-0" /> Randomize All
          </button>
        </div>
      </Reveal>

      <Reveal when={me.tool === 'portal'}>
        <ToggleItem
          label="Static Position"
          checked={me.portalStatic}
          onChange={v => editParam('portalStatic', v)}
          desc="On: always reopens where you placed it. Off: reopens somewhere random. Select a portal afterwards for its type, timing and physics."
        />
      </Reveal>

      <Reveal when={sel}>{() => (
        <SwapInPlace swapKey={selKey} hold={false}>
        <div ref={selBox} className="pt-2 border-t border-[var(--alpha-divider)] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <SwapInPlace swapKey={selTitle} className="min-w-0">
              <span className="eyebrow truncate block">{selTitle}</span>
            </SwapInPlace>
            <button
              onClick={deleteSel}
              className="k-ico p-1 -mr-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              title="Delete this entity"
              aria-label="Delete selected map entity"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <Reveal when={selIsGenerated}>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              This came from the map generator. Move it or delete it and it becomes yours to edit.
            </p>
          </Reveal>

          <Reveal when={selWall}>{() => (
            <SliderRow
              label="Size"
              value={selWall.cw}
              onChange={v => { resizeSelectedWall(logic, v); onUpdate(); }}
              min={MAP_EDIT_WALL_MIN_CELLS} max={MAP_EDIT_WALL_MAX_CELLS} step={1}
              display={() => `${selWall.cw}x${selWall.ch}`}
              tooltip="Resizing grows the block from its top left corner. A size that would overlap something is refused."
            />
          )}</Reveal>
          {MISSING_MODES.ON !== 0 && <Reveal when={selWall}>{() => (
            <div className="space-y-2">
              <ToggleItem label="Own Look" checked={!!selWall.paint} onChange={v => applySel(cfg => opPaintWall(cfg, selWall.id, v ? paintStart(config.wallPaint) : undefined))}
                desc="On: this wall has its own color and opacity. Off: it follows the map's Wall And Rock Look." />
              <Reveal when={!!selWall.paint}>{() => <PaintRows what="Wall" whose="this wall" paint={selWall.paint} onChange={p => applySel(cfg => opPaintWall(cfg, selWall.id, p))} />}</Reveal>
            </div>
          )}</Reveal>}

          <Reveal when={selRock}>{() => (
            <div className="space-y-2">
              <div className="space-y-1">
                <RowLabel label="Rock Type" help="Which kind of rock this is: Rock, Stone or Gravel." />
                <div className="flex gap-1">
                  {ROCK_KINDS.map(k => (
                    <SegButton
                      key={k}
                      active={selRock.kind === k}
                      unusable={pumpkins && k !== 'rock' ? PUMPKIN_ROCKS_ONLY_TIP : undefined}
                      onClick={() => applySel(cfg => opUpdateRock(cfg, selRock.id, { kind: k }))}
                    >
                      <span className="capitalize">{k}</span>
                    </SegButton>
                  ))}
                </div>
              </div>
              <SliderRow
                label="Size"
                value={Math.round(selRock.size)}
                onChange={v => {
                  if (v < rockSizeFloor(logic)) toastPumpkinRockMin(showToast);
                  resizeSelectedRock(logic, v); onUpdate();
                }}
                min={Math.max(1, Math.round(rockLimits.min))}
                max={Math.max(Math.round(rockLimits.max), Math.round(selRock.size), rockSizeFloor(logic))}
                step={1}
                tooltip="Radius in world units. A size that would reach a wall, another rock or a portal is refused."
              />
              <SliderRow
                label="Rotation"
                value={Math.round((selRock.rotation * 180) / Math.PI)}
                onChange={v => applySel(cfg => opUpdateRock(cfg, selRock.id, { rotation: (v * Math.PI) / 180 }))}
                min={0} max={359} step={1}
                suffix="deg"
                tooltip="How far this rock is turned, in degrees."
              />
              {MISSING_MODES.ON !== 0 && <ToggleItem label="Own Look" checked={!!selRock.paint} onChange={v => applySel(cfg => opPaintRock(cfg, selRock.id, v ? paintStart(config.rockPaint) : undefined))}
                desc="On: this rock has its own color and opacity. Off: it follows the map's Wall And Rock Look." />}
              {MISSING_MODES.ON !== 0 && <Reveal when={!!selRock.paint}>{() => <PaintRows what="Rock" whose="this rock" paint={selRock.paint} onChange={p => applySel(cfg => opPaintRock(cfg, selRock.id, p))} />}</Reveal>}
            </div>
          )}</Reveal>

          <Reveal when={selPortal}>{() => (
            <PortalPanel logic={logic} config={config} updateConfig={updateConfig} activeArea={activeArea} isMultiArea={isMultiArea} areas={areas} areaId={areaId} portal={selPortal!} apply={applySel} />
          )}</Reveal>
        </div>
        </SwapInPlace>
      )}</Reveal>

      <div className="pt-2 border-t border-[var(--alpha-divider)] space-y-2">
        <div className="flex gap-2 min-w-0">
          <button
            onClick={() => { logic.undoMapEdit(); onUpdate(); }}
            disabled={!logic.canUndoMapEdit()}
            className="k-btn k-btn-secondary k-btn-sm flex-1 min-w-0"
          >
            <Undo2 size={13} className="shrink-0" /> Undo
          </button>
          <button
            onClick={() => { logic.redoMapEdit(); onUpdate(); }}
            disabled={!logic.canRedoMapEdit()}
            className="k-btn k-btn-secondary k-btn-sm flex-1 min-w-0"
          >
            <Redo2 size={13} className="shrink-0" /> Redo
          </button>
        </div>
        <button
          onClick={() => (confirmClear ? clearAll() : setConfirmClear(true))}
          onBlur={() => setConfirmClear(false)}
          className={`k-btn k-btn-sm w-full ${confirmClear ? 'k-btn-primary' : 'k-btn-secondary'}`}
        >
          <Eraser size={13} className="shrink-0" /> <SwapText>{confirmClear ? 'Click again to confirm' : 'Clear All'}</SwapText>
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="k-badge">Walls <span className="tabular-nums text-[var(--text-secondary)]">{walls.length} / {MAP_EDIT_MAX_WALLS}</span></span>
        <span className="k-badge">Rocks <span className="tabular-nums text-[var(--text-secondary)]">{rocks.length} / {MAP_EDIT_MAX_ROCKS}</span></span>
        <span className="k-badge">Areas <span className="tabular-nums text-[var(--text-secondary)]">{zones.length} / {MAP_EDIT_MAX_ZONES}</span></span>
        <span className="k-badge">Portals <span className="tabular-nums text-[var(--text-secondary)]">{portals.length} / {MAP_EDIT_MAX_PORTALS}</span></span>
      </div>
    </>
  );
};
