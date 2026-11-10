import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, SearchX } from '../ui/icons';
import type { GameModeInfo, PlayCategoryId } from '../../game/gameModeRegistry';
import { modeCardPictures, modeCardUrl, modeCardAspect } from './modeCardPictures';
import { layoutRows } from '../maps/mapCatalog';
import { useGameDark } from '../../utils/useGameTheme';
import { useSwapStage } from '../kit/motion';
import { SwapInPlace, SwapText } from '../kit/Collapse';
import { PickRow, SearchField, Segmented, emptyArt } from '../kit/kit';

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
    return sort === 'name' ? l.sort((a, b) => pin(a, b) || a.title.localeCompare(b.title)) : l.sort((a, b) => pin(a, b) || a.rank - b.rank);
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
}> = ({ shelf, title, hint, sort, onSort, onClear, card }) => {
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
      {shelf.list.length === 0 ? <ShelfEmpty onClear={onClear} /> : <CardRows list={shelf.list} card={card} />}
      </SwapInPlace>
    </section>
  );
};

const CARD_ROW_H = 132, CARD_GAP = 12;
const CardRows: React.FC<{ list: readonly ModeItem[]; card: (item: ModeItem, w: number, h: number) => React.ReactNode }> = ({ list, card }) => {
  const ref = useRef<HTMLDivElement>(null);
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
  return (
    <div ref={ref} className="k-play-rows">
      {rows.map(r => (
        <div key={r.start} className="k-play-row">{list.slice(r.start, r.end).map((it, j) => card(it, r.widths[j], r.h))}</div>
      ))}
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
      <SearchField value={query} onChange={onQuery} placeholder="Search modes" />
      {lead && lead.length > 0 ? <div className="k-stack">{lead.map(row)}</div> : null}
      <div className="space-y-2">
        <span className="k-subhead">Arras Categories</span>
        <div className="k-stack">{categories.map(row)}</div>
      </div>
    </div>
  );
};
