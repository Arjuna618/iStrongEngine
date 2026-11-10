import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Star, Check, Lock, HdFileBox, HdMapFile, HdFileAttachment, MoreHorizontal, EMPTY_LINE } from '../ui/icons';
import { useEscapeOwner } from '../shared/escapeStack';
import type { LibEntry } from './catalog';
import type { CardSize } from './libraryStore';
import type { LibPass } from './libraryGL';
import type { FrameLoop } from './frameLoop';
import { pictureOf, hasPicture } from './libraryPictures';
import { cardFacts } from './libraryMeta';
import { cmHex, CM, CM_USE } from '../../utils/colorMap';
import { FOLD_FADE_MS, Fade, SwapInPlace } from '../kit/Collapse';
import { motionOff, easeToward, motionCause, holdControl } from '../kit/presence';
import { planCardMotion, stepCardMotion, type CardMotion, type CardPlace } from '../kit/cardMotion';
const PIC_WAIT_MS = 200;
const PIC_SHOWN_MS = 50;
import { gameGridLine } from '../shared/GameFloor';
import { SMALL_FIX } from '../../game/smallFixSwitch';

export interface GridSection { id: string; title?: string; entries: readonly LibEntry[]; }

export interface GridPassProvider {
  fill(pass: LibPass, dev: number, until: number, dark: boolean): boolean;
}

export interface GridHost {
  loop: FrameLoop;
  setGrid(p: GridPassProvider | null): void;
  offsetOf(el: HTMLElement): { x: number; y: number };
  occluderLeft?(): number | null;
}

export interface LibraryGridHandle {
  scrollToKey(key: string): void;
  page(dir: number): void;
  toEdge(end: boolean): void;
  neighbour(key: string, dx: number, dy: number): string | null;
  firstKey(): string | null;
}

interface Props {
  sections: readonly GridSection[];
  size: CardSize;
  extraH: number;
  dark: boolean;
  selectedKey: string | null;
  focusKey: string | null;
  chosen: ReadonlySet<string>;
  lockOf?: (e: LibEntry) => string | null;
  favs: ReadonlySet<string>;
  onSelect: (e: LibEntry) => void;
  onActivate: (e: LibEntry) => void;
  onFav: (e: LibEntry) => void;
  renderExtra?: (e: LibEntry) => React.ReactNode;
  resetKey: string;
  pageKey?: string;
  host: GridHost;
  loading: boolean;
  empty: React.ReactNode;
  variant?: GridVariant;
  hubHost?: HubHost;
  narrow?: boolean;
}

const PAD = 18, GAP = 14, TITLE_H = 40;
const FLICK_MS = 320;
const MIN_W: Record<CardSize, number> = { s: 146, m: 178, l: 230 };
const MIN_W_NARROW: Record<CardSize, number> = { s: 84, m: 104, l: 200 };
const NARROW_CTRL_W = 124;
const FOOT_H = 58;
export const HUB_BAR_H = 36;
export type GridVariant = 'library' | 'hub';

export interface HubHost {
  renamingKey: string | null;
  onMenu(e: LibEntry, ev: React.MouseEvent): void;
  onRenameDone(e: LibEntry, name: string | null): void;
  need(e: LibEntry): void;
}
const FAST_PX_S = 2600;
const SETTLE_MS = 90;
const EASE_MS = 70;

interface Row { kind: 'title' | 'cards'; top: number; h: number; section: number; start: number; count: number; title: string; }
export interface GridLayout { cols: number; cardW: number; heroH: number; heroTop: number; cardH: number; rows: Row[]; contentH: number; }

export function gridLayout(sections: readonly GridSection[], vw: number, size: CardSize, extraH: number, variant: GridVariant = 'library', narrow = false): GridLayout {
  const inner = Math.max(120, vw - PAD * 2);
  const minW = narrow ? Math.max(MIN_W_NARROW[size], extraH > 0 ? NARROW_CTRL_W : 0) : MIN_W[size];
  const cols = Math.max(1, Math.floor((inner + GAP) / (minW + GAP)));
  const cardW = (inner - GAP * (cols - 1)) / cols;
  const hub = variant === 'hub';
  const heroH = Math.round(cardW * (hub ? 0.74 : 0.8));
  const heroTop = hub ? HUB_BAR_H : 0;
  const cardH = hub ? HUB_BAR_H + heroH : heroH + FOOT_H + extraH;
  const rows: Row[] = [];
  let y = PAD;
  sections.forEach((s, si) => {
    if (s.entries.length === 0) return;
    if (s.title) { rows.push({ kind: 'title', top: y, h: TITLE_H, section: si, start: 0, count: 0, title: s.title }); y += TITLE_H; }
    for (let i = 0; i < s.entries.length; i += cols) {
      rows.push({ kind: 'cards', top: y, h: cardH, section: si, start: i, count: Math.min(cols, s.entries.length - i), title: '' });
      y += cardH + GAP;
    }
    y += GAP;
  });
  return { cols, cardW, heroH, heroTop, cardH, rows, contentH: Math.max(0, y - GAP * 2 + PAD) };
}

function rowsSkeletonTile(L: GridLayout, vw: number): string {
  const hub = L.heroTop > 0;
  const css = getComputedStyle((hub && document.querySelector('.k-hub-window')) || document.documentElement);
  const v = (n: string, d: string) => (css.getPropertyValue(n).trim() || d);
  const card = hub ? v('--k-box-bg', '#fffffe') : v('--k-lib-card-bg', v('--layer-2', '#fffffe')), edge = v('--alpha-card-border', 'rgba(0,0,0,0.1)'), skel = v('--shimmer-a', '#f5f5f6');
  const head = hub ? v('--k-hub-card-head', v('--k-card-head', card)) : v('--k-card-head', card);
  const W = Math.max(1, Math.ceil(vw)), H = Math.max(1, Math.round(L.cardH + GAP));
  const bw = (L.cardW - 26);
  let r = '';
  for (let c = 0; c < L.cols; c++) {
    const x = PAD + c * (L.cardW + GAP);
    r += `<rect x="${x + 0.5}" y="0.5" width="${L.cardW - 1}" height="${L.cardH - 1}" rx="11.5" fill="${card}" stroke="${edge}"/>`;
    if (L.heroTop > 0) {
      r += `<path d="M${x + 1} ${L.heroTop}V12a11 11 0 0 1 11-11h${L.cardW - 24}a11 11 0 0 1 11 11V${L.heroTop}Z" fill="${head}"/>`;
      r += `<rect x="${x + 12}" y="${L.heroTop / 2 - 6}" width="12" height="12" rx="3" fill="${skel}"/>`;
      r += `<rect x="${x + 32}" y="${L.heroTop / 2 - 5}" width="${bw * 0.55}" height="10" rx="4" fill="${skel}"/>`;
      r += `<rect x="${x + 12}" y="${L.heroTop + 12}" width="${L.cardW - 24}" height="${L.heroH - 24}" rx="8" fill="${skel}"/>`;
      continue;
    }
    r += `<path d="M${x + 1} ${L.heroH}V12a11 11 0 0 1 11-11h${L.cardW - 24}a11 11 0 0 1 11 11V${L.heroH}Z" fill="${skel}"/>`;
    r += `<rect x="${x + 13}" y="${L.heroH + 12}" width="${bw * 0.62}" height="14" rx="4" fill="${skel}"/>`;
    r += `<rect x="${x + 13}" y="${L.heroH + 31}" width="${bw * 0.38}" height="20" rx="8" fill="${skel}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${r}</svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

function firstRowBelow(rows: readonly Row[], y: number): number {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rows[mid].top + rows[mid].h <= y) lo = mid + 1; else hi = mid; }
  return lo;
}

const _reduceMotion = motionOff;

interface MoveData { title: string | null; e: LibEntry | null; si: number }
type GridMotion = CardMotion<MoveData>;

function slotPositions(L: GridLayout, secs: readonly GridSection[]): Map<string, CardPlace<MoveData>> {
  const m = new Map<string, CardPlace<MoveData>>();
  for (const row of L.rows) {
    const s = secs[row.section];
    if (row.kind === 'title') { m.set('t@' + s.id, { x: PAD, y: row.top, h: TITLE_H, data: { e: null, title: row.title, si: row.section } }); continue; }
    for (let c = 0; c < row.count; c++) {
      const e = s.entries[row.start + c];
      m.set(e.key + '@' + s.id, { x: PAD + c * (L.cardW + GAP), y: row.top, h: L.cardH, data: { e, title: null, si: row.section } });
    }
  }
  return m;
}

function viewAnchor(oPos: ReadonlyMap<string, CardPlace<MoveData>>, nPos: ReadonlyMap<string, CardPlace<MoveData>>, y: number, vh: number): number | null {
  const seen = (top: number, h: number) => top + h > y && top < y + vh;
  let anchor: number | null = null, moved = false;
  for (const [k, o] of oPos) {
    if (!seen(o.y, o.h)) continue;
    const n = nPos.get(k);
    if (!n) return null;
    if (Math.abs(n.x - o.x) > 0.5) return null;
    const d = n.y - o.y;
    if (Math.abs(d) > 0.5) moved = true;
    if (anchor === null) anchor = d; else if (Math.abs(d - anchor) > 0.5) return null;
  }
  for (const [k, n] of nPos) if (!oPos.has(k) && seen(n.y - (anchor ?? 0), n.h)) return null;
  return anchor !== null && moved ? anchor : anchor === null ? null : 0;
}

interface CardProps {
  e: LibEntry; slotKey: string; x: number; y: number; w: number; heroH: number; h: number;
  lite: boolean; selected: boolean; focused: boolean; chosen: boolean; lock: string | null; fav: boolean;
  floor: string; grid: string;
  extra: React.ReactNode;
  onSelect: (e: LibEntry, slot?: string) => void; onActivate: (e: LibEntry) => void; onFav: (e: LibEntry) => void;
  reg: (key: string, el: HTMLDivElement | null) => void;
}

export const CardSkeleton: React.FC<{ x: number; y: number; w: number; heroH: number; h: number; heroTop?: number }> = React.memo(({ x, y, w, heroH, h, heroTop = 0 }) => (
  heroTop > 0 ? (
    <div aria-hidden className="absolute rounded-xl border border-[var(--alpha-card-border)] bg-[var(--k-box-bg)] overflow-hidden" style={{ left: x, top: y, width: w, height: h }}>
      <div className="k-hub-bar"><div className="skeleton-shimmer h-3 w-3 rounded" /><div className="skeleton-shimmer h-2.5 rounded" style={{ width: '55%' }} /></div>
      <div className="p-3" style={{ height: heroH }}><div className="skeleton-shimmer h-full w-full rounded-lg" /></div>
    </div>
  ) : (
  <div aria-hidden className="absolute rounded-xl border border-[var(--alpha-card-border)] bg-[var(--k-lib-card-bg)] overflow-hidden" style={{ left: x, top: y, width: w, height: h }}>
    <div className="skeleton-shimmer" style={{ height: heroH, borderRadius: 0 }} />
    <div className="px-3 pt-3">
      <div className="skeleton-shimmer h-3.5 rounded" style={{ width: '62%' }} />
      <div className="skeleton-shimmer h-5 rounded-lg mt-[5px]" style={{ width: '38%' }} />
    </div>
  </div>
  )
));
CardSkeleton.displayName = 'CardSkeleton';

const HUB_ICON = { project: HdFileBox, map: HdMapFile, file: HdFileAttachment } as const;

const HubRename: React.FC<{ initial: string; onDone: (name: string | null) => void }> = ({ initial, onDone }) => {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (name: string | null) => { if (done.current) return; done.current = true; onDone(name); };
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  useEscapeOwner(() => finish(null));
  return (
    <input ref={ref} dir="auto" className="k-hub-rename k-text-in" value={v} maxLength={80} aria-label="New name"
      onChange={e => setV(e.target.value)} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(v); } }}
      onBlur={() => finish(v)} />
  );
};

interface HubCardProps {
  e: LibEntry; slotKey: string; x: number; y: number; w: number; heroH: number; h: number;
  selected: boolean; focused: boolean; floor: string; grid: string; renaming: boolean; host: HubHost;
  onSelect: (e: LibEntry, slot?: string) => void; onActivate: (e: LibEntry) => void;
  reg: (key: string, el: HTMLDivElement | null) => void;
}

const HubCard: React.FC<HubCardProps> = React.memo(({ e, slotKey, x, y, w, heroH, h, selected, focused, floor, grid, renaming, host, onSelect, onActivate, reg }) => {
  const refCb = useCallback((el: HTMLDivElement | null) => reg(slotKey, el), [reg, slotKey]);
  const hb = e.hub!;
  const Small = HUB_ICON[hb.icon];
  const big = Math.max(28, Math.min(48, Math.round(heroH * 0.32)));
  const cell = Math.max(14, Math.round(w / 9));
  const word = hb.kind === 'project' ? 'Project' : hb.icon === 'map' ? 'Map file' : 'File';
  return (
    <div
      ref={refCb}
      role="gridcell"
      aria-selected={selected}
      aria-label={`${word}, ${e.name}${hb.open ? ', open now' : ''}`}
      data-tip={renaming ? undefined : hb.tip}
      onClick={() => onSelect(e, slotKey)}
      onDoubleClick={() => onActivate(e)}
      onContextMenu={ev => host.onMenu(e, ev)}
      className="group absolute select-none cursor-pointer"
      style={{ left: x, top: y, width: w, height: h }}
    >
      <div className="absolute inset-0 rounded-xl border bg-[var(--k-box-bg)] shadow-[var(--k-hub-card-shadow)] border-[var(--alpha-card-border)]" />
      <div className="absolute inset-0 rounded-xl shadow-[var(--shadow-raise)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none" />
      <div className="k-hub-bar">
        <Small size={14} className="shrink-0" />
        <SwapInPlace swapKey={!!renaming} hold={false} className="min-w-0 flex-1 flex">
        {renaming
          ? <HubRename initial={e.name} onDone={name => host.onRenameDone(e, name)} />
          : <span className="k-hub-name" dir="auto">{e.name}</span>}
        </SwapInPlace>
        <Fade when={!renaming}>{(
          <button type="button" className="k-hub-more" aria-label={`More for ${e.name}`} data-tip="More"
            onClick={ev => { ev.stopPropagation(); host.onMenu(e, ev); }} onDoubleClick={ev => ev.stopPropagation()}>
            <MoreHorizontal size={16} />
          </button>
        )}</Fade>
      </div>
      {hb.preview ? (
        <div className="absolute overflow-hidden rounded-b-[11px]" style={{ left: 1, top: HUB_BAR_H, right: 1, height: heroH - 1, backgroundColor: floor,
          backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
          backgroundSize: `${cell}px ${cell}px`, backgroundPosition: 'center center' }}>
          <div className="absolute inset-0 skeleton-shimmer transition-opacity duration-200 group-data-[ready=1]:opacity-0" style={{ borderRadius: 0 }} />
        </div>
      ) : (
        <div className="absolute left-0 right-0 grid place-items-center" style={{ top: HUB_BAR_H, height: heroH }}>
          <span className="k-hub-icon"><Small size={big} strokeWidth={EMPTY_LINE} /></span>
        </div>
      )}
      <div className={`absolute inset-0 rounded-xl k-pick-ring pointer-events-none transition-opacity duration-150 ${selected ? 'opacity-100' : focused ? 'opacity-50' : 'opacity-0'}`} />
    </div>
  );
});
HubCard.displayName = 'HubCard';

const Card: React.FC<CardProps> = React.memo(({ e, slotKey, x, y, w, heroH, h, lite, selected, focused, chosen, lock, fav, floor, grid, extra, onSelect, onActivate, onFav, reg }) => {
  const refCb = useCallback((el: HTMLDivElement | null) => reg(slotKey, el), [reg, slotKey]);
  if (lite) return <CardSkeleton x={x} y={y} w={w} heroH={heroH} h={h} />;
  const facts = cardFacts(e);
  const cell = Math.max(14, Math.round(w / 9));
  return (
    <div
      ref={refCb}
      role="gridcell"
      aria-selected={selected}
      aria-label={e.name}
      title={lock ?? undefined}
      onClick={() => onSelect(e, slotKey)}
      onDoubleClick={() => { if (!lock) onActivate(e); }}
      className={`group absolute select-none ${lock ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ left: x, top: y, width: w, height: h }}
    >
      <div className="absolute inset-0 rounded-xl border bg-[var(--k-lib-card-bg)] shadow-[var(--k-card-shadow)] border-[var(--alpha-card-border)]" />
      <div className="absolute inset-0 rounded-xl shadow-[var(--shadow-raise)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none" />
      <div className="absolute overflow-hidden rounded-t-[11px]" style={{ left: 1, top: 1, right: 1, height: heroH - 1, backgroundColor: floor,
        backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
        backgroundSize: `${cell}px ${cell}px`, backgroundPosition: 'center center' }}>
        <div className="absolute inset-0 skeleton-shimmer transition-opacity duration-200 group-data-[ready=1]:opacity-0" style={{ borderRadius: 0 }} />
        <div aria-hidden={!chosen} className={`absolute left-2.5 bottom-2.5 h-6 w-6 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] grid place-items-center shadow-[var(--shadow-sm)] transition-opacity duration-150 ${chosen ? 'opacity-100' : 'opacity-0'}`}>
          <Check size={14} strokeWidth={3} />
        </div>
        {lock && (
          <div className="absolute inset-0 bg-[var(--layer-2)] opacity-40" />
        )}
      </div>
      {e.tier > 0 && (
        <div className="k-lib-badge absolute left-2.5 top-2.5">
          T{e.tier}
        </div>
      )}
      {e.mine && (
        <div className={`k-lib-badge absolute ${e.tier > 0 ? 'left-11' : 'left-2.5'} top-2.5`}>
          Mine
        </div>
      )}
      <button
        type="button"
        onClick={(ev) => { ev.stopPropagation(); onFav(e); }}
        onDoubleClick={(ev) => ev.stopPropagation()}
        title={fav ? 'Remove from favourites' : 'Add to favourites'}
        aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
        className={`k-ico absolute right-2 top-2 h-7 w-7 grid place-items-center rounded-md transition-opacity duration-150 text-[var(--text-secondary)] hover:bg-[var(--alpha-hover)] ${fav ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
      >
        <Star size={15} fill={fav ? 'currentColor' : 'none'} />
      </button>
      <div className="absolute left-0 right-0 px-3" style={{ top: heroH + 9 }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {lock && <Lock size={12} className="shrink-0 text-[var(--text-tertiary)]" />}
          <span className={`text-[13px] leading-tight truncate ${lock ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>{e.name}</span>
        </div>
        {lock
          ? <div className="mt-1.5 flex items-center gap-1.5 min-w-0 text-[11px] leading-none text-[var(--text-tertiary)]"><span className="truncate">{lock}</span></div>
          : <div className="k-lib-facts k-fade">{facts.map(t => <span key={t} className="k-badge">{t}</span>)}</div>}
        {extra}
      </div>
      <div className={`absolute inset-0 rounded-xl k-pick-ring pointer-events-none transition-opacity duration-150 ${selected ? 'opacity-100' : focused ? 'opacity-50' : 'opacity-0'}`} />
    </div>
  );
});
Card.displayName = 'LibraryCard';

export const LibraryGrid = React.forwardRef<LibraryGridHandle, Props>((props, ref) => {
  const { sections, size, extraH, dark, selectedKey, focusKey, chosen, lockOf, favs, onSelect, onActivate, onFav, renderExtra, resetKey, pageKey, host, loading, empty, variant = 'library', hubHost, narrow = false } = props;
  const hubHostRef = useRef(hubHost); hubHostRef.current = hubHost;
  const navSlotRef = useRef<string | null>(null);
  const onSelectSlot = useCallback((e: LibEntry, slot?: string) => { navSlotRef.current = slot ?? null; onSelect(e); }, [onSelect]);
  const vpRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const [range, setRange] = useState<[number, number]>([0, -1]);
  const [, setSettle] = useState(0);
  const st = useRef({ y: 0, target: 0, vh: 0, maxY: 0, speed: 0, fast: false, slowMs: 0, offX: 0, offY: 0, dragging: false, reduce: _reduceMotion(), auto: false }).current;
  const fullRows = useRef(new Set<number>());
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const titleEls = useRef(new Map<string, HTMLDivElement>());
  const readyKeys = useRef(new Set<string>());
  const bornAt = useRef(new Map<string, number>());
  const readyAt = useRef(new Map<string, number>());
  const layout = useMemo(() => gridLayout(sections, vw, size, extraH, variant, narrow), [sections, vw, size, extraH, variant, narrow]);
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const sectionsRef = useRef(sections); sectionsRef.current = sections;
  const motionRef = useRef<GridMotion | null>(null);
  const motionCauseRef = useRef<Element | null>(null);
  const [, setMotionV] = useState(0);
  const prevL = useRef<{ layout: GridLayout; sections: readonly GridSection[]; resetKey: string; pageKey: string | undefined; size: CardSize; vw: number; extraH: number } | null>(null);
  const darkRef = useRef(dark); darkRef.current = dark;
  const lockRef = useRef(lockOf); lockRef.current = lockOf;
  const floor = cmHex(CM.BACKGROUND, dark, CM_USE.GENERAL);
  const gridLine = useMemo(() => gameGridLine(dark), [dark]);

  const reg = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) {
      cardEls.current.set(key, el);
      if (!bornAt.current.has(key)) bornAt.current.set(key, performance.now());
      if (readyKeys.current.has(key)) el.dataset.ready = '1';
    } else {
      cardEls.current.delete(key);
      readyKeys.current.delete(key);
      bornAt.current.delete(key);
      readyAt.current.delete(key);
    }
  }, []);

  useLayoutEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const measure = () => {
      const w = vp.clientWidth, h = vp.clientHeight;
      setVw(prev => (Math.abs(prev - w) > 0.5 ? w : prev));
      setVh(prev => (Math.abs(prev - h) > 0.5 ? h : prev));
      st.vh = h;
      const o = host.offsetOf(vp);
      st.offX = o.x; st.offY = o.y;
      host.loop.request();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [host, st]);

  const rangeFor = useCallback((y: number): [number, number] => {
    const L = layoutRef.current;
    if (L.rows.length === 0) return [0, -1];
    const over = L.cardH * 1.5;
    const a = firstRowBelow(L.rows, Math.max(0, y - over));
    let b = firstRowBelow(L.rows, y + st.vh + over);
    if (b >= L.rows.length) b = L.rows.length - 1;
    return [a, b];
  }, [st]);

  const applyScroll = useCallback(() => {
    const c = contentRef.current;
    if (c) c.style.transform = `translate3d(0, ${-Math.round(st.y * 100) / 100}px, 0)`;
    const t = thumbRef.current, tr = trackRef.current;
    if (t && tr) {
      const L = layoutRef.current;
      const show = L.contentH > st.vh + 1;
      t.style.opacity = show ? '' : '0';
      if (show) {
        const trackH = tr.clientHeight;
        const th = Math.max(36, trackH * st.vh / L.contentH);
        const ty = st.maxY > 0 ? (st.y / st.maxY) * (trackH - th) : 0;
        t.style.height = th + 'px';
        t.style.transform = `translate3d(0, ${ty}px, 0)`;
      }
    }
  }, [st]);

  const stepMotion = useCallback((now: number): boolean => {
    const m = motionRef.current;
    if (!m) return false;
    const more = stepCardMotion(m, now);
    if (more) holdControl(motionCauseRef.current, 100);
    for (const it of m.cards) {
      const el = it.data.title !== null ? titleEls.current.get(it.key) : cardEls.current.get(it.key);
      if (!el) continue;
      const dx = it.cx - it.rx, dy = it.cy - it.ry;
      el.style.transform = dx !== 0 || dy !== 0 ? `translate(${Math.round(dx * 100) / 100}px, ${Math.round(dy * 100) / 100}px)` : '';
      el.style.opacity = it.alpha < 1 ? String(Math.round(it.alpha * 1000) / 1000) : '';
    }
    return more;
  }, []);
  const endMotion = useCallback(() => {
    const m = motionRef.current;
    if (!m) return;
    motionRef.current = null;
    for (const it of m.cards) {
      const el = it.data.title !== null ? titleEls.current.get(it.key) : cardEls.current.get(it.key);
      if (!el) continue;
      if (it.role === 'leave') { el.style.opacity = '0'; continue; }
      el.style.transform = ''; el.style.opacity = '';
    }
    setMotionV(v => v + 1);
  }, []);

  useLayoutEffect(() => {
    const prev = prevL.current;
    prevL.current = { layout, sections, resetKey, pageKey, size, vw, extraH };
    if (prev && prev.layout !== layout && prev.pageKey !== pageKey) { if (motionRef.current) endMotion(); }
    else if (prev && prev.layout !== layout) {
      const yNew = prev.resetKey !== resetKey ? 0 : st.y;
      if (prev.sections !== sections && prev.size === size && Math.abs(prev.vw - vw) < 0.5 && prev.extraH === extraH
        && (prev.layout.rows.length > 0 || layout.rows.length > 0) && vh > 0 && !st.reduce) {
        const oPos = slotPositions(prev.layout, prev.sections), nPos = slotPositions(layout, sections);
        const cur = motionRef.current;
        const anchor = !cur && prev.resetKey === resetKey ? viewAnchor(oPos, nPos, st.y, vh) : null;
        if (anchor !== null) {
          if (anchor !== 0) { st.y = Math.max(0, st.y + anchor); st.target = Math.max(0, st.target + anchor); }
        } else {
          const m = planCardMotion(oPos, nPos, st.y, yNew, vh, layout.cardH * 0.6, cur, performance.now(), prev.layout.rows.length === 0 ? FOLD_FADE_MS : 0);
          if (m) {
            motionRef.current = m;
            motionCauseRef.current = motionCause() ?? motionCauseRef.current;
            holdControl(motionCauseRef.current, 300);
            st.y = yNew; st.target = yNew; st.auto = false;
            for (const it of m.cards) if (it.role === 'leave' && it.data.e && hasPicture(it.data.e, darkRef.current)) readyKeys.current.add(it.key);
            setMotionV(v => v + 1);
          } else if (cur) endMotion();
        }
      } else if (motionRef.current) endMotion();
    }
    st.maxY = Math.max(0, layout.contentH - vh);
    if (st.target > st.maxY) st.target = st.maxY;
    if (st.y > st.maxY) st.y = st.maxY;
    fullRows.current.clear();
    setRange(rangeFor(st.y));
    applyScroll();
    host.loop.request();
  }, [layout, vh, rangeFor, applyScroll, host, st]);

  useLayoutEffect(() => {
    st.y = 0; st.target = 0; st.speed = 0;
    setRange(rangeFor(0));
    applyScroll();
  }, [resetKey]);
  useEffect(() => {
    readyKeys.current.clear();
    for (const el of cardEls.current.values()) delete el.dataset.ready;
    host.loop.request();
  }, [dark, host]);

  useEffect(() => {
    const off = host.loop.add((dt, ts) => {
      let moving = false;
      if (motionRef.current) {
        moving = stepMotion(ts);
        if (!moving) endMotion();
      }
      const prev = st.y;
      if (!st.dragging && !moving) {
        if (st.reduce) st.y = st.target;
        else if (st.auto) {
          st.y = easeToward(st.y, st.target, dt / 1000);
          if (st.y === st.target) st.auto = false;
        } else {
          const k = 1 - Math.exp(-dt / EASE_MS);
          st.y += (st.target - st.y) * k;
          if (Math.abs(st.target - st.y) < 0.25) st.y = st.target;
        }
      }
      if (st.y < 0) st.y = 0; if (st.y > st.maxY) st.y = st.maxY;
      const v = dt > 0 ? Math.abs(st.y - prev) / dt * 1000 : 0;
      st.speed = st.speed * 0.5 + v * 0.5;
      if (st.y !== prev) applyScroll();
      const r = rangeFor(st.y);
      setRange(cur => (cur[0] === r[0] && cur[1] === r[1] ? cur : r));
      let more = moving || st.y !== st.target;
      if (st.speed > FAST_PX_S) { st.fast = true; st.slowMs = 0; more = true; }
      else if (st.fast) {
        st.slowMs += dt;
        if (st.slowMs >= SETTLE_MS) { st.fast = false; setSettle(n => n + 1); }
        more = true;
      }
      return more;
    });
    return off;
  }, [host, st, applyScroll, rangeFor, stepMotion, endMotion]);

  useEffect(() => {
    const provider: GridPassProvider = {
      fill(pass, dev, until, dk) {
        const L = layoutRef.current;
        const secs = sectionsRef.current;
        let n = 0, more = false;
        const icon = Math.min(L.heroH, L.cardW) * 0.62;
        pass.iconPx = icon * dev;
        pass.x = st.offX * dev; pass.y = st.offY * dev; pass.w = (vpRef.current?.clientWidth ?? 0) * dev; pass.h = st.vh * dev;
        const occ = host.occluderLeft ? host.occluderLeft() : null;
        if (occ !== null) pass.w = Math.max(0, Math.min(pass.w, (occ - st.offX) * dev));
        const top = st.y, bottom = st.y + st.vh;
        const m = motionRef.current;
        if (m) {
          for (const it of m.cards) {
            const e = it.data.e;
            if (!e || it.alpha <= 0.001) continue;
            const el = cardEls.current.get(it.key);
            if (!el) { more = true; continue; }
            if (e.hub && (!e.hub.preview || (!e.item && !e.shape))) continue;
            if (!hasPicture(e, dk) && performance.now() > until) { more = true; continue; }
            const pic = pictureOf(e, dk);
            if (!readyKeys.current.has(it.key)) { readyKeys.current.add(it.key); el.dataset.ready = '1'; }
            if (pic.parts.length === 0 || it.cy >= bottom || it.cy + L.cardH <= top) continue;
            let slot = pass.slots[n];
            if (!slot) { slot = { pic, x: 0, y: 0, fade: 0 }; pass.slots[n] = slot; }
            slot.pic = pic;
            slot.x = (st.offX + it.cx + L.cardW / 2) * dev;
            slot.y = (st.offY + it.cy - st.y + L.heroTop + L.heroH / 2) * dev;
            slot.fade = lockRef.current && lockRef.current(e) ? 0.6 : 0;
            slot.alpha = it.alpha < 0.999 ? it.alpha : undefined;
            n++;
          }
          pass.count = n;
          return true;
        }
        const over = L.cardH * 1.5;
        const first = firstRowBelow(L.rows, Math.max(0, top - over));
        for (let ri = first; ri < L.rows.length; ri++) {
          const row = L.rows[ri];
          if (row.top >= bottom + over) break;
          if (row.kind !== 'cards') continue;
          const seen = row.top < bottom && row.top + row.h > top;
          const s = secs[row.section];
          for (let c = 0; c < row.count; c++) {
            const e = s.entries[row.start + c];
            const sk = e.key + '@' + s.id;
            const el = cardEls.current.get(sk);
            if (!el) { if (seen) more = true; continue; }
            if (e.hub) {
              if (!e.hub.preview) { if (!readyKeys.current.has(sk)) { readyKeys.current.add(sk); el.dataset.ready = '1'; } continue; }
              if (!e.item && !e.shape) { hubHostRef.current?.need(e); if (seen) more = true; continue; }
            }
            if (!hasPicture(e, dk) && performance.now() > until) { more = true; continue; }
            const pic = pictureOf(e, dk);
            if (!readyKeys.current.has(sk)) {
              readyKeys.current.add(sk); el.dataset.ready = '1';
              const now = performance.now();
              if (now - (bornAt.current.get(sk) ?? now) > PIC_SHOWN_MS) readyAt.current.set(sk, now);
            }
            if (!seen || pic.parts.length === 0) continue;
            let alpha = 1;
            const ra = readyAt.current.get(sk);
            if (ra !== undefined) {
              alpha = Math.max(0, Math.min(1, (performance.now() - ra - PIC_WAIT_MS) / FOLD_FADE_MS));
              if (alpha >= 1) readyAt.current.delete(sk); else more = true;
            }
            let slot = pass.slots[n];
            if (!slot) { slot = { pic, x: 0, y: 0, fade: 0 }; pass.slots[n] = slot; }
            slot.pic = pic;
            slot.x = (st.offX + PAD + c * (L.cardW + GAP) + L.cardW / 2) * dev;
            slot.y = (st.offY + row.top - st.y + L.heroTop + L.heroH / 2) * dev;
            slot.fade = lockRef.current && lockRef.current(e) ? 0.6 : 0;
            slot.alpha = alpha < 0.999 ? alpha : undefined;
            n++;
          }
        }
        pass.count = n;
        return more;
      },
    };
    host.setGrid(provider);
    return () => host.setGrid(null);
  }, [host, st]);

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      let d = ev.deltaY !== 0 ? ev.deltaY : ev.deltaX;
      if (ev.deltaMode === 1) d *= 40; else if (ev.deltaMode === 2) d *= st.vh;
      st.target = Math.max(0, Math.min(st.maxY, st.target + d));
      st.auto = false;
      host.loop.request();
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [host, st]);

  const onThumbDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault(); ev.stopPropagation();
    const tr = trackRef.current, th = thumbRef.current;
    if (!tr || !th) return;
    const scale = tr.getBoundingClientRect().height / Math.max(1, tr.clientHeight);
    const startY = ev.clientY, startScroll = st.y;
    const span = Math.max(1, tr.clientHeight - th.clientHeight);
    st.dragging = true;
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent) => {
      const dy = (e.clientY - startY) / scale;
      st.y = st.target = Math.max(0, Math.min(st.maxY, startScroll + dy / span * st.maxY));
      applyScroll();
      host.loop.request();
    };
    const up = () => {
      st.dragging = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      host.loop.request();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const onTrackDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    const th = thumbRef.current;
    if (!th || ev.target === th) return;
    const r = th.getBoundingClientRect();
    st.target = Math.max(0, Math.min(st.maxY, st.target + (ev.clientY < r.top ? -1 : 1) * st.vh * 0.9));
    host.loop.request();
  };
  const onVpDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.pointerType === 'mouse') return;
    const startY = ev.clientY, startScroll = st.y;
    const vp = vpRef.current!;
    const scale = vp.getBoundingClientRect().height / Math.max(1, vp.clientHeight);
    st.dragging = true;
    st.target = st.y;
    let lastY = ev.clientY, lastT = performance.now(), v = 0;
    const move = (e: PointerEvent) => {
      const now = performance.now(), dt = now - lastT;
      if (dt > 0) v = v * 0.6 + ((e.clientY - lastY) / scale / dt) * 0.4;
      lastY = e.clientY; lastT = now;
      st.y = st.target = Math.max(0, Math.min(st.maxY, startScroll - (e.clientY - startY) / scale)); applyScroll(); host.loop.request();
    };
    const up = (e: PointerEvent) => {
      st.dragging = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (e.type === 'pointerup' && performance.now() - lastT < 80 && Math.abs(v) > 0.2) st.target = Math.max(0, Math.min(st.maxY, st.y - v * FLICK_MS));
      host.loop.request();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  useImperativeHandle(ref, () => ({
    scrollToKey(key: string) {
      const L = layoutRef.current, secs = sectionsRef.current;
      for (const row of L.rows) {
        if (row.kind !== 'cards') continue;
        const s = secs[row.section];
        const _want = navSlotRef.current !== null && navSlotRef.current.startsWith(key + '@') ? navSlotRef.current : null;
        for (let c = 0; c < row.count; c++) {
          if (s.entries[row.start + c].key !== key) continue;
          if (_want !== null && key + '@' + s.id !== _want) continue;
          if (row.top - PAD < st.target) { st.target = Math.max(0, row.top - PAD); st.auto = true; }
          else if (row.top + row.h + PAD > st.target + st.vh) { st.target = Math.min(st.maxY, row.top + row.h + PAD - st.vh); st.auto = true; }
          host.loop.request();
          return;
        }
      }
    },
    page(dir: number) { st.target = Math.max(0, Math.min(st.maxY, st.target + dir * st.vh * 0.9)); st.auto = true; host.loop.request(); },
    toEdge(end: boolean) { st.target = end ? st.maxY : 0; st.auto = true; host.loop.request(); },
    neighbour(key: string, dx: number, dy: number) {
      const L = layoutRef.current, secs = sectionsRef.current;
      const flat: string[] = [];
      const slots: string[] = [];
      const colOf: number[] = [];
      for (const row of L.rows) { if (row.kind !== 'cards') continue; const s = secs[row.section]; for (let c = 0; c < row.count; c++) { const k = s.entries[row.start + c].key; flat.push(k); slots.push(k + '@' + s.id); colOf.push(c); } }
      let i = navSlotRef.current !== null ? slots.indexOf(navSlotRef.current) : -1;
      if (i < 0 || flat[i] !== key) i = flat.indexOf(key);
      if (i < 0) { navSlotRef.current = slots[0] ?? null; return flat[0] ?? null; }
      let j = i + dx;
      if (dy !== 0) j = i + dy * L.cols;
      if (j < 0 || j >= flat.length) return null;
      navSlotRef.current = slots[j];
      return flat[j];
    },
    firstKey() {
      const secs = sectionsRef.current;
      for (const s of secs) if (s.entries.length > 0) return s.entries[0].key;
      return null;
    },
  }), [host, st]);

  useLayoutEffect(() => { if (motionRef.current) stepMotion(performance.now()); });

  const items: React.ReactNode[] = [];
  const L = layout;
  const tile = useMemo(() => (vw > 0 && L.rows.length > 0 ? rowsSkeletonTile(L, vw) : ''), [L, vw, dark]);
  const loadTile = useMemo(() => (loading && vw > 0 ? rowsSkeletonTile(L, vw) : ''), [loading, L, vw, dark]);
  const patterns: React.ReactNode[] = [];
  if (tile && !loading && !motionRef.current) {
    let start = -1;
    for (let ri = 0; ri <= L.rows.length; ri++) {
      const row = L.rows[ri];
      const cards = row && row.kind === 'cards';
      if (cards && start < 0) start = ri;
      if ((!cards || ri === L.rows.length - 1 || L.rows[ri + 1]?.section !== row?.section) && start >= 0) {
        const endRow = cards ? row : L.rows[ri - 1];
        const top = L.rows[start].top;
        patterns.push(<div key={'p' + start} aria-hidden className="absolute left-0 right-0 pointer-events-none"
          style={{ top, height: endRow.top + endRow.h - top, backgroundImage: tile, backgroundRepeat: 'repeat-y', backgroundSize: `${Math.ceil(vw)}px ${Math.round(L.cardH + GAP)}px` }} />);
        start = -1;
      }
    }
  }
  const band = (ri: number) => {
    const row = L.rows[ri];
    const top = ri === 0 ? 0 : row.top - GAP / 2;
    const bottom = row.top + row.h + (ri === L.rows.length - 1 ? PAD : GAP / 2);
    return <div key={'b' + ri} aria-hidden className="absolute left-0 right-0 bg-[var(--k-content)]" style={{ top, height: bottom - top }} />;
  };
  const regTitle = (key: string) => (el: HTMLDivElement | null) => { if (el) titleEls.current.set(key, el); else titleEls.current.delete(key); };
  const cardOf = (e: LibEntry, slotKey: string, x: number, y: number): React.ReactNode => (e.hub && hubHost
    ? <HubCard key={slotKey} e={e} slotKey={slotKey} x={x} y={y} w={L.cardW} heroH={L.heroH} h={L.cardH}
        selected={e.key === selectedKey} focused={e.key === focusKey} floor={floor} grid={gridLine}
        renaming={hubHost.renamingKey === e.key} host={hubHost} onSelect={onSelectSlot} onActivate={onActivate} reg={reg} />
    : <Card
        key={slotKey}
        e={e} slotKey={slotKey} x={x} y={y} w={L.cardW} heroH={L.heroH} h={L.cardH}
        lite={false} selected={e.key === selectedKey} focused={e.key === focusKey} chosen={chosen.has(e.key)}
        lock={lockOf ? lockOf(e) : null} fav={favs.has(e.key)} floor={floor} grid={gridLine}
        extra={renderExtra ? renderExtra(e) : null}
        onSelect={onSelectSlot} onActivate={onActivate} onFav={onFav} reg={reg}
      />);
  const motion = motionRef.current;
  if (motion && !loading) {
    for (const it of motion.cards) {
      if (it.data.title !== null) {
        items.push(
          <div key={it.key} ref={regTitle(it.key)} className="absolute flex items-end pb-2.5" style={{ left: PAD, right: PAD, top: it.ry, height: TITLE_H }}>
            <span className="k-subhead">{it.data.title}</span>
          </div>,
        );
        continue;
      }
      if (SMALL_FIX.GH291 !== 0 && it.role === 'leave') items.push(<div key={it.key} inert className="pointer-events-none">{cardOf(it.data.e!, it.key, it.rx, it.ry)}</div>);
      else items.push(cardOf(it.data.e!, it.key, it.rx, it.ry));
    }
  } else if (loading) {
    if (loadTile && vh > 0) {
      const tileSize = `${Math.ceil(vw)}px ${Math.round(L.cardH + GAP)}px`, at = '0 0';
      items.push(
        <div key="load" aria-hidden className="absolute left-0 right-0 pointer-events-none"
          style={{ top: PAD, height: Math.max(0, vh - PAD), backgroundImage: loadTile, backgroundRepeat: 'repeat-y', backgroundSize: tileSize, backgroundPosition: at }}>
          <div className="k-snap-sweep" style={{ WebkitMaskImage: loadTile, maskImage: loadTile, WebkitMaskRepeat: 'repeat-y', maskRepeat: 'repeat-y', WebkitMaskSize: tileSize, maskSize: tileSize, WebkitMaskPosition: at, maskPosition: at }} />
        </div>,
      );
    }
  } else {
    for (let ri = range[0]; ri <= range[1] && ri < L.rows.length; ri++) {
      const row = L.rows[ri];
      if (patterns.length) items.push(band(ri));
      if (row.kind === 'title') {
        const tk = 't@' + sections[row.section].id;
        items.push(
          <div key={tk} ref={regTitle(tk)} className="absolute flex items-end gap-2 pb-2.5" style={{ left: PAD, right: PAD, top: row.top, height: row.h }}>
            <span className="k-subhead">{row.title}</span>
            {variant === 'hub' && <span className="k-count">{sections[row.section].entries.length}</span>}
          </div>,
        );
        continue;
      }
      if (st.fast && !fullRows.current.has(ri)) {
        for (let c = 0; c < row.count; c++) items.push(<CardSkeleton key={'k' + ri + '_' + c} x={PAD + c * (L.cardW + GAP)} y={row.top} w={L.cardW} heroH={L.heroH} h={L.cardH} heroTop={L.heroTop} />);
        continue;
      }
      fullRows.current.add(ri);
      const s = sections[row.section];
      for (let c = 0; c < row.count; c++) {
        const e = s.entries[row.start + c];
        items.push(cardOf(e, e.key + '@' + s.id, PAD + c * (L.cardW + GAP), row.top));
      }
    }
  }

  const noResults = !loading && L.rows.length === 0;
  return (
    <div ref={vpRef} onPointerDown={onVpDown} className="relative flex-1 min-w-0 min-h-0 overflow-hidden" style={{ touchAction: 'none' }} role="grid" aria-busy={loading}>
      <div ref={contentRef} className="absolute left-0 top-0 right-0 will-change-transform" style={{ height: 0 }}>
        {patterns}
        {items}
      </div>
      <Fade when={noResults} delay={FOLD_FADE_MS} className="absolute inset-0 grid place-items-center px-8">{empty}</Fade>
      <div ref={trackRef} onPointerDown={onTrackDown} className="absolute right-px top-1.5 bottom-1.5 w-2.5 z-[2]">
        <div
          ref={thumbRef}
          onPointerDown={onThumbDown}
          className="absolute left-0.5 right-0.5 top-0 rounded-full bg-[var(--scrollbar-thumb)] hover:bg-[var(--scrollbar-hover)] transition-colors cursor-default"
          style={{ height: 36 }}
        />
      </div>
    </div>
  );
});
LibraryGrid.displayName = 'LibraryGrid';
