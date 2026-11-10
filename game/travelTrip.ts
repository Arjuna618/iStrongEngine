import { PLAY_MODE_ENTRIES, getPlayEntry, resolvePlayConfig, engineModeKey, worldPlayEntry, getPlaySettingSpec, entryTeams, type PlayModeEntry } from './gameModeRegistry';
import { StepAccumulator, runFixedStepFrame } from './fixedStep';
import { spreadBots, primeReach, kindOf } from '../components/menuScene/sceneMaker';
import { skipLifeOf, SKIP_FRESH_SHARE } from './skipTime';
import { survives, type MatchRecord, type JourneyBot, type TripBot } from './travel';
import { MODE_WORLDS, isWorldId } from './modeWorlds';
import { MISSING_MODES } from './missingModesSwitch';
import { SMALL_FIX } from './smallFixSwitch';
import { dreadTeamId } from '../types';
const STEP_S = 1 / 60;
export const V2_DREADNOUGHT = '14c1db130cdac94e';

export interface TripPlan {
  key: string;
  record?: MatchRecord;
  minutes: number;
  journeys: JourneyBot[];
  team: number;
}

interface Keep {
  tank: string; level: number; xp: number; upgrades: Record<string, number>; skillPoints: number; growth: number; ghost: boolean; god: boolean;
}

export function pickMode(word: string, currentKey: string, rand: () => number): string | null {
  if (word === 'nexus' || word === 'forge' || word === 'labyrinth') return word;
  if (word === 'random') {
    const pool = PLAY_MODE_ENTRIES.filter(e => e.category === 'normal' && !e.growth && !e.armsRace && !e.preset && !e.od && e.key !== currentKey && e.key !== 'nexus' && !(e.world && MODE_WORLDS[e.world].noCard));
    return pool.length > 0 ? pool[Math.floor(rand() * pool.length)].key : null;
  }
  return getPlayEntry(word) ? word : null;
}
export function entryOf(key: string): PlayModeEntry | null {
  const e = getPlayEntry(key);
  if (e) return e;
  return isWorldId(key) ? worldPlayEntry(key) : null;
}
export function keyOfConfig(gm: { mode: never; growth: boolean; preset?: string; armsRace?: boolean; world?: string; teams?: number; enableSpawnZones?: boolean; overlay?: string } | Record<string, unknown>): string {
  const c = gm as { mode: Parameters<typeof engineModeKey>[0]; growth: boolean; preset?: string; armsRace?: boolean; world?: string; teams?: number; enableSpawnZones?: boolean; overlay?: string };
  return engineModeKey(c.mode, c.growth, c.preset, c.armsRace, c.world, c.teams, c.enableSpawnZones, c.overlay);
}

function keepPlayer(g: any): Keep {
  const s = g.state;
  const god = SMALL_FIX.GH574 !== 0 && s.gracePeriodActive ? !!s._preGraceGodMode : !!s.godMode;
  return { tank: s.currentTankFileName ?? 'basic', level: s.level, xp: s.currentXp, upgrades: { ...s.upgrades }, skillPoints: s.skillPoints, growth: s.playerGrowthScale, ghost: !!s.ghostMode, god };
}
function restorePlayer(g: any, k: Keep, forge: boolean): void {
  const tank = forge && !isDreadV2(g, k.tank) ? V2_DREADNOUGHT : k.tank;
  const lib = g.getTankLibraryMap();
  if (lib.has(tank)) g.evolveToTank(tank, false, false, true);
  g.state.level = k.level;
  g.state.currentXp = k.xp;
  if (tank === k.tank) { g.state.upgrades = { ...k.upgrades }; g.state.skillPoints = k.skillPoints; }
  g.state.playerGrowthScale = k.growth;
  g.state.tankCurrentHealth = g.state.tankHP * g.getStatMultiplier('maxHealth');
  if (typeof g._sizeSlideSync === 'function') g._sizeSlideSync();
  if (SMALL_FIX.GH574 !== 0 && g.state.gracePeriodActive) { g.state._preGraceGodMode = k.god; g.updateState({ ghostMode: k.ghost }); }
  else g.updateState({ ghostMode: k.ghost, godMode: k.god });
}
export function isDreadV2(g: any, tank: string): boolean {
  try { return typeof g.treeRootOf === 'function' ? g.treeRootOf(tank) === V2_DREADNOUGHT : false; } catch { return false; }
}

function ordinary(g: any): any[] {
  const out: any[] = [];
  for (const e of g.state.enemyTanks) if (g._skipOrdinary(e)) out.push(e);
  return out;
}

function becomeRemembered(g: any, e: any, b: { name: string; tank: string; xp: number }, lib: Map<string, unknown>): void {
  e.displayName = b.name;
  if (b.tank && lib.has(b.tank) && b.tank !== e.currentTankName) { g.applyBotEvolution(e, b.tank, lib); e.evolutionComplete = true; }
  if (b.xp > e.currentXp) g.addEnemyXp(e, b.xp - e.currentXp);
  g._v2DreadJoin(e);
}

export function* tripBuild(g: any, plan: TripPlan, rand: () => number): Generator<void, void, void> {
  const entry = entryOf(plan.key);
  if (!entry) return;
  const keep = keepPlayer(g);
  const forge = plan.key === 'forge';
  g.tripping = true;
  try {
    g.exitTestMode();
    g._resetEngineSetupForPlaySession();
    const cfg = resolvePlayConfig(entry);
    if (plan.team >= 1 && plan.team <= (cfg.teams ?? 0)) cfg.playerTeam = plan.team;
    if (plan.key === 'nexus') {
      const n = plan.record ? Math.max(0, plan.record.bots.length + plan.journeys.length) : 5 + Math.floor(rand() * 11);
      const t = cfg.teams || 4, per = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) per[i % t]++;
      cfg.teamEnemyConfig = { ...cfg.teamEnemyConfig, team1: per[0], team2: per[1], team3: per[2], team4: per[3] };
    }
    g.applyGameMode(cfg, true);
    if (plan.record && Number.isFinite(plan.record.seed)) g.state.mapConfig = { ...g.state.mapConfig, seed: plan.record.seed };
    g.enterTestMode();
    if (cfg.playerTeam === plan.team && g.mevMatch && g.mevMatch.sameTeamOnReturn === false) {
      const fresh = resolvePlayConfig(entry).playerTeam;
      if (fresh !== plan.team) { g.updateState({ gameModeConfig: { ...g.state.gameModeConfig, playerTeam: fresh } }); g._placePlayerAtSpawn(); }
    }
  } finally {
    g.tripping = false;
  }
  g.updateState({ ghostMode: true, godMode: true });
  yield;
  const acc = new StepAccumulator();
  const step = (): void => { runFixedStepFrame(g, acc, STEP_S); };
  let last = -1, stable = 0;
  for (let k = 0; k < 120; k++) {
    step(); yield;
    const n = ordinary(g).length;
    if (n === last && n > 0) { if (++stable >= 20 && k >= 30) break; } else stable = 0;
    last = n;
  }
  for (const e of ordinary(g)) g._skipFinishChoosing(e);
  const lib = g.getTankLibraryMap();
  const pool = ordinary(g);
  const used = new Set<any>();
  const _dread = dreadTeamId();
  const takeOn = (team: string, forTeam: string = ''): any => { for (const e of pool) if (!used.has(e) && (team === '' || e.team === team) && !(SMALL_FIX.G648 !== 0 && team === '' && forTeam !== _dread && e.team === _dread)) { used.add(e); return e; } return null; };
  if (plan.record) {
    const rec = plan.record;
    for (const b of rec.bots as TripBot[]) {
      if (!survives(b, rec.roomMin, plan.minutes, skipLifeOf, SKIP_FRESH_SHARE)) continue;
      if (SMALL_FIX.G707 !== 0 && plan.journeys.some((j: { name: string }) => j.name === b.name)) continue;
      const e = takeOn(b.team) ?? takeOn('', b.team);
      if (!e) break;
      becomeRemembered(g, e, b, lib);
      g._skipKeepDraws(e.id, b.draws);
    }
  }
  const travellers: string[] = [];
  for (const j of plan.journeys) {
    const e = takeOn(j.team) ?? takeOn('', j.team);
    if (!e) break;
    becomeRemembered(g, e, j, lib);
    if (j.dread && !isDreadV2(g, e.currentTankName)) g._tripMakeDread(e);
    travellers.push(j.name);
  }
  yield;
  const firstAge = g.mevMatch && typeof g.mevMatch.startAged === 'number' && g.mevMatch.startAged > 0 ? g.mevMatch.startAged : 0;
  const roomMin = plan.record ? Math.max(1, Math.round(plan.record.roomMin + plan.minutes)) : Math.max(1, Math.round(firstAge > 0 ? firstAge : plan.minutes));
  try { g._chatTimeSkip(['skip', String(Math.min(99999, roomMin))]); } catch { }
  for (let k = 0; k < 240 && g._skipQueueSize() > 0; k++) { step(); yield; }
  g._tripDreadnoughts(forge);
  yield;
  primeReach(g); yield;
  spreadBots(g, kindOf(entry), rand); yield;
  for (let k = 0; k < 90; k++) { step(); yield; }
  restorePlayer(g, keep, forge);
  g._tripArrived(plan.key, travellers, roomMin);
}

const _usualPlayers = new Map<string, number>();
function playersOf(key: string, g: any): number {
  const L = g && g.travel;
  if (L) {
    const rec = L.recall(key);
    if (rec) { let n = rec.bots.length + 1; for (let i = 0; i < L.journeys.length; i++) if (L.journeys[i].at === key) n++; return n; }
  }
  let n = _usualPlayers.get(key);
  if (n === undefined) {
    const e = entryOf(key);
    n = 0;
    if (e) {
      if (key === 'nexus') n = 10;
      else if (key === 'forge') n = 3;
      else { const sp = getPlaySettingSpec(e); n = (sp.kind === 'perTeam' ? sp.defaultValue * Math.max(1, entryTeams(e) || 2) : sp.defaultValue) + 1; }
    }
    _usualPlayers.set(key, n);
  }
  return n;
}
export function installTravel(GameLogicClass: { travelHooks: unknown }): void {
  if (MISSING_MODES.ON === 0) return;
  GameLogicClass.travelHooks = { pickMode, entryOf, keyOfConfig, tripBuild, title: (key: string) => entryOf(key)?.title ?? key,
    spread: (g: any) => { primeReach(g); const e = entryOf(keyOfConfig(g.state.gameModeConfig)); if (e) spreadBots(g, kindOf(e), Math.random); },
    players: playersOf };
}
