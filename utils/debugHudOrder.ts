let _seq = 0;
const _order = new Map<string, number>();
let _session = Number.NaN;
export function syncDebugHudSession(session: number): void {
  if (_session === session) return;
  _session = session;
  _seq = 0;
  _order.clear();
}

export function noteDebugHudEnabled(key: string): void {
  _seq++;
  _order.set(key, _seq);
}

export function debugHudOrderOf(key: string): number {
  return _order.get(key) ?? 0;
}
