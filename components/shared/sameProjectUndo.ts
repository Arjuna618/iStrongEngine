import { SMALL_FIX } from '../../game/smallFixSwitch';

export const UNDO_ELSEWHERE = 'That Undo belongs to another project or map, so nothing was changed.';

export function sameProjectUndo(logic: { projectEpoch: number } | null | undefined, say: (kind: 'info', text: string) => void, run: () => void): () => void {
  const at = logic ? logic.projectEpoch : 0;
  return () => {
    if (SMALL_FIX.R824 && logic && logic.projectEpoch !== at) { say('info', UNDO_ELSEWHERE); return; }
    run();
  };
}
