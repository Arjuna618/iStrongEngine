import type { GameState } from '../../types';
import { fieldsOf } from './fieldMap';

const KEY = 'istrong-person-v1';

export const PERSON_FIELDS: (keyof GameState)[] = fieldsOf('person').filter(k => k !== 'playerName');

let _last = '';

function pick(state: GameState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PERSON_FIELDS) out[k] = state[k];
  return out;
}

export function loadPersonPrefs(state: GameState): Partial<GameState> {
  let raw: unknown = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const k of PERSON_FIELDS) {
    const v = (raw as Record<string, unknown>)[k];
    if (v !== undefined && typeof v === typeof state[k]) out[k] = v;
  }
  _last = JSON.stringify({ ...pick(state), ...out });
  return out as Partial<GameState>;
}

export function savePersonPrefs(state: GameState): void {
  const text = JSON.stringify(pick(state));
  if (text === _last) return;
  _last = text;
  try { localStorage.setItem(KEY, text); } catch { }
}
