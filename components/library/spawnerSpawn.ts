import type { GameLogic } from '../../game/GameLogic';
import type { ShapeDefinition } from '../../game/ShapeRegistry';
import { SENTRY_ENEMY_CONFIGS } from '../../game/SentryConfigs';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import type { LibEntry } from './catalog';

export function spawnerCapGroup(def: ShapeDefinition): 'food' | 'crasher' {
  return def.spawnTier === 'crasher' ? 'crasher' : 'food';
}

export interface SpawnerTotals { food: number; crasher: number; sentry: number; sentinel: number; effective: number; total: number; }

export function spawnerTotals(logic: GameLogic, counts: ReadonlyMap<string, number>, entryOf: (key: string) => LibEntry | undefined): SpawnerTotals {
  let food = 0, crasher = 0, sentry = 0, sentinel = 0;
  for (const [key, n] of counts) {
    const e = entryOf(key);
    if (!e || n <= 0) continue;
    if (e.kind === 'shape' && e.shape) { if (spawnerCapGroup(e.shape) === 'food') food += n; else crasher += n; }
    else if (e.kind === 'sentry' && e.sentry) { if (e.sentry.pool === 'sentry') sentry += n; else sentinel += n; }
  }
  const b = logic.playerAreaShapeBudget();
  const sentryLeft = Math.max(0, logic.sentryBudget('sentry') - logic.countActiveSentries());
  const sentinelLeft = Math.max(0, logic.sentryBudget('sentinel') - logic.countActiveSentinels());
  const effective = Math.min(food, b.foodCap) + Math.min(crasher, b.crasherCap) + Math.min(sentry, sentryLeft) + Math.min(sentinel, sentinelLeft);
  return { food, crasher, sentry, sentinel, effective, total: food + crasher + sentry + sentinel };
}

export function spawnerSpawn(logic: GameLogic, counts: ReadonlyMap<string, number>, entryOf: (key: string) => LibEntry | undefined, sentries: readonly LibEntry[]): void {
  const t = spawnerTotals(logic, counts, entryOf);
  if (t.effective <= 0) return;
  if (SMALL_FIX.R157C !== 0 && logic.tankDying) {
    logic.pushMessage('Nothing spawned: your tank is dying.');
    logic.updateState({ isDebugMenuOpen: false });
    logic.setPaused(false);
    return;
  }
  const budget = logic.playerAreaShapeBudget();
  const queue: Array<{ shapeId: string; remaining: number }> = [];
  let foodBudget = budget.foodCap;
  let crasherBudget = budget.crasherCap;
  let totalFoodInQueue = 0;
  let totalCrasherInQueue = 0;
  for (const [key, n] of counts) {
    const e = entryOf(key);
    if (!e || e.kind !== 'shape' || !e.shape || n <= 0) continue;
    const def = e.shape;
    let allowed = n;
    if (spawnerCapGroup(def) === 'food') { allowed = Math.min(allowed, foodBudget); foodBudget -= allowed; totalFoodInQueue += allowed; }
    else { allowed = Math.min(allowed, crasherBudget); crasherBudget -= allowed; totalCrasherInQueue += allowed; }
    if (allowed > 0) queue.push({ shapeId: def.id, remaining: allowed });
  }
  if (queue.length > 0) {
    logic.removeShapesForForceSpawn(totalFoodInQueue, totalCrasherInQueue);
    logic.enqueueShapeSpawns(queue);
  }
  const spawnPool = (pool: 'sentry' | 'sentinel', left: number) => {
    let budgetLeft = left;
    for (const e of sentries) {
      if (e.kind !== 'sentry' || !e.sentry || e.sentry.pool !== pool) continue;
      const n = counts.get(e.key) ?? 0;
      if (n <= 0 || budgetLeft <= 0) continue;
      const config = logic.state.enemyConfigs.find(c => c.isSentryEnemy && c.id === SENTRY_ENEMY_CONFIGS[e.sentry!.key].id);
      if (!config) continue;
      const toSpawn = Math.min(n, budgetLeft);
      let spawned = 0;
      for (let i = 0; i < toSpawn; i++) {
        if (!logic.spawnEnemy(config, true)) break;
        spawned++;
      }
      budgetLeft -= spawned;
    }
  };
  spawnPool('sentry', Math.max(0, logic.sentryBudget('sentry') - logic.countActiveSentries()));
  spawnPool('sentinel', Math.max(0, logic.sentryBudget('sentinel') - logic.countActiveSentinels()));
  logic.updateState({ isDebugMenuOpen: false });
  logic.setPaused(false);
}
