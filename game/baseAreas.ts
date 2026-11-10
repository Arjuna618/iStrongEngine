import { BASE_AREAS } from './baseAreasSwitch';
import type { Row, ZoneLike, ZoneRect } from './mapEvents/doc';
import type { AreaShape } from './areaShape';

export { BASE_AREAS };

export const BASE_TEAM_WORDS: readonly string[] = ['team1', 'team2', 'team3', 'team4'];

export const TEAM_BASE_KIND = 'teamBase';

function teamIndex(t: unknown): number {
  return typeof t === 'number' && t >= 0 && t <= 3 ? Math.floor(t) : 0;
}

export function zoneBaseTeam(z: ZoneLike): number {
  if (BASE_AREAS.ON === 0) return !z.kind || z.kind === 'base' ? teamIndex(z.team) : -1;
  const bs = z.behaviors;
  if (Array.isArray(bs)) {
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b || b.k !== TEAM_BASE_KIND || b.off === true) continue;
      const w = b.a ? b.a.team : undefined;
      const t = typeof w === 'string' ? BASE_TEAM_WORDS.indexOf(w) : -1;
      return t >= 0 ? t : teamIndex(z.team);
    }
    return -1;
  }
  return !z.kind || z.kind === 'base' ? teamIndex(z.team) : -1;
}

export function teamBaseRow(id: number, t: number): Row {
  return { id, k: TEAM_BASE_KIND, a: { team: BASE_TEAM_WORDS[teamIndex(t)] } };
}

function zoneBox(z: ZoneRect & { more?: ZoneRect[] }): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = z.gx, y0 = z.gy, x1 = z.gx + z.cw, y1 = z.gy + z.ch;
  if (z.more) for (const m of z.more) { if (m.gx < x0) x0 = m.gx; if (m.gy < y0) y0 = m.gy; if (m.gx + m.cw > x1) x1 = m.gx + m.cw; if (m.gy + m.ch > y1) y1 = m.gy + m.ch; }
  return { x0, y0, x1, y1 };
}

export type CentreShift = (now: number, was: number) => number;

export function fitZonesToGrid<Z extends ZoneRect & { uid?: number; more?: ZoneRect[]; shape?: AreaShape }>(
  zones: readonly Z[], oldW: number, oldH: number, newW: number, newH: number, centre: CentreShift,
  shiftShape: (s: AreaShape, dx: number, dy: number) => AreaShape, moved?: Map<number, { dx: number; dy: number }>,
): Z[] {
  const cdx = centre(newW, oldW), cdy = centre(newH, oldH);
  return zones.map(z => {
    const b = zoneBox(z);
    const plain = !z.more?.length && !z.shape;
    const axis = (lo: number, hi: number, was: number, now: number, c: number): { d: number; grow: number } => {
      const atLo = lo <= 0, atHi = hi >= was;
      if (atLo && atHi) return plain ? { d: 0, grow: now - was } : { d: 0, grow: 0 };
      if (atHi) return { d: now - was, grow: 0 };
      if (atLo) return { d: 0, grow: 0 };
      return { d: c, grow: 0 };
    };
    const ax = BASE_AREAS.ON !== 0 ? axis(b.x0, b.x1, oldW, newW, cdx) : { d: cdx, grow: 0 };
    const ay = BASE_AREAS.ON !== 0 ? axis(b.y0, b.y1, oldH, newH, cdy) : { d: cdy, grow: 0 };
    if (moved && typeof z.uid === 'number') moved.set(z.uid, { dx: ax.d, dy: ay.d });
    if (ax.d === 0 && ay.d === 0 && ax.grow === 0 && ay.grow === 0) return z;
    const next: Z = { ...z, gx: z.gx + ax.d, gy: z.gy + ay.d, cw: Math.max(1, z.cw + ax.grow), ch: Math.max(1, z.ch + ay.grow) };
    if (z.more) next.more = z.more.map(m => ({ ...m, gx: m.gx + ax.d, gy: m.gy + ay.d }));
    if (z.shape) next.shape = shiftShape(z.shape, ax.d, ay.d);
    return next;
  });
}
