import type { GameLogic } from '../../game/GameLogic';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import { DataRegistry } from '../../game/DataRegistry';
import { wasLayerTrimmed } from '../../game/ValueClamp';
import { importChangesOf, importChangesWords } from '../../utils/importChanges';
import type { CustomProjectileDesign, ExportFile, LibraryItem, TurretPreset } from '../../types';

export interface ImportSummary {
  added: Record<string, number>;
  addedNames: string[];
  replaced: string[];
  duplicates: string[];
  refused: { file: string; why: string }[];
  skipped: string[];
  trimmed: string[];
  changed: { file: string; what: string }[];
}

export const KIND_WORD: Record<string, string> = {
  GameMode: 'game mode',
  Tank: 'tanks', TurretPreset: 'turrets', CustomTurret: 'old style turrets', CustomProjectile: 'projectiles',
  FoodShape: 'food shapes', Other: 'Others', Map: 'maps', MultiAreaMap: 'multi area maps',
};

export interface PickedFile { file: File; path: string; }

const _canon = (v: unknown) => JSON.stringify(v);

export async function importFiles(logic: GameLogic, picked: readonly PickedFile[], texts?: (p: PickedFile) => Promise<string>, epochAt?: number): Promise<ImportSummary> {
  const sum: ImportSummary = { added: {}, addedNames: [], replaced: [], duplicates: [], refused: [], skipped: [], trimmed: [], changed: [] };
  const epoch = SMALL_FIX.G708 !== 0 && epochAt !== undefined ? epochAt : logic.projectEpoch;
  const byName = new Map<string, LibraryItem[]>();
  const keyOf = (type: string, name: string) => type + '\u0000' + name;
  const index = (it: LibraryItem) => { const k = keyOf(it.fileData.type, it.name); let l = byName.get(k); if (!l) { l = []; byName.set(k, l); } l.push(it); };
  for (const it of logic.state.tankLibrary) index(it);
  for (const it of logic.state.otherLibrary) index(it);
  const ids = new Set<string>();
  for (const it of logic.state.tankLibrary) ids.add(it.id);
  for (const it of logic.state.otherLibrary) ids.add(it.id);

  const items: LibraryItem[] = [];
  const presets: TurretPreset[] = [];
  const designs: CustomProjectileDesign[] = [];
  const sorted = [...picked].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const p of sorted) {
    const label = p.path || p.file.name;
    if (!/\.json$/i.test(p.file.name)) { sum.skipped.push(label); continue; }
    let json: unknown;
    try {
      const text = texts ? await texts(p) : await p.file.text();
      json = JSON.parse(text);
    } catch {
      sum.refused.push({ file: label, why: 'It could not be read as a JSON file.' });
      continue;
    }
    const validated: ExportFile | null = DataRegistry.validateImport(json);
    if (!validated) {
      const why = DataRegistry.lastRejectReason ?? 'It is not a file the game knows: no tank, turret, projectile, food shape, Other, map or game mode inside.';
      DataRegistry.lastRejectReason = null;
      sum.refused.push({ file: label, why });
      continue;
    }
    const name = validated.name && validated.name !== 'Unnamed' ? validated.name : p.file.name.replace(/\.json$/i, '');
    const k = keyOf(validated.type, name);
    const same = byName.get(k);
    const canon = _canon(validated.data);
    if (same && same.some(it => _canon(it.fileData.data) === canon)) { sum.duplicates.push(`${name} (${label})`); continue; }
    const item: LibraryItem = { id: DataRegistry.libraryIdFor(validated), name, fileData: validated, loadedAt: Date.now(), source: 'manual-import' };
    if (ids.has(item.id)) sum.replaced.push(name);
    ids.add(item.id);
    index(item);
    items.push(item);
    sum.added[validated.type] = (sum.added[validated.type] ?? 0) + 1;
    sum.addedNames.push(name);
    const layers = wasLayerTrimmed(validated);
    if (layers) sum.trimmed.push(name);
    const ch = importChangesOf(validated);
    const what = ch ? importChangesWords(ch, layers ? 'turrets' : undefined) : '';
    if (what) sum.changed.push({ file: name, what: what.charAt(0).toUpperCase() + what.slice(1) + '.' });
    if (validated.type === 'TurretPreset') presets.push(validated.data as TurretPreset);
    else if (validated.type === 'CustomProjectile') designs.push(validated.data as CustomProjectileDesign);
  }
  if (logic.projectEpoch !== epoch) {
    const why = 'Another project was opened while it was read, so nothing was added.';
    const names = [...new Set([...sum.addedNames, ...sum.replaced])];
    sum.added = {}; sum.addedNames = []; sum.replaced = [];
    for (const n of names) sum.refused.push({ file: n, why });
    return sum;
  }
  if (items.length > 0) {
    logic.addToLibraryBatch(items);
    logic.addTurretPresetBatch(presets);
    logic.addProjectileDesignBatch(designs);
    logic.flushDataLoadComplete();
  }
  return sum;
}

export async function filesOfDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  const entries: any[] = [];
  const loose: File[] = [];
  for (let i = 0; i < dt.items.length; i++) {
    const it = dt.items[i];
    if (it.kind !== 'file') continue;
    const en = typeof (it as any).webkitGetAsEntry === 'function' ? (it as any).webkitGetAsEntry() : null;
    if (en) entries.push(en);
    else { const f = it.getAsFile(); if (f) loose.push(f); }
  }
  for (const f of loose) out.push({ file: f, path: f.name });
  const walk = async (en: any, base: string): Promise<void> => {
    if (en.isFile) {
      const f: File = await new Promise((res, rej) => en.file(res, rej));
      out.push({ file: f, path: base + f.name });
    } else if (en.isDirectory) {
      const reader = en.createReader();
      for (;;) {
        const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const c of batch) await walk(c, base + en.name + '/');
      }
    }
  };
  for (const en of entries) await walk(en, '');
  return out;
}

export function filesOfInput(list: FileList | null): PickedFile[] {
  const out: PickedFile[] = [];
  if (!list) return out;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    out.push({ file: f, path: (f as any).webkitRelativePath || f.name });
  }
  return out;
}
