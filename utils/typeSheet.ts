import { isTouchScreen } from './device';
import { getZoomCompensation } from './zoomCompensation';

export const SHEET_KB_GAP = 12;
export const SHEET_EDGE = 16;
const SHEET_TOP_MIN = 8;
export const SHEET_KB_MIN = 80;

export interface SheetJob {
  box: HTMLInputElement | null;
  label: string;
  start: string;
  placeholder: string;
  inputMode: string;
  numeric: boolean;
  done?: (text: string) => void;
}

let _installed = false;
let _lastTouch = true;
let _job: SheetJob | null = null;
let _field: HTMLInputElement | null = null;
let _keep: HTMLInputElement | null = null;
let _replay = false;
const _subs = new Set<() => void>();
const _notify = (): void => { for (const f of _subs) f(); };

export function subscribeTypeSheet(f: () => void): () => void { _subs.add(f); return () => { _subs.delete(f); }; }
export function typeSheetJob(): SheetJob | null { return _job; }

export function typingFor(t: EventTarget | null): EventTarget | null {
  return t !== null && t === _field && _job !== null && _job.box !== null ? _job.box : t;
}

export function typeSheetOn(): boolean {
  return _installed && _field !== null && _lastTouch && isTouchScreen();
}

export function registerSheetField(el: HTMLInputElement | null): void { _field = el; }

const TEXT_TYPES = new Set(['text', 'search', 'number', 'tel', 'url', 'email', '']);
function isTypingBox(t: EventTarget | null): t is HTMLInputElement {
  if (!(t instanceof HTMLInputElement)) return false;
  return TEXT_TYPES.has(t.type) && !t.readOnly && !t.disabled && !t.closest('[data-no-type-sheet]');
}

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
function textOf(n: Element | null | undefined): string {
  if (!n) return '';
  const own = n.querySelector('.k-row-label-text');
  if (own) return clean(own.textContent);
  let s = '';
  const walk = (e: Node): void => {
    for (const c of Array.from(e.childNodes)) {
      if (c.nodeType === 3) s += c.textContent ?? '';
      else if (c instanceof Element && !c.matches('button, svg, [role="button"], [aria-hidden="true"], .k-row-lead')) walk(c);
    }
  };
  walk(n);
  return clean(s);
}
export function labelOfBox(el: Element | null): string {
  if (!el) return '';
  const aria = clean(el.getAttribute('aria-label'));
  if (aria && aria !== 'Edit Value') return aria;
  const lb = el instanceof HTMLInputElement && el.labels && el.labels.length > 0 ? textOf(el.labels[0]) : '';
  if (lb) return lb;
  const row = el.closest('.k-slider-row, .k-row, .k-row-stack, .k-num');
  const rl = textOf(row?.querySelector('.k-row-label-text, .k-num-label'));
  if (rl) return rl;
  return clean(el.getAttribute('placeholder')) || clean(el.getAttribute('title'));
}

function typeInto(el: HTMLInputElement, v: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function replay(f: () => void): void { _replay = true; try { f(); } finally { _replay = false; } }
function keyTo(el: HTMLElement, type: 'keydown' | 'keyup', key: string): void {
  el.dispatchEvent(new KeyboardEvent(type, { key, code: key, keyCode: key === 'Enter' ? 13 : 0, which: key === 'Enter' ? 13 : 0, bubbles: true, cancelable: true } as KeyboardEventInit));
}

function takeKeyboard(job: SheetJob): void {
  const f = _field;
  if (!f) return;
  f.value = job.start;
  f.setAttribute('inputmode', job.inputMode);
  f.setAttribute('enterkeyhint', 'done');
  if (job.box && job.box.maxLength > 0) f.maxLength = job.box.maxLength; else f.removeAttribute('maxlength');
  f.placeholder = job.placeholder;
  f.focus({ preventScroll: true });
  const n = f.value.length;
  try { f.setSelectionRange(n, n); } catch { }
}

function openForBox(box: HTMLInputElement): void {
  if (_job) endTypeSheet('away');
  const im = box.getAttribute('inputmode') || (box.type === 'number' ? 'decimal' : box.type === 'search' ? 'search' : box.type === 'email' ? 'email' : box.type === 'tel' ? 'tel' : box.type === 'url' ? 'url' : 'text');
  _job = { box, label: labelOfBox(box), start: box.value, placeholder: box.placeholder || '', inputMode: im, numeric: im === 'decimal' || im === 'numeric' || im === 'tel' };
  _keep = box;
  holdSize();
  takeKeyboard(_job);
  _notify();
}

export function openTypeSheet(job: { label: string; start: string; inputMode?: string; done: (text: string) => void }): boolean {
  if (!typeSheetOn()) return false;
  if (_job) endTypeSheet('away');
  const im = job.inputMode ?? 'decimal';
  _job = { box: null, label: job.label, start: job.start, placeholder: '', inputMode: im, numeric: im === 'decimal' || im === 'numeric', done: job.done };
  holdSize();
  takeKeyboard(_job);
  _notify();
  return true;
}

export function sheetTyped(text: string): void {
  const job = _job;
  const b = job?.box;
  if (!job || !b) return;
  if (!b.isConnected) { endTypeSheet('away'); return; }
  replay(() => typeInto(b, text));
  queueMicrotask(() => { const f = _field; if (_job === job && f && b.value !== f.value) f.value = b.value; });
}

export function sheetEnter(): void {
  const job = _job;
  if (!job) return;
  const b = job.box;
  if (b && b.dataset.sheetEnter === 'away') { endTypeSheet('away'); return; }
  if (b && b.isConnected) {
    const f = _field;
    if (f && f.value !== b.value) replay(() => typeInto(b, f.value));
    replay(() => { keyTo(b, 'keydown', 'Enter'); keyTo(b, 'keyup', 'Enter'); });
  }
  endTypeSheet('done');
}

export function endTypeSheet(how: 'done' | 'away' | 'cancel'): void {
  const job = _job;
  if (!job) return;
  const f = _field;
  const text = f ? f.value : job.start;
  _job = null;
  if (job.done) { if (how !== 'cancel') job.done(text); }
  else if (job.box && job.box.isConnected) {
    const b = job.box;
    replay(() => {
      const want = how === 'cancel' ? job.start : text;
      if (b.value !== want) typeInto(b, want);
      b.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
      b.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    });
  }
  _keep = null;
  _notify();
  if (f && document.activeElement === f) {
    requestAnimationFrame(() => requestAnimationFrame(() => { if (_job === null && document.activeElement === f) f.blur(); }));
  }
  releaseSizeSoon();
}

export function sheetFieldLost(to: EventTarget | null, intoWindow: boolean): void {
  if (intoWindow || !_job || (to !== null && to === _job.box)) return;
  endTypeSheet('away');
}

const _kbSeen = new Map<string, number>();
export function keyboardRoom(now: number, land: boolean, numeric: boolean): number {
  const k = (land ? 'l' : 'p') + (numeric ? 'n' : 't');
  if (now >= SHEET_KB_MIN) { if (now > (_kbSeen.get(k) ?? 0)) _kbSeen.set(k, now); return now; }
  return _kbSeen.get(k) ?? (numeric ? _kbSeen.get((land ? 'l' : 'p') + 't') ?? 0 : 0);
}
export function sheetTop(innerH: number, shownTop: number, kb: number, h: number): number {
  if (kb <= 0) return shownTop + SHEET_EDGE;
  return Math.max(shownTop + SHEET_TOP_MIN, innerH - kb - SHEET_KB_GAP - h);
}

type VirtualKeyboardApi = EventTarget & { overlaysContent: boolean; readonly boundingRect: DOMRect };
function vkApi(): VirtualKeyboardApi | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { virtualKeyboard?: VirtualKeyboardApi }).virtualKeyboard ?? null;
}
let _overlay = false;
export function keyboardOverlays(): boolean { return _overlay; }
export function pageFullHeight(): number {
  return _held ? _held.h : window.innerHeight;
}
export function keyboardNow(): number {
  if (typeof window === 'undefined') return 0;
  const k = _overlay ? vkApi() : null;
  if (k) { const r = k.boundingRect; return r && r.height > 0 ? Math.max(0, window.innerHeight - r.y) : 0; }
  const full = pageFullHeight();
  const vv = window.visualViewport;
  const shownBottom = vv ? Math.min(window.innerHeight, vv.offsetTop + vv.height) : window.innerHeight;
  return Math.max(0, full - shownBottom);
}
export function onKeyboardMove(f: () => void): () => void {
  const k = _overlay ? vkApi() : null;
  if (!k) return () => {};
  k.addEventListener('geometrychange', f);
  return () => k.removeEventListener('geometrychange', f);
}

const HOLD_AFTER_MS = 1200;
let _held: { w: number; h: number; rootPx: number; root: HTMLElement | null; wrote: boolean; was: string } | null = null;
let _closing = false;
let _releaseTimer = 0;
function holdSize(): void {
  _closing = false;
  if (_releaseTimer) { clearTimeout(_releaseTimer); _releaseTimer = 0; }
  if (_held || _overlay) return;
  const root = document.querySelector<HTMLElement>('[data-app-root]');
  const comp = getZoomCompensation() || 1;
  _held = { w: window.innerWidth, h: window.innerHeight, rootPx: root ? root.getBoundingClientRect().height / comp : 0, root, wrote: false, was: '' };
}
function releaseSize(tell: boolean): void {
  const h = _held;
  if (!h) return;
  _held = null; _closing = false;
  if (_releaseTimer) { clearTimeout(_releaseTimer); _releaseTimer = 0; }
  if (h.wrote && h.root) h.root.style.height = h.was;
  if (tell && (window.innerWidth !== h.w || window.innerHeight !== h.h)) window.dispatchEvent(new Event('resize'));
}
function releaseSizeSoon(): void {
  if (!_held || _job !== null) return;
  if (window.innerWidth !== _held.w || window.innerHeight >= _held.h - 2) { releaseSize(true); return; }
  _closing = true;
  _releaseTimer = window.setTimeout(() => releaseSize(true), HOLD_AFTER_MS);
}
function onHeldResize(e: Event): void {
  const h = _held;
  if (!h) return;
  if (window.innerWidth !== h.w) { releaseSize(false); return; }
  if (_closing && window.innerHeight >= h.h - 2) { releaseSize(false); return; }
  e.stopImmediatePropagation();
  if (!h.wrote && h.root && h.rootPx > 0) { h.was = h.root.style.height; h.root.style.height = `${h.rootPx}px`; h.wrote = true; }
}

export function installTypeSheet(): void {
  if (_installed || typeof window === 'undefined') return;
  _installed = true;
  const k = vkApi();
  if (k && isTouchScreen()) { try { k.overlaysContent = true; _overlay = k.overlaysContent === true; } catch { _overlay = false; } }
  window.addEventListener('resize', onHeldResize, true);
  window.addEventListener('pointerdown', (e: PointerEvent) => { _lastTouch = e.pointerType !== 'mouse'; }, { capture: true, passive: true });
  window.addEventListener('focusin', (e: FocusEvent) => {
    const t = e.target;
    if (_replay || t === _field || !isTypingBox(t)) return;
    if (_job && _job.box === t) { e.stopImmediatePropagation(); takeKeyboardBack(); return; }
    if (!typeSheetOn()) return;
    openForBox(t);
  }, true);
  const keepOut = (e: FocusEvent): void => { if (!_replay && _keep !== null && e.target === _keep) e.stopImmediatePropagation(); };
  window.addEventListener('blur', keepOut, true);
  window.addEventListener('focusout', keepOut, true);
}
function takeKeyboardBack(): void {
  const f = _field;
  if (f && document.activeElement !== f) f.focus({ preventScroll: true });
}
