const _g = globalThis as { __ISTRONG_OLD_ADMIN?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_ADMIN === 1 || _g.process?.env?.ISTRONG_OLD_ADMIN === '1';

export const ADMIN_PANEL = {
  ON: _old ? 0 : 1,
} as const;
