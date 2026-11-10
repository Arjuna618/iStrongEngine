import type { GameLogic } from '../GameLogic';
import { SMALL_FIX } from '../smallFixSwitch';
import { ProjectStore, isQuotaError, type BlobRec, type StoreHead, type HubItem, type HubVersion, VERSIONS_KEPT } from './projectStore';
import { writeSections, readSections, precheckLibrary, libraryBlobObjects, mergeKept, SECTION_VERSIONS, EMPTY_PANELS, type PanelsData, type SectionId, type ReadResult, type KeptExtras } from './sections';
import { contentHashOf, type ProjectLabel } from './format';
import type { EncodedRecord } from './workerOps';
import * as workerJobs from './workerClient';
import { newId, sha256Hex } from './hash';
import type { UnpackedProject } from './format';
import type { ApplyReport, EngineSnapshot } from './snapshot';

export const SETTLE_MS = 900;
const KEPT_ENTRIES_META = 'keptEntries';
export const MAX_WAIT_MS = 4000;
export const UNTITLED = 'Untitled Project';

export interface SessionJobs {
  encodeJob: typeof workerJobs.encodeJob;
  decodeJob: typeof workerJobs.decodeJob;
  packProjectJob: typeof workerJobs.packProjectJob;
  unpackProjectJob: typeof workerJobs.unpackProjectJob;
}

export interface PanelsPort {
  capture(): PanelsData;
  apply(p: PanelsData): void;
  busy(): boolean;
}

export type StorageState = 'ok' | 'memory' | 'newer' | 'elsewhere';

export interface SessionView {
  projectId: string | null;
  name: string;
  dirty: boolean;
  saving: boolean;
  readOnly: boolean;
  storage: StorageState;
  ready: boolean;
  lastSavedAt: number;
  full: boolean;
}

export function versionNumber(v: string): number {
  const m = /^v?(\d+)\.(\d+)/.exec(v);
  return m ? Number(m[1]) * 100000 + Number(m[2]) : 0;
}

interface HeldCapture { engine: ReturnType<GameLogic['projectCapture']>; panels: ReturnType<PanelsPort['capture']>; canvasKey: string }

export interface OpenResult { report: ApplyReport; problems: ReadResult['problems']; readOnly: boolean }

export class ProjectSession {
  readonly view: SessionView = { projectId: null, name: UNTITLED, dirty: false, saving: false, readOnly: false, storage: 'ok', ready: false, lastSavedAt: 0, full: false };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstPokeAt = 0;
  private savedHash: string | null = null;
  private lastHead: StoreHead | null = null;
  private libSha = new WeakMap<object, string>();
  private stored = new Set<string>();
  private pendingBlobs = new Map<string, BlobRec>();
  private lastCanvas: { key: string; sha: string; bytes: Uint8Array; size: number } | null = null;
  private lastValues: { sections: Record<string, { version: number; data: unknown }>; blobs: Map<string, object> } | null = null;
  private kept: KeptExtras | null = null;
  private keptEntries: Map<string, Uint8Array> | null = null;
  private keptEntryHashes: { name: string; sha256: string }[] = [];
  public writer = true;
  private created = 0;
  private detached: { id: string; savedHash: string | null; epoch: number } | null = null;
  public onPruned: ((went: { versions: number; deleted: number }) => void) | null = null;

  constructor(
    private logic: GameLogic,
    private store: ProjectStore | null,
    private panels: PanelsPort,
    private appVersion: string,
    private jobs: SessionJobs = workerJobs,
    private now: () => number = () => Date.now(),
  ) {
    if (!store) this.view.storage = 'memory';
    logic.onBeforeMatch = () => this.captureBeforeMatch();
  }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(): void { this.listeners.forEach(f => f()); }
  private setView(p: Partial<SessionView>): void { Object.assign(this.view, p); this.emit(); }

  get storeOrNull(): ProjectStore | null { return this.store; }

  private canWrite(): boolean {
    return !!this.store && this.writer && this.view.ready && this.view.storage === 'ok';
  }

  poke(): void {
    if (!this.view.ready) return;
    const t = this.now();
    if (!this.timer) this.firstPokeAt = t;
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(SETTLE_MS, MAX_WAIT_MS - (t - this.firstPokeAt)));
    this.timer = setTimeout(() => this.tick(), wait);
  }

  private tick(): void {
    this.timer = null;
    if (this.logic.projectCaptureBlocked() || this.panels.busy()) {
      this.timer = setTimeout(() => this.tick(), SETTLE_MS);
      return;
    }
    void this.flush();
  }

  async settle(): Promise<void> {
    if (this.timer) { await this.flush(); return; }
    await this.queue;
  }

  private captureBeforeMatch(): void {
    if (!SMALL_FIX.R784 || !this.timer || !this.view.ready || this.logic.projectCaptureBlocked()) return;
    clearTimeout(this.timer); this.timer = null;
    const eng = this.logic.projectCapture();
    const { library, ...rest } = eng;
    const held = { engine: { ...structuredClone(rest), library } as typeof eng, panels: structuredClone(this.panels.capture()), canvasKey: this.logic.projectCanvasKey };
    const p = this.queue.then(() => this.write(false, true, held)).catch(e => { console.error('[project] autosave failed', e); return false; });
    this.queue = p;
  }

  flush(strict = false): Promise<boolean> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const p = this.queue.then(() => this.write(strict)).catch(e => { console.error('[project] autosave failed', e); return false; });
    this.queue = p;
    return p;
  }

  private async encode(records: { key: string; value: unknown }[]): Promise<EncodedRecord[]> {
    return records.length > 0 ? this.jobs.encodeJob(records) : [];
  }

  private async materialize(held?: HeldCapture): Promise<{ head: Omit<StoreHead, 'slot' | 'seq'>; blobs: BlobRec[]; values: { sections: Record<string, { version: number; data: unknown }>; blobs: Map<string, object> } } | null> {
    if (!held && this.logic.projectCaptureBlocked()) return null;
    const engine = held ? held.engine : this.logic.projectCapture();
    const panels = held ? held.panels : this.panels.capture();
    const canvasKey = held ? held.canvasKey : this.logic.projectCanvasKey;
    const libObjs = libraryBlobObjects(engine.library);
    const fresh = libObjs.filter(o => !this.libSha.has(o));
    const newBlobs: BlobRec[] = [];
    const encLib = await this.encode(fresh.map((o, i) => ({ key: 'l' + i, value: o })));
    for (let i = 0; i < fresh.length; i++) {
      const e = encLib[i];
      this.libSha.set(fresh[i], e.sha256);
      if (!this.stored.has(e.sha256)) this.pendingBlobs.set(e.sha256, { sha: e.sha256, bytes: e.bytes, size: e.size, enc: 'deflate' });
    }
    const again: object[] = [];
    const sent = new Set<string>();
    for (const o of libObjs) {
      const h = this.libSha.get(o)!;
      if (this.stored.has(h) || sent.has(h)) continue;
      sent.add(h);
      const p = this.pendingBlobs.get(h);
      if (p) newBlobs.push(p); else again.push(o);
    }
    if (again.length > 0) {
      for (const e of await this.encode(again.map((o, i) => ({ key: 'r' + i, value: o })))) newBlobs.push({ sha: e.sha256, bytes: e.bytes, size: e.size, enc: 'deflate' });
    }
    const blobMap = new Map<string, object>();
    for (const o of libObjs) blobMap.set(this.libSha.get(o)!, o);
    const secs = mergeKept(writeSections(engine, panels, o => this.libSha.get(o)!), this.kept);
    const keptSecs = this.kept?.sections ?? {};
    const ids = [...new Set([...Object.keys(secs), ...Object.keys(keptSecs)])];
    const versionOf = (id: string): number => keptSecs[id]?.version ?? SECTION_VERSIONS[id as SectionId];
    const dataOf = (id: string): unknown => (id in keptSecs ? keptSecs[id].data : secs[id]);
    const toEncode: { key: string; value: unknown }[] = [];
    for (const id of ids) {
      if (id === 'canvas' && !('canvas' in keptSecs) && this.lastCanvas && this.lastCanvas.key === canvasKey) continue;
      toEncode.push({ key: id, value: dataOf(id) });
    }
    const enc = await this.encode(toEncode);
    const table: Record<string, { version: number; sha: string }> = {};
    const values: Record<string, { version: number; data: unknown }> = {};
    for (const id of ids) values[id] = { version: versionOf(id), data: dataOf(id) };
    for (const e of enc) {
      table[e.key] = { version: versionOf(e.key), sha: e.sha256 };
      if (!this.stored.has(e.sha256)) newBlobs.push({ sha: e.sha256, bytes: e.bytes, size: e.size, enc: 'deflate' });
      if (e.key === 'canvas' && !('canvas' in keptSecs)) this.lastCanvas = { key: canvasKey, sha: e.sha256, bytes: e.bytes, size: e.size };
    }
    if (!table.canvas && this.lastCanvas) {
      table.canvas = { version: SECTION_VERSIONS.canvas, sha: this.lastCanvas.sha };
      if (!this.stored.has(this.lastCanvas.sha)) newBlobs.push({ sha: this.lastCanvas.sha, bytes: this.lastCanvas.bytes, size: this.lastCanvas.size, enc: 'deflate' });
    }
    const libShas = [...new Set(libObjs.map(o => this.libSha.get(o)!))].sort();
    const contentHash = await contentHashOf(Object.fromEntries(Object.entries(table).map(([k, v]) => [k, { version: v.version, sha256: v.sha }])), libShas, this.keptEntryHashes);
    const refs = [...new Set([...Object.values(table).map(v => v.sha), ...libShas])];
    return {
      head: {
        appVersion: this.appVersion, projectId: this.view.projectId, name: this.view.name, savedHash: this.savedHash,
        readOnly: this.view.readOnly, sections: table, refs, contentHash, at: this.now(),
      },
      blobs: newBlobs,
      values: { sections: values, blobs: blobMap },
    };
  }

  private async withRoom<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (e) { if (!isQuotaError(e)) throw e; }
    if (!SMALL_FIX.R790) {
      await this.store!.prune(this.now());
      this.forgetStored();
      return run();
    }
    const went = { versions: 0, deleted: 0 };
    try {
      went.versions = await this.store!.pruneVersions(this.now());
      if (went.versions > 0) {
        this.forgetStored();
        try { return await run(); } catch (e) { if (!isQuotaError(e)) throw e; }
      }
      went.deleted = await this.store!.pruneDeleted(this.now());
      this.forgetStored();
      return await run();
    } finally {
      if (went.versions > 0 || went.deleted > 0) this.onPruned?.(went);
    }
  }

  private async write(strict: boolean, retry = true, held?: HeldCapture): Promise<boolean> {
    if (!this.view.ready) return false;
    const epoch = this.epoch;
    const m = await this.materialize(held);
    if (!m) return false;
    this.lastValues = m.values;
    const dirty = this.savedHash !== m.head.contentHash;
    if (this.view.dirty !== dirty) this.setView({ dirty });
    if (!this.canWrite()) return false;
    if (epoch !== this.epoch) return false;
    const last = this.lastHead;
    if (last && last.contentHash === m.head.contentHash && last.projectId === m.head.projectId && last.name === m.head.name
      && last.savedHash === m.head.savedHash && last.readOnly === m.head.readOnly) return false;
    const seq = this.seq + 1;
    const head: StoreHead = { ...m.head, seq, slot: seq % 3 };
    let res: { ok: boolean; missing: string[] };
    try {
      res = await this.withRoom(() => this.store!.writeHead(head, m.blobs, strict));
    } catch (e) {
      if (isQuotaError(e)) { this.setView({ full: true }); return false; }
      throw e;
    }
    if (res.missing.length > 0) {
      for (const r of res.missing) this.stored.delete(r);
      if (this.lastCanvas && res.missing.includes(this.lastCanvas.sha)) this.lastCanvas = null;
      return retry ? this.write(strict, false, held) : false;
    }
    if (!res.ok) return false;
    this.seq = seq;
    this.lastHead = head;
    for (const b of m.blobs) { this.stored.add(b.sha); this.pendingBlobs.delete(b.sha); }
    if (this.view.full) this.setView({ full: false });
    return true;
  }

  forgetStored(): void {
    this.stored = new Set(this.lastHead?.refs ?? []);
  }

  private applyRead(r: ReadResult): ApplyReport {
    const report = this.logic.projectApply(r.engine);
    this.panels.apply(r.panels);
    return report;
  }

  private async decodeRecords(blobs: Map<string, BlobRec>, shas: readonly string[]): Promise<Map<string, unknown>> {
    const out = new Map<string, unknown>();
    const recs = shas.map(h => blobs.get(h)).filter((b): b is BlobRec => !!b && b.enc === 'deflate');
    const dec = await this.jobs.decodeJob(recs.map(b => ({ key: b.sha, bytes: b.bytes, size: b.size })));
    for (const d of dec) out.set(d.key, d.value);
    return out;
  }

  async boot(): Promise<{ restored: boolean; report: ApplyReport | null; problems: ReadResult['problems']; lost: boolean }> {
    this.created = this.now();
    if (!this.store) { await this.adoptBaseline(); this.setView({ ready: true }); return { restored: false, report: null, problems: [], lost: false }; }
    let heads: StoreHead[] = [];
    try { heads = await this.store.readHeads(); } catch (e) { console.error('[project] the working state could not be read', e); }
    if (heads.length > 0) this.seq = heads[0].seq;
    for (const h of heads) {
      try {
        if (versionNumber(h.appVersion) > versionNumber(this.appVersion)) {
          this.view.storage = 'newer';
        }
        const blobs = await this.store.getBlobs(h.refs);
        if (h.refs.some(r => !blobs.has(r))) continue;
        const sectionShas = Object.values(h.sections).map(s => s.sha);
        const decoded = await this.decodeRecords(blobs, h.refs);
        const records: Record<string, { version: number; data: unknown }> = {};
        for (const [id, s] of Object.entries(h.sections)) {
          if (!decoded.has(s.sha)) throw new Error('A section could not be read');
          records[id] = { version: s.version, data: decoded.get(s.sha) };
        }
        const libBlobs = new Map<string, unknown>();
        for (const r of h.refs) if (!sectionShas.includes(r) && decoded.has(r)) libBlobs.set(r, decoded.get(r));
        const pre = await precheckLibrary(records, libBlobs);
        const read = readSections(records, libBlobs, this.logic.projectFreshSnapshot(), pre);
        if (read.problems.length > 0 && read.problems.every(p => p.part === 'The tank on the canvas') && heads.indexOf(h) < heads.length - 1) {
          continue;
        }
        const report = this.applyRead(read);
        this.kept = read.kept;
        try {
          const ke = await this.store.getMeta<{ projectId: string | null; entries: [string, Uint8Array][] }>(KEPT_ENTRIES_META);
          if (ke && ke.projectId === h.projectId && ke.entries.length > 0) await this.adoptEntries(new Map(ke.entries), h.projectId, false);
        } catch { }
        this.savedHash = h.savedHash;
        this.lastHead = h;
        for (const r of h.refs) this.stored.add(r);
        this.view.projectId = h.projectId;
        this.view.name = h.name || UNTITLED;
        this.view.readOnly = h.readOnly || read.readOnly;
        this.view.dirty = h.savedHash !== h.contentHash;
        this.view.ready = true;
        this.emit();
        return { restored: true, report, problems: read.problems, lost: false };
      } catch (e) {
        console.error('[project] a working state generation could not be restored', e);
      }
    }
    const lost = heads.length > 0;
    if (lost) {
      try { await this.store.setMeta('recovery', { at: this.now(), heads }); } catch { }
    }
    await this.adoptBaseline();
    this.setView({ ready: true });
    return { restored: false, report: null, problems: [], lost };
  }

  reloadFromStore(): Promise<void> {
    this.nextEpoch();
    const p = this.queue.then(async () => { await this.boot(); });
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async adoptBaseline(): Promise<void> {
    try {
      const m = await this.materialize();
      this.savedHash = m ? m.head.contentHash : null;
    } catch (e) {
      console.error('[project] the fresh start could not be measured', e);
      this.savedHash = null;
    }
  }

  private async adoptEntries(entries: ReadonlyMap<string, Uint8Array> | null, projectId: string | null, persist = true): Promise<void> {
    this.keptEntries = entries && entries.size > 0 ? new Map(entries) : null;
    this.keptEntryHashes = [];
    if (this.keptEntries) for (const [name, data] of this.keptEntries) this.keptEntryHashes.push({ name, sha256: await sha256Hex(data) });
    if (!persist || !this.store) return;
    try { await this.store.setMeta(KEPT_ENTRIES_META, this.keptEntries ? { projectId, entries: [...this.keptEntries] } : null); }
    catch (e) { console.error('[project] the kept entries could not be written beside the work', e); }
  }

  private nextEpoch(): void {
    this.epoch++;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.lastCanvas = null;
  }

  async packCurrent(name = this.view.name): Promise<{ bytes: Uint8Array; label: ProjectLabel; contentHash: string }> {
    const m = await this.materialize();
    if (!m) throw new Error('The project cannot be saved during a match.');
    this.lastValues = m.values;
    const projectId = this.view.projectId ?? newId();
    const out = await this.jobs.packProjectJob({
      op: 'packProject',
      meta: { projectId, name, created: this.created || this.now(), saved: this.now(), appVersion: this.appVersion },
      content: { sections: m.values.sections, blobs: [...m.values.blobs.values()], extra: this.keptEntries ?? undefined },
    });
    return { bytes: out.bytes, label: out.label, contentHash: out.contentHash };
  }

  async save(opts: { name?: string; asNew?: boolean } = {}): Promise<HubItem> {
    if (!this.store) throw new Error('Projects cannot be kept in this browser window. Download the project file instead.');
    if (this.view.readOnly && !opts.asNew) throw new Error('This project was made with a newer version of iStrongEngine. Update the app to save it, or use Save As.');
    const run = async (): Promise<HubItem> => {
      this.setView({ saving: true });
      const backId = this.view.projectId, backName = this.view.name;
      try {
        const asNew = !!opts.asNew || this.view.projectId === null;
        const name = (opts.name ?? this.view.name).trim() || UNTITLED;
        const prior = !asNew && this.view.projectId ? await this.store!.getItem(this.view.projectId) : undefined;
        if (asNew) this.view.projectId = newId();
        this.view.name = name;
        const now = this.now();
        const packed = await this.packCurrent(name);
        const version: HubVersion = { sha: await sha256Hex(packed.bytes), saved: now, size: packed.bytes.length, appVersion: this.appVersion };
        const item: HubItem = {
          id: this.view.projectId!, kind: 'project', name,
          created: prior?.created ?? now, modified: now, opened: now, downloaded: prior?.downloaded ?? 0,
          size: packed.bytes.length, contentHash: packed.contentHash, deletedAt: null,
          versions: [...(prior?.versions ?? []), version].slice(-VERSIONS_KEPT),
          readOnly: false,
        };
        const put = () => this.store!.putItem(item, [{ sha: version.sha, bytes: packed.bytes, size: packed.bytes.length, enc: 'raw' }], true);
        if (SMALL_FIX.R781) await this.withRoom(put); else await put();
        this.savedHash = packed.contentHash;
        this.view.readOnly = false;
        this.setView({ dirty: false, lastSavedAt: now });
        try { await this.write(true); } catch (e) { console.error('[project] the saved mark will be written by the next autosave', e); }
        return item;
      } catch (e) {
        if (SMALL_FIX.R781) { this.view.projectId = backId; this.view.name = backName; }
        throw e;
      } finally {
        this.setView({ saving: false });
      }
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async readBytes(bytes: Uint8Array, outside = false): Promise<{ un: UnpackedProject; read: ReadResult }> {
    const un = await this.jobs.unpackProjectJob(bytes, outside);
    const pre = await precheckLibrary(un.sections, un.blobs);
    const read = readSections(un.sections, un.blobs, this.logic.projectFreshSnapshot(), pre);
    for (const p of un.problems) read.problems.push(p);
    return { un, read };
  }

  async openRead(r: { un: UnpackedProject; read: ReadResult }, as: { projectId: string | null; name: string; savedHash: string | null; readOnly?: boolean }): Promise<OpenResult> {
    const run = async (): Promise<OpenResult> => {
      const { un, read } = r;
      if (this.logic.projectCaptureBlocked()) throw new Error('A project cannot be opened during a match.');
      this.nextEpoch();
      const report = this.applyRead(read);
      this.kept = read.kept;
      await this.adoptEntries(un.extra.size > 0 ? un.extra : null, as.projectId);
      this.savedHash = as.savedHash;
      this.view.projectId = as.projectId;
      this.view.name = as.name;
      this.view.readOnly = !!as.readOnly || un.readOnlyByFormat || read.readOnly;
      this.setView({ dirty: as.savedHash === null });
      await this.write(false);
      return { report, problems: read.problems, readOnly: this.view.readOnly };
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async newProject(): Promise<void> {
    const run = async () => {
      if (this.logic.projectCaptureBlocked()) throw new Error('A new project cannot be started during a match.');
      this.nextEpoch();
      this.kept = null;
      await this.adoptEntries(null, null);
      this.logic.projectApply(this.logic.projectFreshSnapshot());
      this.panels.apply(structuredClone(EMPTY_PANELS));
      this.view.projectId = null;
      this.view.name = UNTITLED;
      this.view.readOnly = false;
      this.created = this.now();
      await this.adoptBaseline();
      this.setView({ dirty: false });
      await this.write(false);
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  detachProject(): void {
    const id = this.view.projectId, hash = this.savedHash;
    this.nextEpoch();
    if (id !== null) this.detached = { id, savedHash: hash, epoch: this.epoch };
    this.savedHash = null;
    this.view.projectId = null;
    this.view.name = UNTITLED;
    this.setView({ dirty: true });
    void this.flush();
  }

  reattachProject(id: string, name: string): void {
    const d = this.detached;
    if (!SMALL_FIX.R783 || !d || d.id !== id || d.epoch !== this.epoch || this.view.projectId !== null) return;
    this.detached = null;
    this.nextEpoch();
    this.savedHash = d.savedHash;
    this.view.projectId = id;
    this.view.name = name;
    void this.flush();
  }

  renamed(name: string): void {
    this.setView({ name });
    void this.flush();
  }

  get lastCaptured(): { sections: Record<string, { version: number; data: unknown }>; blobs: Map<string, object> } | null { return this.lastValues; }

  captureEngine(): EngineSnapshot { return this.logic.projectCapture(); }
}
