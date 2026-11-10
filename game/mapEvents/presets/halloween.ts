import type { EntityType, Id, MapEventsDoc, PlacedEntity, Ref, Row, Rule, ZoneLike } from '../doc';
import { EVENTS_DOC_VERSION } from '../doc';
import { MAP_TANK_HEAD } from '../thingWord';
import { buildOverlayEvents } from './overlays';
import { ASYLUM_GRID, ASYLUM_WALLS, ASYLUM_DOORS, ASYLUM_BUTTONS, ASYLUM_GENERATORS, ASYLUM_WORMHOLES, ASYLUM_FLOOR, ASYLUM_WEST_WING, ASYLUM_EAST_WING, ASYLUM_SPLIT, ASYLUM_PATCH, ASYLUM_NESTS, ASYLUM_DOOR_GREEN, ASYLUM_LOOT } from './asylum.generated';
import { BUTTON_TANK, LOCKED_BUTTON_TANK } from './halloweenTanks.generated';
import { DEFAULT_SHAPE_SPAWN_CONFIG, SHAPE_SPAWN_CONFIG_OF_BEFORE, MAZE_TYPE_CUSTOM } from '../../../types';
import type { MapConfig, PortalKindConfig } from '../../../types';
import { CM, CM_FREE } from '../../../utils/colorMap';
import { HUD_MSG_ALWAYS_INVISIBLE } from '../../../utils/hudArras';

export const HALLOWEEN = {
  PATCH_LINES_AT: [60, 90, 120, 150] as const,
  BUTTON_PAUSE_SECONDS: 2,
  GEN_BACK_SECONDS: 30,
  GEN_TIRES_SECONDS: [360, 720] as const,
  CURSE_HEX: '#f29212',
  EDGE_DARK_RADII: 21, EDGE_DIM_RADII: 35,
  FLOOR_OPACITY: 0.29,
  DOOR_CRUSH_PCT: 300,
  GROUNDS_FOOD_CAP: 90, LOOT_FOOD_CAP: 30,
  NESTED_RATE_LEVEL: 1,
  BOT_PATCH_PCT: 10, BOT_DOOR_PCT: 20, BOT_GEN_PCT: 10, BOT_ASK_AGAIN_S: 60, BOT_GIVE_UP_S: 300,
  BUTTON_OUT: 0.005,
  BUTTON_SIZE: 36, BUTTON_HIDDEN_SIZE: 4,
  BUTTON_SWAP_SECONDS: 0.1,
  SPILL_CELLS: 6,
} as const;
const SLOT_YELLOW = 3, SLOT_GREEN = 11, SLOT_RED = 12, SLOT_ORANGE = 2;

export const HALLOWEEN_LINES = {
  patchIn: 'You have entered the Pumpkin Patch!',
  patch60: 'You feel an ominious aura from the Pumpkin Patch. Maybe you shouldn\'t stay here for too long.',
  patch90: 'You feel your soul slowly being ripped out of your body. Are you sure you want to stay in the Pumpkin Patch?',
  patch120: 'You feel a curse being placed upon you. If you leave now though, it might not be too late.',
  patch150: 'You have been cursed to become one with the pumpkins. You look down at your body and only your fragile soul remains.',
  cursedHidden: HUD_MSG_ALWAYS_INVISIBLE,
  leftEarly: 'You have left the Pumpkin Patch!',
  left90: 'You have left the Pumpkin Patch! You seem to be safe, at least for now.',
  left120: 'You have left the Pumpkin Patch just in time! You seem to be safe, at least for now.',
  leftCursed: 'You have left the Pumpkin Patch! You feel weak under the curse.',
  asylumOn: 'You have entered the Haunted Asylum! Both Generators are powered on.',
  asylumWestOff: 'You have entered the Haunted Asylum! The Western Generator is powered off.',
  asylumEastOff: 'You have entered the Haunted Asylum! The Eastern Generator is powered off.',
  asylumOff: 'You have entered the Haunted Asylum! Both Generators are powered off.',
  asylumLeft: 'You have left the Haunted Asylum!',
  westOn: 'The Western Generator has been powered on.', westOff: 'The Western Generator has been powered off.',
  eastOn: 'The Eastern Generator has been powered on.', eastOff: 'The Eastern Generator has been powered off.',
} as const;

export interface HalloweenWorld {
  map: Partial<MapConfig> & { name: string; mazeType: number; gridCells: number; mapScale: number; enableMaze: boolean; enableRocks: boolean; enablePortals: boolean; enableSpawnAreas: boolean; bossesCanGrow: boolean };
  mapAreas: { nextId: number; zones: ZoneLike[] };
  events: MapEventsDoc;
}

function asylumSolid(gx: number, gy: number): boolean {
  for (const [x, y, w, h] of ASYLUM_WALLS) if (gx >= x && gx < x + w && gy >= y && gy < y + h) return true;
  for (const [x, y] of ASYLUM_DOORS) if (gx === x && gy === y) return true;
  return false;
}
function buttonSpot(cx: number, cy: number): [number, number] {
  const k = HALLOWEEN.BUTTON_OUT;
  if (Number.isInteger(cx)) { const gy = Math.floor(cy); return asylumSolid(cx, gy) && !asylumSolid(cx - 1, gy) ? [cx - k, cy] : !asylumSolid(cx, gy) && asylumSolid(cx - 1, gy) ? [cx + k, cy] : [cx, cy]; }
  if (Number.isInteger(cy)) { const gx = Math.floor(cx); return asylumSolid(gx, cy) && !asylumSolid(gx, cy - 1) ? [cx, cy - k] : !asylumSolid(gx, cy) && asylumSolid(gx, cy - 1) ? [cx, cy + k] : [cx, cy]; }
  return [cx, cy];
}

export function buildHalloweenWorld(): HalloweenWorld {
  const outbreak = buildOverlayEvents('outbreak')!;
  let next = 1000;
  const id = (): Id => next++;
  const ref = (t: { id: Id; name?: string }): Ref => ({ id: t.id, n: t.name ?? '' });
  const row = (k: string, a: Record<string, unknown>): Row => ({ id: id(), k, a });
  const say = (text: string, to: 'all' | 'subject' = 'subject') => row('say', { to, text });
  const SUB = { w: 'subject' };

  const cursedTag = { id: id(), name: 'Cursed' }, shakenTag = { id: id(), name: 'Shaken' }, doomedTag = { id: id(), name: 'Doomed' };
  const hidden = { id: id(), name: 'In The Pumpkin Patch' }, shaken = { id: id(), name: 'Uneasy' }, doomed = { id: id(), name: 'Doomed' }, cursed = { id: id(), name: 'Cursed' };
  const resting = { id: id(), name: 'Resting' };
  const statuses = [
    { id: hidden.id, name: hidden.name, seconds: null, effects: [row('invisible', { style: 'always' })] },
    { id: shaken.id, name: shaken.name, seconds: null, effects: [row('tag', { tag: ref(shakenTag) })] },
    { id: doomed.id, name: doomed.name, seconds: null, effects: [row('tag', { tag: ref(doomedTag) })] },
    { id: cursed.id, name: cursed.name, seconds: null, effects: [row('colour', { slot: SLOT_ORANGE, hex: HALLOWEEN.CURSE_HEX }), row('invisible', { style: 'always' }), row('fragile', {}), row('seesAll', {}), row('tag', { tag: ref(cursedTag) })] },
    { id: resting.id, name: resting.name, seconds: null, effects: [row('invulnerable', {})] },
  ];
  const isCursed = (): Row => row('body.is', { who: SUB, is: { tags: [ref(cursedTag)] } });
  const notCursed = (): Row => row('not', { list: [isCursed()] });

  let zoneId = 1;
  const zone = (name: string, at: { gx: number; gy: number; cw: number; ch: number }, look: Partial<ZoneLike>, behaviors: Row[], extra: Partial<ZoneLike> = {}): ZoneLike =>
    ({ id: zoneId++, uid: id(), name, ...at, team: 0, kind: 'cosmetic', behaviors, opacity: 0, ...look, ...extra });
  const polyBox = (pts: readonly number[]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    return { gx: Math.floor(x0), gy: Math.floor(y0), cw: Math.max(1, Math.ceil(x1) - Math.floor(x0)), ch: Math.max(1, Math.ceil(y1) - Math.floor(y0)) };
  };
  const polyZone = (name: string, pts: readonly number[], look: Partial<ZoneLike>, behaviors: Row[]) => zone(name, polyBox(pts), look, behaviors, { shape: { k: 'poly', pts: pts.slice() } });
  const { gridCells: GC, gridCellsY: GCY } = ASYLUM_GRID;
  const offRow = (r: Row): Row => ({ ...r, off: true } as Row);

  const floor = polyZone('Haunted Asylum', ASYLUM_FLOOR[0], { colorMap: SLOT_YELLOW, opacity: HALLOWEEN.FLOOR_OPACITY }, [row('say', { enter: '', leave: HALLOWEEN_LINES.asylumLeft, to: 'subject' })]);
  const morefloor = ASYLUM_FLOOR.slice(1).map((pts, n) => polyZone(`Haunted Asylum ${n + 2}`, pts, { colorMap: SLOT_YELLOW, opacity: HALLOWEEN.FLOOR_OPACITY }, []));
  const westWingDark = offRow(row('darkness', {})), eastWingDark = offRow(row('darkness', {}));
  const westWing = polyZone('West Wing', ASYLUM_WEST_WING[0], {}, [westWingDark]);
  const eastWing = polyZone('East Wing', ASYLUM_EAST_WING[0], {}, [eastWingDark]);
  const edge = (radii: number, on: boolean, lit: boolean): Row => {
    const r = row('darkness', lit ? { circle: radii, walls: false, spills: true, spillCells: HALLOWEEN.SPILL_CELLS } : { circle: radii, walls: true });
    return on ? r : offRow(r);
  };
  const westEdges = { dark: edge(HALLOWEEN.EDGE_DARK_RADII, false, true), dim: edge(HALLOWEEN.EDGE_DIM_RADII, true, true), night: edge(HALLOWEEN.EDGE_DARK_RADII, false, false) };
  const eastEdges = { dark: edge(HALLOWEEN.EDGE_DARK_RADII, false, true), dim: edge(HALLOWEEN.EDGE_DIM_RADII, true, true), night: edge(HALLOWEEN.EDGE_DARK_RADII, false, false) };
  const keyhole = (x0: number, y0: number, x1: number, y1: number, hole: readonly number[]): number[] => [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0, ...hole, hole[0], hole[1]];
  const westHalf = polyZone('West Half', keyhole(0, 0, ASYLUM_SPLIT, GCY, ASYLUM_WEST_WING[0]), {}, [westEdges.dark, westEdges.dim, westEdges.night]);
  const eastHalf = polyZone('East Half', keyhole(ASYLUM_SPLIT, 0, GC, GCY, ASYLUM_EAST_WING[0]), {}, [eastEdges.dark, eastEdges.dim, eastEdges.night]);

  const late: Row[] = [];
  const sayLast = (text: string): Row => { const r: Row = { id: 0, k: 'say', a: { to: 'subject', text } }; late.push(r); return r; };
  const stage = (at: number, line: string, add: { id: Id; name: string } | null, drop: { id: Id; name: string }[] = [], more: string[] = []): { at: number; steps: Row[] } => ({
    at, steps: [row('if', { cond: [notCursed()], then: [say(line), ...more.map(sayLast), ...(add ? [row('status.add', { who: SUB, status: ref(add) })] : []), ...drop.map(s => row('status.remove', { who: SUB, status: ref(s) }))], else: [] })],
  });
  const [t60, t90, t120, t150] = HALLOWEEN.PATCH_LINES_AT;
  const patch = polyZone('Pumpkin Patch', ASYLUM_PATCH, {}, [
    row('say', { enter: HALLOWEEN_LINES.patchIn, leave: '', to: 'subject' }),
    row('while', { status: ref(hidden), who: {} }),
    row('stay', { who: {}, clock: 'reset', stages: [stage(t60, HALLOWEEN_LINES.patch60, null), stage(t90, HALLOWEEN_LINES.patch90, shaken), stage(t120, HALLOWEEN_LINES.patch120, doomed), stage(t150, HALLOWEEN_LINES.patch150, cursed, [shaken, doomed], [HALLOWEEN_LINES.cursedHidden])], repeatEvery: 0, lines: [], leaveLine: '' }),
  ]);
  (patch as ZoneLike & { fill?: unknown }).fill = { k: 'rocks', rocks: 'pumpkinPatch' };

  const nest = (name: string, r: readonly number[]) => zone(name, { gx: r[0], gy: r[1], cw: r[2], ch: r[3] }, {}, [
    row('spawnPlace', { teams: ['ffa', 'player'], enabledAtStart: true }),
  ]);
  const foodOf = (kinds: readonly string[], cap: number) => {
    const c = DEFAULT_SHAPE_SPAWN_CONFIG();
    const baseShapes: Record<string, unknown> = {};
    const was = SHAPE_SPAWN_CONFIG_OF_BEFORE();
    for (const k of Object.keys(c.baseShapes)) baseShapes[k] = { ...c.baseShapes[k], spawnWeight: was.baseShapes[k]?.spawnWeight ?? c.baseShapes[k].spawnWeight, enabled: kinds.includes(k) };
    const scaleVariants: Record<string, unknown> = {};
    for (const k of Object.keys(c.scaleVariants)) scaleVariants[k] = { ...c.scaleVariants[k], enabled: false };
    const labyEnabled: Record<string, Record<string, boolean>> = {};
    for (const t of Object.keys(c.labyEnabled)) { labyEnabled[t] = {}; for (const k of Object.keys(c.labyEnabled[+t as 1])) labyEnabled[t][k] = +t <= 2 && kinds.includes(k); }
    const specialEnabled: Record<string, boolean> = { ...c.specialEnabled };
    for (const k of Object.keys(specialEnabled)) if (k.startsWith('sentry') || k.startsWith('sentinel') || k.startsWith('shinySentry')) specialEnabled[k] = false;
    for (const k of ['egg', 'triangle', 'square', 'pentagon', 'hexagon']) specialEnabled['crasher' + k[0].toUpperCase() + k.slice(1)] = kinds.includes(k);
    return { baseShapes, scaleVariants, labyEnabled, specialEnabled, foodCap: cap, labyRateLevel: HALLOWEEN.NESTED_RATE_LEVEL };
  };
  const [LX, LY, LW, LH] = ASYLUM_LOOT;
  const loot = zone('The Middle', { gx: LX, gy: LY, cw: LW, ch: LH }, {}, [row('food', { shapes: foodOf(['pentagon', 'hexagon'], HALLOWEEN.LOOT_FOOD_CAP), rate: 50, keepOut: true })]);
  const grounds = zone('The Grounds', { gx: 0, gy: 0, cw: GC, ch: LY }, {}, [row('food', { shapes: foodOf(['egg', 'triangle', 'square'], HALLOWEEN.GROUNDS_FOOD_CAP), rate: 50, keepOut: true })],
    { more: [{ gx: 0, gy: LY + LH, cw: GC, ch: GCY - LY - LH }, { gx: 0, gy: LY, cw: LX, ch: LH }, { gx: LX + LW, gy: LY, cw: GC - LX - LW, ch: LH }] });
  const westNest = nest('West Nest', ASYLUM_NESTS.west), eastNest = nest('East Nest', ASYLUM_NESTS.east);

  const spots = (name: string, list: readonly (readonly [number, number])[]) => {
    const [first, ...more] = list.map(([x, y]) => ({ gx: Math.floor(x), gy: Math.floor(y), cw: 1, ch: 1 }));
    return zone(name, first, {}, [], more.length ? { more } : {});
  };
  const westSpots = spots('West Generator Spots', ASYLUM_GENERATORS.west as unknown as (readonly [number, number])[]);
  const eastSpots = spots('East Generator Spots', ASYLUM_GENERATORS.east as unknown as (readonly [number, number])[]);

  const doorZones = ASYLUM_DOORS.map(([gx, gy], n) => zone(`Door ${n + 1}`, { gx, gy, cw: 1, ch: 1 }, {}, [row('door', { crush: HALLOWEEN.DOOR_CRUSH_PCT, light: 0, lightShut: 0 })]));
  const wormGround = ASYLUM_WORMHOLES.map(([gx, gy], n) => zone(`Wormhole ${n + 1} Ground`, { gx, gy, cw: 1, ch: 1 }, { colorMap: CM.BACKGROUND, opacity: 1 }, []));
  const wormTiles = ASYLUM_WORMHOLES.map(([gx, gy], n) => zone(`Wormhole ${n + 1}`, { gx, gy, cw: 1, ch: 1 }, { color: '#000000', colorMap: CM_FREE, opacity: 0.3 }, []));

  const genType = (name: string, spotsZone: ZoneLike): { type: EntityType; off: { id: Id; name: string }; on: { id: Id; name: string } } => {
    const off = { id: id(), name: 'Off' }, on = { id: id(), name: 'On' };
    const among = { among: [ref({ id: spotsZone.uid!, name: spotsZone.name })] };
    const type: EntityType = {
      id: id(), name, side: { team: 'neutral' }, brain: 'none', stands: true, canDie: true, seenByBots: false, onLeaderboard: false, onMinimap: true, minimapAll: true, countsAsKill: false, showName: false, worth: 'none',
      forms: [
        { id: on.id, name: on.name, tank: 'dominator', colour: { use: 'slot', slot: SLOT_GREEN }, onDeath: { to: off.id, team: 'form', place: among, delay: HALLOWEEN.GEN_BACK_SECONDS },
          after: { seconds: { r: [HALLOWEEN.GEN_TIRES_SECONDS[0], HALLOWEEN.GEN_TIRES_SECONDS[1]] }, to: off.id, how: 'become' } },
        { id: off.id, name: off.name, tank: 'dominator', colour: { use: 'slot', slot: SLOT_RED }, onDeath: { to: on.id, team: 'form', place: 'same' } },
      ],
    };
    return { type, off, on };
  };
  const westGen = genType('Western Generator', westSpots), eastGen = genType('Eastern Generator', eastSpots);

  const buttonTank = { id: id(), name: 'Button', data: BUTTON_TANK }, lockedTank = { id: id(), name: 'Locked Button', data: LOCKED_BUTTON_TANK };
  const greenOpens = { id: id(), name: 'Green, Opens' }, greenShuts = { id: id(), name: 'Green, Shuts' };
  const yellowShuts = { id: id(), name: 'Yellow, Then Shuts' }, yellowOpens = { id: id(), name: 'Yellow, Then Opens' }, hiddenA = { id: id(), name: 'Hidden' };
  const greenShutsB = { id: id(), name: 'Green, Shuts, Other Side' }, hiddenB = { id: id(), name: 'Hidden, Other Side' };
  const redLocked = { id: id(), name: 'Red, Locked' }, redOpen = { id: id(), name: 'Red, Door Open' }, redJammed = { id: id(), name: 'Red, Jammed Open' }, lockGone = { id: id(), name: 'Lock Gone' };
  const BS = HALLOWEEN.BUTTON_SIZE, swap = HALLOWEEN.BUTTON_SWAP_SECONDS, rest = HALLOWEEN.BUTTON_PAUSE_SECONDS;
  const btn = (f: { id: Id; name: string }, slot: number, extra: Record<string, unknown> = {}, locked = false) =>
    ({ id: f.id, name: f.name, tank: MAP_TANK_HEAD + (locked ? lockedTank.id : buttonTank.id), size: BS, colour: { use: 'slot', slot }, ...extra });
  const hid = (f: { id: Id; name: string }) => ({ id: f.id, name: f.name, tank: MAP_TANK_HEAD + buttonTank.id, size: HALLOWEEN.BUTTON_HIDDEN_SIZE, colour: { use: 'slot', slot: SLOT_GREEN } });
  const then = (to: { id: Id }) => ({ to: to.id, team: 'form', place: 'same', delay: swap });
  const buttonType: EntityType = {
    id: id(), name: 'Door Button', side: { team: 'neutral' }, brain: 'none', stands: true, canDie: true, seenByBots: false, onLeaderboard: false, onMinimap: false, showName: false, worth: 'none', crashersIgnore: true,
    countsAsKill: false, inWalls: true,
    forms: [
      btn(greenOpens, SLOT_GREEN, { onDeath: then(yellowShuts) }),
      btn(greenShuts, SLOT_GREEN, { onDeath: then(yellowOpens) }),
      btn(yellowShuts, SLOT_YELLOW, { after: { seconds: rest, to: greenShuts.id, how: 'become' } }),
      btn(yellowOpens, SLOT_YELLOW, { after: { seconds: rest, to: greenOpens.id, how: 'become' } }),
      hid(hiddenA),
      btn(greenShutsB, SLOT_GREEN, { onDeath: then(hiddenB) }),
      hid(hiddenB),
      btn(redLocked, SLOT_RED, { onDeath: then(redJammed) }, true),
      btn(redOpen, SLOT_RED, { onDeath: then(lockGone) }, true),
      btn(redJammed, SLOT_RED, { onDeath: then(redLocked) }, true),
      hid(lockGone),
    ] as EntityType['forms'],
  };

  const placed: PlacedEntity[] = [];
  const startSpot = (list: readonly (readonly number[])[], wantX: number) => list.reduce((b, s) => (Math.abs(s[0] - wantX) < Math.abs(b[0] - wantX) ? s : b), list[0]);
  const ws = startSpot(ASYLUM_GENERATORS.west as unknown as number[][], (-4192 + 6120) / 90), es = startSpot(ASYLUM_GENERATORS.east as unknown as number[][], (4316 + 6120) / 90);
  placed.push({ id: id(), name: 'Western Generator', type: ref(westGen.type), cx: ws[0], cy: ws[1], home: ref({ id: westSpots.uid!, name: westSpots.name }), startForm: westGen.on.id });
  placed.push({ id: id(), name: 'Eastern Generator', type: ref(eastGen.type), cx: es[0], cy: es[1], home: ref({ id: eastSpots.uid!, name: eastSpots.name }), startForm: eastGen.on.id });
  ASYLUM_DOORS.forEach((_d, door) => {
    const dz = doorZones[door], home = ref({ id: dz.uid!, name: dz.name });
    const gs = ASYLUM_DOOR_GREEN[door] ?? 0;
    const A = ASYLUM_BUTTONS.find(b => b[0] === door && b[1] === gs), B = ASYLUM_BUTTONS.find(b => b[0] === door && b[1] !== gs);
    if (!A || !B) return;
    const [an, aN] = buttonSpot(A[2], A[3]), [af, aF] = buttonSpot(A[4], A[5]);
    const [bn, bN] = buttonSpot(B[2], B[3]), [bf, bF] = buttonSpot(B[4], B[5]);
    placed.push({ id: id(), name: `Door ${door + 1} Green Side`, type: ref(buttonType), cx: an, cy: aN, home, startForm: greenOpens.id, spots: [{ form: hiddenA.id, cx: A[6], cy: A[7] }] });
    placed.push({ id: id(), name: `Door ${door + 1} Other Side`, type: ref(buttonType), cx: bn, cy: bN, home, startForm: hiddenB.id, spots: [{ form: hiddenB.id, cx: B[6], cy: B[7] }] });
    placed.push({ id: id(), name: `Door ${door + 1} Lock`, type: ref(buttonType), cx: bf, cy: bF, home, startForm: redLocked.id, spots: [{ form: redJammed.id, cx: af, cy: aF }, { form: lockGone.id, cx: B[6], cy: B[7] }] });
  });

  const westPower = { id: id(), name: 'Western Power', kind: 'number' as const, start: 1, scope: 'match' as const };
  const eastPower = { id: id(), name: 'Eastern Power', kind: 'number' as const, start: 1, scope: 'match' as const };
  const isOn = (v: { id: Id; name: string }, n: number): Row => row('cmp', { a: { f: `{${v.id}}` }, op: 'eq', b: n });

  const rule = (name: string, when: Row[], cond: Row[], then: Row[]): Rule => ({ id: id(), name, when, cond, then } as Rule);
  const whenForm = (from: { id: Id; name: string }[], to: { id: Id; name: string }): Row =>
    row('if', { cond: [row('body.is', { who: SUB, is: { forms: from.map(f => ref(f)) } })], then: [row('become', { who: SUB, form: ref(to) })], else: [] });
  type Edges = typeof westEdges;
  const dk = (r: Row, on: boolean): Row => row('behavior.set', { behavior: { id: r.id, n: 'Darkness' }, on });
  const genRule = (side: 'Western' | 'Eastern', g: typeof westGen, power: typeof westPower, wing: Row, mine: Edges, otherPower: typeof westPower, other: Edges, lineOn: string, lineOff: string): Rule[] => [
    rule(`Halloween: the ${side} Generator comes on`, [row('body.changed', { who: { forms: [ref(g.on)] } })], [isOn(power, 0)], [
      row('var.set', { var: ref(power), value: 1 }), say(lineOn, 'all'),
      dk(wing, false), dk(mine.dark, false), dk(mine.night, false), dk(mine.dim, true),
      row('if', { cond: [isOn(otherPower, 0)], then: [dk(other.night, false), dk(other.dark, true)], else: [] }),
    ]),
    rule(`Halloween: the ${side} Generator goes off`, [row('body.died', { who: { forms: [ref(g.on)] } }), row('body.changed', { who: { forms: [ref(g.off)] } })], [isOn(power, 1)], [
      row('var.set', { var: ref(power), value: 0 }), say(lineOff, 'all'),
      dk(wing, true), dk(mine.dim, false),
      row('if', { cond: [isOn(otherPower, 0)], then: [dk(mine.night, true), dk(other.dark, false), dk(other.night, true)], else: [dk(mine.dark, true)] }),
    ]),
  ];
  const rules: Rule[] = [
    rule('Halloween: into the asylum', [row('area.entered', { area: ref({ id: floor.uid!, name: floor.name }), who: { player: true } })], [], [
      row('if', { cond: [isOn(westPower, 1), isOn(eastPower, 1)], then: [say(HALLOWEEN_LINES.asylumOn)], else: [
        row('if', { cond: [isOn(westPower, 0), isOn(eastPower, 0)], then: [say(HALLOWEEN_LINES.asylumOff)], else: [
          row('if', { cond: [isOn(westPower, 0)], then: [say(HALLOWEEN_LINES.asylumWestOff)], else: [say(HALLOWEEN_LINES.asylumEastOff)] }),
        ] }),
      ] }),
    ]),
    rule('Halloween: past the map is dark', [row('match.started', {})], [], [row('darkness', { where: 'outside', on: true, fade: 0 })]),
    ...genRule('Western', westGen, westPower, westWingDark, westEdges, eastPower, eastEdges, HALLOWEEN_LINES.westOn, HALLOWEEN_LINES.westOff),
    ...genRule('Eastern', eastGen, eastPower, eastWingDark, eastEdges, westPower, westEdges, HALLOWEEN_LINES.eastOn, HALLOWEEN_LINES.eastOff),
    rule('Halloween: out of the patch', [row('area.left', { area: ref({ id: patch.uid!, name: patch.name }), who: {} })], [], [
      row('if', { cond: [isCursed()], then: [say(HALLOWEEN_LINES.leftCursed)], else: [
        row('if', { cond: [row('body.is', { who: SUB, is: { tags: [ref(doomedTag)] } })], then: [say(HALLOWEEN_LINES.left120)], else: [
          row('if', { cond: [row('body.is', { who: SUB, is: { tags: [ref(shakenTag)] } })], then: [say(HALLOWEEN_LINES.left90)], else: [say(HALLOWEEN_LINES.leftEarly)] }),
        ] }),
      ] }),
      row('status.remove', { who: SUB, status: ref(shaken) }), row('status.remove', { who: SUB, status: ref(doomed) }),
    ]),
    rule('Halloween: a green button opens its door', [row('body.died', { who: { forms: [ref(greenOpens)] }, cause: 'hit' })], [], [
      row('area.behaviors', { homeOf: SUB, kind: 'door', on: false }),
      row('forEach', { who: { w: 'homeMates' }, wait: false, do: [
        whenForm([hiddenB], greenShutsB), whenForm([redLocked], redOpen),
      ] }),
    ]),
    rule('Halloween: a green button shuts its door', [row('body.died', { who: { forms: [ref(greenShuts), ref(greenShutsB)] }, cause: 'hit' })], [], [
      row('area.behaviors', { homeOf: SUB, kind: 'door', on: true }),
      row('forEach', { who: { w: 'homeMates' }, wait: false, do: [
        whenForm([greenShutsB], hiddenB), whenForm([greenShuts, yellowShuts], yellowOpens), whenForm([redOpen, lockGone], redLocked),
      ] }),
    ]),
    rule('Halloween: a broken lock opens its door', [row('body.died', { who: { forms: [ref(redLocked)] }, cause: 'hit' })], [], [
      row('area.behaviors', { homeOf: SUB, kind: 'door', on: false }),
      row('forEach', { who: { w: 'homeMates' }, wait: false, do: [whenForm([greenOpens, yellowOpens], hiddenA)] }),
    ]),
    rule('Halloween: a broken jam shuts its door', [row('body.died', { who: { forms: [ref(redJammed)] }, cause: 'hit' })], [], [
      row('area.behaviors', { homeOf: SUB, kind: 'door', on: true }),
      row('forEach', { who: { w: 'homeMates' }, wait: false, do: [whenForm([hiddenA], yellowOpens)] }),
    ]),
    rule('Halloween: a pressed button rests', [row('body.changed', { who: { forms: [ref(yellowShuts), ref(yellowOpens), ref(hiddenA), ref(hiddenB), ref(lockGone)] } })], [], [row('status.add', { who: SUB, status: ref(resting) })]),
  ];
  const notPlayerBot = {};
  rules.push(
    rule('Halloween: a bot is drawn into the patch', [row('bot.sees', { who: notPlayerBot, what: 'area', area: ref({ id: patch.uid!, name: patch.name }), again: HALLOWEEN.BOT_ASK_AGAIN_S })],
      [row('chance', { pct: HALLOWEEN.BOT_PATCH_PCT }), notCursed()],
      [row('bot.interest', { who: SUB, do: 'stay', until: 'tag', tag: ref(cursedTag), giveUp: HALLOWEEN.BOT_GIVE_UP_S })]),
    rule('Halloween: a bot opens a door', [row('bot.sees', { who: notPlayerBot, what: 'entity', thing: { forms: [ref(greenOpens), ref(greenShuts), ref(greenShutsB)] }, again: HALLOWEEN.BOT_ASK_AGAIN_S })],
      [row('chance', { pct: HALLOWEEN.BOT_DOOR_PCT })],
      [row('bot.interest', { who: SUB, do: 'destroy', thing: { w: 'other' }, until: 'never', giveUp: 60 })]),
    rule('Halloween: a bot goes for a generator', [row('bot.sees', { who: notPlayerBot, what: 'entity', thing: { types: [ref(westGen.type), ref(eastGen.type)] }, again: HALLOWEEN.BOT_ASK_AGAIN_S })],
      [row('chance', { pct: HALLOWEEN.BOT_GEN_PCT })],
      [row('bot.interest', { who: SUB, do: 'destroy', thing: { w: 'other' }, until: 'never', giveUp: 120 })]),
  );
  const notMapThing = (): Row => row('not', { list: [row('body.is', { who: SUB, is: { types: [ref(westGen.type), ref(eastGen.type), ref(buttonType)] } })] });
  const obRules = (outbreak.rules ?? []).map(r => {
    if (r.id === 100) return { ...r, cond: [...(r.cond ?? []), notCursed(), notMapThing()] };
    if (r.id === 120) return { ...r, cond: [...(r.cond ?? []), notCursed()] };
    return r;
  });

  const zones: ZoneLike[] = [floor, ...morefloor, ...wormGround, ...wormTiles, westWing, eastWing, westHalf, eastHalf, patch, westNest, eastNest, loot, grounds, westSpots, eastSpots, ...doorZones];

  let mid = 1;
  const walls = ASYLUM_WALLS.map(([gx, gy, cw, ch]) => ({ id: mid++, gx, gy, cw, ch }));
  const portals = ASYLUM_WORMHOLES.map(([gx, gy]) => ({ id: mid++, gx, gy, staticPos: true }));
  const [pw, pe, pn] = portals;
  const worm = (p: { id: number }, exit: { id: number }, both: boolean, emit?: number): PortalKindConfig => ({ portalId: p.id, kind: 'wormhole', exitAreaId: '', exitPortalId: exit.id, bothWays: both, ...(emit !== undefined ? { emitAngle: emit } : {}) });
  const customZones = zones.map(z => ({ ...z, id: mid++ })) as unknown as NonNullable<MapConfig['customMap']>['zones'];
  for (const r of late) r.id = id();

  const events: MapEventsDoc = {
    ...outbreak,
    v: EVENTS_DOC_VERSION,
    nextId: next + 1,
    meta: { ...(outbreak.meta ?? {}), shipped: 'halloween' },
    tags: [...(outbreak.tags ?? []), cursedTag, shakenTag, doomedTag],
    statuses: [...(outbreak.statuses ?? []), ...statuses] as MapEventsDoc['statuses'],
    vars: [westPower, eastPower] as MapEventsDoc['vars'],
    types: [westGen.type, eastGen.type, buttonType],
    tanks: [buttonTank, lockedTank],
    placed,
    rules: [...obRules, ...rules],
  } as MapEventsDoc;

  return {
    map: {
      name: 'Haunted Asylum', mazeType: MAZE_TYPE_CUSTOM, gridCells: GC, gridCellsY: GCY, mapScale: ASYLUM_GRID.mapScale,
      enableMaze: false, enableRocks: false, enablePortals: true, enableSpawnAreas: false, bossesCanGrow: false,
      wallBlocks: true,
      customMap: { nextId: mid, walls, rocks: [], zones: customZones, portals },
      portalKinds: [worm(pw, pe, true, 0), worm(pe, pw, true, 180), worm(pn, pw, false)],
    },
    mapAreas: { nextId: 1, zones: [] },
    events,
  };
}
