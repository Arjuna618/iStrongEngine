import type { BodyTest, EntityType, Id, MapEventsDoc, Named, PlacedEntity, Ref, Row, Rule, StatusDef, TimerDef, VarDef, ZoneLike } from '../doc';
import { drawingOf, drawingSites, type DrawnSite } from '../../modeDrawings';


const SLOT_NEUTRAL = 3, SLOT_BLUE = 10, SLOT_GREEN = 11, SLOT_RED = 12, SLOT_PURPLE = 15;
export function teamSlot(team: number, teams: number): number {
  return team === 1 ? SLOT_BLUE : team === 2 ? (teams === 2 ? SLOT_GREEN : SLOT_RED) : team === 3 ? SLOT_GREEN : SLOT_PURPLE;
}
export function teamCaps(team: number, teams: number): string {
  return team === 1 ? 'BLUE' : team === 2 ? (teams === 2 ? 'GREEN' : 'RED') : team === 3 ? 'GREEN' : 'PURPLE';
}
const TILE_OPACITY = 0.3;
const ARMED = { list: [{ word: 'destroyerDominator', weight: 1 }, { word: 'gunnerDominator', weight: 1 }, { word: 'trapperDominator', weight: 1 }], when: 'oncePerSite' as const };

function maker() {
  let next = 1;
  const id = (): Id => next++;
  const named = (name: string): Named => ({ id: id(), name });
  const ref = (t: { id: Id; name?: string }): Ref => ({ id: t.id, n: t.name ?? '' });
  const row = (k: string, a: Record<string, unknown>): Row => ({ id: id(), k, a });
  const rule = (folder: Named, name: string, when: Row[], cond: Row[], then: Row[], more: Partial<Rule> = {}): Rule => ({ id: id(), name, folder: folder.id, when, cond, then, ...more });
  const say = (text: string) => row('say', { to: 'all', text });
  let zoneId = 1;
  const zones: ZoneLike[] = [];
  const tile = (name: string, s: DrawnSite, slot: number): ZoneLike => {
    const z = { id: zoneId++, uid: id(), name, gx: Math.floor(s.cx - 1), gy: Math.floor(s.cy - 1), cw: 2, ch: 2, team: 0, kind: 'cosmetic', colorMap: slot, opacity: TILE_OPACITY, clearWalls: true, behaviors: [] } as unknown as ZoneLike;
    zones.push(z);
    return z;
  };
  const zref = (z: ZoneLike): Ref => ({ id: z.uid!, n: z.name ?? '' });
  const area = (name: string, r: { gx: number; gy: number; cw: number; ch: number }, look: Record<string, unknown>, behaviors: Row[]): ZoneLike => {
    const z = { id: zoneId++, uid: id(), name, ...r, team: 0, kind: 'cosmetic', behaviors, ...look } as unknown as ZoneLike;
    zones.push(z);
    return z;
  };
  return { id, named, ref, row, rule, say, tile, area, zref, zones, nextId: () => next, zoneNext: () => zoneId };
}

export interface ObjectiveWorld { events: MapEventsDoc; mapAreas: { nextId: number; zones: ZoneLike[] } }

export const ROLES = { GUARD_RADIUS: 900, GUARD_SHARE_EVEN: 40 } as const;
export function roleRules(M: { id: () => Id; named: (n: string) => Named; ref: (t: { id: Id; name?: string }) => Ref; row: (k: string, a: Record<string, unknown>) => Row; rule: (f: Named, n: string, w: Row[], c: Row[], t: Row[], m?: Partial<Rule>) => Rule },
  folder: Named, guardTag: Named, attackTag: Named, sides: { guard?: string[]; attack?: string[]; guardShare?: number }): { statuses: StatusDef[]; rules: Rule[] } {
  const guards: StatusDef = { ...M.named('Guards Its Objectives'), seconds: null, effects: [M.row('guardTag', { tag: M.ref(guardTag), radius: ROLES.GUARD_RADIUS }), M.row('teamFight', { help: true })] };
  const attacks: StatusDef = { ...M.named('Attacks Objectives'), seconds: null, effects: [M.row('attackTag', { tag: M.ref(attackTag) }), M.row('teamFight', { help: true })] };
  const give = (s: StatusDef) => M.row('status.add', { who: { w: 'subject' }, status: M.ref(s) });
  const rules: Rule[] = [];
  if (sides.guard || sides.attack) {
    if (sides.guard) rules.push(M.rule(folder, 'Defenders Guard', [M.row('bot.joined', { who: { boss: false, teams: sides.guard } satisfies BodyTest })], [], [give(guards)]));
    if (sides.attack) rules.push(M.rule(folder, 'Attackers Attack', [M.row('bot.joined', { who: { boss: false, teams: sides.attack } satisfies BodyTest })], [], [give(attacks)]));
  } else {
    rules.push(M.rule(folder, 'Each Bot Guards Or Attacks', [M.row('bot.joined', { who: { boss: false } satisfies BodyTest })], [], [
      M.row('if', { cond: [M.row('chance', { pct: sides.guardShare ?? ROLES.GUARD_SHARE_EVEN })], then: [give(guards)], else: [give(attacks)] }),
    ]));
  }
  return { statuses: [guards, attacks], rules };
}

function paintBySide(M: ReturnType<typeof maker>, teams: number): Row[] {
  const out: Row[] = [];
  for (let t = 1; t <= teams; t++) {
    out.push(M.row('if', { cond: [M.row('body.is', { who: { w: 'subject' }, is: { teams: [`team${t}`] } satisfies BodyTest })], then: [M.row('area.paint', { homeOf: { w: 'subject' }, slot: teamSlot(t, teams), opacity: TILE_OPACITY })], else: [] }));
  }
  return out;
}

export function dominationNeeded(sites: number, teams: number): number { return teams <= 2 ? sites : Math.min(sites, 3); }

export function buildDominationWorld(drawingKey: string, teams: number): ObjectiveWorld | null {
  const d = drawingOf(drawingKey);
  if (!d) return null;
  const sites = drawingSites(d, teams).filter(s => s.kind === 'dominator');
  const M = maker();
  const folderMap = M.named('Dominators'), folderWin = M.named('Winning');
  const neutralTag = M.named('Neutral Dominator'), takenTag = M.named('Taken Dominator'), anyTag = M.named('Dominator');
  const folderBots = M.named('Bots');
  const neutralForms: Ref[] = [], takenForms: Ref[] = [];
  const types: EntityType[] = sites.map(s => {
    const nId = M.id(), tId = M.id();
    neutralForms.push({ id: nId, n: 'Neutral' }); takenForms.push({ id: tId, n: 'Taken' });
    return {
      id: M.id(), name: `${s.name} Dominator`, folder: folderMap.id, side: { team: 'ffa' }, stands: true, showName: false, onLeaderboard: false, onMinimap: true, minimapAll: true, names: [`${s.name} Dominator`],
      control: { word: 'dominator' },
      forms: [
        { id: nId, name: 'Neutral', tank: ARMED, side: { team: 'ffa' }, colour: { use: 'slot', slot: SLOT_NEUTRAL }, tags: [M.ref(neutralTag), M.ref(anyTag)],
          onDeath: { to: tId, team: 'killer', fallbackTeam: 'ffa' } },
        { id: tId, name: 'Taken', tank: ARMED, colour: { use: 'team' }, tags: [M.ref(takenTag), M.ref(anyTag)], onDeath: { to: nId, team: 'form' } },
      ],
    } as EntityType;
  });
  const placed: PlacedEntity[] = sites.map((s, i) => {
    const z = M.tile(`${s.name} Dominator Tile`, s, SLOT_NEUTRAL);
    return { id: M.id(), name: `${s.name} Dominator`, type: M.ref(types[i]), cx: s.cx, cy: s.cy, home: M.zref(z) };
  });
  const isDom: BodyTest = { types: types.map(t => M.ref(t)) };
  const teamWords = Array.from({ length: teams }, (_, i) => `team${i + 1}`);
  const need = dominationNeeded(sites.length, teams);
  const rules: Rule[] = [
    ...takenForms.map(tf => M.rule(folderMap, 'A Dominator Is Taken', [M.row('body.changed', { who: isDom, to: tf, how: 'become' })], [], [
      M.row('if', { cond: [M.row('body.is', { who: { w: 'subject' }, is: { teams: teamWords } satisfies BodyTest })],
        then: [M.say('The {name} is now controlled by {TEAM}'), ...paintBySide(M, teams)],
        else: [M.row('become', { who: { w: 'subject' }, form: neutralForms[takenForms.indexOf(tf)] })] }),
    ])),
    ...neutralForms.map(nf => M.rule(folderMap, 'A Dominator Turns Neutral', [M.row('body.changed', { who: isDom, to: nf, how: 'become' })], [M.row('killer.is', { is: { teams: teamWords } satisfies BodyTest, none: false })], [
      M.say('A dominator is being contested!'),
      M.row('area.paint', { homeOf: { w: 'subject' }, slot: SLOT_NEUTRAL, opacity: TILE_OPACITY }),
    ])),
  ];
  for (let t = 1; t <= teams; t++) {
    rules.push(M.rule(folderWin, `${teamCaps(t, teams)} Wins`, [M.row('count.crossed', { tag: M.ref(takenTag), team: `team${t}`, n: need, dir: 'risesTo' })], [], [
      M.say(`${teamCaps(t, teams)} HAS WON THE GAME!`),
      M.row('match.end', { result: 'win', team: `team${t}`, then: 'closeArena' }),
    ], { once: true }));
  }
  const roles = roleRules(M, folderBots, takenTag, anyTag, {});
  rules.push(...roles.rules);
  const events: MapEventsDoc = {
    v: 1, nextId: 1,
    meta: { title: d.name, seed: 'match', shipped: `domination-${drawingKey}` },
    tags: [neutralTag, takenTag, anyTag], folders: [folderMap, folderWin, folderBots], types, placed, rules, statuses: roles.statuses,
  };
  events.nextId = M.nextId();
  return { events, mapAreas: { nextId: M.zoneNext(), zones: M.zones } };
}

export const ASSAULT = { CLOCK: 780, COMEBACK: 540, LOCKED_START: 1 } as const;
const MARKS = (from: number): number[] => {
  const m: number[] = [];
  for (let s = from - 60; s >= 60; s -= 60) m.push(s);
  m.push(50, 40, 30, 20);
  for (let s = 14; s >= 1; s--) m.push(s);
  return m;
};

export function buildAssaultWorld(drawingKey: string): ObjectiveWorld | null {
  const d = drawingOf(drawingKey);
  if (!d) return null;
  const sites = drawingSites(d, 2);
  const sanctSites = sites.filter(s => s.kind === 'sanctuary'), domSites = sites.filter(s => s.kind === 'dominator');
  const M = maker();
  const folderMap = M.named('Objectives'), folderLock = M.named('Locks'), folderClock = M.named('Green\'s Clock'), folderWin = M.named('Winning');
  const greenHolds = M.named('Green Holds'), standing = M.named('Standing Sanctuary'), blueDom = M.named('Blue Dominator');
  const folderBots = M.named('Bots');
  const locked: StatusDef = { ...M.named('Locked'), seconds: null, effects: [M.row('invulnerable', {})] };
  const lockedVar: VarDef = { ...M.named('Locked'), kind: 'onoff', start: domSites.length > 0 ? ASSAULT.LOCKED_START : 0, scope: 'match' };
  const minutesVar: VarDef = { ...M.named('Minutes Left'), kind: 'number', start: 13, scope: 'match' };
  const clock: TimerDef = { ...M.named('Green Wins In'), seconds: ASSAULT.CLOCK, marks: MARKS(ASSAULT.CLOCK) };
  const comeback: TimerDef = { ...M.named('Green Wins In Again'), seconds: ASSAULT.COMEBACK, marks: MARKS(ASSAULT.COMEBACK) };
  const sStand = M.id(), sFallen = M.id(), dGreen = M.id(), dBlue = M.id();
  const sanctuary: EntityType = {
    id: M.id(), name: 'Assault Sanctuary', folder: folderMap.id, side: { team: 'team2' }, stands: true, showName: false, onLeaderboard: false, onMinimap: true, minimapAll: true, canBeHealed: false,
    forms: [
      { id: sStand, name: 'Standing', tank: 'sanctuaryTier3', side: { team: 'team2' }, colour: { use: 'team' }, tags: [M.ref(standing), M.ref(greenHolds)], onDeath: { to: sFallen, team: 'form' } },
      { id: sFallen, name: 'Fallen', tank: 'dominator', side: { team: 'team1' }, colour: { use: 'team' }, onDeath: { to: sStand, team: 'form' } },
    ],
  };
  const dominator: EntityType = {
    id: M.id(), name: 'Assault Dominator', folder: folderMap.id, side: { team: 'team2' }, stands: true, showName: false, onLeaderboard: false, onMinimap: true, minimapAll: true,
    forms: [
      { id: dGreen, name: 'Green', tank: ARMED, side: { team: 'team2' }, colour: { use: 'team' }, tags: [M.ref(greenHolds)], onDeath: { to: dBlue, team: 'form' } },
      { id: dBlue, name: 'Blue', tank: 'dominator', side: { team: 'team1' }, colour: { use: 'team' }, tags: [M.ref(blueDom)], onDeath: { to: dGreen, team: 'form' } },
    ],
  };
  const placed: PlacedEntity[] = [];
  const sanctZones: ZoneLike[] = [];
  for (const s of sanctSites) {
    const z = M.tile(`Sanctuary ${placed.length + 1} Tile`, s, SLOT_GREEN);
    (z as unknown as { behaviors: Row[] }).behaviors = [M.row('spawnPlace', { teams: ['team2'], enabledAtStart: true })];
    sanctZones.push(z);
    placed.push({ id: M.id(), name: `Sanctuary ${placed.length + 1}`, type: M.ref(sanctuary), cx: s.cx, cy: s.cy, home: M.zref(z) });
  }
  for (const s of domSites) {
    const z = M.tile(`${s.name} Dominator Tile`, s, SLOT_GREEN);
    placed.push({ id: M.id(), name: `${s.name} Dominator`, type: M.ref(dominator), cx: s.cx, cy: s.cy, home: M.zref(z) });
  }
  const total = sanctSites.length + domSites.length;
  const half = Math.floor(total / 2);
  const isSanct: BodyTest = { types: [M.ref(sanctuary)] }, isDom: BodyTest = { types: [M.ref(dominator)] };
  const minuteLine = (): Row[] => [
    M.row('if', {
      cond: [M.row('cmp', { a: { f: 'seconds' }, op: 'ge', b: 60 })],
      then: [
        M.row('var.set', { var: M.ref(minutesVar), value: { f: 'floor(seconds / 60)' } }),
        M.row('if', { cond: [M.row('cmp', { a: { f: `{${minutesVar.id}}` }, op: 'eq', b: 1 })], then: [M.say('1 minute until GREEN wins!')], else: [M.say(`{${minutesVar.id}} minutes until GREEN wins!`)] }),
      ],
      else: [M.row('if', { cond: [M.row('cmp', { a: { f: 'seconds' }, op: 'eq', b: 1 })], then: [M.say('1 second until GREEN wins!')], else: [M.say('{seconds} seconds until GREEN wins!')] })],
    }),
  ];
  const greenWins = (): Row[] => [M.say('GREEN HAS WON THE GAME!'), M.row('timer.stop', { timer: M.ref(clock) }), M.row('timer.stop', { timer: M.ref(comeback) }), M.row('match.end', { result: 'win', team: 'team2', then: 'closeArena' })];
  const rules: Rule[] = [
    M.rule(folderMap, 'A Dominator Is Destroyed', [M.row('body.changed', { who: isDom, to: { id: dBlue, n: 'Blue' }, how: 'become' })], [], [M.say('A GREEN dominator has been destroyed!'), M.row('area.paint', { homeOf: { w: 'subject' }, slot: SLOT_BLUE, opacity: TILE_OPACITY })]),
    M.rule(folderMap, 'A Dominator Is Repaired', [M.row('body.changed', { who: isDom, to: { id: dGreen, n: 'Green' }, how: 'become' })], [], [M.say('A GREEN dominator has been repaired!'), M.row('area.paint', { homeOf: { w: 'subject' }, slot: SLOT_GREEN, opacity: TILE_OPACITY })]),
    M.rule(folderMap, 'A Sanctuary Is Destroyed', [M.row('body.changed', { who: isSanct, to: { id: sFallen, n: 'Fallen' }, how: 'become' })], [], [
      M.say('A GREEN sanctuary has been destroyed!'), M.row('area.paint', { homeOf: { w: 'subject' }, slot: SLOT_BLUE, opacity: TILE_OPACITY }), M.row('area.behaviors', { homeOf: { w: 'subject' }, kind: 'spawnPlace', on: false })]),
    M.rule(folderMap, 'A Sanctuary Is Repaired', [M.row('body.changed', { who: isSanct, to: { id: sStand, n: 'Standing' }, how: 'become' })], [], [
      M.say('A GREEN sanctuary has been repaired!'), M.row('area.paint', { homeOf: { w: 'subject' }, slot: SLOT_GREEN, opacity: TILE_OPACITY }), M.row('area.behaviors', { homeOf: { w: 'subject' }, kind: 'spawnPlace', on: true }),
      M.row('if', { cond: [M.row('cmp', { a: { f: `{${lockedVar.id}}` }, op: 'eq', b: 1 })], then: [M.row('status.add', { who: { w: 'subject' }, status: M.ref(locked) })], else: [] })]),
    M.rule(folderClock, 'Green\'s Clock Starts', [M.row('match.started', {})], [], [M.row('timer.start', { timer: M.ref(clock) })]),
    M.rule(folderClock, 'Green\'s Clock Ticks', [M.row('timer.tick', { timer: M.ref(clock) })], [], minuteLine()),
    M.rule(folderClock, 'Green\'s Clock Ticks Again', [M.row('timer.tick', { timer: M.ref(comeback) })], [], minuteLine()),
    M.rule(folderWin, 'Green Holds Out', [M.row('timer.ended', { timer: M.ref(clock) })], [], greenWins(), { once: true }),
    M.rule(folderWin, 'Green Holds Out Again', [M.row('timer.ended', { timer: M.ref(comeback) })], [], greenWins(), { once: true }),
    M.rule(folderClock, 'Green Bases Are Down', [M.row('count.crossed', { tag: M.ref(greenHolds), n: half, dir: 'fallsTo' })], [], [
      M.say('GREEN bases are down.'), M.row('timer.stop', { timer: M.ref(clock) }), M.row('timer.stop', { timer: M.ref(comeback) })]),
    M.rule(folderClock, 'Green Holds Again', [M.row('count.crossed', { tag: M.ref(greenHolds), n: half + 1, dir: 'risesTo' })], [], [M.row('timer.start', { timer: M.ref(comeback) })]),
    M.rule(folderWin, 'Blue Wins', [M.row('count.crossed', { tag: M.ref(standing), n: 0, dir: 'fallsTo' })], [], [
      M.say('BLUE HAS WON THE GAME!'), M.row('timer.stop', { timer: M.ref(clock) }), M.row('timer.stop', { timer: M.ref(comeback) }), M.row('match.end', { result: 'win', team: 'team1', then: 'closeArena' })], { once: true }),
  ];
  if (domSites.length > 0) {
    const unlockAt = Math.ceil(domSites.length / 2);
    rules.push(
      M.rule(folderLock, 'The Sanctuaries Start Locked', [M.row('match.started', {})], [], [M.row('status.add', { who: { w: 'tag', ref: M.ref(standing) }, status: M.ref(locked) })]),
      M.rule(folderLock, 'The Sanctuaries Unlock', [M.row('count.crossed', { tag: M.ref(blueDom), n: unlockAt, dir: 'risesTo' })], [M.row('cmp', { a: { f: `{${lockedVar.id}}` }, op: 'eq', b: 1 })], [
        M.row('var.set', { var: M.ref(lockedVar), value: 0 }), M.row('status.remove', { who: { w: 'tag', ref: M.ref(standing) }, status: M.ref(locked) }), M.say('The sanctuary has been unlocked!')]),
      M.rule(folderLock, 'The Sanctuaries Lock Again', [M.row('count.crossed', { tag: M.ref(greenHolds), n: total, dir: 'risesTo' })], [M.row('cmp', { a: { f: `{${lockedVar.id}}` }, op: 'eq', b: 0 })], [
        M.row('var.set', { var: M.ref(lockedVar), value: 1 }), M.row('status.add', { who: { w: 'tag', ref: M.ref(standing) }, status: M.ref(locked) }), M.say('The sanctuary has been locked!')]),
    );
  }
  const roles = roleRules(M, folderBots, greenHolds, greenHolds, { guard: ['team2'], attack: ['team1'] });
  rules.push(...roles.rules);
  const events: MapEventsDoc = {
    v: 1, nextId: 1,
    meta: { title: d.name, seed: 'match', shipped: `assault-${drawingKey}` },
    tags: [greenHolds, standing, blueDom], folders: [folderMap, folderLock, folderClock, folderWin, folderBots], types: [sanctuary, dominator], placed, rules,
    vars: [lockedVar, minutesVar], timers: [clock, comeback], statuses: [locked, ...roles.statuses],
  };
  void sanctZones;
  events.nextId = M.nextId();
  return { events, mapAreas: { nextId: M.zoneNext(), zones: M.zones } };
}
