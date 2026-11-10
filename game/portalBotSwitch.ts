const _g = globalThis as { __ISTRONG_OLD_PORTAL_BOT?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_PORTAL_BOT === 1 || _g.process?.env?.ISTRONG_OLD_PORTAL_BOT === '1';

export const PORTAL_BOT_FREE: number = _old ? 0 : 1;

const _oldTravel = (_g as { __ISTRONG_OLD_PORTAL_TRAVEL?: unknown }).__ISTRONG_OLD_PORTAL_TRAVEL === 1
  || _g.process?.env?.ISTRONG_OLD_PORTAL_TRAVEL === '1';

export const PORTAL_BOT_TRAVEL: number = _oldTravel ? 0 : 1;
