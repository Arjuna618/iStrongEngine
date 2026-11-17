import React, { useCallback, useMemo, useRef, useState } from 'react';
import { GameLogic, DEBUG_SKILL_POINTS_MAX } from '../game/GameLogic';
import type { EditStatsPreview } from '../game/GameLogic';
import { ContentLibrary } from './library/ContentLibrary';
import type { LibAction, LibMode } from './library/libraryModes';
import type { LibEntry, LibKind } from './library/catalog';
import { spawnerSpawn, spawnerTotals } from './library/spawnerSpawn';
import {
  otherKindOf, defaultSpawnTeam, SPAWN_DIST_MIN, SPAWN_DIST_MAX, SPAWN_DIST_START, SPAWN_WALL_CELLS_MAX,
  type SpawnKind, type SpawnTankChoices,
} from '../game/spawnTool';
import { boxesOf, noTypedEdits, typeLevel, typeSkillPoints, typeStat, type EditStatsTyped } from './shared/editStatsBoxes';
import { Stepper, StatBar, STAT_ORDER, VALUE_BOX, STAT_BOX } from './EditPlayerStatsPopup';
import { NumberInput } from './shared/uiHelpers';
import { HelpTooltip } from './shared/HelpTooltip';
import { SelectRow, ToggleRow, SliderRow, RowLabel } from './kit/kit';
import { SwapInPlace, MotionRow } from './kit/Collapse';
import { TEXT_LIMITS } from './kit/textLimits';
import type { SelectOption } from './shared/CustomSelect';
import { getStatLabel, TEAM_COLORS_DARK, TEAM_COLORS_LIGHT, TEAM_NAMES, TEAM_IDX_NEUTRAL, TEAM_IDX_ROGUES, TEAM_IDX_DREAD } from '../types';
import type { OtherDesign, StatNamesType, TankConfig, UpgradeStat } from '../types';
import { SHAPE_HEAD, OTHER_HEAD } from '../game/mapEvents/thingWord';
import { isGameDark } from '../utils/gameColors';
import { isTouchScreen } from '../utils/device';
import { Crosshair, Minus, Plus } from './ui/icons';

interface Props {
  logic: GameLogic;
  onClose: () => void;
}

interface Choices {
  team: string;
  aiOn: boolean;
  respawn: boolean;
  count: number;
  dist: number;
  cells: number;
  typed: EditStatsTyped;
  xp?: number;
}

function kindOf(e: LibEntry): { kind: SpawnKind; word: string } {
  if (e.kind === 'tank') return { kind: 'tank', word: '' };
  if (e.kind === 'shape' && e.shape) return { kind: 'shape', word: SHAPE_HEAD + e.shape.id };
  const d = e.item ? (e.item.fileData.data as OtherDesign) : null;
  return { kind: d ? otherKindOf(d.otherId) : 'prop', word: e.item ? OTHER_HEAD + e.item.id : '' };
}
const isBossCard = (e: LibEntry): boolean => e.collection === 'bosses' || e.collection === 'celestials' || e.collection === 'sentries' || e.collection === 'sentinels';
const isBatchKind = (k: LibKind): boolean => k === 'shape' || k === 'sentry';

function teamSwatch(name: string): string | undefined {
  const cols = isGameDark() ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;
  const k = TEAM_NAMES.indexOf(name);
  if (k >= 0) return cols[k];
  if (name === 'Neutral') return cols[TEAM_IDX_NEUTRAL];
  if (name === 'Rogues') return cols[TEAM_IDX_ROGUES];
  if (name === 'Dreadnoughts') return cols[TEAM_IDX_DREAD];
  return undefined;
}
const teamLabel = (name: string): string => (name === 'FFA' ? 'Free For All' : name);

const COUNT_MAX = 999;

function formatXp(xp: number): string {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(xp % 1_000_000 === 0 ? 0 : 1)}M`;
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(xp % 1_000 === 0 ? 0 : 1)}K`;
  return String(xp);
}

const CountStepper: React.FC<{ value: number; onChange: (v: number) => void; big?: boolean }> = ({ value, onChange, big }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const caretToEnd = (el: HTMLInputElement) => { if (value === 0) { const n = el.value.length; el.setSelectionRange(n, n); } };
  return (
    <div className={`k-stepper${big ? ' k-stepper-big' : ''}${value > 0 ? ' k-stepper-on' : ''}`} onClick={stop} onDoubleClick={stop}>
      <button type="button" aria-label="One less" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))} className="k-stepper-btn">
        <Minus size={big ? 14 : 12} />
      </button>
      <input
        type="text" inputMode="numeric" maxLength={TEXT_LIMITS.NUMBER} aria-label="How many" value={String(value)}
        onChange={(e) => onChange(Math.max(0, Math.min(COUNT_MAX, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)))}
        onFocus={(e) => caretToEnd(e.currentTarget)} onMouseUp={(e) => caretToEnd(e.currentTarget)}
        className="k-stepper-input"
      />
      <button type="button" aria-label="One more" disabled={value >= COUNT_MAX} onClick={() => onChange(Math.min(COUNT_MAX, value + 1))} className="k-stepper-btn">
        <Plus size={big ? 14 : 12} />
      </button>
    </div>
  );
};

export const TankSpawnerPopup: React.FC<Props> = ({ logic, onClose }) => {
  const [choices, setChoices] = useState<Map<string, Choices>>(() => new Map());
  const choicesRef = useRef(choices);
  choicesRef.current = choices;
  const teams = useMemo(() => logic.spawnerTeams(), [logic]);
  const playerTeam = useMemo(() => logic.spawnerPlayerTeam(), [logic]);
  const teamOptions = useMemo<SelectOption[]>(() => teams.map(([n]) => ({ value: n, label: teamLabel(n), swatch: teamSwatch(n) })), [teams]);

  const defaultsOf = useCallback((e: LibEntry): Choices => ({
    team: defaultSpawnTeam(e.collection, e.group, e.name, teams, playerTeam),
    aiOn: true, respawn: false, count: 1, dist: SPAWN_DIST_START, cells: 1, typed: noTypedEdits(),
  }), [teams, playerTeam]);
  const choicesOf = useCallback((e: LibEntry): Choices => choicesRef.current.get(e.key) ?? defaultsOf(e), [defaultsOf]);
  const put = useCallback((e: LibEntry, patch: Partial<Choices>) => {
    setChoices(prev => {
      const next = new Map(prev);
      next.set(e.key, { ...(prev.get(e.key) ?? defaultsOf(e)), ...patch });
      return next;
    });
  }, [defaultsOf]);

  const [counts, setCounts] = useState<Map<string, number>>(() => new Map());
  const [entryOf] = useState(() => new Map<string, LibEntry>());
  const setCount = useCallback((e: LibEntry, v: number) => {
    entryOf.set(e.key, e);
    setCounts(prev => {
      const next = new Map(prev);
      if (v > 0) next.set(e.key, v); else next.delete(e.key);
      return next;
    });
  }, [entryOf]);
  const addOne = useCallback((e: LibEntry) => {
    entryOf.set(e.key, e);
    setCounts(prev => {
      const next = new Map(prev);
      next.set(e.key, Math.min(COUNT_MAX, (prev.get(e.key) ?? 0) + 1));
      return next;
    });
  }, [entryOf]);

  const _shapeBudget = logic.playerAreaShapeBudget();
  const sentryCount = logic.countActiveSentries();
  const sentinelCount = logic.countActiveSentinels();
  const sentryCap = logic.sentryBudget('sentry');
  const sentinelCap = logic.sentryBudget('sentinel');
  const totals = useMemo(() => spawnerTotals(logic, counts, k => entryOf.get(k)), [logic, counts, entryOf]);
  const effectiveTotal = totals.effective;
  const totalSelected = totals.total;
  const handleSpawnAll = (close: () => void) => {
    if (effectiveTotal <= 0) return;
    const sentries = [...entryOf.values()].filter(e => e.kind === 'sentry').sort((a, b) => a.order - b.order);
    spawnerSpawn(logic, counts, k => entryOf.get(k), sentries);
    close();
  };
  const cap = (label: string, n: number, max: number) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[12px] text-[var(--text-tertiary)]">{label}</span>
      <span className={`text-[12px] [font-weight:var(--fw-control)] tabular-nums ${n >= max ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{n}/{max}</span>
    </div>
  );
  const caps = (
    <>
      {cap('Food', _shapeBudget.food, _shapeBudget.foodCap)}
      <span className="w-px h-4 bg-[var(--alpha-divider)]" />
      {cap('Crashers', _shapeBudget.crashers, _shapeBudget.crasherCap)}
      <span className="w-px h-4 bg-[var(--alpha-divider)]" />
      {cap('Sentries', sentryCount, sentryCap)}
      <span className="w-px h-4 bg-[var(--alpha-divider)]" />
      {cap('Sentinels', sentinelCount, sentinelCap)}
    </>
  );
  const statsOf = (e: LibEntry): [string, string] | null => {
    if (e.kind === 'shape' && e.shape) {
      const ps = logic.shapeSpawnPreviewStats(e.shape);
      return [String(Math.round(ps.hp)), formatXp(ps.xpValue)];
    }
    if (e.kind === 'sentry' && e.sentry) return [String(e.sentry.hp), formatXp(e.sentry.xp)];
    return null;
  };

  const previews = useRef(new Map<string, EditStatsPreview | null>());
  const previewOf = useCallback((e: LibEntry): EditStatsPreview | null => {
    if (e.kind !== 'tank' || !e.item) return null;
    if (!previews.current.has(e.item.id)) previews.current.set(e.item.id, logic.spawnerStatsPreview(e.item.id));
    return previews.current.get(e.item.id) ?? null;
  }, [logic]);

  const tankChoices = useCallback((e: LibEntry): SpawnTankChoices | null => {
    const p = previewOf(e);
    if (!p) return null;
    const c = choicesOf(e);
    const b = boxesOf(p, c.typed, logic.state.gameModeConfig);
    return { team: c.team, aiOn: c.aiOn, respawn: c.respawn, count: c.count, dist: c.dist, level: b.level,
      xp: c.xp ?? logic.spawnerXpOfLevel(b.level), skillPoints: b.skillPoints, upgrades: b.upgrades };
  }, [choicesOf, previewOf, logic]);

  const toGame = useCallback(() => {
    logic.updateState({ isDebugMenuOpen: false });
    if (logic.state.paused) logic.setPaused(false);
  }, [logic]);

  const spawnNow = useCallback((e: LibEntry): boolean => {
    const { kind, word } = kindOf(e);
    if (kind === 'tank') {
      const tc = tankChoices(e);
      if (!tc || !e.item) return false;
      if (logic.spawnerSpawnTanks(e.item.id, isBossCard(e), tc) <= 0) return false;
    } else {
      const c = choicesOf(e);
      if (!logic.spawnerSpawnThing(word, kind, { dist: c.dist, cells: c.cells, team: '' })) return false;
    }
    toGame();
    return true;
  }, [logic, tankChoices, choicesOf, toGame]);

  const spawnOnCursor = useCallback((e: LibEntry): boolean => {
    const { kind, word } = kindOf(e);
    const touch = isTouchScreen();
    if (kind === 'tank') {
      const tc = tankChoices(e);
      if (!tc || !e.item) return false;
      return logic.spawnerHoldTank(e.item.id, { ...tc, count: 1 }, touch);
    }
    const c = choicesOf(e);
    return logic.spawnerHoldThing(word, kind, e.name, { dist: c.dist, cells: c.cells, team: '' }, touch);
  }, [logic, tankChoices, choicesOf]);

  const actionsOf = useCallback((e: LibEntry): LibAction[] => {
    const more: LibAction = { id: 'more', label: 'Add One', icon: Plus, run: () => { addOne(e); return false; } };
    if (e.kind === 'sentry') return [more];
    const cursor: LibAction = { id: 'cursor', label: 'Spawn On Cursor', icon: Crosshair, run: () => spawnOnCursor(e) };
    if (e.kind === 'shape') return [more, cursor];
    return [{ id: 'spawn', label: 'Spawn', icon: Plus, run: () => spawnNow(e) }, cursor];
  }, [spawnNow, spawnOnCursor, addOne]);

  const mode: LibMode = {
    place: 'tank-spawner', title: 'Spawn Tool',
    subtitle: 'Pick something and set it up, then Spawn it near you or place it with your pointer.',
    kinds: ['tank', 'other', 'shape', 'sentry'],
    actionsOf,
    isChosen: (e) => (counts.get(e.key) ?? 0) > 0,
    chosenSection: { title: 'To Spawn' },
    extraH: (k) => (isBatchKind(k) ? 62 : 0),
    renderExtra: (e) => {
      if (!isBatchKind(e.kind)) return null;
      const st = statsOf(e);
      return (
        <div className="mt-2">
          <div className="flex items-center gap-1 h-5 tabular-nums k-fade">
            {st && <><span className="k-badge">HP {st[0]}</span><span className="k-badge">XP {st[1]}</span></>}
          </div>
          <div className="mt-1.5"><CountStepper value={counts.get(e.key) ?? 0} onChange={(n) => setCount(e, n)} /></div>
        </div>
      );
    },
    panelExtraFirst: true,
    renderPanelExtra: (e) => isBatchKind(e.kind) ? (
      <div key={e.key} className="k-info-card px-3 py-1">
        <div className="k-row">
          <RowLabel label="How Many" help={e.kind === 'shape'
            ? 'How many of this shape the Spawn button at the bottom places, on free spots near your tank. Spawn On Cursor places one.'
            : 'How many of this sentry the Spawn button at the bottom places, near your tank.'} />
          <CountStepper big value={counts.get(e.key) ?? 0} onChange={(n) => setCount(e, n)} />
        </div>
      </div>
    ) : (
      <SpawnChoices key={e.key} e={e} logic={logic} c={choicesOf(e)} put={(patch) => put(e, patch)} preview={previewOf(e)}
        teamOptions={teamOptions} />
    ),
    status: (k) => (isBatchKind(k) ? caps : null),
    footer: (close, compact, kind) => {
      const batch = kind !== undefined && isBatchKind(kind);
      const showSpawn = batch || counts.size > 0;
      return (
        <MotionRow className="flex items-center gap-4 px-5 py-3">
          <MotionRow.Item key="caps" grow><div className="flex flex-wrap items-center gap-x-4 gap-y-1 mr-auto">
            {compact || !batch ? null : caps}
          </div></MotionRow.Item>
          {showSpawn && <MotionRow.Item key="sum"><div className="text-[12px] text-[var(--text-tertiary)] tabular-nums">
            <SwapInPlace swapKey={effectiveTotal > 0 ? `${effectiveTotal}/${totalSelected}` : 'none'} hold={false} className="k-swap-text">
            {effectiveTotal > 0 ? (
              <><span className="font-medium text-[var(--text-primary)]">{effectiveTotal}</span>{effectiveTotal < totalSelected && <span className="text-[var(--text-quaternary)]"> / {totalSelected}</span>} to spawn</>
            ) : 'Nothing chosen yet'}
            </SwapInPlace>
          </div></MotionRow.Item>}
          {counts.size > 0 && <MotionRow.Item key="clear"><button type="button" onClick={() => setCounts(new Map())} className="k-btn k-btn-ghost k-btn-md">Clear</button></MotionRow.Item>} { }
          <MotionRow.Item key="return"><button type="button" onClick={() => close()} className="k-btn k-btn-secondary k-btn-lg">Return</button></MotionRow.Item>
          {showSpawn && <MotionRow.Item key="spawn"><button type="button" onClick={() => handleSpawnAll(close)} disabled={effectiveTotal <= 0} className="k-btn k-btn-primary k-btn-lg min-w-[112px]">{ }
            Spawn
          </button></MotionRow.Item>}
        </MotionRow>
      );
    },
  };

  return <ContentLibrary logic={logic} mode={mode} onClose={onClose} />;
};

const SpawnChoices: React.FC<{
  e: LibEntry; logic: GameLogic; c: Choices; put: (p: Partial<Choices>) => void; preview: EditStatsPreview | null; teamOptions: SelectOption[];
}> = ({ e, logic, c, put, preview, teamOptions }) => {
  const { kind } = kindOf(e);
  const isTank = kind === 'tank';
  const countCap = isTank && e.item ? logic.spawnerTankCountCap(e.item.id, isBossCard(e)) : 1;
  const count = Math.max(1, Math.min(countCap, c.count));
  const distRow = (
    <SliderRow label="Distance" help="How far from your tank Spawn places it." value={c.dist} min={SPAWN_DIST_MIN} max={SPAWN_DIST_MAX} step={10}
      display={String(Math.round(c.dist))} onChange={v => put({ dist: Math.round(v) })} />
  );
  if (!isTank) {
    return (
      <div className="k-info-card px-3 py-1 space-y-0.5">
        {(kind === 'wall' || kind === 'rock') && (
          <SliderRow label="Size" help={kind === 'wall' ? 'How many cells of 60 each side of the wall is.' : 'How big the pumpkin is, in cells of 60.'}
            value={c.cells} min={1} max={SPAWN_WALL_CELLS_MAX} step={1} display={`${c.cells} x ${c.cells}`} onChange={v => put({ cells: Math.round(v) })} />
        )}
        {distRow}
      </div>
    );
  }
  const gm = logic.state.gameModeConfig;
  const b = preview ? boxesOf(preview, c.typed, gm) : null;
  const maxLevel = logic.spawnerMaxLevel();
  const xp = b ? (c.xp ?? logic.spawnerXpOfLevel(b.level)) : 0;
  const xpMax = logic.spawnerXpOfLevel(maxLevel);
  const statNames = ((e.item?.fileData.data as TankConfig | undefined)?.statNamesType ?? 'generic') as StatNamesType;
  const setLevel = (v: number) => { if (!preview) return; put({ typed: typeLevel(preview, c.typed, Math.max(0, Math.min(maxLevel, Math.floor(v) || 0))), xp: undefined }); };
  const setXp = (v: number) => {
    if (!preview) return;
    const x = Math.max(0, Math.min(xpMax, Math.floor(v) || 0));
    put({ typed: typeLevel(preview, c.typed, logic.spawnerLevelOfXp(x)), xp: x });
  };
  return (
    <div className="space-y-3">
      <div className="k-info-card px-3 py-1 space-y-0.5">
        <SelectRow label="Team" help="The side it fights for. Only the teams this mode has." value={c.team} options={teamOptions} onChange={v => put({ team: v })} />
        <ToggleRow label="AI" help="On: it plays as it normally does. Off: it does nothing, and its drones, minions and auto turrets aim at nothing. $ ai on never turns it on." checked={c.aiOn} onChange={v => put({ aiOn: v })} />
        <ToggleRow label="Respawns When Killed" help="It comes back after it dies, like the bots of a mode, with these same settings." checked={c.respawn} onChange={v => put({ respawn: v })} />
        <div className="k-row">
          <span className="k-row-label"><span className="k-row-lead"><HelpTooltip text={`How many Spawn makes at once, at random free spots near each other. At most ${countCap} of this one. Spawn On Cursor places one.`} /></span><span className="k-row-label-text">How Many</span></span>
          <Stepper less="One less" more="One more" onLess={() => put({ count: Math.max(1, count - 1) })} onMore={() => put({ count: Math.min(countCap, count + 1) })}
            lessOff={count <= 1} moreOff={count >= countCap} cap={`/ ${countCap}`}>
            <NumberInput value={count} onChange={(ev) => put({ count: Math.max(1, Math.min(countCap, parseInt(ev.target.value) || 1)) })} className={VALUE_BOX} arrows={false} min={1} max={countCap} />
          </Stepper>
        </div>
        {distRow}
      </div>
      {b && preview && (
        <div className="k-info-card px-3 py-2 space-y-2">
          <div className="k-num">
            <label className="k-num-label"><HelpTooltip text="The level it starts at, from 0 up to this mode's cap. Its skill points follow the level, unless you typed them yourself." />Level</label>
            <Stepper less="Lower the level" more="Raise the level" onLess={() => setLevel(b.level - 1)} onMore={() => setLevel(b.level + 1)}
              lessOff={b.level <= 0} moreOff={b.level >= maxLevel} cap={`/ ${maxLevel}`}>
              <NumberInput value={b.level} onChange={(ev) => setLevel(parseInt(ev.target.value) || 0)} className={VALUE_BOX} arrows={false} min={0} max={maxLevel} />
            </Stepper>
          </div>
          <div className="k-num">
            <label className="k-num-label"><HelpTooltip text="Its score. Typing it sets the level that score reaches." />XP</label>
            <span className="k-stepper k-stepper-ink">
              <NumberInput value={xp} onChange={(ev) => setXp(parseInt(ev.target.value) || 0)} className={VALUE_BOX} arrows={false} min={0} max={xpMax} />
            </span>
          </div>
          <div className="k-num">
            <label className="k-num-label"><HelpTooltip text="The skill points it has to spend: its own bonus and what this mode gives at its level. With its AI on it spends them itself." />Skill Points</label>
            <Stepper less="One less skill point" more="One more skill point"
              onLess={() => put({ typed: typeSkillPoints(preview, c.typed, b.skillPoints - 1, gm) })} onMore={() => put({ typed: typeSkillPoints(preview, c.typed, b.skillPoints + 1, gm) })}
              lessOff={b.skillPoints <= 0} moreOff={b.skillPoints >= DEBUG_SKILL_POINTS_MAX}>
              <NumberInput value={b.skillPoints} onChange={(ev) => put({ typed: typeSkillPoints(preview, c.typed, parseInt(ev.target.value) || 0, gm) })} className={VALUE_BOX} arrows={false} min={0} max={DEBUG_SKILL_POINTS_MAX} />
            </Stepper>
          </div>
        </div>
      )}
      {b && preview && (
        <div>
          <div className="k-subhead mb-2">Upgrade Stats</div>
          <div className="k-info-card px-3 py-2 space-y-2">
            {STAT_ORDER.map((stat: UpgradeStat) => {
              const cap = preview.skillCaps[stat];
              const locked = cap === 0;
              const v = locked ? 0 : b.upgrades[stat];
              const label = getStatLabel(stat, statNames);
              return (
                <div key={stat} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center${locked ? ' k-row-disabled' : ''}`}>
                  <span className="col-start-1 row-start-1 self-end min-w-0 text-[12px] leading-[1.25] text-[var(--text-primary)] break-words">{label}</span>
                  <span className="col-start-1 row-start-2 self-start flex min-w-0 pt-1"><StatBar stat={stat} value={v} cap={cap} /></span>
                  <span className="col-start-2 row-start-1 row-span-2 flex">
                    <Stepper less={`Remove a point from ${label}`} more={`Add a point to ${label}`}
                      onLess={() => put({ typed: typeStat(preview, c.typed, stat, v - 1) })} onMore={() => put({ typed: typeStat(preview, c.typed, stat, v + 1) })}
                      lessOff={locked || v <= 0} moreOff={locked || v >= cap}>
                      <span className={STAT_BOX}>{v}</span>
                    </Stepper>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
