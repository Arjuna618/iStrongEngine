import { BOOK_TREES } from './evolutionTrees.generated';
import * as TREE_DATA from './evolutionTrees.generated';

const _g = globalThis as { __ISTRONG_OLD_TREES?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_TREES === 1 || _g.process?.env?.ISTRONG_OLD_TREES === '1';

export const TREE_PAGES: number = _old ? 0 : 1;

export interface BookTreeEntry { tier: number; upgrades: string[]; layoutTier?: number; }

interface PageDef { menu: string; after: string; label: string; listColours: boolean; }
const PAGE_DEFS: Readonly<Record<string, PageDef>> = {
  'arms-race': { menu: 'menu_tanks', after: 'basic', label: 'Arms Race', listColours: true },
  'dreads': { menu: 'menu_addons', after: 'dreadOfficialV1', label: 'New (V2)', listColours: false },
};
const OWN_CARD_LABELS: Readonly<Record<string, string>> = { dreadOfficialV1: 'Old (V1)' };

export interface BookTreePage {
  page: string;
  root: string;
  keys: string[];
  menu: string; after: string; label: string;
}

export const BOOK_TREE_PAGES: BookTreePage[] = [];
export const BOOK_TREE_ENTRIES: Record<string, BookTreeEntry[]> = {};

const _rootOf = new Map<string, string>();
const _startsListColours = new Set<string>();
const _cardLabel = new Map<string, string>();
const _fileOf = new Map<string, string>();
const _stands = (TREE_DATA as unknown as { BOOK_TREE_STANDS?: readonly (readonly [string, string])[] }).BOOK_TREE_STANDS ?? [];

if (TREE_PAGES !== 0) {
  for (let t = 0; t < BOOK_TREES.length; t++) {
    const data = BOOK_TREES[t];
    const def = PAGE_DEFS[data.page];
    if (!def) continue;
    const keys = data.keys.slice();
    const root = keys[data.root];
    for (let i = 0; i < data.lists.length; i++) {
      const list = data.lists[i];
      const parent = keys[list[0]];
      const ups: string[] = new Array(list.length - 2);
      for (let j = 2; j < list.length; j++) ups[j - 2] = keys[list[j]];
      (BOOK_TREE_ENTRIES[parent] ??= []).push({ tier: 0, layoutTier: list[1], upgrades: ups });
      if (def.listColours) _startsListColours.add(parent);
    }
    for (let i = 0; i < keys.length; i++) _rootOf.set(keys[i], root);
    for (let i = 0; i < data.files.length; i++) _fileOf.set(keys[data.files[i][0]], data.files[i][1]);
    _cardLabel.set(root, def.label);
    BOOK_TREE_PAGES.push({ page: data.page, root, keys, menu: def.menu, after: def.after, label: def.label });
  }
  for (const k of Object.keys(OWN_CARD_LABELS)) _cardLabel.set(k, OWN_CARD_LABELS[k]);
}

export function bookTreeRootOf(key: string): string | undefined { return _rootOf.get(key); }
export function bookTreeRootOfPage(page: string): string | undefined { const d = BOOK_TREES.find(t => t.page === page); return d && PAGE_DEFS[page] && TREE_PAGES !== 0 ? d.keys[d.root] : undefined; }
export function isBookTreeKey(key: string): boolean { return _rootOf.has(key); }
export function bookTreeStartsListColours(key: string): boolean { return _startsListColours.has(key); }

export function bookTreeFileKey(key: string): string | undefined { return _fileOf.get(key); }

export function standInBookTreeFiles<T>(map: Map<string, T>): number {
  if (_fileOf.size === 0) return 0;
  let n = 0;
  for (const [key, file] of _fileOf) {
    if (map.has(key)) continue;
    const item = map.get(file);
    if (item === undefined) continue;
    map.set(key, item);
    n++;
  }
  for (let i = 0; i < _stands.length; i++) { const item = map.get(_stands[i][1]); if (item !== undefined && map.has(_stands[i][0])) { map.set(_stands[i][0], item); n++; } }
  return n;
}

export function withPageCards(menu: string, list: string[]): string[] {
  let out = list;
  for (let i = 0; i < BOOK_TREE_PAGES.length; i++) {
    const p = BOOK_TREE_PAGES[i];
    if (p.menu !== menu) continue;
    if (out === list) out = list.slice();
    const at = out.indexOf(p.after);
    out.splice(at >= 0 ? at + 1 : out.length, 0, p.root);
  }
  return out;
}

export function pageCardLabel(key: string): string | undefined { return _cardLabel.get(key); }
