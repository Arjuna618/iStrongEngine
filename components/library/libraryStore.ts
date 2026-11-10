import type { LibKind, KindFilter, SortId } from './catalog';

const KEY = 'istrong_content_library_v1';
const RECENT_MAX = 40;

export type CardSize = 's' | 'm' | 'l';

interface Stored {
  fav: string[];
  recent: string[];
  used: Record<string, number>;
  tab: Partial<Record<string, LibKind>>;
  filters: Partial<Record<LibKind, KindFilter>>;
  sort: Partial<Record<LibKind, SortId>>;
  size: CardSize;
}

function blank(): Stored { return { fav: [], recent: [], used: {}, tab: {}, filters: {}, sort: {}, size: 'm' }; }

let _s: Stored = blank();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') {
      _s = {
        fav: Array.isArray(p.fav) ? p.fav.filter((x: unknown) => typeof x === 'string').slice(0, 2000) : [],
        recent: Array.isArray(p.recent) ? p.recent.filter((x: unknown) => typeof x === 'string').slice(0, RECENT_MAX) : [],
        used: p.used && typeof p.used === 'object' ? p.used : {},
        tab: p.tab && typeof p.tab === 'object' ? p.tab : {},
        filters: p.filters && typeof p.filters === 'object' ? p.filters : {},
        sort: p.sort && typeof p.sort === 'object' ? p.sort : {},
        size: p.size === 's' || p.size === 'l' ? p.size : 'm',
      };
    }
  }
} catch { }

let _fav = new Set<string>(_s.fav);
let _recent = new Set<string>(_s.recent);
let _used = new Map<string, number>(Object.entries(_s.used).filter(([, v]) => typeof v === 'number') as [string, number][]);
let _version = 0;

const IMPORT_KEY = /:\d{12,}-[a-z0-9]{1,8}$/;
const isImportKey = (k: string) => IMPORT_KEY.test(k);

let _onChange: (() => void) | null = null;
export function setLibraryStoreOnChange(fn: (() => void) | null): void { _onChange = fn; }

function save(): void {
  _version++;
  _s.fav = [..._fav];
  _s.used = Object.fromEntries(_used);
  const browser: Stored = { ..._s, fav: _s.fav.filter(k => !isImportKey(k)), recent: _s.recent.filter(k => !isImportKey(k)), used: Object.fromEntries(Object.entries(_s.used).filter(([k]) => !isImportKey(k))) };
  try { localStorage.setItem(KEY, JSON.stringify(browser)); } catch { }
  _onChange?.();
}

export interface ProjectMarks { fav: string[]; recent: string[]; used: Record<string, number> }

export function projectMarks(): ProjectMarks {
  return {
    fav: [..._fav].filter(isImportKey).sort(),
    recent: _s.recent.filter(isImportKey),
    used: Object.fromEntries([..._used].filter(([k]) => isImportKey(k)).sort((a, b) => (a[0] < b[0] ? -1 : 1))),
  };
}

export function applyProjectMarks(m: unknown): void {
  const o = (m && typeof m === 'object' ? m : {}) as Partial<ProjectMarks>;
  const fav = Array.isArray(o.fav) ? o.fav.filter((k): k is string => typeof k === 'string' && isImportKey(k)) : [];
  const recent = Array.isArray(o.recent) ? o.recent.filter((k): k is string => typeof k === 'string' && isImportKey(k)) : [];
  const used = o.used && typeof o.used === 'object' ? Object.entries(o.used).filter(([k, v]) => isImportKey(k) && typeof v === 'number' && Number.isFinite(v)) as [string, number][] : [];
  _fav = new Set([..._fav].filter(k => !isImportKey(k)).concat(fav));
  _s.recent = [...recent, ..._s.recent.filter(k => !isImportKey(k))].slice(0, RECENT_MAX);
  _recent = new Set(_s.recent);
  _used = new Map([...[..._used].filter(([k]) => !isImportKey(k)), ...used]);
  _version++;
  _s.fav = [..._fav];
  _s.used = Object.fromEntries(_used);
}

export function storeVersion(): number { return _version; }
export function favourites(): ReadonlySet<string> { return _fav; }
export function recents(): ReadonlySet<string> { return _recent; }
export function recentList(): readonly string[] { return _s.recent; }
export function usage(): ReadonlyMap<string, number> { return _used; }

export function toggleFavourite(key: string): boolean {
  _fav = new Set(_fav);
  const on = !_fav.has(key);
  if (on) _fav.add(key); else _fav.delete(key);
  save();
  return on;
}

export function noteUsed(key: string): void {
  const list = _s.recent.filter(k => k !== key);
  list.unshift(key);
  _s.recent = list.slice(0, RECENT_MAX);
  _recent = new Set(_s.recent);
  _used = new Map(_used);
  _used.set(key, (_used.get(key) ?? 0) + 1);
  save();
}

export function pruneDeadImports(live: ReadonlyMap<string, unknown>): void {
  const dead = (k: string) => IMPORT_KEY.test(k) && !live.has(k);
  let changed = false;
  for (const k of _used.keys()) if (dead(k)) { if (!changed) _used = new Map(_used); _used.delete(k); changed = true; }
  let favCopied = false;
  for (const k of _fav) if (dead(k)) { if (!favCopied) { _fav = new Set(_fav); favCopied = true; } _fav.delete(k); changed = true; }
  const rec = _s.recent.filter(k => !dead(k));
  if (rec.length !== _s.recent.length) { _s.recent = rec; _recent = new Set(rec); changed = true; }
  if (changed) save();
}

export function storedTab(place: string): LibKind | undefined { return _s.tab[place]; }
export function storeTab(place: string, kind: LibKind): void { if (_s.tab[place] !== kind) { _s.tab[place] = kind; save(); } }

export function storedFilter(kind: LibKind, groups: number): KindFilter | undefined {
  const f = _s.filters[kind];
  if (!f || !Array.isArray(f.inc) || f.inc.length !== groups) return undefined;
  return { inc: f.inc.map(v => (typeof v === 'number' ? v >>> 0 : 0)) };
}
export function storeFilter(kind: LibKind, f: KindFilter): void { _s.filters[kind] = { inc: f.inc.slice() }; save(); }

export function storedSort(kind: LibKind): SortId | undefined { return _s.sort[kind]; }
export function storeSort(kind: LibKind, s: SortId): void { _s.sort[kind] = s; save(); }

export function storedSize(): CardSize { return _s.size; }
export function storeSize(s: CardSize): void { if (_s.size !== s) { _s.size = s; save(); } }
