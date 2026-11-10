import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { isTouchScreen } from '../../utils/device';

const _stack: number[] = [];
let _seq = 0;
let _version = 0;
const _subs = new Set<() => void>();
function emit(): void { _version++; for (const f of _subs) f(); }
function subscribe(f: () => void): () => void { _subs.add(f); return () => { _subs.delete(f); }; }
const version = (): number => _version;

export interface WindowLayer { covered: boolean; over: boolean; }

export function useWindowLayer(open = true): WindowLayer {
  const [id] = useState(() => ++_seq);
  useLayoutEffect(() => {
    if (!open) return;
    _stack.push(id);
    emit();
    return () => {
      const i = _stack.indexOf(id);
      if (i >= 0) _stack.splice(i, 1);
      emit();
    };
  }, [id, open]);
  useSyncExternalStore(subscribe, version, version);
  if (!open || !isTouchScreen()) return NONE;
  const i = _stack.indexOf(id);
  if (i < 0) return NONE;
  return { covered: i < _stack.length - 1, over: i > 0 };
}
const NONE: WindowLayer = { covered: false, over: false };

export function useOpenWindowCount(): number {
  useSyncExternalStore(subscribe, version, version);
  return _stack.length;
}

export function openWindowIds(): readonly number[] { return _stack; }
