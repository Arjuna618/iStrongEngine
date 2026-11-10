import type { JobRequest, EncodedRecord, SniffResult } from './workerOps';
import type { UnpackedProject, ProjectLabel, BackupItem } from './format';
import { ZipError } from './zip';
import { ProjectDataError } from './canonical';
import { NewerFileError } from './format';

let _worker: Worker | null = null;
let _broken = false;
let _next = 1;
const _pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();

export function workerState(): 'ok' | 'none' { return _broken ? 'none' : 'ok'; }

function rebuildError(name: string, message: string): Error {
  if (name === 'NewerFileError') return new NewerFileError(message);
  if (name === 'ZipError') return new ZipError(message);
  if (name === 'ProjectDataError') return new ProjectDataError(message);
  return new Error(message);
}

function getWorker(): Worker | null {
  if (_broken) return null;
  if (_worker) return _worker;
  if (typeof Worker === 'undefined') { _broken = true; return null; }
  try {
    _worker = new Worker(new URL('./projectWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    _broken = true;
    return null;
  }
  _worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string; name?: string }>) => {
    const p = _pending.get(e.data.id);
    if (!p) return;
    _pending.delete(e.data.id);
    clearTimeout(p.timer);
    if (e.data.ok) p.resolve(e.data.result);
    else p.reject(rebuildError(e.data.name ?? 'Error', e.data.error ?? 'The job failed'));
  };
  _worker.onerror = () => {
    _broken = true;
    for (const [, p] of _pending) { clearTimeout(p.timer); p.reject(new Error('The background helper stopped')); }
    _pending.clear();
    _worker?.terminate();
    _worker = null;
  };
  return _worker;
}

function bufferOf(v: unknown, out: ArrayBuffer[]): void {
  if (v instanceof Uint8Array) { if (v.byteOffset === 0 && v.byteLength === v.buffer.byteLength && v.buffer instanceof ArrayBuffer && !out.includes(v.buffer)) out.push(v.buffer); return; }
  if (Array.isArray(v)) { for (const x of v) bufferOf(x, out); return; }
  if (v && typeof v === 'object' && !(v instanceof Map)) for (const x of Object.values(v)) bufferOf(x, out);
}

async function job<T>(req: JobRequest, transfer: boolean, timeoutMs: number, outside = false): Promise<T> {
  const w = getWorker();
  if (!w) {
    const { runJob } = await import('./workerOps');
    return (await runJob(req, outside)) as T;
  }
  const id = _next++;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(id);
      for (const [, p] of _pending) { clearTimeout(p.timer); p.reject(new Error('The background helper was restarted')); }
      _pending.clear();
      w.terminate();
      if (_worker === w) _worker = null;
      reject(new Error('Reading the file took too long, so it was stopped.'));
    }, timeoutMs);
    _pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    const t: ArrayBuffer[] = [];
    if (transfer) bufferOf(req, t);
    w.postMessage({ id, req }, t);
  });
}

const OUTSIDE_MS = 10_000;
const OWN_MS = 60_000;

export function packProjectJob(req: Extract<JobRequest, { op: 'packProject' }>): Promise<{ bytes: Uint8Array; contentHash: string; label: ProjectLabel }> {
  return job(req, false, OWN_MS);
}
export function unpackProjectJob(bytes: Uint8Array, outside: boolean): Promise<UnpackedProject> {
  return job({ op: 'unpackProject', bytes }, true, outside ? OUTSIDE_MS : OWN_MS, outside);
}
export function packBackupJob(items: BackupItem[], appVersion: string, made: number): Promise<Uint8Array> {
  return job({ op: 'packBackup', items, appVersion, made }, false, OWN_MS);
}
export function unpackBackupJob(bytes: Uint8Array): Promise<{ made: number; items: BackupItem[] }> {
  return job({ op: 'unpackBackup', bytes }, true, OWN_MS, true);
}
export function encodeJob(records: { key: string; value: unknown }[]): Promise<EncodedRecord[]> {
  return job({ op: 'encode', records }, false, OWN_MS);
}
export function decodeJob(records: { key: string; bytes: Uint8Array; size: number }[]): Promise<{ key: string; value: unknown }[]> {
  return job({ op: 'decode', records }, false, OWN_MS);
}
export function sniffJob(bytes: Uint8Array, name: string): Promise<SniffResult> {
  return job({ op: 'sniff', bytes, name }, false, OUTSIDE_MS, true);
}
