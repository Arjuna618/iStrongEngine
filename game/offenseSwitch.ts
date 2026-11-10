const _g = globalThis as { __ISTRONG_OLD_OFFENSE?: unknown; process?: { env?: Record<string, string | undefined> } };
const _env = (k: string): string | undefined => _g.process?.env?.[k];
const _old = _g.__ISTRONG_OLD_OFFENSE === 1 || _env('ISTRONG_OLD_OFFENSE') === '1';
const _num = (k: string, d: number): number => { const v = _env('OFF_' + k); return v !== undefined && v !== '' && Number.isFinite(+v) ? +v : d; };
const _oldFix = _old || (_g as { __ISTRONG_OLD_OFFENSE_FIX?: unknown }).__ISTRONG_OLD_OFFENSE_FIX === 1 || _env('ISTRONG_OLD_OFFENSE_FIX') === '1';
let _fixArm = _oldFix;
const _fix = (k: string, now: number, before: number): number => _num(k, _fixArm ? before : now);
const _old1105 = _env('ISTRONG_OLD_RVR_1105') === '1';
const _f1105 = (k: string, now: number, before: number): number => _num(k, (_fixArm || _old1105) ? before : now);

const _makeOffense = () => {
const _rvrLaw = _fix('RVR_LAW', 1, 0) !== 0;

return {
  ON: _old ? 0 : _num('ON', 1),
  ACCEL_STAT: _num('ACCEL_STAT', 1),
  ACC_LIN: _num('ACC_LIN', 1),
  SF_SLOW: _num('SF_SLOW', 1),
  SF_FLOOR: _num('SF_FLOOR', 0.25),
  SF_POW: _num('SF_POW', 0.25),
  NO_GRAZE: _num('NO_GRAZE', 1),
  NO_BUFF_FOOD: _num('NO_BUFF_FOOD', 1),
  SWARM_NO_PEN_CUT: _num('SWARM_NO_PEN_CUT', 1),
  BOUNCE_SHAPE: _num('BOUNCE_SHAPE', 0),
  BOUNCE_K: _num('BOUNCE_K', 1),
  RVR_K: _num('RVR_K', _rvrLaw ? 0.449 : 0.449),
  RVR_LAW: _rvrLaw ? 1 : 0,
  RVR_DF: _fix('RVR_DF', 1, 0.7),
  RVR_OWN_RST: _fix('RVR_OWN_RST', _rvrLaw ? 1 : 0, 1),
  RVR_DEPTH: _fix('RVR_DEPTH', 0, 1),
  RVR_GRAZE: _f1105('RVR_GRAZE', 1, 0),
  RVR_HETERO_KIND: _num('RVR_HETERO_KIND', _rvrLaw ? 0 : 1),
  RVR_GUN_RESIST: _num('RVR_GUN_RESIST', 1),
  TANK_GUN_RESIST: _fix('TANK_GUN_RESIST', 0, 1),
  RVR_RESIST_K: _num('RVR_RESIST_K', 1),
  RVR_PEN_HETERO: _num('RVR_PEN_HETERO', 0),
  RVR_CROSS_K: _num('RVR_CROSS_K', 1),
  RVR_TIE: _f1105('RVR_TIE', 1, 0),
  RVR_TICK: _f1105('RVR_TICK', 1, 0),
  RVR_TICK_R: _num('RVR_TICK_R', 1.1),
  RVR_SF_SWARM: _f1105('RVR_SF_SWARM', 0, 0),
  RVR_SF_DRONE: _f1105('RVR_SF_DRONE', 0, 0),
  RVR_SF_BULLET: _f1105('RVR_SF_BULLET', 0, 0),
  RVR_SF_POW: _num('RVR_SF_POW', 0.75),
  RVR_SWARM_RANGE: _f1105('RVR_SWARM_RANGE', 1, 0),
  KNOCK_FULL: _num('KNOCK_FULL', 0),
  KNOCK_TOUCH: _num('KNOCK_TOUCH', 0),
  ROUND_KNOCK: _num('ROUND_KNOCK', 1),
  KNOCK_PHASE: _num('KNOCK_PHASE', 0),
  BOUNCE_NOW: _num('BOUNCE_NOW', 1),
  KNOCK_CCD: _num('KNOCK_CCD', 1),
  KNOCK_SPRING: _num('KNOCK_SPRING', 1),
  KNOCK_SHAPE_HP: _num('KNOCK_SHAPE_HP', 1),
  KNOCK_DF_TICK: _num('KNOCK_DF_TICK', 1),
  KNOCK_STR_POW: _num('KNOCK_STR_POW', 0),
  SZ_MASS: _num('SZ_MASS', 0),
  TANK_PUSH_K: _fix('TANK_PUSH_K', 2.24, 0.8),
  TANK_PUSH_SZ: _fix('TANK_PUSH_SZ', 0, 1.3),
  ROUND_KNOCK_K: _num('ROUND_KNOCK_K', 0.5),
  DRONE_NO_PEN_CUT: _num('DRONE_NO_PEN_CUT', 1),
  MISSILE_NO_RESIST: _fix('MISSILE_NO_RESIST', 0, 1),
  MINION_BODY_HIT: _num('MINION_BODY_HIT', 1),
  MB_DMG_K: _num('MB_DMG_K', 0.13),
  MB_LAW: _fix('MB_LAW', 1, 0),
  MB_BITE_K: _num('MB_BITE_K', 2.95),
  MB_BITE_P: _num('MB_BITE_P', 0.28),
  MB_BITE_S: _num('MB_BITE_S', 0.17),
  MB_TAKE: _num('MB_TAKE', 2.27),
  MB_TOUGH_P: _num('MB_TOUGH_P', 1.7),
  MB_TOUGH_S: _num('MB_TOUGH_S', 0.83),
  MB_TAKE_K: _num('MB_TAKE_K', 1),
  MB_TRI_K: _num('MB_TRI_K', 1.45),
  MB_PENT_K: _num('MB_PENT_K', 1),
  MB_HEX_K: _num('MB_HEX_K', 1),
  TANK_BOUNCE_PHASE: _fix('TANK_BOUNCE_PHASE', 1, 0),
  TANK_BOUNCE_K: _fix('TANK_BOUNCE_K', 4, 1),
  TANK_BOUNCE_KIND: _num('TANK_BOUNCE_KIND', 0),
  ACC_POW: _num('ACC_POW', 1),
  ACC_V0: _num('ACC_V0', 6),
  DRONE_PEN_DMG_POW: _fix('DRONE_PEN_DMG_POW', 0.19, 0.5),
  TRAP_NO_RESIST: _fix('TRAP_NO_RESIST', 0, 1),
  DAM_F: _fix('DAM_F', 3.17, 3),
  STR_F: _fix('STR_F', 2.4, 2),
  MB_PEN_POW: _fix('MB_PEN_POW', 0, 0),
  HEAL_NO_SHAPE: _fix('HEAL_NO_SHAPE', 1, 0),
  FIRST_SHOT_RELOAD: _fix('FIRST_SHOT_RELOAD', 1, 0),
  DEALT_RST: _fix('DEALT_RST', 0, 1),
  DEALT_DEPTH: _fix('DEALT_DEPTH', 0, 1),
  ROUND_ARC_ALL: _fix('ROUND_ARC_ALL', 1, 0),
  TANK_SAME: _fix('TANK_SAME', 1, 0),
  TANK_BITE_K: _num('TANK_BITE_K', 0.74),
  TANK_HIT_K: _num('TANK_HIT_K', 0.45),
  ROUND_PAIR: _fix('ROUND_PAIR', 1, 0),
  PAIR_R: _num('PAIR_R', 1),
  PAIR_S: _num('PAIR_S', 0.8),
  BITE_TICK: _fix('BITE_TICK', 1, 0),
  FWT_ONE_CLOCK: _fix('FWT_ONE_CLOCK', 1, 0),
  DEALT_RST_TANK: _fix('DEALT_RST_TANK', 0, 1),
  SF_ONLY_DRONES: _fix('SF_ONLY_DRONES', 1, 0),
  SF_POW_DRONE: _fix('SF_POW_DRONE', 0.75, 0.25),
  SWARM_RANGE_ON: _fix('SWARM_RANGE_ON', 0, 1),
  RATIO_ON: _fix('RATIO_ON', 0, 1),
  HEAL_SHIELD: _fix('HEAL_SHIELD', 1, 0),
  DRONE_SF_HP: _fix('DRONE_SF_HP', 0, 1),
  PEN_F: _fix('PEN_F', 5, 2.5),
  RST_STR: _fix('RST_STR', 0.5, 0.5),
  RST_PEN: _fix('RST_PEN', 5, 2.5),
  RING_RST_PEN: _fix('RING_RST_PEN', 1.6, 2.5),
  RST_STR_FOOD: _fix('RST_STR_FOOD', 0.5, 0.5),
  RST_PEN_FOOD: _fix('RST_PEN_FOOD', 5, 2.5),
  FOOD_RST_ROUND: _fix('FOOD_RST_ROUND', 0, 1),
  CLOSE_ON: _fix('CLOSE_ON', 1, 0),
  CONTACT_HOLD: _fix('CONTACT_HOLD', 1, 0),
  CLOSE_AWAY: _num('CLOSE_AWAY', 1),
  CLOSE_TOWARD: _num('CLOSE_TOWARD', 0.5),
  CLOSE_MISSILE_AWAY: _num('CLOSE_MISSILE_AWAY', 1.3),
  CLOSE_MISSILE_TOWARD: _num('CLOSE_MISSILE_TOWARD', 0.7),
  KIND: {
    bullet: { dmg: _fix('BULLET_DMG', 2.1, 1), hp: _fix('BULLET_HP', 0.27, 0.8), tank: _num('BULLET_TANK', 1.25), knock: _num('BULLET_KNOCK', 3.304), bounce: _num('BULLET_BOUNCE', 0.248), strPow: _num('BULLET_STRPOW', -0.18), szDmg: _fix('BULLET_SZDMG', 0, 1), szHp: _fix('BULLET_SZHP', 0, -0.18), tankPush: _fix('BULLET_TANKPUSH', 2.25, 1), tankHit: _num('BULLET_TANKHIT', 1) },
    missile: { dmg: _fix('MISSILE_DMG', 1.33, 0.852), hp: _fix('MISSILE_HP', 0.264, 0.8), tank: _num('MISSILE_TANK', 1), knock: _num('MISSILE_KNOCK', 0.472), bounce: _num('MISSILE_BOUNCE', 0.6), strPow: _num('MISSILE_STRPOW', 0.42), szDmg: _num('MISSILE_SZDMG', 0), szHp: _num('MISSILE_SZHP', 0), tankPush: _num('MISSILE_TANKPUSH', 1), tankHit: _num('MISSILE_TANKHIT', 1) },
    trap: { dmg: _fix('TRAP_DMG', 1.36, 0.948), hp: _fix('TRAP_HP', 0.1375, 1.25), tank: _num('TRAP_TANK', 1.67), knock: _num('TRAP_KNOCK', 0.826), bounce: _num('TRAP_BOUNCE', 0.636), strPow: _num('TRAP_STRPOW', 0.18), szDmg: _fix('TRAP_SZDMG', 0, 0.63), szHp: _fix('TRAP_SZHP', 0, 1.38), tankPush: _num('TRAP_TANKPUSH', 1), tankHit: _num('TRAP_TANKHIT', 1) },
    block: { dmg: _fix('BLOCK_DMG', 1.13, 0.807), hp: _fix('BLOCK_HP', 0.53, 0.999), tank: _num('BLOCK_TANK', 1.53), knock: _num('BLOCK_KNOCK', 0.678), bounce: _num('BLOCK_BOUNCE', 0.585), strPow: _num('BLOCK_STRPOW', 0.6), szDmg: _num('BLOCK_SZDMG', 0), szHp: _num('BLOCK_SZHP', 0), tankPush: _num('BLOCK_TANKPUSH', 1), tankHit: _num('BLOCK_TANKHIT', 1) },
    boomerang: { dmg: _fix('BOOM_DMG', 1.74, 0.98), hp: _fix('BOOM_HP', 0.96, 2.25), tank: _num('BOOM_TANK', 1), knock: _num('BOOM_KNOCK', 0.92), bounce: _num('BOOM_BOUNCE', 0.6), strPow: _num('BOOM_STRPOW', -0.18), szDmg: _num('BOOM_SZDMG', 0), szHp: _num('BOOM_SZHP', 0), tankPush: _num('BOOM_TANKPUSH', 1), tankHit: _num('BOOM_TANKHIT', 1) },
    drone: { dmg: _fix('DRONE_DMG', 1.74, 0.87), hp: _fix('DRONE_HP', 0.364, 0.4), tank: _num('DRONE_TANK', 0.86), knock: _num('DRONE_KNOCK', 20), bounce: _num('DRONE_BOUNCE', 0.6), strPow: _num('DRONE_STRPOW', -0.07), szDmg: _fix('DRONE_SZDMG', 0, 0.9), szHp: _num('DRONE_SZHP', 0), tankPush: _num('DRONE_TANKPUSH', 1), tankHit: _num('DRONE_TANKHIT', 1) },
    swarm: { dmg: _fix('SWARM_DMG', 3.7, 1.765), hp: _fix('SWARM_HP', 0.163, 0.48), tank: _num('SWARM_TANK', 1.36), knock: _num('SWARM_KNOCK', 1), bounce: _num('SWARM_BOUNCE', 0.6), strPow: _num('SWARM_STRPOW', 0.55), szDmg: _num('SWARM_SZDMG', 0), szHp: _num('SWARM_SZHP', 0), tankPush: _num('SWARM_TANKPUSH', 1), tankHit: _num('SWARM_TANKHIT', 1) },
    minion: { dmg: _num('MINION_DMG', 1), hp: _num('MINION_HP', 1), tank: _num('MINION_TANK', 1), knock: _num('MINION_KNOCK', 1), bounce: _num('MINION_BOUNCE', 1), strPow: _num('MINION_STRPOW', 0), szDmg: _num('MINION_SZDMG', 0), szHp: _fix('MINION_SZHP', 0, 0.85), tankPush: _num('MINION_TANKPUSH', 1), tankHit: _fix('MINION_TANKHIT', 1.8, 1) },
  } as Record<string, { dmg: number; hp: number; tank: number; knock: number; bounce: number; strPow: number; szDmg: number; szHp: number; tankPush: number; tankHit: number }>,
  BODY: {
    bullet: { dens: _num('BULLET_DENS', 0.46), push: _num('BULLET_PUSH', 0.08) },
    missile: { dens: _num('MISSILE_DENS', 2.6), push: _num('MISSILE_PUSH', 0.01) },
    trap: { dens: _num('TRAP_DENS', 1.8), push: _num('TRAP_PUSH', 0.3) },
    block: { dens: _num('BLOCK_DENS', 3.76), push: _num('BLOCK_PUSH', 0.5) },
    boomerang: { dens: _num('BOOM_DENS', 1.1), push: _num('BOOM_PUSH', 0.3) },
    drone: { dens: _num('DRONE_DENS', 4.6), push: _num('DRONE_PUSH', 0.09) },
    swarm: { dens: _num('SWARM_DENS', 6), push: _num('SWARM_PUSH', 0.11) },
    minion: { dens: _num('MINION_DENS', 2), push: _num('MINION_PUSH', 0.2) },
  } as Record<string, { dens: number; push: number }>,
  SHAPE_TOUCH: _fix('SHAPE_TOUCH', 1, 0),
  SHAPE_BODY_FIT: _fix('SHAPE_BODY_FIT', 1, 0),
};
};

export const OFFENSE_ARRAS = _makeOffense();
const _offenseOnShipped = OFFENSE_ARRAS.ON;

const _assignInPlace = (to: Record<string, unknown>, from: Record<string, unknown>): void => {
  for (const k of Object.keys(from)) {
    const v = from[k];
    if (v !== null && typeof v === 'object') {
      if (to[k] === null || typeof to[k] !== 'object') to[k] = {};
      _assignInPlace(to[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else to[k] = v;
  }
};

export function setOffenseOfBefore(before: boolean): void {
  _fixArm = before || _oldFix;
  _assignInPlace(OFFENSE_ARRAS as unknown as Record<string, unknown>, _makeOffense() as unknown as Record<string, unknown>);
  (OFFENSE_ARRAS as { ON: number }).ON = before ? 0 : _offenseOnShipped;
  _fillFight();
}

export const OFFENSE_SIZE_REF: Record<string, number> = { bullet: 20.833333333333336 * 1.006, trap: 18.229166666666668 * 0.679284, block: 31.25 * 1.020055, boomerang: 26.041666666666668 * 1.020055, drone: 28.645833333333336 * 0.634149, swarm: 21.354166666666664 * 0.408473, missile: 33.85416666666667 * 0.774, minion: 31.25 * 0.702 };

export const OFFENSE_KIND_IDS: Record<string, number> = { bullet: 1, missile: 2, trap: 3, block: 4, boomerang: 5, drone: 6, swarm: 7, minion: 8 };
export const OFFENSE_KIND_NAMES: readonly string[] = ['', 'bullet', 'missile', 'trap', 'block', 'boomerang', 'drone', 'swarm', 'minion'];
const _rvrKind: Record<string, number> = { bullet: 1, missile: _num('RVR_MISSILE', 1), trap: _num('RVR_TRAP', 0.77), block: _num('RVR_BLOCK', 1.73), boomerang: _num('RVR_BOOM', 1), drone: _num('RVR_DRONE', 0.62), swarm: _num('RVR_SWARM', 1), minion: _num('RVR_MINION', 0.45) };
export const RVR_FIGHT_D: readonly number[] = OFFENSE_KIND_NAMES.map(() => 1);
export const RVR_FIGHT_H: readonly number[] = OFFENSE_KIND_NAMES.map(() => 1);
const _RVR_PAIR_1105: Record<string, number> = {
  'boomerang>trap': 0.389, 'trap>boomerang': 0.0441,
  'swarm>trap': 0.28, 'trap>swarm': 0.512,
  'drone>block': 0.196, 'block>drone': 0.22,
  'minion>drone': 0.259, 'drone>minion': 0.149,
  'missile>drone': 0.0792, 'drone>missile': 0.0721,
  'missile>swarm': 0.541, 'swarm>missile': 0.305,
  'missile>block': 0.649, 'block>missile': 0.947,
  'missile>boomerang': 0.0153, 'boomerang>missile': 0.261,
  'missile>minion': 0.274, 'minion>missile': 0.373,
  'swarm>block': 0.125, 'block>swarm': 0.22,
  'swarm>boomerang': 0.0309, 'boomerang>swarm': 0.436,
  'swarm>drone': 0.0549, 'drone>swarm': 0.0726,
  'swarm>minion': 0.427, 'minion>swarm': 1.34,
  'block>trap': 1.07, 'trap>block': 0.839,
  'block>boomerang': 0.0865, 'boomerang>block': 0.632,
  'block>minion': 1.11, 'minion>block': 1.83,
  'boomerang>drone': 0.175, 'drone>boomerang': 0.0202,
  'boomerang>minion': 4.36, 'minion>boomerang': 1.75,
  'boomerang>bullet': 0.888, 'bullet>boomerang': 0.116,
  'swarm>bullet': 0.6,
};
export const RVR_PAIR: number[] = new Array(81).fill(1);
function _fillFight(): void {
  const d = RVR_FIGHT_D as number[], h = RVR_FIGHT_H as number[];
  for (let i = 0; i < OFFENSE_KIND_NAMES.length; i++) {
    const n = OFFENSE_KIND_NAMES[i];
    const on = OFFENSE_ARRAS.ON !== 0 && OFFENSE_ARRAS.RVR_LAW !== 0 && n !== '';
    d[i] = on ? 1 / OFFENSE_ARRAS.KIND[n].dmg : 1;
    h[i] = on ? _rvrKind[n] / OFFENSE_ARRAS.KIND[n].hp : 1;
  }
  const pairOn = OFFENSE_ARRAS.ON !== 0 && OFFENSE_ARRAS.RVR_LAW !== 0 && !_fixArm && !_old1105;
  for (let i = 0; i < OFFENSE_KIND_NAMES.length; i++) for (let j = 0; j < OFFENSE_KIND_NAMES.length; j++) {
    const a = OFFENSE_KIND_NAMES[i], b = OFFENSE_KIND_NAMES[j];
    RVR_PAIR[i * 9 + j] = pairOn && a !== '' && b !== '' ? _num('RVRP_' + a + '_' + b, _RVR_PAIR_1105[a + '>' + b] ?? 1) : 1;
  }
}
_fillFight();
export function offenseKindTankPush(kindId: number): number { if (OFFENSE_ARRAS.ON === 0 || !(kindId > 0)) return 1; const k = OFFENSE_ARRAS.KIND[OFFENSE_KIND_NAMES[kindId]]; return k ? k.tankPush : 1; }
export function offenseKindTankHit(kindId: number): number { if (OFFENSE_ARRAS.ON === 0 || !(kindId > 0)) return 1; const k = OFFENSE_ARRAS.KIND[OFFENSE_KIND_NAMES[kindId]]; return k ? k.tankHit : 1; }

export function offenseRoundKind(visual: string | undefined, behaviors: { type: string; enabled?: boolean }[] | undefined): string {
  let missile = false, boom = false, toTarget = false;
  if (behaviors) for (let i = 0; i < behaviors.length; i++) {
    const t = behaviors[i]; if (t.enabled === false) continue;
    if (t.type === 'independentProjectile') missile = true;
    else if (t.type === 'returnToOwner') boom = true;
    else if (t.type === 'goToTarget') toTarget = true;
  }
  if (visual === 'trap') return boom ? 'boomerang' : toTarget ? 'block' : 'trap';
  if (visual === 'drone' || visual === 'swarm' || visual === 'minion') return visual;
  return missile ? 'missile' : 'bullet';
}

