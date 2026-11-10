import type {
  AreaGroup, TankGroup, EntityForm, EntityType, Id, MapEventsDoc, Named, PlacedEntity, Ref, Row, Rule, SpawnCard, SpawnGroup, StatusDef, TimerDef, VarDef, WaveOverride, WavePlan, ZoneLike, Num,
} from './doc';
import { DEFAULT_PLACE_RULE, SIDE_WORDS, newEventsDoc, shiftShape, flipShape } from './doc';
import { kindOf, darkStepHides, type Family, type Field, type KindDef } from './registry';
import { evalNum } from './num';
import { WALL_RULES } from '../wallTypes';
import { SMALL_FIX } from '../smallFixSwitch';
import { colourWordShown } from './colourWord';

export type Path = readonly (string | number)[];

export function getAt(root: unknown, path: Path): unknown {
  let v: unknown = root;
  for (const k of path) { if (v === null || typeof v !== 'object') return undefined; v = (v as Record<string | number, unknown>)[k]; }
  return v;
}
export function setAt<T>(root: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [k, ...rest] = path;
  const here = (root ?? (typeof k === 'number' ? [] : {})) as Record<string | number, unknown>;
  const child = setAt(here[k], rest, value);
  if (child === here[k] && (value !== undefined || k in here)) return root;
  if (Array.isArray(here)) { const a = here.slice(); a[k as number] = child; return a as unknown as T; }
  const o = { ...here };
  if (child === undefined) delete o[k]; else o[k] = child;
  return o as unknown as T;
}
export function insertAt<T>(root: T, listPath: Path, index: number, value: unknown): T {
  const list = (getAt(root, listPath) as unknown[] | undefined) ?? [];
  const a = list.slice();
  a.splice(index < 0 || index > a.length ? a.length : index, 0, value);
  return setAt(root, listPath, a);
}
export function removeAt<T>(root: T, listPath: Path, index: number): T {
  const list = (getAt(root, listPath) as unknown[] | undefined) ?? [];
  if (index < 0 || index >= list.length) return root;
  const a = list.slice();
  a.splice(index, 1);
  return setAt(root, listPath, a);
}
export function moveAt<T>(root: T, listPath: Path, from: number, to: number): T {
  const list = (getAt(root, listPath) as unknown[] | undefined) ?? [];
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return root;
  const a = list.slice();
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return setAt(root, listPath, a);
}

export function withIds<T>(doc: MapEventsDoc | undefined, build: (id: () => Id, base: MapEventsDoc) => T): { doc: MapEventsDoc; value: T } {
  const base = doc ?? newEventsDoc();
  let next = base.nextId;
  const value = build(() => next++, base);
  return { doc: { ...base, nextId: next }, value };
}

function defaultOf(f: Field): unknown {
  switch (f.t) {
    case 'num': case 'int': case 'bool': case 'enum': case 'text': return f.def;
    case 'target': return f.def;
    default: return undefined;
  }
}
export function makeRow(id: Id, family: Family, word: string): Row {
  const d = kindOf(family, word);
  const a: Record<string, unknown> = {};
  if (d) for (const k of Object.keys(d.fields)) { const v = defaultOf(d.fields[k]); if (v !== undefined) a[k] = v; }
  return { id, k: word, a };
}

export function freeName(prefix: string, taken: readonly { name?: string }[]): string {
  const names = new Set(taken.map(t => t.name));
  if (!names.has(prefix)) return prefix;
  for (let i = 2; ; i++) if (!names.has(`${prefix} ${i}`)) return `${prefix} ${i}`;
}
export type NamedList = 'types' | 'placed' | 'plans' | 'rules' | 'sequences' | 'vars' | 'timers' | 'statuses' | 'signals' | 'tags' | 'folders' | 'areaGroups' | 'tankGroups';

export function indexOfId(doc: MapEventsDoc | undefined, list: NamedList, id: Id): number {
  const a = doc?.[list] as { id: Id }[] | undefined;
  return a ? a.findIndex(x => x.id === id) : -1;
}
export function renameThing(doc: MapEventsDoc, list: NamedList, id: Id, name: string): MapEventsDoc {
  const i = indexOfId(doc, list, id);
  return i < 0 ? doc : setAt(doc, [list, i, 'name'], name);
}
export function removeThing(doc: MapEventsDoc, list: NamedList, id: Id): MapEventsDoc {
  return removeAt(doc, [list], indexOfId(doc, list, id));
}

export function addRule(doc: MapEventsDoc | undefined, name: string, whenWord?: string, folder?: Id): { doc: MapEventsDoc; id: Id } {
  const r = withIds(doc, (id, base) => {
    const rule: Rule = { id: id(), name: freeName(name, base.rules ?? []), when: whenWord ? [makeRow(id(), 'trigger', whenWord)] : [], cond: [], then: [] };
    if (folder !== undefined) rule.folder = folder;
    return rule;
  });
  return { doc: { ...r.doc, rules: [...(r.doc.rules ?? []), r.value] }, id: r.value.id };
}
export function addRowAt(doc: MapEventsDoc, listPath: Path, family: Family, word: string, index = -1): { doc: MapEventsDoc; id: Id } {
  const r = withIds(doc, id => makeRow(id(), family, word));
  return { doc: insertAt(r.doc, listPath, index, r.value), id: r.value.id };
}
export function setRowField(doc: MapEventsDoc, rowPath: Path, field: string, value: unknown): MapEventsDoc {
  return setAt(doc, [...rowPath, 'a', field], value);
}
export function changeRowKind(doc: MapEventsDoc, rowPath: Path, family: Family, word: string): MapEventsDoc {
  const old = getAt(doc, rowPath) as Row;
  const fresh = makeRow(old.id, family, word);
  const d = kindOf(family, word);
  if (d) for (const k of Object.keys(old.a)) if (d.fields[k]) fresh.a[k] = old.a[k];
  return setAt(doc, rowPath, fresh);
}
export function duplicateRule(doc: MapEventsDoc, id: Id): { doc: MapEventsDoc; id: Id } {
  const i = indexOfId(doc, 'rules', id);
  if (i < 0) return { doc, id };
  const r = withIds(doc, (take, base) => {
    const copy = reId(base.rules![i], take) as Rule;
    copy.name = freeName(copy.name, base.rules!);
    delete copy.shipped; delete copy.shortcut;
    return copy;
  });
  return { doc: insertAt(r.doc, ['rules'], i + 1, r.value), id: r.value.id };
}
function reId(v: unknown, take: () => Id): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => reId(x, take));
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) out[k] = reId(o[k], take);
  if (typeof o.id === 'number' && typeof o.n !== 'string') out.id = take();
  return out;
}

export function copyForPaste<T>(v: T, doc: MapEventsDoc | undefined, zones: readonly ZoneLike[]): T {
  const copy = JSON.parse(JSON.stringify(v)) as T;
  if (!SMALL_FIX.GH500) return copy;
  const byId = namesOf(doc, zones);
  const walk = (x: unknown): void => {
    if (x === null || typeof x !== 'object') return;
    if (Array.isArray(x)) { for (const y of x) walk(y); return; }
    const o = x as Record<string, unknown>;
    if (typeof o.id === 'number' && typeof o.n === 'string' && !('k' in o)) { const now = byId(o.id); if (now !== undefined) o.n = now; return; }
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(copy);
  return copy;
}
function relink(v: unknown, doc: MapEventsDoc, zones: readonly ZoneLike[], take?: () => Id): unknown {
  const byId = namesOf(doc, zones);
  const byName = new Map<string, number>();
  for (const list of [doc.types, doc.placed, doc.plans, doc.rules, doc.sequences, doc.vars, doc.timers, doc.statuses, doc.signals, doc.tags, doc.folders, doc.areaGroups, doc.tankGroups]) {
    if (Array.isArray(list)) for (const t of list as { id: number; name: string }[]) if (!byName.has(t.name)) byName.set(t.name, t.id);
  }
  for (const z of zones) if (typeof z.uid === 'number' && z.name && !byName.has(z.name)) byName.set(z.name, z.uid);
  const walk = (x: unknown): unknown => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(walk);
    const o = x as Record<string, unknown>;
    if (typeof o.id === 'number' && typeof o.n === 'string' && !('k' in o)) {
      if (byId(o.id) === o.n) return o;
      const found = byName.get(o.n);
      if (found !== undefined) return { ...o, id: found };
      if (SMALL_FIX.GH500 && take && byId(o.id) !== undefined) return { ...o, id: take() };
      return o;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = walk(o[k]);
    return out;
  };
  return walk(v);
}
export function pasteRule(doc: MapEventsDoc | undefined, zones: readonly ZoneLike[], rule: Rule, at = -1): { doc: MapEventsDoc; id: Id } {
  const r = withIds(doc, (take, base) => {
    const copy = reId(relink(rule, base, zones, take), take) as Rule;
    copy.name = freeName(copy.name, base.rules ?? []);
    delete copy.shipped; delete copy.shortcut; delete copy.folder;
    return copy;
  });
  return { doc: insertAt(r.doc, ['rules'], at, r.value), id: r.value.id };
}
export function pastePlan(doc: MapEventsDoc | undefined, zones: readonly ZoneLike[], plan: WavePlan): { doc: MapEventsDoc; id: Id } {
  const r = withIds(doc, (take, base) => {
    const copy = reId(relink(plan, base, zones, take), take) as WavePlan;
    copy.name = freeName(copy.name, base.plans ?? []);
    return copy;
  });
  return { doc: { ...r.doc, plans: [...(r.doc.plans ?? []), r.value] }, id: r.value.id };
}
export function pasteLine(doc: MapEventsDoc, zones: readonly ZoneLike[], listPath: Path, line: SpawnGroup): MapEventsDoc {
  const r = withIds(doc, (take, base) => reId(relink(line, base, zones, take), take) as SpawnGroup);
  return insertAt(r.doc, listPath, -1, r.value);
}
export function duplicatePlaced(doc: MapEventsDoc, id: Id): { doc: MapEventsDoc; id: Id } {
  const i = indexOfId(doc, 'placed', id);
  if (i < 0) return { doc, id };
  const r = withIds(doc, (take, base) => {
    const p = base.placed![i];
    return { ...p, id: take(), name: freeName(p.name, base.placed!), cx: p.cx + 1, cy: p.cy + 1 } as PlacedEntity;
  });
  return { doc: insertAt(r.doc, ['placed'], i + 1, r.value), id: r.value.id };
}
export function duplicateZone(root: MapEventsDoc, index: number, zonesKey = '@zones'): { doc: MapEventsDoc; id: Id } {
  const zones = (root as Record<string, unknown>)[zonesKey] as (ZoneLike & { behaviors?: Row[] })[];
  const z = zones[index];
  if (!z) return { doc: root, id: -1 };
  const nextZoneId = zones.reduce((m, q) => Math.max(m, q.id), 0) + 1;
  const r = withIds(root, take => {
    const copy = reId(z, take) as ZoneLike;
    const names = new Set(zones.map(q => q.name));
    let name = z.name ?? 'Area';
    for (let i = 2; names.has(name); i++) name = `${z.name ?? 'Area'} ${i}`;
    const out: ZoneLike = { ...copy, id: nextZoneId, uid: take(), name, gx: z.gx + 1, gy: z.gy + 1 };
    if (z.more) out.more = z.more.map(m => ({ ...m, gx: m.gx + 1, gy: m.gy + 1 }));
    if (z.shape) out.shape = shiftShape(z.shape, 1, 1);
    return out;
  });
  return { doc: { ...r.doc, [zonesKey]: [...zones, r.value] } as MapEventsDoc, id: nextZoneId };
}
const FLIPS: readonly [boolean, boolean][] = [[true, false], [false, true], [true, true]];
export function mirrorPlaced(doc: MapEventsDoc, id: Id, w: number, h: number): MapEventsDoc {
  const i = indexOfId(doc, 'placed', id);
  if (i < 0) return doc;
  const p = doc.placed![i];
  const seen = [[p.cx, p.cy]];
  let next = doc;
  for (const [fx, fy] of FLIPS) {
    const cx = fx ? w - p.cx : p.cx, cy = fy ? h - p.cy : p.cy;
    if (seen.some(s => Math.abs(s[0] - cx) < 0.01 && Math.abs(s[1] - cy) < 0.01)) continue;
    seen.push([cx, cy]);
    const r = withIds(next, (take, base) => ({ ...p, id: take(), name: freeName(p.name, base.placed!), cx, cy } as PlacedEntity));
    next = { ...r.doc, placed: [...r.doc.placed!, r.value] };
  }
  return next;
}
export function mirrorZone(root: MapEventsDoc, index: number, w: number, h: number, zonesKey = '@zones'): MapEventsDoc {
  const zones0 = (root as Record<string, unknown>)[zonesKey] as (ZoneLike & { behaviors?: Row[] })[];
  const z = zones0[index];
  if (!z) return root;
  const flip = (q: { gx: number; gy: number; cw: number; ch: number }, fx: boolean, fy: boolean) => ({ ...q, gx: fx ? w - q.gx - q.cw : q.gx, gy: fy ? h - q.gy - q.ch : q.gy });
  const seen = [`${z.gx},${z.gy}`];
  let next = root;
  for (const [fx, fy] of FLIPS) {
    const spot = flip(z, fx, fy), key = `${spot.gx},${spot.gy}`;
    if (seen.includes(key)) continue;
    seen.push(key);
    const zones = (next as Record<string, unknown>)[zonesKey] as (ZoneLike & { behaviors?: Row[] })[];
    const nextZoneId = zones.reduce((m, q) => Math.max(m, q.id), 0) + 1;
    const r = withIds(next, take => {
      const copy = reId(z, take) as ZoneLike;
      const out: ZoneLike = { ...copy, id: nextZoneId, uid: take(), name: freeName(z.name ?? 'Area', zones as { name?: string }[]), gx: spot.gx, gy: spot.gy };
      if (z.more) out.more = z.more.map(m => flip(m, fx, fy));
      if (z.shape) out.shape = flipShape(z.shape, w, h, fx, fy);
      return out;
    });
    next = { ...r.doc, [zonesKey]: [...zones, r.value] } as MapEventsDoc;
  }
  return next;
}
export function tokensToNames(text: string, name: (id: number) => string | undefined): string {
  return text.replace(/\{(\d+)\}/g, (m, id: string) => { const n = name(Number(id)); return n !== undefined ? `{${n}}` : m; });
}
export function tokensToIds(text: string, doc: MapEventsDoc | undefined): string {
  if (!doc) return text;
  const by = new Map<string, number>();
  for (const list of [doc.vars, doc.timers, doc.tags, doc.types]) if (Array.isArray(list)) for (const t of list as { id: number; name: string }[]) if (!by.has(t.name)) by.set(t.name, t.id);
  return text.replace(/\{([^{}]+)\}/g, (m, w: string) => { const id = by.get(w); return id !== undefined ? `{${id}}` : m; });
}

export function fillDown(doc: MapEventsDoc, overridesPath: Path, index: number, n: number): MapEventsDoc {
  const list = getAt(doc, overridesPath) as WaveOverride[];
  const o = list[index];
  const w0 = o?.test?.list?.[0];
  if (w0 === undefined) return doc;
  const taken = new Set(list.flatMap(x => x.test.list ?? []));
  const r = withIds(doc, take => {
    const made: WaveOverride[] = [];
    for (let k = 1; k <= n; k++) if (!taken.has(w0 + k)) { const c = reId(o, take) as WaveOverride; c.test = { list: [w0 + k] }; made.push(c); }
    return made;
  });
  return setAt(r.doc, overridesPath, [...list, ...r.value]);
}
export function ramp(doc: MapEventsDoc, overridesPath: Path, from: number, step: number): MapEventsDoc {
  const list = getAt(doc, overridesPath) as WaveOverride[];
  const w0 = list[from]?.test?.list?.[0];
  if (w0 === undefined) return doc;
  return setAt(doc, overridesPath, list.map(o => {
    const w = o.test.list?.[0];
    if (w === undefined || w <= w0) return o;
    return { ...o, groups: o.groups.map(g => (typeof g.count === 'number' ? { ...g, count: Math.max(0, g.count + step * (w - w0)) } : g)) };
  }));
}

export function addTag(doc: MapEventsDoc | undefined, name: string): { doc: MapEventsDoc; ref: Ref } {
  const r = withIds(doc, (id, base) => ({ id: id(), name: freeName(name, base.tags ?? []) } as Named));
  return { doc: { ...r.doc, tags: [...(r.doc.tags ?? []), r.value] }, ref: { id: r.value.id, n: r.value.name } };
}
export function addNamed(doc: MapEventsDoc | undefined, list: 'signals' | 'folders', name: string): { doc: MapEventsDoc; ref: Ref } {
  const r = withIds(doc, (id, base) => ({ id: id(), name: freeName(name, (base[list] as Named[]) ?? []) } as Named));
  return { doc: { ...r.doc, [list]: [...((r.doc[list] as Named[]) ?? []), r.value] }, ref: { id: r.value.id, n: r.value.name } };
}
export function addTimer(doc: MapEventsDoc | undefined, name: string, seconds: Num = 60): { doc: MapEventsDoc; ref: Ref } {
  const r = withIds(doc, (id, base) => ({ id: id(), name: freeName(name, base.timers ?? []), seconds } as TimerDef));
  return { doc: { ...r.doc, timers: [...(r.doc.timers ?? []), r.value] }, ref: { id: r.value.id, n: r.value.name } };
}
export function addVar(doc: MapEventsDoc | undefined, name: string): { doc: MapEventsDoc; ref: Ref } {
  const r = withIds(doc, (id, base) => ({ id: id(), name: freeName(name, base.vars ?? []), kind: 'number', start: 0, scope: 'match' } as VarDef));
  return { doc: { ...r.doc, vars: [...(r.doc.vars ?? []), r.value] }, ref: { id: r.value.id, n: r.value.name } };
}
export function addStatus(doc: MapEventsDoc | undefined, name: string): { doc: MapEventsDoc; ref: Ref } {
  const r = withIds(doc, (id, base) => ({ id: id(), name: freeName(name, base.statuses ?? []), seconds: 5, effects: [] } as StatusDef));
  return { doc: { ...r.doc, statuses: [...(r.doc.statuses ?? []), r.value] }, ref: { id: r.value.id, n: r.value.name } };
}
export function addTankGroup(doc: MapEventsDoc | undefined, name: string): { doc: MapEventsDoc; ref: Ref } {
  const r = withIds(doc, (id, base) => ({ id: id(), name: freeName(name, base.tankGroups ?? []), tanks: [] } as TankGroup));
  return { doc: { ...r.doc, tankGroups: [...(r.doc.tankGroups ?? []), r.value] }, ref: { id: r.value.id, n: r.value.name } };
}
export function addAreaGroup(doc: MapEventsDoc | undefined, name: string, members: Ref[] = []): { doc: MapEventsDoc; ref: Ref } {
  const r = withIds(doc, (id, base) => ({ id: id(), name: freeName(name, base.areaGroups ?? []), members } as AreaGroup));
  return { doc: { ...r.doc, areaGroups: [...(r.doc.areaGroups ?? []), r.value] }, ref: { id: r.value.id, n: r.value.name } };
}

export function addEntityType(doc: MapEventsDoc | undefined, name: string, tank: string, teamWord = 'againstPlayer', placed = true): { doc: MapEventsDoc; ref: Ref } {
  const r = withIds(doc, (id, base) => ({
    id: id(), name: freeName(name, base.types ?? []), side: { team: teamWord }, stands: placed,
    forms: [{ id: id(), name: 'Form 1', tank }],
  } as EntityType));
  return { doc: { ...r.doc, types: [...(r.doc.types ?? []), r.value] }, ref: { id: r.value.id, n: r.value.name } };
}
export function addForm(doc: MapEventsDoc, typeId: Id, name: string, tank: string): { doc: MapEventsDoc; id: Id } {
  const i = indexOfId(doc, 'types', typeId);
  if (i < 0) return { doc, id: -1 };
  const r = withIds(doc, id => ({ id: id(), name, tank } as EntityForm));
  return { doc: insertAt(r.doc, ['types', i, 'forms'], -1, r.value), id: r.value.id };
}
export function setBecome(doc: MapEventsDoc, typeId: Id, tank: string | null, bothWays = true, name = 'After Death'): MapEventsDoc {
  const i = indexOfId(doc, 'types', typeId);
  if (i < 0) return doc;
  const t = doc.types![i];
  if (tank === null) {
    const forms = t.forms.map(f => { const c = { ...f }; delete c.onDeath; return c; });
    return setAt(doc, ['types', i, 'forms'], forms);
  }
  const first = t.forms[0];
  let next = doc, second = t.forms[1];
  if (!second) { const a = addForm(next, typeId, name, tank); next = a.doc; second = (next.types![i].forms[1]); }
  else next = setAt(next, ['types', i, 'forms', 1, 'tank'], tank);
  next = setAt(next, ['types', i, 'forms', 0, 'onDeath'], { ...(first.onDeath ?? {}), to: second.id, team: first.onDeath?.team ?? 'form' });
  if (bothWays) next = setAt(next, ['types', i, 'forms', 1, 'onDeath'], { ...(second.onDeath ?? {}), to: first.id, team: second.onDeath?.team ?? 'form' });
  else next = setAt(next, ['types', i, 'forms', 1, 'onDeath'], undefined);
  return next;
}
export function placeEntity(doc: MapEventsDoc, type: Ref, cx: number, cy: number, home?: Ref): { doc: MapEventsDoc; id: Id } {
  const r = withIds(doc, (id, base) => {
    const p: PlacedEntity = { id: id(), name: freeName(type.n || 'Map Entity', base.placed ?? []), type, cx, cy };
    if (home) p.home = home;
    return p;
  });
  return { doc: { ...r.doc, placed: [...(r.doc.placed ?? []), r.value] }, id: r.value.id };
}

export function addPlan(doc: MapEventsDoc | undefined, name: string): { doc: MapEventsDoc; ref: Ref } {
  const r = withIds(doc, (id, base) => ({
    id: id(), name: freeName(name, base.plans ?? []), start: { on: 'match', delay: 5 }, first: 1, last: null, stream: 10, compose: { mode: 'counts' },
    groups: [], advance: { on: 'cleared', break: 10 }, place: DEFAULT_PLACE_RULE, side: { team: 'againstPlayer' },
  } as WavePlan));
  return { doc: { ...r.doc, plans: [...(r.doc.plans ?? []), r.value] }, ref: { id: r.value.id, n: r.value.name } };
}
export function addGroup(doc: MapEventsDoc, plansPath: Path, name: string, cards: Omit<SpawnCard, 'id'>[], count: Num, at: Ref[] | 'plan'): { doc: MapEventsDoc; id: Id } {
  const r = withIds(doc, id => ({
    id: id(), name, cards: cards.map(c => ({ ...c, id: id() })), count, spread: 0, round: 'chance', at, split: 'shared', blocks: true,
  } as SpawnGroup));
  return { doc: insertAt(r.doc, plansPath, -1, r.value), id: r.value.id };
}
export function addCard(doc: MapEventsDoc, cardsPath: Path, card: Omit<SpawnCard, 'id'>): MapEventsDoc {
  const r = withIds(doc, id => ({ ...card, id: id() } as SpawnCard));
  return insertAt(r.doc, cardsPath, -1, r.value);
}

export function typeCell(doc: MapEventsDoc, planIndex: number, groupId: Id, wave: number, raw: string): MapEventsDoc {
  const plan = doc.plans?.[planIndex];
  if (!plan) return doc;
  const g = plan.groups.find(x => x.id === groupId);
  if (!g) return doc;
  const cells = plan.cells ?? [];
  const left = cells.filter(c => !(c.g === groupId && c.w === wave));
  let next = left;
  if (raw.trim() !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return doc;
    const shown = evalNum(g.count, wave);
    if (!(Number.isFinite(shown) && Math.abs(n - shown) < 1e-9)) next = [...left, { w: wave, g: groupId, n }];
  }
  if (next.length === cells.length && next.every((c, i) => c === cells[i])) return doc;
  return setAt(doc, ['plans', planIndex, 'cells'], next.length ? next : undefined);
}

export interface MessageRow { text: string; path: Path; field: string; where: string; rule?: Id; }
export function messagesOf(doc: MapEventsDoc | undefined, zones: readonly ZoneLike[] = [], zonePath?: (i: number) => Path): MessageRow[] {
  const out: MessageRow[] = [];
  const isRow = isRowLike;
  const steps = (list: unknown[], path: Path, where: string, rule?: Id): void => {
    list.forEach((x, j) => { if (isRow(x)) one(x, 'step', [...path, j], where, rule); });
  };
  const data = (v: unknown, path: Path, field: string, where: string, rule: Id | undefined, depth: number): void => {
    if (depth > 8 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      if (v.some(isRow)) { steps(v, path, where, rule); return; }
      if (field === 'lines') { v.forEach((s, n) => { if (typeof s === 'string' && s) out.push({ text: s, path, field: String(n), where: `${where}, in turn`, rule }); }); return; }
      v.forEach((x, n) => data(x, [...path, n], field, where, rule, depth + 1));
      return;
    }
    const o = v as Record<string, unknown>;
    const w = typeof o.at === 'number' && Array.isArray(o.steps) ? `${where}, after ${o.at} s` : where;
    for (const k of Object.keys(o)) data(o[k], [...path, k], k, w, rule, depth + 1);
  };
  const one = (row: Row, family: Family, p: Path, where: string, rule?: Id): void => {
    const def = kindOf(family, row.k);
    if (!def) return;
    for (const k of Object.keys(def.fields)) {
      const f = def.fields[k], v = row.a[k];
      if (f.t === 'text' && typeof v === 'string' && v) out.push({ text: v, path: [...p, 'a'], field: k, where, rule });
      else if (f.t === 'steps' && Array.isArray(v)) steps(v, [...p, 'a', k], where, rule);
      else if (f.t === 'json') data(v, [...p, 'a', k], k, where, rule, 0);
    }
  };
  if (doc) {
    (doc.rules ?? []).forEach((r, i) => steps(r.then ?? [], ['rules', i, 'then'], r.name, r.id));
    (doc.sequences ?? []).forEach((s, i) => (s.tracks ?? []).forEach((t, ti) => (t.clips ?? []).forEach((c, ci) => {
      if (isRow(c.step)) one(c.step, 'step', ['sequences', i, 'tracks', ti, 'clips', ci, 'step'], s.name);
    })));
    (doc.types ?? []).forEach((t, i) => {
      if (typeof t.killLine === 'string') out.push({ text: t.killLine, path: ['types', i], field: 'killLine', where: t.name });
      t.forms.forEach((f, j) => { if (typeof f.killLine === 'string') out.push({ text: f.killLine, path: ['types', i, 'forms', j], field: 'killLine', where: `${t.name}, ${f.name}` }); });
      if (t.madeLines) for (const k of Object.keys(t.madeLines)) out.push({ text: t.madeLines[k], path: ['types', i, 'madeLines'], field: k, where: `${t.name}, what it makes` });
    });
    const groups = (where: string, list: SpawnGroup[] | undefined, path: Path): void => {
      (list ?? []).forEach((g, k) => { if (typeof g.body?.killLine === 'string') out.push({ text: g.body.killLine, path: [...path, k, 'body'], field: 'killLine', where: `${where}, ${g.name}` }); });
    };
    (doc.plans ?? []).forEach((pl, i) => {
      groups(pl.name, pl.groups, ['plans', i, 'groups']);
      (pl.specials ?? []).forEach((s, j) => groups(`${pl.name}, ${s.name}`, s.groups, ['plans', i, 'specials', j, 'groups']));
    });
  }
  if (zonePath) zones.forEach((z, i) => (z.behaviors ?? []).forEach((b, j) => { if (isRow(b)) one(b, 'behavior', [...zonePath(i), 'behaviors', j], z.name ?? 'Custom Area'); }));
  return out;
}

export function tankWordsOf(doc: MapEventsDoc | undefined, zones: readonly ZoneLike[] = []): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, depth: number): void => {
    if (depth > 64 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const c = o[k];
      if (k === 'tank' && typeof c === 'string' && c) out.add(c);
      else if (k === 'tank' && c && typeof c === 'object' && Array.isArray((c as { list?: unknown[] }).list)) { for (const e of (c as { list: { word?: string }[] }).list) if (e?.word) out.add(e.word); }
      else if (c && typeof c === 'object') walk(c, depth + 1);
    }
  };
  walk(doc, 0);
  for (const z of zones) walk(z.behaviors, 0);
  return [...out];
}

let _namesKey: { doc: MapEventsDoc | undefined; zones: readonly ZoneLike[]; of: (id: number) => string | undefined } | null = null;
export function namesOf(doc: MapEventsDoc | undefined, zones: readonly ZoneLike[]): (id: number) => string | undefined {
  if (_namesKey && _namesKey.doc === doc && _namesKey.zones === zones) return _namesKey.of;
  const m = new Map<number, string>();
  if (doc) {
    for (const list of [doc.types, doc.placed, doc.plans, doc.rules, doc.sequences, doc.vars, doc.timers, doc.statuses, doc.signals, doc.tags, doc.folders, doc.areaGroups, doc.tankGroups]) {
      if (Array.isArray(list)) for (const t of list as { id: number; name: string }[]) m.set(t.id, t.name);
    }
    for (const t of doc.types ?? []) for (const f of t.forms) m.set(f.id, f.name);
  }
  for (const z of zones) if (typeof z.uid === 'number' && z.name) m.set(z.uid, z.name);
  const of = (id: number): string | undefined => m.get(id);
  _namesKey = { doc, zones, of };
  return of;
}
function wordOfBodyTest(v: Record<string, unknown> | undefined, name: (id: number) => string | undefined): string {
  if (!v) return 'Anything';
  const spaced = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');
  const named = (list: unknown): string[] => (Array.isArray(list) ? list.map(r => (typeof r === 'string' ? spaced(r) : name((r as Ref).id) ?? (r as Ref).n ?? '')).filter(Boolean) : []);
  const forms = named(v.forms);
  const words = [...named(v.tags), ...named(v.types), ...(forms.length ? [forms.join(' or ')] : []), ...named(v.groups), ...named(v.tanks), ...named(v.teams)];
  if (Array.isArray(v.colours)) for (const c of v.colours) words.push(`Colour ${colourWordShown(c)}`);
  if (v.boss === true) words.push('A Boss');
  if (v.player === true) words.push('The Player');
  return words.length ? words.join(', ') : 'Anything';
}
export function wordOfWalls(v: unknown, none = 'No Walls'): string {
  const l = Array.isArray(v) ? v.filter((t): t is number => typeof t === 'number' && WALL_RULES[t] !== undefined) : [];
  return l.length === 0 ? none : l.map(t => WALL_RULES[t].name).join(', ');
}
const isRowLike = (x: unknown): x is Row => !!x && typeof x === 'object' && typeof (x as Row).k === 'string' && !!(x as Row).a && typeof (x as Row).a === 'object';
const clip = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 3).trimEnd()}...` : t);
function sentenceWith(def: KindDef, row: Row, name: (id: number) => string | undefined): string {
  return def.sentence.replace(/\{([a-zA-Z]+)\}/g, (_a, k: string) => wordOfValue(row.a[k], def, k, name)).replace(/ {2,}/g, ' ').trim();
}
function condsWords(v: unknown, name: (id: number) => string | undefined, depth = 0): string {
  const l = Array.isArray(v) ? v.filter(isRowLike) : [];
  if (l.length === 0) return '...';
  return l.map(c => condWords(c, name, depth)).join(' and ');
}
function condWords(c: Row, name: (id: number) => string | undefined, depth: number): string {
  const def = kindOf('cond', c.k);
  if (!def) return 'a test of a newer version';
  const inner = Array.isArray(c.a.list) ? (c.a.list as unknown[]).filter(isRowLike) : [];
  if (c.k === 'not' && inner.length === 1 && inner[0].k === 'body.is') {
    const is = kindOf('cond', 'body.is');
    if (is) return `${wordOfValue(inner[0].a.who ?? (is.fields.who as { def?: unknown }).def, is, 'who', name)} is not ${wordOfValue(inner[0].a.is, is, 'is', name)}`;
  }
  if ((c.k === 'not' || c.k === 'any' || c.k === 'all') && depth < 3) {
    if (inner.length === 0) return c.k === 'not' ? 'not ...' : '...';
    const words = inner.map(x => condWords(x, name, depth + 1));
    if (c.k === 'not') return `not (${words.join(' and ')})`;
    return words.length === 1 ? words[0] : `(${words.join(c.k === 'any' ? ' or ' : ' and ')})`;
  }
  return sentenceWith(def, c, name);
}
function stepWords(s: Row, name: (id: number) => string | undefined): string {
  const def = kindOf('step', s.k);
  if (!def) return 'A step of a newer version';
  if (s.k === 'say') { const t = typeof s.a.text === 'string' ? tokensToNames(s.a.text.trim(), name) : ''; return t ? `Says "${clip(t, 44)}"` : 'Says nothing yet'; }
  return clip(tagWords(sentenceWith(def, s, name)), 52);
}
function wordOfValue(v: unknown, def: KindDef, key: string, name: (id: number) => string | undefined): string {
  const f = def.fields[key];
  if (f?.t === 'conds') return condsWords(v, name);
  if (f?.t === 'bodytest') return wordOfBodyTest(v as Record<string, unknown> | undefined, name);
  if (f?.t === 'refs') { const list = (v as Ref[] | undefined) ?? []; return list.length ? list.map(r => name(r.id) ?? r.n).join(', ') : '...'; }
  if (f?.t === 'walls') return wordOfWalls(v ?? f.def, f.def.length === 0 ? 'Any Wall' : 'No Walls');
  if ((v === undefined || v === null || v === '') && ((f?.t === 'ref' && f.optional) || f?.t === 'team')) return '';
  if (v === undefined || v === null || v === '') return '...';
  if (f?.t === 'enum') { const i = f.of.indexOf(v as never); return i >= 0 && f.shown ? f.shown[i] : String(v); }
  if (f?.t === 'bool') return v ? 'On' : 'Off';
  if (f?.t === 'text') return `"${String(v)}"`;
  if (f?.t === 'ref') { const r = v as Ref; return name(r.id) ?? r.n ?? '...'; }
  if (f?.t === 'target') return wordOfTarget(v as { w: string; ref?: Ref; word?: string; team?: string }, name);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'ramp' in (v as object)) { const q = (v as { ramp: { base?: number; per?: number } }).ramp; return `${q.per ?? 0} x wave${q.base ? ` + ${q.base}` : ''}`; }
  if (typeof v === 'object' && 'r' in (v as object)) { const q = (v as { r: [number, number] }).r; return `${q[0]} to ${q[1]}`; }
  if (typeof v === 'object' && 'f' in (v as object)) return String((v as { f: string }).f).replace(/\{(\d+)\}/g, (m, id: string) => name(Number(id)) ?? m);
  if (typeof v === 'object' && 'curve' in (v as object)) return 'a curve';
  return '...';
}
const TARGET_WORDS: Record<string, string> = { subject: 'It', other: 'What Hit It', killer: 'Its Killer', self: 'This One', lastSpawned: 'What This Spawned', player: 'The Player', allPlayers: 'Every Player', allTanks: 'Every Tank', leader: 'The Top Score', followers: 'Its Followers', homeMates: 'Everything Of Its Home' };
export function wordOfTarget(t: { w: string; ref?: Ref; word?: string; team?: string; colour?: unknown } | undefined, name: (id: number) => string | undefined): string {
  if (!t) return '...';
  if (t.w === 'colour') return `Everything Coloured ${colourWordShown(t.colour)}`;
  if (TARGET_WORDS[t.w]) return TARGET_WORDS[t.w];
  if (t.ref) return `${t.w === 'tag' ? 'All Of ' : t.w === 'type' ? 'All Of ' : t.w === 'inArea' ? 'Everything In ' : ''}${name(t.ref.id) ?? t.ref.n}`;
  if (t.word) return t.word;
  if (t.team) return t.team;
  return t.w;
}
export function sentenceOf(family: Family, row: Row, doc: MapEventsDoc | undefined, zones: readonly ZoneLike[]): string {
  const def = kindOf(family, row.k);
  if (!def) return 'Made in a newer version';
  const name = namesOf(doc, zones);
  if (family === 'behavior' && row.k === 'kill') {
    const does = row.a.does ?? 'instant';
    if (does === 'instant') return 'Destroys anything not on its Whitelist';
    if (does === 'pct') return `Takes ${wordOfValue(row.a.pct, def, 'pct', name)} % of its health a second from anything not on its Whitelist`;
  }
  return sentenceWith(def, row, name);
}

export interface Fact { key: string; text: string }
const FACTS_MAX = 6;
const STEP_WORDS_MAX = 2;
const SPAWN_MODE_WORD: Record<string, string> = { timer: 'On A Timer', replace: 'Replaces The Dead', maxAlive: 'Keeps Some Alive', waves: 'In Waves', signal: 'On A Signal' };
const cut = (t: string): string => (t.length > 60 ? `${t.slice(0, 58)}...` : t);
export const wordOfCards = (cards: readonly SpawnCard[], thing: (word: string) => string): string => {
  if (cards.length === 0) return 'Nothing Yet';
  if (cards.length > 1) return `${cards.length} Kinds`;
  const c = cards[0];
  return c.type?.n ?? thing(c.tank ?? c.shape ?? '');
};
export const tagWords = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
export function factsOf(family: Family, row: Row, doc: MapEventsDoc | undefined, zones: readonly ZoneLike[], thing: (word: string) => string = w => w): Fact[] {
  const def = kindOf(family, row.k);
  if (!def) return [];
  const name = namesOf(doc, zones);
  const out: Fact[] = [];
  const add = (key: string, text: string): void => { if (text) out.push({ key, text: cut(text) }); };
  const refName = (r: Ref | undefined): string => (r ? name(r.id) ?? r.n ?? '' : '');
  if (family === 'behavior' && row.k === 'spawn') {
    const a = (row.a.settings && typeof row.a.settings === 'object' ? row.a.settings : row.a) as Record<string, unknown>;
    const mode = (a.mode as string) ?? 'timer';
    const word = (v: unknown, d: unknown): string => wordOfValue(v ?? d, { ...def, fields: {} }, '', name);
    add('mode', SPAWN_MODE_WORD[mode] ?? mode);
    if (mode === 'waves') add('plan', refName(a.plan as Ref | undefined) || 'No Wave Plan');
    if (mode === 'timer') { add('every', `Every ${word(a.every, 30)} s`); add('per', `${word(a.perSpawn, 1)} Each Time`); }
    if (mode === 'replace') add('delay', `After ${word(a.delay, 5)} s`);
    if (mode === 'maxAlive') add('alive', `${word(a.maxAlive, 1)} Alive`);
    if (mode === 'signal') { add('signal', refName(a.signal as Ref | undefined) || 'No Signal'); add('per', `${word(a.perSpawn, 1)} Each Time`); }
    if (mode !== 'waves') {
      const cards = (a.cards as SpawnCard[] | undefined) ?? [];
      add('cards', wordOfCards(cards, thing));
    }
    return out;
  }
  for (const k of Object.keys(def.fields)) {
    if (out.length >= FACTS_MAX) break;
    const f = def.fields[k], v = row.a[k], label = f.label ?? k;
    if (family === 'step' && row.k === 'darkness' && darkStepHides(row.a, k)) continue;
    if (family === 'behavior' && row.k === 'kill' && ((k === 'dps' && (row.a.does === 'pct' || row.a.does === 'instant')) || (k === 'pct' && row.a.does !== 'pct') || (k === 'foodPct' && (row.a.food === undefined || row.a.food === 'none')))) continue;
    if (family === 'behavior' && row.k === 'stay' && k === 'repeatEvery' && !(Array.isArray(row.a.lines) && (row.a.lines as unknown[]).some(l => typeof l === 'string' && l))) continue;
    switch (f.t) {
      case 'num': { if (f.quiet && (v === undefined || v === f.def)) break;
        const u = f.unit ? (/^[/%]/.test(f.unit) ? f.unit : ` ${f.unit}`) : ''; add(k, `${label}: ${wordOfValue(v ?? f.def, def, k, name)}${u}`); break; }
      case 'int': add(k, `${label}: ${typeof v === 'number' ? v : f.def}`); break;
      case 'bool': { const on = v === undefined ? f.def : !!v; if (on !== f.def) add(k, on ? label : `${label}: Off`); break; }
      case 'enum': { const w = typeof v === 'string' ? v : f.def; if (w !== f.def) add(k, wordOfValue(w, def, k, name)); break; }
      case 'ref': add(k, refName(v as Ref | undefined) || (f.optional ? '' : `No ${label}`)); break;
      case 'refs': { const l = (v as Ref[] | undefined) ?? []; if (l.length) add(k, l.length === 1 ? refName(l[0]) : `${label}: ${l.length}`); break; }
      case 'target': add(k, wordOfTarget((v as never) ?? f.def, name)); break;
      case 'text': { const t = typeof v === 'string' ? v.trim() : ''; if (t && t !== f.def) add(k, `"${tokensToNames(t, name)}"`); break; }
      case 'bodytest': { const w = wordOfBodyTest(v as Record<string, unknown> | undefined, name); if (w !== 'Anything') add(k, w); break; }
      case 'tank': if (typeof v === 'string' && v) add(k, thing(v)); break;
      case 'team': if (typeof v === 'string' && v) add(k, SIDE_WORDS.find(s => s.word === v)?.shown ?? v); break;
      case 'wavetest': { const t = v as { from?: number; to?: number; every?: number; list?: number[] } | undefined; if (t) add(k, t.list?.length ? `Waves ${t.list.join(', ')}` : [t.from ? `From Wave ${t.from}` : '', t.to ? `To Wave ${t.to}` : '', t.every ? `Every ${t.every}` : ''].filter(Boolean).join(', ')); break; }
      case 'rows': { const o = v as Row | undefined; if (o) add(k, kindOf('order', o.k)?.label ?? ''); break; }
      case 'place': { const p = v as { w?: string; areas?: Ref[] | 'plan' } | undefined; if (p?.w === 'in') add(k, Array.isArray(p.areas) && p.areas.length ? p.areas.map(refName).filter(Boolean).join(', ') : 'No Place'); else if (p?.w === 'point') add(k, 'At A Point'); else if (p?.w === 'homeOf') add(k, 'Its Home Area'); break; }
      case 'cards': add(k, wordOfCards((v as SpawnCard[] | undefined) ?? [], thing)); break;
      case 'conds': { const l = Array.isArray(v) ? v.filter(isRowLike) : []; if (l.length) add(k, `${label}: ${tagWords(condsWords(l, name))}`); break; }
      case 'steps': {
        const l = Array.isArray(v) ? v.filter(isRowLike) : [];
        const room = FACTS_MAX - out.length;
        if (l.length === 0 || room <= 0) break;
        const shown = l.length <= Math.min(STEP_WORDS_MAX, room) ? l.length : Math.min(STEP_WORDS_MAX, room - 1);
        if (shown < 1) { add(k, `${label}: ${l.length} Steps`); break; }
        for (let n = 0; n < shown; n++) add(`${k}${n}`, n === 0 ? `${label}: ${stepWords(l[n], name)}` : stepWords(l[n], name));
        if (l.length > shown) add(`${k}More`, l.length - shown === 1 ? '1 More Step' : `${l.length - shown} More Steps`);
        break;
      }
      case 'words': case 'teams': case 'nums': case 'ints': { const n = Array.isArray(v) ? v.length : 0; if (n) add(k, `${label}: ${n}`); break; }
      case 'json': {
        const l = Array.isArray(v) ? v as unknown[] : [];
        if (l.length === 0) break;
        const ats = l.map(x => (x && typeof x === 'object' ? (x as { at?: unknown }).at : undefined));
        if (ats.every(t => typeof t === 'number')) { add(k, `${label}: ${ats.join(', ')} s`); break; }
        if (l.length === 1 && typeof l[0] === 'string' && l[0]) { add(k, `${label}: "${clip(l[0], 44)}"`); break; }
        add(k, `${label}: ${l.length}`);
        break;
      }
      case 'walls': add(k, wordOfWalls(v ?? f.def, f.def.length === 0 ? 'Any Wall' : 'No Walls')); break;
    }
  }
  return out;
}

let _usedKey: { doc: MapEventsDoc | undefined; zones: readonly ZoneLike[]; of: Map<unknown, number> } | null = null;
export function usedBy(doc: MapEventsDoc | undefined, zones: readonly ZoneLike[], id: Id): number {
  if (!_usedKey || _usedKey.doc !== doc || _usedKey.zones !== zones) {
    const of = new Map<unknown, number>();
    const walk = (v: unknown, depth: number): void => {
      if (depth > 64 || v === null || typeof v !== 'object') return;
      if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
      const o = v as Record<string, unknown>;
      if (o.id !== undefined && typeof o.n === 'string') of.set(o.id, (of.get(o.id) ?? 0) + 1);
      for (const k of Object.keys(o)) { const c = o[k]; if (c && typeof c === 'object') walk(c, depth + 1); }
    };
    walk(doc, 0);
    for (const z of zones) walk(z.behaviors, 0);
    _usedKey = { doc, zones, of };
  }
  return _usedKey.of.get(id) ?? 0;
}

export function usedByNames(doc: MapEventsDoc | undefined, zones: readonly ZoneLike[], id: Id): string[] {
  const holds = (v: unknown, depth: number): boolean => {
    if (depth > 64 || v === null || typeof v !== 'object') return false;
    if (Array.isArray(v)) return v.some(x => holds(x, depth + 1));
    const o = v as Record<string, unknown>;
    if (o.id === id && typeof o.n === 'string') return true;
    return Object.keys(o).some(k => holds(o[k], depth + 1));
  };
  const out: string[] = [];
  for (const list of [doc?.rules, doc?.types, doc?.plans, doc?.placed] as ({ name: string }[] | undefined)[]) for (const t of list ?? []) if (holds(t, 0)) out.push(t.name);
  for (const z of zones) if (holds(z.behaviors, 0)) out.push(z.name ?? 'Custom Area');
  return out;
}

export function overviewLines(doc: MapEventsDoc | undefined): string[] {
  const out: string[] = [];
  if (!doc) return out;
  for (const p of doc.plans ?? []) {
    const end = p.last === null || p.last === undefined ? 'endless' : `to wave ${p.last}`;
    const next = p.advance?.on === 'cleared' ? 'a new wave when all that holds the next wave is gone' : p.advance?.on === 'timer' ? 'a new wave by the clock' : 'a new wave by its own rule';
    out.push(`Waves: ${p.name}, ${end}, ${next}. ${p.groups.length} lines, ${(p.specials ?? []).length} special waves.`);
  }
  const stands = (doc.placed ?? []).length;
  if (stands) out.push(`Map Entities: ${stands} on the map, of ${(doc.types ?? []).length} Entity Types.`);
  if ((doc.rules ?? []).length) out.push(`Map Events: ${doc.rules!.length}.`);
  const m = doc.match;
  if (m) {
    const off: string[] = [];
    if (m.ambientBosses === false) off.push('bosses');
    if (m.ambientSentries === false) off.push('sentries');
    if (m.ambientSentinels === false) off.push('sentinels');
    if (m.ambientCrashers === false) off.push('crashers');
    if (m.food === false) off.push('food');
    if (off.length) out.push(`This match has none of its own ${off.join(', ')}.`);
    if (m.maxTanksAlive !== undefined) out.push(`Max Tanks Alive: ${m.maxTanksAlive}.`);
    if (m.killsTurnSides) out.push('A kill turns the victim to the killer\'s side.');
    if (m.clans) out.push(`Clans: ${m.clans.min} to ${m.clans.max}.`);
    if (m.shrink) out.push(`The arena closes in after ${m.shrink.after} s, over ${m.shrink.minutes} min, to ${m.shrink.to} %.`);
    if (m.forge) out.push('Every tank is a Dreadnought.');
    else if (m.dreadnoughts !== undefined) out.push(`Dreadnoughts among the bots: ${m.dreadnoughts} %.`);
    if (m.travellers) out.push(`Tanks at first: ${m.travellers.min} to ${m.travellers.max}.`);
    if (m.peaceful) out.push('Peaceful: nobody can hurt anyone.');
    if (m.dreadTiers) out.push(`Dreadnoughts arrive on tiers ${m.dreadTiers.min} to ${m.dreadTiers.max}.`);
    if (m.dreadsAlwaysUpgrade !== undefined) out.push(m.dreadsAlwaysUpgrade ? 'Dreadnought bots take every tier at once.' : 'Dreadnought bots upgrade as other bots.');
    if (m.sameTeamOnReturn === false) out.push('A player who comes back is on a new team.');
    if (m.startAged) out.push(`It starts as if ${m.startAged} minutes had passed.`);
  }
  return out;
}
