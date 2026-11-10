const KEY = 'istrongBack';
let _installed = false;
let _armed = false;
let _browserAsks = false;
let _letGo = false;
let _menuOpen = false;
let _matchBack: (() => boolean) | null = null;
let _menuBack: (() => void) | null = null;

function _ours(st: unknown): boolean { return !!st && typeof st === 'object' && (st as Record<string, unknown>)[KEY] === 1; }

function _appleTouch(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

export function armBack(): void {
  if (!_installed || _armed || typeof history === 'undefined') return;
  try { history.pushState({ [KEY]: 1 }, ''); _armed = true; } catch { }
}
export function backArmed(): boolean { return _armed; }
export function browserAsks(): boolean { return _browserAsks; }

export function setMatchBack(f: (() => boolean) | null): void { _matchBack = f; }

export function setLeaveWindowOpen(open: boolean): void {
  _menuOpen = open;
  if (!open) armBack();
}

export function letPageGo(): void { _letGo = true; }

function _onPop(): void {
  if (!_armed) return;
  if (_ours(history.state)) return;
  _armed = false;
  if (_matchBack && _matchBack()) { armBack(); return; }
  if (_menuOpen) return;
  if (_browserAsks) { try { history.back(); } catch { } return; }
  if (_menuBack) _menuBack();
}

function _onBeforeUnload(e: BeforeUnloadEvent): void {
  if (_letGo) return;
  e.preventDefault();
  e.returnValue = '';
}

function _onGesture(): void {
  if (!_armed && !_menuOpen && !_browserAsks) armBack();
}

export function installLeaveGuard(menuBack: () => void): void {
  if (_installed || typeof window === 'undefined' || typeof history === 'undefined') return;
  _installed = true;
  _menuBack = menuBack;
  _browserAsks = history.length > 1 && !_ours(history.state) && !_appleTouch();
  _armed = _ours(history.state);
  window.addEventListener('beforeunload', _onBeforeUnload);
  window.addEventListener('popstate', _onPop);
  window.addEventListener('pointerup', _onGesture, { capture: true, passive: true });
}
