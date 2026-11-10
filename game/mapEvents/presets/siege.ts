import type { AreaGroup, BodyTest, EntityType, Id, MapEventsDoc, Named, PlacedEntity, PlaceRule, Ref, Row, Rule, StatusDef, TimerDef, VarDef, ZoneLike, ZoneRect } from '../doc';
import { FINAL_TANKS, CELESTIAL_TANKS, TERRESTRIAL_TANKS, ELITE_CRASHER_TANKS, SHINY_TANKS, SIEGE_SCORES, siegeWavePlan } from './siegeWaves';
import type { SiegeWaveRefs } from './siegeWaves';
import { SMALL_FIX } from '../../smallFixSwitch';

export type SiegeMapId = 'citadel' | 'fortress' | 'blitz';
export const SIEGE_MAP_IDS: readonly SiegeMapId[] = ['citadel', 'fortress', 'blitz'];

const r = (gx: number, gy: number, cw: number, ch: number): ZoneRect => ({ gx, gy, cw, ch });

export interface SiegeMap {
  title: string;
  mazeType: number; gridCells: number; mapScale: number;
  red: ZoneRect[];
  tiles: Record<string, ZoneRect>;
  gates: Record<string, ZoneRect>;
  inner: ZoneRect;
  guns: readonly (readonly [number, number])[];
}

export const SIEGE_MAPS: Record<SiegeMapId, SiegeMap> = {
  citadel: {
    title: 'Citadel', mazeType: 12, gridCells: 26, mapScale: 7.5,
    red: [r(4, 4, 4, 2), r(4, 6, 2, 2), r(18, 4, 4, 2), r(20, 6, 2, 2), r(4, 18, 2, 2), r(4, 20, 4, 2), r(20, 18, 2, 2), r(18, 20, 4, 2)],
    tiles: { North: r(12, 8, 2, 2), West: r(8, 12, 2, 2), East: r(16, 12, 2, 2), South: r(12, 16, 2, 2) },
    gates: { NW: r(0, 0, 2, 2), NE: r(24, 0, 2, 2), SW: r(0, 24, 2, 2), SE: r(24, 24, 2, 2) },
    inner: r(6, 6, 14, 14),
    guns: [[25, 9], [1, 9], [25, 17], [1, 17], [9, 1], [17, 1], [9, 25], [17, 25]],
  },
  fortress: {
    title: 'Fortress', mazeType: 11, gridCells: 28, mapScale: 7,
    red: [r(12, 4, 4, 2), r(12, 22, 4, 2), r(4, 12, 2, 4), r(22, 12, 2, 4)],
    tiles: { NW: r(8, 8, 2, 2), NE: r(18, 8, 2, 2), SW: r(8, 18, 2, 2), SE: r(18, 18, 2, 2) },
    gates: { East: r(26, 12, 2, 4), South: r(12, 26, 4, 2), West: r(0, 12, 2, 4), North: r(12, 0, 4, 2) },
    inner: r(6, 6, 16, 16),
    guns: [[27, 27], [1, 27], [1, 1], [27, 1]],
  },
  blitz: {
    title: 'Blitz', mazeType: 13, gridCells: 32, mapScale: 7,
    red: [r(12, 2, 2, 28)],
    tiles: { A: r(22, 6, 2, 2), B: r(22, 12, 2, 2), C: r(22, 18, 2, 2), D: r(22, 24, 2, 2) },
    gates: { West: r(6, 6, 2, 20) },
    inner: r(16, 4, 12, 24),
    guns: [],
  },
};

const COLOUR_RED = 12, COLOUR_BLUE = 10, COLOUR_FALLEN = 3, COLOUR_ROGUE = 17;
const TILE_OPACITY = 0.3;
const ONE_TILE = 420;

const pointsOf = (build: string): Record<string, number> => {
  const n = build.split('/').map(Number);
  return { bodyDamage: n[0], maxHealth: n[1], bulletSpeed: n[2], bulletHealth: n[3], bulletPenetration: n[4], bulletDamage: n[5], reload: n[6], movementSpeed: n[7], shieldRegen: n[8], shieldCapacity: n[9] };
};

const ROGUE_NAMES = ['Akkerman', 'Bilhorod', 'Brody', 'Dobromyl', 'Isiaslav', 'Kaffa', 'Lutsk', 'Mangup', 'Olseko', 'Palanok', 'Zolochiv'];
const LEGION_TANKS = ['sprayerLegion', 'destroyerLegion', 'gunnerLegion', 'spawnerLegion', 'battleshipLegion'];
const EGG_TANKS = { 6: '06d47ab4b6b0e33f', 7: '45e4b77d4b3f9749', 9: 'fa2268007b3e752d' } as const;

export const SIEGE_LOSE_SECONDS = 60.6;
export const SIEGE_LOSE_MARKS: readonly number[] = [60, 50, 40, 30, 25, 20, 15, 10, 5];
export const SIEGE_TIER_F = 'min(6, floor(wave / 5) + 1)';
export const SIEGE_TACTICS = { healBelow: 70, healBack: 100, fearBelow: 20, fearBack: 100 } as const;
export const SIEGE_ROGUE_STAY = { pct: 15, radius: 450 } as const;

export interface SiegeWorld {
  map: { name: string; mazeType: number; gridCells: number; mapScale: number; enableMaze: true; enableRocks: false; enablePortals: false; enableSpawnAreas: false; bossesCanGrow: boolean };
  mapAreas: { nextId: number; zones: ZoneLike[] };
  events: MapEventsDoc;
}

export function buildSiegeWorld(which: SiegeMapId): SiegeWorld {
  const M = SIEGE_MAPS[which];
  let next = 1;
  const id = (): Id => next++;
  const named = (name: string): Named => ({ id: id(), name });
  const ref = (t: { id: Id; name?: string }): Ref => ({ id: t.id, n: t.name ?? '' });
  const row = (k: string, a: Record<string, unknown>): Row => ({ id: id(), k, a });

  const standing = named('Standing Sanctuary');
  const rogueTag = named('Rogue');
  const visitor = named('Visitor');
  const folderMap = named('Map'), folderVisitors = named('Visitors'), folderSanct = named('Sanctuaries'), folderLose = named('Losing'), folderEggs = named('Eggs And Rogues'), folderWaves = named('Waves');
  const folderSide = named('Your Side');
  const tier: VarDef = { ...named('Tier'), kind: 'number', start: 1, scope: 'match' };
  const lose: TimerDef = { ...named('Lose'), seconds: SIEGE_LOSE_SECONDS, marks: SIEGE_LOSE_MARKS.slice() };
  const T = SIEGE_TACTICS;
  const tactics: StatusDef = { ...named('Siege Tactics'), seconds: null, effects: [
    row('seekHeal', { below: T.healBelow, back: T.healBack, healers: true, tag: ref(standing) }),
    row('healerDuty', {}),
    row('teamFight', { help: true }),
    row('fearLow', { below: T.fearBelow, back: T.fearBack }),
  ] };

  let zoneId = 1;
  const zone = (name: string, rects: ZoneRect[], look: Partial<ZoneLike>, behaviors: Row[]): ZoneLike => {
    const [first, ...more] = rects;
    return { id: zoneId++, uid: id(), name, ...first, ...(more.length > 0 ? { more } : {}), team: 0, kind: 'cosmetic', behaviors, ...look };
  };
  const planId = id();
  const planRef: Ref = { id: planId, n: 'Siege' };
  const waveSpawn = () => [row('spawn', { settings: { mode: 'waves', plan: planRef } })];
  const hidden = { opacity: 0 };
  const redZone = zone('Red Zone', M.red, { colorMap: COLOUR_RED, opacity: TILE_OPACITY }, [
    row('kill', { does: 'dps', dps: 1500, test: 'centre', whitelist: ['bossCamp'], hitsRounds: true, ownerCounts: true, food: 'crashers', foodPct: 100, deathLine: 'You have died a stupid death.' }),
    row('solid', { who: { tags: [ref(rogueTag)] } satisfies BodyTest }),
  ]);
  const tileZones: { name: string; zone: ZoneLike }[] = Object.keys(M.tiles).map(name => ({ name, zone: zone(`Tile ${name}`, [M.tiles[name]], { colorMap: COLOUR_BLUE, opacity: TILE_OPACITY }, [row('spawnPlace', { teams: ['team1'], enabledAtStart: true })]) }));
  const gateZones = Object.keys(M.gates).map(name => zone(`Boss Gate ${name}`, [M.gates[name]], hidden, waveSpawn()));
  const innerZone = zone('Inner Area', [M.inner], hidden, waveSpawn());
  const zones: ZoneLike[] = [redZone, ...tileZones.map(t => t.zone), ...gateZones, innerZone];
  const zoneRef = (z: ZoneLike): Ref => ({ id: z.uid!, n: z.name ?? '' });
  const gates: AreaGroup = { ...named('Boss Gates'), members: gateZones.map(zoneRef) };
  const tiles: AreaGroup = { ...named('Blue Tiles'), members: tileZones.map(t => zoneRef(t.zone)) };

  const orbit = (radius: number) => () => row('goAndOrbit', { tag: ref(standing), radius });
  const hold = (radius: number) => () => row('goAndHold', { tag: ref(standing), radius });
  const orders: SiegeWaveRefs['orders'] = {
    sentry: orbit(440), elite: orbit(423), nester: orbit(470), sorcerer: hold(621), summoner: hold(784), mystic: orbit(405),
    terrestrial: orbit(340), celestial: orbit(406), eternal: orbit(630), legionary: orbit(604),
    bob: () => row('chase', { who: 'players', elseTag: ref(standing), speed: 0.384 }),
  };

  const BOSS_SIDE = { team: 'team2', camp: 'boss' as const };
  const bossType = (name: string, tank: EntityType['forms'][0]['tank'], o: { size?: number; score: number; killLine: string; order: () => Row; classWord?: string; shownName?: string; madeLines?: Record<string, string>; skills?: Record<string, number> }): EntityType => ({
    id: id(), name, folder: folderVisitors.id, side: BOSS_SIDE, brain: 'order', bossTier: true, order: o.order(), showName: false, onLeaderboard: true, onMinimap: true,
    score: o.score, killLine: o.killLine, classWord: o.classWord, madeLines: o.madeLines, skills: o.skills,
    names: o.classWord ? [name] : undefined,
    forms: [{ id: id(), name, tank, size: o.size, shownName: o.shownName }],
  });
  const fileName = (tank: string): string => tank.charAt(0).toUpperCase() + tank.slice(1);
  const S = SIEGE_SCORES;
  const visitTypes: EntityType[] = [];
  const types: SiegeWaveRefs['types'] = {};
  const addVisit = (key: string, t: EntityType): void => { visitTypes.push(t); types[key] = ref(t); };
  addVisit('eliteCrasher', bossType('Elite Crasher', { list: ELITE_CRASHER_TANKS.map(word => ({ word, weight: 1 })), when: 'eachTime' }, { score: S.eliteCrasher, killLine: 'You killed a visiting Elite Crasher.', order: orders.elite, shownName: 'Elite Crasher' }));
  addVisit('eliteSkimmer', bossType('Elite Skimmer', 'eliteSkimmer', { score: S.eliteSkimmer, killLine: 'You killed a visiting Elite Skimmer.', order: orders.elite }));
  for (const t of TERRESTRIAL_TANKS) addVisit(t, bossType(fileName(t), t, { score: S.terrestrial, killLine: 'You killed {name} the Terrestrial.', order: orders.terrestrial, classWord: 'Terrestrial' }));
  for (const t of CELESTIAL_TANKS) addVisit(t, bossType(fileName(t), t, { score: S.celestial, killLine: 'You killed {name} the Celestial.', order: orders.celestial, classWord: 'Celestial' }));
  for (const t of FINAL_TANKS) {
    if (t === 'legionaryCrasher') addVisit(t, bossType('Legionary Crasher', t, { score: S.legionary, killLine: 'You killed a visiting Legionary Crasher.', order: orders.legionary, madeLines: Object.fromEntries(LEGION_TANKS.map(w => [w, `You killed a visiting Legionary Crasher Risen ${fileName(w).replace('Legion', '')} Elite Legion.`])) }));
    else addVisit(t, bossType(fileName(t), t, { score: S.eternal, killLine: 'You killed {name} the Eternal.', order: orders.eternal, classWord: 'Eternal' }));
  }
  addVisit('bob', bossType('Bob', 'bob', { score: S.bob, killLine: 'You killed a visiting Bob.', order: orders.bob, skills: pointsOf('11/11/0/0/0/0/7/12/0/11') }));
  const shiny: EntityType = {
    id: id(), name: 'Shiny Sentry', folder: folderVisitors.id, side: BOSS_SIDE, brain: 'order', order: orders.sentry(), showName: false, onLeaderboard: true, onMinimap: false,
    score: S.shinySentry, killLine: 'You killed a Sentry.', skills: pointsOf('6/6/4/9/9/9/7/0/0/1'),
    forms: [{ id: id(), name: 'Shiny Sentry', tank: { list: SHINY_TANKS.map(word => ({ word, weight: 1 })), when: 'eachTime' } }],
  };
  types.shinySentry = ref(shiny);
  const trapSentry: EntityType = {
    id: id(), name: 'Trap Sentry', folder: folderVisitors.id, side: BOSS_SIDE, brain: 'order', order: orders.sentry(), showName: false, onLeaderboard: true, onMinimap: false,
    score: S.sentry, killLine: 'You killed a Sentry.', skills: pointsOf('6/6/4/9/9/9/7/0/0/1'),
    forms: [{ id: id(), name: 'Trap Sentry', tank: 'sentryTrap' }],
  };
  types.sentryTrap = ref(trapSentry);

  const standingId = id(), fallenId = id();
  const sanctuary: EntityType = {
    id: id(), name: 'Sanctuary', folder: folderMap.id, side: { team: 'team1' }, stands: true, showName: false, onLeaderboard: false, onMinimap: false, worth: 'none', canBeHealed: false,
    forms: [
      { id: standingId, name: 'Standing', tank: 'sanctuaryTier1', colour: { use: 'team' }, tags: [ref(standing)],
        onDeath: { to: fallenId, team: 'form' },
        evolve: [[5, 'sanctuaryTier2'], [10, 'sanctuaryTier3'], [15, 'sanctuaryTier4'], [20, 'sanctuaryTier5'], [25, 'sanctuaryTier6']].map(([wave, tank]) => ({ id: id(), plan: planRef, wave: wave as number, tank: tank as string })) },
      { id: fallenId, name: 'Fallen', tank: 'dominator', side: BOSS_SIDE, colour: { use: 'slot', slot: COLOUR_FALLEN }, killLine: 'You killed a Dominator.',
        onDeath: { to: standingId, team: 'form' } },
    ],
  };
  const atmg: EntityType = {
    id: id(), name: 'Anti Tank Machine Gun', folder: folderMap.id, side: BOSS_SIDE, stands: true, canDie: false, seenByBots: false, showName: false, onLeaderboard: false, onMinimap: false,
    forms: [{ id: id(), name: 'Gun', tank: 'antiTankMachineGun', colour: { use: 'slot', slot: COLOUR_RED } }],
  };
  const egg = (sides: 6 | 7 | 9, rogueTank: EntityType['forms'][0]['tank'], names: string[] | undefined): EntityType => {
    const rogueId = id();
    return {
      id: id(), name: `Mysterious Egg ${sides} Sides`, folder: folderEggs.id, side: { team: 'team1' }, stands: false, brain: 'order',
      order: row('circle', { radius: 48, turn: 12 }),
      crashersIgnore: true, showName: false, birthLook: 'food', pushable: true, contact: 'shape', onLeaderboard: false, onMinimap: true, names,
      forms: [
        { id: id(), name: 'Egg', tank: EGG_TANKS[sides], score: S.egg, colour: { use: 'slot', slot: COLOUR_ROGUE }, after: { seconds: 90, to: rogueId, how: 'morph', refill: 'shield' } },
        { id: rogueId, name: 'Rogue', tank: rogueTank, score: S.rogue, colour: { use: 'slot', slot: COLOUR_ROGUE }, tags: [ref(rogueTag)], order: row('follow', { who: 'leader', radius: 254, gap: 112 }) },
      ],
    };
  };
  const egg6 = egg(6, 'roguePalisade', ROGUE_NAMES), egg7 = egg(7, 'rogueArmada', ROGUE_NAMES);
  const egg9 = egg(9, { list: [{ word: 'julius', weight: 1 }, { word: 'genghis', weight: 1 }, { word: 'napoleon', weight: 1 }], when: 'eachTime' }, undefined);

  const placed: PlacedEntity[] = [
    ...tileZones.map(t => {
      const b = M.tiles[t.name];
      return { id: id(), name: `Sanctuary ${t.name}`, type: ref(sanctuary), cx: b.gx + b.cw / 2, cy: b.gy + b.ch / 2, home: zoneRef(t.zone) };
    }),
    ...M.guns.map(([cx, cy], i) => ({ id: id(), name: `Anti Tank Machine Gun ${i + 1}`, type: ref(atmg), cx, cy })),
  ];

  const plan = siegeWavePlan({ id, gates: ref(gates), inner: zoneRef(innerZone), tiles: ref(tiles), visitor: ref(visitor), orders, types }, 'Siege');
  plan.id = planId;

  const say = (text: string, to: 'all' | 'subject' = 'all') => row('say', { to, text });
  const rule = (folder: Named, name: string, when: Row[], cond: Row[], then: Row[], more: Partial<Rule> = {}): Rule => ({ id: id(), name, folder: folder.id, when, cond, then, ...more });
  const sanctTest: BodyTest = { types: [ref(sanctuary)] };
  const eggPlace: PlaceRule = { how: 'random', avoid: [ref(tiles)], keepFromDamaging: ONE_TILE, onFull: 'wait' };
  const standingCount = { f: `{${standing.id}}` };
  const rules: Rule[] = [
    rule(folderWaves, 'A Wave Starts', [row('wave.started', { plan: planRef })], [], [say('Wave {wave} has started!')]),
    rule(folderWaves, 'A Wave Is Cleared', [row('wave.cleared', { plan: planRef })], [], [say('The next wave starts in {seconds} seconds.')]),
    rule(folderWaves, 'Tell The Wave', [row('player.spawned', {})], [row('wave.is', { plan: planRef, test: { from: 1 } })], [say('It is currently wave {wave}.', 'subject')]),
    rule(folderVisitors, 'A Visitor Leaves', [row('body.died', { who: { tags: [ref(visitor)] } satisfies BodyTest })], [], [say('A visitor has left!')]),
    rule(folderVisitors, 'An Elite Legion Falls', [row('body.died', { who: { tanks: LEGION_TANKS } satisfies BodyTest })], [], [say('An Elite Legion has been defeated!')]),
    rule(folderSanct, 'The Sanctuaries Upgrade', [row('wave.started', { plan: planRef })], [row('cmp', { a: { f: SIEGE_TIER_F }, op: 'ne', b: { f: `{${tier.id}}` } })], [
      row('if', {
        cond: [row('cmp', { a: { f: SIEGE_TIER_F }, op: 'gt', b: { f: `{${tier.id}}` } })],
        then: [row('var.set', { var: ref(tier), value: { f: SIEGE_TIER_F } }), say(`The sanctuaries have been upgraded to tier {${tier.id}}`)],
        else: [row('var.set', { var: ref(tier), value: { f: SIEGE_TIER_F } })],
      }),
    ]),
    rule(folderSanct, 'A Sanctuary Falls', [row('body.changed', { who: sanctTest, to: { id: fallenId, n: 'Fallen' }, how: 'become' })], [], [
      row('area.paint', { homeOf: { w: 'subject' }, slot: COLOUR_FALLEN, opacity: TILE_OPACITY }),
      row('area.behaviors', { homeOf: { w: 'subject' }, kind: 'spawnPlace', on: false }),
      say('A Sanctuary has been destroyed!'),
    ]),
    rule(folderSanct, 'A Sanctuary Is Restored', [row('body.changed', { who: sanctTest, to: { id: standingId, n: 'Standing' }, how: 'become' })], [], [
      row('area.paint', { homeOf: { w: 'subject' }, slot: COLOUR_BLUE, opacity: TILE_OPACITY }),
      row('area.behaviors', { homeOf: { w: 'subject' }, kind: 'spawnPlace', on: true }),
      say('A Sanctuary has been restored!'),
    ]),
    rule(folderLose, 'All Sanctuaries Are Gone', [row('count.crossed', { tag: ref(standing), n: 0, dir: 'fallsTo' })], [], [
      say('All of the Sanctuaries are destroyed. You cannot respawn.'),
      row('respawn.set', { team: 'team1', on: false }),
      row('timer.start', { timer: ref(lose) }),
    ]),
    rule(folderLose, 'The Countdown', [row('timer.tick', { timer: ref(lose) })], [], [say('Your team will lose in {seconds} seconds.')]),
    rule(folderLose, 'The Team Has Lost', [row('timer.ended', { timer: ref(lose) })], [], [
      say('Your team has lost.'),
      row('match.end', { result: 'lose', team: 'team1', then: 'closeArena', closing: 'Arena closed: No players may join!', closed: 'Arena closed.' }),
    ]),
    rule(folderLose, 'A Sanctuary Comes Back In Time', [row('count.crossed', { tag: ref(standing), n: 1, dir: 'risesTo' })], [], [
      row('timer.stop', { timer: ref(lose) }),
      row('respawn.set', { team: 'team1', on: true }),
      row('wait', { seconds: 0.375 }),
      row('if', { cond: [row('cmp', { a: standingCount, op: 'ge', b: 1 })], then: [say('You can now respawn.')], else: [] }),
    ]),
    rule(folderEggs, 'A Mysterious Egg', [row('wave.started', { plan: planRef, test: { from: 5 } })], [row('chance', { pct: 10 })], [
      row('spawn', { what: [{ id: id(), type: ref(egg6), weight: 6 }, { id: id(), type: ref(egg7), weight: 5 }, { id: id(), type: ref(egg9), weight: 1 }], count: 1, at: { w: 'in', areas: [zoneRef(innerZone)], rule: eggPlace } }),
      say('A mysterious egg has appeared.'),
    ]),
    rule(folderEggs, 'An Egg Hatches', [row('body.changed', { who: { types: [ref(egg6), ref(egg7), ref(egg9)] } satisfies BodyTest, how: 'morph' })], [], [say('{name} has arrived and joined your team.')]),
    rule(folderSide, 'Your Side Fights As A Team', [row('bot.joined', { who: { boss: false } satisfies BodyTest })], [], [
      row('status.add', { who: { w: 'subject' }, status: ref(tactics) }),
    ]),
  ];
  const moreStatuses: StatusDef[] = [];
  if (SMALL_FIX.HP94 !== 0) {
    const rogueStay: StatusDef = { ...named('Stays Near Rogues'), seconds: null, effects: [row('guardTag', { tag: ref(rogueTag), radius: SIEGE_ROGUE_STAY.radius })] };
    moreStatuses.push(rogueStay);
    rules.push(rule(folderSide, 'Some Of Your Side Stay Near Rogues', [row('bot.joined', { who: { boss: false } satisfies BodyTest })], [row('chance', { pct: SIEGE_ROGUE_STAY.pct })], [
      row('status.add', { who: { w: 'subject' }, status: ref(rogueStay) }),
    ]));
  }

  const events: MapEventsDoc = {
    v: 1, nextId: 1,
    meta: { title: `Siege ${M.title}`, seed: 'match', shipped: `siege-${which}` },
    match: {
      ambientBosses: false, ambientSentries: false, ambientSentinels: false, ambientCrashers: false, food: true, foodIn: zoneRef(innerZone), teamBots: 'mode', respawn: 'spawnPlacesOnly', maxTanksAlive: 150,
      treeSwaps: [{ from: 'smasher', to: 'healer' }, { from: 'underseer' }],
      treeAdds: [{ parent: 'basic', tier: 3, tanks: ['single'] }, { parent: 'healer', tier: 3, tanks: ['medic', 'ambulance', 'surgeon', 'paramedic'] }],
      healersScoreByHealing: true,
    },
    tags: [standing, rogueTag, visitor],
    folders: [folderMap, folderVisitors, folderSanct, folderLose, folderEggs, folderWaves, folderSide],
    types: [sanctuary, atmg, egg6, egg7, egg9, ...visitTypes, shiny, trapSentry],
    placed, plans: [plan], rules, vars: [tier], timers: [lose], areaGroups: [gates, tiles], statuses: [tactics, ...moreStatuses],
  };
  events.nextId = next;
  return {
    map: { name: `Siege ${M.title}`, mazeType: M.mazeType, gridCells: M.gridCells, mapScale: M.mapScale, enableMaze: true, enableRocks: false, enablePortals: false, enableSpawnAreas: false, bossesCanGrow: false },
    mapAreas: { nextId: zoneId, zones },
    events,
  };
}
