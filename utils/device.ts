import { MOBILE_UI } from '../game/mobileSwitch';

export const PHONE_SHORT_SIDE_MAX = 600;

let _coarse: MediaQueryList | null | undefined;
function coarsePointer(): boolean {
  if (_coarse === undefined) {
    try { _coarse = window.matchMedia('(pointer: coarse)'); } catch { _coarse = null; }
  }
  return !!_coarse && _coarse.matches;
}

export function isTouchScreen(): boolean {
  if (typeof window === 'undefined' || MOBILE_UI === 0) return false;
  if (coarsePointer()) return true;
  return isPhoneDevice();
}

export function isPhoneUi(): boolean {
  return MOBILE_UI !== 0 && isPhoneDevice();
}

export function isPhoneDevice(): boolean {
  if (typeof window === 'undefined') return false;
  let touch = coarsePointer();
  if (!touch && typeof navigator !== 'undefined') touch = (navigator.maxTouchPoints || 0) > 0;
  const s = window.screen;
  const shortSide = s ? Math.min(s.width, s.height) : Infinity;
  return touch && shortSide < PHONE_SHORT_SIDE_MAX;
}
