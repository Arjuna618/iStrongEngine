import type { GameLogic } from '../../game/GameLogic';
import { toolStore } from './toolStore';

interface UndoStep { scope: string; run: () => void; epoch: number; mapMark: object | null }

const UNDO_LIMIT = 40;
const steps: UndoStep[] = [];
const listeners = new Set<() => void>();
const told = () => listeners.forEach(l => l());

export function pushUndoAction(logic: GameLogic, run: () => void, scope: string = toolStore.get()): void {
  steps.push({ scope, run, epoch: logic.projectEpoch, mapMark: logic.mapEditMark() });
  if (steps.length > UNDO_LIMIT) steps.splice(0, steps.length - UNDO_LIMIT);
  told();
}

function newestOf(logic: GameLogic, scope: string): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].epoch !== logic.projectEpoch) { steps.splice(i, 1); continue; }
    if (steps[i].scope === scope) return i;
  }
  return -1;
}

function newerThanMap(logic: GameLogic, s: UndoStep): boolean { return s.scope !== 'map-designer' || logic.mapEditMark() === s.mapMark; }

export function undoActionIn(logic: GameLogic, scope: string): boolean {
  const i = newestOf(logic, scope);
  if (i < 0 || !newerThanMap(logic, steps[i])) return false;
  const [s] = steps.splice(i, 1);
  told();
  s.run();
  return true;
}

export function canUndoActionIn(logic: GameLogic, scope: string): boolean {
  const i = newestOf(logic, scope);
  return i >= 0 && newerThanMap(logic, steps[i]);
}

export function clearUndoActions(): void { if (steps.length) { steps.length = 0; told(); } }

export function subscribeUndoActions(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
