export function roundFacingBake(sides: number): number {
  if (sides === 3) return Math.PI * 0.5;
  if (sides === 4) return Math.PI * 0.25;
  return 0;
}

export function roundHeadingOf(facingAngle: number, sides: number, on: boolean): number {
  return on ? facingAngle - roundFacingBake(sides) : facingAngle;
}

export function roundBodyTurnGL(sides: number, on: boolean, fromFacing: boolean, aimAsIs = false): number {
  if (aimAsIs && !fromFacing) return 0;
  if (Math.floor(sides) === 3) return -Math.PI / 2;
  if (on && fromFacing && sides === 4) return -Math.PI / 4;
  return 0;
}

export function roundEvenTurn(intSides: number): number {
  return intSides >= 4 && intSides % 2 === 0 ? -Math.PI / intSides : 0;
}

export function roundPoly2DStart(sides: number, on: boolean): number {
  if (on && sides >= 5 && Math.floor(sides) === sides) return roundEvenTurn(sides);
  return -Math.PI / 2;
}

export function roundTankBodyStart(sides: number): number {
  const n = Math.floor(sides);
  return roundEvenTurn(n) + (sides % 1) * Math.PI * 2;
}

export function roundPictureFirstCorner(heading: number, sides: number, on: boolean): number {
  const facing = heading + roundFacingBake(sides);
  return facing + roundBodyTurnGL(sides, on, true) + roundEvenTurn(Math.floor(sides));
}

export function crasherFacingOffsetOf(sides: number): number {
  const n = Math.floor(sides);
  if (n < 3) return 0;
  const step = (Math.PI * 2) / n;
  let off = 0 - roundEvenTurn(n);
  if (n === 4) off += step / 2;
  off %= step;
  if (off < 0) off += step;
  return off;
}
