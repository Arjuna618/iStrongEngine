const _g = globalThis as { __ISTRONG_OLD_MAP_EVENTS?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_MAP_EVENTS === 1 || _g.process?.env?.ISTRONG_OLD_MAP_EVENTS === '1';

export const MAP_EVENTS = {
  ON: _old ? 0 : 1,
  DRIVE: _old || _g.process?.env?.ISTRONG_OLD_STAGE_DRIVE === '1' ? 0 : 1,
} as const;
