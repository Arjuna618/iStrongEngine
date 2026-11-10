export interface BlobRec { sha: string; bytes: Uint8Array; size: number; enc: 'deflate' | 'raw' }

export interface StoreHead {
  slot: number;
  seq: number;
  appVersion: string;
  projectId: string | null;
  name: string;
  savedHash: string | null;
  readOnly: boolean;
  sections: Record<string, { version: number; sha: string }>;
  refs: string[];
  contentHash: string;
  at: number;
}

export interface HubVersion { sha: string; saved: number; size: number; appVersion: string }

export interface HubItem {
  id: string;
  kind: 'project' | 'file';
  name: string;
  fileType?: string;
  created: number;
  modified: number;
  opened: number;
  downloaded: number;
  size: number;
  contentHash: string;
  deletedAt: number | null;
  blob?: string;
  stored?: number;
  versions?: HubVersion[];
  readOnly?: boolean;
}

export const VERSIONS_KEPT = 10;
export const RECENTLY_DELETED_DAYS = 30;

const DB_NAME = 'istrong-projects';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('The storage write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('The storage write was stopped'));
  });
}

export class StoreBlockedError extends Error {}

export class ProjectStore {
  private constructor(private db: IDBDatabase) {}
  public onNewerElsewhere: (() => void) | null = null;

  static async open(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<ProjectStore> {
    const r = factory.open(name, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'sha' });
      if (!db.objectStoreNames.contains('heads')) db.createObjectStore('heads', { keyPath: 'slot' });
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('The storage could not be opened'));
      r.onblocked = () => reject(new StoreBlockedError('An older tab holds the storage: close it, then reload'));
    });
    const store = new ProjectStore(db);
    db.onversionchange = () => { db.close(); store.onNewerElsewhere?.(); };
    return store;
  }

  close(): void { this.db.close(); }

  private tx(stores: string[], mode: IDBTransactionMode, strict = false): IDBTransaction {
    const opts = strict ? ({ durability: 'strict' } as IDBTransactionOptions) : undefined;
    return opts ? this.db.transaction(stores, mode, opts) : this.db.transaction(stores, mode);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return req(this.tx(['meta'], 'readonly').objectStore('meta').get(key)) as Promise<T | undefined>;
  }
  async setMeta(key: string, value: unknown): Promise<void> {
    const t = this.tx(['meta'], 'readwrite');
    t.objectStore('meta').put(value, key);
    await done(t);
  }

  async getBlobs(shas: readonly string[]): Promise<Map<string, BlobRec>> {
    const t = this.tx(['blobs'], 'readonly');
    const s = t.objectStore('blobs');
    const out = new Map<string, BlobRec>();
    await Promise.all(shas.map(async h => { const r = await req(s.get(h)) as BlobRec | undefined; if (r) out.set(h, r); }));
    return out;
  }
  async hasBlobs(shas: readonly string[]): Promise<Set<string>> {
    const t = this.tx(['blobs'], 'readonly');
    const s = t.objectStore('blobs');
    const out = new Set<string>();
    await Promise.all(shas.map(async h => { const k = await req(s.getKey(h)); if (k !== undefined) out.add(h); }));
    return out;
  }

  async readHeads(): Promise<StoreHead[]> {
    const all = await req(this.tx(['heads'], 'readonly').objectStore('heads').getAll()) as StoreHead[];
    return all.sort((a, b) => b.seq - a.seq);
  }

  async writeHead(head: StoreHead, blobs: readonly BlobRec[], strict = false): Promise<{ ok: boolean; missing: string[] }> {
    const t = this.tx(['heads', 'blobs'], 'readwrite', strict);
    const hs = t.objectStore('heads');
    const bs = t.objectStore('blobs');
    let ok = true;
    const all = await req(hs.getAll()) as StoreHead[];
    for (const h of all) if (h.seq >= head.seq) ok = false;
    const missing: string[] = [];
    if (ok) {
      const given = new Set(blobs.map(b => b.sha));
      const have = new Set(await req(bs.getAllKeys()) as string[]);
      for (const r of head.refs) if (!given.has(r) && !have.has(r)) missing.push(r);
      if (missing.length === 0) {
        for (const b of blobs) bs.put(b);
        hs.put(head);
      }
    }
    await done(t);
    return { ok: ok && missing.length === 0, missing };
  }

  async listItems(): Promise<HubItem[]> {
    return req(this.tx(['items'], 'readonly').objectStore('items').getAll()) as Promise<HubItem[]>;
  }
  async getItem(id: string): Promise<HubItem | undefined> {
    return req(this.tx(['items'], 'readonly').objectStore('items').get(id)) as Promise<HubItem | undefined>;
  }
  async putItem(item: HubItem, blobs: readonly BlobRec[] = [], strict = false): Promise<void> {
    const t = this.tx(['items', 'blobs'], 'readwrite', strict);
    for (const b of blobs) t.objectStore('blobs').put(b);
    t.objectStore('items').put(item);
    await done(t);
  }
  async patchItem(id: string, patch: Partial<HubItem>): Promise<HubItem | null> {
    const t = this.tx(['items'], 'readwrite');
    const st = t.objectStore('items');
    let out: HubItem | null = null;
    const r = st.get(id);
    r.onsuccess = () => {
      const cur = r.result as HubItem | undefined;
      if (!cur) return;
      out = { ...cur, ...patch };
      st.put(out);
    };
    await done(t);
    return out;
  }
  async putItems(items: readonly HubItem[], blobs: readonly BlobRec[] = []): Promise<void> {
    const t = this.tx(['items', 'blobs'], 'readwrite');
    for (const b of blobs) t.objectStore('blobs').put(b);
    for (const it of items) t.objectStore('items').put(it);
    await done(t);
  }
  async removeItem(id: string): Promise<void> {
    const t = this.tx(['items'], 'readwrite');
    t.objectStore('items').delete(id);
    await done(t);
  }

  async collect(now: number): Promise<number> {
    const t = this.tx(['heads', 'items', 'blobs', 'meta'], 'readwrite');
    const heads = await req(t.objectStore('heads').getAll()) as StoreHead[];
    const items = await req(t.objectStore('items').getAll()) as HubItem[];
    const recovery = await req(t.objectStore('meta').get('recovery')) as { heads?: StoreHead[] } | undefined;
    const keep = new Set<string>();
    for (const h of heads) for (const r of h.refs) keep.add(r);
    for (const h of recovery?.heads ?? []) for (const r of h.refs ?? []) keep.add(r);
    for (const it of items) {
      if (it.deletedAt !== null && now - it.deletedAt > RECENTLY_DELETED_DAYS * 86_400_000) { t.objectStore('items').delete(it.id); continue; }
      if (it.blob) keep.add(it.blob);
      for (const v of it.versions ?? []) keep.add(v.sha);
    }
    const keys = await req(t.objectStore('blobs').getAllKeys()) as string[];
    let n = 0;
    for (const k of keys) if (!keep.has(k)) { t.objectStore('blobs').delete(k); n++; }
    await done(t);
    return n;
  }

  async pruneVersions(now: number): Promise<number> {
    const items = await this.listItems();
    const t = this.tx(['items'], 'readwrite');
    let went = 0;
    for (const it of items) {
      if (it.deletedAt !== null || it.readOnly || !it.versions || it.versions.length <= 1) continue;
      went += it.versions.length - 1;
      t.objectStore('items').put({ ...it, versions: it.versions.slice(-1) });
    }
    await done(t);
    if (went > 0) await this.collect(now);
    return went;
  }

  async pruneDeleted(now: number): Promise<number> {
    const items = await this.listItems();
    const t = this.tx(['items'], 'readwrite');
    let went = 0;
    for (const it of items) if (it.deletedAt !== null) { went++; t.objectStore('items').delete(it.id); }
    await done(t);
    if (went > 0) await this.collect(now);
    return went;
  }

  async prune(now: number): Promise<void> {
    const items = await this.listItems();
    const t = this.tx(['items'], 'readwrite');
    for (const it of items) {
      if (it.deletedAt !== null) { t.objectStore('items').delete(it.id); continue; }
      if (it.versions && it.versions.length > 1) t.objectStore('items').put({ ...it, versions: it.versions.slice(-1) });
    }
    await done(t);
    await this.collect(now);
  }
}

export function isQuotaError(e: unknown): boolean {
  const n = (e as { name?: string })?.name ?? '';
  return n === 'QuotaExceededError' || /quota/i.test(String((e as Error)?.message ?? ''));
}
