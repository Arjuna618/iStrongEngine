interface ZipFile { path: string; kind: 'c' | 'd' | 'i' | 'b'; src: string; pack: number; offset: number; length: number }
interface Job { base: string; name: string; packs: string[]; files: ZipFile[] }

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const canDeflate = typeof CompressionStream !== 'undefined';
async function deflate(b: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([b]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const url = (base: string, src: string) => base + src.split('/').map(encodeURIComponent).join('/');
async function fetchBytes(u: string): Promise<Uint8Array> {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return new Uint8Array(await r.arrayBuffer());
}

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const job = e.data;
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  try {
    const enc = new TextEncoder();
    const packs: (string | null)[] = job.packs.map(() => null);
    const packOf = async (i: number) => {
      if (packs[i] === null) { const r = await fetch(job.base + job.packs[i]); if (!r.ok) throw new Error('pack'); packs[i] = await r.text(); }
      return packs[i] as string;
    };
    const bytesOf = async (f: ZipFile): Promise<Uint8Array> => {
      if (f.kind === 'c') { const t = await packOf(f.pack); return enc.encode(t.slice(f.offset, f.offset + f.length)); }
      return fetchBytes(url(job.base, f.src));
    };

    const { time, date } = dosTime(new Date());
    const parts: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    const total = job.files.length;
    const ahead: Promise<Uint8Array>[] = [];
    const AHEAD = 12;
    for (let i = 0; i < Math.min(AHEAD, total); i++) ahead.push(bytesOf(job.files[i]));
    let lastTold = 0;
    for (let i = 0; i < total; i++) {
      const f = job.files[i];
      const data = await ahead[i];
      if (i + AHEAD < total) ahead.push(bytesOf(job.files[i + AHEAD]));
      (ahead as (Promise<Uint8Array> | undefined)[])[i] = undefined;
      const crc = crc32(data);
      const store = !canDeflate || f.kind === 'i' || data.length < 64;
      const body = store ? data : await deflate(data);
      const method = store ? 0 : 8;
      const name = enc.encode(job.name + '/' + f.path);

      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true);
      lv.setUint16(10, time, true); lv.setUint16(12, date, true); lv.setUint32(14, crc, true);
      lv.setUint32(18, body.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
      local.set(name, 30);

      const cen = new Uint8Array(46 + name.length);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, method, true); cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, body.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cen.set(name, 46);

      parts.push(local, body);
      central.push(cen);
      offset += local.length + body.length;
      const now = Date.now();
      if (now - lastTold > 100 || i === total - 1) { post({ type: 'progress', done: i + 1, total }); lastTold = now; }
    }
    let cenSize = 0;
    for (const c of central) cenSize += c.length;
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, total, true); ev.setUint16(10, total, true);
    ev.setUint32(12, cenSize, true); ev.setUint32(16, offset, true);
    const blob = new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/zip' });
    post({ type: 'done', blob });
  } catch (err) {
    post({ type: 'error', message: String((err as Error)?.message ?? err) });
  }
};
