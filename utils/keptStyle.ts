const _kept = new Set<string>();

export function keepStyle(id: string, css: string): void {
  if (_kept.has(id)) return;
  _kept.add(id);
  if (typeof document === 'undefined' || !document.head || typeof document.createElement !== 'function') return;
  if (typeof document.getElementById === 'function' && document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}
