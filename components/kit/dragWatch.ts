export interface DropZoneReg {
  el: () => HTMLElement | null;
  accepts: () => boolean;
  onDrop: (dt: DataTransfer) => void;
}

const WATCHDOG_MS = 300;

let _active = false;
let _x = 0, _y = 0;
let _lastOver = 0;
let _timer = 0;
let _installed = false;
let _version = 0;
const _zones = new Set<DropZoneReg>();
const _subs = new Set<() => void>();
let _onStray: (() => void) | null = null;

function emit(): void { _version++; _subs.forEach(f => f()); }

function isFiles(e: DragEvent): boolean {
  const t = e.dataTransfer?.types;
  if (!t) return false;
  for (let i = 0; i < t.length; i++) if (t[i] === 'Files') return true;
  return false;
}

function zoneAt(x: number, y: number): DropZoneReg | null {
  const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  if (!hit) return null;
  for (const z of _zones) {
    const el = z.el();
    if (el && el.contains(hit) && z.accepts()) return z;
  }
  return null;
}

function end(): void {
  if (_timer) { window.clearInterval(_timer); _timer = 0; }
  if (!_active) return;
  _active = false;
  emit();
}

function install(): void {
  if (_installed || typeof window === 'undefined') return;
  _installed = true;
  const over = (e: DragEvent) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    const z = zoneAt(e.clientX, e.clientY);
    if (e.dataTransfer) e.dataTransfer.dropEffect = z ? 'copy' : 'none';
    _lastOver = performance.now();
    const moved = e.clientX !== _x || e.clientY !== _y;
    _x = e.clientX; _y = e.clientY;
    if (!_active) {
      _active = true;
      _timer = window.setInterval(() => { if (performance.now() - _lastOver > WATCHDOG_MS) end(); }, 100);
      emit();
    } else if (moved) emit();
  };
  const drop = (e: DragEvent) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    const z = zoneAt(e.clientX, e.clientY);
    end();
    if (z && e.dataTransfer) z.onDrop(e.dataTransfer);
    else _onStray?.();
  };
  window.addEventListener('dragenter', over, true);
  window.addEventListener('dragover', over, true);
  window.addEventListener('drop', drop, true);
  window.addEventListener('dragend', end, true);
}

export const dragWatch = {
  install,
  active(): boolean { return _active; },
  point(): { x: number; y: number } { return { x: _x, y: _y }; },
  version(): number { return _version; },
  subscribe(f: () => void): () => void { _subs.add(f); return () => { _subs.delete(f); }; },
  register(z: DropZoneReg): () => void { install(); _zones.add(z); return () => { _zones.delete(z); }; },
  over(z: DropZoneReg): boolean { return _active && zoneAt(_x, _y) === z; },
  setOnStray(fn: (() => void) | null): void { _onStray = fn; },
  _testEvent(type: 'over' | 'drop' | 'end', x: number, y: number, files = true, now?: number): void {
    const ev = { clientX: x, clientY: y, preventDefault() {}, dataTransfer: { types: files ? ['Files'] : ['text/plain'], dropEffect: 'none' } } as unknown as DragEvent;
    if (now !== undefined) _lastOver = now;
    if (type === 'end') { end(); return; }
    if (!isFiles(ev)) return;
    _x = x; _y = y; _lastOver = now ?? performance.now();
    if (type === 'over' && !_active) { _active = true; emit(); }
    else if (type === 'drop') end();
    else emit();
  },
  _testWatch(now: number): void { if (_active && now - _lastOver > WATCHDOG_MS) end(); },
};
