import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Modal } from '../kit/Modal';
import { PageSwap, SwapInPlace, SwapText, Reveal, Fade } from '../kit/Collapse';
import { VirtualList, scrollVirtualRowIntoView } from '../kit/VirtualList';
import { Button, IconButton, SearchEnd, EmptyState, emptyArt } from '../kit/kit';
import { useEscapeOwner } from '../shared/escapeStack';
import { useModalMaxHeight, useModalMaxWidth } from '../../utils/useMenuScale';
import { isPhoneUi, isTouchScreen } from '../../utils/device';
import { toast } from '../ui/Toast';
import {
  SourceCode, Github, FileScript, FilePlain, FileJson, Folder, FolderOpen, Image, ChevronDown, Search, Copy, Check, Download,
  ArrowUp, ArrowDown, X, Overview, PanelLeft,
} from '../ui/icons';
import { CodeView } from './CodeView';
import {
  loadSourceProject, loadFileText, loadSearchText, searchProject, lineTextOf, visibleRows, foldersOf, urlOf, baseHref,
  kindName, groupOf, fmtCount, fmtBytes, fmtShort,
  type SourceProject, type SourceFile, type SourceFolder, type SearchText, type SearchHit,
} from './sourceIndex';

type Page = { kind: 'overview' } | { kind: 'file'; path: string; find: string; line: number | null; seq: number };
const kept: { open: Set<string>; page: Page; query: string } = { open: new Set(), page: { kind: 'overview' }, query: '' };
let pageSeq = 0;

interface ZipState { busy: boolean; done: number; total: number }
let zipState: ZipState = { busy: false, done: 0, total: 0 };
const zipSubs = new Set<() => void>();
const setZip = (z: ZipState) => { zipState = z; zipSubs.forEach(f => f()); };
const zipSubscribe = (f: () => void) => { zipSubs.add(f); return () => { zipSubs.delete(f); }; };
const zipGet = () => zipState;

function saveBlob(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

function startZip(project: SourceProject): void {
  if (zipState.busy) return;
  let w: Worker;
  try { w = new Worker(new URL('./zipWorker.ts', import.meta.url), { type: 'module' }); }
  catch { toast('error', 'This browser cannot make the zip'); return; }
  const files = project.files.map(f => ({ path: f.path, kind: f.kind, src: f.src, pack: f.pack, offset: f.offset, length: f.length }));
  setZip({ busy: true, done: 0, total: files.length });
  const end = () => { w.terminate(); setZip({ busy: false, done: 0, total: 0 }); };
  w.onmessage = (e: MessageEvent<{ type: string; done?: number; total?: number; blob?: Blob }>) => {
    const m = e.data;
    if (m.type === 'progress') setZip({ busy: true, done: m.done ?? 0, total: m.total ?? files.length });
    else if (m.type === 'done' && m.blob) { end(); saveBlob(m.blob, `${project.name}.zip`); toast('success', `${project.name}.zip is ready`); }
    else { end(); toast('error', 'The zip could not be made. Try again.'); }
  };
  w.onerror = () => { end(); toast('error', 'The zip could not be made. Try again.'); };
  w.postMessage({ base: baseHref(), name: project.name, packs: project.packs, files });
}

function iconOf(f: SourceFile, size = 14): React.ReactNode {
  if (f.kind === 'i') return <Image size={size} />;
  if (f.kind === 'b') return <FilePlain size={size} />;
  if (f.lang === 'json') return <FileJson size={size} />;
  if (f.lang === 'text' || f.lang === 'md') return <FilePlain size={size} />;
  return <FileScript size={size} />;
}

function Marked({ text, col, len }: { text: string; col: number; len: number }) {
  if (col < 0 || col >= text.length) return <>{text}</>;
  return <>{text.slice(0, col)}<mark className="k-sc-found">{text.slice(col, col + len)}</mark>{text.slice(col + len)}</>;
}

const TREE_ROW = 30;
const TREE_ROW_TOUCH = 40;
const RESULT_FILE_ROW_TOUCH = 56;
const RESULT_LINE_ROW_TOUCH = 34;
const SC_NARROW_BELOW = 720;
const SWIPE_SHARE = 0.3;
const SWIPE_SPEED = 0.45;
const FOLDER = <Folder size={14} />;
const FOLDER_OPEN = <FolderOpen size={14} />;
const ICON_COPY = <Copy size={16} />;
const ICON_ZIP = <Download size={18} />;

function ZipRing({ part }: { part: number }) {
  const r = 7, len = 2 * Math.PI * r;
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden>
      <circle cx={9} cy={9} r={r} fill="none" strokeWidth={2} className="k-sc-ring-track" />
      <circle cx={9} cy={9} r={r} fill="none" strokeWidth={2} strokeLinecap="round" className="k-sc-ring-fill"
        strokeDasharray={len} strokeDashoffset={len * (1 - Math.min(1, Math.max(0.03, part)))} transform="rotate(-90 9 9)" />
    </svg>
  );
}
const ICON_COPIED = <Check size={16} />;
const RESULT_FILE_ROW = 48;
const RESULT_LINE_ROW = 26;

export default function SourceCodeWindow({ onClose }: { onClose: () => void }) {
  const touch = isTouchScreen();
  const phone = isPhoneUi();
  const maxH = useModalMaxHeight(phone ? 0 : undefined);
  const maxW = useModalMaxWidth(phone ? 0 : undefined);
  const narrow = touch && Math.min(1260, maxW) < SC_NARROW_BELOW;
  const bodyH = Math.max(420, Math.min(780, maxH - 58));
  const [project, setProject] = useState<SourceProject | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadSourceProject().then(p => { if (alive) setProject(p); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  const zip = useSyncExternalStore(zipSubscribe, zipGet);
  const pct = zip.total ? Math.round((zip.done / zip.total) * 100) : 0;

  const zipIcon = zip.busy ? <ZipRing part={zip.done / Math.max(1, zip.total)} /> : ICON_ZIP;
  const tools = (
    <div className="flex items-center gap-1">
      <IconButton label="GitHub" onClick={() => window.open('https://github.com/Arjuna618/iStrongEngine', '_blank', 'noopener,noreferrer')}><Github size={18} /></IconButton>
      <IconButton label={zip.busy ? `Packing the zip, ${pct}%` : 'Download every file in one zip'} disabled={!project}
        aria-busy={zip.busy || undefined} onClick={() => project && startZip(project)}>
        <SwapInPlace swapKey={zip.busy} hold={false} className="grid place-items-center">{zipIcon}</SwapInPlace>
      </IconButton>
    </div>
  );

  const stateKey = failed ? 'failed' : project ? 'ready' : 'wait';
  let stateBody: React.ReactNode = <WaitShape narrow={narrow} />;
  if (failed) stateBody = <div className="flex-1 grid place-items-center"><EmptyState icon={emptyArt(SourceCode)} title="The source code is not in this build" hint="It is made when the game is built." words /></div>;
  else if (project) stateBody = <SourceBody project={project} touch={touch} narrow={narrow} />;

  return (
    <Modal title="Source Code" icon={<SourceCode size={18} />} width={1260} onClose={onClose} fit phoneFull
      bodyClassName="k-modal-body-flush" waitHeight={phone ? Math.max(200, maxH - 58) : bodyH} surface="content" headerRight={tools}>
      <div className="flex min-h-0" style={{ height: phone ? '100%' : bodyH }}>
        <SwapInPlace swapKey={stateKey} hold={false} className="flex flex-1 min-w-0 min-h-0">{stateBody}</SwapInPlace>
      </div>
    </Modal>
  );
}

function WaitShape({ narrow }: { narrow: boolean }) {
  const side = narrow ? null : (
    <div className="k-rd-side k-sc-side">
      <div className="k-rd-search"><div className="skeleton-shimmer h-9 rounded-lg" /></div>
      <div className="px-3 flex flex-col gap-2 pt-1">
        {Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton-shimmer h-5 rounded" style={{ width: `${55 + ((i * 37) % 40)}%` }} />)}
      </div>
    </div>
  );
  return (
    <div className="k-skel-delay flex flex-1 min-h-0" aria-hidden>
      {side}
      <div className={`flex-1 flex flex-col gap-4 ${narrow ? 'p-4' : 'p-7'}`}>
        <div className="skeleton-shimmer h-6 w-56 rounded" />
        <div className={`grid gap-3 ${narrow ? 'grid-cols-2' : 'grid-cols-4'}`}>{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton-shimmer h-24 rounded-xl" />)}</div>
        <div className="skeleton-shimmer h-64 rounded-xl" />
      </div>
    </div>
  );
}

function SourceBody({ project, touch, narrow }: { project: SourceProject; touch: boolean; narrow: boolean }) {
  const treeRow = touch ? TREE_ROW_TOUCH : TREE_ROW;
  const fileRow = touch ? RESULT_FILE_ROW_TOUCH : RESULT_FILE_ROW;
  const lineRow = touch ? RESULT_LINE_ROW_TOUCH : RESULT_LINE_ROW;
  const [filesOpen, setFilesOpen] = useState(false);
  const drawerOn = narrow && filesOpen;
  useEscapeOwner(() => setFilesOpen(false), drawerOn);
  const [open, setOpen] = useState<Set<string>>(() => new Set(kept.open));
  const [page, setPage] = useState<Page>(() => (kept.page.kind === 'file' && !project.byPath.has(kept.page.path) ? { kind: 'overview' } : kept.page));
  const [query, setQuery] = useState(kept.query);
  useEffect(() => { kept.open = open; }, [open]);
  useEffect(() => { kept.page = page.kind === 'file' ? { ...page, line: null } : page; }, [page]);
  useEffect(() => { kept.query = query; }, [query]);

  const searchRef = useRef<HTMLInputElement>(null);
  const treeBox = useRef<HTMLDivElement | null>(null);
  const listHost = useRef<HTMLDivElement>(null);
  const [listH, setListH] = useState(480);
  useLayoutEffect(() => {
    const el = listHost.current;
    if (!el) return;
    const read = () => { const h = el.clientHeight; if (h > 0) setListH(prev => (Math.abs(prev - h) > 1 ? h : prev)); };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault(); e.stopPropagation();
        searchRef.current?.focus(); searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  useEscapeOwner(() => setQuery(''), query !== '');

  const rows = useMemo(() => visibleRows(project.root, open), [project, open]);
  const toggle = useCallback((path: string) => {
    setOpen(prev => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  }, []);
  const [revealAsk, setRevealAsk] = useState<{ path: string; seq: number } | null>(null);
  const openFile = useCallback((path: string, find = '', line: number | null = null, reveal = false) => {
    setPage({ kind: 'file', path, find, line, seq: ++pageSeq });
    setFilesOpen(false);
    if (reveal) {
      setOpen(prev => { const next = new Set(prev); for (const d of foldersOf(path)) next.add(d); return next; });
      setRevealAsk({ path, seq: pageSeq });
    }
  }, []);
  useEffect(() => {
    if (!revealAsk || query) return;
    const at = rows.findIndex(r => r.file?.path === revealAsk.path);
    if (at >= 0) window.requestAnimationFrame(() => scrollVirtualRowIntoView(treeBox.current, at * treeRow, treeRow));
  }, [revealAsk, rows, query, treeRow]);

  const navRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: number; x0: number; y0: number; on: boolean; dx: number; w: number; z: number; lastX: number; lastT: number; v: number } | null>(null);
  const swiped = useRef(false);
  const onSwipeDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!drawerOn || e.pointerType === 'mouse' || swipe.current) return;
    swipe.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, dx: 0, w: 0, z: 1, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
    swiped.current = false;
  };
  const onSwipeMove = (e: React.PointerEvent<HTMLElement>) => {
    const s = swipe.current, nav = navRef.current;
    if (!s || e.pointerId !== s.id || !nav) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { swipe.current = null; return; }
      if (dx > -10 || Math.abs(dx) < Math.abs(dy)) return;
      s.on = true; swiped.current = true;
      s.w = nav.getBoundingClientRect().width;
      s.z = nav.offsetWidth > 0 ? s.w / nav.offsetWidth : 1;
      try { nav.setPointerCapture(e.pointerId); } catch { }
      nav.style.transition = 'none';
      if (scrimRef.current) scrimRef.current.style.transition = 'none';
    }
    s.dx = Math.min(0, dx);
    const dt = e.timeStamp - s.lastT;
    if (dt > 0) { s.v = (e.clientX - s.lastX) / dt; s.lastX = e.clientX; s.lastT = e.timeStamp; }
    nav.style.transform = `translateX(${s.dx / s.z}px)`;
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, 1 + s.dx / Math.max(1, s.w)));
  };
  const onSwipeUp = (e: React.PointerEvent<HTMLElement>) => {
    const s = swipe.current, nav = navRef.current;
    if (!s || e.pointerId !== s.id) return;
    swipe.current = null;
    if (!s.on || !nav) return;
    nav.style.transition = ''; nav.style.transform = '';
    if (scrimRef.current) { scrimRef.current.style.transition = ''; scrimRef.current.style.opacity = ''; }
    if (s.dx < -s.w * SWIPE_SHARE || (s.dx < -24 && s.v < -SWIPE_SPEED)) setFilesOpen(false);
  };
  const onSwipeClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault(); e.stopPropagation();
  };
  useEffect(() => {
    if (drawerOn) return;
    swipe.current = null;
    const nav = navRef.current;
    if (nav && nav.style.transform) { nav.style.transition = ''; nav.style.transform = ''; }
  }, [drawerOn]);
  const filesBar = narrow ? (
    <div className="k-sc-bar">
      <Button variant="primary" size="lg" className="k-sc-files-btn" icon={<PanelLeft size={20} />} aria-expanded={filesOpen} aria-controls="k-sc-files"
        onClick={() => setFilesOpen(true)}>Browse Files</Button>
      <span className="k-badge k-sc-bar-count">{fmtCount(project.root.fileCount)} files</span>
    </div>
  ) : null;

  const shownPath = page.kind === 'file' ? page.path : null;
  const renderTreeRow = (i: number) => {
    const r = rows[i];
    const guides = r.depth > 0 ? <span className="k-sc-guides" style={{ width: r.depth * 14 }} aria-hidden /> : null;
    if (r.folder) {
      const f: SourceFolder = r.folder;
      const isOpen = open.has(f.path);
      return (
        <div className="k-sc-node-wrap">
          {guides}
          <button type="button" className="k-rd-item k-rd-item-sm k-sc-node" style={{ paddingLeft: 6 + r.depth * 14 }}
            onClick={() => toggle(f.path)} aria-expanded={isOpen}>
            <ChevronDown size={12} className={`k-chevron shrink-0 ${isOpen ? 'k-chevron-open' : ''}`} />
            <SwapInPlace swapKey={isOpen} hold={false} className="k-rd-item-icon">{isOpen ? FOLDER_OPEN : FOLDER}</SwapInPlace>
            <span className="k-rd-item-text truncate">{f.name}</span>
            <span className="k-rd-item-meta">{fmtCount(f.fileCount)}</span>
          </button>
        </div>
      );
    }
    const file = r.file as SourceFile;
    return (
      <div className="k-sc-node-wrap">
        {guides}
        <button type="button" className={`k-rd-item k-rd-item-sm k-sc-node${file.path === shownPath ? ' k-rd-item-on' : ''}`}
          style={{ paddingLeft: 26 + r.depth * 14 }} onClick={() => openFile(file.path)} title={file.path}>
          <span className="k-rd-item-icon k-sc-file-icon">{iconOf(file)}</span>
          <span className="k-rd-item-text truncate">{file.name}</span>
        </button>
      </div>
    );
  };

  const searching = query.trim() !== '';
  const deferred = useDeferredValue(query);
  const [text, setText] = useState<SearchText | null>(null);
  useEffect(() => {
    if (!searching || text) return;
    let alive = true;
    loadSearchText(project).then(t => { if (alive) setText(t); }).catch(() => {});
    return () => { alive = false; };
  }, [searching, text, project]);
  const result = useMemo(() => (deferred.trim() ? searchProject(project, text ? text.lower : null, deferred) : null), [project, text, deferred]);
  type Item = { key: string; h: number; hit: SearchHit; line?: number };
  const items = useMemo(() => {
    const out: Item[] = [];
    if (!result) return out;
    for (const hit of result.hits) {
      out.push({ key: 'r:' + hit.file.path, h: fileRow, hit });
      for (let k = 0; k < hit.lines.length; k++) out.push({ key: `l:${hit.file.path}:${hit.lines[k].n}:${k}`, h: lineRow, hit, line: k });
    }
    return out;
  }, [result, fileRow, lineRow]);
  const q = deferred.trim();
  const renderItem = (i: number) => {
    const it = items[i];
    const f = it.hit.file;
    if (it.line === undefined) {
      return (
        <button type="button" className={`k-rd-item k-sc-result${f.path === shownPath ? ' k-rd-item-on' : ''}`}
          onClick={() => openFile(f.path, it.hit.count ? q : '', it.hit.lines[0]?.n ?? null, true)}>
          <span className="k-rd-item-icon k-sc-file-icon">{iconOf(f)}</span>
          <span className="min-w-0 flex-1 flex flex-col">
            <span className="truncate text-[var(--text-primary)]">{f.name}</span>
            <span className="truncate k-sc-result-path">{f.dir || project.name}</span>
          </span>
          <Fade when={it.hit.count > 0}>{() => <span className="k-badge k-sc-count">{it.hit.count >= 999 ? '999+' : fmtCount(it.hit.count)}</span>}</Fade>
        </button>
      );
    }
    const line = it.hit.lines[it.line];
    const shown = text ? lineTextOf(text.text[f.pack], line) : { text: '', col: -1 };
    return (
      <button type="button" className="k-sc-result-line" onClick={() => openFile(f.path, q, line.n, true)}>
        <span className="k-sc-result-ln">{line.n}</span>
        <span className="k-sc-result-text truncate"><Marked text={shown.text} col={shown.col} len={q.length} /></span>
      </button>
    );
  };

  const note = !result ? '' : !text
    ? 'Searching every file...'
    : result.files === 0 ? 'Nothing matched. Try a shorter word.'
    : `${fmtCount(result.matches)} match${result.matches === 1 ? '' : 'es'} in ${fmtCount(result.files)} file${result.files === 1 ? '' : 's'}${result.capped ? ', the first 200 shown' : ''}`;

  const treeList = (
    <VirtualList count={rows.length} rowHeight={treeRow} maxHeight={listH} overscan={400} boxRef={treeBox}
      rowKey={i => rows[i].key} renderRow={renderTreeRow} className="k-sc-vl" />
  );
  const resultsList = (
    <div className="h-full flex flex-col">
      <div className="k-rd-note k-sc-note"><SwapText>{note}</SwapText></div>
      <VirtualList count={items.length} rowHeight={i => items[i].h} maxHeight={Math.max(120, listH - 34)} overscan={300}
        rowKey={i => items[i].key} renderRow={renderItem} className="k-sc-vl" />
    </div>
  );
  const shownFile = page.kind === 'file' ? project.byPath.get(page.path) : undefined;
  let pageEl = (
    <div key="overview" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      <OverviewPage project={project} onOpen={path => openFile(path, '', null, true)} />
    </div>
  );
  if (page.kind === 'file' && shownFile) {
    pageEl = (
      <div key={'f:' + page.path} className="flex-1 min-h-0 flex flex-col">
        <FilePage project={project} file={shownFile} find={page.find} line={page.line} seq={page.seq} />
      </div>
    );
  }

  const scrim = narrow
    ? <div ref={scrimRef} className={`k-sc-scrim${drawerOn ? ' k-sc-scrim-on' : ''}`} onClick={() => setFilesOpen(false)} aria-hidden />
    : null;
  const drawerHead = narrow ? (
    <div className="k-sc-drawer-head">
      <span className="k-group-title">Files</span>
      <IconButton label="Close the file list" onClick={() => setFilesOpen(false)}><X size={18} /></IconButton>
    </div>
  ) : null;

  return (
    <div className={`relative flex flex-1 min-w-0 min-h-0${touch ? ' k-sc-touch' : ''}${narrow ? ' k-sc-narrow' : ''}`}>
      {scrim}
      <nav ref={navRef} id="k-sc-files" className={`k-rd-side k-sc-side${narrow ? ' k-sc-drawer' : ''}${drawerOn ? ' k-sc-drawer-on' : ''}`} aria-label="Files"
        inert={narrow && !drawerOn ? true : undefined}
        onPointerDown={narrow ? onSwipeDown : undefined} onPointerMove={narrow ? onSwipeMove : undefined}
        onPointerUp={narrow ? onSwipeUp : undefined} onPointerCancel={narrow ? onSwipeUp : undefined} onClickCapture={narrow ? onSwipeClick : undefined}>
        {drawerHead}
        <div className="k-rd-search">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--k-search-icon)] pointer-events-none" />
            <input ref={searchRef} type="text" value={query} onChange={e => setQuery(e.target.value)} spellCheck={false}
              placeholder="Search files and code"
              className="k-text-in k-search-bar w-full h-9 pl-9 pr-16 rounded-lg text-[13px] bg-[var(--k-search-bg)] border border-[var(--alpha-card-border)] shadow-[var(--shadow-input)] text-[var(--text-primary)] placeholder:text-[var(--k-placeholder)] outline-none" />
            <SearchEnd query={query} onClear={() => { setQuery(''); searchRef.current?.focus(); }} />
          </div>
        </div>
        <div className="k-sc-pin">
          <button type="button" className={`k-rd-item k-rd-item-sm${page.kind === 'overview' ? ' k-rd-item-on' : ''}`} onClick={() => { setPage({ kind: 'overview' }); setFilesOpen(false); }}>
            <span className="k-rd-item-icon"><Overview size={14} /></span>
            <span className="k-rd-item-text truncate">Overview</span>
          </button>
        </div>
        <div ref={listHost} className="k-sc-list">
          <SwapInPlace swapKey={searching} hold={false} className="h-full">
            {searching ? resultsList : treeList}
          </SwapInPlace>
        </div>
        <div className="k-rd-foot k-sc-foot">
          <span className="k-badge">{fmtCount(project.root.fileCount)} files</span>
          <span className="k-badge">{fmtShort(project.root.lines)} lines</span>
          <span className="k-badge">{fmtBytes(project.root.bytes)}</span>
        </div>
      </nav>
      <div className="flex-1 min-w-0 flex flex-col relative" inert={drawerOn ? true : undefined}>
        {filesBar}
        <PageSwap>
          {pageEl}
        </PageSwap>
      </div>
    </div>
  );
}

interface Group { name: string; files: number; lines: number; chars: number; bytes: number }

const OverviewPage: React.FC<{ project: SourceProject; onOpen: (path: string) => void }> = ({ project, onOpen }) => {
  const r = project.root;
  const facts = useMemo(() => {
    const groups = new Map<string, Group>();
    let codeFiles = 0, codeLines = 0, codeChars = 0, dataFiles = 0, pictures = 0;
    for (const f of project.files) {
      const g = groupOf(f);
      let x = groups.get(g);
      if (!x) groups.set(g, (x = { name: g, files: 0, lines: 0, chars: 0, bytes: 0 }));
      x.files++; x.lines += f.lines; x.chars += f.chars; x.bytes += f.bytes;
      if (f.kind === 'c') { codeFiles++; codeLines += f.lines; codeChars += f.chars; }
      else if (f.kind === 'd') dataFiles++;
      else if (f.kind === 'i') pictures++;
    }
    const byKind = [...groups.values()].sort((a, b) => b.bytes - a.bytes);
    const tops: Group[] = r.folders.map(f => ({ name: f.name, files: f.fileCount, lines: f.lines, chars: f.chars, bytes: f.bytes }));
    if (r.files.length) {
      const t: Group = { name: 'Top files', files: 0, lines: 0, chars: 0, bytes: 0 };
      for (const f of r.files) { t.files++; t.lines += f.lines; t.chars += f.chars; t.bytes += f.bytes; }
      tops.push(t);
    }
    tops.sort((a, b) => b.bytes - a.bytes);
    const largest = project.files.filter(f => f.kind === 'c').sort((a, b) => b.lines - a.lines).slice(0, 8);
    return { byKind, tops, largest, codeFiles, codeLines, codeChars, dataFiles, pictures };
  }, [project, r]);

  const stat = (label: string, value: string, sub: string) => (
    <div className="k-info-card k-sc-stat">
      <span className="k-sc-stat-label">{label}</span>
      <span className="k-sc-stat-value truncate">{value}</span>
      <span className="k-sc-stat-sub truncate">{sub}</span>
    </div>
  );
  const table = (title: string, list: Group[], total: number) => (
    <section className="k-info-card k-sc-table">
      <div className="k-sc-table-head">
        <span className="k-sc-table-title">{title}</span>
        <span className="k-sc-cols"><span>Files</span><span>Lines</span><span>Size</span></span>
      </div>
      {list.map(g => (
        <div key={g.name} className="k-sc-table-row">
          <span className="k-sc-table-name">
            <span className="truncate">{g.name}</span>
            <span className="k-sc-share" aria-hidden><span style={{ transform: `scaleX(${total ? g.bytes / total : 0})` }} /></span>
          </span>
          <span className="k-sc-cols"><span>{fmtCount(g.files)}</span><span>{fmtCount(g.lines)}</span><span>{fmtBytes(g.bytes)}</span></span>
        </div>
      ))}
    </section>
  );

  return (
    <div className="k-sc-page">
        <div className="k-sc-overhead">
          <div className="min-w-0">
            <div className="k-rd-path">Source code</div>
            <h1 className="k-rd-title">{project.name}</h1>
          </div>
        </div>
        <div className="k-sc-stats">
          {stat('Files', fmtCount(r.fileCount), `${fmtCount(facts.codeFiles)} code, ${fmtCount(facts.dataFiles)} data, ${fmtCount(facts.pictures)} pictures`)}
          {stat('Lines', fmtCount(r.lines), `${fmtCount(facts.codeLines)} of them code`)}
          {stat('Characters', fmtCount(r.chars), `${fmtCount(facts.codeChars)} of them code`)}
          {stat('Size', fmtBytes(r.bytes), `${fmtCount(r.bytes)} bytes in ${fmtCount(project.folderCount)} folders`)}
        </div>
        {table('By kind', facts.byKind, r.bytes)}
        {table('By folder', facts.tops, r.bytes)}
        <section className="k-info-card k-sc-table">
          <div className="k-sc-table-head">
            <span className="k-sc-table-title">Longest code files</span>
            <span className="k-sc-cols"><span>Lines</span><span>Characters</span><span>Size</span></span>
          </div>
          {facts.largest.map(f => (
            <button key={f.path} type="button" className="k-sc-table-row k-sc-table-link" onClick={() => onOpen(f.path)}>
              <span className="k-sc-table-name">
                <span className="k-sc-file-icon">{iconOf(f)}</span>
                <span className="truncate">{f.name}</span>
                <span className="truncate k-sc-result-path">{f.dir}</span>
              </span>
              <span className="k-sc-cols"><span>{fmtCount(f.lines)}</span><span>{fmtCount(f.chars)}</span><span>{fmtBytes(f.bytes)}</span></span>
            </button>
          ))}
        </section>
    </div>
  );
}

const FilePage: React.FC<{ project: SourceProject; file: SourceFile; find: string; line: number | null; seq: number }> = ({ project, file, find: findAsked, line, seq }) => {
  const isText = file.kind === 'c' || file.kind === 'd';
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isText) return;
    let alive = true;
    loadFileText(project, file).then(t => { if (alive) setText(t); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [project, file, isText]);

  const [findOpen, setFindOpen] = useState(!!findAsked);
  const [find, setFind] = useState(findAsked);
  const [step, setStep] = useState({ seq: 0, delta: 1 });
  const [found, setFound] = useState({ active: -1, count: 0 });
  const onFind = useCallback((active: number, count: number) => setFound(f => (f.active === active && f.count === count ? f : { active, count })), []);
  const findBox = useRef<HTMLDivElement>(null);
  const [goLine, setGoLine] = useState<{ line: number; seq: number } | null>(line ? { line, seq } : null);
  const lastSeq = useRef(seq);
  useEffect(() => {
    if (seq === lastSeq.current) return;
    lastSeq.current = seq;
    if (findAsked) { setFind(findAsked); setFindOpen(true); }
    if (line) setGoLine({ line, seq });
  }, [seq, findAsked, line]);

  const focusFind = () => window.setTimeout(() => { const el = findBox.current?.querySelector('input'); el?.focus(); el?.select(); }, 0);
  const openFind = useCallback(() => {
    const sel = window.getSelection();
    const picked = sel && !sel.isCollapsed ? sel.toString() : '';
    const inCode = !!sel?.anchorNode?.parentElement?.closest('.k-sc-lines');
    if (inCode && picked && !/[\r\n]/.test(picked) && picked.length <= 200) setFind(picked);
    setFindOpen(true);
    focusFind();
  }, []);
  const closeFind = useCallback(() => { setFindOpen(false); setFind(''); }, []);
  const next = (delta: number) => setStep(s => ({ seq: s.seq + 1, delta }));
  useEscapeOwner(closeFind, findOpen);
  useEffect(() => {
    if (!isText) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); openFind(); }
      else if (e.key === 'F3') { e.preventDefault(); next(e.shiftKey ? -1 : 1); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isText, openFind]);

  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const t = window.setTimeout(() => setCopied(false), 1500); return () => window.clearTimeout(t); }, [copied]);
  const copy = () => {
    if (text === null) return;
    navigator.clipboard.writeText(text).then(() => setCopied(true), () => toast('error', 'The text could not be copied'));
  };
  const download = () => {
    if (isText) { if (text !== null) saveBlob(new Blob([text], { type: 'text/plain' }), file.name); return; }
    fetch(urlOf(file.src)).then(r => r.blob()).then(b => saveBlob(b, file.name), () => toast('error', 'The file could not be downloaded'));
  };
  const [dims, setDims] = useState<string | null>(null);

  const bodyKind = file.kind === 'i' ? 'picture' : file.kind === 'b' ? 'binary' : failed ? 'failed' : text === null ? 'wait' : 'code';
  let body: React.ReactNode;
  switch (bodyKind) {
    case 'picture':
      body = (
        <div className="k-sc-picture">
          <img src={urlOf(file.src)} alt={file.name} draggable={false}
            onLoad={e => setDims(`${e.currentTarget.naturalWidth} x ${e.currentTarget.naturalHeight}`)} />
        </div>
      );
      break;
    case 'binary':
      body = <div className="h-full grid place-items-center"><EmptyState icon={emptyArt(FilePlain)} title="This file is not text" hint={`${fmtBytes(file.bytes)}. Download it to open it.`} words /></div>;
      break;
    case 'failed':
      body = <div className="h-full grid place-items-center"><EmptyState icon={emptyArt(FilePlain)} title="This file could not be loaded" hint="Close the window and open it again." words /></div>;
      break;
    case 'wait':
      body = (
        <div className="k-skel-delay absolute inset-0 px-6 py-4 flex flex-col gap-2.5" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => <div key={i} className="skeleton-shimmer h-3 rounded" style={{ width: `${20 + ((i * 53) % 60)}%`, marginLeft: `${(i % 4) * 16}px` }} />)}
        </div>
      );
      break;
    default:
      body = <CodeView text={text as string} lang={file.lang} find={findOpen ? find : ''} step={step} onFind={onFind} goLine={goLine} />;
  }
  const copyIcon = copied ? ICON_COPIED : ICON_COPY;

  const parts = file.path.split('/');
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="k-sc-filehead">
        <div className="min-w-0 flex-1">
          <div className="k-rd-path k-sc-crumbs">
            {parts.length > 1 ? parts.slice(0, -1).map((p, i) => (
              <React.Fragment key={i}>{i > 0 && <span className="k-rd-path-sep">/</span>}<span className="truncate">{p}</span></React.Fragment>
            )) : <span>{project.name}</span>}
          </div>
          <div className="k-sc-filename">
            <span className="k-sc-file-icon">{iconOf(file, 16)}</span>
            <h2 className="truncate">{file.name}</h2>
          </div>
        </div>
        <div className="k-sc-tags">
          <span className="k-badge">{kindName(file)}</span>
          {isText && <span className="k-badge">{fmtCount(file.lines)} lines</span>}
          {isText && <span className="k-badge">{fmtCount(file.chars)} characters</span>}
          <Fade when={dims}>{() => <span className="k-badge">{dims}</span>}</Fade>
          <span className="k-badge">{fmtBytes(file.bytes)}</span>
        </div>
        <div className="flex items-center gap-1">
          {isText && <IconButton label="Find in this file (Ctrl F)" active={findOpen} onClick={() => (findOpen ? focusFind() : openFind())}><Search size={16} /></IconButton>}
          {isText && (
            <IconButton label={copied ? 'Copied' : 'Copy the whole file'} onClick={copy} disabled={text === null}>
              <SwapInPlace swapKey={copied} hold={false} className="grid place-items-center">{copyIcon}</SwapInPlace>
            </IconButton>
          )}
          <IconButton label="Download this file" onClick={download} disabled={isText && text === null}><Download size={16} /></IconButton>
        </div>
      </div>
      {isText && (
        <Reveal when={findOpen}>
          <div ref={findBox} className="k-sc-findbar"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); next(e.shiftKey ? -1 : 1); } }}>
            <div className="relative k-sc-findfield">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--k-search-icon)] pointer-events-none" />
              <input type="text" value={find} onChange={e => setFind(e.target.value)} placeholder="Find in this file" spellCheck={false} autoFocus
                className="k-text-in k-search-bar w-full h-8 pl-8 pr-3 rounded-lg text-[12.5px] bg-[var(--k-search-bg)] border border-[var(--alpha-card-border)] text-[var(--text-primary)] placeholder:text-[var(--k-placeholder)] outline-none" />
            </div>
            <span className="k-sc-findcount">
              {find ? (found.count ? `${fmtCount(found.active + 1)} of ${fmtCount(found.count)}${found.count >= 20000 ? '+' : ''}` : 'No matches') : ''}
            </span>
            <IconButton label="Previous match (Shift Enter)" onClick={() => next(-1)} disabled={!found.count}><ArrowUp size={15} /></IconButton>
            <IconButton label="Next match (Enter)" onClick={() => next(1)} disabled={!found.count}><ArrowDown size={15} /></IconButton>
            <IconButton label="Close Find" onClick={closeFind}><X size={15} /></IconButton>
          </div>
        </Reveal>
      )}
      <SwapInPlace swapKey={bodyKind} hold={false} className="flex-1 min-h-0 relative">{body}</SwapInPlace>
    </div>
  );
}
