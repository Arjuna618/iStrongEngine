const _g = globalThis as { __ISTRONG_OLD_MODES?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_MODES === 1 || _g.process?.env?.ISTRONG_OLD_MODES === '1';

export const ALL_MODES: { ON: number } = { ON: _old ? 0 : 1 };
