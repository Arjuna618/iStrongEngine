import { useEffect, useRef } from 'react';
import type { GameLogic } from '../../game/GameLogic';

export function useDebugRevokeClose(logic: GameLogic, close: () => void): void {
  const cb = useRef(close);
  cb.current = close;
  useEffect(() => logic.admin.onRevoke(() => cb.current()), [logic]);
}
