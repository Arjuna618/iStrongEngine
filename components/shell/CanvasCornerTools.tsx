import React from 'react';
import { Collapse, Reveal, SwapInPlace, Fade, MotionRow } from '../kit/Collapse';
import type { GameLogic } from '../../game/GameLogic';
import { cancelMapEditInteraction, clearMapEditSelection } from '../../game/MapEditor';
import { SNAP_COUNTS } from '../../types';
import { MousePointerClick, MousePointer, Focus, FlipHorizontal, Compass, Magnet, Minus, Plus, UndoStep } from '../ui/icons';
import { ButtonTooltip } from '../shared/HelpTooltip';
import { TurretActionBar } from '../shared/TurretActionBar';
import { usePlacementBar, placementBarIsSub } from './PlacementBar';
import { useActiveTool } from './toolStore';
import { useDesignHistory } from '../shared/HistoryPanel';
import { flushDesignHistory } from './historyRecorder';

interface Props {
  logic: GameLogic;
  rightInset: number;
  chromeScale: number;
}

const CornerButton: React.FC<{ tip: string; on?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({ tip, on, disabled, onClick, children }) => (
  <ButtonTooltip text={tip} fit>
    <button type="button" className={`k-icon-btn k-icon-btn-lg${on ? ' k-icon-btn-active' : ''}`} aria-label={tip}
      aria-pressed={on === undefined ? undefined : on} disabled={disabled} onClick={onClick}>{children}</button>
  </ButtonTooltip>
);

const Stepper: React.FC<{ label: string; value: number; canDown: boolean; canUp: boolean; onDown: () => void; onUp: () => void }> = ({ label, value, canDown, canUp, onDown, onUp }) => (
  <span className="k-canvas-step">
    <span className="k-canvas-step-label">{label}</span>
    <button type="button" className="k-icon-btn k-icon-btn-sm" aria-label={`Fewer: ${label}`} disabled={!canDown} onClick={onDown}><Minus size={12} /></button>
    <span className="k-canvas-step-value">{value}</span>
    <button type="button" className="k-icon-btn k-icon-btn-sm" aria-label={`More: ${label}`} disabled={!canUp} onClick={onUp}><Plus size={12} /></button>
  </span>
);

export const CanvasCornerTools: React.FC<Props> = ({ logic, rightInset, chromeScale }) => {
  const bar = usePlacementBar();
  useActiveTool();
  const { canUndo } = useDesignHistory(logic);
  const inMatch = logic.state.isTestMode;
  const showSelect = !inMatch && logic.shouldShowSelectButton();
  const showMap = !inMatch && logic.isMapDesignerActive;
  const showTank = !inMatch && logic.isTankToolActive && logic.state.canvasEntityKind === 'tank';
  const shown = showSelect || showMap || showTank;

  const s = logic.state;
  const selectOn = s.autoSubTurretEditMode ? s.autoSubTurretSelectMode : s.selectMode;
  const me = logic.mapEditor;
  const toggleMapSelect = () => {
    me.tool = me.tool === 'select' ? 'none' : 'select';
    logic.endMapEditStroke();
    cancelMapEditInteraction(me);
    if (me.tool === 'none') clearMapEditSelection(me);
    if (logic.onStateChange) logic.onStateChange(logic.state);
  };

  const place = showSelect ? bar : null;
  const current = () => placementBarIsSub() === !!logic.state.autoSubTurretEditMode;
  const mirrorMode = place?.mirrorMode ?? false;
  const autoPlacement = place?.autoPlacement ?? false;
  const snapPlacement = place?.snapPlacement ?? false;
  const bodySides = place?.bodySides ?? 0;
  const isComboMode = autoPlacement && snapPlacement && bodySides >= 3;
  const compassMax = bodySides >= 3 ? bodySides : 8;
  const count = Math.min(place?.autoPlacementCount ?? 1, compassMax);
  const snapIdx = Math.max(0, Math.min(SNAP_COUNTS.length - 1, place?.snapPlacementCount ?? 0));
  const showCount = !!place && autoPlacement;
  const showDirs = !!place && snapPlacement && !isComboMode && bodySides < 3;
  const showPoints = !!place && snapPlacement && !isComboMode && bodySides >= 3;
  const showHint = !!place && (!!place.selectMode || !!place.inheritMode);
  const showLayerHint = showTank && logic.layerPickMode;
  const undo = () => { flushDesignHistory(); logic.undoDesign(); };
  const endSelect = () => { if (selectOn) logic.toggleSelectModeForCurrentContext(); };
  const endPlacement = () => {
    if (!place || !current()) return;
    if (autoPlacement) place.onToggleCompass?.(false);
    if (snapPlacement) place.onToggleSnap?.(false);
    if (mirrorMode) place.onToggleMirror?.(false);
  };

  return (
    <div className="absolute z-30 pointer-events-none" style={{ right: rightInset + 14 * chromeScale, bottom: 14 * chromeScale }}>
      <Fade when={shown} className="block">{() => (
      <div className="k-canvas-corner" style={chromeScale !== 1 ? { zoom: chromeScale } : undefined}>
        <Collapse open={!!showHint} reveal="none">{showHint ? <div className="k-canvas-note pointer-events-auto"><SwapInPlace swapKey={place!.inheritMode ? 'inherit' : 'select'} hold={false}><TurretActionBar {...place!} part="instructions" /></SwapInPlace></div> : null}</Collapse>
        <Collapse open={showLayerHint} reveal="none">{showLayerHint ? <div className="k-canvas-note pointer-events-auto"><p className="k-hint k-hint-strong">Click a part of the tank to edit it.</p></div> : null}</Collapse>
        <Collapse open={!!(showCount || showDirs || showPoints)} reveal="none">{(showCount || showDirs || showPoints) ? (
          <div className="k-canvas-note pointer-events-auto">
            <Reveal when={showCount}>{() => (
              <Stepper label={isComboMode ? `Count (${bodySides} face midpoints)` : 'Count'} value={count} canDown={count > 1} canUp={count < compassMax}
                onDown={() => { if (current()) place!.onSetAutoPlacementCount?.(Math.max(1, count - 1)); }} onUp={() => { if (current()) place!.onSetAutoPlacementCount?.(Math.min(compassMax, count + 1)); }} />
            )}</Reveal>
            <Reveal when={showDirs}>{() => (
              <Stepper label="Directions" value={SNAP_COUNTS[snapIdx]} canDown={snapIdx > 0} canUp={snapIdx < SNAP_COUNTS.length - 1}
                onDown={() => { if (current()) place!.onSetSnapCount?.(snapIdx - 1); }} onUp={() => { if (current()) place!.onSetSnapCount?.(snapIdx + 1); }} />
            )}</Reveal>
            <Reveal when={showPoints}>{() => <span className="k-canvas-step-label">Snaps to {bodySides} face midpoints</span>}</Reveal>
          </div>
        ) : null}</Collapse>
        <MotionRow className="k-canvas-tools pointer-events-auto" glideWidth>
          {showMap && (
            <MotionRow.Item key="center"><CornerButton tip="Center Map: fit the whole map in view" onClick={() => logic.fitMapToView()}><Focus size={20} /></CornerButton></MotionRow.Item>
          )}
          {showMap && (
            <MotionRow.Item key="mapSelect"><CornerButton tip="Select Tool: pick, move and delete what is on the map" on={me.tool === 'select'} onClick={toggleMapSelect}><MousePointer size={20} /></CornerButton></MotionRow.Item>
          )}
          {place && (
            <MotionRow.Item key="mirror"><CornerButton tip={autoPlacement ? 'Mirror Turrets: off while Compass Placement is on' : 'Mirror Turrets: places a copy on the opposite side'}
              on={mirrorMode && !autoPlacement} disabled={autoPlacement} onClick={() => { if (!current()) return; if (!mirrorMode) endSelect(); place.onToggleMirror?.(!mirrorMode); }}><FlipHorizontal size={20} /></CornerButton></MotionRow.Item>
          )}
          {place && (
            <MotionRow.Item key="compass"><CornerButton tip="Compass Placement: spreads turrets evenly around the body" on={autoPlacement}
              onClick={() => { if (!current()) return; if (!autoPlacement) endSelect(); place.onToggleCompass?.(!autoPlacement); }}><Compass size={20} /></CornerButton></MotionRow.Item>
          )}
          {place && (
            <MotionRow.Item key="snap"><CornerButton tip="Snap Placement: locks angles to the body's face centers" on={snapPlacement}
              onClick={() => { if (!current()) return; if (!snapPlacement) endSelect(); place.onToggleSnap?.(!snapPlacement); }}><Magnet size={20} /></CornerButton></MotionRow.Item>
          )}
          {place && (
            <MotionRow.Item key="sep"><span className="k-canvas-tools-sep" aria-hidden="true" /></MotionRow.Item>
          )}
          {(showSelect || showTank) && (
            <MotionRow.Item key="undo"><CornerButton tip="Undo: takes back your last step (Ctrl+Z)" disabled={!canUndo} onClick={undo}><UndoStep size={20} /></CornerButton></MotionRow.Item>
          )}
          {showSelect && (
            <MotionRow.Item key="select"><CornerButton tip="Select from Canvas: click a turret on the tank to edit it" on={selectOn}
              onClick={() => { if (!selectOn) endPlacement(); logic.toggleSelectModeForCurrentContext(); }}><MousePointerClick size={20} /></CornerButton></MotionRow.Item>
          )}
          {showTank && (
            <MotionRow.Item key="layerSelect"><CornerButton tip="Select from Canvas: click a part of the tank to edit it" on={logic.layerPickMode}
              onClick={() => logic.setLayerPickMode(!logic.layerPickMode)}><MousePointerClick size={20} /></CornerButton></MotionRow.Item>
          )}
        </MotionRow>
      </div>
      )}</Fade>
    </div>
  );
};
