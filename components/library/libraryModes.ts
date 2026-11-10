import type React from 'react';
import type { LucideIcon } from '../ui/icons';
import type { GameLogic } from '../../game/GameLogic';
import type { CustomProjectileDesign, FoodShapeDesign, OtherDesign, PlacedLook, TurretPreset } from '../../types';
import { designFromShapeDef, labyDownscale, RARITY_MULTIPLIERS } from '../../game/ShapeRegistry';
import { getRealSizeFactor } from '../../utils/p5Utils';
import { lookFromOther, lookFromShape } from '../../utils/placedLook';
import { fireTip } from '../../utils/tips';
import type { LibEntry, LibKind } from './catalog';
import type { Tool } from '../shell/engineTools';

export interface LibAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  run: (e: LibEntry) => boolean | void;
}

export interface LibMode {
  place: string;
  title: string;
  subtitle?: string;
  kinds: readonly LibKind[];
  lockedKinds?: Partial<Record<LibKind, string>>;
  startKind?: LibKind;
  presetFilter?: { kind: LibKind; picks: readonly (readonly [string, string])[] };
  actionsOf: (e: LibEntry) => LibAction[];
  isChosen?: (e: LibEntry) => boolean;
  chosenSection?: { title: string; rank?: (e: LibEntry) => number };
  lockOf?: (e: LibEntry) => string | null;
  footer?: React.ReactNode | ((close: (after?: () => void) => void, compact?: boolean) => React.ReactNode);
  status?: React.ReactNode;
  renderExtra?: (e: LibEntry) => React.ReactNode;
  extraH?: number;
  renderPanelExtra?: (e: LibEntry) => React.ReactNode;
  allowImport?: boolean;
  settingsPanel?: { title: string; content: React.ReactNode };
}

export interface CanvasModeDeps {
  logic: GameLogic;
  showToast: (kind: 'success' | 'error' | 'info', text: string) => void;
  onUpdate: () => void;
  showTool?: (tool: Tool) => void;
}

export function canvasKinds(logic: GameLogic): { kinds: LibKind[]; locked: Partial<Record<LibKind, string>> } {
  const s = logic.state;
  const all: LibKind[] = ['tank', 'turret', 'projectile', 'other', 'shape'];
  let only: LibKind | null = null;
  let why = '';
  if (!s.isTestMode && s.canvasEntityKind === 'other' && s.viewingOther !== null) { only = 'other'; why = 'An Other is shown on the canvas. Go back to the tank first.'; }
  else if (!s.isTestMode && s.canvasEntityKind === 'shape' && s.editingShape !== null) { only = 'shape'; why = 'A food shape is being edited on the canvas. Go back to the tank first.'; }
  else if (s.autoSubTurretEditMode) { only = 'turret'; why = 'You are editing an auto turret. Only turrets can go on its base.'; }
  if (!only) return { kinds: all, locked: {} };
  const locked: Partial<Record<LibKind, string>> = {};
  for (const k of all) if (k !== only) locked[k] = why;
  return { kinds: all, locked };
}

export function canvasActions(deps: CanvasModeDeps): (e: LibEntry) => LibAction[] {
  const { logic, showToast, onUpdate, showTool } = deps;
  const showItsPanel = () => showTool?.('tank');
  const placeLook = (look: PlacedLook): boolean => {
    if (!logic.startLookPlacement(look)) {
      showToast('error', 'Go back to the tank first: a food shape is being edited on the canvas.');
      return false;
    }
    onUpdate();
    showToast('info', 'Click on the tank to place it, Escape to cancel');
    return true;
  };
  return (e: LibEntry): LibAction[] => {
    const item = e.item;
    switch (e.kind) {
      case 'tank':
        return [{ id: 'load', label: 'Load Tank', run: () => { logic.loadLibraryTank(item!); onUpdate(); return true; } }];
      case 'turret':
        return [{ id: 'place', label: 'Place Turrets', run: () => {
          if (item!.fileData.type !== 'TurretPreset') {
            showToast('error', 'Legacy custom turret files are no longer supported. Use TurretPreset format.');
            return false;
          }
          logic.startPresetPreview(item!.fileData.data as TurretPreset);
          showToast('info', 'Preview active. Click to place, Escape to cancel');
          return true;
        } }];
      case 'projectile':
        return [{ id: 'load', label: 'Load', run: () => { logic.loadProjectileAsTank(item!.fileData.data as CustomProjectileDesign); onUpdate(); return true; } }];
      case 'shape': {
        const def = e.shape!;
        const builtIn = def.category !== 'user';
        const acts: LibAction[] = [{
          id: 'load', label: builtIn ? 'Edit a Copy' : 'Load Shape', run: () => {
            if (builtIn) logic.loadShapeDefIntoCanvas(def);
            else {
              const row = logic.state.tankLibrary.find(l => l.id === 'shape-' + def.id && l.fileData.type === 'FoodShape');
              logic.loadFoodShapeDesignIntoCanvas(row ? (row.fileData.data as FoodShapeDesign) : designFromShapeDef(def));
            }
            onUpdate();
            showItsPanel();
            return true;
          },
        }];
        if (!def.isPolyhedron) {
          acts.push({ id: 'look', label: 'Place as Look', run: () => placeLook(lookFromShape({
            id: def.id, name: def.displayName, sides: def.sides < 3 ? 0 : def.sides,
            color: /^#[0-9a-fA-F]{6}$/.test(def.defaultColor) ? def.defaultColor.toLowerCase() : '#888888',
            colorMap: typeof def.colorMap === 'number' ? def.colorMap : -1,
            nested: def.labyLevel || 0, downscale: labyDownscale(def.sides), realSize: getRealSizeFactor(def.sides),
            body: def.look ? def.look.body : undefined,
            alpha: RARITY_MULTIPLIERS[def.rarity]?.opacity ?? def.opacity,
            anim: def.isAnimatedColor ? def.animationType : undefined,
          })) });
        }
        return acts;
      }
      case 'other':
        return [
          { id: 'show', label: 'Show on Canvas', run: () => { logic.loadOtherIntoCanvas(item!.fileData.data as OtherDesign); onUpdate(); showItsPanel(); return true; } },
          { id: 'look', label: 'Place as Look', run: () => placeLook(lookFromOther(item!.fileData.data as OtherDesign)) },
        ];
      default:
        return [];
    }
  };
}

export function canvasMode(deps: CanvasModeDeps, place: string): LibMode {
  const { kinds, locked } = canvasKinds(deps.logic);
  return {
    place, title: 'Content Library', subtitle: 'Double click a card to load it on the canvas',
    kinds, lockedKinds: locked, actionsOf: canvasActions(deps), allowImport: true,
    isChosen: (e) => canvasShows(deps.logic, e),
    chosenSection: { title: 'Active' },
  };
}

export function canvasShows(logic: GameLogic, e: LibEntry): boolean {
  const s = logic.state;
  if (e.kind === 'other') return s.canvasEntityKind === 'other' && !!s.viewingOther && !!e.item && (e.item.fileData.data as OtherDesign).otherId === s.viewingOther.otherId;
  if (e.kind === 'shape') return s.canvasEntityKind === 'shape' && !!s.editingShape && !!e.shape && (s.editingShape.name === e.shape.displayName);
  if (s.canvasEntityKind !== 'tank' || !e.item) return false;
  if (e.kind === 'tank') {
    if (s.canvasIsProjectile) return false;
    if (logic.activeLibraryTankId) return e.item.id === logic.activeLibraryTankId;
    return !!s.editorTankLabel && e.item.name === s.editorTankLabel;
  }
  if (e.kind === 'projectile') return !!s.canvasIsProjectile && !!s.editorTankLabel && e.item.name === s.editorTankLabel;
  return false;
}

export function onKindOpened(kind: LibKind): void {
  if (kind === 'projectile') fireTip('projectileLibOpened');
}
