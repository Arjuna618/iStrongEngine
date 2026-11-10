import { ProjectStore, type HubItem, type HubVersion, type BlobRec, VERSIONS_KEPT } from './projectStore';
import type { ProjectSession } from './session';
import { DataRegistry } from '../DataRegistry';
import type { ExportFile } from '../../types';
import { SMALL_FIX } from '../smallFixSwitch';
import { canonicalBytes } from './canonical';
import { sha256Hex, newId } from './hash';
import { nextFreeName, cleanName, safeFileName, NAME_MAX } from './hubNaming';
import { PROJECT_EXT, BACKUP_EXT, WRITER_VERSION, relabelProject, type ProjectLabel, type BackupItem } from './format';
import { SECTION_VERSIONS, type SectionId } from './sections';
import * as workerJobs from './workerClient';

export const PREVIEW_TYPES = new Set(['Tank', 'TurretPreset', 'CustomTurret', 'CustomProjectile', 'Other', 'FoodShape']);
export const MAP_TYPES = new Set(['Map', 'MultiAreaMap', 'GameMode']);

export interface HubJobs {
  encodeJob: typeof workerJobs.encodeJob;
  decodeJob: typeof workerJobs.decodeJob;
  unpackProjectJob: typeof workerJobs.unpackProjectJob;
  packBackupJob: typeof workerJobs.packBackupJob;
  unpackBackupJob: typeof workerJobs.unpackBackupJob;
  sniffJob: typeof workerJobs.sniffJob;
}

export type Prepared =
  | { kind: 'project'; id: string; name: string; label: ProjectLabel; versions: { bytes: Uint8Array; saved: number; appVersion: string }[]; readOnly: boolean; dup: 'same' | 'version' | null; source: string }
  | { kind: 'file'; name: string; file: ExportFile; contentHash: string; dup: 'same' | null; source: string };

export interface PrepareResult {
  ready: Prepared[];
  duplicates: Prepared[];
  refused: { file: string; why: string }[];
  skipped: string[];
  emptyBackups: string[];
}

export interface PickedBytes { name: string; path: string; read: () => Promise<Uint8Array> }

export async function fileContentHash(f: ExportFile): Promise<string> {
  return sha256Hex(canonicalBytes({ type: f.type, data: f.data }));
}

function isReadOnlyLabel(label: ProjectLabel): boolean {
  if (label.minWriterVersion > WRITER_VERSION) return true;
  for (const [id, s] of Object.entries(label.sections)) {
    const known = SECTION_VERSIONS[id as SectionId];
    if (known !== undefined && s.version > known) return true;
  }
  return false;
}

export class ProjectHub {
  private items: HubItem[] = [];
  private listeners = new Set<() => void>();
  private loaded = false;
  private channel: BroadcastChannel | null = null;

  constructor(
    private store: ProjectStore,
    private session: ProjectSession,
    private appVersion: string,
    private jobs: HubJobs = workerJobs,
    private now: () => number = () => Date.now(),
  ) {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('istrong-hub');
        this.channel.onmessage = () => { void this.reload(); };
      } catch { this.channel = null; }
    }
  }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(local = true): void {
    this.listeners.forEach(f => f());
    if (local) try { this.channel?.postMessage('changed'); } catch { }
  }

  async reload(): Promise<void> {
    this.items = await this.store.listItems();
    this.loaded = true;
    this.emit(false);
  }

  get isLoaded(): boolean { return this.loaded; }
  list(): readonly HubItem[] { return this.items; }
  get(id: string): HubItem | undefined { return this.items.find(i => i.id === id); }

  hasBackupContent(): boolean { return this.items.some(i => i.deletedAt === null); }

  keptBytes(): number {
    const seen = new Set<string>();
    let n = 0;
    for (const it of this.items) {
      if (it.kind === 'project') {
        for (const v of it.versions ?? []) if (!seen.has(v.sha)) { seen.add(v.sha); n += v.size; }
      } else if (it.blob) {
        if (!seen.has(it.blob)) { seen.add(it.blob); n += it.stored ?? it.size; }
      }
    }
    return n;
  }

  private set(item: HubItem): void {
    const i = this.items.findIndex(x => x.id === item.id);
    if (i >= 0) this.items = [...this.items.slice(0, i), item, ...this.items.slice(i + 1)];
    else this.items = [...this.items, item];
  }

  private namesOf(kind: HubItem['kind'], except?: string): string[] {
    return this.items.filter(i => i.kind === kind && i.deletedAt === null && i.id !== except).map(i => i.name);
  }

  async projectBytes(item: HubItem, index?: number): Promise<Uint8Array> {
    const vs = item.versions ?? [];
    const v = vs[index ?? vs.length - 1];
    if (!v) throw new Error('This project has no saved version.');
    const b = (await this.store.getBlobs([v.sha])).get(v.sha);
    if (!b) throw new Error('This project could not be found in storage.');
    return b.bytes;
  }

  async fileOf(item: HubItem): Promise<ExportFile> {
    if (!item.blob) throw new Error('This file has no content.');
    const b = (await this.store.getBlobs([item.blob])).get(item.blob);
    if (!b) throw new Error('This file could not be found in storage.');
    const [d] = await this.jobs.decodeJob([{ key: b.sha, bytes: b.bytes, size: b.size }]);
    const f = DataRegistry.validateFileType(d.value);
    if (!f) throw new Error('This file is damaged.');
    return f;
  }

  async downloadOf(item: HubItem): Promise<{ bytes: Uint8Array; fileName: string; mime: string }> {
    if (item.kind === 'project') {
      const bytes = await relabelProject(await this.projectBytes(item), { projectId: item.id, name: item.name });
      return { bytes, fileName: safeFileName(item.name, PROJECT_EXT), mime: 'application/octet-stream' };
    }
    const f = await this.fileOf(item);
    const text = JSON.stringify({ ...f, name: item.name }, null, 2);
    return { bytes: new TextEncoder().encode(text), fileName: safeFileName(item.name, '.json'), mime: 'application/json' };
  }

  async markDownloaded(id: string): Promise<void> {
    if (!this.get(id)) return;
    const next = await this.store.patchItem(id, { downloaded: this.now() });
    if (!next) return;
    this.set(next);
    this.emit();
  }

  async markOpened(id: string): Promise<void> {
    if (!this.get(id)) return;
    const next = await this.store.patchItem(id, { opened: this.now() });
    if (!next) return;
    this.set(next);
    this.emit();
  }

  noteSaved(item: HubItem): void {
    this.set(item);
    this.emit();
  }

  async addExportedFile(file: ExportFile): Promise<{ item: HubItem; renamed: boolean; existed: boolean }> {
    const contentHash = await fileContentHash(file);
    const same = this.items.find(i => i.kind === 'file' && i.deletedAt === null && i.contentHash === contentHash);
    if (same) return { item: same, renamed: false, existed: true };
    const want = cleanName(file.name || 'Untitled');
    const name = nextFreeName(want, this.namesOf('file'));
    const item = await this.storeFile({ ...file, name }, contentHash, name);
    return { item, renamed: name !== want, existed: false };
  }

  private async storeFile(file: ExportFile, contentHash: string, name: string): Promise<HubItem> {
    const [enc] = await this.jobs.encodeJob([{ key: 'f', value: file }]);
    const now = this.now();
    const item: HubItem = {
      id: newId(), kind: 'file', name, fileType: file.type, created: now, modified: now, opened: 0, downloaded: 0,
      size: enc.size, contentHash, deletedAt: null, blob: enc.sha256, stored: enc.bytes.length,
    };
    await this.store.putItem(item, [{ sha: enc.sha256, bytes: enc.bytes, size: enc.size, enc: 'deflate' }]);
    this.set(item);
    this.emit();
    return item;
  }

  async prepare(files: readonly PickedBytes[], onProgress?: (done: number, total: number) => void, stopped?: () => boolean): Promise<PrepareResult> {
    const out: PrepareResult = { ready: [], duplicates: [], refused: [], skipped: [], emptyBackups: [] };
    const seenFile = new Set<string>();
    const seenProject = new Set<string>();
    let n = 0;
    for (const f of files) {
      if (stopped?.()) break;
      onProgress?.(n++, files.length);
      const label = f.path || f.name;
      const isOurs = /\.(istrong|istrongbackup|json)$/i.test(f.name);
      if (!isOurs) { out.skipped.push(label); continue; }
      let bytes: Uint8Array;
      try { bytes = await f.read(); } catch { out.refused.push({ file: label, why: 'It could not be read.' }); continue; }
      let sniff;
      try { sniff = await this.jobs.sniffJob(bytes, f.name); }
      catch (e) { out.refused.push({ file: label, why: e instanceof Error ? e.message : 'It could not be read.' }); continue; }
      if (sniff.kind === 'unknown') { out.refused.push({ file: label, why: sniff.why }); continue; }
      if (sniff.kind === 'project') {
        try {
          const keep = bytes.slice();
          const un = await this.jobs.unpackProjectJob(bytes, true);
          if (seenProject.has(un.label.projectId + un.label.contentHash)) continue;
          seenProject.add(un.label.projectId + un.label.contentHash);
          const p = this.prepareProject(un.label.projectId, un.label, [{ bytes: keep, saved: un.label.saved, appVersion: un.label.appVersion }], label);
          (p.dup ? out.duplicates : out.ready).push(p);
        } catch (e) {
          out.refused.push({ file: label, why: e instanceof Error ? e.message : 'It is damaged.' });
        }
        continue;
      }
      if (sniff.kind === 'backup') {
        try {
          const b = await this.jobs.unpackBackupJob(bytes);
          if (b.items.length === 0) out.emptyBackups.push(label);
          else await this.prepareBackup(b.items, label, out, seenFile, seenProject);
        } catch (e) {
          out.refused.push({ file: label, why: e instanceof Error ? e.message : 'It is damaged.' });
        }
        continue;
      }
      const file = DataRegistry.validateImport(sniff.value);
      if (!file) { out.refused.push({ file: label, why: DataRegistry.lastRejectReason ?? 'It is not a file the game knows.' }); DataRegistry.lastRejectReason = null; continue; }
      const p = await this.prepareFile(file, f.name, label);
      if (seenFile.has(p.contentHash)) continue;
      seenFile.add(p.contentHash);
      (p.dup ? out.duplicates : out.ready).push(p);
    }
    onProgress?.(files.length, files.length);
    return out;
  }

  private prepareProject(id: string, label: ProjectLabel, versions: { bytes: Uint8Array; saved: number; appVersion: string }[], source: string): Extract<Prepared, { kind: 'project' }> {
    const existing = this.items.find(i => i.kind === 'project' && i.id === id && i.deletedAt === null);
    const dup = existing ? (existing.contentHash === label.contentHash ? 'same' : 'version') : null;
    return { kind: 'project', id, name: cleanName(label.name) || 'Untitled Project', label, versions, readOnly: isReadOnlyLabel(label), dup, source };
  }

  private async prepareFile(file: ExportFile, fileName: string, source: string): Promise<Extract<Prepared, { kind: 'file' }>> {
    const contentHash = await fileContentHash(file);
    const dup = this.items.some(i => i.kind === 'file' && i.deletedAt === null && i.contentHash === contentHash) ? 'same' : null;
    const name = cleanName(file.name && file.name !== 'Unnamed' ? file.name : fileName.replace(/\.json$/i, '')) || 'Untitled';
    return { kind: 'file', name, file, contentHash, dup, source };
  }

  private async prepareBackup(items: BackupItem[], source: string, out: PrepareResult, seenFile: Set<string>, seenProject: Set<string>): Promise<void> {
    for (const it of items) {
      if (it.kind === 'project' && it.versions && it.versions.length > 0) {
        try {
          const latest = it.versions[it.versions.length - 1];
          const un = await this.jobs.unpackProjectJob(latest.slice(), true);
          const id = it.id || un.label.projectId;
          if (seenProject.has(id + un.label.contentHash)) continue;
          seenProject.add(id + un.label.contentHash);
          const versions = it.versions.map(v => ({ bytes: v, saved: Number(it.meta.saved ?? un.label.saved) || un.label.saved, appVersion: un.label.appVersion }));
          if (SMALL_FIX.R830) for (let i = 0; i < versions.length - 1; i++) {
            try { const lab = (await this.jobs.unpackProjectJob(it.versions[i].slice(), true)).label; if (lab.saved > 0) versions[i].saved = lab.saved; if (lab.appVersion) versions[i].appVersion = lab.appVersion; }
            catch { }
          }
          const p = this.prepareProject(id, { ...un.label, name: it.name || un.label.name }, versions, source);
          (p.dup ? out.duplicates : out.ready).push(p);
        } catch (e) {
          out.refused.push({ file: `${source}: ${it.name}`, why: e instanceof Error ? e.message : 'It is damaged.' });
        }
      } else if (it.kind === 'file') {
        const file = DataRegistry.validateImport(it.file, true);
        if (!file) { out.refused.push({ file: `${source}: ${it.name}`, why: DataRegistry.lastRejectReason ?? 'It is not a file the game knows.' }); DataRegistry.lastRejectReason = null; continue; }
        const p = await this.prepareFile({ ...file, name: it.name || file.name }, it.name, source);
        if (seenFile.has(p.contentHash)) continue;
        seenFile.add(p.contentHash);
        (p.dup ? out.duplicates : out.ready).push(p);
      }
    }
  }

  async commit(items: readonly Prepared[], addCopies: boolean): Promise<HubItem[]> {
    const added: HubItem[] = [];
    const newItems: HubItem[] = [];
    const blobs: BlobRec[] = [];
    const takenIds = new Set<string>();
    for (const i of this.items) takenIds.add(i.id);
    for (const p of items) {
      if (p.dup && !addCopies) continue;
      const now = this.now();
      if (p.kind === 'project') {
        const taken = [...this.namesOf('project'), ...newItems.filter(i => i.kind === 'project').map(i => i.name)];
        const name = nextFreeName(p.name, taken);
        const versions: HubVersion[] = [];
        for (const v of p.versions) {
          const sha = await sha256Hex(v.bytes);
          versions.push({ sha, saved: v.saved, size: v.bytes.length, appVersion: v.appVersion });
          blobs.push({ sha, bytes: v.bytes, size: v.bytes.length, enc: 'raw' });
        }
        const last = p.versions[p.versions.length - 1];
        const id = p.dup || takenIds.has(p.id) ? newId() : p.id;
        takenIds.add(id);
        const item: HubItem = {
          id, kind: 'project', name, created: p.label.created || now, modified: now, opened: 0,
          downloaded: 0, size: last.bytes.length, contentHash: p.label.contentHash, deletedAt: null,
          versions: versions.slice(-VERSIONS_KEPT), readOnly: p.readOnly,
        };
        newItems.push(item);
      } else {
        const taken = [...this.namesOf('file'), ...newItems.filter(i => i.kind === 'file').map(i => i.name)];
        const name = nextFreeName(p.name, taken);
        const [enc] = await this.jobs.encodeJob([{ key: 'f', value: { ...p.file, name } }]);
        blobs.push({ sha: enc.sha256, bytes: enc.bytes, size: enc.size, enc: 'deflate' });
        newItems.push({
          id: newId(), kind: 'file', name, fileType: p.file.type, created: now, modified: now, opened: 0, downloaded: 0,
          size: enc.size, contentHash: p.contentHash, deletedAt: null, blob: enc.sha256, stored: enc.bytes.length,
        });
      }
    }
    if (newItems.length > 0) {
      await this.store.putItems(newItems, blobs);
      for (const i of newItems) { this.set(i); added.push(i); }
      this.emit();
    }
    return added;
  }

  async rename(id: string, raw: string): Promise<string | null> {
    const it = this.get(id);
    if (!it) return 'It is not there any more.';
    const name = cleanName(raw, NAME_MAX);
    if (!name) return 'A name cannot be empty.';
    if (name === it.name) return null;
    if (this.namesOf(it.kind, id).some(n => n.toLowerCase() === name.toLowerCase())) return 'That name is taken.';
    const modified = this.now();
    const next = { ...it, name, modified };
    this.set(next);
    this.emit();
    try { const stored = await this.store.patchItem(id, { name, modified }); if (stored) { this.set(stored); this.emit(); } }
    catch (e) { this.set(it); this.emit(); throw e; }
    if (it.kind === 'project' && this.session.view.projectId === id) this.session.renamed(name);
    return null;
  }

  async duplicate(id: string): Promise<HubItem | null> {
    const it = this.get(id);
    if (!it) return null;
    const now = this.now();
    const copy: HubItem = { ...it, id: newId(), name: nextFreeName(it.name, this.namesOf(it.kind)), created: now, modified: now, opened: 0, downloaded: 0, deletedAt: null };
    await this.store.putItem(copy);
    this.set(copy);
    this.emit();
    return copy;
  }

  async remove(id: string): Promise<void> {
    const it = this.get(id);
    if (!it || it.deletedAt !== null) return;
    const deletedAt = this.now();
    const next = { ...it, deletedAt };
    this.set(next);
    this.emit();
    try { await this.store.patchItem(id, { deletedAt }); }
    catch (e) { if (SMALL_FIX.R791) { this.set(it); this.emit(); } throw e; }
    if (it.kind === 'project' && this.session.view.projectId === id) this.session.detachProject();
  }

  async restore(id: string): Promise<void> {
    const it = this.get(id);
    if (!it || it.deletedAt === null) return;
    const name = nextFreeName(it.name, this.namesOf(it.kind, id));
    const next = { ...it, deletedAt: null, name };
    this.set(next);
    this.emit();
    try { await this.store.patchItem(id, { deletedAt: null, name }); }
    catch (e) { if (SMALL_FIX.R791) { this.set(it); this.emit(); } throw e; }
    if (it.kind === 'project') this.session.reattachProject(id, name);
  }

  async removeForGood(id: string): Promise<void> {
    const it = this.get(id);
    this.items = this.items.filter(i => i.id !== id);
    this.emit();
    try { await this.store.removeItem(id); }
    catch (e) { if (SMALL_FIX.R791 && it) { this.set(it); this.emit(); } throw e; }
    void this.store.collect(this.now()).then(() => this.session.forgetStored()).catch(() => { });
  }

  async backupAll(): Promise<{ bytes: Uint8Array; fileName: string }> {
    if (!this.hasBackupContent()) throw new Error('There is nothing to back up yet.');
    const items: BackupItem[] = [];
    for (const it of this.items) {
      if (it.deletedAt !== null) continue;
      if (it.kind === 'project') {
        const shas = (it.versions ?? []).map(v => v.sha);
        const blobs = await this.store.getBlobs(shas);
        const versions = shas.map(s => blobs.get(s)?.bytes).filter((b): b is Uint8Array => !!b);
        if (versions.length > 0) items.push({ kind: 'project', id: it.id, name: it.name, meta: { created: it.created, saved: it.modified }, versions });
      } else {
        try { items.push({ kind: 'file', id: it.id, name: it.name, meta: { created: it.created }, file: await this.fileOf(it) }); }
        catch { }
      }
    }
    const made = this.now();
    const bytes = await this.jobs.packBackupJob(items, this.appVersion, made);
    if (SMALL_FIX.R831) { try { await this.store.setMeta('lastBackupAt', made); } catch { } }
    else await this.store.setMeta('lastBackupAt', made);
    const d = new Date(made);
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { bytes, fileName: safeFileName(`iStrongEngine Backup ${stamp}`, BACKUP_EXT) };
  }
}
