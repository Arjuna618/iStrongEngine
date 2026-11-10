import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Eye, EyeOff, Globe, Gauge, Bot, FlaskConical, SearchX, Lightbulb, ArrowLeft, type AppIcon,
  DvShapeHp, DvProjectileHp, DvXpGain, DvShowAllMinimap, DvShowAllNames,
  DvEntityCounts, DvFrameTimings, DvJitter, DvMemory, DvDrawOps, DvNanRepairs, DvLoopErrors,
  DvStateLabel, DvRoleReadout, DvAimLaser, DvTargetLine, DvFollowMarker, DvThreatResponse, DvOrbitRing, DvFearMeter,
  DvNavigationDebug,
  DvWallShots, DvCornerAim, DvAimSelfMotion, DvAimTruth, DvAimGodly, DvPlayerHunt, DvDroneCloud, DvChaseRange,
  DvFarmAim, DvCornerFire, DvGunMountAim, DvCornerStand, DvCornerSidestep, DvGhostMode, DvPathBlocked,
  DvChaseGivenUp, DvGunRangeStandoff, DvStandAside, DvShotBack, DvShieldHits, DvAimReaction, DvAimError,
  DvHuntedFlee, DvFleeReroute, DvDeadEndEscape, DvFearRearm, DvFleeStand, DvFleeCommit, DvBorderSqueeze,
  DvRoleRepairs, DvOverlayCost, DvSpawnStats, DvRarityWarning,
} from './ui/icons';
import { GameLogic } from '../game/GameLogic';
import { GameState } from '../types';
import { useModalMaxHeight, useModalMaxWidth } from '../utils/useMenuScale';
import { isTouchScreen, isPhoneUi } from '../utils/device';
import { syncDebugHudSession, noteDebugHudEnabled } from '../utils/debugHudOrder';
import { Modal } from './kit/Modal';
import { Collapse } from './kit/Collapse';
import { useSwapStage } from './kit/motion';
import { Button, Switch, SearchField, PickRow, EmptyState, Crumbs, emptyArt, IconButton } from './kit/kit';
import { HelpTooltip } from './shared/HelpTooltip';
import { useDebugRevokeClose } from './shared/debugRevoke';

interface Props {
  logic: GameLogic;
  onClose: () => void;
}

type BoolKey = { [K in keyof GameState]: GameState[K] extends boolean ? K : never }[keyof GameState];

interface RowDef {
  key: BoolKey; label: string; icon: AppIcon; hint: string;
  dark?: true;
  noMaster?: true;
}

const WORLD_ROWS: RowDef[] = [
  { key: 'debugShowShapeHP', label: 'Shape HP / Shield', icon: DvShapeHp, hint: 'HP and shield values above shapes and your tank.' },
  { key: 'debugShowProjectileHP', label: 'Projectile HP', icon: DvProjectileHp, hint: 'HP values on bullets and drones.' },
  { key: 'debugShowXpGain', label: 'XP Gain', icon: DvXpGain, hint: 'Floating XP numbers above whoever earned them.' },
  { key: 'showAllMinimap', label: 'Show All Minimap', icon: DvShowAllMinimap, hint: 'Reveals every tank on the minimap.' },
  { key: 'debugShowAllNames', label: 'Show All Names', icon: DvShowAllNames, hint: 'Shows every name, even of hidden things: stealth tanks and invisible black holes and wormholes. It works even with player names turned off.' },
  { key: 'dbgDarkNoFog', label: 'Hide The Fog', icon: EyeOff, hint: 'You see the whole map with no fog. The bots and every rule still play in the dark, so you can watch how they behave. Only in a match with darkness.', dark: true, noMaster: true },
];

const HUD_ROWS: RowDef[] = [
  { key: 'dbgHudEntities', label: 'Entity Counts', icon: DvEntityCounts, hint: 'Live food and projectile totals, per area on multi area maps.' },
  { key: 'dbgHudPerf', label: 'Frame Timings', icon: DvFrameTimings, hint: 'Milliseconds spent on AI, collisions and projectiles.' },
  { key: 'dbgHudJitter', label: 'Jitter', icon: DvJitter, hint: 'How uneven the recent frame times were.' },
  { key: 'dbgHudMemory', label: 'Memory', icon: DvMemory, hint: 'Heap use and map cache count. Chrome only.' },
  { key: 'dbgHudDrawOps', label: 'Draw Ops / LOD', icon: DvDrawOps, hint: 'Estimated draw calls and the detail level mix.' },
  { key: 'dbgHudWaves', label: 'Map Events', icon: DvDrawOps, hint: 'The wave of this match, what holds it, and how many bodies its Map Events have.' },
  { key: 'dbgShowAreaMarks', label: 'Custom Area Names', icon: DvDrawOps, hint: 'Outlines and names of the Custom Areas in a match, the invisible ones too.' },
  { key: 'dbgHudNaN', label: 'NaN Repairs', icon: DvNanRepairs, hint: 'Silent unless a value had to be restored.' },
  { key: 'dbgHudLoopErrors', label: 'Loop Errors', icon: DvLoopErrors, hint: 'Silent unless the game loop threw. Turn on when hunting a crash.' },
];

const AI_ROWS: RowDef[] = [
  { key: 'dbgAiStateLabel', label: 'State Label', icon: DvStateLabel, hint: 'The state word plus health and shield rows.' },
  { key: 'dbgAiRoleColumn', label: 'Role Readout', icon: DvRoleReadout, hint: 'Power star and the aggressor or protector verdict.' },
  { key: 'dbgAiAimLaser', label: 'Aim Laser', icon: DvAimLaser, hint: 'Red dashed line along where the barrel points.' },
  { key: 'dbgAiTargetLine', label: 'Target Line', icon: DvTargetLine, hint: 'Green line and dot to the point the bot aims at. It shows only while the bot may fire there, so it blinks when its aim drops.' },
  { key: 'dbgAiFollowMarker', label: 'Follow Marker', icon: DvFollowMarker, hint: 'Orange dashed line to the last known target position.' },
  { key: 'dbgAiThreatLine', label: 'Threat Response', icon: DvThreatResponse, hint: 'Cyan line and ring for the shot a bot is dodging.' },
  { key: 'dbgAiOrbitRing', label: 'Orbit Ring', icon: DvOrbitRing, hint: 'The distance a bot is trying to keep while attacking.' },
  { key: 'dbgAiFearMeter', label: 'Fear Meter', icon: DvFearMeter, hint: 'Orange bar under the health bar as a bot gets scared.' },
  { key: 'dbgAiNavDebug', label: 'Navigation Debug', icon: DvNavigationDebug, hint: 'Route dots, branch ring, waypoints and give up marks.' },
  { key: 'dbgAiLight', label: 'Light Outlines', icon: Lightbulb, hint: 'The outline of what each tank can see in the dark: the circle round it, the beam toward its aim and the beam of each barrel. Only in a match with darkness.', dark: true },
];

const FEATURE_ROWS: RowDef[] = [
  { key: 'dbgHudWallShots', label: 'Wall Shots', icon: DvWallShots, hint: 'Rounds bots fired, how many flew into a wall before reaching their target, and how many died inside the barrel against a wall. Shots that simply missed first are not counted.' },
  { key: 'dbgHudAttackAim', label: 'Corner Aim', icon: DvCornerAim, hint: 'How often bots kept a gun on a tank they cannot see while walking around a corner, plus how many times they crossed the corner where the gun used to swing away.' },
  { key: 'dbgHudAimSelf', label: 'Aim Self Motion', icon: DvAimSelfMotion, hint: 'Bots allow for their own movement carrying a shot sideways. Shows how many aims used that correction and the average angle it fixed. It scales with Aimbot Strength, so 0 aims as before.' },
  { key: 'dbgHudAimTruth', label: 'Aim Truth', icon: DvAimTruth, hint: 'Bots allow for bullets slowing down in flight instead of assuming launch speed forever. Shows how many aims used it, the extra lead it added, and how often a substitute gun supplied the numbers.' },
  { key: 'dbgHudAimGodly', label: 'Aim Godly', icon: DvAimGodly, hint: 'The two levers Aimbot Strength drives, averaged over this test: aim sharpness, and how much of the extra smoothing on YOUR movement was removed. At strength 0 they read 0.25 and 0%.' },
  { key: 'dbgHudPlayerHunt', label: 'Player Hunt', icon: DvPlayerHunt, hint: 'Bots that count YOU as a hunter, which needs you to have damaged them and be in their sight. Shows how many count you now, how many rate you strongest, and moments spent giving ground to you.' },
  { key: 'dbgHudDroneCloud', label: 'Drone Cloud', icon: DvDroneCloud, hint: 'Bots steering around enemy drones and minions instead of driving into them. The second number is how often a whole cloud was treated as one wall rather than a single drone.' },
  { key: 'dbgHudChaseFlap', label: 'Chase Range', icon: DvChaseRange, hint: 'Bots that kept chasing a target which ran past what they can see, instead of flicking between chasing and attacking many times a second. Shows how many of those flicks were stopped.' },
  { key: 'dbgHudFarmAim', label: 'Farm Aim', icon: DvFarmAim, hint: 'Bots keeping their gun on a shape while they walk around a wall to reach it, plus how far their guns sit from what they are farming.' },
  { key: 'dbgHudCornerFire', label: 'Corner Fire', icon: DvCornerFire, hint: 'Stands where one bot kept attacking another for seconds on end without taking any health off it. Counts the event itself, anywhere on the map.' },
  { key: 'dbgHudAimMount', label: 'Gun Mount Aim', icon: DvGunMountAim, hint: 'Time bots have spent too close to what they are aiming at for an off centre gun to bear on it, and the largest correction the exact aim solve has made.' },
  { key: 'dbgHudPeekFreeze', label: 'Corner Stand', icon: DvCornerStand, hint: 'Corner fights where a bot gun could see the target but its body could not. Shows how many, total held time, the longest hold, the share spent going nowhere, and how many holds were released.' },
  { key: 'dbgHudCornerSidestep', label: 'Corner Sidestep', icon: DvCornerSidestep, hint: 'Corner fights where a bot was told to peek further out but was not allowed to move any closer. Shows the time lost standing there, and how much of it the new sideways step took over.' },
  { key: 'dbgHudGhost', label: 'Ghost Mode', icon: DvGhostMode, hint: 'Ghost mode made honest. Shows how many rounds were hidden from the bots because they could not possibly hurt anything, plus how long you and how long any bots have been ghosts. The first number should sit at zero unless something is ghosted.' },
  { key: 'dbgHudPathBlock', label: 'Path Blocked', icon: DvPathBlocked, hint: 'Bots walking straight at a much stronger tank they can plainly see. Shows how often it happens, how often there was no gap to get past, and how the bot answered it.' },
  { key: 'dbgHudChaseFutile', label: 'Chase Given Up', icon: DvChaseGivenUp, hint: 'Chases a bot dropped because it was not gaining ground on its target and was not fighting it either. Shows how many were dropped, how many restarts were turned away afterwards, and the total time bots spent chasing without getting any closer.' },
  { key: 'dbgHudStandoff', label: 'Gun Range Standoff', icon: DvGunRangeStandoff, hint: 'Share of fighting time bots stood beyond the reach of their own round, then how much of that went to pulling in, pushing out, capping retreat at sight range, and fixing a bad distance band. Pushing out is off.' },
  { key: 'dbgHudYield', label: 'Stand Aside', icon: DvStandAside, hint: 'Switched off, so this stays at zero and says OFF. It used to stop one of two bots chasing each other. Shows how often, total time, and refused restarts.' },
  { key: 'dbgHudRetaliate', label: 'Shot Back', icon: DvShotBack, hint: 'Bots that went after a stronger tank which shot them from behind cover, instead of carrying on eating shapes.' },
  { key: 'dbgHudProvokeShield', label: 'Shield Hits Noticed', icon: DvShieldHits, hint: 'Shots a bot shield soaked up completely, which now make the bot fight back instead of ignoring you.' },
  { key: 'dbgHudAimReact', label: 'Aim Reaction', icon: DvAimReaction, hint: 'The bot reaction delay, and how many times a gun briefly kept shooting at the old spot after a target swap.' },
  { key: 'dbgHudAimError', label: 'Aim Error', icon: DvAimError, hint: 'How far bot barrels sit from their targets, in degrees. It shows only while a bot is attacking or chasing.' },
  { key: 'dbgHudStalkFlee', label: 'Hunted Flee', icon: DvHuntedFlee, hint: 'Bots that ran from a hunter they saw coming.' },
  { key: 'dbgHudFleeReroute', label: 'Flee Reroute', icon: DvFleeReroute, hint: 'Times a fleeing bot turned around because a stronger tank appeared in its path.' },
  { key: 'dbgHudFleeDeadEnd', label: 'Dead End Escape', icon: DvDeadEndEscape, hint: 'Times a fleeing bot was pushed back out of a dead end, and times one turned and fought because its chaser was holding the only way out.' },
  { key: 'dbgHudFearRearm', label: 'Fear Re Arm Held', icon: DvFearRearm, hint: 'Seconds that bots were stopped from flipping straight back to running away, in the short window after a scare ends. Split into the fear of the player and the low health panic.' },
  { key: 'dbgHudFleeStand', label: 'Flee Stand', icon: DvFleeStand, hint: 'Bots that stopped running away to fight something in their path, and how many of those escapes carried on instead because the tank in the way was clearly stronger than them.' },
  { key: 'dbgHudFleeCommit', label: 'Flee Commit', icon: DvFleeCommit, hint: 'Seconds that scared bots kept running after losing sight of you, instead of forgetting the scare the instant you stepped behind a wall. The second number is the fault this replaces, bots still carrying the scare while doing something else entirely, and it should stay at zero.' },
  { key: 'dbgHudBorderSqueeze', label: 'Border Squeeze', icon: DvBorderSqueeze, hint: 'Committed edge crossings, plus the total time bots have spent leaning into the soft map edge to get around things.' },
  { key: 'dbgHudRoleRepair', label: 'Role Repairs', icon: DvRoleRepairs, hint: 'Times a bot dropped a stale trapped verdict, and how many weak bots hold a role now. It shows only in modes where bots level up and take roles.' },
  { key: 'dbgHudOverlayCost', label: 'Overlay Cost', icon: DvOverlayCost, hint: 'What the AI overlay itself costs per frame.' },
  { key: 'showSpawnStats', label: 'Spawn Stats', icon: DvSpawnStats, hint: 'Shape spawn counts by rarity and shape.' },
  { key: 'dbgHudRarity', label: 'Rarity Warning', icon: DvRarityWarning, hint: 'Shows while the shape rarity test multiplier is raised.' },
];

const ALL_ROWS: RowDef[] = [...WORLD_ROWS, ...HUD_ROWS, ...AI_ROWS, ...FEATURE_ROWS];

type GroupId = 'world' | 'hud' | 'ai' | 'feature';

interface GroupDef {
  id: GroupId;
  title: string;
  icon: AppIcon;
  note?: string;
  rows: RowDef[];
  derivedKey?: BoolKey;
}

const GROUPS: GroupDef[] = [
  { id: 'world', title: 'World Overlays', icon: Globe, rows: WORLD_ROWS },
  { id: 'hud', title: 'HUD Readouts', icon: Gauge, rows: HUD_ROWS },
  { id: 'ai', title: 'AI Logic Overlay', icon: Bot, rows: AI_ROWS, derivedKey: 'debugShowAILogic' },
  {
    id: 'feature', title: 'Feature Tests', icon: FlaskConical,
    note: 'Counters that came with one fix each. Handy while checking that fix, rarely needed after.',
    rows: FEATURE_ROWS,
  },
];

const ALL_ROW_KEYS: BoolKey[] = ALL_ROWS.map(r => r.key);

const ALL_KEYS: BoolKey[] = [
  ...ALL_ROW_KEYS,
  ...GROUPS.map(g => g.derivedKey).filter((k): k is BoolKey => !!k),
];

type SubId = 'aim' | 'corner' | 'chase' | 'flee' | 'move' | 'tools' | 'other';
interface SubDef { id: SubId; title: string; rows: RowDef[] }
const FEATURE_SUB_KEYS: readonly { id: Exclude<SubId, 'other'>; title: string; keys: readonly BoolKey[] }[] = [
  { id: 'aim', title: 'Aim and Shots', keys: ['dbgHudAimError', 'dbgHudAimReact', 'dbgHudAimTruth', 'dbgHudAimSelf', 'dbgHudAimGodly', 'dbgHudAimMount', 'dbgHudFarmAim', 'dbgHudAttackAim', 'dbgHudWallShots'] },
  { id: 'corner', title: 'Corner Fights', keys: ['dbgHudCornerFire', 'dbgHudPeekFreeze', 'dbgHudCornerSidestep'] },
  { id: 'chase', title: 'Chase and Fight', keys: ['dbgHudPlayerHunt', 'dbgHudChaseFlap', 'dbgHudChaseFutile', 'dbgHudStandoff', 'dbgHudYield', 'dbgHudRetaliate', 'dbgHudProvokeShield', 'dbgHudRoleRepair'] },
  { id: 'flee', title: 'Fear and Flee', keys: ['dbgHudStalkFlee', 'dbgHudFleeReroute', 'dbgHudFleeDeadEnd', 'dbgHudFleeStand', 'dbgHudFleeCommit', 'dbgHudFearRearm'] },
  { id: 'move', title: 'Movement', keys: ['dbgHudPathBlock', 'dbgHudDroneCloud', 'dbgHudBorderSqueeze'] },
  { id: 'tools', title: 'Debug Tool Counters', keys: ['dbgHudGhost', 'dbgHudOverlayCost', 'showSpawnStats', 'dbgHudRarity'] },
];
const FEATURE_SUBS: SubDef[] = (() => {
  const byKey = new Map<BoolKey, RowDef>();
  for (const r of FEATURE_ROWS) byKey.set(r.key, r);
  const used = new Set<BoolKey>();
  const subs: SubDef[] = FEATURE_SUB_KEYS.map(s => {
    const rows: RowDef[] = [];
    for (const k of s.keys) {
      const r = byKey.get(k);
      if (r && !used.has(k)) { used.add(k); rows.push(r); }
    }
    return { id: s.id, title: s.title, rows };
  });
  const rest = FEATURE_ROWS.filter(r => !used.has(r.key));
  if (rest.length > 0) subs.push({ id: 'other', title: 'Other Counters', rows: rest });
  return subs;
})();

const INTRO = 'Debug mode starts quiet, with one line above the minimap and nothing else. Every switch here starts off, '
  + 'so you turn on only what you are actually looking at. Pick a group to see its switches, or search them all. The '
  + 'switch beside a group turns everything inside it on or off in one click. When only part of a group is on, that '
  + 'switch shows a dash and its count says how many.';

interface ViewMemo { group: GroupId; sub: SubId | null }
const DEFAULT_VIEW: ViewMemo = { group: 'world', sub: null };
let _viewMemo: ViewMemo = DEFAULT_VIEW;
let _viewMemoSession = Number.NaN;
const DV_WIDTH = 1080;
const DV_CHROME_H = 116;
const DV_BODY_MAX = 480;
const DV_BODY_MIN = 240;
const DV_BODY_MIN_TOUCH = 120;
const DV_STACK_BELOW = 600;
const DV_SIDE_W = 256;

const Tile = React.memo(function Tile({ row, group, checked, onSet }: {
  row: RowDef; group: GroupDef; checked: boolean; onSet: (g: GroupDef, key: BoolKey, value: boolean) => void;
}) {
  const I = row.icon;
  return (
    <label className={checked ? 'k-dv-tile k-dv-tile-on' : 'k-dv-tile'}>
      <span className="k-dv-media" aria-hidden="true"><I size={16} /></span>
      <span className="k-dv-tile-text">
        <span className="k-row-lead"><HelpTooltip text={row.hint} /></span>
        <span className="k-dv-tile-label">{row.label}</span>
      </span>
      <Switch checked={checked} onChange={v => onSet(group, row.key, v)} label={row.label} />
    </label>
  );
});

const countOn = (st: GameState, rows: RowDef[]): number => {
  let n = 0;
  for (const r of rows) if (st[r.key]) n++;
  return n;
};

export const DebugVisibilityPopup: React.FC<Props> = ({ logic, onClose }) => {
  const phone = isPhoneUi();
  const maxH = useModalMaxHeight(phone ? 0 : undefined);
  const maxW = useModalMaxWidth(phone ? 0 : undefined);
  const modalW = Math.min(DV_WIDTH, maxW);
  const stackStage = useSwapStage(modalW < DV_STACK_BELOW);
  const stacked = stackStage.shown;
  const bodyH = Math.max(isTouchScreen() ? DV_BODY_MIN_TOUCH : DV_BODY_MIN, Math.min(DV_BODY_MAX, Math.round(maxH - DV_CHROME_H)));

  const st = logic.state;
  const darkOn = logic.darknessInUse();
  const shows = (r: RowDef): boolean => !r.dark || darkOn;

  const [view, setView] = useState<ViewMemo>(() => {
    const session = logic.testModeStartTime;
    syncDebugHudSession(session);
    if (_viewMemoSession !== session) {
      _viewMemo = DEFAULT_VIEW;
      _viewMemoSession = session;
    }
    return _viewMemo;
  });

  useEffect(() => { _viewMemo = view; }, [view]);

  const frameClose = useRef<(() => void) | null>(null);
  useDebugRevokeClose(logic, () => (frameClose.current ?? onClose)());
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const searching = q !== '';
  const [phonePage, setPhonePage] = useState<'list' | 'group'>('list');
  const pageStage = useSwapStage<string>(!phone ? 'wide' : searching ? 'search' : phonePage);

  const viewKey = searching ? 'search' : `${view.group}|${view.sub ?? ''}`;
  const stage = useSwapStage(viewKey);
  const shownSearching = stage.shown === 'search';
  const [shownGroupId, shownSubId] = shownSearching ? [view.group, null] : stage.shown.split('|');
  const lastQ = useRef(q);
  if (q) lastQ.current = q;
  const shownQ = shownSearching ? (q || lastQ.current) : q;

  const middleRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (middleRef.current) middleRef.current.scrollTop = 0; }, [stage.shown, q, pageStage.shown]);

  const applyGroup = useCallback((g: GroupDef, patch: Record<string, boolean>) => {
    for (let i = g.rows.length - 1; i >= 0; i--) {
      const k = g.rows[i].key;
      if (Object.prototype.hasOwnProperty.call(patch, k) && patch[k] && !logic.state[k]) {
        noteDebugHudEnabled(k);
      }
    }
    if (g.derivedKey) {
      const live = logic.state;
      let any = false;
      for (const r of g.rows) {
        const next = Object.prototype.hasOwnProperty.call(patch, r.key) ? patch[r.key] : !!live[r.key];
        if (next) { any = true; break; }
      }
      patch[g.derivedKey] = any;
    }
    logic.updateState(patch as unknown as Partial<GameState>);
  }, [logic]);

  const setOne = useCallback((g: GroupDef, key: BoolKey, value: boolean) => {
    applyGroup(g, { [key]: value });
  }, [applyGroup]);

  const setAll = (g: GroupDef, value: boolean) => {
    const patch: Record<string, boolean> = {};
    for (const r of g.rows) if (!r.noMaster && shows(r)) patch[r.key] = value;
    applyGroup(g, patch);
  };

  const setKeys = (keys: BoolKey[], value: boolean) => {
    const patch: Record<string, boolean> = {};
    for (const k of keys) patch[k] = value;
    logic.updateState(patch as unknown as Partial<GameState>);
  };

  const activeCount = ALL_ROW_KEYS.reduce((n, k) => n + (st[k] ? 1 : 0), 0);

  const group = GROUPS.find(g => g.id === shownGroupId) ?? GROUPS[0];
  const activeSub = group.id === 'feature' && shownSubId ? FEATURE_SUBS.find(s => s.id === shownSubId) ?? null : null;

  const grid = (g: GroupDef, rows: RowDef[]) => (
    <div className="k-dv-grid">
      {rows.filter(shows).map(r => <Tile key={r.key} row={r} group={g} checked={!!st[r.key]} onSet={setOne} />)}
    </div>
  );
  const countLabel = (rows: RowDef[]) => { const v = rows.filter(shows); return <span className="k-hint tabular-nums shrink-0">{countOn(st, v)} / {v.length} on</span>; };

  let middle: React.ReactNode;
  if (shownSearching) {
    const hits: { g: GroupDef; rows: RowDef[] }[] = [];
    for (const g of GROUPS) {
      const rows = g.rows.filter(r => shows(r) && (r.label.toLowerCase().includes(shownQ) || r.hint.toLowerCase().includes(shownQ)));
      if (rows.length > 0) hits.push({ g, rows });
    }
    middle = hits.length === 0
      ? <EmptyState icon={emptyArt(SearchX)} title="No matches" hint={`No switch is named or described with "${shownQ}".`} />
      : hits.map(({ g, rows }) => (
        <section key={g.id} className="space-y-2">
          <div className="k-section-head"><span className="k-subhead">{g.title}</span>{countLabel(rows)}</div>
          {grid(g, rows)}
        </section>
      ));
  } else if (activeSub) {
    middle = (<>
      <div className="k-section-head">
        <Crumbs items={[{ label: group.title, onClick: () => setView({ group: 'feature', sub: null }) }, { label: activeSub.title }]} />
        {countLabel(activeSub.rows)}
      </div>
      {grid(group, activeSub.rows)}
    </>);
  } else {
    middle = (<>
      <div className="k-section-head">
        <span className="k-group-title">
          {group.note && <HelpTooltip text={group.note} />}
          <span className="truncate">{group.title}</span>
        </span>
        {countLabel(group.rows)}
      </div>
      {group.id === 'feature'
        ? FEATURE_SUBS.map(s => (
          <section key={s.id} className="space-y-2">
            <div className="k-section-head"><span className="k-subhead">{s.title}</span>{countLabel(s.rows)}</div>
            {grid(group, s.rows)}
          </section>
        ))
        : grid(group, group.rows)}
    </>);
  }

  const groupList = (<>
    <div className="flex items-center gap-1.5">
      <HelpTooltip text={INTRO} />
      <span className="k-subhead">Groups</span>
    </div>
    <div className="k-stack">
      {GROUPS.map(g => {
        const gv = g.rows.filter(r => shows(r) && !r.noMaster);
        const on = countOn(st, gv);
        const total = gv.length;
        const all = total > 0 && on === total;
        const none = on === 0;
        const shownRows = g.rows.filter(shows);
        const shownOn = countOn(st, shownRows);
        const GI = g.icon;
        return (
          <div key={g.id}>
            <PickRow icon={<GI size={16} />} title={g.title} meta={`${shownOn} / ${shownRows.length} on`}
              selected={!phone && !searching && view.group === g.id}
              onPick={() => { setView({ group: g.id, sub: null }); setQuery(''); if (phone) setPhonePage('group'); }}
              actions={<span className="flex" title={`Turn every switch of this group ${all ? 'off' : 'on'}`}>
                <Switch checked={all} mixed={!all && !none} onChange={() => setAll(g, !all)}
                  label={`Turn every switch in ${g.title} ${all ? 'off' : 'on'}`} />
              </span>} />
            {g.id === 'feature' && !phone && (
              <Collapse open={!searching && view.group === 'feature'}>
                <div className="k-subrows">
                  {FEATURE_SUBS.map(s => {
                    const picked = view.sub === s.id;
                    return (
                      <button key={s.id} type="button" aria-pressed={picked}
                        className={picked ? 'k-subrow k-dv-subrow k-dv-subrow-on' : 'k-subrow k-dv-subrow'}
                        onClick={() => setView({ group: 'feature', sub: picked ? null : s.id })}>
                        <span className="truncate">{s.title}</span>
                        <span className="k-dv-subrow-count">{countOn(st, s.rows)} / {s.rows.length}</span>
                      </button>
                    );
                  })}
                </div>
              </Collapse>
            )}
          </div>
        );
      })}
    </div>
  </>);

  const phoneBody = (
    <div className="flex flex-col flex-auto min-h-0">
      <div className="k-dv-phone-top k-lib-side">
        <SearchField value={query} onChange={setQuery} placeholder="Search switches" />
      </div>
      <div className={`flex flex-col flex-auto min-h-0 ${pageStage.swapClass}`} inert={pageStage.inert || undefined}>
        {pageStage.shown === 'list' ? (
          <div className="k-dv-side k-lib-side flex-1 min-h-0 overflow-y-auto popup-scrollbar p-4 space-y-3">{groupList}</div>
        ) : pageStage.shown === 'search' || activeSub ? (
          <div ref={middleRef} className={`k-lib-content flex-1 min-h-0 overflow-y-auto popup-scrollbar p-4 space-y-4 ${stage.swapClass}`}>{middle}</div>
        ) : (<>
          <div className="k-dv-phone-bar">
            <IconButton label="All groups" onClick={() => setPhonePage('list')}><ArrowLeft size={18} /></IconButton>
            <span className="k-group-title min-w-0 flex-1">
              {group.note && <HelpTooltip text={group.note} />}
              <span className="truncate">{group.title}</span>
            </span>
            {countLabel(group.rows)}
          </div>
          <div ref={middleRef} className={`k-lib-content flex-1 min-h-0 overflow-y-auto popup-scrollbar p-4 space-y-4 ${stage.swapClass}`}>
            {group.id === 'feature'
              ? FEATURE_SUBS.map(s => (
                <section key={s.id} className="space-y-2">
                  <div className="k-section-head"><span className="k-subhead">{s.title}</span>{countLabel(s.rows)}</div>
                  {grid(group, s.rows)}
                </section>
              ))
              : grid(group, group.rows)}
          </div>
        </>)}
      </div>
    </div>
  );

  return (
    <Modal title="Debug Visibility" icon={<Eye size={18} />} onClose={onClose} width={DV_WIDTH} fit surface="content" phoneFull
      bodyClassName="k-modal-body-flush flex flex-col"
      footer={(close) => { frameClose.current = close; return <>
        <Button variant="secondary" icon={<EyeOff size={14} />} onClick={() => setKeys(ALL_KEYS, false)} title="Switch every debug visual off">
          All Off
        </Button>
        <span className="k-hint tabular-nums flex-1 min-w-0 truncate">{activeCount === 0 ? 'Nothing on' : `${activeCount} on`}</span>
        <Button variant="primary" onClick={close}>Done</Button>
      </>; }}>
      {phone ? phoneBody : (
      <div className={`${stacked ? 'flex flex-col flex-auto min-h-0' : 'flex flex-auto min-h-0'} ${stackStage.swapClass}`} inert={stackStage.inert || undefined} style={{ height: bodyH }}>
        <aside
          className={stacked
            ? 'k-dv-side k-lib-side shrink-0 border-b border-[var(--alpha-divider)] overflow-y-auto popup-scrollbar p-4 space-y-3'
            : 'k-dv-side k-lib-side shrink-0 border-r border-[var(--alpha-divider)] overflow-y-auto popup-scrollbar p-4 space-y-3'}
          style={stacked ? { maxHeight: Math.round(bodyH * 0.45) } : { width: DV_SIDE_W }}>
          <SearchField value={query} onChange={setQuery} placeholder="Search switches" />
          {groupList}
        </aside>

        <div ref={middleRef} className={`k-lib-content flex-1 min-w-0 min-h-0 overflow-y-auto popup-scrollbar p-4 space-y-4 ${stage.swapClass}`}>
          {middle}
        </div>
      </div>
      )}
    </Modal>
  );
};
