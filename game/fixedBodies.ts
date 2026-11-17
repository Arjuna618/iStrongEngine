import { TANK_KINDS } from './tankDebuffs';

const _WORDS = new Set<string>([
  ...TANK_KINDS.flatMap(k => k.words),
  'baseProtector', 'Base Protector',
  'antiTankMachineGun', 'A.T.M.G.',
]);

export function aimsAheadFully(category: string | undefined | null): boolean {
  return category === 'Map Entities' || category === 'Sanctuaries';
}

export function isFixedMapThing(word: string | undefined | null): boolean {
  return !!word && _WORDS.has(word);
}
