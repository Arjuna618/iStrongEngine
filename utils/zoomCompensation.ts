export const INITIAL_DPR: number = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;

export function getZoomCompensation(): number {
  return INITIAL_DPR / (window.devicePixelRatio || 1);
}

export function getEffectiveDPR(): number {
  return INITIAL_DPR;
}

export function getBrowserZoomFactor(): number {
  return (window.devicePixelRatio || 1) / INITIAL_DPR;
}

export function getEffectiveViewportWidth(): number {
  return window.innerWidth * getBrowserZoomFactor();
}
export function getEffectiveViewportHeight(): number {
  return window.innerHeight * getBrowserZoomFactor();
}

export function getCumulativeZoom(el: Element | null): number {
  if (!el) return 1;
  const native = (el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom;
  if (typeof native === 'number' && native > 0) return native;
  let z = 1;
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    const f = parseFloat(getComputedStyle(node).getPropertyValue('zoom'));
    if (f > 0 && f !== 1) z *= f;
    node = node.parentElement;
  }
  return z || 1;
}

const SCALE_OF = /scale\(\s*([\d.]+)/;
export function getVisualScale(el: Element | null): number {
  let s = getCumulativeZoom(el);
  for (let n = el as HTMLElement | null; n; n = n.parentElement) {
    const t = n.style?.transform;
    if (!t || !t.includes('scale(')) continue;
    const f = parseFloat((SCALE_OF.exec(t) ?? [])[1] ?? '');
    if (f > 0) s *= f;
  }
  return s || 1;
}

export function blockBrowserZoomInputs(): () => void {
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_' ||
        e.code === 'NumpadAdd' || e.code === 'NumpadSubtract') {
      e.preventDefault();
    }
  };
  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  window.addEventListener('keydown', onKeyDown, true);
  return () => {
    window.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('keydown', onKeyDown, true);
  };
}

export function onZoomChange(callback: (compensation: number) => void): () => void {
  let disposed = false;
  let lastDpr = window.devicePixelRatio || 1;
  const notifyIfChanged = () => {
    if (disposed) return;
    const dpr = window.devicePixelRatio || 1;
    if (dpr !== lastDpr) {
      lastDpr = dpr;
      callback(getZoomCompensation());
    }
  };
  let mq: MediaQueryList | null = null;
  const onQueryChange = () => {
    if (disposed) return;
    notifyIfChanged();
    listen();
  };
  function listen() {
    mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', onQueryChange, { once: true });
  }
  listen();
  window.addEventListener('resize', notifyIfChanged);
  return () => {
    disposed = true;
    if (mq) { mq.removeEventListener('change', onQueryChange); mq = null; }
    window.removeEventListener('resize', notifyIfChanged);
  };
}
