import { TANK_KINDS } from './tankDebuffs';
import { SMALL_FIX } from './smallFixSwitch';

const _WORDS = new Set<string>([
  ...TANK_KINDS.flatMap(k => k.words),
  'baseProtector', 'Base Protector',
  'antiTankMachineGun', 'A.T.M.G.',
]);

export function aimsAheadFully(category: string | undefined | null): boolean {
  return category === 'Map Entities' || category === 'Sanctuaries';
}

const _OBJECTIVES = new Set<string>(TANK_KINDS.flatMap(k => k.words));

export function bossLeavesBody(v: { camp?: number; _mevF?: number } | null | undefined, t: { _toughWord?: string }): boolean {
  return SMALL_FIX.R1027 !== 0 && v != null && v.camp === 1 && ((v._mevF ?? 0) & 2048) === 0 && !!t._toughWord && _OBJECTIVES.has(t._toughWord);
}

export function isFixedMapThing(word: string | undefined | null): boolean {
  return !!word && _WORDS.has(word);
}
