const SLACK = 3;

export function pointOnText(el: Element | null, x: number, y: number): boolean {
  if (!el) return false;
  const box = el.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = range.getClientRects();
  for (let i = 0; i < rects.length; i++) {
    const q = rects[i];
    if (q.width <= 0) continue;
    const l = Math.max(q.left, box.left) - SLACK, r = Math.min(q.right, box.right) + SLACK;
    const t = Math.max(q.top, box.top) - SLACK, b = Math.min(q.bottom, box.bottom) + SLACK;
    if (x >= l && x <= r && y >= t && y <= b) return true;
  }
  return false;
}

export function onNameWords(e: { currentTarget: EventTarget | null; clientX: number; clientY: number }, selector: string): boolean {
  const host = e.currentTarget as Element | null;
  return !!host && pointOnText(host.querySelector(selector), e.clientX, e.clientY);
}
