import type { MapEventsDoc, ZoneLike } from '../doc';
import { EVENTS_DOC_VERSION } from '../doc';
import { magicMazeDoc, magicMazeAreas } from './magicMaze';
import { buildDominationWorld, buildAssaultWorld } from './objectives';
import { buildMissingWorld } from './missingModes';
import { MODE_WORLDS, isWorldId } from '../../modeWorlds';
import { BASE_AREAS, teamBaseRow } from '../../baseAreas';
export const OVERLAY_WORDS = ['blackout', 'outbreak', 'soccer', 'magic-maze',
  'domination', 'assault', 'mothership', 'tag', 'clan-wars', 'ctf', 'labyrinth', 'nexus', 'forge'] as const;
export type OverlayWord = typeof OVERLAY_WORDS[number];
export function isOverlayWord(w: unknown): w is OverlayWord { return typeof w === 'string' && (OVERLAY_WORDS as readonly string[]).includes(w); }

function blackoutDoc(): MapEventsDoc {
  return {
    v: EVENTS_DOC_VERSION,
    nextId: 10,
    rules: [{
      id: 1, name: 'Blackout: the lights go out',
      when: [{ id: 2, k: 'match.started', a: {} }],
      cond: [],
      then: [{ id: 3, k: 'darkness', a: { where: 'map', on: true, fade: 0 } }],
    }],
  } as unknown as MapEventsDoc;
}

export const OUTBREAK = { GREY_SECONDS: 3, GREY_DAMAGE_PCT: 10, ZOMBIE_SPEED_PCT: 75, ZOMBIE_PUSH_PCT: 50, END_ASK_SECONDS: 0.25 } as const;
const SLOT_GREY = 16, SLOT_GREEN = 11;

function outbreakDoc(): MapEventsDoc {
  const ZOMBIE = { id: 11, name: 'Zombie' }, FOLLOWER = { id: 12, name: 'Follower' };
  const GREY = { id: 21, name: 'Grey Body' }, RISEN = { id: 22, name: 'Zombie' }, FOLLOW = { id: 23, name: 'Follower' }, TURNED = { id: 24, name: 'Turned' };
  const ref = (t: { id: number; name: string }) => ({ id: t.id, n: t.name });
  const NECRO = ['necromancer'];
  const rise = (base: number, who: unknown) => [
    { id: base, k: 'copy.of', a: { who, side: 'zombies', tags: [ref(ZOMBIE)] } },
    { id: base + 1, k: 'status.add', a: { who: { w: 'lastSpawned' }, status: ref(GREY) } },
    { id: base + 2, k: 'wait', a: { seconds: OUTBREAK.GREY_SECONDS } },
    { id: base + 3, k: 'status.add', a: { who: { w: 'lastSpawned' }, status: ref(RISEN) } },
  ];
  const turnFollowers = (base: number) => [{ id: base, k: 'forEach', a: { who: { w: 'followers' }, wait: false, do: [
    { id: base + 1, k: 'setTeam', a: { who: { w: 'subject' }, team: 'zombies' } },
    { id: base + 2, k: 'status.remove', a: { who: { w: 'subject' }, status: ref(FOLLOW) } },
    { id: base + 3, k: 'status.add', a: { who: { w: 'subject' }, status: ref(TURNED) } },
    { id: base + 4, k: 'status.add', a: { who: { w: 'subject' }, status: ref(RISEN) } },
  ] } }];
  return {
    v: EVENTS_DOC_VERSION,
    nextId: 400,
    match: { killsPay: 'risen', shareRoom: true },
    tags: [ZOMBIE, FOLLOWER],
    statuses: [
      { id: GREY.id, name: GREY.name, seconds: OUTBREAK.GREY_SECONDS, effects: [
        { id: 31, k: 'colour', a: { slot: SLOT_GREY } }, { id: 32, k: 'damageBy', a: { pct: OUTBREAK.GREY_DAMAGE_PCT } },
        { id: 33, k: 'speedBy', a: { pct: 0 } }, { id: 34, k: 'noFire', a: {} }, { id: 35, k: 'noTurn', a: {} },
      ] },
      { id: RISEN.id, name: RISEN.name, seconds: null, effects: [
        { id: 41, k: 'colour', a: { slot: SLOT_GREEN } }, { id: 42, k: 'speedBy', a: { pct: OUTBREAK.ZOMBIE_SPEED_PCT } },
        { id: 43, k: 'pushBy', a: { pct: OUTBREAK.ZOMBIE_PUSH_PCT } }, { id: 44, k: 'mind', a: { mind: 'zombie' } },
      ] },
      { id: FOLLOW.id, name: FOLLOW.name, seconds: null, effects: [{ id: 51, k: 'colour', a: { slot: SLOT_GREY } }] },
      { id: TURNED.id, name: TURNED.name, seconds: null, effects: [{ id: 61, k: 'tag', a: { tag: ref(ZOMBIE) } }] },
    ],
    rules: [
      { id: 100, name: 'Outbreak: the dead rise', maxRuns: 600, when: [{ id: 101, k: 'body.died', a: {} }],
        cond: [{ id: 102, k: 'not', a: { list: [{ id: 103, k: 'body.is', a: { who: { w: 'subject' }, is: { tags: [ref(ZOMBIE)] } } }] } }],
        then: rise(110, { w: 'subject' }) },
      { id: 120, name: 'Outbreak: the player rises, as a bot', when: [{ id: 121, k: 'player.died', a: {} }], cond: [],
        then: [{ id: 122, k: 'say', a: { to: 'subject', text: 'You died and became a Zombified {tank}!', life: 6 } }, ...rise(130, { w: 'subject' })] },
      { id: 140, name: 'Outbreak: a Necromancer raises a zombie', when: [{ id: 141, k: 'body.died', a: { who: { tags: [ref(ZOMBIE)] } } }],
        cond: [{ id: 142, k: 'killer.is', a: { is: { tanks: NECRO } } }],
        then: [{ id: 143, k: 'copy.of', a: { who: { w: 'subject' }, side: 'killer', tags: [ref(FOLLOWER)] } }, { id: 144, k: 'status.add', a: { who: { w: 'lastSpawned' }, status: ref(FOLLOW) } }] },
      { id: 160, name: 'Outbreak: a fallen Necromancer\'s followers turn', when: [{ id: 161, k: 'body.died', a: { who: { tanks: NECRO } } }], cond: [], then: turnFollowers(170) },
      { id: 180, name: 'Outbreak: the player Necromancer\'s followers turn', when: [{ id: 181, k: 'player.died', a: {} }],
        cond: [{ id: 182, k: 'body.is', a: { who: { w: 'subject' }, is: { tanks: NECRO } } }], then: turnFollowers(190) },
      { id: 220, name: 'Outbreak: the zombies take over', when: [{ id: 221, k: 'player.died', a: {} }], cond: [],
        then: [{ id: 222, k: 'wait', a: { seconds: OUTBREAK.END_ASK_SECONDS } }, { id: 223, k: 'if', a: {
          cond: [{ id: 224, k: 'not', a: { list: [{ id: 225, k: 'living.left', a: {} }] } }],
          then: [{ id: 226, k: 'match.end', a: { result: 'lose', team: 'player', then: 'closeArena', closing: 'The zombies have taken over!', closed: 'Arena closed.', screen: 'The Zombies Have Taken Over' } }],
          else: [] } }] },
    ],
  } as unknown as MapEventsDoc;
}

export const SOCCER = {
  BALL_WORD: 'other:data-data/Others/Game Objects/ball.json',
  SIZE: 60, HEALTH: 15000000, BODY_DAMAGE: 190, ROUND_HIT: 0.035, WEIGHT: 1.5, PUSH: 1, KEEP: 23,
  WALL_BOUNCE: 0.1,
  GOALS_TO_WIN: 10, NEW_BALL_SECONDS: 3,
  PUSH_CHANCE: 20, PUSH_ASK_AGAIN: 15, PUSH_GIVE_UP: [10, 30] as const,
  MIDDLE: [14, 10] as const, BLUE_BASE: { gx: 2, gy: 8, cw: 2, ch: 4 }, GREEN_BASE: { gx: 24, gy: 8, cw: 2, ch: 4 },
} as const;
const SOCCER_IDS = { ball: 11, ballForm: 12, wallRow: 13, placed: 14, blueGoals: 21, greenGoals: 22, blueBase: 31, greenBase: 32 } as const;
function soccerDoc(): MapEventsDoc {
  const BALL = { id: SOCCER_IDS.ball, name: 'Ball' };
  const BLUE_G = { id: SOCCER_IDS.blueGoals, name: 'Blue Goals' }, GREEN_G = { id: SOCCER_IDS.greenGoals, name: 'Green Goals' };
  const BLUE_B = { id: SOCCER_IDS.blueBase, name: 'Blue Base' }, GREEN_B = { id: SOCCER_IDS.greenBase, name: 'Green Base' };
  const ref = (t: { id: number; name: string }) => ({ id: t.id, n: t.name });
  const isBall = { types: [ref(BALL)] };
  const goal = (base: number, area: { id: number; name: string }, vari: { id: number; name: string }, words: string) => ({
    id: base, name: `Soccer: ${words.split(' ')[0]} scores`,
    when: [{ id: base + 1, k: 'area.entered', a: { area: ref(area), who: isBall } }], cond: [],
    then: [
      { id: base + 2, k: 'var.add', a: { var: ref(vari), value: 1 } },
      { id: base + 3, k: 'say', a: { to: 'all', text: words, life: 4 } },
      { id: base + 4, k: 'kill', a: { who: { w: 'subject' } } },
    ],
  });
  const win = (base: number, vari: { id: number; name: string }, team: string) => ({
    id: base, name: `Soccer: ${vari.name.split(' ')[0]} wins`,
    when: [{ id: base + 1, k: 'var.crossed', a: { var: ref(vari), op: 'ge', value: SOCCER.GOALS_TO_WIN } }], cond: [],
    then: [{ id: base + 2, k: 'match.end', a: { result: 'win', team, then: 'closeArena' } }],
  });
  return {
    v: EVENTS_DOC_VERSION,
    nextId: 400,
    match: { food: false, ambientBosses: false, ambientCrashers: false, ambientSentries: false, ambientSentinels: false },
    types: [{
      id: BALL.id, name: BALL.name,
      forms: [{ id: SOCCER_IDS.ballForm, name: 'Ball', tank: SOCCER.BALL_WORD, size: SOCCER.SIZE }],
      side: { team: 'neutral', camp: 'shape' }, brain: 'none', stands: true, canDie: true, seenByBots: true,
      onLeaderboard: false, onMinimap: true, minimapAll: true, countsAsKill: false, worth: 'none', showName: false,
      contact: 'shape', pushable: true, crashersIgnore: true, canBeHealed: false,
      shape: { health: SOCCER.HEALTH, bodyDamage: SOCCER.BODY_DAMAGE, roundHit: SOCCER.ROUND_HIT, shield: 0, shieldRegen: 0, xp: 0,
        weight: SOCCER.WEIGHT, push: SOCCER.PUSH, keep: SOCCER.KEEP, rolls: true, noInsidePush: true },
      touch: [{ id: SOCCER_IDS.wallRow, what: 'walls', then: 'bounce', strength: SOCCER.WALL_BOUNCE }],
    }],
    placed: [{ id: SOCCER_IDS.placed, name: 'Ball', type: ref(BALL), cx: SOCCER.MIDDLE[0], cy: SOCCER.MIDDLE[1] }],
    vars: [
      { id: BLUE_G.id, name: BLUE_G.name, kind: 'number', start: 0, scope: 'match' },
      { id: GREEN_G.id, name: GREEN_G.name, kind: 'number', start: 0, scope: 'match' },
    ],
    rules: [
      { id: 100, name: 'Soccer: the leaderboard shows the goals', when: [{ id: 101, k: 'match.started', a: {} }], cond: [],
        then: [{ id: 102, k: 'lb.teams', a: { on: true, title: 'GOALS TO WIN', goal: SOCCER.GOALS_TO_WIN, unit: 'Goals', unitOne: 'Goal', s1: ref(BLUE_G), s2: ref(GREEN_G) } }] },
      goal(110, BLUE_B, GREEN_G, 'Green team has scored!'),
      goal(120, GREEN_B, BLUE_G, 'Blue team has scored!'),
      { id: 130, name: 'Soccer: a new ball in the middle', when: [{ id: 131, k: 'body.died', a: { who: isBall } }], cond: [],
        then: [
          { id: 132, k: 'wait', a: { seconds: SOCCER.NEW_BALL_SECONDS } },
          { id: 133, k: 'spawn', a: { what: [{ id: 134, type: ref(BALL), weight: 1 }], count: 1, at: { w: 'point', cx: SOCCER.MIDDLE[0], cy: SOCCER.MIDDLE[1] } } },
        ] },
      win(140, BLUE_G, 'team1'),
      win(150, GREEN_G, 'team2'),
      { id: 160, name: 'Soccer: a bot pushes the ball', when: [{ id: 161, k: 'bot.sees', a: { what: 'entity', thing: isBall, again: SOCCER.PUSH_ASK_AGAIN } }],
        cond: [{ id: 162, k: 'chance', a: { pct: SOCCER.PUSH_CHANCE } }],
        then: [{ id: 163, k: 'bot.interest', a: { who: { w: 'subject' }, do: 'push', thing: { w: 'other' }, toward: 'base', giveUp: SOCCER.PUSH_GIVE_UP[0], giveUpTo: SOCCER.PUSH_GIVE_UP[1] } }] },
    ],
  } as unknown as MapEventsDoc;
}
export function shippedOverlayWorld(word: string, world: string | undefined, teams: number | undefined): { events: MapEventsDoc; mapAreas: { nextId: number; zones: ZoneLike[] } } | null {
  return missingOf(word, world, teams);
}
function missingOf(word: string | undefined, world: string | undefined, teams: number | undefined): { events: MapEventsDoc; mapAreas: { nextId: number; zones: ZoneLike[] } } | null {
  const w = isWorldId(world) ? MODE_WORLDS[world] : undefined;
  const t = teams ?? w?.teams ?? 2;
  switch (word) {
    case 'domination': return w?.drawing ? buildDominationWorld(w.drawing, t) : null;
    case 'assault': return w?.drawing ? buildAssaultWorld(w.drawing) : null;
    case 'mothership': case 'tag': case 'clan-wars': case 'ctf': case 'labyrinth': case 'nexus': case 'forge':
      return buildMissingWorld(word, world, w?.drawing, t);
    default: return null;
  }
}
export function buildOverlayAreas(word: string | undefined, world?: string, teams?: number): { nextId: number; zones: ZoneLike[] } | null {
  const _mw = missingOf(word, world, teams); if (_mw) return _mw.mapAreas.zones.length > 0 ? _mw.mapAreas : null;
  if (word === 'magic-maze') return magicMazeAreas();
  if (word !== 'soccer') return null;
  const zone = (id: number, uid: number, name: string, r: { gx: number; gy: number; cw: number; ch: number }, team: number) => (BASE_AREAS.ON !== 0
    ? { id, uid, name, ...r, team, kind: 'cosmetic', opacity: 0, behaviors: [teamBaseRow(uid + 2, team)], modeBase: true }
    : { id, uid, name, ...r, team: 0, kind: 'cosmetic', opacity: 0, behaviors: [] }) as unknown as ZoneLike;
  return { nextId: 3, zones: [zone(1, SOCCER_IDS.blueBase, 'Blue Base', SOCCER.BLUE_BASE, 0), zone(2, SOCCER_IDS.greenBase, 'Green Base', SOCCER.GREEN_BASE, 1)] };
}

export function buildOverlayMap(word: string | undefined, world?: string, teams?: number): Partial<import('../../../types').MapConfig> | null {
  const _mw = missingOf(word, world, teams) as { map?: Partial<import('../../../types').MapConfig> } | null;
  return _mw && _mw.map ? _mw.map : null;
}
export function buildOverlayEvents(word: string | undefined, world?: string, teams?: number): MapEventsDoc | null {
  const _mw = missingOf(word, world, teams); if (_mw) return _mw.events;
  switch (word) {
    case 'blackout': return blackoutDoc();
    case 'outbreak': return outbreakDoc();
    case 'soccer': return soccerDoc();
    case 'magic-maze': return magicMazeDoc();
    default: return null;
  }
}
