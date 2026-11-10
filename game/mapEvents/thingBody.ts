export interface ShapeBodySpec {
  health?: number;
  bodyDamage?: number;
  roundHit?: number;
  shield?: number;
  shieldRegen?: number;
  xp?: number;
  resist?: number;
  penetration?: number;
  drift?: number;
  pushability?: number;
  intangible?: boolean;
  weight?: number;
  push?: number;
  keep?: number;
  rolls?: boolean;
  noInsidePush?: boolean;
  spin?: number;
  thrown?: number;
  bornWhole?: boolean;
}

export const SHAPE_SPEC_RANGE = {
  health: { min: 0.1, max: 1e12 },
  bodyDamage: { min: 0, max: 1e6 },
  roundHit: { min: 0, max: 1e6 },
  shield: { min: 0, max: 1e8 },
  shieldRegen: { min: 0, max: 1e6 },
  xp: { min: 0, max: 1e13 },
  resist: { min: 1, max: 100 },
  penetration: { min: 0.1, max: 100 },
  drift: { min: 0, max: 500 },
  pushability: { min: 0, max: 5 },
  weight: { min: 0.01, max: 1000 },
  push: { min: 0, max: 10 },
  keep: { min: 0, max: 99 },
  spin: { min: -1440, max: 1440 },
  thrown: { min: 0, max: 3000 },
} as const;
type SpecNumKey = keyof typeof SHAPE_SPEC_RANGE;
const SPEC_NUM_KEYS = Object.keys(SHAPE_SPEC_RANGE) as SpecNumKey[];

export function cleanShapeSpec(raw: unknown): ShapeBodySpec | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: ShapeBodySpec = {};
  for (const k of SPEC_NUM_KEYS) {
    const v = r[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const g = SHAPE_SPEC_RANGE[k];
    out[k] = v < g.min ? g.min : v > g.max ? g.max : v;
  }
  if (typeof r.intangible === 'boolean') out.intangible = r.intangible;
  if (typeof r.rolls === 'boolean') out.rolls = r.rolls;
  if (typeof r.noInsidePush === 'boolean') out.noInsidePush = r.noInsidePush;
  if (typeof r.bornWhole === 'boolean') out.bornWhole = r.bornWhole;
  return Object.keys(out).length > 0 ? out : undefined;
}

export const TOUCH_WHAT = ['walls', 'rocks', 'edge', 'tanks', 'bosses', 'shapes'] as const;
export type TouchWhat = typeof TOUCH_WHAT[number];
export const TOUCH_THEN = ['bounce', 'die', 'damage', 'heal'] as const;
export type TouchThen = typeof TOUCH_THEN[number];
export const TOUCH_WHAT_SHOWN: Record<TouchWhat, string> = { walls: 'Walls', rocks: 'Rocks', edge: 'The Map\'s Edge', tanks: 'Tanks', bosses: 'Bosses', shapes: 'Food Shapes' };
export const TOUCH_THEN_SHOWN: Record<TouchThen, string> = { bounce: 'Bounces Off', die: 'Dies', damage: 'Gets Damaged', heal: 'Heals' };

export interface TouchRow {
  id: number;
  what: TouchWhat;
  then: TouchThen;
  strength?: number;
  amount?: number;
  unit?: 'points' | 'pct';
  per?: 'touch' | 'second';
  off?: true;
}
export const TOUCH_STRENGTH_MAX = 20;
export const TOUCH_AMOUNT_MAX = 1e9;
export const TOUCH_DEFAULTS = { strength: 0.1, amount: 10, unit: 'pct', per: 'touch' } as const;
export function cleanTouchRows(raw: unknown): TouchRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: TouchRow[] = [];
  for (const r of raw) {
    if (out.length >= 32) break;
    if (r === null || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (!Number.isInteger(o.id) || (o.id as number) < 0) continue;
    if (!(TOUCH_WHAT as readonly unknown[]).includes(o.what) || !(TOUCH_THEN as readonly unknown[]).includes(o.then)) continue;
    const row: TouchRow = { id: o.id as number, what: o.what as TouchWhat, then: o.then as TouchThen };
    const n = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
    const s = n(o.strength, 0, TOUCH_STRENGTH_MAX); if (s !== undefined) row.strength = s;
    const unit = o.unit === 'points' || o.unit === 'pct' ? o.unit : undefined; if (unit) row.unit = unit;
    const a = n(o.amount, 0, unit === 'pct' ? 100 : TOUCH_AMOUNT_MAX); if (a !== undefined) row.amount = a;
    if (o.per === 'touch' || o.per === 'second') row.per = o.per;
    if (o.off === true) row.off = true;
    out.push(row);
  }
  return out.length > 0 ? out : undefined;
}

export const TOUCH_STRIDE = 5;
export const TOUCH_KINDS = TOUCH_WHAT.length;
export const TW_WALLS = 0, TW_ROCKS = 1, TW_EDGE = 2, TW_TANKS = 3, TW_BOSSES = 4, TW_SHAPES = 5;
export const TT_BOUNCE = 0, TT_DIE = 1, TT_DAMAGE = 2, TT_HEAL = 3;
export function compileTouch(rows: readonly TouchRow[] | undefined): Float64Array | null {
  const clean = cleanTouchRows(rows);
  if (!clean) return null;
  const on = clean.filter(r => r.off !== true);
  if (on.length === 0) return null;
  const out = new Float64Array(on.length * TOUCH_STRIDE);
  for (let i = 0; i < on.length; i++) {
    const r = on[i], o = i * TOUCH_STRIDE;
    out[o] = TOUCH_WHAT.indexOf(r.what);
    out[o + 1] = TOUCH_THEN.indexOf(r.then);
    out[o + 2] = r.then === 'bounce' ? (r.strength ?? TOUCH_DEFAULTS.strength) : (r.amount ?? TOUCH_DEFAULTS.amount);
    out[o + 3] = (r.unit ?? TOUCH_DEFAULTS.unit) === 'pct' ? 1 : 0;
    out[o + 4] = (r.per ?? TOUCH_DEFAULTS.per) === 'second' ? 1 : 0;
  }
  return out;
}
export function touchWants(list: Float64Array | null, what: number): boolean {
  if (list === null) return false;
  for (let o = 0; o < list.length; o += TOUCH_STRIDE) if (list[o] === what) return true;
  return false;
}
export function touchMask(list: Float64Array | null): number {
  if (list === null) return 0;
  let m = 0;
  for (let o = 0; o < list.length; o += TOUCH_STRIDE) m |= 1 << list[o];
  return m;
}
