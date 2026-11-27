import { useEffect, useRef, useState } from 'react';
import { SMALL_FIX } from '../../game/smallFixSwitch';

interface EscapeOwner {
  token: symbol;
  handler: () => void;
}

const stack: EscapeOwner[] = [];
let listening = false;

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  top.handler();
}

function sync(): void {
  const want = stack.length > 0;
  if (want === listening) return;
  listening = want;
  if (want) window.addEventListener('keydown', onKeyDown, true);
  else window.removeEventListener('keydown', onKeyDown, true);
}

export function useEscapeOwner(handler: () => void, enabled: boolean = true): void {
  const tokenRef = useRef<symbol | null>(null);
  if (tokenRef.current === null) tokenRef.current = Symbol('escape-owner');
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const token = tokenRef.current!;
    const entry: EscapeOwner = { token, handler: () => handlerRef.current() };
    stack.push(entry);
    sync();
    return () => {
      const i = stack.findIndex(o => o.token === token);
      if (i >= 0) stack.splice(i, 1);
      sync();
    };
  }, [enabled]);
}

export function useSearchEscape(query: string, clear: () => void): { onFocus: () => void; onBlur: () => void; active: boolean } {
  const [focused, setFocused] = useState(false);
  const active = SMALL_FIX.G770 !== 0 && focused && query !== '';
  useEscapeOwner(clear, active);
  return { onFocus: () => setFocused(true), onBlur: () => setFocused(false), active };
}

export function pressEscapeOwner(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.handler();
  return true;
}

export function escapeIsOwned(): boolean {
  return stack.length > 0;
}
