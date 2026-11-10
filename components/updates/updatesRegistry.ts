import type { UpdateEntry, UpdateMonth, UpdateYear } from './updatesTypes';

const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

let _entries: UpdateEntry[] | null = null;
let _years: UpdateYear[] | null = null;
let _inflight: Promise<UpdateEntry[]> | null = null;

let _haystacks: { title: string; bullets: string[]; version: string }[] = [];

export async function loadUpdates(): Promise<UpdateEntry[]> {
  if (_entries) return _entries;
  if (_inflight) return _inflight;
  _inflight = import('./updatesData')
    .then(mod => {
      const clean = mod.UPDATES.filter(e =>
        e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
        && typeof e.version === 'string' && typeof e.title === 'string'
        && Array.isArray(e.bullets)
      );
      const list = clean.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      _entries = list;
      _years = groupByYear(list);
      _haystacks = list.map(e => ({
        title: e.title.toLowerCase(),
        bullets: e.bullets.map(b => b.toLowerCase()),
        version: e.version.toLowerCase(),
      }));
      return list;
    })
    .finally(() => { _inflight = null; });
  return _inflight;
}

export function getYears(): UpdateYear[] {
  return _years ?? [];
}

export function getLatest(): UpdateEntry | null {
  return _entries && _entries.length ? _entries[0] : null;
}

function groupByYear(list: UpdateEntry[]): UpdateYear[] {
  const monthMap = new Map<string, UpdateMonth>();
  for (const e of list) {
    const key = e.date.slice(0, 7);
    let m = monthMap.get(key);
    if (!m) {
      const year = Number(e.date.slice(0, 4));
      const month = Number(e.date.slice(5, 7));
      const shortLabel = MONTH_LONG[month - 1] ?? key;
      m = { key, year, month, label: `${shortLabel} ${year}`, shortLabel, entries: [] };
      monthMap.set(key, m);
    }
    m.entries.push(e);
  }
  const yearMap = new Map<number, UpdateYear>();
  for (const m of monthMap.values()) {
    let y = yearMap.get(m.year);
    if (!y) { y = { year: m.year, months: [], count: 0 }; yearMap.set(m.year, y); }
    y.months.push(m);
    y.count += m.entries.length;
  }
  return [...yearMap.values()].sort((a, b) => b.year - a.year);
}

export interface UpdateSearchHit {
  entry: UpdateEntry;
  matchedBullets: number[];
  score: number;
}

export function searchUpdates(query: string): UpdateSearchHit[] {
  const list = _entries;
  if (!list) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  const hits: UpdateSearchHit[] = [];
  for (let i = 0; i < list.length; i++) {
    const h = _haystacks[i];
    let score = 0;
    let allTermsPresent = true;
    const matched = new Set<number>();

    for (const t of terms) {
      let termScore = 0;
      if (h.version.includes(t)) termScore = Math.max(termScore, 60);
      if (h.title.includes(t)) termScore = Math.max(termScore, 50);
      for (let b = 0; b < h.bullets.length; b++) {
        if (h.bullets[b].includes(t)) { matched.add(b); termScore = Math.max(termScore, 8); }
      }
      if (termScore === 0) { allTermsPresent = false; break; }
      score += termScore;
    }

    if (allTermsPresent) {
      hits.push({ entry: list[i], matchedBullets: [...matched].sort((a, b) => a - b), score });
    }
  }
  hits.sort((a, b) => (b.score - a.score) || (a.entry.date < b.entry.date ? 1 : -1));
  return hits;
}

const SEEN_KEY = 'istrong_updates_seen_date';

export function getSeenDate(): string | null {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch { return null; }
}

export function markSeen(isoDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return;
  try { localStorage.setItem(SEEN_KEY, isoDate); } catch { }
}

export function hasUnseenUpdates(currentDate: string): boolean {
  const seen = getSeenDate();
  if (!seen) return true;
  return currentDate > seen;
}

export function formatEntryDate(iso: string): string {
  const short = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mo = short[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7);
  return `${mo} ${iso.slice(8, 10)}, ${iso.slice(0, 4)}`;
}
