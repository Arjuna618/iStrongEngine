import type { SpawnCard, SpawnGroup, SpecialWave, WavePlan, WaveTest } from './doc';
import { Sfc32, seedStream, hash32, evalNum, NumStore, emitNum, runNum } from './num';
import { SMALL_FIX } from '../smallFixSwitch';

export const PURPOSE_SPECIAL = 1, PURPOSE_COUNT = 2, PURPOSE_CARD = 3, PURPOSE_PLACE = 4, PURPOSE_CHANCE = 5, PURPOSE_BUDGET = 6, PURPOSE_WEIGHT = 7;

export function waveTestHolds(t: WaveTest | undefined | null, n: number): boolean {
  if (!t) return true;
  if (Array.isArray(t.list) && t.list.length > 0) return t.list.includes(n);
  if (typeof t.from === 'number' && n < t.from) return false;
  if (typeof t.to === 'number' && n > t.to) return false;
  if (typeof t.every === 'number' && t.every > 0) {
    const start = typeof t.from === 'number' ? t.from : 1;
    if ((n - start) % t.every !== 0) return false;
  }
  return true;
}

export function cardAllowedAt(c: SpawnCard, n: number): boolean {
  if (typeof c.fromWave === 'number' && n < c.fromWave) return false;
  if (typeof c.toWave === 'number' && n > c.toWave) return false;
  return true;
}

export interface RollCtx { forceSpecial?: number; players?: number; humans?: number; bots?: number; tier?: number; readRef?: (id: number) => number; }

export interface RollStream {
  group: SpawnGroup;
  k: number;
  seconds: number;
  startAt: number;
  holds: boolean;
  typed: boolean;
  budgetCards?: SpawnCard[];
}

export interface WaveRoll {
  wave: number;
  special: SpecialWave | null;
  streams: RollStream[];
  hasHolder: boolean;
  total: number;
  problems: string[];
}

const _rng = new Sfc32();

function readerOf(ctx?: RollCtx): (id: number) => number { return ctx?.readRef ?? (() => NaN); }

function num(n: unknown, wave: number, rng: Sfc32, ctx?: RollCtx): number {
  return evalNumCtx(n, wave, rng, ctx);
}
function evalNumCtx(n: unknown, wave: number, rng: Sfc32, ctx?: RollCtx): number {
  if (typeof n === 'number') return n;
  if (SMALL_FIX.GH438 && ctx !== undefined && (ctx.players !== undefined || ctx.humans !== undefined || ctx.bots !== undefined || ctx.tier !== undefined)) {
    const s = new NumStore();
    const at = emitNum(s, n);
    return runNum(s.code, at, { wave, seconds: 0, players: ctx.players ?? 1, humans: ctx.humans ?? 1, bots: ctx.bots ?? 0, tier: ctx.tier ?? 1, rng, readRef: readerOf(ctx) });
  }
  return evalNum(n, wave, rng, 0, readerOf(ctx));
}

function roundCount(x: number, how: SpawnGroup['round'], rng: Sfc32): number {
  if (!(x > 0)) return 0;
  if (how === 'floor') return Math.floor(x);
  if (how === 'nearest') return Math.round(x);
  const f = Math.floor(x);
  return f + (rng.next() < x - f ? 1 : 0);
}

function pickGroups(plan: WavePlan, n: number, seed: number, ctx: RollCtx | undefined, problems: string[]): { special: SpecialWave | null; groups: SpawnGroup[]; breakScaleSpecial: boolean } {
  const add: SpawnGroup[] = [];
  let replace: SpawnGroup[] | null = null;
  if (Array.isArray(plan.overrides)) {
    for (const o of plan.overrides) {
      if (!o || !waveTestHolds(o.test, n)) continue;
      if (o.mode === 'replace') { if (!replace) replace = o.groups ?? []; } else add.push(...(o.groups ?? []));
    }
  }
  if (replace) return { special: null, groups: replace.concat(add), breakScaleSpecial: false };
  let special: SpecialWave | null = null;
  if (plan.specialChance !== undefined && Array.isArray(plan.specials) && plan.specials.length > 0) {
    seedStream(_rng, seed, plan.id, n, PURPOSE_SPECIAL);
    const forced = ctx?.forceSpecial;
    if (forced !== undefined && forced >= 0) {
      special = plan.specials.find(s => s.id === forced) ?? null;
      if (special) { const base = special.groups ?? []; return { special, groups: base.concat(add), breakScaleSpecial: true }; }
    }
    const chance = num(plan.specialChance, n, _rng, ctx);
    if (!Number.isFinite(chance)) problems.push('The chance of a special wave has no answer at wave ' + n + '.');
    else if (_rng.next() * 100 < chance) {
      let total = 0;
      for (const s of plan.specials) if (!s.off && s.weight > 0 && waveTestHolds(s.test, n)) total += s.weight;
      if (total > 0) {
        let u = _rng.next() * total;
        for (const s of plan.specials) {
          if (s.off || !(s.weight > 0) || !waveTestHolds(s.test, n)) continue;
          u -= s.weight;
          if (u < 0) { special = s; break; }
        }
      }
    }
  }
  const base = special ? (special.groups ?? []) : (plan.groups ?? []);
  return { special, groups: base.concat(add), breakScaleSpecial: !!special };
}

function spendBudget(plan: WavePlan, groups: SpawnGroup[], n: number, seed: number, ctx: RollCtx | undefined): Map<number, SpawnCard[]> {
  const out = new Map<number, SpawnCard[]>();
  seedStream(_rng, seed, plan.id, n, PURPOSE_BUDGET);
  let points = num(plan.compose?.budget ?? 0, n, _rng, ctx);
  if (!Number.isFinite(points)) return out;
  const lineIn = (g: SpawnGroup): boolean => !SMALL_FIX.GH368 || (!!g && !g.off && waveTestHolds(g.test, n));
  const once: SpawnCard[] | null = SMALL_FIX.GH367 ? [] : null;
  const free = (c: SpawnCard): boolean => !(once !== null && c.uniqueAlive && once.includes(c));
  for (let guard = 0; guard < 4096 && points > 0; guard++) {
    let total = 0;
    for (const g of groups) if (lineIn(g)) for (const c of g.cards) if (cardAllowedAt(c, n) && (c.cost ?? 1) <= points && c.weight > 0 && free(c)) total += c.weight;
    if (total <= 0) break;
    let u = _rng.next() * total, hit: SpawnCard | null = null, hitG: SpawnGroup | null = null;
    outer: for (const g of groups) {
      if (!lineIn(g)) continue;
      for (const c of g.cards) {
        if (!cardAllowedAt(c, n) || (c.cost ?? 1) > points || !(c.weight > 0) || !free(c)) continue;
        u -= c.weight;
        if (u < 0) { hit = c; hitG = g; break outer; }
      }
    }
    if (!hit || !hitG) break;
    if (once !== null && hit.uniqueAlive) once.push(hit);
    points -= Math.max(hit.cost ?? 1, 0.0001);
    const list = out.get(hitG.id);
    if (list) list.push(hit); else out.set(hitG.id, [hit]);
  }
  return out;
}

export function rollWave(plan: WavePlan, n: number, seed: number, ctx?: RollCtx): WaveRoll {
  const problems: string[] = [];
  const { special, groups } = pickGroups(plan, n, seed, ctx, problems);
  const out: WaveRoll = { wave: n, special, streams: [], hasHolder: false, total: 0, problems };
  const budget = plan.compose?.mode === 'budget' ? spendBudget(plan, groups, n, seed, ctx) : null;
  seedStream(_rng, seed, plan.id, n, PURPOSE_COUNT);
  const planSeconds = num(plan.stream ?? 0, n, _rng, ctx);
  for (const g of groups) {
    if (!g || g.off || !waveTestHolds(g.test, n)) continue;
    const r = _groupRng.seed(hash32(seed, plan.id, n, g.id, PURPOSE_COUNT), hash32(seed, plan.id, n, g.id, 11), hash32(seed, plan.id, n, g.id, 12), hash32(seed, plan.id, n, g.id, 13));
    let k: number;
    let typed = false;
    const cell = Array.isArray(plan.cells) ? plan.cells.find(c => c && c.w === n && c.g === g.id) : undefined;
    let budgetCards: SpawnCard[] | undefined;
    if (cell) {
      k = Math.max(0, Math.floor(cell.n));
      typed = true;
    } else if (budget) {
      budgetCards = budget.get(g.id);
      k = budgetCards ? budgetCards.length : 0;
    } else {
      if (g.chance !== undefined) {
        const ch = num(g.chance, n, r, ctx);
        if (!Number.isFinite(ch)) { problems.push(`"${g.name}": its chance has no answer at wave ${n}.`); continue; }
        if (r.next() * 100 >= ch) continue;
      }
      const raw = num(g.count, n, r, ctx);
      if (!Number.isFinite(raw)) { problems.push(`"${g.name}": its count has no answer at wave ${n}.`); continue; }
      const f = typeof g.spread === 'number' && g.spread > 0 ? 1 + g.spread * (2 * r.next() - 1) : 1;
      k = roundCount(raw * f, g.round, r);
    }
    if (!(k > 0)) continue;
    let seconds = g.pace?.how === 'burst' ? 0 : (g.pace?.seconds !== undefined ? num(g.pace.seconds, n, r, ctx) : planSeconds);
    if (!Number.isFinite(seconds) || seconds < 0) { problems.push(`"${g.name}": its stream length has no answer at wave ${n}.`); seconds = 0; }
    let startAt = g.pace?.startAt !== undefined ? num(g.pace.startAt, n, r, ctx) : 0;
    if (!Number.isFinite(startAt) || startAt < 0) startAt = 0;
    const holds = g.blocks !== false;
    out.streams.push({ group: g, k, seconds, startAt, holds, typed, budgetCards });
    if (holds) out.hasHolder = true;
    out.total += k;
  }
  return out;
}
const _groupRng = new Sfc32();

export function pickCard(cards: readonly SpawnCard[], n: number, rng: Sfc32, taken: ((c: SpawnCard) => boolean) | null): number {
  let total = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (!(c.weight > 0) || !cardAllowedAt(c, n)) continue;
    if (taken && c.uniqueAlive && taken(c)) continue;
    total += c.weight;
  }
  if (!(total > 0)) return -1;
  let u = rng.next() * total;
  let last = -1;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (!(c.weight > 0) || !cardAllowedAt(c, n)) continue;
    if (taken && c.uniqueAlive && taken(c)) continue;
    last = i;
    u -= c.weight;
    if (u < 0) return i;
  }
  return last;
}

export function breakSeconds(plan: WavePlan, comingWave: number, wasEmpty: boolean, ctx?: RollCtx): number {
  seedStream(_rng, 0x5eed, plan.id, comingWave, 9);
  let d = num(plan.advance?.break ?? 0, comingWave, _rng, ctx);
  if (!Number.isFinite(d) || d < 0) return NaN;
  if (wasEmpty && typeof plan.advance.emptyBreakMult === 'number' && (SMALL_FIX.GH485 ? plan.advance.emptyBreakMult >= 0 : plan.advance.emptyBreakMult > 0)) d *= plan.advance.emptyBreakMult;
  return d;
}

export function previewMeans(plan: WavePlan, n: number, rolls: number, seed: number, ctx?: RollCtx): { name: string; mean: number; holds: boolean }[] {
  const sums = new Map<string, { sum: number; holds: boolean }>();
  for (let i = 0; i < rolls; i++) {
    const r = rollWave(plan, n, hash32(seed, i), ctx);
    for (const s of r.streams) {
      const e = sums.get(s.group.name);
      if (e) e.sum += s.k; else sums.set(s.group.name, { sum: s.k, holds: s.holds });
    }
  }
  const out: { name: string; mean: number; holds: boolean }[] = [];
  sums.forEach((v, name) => out.push({ name, mean: v.sum / rolls, holds: v.holds }));
  return out;
}
