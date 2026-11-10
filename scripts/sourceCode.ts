import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { listGameFiles } from './gameFiles.ts';

export const SOURCE_DIR = 'source-code';
export const SOURCE_INDEX_FORMAT = 1;
const PACK_CHARS = 1_500_000;

const LANG_BY_EXT: Record<string, string> = {
  ts: 'ts', mts: 'ts', cts: 'ts', tsx: 'tsx', js: 'js', mjs: 'js', cjs: 'js', jsx: 'tsx', json: 'json',
  css: 'css', html: 'html', htm: 'html', svg: 'html', xml: 'html', md: 'md', txt: 'text', toml: 'text', yml: 'text',
  yaml: 'text', csv: 'text', glsl: 'text', vert: 'text', frag: 'text', wgsl: 'text',
};
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'avif', 'bmp']);

export type SourceRow =
  | [string, 'c', string, number, number, number, number, number, number]
  | [string, 'd', string, number, number, number]
  | [string, 'i' | 'b', string, number, number, number, string];

export interface SourceIndex { format: number; name: string; packs: string[]; files: SourceRow[] }

function extOf(p: string): string {
  const base = p.slice(p.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function looksLikeText(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  return !buf.subarray(0, n).toString('utf8').includes('�');
}

function countText(text: string): { lines: number; chars: number } {
  let breaks = 0, low = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) breaks++;
    else if (c >= 0xdc00 && c <= 0xdfff) low++;
  }
  const lines = text.length === 0 ? 0 : breaks + (text.charCodeAt(text.length - 1) === 10 ? 0 : 1);
  return { lines, chars: text.length - low };
}

const hash16 = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);

export interface SourceAsset { fileName: string; source: string | Buffer }

export function buildSourceCode(root: string): SourceAsset[] {
  const assets: SourceAsset[] = [];
  const rows: SourceRow[] = [];
  const packs: string[] = [];
  let pack: string[] = [];
  let packLen = 0;
  const closePack = () => {
    if (!pack.length) return;
    const text = pack.join('');
    const name = `${SOURCE_DIR}/s${String(packs.length).padStart(2, '0')}.${hash16(text)}.txt`;
    packs.push(name);
    assets.push({ fileName: name, source: text });
    pack = [];
    packLen = 0;
  };

  for (const f of listGameFiles(root, fs, path)) {
    const ext = extOf(f.path);
    const buf = fs.readFileSync(f.abs);
    if (IMAGE_EXT.has(ext) || (!(ext in LANG_BY_EXT) && !looksLikeText(buf))) {
      const src = f.path.startsWith('public/')
        ? f.path.slice('public/'.length)
        : `${SOURCE_DIR}/media/${hash16(buf)}${ext ? '.' + ext : ''}`;
      if (!f.path.startsWith('public/')) assets.push({ fileName: src, source: buf });
      rows.push([f.path, IMAGE_EXT.has(ext) ? 'i' : 'b', ext, buf.length, 0, 0, src]);
      continue;
    }
    const text = buf.toString('utf8');
    const { lines, chars } = countText(text);
    const lang = LANG_BY_EXT[ext] ?? 'text';
    if (f.path.startsWith('Data/') && ext === 'json') {
      rows.push([f.path, 'd', lang, buf.length, lines, chars]);
      continue;
    }
    if (packLen > 0 && packLen + text.length > PACK_CHARS) closePack();
    const row: SourceRow = [f.path, 'c', lang, buf.length, lines, chars, packs.length, packLen, text.length];
    rows.push(row);
    pack.push(text);
    packLen += text.length;
  }
  closePack();

  const index: SourceIndex = { format: SOURCE_INDEX_FORMAT, name: 'iStrongEngine', packs, files: rows };
  assets.push({ fileName: `${SOURCE_DIR}/index.json`, source: JSON.stringify(index) });
  return assets;
}
