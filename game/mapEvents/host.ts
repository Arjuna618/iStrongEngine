import type { ShapeBodySpec } from './thingBody';

export interface MevBody { id: string; _mev?: number; }

export interface SpawnReq {
  typeIdx: number;
  extraTags?: readonly number[] | null;
  shapeWord?: string;
  formIdx: number;
  tank: string;
  x: number; y: number; angle: number;
  faced?: boolean;
  team: string;
  camp: 'none' | 'boss' | 'shape';
  bossTier: boolean;
  colourUse: 'file' | 'team' | 'slot'; colourSlot: number;
  size: number;
  sizeFactor: number;
  name: string;
  showName: boolean | null;
  stands: boolean; canDie: boolean; seenByBots: boolean; onLeaderboard: boolean; onMinimap: boolean;
  minimapAll: boolean; countsAsKill: boolean; inWalls: boolean;
  score: number; worthNothing: boolean; killLine: string;
  brain: 'full' | 'none' | 'order'; orderIdx: number; sight: number;
  birthLook: 'none' | 'food'; crashersIgnore: boolean; canBeHealed: boolean; contact: 'tank' | 'shape';
  pushable: boolean | null; health: number; level: number; skills: Record<string, number> | null; classWord: string;
  graceMs: number;
  refill: 'none' | 'shield' | 'all';
  placed: boolean;
  fromWave: boolean; noGrowth: boolean;
  home: number;
  areaIdx: number;
  like?: SpawnLike | null;
  shape: ShapeBodySpec | null;
  touch: Float64Array | null;
}
export interface SpawnLike { autospin: boolean; facing: string; aimbot: number; turn: number; logic: string }

export interface MapEventsHost {
  isLive(b: MevBody | null, id: string): boolean;
  playerBody(): MevBody | null;
  sideWaiting?(word: string): number;
  isPlayer(b: MevBody): boolean;
  viewerBody?(): MevBody | null;
  isViewer?(b: MevBody): boolean;
  tanks(): readonly MevBody[];
  posX(b: MevBody): number;
  posY(b: MevBody): number;
  radius(b: MevBody): number;
  healthShare(b: MevBody): number;
  sideOf(b: MevBody): string;
  wearsColour?(b: MevBody, codes: readonly number[], n: number): boolean;
  isBoss(b: MevBody): boolean;
  tankWordOf(b: MevBody): string;
  shownNameOf(b: MevBody): string;
  sideShown(word: string): string;
  leader(): MevBody | null;
  humans(): number;
  bots(): number;

  spotFree(x: number, y: number, req: SpawnReq, gap: number, keepFromDamaging: number, ownSpot?: boolean, except?: MevBody | null): boolean;
  roomAt(x: number, y: number, req: SpawnReq): number;
  awayFromPlayers(x: number, y: number, base: number, perSize: number): boolean;
  keepsFromDamaging(x: number, y: number, req: SpawnReq, keep: number): boolean;
  onOtherBase(x: number, y: number, req: SpawnReq): boolean;
  tankRoom(): number;

  spawnTank(req: SpawnReq): MevBody | null;
  spawnShape(word: string, x: number, y: number, sizeFactor: number, areaIdx: number): MevBody | null;
  kill(b: MevBody, credit: boolean, become?: boolean): void;
  remove(b: MevBody): void;
  morph(b: MevBody, req: SpawnReq): boolean;
  setSide(b: MevBody, word: string): boolean;
  setName(b: MevBody, name: string): void;
  heal(b: MevBody, amount: number, isShare: boolean): void;
  damage(b: MevBody, amount: number, isShare: boolean): void;
  invulnerable(b: MevBody, seconds: number): void;
  invisible(b: MevBody, on: boolean, style: number): void;
  statusEffect(b: MevBody, kind: string, on: boolean, a: Record<string, unknown>): void;
  statusWords?(b: MevBody, kind: string, a: Record<string, unknown>): void;
  teleport(b: MevBody, x: number, y: number, areaIdx: number): void;
  bodySay(b: MevBody, text: string): void;
  setOrder(b: MevBody, orderIdx: number): void;
  copyBody(b: MevBody, side: string): MevBody | null;
  followSide(b: MevBody, leader: MevBody | null): boolean;
  followersOf(b: MevBody, out: MevBody[]): void;

  behaviorSet(zoneIdx: number, behaviorRow: number, on: boolean): void;
  botInterest(b: MevBody, how: number, zone: number, target: MevBody | null, portal: number, until: number, tag: number, seconds: number, giveUp: number,
    toward: number, giveUpTo: number): void;
  areaPaint(zoneIdx: number, colourSlot: number, opacity: number): void;
  areaWhitelist(zoneIdx: number, behaviorRow: number, add: readonly string[], remove: readonly string[]): void;
  darkness(zoneIdx: number, on: boolean, fade: number, a: Record<string, unknown> | null): void;
  isDark(x: number, y: number): boolean;

  say(text: string, lifeMs: number, now: number): void;
  showOnHud(text: string): void;
  lbTeams(on: boolean, title: string, goal: number, unit: string, unitOne: string, vars: number[] | null): void;
  sceneHold(held: boolean, guard: boolean, botsStop: boolean, canSkip: boolean): void;
  sceneMover(b: MevBody): void;
  respawnSet(team: string, on: boolean): void;
  wallsMove?(on: boolean, perMinute: number, slide: number): void;
  wallsRetype?(share: number, seconds: number): void;
  matchEnd(result: 'win' | 'lose', team: string, then: 'nothing' | 'closeArena', now: number, closing: string, closed: string, screen: string): void;
  livingLeft(): boolean;
  treeSwap(from: string, to: string): void;
  logLine(text: string): void;
  clockMs(): number;
}

export const CAUSE_HIT = 0, CAUSE_AREA = 1, CAUSE_RULE = 2, CAUSE_OTHER = 3;
export const ORDER_STAND = -2;
export const CAUSE_BECOME = 4;
