import { SMALL_FIX } from './smallFixSwitch';

export type GrowthStat =
  | 'size' | 'maxHealth' | 'shieldCapacity' | 'shieldRegen' | 'bodyDamage' | 'bulletDamage' | 'bulletHealth'
  | 'bulletPenetration' | 'bulletSpeed' | 'reload' | 'movementSpeed' | 'view';

export type GrowthCurveKind = 'line' | 'log' | 'points' | 'score';

export interface GrowthStatRule {
  id: string;
  stat: GrowthStat;
  on: boolean;
  start: number;
  stop: number;
  kind: GrowthCurveKind;
  rate: number;
  scale: number;
  points: [number, number][];
  atStart: number;
  scoreRate: number;
}

export interface GrowthPointRun {
  id: string;
  start: number;
  every: number;
  stop: number;
}

export interface GrowthSkillPointsRule {
  on: boolean;
  everyLevels: number;
  stopLevel: number;
  runs?: GrowthPointRun[];
}

export interface GrowthRespawnRule {
  on: boolean;
  keepPercent: number;
  minScore: number;
  maxScore: number;
}

export interface GrowthRules {
  stats: GrowthStatRule[];
  skillPoints: GrowthSkillPointsRule;
  respawn: GrowthRespawnRule;
}

const _g: { process?: { env?: Record<string, string | undefined> } } = globalThis as never;
const OLD_G12 = _g.process?.env?.ISTRONG_OLD_GROWTH_1103 === '1';

export const ACTIVE_GROWTH: { rules: GrowthRules | undefined } = { rules: undefined };

export const MF_WAVE = 33554432;
export const MF_NO_GROW = 67108864;
export function growthRulesOf(e: { _mevF: number }): GrowthRules | undefined {
  return (e._mevF & MF_NO_GROW) === 0 ? ACTIVE_GROWTH.rules : undefined;
}

export const GROWTH_START_SCORE = 26263;

export const GROWTH_STATS: readonly { stat: GrowthStat; label: string; wired?: false }[] = [
  { stat: 'size', label: 'Size' },
  { stat: 'maxHealth', label: 'Max Health' },
  { stat: 'shieldCapacity', label: 'Shield Capacity' },
  { stat: 'shieldRegen', label: 'Shield Regeneration' },
  { stat: 'bodyDamage', label: 'Body Damage' },
  { stat: 'bulletDamage', label: 'Bullet Damage' },
  { stat: 'bulletHealth', label: 'Bullet Health' },
  { stat: 'bulletPenetration', label: 'Bullet Penetration' },
  { stat: 'bulletSpeed', label: 'Bullet Speed' },
  { stat: 'reload', label: 'Reload' },
  { stat: 'movementSpeed', label: 'Movement Speed' },
  { stat: 'view', label: 'View' },
];

export const GROWTH_STAT_INDEX: Readonly<Record<GrowthStat, number>> = GROWTH_STATS.reduce((m, s, i) => { m[s.stat] = i; return m; }, {} as Record<GrowthStat, number>);
export const GROWTH_STAT_COUNT = GROWTH_STATS.length;

export const GROWTH_LIMITS = {
  LEVEL_MAX: 1000, RATE_MIN: -50, RATE_MAX: 100, SCALE_MIN: 1, SCALE_MAX: 1000, BONUS_MIN: -95, BONUS_MAX: 10000,
  POINTS_MAX: 24, EVERY_MIN: 1, EVERY_MAX: 100, SCORE_MAX: 1e12, SCORE_RATE_MIN: -100, SCORE_RATE_MAX: 1000, RUNS_MAX: 12,
  FACTOR_MIN: 0.05,
};
export const GROWTH_FACTOR_MAX = 1 + (GROWTH_LIMITS.BONUS_MAX + GROWTH_LIMITS.RATE_MAX * GROWTH_LIMITS.LEVEL_MAX
  + GROWTH_LIMITS.SCORE_RATE_MAX * (growthLevelXp(GROWTH_LIMITS.LEVEL_MAX) - growthLevelXp(0)) / 1e6) / 100;
function oneStatBound(k: number): number {
  if (!SMALL_FIX.GH483) return k;
  return k < GROWTH_LIMITS.FACTOR_MIN ? GROWTH_LIMITS.FACTOR_MIN : k > GROWTH_FACTOR_MAX ? GROWTH_FACTOR_MAX : k;
}

export function growthLevelXp(level: number): number {
  const a = level + 44;
  return 0.3083 * (a * a * a - 85184);
}

export function growthBonus(r: GrowthStatRule, level: number): number {
  if (!r.on) return 0;
  const top = level < r.stop ? level : r.stop;
  const n = top - r.start;
  if (r.kind === 'score') return n >= 0 ? r.atStart + r.rate * n + r.scoreRate * (growthLevelXp(top) - growthLevelXp(r.start)) / 1e6 : 0;
  if (!(n > 0)) return 0;
  if (r.kind === 'line') return r.rate * n;
  if (r.kind === 'log') { const s = r.scale > 0 ? r.scale : 1; return r.rate * s * Math.log(1 + n / s); }
  const p = r.points; let x0 = 0, y0 = 0;
  for (let i = 0; i < p.length; i++) {
    const x1 = p[i][0], y1 = p[i][1];
    if (n <= x1) return x1 > x0 ? y0 + (y1 - y0) * (n - x0) / (x1 - x0) : y1;
    x0 = x1; y0 = y1;
  }
  return y0;
}

export function growthFactor(rules: GrowthRules | undefined, stat: GrowthStat, level: number): number {
  if (!rules) return 1;
  let k = 1;
  for (let i = 0; i < rules.stats.length; i++) { const r = rules.stats[i]; if (r.stat === stat && r.on) k *= Math.max(GROWTH_LIMITS.FACTOR_MIN, 1 + growthBonus(r, level) / 100); }
  return oneStatBound(k);
}

export function growthFactorsInto(rules: GrowthRules | undefined, level: number, out: Float64Array): void {
  for (let i = 0; i < GROWTH_STAT_COUNT; i++) out[i] = 1;
  if (!rules) return;
  for (let i = 0; i < rules.stats.length; i++) {
    const r = rules.stats[i]; if (!r.on) continue;
    const j = GROWTH_STAT_INDEX[r.stat]; if (j === undefined) continue;
    out[j] *= Math.max(GROWTH_LIMITS.FACTOR_MIN, 1 + growthBonus(r, level) / 100);
  }
  if (SMALL_FIX.GH483) for (let i = 0; i < GROWTH_STAT_COUNT; i++) out[i] = oneStatBound(out[i]);
}

export function growthSkillPointsAt(rule: GrowthSkillPointsRule, level: number): number {
  const runs = rule.runs;
  if (!runs) {
    const top = Math.min(Math.max(0, Math.floor(level)), rule.stopLevel);
    return Math.floor(top / Math.max(1, rule.everyLevels));
  }
  const L = Math.max(0, Math.floor(level));
  let n = 0;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i], top = L < r.stop ? L : r.stop;
    if (top >= r.start) n += Math.floor((top - r.start) / Math.max(1, r.every)) + 1;
  }
  return n;
}

export function pointRunsOf(rule: GrowthSkillPointsRule): GrowthPointRun[] {
  return rule.runs ?? [{ id: 'p1', start: Math.max(1, rule.everyLevels), every: Math.max(1, rule.everyLevels), stop: rule.stopLevel }];
}

export const ARRAS_POINT_RUNS: readonly Readonly<GrowthPointRun>[] = [
  { id: 'arras-1', start: 2, every: 2, stop: 6 },
  { id: 'arras-2', start: 16, every: 10, stop: 336 },
];
const arrasPoints = (): GrowthSkillPointsRule => ({ on: true, everyLevels: 10, stopLevel: 336, runs: ARRAS_POINT_RUNS.map(r => ({ ...r })) });

let _runSeq = 0;
export function newPointRun(): GrowthPointRun {
  _runSeq++;
  return { id: 'p' + Date.now().toString(36) + _runSeq, start: 10, every: 10, stop: GROWTH_LIMITS.LEVEL_MAX };
}

export function growthRespawnXp(rule: GrowthRespawnRule, deathXp: number): number {
  const score = Math.max(0, deathXp) + GROWTH_START_SCORE;
  let kept = Math.floor(score * rule.keepPercent / 100);
  if (kept > rule.maxScore) kept = rule.maxScore;
  if (kept < rule.minScore) kept = rule.minScore;
  return Math.max(0, kept - GROWTH_START_SCORE);
}

let _ruleSeq = 0;
export function newGrowthStatRule(stat: GrowthStat = 'maxHealth'): GrowthStatRule {
  _ruleSeq++;
  return { id: 'g' + Date.now().toString(36) + _ruleSeq, stat, on: true, start: 0, stop: GROWTH_LIMITS.LEVEL_MAX, kind: 'line', rate: 0.5, scale: 50, points: [[50, 25], [150, 50]], atStart: 0, scoreRate: 0 };
}

export function odGrowthRules(): GrowthRules {
  return {
    stats: [
      { id: 'od-size', stat: 'size', on: true, start: 0, stop: GROWTH_LIMITS.LEVEL_MAX, kind: 'line', rate: 0.5725, scale: 50, points: [], atStart: 0, scoreRate: 0 },
      { id: 'od-health', stat: 'maxHealth', on: true, start: 0, stop: 155, kind: 'line', rate: 0.91, scale: 50, points: [], atStart: 0, scoreRate: 0 },
    ],
    skillPoints: OLD_G12 ? { on: true, everyLevels: 9, stopLevel: GROWTH_LIMITS.LEVEL_MAX } : arrasPoints(),
    respawn: { on: true, keepPercent: 25, minScore: GROWTH_START_SCORE, maxScore: 402171 },
  };
}

export function defaultGrowthRules(): GrowthRules {
  return {
    stats: [{ id: 'g-size', stat: 'size', on: true, start: 0, stop: GROWTH_LIMITS.LEVEL_MAX, kind: 'line', rate: 5, scale: 50, points: [], atStart: 0, scoreRate: 0 }],
    skillPoints: { on: false, everyLevels: 6, stopLevel: GROWTH_LIMITS.LEVEL_MAX },
    respawn: { on: false, keepPercent: 25, minScore: GROWTH_START_SCORE, maxScore: 402171 },
  };
}

export function growthModeRules(): GrowthRules {
  if (OLD_G12) return {
    stats: [{ id: 'gm-size', stat: 'size', on: true, start: 0, stop: GROWTH_LIMITS.LEVEL_MAX, kind: 'score', rate: 1.1411, scale: 50, points: [], atStart: 1.5544, scoreRate: 55.569 }],
    skillPoints: { on: false, everyLevels: 6, stopLevel: GROWTH_LIMITS.LEVEL_MAX },
    respawn: { on: false, keepPercent: 25, minScore: GROWTH_START_SCORE, maxScore: 402171 },
  };
  return {
    stats: [
      { id: 'gm-size', stat: 'size', on: true, start: 0, stop: GROWTH_LIMITS.LEVEL_MAX, kind: 'score', rate: 1.1453, scale: 50, points: [], atStart: 1.4531, scoreRate: 55.329 },
      { id: 'gm-health', stat: 'maxHealth', on: true, start: 0, stop: 155, kind: 'line', rate: 0.91, scale: 50, points: [], atStart: 0, scoreRate: 0 },
    ],
    skillPoints: arrasPoints(),
    respawn: { on: true, keepPercent: 25, minScore: GROWTH_START_SCORE, maxScore: 402171 },
  };
}

const _num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const STAT_SET = new Set<string>(GROWTH_STATS.map((s) => s.stat));

export function clampGrowthRules(raw: unknown): GrowthRules | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Partial<GrowthRules>, L = GROWTH_LIMITS;
  const stats: GrowthStatRule[] = [];
  for (const r of Array.isArray(o.stats) ? o.stats : []) {
    if (!r || typeof r !== 'object' || !STAT_SET.has((r as GrowthStatRule).stat)) continue;
    const q = r as GrowthStatRule;
    const start = _num(q.start, 0, L.LEVEL_MAX, 0);
    const pts: [number, number][] = [];
    let lastX = 0;
    for (const p of Array.isArray(q.points) ? q.points.slice(0, L.POINTS_MAX) : []) {
      if (!Array.isArray(p)) continue;
      const x = _num(p[0], 0, L.LEVEL_MAX, NaN), y = _num(p[1], L.BONUS_MIN, L.BONUS_MAX, NaN);
      if (Number.isFinite(x) && Number.isFinite(y) && x >= lastX) { pts.push([x, y]); lastX = x; }
    }
    stats.push({
      id: typeof q.id === 'string' && q.id ? q.id.slice(0, 40) : 'g' + stats.length,
      stat: q.stat, on: q.on !== false, start, stop: Math.max(start, _num(q.stop, 0, L.LEVEL_MAX, L.LEVEL_MAX)),
      kind: q.kind === 'log' || q.kind === 'points' || q.kind === 'score' ? q.kind : 'line',
      rate: _num(q.rate, L.RATE_MIN, L.RATE_MAX, 0), scale: _num(q.scale, L.SCALE_MIN, L.SCALE_MAX, 50), points: pts,
      atStart: _num(q.atStart, L.BONUS_MIN, L.BONUS_MAX, 0), scoreRate: _num(q.scoreRate, L.SCORE_RATE_MIN, L.SCORE_RATE_MAX, 0),
    });
  }
  const sp = (o.skillPoints || {}) as Partial<GrowthSkillPointsRule>, rs = (o.respawn || {}) as Partial<GrowthRespawnRule>;
  const minScore = _num(rs.minScore, 0, L.SCORE_MAX, GROWTH_START_SCORE);
  let runs: GrowthPointRun[] | undefined;
  if (Array.isArray(sp.runs)) {
    runs = [];
    for (const q of sp.runs) {
      if (runs.length >= L.RUNS_MAX) break;
      if (!q || typeof q !== 'object') continue;
      const start = Math.round(_num(q.start, 1, L.LEVEL_MAX, 1));
      runs.push({ id: typeof q.id === 'string' && q.id ? q.id.slice(0, 40) : 'p' + runs.length, start,
        every: Math.round(_num(q.every, L.EVERY_MIN, L.EVERY_MAX, 10)), stop: Math.max(start, Math.round(_num(q.stop, 0, L.LEVEL_MAX, L.LEVEL_MAX))) });
    }
  }
  return {
    stats,
    skillPoints: { on: sp.on === true, everyLevels: Math.round(_num(sp.everyLevels, L.EVERY_MIN, L.EVERY_MAX, 6)), stopLevel: Math.round(_num(sp.stopLevel, 0, L.LEVEL_MAX, L.LEVEL_MAX)), ...(runs ? { runs } : {}) },
    respawn: { on: rs.on === true, keepPercent: _num(rs.keepPercent, 0, 100, 25), minScore, maxScore: Math.max(minScore, _num(rs.maxScore, 0, L.SCORE_MAX, 402171)) },
  };
}
