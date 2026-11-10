import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { glide, takeOver, motionOff, flowChange } from './presence';

export const TAG_FADE_MS = 120;
export const TAG_SIZE_MS = 160;
const EXIT_MS = TAG_FADE_MS + TAG_SIZE_MS;

function openWidth(inner: HTMLElement | null): number {
  if (!inner) return 0;
  const cs = getComputedStyle(inner);
  return inner.offsetWidth + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
}

interface SlotItem { key: string; node: React.ReactNode; optional?: boolean }
interface Slot extends SlotItem { leaving: boolean; since: number }

function usePresence(items: SlotItem[]): Slot[] {
  const last = useRef<Slot[]>([]);
  const [, bump] = useState(0);
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const at = new Map<string, number>();
  items.forEach((it, i) => at.set(it.key, i));
  const out: Slot[] = [];
  let k = 0;
  for (const s of last.current) {
    const p = at.get(s.key);
    if (p !== undefined) {
      while (k <= p) { out.push({ ...items[k], leaving: false, since: 0 }); k++; }
    } else {
      const since = s.leaving ? s.since : now;
      if (now - since < EXIT_MS + 40) out.push({ ...s, leaving: true, since });
    }
  }
  while (k < items.length) { out.push({ ...items[k], leaving: false, since: 0 }); k++; }
  useLayoutEffect(() => { last.current = out; });
  const anyLeaving = out.some(s => s.leaving);
  useEffect(() => {
    if (!anyLeaving) return;
    const t = window.setTimeout(() => bump(n => n + 1), EXIT_MS + 60);
    return () => window.clearTimeout(t);
  });
  return out;
}

function restWidth(el: HTMLElement, w: number): () => void {
  return () => { if (el.dataset.on === '1' && el.dataset.w === String(w)) el.style.width = 'auto'; };
}

function setSlot(el: HTMLElement, show: boolean, animate: boolean, openDelay: number): void {
  const inner = el.firstElementChild as HTMLElement | null;
  if (!inner) return;
  const w = openWidth(inner);
  const was = el.dataset.on;
  const want = show ? '1' : '0';
  const lastW = Number(el.dataset.w || 0);
  el.dataset.txt = inner.textContent ?? '';
  if (was === want && (!show || w === lastW)) return;
  el.dataset.on = want;
  el.dataset.w = String(w);
  el.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (!animate || motionOff()) {
    takeOver(el, 'width'); takeOver(el, 'opacity');
    el.style.width = show ? 'auto' : '0px';
    el.style.opacity = show ? '1' : '0';
    return;
  }
  const restingAuto = el.style.width === 'auto' && el.getAnimations().length === 0;
  const fromW = was === undefined ? '0px' : restingAuto ? `${lastW}px` : takeOver(el, 'width');
  const fromO = was === undefined ? '0' : takeOver(el, 'opacity');
  if (was === want) {
    glide(el, 'width', `${w}px`, TAG_SIZE_MS, { from: fromW, done: restWidth(el, w) });
  } else if (show) {
    glide(el, 'width', `${w}px`, TAG_SIZE_MS, { from: fromW, delay: openDelay, done: restWidth(el, w) });
    glide(el, 'opacity', '1', TAG_FADE_MS, { from: fromO, delay: openDelay + TAG_SIZE_MS });
  } else {
    glide(el, 'opacity', '0', TAG_FADE_MS, { from: fromO });
    glide(el, 'width', '0px', TAG_SIZE_MS, { from: fromW, delay: TAG_FADE_MS });
  }
}

function applySlots(box: HTMLElement | null, slots: Slot[], shown: (s: Slot) => boolean, animate: boolean): void {
  if (!box) return;
  const els = new Map<string, HTMLElement>();
  box.querySelectorAll<HTMLElement>(':scope > [data-kslot]').forEach(el => els.set(el.dataset.kslot!, el));
  let closing = false;
  for (const s of slots) { const el = els.get(s.key); if (el && el.dataset.on === '1' && !shown(s)) closing = true; }
  const delay = closing ? TAG_FADE_MS : 0;
  for (const s of slots) { const el = els.get(s.key); if (el) setSlot(el, shown(s), animate, delay); }
}

const SlotEl: React.FC<{ k: string; side: 'l' | 'r'; children: React.ReactNode }> = ({ k, side, children }) => (
  <span data-kslot={k} className={side === 'l' ? 'k-tslot k-tslot-l' : 'k-tslot k-tslot-r'} style={{ width: 0, opacity: 0 }}>{children}</span>
);

export interface TagItem {
  key: string;
  text: string;
  optional?: boolean;
}

interface TagTitleProps {
  lead?: React.ReactNode;
  title: React.ReactNode;
  titleTip?: string;
  tags: TagItem[];
}

export const TagTitle: React.FC<TagTitleProps> = ({ lead, title, titleTip, tags }) => {
  const row = useRef<HTMLSpanElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const leadEl = useRef<HTMLSpanElement>(null);
  const drawn = useRef(false);
  const slots = usePresence(tags.map(t => ({ key: t.key, node: t.text, optional: t.optional })));
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const layout = (animate: boolean): boolean => {
    const box = row.current, nm = name.current;
    if (!box || !nm || box.clientWidth <= 0) return false;
    const list = slotsRef.current;
    const tagW = new Map<string, number>();
    box.querySelectorAll<HTMLElement>(':scope > [data-kslot]').forEach(el => {
      tagW.set(el.dataset.kslot!, openWidth(el.firstElementChild as HTMLElement | null));
    });
    const room = box.clientWidth;
    let used = Math.ceil(nm.scrollWidth) + openWidth(leadEl.current);
    const on = new Set<string>();
    for (const s of list) if (!s.leaving && !s.optional) { on.add(s.key); used += tagW.get(s.key) ?? 0; }
    let fits = true;
    for (const s of list) {
      if (s.leaving || !s.optional || !fits) continue;
      const w = tagW.get(s.key) ?? 0;
      if (used + w <= room + 0.5) { on.add(s.key); used += w; } else fits = false;
    }
    applySlots(box, list, s => on.has(s.key), animate);
    return true;
  };
  const relayout = () => { if (layout(drawn.current)) drawn.current = true; };

  useLayoutEffect(relayout);
  useEffect(() => {
    const box = row.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(relayout);
    ro.observe(box);
    let live = true;
    document.fonts?.ready.then(() => { if (live) relayout(); });
    return () => { live = false; ro.disconnect(); };
  }, []);

  return (
    <span ref={row} className="k-tagline">
      {lead != null && <span ref={leadEl} className="k-tagline-lead">{lead}</span>}
      <span ref={name} className="k-pick-title k-fade" data-tip={titleTip}>{title}</span>
      {slots.map(s => <SlotEl key={s.key} k={s.key} side="l"><span className="k-ttag">{s.node}</span></SlotEl>)}
    </span>
  );
};

export interface InlineItem { key: string; node: React.ReactNode }

export const InlineMotion: React.FC<{ items: InlineItem[]; side?: 'l' | 'r' }> = ({ items, side = 'r' }) => {
  const anchor = useRef<HTMLSpanElement>(null);
  const drawn = useRef(false);
  const slots = usePresence(items);
  const timer = useRef(0);
  const fadeEnds = useRef(0);
  useLayoutEffect(() => {
    const parent = anchor.current?.parentElement ?? null;
    if (!parent) return;
    if (!drawn.current || motionOff()) { applySlots(parent, slots, s => !s.leaving, false); drawn.current = true; return; }
    const els = new Map<string, HTMLElement>();
    parent.querySelectorAll<HTMLElement>(':scope > [data-kslot]').forEach(el => els.set(el.dataset.kslot!, el));
    window.clearTimeout(timer.current);
    const now = performance.now();
    for (const s of slots) {
      const el = els.get(s.key);
      if (!el) continue;
      if (s.leaving && el.dataset.on === '1') {
        el.dataset.on = 'f'; el.setAttribute('aria-hidden', 'true');
        glide(el, 'opacity', '0', TAG_FADE_MS);
        fadeEnds.current = Math.max(fadeEnds.current, now + TAG_FADE_MS);
      } else if (!s.leaving && el.dataset.on === 'f') {
        el.dataset.on = '1'; el.setAttribute('aria-hidden', 'false');
        glide(el, 'opacity', '1', TAG_FADE_MS);
      } else if (!s.leaving && el.dataset.on === '1') {
        const inner = el.firstElementChild as HTMLElement | null;
        if ((inner?.textContent ?? '') !== el.dataset.txt) setSlot(el, true, true, 0);
      }
    }
    const reflow = () => {
      const opening: HTMLElement[] = [];
      const moved = flowChange(parent, () => {
        for (const s of slots) {
          const el = els.get(s.key);
          if (!el || !el.isConnected) continue;
          if (s.leaving && el.dataset.on === 'f') { el.dataset.on = '0'; el.style.width = '0px'; }
          else if (!s.leaving && el.dataset.on !== '1' && el.dataset.on !== 'f') {
            el.dataset.on = '1'; el.dataset.w = String(openWidth(el.firstElementChild as HTMLElement | null));
            el.dataset.txt = el.firstElementChild?.textContent ?? '';
            el.setAttribute('aria-hidden', 'false');
            takeOver(el, 'opacity'); el.style.opacity = '0'; el.style.width = 'auto';
            opening.push(el);
          }
        }
      }, TAG_SIZE_MS);
      for (const el of opening) glide(el, 'opacity', '1', TAG_FADE_MS, { from: '0', delay: moved ? TAG_SIZE_MS : 0 });
    };
    const wait = fadeEnds.current - now;
    if (wait > 4) timer.current = window.setTimeout(reflow, wait); else reflow();
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <>
      <span ref={anchor} hidden />
      {slots.map(s => <SlotEl key={s.key} k={s.key} side={side}>{s.node}</SlotEl>)}
    </>
  );
};
