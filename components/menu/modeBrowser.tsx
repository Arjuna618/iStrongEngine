import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, SearchX } from '../ui/icons';
import type { GameModeInfo, PlayCategoryId } from '../../game/gameModeRegistry';
import { modeCardPictures, modeCardUrl, modeCardAspect } from './modeCardPictures';
import { layoutRows } from '../maps/mapCatalog';
import { useGameDark } from '../../utils/useGameTheme';
import { useSwapStage } from '../kit/motion';
import { SwapInPlace, SwapText } from '../kit/Collapse';
import { PickRow, SearchField, Segmented, emptyArt } from '../kit/kit';
import { TabSlide } from '../kit/TabSlide';
import { useRowWindow } from '../kit/LongList';

export type SortId = 'top' | 'name';
export const ALL_ID = 'all';

export const modeSearchWords = (title: string, info: { short: string; description: string; goal?: string }, tags: readonly string[]): string =>
  [title, info.short, info.description, info.goal, ...tags].join(' ').toLowerCase();

export interface ModeItem {
  key: string;
  title: string;
  category: PlayCategoryId;
  alsoIn?: PlayCategoryId;
  mapKey: string | null;
  info: GameModeInfo;
  tags: readonly string[];
  search: string;
  rank: number;
  inAll: boolean;
  first?: boolean;
  leadIn?: string;
}

const _artReady = new Set<string>();
export const ArtImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [loaded, setLoaded] = useState(() => {
    if (_artReady.has(src)) return true;
    const probe = new Image();
    probe.src = src;
    if (probe.complete) { _artReady.add(src); return true; }
    return false;
  });
  const ready = () => { _artReady.add(src); setLoaded(true); };
  return (
    <>
      {!loaded ? <span className="absolute inset-0 skeleton-shimmer" /> : null}
      <img
        src={src}
        alt={alt}
        draggable={false}
        ref={el => { if (el && el.complete && !loaded) ready(); }}
        onLoad={ready}
        onError={ready}
        className={loaded ? 'k-play-img' : 'k-play-img opacity-0'}
      />
    </>
  );
};

export const ModeMapPicture: React.FC<{ mapKey: string | null; alt: string }> = ({ mapKey, alt }) => {
  useSyncExternalStore(modeCardPictures.subscribe, modeCardPictures.version, modeCardPictures.version);
  const dark = useGameDark();
  const src = mapKey ? modeCardUrl(mapKey, dark) : null;
  return src ? <ArtImage key={src} src={src} alt={alt} /> : <span className="k-mode-art-empty" />;
};

export const ModeDetailsArt: React.FC<{ mapKey: string | null; alt: string; maxH?: number }> = ({ mapKey, alt, maxH }) => {
  useSyncExternalStore(modeCardPictures.subscribe, modeCardPictures.version, modeCardPictures.version);
  const a = mapKey ? modeCardAspect(mapKey) : 16 / 9;
  const box: React.CSSProperties = maxH ? { aspectRatio: String(Math.max(1, a)), width: '100%', maxWidth: Math.round(maxH * Math.max(1, a)), marginLeft: 'auto', marginRight: 'auto' } : { aspectRatio: String(Math.max(1, a)) };
  return (
    <span className="k-mode-art k-play-details-art k-mode-art-whole" style={box}>
      <ModeMapPicture mapKey={mapKey} alt={alt} />
    </span>
  );
};

export const ModeCard: React.FC<{ item: ModeItem; w: number; h: number; picked: boolean; current?: boolean; disabled?: boolean; onPick: () => void; onDouble?: () => void }> = ({ item, w, h, picked, current, disabled, onPick, onDouble }) => (
  <button id={`gm-card-${item.key}`} type="button" aria-pressed={picked} disabled={disabled}
    className={picked ? 'k-mode-card k-play-card k-mode-card-on' : 'k-mode-card k-play-card'} style={{ width: w }}
    onClick={onPick} onDoubleClick={onDouble}>
    <span className="k-mode-art k-mode-art-sized" style={{ height: h }}>
      <ModeMapPicture mapKey={item.mapKey} alt={item.title} />
      {current ? <span className="k-mode-current"><Check size={12} /> Current</span> : null}
      {picked && !current ? <span className="k-play-check" aria-hidden><Check size={13} strokeWidth={2.5} /></span> : null}
    </span>
    <span className="k-mode-text">
      <span className="k-card-title truncate">{item.title}</span>
    </span>
  </button>
);

export function useModeShelf<C extends string>(items: readonly ModeItem[], category: C, q: string, sort: SortId) {
  const gameDarkNow = useGameDark();
  const picVer = useSyncExternalStore(modeCardPictures.subscribe, modeCardPictures.version, modeCardPictures.version);
  useEffect(() => {
    for (const e of items) {
      const src = e.mapKey ? modeCardUrl(e.mapKey, gameDarkNow) : null;
      if (!src || _artReady.has(src)) continue;
      const im = new Image();
      im.onload = () => { _artReady.add(src); };
      im.src = src;
    }
  }, [items, gameDarkNow, picVer]);
  const stage = useSwapStage<string>(q !== '' ? 'search' : category);
  const searching = stage.shown === 'search';
  const lastQ = useRef(q);
  if (q) lastQ.current = q;
  const shownQ = searching ? (q || lastQ.current) : '';
  const shownCategory = (searching ? category : stage.shown) as C;
  const list = useMemo(() => {
    const l = items.filter(e => (searching ? e.search.includes(shownQ) : shownCategory === ALL_ID ? e.inAll : e.category === shownCategory || e.alsoIn === shownCategory));
    const pin = (a: ModeItem, b: ModeItem) => (b.first ? 1 : 0) - (a.first ? 1 : 0);
    const lead = (a: ModeItem, b: ModeItem) => (!searching && b.leadIn === shownCategory ? 1 : 0) - (!searching && a.leadIn === shownCategory ? 1 : 0);
    return sort === 'name' ? l.sort((a, b) => pin(a, b) || a.title.localeCompare(b.title)) : l.sort((a, b) => pin(a, b) || lead(a, b) || a.rank - b.rank);
  }, [items, searching, shownQ, shownCategory, sort]);
  return { stage, searching, shownCategory, list };
}

const ShelfEmpty: React.FC<{ onClear: () => void }> = ({ onClear }) => (
  <div className="k-hub-empty k-play-empty" role="group" aria-label="Nothing matches. Try another word.">
    <span className="k-empty-icon">{emptyArt(SearchX)}</span>
    <button type="button" className="k-hub-hint" onClick={onClear}>Clear all</button>
  </div>
);

export const ModeMain: React.FC<{
  shelf: { stage: { shown: string; swapClass: string }; searching: boolean; list: readonly ModeItem[] };
  title: string; hint?: string; sort: SortId; onSort: (s: SortId) => void; onClear: () => void; card: (item: ModeItem, w: number, h: number) => React.ReactNode;
  reveal?: string | null;
}> = ({ shelf, title, hint, sort, onSort, onClear, card, reveal }) => {
  const box = useRef<HTMLElement>(null);
  useLayoutEffect(() => { if (box.current) box.current.scrollTop = 0; }, [shelf.stage.shown]);
  return (
    <section ref={box} className={`k-play-main ${shelf.stage.swapClass}`} aria-label="Game modes">
      <div className="k-section-head">
        <span className="k-group-title">
          <span className="truncate">{title}</span>
          <span className="k-count"><SwapText key={shelf.stage.shown}>{shelf.list.length}</SwapText></span>
        </span>
        <Segmented<SortId> value={sort} onChange={onSort}
          options={[{ value: 'top', label: 'Top Picks', title: 'The best modes first, a different kind of mode each time' }, { value: 'name', label: 'By name', title: 'From A to Z' }]} />
      </div>
      {hint ? <p className="k-hint">{hint}</p> : null}
      <SwapInPlace key={shelf.stage.shown} swapKey={shelf.list.map(e => e.key).join('|')} className="k-play-shelf">
      {shelf.list.length === 0 ? <ShelfEmpty onClear={onClear} /> : <CardRows list={shelf.list} card={card} reveal={reveal} />}
      </SwapInPlace>
    </section>
  );
};

const CARD_ROW_H = 132, CARD_GAP = 12;
const CARD_FOOT_EST = 34;
const CARD_FIRST_ROWS = 4;
const CardRows: React.FC<{ list: readonly ModeItem[]; card: (item: ModeItem, w: number, h: number) => React.ReactNode; reveal?: string | null }> = ({ list, card, reveal }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const w = el.clientWidth; setWidth(old => (Math.abs(old - w) > 4 ? w : old)); };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const picVer = useSyncExternalStore(modeCardPictures.subscribe, modeCardPictures.version, modeCardPictures.version);
  const rows = useMemo(() => layoutRows(list.map(i => (i.mapKey ? modeCardAspect(i.mapKey) : 16 / 9)), width, CARD_ROW_H, CARD_GAP),
    [list, width, picVer]);
  const foot = useRef(CARD_FOOT_EST);
  const rowKey = (i: number): string => { const r = rows[i]; return `${list[r.start].key}~${r.end - r.start}~${Math.round(r.h)}`; };
  const win = useRowWindow(rows.length, rowKey, CARD_ROW_H + CARD_FOOT_EST + CARD_GAP, { first: CARD_FIRST_ROWS, estimateOf: (i) => rows[i].h + foot.current + CARD_GAP });
  useLayoutEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>(':scope > .k-play-row');
    const i = first ? Number(first.dataset.ri) : -1;
    if (first && i >= 0 && i < rows.length) { const f = first.offsetHeight - rows[i].h - CARD_GAP; if (f > 0 && f < 200) foot.current = f; }
  });
  const shownReveal = useRef(reveal);
  useLayoutEffect(() => {
    if (reveal === shownReveal.current) return;
    shownReveal.current = reveal;
    if (!reveal) return;
    const at = list.findIndex(e => e.key === reveal);
    if (at < 0) return;
    let ri = 0;
    while (ri < rows.length && rows[ri].end <= at) ri++;
    if (ri < rows.length && (ri < win.a || ri >= win.b)) win.reveal(win.keys[ri]);
  }, [reveal]);
  const setRef = (el: HTMLDivElement | null) => { ref.current = el; win.box.current = el; win.rows.current = el; };
  const space = (h: number, k: string) => (
    <div key={k} className="k-play-rows-skel" aria-hidden="true" style={{ height: h, ['--pr-row' as string]: `${CARD_ROW_H + foot.current + CARD_GAP}px` }} />
  );
  return (
    <div ref={setRef} className="k-play-rows k-play-rows-win">
      {win.above > 0 ? space(win.above, '\u0000above') : null}
      {rows.slice(win.a, win.b).map((r, j) => (
        <div key={win.keys[win.a + j]} data-ll={win.keys[win.a + j]} data-ri={win.a + j} className="k-play-row">{list.slice(r.start, r.end).map((it, k) => card(it, r.widths[k], r.h))}</div>
      ))}
      {win.below > 0 ? space(win.below, '\u0000below') : null}
    </div>
  );
};

type SideCategory = { id: string; title: string; count: number };
export const ModeSideBody: React.FC<{
  query: string; onQuery: (q: string) => void;
  lead?: readonly SideCategory[]; categories: readonly SideCategory[]; category: string; searching: boolean; onCategory: (id: string) => void;
}> = ({ query, onQuery, lead, categories, category, searching, onCategory }) => {
  const row = (c: SideCategory) => (
    <PickRow key={c.id} title={c.title} meta={`${c.count} ${c.count === 1 ? 'mode' : 'modes'}`} selected={!searching && category === c.id} onPick={() => onCategory(c.id)} />
  );
  return (
    <div className="k-play-side-scroll">
      <TabSlide pick=".k-pick-on" />
      <SearchField value={query} onChange={onQuery} placeholder="Search modes" />
      {lead && lead.length > 0 ? <div className="k-stack">{lead.map(row)}</div> : null}
      <div className="space-y-2">
        <span className="k-subhead">Arras Categories</span>
        <div className="k-stack">{categories.map(row)}</div>
      </div>
    </div>
  );
};
