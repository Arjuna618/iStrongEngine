import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'components', 'maps', 'mazePictures.generated.json');
const OUT_MODES = path.join(ROOT, 'components', 'maps', 'modePictures.generated.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'istrong-mappics-'));
const bundle = path.join(tmp, 'mapPicData.mjs');
const bundleModes = path.join(tmp, 'modeCardBuild.mjs');

function standInPage() {
  const G = globalThis;
  const kept = { random: Math.random, now: Date.now, perf: G.performance };
  const noop = () => {};
  if (!G.window) G.window = { innerWidth: 2560, innerHeight: 1440, devicePixelRatio: 1, addEventListener: noop, removeEventListener: noop, requestAnimationFrame: () => 0, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }), location: { search: '' } };
  if (!G.document) G.document = { createElement: () => ({ getContext: () => null, style: {}, addEventListener: noop }), addEventListener: noop, removeEventListener: noop, documentElement: { style: { setProperty: noop }, classList: { contains: () => false, add: noop, remove: noop, toggle: noop } }, body: { appendChild: noop } };
  if (!G.navigator) Object.defineProperty(G, 'navigator', { value: { userAgent: 'node', hardwareConcurrency: 8 }, configurable: true });
  if (!G.requestAnimationFrame) G.requestAnimationFrame = () => 0;
  if (!G.localStorage) G.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  let clock = 1000;
  Object.defineProperty(G, 'performance', { value: { now: () => (clock += 0.002), mark: noop, measure: noop }, configurable: true, writable: true });
  Date.now = () => 1790467200000 + Math.floor(clock);
  let s = 0;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const reseed = () => { s = 20261108; clock = 1000; };
  const restore = () => { Math.random = kept.random; Date.now = kept.now; Object.defineProperty(G, 'performance', { value: kept.perf, configurable: true, writable: true }); };
  return { reseed, restore };
}

function tankLibrary() {
  const dir = path.join(ROOT, 'Data', 'Tanks');
  const lib = [];
  if (!fs.existsSync(dir)) return lib;
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (d.type === 'Tank') lib.push({ id: `data-data/Tanks/${f}`, name: d.name, fileData: d, loadedAt: 0, source: 'data-library' });
    } catch { }
  }
  return lib;
}

try {
  await build({
    entryPoints: [path.join(ROOT, 'components', 'maps', 'mapPicData.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'node18', outfile: bundle, logLevel: 'error',
    tsconfig: path.join(ROOT, 'tsconfig.json'),
  });
  await build({
    entryPoints: [path.join(ROOT, 'components', 'maps', 'modeCardBuild.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'node18', outfile: bundleModes, logLevel: 'error',
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    loader: { '.webp': 'empty', '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty' },
  });
  const { buildMazePictures } = await import(pathToFileURL(bundle).href);
  const t0 = Date.now();
  const file = buildMazePictures();
  const text = '{"format":' + file.format + ',"seed":' + file.seed + ',"maps":[\n' + file.maps.map((m) => JSON.stringify(m)).join(',\n') + '\n]}\n';
  const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (before !== text) fs.writeFileSync(OUT, text);
  console.log(`[mapPictures] ${file.maps.length} maze pictures ${before === text ? 'unchanged' : 'written'} (${Date.now() - t0} ms, ${Math.round(text.length / 1024)} KB)`);
  const t1 = Date.now();
  const lib = tankLibrary();
  const page = standInPage();
  let modes;
  try {
    const { buildModeCardPictures } = await import(pathToFileURL(bundleModes).href);
    modes = buildModeCardPictures(lib, page.reseed);
  } finally { page.restore(); }
  const modesText = '{"format":' + modes.format + ',"seed":' + modes.seed + ',"modes":[\n' + modes.modes.map((m) => JSON.stringify(m)).join(',\n') + '\n],"designs":[\n'
    + (modes.designs ?? []).map((d) => JSON.stringify(d)).join(',\n') + '\n]}\n';
  const modesBefore = fs.existsSync(OUT_MODES) ? fs.readFileSync(OUT_MODES, 'utf8') : '';
  if (modesBefore !== modesText) fs.writeFileSync(OUT_MODES, modesText);
  console.log(`[mapPictures] ${modes.modes.length} mode pictures by the engine, ${(modes.designs ?? []).length} entity designs, ${modesBefore === modesText ? 'unchanged' : 'written'} (${Date.now() - t1} ms, ${Math.round(modesText.length / 1024)} KB)`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
