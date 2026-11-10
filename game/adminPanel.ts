import type { GameState, EnemyTank, FloatingPolygon, Bullet, UpgradeStat, MapState, WallEntity, RockEntity, PortalEntity, TeamId, AIBehavior } from '../types';
import type { Vector } from '../utils/MathUtils';
import { ADMIN_PANEL } from './adminPanelSwitch';
import { PHOTO_MODE } from './photoMode';
import { getShapeDef, LABY_LABELS, type ShapeDefinition } from './ShapeRegistry';
import { getTreeRoot } from './evolutionTree';
import { xpThresholdForLevel } from './GameLogic';
import { getEnemyStatMultiplier } from './EnemyAI';
import { makeShapeLook, type ShapeLook } from '../utils/shapeLook';
import { TileType, isGroupsMode, teamColourMode, sandboxTeamsOn, PORTAL_KIND_WORMHOLE, type OtherPart } from '../types';
import { TEAM_NAMES } from '../types';
import { ALL_MODES } from './allModesSwitch';
import { ROCK_HP, ROCK_SHIELD, type AreaBounds } from './MapSystem';
import { deathC, slideSize, SIZE_SLIDE_MIN_PX_PER_SEC } from '../utils/motionArras';
import { pumpkinTurn, rockTurn, pumpkinRocksOf, rockWearsPumpkin } from '../utils/halloween';
import { getCollisionFactor } from '../utils/p5Utils';
import { carryMark, CARRY_PLAYER_KEY, type CarryMarked } from '../utils/carryShow';
import { SMALL_FIX } from './smallFixSwitch';
import { TEAM_COLOUR } from './teamColourSwitch';
import { WT_TEAM, WT_BASE, WALL_TYPES_4S } from './wallTypes';
import { MOBILE_ARRAS } from './mobileSwitch';
export interface AdminHost {
  state: GameState;
  tankPos: Vector;
  tankVelocity: Vector;
  knockbackVelocity: Vector;
  bullets: Bullet[];
  floatingPolygons: FloatingPolygon[];
  mapState: MapState | null;
  areaStates: MapState[];
  areaBounds: AreaBounds[];
  gameNow(): number;
  _areaIndexAtWorld(x: number, y: number): number;
  keys: Set<string>;
  tankDying: boolean;
  playSessionActive: boolean;
  getMouseWorldX(): number;
  getMouseWorldY(): number;
  pointerWorldX(): number;
  pointerWorldY(): number;
  pushMessage(msg: string, at?: number): void;
  updateState(p: Partial<GameState>): void;
  onStateChange: ((s: GameState) => void) | null;
  evolveToTank(fileName: string, isPlayerChoice?: boolean, announce?: boolean, spawn?: boolean): boolean;
  devTankNow(): void;
  addXp(amount: number): void;
  getStatMultiplier(stat: UpgradeStat): number;
  updateEditorFov(growthScale?: number): void;
  debugFovMin(): number;
  debugFovMax(): number;
  getPlayerDisplayName(): string;
  playerTankDisplayName(): string | null;
  resolveTankDisplayName(fileName: string | null): string;
  recomputePlayerResist(): void;
  debugAccess(): boolean;
  _fsJumpPlayer(): void;
  _fsWarpPlayer(wx: number, wy: number): void;
  _cameraToPlayer(): void;
  _playerBodyRadius(): number;
  _syncPlayerChildren(): void;
  createShapeAtPosition(def: ShapeDefinition, x: number, y: number, areaIdx?: number): void;
  killEnemy(e: EnemyTank): void;
  distributeShapeXp(p: FloatingPolygon): void;
  _adminKickEnemy(e: EnemyTank): void;
  _debugPowersOff(): void;
  playerGroupId: number;
  _adminRebuildNav(ms: MapState, nav?: boolean): void;
  _mmPanelTakes(w: WallEntity): void;
  _adminTakesPlace(from: FloatingPolygon, to: FloatingPolygon): void;
  _adminExitOf(x: number, y: number, r: number): { x: number; y: number };
  _adminPushPlayer(x: number, y: number): void;
  _adminPushBot(e: EnemyTank, x: number, y: number): void;
  _adminPushShape(p: FloatingPolygon, x: number, y: number): void;
  _adminInWall(x: number, y: number, r: number, kind: number, ref: unknown): boolean;
  _adminEndGlide(e: EnemyTank | null): void;
  _adminWallRadius(e: EnemyTank | null): number;
  _adminSidesChanged(): void;
  _forgetPlayerHit(): void;
  _forgetPlayerAttacker(): void;
  spectatedTank(): EnemyTank | null;
  _adminPlayerGroupMoved(from: number, to: number): void;
  _adminGuardsMoved(): void;
  _adminPlayerAreaFollow(): void;
  _adminBotAreaFollow(e: EnemyTank): void;
}

export const K_NONE = 0, K_PLAYER = 1, K_ENEMY = 2, K_SHAPE = 3, K_BULLET = 4, K_WALL = 5, K_ROCK = 6, K_PORTAL = 7;

export const AT_ALL_TEAM_MINIMAP = 1, AT_ON_LEADERBOARD = 2, AT_NO_RELOAD = 4, AT_NO_RECOIL = 8, AT_NO_EDGE = 16,
  AT_WALL_PASS = 32, AT_TP_ACTION = 64, AT_DATA_ACTION = 128, AT_DRAG_ACTION = 256, AT_BLAST_ACTION = 512, AT_SCORE = 1024;
export const AT_DEFAULT = AT_ON_LEADERBOARD | AT_SCORE;
const ATTR_KEYS: Record<string, number> = {
  KeyT: AT_ALL_TEAM_MINIMAP, KeyL: AT_ON_LEADERBOARD, KeyC: AT_NO_RELOAD, KeyR: AT_NO_RECOIL, KeyO: AT_NO_EDGE,
  KeyW: AT_WALL_PASS, KeyE: AT_TP_ACTION, KeyG: AT_DATA_ACTION, KeyD: AT_DRAG_ACTION, KeyB: AT_BLAST_ACTION, KeyS: AT_SCORE,
};
const ATTR_NAMES: Record<number, string> = {
  [AT_ALL_TEAM_MINIMAP]: 'all team minimap', [AT_ON_LEADERBOARD]: 'shown on leaderboard', [AT_NO_RELOAD]: 'no reload cooldown',
  [AT_NO_RECOIL]: 'no recoil', [AT_NO_EDGE]: 'no arena boundary force', [AT_WALL_PASS]: 'pass through walls',
  [AT_TP_ACTION]: 'teleport action', [AT_DATA_ACTION]: 'get data action', [AT_DRAG_ACTION]: 'drag action',
  [AT_BLAST_ACTION]: 'blast action', [AT_SCORE]: 'accepts score',
};
const SKILL_KEYS = 'KeyR KeyC KeyM KeyD KeyF KeyG KeyH';
const LEFT_ACTIONS = AT_DATA_ACTION | AT_DRAG_ACTION | AT_BLAST_ACTION;

export const MSG_FIRST = 'Press ` + ¹ or ` + / for help.';
export const MSG_HELP = 'Help menu:\n- [Q] Basic\n- [E] Teleport\n- [K] Kill\n- [W] Whirlpool\n- [D] Drag\n- [X] Wall\n- [F] Polygon\n'
  + '- [Z] Type\n- [C] Color\n- [V] Vanish\n- [I] Invulnerable\n- [T] Team\n- [Y] Invite to team\n- [H] Heal\n- [S+?] Skill\n'
  + '- [G] Get data\n- [N] Infinite level up\n- [B] Blast\n- [J] Joint\n- [O] Kick\n- [A+?] Attribute\n- [-] Zoom out\n'
  + '- [=] Zoom in\n- [0] Reset zoom\n- [,] Smaller\n- [.] Bigger\nWarning: Avoid zooming all the way out to prevent lagging the server.';
export const MSG_HELP_S = 'Help menu:\n- [R] Reset skills\n- [C] Clear skills\n- [M] Maximize skills\n- [D] Remove skill point\n'
  + '- [F] Add skill point\n- [G] Reduce skill cap\n- [H] Increase skill cap';
export const MSG_HELP_A = 'Help menu:\n- [T] All team minimap\n- [L] Shown on leaderboard\n- [C] No reload cooldown\n- [R] No recoil\n'
  + '- [O] No arena boundary force\n- [W] Pass through walls\n- [E] Teleport action\n- [G] Get data action\n- [D] Drag action\n'
  + '- [B] Blast action\n- [S] Accepts score';
export const MSG_NO_KILL = 'No entity killed!';
export const MSG_NO_PICK = 'No entity picked up!';
export const MSG_HEALED_SELF = 'You are now fully healed.';
export const MSG_GOD_ON = 'Activated invulnerability.';
export const MSG_GOD_OFF = 'Deactivated invulnerability.';
export const MSG_CANNOT_CHANGE = 'Entity cannot be changed!';
export const MSG_TEAM_SAME = 'Your team is not changed.';
export const MSG_JOINT_PICK = 'Selected entity to create a joint!';
export const MSG_JOINT_POS = 'Created joint to position!';
export const MSG_JOINT_ENT = 'Created joint to entity!';
export const MSG_JOINT_DEL = 'Deleted joint!';
export const MSG_JOINT_LOOP = 'Cannot create a recursive joint!';
export const MSG_UP = 'You have been promoted to Arena Conductor!';
export const MSG_DOWN = 'You have been demoted to Player!';

const SH_TYPES = ['egg', 'square', 'triangle', 'pentagon', 'hexagon'];
const SH_KINDS = ['', 'shiny', 'legendary', 'shadow', 'rainbow', 'trans'];
const SH_SIZES = 6;
const SH_CRASHER = SH_SIZES - 1;
const MENU_DEAD = 15;
const MENU_STEP = 120;
const MENU_ARM = 22;
const ARRAS_TICKS_PER_SEC = 30;
const SIZE_STEPS_MIN = -14, SIZE_STEPS_MAX = 29;
const SIZE_STEP = 1.2, ZOOM_OUT = 1.25, ZOOM_IN = 0.8;
export const VIEW_CEIL = 19900;
const BLAST_R = 255, BLAST_V = 22.5;
const SHAPE_LIMIT = 2500;
const WALL_DEATH_MS = 300;
const HOLD_MAX = 256;
export const DOT_R = 15;
const SLIDE_MAX = 32;
const STEP_SEC = 1 / 60;
const NAV_SETTLE_MS = 150, NAV_EVERY_MS = 1000;
const WALL_GLIDE_STEPS = 2;
const GROUP_TEAM_BASE = 1000;
const PANEL_GROUP_BASE = 900000;

export const COLOR_WHEEL = [10, 11, 12, 15, 3, 17, 6, 13, 2, 14, 4, 5, 1, 0, 7, 9, 16, 8, 18, 19];
const TEAM_SLOTS = [10, 11, 12, 15];
const ARRAS_TEAM_OF = [1, 3, 2, 4];
const ARRAS_TEAM_OF_GREEN = [1, 2, 3, 4];
const TEAM_DREADS = -10, TEAM_NEUTRAL = -5, NEUTRAL_SLOT = 3;
const TEAM_SHAPES = -100, TEAM_WALLS = -101;

export const JOINT_NAMES = ['fixed', 'minimum distance', 'maximum distance', 'fixed distance', 'fixed angle',
  'fixed angle, minimum distance', 'fixed angle, maximum distance'];
const JOINT_MAX = 256;

const WALL_CELL = 60;
const WALL_INSET = 1.5;
export const WALL_NAMES = ['Wall', 'Deadly Wall', 'Healing Wall', 'Bouncy Wall', 'Breaker Wall', 'Chunks Wall', 'Optical Wall',
  'One-Way Wall (Up)', 'One-Way Wall (Down)', 'One-Way Wall (Left)', 'One-Way Wall (Right)', 'Sticky Wall', 'Trick Wall',
  'Paint Wall', 'Filter Wall', 'Team Wall', 'Base Wall', 'Portal Wall', 'Checkpoint Wall'];
const WALL_IDS = ['', 'other:deadly-wall', 'other:healing-wall', 'other:bouncy-wall', 'other:breaker-wall', 'other:chunks-wall',
  'other:optical-wall', 'other:one-way-wall-up', 'other:one-way-wall-down', 'other:one-way-wall-left', 'other:one-way-wall-right',
  'other:sticky-wall', 'other:trick-wall', 'other:paint-wall', 'other:filter-wall', 'other:team-wall', 'other:base-wall',
  'other:portal-wall', 'other:checkpoint-wall'];
export const ROCK_TYPE = WALL_NAMES.length;
const TYPE_SLICES = WALL_NAMES.length + 1;
const ROCK_SHAPE = -9, ROCK_MIN = 30, ROCK_MAX = 1500;

export interface WallLook { look: ShapeLook; perHalf: number; type: number; bodyMap: number }
export interface DyingWall { x: number; y: number; halfW: number; halfH: number; look: WallLook | null; at: number; wi: number; slot: number }
export interface DyingRock { x: number; y: number; size: number; shape: number; rotation: number; lookDx: number; lookDy: number; at: number; slot: number }

export function designOf(def: ShapeDefinition | undefined): number {
  if (!def) return -1;
  if (def.isCrasher) {
    const t = SH_TYPES.indexOf(String(def.baseShape).replace(/^crasher/, '').toLowerCase());
    return t < 0 ? -1 : t + 5 * SH_CRASHER;
  }
  if (def.category !== 'base' && def.category !== 'rarity' && def.category !== 'laby') return -1;
  const t = SH_TYPES.indexOf(def.baseShape);
  const s = def.labyLevel | 0;
  const k = SH_KINDS.indexOf(def.rarity === 'normal' ? '' : def.rarity);
  if (t < 0 || s >= SH_CRASHER || k < 0) return -1;
  return t + 5 * s + 5 * SH_SIZES * k;
}
export function idOfDesign(d: number): string {
  const t = d % 5, s = ((d / 5) | 0) % SH_SIZES, k = (d / (5 * SH_SIZES)) | 0;
  const cap = SH_TYPES[t].charAt(0).toUpperCase() + SH_TYPES[t].slice(1);
  const rar = SH_KINDS[k];
  if (s === SH_CRASHER) return k === 0 ? 'crasher' + cap : '';
  if (s === 0) return k === 0 ? SH_TYPES[t] : rar + cap;
  const label = LABY_LABELS[s];
  const pent = SH_TYPES[t] === 'pentagon' && (s === 1 || s === 2);
  if (k === 0) return pent ? 'laby' + label + cap : label.toLowerCase() + cap;
  return pent ? rar + 'Laby' + label + cap : rar + label + cap;
}

const _mod = (a: number, n: number) => ((a % n) + n) % n;

export class AdminPanel {
  live = false;
  held = false;
  attrs = AT_DEFAULT;
  sizeSteps = 0;
  size = 1;
  get zoom(): number { return this.host.state.debugFovMultiplier ?? 1; }
  set zoom(z: number) { this.host.state.debugFovMultiplier = z; }
  conductor = false;

  private host: AdminHost;
  private saidHelpTip = false;
  private menu = 0;
  private menuKeyDown = false;
  private pickKey = '';
  private lastDesign = 0;
  lastWallType = 0;
  private wKind = K_NONE; private wRef: unknown = null; private wKey: unknown = null;
  private dN = 0;
  private dKind = new Int8Array(HOLD_MAX);
  private dRef: unknown[] = new Array(HOLD_MAX).fill(null);
  private dKey: unknown[] = new Array(HOLD_MAX).fill(null);
  private dOffX = new Float64Array(HOLD_MAX);
  private dOffY = new Float64Array(HOLD_MAX);
  private dByKey = '';
  private zOn = false; private zX = 0; private zY = 0;
  private zKind = K_NONE; private zRef: unknown = null; private zKey: unknown = null;
  private zBase = 0; private zNow = 0;
  private zTick = -1;
  private tankSeen: string | null = null;
  lookWalls: WallEntity[] = [];
  typedWalls: WallEntity[] = [];
  typedVer = 0;
  dying: DyingWall[] = [];
  dyingRocks: DyingRock[] = [];
  private wallsMade: WallEntity[] = [];
  private rockUndo: RockEntity[] = [];
  private rockGridUndo: { ms: MapState; cell: number; v: number }[] = [];
  mWalls: WallEntity[] = [];
  mN = 0;
  private mSliding = false;
  mX = new Float64Array(16); mY = new Float64Array(16); mHW = new Float64Array(16); mHH = new Float64Array(16);
  private mL = new Float64Array(16); private mR = new Float64Array(16); private mT = new Float64Array(16); private mB = new Float64Array(16);
  private mTw = new Float64Array(16);
  private mPX = new Float64Array(16); private mPY = new Float64Array(16); private mPW = new Float64Array(16); private mPH = new Float64Array(16);
  private navStates: MapState[] = [];
  private navDirty = false;
  private navDirtyAt = 0;
  private navBuiltAt = -Infinity;
  mapVer = 0;
  dotX = new Float64Array(2);
  dotY = new Float64Array(2);
  dotUntil = new Float64Array([-1, -1]);
  private sN = 0;
  private sRef: (FloatingPolygon | null)[] = new Array(SLIDE_MAX).fill(null);
  private sKey: (string | null)[] = new Array(SLIDE_MAX).fill(null);
  mRocks: RockEntity[] = [];
  mRN = 0;
  private rocksMade: RockEntity[] = [];
  private rockStates: { ms: MapState; len: number }[] = [];
  private mapRockUndo: { r: RockEntity; x: number; y: number; size: number; rotation: number; active: boolean }[] = [];
  private portalUndo: { p: PortalEntity; x: number; y: number }[] = [];
  private changed: MapState[] = [];
  private xRock: RockEntity | null = null;
  private zW: WallEntity | null = null;
  private zR: RockEntity | null = null;
  private guardsMoved = false;
  private poW: WallEntity | null = null;
  private poR: RockEntity | null = null;
  private wallStates: { ms: MapState; len: number; extra: number[] | undefined }[] = [];
  private mapWallUndo: { w: WallEntity; x: number; y: number; active: boolean; look: WallLook | null | undefined; kind: number | undefined; wslot: number | undefined; wteam: number | undefined }[] = [];
  private gridUndo: { ms: MapState; idx: number; cells: number[] }[] = [];
  private wallLooks: (WallLook | null | undefined)[] = [];
  private xRec: WallEntity | null = null;
  private xCx = 0; private xCy = 0; private xAx = 0; private xAy = 0; private xN = 1;
  private zWallBase = 0; private zWallNow = 0;
  private pTeam: number | null = null;
  pSlot = -1;
  private teamSlot = -1;
  shapeTeamOn = false;
  private shapeTeams = new WeakMap<FloatingPolygon, string>();
  private shapePainted = new WeakMap<FloatingPolygon, string>();
  private shapeYs = 0;
  botSlots = new Map<string, number>();
  botMine = new Set<string>();
  private readonly _liveIds = new Set<string>();
  private sides: { e: EnemyTank; id: string; given: number; team: TeamId; beh: AIBehavior; group: number }[] = [];
  private pGroupWas: number | null = null;
  private pSideWas: number | null = null;
  private panelGroups = new Map<number, number>();
  groupsOn = false;
  sidesOn = false;
  colorsOn = false;
  wallSlots = new WeakMap<object, number>();
  wallSlotsOn = false;
  private cOn = false; private cX = 0; private cY = 0;
  private cKind = K_NONE; private cRef: unknown = null; private cKey: unknown = null; private cNow = -1;
  private lastColor = -1;
  jointType = 0;
  jN = 0;
  private jKind = new Int8Array(JOINT_MAX);
  private jTK = new Int8Array(JOINT_MAX);
  private jTRef: unknown[] = new Array(JOINT_MAX).fill(null);
  private jTKey: unknown[] = new Array(JOINT_MAX).fill(null);
  private jAK = new Int8Array(JOINT_MAX);
  private jARef: unknown[] = new Array(JOINT_MAX).fill(null);
  private jAKey: unknown[] = new Array(JOINT_MAX).fill(null);
  private jAX = new Float64Array(JOINT_MAX);
  private jAY = new Float64Array(JOINT_MAX);
  private jD = new Float64Array(JOINT_MAX);
  private jUX = new Float64Array(JOINT_MAX);
  private jUY = new Float64Array(JOINT_MAX);
  private jOX = new Float64Array(JOINT_MAX);
  private jOY = new Float64Array(JOINT_MAX);
  private jpKind = K_NONE; private jpRef: unknown = null; private jpKey: unknown = null;
  private selKind: number[] = [];
  private selRef: unknown[] = [];
  private ids = new WeakMap<object, number>();
  private nextId = 1;
  private cad = new Int32Array(9);
  private cadAt = 0;
  private revokeListeners: (() => void)[] = [];

  constructor(host: AdminHost) { this.host = host; }

  allowed(): boolean {
    const s = this.host.state;
    return ADMIN_PANEL.ON !== 0 && s.isTestMode && s.debugMode && !s.paused && !s.playerDead && this.host.debugAccess();
  }

  keyDown(code: string, repeat: boolean, inField: boolean): boolean {
    if (ADMIN_PANEL.ON === 0) return false;
    if (!inField && !repeat && (MOBILE_ARRAS === 0 || this.host.state.paused)) this._cadence(code);
    if (inField) return false;
    if (code === 'Backquote') {
      if (repeat) return this.held;
      if (!this.allowed()) return false;
      this.held = true;
      this._refreshLive();
      if (!this.saidHelpTip) { this.saidHelpTip = true; this.host.pushMessage(MSG_FIRST); }
      return true;
    }
    if (!this.held) return false;
    if (!this.allowed()) { this.release(); return false; }
    if (code === 'Escape') { this.release(); return false; }
    this._command(code, repeat);
    this.afterKey();
    return true;
  }

  keyUp(code: string): void {
    if (code === 'Backquote') { this.release(); return; }
    if (!this.held) return;
    if (code === 'KeyA' || code === 'KeyS') { if (this.menu !== 0) this.menuKeyDown = false; return; }
    if (this.menu !== 0 && code === this.pickKey) { this.menu = 0; this.pickKey = ''; }
    if (code === 'KeyW') this._endWhirl();
    else if (code === 'KeyD' && this.dByKey === 'KeyD') this._endDrag();
    else if (code === 'KeyZ') this._endZ();
    else if (code === 'KeyX') this._endWall();
    else if (code === 'KeyC') this._endColor();
    else if (code === 'KeyJ') this._jointUp();
  }

  release(): void {
    this.held = false;
    this.menu = 0; this.menuKeyDown = false; this.pickKey = '';
    this._endWhirl();
    this._endDrag();
    this._endZ();
    this._endWall();
    this._endColor();
    this.jpKind = K_NONE; this.jpRef = null; this.jpKey = null;
    this._refreshLive();
  }

  resetMatch(): void {
    this.release();
    this._restoreWalls();
    this._restoreSides();
    this.dotUntil[0] = -1; this.dotUntil[1] = -1;
    for (let i = 0; i < this.sN; i++) { this.sRef[i] = null; this.sKey[i] = null; }
    this.sN = 0; this.guardsMoved = false;
    this.pTeam = null; this.pSlot = -1; this.teamSlot = -1; this.shapeTeamOn = false; this.shapeTeams = new WeakMap(); this.shapeYs = 0;
    this.shapePainted = new WeakMap();
    this.botSlots.clear(); this.botMine.clear(); this.colorsOn = false; this.lastColor = -1;
    this.wallSlots = new WeakMap(); this.wallSlotsOn = false;
    for (let i = 0; i < this.jN; i++) { this.jTRef[i] = null; this.jTKey[i] = null; this.jARef[i] = null; this.jAKey[i] = null; }
    this.jN = 0; this.jointType = 0;
    this.attrs = AT_DEFAULT;
    this.sizeSteps = 0; this.size = 1; this.zoom = 1;
    this.lastDesign = 0; this.lastWallType = 0;
    this.saidHelpTip = false;
    this.tankSeen = null;
    if (SMALL_FIX.GH308 !== 0) this._st.length = 0;
    this.ids = new WeakMap();
    this.nextId = 1;
    this._refreshLive();
  }

  onOwnerDeath(): void {
    this.release();
    this._resetBody();
  }

  powersOff(): void {
    this.release();
    this._resetBody();
  }

  private _boardChanged(): void {
    this.host.state.leaderboardVersion++;
    if (this.host.onStateChange) this.host.onStateChange(this.host.state);
  }

  private _resetBody(): void {
    const changed = this.attrs !== AT_DEFAULT || this.sizeSteps !== 0 || this.zoom !== 1;
    const offBoard = (this.attrs & AT_ON_LEADERBOARD) === 0;
    this.attrs = AT_DEFAULT;
    if (offBoard) this._boardChanged();
    this.sizeSteps = 0; this.size = 1; this.zoom = 1;
    if (changed && this.host.state.isTestMode) this.host.updateEditorFov(this.host.state.playerGrowthScale);
    this._refreshLive();
  }

  private _refreshLive(): void {
    this.live = this.held || this.blastHeld || this.wKind !== K_NONE || this.dN > 0 || this.zOn || this.cOn || this.xRec !== null || this.dying.length > 0
      || this.xRock !== null || this.sN > 0
      || this.dyingRocks.length > 0 || this.jN > 0 || this.navDirty || this.mSliding
      || this.attrs !== AT_DEFAULT || this.sizeSteps !== 0 || this.zoom !== 1;
  }

  private _command(code: string, repeat: boolean): void {
    if (this.menu !== 0) {
      if (!this.menuKeyDown) {
        if (this.pickKey !== '' && code !== this.pickKey) { this.menu = 0; this.pickKey = ''; return; }
        if (this.pickKey === '' && repeat) return;
      }
      if (this.menu === 1 ? this._attrCommand(code) : this._skillCommand(code)) {
        if (!this.menuKeyDown) this.pickKey = code;
        return;
      }
      this.menu = 0; this.pickKey = '';
      if (code !== 'KeyA' && code !== 'KeyS') return;
    }
    if (code === 'KeyA' || code === 'KeyS') {
      if (!repeat) { this.menu = code === 'KeyA' ? 1 : 2; this.menuKeyDown = true; this.pickKey = ''; }
      return;
    }
    const h = this.host;
    switch (code) {
      case 'Slash': case 'F1': if (!repeat) h.pushMessage(MSG_HELP); return;
      case 'KeyQ': if (!repeat) this._basic(); return;
      case 'KeyE': this._teleport(); return;
      case 'KeyK': this._kill(); return;
      case 'KeyW': if (!repeat) this._startWhirl(); return;
      case 'KeyD': if (!repeat) this._startDrag('KeyD', true); return;
      case 'KeyF': this._polygon(); return;
      case 'KeyX': if (!repeat) this._startWall(); return;
      case 'KeyT': this._team(); return;
      case 'KeyY': this._invite(); return;
      case 'KeyC': if (!repeat) this._startColor(); return;
      case 'KeyJ': this._jointDown(repeat); return;
      case 'KeyZ': if (!repeat) this._startZ(); return;
      case 'KeyV': h.updateState({ ghostMode: !h.state.ghostMode }); return;
      case 'KeyI': this._god(); return;
      case 'KeyH': this._heal(); return;
      case 'KeyG': this._getData(); return;
      case 'KeyN': this._levelUp(); return;
      case 'KeyB': this._blast(h.pointerWorldX(), h.pointerWorldY()); return;
      case 'KeyO': if (!repeat) this._kick(); return;
      case 'Minus': this._zoomBy(ZOOM_OUT); return;
      case 'Equal': this._zoomBy(ZOOM_IN); return;
      case 'Digit0': this._zoomBy(0); return;
      case 'Digit2': if (!repeat && !h.tankDying && (SMALL_FIX.G692 === 0 || h.spectatedTank() === null)) h.devTankNow(); return;
      case 'Comma': this._sizeBy(-1); return;
      case 'Period': this._sizeBy(1); return;
      default: return;
    }
  }

  private _attrCommand(code: string): boolean {
    if (code === 'Slash' || code === 'F1') { this.host.pushMessage(MSG_HELP_A); return true; }
    const bit = ATTR_KEYS[code];
    if (bit === undefined) return false;
    if ((this.attrs & bit) === 0 && (bit & LEFT_ACTIONS) !== 0) {
      const others = this.attrs & LEFT_ACTIONS;
      for (const b of [AT_DATA_ACTION, AT_DRAG_ACTION, AT_BLAST_ACTION]) {
        if ((others & b) === 0) continue;
        this.attrs &= ~b;
        this.host.pushMessage('Disabled attribute: ' + ATTR_NAMES[b] + '.');
      }
      if ((others & AT_DRAG_ACTION) !== 0 && this.dByKey === 'Mouse') this._endDrag();
      this.blastHeld = false;
    }
    this.attrs ^= bit;
    this.host.pushMessage(((this.attrs & bit) !== 0 ? 'Enabled' : 'Disabled') + ' attribute: ' + ATTR_NAMES[bit] + '.');
    this._noteTank();
    this._refreshLive();
    if (bit === AT_ON_LEADERBOARD) this._boardChanged();
    return true;
  }

  private _skillCommand(code: string): boolean {
    if (code === 'Slash' || code === 'F1') { this.host.pushMessage(MSG_HELP_S); return true; }
    if (SKILL_KEYS.indexOf(code) < 0) return false;
    const h = this.host, s = h.state;
    if (h.tankDying) return true;
    const keys = Object.keys(s.upgrades) as UpgradeStat[];
    const hp0 = s.tankHP * h.getStatMultiplier('maxHealth');
    const sh0 = s.tankShieldCapacity * h.getStatMultiplier('shieldCapacity');
    const caps = s.skillCaps ? { ...s.skillCaps } : null;
    const ups = { ...s.upgrades };
    const capOf = (k: UpgradeStat) => (caps ? caps[k] : s.maxPointsPerSkill);
    let points = s.skillPoints;
    switch (code) {
      case 'KeyM': for (const k of keys) ups[k] = capOf(k); break;
      case 'KeyC': for (const k of keys) ups[k] = 0; break;
      case 'KeyR': {
        for (const k of keys) ups[k] = 0;
        if (caps && this.capsOwn && this.capsOwnTank === s.currentTankFileName) for (const k of keys) caps[k] = this.capsOwn[k];
        break;
      }
      case 'KeyF': points = Math.min(999999999, points + 1); break;
      case 'KeyD': points = Math.max(0, points - 1); break;
      case 'KeyG': case 'KeyH': {
        if (!caps) break;
        if (!this.capsOwn || this.capsOwnTank !== s.currentTankFileName) { this.capsOwn = { ...caps }; this.capsOwnTank = s.currentTankFileName; }
        for (const k of keys) {
          caps[k] = code === 'KeyG' ? Math.max(0, caps[k] - 1) : (caps[k] < 20 ? caps[k] + 1 : caps[k]);
          if (ups[k] > caps[k]) ups[k] = caps[k];
        }
        break;
      }
    }
    s.upgrades = ups;
    if (caps) s.skillCaps = caps;
    s.skillPoints = points;
    const hp1 = s.tankHP * h.getStatMultiplier('maxHealth');
    const sh1 = s.tankShieldCapacity * h.getStatMultiplier('shieldCapacity');
    if (hp0 > 0) s.tankCurrentHealth = s.tankDisplayHealth = Math.min(hp1, s.tankCurrentHealth / hp0 * hp1);
    if (sh0 > 0) s.tankCurrentShield = s.tankDisplayShield = Math.min(sh1, s.tankCurrentShield / sh0 * sh1);
    h.recomputePlayerResist();
    h._syncPlayerChildren();
    if (h.onStateChange) h.onStateChange(s);
    return true;
  }
  private capsOwn: Record<UpgradeStat, number> | null = null;
  private capsOwnTank: string | null = null;

  private _basic(): void {
    const h = this.host;
    if (h.tankDying) return;
    h.state.currentBranchRoot = getTreeRoot('basic');
    h.evolveToTank('basic', false, true);
    this.dropSizeAndView();
    if (h.onStateChange) h.onStateChange(h.state);
  }

  dropSizeAndView(): void {
    if (this.sizeSteps === 0 && this.zoom === 1) return;
    const h = this.host;
    this.sizeSteps = 0; this.size = 1; this.zoom = 1;
    h.updateEditorFov(h.state.playerGrowthScale);
    this._refreshLive();
  }

  private _teleport(): void {
    const h = this.host;
    if (h.tankDying) return;
    const fromX = h.tankPos.x, fromY = h.tankPos.y;
    h.tankPos.x = h.pointerWorldX();
    h.tankPos.y = h.pointerWorldY();
    h._adminEndGlide(null);
    h._fsWarpPlayer(h.tankPos.x - fromX, h.tankPos.y - fromY);
    h._cameraToPlayer();
    h._adminPlayerAreaFollow();
  }

  private _god(): void {
    const s = this.host.state;
    const on = s.gracePeriodActive ? !s._preGraceGodMode : !s.godMode;
    if (s.gracePeriodActive) this.host.updateState({ _preGraceGodMode: on });
    else this.host.updateState({ godMode: on });
    this.host.pushMessage(on ? MSG_GOD_ON : MSG_GOD_OFF);
  }

  private _levelUp(): void {
    const s = this.host.state;
    if (this.host.tankDying) return;
    const need = xpThresholdForLevel(s.level) - s.currentXp;
    if (need > 0) this.host.addXp(need);
    if (this.host.onStateChange) this.host.onStateChange(s);
  }

  private _sizeBy(dir: number): void {
    const n = Math.max(SIZE_STEPS_MIN, Math.min(SIZE_STEPS_MAX, this.sizeSteps + dir));
    if (n === this.sizeSteps) return;
    this.sizeSteps = n;
    this.size = Math.pow(SIZE_STEP, n);
    this._noteTank();
    this._refreshLive();
  }

  private _zoomBy(f: number): void {
    const h = this.host;
    let z = f === 0 ? 1 : this.zoom * f;
    if (f > 1) {
      const top = h.debugFovMax();
      if (z > top) z = Math.max(this.zoom, top);
    } else if (f > 0) {
      const low = h.debugFovMin();
      if (z < low) z = Math.min(this.zoom, low);
    }
    if (z === this.zoom) return;
    this.zoom = z;
    this._noteTank();
    h.updateEditorFov(h.state.playerGrowthScale);
    this._refreshLive();
  }

  viewSet(): void { this._noteTank(); this._refreshLive(); }

  private _noteTank(): void { if (this.tankSeen === null) this.tankSeen = this.host.state.currentTankFileName; }

  private _kill(): void {
    const h = this.host;
    const n = this._under(h.pointerWorldX(), h.pointerWorldY(), true);
    let killed = 0;
    for (let i = 0; i < n; i++) if (this._killThing(this.selKind[i], this.selRef[i])) killed++;
    h.pushMessage(killed === 0 ? MSG_NO_KILL : killed === 1 ? 'Killed 1 entity!' : 'Killed ' + killed + ' entities!');
  }

  private _killThing(kind: number, ref: unknown): boolean {
    const h = this.host;
    if (kind === K_PLAYER) {
      if (h.tankDying) return false;
      h.state.tankCurrentHealth = 0; h.state.tankCurrentShield = 0;
      if (SMALL_FIX.GH352) { if (SMALL_FIX.G694 !== 0) h._forgetPlayerAttacker(); else h._forgetPlayerHit(); }
      return true;
    }
    if (kind === K_ENEMY) {
      const e = ref as EnemyTank;
      if (!e.active || e.isDying) return false;
      e.currentHealth = 0; e.currentShield = 0;
      h.killEnemy(e);
      return true;
    }
    if (kind === K_SHAPE) {
      const p = ref as FloatingPolygon;
      if (!p.active || p.fadingOut) return false;
      p.hp = 0; p.shield = 0; p.fadingOut = true;
      h.distributeShapeXp(p);
      return true;
    }
    if (kind === K_BULLET) {
      const b = ref as Bullet;
      if (!b.active || b.isFading) return false;
      b.isFading = true;
      return true;
    }
    if (kind === K_WALL) return this._killWall(ref as WallEntity);
    if (kind === K_ROCK) return this._killRock(ref as RockEntity);
    return false;
  }

  private _killRock(r: RockEntity, look: boolean = true): boolean {
    if (!r.active) return false;
    const h = this.host;
    if (this.rockUndo.indexOf(r) < 0) this.rockUndo.push(r);
    r.active = false;
    if (look) this.dyingRocks.push({ x: r.x, y: r.y, size: r.size, shape: r.shape, rotation: r.rotation, lookDx: r.lookDx || 0, lookDy: r.lookDy || 0, at: h.gameNow(), slot: this.slotOf(r) });
    this._ungridRock(r);
    this._rocksChanged(r);
    this._refreshLive();
    return true;
  }

  private _rockStatesOf(r: RockEntity, out: MapState[]): number {
    const h = this.host;
    let n = 0;
    if (h.mapState && h.mapState.rocks.indexOf(r) >= 0) out[n++] = h.mapState;
    for (let i = 0; i < h.areaStates.length; i++) {
      const ms = h.areaStates[i];
      if (ms && ms !== h.mapState && ms.rocks.indexOf(r) >= 0) out[n++] = ms;
    }
    return n;
  }
  private _noteChanged(ms: MapState): void { if (this.changed.indexOf(ms) < 0) this.changed.push(ms); }
  private _rocksChanged(r: RockEntity): void {
    const n = this._rockStatesOf(r, this._st);
    for (let s = 0; s < n; s++) { this._st[s].rockBucketCount = -1; this._noteChanged(this._st[s]); }
    this._mapChanged();
  }
  private _ungridRock(r: RockEntity): void {
    const n = this._rockStatesOf(r, this._st);
    for (let s = 0; s < n; s++) {
      const ms = this._st[s];
      const ri = ms.rocks.indexOf(r);
      if (ri < 0 || !ms.rockGrid) continue;
      const g = ms.rockGrid;
      for (let c = 0; c < g.length; c++) if (g[c] === ri) { this.rockGridUndo.push({ ms, cell: c, v: ri }); g[c] = -1; }
    }
  }
  private _unfixRock(r: RockEntity): void {
    if (this.rocksMade.indexOf(r) < 0) {
      let had = false;
      for (let i = 0; i < this.mapRockUndo.length; i++) if (this.mapRockUndo[i].r === r) { had = true; break; }
      if (!had) {
        this.mapRockUndo.push({ r, x: r.x, y: r.y, size: r.size, rotation: r.rotation, active: r.active });
        this._ungridRock(r);
        if (r.rotation === 0 && pumpkinRocksOf(this.host.state.gameModeConfig) && rockWearsPumpkin(r.shape)) r.rotation = rockTurn(r) || 1e-6;
      }
    }
    this._trackRock(r);
  }
  private _addRock(x: number, y: number, s: number): RockEntity | null {
    const n = this._statesAt(x, y, this._st);
    if (n === 0) return null;
    const r: RockEntity = { x, y, size: s, shape: ROCK_SHAPE, rotation: pumpkinTurn(x, y, 0) || 1e-6,
      health: ROCK_HP, maxHealth: ROCK_HP, shield: ROCK_SHIELD, active: true, lookDx: 0, lookDy: 0 };
    for (let i = 0; i < n; i++) {
      const ms = this._st[i];
      let had = false;
      for (let k = 0; k < this.rockStates.length; k++) if (this.rockStates[k].ms === ms) { had = true; break; }
      if (!had) this.rockStates.push({ ms, len: ms.rocks.length });
      ms.rocks.push(r);
      ms.rockBucketCount = -1;
      this._noteChanged(ms);
    }
    this.rocksMade.push(r);
    this._trackRock(r);
    this._mapChanged();
    return r;
  }
  private _showRock(r: RockEntity): void {
    if (r.active) return;
    r.active = true;
    this._rocksChanged(r);
  }
  private _trackRock(r: RockEntity): void {
    for (let i = 0; i < this.mRN; i++) if (this.mRocks[i] === r) return;
    this.mRocks[this.mRN++] = r;
  }
  private _notePortal(p: PortalEntity): void {
    for (let i = 0; i < this.portalUndo.length; i++) if (this.portalUndo[i].p === p) return;
    this.portalUndo.push({ p, x: p.x, y: p.y });
  }

  private _pushOut(kind: number, ref: unknown): void {
    const h = this.host;
    this.poW = kind === K_WALL ? ref as WallEntity : null;
    this.poR = kind === K_ROCK ? ref as RockEntity : null;
    if (this.poW === null && this.poR === null) return;
    if (!h.tankDying && !this._carried(K_PLAYER, null)) {
      const r = h._adminWallRadius(null);
      if (this._covers(h.tankPos.x, h.tankPos.y, r)) { const t = h._adminExitOf(h.tankPos.x, h.tankPos.y, r); h._adminPushPlayer(t.x, t.y); }
    }
    const en = h.state.enemyTanks;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active || e.isDying || this._carried(K_ENEMY, e)) continue;
      const r = h._adminWallRadius(e);
      if (this._covers(e.position.x, e.position.y, r)) {
        const t = h._adminExitOf(e.position.x, e.position.y, r);
        h._adminPushBot(e, t.x, t.y);
        if (e.isBaseProtector === true) { this.guardsMoved = true; this._mapChanged(); }
      }
    }
    const ps = h.floatingPolygons;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active || p.fadingOut || this._carried(K_SHAPE, p)) continue;
      const r = (p.size * p.growth / 2) * getCollisionFactor(p.baseSides);
      if (this._covers(p.position.x, p.position.y, r)) { const t = h._adminExitOf(p.position.x, p.position.y, r); h._adminPushShape(p, t.x, t.y); }
    }
    this.poW = null; this.poR = null;
  }
  private _covers(x: number, y: number, r: number): boolean {
    const w = this.poW;
    if (w !== null) {
      if (!w.active) return false;
      const dx = Math.max(0, Math.abs(x - w.x) - w.halfW), dy = Math.max(0, Math.abs(y - w.y) - w.halfH);
      return dx * dx + dy * dy < r * r;
    }
    const k = this.poR!;
    if (!k.active) return false;
    const dx = x - k.x, dy = y - k.y, t = k.size + r;
    return dx * dx + dy * dy < t * t;
  }
  private _carried(kind: number, ref: unknown): boolean {
    if (this.wKind === kind && this.wRef === ref) return true;
    for (let i = 0; i < this.dN; i++) if (this.dKind[i] === kind && this.dRef[i] === ref) return true;
    return false;
  }

  heldByDrag(kind: number, ref: unknown): boolean {
    if (this.dN === 0) return false;
    for (let i = 0; i < this.dN; i++) if (this.dKind[i] === kind && (kind === K_PLAYER || this.dRef[i] === ref)) return true;
    return false;
  }
  wallTeamOf(kind: number, ref: unknown): number { return this._teamOf(kind, ref); }
  wallPaint(kind: number, ref: unknown, slot: number): void {
    if (kind === K_PLAYER ? this.pSlot === slot : kind === K_ENEMY ? this.botSlots.get((ref as EnemyTank).id) === slot
      : kind === K_SHAPE ? (TEAM_COLOUR.ON !== 0 && (ref as FloatingPolygon).look !== null ? (ref as FloatingPolygon)._wornSlot === slot : (ref as FloatingPolygon).colorMap === slot && !(ref as FloatingPolygon).isAnimatedColor) : true) return;
    this._paint(kind, ref, slot);
  }
  wallJoin(kind: number, ref: unknown, team: number): void {
    if (kind === K_PLAYER) {
      if (team === this.myTeam()) return;
      this._joinTeam(team);
    } else if (kind === K_ENEMY) {
      const e = ref as EnemyTank;
      if (this._teamOf(K_ENEMY, e) === team) return;
      this._giveTeam(e, team);
      this._applySides(); this.host._adminSidesChanged();
      this._colorsChanged();
    } else if (kind === K_SHAPE) {
      const p = ref as FloatingPolygon;
      if (team !== this.myTeam() || this.shapeTeams.get(p) === p.id) return;
      this.shapeTeams.set(p, p.id); this.shapeYs++;
      this._shapeHanded(p);
      this.shapeTeamOn = true;
      this._colorsChanged();
    }
  }
  wallIsMine(w: WallEntity): boolean {
    const t = w.wteam !== undefined ? w.wteam : TEAM_WALLS;
    return t === this.myTeam();
  }
  private _dropOut(kind: number, ref: unknown): void {
    if (!WALL_TYPES_4S.ON || !WALL_TYPES_4S.DRAG_INTO) return;
    const h = this.host;
    if (kind === K_PLAYER) {
      if (h.tankDying) return;
      const r = h._adminWallRadius(null);
      if (h._adminInWall(h.tankPos.x, h.tankPos.y, r, K_PLAYER, null)) { const t = h._adminExitOf(h.tankPos.x, h.tankPos.y, r); h._adminPushPlayer(t.x, t.y); }
    } else if (kind === K_ENEMY) {
      const e = ref as EnemyTank;
      if (!e.active || e.isDying) return;
      const r = h._adminWallRadius(e);
      if (h._adminInWall(e.position.x, e.position.y, r, K_ENEMY, e)) { const t = h._adminExitOf(e.position.x, e.position.y, r); h._adminPushBot(e, t.x, t.y); }
    } else if (kind === K_SHAPE) {
      const p = ref as FloatingPolygon;
      if (!p.active || p.fadingOut) return;
      const r = (p.size * p.growth / 2) * getCollisionFactor(p.baseSides);
      if (h._adminInWall(p.position.x, p.position.y, r, K_SHAPE, p)) { const t = h._adminExitOf(p.position.x, p.position.y, r); h._adminPushShape(p, t.x, t.y); }
    }
  }

  private _heal(): void {
    const h = this.host;
    const n = this._under(h.pointerWorldX(), h.pointerWorldY(), true);
    let healed = 0;
    for (let i = 0; i < n; i++) {
      const k = this.selKind[i], r = this.selRef[i];
      if (k === K_PLAYER) { this._healSelf(); healed++; }
      else if (k === K_ENEMY) { const e = r as EnemyTank; e.currentHealth = e.maxHealth * getEnemyStatMultiplier(e, 'maxHealth'); e.currentShield = e.maxShield * getEnemyStatMultiplier(e, 'shieldCapacity'); healed++; }
      else if (k === K_SHAPE) { const p = r as FloatingPolygon; p.hp = p.maxHp; p.shield = p.maxShield; healed++; }
      else if (k === K_BULLET) { const b = r as Bullet; b.health = b.maxHealth; healed++; }
    }
    if (n === 0) {
      if (h.tankDying) return;
      this._healSelf();
      h.pushMessage(MSG_HEALED_SELF);
      return;
    }
    h.pushMessage(healed === 1 ? 'Healed 1 entity!' : 'Healed ' + healed + ' entities!');
  }
  private _healSelf(): void {
    const h = this.host, s = h.state;
    if (h.tankDying) return;
    s.tankCurrentHealth = s.tankHP * h.getStatMultiplier('maxHealth');
    s.tankCurrentShield = s.tankShieldCapacity * h.getStatMultiplier('shieldCapacity');
  }

  private _getData(): void {
    const h = this.host;
    const x = h.pointerWorldX(), y = h.pointerWorldY();
    const n = this._under(x, y, true);
    for (let i = 0; i < n; i++) h.pushMessage(this._dataOf(this.selKind[i], this.selRef[i]));
    const pts = h.mapState ? h.mapState.portals : null;
    if (pts) for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if ((p.timed && !p._timedActive) || p._dying) continue;
      const dx = p.x - x, dy = p.y - y, r = p.tileSize * 0.5;
      if (dx * dx + dy * dy < r * r) h.pushMessage(this._portalData(p));
    }
  }

  private _portalData(p: PortalEntity): string {
    const worm = p.kind === PORTAL_KIND_WORMHOLE;
    let to = 'nowhere';
    if (worm) { if (p._exit !== null) to = p._exit.areaId !== p.areaId ? 'its exit in ' + this._areaName(p._exit.areaId) : 'its exit in this area'; }
    else if (p.destinationAreaId) to = this._areaName(p.destinationAreaId);
    return 'Selected a ' + (worm ? 'Wormhole' : 'Black Hole') + ' (ID #' + this._idOf(p) + ').\n- Sends to: ' + to + ';\n- Reach: '
      + Math.round(p.reach) + ';\n- Level needed: ' + (p.requireLevel > 0 ? p.requireLevel : 'none') + ';';
  }
  private _areaName(id: string): string {
    const areas = this.host.state.multiAreaConfig ? this.host.state.multiAreaConfig.areas : null;
    if (areas) for (let i = 0; i < areas.length; i++) if (areas[i].id === id) return areas[i].name || id;
    return id || 'this map';
  }

  private _dataOf(kind: number, ref: unknown): string {
    const h = this.host;
    let who = '', what = '', score = 0, build = '0/0/0/0/0/0/0/0/0/0';
    if (kind === K_PLAYER) {
      who = h.getPlayerDisplayName();
      what = h.playerTankDisplayName() ?? h.resolveTankDisplayName(null);
      score = h.state.currentXp;
      build = buildOf(h.state.upgrades);
    } else if (kind === K_ENEMY) {
      const e = ref as EnemyTank;
      who = e.displayName || '';
      what = e.currentTankName ? h.resolveTankDisplayName(e.currentTankName) : 'Tank';
      score = e.currentXp;
      build = buildOf(e.upgrades);
    } else if (kind === K_SHAPE) {
      const p = ref as FloatingPolygon;
      what = getShapeDef(p.shapeId)?.displayName.replace(' (Scaled)', '') ?? 'Polygon';
      score = p.xpValue;
    } else if (kind === K_BULLET) {
      what = 'Bullet';
    } else if (kind === K_WALL) {
      what = WALL_NAMES[this._wallTypeOf(ref as WallEntity)];
    } else if (kind === K_ROCK) {
      what = (ref as RockEntity).shape === -7 ? 'Gravel' : 'Rock';
    }
    const name = who !== '' ? who + "'s " + what : 'an unnamed ' + what;
    return 'Selected ' + name + ' (ID #' + this._idOf(kind === K_PLAYER ? PLAYER_KEY : ref as object) + ').\n- Score: ' + Math.floor(score) + ';\n- Build: ' + build + ';';
  }
  private _idOf(o: object): number {
    let id = this.ids.get(o);
    if (id === undefined) { id = this.nextId++; this.ids.set(o, id); }
    return id;
  }

  private _kick(): void {
    const h = this.host;
    const n = this._under(h.pointerWorldX(), h.pointerWorldY(), false);
    for (let i = 0; i < n; i++) {
      if (this.selKind[i] !== K_ENEMY) continue;
      const e = this.selRef[i] as EnemyTank;
      const name = e.displayName || 'bot';
      h._adminKickEnemy(e);
      h.pushMessage('Kicked ' + name + '.');
      return;
    }
  }

  private _blast(x: number, y: number): void {
    const h = this.host;
    const push = (kind: number, ref: unknown, px: number, py: number) => {
      const dx = px - x, dy = py - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= BLAST_R) return;
      const f = BLAST_V * (1 - d / BLAST_R);
      const ux = d > 1e-9 ? dx / d : 1, uy = d > 1e-9 ? dy / d : 0;
      if (kind === K_PLAYER) { h.knockbackVelocity.x += ux * f; h.knockbackVelocity.y += uy * f; }
      else if (kind === K_ENEMY) { const e = ref as EnemyTank; e.knockbackVelocity.x += ux * f; e.knockbackVelocity.y += uy * f; }
      else if (kind === K_SHAPE) { const p = ref as FloatingPolygon; p.velocity.x += ux * f; p.velocity.y += uy * f; }
      else if (kind === K_BULLET) { const b = ref as Bullet; b.velocity.x += ux * f; b.velocity.y += uy * f; }
    };
    if (!h.tankDying) push(K_PLAYER, null, h.tankPos.x, h.tankPos.y);
    const en = h.state.enemyTanks;
    for (let i = 0; i < en.length; i++) { const e = en[i]; if (e.active && !e.isDying) push(K_ENEMY, e, e.position.x, e.position.y); }
    const ps = h.floatingPolygons;
    for (let i = 0; i < ps.length; i++) { const p = ps[i]; if (p.active && !p.fadingOut) push(K_SHAPE, p, p.position.x, p.position.y); }
    const bs = h.bullets;
    for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (b.active && !b.isFading) push(K_BULLET, b, b.position.x, b.position.y); }
  }

  private _polygon(): void {
    const h = this.host;
    if (h.floatingPolygons.length >= SHAPE_LIMIT) return;
    const def = getShapeDef(idOfDesign(this.lastDesign));
    if (!def) return;
    h.createShapeAtPosition(def, h.pointerWorldX(), h.pointerWorldY(), -1);
  }

  private _startWhirl(): void {
    const h = this.host;
    this._endWhirl();
    if (this._nearest(h.pointerWorldX(), h.pointerWorldY(), false)) {
      this.wKind = this._nKind; this.wRef = this._nRef; this.wKey = keyOf(this._nKind, this._nRef);
      this._takeHold(this.wKind, this.wRef);
      this._carryShow(this.wKind, this.wRef, this.wKey, true);
    }
    this._refreshLive();
  }
  private _carryShow(k: number, r: unknown, key: unknown, on: boolean): void {
    if (SMALL_FIX.R664 === 0 || ((on || SMALL_FIX.CC010 === 0) && !valid(this.host, k, r, key))) return;
    const o = (k === K_PLAYER ? this.host : r) as CarryMarked, mk = k === K_PLAYER ? CARRY_PLAYER_KEY : key;
    if (!o) return;
    const canHide = k === K_PLAYER ? this.host.state.invisibleEnabled === true
      : k === K_ENEMY ? (r as EnemyTank).invisEnabled === true
      : k === K_SHAPE ? (r as FloatingPolygon).baseOpacity < 1
      : k === K_BULLET ? ((r as Bullet)._invisEnabled === true || (r as Bullet)._invisAlways === true)
      : k === K_PORTAL ? (r as PortalEntity).invisible === true : false;
    if (on ? !canHide : o._carryKey !== mk) return;
    carryMark(o, mk, on, this.host.gameNow());
  }
  private _takeHold(k: number, r: unknown): void {
    if (k === K_WALL) this._ungrid(r as WallEntity);
    else if (k === K_ROCK) this._unfixRock(r as RockEntity);
    else if (k === K_PORTAL) this._notePortal(r as PortalEntity);
  }
  private _endWhirl(): void {
    if (this.wKind !== K_NONE) this._carryShow(this.wKind, this.wRef, this.wKey, false);
    this.wKind = K_NONE; this.wRef = null; this.wKey = null; this._refreshLive();
  }

  _startDrag(by: string, say: boolean): void {
    const h = this.host;
    this._endDrag();
    const x = h.pointerWorldX(), y = h.pointerWorldY();
    let m = 0;
    if (this._topAt(x, y)) {
      const k = this._nKind, r = this._nRef;
      this._takeHold(k, r);
      const p = posOf(h, k, r);
      this.dKind[0] = k; this.dRef[0] = r; this.dKey[0] = keyOf(k, r);
      this._carryShow(k, r, this.dKey[0], true);
      this.dOffX[0] = p.x - x; this.dOffY[0] = p.y - y;
      m = 1;
    }
    this.dN = m;
    this.dByKey = m > 0 ? by : '';
    if (m === 0 && say) h.pushMessage(MSG_NO_PICK);
    this._refreshLive();
  }
  _endDrag(): void {
    for (let i = 0; i < this.dN; i++) this._dropOut(this.dKind[i], this.dRef[i]);
    for (let i = 0; i < this.dN; i++) { this._carryShow(this.dKind[i], this.dRef[i], this.dKey[i], false); this.dRef[i] = null; this.dKey[i] = null; }
    this.dN = 0; this.dByKey = '';
    this._refreshLive();
  }

  private _startZ(): void {
    const h = this.host;
    this._endZ();
    const x = h.pointerWorldX(), y = h.pointerWorldY();
    if (!this._nearest(x, y, false)) return;
    if (!this._changeable(this._nKind, this._nRef)) {
      h.pushMessage(MSG_CANNOT_CHANGE);
      if (!this._nearest(x, y, true)) return;
    } else this._dotOn(0, x, y);
    this.zOn = true; this.zX = x; this.zY = y; this.zTick = this._tickNow();
    this.zKind = this._nKind; this.zRef = this._nRef; this.zKey = keyOf(this._nKind, this._nRef);
    if (this.zKind === K_WALL) {
      this.zW = this._nRef as WallEntity; this.zR = null;
      this.zWallBase = this.zWallNow = this._wallTypeOf(this.zW);
    } else if (this.zKind === K_ROCK) {
      this.zR = this._nRef as RockEntity; this.zW = null;
      this.zWallBase = this.zWallNow = ROCK_TYPE;
    } else this.zBase = this.zNow = designOf(getShapeDef((this._nRef as FloatingPolygon).shapeId));
    this._refreshLive();
  }
  private _endZ(): void {
    this.zOn = false; this.zKind = K_NONE; this.zRef = null; this.zKey = null; this.zW = null; this.zR = null;
    this._dotOff(0); this._refreshLive();
  }

  private _dotOn(i: number, x: number, y: number): void { this.dotX[i] = x; this.dotY[i] = y; this.dotUntil[i] = Infinity; }
  private _dotOff(i: number): void { if (this.dotUntil[i] === Infinity) this.dotUntil[i] = this.host.gameNow(); }
  dotC(i: number, now: number): number {
    const u = this.dotUntil[i];
    if (now <= u) return 1;
    return u < 0 ? 0 : deathC((now - u) / 1000);
  }

  private _changeable(kind: number, ref: unknown): boolean {
    if (kind === K_SHAPE) return designOf(getShapeDef((ref as FloatingPolygon).shapeId)) >= 0;
    return kind === K_WALL || kind === K_ROCK;
  }

  private _designAt(px: number, py: number): number {
    const dx = px - this.zX, dy = this.zY - py;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r < MENU_DEAD) return this.zBase;
    const ang = _mod(Math.atan2(dy, dx) * 180 / Math.PI, 360);
    const arm = Math.round(ang / 60) % 6;
    if (Math.abs(ang - Math.round(ang / 60) * 60) > MENU_ARM) return this.zBase;
    const k = Math.ceil(r / MENU_STEP);
    let t = this.zBase % 5, s = ((this.zBase / 5) | 0) % SH_SIZES, kind = (this.zBase / (5 * SH_SIZES)) | 0;
    switch (arm) {
      case 0: s = _mod(s + k, SH_SIZES); break;
      case 1: t = _mod(t + k, 5); break;
      case 2: kind = _mod(kind - k, 6); break;
      case 3: s = _mod(s - k, SH_SIZES); break;
      case 4: t = _mod(t - k, 5); break;
      case 5: kind = _mod(kind + k, 6); break;
    }
    return t + 5 * s + 5 * SH_SIZES * kind;
  }

  private _reshape(p: FloatingPolygon, d: number): FloatingPolygon | null {
    const h = this.host;
    const def = getShapeDef(idOfDesign(d));
    if (!def) return null;
    const x = p.position.x, y = p.position.y, vx = p.velocity.x, vy = p.velocity.y, rot = p.rotation, area = p.areaIdx;
    const was = p.size * p.growth;
    p.active = false; p.opacity = 0; p._ruleOpacity = 0; p.fadingOut = true; p.hpBarOpacity = 0; p.displayHp = 0; p.displayShield = 0;
    const n0 = h.floatingPolygons.length;
    h.createShapeAtPosition(def, x, y, area);
    if (h.floatingPolygons.length === n0) return null;
    const q = h.floatingPolygons[h.floatingPolygons.length - 1];
    q.velocity.x = vx; q.velocity.y = vy; q.rotation = rot;
    q.impactVelocity.x = p.impactVelocity.x; q.impactVelocity.y = p.impactVelocity.y;
    q._knShareX = p._knShareX; q._knShareY = p._knShareY;
    q.angularVelocity = p.angularVelocity; q.spinImpulse = p.spinImpulse; q.spinSign = p.spinSign;
    q.moveAngle = p.moveAngle; q.moveSpeed = p.moveSpeed; q.moveRadius = p.moveRadius;
    q._admPush = p._admPush; q._admPushX = p._admPushX; q._admPushY = p._admPushY;
    q.fadingIn = false; q.opacity = q.baseOpacity * 255;
    q.growth = q.size > 0 && was > 0 ? was / q.size : 1;
    if (q.growth !== 1) this._slideShape(q);
    h._adminTakesPlace(p, q);
    return q;
  }

  private _slideShape(q: FloatingPolygon): void {
    let i = 0;
    while (i < this.sN && this.sRef[i] !== q) i++;
    if (i === this.sN) {
      if (this.sN === SLIDE_MAX) { this._slideDone(0); i = this.sN; }
      this.sN++;
    }
    this.sRef[i] = q; this.sKey[i] = q.id;
    this._refreshLive();
  }
  private _slideShapes(): void {
    for (let i = this.sN - 1; i >= 0; i--) {
      const q = this.sRef[i]!;
      if (!q.active || q.fadingOut || q.id !== this.sKey[i] || !(q.size > 0)) { this._slideDone(i); continue; }
      const d = slideSize(q.size * q.growth, q.size, STEP_SEC, SIZE_SLIDE_MIN_PX_PER_SEC);
      if (d === q.size) { q.growth = 1; this._slideDone(i); } else q.growth = d / q.size;
    }
    if (this.sN === 0) this._refreshLive();
  }
  private _slideDone(i: number): void {
    const last = this.sN - 1;
    this.sRef[i] = this.sRef[last]; this.sKey[i] = this.sKey[last];
    this.sRef[last] = null; this.sKey[last] = null;
    this.sN = last;
  }

  myTeam(): number {
    if (this.pTeam === null) {
      const h = this.host, gm = h.state.gameModeConfig;
      this.pTeam = this._teamMode() ? this._arrasOfEngine(gm.playerTeam || 1)
        : isGroupsMode(gm.mode) && h.playerGroupId !== 0 ? -GROUP_TEAM_BASE - h.playerGroupId : this._idOf(PLAYER_KEY);
    }
    return this.pTeam;
  }
  private _teamMode(): boolean {
    const gm = this.host.state.gameModeConfig, m = gm.mode;
    return teamColourMode(m) || sandboxTeamsOn(gm);
  }
  private _arrasOfEngine(n: number): number {
    if (ALL_MODES.ON !== 0 ? n === 5 : n === 3 && this.host.state.gameModeConfig.mode === 'old-dreadnoughts') return TEAM_DREADS;
    return n >= 1 && n <= 4 ? -(TEAM_NAMES[1] === 'Green' ? ARRAS_TEAM_OF_GREEN : ARRAS_TEAM_OF)[n - 1] : -n;
  }
  private _engineOfArras(t: number): number {
    if (t > -1 || t < -4) return 0;
    const n = (TEAM_NAMES[1] === 'Green' ? ARRAS_TEAM_OF_GREEN : ARRAS_TEAM_OF)[-t - 1];
    return ALL_MODES.ON === 0 && n === 3 && this.host.state.gameModeConfig.mode === 'old-dreadnoughts' ? 0 : n;
  }
  private _teamOf(kind: number, ref: unknown): number {
    if (kind === K_PLAYER) return this.myTeam();
    if (kind === K_SHAPE) { const p = ref as FloatingPolygon; return this.shapeTeams.get(p) === p.id ? this.myTeam() : TEAM_SHAPES; }
    if (kind === K_WALL) { const t = (ref as WallEntity).wteam; return t !== undefined ? t : TEAM_WALLS; }
    if (kind === K_ROCK) return TEAM_WALLS;
    if (kind === K_ENEMY) {
      const e = ref as EnemyTank;
      const r = this._sideOf(e);
      if (r !== null) return r.given;
      return this._nativeTeam(e);
    }
    return 0;
  }
  private _nativeTeam(e: EnemyTank): number {
    const b = e.aiBehavior;
    if (b === 'Team1' || b === 'Team2' || b === 'Team3' || b === 'Team4' || b === 'Team5') return this._arrasOfEngine(b.charCodeAt(4) - 48);
    if (e.groupId !== 0 && e.groupId < PANEL_GROUP_BASE && isGroupsMode(this.host.state.gameModeConfig.mode)) return -GROUP_TEAM_BASE - e.groupId;
    if (b === 'Neutral') return TEAM_NEUTRAL;
    return this._idOf(e);
  }
  private _sideOf(e: EnemyTank): { e: EnemyTank; id: string; given: number; team: TeamId; beh: AIBehavior; group: number } | null {
    for (let i = 0; i < this.sides.length; i++) { const r = this.sides[i]; if (r.e === e && r.id === e.id) return r; }
    return null;
  }

  private _giveTeam(e: EnemyTank, t: number): void {
    if (TEAM_COLOUR.ON !== 0) this.botSlots.delete(e.id);
    const r = this._sideOf(e);
    if (r !== null) { r.given = t; return; }
    this.sides.push({ e, id: e.id, given: t, team: e.team, beh: e.aiBehavior, group: e.groupId });
  }

  private _groupOfTeam(t: number): number {
    if (isGroupsMode(this.host.state.gameModeConfig.mode) && t < -GROUP_TEAM_BASE && t > -GROUP_TEAM_BASE - PANEL_GROUP_BASE) return -GROUP_TEAM_BASE - t;
    let g = this.panelGroups.get(t);
    if (g === undefined) { g = PANEL_GROUP_BASE + this.panelGroups.size + 1; this.panelGroups.set(t, g); }
    return g;
  }

  private _applySides(): void {
    const h = this.host, s = h.state, gm = s.gameModeConfig, mode = gm.mode;
    const P = this.myTeam();
    const teamMode = this._teamMode(), groups = isGroupsMode(mode);
    const realTeam = (t: number) => this._engineOfArras(t) !== 0;
    const mySide = this._engineOfArras(P);
    if (teamMode && mySide !== 0 && gm.playerTeam !== mySide) {
      if (this.pSideWas === null) this.pSideWas = gm.playerTeam;
      s.gameModeConfig = { ...gm, playerTeam: mySide };
    }
    const groupWas = this.pGroupWas !== null ? this.pGroupWas : h.playerGroupId;
    const myGroup = groups ? this._groupOfTeam(P) : teamMode && realTeam(P) ? groupWas : this._groupOfTeam(P);
    if (myGroup !== h.playerGroupId) {
      if (this.pGroupWas === null) this.pGroupWas = h.playerGroupId;
      const from = h.playerGroupId;
      h.playerGroupId = myGroup;
      h._adminPlayerGroupMoved(from, myGroup);
    }
    this.botMine.clear();
    let panelGroupUsed = h.playerGroupId >= PANEL_GROUP_BASE;
    for (let i = this.sides.length - 1; i >= 0; i--) {
      const r = this.sides[i], e = r.e;
      if (!e.active || e.isDying || e.id !== r.id) { this.sides.splice(i, 1); continue; }
      e.team = r.team; e.aiBehavior = r.beh; e.groupId = r.group;
      const g = r.given;
      if (teamMode && realTeam(g)) {
        const n = this._engineOfArras(g);
        e.team = (n === 1 ? 'team1' : n === 2 ? 'team2' : n === 3 ? 'team3' : 'team4') as TeamId;
        e.aiBehavior = (n === 1 ? 'Team1' : n === 2 ? 'Team2' : n === 3 ? 'Team3' : 'Team4') as AIBehavior;
      } else {
        e.groupId = this._groupOfTeam(g);
        if (e.groupId >= PANEL_GROUP_BASE) panelGroupUsed = true;
        if (g === P && !groups && (r.beh === 'Enemy' || r.beh === 'Neutral')) { e.aiBehavior = 'Friendly'; e.team = 'player' as TeamId; }
      }
      if (g === P) this.botMine.add(e.id);
    }
    this.groupsOn = !groups && panelGroupUsed;
    this.sidesOn = this.sides.length > 0;
  }

  onBotDeath(e: EnemyTank): void {
    for (let i = this.sides.length - 1; i >= 0; i--) {
      const r = this.sides[i];
      if (r.e !== e) continue;
      if (r.id === e.id) { e.team = r.team; e.aiBehavior = r.beh; e.groupId = r.group; }
      this.sides.splice(i, 1);
    }
    this.sidesOn = this.sides.length > 0;
  }

  noteSideWas(was: number): void {
    if (this.pSideWas === null) this.pSideWas = was;
  }

  private _restoreSides(): void {
    const h = this.host;
    for (let i = 0; i < this.sides.length; i++) {
      const r = this.sides[i], e = r.e;
      if (e.active && e.id === r.id) { e.team = r.team; e.aiBehavior = r.beh; e.groupId = r.group; }
    }
    this.sides.length = 0;
    this.sidesOn = false;
    if (this.pGroupWas !== null) {
      const from = h.playerGroupId;
      h.playerGroupId = this.pGroupWas;
      this.pGroupWas = null;
      h._adminPlayerGroupMoved(from, h.playerGroupId);
    }
    if (this.pSideWas !== null) { h.state.gameModeConfig = { ...h.state.gameModeConfig, playerTeam: this.pSideWas }; this.pSideWas = null; }
    this.panelGroups.clear();
    this.groupsOn = false;
  }
  teamEntered(e: EnemyTank | null): void {
    if (TEAM_COLOUR.ON === 0) return;
    if (e === null && SMALL_FIX.G667 !== 0 && this.pTeam !== null) { this.pTeam = null; this.shapeTeamOn = this.shapeYs > 0; }
    if (e !== null && SMALL_FIX.G666 !== 0) {
      let changed = this.botMine.delete(e.id);
      const r = this._sideOf(e);
      if (r !== null) { this.sides.splice(this.sides.indexOf(r), 1); this.sidesOn = this.sides.length > 0; changed = true; }
      if (changed) this._colorsChanged();
    }
    if (e === null) { if (this.pSlot >= 0 || this.teamSlot >= 0) { this.pSlot = -1; this.teamSlot = -1; this._colorsChanged(); } }
    else if (this.botSlots.delete(e.id)) this._colorsChanged();
  }
  private _shapeHanded(p: FloatingPolygon): void {
    if (TEAM_COLOUR.ON !== 0 && p.look !== null && p.look.team) p._wornSlot = -2;
  }
  shapeWearsMine(p: FloatingPolygon): boolean {
    return this.shapeOnMyTeam(p) && this.shapePainted.get(p) !== p.id;
  }
  shapeOnMyTeam(p: FloatingPolygon): boolean {
    if (this.shapeYs > 0 && this.shapeTeams.get(p) === p.id) return true;
    return this.pTeam === TEAM_SHAPES;
  }
  private _setMyTeam(t: number): void {
    const was = this.myTeam();
    if (t === was) { this.host.pushMessage(MSG_TEAM_SAME); return; }
    this._joinTeam(t);
    this.host.pushMessage('Changed to team ' + t);
  }
  private _joinTeam(t: number): void {
    this.pTeam = t;
    const slot = this._teamSlotOf(t);
    if (slot >= 0) { this.teamSlot = slot; if (TEAM_COLOUR.ON !== 0) this.pSlot = -1; }
    this.shapeTeamOn = t === TEAM_SHAPES || this.shapeYs > 0;
    this._applySides();
    this.host._adminSidesChanged();
    this._colorsChanged();
  }

  onTakeOver(e: EnemyTank): void {
    const r = this._sideOf(e);
    const slot = this.botSlots.get(e.id);
    if (this.pTeam === null && r === null && slot === undefined && this.pSlot < 0 && this.teamSlot < 0
      && this.sides.length === 0 && this.pGroupWas === null) return;
    const given = r !== null ? r.given : null;
    if (r !== null) this.sides.splice(this.sides.indexOf(r), 1);
    this.botSlots.delete(e.id); this.botMine.delete(e.id);
    this.pTeam = given;
    this.teamSlot = given !== null ? this._teamSlotOf(given) : -1;
    this.pSlot = slot !== undefined ? slot : -1;
    this.shapeTeamOn = this.pTeam === TEAM_SHAPES || this.shapeYs > 0;
    this._applySides();
    this._colorsChanged();
  }

  private _teamSlotOf(t: number): number {
    if (t <= -1 && t >= -4) return TEAM_SLOTS[-t - 1];
    return t === TEAM_NEUTRAL ? NEUTRAL_SLOT : -1;
  }

  private _team(): void {
    const h = this.host;
    const n = this._under(h.pointerWorldX(), h.pointerWorldY(), true);
    let t: number | null = null, tk = K_NONE, tr: unknown = null;
    for (let i = 0; i < n; i++) if (this.selKind[i] !== K_BULLET) { tk = this.selKind[i]; tr = this.selRef[i]; t = this._teamOf(tk, tr); }
    if (t === null) { const c = this.myTeam(); t = (c <= -1 && c >= -4) ? c - 1 : -1; }
    if (tk === K_ENEMY && t !== this.myTeam() && this._sideOf(tr as EnemyTank) === null && t === this._nativeTeam(tr as EnemyTank)
      && t > 0) this._giveTeam(tr as EnemyTank, t);
    this._setMyTeam(t);
  }

  private _invite(): void {
    const h = this.host;
    const n = this._under(h.pointerWorldX(), h.pointerWorldY(), false);
    const t = this.myTeam();
    let bots = false;
    for (let i = 0; i < n; i++) {
      const k = this.selKind[i], r = this.selRef[i];
      if (k === K_SHAPE) { const p = r as FloatingPolygon; if (this.shapeTeams.get(p) !== p.id) { this.shapeTeams.set(p, p.id); this.shapeYs++; } this._shapeHanded(p); this.shapePainted.delete(p); }
      else if (k === K_ENEMY) { this._giveTeam(r as EnemyTank, t); bots = true; }
      else continue;
      h.pushMessage('Changed entity to team ' + t);
    }
    if (bots) { this._applySides(); this.host._adminSidesChanged(); }
    this.shapeTeamOn = this.pTeam === TEAM_SHAPES || this.shapeYs > 0;
    this._colorsChanged();
  }

  private _dropGoneBotColors(): void {
    if (this.botSlots.size === 0 && this.botMine.size === 0) return;
    const h = this.host, live = this._liveIds;
    live.clear();
    const et = h.state.enemyTanks;
    for (let i = 0; i < et.length; i++) if (et[i].active) live.add(et[i].id);
    const bs = h.bullets;
    for (let i = 0; i < bs.length; i++) if (bs[i].active) live.add(bs[i].ownerId);
    for (const id of this.botSlots.keys()) if (!live.has(id)) this.botSlots.delete(id);
    for (const id of this.botMine) if (!live.has(id)) this.botMine.delete(id);
    live.clear();
  }

  private _colorsChanged(): void {
    this.colorsOn = this.pSlot >= 0 || this.teamSlot >= 0 || this.botSlots.size > 0 || this.botMine.size > 0 || this.shapeTeamOn;
    this._boardChanged();
  }
  playerSlot(): number { return this.pSlot >= 0 ? this.pSlot : this.teamSlot; }
  botSlot(id: string): number {
    const s = this.botSlots.get(id);
    if (s !== undefined) return s;
    return this.botMine.has(id) ? -2 : -1;
  }

  private _startColor(): void {
    const h = this.host;
    this._endColor();
    const x = h.pointerWorldX(), y = h.pointerWorldY();
    if (!this._nearestColorable(x, y)) return;
    this._dotOn(1, x, y);
    this.cOn = true; this.cX = x; this.cY = y;
    this.cKind = this._nKind; this.cRef = this._nRef; this.cKey = keyOf(this._nKind, this._nRef); this.cNow = -1;
    if (this.lastColor >= 0) { this.cNow = this.lastColor; this._paint(this.cKind, this.cRef, this.lastColor); }
    this._refreshLive();
  }
  private _endColor(): void { this.cOn = false; this.cKind = K_NONE; this.cRef = null; this.cKey = null; this._dotOff(1); this._refreshLive(); }

  private _paint(kind: number, ref: unknown, slot: number): void {
    if (kind === K_PLAYER) this.pSlot = slot;
    else if (kind === K_ENEMY) { if (SMALL_FIX.GH307 !== 0) this._dropGoneBotColors(); this.botSlots.set((ref as EnemyTank).id, slot); }
    else if (kind === K_SHAPE) {
      const p = ref as FloatingPolygon;
      if (TEAM_COLOUR.ON !== 0 && p.look !== null) p._wornSlot = slot;
      else {
        p.colorMap = slot; p.isAnimatedColor = false;
        if (SMALL_FIX.G656 !== 0 && this.shapeOnMyTeam(p)) this.shapePainted.set(p, p.id);
      }
    }
    else if (kind === K_WALL || kind === K_ROCK) {
      if (kind === K_WALL && WALL_TYPES_4S.ON && this.host.state.isTestMode && this.wallIsMine(ref as WallEntity)) return;
      this.wallSlots.set(ref as object, slot); this.wallSlotsOn = true;
      if (kind === K_WALL && SMALL_FIX.G664 !== 0) this._noteWallSlot(ref as WallEntity);
      if (kind === K_WALL) (ref as WallEntity).wslot = slot;
      if (SMALL_FIX.R752B !== 0) this.mapVer++;
    }
    this._colorsChanged();
  }

  slotOf(o: object): number {
    if (!this.wallSlotsOn) return -1;
    const s = this.wallSlots.get(o);
    return s === undefined ? -1 : s;
  }

  private _nearestColorable(x: number, y: number): boolean {
    const h = this.host;
    let best = Infinity;
    this._nKind = K_NONE; this._nRef = null;
    const take = (k: number, r: unknown, px: number, py: number) => { const dx = px - x, dy = py - y, d = dx * dx + dy * dy; if (d < best) { best = d; this._nKind = k; this._nRef = r; } };
    if (!h.tankDying) take(K_PLAYER, null, h.tankPos.x, h.tankPos.y);
    const en = h.state.enemyTanks;
    for (let i = 0; i < en.length; i++) { const e = en[i]; if (e.active && !e.isDying) take(K_ENEMY, e, e.position.x, e.position.y); }
    const ps = h.floatingPolygons;
    for (let i = 0; i < ps.length; i++) { const p = ps[i]; if (p.active && !p.fadingOut && (!p.look || (TEAM_COLOUR.ON !== 0 && p.look.team))) take(K_SHAPE, p, p.position.x, p.position.y); }
    const ms = h.mapState;
    if (SMALL_FIX.R752 !== 0 && ms) {
      const ws = ms.walls;
      for (let i = 0; i < ws.length; i++) { const w = ws[i]; if (w.active) take(K_WALL, w, w.x, w.y); }
      const rs = ms.rocks;
      for (let i = 0; i < rs.length; i++) { const r = rs[i]; if (r.active) take(K_ROCK, r, r.x, r.y); }
    }
    return this._nKind !== K_NONE;
  }

  private _wallLook(t: number): WallLook | null {
    if (t <= 0 || t >= WALL_IDS.length) return null;
    const had = this.wallLooks[t];
    if (had !== undefined) return had;
    let found: WallLook | null = null;
    const lib = this.host.state.otherLibrary || [];
    for (let i = 0; i < lib.length; i++) {
      const fd = lib[i].fileData as { type: string; data: { otherId?: string; body?: OtherPart } };
      if (fd && fd.type === 'Other' && fd.data && fd.data.otherId === WALL_IDS[t] && fd.data.body) {
        const look = makeShapeLook({ body: fd.data.body });
        const b = fd.data.body;
        const half = b.kind === 'polygon' && b.sides === 4 ? b.radius * Math.SQRT1_2 : b.radius;
        if (look && half > 0) found = { look, perHalf: 1 / half, type: t, bodyMap: typeof b.colorMap === 'number' ? b.colorMap : -1 };
        break;
      }
    }
    this.wallLooks[t] = found;
    return found;
  }

  private _gridCorner(x: number, y: number): void {
    this._cornerAt(x, y);
    this.xAx = this.gAx; this.xAy = this.gAy;
  }
  private _cornerAt(x: number, y: number): void {
    const h = this.host;
    const a = h.areaStates.length > 0 ? h._areaIndexAtWorld(x, y) : -1;
    if (a >= 0 && a < h.areaBounds.length) { this.gAx = h.areaBounds[a].minX; this.gAy = h.areaBounds[a].minY; return; }
    const ms = h.mapState;
    this.gAx = ms ? -ms.mapHalf : 0; this.gAy = ms ? -(ms.mapHalfY ?? ms.mapHalf) : 0;
  }

  private _statesAt(x: number, y: number, out: MapState[]): number {
    const h = this.host;
    let n = 0;
    if (h.mapState) out[n++] = h.mapState;
    const a = h.areaStates.length > 0 ? h._areaIndexAtWorld(x, y) : -1;
    if (a >= 0 && h.areaStates[a] && h.areaStates[a] !== h.mapState) out[n++] = h.areaStates[a];
    return n;
  }
  private _st: MapState[] = [];

  private _touch(ms: MapState): void {
    this._noteChanged(ms);
    for (let i = 0; i < this.wallStates.length; i++) if (this.wallStates[i].ms === ms) return;
    this.wallStates.push({ ms, len: ms.walls.length, extra: ms.extraWalls });
    ms.extraWalls = ms.extraWalls ? ms.extraWalls.slice() : [];
    const h = this.host, a = h.areaStates.indexOf(ms);
    ms.extraOffX = a >= 0 && a < h.areaBounds.length ? h.areaBounds[a].centerX : 0;
    ms.extraOffY = a >= 0 && a < h.areaBounds.length ? h.areaBounds[a].centerY : 0;
  }

  private _addWall(x: number, y: number, half: number, t: number): WallEntity | null {
    const n = this._statesAt(x, y, this._st);
    if (n === 0) return null;
    const w: WallEntity = { x, y, halfW: half, halfH: half, type: TileType.WALL, health: Infinity, maxHealth: Infinity, active: true, look: this._wallLook(t), noEye: true, lookDx: 0, lookDy: 0, kind: t > 0 && t < WALL_NAMES.length ? t : 0 };
    for (let i = 0; i < n; i++) {
      const ms = this._st[i];
      this._touch(ms);
      ms.walls.push(w);
      ms.extraWalls!.push(ms.walls.length - 1);
    }
    this.wallsMade.push(w);
    if (w.look) this.lookWalls.push(w);
    this._typedSync(w);
    this._track(w);
    this._mapChanged();
    return w;
  }

  private _track(w: WallEntity): void {
    for (let i = 0; i < this.mN; i++) if (this.mWalls[i] === w) return;
    const i = this.mN;
    if (i >= this.mX.length) {
      const grow = (a: Float64Array) => { const b = new Float64Array(a.length * 2); b.set(a); return b; };
      this.mX = grow(this.mX); this.mY = grow(this.mY); this.mHW = grow(this.mHW); this.mHH = grow(this.mHH);
      this.mL = grow(this.mL); this.mR = grow(this.mR); this.mT = grow(this.mT); this.mB = grow(this.mB);
      this.mPX = grow(this.mPX); this.mPY = grow(this.mPY); this.mPW = grow(this.mPW); this.mPH = grow(this.mPH); this.mTw = grow(this.mTw);
    }
    this.mWalls[i] = w; this.mN = i + 1;
    this.mX[i] = w.x; this.mY[i] = w.y; this.mHW[i] = w.halfW; this.mHH[i] = w.halfH;
    this.mL[i] = w.x - w.halfW; this.mR[i] = w.x + w.halfW; this.mT[i] = w.y - w.halfH; this.mB[i] = w.y + w.halfH;
    this.mPX[i] = w.x; this.mPY[i] = w.y; this.mPW[i] = w.halfW; this.mPH[i] = w.halfH; this.mTw[i] = WALL_GLIDE_STEPS;
  }

  private _slideWalls(): void {
    let sliding = false;
    for (let i = 0; i < this.mN; i++) {
      const w = this.mWalls[i];
      if (!w.active) continue;
      const x = w.x, y = w.y, hw = w.halfW, hh = w.halfH;
      if (hw === this.mPW[i] && hh === this.mPH[i]) {
        const mx = x - this.mPX[i], my = y - this.mPY[i];
        if (mx !== 0 || my !== 0) { this.mL[i] += mx; this.mR[i] += mx; this.mT[i] += my; this.mB[i] += my; this.mX[i] += mx; this.mY[i] += my; }
      } else {
        this.mL[i] = this.mX[i] - this.mHW[i]; this.mR[i] = this.mX[i] + this.mHW[i];
        this.mT[i] = this.mY[i] - this.mHH[i]; this.mB[i] = this.mY[i] + this.mHH[i];
        this.mTw[i] = 0;
      }
      this.mPX[i] = x; this.mPY[i] = y; this.mPW[i] = hw; this.mPH[i] = hh;
      let k = 1;
      if (this.mTw[i] < WALL_GLIDE_STEPS) { this.mTw[i]++; k = this.mTw[i] / WALL_GLIDE_STEPS; if (k < 1) sliding = true; }
      const l = this.mL[i] + (x - hw - this.mL[i]) * k, r = this.mR[i] + (x + hw - this.mR[i]) * k;
      const t = this.mT[i] + (y - hh - this.mT[i]) * k, b = this.mB[i] + (y + hh - this.mB[i]) * k;
      this.mX[i] = (l + r) * 0.5; this.mY[i] = (t + b) * 0.5; this.mHW[i] = (r - l) * 0.5; this.mHH[i] = (b - t) * 0.5;
      if (k >= 1) { this.mX[i] = x; this.mY[i] = y; this.mHW[i] = hw; this.mHH[i] = hh; }
    }
    if (sliding !== this.mSliding) { this.mSliding = sliding; this._refreshLive(); }
  }

  private _place(kind: number, ref: unknown, x: number, y: number, still: boolean): void {
    if (kind === K_WALL) {
      const w = ref as WallEntity;
      if (w.x === x && w.y === y) return;
      w.x = x; w.y = y;
      if (SMALL_FIX.CC009 !== 0 && this.host.areaStates.length > 0) this._carryIntoArea(kind, ref, x, y);
      this._mapChanged();
      return;
    }
    if (kind === K_ROCK) {
      const r = ref as RockEntity;
      if (r.x === x && r.y === y) return;
      r.x = x; r.y = y;
      if (SMALL_FIX.CC009 !== 0 && this.host.areaStates.length > 0) this._carryIntoArea(kind, ref, x, y);
      this._rocksChanged(r);
      return;
    }
    if (kind === K_PORTAL) {
      const p = ref as PortalEntity;
      if (p.x === x && p.y === y) return;
      p.x = x; p.y = y;
      this._mapChanged();
      return;
    }
    const h = this.host;
    setPos(h, kind, ref, x, y, still);
    if (kind === K_ENEMY) {
      const e = ref as EnemyTank;
      if ((e.isBaseProtector === true || ((e._mevF ?? 0) & 2) !== 0) && e.bpAnchorX !== undefined && (SMALL_FIX.CC012 === 0 || e.bpAnchorX !== x || e.bpAnchorY !== y)) { e.bpAnchorX = x; e.bpAnchorY = y; this.guardsMoved = true; this._mapChanged(); }
    }
    if (h.areaBounds.length > 0) {
      if (kind === K_PLAYER) h._adminPlayerAreaFollow();
      else if (kind === K_ENEMY) h._adminBotAreaFollow(ref as EnemyTank);
      else if (kind === K_SHAPE) { const a = h._areaIndexAtWorld(x, y); if (a >= 0) (ref as FloatingPolygon).areaIdx = a; }
    }
  }

  private _carryIntoArea(kind: number, ref: unknown, x: number, y: number): void {
    const h = this.host;
    const a = h._areaIndexAtWorld(x, y);
    const ms = a >= 0 ? h.areaStates[a] : undefined;
    if (!ms || ms === h.mapState) return;
    if (kind === K_WALL) {
      const w = ref as WallEntity;
      let idx = ms.walls.indexOf(w);
      if (idx >= 0 && ms.extraWalls && ms.extraWalls.indexOf(idx) >= 0) return;
      this._touch(ms);
      if (idx < 0) { ms.walls.push(w); idx = ms.walls.length - 1; }
      if (ms.extraWalls!.indexOf(idx) < 0) ms.extraWalls!.push(idx);
    } else if (kind === K_ROCK) {
      const r = ref as RockEntity;
      if (ms.rocks.indexOf(r) >= 0) return;
      let had = false;
      for (let k = 0; k < this.rockStates.length; k++) if (this.rockStates[k].ms === ms) { had = true; break; }
      if (!had) this.rockStates.push({ ms, len: ms.rocks.length });
      ms.rocks.push(r);
      ms.rockBucketCount = -1;
      this._noteChanged(ms);
    }
  }

  private _mapChanged(): void {
    this.navDirtyAt = this.host.gameNow();
    if (!this.navDirty) { this.navDirty = true; this._refreshLive(); }
  }

  private _ownGrid(ms: MapState): boolean {
    const h = this.host;
    return h.areaStates.length > 0 ? h.areaStates.indexOf(ms) >= 0 : ms === h.mapState;
  }

  private _navSync(): void {
    const h = this.host;
    this.navDirty = false;
    this.navBuiltAt = h.gameNow();
    this.mapVer++;
    if (this.guardsMoved) { this.guardsMoved = false; h._adminGuardsMoved(); }
    for (let s = 0; s < this.changed.length; s++) {
      const ms = this.changed[s];
      if (!this._ownGrid(ms)) { h._adminRebuildNav(ms, false); continue; }
      h._adminRebuildNav(ms, true);
      if (this.navStates.indexOf(ms) < 0) this.navStates.push(ms);
    }
    this._refreshLive();
  }


  _mapRetired(ms: MapState): void {
    const drop = <T extends { ms: MapState }>(a: T[]): void => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i].ms !== ms) a[n++] = a[i]; a.length = n; };
    drop(this.wallStates); drop(this.gridUndo); drop(this.rockStates); drop(this.rockGridUndo);
    let i = this.changed.indexOf(ms); if (i >= 0) this.changed.splice(i, 1);
    i = this.navStates.indexOf(ms); if (i >= 0) this.navStates.splice(i, 1);
    this._st.length = 0;
  }

  private wslotUndo: { w: WallEntity; v: number | undefined }[] = [];
  private _noteWallSlot(w: WallEntity): void {
    if (this.wallsMade.indexOf(w) >= 0) return;
    for (let i = 0; i < this.wslotUndo.length; i++) if (this.wslotUndo[i].w === w) return;
    this.wslotUndo.push({ w, v: w.wslot });
  }
  private _noteMapWall(w: WallEntity): void {
    if (this.wallsMade.indexOf(w) >= 0) return;
    this.host._mmPanelTakes(w);
    for (let i = 0; i < this.mapWallUndo.length; i++) if (this.mapWallUndo[i].w === w) return;
    this.mapWallUndo.push({ w, x: w.x, y: w.y, active: w.active, look: w.look, kind: w.kind, wslot: w.wslot, wteam: w.wteam });
  }

  private _typedSync(w: WallEntity): void {
    const i = this.typedWalls.indexOf(w);
    const want = w.active && w.kind !== undefined && w.kind > 0;
    if (want && i < 0) { this.typedWalls.push(w); this.typedVer++; }
    else if (!want && i >= 0) { this.typedWalls.splice(i, 1); this.typedVer++; }
  }

  private _killWall(w: WallEntity): boolean {
    if (!w.active) return false;
    this._noteMapWall(w);
    const made = this.wallsMade.indexOf(w) >= 0;
    if (!made) this._ungrid(w);
    w.active = false;
    if (made && SMALL_FIX.GH324 !== 0) this._unlistExtra(w);
    let x = w.x, y = w.y, hw = w.halfW, hh = w.halfH;
    for (let i = 0; i < this.mN; i++) if (this.mWalls[i] === w) { x = this.mX[i]; y = this.mY[i]; hw = this.mHW[i]; hh = this.mHH[i]; break; }
    const ms = this.host.mapState;
    this.dying.push({ x, y, halfW: hw, halfH: hh, look: w.look ?? null, at: this.host.gameNow(), wi: w.noEye || !ms ? -1 : ms.walls.indexOf(w), slot: this.slotOf(w) });
    const li = this.lookWalls.indexOf(w);
    if (li >= 0) this.lookWalls.splice(li, 1);
    this._typedSync(w);
    this._mapChanged();
    this._refreshLive();
    return true;
  }

  private _setWallType(w: WallEntity, t: number): void {
    this._noteMapWall(w);
    w.look = this._wallLook(t);
    const li = this.lookWalls.indexOf(w);
    if (w.look && li < 0) this.lookWalls.push(w);
    else if (!w.look && li >= 0) this.lookWalls.splice(li, 1);
    w.kind = t > 0 && t < WALL_NAMES.length ? t : 0;
    if (w.kind !== WT_TEAM && w.kind !== WT_BASE) delete w.wteam;
    this._typedSync(w);
  }
  private _wallTypeOf(w: WallEntity): number { return w.kind !== undefined ? w.kind : w.look ? w.look.type : 0; }
  retypeMapWall(w: WallEntity, t: number): void {
    w.kind = t > 0 && t < WALL_NAMES.length ? t : 0;
    const look = w.kind > 0 ? this._wallLook(w.kind) : null;
    if (look) w.look = look; else delete w.look;
    const li = this.lookWalls.indexOf(w);
    if (w.look && li < 0) this.lookWalls.push(w);
    else if (!w.look && li >= 0) this.lookWalls.splice(li, 1);
    this._typedSync(w);
  }
  adoptTypedWall(w: WallEntity): void {
    const t = w.kind ?? 0;
    if (t <= 0 || t >= WALL_NAMES.length || !w.active) return;
    w.look = this._wallLook(t);
    if (w.look && this.lookWalls.indexOf(w) < 0) this.lookWalls.push(w);
    this._typedSync(w);
  }
  doorWallChanged(w: WallEntity): void {
    const li = this.lookWalls.indexOf(w);
    if (w.active && w.look && li < 0) this.lookWalls.push(w);
    else if (!w.active && li >= 0) this.lookWalls.splice(li, 1);
    this._typedSync(w);
  }

  private _ungrid(w: WallEntity): void {
    if (this.wallsMade.indexOf(w) >= 0) return;
    this._noteMapWall(w);
    this._track(w);
    const n = this._statesAt(w.x, w.y, this._st);
    for (let s = 0; s < n; s++) {
      const ms = this._st[s];
      const idx = ms.walls.indexOf(w);
      if (idx < 0 || (ms.extraWalls && ms.extraWalls.indexOf(idx) >= 0)) continue;
      this._touch(ms);
      const cells: number[] = [];
      const g = ms.wallGrid;
      for (let c = 0; c < g.length; c++) if (g[c] === idx) { g[c] = -1; cells.push(c); }
      this.gridUndo.push({ ms, idx, cells });
      ms.extraWalls!.push(idx);
    }
  }

  private _wallAt(x: number, y: number): WallEntity | null {
    const ms = this.host.mapState;
    if (!ms) return null;
    const ws = ms.walls;
    for (let i = ws.length - 1; i >= 0; i--) {
      const w = ws[i];
      if (w.active && Math.abs(x - w.x) <= w.halfW && Math.abs(y - w.y) <= w.halfH) return w;
    }
    return null;
  }

  private _startWall(): void {
    const h = this.host;
    this._endWall();
    const x = h.pointerWorldX(), y = h.pointerWorldY();
    const top = this._wallOrRockAt(x, y);
    if (top !== null) {
      if (this.rockHit) this._killRock(top as RockEntity, true); else this._killWall(top as WallEntity);
      return;
    }
    if (this.lastWallType === ROCK_TYPE) {
      this.xRock = this._addRock(x, y, ROCK_MIN);
      if (this.xRock !== null) this._pushOut(K_ROCK, this.xRock);
      this._refreshLive();
      return;
    }
    this._gridCorner(x, y);
    this.xCx = Math.floor((x - this.xAx) / WALL_CELL);
    this.xCy = Math.floor((y - this.xAy) / WALL_CELL);
    this.xN = 1; this.xTick = this._tickNow();
    this.xRec = this._addWall(this.xAx + (this.xCx + 0.5) * WALL_CELL, this.xAy + (this.xCy + 0.5) * WALL_CELL, WALL_CELL / 2, this.lastWallType);
    if (this.xRec !== null) this._pushOut(K_WALL, this.xRec);
    this._refreshLive();
  }
  private _endWall(): void { this.xRec = null; this.xRock = null; this._refreshLive(); }
  private _tickNow(): number { return Math.floor(this.host.gameNow() * ARRAS_TICKS_PER_SEC / 1000); }
  private xTick = -1;
  private _growRock(x: number, y: number): void {
    const r = this.xRock!;
    if (!r.active) { this._endWall(); return; }
    const dx = x - r.x, dy = y - r.y;
    const s = Math.max(ROCK_MIN, Math.min(ROCK_MAX, Math.sqrt(dx * dx + dy * dy)));
    if (s === r.size) return;
    const grew = s > r.size;
    r.size = s;
    this._rocksChanged(r);
    if (grew) this._pushOut(K_ROCK, r);
  }

  private _growWall(x: number, y: number): void {
    const w = this.xRec!;
    if (!w.active) { this._endWall(); return; }
    const dx = Math.floor((x - this.xAx) / WALL_CELL) - this.xCx, dy = Math.floor((y - this.xAy) / WALL_CELL) - this.xCy;
    if (Math.abs(dx) !== Math.abs(dy)) return;
    const n = Math.abs(dx) + 1;
    if (n === this.xN) return;
    const grew = n > this.xN;
    this.xN = n;
    w.x = this.xAx + (this.xCx + dx / 2 + 0.5) * WALL_CELL;
    w.y = this.xAy + (this.xCy + dy / 2 + 0.5) * WALL_CELL;
    w.halfW = w.halfH = n * WALL_CELL / 2;
    this._mapChanged();
    if (grew) this._pushOut(K_WALL, w);
  }

  private _wallSectorAt(px: number, py: number): number {
    const dx = px - this.zX, dy = py - this.zY;
    if (dx * dx + dy * dy < MENU_DEAD * MENU_DEAD) return this.zWallBase;
    const cw = _mod(Math.atan2(dx, -dy) * 180 / Math.PI, 360);
    return Math.min(TYPE_SLICES - 1, Math.floor(cw / (360 / TYPE_SLICES)));
  }

  private _wallOrRockAt(x: number, y: number): WallEntity | RockEntity | null {
    const ms = this.host.mapState;
    this.rockHit = false;
    if (!ms) return null;
    const lw = this.lookWalls;
    for (let i = lw.length - 1; i >= 0; i--) { const w = lw[i]; if (w.active && Math.abs(x - w.x) <= w.halfW && Math.abs(y - w.y) <= w.halfH) return w; }
    const rs = ms.rocks;
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      if (!r.active) continue;
      const dx = r.x - x, dy = r.y - y;
      if (dx * dx + dy * dy < r.size * r.size) { this.rockHit = true; return r; }
    }
    return this._wallAt(x, y);
  }
  private rockHit = false;

  private gAx = 0; private gAy = 0;

  private _retypeZ(t: number): void {
    if (t === ROCK_TYPE) {
      if (this.zKind === K_ROCK) return;
      const w = this.zW!;
      if (this.zR === null) this.zR = this._addRock(w.x, w.y, Math.max(ROCK_MIN, Math.min(w.halfW, w.halfH)));
      else this._showRock(this.zR);
      if (this.zR === null) return;
      this._hideWall(w);
      this.zKind = K_ROCK; this.zRef = this.zR; this.zKey = this.zR;
      this._trackRock(this.zR);
      this._pushOut(K_ROCK, this.zR);
      return;
    }
    if (this.zKind === K_WALL) { this._setWallType(this.zW!, t); return; }
    const r = this.zR!;
    if (this.zW === null) {
      const n = Math.max(1, Math.round(r.size * 2 / WALL_CELL));
      this._cornerAt(r.x, r.y);
      const cx = Math.round((r.x - this.gAx) / WALL_CELL - n / 2), cy = Math.round((r.y - this.gAy) / WALL_CELL - n / 2);
      this.zW = this._addWall(this.gAx + (cx + n / 2) * WALL_CELL, this.gAy + (cy + n / 2) * WALL_CELL, n * WALL_CELL / 2, t);
      if (this.zW === null) return;
    } else { this._showWall(this.zW); this._setWallType(this.zW, t); }
    if (r.active) { this._unfixRock(r); this._killRock(r, false); }
    this.zKind = K_WALL; this.zRef = this.zW; this.zKey = this.zW;
    this._pushOut(K_WALL, this.zW);
  }
  private _unlistExtra(w: WallEntity): void {
    const h = this.host;
    for (let s = -1; s < h.areaStates.length; s++) {
      const ms = s < 0 ? h.mapState : h.areaStates[s];
      if (!ms || !ms.extraWalls || (s >= 0 && ms === h.mapState)) continue;
      const i = ms.walls.lastIndexOf(w);
      if (i < 0) continue;
      const k = ms.extraWalls.indexOf(i);
      if (k >= 0) ms.extraWalls.splice(k, 1);
    }
  }

  private _hideWall(w: WallEntity): void {
    if (!w.active) return;
    this._noteMapWall(w);
    if (this.wallsMade.indexOf(w) < 0) this._ungrid(w);
    w.active = false;
    const li = this.lookWalls.indexOf(w);
    if (li >= 0) this.lookWalls.splice(li, 1);
    this._typedSync(w);
    this._mapChanged();
  }
  private _showWall(w: WallEntity): void {
    if (w.active) return;
    w.active = true;
    if (w.look && this.lookWalls.indexOf(w) < 0) this.lookWalls.push(w);
    this._typedSync(w);
    this._mapChanged();
  }

  private _restoreWalls(): void {
    for (let i = this.rockGridUndo.length - 1; i >= 0; i--) { const u = this.rockGridUndo[i]; u.ms.rockGrid[u.cell] = u.v; }
    for (let i = 0; i < this.rockUndo.length; i++) this.rockUndo[i].active = true;
    this.rockGridUndo.length = 0; this.rockUndo.length = 0; this.dyingRocks.length = 0;
    for (let i = this.mapRockUndo.length - 1; i >= 0; i--) {
      const u = this.mapRockUndo[i];
      u.r.x = u.x; u.r.y = u.y; u.r.size = u.size; u.r.rotation = u.rotation; u.r.active = u.active;
    }
    for (let i = this.rockStates.length - 1; i >= 0; i--) { const u = this.rockStates[i]; if (u.ms.rocks.length > u.len) u.ms.rocks.length = u.len; }
    for (let i = this.portalUndo.length - 1; i >= 0; i--) { const u = this.portalUndo[i]; u.p.x = u.x; u.p.y = u.y; }
    this.mapRockUndo.length = 0; this.rockStates.length = 0; this.portalUndo.length = 0; this.rocksMade.length = 0;
    for (let i = 0; i < this.mRN; i++) this.mRocks[i] = null as unknown as RockEntity;
    this.mRN = 0; this.mRocks.length = 0; this.xRock = null; this.zW = null; this.zR = null;
    for (let i = 0; i < this.mN; i++) this.mWalls[i] = null as unknown as WallEntity;
    this.mN = 0; this.mWalls.length = 0; this.mSliding = false;
    this.navDirty = false; this.navBuiltAt = -Infinity;
    for (let i = this.gridUndo.length - 1; i >= 0; i--) {
      const u = this.gridUndo[i];
      for (let c = 0; c < u.cells.length; c++) u.ms.wallGrid[u.cells[c]] = u.idx;
    }
    for (let i = this.mapWallUndo.length - 1; i >= 0; i--) {
      const u = this.mapWallUndo[i];
      u.w.x = u.x; u.w.y = u.y; u.w.active = u.active;
      if (u.look === undefined) delete u.w.look; else u.w.look = u.look;
      if (u.kind === undefined) delete u.w.kind; else u.w.kind = u.kind;
      if (u.wslot === undefined) delete u.w.wslot; else u.w.wslot = u.wslot;
      if (u.wteam === undefined) delete u.w.wteam; else u.w.wteam = u.wteam;
    }
    for (let i = this.wslotUndo.length - 1; i >= 0; i--) { const u = this.wslotUndo[i]; if (u.v === undefined) delete u.w.wslot; else u.w.wslot = u.v; }
    this.wslotUndo.length = 0;
    for (let i = this.wallStates.length - 1; i >= 0; i--) {
      const u = this.wallStates[i];
      if (u.ms.walls.length > u.len) u.ms.walls.length = u.len;
      if (u.extra === undefined) { delete u.ms.extraWalls; delete u.ms.extraOffX; delete u.ms.extraOffY; } else u.ms.extraWalls = u.extra;
    }
    this.gridUndo.length = 0; this.mapWallUndo.length = 0; this.wallStates.length = 0;
    this.wallsMade.length = 0; this.lookWalls.length = 0; this.dying.length = 0; this.typedWalls.length = 0; this.typedVer++;
    this.wallLooks.length = 0;
    this.xRec = null;
    for (let i = 0; i < this.changed.length; i++) {
      const ms = this.changed[i];
      ms.rockBucketCount = -1;
      this.host._adminRebuildNav(ms, this.navStates.indexOf(ms) >= 0);
    }
    if (this.changed.length > 0) this.mapVer++;
    this.changed.length = 0;
    this.navStates.length = 0;
  }

  step(): void {
    const h = this.host;
    if (this.tankSeen !== null && this.tankSeen !== h.state.currentTankFileName) {
      this.tankSeen = null;
      this._resetBody();
    }
    if (!this.held && this.dByKey !== 'Mouse' && (this.wKind !== K_NONE || this.dN > 0 || this.zOn)) this.release();
    const x = h.pointerWorldX(), y = h.pointerWorldY();
    if (this.wKind !== K_NONE) {
      if (!valid(h, this.wKind, this.wRef, this.wKey)) this._endWhirl();
      else this._place(this.wKind, this.wRef, x, y, true);
    }
    if (this.dN > 0) {
      let alive = 0;
      for (let i = 0; i < this.dN; i++) {
        if (!valid(h, this.dKind[i], this.dRef[i], this.dKey[i])) continue;
        this._place(this.dKind[i], this.dRef[i], x + this.dOffX[i], y + this.dOffY[i], this.dKind[i] !== K_BULLET);
        alive++;
      }
      if (alive === 0) this._endDrag();
    }
    if (this.xRec !== null) { const t = this._tickNow(); if (t !== this.xTick) { this.xTick = t; this._growWall(x, y); } }
    else if (this.xRock !== null) this._growRock(x, y);
    if (this.jN > 0) this._stepJoints();
    if (this.mN > 0) this._slideWalls();
    if (this.sN > 0) this._slideShapes();
    if (this.navDirty) {
      const now = h.gameNow();
      if (now - this.navDirtyAt >= NAV_SETTLE_MS || now - this.navBuiltAt >= NAV_EVERY_MS) this._navSync();
    }
    if (this.blastHeld) {
      if ((this.attrs & AT_BLAST_ACTION) === 0) { this.blastHeld = false; this._refreshLive(); }
      else if (++this.blastTick >= 2) { this.blastTick = 0; this._blast(x, y); }
    }
    if (this.cOn) {
      if (!valid(h, this.cKind, this.cRef, this.cKey)) this._endColor();
      else {
        const dx = x - this.cX, dy = y - this.cY;
        if (dx * dx + dy * dy >= MENU_DEAD * MENU_DEAD) {
          const slot = COLOR_WHEEL[Math.min(19, Math.floor(_mod(Math.atan2(dx, -dy) * 180 / Math.PI, 360) / 18))];
          if (slot !== this.cNow) { this.cNow = slot; this.lastColor = slot; this._paint(this.cKind, this.cRef, slot); }
        }
      }
    }
    if (this.dying.length > 0) {
      const now = h.gameNow();
      for (let i = this.dying.length - 1; i >= 0; i--) if (now - this.dying[i].at >= WALL_DEATH_MS) this.dying.splice(i, 1);
      if (this.dying.length === 0) this._refreshLive();
    }
    if (this.dyingRocks.length > 0) {
      const now = h.gameNow();
      for (let i = this.dyingRocks.length - 1; i >= 0; i--) if (now - this.dyingRocks[i].at >= WALL_DEATH_MS) this.dyingRocks.splice(i, 1);
      if (this.dyingRocks.length === 0) this._refreshLive();
    }
    const zTick = this.zOn ? this._tickNow() : 0;
    if (this.zOn && !valid(h, this.zKind, this.zRef, this.zKey)) this._endZ();
    else if (this.zOn && zTick !== this.zTick) {
      this.zTick = zTick;
      if (this.zKind === K_WALL || this.zKind === K_ROCK) {
        const t = this._wallSectorAt(x, y);
        if (t !== this.zWallNow) { this.zWallNow = t; this.lastWallType = t; this._retypeZ(t); }
      } else if (this.zKind === K_SHAPE) {
        const d = this._designAt(x, y);
        if (d !== this.zNow) {
          const q = this._reshape(this.zRef as FloatingPolygon, d);
          if (q) { this.zRef = q; this.zKey = q.id; this.zNow = d; this.lastDesign = d; }
          else if (!valid(h, this.zKind, this.zRef, this.zKey)) this._endZ();
        }
      }
    }
  }

  private _stepJoints(): void {
    const h = this.host;
    for (let i = this.jN - 1; i >= 0; i--) {
      const tk = this.jTK[i], tr = this.jTRef[i];
      if (!valid(h, tk, tr, this.jTKey[i]) || (this.jAK[i] !== K_NONE && !valid(h, this.jAK[i], this.jARef[i], this.jAKey[i]))) { this._dropJoint(i); continue; }
      let ax = this.jAX[i], ay = this.jAY[i];
      if (this.jAK[i] !== K_NONE) { const a = posOf(h, this.jAK[i], this.jARef[i]); ax = a.x; ay = a.y; }
      const p = posOf(h, tk, tr);
      let px = p.x, py = p.y;
      const kind = this.jKind[i], d0 = this.jD[i];
      let nx = 0, ny = 0;
      if (kind === 0) {
        px = ax + this.jOX[i]; py = ay + this.jOY[i];
        this._place(tk, tr, px, py, true);
        continue;
      }
      if (kind <= 3) {
        const dx = px - ax, dy = py - ay, d = Math.sqrt(dx * dx + dy * dy);
        const ux = d > 1e-9 ? dx / d : this.jUX[i], uy = d > 1e-9 ? dy / d : this.jUY[i];
        let want = d;
        if (kind === 1 && d < d0) want = d0;
        else if (kind === 2 && d > d0) want = d0;
        else if (kind === 3) want = d0;
        if (want === d) continue;
        px = ax + ux * want; py = ay + uy * want;
        nx = ux; ny = uy;
      } else {
        const ux = this.jUX[i], uy = this.jUY[i];
        let t = (px - ax) * ux + (py - ay) * uy;
        if (t < 0) t = 0;
        if (kind === 5 && t < d0) t = d0;
        else if (kind === 6 && t > d0) t = d0;
        const qx = ax + ux * t, qy = ay + uy * t;
        if (qx === px && qy === py) continue;
        nx = -uy; ny = ux;
        px = qx; py = qy;
      }
      this._place(tk, tr, px, py, false);
      killAlong(h, tk, tr, nx, ny);
    }
  }

  private _dropJoint(i: number): void {
    const last = this.jN - 1;
    if (i !== last) {
      this.jKind[i] = this.jKind[last]; this.jTK[i] = this.jTK[last]; this.jTRef[i] = this.jTRef[last]; this.jTKey[i] = this.jTKey[last];
      this.jAK[i] = this.jAK[last]; this.jARef[i] = this.jARef[last]; this.jAKey[i] = this.jAKey[last];
      this.jAX[i] = this.jAX[last]; this.jAY[i] = this.jAY[last]; this.jD[i] = this.jD[last];
      this.jUX[i] = this.jUX[last]; this.jUY[i] = this.jUY[last]; this.jOX[i] = this.jOX[last]; this.jOY[i] = this.jOY[last];
    }
    this.jTRef[last] = null; this.jTKey[last] = null; this.jARef[last] = null; this.jAKey[last] = null;
    this.jN = last;
    if (this.jN === 0) this._refreshLive();
  }

  private _jointOf(kind: number, ref: unknown, key: unknown): number {
    for (let i = 0; i < this.jN; i++) if (this.jTK[i] === kind && this.jTRef[i] === ref && this.jTKey[i] === key) return i;
    return -1;
  }

  private _jointDown(repeat: boolean): void {
    const h = this.host;
    if (!repeat) {
      const n = this._under(h.pointerWorldX(), h.pointerWorldY(), true);
      if (n > 0) {
        this.jpKind = this.selKind[n - 1]; this.jpRef = this.selRef[n - 1]; this.jpKey = keyOf(this.jpKind, this.jpRef);
        h.pushMessage(MSG_JOINT_PICK);
        return;
      }
      this.jpKind = K_NONE;
    } else if (this.jpKind !== K_NONE) return;
    this.jointType = (this.jointType + 1) % JOINT_NAMES.length;
    h.pushMessage('Joint type selected: ' + JOINT_NAMES[this.jointType]);
  }

  private _jointUp(): void {
    const h = this.host;
    const tk = this.jpKind, tr = this.jpRef, tkey = this.jpKey;
    this.jpKind = K_NONE; this.jpRef = null; this.jpKey = null;
    if (tk === K_NONE || !valid(h, tk, tr, tkey)) return;
    const x = h.pointerWorldX(), y = h.pointerWorldY();
    const n = this._under(x, y, true);
    let ak = K_NONE, ar: unknown = null, onSelf = false;
    for (let i = n - 1; i >= 0; i--) {
      if (this.selKind[i] === tk && this.selRef[i] === tr) { onSelf = true; continue; }
      if (ak === K_NONE) { ak = this.selKind[i]; ar = this.selRef[i]; }
    }
    const had = this._jointOf(tk, tr, tkey);
    if (ak === K_NONE && onSelf) {
      if (had >= 0) this._dropJoint(had);
      h.pushMessage(MSG_JOINT_DEL);
      return;
    }
    if (ak !== K_NONE) {
      let ck = ak, cr = ar, ckey = keyOf(ak, ar);
      for (let guard = 0; guard <= this.jN; guard++) {
        if (ck === tk && cr === tr) { h.pushMessage(MSG_JOINT_LOOP); return; }
        const j = this._jointOf(ck, cr, ckey);
        if (j < 0 || this.jAK[j] === K_NONE) break;
        ck = this.jAK[j]; cr = this.jARef[j]; ckey = this.jAKey[j];
      }
    }
    if (had >= 0) this._dropJoint(had);
    if (this.jN >= JOINT_MAX) return;
    this._takeHold(tk, tr);
    const i = this.jN++;
    const p = posOf(h, tk, tr);
    const px = p.x, py = p.y;
    let ax = x, ay = y;
    if (ak !== K_NONE) { const a = posOf(h, ak, ar); ax = a.x; ay = a.y; }
    const dx = px - ax, dy = py - ay, d = Math.sqrt(dx * dx + dy * dy);
    this.jKind[i] = this.jointType;
    this.jTK[i] = tk; this.jTRef[i] = tr; this.jTKey[i] = tkey;
    this.jAK[i] = ak; this.jARef[i] = ar; this.jAKey[i] = ak === K_NONE ? null : keyOf(ak, ar);
    this.jAX[i] = ax; this.jAY[i] = ay;
    this.jD[i] = d; this.jUX[i] = d > 1e-9 ? dx / d : 1; this.jUY[i] = d > 1e-9 ? dy / d : 0;
    this.jOX[i] = dx; this.jOY[i] = dy;
    h.pushMessage(ak === K_NONE ? MSG_JOINT_POS : MSG_JOINT_ENT);
    this._refreshLive();
  }

  mouseDown(): void {
    if (ADMIN_PANEL.ON === 0 || (this.attrs & LEFT_ACTIONS) === 0) return;
    if (!this.allowed()) return;
    const h = this.host;
    if (this.attrs & AT_DATA_ACTION) this._getData();
    if (this.attrs & AT_DRAG_ACTION) this._startDrag('Mouse', false);
    if (this.attrs & AT_BLAST_ACTION) { this._blast(h.pointerWorldX(), h.pointerWorldY()); this.blastHeld = true; this.blastTick = 0; this._refreshLive(); }
  }
  mouseUp(): void {
    if (this.dByKey === 'Mouse') this._endDrag();
    if (this.blastHeld) { this.blastHeld = false; this._refreshLive(); }
  }
  rightDown(): void {
    if (ADMIN_PANEL.ON === 0 || (this.attrs & AT_TP_ACTION) === 0 || !this.allowed()) return;
    this._teleport();
  }
  blocksFire(): boolean { return this.held || this.dN > 0; }
  private blastHeld = false;
  private blastTick = 0;

  private _under(x: number, y: number, self: boolean): number {
    const h = this.host;
    let n = 0;
    const add = (k: number, r: unknown) => { this.selKind[n] = k; this.selRef[n] = r; n++; };
    if (self && !h.tankDying) {
      const r = h._playerBodyRadius(), dx = h.tankPos.x - x, dy = h.tankPos.y - y;
      if (dx * dx + dy * dy < r * r) add(K_PLAYER, null);
    }
    const en = h.state.enemyTanks;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active || e.isDying) continue;
      const r = e.size * 0.5, dx = e.position.x - x, dy = e.position.y - y;
      if (dx * dx + dy * dy < r * r) add(K_ENEMY, e);
    }
    const ps = h.floatingPolygons;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active || p.fadingOut) continue;
      const r = p.size * 0.5, dx = p.position.x - x, dy = p.position.y - y;
      if (dx * dx + dy * dy < r * r) add(K_SHAPE, p);
    }
    const bs = h.bullets;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.active || b.isFading) continue;
      const r = b.size * 0.5, dx = b.position.x - x, dy = b.position.y - y;
      if (dx * dx + dy * dy < r * r) add(K_BULLET, b);
    }
    const ws = h.mapState ? h.mapState.walls : null;
    if (ws) for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w.active && Math.abs(x - w.x) <= w.halfW && Math.abs(y - w.y) <= w.halfH) add(K_WALL, w);
    }
    const rs = h.mapState ? h.mapState.rocks : null;
    if (rs) for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      if (!r.active) continue;
      const dx = r.x - x, dy = r.y - y;
      if (dx * dx + dy * dy < r.size * r.size) add(K_ROCK, r);
    }
    return n;
  }

  private _nKind = K_NONE;
  private _nRef: unknown = null;
  private _nearest(x: number, y: number, changeableOnly: boolean): boolean {
    const h = this.host;
    let best = Infinity;
    this._nKind = K_NONE; this._nRef = null;
    const take = (k: number, r: unknown, px: number, py: number) => {
      const dx = px - x, dy = py - y, d = dx * dx + dy * dy;
      if (d < best && (!changeableOnly || this._changeable(k, r))) { best = d; this._nKind = k; this._nRef = r; }
    };
    if (!h.tankDying && !changeableOnly) take(K_PLAYER, null, h.tankPos.x, h.tankPos.y);
    const en = h.state.enemyTanks;
    for (let i = 0; i < en.length; i++) { const e = en[i]; if (e.active && !e.isDying) take(K_ENEMY, e, e.position.x, e.position.y); }
    const ps = h.floatingPolygons;
    for (let i = 0; i < ps.length; i++) { const p = ps[i]; if (p.active && !p.fadingOut) take(K_SHAPE, p, p.position.x, p.position.y); }
    const bs = h.bullets;
    for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (b.active && !b.isFading) take(K_BULLET, b, b.position.x, b.position.y); }
    const ws = h.mapState ? h.mapState.walls : null;
    if (ws) for (let i = 0; i < ws.length; i++) { const w = ws[i]; if (w.active) take(K_WALL, w, w.x, w.y); }
    const rs = h.mapState ? h.mapState.rocks : null;
    if (rs) for (let i = 0; i < rs.length; i++) { const r = rs[i]; if (r.active) take(K_ROCK, r, r.x, r.y); }
    const pts = h.mapState ? h.mapState.portals : null;
    if (pts) for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (portalHere(p)) take(K_PORTAL, p, p.x, p.y); }
    return this._nKind !== K_NONE;
  }

  private _topAt(x: number, y: number): boolean {
    const h = this.host, ms = h.mapState;
    this._nKind = K_NONE; this._nRef = null;
    if (ms) for (let i = 0; i < ms.portals.length; i++) {
      const p = ms.portals[i];
      if (!portalHere(p)) continue;
      const dx = p.x - x, dy = p.y - y, r = p.tileSize * 0.5;
      if (dx * dx + dy * dy < r * r) { this._nKind = K_PORTAL; this._nRef = p; }
    }
    const bs = h.bullets;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.active || b.isFading) continue;
      const r = b.size * 0.5, dx = b.position.x - x, dy = b.position.y - y;
      if (dx * dx + dy * dy < r * r) { this._nKind = K_BULLET; this._nRef = b; }
    }
    if (!h.tankDying) {
      const r = h._playerBodyRadius(), dx = h.tankPos.x - x, dy = h.tankPos.y - y;
      if (dx * dx + dy * dy < r * r) { this._nKind = K_PLAYER; this._nRef = null; }
    }
    const en = h.state.enemyTanks;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active || e.isDying) continue;
      const r = e.size * 0.5, dx = e.position.x - x, dy = e.position.y - y;
      if (dx * dx + dy * dy < r * r) { this._nKind = K_ENEMY; this._nRef = e; }
    }
    const ps = h.floatingPolygons;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active || p.fadingOut) continue;
      const r = p.size * p.growth * 0.5, dx = p.position.x - x, dy = p.position.y - y;
      if (dx * dx + dy * dy < r * r) { this._nKind = K_SHAPE; this._nRef = p; }
    }
    if (ms) {
      const ws = ms.walls;
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i];
        if (w.active && !w.look && Math.abs(x - w.x) <= w.halfW && Math.abs(y - w.y) <= w.halfH) { this._nKind = K_WALL; this._nRef = w; }
      }
      const rs = ms.rocks;
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i];
        if (!r.active) continue;
        const dx = r.x - x, dy = r.y - y;
        if (dx * dx + dy * dy < r.size * r.size) { this._nKind = K_ROCK; this._nRef = r; }
      }
    }
    const lw = this.lookWalls;
    for (let i = 0; i < lw.length; i++) {
      const w = lw[i];
      if (w.active && Math.abs(x - w.x) <= w.halfW && Math.abs(y - w.y) <= w.halfH) { this._nKind = K_WALL; this._nRef = w; }
    }
    return this._nKind !== K_NONE;
  }

  onRevoke(fn: () => void): () => void {
    this.revokeListeners.push(fn);
    return () => { const i = this.revokeListeners.indexOf(fn); if (i >= 0) this.revokeListeners.splice(i, 1); };
  }

  resetRank(): void { this.conductor = false; }

  photoConductor(): void { if (PHOTO_MODE && !this.conductor) this._rankFlip(); }

  typedLetters(text: string): boolean {
    if (ADMIN_PANEL.ON === 0) return false;
    const was = this.conductor;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i) | 0x20;
      if (c < 97 || c > 122) continue;
      this._cadence(_KEY_CODES[c - 97]);
      this.afterKey();
    }
    return this.conductor !== was;
  }

  private _rankFlip(): void {
    const h = this.host;
    if (!h.playSessionActive || !h.state.isTestMode) return;
    this.conductor = !this.conductor;
    if (this.conductor) {
      h.updateState({ debugMode: true });
      h.pushMessage(MSG_UP);
      return;
    }
    h._debugPowersOff();
    h.pushMessage(MSG_DOWN);
    for (let i = this.revokeListeners.length - 1; i >= 0; i--) this.revokeListeners[i]();
  }

  private _cadence(code: string): void {
    if (MOD_KEY.test(code)) return;
    const v = code.length === 4 && code.charCodeAt(0) === 75 && code.charCodeAt(1) === 101 ? code.charCodeAt(3) : 0;
    this.cad[this.cadAt] = v;
    this.cadAt = (this.cadAt + 1) % 9;
    let m = 0x811c9dc5;
    for (let i = 0; i < 9; i++) { m ^= this.cad[(this.cadAt + i) % 9] * 0x2f; m = Math.imul(m, 0x01000193); }
    if ((m >>> 0) === CADENCE_MARK) this.flipDue = true;
  }
  private flipDue = false;
  afterKey(): void { if (this.flipDue) { this.flipDue = false; this._rankFlip(); } }
}

const CADENCE_MARK = 0xe9f0b2b3;
const _KEY_CODES: readonly string[] = Array.from({ length: 26 }, (_, i) => 'Key' + String.fromCharCode(65 + i));
const PLAYER_KEY = {};
const MOD_KEY = /^(Shift|Control|Alt|Meta|CapsLock|OS)/;

function buildOf(u: Record<UpgradeStat, number>): string {
  return u.reload + '/' + u.bulletPenetration + '/' + u.bulletHealth + '/' + u.bulletDamage + '/' + u.bulletSpeed + '/'
    + u.shieldCapacity + '/' + u.bodyDamage + '/' + u.maxHealth + '/' + u.shieldRegen + '/' + u.movementSpeed;
}

function keyOf(kind: number, ref: unknown): unknown {
  if (kind === K_ENEMY) return (ref as EnemyTank).id;
  if (kind === K_SHAPE) return (ref as FloatingPolygon).id;
  if (kind === K_BULLET) return (ref as Bullet).bulletId;
  return ref;
}

function valid(h: AdminHost, kind: number, ref: unknown, key: unknown): boolean {
  switch (kind) {
    case K_PLAYER: return !h.tankDying && h.state.isTestMode;
    case K_ENEMY: { const e = ref as EnemyTank; return e.active && !e.isDying && e.id === key; }
    case K_SHAPE: { const p = ref as FloatingPolygon; return p.active && !p.fadingOut && p.id === key; }
    case K_BULLET: { const b = ref as Bullet; return b.active && !b.isFading && b.bulletId === key; }
    case K_WALL: return (ref as WallEntity).active;
    case K_ROCK: return (ref as RockEntity).active;
    case K_PORTAL: return portalHere(ref as PortalEntity);
  }
  return false;
}

function portalHere(p: PortalEntity): boolean {
  return !(p.timed && !p._timedActive) && !p._dying;
}

const _pos = { x: 0, y: 0 };
function posOf(h: AdminHost, kind: number, ref: unknown): { x: number; y: number } {
  switch (kind) {
    case K_PLAYER: _pos.x = h.tankPos.x; _pos.y = h.tankPos.y; break;
    case K_ENEMY: _pos.x = (ref as EnemyTank).position.x; _pos.y = (ref as EnemyTank).position.y; break;
    case K_SHAPE: _pos.x = (ref as FloatingPolygon).position.x; _pos.y = (ref as FloatingPolygon).position.y; break;
    case K_BULLET: _pos.x = (ref as Bullet).position.x; _pos.y = (ref as Bullet).position.y; break;
    case K_WALL: case K_ROCK: case K_PORTAL: _pos.x = (ref as WallEntity).x; _pos.y = (ref as WallEntity).y; break;
  }
  return _pos;
}

function killAlong(h: AdminHost, kind: number, ref: unknown, nx: number, ny: number): void {
  if (nx === 0 && ny === 0) return;
  switch (kind) {
    case K_PLAYER: cutAlong(h.tankVelocity, nx, ny); cutAlong(h.knockbackVelocity, nx, ny); break;
    case K_ENEMY: { const e = ref as EnemyTank; cutAlong(e.velocity, nx, ny); cutAlong(e.knockbackVelocity, nx, ny); break; }
    case K_SHAPE: { const p = ref as FloatingPolygon; cutAlong(p.velocity, nx, ny); cutAlong(p.impactVelocity, nx, ny); break; }
    case K_BULLET: cutAlong((ref as Bullet).velocity, nx, ny); break;
  }
}
function cutAlong(v: { x: number; y: number }, nx: number, ny: number): void { const k = v.x * nx + v.y * ny; v.x -= k * nx; v.y -= k * ny; }

function setPos(h: AdminHost, kind: number, ref: unknown, x: number, y: number, still: boolean): void {
  switch (kind) {
    case K_PLAYER:
      h.tankPos.x = x; h.tankPos.y = y;
      if (still) { h.tankVelocity.x = 0; h.tankVelocity.y = 0; h.knockbackVelocity.x = 0; h.knockbackVelocity.y = 0; }
      h._adminEndGlide(null);
      break;
    case K_ENEMY: {
      const e = ref as EnemyTank;
      e.position.x = x; e.position.y = y;
      if (still) { e.velocity.x = 0; e.velocity.y = 0; e.knockbackVelocity.x = 0; e.knockbackVelocity.y = 0; }
      h._adminEndGlide(e);
      break;
    }
    case K_SHAPE: {
      const p = ref as FloatingPolygon;
      p.position.x = x; p.position.y = y;
      if (still) { p.velocity.x = 0; p.velocity.y = 0; p.impactVelocity.x = 0; p.impactVelocity.y = 0; }
      if (SMALL_FIX.CC011 !== 0) p._admPush = false;
      break;
    }
    case K_BULLET: {
      const b = ref as Bullet; b.position.x = x; b.position.y = y;
      if (SMALL_FIX.GH331 !== 0) b._carryFrame = -9;
      break;
    }
    case K_WALL: { const w = ref as WallEntity; w.x = x; w.y = y; break; }
  }
}
