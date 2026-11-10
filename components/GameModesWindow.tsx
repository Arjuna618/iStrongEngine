import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useClosing, useSwapStage } from './kit/motion';
import { SwapText } from './kit/Collapse';
import { useWindowFrame } from './kit/focusScope';
import { IconButton } from './kit/kit';
import { ThemeSwitch } from './kit/ThemeSwitch';
import { glideIntoView } from './kit/presence';
import { Joystick, X } from './ui/icons';
import { useEscapeClose } from './shared/useEscapeClose';
import { useBackdropClose } from './shared/useBackdropClose';
import { usePortalMenuScale, useFitScale } from '../utils/useMenuScale';
import { windowSize } from './library/ContentLibrary';
import { ModeDetailsArt, ModeCard, ModeMain, ModeSideBody, useModeShelf, ALL_ID, modeSearchWords, type ModeItem, type SortId } from './menu/modeBrowser';
import { SMALL_FIX } from '../game/smallFixSwitch';
import {
  ENGINE_MODE_GROUPS, PLAY_CATEGORIES, PLAY_ALL, PLAY_MODE_ENTRIES, getPlayEntry, getGameMode, entryDisplayStats, resolveEngineModeConfig, cardMapKeyOf,
  inAllCategory, type PlayCategoryId,
} from '../game/gameModeRegistry';
import { topPickRanks } from '../game/topPicks';
import { shownModeTitle } from '../game/modeWorlds';
const searchOf = (title: string, info: { short: string; description: string; goal?: string }, tags: readonly string[]): string =>
  SMALL_FIX.R886 !== 0 ? modeSearchWords(title, info, tags) : [title, info.short, info.description, ...tags].join(' ').toLowerCase();
const RANKS = topPickRanks(PLAY_MODE_ENTRIES.map(e => e.key));
const CARDS: readonly ModeItem[] = (() => {
  const out: ModeItem[] = [];
  for (const g of ENGINE_MODE_GROUPS) {
    for (const o of g.options) {
      if (o.key === 'scripted') continue;
      if (o.key === 'sandbox') {
        const info = getGameMode(o.key);
        out.push({ key: o.key, title: o.label, category: 'others', mapKey: null, info, tags: info.tags, search: searchOf(o.label, info, info.tags), rank: -1, inAll: false, first: true });
        continue;
      }
      const e = getPlayEntry(o.key);
      if (!e) continue;
      const tags = e.growth && !e.info.tags.includes('Growth') ? [...e.info.tags, 'Growth'] : e.info.tags;
      out.push({ key: e.key, title: shownModeTitle(e.title), category: e.category, alsoIn: e.alsoIn, mapKey: cardMapKeyOf(e.key), info: e.info, tags, search: searchOf(e.title, e.info, tags),
        rank: RANKS.get(e.key) ?? Number.MAX_SAFE_INTEGER, inAll: inAllCategory(e) });
    }
  }
  return out;
})();
type ShelfId = PlayCategoryId | typeof ALL_ID;
const CATEGORY_TITLE: Record<ShelfId, string> = { sandbox: 'Sandbox', all: PLAY_ALL.title, normal: 'Normal', growth: 'Growth', 'arms-race': 'Arms Race', dreadnoughts: 'Dreadnoughts', siege: 'Siege', others: 'Others' };
const CATEGORY_ORDER: readonly PlayCategoryId[] = (['normal', 'growth', 'arms-race', 'dreadnoughts', 'siege', 'others'] as const).filter(c => PLAY_CATEGORIES.some(p => p.id === c));
const CATEGORY_LINE = new Map<string, string>([...PLAY_CATEGORIES.map(c => [c.id, c.description] as const), [PLAY_ALL.id, PLAY_ALL.description]]);
const countOf = (c: ShelfId) => CARDS.filter(e => (c === ALL_ID ? e.inAll : e.category === c || e.alsoIn === c)).length;
const LEAD_CATEGORIES: { id: string; title: string; count: number }[] = [];
const SIDE_CATEGORIES = [ALL_ID, ...CATEGORY_ORDER].map(c => ({ id: c, title: CATEGORY_TITLE[c as ShelfId], count: countOf(c as ShelfId) }));

export function gameModeArt(key: string): string | null {
  return CARDS.find(c => c.key === key)?.mapKey ?? null;
}

interface Props {
  current: string;
  onPick: (key: string) => void;
  onClose: () => void;
}

export const GameModesWindow: React.FC<Props> = ({ current, onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ShelfId>(() => CARDS.find(c => c.key === current)?.category ?? 'normal');
  const [sort, setSort] = useState<SortId>('top');
  const [picked, setPicked] = useState<string>(current);
  const portalScale = usePortalMenuScale();
  const scrim = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null);
  const fit = useFitScale(card, portalScale, true);
  const { closing, close } = useClosing(onClose);
  useWindowFrame({ scrim, card, closing });
  useEscapeClose(() => { if (query) setQuery(''); else close(); }, !closing);
  const backdrop = useBackdropClose(close);
  const size = useMemo(() => windowSize(), []);

  const q = query.trim().toLowerCase();
  const shelf = useModeShelf<ShelfId>(CARDS, category, q, sort);
  const clearSearch = () => setQuery('');
  const detail = useSwapStage(picked);
  const pickedCard = CARDS.find(c => c.key === detail.shown) ?? null;
  const use = (key: string) => { close(); if (key !== current) onPick(key); };
  const stats = pickedCard ? entryDisplayStats(pickedCard.key, pickedCard.info.id) : null;
  const pickedCap = pickedCard ? (resolveEngineModeConfig(pickedCard.key).levelCap ?? 45) : 45;
  const canUse = !!pickedCard && pickedCard.key !== current && detail.shown === picked;

  const live = useRef({ list: shelf.list, picked, canUse, use });
  live.current = { list: shelf.list, picked, canUse, use };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const L = live.current;
      if (e.key === 'Enter') { if ((e.target as HTMLElement)?.tagName !== 'BUTTON' && L.canUse) { e.preventDefault(); L.use(L.picked); } return; }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (L.list.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const at = L.list.findIndex(c => c.key === L.picked);
      const next = at === -1 ? (dir === 1 ? 0 : L.list.length - 1) : (at + dir + L.list.length) % L.list.length;
      setPicked(L.list[next].key);
      glideIntoView(document.getElementById(`gm-card-${L.list[next].key}`));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return createPortal(
    <div ref={scrim} className={`modal-scrim z-[75] animate-fadeIn ${closing ? 'pointer-events-none' : ''}`} {...backdrop}>
      <div style={{ zoom: fit }} onClick={e => e.stopPropagation()}>
        <div ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Game Modes" className="k-modal k-play-window outline-none animate-scaleUp" style={{ width: size.w, height: size.h }}>
          <header className="k-modal-head k-play-head">
            <Joystick size={18} absoluteStrokeWidth className="text-[var(--text-primary)] shrink-0" />
            <h2 className="k-modal-title truncate flex-1 min-w-0">Game Modes</h2>
            <ThemeSwitch />
            <IconButton aria-label="Close" title="Close" onClick={() => close()}><X size={16} /></IconButton>
          </header>
          <div className="k-play-body">
            <aside className="k-play-side" aria-label="Categories and filters">
              <ModeSideBody query={query} onQuery={setQuery} lead={LEAD_CATEGORIES} categories={SIDE_CATEGORIES} category={category} searching={q !== ''} onCategory={c => { setCategory(c as ShelfId); setQuery(''); }} />
            </aside>
            <ModeMain shelf={shelf} title={shelf.searching ? 'Search results' : CATEGORY_TITLE[shelf.shownCategory]} hint={shelf.searching ? undefined : CATEGORY_LINE.get(shelf.shownCategory)}
              sort={sort} onSort={setSort} onClear={clearSearch}
              card={(e, w, h) => <ModeCard key={e.key} item={e} w={w} h={h} picked={picked === e.key} current={e.key === current} onPick={() => setPicked(e.key)} onDouble={() => use(e.key)} />} />
            <aside className="k-play-details" aria-label="The picked mode">
              <div className={`k-play-details-body ${detail.swapClass}`}>
                {pickedCard ? (<>
                  <ModeDetailsArt mapKey={pickedCard.mapKey} alt={pickedCard.title} />
                  <div className="space-y-1">
                    <div className="k-play-details-title">{pickedCard.title}</div>
                    {stats ? (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="k-play-tag tabular-nums">{getPlayEntry(pickedCard.key)?.sides ?? stats.teamsLabel}</span>
                        <span className="k-play-tag tabular-nums">{stats.playersLabel}</span>
                        <span className="k-play-tag tabular-nums">{`Level Cap ${pickedCap}`}</span>
                      </div>
                    ) : null}
                  </div>
                  <p className="k-row-desc">{pickedCard.info.description}</p>
                  <div className="flex flex-wrap gap-1.5">{pickedCard.tags.map(t => <span key={t} className="k-play-tag">{t}</span>)}</div>
                </>) : null}
              </div>
              <div className="k-play-details-foot">
                <button type="button" className="k-btn k-btn-primary k-btn-lg w-full" disabled={!canUse} onClick={() => { if (canUse) use(pickedCard!.key); }}>
                  <SwapText>{pickedCard?.key === current ? 'Current Mode' : 'Use This Mode'}</SwapText>
                </button>
                <p className="k-hint">Growth, level cap and teams are set in the game mode tool</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
