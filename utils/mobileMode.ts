import { MOBILE_ARRAS } from '../game/mobileSwitch';

let _eligible: boolean | null = null;
let _touchLast = true;
let _installed = false;
let _version = 0;
const _subs = new Set<() => void>();

export function mobileEligible(): boolean {
  if (_eligible !== null) return _eligible;
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof navigator === 'undefined') return (_eligible = false);
  const ua = navigator.userAgent || '';
  const touchBody = !!document.body && 'ontouchstart' in document.body;
  const arras = touchBody && /android|mobi/i.test(ua);
  const ipad = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
  return (_eligible = arras || ipad);
}

function _notify(): void { _version++; for (const f of _subs) f(); }
function _setTouch(t: boolean): void { if (t === _touchLast) return; _touchLast = t; _notify(); }

function _isGameKey(e: KeyboardEvent): boolean {
  const c = e.code;
  if (!c || c === 'Unidentified') return false;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return false;
  return true;
}

function _install(): void {
  if (_installed || typeof window === 'undefined') return;
  _installed = true;
  try { document.documentElement.style.overscrollBehavior = 'none'; document.body.style.overscrollBehavior = 'none'; } catch { }
  const onPointer = (e: PointerEvent) => { if (e.pointerType === 'mouse' && (e.type === 'pointerdown' || e.movementX !== 0 || e.movementY !== 0)) _setTouch(false); };
  window.addEventListener('pointermove', onPointer, { capture: true, passive: true });
  window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
  window.addEventListener('touchstart', () => _setTouch(true), { capture: true, passive: true });
  window.addEventListener('keydown', (e: KeyboardEvent) => { if (_isGameKey(e)) _setTouch(false); }, { capture: true, passive: true });
}

export function mobileActive(): boolean {
  if (MOBILE_ARRAS === 0) return false;
  if (!mobileEligible()) return false;
  _install();
  return _touchLast;
}

export function subscribeMobile(f: () => void): () => void { _subs.add(f); return () => { _subs.delete(f); }; }
export function mobileVersion(): number { return _version; }

export const mobHud = {
  tileRows: 0, tileRowsTarget: 0, skillShown: 0, y3: 25, ySkill: 25, mmW: 200, stickK: 1, hudDrag: 0, viewW: 0, viewH: 0,
  tileP: 0, tileTarget: 0, tileColY: 0, skillTarget: 0, skillReach: false, boardRows: 0, menuBottom: 0,
  boardTop: 23, boardB: 1, boardN: 10, boardHide: false,
};
const _stickSubs = new Set<() => void>();
export function subscribeMobSticks(f: () => void): () => void { _stickSubs.add(f); return () => { _stickSubs.delete(f); }; }
export function mobSticksChanged(): void { for (const f of _stickSubs) f(); }
export function mobHudDragDown(): void { mobHud.hudDrag++; }
export function mobHudDragUp(): void { if (mobHud.hudDrag > 0) mobHud.hudDrag--; }
const _tileSubs = new Set<() => void>();
const _y3Subs = new Set<() => void>();
export function subscribeMobTiles(f: () => void): () => void { _tileSubs.add(f); return () => { _tileSubs.delete(f); }; }
export function mobTilesChanged(): void { for (const f of _tileSubs) f(); }
export function subscribeMobY3(f: () => void): () => void { _y3Subs.add(f); return () => { _y3Subs.delete(f); }; }
export function mobY3Changed(): void { for (const f of _y3Subs) f(); }
export const mobKeys = { open: false };
const _keysSubs = new Set<() => void>();
export function subscribeMobKeys(f: () => void): () => void { _keysSubs.add(f); return () => { _keysSubs.delete(f); }; }
export function setMobKeysOpen(open: boolean): void {
  if (mobKeys.open === open) return;
  mobKeys.open = open;
  for (const f of _keysSubs) f();
}
