import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import type { GameLogic } from '../game/GameLogic';
import { useEscapeOwner } from './shared/escapeStack';
import { CHAT_MAX_LEN } from '../game/chatRules';
import { HUD_FONT_FAMILY } from '../utils/hudArras';
import { mobileActive } from '../utils/mobileMode';
import { typeSheetOn } from '../utils/typeSheet';

let _el: HTMLInputElement | null = null;
let _shown = false;
let _l = NaN, _t = NaN, _w = NaN, _h = NaN, _f = NaN, _a = NaN, _col = '', _ro = true;
let _typed = '';

export function chatInputElement(): HTMLInputElement | null { return _el; }

const _q = (v: number): number => Math.round(v * 4) / 4;

export function chatInputPlace(left: number, top: number, w: number, h: number, font: number, ink: string, alpha: number, readOnly: boolean): void {
  const el = _el;
  if (el === null) return;
  const st = el.style;
  if (!_shown) { _shown = true; st.display = 'block'; }
  left = _q(left); top = _q(top); w = _q(w); h = _q(h); font = Math.round(font * 10) / 10; alpha = Math.round(alpha * 100) / 100;
  if (left !== _l || top !== _t) { _l = left; _t = top; st.transform = `translate(${left}px, ${top}px)`; }
  if (w !== _w) { _w = w; st.width = `${w}px`; }
  if (h !== _h || font !== _f) { _h = h; _f = font; st.height = `${h}px`; st.font = `bold ${font}px/${h}px ${HUD_FONT_FAMILY}`; }
  if (alpha !== _a || ink !== _col) {
    _a = alpha; _col = ink;
    st.setProperty('color', ink, 'important');
    st.setProperty('caret-color', ink, 'important');
    st.opacity = String(alpha);
  }
  if (readOnly !== _ro) { _ro = readOnly; el.readOnly = readOnly; }
}

export function chatInputOpenNow(): void {
  const el = _el;
  if (el === null) return;
  el.value = '';
  el.readOnly = false; _ro = false;
  if (!_shown) { _shown = true; el.style.display = 'block'; }
  el.focus({ preventScroll: true });
}

export function chatInputHide(): void {
  if (!_shown || _el === null) return;
  _shown = false;
  _el.style.display = 'none';
  if (document.activeElement === _el) _el.blur();
}

export const ChatInput: React.FC<{ logic: GameLogic }> = React.memo(({ logic }) => {
  const ref = useRef<HTMLInputElement>(null);
  const rec = logic.chat;
  const open = useSyncExternalStore(rec.subscribe, rec.isOpen);

  useEffect(() => {
    const el = ref.current;
    _el = el;
    if (el !== null) {
      const st = el.style;
      st.setProperty('background-color', 'transparent', 'important');
      st.setProperty('border', 'none', 'important');
      st.setProperty('outline', 'none', 'important');
      st.setProperty('box-shadow', 'none', 'important');
      st.setProperty('padding', '0', 'important');
      st.setProperty('margin', '0', 'important');
    }
    const onInput = () => {
      if (el === null) return;
      const v = el.value;
      if (!mobileActive()) { _typed = v; return; }
      let i = 0;
      while (i < _typed.length && i < v.length && _typed.charCodeAt(i) === v.charCodeAt(i)) i++;
      const added = i < v.length ? v.slice(i) : '';
      _typed = v;
      if (added !== '' && logic.admin.typedLetters(added)) { el.value = ''; _typed = ''; }
    };
    const onOut = () => { if (typeSheetOn() && logic.chat.boxOpen) logic.chatClose(performance.now()); };
    if (el !== null) { el.addEventListener('input', onInput); el.addEventListener('focusout', onOut); }
    return () => { if (el !== null) { el.removeEventListener('input', onInput); el.removeEventListener('focusout', onOut); } if (_el === el) _el = null; _shown = false; _l = _t = _w = _h = _f = _a = NaN; _col = ''; _ro = true; };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    if (open) {
      el.value = ''; _typed = '';
      el.readOnly = false; _ro = false;
      if (!_shown) { _shown = true; el.style.display = 'block'; }
      el.focus({ preventScroll: true });
    } else {
      el.readOnly = true; _ro = true;
      if (document.activeElement === el) el.blur();
    }
  }, [open]);

  useEscapeOwner(() => logic.chatClose(performance.now()), open);

  return (
    <input
      ref={ref}
      type="text"
      className="k-chat-in"
      maxLength={CHAT_MAX_LEN}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      tabIndex={-1}
      aria-label="Chat"
      style={{ display: 'none', position: 'absolute', left: 0, top: 0, zIndex: 5, pointerEvents: 'auto' }}
    />
  );
});
ChatInput.displayName = 'ChatInput';
