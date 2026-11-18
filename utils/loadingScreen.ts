import { isTouchScreen } from './device';
import { motionOff } from '../components/kit/presence';

export const LOAD_IN_MS = 150;
export const LOAD_OUT_MS = 120;
export const STEADY_GAP_MS = 100;
export const STEADY_FRAMES = 3;
export const READY_CAP_MS = 6000;
export const HOLD_CAP_MS = 30000;
const PAINT_CAP_MS = 600;

export interface LoadingView { title: string; tip: string }

export const LOADING_TIPS: readonly { text: string; keys?: true }[] = [
  { text: 'Tip: Kill players and polygons to get more score.' },
  { text: 'Tip: Press T to see every class in the class tree.', keys: true },
  { text: 'Tip: Press Enter to chat.', keys: true },
  { text: 'Tip: You can change the size of the interface in App Settings.' },
  { text: 'Tip: You can play the game in light or dark mode, in App Settings.' },
  { text: 'Tip: If the game runs slowly, try a lower Render Quality in App Settings.' },
];

export function loadingTips(touch: boolean): readonly string[] {
  return LOADING_TIPS.filter(t => !(touch && t.keys)).map(t => t.text);
}

let _tipAt = -1;
function nextTip(touch: boolean): string {
  const list = loadingTips(touch);
  if (_tipAt < 0) {
    let r = Date.now();
    try { const a = new Uint32Array(1); crypto.getRandomValues(a); r = a[0]; } catch { }
    _tipAt = r % list.length;
  } else _tipAt = (_tipAt + 1) % list.length;
  return list[_tipAt % list.length];
}

let _view: LoadingView | null = null;
let _leaving = false;
let _gen = 0;
let _painted: (() => void) | null = null;
let _holdTimer = 0;
const _subs = new Set<() => void>();
const notify = (): void => { for (const f of _subs) f(); };

export function subscribeLoading(f: () => void): () => void { _subs.add(f); return () => { _subs.delete(f); }; }
export function loadingView(): LoadingView | null { return _view; }
export function loadingLeaving(): boolean { return _leaving; }

const raf = (f: (t: number) => void): void => { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(f); else setTimeout(() => f(performance.now()), 16); };

export function showLoading(view?: Partial<LoadingView>): Promise<void> {
  const gen = ++_gen;
  const was = _view !== null && !_leaving;
  _view = { title: view?.title ?? 'Loading...', tip: view?.tip ?? nextTip(isTouchScreen()) };
  _leaving = false;
  if (_holdTimer) window.clearTimeout(_holdTimer);
  _holdTimer = window.setTimeout(() => { if (gen === _gen) hideLoading(); }, HOLD_CAP_MS);
  notify();
  return new Promise<void>(resolve => {
    let done = false;
    const go = (): void => { if (done) return; done = true; _painted = null; resolve(); };
    if (was) { go(); return; }
    const fade = motionOff() ? 0 : LOAD_IN_MS;
    let paintedAt = 0;
    _painted = () => { paintedAt = performance.now(); };
    const t0 = performance.now();
    const wait = (): void => {
      if (gen !== _gen) { go(); return; }
      const now = performance.now();
      if ((paintedAt > 0 && now - t0 >= fade) || now - t0 >= PAINT_CAP_MS + fade) { go(); return; }
      raf(wait);
    };
    raf(wait);
  });
}

export function loadingPainted(): void { if (_painted) _painted(); }

export function loadingReady(): void {
  if (_view === null || _leaving) return;
  const gen = _gen;
  const t0 = performance.now();
  let last = 0, steady = 0;
  const step = (t: number): void => {
    if (gen !== _gen || _view === null || _leaving) return;
    if (last > 0) { if (t - last <= STEADY_GAP_MS) steady++; else steady = 0; }
    last = t;
    if (steady >= STEADY_FRAMES || performance.now() - t0 >= READY_CAP_MS) { leave(gen); return; }
    raf(step);
  };
  raf(step);
}

function leave(gen: number): void {
  if (gen !== _gen || _view === null) return;
  if (_holdTimer) { window.clearTimeout(_holdTimer); _holdTimer = 0; }
  _leaving = true;
  notify();
  window.setTimeout(() => { if (gen !== _gen) return; _view = null; _leaving = false; notify(); }, motionOff() ? 0 : LOAD_OUT_MS);
}

export function hideLoading(): void {
  if (_view === null) return;
  leave(_gen);
}
