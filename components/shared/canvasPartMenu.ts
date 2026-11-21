import type { GameLogic } from '../../game/GameLogic';
import type { MenuEntry } from '../shell/ContextMenu';
import { Copy, Trash2, ArrowUp, ArrowDown, Crosshair, FlipHorizontal, Lock, EyeOff, MousePointerClick, Focus, EditPoints, AreaFree, Plus, Shapes } from '../ui/icons';
import { layerOutlineOf } from '../../utils/layerOutline';

export function canvasPartMenu(logic: GameLogic): MenuEntry[] {
  if (!logic.ceMenuShown()) return [];
  const p = logic.ceMenuPick();
  const out: MenuEntry[] = [];
  if (p && p.kind !== 'body') {
    const t = p.kind === 'turret' ? logic.state.turrets.find(x => x.id === p.id) : undefined;
    out.push({ label: 'Duplicate', icon: Copy, hint: 'Ctrl D', onSelect: () => logic.duplicatePicked() });
    if (t && t.turretType === 'auto') out.push({ label: 'Edit Sub Turrets', icon: MousePointerClick, onSelect: () => { logic.enterAutoSubTurretMode(t.id); if (logic.onStateChange) logic.onStateChange(logic.state); } });
    out.push('sep');
    out.push({ label: 'Bring Forward', icon: ArrowUp, hint: 'Ctrl ]', onSelect: () => logic.orderPicked(1) });
    out.push({ label: 'Send Backward', icon: ArrowDown, hint: 'Ctrl [', onSelect: () => logic.orderPicked(-1) });
    out.push('sep');
    out.push({ label: 'Center', icon: Crosshair, onSelect: () => logic.centerPicked() });
    out.push({ label: 'Mirror Left and Right', icon: FlipHorizontal, onSelect: () => logic.mirrorPicked('y') });
    out.push({ label: 'Mirror Front and Back', icon: FlipHorizontal, onSelect: () => logic.mirrorPicked('x') });
    if (p.kind === 'layer') {
      const L = logic.state.bodyLayers.find(l => l.id === p.id);
      out.push('sep');
      if (L && layerOutlineOf(L)) {
        out.push({ label: 'Edit Points', icon: EditPoints, hint: 'A', onSelect: () => logic.setPointEdit(true) });
        out.push({ label: 'Flip Shape Left and Right', icon: FlipHorizontal, onSelect: () => logic.flipLayerShape('y', p.id) });
        out.push({ label: 'Flip Shape Front and Back', icon: FlipHorizontal, onSelect: () => logic.flipLayerShape('x', p.id) });
      } else out.push({ label: 'Convert to Custom Shape', icon: EditPoints, onSelect: () => logic.convertLayerToCustom(p.id) });
    }
    out.push('sep');
    out.push({ label: 'Lock on Canvas', icon: Lock, onSelect: () => logic.togglePartLock(p.id) });
    out.push({ label: 'Hide on Canvas', icon: EyeOff, onSelect: () => logic.togglePartHide(p.id) });
    out.push('sep');
    out.push({ label: 'Delete', icon: Trash2, hint: 'Del', onSelect: () => {
      if (p.kind === 'turret') { logic.removeTurret(p.id); if (logic.onStateChange) logic.onStateChange(logic.state); }
      else logic.removePickedLayer();
    } });
  } else if (p && p.kind === 'body') {
    out.push({ label: 'Lock on Canvas', icon: Lock, onSelect: () => logic.togglePartLock('main') });
    out.push({ label: 'Hide on Canvas', icon: EyeOff, onSelect: () => logic.togglePartHide('main') });
  }
  if (!p) {
    const full = logic.state.bodyLayers.length >= 10;
    out.push({ label: 'Add Layer', icon: Plus, disabled: full, items: [
      { label: 'Circle', icon: Shapes, onSelect: () => logic.addStarterLayer('circle') },
      { label: 'Triangle', icon: Shapes, onSelect: () => logic.addStarterLayer('triangle') },
      { label: 'Square', icon: Shapes, onSelect: () => logic.addStarterLayer('square') },
      { label: 'Pentagon', icon: Shapes, onSelect: () => logic.addStarterLayer('pentagon') },
      { label: 'Hexagon', icon: Shapes, onSelect: () => logic.addStarterLayer('hexagon') },
      { label: 'Star', icon: Shapes, onSelect: () => logic.addStarterLayer('star') },
      { label: 'Cross', icon: Shapes, onSelect: () => logic.addStarterLayer('cross') },
    ] });
    out.push({ label: 'Draw with the Pen', icon: AreaFree, hint: 'P', disabled: full, onSelect: () => logic.setPen(true) });
  }
  if (logic.partLocks.size > 0 || logic.partHides.size > 0) {
    if (out.length > 0) out.push('sep');
    if (logic.partLocks.size > 0) out.push({ label: 'Unlock All Parts', icon: Lock, onSelect: () => { logic.partLocks.clear(); if (logic.onStateChange) logic.onStateChange(logic.state); } });
    if (logic.partHides.size > 0) out.push({ label: 'Show All Parts', icon: EyeOff, onSelect: () => logic.showAllParts() });
  }
  if (logic.edZoom !== 1 || logic.edPanX !== 0 || logic.edPanY !== 0) {
    if (out.length > 0) out.push('sep');
    out.push({ label: 'Fit View', icon: Focus, onSelect: () => logic.resetEditorView() });
  }
  return out;
}
