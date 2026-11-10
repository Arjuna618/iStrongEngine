import type { BodyTest, EntityType, Id, MapEventsDoc, Named, PlacedEntity, Ref, Row, Rule, ZoneLike } from '../doc';
import type { MapConfig } from '../../../types';
import { drawingOf, drawingSites } from '../../modeDrawings';
import { teamSlot, teamCaps, roleRules } from './objectives';
import { BASE_AREAS } from '../../baseAreasSwitch';
import { SMALL_FIX } from '../../smallFixSwitch';

export interface MissingWorld {
  events: MapEventsDoc;
  mapAreas: { nextId: number; zones: ZoneLike[] };
  map?: Partial<MapConfig>;
}

export const MISSING = {
  TAG_SHRINK_AFTER: 60, TAG_SHRINK_MINUTES: 10, TAG_SHRINK_TO: 35,
  CLANS_MIN: 2, CLANS_MAX: 5,
  FORGE_LEVEL: 45, POINT_ON: 60, POINT_OFF: 2,
  NEXUS_AGE_MIN: 5,
  DREAD_SHARE_NORMAL: 5, DREAD_SHARE_LABYRINTH: 15,
  LABY_WALL_OPACITY: 51 / 147,
  NEXUS_CROSS: 10, NEXUS_CROSS_HOLD: 30,
  SEEK_ODDS: 88, DREAD_LEAVE_SHARE: 15,
} as const;

export const CTF_FLAG = { PER_POST: 3, SPREAD: 70, THROWN: 167, KEEP: 0.0041, SPIN: -143, HEALTH: 750, SHAPE_HURT_PCT: 50,
  FOLLOW: { distance: 10, circle: 152, pull: 45, top: 315, keep: 50 } } as const;

function maker() {
  let next = 1;
  const id = (): Id => next++;
  const named = (name: string): Named => ({ id: id(), name });
  const ref = (t: { id: Id; name?: string }): Ref => ({ id: t.id, n: t.name ?? '' });
  const row = (k: string, a: Record<string, unknown>): Row => ({ id: id(), k, a });
  const rule = (folder: Named, name: string, when: Row[], cond: Row[], then: Row[], more: Partial<Rule> = {}): Rule => ({ id: id(), name, folder: folder.id, when, cond, then, ...more });
  const say = (text: string, to: 'all' | 'subject' = 'all') => row('say', { to, text });
  let zoneId = 1;
  const zones: ZoneLike[] = [];
  const area = (name: string, r: { gx: number; gy: number; cw: number; ch: number }, look: Record<string, unknown>, behaviors: Row[]): ZoneLike => {
    const z = { id: zoneId++, uid: id(), name, ...r, team: 0, kind: 'cosmetic', behaviors, ...look } as unknown as ZoneLike;
    zones.push(z);
    return z;
  };
  const zref = (z: ZoneLike): Ref => ({ id: z.uid!, n: z.name ?? '' });
  const done = (events: MapEventsDoc, map?: Partial<MapConfig>): MissingWorld => { events.nextId = next; return { events, mapAreas: { nextId: zoneId, zones }, ...(map ? { map } : {}) }; };
  return { id, named, ref, row, rule, say, area, zref, zones, done };
}

const PORTAL_SHIPS: readonly (readonly [number, number])[] = [[1.5, 5.5], [9.5, 5.5]];
function mothershipWorld(drawingKey: string | undefined, teams: number): MissingWorld {
  const M = maker();
  const folderShips = M.named('Flagships'), folderWin = M.named('Winning'), folderBots = M.named('Bots');
  const shipTag = M.named('Flagship');
  const tags: Named[] = [], types: EntityType[] = [];
  for (let t = 1; t <= teams; t++) {
    const tag = M.named(`${teamCaps(t, teams)[0]}${teamCaps(t, teams).slice(1).toLowerCase()} Flagship`);
    tags.push(tag);
    types.push({ id: M.id(), name: `${tag.name}`, folder: folderShips.id, side: { team: `team${t}` }, brain: 'full', stands: false, showName: true, onLeaderboard: true, onMinimap: true, minimapAll: true,
      names: ['Flagship'], portalKeep: 600, control: { word: 'mothership' },
      forms: [{ id: M.id(), name: 'Flagship', tank: 'flagship', colour: { use: 'team' }, tags: [M.ref(tag), M.ref(shipTag)] }] });
  }
  const d = drawingOf(drawingKey);
  const placed: PlacedEntity[] = [];
  const rules: Rule[] = [];
  if (d) {
    for (const s of drawingSites(d, teams)) if (s.kind === 'mothership' && s.side && s.side <= teams) placed.push({ id: M.id(), name: `${tags[s.side - 1].name}`, type: M.ref(types[s.side - 1]), cx: s.cx, cy: s.cy });
  } else {
    for (let t = 1; t <= Math.min(teams, PORTAL_SHIPS.length); t++) placed.push({ id: M.id(), name: tags[t - 1].name, type: M.ref(types[t - 1]), cx: PORTAL_SHIPS[t - 1][0], cy: PORTAL_SHIPS[t - 1][1] });
  }
  for (let t = 1; t <= teams; t++) {
    const cap = teamCaps(t, teams);
    rules.push(M.rule(folderShips, `The ${tags[t - 1].name} Falls`, [M.row('body.died', { who: { types: [M.ref(types[t - 1])] } satisfies BodyTest })], [], [M.say(`${cap}'s mothership has been killed!`)]));
    const others: Row[] = [];
    for (let o = 1; o <= teams; o++) if (o !== t) others.push(M.row('cmp', { a: { f: `{${tags[o - 1].id}}` }, op: 'eq', b: 0 }));
    rules.push(M.rule(folderWin, `${cap} Wins`, tags.filter((_, o) => o !== t - 1).map(tag => M.row('count.crossed', { tag: M.ref(tag), n: 0, dir: 'fallsTo' })),
      [M.row('cmp', { a: { f: `{${tags[t - 1].id}}` }, op: 'ge', b: 1 }), ...others],
      [M.row('wait', { seconds: 2.5 }), M.say(`${cap} HAS WON THE GAME!`), M.row('match.end', { result: 'win', team: `team${t}`, then: 'closeArena' })], { once: true }));
  }
  const roles = roleRules(M, folderBots, shipTag, shipTag, { guardShare: 35 });
  rules.push(...roles.rules);
  return M.done({ v: 1, nextId: 1, meta: { title: 'Mothership', seed: 'match', shipped: 'mothership' }, tags: [...tags, shipTag], folders: [folderShips, folderWin, folderBots], types, placed, rules, statuses: roles.statuses } as MapEventsDoc);
}

function tagWorld(world: string | undefined, teams: number): MissingWorld {
  const M = maker();
  const folderWin = M.named('Winning');
  const maze = typeof world === 'string' && world.startsWith('open-maze');
  const rules: Rule[] = [];
  for (let t = 1; t <= teams; t++) {
    const cap = teamCaps(t, teams);
    const others: Row[] = [];
    for (let o = 1; o <= teams; o++) if (o !== t) others.push(M.row('cmp', { a: { f: `side${o}` }, op: 'eq', b: 0 }));
    rules.push(M.rule(folderWin, `${cap} Wins`, [M.row('body.died', {}), M.row('player.died', {})], [M.row('cmp', { a: { f: `side${t}` }, op: 'ge', b: 1 }), ...others],
      [M.say(`${cap} HAS WON THE GAME!`), M.row('match.end', { result: 'win', team: `team${t}`, then: 'closeArena' })], { once: true }));
  }
  return M.done({
    v: 1, nextId: 1, meta: { title: 'Tag', seed: 'match', shipped: 'tag' },
    match: { killsTurnSides: true, ...(maze ? {} : { shrink: { after: MISSING.TAG_SHRINK_AFTER, minutes: MISSING.TAG_SHRINK_MINUTES, to: MISSING.TAG_SHRINK_TO } }) },
    rules: [M.rule(folderWin, 'The Teams On The Leaderboard', [M.row('match.started', {})], [], [M.row('lb.teams', { on: true, title: 'TEAMS', goal: 0, unit: 'Players', unitOne: 'Player', count: 'tanks' })]), ...rules],
    folders: [folderWin],
  } as unknown as MapEventsDoc);
}

function clanWarsWorld(): MissingWorld {
  const M = maker();
  return M.done({ v: 1, nextId: 1, meta: { title: 'Clan Wars', seed: 'match', shipped: 'clan-wars' }, match: { clans: { min: MISSING.CLANS_MIN, max: MISSING.CLANS_MAX } } } as unknown as MapEventsDoc);
}

function ctfWorld(drawingKey: string | undefined): MissingWorld {
  const M = maker();
  const d = drawingOf(drawingKey);
  const folderPosts = M.named('Outposts'), folderFlags = M.named('Flags'), folderWin = M.named('Winning');
  const sideTags = [M.named('Blue Outpost'), M.named('Green Outpost')];
  const postTag = M.named('Outpost'), folderBots = M.named('Bots');
  const R941_ON = SMALL_FIX.R941 !== 0;
  const flagTag = R941_ON ? M.named('Flag') : null;
  const allOutTag = R941_ON ? M.named('Has Given All Its Flags') : null;
  const allOut = allOutTag ? { ...M.named('Has Given All Its Flags'), seconds: null, effects: [M.row('tag', { tag: M.ref(allOutTag) }), M.row('leftAlone', {})] } : null;
  const tags: Named[] = [...sideTags, postTag, ...(flagTag ? [flagTag] : []), ...(allOutTag ? [allOutTag] : [])];
  const types: EntityType[] = [], flags: EntityType[] = [];
  const postType = (t: number, name: string, own: Named): EntityType => {
    const standing = M.id();
    const tt: EntityType = { id: M.id(), name, folder: folderPosts.id, side: { team: `team${t}` }, stands: true, showName: false, onLeaderboard: false, onMinimap: true, minimapAll: true, canBeHealed: false, names: [name],
      killLine: R941_ON ? 'You killed a Dominator.' : `You killed ${t === 1 ? 'BLUE' : 'GREEN'} Outpost.`,
      forms: [{ id: standing, name: 'Standing', tank: 'dominator', colour: { use: 'team' }, tags: [M.ref(sideTags[t - 1]), M.ref(postTag), M.ref(own)], onDeath: { to: standing, team: 'form' } }] };
    types.push(tt);
    return tt;
  };
  for (let t = 1; t <= 2; t++) {
    flags.push({ id: M.id(), name: `${t === 1 ? 'Blue' : 'Green'} Flag`, folder: folderFlags.id, side: { team: `team${t}`, camp: 'shape' }, brain: 'none', stands: false, canDie: true, seenByBots: true, onLeaderboard: false, onMinimap: true, minimapAll: true,
      countsAsKill: false, worth: 'none', showName: false, contact: 'shape', pushable: false, crashersIgnore: true, canBeHealed: false,
      ...(R941_ON
        ? { shape: { thrown: CTF_FLAG.THROWN, keep: CTF_FLAG.KEEP, spin: CTF_FLAG.SPIN, health: CTF_FLAG.HEALTH, bornWhole: true },
            carry: { line: 'You have picked up a flag!', by: 'kill', one: true, follow: { ...CTF_FLAG.FOLLOW } },
            touch: [{ id: M.id(), what: 'shapes', then: 'damage', amount: CTF_FLAG.SHAPE_HURT_PCT, unit: 'pct', per: 'second' }] }
        : { shape: { thrown: 165, keep: 0.01, spin: -175 },
            carry: { line: 'You have picked up a flag!' },
            touch: [{ id: M.id(), what: 'walls', then: 'die' }] }),
      forms: [{ id: M.id(), name: 'Flag', tank: 'other:data-data/Others/Game Objects/flag.json', colour: { use: 'team' } }] } as unknown as EntityType);
  }
  const placed: PlacedEntity[] = [];
  const bases: ZoneLike[] = [];
  const rules: Rule[] = [];
  if (d) {
    for (const bz of d.bases) bases[bz.team - 1] = BASE_AREAS.ON !== 0
      ? M.area(`${bz.team === 1 ? 'Blue' : 'Green'} Base`, bz, { opacity: 0, team: bz.team - 1, modeBase: true }, [M.row('teamBase', { team: `team${bz.team}` })])
      : M.area(`${bz.team === 1 ? 'Blue' : 'Green'} Base`, bz, { opacity: 0 }, []);
    for (const st of drawingSites(d, 2)) {
      if (st.kind !== 'outpost' || !st.side) continue;
      const t = st.side, cap = t === 1 ? 'BLUE' : 'GREEN';
      const name = `The ${st.name} ${cap} Outpost`;
      const own = M.named(`${st.name} ${t === 1 ? 'Blue' : 'Green'} Outpost`), flagOf = M.named(`Flag Of ${st.name} ${t === 1 ? 'Blue' : 'Green'}`);
      tags.push(own, flagOf);
      const z = M.area(`${own.name} Tile`, { gx: Math.floor(st.cx - 1), gy: Math.floor(st.cy - 1), cw: 2, ch: 2 }, { colorMap: teamSlot(t, 2), opacity: 0.3, clearWalls: true }, []);
      const pt = postType(t, name, own);
      const p: PlacedEntity = { id: M.id(), name, type: M.ref(pt), cx: st.cx, cy: st.cy, home: M.zref(z) };
      placed.push(p);
      const isPost: BodyTest = { types: [M.ref(pt)] };
      rules.push(
        M.rule(folderPosts, `${own.name} Gives Up A Flag`, [M.row('body.changed', { who: isPost, how: 'become' })], [], R941_ON ? [
          M.row('if', { cond: [M.row('cmp', { a: { f: `{${flagOf.id}}` }, op: 'lt', b: CTF_FLAG.PER_POST })], then: [
            M.say('{name} has been compromised!'),
            M.row('spawn', { what: [{ id: M.id(), type: M.ref(flags[t - 1]), weight: 1 }], count: { f: `${CTF_FLAG.PER_POST} - {${flagOf.id}}` }, at: { w: 'point', cx: st.cx, cy: st.cy }, tags: [M.ref(flagOf), M.ref(own), M.ref(flagTag!)], spread: CTF_FLAG.SPREAD }),
          ], else: [M.row('status.add', { who: { w: 'entity', ref: M.ref(p) }, status: M.ref(allOut!) })] }),
        ] : [
          M.say('{name} has been compromised!'),
          M.row('spawn', { what: [{ id: M.id(), type: M.ref(flags[t - 1]), weight: 1 }], count: 1, at: { w: 'point', cx: st.cx, cy: st.cy }, tags: [M.ref(flagOf), M.ref(own)] }),
        ]),
        ...(allOut ? [
          M.rule(folderPosts, `${own.name} Has Given All Its Flags`, [M.row('count.crossed', { tag: M.ref(flagOf), n: CTF_FLAG.PER_POST, dir: 'risesTo' })], [M.row('alive', { who: { w: 'entity', ref: M.ref(p) } })], [M.row('status.add', { who: { w: 'entity', ref: M.ref(p) }, status: M.ref(allOut) })]),
          M.rule(folderPosts, `${own.name} Has A Flag To Give`, [M.row('count.crossed', { tag: M.ref(flagOf), n: CTF_FLAG.PER_POST - 1, dir: 'fallsTo' })], [M.row('alive', { who: { w: 'entity', ref: M.ref(p) } })], [M.row('status.remove', { who: { w: 'entity', ref: M.ref(p) }, status: M.ref(allOut) })]),
        ] : []),
        ...(bases[2 - t] ? [M.rule(folderFlags, `${own.name} Is Destroyed`, [M.row('area.entered', { area: M.zref(bases[2 - t]), who: { tags: [M.ref(flagOf)] } satisfies BodyTest })], [M.row('alive', { who: { w: 'entity', ref: M.ref(p) } })], [
          M.say(`${name} has been destroyed!`),
          M.row('remove', { who: { w: 'entity', ref: M.ref(p) } }),
          M.row('remove', { who: { w: 'tag', ref: M.ref(flagOf) } }),
          M.row('area.paint', { area: M.zref(z), slot: 16, opacity: 0.3 }),
        ], { once: true })] : []),
      );
    }
  }
  for (let t = 1; t <= 2; t++) {
    const cap = t === 1 ? 'BLUE' : 'GREEN';
    rules.push(M.rule(folderWin, `${cap} Wins`, [M.row('count.crossed', { tag: M.ref(sideTags[2 - t]), n: 0, dir: 'fallsTo' })], [], [M.say(`${cap} HAS WON THE GAME!`), M.row('match.end', { result: 'win', team: `team${t}`, then: 'closeArena' })], { once: true }));
  }
  const roles = roleRules(M, folderBots, postTag, postTag, { guardShare: 35 });
  rules.push(...roles.rules);
  const statuses = [...roles.statuses, ...(allOut ? [allOut] : [])];
  if (flagTag) {
    const att = statuses.find(x => x.name === 'Attacks Objectives');
    if (att) att.effects = [...att.effects, M.row('escortTag', { tag: M.ref(flagTag), max: 3, radius: 450 })];
    const plays = { ...M.named('Plays For The Flags'), seconds: null, effects: [M.row('spoilTag', { tag: M.ref(flagTag) }), M.row('takeTag', { tag: M.ref(flagTag) })] };
    statuses.push(plays);
    rules.push(M.rule(folderBots, 'Every Bot Plays For The Flags', [M.row('bot.joined', { who: { boss: false } satisfies BodyTest })], [], [M.row('status.add', { who: { w: 'subject' }, status: M.ref(plays) })]));
  }
  return M.done({ v: 1, nextId: 1, meta: { title: 'Capture the Flag', seed: 'match', shipped: 'ctf' }, tags, folders: [folderPosts, folderFlags, folderWin, folderBots], types: [...types, ...flags], placed, rules, statuses } as MapEventsDoc);
}

function labyrinthWorld(drawingKey: string | undefined): MissingWorld {
  const M = maker();
  const d = drawingOf(drawingKey);
  void d;
  const exitArea = M.area('Exit Portals', { gx: 9, gy: 9, cw: 47, ch: 21 }, { opacity: 0 }, []);
  return M.done({ v: 1, nextId: 1, meta: { title: 'Labyrinth', seed: 'match', shipped: 'labyrinth' }, match: { dreadnoughts: MISSING.DREAD_SHARE_LABYRINTH } } as unknown as MapEventsDoc,
    { enablePortals: true, portalCount: 1, portalKinds: [{ portalId: 0, kind: 'blackHole', inArea: exitArea.uid, toMode: 'nexus', ...themeOf(PORTAL_SLOT.PINK) }], portalTimings: [{ portalId: 0, timed: true, appearDuration: MISSING.POINT_ON * 1000, disappearDuration: 90000, initialDelay: 60000 }],
      portalBotOdds: [{ portalId: 0, odds: 80, highLevel: MISSING.FORGE_LEVEL, oddsHigh: MISSING.SEEK_ODDS, dreadShare: MISSING.DREAD_LEAVE_SHARE }],
      wallPaint: { slot: 9, opacity: MISSING.LABY_WALL_OPACITY }, wallBlocks: true } as Partial<MapConfig>);
}

function themeOf(slot: number): { theme: true; themeUseMap: true; themeMap: number } { return { theme: true, themeUseMap: true, themeMap: slot }; }
export const PORTAL_SLOT = { ORANGE: 2, HEXAGONS: 4, PINK: 5, GREY: 7, WHITE: 8, BLUE: 10, GREEN: 11, RED: 12, YELLOW: 13, PENTAGONS: 14, PURPLE: 15 } as const;
const NEXUS_PORTAL_SLOTS: readonly number[] = [PORTAL_SLOT.ORANGE, PORTAL_SLOT.BLUE, PORTAL_SLOT.GREEN, PORTAL_SLOT.RED, PORTAL_SLOT.PURPLE, PORTAL_SLOT.YELLOW,
  PORTAL_SLOT.HEXAGONS, PORTAL_SLOT.PENTAGONS, PORTAL_SLOT.PINK, PORTAL_SLOT.GREY, PORTAL_SLOT.WHITE];

function nexusWorld(): MissingWorld {
  const M = maker();
  const west = M.area('West Room Portals', { gx: 3, gy: 6, cw: 2, ch: 5 }, { opacity: 0 }, []);
  const east = M.area('East Room Portals', { gx: 14, gy: 6, cw: 2, ch: 5 }, { opacity: 0 }, []);
  const south = M.area('South Room Portals', { gx: 7, gy: 14, cw: 5, ch: 2 }, { opacity: 0 }, []);
  const laby = M.area('Labyrinth Room Portal', { gx: 3, gy: 14, cw: 1, ch: 2 }, { opacity: 0 }, []);
  const forge = M.area('Forge Room Portal', { gx: 15, gy: 14, cw: 1, ch: 2 }, { opacity: 0 }, []);
  M.area('Labyrinth Gate', { gx: 3, gy: 12, cw: 1, ch: 1 }, { colorMap: 12, opacity: 0.3 }, []);
  M.area('Building', { gx: 2, gy: 5, cw: 15, ch: 12 }, { opacity: 0 }, [M.row('peace', {}), M.row('spawnPlace', { teams: ['team1', 'team5', 'player'], enabledAtStart: true })]);
  const outside = M.area('Outside', { gx: 0, gy: 0, cw: 23, ch: 4 }, { opacity: 0 }, [M.row('keepOut', { chance: MISSING.NEXUS_CROSS, hold: MISSING.NEXUS_CROSS_HOLD })]);
  (outside as unknown as { more: { gx: number; gy: number; cw: number; ch: number }[] }).more = [
    { gx: 0, gy: 4, cw: 1, ch: 15 }, { gx: 18, gy: 4, cw: 5, ch: 15 }, { gx: 1, gy: 18, cw: 17, ch: 1 }, { gx: 10, gy: 4, cw: 1, ch: 1 }];
  const gunType = { id: M.id(), name: 'Anti Tank Machine Gun', side: { team: 'ffa' }, stands: true, canDie: false, brain: 'full', seenByBots: false, showName: false, onLeaderboard: false, onMinimap: true,
    countsAsKill: false, worth: 'none', forms: [{ id: M.id(), name: 'Gun', tank: 'antiTankMachineGun', colour: { use: 'slot', slot: 12 } }] };
  const placed = [{ id: M.id(), name: 'Anti Tank Machine Gun', type: M.ref(gunType), cx: 2.5, cy: 2.5 }];
  M.area('Forge Gate', { gx: 13, gy: 15, cw: 1, ch: 1 }, { colorMap: 12, opacity: 0.3 }, [M.row('bounce', { strength: 1, whitelist: [], minLevel: MISSING.FORGE_LEVEL,
    line: `You must be at least level ${MISSING.FORGE_LEVEL} to enter this area! Try going through a portal, getting level ${MISSING.FORGE_LEVEL}, and then coming back through another portal.` })]);
  const point = (i: number, z: ZoneLike, toMode: string) => ({ portalId: i, kind: 'blackHole' as const, inArea: z.uid, toMode, ...themeOf(NEXUS_PORTAL_SLOTS[i]) });
  const timing = (i: number, delay: number) => ({ portalId: i, timed: true, appearDuration: MISSING.POINT_ON * 1000, disappearDuration: MISSING.POINT_OFF * 1000, initialDelay: delay });
  const rooms = [west, west, west, east, east, east, south, south, south];
  const kinds = rooms.map((z, i) => point(i, z, 'random'));
  kinds.push(point(9, laby, 'labyrinth'), point(10, forge, 'forge'));
  const timings = kinds.map((_, i) => timing(i, i < 9 ? (i % 3) * 20000 + Math.floor(i / 3) * 3000 : 0));
  return M.done({ v: 1, nextId: 1, meta: { title: 'Nexus', seed: 'match', shipped: 'nexus' }, types: [gunType], placed,
    match: { food: false, ambientCrashers: false, ambientBosses: false, ambientSentries: false, ambientSentinels: false, travellers: { min: 5, max: 15 }, startAged: MISSING.NEXUS_AGE_MIN } } as unknown as MapEventsDoc,
    { enablePortals: true, portalCount: kinds.length, portalKinds: kinds, portalTimings: timings,
      portalLevels: [{ portalId: 10, requireLevel: MISSING.FORGE_LEVEL }],
      portalBotOdds: [{ portalId: 10, odds: MISSING.SEEK_ODDS, known: true, dreadShare: 0 }] } as Partial<MapConfig>);
}

function forgeWorld(): MissingWorld {
  const M = maker();
  const ring = M.area('Portal Ring', { gx: 3, gy: 3, cw: 18, ch: 18 }, { opacity: 0 }, []);
  const timing = (i: number, delay: number) => ({ portalId: i, timed: true, appearDuration: MISSING.POINT_ON * 1000, disappearDuration: MISSING.POINT_OFF * 1000, initialDelay: delay });
  return M.done({ v: 1, nextId: 1, meta: { title: 'Forge', seed: 'match', shipped: 'forge' }, match: { ambientBosses: false, ambientSentries: false, ambientSentinels: false, forge: true, travellers: { min: 0, max: 6 } } } as unknown as MapEventsDoc,
    { enablePortals: true, portalCount: 4,
      portalKinds: [{ portalId: 0, kind: 'blackHole', inArea: ring.uid, toMode: 'nexus', ...themeOf(PORTAL_SLOT.PINK) }, { portalId: 1, kind: 'blackHole', inArea: ring.uid, toMode: 'labyrinth', ...themeOf(PORTAL_SLOT.GREY) },
        { portalId: 2, kind: 'blackHole', inArea: ring.uid, toMode: 'random', ...themeOf(PORTAL_SLOT.ORANGE) }, { portalId: 3, kind: 'blackHole', inArea: ring.uid, toMode: 'random', ...themeOf(PORTAL_SLOT.BLUE) }],
      portalTimings: [timing(0, 0), timing(1, 5000), timing(2, 10000), timing(3, 15000)] } as Partial<MapConfig>);
}

export function buildMissingWorld(word: string, world: string | undefined, drawing: string | undefined, teams: number): MissingWorld | null {
  switch (word) {
    case 'mothership': return mothershipWorld(drawing, teams);
    case 'tag': return tagWorld(world, teams);
    case 'clan-wars': return clanWarsWorld();
    case 'ctf': return ctfWorld(drawing);
    case 'labyrinth': return labyrinthWorld(drawing);
    case 'nexus': return nexusWorld();
    case 'forge': return forgeWorld();
    default: return null;
  }
}
