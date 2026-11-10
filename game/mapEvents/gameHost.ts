import type { EnemyConfig, EnemyTank, FloatingPolygon, GameState, LibraryItem, MapState, TankConfig, TeamId, AIBehavior } from '../../types';
import { isShapeThing, MAP_TANK_HEAD } from './thingWord';
import { touchMask } from './thingBody';
import type { ShapeBodySpec } from './thingBody';
import { CAMP_NONE, CAMP_BOSS, CAMP_SHAPE } from '../../types';
import type { MapEventsHost, MevBody, SpawnReq } from './host';
import { CAUSE_BECOME, CAUSE_RULE } from './host';
import type { Program } from './compile';
import { SIDE_WORDS } from './doc';
import { SHAPE_DEFINITIONS } from '../ShapeRegistry';
import { cmHex, CM_USE } from '../../utils/colorMap';
import { isGameDark } from '../../utils/gameColors';
import { darkAt, type DarkWorld } from '../darkness';
import { MF_WAVE, MF_NO_GROW } from '../growthRules';
import { SMALL_FIX } from '../smallFixSwitch';
import { wornMatches } from './colourWord';
export { MF_WAVE, MF_NO_GROW };
export const MF_STAGE = 1;
export const MF_STANDS = 2;
export const MF_GOD = 4;
export const MF_UNSEEN = 8;
export const MF_NO_LB = 16;
export const MF_NO_MM = 32;
export const MF_NO_TAG = 64;
export const MF_NO_XP = 128;
export const MF_NO_CRASHERS = 256;
export const MF_NO_HEAL = 512;
export const MF_SHAPE_CONTACT = 1024;
export const MF_ORDER = 2048;
export const MF_PLACED = 4096;
export const MF_EDITOR = 8192;
export const MF_GHOST = 65536;
export const MF_SCENE_MOVES = 131072;
export const MF_INVIS = 16384;
export const MF_BIRTH_FOOD = 32768;
export const MF_RISEN = 262144;
export const MF_NO_FIRE = 524288;
export const MF_NO_TURN = 1048576;
export const MF_HORDE = 2097152;
export const MF_MM_ALL = 4194304;
export const MF_NO_KILL = 8388608;
export const MF_IN_WALLS = 16777216;
export const MF_LEFT_ALONE = 33554432;
export function isStage(e: { _mevF?: number }): boolean { return ((e._mevF ?? 0) & MF_STAGE) !== 0; }

export interface MevEngine {
  wornSlotOfTank(e: EnemyTank | null): number;
  wornSlotOfShape(p: FloatingPolygon): number;
  _mevShapeSide(p: FloatingPolygon): string;
  _mevShapeSetSide(p: FloatingPolygon, word: string): void;
  _shapeEntersSide(p: FloatingPolygon, word: string, colourSlot?: number): void;
  dark: DarkWorld;
  _mevDarkness(zone: number, on: boolean, fade: number, a: Record<string, unknown> | null): void;
  _mevIsZombie(e: EnemyTank): boolean;
  _mevJoinZombies(e: EnemyTank): void;
  _mevLeaveSides(e: EnemyTank): void;
  _mevRemoveOwned(e: EnemyTank): void;
  _mevChatDrop(e: EnemyTank): void;
  _mevInMorph: boolean;
  _mevCopyGroup(e: EnemyTank | null, ne: EnemyTank): void;
  _mevFollow(e: EnemyTank, leader: EnemyTank | null): void;
  _mevCopyReq(e: EnemyTank | null, tank: string, side: string): SpawnReq;
  _mevCopyLife(src: EnemyTank | null, ne: EnemyTank): void;
  _mevStageProblems(): void;
  _mevGodHeld(e: EnemyTank): boolean;
  _mevRefillPlayer(refill: 'none' | 'shield' | 'all'): void;
  _mevSliderOfSize(px: number): number;
  _mevSetPlayerName(name: string): void;
  _adminSidesChanged(): void;
  _adminSideChangedOne(b: EnemyTank): void;
  _mevTeamEntered(e: EnemyTank | null): void;
  mevAreaVer: number;
  _mevScoreOver(e: EnemyTank, score: number): number;
  state: GameState;
  tankPos: { x: number; y: number };
  tankDying: boolean;
  spectatedBodyAny(): EnemyTank | null;
  bullets: unknown[];
  areaBounds: { id: string; centerX: number; centerY: number }[];
  areaStates: MapState[];
  mapState: MapState | null;
  _spawnPlaced: boolean;
  _spawnMevBits: number;
  gameNow(): number;
  spawnEnemy(config: EnemyConfig, near?: boolean, skipGroup?: boolean, placed?: boolean): EnemyTank | null;
  killEnemy(e: EnemyTank): void;
  recycleEnemy(e: EnemyTank): void;
  getEffectiveEnemyRadius(e: EnemyTank): number;
  getEffectivePlayerRadius(): number;
  getPlayerTeam(): TeamId;
  enemyTankKey(e: EnemyTank): string;
  getTankLibraryMap(): Map<string, LibraryItem>;
  _bossDesignOf(lib: LibraryItem[], word: string): TankConfig | null;
  _tankKindWord(e: EnemyTank): string;
  _chatPlaceBot(e: EnemyTank, x: number, y: number, grace: boolean): void;
  pushMessage(text: string, at?: number, lifeMs?: number): void;
  applyBotEvolution(e: EnemyTank, key: string, libMap: Map<string, LibraryItem>): void;
  evolveToTank(fileName: string, isPlayerChoice?: boolean, announce?: boolean, spawn?: boolean): boolean;
  _areaIndexAtWorld(x: number, y: number): number;
  _hurtShapeShielded(p: FloatingPolygon, dmg: number, now: number): void;
  _mevPlayerDies(): void;
  _mevSpotFree(x: number, y: number, req: SpawnReq, gap: number, keepFromDamaging: number, ownSpot?: boolean, except?: EnemyTank | null): boolean;
  _mevRoomAt(x: number, y: number, req: SpawnReq): number;
  _mevAwayFromPlayers(x: number, y: number, base: number, perSize: number): boolean;
  _mevKeepsFromDamaging(x: number, y: number, req: SpawnReq, keep: number): boolean;
  _mevSideWaiting(word: string): number;
  _mevOnOtherBase(x: number, y: number, team: string): boolean;
  _mevTankRoom(): number;
  _mevLbTeams(on: boolean, title: string, goal: number, unit: string, unitOne: string, vars: number[] | null): void;
  _mevBotInterest(e: EnemyTank, how: number, zone: number, target: EnemyTank | FloatingPolygon | null, portal: number, until: number, tag: number, seconds: number, giveUp: number, toward?: number, giveUpTo?: number): void;
  _mevSpawnThingShape(word: string, x: number, y: number, size: number, sizeFactor: number, stands: boolean, canDie: boolean, angle: number, areaIdx: number,
    spec?: ShapeBodySpec | null, touch?: Float64Array | null, mmAll?: boolean, faced?: boolean): MevBody | null;
  _mevEdShape(word: string, x: number, y: number, size: number, angle: number): MevBody | null;
  _mevSpawnShape(word: string, x: number, y: number, sizeFactor: number, areaIdx: number): MevBody | null;
  _mevHeal(e: EnemyTank | null, amount: number, isShare: boolean): void;
  _mevDamage(e: EnemyTank | null, amount: number, isShare: boolean): void;
  _mevSetPlayerSide(word: string): boolean;
  _mevTeleportPlayer(x: number, y: number, areaIdx: number): void;
  _mevGodFor(e: EnemyTank | null, seconds: number): void;
  _mevInvisible(e: EnemyTank | null, on: boolean, style: number): void;
  _mevStatus(e: EnemyTank | null, kind: string, on: boolean, a: Record<string, unknown>): void;
  _mevStatusWords(e: EnemyTank | null, kind: string, a: Record<string, unknown>): void;
  _mevMorph(e: EnemyTank, req: SpawnReq, cfg: EnemyConfig): void;
  _mevBodySay(e: EnemyTank | null, text: string): void;
  _mevBehaviorSet(zoneIdx: number, behaviorRow: number, on: boolean): void;
  _mevAreaPaint(zoneIdx: number, slot: number, opacity: number): void;
  _mevAreaWhitelist(zoneIdx: number, behaviorRow: number, add: readonly string[], remove: readonly string[]): void;
  _mevRespawnSet(team: string, on: boolean): void;
  _mevWallsMove(on: boolean, perMinute: number, slide: number): void;
  _mevWallsRetype(share: number, seconds: number): void;
  _mevMatchEnd(result: 'win' | 'lose', team: string, then: 'nothing' | 'closeArena', now: number, closing: string, closed: string, screen: string): void;
  _mevLivingLeft(): boolean;
  _mevTreeSwap(from: string, to: string): void;
  madeTankWord(e: EnemyTank): string;
  _mevShowOnHud(text: string): void;
  _mevSceneHold(held: boolean, guard: boolean, botsStop: boolean, canSkip: boolean): void;
  _mevLogLine(text: string): void;
  _mevLeader(): MevBody | null;
  _mevHealthShare(e: EnemyTank | null): number;
  _chatSetBotTeam(e: EnemyTank, team: string): void;
  resolveTankDisplayName(word: string): string;
}


export class GameMapEventsHost implements MapEventsHost {
  readonly player: MevBody & { _mevIn: number } = { id: '', _mev: -1, _mevIn: 0 };
  private configs = new Map<string, EnemyConfig>();
  private cfgSeq = 0;
  private readonly cfgUsed = new Set<string>();

  constructor(private g: MevEngine, private p: Program, private editor: boolean) {}

  private pruneConfigs(): void {
    const used = this.cfgUsed;
    used.clear();
    const et = this.g.state.enemyTanks;
    for (let i = 0; i < et.length; i++) if (et[i].active) used.add(et[i].configId);
    const list = this.g.state.enemyConfigs;
    for (const [k, c] of this.configs) {
      if (used.has(c.id)) continue;
      this.configs.delete(k);
      const j = list.indexOf(c);
      if (j >= 0) list.splice(j, 1);
    }
  }

  private bot(b: MevBody): EnemyTank { return b as unknown as EnemyTank; }
  private shape(b: MevBody): FloatingPolygon | null { return (b as unknown as FloatingPolygon).maxHp !== undefined ? b as unknown as FloatingPolygon : null; }

  isLive(b: MevBody | null, id: string): boolean {
    if (b === null) return false;
    if (b === this.player) return !this.g.tankDying && !this.g.state.playerDead && this.g.state.isTestMode;
    const p = this.shape(b);
    if (p) return p.active && !p.fadingOut && p.id === id;
    const e = b as unknown as EnemyTank;
    return e.active && !e.isDying && e.id === id;
  }
  sideWaiting(word: string): number { return this.g._mevSideWaiting(word); }
  playerBody(): MevBody | null {
    const g = this.g;
    if (g.tankDying || g.state.playerDead || !g.state.isTestMode) return null;
    this.player.id = g.state.playerId;
    return this.player;
  }
  isPlayer(b: MevBody): boolean { return b === this.player; }
  viewerBody(): MevBody | null {
    const w = this.g.spectatedBodyAny();
    return w !== null ? w as unknown as MevBody : this.playerBody();
  }
  isViewer(b: MevBody): boolean {
    const w = this.g.spectatedBodyAny();
    return w !== null ? b === (w as unknown as MevBody) : b === this.player;
  }
  tanks(): readonly MevBody[] { return this.g.state.enemyTanks as unknown as MevBody[]; }
  posX(b: MevBody): number { return b === this.player ? this.g.tankPos.x : this.bot(b).position.x; }
  posY(b: MevBody): number { return b === this.player ? this.g.tankPos.y : this.bot(b).position.y; }
  radius(b: MevBody): number { if (b === this.player) return this.g.getEffectivePlayerRadius(); const p = this.shape(b); return p ? p.size : this.g.getEffectiveEnemyRadius(this.bot(b)); }
  healthShare(b: MevBody): number {
    if (b === this.player) return this.g._mevHealthShare(null);
    const p = this.shape(b);
    return p ? (p.maxHp > 0 ? p.hp / p.maxHp : 0) : this.g._mevHealthShare(this.bot(b));
  }
  wearsColour(b: MevBody, codes: readonly number[], n: number): boolean {
    const p = this.shape(b);
    const worn = p !== null ? this.g.wornSlotOfShape(p) : this.g.wornSlotOfTank(b === this.player ? null : this.bot(b));
    if (worn < 0) return false;
    const dark = isGameDark(), use = p !== null ? CM_USE.SHAPE : CM_USE.TANK;
    for (let i = 0; i < n; i++) if (wornMatches(worn, codes[i], dark, use)) return true;
    return false;
  }
  sideOf(b: MevBody): string {
    if (b === this.player) return this.playerSide();
    const _sp = this.shape(b);
    if (_sp) {
      if (SMALL_FIX.R895 !== 0) { const s = this.g._mevShapeSide(_sp); if (s !== '') return s; }
      return 'neutral';
    }
    switch (this.bot(b).aiBehavior) {
      case 'Team1': return 'team1';
      case 'Team2': return 'team2';
      case 'Team3': return 'team3';
      case 'Team4': return 'team4';
      case 'Team5': return 'team5';
      case 'FFA': return this.g._mevIsZombie(this.bot(b)) ? 'zombies' : 'ffa';
      case 'Neutral': return 'neutral';
      case 'Friendly': return this.playerSide();
      default: return 'againstPlayer';
    }
  }
  private playerSide(): string { const t = this.g.getPlayerTeam(); return t === 'player' ? 'player' : t; }
  isBoss(b: MevBody): boolean { if (b === this.player || this.shape(b)) return false; const e = this.bot(b); return e.camp === CAMP_BOSS || e.isBossTier === true; }
  tankWordOf(b: MevBody): string {
    if (b === this.player) return this.g.state.currentTankFileName ?? '';
    if (this.shape(b)) return '';
    const e = this.bot(b);
    if (SMALL_FIX.GH389 && !e.currentTankName && e._madeWord.startsWith(MAP_TANK_HEAD)) return e._madeWord;
    return e.currentTankName || this.g.enemyTankKey(e) || this.g.madeTankWord(e);
  }
  shownNameOf(b: MevBody): string {
    const p = this.shape(b);
    if (p) return SHAPE_DEFINITIONS.get(p.shapeId)?.displayName ?? '';
    const w = this.tankWordOf(b);
    return w ? this.g.resolveTankDisplayName(w) : '';
  }
  sideShown(word: string): string { return SIDE_WORDS.find(s => s.word === word)?.shown ?? word; }
  leader(): MevBody | null { return this.g._mevLeader(); }
  humans(): number { return this.playerBody() ? 1 : 0; }
  bots(): number {
    let n = 0;
    const et = this.g.state.enemyTanks;
    for (let i = 0; i < et.length; i++) { const e = et[i]; if (e.active && !e.isDying && ((e._mevF ?? 0) & MF_STAGE) === 0 && !e.isBaseProtector) n++; }
    return n;
  }

  spotFree(x: number, y: number, req: SpawnReq, gap: number, keepFromDamaging: number, ownSpot = false, except: MevBody | null = null): boolean { return this.g._mevSpotFree(x, y, req, gap, keepFromDamaging, ownSpot, except !== null && except !== this.player && !this.shape(except) ? this.bot(except) : null); }
  roomAt(x: number, y: number, req: SpawnReq): number { return this.g._mevRoomAt(x, y, req); }
  awayFromPlayers(x: number, y: number, base: number, perSize: number): boolean { return this.g._mevAwayFromPlayers(x, y, base, perSize); }
  keepsFromDamaging(x: number, y: number, req: SpawnReq, keep: number): boolean { return this.g._mevKeepsFromDamaging(x, y, req, keep); }
  onOtherBase(x: number, y: number, req: SpawnReq): boolean {
    const beh = this.behaviorOf(req.team);
    const team = beh === 'Team1' ? 'team1' : beh === 'Team2' ? 'team2' : beh === 'Team3' ? 'team3' : beh === 'Team4' ? 'team4' : beh === 'Team5' ? 'team5' : beh === 'Friendly' ? 'player' : 'enemy';
    return this.g._mevOnOtherBase(x, y, team);
  }
  tankRoom(): number { return this.g._mevTankRoom(); }

  private behaviorOf(word: string): AIBehavior {
    switch (word) {
      case 'team1': return 'Team1';
      case 'team2': return 'Team2';
      case 'team3': return 'Team3';
      case 'team4': return 'Team4';
      case 'team5': return 'Team5';
      case 'ffa': return 'FFA';
      case 'zombies': return 'FFA';
      case 'neutral': return 'Neutral';
      case 'player': { const t = this.g.getPlayerTeam(); return t === 'team1' ? 'Team1' : t === 'team2' ? 'Team2' : t === 'team3' ? 'Team3' : t === 'team4' ? 'Team4' : t === 'team5' ? 'Team5' : 'Friendly'; }
      case 'againstPlayer': { const t = this.g.getPlayerTeam(); return t === 'team1' ? 'Team2' : t === 'player' ? 'Enemy' : 'Team1'; }
    }
    const t = this.g.getPlayerTeam();
    return t === 'team1' ? 'Team2' : t === 'player' ? 'Enemy' : 'Team1';
  }

  private configFor(req: SpawnReq): EnemyConfig | null {
    const lk = req.like;
    const key = `${req.tank}|${SMALL_FIX.GH482 ? this.behaviorOf(req.team) : req.team}|${req.camp}|${req.bossTier ? 1 : 0}|${req.stands ? 1 : 0}|${req.size}|${req.health}|${req.level}|${req.colourUse}${req.colourSlot}|${req.pushable}|${req.brain}|${req.sight}|${req.typeIdx}|${req.formIdx}|${req.skills ? JSON.stringify(req.skills) : ''}|${lk ? `${lk.autospin ? 1 : 0}${lk.facing}${lk.aimbot}/${lk.turn}${lk.logic}` : ''}`;
    let cfg = this.configs.get(key);
    if (cfg) {
      if (!this.g.state.enemyConfigs.includes(cfg)) this.g.state.enemyConfigs.push(cfg);
      return cfg;
    }
    const g = this.g;
    const lib = g.state.tankLibrary;
    const design = g._bossDesignOf(lib, req.tank);
    if (!design) return null;
    if (SMALL_FIX.R885 !== 0 && this.configs.size >= 16) this.pruneConfigs();
    const tank = JSON.parse(JSON.stringify(design)) as TankConfig;
    if (req.stands) tank.tankMovementSpeed = 0;
    if (req.size > 0) tank.tankSize = g._mevSliderOfSize(req.size);
    if (req.health > 0) tank.tankHP = req.health;
    if (req.pushable === false) tank.tankPushability = 0;
    if (req.skills) {
      tank.preDefinedSkills = { ...(tank.preDefinedSkills ?? {}), ...req.skills } as TankConfig['preDefinedSkills'];
      const caps = tank.skillCaps as unknown as Record<string, number> | undefined;
      if (caps) { let raised: Record<string, number> | null = null; for (const k of Object.keys(req.skills)) if (req.skills[k] > (caps[k] ?? 0)) { (raised ??= { ...caps })[k] = req.skills[k]; } if (raised) tank.skillCaps = raised as unknown as TankConfig['skillCaps']; }
    }
    if (req.colourUse === 'slot') {
      const dark = isGameDark();
      tank.tankColor = cmHex(req.colourSlot, dark, CM_USE.TANK);
      tank.tankColorMap = req.colourSlot;
    }
    cfg = {
      id: `__mev_${SMALL_FIX.R885 !== 0 ? this.cfgSeq++ : this.configs.size}__`,
      enemyName: g.resolveTankDisplayName(req.tank),
      tankConfig: tank,
      enabled: true,
      baseLevel: req.level,
      upgradeLogic: (lk?.logic ?? 'OffensiveWeighted') as EnemyConfig['upgradeLogic'],
      forceAutospin: lk?.autospin ?? false,
      forceAutoshoot: req.brain === 'order',
      aimbotStrength: lk?.aimbot ?? 25,
      turnSpeed: lk?.turn ?? 50,
      facingType: (lk?.facing ?? 'primaryTurret') as EnemyConfig['facingType'],
      aiBehavior: this.behaviorOf(req.team),
      autoRevival: false,
      maxSpawnCount: 1000000,
      isStageBody: true,
      isBossTier: req.bossTier || undefined,
      bossTeam: req.camp === 'boss' && !req.bossTier ? true : undefined,
      useHardcodedColor: req.colourUse === 'file' || req.colourUse === 'slot' ? true : undefined,
      sourceLibraryName: g.resolveTankDisplayName(req.tank),
      sourceTankWord: req.tank,
    } as EnemyConfig;
    this.configs.set(key, cfg);
    g.state.enemyConfigs.push(cfg);
    return cfg;
  }

  private bitsOf(req: SpawnReq): number {
    let f = MF_STAGE;
    if (req.stands) f |= MF_STANDS;
    if (!req.canDie) f |= MF_GOD;
    if (!req.seenByBots) f |= MF_UNSEEN;
    if (!req.onLeaderboard) f |= MF_NO_LB;
    if (!req.onMinimap) f |= MF_NO_MM;
    else if (req.minimapAll) f |= MF_MM_ALL;
    if (!req.countsAsKill) f |= MF_NO_KILL;
    if (req.inWalls) f |= MF_IN_WALLS;
    if (req.showName === false) f |= MF_NO_TAG;
    if (req.worthNothing) f |= MF_NO_XP;
    if (req.crashersIgnore) f |= MF_NO_CRASHERS;
    if (!req.canBeHealed) f |= MF_NO_HEAL;
    if (req.contact === 'shape') f |= MF_SHAPE_CONTACT;
    if (req.brain === 'order' || req.brain === 'none') f |= MF_ORDER;
    if (req.placed) f |= MF_PLACED;
    if (this.editor) f |= MF_EDITOR;
    if (req.birthLook === 'food') f |= MF_BIRTH_FOOD;
    if (req.fromWave) f |= MF_WAVE;
    if (req.noGrowth) f |= MF_NO_GROW;
    return f;
  }

  spawnTank(req: SpawnReq): MevBody | null {
    const g = this.g;
    if (isShapeThing(req.tank)) {
      if (this.editor) return g._mevEdShape(req.tank, req.x, req.y, req.size, req.angle);
      const sb = g._mevSpawnThingShape(req.tank, req.x, req.y, req.size, req.sizeFactor, req.stands, req.canDie, req.angle, req.areaIdx, req.shape, req.touch, req.onMinimap && req.minimapAll, req.faced === true);
      if (SMALL_FIX.GH459 && sb !== null && req.worthNothing) (sb as unknown as { xpValue: number }).xpValue = 0;
      if (sb !== null) this.g._shapeEntersSide(sb as unknown as FloatingPolygon, req.team, req.colourUse === 'slot' ? req.colourSlot : -1);
      return sb;
    }
    const cfg = this.configFor(req);
    if (!cfg) return null;
    g._spawnPlaced = true;
    g._spawnMevBits = (req.fromWave ? MF_WAVE : 0) | (req.noGrowth ? MF_NO_GROW : 0) | (SMALL_FIX.G650 !== 0 && req.stands ? MF_STANDS : 0);
    const e = g.spawnEnemy(cfg, false, true, true);
    g._spawnPlaced = false;
    g._spawnMevBits = 0;
    if (!e) return null;
    e._mevF = this.bitsOf(req);
    if (SMALL_FIX.GH389 && req.tank.startsWith(MAP_TANK_HEAD)) e._madeWord = req.tank;
    e._tch = req.touch; e._tchMask = touchMask(req.touch); e._tchSeen.fill(-9);
    if (req.birthLook === 'food') e._mevBirthAt = g.gameNow();
    e._mevScore = this.g._mevScoreOver(e, req.score);
    e._mevOrder = req.orderIdx;
    if (req.sizeFactor !== 1) {
      e.baseSize *= req.sizeFactor; e.size = e.baseSize * e.growthScale;
      e.sizeSlideBase = e.baseSize; e.sizeSlideLive = e.size;
      e.mass = 0.005 * (e.size * e.size + 1);
    }
    e.position.x = req.x; e.position.y = req.y;
    e.lastGoodX = req.x; e.lastGoodY = req.y;
    e.velocity.x = 0; e.velocity.y = 0;
    e.knockbackVelocity.x = 0; e.knockbackVelocity.y = 0;
    e.angle = req.angle;
    e.isSpawning = false;
    e.spawnStartTime = 0;
    if (req.stands) { e.bpAnchorX = req.x; e.bpAnchorY = req.y; }
    if (req.sight > 0) { e.fovRadius = req.sight; }
    if (req.name) e.displayName = req.name;
    if (req.camp === 'shape') e.camp = CAMP_SHAPE;
    else if (req.camp === 'none' && !req.bossTier) e.camp = e.isSentryEnemy ? CAMP_SHAPE : CAMP_NONE;
    if (req.colourUse === 'team') e.keepOwnColor = false;
    if (g.areaBounds.length > 0) {
      const i = g._areaIndexAtWorld(req.x, req.y);
      if (i >= 0) e.areaId = g.areaBounds[i].id;
    }
    if (req.graceMs > 0) g._mevGodFor(e, req.graceMs / 1000);
    if (req.team === 'zombies') g._mevJoinZombies(e);
    return e as unknown as MevBody;
  }
  copyBody(b: MevBody, side: string): MevBody | null {
    if (this.shape(b)) return null;
    const g = this.g;
    const isPl = b === this.player;
    const e = isPl ? null : this.bot(b);
    if (SMALL_FIX.GH571 !== 0 && e !== null && e.spawnedByEntityId !== '') return null;
    const tank = this.tankWordOf(b);
    if (!tank) return null;
    const r = g._mevCopyReq(e, tank, side || this.sideOf(b));
    const nb = this.spawnTank(r);
    if (!nb) return null;
    const ne = this.bot(nb);
    ne._mevF |= MF_RISEN;
    g._mevCopyLife(e, ne);
    if (SMALL_FIX.GH510 && !side) g._mevCopyGroup(e, ne);
    return nb;
  }
  followSide(b: MevBody, leader: MevBody | null): boolean {
    if (b === this.player || this.shape(b) || leader === null || this.shape(leader)) return false;
    this.g._mevFollow(this.bot(b), leader === this.player ? null : this.bot(leader));
    return true;
  }
  followersOf(b: MevBody, out: MevBody[]): void {
    const id = b === this.player ? this.g.state.playerId : b.id;
    const list = this.g.state.enemyTanks;
    for (let i = 0; i < list.length; i++) { const e = list[i]; if (e.active && !e.isDying && e._mevFollowOf === id) out.push(e as unknown as MevBody); }
  }
  spawnShape(word: string, x: number, y: number, sizeFactor: number, areaIdx: number): MevBody | null { return this.g._mevSpawnShape(word, x, y, sizeFactor, areaIdx); }

  kill(b: MevBody, _credit = false, become = false): void {
    if (b === this.player) { this.g._mevPlayerDies(); return; }
    const p = this.shape(b);
    if (p) { if (p.active && !p.fadingOut) { p.hp = 0; p.shield = 0; p.fadingOut = true; if (SMALL_FIX.GH375) p._mevDeath = become ? CAUSE_BECOME : CAUSE_RULE; } return; }
    const e = this.bot(b);
    if (e.isDying || !e.active) return;
    e.currentHealth = 0; e.currentShield = 0;
    (this.g as unknown as { _mevCause: number })._mevCause = become ? CAUSE_BECOME : CAUSE_RULE;
    this.g.killEnemy(e);
  }
  remove(b: MevBody): void {
    if (b === this.player) return;
    const p = this.shape(b);
    if (p) { p._mev = -1; p.active = false; p.opacity = 0; p._ruleOpacity = 0; p.fadingOut = true; p.hpBarOpacity = 0; p.displayHp = 0; p.displayShield = 0; return; }
    const e = this.bot(b);
    e.active = false;
    e.isDying = true;
    e.deathStartTime = -1e12;
    if (SMALL_FIX.GH393) this.g._mevRemoveOwned(e);
    if (SMALL_FIX.GH519) this.g._mevChatDrop(e);
  }
  morph(b: MevBody, req: SpawnReq): boolean {
    if (b === this.player) {
      let ok = false;
      this.g._mevInMorph = true;
      try { ok = this.g.evolveToTank(req.tank, false, false, false); } finally { this.g._mevInMorph = false; }
      if (!ok) { this.logLine(`Change Tank: the player cannot become "${req.tank}".`); return false; }
      this.g._mevRefillPlayer(req.refill);
      return true;
    }
    if (SMALL_FIX.GH376 && this.shape(b)) { this.logLine('Change Tank: a shape cannot change tank in its place. Use Become.'); return false; }
    const g = this.g;
    const e = this.bot(b);
    const bare = req.typeIdx < 0;
    if (bare) {
      req.stands = ((e._mevF ?? 0) & MF_STANDS) !== 0;
      req.camp = e.camp === CAMP_BOSS ? 'boss' : e.camp === CAMP_SHAPE ? 'shape' : 'none';
      req.bossTier = e.isBossTier === true;
      req.colourUse = e.useHardcodedColor ? 'file' : 'team';
    }
    const cfg = this.configFor(req);
    if (!cfg) { this.logLine(`Change Tank: no tank "${req.tank}" to change to.`); return false; }
    const wasName = g.state.enemyConfigs.find(c => c.id === e.configId)?.enemyName;
    const wasId = e.configId, wasShoot = e.forceAutoshoot;
    g._mevMorph(e, req, cfg);
    if (bare) {
      if (((e._mevF ?? 0) & MF_STAGE) === 0) { if (SMALL_FIX.GH507) { e.configId = wasId; e.forceAutoshoot = wasShoot; } return true; }
    } else {
      const held = g._mevGodHeld(e) ? MF_GOD : 0;
      e._mevF = (this.bitsOf(req) & ~MF_BIRTH_FOOD) | held | ((e._mevF ?? 0) & (MF_PLACED | MF_EDITOR | MF_WAVE | MF_NO_GROW));
      e._mevScore = g._mevScoreOver(e, req.score);
      e._mevOrder = req.orderIdx;
      e.useHardcodedColor = cfg.useHardcodedColor === true;
      if (req.colourUse === 'team') e.keepOwnColor = false;
      if (req.sight > 0) e.fovRadius = req.sight;
      if (req.camp === 'shape') e.camp = CAMP_SHAPE;
      else if (req.camp === 'boss' || req.bossTier) e.camp = CAMP_BOSS;
      else e.camp = CAMP_NONE;
      e.isBossTier = req.bossTier;
      if (req.team && this.sideOf(b) !== req.team) this.setSide(b, req.team);
    }
    e._mevBirthAt = -1;
    if (req.stands) { e.bpAnchorX = e.position.x; e.bpAnchorY = e.position.y; }
    if (req.name) e.displayName = req.name;
    else if (e.displayName === wasName) e.displayName = cfg.enemyName ?? e.displayName;
    return true;
  }
  setSide(b: MevBody, word: string): boolean {
    if (b === this.player) {
      if (word === 'zombies') return false;
      const ok = this.g._mevSetPlayerSide(word);
      if (ok) this.g._mevTeamEntered(null);
      return ok;
    }
    const sp = this.shape(b);
    if (sp) { if (SMALL_FIX.R895 !== 0) this.g._mevShapeSetSide(sp, word); this.g._shapeEntersSide(sp, word); return true; }
    const e = this.bot(b);
    if (word === 'zombies') { this.g._mevJoinZombies(e); return true; }
    this.g._mevLeaveSides(e);
    const beh = this.behaviorOf(word);
    e.aiBehavior = beh;
    e.team = beh === 'Team1' ? 'team1' : beh === 'Team2' ? 'team2' : beh === 'Team3' ? 'team3' : beh === 'Team4' ? 'team4' : beh === 'Team5' ? 'team5' : beh === 'Friendly' ? 'player' : 'enemy';
    this.g._adminSideChangedOne(e);
    this.g._mevTeamEntered(e);
    return true;
  }
  setName(b: MevBody, name: string): void { if (b === this.player) this.g._mevSetPlayerName(name); else if (!this.shape(b)) this.bot(b).displayName = name; }
  heal(b: MevBody, amount: number, isShare: boolean): void {
    const p = this.shape(b);
    if (p) { p.hp = Math.min(p.maxHp, p.hp + (isShare ? p.maxHp * amount / 100 : amount)); return; }
    this.g._mevHeal(b === this.player ? null : this.bot(b), amount, isShare);
  }
  damage(b: MevBody, amount: number, isShare: boolean): void {
    const p = this.shape(b);
    if (p) {
      if (SMALL_FIX.GH379 && p._cantDie) return;
      const amt = isShare ? p.maxHp * amount / 100 : amount;
      if (SMALL_FIX.GH380) this.g._hurtShapeShielded(p, amt, this.g.gameNow()); else p.hp -= amt;
      if (p.hp <= 0) this.kill(b);
      return;
    }
    this.g._mevDamage(b === this.player ? null : this.bot(b), amount, isShare);
  }
  invulnerable(b: MevBody, seconds: number): void { if (this.shape(b)) return; this.g._mevGodFor(b === this.player ? null : this.bot(b), seconds); }
  invisible(b: MevBody, on: boolean, style: number): void { if (this.shape(b)) return; this.g._mevInvisible(b === this.player ? null : this.bot(b), on, style); }
  statusEffect(b: MevBody, kind: string, on: boolean, a: Record<string, unknown>): void { if (this.shape(b)) return; this.g._mevStatus(b === this.player ? null : this.bot(b), kind, on, a); }
  statusWords(b: MevBody, kind: string, a: Record<string, unknown>): void { if (this.shape(b) || b === this.player) return; this.g._mevStatusWords(this.bot(b), kind, a); }
  teleport(b: MevBody, x: number, y: number, areaIdx: number): void {
    if (b === this.player) { this.g._mevTeleportPlayer(x, y, areaIdx); return; }
    const p = this.shape(b);
    if (p) {
      p.position.x = x; p.position.y = y;
      if (areaIdx >= 0) p.areaIdx = areaIdx;
      else if (SMALL_FIX.GH381) { const a = this.g._areaIndexAtWorld(x, y); if (a >= 0) p.areaIdx = a; }
      return;
    }
    this.g._chatPlaceBot(this.bot(b), x, y, false);
    const e = this.bot(b);
    if (((e._mevF ?? 0) & MF_STANDS) !== 0) { e.bpAnchorX = x; e.bpAnchorY = y; }
  }
  bodySay(b: MevBody, text: string): void { if (this.shape(b)) return; this.g._mevBodySay(b === this.player ? null : this.bot(b), text); }
  setOrder(b: MevBody, orderIdx: number): void {
    if (b === this.player || this.shape(b)) return;
    const e = this.bot(b);
    e._mevOrder = orderIdx;
    e._mevF = (e._mevF ?? 0) | MF_ORDER;
  }

  behaviorSet(zoneIdx: number, behaviorRow: number, on: boolean): void { this.g._mevBehaviorSet(zoneIdx, behaviorRow, on); }
  areaPaint(zoneIdx: number, colourSlot: number, opacity: number): void { this.g._mevAreaPaint(zoneIdx, colourSlot, opacity); }
  areaWhitelist(zoneIdx: number, behaviorRow: number, add: readonly string[], remove: readonly string[]): void { this.g._mevAreaWhitelist(zoneIdx, behaviorRow, add, remove); }
  darkness(zoneIdx: number, on: boolean, fade: number, a: Record<string, unknown> | null): void { this.g._mevDarkness(zoneIdx, on, fade, a); }
  botInterest(b: MevBody, how: number, zone: number, target: MevBody | null, portal: number, until: number, tag: number, seconds: number, giveUp: number, toward = 0, giveUpTo = 0): void {
    if (b === this.player || this.shape(b)) return;
    const t = target === null || target === this.player ? null : this.shape(target) ?? this.bot(target);
    this.g._mevBotInterest(this.bot(b), how, zone, t, portal, until, tag, seconds, giveUp, toward, giveUpTo);
  }
  isDark(x: number, y: number): boolean { return darkAt(this.g.dark, x, y); }

  say(text: string, lifeMs: number, now: number): void { this.g.pushMessage(text, now, lifeMs); }
  showOnHud(text: string): void { this.g._mevShowOnHud(text); }
  lbTeams(on: boolean, title: string, goal: number, unit: string, unitOne: string, vars: number[] | null): void { this.g._mevLbTeams(on, title, goal, unit, unitOne, vars); }
  sceneHold(held: boolean, guard: boolean, botsStop: boolean, canSkip: boolean): void { this.g._mevSceneHold(held, guard, botsStop, canSkip); }
  sceneMover(b: MevBody): void {
    if (b === this.player || this.shape(b)) return;
    const e = this.bot(b);
    e._mevF = (e._mevF ?? 0) | MF_SCENE_MOVES;
  }
  respawnSet(team: string, on: boolean): void { this.g._mevRespawnSet(team, on); }
  wallsMove(on: boolean, perMinute: number, slide: number): void { this.g._mevWallsMove(on, perMinute, slide); }
  wallsRetype(share: number, seconds: number): void { this.g._mevWallsRetype(share, seconds); }
  matchEnd(result: 'win' | 'lose', team: string, then: 'nothing' | 'closeArena', now: number, closing: string, closed: string, screen: string): void { this.g._mevMatchEnd(result, team, then, now, closing, closed, screen); }
  livingLeft(): boolean { return this.g._mevLivingLeft(); }
  treeSwap(from: string, to: string): void { this.g._mevTreeSwap(from, to); }
  logLine(text: string): void { this.g._mevLogLine(text); }
  clockMs(): number { return performance.now(); }
}
