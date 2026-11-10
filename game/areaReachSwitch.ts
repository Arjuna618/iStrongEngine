const _g = globalThis as { __ISTRONG_OLD_AREA_REACH?: unknown; process?: { env?: Record<string, string | undefined> } };
const _raw = typeof _g.__ISTRONG_OLD_AREA_REACH === 'string' ? _g.__ISTRONG_OLD_AREA_REACH
  : (_g.process?.env?.ISTRONG_OLD_AREA_REACH ?? '');
const _offList = _raw.split(',').map(s => s.trim()).filter(Boolean);
const _all = _offList.includes('all');
const _on = (key: string): number => (_all || _offList.includes(key)) ? 0 : 1;

export const AREA_REACH: {
  ON: number;
  CH040: number;
  CH041: number;
  CH042: number;
  CH043: number;
} = {
  ON: _on('ON'),
  CH040: _on('CH040'),
  CH041: _on('CH041'),
  CH042: _on('CH042'),
  CH043: _on('CH043'),
};
