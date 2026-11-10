import type { GameLogic } from '../GameLogic';
import { DataRegistry } from '../DataRegistry';
import { sanitizeImport, clampShapeSpawnLimits } from '../ValueClamp';
import { SMALL_FIX } from '../smallFixSwitch';
import { GAME_MODE_TITLES } from '../gameModeTitles';
import { MAX_ARENA_TANKS } from '../../types';
import { CMD_ROOM_MAX } from '../chatCommands';
import { clampTankDebuffs } from '../tankDebuffs';
import { cleanHalloweenLook } from '../../utils/halloween';
import { clampGrowthRules } from '../growthRules';
import { STARTING_SCORE_MAX } from '../vampirism';
import { MAP_EDIT_WALL_MIN_CELLS, MAP_EDIT_WALL_MAX_CELLS } from '../MapEditor';
import type { ExportFile, LibraryItem, CustomProjectileDesign, TurretPreset, TankConfig, FoodShapeDesign, OtherDesign } from '../../types';
import type { EngineSnapshot, CanvasData, EnemyConfigData, LibraryData } from './snapshot';
import { canonicalStringify } from './canonical';
import FROZEN_V1 from './defaults.v1.json';
import FROZEN_ENEMIES_V2 from './defaults.enemies.v2.json';
import { ALL_MODES } from '../allModesSwitch';
import { SHAPE_SPAWN_PLAN } from '../shapesSwitch';
import { cleanMapPool } from '../mapPool';

export type SectionId = 'canvas' | 'world' | 'mode' | 'enemies' | 'library' | 'editor' | 'panels';
export const SECTION_IDS: readonly SectionId[] = ['canvas', 'world', 'mode', 'enemies', 'library', 'editor', 'panels'];

export const SECTION_VERSIONS: Record<SectionId, number> = { canvas: 1, world: SHAPE_SPAWN_PLAN !== 0 ? 5 : 3, mode: 1, enemies: 2, library: 1, editor: 1, panels: 1 };

function _enemiesOneToTwo(d: any): any {
  if (ALL_MODES.ON === 0 || !d || typeof d !== 'object') return d;
  const first = (FROZEN_V1 as any).enemies.aiBehaviorCategories, next = (FROZEN_ENEMIES_V2 as any).aiBehaviorCategories;
  const cats = 'aiBehaviorCategories' in d ? structuredClone(d.aiBehaviorCategories) : structuredClone(first);
  if (!cats || !Array.isArray(cats.categories)) return d;
  const known = new Set<string>(); for (const c of first.categories) for (const n of c.tankNames) known.add(n);
  for (const c of cats.categories) if (c && Array.isArray(c.tankNames)) for (const n of c.tankNames) known.add(n);
  for (const c of cats.categories) { const f = c && Array.isArray(c.tankNames) ? next.categories.find((x: any) => x.id === c.id) : null; if (!f) continue; for (const n of f.tankNames) if (!known.has(n)) c.tankNames.push(n); }
  return { ...d, aiBehaviorCategories: cats };
}

export const MIGRATIONS: Record<SectionId, { from: number; up: (data: any) => any }[]> = {
  canvas: [], world: [{ from: 1, up: (d: any) => d }, { from: 2, up: (d: any) => d }, { from: 3, up: (d: any) => d }, { from: 4, up: (d: any) => d }], mode: [], enemies: [{ from: 1, up: _enemiesOneToTwo }], library: [], editor: [], panels: [],
};

type FrozenTable = { world: Record<string, unknown>; mode: Record<string, unknown>; enemies: Record<string, unknown> };
const _v1 = FROZEN_V1 as unknown as FrozenTable;
const _v2 = { ..._v1, world: { ..._v1.world, mapConfig: { ...(_v1.world.mapConfig as Record<string, unknown>), mazeType: 21, rockDensity: 32, rockPattern: 'ffa', rockExclusionZone: false, rockSizeVariation: 30 } } };
const _sv1 = _v1.world.shapeSpawnConfig as { baseShapes: Record<string, Record<string, unknown>>; scaleVariants: Record<string, Record<string, unknown>> };
const FROZEN: Record<number, FrozenTable> = {
  1: _v1,
  2: { ..._v2, enemies: (ALL_MODES.ON !== 0 ? FROZEN_ENEMIES_V2 : _v1.enemies) as Record<string, unknown> },
  3: { ...(ALL_MODES.ON !== 0 ? _v2 : _v1), world: { ...(ALL_MODES.ON !== 0 ? _v2 : _v1).world, shapeSpawnConfig: { ..._sv1,
    baseShapes: { ..._sv1.baseShapes, hexagon: { ..._sv1.baseShapes.hexagon, hp: 2385.2226 }, square: { ..._sv1.baseShapes.square, hp: 46.176 }, triangle: { ..._sv1.baseShapes.triangle, hp: 254.2964 } },
    scaleVariants: { ..._sv1.scaleVariants, alphaPentagon: { ..._sv1.scaleVariants.alphaPentagon, hp: 7663.366, shield: 1043.8033 }, betaPentagon: { ..._sv1.scaleVariants.betaPentagon, hp: 951.7608, shield: 383.3481 }, odHexagon: { ..._sv1.scaleVariants.odHexagon, hp: 16215.3212, shield: 423.2384 }, odNonagon: { ..._sv1.scaleVariants.odNonagon, hp: 41972.6475, shield: 437.6295 }, odOctagon: { ..._sv1.scaleVariants.odOctagon, hp: 31016.7456, shield: 396.972 }, odSeptagon: { ..._sv1.scaleVariants.odSeptagon, hp: 20293.7462, shield: 396.879 } },
  } } },
};
{
  const t3 = FROZEN[3]; const ss3 = t3.world.shapeSpawnConfig as { baseShapes: Record<string, Record<string, unknown>> } & Record<string, unknown>;
  FROZEN[4] = { ...t3, world: { ...t3.world, shapeSpawnConfig: { ...ss3,
    baseShapes: { ...ss3.baseShapes, egg: { ...ss3.baseShapes.egg, spawnWeight: 100 }, square: { ...ss3.baseShapes.square, spawnWeight: 94 }, triangle: { ...ss3.baseShapes.triangle, spawnWeight: 70 },
      pentagon: { ...ss3.baseShapes.pentagon, spawnWeight: 0 }, hexagon: { ...ss3.baseShapes.hexagon, spawnWeight: 0 } },
    shinyChance: 50000, legendaryChance: 1000000, shadowChance: 3000000, rainbowChance: 76000000, transChance: 152000000, polyhedraChance: 570000000,
    plan: { profile: 'ordinary', noFood: false, nestSize: 24, nestShare: 10, nestCap: 15, nestWeights: { pentagon: 100, hexagon: 15 }, tierOneIn: [0, 5.9, 16, 100000, 1000000, 10000000],
      crasherOneIn: 17, nestCrasherOneIn: 30, gemOneIn: 5000000, jewelOneIn: 100000000, eggToGem: false, scaledOneIn: 1000000, relicOneIn: 0, relicWeights: {} },
  } } };
}
{
  const t4 = FROZEN[4]; const ss4 = t4.world.shapeSpawnConfig as { plan: Record<string, unknown> } & Record<string, unknown>;
  FROZEN[5] = { ...t4, world: { ...t4.world, shapeSpawnConfig: { ...ss4,
    plan: { ...ss4.plan, nestPace: 0.74,
      crowd: { on: true, enemyFirst: 1, enemyNext: 0.15, enemyKeep: 0.35, teamFirst: 0.1, teamKeep: 0.3, margin: 50, kinds: { hexagon: 1 } } },
  } } };
}
export function frozenDefaults(version: number) { return FROZEN[version]; }

export interface PanelsData {
  tool: string;
  folds: Record<string, boolean>;
  values: Record<string, unknown>;
  scroll: Record<string, number>;
}

export const EMPTY_PANELS: PanelsData = { tool: 'tank', folds: {}, values: {}, scroll: {} };

function sparse(data: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v === undefined) continue;
    if (k in defaults) {
      try { if (canonicalStringify(v) === canonicalStringify(defaults[k])) continue; } catch { }
    }
    out[k] = v;
  }
  return out;
}

export function libraryBlobObjects(lib: LibraryData): object[] {
  const out: object[] = [];
  for (const it of lib.items) out.push(it.fileData);
  for (const d of lib.designs) out.push(d);
  for (const p of lib.presets) out.push(p);
  return out;
}

export function writeSections(engine: EngineSnapshot, panels: PanelsData, blobOf: (o: object) => string): Record<SectionId, unknown> {
  const f = FROZEN[1];
  return {
    canvas: engine.canvas,
    world: sparse(engine.world as unknown as Record<string, unknown>, FROZEN[SECTION_VERSIONS.world].world),
    mode: sparse(engine.mode as unknown as Record<string, unknown>, f.mode),
    enemies: {
      configs: engine.enemies.configs,
      ...sparse({ aiBehaviorCategories: engine.enemies.aiBehaviorCategories }, FROZEN[SECTION_VERSIONS.enemies].enemies),
    },
    library: {
      items: engine.library.items.map(it => ({ id: it.id, name: it.name, loadedAt: it.loadedAt, source: it.source ?? 'manual-import', file: blobOf(it.fileData) })),
      designs: engine.library.designs.map(d => blobOf(d)),
      presets: engine.library.presets.map(p => blobOf(p)),
    },
    editor: engine.editor,
    panels,
  };
}

export class SectionError extends Error {}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

export function conform(value: unknown, model: unknown, path: string): unknown {
  if (model === null || model === undefined) return value;
  if (typeof model === 'number') {
    if (typeof value !== 'number' || (!Number.isFinite(value) && Number.isFinite(model))) throw new SectionError(`${path} is not a number`);
    return value;
  }
  if (typeof model === 'boolean') { if (typeof value !== 'boolean') throw new SectionError(`${path} is not on or off`); return value; }
  if (typeof model === 'string') {
    if (typeof value !== 'string' || value.length > 100_000) throw new SectionError(`${path} is not a text`);
    return value;
  }
  if (Array.isArray(model)) {
    if (!Array.isArray(value)) throw new SectionError(`${path} is not a list`);
    if (model.length === 0) return value;
    return value.map((v, i) => conform(v, model[0], `${path}[${i}]`));
  }
  if (isObj(model)) {
    if (!isObj(value)) throw new SectionError(`${path} is not a group of values`);
    const out: Record<string, unknown> = { ...value };
    for (const k of Object.keys(model)) {
      out[k] = k in value ? conform(value[k], model[k], `${path}.${k}`) : structuredClone(model[k]);
    }
    return out;
  }
  return value;
}

function migrate(id: SectionId, data: unknown, from: number): unknown {
  let d = data;
  for (const step of MIGRATIONS[id]) if (step.from >= from && step.from < SECTION_VERSIONS[id]) d = step.up(d);
  return d;
}

function checkFile(file: unknown, what: string): ExportFile {
  const f = DataRegistry.validateImport(structuredClone(file), true);
  if (!f) throw new SectionError(`${what}: ${DataRegistry.lastRejectReason ?? 'not a file the game knows'}`);
  DataRegistry.lastRejectReason = null;
  return f;
}

const _checked = new Map<string, { file: ExportFile } | { why: string }>();
const CHECKED_MAX = 20_000;

function checkCached(key: string, wrap: () => unknown, what: string): ExportFile {
  let hit = _checked.get(key);
  if (!hit) {
    const f = DataRegistry.validateImport(structuredClone(wrap()), true);
    hit = f ? { file: f } : { why: DataRegistry.lastRejectReason ?? 'not a file the game knows' };
    DataRegistry.lastRejectReason = null;
    if (_checked.size >= CHECKED_MAX) _checked.delete(_checked.keys().next().value!);
    _checked.set(key, hit);
  }
  if ('why' in hit) throw new SectionError(`${what}: ${hit.why}`);
  return structuredClone(hit.file);
}

const wrapOf = (kind: 'item' | 'design' | 'preset', v: unknown): unknown =>
  kind === 'item' ? v
    : { version: '1.0.0', type: kind === 'design' ? 'CustomProjectile' : 'TurretPreset', name: String((v as Record<string, unknown>)?.name ?? (kind === 'design' ? 'Projectile' : 'Turret')), timestamp: 0, data: v };

export type Prechecked = Map<string, ExportFile[]>;

export async function precheckLibrary(records: Record<string, { version: number; data: unknown }>, blobs: ReadonlyMap<string, unknown>, sliceMs = 8): Promise<Prechecked> {
  const out: Prechecked = new Map();
  const lib = records.library?.data;
  if (!isObj(lib)) return out;
  const jobs: { key: string; kind: 'item' | 'design' | 'preset'; sha: string }[] = [];
  for (const it of Array.isArray(lib.items) ? lib.items : []) if (isObj(it) && typeof it.file === 'string') jobs.push({ key: 'item:' + it.file, kind: 'item', sha: it.file });
  for (const h of Array.isArray(lib.designs) ? lib.designs : []) if (typeof h === 'string') jobs.push({ key: 'design:' + h, kind: 'design', sha: h });
  for (const h of Array.isArray(lib.presets) ? lib.presets : []) if (typeof h === 'string') jobs.push({ key: 'preset:' + h, kind: 'preset', sha: h });
  let t0 = Date.now();
  for (const j of jobs) {
    if (!blobs.has(j.sha)) continue;
    try {
      const f = checkCached(j.key, () => wrapOf(j.kind, blobs.get(j.sha)), '');
      const list = out.get(j.key);
      if (list) list.push(f); else out.set(j.key, [f]);
    } catch { }
    if (Date.now() - t0 >= sliceMs) { await new Promise(r => setTimeout(r, 0)); t0 = Date.now(); }
  }
  return out;
}

function takeChecked(pre: Prechecked | undefined, key: string, wrap: () => unknown, what: string): ExportFile {
  const list = pre?.get(key);
  const f = list?.pop();
  if (f) return f;
  return checkCached(key, wrap, what);
}

function checkTank(tank: unknown, what: string): TankConfig {
  const f = checkFile({ version: '1.0.0', type: 'Tank', name: what, timestamp: 0, data: tank }, what);
  return f.data as TankConfig;
}

function readCanvas(d: unknown, fresh: CanvasData): CanvasData {
  if (!isObj(d)) throw new SectionError('The canvas is not readable');
  const kind = d.kind === 'shape' || d.kind === 'other' ? d.kind : 'tank';
  if (!isObj(d.pick)) throw new SectionError('The canvas view is missing');
  const out: CanvasData = { kind, pick: structuredClone(d.pick), libraryId: typeof d.libraryId === 'string' ? d.libraryId : null, shape: null, other: null };
  if (isObj(d.ref) && typeof d.ref.libraryId === 'string') {
    out.ref = { libraryId: d.ref.libraryId };
  } else {
    const des = d.design;
    if (!isObj(des) || !isObj(des.tank) || !Array.isArray(des.turrets) || !Array.isArray(des.layers)) throw new SectionError('The tank on the canvas is missing');
    const tank = conform(structuredClone(des.tank), fresh.design!.tank, 'canvas.tank') as Record<string, unknown>;
    const whole: Record<string, unknown> = { ...tank, turrets: structuredClone(des.turrets), bodyLayers: structuredClone(des.layers) };
    sanitizeImport({ version: '1.0.0', type: 'Tank', name: 'canvas', timestamp: 0, data: whole as unknown as TankConfig });
    for (const k of Object.keys(tank)) tank[k] = whole[k];
    const turrets = Array.isArray(whole.turrets) ? whole.turrets as unknown[] : [];
    const layers = Array.isArray(whole.bodyLayers) ? whole.bodyLayers as unknown[] : [];
    out.design = { tank, turrets, layers };
  }
  const drafts: any[] = [];
  for (const k of ['editingTurret', 'savedEditingTurretBeforePick', 'savedEditingTurretBeforeAutoMode', 'autoSubTurretEditing', 'savedAutoSubEditingBeforePick']) if (isObj(out.pick[k])) drafts.push(out.pick[k]);
  if (isObj(out.pick.editorStateByContext)) for (const v of Object.values(out.pick.editorStateByContext)) if (isObj(v) && isObj((v as any).editingTurret)) drafts.push((v as any).editingTurret);
  if (drafts.length > 0) sanitizeImport({ version: '1.0.0', type: 'TurretPreset', name: 'drafts', timestamp: 0, data: { name: 'drafts', turrets: drafts } as unknown as TurretPreset });
  if (kind === 'shape' && isObj(d.shape)) out.shape = checkFile({ version: '1.0.0', type: 'FoodShape', name: String(d.shape.name ?? 'Shape'), timestamp: 0, data: d.shape }, 'The food shape on the canvas').data as FoodShapeDesign;
  if (kind === 'other' && isObj(d.other)) {
    if (typeof d.other.libraryId === 'string') out.other = { libraryId: d.other.libraryId };
    else if (isObj(d.other.design)) out.other = { design: checkFile({ version: '1.0.0', type: 'Other', name: 'Other', timestamp: 0, data: d.other.design }, 'The Other on the canvas').data as OtherDesign };
  }
  return out;
}

function readEnemies(d: unknown, fresh: EngineSnapshot['enemies']): EngineSnapshot['enemies'] {
  if (!isObj(d) || !Array.isArray(d.configs)) throw new SectionError('The enemies are not readable');
  const configs: EnemyConfigData[] = [];
  const clamp = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt);
  for (const c of d.configs as unknown[]) {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.enemyName !== 'string') throw new SectionError('An enemy setup is not readable');
    const cfg: EnemyConfigData = { ...(structuredClone(c) as EnemyConfigData) };
    cfg.baseLevel = clamp(c.baseLevel, 0, 100, 1);
    cfg.maxSpawnCount = clamp(c.maxSpawnCount, 1, 20, 1);
    if (SMALL_FIX.GH328 !== 0) { cfg.baseLevel = Math.round(cfg.baseLevel); cfg.maxSpawnCount = Math.round(cfg.maxSpawnCount); }
    cfg.aimbotStrength = clamp(c.aimbotStrength, 0, 100, 50);
    cfg.turnSpeed = clamp(c.turnSpeed, 0, 100, 50);
    if (cfg.sourceTankWord !== undefined && typeof cfg.sourceTankWord !== 'string') delete cfg.sourceTankWord;
    if (isObj(c.tankRef) && typeof c.tankRef.libraryId === 'string') { cfg.tankRef = { libraryId: c.tankRef.libraryId }; delete cfg.tankConfig; }
    else if (isObj(c.tankConfig)) cfg.tankConfig = checkTank(c.tankConfig, `The tank of the enemy "${c.enemyName}"`);
    else throw new SectionError(`The enemy "${c.enemyName}" has no tank`);
    configs.push(cfg);
  }
  const cats = 'aiBehaviorCategories' in d ? conform(d.aiBehaviorCategories, fresh.aiBehaviorCategories, 'enemies.aiBehaviorCategories') : structuredClone(fresh.aiBehaviorCategories);
  return { configs, aiBehaviorCategories: cats as EngineSnapshot['enemies']['aiBehaviorCategories'] };
}

function readLibrary(d: unknown, blobs: ReadonlyMap<string, unknown>, pre?: Prechecked): LibraryData {
  if (!isObj(d)) throw new SectionError('His files are not readable');
  const blob = (h: unknown, what: string): unknown => {
    if (typeof h !== 'string' || !blobs.has(h)) throw new SectionError(`${what} is missing`);
    return blobs.get(h);
  };
  const items: LibraryItem[] = [];
  for (const it of Array.isArray(d.items) ? d.items : []) {
    if (!isObj(it) || typeof it.id !== 'string') throw new SectionError('A file of his is not readable');
    const name = typeof it.name === 'string' ? it.name.slice(0, 200) : 'Imported';
    const v = blob(it.file, `The file "${name}"`);
    const file = takeChecked(pre, 'item:' + it.file, () => wrapOf('item', v), `The file "${name}"`);
    items.push({ id: it.id, name, fileData: file, loadedAt: typeof it.loadedAt === 'number' ? it.loadedAt : 0, source: 'manual-import' });
  }
  const designs: CustomProjectileDesign[] = [];
  for (const h of Array.isArray(d.designs) ? d.designs : []) {
    const v = blob(h, 'A projectile design');
    designs.push(takeChecked(pre, 'design:' + h, () => wrapOf('design', v), 'A projectile design').data as CustomProjectileDesign);
  }
  const presets: TurretPreset[] = [];
  for (const h of Array.isArray(d.presets) ? d.presets : []) {
    const v = blob(h, 'A turret preset');
    presets.push(takeChecked(pre, 'preset:' + h, () => wrapOf('preset', v), 'A turret preset').data as TurretPreset);
  }
  return { items, designs, presets };
}

function limitNum(o: Record<string, unknown>, k: string, lo: number, hi: number, int: boolean): void {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) return;
  const r = int ? Math.round(v) : v;
  o[k] = r < lo ? lo : r > hi ? hi : r;
}
function modeLimits(m: Record<string, unknown>, fresh: Record<string, unknown>): void {
  limitNum(m, 'respawnLevelPercent', 0, 100, true);
  limitNum(m, 'respawnMinLevel', 0, 1000, true);
  limitNum(m, 'respawnMaxLevel', 0, 1000, true);
  const g = m.gameModeConfig;
  if (isObj(g)) {
    if (typeof g.mode !== 'string' || !Object.prototype.hasOwnProperty.call(GAME_MODE_TITLES, g.mode)) g.mode = (fresh.gameModeConfig as Record<string, unknown>).mode;
    limitNum(g, 'teams', 2, 4, true);
    limitNum(g, 'playerTeam', 1, 4, true);
    limitNum(g, 'levelCap', 1, 1000, true);
    limitNum(g, 'maxTanksAlive', 1, CMD_ROOM_MAX, true);
    limitNum(g, 'growthMaxMultiplier', 1, 1000, false);
    limitNum(g, 'growthPerLevel', 0, 1000, false);
    limitNum(g, 'growthStartLevel', 0, 1000, false);
    limitNum(g, 'growthLevelsPerSp', 1, 100, true);
    limitNum(g, 'botPortalRethinkS', 0, 600, false);
    limitNum(g, 'botPortalRestMin', 0.5, 60, false);
    if (g.mapPool !== undefined) { const p = cleanMapPool(g.mapPool); if (p) g.mapPool = p; else delete g.mapPool; }
    if (g.stopChances !== undefined) {
      if (Array.isArray(g.stopChances)) g.stopChances = g.stopChances.slice(0, 4).map((v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0));
      else delete g.stopChances;
    }
    if (g.world !== undefined && typeof g.world !== 'string') delete g.world;
    if (g.tankDebuffs !== undefined) { const d = clampTankDebuffs(g.tankDebuffs); if (d) g.tankDebuffs = d; else delete g.tankDebuffs; }
    if (g.halloween !== undefined) { const h = cleanHalloweenLook(g.halloween); if (h) g.halloween = h; else delete g.halloween; }
    if (g.vampirism !== undefined && g.vampirism !== true) delete g.vampirism;
    if (g.startingScore !== undefined && (typeof g.startingScore !== 'number' || !Number.isFinite(g.startingScore))) delete g.startingScore;
    limitNum(g, 'startingScore', 0, STARTING_SCORE_MAX, true);
    if (g.growthModel !== undefined && g.growthModel !== 'simple' && g.growthModel !== 'rules') delete g.growthModel;
    if (g.growthRules !== undefined) { const r = clampGrowthRules(g.growthRules); if (r) g.growthRules = r; else delete g.growthRules; }
    if (isObj(g.teamEnemyConfig)) for (const k of ['team1', 'team2', 'team3', 'team4', 'ffa']) limitNum(g.teamEnemyConfig, k, 0, MAX_ARENA_TANKS, true);
  }
  const tb = m.teamBotSettings;
  if (isObj(tb)) for (const k of Object.keys(tb)) {
    const t = tb[k];
    if (!isObj(t)) continue;
    limitNum(t, 'baseLevel', 0, 100, true);
    limitNum(t, 'aimbotStrength', 0, 100, false);
    limitNum(t, 'turnSpeed', 0, 100, false);
  }
}
function worldLimits(w: Record<string, unknown>): void {
  limitNum(w, 'spawnRate', 0, 100, false);
  limitNum(w, 'velocityInheritance', 0, 100, false);
  limitNum(w, 'maxEnemies', 0, CMD_ROOM_MAX, true);
  clampShapeSpawnLimits(w.shapeSpawnConfig);
}

function readSparse(d: unknown, defaults: Record<string, unknown>, what: string): Record<string, unknown> {
  if (!isObj(d)) throw new SectionError(`${what} is not readable`);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(defaults)) out[k] = k in d ? conform(d[k], defaults[k], `${what}.${k}`) : structuredClone(defaults[k]);
  for (const k of Object.keys(d)) if (!(k in defaults)) out[k] = d[k];
  return out;
}

export interface KeptExtras {
  sections: Record<string, { version: number; data: unknown }>;
  fields: Partial<Record<SectionId, Record<string, unknown>>>;
  tank: Record<string, unknown>;
  pick: Record<string, unknown>;
  mapEditor: Record<string, unknown>;
}

export interface ReadResult {
  engine: EngineSnapshot;
  panels: PanelsData;
  problems: { part: string; why: string }[];
  readOnly: boolean;
  unknown: Record<string, { version: number; data: unknown }>;
  kept: KeptExtras;
}

const extrasOf = (data: unknown, known: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (!isObj(data)) return out;
  for (const k of Object.keys(data)) if (!known.includes(k)) out[k] = data[k];
  return out;
};

function writerKeys(fresh: EngineSnapshot): Record<SectionId, readonly string[]> {
  return {
    canvas: ['kind', 'design', 'ref', 'pick', 'libraryId', 'shape', 'other'],
    world: Object.keys(fresh.world),
    mode: Object.keys(fresh.mode),
    enemies: ['configs', 'aiBehaviorCategories'],
    library: ['items', 'designs', 'presets'],
    editor: Object.keys(fresh.editor),
    panels: Object.keys(EMPTY_PANELS),
  };
}

export function mergeKept(secs: Record<string, unknown>, kept: KeptExtras | null): Record<string, unknown> {
  if (!kept) return secs;
  const out: Record<string, unknown> = { ...secs };
  for (const [id, extra] of Object.entries(kept.fields)) {
    if (!extra || Object.keys(extra).length === 0 || !isObj(out[id])) continue;
    out[id] = { ...extra, ...(out[id] as Record<string, unknown>) };
  }
  const ed = out.editor;
  if (isObj(ed) && Object.keys(kept.mapEditor).length > 0) out.editor = { ...ed, mapEditor: { ...kept.mapEditor, ...(isObj(ed.mapEditor) ? ed.mapEditor : {}) } };
  const c = out.canvas;
  if (isObj(c) && (Object.keys(kept.tank).length > 0 || Object.keys(kept.pick).length > 0)) {
    const next: Record<string, unknown> = { ...c, pick: { ...kept.pick, ...(isObj(c.pick) ? c.pick : {}) } };
    if (isObj(c.design)) next.design = { ...c.design, tank: { ...kept.tank, ...(isObj(c.design.tank) ? c.design.tank : {}) } };
    out.canvas = next;
  }
  return out;
}

const PART_WORD: Record<SectionId, string> = {
  canvas: 'The tank on the canvas', world: 'The map', mode: 'The game mode', enemies: 'The enemies', library: 'His files',
  editor: 'The editor settings', panels: 'The panel settings',
};

export function readSections(records: Record<string, { version: number; data: unknown }>, blobs: ReadonlyMap<string, unknown>, fresh: EngineSnapshot, pre?: Prechecked): ReadResult {
  const problems: { part: string; why: string }[] = [];
  const unknown: Record<string, { version: number; data: unknown }> = {};
  const kept: KeptExtras = { sections: unknown, fields: {}, tank: {}, pick: {}, mapEditor: {} };
  const known = writerKeys(fresh);
  let readOnly = false;
  const engine: EngineSnapshot = structuredClone(fresh);
  let panels: PanelsData = structuredClone(EMPTY_PANELS);
  for (const [id, rec] of Object.entries(records)) {
    if (!(SECTION_IDS as readonly string[]).includes(id)) { unknown[id] = rec; continue; }
    const sid = id as SectionId;
    if (rec.version > SECTION_VERSIONS[sid]) { readOnly = true; unknown[id] = rec; problems.push({ part: PART_WORD[sid], why: 'It was saved by a newer version of iStrongEngine.' }); continue; }
    try {
      const f = FROZEN[Math.min(rec.version, SECTION_VERSIONS[sid])] ?? FROZEN[1];
      const data = migrate(sid, rec.data, rec.version);
      const extra = extrasOf(data, known[sid]);
      if (Object.keys(extra).length > 0) kept.fields[sid] = extra;
      if (sid === 'canvas' && isObj(data)) {
        if (isObj(data.design)) kept.tank = extrasOf(data.design.tank, Object.keys(fresh.canvas.design!.tank));
        kept.pick = extrasOf(data.pick, Object.keys(fresh.canvas.pick));
      }
      if (sid === 'editor' && isObj(data)) kept.mapEditor = extrasOf(data.mapEditor, Object.keys(fresh.editor.mapEditor));
      switch (sid) {
        case 'canvas': engine.canvas = readCanvas(data, fresh.canvas); break;
        case 'world': {
          const w = readSparse(data, f.world, 'world');
          if (isObj(w.mapConfig)) w.mapConfig = checkFile({ version: '1.0.0', type: 'Map', name: 'Map', timestamp: 0, data: w.mapConfig }, 'The map').data;
          if (isObj(w.multiAreaConfig) && Array.isArray(w.multiAreaConfig.areas) && w.multiAreaConfig.areas.length > 0) {
            w.multiAreaConfig = checkFile({ version: '1.0.0', type: 'MultiAreaMap', name: 'Map', timestamp: 0, data: w.multiAreaConfig }, 'The areas of the map').data;
          }
          if (SMALL_FIX.GH328 !== 0) worldLimits(w);
          engine.world = w as unknown as EngineSnapshot['world'];
          break;
        }
        case 'mode': {
          const m = readSparse(data, f.mode, 'mode');
          if (SMALL_FIX.GH328 !== 0) modeLimits(m, fresh.mode as unknown as Record<string, unknown>);
          engine.mode = m as unknown as EngineSnapshot['mode'];
          break;
        }
        case 'enemies': engine.enemies = readEnemies(data, { configs: [], aiBehaviorCategories: f.enemies.aiBehaviorCategories as EngineSnapshot['enemies']['aiBehaviorCategories'] }); break;
        case 'library': engine.library = readLibrary(data, blobs, pre); break;
        case 'editor': {
          const ed = conform(data, fresh.editor, 'editor') as EngineSnapshot['editor'];
          if (ed.camera && !(Number.isFinite(ed.camera.x) && Number.isFinite(ed.camera.y) && Number.isFinite(ed.camera.zoom))) ed.camera = null;
          if (SMALL_FIX.GH328 !== 0 && isObj(ed.mapEditor)) {
            const me = ed.mapEditor as unknown as Record<string, unknown>;
            limitNum(me, 'wallCells', MAP_EDIT_WALL_MIN_CELLS, MAP_EDIT_WALL_MAX_CELLS, true);
            limitNum(me, 'zoneTeam', 0, 3, true);
          }
          engine.editor = ed;
          break;
        }
        case 'panels': {
          const p = conform(data, EMPTY_PANELS, 'panels') as PanelsData;
          if (!isObj(p.folds)) p.folds = {};
          if (!isObj(p.values)) p.values = {};
          if (!isObj(p.scroll)) p.scroll = {};
          panels = p;
          break;
        }
      }
    } catch (e) {
      problems.push({ part: PART_WORD[sid], why: e instanceof Error ? e.message : 'It could not be read.' });
    }
  }
  return { engine, panels, problems, readOnly, unknown, kept };
}

export function captureAll(logic: GameLogic, panels: PanelsData): { engine: EngineSnapshot; panels: PanelsData } {
  return { engine: logic.projectCapture(), panels };
}
