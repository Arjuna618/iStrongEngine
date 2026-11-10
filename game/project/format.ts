import { canonicalBytes, canonicalStringify, safeParse, textOf, bytesOf, ProjectDataError, type ParseLimits, DEFAULT_PARSE_LIMITS } from './canonical';
import { sha256Hex } from './hash';
import { readZip, writeZip, ZipError, ZIP_LIMITS, zipNameOk, type ZipLimits, type ZipEntryIn } from './zip';

export const PROJECT_MIME = 'application/x-istrong-project';
export const BACKUP_MIME = 'application/x-istrong-backup';
export const PROJECT_EXT = '.istrong';
export const BACKUP_EXT = '.istrongbackup';

export const FORMAT_VERSION = 1;
export const READER_VERSION = 1;
export const WRITER_VERSION = 1;

export class NewerFileError extends Error {}

export interface SectionRecord { version: number; data: unknown }

export interface ProjectLabel {
  format: 'istrong-project';
  formatVersion: number;
  minReaderVersion: number;
  minWriterVersion: number;
  appVersion: string;
  projectId: string;
  name: string;
  created: number;
  saved: number;
  sections: Record<string, { version: number; sha256: string }>;
  blobs: string[];
  extra: string[];
  contentHash: string;
}

export interface ProjectMeta {
  projectId: string;
  name: string;
  created: number;
  saved: number;
  appVersion: string;
}

export interface ProjectContent {
  sections: Record<string, SectionRecord>;
  blobs: readonly unknown[];
  extra?: ReadonlyMap<string, Uint8Array>;
}

export interface UnpackedProject {
  label: ProjectLabel;
  sections: Record<string, SectionRecord>;
  blobs: Map<string, unknown>;
  extra: Map<string, Uint8Array>;
  problems: { part: string; why: string }[];
  readOnlyByFormat: boolean;
}

const SECTION_ID = /^[a-z][a-z0-9-]{0,40}$/;
const SHA = /^[0-9a-f]{64}$/;

export async function contentHashOf(sections: Record<string, { version: number; sha256: string }>, blobs: readonly string[], extra: readonly { name: string; sha256: string }[]): Promise<string> {
  return sha256Hex(canonicalBytes({ sections, blobs: [...blobs].sort(), extra: [...extra].sort((a, b) => (a.name < b.name ? -1 : 1)) }));
}

export async function packProject(meta: ProjectMeta, content: ProjectContent): Promise<{ bytes: Uint8Array; contentHash: string; label: ProjectLabel }> {
  const secIds = Object.keys(content.sections).sort();
  const secEntries: ZipEntryIn[] = [];
  const secTable: Record<string, { version: number; sha256: string }> = {};
  for (const id of secIds) {
    if (!SECTION_ID.test(id)) throw new ProjectDataError(`Bad section id ${id}`);
    const rec = content.sections[id];
    const data = canonicalBytes(rec.data);
    secTable[id] = { version: rec.version, sha256: await sha256Hex(data) };
    secEntries.push({ name: `sections/${id}.json`, data });
  }
  const blobMap = new Map<string, Uint8Array>();
  for (const b of content.blobs) {
    const data = canonicalBytes(b);
    const h = await sha256Hex(data);
    if (!blobMap.has(h)) blobMap.set(h, data);
  }
  const blobNames = [...blobMap.keys()].sort();
  const extraNames = content.extra ? [...content.extra.keys()].sort() : [];
  const extraHashed: { name: string; sha256: string }[] = [];
  for (const n of extraNames) {
    if (!n.startsWith('keep/') || !zipNameOk(n)) throw new ProjectDataError(`Bad kept entry ${n}`);
    extraHashed.push({ name: n, sha256: await sha256Hex(content.extra!.get(n)!) });
  }
  const contentHash = await contentHashOf(secTable, blobNames, extraHashed);
  const label: ProjectLabel = {
    format: 'istrong-project',
    formatVersion: FORMAT_VERSION,
    minReaderVersion: 1,
    minWriterVersion: 1,
    appVersion: meta.appVersion,
    projectId: meta.projectId,
    name: meta.name,
    created: meta.created,
    saved: meta.saved,
    sections: secTable,
    blobs: blobNames,
    extra: extraNames,
    contentHash,
  };
  const entries: ZipEntryIn[] = [
    { name: 'mimetype', data: bytesOf(PROJECT_MIME), store: true },
    { name: 'project.json', data: canonicalBytes(label) },
    ...secEntries,
    ...blobNames.map(h => ({ name: `blobs/${h}.json`, data: blobMap.get(h)! })),
    ...extraNames.map(n => ({ name: n, data: content.extra!.get(n)! })),
  ];
  return { bytes: await writeZip(entries), contentHash, label };
}

export async function relabelProject(bytes: Uint8Array, as: { projectId: string; name: string }, limits: ZipLimits = ZIP_LIMITS): Promise<Uint8Array> {
  const files = await readZip(bytes, limits);
  const raw = files.get('project.json');
  if (!raw) throw new ProjectDataError('The file has no label');
  const label = readLabel(JSON.parse(new TextDecoder().decode(raw)));
  if (label.projectId === as.projectId && label.name === as.name) return bytes;
  const next: ProjectLabel = { ...label, projectId: as.projectId, name: as.name };
  const entries: ZipEntryIn[] = [
    { name: 'mimetype', data: bytesOf(PROJECT_MIME), store: true },
    { name: 'project.json', data: canonicalBytes(next) },
  ];
  for (const [name, data] of files) if (name !== 'mimetype' && name !== 'project.json') entries.push({ name, data });
  return writeZip(entries, limits);
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ProjectDataError(`The label's ${what} is missing`);
  return v;
}
function str(v: unknown, what: string, max = 400): string {
  if (typeof v !== 'string' || v.length > max) throw new ProjectDataError(`The label's ${what} is missing`);
  return v;
}

export function readLabel(v: unknown): ProjectLabel {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ProjectDataError('The label is missing');
  const o = v as Record<string, unknown>;
  if (o.format !== 'istrong-project') throw new ProjectDataError('Not a project file');
  const minReader = num(o.minReaderVersion, 'reader version');
  if (minReader > READER_VERSION) throw new NewerFileError('This project was made with a newer version of iStrongEngine. Update the app to open it.');
  const secIn = o.sections;
  if (!secIn || typeof secIn !== 'object' || Array.isArray(secIn)) throw new ProjectDataError('The label lists no sections');
  const sections: Record<string, { version: number; sha256: string }> = {};
  for (const [id, s] of Object.entries(secIn as Record<string, unknown>)) {
    if (!SECTION_ID.test(id) || !s || typeof s !== 'object') throw new ProjectDataError('The label lists a bad section');
    const so = s as Record<string, unknown>;
    const sha = str(so.sha256, 'section check');
    if (!SHA.test(sha)) throw new ProjectDataError('The label lists a bad section');
    sections[id] = { version: num(so.version, 'section version'), sha256: sha };
  }
  const blobs = Array.isArray(o.blobs) ? o.blobs.map(b => { const s = str(b, 'blob'); if (!SHA.test(s)) throw new ProjectDataError('The label lists a bad blob'); return s; }) : [];
  const extra = Array.isArray(o.extra) ? o.extra.map(e => { const s = str(e, 'kept entry'); if (!s.startsWith('keep/') || !zipNameOk(s)) throw new ProjectDataError('The label lists a bad entry'); return s; }) : [];
  const contentHash = str(o.contentHash, 'content check');
  if (!SHA.test(contentHash)) throw new ProjectDataError('The label is damaged');
  return {
    format: 'istrong-project',
    formatVersion: num(o.formatVersion, 'format version'),
    minReaderVersion: minReader,
    minWriterVersion: num(o.minWriterVersion, 'writer version'),
    appVersion: str(o.appVersion, 'app version', 40),
    projectId: str(o.projectId, 'id', 80),
    name: str(o.name, 'name', 200),
    created: num(o.created, 'date'),
    saved: num(o.saved, 'date'),
    sections, blobs, extra, contentHash,
  };
}

export async function unpackProject(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS, parseLimits: ParseLimits = DEFAULT_PARSE_LIMITS): Promise<UnpackedProject> {
  const entries = await readZip(bytes, limits);
  const first = entries.keys().next().value;
  if (first !== 'mimetype' || textOf(entries.get('mimetype')!) !== PROJECT_MIME) throw new ProjectDataError('Not a project file');
  const labelBytes = entries.get('project.json');
  if (!labelBytes) throw new ProjectDataError('The label is missing');
  const label = readLabel(safeParse(textOf(labelBytes), parseLimits));
  const problems: { part: string; why: string }[] = [];
  const sections: Record<string, SectionRecord> = {};
  const known = new Set<string>(['mimetype', 'project.json']);
  for (const [id, s] of Object.entries(label.sections)) {
    const name = `sections/${id}.json`;
    known.add(name);
    const b = entries.get(name);
    if (!b) { problems.push({ part: id, why: 'It is missing from the file.' }); continue; }
    if (await sha256Hex(b) !== s.sha256) { problems.push({ part: id, why: 'It is damaged (its check failed).' }); continue; }
    try { sections[id] = { version: s.version, data: safeParse(textOf(b), parseLimits) }; }
    catch (e) { problems.push({ part: id, why: e instanceof Error ? e.message : 'It could not be read.' }); }
  }
  const blobs = new Map<string, unknown>();
  for (const h of label.blobs) {
    const name = `blobs/${h}.json`;
    known.add(name);
    const b = entries.get(name);
    if (!b) { problems.push({ part: 'blob ' + h.slice(0, 8), why: 'It is missing from the file.' }); continue; }
    if (await sha256Hex(b) !== h) { problems.push({ part: 'blob ' + h.slice(0, 8), why: 'It is damaged (its check failed).' }); continue; }
    try { blobs.set(h, safeParse(textOf(b), parseLimits)); }
    catch (e) { problems.push({ part: 'blob ' + h.slice(0, 8), why: e instanceof Error ? e.message : 'It could not be read.' }); }
  }
  const extra = new Map<string, Uint8Array>();
  for (const n of label.extra) {
    known.add(n);
    const b = entries.get(n);
    if (b) extra.set(n, b); else problems.push({ part: n, why: 'It is missing from the file.' });
  }
  for (const n of entries.keys()) if (!known.has(n)) throw new ProjectDataError('The file holds an entry its label does not list');
  const extraHashed: { name: string; sha256: string }[] = [];
  for (const [n, b] of extra) extraHashed.push({ name: n, sha256: await sha256Hex(b) });
  if (problems.length === 0) {
    const h = await contentHashOf(label.sections, label.blobs, extraHashed);
    if (h !== label.contentHash) throw new ProjectDataError('This file is damaged (its content check failed)');
  }
  return { label, sections, blobs, extra, problems, readOnlyByFormat: label.minWriterVersion > WRITER_VERSION };
}

export function looksLikeProject(bytes: Uint8Array): boolean { return startsWithMime(bytes, PROJECT_MIME); }
export function looksLikeBackup(bytes: Uint8Array): boolean { return startsWithMime(bytes, BACKUP_MIME); }

function startsWithMime(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 38 + mime.length) return false;
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return false;
  const name = String.fromCharCode(...bytes.subarray(30, 38));
  if (name !== 'mimetype') return false;
  return String.fromCharCode(...bytes.subarray(38, 38 + mime.length)) === mime;
}

export interface BackupItem { kind: 'project' | 'file'; id: string; name: string; meta: Record<string, unknown>; versions?: Uint8Array[]; file?: unknown }

export async function packBackup(items: readonly BackupItem[], appVersion: string, made: number): Promise<Uint8Array> {
  const entries: ZipEntryIn[] = [{ name: 'mimetype', data: bytesOf(BACKUP_MIME), store: true }];
  const index: { kind: string; id: string; name: string; meta: Record<string, unknown>; versions?: string[]; file?: string }[] = [];
  const parts: ZipEntryIn[] = [];
  let i = 0;
  for (const it of items) {
    const key = `i${i++}`;
    if (it.kind === 'project') {
      const vs = (it.versions ?? []).map((v, k) => { const n = `projects/${key}/v${k}.istrong`; parts.push({ name: n, data: v, store: true }); return n; });
      index.push({ kind: 'project', id: it.id, name: it.name, meta: it.meta, versions: vs });
    } else {
      const n = `files/${key}.json`;
      parts.push({ name: n, data: canonicalBytes(it.file) });
      index.push({ kind: 'file', id: it.id, name: it.name, meta: it.meta, file: n });
    }
  }
  entries.push({ name: 'backup.json', data: canonicalBytes({ format: 'istrong-backup', formatVersion: 1, appVersion, made, items: index }) });
  return writeZip([...entries, ...parts]);
}

export async function unpackBackup(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): Promise<{ made: number; items: BackupItem[] }> {
  const entries = await readZip(bytes, limits);
  if (entries.keys().next().value !== 'mimetype' || textOf(entries.get('mimetype')!) !== BACKUP_MIME) throw new ProjectDataError('Not a backup file');
  const idx = safeParse(textOf(entries.get('backup.json') ?? new Uint8Array()), DEFAULT_PARSE_LIMITS) as Record<string, unknown>;
  if (!idx || idx.format !== 'istrong-backup' || !Array.isArray(idx.items)) throw new ProjectDataError('The backup is damaged');
  if (typeof idx.formatVersion !== 'number' || idx.formatVersion > 1) throw new NewerFileError('This backup was made with a newer version of iStrongEngine. Update the app to open it.');
  const items: BackupItem[] = [];
  for (const raw of idx.items as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue;
    const name = typeof raw.name === 'string' ? raw.name.slice(0, 200) : 'Unnamed';
    const id = typeof raw.id === 'string' ? raw.id.slice(0, 80) : '';
    const meta = raw.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta) ? raw.meta as Record<string, unknown> : {};
    if (raw.kind === 'project' && Array.isArray(raw.versions)) {
      const versions = raw.versions.map(n => (typeof n === 'string' ? entries.get(n) : undefined)).filter((b): b is Uint8Array => !!b);
      items.push({ kind: 'project', id, name, meta, versions });
    } else if (raw.kind === 'file' && typeof raw.file === 'string' && entries.has(raw.file)) {
      items.push({ kind: 'file', id, name, meta, file: safeParse(textOf(entries.get(raw.file)!), DEFAULT_PARSE_LIMITS) });
    }
  }
  return { made: typeof idx.made === 'number' ? idx.made : 0, items };
}

export { ZipError, ProjectDataError, canonicalStringify };
