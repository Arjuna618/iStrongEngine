import { useLayoutEffect, useRef } from 'react';
import { useLeave } from './presence';
import { useWindowLayer } from './windowStack';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FLOATING = '.k-drop, .k-ctx, .k-toast, .k-edit-value, .k-type-sheet, [role="tooltip"], [data-k-float]';

const stack: HTMLElement[] = [];
const top = (): HTMLElement | null => stack.length > 0 ? stack[stack.length - 1] : null;
let installed = false;

function tabbables(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  el.querySelectorAll<HTMLElement>(FOCUSABLE).forEach(x => { if (x.getClientRects().length > 0 && !x.closest('[inert]')) out.push(x); });
  return out;
}

function install(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', (e) => {
    const w = top();
    if (!w || e.key !== 'Tab' || e.defaultPrevented) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && !w.contains(t) && t.closest(FLOATING)) return;
    const all = tabbables(w);
    if (all.length === 0) { e.preventDefault(); w.focus({ preventScroll: true }); return; }
    const first = all[0], last = all[all.length - 1], at = document.activeElement;
    const inside = !!at && w.contains(at);
    if (!inside) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && (at === first || at === w)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (at === last || at === w)) { e.preventDefault(); first.focus(); }
  }, true);
  document.addEventListener('focusin', (e) => {
    const w = top();
    const t = e.target instanceof Element ? e.target : null;
    if (!w || !t || w.contains(t) || t.closest(FLOATING)) return;
    w.focus({ preventScroll: true });
  }, true);
}

export function useFocusScope(ref: { readonly current: HTMLElement | null }): void {
  const firstBefore = useRef<Element | null | undefined>(undefined);
  if (firstBefore.current === undefined) firstBefore.current = typeof document !== 'undefined' ? document.activeElement : null;
  const tracked = useRef<HTMLElement | null>(null);
  const before = useRef<Element | null>(null);
  const firstCommit = useRef(true);
  const release = () => {
    const el = tracked.current;
    if (!el) return;
    tracked.current = null;
    const i = stack.lastIndexOf(el);
    if (i >= 0) stack.splice(i, 1);
    const b = before.current as HTMLElement | null;
    const now = document.activeElement;
    if (b && b !== document.body && b.isConnected && typeof b.focus === 'function' && (!now || now === document.body || el.contains(now)))
      b.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    const el = ref.current;
    const atFirst = firstCommit.current;
    firstCommit.current = false;
    if (el === tracked.current) return;
    release();
    if (!el) return;
    install();
    tracked.current = el;
    before.current = atFirst ? firstBefore.current ?? null : document.activeElement;
    stack.push(el);
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
  });
  useLayoutEffect(() => release, []);
}

export function useWindowFrame(f: { scrim: { readonly current: HTMLElement | null }; card: { readonly current: HTMLElement | null };
  focus?: { readonly current: HTMLElement | null }; closing: boolean }): void {
  useFocusScope(f.focus ?? f.card);
  const layer = useWindowLayer(!f.closing);
  useLeave(f.card, f.closing || layer.covered, 'pop');
  useLeave(f.scrim, f.closing, 'fade');
  useLayoutEffect(() => {
    const el = f.scrim.current;
    if (el) { el.classList.toggle('k-scrim-over', layer.over); el.classList.toggle('k-scrim-covered', layer.covered); }
  });
}

export function focusScopes(): readonly HTMLElement[] { return stack; }
