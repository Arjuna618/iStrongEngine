import type { LibraryItem } from '../types';

export const BOSS_COPIES: { ON: number } = { ON: 1 };
export const BOSS_COPY_PREFIX = 'booktest_';
export const BOSS_COPY_CATEGORY = 'Bosses (new)';

export const BOSS_NEW: Readonly<Record<string, { name: string; category: string; menu: string; group: string }>> = {
  deltaSkimmer: { name: 'Delta Skimmer', category: 'Elites', menu: 'menu_deltas', group: 'Deltas' },
  deltaSpawner: { name: 'Delta Spawner', category: 'Elites', menu: 'menu_deltas', group: 'Deltas' },
};

function keyOfId(id: string): string {
  const s = id.lastIndexOf('/'), d = id.lastIndexOf('.');
  return s >= 0 && d > s ? id.substring(s + 1, d) : '';
}
const isCopy = (item: LibraryItem, key: string): boolean =>
  key.startsWith(BOSS_COPY_PREFIX) && item.fileData.type === 'Tank' && item.fileData.category === BOSS_COPY_CATEGORY;
function newItemOf(copy: LibraryItem, key: string): LibraryItem {
  const def = BOSS_NEW[key];
  return { ...copy, name: def.name, fileData: { ...copy.fileData, name: def.name, category: def.category } };
}

interface BossCopyIndex {
  lib: LibraryItem[] | null; len: number; on: number;
  byHisId: Map<string, unknown>;
  newByName: Map<string, LibraryItem>;
  count: number;
}
let _ix: BossCopyIndex = { lib: null, len: -1, on: -1, byHisId: new Map(), newByName: new Map(), count: 0 };

function indexOf(lib: LibraryItem[] | undefined): BossCopyIndex {
  const l = lib ?? null;
  if (_ix.lib === l && _ix.len === (l ? l.length : 0) && _ix.on === BOSS_COPIES.ON) return _ix;
  const ix: BossCopyIndex = { lib: l, len: l ? l.length : 0, on: BOSS_COPIES.ON, byHisId: new Map(), newByName: new Map(), count: 0 };
  if (l && BOSS_COPIES.ON !== 0) {
    const byKey = new Map<string, LibraryItem>();
    for (let i = 0; i < l.length; i++) { if (l[i].fileData.type !== 'Tank') continue; const k = keyOfId(l[i].id || ''); if (k) byKey.set(k, l[i]); }
    for (const [key, item] of byKey) {
      if (!isCopy(item, key)) continue;
      const hisKey = key.substring(BOSS_COPY_PREFIX.length), his = byKey.get(hisKey);
      if (his) { ix.byHisId.set(his.id, item.fileData.data); ix.count++; }
      else if (BOSS_NEW[hisKey]) { ix.newByName.set(BOSS_NEW[hisKey].name, newItemOf(item, hisKey)); ix.count++; }
    }
  }
  _ix = ix;
  return ix;
}

export function bossCopiesIn(lib: LibraryItem[] | undefined): boolean {
  return indexOf(lib).count > 0;
}

export function standInBossCopies(map: Map<string, LibraryItem>): number {
  if (BOSS_COPIES.ON === 0) return 0;
  let n = 0;
  const keys = Array.from(map.keys());
  for (let i = 0; i < keys.length; i++) {
    const copyKey = keys[i];
    const copy = map.get(copyKey)!;
    if (!isCopy(copy, copyKey)) continue;
    const hisKey = copyKey.substring(BOSS_COPY_PREFIX.length);
    const his = map.get(hisKey);
    if (his && his.fileData.type === 'Tank') { map.set(hisKey, { ...his, fileData: { ...his.fileData, data: copy.fileData.data } }); n++; }
    else if (!his && BOSS_NEW[hisKey]) { map.set(hisKey, newItemOf(copy, hisKey)); n++; }
  }
  return n;
}

export function bossPlayedData(lib: LibraryItem[] | undefined, item: LibraryItem): unknown {
  const d = indexOf(lib).byHisId.get(item.id);
  return d !== undefined ? d : (item.fileData as { data?: unknown }).data;
}

export function bossNewByName(lib: LibraryItem[] | undefined, name: string): LibraryItem | null {
  return indexOf(lib).newByName.get(name) ?? null;
}

const NEW_NAMES: ReadonlySet<string> = new Set(Object.keys(BOSS_NEW).map((k) => BOSS_NEW[k].name));

export function bossTanksInLibrary(lib: LibraryItem[] | undefined, tanks: string[]): string[] {
  let drop = false;
  for (let i = 0; i < tanks.length; i++) if (NEW_NAMES.has(tanks[i]) && !newBossIn(lib, tanks[i])) { drop = true; break; }
  if (!drop) return tanks;
  return tanks.filter((n) => !NEW_NAMES.has(n) || newBossIn(lib, n));
}
function newBossIn(lib: LibraryItem[] | undefined, name: string): boolean {
  if (indexOf(lib).newByName.has(name)) return true;
  if (lib) for (let i = 0; i < lib.length; i++) if (lib[i].name === name && lib[i].fileData.type === 'Tank') return true;
  return false;
}
