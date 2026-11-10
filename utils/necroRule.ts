export const NECRO_MAX_NESTED = 2;

export function necroMayTake(
  roundSides: number, shapeSides: number, isCrasher: boolean,
  rarity: string, scaleVariant: string, labyLevel: number,
  category: string | undefined, on: boolean,
): boolean {
  if (isCrasher || shapeSides !== roundSides) return false;
  if (!on) return true;
  if (category !== undefined && category !== 'base' && category !== 'laby') return false;
  if (rarity !== 'normal' || scaleVariant !== 'normal') return false;
  return labyLevel >= 0 && labyLevel <= NECRO_MAX_NESTED;
}
