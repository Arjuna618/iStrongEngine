import React, { useEffect, useRef, useState } from 'react';
import { Collapse, Reveal, SwapInPlace, Fade, MotionRow } from '../kit/Collapse';
import type { GameLogic } from '../../game/GameLogic';
import { cancelMapEditInteraction, clearMapEditSelection } from '../../game/MapEditor';
import { SNAP_COUNTS, type SnapTarget } from '../../types';
import { Segmented } from '../kit/kit';
import { MousePointer, Focus, FlipHorizontal, Compass, Magnet, Minus, Plus, UndoStep, AreaFree, EditPoints } from '../ui/icons';
import { ButtonTooltip } from '../shared/HelpTooltip';
import { TurretActionBar } from '../shared/TurretActionBar';
import { usePlacementBar, placementBarIsSub } from './PlacementBar';
import { useActiveTool } from './toolStore';
import { useDesignHistory } from '../shared/HistoryPanel';
import { flushDesignHistory } from './historyRecorder';
import { useClassicUi } from '../shared/useClassicUi';
import { PickGlide } from '../kit/TabSlide';

let _slot: HTMLDivElement | null = null;
const _slotSubs = new Set<() => void>();
const setCornerSlot = (el: HTMLDivElement | null): void => { if (el === _slot) return; _slot = el; _slotSubs.forEach(f => f()); };
export const subCornerSlot = (f: () => void): (() => void) => { _slotSubs.add(f); return () => { _slotSubs.delete(f); }; };
export const cornerSlotNow = (): HTMLDivElement | null => _slot;

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

const HIDE_MS = 180;
function useCornerSlide(classic: boolean, want: string | null, laidOut = false): { key: string | null; out: boolean } {
  const [key, setKey] = useState<string | null>(want);
  const [out, setOut] = useState(laidOut && want !== null);
  useEffect(() => {
    if (!classic) return;
    if (want === key) {
      if (want === null || out) return;
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setOut(true)); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    if (out) { setOut(false); return; }
    if (key === null) { setKey(want); return; }
    const t = window.setTimeout(() => setKey(want), HIDE_MS);
    return () => window.clearTimeout(t);
  }, [classic, want, key, out]);
  return classic ? { key, out } : { key: want, out: true };
}

const NoteSlide: React.FC<{ want: string | null; hold: boolean; children: React.ReactNode }> = ({ want, hold, children }) => {
  const asked = useRef(want);
  if (!hold) asked.current = want;
  const s = useCornerSlide(true, asked.current, true);
  const live = !hold && s.key === want;
  const kept = useRef<React.ReactNode>(children);
  if (live) kept.current = children;
  return s.key !== null ? <div key={s.key} className={`k-corner-slide k-note-slide${s.out ? ' k-corner-out' : ''}`}>{live ? children : kept.current}</div> : null;
};

const SNAP_TARGET_OPTIONS: { value: SnapTarget; label: string; title: string }[] = [
  { value: 'faces', label: 'Faces', title: 'Locks to the middle of each flat side.' },
  { value: 'corners', label: 'Corners', title: 'Locks to each corner, the tips of a star.' },
  { value: 'both', label: 'Both', title: 'Locks to every flat side and every corner.' },
];

const Stepper: React.FC<{ label: string; value: number; canDown: boolean; canUp: boolean; onDown: () => void; onUp: () => void }> = ({ label, value, canDown, canUp, onDown, onUp }) => (
  <span className="k-canvas-step">
    <span className="k-canvas-step-label">{label}</span>
    <button type="button" className="k-icon-btn k-icon-btn-sm" aria-label={`Fewer: ${label}`} disabled={!canDown} onClick={onDown}><Minus size={12} /></button>
    <span className="k-canvas-step-value">{value}</span>
    <button type="button" className="k-icon-btn k-icon-btn-sm" aria-label={`More: ${label}`} disabled={!canUp} onClick={onUp}><Plus size={12} /></button>
  </span>
);

export const CanvasCornerTools: React.FC<Props> = ({ logic, rightInset, chromeScale }) => {
  const classicUi = useClassicUi();
  const bar = usePlacementBar();
  useActiveTool();
  const { canUndo } = useDesignHistory(logic);
  const inMatch = logic.state.isTestMode;
  const showSelect = !inMatch && logic.shouldShowSelectButton();
  const showMap = !inMatch && logic.isMapDesignerActive;
  const showTank = !inMatch && logic.isTankToolActive && logic.state.canvasEntityKind === 'tank';
  const showRest = !inMatch && !showSelect && logic.isTurretPlacementEnabled && !logic.turretPlacing && logic.state.canvasEntityKind === 'tank';
  const shown = showSelect || showMap || showTank || showRest;
  const slide = useCornerSlide(classicUi, shown ? [showMap ? 'map' : '', showSelect ? 'canvas' : '', showTank ? 'tank' : '', showRest ? 'rest' : ''].filter(Boolean).join('+') : null);
  const setNow = slide.key ?? '';
  const dMap = classicUi ? setNow.includes('map') : showMap;
  const dSelect = classicUi ? setNow.includes('canvas') : showSelect;
  const dTank = classicUi ? setNow.includes('tank') : showTank;
  const dRest = classicUi ? setNow.includes('rest') : showRest;

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

  const place = dSelect ? bar : null;
  const current = () => placementBarIsSub() === !!logic.state.autoSubTurretEditMode;
  const mirrorMode = place?.mirrorMode ?? false;
  const autoPlacement = place?.autoPlacement ?? false;
  const snapPlacement = place?.snapPlacement ?? false;
  const bodySides = place?.bodySides ?? 0;
  const isComboMode = autoPlacement && snapPlacement && bodySides >= 3;
  const snapTarget: SnapTarget = place?.snapTarget ?? 'faces';
  const compassMax = isComboMode ? (snapTarget === 'both' ? bodySides * 2 : bodySides) : bodySides >= 3 ? bodySides : 8;
  const count = Math.min(place?.autoPlacementCount ?? 1, compassMax);
  const snapIdx = Math.max(0, Math.min(SNAP_COUNTS.length - 1, place?.snapPlacementCount ?? 0));
  const showCount = !!place && autoPlacement;
  const showDirs = !!place && snapPlacement && !isComboMode && bodySides < 3;
  const showPoints = !!place && snapPlacement && bodySides >= 3;
  const showHint = !!place && (!!place.selectMode || !!place.inheritMode);
  const showLayerHint = dTank && logic.layerPickMode;
  const undo = () => { flushDesignHistory(); logic.undoDesign(); };
  const endSelect = () => { if (selectOn) logic.toggleSelectModeForCurrentContext(); };
  const endPlacement = () => {
    if (!place || !current()) return;
    if (autoPlacement) place.onToggleCompass?.(false);
    if (snapPlacement) place.onToggleSnap?.(false);
    if (mirrorMode) place.onToggleMirror?.(false);
  };

  const countStep = () => (
    <Stepper label="Count" value={count} canDown={count > 1} canUp={count < compassMax}
      onDown={() => { if (current()) place!.onSetAutoPlacementCount?.(Math.max(1, count - 1)); }} onUp={() => { if (current()) place!.onSetAutoPlacementCount?.(Math.min(compassMax, count + 1)); }} />
  );
  const dirStep = () => (
    <Stepper label="Directions" value={SNAP_COUNTS[snapIdx]} canDown={snapIdx > 0} canUp={snapIdx < SNAP_COUNTS.length - 1}
      onDown={() => { if (current()) place!.onSetSnapCount?.(snapIdx - 1); }} onUp={() => { if (current()) place!.onSetSnapCount?.(snapIdx + 1); }} />
  );
  const pointsLine = () => (
    <span className="k-canvas-step">
      <span className="k-canvas-step-label">Snaps To</span>
      <Segmented<SnapTarget> value={snapTarget} onChange={v => { if (current()) place!.onSetSnapTarget?.(v); }} options={SNAP_TARGET_OPTIONS} />
    </span>
  );
  const anyCount = !!(showCount || showDirs || showPoints);
  const stackRows = [showCount, showDirs, showPoints].filter(Boolean).length > 1;
  const notes = (<>
        <Collapse open={!!showHint} reveal="none">{showHint ? <div className="k-canvas-note pointer-events-auto"><SwapInPlace swapKey={place!.inheritMode ? 'inherit' : 'select'} hold={false}><TurretActionBar {...place!} part="instructions" /></SwapInPlace></div> : null}</Collapse>
        <Collapse open={showLayerHint} reveal="none">{showLayerHint ? <div className="k-canvas-note pointer-events-auto"><p className="k-hint k-hint-strong">Click a part of the tank to edit it.</p></div> : null}</Collapse>
        <Collapse open={anyCount} reveal="none">{anyCount ? (
          <div className={`k-canvas-note pointer-events-auto${stackRows ? ' k-note-stack' : ''}`}>
            <Reveal when={showCount}>{countStep}</Reveal>
            <Reveal when={showDirs}>{dirStep}</Reveal>
            <Reveal when={showPoints}>{pointsLine}</Reveal>
          </div>
        ) : null}</Collapse>
  </>);
  const noteKey = [showHint ? (place!.inheritMode ? 'inherit' : 'select') : '', showLayerHint ? 'layer' : '',
    showCount ? 'count' : '', showDirs ? 'dirs' : '', showPoints ? 'points' : ''].filter(Boolean).join('+') || null;
  const classicNotes = (<>
        {showHint ? <div className="k-canvas-note pointer-events-auto"><TurretActionBar {...place!} part="instructions" /></div> : null}
        {showLayerHint ? <div className="k-canvas-note pointer-events-auto"><p className="k-hint k-hint-strong">Click a part of the tank to edit it.</p></div> : null}
        {anyCount ? <div className={`k-canvas-note pointer-events-auto${stackRows ? ' k-note-stack' : ''}`}>{showCount ? countStep() : null}{showDirs ? dirStep() : null}{showPoints ? pointsLine() : null}</div> : null}
  </>);
  const strip = (
        <MotionRow className="k-canvas-tools pointer-events-auto" glideWidth>
          {dMap && (
            <MotionRow.Item key="center"><CornerButton tip="Center Map: fit the whole map in view" onClick={() => logic.fitMapToView()}><Focus size={20} /></CornerButton></MotionRow.Item>
          )}
          {dMap && (
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
          {(dSelect || dTank || dRest) && (
            <MotionRow.Item key="undo"><CornerButton tip="Undo: takes back your last step (Ctrl+Z)" disabled={!canUndo} onClick={undo}><UndoStep size={20} /></CornerButton></MotionRow.Item>
          )}
          {dSelect && (
            <MotionRow.Item key="select"><CornerButton tip={s.autoSubTurretEditMode ? 'Select from Canvas: click a part of the tank to edit it' : 'Select from Canvas: stops placing turrets, as Done does, so a click picks a part of the tank'} on={selectOn}
              onClick={() => { if (!s.autoSubTurretEditMode) { logic.endTurretPlacing(); return; } if (!selectOn) endPlacement(); logic.toggleSelectModeForCurrentContext(); }}><MousePointer size={20} /></CornerButton></MotionRow.Item>
          )}
          {dRest && (
            <MotionRow.Item key="pen"><CornerButton tip="Pen: click to place points, drag to curve them, click the first point to close (P)" on={logic.pen.on}
              onClick={() => logic.setPen(!logic.pen.on)}><AreaFree size={20} /></CornerButton></MotionRow.Item>
          )}
          {dRest && logic.partPicked && s.activeBodyLayerId !== null && !s.selectedTurretId && (
            <MotionRow.Item key="points"><CornerButton tip="Edit Points: drag the points and curves of the picked layer's shape (A)" on={logic.pe.on}
              onClick={() => logic.setPointEdit(!logic.pe.on)}><EditPoints size={20} /></CornerButton></MotionRow.Item>
          )}
          {(dSelect || dRest) && (
            <MotionRow.Item key="fit"><CornerButton tip="Fit View: shows the whole tank again (the wheel zooms, the middle button pans)"
              onClick={() => logic.resetEditorView()}><Focus size={20} /></CornerButton></MotionRow.Item>
          )}
          {dTank && (
            <MotionRow.Item key="layerSelect"><CornerButton tip="Select from Canvas: click a part of the tank to edit it" on={logic.layerPickMode}
              onClick={() => logic.setLayerPickMode(!logic.layerPickMode)}><MousePointer size={20} /></CornerButton></MotionRow.Item>
          )}
        </MotionRow>
  );

  if (classicUi) return (
    <div className="absolute z-30 pointer-events-none k-corner-clip" style={{ right: rightInset, bottom: 14 * chromeScale }}>
      {slide.key !== null ? (
        <div key={slide.key} className={`k-corner-slide${slide.out ? ' k-corner-out' : ''}`}>
          <div className="k-canvas-corner" style={chromeScale !== 1 ? { zoom: chromeScale } : undefined}>
            <NoteSlide want={noteKey} hold={!slide.out}>{classicNotes}</NoteSlide>
            <div className="k-canvas-row pointer-events-auto">
              <PickGlide pick='[aria-pressed="true"]' />
              {dMap ? <div className="k-corner-slot" ref={setCornerSlot} /> : null} { }
              {strip}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
  return (
    <div className="absolute z-30 pointer-events-none" style={{ right: rightInset + 14 * chromeScale, bottom: 14 * chromeScale }}>
      <Fade when={shown} className="block">{() => (
      <div className="k-canvas-corner" style={chromeScale !== 1 ? { zoom: chromeScale } : undefined}>
        {notes}
        {strip}
      </div>
      )}</Fade>
    </div>
  );
};
