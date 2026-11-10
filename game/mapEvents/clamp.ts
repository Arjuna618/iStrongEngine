import type { MapEventsDoc, Row, ZoneLike } from './doc';
import { EVENTS_DOC_VERSION, repairNextId } from './doc';
import { kindOf } from './registry';
import { cleanAreaShape, shapeCellBox } from '../areaShape';
import { cleanShapeSpec, cleanTouchRows } from './thingBody';
import type { Family, Field } from './registry';

const LIST_MAX = 4096;
const ROWS_MAX = 2048;
const TEXT_MAX = 4096;
const DEPTH_MAX = 24;
const ID_MAX = 0x3fffffff;

function isObj(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function finiteInt(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null; }

function cleanNum(v: unknown, fd?: { min?: number; max?: number }): unknown {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return undefined;
    let n = v;
    if (fd?.min !== undefined && n < fd.min) n = fd.min;
    if (fd?.max !== undefined && n > fd.max) n = fd.max;
    return n;
  }
  if (!isObj(v)) return undefined;
  if (Array.isArray(v.r)) return v.r.length === 2 && v.r.every(x => typeof x === 'number' && Number.isFinite(x)) ? v : undefined;
  if (isObj(v.ramp)) return v;
  if (Array.isArray(v.curve)) {
    const pts = (v.curve as unknown[]).filter(p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    return pts.length > 0 ? { curve: pts.slice(0, 64) } : undefined;
  }
  if (typeof v.f === 'string') return v.f.length <= 400 ? v : undefined;
  return undefined;
}

function cleanField(fd: Field, v: unknown, depth: number, walkRows: (rows: unknown, family: Family, depth: number) => Row[]): unknown {
  switch (fd.t) {
    case 'num': return cleanNum(v, fd);
    case 'int': { const n = finiteInt(v); return n === null ? undefined : Math.max(fd.min, Math.min(fd.max, n)); }
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'enum': return typeof v === 'string' ? v : undefined;
    case 'text': return typeof v === 'string' ? v.slice(0, Math.max(fd.max, TEXT_MAX)) : undefined;
    case 'tank': case 'team': return typeof v === 'string' && v.length < 200 ? v : undefined;
    case 'teams': case 'words': return Array.isArray(v) ? v.filter(w => typeof w === 'string' && w.length > 0 && w.length < 200).slice(0, 64) : undefined;
    case 'walls': return Array.isArray(v) ? v.filter((t, i, l) => typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < 19 && l.indexOf(t) === i) : undefined;
    case 'steps': return Array.isArray(v) ? walkRows(v, 'step', depth + 1) : undefined;
    case 'conds': return Array.isArray(v) ? walkRows(v, 'cond', depth + 1) : undefined;
    default: return v;
  }
}

function cleanRow(r: unknown, family: Family, depth: number): Row | null {
  if (!isObj(r) || typeof r.k !== 'string' || r.k.length === 0 || r.k.length > 80) return null;
  const id = finiteInt(r.id);
  const out = { ...r, id: id === null || id < 0 || id > ID_MAX ? 0 : id, a: isObj(r.a) ? r.a : {} } as Row;
  if (depth > DEPTH_MAX) { out.a = {}; return out; }
  const def = kindOf(family, r.k);
  if (!def) return out;
  const a: Record<string, unknown> = { ...out.a };
  for (const name of Object.keys(def.fields)) {
    if (!(name in a)) continue;
    const v = cleanField(def.fields[name], a[name], depth, cleanRows);
    if (v === undefined) delete a[name]; else a[name] = v;
  }
  if (r.k === 'all' || r.k === 'any' || r.k === 'not') a.list = cleanRows(a.list, 'cond', depth + 1);
  if (r.k === 'pick' && Array.isArray(a.options)) a.options = (a.options as unknown[]).filter(isObj).slice(0, 256).map(o => ({ ...o, do: cleanRows(o.do, 'step', depth + 1) }));
  if (typeof r.off !== 'boolean') delete (out as unknown as Record<string, unknown>).off;
  out.a = a;
  return out;
}
function cleanRows(rows: unknown, family: Family, depth: number): Row[] {
  if (!Array.isArray(rows)) return [];
  const out: Row[] = [];
  for (const r of rows) { if (out.length >= ROWS_MAX) break; const c = cleanRow(r, family, depth); if (c) out.push(c); }
  return out;
}

function namedList(v: unknown, each?: (t: Record<string, unknown>) => void): Record<string, unknown>[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Record<string, unknown>[] = [];
  for (const t of v) {
    if (!isObj(t)) continue;
    const id = finiteInt(t.id);
    if (id === null || id < 0 || id > ID_MAX) continue;
    if (typeof t.name !== 'string') t.name = '';
    else if ((t.name as string).length > 200) t.name = (t.name as string).slice(0, 200);
    if (each) each(t);
    out.push(t);
    if (out.length >= LIST_MAX) break;
  }
  return out;
}

function cleanTankGroup(t: Record<string, unknown>): void {
  const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
  t.tanks = Array.isArray(t.tanks) ? (t.tanks as unknown[]).filter((w): w is string => typeof w === 'string' && w.length > 0 && w.length <= 200).slice(0, 512) : [];
  if (isObj(t.debuff)) {
    const r = num(t.debuff.resist, 1, 100), h = num(t.debuff.health, 1, 100);
    t.debuff = { ...(r !== undefined ? { resist: r } : {}), ...(h !== undefined ? { health: h } : {}) };
  } else delete t.debuff;
  const st = num(t.stop, 0, 100); if (st === undefined) delete t.stop; else t.stop = st;
  if (isObj(t.portals)) {
    const w = num(t.portals.rethinkS, 0, 600), m = num(t.portals.restMin, 0.5, 60), r = typeof t.portals.rest === 'boolean' ? t.portals.rest : undefined;
    t.portals = { ...(w !== undefined ? { rethinkS: w } : {}), ...(r !== undefined ? { rest: r } : {}), ...(m !== undefined ? { restMin: m } : {}) };
  } else delete t.portals;
}

export function clampEventsDoc(raw: unknown, zones?: readonly ZoneLike[]): MapEventsDoc | null {
  if (!isObj(raw)) return null;
  const d = raw as unknown as MapEventsDoc;
  const v = (raw as { v?: unknown }).v;
  if (typeof v === 'number' && v > EVENTS_DOC_VERSION) return d;
  (raw as Record<string, unknown>).v = EVENTS_DOC_VERSION;
  const set = (k: string, list: unknown) => { if (list === undefined) delete (raw as Record<string, unknown>)[k]; else (raw as Record<string, unknown>)[k] = list; };
  set('tags', namedList(raw.tags));
  set('signals', namedList(raw.signals));
  set('folders', namedList(raw.folders));
  set('vars', namedList(raw.vars));
  set('timers', namedList(raw.timers, t => { const n = cleanNum(t.seconds); t.seconds = n === undefined ? 0 : n; if (t.marks !== undefined) t.marks = Array.isArray(t.marks) ? t.marks.filter(m => typeof m === 'number' && Number.isFinite(m) && m >= 0).slice(0, 256) : []; }));
  set('statuses', namedList(raw.statuses, t => { t.effects = cleanRows(t.effects, 'effect', 1); }));
  set('areaGroups', namedList(raw.areaGroups, t => { t.members = Array.isArray(t.members) ? t.members.filter(isObj).slice(0, 256) : []; }));
  set('tankGroups', namedList(raw.tankGroups, cleanTankGroup));
  set('types', namedList(raw.types, t => { t.forms = namedList(t.forms) ?? []; if (t.order !== undefined && !cleanRow(t.order, 'order', 1)) delete t.order; if (!isObj(t.side)) t.side = { team: 'againstPlayer' };
    if (t.shape !== undefined) { const sp = cleanShapeSpec(t.shape); if (sp) t.shape = sp; else delete t.shape; }
    if (t.touch !== undefined) { const tr = cleanTouchRows(t.touch); if (tr) t.touch = tr; else delete t.touch; }
    if (t.guard !== undefined) { if (!isObj(t.guard)) delete t.guard; else { const gd = t.guard as Record<string, unknown>, o: Record<string, unknown> = {}; if (typeof gd.push === 'boolean') o.push = gd.push; if (typeof gd.strength === 'number' && Number.isFinite(gd.strength)) o.strength = Math.max(0, Math.min(300, gd.strength)); if (typeof gd.range === 'number' && Number.isFinite(gd.range)) o.range = Math.max(100, Math.min(3000, gd.range)); t.guard = o; } } }));
  set('tanks', namedList(raw.tanks, t => { if (!isObj(t.data)) t.data = {}; }));
  set('placed', namedList(raw.placed, t => {
    if (typeof t.cx !== 'number' || !Number.isFinite(t.cx)) t.cx = 0; if (typeof t.cy !== 'number' || !Number.isFinite(t.cy)) t.cy = 0;
    if (t.guardOf !== undefined && !(Number.isInteger(t.guardOf) && (t.guardOf as number) >= 0)) delete t.guardOf;
    if (t.spots !== undefined) {
      const seen = new Set<number>();
      const list = Array.isArray(t.spots) ? (t.spots as unknown[]).filter((s): s is { form: number; cx: number; cy: number } => isObj(s) && Number.isInteger(s.form) && typeof s.cx === 'number' && Number.isFinite(s.cx) && typeof s.cy === 'number' && Number.isFinite(s.cy)).filter(s => !seen.has(s.form) && !!seen.add(s.form)).map(s => ({ form: s.form, cx: s.cx, cy: s.cy })) : [];
      if (list.length > 0) t.spots = list; else delete t.spots;
    }
  }));
  set('rules', namedList(raw.rules, t => { t.when = cleanRows(t.when, 'trigger', 1); t.cond = cleanRows(t.cond, 'cond', 1); t.then = cleanRows(t.then, 'step', 1); }));
  set('sequences', namedList(raw.sequences, t => { if (t.whileHeld !== 'botsStop' && t.whileHeld !== 'nothing') delete t.whileHeld; t.tracks = Array.isArray(t.tracks) ? t.tracks.filter(isObj).slice(0, 64).map(tr => ({ ...tr, clips: Array.isArray(tr.clips) ? tr.clips.filter(isObj).slice(0, 1024).map(c => ({ ...c, step: cleanRow(c.step, 'step', 1) ?? { id: 0, k: 'run.stop', a: {} } })) : [] })) : []; }));
  set('plans', namedList(raw.plans, t => {
    if (!Array.isArray(t.groups)) t.groups = [];
    if (!isObj(t.advance)) t.advance = { on: 'cleared', break: 0 };
    if (!isObj(t.start)) t.start = { on: 'match', delay: 0 };
    if (!isObj(t.place)) t.place = { how: 'random', onFull: 'wait' };
    if (!isObj(t.side)) t.side = { team: 'againstPlayer' };
    if (t.stream === undefined) t.stream = 0;
    const cleanGroups = (gs: unknown) => (namedList(gs, g => { if (!Array.isArray(g.cards)) g.cards = []; g.cards = (g.cards as unknown[]).filter(isObj).slice(0, 256); if (g.at !== 'plan' && !Array.isArray(g.at)) g.at = 'plan'; if (cleanNum(g.count) === undefined) g.count = 0; }) ?? []);
    t.groups = cleanGroups(t.groups);
    if (t.specials !== undefined) t.specials = namedList(t.specials, s => { s.groups = cleanGroups(s.groups); if (typeof s.weight !== 'number' || !Number.isFinite(s.weight)) s.weight = 0; }) ?? [];
    if (t.overrides !== undefined) t.overrides = Array.isArray(t.overrides) ? (t.overrides as unknown[]).filter(isObj).slice(0, 1024).map(o => ({ ...o, groups: cleanGroups(o.groups) })) : [];
    if (t.cells !== undefined) t.cells = Array.isArray(t.cells) ? (t.cells as unknown[]).filter(c => isObj(c) && Number.isFinite(c.w) && Number.isFinite(c.g) && Number.isFinite(c.n)).slice(0, 65536) : [];
  }));
  if (raw.match !== undefined && !isObj(raw.match)) delete raw.match;
  if (raw.meta !== undefined && !isObj(raw.meta)) delete raw.meta;
  repairNextId(d, zones);
  return d;
}

export function keepZoneWords(r: Record<string, unknown>, z: Record<string, unknown>): void {
  const uid = finiteInt(r.uid);
  if (uid !== null && uid >= 0 && uid <= ID_MAX) z.uid = uid;
  if (typeof r.name === 'string') z.name = r.name.slice(0, 64);
  if (typeof r.note === 'string') z.note = r.note.slice(0, TEXT_MAX);
  if (typeof r.showName === 'boolean') z.showName = r.showName;
  if (typeof r.clearWalls === 'boolean') z.clearWalls = r.clearWalls;
  if (r.modeBase === true) z.modeBase = true;
  if (typeof r.modeName === 'string') z.modeName = r.modeName.slice(0, 64);
  if (Array.isArray(r.more)) {
    const more: { gx: number; gy: number; cw: number; ch: number }[] = [];
    for (const m of r.more) {
      if (!isObj(m)) continue;
      const gx = finiteInt(m.gx), gy = finiteInt(m.gy), cw = finiteInt(m.cw), ch = finiteInt(m.ch);
      if (gx === null || gy === null || cw === null || ch === null || gx < 0 || gy < 0 || cw < 1 || ch < 1) continue;
      more.push({ gx, gy, cw, ch });
      if (more.length >= 31) break;
    }
    if (more.length > 0) z.more = more;
  }
  if (Array.isArray(r.behaviors)) z.behaviors = cleanRows(r.behaviors, 'behavior', 1);
  if (isObj(r.fill) && (r.fill.k === 'maze' || r.fill.k === 'rocks')) {
    const f = r.fill as Record<string, unknown>, out: Record<string, unknown> = { k: f.k };
    const n = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
    if (f.k === 'maze') { const m = finiteInt(f.maze); if (m !== null) out.maze = m; const e = n(f.erosion, 0, 2); if (e !== undefined) out.erosion = e; }
    else {
      if (typeof f.rocks === 'string' && f.rocks.length < 64) out.rocks = f.rocks;
      const c = n(f.count, 0, 1000); if (c !== undefined) out.count = Math.round(c);
      const v = n(f.variation, 0, 100); if (v !== undefined) out.variation = v;
      if (Array.isArray(f.kinds)) { const k = f.kinds.filter((x: unknown) => x === 'rock' || x === 'stone' || x === 'gravel'); if (k.length) out.kinds = [...new Set(k)]; }
    }
    const sd = finiteInt(f.seed); if (sd !== null && sd >= 0) out.seed = sd;
    z.fill = out;
  }
  if (r.shape !== undefined) {
    const sh = cleanAreaShape(r.shape);
    if (sh !== null) {
      const b = shapeCellBox(sh);
      z.shape = sh; z.gx = Math.max(0, b.gx); z.gy = Math.max(0, b.gy); z.cw = Math.max(1, b.cw + Math.min(0, b.gx)); z.ch = Math.max(1, b.ch + Math.min(0, b.gy));
      delete z.more;
    }
  }
}
