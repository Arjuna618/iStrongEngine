import { PLAY_MODE_ENTRIES, resolvePlayConfig, type PlayModeEntry } from '../../game/gameModeRegistry';
import { StepAccumulator, runFixedStepFrame } from '../../game/fixedStep';
import { sameNavComponent, ensureRegionFields } from '../../game/Navigation';
import { ASYLUM_GRID, ASYLUM_FLOOR, ASYLUM_PATCH } from '../../game/mapEvents/presets/asylum.generated';
import { planCamera, type CamPlan, type InterestGrid } from './cameraPlan';

export type SceneKind = 'plain' | 'siege' | 'outbreak' | 'halloween' | 'soccer' | 'dreads';

export interface ScenePick {
  key: string;
  title: string;
  category: string;
  family: string;
  kind: SceneKind;
  roomMin: number;
  wave: number;
}

const STEP_S = 1 / 60;
const STEP_MS = 1000 / 60;

export function sceneEntries(): PlayModeEntry[] {
  return PLAY_MODE_ENTRIES.filter(e => e.overlay !== 'blackout');
}

export function familyOf(e: PlayModeEntry): string {
  if (e.category === 'siege' || (e.preset ?? '').startsWith('siege')) return 'siege:' + (e.preset ?? e.key);
  if (e.preset) return 'preset:' + e.preset;
  if (e.od) return 'od:' + e.key;
  if (e.overlay) return e.overlay + ':' + (e.world ?? e.baseId);
  return 'world:' + (e.world ?? e.baseId);
}

export function kindOf(e: PlayModeEntry): SceneKind {
  if (e.category === 'siege' || (e.preset ?? '').startsWith('siege')) return 'siege';
  if (e.preset === 'halloween') return 'halloween';
  if (e.overlay === 'outbreak') return 'outbreak';
  if (e.overlay === 'soccer') return 'soccer';
  if (e.baseId === 'old-dreadnoughts') return 'dreads';
  return 'plain';
}

export function pickScene(rand: () => number, recentFamilies: readonly string[], lastCategory: string | null, only?: string): ScenePick {
  const all = sceneEntries();
  let entry: PlayModeEntry | undefined = only ? all.find(e => e.key === only) : undefined;
  if (!entry) {
    const cats = Array.from(new Set(all.map(e => e.category)));
    const catPool = cats.length > 1 ? cats.filter(c => c !== lastCategory) : cats;
    const cat = catPool[Math.floor(rand() * catPool.length) % catPool.length];
    const inCat = all.filter(e => e.category === cat);
    const fams = Array.from(new Set(inCat.map(familyOf)));
    const fresh = fams.filter(f => !recentFamilies.includes(f));
    const famPool = fresh.length > 0 ? fresh : fams;
    const fam = famPool[Math.floor(rand() * famPool.length) % famPool.length];
    const versions = inCat.filter(e => familyOf(e) === fam);
    entry = versions[Math.floor(rand() * versions.length) % versions.length];
  }
  const kind = kindOf(entry);
  return {
    key: entry.key, title: entry.title, category: entry.category, family: familyOf(entry), kind,
    roomMin: 10 + Math.floor(rand() * 21),
    wave: kind === 'siege' ? 5 + Math.floor(rand() * 46) : 0,
  };
}

export interface SceneClock { advance(ms: number): void }

export interface SceneBudget {
  runMs: number;
  stepMs: number;
}

export interface MadeScene {
  pick: ScenePick;
  cam: CamPlan;
  stats: { bots: number; rounds: number; shapes: number; zombies: number; bosses: number; spread: number; kept: number; horde: number; advanced: number; choosing: number; steps: number; stepMs: number; levels: string };
  moves: { id: string; fx: number; fy: number; tx: number; ty: number; r: number }[];
}

const CHUNK = 12;

export type RealNow = () => number;

export function* makeScene(g: any, pick: ScenePick, clock: SceneClock, budget: SceneBudget, realNow: RealNow, rand: () => number,
  view: { vpW: number; vpH: number; hole?: { w: number; h: number } }): Generator<void, MadeScene, void> {
  const entry = sceneEntries().find(e => e.key === pick.key);
  if (!entry) throw new Error('no Play mode ' + pick.key);
  const acc = new StepAccumulator();
  let steps = 0, stepTime = 0;
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) {
      clock.advance(STEP_MS);
      const a = realNow();
      runFixedStepFrame(g, acc, STEP_S);
      stepTime += realNow() - a;
      steps++;
    }
  };

  g.applyGameMode(resolvePlayConfig(entry));
  g.regenerateMap();
  g.enterTestMode();
  g.updateState({ ghostMode: true, godMode: true });
  const normalZoom = g.zoom > 0 ? g.zoom : 1;

  let last = -1, stable = 0;
  for (let k = 0; k < 12; k++) {
    step(CHUNK);
    yield;
    const n = liveBots(g).length;
    if (n === last && n > 0) { if (++stable >= 2 && k >= 3) break; } else stable = 0;
    last = n;
  }

  for (let k = 0; k < 12; k++) {
    const now = g.gameNow();
    let pending = 0;
    for (const e of g.state.enemyTanks) {
      if (!e.active || e.isDying || !e.graceActive || e.tripGrace || e.evolutionComplete) continue;
      pending++;
      if (e.nextEvolveTime > now) e.nextEvolveTime = now;
    }
    if (pending === 0) break;
    step(1);
  }
  {
    const now = g.gameNow();
    for (const e of g.state.enemyTanks) if (e.active && !e.isDying && e.graceActive && !e.tripGrace && e.evolutionComplete && e.graceEndTime > now) e.graceEndTime = now;
    step(2);
    yield;
  }

  const slow = budget.stepMs > 6 ? 0.7 : 1;
  const runFor = function* (minS: number, maxS: number, realMs: number): Generator<void, void, void> {
    const t0 = realNow(), minN = Math.round(minS * slow * 60), maxN = Math.round(maxS * 60);
    for (let n = 0; n < maxN && (n < minN || realNow() - t0 < realMs); n += CHUNK) { step(CHUNK); yield; }
  };

  let waveOn = false;
  if (pick.wave > 0) {
    try {
      g._chatWave(['set', String(pick.wave)]);
      g._chatWave(['skip']);
      step(20);
      waveOn = /^Wave \d+/.test(String(g._chatWave(['skip'])));
    } catch { }
  }

  let choosing = 0;
  for (const e of g.state.enemyTanks) if (ordinaryBot(g, e) && e.graceActive && !e.tripGrace && !e.evolutionComplete) choosing++;
  try { (g._chatTimeSkip ?? g._chatSkipTime).call(g, ['skip', String(pick.roomMin)]); } catch { }
  if (waveOn) yield* runFor(2.5, 8, budget.runMs * 0.9);
  for (let k = 0; k < 12 && (g._skipQueueSize?.() ?? 0) > 0; k++) { step(CHUNK); yield; }

  primeReach(g);
  const moves: { id: string; fx: number; fy: number; tx: number; ty: number; r: number }[] = [];
  _moves = moves;
  const spread = spreadBots(g, pick.kind, rand);
  _moves = null;
  let horde = 0;
  if (pick.kind === 'outbreak' || (pick.kind === 'halloween' && rand() < 0.35)) horde = raiseHorde(g, rand);
  const advanced = waveOn ? advanceBosses(g, rand) : 0;

  yield* runFor(horde > 0 ? 4 : 3, horde > 0 || waveOn ? 7 : 8, budget.runMs);

  wallpaperHides(g);
  const cam = planSceneCamera(g, pick, rand, normalZoom, view);
  const bots = liveBots(g);
  const lv = bots.map((e: any) => e.level | 0).sort((a: number, b: number) => a - b);
  return {
    pick, cam, moves,
    stats: {
      bots: bots.length,
      rounds: countActive(g.bullets),
      shapes: countActive(g.floatingPolygons),
      zombies: bots.filter((e: any) => isZombie(g, e)).length,
      bosses: bots.filter((e: any) => e.isBossTier).length,
      spread: spread.moved, kept: spread.kept, horde, advanced, choosing,
      steps, stepMs: steps > 0 ? stepTime / steps : 0,
      levels: lv.length ? `${lv[0]}..${lv[lv.length - 1]} (median ${lv[lv.length >> 1]})` : '-',
    },
  };
}

export function wallpaperHides(g: any): { tanks: number; shapes: number } {
  let tanks = 0, shapes = 0;
  for (const e of g.state.enemyTanks) {
    if (!e.active) continue;
    if (e.isDying || e.graceActive) { e.active = false; tanks++; continue; }
    e.damageOverlay = 0;
  }
  for (const p of (g.floatingPolygons as any[]) ?? []) {
    if (!p || !p.active) continue;
    if (p.fadingIn || p.fadingOut || p._fadeT >= 0) { p.active = false; shapes++; continue; }
    p.damageOverlay = 0;
  }
  for (const b of (g.bullets as any[]) ?? []) if (b && b.active) b.damageOverlay = 0;
  return { tanks, shapes };
}

function countActive(arr: any): number {
  if (!Array.isArray(arr)) return 0;
  let n = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].active) n++;
  return n;
}
function liveBots(g: any): any[] {
  const out: any[] = [];
  for (const e of g.state.enemyTanks) if (e.active && !e.isDying) out.push(e);
  return out;
}
function isZombie(g: any, e: any): boolean {
  try { return !!g._mevIsZombie?.(e); } catch { return false; }
}
function ordinaryBot(g: any, e: any): boolean {
  if (!e.active || e.isDying || e.isBossTier || e.isBaseProtector || e.isSentryEnemy || e._mev >= 0 || e.spawnedByEntityId) return false;
  if (isZombie(g, e) || e.groupId === ARENA_CLOSER_GROUP) return false;
  try { if (g._isSpawnSystemBoss?.(e)) return false; } catch { return false; }
  return true;
}
const ARENA_CLOSER_GROUP = -745;

export function primeReach(g: any): void {
  try {
    const areas = g.areaStates as any[] | undefined;
    if (areas && areas.length > 0 && g.state.multiAreaConfig?.enableMultiArea) {
      for (let ai = 0; ai < areas.length; ai++) {
        const as_ = areas[ai], a = g.state.multiAreaConfig.areas[ai];
        if (as_?.navigation) ensureRegionFields(as_.navigation, as_, a?.worldOffsetX ?? 0, a?.worldOffsetY ?? 0);
      }
    } else if (g.mapState?.navigation) ensureRegionFields(g.mapState.navigation, g.mapState, 0, 0);
  } catch { }
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }

const _wholeMap = new WeakMap<object, Box>();
function areaBoxAt(g: any, x: number, y: number): Box {
  const ab = g.areaBounds as Box[] | undefined;
  if (ab && ab.length > 0) {
    for (const b of ab) if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return b;
    return ab[0];
  }
  const key = (g.mapState ?? g) as object;
  let b = _wholeMap.get(key);
  if (!b) {
    const hx = g.mapState?.mapHalf ?? g.getMapLimit?.() ?? 2500;
    const hy = g.mapState?.mapHalfY ?? hx;
    b = { minX: -hx, minY: -hy, maxX: hx, maxY: hy };
    _wholeMap.set(key, b);
  }
  return b;
}

const gauss = (rand: () => number): number => {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function placeOk(g: any, e: any, x: number, y: number, box: Box): boolean {
  const r = g.getEffectiveEnemyRadius(e);
  if (!(x > box.minX + r + 30 && x < box.maxX - r - 30 && y > box.minY + r + 30 && y < box.maxY - r - 30)) return false;
  const ms = g._getEnemyNavMapState(e);
  const ox = g._navOffX ?? 0, oy = g._navOffY ?? 0;
  if (ms?.navigation && !e.ignoresWalls) {
    if (!sameNavComponent(ms.navigation, e.position.x - ox, e.position.y - oy, x - ox, y - oy, e.navBodyR ?? 0)) return false;
  }
  let team: string | undefined;
  try { team = g._resolveTeam(e.team); } catch { team = undefined; }
  if (typeof g.botMayStandAt === 'function' && !g.botMayStandAt(e, x, y)) return false;
  return g.isSpawnPositionSafe(x, y, r * 2, false, team);
}

let _moves: { id: string; fx: number; fy: number; tx: number; ty: number; r: number }[] | null = null;
function moveBot(e: any, x: number, y: number, r = 0): void {
  if (_moves) _moves.push({ id: e.id, fx: e.position.x, fy: e.position.y, tx: x, ty: y, r });
  e.position.x = x; e.position.y = y;
  e.velocity.set(0, 0);
  e.knockbackVelocity?.set?.(0, 0);
  e._knShareX = 0; e._knShareY = 0;
  e.navGoalRegion = -1;
  e.portalSeekIdx = -1;
  e.portalSeekUntil = 0;
}

function roomOk(g: any, e: any, x: number, y: number, r: number, room: number): boolean {
  for (const o of g.state.enemyTanks) {
    if (o === e || !o.active || o.isDying) continue;
    const ro = g.getEffectiveEnemyRadius(o), need = (r + ro) * room + 40;
    const dx = x - o.position.x, dy = y - o.position.y;
    if (dx * dx + dy * dy < need * need) return false;
  }
  return true;
}

function tryNear(g: any, e: any, ax: number, ay: number, spread: number, tries: number, rand: () => number, box: Box, room = 1.7): boolean {
  const r = g.getEffectiveEnemyRadius(e);
  const sp = Math.max(spread, r * 3.5);
  for (let t = 0; t < tries; t++) {
    const x = ax + gauss(rand) * sp, y = ay + gauss(rand) * sp;
    if (roomOk(g, e, x, y, r, room) && placeOk(g, e, x, y, box)) { moveBot(e, x, y, r); return true; }
  }
  return false;
}

function asylumPolys(g: any): { floor: number[][]; patch: number[] } | null {
  const ms = g.mapState;
  if (!ms || !(ms.cellSize > 0)) return null;
  const hx = ms.mapHalf, hy = ms.mapHalfY ?? ms.mapHalf, cs = ms.cellSize;
  if ((ms.gridCells ?? 0) !== ASYLUM_GRID.gridCells) return null;
  const toW = (p: readonly number[]): number[] => p.map((v, i) => (i % 2 === 0 ? -hx + v * cs : -hy + v * cs));
  return { floor: ASYLUM_FLOOR.map(toW), patch: toW(ASYLUM_PATCH) };
}
export function inPoly(p: readonly number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyBox(p: readonly number[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < p.length; i += 2) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]); }
  return { minX, minY, maxX, maxY };
}
function pointInPolys(polys: readonly (readonly number[])[], rand: () => number): [number, number] | null {
  for (let t = 0; t < 40; t++) {
    const p = polys[Math.floor(rand() * polys.length) % polys.length];
    const b = polyBox(p);
    const x = b.minX + rand() * (b.maxX - b.minX), y = b.minY + rand() * (b.maxY - b.minY);
    if (inPoly(p, x, y)) return [x, y];
  }
  return null;
}

function sideOf(g: any, e: any): string {
  const b = String(e.aiBehavior ?? '');
  if (/^Team[1-4]$/.test(b)) return b;
  try { return String(g._resolveTeam(e.team) ?? ''); } catch { return ''; }
}

export function spreadBots(g: any, kind: SceneKind, rand: () => number): { moved: number; kept: number } {
  const bots = liveBots(g).filter((e: any) => ordinaryBot(g, e));
  let moved = 0, kept = 0;
  if (bots.length === 0) return { moved, kept };
  const byGroup = new Map<number, any[]>();
  for (const e of bots) if (e.groupId > 0) { const l = byGroup.get(e.groupId); if (l) l.push(e); else byGroup.set(e.groupId, [e]); }
  const groups = [...byGroup.values()].filter(l => l.length >= 2 && l.length <= 4);
  const grouped = new Set<any>(); for (const l of groups) for (const e of l) grouped.add(e);
  const sides = new Map<string, { x: number; y: number; n: number }>();
  for (const e of bots) {
    const s = sideOf(g, e);
    if (!s) continue;
    const c = sides.get(s) ?? { x: 0, y: 0, n: 0 };
    c.x += e.position.x; c.y += e.position.y; c.n++;
    sides.set(s, c);
  }
  const teamGame = sides.size >= 2 && groups.length === 0 && kind !== 'soccer';
  const asy = kind === 'halloween' ? asylumPolys(g) : null;
  const focus: [number, number][] = [];
  let mine = '';
  try { mine = String(g.getPlayerTeam()); } catch { mine = ''; }
  for (const e of g.state.enemyTanks) {
    if (!e.active || e.isDying || !(e._mev >= 0) || e.isBossTier) continue;
    let s = '';
    try { s = String(g._resolveTeam(e.team)); } catch { s = ''; }
    if (s === mine) focus.push([e.position.x, e.position.y]);
  }
  const ball = kind === 'soccer' ? soccerBall(g) : null;

  const spotsOf = new Map<Box, [number, number][]>();
  const spots = (box: Box): [number, number][] => {
    let s = spotsOf.get(box);
    if (s) return s;
    s = [];
    const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, hw = (box.maxX - box.minX) / 2, hh = (box.maxY - box.minY) / 2;
    const n = Math.max(2, Math.round(bots.length / 5));
    for (let i = 0; i < n; i++) {
      const c = rand() < 0.55 ? 0.35 : 0.75;
      s.push([cx + Math.max(-1, Math.min(1, gauss(rand) * c)) * hw * 0.92, cy + Math.max(-1, Math.min(1, gauss(rand) * c)) * hh * 0.92]);
    }
    spotsOf.set(box, s);
    return s;
  };
  const anyWhere = (box: Box): [number, number] => [box.minX + rand() * (box.maxX - box.minX), box.minY + rand() * (box.maxY - box.minY)];

  const anchorFor = (e: any, box: Box): [number, number] => {
    const hw = (box.maxX - box.minX) / 2, hh = (box.maxY - box.minY) / 2;
    if (asy) {
      const u = rand();
      if (u < 0.65) { const p = pointInPolys(asy.floor, rand); if (p) return p; }
      else if (u < 0.8) { const p = pointInPolys([asy.patch], rand); if (p) return p; }
      return anyWhere(box);
    }
    if (ball && rand() < 0.6) return [ball[0] + gauss(rand) * hw * 0.3, ball[1] + gauss(rand) * hh * 0.3];
    if (kind === 'siege' && focus.length > 0 && rand() < 0.75) {
      const f = focus[Math.floor(rand() * focus.length) % focus.length];
      const t = anyWhere(box), u = rand() * 0.45;
      return [f[0] + (t[0] - f[0]) * u, f[1] + (t[1] - f[1]) * u];
    }
    if (teamGame) {
      const s = sides.get(sideOf(g, e));
      if (s && rand() < 0.8) {
        const hx0 = s.x / s.n, hy0 = s.y / s.n;
        const mx = (box.minX + box.maxX) / 2, my = (box.minY + box.maxY) / 2, u = 0.15 + 0.8 * Math.sqrt(rand());
        return [hx0 + (mx - hx0) * u + gauss(rand) * hw * 0.11, hy0 + (my - hy0) * u + gauss(rand) * hh * 0.11];
      }
      return anyWhere(box);
    }
    if (rand() < 0.7) { const s = spots(box); const p = s[Math.floor(rand() * s.length) % s.length]; return [p[0], p[1]]; }
    return anyWhere(box);
  };

  const anchorOk = (e: any, box: Box): [number, number] => {
    let a = anchorFor(e, box);
    if (typeof g.botMayStandAt !== 'function') return a;
    for (let t = 0; t < 12 && !g.botMayStandAt(e, a[0], a[1]); t++) a = anchorFor(e, box);
    return a;
  };

  for (const l of groups) {
    const lead = l.find((e: any) => e.isGroupLeader) ?? l[0];
    const box = areaBoxAt(g, lead.position.x, lead.position.y);
    let ok = false;
    for (let t = 0; t < 6 && !ok; t++) { const a = anchorOk(lead, box); ok = tryNear(g, lead, a[0], a[1], 120, 4, rand, box, 1.7); }
    if (!ok) { kept += l.length; continue; }
    moved++;
    for (const e of l) {
      if (e === lead) continue;
      const r = g.getEffectiveEnemyRadius(e);
      if (tryNear(g, e, lead.position.x, lead.position.y, Math.max(90, r * 4), 14, rand, box, 1.25)) moved++; else kept++;
    }
  }
  for (const e of bots) {
    if (grouped.has(e)) continue;
    const box = areaBoxAt(g, e.position.x, e.position.y);
    let ok = false;
    for (let t = 0; t < 5 && !ok; t++) {
      const a = anchorOk(e, box);
      ok = tryNear(g, e, a[0], a[1], Math.min(260, (box.maxX - box.minX) * 0.04 + 40), 6, rand, box, 1.7);
    }
    if (ok) moved++; else kept++;
  }
  return { moved, kept };
}

function soccerBall(g: any): [number, number] | null {
  const polys = g.floatingPolygons as any[] | undefined;
  if (!Array.isArray(polys)) return null;
  for (const p of polys) if (p && p.active && (p._mev >= 0 || p.mevBody || p.isBall)) return [p.position.x, p.position.y];
  return null;
}

function raiseHorde(g: any, rand: () => number): number {
  const bots = liveBots(g).filter((e: any) => ordinaryBot(g, e));
  if (bots.length < 6) return 0;
  const want = Math.max(4, Math.min(25, Math.round(bots.length * (0.3 + rand() * 0.25)), 7 + Math.floor(rand() * 19)));
  const n = Math.min(want, bots.length - 3);
  const order = bots.slice().sort(() => rand() - 0.5);
  const lead = order[0];
  const box = areaBoxAt(g, lead.position.x, lead.position.y);
  const cx = lead.position.x, cy = lead.position.y;
  const victims: any[] = [lead];
  for (let i = 1; i < order.length && victims.length < n; i++) {
    const e = order[i];
    if (areaBoxAt(g, e.position.x, e.position.y) !== box) continue;
    if (tryNear(g, e, cx, cy, 160 + victims.length * 12, 10, rand, box, 0.95)) victims.push(e);
  }
  let living = 0;
  for (let i = order.length - 1; i > 0 && living < 4; i--) {
    const e = order[i];
    if (victims.includes(e) || areaBoxAt(g, e.position.x, e.position.y) !== box) continue;
    const a = rand() * Math.PI * 2, d = 520 + rand() * 260;
    if (tryNear(g, e, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 90, 8, rand, box, 1.5)) living++;
  }
  let fell = 0;
  for (const e of victims) {
    try { e.currentHealth = 0; e.currentShield = 0; g.killEnemy(e); fell++; } catch { }
  }
  return fell;
}

function advanceBosses(g: any, rand: () => number): number {
  const bosses = liveBots(g).filter((e: any) => e.isBossTier);
  if (bosses.length === 0) return 0;
  let mine: string | undefined;
  try { mine = String(g.getPlayerTeam()); } catch { mine = undefined; }
  const sideOfT = (e: any): string | undefined => { try { return String(g._resolveTeam(e.team)); } catch { return undefined; } };
  const goals: any[] = g.state.enemyTanks.filter((e: any) => e.active && !e.isDying && e._mev >= 0 && !e.isBossTier && mine !== undefined && sideOfT(e) === mine);
  if (goals.length === 0) return 0;
  const ms = g._getEnemyNavMapState(bosses[0]);
  const nav = ms?.navigation;
  if (!nav || !(nav.navBlocked?.length > 0)) return 0;
  const ox = g._navOffX ?? 0, oy = g._navOffY ?? 0;
  const gc = nav.gridCells, gcY = nav.gridCellsY ?? gc, cs = nav.cellSize, hx = ms.mapHalf, hy = ms.mapHalfY ?? ms.mapHalf;
  const total = gc * gcY;
  if (nav.navBlocked.length !== total) return 0;
  const cellOf = (wx: number, wy: number): number => {
    const ix = Math.floor((wx - ox + hx) / cs), iy = Math.floor((wy - oy + hy) / cs);
    return ix < 0 || iy < 0 || ix >= gc || iy >= gcY ? -1 : ix * gcY + iy;
  };
  const dist = new Int32Array(total).fill(-1);
  const q = new Int32Array(total);
  let head = 0, tail = 0;
  for (const s of goals) {
    const c = cellOf(s.position.x, s.position.y);
    if (c >= 0 && dist[c] < 0) { dist[c] = 0; q[tail++] = c; }
  }
  while (head < tail) {
    const cur = q[head++], cx = (cur / gcY) | 0, cy = cur - cx * gcY;
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= gc || ny >= gcY) continue;
      const ni = nx * gcY + ny;
      if (dist[ni] >= 0 || nav.navBlocked[ni] !== 0) continue;
      dist[ni] = dist[cur] + 1;
      q[tail++] = ni;
    }
  }
  let moved = 0;
  for (const b of bosses) {
    let c = cellOf(b.position.x, b.position.y);
    if (c < 0 || dist[c] < 0) continue;
    const route: number[] = [c];
    while (dist[c] > 0 && route.length < total) {
      const cx = (c / gcY) | 0, cy = c - cx * gcY;
      let best = c;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= gc || ny >= gcY) continue;
        const ni = nx * gcY + ny;
        if (dist[ni] >= 0 && dist[ni] < dist[best]) best = ni;
      }
      if (best === c) break;
      c = best; route.push(c);
    }
    const r = g.getEffectiveEnemyRadius(b);
    const keepCells = Math.ceil((520 + r * 2.5) / cs);
    const span = route.length - 1 - keepCells;
    if (span <= 2) continue;
    let k = Math.floor(span * (0.3 + rand() * 0.7));
    let team: string | undefined;
    try { team = g._resolveTeam(b.team); } catch { team = undefined; }
    for (let t = 0; t < 16 && k > 0; t++, k -= 2) {
      const cell = route[k], ix = (cell / gcY) | 0, iy = cell - ix * gcY;
      const x = ox - hx + (ix + 0.5) * cs + (rand() - 0.5) * cs * 0.6, y = oy - hy + (iy + 0.5) * cs + (rand() - 0.5) * cs * 0.6;
      if (g.isSpawnPositionSafe(x, y, r * 2, true, team)) {
        const dx = x - b.position.x, dy = y - b.position.y;
        moveBot(b, x, y); moved++;
        for (const e of g.state.enemyTanks) {
          if (!e.active || e.isDying || e.spawnedByEntityId !== b.id) continue;
          const nx = e.position.x + dx, ny = e.position.y + dy;
          if (g.isSpawnPositionSafe(nx, ny, g.getEffectiveEnemyRadius(e) * 2, true, team)) moveBot(e, nx, ny);
        }
        break;
      }
    }
  }
  return moved;
}

function planSceneCamera(g: any, pick: ScenePick, rand: () => number, normalZoom: number, view: { vpW: number; vpH: number; hole?: { w: number; h: number } }): CamPlan {
  const ab = (g.areaBounds as Box[] | undefined) ?? [];
  let box: Box = areaBoxAt(g, 0, 0);
  if (ab.length > 1) {
    const w = ab.map(b => { let s = 0; for (const e of g.state.enemyTanks) if (e.active && !e.isDying && e.position.x >= b.minX && e.position.x <= b.maxX && e.position.y >= b.minY && e.position.y <= b.maxY) s += 1; return s + 0.5; });
    let u = rand() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ab.length; i++) { u -= w[i]; if (u <= 0) { box = ab[i]; break; } }
  }
  const normalW = view.vpW / normalZoom;
  const boxW = box.maxX - box.minX, boxH = box.maxY - box.minY;
  let viewW = normalW * (1.02 + rand() * 0.4);
  viewW = Math.max(normalW * 0.95, Math.min(viewW, boxW * 0.82, (boxH * 0.86) * (view.vpW / view.vpH)));
  const viewH = viewW * (view.vpH / view.vpW);

  const cells = 48;
  const cw = boxW / cells, ch = boxH / Math.max(8, Math.round(cells * boxH / boxW));
  const gy = Math.max(8, Math.round(boxH / ch));
  const grid: InterestGrid = { x0: box.minX, y0: box.minY, cw, ch, nx: cells, ny: gy, v: new Float32Array(cells * gy) };
  const add = (x: number, y: number, w: number): void => {
    const ix = Math.floor((x - box.minX) / cw), iy = Math.floor((y - box.minY) / ch);
    if (ix < 0 || iy < 0 || ix >= cells || iy >= gy) return;
    grid.v[ix * gy + iy] += w;
  };
  for (const e of g.state.enemyTanks) {
    if (!e.active) continue;
    if (e.isDying) { add(e.position.x, e.position.y, 0.8); continue; }
    let w = 2 + Math.min(4, (e.level | 0) / 20);
    if (e.aiState === 'attacking') w += 2.2;
    else if (e.aiState === 'fleeing') w += 1.2;
    if (e.isBossTier) w += 9;
    if (isZombie(g, e)) w = 2.6;
    if (e.isBaseProtector) w = 0.6;
    add(e.position.x, e.position.y, w);
  }
  const rounds = new Float32Array(cells * gy);
  for (const b of g.bullets as any[]) {
    if (!b || !b.active) continue;
    const ix = Math.floor((b.position.x - box.minX) / cw), iy = Math.floor((b.position.y - box.minY) / ch);
    if (ix >= 0 && iy >= 0 && ix < cells && iy < gy) rounds[ix * gy + iy] += 0.14;
  }
  for (let i = 0; i < rounds.length; i++) grid.v[i] += Math.min(2.2, rounds[i]);
  for (const p of (g.floatingPolygons as any[]) ?? []) if (p && p.active) add(p.position.x, p.position.y, p._mev >= 0 ? 7 : 0.05 + Math.min(0.4, (p.size ?? 20) / 400));
  let prefer: { from: [number, number]; to: [number, number] } | null = null;
  if (pick.kind === 'halloween') {
    const asy = asylumPolys(g);
    if (asy) {
      for (let ix = 0; ix < cells; ix++) for (let iy = 0; iy < gy; iy++) {
        const x = box.minX + (ix + 0.5) * cw, y = box.minY + (iy + 0.5) * ch;
        if (asy.floor.some(p => inPoly(p, x, y))) grid.v[ix * gy + iy] += 1.4;
        else if (inPoly(asy.patch, x, y)) grid.v[ix * gy + iy] += 0.5;
      }
      if (rand() < 0.4) {
        const pb = polyBox(asy.patch), fb = polyBox(asy.floor[0]);
        const fx = pb.minX + (0.25 + rand() * 0.5) * (pb.maxX - pb.minX);
        prefer = { from: [fx, (pb.minY + pb.maxY) / 2], to: [fx + gauss(rand) * viewW * 0.3, (fb.minY + fb.maxY) / 2] };
      }
    }
  }
  const views = (boxW * boxH) / (viewW * viewH);
  const durS = Math.max(8, Math.min(18, 6.5 + 2.4 * Math.sqrt(views) + (rand() - 0.5) * 3));
  const speed = Math.hypot(viewW, viewH) * (0.013 + rand() * 0.011);
  return planCamera(grid, box, viewW, viewH, speed, durS, rand, prefer, view.hole ?? null);
}
