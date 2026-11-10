import type {
  Id, Ref, Row, BodyTest, MapEventsDoc, Target, Place, PlaceRule, EntityType, EntityForm, FormLink, Rule, Sequence, SpawnCard,
  SpawnGroup, WavePlan, ZoneLike, SpawnBehaviorArgs, MatchRules, TankPick, SideSpec, StatusDef, WaveTest, MapTank,
} from './doc';
import { MAP_TANK_HEAD } from './thingWord';
import { EVENTS_DOC_VERSION, behaviorsOf, rectsOf, zoneShapeOf, DEFAULT_PLACE_RULE } from './doc';
import { shapeWorldPoly, polyArea, polyMiddle, polyMx, polyMy, polyCrosses, polyFillArea } from '../areaShape';
import { NumStore, emitNum } from './num';
import { kindOf, slotOf, OP_END, OP_JUMP, OP_IF, OP_PICK, OP_REPEAT_INIT, OP_REPEAT_TEST, OP_FOREACH, OP_FORK, OP_WAITUNTIL, OP_CALL, OP_PLAY, OP_CLIST } from './registry';
import type { Field, KindDef, RefOf } from './registry';
import { SMALL_FIX } from '../smallFixSwitch';
import { colourCodeOf } from './colourWord';

export interface CompileDoc {
  doc: MapEventsDoc | null | undefined;
  zones: readonly ZoneLike[];
  areaId: string;
  areaIdx: number;
  originX: number; originY: number; cell: number;
  gridCells: number; gridCellsY: number;
}

export interface CompileOptions {
  tankExists?: (word: string) => boolean;
  shapeExists?: (word: string) => boolean;
}

export interface Problem {
  code: string;
  text: string;
  doc: number;
  id: Id;
  warn?: boolean;
}

export interface CZone {
  idx: number; uid: Id; name: string; doc: number; areaIdx: number;
  rects: number[]; cum: number[]; total: number;
  x0: number; y0: number; x1: number; y1: number;
  poly: Float64Array | null; pmx: number; pmy: number;
  bit: number;
  spawnTeams: string[]; spawnOn: boolean;
  zone: ZoneLike;
}
export function refStride(): number { return SMALL_FIX.GH487 ? 1073741824 : 67108864; }
export interface CBehavior { idx: number; id: Id; k: string; zone: number; on: boolean; a: Record<string, unknown>; spareTypes?: number[]; spareTags?: number[]; solidTest?: number; }
export interface CLink { to: number; team: 'form' | 'killer'; fallback: string; graceOff: number; delayOff: number; among: number[]; refill: 'none' | 'shield' | 'all'; }
export interface CForm {
  idx: number; local: number; type: number; id: Id; name: string; def: EntityForm;
  side: SideSpec; tags: number[];
  orderIdx: number;
  tankSlot: number;
  onDeath: number; after: number; afterHow: 'morph' | 'become';
}
export interface CType { idx: number; id: Id; name: string; doc: number; def: EntityType; forms: number[]; slot: number; implicit: boolean; }
export interface CSlot { idx: number; type: number; placed: boolean; id: Id; name: string; base: number; x: number; y: number; angle: number; home: number; startLocal: number; areaIdx: number; showName: boolean | null; off: boolean;
  spots: number[]; }
export interface CCard { id: Id; typeIdx: number; shape: string; weight: number; uniqueAlive: boolean; size: [number, number] | null; from: number; to: number; cost: number; }
export interface CGroup {
  idx: number; id: Id; plan: number; name: string; cards: number; at: number[]; atPlan: boolean; dead: boolean; split: 'shared' | 'each'; weights: number[] | null;
  place: number; holds: boolean; side: SideSpec; showName: boolean | null; tags: number[]; def: SpawnGroup;
}
export interface CPlan { idx: number; id: Id; name: string; doc: number; def: WavePlan; off: boolean; groupByPlanId: Map<Id, number>; areas: number[]; areaBeh: number[]; first: number; startSignal: number; startDelayOff: number; advanceSecondsOff: number; aliveBelowOff: number; }
export interface CPlace { w: 'in' | 'subject' | 'point' | 'homeOf'; zones: number[]; atPlan: boolean; rule: PlaceRule; avoid: number[]; x: number; y: number; target: number; areaIdx: number; dead: boolean; }
export interface CTarget { w: string; idx: number; word: string; inner: number; nOff: number; how: 'random' | 'nearest' | 'lowestHealth'; }
export interface CTest {
  types: number[]; tags: number[]; tanks: string[]; teams: string[]; groups: number[]; forms: number[]; boss: number; player: number;
  colours: number[];
  viewer: number;
}
export interface CRule {
  idx: number; id: Id; name: string; doc: number; hidden: boolean; start: number; cond: number;
  policy: 0 | 1 | 2 | 3; perSubject: boolean; maxRuns: number; once: boolean; cooldownMs: number; everyNth: number; outlives: boolean; off: boolean;
  nLocals: number; owner: number; seq: number;
}
export interface CTrig { rule: number; ip: number; }
export interface CClock { rule: number; kind: 'at' | 'every'; atOff: number; firstOff: number; everyOff: number; times: number; }
export interface CWatch { rule: number; ip: number; tag: number; type: number; team: string; n: number; dir: 0 | 1 | 2; }
export interface CVarWatch { rule: number; ip: number; varIdx: number; op: number; valueOff: number; }
export interface CStay { rule: number; ip: number; zone: number; test: number; secondsOff: number; clock: 0 | 1 | 2; repeat: boolean; }
export interface CTimer { idx: number; id: Id; name: string; doc: number; secondsOff: number; marks: number[]; repeat: boolean; showOnHud: boolean; }
export interface CVar { idx: number; id: Id; name: string; kind: string; start: number; scope: 'match' | 'team' | 'body'; }
export interface CStatus { idx: number; id: Id; name: string; doc: number; def: StatusDef; secondsOff: number; stack: 0 | 1 | 2; endsOnDeath: boolean; endsOnTankChange: boolean; effects: { k: string; a: Record<string, unknown>; tag: number }[]; }
export interface CSpawner {
  idx: number; zone: number; behavior: number; mode: 'timer' | 'replace' | 'maxAlive' | 'signal'; cards: number; everyOff: number; perSpawnOff: number; delayOff: number; maxAliveOff: number; refillOff: number; totalOff: number; startOff: number;
  place: number; side: SideSpec; on: boolean; showName: boolean | null; signal: number; tags: number[];
}
export interface COrder { k: string; doc: number; tag: number; radiusOff: number; speedOff: number; gapOff: number; turnOff: number; whoLeader: boolean; elseTag: number; a: Record<string, unknown>; }
export interface CSeq { idx: number; id: Id; name: string; rule: number; starts: number[]; skippable: boolean; lockInput: boolean; guardsHeld: boolean; stopsBots: boolean; timeoutMs: number; }

export interface Program {
  code: Int32Array; num: Float64Array;
  texts: string[]; textTokens: Uint8Array;
  words: string[]; lists: string[][]; intLists: number[][]; tanks: string[]; tankPicks: { list: { word: string; weight: number }[]; once: boolean; site?: boolean }[];
  targets: CTarget[]; tests: CTest[]; places: CPlace[]; cardLists: CCard[][];
  zones: CZone[]; behaviors: CBehavior[]; types: CType[]; forms: CForm[]; slots: CSlot[]; links: CLink[]; slotTankCount: number;
  plans: CPlan[]; groups: CGroup[]; rules: CRule[]; timers: CTimer[]; vars: CVar[]; statuses: CStatus[]; signals: { id: Id; name: string }[]; tags: { id: Id; name: string }[];
  seqs: CSeq[]; spawners: CSpawner[]; orders: COrder[];
  byKind: (CTrig[] | undefined)[];
  clocks: CClock[]; watches: CWatch[]; varWatches: CVarWatch[]; stays: CStay[];
  tracked: number[];
  wantDeath: boolean; wantAnyDeath: boolean; wantAreas: boolean;
  match: MatchRules; seed: number | null;
  foodInDoc: number;
  problems: Problem[];
  hasContent: boolean;
  docIds: string[];
  spawnPlaceZones: number[];
  waveTests: WaveTest[];
  refIds: Map<number, { kind: string; idx: number }>;
  mapTanks: Map<string, { name: string; data: Record<string, unknown> }>;
  spawnRead: Set<number>;
}

const MAX_TRACKED_AREAS = 32;
function asList<T>(v: T[] | undefined | null | unknown): T[] { return Array.isArray(v) ? v as T[] : []; }
function liveRowsOnly(_k: string, v: unknown): unknown {
  return v !== null && typeof v === 'object' && (v as { off?: unknown }).off === true && typeof (v as { k?: unknown }).k === 'string' ? undefined : v;
}
const isRow = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
function wordsOnly(rows: readonly Row[], depth: number): boolean {
  if (depth > 16) return false;
  for (const r of rows) {
    if (!isRow(r) || r.off) continue;
    if (r.k === 'say' || r.k === 'wait') continue;
    if (r.k === 'if') {
      const a = (r.a ?? {}) as Record<string, unknown>;
      if (!wordsOnly(Array.isArray(a.then) ? a.then as Row[] : [], depth + 1) || !wordsOnly(Array.isArray(a.else) ? a.else as Row[] : [], depth + 1)) return false;
      continue;
    }
    return false;
  }
  return true;
}
const MAX_LOCALS = 8;

const EMPTY_DOC: MapEventsDoc = { v: 1, nextId: 1 };
export function compileEvents(input: readonly CompileDoc[], opts: CompileOptions = {}): Program {
  const docs = input.map(d => d.doc || !d.zones.some(z => Array.isArray(z.behaviors) && z.behaviors.length > 0) ? d : { ...d, doc: EMPTY_DOC });
  return new Compiler(docs, opts).run();
}

class Compiler {
  store = new NumStore();
  code: number[] = [OP_END];
  p: Program;
  ids = new Map<number, { kind: string; idx: number }>();
  txtMap = new Map<string, number>();
  wordMap = new Map<string, number>();
  tankMap = new Map<string, number>();
  docIdx = 0;
  ruleNow: CRule | null = null;
  localsNow = 0;
  wordsOnlyNow = false;
  hiddenId = -1;

  constructor(private input: readonly CompileDoc[], private opts: CompileOptions) {
    this.p = {
      code: new Int32Array(0), num: new Float64Array(0), texts: [], textTokens: new Uint8Array(0), words: [], lists: [], intLists: [], tanks: [], tankPicks: [],
      targets: [], tests: [], places: [], cardLists: [], zones: [], behaviors: [], types: [], forms: [], slots: [], links: [], slotTankCount: 0,
      plans: [], groups: [], rules: [], timers: [], vars: [], statuses: [], signals: [], tags: [], seqs: [], spawners: [], orders: [], byKind: [], clocks: [], watches: [], varWatches: [], stays: [],
      tracked: [], wantDeath: false, wantAnyDeath: false, wantAreas: false, match: {}, seed: null, problems: [], hasContent: false, docIds: [], spawnPlaceZones: [], waveTests: [], refIds: new Map(), mapTanks: new Map(), foodInDoc: -1, spawnRead: new Set(),
    };
  }

  problem(code: string, text: string, id: Id = 0, warn = false): void {
    this.p.problems.push({ code, text, doc: this.docIdx, id, warn });
  }
  key(doc: number, id: number): number { return doc * refStride() + id; }
  bind(id: unknown, kind: string, idx: number): void { if (typeof id === 'number') this.ids.set(this.key(this.docIdx, id), { kind, idx }); }

  res(ref: unknown, kind: RefOf | string): number {
    if (!ref || typeof ref !== 'object') return -1;
    const r = ref as Ref;
    if (typeof r.id !== 'number') return -1;
    let doc = this.docIdx;
    if (typeof r.a === 'string' && r.a !== this.p.docIds[doc]) {
      doc = this.p.docIds.indexOf(r.a);
      if (doc < 0) return -1;
    }
    const e = this.ids.get(this.key(doc, r.id));
    if (!e || e.kind !== kind) return -1;
    return e.idx;
  }

  text(s: unknown): number {
    const v = typeof s === 'string' ? s : '';
    const hit = this.txtMap.get(v);
    if (hit !== undefined) return hit;
    const i = this.p.texts.length;
    this.p.texts.push(v);
    this.txtMap.set(v, i);
    return i;
  }
  word(s: unknown): number {
    const v = typeof s === 'string' ? s : '';
    const hit = this.wordMap.get(v);
    if (hit !== undefined) return hit;
    const i = this.p.words.length;
    this.p.words.push(v);
    this.wordMap.set(v, i);
    return i;
  }
  mapTankWord(word: string, d: number): string { return SMALL_FIX.GH391 && d > 0 && typeof word === 'string' && word.startsWith(MAP_TANK_HEAD) ? word + '@' + d : word; }
  tank(word: string): number {
    word = this.mapTankWord(word, this.docIdx);
    const hit = this.tankMap.get(word);
    if (hit !== undefined) return hit;
    if (typeof word === 'string' && word.startsWith(MAP_TANK_HEAD)) {
      if (!this.p.mapTanks.has(word)) this.problem('missing-tank', 'A form names a tank of this map that is gone. Nothing spawns for it.'); }
    else if (this.opts.tankExists && !this.opts.tankExists(word)) this.problem('missing-tank', 'There is no tank "' + word + '" in this game. Nothing spawns for it, and the word is kept.');
    const i = this.p.tanks.length;
    this.p.tanks.push(word);
    this.tankMap.set(word, i);
    return i;
  }
  tankPick(p: TankPick | undefined): number {
    if (typeof p === 'string') return p ? this.tank(p) : -1 - this.emptyPick();
    if (p && typeof p === 'object' && Array.isArray(p.list) && p.list.length > 0) {
      for (const e of p.list) this.tank(e.word);
      this.p.tankPicks.push({ list: p.list.map(e => ({ word: this.mapTankWord(e.word, this.docIdx), weight: e.weight > 0 ? e.weight : 0 })), once: p.when === 'oncePerPlace' || p.when === 'oncePerSite', site: p.when === 'oncePerSite' });
      return -this.p.tankPicks.length;
    }
    return -1 - this.emptyPick();
  }
  emptyPick(): number { this.p.tankPicks.push({ list: [], once: false }); return this.p.tankPicks.length - 1; }

  numOf(n: unknown, ownerName: string): number {
    return emitNum(this.store, n, pr => this.problem('bad-number', `"${ownerName}": ${pr.err}.`));
  }

  run(): Program {
    const p = this.p;
    p.docIds = this.input.map(d => d.areaId);
    const runnable: boolean[] = [];
    for (let d = 0; d < this.input.length; d++) {
      this.docIdx = d;
      const src = this.input[d];
      const doc = src.doc;
      const newer = !!doc && typeof doc.v === 'number' && doc.v > EVENTS_DOC_VERSION;
      if (newer) this.problem('newer-doc', 'This map was made in a newer version. It is kept whole and does not run.', 0, true);
      runnable.push(!!doc && !newer);
      this.bindZones(src, !!doc && !newer);
      if (doc && !newer) this.bindDoc(doc);
      if (doc && !newer) for (const t of asList<MapTank>(doc.tanks)) {
        if (!isRow(t) || typeof t.id !== 'number' || !isRow(t.data)) continue;
        const w = this.mapTankWord(MAP_TANK_HEAD + t.id, d);
        if (!p.mapTanks.has(w)) p.mapTanks.set(w, { name: typeof t.name === 'string' ? t.name : '', data: t.data });
      }
    }
    for (let d = 0; d < this.input.length; d++) {
      this.docIdx = d;
      if (!runnable[d]) continue;
      this.formTables(this.input[d].doc!);
    }
    for (let d = 0; d < this.input.length; d++) {
      this.docIdx = d;
      if (!runnable[d]) continue;
      this.helperTables(this.input[d].doc!);
    }
    for (let d = 0; d < this.input.length; d++) {
      this.docIdx = d;
      if (!runnable[d]) continue;
      this.placedTables(this.input[d]);
      this.planTables(this.input[d].doc!);
    }
    for (let d = 0; d < this.input.length; d++) {
      this.docIdx = d;
      if (!runnable[d]) continue;
      this.lowerForms(this.input[d].doc!);
      this.lowerBehaviors(this.input[d]);
    }
    for (let d = 0; d < this.input.length; d++) {
      this.docIdx = d;
      if (!runnable[d]) continue;
      const doc = this.input[d].doc!;
      for (const r of asList<Rule>(doc.rules)) this.rule(r);
      for (const s of asList<Sequence>(doc.sequences)) this.sequence(s);
    }
    this.patchCalls();
    this.findCycles();
    this.trackAreas();
    const m: MatchRules = {};
    let fd = -1;
    for (let d = this.input.length - 1; d >= 0; d--) { if (runnable[d] && this.input[d].doc!.match) { Object.assign(m, this.input[d].doc!.match); if (this.input[d].doc!.match!.foodIn) fd = d; } }
    p.match = m;
    if (SMALL_FIX.GH392) p.foodInDoc = fd;
    if (m.foodIn && !p.zones.some(z => z.uid === m.foodIn!.id && (p.foodInDoc < 0 || z.doc === p.foodInDoc))) this.problem('dead-ref', `Shapes Appear Only In: "${m.foodIn.n}" is gone. Shapes appear all over the map.`, m.foodIn.id, true);
    for (let d = 0; d < this.input.length; d++) {
      if (runnable[d] && typeof this.input[d].doc!.meta?.seed === 'number') { p.seed = this.input[d].doc!.meta!.seed as number; break; }
    }
    p.refIds = this.ids;
    p.code = Int32Array.from(this.code);
    p.num = this.store.freeze();
    p.textTokens = new Uint8Array(p.texts.length);
    for (let i = 0; i < p.texts.length; i++) p.textTokens[i] = p.texts[i].includes('{') ? 1 : 0;
    p.hasContent = p.slots.some(s => s.placed) || p.plans.length > 0 || p.rules.length > 0 || p.spawners.length > 0 || p.behaviors.some(b => b.k === 'solid' || b.k === 'darkness' || b.k === 'food' || b.k === 'door') || p.timers.length > 0 || p.vars.length > 0 || p.spawnPlaceZones.length > 0;
    return p;
  }

  bindZones(src: CompileDoc, run: boolean): void {
    for (const z of src.zones) {
      if (!z || typeof z !== 'object') continue;
      const behaviors = run ? behaviorsOf(z) : [];
      const hasEvents = typeof z.uid === 'number' || (Array.isArray(z.behaviors) && z.behaviors.length > 0);
      if (!hasEvents) continue;
      const zi = this.p.zones.length;
      const rects: number[] = [];
      const cum: number[] = [];
      let total = 0, ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
      const sh = zoneShapeOf(z);
      const poly = sh !== null ? shapeWorldPoly(sh, src.cell, src.originX, src.originY) : null;
      let pmx = 0, pmy = 0;
      if (poly !== null) {
        polyMiddle(poly); pmx = polyMx; pmy = polyMy;
        for (let i = 0; i + 1 < poly.length; i += 2) { const x = poly[i], y = poly[i + 1]; if (x < ux0) ux0 = x; if (x > ux1) ux1 = x; if (y < uy0) uy0 = y; if (y > uy1) uy1 = y; }
        rects.push(ux0, uy0, ux1, uy1);
        total = polyArea(poly);
        if (SMALL_FIX.GH502 && polyCrosses(poly)) total = polyFillArea(poly, ux0, uy0, ux1, uy1);
        cum.push(total);
      }
      if (poly === null) for (const r of rectsOf(z)) {
        const gx0 = Math.max(0, r.gx), gy0 = Math.max(0, r.gy), gx1 = Math.min(src.gridCells, r.gx + r.cw), gy1 = Math.min(src.gridCellsY, r.gy + r.ch);
        if (gx1 <= gx0 || gy1 <= gy0) continue;
        const x0 = src.originX + gx0 * src.cell, y0 = src.originY + gy0 * src.cell, x1 = src.originX + gx1 * src.cell, y1 = src.originY + gy1 * src.cell;
        rects.push(x0, y0, x1, y1);
        total += (x1 - x0) * (y1 - y0);
        cum.push(total);
        if (x0 < ux0) ux0 = x0; if (y0 < uy0) uy0 = y0; if (x1 > ux1) ux1 = x1; if (y1 > uy1) uy1 = y1;
      }
      const cz: CZone = { idx: zi, uid: z.uid ?? -1, name: z.name ?? '', doc: this.docIdx, areaIdx: src.areaIdx, rects, cum, total, x0: ux0, y0: uy0, x1: ux1, y1: uy1, poly, pmx, pmy, bit: -1, spawnTeams: [], spawnOn: false, zone: z };
      this.p.zones.push(cz);
      if (typeof z.uid === 'number') this.bind(z.uid, 'area', zi);
      for (const b of behaviors) {
        const ci = this.p.behaviors.length;
        this.p.behaviors.push({ idx: ci, id: b.id, k: b.k, zone: zi, on: !b.off, a: b.a ?? {} });
        if (b.id) this.bind(b.id, 'behavior', ci);
      }
    }
  }

  bindDoc(doc: MapEventsDoc): void {
    const p = this.p;
    const named = <T extends { id: Id }>(list: T[] | undefined, kind: string, onEach: (t: T, i: number) => void) => {
      if (!Array.isArray(list)) return;
      for (const t of list) { if (!t || typeof t !== 'object') continue; onEach(t, 0); }
    };
    named(doc.tags, 'tag', t => { this.bind(t.id, 'tag', p.tags.length); p.tags.push({ id: t.id, name: t.name }); });
    named(doc.signals, 'signal', t => { this.bind(t.id, 'signal', p.signals.length); p.signals.push({ id: t.id, name: t.name }); });
    named(doc.vars, 'var', t => { this.bind(t.id, 'var', p.vars.length); p.vars.push({ idx: p.vars.length, id: t.id, name: t.name, kind: t.kind, start: Number.isFinite(t.start) ? t.start : 0, scope: t.scope === 'team' || t.scope === 'body' ? t.scope : 'match' }); });
    named(doc.timers, 'timer', t => { this.bind(t.id, 'timer', p.timers.length); p.timers.push({ idx: p.timers.length, id: t.id, name: t.name, doc: this.docIdx, secondsOff: -1, marks: [], repeat: !!t.repeat, showOnHud: !!t.showOnHud }); });
    named(doc.statuses, 'status', t => { this.bind(t.id, 'status', p.statuses.length); p.statuses.push({ idx: p.statuses.length, id: t.id, name: t.name, doc: this.docIdx, def: t, secondsOff: -1, stack: t.stack === 'extend' ? 1 : t.stack === 'ignore' ? 2 : 0, endsOnDeath: t.onDeath !== 'stays', endsOnTankChange: t.onTankChange === 'ends', effects: [] }); });
    named(doc.areaGroups, 'group', t => this.bind(t.id, 'group', this.docIdx * 1048576 + (doc.areaGroups as { id: Id }[]).indexOf(t)));
    named(doc.types, 'type', t => {
      const ti = p.types.length;
      this.bind(t.id, 'type', ti);
      const forms: number[] = [];
      const list = Array.isArray(t.forms) ? t.forms.filter(isRow) as EntityForm[] : [];
      for (let i = 0; i < list.length; i++) {
        const fi = p.forms.length;
        const f = list[i];
        forms.push(fi);
        p.forms.push({ idx: fi, local: i, type: ti, id: f.id, name: f.name, def: f, side: f.side ?? t.side ?? { team: 'againstPlayer' }, tags: [], orderIdx: -1, tankSlot: -1, onDeath: -1, after: -1, afterHow: 'morph' });
        this.bind(f.id, 'form', fi);
      }
      p.types.push({ idx: ti, id: t.id, name: t.name, doc: this.docIdx, def: t, forms, slot: -1, implicit: false });
      if (forms.length === 0) this.problem('type-no-form', `Entity Type "${t.name}" has nothing in it.`, t.id);
    });
    named(doc.placed, 'entity', () => {});
    named(doc.plans, 'plan', t => { this.bind(t.id, 'plan', p.plans.length); p.plans.push({ idx: p.plans.length, id: t.id, name: t.name, doc: this.docIdx, def: t, off: !!t.off, groupByPlanId: new Map(), areas: [], areaBeh: [], first: typeof t.first === 'number' && t.first >= 1 ? Math.floor(t.first) : 1, startSignal: -1, startDelayOff: -1, advanceSecondsOff: -1, aliveBelowOff: -1 }); });
    named(doc.rules, 'rule', t => { this.bind(t.id, 'rule', p.rules.length); p.rules.push(this.newRule(t)); });
    named(doc.sequences, 'seq', t => { this.bind(t.id, 'seq', p.seqs.length); p.seqs.push({ idx: p.seqs.length, id: t.id, name: t.name, rule: -1, starts: [], skippable: !!t.skippable, lockInput: !!t.lockInput, guardsHeld: !!t.lockInput && t.whileHeld !== 'nothing', stopsBots: !!t.lockInput && t.whileHeld === 'botsStop',
      timeoutMs: typeof t.timeout === 'number' && t.timeout > 0 ? t.timeout * 1000 : t.lockInput ? 120000 : 0 }); });
  }

  newRule(t: Partial<Rule> & { id: Id; name: string }, hidden = false): CRule {
    const run = t.run === 'single' ? 1 : t.run === 'restart' ? 2 : t.run === 'queue' ? 3 : 0;
    if (typeof t.folder === 'number' && asList<{ id: Id; off?: true }>(this.input[this.docIdx]?.doc?.folders).some(f => f && f.id === t.folder && f.off)) t = { ...t, off: true };
    return { idx: this.p.rules.length, id: t.id, name: t.name, doc: this.docIdx, hidden, start: 0, cond: 0, policy: run as 0 | 1 | 2 | 3, perSubject: t.perSubject !== false, maxRuns: typeof t.maxRuns === 'number' && t.maxRuns > 0 ? Math.floor(t.maxRuns) : 16, once: !!t.once, cooldownMs: typeof t.cooldown === 'number' && t.cooldown > 0 ? t.cooldown * 1000 : 0, everyNth: typeof t.everyNth === 'number' && t.everyNth > 1 ? Math.floor(t.everyNth) : 0, outlives: !!t.outlives, off: !!t.off, nLocals: 0, owner: -1, seq: -1 };
  }

  formTables(doc: MapEventsDoc): void {
    const p = this.p;
    for (const t of asList<EntityType>(doc.types)) {
      const ti = this.res({ id: t.id, n: '' }, 'type');
      if (ti < 0) continue;
      const ct = p.types[ti];
      for (const fi of ct.forms) {
        const f = p.forms[fi];
        f.tankSlot = this.tankPick(f.def.tank);
        f.tags = this.refList(f.def.tags, 'tag', `"${t.name}"`);
        const order = f.def.order ?? t.order;
        if (order) f.orderIdx = this.order(order, t.name);
        if (t.brain === 'order' && f.orderIdx < 0) this.problem('order-missing', `Entity Type "${t.name}" walks by order, but its form "${f.name}" has none. It stands still.`, t.id, true);
      }
    }
  }

  refList(list: unknown, kind: RefOf, owner: string): number[] {
    const out: number[] = [];
    if (!Array.isArray(list)) return out;
    for (const r of list) {
      const i = this.res(r, kind);
      if (i < 0) this.problem('dead-ref', `${owner}: "${(r as Ref)?.n ?? ''}" is gone.`, (r as Ref)?.id ?? 0);
      else out.push(i);
    }
    return out;
  }

  order(row: Row, owner: string): number {
    const def = kindOf('order', row.k);
    if (!def) { this.problem('newer-kind', `"${owner}": a walking order made in a newer version. It stands still.`, row.id, true); return -1; }
    if (def.door) return -1;
    const a = row.a ?? {};
    const off = (name: string): number => {
      const f = def.fields[name];
      if (!f) return -1;
      return this.numOf(a[name] ?? (f as { def: unknown }).def, owner);
    };
    const tag = a.tag ? this.res(a.tag, 'tag') : -1;
    if (a.tag && tag < 0) this.problem('dead-ref', `"${owner}": its walking order names a tag that is gone.`, row.id);
    const elseTag = a.elseTag ? this.res(a.elseTag, 'tag') : -1;
    this.p.orders.push({ k: row.k, doc: this.docIdx, tag, radiusOff: off('radius'), speedOff: off('speed'), gapOff: off('gap'), turnOff: off('turn'), whoLeader: a.who !== 'tag', elseTag, a });
    return this.p.orders.length - 1;
  }

  helperTables(doc: MapEventsDoc): void {
    const p = this.p;
    for (const t of asList<any>(doc.timers)) {
      const i = this.res({ id: t.id, n: '' }, 'timer');
      if (i < 0) continue;
      p.timers[i].secondsOff = this.numOf(t.seconds, t.name);
      p.timers[i].marks = Array.isArray(t.marks) ? t.marks.filter(m => Number.isFinite(m) && m >= 0).slice().sort((a, b) => b - a) : [];
    }
    for (const s of asList<any>(doc.statuses)) {
      const i = this.res({ id: s.id, n: '' }, 'status');
      if (i < 0) continue;
      const c = p.statuses[i];
      c.secondsOff = s.seconds === null || s.seconds === undefined ? -1 : this.numOf(s.seconds, s.name);
      for (const e of asList<any>(s.effects)) {
        if (!isRow(e)) continue;
        if (e.off) continue;
        const def = kindOf('effect', e.k);
        if (!def) { this.problem('newer-kind', `Status "${s.name}": an effect made in a newer version is skipped.`, e.id, true); continue; }
        if (def.door) { this.problem('door', `Status "${s.name}": "${def.label}" comes in a later version.`, e.id, true); continue; }
        const tag = e.k === 'tag' ? this.res(e.a?.tag, 'tag') : -1;
        if (e.k === 'tag' && tag < 0) { this.problem('dead-ref', `Status "${s.name}": its tag is gone.`, e.id); continue; }
        if (e.k === 'guardTag' || e.k === 'attackTag' || e.k === 'takeTag' || e.k === 'spoilTag' || e.k === 'escortTag') {
          const a = e.a ?? {};
          const _tag = a.tag ? this.res(a.tag, 'tag') : -1;
          if (_tag < 0) { this.problem('dead-ref', `Status "${s.name}": ${def.label} names no tag.`, e.id); continue; }
          c.effects.push({ k: e.k, a: { ...a, _tag, _zone: -1 }, tag: -1 });
          continue;
        }
        if (e.k === 'seekHeal') {
          const a = e.a ?? {};
          const _tag = a.tag ? this.res(a.tag, 'tag') : -1, _zone = a.area ? this.res(a.area, 'area') : -1;
          if (a.tag && _tag < 0) this.problem('dead-ref', `Status "${s.name}": Goes To Be Healed names a tag that is gone.`, e.id);
          if (a.area && _zone < 0) this.problem('dead-ref', `Status "${s.name}": Goes To Be Healed names a Custom Area that is gone.`, e.id);
          if (a.healers === false && _tag < 0 && _zone < 0) this.problem('heal-nowhere', `Status "${s.name}": Goes To Be Healed has nowhere to go. Switch on To What Heals On Its Side, or name a tag or a Custom Area.`, e.id, true);
          c.effects.push({ k: e.k, a: { ...a, _tag, _zone }, tag: -1 });
          continue;
        }
        c.effects.push({ k: e.k, a: e.a ?? {}, tag });
      }
    }
  }

  placedTables(src: CompileDoc): void {
    const p = this.p;
    const doc = src.doc!;
    for (const t of asList<EntityType>(doc.types)) {
      const ti = this.res({ id: t.id, n: '' }, 'type');
      if (ti < 0) continue;
      p.types[ti].slot = this.newSlot(ti, false, 0, t.name, 0, 0, 0, -1, 0, src.areaIdx, null, false);
    }
    for (const e of asList<any>(doc.placed)) {
      if (!e || typeof e !== 'object') continue;
      const ti = this.res(e.type, 'type');
      if (ti < 0) { this.problem('dead-ref', `Map Entity "${e.name}": its Entity Type "${e.type?.n ?? ''}" is gone. It does not stand.`, e.id); continue; }
      if (p.types[ti].def.brain === 'guard') continue;
      const home = e.home ? this.res(e.home, 'area') : -1;
      if (e.home && home < 0) this.problem('dead-ref', `Map Entity "${e.name}": its home area "${e.home.n}" is gone.`, e.id, true);
      let start = 0;
      if (typeof e.startForm === 'number') {
        const fi = this.res({ id: e.startForm, n: '' }, 'form');
        if (fi >= 0 && p.forms[fi].type === ti) start = p.forms[fi].local;
      }
      const x = src.originX + (e.cx + 0) * src.cell, y = src.originY + (e.cy + 0) * src.cell;
      const si = this.newSlot(ti, true, e.id, e.name, x, y, e.angle ?? 0, home, start, src.areaIdx, typeof e.showName === 'boolean' ? e.showName : null, !!e.off);
      this.bind(e.id, 'entity', si);
      for (const s of asList<any>(e.spots)) {
        const fi = this.res({ id: s.form, n: '' }, 'form');
        if (fi < 0 || p.forms[fi].type !== ti) { this.problem('dead-ref', `Map Entity "${e.name}": a spot of a form that is gone. It stands on its own spot then.`, e.id, true); continue; }
        p.slots[si].spots.push(p.forms[fi].local, src.originX + s.cx * src.cell, src.originY + s.cy * src.cell);
      }
    }
  }

  newSlot(type: number, placed: boolean, id: Id, name: string, x: number, y: number, angle: number, home: number, startLocal: number, areaIdx: number, showName: boolean | null, off: boolean): number {
    const p = this.p;
    const i = p.slots.length;
    const base = p.slotTankCount;
    p.slotTankCount += p.types[type].forms.length;
    p.slots.push({ idx: i, type, placed, id, name, base, x, y, angle, home, startLocal, areaIdx, showName, off, spots: [] });
    return i;
  }

  placeRuleOf(raw: PlaceRule | undefined, owner: string, fallback: PlaceRule | undefined): { rule: PlaceRule; avoid: number[] } {
    const r = raw ?? fallback ?? DEFAULT_PLACE_RULE;
    return { rule: r, avoid: this.zoneList(r.avoid, owner).zones };
  }

  zoneList(list: unknown, owner: string): { zones: number[]; dead: boolean } {
    const zones: number[] = [];
    let anyDead = false;
    if (Array.isArray(list)) for (const r of list) {
      const z = this.res(r, 'area');
      if (z >= 0) { if (!SMALL_FIX.GH480 || !zones.includes(z)) zones.push(z); continue; }
      const g = this.res(r, 'group');
      if (g >= 0) {
        const docIdx = Math.floor(g / 1048576), gi = g % 1048576;
        const ag = this.input[docIdx].doc!.areaGroups![gi];
        const was = this.docIdx;
        this.docIdx = docIdx;
        for (const m of asList<any>(ag.members)) {
          const mz = this.res(m, 'area');
          if (mz >= 0 && !zones.includes(mz)) zones.push(mz);
          else if (mz < 0) this.problem('dead-ref', `Area Group "${ag.name}" lists "${m?.n ?? ''}", which is gone.`, ag.id);
        }
        this.docIdx = was;
        continue;
      }
      anyDead = true;
      this.problem('dead-ref', `${owner}: the place "${(r as Ref)?.n ?? ''}" is gone.`, (r as Ref)?.id ?? 0);
    }
    return { zones, dead: anyDead };
  }

  place(raw: Place | undefined, owner: string, planRule?: PlaceRule): number {
    const p = this.p;
    const out: CPlace = { w: 'in', zones: [], atPlan: false, rule: DEFAULT_PLACE_RULE, avoid: [], x: 0, y: 0, target: -1, areaIdx: -1, dead: false };
    if (!raw || typeof raw !== 'object') { out.w = 'subject'; }
    else if (raw.w === 'in') {
      if (raw.areas === 'plan') { out.atPlan = true; for (const pl of p.plans) for (const z of pl.areas) if (!out.zones.includes(z)) out.zones.push(z); }
      else {
        const { zones, dead } = this.zoneList(raw.areas, owner);
        out.zones = zones;
        out.dead = zones.length === 0 && dead;
      }
      const pr = this.placeRuleOf(raw.rule, owner, planRule);
      out.rule = pr.rule; out.avoid = pr.avoid;
    } else if (raw.w === 'subject') out.w = 'subject';
    else if (raw.w === 'point') {
      const src = this.input[this.docIdx];
      out.w = 'point'; out.x = src.originX + raw.cx * src.cell; out.y = src.originY + raw.cy * src.cell; out.areaIdx = src.areaIdx;
    } else if (raw.w === 'homeOf') { out.w = 'homeOf'; out.target = this.target(raw.of); }
    else { this.problem('newer-kind', `${owner}: a place made in a newer version.`); out.dead = true; }
    p.places.push(out);
    return p.places.length - 1;
  }

  cards(list: unknown, owner: string, body: SpawnGroup['body'] | undefined, side: SideSpec | undefined, tagsOwner?: number[]): number {
    const out: CCard[] = [];
    const raw = Array.isArray(list) ? list as SpawnCard[] : [];
    for (const c of raw) {
      if (!c || typeof c !== 'object') continue;
      let typeIdx = -1, shape = '';
      if (c.type) {
        typeIdx = this.res(c.type, 'type');
        if (typeIdx < 0) { this.problem('dead-ref', `${owner}: the Entity Type "${c.type.n}" is gone.`, c.type.id); continue; }
      } else if (typeof c.tank === 'string' && c.tank) {
        typeIdx = this.implicitType(c.tank, body, side);
      } else if (typeof c.shape === 'string' && c.shape) {
        shape = c.shape;
        if (this.opts.shapeExists && !this.opts.shapeExists(shape)) { this.problem('missing-shape', `${owner}: there is no shape "${shape}" in this game.`, c.id); continue; }
      } else { this.problem('empty-card', `${owner}: a card names nothing.`, c.id, true); continue; }
      out.push({ id: c.id, typeIdx, shape, weight: c.weight > 0 ? c.weight : 0, uniqueAlive: !!c.uniqueAlive, size: Array.isArray(c.size) && c.size.length === 2 ? c.size : null, from: typeof c.fromWave === 'number' ? c.fromWave : 0, to: typeof c.toWave === 'number' ? c.toWave : Infinity, cost: typeof c.cost === 'number' ? c.cost : 1 });
    }
    void tagsOwner;
    this.p.cardLists.push(out);
    return this.p.cardLists.length - 1;
  }

  implicit = new Map<string, number>();
  implicitType(word: string, body: SpawnGroup['body'] | undefined, side: SideSpec | undefined): number {
    const key = word + '|' + JSON.stringify(body ?? null) + '|' + JSON.stringify(side ?? null) + '|' + this.docIdx;
    const hit = this.implicit.get(key);
    if (hit !== undefined) return hit;
    const p = this.p;
    const ti = p.types.length;
    const def: EntityType = {
      id: this.hiddenId--, name: word, side: side ?? { team: 'againstPlayer' },
      forms: [{ id: this.hiddenId--, name: word, tank: word }],
      brain: body?.brain, bossTier: body?.bossTier, order: body?.order, worth: body?.worth, score: body?.score, killLine: body?.killLine, onLeaderboard: body?.onLeaderboard, onMinimap: body?.onMinimap, sight: body?.sight,
    };
    const fi = p.forms.length;
    p.forms.push({ idx: fi, local: 0, type: ti, id: def.forms[0].id, name: word, def: def.forms[0], side: def.side, tags: [], orderIdx: body?.order ? this.order(body.order, word) : -1, tankSlot: this.tank(word), onDeath: -1, after: -1, afterHow: 'morph' });
    p.types.push({ idx: ti, id: def.id, name: word, doc: this.docIdx, def, forms: [fi], slot: -1, implicit: true });
    p.types[ti].slot = this.newSlot(ti, false, 0, word, 0, 0, 0, -1, 0, this.input[this.docIdx].areaIdx, null, false);
    this.implicit.set(key, ti);
    return ti;
  }

  planTables(doc: MapEventsDoc): void {
    const p = this.p;
    for (const t of asList<WavePlan>(doc.plans)) {
      const pi = this.res({ id: t.id, n: '' }, 'plan');
      if (pi < 0) continue;
      const c = p.plans[pi];
      c.startDelayOff = this.numOf(t.start?.delay ?? 0, t.name);
      if (t.start?.on === 'signal') {
        c.startSignal = this.res(t.start.signal, 'signal');
        if (c.startSignal < 0) this.problem('dead-ref', `Wave Plan "${t.name}" starts on a signal that is gone. It does not start.`, t.id);
      }
      c.advanceSecondsOff = t.advance?.seconds !== undefined ? this.numOf(t.advance.seconds, t.name) : -1;
      c.aliveBelowOff = t.advance?.aliveBelow !== undefined ? this.numOf(t.advance.aliveBelow, t.name) : -1;
      this.groupTable(t.groups, c, t);
      for (const s of asList<any>(t.specials)) if (isRow(s)) this.groupTable(s.groups, c, t);
      for (const o of asList<any>(t.overrides)) if (isRow(o)) this.groupTable(o.groups, c, t);
    }
  }

  groupTable(groups: SpawnGroup[] | undefined, c: CPlan, plan: WavePlan): void {
    const p = this.p;
    if (!Array.isArray(groups)) return;
    for (const g of groups) {
      if (!g || typeof g !== 'object') continue;
      const owner = `Wave Plan "${plan.name}", "${g.name}"`;
      const side = g.side ?? plan.side;
      let at: number[] = [], atPlan = false, dead = false;
      if (g.at === 'plan' || g.at === undefined) atPlan = true;
      else {
        const zl = this.zoneList(g.at, owner);
        at = zl.zones;
        dead = at.length === 0;
        if (dead && !zl.dead) this.problem('no-place', `${owner}: it has no place to spawn. It is skipped and holds nothing.`, g.id);
      }
      const place = this.placeRow(g.place ?? plan.place, owner);
      const tags = this.refList(g.tags, 'tag', owner);
      const cards = this.cards(g.cards, owner, g.body, side);
      let weights: number[] | null = null;
      if (Array.isArray(g.weights) && at.length > 0) {
        weights = at.map(z => {
          const zoneUid = p.zones[z].uid;
          const e = g.weights!.find(w => w.id === zoneUid);
          return e && e.w >= 0 ? e.w : 1;
        });
      }
      const gi = p.groups.length;
      this.bind(g.id, 'wgroup', gi);
      p.groups.push({ idx: gi, id: g.id, plan: c.idx, name: g.name, cards, at, atPlan, dead, split: g.split === 'each' ? 'each' : 'shared', weights, place, holds: g.blocks !== false, side, showName: typeof g.showName === 'boolean' ? g.showName : null, tags, def: g });
      c.groupByPlanId.set(g.id, gi);
    }
  }

  placeRow(rule: PlaceRule | undefined, owner: string): number {
    const pr = this.placeRuleOf(rule, owner, undefined);
    this.p.places.push({ w: 'in', zones: [], atPlan: true, rule: pr.rule, avoid: pr.avoid, x: 0, y: 0, target: -1, areaIdx: -1, dead: false });
    return this.p.places.length - 1;
  }

  linkOf(l: FormLink, type: EntityType, formLocal: number): number {
    const p = this.p;
    const ti = this.res({ id: type.id, n: '' }, 'type');
    let to = -2;
    if (l.to === 'same') to = -1;
    else if (l.to === 'none') to = -2;
    else {
      const fi = this.res({ id: l.to as number, n: '' }, 'form');
      if (fi >= 0 && p.forms[fi].type === ti) to = p.forms[fi].local;
      else this.problem('dead-ref', `Entity Type "${type.name}": form ${formLocal + 1} links to a form that is gone. It stays dead.`, type.id);
    }
    let among: number[] = [];
    if (l.place && typeof l.place === 'object') among = this.refList(l.place.among, 'area', `Entity Type "${type.name}"`);
    p.links.push({ to, team: l.team === 'killer' ? 'killer' : l.team === 'form' || to === 0 ? 'form' : 'killer', fallback: typeof l.fallbackTeam === 'string' ? l.fallbackTeam : '', graceOff: l.grace !== undefined ? this.numOf(l.grace, type.name) : -1, delayOff: l.delay !== undefined ? this.numOf(l.delay, type.name) : -1, among, refill: l.refill === 'shield' ? 'shield' : l.refill === 'all' ? 'all' : 'none' });
    return p.links.length - 1;
  }

  lowerForms(doc: MapEventsDoc): void {
    const p = this.p;
    for (const t of asList<EntityType>(doc.types)) {
      const ti = this.res({ id: t.id, n: '' }, 'type');
      if (ti < 0) continue;
      for (const fi of p.types[ti].forms) {
        const f = p.forms[fi];
        if (f.def.onDeath && f.def.onDeath.to !== 'none') {
          f.onDeath = this.linkOf(f.def.onDeath, t, f.local);
          if (p.links[f.onDeath].to !== -2) {
            const delay = f.def.onDeath.delay;
            this.hiddenRuleMulti(`${t.name}: ${f.name} dies`, [{ k: 'body.died', a: { who: { _forms: [fi] }, _real: true } }], [
              ...(delay !== undefined ? [this.waitRow(delay)] : []),
              { id: 0, k: '_become', a: { typeForm: fi, link: f.onDeath } },
            ], { outlives: true });
          }
        }
        if (f.def.after) {
          const a = f.def.after;
          const toFi = this.res({ id: a.to, n: '' }, 'form');
          if (toFi < 0 || p.forms[toFi].type !== ti) { this.problem('dead-ref', `Entity Type "${t.name}": form "${f.name}" changes after a while into a form that is gone. It stays as it is.`, t.id); }
          else {
            p.links.push({ to: p.forms[toFi].local, team: 'form', fallback: '', graceOff: -1, delayOff: -1, among: [], refill: a.refill === 'shield' ? 'shield' : a.refill === 'all' ? 'all' : 'none' });
            f.after = p.links.length - 1;
            f.afterHow = a.how === 'become' ? 'become' : 'morph';
            const rows: Row[] = [this.waitRow(a.seconds), { id: 0, k: '_after', a: { typeForm: fi, link: f.after } }];
            this.hiddenRule(`${t.name}: ${f.name} in time`, 'body.born', { _forms: [fi] }, rows, {}, ['body.changed']);
          }
        }
        const evo: { plan: number; wave: number; tank: string }[] = [];
        for (const e of asList<any>(f.def.evolve)) {
          if (!isRow(e)) continue;
          let plan = e.plan ? this.res(e.plan, 'plan') : (p.plans.length > 0 ? 0 : -1);
          if (e.plan && plan < 0) this.problem('dead-ref', `Entity Type "${t.name}": Evolve At Waves names a Wave Plan that is gone.`, e.id);
          if (plan < 0) { if (!e.plan) this.problem('evolve-no-plan', `Entity Type "${t.name}" evolves at waves, but this map has no Wave Plan.`, e.id, true); continue; }
          const wave = Math.floor(Number(e.wave));
          if (!Number.isFinite(wave) || wave < 1 || typeof e.tank !== 'string' || e.tank === '') continue;
          evo.push({ plan, wave, tank: e.tank });
        }
        for (const plan of Array.from(new Set(evo.map(r => r.plan)))) {
          const rows = evo.filter(r => r.plan === plan).map((r, i) => ({ ...r, i })).sort((a, b) => a.wave - b.wave || a.i - b.i);
          if (rows[0].wave > 1) this.hiddenRuleRaw(`${t.name}: before wave ${rows[0].wave}`, { k: 'wave.started', a: { _plan: plan, test: { to: rows[0].wave - 1 } } }, [{ id: 0, k: '_formTank', a: { typeForm: fi, tank: '', tier: 1, base: true } }]);
          for (let k = 0; k < rows.length; k++) {
            const to = k + 1 < rows.length ? rows[k + 1].wave - 1 : undefined;
            if (to !== undefined && to < rows[k].wave) continue;
            this.hiddenRuleRaw(`${t.name}: wave ${rows[k].wave}`, { k: 'wave.started', a: { _plan: plan, test: to === undefined ? { from: rows[k].wave } : { from: rows[k].wave, to } } },
              [{ id: 0, k: '_formTank', a: { typeForm: fi, tank: rows[k].tank, tier: k + 2, base: false } }]);
          }
        }
      }
    }
  }

  waitRow(seconds: unknown): Row { return { id: 0, k: 'wait', a: { seconds } }; }

  hiddenRule(name: string, trig: string, test: Record<string, unknown>, then: Row[], opts: Partial<Rule> = {}, moreTrigs: string[] = []): number {
    const rows = [{ k: trig, a: { who: test } as Record<string, unknown> }, ...moreTrigs.map(k => ({ k, a: { who: test } as Record<string, unknown> }))];
    return this.hiddenRuleMulti(name, rows, then, opts);
  }
  hiddenRuleRaw(name: string, trig: { k: string; a: Record<string, unknown> }, then: Row[], cond: Row[] = []): number { return this.hiddenRuleMulti(name, [trig], then, {}, cond); }
  hiddenRuleMulti(name: string, trigs: { k: string; a: Record<string, unknown> }[], then: Row[], opts: Partial<Rule>, cond: Row[] = []): number {
    const p = this.p;
    const rule = this.newRule({ id: this.hiddenId--, name, ...opts }, true);
    p.rules.push(rule);
    this.ruleBody(rule, trigs.map(t => ({ id: 0, k: t.k, a: t.a })), cond, then);
    return rule.idx;
  }
  behaviorOnIf(b: CBehavior): Row[] { return SMALL_FIX.GH481 && b.id ? [{ id: 0, k: 'behavior.on', a: { behavior: { id: b.id, n: '' } } }] : []; }

  lowerBehaviors(src: CompileDoc): void {
    const p = this.p;
    const doc = src.doc!;
    for (let bi = 0; bi < p.behaviors.length; bi++) {
      const b = p.behaviors[bi];
      const z = p.zones[b.zone];
      if (z.doc !== this.docIdx) continue;
      const name = z.name || 'A Custom Area';
      const def = kindOf('behavior', b.k);
      if (!def) { this.problem('newer-kind', `Custom Area "${name}": a behaviour made in a newer version is kept and skipped.`, b.id, true); continue; }
      if (def.door) { this.problem('door', `Custom Area "${name}": "${def.label}" comes in a later version.`, b.id, true); continue; }
      const zref = { _zone: b.zone };
      switch (b.k) {
        case 'spawnPlace': {
          const teams = Array.isArray(b.a.teams) ? (b.a.teams as string[]).filter(w => typeof w === 'string') : [];
          z.spawnTeams = teams;
          z.spawnOn = b.on && b.a.enabledAtStart !== false;
          if (teams.length === 0) this.problem('spawn-place-no-side', `Custom Area "${name}": its Player Spawn Place names no side.`, b.id, true);
          if (!p.spawnPlaceZones.includes(b.zone)) p.spawnPlaceZones.push(b.zone);
          break;
        }
        case 'spawn': this.lowerSpawnBehavior(b.idx, name, doc); break;
        case 'say': {
          const who = b.a.who as BodyTest | undefined;
          const onIf = this.behaviorOnIf(b);
          if (typeof b.a.enter === 'string' && b.a.enter) this.hiddenRuleRaw(`${name}: on entering`, { k: 'area.entered', a: { area: zref, who } }, [{ id: 0, k: 'say', a: { to: b.a.to === 'all' ? 'all' : 'subject', text: b.a.enter } }], onIf);
          if (typeof b.a.leave === 'string' && b.a.leave) this.hiddenRuleRaw(`${name}: on leaving`, { k: 'area.left', a: { area: zref, who } }, [{ id: 0, k: 'say', a: { to: b.a.to === 'all' ? 'all' : 'subject', text: b.a.leave } }], onIf);
          break;
        }
        case 'while': {
          const who = b.a.who as BodyTest | undefined;
          if (this.res(b.a.status, 'status') < 0) { this.problem('dead-ref', `Custom Area "${name}": While Inside names a status that is gone.`, b.id); break; }
          this.hiddenRuleRaw(`${name}: while inside`, { k: 'area.entered', a: { area: zref, who } }, [{ id: 0, k: 'status.add', a: { who: { w: 'subject' }, status: b.a.status } }], this.behaviorOnIf(b));
          this.hiddenRuleRaw(`${name}: left`, { k: 'area.left', a: { area: zref, who: SMALL_FIX.GH494 ? undefined : who } }, [{ id: 0, k: 'status.remove', a: { who: { w: 'subject' }, status: b.a.status } }]);
          break;
        }
        case 'stay': {
          const who = b.a.who as BodyTest | undefined;
          const clock = b.a.clock;
          const stages = Array.isArray(b.a.stages) ? b.a.stages as { at: unknown; steps: Row[] }[] : [];
          const onIf = this.behaviorOnIf(b);
          for (const s of stages) {
            if (!s || typeof s !== 'object') continue;
            this.hiddenRuleRaw(`${name}: stay`, { k: 'area.stayed', a: { area: zref, who, seconds: s.at, clock } }, Array.isArray(s.steps) ? s.steps : [], onIf);
          }
          const lines = Array.isArray(b.a.lines) ? (b.a.lines as string[]).filter(l => typeof l === 'string') : [];
          if (b.a.repeatEvery !== undefined && b.a.repeatEvery !== 0 && lines.length > 0) {
            const varRows: Row[] = lines.length === 1
              ? [{ id: 0, k: 'say', a: { to: 'subject', text: lines[0] } }]
              : [{ id: 0, k: 'pick', a: { _inTurn: true, options: lines.map(text => ({ weight: 1, do: [{ id: 0, k: 'say', a: { to: 'subject', text } }] })) } }];
            this.hiddenRuleRaw(`${name}: stay line`, { k: 'area.stayed', a: { area: zref, who, seconds: b.a.repeatEvery, clock, _repeat: true } }, varRows, onIf);
          }
          if (typeof b.a.leaveLine === 'string' && b.a.leaveLine) this.hiddenRuleRaw(`${name}: left`, { k: 'area.left', a: { area: zref, who } }, [{ id: 0, k: 'say', a: { to: 'subject', text: b.a.leaveLine } }], onIf);
          break;
        }
        case 'bounce':
          if (!SMALL_FIX.GH499) break;
        case 'kill': {
          const types: number[] = [], tags: number[] = [];
          for (const w of Array.isArray(b.a.whitelist) ? b.a.whitelist as unknown[] : []) {
            if (typeof w !== 'string') continue;
            const isType = w.startsWith('type:');
            if (!isType && !w.startsWith('tag:')) continue;
            const at = this.res({ id: Number(w.slice(isType ? 5 : 4)), n: '' }, isType ? 'type' : 'tag');
            if (at >= 0) (isType ? types : tags).push(at);
            else this.problem('dead-ref', `Custom Area "${name}": its Whitelist names a ${isType ? 'Type' : 'tag'} that is gone.`, b.id, true);
          }
          if (types.length > 0) b.spareTypes = types;
          if (tags.length > 0) b.spareTags = tags;
          break;
        }
        case 'solid': b.solidTest = b.a.who ? this.test(b.a.who as BodyTest & { _forms?: number[] }, `Custom Area "${name}"`, b.id) : -1; if (b.solidTest < 0) this.problem('solid-no-test', `Custom Area "${name}": its Solid For names nothing to hold out.`, b.id, true); break;
      }
    }
  }

  lowerSpawnBehavior(bi: number, name: string, doc: MapEventsDoc): void {
    const p = this.p;
    const b = p.behaviors[bi];
    const args = (b.a.settings ?? b.a) as SpawnBehaviorArgs;
    const mode = args.mode;
    if (mode === 'waves') {
      const plan = args.plan ? this.res(args.plan, 'plan') : (doc.plans?.length ? this.res({ id: doc.plans[0].id, n: '' }, 'plan') : -1);
      if (plan < 0) { this.problem('dead-ref', `Custom Area "${name}": it spawns waves of a Wave Plan that is gone.`, b.id, true); return; }
      p.plans[plan].areas.push(b.zone);
      p.plans[plan].areaBeh.push(bi);
      return;
    }
    if (mode !== 'timer' && mode !== 'replace' && mode !== 'maxAlive' && mode !== 'signal') { this.problem('newer-kind', `Custom Area "${name}": a spawn mode made in a newer version is skipped.`, b.id, true); return; }
    const owner = `Custom Area "${name}"`;
    const side = args.side ?? { team: 'againstPlayer' };
    const cards = this.cards(args.cards, owner, args.body, side);
    const off = (v: unknown, def: number) => this.numOf(v === undefined ? def : v, name);
    const pr = this.placeRuleOf(args.place, owner, undefined);
    p.places.push({ w: 'in', zones: [b.zone], atPlan: false, rule: pr.rule, avoid: pr.avoid, x: 0, y: 0, target: -1, areaIdx: -1, dead: false });
    const placeIdx = p.places.length - 1;
    p.spawners.push({
      idx: p.spawners.length, zone: b.zone, behavior: bi, mode, cards,
      everyOff: off(args.every, 30), perSpawnOff: off(args.perSpawn, 1), delayOff: off(args.delay, 5), maxAliveOff: off(args.maxAlive, 1), refillOff: off(args.refillEvery, 5), totalOff: off(args.total, 0), startOff: off(args.startAfter, 0),
      place: placeIdx, side, on: b.on && args.enabledAtStart !== false, showName: typeof args.showName === 'boolean' ? args.showName : null,
      signal: mode === 'signal' ? this.res(args.signal, 'signal') : -1, tags: this.refList(args.tags, 'tag', owner),
    });
    if (mode === 'signal' && p.spawners[p.spawners.length - 1].signal < 0) this.problem('dead-ref', `${owner}: it spawns on a signal that is gone.`, b.id);
  }

  rule(r: Rule): void {
    const ri = this.res({ id: r.id, n: '' }, 'rule');
    if (ri < 0) return;
    this.ruleBody(this.p.rules[ri], r.when, r.cond, r.then, r.params);
  }

  sequence(s: Sequence): void {
    const p = this.p;
    const si = this.res({ id: s.id, n: '' }, 'seq');
    if (si < 0) return;
    const cs = p.seqs[si];
    const rule = this.newRule({ id: this.hiddenId--, name: s.name, maxRuns: 64, outlives: true }, true);
    p.rules.push(rule);
    rule.seq = si;
    cs.rule = rule.idx;
    const was = this.ruleNow; const wasL = this.localsNow;
    this.ruleNow = rule; this.localsNow = 0;
    for (const t of asList<any>(s.tracks)) {
      if (!isRow(t)) continue;
      const start = this.code.length;
      const clips = asList<any>(t.clips).filter(isRow).slice().sort((a, b) => a.at - b.at);
      let at = 0;
      for (const c of clips) {
        const d = Math.max(0, (Number.isFinite(c.at) ? c.at : 0) - at);
        if (d > 0) this.steps([this.waitRow(d)], s.name);
        at += d;
        this.steps([c.step], s.name);
      }
      this.code.push(OP_END);
      cs.starts.push(start);
    }
    if (SMALL_FIX.GH432 && this.localsNow > MAX_LOCALS) { this.problem('too-many-repeats', `Sequence "${s.name}" holds more than ${MAX_LOCALS} loops and does not run.`, s.id); rule.off = true; }
    this.ruleNow = was; this.localsNow = wasL;
  }

  ruleBody(rule: CRule, when: Row[] | undefined, cond: Row[] | undefined, then: Row[] | undefined, params?: Rule['params']): void {
    const was = this.ruleNow; const wasL = this.localsNow;
    this.ruleNow = rule; this.localsNow = 0;
    const wasW = this.wordsOnlyNow;
    this.wordsOnlyNow = wordsOnly(asList<Row>(then), 0);
    const paramIds = Array.isArray(params) ? (SMALL_FIX.GH512 ? params.filter(q => q !== null && typeof q === 'object' && typeof (q as { id?: unknown }).id === 'number') : params).map(q => q.id) : [];
    paramIds.forEach((id, i) => this.bind(id, 'param', i));
    this.localsNow = paramIds.length;
    for (const row of asList<Row>(when)) if (isRow(row)) this.trigger(rule, row);
    rule.cond = this.condBlock(asList<Row>(cond), rule.name, 0);
    rule.start = this.code.length;
    this.steps(asList<Row>(then), rule.name);
    this.code.push(OP_END);
    rule.nLocals = this.localsNow;
    if (this.localsNow > MAX_LOCALS) { this.problem('too-many-repeats', `Map Event "${rule.name}" holds more than ${MAX_LOCALS} loops inside each other and does not run.`, rule.id); rule.off = true; }
    this.ruleNow = was; this.localsNow = wasL;
    this.wordsOnlyNow = wasW;
  }

  trigger(rule: CRule, row: Row): void {
    if (row.off) return;
    const def = kindOf('trigger', row.k);
    if (!def) { this.problem('newer-kind', `Map Event "${rule.name}": a trigger made in a newer version is kept and skipped.`, row.id, true); return; }
    if (def.door) { this.problem('door', `Map Event "${rule.name}": "${def.label}" comes in a later version.`, row.id, true); return; }
    const ip = this.encode(def, row, rule.name);
    if (ip < 0) return;
    const p = this.p;
    if (def.armed === 'clock') {
      const a = row.a ?? {};
      if (row.k === 'time.at') p.clocks.push({ rule: rule.idx, kind: 'at', atOff: this.code[ip + 1], firstOff: -1, everyOff: -1, times: 1 });
      else p.clocks.push({ rule: rule.idx, kind: 'every', atOff: -1, firstOff: this.code[ip + 2], everyOff: this.code[ip + 1], times: typeof a.times === 'number' ? Math.floor(a.times) : 0 });
      return;
    }
    if (def.armed === 'count') {
      const a = row.a ?? {};
      const tag = this.code[ip + 1], type = this.code[ip + 2];
      const team = typeof a.team === 'string' ? a.team : '';
      if (tag < 0 && type < 0 && !team) { this.problem('empty-count', `Map Event "${rule.name}": its count names nothing to count.`, row.id); return; }
      const dir = a.dir === 'risesTo' ? 1 : a.dir === 'reaches' ? 2 : 0;
      p.watches.push({ rule: rule.idx, ip, tag, type, team, n: typeof a.n === 'number' ? a.n : 0, dir: dir as 0 | 1 | 2 });
    }
    if (def.armed === 'var') p.varWatches.push({ rule: rule.idx, ip, varIdx: this.code[ip + 1], op: this.code[ip + 2], valueOff: this.code[ip + 3] });
    if (def.armed === 'stay') {
      const a = row.a ?? {};
      p.stays.push({ rule: rule.idx, ip, zone: this.code[ip + 1], test: this.code[ip + 2], secondsOff: this.code[ip + 3], clock: this.code[ip + 4] as 0 | 1 | 2, repeat: a._repeat === true });
    }
    if (row.k === 'body.died') {
      p.wantDeath = true;
      if ((row.a as Record<string, unknown> | undefined)?._real === true) this.code[ip + 3] = 4;
      const t = this.code[ip + 1];
      const test = t >= 0 ? p.tests[t] : null;
      if (!test || (test.types.length === 0 && test.forms.length === 0 && test.tags.length === 0 && test.groups.length === 0)) p.wantAnyDeath = true;
    }
    if (def.wires?.includes('areaTrack')) p.wantAreas = true;
    let list = p.byKind[def.op!];
    if (!list) { list = []; p.byKind[def.op!] = list; }
    list.push({ rule: rule.idx, ip });
  }

  encode(def: KindDef, row: Row, owner: string): number {
    const a = row.a ?? {};
    const slots: number[] = [];
    for (const name of Object.keys(def.fields)) {
      const fd = def.fields[name];
      const v = this.fieldSlot(fd, a[name], a, name, def, owner, row);
      if (v === null) return -1;
      slots.push(v);
    }
    const ip = this.code.length;
    this.code.push(def.op!);
    for (const s of slots) this.code.push(s);
    return ip;
  }

  fieldSlot(fd: Field, v: unknown, a: Record<string, unknown>, name: string, def: KindDef, owner: string, row: Row): number | null {
    switch (fd.t) {
      case 'num': return this.numOf(v === undefined ? fd.def : v, owner);
      case 'int': return typeof v === 'number' && Number.isFinite(v) ? Math.max(fd.min, Math.min(fd.max, Math.floor(v))) : fd.def;
      case 'bool': return (v === undefined ? fd.def : !!v) ? 1 : 0;
      case 'enum': { const i = fd.of.indexOf(typeof v === 'string' ? v : fd.def); return i >= 0 ? i : fd.of.indexOf(fd.def); }
      case 'text': this.checkTokens(typeof v === 'string' ? v : fd.def, fd.tokens, owner, row.id); return this.text(typeof v === 'string' ? v : fd.def);
      case 'target': return this.target((v ?? fd.def) as Target);
      case 'ref': {
        if (fd.of === 'plan' && typeof a._plan === 'number') return a._plan;
        if (fd.of === 'area' && v && typeof (v as { _zone?: number })._zone === 'number') return (v as { _zone: number })._zone;
        if (v === undefined || v === null) {
          if (fd.optional) return -1;
          this.problem('empty-ref', `"${owner}": "${def.label}" has an empty blank.`, row.id);
          return null;
        }
        const i = this.res(v, fd.of);
        if (i < 0) {
          this.problem('dead-ref', `"${owner}": "${def.label}" names "${(v as Ref).n ?? ''}", which is gone.`, row.id);
          if (fd.optional) return -2;
          return null;
        }
        return i;
      }
      case 'refs': { this.p.intLists.push(this.refList(v, fd.of, `"${owner}"`)); return this.p.intLists.length - 1; }
      case 'tank': return typeof v === 'string' && v ? this.tank(v) : -1;
      case 'team': return typeof v === 'string' && v ? this.word(v) : -1;
      case 'teams':
      case 'words': { this.p.lists.push(Array.isArray(v) ? (v as unknown[]).filter((w): w is string => typeof w === 'string') : []); return this.p.lists.length - 1; }
      case 'wavetest': return this.waveTest(v);
      case 'bodytest': {
        return v === undefined || v === null ? -1 : this.test(v as BodyTest & { _forms?: number[] }, owner, row.id);
      }
      case 'cards': return this.cards(v, `"${owner}"`, undefined, undefined);
      case 'place': return this.place(v as Place, `"${owner}"`);
      case 'nums': { this.p.intLists.push(Array.isArray(v) ? (v as unknown[]).map(n => this.numOf(n, owner)) : []); return this.p.intLists.length - 1; }
      case 'ints': { this.p.intLists.push(Array.isArray(v) ? (v as unknown[]).filter((n): n is number => typeof n === 'number') : []); return this.p.intLists.length - 1; }
      case 'walls': { const l = Array.isArray(v) ? v : fd.def; this.p.intLists.push((l as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 19)); return this.p.intLists.length - 1; }
      case 'rows': {
        if (fd.family === 'order') return v ? this.order(v as Row, owner) : -1;
        return -1;
      }
      case 'json': return -1;
      case 'steps':
      case 'conds': return -1;
    }
  }

  waveTest(v: unknown): number {
    if (v === undefined || v === null) return -1;
    this.p.waveTests.push(v as WaveTest);
    return this.p.waveTests.length - 1;
  }

  checkTokens(s: string, allowed: readonly string[], owner: string, id: Id): void {
    if (!s.includes('{')) return;
    const re = /\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const w = m[1];
      if (/^\d+$/.test(w)) {
        const e = this.ids.get(this.key(this.docIdx, Number(w)));
        if (!e || (e.kind !== 'var' && e.kind !== 'timer' && e.kind !== 'tag' && e.kind !== 'type' && e.kind !== 'param')) this.problem('unknown-token', `"${owner}": the words name a thing that is gone: {${w}}.`, id, true);
        continue;
      }
      if (!allowed.includes(w)) this.problem('unknown-token', `"${owner}": the words hold {${w}}, which this place does not know.`, id, true);
    }
  }

  target(t: Target | undefined): number {
    const p = this.p;
    const out: CTarget = { w: 'subject', idx: -1, word: '', inner: -1, nOff: -1, how: 'random' };
    if (t && typeof t === 'object') {
      out.w = t.w;
      switch (t.w) {
        case 'entity': out.idx = this.res(t.ref, 'entity'); if (out.idx < 0) this.problem('dead-ref', `A step names the Map Entity "${t.ref?.n ?? ''}", which is gone. It acts on nothing.`, t.ref?.id ?? 0); break;
        case 'type': out.idx = this.res(t.ref, 'type'); if (out.idx < 0) this.problem('dead-ref', `A step names the Entity Type "${t.ref?.n ?? ''}", which is gone. It acts on nothing.`, t.ref?.id ?? 0); break;
        case 'tag': out.idx = this.res(t.ref, 'tag'); if (out.idx < 0) this.problem('dead-ref', `A step names the tag "${t.ref?.n ?? ''}", which is gone. It acts on nothing.`, t.ref?.id ?? 0); break;
        case 'inArea': out.idx = this.res(t.ref, 'area'); if (out.idx < 0) this.problem('dead-ref', `A step names the Custom Area "${t.ref?.n ?? ''}", which is gone. It acts on nothing.`, t.ref?.id ?? 0); break;
        case 'tank': out.word = t.word; break;
        case 'team': out.word = t.team; break;
        case 'colour': out.idx = colourCodeOf(t.colour); break;
        case 'pick': out.inner = this.target(t.of); out.nOff = this.numOf(t.n ?? 1, 'A pick'); out.how = t.how === 'nearest' ? 'nearest' : t.how === 'lowestHealth' ? 'lowestHealth' : 'random'; break;
      }
    }
    p.targets.push(out);
    return p.targets.length - 1;
  }

  test(t: BodyTest & { _forms?: number[] }, owner: string, id: Id): number {
    const p = this.p;
    const c: CTest = {
      types: this.refList(t.types, 'type', `"${owner}"`), tags: this.refList(t.tags, 'tag', `"${owner}"`), tanks: Array.isArray(t.tanks) ? t.tanks.filter(w => typeof w === 'string') : [],
      teams: Array.isArray(t.teams) ? t.teams.filter(w => typeof w === 'string') : [], groups: this.refList(t.groups, 'wgroup' as RefOf, `"${owner}"`), forms: Array.isArray(t._forms) ? t._forms : this.refList(t.forms, 'form', `"${owner}"`),
      boss: t.boss === true ? 1 : t.boss === false ? 0 : -1, player: t.player === true ? 1 : t.player === false ? 0 : -1,
      colours: Array.isArray(t.colours) ? t.colours.map(colourCodeOf).filter(c => c >= 0) : [],
      viewer: this.wordsOnlyNow ? 1 : 0,
    };
    if (Array.isArray(t.colours) && t.colours.length > 0 && c.colours.length === 0) c.colours = [-9];
    const deadTypes = Array.isArray(t.types) && t.types.length > 0 && c.types.length === 0;
    const deadTags = Array.isArray(t.tags) && t.tags.length > 0 && c.tags.length === 0;
    const deadForms = Array.isArray(t.forms) && t.forms.length > 0 && c.forms.length === 0;
    if (deadTypes || deadTags || deadForms) { c.types = [-9]; }
    void id;
    p.tests.push(c);
    return p.tests.length - 1;
  }

  condBlock(rows: Row[], owner: string, depth: number, mode: 0 | 1 | 2 = 0): number {
    const live = rows.filter(r => isRow(r) && !r.off);
    if (live.length === 0 && mode === 0) return 0;
    if (depth > 8) {
      this.problem('too-deep', `"${owner}": its tests are nested too deep. It does not run.`);
      if (SMALL_FIX.GH439 && this.ruleNow) this.ruleNow.off = true;
      return 0;
    }
    const parts: number[][] = [];
    for (const r of live) {
      const def = kindOf('cond', r.k);
      if (!def) { this.problem('newer-kind', `"${owner}": a test made in a newer version is kept. The event does not run, because its test cannot be asked.`, r.id, true); parts.push([this.falseRow()]); continue; }
      if (def.door) { this.problem('door', `"${owner}": "${def.label}" comes in a later version. The event does not run.`, r.id, true); parts.push([this.falseRow()]); continue; }
      if (def.lower === 'all' || def.lower === 'any' || def.lower === 'not') {
        const list = Array.isArray(r.a?.list) ? r.a.list as Row[] : [];
        const addr = this.condBlock(list, owner, depth + 1, def.lower === 'all' ? 0 : def.lower === 'any' ? 1 : 2);
        parts.push([addr]);
        continue;
      }
      const ip = this.encode(def, r, owner);
      if (ip < 0) { parts.push([this.falseRow()]); continue; }
      parts.push([ip]);
    }
    const ip = this.code.length;
    this.code.push(OP_CLIST, mode, parts.length, 4 + parts.length);
    for (const q of parts) this.code.push(q[0]);
    return ip;
  }

  _false = -1;
  falseRow(): number {
    if (this._false >= 0) return this._false;
    const ip = this.code.length;
    this.code.push(OP_CLIST, 1, 0, 4);
    this._false = ip;
    return ip;
  }

  private _restStack: Row[][] = [];
  steps(rows: Row[], owner: string): void {
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!isRow(row) || row.off) continue;
      this._restStack.push(rows.slice(ri + 1));
      try { this.stepRow(row, owner); } finally { this._restStack.pop(); }
    }
  }
  private stepRow(row: Row, owner: string): void {
    {
      const def = kindOf('step', row.k);
      if (!def) { this.problem('newer-kind', `"${owner}": a step made in a newer version is kept and skipped.`, row.id, true); return; }
      if (def.door) { this.problem('door', `"${owner}": "${def.label}" comes in a later version and is skipped.`, row.id, true); return; }
      if (row.a && row.a.after !== undefined) {
        const w = kindOf('step', 'wait')!;
        this.encode(w, { id: 0, k: 'wait', a: { seconds: row.a.after } }, owner);
      }
      switch (def.lower) {
        case 'if': this.lowerIf(row, owner); break;
        case 'pick': this.lowerPick(row, owner); break;
        case 'repeat': this.lowerRepeat(row, owner); break;
        case 'forEach': this.lowerForEach(row, owner); break;
        case 'fork': this.lowerFork(row, owner); break;
        case 'waitUntil': this.lowerWaitUntil(row, owner); break;
        case 'call': this.lowerCall(row, owner); break;
        case 'play': this.lowerPlay(row, owner); break;
        default: {
          if (row.k === 'wait' || row.k === 'var.set' || row.k === 'var.add' || row.k === 'signal' || row.k === 'rule.set' || row.k === 'timer.start') this.edges(row);
          const at = this.encode(def, row, owner);
          if (SMALL_FIX.GH385 && at >= 0 && row.k === 'spawn' && this._restStack.some(l => (SMALL_FIX.GH573 !== 0 ? JSON.stringify(l, liveRowsOnly) : JSON.stringify(l)).includes('"lastSpawned"'))) this.p.spawnRead.add(at);
        }
      }
    }
  }

  condInline(rows: Row[], owner: string): number {
    this.code.push(OP_JUMP, 0);
    const j = this.code.length - 1;
    const at = this.condBlock(rows, owner, 0);
    this.code[j] = this.code.length;
    return at;
  }

  lowerIf(row: Row, owner: string): void {
    const a = row.a ?? {};
    const cond = this.condInline(Array.isArray(a.cond) ? a.cond as Row[] : [], owner);
    const ip = this.code.length;
    this.code.push(OP_IF, cond, 0);
    this.steps(Array.isArray(a.then) ? a.then as Row[] : [], owner);
    this.code.push(OP_JUMP, 0);
    const jmp = this.code.length - 1;
    this.code[ip + 2] = this.code.length;
    this.steps(Array.isArray(a.else) ? a.else as Row[] : [], owner);
    this.code[jmp] = this.code.length;
  }
  lowerPick(row: Row, owner: string): void {
    const a = row.a ?? {};
    const options = Array.isArray(a.options) ? a.options as { weight?: unknown; do?: Row[] }[] : [];
    const ip = this.code.length;
    this.code.push(OP_PICK, a._inTurn ? 1 : 0, options.length, 0);
    for (const o of options) { this.code.push(this.numOf(o?.weight ?? 1, owner), 0); }
    const jumps: number[] = [];
    for (let i = 0; i < options.length; i++) {
      this.code[ip + 4 + i * 2 + 1] = this.code.length;
      this.steps(Array.isArray(options[i]?.do) ? options[i].do! : [], owner);
      this.code.push(OP_JUMP, 0);
      jumps.push(this.code.length - 1);
    }
    for (const j of jumps) this.code[j] = this.code.length;
    this.code[ip + 3] = this.code.length;
  }
  newLocal(owner: string): number { const l = this.localsNow++; if (this.localsNow > MAX_LOCALS) this.problem('too-many-repeats', `"${owner}": more than ${MAX_LOCALS} repeats inside each other.`); return l; }
  lowerRepeat(row: Row, owner: string): void {
    const a = row.a ?? {};
    const local = this.newLocal(owner);
    this.code.push(OP_REPEAT_INIT, local, this.numOf(a.times ?? 1, owner));
    const test = this.code.length;
    this.code.push(OP_REPEAT_TEST, local, 0);
    const body = Array.isArray(a.do) ? a.do as Row[] : [];
    if (SMALL_FIX.GH572 !== 0) this._restStack.push(body);
    try { this.steps(body, owner); } finally { if (SMALL_FIX.GH572 !== 0) this._restStack.pop(); }
    this.code.push(OP_JUMP, test);
    this.code[test + 2] = this.code.length;
  }
  lowerForEach(row: Row, owner: string): void {
    const a = row.a ?? {};
    const t = this.target((a.who ?? { w: 'allTanks' }) as Target);
    const ip = this.code.length;
    this.code.push(OP_FOREACH, t, a.wait === false ? 0 : 1, 0);
    this.steps(Array.isArray(a.do) ? a.do as Row[] : [], owner);
    this.code.push(OP_END);
    this.code[ip + 3] = this.code.length;
  }
  lowerFork(row: Row, owner: string): void {
    const a = row.a ?? {};
    const ip = this.code.length;
    this.code.push(OP_FORK, 0);
    this.steps(Array.isArray(a.do) ? a.do as Row[] : [], owner);
    this.code.push(OP_END);
    this.code[ip + 1] = this.code.length;
  }
  lowerWaitUntil(row: Row, owner: string): void {
    const a = row.a ?? {};
    const cond = this.condInline(Array.isArray(a.cond) ? a.cond as Row[] : [], owner);
    this.code.push(OP_WAITUNTIL, this.numOf(a.timeout ?? 0, owner), cond);
  }
  callSites: { at: number; ref: Ref | undefined; doc: number; owner: string }[] = [];
  lowerCall(row: Row, owner: string): void {
    const a = row.a ?? {};
    const args = Array.isArray(a.args) ? a.args as unknown[] : [];
    const at = this.code.length;
    this.code.push(OP_CALL, -1, a.wait ? 1 : 0, args.length);
    for (const n of args) this.code.push(this.numOf(n, owner));
    this.callSites.push({ at, ref: a.rule as Ref | undefined, doc: this.docIdx, owner });
    this.edgeCall(a.rule as Ref | undefined);
  }
  lowerPlay(row: Row, owner: string): void {
    const a = row.a ?? {};
    const si = this.res(a.seq, 'seq');
    if (si < 0) { this.problem('dead-ref', `"${owner}": "Play A Sequence" names "${(a.seq as Ref)?.n ?? ''}", which is gone.`, row.id); return; }
    this.code.push(OP_PLAY, si, a.wait === false ? 0 : 1);
  }
  patchCalls(): void {
    for (const c of this.callSites) {
      const was = this.docIdx; this.docIdx = c.doc;
      const ri = this.res(c.ref, 'rule');
      this.docIdx = was;
      if (ri < 0) this.problem('dead-ref', `"${c.owner}": "Do A Custom Action" names "${c.ref?.n ?? ''}", which is gone.`, c.ref?.id ?? 0);
      this.code[c.at + 1] = ri;
    }
  }

  edgeList = new Map<number, Set<string>>();
  edges(row: Row): void {
    const rule = this.ruleNow;
    if (!rule) return;
    const set = this.edgeList.get(rule.idx) ?? new Set<string>();
    const a = row.a ?? {};
    if (row.k === 'wait') set.add('wait');
    else if (row.k === 'signal' && a.signal) set.add('signal:' + this.res(a.signal, 'signal'));
    else if ((row.k === 'var.set' || row.k === 'var.add') && a.var) set.add('var:' + this.res(a.var, 'var'));
    this.edgeList.set(rule.idx, set);
  }
  edgeCall(ref: Ref | undefined): void {
    const rule = this.ruleNow;
    if (!rule || !ref) return;
    const set = this.edgeList.get(rule.idx) ?? new Set<string>();
    set.add('call:' + ref.id);
    this.edgeList.set(rule.idx, set);
  }
  findCycles(): void {
    const p = this.p;
    const fires = new Map<string, number[]>();
    const add = (k: string, r: number) => { const l = fires.get(k); if (l) l.push(r); else fires.set(k, [r]); };
    const sigDef = kindOf('trigger', 'signal.got')!;
    for (const t of p.byKind[sigDef.op!] ?? []) add('signal:' + this.code[t.ip + 1], t.rule);
    for (const w of p.varWatches) add('var:' + w.varIdx, w.rule);
    for (const r of p.rules) { add('call:' + r.id, r.idx); }
    const color = new Int8Array(p.rules.length);
    const hasWait = (r: number) => this.edgeList.get(r)?.has('wait') ?? false;
    const visit = (r: number, stack: number[]): void => {
      color[r] = 1; stack.push(r);
      for (const e of this.edgeList.get(r) ?? []) {
        if (e === 'wait') continue;
        for (const to of fires.get(e) ?? []) {
          if (hasWait(r)) continue;
          if (color[to] === 1) {
            const at = stack.indexOf(to);
            const names = stack.slice(at).map(i => p.rules[i].name).join(', ');
            this.docIdx = p.rules[r].doc;
            this.problem('cycle', `These Map Events start each other with no wait between: ${names}. The game will not freeze, but they will stop when the chain limit is reached.`, p.rules[r].id, true);
          } else if (color[to] === 0) visit(to, stack);
        }
      }
      stack.pop(); color[r] = 2;
    };
    for (let i = 0; i < p.rules.length; i++) if (color[i] === 0) visit(i, []);
  }

  trackAreas(): void {
    const p = this.p;
    const need = new Set<number>();
    for (const name of ['area.entered', 'area.left']) {
      const d = kindOf('trigger', name)!;
      for (const t of p.byKind[d.op!] ?? []) need.add(this.code[t.ip + 1]);
    }
    for (const s of p.stays) need.add(s.zone);
    let bit = 0;
    for (const z of need) {
      if (z < 0) continue;
      if (bit >= MAX_TRACKED_AREAS) { this.docIdx = p.zones[z].doc; this.problem('too-many-tracked', `More than ${MAX_TRACKED_AREAS} Custom Areas watch who walks in. "${p.zones[z].name}" is not watched.`, p.zones[z].uid); continue; }
      p.zones[z].bit = bit++;
      p.tracked.push(z);
    }
  }
}

export function fieldSlotOf(family: Parameters<typeof kindOf>[0], kind: string, field: string): number {
  const d = kindOf(family, kind);
  return d ? slotOf(d, field) : -1;
}
