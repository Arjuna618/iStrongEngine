import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useEscapeOwner } from './shared/escapeStack';
import { useClosing, useSwapFade, useGlideHeight, SWAP_OUT_MS } from './kit/motion';
import { DROP_EXIT_MS } from './shared/useFloatingPopup';
import { useDropMenu, DropMenu, menuOpen } from './kit/DropMenu';
import { Collapse } from './kit/Collapse';
import { X, ChevronDown, User, UserCog, Bot, ShieldAlert, Cross, Rabbit, ShieldOff, Crosshair, Recycle, FastForward, ShieldPlus, Shield, Heart, Drama, Dna, Ghost, Minus, Plus, SlidersHorizontal, HdBrainCircuit, HdGeometricShapes01, HdScanEye } from './ui/icons';
import { GameLogic, DEBUG_SKILL_POINTS_MAX } from '../game/GameLogic';
import type { EditStatsBoxes, EditStatsPreview } from '../game/GameLogic';
import { boxesOf, noTypedEdits, typeLevel, typeSkillPoints, typeStat } from './shared/editStatsBoxes';
import type { EditStatsTyped } from './shared/editStatsBoxes';
import { UpgradeStat, LibraryItem, TankConfig, EnemyTank, AIBehavior, StatNamesType, getStatLabel, isSmasherStatNames, AI_CONSTANTS, teamOverrideColor } from '../types';
import { isGameDark } from '../utils/gameColors';
import { isMenuTank } from '../game/evolutionTree';
import { TankPreview } from './TankPreview';
import { GameFloor } from './shared/GameFloor';
import { NumberInput } from './shared/uiHelpers';
import { HelpTooltip } from './shared/HelpTooltip';
import { ContentLibrary } from './library/ContentLibrary';
import { ContentLibraryButton } from './library/ContentLibraryButton';
import type { LibMode } from './library/libraryModes';
import { useMenuScale, useModalMaxHeight, useModalMaxWidth } from '../utils/useMenuScale';
import { Backdrop } from './kit/Modal';
import { useFocusScope } from './kit/focusScope';
import { useLeave, motionOff as reducedMotion } from './kit/presence';
import { useDebugRevokeClose } from './shared/debugRevoke';
import { Button, Group, IconButton, SliderRow, ToggleRow, headerIcon } from './kit/kit';
import { ThemeSwitch } from './kit/ThemeSwitch';
import { isTouchScreen, isPhoneUi } from '../utils/device';
import { useWindowLayer } from './kit/windowStack';


interface Props {
  logic: GameLogic;
  onClose: () => void;
}

const STAT_ORDER: UpgradeStat[] = [
  'bodyDamage',
  'maxHealth',
  'bulletSpeed',
  'bulletHealth',
  'bulletPenetration',
  'bulletDamage',
  'reload',
  'movementSpeed',
  'shieldRegen',
  'shieldCapacity'
];

const STAT_ICONS: Record<UpgradeStat, React.ReactNode> = {
  bodyDamage: <ShieldAlert size={14} />,
  maxHealth: <Cross size={14} />,
  bulletSpeed: <FastForward size={14} />,
  bulletPenetration: <ShieldOff size={14} />,
  bulletHealth: <Heart size={14} />,
  bulletDamage: <Crosshair size={14} />,
  reload: <Recycle size={14} />,
  movementSpeed: <Rabbit size={14} />,
  shieldRegen: <ShieldPlus size={14} />,
  shieldCapacity: <Shield size={14} />
};

const NO_BOXES: EditStatsBoxes = {
  level: 0, skillPoints: 0,
  upgrades: {
    bodyDamage: 0, maxHealth: 0, bulletSpeed: 0,
    bulletPenetration: 0, bulletHealth: 0, bulletDamage: 0, reload: 0,
    movementSpeed: 0, shieldRegen: 0, shieldCapacity: 0
  },
};

const BEHAVIOR_LABEL: Record<AIBehavior, string> = {
  Friendly: 'Friendly', Enemy: 'Enemy', Neutral: 'Neutral', FFA: 'FFA',
  Team1: 'Team 1', Team2: 'Team 2', Team3: 'Team 3', Team4: 'Team 4', Team5: 'Dreadnoughts',
};
const behaviorLabel = (b: AIBehavior | 'Player'): string | null => (b === 'Player' ? null : BEHAVIOR_LABEL[b] ?? b);

interface EntityOption {
  id: string;
  name: string;
  isPlayer: boolean;
  level: number;
  behavior: AIBehavior | 'Player';
  tier: string;
  tankConfigName?: string;
  tankType?: string;
}

const DNA_TRAITS: { key: 'courage' | 'teamHelp' | 'aggression' | 'vengeful' | 'caution'; left: string; right: string; help: string; read: (e: EnemyTank) => number }[] = [
  { key: 'courage', left: 'Cowardice', right: 'Courage', help: 'How willing the bot is to approach tanks stronger than itself.', read: e => e.dnaCourage },
  { key: 'teamHelp', left: 'Greed', right: 'Team Help', help: 'In team modes, whether it abandons food to rescue a teammate under attack.', read: e => e.dnaTeamHelp },
  { key: 'aggression', left: 'Patience', right: 'Aggression', help: 'How eager it is to pick fights instead of farming.', read: e => e.dnaAggression },
  { key: 'vengeful', left: 'Forgiving', right: 'Vengeful', help: 'How long it keeps chasing a target it lost.', read: e => e.dnaVengeful },
  { key: 'caution', left: 'Reckless', right: 'Cautious', help: 'How low it lets its health drop before running away.', read: e => e.dnaCaution },
];

type Layout = 'one' | 'two' | 'three';
const LAYOUT_W: Record<Layout, number> = { one: 460, two: 820, three: 1180 };
const EPS_PAIR_W = 340;
const EPS_PHONE_TWO_W = 640;
const STACK_GAP = 12;
const TWO_COL_BIAS = 1.12;
const KEEP_BIAS = 1.03;
const LAYOUTS: readonly Layout[] = ['two', 'one'];
const LAYOUTS_BOT: readonly Layout[] = ['two', 'three', 'one'];
const COLS_2 = 'minmax(0, 1fr) minmax(0, 1.1fr)';
const GRID_STYLE: Record<Layout, { bot: React.CSSProperties; plain: React.CSSProperties }> = {
  two: {
    bot: { gridTemplateColumns: COLS_2, gridTemplateRows: 'auto 1fr', gridTemplateAreas: '"who stats" "bot stats"' },
    plain: { gridTemplateColumns: COLS_2, gridTemplateAreas: '"who stats"' },
  },
  three: {
    bot: { gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.1fr)', gridTemplateAreas: '"who bot stats"' },
    plain: { gridTemplateColumns: COLS_2, gridTemplateAreas: '"who stats"' },
  },
  one: {
    bot: { gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateAreas: '"who" "bot" "stats"' },
    plain: { gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateAreas: '"who" "stats"' },
  },
};
const AREA_WHO: React.CSSProperties = { gridArea: 'who' };
const AREA_BOT: React.CSSProperties = { gridArea: 'bot' };
const AREA_STATS: React.CSSProperties = { gridArea: 'stats' };

function useFitLayout(
  refs: { dialog: React.RefObject<HTMLDivElement | null>; grid: React.RefObject<HTMLDivElement | null>; who: React.RefObject<HTMLDivElement | null>; bot: React.RefObject<HTMLDivElement | null>; stats: React.RefObject<HTMLDivElement | null> },
  hasBot: boolean, maxW: number, maxH: number,
  frozen: boolean,
  swap: (fn: () => void) => void,
): { layout: Layout; fit: number } {
  const [state, setState] = useState<{ layout: Layout; fit: number }>({ layout: 'two', fit: 1 });
  const shown = useRef<Layout>('two');
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const swapRef = useRef(swap);
  swapRef.current = swap;
  const chosen = useRef(false);
  useLayoutEffect(() => { shown.current = state.layout; });
  useLayoutEffect(() => {
    const dialog = refs.dialog.current, grid = refs.grid.current, who = refs.who.current, stats = refs.stats.current;
    if (!dialog || !grid || !who || !stats) return;
    const compute = () => {
      if (frozenRef.current) return;
      const bot = refs.bot.current;
      const W = who.offsetHeight, S = stats.offsetHeight, B = bot ? bot.offsetHeight : 0;
      if (W <= 0 || S <= 0) return;
      const chrome = dialog.offsetHeight - grid.offsetHeight;
      const left = bot ? W + STACK_GAP + B : W;
      const heightOf = (l: Layout) => chrome + (l === 'one' ? left + STACK_GAP + S : l === 'three' ? Math.max(W, B, S) : Math.max(left, S));
      const scaleOf = (l: Layout) => Math.min(1, maxW / LAYOUT_W[l], maxH / heightOf(l));
      const cur = shown.current;
      let best = cur, bestScore = -1;
      for (const l of (bot ? LAYOUTS_BOT : LAYOUTS)) {
        const score = scaleOf(l) * (l === 'two' ? TWO_COL_BIAS : 1) * (l === cur ? KEEP_BIAS : 1);
        if (score > bestScore) { best = l; bestScore = score; }
      }
      if (bot && scaleOf('three') >= 0.999 && heightOf('three') < heightOf('two') * (cur === 'three' ? 0.88 : 0.8)) best = 'three';
      const fit = best === cur ? Math.min(1, maxW / dialog.offsetWidth, maxH / dialog.offsetHeight) : scaleOf(best);
      if (best !== cur && chosen.current) { swapRef.current(() => setState({ layout: best, fit })); return; }
      chosen.current = true;
      setState(prev => (prev.layout === best && Math.abs(prev.fit - fit) < 0.001 ? prev : { layout: best, fit }));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(dialog); ro.observe(who); ro.observe(stats);
    if (refs.bot.current) ro.observe(refs.bot.current);
    return () => ro.disconnect();
  }, [refs, hasBot, maxW, maxH, frozen]);
  return state;
}

const Tag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center h-[18px] px-1.5 rounded-[8px] text-[10.5px] [font-weight:var(--fw-control)] leading-none whitespace-nowrap border border-transparent bg-[var(--k-tag-bg)] text-[var(--text-secondary)]">{children}</span>
);

const EntityTags: React.FC<{ e: EntityOption }> = ({ e }) => {
  const b = behaviorLabel(e.behavior);
  return (
    <>
      {b && <Tag>{b}</Tag>}
      <Tag>{e.tier}</Tag>
      <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums whitespace-nowrap">Level {e.level}</span>
    </>
  );
};

const Stepper: React.FC<{
  less: string; more: string; onLess: () => void; onMore: () => void; lessOff?: boolean; moreOff?: boolean; cap?: string; children: React.ReactNode;
  big?: boolean;
}> = ({ less, more, onLess, onMore, lessOff, moreOff, cap, children, big }) => (
  <span className="flex items-center gap-1.5 shrink-0">
    <span className={big ? 'k-stepper k-stepper-ink k-stepper-big' : 'k-stepper k-stepper-ink'}>
      <button type="button" className="k-stepper-btn" aria-label={less} title={less} onClick={onLess} disabled={lessOff}><Minus size={12} /></button>
      {children}
      <button type="button" className="k-stepper-btn" aria-label={more} title={more} onClick={onMore} disabled={moreOff}><Plus size={12} /></button>
    </span>
    {cap && <span className="k-unit tabular-nums whitespace-nowrap">{cap}</span>}
  </span>
);
const VALUE_BOX = 'k-stepper-input';
const STAT_BOX = 'k-stepper-input inline-flex items-center justify-center';

const StatBar: React.FC<{ value: number; cap: number }> = ({ value, cap }) => {
  const n = cap > 0 ? cap : 1;
  const segs: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    segs.push(<rect key={i} x={i * 10} y={0} width={8} height={6} rx={1.5} ry={1.5} className={i < value ? 'fill-[var(--accent)]' : 'fill-[var(--slider-track)]'} />);
  }
  return <svg className="flex-1 min-w-0 h-1.5" viewBox={`0 0 ${n * 10 - 2} 6`} preserveAspectRatio="none" aria-hidden="true">{segs}</svg>;
};

export const EditPlayerStatsPopup: React.FC<Props> = ({ logic, onClose: onCloseNow }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { closing, close: onClose } = useClosing(onCloseNow, dialogRef);
  useFocusScope(dialogRef);
  const layer = useWindowLayer(!closing);
  useLeave(dialogRef, closing || layer.covered, 'pop');
  useDebugRevokeClose(logic, onClose);
  const menuScale = useMenuScale();
  const phone = isPhoneUi();
  const maxW = useModalMaxWidth(phone ? 0 : undefined);
  const maxH = useModalMaxHeight(phone ? 0 : undefined);
  const gridRef = useRef<HTMLDivElement>(null);
  const whoRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const [fitRefs] = useState(() => ({ dialog: dialogRef, grid: gridRef, who: whoRef, bot: botRef, stats: statsRef }));
  const buildEntityList = (): EntityOption[] => {
    const entities: EntityOption[] = [];

    entities.push({
      id: logic.state.playerId,
      name: 'You',
      isPlayer: true,
      level: logic.state.level,
      behavior: 'Player',
      tier: logic.getStrengthTierName('player')
    });

    for (const enemy of logic.state.enemyTanks) {
      if (enemy.active && !enemy.isDying && !enemy.spawnedByEntityId && !enemy.isBaseProtector && ((enemy._mevF ?? 0) & 1) === 0) {
        const config = logic.state.enemyConfigs.find(c => c.id === enemy.configId);
        const baseName = enemy.displayName || config?.enemyName || 'Unknown Tank';
        const tankType = enemy.currentTankName
          ? logic.resolveTankDisplayName(enemy.currentTankName)
          : (enemy.isBossTier && config?.enemyName && config.enemyName !== baseName ? config.enemyName : undefined);
        entities.push({
          id: enemy.id,
          name: baseName,
          isPlayer: false,
          level: enemy.level,
          behavior: enemy.aiBehavior,
          tier: logic.getStrengthTierName(enemy),
          tankConfigName: config?.tankConfig ?
            logic.state.tankLibrary.find(l => l.id === config.id)?.name : undefined,
          tankType,
        });
      }
    }

    return entities;
  };

  const [entities, setEntities] = useState<EntityOption[]>(buildEntityList);
  const [selectedEntityId, setSelectedEntityId] = useState<string>(() => {
    const w = logic.spectatingId;
    return w !== '' && logic.state.enemyTanks.some(e => e.id === w && e.active && !e.isDying) ? w : logic.state.playerId;
  });
  const listMenu = useDropMenu({ align: 'start', estimatedHeight: 242 });
  const dropdownOpen = menuOpen(listMenu);
  const bodySwap = useSwapFade({ glide: true });
  const [noteBusy, setNoteBusy] = useState(false);

  const dnaOpen = true;
  const [dnaValues, setDnaValues] = useState<Record<string, number>>({});
  const [, setGhostTick] = useState(0);
  useEffect(() => {
    setDnaValues({});
  }, [selectedEntityId]);
  const selectedEnemyLive: EnemyTank | undefined =
    selectedEntityId !== logic.state.playerId
      ? logic.state.enemyTanks.find(e => e.id === selectedEntityId && e.active && !e.isDying)
      : undefined;

  const onMenuTank = isMenuTank(logic.state.currentTankFileName ?? '');
  const canTakeOver = (e: EnemyTank) => e.active && !e.isDying && !e.spawnedByEntityId && !e.isSentryEnemy && !e.isSpawning
    && !e.isBaseProtector && ((e._mevF ?? 0) & 1) === 0 && !onMenuTank;

  const takeOverSelected = () => {
    if (selectedEnemyLive && canTakeOver(selectedEnemyLive) && logic.takeOverTank(selectedEnemyLive.id)) onClose();
  };

  const watchingSelected = !!selectedEnemyLive && logic.spectatingId === selectedEnemyLive.id;
  const spectateSelected = () => {
    if (!selectedEnemyLive) return;
    if (watchingSelected) { logic.stopSpectating(); onClose(); return; }
    if (logic.spectateTank(selectedEnemyLive.id)) onClose();
  };

  const pickTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(pickTimer.current), []);
  const handleEntityPick = (entity: EntityOption) => {
    listMenu.close();
    if (entity.id === selectedEntityId) return;
    window.clearTimeout(pickTimer.current);
    pickTimer.current = window.setTimeout(() => bodySwap.run(() => setSelectedEntityId(entity.id)),
      reducedMotion() ? 0 : Math.max(0, DROP_EXIT_MS - SWAP_OUT_MS));
  };

  const [preview, setPreview] = useState<EditStatsPreview | null>(() => {
    const first = selectedEntityId === logic.state.playerId ? null : logic.state.enemyTanks.find(e => e.id === selectedEntityId);
    return logic.previewEditPlayerStats(selectedEntityId, first ? logic.enemyTankLibraryItemId(first) : null);
  });
  const [typed, setTyped] = useState<EditStatsTyped>(noTypedEdits);
  const gm = logic.state.gameModeConfig;
  const boxes = useMemo(() => (preview ? boxesOf(preview, typed, gm) : NO_BOXES), [preview, typed, gm]);
  const editLevel = boxes.level;
  const editSkillPoints = boxes.skillPoints;
  const editUpgrades = boxes.upgrades;
  const [editTankLibraryId, setEditTankLibraryId] = useState<string | null>(null);
  const [libOpen, setLibOpen] = useState(false);

  const maxLevel = logic.getDebugMaxSettableLevel();

  const tankLibByFileName = useMemo(() => {
    const map = new Map<string, LibraryItem>();
    for (const item of logic.state.tankLibrary) {
      if (item.fileData.type !== 'Tank') continue;
      const id = item.id || '';
      const slashIdx = id.lastIndexOf('/');
      const dotIdx = id.lastIndexOf('.');
      if (slashIdx >= 0 && dotIdx > slashIdx) {
        map.set(id.substring(slashIdx + 1, dotIdx), item);
      }
    }
    return map;
  }, [logic.state.tankLibrary]);


  const handleLevelChange = (newLevel: number) => {
    if (!preview) return;
    const level = Math.max(0, Math.min(maxLevel, newLevel));
    setTyped(t => typeLevel(preview, t, level));
  };

  const setTypedSkillPoints = (v: number) => {
    if (!preview) return;
    setTyped(t => typeSkillPoints(preview, t, v, gm));
  };

  const pickTank = (itemId: string | null) => {
    setEditTankLibraryId(itemId);
    const p = logic.previewEditPlayerStats(selectedEntityId, itemId);
    if (p) setPreview(p);
  };

  useEffect(() => {
    loadEntityData(selectedEntityId);
  }, [selectedEntityId]);

  useEffect(() => {
    setEntities(buildEntityList());
  }, []);

  useEscapeOwner(onClose, !dropdownOpen);

  const loadEntityData = (entityId: string) => {
    const enemy = entityId === logic.state.playerId ? null : logic.state.enemyTanks.find(e => e.id === entityId);
    const pickId = enemy ? logic.enemyTankLibraryItemId(enemy) : null;
    setEditTankLibraryId(pickId);
    setTyped(noTypedEdits());
    setPreview(logic.previewEditPlayerStats(entityId, pickId));
  };

  const selectedEntity = useMemo(() =>
    entities.find(e => e.id === selectedEntityId),
    [entities, selectedEntityId]
  );

  const capFor = (stat: UpgradeStat): number => preview ? preview.skillCaps[stat] : 0;

  const handleStatChange = (stat: UpgradeStat, delta: number) => {
    if (!preview) return;
    setTyped(t => typeStat(preview, t, stat, boxesOf(preview, t, gm).upgrades[stat] + delta));
  };

  const handleConfirm = () => {
    if (bodySwap.phase === 'out') return;
    logic.applyEditPlayerStats(selectedEntityId, editTankLibraryId, boxes);

    logic.updateState({ leaderboardVersion: logic.state.leaderboardVersion + 1, isDebugMenuOpen: false });
    logic.setPaused(false);

    onClose();
  };

  const totalUpgradePoints = Object.values(editUpgrades).reduce((a: number, b: number) => a + b, 0);

  const totalUpgradeCap = STAT_ORDER.reduce((sum, stat) => sum + capFor(stat), 0);

  const currentTankConfig = useMemo(() => {
    if (editTankLibraryId) {
      const libItem = logic.state.tankLibrary.find(l => l.id === editTankLibraryId);
      if (libItem) return libItem.fileData.data as TankConfig;
    }
    if (selectedEntityId === logic.state.playerId) {
      return logic.getTankExportData();
    }
    const enemy = logic.state.enemyTanks.find(e => e.id === selectedEntityId);
    if (!enemy) return null;
    if (enemy.currentTankName) {
      const libItem = tankLibByFileName.get(enemy.currentTankName);
      if (libItem) return libItem.fileData.data as TankConfig;
    }
    const config = logic.state.enemyConfigs.find(c => c.id === enemy.configId);
    return config?.tankConfig || null;
  }, [selectedEntityId, editTankLibraryId, logic]);

  const _previewColorOverride = useMemo(() => {
    const dark = isGameDark();
    if (selectedEntityId === logic.state.playerId) {
      if (editTankLibraryId) {
        const pickKey = logic.tankLibraryKeyForItemId(editTankLibraryId);
        return teamOverrideColor(logic.playerTankColorTeamIndex(pickKey || null, currentTankConfig?.keepOwnColor), dark);
      }
      return teamOverrideColor(logic.playerColorTeamIndex(), isGameDark());
    }
    const enemy = logic.state.enemyTanks.find(e => e.id === selectedEntityId);
    if (!enemy) return undefined;
    const eIdx = editTankLibraryId
      ? logic.enemyColorTeamIndexOnTank(enemy, currentTankConfig?.keepOwnColor)
      : logic.enemyColorTeamIndex(enemy);
    return teamOverrideColor(eIdx, dark);
  }, [selectedEntityId, editTankLibraryId, currentTankConfig, logic]);

  const libMode: LibMode = useMemo(() => ({
    place: 'player', title: 'Choose a Tank',
    subtitle: selectedEntityId === logic.state.playerId ? 'The tank you become when you apply' : 'The tank this bot becomes when you apply',
    kinds: ['tank'],
    isChosen: (e) => !!e.item && e.item.id === editTankLibraryId,
    chosenSection: { title: 'Chosen' },
    actionsOf: (e) => {
      if (!e.item) return [];
      const on = e.item.id === editTankLibraryId;
      return [{ id: 'pick', label: on ? 'Clear Choice' : 'Choose', run: () => { pickTank(on ? null : e.item!.id); return !on; } }];
    },
  }), [selectedEntityId, editTankLibraryId]);
  const statNames: StatNamesType | undefined = currentTankConfig
    ? (isSmasherStatNames(currentTankConfig.statNamesType, currentTankConfig.isSmasher) ? 'smasher' : (currentTankConfig.statNamesType ?? 'generic'))
    : undefined;

  const isPlayerSelected = selectedEntityId === logic.state.playerId;
  const tankName = editTankLibraryId
    ? (logic.state.tankLibrary.find(l => l.id === editTankLibraryId)?.name || 'Selected')
    : isPlayerSelected ? (logic.playerTankDisplayName() ?? logic.resolveTankDisplayName(null)) : (selectedEntity?.tankType ?? 'Tank');

  const noteOpen = !!(editTankLibraryId && preview?.changesTank);
  const noteFreshRef = useRef(false);
  if (noteOpen) noteFreshRef.current = !!preview?.freshStart;
  const noteFresh = noteFreshRef.current;

  const hasBot = !!selectedEnemyLive;
  const layoutFrozen = bodySwap.phase === 'out' || bodySwap.phase === 'in' || noteBusy;
  const fitted = useFitLayout(fitRefs, hasBot, maxW, maxH, layoutFrozen, bodySwap.run);
  const touch = isTouchScreen();
  const layout: Layout = phone ? (maxW >= EPS_PHONE_TWO_W ? 'two' : 'one') : touch ? (maxW >= LAYOUT_W.two ? 'two' : 'one') : fitted.layout;
  const fit = touch ? 1 : fitted.fit;
  useGlideHeight(dialogRef, phone ? 'phone' : `${selectedEntityId}|${dnaOpen ? 1 : 0}|${layout}`);

  return (
    <Backdrop onClose={onClose} closing={closing} className={layer.over ? 'k-scrim-over' : undefined}>
      <div className="pointer-events-none" style={{ zoom: menuScale }}>
        <div className="pointer-events-none" style={{ transform: fit < 1 ? `scale(${fit})` : undefined, transition: 'transform 160ms var(--ease-default)' }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Manage Players" tabIndex={-1}
            className={`k-modal animate-scaleUp${phone ? ' k-modal-full k-eps-phone' : ''} ${closing || layer.covered ? 'pointer-events-none' : 'pointer-events-auto'}`}
            style={phone ? { width: maxW, height: maxH } : touch ? { width: Math.min(LAYOUT_W[layout], maxW), maxHeight: maxH, transition: 'width 160ms var(--ease-default)' } : { width: LAYOUT_W[layout], transition: 'width 160ms var(--ease-default)' }} onClick={e => e.stopPropagation()}>
            <header className="k-modal-head">
              <span className="k-modal-icon"><UserCog size={18} strokeWidth={1.5} absoluteStrokeWidth /></span>
              <div className="min-w-0 flex-1"><h2 className="k-modal-title truncate">Manage Players</h2></div>
              <ThemeSwitch />
              <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
            </header>

            <div className={`k-modal-body ${touch ? 'overflow-y-auto popup-scrollbar' : 'overflow-hidden'} ${bodySwap.swapClass}`}>
              <div ref={gridRef} className="grid gap-x-4 gap-y-3" style={GRID_STYLE[layout][hasBot ? 'bot' : 'plain']}>

                <div ref={whoRef} className="min-w-0 self-start space-y-3" style={AREA_WHO}>
                  <Group title="Editing" icon={headerIcon(isPlayerSelected ? User : Bot)}>
                    <div className="relative">
                      <button
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={dropdownOpen}
                        ref={listMenu.triggerRef as React.RefObject<HTMLButtonElement>}
                        onClick={(e) => {
                          if (!dropdownOpen) setEntities(buildEntityList());
                          listMenu.toggle(e.currentTarget.getBoundingClientRect());
                        }}
                        className="k-mode-pick min-h-[46px] text-left"
                      >
                        <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-[var(--alpha-selected)] text-[var(--text-primary)]">
                          {selectedEntity?.isPlayer ? <User size={16} /> : <Bot size={16} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-[var(--text-primary)]">
                            {selectedEntity?.name}
                            {selectedEntity?.tankType && (
                              <span className="font-normal text-[var(--text-tertiary)]"> ({selectedEntity.tankType})</span>
                            )}
                          </span>
                          {selectedEntity && <span className="flex items-center gap-1 mt-0.5 min-w-0 overflow-hidden"><EntityTags e={selectedEntity} /></span>}
                        </span>
                        <ChevronDown size={14} className={`shrink-0 text-[var(--text-tertiary)] transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      <DropMenu menu={listMenu} role="listbox" label="Tanks to edit" matchTriggerWidth
                        className="p-1 max-h-[232px] overflow-y-auto popup-scrollbar rounded-xl border border-[var(--alpha-card-border)] k-drop-glass">
                          {entities.map(entity => {
                            const on = entity.id === selectedEntityId;
                            return (
                              <button
                                key={entity.id}
                                type="button"
                                role="option"
                                aria-selected={on}
                                onClick={() => handleEntityPick(entity)}
                                className={`w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-left text-[var(--text-primary)] transition-colors ${on ? 'bg-[var(--control-alpha)]' : 'hover:bg-[var(--alpha-hover)]'}`}
                              >
                                {entity.isPlayer ? <User size={14} className="shrink-0" /> : <Bot size={14} className="shrink-0" />}
                                <span className="min-w-0 flex-1 truncate text-[12px]">
                                  {entity.name}
                                  {entity.tankType && (
                                    <span className="text-[var(--text-tertiary)]"> ({entity.tankType})</span>
                                  )}
                                </span>
                                <EntityTags e={entity} />
                              </button>
                            );
                          })}
                      </DropMenu>
                    </div>

                    {selectedEnemyLive && (
                      <Button
                        block
                        icon={<Drama size={15} />}
                        title="You become this tank at once: its design, stats, points, team and position."
                        onClick={takeOverSelected}
                        disabled={!canTakeOver(selectedEnemyLive)}
                      >
                        {canTakeOver(selectedEnemyLive) ? 'Take Over This Tank' : onMenuTank ? 'Pick a real tank to take over' : 'This tank cannot be taken over'}
                      </Button>
                    )}
                    {selectedEnemyLive && (
                      <Button
                        block
                        icon={<HdScanEye size={15} />}
                        title={watchingSelected
                          ? 'Back in your own tank, with a grace as after a spawn.'
                          : 'Your camera follows this tank with its own view. Your own tank waits where it is, frozen, as a ghost.'}
                        onClick={spectateSelected}
                        disabled={!watchingSelected && logic.controlling}
                      >
                        {watchingSelected ? 'Stop Spectating Tank' : 'Spectate Tank'}
                      </Button>
                    )}
                  </Group>

                  <Group title="Tank" icon={headerIcon(HdGeometricShapes01)}>
                    <div className="flex items-center gap-3">
                      <GameFloor className="w-16 h-16 shrink-0 grid place-items-center rounded-[10px] border border-[var(--alpha-card-border)] overflow-hidden">
                        {currentTankConfig && (
                          <TankPreview tankConfig={currentTankConfig} size={60} colorOverride={_previewColorOverride} boundsFit={0.6} />
                        )}
                      </GameFloor>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-1 min-w-0 min-h-[24px]">
                          <span className="k-card-title truncate">{tankName}</span>
                          {logic.state.tankLibrary.length > 0 && editTankLibraryId && (
                            <IconButton size="sm" label="Clear Choice" onClick={() => pickTank(null)}><X size={12} /></IconButton>
                          )}
                        </div>
                        {logic.state.tankLibrary.length > 0 && <ContentLibraryButton onClick={() => setLibOpen(true)} />}
                        {libOpen && <ContentLibrary logic={logic} mode={libMode} onClose={() => setLibOpen(false)} />}
                      </div>
                    </div>

                    <Collapse open={noteOpen} onBusyChange={setNoteBusy} className="k-fold-note">
                      <div className="flex items-center gap-1.5 k-row-desc pt-3">
                        <HelpTooltip text={noteFresh
                          ? 'A fresh start, like the dev menu: then this tank gets its own stats and points.'
                          : 'Like evolving.'} />
                        <span className="min-w-0">
                          {noteFresh
                            ? 'New category: level, XP, size and points reset'
                            : 'Same category: level, XP, size and points kept'}
                        </span>
                      </div>
                    </Collapse>

                    <div className={phone ? 'k-split k-eps-rows' : 'k-split'}>
                      <div className={phone ? 'k-eps-rows-in' : touch && Math.min(LAYOUT_W[layout], maxW) < EPS_PAIR_W ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
                        <div className={phone ? 'k-eps-row' : 'k-num'}>
                          <span className={phone ? 'k-eps-row-text' : 'contents'}>
                            <label htmlFor="edit-stats-level" className="k-num-label"><HelpTooltip text="The level to give it, from 0 up to this mode's cap. Its skill points follow the level, unless you typed them yourself." />Level</label>
                            {phone ? <span className="k-eps-row-sub">Up to {maxLevel}</span> : null}
                          </span>
                          <Stepper big={phone} less="Lower the level" more="Raise the level"
                            onLess={() => handleLevelChange(editLevel - 1)} onMore={() => handleLevelChange(editLevel + 1)}
                            lessOff={editLevel <= 0} moreOff={editLevel >= maxLevel} cap={phone ? undefined : `/ ${maxLevel}`}>
                            <NumberInput
                              id="edit-stats-level"
                              value={editLevel}
                              onChange={(e) => handleLevelChange(parseInt(e.target.value) || 0)}
                              className={VALUE_BOX}
                              arrows={false}
                              min={0}
                              max={maxLevel}
                            />
                          </Stepper>
                        </div>
                        <div className={phone ? 'k-eps-row' : 'k-num'}>
                          <label htmlFor="edit-stats-skill-points" className="k-num-label"><HelpTooltip text="The skill points it has to spend." />Skill Points</label>
                          <Stepper big={phone} less="One less skill point" more="One more skill point"
                            onLess={() => setTypedSkillPoints(editSkillPoints - 1)} onMore={() => setTypedSkillPoints(editSkillPoints + 1)}
                            lessOff={editSkillPoints <= 0} moreOff={editSkillPoints >= DEBUG_SKILL_POINTS_MAX}>
                            <NumberInput
                              id="edit-stats-skill-points"
                              value={editSkillPoints}
                              onChange={(e) => setTypedSkillPoints(parseInt(e.target.value) || 0)}
                              className={VALUE_BOX}
                              arrows={false}
                              min={0}
                            />
                          </Stepper>
                        </div>
                      </div>
                    </div>
                  </Group>
                </div>

                {selectedEnemyLive && (
                  <div ref={botRef} className="min-w-0 self-start" style={AREA_BOT}>
                    <Group title="Bot Behaviour" icon={headerIcon(HdBrainCircuit)} right={<span className="k-row-info">Applies at once</span>}>
                      {AI_CONSTANTS.GHOST_BOT !== 0 && (
                        <ToggleRow
                          label="Ghost Mode"
                          icon={<Ghost size={14} />}
                          help="This bot becomes untouchable and impossible to notice, stops hunting anything and simply roams. Guns its design holds down still fire, harmlessly."
                          checked={selectedEnemyLive.ghostMode === true}
                          onChange={v => {
                            if (logic.setEnemyGhostMode(selectedEnemyLive.id, v)) setGhostTick(t => t + 1);
                          }}
                        />
                      )}

                      <div className="k-row">
                        <span className="k-row-label">
                          <span className="k-row-icon"><Dna size={14} /></span>
                          <span className="k-row-lead"><HelpTooltip text="Each bot is born with five personality sliders, rolled fresh every life. They change how it fights." /></span>
                          <span className="k-row-label-text">Edit DNA</span>
                        </span>
                      </div>
                      {dnaOpen && (
                        <div className="pl-5 space-y-3">
                          {DNA_TRAITS.map(t => (
                            <SliderRow
                              key={t.key}
                              label={`${t.left} to ${t.right}`}
                              help={t.help}
                              min={0}
                              max={100}
                              step={1}
                              value={Math.round((dnaValues[t.key] ?? t.read(selectedEnemyLive)) * 100)}
                              onChange={n => {
                                const v = (Math.trunc(n) || 0) / 100;
                                logic.setEnemyDna(selectedEnemyLive.id, t.key, v);
                                setDnaValues(prev => ({ ...prev, [t.key]: v }));
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </Group>
                  </div>
                )}

                <div ref={statsRef} className="min-w-0 self-start" style={AREA_STATS}>
                  <Group title="Upgrade Stats" icon={headerIcon(SlidersHorizontal)}
                    right={<span className="k-row-info tabular-nums"><span className="font-medium text-[var(--text-primary)]">{totalUpgradePoints}</span> / {totalUpgradeCap} points</span>}>
                    <div className="space-y-1">
                      {STAT_ORDER.map(stat => {
                        const statCap = capFor(stat);
                        const isLocked = statCap === 0;
                        const label = getStatLabel(stat, statNames);
                        const stepper = (
                          <Stepper big={phone} less={`Remove a point from ${label}`} more={`Add a point to ${label}`}
                            onLess={() => handleStatChange(stat, -1)} onMore={() => handleStatChange(stat, 1)}
                            lessOff={isLocked || editUpgrades[stat] <= 0} moreOff={isLocked || editUpgrades[stat] >= statCap}>
                            <span className={STAT_BOX}>{isLocked ? 0 : editUpgrades[stat]}</span>
                          </Stepper>
                        );
                        if (phone) return (
                          <div key={stat} className={`k-eps-stat${isLocked ? ' k-row-disabled' : ''}`}>
                            <span className="k-eps-stat-icon">{STAT_ICONS[stat]}</span>
                            <span className="k-eps-stat-name">{label}</span>
                            <span className="k-eps-stat-bar"><StatBar value={isLocked ? 0 : editUpgrades[stat]} cap={statCap} /></span>
                            <span className="k-eps-stat-step">{stepper}</span>
                          </div>
                        );
                        return (
                          <div key={stat} className={`flex items-center gap-2 h-7 text-[var(--text-primary)]${isLocked ? ' k-row-disabled' : ''}`}>
                            <span className="w-4 shrink-0 flex">{STAT_ICONS[stat]}</span>
                            <span className="w-[128px] shrink-0 text-[12px] leading-[1.25]">{label}</span>
                            <StatBar value={isLocked ? 0 : editUpgrades[stat]} cap={statCap} />
                            {stepper}
                          </div>
                        );
                      })}
                    </div>
                  </Group>
                </div>
              </div>
            </div>

            <footer className={touch && Math.min(LAYOUT_W[layout], maxW) < EPS_PAIR_W ? 'k-modal-foot px-3' : 'k-modal-foot'}>
              <Button variant="secondary" className={touch && Math.min(LAYOUT_W[layout], maxW) < EPS_PAIR_W ? 'min-w-0' : 'min-w-[104px]'} onClick={onClose}>Return</Button>
              <Button variant="primary" className={touch && Math.min(LAYOUT_W[layout], maxW) < EPS_PAIR_W ? 'flex-1 min-w-0' : 'min-w-[104px]'} onClick={handleConfirm}
                title="Applies the changes, closes the debug menu and resumes the game">Apply and Resume</Button>
            </footer>
          </div>
        </div>
      </div>
    </Backdrop>
  );
};
