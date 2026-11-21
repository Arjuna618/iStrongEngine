export function snapSides(next: number, prev: number): number {
  if (next === 0 || next >= 3) return next;
  return prev === 0 ? 3 : 0;
}

export function nearSides(v: number): number {
  const r = Math.round(v);
  return r === 1 ? 0 : r === 2 ? 3 : r;
}
