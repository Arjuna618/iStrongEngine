import type { MapEventsDoc, Row, SpawnGroup, WavePlan, ZoneLike, Id } from './doc';
import { behaviorsOf, rectsOf } from './doc';
import { zoneBaseTeam } from '../baseAreas';
import { previewMeans } from './waves';
import { setAt } from './docOps';

export interface Lint {
  code: string;
  text: string;
  id: Id;
  warn: boolean;
  fix?: { label: string; apply: (doc: MapEventsDoc) => MapEventsDoc };
}
export interface LintOpts {
  modeTeams?: number;
  gridCells?: number; gridCellsY?: number; cell?: number;
  isWall?: (cx: number, cy: number) => boolean;
  room?: number;
}

const TEAM_INDEX: Record<string, number> = { team1: 1, team2: 2, team3: 3, team4: 4 };

function walkRows(list: readonly Row[] | undefined, fn: (r: Row) => void): void {
  for (const r of list ?? []) {
    fn(r);
    for (const k of Object.keys(r.a)) {
      const v = r.a[k];
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
        if ('k' in (v[0] as object)) walkRows(v as Row[], fn);
        else for (const o of v as Record<string, unknown>[]) if (Array.isArray(o.do)) walkRows(o.do as Row[], fn);
      }
    }
  }
}
function allSteps(doc: MapEventsDoc, zones: readonly ZoneLike[], fn: (r: Row) => void): void {
  for (const r of doc.rules ?? []) { walkRows(r.then, fn); }
  for (const s of doc.sequences ?? []) for (const t of s.tracks) for (const c of t.clips) walkRows([c.step], fn);
  for (const z of zones) for (const b of behaviorsOf(z)) if (b.k === 'stay' && Array.isArray(b.a.stages)) for (const st of b.a.stages as { steps?: Row[] }[]) walkRows(st.steps, fn);
}
function linesOf(plan: WavePlan): { g: SpawnGroup; path: (string | number)[] }[] {
  const out: { g: SpawnGroup; path: (string | number)[] }[] = [];
  plan.groups.forEach((g, i) => out.push({ g, path: ['groups', i] }));
  (plan.specials ?? []).forEach((s, j) => s.groups.forEach((g, i) => out.push({ g, path: ['specials', j, 'groups', i] })));
  (plan.overrides ?? []).forEach((s, j) => s.groups.forEach((g, i) => out.push({ g, path: ['overrides', j, 'groups', i] })));
  return out;
}
function killsSide(z: ZoneLike, team: string): boolean {
  for (const b of behaviorsOf(z)) {
    if (b.k !== 'kill') continue;
    const words = (b.a.whitelist as string[] | undefined) ?? [];
    if (words.includes(team)) continue;
    if (words.some(w => w.startsWith('cat:') || w.startsWith('tank:') || w.startsWith('type:') || w.startsWith('tag:') || w === 'bossCamp' || w === 'bosses')) continue;
    return true;
  }
  return false;
}

export function lintEvents(doc: MapEventsDoc | undefined, zones: readonly ZoneLike[], opts: LintOpts = {}): Lint[] {
  const out: Lint[] = [];
  if (!doc) return out;
  const add = (code: string, text: string, id: Id, warn: boolean, fix?: Lint['fix']) => out.push({ code, text, id, warn, fix });
  const types = doc.types ?? [], plans = doc.plans ?? [], placed = doc.placed ?? [];
  const typeOf = (id: Id | undefined) => types.find(t => t.id === id);

  for (const r of doc.rules ?? []) {
    if (r.off) continue;
    if (r.when.length === 0 && !JSON.stringify(doc.rules).includes(`"rule":{"id":${r.id},`)) add('rule-no-start', `Map Event "${r.name}" has no start, and nothing calls it.`, r.id, true);
    if (r.then.length === 0) add('rule-no-steps', `Map Event "${r.name}" does nothing yet.`, r.id, true);
    let run = 0, most = 0;
    for (const s of r.then) { run = s.k === 'say' && !s.off ? run + 1 : s.k === 'wait' ? 0 : run; if (run > most) most = run; }
    if (most > 4) add('say-many', `Map Event "${r.name}" says ${most} lines at once, and the screen holds four: wait between them, or the first go at once.`, r.id, true);
  }

  const told = new Set<Id>();
  allSteps(doc, zones, r => { if (r.k === 'signal' && r.a.signal && typeof r.a.signal === 'object') told.add((r.a.signal as { id: Id }).id); });
  for (const z of zones) for (const b of behaviorsOf(z)) if (Array.isArray(b.a.stages)) void b;

  plans.forEach((p, pi) => {
    if (p.off) return;
    if (p.start?.on === 'signal' && (!p.start.signal || !told.has(p.start.signal.id))) {
      add('plan-never-starts', `Wave Plan "${p.name}" waits to be told, and nothing tells it.`, p.id, false, { label: 'Start It With The Match', apply: d => setAt(d, ['plans', pi, 'start', 'on'], 'match') });
    }
    const allLines = linesOf(p);
    for (const { g, path } of allLines) {
      if (Array.isArray(g.at) && g.at.length === 0) add('line-no-place', `Wave Plan "${p.name}": the line "${g.name}" has no place to spawn.`, g.id, false, { label: 'Use Every Area Of This Plan', apply: d => setAt(d, ['plans', pi, ...path, 'at'], 'plan') });
      if (g.cards.length === 0) add('line-no-cards', `Wave Plan "${p.name}": the line "${g.name}" spawns nothing yet.`, g.id, true);
      if (g.blocks !== false) {
        for (const c of g.cards) {
          const t = typeOf(c.type?.id);
          if (t && t.canDie === false) add('holder-cannot-die', `Wave Plan "${p.name}": "${t.name}" cannot die and holds the next wave, so no next wave ever comes.`, g.id, false, { label: 'It No Longer Holds', apply: d => setAt(d, ['plans', pi, ...path, 'blocks'], false) });
        }
      }
      if (typeof p.last === 'number' && g.test?.from !== undefined && g.test.from > p.last) add('line-past-end', `Wave Plan "${p.name}": the line "${g.name}" starts at wave ${g.test.from}, after its last wave ${p.last}.`, g.id, true);
    }
    const anyHolder = p.groups.some(g => g.blocks !== false);
    if (!anyHolder && p.groups.length > 0 && p.advance?.on === 'cleared' && (p.advance.break === 0 || p.advance.break === undefined)) add('plan-no-pause', `Wave Plan "${p.name}": no line holds the next wave and it has no break, so waves come as fast as they can.`, p.id, true);
    if (typeof p.specialChance === 'number' && p.specialChance > 100) add('specials-over', `Wave Plan "${p.name}": special waves ask for ${p.specialChance}% of the waves.`, p.id, true, { label: 'Make It 100%', apply: d => setAt(d, ['plans', pi, 'specialChance'], 100) });
    const room = opts.room ?? doc.match?.maxTanksAlive;
    if (room) {
      for (let w = (p.first ?? 1); w <= 300; w += 10) {
        if (typeof p.last === 'number' && w > p.last) break;
        const sum = previewMeans({ ...p, specialChance: 0 }, w, 3, 7).reduce((s, x) => s + x.mean, 0);
        if (sum > room) { add('over-room', `Wave Plan "${p.name}": from about wave ${w} a wave asks for more than Max Tanks Alive (${room}). Its bodies wait for room and none is lost.`, p.id, true); break; }
      }
    }
  });

  zones.forEach(z => {
    const name = z.name ?? 'Custom Area';
    for (const b of behaviorsOf(z)) {
      if (b.k !== 'spawn') continue;
      const a = (b.a.settings ?? b.a) as { mode?: string; plan?: { id: Id }; side?: { team: string }; cards?: { type?: { id: Id } }[] };
      if (a.mode === 'waves') {
        const plan = a.plan ? plans.find(x => x.id === a.plan!.id) : plans[0];
        if (plan && !linesOf(plan).some(({ g }) => g.at === 'plan' || (Array.isArray(g.at) && g.at.some(r => r.id === z.uid || (doc.areaGroups ?? []).some(ag => ag.id === r.id && ag.members.some(m => m.id === z.uid)))))) {
          add('area-no-line', `Custom Area "${name}" spawns waves of "${plan.name}", but no line of it names this area.`, b.id, true);
        }
      } else {
        for (const c of a.cards ?? []) {
          const t = typeOf(c.type?.id);
          const team = a.side?.team ?? t?.side.team;
          if (team && killsSide(z, team)) { add('area-kills-own', `Custom Area "${name}" spawns what its own Damaging behaviour kills.`, b.id, false); break; }
        }
        if ((a.cards ?? []).length === 0) add('area-spawns-nothing', `Custom Area "${name}" spawns nothing yet.`, b.id, true);
      }
    }
    if (z.name && zones.some(o => o !== z && o.name === z.name)) add('area-same-name', `Two Custom Areas are named "${z.name}".`, z.uid ?? z.id, true);
    if (opts.cell) {
      for (const b of behaviorsOf(z)) {
        if (b.k !== 'spawn') continue;
        const a = (b.a.settings ?? b.a) as { cards?: { type?: { id: Id } }[] };
        for (const c of a.cards ?? []) {
          const size = typeOf(c.type?.id)?.forms[0]?.size;
          if (size && rectsOf(z).every(r => Math.min(r.cw, r.ch) * opts.cell! < size)) { add('area-too-small', `Custom Area "${name}" is smaller than "${typeOf(c.type?.id)!.name}".`, b.id, true); break; }
        }
      }
    }
  });

  placed.forEach((e, i) => {
    if (e.off) return;
    if (opts.gridCells && (e.cx < 0 || e.cy < 0 || e.cx > opts.gridCells || e.cy > (opts.gridCellsY ?? opts.gridCells))) add('entity-outside', `Map Entity "${e.name}" stands outside the map.`, e.id, false, { label: 'Remove It', apply: d => setAt(d, ['placed'], (d.placed ?? []).filter((_, k) => k !== i)) });
    else if (opts.isWall && opts.isWall(e.cx, e.cy)) add('entity-in-wall', `Map Entity "${e.name}" stands in a wall of this map.`, e.id, true);
    const t = typeOf(e.type?.id);
    if (t) {
      const side = TEAM_INDEX[t.side.team];
      if (side && t.brain !== 'guard' && zones.some(z => zoneBaseTeam(z) === side - 1 && e.cx >= z.gx && e.cx < z.gx + z.cw && e.cy >= z.gy && e.cy < z.gy + z.ch)) {
        add('entity-on-own-base', `Map Entity "${e.name}" stands on its own team's base: bosses will never attack it there.`, e.id, true);
      }
    }
  });

  types.forEach((t, ti) => {
    const team = TEAM_INDEX[t.side.team];
    if (team && opts.modeTeams && team > opts.modeTeams) add('team-not-in-mode', `Entity Type "${t.name}" is on a team this mode does not field.`, t.id, true);
    t.forms.forEach((f, fi) => {
      const ev = f.evolve ?? [];
      if (ev.some((x, k) => k > 0 && x.wave < ev[k - 1].wave) || ev.some(x => x.wave < 2)) {
        add('evolve-order', `Entity Type "${t.name}": its waves to evolve at are out of order, or one is below wave 2.`, t.id, true, { label: 'Put Them In Order', apply: d => setAt(d, ['types', ti, 'forms', fi, 'evolve'], ev.filter(x => x.wave >= 2).slice().sort((a, b) => a.wave - b.wave)) });
      }
    });
  });

  if ((doc.rules?.length || plans.length)) {
    let ends = false;
    allSteps(doc, zones, r => { if (r.k === 'match.end') ends = true; });
    if (!ends) add('no-end', 'This map has no way to win or lose: a match goes on until it is left.', 0, true);
  }
  return out;
}
