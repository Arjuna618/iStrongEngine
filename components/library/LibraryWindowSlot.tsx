import React, { useMemo, useSyncExternalStore } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import { ContentLibrary } from './ContentLibrary';
import type { LibMode } from './libraryModes';

export interface OpenFlag { get(): boolean; set(v: boolean): void; subscribe(cb: () => void): () => void }

export function useOpenFlag(): OpenFlag {
  return useMemo(() => {
    let v = false;
    const subs = new Set<() => void>();
    return {
      get: () => v,
      set: (n: boolean) => { if (n === v) return; v = n; subs.forEach(f => f()); },
      subscribe: (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; },
    };
  }, []);
}

export const LibraryWindowSlot: React.FC<{ flag: OpenFlag; logic: GameLogic; mode: LibMode | null }> = ({ flag, logic, mode }) => {
  const open = useSyncExternalStore(flag.subscribe, flag.get, flag.get);
  if (!open || !mode) return null;
  return <ContentLibrary logic={logic} mode={mode} onClose={() => flag.set(false)} />;
};
