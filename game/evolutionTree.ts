export const TIER_LEVELS = { 1: 0, 2: 0, 3: 0 } as const;

export interface EvolutionEntry { tier: number; upgrades: string[]; layoutTier?: number; }

export const EVOLUTION_TREE: Record<string, EvolutionEntry[]> = {
  basic: [
    { tier: 0, layoutTier: 1, upgrades: ['twin', 'sniper', 'machineGun', 'flankGuard', 'director', 'pounder', 'trapper'] },
    { tier: 0, layoutTier: 2, upgrades: ['smasher'] },
  ],

  twin: [
    { tier: 0, layoutTier: 2, upgrades: ['doubleTwin', 'tripleShot', 'gunner', 'hexaTank'] },
    { tier: 0, layoutTier: 3, upgrades: ['dual', 'bulwark', 'musket'] },
  ],
  doubleTwin:  [{ tier: 0, layoutTier: 3, upgrades: ['tripleTwin', 'hewnDouble', 'autoDouble', 'bentDouble'] }],
  tripleShot:  [{ tier: 0, layoutTier: 3, upgrades: ['pentaShot', 'spreadshot', 'bentHybrid', 'bentDouble', 'triplet'] }],
  gunner:      [{ tier: 0, layoutTier: 3, upgrades: ['autoGunner', 'nailgun', 'auto4', 'machineGunner', 'gunnerTrapper', 'cyclone', 'overgunner'] }],

  sniper: [
    { tier: 0, layoutTier: 2, upgrades: ['assassin', 'hunter', 'minigun', 'rifle', 'marksman'] },
    { tier: 0, layoutTier: 3, upgrades: ['bushwhacker'] },
  ],
  assassin:  [{ tier: 0, layoutTier: 3, upgrades: ['ranger', 'falcon', 'stalker', 'autoAssassin', 'single', 'deadeye'] }],
  hunter:    [{ tier: 0, layoutTier: 3, upgrades: ['predator', 'xHunter', 'poacher', 'ordnance', 'dual', 'nimrod'] }],
  rifle:     [{ tier: 0, layoutTier: 3, upgrades: ['musket', 'crossbow', 'armsman', 'revolver'] }],
  marksman:  [{ tier: 0, layoutTier: 3, upgrades: ['deadeye', 'nimrod', 'revolver', 'fork'] }],

  machineGun: [{ tier: 0, layoutTier: 2, upgrades: ['artillery', 'minigun', 'gunner', 'sprayer'] }],
  minigun:    [{ tier: 0, layoutTier: 3, upgrades: ['streamliner', 'nailgun', 'cropDuster', 'barricade', 'vulture'] }],
  sprayer:    [{ tier: 0, layoutTier: 3, upgrades: ['redistributor', 'phoenix', 'atomizer', 'focal'] }],

  flankGuard: [
    { tier: 0, layoutTier: 2, upgrades: ['hexaTank', 'triAngle', 'auto3', 'trapGuard', 'triTrapper'] },
    { tier: 0, layoutTier: 3, upgrades: ['tripleTwin'] },
  ],
  hexaTank:  [{ tier: 0, layoutTier: 3, upgrades: ['octoTank', 'cyclone', 'hexaTrapper'] }],
  triAngle:  [{ tier: 0, layoutTier: 3, upgrades: ['fighter', 'booster', 'falcon', 'bomber', 'autoTriAngle', 'surfer', 'eagle', 'phoenix', 'vulture'] }],
  auto3:     [{ tier: 0, layoutTier: 3, upgrades: ['auto5', 'mega3', 'auto4', 'banshee'] }],

  director: [
    { tier: 0, layoutTier: 2, upgrades: ['overseer', 'cruiser', 'underseer', 'spawner'] },
    { tier: 0, layoutTier: 3, upgrades: ['manager', 'bigCheese'] },
  ],
  overseer:  [{ tier: 0, layoutTier: 3, upgrades: ['overlord', 'overtrapper', 'overgunner', 'banshee', 'autoOverseer', 'overdrive', 'commander'] }],
  cruiser:   [{ tier: 0, layoutTier: 3, upgrades: ['carrier', 'battleship', 'fortress', 'autoCruiser', 'commander'] }],
  underseer: [{ tier: 0, layoutTier: 3, upgrades: ['necromancer', 'maleficitor', 'infestor'] }],
  spawner:   [{ tier: 0, layoutTier: 3, upgrades: ['factory', 'autoSpawner'] }],

  pounder: [
    { tier: 0, layoutTier: 2, upgrades: ['destroyer', 'builder', 'artillery', 'launcher'] },
    { tier: 0, layoutTier: 3, upgrades: ['shotgun', 'eagle'] },
  ],
  destroyer: [{ tier: 0, layoutTier: 3, upgrades: ['conqueror', 'annihilator', 'hybrid', 'construct'] }],
  artillery: [{ tier: 0, layoutTier: 3, upgrades: ['mortar', 'ordnance', 'beekeeper', 'fieldGun'] }],
  launcher:  [{ tier: 0, layoutTier: 3, upgrades: ['skimmer', 'twister', 'swarmer', 'sidewinder', 'fieldGun'] }],

  trapper: [
    { tier: 0, layoutTier: 2, upgrades: ['builder', 'triTrapper', 'trapGuard'] },
    { tier: 0, layoutTier: 3, upgrades: ['barricade', 'overtrapper'] },
  ],
  builder:    [{ tier: 0, layoutTier: 3, upgrades: ['construct', 'autoBuilder', 'engineer', 'boomer', 'assembler', 'architect', 'conqueror'] }],
  triTrapper: [{ tier: 0, layoutTier: 3, upgrades: ['fortress', 'hexaTrapper', 'septaTrapper', 'architect'] }],
  trapGuard:  [{ tier: 0, layoutTier: 3, upgrades: ['bushwhacker', 'gunnerTrapper', 'bomber', 'conqueror', 'bulwark'] }],

  smasher: [{ tier: 0, layoutTier: 3, upgrades: ['megaSmasher', 'spike', 'autoSmasher', 'landmine'] }],
};

import { DEFAULT_TURRET_CONFIG } from '../types';
import { CM, CM_USE, CM_ARRAS_LIGHT, CM_ARRAS_DARK, cmHex } from '../utils/colorMap';
import type { TankConfig, Turret, ExportFile, LibraryItem } from '../types';
import { standInBossCopies } from './bossCopies';
import { TREE_PAGES, BOOK_TREE_ENTRIES, withPageCards, bookTreeRootOf, isBookTreeKey, standInBookTreeFiles, bookTreeFileKey } from './bookTrees';

const COLOR_IDX: Record<string, number> = {
  pink: CM.CRASHERS, gold: CM.SQUARES, purple: CM.PENTAGONS, darkGrey: CM.ROGUES, aqua: CM.HEXAGONS,
  orange: CM.TRIANGLES, lightGreen: CM.HEALTH_BARS, veryLightGrey: CM.EGGS, blue: CM.BLUE, grey: CM.BARRELS,
};

interface MenuTankDef {
  label: string;
  shape: number;
  colorIdx: number;
}

const MENU_TANK_DEFS: Record<string, MenuTankDef> = {
  developer:          { label: 'Developer',      shape: 4,    colorIdx: COLOR_IDX.blue },
  menu_tanks:         { label: 'Tanks',           shape: 0,    colorIdx: COLOR_IDX.blue },
  menu_bosses:        { label: 'Bosses',          shape: 0,    colorIdx: COLOR_IDX.blue },
  menu_addons:        { label: TREE_PAGES !== 0 ? 'Dreadnoughts' : 'Addons', shape: 0, colorIdx: COLOR_IDX.blue },
  menu_devTanks:      { label: 'Dev Tanks',       shape: 0,    colorIdx: COLOR_IDX.blue },
  menu_sentries:      { label: 'Sentries',        shape: 3.5,  colorIdx: COLOR_IDX.pink },
  menu_elites:        { label: 'Elites',          shape: 3.5,  colorIdx: COLOR_IDX.pink },
  menu_deltas:        { label: 'Deltas',          shape: 3,    colorIdx: COLOR_IDX.pink },
  menu_mysticals:     { label: 'Mysticals',       shape: 4,    colorIdx: COLOR_IDX.gold },
  menu_nesters:       { label: 'Nesters',         shape: 5.5,  colorIdx: COLOR_IDX.purple },
  menu_rogues:        { label: 'Rogues',          shape: 6,    colorIdx: COLOR_IDX.darkGrey },
  menu_rammers:       { label: 'Rammers',         shape: 0,    colorIdx: COLOR_IDX.aqua },
  menu_terrestrials:  { label: 'Terrestrials',    shape: 7,    colorIdx: COLOR_IDX.orange },
  menu_celestials:    { label: 'Celestials',      shape: 9,    colorIdx: COLOR_IDX.lightGreen },
  menu_eternals:      { label: 'Eternals',        shape: 11,   colorIdx: COLOR_IDX.veryLightGrey },
  menu_mapEntities:   { label: 'Map Entities',    shape: 0,    colorIdx: COLOR_IDX.blue },
  menu_dominators:    { label: 'Dominators',      shape: 0,    colorIdx: COLOR_IDX.blue },
  menu_sanctuaries:   { label: 'Sanctuaries',     shape: 0,    colorIdx: COLOR_IDX.blue },
  menu_motherships:   { label: 'Motherships',     shape: 16,   colorIdx: COLOR_IDX.blue },
};

const DEV_MENU_TREE: Record<string, EvolutionEntry[]> = {
  developer:        [{ tier: 0, upgrades: ['menu_tanks', 'menu_bosses', 'menu_addons', 'menu_devTanks'] }],
  menu_devTanks:    [{ tier: 0, upgrades: ['cf638e8e4ef3a0dc', 'a8f560ef96464385', '1431d2f60d89f78a', 'd65f01c433f8f9b6', '449f411da42db2f2', '7532355bb5c8da5e'] }],
  menu_tanks:       [{ tier: 0, upgrades: withPageCards('menu_tanks', ['basic', 'arenaCloser', 'menu_mapEntities', 'menu_motherships']) }],
  menu_bosses:      [{ tier: 0, upgrades: ['menu_sentries', 'menu_elites', 'menu_mysticals', 'menu_nesters', 'menu_rogues', 'menu_rammers', 'menu_terrestrials', 'menu_celestials', 'menu_eternals'] }],
  menu_addons:      [{ tier: 0, upgrades: withPageCards('menu_addons', ['dreadOfficialV1']) }],
  menu_elites:      [{ tier: 0, upgrades: [
    'eliteDestroyer', 'eliteGunner', 'eliteSprayer', 'eliteBattleship',
    'eliteSpawner', 'eliteTrapGuard', 'eliteSpinner', 'eliteSkimmer',
    'legionaryCrasher', 'sprayerLegion', 'menu_deltas',
  ] }],
  menu_deltas:      [{ tier: 0, upgrades: ['deltaDestroyer', 'deltaGunner', 'deltaSprayer', 'deltaBattleship', 'deltaSkimmer', 'deltaSpawner'] }],
  menu_sentries:    [{ tier: 0, upgrades: [
    'sentrySwarm', 'sentryGun', 'sentryTrap',
    'sentinelSwarm', 'sentinelGun', 'sentinelTrap',
    'shinySentrySwarm', 'shinySentryGun', 'shinySentryTrap',
    'sentinelMinigun', 'sentinelLauncher', 'sentinelCrossbow',
  ] }],
  menu_mysticals:   [{ tier: 0, upgrades: ['sorcerer', 'summoner', 'thaumaturge', 'enchantress', 'exorcistor', 'shaman', 'witch'] }],
  menu_nesters:     [{ tier: 0, upgrades: ['nestKeeper', 'nestWarden', 'nestGuardian', 'nestCurator', 'nestDeacon', 'nestChampion'] }],
  menu_rogues:      [{ tier: 0, upgrades: ['roguePalisade', 'rogueAlcazar', 'rogueArmada', 'julius', 'genghis', 'napoleon'] }],
  menu_rammers:     [{ tier: 0, upgrades: ['bob', 'nemesis'] }],
  menu_terrestrials:[{ tier: 0, upgrades: ['ares', 'gersemi', 'ezekiel', 'eris', 'selene'] }],
  menu_celestials:  [{ tier: 0, upgrades: [
    'paladin', 'freyja', 'zaphkiel', 'nyx', 'theia',
    'atlas', 'hera', 'horus', 'anubis', 'isis',
    'tethys', 'ullr', 'dellingr', 'osiris', 'alcis',
    'khonsu', 'baldr', 'nephthys', 'tyr', 'vor',
    'aether', 'iapetus', 'apollo', 'eros', 'hjordis',
    'sif', 'freyr', 'styx', 'hyperion', 'ptah',
    'julius', 'genghis', 'napoleon',
  ] }],
  menu_eternals:    [{ tier: 0, upgrades: ['ragnarok', 'kronos', 'amun'] }],
  menu_mapEntities: [{ tier: 0, upgrades: ['menu_dominators', 'baseProtector', 'antiTankMachineGun', 'menu_sanctuaries'] }],
  menu_dominators:  [{ tier: 0, upgrades: ['destroyerDominator', 'gunnerDominator', 'trapperDominator'] }],
  menu_sanctuaries: [{ tier: 0, upgrades: ['sanctuaryTier1', 'sanctuaryTier2', 'sanctuaryTier3', 'sanctuaryTier4', 'sanctuaryTier5', 'sanctuaryTier6'] }],
  menu_motherships: [{ tier: 0, upgrades: ['mothership', 'flagship'] }],
};

function _makeMenuGunTurret(): Turret {
  return {
    ...DEFAULT_TURRET_CONFIG,
    id: '_menu_gun',
    length: 9.5,
    width: 36,
    aspect: 0.7,
    angle: 0,
    animProgress: 0,
  } as Turret;
}

function _makeMenuTankConfig(def: MenuTankDef, dark: boolean): TankConfig {
  return {
    _configVersion: 5,
    tankSides: def.shape,
    tankSize: 9,
    tankColor: cmHex(def.colorIdx, dark, CM_USE.TANK),
    keepOwnColor: def.colorIdx !== COLOR_IDX.blue,
    tankHP: 100,
    tankBodyDamage: 1,
    tankMovementSpeed: 3,
    tankShieldRegen: 0,
    tankShieldCapacity: 0,
    maxSkillPoints: 42,
    maxPointsPerSkill: 10,
    bonusSkillPoints: 42,
    skillCaps: {} as any,
    preDefinedSkills: {} as any,
    canEarnSkillPoints: false,
    fovMultiplier: 1,
    turrets: [_makeMenuGunTurret()],
    mirrorMode: false,
    autoPlacement: false,
    autoPlacementCount: 6,
    snapPlacement: false,
    snapPlacementCount: 1,
    baseSpinEnabled: false,
    baseSpinSpeed: 50,
    baseSpinDirection: -1,
    primaryTurretId: null,
    useCustomAimDirection: false,
    customAimAngle: 0,
    cameraZoomEnabled: false,
    cameraZoomDistance: 225,
    statNamesType: 'generic',
  } as TankConfig;
}

let _menuItemsCache: Map<string, LibraryItem> | null = null;
let _menuItemsCacheDark: boolean | null = null;

export function getMenuTankLibraryItems(dark: boolean): Map<string, LibraryItem> {
  if (_menuItemsCache && _menuItemsCacheDark === dark) return _menuItemsCache;
  const map = new Map<string, LibraryItem>();
  for (const [name, def] of Object.entries(MENU_TANK_DEFS)) {
    const config = _makeMenuTankConfig(def, dark);
    const fileData: ExportFile = {
      version: '1.0',
      type: 'Tank',
      name: def.label,
      timestamp: 0,
      data: config,
    };
    map.set(name, {
      id: `_internal/${name}.json`,
      name: def.label,
      fileData,
      loadedAt: 0,
      source: 'data-library',
    });
  }
  _menuItemsCache = map;
  _menuItemsCacheDark = dark;
  return map;
}

export function isMenuTank(fileName: string): boolean {
  return fileName in MENU_TANK_DEFS;
}

export const DREAD_V1_BODIES: string[] = [
  'swordOfficialV1',
  'pacifierOfficialV1',
  'invaderOfficialV1',
  'centaurOfficialV1',
  'automationOfficialV1',
  'juggernautOfficialV1',
  'medicareOfficialV1',
];

export const DREAD_V1_WEAPONS: Record<string, string[]> = {
  swordOfficialV1:      ['sabreOfficialV1', 'gladiusOfficialV1'],
  pacifierOfficialV1:   ['appeaserOfficialV1', 'peacekeeperOfficialV1', 'diplomatOfficialV1'],
  invaderOfficialV1:    ['inquisitorOfficialV1', 'assailantOfficialV1', 'infiltratorOfficialV1'],
  centaurOfficialV1:    ['cerberusOfficialV1', 'minotaurOfficialV1', 'sirenOfficialV1'],
  automationOfficialV1: ['mechanismOfficialV1'],
  juggernautOfficialV1: ['behemothOfficialV1'],
  medicareOfficialV1:   ['medicaidOfficialV1'],
};

export function buildDreadV1EvolutionTree(): Record<string, EvolutionEntry[]> {
  const tree: Record<string, EvolutionEntry[]> = {};

  tree['dreadOfficialV1'] = [{
    tier: 0,
    upgrades: ['swordOfficialV1', 'pacifierOfficialV1', 'invaderOfficialV1', 'centaurOfficialV1'],
  }];

  const mainBodies = ['swordOfficialV1', 'pacifierOfficialV1', 'invaderOfficialV1', 'centaurOfficialV1'];
  for (const body1 of mainBodies) {
    const combinedNames: string[] = [];
    for (const body2 of DREAD_V1_BODIES) {
      combinedNames.push(body1 + body2);
    }
    tree[body1] = [{ tier: 0, upgrades: combinedNames }];
  }

  for (const body1 of mainBodies) {
    const weapons1 = DREAD_V1_WEAPONS[body1] || [];
    for (const body2 of DREAD_V1_BODIES) {
      const weapons2 = DREAD_V1_WEAPONS[body2] || [];
      const combined = body1 + body2;
      if (weapons1.length > 0 && weapons2.length > 0) {
        const weaponCombos: string[] = [];
        for (const w1 of weapons1) {
          for (const w2 of weapons2) {
            weaponCombos.push(w1 + w2);
          }
        }
        tree[combined] = [{ tier: 0, upgrades: weaponCombos }];
      }
    }
  }

  return tree;
}

export function buildDreadV1GateLevels(): Record<string, number> {
  const gates: Record<string, number> = {};
  gates['dreadOfficialV1'] = 45;
  const mainBodies = ['swordOfficialV1', 'pacifierOfficialV1', 'invaderOfficialV1', 'centaurOfficialV1'];
  for (const body1 of mainBodies) {
    gates[body1] = 80;
    for (const body2 of DREAD_V1_BODIES) {
      gates[body1 + body2] = 120;
    }
  }
  return gates;
}

export const DREAD_V1_GATE_LEVELS: Record<string, number> = buildDreadV1GateLevels();

const _dreadTree = buildDreadV1EvolutionTree();

export const FULL_EVOLUTION_TREE: Record<string, EvolutionEntry[]> = {
  ...EVOLUTION_TREE,
  ..._dreadTree,
  ...DEV_MENU_TREE,
  ...BOOK_TREE_ENTRIES,
};

export const DEFAULT_TREE_ROOT = 'basic';

export const TREE_ROOTS: Record<string, string> = {
  dreadOfficialV1: 'dreadOfficialV1',
};

for (const t of [EVOLUTION_TREE, MENU_TANK_DEFS, DEV_MENU_TREE, FULL_EVOLUTION_TREE, TREE_ROOTS, DREAD_V1_GATE_LEVELS] as object[]) {
  Object.setPrototypeOf(t, null);
}

const _menuTankNames = new Set(Object.keys(MENU_TANK_DEFS));

let _mtGroups: Map<string, EvolutionEntry[]> | null = null;
let _mtRoot: Map<string, string> | null = null;
let _mtVersion = 0;
export function matchTreeGroups(key: string): EvolutionEntry[] | undefined {
  return _mtGroups !== null ? (_mtGroups.get(key) ?? FULL_EVOLUTION_TREE[key]) : FULL_EVOLUTION_TREE[key];
}
export function matchTreeVersion(): number { return _mtVersion; }
export function clearMatchTree(): void { if (_mtGroups !== null) { _mtGroups = null; _mtRoot = null; _mtVersion++; } }
export function swapMatchTree(from: string, to: string | undefined): void {
  const groups = _mtGroups ?? (_mtGroups = new Map());
  for (const parent of Object.keys(FULL_EVOLUTION_TREE)) {
    const now = groups.get(parent) ?? FULL_EVOLUTION_TREE[parent];
    let changed: EvolutionEntry[] | null = null;
    for (let i = 0; i < now.length; i++) {
      const list = now[i].upgrades;
      for (let j = 0; j < list.length; j++) {
        if (list[j] !== from && bookTreeFileKey(list[j]) !== from) continue;
        const onPage = list[j] !== from;
        const ups = list.slice();
        if (to && !onPage) ups[j] = to; else ups.splice(j, 1);
        if (!changed) changed = now.slice();
        changed[i] = { ...now[i], upgrades: ups };
        break;
      }
    }
    if (changed) groups.set(parent, changed);
  }
  if (to) (_mtRoot ?? (_mtRoot = new Map())).set(to, DEFAULT_TREE_ROOT);
  _mtVersion++;
}
export function addToMatchTree(parent: string, layoutTier: number, tanks: readonly string[]): void {
  const groups = _mtGroups ?? (_mtGroups = new Map());
  groups.set(parent, [...(groups.get(parent) ?? FULL_EVOLUTION_TREE[parent] ?? []), { tier: 0, layoutTier, upgrades: tanks.slice() }]);
  const root = getTreeRoot(parent);
  const roots = _mtRoot ?? (_mtRoot = new Map());
  for (const t of tanks) if (getTreeRoot(t) !== root) roots.set(t, root);
  _mtVersion++;
}

const _parentMap = new Map<string, string>();
let _parentMapBuilt = false;
function _ensureParentMap(): void {
  if (_parentMapBuilt) return;
  _parentMapBuilt = true;
  for (const [parent, entries] of Object.entries(FULL_EVOLUTION_TREE)) {
    for (const entry of entries) {
      for (const child of entry.upgrades) {
        if (!_parentMap.has(child)) _parentMap.set(child, parent);
      }
    }
  }
}

export function getTreeRoot(tankFileName: string): string {
  if (_mtRoot !== null) { const r = _mtRoot.get(tankFileName); if (r !== undefined) return r; }
  if (TREE_ROOTS[tankFileName]) return TREE_ROOTS[tankFileName];
  const bookRoot = bookTreeRootOf(tankFileName);
  if (bookRoot !== undefined) return bookRoot;
  if (_menuTankNames.has(tankFileName)) return tankFileName;
  if (EVOLUTION_TREE[tankFileName]) return DEFAULT_TREE_ROOT;
  _ensureParentMap();
  let current = tankFileName;
  let hops = _parentMap.size + 1;
  while (_parentMap.has(current) && hops-- > 0) {
    const parent = _parentMap.get(current)!;
    if (EVOLUTION_TREE[parent]) return DEFAULT_TREE_ROOT;
    if (_menuTankNames.has(parent)) return parent;
    if (TREE_ROOTS[parent]) return TREE_ROOTS[parent];
    current = parent;
  }
  return DEFAULT_TREE_ROOT;
}

export const ICON_COLOR_ORDER = [10, 11, 12, 15, 13, 2, 14, 4, 5, 1, 0, 3] as const;

export const ARRAS_PALETTE: readonly string[] = CM_ARRAS_LIGHT;
export const ARRAS_PALETTE_DARK: readonly string[] = CM_ARRAS_DARK;

export function getIconColor(colorIndex: number, dark = false): string {
  const paletteIdx = ICON_COLOR_ORDER[colorIndex % ICON_COLOR_ORDER.length];
  return cmHex(paletteIdx, dark, CM_USE.GENERAL) ?? '#555555';
}

export function getMenuTankColorIdx(fileName: string): number | undefined {
  return MENU_TANK_DEFS[fileName]?.colorIdx;
}

export const OD_COPIES: { ON: number } = { ON: 1 };
export const OD_COPY_PREFIX = 'booktest_';
export const OD_COPY_CATEGORY = 'Dreadnoughts V1 (new)';

export function odCopiesActive(mode: string | undefined): boolean {
  return OD_COPIES.ON !== 0 && mode === 'old-dreadnoughts';
}

export function standInOldDreadCopies(map: Map<string, LibraryItem>, mode: string | undefined): number {
  if (!odCopiesActive(mode)) return 0;
  let n = 0;
  const keys = Array.from(map.keys());
  for (let i = 0; i < keys.length; i++) {
    const copyKey = keys[i];
    if (!copyKey.startsWith(OD_COPY_PREFIX)) continue;
    const copy = map.get(copyKey)!;
    if (copy.fileData.type !== 'Tank' || copy.fileData.category !== OD_COPY_CATEGORY) continue;
    const hisKey = copyKey.substring(OD_COPY_PREFIX.length);
    const his = map.get(hisKey);
    if (!his || his.fileData.type !== 'Tank') continue;
    map.set(hisKey, { ...his, fileData: { ...his.fileData, data: copy.fileData.data } });
    n++;
  }
  return n;
}

export function buildTankLibraryMap(tankLibrary: LibraryItem[] | undefined, mode?: string): Map<string, LibraryItem> {
  const map = new Map<string, LibraryItem>();
  if (!tankLibrary) return map;
  for (let i = 0; i < tankLibrary.length; i++) {
    const item = tankLibrary[i];
    if (item.fileData.type !== 'Tank') continue;
    const id = item.id || '';
    const slashIdx = id.lastIndexOf('/');
    const dotIdx = id.lastIndexOf('.');
    if (slashIdx >= 0 && dotIdx > slashIdx) {
      map.set(id.substring(slashIdx + 1, dotIdx), item);
    }
  }
  standInOldDreadCopies(map, mode);
  standInBossCopies(map);
  standInBookTreeFiles(map);
  return map;
}

export function treeTierOfUpgrade(parent: string, pick: string, fromTier: number): number {
  const entries = matchTreeGroups(parent);
  if (entries) for (let i = 0; i < entries.length; i++) {
    if (entries[i].upgrades.indexOf(pick) !== -1) return entries[i].layoutTier !== undefined ? (entries[i].layoutTier as number) + 1 : fromTier + 1;
  }
  return fromTier + 1;
}
export function getUpgradesForTank(tankName: string, onBook: boolean = false): string[] {
  const entries = matchTreeGroups(tankName);
  if (!entries) return [];
  const result: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const upgrades = entries[i].upgrades;
    for (let j = 0; j < upgrades.length; j++) {
      if (result.indexOf(upgrades[j]) === -1 && (onBook || !isBookTreeKey(upgrades[j]))) {
        result.push(upgrades[j]);
      }
    }
  }
  return result;
}
