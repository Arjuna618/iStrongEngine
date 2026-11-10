const _g = globalThis as { __ISTRONG_OLD_BASES?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_BASES === 1 || _g.process?.env?.ISTRONG_OLD_BASES === '1';

export const BASE_AREAS = {
  ON: _old ? 0 : 1,
};
