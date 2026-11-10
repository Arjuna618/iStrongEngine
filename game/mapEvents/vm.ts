import { MISSING_MODES } from '../missingModesSwitch';
import { Sfc32, hash32, runNum, NumStore, emitNum } from './num';
import { polyHas, polyAlong, polyAx, polyAy } from '../areaShape';
import type { NumCtx } from './num';
import { AREA_BEHAVIOR_WORDS, KINDS, NEXT, WAIT, END, OP_END, OP_JUMP, OP_IF, OP_PICK, OP_REPEAT_INIT, OP_REPEAT_TEST, OP_FOREACH, OP_FORK, OP_WAITUNTIL, OP_CALL, OP_PLAY, OP_CLIST } from './registry';
import type { Program, CPlan, CCard, CGroup, CPlace, CSeq, CSpawner, CStay } from './compile';
import { refStride } from './compile';
import type { MapEventsHost, MevBody, SpawnReq } from './host';
import { CAUSE_AREA, CAUSE_BECOME, CAUSE_HIT, CAUSE_OTHER, CAUSE_RULE, ORDER_STAND } from './host';
import { rollWave, waveTestHolds, breakSeconds, PURPOSE_CARD, PURPOSE_PLACE } from './waves';
import type { RollCtx } from './waves';
import type { SideSpec, SpawnCard } from './doc';
import { compileTouch } from './thingBody';
import { isShapeThing } from './thingWord';
import { SMALL_FIX } from '../smallFixSwitch';
import { TEAM_COLOUR } from '../teamColourSwitch';

const CHAIN_MAX = 16, SIG_PER_STEP = 512, OPS_PER_STEP = 8192, RUNS_MAX = 2048, FLIPS_MAX = 20, STALL_MS = 10000;
const HUD_LIVE_MS = 250;
const NO_ROOM_RUN_MS = 500, NO_ROOM_WAVE_MS = 5000;
const PER_STEP_BIRTHS = 8;

const F_FREE = 1;
const F_OWN_KILL = 2;
const F_SKIP = 4;
const F_JOINING = 8;
const COUNTED_KINDS: ReadonlySet<string> = new Set(['seekHeal', 'healerDuty', 'teamFight', 'fearLow', 'wallAvoid', 'wallTouch']);
interface Scene { seq: CSeq; parent: Scene | null; until: number; runs: number; kids: number; }
const SCENE_HELD = 1, SCENE_GUARD = 2, SCENE_STOP = 4, SCENE_SKIP = 8;
const sceneHas = (s: Scene | null, of: Scene): boolean => { for (let x = s; x !== null; x = x.parent) if (x === of) return true; return false; };

const PH_IDLE = 0, PH_DELAY = 1, PH_RUNNING = 2, PH_BREAK = 3, PH_DONE = 4, PH_STOPPED = 5;

const OWN_PLAN = 1, OWN_TIMER = 2, OWN_SPAWNER = 3, OWN_STATUS = 4, OWN_SLOT = 5, OWN_TYPE = 6, OWN_SPAWN_PLACE = 7, OWN_ORDER = 8;

const BIRTH_OK = 0, BIRTH_WAIT = 1, BIRTH_GONE = 2;
const GONE_PER_PUMP = 1024;

const enum HowChange { Become = 0, Morph = 1 }

const TRIG_OPS: Record<string, number> = {};
for (const d of KINDS) if (d.family === 'trigger') TRIG_OPS[d.kind] = d.op!;

class Stream {
  plan = -1; wave = 0; group = -1; spawner = -1;
  cards: readonly CCard[] = []; zones: readonly number[] = []; weights: readonly number[] | null = null;
  place: CPlace | null = null;
  budget: SpawnCard[] | undefined = undefined;
  budgetCards: readonly CCard[] | null = null;
  left = 0; next = 0; step = 0;
  holds = false;
  side: SideSpec | null = null;
  showName: boolean | null = null; name = '';
  tags: readonly number[] = [];
  rngCard = new Sfc32(); rngPlace = new Sfc32();
  waitingSince = -1;
  stallNoted = false;
  runRule = -1; runX = 0; runY = 0; runHome = -1;
  run = 0;
  srcRule = -1; srcIp = -1;
  spread = 0; spreadN = 0; spreadA0 = 0;
}

interface StatusRow { status: number; body: MevBody; id: string; until: number; row: number; }
interface StayClock { stay: number; body: MevBody; id: string; ms: number; fired: boolean; repeats: number; inside: boolean; }
interface QueuedStart { rule: number; subject: MevBody | null; subjectId: string; other: MevBody | null; otherId: string; otherSide: string; x: number; y: number; depth: number; wave: number; num: number; key: number; row: number;
  parent?: number; parentGen?: number; args?: number[] | null; skip?: number; scene?: Scene | null;
  called?: boolean; alive?: boolean; }
export interface LogRecord { at: number; kind: number; rule: number; a: number; b: number; }

export const LOG_RING = 2048;
export const LOG_FIRED = 1, LOG_REFUSED = 2, LOG_RAN = 3, LOG_GUARD = 4, LOG_COND_FAILED = 5, LOG_WAVE = 6, LOG_BIRTH = 7, LOG_DEATH = 8, LOG_STEP = 9;

function _unLink(s: string): string { return s.indexOf('\uE000') < 0 && s.indexOf('\uE001') < 0 ? s : s.replace(/\uE000/g, '{').replace(/\uE001/g, '}'); }

export class MapEventsVM implements NumCtx {
  wave = 0; seconds = 0; tier = 1;
  private _pl = 1; private _hu = 1; private _bo = 0; private _popGen = 0; private _popGot = 0;
  get players(): number { if (this._popGot !== this._popGen) this.popFill(); return this._pl; }
  get humans(): number { if (this._popGot !== this._popGen) this.popFill(); return this._hu; }
  get bots(): number { if (this._popGot !== this._popGen) this.popFill(); return this._bo; }
  private popFill(): void { this._popGot = this._popGen; this._hu = this.host.humans(); this._bo = this.host.bots(); this._pl = this._hu + this._bo; }
  rng: Sfc32 = new Sfc32();
  private _ctxRun = -1;
  private _ctxDoc = 0;
  private ownerRng = new Map<number, Sfc32>();

  code: Int32Array;
  num: Float64Array;
  now = 0;
  matchSeed = 0;
  closing = false;
  started = false;

  private runFn: ((vm: MapEventsVM, f: number, ip: number) => number)[] = [];
  private testFn: ((vm: MapEventsVM, f: number, ip: number) => boolean)[] = [];
  private matchFn: (((vm: MapEventsVM, ip: number, s: number) => boolean) | undefined)[] = [];
  private width: number[] = [];

  private sigCap = 1024;
  sigKind = new Int32Array(this.sigCap); sigKey = new Int32Array(this.sigCap); sigNum = new Float64Array(this.sigCap); sigDepth = new Uint8Array(this.sigCap);
  sigX = new Float64Array(this.sigCap); sigY = new Float64Array(this.sigCap); sigWave = new Int32Array(this.sigCap); sigRow = new Int32Array(this.sigCap);
  sigA = new Int32Array(this.sigCap); sigB = new Int32Array(this.sigCap); sigC = new Int32Array(this.sigCap);
  sigSubject: (MevBody | null)[] = new Array(this.sigCap).fill(null); sigSubjectId: string[] = new Array(this.sigCap).fill('');
  sigOther: (MevBody | null)[] = new Array(this.sigCap).fill(null); sigOtherId: string[] = new Array(this.sigCap).fill(''); sigOtherSide: string[] = new Array(this.sigCap).fill('');
  private sigHead = 0; private sigCount = 0;
  private sigLeft = SIG_PER_STEP; private opsLeft = OPS_PER_STEP;
  private depthNow = 0;
  private fCap = 256;
  fPc = new Int32Array(this.fCap); fRule = new Int32Array(this.fCap); fFlags = new Uint8Array(this.fCap); fDepth = new Uint8Array(this.fCap); fGen = new Int32Array(this.fCap);
  fParent = new Int32Array(this.fCap); fJoin = new Int32Array(this.fCap); fParentGen = new Int32Array(this.fCap); fRow = new Int32Array(this.fCap); fWave = new Int32Array(this.fCap); fKey = new Int32Array(this.fCap);
  fX = new Float64Array(this.fCap); fY = new Float64Array(this.fCap); fNum = new Float64Array(this.fCap); fWaitStart = new Float64Array(this.fCap);
  fLocal = new Float64Array(this.fCap * 8);
  fSubject: (MevBody | null)[] = new Array(this.fCap).fill(null); fSubjectId: string[] = new Array(this.fCap).fill('');
  fOther: (MevBody | null)[] = new Array(this.fCap).fill(null); fOtherId: string[] = new Array(this.fCap).fill(''); fOtherSide: string[] = new Array(this.fCap).fill('');
  fLast: (MevBody | null)[] = new Array(this.fCap).fill(null); fLastId: string[] = new Array(this.fCap).fill('');
  fScene: (Scene | null)[] = new Array(this.fCap).fill(null);
  private fFree: number[] = [];
  private fLive = new Uint8Array(this.fCap);
  private fAlive = 0;

  private hCap = 256; private hN = 0; private hSeq = 0;
  private hTime = new Float64Array(this.hCap); private hOrder = new Float64Array(this.hCap); private hRun = new Int32Array(this.hCap); private hGen = new Int32Array(this.hCap);

  ruleLive: Int32Array; ruleFired: Int32Array; ruleFailed: Int32Array; ruleRan: Int32Array; ruleNth: Int32Array; ruleOff: Uint8Array;
  private ruleLast: Float64Array;
  private ruleRng: Sfc32[] = [];
  private ruleQueue: (QueuedStart[] | null)[] = [];

  private bCap = 256; bN = 0;
  bType = new Int32Array(this.bCap); bForm = new Int32Array(this.bCap); bSlot = new Int32Array(this.bCap); bGroup = new Int32Array(this.bCap); bHoldPlan = new Int32Array(this.bCap); bSpawner = new Int32Array(this.bCap); bAlive = new Uint8Array(this.bCap); bIsTank = new Uint8Array(this.bCap);
  bGrow = new Uint8Array(this.bCap);
  bRef: (MevBody | null)[] = new Array(this.bCap).fill(null); bId: string[] = new Array(this.bCap).fill(''); bName: string[] = new Array(this.bCap).fill(''); bExtra: (number[] | null)[] = new Array(this.bCap).fill(null); bDesign: string[] = new Array(this.bCap).fill('');
  bSide: string[] = new Array(this.bCap).fill('');

  tagCount: Int32Array; typeCount: Int32Array;
  private countsDirty = false;
  private watchLast: Int32Array; private varWas: Uint8Array;
  private varWasSet: Uint8Array;
  private teamWatch = false;
  liveHold = 0; liveOther = 0;
  private designCount = new Map<string, number>();
  typeTouch: (Float64Array | null)[] = [];

  private slotTank: Int32Array;
  slotBody: (MevBody | null)[]; slotBodyId: string[];
  private slotFlips: Int32Array; private slotFlipAt: Float64Array; private slotHeldUntil: Float64Array;
  private formEvolved: Int32Array;

  vars: Float64Array; private scoped = new Map<string, number>();
  private tEnd: Float64Array; private tLeft: Float64Array; private tState: Uint8Array; private tMark: Int32Array;
  private clockNext: Float64Array; private clockLeft: Float64Array;
  private nextClockDue = Infinity;
  private statuses: StatusRow[] = [];
  private freeTags = new Map<string, { b: MevBody; id: string; tags: number[]; dead: boolean }>();
  private freeDropId: string[] = []; private freeDropTag: number[] = [];
  private stayClocks: StayClock[] = [];
  private persistStatus: { status: number; type: number; tag: number }[] = [];

  pPhase: Uint8Array; pWave: Int32Array; pNextAt: Float64Array; pLive: Int32Array; pToBorn: Int32Array; pStreams: Int32Array; pHadHolder: Uint8Array; pAllBorn: Uint8Array; pPausedAt: Float64Array; pWaveAt: Float64Array; pSpecial: (string)[]; pStallFor: Float64Array;
  pRun: Int32Array; private allBornQ: number[] = [];
  pPick: Int32Array;
  private pTotal: Int32Array; private pEmptyNoted: Uint8Array;
  private streams: Stream[] = [];
  private streamPool: Stream[] = [];
  private spNext: Float64Array; private spBorn: Int32Array; private spAlive: Int32Array; private spOn: Uint8Array; private spWant: Int32Array;
  stallNote = '';

  behaviorOn: Uint8Array; zoneSpawnOn: Uint8Array;
  spRowOn: Uint8Array; private spRows: number[] = []; private spRowTeams: string[][] = [];

  t: MevBody[] = []; tId: string[] = []; tn = 0;
  private tScratch: MevBody[] = []; private tScratchId: string[] = [];
  private req: SpawnReq;
  px = 0; py = 0; pArea = -1;

  logOn = false;
  log = new Float64Array(LOG_RING * 5); logHead = 0; logCount = 0;
  trace: string[] | null = null;
  guardLines = 0;
  hudLine = '';

  constructor(public p: Program, public host: MapEventsHost, seed: number) {
    this.code = p.code;
    this.num = p.num;
    this.matchSeed = seed | 0;
    for (const d of KINDS) {
      this.runFn[d.op!] = d.run as never;
      this.testFn[d.op!] = d.test as never;
      this.matchFn[d.op!] = d.match;
      this.width[d.op!] = 1 + Object.keys(d.fields).length;
    }
    const nr = p.rules.length;
    this.ruleLive = new Int32Array(nr); this.ruleFired = new Int32Array(nr); this.ruleFailed = new Int32Array(nr); this.ruleRan = new Int32Array(nr); this.ruleNth = new Int32Array(nr);
    this.ruleOff = new Uint8Array(nr); this.ruleLast = new Float64Array(nr).fill(-Infinity);
    for (let i = 0; i < nr; i++) {
      this.ruleOff[i] = p.rules[i].off ? 1 : 0;
      const r = new Sfc32();
      const id = p.rules[i].id;
      this.ruleRng.push(r.seed(hash32(seed, p.rules[i].doc, id, 1), hash32(seed, p.rules[i].doc, id, 2), hash32(seed, p.rules[i].doc, id, 3), hash32(seed, p.rules[i].doc, id, 4)));
      this.ruleQueue.push(null);
    }
    this.ruleSpawns = new Int32Array(nr);
    this.tagCount = new Int32Array(p.tags.length); this.typeCount = new Int32Array(p.types.length);
    this.typeTouch = p.types.map(t => compileTouch(t.def.touch));
    this.watchLast = new Int32Array(p.watches.length); this.varWas = new Uint8Array(p.varWatches.length); this.varWasSet = new Uint8Array(p.varWatches.length);
    this.teamWatch = p.watches.some(w => !!w.team);
    this.slotTank = new Int32Array(p.slotTankCount);
    this.slotBody = new Array(p.slots.length).fill(null); this.slotBodyId = new Array(p.slots.length).fill('');
    this.slotFlips = new Int32Array(p.slots.length); this.slotFlipAt = new Float64Array(p.slots.length); this.slotHeldUntil = new Float64Array(p.slots.length);
    this.formEvolved = new Int32Array(p.forms.length);
    this.vars = new Float64Array(p.vars.length);
    for (let i = 0; i < p.vars.length; i++) this.vars[i] = p.vars[i].start;
    const nt = p.timers.length;
    this.tEnd = new Float64Array(nt); this.tLeft = new Float64Array(nt); this.tState = new Uint8Array(nt); this.tMark = new Int32Array(nt);
    for (let t = 0; t < nt; t++) if (this.p.timers[t].showOnHud) this.hudTimers.push(t);
    this.hudTimerSec = new Int32Array(this.hudTimers.length).fill(-1);
    this.hudTimerText = this.hudTimers.map(() => '');
    this.clockNext = new Float64Array(p.clocks.length).fill(Infinity); this.clockLeft = new Float64Array(p.clocks.length);
    const np = p.plans.length;
    this.pPhase = new Uint8Array(np); this.pWave = new Int32Array(np); this.pNextAt = new Float64Array(np); this.pLive = new Int32Array(np); this.pToBorn = new Int32Array(np); this.pStreams = new Int32Array(np); this.pHadHolder = new Uint8Array(np); this.pAllBorn = new Uint8Array(np); this.pPausedAt = new Float64Array(np).fill(-1); this.pWaveAt = new Float64Array(np); this.pSpecial = new Array(np).fill(''); this.pStallFor = new Float64Array(np); this.pPick = new Int32Array(np); this.pRun = new Int32Array(np);
    this.pTotal = new Int32Array(np); this.pEmptyNoted = new Uint8Array(np);
    const ns = p.spawners.length;
    this.spNext = new Float64Array(ns).fill(Infinity); this.spBorn = new Int32Array(ns); this.spAlive = new Int32Array(ns); this.spOn = new Uint8Array(ns); this.spWant = new Int32Array(ns);
    this.behaviorOn = new Uint8Array(p.behaviors.length);
    for (let i = 0; i < p.behaviors.length; i++) this.behaviorOn[i] = p.behaviors[i].on ? 1 : 0;
    this.zoneSpawnOn = new Uint8Array(p.zones.length);
    for (let i = 0; i < p.zones.length; i++) this.zoneSpawnOn[i] = p.zones[i].spawnOn ? 1 : 0;
    this.spRowOn = new Uint8Array(p.behaviors.length);
    if (SMALL_FIX.GH470) {
      for (let i = 0; i < p.behaviors.length; i++) {
        const b = p.behaviors[i];
        if (b.k !== 'spawnPlace') continue;
        this.spRows.push(i);
        this.spRowTeams[i] = Array.isArray(b.a.teams) ? (b.a.teams as unknown[]).filter((w): w is string => typeof w === 'string') : [];
        this.spRowOn[i] = b.on && b.a.enabledAtStart !== false ? 1 : 0;
      }
      for (const i of this.spRows) this.zoneSpawnOn[p.behaviors[i].zone] = 0;
      for (const i of this.spRows) if (this.spRowOn[i]) this.zoneSpawnOn[p.behaviors[i].zone] = 1;
    }
    for (let f = this.fCap - 1; f >= 0; f--) this.fFree.push(f);
    this.req = this.blankReq();
    for (const sl of p.slots) {
      const forms = p.types[sl.type].forms;
      for (let l = 0; l < forms.length; l++) this.slotTank[sl.base + l] = p.forms[forms[l]].tankSlot;
    }
    this.rng.seed(seed, 1, 2, 3);
    const stride = refStride();
    this.refLookup = (d, id) => p.refIds.get(d * stride + id);
  }

  private blankReq(): SpawnReq {
    return { typeIdx: -1, formIdx: 0, tank: '', x: 0, y: 0, angle: 0, team: '', camp: 'none', bossTier: false, colourUse: 'file', colourSlot: 0, size: 0, sizeFactor: 1, name: '', showName: null,
      stands: false, canDie: true, seenByBots: true, onLeaderboard: true, onMinimap: true, minimapAll: false, countsAsKill: true, inWalls: false, score: 0, worthNothing: false, killLine: '', brain: 'full', orderIdx: -1, sight: 0,
      birthLook: 'none', crashersIgnore: false, canBeHealed: true, contact: 'tank', pushable: null, health: 0, level: 0, skills: null, classWord: '', graceMs: 0, refill: 'none', placed: false, home: -1, areaIdx: -1, shape: null, touch: null, fromWave: false, noGrowth: false, extraTags: null };
  }

  readRef(id: number): number {
    const f = this._ctxRun;
    const doc = f >= 0 ? this.p.rules[this.fRule[f]].doc : this._ctxDoc;
    const e = this.refLookup(doc, id);
    if (!e) return NaN;
    switch (e.kind) {
      case 'var': return this.varGet(e.idx, f);
      case 'timer': return this.timerLeft(e.idx);
      case 'tag': return this.tagCount[e.idx];
      case 'type': return this.typeCount[e.idx];
      case 'param': return f >= 0 ? this.fLocal[f * 8 + e.idx] : NaN;
    }
    return NaN;
  }
  refLookup: (doc: number, id: number) => { kind: string; idx: number } | undefined = () => undefined;

  numOf(f: number, off: number): number {
    this.setCtx(f);
    return runNum(this.num, off, this);
  }
  private setCtx(f: number): void {
    this._ctxRun = f;
    if (f >= 0) {
      this.wave = this.fWave[f] > 0 ? this.fWave[f] : this.currentWave();
      this.seconds = this.fNum[f];
      this.rng = this.ruleRng[this.fRule[f]];
    } else {
      this.wave = this.currentWave();
      this.seconds = 0;
    }
    if (SMALL_FIX.GH422) this._popGen++;
    else { this._hu = this.host.humans(); this._bo = this.host.bots(); this._pl = this._hu + this._bo; this._popGot = this._popGen; }
  }
  private rngOf(kind: number, doc: number, id: number): Sfc32 {
    const k = (doc * 1000 + kind) * (SMALL_FIX.GH487 ? 1073741824 : 100000000) + id;
    let r = this.ownerRng.get(k);
    if (!r) { r = new Sfc32().seed(hash32(this.matchSeed, kind, doc, id, 1), hash32(this.matchSeed, kind, doc, id, 2), hash32(this.matchSeed, kind, doc, id, 3), hash32(this.matchSeed, kind, doc, id, 4)); this.ownerRng.set(k, r); }
    return r;
  }
  private numOwned(off: number, kind: number, doc: number, id: number): number {
    this.setCtx(-1);
    this._ctxDoc = doc;
    this.rng = this.rngOf(kind, doc, id);
    return runNum(this.num, off, this);
  }
  private numOfPlan(i: number, off: number): number {
    const c = this.p.plans[i];
    if (!SMALL_FIX.GH484) return this.numOwned(off, OWN_PLAN, c.doc, c.id);
    this.setCtx(-1);
    this._ctxDoc = c.doc;
    this.rng = this.rngOf(OWN_PLAN, c.doc, c.id);
    this.wave = this.pWave[i];
    return runNum(this.num, off, this);
  }
  private numOfRule(r: number, off: number): number { this.setCtx(-1); this._ctxDoc = this.p.rules[r].doc; this.rng = this.ruleRng[r]; return runNum(this.num, off, this); }
  private numOfTimer(t: number, off: number): number { const c = this.p.timers[t]; return this.numOwned(off, OWN_TIMER, SMALL_FIX.GH366 ? c.doc : 0, c.id); }
  private numOfSpawner(s: CSpawner, off: number): number { const b = this.p.behaviors[s.behavior]; return this.numOwned(off, OWN_SPAWNER, this.p.zones[s.zone].doc, b.id); }
  private rollCtx: RollCtx = { players: 1, humans: 1, bots: 0, tier: 1, readRef: (id) => this.readRef(id) };
  private refreshRollCtx(): void { this.rollCtx.humans = this.host.humans(); this.rollCtx.bots = this.host.bots(); this.rollCtx.players = this.rollCtx.humans! + this.rollCtx.bots!; this.rollCtx.tier = this.tier; }
  currentWave(): number { for (let i = 0; i < this.pWave.length; i++) if (this.pPhase[i] !== PH_IDLE) return this.pWave[i]; return 0; }
  waveReached(): number {
    for (let i = 0; i < this.pWave.length; i++) {
      const ph = this.pPhase[i];
      if (ph === PH_IDLE) continue;
      return ph === PH_BREAK || ph === PH_DELAY ? this.pWave[i] - 1 : this.pWave[i];
    }
    return 0;
  }

  private logRec(kind: number, rule: number, a: number, b: number): void {
    if (!this.logOn) return;
    const i = this.logHead * 5;
    this.log[i] = this.now; this.log[i + 1] = kind; this.log[i + 2] = rule; this.log[i + 3] = a; this.log[i + 4] = b;
    this.logHead = (this.logHead + 1) % LOG_RING;
    if (this.logCount < LOG_RING) this.logCount++;
  }
  private guard(text: string, rule = -1): void {
    this.guardLines++;
    this.logRec(LOG_GUARD, rule, 0, 0);
    if (this.guardLines <= 64) this.host.logLine(text);
    this.tr('guard ' + text);
  }
  private tr(s: string): void { if (this.trace) this.trace.push(this.now.toFixed(0) + ' ' + s); }

  standEntities(now: number): void {
    this.now = now;
    for (const sl of this.p.slots) {
      if (!sl.placed || sl.off) continue;
      this.bornPlaced(sl.idx, now);
    }
    this.primeWatches();
  }

  private slotSpot(slot: number, local: number): void {
    const sl = this.p.slots[slot], s = sl.spots;
    this.px = sl.x; this.py = sl.y;
    for (let i = 0; i + 2 < s.length; i += 3) if (s[i] === local) { this.px = s[i + 1]; this.py = s[i + 2]; return; }
  }

  private bornPlaced(slot: number, now: number): MevBody | null {
    const sl = this.p.slots[slot];
    const type = this.p.types[sl.type];
    const fi = type.forms[sl.startLocal];
    if (fi === undefined) return null;
    const tank = this.tankOfSlot(slot, sl.startLocal);
    if (!tank) { this.guard(`Map Entity "${sl.name}" names no tank it can find. It does not stand.`); return null; }
    this.fillReq(sl.type, sl.startLocal, tank, type.def.side, false);
    const r = this.req;
    r.placed = true; r.x = sl.x; r.y = sl.y; r.angle = sl.angle; r.home = sl.home; r.areaIdx = sl.areaIdx;
    if (sl.spots.length > 0) { this.slotSpot(slot, sl.startLocal); r.x = this.px; r.y = this.py; }
    r.stands = type.def.stands !== false; r.onLeaderboard = type.def.onLeaderboard === true;
    if (sl.showName !== null) r.showName = sl.showName;
    r.name = this.drawName(sl.type, -1, sl.name);
    const b = this.host.spawnTank(r);
    if (!b) { this.guard(`Map Entity "${sl.name}" could not stand.`); return null; }
    this.registerBody(b, sl.type, fi, slot, -1, -1, -1, r.name, tank, null, !isShapeThing(tank));
    void now;
    return b;
  }

  begin(now: number): void {
    if (this.started) return;
    this.started = true;
    this.now = now;
    this.primeWatches();
    this.emit(this.opTrig('match.started'), 0, 0, null, '', null, '', '', 0, 0, 0, -1, 0, 0, 0);
    const p = this.p;
    for (let i = 0; i < p.slots.length; i++) {
      const b = this.slotBody[i];
      if (!p.slots[i].placed || !b || !this.host.isLive(b, this.slotBodyId[i])) continue;
      this.emit(this.opTrig('body.born'), -1, 0, b, b.id, null, '', '', this.host.posX(b), this.host.posY(b), this.currentWave(), b._mev ?? -1, 0, 0, 0);
    }
    for (let i = 0; i < p.clocks.length; i++) {
      const c = p.clocks[i];
      const d = this.numOfRule(c.rule, c.kind === 'at' ? c.atOff : c.firstOff) * 1000;
      this.clockNext[i] = Number.isFinite(d) ? now + d : Infinity;
      this.clockLeft[i] = c.times > 0 ? c.times : Infinity;
    }
    this.refreshClockDue();
    for (let i = 0; i < p.plans.length; i++) {
      const c = p.plans[i];
      if (c.off) continue;
      this.pWave[i] = c.first;
      if (c.def.start?.on === 'signal') { this.pPhase[i] = PH_IDLE; continue; }
      this.startPlan(i, now);
    }
    for (let i = 0; i < p.spawners.length; i++) {
      const s = p.spawners[i];
      this.spOn[i] = s.on ? 1 : 0;
      if (s.mode === 'signal') continue;
      const d = this.numOfSpawner(s, s.startOff) * 1000;
      this.spNext[i] = now + (Number.isFinite(d) ? d : 0);
    }
  }

  close(): void { this.closing = true; this.scenesDrop(); }
  reset(): void {
    this.closing = true;
    this.scenesDrop();
    this.sigCount = 0;
    this.hN = 0;
    this.streams.length = 0;
  }

  private startPlan(i: number, now: number): void {
    const c = this.p.plans[i];
    const d = this.numOfPlan(i, c.startDelayOff);
    this.pPhase[i] = PH_DELAY;
    this.pNextAt[i] = now + (Number.isFinite(d) ? d * 1000 : 0);
  }

  step(now: number, dtMs: number): void {
    if (this.closing) return;
    this.now = now;
    this.stepBorn = 0;
    this.opsLeft = OPS_PER_STEP;
    this.sigLeft = SIG_PER_STEP;
    this.growIfNeeded();
    this.dtMs = dtMs;
    this.drainDeaths();
    if (this.jN > 0) this.drainJoins();
    if (SMALL_FIX.GH371 && now >= this.scopedSweepAt) this.sweepScoped(now);
    if (SMALL_FIX.GH409 && this.teamWatch) this.countsDirty = true;
    if (SMALL_FIX.GH569 !== 0 && now >= this.sceneCut) this.cutScenes(now);
    if (this.nextClockDue <= now) this.stepClocks(now);
    this.stepTimers(now);
    if (this.statuses.length > 0) this.stepStatuses(now);
    this.settle();
    if (SMALL_FIX.GH384 && this.closing) return;
    this.stepWaves(now);
    this.settle();
    if (SMALL_FIX.GH384 && this.closing) return;
    if (this.p.spawners.length > 0) this.stepSpawners(now);
    this.pump(now);
    if (now >= this.sceneCut) this.cutScenes(now);
    this.refreshOrders(now);
    this.settle();
  }
  private dtMs = 16.67;

  private settle(): void {
    for (let guard = 0; guard < 64; guard++) {
      if (this.countsDirty) this.checkWatches();
      const moved = this.drainSignals();
      const woke = this.wakeDue();
      if (!moved && !woke && !this.countsDirty) return;
      if (this.closing) return;
      if (this.sigLeft <= 0 || this.opsLeft <= 0) return;
    }
  }

  private growIfNeeded(): void {
    if (this.fFree.length < this.fCap / 4 && this.fCap < RUNS_MAX) this.growRuns();
    if (this.sigCount > this.sigCap / 2 && this.sigCap < 65536) this.growSignals();
  }
  private growRuns(): boolean {
    if (this.fCap >= RUNS_MAX) return false;
    {
      const nc = Math.min(this.fCap * 2, RUNS_MAX);
      this.fPc = g32(this.fPc, nc); this.fRule = g32(this.fRule, nc); this.fFlags = g8(this.fFlags, nc); this.fLive = g8(this.fLive, nc); this.fDepth = g8(this.fDepth, nc); this.fGen = g32(this.fGen, nc);
      this.fParent = g32(this.fParent, nc); this.fJoin = g32(this.fJoin, nc); this.fParentGen = g32(this.fParentGen, nc); this.fRow = g32(this.fRow, nc); this.fWave = g32(this.fWave, nc); this.fKey = g32(this.fKey, nc);
      this.fX = g64(this.fX, nc); this.fY = g64(this.fY, nc); this.fNum = g64(this.fNum, nc); this.fWaitStart = g64(this.fWaitStart, nc);
      this.fLocal = g64(this.fLocal, nc * 8);
      for (const a of [this.fSubject, this.fOther, this.fLast] as (MevBody | null)[][]) a.length = nc, a.fill(null, this.fCap);
      this.fScene.length = nc; this.fScene.fill(null, this.fCap);
      for (const a of [this.fSubjectId, this.fOtherId, this.fOtherSide, this.fLastId]) a.length = nc, a.fill('', this.fCap);
      for (let f = nc - 1; f >= this.fCap; f--) this.fFree.push(f);
      this.fCap = nc;
    }
    return true;
  }
  private growSignals(): void {
    const nc = this.sigCap * 2, oc = this.sigCap, head = this.sigHead;
    const re32 = (a: Int32Array) => { const n = new Int32Array(nc); for (let i = 0; i < this.sigCount; i++) n[i] = a[(head + i) % oc]; return n; };
    const re64 = (a: Float64Array) => { const n = new Float64Array(nc); for (let i = 0; i < this.sigCount; i++) n[i] = a[(head + i) % oc]; return n; };
    const reA = <T>(a: T[], fill: T) => { const n: T[] = new Array(nc).fill(fill); for (let i = 0; i < this.sigCount; i++) n[i] = a[(head + i) % oc]; return n; };
    this.sigKind = re32(this.sigKind); this.sigKey = re32(this.sigKey); this.sigNum = re64(this.sigNum); this.sigX = re64(this.sigX); this.sigY = re64(this.sigY); this.sigWave = re32(this.sigWave); this.sigRow = re32(this.sigRow); this.sigA = re32(this.sigA); this.sigB = re32(this.sigB); this.sigC = re32(this.sigC);
    const d = new Uint8Array(nc); for (let i = 0; i < this.sigCount; i++) d[i] = this.sigDepth[(head + i) % oc]; this.sigDepth = d;
    this.sigSubject = reA(this.sigSubject, null); this.sigOther = reA(this.sigOther, null); this.sigSubjectId = reA(this.sigSubjectId, ''); this.sigOtherId = reA(this.sigOtherId, ''); this.sigOtherSide = reA(this.sigOtherSide, '');
    this.sigHead = 0; this.sigCap = nc;
  }

  private opTrig(word: string): number { return TRIG_OPS[word]; }
  private wants(kindOp: number): boolean { const l = this.p.byKind[kindOp]; return !!l && l.length > 0; }

  emit(kind: number, key: number, num: number, subject: MevBody | null, subjectId: string, other: MevBody | null, otherId: string, otherSide: string, x: number, y: number, wave: number, row: number, a: number, b: number, c: number): void {
    if (!this.wants(kind)) return;
    if (this.depthNow >= CHAIN_MAX) { this.guard('A chain of Map Events went ' + CHAIN_MAX + ' deep and was stopped.'); return; }
    if (this.sigCount + this.sigBusy >= this.sigCap) { this.guard('Too many signals at once. One was dropped.'); return; }
    const i = (this.sigHead + this.sigCount) % this.sigCap;
    this.sigKind[i] = kind; this.sigKey[i] = key; this.sigNum[i] = num; this.sigDepth[i] = this.depthNow + 1;
    this.sigSubject[i] = subject; this.sigSubjectId[i] = subjectId; this.sigOther[i] = other; this.sigOtherId[i] = otherId; this.sigOtherSide[i] = otherSide;
    this.sigX[i] = x; this.sigY[i] = y; this.sigWave[i] = wave; this.sigRow[i] = row; this.sigA[i] = a; this.sigB[i] = b; this.sigC[i] = c;
    this.sigCount++;
  }

  private sigBusy = 0;
  private drainSignals(): boolean {
    if (this.sigCount === 0) return false;
    let moved = false;
    while (this.sigCount > 0 && this.sigLeft > 0) {
      const s = this.sigHead;
      this.sigHead = (s + 1) % this.sigCap;
      this.sigCount--;
      this.sigLeft--;
      moved = true;
      const kind = this.sigKind[s];
      const list = this.p.byKind[kind];
      if (!list) continue;
      const m = this.matchFn[kind];
      if (SMALL_FIX.GH414) this.sigBusy = 1;
      for (let i = 0; i < list.length; i++) {
        const tr = list[i];
        if (m && !m(this, tr.ip, s)) continue;
        this.fire(tr.rule, s);
      }
      this.sigBusy = 0;
      this.sigSubject[s] = null; this.sigOther[s] = null;
    }
    if (this.sigCount > 0 && this.sigLeft <= 0) this.tr('signals wait for the next step');
    return moved;
  }

  private fire(r: number, s: number): void {
    this.startRun(r, this.sigSubject[s], this.sigSubjectId[s], this.sigOther[s], this.sigOtherId[s], this.sigOtherSide[s], this.sigX[s], this.sigY[s], this.sigDepth[s], this.sigWave[s], this.sigNum[s], this.sigKey[s], this.sigRow[s], false);
  }

  planWaveMatch(ip: number, s: number): boolean {
    const plan = this.code[ip + 1];
    if (plan === -2) return false;
    if (plan >= 0 && this.sigKey[s] !== plan) return false;
    const ti = this.code[ip + 2];
    if (ti < 0) return true;
    return waveTestHolds(this.p.waveTests[ti], this.sigWave[s]);
  }
  bodyMatch(test: number, s: number): boolean {
    if (test < 0) return true;
    return this.testBody(test, this.sigSubject[s], this.sigRow[s]);
  }
  testBody(test: number, b: MevBody | null, row: number): boolean {
    const c = this.p.tests[test];
    if (c.types.length > 0 && (row < 0 || !c.types.includes(this.bType[row]))) return false;
    if (c.forms.length > 0 && (row < 0 || !c.forms.includes(this.bForm[row]))) return false;
    if (c.tags.length > 0 && !(row >= 0 ? this.rowHasAnyTag(row, c.tags) : b !== null && this.freeHasAnyTag(b.id, c.tags))) return false;
    if (c.groups.length > 0 && (row < 0 || !c.groups.includes(this.bGroup[row]))) return false;
    if (!b) return c.tanks.length === 0 && c.teams.length === 0 && c.colours.length === 0 && c.boss < 0 && c.player < 0;
    if (c.player >= 0 && ((this.host.isPlayer(b) || (c.viewer === 1 && this.host.isViewer !== undefined && this.host.isViewer(b))) ? 1 : 0) !== c.player) return false;
    if (c.boss >= 0 && (this.host.isBoss(b) ? 1 : 0) !== c.boss) return false;
    if (c.tanks.length > 0 && !c.tanks.includes(this.host.tankWordOf(b))) return false;
    if (c.teams.length > 0 && !c.teams.includes(this.host.sideOf(b))) return false;
    if (c.colours.length > 0 && !(TEAM_COLOUR.ON !== 0 && this.host.wearsColour !== undefined && this.host.wearsColour(b, c.colours, c.colours.length))) return false;
    return true;
  }
  rowOnWhitelist(row: number, types: readonly number[] | undefined, tags: readonly number[] | undefined): boolean {
    if (row < 0) return false;
    if (types && types.length > 0 && types.includes(this.bType[row])) return true;
    return !!tags && tags.length > 0 && this.rowHasAnyTag(row, tags);
  }
  freeHasAnyTag(id: string, tags: readonly number[]): boolean {
    if (this.freeTags.size === 0) return false;
    const ft = this.freeTags.get(id);
    if (!ft) return false;
    for (let i = 0; i < ft.tags.length; i++) if (tags.includes(ft.tags[i])) return true;
    return false;
  }
  private rowTagN(row: number, t: number): number {
    let n = 0;
    const f = this.p.forms[this.bForm[row]];
    if (f) for (let i = 0; i < f.tags.length; i++) if (f.tags[i] === t) n++;
    const x = this.bExtra[row];
    if (x) for (let i = 0; i < x.length; i++) if (x[i] === t) n++;
    return n;
  }
  private rowTagsCounted(row: number, d: number): void {
    const f = this.p.forms[this.bForm[row]], x = this.bExtra[row];
    if (f) for (let i = 0; i < f.tags.length; i++) { const t = f.tags[i]; if (f.tags.indexOf(t) === i) this.tagCount[t] += d; }
    if (x) for (let i = 0; i < x.length; i++) { const t = x[i]; if (x.indexOf(t) === i && !(f && f.tags.includes(t))) this.tagCount[t] += d; }
  }
  private freeTagLive(ft: { id: string; tags: number[] }, t: number): number {
    let n = 0;
    for (let i = 0; i < ft.tags.length; i++) if (ft.tags[i] === t) n++;
    for (let i = 0; i < this.freeDropId.length; i++) if (this.freeDropTag[i] === t && this.freeDropId[i] === ft.id) n--;
    return n;
  }
  private rowHasAnyTag(row: number, tags: readonly number[]): boolean {
    const f = this.p.forms[this.bForm[row]];
    if (f) for (let i = 0; i < f.tags.length; i++) if (tags.includes(f.tags[i])) return true;
    const x = this.bExtra[row];
    if (x) for (let i = 0; i < x.length; i++) if (tags.includes(x[i])) return true;
    return false;
  }
  diedMatch(ip: number, s: number): boolean {
    if (!this.bodyMatch(this.code[ip + 1], s)) return false;
    const by = this.code[ip + 2];
    let kr = -1;
    if (SMALL_FIX.GH440) { const k = this.sigOther[s]; const r = k !== null ? (k._mev ?? -1) : -1; if (r >= 0 && this.bRef[r] === k && this.bId[r] === this.sigOtherId[s]) kr = r; }
    if (by >= 0 && !this.testBody(by, this.sigOther[s], kr)) return false;
    const cause = this.code[ip + 3];
    if (cause === 0) return true;
    const got = this.sigA[s];
    if (cause === 4) return got !== CAUSE_BECOME;
    return (cause === 1 && got === CAUSE_HIT) || (cause === 2 && got === CAUSE_AREA) || (cause === 3 && (got === CAUSE_RULE || got === CAUSE_BECOME));
  }
  changedMatch(ip: number, s: number): boolean {
    const row = this.sigRow[s], to0 = this.sigB[s];
    let keep = 0, swapped = false;
    if (SMALL_FIX.GH472 && row >= 0 && row < this.bN && to0 >= 0 && this.bForm[row] !== to0) { keep = this.bForm[row]; this.bForm[row] = to0; swapped = true; }
    const hit = this.bodyMatch(this.code[ip + 1], s);
    if (swapped) this.bForm[row] = keep;
    if (!hit) return false;
    const from = this.code[ip + 2], to = this.code[ip + 3], how = this.code[ip + 4];
    if (from === -2 || to === -2) return false;
    if (from >= 0 && this.sigA[s] !== from) return false;
    if (to >= 0 && this.sigB[s] !== to) return false;
    if (how === 1 && this.sigC[s] !== HowChange.Become) return false;
    if (how === 2 && this.sigC[s] !== HowChange.Morph) return false;
    return true;
  }

  private lastQueued: QueuedStart | null = null;
  startRun(r: number, subject: MevBody | null, subjectId: string, other: MevBody | null, otherId: string, otherSide: string, x: number, y: number, depth: number, wave: number, num: number, key: number, row: number, called: boolean): number {
    this.lastQueued = null;
    const rule = this.p.rules[r];
    if (this.closing) return -1;
    if (SMALL_FIX.GH557 !== 0 && rule.nLocals > 8) return -1;
    if (!called) {
      if (this.ruleOff[r]) return -1;
      this.ruleFired[r]++;
      this.logRec(LOG_FIRED, r, key, wave);
      if (rule.once && this.ruleRan[r] > 0) return -1;
      if (rule.cooldownMs > 0 && this.now - this.ruleLast[r] < rule.cooldownMs) return -1;
      if (rule.everyNth > 0) { const n = ++this.ruleNth[r]; if (n % rule.everyNth !== 0) return -1; }
    }
    if (this.ruleLive[r] >= rule.maxRuns && rule.policy !== 2) { if (rule.policy !== 1) { this.guard(`"${rule.name}" already has ${rule.maxRuns} runs going. A new one was refused.`, r); this.logRec(LOG_REFUSED, r, 0, 0); } return -1; }
    if (rule.policy !== 0 && this.ruleLive[r] > 0) {
      const same = this.liveRunOf(r, rule.perSubject ? subjectId : null);
      if (same >= 0) {
        if (rule.policy === 1) { this.logRec(LOG_REFUSED, r, 1, 0); return -1; }
        if (rule.policy === 2) this.stopRunsOf(r, rule.perSubject ? subjectId : null);
        else if (rule.policy === 3) {
          let q = this.ruleQueue[r];
          if (!q) { q = []; this.ruleQueue[r] = q; }
          if (q.length < 64) {
            const qs: QueuedStart = { rule: r, subject, subjectId, other, otherId, otherSide, x, y, depth, wave, num, key, row, called, alive: !!subject && this.host.isLive(subject, subjectId) };
            q.push(qs);
            this.lastQueued = qs;
          }
          return -1;
        }
      }
    }
    if (this.fFree.length === 0 && !this.growRuns()) { this.guard('Too many runs alive. A new one was refused.', r); return -1; }
    const f = this.fFree.pop()!;
    this.fLive[f] = 1;
    this.fPc[f] = rule.start; this.fRule[f] = r; this.fFlags[f] = rule.outlives ? F_FREE : 0; this.fDepth[f] = depth; this.fParent[f] = -1; this.fJoin[f] = 0; this.fRow[f] = row; this.fWave[f] = wave; this.fKey[f] = key;
    this.fX[f] = x; this.fY[f] = y; this.fNum[f] = num; this.fWaitStart[f] = -1;
    this.fSubject[f] = subject; this.fSubjectId[f] = subjectId; this.fOther[f] = other; this.fOtherId[f] = otherId; this.fOtherSide[f] = otherSide; this.fLast[f] = null; this.fLastId[f] = '';
    if (rule.nLocals > 0) for (let i = 0; i < rule.nLocals; i++) this.fLocal[f * 8 + i] = 0;
    if (!subject || !this.host.isLive(subject, subjectId)) this.fFlags[f] |= F_FREE;
    if (rule.cond !== 0 && !this.evalCond(f, rule.cond)) {
      this.ruleFailed[r]++;
      this.logRec(LOG_COND_FAILED, r, 0, 0);
      this.releaseRun(f);
      return -1;
    }
    this.ruleRan[r]++;
    this.ruleLive[r]++;
    this.fAlive++;
    this.ruleLast[r] = this.now;
    this.logRec(LOG_RAN, r, 0, 0);
    this.tr(`run ${rule.name}`);
    this.pushWake(f, this.now);
    return f;
  }

  private releaseRun(f: number): void {
    this.fGen[f]++;
    this.fLive[f] = 0;
    this.fSubject[f] = null; this.fOther[f] = null; this.fLast[f] = null;
    this.fFree.push(f);
  }

  private liveRunOf(r: number, subjectId: string | null): number {
    for (let f = 0; f < this.fCap; f++) {
      if (!this.fLive[f] || this.fRule[f] !== r) continue;
      if (subjectId !== null && this.fSubjectId[f] !== subjectId) continue;
      return f;
    }
    return -1;
  }
  private stopRunsOf(r: number, subjectId: string | null): void {
    for (let f = 0; f < this.fCap; f++) {
      if (!this.fLive[f] || this.fRule[f] !== r) continue;
      if (subjectId !== null && this.fSubjectId[f] !== subjectId) continue;
      const gen = this.fGen[f];
      this.endRun(f);
      if (SMALL_FIX.GH568 !== 0) this.endChildrenOf(f, gen, r);
    }
  }
  private endChildrenOf(f: number, gen: number, r: number): void {
    for (let c = 0; c < this.fCap; c++) {
      if (!this.fLive[c] || this.fParent[c] !== f || this.fParentGen[c] !== gen || this.fRule[c] !== r) continue;
      const cg = this.fGen[c];
      this.endRun(c);
      this.endChildrenOf(c, cg, r);
    }
  }

  private endRun(f: number): void {
    const sc = this.fScene[f];
    if (sc !== null) { this.fScene[f] = null; if (--sc.runs <= 0 && !(SMALL_FIX.GH492 && sc.kids > 0)) this.sceneDone(sc); }
    const r = this.fRule[f];
    const rule = this.p.rules[r];
    this.ruleLive[r]--;
    this.fAlive--;
    const parent = this.fParent[f];
    if (parent >= 0 && this.fGen[parent] === this.fParentGen[f]) {
      if (--this.fJoin[parent] <= 0 && (this.fFlags[parent] & F_JOINING)) {
        this.fFlags[parent] &= ~F_JOINING;
        this.pushWake(parent, this.now);
      }
    }
    const depth = this.fDepth[f];
    const was = this.depthNow;
    this.depthNow = depth;
    this.emit(this.opTrig('run.ended'), r, 0, this.fSubject[f], this.fSubjectId[f], null, '', '', this.fX[f], this.fY[f], this.fWave[f], this.fRow[f], 0, 0, 0);
    this.depthNow = was;
    this.releaseRun(f);
    const q = this.ruleQueue[r];
    if (q && q.length > 0 && !this.closing) {
      if (SMALL_FIX.GH555 !== 0 && rule.perSubject) {
        for (let k = 0; k < q.length && !this.closing;) {
          const n = q[k];
          if (this.queuedDropped(n)) { q.splice(k, 1); continue; }
          if (this.liveRunOf(r, n.subjectId) >= 0) { k++; continue; }
          q.splice(k, 1);
          const c = this.startRun(n.rule, n.subject, n.subjectId, n.other, n.otherId, n.otherSide, n.x, n.y, n.depth, n.wave, n.num, n.key, n.row, true);
          if (SMALL_FIX.GH515) this.queuedBegun(n, c);
        }
      } else {
        for (let k = SMALL_FIX.GH413 ? q.length : 1; k > 0 && q.length > 0 && !this.closing; k--) {
          const n = q.shift()!;
          if (this.queuedDropped(n)) { k++; continue; }
          const c = this.startRun(n.rule, n.subject, n.subjectId, n.other, n.otherId, n.otherSide, n.x, n.y, n.depth, n.wave, n.num, n.key, n.row, true);
          if (SMALL_FIX.GH515) this.queuedBegun(n, c);
          if (c >= 0) break;
          if (this.ruleLive[r] > 0) break;
        }
      }
    }
    void rule;
  }
  private queuedDropped(n: QueuedStart): boolean {
    const rule = this.p.rules[n.rule];
    const off = SMALL_FIX.GH567 !== 0 && n.called === false && this.ruleOff[n.rule] === 1;
    const dead = SMALL_FIX.GH556 !== 0 && n.alive === true && !rule.outlives && !(n.subject && this.host.isLive(n.subject, n.subjectId));
    if (!off && !dead) return false;
    this.lastQueued = null;
    if (SMALL_FIX.GH515) this.queuedBegun(n, -1);
    return true;
  }
  private queuedBegun(n: QueuedStart, c: number): void {
    const re = this.lastQueued;
    this.lastQueued = null;
    if (c < 0 && re !== null && re !== n) { re.parent = n.parent; re.parentGen = n.parentGen; re.args = n.args; re.skip = n.skip; re.scene = n.scene; if (SMALL_FIX.GH556 !== 0 || SMALL_FIX.GH567 !== 0) { re.called = n.called; re.alive = n.alive; } return; }
    if (c >= 0) {
      if (n.args) for (let i = 0; i < n.args.length && i < 8; i++) this.fLocal[c * 8 + i] = n.args[i];
      const p = n.parent ?? -1;
      if (p >= 0 && this.fLive[p] && this.fGen[p] === n.parentGen) {
        this.fParent[c] = p; this.fParentGen[c] = this.fGen[p];
        this.fFlags[c] |= n.skip ?? 0;
        this.fScene[c] = n.scene ?? null;
        return;
      }
      if (n.scene) { if (--n.scene.runs <= 0 && !(SMALL_FIX.GH492 && n.scene.kids > 0)) this.sceneDone(n.scene); }
      return;
    }
    const p = n.parent ?? -1;
    if (p >= 0 && this.fGen[p] === n.parentGen && --this.fJoin[p] <= 0 && (this.fFlags[p] & F_JOINING)) { this.fFlags[p] &= ~F_JOINING; this.pushWake(p, this.now); }
    if (n.scene) { if (--n.scene.runs <= 0 && !(SMALL_FIX.GH492 && n.scene.kids > 0)) this.sceneDone(n.scene); }
  }

  private pushWake(f: number, at: number): void {
    if (this.hN >= this.hCap) {
      const nc = this.hCap * 2;
      this.hTime = g64(this.hTime, nc); this.hOrder = g64(this.hOrder, nc); this.hRun = g32(this.hRun, nc); this.hGen = g32(this.hGen, nc);
      this.hCap = nc;
    }
    let i = this.hN++;
    const order = ++this.hSeq;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.hTime[p] < at || (this.hTime[p] === at && this.hOrder[p] < order)) break;
      this.hTime[i] = this.hTime[p]; this.hOrder[i] = this.hOrder[p]; this.hRun[i] = this.hRun[p]; this.hGen[i] = this.hGen[p];
      i = p;
    }
    this.hTime[i] = at; this.hOrder[i] = order; this.hRun[i] = f; this.hGen[i] = this.fGen[f];
  }
  private popWake(): void {
    const n = --this.hN;
    if (n <= 0) return;
    const at = this.hTime[n], order = this.hOrder[n], run = this.hRun[n], gen = this.hGen[n];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= n) break;
      if (c + 1 < n && (this.hTime[c + 1] < this.hTime[c] || (this.hTime[c + 1] === this.hTime[c] && this.hOrder[c + 1] < this.hOrder[c]))) c++;
      if (at < this.hTime[c] || (at === this.hTime[c] && order < this.hOrder[c])) break;
      this.hTime[i] = this.hTime[c]; this.hOrder[i] = this.hOrder[c]; this.hRun[i] = this.hRun[c]; this.hGen[i] = this.hGen[c];
      i = c;
    }
    this.hTime[i] = at; this.hOrder[i] = order; this.hRun[i] = run; this.hGen[i] = gen;
  }

  private wakeDue(): boolean {
    let any = false;
    while (this.hN > 0 && this.hTime[0] <= this.now) {
      if (this.opsLeft <= 0) return any;
      const f = this.hRun[0], gen = this.hGen[0];
      this.popWake();
      if (this.fGen[f] !== gen) continue;
      any = true;
      this.resume(f);
      if (this.closing) return true;
    }
    return any;
  }

  private resume(f: number): void {
    if (!(this.fFlags[f] & (F_FREE | F_OWN_KILL))) {
      if (!this.host.isLive(this.fSubject[f], this.fSubjectId[f])) { this.tr(`run ended, subject gone: ${this.p.rules[this.fRule[f]].name}`); this.endRun(f); return; }
    }
    const subj = this.fSubject[f];
    if (subj && this.host.isLive(subj, this.fSubjectId[f])) { this.fX[f] = this.host.posX(subj); this.fY[f] = this.host.posY(subj); }
    this.depthNow = this.fDepth[f];
    const code = this.code;
    let ip = this.fPc[f];
    for (;;) {
      if (--this.opsLeft < 0) {
        this.tr('ops wait for the next step');
        this.fPc[f] = ip;
        this.pushWake(f, this.now + 0.001);
        break;
      }
      const op = code[ip];
      let r: number;
      if (op < OP_JUMP) {
        if (op === OP_END) { this.endRun(f); break; }
        r = this.runFn[op](this, f, ip);
        if (r === NEXT) { ip += this.width[op]; continue; }
        if (r === WAIT) break;
        if (r === END) { this.endRun(f); break; }
        ip = r;
        continue;
      }
      switch (op) {
        case OP_JUMP: ip = code[ip + 1]; continue;
        case OP_IF: ip = this.evalCond(f, code[ip + 1]) ? ip + 3 : code[ip + 2]; continue;
        case OP_PICK: { ip = this.opPick(f, ip); continue; }
        case OP_REPEAT_INIT: {
          const v = this.numOf(f, code[ip + 2]);
          this.fLocal[f * 8 + code[ip + 1]] = Number.isFinite(v) ? Math.floor(v) : 0;
          ip += 3;
          continue;
        }
        case OP_REPEAT_TEST: {
          const i = f * 8 + code[ip + 1];
          if (this.fLocal[i] <= 0) { ip = code[ip + 2]; continue; }
          this.fLocal[i]--;
          ip += 3;
          continue;
        }
        case OP_FOREACH: {
          const after = code[ip + 3], wait = code[ip + 2] === 1;
          this.eachTarget(f, code[ip + 1]);
          let n = 0;
          for (let i = 0; i < this.tn; i++) {
            const c = this.forkRun(f, ip + 4, this.t[i], this.tId[i], wait);
            if (c >= 0) n++;
          }
          if (wait && n > 0) { this.fPc[f] = after; this.fJoin[f] += n; this.fFlags[f] |= F_JOINING; return; }
          ip = after;
          continue;
        }
        case OP_FORK: {
          this.forkRun(f, ip + 2, this.fSubject[f], this.fSubjectId[f], false);
          ip = code[ip + 1];
          continue;
        }
        case OP_WAITUNTIL: {
          const cond = code[ip + 2];
          if (this.fFlags[f] & F_SKIP || this.evalCond(f, cond)) { this.fWaitStart[f] = -1; ip += 3; continue; }
          if (this.fWaitStart[f] < 0) this.fWaitStart[f] = this.now;
          const to = this.numOf(f, code[ip + 1]);
          if (Number.isFinite(to) && to > 0 && this.now - this.fWaitStart[f] >= to * 1000) { this.fWaitStart[f] = -1; ip += 3; continue; }
          this.fPc[f] = ip;
          this.pushWake(f, this.now + 100);
          return;
        }
        case OP_CALL: {
          const rule = code[ip + 1], wait = code[ip + 2] === 1, nargs = code[ip + 3];
          if (rule >= 0) {
            const gen = this.fGen[f];
            const c = this.startRun(rule, this.fSubject[f], this.fSubjectId[f], this.fOther[f], this.fOtherId[f], this.fOtherSide[f], this.fX[f], this.fY[f], this.fDepth[f] + 1, this.fWave[f], this.fNum[f], this.fKey[f], this.fRow[f], true);
            if (SMALL_FIX.GH412 && this.fGen[f] !== gen) return;
            if (c >= 0) {
              for (let i = 0; i < nargs && i < 8; i++) { const v = this.numOf(f, code[ip + 4 + i]); this.fLocal[c * 8 + i] = Number.isFinite(v) ? v : 0; }
              if (this.fDepth[f] + 1 >= CHAIN_MAX) { this.guard('A chain of Custom Actions went ' + CHAIN_MAX + ' deep and was stopped.', this.fRule[f]); this.endRun(c); }
              else if (wait) {
                this.fParent[c] = f; this.fParentGen[c] = this.fGen[f];
                this.fJoin[f]++; this.fFlags[f] |= F_JOINING;
                this.fFlags[c] |= this.fFlags[f] & F_SKIP;
                const sc = this.fScene[f];
                this.fScene[c] = sc;
                if (sc !== null) sc.runs++;
                this.fPc[f] = ip + 4 + nargs;
                return;
              }
            } else if (SMALL_FIX.GH515 && this.lastQueued !== null && this.lastQueued.rule === rule) {
              const qs = this.lastQueued; this.lastQueued = null;
              if (this.fDepth[f] + 1 >= CHAIN_MAX) {
                const q = this.ruleQueue[rule]; const at = q ? q.indexOf(qs) : -1; if (q && at >= 0) q.splice(at, 1);
                this.guard('A chain of Custom Actions went ' + CHAIN_MAX + ' deep and was stopped.', this.fRule[f]);
              } else {
                if (nargs > 0) { const a: number[] = []; for (let i = 0; i < nargs && i < 8; i++) { const v = this.numOf(f, code[ip + 4 + i]); a.push(Number.isFinite(v) ? v : 0); } qs.args = a; }
                if (wait) {
                  qs.parent = f; qs.parentGen = this.fGen[f]; qs.skip = this.fFlags[f] & F_SKIP;
                  this.fJoin[f]++; this.fFlags[f] |= F_JOINING;
                  const sc = this.fScene[f]; qs.scene = sc; if (sc !== null) sc.runs++;
                  this.fPc[f] = ip + 4 + nargs;
                  return;
                }
              }
            }
          }
          ip += 4 + nargs;
          continue;
        }
        case OP_PLAY: {
          const seq = this.p.seqs[code[ip + 1]], wait = code[ip + 2] === 1;
          if (SMALL_FIX.GH433 && this.fDepth[f] + 1 >= CHAIN_MAX) { this.guard('A chain of Sequences went ' + CHAIN_MAX + ' deep and was stopped.', this.fRule[f]); ip += 3; continue; }
          const scene: Scene = { seq, parent: this.fScene[f], until: seq.timeoutMs > 0 ? this.now + seq.timeoutMs : Infinity, runs: 0, kids: 0 };
          let n = 0;
          for (const start of seq.starts) {
            const c = this.forkRunOfRule(f, seq.rule >= 0 ? seq.rule : this.fRule[f], start, this.fSubject[f], this.fSubjectId[f], wait);
            if (c >= 0 && SMALL_FIX.GH433) this.fDepth[c] = this.fDepth[f] + 1;
            if (c >= 0) {
              n++; this.fFlags[c] |= (this.fFlags[f] & F_SKIP) | F_FREE;
              if (scene.parent !== null) scene.parent.runs--;
              this.fScene[c] = scene; scene.runs++;
            }
          }
          if (n > 0) { if (SMALL_FIX.GH492 && scene.parent !== null) scene.parent.kids++; this.scenes.push(scene); this.sceneRefresh(); }
          if (wait && n > 0) { this.fPc[f] = ip + 3; this.fJoin[f] += n; this.fFlags[f] |= F_JOINING; return; }
          ip += 3;
          continue;
        }
        default:
          this.guard('The program reached a word it does not know. The run was ended.', this.fRule[f]);
          this.endRun(f);
          return;
      }
    }
  }

  private forkRun(parent: number, at: number, subject: MevBody | null, subjectId: string, wait: boolean): number {
    return this.forkRunOfRule(parent, this.fRule[parent], at, subject, subjectId, wait);
  }
  private forkRunOfRule(parent: number, r: number, at: number, subject: MevBody | null, subjectId: string, wait: boolean): number {
    if (this.fFree.length === 0 && !this.growRuns()) { this.guard('Too many runs alive. A new one was refused.', r); return -1; }
    const f = this.fFree.pop()!;
    this.fLive[f] = 1;
    this.fPc[f] = at; this.fRule[f] = r; this.fFlags[f] = this.fFlags[parent] & F_SKIP; this.fDepth[f] = this.fDepth[parent]; this.fWaitStart[f] = -1;
    this.fParent[f] = wait ? parent : -1; this.fParentGen[f] = this.fGen[parent]; this.fJoin[f] = 0;
    const sc = this.fScene[parent];
    this.fScene[f] = sc;
    if (sc !== null) sc.runs++;
    this.fRow[f] = subject && (subject._mev ?? -1) >= 0 ? subject._mev! : this.fRow[parent]; this.fWave[f] = this.fWave[parent]; this.fKey[f] = this.fKey[parent];
    this.fNum[f] = this.fNum[parent];
    this.fX[f] = subject && this.host.isLive(subject, subjectId) ? this.host.posX(subject) : this.fX[parent];
    this.fY[f] = subject && this.host.isLive(subject, subjectId) ? this.host.posY(subject) : this.fY[parent];
    this.fSubject[f] = subject; this.fSubjectId[f] = subjectId; this.fOther[f] = this.fOther[parent]; this.fOtherId[f] = this.fOtherId[parent]; this.fOtherSide[f] = this.fOtherSide[parent]; this.fLast[f] = null; this.fLastId[f] = '';
    for (let i = 0; i < 8; i++) this.fLocal[f * 8 + i] = this.fLocal[parent * 8 + i];
    if (this.fFlags[parent] & F_FREE || !subject || !this.host.isLive(subject, subjectId)) this.fFlags[f] |= F_FREE;
    this.ruleLive[r]++;
    this.fAlive++;
    this.pushWake(f, this.now);
    return f;
  }

  evalCond(f: number, ip: number): boolean {
    if (ip === 0) return true;
    const code = this.code;
    const op = code[ip];
    if (op !== OP_CLIST) return this.testFn[op](this, f, ip);
    const mode = code[ip + 1], n = code[ip + 2];
    if (mode === 0 || mode === 2) {
      let all = true;
      for (let i = 0; i < n; i++) if (!this.evalCond(f, code[ip + 4 + i])) { all = false; break; }
      return mode === 0 ? all : !all;
    }
    for (let i = 0; i < n; i++) if (this.evalCond(f, code[ip + 4 + i])) return true;
    return false;
  }
  cmpTest(f: number, ip: number): boolean {
    const a = this.numOf(f, this.code[ip + 1]), b = this.numOf(f, this.code[ip + 3]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) { this.guard('A number test has no answer. It reads as not holding.', this.fRule[f]); return false; }
    return cmpOp(this.code[ip + 2], a, b);
  }
  waveIsTest(f: number, ip: number): boolean {
    const plan = this.code[ip + 1];
    if (plan === -2) return false;
    const w = plan >= 0 ? this.pWave[plan] : this.currentWave();
    const ti = this.code[ip + 2];
    return ti < 0 ? true : waveTestHolds(this.p.waveTests[ti], w);
  }
  chanceTest(f: number, ip: number): boolean {
    const pct = this.numOf(f, this.code[ip + 1]);
    if (!Number.isFinite(pct)) { this.guard('A chance has no answer. It reads as not holding.', this.fRule[f]); return false; }
    return this.ruleRng[this.fRule[f]].next() * 100 < pct;
  }
  aliveTest(f: number, ip: number): boolean { this.eachTarget(f, this.code[ip + 1]); return this.tn > 0; }
  livingLeftTest(): boolean { return this.host.livingLeft(); }
  bodyIsTest(f: number, ip: number): boolean {
    this.eachFactTarget(f, this.code[ip + 1]);
    if (this.tn === 0) return false;
    const b = this.t[0];
    let row = b._mev ?? -1;
    if (SMALL_FIX.GH541 && row < 0 && b === this.fSubject[f]) { const r = this.fRow[f]; if (r >= 0 && this.bId[r] === this.fSubjectId[f]) row = r; }
    return this.testBody(this.code[ip + 2], b, row);
  }
  killerIsTest(f: number, ip: number): boolean {
    const none = this.code[ip + 2] === 1;
    const o = this.fOther[f];
    if (!this.fOtherId[f]) return none;
    return this.testBody(this.code[ip + 1], o && this.host.isLive(o, this.fOtherId[f]) ? o : null, o ? o._mev ?? -1 : -1);
  }
  inAreaTest(f: number, ip: number): boolean {
    const z = this.code[ip + 2];
    this.eachFactTarget(f, this.code[ip + 1]);
    if (this.tn === 0 || z < 0) return false;
    return this.pointInZone(z, this.host.posX(this.t[0]), this.host.posY(this.t[0]));
  }
  darkIsTest(f: number, ip: number): boolean {
    this.eachFactTarget(f, this.code[ip + 1]);
    if (this.tn === 0) return false;
    return this.host.isDark(this.host.posX(this.t[0]), this.host.posY(this.t[0]));
  }
  timerRunning(t: number): boolean { return t >= 0 && this.tState[t] === 1; }
  behaviorIsOn(b: number): boolean { return b >= 0 && this.behaviorOn[b] === 1; }

  pointInZone(z: number, x: number, y: number): boolean {
    const c = this.p.zones[z];
    if (x < c.x0 || x > c.x1 || y < c.y0 || y > c.y1) return false;
    if (c.poly !== null) return polyHas(c.poly, x, y);
    for (let i = 0; i < c.rects.length; i += 4) if (x >= c.rects[i] && x <= c.rects[i + 2] && y >= c.rects[i + 1] && y <= c.rects[i + 3]) return true;
    return false;
  }

  eachTarget(f: number, ti: number): void {
    this.tn = 0;
    if (ti < 0) return;
    const t = this.p.targets[ti];
    this.fillTarget(f, t.w, t.idx, t.word, t.inner, t.nOff, t.how);
  }
  private eachFactTarget(f: number, ti: number): void {
    const w = ti >= 0 ? this.p.targets[ti].w : '';
    this._allowDead = w === 'subject' || w === 'self' || w === 'other' || w === 'killer';
    this.eachTarget(f, ti);
    this._allowDead = false;
  }
  private _allowDead = false;
  private readonly _oneCode: number[] = [0];
  private add(b: MevBody | null, id: string): void {
    if (!b || (this._allowDead ? b.id !== id : !this.host.isLive(b, id))) return;
    this.t[this.tn] = b; this.tId[this.tn] = id; this.tn++;
  }
  private fillTarget(f: number, w: string, idx: number, word: string, inner: number, nOff: number, how: string): void {
    const host = this.host;
    switch (w) {
      case 'subject': this.add(this.fSubject[f], this.fSubjectId[f]); return;
      case 'self': {
        this.add(this.fSubject[f], this.fSubjectId[f]);
        return;
      }
      case 'other':
      case 'killer': this.add(this.fOther[f], this.fOtherId[f]); return;
      case 'lastSpawned': this.add(this.fLast[f], this.fLastId[f]); return;
      case 'player':
      case 'allPlayers': { const b = host.playerBody(); if (b) this.add(b, b.id); return; }
      case 'leader': { const b = host.leader(); if (b) this.add(b, b.id); return; }
      case 'followers': {
        const s = this.subjectNow(f);
        if (!s) return;
        const out = this._followBuf; out.length = 0;
        host.followersOf(s, out);
        for (let i = 0; i < out.length; i++) this.add(out[i], out[i].id);
        out.length = 0;
        return;
      }
      case 'homeMates': {
        const r0 = this.fRow[f];
        const h = r0 >= 0 && this.bSlot[r0] >= 0 ? this.p.slots[this.bSlot[r0]].home : -1;
        if (h < 0) return;
        if (SMALL_FIX.GH362) { for (let k = 0; k < this.liveN; k++) { const r = this.liveRows[k]; if (this.bAlive[r] && this.bSlot[r] >= 0 && this.p.slots[this.bSlot[r]].home === h) this.add(this.bRef[r], this.bId[r]); } }
        else for (let r = 0; r < this.bN; r++) if (this.bAlive[r] && this.bSlot[r] >= 0 && this.p.slots[this.bSlot[r]].home === h) this.add(this.bRef[r], this.bId[r]);
        return;
      }
      case 'allTanks': {
        const b = host.playerBody(); if (b) this.add(b, b.id);
        const list = host.tanks();
        for (let i = 0; i < list.length; i++) this.add(list[i], list[i].id);
        return;
      }
      case 'entity': if (idx >= 0) this.add(this.slotBody[idx], this.slotBodyId[idx]); return;
      case 'type':
        if (idx < 0) return;
        if (SMALL_FIX.GH362) { for (let k = 0; k < this.liveN; k++) { const r = this.liveRows[k]; if (this.bAlive[r] && this.bType[r] === idx) this.add(this.bRef[r], this.bId[r]); } }
        else for (let r = 0; r < this.bN; r++) if (this.bAlive[r] && this.bType[r] === idx) this.add(this.bRef[r], this.bId[r]);
        return;
      case 'tag':
        if (idx < 0) return;
        if (SMALL_FIX.GH362) { for (let k = 0; k < this.liveN; k++) { const r = this.liveRows[k]; if (this.bAlive[r] && this.rowHasTag(r, idx)) this.add(this.bRef[r], this.bId[r]); } }
        else for (let r = 0; r < this.bN; r++) if (this.bAlive[r] && this.rowHasTag(r, idx)) this.add(this.bRef[r], this.bId[r]);
        if (this.freeTags.size > 0) for (const ft of this.freeTags.values()) if (!ft.dead && ft.tags.includes(idx) && host.isLive(ft.b, ft.id)) this.add(ft.b, ft.id);
        return;
      case 'inArea': {
        if (idx < 0) return;
        const b = host.playerBody();
        if (b && this.pointInZone(idx, host.posX(b), host.posY(b))) this.add(b, b.id);
        const list = host.tanks();
        for (let i = 0; i < list.length; i++) { const e = list[i]; if (host.isLive(e, e.id) && this.pointInZone(idx, host.posX(e), host.posY(e))) this.add(e, e.id); }
        return;
      }
      case 'tank': {
        const b = host.playerBody();
        if (b && host.tankWordOf(b) === word) this.add(b, b.id);
        const list = host.tanks();
        for (let i = 0; i < list.length; i++) { const e = list[i]; if (host.isLive(e, e.id) && host.tankWordOf(e) === word) this.add(e, e.id); }
        return;
      }
      case 'colour': {
        if (idx < 0 || TEAM_COLOUR.ON === 0 || host.wearsColour === undefined) return;
        const one = this._oneCode; one[0] = idx;
        const b = host.playerBody();
        if (b && host.wearsColour(b, one, 1)) this.add(b, b.id);
        const list = host.tanks();
        for (let i = 0; i < list.length; i++) { const e = list[i]; if (host.isLive(e, e.id) && host.wearsColour(e, one, 1)) this.add(e, e.id); }
        const nRows = SMALL_FIX.GH362 ? this.liveN : this.bN;
        for (let k = 0; k < nRows; k++) { const r = SMALL_FIX.GH362 ? this.liveRows[k] : k; if (this.bAlive[r] && this.bIsTank[r] === 0 && host.wearsColour(this.bRef[r], one, 1)) this.add(this.bRef[r], this.bId[r]); }
        return;
      }
      case 'team': {
        const b = host.playerBody();
        if (b && host.sideOf(b) === word) this.add(b, b.id);
        const list = host.tanks();
        for (let i = 0; i < list.length; i++) { const e = list[i]; if (host.isLive(e, e.id) && host.sideOf(e) === word) this.add(e, e.id); }
        return;
      }
      case 'pick': {
        if (inner < 0) return;
        const c = this.p.targets[inner];
        this.fillTarget(f, c.w, c.idx, c.word, c.inner, c.nOff, c.how);
        let n = Math.floor(this.numOf(f, nOff));
        if (!Number.isFinite(n) || n < 0) n = 0;
        this.selectN(f, n, how);
        return;
      }
    }
  }
  bodyHasTag(b: MevBody, row: number, tag: number): boolean {
    if (tag < 0) return false;
    if (row >= 0) return this.rowHasTag(row, tag);
    const ft = this.freeTags.size > 0 ? this.freeTags.get(b.id) : undefined;
    return !!ft && ft.tags.includes(tag);
  }
  rowHasTag(r: number, tag: number): boolean {
    const form = this.p.forms[this.bForm[r]];
    if (form && form.tags.includes(tag)) return true;
    const x = this.bExtra[r];
    return !!x && x.includes(tag);
  }
  private selectN(f: number, n: number, how: string): void {
    if (n >= this.tn) return;
    if (how === 'random') {
      const rng = this.ruleRng[this.fRule[f]];
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(rng.next() * (this.tn - i));
        const a = this.t[i], id = this.tId[i];
        this.t[i] = this.t[j]; this.tId[i] = this.tId[j]; this.t[j] = a; this.tId[j] = id;
      }
    } else {
      for (let i = 0; i < n; i++) {
        let best = i, bestV = Infinity;
        for (let j = i; j < this.tn; j++) {
          const b = this.t[j];
          const v = how === 'nearest' ? Math.hypot(this.host.posX(b) - this.fX[f], this.host.posY(b) - this.fY[f]) : this.host.healthShare(b);
          if (v < bestV) { bestV = v; best = j; }
        }
        const a = this.t[i], id = this.tId[i];
        this.t[i] = this.t[best]; this.tId[i] = this.tId[best]; this.t[best] = a; this.tId[best] = id;
      }
    }
    this.tn = n;
  }

  private chipWords(f: number, w: string, all: string): string {
    this.setCtx(f);
    const id = Number(w), v = this.readRef(id);
    if (!Number.isFinite(v)) return all;
    const doc = f >= 0 ? this.p.rules[this.fRule[f]].doc : this._ctxDoc;
    return String(this.refLookup(doc, id)?.kind === 'timer' ? Math.ceil(v) : Math.round(v * 100) / 100);
  }
  expand(f: number, ti: number, keepChips = false): string {
    const s = this.p.texts[ti];
    if (!this.p.textTokens[ti]) return s;
    const esc = keepChips && SMALL_FIX.G697 !== 0;
    return s.replace(/\{([^}]*)\}/g, (all, w: string) => {
      if (/^\d+$/.test(w)) return keepChips ? all : this.chipWords(f, w, all);
      const r = this._expandWord(f, all, w);
      return esc && (r.indexOf('{') >= 0 || r.indexOf('}') >= 0) ? r.replace(/\{/g, '\uE000').replace(/\}/g, '\uE001') : r;
    });
  }
  private _expandWord(f: number, all: string, w: string): string {
    {
      switch (w) {
        case 'wave': return String(this.fWave[f] > 0 ? this.fWave[f] : this.currentWave());
        case 'seconds': return String(Math.floor(this.fNum[f]));
        case 'tier': return String(this.tier);
        case 'name': return this.nameOfSubject(f);
        case 'tank': { const b = this.subjectNow(f); return b ? this.host.shownNameOf(b) : ''; }
        case 'team': { const b = this.subjectNow(f); return b ? this.host.sideShown(this.host.sideOf(b)) : ''; }
        case 'TEAM': { const b = this.subjectNow(f); return b ? this.host.sideShown(this.host.sideOf(b)).toUpperCase() : ''; }
        case 'killer': { const b = this.fOther[f]; return b && this.fOtherId[f] ? this.host.shownNameOf(b) : ''; }
        case 'area': { const k = this.fKey[f]; return k >= 0 && k < this.p.zones.length ? this.p.zones[k].name : ''; }
        case 'count': return String(Math.floor(this.fNum[f]));
        case 'special': { const k = this.fKey[f]; return k >= 0 && k < this.pSpecial.length ? this.pSpecial[k] : ''; }
      }
      return all;
    }
  }
  killLineOf(row: number, b: MevBody): string {
    if (row < 0 || row >= this.bN || this.bId[row] !== b.id) return '';
    if (this.bType[row] < 0) return '';
    const line = this.p.forms[this.bForm[row]].def.killLine ?? this.p.types[this.bType[row]].def.killLine ?? '';
    return line.includes('{') ? line.replace(/\{(name|tank)\}/g, (_all, w: string) => (w === 'name' && this.bName[row]) || this.host.shownNameOf(b)) : line;
  }
  madeLineOf(row: number, b: MevBody, tank: string): string {
    if (row < 0 || row >= this.bN || this.bId[row] !== b.id) return '';
    return this.p.types[this.bType[row]]?.def.madeLines?.[tank] ?? '';
  }
  kindWordOf(row: number, b: MevBody): string {
    if (row < 0 || row >= this.bN || this.bId[row] !== b.id) return '';
    if (this.bType[row] < 0) return '';
    return this.p.types[this.bType[row]].def.classWord || this.p.forms[this.bForm[row]].def.shownName || '';
  }
  ownNameOf(row: number, b: MevBody): string {
    return row >= 0 && row < this.bN && this.bId[row] === b.id ? this.bName[row] : '';
  }
  private nameOfSubject(f: number): string {
    const row = this.fRow[f];
    if (row >= 0 && this.bName[row]) return this.bName[row];
    const b = this.subjectNow(f);
    return b ? this.host.shownNameOf(b) : '';
  }

  opWait(f: number, ip: number): number {
    if (this.fFlags[f] & F_SKIP) return NEXT;
    const d = this.numOf(f, this.code[ip + 1]);
    if (!Number.isFinite(d)) { this.guard(`"${this.p.rules[this.fRule[f]].name}": a Wait has no answer. The wait is skipped.`, this.fRule[f]); return NEXT; }
    this.fPc[f] = ip + 2;
    this.pushWake(f, this.now + Math.max(0, d) * 1000);
    return WAIT;
  }

  opSpawn(f: number, ip: number): number {
    const code = this.code;
    const cards = this.p.cardLists[code[ip + 1]];
    let count = Math.floor(this.numOf(f, code[ip + 2]));
    if (!Number.isFinite(count) || count <= 0) return NEXT;
    if (count > 2000) count = 2000;
    const place = this.p.places[code[ip + 3]];
    if (place.dead) return NEXT;
    const sideWord = code[ip + 4] >= 0 ? this.p.words[code[ip + 4]] : '';
    const name = this.expand(f, code[ip + 5]);
    const tags = this.p.intLists[code[ip + 6]];
    const show = code[ip + 7] === 1;
    const s = this.newStream();
    s.cards = cards; s.place = place; s.zones = place.zones; s.left = count; s.next = this.now; s.step = 0; s.holds = false;
    s.side = sideWord ? { team: sideWord } : null; s.name = name; s.showName = show || null; s.tags = tags;
    const seed = hash32(this.matchSeed, this.p.rules[this.fRule[f]].id, this.ruleRan[this.fRule[f]], this.ruleSpawns[this.fRule[f]]++);
    s.rngCard.seed(seed, hash32(seed, PURPOSE_CARD), 3, 4); s.rngPlace.seed(seed, hash32(seed, PURPOSE_PLACE), 5, 6);
    if (SMALL_FIX.R941 !== 0 && (place.w === 'subject' || place.w === 'point' || place.w === 'homeOf')) {
      const sp = this.numOf(f, code[ip + 8]);
      if (sp > 0 && Number.isFinite(sp)) { s.spread = Math.min(sp, 5000); s.spreadN = count; s.spreadA0 = s.rngPlace.next() * Math.PI * 2; }
    }
    this.spawnFromRun = f;
    if (SMALL_FIX.GH385) {
      const own = this.p.spawnRead?.has(ip) === true;
      this.stepBorn += this.pumpStream(s, own ? PER_STEP_BIRTHS : Math.max(0, PER_STEP_BIRTHS - this.stepBorn));
    } else this.pumpStream(s, PER_STEP_BIRTHS);
    this.spawnFromRun = -1;
    if (SMALL_FIX.GH363 && s.left > 0 && (place.w === 'subject' || place.w === 'point' || place.w === 'homeOf')) {
      s.runRule = this.fRule[f]; s.runX = this.fX[f]; s.runY = this.fY[f];
      s.runHome = place.w === 'homeOf' ? this.homeOfRun(f, place.target) : -1;
    }
    if (s.left > 0) {
      s.srcRule = this.fRule[f]; s.srcIp = ip;
      if (SMALL_FIX.GH547 !== 0 && s.waitingSince >= 0) {
        const L = this.streams;
        for (let i = 0; i < L.length; i++) {
          const q = L[i];
          if (q.srcIp !== ip || q.srcRule !== s.srcRule || q.left <= 0 || q.waitingSince < 0 || s.spread > 0 || q.spread > 0 || q.name !== s.name || q.runX !== s.runX || q.runY !== s.runY
              || q.runHome !== s.runHome || q.runRule !== s.runRule || (q.side?.team ?? '') !== (s.side?.team ?? '')) continue;
          q.left += s.left;
          this.freeStream(s);
          return NEXT;
        }
      }
      this.streams.push(s);
    } else this.freeStream(s);
    return NEXT;
  }
  private spawnFromRun = -1;
  private spreadTurn(s: Stream): number { return s.spreadA0 + 2 * Math.PI * Math.max(0, s.spreadN - s.left) / s.spreadN; }
  private stepBorn = 0;
  private ruleSpawns = new Int32Array(0);
  private _followBuf: MevBody[] = [];
  private killerOf(f: number): MevBody | null {
    const k = this.fOther[f];
    if (k === null || !SMALL_FIX.GH387) return k;
    return k.id === this.fOtherId[f] ? k : null;
  }
  opCopyOf(f: number, ip: number): number {
    const c = this.code;
    const side = c[ip + 2] >= 0 ? this.p.words[c[ip + 2]] : '';
    const tags = this.p.intLists[c[ip + 3]];
    const name = this.expand(f, c[ip + 4]);
    this._allowDead = true;
    this.eachTarget(f, c[ip + 1]);
    this._allowDead = false;
    const n = this.tn;
    if (n === 0) return NEXT;
    const list = this.tScratch, ids = this.tScratchId;
    list.length = 0; ids.length = 0;
    for (let i = 0; i < n; i++) { list.push(this.t[i]); ids.push(this.tId[i]); }
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.id !== ids[i]) continue;
      if (SMALL_FIX.GH386 && !this.roomFor(true)) break;
      const x = this.host.posX(b), y = this.host.posY(b);
      const tank = this.host.tankWordOf(b);
      const nb = this.host.copyBody(b, side === 'killer' ? '' : side);
      if (!nb) { this.guard('Copy Of A Tank: no room or no tank to copy.'); continue; }
      if (side === 'killer') this.host.followSide(nb, this.killerOf(f));
      if (name) this.host.setName(nb, name);
      const row = this.registerBody(nb, -1, -1, -1, -1, -1, -1, name || this.host.shownNameOf(nb), tank, tags.length > 0 ? tags.slice() : null, true);
      this.fLast[f] = nb; this.fLastId[f] = nb.id;
      this.depthNow = 0;
      this.emit(this.opTrig('body.born'), -1, 0, nb, nb.id, null, '', '', x, y, this.currentWave(), row, 0, 0, 0);
    }
    list.length = 0; ids.length = 0;
    return NEXT;
  }
  private bodyJustDied(b: MevBody): boolean { return b !== null && b._mev !== undefined && b._mev >= 0 && this.bAlive[b._mev] === 0; }

  opKill(f: number, ip: number): number {
    this.eachTarget(f, this.code[ip + 1]);
    const share = this.numOf(f, this.code[ip + 2]);
    if (SMALL_FIX.GH434 && !Number.isFinite(share)) { this.guard(`"${this.p.rules[this.fRule[f]].name}": the share of a Kill has no answer. Nobody is killed.`, this.fRule[f]); return NEXT; }
    if (Number.isFinite(share) && share < 100) {
      const keep = this.tn - Math.round(this.tn * Math.max(0, share) / 100);
      const rng = this.ruleRng[this.fRule[f]];
      for (let k = 0; k < keep && this.tn > 0; k++) { const j = Math.floor(rng.next() * this.tn); this.tn--; this.t[j] = this.t[this.tn]; this.tId[j] = this.tId[this.tn]; }
    }
    for (let i = 0; i < this.tn; i++) {
      const b = this.t[i];
      if (b === this.fSubject[f] && this.tId[i] === this.fSubjectId[f]) { this.fFlags[f] |= F_OWN_KILL; this.fX[f] = this.host.posX(b); this.fY[f] = this.host.posY(b); }
      this.host.kill(b, false);
    }
    return NEXT;
  }
  opRemove(f: number, ip: number): number {
    this.eachTarget(f, this.code[ip + 1]);
    for (let i = 0; i < this.tn; i++) {
      const b = this.t[i];
      if (b === this.fSubject[f] && this.tId[i] === this.fSubjectId[f]) { this.fFlags[f] |= F_OWN_KILL; this.fX[f] = this.host.posX(b); this.fY[f] = this.host.posY(b); }
      this.forgetBody(b);
      const id = this.tId[i];
      if (SMALL_FIX.GH514 && (b._mev ?? -1) < 0 && !this.host.isPlayer(b) && this.freeOwns(id)) this.freeDeath(b, id, false);
      this.host.remove(b);
    }
    return NEXT;
  }

  private tankOfSlot(slot: number, local: number): string {
    const sl = this.p.slots[slot];
    const i = sl.base + local;
    const v = this.slotTank[i];
    if (v >= 0) return this.p.tanks[v];
    const pick = this.p.tankPicks[-v - 1];
    if (!pick || pick.list.length === 0) return '';
    const word = weightedWord(pick.list, this.rngFor(slot));
    if (pick.once) {
      const t = this.p.tanks.indexOf(word);
      if (t >= 0) {
        this.slotTank[i] = t;
        if (pick.site) {
          const nf = this.p.types[sl.type].forms.length;
          for (let l = 0; l < nf; l++) { const j = sl.base + l, v2 = this.slotTank[j]; if (j !== i && v2 < 0) { const p2 = this.p.tankPicks[-v2 - 1]; if (p2 && p2.site && samePickList(p2.list, pick.list)) this.slotTank[j] = t; } }
        }
      }
    }
    return word;
  }
  private rngFor(slot: number): Sfc32 { const sl = this.p.slots[slot]; const t = this.p.types[sl.type]; return this.rngOf(OWN_SLOT, t.doc, sl.placed ? sl.id : t.id); }

  private drawName(type: number, row: number, fallback: string): string {
    const def = this.p.types[type].def;
    if (row >= 0 && this.bName[row]) return this.bName[row];
    if (Array.isArray(def.names) && def.names.length > 0) return def.names[Math.floor(this.rngOf(OWN_TYPE, this.p.types[type].doc, this.p.types[type].id).next() * def.names.length)];
    void fallback;
    return '';
  }

  private fillReq(type: number, local: number, tank: string, side: SideSpec | null | undefined, spawned: boolean): void {
    const t = this.p.types[type];
    const def = t.def;
    const form = this.p.forms[t.forms[local]];
    const r = this.req;
    const useSide = form.def.side ?? side ?? def.side;
    r.typeIdx = type; r.formIdx = local; r.tank = tank; r.team = useSide?.team ?? 'againstPlayer'; r.camp = useSide?.camp ?? 'none'; r.bossTier = def.bossTier === true;
    const col = form.def.colour;
    r.colourUse = col?.use ?? 'file'; r.colourSlot = col?.slot ?? 0;
    r.size = typeof form.def.size === 'number' ? form.def.size : 0;
    r.sizeFactor = 1;
    r.name = ''; r.showName = typeof def.showName === 'boolean' ? def.showName : null;
    r.stands = def.stands === true; r.canDie = def.canDie !== false; r.seenByBots = def.seenByBots !== false;
    r.onLeaderboard = def.onLeaderboard !== undefined ? def.onLeaderboard : spawned;
    r.onMinimap = def.onMinimap !== false;
    r.minimapAll = def.minimapAll === true; r.countsAsKill = def.countsAsKill !== false; r.inWalls = def.inWalls === true;
    r.score = typeof form.def.score === 'number' ? form.def.score : typeof def.score === 'number' ? def.score : 0; r.worthNothing = def.worth === 'none';
    r.killLine = form.def.killLine ?? def.killLine ?? '';
    r.brain = def.brain === 'guard' ? 'none' : def.brain ?? 'full';
    if (SMALL_FIX.R900 !== 0) { r.orderIdx = form.orderIdx; r.sight = typeof def.sight === 'number' ? def.sight : 0; }
    r.birthLook = def.birthLook === 'food' ? 'food' : 'none'; r.crashersIgnore = def.crashersIgnore === true; r.canBeHealed = def.canBeHealed !== false; r.contact = def.contact === 'shape' ? 'shape' : 'tank';
    r.pushable = typeof def.pushable === 'boolean' ? def.pushable : null; r.health = typeof def.health === 'number' ? def.health : 0; r.level = typeof def.level === 'number' ? def.level : 0; r.skills = def.skills ?? null; r.classWord = def.classWord ?? '';
    r.shape = def.shape ?? null; r.touch = this.typeTouch[type] ?? null;
    r.graceMs = 0; r.refill = 'none'; r.placed = false; r.home = -1; r.areaIdx = -1;
    r.fromWave = false; r.noGrowth = false;
    r.x = 0; r.y = 0; r.angle = 0; r.faced = false;
  }

  private liveRows = new Int32Array(64); private liveN = 0;
  private liveDrop(row: number): void {
    let lo = 0, hi = this.liveN - 1;
    const L = this.liveRows;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, v = L[mid];
      if (v === row) { L.copyWithin(mid, mid + 1, this.liveN); this.liveN--; return; }
      if (v < row) lo = mid + 1; else hi = mid - 1;
    }
  }
  private registerBody(b: MevBody, type: number, form: number, slot: number, group: number, holdPlan: number, spawner: number, name: string, design: string, extra: number[] | null, isTank: boolean): number {
    if (this.bN >= this.bCap) this.growBodies();
    const row = this.bN++;
    if (SMALL_FIX.GH362) { if (this.liveN >= this.liveRows.length) this.liveRows = g32(this.liveRows, this.liveRows.length * 2); this.liveRows[this.liveN++] = row; }
    b._mev = row;
    this.bType[row] = type; this.bForm[row] = form; this.bSlot[row] = slot; this.bGroup[row] = group; this.bHoldPlan[row] = holdPlan; this.bSpawner[row] = spawner; this.bAlive[row] = 1; this.bIsTank[row] = isTank ? 1 : 0; this.bGrow[row] = 0;
    this.bRef[row] = b; this.bId[row] = b.id; this.bName[row] = name; this.bExtra[row] = extra; this.bDesign[row] = design;
    this.bSide[row] = !isTank && type >= 0 ? this.req.team : '';
    if (SMALL_FIX.R895 !== 0 && !isTank && type >= 0) {
      const fd = form >= 0 ? this.p.forms[form] : undefined, td = this.p.types[type];
      if (!((fd && fd.def.side) || (td && td.def.side))) this.bSide[row] = 'neutral';
    }
    if (type >= 0) this.typeCount[type]++;
    const f = this.p.forms[form];
    if (SMALL_FIX.GH449) this.rowTagsCounted(row, 1);
    else {
      if (f) for (let i = 0; i < f.tags.length; i++) this.tagCount[f.tags[i]]++;
      if (extra) for (let i = 0; i < extra.length; i++) this.tagCount[extra[i]]++;
    }
    if (slot >= 0 && this.p.slots[slot].placed) { this.slotBody[slot] = b; this.slotBodyId[slot] = b.id; }
    if (holdPlan >= 0) { this.pLive[holdPlan]++; }
    if (isTank && !(slot >= 0 && this.p.slots[slot].placed)) { if (holdPlan >= 0) this.liveHold++; else this.liveOther++; }
    if (spawner >= 0) { this.spAlive[spawner]++; this.spBorn[spawner]++; }
    if (design) this.designCount.set(design, (this.designCount.get(design) ?? 0) + 1);
    this.countsDirty = true;
    if (this.persistStatus.length > 0) for (const ps of this.persistStatus) {
      if ((ps.type >= 0 && ps.type === type) || (ps.tag >= 0 && this.rowHasTag(row, ps.tag))) this.applyStatus(ps.status, b, b.id, row, -1);
    }
    return row;
  }
  private growBodies(): void {
    const nc = this.bCap * 2;
    this.bType = g32(this.bType, nc); this.bForm = g32(this.bForm, nc); this.bSlot = g32(this.bSlot, nc); this.bGroup = g32(this.bGroup, nc); this.bHoldPlan = g32(this.bHoldPlan, nc); this.bSpawner = g32(this.bSpawner, nc); this.bAlive = g8(this.bAlive, nc); this.bIsTank = g8(this.bIsTank, nc); this.bGrow = g8(this.bGrow, nc);
    const was = this.bCap;
    this.bRef.length = nc; this.bRef.fill(null, was); this.bId.length = nc; this.bId.fill('', was); this.bName.length = nc; this.bName.fill('', was); this.bExtra.length = nc; this.bExtra.fill(null, was); this.bDesign.length = nc; this.bDesign.fill('', was);
    this.bSide.length = nc; this.bSide.fill('', was);
    this.bCap = nc;
  }

  private bookDeath(row: number): void {
    if (row < 0 || !this.bAlive[row]) return;
    this.bAlive[row] = 0;
    if (SMALL_FIX.GH362) this.liveDrop(row);
    const type = this.bType[row];
    if (type >= 0) this.typeCount[type]--;
    if (SMALL_FIX.GH449) this.rowTagsCounted(row, -1);
    else {
      const f = this.p.forms[this.bForm[row]];
      if (f) for (let i = 0; i < f.tags.length; i++) this.tagCount[f.tags[i]]--;
      const x = this.bExtra[row];
      if (x) for (let i = 0; i < x.length; i++) this.tagCount[x[i]]--;
    }
    const hold = this.bHoldPlan[row];
    if (hold >= 0) this.pLive[hold]--;
    const slot = this.bSlot[row];
    if (this.bIsTank[row] && !(slot >= 0 && this.p.slots[slot].placed)) { if (hold >= 0) this.liveHold--; else this.liveOther--; }
    const sp = this.bSpawner[row];
    if (sp >= 0) this.spAlive[sp]--;
    const d = this.bDesign[row];
    if (d) { const n = (this.designCount.get(d) ?? 1) - 1; if (n <= 0) this.designCount.delete(d); else this.designCount.set(d, n); }
    this.bRef[row] = null;
    this.countsDirty = true;
    if (this.statuses.length > 0) this.statusesOnDeath(row);
  }
  private forgetBody(b: MevBody): void { const row = b._mev ?? -1; if (row >= 0) this.bookDeath(row); }

  private dN = 0;
  private dBody: (MevBody | null)[] = []; private dId: string[] = []; private dKiller: (MevBody | null)[] = []; private dKillerId: string[] = []; private dKillerSide: string[] = [];
  private dX: number[] = []; private dY: number[] = []; private dCause: number[] = []; private dRow: number[] = []; private dIsPlayer: boolean[] = [];

  noteDeath(b: MevBody, killer: MevBody | null, killerId: string, killerSide: string, cause: number, x: number, y: number, isPlayer: boolean): void {
    if (this.closing) return;
    const row = b._mev ?? -1;
    if (row < 0 && !this.p.wantAnyDeath && !isPlayer && !this.freeOwns(b.id)) return;
    const n = this.dN++;
    this.dBody[n] = b; this.dId[n] = b.id; this.dKiller[n] = killer; this.dKillerId[n] = killerId; this.dKillerSide[n] = killerSide; this.dX[n] = x; this.dY[n] = y; this.dCause[n] = cause; this.dRow[n] = row; this.dIsPlayer[n] = isPlayer;
  }
  noteKiller(id: string, killer: MevBody, killerId: string, side: string): void {
    for (let i = this.dN - 1; i >= 0; i--) {
      if (this.dId[i] !== id) continue;
      this.dKiller[i] = killer; this.dKillerId[i] = killerId; this.dKillerSide[i] = side;
      return;
    }
  }
  reqOnWhitelist(typeIdx: number, formIdx: number, types: readonly number[] | undefined, tags: readonly number[] | undefined): boolean {
    if (types && types.includes(typeIdx)) return true;
    if (!tags) return false;
    const f = this.p.forms[this.p.types[typeIdx].forms[formIdx]];
    if (f) for (let i = 0; i < f.tags.length; i++) if (tags.includes(f.tags[i])) return true;
    return false;
  }
  private jN = 0;
  private jBody: (MevBody | null)[] = []; private jId: string[] = [];
  wantsJoins(): boolean { return this.wants(this.opTrig('bot.joined')); }
  noteBotJoined(b: MevBody): void {
    if (this.closing || !this.wantsJoins()) return;
    const n = this.jN++;
    this.jBody[n] = b; this.jId[n] = b.id;
  }
  private drainJoins(): void {
    const n = this.jN;
    this.jN = 0;
    const op = this.opTrig('bot.joined');
    for (let i = 0; i < n; i++) {
      const b = this.jBody[i];
      this.jBody[i] = null;
      if (b === null || !this.host.isLive(b, this.jId[i])) continue;
      this.depthNow = 0;
      this.emit(op, 0, 0, b, this.jId[i], null, '', '', this.host.posX(b), this.host.posY(b), this.currentWave(), -1, 0, 0, 0);
    }
  }
  notePlayerSpawned(b: MevBody): void {
    if (this.closing) return;
    if (SMALL_FIX.GH406) (b as MevBody & { _mevIn?: number })._mevIn = 0;
    if (this.statuses.length > 0) this.statusesOnTankChange(-1, b);
    this.depthNow = 0;
    this.emit(this.opTrig('player.spawned'), 0, 0, b, b.id, null, '', '', this.host.posX(b), this.host.posY(b), this.currentWave(), -1, 0, 0, 0);
  }

  private drainDeaths(): void {
    if (this.freeDropId.length > 0) this.freeDrop();
    const n = this.dN;
    if (n === 0) return;
    this.dN = 0;
    const died = this.opTrig('body.died'), pdied = this.opTrig('player.died');
    for (let i = 0; i < n; i++) {
      const row = this.dRow[i];
      this.bookDeath(row);
      const subject = this.dBody[i];
      const owned = SMALL_FIX.GH394 && row < 0 && subject !== null && !this.dIsPlayer[i] && this.freeOwns(this.dId[i]);
      if (row < 0 && subject !== null) this.freeDeath(subject, this.dId[i], this.dIsPlayer[i]);
      if (SMALL_FIX.GH405 && this.dIsPlayer[i]) {
        const pid = this.dId[i];
        for (let f = 0; f < this.fCap; f++) if (this.fLive[f] && this.fSubjectId[f] === pid && !(this.fFlags[f] & (F_FREE | F_OWN_KILL))) this.endRun(f);
      }
      if (row < 0 && !this.dIsPlayer[i] && !this.p.wantAnyDeath && !owned) { this.dBody[i] = null; this.dKiller[i] = null; continue; }
      this.logRec(LOG_DEATH, -1, row, this.dCause[i]);
      const kind = this.dIsPlayer[i] ? pdied : died;
      this.depthNow = 0;
      this.emit(kind, 0, 0, subject, this.dId[i], this.dKiller[i], this.dKillerId[i], this.dKillerSide[i], this.dX[i], this.dY[i], this.currentWave(), row, this.dCause[i], 0, 0);
      this.dBody[i] = null; this.dKiller[i] = null;
    }
  }
  ownsFree(id: string): boolean { return (this.statuses.length > 0 || this.freeTags.size > 0) && this.freeOwns(id); }
  ruleCanStart(r: number): boolean { return !this.ruleOff[r] && !(this.p.rules[r].once && this.ruleRan[r] > 0); }
  private freeOwns(id: string): boolean {
    if (this.freeTags.has(id)) return true;
    for (let i = 0; i < this.statuses.length; i++) if (this.statuses[i].id === id) return true;
    return false;
  }
  private freeDeath(b: MevBody, id: string, isPlayer: boolean): void {
    const list = this.statuses;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.row >= 0 || s.id !== id) continue;
      const ends = this.p.statuses[s.status].endsOnDeath;
      if (!ends && isPlayer) continue;
      if (ends) this.statusEffects(s.status, s.body, -1, false, false, true);
      if (isPlayer) this.freeDropOf(id, s.status);
      list.splice(i, 1);
    }
    if (!isPlayer) {
      const ft = this.freeTags.get(id);
      if (ft && !ft.dead) {
        ft.dead = true;
        for (let k = 0; k < ft.tags.length; k++) {
          const t = ft.tags[k];
          if (!SMALL_FIX.GH449 || (ft.tags.indexOf(t) === k && this.freeTagLive(ft, t) > 0)) this.tagCount[t]--;
          this.freeDropId.push(id); this.freeDropTag.push(t);
        }
        this.countsDirty = true;
      }
    }
  }
  private freeDropOf(id: string, si: number): void {
    const ft = this.freeTags.get(id);
    if (!ft) return;
    for (const e of this.p.statuses[si].effects) {
      if (e.k !== 'tag' || e.tag < 0 || !ft.tags.includes(e.tag)) continue;
      if (SMALL_FIX.GH449) { const live = this.freeTagLive(ft, e.tag); if (live <= 0) continue; if (live === 1) this.tagCount[e.tag]--; }
      else this.tagCount[e.tag]--;
      this.freeDropId.push(id); this.freeDropTag.push(e.tag); this.countsDirty = true;
    }
  }
  private freeDrop(): void {
    for (let i = 0; i < this.freeDropId.length; i++) {
      const id = this.freeDropId[i];
      const ft = this.freeTags.get(id);
      if (!ft) continue;
      const k = ft.tags.indexOf(this.freeDropTag[i]);
      if (k >= 0) ft.tags.splice(k, 1);
      if (ft.tags.length === 0) this.freeTags.delete(id);
    }
    this.freeDropId.length = 0; this.freeDropTag.length = 0;
  }
  private freeTagsOff(si: number, id: string): void {
    const ft = this.freeTags.get(id);
    if (!ft) return;
    for (const e of this.p.statuses[si].effects) {
      if (e.k !== 'tag' || e.tag < 0) continue;
      const i = ft.tags.indexOf(e.tag);
      if (i >= 0) { ft.tags.splice(i, 1); if (!ft.dead && (!SMALL_FIX.GH449 || this.freeTagLive(ft, e.tag) === 0)) this.tagCount[e.tag]--; this.countsDirty = true; }
    }
    if (ft.tags.length === 0) this.freeTags.delete(id);
  }

  opLinkBecome(f: number, ip: number): number {
    const form = this.p.forms[this.code[ip + 1]];
    const link = this.p.links[this.code[ip + 2]];
    if (link.to === -2) return NEXT;
    const row = this.fRow[f];
    const slot = row >= 0 ? this.bSlot[row] : this.p.types[form.type].slot;
    return this.doBecome(f, ip, form.type, form.idx, link.to === -1 ? form.local : link.to, slot, link, row);
  }

  private doBecome(f: number, ip: number, type: number, fromForm: number, toLocal: number, slot: number, link: { team: string; fallback: string; graceOff: number; among: number[]; refill: 'none' | 'shield' | 'all' }, row: number): number {
    const now = this.now;
    const p = this.p;
    if (slot >= 0) {
      if (now < this.slotHeldUntil[slot]) { this.fPc[f] = ip; this.pushWake(f, this.slotHeldUntil[slot]); return WAIT; }
      if (now - this.slotFlipAt[slot] >= 1000) { this.slotFlipAt[slot] = now; this.slotFlips[slot] = 0; }
      if (++this.slotFlips[slot] > FLIPS_MAX) {
        this.slotHeldUntil[slot] = now + 1000;
        this.guard(`"${p.types[type].name}" keeps changing back and forth (over ${FLIPS_MAX} times a second). It is held for a second. Is it standing on something that kills it?`, this.fRule[f]);
        this.fPc[f] = ip;
        this.pushWake(f, now + 1000);
        return WAIT;
      }
    }
    const t = p.types[type];
    const toFi = t.forms[toLocal];
    const toForm = p.forms[toFi];
    const tank = slot >= 0 ? this.tankOfSlot(slot, toLocal) : '';
    if (!tank) { this.guard(`"${t.name}": its next form has no tank it can find. It stays dead.`, this.fRule[f]); return NEXT; }
    let side: SideSpec = toForm.side;
    if (link.team === 'killer') {
      const k = this.fOtherSide[f];
      if (k) side = { team: k, camp: side.camp };
      else if (link.fallback) side = { team: link.fallback, camp: side.camp };
    }
    this.fillReq(type, toLocal, tank, side, false);
    const r = this.req;
    if (row >= 0 && this.bGrow[row] !== 0) { r.fromWave = true; r.noGrowth = this.bGrow[row] === 2; }
    r.team = side.team;
    r.camp = side.camp ?? 'none';
    r.x = this.fX[f]; r.y = this.fY[f];
    const sl = slot >= 0 ? p.slots[slot] : null;
    r.angle = sl ? sl.angle : 0;
    r.home = sl ? sl.home : -1; r.areaIdx = sl ? sl.areaIdx : -1; r.placed = !!sl && sl.placed;
    if (sl && sl.placed) { r.stands = t.def.stands !== false; r.onLeaderboard = t.def.onLeaderboard === true; if (sl.showName !== null) r.showName = sl.showName; }
    if (link.graceOff >= 0) { const g = this.numOf(f, link.graceOff); if (Number.isFinite(g) && g > 0) r.graceMs = g * 1000; }
    if (sl && sl.placed && sl.spots.length > 0 && link.among.length === 0) { this.slotSpot(slot, toLocal); r.x = this.px; r.y = this.py; }
    if (link.among.length > 0) {
      const z = link.among[Math.floor(this.ruleRng[this.fRule[f]].next() * link.among.length)];
      if (this.drawInZone(z, this.ruleRng[this.fRule[f]], 'random')) { r.x = this.px; r.y = this.py; }
    }
    if (!this.host.spotFree(r.x, r.y, r, 0, 0, r.placed && link.among.length === 0)) {
      this.guard(`"${t.name}" cannot change here: this spot would hurt what it becomes. It waits a second.`, this.fRule[f]);
      this.fPc[f] = ip;
      this.pushWake(f, now + 1000);
      return WAIT;
    }
    r.name = this.drawName(type, row, sl ? sl.name : '');
    const b = this.host.spawnTank(r);
    if (!b) { this.guard(`"${t.name}" could not change: the engine refused the body.`, this.fRule[f]); return NEXT; }
    const nr = this.registerBody(b, type, toFi, slot, row >= 0 ? this.bGroup[row] : -1, -1, -1, r.name, tank, null, !isShapeThing(tank));
    if (r.fromWave) this.bGrow[nr] = r.noGrowth ? 2 : 1;
    this.fLast[f] = b; this.fLastId[f] = b.id;
    this.tr(`became ${toForm.name} at ${r.x.toFixed(0)},${r.y.toFixed(0)} side ${r.team}`);
    this.emit(this.opTrig('body.changed'), 0, 0, b, b.id, this.fOther[f], this.fOtherId[f], this.fOtherSide[f], r.x, r.y, this.currentWave(), nr, fromForm, toFi, HowChange.Become);
    return NEXT;
  }

  opAfterLink(f: number, ip: number): number {
    const form = this.p.forms[this.code[ip + 1]];
    const link = this.p.links[this.code[ip + 2]];
    const b = this.fSubject[f];
    if (!b || !this.host.isLive(b, this.fSubjectId[f])) {
      if (SMALL_FIX.GH372 && (this.fFlags[f] & F_OWN_KILL) && form.afterHow !== 'morph') {
        const r0 = this.fRow[f];
        return this.doBecome(f, ip, form.type, form.idx, link.to, r0 >= 0 ? this.bSlot[r0] : this.p.types[form.type].slot, link, r0);
      }
      return NEXT;
    }
    const row = this.fRow[f];
    if (SMALL_FIX.GH374 && row >= 0 && this.bForm[row] !== form.idx) return NEXT;
    const slot = row >= 0 ? this.bSlot[row] : this.p.types[form.type].slot;
    if (form.afterHow === 'morph') { this.morphBody(b, row, form.type, link.to, slot, link.refill); return NEXT; }
    this.fFlags[f] |= F_OWN_KILL;
    this.fX[f] = this.host.posX(b); this.fY[f] = this.host.posY(b);
    this.host.kill(b, false, true);
    return this.doBecome(f, ip, form.type, form.idx, link.to, slot, link, row);
  }

  private morphBody(b: MevBody, row: number, type: number, toLocal: number, slot: number, refill: 'none' | 'shield' | 'all'): void {
    const p = this.p;
    const t = p.types[type];
    const toFi = t.forms[toLocal];
    const tank = slot >= 0 ? this.tankOfSlot(slot, toLocal) : '';
    if (!tank) { this.guard(`"${t.name}": the form it should change to has no tank it can find.`); return; }
    const side = p.forms[toFi].def.side ?? null;
    this.fillReq(type, toLocal, tank, side, row >= 0 && this.bSlot[row] === t.slot);
    const r = this.req;
    r.refill = refill;
    if (side === null) r.team = this.host.sideOf(b);
    const sl = slot >= 0 ? p.slots[slot] : null;
    if (sl && sl.placed) { r.placed = true; r.stands = t.def.stands !== false; r.onLeaderboard = t.def.onLeaderboard === true; if (sl.showName !== null) r.showName = sl.showName; }
    r.x = this.host.posX(b); r.y = this.host.posY(b);
    const fromFi = row >= 0 ? this.bForm[row] : -1;
    if (row >= 0) r.name = this.bName[row];
    if (SMALL_FIX.GH436 && !this.host.morph(b, r)) return;
    if (row >= 0) {
      if (SMALL_FIX.GH449) { this.rowTagsCounted(row, -1); this.bForm[row] = toFi; this.rowTagsCounted(row, 1); }
      else {
        const from = p.forms[fromFi];
        if (from) for (let i = 0; i < from.tags.length; i++) this.tagCount[from.tags[i]]--;
        const to = p.forms[toFi];
        for (let i = 0; i < to.tags.length; i++) this.tagCount[to.tags[i]]++;
      }
      this.bForm[row] = toFi;
      const d = this.bDesign[row];
      if (d) { const n = (this.designCount.get(d) ?? 1) - 1; if (n <= 0) this.designCount.delete(d); else this.designCount.set(d, n); }
      this.bDesign[row] = tank;
      this.designCount.set(tank, (this.designCount.get(tank) ?? 0) + 1);
      this.countsDirty = true;
      r.name = this.bName[row];
    }
    if (!SMALL_FIX.GH436) this.host.morph(b, r);
    if (this.statuses.length > 0) this.statusesOnTankChange(row, b);
    this.tr(`changed tank to ${tank} same id`);
    this.emit(this.opTrig('body.changed'), 0, 0, b, b.id, null, '', '', r.x, r.y, this.currentWave(), row, fromFi, toFi, HowChange.Morph);
  }

  opFormTank(f: number, ip: number): number {
    const form = this.p.forms[this.code[ip + 1]];
    const base = this.code[ip + 4] === 1;
    const tankIdx = base ? form.tankSlot : this.code[ip + 2];
    if (!base && tankIdx < 0) return NEXT;
    const type = form.type;
    let changed = false;
    const pickOnce = SMALL_FIX.GH537 && base && tankIdx < 0 ? this.p.tankPicks[-tankIdx - 1] : undefined;
    for (const sl of this.p.slots) {
      if (sl.type !== type) continue;
      const at = sl.base + form.local, cur = this.slotTank[at];
      if (cur === tankIdx) continue;
      if (pickOnce && pickOnce.once && cur >= 0 && pickOnce.list.some(e => e.word === this.p.tanks[cur])) continue;
      this.slotTank[at] = tankIdx; changed = true;
    }
    const tier = this.code[ip + 3];
    if (tier > 0) {
      this.formEvolved[form.idx] = tier - 1;
      let t = 1;
      for (let i = 0; i < this.formEvolved.length; i++) if (this.formEvolved[i] + 1 > t) t = this.formEvolved[i] + 1;
      this.tier = t;
    } else {
      this.formEvolved[form.idx]++;
      const tierNow = this.formEvolved[form.idx] + 1;
      if (tierNow > this.tier) this.tier = tierNow;
    }
    if (!changed) return NEXT;
    for (let r = 0; r < this.bN; r++) {
      if (!this.bAlive[r] || this.bForm[r] !== form.idx || !this.bRef[r]) continue;
      const b = this.bRef[r]!;
      if (!this.host.isLive(b, this.bId[r])) continue;
      this.morphBody(b, r, type, form.local, this.bSlot[r], 'none');
    }
    return NEXT;
  }

  opBecome(f: number, ip: number): number {
    const code = this.code;
    this.eachTarget(f, code[ip + 1]);
    const n = this.tn;
    if (n === 0) return NEXT;
    const fi = code[ip + 2], tankIdx = code[ip + 3], teamWord = code[ip + 4] >= 0 ? this.p.words[code[ip + 4]] : '';
    const grace = this.numOf(f, code[ip + 5]);
    const list = this.t.slice(0, n), ids = this.tId.slice(0, n);
    for (let i = 0; i < n; i++) {
      const b = list[i];
      if (this.host.isPlayer(b)) { this.host.logLine('The player cannot Become: use Change Tank.'); continue; }
      const row = b._mev ?? -1;
      const x = this.host.posX(b), y = this.host.posY(b), side = this.host.sideOf(b);
      if (fi >= 0) {
        const to = this.p.forms[fi];
        const slot = row >= 0 && this.bType[row] === to.type ? this.bSlot[row] : this.p.types[to.type].slot;
        const tank = this.tankOfSlot(slot, to.local);
        if (!tank) { this.guard(`Become: "${to.name}" has no tank it can find.`, this.fRule[f]); continue; }
        this.fillReq(to.type, to.local, tank, teamWord ? { team: teamWord } : to.side, false);
        if (teamWord) this.req.team = teamWord;
        const r = this.req;
        if (row >= 0 && this.bGrow[row] !== 0) { r.fromWave = true; r.noGrowth = this.bGrow[row] === 2; }
        r.x = x; r.y = y; r.graceMs = Number.isFinite(grace) && grace > 0 ? grace * 1000 : 0;
        if (slot >= 0 && this.p.slots[slot].placed && this.p.slots[slot].spots.length > 0) { this.slotSpot(slot, to.local); r.x = this.px; r.y = this.py; }
        if (SMALL_FIX.GH373 && !(slot >= 0 && this.p.slots[slot].placed) && !this.host.spotFree(r.x, r.y, r, 0, 0, false, b)) { this.guard(`Become: "${to.name}" cannot stand here: this spot would hurt it. It stays as it is.`, this.fRule[f]); continue; }
        this.host.kill(b, false, true);
        if (ids[i] === this.fSubjectId[f]) this.fFlags[f] |= F_OWN_KILL;
        const nb = this.host.spawnTank(r);
        if (nb) { const nr = this.registerBody(nb, to.type, fi, slot, -1, -1, -1, '', tank, null, !isShapeThing(tank)); if (r.fromWave) this.bGrow[nr] = r.noGrowth ? 2 : 1; this.fLast[f] = nb; this.fLastId[f] = nb.id; this.emit(this.opTrig('body.changed'), 0, 0, nb, nb.id, null, '', '', x, y, this.currentWave(), nr, row >= 0 ? this.bForm[row] : -1, fi, HowChange.Become); }
      } else if (tankIdx >= 0) {
        const tank = this.p.tanks[tankIdx];
        this.req = this.blankReq();
        const r = this.req;
        r.tank = tank; r.team = teamWord || side; r.x = x; r.y = y; r.graceMs = Number.isFinite(grace) && grace > 0 ? grace * 1000 : 0;
        if (row >= 0 && this.bGrow[row] !== 0) { r.fromWave = true; r.noGrowth = this.bGrow[row] === 2; }
        if (SMALL_FIX.GH373 && !(row >= 0 && this.bSlot[row] >= 0 && this.p.slots[this.bSlot[row]].placed) && !this.host.spotFree(r.x, r.y, r, 0, 0, false, b)) { this.guard(`Become: "${tank}" cannot stand here: this spot would hurt it. It stays as it is.`, this.fRule[f]); continue; }
        this.host.kill(b, false, true);
        if (ids[i] === this.fSubjectId[f]) this.fFlags[f] |= F_OWN_KILL;
        const nb = this.host.spawnTank(r);
        if (nb) { this.fLast[f] = nb; this.fLastId[f] = nb.id; this.emit(this.opTrig('body.changed'), 0, 0, nb, nb.id, null, '', '', x, y, this.currentWave(), -1, -1, -1, HowChange.Become); }
      }
    }
    return NEXT;
  }

  opMorph(f: number, ip: number): number {
    const code = this.code;
    this.eachTarget(f, code[ip + 1]);
    const n = this.tn;
    if (n === 0) return NEXT;
    const fi = code[ip + 2], tankIdx = code[ip + 3], refill = (['none', 'shield', 'all'] as const)[code[ip + 4]] ?? 'none';
    const list = this.t.slice(0, n);
    for (let i = 0; i < n; i++) {
      const b = list[i];
      const row = b._mev ?? -1;
      if (row >= 0 && this.bType[row] < 0 && !this.bIsTank[row]) continue;
      if (fi >= 0) {
        const to = this.p.forms[fi];
        if (row >= 0 && this.bType[row] === to.type) { this.morphBody(b, row, to.type, to.local, this.bSlot[row], refill); continue; }
        const slot = this.p.types[to.type].slot;
        const tank = this.tankOfSlot(slot, to.local);
        if (tank) this.morphBare(b, row, tank, refill);
      } else if (tankIdx >= 0) this.morphBare(b, row, this.p.tanks[tankIdx], refill);
    }
    return NEXT;
  }
  private morphBare(b: MevBody, row: number, tank: string, refill: 'none' | 'shield' | 'all'): void {
    this.req = this.blankReq();
    const r = this.req;
    r.tank = tank; r.refill = refill; r.x = this.host.posX(b); r.y = this.host.posY(b);
    r.team = this.host.sideOf(b);
    if (SMALL_FIX.GH436 && !this.host.morph(b, r)) return;
    if (row >= 0) {
      const d = this.bDesign[row];
      if (d) { const n = (this.designCount.get(d) ?? 1) - 1; if (n <= 0) this.designCount.delete(d); else this.designCount.set(d, n); }
      this.bDesign[row] = tank;
      this.designCount.set(tank, (this.designCount.get(tank) ?? 0) + 1);
    }
    if (!SMALL_FIX.GH436) this.host.morph(b, r);
    if (this.statuses.length > 0) this.statusesOnTankChange(row, b);
    this.emit(this.opTrig('body.changed'), 0, 0, b, b.id, null, '', '', r.x, r.y, this.currentWave(), row, -1, -1, HowChange.Morph);
  }

  opSetTeam(f: number, ip: number): number {
    const w = this.code[ip + 2] >= 0 ? this.p.words[this.code[ip + 2]] : '';
    this.eachTarget(f, this.code[ip + 1]);
    if (w === 'killer') { for (let i = 0; i < this.tn; i++) if (!this.host.followSide(this.t[i], this.killerOf(f))) this.guard('Change Side: the player, a shape or a run with no killer cannot follow one.', this.fRule[f]); return NEXT; }
    if (w) for (let i = 0; i < this.tn; i++) if (!this.host.setSide(this.t[i], w)) this.guard(`The player cannot go to that side here: the side rule of this mode or tank refuses it.`, this.fRule[f]);
    return NEXT;
  }
  opSetName(f: number, ip: number): number {
    const s = this.expand(f, this.code[ip + 2]);
    this.eachTarget(f, this.code[ip + 1]);
    for (let i = 0; i < this.tn; i++) { this.host.setName(this.t[i], s); const row = this.t[i]._mev ?? -1; if (row >= 0) this.bName[row] = s; }
    return NEXT;
  }
  opHeal(f: number, ip: number): number {
    const v = this.numOf(f, this.code[ip + 2]);
    if (!Number.isFinite(v)) return NEXT;
    if (SMALL_FIX.GH441 && v <= 0) return NEXT;
    this.eachTarget(f, this.code[ip + 1]);
    for (let i = 0; i < this.tn; i++) this.host.heal(this.t[i], v, this.code[ip + 3] === 1);
    return NEXT;
  }
  opDamage(f: number, ip: number): number {
    const v = this.numOf(f, this.code[ip + 2]);
    if (!Number.isFinite(v)) return NEXT;
    if (SMALL_FIX.GH441 && v <= 0) return NEXT;
    this.eachTarget(f, this.code[ip + 1]);
    for (let i = 0; i < this.tn; i++) this.host.damage(this.t[i], v, this.code[ip + 3] === 1);
    return NEXT;
  }
  opInvulnerable(f: number, ip: number): number {
    const v = this.numOf(f, this.code[ip + 2]);
    if (!Number.isFinite(v)) return NEXT;
    this.eachTarget(f, this.code[ip + 1]);
    for (let i = 0; i < this.tn; i++) this.host.invulnerable(this.t[i], v);
    return NEXT;
  }
  opInvisible(f: number, ip: number): number {
    this.eachTarget(f, this.code[ip + 1]);
    for (let i = 0; i < this.tn; i++) this.host.invisible(this.t[i], this.code[ip + 2] === 1, this.code[ip + 3]);
    return NEXT;
  }
  opTeleport(f: number, ip: number): number {
    this.eachTarget(f, this.code[ip + 1]);
    const n = this.tn;
    if (n === 0) return NEXT;
    const list = this.t.slice(0, n);
    const place = this.p.places[this.code[ip + 2]];
    for (let i = 0; i < n; i++) {
      const b = list[i];
      if (!this.placeForRun(f, place)) continue;
      this.host.teleport(b, this.px, this.py, this.pArea);
    }
    return NEXT;
  }
  opBodySay(f: number, ip: number): number {
    if (this.fFlags[f] & F_SKIP) return NEXT;
    const s = this.expand(f, this.code[ip + 2]);
    this.eachTarget(f, this.code[ip + 1]);
    for (let i = 0; i < this.tn; i++) this.host.bodySay(this.t[i], s);
    return NEXT;
  }
  opOrder(f: number, ip: number): number {
    let o = this.code[ip + 2];
    if (o < 0) { if (SMALL_FIX.GH411 === 0) return NEXT; o = ORDER_STAND; }
    this.eachTarget(f, this.code[ip + 1]);
    const inScene = (this.sceneWord & SCENE_STOP) !== 0 && this.fScene[f] !== null;
    for (let i = 0; i < this.tn; i++) { this.host.setOrder(this.t[i], o); if (inScene) this.host.sceneMover(this.t[i]); }
    return NEXT;
  }

  private applyStatus(si: number, b: MevBody, id: string, row: number, f: number): void {
    const st = this.p.statuses[si];
    const secs = st.secondsOff >= 0 ? (f >= 0 ? this.numOf(f, st.secondsOff) : this.numOwned(st.secondsOff, OWN_STATUS, SMALL_FIX.GH366 ? st.doc : 0, st.id)) : Infinity;
    if (!(secs > 0)) return;
    const until = secs === Infinity ? Infinity : this.now + secs * 1000;
    for (const rowS of this.statuses) {
      if (rowS.status === si && rowS.id === id) {
        if (st.stack === 0) rowS.until = until;
        else if (st.stack === 1) rowS.until = rowS.until === Infinity || until === Infinity ? Infinity : rowS.until + secs * 1000;
        return;
      }
    }
    this.statuses.push({ status: si, body: b, id, until, row });
    this.statusEffects(si, b, row, true);
  }
  private statusEffects(si: number, b: MevBody, row: number, on: boolean, relay = false, dying = false): void {
    const st = this.p.statuses[si];
    for (const e of st.effects) {
      if (e.k === 'tag') {
        if (relay || dying || e.tag < 0) continue;
        if (row >= 0) {
          let x = this.bExtra[row];
          if (on) { if (!x) { x = []; this.bExtra[row] = x; } x.push(e.tag); if (!SMALL_FIX.GH449 || this.rowTagN(row, e.tag) === 1) this.tagCount[e.tag]++; }
          else if (x) { const i = x.indexOf(e.tag); if (i >= 0) { x.splice(i, 1); if (!SMALL_FIX.GH449 || this.rowTagN(row, e.tag) === 0) this.tagCount[e.tag]--; } }
          this.countsDirty = true;
        } else {
          let ft = this.freeTags.get(b.id);
          if (on) {
            if (!ft) { ft = { b, id: b.id, tags: [], dead: false }; this.freeTags.set(b.id, ft); }
            ft.tags.push(e.tag);
            if (!SMALL_FIX.GH449 || (!ft.dead && this.freeTagLive(ft, e.tag) === 1)) this.tagCount[e.tag]++;
            this.countsDirty = true;
          } else if (ft) {
            const i = ft.tags.indexOf(e.tag);
            if (i >= 0) { ft.tags.splice(i, 1); if (!ft.dead && (!SMALL_FIX.GH449 || this.freeTagLive(ft, e.tag) === 0)) this.tagCount[e.tag]--; this.countsDirty = true; }
            if (ft.tags.length === 0) this.freeTags.delete(b.id);
          }
        }
        continue;
      }
      if (relay && SMALL_FIX.R873 && (COUNTED_KINDS.has(e.k) || (SMALL_FIX.GH552 !== 0 && (e.k === 'guardTag' || e.k === 'attackTag' || e.k === 'takeTag' || e.k === 'spoilTag' || e.k === 'escortTag')))) continue;
      this.host.statusEffect(b, e.k, on, e.a);
    }
  }
  private stepStatuses(now: number): void {
    const list = this.statuses;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.until <= now) {
        const live = this.host.isLive(s.body, s.id);
        const deadHim = !live && s.row < 0 && SMALL_FIX.GH421 && this.host.isPlayer(s.body);
        if (live) this.statusEffects(s.status, s.body, s.row, false);
        else if (s.row < 0) { this.freeTagsOff(s.status, s.id); if (deadHim) this.statusEffects(s.status, s.body, s.row, false, false, true); }
        list.splice(i, 1);
        if ((live || deadHim) && SMALL_FIX.GH360) this.relayKinds(s.status, s.body, s.id);
      }
    }
  }
  private statusesOnDeath(row: number): void {
    const list = this.statuses;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.row !== row) continue;
      if (this.p.statuses[s.status].endsOnDeath) this.statusEffects(s.status, s.body, row, false, false, true);
      list.splice(i, 1);
    }
  }
  noteTankChanged(b: MevBody): void {
    if (this.closing || this.statuses.length === 0) return;
    const r = b._mev ?? -1, row = r >= 0 && r < this.bN && this.bRef[r] === b ? r : -1;
    const list = this.statuses;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.body !== b || !this.p.statuses[s.status].endsOnTankChange) continue;
      this.statusEffects(s.status, b, row, false); list.splice(i, 1); if (SMALL_FIX.GH360) this.relayKinds(s.status, b, s.id);
    }
  }
  private statusesOnTankChange(row: number, b: MevBody): void {
    const list = this.statuses;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.body !== b) continue;
      if (this.p.statuses[s.status].endsOnTankChange) { this.statusEffects(s.status, b, row, false); list.splice(i, 1); if (SMALL_FIX.GH360) this.relayKinds(s.status, b, s.id); }
      else this.statusEffects(s.status, b, row, true, true);
    }
  }
  private relayKinds(si: number, b: MevBody, id: string): void {
    const gone = this.p.statuses[si].effects;
    const list = this.statuses;
    for (let j = 0; j < list.length; j++) {
      const s = list[j];
      if (s.body !== b || s.id !== id) continue;
      const effects = this.p.statuses[s.status].effects;
      for (let k = 0; k < effects.length; k++) {
        const e = effects[k];
        if (e.k === 'tag') continue;
        const counted = SMALL_FIX.GH552 !== 0 && (COUNTED_KINDS.has(e.k) || e.k === 'guardTag' || e.k === 'attackTag' || e.k === 'takeTag' || e.k === 'spoilTag' || e.k === 'escortTag');
        if (!counted && SMALL_FIX.R873 && COUNTED_KINDS.has(e.k)) continue;
        let shared = false;
        for (let g = 0; g < gone.length; g++) if (gone[g].k === e.k) { shared = true; break; }
        if (shared) { if (counted) this.host.statusWords?.(b, e.k, e.a); else this.host.statusEffect(b, e.k, true, e.a); }
      }
    }
  }
  hasStatusEffect(b: MevBody, kind: string): boolean {
    for (const s of this.statuses) if (s.body === b && s.id === b.id && this.p.statuses[s.status].effects.some(e => e.k === kind)) return true;
    return false;
  }

  opStatusAdd(f: number, ip: number): number {
    const si = this.code[ip + 2];
    if (si < 0) return NEXT;
    const ti = this.code[ip + 1];
    const tg = this.p.targets[ti];
    if (tg && (tg.w === 'type' || tg.w === 'tag')) {
      const type = tg.w === 'type' ? tg.idx : -1, tag = tg.w === 'tag' ? tg.idx : -1;
      let had = false;
      if (SMALL_FIX.GH361) for (const q of this.persistStatus) if (q.status === si && q.type === type && q.tag === tag) { had = true; break; }
      if (!had) this.persistStatus.push({ status: si, type, tag });
    }
    this.eachTarget(f, ti);
    for (let i = 0; i < this.tn; i++) this.applyStatus(si, this.t[i], this.tId[i], this.t[i]._mev ?? -1, f);
    return NEXT;
  }
  opStatusRemove(f: number, ip: number): number {
    const si = this.code[ip + 2];
    if (si < 0) return NEXT;
    const ti = this.code[ip + 1];
    const tg = this.p.targets[ti];
    if (tg && (tg.w === 'type' || tg.w === 'tag')) this.persistStatus = this.persistStatus.filter(q => !(q.status === si && q.type === (tg.w === 'type' ? tg.idx : -1) && q.tag === (tg.w === 'tag' ? tg.idx : -1)));
    this.eachTarget(f, ti);
    for (let i = 0; i < this.tn; i++) {
      const id = this.tId[i];
      const list = this.statuses;
      for (let j = list.length - 1; j >= 0; j--) {
        if (list[j].status === si && list[j].id === id) { const body = list[j].body; this.statusEffects(si, body, list[j].row, false); list.splice(j, 1); if (SMALL_FIX.GH360) this.relayKinds(si, body, id); }
      }
    }
    return NEXT;
  }

  opAreaBehaviors(f: number, ip: number): number {
    const code = this.code;
    if (code[ip + 1] === -2) return NEXT;
    const z = code[ip + 1] >= 0 ? code[ip + 1] : this.homeOfRun(f, code[ip + 2]);
    if (z < 0) return NEXT;
    const word = AREA_BEHAVIOR_WORDS[code[ip + 3]];
    const on = code[ip + 4] === 1;
    const flip = code[ip + 5] === 1;
    const list = this.p.behaviors;
    for (let b = 0; b < list.length; b++) if (list[b].zone === z && list[b].k === word) this.setBehavior(b, flip ? !this.behaviorIsOn(b) : on);
    return NEXT;
  }
  private _darkA: Record<string, unknown> = {};
  opDarkness(f: number, ip: number): number {
    const c = this.code;
    const outside = c[ip + 1] === 2;
    const whole = c[ip + 1] === 0 || outside;
    const z = c[ip + 2];
    if (!whole && z < 0) return NEXT;
    const fade = this.numOf(f, c[ip + 4]);
    const a = this._darkA;
    a.circle = this.numOf(f, c[ip + 5]); a.beam = this.numOf(f, c[ip + 6]); a.beamWidth = this.numOf(f, c[ip + 7]); a.gunBeam = this.numOf(f, c[ip + 8]);
    a.walls = c[ip + 9] === 1; a.memory = this.numOf(f, c[ip + 10]); a.feel = c[ip + 11] === 1; a.minimap = c[ip + 12] === 1 ? 'scatter' : 'normal';
    a.followIn = this.numOf(f, c[ip + 13]); a.followOut = this.numOf(f, c[ip + 14]);
    a.crashers = c[ip + 15] === 1; a.viewReach = c[ip + 16] === 1;
    a.spills = c[ip + 17] === 1; a.spillCells = this.numOf(f, c[ip + 18]);
    a.roundLight = this.numOf(f, c[ip + 19]);
    this.host.darkness(outside ? -2 : whole ? -1 : z, c[ip + 3] === 1, Number.isFinite(fade) ? fade : -1, whole ? a : null);
    if (SMALL_FIX.GH427 && !whole) { const bs = this.p.behaviors; for (let i = 0; i < bs.length; i++) if (bs[i].k === 'darkness' && bs[i].zone === z) this.behaviorOn[i] = c[ip + 3] === 1 ? 1 : 0; }
    return NEXT;
  }
  sensors(): { ip: number; rule: number; who: number; what: number; zone: number; thing: number; portal: number; againMs: number }[] {
    const out: { ip: number; rule: number; who: number; what: number; zone: number; thing: number; portal: number; againMs: number }[] = [];
    const list = this.p.byKind[this.opTrig('bot.sees')];
    if (!list) return out;
    const c = this.code;
    for (const tr of list) {
      const again = this.numOfRule(tr.rule, c[tr.ip + 6]);
      out.push({ ip: tr.ip, rule: tr.rule, who: c[tr.ip + 1], what: c[tr.ip + 2], zone: c[tr.ip + 3], thing: c[tr.ip + 4], portal: c[tr.ip + 5], againMs: (Number.isFinite(again) && again > 0 ? again : 30) * 1000 });
    }
    return out;
  }
  botSaw(ip: number, bot: MevBody, other: MevBody | null, key: number, what: number, x: number, y: number): void {
    this.depthNow = 0;
    this.emit(this.opTrig('bot.sees'), key, what, bot, bot.id, other, other ? other.id : '', '', x, y, this.currentWave(), bot._mev ?? -1, 0, 0, ip);
  }
  opBotInterest(f: number, ip: number): number {
    const c = this.code;
    const how = c[ip + 2];
    let zone = c[ip + 3];
    if (zone === -2) return NEXT;
    if (zone < 0) zone = this.fKey[f] >= 0 && this.fKey[f] < this.p.zones.length && this.fNum[f] === 0 ? this.fKey[f] : -1;
    const portal = this.fNum[f] === 0 ? -1 : this.fKey[f];
    let target: MevBody | null = null;
    if (how === 1 || how === 4) { this.eachTarget(f, c[ip + 4]); if (this.tn > 0) target = this.t[0]; if (!target) return NEXT; }
    const tag = c[ip + 6];
    const seconds = this.numOf(f, c[ip + 7]), giveUp = this.numOf(f, c[ip + 8]), giveUpTo = this.numOf(f, c[ip + 10]);
    const toward = c[ip + 9];
    if (how === 4 && toward === 1 && zone < 0) return NEXT;
    this.eachTarget(f, c[ip + 1]);
    for (let i = 0; i < this.tn; i++) this.host.botInterest(this.t[i], how, zone, target, how === 2 ? portal : -1, c[ip + 5], tag, Number.isFinite(seconds) ? seconds : 60, Number.isFinite(giveUp) ? giveUp : 180,
      how === 4 ? toward : 0, Number.isFinite(giveUpTo) ? giveUpTo : 0);
    return NEXT;
  }
  opBehaviorSet(f: number, ip: number): number {
    const b = this.code[ip + 1];
    if (b < 0) return NEXT;
    this.setBehavior(b, this.code[ip + 2] === 1);
    void f;
    return NEXT;
  }
  private setBehavior(b: number, on: boolean): void {
    this.behaviorOn[b] = on ? 1 : 0;
    const beh = this.p.behaviors[b];
    if (beh.k === 'spawnPlace') {
      if (SMALL_FIX.GH470) {
        this.spRowOn[b] = on ? 1 : 0;
        let any = 0;
        for (let i = 0; i < this.spRows.length; i++) { const r = this.spRows[i]; if (this.p.behaviors[r].zone === beh.zone && this.spRowOn[r]) any = 1; }
        this.zoneSpawnOn[beh.zone] = any;
      } else this.zoneSpawnOn[beh.zone] = on ? 1 : 0;
    }
    if (beh.k === 'spawn') for (const s of this.p.spawners) if (s.behavior === b) this.spOn[s.idx] = on ? 1 : 0;
    this.host.behaviorSet(beh.zone, b, on);
  }
  private homeOfRun(f: number, ti: number): number {
    const t = this.p.targets[ti];
    if (t && t.w === 'entity' && t.idx >= 0) return this.p.slots[t.idx].home;
    if (t && (t.w === 'subject' || t.w === 'self')) {
      const row = this.fRow[f];
      return row >= 0 && this.bSlot[row] >= 0 ? this.p.slots[this.bSlot[row]].home : -1;
    }
    if (t && (t.w === 'other' || t.w === 'killer')) {
      const row = this.fOther[f]?._mev ?? -1;
      return row >= 0 && this.bSlot[row] >= 0 ? this.p.slots[this.bSlot[row]].home : -1;
    }
    return -1;
  }
  opAreaPaint(f: number, ip: number): number {
    const code = this.code;
    if (code[ip + 1] === -2) return NEXT;
    const z = code[ip + 1] >= 0 ? code[ip + 1] : this.homeOfRun(f, code[ip + 2]);
    if (z < 0) return NEXT;
    const op = this.numOf(f, code[ip + 4]);
    this.host.areaPaint(z, code[ip + 3], Number.isFinite(op) ? op : 1);
    return NEXT;
  }
  opAreaWhitelist(f: number, ip: number): number {
    const b = this.code[ip + 1];
    if (b < 0) return NEXT;
    this.host.areaWhitelist(this.p.behaviors[b].zone, b, this.p.lists[this.code[ip + 2]], this.p.lists[this.code[ip + 3]]);
    void f;
    return NEXT;
  }

  private opPick(f: number, ip: number): number {
    const code = this.code;
    const inTurn = code[ip + 1] === 1, n = code[ip + 2], end = code[ip + 3];
    if (n === 0) return end;
    if (inTurn) {
      const k = Math.max(0, Math.floor(this.fNum[f]) - 1) % n;
      return code[ip + 4 + k * 2 + 1];
    }
    let total = 0;
    for (let i = 0; i < n; i++) { const w = this.numOf(f, code[ip + 4 + i * 2]); if (w > 0) total += w; }
    if (!(total > 0)) return end;
    let u = this.ruleRng[this.fRule[f]].next() * total;
    let last = -1;
    for (let i = 0; i < n; i++) {
      const w = this.numOf(f, code[ip + 4 + i * 2]);
      if (!(w > 0)) continue;
      last = i;
      u -= w;
      if (u < 0) return code[ip + 4 + i * 2 + 1];
    }
    return last >= 0 ? code[ip + 4 + last * 2 + 1] : end;
  }

  opSignal(f: number, ip: number): number {
    const key = this.code[ip + 1];
    if (key < 0) return NEXT;
    this.eachTarget(f, this.code[ip + 2]);
    const b = this.tn > 0 ? this.t[0] : null;
    this.depthNow = this.fDepth[f];
    const gh = SMALL_FIX.GH522;
    this.emit(this.opTrig('signal.got'), gh ? this.fKey[f] : key, this.fNum[f], b, b ? this.tId[0] : '', this.fOther[f], this.fOtherId[f], this.fOtherSide[f], this.fX[f], this.fY[f], this.fWave[f], b ? b._mev ?? -1 : -1, gh ? key + 1 : 0, 0, 0);
    for (let i = 0; i < this.p.plans.length; i++) if (this.p.plans[i].startSignal === key && this.pPhase[i] === PH_IDLE && !(SMALL_FIX.GH473 && this.p.plans[i].off)) this.startPlan(i, this.now);
    for (const s of this.p.spawners) if (s.signal === key && this.spOn[s.idx]) this.spWant[s.idx] += this.spawnerPer(s);
    return NEXT;
  }
  private subjectNow(f: number): MevBody | null {
    const b = this.fSubject[f];
    return b !== null && (SMALL_FIX.GH566 === 0 || b.id === this.fSubjectId[f]) ? b : null;
  }
  private varKey(vi: number, f: number): string | null {
    const v = this.p.vars[vi];
    if (f < 0 && v.scope !== 'match' && SMALL_FIX.GH493 && this._ctxBody !== null) return v.scope === 'team' ? vi + ':' + this.host.sideOf(this._ctxBody) : vi + ':' + this._ctxBodyId;
    if (v.scope === 'match' || f < 0) return null;
    const b = this.subjectNow(f);
    if (v.scope === 'team') return vi + ':' + (b ? this.host.sideOf(b) : '');
    return vi + ':' + this.fSubjectId[f];
  }
  varGet(vi: number, f: number): number {
    const k = this.varKey(vi, f);
    if (k === null) return this.vars[vi];
    const v = this.scoped.get(k);
    return v === undefined ? this.p.vars[vi].start : v;
  }
  private varWrite(vi: number, f: number, v: number): void {
    const k = this.varKey(vi, f);
    const prev = SMALL_FIX.GH565 !== 0 ? (k === null ? this.vars[vi] : (this.scoped.get(k) ?? this.p.vars[vi].start)) : 0;
    if (k === null) this.vars[vi] = v; else this.scoped.set(k, v);
    if (SMALL_FIX.GH371 && k !== null && this.p.vars[vi].scope === 'body' && !this.scopedOwner.has(k)) {
      const b = this.fSubject[f];
      if (b && !this.host.isPlayer(b)) this.scopedOwner.set(k, { b, id: this.fSubjectId[f], vi });
    }
    const ws = this.p.varWatches;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w.varIdx !== vi) continue;
      const target = this.numOf(f, w.valueOff);
      const now = cmpOp(w.op, v, target);
      const wk = SMALL_FIX.GH370 && k !== null ? i + '|' + k : null;
      const g565 = SMALL_FIX.GH565 !== 0;
      const was = wk === null ? (g565 && this.varWasSet[i] === 0 ? (cmpOp(w.op, prev, target) ? 1 : 0) : this.varWas[i])
        : (this.scopedWas.get(wk) ?? (g565 ? (cmpOp(w.op, prev, target) ? 1 : 0) : 0));
      if (now && !was) {
        this.depthNow = f >= 0 ? this.fDepth[f] : 0;
        this.emit(this.opTrig('var.crossed'), w.ip, v, f >= 0 ? this.fSubject[f] : null, f >= 0 ? this.fSubjectId[f] : '', null, '', '', 0, 0, this.currentWave(), -1, 0, 0, 0);
      }
      if (wk === null) { this.varWas[i] = now ? 1 : 0; this.varWasSet[i] = 1; } else this.scopedWas.set(wk, now ? 1 : 0);
    }
  }
  private scopedWas = new Map<string, number>();
  private scopedOwner = new Map<string, { b: MevBody; id: string; vi: number }>();
  private scopedSweepAt = 0;
  private sweepScoped(now: number): void {
    this.scopedSweepAt = now + 1000;
    if (this.scopedOwner.size === 0) return;
    const ws = this.p.varWatches;
    for (const [k, o] of this.scopedOwner) {
      if (this.host.isLive(o.b, o.id)) continue;
      let used = false;
      for (let f = 0; f < this.fCap; f++) if (this.fLive[f] && this.fSubjectId[f] === o.id) { used = true; break; }
      if (used) continue;
      this.scoped.delete(k);
      for (let i = 0; i < ws.length; i++) if (ws[i].varIdx === o.vi) this.scopedWas.delete(i + '|' + k);
      this.scopedOwner.delete(k);
    }
  }
  opVarSet(f: number, ip: number): number {
    const vi = this.code[ip + 1];
    if (vi < 0) return NEXT;
    const v = this.numOf(f, this.code[ip + 2]);
    if (!Number.isFinite(v)) { this.guard(`"${this.p.rules[this.fRule[f]].name}": a value has no answer. The variable keeps what it had.`, this.fRule[f]); return NEXT; }
    this.varWrite(vi, f, v);
    return NEXT;
  }
  opVarAdd(f: number, ip: number): number {
    const vi = this.code[ip + 1];
    if (vi < 0) return NEXT;
    const v = this.numOf(f, this.code[ip + 2]);
    if (!Number.isFinite(v)) { this.guard(`"${this.p.rules[this.fRule[f]].name}": a value has no answer. The variable keeps what it had.`, this.fRule[f]); return NEXT; }
    this.varWrite(vi, f, this.varGet(vi, f) + v);
    return NEXT;
  }
  opRuleSet(f: number, ip: number): number {
    const r = this.code[ip + 1];
    if (r >= 0) this.ruleOff[r] = this.code[ip + 2] === 1 ? 0 : 1;
    void f;
    return NEXT;
  }

  private timerFull(t: number): number { const v = this.numOfTimer(t, this.p.timers[t].secondsOff); return Number.isFinite(v) && v >= 0 ? v * 1000 : NaN; }
  private timerStart(t: number): void {
    const ms = this.timerFull(t);
    if (!Number.isFinite(ms)) { this.guard(`Timer "${this.p.timers[t].name}" has no answer for its time. It does not start.`); return; }
    this.tState[t] = 1; this.tEnd[t] = this.now + ms; this.tMark[t] = 0;
    const marks = this.p.timers[t].marks;
    while (this.tMark[t] < marks.length && marks[this.tMark[t]] * 1000 > ms) this.tMark[t]++;
  }
  opTimerStart(f: number, ip: number): number { if (this.code[ip + 1] >= 0) this.timerStart(this.code[ip + 1]); void f; return NEXT; }
  opTimerStop(f: number, ip: number): number { if (this.code[ip + 1] >= 0) this.tState[this.code[ip + 1]] = 0; void f; return NEXT; }
  opTimerPause(f: number, ip: number): number {
    const t = this.code[ip + 1];
    if (t >= 0 && this.tState[t] === 1) { this.tLeft[t] = this.tEnd[t] - this.now; this.tState[t] = 2; }
    void f;
    return NEXT;
  }
  opTimerResume(f: number, ip: number): number {
    const t = this.code[ip + 1];
    if (t >= 0 && this.tState[t] === 2) { this.tEnd[t] = this.now + this.tLeft[t]; this.tState[t] = 1; }
    void f;
    return NEXT;
  }
  opTimerReset(f: number, ip: number): number {
    const t = this.code[ip + 1];
    if (t < 0) return NEXT;
    const st = this.tState[t];
    if (st === 1) this.timerStart(t);
    else if (st === 2) {
      const ms = this.timerFull(t);
      if (Number.isFinite(ms)) {
        this.tLeft[t] = ms; this.tMark[t] = 0;
        if (SMALL_FIX.GH457) { const marks = this.p.timers[t].marks; while (this.tMark[t] < marks.length && marks[this.tMark[t]] * 1000 > ms) this.tMark[t]++; }
      }
    }
    void f;
    return NEXT;
  }
  timerLeft(t: number): number {
    const st = this.tState[t];
    if (st === 1) return Math.max(0, (this.tEnd[t] - this.now) / 1000);
    if (st === 2) return Math.max(0, this.tLeft[t] / 1000);
    return 0;
  }
  private stepTimers(now: number): void {
    const n = this.tState.length;
    for (let t = 0; t < n; t++) {
      if (this.tState[t] !== 1) continue;
      const def = this.p.timers[t];
      const left = this.tEnd[t] - now;
      while (this.tMark[t] < def.marks.length && def.marks[this.tMark[t]] * 1000 >= left) {
        const m = def.marks[this.tMark[t]++];
        this.depthNow = 0;
        this.emit(this.opTrig('timer.tick'), t, m, null, '', null, '', '', 0, 0, this.currentWave(), -1, 0, 0, 0);
      }
      if (left <= 0) {
        this.depthNow = 0;
        this.emit(this.opTrig('timer.ended'), t, 0, null, '', null, '', '', 0, 0, this.currentWave(), -1, 0, 0, 0);
        if (def.repeat) { if (SMALL_FIX.GH365) this.tState[t] = 0; this.timerStart(t); } else this.tState[t] = 0;
      }
    }
    this.hudLive(now);
  }

  private refreshClockDue(): void {
    let d = Infinity;
    for (let i = 0; i < this.clockNext.length; i++) if (this.clockNext[i] < d) d = this.clockNext[i];
    this.nextClockDue = d;
  }
  private stepClocks(now: number): void {
    const cs = this.p.clocks;
    for (let i = 0; i < cs.length; i++) {
      if (this.clockNext[i] > now) continue;
      const c = cs[i];
      this.startRun(c.rule, null, '', null, '', '', 0, 0, 1, this.currentWave(), 0, -1, -1, false);
      if (c.kind === 'at') { this.clockNext[i] = Infinity; continue; }
      if (--this.clockLeft[i] <= 0) { this.clockNext[i] = Infinity; continue; }
      const d = this.numOfRule(c.rule, c.everyOff) * 1000;
      if (!Number.isFinite(d) || d <= 0) { this.guard(`"${this.p.rules[c.rule].name}": its time has no answer. It stops.`, c.rule); this.clockNext[i] = Infinity; continue; }
      this.clockNext[i] = Math.max(now, this.clockNext[i] + d);
    }
    this.refreshClockDue();
  }

  private countOfWatch(i: number): number {
    const w = this.p.watches[i];
    if (w.tag >= 0) return w.team && MISSING_MODES.ON !== 0 ? this.tagOnSide(w.tag, w.team) : this.tagCount[w.tag];
    if (w.type >= 0) return this.typeCount[w.type];
    if (w.team) {
      let n = 0;
      const b = this.host.playerBody();
      if (b && this.host.sideOf(b) === w.team) n++;
      const list = this.host.tanks();
      for (let j = 0; j < list.length; j++) { const e = list[j]; if (this.host.isLive(e, e.id) && this.host.sideOf(e) === w.team) n++; }
      if (SMALL_FIX.R896 !== 0 && this.host.sideWaiting !== undefined) n += this.host.sideWaiting(w.team);
      return n;
    }
    return 0;
  }
  private tagOnSide(t: number, team: string): number {
    let n = 0;
    const live = SMALL_FIX.GH362 !== 0;
    const len = live ? this.liveN : this.bN;
    for (let k = 0; k < len; k++) {
      const row = live ? this.liveRows[k] : k;
      if (!this.bAlive[row]) continue;
      const f = this.p.forms[this.bForm[row]], x = this.bExtra[row];
      if (!((f && f.tags.includes(t)) || (x && x.includes(t)))) continue;
      const b = this.bRef[row];
      if (b && this.host.isLive(b, this.bId[row]) && this.host.sideOf(b) === team) n++;
    }
    return n;
  }
  private primeWatches(): void {
    for (let i = 0; i < this.watchLast.length; i++) this.watchLast[i] = this.countOfWatch(i);
    this.countsDirty = false;
  }
  private checkWatches(): void {
    this.countsDirty = false;
    const ws = this.p.watches;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const now = this.countOfWatch(i), was = this.watchLast[i];
      if (now === was) continue;
      this.watchLast[i] = now;
      const hit = w.dir === 0 ? (was > w.n && now <= w.n) : w.dir === 1 ? (was < w.n && now >= w.n) : (now === w.n);
      if (hit) { this.depthNow = 0; this.emit(this.opTrig('count.crossed'), w.ip, now, null, '', null, '', '', 0, 0, this.currentWave(), -1, 0, 0, 0); }
    }
  }

  private stepWaves(now: number): void {
    const n = this.pPhase.length;
    for (let i = 0; i < n; i++) {
      const ph = this.pPhase[i];
      if (ph === PH_IDLE || ph === PH_DONE || ph === PH_STOPPED || this.pPausedAt[i] >= 0) continue;
      if (ph === PH_DELAY || ph === PH_BREAK) {
        if (now >= this.pNextAt[i]) this.startWave(i, this.pWave[i], now);
        continue;
      }
      if (!this.pAllBorn[i] && this.pStreams[i] <= 0) {
        this.pAllBorn[i] = 1;
        this.depthNow = 0;
        this.emit(this.opTrig('wave.allBorn'), i, this.pWave[i], null, '', null, '', '', 0, 0, this.pWave[i], -1, 0, 0, 0);
      }
      if (this.waveIsOver(i, now)) this.clearWave(i, now);
    }
  }

  private waveIsOver(i: number, now: number): boolean {
    const c = this.p.plans[i];
    const on = c.def.advance?.on ?? 'cleared';
    const noneLeft = this.pToBorn[i] <= 0 && this.pLive[i] <= 0;
    const clearedNow = this.pHadHolder[i] ? noneLeft : (this.pAllBorn[i] === 1 && noneLeft);
    if (on === 'cleared') return clearedNow;
    if (on === 'manual') return false;
    if (on === 'aliveBelow') {
      if (this.pToBorn[i] > 0 || !this.pAllBorn[i]) return false;
      const v = c.aliveBelowOff >= 0 ? this.numOfPlan(i, c.aliveBelowOff) : 0;
      return Number.isFinite(v) && this.pLive[i] < v;
    }
    const secs = c.advanceSecondsOff >= 0 ? this.numOfPlan(i, c.advanceSecondsOff) : NaN;
    const timerDone = Number.isFinite(secs) && now - this.pWaveAt[i] >= secs * 1000;
    if (on === 'timer') return timerDone;
    return clearedNow || timerDone;
  }

  private clearWave(i: number, now: number): void {
    const c = this.p.plans[i];
    const wave = this.pWave[i];
    const last = c.def.last;
    const finished = typeof last === 'number' && wave >= last;
    this.refreshRollCtx();
    this._ctxRun = -1; this._ctxDoc = c.doc;
    const next = this.pPick[i] > 0 ? this.pPick[i] : wave + 1;
    this.pPick[i] = 0;
    let d = finished ? 0 : breakSeconds(c.def, next, !this.pHadHolder[i], this.rollCtx);
    if (!finished && d === 0 && this.pTotal[i] === 0) { if (!this.pEmptyNoted[i]) { this.pEmptyNoted[i] = 1; this.guard(`Wave Plan "${c.name}" has waves with nothing in them and no break. It waits a second between them.`); } d = 1; }
    this.depthNow = 0;
    this.logRec(LOG_WAVE, -1, i, wave);
    this.emit(this.opTrig('wave.cleared'), i, Number.isFinite(d) ? Math.floor(d) : 0, null, '', null, '', '', 0, 0, wave, -1, 0, 0, 0);
    if (finished) {
      this.pPhase[i] = PH_DONE;
      this.emit(this.opTrig('plan.finished'), i, wave, null, '', null, '', '', 0, 0, wave, -1, 0, 0, 0);
      return;
    }
    if (!Number.isFinite(d)) {
      this.guard(`Wave Plan "${c.name}": the break before wave ${wave + 1} has no answer. The plan holds here.`);
      this.pPhase[i] = PH_STOPPED;
      return;
    }
    this.pPhase[i] = PH_BREAK;
    this.pWave[i] = next;
    this.pNextAt[i] = now + d * 1000;
  }

  private startWave(i: number, wave: number, now: number): void {
    const c = this.p.plans[i];
    this.refreshRollCtx();
    this._ctxRun = -1; this._ctxDoc = c.doc;
    this.rollCtx.forceSpecial = this.forcedSpecial[i] ?? -1;
    const roll = rollWave(c.def, wave, this.matchSeed, this.rollCtx);
    this.forcedSpecial[i] = -1;
    for (const pr of roll.problems) this.guard(`Wave Plan "${c.name}": ${pr}`);
    this.pTotal[i] = roll.total;
    if (SMALL_FIX.GH511) { this.pRun[i]++; this.pStreams[i] = 0; }
    this.pPhase[i] = PH_RUNNING; this.pWave[i] = wave; this.pWaveAt[i] = now; this.pAllBorn[i] = 0; this.pHadHolder[i] = roll.hasHolder ? 1 : 0; this.pSpecial[i] = roll.special ? roll.special.name : '';
    this.depthNow = 0;
    this.logRec(LOG_WAVE, -1, i, wave);
    this.tr(`wave ${wave} of ${c.name}: ${roll.total}${roll.special ? ' special ' + roll.special.name : ''}`);
    this.emit(this.opTrig('wave.started'), i, wave, null, '', null, '', '', 0, 0, wave, -1, 0, 0, 0);
    if (roll.special) {
      this.emit(this.opTrig('wave.special'), i, wave, null, '', null, '', '', 0, 0, wave, -1, 0, 0, 0);
      if (roll.special.message) this.host.say(roll.special.message, 10000, SMALL_FIX.GH495 ? this.now : now);
    }
    for (const rs of roll.streams) {
      const gi = c.groupByPlanId.get(rs.group.id);
      if (gi === undefined) continue;
      const g = this.p.groups[gi];
      if (g.dead) continue;
      let zones = g.atPlan ? c.areas : g.at;
      if (SMALL_FIX.GH481 && g.atPlan && c.areaBeh.some(bi => bi >= 0 && !this.behaviorOn[bi])) {
        zones = c.areas.filter((_z, k) => !(c.areaBeh[k] >= 0 && !this.behaviorOn[c.areaBeh[k]]));
        if (zones.length === 0) continue;
      }
      if (zones.length === 0) { this.guard(`Wave Plan "${c.name}", "${g.name}": it has no place to spawn. It is skipped and holds nothing.`); continue; }
      const eachCount = g.split === 'each' ? zones.length : 1;
      for (let z = 0; z < eachCount; z++) {
        const s = this.newStream();
        s.plan = i; s.wave = wave; s.group = gi; s.run = this.pRun[i];
        s.cards = this.p.cardLists[g.cards];
        s.place = this.p.places[g.place];
        s.zones = eachCount > 1 ? [zones[z]] : zones;
        s.weights = eachCount > 1 ? null : g.weights;
        s.left = rs.k; s.holds = rs.holds;
        s.next = now + rs.startAt * 1000;
        s.step = rs.k > 0 ? rs.seconds * 1000 / rs.k : 0;
        s.side = g.side; s.showName = g.showName; s.name = ''; s.tags = g.tags;
        s.rngCard.seed(hash32(this.matchSeed, c.id, wave, g.id, PURPOSE_CARD), hash32(this.matchSeed, c.id, wave, g.id, 21), z, 3);
        s.rngPlace.seed(hash32(this.matchSeed, c.id, wave, g.id, PURPOSE_PLACE), hash32(this.matchSeed, c.id, wave, g.id, 22), z, 5);
        s.budget = rs.budgetCards;
        s.budgetCards = null;
        this.streams.push(s);
        this.pStreams[i]++;
        if (rs.holds) this.pToBorn[i] += rs.k;
      }
    }
  }

  private newStream(): Stream {
    const s = this.streamPool.pop() ?? new Stream();
    s.plan = -1; s.wave = 0; s.group = -1; s.spawner = -1; s.weights = null; s.place = null; s.budget = undefined; s.budgetCards = null; s.left = 0; s.next = 0; s.step = 0; s.holds = false; s.side = null; s.showName = null; s.name = ''; s.tags = []; s.waitingSince = -1; s.stallNoted = false; s.runRule = -1; s.runHome = -1; s.run = 0; s.srcRule = -1; s.srcIp = -1; s.spread = 0; s.spreadN = 0; s.spreadA0 = 0;
    return s;
  }
  private freeStream(s: Stream): void { if (this.streamPool.length < 256) this.streamPool.push(s); }

  private orderVals = new Float64Array(0);
  private orderAt = -1;
  private tagRows: number[][] = [];
  private orderTags: number[] = [];
  nx = 0; ny = 0; nBody: MevBody | null = null; nId = '';
  private refreshOrders(now: number): void {
    const list = this.p.orders;
    if (list.length === 0) return;
    if (this.orderVals.length === 0) {
      this.orderVals = new Float64Array(list.length * 4);
      for (const o of list) for (const t of [o.tag, o.elseTag]) if (t >= 0 && !this.orderTags.includes(t)) this.orderTags.push(t);
      for (let t = 0; t < this.p.tags.length; t++) this.tagRows.push([]);
    }
    if (now >= this.orderAt) {
      this.orderAt = now + 1000;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        const read = (off: number, dflt: number) => { if (off < 0) return dflt; const v = this.numOwned(off, OWN_ORDER, SMALL_FIX.GH366 ? o.doc : 0, i); return Number.isFinite(v) ? v : dflt; };
        this.orderVals[i * 4] = read(o.radiusOff, 0); this.orderVals[i * 4 + 1] = read(o.speedOff, 1); this.orderVals[i * 4 + 2] = read(o.gapOff, 0); this.orderVals[i * 4 + 3] = read(o.turnOff, 12);
      }
    }
    const used = this.orderTags;
    for (let k = 0; k < used.length; k++) this.tagRows[used[k]].length = 0;
    const nWalk = SMALL_FIX.GH362 ? this.liveN : this.bN;
    for (let q = 0; q < nWalk; q++) {
      const r = SMALL_FIX.GH362 ? this.liveRows[q] : q;
      if (!this.bAlive[r] || !this.bIsTank[r]) continue;
      for (let k = 0; k < used.length; k++) if (this.rowHasTag(r, used[k])) this.tagRows[used[k]].push(r);
    }
    if (SMALL_FIX.GH465) {
      if (this.tagFreeB.length === 0) for (let t = 0; t < this.p.tags.length; t++) { this.tagFreeB.push([]); this.tagFreeId.push([]); }
      for (let k = 0; k < used.length; k++) { this.tagFreeB[used[k]].length = 0; this.tagFreeId[used[k]].length = 0; }
      if (this.freeTags.size > 0) this.freeTags.forEach(this.freeOrderIdx);
    }
  }
  private tagFreeB: MevBody[][] = [];
  private tagFreeId: string[][] = [];
  private readonly freeOrderIdx = (ft: { b: MevBody; id: string; tags: number[]; dead: boolean }): void => {
    if (ft.dead) return;
    const used = this.orderTags;
    for (let k = 0; k < used.length; k++) if (ft.tags.includes(used[k])) { this.tagFreeB[used[k]].push(ft.b); this.tagFreeId[used[k]].push(ft.id); }
  };
  orderVal(o: number, which: number): number { return this.orderVals.length > o * 4 + which ? this.orderVals[o * 4 + which] : (which === 1 ? 1 : 0); }
  nearestOfTag(tag: number, x: number, y: number, self: MevBody): boolean {
    const rows = tag >= 0 ? this.tagRows[tag] : undefined;
    this.nBody = null;
    if (!rows) return false;
    let best = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], b = this.bRef[r];
      if (!b || b === self || !this.host.isLive(b, this.bId[r])) continue;
      const px = this.host.posX(b), py = this.host.posY(b), dx = px - x, dy = py - y, d = dx * dx + dy * dy;
      if (d < best) { best = d; this.nBody = b; this.nId = this.bId[r]; this.nx = px; this.ny = py; }
    }
    if (SMALL_FIX.GH465 && tag < this.tagFreeB.length) {
      const fb = this.tagFreeB[tag], fid = this.tagFreeId[tag];
      for (let i = 0; i < fb.length; i++) {
        const b = fb[i];
        if (b === self || !this.host.isLive(b, fid[i])) continue;
        const px = this.host.posX(b), py = this.host.posY(b), dx = px - x, dy = py - y, d = dx * dx + dy * dy;
        if (d < best) { best = d; this.nBody = b; this.nId = fid[i]; this.nx = px; this.ny = py; }
      }
    }
    return this.nBody !== null;
  }

  private pump(now: number): void {
    const list = this.streams;
    if (list.length === 0) return;
    let room = SMALL_FIX.GH385 ? Math.max(0, PER_STEP_BIRTHS - this.stepBorn) : PER_STEP_BIRTHS;
    let clockT0 = -1;
    const slice = Math.min(3, Math.max(0.5, this.dtMs * 0.2));
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.left > 0 && room > 0 && s.next <= now && !(s.plan >= 0 && this.pPausedAt[s.plan] >= 0)) {
        if (clockT0 < 0) clockT0 = this.host.clockMs();
        else if (this.host.clockMs() - clockT0 > slice) room = 0;
        if (room > 0) room -= this.pumpStream(s, room);
      }
      if (s.left <= 0) {
        if (s.plan >= 0) { if (SMALL_FIX.GH511) this.streamEnded(s, list, w, i); else this.pStreams[s.plan]--; }
        this.freeStream(s);
        continue;
      }
      list[w++] = s;
    }
    list.length = w;
    const q = this.allBornQ;
    if (q.length > 0) {
      const n = q.length;
      for (let k = 0; k < n; k += 2) { this.depthNow = 0; this.emit(this.opTrig('wave.allBorn'), q[k], q[k + 1], null, '', null, '', '', 0, 0, q[k + 1], -1, 0, 0, 0); }
      q.length = 0;
    }
  }

  private streamEnded(s: Stream, list: Stream[], w: number, at: number): void {
    const pl = s.plan, ph = this.pPhase[pl];
    if (s.run === this.pRun[pl]) {
      this.pStreams[pl]--;
      if (ph === PH_RUNNING || ph === PH_STOPPED || this.pAllBorn[pl] || this.pStreams[pl] > 0) return;
      this.pAllBorn[pl] = 1;
    } else {
      if (ph === PH_STOPPED) return;
      for (let k = 0; k < w; k++) { const o = list[k]; if (o.plan === pl && o.run === s.run && o.left > 0) return; }
      for (let k = at + 1; k < list.length; k++) { const o = list[k]; if (o.plan === pl && o.run === s.run && o.left > 0) return; }
    }
    this.allBornQ.push(pl, s.wave);
  }

  private pumpStream(s: Stream, room: number): number {
    let born = 0, gone = 0;
    const now = this.now;
    while (s.left > 0 && s.next <= now && born < room) {
      const r = this.birth(s);
      if (r === BIRTH_WAIT) {
        if (s.waitingSince < 0) s.waitingSince = now;
        else if (s.holds && !s.stallNoted && now - s.waitingSince >= STALL_MS) {
          s.stallNoted = true;
          this.stallNote = `A wave is waiting: "${this.p.groups[s.group]?.name ?? 'a spawn'}" has no room to be born. Raise Max Tanks Alive, or check its place.`;
          this.guard(this.stallNote);
        }
        break;
      }
      s.waitingSince = -1;
      s.left--;
      s.next += s.step;
      if (r === BIRTH_OK) born++;
      if (s.holds && s.plan >= 0) this.pToBorn[s.plan]--;
      if (r === BIRTH_GONE && SMALL_FIX.GH437 && ++gone >= GONE_PER_PUMP) break;
    }
    return born;
  }

  private roomFor(holds: boolean): boolean {
    const cap = this.host.tankRoom();
    const total = this.liveHold + this.liveOther;
    if (total >= cap) return false;
    if (holds) return true;
    const share = this.p.match.holderShare;
    const keep = typeof share === 'number' ? share : 60;
    return this.liveOther < Math.floor(cap * (100 - keep) / 100);
  }

  private typeBodyIsShape(type: number): boolean {
    if (type < 0) return false;
    const sl = this.p.slots[this.p.types[type].slot];
    if (!sl) return false;
    const v = this.slotTank[sl.base];
    if (v >= 0) return isShapeThing(this.p.tanks[v]);
    const pick = this.p.tankPicks[-v - 1];
    if (!pick || pick.list.length === 0) return false;
    for (let i = 0; i < pick.list.length; i++) if (!isShapeThing(pick.list[i].word)) return false;
    return true;
  }
  private designAliveOfCard(c: CCard): boolean {
    if (c.typeIdx < 0) return false;
    const t = this.p.types[c.typeIdx];
    if (SMALL_FIX.GH517 && t.slot >= 0) {
      const v = this.slotTank[this.p.slots[t.slot].base];
      if (v >= 0) return (this.designCount.get(this.p.tanks[v]) ?? 0) > 0;
      const pick = this.p.tankPicks[-v - 1];
      if (!pick) return false;
      for (let i = 0; i < pick.list.length; i++) if ((this.designCount.get(pick.list[i].word) ?? 0) > 0) return true;
      return false;
    }
    const tank = this.p.forms[t.forms[0]]?.def.tank;
    return typeof tank === 'string' ? (this.designCount.get(tank) ?? 0) > 0 : false;
  }

  private birth(s: Stream): number {
    const wave = s.wave;
    let card: CCard | null = null;
    if (s.budget && s.budget.length > 0) {
      const want = s.budget[s.budget.length - s.left];
      card = want ? (s.cards.find(c => c.id === want.id) ?? null) : null;
      if (card && SMALL_FIX.GH367 && card.uniqueAlive && this.designAliveOfCard(card)) return BIRTH_GONE;
    }
    if (!card) {
      const ci = this.pickCCard(s.cards, wave, s.rngCard);
      if (ci < 0) return BIRTH_GONE;
      card = s.cards[ci];
    }
    const isShape = card.shape !== '';
    if (!isShape && !(SMALL_FIX.GH404 && this.typeBodyIsShape(card.typeIdx)) && !this.roomFor(s.holds)) return BIRTH_WAIT;
    const sizeF = card.size ? card.size[0] + (card.size[1] - card.size[0]) * s.rngCard.next() : 1;
    let tank = '', type = card.typeIdx, slot = -1;
    if (!isShape) {
      const t = this.p.types[type];
      slot = t.slot;
      tank = this.tankOfSlot(slot, 0);
      if (!tank) { this.guard(`"${t.name}" names no tank it can find. It is not born.`); return BIRTH_GONE; }
      this.fillReq(type, 0, tank, s.side, true);
      const r = this.req;
      r.sizeFactor = sizeF;
      if (SMALL_FIX.GH419) r.shapeWord = '';
      if (s.plan >= 0) { r.fromWave = true; r.noGrowth = this.p.plans[s.plan].def.canGrow !== true; }
      if (s.showName !== null) r.showName = s.showName;
      if (s.name) r.name = s.name;
    } else {
      this.req.typeIdx = -1; this.req.tank = ''; this.req.team = s.side?.team ?? 'againstPlayer'; this.req.camp = 'shape'; this.req.size = 0;
      if (SMALL_FIX.GH419) { this.req.shapeWord = card.shape; this.req.sizeFactor = sizeF; }
    }
    this.req.extraTags = SMALL_FIX.GH474 && s.tags.length > 0 ? s.tags : null;
    const place = s.place;
    const rule = place?.rule;
    const zones = s.zones;
    if (place && (place.w === 'subject' || place.w === 'point' || place.w === 'homeOf')) {
      if (this.spawnFromRun >= 0) { if (!this.placeForRun(this.spawnFromRun, place)) return BIRTH_GONE; }
      else if (!(SMALL_FIX.GH363 && s.runRule >= 0 && this.placeForStream(s, place))) return BIRTH_GONE;
      if (s.spread > 0 && s.spreadN > 0) { const a = this.spreadTurn(s); this.px += Math.cos(a) * s.spread; this.py += Math.sin(a) * s.spread; }
      if (SMALL_FIX.GH475 && (!isShape || SMALL_FIX.G675 !== 0) && !this.host.spotFree(this.px, this.py, this.req, 0, 0, true)) {
        if (s.waitingSince < 0) this.guard(`"${isShape ? 'A shape' : (this.p.types[type]?.name ?? 'A tank')}" was not born at its spot: the spot would hurt it. It waits.`);
        return BIRTH_WAIT;
      }
    } else {
      if (zones.length === 0) return BIRTH_GONE;
      const ok = this.solvePlace(s, zones, isShape ? null : this.req);
      if (!ok) {
        const onFull = rule?.onFull ?? 'wait';
        if (onFull === 'wait') {
          const waited = s.waitingSince >= 0 ? this.now - s.waitingSince : 0;
          if (isShape || waited < (s.group >= 0 ? NO_ROOM_WAVE_MS : NO_ROOM_RUN_MS) || !this.mostOpenPlace(s, zones, this.req)) return BIRTH_WAIT;
          this.guard(`"${this.p.types[type]?.name ?? 'A tank'}" had no clear place in its area: it stands at the most open one.`);
        } else {
          if (onFull === 'skip') { this.guard(`"${this.p.groups[s.group]?.name ?? 'A spawn'}": no room, the unit was skipped.`); return BIRTH_GONE; }
          if (!this.solvePlace(s, zones, isShape ? null : this.req, true)) return BIRTH_WAIT;
        }
      }
    }
    let b: MevBody | null;
    if (isShape) {
      b = this.host.spawnShape(card.shape, this.px, this.py, sizeF, this.pArea);
      if (!b) return BIRTH_GONE;
      this.registerBody(b, -1, -1, -1, s.group, -1, s.spawner, '', '', s.tags.length > 0 ? s.tags.slice() : null, false);
    } else {
      const r = this.req;
      r.x = this.px; r.y = this.py; r.areaIdx = this.pArea;
      r.angle = s.rngPlace.next() * Math.PI * 2;
      if (s.spread > 0 && s.spreadN > 0) { r.angle = this.spreadTurn(s); r.faced = true; }
      r.name = r.name || this.drawName(type, -1, '');
      b = this.host.spawnTank(r);
      if (!b) return BIRTH_WAIT;
      const nr = this.registerBody(b, type, this.p.types[type].forms[0], slot, s.group, s.holds ? s.plan : -1, s.spawner, r.name, tank, s.tags.length > 0 ? s.tags.slice() : null, !isShapeThing(tank));
      if (r.fromWave) this.bGrow[nr] = r.noGrowth ? 2 : 1;
    }
    this.logRec(LOG_BIRTH, -1, s.group, wave);
    if (this.spawnFromRun >= 0) { this.fLast[this.spawnFromRun] = b; this.fLastId[this.spawnFromRun] = b.id; }
    this.depthNow = 0;
    this.emit(this.opTrig('body.born'), s.group, 0, b, b.id, null, '', '', this.px, this.py, wave, b._mev ?? -1, 0, 0, 0);
    return BIRTH_OK;
  }
  private pickCCard(cards: readonly CCard[], wave: number, rng: Sfc32): number {
    let total = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (!(c.weight > 0) || wave < c.from || wave > c.to) continue;
      if (c.uniqueAlive && this.designAliveOfCard(c)) continue;
      total += c.weight;
    }
    if (!(total > 0)) return -1;
    let u = rng.next() * total, last = -1;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (!(c.weight > 0) || wave < c.from || wave > c.to) continue;
      if (c.uniqueAlive && this.designAliveOfCard(c)) continue;
      last = i;
      u -= c.weight;
      if (u < 0) return i;
    }
    return last;
  }

  private solvePlace(s: Stream, zones: readonly number[], req: SpawnReq | null, ignoreGap = false): boolean {
    const rule = s.place?.rule;
    const avoid = s.place?.avoid ?? [];
    const how = rule?.how ?? 'random';
    const gap = ignoreGap ? 0 : (rule?.gap ?? 0);
    const away = rule?.awayFromPlayers;
    const keep = rule?.keepFromDamaging ?? 0;
    const tankReq = SMALL_FIX.R859 ? (req ?? this.req) : null;
    const baseTest = tankReq !== null && tankReq.tank !== '' && !isShapeThing(tankReq.tank);
    let onBase = false, bx = 0, by = 0, ba = -1;
    let stick = -1;
    for (let tries = 0; tries < 25; tries++) {
      const zi = SMALL_FIX.R906 !== 0 && tries < 15 && stick >= 0 ? stick : this.pickZone(zones, s.weights, s.rngPlace);
      if (SMALL_FIX.R906 !== 0 && tries === 0) stick = zi;
      if (zi < 0) return false;
      if (!this.drawInZone(zi, s.rngPlace, how)) continue;
      const x = this.px, y = this.py;
      this.pArea = this.p.zones[zi].areaIdx;
      let inAvoid = false;
      for (let a = 0; a < avoid.length; a++) if (this.pointInZone(avoid[a], x, y)) { inAvoid = true; break; }
      if (inAvoid) continue;
      if (away && !this.host.awayFromPlayers(x, y, away.base, away.perSize)) continue;
      if (req ? !this.host.spotFree(x, y, req, gap, keep) : !this.host.spotFree(x, y, this.req, 0, keep)) continue;
      if (baseTest && this.host.onOtherBase(x, y, tankReq!)) { if (!onBase) { onBase = true; bx = x; by = y; ba = this.pArea; } continue; }
      return true;
    }
    if (onBase) { this.px = bx; this.py = by; this.pArea = ba; return true; }
    return false;
  }
  private pickZone(zones: readonly number[], weights: readonly number[] | null, rng: Sfc32): number {
    if (zones.length === 1) return zones[0];
    if (!weights) return zones[Math.floor(rng.next() * zones.length)];
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    if (!(total > 0)) return -1;
    let u = rng.next() * total;
    for (let i = 0; i < zones.length; i++) { u -= weights[i]; if (u < 0) return zones[i]; }
    return zones[zones.length - 1];
  }
  private mostOpenPlace(s: Stream, zones: readonly number[], req: SpawnReq): boolean {
    const avoid = s.place?.avoid ?? [];
    const rule = SMALL_FIX.GH435 ? s.place?.rule : undefined;
    const away = rule?.awayFromPlayers, keep = rule?.keepFromDamaging ?? 0;
    let best = SMALL_FIX.R859 ? -Infinity : -1, bx = 0, by = 0, ba = -1;
    for (let tries = 0; tries < 48; tries++) {
      const zi = this.pickZone(zones, s.weights, s.rngPlace);
      if (zi < 0 || !this.drawInZone(zi, s.rngPlace, 'random')) continue;
      const x = this.px, y = this.py;
      let inAvoid = false;
      for (let a = 0; a < avoid.length; a++) if (this.pointInZone(avoid[a], x, y)) { inAvoid = true; break; }
      if (inAvoid) continue;
      if (away && !this.host.awayFromPlayers(x, y, away.base, away.perSize)) continue;
      if (keep > 0 && !this.host.keepsFromDamaging(x, y, req, keep)) continue;
      let room = this.host.roomAt(x, y, req);
      if (SMALL_FIX.R859) {
        if (room < 0) continue;
        if (req.tank !== '' && !isShapeThing(req.tank) && this.host.onOtherBase(x, y, req)) room -= 2;
      }
      if (room > best) { best = room; bx = x; by = y; ba = this.p.zones[zi].areaIdx; }
    }
    if (SMALL_FIX.R859 ? best === -Infinity : best < 0) return false;
    this.px = bx; this.py = by; this.pArea = ba;
    return true;
  }
  drawInZone(z: number, rng: Sfc32, how: string): boolean {
    const c = this.p.zones[z];
    if (c.total <= 0 || c.rects.length === 0) return false;
    if (c.poly !== null) return this.drawInShape(c, rng, how);
    const u = rng.next() * c.total;
    let ri = 0;
    while (ri < c.cum.length - 1 && u >= c.cum[ri]) ri++;
    const x0 = c.rects[ri * 4], y0 = c.rects[ri * 4 + 1], x1 = c.rects[ri * 4 + 2], y1 = c.rects[ri * 4 + 3];
    if (how === 'center') { this.px = (x0 + x1) / 2; this.py = (y0 + y1) / 2; }
    else if (how === 'edge' || how === 'ring') {
      const w = x1 - x0, h = y1 - y0, per = 2 * (w + h);
      let e = rng.next() * per;
      if (e < w) { this.px = x0 + e; this.py = y0; }
      else if ((e -= w) < h) { this.px = x1; this.py = y0 + e; }
      else if ((e -= h) < w) { this.px = x1 - e; this.py = y1; }
      else { e -= w; this.px = x0; this.py = y1 - e; }
    } else { this.px = x0 + rng.next() * (x1 - x0); this.py = y0 + rng.next() * (y1 - y0); }
    this.pArea = c.areaIdx;
    return true;
  }
  private drawInShape(c: { poly: Float64Array | null; x0: number; y0: number; x1: number; y1: number; pmx: number; pmy: number; areaIdx: number }, rng: Sfc32, how: string): boolean {
    const p = c.poly!;
    if (how === 'center') { this.px = c.pmx; this.py = c.pmy; }
    else if (how === 'edge' || how === 'ring') { polyAlong(p, rng.next()); this.px = polyAx; this.py = polyAy; }
    else {
      let found = false;
      for (let t = 0; t < 64 && !found; t++) {
        const x = c.x0 + rng.next() * (c.x1 - c.x0), y = c.y0 + rng.next() * (c.y1 - c.y0);
        if (polyHas(p, x, y)) { this.px = x; this.py = y; found = true; }
      }
      if (!found) { this.px = c.pmx; this.py = c.pmy; }
    }
    this.pArea = c.areaIdx;
    return true;
  }
  private placeForStream(s: Stream, place: CPlace): boolean {
    switch (place.w) {
      case 'subject': this.px = s.runX; this.py = s.runY; this.pArea = -1; return true;
      case 'point': this.px = place.x; this.py = place.y; this.pArea = place.areaIdx; return true;
      case 'homeOf': return s.runHome >= 0 && this.drawInZone(s.runHome, this.ruleRng[s.runRule], 'random');
      default: return false;
    }
  }
  private placeForRun(f: number, place: CPlace): boolean {
    switch (place.w) {
      case 'subject': this.px = this.fX[f]; this.py = this.fY[f]; this.pArea = -1; return true;
      case 'point': this.px = place.x; this.py = place.y; this.pArea = place.areaIdx; return true;
      case 'homeOf': {
        const z = this.homeOfRun(f, place.target);
        if (z < 0) return false;
        return this.drawInZone(z, this.ruleRng[this.fRule[f]], 'random');
      }
      default: {
        if (place.zones.length === 0) return false;
        const z = place.zones[Math.floor(this.ruleRng[this.fRule[f]].next() * place.zones.length)];
        return this.drawInZone(z, this.ruleRng[this.fRule[f]], place.rule.how);
      }
    }
  }

  private spawnerPer(s: CSpawner): number { const v = Math.floor(this.numOfSpawner(s, s.perSpawnOff)); return Number.isFinite(v) && v > 0 ? v : 0; }
  private stepSpawners(now: number): void {
    const list = this.p.spawners;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!this.spOn[i]) continue;
      const totalV = this.numOfSpawner(s, s.totalOff);
      const total = Number.isFinite(totalV) && totalV > 0 ? totalV : Infinity;
      let want = this.spWant[i];
      if (s.mode === 'timer') {
        if (now >= this.spNext[i]) {
          want += this.spawnerPer(s);
          const d = this.numOfSpawner(s, s.everyOff) * 1000;
          this.spNext[i] = Number.isFinite(d) && d > 0 ? this.spNext[i] + d : Infinity;
          if (this.spNext[i] < now) this.spNext[i] = now;
        }
      } else if (s.mode === 'replace' || s.mode === 'maxAlive') {
        const maxV = s.mode === 'replace' ? 1 : Math.floor(this.numOfSpawner(s, s.maxAliveOff));
        const max = Number.isFinite(maxV) ? maxV : 0;
        const queued = this.queuedOfSpawner(i);
        if (this.spAlive[i] + queued < max) {
          if (now >= this.spNext[i]) {
            want += 1;
            const d = this.numOfSpawner(s, s.mode === 'replace' ? s.delayOff : s.refillOff) * 1000;
            this.spNext[i] = now + (Number.isFinite(d) && d > 0 ? d : 0);
          }
        } else if (s.mode === 'replace') {
          const d = this.numOfSpawner(s, s.delayOff) * 1000;
          this.spNext[i] = now + (Number.isFinite(d) ? d : 0);
        }
      }
      this.spWant[i] = 0;
      if (want > 0) {
        const left = total - this.spBorn[i] - this.queuedOfSpawner(i);
        const n = Math.min(want, left);
        if (n > 0) this.feedSpawner(s, n, now);
      }
    }
  }
  private queuedOfSpawner(i: number): number {
    let n = 0;
    for (const st of this.streams) if (st.spawner === i) n += st.left;
    return n;
  }
  private feedSpawner(sp: CSpawner, n: number, now: number): void {
    if (SMALL_FIX.GH408) for (let i = 0; i < this.streams.length; i++) { const q = this.streams[i]; if (q.spawner === sp.idx && q.left > 0 && (q.waitingSince >= 0 || (SMALL_FIX.GH564 !== 0 && q.next <= now))) { q.left += n; return; } }
    const s = this.newStream();
    s.spawner = sp.idx; s.cards = this.p.cardLists[sp.cards];
    const place = this.p.places[sp.place];
    s.place = place; s.zones = place.zones; s.left = n; s.next = now; s.step = 0; s.holds = false; s.side = sp.side; s.showName = sp.showName; s.tags = sp.tags;
    const seed = hash32(this.matchSeed, this.p.behaviors[sp.behavior].id, this.spBorn[sp.idx], 41);
    s.rngCard.seed(seed, hash32(seed, PURPOSE_CARD), 1, 2); s.rngPlace.seed(seed, hash32(seed, PURPOSE_PLACE), 3, 4);
    this.streams.push(s);
  }

  stepAreas(now: number, dtMs: number): void {
    if (this.closing || !this.p.wantAreas) return;
    this.now = now;
    const list = this.host.tanks();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (this.host.isLive(e, e.id)) this.trackBody(e, now);
    }
    const pl = this.host.playerBody();
    if (pl) this.trackBody(pl, now);
    const nWalk = SMALL_FIX.GH362 ? this.liveN : this.bN;
    for (let q = 0; q < nWalk; q++) {
      const i = SMALL_FIX.GH362 ? this.liveRows[q] : q;
      const b = this.bRef[i];
      if (b !== null && this.bIsTank[i] === 0 && this.bType[i] >= 0 && this.bAlive[i] === 1 && this.host.isLive(b, this.bId[i])) this.trackBody(b, now);
    }
    if (this.stayClocks.length > 0) this.stepStayClocks(dtMs);
  }
  private _mask = 0;
  private trackBody(b: MevBody & { _mevIn?: number }, now: number): void {
    const tracked = this.p.tracked;
    const x = this.host.posX(b), y = this.host.posY(b);
    let mask = 0;
    for (let i = 0; i < tracked.length; i++) {
      const z = tracked[i];
      if (this.pointInZone(z, x, y)) mask |= 1 << this.p.zones[z].bit;
    }
    const was = b._mevIn ?? 0;
    if (mask === was) { return; }
    b._mevIn = mask;
    const entered = this.opTrig('area.entered'), left = this.opTrig('area.left');
    for (let i = 0; i < tracked.length; i++) {
      const z = tracked[i], bit = 1 << this.p.zones[z].bit;
      const inNow = (mask & bit) !== 0, inWas = (was & bit) !== 0;
      if (inNow === inWas) continue;
      this.depthNow = 0;
      this.emit(inNow ? entered : left, z, 0, b, b.id, null, '', '', x, y, this.currentWave(), b._mev ?? -1, 0, 0, 0);
      if (inNow) this.openStayClocks(z, b);
    }
    void now;
  }
  private openStayClocks(z: number, b: MevBody): void {
    const stays = this.p.stays;
    for (let i = 0; i < stays.length; i++) {
      const st = stays[i];
      if (st.zone !== z) continue;
      if (st.test >= 0 && !this.testBody(st.test, b, b._mev ?? -1)) continue;
      let hit = false;
      for (const c of this.stayClocks) if (c.stay === i && c.id === b.id) { hit = true; break; }
      if (!hit) this.stayClocks.push({ stay: i, body: b, id: b.id, ms: 0, fired: false, repeats: 0, inside: true });
    }
  }
  whitelistRef(doc: number, word: string, kind: 'type' | 'tag'): number {
    const head = kind + ':';
    if (!word.startsWith(head)) return -1;
    const e = this.refLookup(doc, Number(word.slice(head.length)));
    return e && e.kind === kind ? e.idx : -1;
  }
  evalLive(n: unknown, rng: Sfc32, seconds: number, doc: number): number {
    const s = new NumStore();
    const at = emitNum(s, n);
    this.setCtx(-1);
    this._ctxDoc = doc; this.rng = rng; this.seconds = seconds;
    return runNum(s.code, at, this);
  }
  private _ctxBody: MevBody | null = null;
  private _ctxBodyId = '';
  private stayDue(st: CStay, b: MevBody, id: string): number {
    if (!SMALL_FIX.GH493) return this.numOfRule(st.rule, st.secondsOff) * 1000;
    this._ctxBody = b; this._ctxBodyId = id;
    try { return this.numOfRule(st.rule, st.secondsOff) * 1000; } finally { this._ctxBody = null; this._ctxBodyId = ''; }
  }
  private stepStayClocks(dtMs: number): void {
    const list = this.stayClocks;
    const stays = this.p.stays;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!this.host.isLive(c.body, c.id)) continue;
      const st: CStay = stays[c.stay];
      const z = st.zone;
      const inside = this.pointInZone(z, this.host.posX(c.body), this.host.posY(c.body));
      if (inside) {
        c.ms += dtMs;
        const due = this.stayDue(st, c.body, c.id);
        if (Number.isFinite(due) && due > 0) {
          if (st.repeat) {
            if (SMALL_FIX.GH369) { if (c.ms >= (c.repeats + 1) * due) { c.repeats++; this.fireStay(st, c.body, c.id, c.repeats, c.ms); } }
            else while (c.ms >= (c.repeats + 1) * due) { c.repeats++; this.fireStay(st, c.body, c.id, c.repeats, c.ms); }
          } else if (!c.fired && c.ms >= due) { c.fired = true; this.fireStay(st, c.body, c.id, 1, c.ms); }
        }
      } else if (st.clock === 0) continue;
      else if (st.clock === 2) {
        c.ms -= dtMs;
        if (c.ms <= 0) continue;
        const due = this.stayDue(st, c.body, c.id);
        if (c.fired && c.ms < due) c.fired = false;
        if (st.repeat && Number.isFinite(due) && due > 0) c.repeats = Math.floor(c.ms / due);
      }
      list[w++] = c;
    }
    list.length = w;
  }
  private fireStay(st: CStay, b: MevBody, id: string, count: number, ms: number): void {
    this.depthNow = 0;
    this.emit(this.opTrig('area.stayed'), st.ip, count, b, id, null, '', '', this.host.posX(b), this.host.posY(b), this.currentWave(), b._mev ?? -1, 0, 0, 0);
    void ms;
  }

  opSay(f: number, ip: number): number {
    if (this.fFlags[f] & F_SKIP) return NEXT;
    const code = this.code;
    const to = code[ip + 1];
    const h = this.host;
    const player = h.viewerBody ? h.viewerBody() : h.playerBody();
    if (to === 2) { const s = this.fSubject[f]; if (!s || !(h.isViewer ? h.isViewer(s) : h.isPlayer(s))) return NEXT; }
    else if (to === 1) { const w = code[ip + 4] >= 0 ? this.p.words[code[ip + 4]] : ''; if (!player || !w || this.host.sideOf(player) !== w) return NEXT; }
    else if (to === 3) { const z = code[ip + 5]; if (!player || z < 0 || !this.pointInZone(z, this.host.posX(player), this.host.posY(player))) return NEXT; }
    const life = this.numOf(f, code[ip + 3]);
    this.host.say(this.expand(f, code[ip + 2]), Number.isFinite(life) && life > 0 ? life * 1000 : 10000, this.now);
    return NEXT;
  }
  opLbTeams(f: number, ip: number): number {
    const c = this.code;
    if (c[ip + 1] !== 1) { this.host.lbTeams(false, '', 0, '', '', null); return NEXT; }
    const goal = this.numOf(f, c[ip + 3]);
    const vars = c[ip + 10] === 1 ? [-2, -2, -2, -2] : [c[ip + 6], c[ip + 7], c[ip + 8], c[ip + 9]].map(v => (v >= 0 ? v : -1));
    this.host.lbTeams(true, this.p.texts[c[ip + 2]] ?? '', Number.isFinite(goal) ? goal : 0, this.p.texts[c[ip + 4]] ?? '', this.p.texts[c[ip + 5]] ?? '', vars);
    return NEXT;
  }
  controlWordOf(row: number): string | null {
    if (row < 0 || row >= this.bN || !this.bAlive[row]) return null;
    const t = this.bType[row];
    if (t < 0) return null;
    const c = (this.p.types[t].def as { control?: { word?: string } }).control;
    if (!c || typeof c !== 'object') return null;
    return typeof c.word === 'string' && c.word.trim() ? c.word.trim().slice(0, 24).toLowerCase() : 'tank';
  }
  portalKeepOf(row: number): number {
    if (row < 0 || row >= this.bN) return 0;
    const t = this.bType[row];
    if (t < 0) return 0;
    const v = (this.p.types[t].def as { portalKeep?: number }).portalKeep;
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(3000, v)) : 0;
  }
  shapeSideOf(row: number): string { return row >= 0 && row < this.bN ? this.bSide[row] : ''; }
  setShapeSide(row: number, word: string): void { if (row >= 0 && row < this.bN && !this.bIsTank[row]) this.bSide[row] = word; }
  carryLineOf(row: number): string | null {
    if (row < 0 || row >= this.bN || !this.bAlive[row]) return null;
    const t = this.bType[row];
    if (t < 0) return null;
    const c = (this.p.types[t].def as { carry?: { line?: string } }).carry;
    return c && typeof c === 'object' ? (typeof c.line === 'string' ? c.line.slice(0, 120) : '') : null;
  }
  carryDefOf(row: number): { by?: unknown; one?: unknown; follow?: unknown } | null {
    if (row < 0 || row >= this.bN || !this.bAlive[row]) return null;
    const t = this.bType[row];
    if (t < 0) return null;
    const c = (this.p.types[t].def as { carry?: unknown }).carry;
    return c && typeof c === 'object' ? c as { by?: unknown; one?: unknown; follow?: unknown } : null;
  }
  sideCount(n: number): number {
    const word = 'team' + n;
    let k = 0;
    const b = this.host.playerBody();
    if (b && this.host.sideOf(b) === word) k++;
    const list = this.host.tanks();
    for (let j = 0; j < list.length; j++) { const e = list[j]; if (this.host.isLive(e, e.id) && this.host.sideOf(e) === word) k++; }
    if (this.host.sideWaiting !== undefined) k += this.host.sideWaiting(word);
    return k;
  }
  lbTeamValue(vi: number): number { return vi >= 0 && vi < this.vars.length ? this.vars[vi] : NaN; }
  opHudShow(f: number, ip: number): number {
    const words = this.expand(f, this.code[ip + 1], true);
    this.hudDoc = this.p.rules[this.fRule[f]].doc;
    this.hudBody = SMALL_FIX.G696 !== 0 ? this.subjectNow(f) : null; this.hudBodyId = this.hudBody !== null ? this.fSubjectId[f] : '';
    this.hudPattern = /\{\d+\}/.test(words) ? words : '';
    this.hudLine = this.hudPattern !== '' ? this.hudRead() : _unLink(words);
    this.hudNext = this.now + HUD_LIVE_MS;
    this.host.showOnHud(this.hudLine);
    return NEXT;
  }
  private hudPattern = '';
  private hudNext = 0;
  private hudDoc = 0;
  private hudBody: MevBody | null = null;
  private hudBodyId = '';
  private hudRead(): string {
    this._ctxDoc = this.hudDoc;
    const pb = this._ctxBody, pid = this._ctxBodyId;
    if (this.hudBody !== null) { this._ctxBody = this.hudBody; this._ctxBodyId = this.hudBodyId; }
    try { return _unLink(this.hudPattern.replace(/\{(\d+)\}/g, (all, w: string) => this.chipWords(-1, w, all))); }
    finally { this._ctxBody = pb; this._ctxBodyId = pid; }
  }
  private hudLive(now: number): void {
    if (this.hudPattern === '' || now < this.hudNext) return;
    this.hudNext = now + HUD_LIVE_MS;
    const line = this.hudRead();
    if (line !== this.hudLine) { this.hudLine = line; this.host.showOnHud(line); }
  }
  hudTimerCount(): number { return this.hudTimers.length; }
  hudTimerLine(k: number): string {
    const t = this.hudTimers[k];
    if (this.tState[t] === 0) return '';
    const s = Math.ceil(this.timerLeft(t));
    if (s !== this.hudTimerSec[k]) { this.hudTimerSec[k] = s; this.hudTimerText[k] = `${this.p.timers[t].name}: ${s}`; }
    return this.hudTimerText[k];
  }
  private hudTimers: number[] = [];
  private hudTimerSec = new Int32Array(0);
  private hudTimerText: string[] = [];
  private planOfStep(ip: number): number {
    const c = this.code[ip + 1];
    if (c === -2) return -1;
    if (c >= 0) return c;
    return this.p.plans.length > 0 ? 0 : -1;
  }
  opWaveNext(f: number, ip: number): number { const i = this.planOfStep(ip); if (i >= 0) this.waveNext(i); void f; return NEXT; }
  waveNext(i: number): void {
    const ph = this.pPhase[i];
    if (ph === PH_IDLE || ph === PH_DONE || ph === PH_STOPPED) return;
    if (ph === PH_RUNNING) {
      const last = this.p.plans[i].def.last;
      if (typeof last === 'number' && this.pWave[i] >= last) return;
      if (this.pPick[i] > 0) { this.pWave[i] = this.pPick[i]; this.pPick[i] = 0; } else this.pWave[i]++;
    }
    this.startWave(i, this.pWave[i], SMALL_FIX.GH495 && this.pPausedAt[i] >= 0 ? this.pPausedAt[i] : this.now);
  }
  opWaveSet(f: number, ip: number): number {
    const i = this.planOfStep(ip);
    if (i < 0) return NEXT;
    const n = Math.floor(this.numOf(f, this.code[ip + 2]));
    if (!Number.isFinite(n) || n < 1) return NEXT;
    if (SMALL_FIX.GH535) {
      const last = this.p.plans[i].def.last;
      if ((typeof last === 'number' && n > last) || n > 2147483647) { this.guard(`"${this.p.plans[i].name}": Set The Wave ${n} is past its Last Wave. The wave stays as it is.`, this.fRule[f]); return NEXT; }
    }
    this.waveSet(i, n);
    return NEXT;
  }
  waveSet(i: number, n: number): void {
    this.pWave[i] = n;
    if (this.pPhase[i] === PH_RUNNING) { this.pPhase[i] = PH_BREAK; this.pNextAt[i] = this.now; }
  }
  opWavePause(f: number, ip: number): number { const i = this.planOfStep(ip); if (i >= 0) this.wavePause(i); void f; return NEXT; }
  pickWave(i: number, n: number): 'next' | 'after' | 'past' | '' {
    const ph = this.pPhase[i];
    if (this.p.plans[i].off || ph === PH_DONE || ph === PH_STOPPED || !(n >= 1)) return '';
    const last = this.p.plans[i].def.last;
    if (typeof last === 'number' && n > last) return 'past';
    this.pPick[i] = n;
    return ph === PH_RUNNING ? 'next' : 'after';
  }
  wavePause(i: number): void { if (this.pPausedAt[i] < 0) this.pPausedAt[i] = this.now; }
  opWaveResume(f: number, ip: number): number { const i = this.planOfStep(ip); if (i >= 0) this.waveResume(i); void f; return NEXT; }
  waveResume(i: number): void {
    if (this.pPausedAt[i] < 0) return;
    const d = this.now - this.pPausedAt[i];
    this.pPausedAt[i] = -1;
    this.pNextAt[i] += d;
    this.pWaveAt[i] += d;
    for (const s of this.streams) if (s.plan === i) s.next += d;
  }
  opWaveStop(f: number, ip: number): number {
    const i = this.planOfStep(ip);
    if (i < 0) return NEXT;
    this.pPhase[i] = PH_STOPPED;
    this.pToBorn[i] = 0;
    for (const s of this.streams) if (s.plan === i) s.left = 0;
    void f;
    return NEXT;
  }
  opWallsMove(f: number, ip: number): number {
    const c = this.code;
    this.host.wallsMove?.(c[ip + 1] === 1, this.numOf(f, c[ip + 2]), this.numOf(f, c[ip + 3]));
    return NEXT;
  }
  opWallsRetype(f: number, ip: number): number {
    const c = this.code;
    this.host.wallsRetype?.(this.numOf(f, c[ip + 1]), this.numOf(f, c[ip + 2]));
    return NEXT;
  }
  wallMatch(list: number, s: number): boolean { const l = list >= 0 ? this.p.intLists[list] : undefined; return !l || l.length === 0 || l.indexOf(this.sigKey[s]) >= 0; }
  wantsWallTouch(): boolean { return this.wants(this.opTrig('wall.touched')) || this.wants(this.opTrig('wall.left')); }
  noteWallTouch(b: MevBody, kind: number, on: boolean): void {
    if (this.closing) return;
    this.depthNow = 0;
    const m = b._mev ?? -1, row = SMALL_FIX.GH549 !== 0 && m >= 0 && m < this.bN && this.bRef[m] === b ? m : -1;
    this.emit(this.opTrig(on ? 'wall.touched' : 'wall.left'), kind, 0, b, b.id, null, '', '', this.host.posX(b), this.host.posY(b), this.currentWave(), row, 0, 0, 0);
  }
  opRespawnSet(f: number, ip: number): number {
    const w = this.code[ip + 1] >= 0 ? this.p.words[this.code[ip + 1]] : '';
    if (w) this.host.respawnSet(w, this.code[ip + 2] === 1);
    void f;
    return NEXT;
  }
  opMatchEnd(f: number, ip: number): number {
    const code = this.code;
    const w = code[ip + 2] >= 0 ? this.p.words[code[ip + 2]] : '';
    const result = code[ip + 1] === 1 ? 'win' : 'lose';
    const then = code[ip + 3] === 1 ? 'closeArena' : 'nothing';
    this.host.matchEnd(result, w, then, this.now, this.p.texts[code[ip + 4]] ?? '', this.p.texts[code[ip + 5]] ?? '', this.p.texts[code[ip + 6]] ?? '');
    if (then === 'closeArena') { this.close(); return END; }
    void f;
    return NEXT;
  }
  opTreeSwap(f: number, ip: number): number {
    const a = this.code[ip + 1], b = this.code[ip + 2];
    if (a >= 0) this.host.treeSwap(this.p.tanks[a], b >= 0 ? this.p.tanks[b] : '');
    void f;
    return NEXT;
  }

  runsAlive(): number { return this.fAlive; }
  queued(): number { let n = 0; for (const s of this.streams) n += s.left; return n; }
  spawnPlaceState(side: string, alias: string): number {
    let has = false;
    if (SMALL_FIX.GH470) {
      for (let i = 0; i < this.spRows.length; i++) {
        const r = this.spRows[i], t = this.spRowTeams[r];
        if (!t || !(t.includes(side) || (alias !== '' && t.includes(alias)))) continue;
        has = true;
        if (this.spRowOn[r] === 1) return 1;
      }
      return has ? -1 : 0;
    }
    const list = this.p.spawnPlaceZones;
    for (let i = 0; i < list.length; i++) {
      const t = this.p.zones[list[i]].spawnTeams;
      if (!t || !(t.includes(side) || (alias !== '' && t.includes(alias)))) continue;
      has = true;
      if (this.zoneSpawnOn[list[i]] === 1) return 1;
    }
    return has ? -1 : 0;
  }
  spawnPlaceDraw(side: string, alias: string, free: (x: number, y: number) => boolean): boolean {
    const list = this.p.spawnPlaceZones;
    const open: number[] = [];
    if (SMALL_FIX.GH470) {
      for (let i = 0; i < this.spRows.length; i++) {
        const r = this.spRows[i], t = this.spRowTeams[r], z = this.p.behaviors[r].zone;
        if (t && (t.includes(side) || (alias !== '' && t.includes(alias))) && this.spRowOn[r] === 1 && !open.includes(z)) open.push(z);
      }
    } else for (let i = 0; i < list.length; i++) {
      const t = this.p.zones[list[i]].spawnTeams;
      if (t && (t.includes(side) || (alias !== '' && t.includes(alias))) && this.zoneSpawnOn[list[i]] === 1) open.push(list[i]);
    }
    if (open.length === 0) return false;
    const rng = this.rngOf(OWN_SPAWN_PLACE, 0, 0);
    let any = false;
    for (let tries = 0; tries < 40; tries++) {
      if (!this.drawInZone(open[Math.floor(rng.next() * open.length)], rng, 'random')) continue;
      any = true;
      if (free(this.px, this.py)) return true;
    }
    return any;
  }
  spawnPlaceOpen(z: number): boolean { return this.zoneSpawnOn[z] === 1; }
  skipBreak(i: number): void { if (this.pPhase[i] === PH_BREAK || this.pPhase[i] === PH_DELAY) this.pNextAt[i] = SMALL_FIX.GH495 && this.pPausedAt[i] >= 0 ? this.pPausedAt[i] : this.now; }
  skipRuns(rule: number): void {
    for (let f = 0; f < this.fCap; f++) if (this.fLive[f] && this.fRule[f] === rule) this.fFlags[f] |= F_SKIP;
    for (let i = 0; i < this.hN; i++) if (this.fRule[this.hRun[i]] === rule) this.hTime[i] = this.now;
    this.reheap();
  }
  private scenes: Scene[] = [];
  private sceneCut = Infinity;
  private sceneWord = 0;
  private sceneDone(s: Scene): void {
    const i = this.scenes.indexOf(s);
    if (i >= 0) this.scenes.splice(i, 1);
    if (SMALL_FIX.GH492 && i >= 0 && s.parent !== null) {
      const p = s.parent;
      p.kids--;
      if (p.runs <= 0 && p.kids <= 0 && this.scenes.indexOf(p) >= 0) { this.sceneDone(p); return; }
    }
    this.sceneRefresh();
  }
  private sceneRefresh(): void {
    let word = 0, cut = Infinity;
    for (let i = 0; i < this.scenes.length; i++) {
      const s = this.scenes[i], q = s.seq;
      if (q.lockInput) word |= SCENE_HELD;
      if (q.guardsHeld) word |= SCENE_GUARD;
      if (q.stopsBots) word |= SCENE_STOP;
      if (q.skippable) word |= SCENE_SKIP;
      if (s.until < cut) cut = s.until;
    }
    this.sceneCut = cut;
    if (word === this.sceneWord) return;
    this.sceneWord = word;
    this.host.sceneHold((word & SCENE_HELD) !== 0, (word & SCENE_GUARD) !== 0, (word & SCENE_STOP) !== 0, (word & SCENE_SKIP) !== 0);
  }
  private cutScenes(now: number): void {
    for (let i = 0; i < this.scenes.length;) {
      const s = this.scenes[i];
      if (s.until > now) { i++; continue; }
      s.until = Infinity;
      this.tr(`sequence cut off: ${s.seq.name}`);
      if (SMALL_FIX.GH554 !== 0) {
        for (let r = 0; r < this.ruleQueue.length; r++) {
          const q = this.ruleQueue[r];
          if (!q) continue;
          for (let k = q.length - 1; k >= 0; k--) {
            const n = q[k];
            if (!n.scene || !sceneHas(n.scene, s)) continue;
            q.splice(k, 1);
            this.lastQueued = null;
            this.queuedBegun(n, -1);
          }
        }
      }
      for (let f = 0; f < this.fCap; f++) if (this.fLive[f] && sceneHas(this.fScene[f], s)) this.endRun(f);
      i = 0;
    }
    this.sceneRefresh();
  }
  private scenesDrop(): void { this.scenes.length = 0; this.sceneRefresh(); }
  skipScenes(): boolean {
    if ((this.sceneWord & SCENE_SKIP) === 0) return false;
    for (let f = 0; f < this.fCap; f++) {
      if (!this.fLive[f]) continue;
      for (let s = this.fScene[f]; s !== null; s = s.parent) if (s.seq.skippable) { this.fFlags[f] |= F_SKIP; break; }
    }
    for (let i = 0; i < this.hN; i++) if (this.fFlags[this.hRun[i]] & F_SKIP) this.hTime[i] = this.now;
    this.reheap();
    return true;
  }
  skipWaitsOf(rule: number): void {
    for (let i = 0; i < this.hN; i++) if (this.fRule[this.hRun[i]] === rule) this.hTime[i] = this.now;
    this.reheap();
  }
  private reheap(): void {
    const n = this.hN;
    const time = Array.from(this.hTime.subarray(0, n)), order = Array.from(this.hOrder.subarray(0, n)), run = Array.from(this.hRun.subarray(0, n)), gen = Array.from(this.hGen.subarray(0, n));
    this.hN = 0;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i);
    if (SMALL_FIX.GH575 !== 0) idx.sort((a, b) => order[a] - order[b]);
    for (let q = 0; q < n; q++) {
      const i = idx[q];
      if (this.fGen[run[i]] !== gen[i]) continue;
      this.pushWake(run[i], time[i]);
    }
  }
  monitorPlans(): { index: number; name: string; wave: number; phase: string; seconds: number | null; paused: boolean; holders: number; toBorn: number; specials: { id: number; name: string }[]; forced: number }[] {
    const WORD = ['Not Started', 'First Wait', 'Coming', 'Break', 'Finished', 'Stopped'];
    return this.p.plans.map((c, i) => {
      let holders = 0;
      for (let r = 0; r < this.bN; r++) if (this.bAlive[r] && this.bHoldPlan[r] === i) holders++;
      const waiting = this.pPhase[i] === PH_BREAK || this.pPhase[i] === PH_DELAY;
      return { index: i, name: c.name, wave: this.pWave[i], phase: WORD[this.pPhase[i]] ?? '', seconds: waiting ? Math.max(0, Math.round((this.pNextAt[i] - this.now) / 1000)) : null, paused: this.pPausedAt[i] >= 0, holders, toBorn: this.pToBorn[i], specials: (c.def.specials ?? []).map(s => ({ id: s.id, name: s.name })), forced: this.forcedSpecial[i] ?? -1 };
    });
  }
  monitorRules(): { index: number; name: string; fired: number; failed: number; ran: number; live: number }[] {
    return this.p.rules.map((r, i) => ({ index: i, name: r.name, fired: this.ruleFired[i], failed: this.ruleFailed[i], ran: this.ruleRan[i], live: this.ruleLive[i] }));
  }
  monitorBodies(): { row: number; id: string; name: string; type: string; form: string; health: number; x: number; y: number; placed: boolean }[] {
    const out: { row: number; id: string; name: string; type: string; form: string; health: number; x: number; y: number; placed: boolean }[] = [];
    for (let r = 0; r < this.bN; r++) {
      if (!this.bAlive[r]) continue;
      const b = this.bRef[r];
      if (!b) continue;
      const t = this.p.types[this.bType[r]];
      out.push({ row: r, id: this.bId[r], name: this.bName[r] || t?.name || this.host.shownNameOf(b) || 'A body', type: t?.name ?? '', form: this.p.forms[this.bForm[r]]?.def.name ?? '', health: Math.round(this.host.healthShare(b) * 100), x: this.host.posX(b), y: this.host.posY(b), placed: this.bSlot[r] >= 0 && !!this.p.slots[this.bSlot[r]]?.placed });
    }
    return out;
  }
  monitorLog(): { key: number; text: string; x: number | null; y: number | null }[] {
    const out: { key: number; text: string; x: number | null; y: number | null }[] = [];
    for (let k = 0; k < this.logCount; k++) {
      const at = ((this.logHead - 1 - k + LOG_RING * 2) % LOG_RING) * 5;
      const time = this.log[at], kind = this.log[at + 1], rule = this.log[at + 2], a = this.log[at + 3], b = this.log[at + 4];
      const clock = `${Math.floor(time / 60000)}:${String(Math.floor(time / 1000) % 60).padStart(2, '0')}`;
      const name = rule >= 0 ? this.p.rules[rule]?.name ?? '' : '';
      let text = '';
      switch (kind) {
        case LOG_FIRED: text = `${name}: started, wave ${b}`; break;
        case LOG_REFUSED: text = `${name}: already running, ignored`; break;
        case LOG_RAN: text = `${name}: ran`; break;
        case LOG_GUARD: text = `${name ? name + ': ' : ''}a guard stopped it`; break;
        case LOG_COND_FAILED: text = `${name}: its test said no`; break;
        case LOG_WAVE: text = `Wave ${b} of ${this.p.plans[a]?.name ?? ''}`; break;
        case LOG_BIRTH: text = `Born: ${this.p.groups[a]?.name ?? 'a Map Event\'s'}, wave ${b}`; break;
        case LOG_DEATH: text = `Died: ${a >= 0 && a < this.bN ? (this.bName[a] || this.p.types[this.bType[a]]?.name || '') : ''}`; break;
        default: text = name || 'A step';
      }
      out.push({ key: k, text: `${clock}  ${text}`, x: null, y: null });
    }
    return out;
  }
  testRule(rule: number): boolean {
    const r = this.p.rules[rule];
    if (!r || r.cond === 0) return true;
    return this.peekCond(rule);
  }
  private peekCond(rule: number): boolean {
    const f = this.findFreeRun();
    if (f < 0) return false;
    const r = this.p.rules[rule];
    this.fRule[f] = rule; this.fSubject[f] = null; this.fSubjectId[f] = ''; this.fOther[f] = null; this.fOtherId[f] = ''; this.fFlags[f] = F_FREE;
    const out = this.evalCond(f, r.cond);
    return out;
  }
  private findFreeRun(): number { for (let f = 0; f < this.fCap; f++) if (!this.fLive[f]) return f; return -1; }
  forceSpecial(plan: number, specialId: number): void { this.forcedSpecial[plan] = specialId; }
  private forcedSpecial: number[] = [];
  debugKill(row: number): void { const b = this.bRef[row]; if (b && this.bAlive[row]) this.host.kill(b, false); }
  fireByName(name: string): boolean {
    const n = name.toLowerCase();
    const r = this.p.rules.findIndex(x => x.name.toLowerCase() === n);
    if (r >= 0) { this.runNow(r, null); return true; }
    const s = this.p.signals.findIndex(x => x.name.toLowerCase() === n);
    if (s >= 0) { this.depthNow = 0; this.emit(this.opTrig('signal.got'), SMALL_FIX.GH522 ? -1 : s, 0, null, '', null, '', '', 0, 0, this.currentWave(), -1, SMALL_FIX.GH522 ? s + 1 : 0, 0, 0); return true; }
    return false;
  }
  killByName(name: string): boolean {
    const n = name.toLowerCase();
    let hit = false;
    for (let r = 0; r < this.bN; r++) if (this.bAlive[r] && (this.bName[r].toLowerCase() === n || this.p.types[this.bType[r]]?.name.toLowerCase() === n)) { this.debugKill(r); hit = true; }
    return hit;
  }
  runNow(rule: number, subject: MevBody | null): number {
    return this.startRun(rule, subject, subject ? subject.id : '', null, '', '', subject ? this.host.posX(subject) : 0, subject ? this.host.posY(subject) : 0, 1, this.currentWave(), 0, -1, subject ? subject._mev ?? -1 : -1, false);
  }
}

function cmpOp(op: number, a: number, b: number): boolean {
  switch (op) {
    case 0: return a === b;
    case 1: return a !== b;
    case 2: return a < b;
    case 3: return a <= b;
    case 4: return a > b;
    case 5: return a >= b;
  }
  return false;
}
function g32(a: Int32Array, n: number): Int32Array { const o = new Int32Array(n); o.set(a); return o; }
function g8(a: Uint8Array, n: number): Uint8Array { const o = new Uint8Array(n); o.set(a); return o; }
function g64(a: Float64Array, n: number): Float64Array { const o = new Float64Array(n); o.set(a); return o; }
function weightedWord(list: readonly { word: string; weight: number }[], rng: Sfc32): string {
  let total = 0;
  for (const e of list) total += e.weight;
  if (!(total > 0)) return list.length > 0 ? list[0].word : '';
  let u = rng.next() * total;
  for (const e of list) { u -= e.weight; if (u < 0) return e.word; }
  return list[list.length - 1].word;
}
void CAUSE_OTHER;

function samePickList(a: readonly { word: string; weight: number }[], b: readonly { word: string; weight: number }[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].word !== b[i].word || a[i].weight !== b[i].weight) return false;
  return true;
}
