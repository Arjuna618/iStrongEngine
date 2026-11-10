interface Sentinel { released: boolean; release(): Promise<void>; addEventListener(type: 'release', f: () => void): void; }
interface WakeLockApi { request(type: 'screen'): Promise<Sentinel>; }

let _want = false;
let _held: Sentinel | null = null;
let _asking = false;
let _installed = false;

function _api(): WakeLockApi | null {
  const n = (typeof navigator !== 'undefined' ? navigator : null) as (Navigator & { wakeLock?: WakeLockApi }) | null;
  return n && n.wakeLock && typeof n.wakeLock.request === 'function' ? n.wakeLock : null;
}

export function wakeLockOffered(): boolean { return _api() !== null; }
export function wakeLockHeld(): boolean { return _held !== null && !_held.released; }

async function _ask(): Promise<void> {
  const api = _api();
  if (!api || _asking || wakeLockHeld() || !_want) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  _asking = true;
  try {
    const s = await api.request('screen');
    if (!_want) { void s.release().catch(() => {}); return; }
    _held = s;
    s.addEventListener('release', () => { if (_held === s) _held = null; });
  } catch {
  } finally { _asking = false; }
}

export function keepScreenAwake(on: boolean): void {
  _want = on;
  if (!_installed && typeof document !== 'undefined') {
    _installed = true;
    document.addEventListener('visibilitychange', () => { if (_want && document.visibilityState === 'visible') void _ask(); });
  }
  if (on) { void _ask(); return; }
  const s = _held; _held = null;
  if (s && !s.released) void s.release().catch(() => {});
}
