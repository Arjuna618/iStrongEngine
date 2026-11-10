export interface CanvasHolder {
  take(): void;
}

const _holders: CanvasHolder[] = [];

export function lendCanvas(h: CanvasHolder): void {
  const i = _holders.indexOf(h);
  if (i >= 0) _holders.splice(i, 1);
  _holders.push(h);
}

export function holdsCanvas(h: CanvasHolder): boolean {
  return _holders.length > 0 && _holders[_holders.length - 1] === h;
}

export function canvasHolder(): CanvasHolder | null {
  return _holders.length > 0 ? _holders[_holders.length - 1] : null;
}

export function returnCanvas(h: CanvasHolder): boolean {
  const top = holdsCanvas(h);
  const i = _holders.indexOf(h);
  if (i >= 0) _holders.splice(i, 1);
  if (_holders.length === 0) return true;
  if (top) _holders[_holders.length - 1].take();
  return false;
}
