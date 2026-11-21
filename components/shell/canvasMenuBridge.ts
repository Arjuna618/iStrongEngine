let _open: ((e: MouseEvent) => void) | null = null;
export function setCanvasMenu(f: ((e: MouseEvent) => void) | null): void { _open = f; }
export function openCanvasMenu(e: MouseEvent): void { if (_open !== null) _open(e); }
