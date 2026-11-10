import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'tIME', 'eXIf']);
const WEBP_DROP = new Set(['EXIF', 'XMP ']);
const JPEG_DROP = new Set([0xe1, 0xed, 0xfe]);
function stripPng(b) {
  if (b.length < 8 || !b.subarray(0, 8).equals(PNG_SIG)) return null;
  const keep = [b.subarray(0, 8)]; const gone = [];
  let o = 8;
  while (o + 12 <= b.length) {
    const len = b.readUInt32BE(o); const type = b.toString('latin1', o + 4, o + 8); const end = o + 12 + len;
    if (end > b.length) return null;
    if (PNG_DROP.has(type)) gone.push(type); else keep.push(b.subarray(o, end));
    o = end;
    if (type === 'IEND') break;
  }
  if (o < b.length) keep.push(b.subarray(o));
  return gone.length ? { bytes: Buffer.concat(keep), gone } : null;
}

function stripWebp(b) {
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  const keep = []; const gone = [];
  let o = 12;
  while (o + 8 <= b.length) {
    const type = b.toString('latin1', o, o + 4); const len = b.readUInt32LE(o + 4); const end = o + 8 + len + (len & 1);
    if (end > b.length) return null;
    if (WEBP_DROP.has(type)) gone.push(type.trim()); else keep.push(Buffer.from(b.subarray(o, end)));
    o = end;
  }
  if (!gone.length) return null;
  for (const c of keep) if (c.toString('latin1', 0, 4) === 'VP8X') c[8] &= ~(0x08 | 0x04);
  const body = Buffer.concat(keep);
  const head = Buffer.alloc(12); head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(4 + body.length, 4); head.write('WEBP', 8, 'latin1');
  return { bytes: Buffer.concat([head, body]), gone };
}

function stripJpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const keep = [b.subarray(0, 2)]; const gone = [];
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null;
    const m = b[o + 1];
    if (m === 0xda || m === 0xd9) { keep.push(b.subarray(o)); o = b.length; break; }
    const len = b.readUInt16BE(o + 2); const end = o + 2 + len;
    if (end > b.length) return null;
    if (JPEG_DROP.has(m)) gone.push(m === 0xfe ? 'COM' : 'APP' + (m - 0xe0)); else keep.push(b.subarray(o, end));
    o = end;
  }
  return gone.length ? { bytes: Buffer.concat(keep), gone } : null;
}

const SVG_ATTRS = /\s(?:sodipodi:docname|inkscape:export-filename|inkscape:export-xdpi|inkscape:export-ydpi|inkscape:version|sodipodi:absref|xlink:title)="[^"]*"/g;
function stripSvg(b) {
  const t = b.toString('utf8');
  const gone = [];
  let s = t.replace(/<metadata[\s\S]*?<\/metadata>|<metadata[^>]*\/>/g, () => { gone.push('metadata'); return ''; });
  s = s.replace(/<!--[\s\S]*?-->/g, () => { gone.push('comment'); return ''; });
  s = s.replace(SVG_ATTRS, (m) => { gone.push(m.trim().split('=')[0]); return ''; });
  return gone.length ? { bytes: Buffer.from(s, 'utf8'), gone } : null;
}

const BY_EXT = { '.png': stripPng, '.webp': stripWebp, '.jpg': stripJpeg, '.jpeg': stripJpeg, '.svg': stripSvg };

function picturesIn(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  if (fs.statSync(dir).isFile()) { if (BY_EXT[path.extname(dir).toLowerCase()]) out.push(dir); return out; }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') picturesIn(p, out); }
    else if (BY_EXT[path.extname(e.name).toLowerCase()]) out.push(p);
  }
  return out;
}

export function stripFolders(folders, { check = false, quiet = false } = {}) {
  const found = [];
  let seen = 0;
  for (const dir of folders) for (const f of picturesIn(dir)) {
    seen++;
    const r = BY_EXT[path.extname(f).toLowerCase()](fs.readFileSync(f));
    if (!r) continue;
    found.push({ file: f, gone: r.gone });
    if (!check) fs.writeFileSync(f, r.bytes);
    if (!quiet) console.log(`stripMediaMeta: ${check ? 'carries' : 'took out of'} ${path.relative(process.cwd(), f)}: ${[...new Set(r.gone)].join(', ')}`);
  }
  if (!quiet) console.log(`stripMediaMeta: ${seen} pictures, ${found.length} ${check ? 'carry hidden data' : 'cleaned'}, the others untouched`);
  return found;
}

function selftest() {
  let fails = 0;
  const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fails++; };
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32BE(data.length, 0); h.write(type, 4, 'latin1'); return Buffer.concat([h, data, Buffer.alloc(4)]); };
  const ihdr = chunk('IHDR', Buffer.alloc(13, 1)); const idat = chunk('IDAT', Buffer.from('pixels')); const iend = chunk('IEND', Buffer.alloc(0));
  const srgb = chunk('sRGB', Buffer.from([0]));
  const png = Buffer.concat([PNG_SIG, ihdr, chunk('tEXt', Buffer.from('Author\0someone')), srgb, chunk('tIME', Buffer.alloc(7, 2)), idat, chunk('eXIf', Buffer.from('gps')), iend]);
  const p = stripPng(png);
  ok('PNG: text, date and camera data go', !!p && p.gone.join() === 'tEXt,tIME,eXIf');
  ok('PNG: the pixels and the colour chunk stay, in order', !!p && p.bytes.equals(Buffer.concat([PNG_SIG, ihdr, srgb, idat, iend])));
  ok('PNG: a clean picture is not touched', stripPng(Buffer.concat([PNG_SIG, ihdr, idat, iend])) === null);
  const wchunk = (type, data) => { const h = Buffer.alloc(8); h.write(type, 0, 'latin1'); h.writeUInt32LE(data.length, 4); return Buffer.concat([h, data, Buffer.alloc(data.length & 1)]); };
  const vp8x = wchunk('VP8X', Buffer.from([0x0c | 0x20, 0, 0, 0, 1, 0, 0, 1, 0, 0]));
  const vp8l = wchunk('VP8L', Buffer.from('lossless!')); const iccp = wchunk('ICCP', Buffer.from('srgb'));
  const body = Buffer.concat([vp8x, iccp, vp8l, wchunk('EXIF', Buffer.from('place')), wchunk('XMP ', Buffer.from('<x/>'))]);
  const riff = Buffer.alloc(12); riff.write('RIFF', 0, 'latin1'); riff.writeUInt32LE(4 + body.length, 4); riff.write('WEBP', 8, 'latin1');
  const w = stripWebp(Buffer.concat([riff, body]));
  ok('WebP: EXIF and XMP go, their flags are off, the ICC flag stays', !!w && w.gone.join() === 'EXIF,XMP' && (w.bytes[20] & 0x0c) === 0 && (w.bytes[20] & 0x20) === 0x20);
  ok('WebP: the size word matches the file', !!w && w.bytes.readUInt32LE(4) === w.bytes.length - 8);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xe1, 0, 5, 9, 9, 9, 0xff, 0xfe, 0, 3, 7, 0xff, 0xda, 0, 2, 5, 5, 0xff, 0xd9]);
  const j = stripJpeg(jpg);
  ok('JPEG: EXIF and the comment go, JFIF and the pixels stay', !!j && j.gone.join() === 'APP1,COM' && j.bytes.equals(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 5, 5, 0xff, 0xd9])));
  const s = stripSvg(Buffer.from('<svg sodipodi:docname="x/a.svg"><!-- made by someone --><metadata><rdf/></metadata><path d="M0 0"/></svg>'));
  ok('SVG: the file name, the comment and the metadata go, the drawing stays', !!s && s.bytes.toString() === '<svg><path d="M0 0"/></svg>');
  console.log(fails ? `stripMediaMeta selftest: ${fails} FAIL` : 'stripMediaMeta selftest: all PASS');
  return fails === 0;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const check = args.includes('--check');
  const folders = args.filter((a) => !a.startsWith('--'));
  if (!folders.length) { console.error('stripMediaMeta: name the folder(s) to clean, e.g. dist'); process.exit(2); }
  const found = stripFolders(folders, { check });
  if (check && found.length) process.exit(1);
}
