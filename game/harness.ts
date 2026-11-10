import type { GameLogic } from './GameLogic';
import type { TankConfig, EnemyConfig, ExportFile } from '../types';
import type { ArrasCollisionEntity, ArrasCollideResult } from './arrasCombat';
import { SHAPE_DEFINITIONS } from './ShapeRegistry';
import { SMALL_FIX } from './smallFixSwitch';
import { getEnemyStatMultiplier } from './EnemyAI';

export interface HarnessMatchupEntity {
  classId: string;
  role: 'tank' | 'shape';
  pos: { x: number; y: number };
  team: 'player' | 'enemy';
  level: number;
  fire: boolean;
}

export interface HarnessMatchup {
  description: string;
  entityA: HarnessMatchupEntity;
  entityB: HarnessMatchupEntity;
}

export const MATCHUPS: Record<string, HarnessMatchup> = {
  oracle_bullet_vs_square: {
    description: 'Oracle: Basic Tank fires at stationary Square',
    entityA: { classId: 'basic', role: 'tank', pos: { x: 0, y: 0 }, team: 'player', level: 45, fire: true },
    entityB: { classId: 'square', role: 'shape', pos: { x: 300, y: 0 }, team: 'enemy', level: 0, fire: false },
  },
  bigcheese_vs_conqueror: {
    description: 'Big Cheese drone vs Conqueror trap',
    entityA: { classId: 'bigCheese', role: 'tank', pos: { x: 0, y: 0 }, team: 'player', level: 45, fire: true },
    entityB: { classId: 'conqueror', role: 'tank', pos: { x: 600, y: 0 }, team: 'enemy', level: 45, fire: true },
  },
  bigcheese_vs_basic: {
    description: 'Big Cheese drone vs Basic Tank',
    entityA: { classId: 'bigCheese', role: 'tank', pos: { x: 0, y: 0 }, team: 'player', level: 45, fire: true },
    entityB: { classId: 'basic', role: 'tank', pos: { x: 500, y: 0 }, team: 'enemy', level: 45, fire: true },
  },
  factory_vs_basic: {
    description: 'Factory minion vs Basic Tank',
    entityA: { classId: 'factory', role: 'tank', pos: { x: 0, y: 0 }, team: 'player', level: 45, fire: true },
    entityB: { classId: 'basic', role: 'tank', pos: { x: 600, y: 0 }, team: 'enemy', level: 45, fire: true },
  },
  hybrid_vs_overseer: {
    description: 'Hybrid drone vs Overseer drone',
    entityA: { classId: 'hybrid', role: 'tank', pos: { x: 0, y: 0 }, team: 'player', level: 45, fire: true },
    entityB: { classId: 'overseer', role: 'tank', pos: { x: 600, y: 0 }, team: 'enemy', level: 45, fire: true },
  },
  battleship_vs_basic: {
    description: 'Battleship swarm vs Basic Tank',
    entityA: { classId: 'battleship', role: 'tank', pos: { x: 0, y: 0 }, team: 'player', level: 45, fire: true },
    entityB: { classId: 'basic', role: 'tank', pos: { x: 600, y: 0 }, team: 'enemy', level: 45, fire: true },
  },
  twister_vs_pentagon: {
    description: 'Twister trap vs Pentagon',
    entityA: { classId: 'twister', role: 'tank', pos: { x: 0, y: 0 }, team: 'player', level: 45, fire: true },
    entityB: { classId: 'pentagon', role: 'shape', pos: { x: 500, y: 0 }, team: 'enemy', level: 0, fire: false },
  },
  basic_vs_basic_ram: {
    description: 'Basic Tank vs Basic Tank ram',
    entityA: { classId: 'basic', role: 'tank', pos: { x: 0, y: 0 }, team: 'player', level: 45, fire: true },
    entityB: { classId: 'basic', role: 'tank', pos: { x: 300, y: 0 }, team: 'enemy', level: 45, fire: true },
  },
  conqueror_vs_basic: {
    description: 'Conqueror trap vs Basic Tank',
    entityA: { classId: 'conqueror', role: 'tank', pos: { x: 0, y: 0 }, team: 'player', level: 45, fire: true },
    entityB: { classId: 'basic', role: 'tank', pos: { x: 600, y: 0 }, team: 'enemy', level: 45, fire: true },
  },
};

export interface HarnessEvent {
  frame: number;
  eventSeq: number;
  matchupId: string;
  site: 'bullet-vs-shape' | 'bullet-vs-enemy' | 'bullet-vs-player' | 'bullet-vs-bullet';
  aType: string; aId: string;
  bType: string; bId: string;
  aDamage: number; bDamage: number;
  aPen: number; bPen: number;
  aResist: number; bResist: number;
  aHealthRatio: number; bHealthRatio: number;
  aShieldRatio: number; bShieldRatio: number;
  aHetero: number; bHetero: number;
  aDamageClass: number; bDamageClass: number;
  aDamageType: number; bDamageType: number;
  aBuffVsFood: boolean; bBuffVsFood: boolean;
  aRatioEffects: boolean; bRatioEffects: boolean;
  aDamageEffects: boolean; bDamageEffects: boolean;
  aMaxSpeed: number; bMaxSpeed: number;
  aMotionLength: number; bMotionLength: number;
  combinedRadius: number;
  difference: number;
  componentNorm: number;
  depthMe: number;
  depthN: number;
  accelerationFactor: number;
  rawDmgAB: number;
  rawDmgBA: number;
  finalDmgAB: number;
  finalDmgBA: number;
  deathFactorA: number;
  deathFactorB: number;
  swarmMult: number;
  dtNorm: number;
  foodBodyMult: number;
  aHP_before: number;
  bHP_before: number;
  aHP_max: number;
  bHP_max: number;
}

interface HarnessGlobal {
  log: boolean;
  matchupId: string;
  events: HarnessEvent[];
  frameCounter: number;
  endFrame: number;
  onComplete: (() => void) | null;
  recordEvent: (evt: Partial<HarnessEvent> & { site: HarnessEvent['site']; aceA: ArrasCollisionEntity; aceB: ArrasCollisionEntity; rawResult: ArrasCollideResult; finalDmgAB: number; finalDmgBA: number; aHP: number; bHP: number; aMaxHP: number; bMaxHP: number; aId: string; bId: string; aType: string; bType: string; swarmMult: number; dtNorm: number; foodBodyMult: number; combinedRadius: number; difference: number; componentNorm: number; depthMe: number; depthN: number; accelerationFactor: number; deathFactorA: number; deathFactorB: number }) => void;
}

declare global {
  var __harness: HarnessGlobal | undefined;
}

export function initHarnessGlobal(matchupId: string, endFrame: number, onComplete: () => void): void {
  const h: HarnessGlobal = {
    log: true,
    matchupId,
    events: [],
    frameCounter: 0,
    endFrame,
    onComplete,
    recordEvent: function (info) {
      try {
        const evt: HarnessEvent = {
          frame: this.frameCounter,
          eventSeq: this.events.length,
          matchupId: this.matchupId,
          site: info.site,
          aType: info.aType,
          aId: info.aId,
          bType: info.bType,
          bId: info.bId,
          aDamage: info.aceA.damage,
          bDamage: info.aceB.damage,
          aPen: info.aceA.penetration,
          bPen: info.aceB.penetration,
          aResist: info.aceA.healthResist,
          bResist: info.aceB.healthResist,
          aHealthRatio: info.aceA.healthRatio,
          bHealthRatio: info.aceB.healthRatio,
          aShieldRatio: info.aceA.shieldRatio,
          bShieldRatio: info.aceB.shieldRatio,
          aHetero: info.aceA.heteroMultiplier,
          bHetero: info.aceB.heteroMultiplier,
          aDamageClass: info.aceA.damageClass,
          bDamageClass: info.aceB.damageClass,
          aDamageType: info.aceA.damageType,
          bDamageType: info.aceB.damageType,
          aBuffVsFood: info.aceA.settingsBuffVsFood,
          bBuffVsFood: info.aceB.settingsBuffVsFood,
          aRatioEffects: info.aceA.settingsRatioEffects,
          bRatioEffects: info.aceB.settingsRatioEffects,
          aDamageEffects: info.aceA.settingsDamageEffects,
          bDamageEffects: info.aceB.settingsDamageEffects,
          aMaxSpeed: info.aceA.maxSpeed,
          bMaxSpeed: info.aceB.maxSpeed,
          aMotionLength: info.aceA.motionLength,
          bMotionLength: info.aceB.motionLength,
          combinedRadius: info.combinedRadius,
          difference: info.difference,
          componentNorm: info.componentNorm,
          depthMe: info.depthMe,
          depthN: info.depthN,
          accelerationFactor: info.accelerationFactor,
          rawDmgAB: info.rawResult.damageAB,
          rawDmgBA: info.rawResult.damageBA,
          finalDmgAB: info.finalDmgAB,
          finalDmgBA: info.finalDmgBA,
          deathFactorA: info.deathFactorA,
          deathFactorB: info.deathFactorB,
          swarmMult: info.swarmMult,
          dtNorm: info.dtNorm,
          foodBodyMult: info.foodBodyMult,
          aHP_before: info.aHP,
          bHP_before: info.bHP,
          aHP_max: info.aMaxHP,
          bHP_max: info.bMaxHP,
        };
        this.events.push(evt);
      } catch (err) {
        console.error('[HARNESS] recordEvent error:', err);
      }
    },
  };
  globalThis.__harness = h;
}

export function harnessTick(): void {
  const h = globalThis.__harness;
  if (!h || !h.log) return;
  h.frameCounter++;
  if (h.frameCounter >= h.endFrame) {
    h.log = false;
    if (h.onComplete) h.onComplete();
  }
}

export function logHarnessDiag(logic: GameLogic): void {
  try {
    const h = globalThis.__harness;
    if (!h) return;
    const any_logic = logic as any;
    const state = any_logic.state;
    const bullets = (any_logic.bullets || []) as Array<{ active: boolean; position?: { x: number; y: number } }>;
    const activeBullets = bullets.filter(b => b.active).length;
    const shapes = (any_logic.floatingPolygons || []) as Array<{ active: boolean; position?: { x: number; y: number }; hp?: number }>;
    const activeShapes = shapes.filter(p => p.active).length;
    const firstShape = shapes.find(p => p.active);
    const enemyTanks = state?.enemyTanks || [];
    const tankPos = any_logic.tankPos;
    console.log(
      `[HARNESS-DIAG] frame=${h.frameCounter} ` +
      `player@(${tankPos?.x?.toFixed(0)},${tankPos?.y?.toFixed(0)}) ` +
      `autoFire=${state?.autoFire} testMode=${state?.isTestMode} ` +
      `bullets=${activeBullets}/${bullets.length} ` +
      `shapes=${activeShapes}${firstShape ? `@(${firstShape.position?.x?.toFixed(0)},${firstShape.position?.y?.toFixed(0)})hp=${firstShape.hp}` : ''} ` +
      `enemies=${enemyTanks.length} ` +
      `events=${h.events.length}`
    );
  } catch (err) {
    console.error('[HARNESS-DIAG] error:', (err as Error).message);
  }
}

export interface HarnessOptions {
  matchupId: string;
  frameBudget?: number;
  warmupFrames?: number;
}

export async function runHarnessMatchup(
  logic: GameLogic,
  opts: HarnessOptions,
): Promise<string> {
  const matchup = MATCHUPS[opts.matchupId];
  if (!matchup) {
    throw new Error(`[HARNESS] Unknown matchup: ${opts.matchupId}. Available: ${Object.keys(MATCHUPS).join(', ')}`);
  }
  const frameBudget = opts.frameBudget ?? 1000;
  const warmupFrames = opts.warmupFrames ?? 30;

  console.log(`[HARNESS] ===== iStrong HARNESS =====`);
  console.log(`[HARNESS] Matchup: ${opts.matchupId}: ${matchup.description}`);
  console.log(`[HARNESS] Frame budget: ${frameBudget}`);
  console.log(`[HARNESS] ============================`);

  return new Promise((resolve) => {
    initHarnessGlobal(opts.matchupId, frameBudget + warmupFrames, () => {
      const blob = _finalizeHarnessRun(opts.matchupId);
      resolve(blob);
    });

    setTimeout(() => {
      try {
        _spawnMatchup(logic, matchup);
      } catch (err) {
        const e = err as Error;
        console.error(`[HARNESS] Spawn failed: ${e.message}`);
        if (e.stack) console.error(`[HARNESS] Stack: ${e.stack}`);
        const h = globalThis.__harness!;
        h.log = false;
        resolve(_finalizeHarnessRun(opts.matchupId));
      }
    }, (warmupFrames / 60) * 1000);
  });
}

function _spawnMatchup(logic: GameLogic, matchup: HarnessMatchup): void {
  logic.enterTestMode();

  logic.state.spawnRate = 0;
  logic.state.shapeLimit = 0;
  logic.shapeSpawnQueue.length = 0;
  const _anyLogic = logic as any;
  if (typeof _anyLogic.recycleAllPolygons === 'function') _anyLogic.recycleAllPolygons();
  logic.state.enemyConfigs = [];

  const entA = matchup.entityA;
  const entB = matchup.entityB;

  if (entA.role !== 'tank') throw new Error('[HARNESS] entityA must be role=tank (player slot)');
  if (entA.team !== 'player') throw new Error('[HARNESS] entityA must be team=player');

  const tankA = _loadTankConfig(logic, entA.classId);
  if (!tankA) throw new Error(`[HARNESS] Could not find tank: ${entA.classId}`);
  logic.loadTankConfig(tankA);

  const origin = { x: entA.pos.x, y: entA.pos.y };
  if (entA.level > 0) {
    logic.setLevel(entA.level);
  }

  const playerX = logic.tankPos.x;
  const playerY = logic.tankPos.y;
  const bAbsX = playerX + (entB.pos.x - entA.pos.x);
  const bAbsY = playerY + (entB.pos.y - entA.pos.y);

  let targetGetter: () => { x: number; y: number } | null;
  let harnessEnemyRef: import('../types').EnemyTank | null = null;
  if (entB.role === 'shape') {
    _spawnHarnessShape(logic, entB.classId, bAbsX, bAbsY);
    const fixedTarget = { x: bAbsX, y: bAbsY };
    targetGetter = () => fixedTarget;
  } else {
    const spawned = _spawnHarnessEnemy(logic, entB.classId, bAbsX, bAbsY, entB.level, entB.fire);
    harnessEnemyRef = SMALL_FIX.CC031 !== 0 ? spawned : (logic.state.enemyTanks[0] || null);
    const _lockId = harnessEnemyRef ? harnessEnemyRef.id : '';
    targetGetter = () => {
      let et = logic.state.enemyTanks[0];
      if (SMALL_FIX.CC031 !== 0) { et = undefined as unknown as typeof et; const es = logic.state.enemyTanks; for (let i = 0; i < es.length; i++) if (es[i].id === _lockId) { et = es[i]; break; } }
      if (!et || !et.active) return null;
      return { x: et.position.x, y: et.position.y };
    };
  }

  if (entA.fire) {
    logic.state.autoFire = true;
  }

  const aimTimer = () => {
    const h = globalThis.__harness;
    if (!h || !h.log) return;
    try {
      const t = targetGetter();
      if (t) {
        const any_logic = logic as any;
        const zoom = any_logic.zoom || 1;
        logic.mouseX = (t.x - logic.tankPos.x) * zoom + logic.width / 2;
        logic.mouseY = (t.y - logic.tankPos.y) * zoom + logic.height / 2;
      }
    } catch { }
    requestAnimationFrame(aimTimer);
  };
  requestAnimationFrame(aimTimer);

  if (harnessEnemyRef !== null) {
    const lockedEnemyId = harnessEnemyRef.id;
    const _logicAny = logic as any;
    const puppetLockTimer = () => {
      const h = globalThis.__harness;
      if (!h || !h.log) return;
      try {
        const enemies = logic.state.enemyTanks;
        let enemy: import('../types').EnemyTank | null = null;
        for (let i = 0; i < enemies.length; i++) {
          if (enemies[i].id === lockedEnemyId) { enemy = enemies[i]; break; }
        }
        if (!enemy || !enemy.active || enemy.isDying) {
          requestAnimationFrame(puppetLockTimer);
          return;
        }

        enemy.aiBehavior = 'Enemy';
        enemy.aiState = 'attacking';
        enemy.currentTargetId = logic.state.playerId;
        enemy.currentTargetType = 'player';

        if (enemy.targetPosition) {
          enemy.targetPosition.set(logic.tankPos);
        }

        enemy.lastSawTargetTime = _logicAny.gameNow ? _logicAny.gameNow() : performance.now();
        enemy.navLosResult = true;
        enemy.navUseFlowField = false;

        enemy.fearHeat = 0;
        enemy.fearFleeCooldownUntil = 0;
        enemy.recentDamageIn3s = 0;
        if (enemy.damageTimestamps.length > 0) enemy.damageTimestamps.length = 0;
        enemy.totalPlayerDamage = 0;
        enemy.damageFromTanks.clear();
        enemy.aggroTowards.clear();
        enemy.fear.isFleeing = false;
        enemy.fear.fleeTarget = null;
        enemy.fear.fleeStartTime = 0;
        enemy.fear.fearReason = null;
        enemy.fear.fleeSourceId = null;

        enemy.isAggro = true;
      } catch { }
      requestAnimationFrame(puppetLockTimer);
    };
    requestAnimationFrame(puppetLockTimer);
  }

  console.log(`[HARNESS] Spawned matchup (player@(${playerX.toFixed(0)},${playerY.toFixed(0)}), enemy@(${bAbsX.toFixed(0)},${bAbsY.toFixed(0)}))`);
  console.log(`[HARNESS] autoFire=${logic.state.autoFire} isTestMode=${logic.state.isTestMode} spawnRate=${logic.state.spawnRate}`);

  const diagTimer = setInterval(() => {
    const h = globalThis.__harness;
    if (!h || !h.log) {
      clearInterval(diagTimer);
      return;
    }
    try {
      const any_logic = logic as any;
      const bullets = (any_logic.bullets || []).filter((b: { active: boolean }) => b.active);
      const shapes = (any_logic.floatingPolygons || []).filter((p: { active: boolean }) => p.active);
      const enemies = logic.state.enemyTanks || [];
      const byMotion: Record<string, number> = {};
      for (const b of bullets) {
        const mt = (b as { motionType?: string }).motionType || 'glide';
        byMotion[mt] = (byMotion[mt] || 0) + 1;
      }
      const pX = logic.tankPos.x.toFixed(0), pY = logic.tankPos.y.toFixed(0);
      const firstChase = bullets.find((b: { motionType?: string }) => b.motionType === 'chase');
      const firstGlide = bullets.find((b: { motionType?: string }) => b.motionType === 'glide');
      const eP = enemies[0] ? `e@(${enemies[0].position.x.toFixed(0)},${enemies[0].position.y.toFixed(0)})team=${enemies[0].team}` : 'none';
      const cP = firstChase ? `c@(${(firstChase as { position: { x: number; y: number }; team: string }).position.x.toFixed(0)},${(firstChase as { position: { x: number; y: number }; team: string }).position.y.toFixed(0)})team=${(firstChase as { team: string }).team}` : 'none';
      const gP = firstGlide ? `g@(${(firstGlide as { position: { x: number; y: number }; team: string }).position.x.toFixed(0)},${(firstGlide as { position: { x: number; y: number }; team: string }).position.y.toFixed(0)})team=${(firstGlide as { team: string }).team}` : 'none';
      console.log(
        `[HARNESS-VERIFY] f=${h.frameCounter} events=${h.events.length} ` +
        `bullets=${bullets.length}{${Object.entries(byMotion).map(([k, v]) => `${k}:${v}`).join(',')}} ` +
        `shapes=${shapes.length} enemies=${enemies.length} ` +
        `p@(${pX},${pY}) ${eP} ${cP} ${gP}`
      );
    } catch (err) {
      console.error('[HARNESS-VERIFY] error:', (err as Error).message);
    }
  }, 1000);
}

function _loadTankConfig(logic: GameLogic, classId: string): TankConfig | null {
  const tankLibrary = logic.state.tankLibrary || [];
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '');
  const queryNorm = norm(classId);
  for (const item of tankLibrary) {
    if (item.fileData && item.fileData.type === 'Tank') {
      const itemNorm = norm(item.name || '');
      const fileNorm = norm(item.fileData.name || '');
      if (itemNorm === queryNorm || fileNorm === queryNorm) {
        return item.fileData.data as TankConfig;
      }
    }
  }
  for (const item of tankLibrary) {
    if (item.fileData && item.fileData.type === 'Tank') {
      const itemNorm = norm(item.name || '');
      if (itemNorm.includes(queryNorm) || queryNorm.includes(itemNorm)) {
        return item.fileData.data as TankConfig;
      }
    }
  }
  return null;
}

function _spawnHarnessShape(logic: GameLogic, classId: string, x: number, y: number): void {
  let def = SHAPE_DEFINITIONS.get(classId);
  if (!def) {
    for (const [key, d] of SHAPE_DEFINITIONS.entries()) {
      if (key.includes(classId) || d.baseShape === classId) { def = d; break; }
    }
  }
  if (!def) throw new Error(`[HARNESS] Could not find shape: ${classId}`);
  const createShape = (logic as any).createShapeAtPosition?.bind(logic);
  if (!createShape) throw new Error('[HARNESS] createShapeAtPosition not accessible');
  createShape(def, x, y, -1);
}

export function _spawnHarnessEnemy(
  logic: GameLogic, classId: string, x: number, y: number,
  level: number, autoFire: boolean,
): import('../types').EnemyTank {
  const tank = _loadTankConfig(logic, classId);
  if (!tank) throw new Error(`[HARNESS] Could not find tank for enemy: ${classId}`);

  const enemyConfig: EnemyConfig = {
    id: `harness-${classId}`,
    enemyName: `[HARNESS] ${classId}`,
    tankConfig: tank,
    baseLevel: level,
    aiBehavior: 'Enemy',
    upgradeLogic: 'ByOrder',
    forceAutospin: false,
    forceAutoshoot: autoFire,
    maxSpawnCount: 1,
    autoRevival: false,
    enabled: true,
    aimbotStrength: 100,
    turnSpeed: 50,
    facingType: 'faceTarget',
    isSentryEnemy: false,
  };
  const enemy = logic.spawnEnemy(enemyConfig, false, false, true );
  if (!enemy) throw new Error(`[HARNESS] spawnEnemy returned null for ${classId}`);
  if (enemy.position && typeof enemy.position.set === 'function') {
    enemy.position.set(x, y);
  } else {
    const pos = enemy.position as any;
    if (pos) { pos.x = x; pos.y = y; }
  }

  const up = enemy.upgrades as Record<string, number>;
  for (const k of Object.keys(up)) up[k] = 0;
  enemy.skillPoints = 0;
  logic.recomputeEnemyResist(enemy);
  if (SMALL_FIX.CC030 !== 0) {
    enemy.currentHealth = enemy.maxHealth * getEnemyStatMultiplier(enemy, 'maxHealth');
    enemy.displayHp = enemy.currentHealth;
    enemy.currentShield = enemy.maxShield * getEnemyStatMultiplier(enemy, 'shieldCapacity');
    enemy.displayShield = enemy.currentShield;
  }

  const dx = logic.tankPos.x - x;
  const dy = logic.tankPos.y - y;
  const initialAngle = Math.atan2(dy, dx);
  enemy.angle = initialAngle;
  enemy.turretAngle = initialAngle;
  enemy.targetAngle = initialAngle;
  enemy.targetTurretAngle = initialAngle;
  return enemy;
}

function _finalizeHarnessRun(matchupId: string): string {
  const h = globalThis.__harness;
  if (!h) return JSON.stringify({ error: 'harness not initialized' });
  const lines = h.events.map((e) => JSON.stringify(e));
  const blob = lines.join('\n') + (lines.length ? '\n' : '');
  if (typeof window !== 'undefined') {
    window['__harnessBlob'] = blob;
    window['__harnessComplete'] = true;
    window['__harnessEvents'] = h.events;
    try { document.title = `HARNESS_DONE:${matchupId}:${h.events.length}`; } catch { }
  }
  console.log(`\n[HARNESS] ===== iStrong HARNESS COMPLETE =====`);
  console.log(`[HARNESS] Matchup: ${matchupId}`);
  console.log(`[HARNESS] Events logged: ${h.events.length}`);
  console.log(`[HARNESS] Final frame: ${h.frameCounter}`);
  console.log(`[HARNESS] =========================================\n`);
  try {
    const key = `harness:${matchupId}:${Date.now()}`;
    localStorage.setItem(key, blob);
    console.log(`[HARNESS] Log stored at localStorage['${key}']`);
  } catch (err) {
    console.error('[HARNESS] localStorage write failed:', err);
  }
  const CHUNK = 4000;
  console.log(`[HARNESS_BLOB_START:${matchupId}:${blob.length}]`);
  for (let i = 0; i < blob.length; i += CHUNK) {
    console.log(`[HARNESS_BLOB_CHUNK]${blob.slice(i, i + CHUNK)}`);
  }
  console.log(`[HARNESS_BLOB_END]`);
  return blob;
}

export function readHarnessURLParams(): HarnessOptions | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  const matchupId = p.get('__harness');
  if (!matchupId) return null;
  const frameBudget = parseInt(p.get('budget') || '1000', 10);
  const warmupFrames = parseInt(p.get('warmup') || '30', 10);
  return { matchupId, frameBudget, warmupFrames };
}
