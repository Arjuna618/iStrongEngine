import { CM, CM_USE, cmHex } from './colorMap';

export const DBG_INK = Object.freeze({
  ATTACK: CM.RED,
  CHASE: CM.TRIANGLES,
  FARM: CM.PURPLE,
  FLEE: CM.TRIANGLES,
  ROAM: CM.BLUE,
  GUARD: CM.HEXAGONS,
  OTHER: CM.ROGUES,
  XP: CM.PENTAGONS,
  NAV_B3: CM.PURPLE,
  GIVE_UP_ROUTE: CM.RED,
  GIVE_UP_OTHER: CM.SQUARES,
  RARITY: CM.SQUARES,
});

export function dbgInk(slot: number, dark: boolean): string {
  return cmHex(slot, dark, CM_USE.GENERAL);
}
