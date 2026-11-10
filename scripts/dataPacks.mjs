import crypto from 'crypto';

export const PACK_FORMAT = 1;

export const PACK_COUNT = 32;

export const PACK_MAX_BYTES = 20 * 1024 * 1024;

export const PACK_DIR = 'data-packs';
export const PACK_LIST_NAME = 'data-packs.json';

export const PACK_NAME_RE = /^p\d{2,}\.[0-9a-f]{16}\.json$/;

const STRING_OR_SPACE = /("(?:[^"\\]|\\[^])*")|[ \t\n\r]+/g;

export function stripJsonWhitespace(text) {
  return text.replace(STRING_OR_SPACE, '$1');
}

export function bucketOf(filePath, count = PACK_COUNT) {
  const bytes = Buffer.from(filePath, 'utf8');
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  return (h >>> 0) % count;
}

function byPath(a, b) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export function buildPacks(files, count = PACK_COUNT) {
  const seen = new Set();
  const buckets = new Map();
  for (const f of files) {
    if (seen.has(f.path)) throw new Error(`[data-packs] the path ${f.path} is listed twice`);
    seen.add(f.path);
    const b = bucketOf(f.path, count);
    let list = buckets.get(b);
    if (!list) buckets.set(b, (list = []));
    list.push(f);
  }

  const width = Math.max(2, String(count - 1).length);
  const packs = [];
  for (const bucket of [...buckets.keys()].sort((a, b) => a - b)) {
    const members = buckets.get(bucket).slice().sort(byPath);
    const records = members.map((f) => `{"path":${JSON.stringify(f.path)},"file":${stripJsonWhitespace(f.text)}}`);
    const text = `{"format":${PACK_FORMAT},"files":[\n${records.join(',\n')}\n]}\n`;
    const bytes = Buffer.byteLength(text, 'utf8');
    const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
    const name = `p${String(bucket).padStart(width, '0')}.${hash}.json`;
    packs.push({ name, file: `${PACK_DIR}/${name}`, bucket, files: members.length, bytes, text });
  }

  const list = {
    format: PACK_FORMAT,
    count: files.length,
    packs: packs.map((p) => ({ file: p.file, files: p.files, bytes: p.bytes })),
    order: files.map((f) => f.path),
  };
  return { packs, list };
}

export function packListText(list) {
  return JSON.stringify(list) + '\n';
}
