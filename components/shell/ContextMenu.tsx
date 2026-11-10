import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { AppIcon } from '../ui/icons';
import { ChevronRight, Scissors, Copy, ClipboardPaste, TextSelect, Check } from '../ui/icons';
import { useEscapeOwner } from '../shared/escapeStack';
import { getVisualScale } from '../../utils/zoomCompensation';
import { useMenuStage } from '../kit/motion';
import { useLeave, scrollGlide, nearestScrollTop } from '../kit/presence';

export interface MenuPrompt {
  title: string;
  placeholder?: string;
  initial?: string;
  maxLength: number;
  submit: string;
  onSubmit: (text: string) => void;
}
export interface MenuItem {
  label: string;
  icon?: AppIcon;
  onSelect?: () => void;
  disabled?: boolean;
  hint?: string;
  items?: MenuEntry[];
  prompt?: MenuPrompt;
  tip?: string;
  checked?: boolean;
}
export type MenuEntry = MenuItem | 'sep';

interface MenuState { open: boolean; leaving: boolean; x: number; y: number; zoom: number; entries: MenuEntry[]; prompt: MenuPrompt | null; key: number; textEl: HTMLElement | null;
  textOver: { entries: MenuEntry[]; x: number; y: number } | null }

const CLOSED: MenuState = { open: false, leaving: false, x: 0, y: 0, zoom: 1, entries: [], prompt: null, key: 0, textEl: null, textOver: null };
let _state: MenuState = CLOSED;
const _subs = new Set<() => void>();
function setMenu(next: MenuState): void { _state = next; _subs.forEach(fn => fn()); }
const subscribe = (fn: () => void) => { _subs.add(fn); return () => { _subs.delete(fn); }; };
const getState = () => _state;

let _isEngine: () => boolean = () => false;
const _handled = new WeakSet<Event>();
let _leaveTimer = 0;
const LEAVE_MS = 110;
const TOUCH_HOLD_MS = 480;

export function openContextMenu(e: React.MouseEvent | MouseEvent, entries: MenuEntry[]): void {
  e.preventDefault();
  if (isTextBox(e.target as Element | null)) return;
  const native = 'nativeEvent' in e ? e.nativeEvent : e;
  _handled.add(native);
  if (!_isEngine() || entries.length === 0) return;
  const zoom = getVisualScale(e.target as Element) || 1;
  window.clearTimeout(_leaveTimer);
  setMenu({ open: true, leaving: false, x: e.clientX / zoom, y: e.clientY / zoom, zoom, entries, prompt: null, key: _state.key + 1, textEl: null, textOver: null });
}

export function openPromptAt(el: Element, prompt: MenuPrompt): void {
  if (!_isEngine()) return;
  const zoom = getVisualScale(el) || 1;
  const r = el.getBoundingClientRect();
  window.clearTimeout(_leaveTimer);
  setMenu({ open: true, leaving: false, x: r.left / zoom, y: (r.bottom + 6) / zoom, zoom, entries: [], prompt, key: _state.key + 1, textEl: null, textOver: null });
}

export function closeContextMenu(): void {
  if (!_state.open || _state.leaving) return;
  setMenu({ ..._state, leaving: true });
  window.clearTimeout(_leaveTimer);
  _leaveTimer = window.setTimeout(() => setMenu({ ...CLOSED, key: _state.key }), LEAVE_MS);
}

function isTextBox(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const t = (el as HTMLInputElement).type;
  return t === 'text' || t === 'number' || t === 'search' || t === '' || t === 'email' || t === 'url' || t === 'password';
}

function textMenu(el: HTMLInputElement | HTMLTextAreaElement): MenuEntry[] {
  let hasSel = false;
  try { hasSel = el.selectionStart !== null && el.selectionStart !== el.selectionEnd; } catch { hasSel = false; }
  const locked = el.readOnly || el.disabled;
  return [
    { label: 'Cut', icon: Scissors, hint: 'Ctrl+X', disabled: locked || !hasSel, onSelect: () => { el.focus(); document.execCommand('cut'); } },
    { label: 'Copy', icon: Copy, hint: 'Ctrl+C', disabled: !hasSel, onSelect: () => { el.focus(); document.execCommand('copy'); } },
    { label: 'Paste', icon: ClipboardPaste, hint: 'Ctrl+V', disabled: locked, onSelect: () => {
      el.focus();
      if (!navigator.clipboard || !navigator.clipboard.readText) return;
      navigator.clipboard.readText().then(t => { el.focus(); document.execCommand('insertText', false, t); }).catch(() => { });
    } },
    'sep',
    { label: 'Select All', icon: TextSelect, hint: 'Ctrl+A', onSelect: () => { el.focus(); el.select(); } },
  ];
}

export function installContextMenuGuard(isEngine: () => boolean): () => void {
  _isEngine = isEngine;
  const refuse = (e: MouseEvent) => { e.preventDefault(); if (_state.open && !_handled.has(e)) closeContextMenu(); };
  const fallback = (e: MouseEvent) => {
    if (_handled.has(e) || !_isEngine()) return;
    const t = e.target as Element | null;
    if (isTextBox(t)) {
      _handled.add(e);
      const zoom = getVisualScale(t) || 1;
      if (_state.open && !_state.leaving && _state.prompt && t.closest('.k-ctx-prompt')) {
        setMenu({ ..._state, textOver: { entries: textMenu(t), x: e.clientX / _state.zoom, y: e.clientY / _state.zoom } });
        return;
      }
      window.clearTimeout(_leaveTimer);
      setMenu({ open: true, leaving: false, x: e.clientX / zoom, y: e.clientY / zoom, zoom, entries: textMenu(t), prompt: null, key: _state.key + 1, textEl: t, textOver: null });
    }
  };
  let holdTimer = 0, hx = 0, hy = 0, holdTarget: Element | null = null;
  const cancelHold = () => { if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = 0; } };
  const touchDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    cancelHold();
    hx = e.clientX; hy = e.clientY; holdTarget = e.target as Element;
    holdTimer = window.setTimeout(() => {
      holdTimer = 0;
      if (!holdTarget || !_isEngine()) return;
      if (holdTarget.closest('canvas')) return;
      holdTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: hx, clientY: hy, button: 2 }));
      const eat = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
      window.addEventListener('click', eat, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', eat, true), 600);
    }, TOUCH_HOLD_MS);
  };
  const touchMove = (e: PointerEvent) => { if (holdTimer && Math.hypot(e.clientX - hx, e.clientY - hy) > 10) cancelHold(); };
  const closeOnScroll = (e: Event) => { if (_state.open && !(e.target instanceof Element && (e.target.closest('.k-ctx') || e.target.hasAttribute('data-kfade')))) closeContextMenu(); };
  const closeNow = () => closeContextMenu();
  window.addEventListener('contextmenu', refuse, true);
  window.addEventListener('contextmenu', fallback);
  window.addEventListener('pointerdown', touchDown, true);
  window.addEventListener('pointermove', touchMove, true);
  window.addEventListener('pointerup', cancelHold, true);
  window.addEventListener('pointercancel', cancelHold, true);
  window.addEventListener('scroll', closeOnScroll, true);
  window.addEventListener('resize', closeNow);
  window.addEventListener('blur', closeNow);
  return () => {
    window.removeEventListener('contextmenu', refuse, true);
    window.removeEventListener('contextmenu', fallback);
    window.removeEventListener('pointerdown', touchDown, true);
    window.removeEventListener('pointermove', touchMove, true);
    window.removeEventListener('pointerup', cancelHold, true);
    window.removeEventListener('pointercancel', cancelHold, true);
    window.removeEventListener('scroll', closeOnScroll, true);
    window.removeEventListener('resize', closeNow);
    window.removeEventListener('blur', closeNow);
    cancelHold();
  };
}

const isItem = (e: MenuEntry): e is MenuItem => e !== 'sep';

export const MenuBox: React.FC<{
  entries: MenuEntry[]; x: number; y: number; zoom: number; leaving: boolean; flyFrom?: DOMRect | null; depth: number;
  onPick: (it: MenuItem) => void; activeKeys: boolean; instant?: boolean;
  onSide?: (dir: 1 | -1) => void;
  onBack?: () => void;
}> = ({ entries, x, y, zoom, leaving, flyFrom, depth, onPick, activeKeys, instant, onSide, onBack }) => {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ index: number; rect: DOMRect } | null>(null);
  const subTimer = useRef(0);
  const subRects = useRef(new Map<number, DOMRect>());
  const subStage = useMenuStage<string>(sub ? String(sub.index) : null);
  useLeave(box, leaving, 'menu', LEAVE_MS);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = window.innerWidth / zoom, vh = window.innerHeight / zoom;
    let left = x, top = y;
    if (flyFrom) {
      const r = { left: flyFrom.left / zoom, right: flyFrom.right / zoom, top: flyFrom.top / zoom };
      left = r.right + 2 + w > vw - 6 ? r.left - w - 2 : r.right + 2;
      top = r.top - 4;
    } else {
      if (left + w > vw - 6) left = Math.max(6, left - w);
      if (top + h > vh - 6) top = Math.max(6, top - h);
    }
    if (top + h > vh - 6) top = Math.max(6, vh - 6 - h);
    if (left < 6) left = 6;
    setPos({ left, top, ready: true });
  }, [x, y, zoom, flyFrom, entries]);

  useEffect(() => {
    const el = box.current;
    if (!el || active < 0) return;
    const row = el.querySelector(`[data-ctx-i="${active}"]`) as HTMLElement | null;
    if (!row) return;
    const to = nearestScrollTop(el, row.offsetTop, row.offsetHeight);
    if (to != null) scrollGlide(el, to);
  }, [active]);

  const items = entries.map((e, i) => ({ e, i })).filter(o => isItem(o.e) && !(o.e as MenuItem).disabled);
  const move = (dir: 1 | -1) => {
    if (items.length === 0) return;
    const at = items.findIndex(o => o.i === active);
    const next = items[(at + dir + items.length) % items.length];
    setActive(next.i);
  };
  const openSub = (i: number) => {
    const row = box.current?.querySelector(`[data-ctx-i="${i}"]`);
    if (!row) return;
    const rect = row.getBoundingClientRect();
    subRects.current.set(i, rect);
    setSub({ index: i, rect });
  };

  useEffect(() => {
    if (!activeKeys || sub) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); move(-1); }
      else if (e.key === 'ArrowRight') {
        const it = entries[active];
        if (it && isItem(it) && it.items && !it.disabled) { e.preventDefault(); e.stopPropagation(); openSub(active); }
        else if (onSide) { e.preventDefault(); e.stopPropagation(); onSide(1); }
      } else if (e.key === 'ArrowLeft') {
        if (onBack) { e.preventDefault(); e.stopPropagation(); onBack(); }
        else if (onSide) { e.preventDefault(); e.stopPropagation(); onSide(-1); }
      } else if (e.key === 'Enter' || e.key === ' ') {
        const it = entries[active];
        if (it && isItem(it) && !it.disabled) {
          e.preventDefault(); e.stopPropagation();
          if (it.items) openSub(active); else onPick(it);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const subShown = subStage.shown === null ? -1 : Number(subStage.shown);
  const subItem = subShown >= 0 ? entries[subShown] : undefined;
  const subEntries = subItem && isItem(subItem) ? subItem.items ?? [] : [];
  const subRect = subShown >= 0 ? subRects.current.get(subShown) ?? null : null;
  return (
    <>
      <div ref={box} role="menu" className={`k-ctx${leaving ? ' k-ctx-leave' : ''}${depth > 0 ? ' k-ctx-sub' : ''}${instant && depth === 0 ? ' k-ctx-instant' : ''}`}
        style={{ left: pos.left, top: pos.top, zoom: zoom !== 1 ? zoom : undefined, visibility: pos.ready ? undefined : 'hidden',
          maxHeight: window.innerHeight / zoom - 12, overflowY: 'auto' }}
        onMouseDown={e => e.preventDefault()} onContextMenu={e => e.preventDefault()}>
        {entries.map((e, i) => e === 'sep'
          ? <div key={'s' + i} className="k-ctx-sep" role="separator" />
          : (
            <button key={i} type="button" role={e.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'} data-ctx-i={i} disabled={e.disabled}
              aria-checked={e.checked} data-tip={e.tip}
              className={`k-ctx-item${active === i ? ' k-ctx-item-on' : ''}`}
              aria-haspopup={e.items ? 'menu' : undefined} aria-expanded={e.items ? sub?.index === i : undefined}
              onMouseEnter={() => {
                setActive(i);
                window.clearTimeout(subTimer.current);
                if (e.items && !e.disabled) subTimer.current = window.setTimeout(() => openSub(i), 120);
                else if (sub) subTimer.current = window.setTimeout(() => setSub(null), 160);
              }}
              onClick={() => { if (e.disabled) return; if (e.items) openSub(i); else onPick(e); }}>
              <span className="k-ctx-icon">{e.icon ? <e.icon size={15} /> : e.checked ? <Check size={15} /> : null}</span>
              <span className="k-ctx-label">{e.label}</span>
              {e.hint && <span className="k-ctx-hint">{e.hint}</span>}
              {e.checked && e.icon && <Check size={14} className="k-ctx-check" />}
              {e.items && <ChevronRight size={13} className="k-ctx-more" />}
            </button>
          ))}
      </div>
      {subEntries.length > 0 && subRect && (
        <MenuBox key={'sub' + subShown} entries={subEntries} x={0} y={0} zoom={zoom} leaving={leaving || subStage.leaving} flyFrom={subRect} depth={depth + 1}
          onPick={onPick} activeKeys={activeKeys && !subStage.leaving} onBack={() => setSub(null)} />
      )}
    </>
  );
};

const PromptBox: React.FC<{ p: MenuPrompt; x: number; y: number; zoom: number; leaving: boolean }> = ({ p, x, y, zoom, leaving }) => {
  const [text, setText] = useState(p.initial ?? '');
  const box = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  const sent = useRef(false);
  useLeave(box, leaving, 'menu', LEAVE_MS);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = window.innerWidth / zoom, vh = window.innerHeight / zoom;
    setPos({ left: Math.max(6, Math.min(x, vw - 6 - w)), top: Math.max(6, Math.min(y, vh - 6 - h)), ready: true });
    input.current?.focus();
    input.current?.select();
  }, [x, y, zoom]);
  const clean = text.trim();
  return (
    <form ref={box} className={`k-ctx k-ctx-prompt${leaving ? ' k-ctx-leave' : ''}`}
      style={{ left: pos.left, top: pos.top, zoom: zoom !== 1 ? zoom : undefined, visibility: pos.ready ? undefined : 'hidden' }}
      onSubmit={e => { e.preventDefault(); if (sent.current || leaving) return; if (clean === '' && !p.initial) return; sent.current = true; p.onSubmit(clean); closeContextMenu(); }}>
      <div className="k-ctx-prompt-title">{p.title}</div>
      <div className="k-ctx-prompt-row">
        <input ref={input} className="k-field k-ctx-prompt-input" value={text} maxLength={p.maxLength} placeholder={p.placeholder}
          onChange={e => setText(e.target.value)} spellCheck={false} />
        <button type="submit" className="k-btn k-btn-primary k-btn-sm" disabled={clean === '' && !p.initial}>{p.submit}</button>
      </div>
    </form>
  );
};

export const ContextMenuHost: React.FC = () => {
  const s = useSyncExternalStore(subscribe, getState, getState);
  const dropTextOver = () => { if (_state.textOver) { setMenu({ ..._state, textOver: null }); return true; } return false; };
  useEscapeOwner(() => { if (!dropTextOver()) closeContextMenu(); }, s.open && !s.leaving);
  if (!s.open) return null;
  const pick = (it: MenuItem) => {
    if (it.prompt) { setMenu({ ..._state, prompt: it.prompt }); return; }
    closeContextMenu();
    it.onSelect?.();
  };
  const pickText = (it: MenuItem) => { setMenu({ ..._state, textOver: null }); it.onSelect?.(); };
  return createPortal(
    <>
      <div className="fixed inset-0 z-[10000]" onPointerDown={() => { if (!dropTextOver()) closeContextMenu(); }}
        onContextMenu={e => {
          e.preventDefault();
          const x = e.clientX, y = e.clientY;
          const layer = e.currentTarget;
          closeContextMenu();
          const under = document.elementsFromPoint(x, y).find(el => el !== layer && !el.closest('.k-ctx') && !layer.contains(el));
          if (under) window.setTimeout(() => under.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 })), 0);
        }} />
      <div className="fixed inset-0 z-[10001] pointer-events-none" key={s.key}>
        <div className="pointer-events-auto">
          {s.prompt
            ? <PromptBox p={s.prompt} x={s.x} y={s.y} zoom={s.zoom} leaving={s.leaving} />
            : <MenuBox entries={s.entries} x={s.x} y={s.y} zoom={s.zoom} leaving={s.leaving} depth={0} onPick={pick} activeKeys={!s.leaving} />}
          {s.prompt && s.textOver && (
            <MenuBox key={'t' + s.textOver.x + ',' + s.textOver.y} entries={s.textOver.entries} x={s.textOver.x} y={s.textOver.y} zoom={s.zoom}
              leaving={s.leaving} depth={1} onPick={pickText} activeKeys={!s.leaving} />
          )}
        </div>
      </div>
    </>,
    document.body,
  );
};
