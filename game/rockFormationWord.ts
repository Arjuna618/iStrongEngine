import { ROCK_FORMATIONS, type RockFormationWord } from './rockFormations.generated';
import { SMALL_FIX } from './smallFixSwitch';
export function isRockFormation(w: unknown): w is RockFormationWord {
  if (typeof w !== 'string') return false;
  return SMALL_FIX.GH520 ? Object.prototype.hasOwnProperty.call(ROCK_FORMATIONS, w) : w in ROCK_FORMATIONS;
}
