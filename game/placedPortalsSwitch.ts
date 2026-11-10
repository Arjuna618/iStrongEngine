const _g = globalThis as { __ISTRONG_OLD_PORTALS?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_PORTALS === 1 || _g.process?.env?.ISTRONG_OLD_PORTALS === '1';

export const PLACED_PORTALS = {
  ON: _old ? 0 : 1,
};
