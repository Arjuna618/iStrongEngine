import type { Id, PlaceRule, Ref, Row, SpawnCard, SpawnGroup, SpecialWave, WavePlan, Num } from '../doc';

export interface SiegeWaveRefs {
  id: () => Id;
  gates: Ref;
  inner: Ref;
  tiles: Ref;
  visitor: Ref;
  orders: { [key: string]: () => Row };
  types: { [tank: string]: Ref };
}

export const SIEGE_SCORES = {
  eliteCrasher: 150000, eliteSkimmer: 500000, sorcerer: 500000, summoner: 500000, enchantress: 500000, exorcistor: 500000, nester: 300000,
  terrestrial: 750000, celestial: 1000000, eternal: 4000000, legionary: 3000000, bob: 500000, sentry: 5000, shinySentry: 50000, sentinel: 10000, egg: 50000, rogue: 500000,
} as const;

const ONE_TILE = 420;

export function innerPlace(r: SiegeWaveRefs): PlaceRule {
  return { how: 'random', avoid: [r.tiles], awayFromPlayers: { base: 370, perSize: 1.26 }, keepFromDamaging: ONE_TILE, onFull: 'wait' };
}
const GATE_PLACE: PlaceRule = { how: 'random', onFull: 'wait' };

const BOSS_SIDE = { team: 'team2', camp: 'boss' as const };

function tankCards(r: SiegeWaveRefs, words: readonly string[], uniqueAlive = false): SpawnCard[] {
  return words.map(tank => r.types[tank] ? { id: r.id(), type: r.types[tank], weight: 1, uniqueAlive: uniqueAlive || undefined } : { id: r.id(), tank, weight: 1, uniqueAlive: uniqueAlive || undefined });
}
function shapeCards(r: SiegeWaveRefs, words: readonly [string, number][]): SpawnCard[] {
  return words.map(([shape, weight]) => ({ id: r.id(), shape, weight }));
}

interface LineOpts {
  count: Num; from?: number; at?: Ref; holds?: boolean; place?: PlaceRule; visitor?: boolean; killLine?: string; order?: Row; score?: number; onMinimap?: boolean;
}
function line(r: SiegeWaveRefs, name: string, cards: SpawnCard[], o: LineOpts): SpawnGroup {
  return {
    id: r.id(), name, cards, count: o.count, spread: 0.2, round: 'chance', test: o.from ? { from: o.from } : undefined,
    at: [o.at ?? r.gates], split: 'shared', blocks: o.holds !== false, side: BOSS_SIDE, showName: false,
    place: o.place ?? GATE_PLACE, tags: o.visitor ? [r.visitor] : undefined,
    body: { brain: 'order', bossTier: o.visitor ? true : undefined, order: o.order, killLine: o.killLine, score: o.score, onLeaderboard: true, onMinimap: o.onMinimap !== false },
  };
}
const by = (k: number): Num => ({ ramp: { per: k } });

export const ELITE_CRASHER_TANKS = ['eliteBattleship', 'eliteDestroyer', 'eliteGunner', 'eliteSpawner', 'eliteSpinner', 'eliteSprayer', 'eliteTrapGuard'] as const;
export const SENTRY_TANKS = ['sentryGun', 'sentrySwarm', 'sentryTrap'] as const;
export const SHINY_TANKS = ['shinySentryGun', 'shinySentrySwarm', 'shinySentryTrap'] as const;
export const SENTINEL_TANKS = ['sentinelLauncher', 'sentinelCrossbow', 'sentinelMinigun'] as const;
export const NESTER_TANKS = ['nestKeeper', 'nestWarden', 'nestGuardian'] as const;
export const TERRESTRIAL_TANKS = ['ezekiel', 'gersemi', 'selene', 'ares', 'eris'] as const;
export const CELESTIAL_TANKS = ['zaphkiel', 'freyja', 'theia', 'paladin', 'nyx'] as const;
export const FINAL_TANKS = ['kronos', 'ragnarok', 'legionaryCrasher'] as const;

export const SIEGE_BREAK: Num = { ramp: { base: 2.7, per: 0.15, max: 30, every: [{ n: 15, rem: 1, mult: 3 }] } };

export function siegeWavePlan(r: SiegeWaveRefs, name = 'Siege'): WavePlan {
  const O = r.orders, S = SIEGE_SCORES;
  const visiting = 'You killed a visiting {tank}.';
  const sentryLine = 'You killed a Sentry.', sentinelLine = 'You killed a Sentinel.';
  const eliteCards = (): SpawnCard[] => [{ id: r.id(), type: r.types.eliteCrasher, weight: ELITE_CRASHER_TANKS.length }, { id: r.id(), type: r.types.eliteSkimmer, weight: 1 }];
  const shinyCard = (weight: number): SpawnCard => ({ id: r.id(), type: r.types.shinySentry, weight, size: [0.414, 0.866] });
  const sentryCards = (): SpawnCard[] => [{ id: r.id(), tank: 'sentryGun', weight: 1, size: [0.756, 0.834] }, { id: r.id(), tank: 'sentrySwarm', weight: 1, size: [0.885, 0.976] }, { id: r.id(), type: r.types.sentryTrap, weight: 1, size: [0.885, 0.976] }];
  const crashers = (k: number) => line(r, 'Crashers', shapeCards(r, [['crasher', 1]]), { count: by(k), at: r.inner, place: innerPlace(r), holds: false });
  const megas = (k: number) => line(r, 'Mega Crashers', shapeCards(r, [['megaCrasher', 1]]), { count: by(k), at: r.inner, place: innerPlace(r), holds: false });
  const sentinels = (k: number, from?: number) => line(r, 'Sentinels', tankCards(r, SENTINEL_TANKS), { count: by(k), from, killLine: sentinelLine, order: O.sentry(), score: S.sentinel, onMinimap: false });
  const nesters = (k: number, from?: number) => line(r, 'Nesters', tankCards(r, NESTER_TANKS), { count: by(k), from, visitor: true, killLine: visiting, order: O.nester(), score: S.nester });
  const mystic = (group: string, tank: string, k: number, order: () => Row, score: number, from?: number) => line(r, group, tankCards(r, [tank]), { count: by(k), from, visitor: true, killLine: visiting, order: order(), score });
  const mysticals = (k: number, from?: number) => [
    mystic('Sorcerers', 'sorcerer', k, O.sorcerer, S.sorcerer, from),
    mystic('Summoners', 'summoner', k, O.summoner, S.summoner, from),
    mystic('Enchantresses', 'enchantress', k, O.mystic, S.enchantress, from),
    mystic('Exorcistors', 'exorcistor', k, O.mystic, S.exorcistor, from),
  ];
  const terrestrials = (k: number, from?: number) => line(r, 'Terrestrials', tankCards(r, TERRESTRIAL_TANKS, true), { count: by(k), from, visitor: true });
  const celestials = (k: number, from?: number) => line(r, 'Celestials', tankCards(r, CELESTIAL_TANKS, true), { count: by(k), from, visitor: true });
  const groups: SpawnGroup[] = [
    crashers(1.26),
    line(r, 'Sentries', [...sentryCards(), shinyCard(0.045)], { count: by(0.75), holds: false, killLine: sentryLine, order: O.sentry(), score: S.sentry, onMinimap: false }),
    line(r, 'Elites', eliteCards(), { count: { curve: [[1, 1], [5, 2], [8, 3.2], [12, 3], [24, 5.04], [100, 21]] }, visitor: true }),
    megas(0.82),
    sentinels(0.45, 9),
    nesters(0.10, 13),
    ...mysticals(0.08, 8),
    terrestrials(0.034, 20),
    celestials(0.033, 20),
    line(r, 'Finals', tankCards(r, FINAL_TANKS, true), { count: by(0.018), from: 29, visitor: true }),
  ];
  const special = (nameS: string, weight: number, lines: SpawnGroup[]): SpecialWave => ({ id: r.id(), name: nameS, weight, groups: lines });
  const specials: SpecialWave[] = [
    special('Mysticals Only', 6, mysticals(0.37)),
    special('Nesters Only', 3, [nesters(0.60)]),
    special('Sentries And Sentinels', 2, [
      line(r, 'Sentries', sentryCards(), { count: by(2.51), holds: false, killLine: sentryLine, order: O.sentry(), score: S.sentry, onMinimap: false }),
      sentinels(1.51),
    ]),
    special('Terrestrials And Celestials', 4, [terrestrials(0.225), celestials(0.225)]),
    special('Bob Only', 1, [line(r, 'Bob', tankCards(r, ['bob']), { count: by(0.63), visitor: true })]),
    special('Crashers Only', 1, [crashers(25.5), megas(4.5)]),
    special('Polygons Only', 1, [{
      ...line(r, 'Polygons', [{ id: r.id(), shape: 'egg', weight: 74 }, { id: r.id(), shape: 'square', weight: 65 }, { id: r.id(), shape: 'triangle', weight: 49 }, { id: r.id(), shape: 'pentagon', weight: 14 }, { id: r.id(), shape: 'betaPentagon', weight: 7 }], { count: by(28), at: r.inner, place: innerPlace(r), holds: false }),
      spread: 0,
    }]),
    { ...special('Elites Only', 1, [line(r, 'Elites', eliteCards(), { count: by(1.0), visitor: true }), crashers(1.26)]), note: 'From the wiki alone. No recording has one, so the count is a reading, not a measure.' },
    { ...special('Sentinels And Shiny Sentries', 0.2, [
      sentinels(2.5),
      line(r, 'Shiny Sentries', [shinyCard(1)], { count: by(1.5), holds: false }),
    ]), note: 'From the wiki alone: "extremely rarely". No recording has one.' },
  ];
  return {
    id: r.id(), name,
    start: { on: 'match', delay: 2.6 },
    first: 1, last: null,
    stream: 15,
    compose: { mode: 'counts' },
    groups, specials, specialChance: 7.5,
    advance: { on: 'cleared', break: SIEGE_BREAK, emptyBreakMult: 1.67 },
    place: GATE_PLACE,
    side: BOSS_SIDE,
  };
}
