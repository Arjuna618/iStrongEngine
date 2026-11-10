const G = self as any;

export const realNow: () => number = performance.now.bind(performance);
const _realDate = Date.now.bind(Date);
interface EnvSeed { dpr?: number; w?: number; h?: number }
let seed: EnvSeed = {};
try { seed = JSON.parse(String(G.name || '{}')) as EnvSeed; } catch { seed = {}; }

let _clock = 1000;
const _epoch = _realDate();
export const sceneClock = { advance(ms: number): void { _clock += ms; } };

G.__istrongSceneWorker = true;
G.performance = {
  now: () => (_clock += 0.002),
  timeOrigin: performance.timeOrigin,
  mark() { return undefined; }, measure() { return undefined; }, clearMarks() {}, clearMeasures() {},
  getEntriesByName() { return []; }, getEntriesByType() { return []; }, getEntries() { return []; },
};
Date.now = () => _epoch + Math.floor(_clock);

const noop = (): void => {};
const media = () => ({ matches: false, media: '', addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, onchange: null });
G.window = G;
G.innerWidth = seed.w ?? 2560;
G.innerHeight = seed.h ?? 1440;
G.devicePixelRatio = seed.dpr ?? 1;
G.matchMedia = media;
G.screen = { width: G.innerWidth, height: G.innerHeight };
G.Worker = undefined;

export function makeCanvas(w = 1, h = 1): OffscreenCanvas {
  const c = new OffscreenCanvas(w, h) as any;
  c.style = {};
  c.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: c.width, height: c.height, right: c.width, bottom: c.height });
  c.remove = noop;
  c.setAttribute = noop;
  Object.defineProperty(c, 'clientWidth', { get: () => c.width });
  Object.defineProperty(c, 'clientHeight', { get: () => c.height });
  return c;
}
const element = (): any => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, appendChild: noop, removeChild: noop,
  addEventListener: noop, removeEventListener: noop, setAttribute: noop, getContext: () => null, remove: noop });
G.document = {
  createElement: (tag: string) => (String(tag).toLowerCase() === 'canvas' ? makeCanvas() : element()),
  documentElement: { classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, style: { setProperty: noop, removeProperty: noop, getPropertyValue: () => '' } },
  body: element(), head: element(),
  addEventListener: noop, removeEventListener: noop,
  visibilityState: 'visible', hidden: false,
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
};
if (typeof G.HTMLCanvasElement === 'undefined') G.HTMLCanvasElement = OffscreenCanvas;
if (typeof G.Image === 'undefined') G.Image = class { onload: null = null; onerror: null = null; src = ''; width = 0; height = 0; complete = false; addEventListener = noop; removeEventListener = noop; decode() { return Promise.resolve(); } };
const memStore = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
  } as Storage;
};
G.localStorage = memStore();
G.sessionStorage = memStore();
if (typeof G.requestAnimationFrame !== 'function') G.requestAnimationFrame = (f: (t: number) => void) => setTimeout(() => f(realNow()), 16);
if (typeof G.cancelAnimationFrame !== 'function') G.cancelAnimationFrame = (id: number) => clearTimeout(id);
