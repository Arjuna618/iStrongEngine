import type { Num, Target } from './doc';
import { SIDE_WORDS } from './doc';
import type { MapEventsVM } from './vm';
import { SMALL_FIX } from '../smallFixSwitch';

export type Field =
  | { t: 'num'; def: Num; min?: number; max?: number; unit?: string; label?: string; quiet?: true }
  | { t: 'int'; def: number; min: number; max: number; label?: string }
  | { t: 'bool'; def: boolean; label?: string }
  | { t: 'enum'; of: readonly string[]; shown?: readonly string[]; def: string; label?: string }
  | { t: 'text'; def: string; tokens: readonly string[]; max: number; label?: string }
  | { t: 'target'; def: Target; only?: readonly string[]; label?: string }
  | { t: 'ref'; of: RefOf; optional?: boolean; label?: string }
  | { t: 'refs'; of: RefOf; label?: string }
  | { t: 'tank'; label?: string }
  | { t: 'team'; label?: string }
  | { t: 'teams'; label?: string }
  | { t: 'words'; label?: string }
  | { t: 'walls'; def: readonly number[]; label?: string }
  | { t: 'wavetest'; label?: string }
  | { t: 'bodytest'; label?: string }
  | { t: 'cards'; label?: string }
  | { t: 'place'; label?: string }
  | { t: 'nums'; label?: string }
  | { t: 'ints'; label?: string }
  | { t: 'steps'; label?: string }
  | { t: 'conds'; label?: string }
  | { t: 'rows'; family: string; label?: string }
  | { t: 'json'; label?: string };
export type RefOf = 'area' | 'entity' | 'type' | 'form' | 'plan' | 'rule' | 'var' | 'timer' | 'signal' | 'tag' | 'status' | 'seq' | 'behavior' | 'group';

export type Family = 'trigger' | 'cond' | 'step' | 'behavior' | 'effect' | 'order';

export interface KindDef {
  kind: string;
  family: Family;
  v: number;
  formerly?: readonly string[];
  up?: readonly ((a: Record<string, unknown>) => Record<string, unknown>)[];
  label: string;
  tip: string;
  group: string;
  sentence: string;
  fields: Record<string, Field>;
  wires?: readonly string[];
  proof: string;
  door?: boolean;
  internal?: boolean;
  op?: number;
  lower?: 'if' | 'pick' | 'repeat' | 'forEach' | 'fork' | 'waitUntil' | 'all' | 'any' | 'not' | 'call' | 'play';
  run?(vm: MapEventsVM, f: number, ip: number): number;
  test?(vm: MapEventsVM, f: number, ip: number): boolean;
  match?(vm: MapEventsVM, ip: number, s: number): boolean;
  armed?: 'clock' | 'stay' | 'count' | 'var';
}

export const NEXT = 0, WAIT = -1, END = -2;

const TOK_WAVE = ['wave'] as const;
const TOK_SUBJECT = ['wave', 'seconds', 'tier', 'name', 'tank', 'team', 'TEAM', 'killer', 'area', 'count', 'special'] as const;
const ANY_SUBJECT_TARGET = ['subject', 'other', 'killer', 'self', 'lastSpawned', 'player', 'allPlayers', 'allTanks', 'leader', 'followers', 'homeMates', 'entity', 'type', 'tag', 'inArea', 'tank', 'team', 'colour', 'pick'] as const;
export const AREA_BEHAVIOR_WORDS = ['spawnPlace', 'spawn', 'kill', 'bounce', 'solid', 'say', 'darkness', 'food', 'door', 'glow'] as const;

const ALL: KindDef[] = [];
const BY_WORD = new Map<string, KindDef>();
function k(d: KindDef): void { ALL.push(d); }

const SUB: Target = { w: 'subject' };

export function darkStepHides(a: Record<string, unknown>, k: string): boolean {
  const whole = a.where !== 'area';
  if (k === 'area') return whole;
  return !whole && k !== 'where' && k !== 'on' && k !== 'fade';
}

function darkLightFields(): Record<string, Field> {
  return {
    circle: { t: 'num', def: 5.6, min: 0, max: 100, label: 'Light Round A Tank, Tank Radii' },
    beam: { t: 'num', def: 24, min: 0, max: 400, label: 'Light Toward The Aim, Tank Radii' },
    beamWidth: { t: 'num', def: 48.1, min: 0, max: 170, label: 'Width Of A Beam, Degrees' },
    gunBeam: { t: 'num', def: 6, min: 0, max: 100, label: 'Light From The Main Barrel, Barrel Lengths' },
    walls: { t: 'bool', def: true, label: 'Walls Block The Light' },
    memory: { t: 'num', def: 1.5, min: 0, max: 60, unit: 's', label: 'Bots Remember A Lost Target' },
    feel: { t: 'bool', def: true, label: 'Bots Turn Toward A Hit From The Dark' },
    minimap: { t: 'enum', of: ['normal', 'scatter'], shown: ['As Always', 'Walls Hidden, Dots Scattered'], def: 'normal', label: 'The Minimap In The Dark' },
    followIn: { t: 'num', def: 0.35, min: 0, max: 10, unit: 's', label: 'Fog Closes Behind The Light' },
    followOut: { t: 'num', def: 0.25, min: 0, max: 10, unit: 's', label: 'Fog Clears Where The Light Comes' },
    crashers: { t: 'bool', def: true, label: 'Crashers See In The Dark' },
    viewReach: { t: 'bool', def: true, label: 'Light Reaches With The Tank\'s View' },
    spills: { t: 'bool', def: false, label: 'Light Spills Out Of It' },
    spillCells: { t: 'num', def: 6, min: 1, max: 20, label: 'Spill Reach, Cells' },
    roundLight: { t: 'num', def: 60, min: 0, max: 400, unit: '%', label: 'Round Light With No Aim, Share Of The Beam' },
  };
}

k({ kind: 'match.started', family: 'trigger', v: 1, group: 'Time', label: 'The Match Starts', tip: 'Fires once, when the match begins.', sentence: 'the match starts', fields: {}, proof: 'T01' });
k({ kind: 'time.at', family: 'trigger', v: 1, group: 'Time', armed: 'clock', label: 'At A Time', tip: 'Fires once, this many seconds into the match.', sentence: '{at} seconds into the match', fields: { at: { t: 'num', def: 60, min: 0, unit: 's', label: 'Seconds' } }, proof: 'T02' });
k({ kind: 'time.every', family: 'trigger', v: 1, group: 'Time', armed: 'clock', label: 'Every So Often', tip: 'Fires again and again. A random range is rolled anew each time.', sentence: 'every {every} seconds', fields: { every: { t: 'num', def: 30, min: 0.05, unit: 's', label: 'Every' }, first: { t: 'num', def: 30, min: 0, unit: 's', label: 'First After' }, times: { t: 'int', def: 0, min: 0, max: 1000000, label: 'How Many Times, 0 Is For Ever' } }, proof: 'T03' });
k({ kind: 'timer.ended', family: 'trigger', v: 1, group: 'Time', label: 'A Timer Ends', tip: 'Fires when the timer reaches zero.', sentence: 'timer {timer} ends', fields: { timer: { t: 'ref', of: 'timer', label: 'Timer' } }, match: (vm, ip, s) => vm.sigKey[s] === vm.code[ip + 1], proof: 'T04' });
k({ kind: 'timer.tick', family: 'trigger', v: 1, group: 'Time', label: 'A Timer Reaches A Mark', tip: 'Fires at each mark of the timer. {seconds} is the seconds left.', sentence: 'timer {timer} reaches a mark', fields: { timer: { t: 'ref', of: 'timer', label: 'Timer' } }, match: (vm, ip, s) => vm.sigKey[s] === vm.code[ip + 1], proof: 'T05' });

k({ kind: 'wave.started', family: 'trigger', v: 1, group: 'Waves', label: 'A Wave Starts', tip: 'Fires at the first moment of a wave, before its first birth.', sentence: 'a wave of {plan} starts', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' }, test: { t: 'wavetest', label: 'Which Waves' } }, match: (vm, ip, s) => vm.planWaveMatch(ip, s), proof: 'T06' });
k({ kind: 'wave.allBorn', family: 'trigger', v: 1, group: 'Waves', label: 'A Wave Is All Born', tip: 'Fires when the last unit of the wave has come.', sentence: 'all of a wave of {plan} has come', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' }, test: { t: 'wavetest', label: 'Which Waves' } }, match: (vm, ip, s) => vm.planWaveMatch(ip, s), proof: 'T07' });
k({ kind: 'wave.cleared', family: 'trigger', v: 1, group: 'Waves', label: 'A Wave Is Cleared', tip: 'Fires when nothing that holds the next wave is left. {seconds} is the break to the next one.', sentence: 'a wave of {plan} is cleared', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' }, test: { t: 'wavetest', label: 'Which Waves' } }, match: (vm, ip, s) => vm.planWaveMatch(ip, s), proof: 'T08' });
k({ kind: 'wave.special', family: 'trigger', v: 1, group: 'Waves', label: 'A Special Wave Comes', tip: 'Fires when a special wave is rolled. {special} is its name.', sentence: 'a special wave of {plan} comes', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' } }, match: (vm, ip, s) => vm.code[ip + 1] < 0 || vm.sigKey[s] === vm.code[ip + 1], proof: 'T09' });
k({ kind: 'plan.finished', family: 'trigger', v: 1, group: 'Waves', label: 'A Wave Plan Finishes', tip: 'Fires after its Last Wave is cleared. An Endless plan never fires it.', sentence: 'wave plan {plan} finishes', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' } }, match: (vm, ip, s) => vm.code[ip + 1] < 0 || vm.sigKey[s] === vm.code[ip + 1], proof: 'T10' });

k({ kind: 'body.born', family: 'trigger', v: 1, group: 'Bodies', label: 'Something Is Born', tip: 'Fires when a Map Event, a wave or a placed entity makes a body. The new body is It (the Subject).', sentence: '{who} is born', fields: { who: { t: 'bodytest', label: 'Which' } }, match: (vm, ip, s) => vm.bodyMatch(vm.code[ip + 1], s), proof: 'T11' });
k({ kind: 'body.died', family: 'trigger', v: 1, group: 'Bodies', wires: ['death'], label: 'Something Dies', tip: 'Fires when something dies. The one that died is It (the Subject); the one that killed it is What Hit It (the Other).', sentence: '{who} dies', fields: { who: { t: 'bodytest', label: 'Which' }, by: { t: 'bodytest', label: 'Killed By' }, cause: { t: 'enum', of: ['any', 'hit', 'area', 'rule'], shown: ['Any Way', 'A Hit', 'A Damaging Area', 'A Map Event'], def: 'any', label: 'How' } }, match: (vm, ip, s) => vm.diedMatch(ip, s), proof: 'T12' });
k({ kind: 'body.changed', family: 'trigger', v: 1, group: 'Bodies', label: 'Something Changes', tip: 'Fires when a body Becomes another or Changes Tank. The new body is It (the Subject).', sentence: '{who} changes', fields: { who: { t: 'bodytest', label: 'Which' }, from: { t: 'ref', of: 'form', optional: true, label: 'From Form' }, to: { t: 'ref', of: 'form', optional: true, label: 'To Form' }, how: { t: 'enum', of: ['any', 'become', 'morph'], shown: ['Any Way', 'Become', 'Change Tank'], def: 'any', label: 'How' } }, match: (vm, ip, s) => vm.changedMatch(ip, s), proof: 'T13' });
k({ kind: 'player.spawned', family: 'trigger', v: 1, group: 'Bodies', label: 'The Player Spawns', tip: 'Fires when the player joins or comes back.', sentence: 'the player spawns', fields: {}, proof: 'T14' });
k({ kind: 'player.died', family: 'trigger', v: 1, group: 'Bodies', label: 'The Player Dies', tip: 'Fires when the player dies. The player is It (the Subject); the one that killed him is What Hit It (the Other).', sentence: 'the player dies', fields: {}, proof: 'T15' });
k({ kind: 'count.crossed', family: 'trigger', v: 1, group: 'Bodies', armed: 'count', label: 'A Count Crosses A Number', tip: 'Fires when the number alive of a tag, an Entity Type or a side gets to the number you set.', sentence: 'the count of {tag}{type}{team} {dir} {n}', fields: { tag: { t: 'ref', of: 'tag', optional: true, label: 'Tag' }, type: { t: 'ref', of: 'type', optional: true, label: 'Entity Type' }, team: { t: 'team', label: 'Side' }, n: { t: 'int', def: 0, min: 0, max: 100000, label: 'Number' }, dir: { t: 'enum', of: ['fallsTo', 'risesTo', 'reaches'], shown: ['Falls To', 'Rises To', 'Reaches'], def: 'fallsTo', label: 'Direction' } }, match: (vm, ip, s) => vm.sigKey[s] === ip, proof: 'T16' });
k({ kind: 'var.crossed', family: 'trigger', v: 1, group: 'Values', armed: 'var', label: 'A Variable Crosses A Number', tip: 'Fires the moment the variable passes the test, for example when it rises above 10.', sentence: '{var} {op} {value}', fields: { var: { t: 'ref', of: 'var', label: 'Variable' }, op: { t: 'enum', of: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'], shown: ['Is', 'Is Not', 'Is Below', 'Is At Most', 'Is Above', 'Is At Least'], def: 'eq', label: 'Test' }, value: { t: 'num', def: 0, label: 'Number' } }, match: (vm, ip, s) => vm.sigKey[s] === ip, proof: 'T17' });

k({ kind: 'area.entered', family: 'trigger', v: 1, group: 'Custom Areas', wires: ['areaTrack'], label: 'Something Enters A Custom Area', tip: 'Fires when something walks into the Custom Area. The one that walked in is It (the Subject).', sentence: '{who} enters {area}', fields: { area: { t: 'ref', of: 'area', label: 'Custom Area' }, who: { t: 'bodytest', label: 'Which' } }, match: (vm, ip, s) => vm.sigKey[s] === vm.code[ip + 1] && vm.bodyMatch(vm.code[ip + 2], s), proof: 'T18' });
k({ kind: 'area.left', family: 'trigger', v: 1, group: 'Custom Areas', wires: ['areaTrack'], label: 'Something Leaves A Custom Area', tip: 'Fires when something walks out of the Custom Area. The one that walked out is It (the Subject).', sentence: '{who} leaves {area}', fields: { area: { t: 'ref', of: 'area', label: 'Custom Area' }, who: { t: 'bodytest', label: 'Which' } }, match: (vm, ip, s) => vm.sigKey[s] === vm.code[ip + 1] && vm.bodyMatch(vm.code[ip + 2], s), proof: 'T19' });
k({ kind: 'area.stayed', family: 'trigger', v: 1, group: 'Custom Areas', armed: 'stay', wires: ['areaTrack'], label: 'Something Stays In A Custom Area', tip: 'Fires when something has stood inside this long. Each one has its own clock.', sentence: '{who} stays in {area} for {seconds} seconds', fields: { area: { t: 'ref', of: 'area', label: 'Custom Area' }, who: { t: 'bodytest', label: 'Which' }, seconds: { t: 'num', def: 10, min: 0, unit: 's', label: 'Seconds' }, clock: { t: 'enum', of: ['reset', 'pause', 'decay'], shown: ['Starts Over On Leaving', 'Holds On Leaving', 'Runs Back On Leaving'], def: 'reset', label: 'Clock' } }, match: (vm, ip, s) => vm.sigKey[s] === ip, proof: 'T20' });

k({ kind: 'bot.sees', family: 'trigger', v: 1, group: 'Bots', label: 'A Bot Sees Something', tip: 'Fires when a bot sees a Custom Area, a Map Entity or a portal: in its view, not behind a wall, not in the dark. The bot is It (the Subject); an entity it saw is What Hit It (the Other). Each bot fires it once, then asks again only after a while. Add A Chance to roll whether it cares.', sentence: '{who} sees {what}', fields: {
  who: { t: 'bodytest', label: 'Which Bots' },
  what: { t: 'enum', of: ['area', 'entity', 'portal'], shown: ['A Custom Area', 'A Map Entity', 'A Portal'], def: 'area', label: 'Sees' },
  area: { t: 'ref', of: 'area', optional: true, label: 'Which Custom Area' },
  thing: { t: 'bodytest', label: 'Which Map Entity' },
  portal: { t: 'enum', of: ['any', 'wormhole', 'blackHole'], shown: ['Any Portal', 'A Wormhole', 'A Black Hole'], def: 'any', label: 'Which Portal' },
  again: { t: 'num', def: 30, min: 1, max: 3600, unit: 's', label: 'Asks Again After' },
}, match: (vm, ip, s) => vm.sigC[s] === ip, proof: 'T21' });
k({ kind: 'bot.joined', family: 'trigger', v: 1, group: 'Bots', label: 'A Bot Joins The Match', tip: 'Fires each time a bot of the mode joins the match or comes back after a death, and once for each bot already there when the match starts. The bot is It (the Subject). Bodies that Map Events makes fire Something Is Born instead, and a base guard never fires it.', sentence: '{who} joins the match', fields: { who: { t: 'bodytest', label: 'Which Bots' } }, match: (vm, ip, s) => vm.bodyMatch(vm.code[ip + 1], s), proof: 'T23' });
k({ kind: 'wall.touched', family: 'trigger', v: 1, group: 'Walls', label: 'A Tank Touches A Wall', tip: "Fires when a tank (the player or a bot) starts to touch a wall of these types (none chosen: any wall with a type). The tank is It (the Subject).", sentence: '{who} touches {walls}', fields: { who: { t: 'bodytest', label: 'Which Tanks' }, walls: { t: 'walls', def: [], label: 'These Wall Types' } }, match: (vm, ip, s) => vm.bodyMatch(vm.code[ip + 1], s) && vm.wallMatch(vm.code[ip + 2], s), proof: 'T24' });
k({ kind: 'wall.left', family: 'trigger', v: 1, group: 'Walls', label: 'A Tank Leaves A Wall', tip: "Fires when a tank stops touching a wall of these types it was touching (none chosen: any wall with a type). The tank is It (the Subject).", sentence: '{who} leaves {walls}', fields: { who: { t: 'bodytest', label: 'Which Tanks' }, walls: { t: 'walls', def: [], label: 'These Wall Types' } }, match: (vm, ip, s) => vm.bodyMatch(vm.code[ip + 1], s) && vm.wallMatch(vm.code[ip + 2], s), proof: 'T25' });
k({ kind: 'signal.got', family: 'trigger', v: 1, group: 'Values', label: 'A Signal Comes', tip: 'Fires when a Map Event sends this signal.', sentence: 'signal {signal} comes', fields: { signal: { t: 'ref', of: 'signal', label: 'Signal' } }, match: (vm, ip, s) => (SMALL_FIX.GH522 ? vm.sigA[s] - 1 : vm.sigKey[s]) === vm.code[ip + 1], proof: 'T21' });
k({ kind: 'run.ended', family: 'trigger', v: 1, group: 'Values', label: 'A Map Event Finishes', tip: 'Fires when that Map Event has done all its steps.', sentence: '{rule} finishes', fields: { rule: { t: 'ref', of: 'rule', label: 'Map Event' } }, match: (vm, ip, s) => vm.sigKey[s] === vm.code[ip + 1], proof: 'T22' });

for (const [kind, label, wire] of [['body.damaged', 'Something Is Hurt', 'damage'], ['body.healthBelow', 'Health Falls Below', 'damage'], ['body.killed', 'Something Kills', 'anyDeath'], ['tank.changed', 'A Tank Upgrades', 'upgrade'], ['leader.changed', 'The Leader Changes', 'leader'], ['portal.used', 'A Portal Is Used', 'portal'], ['key.pressed', 'A Key Is Pressed', 'key'], ['dialog.choice', 'A Choice Is Made', 'dialog'], ['player.near', 'The Player Comes Near', 'near']] as const) {
  k({ kind, family: 'trigger', v: 1, door: true, group: 'Later', wires: [wire], label, tip: 'Comes in a later version.', sentence: label.toLowerCase(), fields: { args: { t: 'json' } }, proof: 'D1' });
}

const CMP_OPS = ['eq', 'ne', 'lt', 'le', 'gt', 'ge'] as const;
k({ kind: 'cmp', family: 'cond', v: 1, group: 'Values', label: 'A Number Test', tip: 'Compares two numbers. Either can be a wave number, a count, a variable or a formula.', sentence: '{a} {op} {b}', fields: { a: { t: 'num', def: 0, label: 'This' }, op: { t: 'enum', of: CMP_OPS, shown: ['Is', 'Is Not', 'Is Below', 'Is At Most', 'Is Above', 'Is At Least'], def: 'eq', label: 'Test' }, b: { t: 'num', def: 0, label: 'That' } }, test: (vm, f, ip) => vm.cmpTest(f, ip), proof: 'C01' });
k({ kind: 'all', family: 'cond', v: 1, group: 'Logic', lower: 'all', label: 'All Of These', tip: 'Every test inside must hold.', sentence: 'all of these', fields: { list: { t: 'conds', label: 'The Tests' } }, proof: 'C02' });
k({ kind: 'any', family: 'cond', v: 1, group: 'Logic', lower: 'any', label: 'Any Of These', tip: 'One test inside is enough.', sentence: 'any of these', fields: { list: { t: 'conds', label: 'The Tests' } }, proof: 'C03' });
k({ kind: 'not', family: 'cond', v: 1, group: 'Logic', lower: 'not', label: 'Not This', tip: 'Holds when the test inside does not hold.', sentence: 'not this', fields: { list: { t: 'conds', label: 'The Tests' } }, proof: 'C04' });
k({ kind: 'wave.is', family: 'cond', v: 1, group: 'Waves', label: 'The Wave Is', tip: 'Tests the wave number of a plan.', sentence: 'the wave of {plan} is {test}', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' }, test: { t: 'wavetest', label: 'Which Waves' } }, test: (vm, f, ip) => vm.waveIsTest(f, ip), proof: 'C05' });
k({ kind: 'chance', family: 'cond', v: 1, group: 'Values', label: 'A Chance', tip: 'Holds this percent of the time, like rolling dice. Each Map Event rolls its own dice.', sentence: 'chance {pct} %', fields: { pct: { t: 'num', def: 50, min: 0, max: 100, unit: '%', label: 'Percent' } }, test: (vm, f, ip) => vm.chanceTest(f, ip), proof: 'C06' });
k({ kind: 'alive', family: 'cond', v: 1, group: 'Bodies', label: 'Something Is Alive', tip: 'At least one of these is alive.', sentence: '{who} is alive', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' } }, test: (vm, f, ip) => vm.aliveTest(f, ip), proof: 'C07' });
k({ kind: 'living.left', family: 'cond', v: 1, group: 'Bodies', label: 'A Living Player Is Left', tip: "Holds while the player stands, or one of the mode's own bots or a bot a command spawned is alive, or one of the mode's own bots can still come in because the arena has room for it. A body a Map Event made (a zombie, a follower), a boss, a sentry and a base guard never count.", sentence: 'a living player is left', fields: {}, test: (vm) => vm.livingLeftTest(), proof: 'C15' });
k({ kind: 'body.is', family: 'cond', v: 1, group: 'Bodies', label: 'The Tank Is', tip: 'Checks the first of them: is it of this side, this tank, a tag or an Entity Type? It can ask about one that just died.', sentence: '{who} is {is}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, is: { t: 'bodytest', label: 'Is' } }, test: (vm, f, ip) => vm.bodyIsTest(f, ip), proof: 'C08' });
k({ kind: 'killer.is', family: 'cond', v: 1, group: 'Bodies', label: 'The Killer Is', tip: 'Checks what killed It (the Subject). When nothing killed it, it holds only with No Killer Counts on.', sentence: 'the killer is {is}', fields: { is: { t: 'bodytest', label: 'Is' }, none: { t: 'bool', def: false, label: 'No Killer Counts' } }, test: (vm, f, ip) => vm.killerIsTest(f, ip), proof: 'C09' });
k({ kind: 'in.area', family: 'cond', v: 1, group: 'Custom Areas', label: 'Inside A Custom Area', tip: 'Holds if the first of these stands inside it.', sentence: '{who} is inside {area}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, area: { t: 'ref', of: 'area', label: 'Custom Area' } }, test: (vm, f, ip) => vm.inAreaTest(f, ip), proof: 'C10' });
k({ kind: 'rule.running', family: 'cond', v: 1, group: 'Values', label: 'A Map Event Is Running', tip: 'Holds while that Map Event is still doing its steps.', sentence: '{rule} is running', fields: { rule: { t: 'ref', of: 'rule', label: 'Map Event' } }, test: (vm, f, ip) => vm.ruleLive[vm.code[ip + 1]] > 0, proof: 'C11' });
k({ kind: 'timer.running', family: 'cond', v: 1, group: 'Values', label: 'A Timer Is Running', tip: 'It has been started and not stopped.', sentence: '{timer} is running', fields: { timer: { t: 'ref', of: 'timer', label: 'Timer' } }, test: (vm, f, ip) => vm.timerRunning(vm.code[ip + 1]), proof: 'C12' });
k({ kind: 'dark.is', family: 'cond', v: 1, group: 'Custom Areas', label: 'It Is Dark There', tip: 'Holds if the first of these stands in a dark place now (a Darkness that is on, or the whole map dark).', sentence: '{who} stands in the dark', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' } }, test: (vm, f, ip) => vm.darkIsTest(f, ip), proof: 'C14' });
k({ kind: 'behavior.on', family: 'cond', v: 1, group: 'Custom Areas', label: 'A Behaviour Is On', tip: 'Holds while that behaviour of a Custom Area is switched on.', sentence: '{behavior} is on', fields: { behavior: { t: 'ref', of: 'behavior', label: 'Behaviour' } }, test: (vm, f, ip) => vm.behaviorIsOn(vm.code[ip + 1]), proof: 'C13' });
for (const [kind, label] of [['level.is', 'The Level Is'], ['score.is', 'The Score Is'], ['tier.is', 'The Tier Is'], ['distance.is', 'The Distance Is'], ['sight.has', 'Can See'], ['team.most', 'The Team With The Most']] as const) {
  k({ kind, family: 'cond', v: 1, door: true, group: 'Later', label, tip: 'Comes in a later version.', sentence: label.toLowerCase(), fields: { args: { t: 'json' } }, proof: 'D1' });
}

k({ kind: 'spawn', family: 'step', v: 1, group: 'Bodies', label: 'Spawn', tip: 'Makes tanks or shapes. Each one picks one of the cards: a card with a bigger share is picked more often. Spread Out above 0 (a spot: a point, the Subject, a Home): they are born that far from it, evenly round it, facing out, and one Thrown Out When Born is thrown that way (the three flags of an Outpost).', sentence: 'Spawn {count} of {what} at {at}', fields: { what: { t: 'cards', label: 'What' }, count: { t: 'num', def: 1, min: 0, max: 2000, label: 'How Many' }, at: { t: 'place', label: 'Where' }, side: { t: 'team', label: 'Side' }, name: { t: 'text', def: '', tokens: TOK_SUBJECT, max: 64, label: 'Name' }, tags: { t: 'refs', of: 'tag', label: 'Tags' }, showName: { t: 'bool', def: false, label: 'Show Name' }, spread: { t: 'num', def: 0, min: 0, max: 5000, unit: 'units', label: 'Spread Out', quiet: true } }, run: (vm, f, ip) => vm.opSpawn(f, ip), proof: 'S01' });
k({ kind: 'kill', family: 'step', v: 1, group: 'Bodies', label: 'Kill', tip: 'Kills it with the normal death. No one gets credit. A share below 100 % kills that share of them, picked at random.', sentence: 'Kill {who}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, share: { t: 'num', def: 100, min: 0, max: 100, unit: '%', label: 'Share Of Them' } }, run: (vm, f, ip) => vm.opKill(f, ip), proof: 'S02' });
k({ kind: 'remove', family: 'step', v: 1, group: 'Bodies', label: 'Remove', tip: 'Takes it away at once, with no death and no signal.', sentence: 'Remove {who}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' } }, run: (vm, f, ip) => vm.opRemove(f, ip), proof: 'S03' });
k({ kind: 'become', family: 'step', v: 1, group: 'Bodies', label: 'Become', tip: 'A new body on the same spot at full health. The old one plays the normal death.', sentence: '{who} Becomes {to}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, form: { t: 'ref', of: 'form', optional: true, label: 'Form' }, tank: { t: 'tank', label: 'Or Tank' }, team: { t: 'team', label: 'Side' }, grace: { t: 'num', def: 0, min: 0, unit: 's', label: 'Cannot Be Hurt For' } }, run: (vm, f, ip) => vm.opBecome(f, ip), proof: 'S04' });
k({ kind: 'morph', family: 'step', v: 1, group: 'Bodies', label: 'Change Tank', tip: 'It turns into another tank on the spot. It keeps the same share of its health, with no death or birth to see.', sentence: '{who} Changes Tank To {to}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, form: { t: 'ref', of: 'form', optional: true, label: 'Form' }, tank: { t: 'tank', label: 'Or Tank' }, refill: { t: 'enum', of: ['none', 'shield', 'all'], shown: ['Nothing', 'The Shield', 'Health And Shield'], def: 'none', label: 'Fills' } }, run: (vm, f, ip) => vm.opMorph(f, ip), proof: 'S05' });
k({ kind: 'setTeam', family: 'step', v: 1, group: 'Bodies', label: 'Change Side', tip: 'Moves it to another side. For the player this asks the side rule first and says so if it refuses.', sentence: 'Move {who} to {team}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, team: { t: 'team', label: 'Side' } }, run: (vm, f, ip) => vm.opSetTeam(f, ip), proof: 'S06' });
k({ kind: 'setName', family: 'step', v: 1, group: 'Bodies', label: 'Set Name', tip: 'Changes the name it shows.', sentence: 'Name {who} {text}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, text: { t: 'text', def: '', tokens: TOK_SUBJECT, max: 64, label: 'Name' } }, run: (vm, f, ip) => vm.opSetName(f, ip), proof: 'S07' });
k({ kind: 'heal', family: 'step', v: 1, group: 'Bodies', label: 'Heal', tip: 'Gives back health, a number or a share of its full health.', sentence: 'Heal {who} by {amount}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, amount: { t: 'num', def: 100, min: 0, label: 'How Much' }, share: { t: 'bool', def: true, label: 'A Percent Of Full Health' } }, run: (vm, f, ip) => vm.opHeal(f, ip), proof: 'S08' });
k({ kind: 'damage', family: 'step', v: 1, group: 'Bodies', label: 'Damage', tip: 'Takes health away through the shield, like any hit. No one gets credit.', sentence: 'Hurt {who} by {amount}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, amount: { t: 'num', def: 10, min: 0, label: 'How Much' }, share: { t: 'bool', def: false, label: 'A Percent Of Full Health' } }, run: (vm, f, ip) => vm.opDamage(f, ip), proof: 'S09' });
k({ kind: 'invulnerable', family: 'step', v: 1, group: 'Bodies', label: 'Cannot Be Hurt', tip: 'Nothing can hurt it for this long. Its guns and its place in a fight stay.', sentence: '{who} cannot be hurt for {seconds} seconds', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, seconds: { t: 'num', def: 5, min: 0, unit: 's', label: 'Seconds' } }, run: (vm, f, ip) => vm.opInvulnerable(f, ip), proof: 'S10' });
k({ kind: 'invisible', family: 'step', v: 1, group: 'Bodies', label: 'Invisible', tip: 'Makes it invisible or visible again.', sentence: '{who} becomes {on}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, on: { t: 'bool', def: true, label: 'Invisible' }, style: { t: 'enum', of: ['always', 'whenStill'], shown: ['Always', 'When Standing Still'], def: 'always', label: 'How' } }, run: (vm, f, ip) => vm.opInvisible(f, ip), proof: 'S11' });
k({ kind: 'status.add', family: 'step', v: 1, group: 'Bodies', label: 'Add A Status', tip: 'Gives it a status: a set of effects such as a colour or a speed. Its own tank design stays as it was.', sentence: 'Give {who} status {status}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, status: { t: 'ref', of: 'status', label: 'Status' } }, run: (vm, f, ip) => vm.opStatusAdd(f, ip), proof: 'S12' });
k({ kind: 'status.remove', family: 'step', v: 1, group: 'Bodies', label: 'Remove A Status', tip: 'Takes the status off again.', sentence: 'Take status {status} from {who}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, status: { t: 'ref', of: 'status', label: 'Status' } }, run: (vm, f, ip) => vm.opStatusRemove(f, ip), proof: 'S13' });
k({ kind: 'teleport', family: 'step', v: 1, group: 'Bodies', label: 'Teleport', tip: 'Moves it to a place at once.', sentence: 'Teleport {who} to {to}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, to: { t: 'place', label: 'Where' } }, run: (vm, f, ip) => vm.opTeleport(f, ip), proof: 'S14' });
k({ kind: 'body.say', family: 'step', v: 1, group: 'Bodies', label: 'Say From A Tank', tip: 'A speech bubble over it.', sentence: '{who} says {text}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, text: { t: 'text', def: '', tokens: TOK_SUBJECT, max: 160, label: 'Words' } }, run: (vm, f, ip) => vm.opBodySay(f, ip), proof: 'S15' });
k({ kind: 'order', family: 'step', v: 1, group: 'Bodies', label: 'Give A Walking Order', tip: 'Changes how it moves from now on.', sentence: 'Order {who} to {order}', fields: { who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' }, order: { t: 'rows', family: 'order', label: 'Order' } }, run: (vm, f, ip) => vm.opOrder(f, ip), proof: 'S16' });

k({ kind: 'bot.interest', family: 'step', v: 1, group: 'Bots', label: 'Send A Bot To It', tip: 'Gives a bot an errand, done as it does food: a fight or a flight comes first, then it goes back to it. Go In And Stay: it walks into the area and roams inside until its end. Destroy It: it hunts that body until it dies. Go Through It: it drives into the portal. Forget It: the errand ends. Push It Toward: it stands behind that body on the line to the other side\'s base (or a Custom Area) and shoots it along that line, a rammer pushes it with its body. It gives up after a while in any case, at a time between the two numbers.', sentence: 'Send {who} to {do}', fields: {
  who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which Bot' },
  do: { t: 'enum', of: ['stay', 'destroy', 'through', 'forget', 'push'], shown: ['Go In And Stay', 'Destroy It', 'Go Through It', 'Forget It', 'Push It Toward'], def: 'stay', label: 'Errand' },
  area: { t: 'ref', of: 'area', optional: true, label: 'Custom Area (Empty: The One It Saw)' },
  thing: { t: 'target', def: { w: 'other' }, label: 'Which Body' },
  until: { t: 'enum', of: ['tag', 'seconds', 'never'], shown: ['It Carries A Tag', 'A Time Passes Inside', 'It Gives Up'], def: 'seconds', label: 'Stays Until' },
  tag: { t: 'ref', of: 'tag', optional: true, label: 'Tag' },
  seconds: { t: 'num', def: 60, min: 0, max: 3600, unit: 's', label: 'Seconds Inside' },
  giveUp: { t: 'num', def: 180, min: 1, max: 3600, unit: 's', label: 'Gives Up After' },
  toward: { t: 'enum', of: ['base', 'area'], shown: ['The Other Side\'s Base', 'A Custom Area'], def: 'base', label: 'Toward' },
  giveUpTo: { t: 'num', def: 0, min: 0, max: 3600, unit: 's', label: 'Gives Up By' },
}, run: (vm, f, ip) => vm.opBotInterest(f, ip), proof: 'S31' });
k({ kind: 'behavior.set', family: 'step', v: 1, group: 'Custom Areas', label: 'Switch A Behaviour', tip: 'Turns one behaviour of a Custom Area on or off.', sentence: 'Turn {behavior} {on}', fields: { behavior: { t: 'ref', of: 'behavior', label: 'Behaviour' }, on: { t: 'bool', def: true, label: 'On' } }, run: (vm, f, ip) => vm.opBehaviorSet(f, ip), proof: 'S17' });
k({ kind: 'area.behaviors', family: 'step', v: 1, group: 'Custom Areas', label: 'Switch A Kind Of Behaviour', tip: 'Turns every behaviour of one kind in a Custom Area on or off: a named area, or the Home of a body, so one rule serves every place.', sentence: 'Turn the {kind} of {area} {on}', fields: { area: { t: 'ref', of: 'area', optional: true, label: 'Custom Area' }, homeOf: { t: 'target', def: SUB, only: ['subject', 'other', 'self', 'entity'], label: 'Or The Home Of' }, kind: { t: 'enum', of: AREA_BEHAVIOR_WORDS, shown: ['Player Spawn Place', 'Spawn Entities', 'Damaging Area', 'Bounce', 'Solid For', 'Message On Enter Or Leave', 'Darkness', 'Food Shapes', 'Door', 'Gives Light'], def: 'spawnPlace', label: 'Which' }, on: { t: 'bool', def: true, label: 'On' },
  flip: { t: 'bool', def: false, label: 'The Other Way' } }, run: (vm, f, ip) => vm.opAreaBehaviors(f, ip), proof: 'S17b' });
k({ kind: 'area.paint', family: 'step', v: 1, group: 'Custom Areas', label: 'Paint A Custom Area', tip: 'Changes its colour for this match, by a name of the colour map.', sentence: 'Paint {area} {slot}', fields: { area: { t: 'ref', of: 'area', optional: true, label: 'Custom Area' }, homeOf: { t: 'target', def: SUB, only: ['subject', 'other', 'self', 'entity'], label: 'Or The Home Of' }, slot: { t: 'int', def: 10, min: 0, max: 255, label: 'Colour' }, opacity: { t: 'num', def: 1, min: 0, max: 1, label: 'Opacity' } }, run: (vm, f, ip) => vm.opAreaPaint(f, ip), proof: 'S18' });
k({ kind: 'area.whitelist', family: 'step', v: 1, group: 'Custom Areas', label: 'Change A Whitelist', tip: 'Adds to or takes from the Whitelist of a Damaging Area for this match.', sentence: 'Change the Whitelist of {behavior}', fields: { behavior: { t: 'ref', of: 'behavior', label: 'Behaviour' }, add: { t: 'words', label: 'Add' }, remove: { t: 'words', label: 'Take Away' } }, run: (vm, f, ip) => vm.opAreaWhitelist(f, ip), proof: 'S19' });

k({ kind: 'wait', family: 'step', v: 1, group: 'Flow', label: 'Wait', tip: 'The next step comes after this many seconds.', sentence: 'Wait {seconds} seconds', fields: { seconds: { t: 'num', def: 1, min: 0, unit: 's', label: 'Seconds' } }, run: (vm, f, ip) => vm.opWait(f, ip), proof: 'F01' });
k({ kind: 'waitUntil', family: 'step', v: 1, group: 'Flow', lower: 'waitUntil', label: 'Wait Until', tip: 'Waits until the test holds, or the time runs out. 0 means no time limit.', sentence: 'Wait until {cond}', fields: { timeout: { t: 'num', def: 0, min: 0, unit: 's', label: 'Give Up After' }, cond: { t: 'conds', label: 'Until' } }, proof: 'F02' });
k({ kind: 'if', family: 'step', v: 1, group: 'Flow', lower: 'if', label: 'If', tip: 'Runs one list of steps or the other.', sentence: 'If {cond}', fields: { cond: { t: 'conds', label: 'If' }, then: { t: 'steps', label: 'Then' }, else: { t: 'steps', label: 'Otherwise' } }, proof: 'F03' });
k({ kind: 'pick', family: 'step', v: 1, group: 'Flow', lower: 'pick', label: 'Pick One', tip: 'Runs one of the lists of steps, picked at random. A list with a bigger share is picked more often.', sentence: 'Pick one of these', fields: { options: { t: 'json', label: 'Options' } }, proof: 'F04' });
k({ kind: 'repeat', family: 'step', v: 1, group: 'Flow', lower: 'repeat', label: 'Repeat', tip: 'Runs the steps inside this many times.', sentence: 'Repeat {times} times', fields: { times: { t: 'num', def: 3, min: 0, max: 100000, label: 'Times' }, do: { t: 'steps', label: 'Do' } }, proof: 'F05' });
k({ kind: 'forEach', family: 'step', v: 1, group: 'Flow', lower: 'forEach', label: 'For Each', tip: 'Runs the steps once for each of them. Inside, each one in turn is It (the Subject).', sentence: 'For each of {who}', fields: { who: { t: 'target', def: { w: 'allTanks' }, only: ANY_SUBJECT_TARGET, label: 'Which' }, wait: { t: 'bool', def: true, label: 'Wait For All' }, do: { t: 'steps', label: 'Do' } }, proof: 'F06' });
k({ kind: 'fork', family: 'step', v: 1, group: 'Flow', lower: 'fork', label: 'At The Same Time', tip: 'Runs these steps beside the rest, without waiting.', sentence: 'At the same time', fields: { do: { t: 'steps', label: 'Do' } }, proof: 'F07' });
k({ kind: 'call', family: 'step', v: 1, group: 'Flow', lower: 'call', label: 'Do A Custom Action', tip: 'Runs another Map Event from the top, with the same Subject.', sentence: 'Do {rule}', fields: { rule: { t: 'ref', of: 'rule', label: 'Custom Action' }, wait: { t: 'bool', def: false, label: 'Wait For It' }, args: { t: 'nums', label: 'Values' } }, proof: 'F08' });
k({ kind: 'play', family: 'step', v: 1, group: 'Flow', lower: 'play', label: 'Play A Sequence', tip: 'Runs one of the Sequences of this map: steps on a timeline.', sentence: 'Play {seq}', fields: { seq: { t: 'ref', of: 'seq', label: 'Sequence' }, wait: { t: 'bool', def: true, label: 'Wait For It' } }, proof: 'F09' });
k({ kind: 'signal', family: 'step', v: 1, group: 'Flow', label: 'Send A Signal', tip: 'Starts every Map Event waiting on this signal.', sentence: 'Send {signal}', fields: { signal: { t: 'ref', of: 'signal', label: 'Signal' }, who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'With Subject' } }, run: (vm, f, ip) => vm.opSignal(f, ip), proof: 'F10' });
k({ kind: 'var.set', family: 'step', v: 1, group: 'Values', label: 'Set A Variable', tip: 'Writes a number into it.', sentence: 'Set {var} to {value}', fields: { var: { t: 'ref', of: 'var', label: 'Variable' }, value: { t: 'num', def: 0, label: 'Number' } }, run: (vm, f, ip) => vm.opVarSet(f, ip), proof: 'F11' });
k({ kind: 'var.add', family: 'step', v: 1, group: 'Values', label: 'Add To A Variable', tip: 'Adds a number to it.', sentence: 'Add {value} to {var}', fields: { var: { t: 'ref', of: 'var', label: 'Variable' }, value: { t: 'num', def: 1, label: 'Number' } }, run: (vm, f, ip) => vm.opVarAdd(f, ip), proof: 'F12' });
k({ kind: 'timer.start', family: 'step', v: 1, group: 'Values', label: 'Start A Timer', tip: 'Starts it from its full time.', sentence: 'Start {timer}', fields: { timer: { t: 'ref', of: 'timer', label: 'Timer' } }, run: (vm, f, ip) => vm.opTimerStart(f, ip), proof: 'F13' });
k({ kind: 'timer.stop', family: 'step', v: 1, group: 'Values', label: 'Stop A Timer', tip: 'Stops it. Nothing more fires.', sentence: 'Stop {timer}', fields: { timer: { t: 'ref', of: 'timer', label: 'Timer' } }, run: (vm, f, ip) => vm.opTimerStop(f, ip), proof: 'F14' });
k({ kind: 'timer.pause', family: 'step', v: 1, group: 'Values', label: 'Pause A Timer', tip: 'Holds its time.', sentence: 'Pause {timer}', fields: { timer: { t: 'ref', of: 'timer', label: 'Timer' } }, run: (vm, f, ip) => vm.opTimerPause(f, ip), proof: 'F15' });
k({ kind: 'timer.resume', family: 'step', v: 1, group: 'Values', label: 'Resume A Timer', tip: 'Goes on from where it held.', sentence: 'Resume {timer}', fields: { timer: { t: 'ref', of: 'timer', label: 'Timer' } }, run: (vm, f, ip) => vm.opTimerResume(f, ip), proof: 'F16' });
k({ kind: 'timer.reset', family: 'step', v: 1, group: 'Values', label: 'Reset A Timer', tip: 'Back to its full time, running or not as it was.', sentence: 'Reset {timer}', fields: { timer: { t: 'ref', of: 'timer', label: 'Timer' } }, run: (vm, f, ip) => vm.opTimerReset(f, ip), proof: 'F17' });
k({ kind: 'rule.set', family: 'step', v: 1, group: 'Flow', label: 'Switch A Map Event', tip: 'Turns another Map Event on or off.', sentence: 'Turn {rule} {on}', fields: { rule: { t: 'ref', of: 'rule', label: 'Map Event' }, on: { t: 'bool', def: true, label: 'On' } }, run: (vm, f, ip) => vm.opRuleSet(f, ip), proof: 'F18' });
k({ kind: 'run.stop', family: 'step', v: 1, group: 'Flow', label: 'Stop Here', tip: 'Stops this Map Event here. The steps after it do not run.', sentence: 'Stop here', fields: {}, run: () => END, proof: 'F19' });

k({ kind: 'say', family: 'step', v: 1, group: 'Game', label: 'Show A Message', tip: 'Shows a line of text on the screen, like the game\'s own messages.', sentence: 'Show {text} to {to}', fields: { to: { t: 'enum', of: ['all', 'team', 'subject', 'inArea'], shown: ['Everyone', 'A Side', 'The Subject', 'Those Inside'], def: 'all', label: 'To' }, text: { t: 'text', def: '', tokens: TOK_SUBJECT, max: 240, label: 'Words' }, life: { t: 'num', def: 10, min: 0.1, max: 600, unit: 's', label: 'Stays For' }, team: { t: 'team', label: 'Side' }, area: { t: 'ref', of: 'area', optional: true, label: 'Custom Area' } }, run: (vm, f, ip) => vm.opSay(f, ip), proof: 'G01' });
k({ kind: 'lb.teams', family: 'step', v: 1, group: 'Game', label: 'Show Teams On The Leaderboard', tip: 'The leaderboard lists the sides and a variable of each, as Soccer lists the goals, under a first row that names the goal. Off: the tanks again.', sentence: 'Leaderboard shows the sides {on}', fields: {
  on: { t: 'bool', def: true, label: 'Show The Sides' },
  title: { t: 'text', def: 'GOALS TO WIN', tokens: [], max: 40, label: 'First Row' },
  goal: { t: 'num', def: 10, min: 0, max: 1000000, label: 'Goal' },
  unit: { t: 'text', def: 'Goals', tokens: [], max: 24, label: 'Word' },
  unitOne: { t: 'text', def: 'Goal', tokens: [], max: 24, label: 'Word For One' },
  s1: { t: 'ref', of: 'var', optional: true, label: 'First Side\'s Number' },
  s2: { t: 'ref', of: 'var', optional: true, label: 'Second Side\'s Number' },
  s3: { t: 'ref', of: 'var', optional: true, label: 'Third Side\'s Number' },
  s4: { t: 'ref', of: 'var', optional: true, label: 'Fourth Side\'s Number' }, count: { t: 'enum', of: ['vars', 'tanks'], shown: ['A Variable Of Each Side', 'The Tanks Of Each Side'], def: 'vars', label: 'What Each Side Shows' },
}, run: (vm, f, ip) => vm.opLbTeams(f, ip), proof: 'S61' });
k({ kind: 'hud.show', family: 'step', v: 1, group: 'Game', label: 'Show On The Screen', tip: 'A line in the stack above the minimap. A variable or a timer can be its text.', sentence: 'Show {text} on the screen', fields: { text: { t: 'text', def: '', tokens: TOK_SUBJECT, max: 64, label: 'Words' } }, run: (vm, f, ip) => vm.opHudShow(f, ip), proof: 'G02' });
k({ kind: 'wave.next', family: 'step', v: 1, group: 'Waves', label: 'Next Wave Now', tip: 'Starts the next wave at once. What is alive stays.', sentence: 'Start the next wave of {plan}', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' } }, run: (vm, f, ip) => vm.opWaveNext(f, ip), proof: 'G03' });
k({ kind: 'wave.set', family: 'step', v: 1, group: 'Waves', label: 'Set The Wave', tip: 'The next wave to come is this number.', sentence: 'Set the wave of {plan} to {n}', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' }, n: { t: 'num', def: 1, min: 1, label: 'Wave' } }, run: (vm, f, ip) => vm.opWaveSet(f, ip), proof: 'G04' });
k({ kind: 'wave.pause', family: 'step', v: 1, group: 'Waves', label: 'Pause The Waves', tip: 'Holds its clock and its births.', sentence: 'Pause the waves of {plan}', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' } }, run: (vm, f, ip) => vm.opWavePause(f, ip), proof: 'G05' });
k({ kind: 'wave.resume', family: 'step', v: 1, group: 'Waves', label: 'Resume The Waves', tip: 'Goes on from where it held.', sentence: 'Resume the waves of {plan}', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' } }, run: (vm, f, ip) => vm.opWaveResume(f, ip), proof: 'G06' });
k({ kind: 'wave.stop', family: 'step', v: 1, group: 'Waves', label: 'Stop The Waves', tip: 'No more waves come. What is alive stays.', sentence: 'Stop the waves of {plan}', fields: { plan: { t: 'ref', of: 'plan', optional: true, label: 'Wave Plan' } }, run: (vm, f, ip) => vm.opWaveStop(f, ip), proof: 'G07' });
k({ kind: 'walls.move', family: 'step', v: 1, group: 'Walls', label: 'Walls Move', tip: "Starts or stops the moving walls of every Magic Maze on the map, and sets how often each side wall moves and how long a move takes. A wall already sliding finishes its move.", sentence: 'Magic Maze walls move: {on}', fields: { on: { t: 'bool', def: true, label: 'They Move' }, perMinute: { t: 'num', def: 1.2, min: 0, max: 10, label: 'Moves A Minute' }, slide: { t: 'num', def: 1.99, min: 0.5, max: 10, unit: 's', label: 'Seconds A Move' } }, run: (vm, f, ip) => vm.opWallsMove(f, ip), proof: 'S62' });
k({ kind: 'walls.retype', family: 'step', v: 1, group: 'Walls', label: 'Change Wall Types', tip: "For a while, this share of the Magic Maze walls take a new type, rolled by the map's own chances for each type. When the time is up each one takes back its own type. 0 seconds: for good. A wall that is sliding keeps its type.", sentence: 'Change the type of {share} % of the walls for {seconds} s', fields: { share: { t: 'num', def: 30, min: 0, max: 100, unit: '%', label: 'Share Of The Walls' }, seconds: { t: 'num', def: 60, min: 0, max: 3600, unit: 's', label: 'For' } }, run: (vm, f, ip) => vm.opWallsRetype(f, ip), proof: 'S63' });
k({ kind: 'respawn.set', family: 'step', v: 1, group: 'Game', label: 'Allow Or Refuse Respawn', tip: 'Refused: the death screen says so, and bots of that side wait too.', sentence: '{on} respawn for {team}', fields: { team: { t: 'team', label: 'Side' }, on: { t: 'bool', def: false, label: 'Allowed' } }, run: (vm, f, ip) => vm.opRespawnSet(f, ip), proof: 'G08' });
k({ kind: 'match.end', family: 'step', v: 1, group: 'Game', label: 'End The Match', tip: 'A win or a loss. Then it can close the arena with Arena Closers.', sentence: 'End the match: {result} for {team}', fields: { result: { t: 'enum', of: ['lose', 'win'], shown: ['Lost', 'Won'], def: 'lose', label: 'Result' }, team: { t: 'team', label: 'Side' }, then: { t: 'enum', of: ['nothing', 'closeArena'], shown: ['Nothing More', 'Close The Arena'], def: 'closeArena', label: 'Then' }, closing: { t: 'text', def: 'Arena closed: No players may join!', tokens: [], max: 120, label: 'As It Closes' }, closed: { t: 'text', def: 'Arena closed.', tokens: [], max: 120, label: 'Once It Has Closed' }, screen: { t: 'text', def: '', tokens: [], max: 60, label: 'Death Screen Title' } }, run: (vm, f, ip) => vm.opMatchEnd(f, ip), proof: 'G09' });
k({ kind: 'tree.swap', family: 'step', v: 1, group: 'Game', label: 'Change The Upgrade Tree', tip: 'For this match only, one tank of the tree becomes another, or leaves it.', sentence: 'In the tree, {from} becomes {to}', fields: { from: { t: 'tank', label: 'This Tank' }, to: { t: 'tank', label: 'Becomes' } }, run: (vm, f, ip) => vm.opTreeSwap(f, ip), proof: 'G10' });
for (const [kind, label] of [['camera.goTo', 'Move The Camera'], ['camera.follow', 'Camera Follows'], ['camera.zoom', 'Zoom The Camera'], ['camera.shake', 'Shake The Camera'], ['camera.back', 'Camera Goes Back'], ['input.lock', 'Hold The Player'], ['letterbox', 'Black Bars'], ['dialog', 'A Line Of Talk'], ['sound', 'Play A Sound'], ['effect', 'Show An Effect'], ['wall.set', 'Add Or Remove A Wall'], ['portal.open', 'Open A Portal'], ['gravity', 'Gravity'], ['score.add', 'Give Score'], ['skill.add', 'Give Skill Points'], ['minimap.mark', 'Mark The Minimap'], ['offer.control', 'Offer Control'], ['attach', 'Attach'], ['size.set', 'Change Size'], ['colour.set', 'Change Colour'], ['speed.set', 'Change Speed']] as const) {
  k({ kind, family: 'step', v: 1, door: true, group: 'Later', label, tip: 'Comes in a later version.', sentence: label, fields: { args: { t: 'json' } }, proof: 'D1' });
}

k({ kind: 'darkness', family: 'step', v: 2, up: [() => ({})], group: 'Custom Areas', label: 'Darkness', tip: 'The whole map, everything past its edge, or the Darkness of a Custom Area, goes dark or clears. In the dark a tank sees only its own light, and so do the bots, their turrets and their drones.', sentence: 'Turn the darkness of {where} {on}', fields: {
  where: { t: 'enum', of: ['map', 'area', 'outside'], shown: ['The Whole Map', 'A Custom Area', 'Outside The Map'], def: 'map', label: 'Where' },
  area: { t: 'ref', of: 'area', optional: true, label: 'Custom Area' },
  on: { t: 'bool', def: true, label: 'Dark' },
  fade: { t: 'num', def: 0.35, min: 0, max: 60, unit: 's', label: 'Fade Seconds' },
  ...darkLightFields(),
}, run: (vm, f, ip) => vm.opDarkness(f, ip), proof: 'S20' });

k({ kind: 'copy.of', family: 'step', v: 2, up: [() => ({})], group: 'Bodies', label: 'Copy Of A Tank', tip: 'A new tank of the very same kind where it stands: its tank, level, skills, score and name, facing its way. Never the player himself: a copy of him is a bot. What This Spawned names the copy.', sentence: 'Make a copy of {who} on {side}', fields: {
  who: { t: 'target', def: SUB, only: ANY_SUBJECT_TARGET, label: 'Which' },
  side: { t: 'team', label: 'Side' },
  tags: { t: 'refs', of: 'tag', label: 'Tags' },
  name: { t: 'text', def: '', tokens: TOK_SUBJECT, max: 64, label: 'Name' },
}, run: (vm, f, ip) => vm.opCopyOf(f, ip), proof: 'S21' });

k({ kind: '_become', family: 'step', v: 1, internal: true, group: 'Internal', label: 'Become By Form', tip: '', sentence: 'Becomes its next form', fields: { typeForm: { t: 'int', def: -1, min: -1, max: 1e9 }, link: { t: 'int', def: -1, min: -1, max: 1e9 } }, run: (vm, f, ip) => vm.opLinkBecome(f, ip), proof: 'L01' });
k({ kind: '_formTank', family: 'step', v: 1, internal: true, group: 'Internal', label: 'Set A Form Tank', tip: '', sentence: 'Its form evolves', fields: { typeForm: { t: 'int', def: -1, min: -1, max: 1e9 }, tank: { t: 'tank' },
  tier: { t: 'int', def: 0, min: 0, max: 1e6 }, base: { t: 'bool', def: false } }, run: (vm, f, ip) => vm.opFormTank(f, ip), proof: 'L02' });
k({ kind: '_after', family: 'step', v: 1, internal: true, group: 'Internal', label: 'A Form Link In Time', tip: '', sentence: 'After a while it changes', fields: { typeForm: { t: 'int', def: -1, min: -1, max: 1e9 }, link: { t: 'int', def: -1, min: -1, max: 1e9 } }, run: (vm, f, ip) => vm.opAfterLink(f, ip), proof: 'L03' });

k({ kind: 'kill', family: 'behavior', v: 1, group: 'Places', label: 'Damaging Area', tip: 'Hurts what stands on it, unless its Whitelist spares it.', sentence: 'Takes {dps} damage a second from anything not on its Whitelist', fields: {
  whitelist: { t: 'words', label: 'Whitelist' },
  does: { t: 'enum', of: ['dps', 'pct', 'instant'], shown: ['Damage Per Second', 'Percent Of Health Per Second', 'At Once (Older Map)'], def: 'dps', label: 'Rate' },
  dps: { t: 'num', def: 1500, min: 0, unit: '/s', label: 'Damage Per Second' },
  pct: { t: 'num', def: 100, min: 0, unit: '%/s', label: 'Percent Of Health Per Second' },
  hitsRounds: { t: 'bool', def: true, label: 'Rounds Die On It' },
  ownerCounts: { t: 'bool', def: true, label: 'A Round Counts As Its Owner' },
  food: { t: 'enum', of: ['none', 'crashers', 'all'], shown: ['None', 'Crashers', 'All Shapes'], def: 'none', label: 'Which Shapes It Hurts' },
  foodPct: { t: 'num', def: 100, min: 0, unit: '%/s', label: 'Shapes: Percent Of Health Per Second' },
  test: { t: 'enum', of: ['touch', 'centre'], shown: ['Any Touch', 'The Middle Of The Body'], def: 'centre', label: 'Hurts When' },
  deathLine: { t: 'text', def: '', tokens: [], max: 120, label: 'Death Line' },
}, proof: 'B01' });
k({ kind: 'bounce', family: 'behavior', v: 1, group: 'Places', label: 'Bounce', tip: 'Kicks what touches it away from its middle.', sentence: 'Bounces what touches it', fields: { strength: { t: 'num', def: 1, min: 0, max: 20, label: 'Strength' }, whitelist: { t: 'words', label: 'Whitelist' }, minLevel: { t: 'int', def: 0, min: 0, max: 1000, label: 'Lets Through From Level' }, line: { t: 'text', def: '', tokens: [], max: 200, label: 'Says To One It Bounces' } }, proof: 'B02' });
k({ kind: 'solid', family: 'behavior', v: 1, group: 'Places', label: 'Solid For', tip: 'Holds these out as a wall would, without any damage.', sentence: 'Holds out {who}', fields: { who: { t: 'bodytest', label: 'Holds Out' } }, proof: 'B03' });
k({ kind: 'spawn', family: 'behavior', v: 1, group: 'Bodies', label: 'Spawn Entities', tip: 'Makes tanks or shapes here: on a timer, to replace the dead, up to a number, or in waves.', sentence: 'Spawns entities', fields: { settings: { t: 'json', label: 'Settings' } }, proof: 'B04' });
k({ kind: 'spawnPlace', family: 'behavior', v: 1, group: 'Bodies', label: 'Player Spawn Place', tip: 'Players and bots of these sides appear here. While a side has any, it appears nowhere else.', sentence: 'A spawn place for {teams}', fields: { teams: { t: 'teams', label: 'Sides' }, enabledAtStart: { t: 'bool', def: true, label: 'On At The Start' } }, proof: 'B05' });
k({ kind: 'while', family: 'behavior', v: 1, group: 'Status', label: 'While Inside', tip: 'Gives a status to whatever stands inside. The status goes away when it leaves.', sentence: 'While inside: {status}', fields: { status: { t: 'ref', of: 'status', label: 'Status' }, who: { t: 'bodytest', label: 'Which' } }, proof: 'B06' });
k({ kind: 'stay', family: 'behavior', v: 1, group: 'Status', label: 'Stay Timer', tip: 'Things happen to a body the longer it stays, by a clock of its own.', sentence: 'The longer it stays', fields: { who: { t: 'bodytest', label: 'Which' }, clock: { t: 'enum', of: ['reset', 'pause', 'decay'], shown: ['Starts Over On Leaving', 'Holds On Leaving', 'Runs Back On Leaving'], def: 'reset', label: 'On Leaving' }, stages: { t: 'json', label: 'Stages' }, repeatEvery: { t: 'num', def: 0, min: 0, unit: 's', label: 'A Line Every' }, lines: { t: 'json', label: 'Lines In Turn' }, leaveLine: { t: 'text', def: '', tokens: TOK_SUBJECT, max: 240, label: 'Words On Leaving' } }, proof: 'B07' });
k({ kind: 'say', family: 'behavior', v: 1, group: 'Status', label: 'Message On Enter Or Leave', tip: 'A line to who walked in, or out.', sentence: 'Says a line on entering or leaving', fields: { enter: { t: 'text', def: '', tokens: TOK_SUBJECT, max: 240, label: 'On Entering' }, leave: { t: 'text', def: '', tokens: TOK_SUBJECT, max: 240, label: 'On Leaving' }, who: { t: 'bodytest', label: 'Which' }, to: { t: 'enum', of: ['subject', 'all'], shown: ['That Tank', 'Everyone'], def: 'subject', label: 'To' } }, proof: 'B08' });
k({ kind: 'darkness', family: 'behavior', v: 2, up: [() => ({})], group: 'Places', label: 'Darkness', tip: 'It is dark here while it is on: a tank sees only its own light, round it and along its main gun (a round light when it has no main gun or spins by itself). Bots, their turrets and their drones see the same way. Switch it with Switch A Behaviour or the Darkness step.', sentence: 'Is dark: a tank sees only its own light', fields: {
  fadeIn: { t: 'num', def: 0.35, min: 0, max: 60, unit: 's', label: 'Seconds To Go Dark' },
  fadeOut: { t: 'num', def: 0.25, min: 0, max: 60, unit: 's', label: 'Seconds To Clear' },
  ...darkLightFields(),
}, proof: 'B09' });
k({ kind: 'door', family: 'behavior', v: 1, group: 'Places', label: 'Door', tip: 'Its cells are a door: shut (a wall) while this behaviour is on, open while it is off. Switch it with Switch A Behaviour, or every door of a kind at once with Switch A Kind Of Behaviour and the Home of a button. Bots find their way through it while it is open and round it while it is shut. A tank caught as it shuts is hurt and pushed out.', sentence: 'Is a door, shut while on', fields: {
  crush: { t: 'num', def: 300, min: 0, max: 10000, unit: '%/s', label: 'Crush Damage' },
  light: { t: 'num', def: 3, min: 0, max: 40, label: 'Light In The Dark, Cells' },
  lightShut: { t: 'num', def: 50, min: 0, max: 100, unit: '%', label: 'Light While Shut' },
}, proof: 'B11' });
k({ kind: 'glow', family: 'behavior', v: 1, group: 'Places', label: 'Gives Light', tip: 'Its cells give a soft light in the dark: it spreads along open ground, round corners and down hallways, never through a wall, and fades the farther it goes. Where nothing is dark it changes nothing. Bots see by it as the player does.', sentence: 'Gives light in the dark, {reach} cells', fields: {
  reach: { t: 'num', def: 4, min: 0.5, max: 40, label: 'Light Reach, Cells' },
  strength: { t: 'num', def: 100, min: 0, max: 100, unit: '%', label: 'Light Strength' },
}, proof: 'B12' });
k({ kind: 'food', family: 'behavior', v: 1, group: 'Bodies', label: 'Food Shapes', tip: 'Food shapes appear inside it by settings of its own: every setting the map has for its shapes (which shapes, how many, how fast), a copy of the map\'s to begin with. Its shapes count against its own cap, never the map\'s.', sentence: 'Food shapes appear inside it', fields: {
  shapes: { t: 'json', label: 'Which Shapes' },
  rate: { t: 'num', def: 50, min: 0, max: 100, label: 'Shape Spawn Multiplier' },
  keepOut: { t: 'bool', def: true, label: 'Keeps The Map\'s Shapes Out' },
}, proof: 'B10' });
for (const [kind, label] of [['pull', 'Pull'], ['speed', 'Speed Change'], ['gravity', 'Gravity'], ['capture', 'Capture Point'], ['pastEdge', 'Past The Map Edge']] as const) {
  k({ kind, family: 'behavior', v: 1, door: true, group: 'Later', label, tip: 'Comes in a later version.', sentence: label, fields: { args: { t: 'json' } }, proof: 'D1' });
}

k({ kind: 'conveyor', family: 'behavior', v: 2, up: [() => ({})], group: 'Places', label: 'Conveyor', tip: 'Carries what stands on it toward a direction at a steady speed, like a moving walkway: you and the bots alike, and shapes.', sentence: 'Carries what stands on it at {speed} toward {angle}', fields: {
  angle: { t: 'num', def: 0, min: -360, max: 360, label: 'Carry Direction' },
  speed: { t: 'num', def: 300, min: 0, max: 3000, label: 'Carry Speed' },
  rounds: { t: 'bool', def: false, label: 'Carries Rounds Too' },
}, proof: 'B13' });

k({ kind: 'peace', family: 'behavior', v: 1, group: 'Places', label: 'Peaceful', tip: 'Nobody standing inside it can be hurt or aimed at by a tank, whatever the sides, you too, and a team base inside it hurts nobody. Outside it the fight goes on as usual.', sentence: 'Is peaceful: nobody here can be hurt', fields: {}, proof: 'B14' });
k({ kind: 'keepOut', family: 'behavior', v: 1, group: 'Places', label: 'Bots Keep Out', tip: 'Bots fear it: they never pick a place inside it to go to, and they turn away before they step in. Each time a bot decides, Chance To Cross says how likely it is to go in anyway. You are never held back.', sentence: 'Bots keep out ({chance} % cross)', fields: {
  chance: { t: 'num', def: 10, min: 0, max: 100, unit: '%', label: 'Chance To Cross' },
  hold: { t: 'num', def: 30, min: 1, max: 600, unit: 's', label: 'A Bot Decides Again After' },
}, proof: 'B15' });
const BASE_SHOWN: string[] = [];
for (let i = 0; i < 4; i++) Object.defineProperty(BASE_SHOWN, i, { get: () => SIDE_WORDS[i].shown, enumerable: true });
k({ kind: 'teamBase', family: 'behavior', v: 1, group: 'Places', label: 'Team Base', tip: 'Its cells are the safe ground of a team: its tanks are born here, its base guards stand here, and other teams treat it as that team\'s base. It takes away the walls under it when the map is built. It is set when the map is built, so switching it during a match changes nothing.', sentence: 'Is the {team} team\'s base', fields: {
  team: { t: 'enum', of: ['team1', 'team2', 'team3', 'team4'], shown: BASE_SHOWN, def: 'team1', label: 'Team' },
  guards: { t: 'bool', def: true, label: 'Base Guards' },
  guardCount: { t: 'int', def: 1, min: 0, max: 16, label: 'How Many Guards' },
  guardArrange: { t: 'enum', of: ['spread', 'corners', 'smart'], shown: ['Even Spread', 'In The Corners', 'Smart Arrangement'], def: 'spread', label: 'Guard Arrangement' },
  guardTank: { t: 'tank', label: 'Guard Tank' },
}, proof: 'B16' });

k({ kind: 'invisible', family: 'effect', v: 1, group: 'Look', label: 'Invisible', tip: 'It cannot be seen while the status lasts.', sentence: 'invisible', fields: { style: { t: 'enum', of: ['always', 'whenStill'], shown: ['Always', 'When Standing Still'], def: 'always', label: 'How' } }, proof: 'E01' });
k({ kind: 'invulnerable', family: 'effect', v: 1, group: 'Body', label: 'Cannot Be Hurt', tip: 'Nothing can hurt it while the status lasts. Its guns and its place in a fight stay.', sentence: 'cannot be hurt', fields: {}, proof: 'E02' });
k({ kind: 'colour', family: 'effect', v: 1, group: 'Look', label: 'Colour', tip: 'Wears this colour of the colour map, or a colour of its own.', sentence: 'wears colour {slot}', fields: {
  slot: { t: 'int', def: 12, min: 0, max: 255, label: 'Colour' },
  hex: { t: 'text', def: '', tokens: [], max: 7, label: 'Or A Colour Of Its Own' },
}, proof: 'E03' });
k({ kind: 'tag', family: 'effect', v: 1, group: 'Body', label: 'A Tag', tip: 'It carries this tag while the status lasts, so tests and counts of that tag include it.', sentence: 'counts as {tag}', fields: { tag: { t: 'ref', of: 'tag', label: 'Tag' } }, proof: 'E04' });
k({ kind: 'dark', family: 'effect', v: 1, group: 'Look', label: 'In The Dark', tip: 'The whole world is dark to it while the status lasts: it sees only its own light, by the numbers of the darkness of the whole map.', sentence: 'in the dark', fields: {}, proof: 'E05' });
k({ kind: 'speedBy', family: 'effect', v: 2, up: [() => ({})], group: 'Body', label: 'Speed', tip: 'Moves at this share of its speed while the status lasts. 0: it stands.', sentence: 'speed {pct} %', fields: { pct: { t: 'num', def: 100, min: 0, max: 1000, unit: '%', label: 'Share Of Its Speed' } }, proof: 'E06' });
k({ kind: 'damageBy', family: 'effect', v: 2, up: [() => ({})], group: 'Body', label: 'Damage Taken', tip: 'Takes this share of the damage of every hit while the status lasts. 10: hard to kill.', sentence: 'takes {pct} % damage', fields: { pct: { t: 'num', def: 100, min: 1, max: 1000, unit: '%', label: 'Share Of Damage Taken' } }, proof: 'E07' });
k({ kind: 'noFire', family: 'effect', v: 2, up: [() => ({})], group: 'Body', label: 'Cannot Fire', tip: 'Its guns hold their fire while the status lasts.', sentence: 'cannot fire', fields: {}, proof: 'E08' });
k({ kind: 'pushBy', family: 'effect', v: 1, group: 'Body', label: 'Knockback Taken', tip: 'Is pushed this share of the usual while the status lasts.', sentence: 'pushed {pct} %', fields: { pct: { t: 'num', def: 100, min: 0, max: 1000, unit: '%', label: 'Share Of Knockback' } }, proof: 'E09' });
k({ kind: 'mind', family: 'effect', v: 1, group: 'Body', label: 'Mind', tip: 'How a bot thinks while the status lasts. Charge: it hunts tanks only, drives straight at its target and rams it without stopping, with no fear and no personality of its own, round walls by its full pathfinding. Zombie: the same, and it also stays close behind the strongest of its side it can see, and the whole pack goes for one target together.', sentence: 'thinks: {mind}', fields: { mind: { t: 'enum', of: ['charge', 'zombie'], shown: ['Charge', 'Zombie'], def: 'charge', label: 'Mind' } }, proof: 'E10' });
k({ kind: 'leftAlone', family: 'effect', v: 1, group: 'Body', label: 'Bots Leave It Alone', tip: 'No bot sees it, aims at it or goes for it while the status lasts, as if its Entity Type had Seen By Bots off. Players still can. On a player it does nothing. An Outpost that has given all its Flags has it.', sentence: 'bots leave it alone', fields: {}, proof: 'E26' });
k({ kind: 'noTurn', family: 'effect', v: 1, group: 'Body', label: 'Cannot Turn', tip: 'It cannot turn its body or its aim while the status lasts. A grey zombie stands frozen like this until it wakes up.', sentence: 'cannot turn', fields: {}, proof: 'E11' });
k({ kind: 'horde', family: 'effect', v: 1, group: 'Body', label: 'Horde', tip: 'It follows the strongest tank of its own side that it can see, if that one is stronger than it, the way a squad follows its leader. Many of them together make one big horde.', sentence: 'joins a horde', fields: {}, proof: 'E12' });
k({ kind: 'fragile', family: 'effect', v: 1, group: 'Body', label: 'Dies At One Touch', tip: 'Any hit, and any touch of something with health, kills it at once while the status lasts. The cursed of the Pumpkin Patch are like this.', sentence: 'dies at one touch', fields: {}, proof: 'E13' });
k({ kind: 'seesAll', family: 'effect', v: 1, group: 'Look', label: 'Sees In The Dark', tip: 'No darkness hides anything from it while the status lasts: the player sees no fog, and a bot, its turrets and its drones see as in the light.', sentence: 'sees in the dark', fields: {}, proof: 'E14' });
for (const [kind, label] of [['sizeBy', 'Size']] as const) {
  k({ kind, family: 'effect', v: 1, door: true, group: 'Later', label, tip: 'Comes in a later version.', sentence: label, fields: { args: { t: 'json' } }, proof: 'D1' });
}
k({ kind: 'seekHeal', family: 'effect', v: 1, group: 'Bots', label: 'Goes To Be Healed', tip: 'A bot, below this share of its health, goes to whatever is closest: a thing of its side that heals (a healer tank, a Sanctuary), a body with the tag, or the Custom Area. On the way it keeps shooting a target in sight as it walks, and starts no chase. It stops inside the ring where that healing lands, never pressed against it, and walks about there as any bot. When its health is back it goes on its own way.', sentence: 'goes to be healed below {below} %', fields: {
  below: { t: 'num', def: 70, min: 1, max: 100, unit: '%', label: 'Below This Share Of Its Health' },
  back: { t: 'num', def: 100, min: 1, max: 100, unit: '%', label: 'Until Its Health Is Back To' },
  healers: { t: 'bool', def: true, label: 'To What Heals On Its Side' },
  tag: { t: 'ref', of: 'tag', optional: true, label: 'Or To A Body With This Tag' },
  area: { t: 'ref', of: 'area', optional: true, label: 'Or Into This Custom Area' },
}, proof: 'E15' });
k({ kind: 'healerDuty', family: 'effect', v: 1, group: 'Bots', label: 'Heals Instead Of Farming', tip: 'A bot whose tank has a healing gun farms no food shapes (its body and its guns leave them alone) and never goes after an enemy: it walks with the tanks of its side, toward where they fight, never standing still, and heals the ones that are hurt. Its guns still shoot an enemy that comes into reach. While its tank cannot heal, nothing changes. In a map with this effect or Goes To Be Healed, healers top up worn shields too.', sentence: 'heals instead of farming', fields: {}, proof: 'E16' });
k({ kind: 'teamFight', family: 'effect', v: 1, group: 'Bots', label: 'Fights Beside Its Side', tip: 'A bot never keeps away from an enemy because the enemy is stronger: it takes on bosses, Sentinels and every enemy it sees with the rest of its side, from its own fighting distance, and does not run from a boss coming at it. With Helps Its Side it takes a goal: the enemy a tank of its side it sees is fighting, or the goal of one it sees on its way to a fight. It goes there, even from farming, keeps that one goal until the enemy is dead or unseen for a while, and always fights an enemy in its own sight first.', sentence: 'fights beside its side', fields: { help: { t: 'bool', def: true, label: 'Helps Its Side' } }, proof: 'E17' });
k({ kind: 'fearLow', family: 'effect', v: 1, group: 'Bots', label: 'Fears Only When Low', tip: 'A bot never runs away while its health is at or above this share (hit hard, it still keeps its distance). Below it, it can run away as always, until its health is back: then it forgets its fear and goes back into the fight.', sentence: 'fears only below {below} %', fields: {
  below: { t: 'num', def: 20, min: 1, max: 100, unit: '%', label: 'Below This Share Of Its Health' },
  back: { t: 'num', def: 100, min: 1, max: 100, unit: '%', label: 'Forgets Its Fear At' },
}, proof: 'E18' });
k({ kind: 'wallAvoid', family: 'effect', v: 1, group: 'Bots', label: 'Keeps Away From Walls', tip: "A bot keeps this far from every wall of these types: it never walks into one on purpose, and passes one in a corridor at that distance. His Magic Maze keeps its bots away from Deadly walls (one touch takes most of a health bar) and Sticky walls (they hold a tank in place).", sentence: 'keeps {margin} away from {walls}', fields: {
  walls: { t: 'walls', def: [1, 11], label: 'These Wall Types' },
  margin: { t: 'num', def: 40, min: 0, max: 300, label: 'Distance' },
}, proof: 'E19' });
k({ kind: 'wallTouch', family: 'effect', v: 1, group: 'Bots', label: 'Touches Walls Now And Then', tip: "Now and then a bot goes to the nearest wall of these types it can see and pushes against it for a while, the way a player leans on an Eye wall to see farther or on a Breaker wall to grow. Every so often, on its own clock, it has this chance to go. While it pushes against the wall it keeps aiming and shooting at whatever it fights. A wall that starts to move ends it.", sentence: 'touches {walls} now and then', fields: {
  walls: { t: 'walls', def: [6, 4], label: 'These Wall Types' },
  everyMin: { t: 'num', def: 30, min: 1, max: 3600, unit: 's', label: 'Thinks Of It Every' },
  everyMax: { t: 'num', def: 120, min: 1, max: 3600, unit: 's', label: 'Up To Every' },
  chance: { t: 'num', def: 20, min: 0, max: 100, unit: '%', label: 'Chance Each Time' },
  holdMin: { t: 'num', def: 5, min: 1, max: 300, unit: 's', label: 'Pushes Against It At Least' },
  holdMax: { t: 'num', def: 25, min: 1, max: 300, unit: 's', label: 'Pushes Against It At Most' },
}, proof: 'E20' });
k({ kind: 'guardTag', family: 'effect', v: 1, group: 'Bots', label: 'Guards Its Side\'s Objectives', tip: 'A bot keeps near the closest body of its own side with the tag (a Sanctuary, a Dominator it holds, its Flagship): when it has no fight it goes back and walks about within the distance, and fights what comes.', sentence: 'guards its side\'s {tag} within {radius}', fields: {
  tag: { t: 'ref', of: 'tag', label: 'Objectives With The Tag' },
  radius: { t: 'num', def: 900, min: 100, max: 6000, label: 'Stays Within' },
}, proof: 'E21' });
k({ kind: 'attackTag', family: 'effect', v: 1, group: 'Bots', label: 'Attacks The Enemy\'s Objectives', tip: 'A bot with no fight goes to the closest body with the tag that is not of its side (an enemy Sanctuary, a neutral or enemy Dominator, the other Flagship), fights whoever stands in its way, and attacks it when it gets there.', sentence: 'attacks the enemy\'s {tag}', fields: {
  tag: { t: 'ref', of: 'tag', label: 'Objectives With The Tag' },
}, proof: 'E22' });
k({ kind: 'takeTag', family: 'effect', v: 1, group: 'Bots', label: 'Takes Bodies With A Tag', tip: 'A bot that carries nothing shoots a body with the tag of another side that it sees lying, before food and before its fights: a body that Can Be Carried By Its Killer comes to it, and it brings it home (an enemy Flag).', sentence: 'takes the {tag} of other sides', fields: {
  tag: { t: 'ref', of: 'tag', label: 'Bodies With The Tag' },
}, proof: 'E23' });
k({ kind: 'spoilTag', family: 'effect', v: 1, group: 'Bots', label: 'Destroys Its Side\'s Bodies With A Tag', tip: 'An enemy that carries a body of its side with the tag is its first target: it chases and fights that one before any other. A body of its side with the tag that it sees lying it shoots, so nobody else can take it (its own Flags).', sentence: 'destroys its side\'s {tag}', fields: {
  tag: { t: 'ref', of: 'tag', label: 'Bodies With The Tag' },
}, proof: 'E24' });
k({ kind: 'escortTag', family: 'effect', v: 1, group: 'Bots', label: 'Escorts Who Carries A Tag', tip: 'A mate of its side it sees carrying a body of another side with the tag (an enemy Flag): it goes with that one as its leader, keeps within the distance, and fights the enemies near it, until the body is gone. At most this many bots go with one carrier.', sentence: 'escorts whoever carries the {tag} of other sides', fields: {
  tag: { t: 'ref', of: 'tag', label: 'Bodies With The Tag' },
  max: { t: 'int', def: 3, min: 1, max: 20, label: 'At Most With One Carrier' },
  radius: { t: 'num', def: 450, min: 150, max: 3000, label: 'Stays Within' },
}, proof: 'E25' });

k({ kind: 'goAndOrbit', family: 'order', v: 1, group: 'Walking', label: 'Go There And Circle', tip: 'Walks to the nearest of a tag and circles it.', sentence: 'go to {tag} and circle at {radius}', fields: { tag: { t: 'ref', of: 'tag', label: 'Tag' }, radius: { t: 'num', def: 400, min: 0, label: 'Radius' }, speed: { t: 'num', def: 1, min: 0, max: 5, label: 'Speed' } }, proof: 'O01' });
k({ kind: 'goAndHold', family: 'order', v: 1, group: 'Walking', label: 'Go There And Hold', tip: 'Walks to the nearest of a tag and holds this far from it.', sentence: 'go to {tag} and hold at {radius}', fields: { tag: { t: 'ref', of: 'tag', label: 'Tag' }, radius: { t: 'num', def: 400, min: 0, label: 'Radius' }, speed: { t: 'num', def: 1, min: 0, max: 5, label: 'Speed' } }, proof: 'O02' });
k({ kind: 'follow', family: 'order', v: 1, group: 'Walking', label: 'Follow', tip: 'Keeps near the leader, or a tag.', sentence: 'follow {who} at {radius}', fields: { who: { t: 'enum', of: ['leader', 'tag'], shown: ['The Leader', 'A Tag'], def: 'leader', label: 'Whom' }, tag: { t: 'ref', of: 'tag', optional: true, label: 'Tag' }, radius: { t: 'num', def: 254, min: 0, label: 'Radius' }, gap: { t: 'num', def: 112, min: 0, label: 'Apart From Each Other' } }, proof: 'O03' });
k({ kind: 'circle', family: 'order', v: 1, group: 'Walking', label: 'Small Circles', tip: 'Goes round in a small steady circle from wherever it is.', sentence: 'circles at {radius}', fields: { radius: { t: 'num', def: 48, min: 0, label: 'Radius' }, turn: { t: 'num', def: 12, min: 0.1, unit: 's', label: 'Seconds A Turn' } }, proof: 'O04' });
k({ kind: 'chase', family: 'order', v: 1, group: 'Walking', label: 'Chase', tip: 'Goes for the nearest of these, and for a tag when none is near.', sentence: 'chases {who}', fields: { who: { t: 'enum', of: ['players', 'hostile'], shown: ['Players', 'Anything Hostile'], def: 'players', label: 'Whom' }, elseTag: { t: 'ref', of: 'tag', optional: true, label: 'Else Circles' }, speed: { t: 'num', def: 1, min: 0, max: 5, label: 'Speed' } }, proof: 'O05' });

export const KINDS: readonly KindDef[] = ALL;
const _key = (family: string, kind: string) => family + ':' + kind;
for (let i = 0; i < ALL.length; i++) {
  ALL[i].op = i + 1;
  BY_WORD.set(_key(ALL[i].family, ALL[i].kind), ALL[i]);
  if (ALL[i].formerly) for (const w of ALL[i].formerly!) BY_WORD.set(_key(ALL[i].family, w), ALL[i]);
}
export function kindOf(family: Family, word: string): KindDef | undefined { return BY_WORD.get(_key(family, word)); }
export function kindsOf(family: Family): KindDef[] { return ALL.filter(d => d.family === family); }

export function slotOf(d: KindDef, field: string): number {
  let i = 0;
  for (const f of Object.keys(d.fields)) { if (f === field) return i; i++; }
  return -1;
}

export const OP_END = 0;
export const OP_JUMP = ALL.length + 1, OP_IF = ALL.length + 2, OP_PICK = ALL.length + 3, OP_REPEAT_INIT = ALL.length + 4, OP_REPEAT_TEST = ALL.length + 5,
  OP_FOREACH = ALL.length + 6, OP_FORK = ALL.length + 7, OP_WAITUNTIL = ALL.length + 8, OP_CALL = ALL.length + 9, OP_PLAY = ALL.length + 10, OP_CLIST = ALL.length + 11, OP_COUNT = ALL.length + 12;

export const SPARE_WORD_SHOWN: Record<string, string> = {
  team1: 'Blue', get team2() { return SIDE_WORDS[1].shown; }, get team3() { return SIDE_WORDS[2].shown; }, team4: 'Purple', neutral: 'Neutral', ffa: 'Free For All', player: 'The Player\'s Side',
  bossCamp: 'Bosses (Not Rogues)', bosses: 'Bosses And Rogues', dreadnoughts: 'Dreadnoughts',
};
export { TOK_WAVE };
