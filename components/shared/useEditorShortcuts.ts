import { useEffect } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import { cancelMapEditInteraction, clearMapEditSelection } from '../../game/MapEditor';
import { deleteMapEditorSelection, closeFreeShape, undoFreePoint, nudgePickedPoints, pickAllPoints } from '../../game/MapEditorInput';

import { type Tool, TOOL_ORDER } from '../shell/engineTools';
import { toolStore } from '../shell/toolStore';
import { flushDesignHistory } from '../shell/historyRecorder';
import { turretListMarks } from './InstalledTurretsList';

interface EditorShortcutDeps {
  logic: GameLogic | null;
  setTool: (tool: Tool) => void;
  isTestMode: boolean;
  enabled: boolean;
  onEscapeToMenu?: () => void;
}

export function editorRedo(logic: GameLogic): boolean {
  if (toolStore.get() !== 'map-designer') return false;
  return logic.redoMapEdit();
}

export function editorUndo(logic: GameLogic): boolean {
  const activeTool = toolStore.get();
  if (activeTool === 'turret' || activeTool === 'tank') {
    if (!logic.state.isTestMode && logic.state.canvasEntityKind !== 'tank') return false;
    flushDesignHistory();
    return logic.undoDesign();
  }
  if (activeTool === 'map-designer') return logic.undoMapEdit();
  return false;
}

export function editorDelete(logic: GameLogic): boolean {
  const activeTool = toolStore.get();
  if (activeTool === 'turret') {
    if (!logic.state.isTestMode && logic.state.canvasEntityKind !== 'tank') return false;
    const scope = logic.state.autoSubTurretEditMode ? 'base:' + logic.state.autoSubTurretParentId : (logic.state.activeBodyLayerId ?? 'main');
    const marks = turretListMarks.get(scope) ?? [];
    const edited = logic.state.autoSubTurretEditMode ? logic.state.autoSubTurretSelectedId : (logic.state.selectMode ? logic.state.selectedTurretId : null);
    let did = true;
    if (marks.length > 1 || (marks.length === 1 && marks[0] !== edited)) {
      logic.removeTurrets(marks);
    } else if (logic.state.autoSubTurretEditMode && logic.state.autoSubTurretSelectedId) {
      logic.removeAutoSubTurret(logic.state.autoSubTurretSelectedId);
    } else if (logic.state.selectMode && logic.state.selectedTurretId) {
      logic.removeTurret(logic.state.selectedTurretId);
    } else did = false;
    if (logic.onStateChange) logic.onStateChange(logic.state);
    return did;
  }
  if (activeTool === 'map-designer' && logic.mapEditor.hasSelection) {
    deleteMapEditorSelection(logic);
    return true;
  }
  return false;
}

export function editorEditState(logic: GameLogic): { canUndo: boolean; canRedo: boolean; canDelete: boolean } {
  const t = toolStore.get();
  const tankShown = logic.state.canvasEntityKind === 'tank';
  const canUndo = (t === 'turret' || t === 'tank') ? tankShown && logic.designHistory.canUndo() : t === 'map-designer' ? logic.canUndoMapEdit() : false;
  const canRedo = t === 'map-designer' && logic.canRedoMapEdit();
  const s = logic.state;
  const canDelete = t === 'turret'
    ? tankShown && ((s.autoSubTurretEditMode && !!s.autoSubTurretSelectedId) || (s.selectMode && !!s.selectedTurretId) || (turretListMarks.get(s.autoSubTurretEditMode ? 'base:' + s.autoSubTurretParentId : (s.activeBodyLayerId ?? 'main'))?.length ?? 0) > 0)
    : t === 'map-designer' && logic.mapEditor.hasSelection;
  return { canUndo, canRedo, canDelete };
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return type !== 'range' && type !== 'checkbox' && type !== 'radio';
  }
  return (el as HTMLElement).isContentEditable === true;
}

export function useEditorShortcuts({ logic, setTool, isTestMode, enabled, onEscapeToMenu }: EditorShortcutDeps) {

  useEffect(() => {
    const suppressSliderUpDown = (e: KeyboardEvent) => {
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
          (e.target as HTMLElement)?.tagName === 'INPUT' &&
          (e.target as HTMLInputElement)?.type === 'range') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', suppressSliderUpDown, true);
    return () => window.removeEventListener('keydown', suppressSliderUpDown, true);
  }, []);

  useEffect(() => {
    if (!logic) return;

    const handler = (e: KeyboardEvent) => {
      if (isTestMode) return;
      if (!enabled) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.defaultPrevented || document.querySelector('.k-drop, .k-ctx')) return;

      const activeTool = toolStore.get();
      const focused = document.activeElement;
      const typing = isTextInput(focused);

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        if (typing) return;
        if (activeTool === 'map-designer') {
          e.preventDefault();
          editorRedo(logic);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (typing) return;
        if (activeTool === 'turret' || activeTool === 'tank' || activeTool === 'map-designer') {
          e.preventDefault();
          editorUndo(logic);
        }
        return;
      }

      if (activeTool === 'map-designer' && logic.mapEditor.freeActive && !typing) {
        if (e.key === 'Enter') { e.preventDefault(); closeFreeShape(logic); return; }
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); undoFreePoint(logic); return; }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (typing) return;
        if (activeTool === 'turret' && e.key === 'Delete') {
          e.preventDefault();
          editorDelete(logic);
        } else if (activeTool === 'map-designer' && logic.mapEditor.hasSelection) {
          e.preventDefault();
          editorDelete(logic);
        }
        return;
      }

      if (e.key === 'Escape') {
        if (logic.isMapDesignerActive) {
          const me = logic.mapEditor;
          if (me.dragArmed || me.dragActive || me.zoneDragActive || me.vtxDrag !== -1 || me.freeActive
              || me.placeStrokeActive || me.eraseStrokeActive) {
            logic.endMapEditStroke();
            cancelMapEditInteraction(me);
            if (logic.onStateChange) logic.onStateChange(logic.state);
            return;
          }
          if (me.vtxMode) {
            me.vtxMode = false; me.vtxSel = -1;
            if (logic.onStateChange) logic.onStateChange(logic.state);
            return;
          }
          if (me.tool !== 'none' && me.tool !== 'select') {
            me.tool = 'none';
            logic.endMapEditStroke();
            cancelMapEditInteraction(me);
            if (logic.onStateChange) logic.onStateChange(logic.state);
            return;
          }
          if (me.hasSelection) {
            clearMapEditSelection(me);
            if (logic.onStateChange) logic.onStateChange(logic.state);
            return;
          }
        }
        if (logic.state.presetPreviewTurrets.length > 0) {
          logic.cancelPresetPreview();
          if (logic.onStateChange) logic.onStateChange(logic.state);
          return;
        }
        if (logic.state.autoSubTurretSelectMode) {
          logic.setAutoSubTurretSelectMode(false);
          if (logic.onStateChange) logic.onStateChange(logic.state);
          return;
        }
        if (logic.state.selectMode) {
          logic.setSelectMode(false);
          if (logic.onStateChange) logic.onStateChange(logic.state);
          return;
        }
        if (logic.isMapDesignerActive && logic.mapEditor.tool === 'select') {
          logic.mapEditor.tool = 'none';
          logic.endMapEditStroke();
          cancelMapEditInteraction(logic.mapEditor);
          clearMapEditSelection(logic.mapEditor);
          if (logic.onStateChange) logic.onStateChange(logic.state);
          return;
        }
        if (onEscapeToMenu) onEscapeToMenu();
        return;
      }

      if (activeTool === 'map-designer' && logic.mapEditor.vtxMode && !typing) {
        const step = e.shiftKey ? 1 : 0.25;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        if ((dx !== 0 || dy !== 0) && nudgePickedPoints(logic, dx, dy)) { e.preventDefault(); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && pickAllPoints(logic)) { e.preventDefault(); return; }
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (typing) return;
        e.preventDefault();
        const idx = TOOL_ORDER.indexOf(activeTool);
        if (e.key === 'ArrowUp') {
          setTool(TOOL_ORDER[idx <= 0 ? TOOL_ORDER.length - 1 : idx - 1]);
        } else {
          setTool(TOOL_ORDER[idx >= TOOL_ORDER.length - 1 ? 0 : idx + 1]);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [logic, setTool, isTestMode, enabled, onEscapeToMenu]);
}
