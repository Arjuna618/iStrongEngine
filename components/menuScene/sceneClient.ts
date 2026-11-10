import { DataRegistry } from '../../game/DataRegistry';
import type { DataPackList } from '../../types';
import { isPhoneDevice } from '../../utils/device';
import { MOBILE_UI } from '../../game/mobileSwitch';

const phoneLeftOut = (): boolean => MOBILE_UI === 0 && isPhoneDevice();
const PHONE_PIC_BUDGET = 3e6;
import { getEffectiveDPR } from '../../utils/zoomCompensation';
import { MENU_SCENES, MENU_SCENES_OLD, MENU_SCENE_ONLY } from './menuSceneSwitch';
import type { FromWorker, ScenePlan, SceneView, ToWorker } from './sceneProtocol';
import { motionOff } from '../kit/presence';
import { SMALL_FIX } from '../../game/smallFixSwitch';

const GLASS_IN_MS = 380;
const SWAP_MS = 200;
const GLASS_OUT_MS = 620;
const FIRST_OUT_MS = 900;
const RESUME_MIN_MS = 6000;

let _supported: boolean | null = null;
export function menuScenesSupported(): boolean {
  if (_supported !== null) return _supported;
  _supported = false;
  if (!MENU_SCENES.ON || MENU_SCENES_OLD || typeof window === 'undefined' || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined'
    || typeof createImageBitmap === 'undefined' || phoneLeftOut() || window.location.search.includes('__harness')) return false;
  if (((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) < 3) return false;
  try {
    const c = new OffscreenCanvas(1, 1);
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { return false; }
  _supported = true;
  return true;
}

let _status: 'on' | 'off' = 'on';
const _subs = new Set<() => void>();
export const menuSceneStatus = {
  get: (): 'on' | 'off' => _status,
  subscribe(fn: () => void): () => void { _subs.add(fn); return () => { _subs.delete(fn); }; },
};
function fail(): void {
  if (_status === 'off') return;
  _status = 'off';
  const b = boot();
  if (b) b.cancelled = true;
  if (current) { drop(current); current = null; }
  document.documentElement.classList.remove('k-msc-on');
  stopWorker(false);
  _subs.forEach(f => f());
}

interface BootScene { el: HTMLDivElement; anim: Animation; plan: ScenePlan; kind: 'premade' | 'spare'; shownAt: number }
interface BootApi { scene: BootScene | null; onShown: ((s: BootScene) => void) | null; cancelled: boolean; glassAnim: Animation | null }
const boot = (): BootApi | null => (typeof window !== 'undefined' ? ((window as unknown as { __mscBoot?: BootApi }).__mscBoot ?? null) : null);

let _list: DataPackList | null = null;
const _packs = new Map<string, ArrayBuffer>();
if (MENU_SCENES.ON && !MENU_SCENES_OLD && typeof window !== 'undefined' && !phoneLeftOut() && !window.location.search.includes('__harness')) {
  DataRegistry.packListTap = (l) => { _list = l; if (worker) post({ t: 'list', list: l }); };
  DataRegistry.packTap = (file, bytes) => {
    if (worker && !_parking) post({ t: 'pack', file, bytes }, [bytes]);
    else _packs.set(file, bytes);
  };
}

let worker: Worker | null = null;
let _parking = false;
let _nextId = 1;
function post(m: ToWorker, transfer: Transferable[] = []): void { worker?.postMessage(m, transfer); }
const PAGE: string = typeof document !== 'undefined' ? (document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? '') : '';

function startWorker(): void {
  if (worker || _parking || _status === 'off') return;
  try {
    worker = new Worker(new URL('./sceneWorker.ts', import.meta.url), { type: 'module', name: 'menu-scenes' });
  } catch { fail(); return; }
  worker.onmessage = (e: MessageEvent<FromWorker>) => onWorker(e.data);
  worker.onerror = () => fail();
  if (_list) post({ t: 'list', list: _list });
  for (const [file, bytes] of _packs) post({ t: 'pack', file, bytes }, [bytes]);
  _packs.clear();
}
function stopWorker(keep: boolean): void {
  if (!worker) return;
  if (keep) { _parking = true; post({ t: 'park' }); return; }
  worker.terminate();
  worker = null;
  _parking = false;
  _asked = null; _spareAsked = false;
}

interface Shown {
  plan: ScenePlan;
  el: HTMLDivElement;
  anim: Animation | null;
  kind: 'live' | 'spare' | 'premade';
  endAt: number; left: number;
}
interface Host { root: HTMLElement; stage: HTMLElement; glass: HTMLElement }
let host: Host | null = null;
let current: Shown | null = null;
let ready: { plan: ScenePlan; light: ImageBitmap; dark: ImageBitmap; makeMs: number } | null = null;
let _asked: number | null = null;
let _spareAsked = false;
let _attached = false;
let _menuReady = false;
let _failures = 0;
let _timer = 0;
let _glassAnim: Animation | null = null;
let _swapping = false;
let _hidden = false;
const reducedMotion = (): boolean => motionOff();

function layer(): Host {
  let root = document.getElementById('k-msc');
  if (!root) {
    root = document.createElement('div');
    root.id = 'k-msc'; root.className = 'k-msc'; root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="k-msc-stage"></div><div class="k-msc-glass"></div>';
    document.body.insertBefore(root, document.body.firstChild);
  }
  return { root, stage: root.firstElementChild as HTMLElement, glass: root.lastElementChild as HTMLElement };
}

function view(): SceneView | null {
  if (!host) return null;
  const w = host.root.clientWidth, h = host.root.clientHeight;
  if (!(w > 50 && h > 50)) return null;
  let hole: { w: number; h: number } | undefined;
  const card = document.querySelector('.k-mm-root .k-mm-card');
  if (card) {
    const r = card.getBoundingClientRect(), o = host.root.getBoundingClientRect();
    if (o.width > 0 && o.height > 0 && r.width > 0) hole = { w: Math.min(0.9, r.width / o.width), h: Math.min(0.9, r.height / o.height) };
  }
  return { vpW: w, vpH: h, dpr: getEffectiveDPR(), hole, budget: MOBILE_UI !== 0 && isPhoneDevice() ? PHONE_PIC_BUDGET : undefined };
}

function askScene(): void {
  if (!worker || _asked !== null || ready || _hidden || !_attached) return;
  const v = view();
  if (!v) return;
  _asked = _nextId++;
  post({ t: 'make', id: _asked, view: v, spare: false, only: MENU_SCENE_ONLY || undefined, page: PAGE });
}
function askSpare(): void {
  if (!worker || _spareAsked || !_attached || MENU_SCENE_ONLY || EXPORT) return;
  const v = view();
  if (!v) return;
  _spareAsked = true;
  post({ t: 'make', id: _nextId++, view: v, spare: true, page: PAGE });
}

function onWorker(m: FromWorker): void {
  switch (m.t) {
    case 'ready': askScene(); return;
    case 'failed':
      if (m.id === _asked) _asked = null;
      if (++_failures >= 3) { fail(); return; }
      askScene();
      return;
    case 'spareSaved':
      try { localStorage.setItem('istrong-msc-spare', JSON.stringify({ page: PAGE })); } catch { }
      return;
    case 'exported': { const f = _exports.get(m.id); _exports.delete(m.id); f?.(m); return; }
    case 'scene': {
      if (m.id !== _asked || !host) { m.light.close(); m.dark.close(); return; }
      _asked = null;
      _failures = 0;
      if (MOBILE_UI !== 0 && wrongShape(m.plan)) { m.light.close(); m.dark.close(); askScene(); return; }
      ready = { plan: m.plan, light: m.light, dark: m.dark, makeMs: m.makeMs };
      if (!current) { if (_attached) show(); }
      else maybeChange();
      return;
    }
    case 'parked': {
      if (m.list) _list = m.list;
      for (const p of m.packs) _packs.set(p.file, p.bytes);
      worker?.terminate();
      worker = null;
      _parking = false;
      _asked = null; _spareAsked = false;
      if (_attached) startWorker();
      return;
    }
  }
}

function layerOf(r: { plan: ScenePlan; light: ImageBitmap; dark: ImageBitmap; makeMs: number }): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'k-msc-scene';
  el.dataset.key = r.plan.key;
  el.dataset.made = String(Math.round(r.makeMs));
  el.style.width = `${r.plan.cssW}px`;
  el.style.height = `${r.plan.cssH}px`;
  for (const [cls, bmp] of [['k-msc-light', r.light], ['k-msc-dark', r.dark]] as const) {
    const c = document.createElement('canvas');
    c.className = cls;
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('bitmaprenderer');
    if (ctx) ctx.transferFromImageBitmap(bmp); else bmp.close();
    el.appendChild(c);
  }
  return el;
}

function drift(s: Shown, startMs: number): void {
  if (!host) return;
  const p = s.plan, w = host.root.clientWidth, h = host.root.clientHeight;
  const cx1 = reducedMotion() ? p.cx0 : p.cx1, cy1 = reducedMotion() ? p.cy0 : p.cy1;
  let k = Math.max(1, w / (p.vpW || w), h / (p.vpH || h));
  for (const [cx, cy] of [[p.cx0, p.cy0], [cx1, cy1]]) {
    k = Math.max(k, (w / 2) / Math.max(1, Math.min(cx, p.cssW - cx)), (h / 2) / Math.max(1, Math.min(cy, p.cssH - cy)));
  }
  const at = (cx: number, cy: number) => `translate3d(${(w / 2 - cx * k).toFixed(2)}px, ${(h / 2 - cy * k).toFixed(2)}px, 0) scale(${k.toFixed(4)})`;
  const paused = s.anim?.playState === 'paused';
  s.anim?.cancel();
  s.anim = s.el.animate([{ transform: at(p.cx0, p.cy0) }, { transform: at(cx1, cy1) }],
    { duration: p.extMs, easing: 'linear', direction: 'alternate', iterations: Infinity });
  s.anim.currentTime = startMs;
  if (paused) s.anim.pause();
}

function glass(on: boolean, msIn: number, done?: () => void): void {
  if (!host) return;
  const ms = reducedMotion() ? 0 : msIn;
  const g = host.glass;
  const b = boot();
  const running = _glassAnim ?? b?.glassAnim ?? null;
  const from = running ? getComputedStyle(g).opacity : (g.classList.contains('k-msc-glass-off') ? '0' : (g.style.opacity || '1'));
  running?.cancel();
  _glassAnim = null;
  if (b) b.glassAnim = null;
  g.classList.remove('k-msc-glass-off');
  if (on && Number(from) >= 0.99) { g.style.opacity = '1'; done?.(); return; }
  g.style.opacity = from;
  const a = g.animate([{ opacity: from }, { opacity: on ? '1' : '0' }], { duration: ms, easing: on ? 'ease-out' : 'ease-in-out', fill: 'forwards' });
  _glassAnim = a;
  a.onfinish = () => {
    g.style.opacity = on ? '1' : '0';
    a.cancel();
    if (_glassAnim === a) _glassAnim = null;
    if (!on) g.classList.add('k-msc-glass-off');
    done?.();
  };
}

const durOf = (p: ScenePlan): number => (reducedMotion() ? Math.max(p.durMs, 16000) : p.durMs);

function adoptBoot(): void {
  const b = boot();
  if (!b || b.cancelled || !host) return;
  const take = (s: BootScene): void => {
    if (current || !host) return;
    current = { plan: s.plan, el: s.el, anim: s.anim, kind: s.kind, endAt: s.shownAt + durOf(s.plan), left: 0 };
    arm();
  };
  if (b.scene) take(b.scene); else b.onShown = take;
}

function show(): void {
  if (!host || !ready) return;
  const b = boot();
  if (b) b.cancelled = true;
  const r = ready; ready = null;
  const el = layerOf(r);
  host.stage.appendChild(el);
  current = { plan: r.plan, el, anim: null, kind: 'live', endAt: performance.now() + durOf(r.plan), left: 0 };
  drift(current, 0);
  glass(false, FIRST_OUT_MS);
  arm();
  askScene();
}

function maybeChange(): void {
  if (!_menuReady || !ready || !current || _swapping || !_attached || _hidden) return;
  if (current.kind === 'premade' || performance.now() >= current.endAt - 5) change();
}

function change(): void {
  if (!host || !ready || !current || _swapping) return;
  _swapping = true;
  glass(true, GLASS_IN_MS, () => {
    if (!host || !ready || !current) { _swapping = false; if (host && SMALL_FIX.R882 !== 0) glass(false, 0); return; }
    const old = current;
    const r = ready; ready = null;
    const el = layerOf(r);
    el.style.opacity = '0';
    host.stage.appendChild(el);
    current = { plan: r.plan, el, anim: null, kind: 'live', endAt: performance.now() + durOf(r.plan), left: 0 };
    drift(current, 0);
    const fade = el.animate([{ opacity: '0' }, { opacity: '1' }], { duration: reducedMotion() ? 0 : SWAP_MS, easing: 'linear', fill: 'forwards' });
    fade.onfinish = () => {
      el.style.opacity = '';
      fade.cancel();
      drop(old);
      _swapping = false;
      glass(false, GLASS_OUT_MS);
      arm();
      askScene();
      if (!_spareAsked) askSpare();
    };
  });
}

function drop(s: Shown): void {
  s.anim?.cancel();
  for (const c of Array.from(s.el.querySelectorAll('canvas'))) { c.width = 0; c.height = 0; }
  for (const im of Array.from(s.el.querySelectorAll('img'))) { if (im.src.startsWith('blob:')) URL.revokeObjectURL(im.src); im.removeAttribute('src'); }
  s.el.remove();
}

function arm(): void {
  if (_timer) { clearTimeout(_timer); _timer = 0; }
  if (!current || _hidden || !_attached) return;
  const wait = current.kind === 'premade' || !ready ? 250 : current.endAt - performance.now();
  _timer = window.setTimeout(tick, Math.max(40, wait));
}
function tick(): void {
  _timer = 0;
  if (!current || !host || !_attached) return;
  maybeChange();
  if (!_swapping) { askScene(); arm(); }
}

function onVisibility(): void {
  const hid = document.hidden;
  if (hid === _hidden) return;
  _hidden = hid;
  if (!current) { if (!hid) askScene(); return; }
  if (hid) freeze(); else thaw(0);
}
function freeze(): void {
  if (_timer) { clearTimeout(_timer); _timer = 0; }
  if (!current) return;
  current.anim?.pause();
  current.left = Math.max(0, current.endAt - performance.now());
}
function thaw(least: number): void {
  if (!current) return;
  current.endAt = performance.now() + Math.max(current.left, least);
  current.anim?.play();
  arm();
  askScene();
}
let _resizeRaf = 0;
function onResize(): void {
  if (_resizeRaf) return;
  _resizeRaf = requestAnimationFrame(() => {
    _resizeRaf = 0;
    if (!current || !current.anim) return;
    drift(current, Number(current.anim.currentTime ?? 0));
    checkTurn();
  });
}

function wrongShape(p: ScenePlan): boolean {
  if (!host) return false;
  const w = host.root.clientWidth, h = host.root.clientHeight;
  if (!(w > 50 && h > 50)) return false;
  return (w > h) !== (p.vpW > p.vpH);
}
function checkTurn(): void {
  if (MOBILE_UI === 0 || !host || !current || _swapping || !wrongShape(current.plan)) return;
  if (ready && wrongShape(ready.plan)) { ready.light.close(); ready.dark.close(); ready = null; }
  if (!ready) _asked = null;
  current.endAt = performance.now();
  if (_attached && !_hidden) glass(true, GLASS_IN_MS);
  askScene();
  arm();
}

const EXPORT = typeof location !== 'undefined' && /[?&]menuexport\b/.test(location.search);
const _exports = new Map<number, (m: FromWorker & { t: 'exported' }) => void>();
if (EXPORT && typeof window !== 'undefined') {
  (window as unknown as { __mscExport?: (only?: string) => Promise<unknown> }).__mscExport = (only?: string) => new Promise((res) => {
    const v = view();
    if (!worker || !v) { res(null); return; }
    const id = _nextId++;
    _exports.set(id, res);
    post({ t: 'export', id, view: v, only });
  });
}

export const menuScenes = {
  attach(): void {
    if (_status === 'off' || !menuScenesSupported()) return;
    document.documentElement.classList.add('k-msc-on');
    host = layer();
    _attached = true;
    host.root.classList.remove('k-msc-away');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    _hidden = document.hidden;
    startWorker();
    if (current) { drift(current, Number(current.anim?.currentTime ?? 0)); thaw(RESUME_MIN_MS); checkTurn(); }
    else {
      adoptBoot();
      if (!current && !boot()?.scene) {
        host.glass.classList.remove('k-msc-glass-off');
        if (!boot()) host.glass.style.opacity = '1';
        if (ready) show();
      }
    }
    askScene();
  },
  detach(): void {
    _attached = false;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
    freeze();
    host?.root.classList.add('k-msc-away');
  },
  showStill(): void {
    if (_status === 'off' || !menuScenesSupported() || _attached) return;
    host?.root.classList.remove('k-msc-away');
  },
  hideStill(): void {
    if (_attached) return;
    host?.root.classList.add('k-msc-away');
  },
  setReady(r: boolean): void {
    _menuReady = r;
    if (r) { maybeChange(); arm(); }
  },
  setScreen(screen: string): void {
    if (screen === 'engine') {
      if (ready) { ready.light.close(); ready.dark.close(); ready = null; }
      _asked = null;
      stopWorker(true);
    }
  },
};
