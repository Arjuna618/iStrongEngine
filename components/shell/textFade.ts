const TEXT_BOX = 'input:not([type]), input[type="text"], input[type="search"], input[type="number"]';
export const FADE_SELECTOR = `.k-fade, .truncate, .k-split-title, .k-pick-title, .k-pick-meta, .k-lib-tag-sm > span, .k-pb-name, .k-death-label, .k-hub-name, .k-hub-foot-text, .k-ev-sentence, .k-ev-mon-line, .k-ev-detail-title, .k-ev-msg-where, ${TEXT_BOX}`;
const FADE_EM = 1.6;
const READ_PX_S = 58;
const BACK_PX_S = READ_PX_S * 2;
const HOVER_WAIT_MS = 280;
const RAMP_S = 0.07;

function rampPos(t: number, D: number, v: number): number {
  const a = v / RAMP_S;
  if (D < v * RAMP_S) {
    const tp = Math.sqrt(D / a);
    if (t <= tp) return 0.5 * a * t * t;
    const r = Math.max(0, 2 * tp - t);
    return D - 0.5 * a * r * r;
  }
  const T = D / v + RAMP_S;
  if (t <= RAMP_S) return 0.5 * a * t * t;
  if (t >= T) return D;
  if (t >= T - RAMP_S) { const r = T - t; return D - 0.5 * a * r * r; }
  return v * RAMP_S / 2 + v * (t - RAMP_S);
}
function rampTime(D: number, v: number): number {
  const a = v / RAMP_S;
  return D < v * RAMP_S ? 2 * Math.sqrt(D / a) : D / v + RAMP_S;
}

interface Glide { raf: number; from: number; to: number; t0: number; dur: number; wait: number }
const glides = new Map<HTMLElement, Glide>();
const pending = new Set<HTMLElement>();
let frame = 0;
let ro: ResizeObserver | null = null;
let mo: MutationObserver | null = null;
let layerMo: MutationObserver | null = null;
let reduce = false;
let _playing = false;
const menuRoots = new Set<HTMLElement>();
const WATCH_ALL: MutationObserverInit = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value'] };

function isLayer(n: Node): n is HTMLElement {
  return n instanceof HTMLElement && n.id !== 'root' && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE';
}

function armPlaying(): void {
  if (!mo || !layerMo) return;
  const left = mo.takeRecords();
  if (left.length) onRecords(left);
  mo.disconnect();
  layerMo.observe(document.body, { childList: true });
  const kids = document.body.children;
  for (let i = 0; i < kids.length; i++) if (isLayer(kids[i])) mo.observe(kids[i], WATCH_ALL);
  menuRoots.forEach(r => mo!.observe(r, WATCH_ALL));
}

export function setTextFadePlaying(on: boolean): void {
  if (on === _playing) return;
  _playing = on;
  if (!mo || !ro || !layerMo) return;
  if (on) {
    mo.takeRecords();
    ro.disconnect();
    pending.clear();
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    glides.forEach((_g, el) => {
      let inMenu = false;
      menuRoots.forEach(r => { if (r.contains(el)) inMenu = true; });
      if (inMenu) return;
      stop(el);
      setPos(el, 0);
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
      paint(el, overOf(el));
    });
    armPlaying();
  } else {
    layerMo.disconnect();
    const left = mo.takeRecords();
    if (left.length) onRecords(left);
    mo.disconnect();
    mo.observe(document.body, WATCH_ALL);
    track(document.body);
  }
}

export function registerTextFadeRoot(el: HTMLElement): () => void {
  menuRoots.add(el);
  if (_playing && mo) { mo.observe(el, WATCH_ALL); track(el); }
  return () => {
    menuRoots.delete(el);
    if (_playing) { untrack(el); armPlaying(); }
  };
}

function onRecords(records: MutationRecord[]): void {
  for (const r of records) {
    if (r.type === 'attributes') { if (isFade(r.target as Element)) schedule(r.target as HTMLElement); continue; }
    if (r.type === 'characterData') {
      const host = r.target.parentElement?.closest(FADE_SELECTOR) as HTMLElement | null;
      if (host) schedule(host);
      continue;
    }
    r.addedNodes.forEach(n => {
      if (n.nodeType === 1) track(n as Element);
      else if (n.nodeType === 3) { const host = n.parentElement?.closest(FADE_SELECTOR) as HTMLElement | null; if (host) schedule(host); }
    });
    r.removedNodes.forEach(n => { if (n.nodeType === 1) untrack(n as Element); });
  }
}

function onLayers(records: MutationRecord[]): void {
  let gone = false;
  for (const r of records) {
    r.addedNodes.forEach(n => { if (isLayer(n) && mo) { mo.observe(n, WATCH_ALL); track(n); } });
    r.removedNodes.forEach(n => { if (isLayer(n)) { untrack(n); gone = true; } });
  }
  if (gone) armPlaying();
}

function isFade(el: Element): el is HTMLElement { return el instanceof HTMLElement && el.matches(FADE_SELECTOR); }

const ROW_HOST = '[data-kfade-row]';
function fadeUnder(t: Element | null): HTMLElement | null {
  const el = t?.closest?.(FADE_SELECTOR) as HTMLElement | null;
  if (el) return el;
  const row = t?.closest?.(ROW_HOST);
  return row ? row.querySelector<HTMLElement>(FADE_SELECTOR) : null;
}

function fadeLen(el: HTMLElement): number { return (parseFloat(getComputedStyle(el).fontSize) || 12) * FADE_EM; }

const indents = new WeakMap<HTMLElement, number>();
function setIndent(el: HTMLElement, i: number): void {
  indents.set(el, i);
  el.style.textIndent = i > 0.01 ? `${(-i).toFixed(2)}px` : '';
}
function posOf(el: HTMLElement): number { return (indents.get(el) ?? 0) + el.scrollLeft; }
function setPos(el: HTMLElement, x: number): void { if (isTextBox(el)) setIndent(el, x); else el.scrollLeft = x; }
function overOf(el: HTMLElement): number {
  const i = indents.get(el) ?? 0;
  if (i <= 0.01) return el.scrollWidth - el.clientWidth;
  el.style.textIndent = '';
  const over = el.scrollWidth - el.clientWidth;
  el.style.textIndent = `${(-i).toFixed(2)}px`;
  return over;
}
function foldScroll(el: HTMLElement): void {
  if (!isTextBox(el)) return;
  const s = el.scrollLeft;
  if (s > 0.5) { el.scrollLeft = 0; setIndent(el, (indents.get(el) ?? 0) + s); }
}
function unfoldIndent(el: HTMLElement): void {
  const i = indents.get(el) ?? 0;
  if (i <= 0.01) return;
  setIndent(el, 0);
  el.scrollLeft = i;
}

function paint(el: HTMLElement, over: number): void {
  if (over <= 1) {
    if (el.hasAttribute('data-kfade')) { el.removeAttribute('data-kfade'); el.style.removeProperty('--kf-l'); el.style.removeProperty('--kf-r'); }
    if (indents.get(el)) setIndent(el, 0);
    if (el.scrollLeft !== 0) el.scrollLeft = 0;
    return;
  }
  if (!el.hasAttribute('data-kfade')) el.setAttribute('data-kfade', '');
  if (!glides.has(el) && (indents.get(el) ?? 0) > over + 0.5) setIndent(el, over);
  setEnds(el, fadeLen(el), over, posOf(el));
}
function setEnds(el: HTMLElement, f: number, over: number, x: number): void {
  x = Math.max(0, Math.min(over, x));
  el.style.setProperty('--kf-l', `${Math.min(f, x).toFixed(1)}px`);
  el.style.setProperty('--kf-r', `${Math.min(f, over - x).toFixed(1)}px`);
}

function measureNow(): void {
  frame = 0;
  const list: HTMLElement[] = [];
  const overs: number[] = [];
  pending.forEach(el => { if (el.isConnected) { list.push(el); overs.push(overOf(el)); } });
  pending.clear();
  for (let i = 0; i < list.length; i++) if (!glides.has(list[i])) paint(list[i], overs[i]);
}
function schedule(el: HTMLElement): void {
  pending.add(el);
  if (!frame) frame = requestAnimationFrame(measureNow);
}
function track(root: Element): void {
  if (isFade(root)) { ro?.observe(root); schedule(root); }
  const inner = root.querySelectorAll<HTMLElement>(FADE_SELECTOR);
  for (let i = 0; i < inner.length; i++) { ro?.observe(inner[i]); schedule(inner[i]); }
}
function untrack(root: Element): void {
  if (isFade(root)) { ro?.unobserve(root); stop(root); }
  const inner = root.querySelectorAll<HTMLElement>(FADE_SELECTOR);
  for (let i = 0; i < inner.length; i++) { ro?.unobserve(inner[i]); stop(inner[i]); }
}

function stop(el: HTMLElement): void {
  const g = glides.get(el);
  if (!g) return;
  cancelAnimationFrame(g.raf);
  window.clearTimeout(g.wait);
  glides.delete(el);
}

function glide(el: HTMLElement, to: number, speed: number, delay: number): void {
  stop(el);
  foldScroll(el);
  const over = overOf(el);
  if (over <= 1) return;
  const from = posOf(el);
  const target = Math.max(0, Math.min(over, to));
  if (Math.abs(target - from) < 0.5) { paint(el, over); return; }
  if (reduce) { setPos(el, target); paint(el, over); return; }
  const f = fadeLen(el);
  const D = Math.abs(target - from), dir = target > from ? 1 : -1;
  const g: Glide = { raf: 0, from, to: target, t0: 0, dur: rampTime(D, speed) * 1000, wait: 0 };
  glides.set(el, g);
  const step = (now: number) => {
    if (!g.t0) g.t0 = now;
    const t = Math.min(1, (now - g.t0) / g.dur);
    const x = t >= 1 ? g.to : g.from + dir * rampPos((now - g.t0) / 1000, D, speed);
    setPos(el, x);
    if (t < 1 && glides.get(el) === g) { setEnds(el, f, over, x); g.raf = requestAnimationFrame(step); return; }
    paint(el, overOf(el));
    if (glides.get(el) === g) glides.delete(el);
  };
  const begin = () => { g.raf = requestAnimationFrame(step); };
  if (delay > 0) g.wait = window.setTimeout(begin, delay); else begin();
}

function typingIn(el: Element | null): el is HTMLInputElement { return isTextBox(el) && el === document.activeElement; }
function isTextBox(el: Element | null): el is HTMLInputElement { return el instanceof HTMLInputElement && el.matches(TEXT_BOX); }
const lastX = new WeakMap<HTMLInputElement, number>();
const lastKeyAt = new WeakMap<HTMLInputElement, number>();
const typingHome = new WeakMap<HTMLInputElement, number>();
function wholeSelected(el: HTMLInputElement): boolean {
  try { return el.value.length > 0 && el.selectionStart === 0 && el.selectionEnd === el.value.length; } catch { return false; }
}
let downOn: EventTarget | null = null;
let downAt = 0;
function standsAtStart(el: HTMLInputElement): boolean {
  if (wholeSelected(el)) return true;
  if (downOn === el && performance.now() - downAt < 1000) return false;
  try { const n = el.value.length; return n > 0 && el.selectionStart === n && el.selectionEnd === n; } catch { return false; }
}
export function textBoxToStart(el: HTMLInputElement): void {
  if (!isTextBox(el)) return;
  typingHome.delete(el);
  try { const n = el.value.length; el.setSelectionRange(n, n); } catch { }
  if (el.scrollLeft !== 0) el.scrollLeft = 0;
  setIndent(el, 0); paint(el, overOf(el));
}
const TYPING_REST_MS = 700;
let measureCtx: CanvasRenderingContext2D | null = null;
function backTarget(el: HTMLInputElement): number {
  let end: number | null = null;
  try { end = el.selectionEnd; } catch { end = null; }
  if (end == null) return 0;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 0;
  const cs = getComputedStyle(el);
  measureCtx.font = cs.font;
  const caret = measureCtx.measureText(el.value.slice(0, end)).width;
  const view = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  return Math.max(0, caret - view + 2);
}

export function installTextFade(): () => void {
  if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return () => {};
  reduce = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  ro = new ResizeObserver(entries => { for (const e of entries) schedule(e.target as HTMLElement); });
  mo = new MutationObserver(onRecords);
  layerMo = new MutationObserver(onLayers);
  if (_playing) armPlaying();
  else { mo.observe(document.body, WATCH_ALL); track(document.body); }
  const over = (e: PointerEvent) => {
    if (_playing && (e.target as Element | null)?.tagName === 'CANVAS') return;
    const el = fadeUnder(e.target as Element | null);
    if (!el || !el.hasAttribute('data-kfade')) return;
    if (typingIn(el)) return;
    const g = glides.get(el);
    if (g && g.to > 0) return;
    glide(el, overOf(el), READ_PX_S, posOf(el) > 0 ? 0 : HOVER_WAIT_MS);
  };
  const out = (e: PointerEvent) => {
    const el = fadeUnder(e.target as Element | null);
    if (!el) return;
    const to = e.relatedTarget as Node | null;
    if (to && (el.closest(ROW_HOST) ?? el).contains(to)) return;
    if (typingIn(el)) { typingHome.delete(el); return; }
    if (posOf(el) > 0 || glides.has(el)) glide(el, 0, BACK_PX_S, 0);
  };
  const focusIn = (e: FocusEvent) => {
    const el = e.target as Element | null;
    if (!isTextBox(el)) return;
    requestAnimationFrame(() => {
      if (document.activeElement !== el || !standsAtStart(el)) return;
      const g = glides.get(el);
      if (g && g.to <= 0.5) return;
      stop(el);
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
      setIndent(el, 0); paint(el, overOf(el));
    });
    if (!el.hasAttribute('data-kfade')) return;
    stop(el);
    window.setTimeout(() => {
      if (document.activeElement !== el || standsAtStart(el)) return;
      unfoldIndent(el); paint(el, overOf(el));
    }, 0);
  };
  const focusOut = (e: FocusEvent) => {
    const el = e.target as Element | null;
    if (!isTextBox(el)) return;
    stop(el);
    const seen = Math.max(posOf(el), lastX.get(el) ?? 0);
    if (seen <= 0.5) return;
    if (el.scrollLeft !== 0) el.scrollLeft = 0;
    setIndent(el, seen);
    glide(el, 0, BACK_PX_S, 0);
  };
  const pointerDown = (e: PointerEvent) => { downOn = e.target; downAt = performance.now(); };
  const keyDown = (e: KeyboardEvent) => {
    const el = e.target as Element | null;
    if (!isTextBox(el)) return;
    lastKeyAt.set(el, performance.now());
    stop(el);
    typingHome.delete(el);
    unfoldIndent(el);
  };
  const typed = (e: Event) => { const el = e.target as Element | null; if (isTextBox(el)) schedule(el); };
  const scrolled = (e: Event) => {
    const el = e.target as Element | null;
    if (!isTextBox(el)) return;
    lastX.set(el, posOf(el));
    if (!glides.has(el) && el.hasAttribute('data-kfade')) paint(el, overOf(el));
  };
  document.addEventListener('pointerover', over, true);
  document.addEventListener('pointerout', out, true);
  document.addEventListener('focusin', focusIn, true);
  document.addEventListener('focusout', focusOut, true);
  document.addEventListener('keydown', keyDown, true);
  document.addEventListener('pointerdown', pointerDown, true);
  document.addEventListener('input', typed, true);
  document.addEventListener('scroll', scrolled, true);
  return () => {
    document.removeEventListener('pointerover', over, true);
    document.removeEventListener('pointerout', out, true);
    document.removeEventListener('focusin', focusIn, true);
    document.removeEventListener('focusout', focusOut, true);
    document.removeEventListener('keydown', keyDown, true);
    document.removeEventListener('pointerdown', pointerDown, true);
    document.removeEventListener('input', typed, true);
    document.removeEventListener('scroll', scrolled, true);
    mo?.disconnect(); ro?.disconnect(); layerMo?.disconnect(); mo = null; ro = null; layerMo = null;
    glides.forEach((_g, el) => stop(el));
    if (frame) cancelAnimationFrame(frame);
    frame = 0; pending.clear();
  };
}
