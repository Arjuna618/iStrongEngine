import { packProject, unpackProject, packBackup, unpackBackup, looksLikeProject, looksLikeBackup, type ProjectMeta, type ProjectContent, type BackupItem } from './format';
import { canonicalBytes, safeParse, textOf, DEFAULT_PARSE_LIMITS, type ParseLimits } from './canonical';
import { sha256Hex } from './hash';
import { deflateRaw, inflateRaw, ZIP_LIMITS, ZIP_LIMITS_NO_WORKER, type ZipLimits } from './zip';

export interface EncodedRecord { key: string; sha256: string; bytes: Uint8Array; size: number }

export type JobRequest =
  | { op: 'packProject'; meta: ProjectMeta; content: ProjectContent }
  | { op: 'unpackProject'; bytes: Uint8Array }
  | { op: 'packBackup'; items: BackupItem[]; appVersion: string; made: number }
  | { op: 'unpackBackup'; bytes: Uint8Array }
  | { op: 'encode'; records: { key: string; value: unknown }[] }
  | { op: 'decode'; records: { key: string; bytes: Uint8Array; size: number }[] }
  | { op: 'sniff'; bytes: Uint8Array; name: string };

export type SniffResult = { kind: 'project' } | { kind: 'backup' } | { kind: 'json'; value: unknown } | { kind: 'unknown'; why: string };

const MAX_RECORD = 64 * 1024 * 1024;

export async function runJob(req: JobRequest, smallLimits = false): Promise<unknown> {
  const noWorker = smallLimits;
  const zl: ZipLimits = noWorker ? ZIP_LIMITS_NO_WORKER : ZIP_LIMITS;
  const pl: ParseLimits = DEFAULT_PARSE_LIMITS;
  switch (req.op) {
    case 'packProject': return packProject(req.meta, req.content);
    case 'unpackProject': return unpackProject(req.bytes, zl, pl);
    case 'packBackup': return packBackup(req.items, req.appVersion, req.made);
    case 'unpackBackup': return unpackBackup(req.bytes, zl);
    case 'encode': {
      const out: EncodedRecord[] = [];
      for (const r of req.records) {
        const text = canonicalBytes(r.value);
        out.push({ key: r.key, sha256: await sha256Hex(text), bytes: await deflateRaw(text), size: text.length });
      }
      return out;
    }
    case 'decode': {
      const out: { key: string; value: unknown }[] = [];
      for (const r of req.records) {
        const cap = Math.min(r.size, noWorker ? zl.maxUnpacked : MAX_RECORD);
        if (r.size > cap) throw new Error('A stored record is bigger than allowed');
        const text = await inflateRaw(r.bytes, cap);
        if (await sha256Hex(text) !== r.key) throw new Error('A stored record is damaged');
        out.push({ key: r.key, value: safeParse(textOf(text), pl) });
      }
      return out;
    }
    case 'sniff': {
      if (req.bytes.length > zl.maxFile) return { kind: 'unknown', why: 'The file is too big.' } satisfies SniffResult;
      if (looksLikeProject(req.bytes)) return { kind: 'project' } satisfies SniffResult;
      if (looksLikeBackup(req.bytes)) return { kind: 'backup' } satisfies SniffResult;
      if (/\.json$/i.test(req.name)) {
        try { return { kind: 'json', value: safeParse(textOf(req.bytes), pl) } satisfies SniffResult; }
        catch { return { kind: 'unknown', why: 'It could not be read as a JSON file.' } satisfies SniffResult; }
      }
      return { kind: 'unknown', why: 'It is not a file the app knows.' } satisfies SniffResult;
    }
  }
}
