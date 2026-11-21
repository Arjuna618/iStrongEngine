import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { uiThemeId, subscribeUiTheme } from '../../utils/uiTheme';
import { GlideSvg, glideBoxKey, glideBoxOf, glideTo, type GlideBox } from './glideFrame';

const classicNow = () => uiThemeId() === 'classic';

export const TabSlide: React.FC<{ pick: string }> = ({ pick }) => {
  const ref = useRef<SVGSVGElement>(null);
  const classic = useSyncExternalStore(subscribeUiTheme, classicNow, classicNow);
  useLayoutEffect(() => {
    const box = ref.current;
    const row = box?.parentElement;
    if (!classic || !box || !row) return;
    let shown = false, at: GlideBox | null = null;
    const same = (a: GlideBox, b: GlideBox) => Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
    const place = () => {
      const t = row.querySelector<HTMLElement>(pick);
      if (!t || t.offsetParent !== row) {
        if (shown) { box.style.opacity = '0'; shown = false; }
        return;
      }
      const now = glideBoxOf(box, t);
      if (shown && at !== null && same(now, at)) return;
      at = now;
      glideTo(box, t, shown ? 'current' : 'instant');
      box.style.opacity = '1';
      shown = true;
    };
    place();
    const mo = new MutationObserver(recs => { for (let i = 0; i < recs.length; i++) if (!box.contains(recs[i].target)) { place(); return; } });
    mo.observe(row, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-pressed', 'aria-checked'] });
    const ro = new ResizeObserver(place);
    ro.observe(row);
    return () => { mo.disconnect(); ro.disconnect(); };
  }, [classic, pick]);
  return classic ? <GlideSvg ref={ref} className="k-tab-slide" /> : null;
};

export const PickGlide: React.FC<{ pick: string; group?: string; look?: 'tool' | 'row' }> = ({ pick, group, look = 'tool' }) => {
  const ref = useRef<SVGSVGElement>(null);
  const classic = useSyncExternalStore(subscribeUiTheme, classicNow, classicNow);
  useLayoutEffect(() => {
    const box = ref.current;
    const row = box?.parentElement;
    if (!classic || !box || !row) return;
    const picked = (): HTMLElement[] => (Array.prototype.slice.call(row.querySelectorAll<HTMLElement>(pick)) as HTMLElement[]).filter(el => el.getClientRects().length > 0);
    let last = picked();
    let gliding = false;
    let dest: HTMLElement | null = null;
    const stop = () => {
      gliding = false;
      if (dest) {
        const d = dest, was = d.style.transition;
        d.style.transition = 'none';
        d.classList.remove('k-glide-to');
        void d.offsetWidth;
        d.style.transition = was;
        dest = null;
      }
      box.style.opacity = '0';
    };
    const mo = new MutationObserver(() => {
      const now = picked();
      const was = last;
      last = now;
      if (now.length === was.length && now.every((e, i) => e === was[i])) return;
      const added = now.filter(e => was.indexOf(e) < 0);
      const gone = was.filter(e => now.indexOf(e) < 0 && row.contains(e));
      if (dest && gone.indexOf(dest) >= 0 && added.length === 0) { stop(); return; }
      if (added.length !== 1 || gone.length === 0) return;
      const to = added[0];
      const tr = glideBoxOf(box, to);
      let src: HTMLElement | null = null, best = Infinity;
      for (const g of gone) {
        if (group && g.getAttribute(group) !== to.getAttribute(group)) continue;
        const r = glideBoxOf(box, g);
        const d = Math.hypot(r.left + r.width / 2 - (tr.left + tr.width / 2), r.top + r.height / 2 - (tr.top + tr.height / 2));
        if (d < best) { best = d; src = g; }
      }
      if (!src) { stop(); return; }
      const onward = gliding && dest !== null && gone.indexOf(dest) >= 0;
      const from = onward ? 'current' as const : glideBoxOf(box, src);
      for (const g of gone) { const was = g.style.transition; g.style.transition = 'none'; void g.offsetWidth; g.style.transition = was; }
      stop();
      box.style.opacity = '1';
      dest = to;
      to.classList.add('k-glide-to');
      gliding = true;
      let again = 2, aim = tr;
      const arrive = () => {
        if (dest !== to) return;
        if (again-- > 0 && glideBoxKey(glideBoxOf(box, to)) !== glideBoxKey(aim)) { aim = glideTo(box, to, 'current', arrive); return; }
        stop();
      };
      aim = glideTo(box, to, from, arrive);
    });
    mo.observe(row, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-expanded', 'aria-selected', 'aria-current'] });
    return () => { mo.disconnect(); stop(); };
  }, [classic, pick, group]);
  return classic ? <GlideSvg ref={ref} className={look === 'row' ? 'k-pick-glide k-pick-glide-row' : 'k-pick-glide'} /> : null;
};
