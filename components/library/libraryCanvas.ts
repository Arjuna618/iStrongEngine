import { useEffect } from 'react';
import type React from 'react';
import { libraryGL, type LibFrame } from './libraryGL';
import { lendCanvas, holdsCanvas, returnCanvas, type CanvasHolder } from './canvasLend';
import type { FrameLoop } from './frameLoop';
import type { GridPassProvider } from './LibraryGrid';
import { rgb01 } from './libraryPictures';
import { updateAnimatedColors } from '../../game/ShapeRegistry';
import { cmBorderRgb, cmHex, CM, CM_USE } from '../../utils/colorMap';
import { borderBlendFor } from '../../utils/gameTheme';

export function useLibraryCanvas(opts: {
  bodyRef: React.RefObject<HTMLDivElement | null>;
  ready: boolean;
  loop: FrameLoop;
  devRef: React.MutableRefObject<number>;
  darkRef: React.MutableRefObject<boolean>;
  gridP: React.MutableRefObject<GridPassProvider | null>;
  panelP?: React.MutableRefObject<GridPassProvider | null>;
}): void {
  const { bodyRef, ready, loop, devRef, darkRef, gridP, panelP } = opts;
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !ready) return;
    loop.revive();
    const glr = libraryGL();
    if (!glr.available) return;
    body.appendChild(glr.canvas);
    const ink3 = [0, 0, 0];
    const frame: LibFrame = { w: 0, h: 0, dark: false, ink: ink3, blend: 0, veil: [1, 1, 1], passes: [
      { x: 0, y: 0, w: 0, h: 0, iconPx: 0, slots: [], count: 0 }, { x: 0, y: 0, w: 0, h: 0, iconPx: 0, slots: [], count: 0 },
    ], passCount: 2 };
    let lastW = 0, lastH = 0;
    let placed = '';
    const place = () => {
      const dev = devRef.current, cv = glr.canvas;
      if (!(dev > 0) || body.offsetWidth <= 0) return;
      const b = body.getBoundingClientRect();
      const k = b.width / body.offsetWidth, d = window.devicePixelRatio || 1;
      const x0 = (b.left + body.clientLeft * k) * d, y0 = (b.top + body.clientTop * k) * d;
      const tx = (Math.round(x0) - x0) / dev, ty = (Math.round(y0) - y0) / dev;
      const key = `${cv.width / dev}px|${cv.height / dev}px|translate(${tx}px, ${ty}px)`;
      if (key === placed) return;
      placed = key;
      cv.style.width = `${cv.width / dev}px`; cv.style.height = `${cv.height / dev}px`;
      cv.style.transform = `translate(${tx}px, ${ty}px)`;
    };
    const size = () => {
      const dev = devRef.current;
      const bw = Math.round(body.clientWidth * dev), bh = Math.round(body.clientHeight * dev);
      if (Math.abs(bw - lastW) > 4 || Math.abs(bh - lastH) > 4) { lastW = bw; lastH = bh; glr.setSize(bw, bh); }
      place();
    };
    size();
    const holder: CanvasHolder = { take: () => {
      body.appendChild(glr.canvas);
      lastW = 0; lastH = 0; placed = '';
      glr.onRestored = () => loop.request();
      size();
      loop.request();
    } };
    lendCanvas(holder);
    const ro = new ResizeObserver(() => { if (!holdsCanvas(holder)) return; size(); loop.request(); });
    ro.observe(body);
    const scrim = body.closest('.modal-scrim');
    const settle = (ev: Event) => { const t = ev.target; if (holdsCanvas(holder) && t instanceof Element && t.contains(body)) place(); };
    scrim?.addEventListener('animationend', settle);
    scrim?.addEventListener('transitionend', settle);
    loop.draw = () => {
      if (!holdsCanvas(holder)) return false;
      size();
      const dk = darkRef.current;
      updateAnimatedColors(-1 - loop.frames);
      const dev = devRef.current;
      const until = performance.now() + 4;
      let more = false;
      const g = frame.passes[0], p = frame.passes[1];
      g.count = 0; p.count = 0;
      if (gridP.current && gridP.current.fill(g, dev, until, dk)) more = true;
      if (panelP?.current && panelP.current.fill(p, dev, until, dk)) more = true;
      const ink = cmBorderRgb(dk);
      frame.w = glr.canvas.width; frame.h = glr.canvas.height; frame.dark = dk;
      ink3[0] = ink[0] / 255; ink3[1] = ink[1] / 255; ink3[2] = ink[2] / 255;
      frame.blend = borderBlendFor(dk);
      frame.veil = rgb01(cmHex(CM.BACKGROUND, dk, CM_USE.GENERAL));
      glr.draw(frame);
      return more || glr.animatedShown;
    };
    glr.onRestored = () => loop.request();
    loop.request();
    return () => {
      ro.disconnect();
      scrim?.removeEventListener('animationend', settle);
      scrim?.removeEventListener('transitionend', settle);
      loop.dispose();
      if (!returnCanvas(holder)) return;
      glr.onRestored = null;
      glr.release();
      glr.canvas.remove();
      const s = glr.canvas.style; s.width = '100%'; s.height = '100%'; s.transform = '';
    };
  }, [loop, ready]);
}
