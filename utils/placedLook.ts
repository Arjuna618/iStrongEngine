import type { OtherDesign, OtherPart, PlacedLook } from '../types';
import { otherDrawList, otherRefusal, otherReach, makeOtherId, type OtherDrawList } from './otherDraw';

export const CROSS_LOOK_ID = 'other:healer-hat';

export const LOOK_MIN_ALPHA = 0.05;

export const LOOK_SIZE = Object.freeze({ min: 0.5, max: 100, step: 0.1, start: 12 });
const LOOK_BODY_SHARE = 0.96;

export function lookUnit(look: { size: number }, sizePx: number): number {
  return (look.size / 50) * sizePx * LOOK_BODY_SHARE / 2;
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function lookFromOther(design: OtherDesign, size: number = LOOK_SIZE.start): PlacedLook {
  const d: OtherDesign = { _designVersion: 1, otherId: design.otherId, name: design.name, size: design.size, body: copy(design.body) };
  return { kind: 'other', name: design.name, design: d, size };
}

function shapeTurn(sides: number): number {
  if (sides <= 2) return 0;
  return sides % 2 === 0 ? -Math.PI / sides : -Math.PI / 2;
}

export interface ShapeForLook {
  id: string; name: string;
  sides: number;
  color: string; colorMap: number;
  nested: number; downscale: number;
  realSize: number;
  body?: OtherPart;
  alpha?: number;
  anim?: string;
}

function withRarity(look: PlacedLook, s: ShapeForLook): PlacedLook {
  if (typeof s.alpha === 'number' && s.alpha > 0 && s.alpha < 1) look.alpha = s.alpha;
  if (!s.body && (s.anim === 'rainbow' || s.anim === 'trans')) look.anim = s.anim;
  return look;
}

export function lookFromShape(s: ShapeForLook, size: number = LOOK_SIZE.start): PlacedLook {
  const round = s.sides < 3;
  const part = (radius: number, turn: number, above: boolean): OtherPart => (round
    ? { kind: 'circle', radius, x: 0, y: 0, angle: 0, turn: 0, above, color: s.color, colorMap: s.colorMap }
    : { kind: 'polygon', sides: s.sides, radius, x: 0, y: 0, angle: 0, turn, above, color: s.color, colorMap: s.colorMap });
  if (s.body) {
    const relic: OtherDesign = { _designVersion: 1, otherId: makeOtherId(s.name), name: s.name, size: 2, body: s.body };
    return withRarity({ kind: 'shape', name: s.name, design: relic, shapeId: s.id, size }, s);
  }
  const outer = round ? 1 : s.realSize;
  const body = part(outer, shapeTurn(s.sides), false);
  if (s.nested > 0) {
    body.parts = [];
    for (let li = 1; li <= s.nested; li++) {
      const turn = round ? 0 : (li % 2 === 0 ? shapeTurn(s.sides) : shapeTurn(s.sides) + Math.PI / s.sides);
      body.parts.push(part(outer * Math.pow(s.downscale, li), turn, true));
    }
  }
  const design: OtherDesign = { _designVersion: 1, otherId: makeOtherId(s.name), name: s.name, size: 2, body };
  return withRarity({ kind: 'shape', name: s.name, design, shapeId: s.id, size }, s);
}

export function normalizeLook(raw: unknown): PlacedLook | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as any;
  if (r.kind !== 'other' && r.kind !== 'shape') return null;
  if (!r.design || typeof r.design !== 'object' || otherRefusal(r.design) !== null) return null;
  const size = typeof r.size === 'number' && isFinite(r.size) ? Math.min(LOOK_SIZE.max, Math.max(LOOK_SIZE.min, r.size)) : LOOK_SIZE.start;
  const look: PlacedLook = { kind: r.kind, name: typeof r.name === 'string' ? r.name.slice(0, 80) : String(r.design.name || ''), design: r.design as OtherDesign, size };
  if (r.kind === 'shape' && typeof r.shapeId === 'string') look.shapeId = r.shapeId.slice(0, 80);
  if (typeof r.alpha === 'number' && isFinite(r.alpha) && r.alpha < 1) look.alpha = Math.max(LOOK_MIN_ALPHA, r.alpha);
  if (r.anim === 'rainbow' || r.anim === 'trans') look.anim = r.anim;
  return look;
}

const _lists: WeakMap<OtherDesign, OtherDrawList> = new WeakMap();
export function lookList(look: PlacedLook): OtherDrawList {
  let l = _lists.get(look.design);
  if (l === undefined) { l = otherDrawList(look.design, null); _lists.set(look.design, l); }
  return l;
}

const _reach: WeakMap<OtherDesign, number> = new WeakMap();
export function lookReach(look: PlacedLook): number {
  let r = _reach.get(look.design);
  if (r === undefined) { r = Math.max(0.05, otherReach(look.design.body)); _reach.set(look.design, r); }
  return r;
}
