import { ALL_MODES } from './allModesSwitch';

const _g = globalThis as { __ISTRONG_OLD_MISSING?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_MISSING === 1 || _g.process?.env?.ISTRONG_OLD_MISSING === '1';

export const MISSING_MODES: { ON: number } = { ON: _old || ALL_MODES.ON === 0 ? 0 : 1 };
