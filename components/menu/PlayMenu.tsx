import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { ArrowLeft, Play, Loader2, User, GameEngine } from '../ui/icons';
import { GameModeConfig, TEAM_COLORS_LIGHT, TEAM_COLORS_DARK, TEAM_NAMES, teamTableIdxFor, teamTwoGreenNow } from '../../types';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import {
  PLAY_CATEGORIES, PLAY_MODE_ENTRIES, getPlayEntry, getPlaySettingSpec,
  resolvePlayConfig, getModeDisplayStats, isTeamModeId, supportsTeamCountChoice, entryTeamCountFixed, entryTeams, entryBotsFixed,
  cardWearsTeamTwoGreen,
} from '../../game/gameModeRegistry';
import { cardMapKeyOf, PLAY_ALL, inAllCategory } from '../../game/gameModeRegistry';
import { topPickRanks } from '../../game/topPicks';
import { shownModeTitle } from '../../game/modeWorlds';
import type { PlayCategoryId, PlayModeEntry } from '../../game/gameModeRegistry';
import { useMenuScale, useModalMaxHeight, useModalMaxWidth } from '../../utils/useMenuScale';
import { isPhoneDevice, isPhoneUi, isTouchScreen } from '../../utils/device';
import { MOBILE_UI } from '../../game/mobileSwitch';
import { useSwapStage } from '../kit/motion';
import { SwapInPlace, SwapText, Fade } from '../kit/Collapse';
import { glideIntoView } from '../kit/presence';
import { IconButton, SearchField, Segmented, SliderRow, EmptyState, Button, emptyArt, RowLabel } from '../kit/kit';
import { ModeDetailsArt, ModeCard, ModeMain, ModeSideBody, useModeShelf, ALL_ID, modeSearchWords, type ModeItem, type SortId } from './modeBrowser';
import { ConfirmDialog } from '../kit/Modal';
import { askFullscreenFirst } from '../mobile/fullscreenNotice';
import { fullscreenNoticeDue } from '../../utils/fullscreen';
import { ThemeSwitch } from '../kit/ThemeSwitch';
import { AsciiFluidBackground } from './AsciiFluidBackground';
import { menuScenes, menuScenesSupported, menuSceneStatus } from '../menuScene/sceneClient';
import { PLAY_MENU_SCENE } from '../menuScene/menuSceneSwitch';

const LAST_MODE_KEY = 'istrong-last-gamemode';
const LAST_CATEGORY_KEY = 'istrong-play-category';
const SETTINGS_KEY = 'istrong-play-settings';
const TEAMS_SUFFIX = ':teams';
const PLAYER_TEAM_SUFFIX = ':playerTeam';

type ModeCategory = Exclude<PlayCategoryId, 'sandbox'> | typeof ALL_ID;

function getStoredLastKey(): string | null {
  try {
    const stored = localStorage.getItem(LAST_MODE_KEY);
    const e = stored ? getPlayEntry(stored) : null;
    if (e) return e.key;
  } catch { }
  return null;
}

function loadStoredSettings(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
        }
        return out;
      }
    }
  } catch { }
  return {};
}

const CATEGORY_ORDER: readonly ModeCategory[] = [ALL_ID, ...(['normal', 'growth', 'arms-race', 'dreadnoughts', 'siege', 'others'] as const).filter(c => PLAY_CATEGORIES.some(p => p.id === c))];
const CATEGORY_INFO = new Map<string, { title: string; description: string }>([...PLAY_CATEGORIES.map(c => [c.id, c] as const), [PLAY_ALL.id, PLAY_ALL]]);
const SANDBOX = CATEGORY_INFO.get('sandbox');

const MODE_COUNTS: Record<string, number> = {};
for (const e of PLAY_MODE_ENTRIES) {
  MODE_COUNTS[e.category] = (MODE_COUNTS[e.category] ?? 0) + 1;
  if (e.alsoIn) MODE_COUNTS[e.alsoIn] = (MODE_COUNTS[e.alsoIn] ?? 0) + 1;
  if (inAllCategory(e)) MODE_COUNTS[ALL_ID] = (MODE_COUNTS[ALL_ID] ?? 0) + 1;
}
const modeCountLabel = (n: number) => `${n} ${n === 1 ? 'mode' : 'modes'}`;

const TAGS_OF = new Map<string, readonly string[]>(PLAY_MODE_ENTRIES.map(e => [
  e.key, e.growth && !e.info.tags.includes('Growth') ? [...e.info.tags, 'Growth'] : e.info.tags,
]));
const tagsOf = (e: PlayModeEntry) => TAGS_OF.get(e.key) ?? e.info.tags;
const RANKS = topPickRanks(PLAY_MODE_ENTRIES.map(e => e.key));

const PLAY_ITEMS: readonly ModeItem[] = PLAY_MODE_ENTRIES.map(e => ({
  key: e.key, title: shownModeTitle(e.title), category: e.category, alsoIn: e.alsoIn, mapKey: cardMapKeyOf(e.key), info: e.info, tags: tagsOf(e),
  search: modeSearchWords(e.title, e.info, tagsOf(e)),
  rank: RANKS.get(e.key) ?? Number.MAX_SAFE_INTEGER, inAll: inAllCategory(e),
}));
const SIDE_CATEGORIES = CATEGORY_ORDER.map(c => ({ id: c, title: CATEGORY_INFO.get(c)?.title ?? c, count: MODE_COUNTS[c] ?? 0 }));

const NARROW_BELOW = 760;
const MEDIUM_BELOW = 1120;
const PAIR_TOP_W = 520;
const WINDOW_MAX_W = 1600;
const PLAY_TWO_PAGE_H = 520;
const PLAY_DETAILS_TWO_W = 560;
const PLAY_ART_MIN = 72;
const PLAY_FIT_FLOOR = 0.7;

function useDetailsFit(on: boolean, body: HTMLDivElement | null, artCap: number): number {
  const [artH, setArtH] = useState(artCap);
  const artRef = useRef(artCap);
  const capRef = useRef(artCap);
  useLayoutEffect(() => { capRef.current = artCap; artRef.current = artCap; setArtH(artCap); }, [artCap]);
  useLayoutEffect(() => {
    if (!on || !body) return;
    const run = () => {
      const page = body.querySelector<HTMLElement>('.k-play-details-swap');
      if (!page) return;
      page.style.zoom = '';
      const cs = getComputedStyle(body);
      const avail = body.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      if (avail <= 0) return;
      let partsBottom = 0, opts: HTMLElement | null = null;
      for (const c of Array.from(page.children) as HTMLElement[]) {
        if (c.classList.contains('k-play-opts')) { opts = c; continue; }
        const top = c.offsetParent === page ? c.offsetTop : c.offsetTop - page.offsetTop;
        partsBottom = Math.max(partsBottom, top + c.offsetHeight);
      }
      const optsH = opts ? opts.offsetHeight : 0;
      const twoCol = !!opts && (opts.offsetParent === page ? opts.offsetLeft : opts.offsetLeft - page.offsetLeft) > page.offsetWidth * 0.4;
      const artColNeed = twoCol ? partsBottom : partsBottom + optsH;
      const need = twoCol ? Math.max(partsBottom, optsH) : partsBottom + optsH;
      const art = page.querySelector<HTMLElement>('.k-mode-art');
      if (art) {
        const target = Math.round(Math.max(PLAY_ART_MIN, Math.min(capRef.current, art.offsetHeight + avail - artColNeed)));
        if (Math.abs(target - artRef.current) > 2) { artRef.current = target; setArtH(target); return; }
      }
      page.style.zoom = need > avail + 1 ? String(Math.max(PLAY_FIT_FLOOR, avail / need)) : '';
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(body);
    const page = body.querySelector('.k-play-details-swap');
    if (page) ro.observe(page);
    return () => { ro.disconnect(); const pg = body.querySelector<HTMLElement>('.k-play-details-swap'); if (pg) pg.style.zoom = ''; };
  }, [on, body]);
  return artH;
}

interface Props {
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  playerNameMax: number;
  onBack: () => void;
  onPlayMode: (config: GameModeConfig) => void;
  onSandbox: () => void;
  launching: boolean;
  isDark: boolean;
  keysSuspended?: boolean;
}

export const PlayMenu: React.FC<Props> = ({
  playerName, onPlayerNameChange, playerNameMax,
  onBack, onPlayMode, onSandbox, launching, isDark, keysSuspended = false,
}) => {
  const scenesOff = useSyncExternalStore(menuSceneStatus.subscribe, menuSceneStatus.get) === 'off';
  const still = PLAY_MENU_SCENE.ON !== 0 && !scenesOff && menuScenesSupported();
  useEffect(() => {
    if (!still) return;
    menuScenes.showStill();
    return () => menuScenes.hideStill();
  }, [still]);
  const menuScale = useMenuScale();
  const scale = MOBILE_UI === 0 && isPhoneDevice() ? Math.min(menuScale, 1) : menuScale;
  const k = scale > 0 ? menuScale / scale : 1;
  const full = isPhoneUi();
  const touch = isTouchScreen();
  const maxW = useModalMaxWidth(full ? 0 : undefined) * k;
  const maxH = useModalMaxHeight(full ? 0 : undefined) * k;
  const winW = Math.min(WINDOW_MAX_W, maxW);
  const narrow = winW < NARROW_BELOW || (touch && maxH < PLAY_TWO_PAGE_H);
  const detailsTwo = touch && narrow && winW >= PLAY_DETAILS_TWO_W && winW > maxH;
  const [detailsBody, setDetailsBody] = useState<HTMLDivElement | null>(null);
  const artFitH = useDetailsFit(touch, detailsBody, Math.round(maxH * 0.42));
  const medium = !narrow && winW < MEDIUM_BELOW;
  const layStage = useSwapStage<'narrow' | 'medium' | 'wide'>(narrow ? 'narrow' : medium ? 'medium' : 'wide');
  const shownLay = layStage.shown;

  const [nameDraft, setNameDraft] = useState(playerName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(() => getStoredLastKey() ?? PLAY_MODE_ENTRIES.find(e => e.category === 'normal')?.key ?? null);
  const [category, setCategory] = useState<ModeCategory>(() => {
    try {
      const c = localStorage.getItem(LAST_CATEGORY_KEY);
      if (c && (CATEGORY_ORDER as readonly string[]).includes(c)) return c as ModeCategory;
    } catch { }
    return ALL_ID;
  });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('top');
  const [settings, setSettings] = useState<Record<string, number>>(loadStoredSettings);
  const [detailsPage, setDetailsPage] = useState(false);
  const [showEngineConfirm, setShowEngineConfirm] = useState(false);

  const q = query.trim().toLowerCase();
  const searching = q !== '';

  const selectEntry = useCallback((key: string) => {
    if (launching) return;
    setSelectedKey(key);
    try { localStorage.setItem(LAST_MODE_KEY, key); } catch { }
  }, [launching]);

  const pickCategory = useCallback((c: ModeCategory) => {
    if (launching) return;
    setCategory(c);
    setQuery('');
    try { localStorage.setItem(LAST_CATEGORY_KEY, c); } catch { }
  }, [launching]);

  const clearSearch = () => setQuery('');

  const cancelNameRef = useRef(false);
  const commitName = useCallback(() => {
    if (cancelNameRef.current) { cancelNameRef.current = false; return; }
    onPlayerNameChange(nameDraft);
  }, [nameDraft, onPlayerNameChange]);

  useEffect(() => {
    if (document.activeElement !== nameInputRef.current) setNameDraft(playerName);
  }, [playerName]);

  const setSettingValue = useCallback((key: string, v: number) => {
    setSettings(prev => {
      const next = { ...prev, [key]: v };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { }
      return next;
    });
  }, []);

  const shelf = useModeShelf<ModeCategory>(PLAY_ITEMS, category, q, sort);
  const shownSearching = shelf.searching, shownCategory = shelf.shownCategory, shownList = shelf.list;

  const selectedEntry = selectedKey ? getPlayEntry(selectedKey) ?? null : null;

  const isTeamMode = !!selectedEntry && isTeamModeId(selectedEntry.baseId) && !selectedEntry.preset;
  const canPickTeamCount = !!selectedEntry && !selectedEntry.preset && supportsTeamCountChoice(selectedEntry.baseId) && !entryTeamCountFixed(selectedEntry);
  const presetTeams = selectedEntry ? entryTeams(selectedEntry) : 2;
  const teamCount = (canPickTeamCount && selectedEntry
    ? (settings[selectedEntry.key + TEAMS_SUFFIX] ?? presetTeams)
    : presetTeams);
  const rawPlayerTeam = selectedEntry ? (settings[selectedEntry.key + PLAYER_TEAM_SUFFIX] ?? 1) : 1;
  const playerTeam = Math.min(Math.max(1, rawPlayerTeam), teamCount);
  const cardGreen = SMALL_FIX.R936 !== 0 && selectedEntry !== null ? cardWearsTeamTwoGreen(selectedEntry, teamCount) : teamTwoGreenNow();
  const teamAt = (i: number): number => teamTableIdxFor(i, cardGreen);

  const settingSpec = selectedEntry && !entryBotsFixed(selectedEntry) ? getPlaySettingSpec(selectedEntry, teamCount) : null;
  const settingValue = selectedEntry && settingSpec
    ? Math.min(settings[selectedEntry.key] ?? settingSpec.defaultValue, settingSpec.max)
    : 0;

  const handlePlay = useCallback(() => {
    if (!selectedEntry || launching) return;
    if (fullscreenNoticeDue()) { askFullscreenFirst(); return; }
    const spec = getPlaySettingSpec(selectedEntry, teamCount);
    onPlayMode(resolvePlayConfig(
      selectedEntry,
      settings[selectedEntry.key] ?? spec.defaultValue,
      { teams: teamCount, playerTeam },
    ));
  }, [selectedEntry, launching, settings, onPlayMode, teamCount, playerTeam]);

  const openSandbox = useCallback(() => {
    if (launching) return;
    if (isPhoneDevice()) { onSandbox(); return; }
    setShowEngineConfirm(true);
  }, [launching, onSandbox]);

  const goBack = useCallback(() => {
    if (narrow && detailsPage) { setDetailsPage(false); return; }
    onBack();
  }, [narrow, detailsPage, onBack]);

  const handleNameKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onPlayerNameChange(nameDraft);
      e.currentTarget.blur();
      handlePlay();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setNameDraft(playerName);
      cancelNameRef.current = true;
      e.currentTarget.blur();
      cancelNameRef.current = false;
    }
  }, [nameDraft, playerName, onPlayerNameChange, handlePlay]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (launching || showEngineConfirm || keysSuspended) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (query) { setQuery(''); return; }
        goBack();
        return;
      }
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Enter') {
        if (selectedEntry) { e.preventDefault(); handlePlay(); }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (shownList.length === 0) return;
        e.preventDefault();
        const dir = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
        const idx = selectedKey ? shownList.findIndex(en => en.key === selectedKey) : -1;
        const next = idx === -1 ? (dir === 1 ? 0 : shownList.length - 1) : (idx + dir + shownList.length) % shownList.length;
        selectEntry(shownList[next].key);
        glideIntoView(document.getElementById(`gm-card-${shownList[next].key}`));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [launching, showEngineConfirm, keysSuspended, query, goBack, selectedEntry, handlePlay, shownList, selectedKey, selectEntry]);

  const onCard = (e: ModeItem) => {
    selectEntry(e.key);
    if (narrow) setDetailsPage(true);
  };

  const launchMeta = ((): [string, string] | null => {
    if (!selectedEntry) return null;
    if (isTeamMode) return teamCount === 1 ? ['1 Team', `${settingValue} Bots`] : [`${teamCount} Teams`, `${settingValue} Bots each`];
    const stats = getModeDisplayStats(selectedEntry.baseId);
    const teams = selectedEntry.sides ?? (stats.teamsLabel === 'No Teams' ? 'Solo' : stats.teamsLabel);
    return [teams, `${settingValue} Bots`];
  })();

  const nameField = (
    <label className="k-play-name">
      <User size={14} className="k-play-name-icon" />
      <input
        ref={nameInputRef}
        type="text"
        value={nameDraft}
        onChange={e => setNameDraft(e.target.value)}
        onBlur={commitName}
        onKeyDown={handleNameKey}
        maxLength={playerNameMax}
        spellCheck={false}
        autoComplete="off"
        placeholder="Your name"
        aria-label="Your name"
        data-sheet-enter="away"
        disabled={launching}
        className="k-field k-play-name-input"
      />
    </label>
  );
  const nameInList = touch && narrow;
  const header = (
    <header className="k-modal-head k-play-head">
      <IconButton label={narrow && detailsPage ? 'Back to the modes' : 'Back to Main Menu'} onClick={goBack} disabled={launching}>
        <ArrowLeft size={18} />
      </IconButton>
      <h1 className="k-modal-title truncate flex-1 min-w-0"><SwapText className="truncate">{narrow && detailsPage && selectedEntry ? shownModeTitle(selectedEntry.title) : 'Play Game'}</SwapText></h1>
      {nameInList ? null : nameField}
      <ThemeSwitch />
    </header>
  );

  const sandboxDoor = SANDBOX ? (
    <div className="k-play-sandbox">
      <Button block icon={<GameEngine size={14} />} onClick={openSandbox} disabled={launching}>To Sandbox</Button>
    </div>
  ) : null;

  const sidebar = (
    <aside className="k-play-side" aria-label="Categories and filters">
      <ModeSideBody query={query} onQuery={setQuery} categories={SIDE_CATEGORIES} category={category} searching={searching} onCategory={c => pickCategory(c as ModeCategory)} />
      {sandboxDoor}
    </aside>
  );

  const catsRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const on = el.querySelector<HTMLElement>('.k-seg-on');
    if (on) el.scrollLeft = Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2);
  }, []);
  const catOptions = CATEGORY_ORDER.map(c => ({ value: c, label: CATEGORY_INFO.get(c)?.title ?? c, title: modeCountLabel(MODE_COUNTS[c] ?? 0) }));
  const narrowTop = (
    <div className="k-play-narrow-top">
      {nameInList && winW >= PAIR_TOP_W ? (
        <div className="k-play-pair">{nameField}<SearchField value={query} onChange={setQuery} placeholder="Search modes" /></div>
      ) : (<>
        {nameInList ? <div className="k-play-name-row">{nameField}</div> : null}
        <SearchField value={query} onChange={setQuery} placeholder="Search modes" />
      </>)}
      {touch ? (
        <div className="k-play-cats" ref={catsRef}>
          <Segmented<ModeCategory> value={category} onChange={pickCategory} options={catOptions} />
        </div>
      ) : (
        <Segmented<ModeCategory> value={category} onChange={pickCategory} block options={catOptions} />
      )}
    </div>
  );

  const card = (e: ModeItem, w: number, h: number) => (
    <ModeCard key={e.key} item={e} w={w} h={h} picked={selectedKey === e.key} disabled={launching} onPick={() => onCard(e)} onDouble={narrow ? undefined : handlePlay} />
  );

  const middle = (
    <ModeMain shelf={shelf} title={shownSearching ? 'Search results' : (CATEGORY_INFO.get(shownCategory)?.title ?? '')} hint={shownSearching ? undefined : CATEGORY_INFO.get(shownCategory)?.description}
      sort={sort} onSort={setSort} onClear={clearSearch} card={card} />
  );

  const modeInfo = (e: PlayModeEntry) => (<>
      <ModeDetailsArt mapKey={cardMapKeyOf(e.key)} alt={shownModeTitle(e.title)} maxH={touch ? artFitH : undefined} />
      <div className="space-y-1">
        <div className="k-play-details-title">{shownModeTitle(e.title)}</div>
        {launchMeta && (
          <div className="flex flex-wrap gap-1.5">
            <span className="k-play-tag tabular-nums">{launchMeta[0]}</span>
            <span className="k-play-tag tabular-nums">{launchMeta[1]}</span>
          </div>
        )}
      </div>
      <p className="k-row-desc">{e.info.description}</p>
      <div className="flex flex-wrap gap-1.5">{tagsOf(e).map(t => <span key={t} className="k-play-tag">{t}</span>)}</div>
  </>);

  const details = (
    <aside className={detailsTwo ? 'k-play-details k-play-details-two' : 'k-play-details'} aria-label="The picked mode">
      <div ref={setDetailsBody} className="k-play-details-body k-play-details-fill">
        <SwapInPlace swapKey={selectedKey ?? ''} className="k-play-details-swap">
        {selectedEntry ? (<>
          {detailsTwo ? <div className="k-play-two-left">{modeInfo(selectedEntry)}</div> : modeInfo(selectedEntry)}
          {(canPickTeamCount || isTeamMode || settingSpec) && (
            <div className="k-play-opts"><div className="k-group">
              <div className="k-group-body k-play-settings">
                {canPickTeamCount && (
                  <div className="k-row">
                    <RowLabel label="Teams" help="How many teams the game has." />
                    <Segmented<string> value={String(teamCount)} disabled={launching}
                      onChange={v => setSettingValue(selectedEntry.key + TEAMS_SUFFIX, Number(v))}
                      options={[2, 3, 4].map(n => ({ value: String(n), label: String(n), title: `${n} teams` }))} />
                  </div>
                )}
                {isTeamMode && (
                  <div className={teamCount > 3 ? 'k-slider-row k-play-teams-grid' : 'k-slider-row'}>
                    <div className="k-row"><RowLabel label="Your Team" help="Which team you play on." /></div>
                    <Segmented<string> value={String(playerTeam)} disabled={launching} block
                      onChange={v => setSettingValue(selectedEntry.key + PLAYER_TEAM_SUFFIX, Number(v))}
                      options={Array.from({ length: teamCount }, (_, i) => i + 1).map(n => ({
                        value: String(n), title: `${TEAM_NAMES[teamAt(n - 1)]} Team`,
                        label: <span className="k-play-team"><span className="k-play-team-dot" style={{ backgroundColor: (isDark ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT)[teamAt(n - 1)] }} />{TEAM_NAMES[teamAt(n - 1)]}</span>,
                      }))} />
                  </div>
                )}
                {settingSpec && (
                  <SliderRow label={settingSpec.label} help={settingSpec.kind === 'perTeam' ? 'How many bots each team has.' : selectedEntry.preset && isTeamModeId(selectedEntry.baseId) ? 'How many bots fight on your team.' : 'How many bots join the game.'} value={settingValue} min={settingSpec.min} max={settingSpec.max} step={1}
                    disabled={launching} display={String(settingValue)}
                    onChange={v => setSettingValue(selectedEntry.key, Math.round(v))} />
                )}
              </div>
            </div></div>
          )}
        </>) : (
          <EmptyState icon={emptyArt(Play)} title="Pick a mode to play" />
        )}
        </SwapInPlace>
      </div>
      <div className="k-play-details-foot">
        <button type="button" className="k-btn k-btn-primary k-btn-lg w-full" onClick={handlePlay} disabled={!selectedEntry || launching}>
          <SwapInPlace swapKey={launching} hold={false} className="k-swap-text"><span className="inline-flex items-center gap-2">{launching ? <><Loader2 size={17} className="animate-spin" /> Starting</> : <><Play size={17} fill="currentColor" /> Play</>}</span></SwapInPlace>
        </button>
        <Fade when={launching}><span className="k-play-progress" aria-hidden /></Fade>
      </div>
    </aside>
  );

  return (
    <div className={`${still ? 'k-play-root-still ' : ''}fixed inset-0 z-40 bg-[var(--surface-canvas)] flex items-center justify-center select-none`}>
      {!still && <AsciiFluidBackground isDark={isDark} />}
      <div className="relative" style={{ zoom: scale }}>
        <div className={`k-modal k-play-window animate-scaleUp${shownLay === 'narrow' ? ' k-play-narrow' : ''}${full ? ' k-play-full' : ''}${touch ? ' k-play-touch' : ''}`}
          style={{ width: winW, height: maxH }}>
          {header}
          {shownLay === 'narrow' ? (
            <div className={`flex flex-col flex-1 min-h-0 ${layStage.swapClass}`} inert={layStage.inert || undefined}>
            <NarrowBody detailsPage={detailsPage && !!selectedEntry} list={<div className="k-play-narrow-list">{narrowTop}{middle}{sandboxDoor}</div>} details={details} />
            </div>
          ) : shownLay === 'medium' ? (
            <div className={`k-play-body k-play-medium ${layStage.swapClass}`} inert={layStage.inert || undefined}>
              <div className="k-play-medium-main">{narrowTop}{middle}{sandboxDoor}</div>
              {details}
            </div>
          ) : (
            <div className={`k-play-body ${layStage.swapClass}`} inert={layStage.inert || undefined}>
              {sidebar}
              {middle}
              {details}
            </div>
          )}
        </div>
      </div>

      {showEngineConfirm && (
        <ConfirmDialog title="Open the Game Engine?" icon={<GameEngine size={18} />}
          message="Set up your own rules, map and bots there."
          confirmLabel="Open Game Engine" onConfirm={onSandbox} onClose={() => setShowEngineConfirm(false)} />
      )}
    </div>
  );
};

const NarrowBody: React.FC<{ detailsPage: boolean; list: React.ReactNode; details: React.ReactNode }> = ({ detailsPage, list, details }) => {
  const view = useSwapStage(detailsPage ? 'details' : 'list');
  return <div className={`k-play-narrow-body ${view.swapClass}`}>{view.shown === 'details' ? details : list}</div>;
};
