const _g = globalThis as { __ISTRONG_OLD_SQUARE_MAP?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_SQUARE_MAP === 1 || _g.process?.env?.ISTRONG_OLD_SQUARE_MAP === '1';

export const MAP_RECT: number = _old ? 0 : 1;

const _oldHalf = (_g as { __ISTRONG_OLD_MAP_HALF?: unknown }).__ISTRONG_OLD_MAP_HALF === 1 || _g.process?.env?.ISTRONG_OLD_MAP_HALF === '1';

export const MAP_HALF_EXACT: number = _oldHalf ? 0 : 1;
