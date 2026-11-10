const _g = globalThis as { __ISTRONG_OLD_BOT_FIRE_GROUPS?: unknown; process?: { env?: Record<string, string | undefined> } };
const _raw = typeof _g.__ISTRONG_OLD_BOT_FIRE_GROUPS === 'string' ? _g.__ISTRONG_OLD_BOT_FIRE_GROUPS
  : (_g.process?.env?.ISTRONG_OLD_BOT_FIRE_GROUPS ?? '');
const _offList = _raw.split(',').map(s => s.trim()).filter(Boolean);
const _all = _offList.includes('all');
const _on = (key: string): number => (_all || _offList.includes(key)) ? 0 : 1;

export const BOT_FIRE_GROUPS: {
  TWO_BUTTONS: number;
  AUTOSHOOT_YIELDS: number;
  ALT_EFFECTS: number;
} = {
  TWO_BUTTONS: _on('TWO_BUTTONS'),
  AUTOSHOOT_YIELDS: _on('AUTOSHOOT_YIELDS'),
  ALT_EFFECTS: _on('ALT_EFFECTS'),
};

export const FG_LEFT_ON_DOT = 0.5;
export const FG_LEFT_OFF_DOT = 0.2;
export const FG_SWITCH_MS = 250;
export const FG_MIN_DRIVE = 0.25;
