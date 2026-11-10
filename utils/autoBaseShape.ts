export function autoBaseDepth(sides: number, depth: number | undefined): number {
  if (!(sides >= 3) || typeof depth !== 'number' || !(depth > 0)) return 0;
  return depth > 1 ? 1 : depth;
}

export function autoBaseTurn(sides: number, depth: number): number {
  void depth;
  return sides >= 4 && sides % 2 === 0 ? -Math.PI / sides : 0;
}
