const _g = globalThis as { __ISTRONG_OLD_SIZE?: unknown; __ISTRONG_OLD_TOUCH?: unknown; process?: { env?: Record<string, string | undefined> } };
const _oldAnchor = _g.__ISTRONG_OLD_SIZE === 1 || _g.process?.env?.ISTRONG_OLD_SIZE === '1';
const _oldTouch = _g.__ISTRONG_OLD_TOUCH === 1 || _g.process?.env?.ISTRONG_OLD_TOUCH === '1';

export const SIZE_ARRAS = {
  ANCHOR: _oldAnchor ? 0 : 1,
  TOUCH: _oldTouch ? 0 : 1,
} as const;

export const SIZE_ANCHOR_K = 48.25 / (24 + (9 - 1) / 9 * 24);
