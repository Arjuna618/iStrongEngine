export type SourceKind = 'c' | 'd' | 'i' | 'b';

export interface SourceFile {
  path: string;
  name: string;
  dir: string;
  kind: SourceKind;
  lang: string;
  bytes: number;
  lines: number;
  chars: number;
  pack: number;
  offset: number;
  length: number;
  src: string;
}

export interface SourceFolder {
  path: string;
  name: string;
  folders: SourceFolder[];
  files: SourceFile[];
  fileCount: number;
  bytes: number;
  lines: number;
  chars: number;
}

export interface SourceProject {
  name: string;
  packs: string[];
  files: SourceFile[];
  root: SourceFolder;
  byPath: Map<string, SourceFile>;
  folders: Map<string, SourceFolder>;
  folderCount: number;
}

const BASE: string = (() => { try { return import.meta.env.BASE_URL || '/'; } catch { return '/'; } })();
export function urlOf(src: string): string { return BASE + src.split('/').map(encodeURIComponent).join('/'); }

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

function buildProject(index: { name?: string; packs?: string[]; files?: unknown[] }): SourceProject {
  const root: SourceFolder = { path: '', name: index.name || 'iStrongEngine', folders: [], files: [], fileCount: 0, bytes: 0, lines: 0, chars: 0 };
  const folders = new Map<string, SourceFolder>([['', root]]);
  const files: SourceFile[] = [];
  const byPath = new Map<string, SourceFile>();
  const folderOf = (dir: string): SourceFolder => {
    let f = folders.get(dir);
    if (f) return f;
    const cut = dir.lastIndexOf('/');
    const parent = folderOf(cut < 0 ? '' : dir.slice(0, cut));
    f = { path: dir, name: dir.slice(cut + 1), folders: [], files: [], fileCount: 0, bytes: 0, lines: 0, chars: 0 };
    parent.folders.push(f);
    folders.set(dir, f);
    return f;
  };
  for (const raw of index.files ?? []) {
    const r = raw as (string | number)[];
    const path = String(r[0]);
    const kind = r[1] as SourceKind;
    const cut = path.lastIndexOf('/');
    const dir = cut < 0 ? '' : path.slice(0, cut);
    const file: SourceFile = {
      path, name: path.slice(cut + 1), dir, kind, lang: String(r[2]),
      bytes: Number(r[3]) || 0, lines: Number(r[4]) || 0, chars: Number(r[5]) || 0,
      pack: kind === 'c' ? Number(r[6]) : -1, offset: kind === 'c' ? Number(r[7]) : 0, length: kind === 'c' ? Number(r[8]) : 0,
      src: kind === 'd' ? 'data/' + path.slice('Data/'.length) : kind === 'c' ? '' : String(r[6]),
    };
    files.push(file);
    byPath.set(path, file);
    folderOf(dir).files.push(file);
  }
  const total = (f: SourceFolder) => {
    f.folders.sort((a, b) => byName(a.name, b.name));
    f.files.sort((a, b) => byName(a.name, b.name));
    let n = f.files.length, bytes = 0, lines = 0, chars = 0;
    for (const x of f.files) { bytes += x.bytes; lines += x.lines; chars += x.chars; }
    for (const s of f.folders) { total(s); n += s.fileCount; bytes += s.bytes; lines += s.lines; chars += s.chars; }
    f.fileCount = n; f.bytes = bytes; f.lines = lines; f.chars = chars;
  };
  total(root);
  return { name: root.name, packs: index.packs ?? [], files, root, byPath, folders, folderCount: folders.size - 1 };
}

let projectLoad: Promise<SourceProject> | null = null;
export function loadSourceProject(): Promise<SourceProject> {
  if (!projectLoad) {
    projectLoad = fetch(BASE + 'source-code/index.json', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('no source index'); return r.json(); })
      .then(buildProject);
    projectLoad.catch(() => { projectLoad = null; });
  }
  return projectLoad;
}

const packs = new Map<number, Promise<string>>();
function loadPack(project: SourceProject, i: number): Promise<string> {
  let p = packs.get(i);
  if (!p) {
    p = fetch(BASE + project.packs[i]).then(r => { if (!r.ok) throw new Error('pack'); return r.text(); });
    p.catch(() => packs.delete(i));
    packs.set(i, p);
  }
  return p;
}

const dataTexts = new Map<string, Promise<string>>();
export function loadFileText(project: SourceProject, file: SourceFile): Promise<string> {
  if (file.kind === 'c') return loadPack(project, file.pack).then(t => t.slice(file.offset, file.offset + file.length));
  let p = dataTexts.get(file.path);
  if (!p) {
    p = fetch(urlOf(file.src)).then(r => { if (!r.ok) throw new Error('file'); return r.text(); });
    p.catch(() => dataTexts.delete(file.path));
    dataTexts.set(file.path, p);
  }
  return p;
}

export interface SearchText { text: string[]; lower: string[] }
let searchText: Promise<SearchText> | null = null;
export function loadSearchText(project: SourceProject): Promise<SearchText> {
  if (!searchText) {
    searchText = Promise.all(project.packs.map((_, i) => loadPack(project, i))).then(text => ({ text, lower: text.map(t => t.toLowerCase()) }));
    searchText.catch(() => { searchText = null; });
  }
  return searchText;
}
export function baseHref(): string { return new URL(BASE, location.href).href; }

export interface TreeRow { key: string; depth: number; folder?: SourceFolder; file?: SourceFile }

export function visibleRows(root: SourceFolder, open: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (f: SourceFolder, depth: number) => {
    for (const s of f.folders) {
      rows.push({ key: 'd:' + s.path, depth, folder: s });
      if (open.has(s.path)) walk(s, depth + 1);
    }
    for (const x of f.files) rows.push({ key: 'f:' + x.path, depth, file: x });
  };
  walk(root, 0);
  return rows;
}

export function foldersOf(path: string): string[] {
  const out: string[] = [];
  let at = path.indexOf('/');
  while (at > 0) { out.push(path.slice(0, at)); at = path.indexOf('/', at + 1); }
  return out;
}

export interface SearchLine { n: number; col: number; s: number; e: number }
export interface SearchHit { file: SourceFile; named: boolean; count: number; lines: SearchLine[] }
export interface SearchResult { hits: SearchHit[]; files: number; matches: number; capped: boolean }

const MAX_FILES = 200;
const MAX_LINES = 3;
const MAX_COUNT = 999;

const packFiles = new WeakMap<SourceProject, SourceFile[][]>();
function filesByPack(project: SourceProject): SourceFile[][] {
  let list = packFiles.get(project);
  if (!list) {
    list = project.packs.map(() => [] as SourceFile[]);
    for (const f of project.files) if (f.kind === 'c' && list[f.pack]) list[f.pack].push(f);
    for (const l of list) l.sort((a, b) => a.offset - b.offset);
    packFiles.set(project, list);
  }
  return list;
}

export function searchProject(project: SourceProject, lower: string[] | null, query: string): SearchResult {
  const q = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  let matches = 0;
  if (!q) return { hits, files: 0, matches: 0, capped: false };
  const found = new Map<SourceFile, { count: number; lines: SearchLine[] }>();
  if (lower) {
    const byPack = filesByPack(project);
    for (let p = 0; p < lower.length; p++) {
      const hay = lower[p];
      const files = byPack[p] ?? [];
      let fi = 0, from = 0;
      let lineFile: SourceFile | null = null, line = 1, scanned = 0;
      for (;;) {
        const at = hay.indexOf(q, from);
        if (at < 0) break;
        from = at + q.length;
        while (fi < files.length && files[fi].offset + files[fi].length <= at) fi++;
        if (fi >= files.length) break;
        const f = files[fi];
        const end = f.offset + f.length;
        if (at < f.offset || at + q.length > end) continue;
        let e = found.get(f);
        if (!e) found.set(f, (e = { count: 0, lines: [] }));
        if (e.count >= MAX_COUNT) continue;
        e.count++;
        if (e.lines.length >= MAX_LINES) continue;
        if (lineFile !== f) { lineFile = f; line = 1; scanned = f.offset; }
        for (let i = scanned; i < at; i++) if (hay.charCodeAt(i) === 10) line++;
        scanned = at;
        const s = Math.max(hay.lastIndexOf('\n', at - 1) + 1, f.offset);
        let le = hay.indexOf('\n', at);
        if (le < 0 || le > end) le = end;
        e.lines.push({ n: line, col: at - s, s, e: le });
      }
    }
  }
  for (const file of project.files) {
    const named = file.path.toLowerCase().includes(q);
    const e = found.get(file);
    if (!named && !e) continue;
    const count = e ? e.count : 0;
    matches += count;
    hits.push({ file, named, count, lines: e ? e.lines : [] });
  }
  hits.sort((a, b) => (a.named === b.named ? b.count - a.count || byName(a.file.path, b.file.path) : a.named ? -1 : 1));
  const capped = hits.length > MAX_FILES;
  return { hits: capped ? hits.slice(0, MAX_FILES) : hits, files: hits.length, matches, capped };
}

export function lineTextOf(packText: string, line: SearchLine): { text: string; col: number } {
  const raw = packText.slice(line.s, line.e).replace(/\r$/, '');
  const lead = raw.length - raw.trimStart().length;
  let text = raw.trim();
  let col = Math.max(0, line.col - lead);
  if (col > 40) { text = '...' + text.slice(col - 30); col = 33; }
  return { text: text.slice(0, 200), col };
}

const LANG_NAMES: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript JSX', js: 'JavaScript', json: 'JSON', css: 'CSS', html: 'HTML', md: 'Markdown', text: 'Text',
};
export function kindName(f: SourceFile): string {
  if (f.kind === 'i') return f.lang.toUpperCase() + ' picture';
  if (f.kind === 'b') return f.lang ? f.lang.toUpperCase() + ' file' : 'File';
  const ext = f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'svg') return 'SVG';
  return LANG_NAMES[f.lang] ?? 'Text';
}

export function groupOf(f: SourceFile): string {
  if (f.kind === 'd') return 'Game data';
  if (f.kind === 'i') return 'Pictures';
  if (f.kind === 'b') return 'Other files';
  return LANG_NAMES[f.lang] ?? 'Text';
}

const NUM = new Intl.NumberFormat('en-US');
export function fmtCount(n: number): string { return NUM.format(n); }
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
export function fmtShort(n: number): string {
  if (n < 10_000) return NUM.format(n);
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}
