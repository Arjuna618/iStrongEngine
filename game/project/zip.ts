import { crc32 } from './hash';

export class ZipError extends Error {}

export interface ZipLimits {
  maxFile: number;
  maxUnpacked: number;
  maxEntries: number;
}

export const ZIP_LIMITS: ZipLimits = { maxFile: 1024 * 1024 * 1024, maxUnpacked: 1536 * 1024 * 1024, maxEntries: 10_000 };
export const ZIP_LIMITS_NO_WORKER: ZipLimits = { maxFile: 2 * 1024 * 1024, maxUnpacked: 2 * 1024 * 1024, maxEntries: 2_000 };

export interface ZipEntryIn { name: string; data: Uint8Array; store?: boolean }

const NAME_OK = /^[a-z0-9][a-z0-9._\-]*(\/[a-z0-9][a-z0-9._\-]*)*$/;
const MAX_NAME = 200;
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

export function zipNameOk(name: string): boolean {
  return name.length > 0 && name.length <= MAX_NAME && NAME_OK.test(name) && !name.includes('..');
}

async function streamThrough(bytes: Uint8Array, ts: TransformStream<Uint8Array, Uint8Array>, budget: number): Promise<Uint8Array> {
  const writer = ts.writable.getWriter();
  const reader = ts.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const wrote = (async () => { await writer.write(bytes); await writer.close(); })();
  wrote.catch(() => { });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > budget) {
        reader.cancel().catch(() => {});
        writer.abort().catch(() => {});
        throw new ZipError('An entry unpacks to more than it may');
      }
      chunks.push(value);
    }
    await wrote;
  } catch (e) {
    if (e instanceof ZipError) throw e;
    throw new ZipError('An entry is damaged');
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return streamThrough(bytes, new CompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>, Number.MAX_SAFE_INTEGER);
}

export function inflateRaw(bytes: Uint8Array, budget: number): Promise<Uint8Array> {
  return streamThrough(bytes, new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>, budget);
}

export async function writeZip(entries: readonly ZipEntryIn[], limits: ZipLimits = ZIP_LIMITS): Promise<Uint8Array> {
  if (entries.length > limits.maxEntries) throw new ZipError('It holds too many parts to keep in one file');
  let unpacked = 0;
  for (const e of entries) unpacked += e.data.length;
  if (unpacked > limits.maxUnpacked) throw new ZipError('It is too big to keep in one file');
  const seen = new Set<string>();
  const parts: { name: Uint8Array; method: number; crc: number; size: number; data: Uint8Array; offset: number }[] = [];
  const enc = new TextEncoder();
  let offset = 0;
  for (const e of entries) {
    if (!zipNameOk(e.name)) throw new ZipError(`Bad entry name ${e.name}`);
    if (seen.has(e.name)) throw new ZipError(`Entry ${e.name} twice`);
    seen.add(e.name);
    const name = enc.encode(e.name);
    const store = !!e.store;
    const data = store ? e.data : await deflateRaw(e.data);
    parts.push({ name, method: store ? 0 : 8, crc: crc32(e.data), size: e.data.length, data, offset });
    offset += 30 + name.length + data.length;
  }
  let cdSize = 0;
  for (const p of parts) cdSize += 46 + p.name.length;
  if (offset + cdSize + 22 > limits.maxFile) throw new ZipError('It is too big to keep in one file');
  const out = new Uint8Array(offset + cdSize + 22);
  const dv = new DataView(out.buffer);
  let o = 0;
  for (const p of parts) {
    dv.setUint32(o, 0x04034b50, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 0, true); dv.setUint16(o + 8, p.method, true);
    dv.setUint16(o + 10, DOS_TIME, true); dv.setUint16(o + 12, DOS_DATE, true); dv.setUint32(o + 14, p.crc, true);
    dv.setUint32(o + 18, p.data.length, true); dv.setUint32(o + 22, p.size, true); dv.setUint16(o + 26, p.name.length, true); dv.setUint16(o + 28, 0, true);
    out.set(p.name, o + 30); out.set(p.data, o + 30 + p.name.length);
    o += 30 + p.name.length + p.data.length;
  }
  const cdStart = o;
  for (const p of parts) {
    dv.setUint32(o, 0x02014b50, true); dv.setUint16(o + 4, 20, true); dv.setUint16(o + 6, 20, true); dv.setUint16(o + 8, 0, true);
    dv.setUint16(o + 10, p.method, true); dv.setUint16(o + 12, DOS_TIME, true); dv.setUint16(o + 14, DOS_DATE, true); dv.setUint32(o + 16, p.crc, true);
    dv.setUint32(o + 20, p.data.length, true); dv.setUint32(o + 24, p.size, true); dv.setUint16(o + 28, p.name.length, true);
    dv.setUint16(o + 30, 0, true); dv.setUint16(o + 32, 0, true); dv.setUint16(o + 34, 0, true); dv.setUint16(o + 36, 0, true);
    dv.setUint32(o + 38, 0, true); dv.setUint32(o + 42, p.offset, true);
    out.set(p.name, o + 46);
    o += 46 + p.name.length;
  }
  dv.setUint32(o, 0x06054b50, true); dv.setUint16(o + 4, 0, true); dv.setUint16(o + 6, 0, true);
  dv.setUint16(o + 8, parts.length, true); dv.setUint16(o + 10, parts.length, true);
  dv.setUint32(o + 12, cdSize, true); dv.setUint32(o + 16, cdStart, true); dv.setUint16(o + 20, 0, true);
  return out;
}

export async function readZip(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): Promise<Map<string, Uint8Array>> {
  if (bytes.length > limits.maxFile) throw new ZipError('The file is too big');
  if (bytes.length < 22) throw new ZipError('The file is cut short');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  if (dv.getUint32(eocd, true) !== 0x06054b50) throw new ZipError('Not a project file, or the file is cut short');
  if (dv.getUint16(eocd + 4, true) !== 0 || dv.getUint16(eocd + 6, true) !== 0) throw new ZipError('A multi part ZIP');
  const n = dv.getUint16(eocd + 8, true);
  if (n !== dv.getUint16(eocd + 10, true)) throw new ZipError('The entry counts disagree');
  if (n === 0 || n > limits.maxEntries) throw new ZipError('Too many or no entries');
  const cdSize = dv.getUint32(eocd + 12, true), cdStart = dv.getUint32(eocd + 16, true);
  if (dv.getUint16(eocd + 20, true) !== 0) throw new ZipError('A ZIP comment');
  if (cdSize === 0xffffffff || cdStart === 0xffffffff || n === 0xffff) throw new ZipError('ZIP64 is not used by project files');
  if (cdStart + cdSize !== eocd) throw new ZipError('The directory is not where it should be');
  const dec = new TextDecoder('utf-8', { fatal: true });
  const names = new Set<string>();
  const ents: { name: string; method: number; crc: number; csize: number; usize: number; off: number }[] = [];
  let p = cdStart;
  let unpacked = 0;
  for (let i = 0; i < n; i++) {
    if (p + 46 > eocd || dv.getUint32(p, true) !== 0x02014b50) throw new ZipError('The directory is damaged');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const disk = dv.getUint16(p + 34, true), off = dv.getUint32(p + 42, true);
    if (flags !== 0) throw new ZipError('An entry is encrypted or uses a feature project files never use');
    if (method !== 0 && method !== 8) throw new ZipError('An entry uses an unknown compression');
    if (xl !== 0 || cl !== 0 || disk !== 0) throw new ZipError('An entry has extra fields');
    if (csize === 0xffffffff || usize === 0xffffffff || off === 0xffffffff) throw new ZipError('ZIP64 is not used by project files');
    if (p + 46 + nl > eocd) throw new ZipError('The directory is damaged');
    let name: string;
    try { name = dec.decode(bytes.subarray(p + 46, p + 46 + nl)); } catch { throw new ZipError('An entry name is not text'); }
    if (!zipNameOk(name)) throw new ZipError(`An entry name is not allowed: ${name.slice(0, 60)}`);
    if (names.has(name)) throw new ZipError(`An entry is there twice: ${name}`);
    names.add(name);
    if (method === 0 && csize !== usize) throw new ZipError('A stored entry has two sizes');
    unpacked += usize;
    if (unpacked > limits.maxUnpacked) throw new ZipError('The file unpacks to more than it may');
    ents.push({ name, method, crc, csize, usize, off });
    p += 46 + nl;
  }
  if (p !== eocd) throw new ZipError('The directory is damaged');
  const out = new Map<string, Uint8Array>();
  let expect = 0;
  for (const e of ents) {
    if (e.off !== expect) throw new ZipError('Entries overlap or leave a gap');
    const o = e.off;
    if (o + 30 > cdStart || dv.getUint32(o, true) !== 0x04034b50) throw new ZipError('An entry is damaged');
    const nl = dv.getUint16(o + 26, true), xl = dv.getUint16(o + 28, true);
    if (dv.getUint16(o + 6, true) !== 0 || dv.getUint16(o + 8, true) !== e.method || dv.getUint32(o + 14, true) !== e.crc
      || dv.getUint32(o + 18, true) !== e.csize || dv.getUint32(o + 22, true) !== e.usize || xl !== 0) {
      throw new ZipError('An entry disagrees with the directory');
    }
    let lname: string;
    try { lname = dec.decode(bytes.subarray(o + 30, o + 30 + nl)); } catch { throw new ZipError('An entry name is not text'); }
    if (lname !== e.name) throw new ZipError('An entry disagrees with the directory');
    const start = o + 30 + nl, end = start + e.csize;
    if (end > cdStart) throw new ZipError('An entry runs past its end');
    const raw = bytes.subarray(start, end);
    const data = e.method === 0 ? raw.slice() : await inflateRaw(raw, e.usize);
    if (data.length !== e.usize) throw new ZipError('An entry is not the size it says');
    if (crc32(data) !== e.crc) throw new ZipError('An entry is damaged (its check failed)');
    out.set(e.name, data);
    expect = end;
  }
  if (expect !== cdStart) throw new ZipError('Entries leave a gap before the directory');
  return out;
}
