import type { MapEventsDoc, ZoneLike } from '../doc';
import { EVENTS_DOC_VERSION } from '../doc';

export const MAGIC_MAZE_SENSE = {
  AVOID: [1, 11] as readonly number[], MARGIN: 40,
  TOUCH: [6, 4] as readonly number[], EVERY_MIN: 30, EVERY_MAX: 120, CHANCE: 20, HOLD_MIN: 5, HOLD_MAX: 25,
  RELIC_EVERY: 60,
} as const;

const RELIC_SHAPES = ['egg', 'triangle', 'square', 'pentagon', 'beta-pentagon', 'alpha-pentagon', 'hexagon'];
const RELIC_GEMS = ['', 'amethyst', 'citrine', 'emerald', 'ruby', 'sapphire', 'topaz'];
export const RELIC_IDS: readonly string[] = RELIC_SHAPES.flatMap(s => RELIC_GEMS.map(g => `user:${s}-relic${g ? '-' + g : ''}`));

const MAZE_ZONE = { id: 1, uid: 990, name: 'The Maze', gx: 1, gy: 1, cw: 33, ch: 33 };

export function magicMazeAreas(): { nextId: number; zones: ZoneLike[] } {
  return { nextId: 2, zones: [{ ...MAZE_ZONE, team: 0, kind: 'cosmetic', opacity: 0, behaviors: [] } as unknown as ZoneLike] };
}

export function magicMazeDoc(): MapEventsDoc {
  const S = MAGIC_MAZE_SENSE;
  const SENSE = { id: 21, name: 'Maze Sense' };
  const FOLDER = { id: 31, name: 'Maze Bots' };
  const ref = (t: { id: number; name: string }) => ({ id: t.id, n: t.name });
  let cid = 500;
  const relics = RELIC_IDS.map(sh => ({ id: cid++, shape: sh, weight: 1 }));
  return {
    v: EVENTS_DOC_VERSION,
    nextId: 1000,
    match: { ambientBosses: false },
    folders: [FOLDER],
    statuses: [
      { id: SENSE.id, name: SENSE.name, folder: FOLDER.id, seconds: null, effects: [
        { id: 41, k: 'wallAvoid', a: { walls: [...S.AVOID], margin: S.MARGIN } },
        { id: 42, k: 'wallTouch', a: { walls: [...S.TOUCH], everyMin: S.EVERY_MIN, everyMax: S.EVERY_MAX, chance: S.CHANCE, holdMin: S.HOLD_MIN, holdMax: S.HOLD_MAX } },
      ] },
    ],
    rules: [
      { id: 100, name: 'Bots Know The Maze', folder: FOLDER.id, when: [{ id: 101, k: 'bot.joined', a: { who: { boss: false } } }], cond: [],
        then: [{ id: 102, k: 'status.add', a: { who: { w: 'subject' }, status: ref(SENSE) } }] },
      { id: 110, name: 'A Relic Now And Then', when: [{ id: 111, k: 'time.every', a: { every: S.RELIC_EVERY, first: S.RELIC_EVERY } }], cond: [],
        then: [{ id: 112, k: 'spawn', a: { what: relics, count: 1, at: { w: 'in', areas: [{ id: MAZE_ZONE.uid, n: MAZE_ZONE.name }] } } }] },
    ],
  } as unknown as MapEventsDoc;
}
