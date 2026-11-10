export interface ImportChanges {
  values: number;
  settings: number;
  lists: Record<string, number>;
}

const MAX_DEPTH = 200;

function walk(a: unknown, b: unknown, key: string, out: ImportChanges, depth: number): void {
  if (a === b || depth > MAX_DEPTH) return;
  if (typeof a === 'number' && typeof b === 'number') {
    if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) out.values++;
    return;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    if (a !== '' && a.toLowerCase() !== b.toLowerCase()) out.values++;
    return;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) { out.values++; return; }
    if (b.length < a.length) out.lists[key] = (out.lists[key] ?? 0) + (a.length - b.length);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) walk(a[i], b[i], key, out, depth + 1);
    return;
  }
  if (a !== null && typeof a === 'object') {
    if (b === null || typeof b !== 'object' || Array.isArray(b)) { out.values++; return; }
    const bo = b as Record<string, unknown>;
    for (const k of Object.keys(a as Record<string, unknown>)) {
      const av = (a as Record<string, unknown>)[k];
      if (av === undefined) continue;
      if (!(k in bo) || bo[k] === undefined) { out.settings++; continue; }
      walk(av, bo[k], k, out, depth + 1);
    }
    return;
  }
  if (a !== undefined) out.values++;
}

export function importChanges(before: unknown, after: unknown): ImportChanges | null {
  const out: ImportChanges = { values: 0, settings: 0, lists: {} };
  walk(before, after, '', out, 0);
  return out.values === 0 && out.settings === 0 && Object.keys(out.lists).length === 0 ? null : out;
}

const _changes = new WeakMap<object, ImportChanges>();
export function recordImportChanges(file: object, ch: ImportChanges | null): void { if (ch) _changes.set(file, ch); }
export function importChangesOf(file: object | null | undefined): ImportChanges | null { return (file && _changes.get(file)) || null; }

const LIST_WORD: Record<string, [string, string]> = {
  bodyLayers: ['body layer', 'body layers'],
  turrets: ['turret', 'turrets'],
  autoSubTurrets: ['turret on a base', 'turrets on bases'],
  visualLayers: ['visual layer', 'visual layers'],
  rings: ['explosion ring', 'explosion rings'],
  areas: ['map area', 'map areas'],
  parts: ['part', 'parts'],
};

export function importChangesWords(ch: ImportChanges, skipList?: string): string {
  const bits: string[] = [];
  if (ch.values > 0) bits.push(`${ch.values} ${ch.values === 1 ? 'value' : 'values'} held to the game's limits`);
  let other = 0;
  for (const [k, n] of Object.entries(ch.lists)) {
    if (k === skipList) continue;
    const w = LIST_WORD[k];
    if (w) bits.push(`${n} ${n === 1 ? w[0] : w[1]} removed`);
    else other += n;
  }
  if (other > 0) bits.push(`${other} ${other === 1 ? 'list item' : 'list items'} removed`);
  if (ch.settings > 0) bits.push(`${ch.settings} broken ${ch.settings === 1 ? 'setting' : 'settings'} removed`);
  return bits.join(', ');
}
