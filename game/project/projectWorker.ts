import { runJob, type JobRequest } from './workerOps';

interface Msg { id: number; req: JobRequest }

function transfers(v: unknown, out: ArrayBuffer[]): void {
  if (v instanceof Uint8Array) { if (v.byteOffset === 0 && v.byteLength === v.buffer.byteLength && v.buffer instanceof ArrayBuffer) out.push(v.buffer); return; }
  if (Array.isArray(v)) { for (const x of v) transfers(x, out); return; }
  if (v instanceof Map) { for (const x of v.values()) transfers(x, out); return; }
  if (v && typeof v === 'object') for (const x of Object.values(v)) transfers(x, out);
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const { id, req } = e.data;
  try {
    const result = await runJob(req);
    const t: ArrayBuffer[] = [];
    transfers(result, t);
    (self as unknown as Worker).postMessage({ id, ok: true, result }, t);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err), name: err instanceof Error ? err.constructor.name : 'Error' });
  }
};
