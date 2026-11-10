const _g = globalThis as { __ISTRONG_OLD_SHAPES?: unknown; __ISTRONG_OLD_SCORES?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_SHAPES === 1 || _g.process?.env?.ISTRONG_OLD_SHAPES === '1';
const _oldScores = _g.__ISTRONG_OLD_SCORES === 1 || _g.process?.env?.ISTRONG_OLD_SCORES === '1';

export const SHAPES_ARRAS: number = _old ? 0 : 1;

export const SHAPE_SCORES: number = _old || _oldScores ? 0 : 1;

const _oldSpawn = (globalThis as { __ISTRONG_OLD_SPAWN?: unknown }).__ISTRONG_OLD_SPAWN === 1 || _g.process?.env?.ISTRONG_OLD_SPAWN === '1';
export const SHAPE_SPAWN_PLAN: number = _old || _oldSpawn ? 0 : 1;
