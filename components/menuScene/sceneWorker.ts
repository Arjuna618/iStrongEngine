import { realNow, sceneClock, makeCanvas } from './sceneWorkerEnv';
import { GameLogic } from '../../game/GameLogic';
import { INITIAL_GAME_STATE, type DataPackList, type LibraryItem, type FoodShapeDesign } from '../../types';
import { DataRegistry } from '../../game/DataRegistry';
import { WebGLBulletRenderer } from '../../game/WebGLRenderer';
import { renderSceneFrame, renderSceneDone } from '../GameCanvas';
import { setPhotoHide } from '../../game/photoMode';
import { setPhotoGameTheme } from '../../utils/gameTheme';
import { makeScene, pickScene, type ScenePick } from './sceneMaker';
import type { CamPlan } from './cameraPlan';
import type { FromWorker, ScenePlan, SceneView, ToWorker } from './sceneProtocol';

const post = (m: FromWorker, transfer: Transferable[] = []): void => (self as unknown as Worker).postMessage(m, transfer);

let list: DataPackList | null = null;
const packs = new Map<string, ArrayBuffer>();
let lib: { rows: LibraryItem[]; others: LibraryItem[]; turretPresets: any[]; projectileDesigns: any[]; foodShapes: FoodShapeDesign[]; tanks: number } | null = null;
const dec = new TextDecoder();
const NL = 10;
const HEAD = '{"path":"';

function indexPack(buf: ArrayBuffer, out: Map<string, { u8: Uint8Array; a: number; b: number }>): void {
  const u8 = new Uint8Array(buf);
  let a = 0;
  for (let i = 0; i <= u8.length; i++) {
    if (i < u8.length && u8[i] !== NL) continue;
    let b = i;
    while (b > a && (u8[b - 1] === 44 || u8[b - 1] === 13 || u8[b - 1] === 32)) b--;
    if (b - a > 12 && u8[a] === 123 && u8[a + 1] === 34 ) {
      const head = dec.decode(u8.subarray(a, Math.min(b, a + 400)));
      if (head.startsWith(HEAD)) {
        const end = head.indexOf('"', HEAD.length);
        if (end > 0) out.set(head.slice(HEAD.length, end), { u8, a, b });
      }
    }
    a = i + 1;
  }
}

function lazyTankRow(path: string, rec: { u8: Uint8Array; a: number; b: number }): LibraryItem | null {
  const head = dec.decode(rec.u8.subarray(rec.a, Math.min(rec.b, rec.a + 1200)));
  const dAt = head.indexOf('"data":');
  if (dAt < 0) return null;
  const top = head.slice(0, dAt);
  if (!/"type":"Tank"/.test(top)) return null;
  const tok = (k: string): unknown => { const m = new RegExp('"' + k + '":("(?:[^"\\\\]|\\\\.)*"|-?[0-9.eE+-]+)').exec(top); try { return m ? JSON.parse(m[1]) : undefined; } catch { return undefined; } };
  const fd: any = { version: tok('version'), type: 'Tank', name: tok('name'), timestamp: tok('timestamp'), category: tok('category') };
  let opened: any = null;
  const open = (): any => {
    if (opened) return opened;
    const rec2 = JSON.parse(dec.decode(rec.u8.subarray(rec.a, rec.b)));
    const file = DataRegistry.validateFileType(rec2.file);
    opened = file ?? rec2.file;
    return opened;
  };
  Object.defineProperty(fd, 'data', { enumerable: true, configurable: true, get() { return open().data; }, set(v) { open().data = v; } });
  return { id: `data-${path}`, name: fd.name, fileData: fd, loadedAt: 0, source: 'data-library' } as LibraryItem;
}

function buildLibrary(): void {
  if (!list || lib) return;
  for (const p of list.packs) if (!packs.has(p.file)) return;
  const idx = new Map<string, { u8: Uint8Array; a: number; b: number }>();
  for (const p of list.packs) indexPack(packs.get(p.file) as ArrayBuffer, idx);
  const rows: LibraryItem[] = [], others: LibraryItem[] = [], turretPresets: any[] = [], projectileDesigns: any[] = [], foodShapes: FoodShapeDesign[] = [];
  let tanks = 0;
  for (const path of list.order) {
    const rec = idx.get(path);
    if (!rec) continue;
    if (path.startsWith('data/Tanks/')) {
      const row = lazyTankRow(path, rec);
      if (row) { rows.push(row); tanks++; continue; }
    }
    let file: any;
    try { file = DataRegistry.validateFileType(JSON.parse(dec.decode(rec.u8.subarray(rec.a, rec.b))).file); } catch { file = null; }
    if (!file) continue;
    const row = { id: file.type === 'FoodShape' ? `shape-${file.data.shapeId}` : `data-${path}`, name: file.name, fileData: file, loadedAt: 0, source: 'data-library' } as LibraryItem;
    if (file.type === 'Other') { others.push(row); continue; }
    rows.push(row);
    if (file.type === 'FoodShape') foodShapes.push(file.data);
    else if (file.type === 'TurretPreset') turretPresets.push(file.data);
    else if (file.type === 'CustomProjectile') projectileDesigns.push(file.data);
  }
  lib = { rows, others, turretPresets, projectileDesigns, foodShapes, tanks };
  post({ t: 'ready', tanks });
  pump();
}

let gl: WebGLBulletRenderer | null = null;
let glFailed = false;
const recentFamilies: string[] = [];
let lastCategory: string | null = null;
let stepMs = 0;
const PIC_BUDGET = ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 4 ? 6e6 : 9.5e6;

function newLogic(view: SceneView): any {
  const g: any = new GameLogic(JSON.parse(JSON.stringify(INITIAL_GAME_STATE)));
  g.resize(Math.round(view.vpW * view.dpr), Math.round(view.vpH * view.dpr));
  const L = lib!;
  g.updateState({ playerId: 'player-1', tankLibrary: L.rows.slice(), otherLibrary: L.others.slice() });
  g.addTurretPresetBatch(L.turretPresets);
  g.addProjectileDesignBatch(L.projectileDesigns);
  for (const d of L.foodShapes) g.registerUserShapeDesign(d);
  if (!gl && !glFailed) { gl = new WebGLBulletRenderer(); if (!gl.init()) { gl = null; glFailed = true; } }
  g.webglRenderer = gl;
  return g;
}

const breathe = (): Promise<void> => new Promise(r => setTimeout(r, 0));

async function make(view: SceneView, spare: boolean, only?: string): Promise<{ plan: ScenePlan; canvasLight: OffscreenCanvas; canvasDark: OffscreenCanvas; makeMs: number; pick: ScenePick }> {
  const t0 = realNow();
  const pick = pickScene(Math.random, recentFamilies, lastCategory, only);
  if (!spare) {
    recentFamilies.unshift(pick.family); recentFamilies.length = Math.min(recentFamilies.length, 6);
    lastCategory = pick.category;
  }
  const g = newLogic(view);
  const vpDW = Math.round(view.vpW * view.dpr), vpDH = Math.round(view.vpH * view.dpr);
  const gen = makeScene(g, pick, sceneClock, { runMs: 900, stepMs }, realNow, Math.random, { vpW: vpDW, vpH: vpDH, hole: view.hole });
  let r = gen.next();
  let slice = realNow();
  while (!r.done) {
    if (realNow() - slice > 40) { await breathe(); slice = realNow(); }
    r = gen.next();
  }
  const made = r.value;
  if (made.stats.stepMs > 0) stepMs = stepMs > 0 ? stepMs * 0.6 + made.stats.stepMs * 0.4 : made.stats.stepMs;
  const { light, dark, plan } = draw(g, made.cam, view, pick);
  renderSceneDone();
  try { g.exitTestMode?.(); } catch { }
  return { plan, canvasLight: light, canvasDark: dark, makeMs: realNow() - t0, pick };
}

function draw(g: any, cam: CamPlan, view: SceneView, pick: ScenePick): { light: OffscreenCanvas; dark: OffscreenCanvas; plan: ScenePlan } {
  const vpDW = view.vpW * view.dpr;
  const z = vpDW / cam.viewW;
  const fullW = cam.picW * z, fullH = cam.picH * z;
  const s = Math.min(1, Math.sqrt(Math.min(PIC_BUDGET, view.budget ?? PIC_BUDGET) / Math.max(1, fullW * fullH)));
  const pxW = Math.max(16, Math.min(16000, Math.ceil(fullW * s))), pxH = Math.max(16, Math.min(16000, Math.ceil(fullH * s)));
  g.resize(pxW, pxH);
  g.zoom = z * s;
  g.cameraX = cam.picX0 + cam.picW / 2;
  g.cameraY = cam.picY0 + cam.picH / 2;
  const shot = (theme: 'light' | 'dark'): OffscreenCanvas => {
    const c = makeCanvas(pxW, pxH);
    const ctx = c.getContext('2d', { alpha: false }) as unknown as CanvasRenderingContext2D;
    setPhotoGameTheme(theme);
    setPhotoHide(true);
    try { renderSceneFrame(ctx, g); } finally { setPhotoHide(false); }
    return c;
  };
  const light = shot('light'), dark = shot('dark');
  setPhotoGameTheme(null);
  const css = z / view.dpr;
  const toX = (wx: number) => (wx - cam.picX0) * css, toY = (wy: number) => (wy - cam.picY0) * css;
  const plan: ScenePlan = {
    key: pick.key, title: pick.title,
    cssW: cam.picW * css, cssH: cam.picH * css, pxW, pxH,
    cx0: toX(cam.x0), cy0: toY(cam.y0), cx1: toX(cam.x0 + cam.vx * cam.extS), cy1: toY(cam.y0 + cam.vy * cam.extS),
    durMs: cam.durS * 1000, extMs: cam.extS * 1000,
    vpW: view.vpW, vpH: view.vpH,
  };
  return { light, dark, plan };
}

async function thumbOf(c: OffscreenCanvas): Promise<Blob> {
  const w = 192, h = Math.max(8, Math.round((c.height / c.width) * w));
  const t = new OffscreenCanvas(w, h);
  const tc = t.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D;
  tc.imageSmoothingQuality = 'high';
  tc.drawImage(c, 0, 0, w, h);
  return t.convertToBlob({ type: 'image/webp', quality: 0.7 });
}

const DB = 'istrong-menu-scenes', STORE = 'spare', SPARE_KEY = 'next';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function spareHas(page: string): Promise<boolean> {
  const d = await db();
  return new Promise((res) => {
    const tx = d.transaction(STORE, 'readonly');
    const g = tx.objectStore(STORE).get(SPARE_KEY);
    g.onsuccess = () => res(!!g.result && g.result.page === page);
    g.onerror = () => res(false);
    tx.oncomplete = () => d.close();
  });
}
async function spareSet(v: unknown): Promise<void> {
  const d = await db();
  await new Promise<void>((res) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(v, SPARE_KEY);
    tx.oncomplete = () => { d.close(); res(); };
    tx.onerror = () => { d.close(); res(); };
  });
}

type Job = { t: 'make'; id: number; view: SceneView; spare: boolean; only?: string; page: string } | { t: 'export'; id: number; view: SceneView; only?: string };
const jobs: Job[] = [];
let busy = false;
let parked = false;

async function run(job: Job): Promise<void> {
  if (!lib) { jobs.unshift(job); return; }
  try {
    if (job.t === 'export') {
      const m = await make(job.view, true, job.only);
      const [light, dark, thumbLight, thumbDark] = await Promise.all([
        m.canvasLight.convertToBlob({ type: 'image/webp', quality: 0.84 }), m.canvasDark.convertToBlob({ type: 'image/webp', quality: 0.84 }),
        thumbOf(m.canvasLight), thumbOf(m.canvasDark)]);
      post({ t: 'exported', id: job.id, plan: m.plan, light, dark, thumbLight, thumbDark });
      return;
    }
    if (job.spare) {
      try { if (await spareHas(job.page)) { post({ t: 'spareSaved', id: job.id }); return; } } catch { post({ t: 'spareSaved', id: job.id }); return; }
    }
    const m = await make(job.view, job.spare, job.only);
    if (job.spare) {
      const [lb, db2] = await Promise.all([m.canvasLight.convertToBlob({ type: 'image/webp', quality: 0.9 }), m.canvasDark.convertToBlob({ type: 'image/webp', quality: 0.9 })]);
      await spareSet({ page: job.page, dpr: job.view.dpr, plan: m.plan, light: lb, dark: db2, made: Date.now() });
      post({ t: 'spareSaved', id: job.id });
      return;
    }
    const light = m.canvasLight.transferToImageBitmap(), dark = m.canvasDark.transferToImageBitmap();
    post({ t: 'scene', id: job.id, plan: m.plan, light, dark, makeMs: m.makeMs }, [light, dark]);
  } catch (e) {
    post({ t: 'failed', id: job.id, why: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}

async function pump(): Promise<void> {
  if (busy || parked) return;
  busy = true;
  try {
    while (jobs.length > 0 && !parked) {
      if (!lib) break;
      const j = jobs.shift() as Job;
      await run(j);
    }
  } finally { busy = false; }
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  switch (m.t) {
    case 'list': list = m.list; buildLibrary(); return;
    case 'pack': packs.set(m.file, m.bytes); buildLibrary(); return;
    case 'make':
      for (let i = jobs.length - 1; i >= 0; i--) { const j = jobs[i]; if (j.t === 'make' && j.spare === m.spare) jobs.splice(i, 1); }
      jobs.push(m);
      pump();
      return;
    case 'export': jobs.push(m); pump(); return;
    case 'park': {
      parked = true;
      jobs.length = 0;
      const out: { file: string; bytes: ArrayBuffer }[] = [];
      for (const [file, bytes] of packs) out.push({ file, bytes });
      post({ t: 'parked', list, packs: out }, out.map(p => p.bytes));
      self.close();
      return;
    }
  }
};
