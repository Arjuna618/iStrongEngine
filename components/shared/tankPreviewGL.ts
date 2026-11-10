import { LibraryGL, type LibFrame, type LibPass, type LibSlot } from '../library/libraryGL';
import { rgb01, type LibPicture } from '../library/libraryPictures';
import { ctIconParts, CT_PART_STRIDE } from '../../utils/classTreeIcon';
import { cmBorderRgb, cmHex, CM, CM_USE } from '../../utils/colorMap';
import { borderBlendFor, gameDark } from '../../utils/gameTheme';
import type { TankConfig } from '../../types';

export interface PreviewItem {
  out: ImageBitmapRenderingContext;
  pic: LibPicture | null;
  w: number; h: number; iconPx: number;
  angle: number; spinning: boolean;
  need: boolean;
  drawnAngle: number;
}

const SPIN_PER_MS = 0.01 * 60 / 1000;

const PREVIEW_SPIN_EVERY_FRAME: boolean = typeof location !== 'undefined' && /[?&]oldpreviewspin(?:[=&]|$)/.test(location.search);
const PREVIEW_STEP_PX = 0.25;
const PREVIEW_RADIUS = 0.5 + 3 / 80;

let _r: LibraryGL<OffscreenCanvas> | null = null;
let _tried = false;
function renderer(): LibraryGL<OffscreenCanvas> | null {
  if (_tried) return _r && _r.ready ? _r : null;
  _tried = true;
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof ImageBitmapRenderingContext === 'undefined') return null;
    const oc = new OffscreenCanvas(1, 1);
    if (typeof oc.transferToImageBitmap !== 'function') return null;
    const r = new LibraryGL<OffscreenCanvas>(oc);
    if (!r.available) return null;
    r.onRestored = () => { items.forEach(it => { it.need = true; }); wake(); };
    _r = r;
  } catch (err) {
    console.error('[TankPreview] the graphics card renderer could not start', err);
    _r = null;
  }
  return _r && _r.ready ? _r : null;
}

export function previewGLAvailable(): boolean { return renderer() !== null; }

export function prewarmPreviewGL(): void {
  if (_tried || typeof window === 'undefined') return;
  const go = () => { renderer(); };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(go, { timeout: 4000 }); else window.setTimeout(go, 1500);
}

export function previewPicture(config: TankConfig, dark: boolean, colorOverride: string | undefined, layerTeam?: string): LibPicture | null {
  const out: number[] = [];
  try { ctIconParts(config, dark, colorOverride || undefined, out, layerTeam || undefined); }
  catch (err) { console.error('[TankPreview] picture', err); return null; }
  if (out.length < CT_PART_STRIDE) return null;
  return { parts: Float32Array.from(out), anim: '', alpha: 1, veilMesh: -1, veilScale: 0, veilRot: 0 };
}

const items = new Set<PreviewItem>();
let raf = 0;
let last = 0;
const slot: LibSlot = { pic: null as unknown as LibPicture, x: 0, y: 0, fade: 0, turn: 0 };
const pass: LibPass = { x: 0, y: 0, w: 0, h: 0, iconPx: 0, slots: [slot], count: 1 };
const ink3 = [0, 0, 0];
const frame: LibFrame = { w: 0, h: 0, dark: false, ink: ink3, blend: 0, veil: [1, 1, 1], passes: [pass], passCount: 1 };

function drawItem(r: LibraryGL<OffscreenCanvas>, it: PreviewItem, dark: boolean): void {
  if (!it.pic || it.w <= 0 || it.h <= 0) return;
  r.setSize(it.w, it.h);
  const ink = cmBorderRgb(dark);
  ink3[0] = ink[0] / 255; ink3[1] = ink[1] / 255; ink3[2] = ink[2] / 255;
  frame.w = it.w; frame.h = it.h; frame.dark = dark;
  frame.blend = borderBlendFor(dark);
  frame.veil = rgb01(cmHex(CM.BACKGROUND, dark, CM_USE.GENERAL));
  pass.w = it.w; pass.h = it.h; pass.iconPx = it.iconPx;
  slot.pic = it.pic; slot.x = it.w / 2; slot.y = it.h / 2; slot.turn = it.angle;
  r.draw(frame);
  it.out.transferFromImageBitmap(r.canvas.transferToImageBitmap());
  it.drawnAngle = it.angle;
}

const tick = (ts: number): void => {
  raf = 0;
  const r = renderer();
  if (!r) return;
  const dt = last > 0 ? Math.min(50, Math.max(0, ts - last)) : 1000 / 60;
  last = ts;
  const dark = gameDark();
  let more = false;
  items.forEach(it => {
    if (it.spinning) {
      it.angle += SPIN_PER_MS * dt;
      if (PREVIEW_SPIN_EVERY_FRAME || !(Math.abs(it.angle - it.drawnAngle) * it.iconPx * PREVIEW_RADIUS < PREVIEW_STEP_PX)) it.need = true;
      more = true;
    }
    if (it.need) { it.need = false; drawItem(r, it, dark); }
  });
  if (more) raf = requestAnimationFrame(tick);
  else last = 0;
};

export function wake(): void {
  if (raf === 0 && items.size > 0) raf = requestAnimationFrame(tick);
}

export function addPreview(it: PreviewItem): () => void {
  items.add(it);
  wake();
  return () => {
    items.delete(it);
    if (items.size === 0) {
      if (raf !== 0) { cancelAnimationFrame(raf); raf = 0; }
      last = 0;
      _r?.release();
    }
  };
}
