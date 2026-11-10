const _g = globalThis as { __ISTRONG_OLD_HEALTH_BASIS?: unknown; process?: { env?: Record<string, string | undefined> } };
const _raw = typeof _g.__ISTRONG_OLD_HEALTH_BASIS === 'string' ? _g.__ISTRONG_OLD_HEALTH_BASIS
  : (_g.process?.env?.ISTRONG_OLD_HEALTH_BASIS ?? '');
const _offList = _raw.split(',').map(s => s.trim()).filter(Boolean);
const _all = _offList.includes('all');
const _on = (key: string): number => (_all || _offList.includes(key)) ? 0 : 1;

export const HEALTH_BASIS: {
  AGGRO: number;
  DISTRESS: number;
  FLEE: number;
  FEAR: number;
  HOLD: number;
  THREAT: number;
  TACTICS: number;
} = {
  AGGRO: _on('AGGRO'),
  DISTRESS: _on('DISTRESS'),
  FLEE: _on('FLEE'),
  FEAR: _on('FEAR'),
  HOLD: _on('HOLD'),
  THREAT: _on('THREAT'),
  TACTICS: _on('TACTICS'),
};
