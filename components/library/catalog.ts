import type { LibraryItem, ExportFile, TurretPreset, CustomProjectileDesign, OtherDesign, TankConfig } from '../../types';
import type { ShapeDefinition, ShapeCategory } from '../../game/ShapeRegistry';
import { SHAPE_DEFS_BY_CATEGORY, getUserShapeDefs, getShapeRegistryVersion } from '../../game/ShapeRegistry';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import { FULL_EVOLUTION_TREE, isMenuTank } from '../../game/evolutionTree';
import { bookTreeFileKey } from '../../game/bookTrees';
import { SENTRY_TANK_CONFIGS, SENTINEL_TANK_CONFIGS, SENTRY_ENEMY_CONFIGS } from '../../game/SentryConfigs';
import { catalogFacts, addDesignOfName, designKindFrom, designOfName, ROUND, FACT, CATALOG_FORMAT, type CatalogFacts, type BuiltCatalog, type DesignKindOf, type DesignOfName } from './catalogCore';

export type LibKind = 'tank' | 'turret' | 'projectile' | 'other' | 'shape' | 'sentry';
export const LIB_KIND_ORDER: readonly LibKind[] = ['tank', 'turret', 'projectile', 'other', 'shape', 'sentry'];
export const LIB_KIND_LABEL: Record<LibKind, string> = {
  tank: 'Tanks', turret: 'Turrets', projectile: 'Projectiles', other: 'Others', shape: 'Food Shapes', sentry: 'Sentries',
};
export const LIB_KIND_ONE: Record<LibKind, string> = {
  tank: 'tank', turret: 'turret', projectile: 'projectile', other: 'Other', shape: 'food shape', sentry: 'sentry',
};

export interface FilterOption { id: string; label: string; }
export interface FilterGroup {
  id: string;
  label: string;
  options: FilterOption[];
  showWith?: string;
  dynamic?: boolean;
}

const o = (id: string, label: string): FilterOption => ({ id, label });

const SHOW_GROUP: FilterGroup = { id: 'show', label: 'Show', dynamic: true, options: [o('fav', 'Favourites'), o('recent', 'Recently used')] };

const FIRES_OPTIONS: FilterOption[] = [
  o('BULLET', 'Bullets'), o('DRONE', 'Drones'), o('MINION', 'Minions'), o('TRAP', 'Traps'), o('SWARM', 'Swarms'),
  o('MISSILE', 'Missiles'), o('HIVE', 'Hives'), o('TANK', 'Tanks'), o('BOMB', 'Bombs'), o('BOOMERANG', 'Boomerangs'),
];
const BARREL_OPTIONS: FilterOption[] = [o('b0', 'None'), o('b1', 'One'), o('b2', 'Two'), o('b3', 'Three or four'), o('b5', 'Five to eight'), o('b9', 'Nine or more')];
const BODY_OPTIONS: FilterOption[] = [o('s0', 'Circle'), o('s3', 'Triangle'), o('s4', 'Square'), o('s5', 'Pentagon'), o('s6', 'Hexagon'), o('s7', 'More sides'), o('star', 'Star')];

export const TANK_COLLECTIONS: FilterOption[] = [
  o('basic', 'Basic'), o('armsRace', 'Arms Race'), o('dreadV1', 'Dreadnoughts V1'), o('dreadV2', 'Dreadnoughts V2'),
  o('bosses', 'Bosses'), o('celestials', 'Celestials'), o('mapEntities', 'Map Entities'), o('devTanks', 'Dev Tanks'), o('mine', 'My Content'), o('otherCol', 'Other'),
];
const BOSS_GROUPS: FilterOption[] = [
  o('Sentries', 'Sentries'), o('Elites', 'Elites'), o('Mysticals', 'Mysticals'), o('Nesters', 'Nesters'), o('Rogues', 'Rogues'),
  o('Rammers', 'Rammers'), o('Terrestrials', 'Terrestrials'), o('Eternals', 'Eternals'), o('Spawned Entities', 'Spawned'),
];
const MAP_GROUPS: FilterOption[] = [o('Map Entities', 'Entities'), o('Sanctuaries', 'Sanctuaries')];

export const KIND_GROUPS: Record<LibKind, FilterGroup[]> = {
  tank: [
    { id: 'collection', label: 'Collection', options: TANK_COLLECTIONS },
    { id: 'bossGroup', label: 'Boss group', options: BOSS_GROUPS, showWith: 'bosses' },
    { id: 'mapGroup', label: 'Map entity group', options: MAP_GROUPS, showWith: 'mapEntities' },
    SHOW_GROUP,
    { id: 'tier', label: 'Tier', options: [o('t1', 'Tier 1'), o('t2', 'Tier 2'), o('t3', 'Tier 3'), o('t4', 'Tier 4'), o('t5', 'Tier 5'), o('t6', 'Tier 6'), o('t7', 'Tier 7'), o('t8', 'Tier 8 and up'), o('t0', 'No tier')] },
    { id: 'fires', label: 'Fires', options: FIRES_OPTIONS },
    { id: 'features', label: 'Features', options: [o('auto', 'Auto turrets'), o('layered', 'Layered body'), o('heals', 'Healer'), o('invisible', 'Invisible'), o('smasher', 'Smasher'), o('aura', 'Aura')] },
    { id: 'barrels', label: 'Barrels', options: BARREL_OPTIONS },
    { id: 'body', label: 'Body shape', options: BODY_OPTIONS },
  ],
  turret: [
    { id: 'collection', label: 'Group', options: [
      o('Auto Guns', 'Auto Guns'), o('Gun Turrets', 'Gun Turrets'), o('Sniper Turrets', 'Sniper Turrets'), o('Trap Turrets', 'Trap Turrets'),
      o('Launcher Turrets', 'Launcher Turrets'), o('Drone/Swarm', 'Drones and Swarms'), o('Boss Turrets', 'Boss Turrets'),
      o('Dread Turrets', 'Dread Turrets'), o('Specialty', 'Specialty'), o('mine', 'My Content'), o('otherCol', 'Other'),
    ] },
    SHOW_GROUP,
    { id: 'type', label: 'Type', options: [o('auto', 'Auto turret'), o('barrel', 'Barrel weapon')] },
    { id: 'fires', label: 'Fires', options: FIRES_OPTIONS },
    { id: 'barrels', label: 'Barrels', options: BARREL_OPTIONS },
    { id: 'features', label: 'Features', options: [o('heals', 'Healer'), o('aura', 'Aura')] },
  ],
  projectile: [
    { id: 'collection', label: 'Group', options: [
      o('Missiles', 'Missiles'), o('Hives', 'Hives'), o('Traps', 'Traps'), o('Drones', 'Drones'), o('Minions', 'Minions'),
      o('Splitters', 'Splitters'), o('mine', 'My Content'), o('otherCol', 'Other'),
    ] },
    SHOW_GROUP,
    { id: 'kind', label: 'It is a', options: [o('bullet', 'Bullet'), o('drone', 'Drone'), o('trap', 'Trap'), o('swarm', 'Swarm'), o('minion', 'Minion'), o('hive', 'Hive'), o('boomerang', 'Boomerang')] },
    { id: 'carries', label: 'Turrets on it', options: [o('yes', 'Carries turrets'), o('no', 'No turrets')] },
    { id: 'fires', label: 'Its turrets fire', options: FIRES_OPTIONS },
    { id: 'features', label: 'Features', options: [o('heals', 'Healer'), o('layered', 'Layered body')] },
  ],
  other: [
    { id: 'collection', label: 'Group', options: [o('Walls', 'Walls'), o('Game Objects', 'Game Objects'), o('Halloween', 'Halloween'), o('Tank Marks', 'Tank Marks'), o('mine', 'My Content'), o('otherCol', 'Other')] },
    SHOW_GROUP,
    { id: 'parts', label: 'Parts', options: [o('p1', 'One shape'), o('p2', 'Two to five'), o('p6', 'Six to twenty'), o('p21', 'More than twenty')] },
  ],
  shape: [
    { id: 'collection', label: 'Group', options: [
      o('base', 'Base'), o('rarity', 'Rarity'), o('laby', 'Nested'), o('scaled', 'Scaled'), o('special', 'Special'),
      o('crasher', 'Crashers'), o('polyhedron', 'Solids'), o('mine', 'My Content'), o('user', 'Other'), o('relic', 'Relics'),
    ] },
    SHOW_GROUP,
    { id: 'sides', label: 'Sides', options: [o('s0', 'Circle'), o('s3', 'Triangle'), o('s4', 'Square'), o('s5', 'Pentagon'), o('s6', 'Hexagon'), o('s7', 'More sides'), o('solid', 'Solid')] },
    { id: 'nest', label: 'Nested layers', options: [o('n0', 'None'), o('n1', 'One'), o('n2', 'Two'), o('n3', 'Three'), o('n4', 'Four'), o('n5', 'Five')] },
    { id: 'rarity', label: 'Rarity', options: [o('normal', 'Normal'), o('shiny', 'Shiny'), o('legendary', 'Legendary'), o('shadow', 'Shadow'), o('rainbow', 'Rainbow'), o('trans', 'Trans')] },
    { id: 'size', label: 'Size', options: [o('normal', 'Normal'), o('beta', 'Beta'), o('alpha', 'Alpha')] },
    { id: 'gem', label: 'Gem', options: [o('amethyst', 'Amethyst'), o('sapphire', 'Sapphire'), o('ruby', 'Ruby'), o('topaz', 'Topaz'), o('emerald', 'Emerald'), o('citrine', 'Citrine'), o('none', 'No gem')], showWith: 'relic' },
  ],
  sentry: [
    { id: 'collection', label: 'Group', options: [o('sentry', 'Sentries'), o('sentinel', 'Sentinels')] },
    SHOW_GROUP,
  ],
};

const RELIC_GEM_BY_CODE: Readonly<Record<number, string>> = Object.freeze({ 30: 'amethyst', 31: 'sapphire', 32: 'ruby', 33: 'topaz', 34: 'emerald', 35: 'citrine' });
export function relicGemOf(def: ShapeDefinition): string {
  const items = def.look?.list.items;
  if (!items) return '';
  for (let i = 0; i < items.length; i++) { const c = items[i].part.colorCode; if (c !== undefined && RELIC_GEM_BY_CODE[c]) return RELIC_GEM_BY_CODE[c]; }
  return '';
}

export function groupIndex(kind: LibKind, id: string): number { return KIND_GROUPS[kind].findIndex(g => g.id === id); }
const _bits = new Map<string, number>();
for (const kind of Object.keys(KIND_GROUPS) as LibKind[]) {
  for (const g of KIND_GROUPS[kind]) g.options.forEach((op, i) => _bits.set(kind + '|' + g.id + '|' + op.id, (1 << i) >>> 0));
}
function optBit(kind: LibKind, groupId: string, optId: string): number {
  return _bits.get(kind + '|' + groupId + '|' + optId) ?? 0;
}

export interface SentryEntryData { key: string; label: string; tankConfig: TankConfig; pool: 'sentry' | 'sentinel'; hp: number; xp: number; }

export interface HubCardInfo {
  id: string;
  kind: 'project' | 'file';
  icon: 'project' | 'map' | 'file';
  preview: boolean;
  open: boolean;
  readOnly: boolean;
  tip: string;
}

export interface LibEntry {
  key: string;
  hub?: HubCardInfo;
  kind: LibKind;
  id: string;
  name: string;
  item: LibraryItem | null;
  shape: ShapeDefinition | null;
  sentry: SentryEntryData | null;
  fileKey: string | null;
  mine: boolean;
  tier: number;
  collection: string;
  group: string;
  facts: CatalogFacts;
  tags: Uint32Array;
  lower: string;
  words: string[];
  extra: string;
  order: number;
  loadedAt: number;
}

export interface LibCatalog {
  entries: LibEntry[];
  byKind: Record<LibKind, LibEntry[]>;
  byKey: Map<string, LibEntry>;
  byFileKey: Map<string, LibEntry>;
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  firedBy: Map<string, string[]>;
  version: string;
}

const COLLECTION_OF_CATEGORY: Record<string, string> = {
  'Tanks': 'basic', 'Arms Race': 'armsRace', 'Dreads V1': 'dreadV1', 'Dreads V2': 'dreadV2', 'Celestials': 'celestials',
  'Sentries': 'bosses', 'Elites': 'bosses', 'Mysticals': 'bosses', 'Nesters': 'bosses', 'Rogues': 'bosses', 'Rammers': 'bosses',
  'Terrestrials': 'bosses', 'Eternals': 'bosses',
  'Spawned Entities': 'bosses',
  'Map Entities': 'mapEntities', 'Sanctuaries': 'mapEntities',
  'Dev Tanks': 'devTanks',
};
Object.setPrototypeOf(COLLECTION_OF_CATEGORY, null);

export function collectionOfItem(item: { source?: string; fileData: { category?: string } } | null | undefined): string | undefined {
  if (!item) return undefined;
  return item.source !== 'data-library' ? 'mine' : collectionOfCategory(item.fileData.category);
}

export function collectionOfCategory(category: string | undefined): string { return (category && COLLECTION_OF_CATEGORY[category]) || 'otherCol'; }

export function wordsOf(s: string): string[] {
  const out: string[] = [];
  const parts = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^\p{L}\p{N}]+/u);
  for (const p of parts) if (p) out.push(p);
  return out;
}

function barrelBit(n: number): string { return n <= 0 ? 'b0' : n === 1 ? 'b1' : n === 2 ? 'b2' : n <= 4 ? 'b3' : n <= 8 ? 'b5' : 'b9'; }
function sidesBit(n: number): string { return n < 3 ? 's0' : n === 3 ? 's3' : n === 4 ? 's4' : n === 5 ? 's5' : n === 6 ? 's6' : 's7'; }

function roundsMask(kind: LibKind, rounds: number): number {
  let m = 0;
  const g = KIND_GROUPS[kind].find(x => x.id === 'fires');
  if (!g) return 0;
  for (let i = 0; i < g.options.length; i++) {
    const bit = (ROUND as Record<string, number>)[g.options[i].id];
    if (bit && (rounds & bit)) m |= (1 << i);
  }
  return m >>> 0;
}

function tagEntry(e: LibEntry): void {
  const groups = KIND_GROUPS[e.kind];
  const t = new Uint32Array(groups.length);
  const [rounds, flags, barrels, sides] = e.facts;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const bit = (id: string) => optBit(e.kind, g.id, id);
    let m = 0;
    switch (g.id) {
      case 'collection': m = bit(e.collection) || bit('otherCol') || bit('user'); break;
      case 'bossGroup': case 'mapGroup': m = bit(e.group); break;
      case 'tier': m = bit(e.tier <= 0 ? 't0' : e.tier >= 8 ? 't8' : 't' + e.tier); break;
      case 'fires': m = roundsMask(e.kind, rounds); break;
      case 'features':
        if (flags & FACT.AUTO) m |= bit('auto');
        if (flags & FACT.LAYERED) m |= bit('layered');
        if (flags & FACT.HEALS) m |= bit('heals');
        if (flags & FACT.INVISIBLE) m |= bit('invisible');
        if (flags & FACT.SMASHER) m |= bit('smasher');
        if (flags & FACT.AURA) m |= bit('aura');
        break;
      case 'barrels': m = bit(barrelBit(barrels)); break;
      case 'body': m = bit(sidesBit(sides)) | ((flags & FACT.STAR_BODY) ? bit('star') : 0); break;
      case 'type': m = ((flags & FACT.AUTO) ? bit('auto') : 0) | (barrels > 0 ? bit('barrel') : 0); break;
      case 'kind': {
        const d = e.item?.fileData.data as CustomProjectileDesign | undefined;
        m = bit(d?.visual || 'bullet') || bit('bullet');
        break;
      }
      case 'carries': m = bit((flags & FACT.CARRIES_TURRETS) ? 'yes' : 'no'); break;
      case 'parts': m = bit(sides <= 1 ? 'p1' : sides <= 5 ? 'p2' : sides <= 20 ? 'p6' : 'p21'); break;
      case 'sides': {
        const s = e.shape;
        m = s && s.isPolyhedron ? bit('solid') : bit(sidesBit(s ? s.sides : 0));
        break;
      }
      case 'nest': m = bit('n' + (e.shape?.labyLevel ?? 0)); break;
      case 'rarity': m = bit(e.shape?.rarity ?? 'normal'); break;
      case 'size': m = bit(e.shape?.scaleVariant ?? 'normal'); break;
      case 'gem': m = e.shape?.look ? bit(relicGemOf(e.shape) || 'none') : 0; break;
      default: m = 0;
    }
    t[gi] = m >>> 0;
  }
  e.tags = t;
}

interface TreeFacts { tier: Map<string, number>; parents: Map<string, string[]>; children: Map<string, string[]>; }
let _trees: TreeFacts | null = null;

export function treeFacts(): TreeFacts {
  if (_trees) return _trees;
  const tier = new Map<string, number>();
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const fileOf = (k: string) => bookTreeFileKey(k) ?? k;
  const isChild = new Set<string>();
  for (const parent of Object.keys(FULL_EVOLUTION_TREE)) {
    if (isMenuTank(parent)) continue;
    for (const e of FULL_EVOLUTION_TREE[parent]) for (const c of e.upgrades) isChild.add(c);
  }
  const setMin = (k: string, t: number) => { const f = fileOf(k); const cur = tier.get(f); if (cur === undefined || t < cur) tier.set(f, t); };
  const link = (m: Map<string, string[]>, a: string, b: string) => { let l = m.get(a); if (!l) { l = []; m.set(a, l); } if (!l.includes(b)) l.push(b); };
  const queue: [string, number][] = [];
  for (const k of Object.keys(FULL_EVOLUTION_TREE)) if (!isMenuTank(k) && !isChild.has(k)) queue.push([k, 1]);
  const seenAt = new Map<string, number>();
  for (let qi = 0; qi < queue.length; qi++) {
    const [k, t] = queue[qi];
    const prev = seenAt.get(k);
    if (prev !== undefined && prev <= t) continue;
    seenAt.set(k, t);
    setMin(k, t);
    const entries = FULL_EVOLUTION_TREE[k];
    if (!entries) continue;
    for (const e of entries) {
      const ct = typeof e.layoutTier === 'number' ? e.layoutTier + 1 : t + 1;
      for (const c of e.upgrades) {
        if (isMenuTank(c)) continue;
        link(children, fileOf(k), fileOf(c));
        link(parents, fileOf(c), fileOf(k));
        queue.push([c, Math.max(ct, t + 1)]);
      }
    }
  }
  _trees = { tier, parents, children };
  return _trees;
}

let _built: BuiltCatalog | null = null;
let _builtPromise: Promise<BuiltCatalog | null> | null = null;

export function loadBuiltCatalog(): Promise<BuiltCatalog | null> {
  if (_built) return Promise.resolve(_built);
  if (!_builtPromise) {
    _builtPromise = import('virtual:content-catalog')
      .then(m => { const c = m.default as BuiltCatalog; _built = c && c.format === CATALOG_FORMAT ? c : null; return _built; })
      .catch(() => { _builtPromise = null; return null; });
  }
  return _builtPromise;
}
export function prewarmCatalog(inputs: () => CatalogInputs | null): void {
  loadBuiltCatalog().then(() => { const inp = inputs(); if (inp) void getCatalogSliced(inp, 'idle'); }).catch(() => {});
}
export function setBuiltCatalogForTests(c: BuiltCatalog | null): void { _built = c; }
export function builtCatalogNow(): BuiltCatalog | null { return _built; }

export interface CatalogInputs {
  tankLibrary: readonly LibraryItem[];
  otherLibrary: readonly LibraryItem[];
  projectileDesigns: readonly CustomProjectileDesign[];
  rev?: number;
}

let _cache: { lib: readonly LibraryItem[]; libLen: number; other: readonly LibraryItem[]; otherLen: number; designs: number; rev: number; reg: number; built: boolean; cat: LibCatalog;
  designRefs: readonly CustomProjectileDesign[] | null } | null = null;

function shippedFileKey(item: LibraryItem): string | null {
  if (item.source !== 'data-library') return null;
  const id = item.id || '';
  const s = id.lastIndexOf('/'), d = id.lastIndexOf('.');
  return s >= 0 && d > s ? id.substring(s + 1, d) : null;
}

function cachedCatalog(inp: CatalogInputs): LibCatalog | null {
  const reg = getShapeRegistryVersion();
  const c = _cache;
  if (c && c.lib === inp.tankLibrary && c.libLen === inp.tankLibrary.length && c.other === inp.otherLibrary
      && c.otherLen === inp.otherLibrary.length && c.designs === inp.projectileDesigns.length && c.rev === (inp.rev ?? 0) && c.reg === reg && c.built === (_built !== null)
    && (c.designRefs === null || sameDesigns(c.designRefs, inp.projectileDesigns))) {
    return c.cat;
  }
  return null;
}
function sameDesigns(a: readonly CustomProjectileDesign[], b: readonly CustomProjectileDesign[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function keepCatalog(inp: CatalogInputs, cat: LibCatalog, reg: number, built: boolean, lens?: CatalogLens): void {
  const _dn = lens ? lens.designs : inp.projectileDesigns.length;
  _cache = { designRefs: SMALL_FIX.G690 !== 0 ? inp.projectileDesigns.slice(0, _dn) : null, lib: inp.tankLibrary, libLen: lens ? lens.lib : inp.tankLibrary.length, other: inp.otherLibrary, otherLen: lens ? lens.other : inp.otherLibrary.length,
    designs: lens ? lens.designs : inp.projectileDesigns.length, rev: lens ? lens.rev : (inp.rev ?? 0), reg, built, cat };
}

export function getCatalog(inp: CatalogInputs): LibCatalog {
  const hit = cachedCatalog(inp);
  if (hit) return hit;
  const reg = getShapeRegistryVersion(), built = _built !== null;
  const cat = buildCatalog(inp);
  keepCatalog(inp, cat, reg, built);
  return cat;
}

let _lastSlices = 0, _lastSteps = 0;
export function lastCatalogSlicesForTests(): { slices: number; steps: number } { return { slices: _lastSlices, steps: _lastSteps }; }
interface CatalogLens { lib: number; other: number; designs: number; rev: number }
let _slicing: { inp: CatalogInputs; lens: CatalogLens; reg: number; built: boolean; promise: Promise<LibCatalog>; urgent: () => void } | null = null;
const SLICE_MS = 40;

export function getCatalogSliced(inp: CatalogInputs, when: 'now' | 'idle' = 'now'): Promise<LibCatalog> {
  const hit = cachedCatalog(inp);
  if (hit) return Promise.resolve(hit);
  const reg = getShapeRegistryVersion(), built = _built !== null;
  const p = _slicing;
  if (p && p.inp.tankLibrary === inp.tankLibrary && p.inp.otherLibrary === inp.otherLibrary && p.lens.lib === inp.tankLibrary.length
      && p.lens.other === inp.otherLibrary.length && p.lens.designs === inp.projectileDesigns.length && p.lens.rev === (inp.rev ?? 0) && p.reg === reg && p.built === built) {
    if (when === 'now') p.urgent();
    return p.promise;
  }
  const steps = buildCatalogSteps(inp);
  const lens: CatalogLens = { lib: inp.tankLibrary.length, other: inp.otherLibrary.length, designs: inp.projectileDesigns.length, rev: inp.rev ?? 0 };
  let mode: 'now' | 'idle' = when;
  let resolveFn: (c: LibCatalog) => void = () => {};
  const promise = new Promise<LibCatalog>(r => { resolveFn = r; });
  const mc = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
  let finished = false, slices = 0, stepsRun = 0;
  const run = (budgetEnd: number) => {
    if (finished) return true;
    slices++;
    for (;;) {
      const r = steps.next();
      stepsRun++;
      if (r.done) {
        finished = true;
        _lastSlices = slices; _lastSteps = stepsRun;
        keepCatalog(inp, r.value, reg, built, lens);
        if (_slicing && _slicing.promise === promise) _slicing = null;
        if (mc) mc.port1.close();
        resolveFn(r.value);
        return true;
      }
      if (performance.now() >= budgetEnd) return false;
    }
  };
  const next = () => {
    if (mode === 'idle' && typeof requestIdleCallback === 'function') {
      requestIdleCallback((dl) => { if (!run(performance.now() + (dl.didTimeout ? 4 : Math.max(1, dl.timeRemaining() - 1)))) next(); }, { timeout: 300 });
    } else if (mc) mc.port2.postMessage(0);
    else setTimeout(() => { if (!run(performance.now() + SLICE_MS)) next(); }, 0);
  };
  if (mc) mc.port1.onmessage = () => { if (!run(performance.now() + SLICE_MS)) next(); };
  _slicing = { inp, lens, reg, built, promise, urgent: () => { if (mode !== 'now') { mode = 'now'; next(); } } };
  next();
  return promise;
}

export function buildCatalog(inp: CatalogInputs): LibCatalog {
  const steps = buildCatalogSteps(inp);
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

function* buildCatalogSteps(inp: CatalogInputs): Generator<void, LibCatalog, void> {
  let pace = 0;
  const built = _built;
  const trees = treeFacts();
  const designsByName = new Map<string, DesignOfName[]>();
  for (const it of inp.tankLibrary) {
    if (it.fileData.type === 'CustomProjectile') addDesignOfName(designsByName, it.id, it.name, it.fileData.category, it.fileData.data);
  }
  for (const d of inp.projectileDesigns) if (d?.name && !designsByName.has(d.name)) addDesignOfName(designsByName, 'pd-' + d.name, d.name, undefined, d);
  const liveKindOf = designKindFrom(designsByName);
  const kindOf: DesignKindOf = (n, carried) => (designsByName.has(n) ? liveKindOf(n, carried) : built?.designKinds[n]);

  const entries: LibEntry[] = [];
  const byKind: Record<LibKind, LibEntry[]> = { tank: [], turret: [], projectile: [], other: [], shape: [], sentry: [] };
  const byKey = new Map<string, LibEntry>();
  const byFileKey = new Map<string, LibEntry>();
  const firedBy = new Map<string, string[]>();
  let order = 0;

  const add = (e: LibEntry) => {
    if (byKey.has(e.key)) return;
    tagEntry(e);
    entries.push(e); byKind[e.kind].push(e); byKey.set(e.key, e);
  };
  const factsOf = (item: LibraryItem): CatalogFacts => {
    const b = built && item.source === 'data-library' ? built.facts[item.id] : undefined;
    return b ? b : catalogFacts(item.fileData.type, item.fileData.data, kindOf);
  };
  const baseEntry = (kind: LibKind, item: LibraryItem, collection: string, group: string, extra: string): LibEntry => {
    const mine = item.source !== 'data-library';
    const fileKey = kind === 'tank' ? shippedFileKey(item) : null;
    const name = (typeof item.name === 'string' && item.name.trim() !== '') ? item.name : (fileKey ?? 'Unnamed');
    const words = wordsOf(name);
    if (fileKey) for (const w of wordsOf(fileKey)) if (!words.includes(w)) words.push(w);
    return {
      key: kind + ':' + item.id, kind, id: item.id, name, item, shape: null, sentry: null, fileKey, mine,
      tier: !mine && fileKey ? (trees.tier.get(fileKey) ?? 0) : 0,
      collection: mine ? 'mine' : collection, group, facts: factsOf(item), tags: new Uint32Array(0),
      lower: name.toLowerCase(), words, extra: extra.toLowerCase(), order: order++, loadedAt: item.loadedAt || 0,
    };
  };

  for (const item of inp.tankLibrary) {
    const f: ExportFile = item.fileData;
    const cat = f.category || '';
    if (f.type === 'Tank') {
      const col = COLLECTION_OF_CATEGORY[cat] ?? 'otherCol';
      const e = baseEntry('tank', item, col, cat, cat + ' ' + (shippedFileKey(item) ?? ''));
      add(e);
      if (e.fileKey) byFileKey.set(e.fileKey, e);
      const walk = (ts: any[] | undefined) => { if (!ts) return; for (const t of ts) { const pt = t?.projectileType; const n = pt?.customProjectileDesignName; const d = n ? designOfName(designsByName.get(n), pt.customProjectileDesign) : undefined; if (d) { const k = 'projectile:' + d.id; let l = firedBy.get(k); if (!l) { l = []; firedBy.set(k, l); } if (!l.includes(e.key)) l.push(e.key); } walk(t?.autoSubTurrets); } };
      walk((f.data as TankConfig)?.turrets);
    } else if (f.type === 'TurretPreset') {
      const p = f.data as TurretPreset;
      const c = cat || p?.category || '';
      add(baseEntry('turret', item, c || 'otherCol', c, c));
    } else if (f.type === 'CustomProjectile') {
      add(baseEntry('projectile', item, cat || 'otherCol', cat, cat + ' ' + ((f.data as CustomProjectileDesign)?.visual ?? '')));
    }
    if ((++pace & 15) === 0) yield;
  }
  const knownDesign = new Set<string>();
  for (const e of byKind.projectile) { const d = e.item?.fileData.data as CustomProjectileDesign | undefined; if (d?.name) knownDesign.add(d.name); }
  for (const d of inp.projectileDesigns) {
    if (!d?.name || knownDesign.has(d.name)) continue;
    knownDesign.add(d.name);
    const item: LibraryItem = { id: 'pd-' + d.name, name: d.name, fileData: { version: '1.0.0', type: 'CustomProjectile', name: d.name, timestamp: 0, data: d }, loadedAt: 0, source: 'manual-import' };
    add(baseEntry('projectile', item, 'mine', '', d.visual ?? ''));
  }
  for (const item of inp.otherLibrary) {
    const cat = item.fileData.category || '';
    const e = baseEntry('other', item, cat || 'otherCol', cat, cat);
    add(e);
    if ((++pace & 15) === 0) yield;
  }
  const userRows = new Map<string, LibraryItem>();
  for (const it of inp.tankLibrary) if (it.fileData.type === 'FoodShape') userRows.set(it.id, it);
  const SHAPE_CATS: ShapeCategory[] = ['base', 'rarity', 'laby', 'scaled', 'special', 'crasher', 'polyhedron'];
  const shapeEntry = (def: ShapeDefinition, collection: string) => {
    const row = def.category === 'user' ? (userRows.get('shape-' + def.id) ?? null) : null;
    const mine = def.category === 'user' && (!row || row.source !== 'data-library');
    const name = def.displayName;
    const e: LibEntry = {
      key: 'shape:' + def.id, kind: 'shape', id: def.id, name, item: row, shape: def, sentry: null, fileKey: null, mine,
      tier: 0, collection: mine ? 'mine' : def.look ? 'relic' : collection, group: def.category, facts: [0, 0, 0, def.sides], tags: new Uint32Array(0),
      lower: name.toLowerCase(), words: wordsOf(name), extra: (def.category + ' ' + def.rarity + ' ' + def.baseShape + (def.look ? ' relic ' + relicGemOf(def) : '')).toLowerCase(),
      order: order++, loadedAt: row?.loadedAt || 0,
    };
    add(e);
  };
  for (const cat of SHAPE_CATS) { const defs = SHAPE_DEFS_BY_CATEGORY.get(cat); if (defs) for (const d of defs) { shapeEntry(d, cat); if ((++pace & 15) === 0) yield; } }
  for (const d of getUserShapeDefs()) { shapeEntry(d, 'user'); if ((++pace & 15) === 0) yield; }
  const xpOf = (key: string, xp: number) => { const c = SENTRY_ENEMY_CONFIGS[key]; return c && c.xpValue > 0 ? c.xpValue : xp; };
  const sentry = (pool: 'sentry' | 'sentinel', table: Record<string, { label: string; tankConfig: TankConfig }>, hp: number, xp: number) => {
    for (const key of Object.keys(table)) {
      const v = table[key];
      const e: LibEntry = {
        key: 'sentry:' + key, kind: 'sentry', id: key, name: v.label, item: null, shape: null,
        sentry: { key, label: v.label, tankConfig: v.tankConfig, pool, hp, xp: xpOf(key, xp) }, fileKey: null, mine: false, tier: 0,
        collection: pool, group: pool, facts: catalogFacts('Tank', v.tankConfig, kindOf), tags: new Uint32Array(0),
        lower: v.label.toLowerCase(), words: wordsOf(v.label), extra: pool, order: order++, loadedAt: 0,
      };
      add(e);
    }
  };
  sentry('sentry', SENTRY_TANK_CONFIGS, 6, 1500);
  sentry('sentinel', SENTINEL_TANK_CONFIGS, 6, 26668);

  return {
    entries, byKind, byKey, byFileKey, parents: trees.parents, children: trees.children, firedBy,
    version: `${inp.tankLibrary.length}:${inp.otherLibrary.length}:${getShapeRegistryVersion()}:${built ? 1 : 0}`,
  };
}

export type SortId = 'best' | 'name' | 'tier' | 'newest' | 'used';
export const SORT_LABEL: Record<SortId, string> = { best: 'Best match', name: 'Name', tier: 'Tier', newest: 'Newest', used: 'Most used' };

export interface KindFilter { inc: number[]; }
export function emptyKindFilter(kind: LibKind): KindFilter {
  return { inc: new Array(KIND_GROUPS[kind].length).fill(0) };
}

export interface FilterContext { fav: ReadonlySet<string>; recent: ReadonlySet<string>; used: ReadonlyMap<string, number>; }

export interface FilterResult {
  list: LibEntry[];
  counts: number[][];
  visible: boolean[];
}

function tagOf(e: LibEntry, gi: number, g: FilterGroup, ctx: FilterContext): number {
  if (!g.dynamic) return e.tags[gi];
  return (ctx.fav.has(e.key) ? 1 : 0) | (ctx.recent.has(e.key) ? 2 : 0);
}

const _lev = new Int32Array(64 * 2);
export function editDistance(a: string, b: string, max: number): number {
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > max) return max + 1;
  if (n > 62 || m > 62) return max + 1;
  let prev = 0, cur = 64;
  for (let j = 0; j <= m; j++) _lev[prev + j] = j;
  for (let i = 1; i <= n; i++) {
    _lev[cur] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(_lev[prev + j] + 1, _lev[cur + j - 1] + 1, _lev[prev + j - 1] + cost);
      _lev[cur + j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev; prev = cur; cur = t;
  }
  return _lev[prev + m];
}

export function searchScore(e: LibEntry, tokens: readonly string[]): number {
  let total = 0;
  for (let ti = 0; ti < tokens.length; ti++) {
    const t = tokens[ti];
    let s = 0;
    if (e.lower === t) s = 120;
    else if (e.lower.startsWith(t)) s = 100;
    else {
      for (const w of e.words) { if (w === t) { s = Math.max(s, 90); break; } if (w.startsWith(t)) s = Math.max(s, 80); }
      if (s === 0 && e.lower.includes(t)) s = 60;
      if (s === 0 && e.extra.includes(t)) s = 30;
      if (s === 0 && t.length >= 3) {
        const max = t.length >= 7 ? 2 : 1;
        for (const w of e.words) {
          if (w.length < 3) continue;
          if (editDistance(t, w, max) <= max) { s = Math.max(s, 25); break; }
          for (let L = t.length - 1; L <= t.length + 1; L++) {
            if (L < 3 || L >= w.length) continue;
            if (editDistance(t, w.slice(0, L), max) <= max) { s = Math.max(s, 20); break; }
          }
          if (s > 0) break;
        }
      }
    }
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

export function tokenize(q: string): string[] {
  const out: string[] = [];
  for (const p of q.toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (p) out.push(p);
  return out;
}

const COLLECTION_RANK: Record<string, number> = {};
TANK_COLLECTIONS.forEach((op, i) => { COLLECTION_RANK[op.id] = i; });

export function runFilter(entries: readonly LibEntry[], kind: LibKind, f: KindFilter, query: string, sort: SortId, ctx: FilterContext, allowed?: (e: LibEntry) => boolean): FilterResult {
  const groups = KIND_GROUPS[kind];
  const G = groups.length;
  const colInc = f.inc[0] ?? 0;
  const visible: boolean[] = groups.map(g => {
    if (!g.showWith) return true;
    const bit = optBit(kind, 'collection', g.showWith);
    return (colInc & bit) !== 0;
  });
  const tokens = tokenize(query);
  const counts: number[][] = groups.map(g => new Array(g.options.length).fill(0));
  const pass: LibEntry[] = [];
  const scores = new Map<LibEntry, number>();
  const tags = new Uint32Array(G);
  for (const e of entries) {
    if (allowed && !allowed(e)) continue;
    let score = 1;
    if (tokens.length > 0) { score = searchScore(e, tokens); if (score === 0) continue; }
    let failed = -1, fails = 0;
    for (let gi = 0; gi < G; gi++) {
      const m = tagOf(e, gi, groups[gi], ctx);
      tags[gi] = m;
      const inc = visible[gi] ? (f.inc[gi] ?? 0) : 0;
      const ok = inc === 0 || (m & inc) !== 0;
      if (!ok) { fails++; failed = gi; if (fails > 1) break; }
    }
    if (fails > 1) continue;
    for (let gi = 0; gi < G; gi++) {
      if (fails === 1 && gi !== failed) continue;
      const m = tags[gi];
      if (m === 0) continue;
      const cg = counts[gi];
      for (let b = 0; b < cg.length; b++) if ((m >>> b) & 1) cg[b]++;
    }
    if (fails === 0) { pass.push(e); if (tokens.length > 0) scores.set(e, score); }
  }
  const byName = (a: LibEntry, b: LibEntry) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : a.order - b.order);
  const tierKey = (e: LibEntry) => (e.tier > 0 ? e.tier : 99);
  switch (sort) {
    case 'name': pass.sort(byName); break;
    case 'tier': pass.sort((a, b) => tierKey(a) - tierKey(b) || byName(a, b)); break;
    case 'newest': pass.sort((a, b) => (b.loadedAt - a.loadedAt) || (b.order - a.order)); break;
    case 'used': pass.sort((a, b) => ((ctx.used.get(b.key) ?? 0) - (ctx.used.get(a.key) ?? 0)) || byName(a, b)); break;
    default:
      if (tokens.length > 0) pass.sort((a, b) => ((scores.get(b) ?? 0) - (scores.get(a) ?? 0)) || tierKey(a) - tierKey(b) || byName(a, b));
      else if (kind === 'tank') pass.sort((a, b) => ((COLLECTION_RANK[a.collection] ?? 99) - (COLLECTION_RANK[b.collection] ?? 99)) || tierKey(a) - tierKey(b) || byName(a, b));
      else pass.sort((a, b) => a.order - b.order);
  }
  return { list: pass, counts, visible };
}
