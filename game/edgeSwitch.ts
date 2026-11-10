const _g = globalThis as { __ISTRONG_OLD_EDGE?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_EDGE === 1 || _g.process?.env?.ISTRONG_OLD_EDGE === '1';

export const EDGE_ARRAS: number = _old ? 0 : 1;
