import type { AreaShape } from '../areaShape';
import type { ShapeBodySpec, TouchRow } from './thingBody';
import { BASE_AREAS } from '../baseAreasSwitch';
import { SMALL_FIX } from '../smallFixSwitch';
import type { ColourWord } from './colourWord';

export type Id = number;

export interface Ref { id: Id; n: string; a?: string; }

export interface Row {
  id: Id;
  k: string;
  v?: number;
  off?: true;
  note?: string;
  a: Record<string, unknown>;
}

export interface Ramp {
  base?: number; per?: number; pow?: number;
  min?: number; max?: number;
  every?: { n: number; rem: number; mult: number }[];
}

export type Num =
  | number
  | { r: [number, number] }
  | { ramp: Ramp }
  | { curve: [number, number][] }
  | { f: string };

export interface WaveTest { from?: number; to?: number; every?: number; list?: number[]; }
export const SIDE_WORDS: readonly { word: string; shown: string }[] = [
  { word: 'team1', shown: 'Blue' },
  { word: 'team2', shown: 'Red' },
  { word: 'team3', shown: 'Green' },
  { word: 'team4', shown: 'Purple' },
  { word: 'team5', shown: 'Dreadnoughts' },
  { word: 'zombies', shown: 'Zombies' },
  { word: 'killer', shown: 'Its Killer\'s Side' },
  { word: 'ffa', shown: 'Free For All' },
  { word: 'neutral', shown: 'Neutral' },
  { word: 'player', shown: 'The Player\'s Side' },
  { word: 'againstPlayer', shown: 'Against The Player' },
];
export function swapSideNamesTwoThree(): void {
  const t = SIDE_WORDS as { word: string; shown: string }[]; const a = t[1].shown; t[1].shown = t[2].shown; t[2].shown = a;
}
export type TeamWord = string;
export const DEFAULT_SIDE: TeamWord = 'againstPlayer';

export type Target =
  | { w: 'subject' | 'other' | 'killer' | 'self' | 'lastSpawned' | 'player' | 'allPlayers' | 'allTanks' | 'leader' | 'followers' | 'homeMates' }
  | { w: 'entity' | 'type' | 'tag' | 'inArea'; ref: Ref }
  | { w: 'tank'; word: string }
  | { w: 'team'; team: TeamWord }
  | { w: 'colour'; colour: ColourWord }
  | { w: 'pick'; of: Target; n: Num; how: 'random' | 'nearest' | 'lowestHealth' };

export interface BodyTest {
  types?: Ref[]; tags?: Ref[]; tanks?: string[]; teams?: TeamWord[]; groups?: Ref[]; forms?: Ref[];
  colours?: ColourWord[];
  boss?: boolean; player?: boolean;
}

export interface PlaceRule {
  how: 'random' | 'edge' | 'center' | 'ring';
  gap?: number;
  avoid?: Ref[];
  awayFromPlayers?: { base: number; perSize: number };
  keepFromDamaging?: number;
  onFull: 'wait' | 'ignoreGap' | 'skip';
}
export const DEFAULT_PLACE_RULE: PlaceRule = { how: 'random', onFull: 'wait' };

export type Place =
  | { w: 'in'; areas: Ref[] | 'plan'; rule?: PlaceRule }
  | { w: 'subject' }
  | { w: 'point'; cx: number; cy: number }
  | { w: 'homeOf'; of: Target };

export interface ZoneRect { gx: number; gy: number; cw: number; ch: number; }
export interface ZoneLike extends ZoneRect {
  id: number;
  team?: number;
  kind?: string;
  color?: string; colorMap?: number; colorFree?: string; opacity?: number;
  bounce?: number; spare?: string[];
  uid?: Id;
  name?: string;
  more?: ZoneRect[];
  shape?: AreaShape;
  behaviors?: Row[];
  showName?: boolean;
  clearWalls?: boolean;
  note?: string;
  modeBase?: boolean;
  modeName?: string;
}

export interface KillArgs {
  whitelist?: string[];
  does?: 'dps' | 'pct' | 'instant';
  dps?: Num; pct?: Num;
  hitsRounds?: boolean;
  ownerCounts?: boolean;
  food?: 'none' | 'crashers' | 'all';
  foodPct?: Num;
  test?: 'touch' | 'centre';
  deathLine?: string;
}

export function behaviorsOf(z: ZoneLike): Row[] {
  if (Array.isArray(z.behaviors)) return z.behaviors;
  if (z.kind === 'kill') return [{ id: 0, k: 'kill', a: { whitelist: z.spare ? z.spare.slice() : [], does: 'instant', test: 'touch' } }];
  if (z.kind === 'bouncy') return [{ id: 0, k: 'bounce', a: { strength: typeof z.bounce === 'number' ? z.bounce : 1 } }];
  if (BASE_AREAS.ON !== 0 && (!z.kind || z.kind === 'base')) return [{ id: 0, k: 'teamBase', a: { team: ['team1', 'team2', 'team3', 'team4'][typeof z.team === 'number' && z.team >= 0 && z.team <= 3 ? z.team : 0] } }];
  return [];
}

export function rectsOf(z: ZoneLike): ZoneRect[] {
  if (zoneShapeOf(z) !== null) return [z];
  return z.more && z.more.length > 0 ? [z, ...z.more] : [z];
}
export function zoneShapeOf(z: ZoneLike): AreaShape | null {
  const s = z.shape;
  if (!s || typeof s !== 'object') return null;
  if (s.k === 'ellipse') return Number.isFinite(s.cx) && Number.isFinite(s.cy) && (s.rx ?? 0) > 0 && (s.ry ?? 0) > 0 ? s : null;
  if (s.k === 'poly') return Array.isArray(s.pts) && s.pts.length >= 6 ? s : null;
  return null;
}

export type TankPick = string | { list: { word: string; weight: number }[]; when: 'eachTime' | 'oncePerPlace' | 'oncePerSite' };

export interface SideSpec { team: TeamWord; camp?: 'none' | 'boss' | 'shape'; }
export interface ColourSpec { use: 'file' | 'team' | 'slot'; slot?: number; }

export interface EvolveRow { id: Id; plan?: Ref; wave: number; tank: string; }

export interface FormLink {
  to: Id | 'same' | 'none';
  team?: 'form' | 'killer';
  fallbackTeam?: TeamWord;
  delay?: Num;
  grace?: Num;
  place?: 'same' | { among: Ref[] };
  refill?: 'none' | 'shield' | 'all';
}

export interface EntityForm {
  id: Id; name: string;
  tank: TankPick;
  side?: SideSpec;
  colour?: ColourSpec;
  size?: number;
  score?: number;
  shownName?: string;
  tags?: Ref[];
  killLine?: string;
  order?: Row;
  onDeath?: FormLink;
  after?: { seconds: Num; to: Id; how: 'morph' | 'become'; refill?: 'none' | 'shield' | 'all' };
  evolve?: EvolveRow[];
}

export interface EntityType {
  byBase?: boolean;
  id: Id; name: string; folder?: Id; note?: string;
  forms: EntityForm[];
  side: SideSpec;
  brain?: 'full' | 'none' | 'order' | 'guard';
  guard?: { push?: boolean; strength?: number; range?: number };
  bossTier?: boolean;
  order?: Row;
  stands?: boolean;
  canDie?: boolean;
  seenByBots?: boolean;
  onLeaderboard?: boolean;
  onMinimap?: boolean;
  minimapAll?: boolean;
  countsAsKill?: boolean;
  inWalls?: boolean;
  showName?: boolean;
  score?: number;
  worth?: 'score' | 'none';
  names?: string[];
  killLine?: string;
  madeLines?: Record<string, string>;
  birthLook?: 'none' | 'food';
  health?: number; level?: number; skills?: Record<string, number>;
  pushable?: boolean;
  crashersIgnore?: boolean;
  canBeHealed?: boolean;
  contact?: 'tank' | 'shape';
  classWord?: string;
  sight?: number;
  shape?: ShapeBodySpec;
  touch?: TouchRow[];
  carry?: { line?: string; by?: 'hit' | 'kill'; one?: boolean; follow?: CarryFollow; home?: boolean };
  portalKeep?: number;
  control?: { word?: string };
}

export interface CarryFollow { distance?: number; circle?: number; pull?: number; top?: number; keep?: number }
export const CARRY_FOLLOW_DEF: Required<CarryFollow> = { distance: 10, circle: 152, pull: 45, top: 315, keep: 50 };
export const CARRY_FOLLOW_RANGE = { distance: { min: 0, max: 2000 }, circle: { min: -1440, max: 1440 }, pull: { min: 1, max: 100 }, top: { min: 1, max: 20000 }, keep: { min: 0, max: 95 } } as const;

export interface MapTank { id: Id; name: string; data: Record<string, unknown> }

export interface PlacedEntity {
  id: Id; name: string; type: Ref;
  cx: number; cy: number;
  angle?: number;
  home?: Ref;
  guardOf?: number;
  startForm?: Id;
  spots?: { form: Id; cx: number; cy: number }[];
  showName?: boolean;
  off?: true;
  note?: string;
}

export interface SpawnCard {
  id: Id;
  type?: Ref; tank?: string;
  shape?: string;
  weight: number;
  uniqueAlive?: boolean;
  size?: [number, number];
  fromWave?: number; toWave?: number;
  cost?: number;
}

export interface SpawnGroup {
  id: Id; name: string; off?: true; note?: string;
  cards: SpawnCard[];
  count: Num;
  spread?: number;
  round?: 'chance' | 'floor' | 'nearest';
  test?: WaveTest;
  chance?: Num;
  at: Ref[] | 'plan';
  split?: 'shared' | 'each';
  weights?: { id: Id; w: number }[];
  place?: PlaceRule;
  pace?: { how: 'even' | 'burst'; seconds?: Num; startAt?: Num };
  blocks?: boolean;
  side?: SideSpec;
  showName?: boolean;
  tags?: Ref[];
  body?: { brain?: EntityType['brain']; bossTier?: boolean; order?: Row; worth?: EntityType['worth']; score?: number; killLine?: string;
           onLeaderboard?: boolean; onMinimap?: boolean; sight?: number };
}

export interface SpecialWave {
  id: Id; name: string; off?: true; note?: string;
  weight: number;
  test?: WaveTest;
  groups: SpawnGroup[];
  message?: string;
}

export interface WaveCell { w: number; g: Id; n: number; }

export interface WaveOverride {
  id: Id; test: WaveTest;
  mode: 'replace' | 'add';
  groups: SpawnGroup[];
}

export interface WavePlan {
  id: Id; name: string; off?: true; note?: string;
  start: { on: 'match' | 'signal'; delay: Num; signal?: Ref };
  first?: number;
  last?: number | null;
  stream: Num;
  compose?: { mode: 'counts' | 'budget'; budget?: Num };
  groups: SpawnGroup[];
  specialChance?: Num;
  specials?: SpecialWave[];
  overrides?: WaveOverride[];
  cells?: WaveCell[];
  advance: {
    on: 'cleared' | 'timer' | 'clearedOrTimer' | 'aliveBelow' | 'manual';
    seconds?: Num;
    aliveBelow?: Num;
    break: Num;
    emptyBreakMult?: number;
  };
  place: PlaceRule;
  side: SideSpec;
  canGrow?: boolean;
}

export interface SpawnBehaviorArgs {
  mode: 'timer' | 'replace' | 'maxAlive' | 'waves' | 'signal';
  cards?: SpawnCard[];
  every?: Num; perSpawn?: Num;
  delay?: Num;
  maxAlive?: Num; refillEvery?: Num;
  total?: Num;
  plan?: Ref;
  startAfter?: Num;
  place?: PlaceRule; side?: SideSpec;
  enabledAtStart?: boolean;
  showName?: boolean;
  signal?: Ref;
  body?: SpawnGroup['body'];
  tags?: Ref[];
}

export interface Rule {
  id: Id; name: string; folder?: Id; off?: true; note?: string;
  owner?: Ref;
  when: Row[];
  cond: Row[];
  then: Row[];
  run?: 'single' | 'restart' | 'queue' | 'parallel';
  perSubject?: boolean;
  maxRuns?: number;
  once?: boolean; cooldown?: number; everyNth?: number;
  outlives?: boolean;
  params?: { id: Id; name: string; type: 'number' }[];
  shipped?: string;
  shortcut?: string;
}

export interface Sequence {
  id: Id; name: string; folder?: Id; note?: string;
  tracks: { id: Id; name: string; clips: { id: Id; at: number; step: Row }[] }[];
  lockInput?: boolean; skippable?: boolean; timeout?: number;
  whileHeld?: 'protect' | 'botsStop' | 'nothing';
}

export interface Named { id: Id; name: string; note?: string; }
export interface VarDef extends Named { kind: 'number' | 'onoff'; start: number; scope: 'match' | 'team' | 'body'; }
export interface TimerDef extends Named {
  seconds: Num;
  marks?: number[];
  repeat?: boolean;
  showOnHud?: boolean;
}
export interface StatusDef extends Named {
  seconds: Num | null;
  stack?: 'restart' | 'extend' | 'ignore';
  effects: Row[];
  onDeath?: 'ends' | 'stays';
  onTankChange?: 'ends' | 'stays';
}
export interface AreaGroup extends Named { members: Ref[]; }
export interface TankGroup extends Named {
  tanks: string[];
  debuff?: { resist?: number; health?: number };
  stop?: number;
  portals?: { rethinkS?: number; rest?: boolean; restMin?: number };
}

export interface MatchRules {
  ambientBosses?: boolean;
  ambientSentries?: boolean;
  ambientSentinels?: boolean;
  ambientCrashers?: boolean;
  food?: boolean;
  foodIn?: Ref;
  teamBots?: 'mode' | 'off';
  respawn?: 'mode' | 'spawnPlacesOnly';
  treeSwaps?: { from: string; to?: string }[];
  treeAdds?: { parent: string; tier: number; tanks: string[] }[];
  healersScoreByHealing?: boolean;
  noUpgradeCooldown?: boolean;
  fullScoreOnKills?: boolean;
  holderShare?: number;
  maxTanksAlive?: number;
  killsPay?: 'all' | 'risen';
  shareRoom?: boolean;
  killsTurnSides?: boolean;
  shrink?: { after: number; minutes: number; to: number };
  clans?: { min: number; max: number };
  dreadnoughts?: number;
  forge?: boolean;
  dreadTiers?: { min: number; max: number };
  dreadsAlwaysUpgrade?: boolean;
  sameTeamOnReturn?: boolean;
  travellers?: { min: number; max: number };
  peaceful?: boolean;
  startAged?: number;
}

export interface MapEventsDoc {
  v: 1;
  nextId: Id;
  meta?: { title?: string; note?: string; seed?: 'match' | number; shipped?: string };
  match?: MatchRules;
  types?: EntityType[];
  tanks?: MapTank[];
  placed?: PlacedEntity[];
  plans?: WavePlan[];
  rules?: Rule[];
  sequences?: Sequence[];
  vars?: VarDef[];
  timers?: TimerDef[];
  statuses?: StatusDef[];
  signals?: Named[];
  tags?: Named[];
  folders?: (Named & { off?: true })[];
  areaGroups?: AreaGroup[];
  tankGroups?: TankGroup[];
  [more: string]: unknown;
}

export const EVENTS_DOC_VERSION = 1;
export function newEventsDoc(): MapEventsDoc { return { v: EVENTS_DOC_VERSION as 1, nextId: 1 }; }
export function takeId(doc: MapEventsDoc): Id { const id = doc.nextId; doc.nextId = id + 1; return id; }
export function refTo(thing: { id: Id; name?: string }): Ref { return { id: thing.id, n: thing.name ?? '' }; }

export function docHasContent(doc: MapEventsDoc | null | undefined): boolean {
  if (!doc) return false;
  return !!(doc.types?.length || doc.placed?.length || doc.plans?.length || doc.rules?.length || doc.sequences?.length ||
    doc.timers?.length || doc.vars?.length || (doc.match && Object.keys(doc.match).length) ||
    (SMALL_FIX.GH611 !== 0 && doc.tankGroups?.length));
}
export function docHasWork(doc: MapEventsDoc | null | undefined): boolean {
  if (docHasContent(doc)) return true;
  return !!(doc && SMALL_FIX.R897 !== 0 && (doc.statuses?.length || doc.signals?.length || doc.tags?.length));
}

export function docStockKey(doc: MapEventsDoc | null | undefined): string {
  if (!doc) return '';
  const placed = (doc.placed ?? []).filter(e => e && e.guardOf === undefined);
  const types = (doc.types ?? []).filter(t => t && (t.brain !== 'guard' || placed.some(e => e.type?.id === t.id)));
  const rest: Record<string, unknown> = { ...doc };
  delete rest.nextId;
  return JSON.stringify({ ...rest, placed, types });
}
export function zonesStockKey(zones: readonly ZoneLike[] | null | undefined): string {
  return JSON.stringify((zones ?? []).filter(z => z && (z as { modeBase?: boolean }).modeBase !== true).slice().sort((a, b) => a.id - b.id));
}

export function docIsOnlyGuards(doc: MapEventsDoc | null | undefined): boolean {
  if (!doc) return false;
  const placed = doc.placed ?? [];
  if (!placed.some(e => e && e.guardOf !== undefined)) return false;
  const mine = placed.filter(e => e && e.guardOf === undefined);
  const types = (doc.types ?? []).filter(t => t && (t.brain !== 'guard' || mine.some(e => e.type?.id === t.id)));
  return !docHasWork({ ...doc, placed: mine, types });
}

export function walkIds(value: unknown, fn: (id: number) => void, depth = 0): void {
  if (depth > 64 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) walkIds(value[i], fn, depth + 1); return; }
  const o = value as Record<string, unknown>;
  if (typeof o.id === 'number' && Number.isFinite(o.id)) fn(o.id);
  if (typeof o.uid === 'number' && Number.isFinite(o.uid)) fn(o.uid);
  for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object') walkIds(v, fn, depth + 1); }
}

export function repairNextId(doc: MapEventsDoc, zones?: readonly ZoneLike[]): void {
  let max = 0;
  const see = (id: number) => { if (id > max) max = id; };
  walkIds(doc, see);
  if (zones) for (const z of zones) { if (typeof z.uid === 'number' && z.uid > max) max = z.uid; walkIds(z.behaviors, see); }
  if (!Number.isFinite(doc.nextId) || doc.nextId <= max) doc.nextId = max + 1;
}

export function shiftEventsDoc(doc: MapEventsDoc, dx: number, dy: number): MapEventsDoc {
  if (dx === 0 && dy === 0) return doc;
  const walk = <T>(v: T, depth = 0): T => {
    if (depth > 64 || v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
      let out: unknown[] | null = null;
      for (let i = 0; i < v.length; i++) { const n = walk(v[i], depth + 1); if (n !== v[i]) { if (!out) out = v.slice(); out[i] = n; } }
      return (out ?? v) as unknown as T;
    }
    const o = v as Record<string, unknown>;
    if (o.w === 'point' && typeof o.cx === 'number' && typeof o.cy === 'number') return { ...o, cx: o.cx + dx, cy: o.cy + dy } as unknown as T;
    let out: Record<string, unknown> | null = null;
    for (const k of Object.keys(o)) { const c = o[k]; if (c && typeof c === 'object') { const n = walk(c, depth + 1); if (n !== c) { if (!out) out = { ...o }; out[k] = n; } } }
    return (out ?? v) as T;
  };
  const next = walk(doc);
  const placed = next.placed;
  return placed ? { ...next, placed: placed.map(e => ({ ...e, cx: e.cx + dx, cy: e.cy + dy })) } : next;
}
export function shiftZoneRows<Z extends ZoneRect & { more?: ZoneRect[]; shape?: AreaShape }>(zones: readonly Z[], dx: number, dy: number): Z[] {
  return zones.map(z => ({ ...z, gx: z.gx + dx, gy: z.gy + dy, ...(z.more ? { more: z.more.map(m => ({ ...m, gx: m.gx + dx, gy: m.gy + dy })) } : {}), ...(z.shape ? { shape: shiftShape(z.shape, dx, dy) } : {}) }));
}
export function flipShape(s: AreaShape, w: number, h: number, fx: boolean, fy: boolean): AreaShape {
  if (s.k === 'ellipse') {
    const out: AreaShape = { ...s, cx: fx ? w - (s.cx ?? 0) : s.cx, cy: fy ? h - (s.cy ?? 0) : s.cy };
    if (s.rot && fx !== fy) out.rot = -s.rot;
    return out;
  }
  const pts = Array.isArray(s.pts) ? s.pts.slice() : [];
  for (let i = 0; i + 1 < pts.length; i += 2) { if (fx) pts[i] = w - pts[i]; if (fy) pts[i + 1] = h - pts[i + 1]; }
  return { ...s, pts };
}
export function shiftShape(s: AreaShape, dx: number, dy: number): AreaShape {
  if (s.k === 'ellipse') return { ...s, cx: (s.cx ?? 0) + dx, cy: (s.cy ?? 0) + dy };
  const pts = Array.isArray(s.pts) ? s.pts.slice() : [];
  for (let i = 0; i + 1 < pts.length; i += 2) { pts[i] += dx; pts[i + 1] += dy; }
  return { ...s, pts };
}

export function refreshNames<T>(value: T, nameOf: (id: number) => string | undefined, depth = 0): T {
  if (depth > 64 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    let out: unknown[] | null = null;
    for (let i = 0; i < value.length; i++) {
      const v = refreshNames(value[i], nameOf, depth + 1);
      if (v !== value[i]) { if (!out) out = value.slice(); out[i] = v; }
    }
    return (out ?? value) as unknown as T;
  }
  const o = value as Record<string, unknown>;
  const isRef = typeof o.id === 'number' && typeof o.n === 'string' && !('k' in o) && !('a' in o && typeof o.a === 'object');
  if (isRef && typeof o.a !== 'string') {
    const name = nameOf(o.id as number);
    return (name !== undefined && name !== o.n ? { ...o, n: name } : value) as T;
  }
  let out: Record<string, unknown> | null = null;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v && typeof v === 'object') {
      const nv = refreshNames(v, nameOf, depth + 1);
      if (nv !== v) { if (!out) out = { ...o }; out[k] = nv; }
    }
  }
  return (out ?? value) as T;
}
