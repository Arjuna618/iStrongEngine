import { getBrowserZoomFactor } from './zoomCompensation';

export const safeInsets = { l: 0, t: 0, r: 0, b: 0 };
let _probe: HTMLDivElement | null = null;
let _installed = false;
let _cover = false;
const _subs = new Set<() => void>();

function _px(v: string): number { const n = parseFloat(v); return n > 0 ? n : 0; }

export function readSafeInsets(): typeof safeInsets {
  if (typeof document === 'undefined' || !document.body) return safeInsets;
  if (!_probe) {
    _probe = document.createElement('div');
    _probe.setAttribute('aria-hidden', 'true');
    _probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(_probe);
  }
  const cs = getComputedStyle(_probe);
  const z = getBrowserZoomFactor() || 1;
  const l = _px(cs.paddingLeft) * z, t = _px(cs.paddingTop) * z, r = _px(cs.paddingRight) * z, b = _px(cs.paddingBottom) * z;
  if (l !== safeInsets.l || t !== safeInsets.t || r !== safeInsets.r || b !== safeInsets.b) {
    safeInsets.l = l; safeInsets.t = t; safeInsets.r = r; safeInsets.b = b;
    for (const f of _subs) f();
  }
  return safeInsets;
}

export function subscribeSafeArea(f: () => void): () => void { _subs.add(f); return () => { _subs.delete(f); }; }

function _install(): void {
  if (_installed || typeof window === 'undefined') return;
  _installed = true;
  window.addEventListener('resize', () => { readSafeInsets(); }, { capture: true, passive: true });
  window.addEventListener('orientationchange', () => { readSafeInsets(); }, { passive: true });
}

export function setPageCover(on: boolean): void {
  if (typeof document === 'undefined') return;
  _install();
  if (on === _cover) return;
  _cover = on;
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const c = (meta.getAttribute('content') || '').split(',').map(s => s.trim()).filter(s => s && !/^viewport-fit\s*=/.test(s));
    if (on) c.push('viewport-fit=cover');
    meta.setAttribute('content', c.join(', '));
  }
  readSafeInsets();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { readSafeInsets(); });
}

export function pageCover(): boolean { return _cover; }
