export interface TripBot {
  name: string; tank: string; team: string; xp: number; draws: [number, number, number, number];
}
export interface MatchRecord {
  key: string; seed: number; roomMin: number; realLeft: number; playerTeam: number; bots: TripBot[];
}
export interface JourneyBot {
  name: string; tank: string; team: string; xp: number; dread: boolean;
  at: string; until: number; next: string; nextFor: number; frozen: number;
}

export const TRAVEL_MAX_MATCHES = 24;
export const TRAVEL_MAX_JOURNEYS = 300;
export const TRAVEL_MAX_BOTS = 80;
export const STAY_HUB_MS: readonly [number, number] = [20000, 180000];
export const STAY_MODE_MS: readonly [number, number] = [5 * 60000, 40 * 60000];
export function isHub(key: string): boolean { return key === 'nexus' || key === 'forge'; }

const okStr = (s: unknown, max = 64): s is string => typeof s === 'string' && s.length > 0 && s.length <= max;
const okNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export class TravelLedger {
  private readonly matches = new Map<string, MatchRecord>();
  readonly journeys: JourneyBot[] = [];

  remember(r: MatchRecord): void {
    if (!okStr(r.key) || !okNum(r.seed) || !okNum(r.realLeft)) return;
    const bots = r.bots.filter(b => okStr(b.name, 40) && okStr(b.tank) && okStr(b.team, 16) && okNum(b.xp) && b.draws.length === 4 && b.draws.every(okNum)).slice(0, TRAVEL_MAX_BOTS);
    this.matches.delete(r.key);
    this.matches.set(r.key, { key: r.key, seed: r.seed, roomMin: okNum(r.roomMin) ? Math.max(0, r.roomMin) : 0, realLeft: r.realLeft, playerTeam: okNum(r.playerTeam) ? r.playerTeam : 0, bots });
    while (this.matches.size > TRAVEL_MAX_MATCHES) { const first = this.matches.keys().next().value; if (first === undefined) break; this.matches.delete(first); }
  }
  recall(key: string): MatchRecord | undefined {
    const r = this.matches.get(key);
    if (!r) return undefined;
    if (!okNum(r.seed) || !Array.isArray(r.bots)) { this.matches.delete(key); return undefined; }
    return r;
  }
  get size(): number { return this.matches.size; }

  depart(b: Omit<JourneyBot, 'at' | 'until' | 'next' | 'nextFor' | 'frozen'>, to: string, now: number, rand: () => number, pickNext: () => string): void {
    if (!okStr(b.name, 40) || !okStr(to)) return;
    this.dropJourney(b.name);
    const hub = isHub(to);
    const stay = hub ? STAY_HUB_MS : STAY_MODE_MS;
    const until = now + stay[0] + rand() * (stay[1] - stay[0]);
    const next = hub ? pickNext() : '';
    const nextFor = hub ? STAY_MODE_MS[0] + rand() * (STAY_MODE_MS[1] - STAY_MODE_MS[0]) : 0;
    this.journeys.push({ ...b, at: to, until, next, nextFor, frozen: NaN });
    if (this.journeys.length > TRAVEL_MAX_JOURNEYS) this.journeys.splice(0, this.journeys.length - TRAVEL_MAX_JOURNEYS);
  }
  advance(now: number): void {
    for (let i = this.journeys.length - 1; i >= 0; i--) {
      const j = this.journeys[i];
      if (!Number.isNaN(j.frozen)) continue;
      while (now >= j.until) {
        if (j.next) { const from = j.at; j.at = j.next; j.until = j.until + j.nextFor; j.next = ''; j.nextFor = 0; if (from === 'forge') j.dread = true; continue; }
        this.journeys.splice(i, 1);
        break;
      }
    }
  }
  inMatch(key: string): JourneyBot[] { return this.journeys.filter(j => j.at === key && Number.isNaN(j.frozen)); }
  freeze(key: string, now: number): void { for (const j of this.journeys) if (j.at === key && Number.isNaN(j.frozen)) j.frozen = Math.max(0, j.until - now); }
  thaw(key: string, now: number): void { for (const j of this.journeys) if (j.at === key && !Number.isNaN(j.frozen)) { j.until = now + j.frozen; j.frozen = NaN; } }
  dropJourney(name: string): void { for (let i = this.journeys.length - 1; i >= 0; i--) if (this.journeys[i].name === name) this.journeys.splice(i, 1); }
  frozenIn(key: string): JourneyBot[] { return this.journeys.filter(j => j.at === key && !Number.isNaN(j.frozen)); }
  clear(): void { this.matches.clear(); this.journeys.length = 0; }
}

export function survives(b: TripBot, roomMin: number, awayMin: number, lifeOf: (u: number) => number, freshShare: number): boolean {
  const d = b.draws;
  if (d[0] < freshShare) return awayMin < lifeOf(d[1]) * 0.25;
  const life = lifeOf(d[1]);
  const age = Math.min(roomMin, life);
  return age + awayMin <= life;
}
