const _g = globalThis as { __ISTRONG_OLD_MOBILE?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_MOBILE === 1 || _g.process?.env?.ISTRONG_OLD_MOBILE === '1';

export const MOBILE_ARRAS: number = _old ? 0 : 1;

const _g2 = globalThis as { __ISTRONG_OLD_MOBILE_UI?: unknown; process?: { env?: Record<string, string | undefined> } };
const _oldUi = _g2.__ISTRONG_OLD_MOBILE_UI === 1 || _g2.process?.env?.ISTRONG_OLD_MOBILE_UI === '1';

export const MOBILE_UI: number = _oldUi ? 0 : 1;

const _g3 = globalThis as { __ISTRONG_OLD_ALT_SPLIT?: unknown; process?: { env?: Record<string, string | undefined> } };
const _oldAlt = _g3.__ISTRONG_OLD_ALT_SPLIT === 1 || _g3.process?.env?.ISTRONG_OLD_ALT_SPLIT === '1';

export const MOBILE_ALT_SPLIT: number = _oldAlt ? 0 : 1;
