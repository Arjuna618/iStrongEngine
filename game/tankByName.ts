import type { LibraryItem } from '../types';
import { SMALL_FIX } from './smallFixSwitch';
import * as TREE_DATA from './evolutionTrees.generated';

export const TANK_NAMES: { OLD_FIRST: number } = { OLD_FIRST: 1 };

export function isCardKeyItem(item: LibraryItem): boolean {
  const id = item.id;
  if (!id) return false;
  const s = id.lastIndexOf('/'), d = id.lastIndexOf('.');
  if (s < 0 || d - s - 1 !== 16) return false;
  for (let i = s + 1; i < d; i++) {
    const c = id.charCodeAt(i);
    if (!((c >= 48 && c <= 57) || (c >= 97 && c <= 102))) return false;
  }
  return true;
}

const _oldNames: ReadonlyMap<string, string> = new Map((TREE_DATA as unknown as { TANK_OLD_NAMES?: readonly (readonly [string, string])[] }).TANK_OLD_NAMES ?? []);

function findByOldName(lib: LibraryItem[], name: string, tanksOnly: boolean): LibraryItem | null {
  const key = _oldNames.get(name);
  return key === undefined ? null : findByFileKey(lib, key, tanksOnly);
}

export function findByShownName(lib: LibraryItem[] | null | undefined, name: string, tanksOnly: boolean): LibraryItem | null {
  if (!lib) return null;
  let card: LibraryItem | null = null;
  for (let i = 0; i < lib.length; i++) {
    const it = lib[i];
    if (it.name !== name) continue;
    if (tanksOnly && it.fileData.type !== 'Tank') continue;
    if (TANK_NAMES.OLD_FIRST === 0 || !isCardKeyItem(it)) return it;
    if (card === null) card = it;
  }
  return card ?? findByOldName(lib, name, tanksOnly);
}

export function findTankByNameOrKey(lib: LibraryItem[] | null | undefined, word: string): LibraryItem | null {
  if (!lib) return null;
  let card: LibraryItem | null = null;
  const inPath = '/' + word + '.';
  for (let i = 0; i < lib.length; i++) {
    const it = lib[i];
    if (it.fileData.type !== 'Tank') continue;
    if (it.name === word) {
      if (TANK_NAMES.OLD_FIRST === 0 || !isCardKeyItem(it)) return it;
      if (card === null) card = it;
      continue;
    }
    if (it.id.indexOf(inPath) !== -1) return it;
  }
  return card ?? findByOldName(lib, word, true);
}

export function fileKeyOf(item: LibraryItem): string {
  const id = item.id;
  if (!id || !id.endsWith('.json')) return '';
  const s = id.lastIndexOf('/');
  return s < 0 ? '' : id.slice(s + 1, id.length - 5);
}

function findByFileKey(lib: LibraryItem[], key: string, tanksOnly: boolean): LibraryItem | null {
  if (key === '') return null;
  const inPath = '/' + key + '.json';
  for (let i = 0; i < lib.length; i++) {
    const it = lib[i];
    if (tanksOnly && it.fileData.type !== 'Tank') continue;
    if (it.id.endsWith(inPath)) return it;
  }
  return null;
}

export function pickWordOf(lib: LibraryItem[] | null | undefined, item: LibraryItem, tanksOnly: boolean): string {
  if (SMALL_FIX.BH09 === 0 || !lib) return item.name;
  if (findByShownName(lib, item.name, tanksOnly) === item) return item.name;
  const k = fileKeyOf(item);
  return k !== '' && findByShownName(lib, k, tanksOnly) === null ? k : item.name;
}

export function pickBarrelWordOf(lib: LibraryItem[] | null | undefined, item: LibraryItem): string {
  if (SMALL_FIX.BH09 === 0 || !lib) return item.name;
  if (findTankByNameOrKey(lib, item.name) === item) return item.name;
  const k = fileKeyOf(item);
  return k !== '' && findTankByNameOrKey(lib, k) === item ? k : item.name;
}

export function findByShownNameOrFileKey(lib: LibraryItem[] | null | undefined, word: string, tanksOnly: boolean): LibraryItem | null {
  const byName = findByShownName(lib, word, tanksOnly);
  if (byName !== null || SMALL_FIX.BH09 === 0 || !lib) return byName;
  return findByFileKey(lib, word, tanksOnly);
}

export function wordsOfFileInto(lib: LibraryItem[] | null | undefined, item: LibraryItem, tanksOnly: boolean, keyMap: ReadonlyMap<string, LibraryItem> | null, into: Set<string>): void {
  if (findByShownName(lib, item.name, tanksOnly) === item) into.add(item.name);
  const k = fileKeyOf(item);
  const other = k !== '' && keyMap !== null ? keyMap.get(k) : undefined;
  if (k !== '' && (other === undefined || other.id === item.id)) into.add(k);
}

export function shownNameOfWord(lib: LibraryItem[] | null | undefined, word: string, tanksOnly: boolean): string {
  if (SMALL_FIX.BH09 === 0) return word;
  const it = findByShownNameOrFileKey(lib, word, tanksOnly);
  return it ? it.name : word;
}
