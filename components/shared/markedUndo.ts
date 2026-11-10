import type { GameLogic } from '../../game/GameLogic';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import { toast } from '../ui/Toast';

export const UNDO_NOT_NEWEST = 'A newer map change came after this one, so nothing was changed. Ctrl Z still steps back through every change.';

export function markOfLastEdit(logic: GameLogic): object | null {
  return SMALL_FIX.R881 !== 0 ? logic.mapEditMark() : null;
}

export function undoMarkedEdit(logic: GameLogic, mark: object | null): boolean {
  if (SMALL_FIX.R881 === 0) { logic.undoMapEdit(); return true; }
  if (logic.undoMapEditOf(mark)) return true;
  toast('info', UNDO_NOT_NEWEST);
  return false;
}
