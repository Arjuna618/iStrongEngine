import type { WebGLBulletRenderer } from '../game/WebGLRenderer';
import { tagAtlasReady, tagFontEpoch } from './nameTagGL';
import { tagFontCss } from '../utils/nameTagArras';
import { htLayout, htKeepAlive, htReset, HT_STRIDE } from '../utils/hudTextGlyphs';
import type { HtFrame, HtSink } from '../utils/hudTextGlyphs';

export const HUD_TEXT_GPU: boolean = !(typeof location !== 'undefined' && /[?&]oldhudtext(?:[=&]|$)/.test(location.search));

const HT_SETTLE_MS = 200;
const HT_BUDGET_SHARE = 0.08;
const HT_BUDGET_MIN_MS = 0.3;
const HT_BUDGET_MAX_MS = 1.5;
const HT_JOIN_TOL = 3;
const HT_KEEP_MAX_W = 1024;
const HT_KEEP_MAX_H = 512;

let _cv: OffscreenCanvas | null = null;
let _c: OffscreenCanvasRenderingContext2D | null = null;
let _px = -1;

function _state(c: OffscreenCanvasRenderingContext2D): void {
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineCap = 'round';
  _px = -1;
}

function scratch(needW: number, needH: number): OffscreenCanvasRenderingContext2D | null {
  if (_cv === null) {
    if (typeof OffscreenCanvas === 'undefined') return null;
    _cv = new OffscreenCanvas(256, 128);
    _c = _cv.getContext('2d', { alpha: true, willReadFrequently: true });
    if (_c === null) { _cv = null; return null; }
    _state(_c);
  }
  const c = _c!;
  if (needW > _cv.width || needH > _cv.height) {
    let w = _cv.width, h = _cv.height;
    while (w < needW) w *= 2;
    while (h < needH) h *= 2;
    _cv.width = w;
    _cv.height = h;
    _state(c);
  }
  return c;
}

function _font(c: OffscreenCanvasRenderingContext2D, px: number): void {
  if (px !== _px) { _px = px; c.font = tagFontCss(px); }
}

let _gl: WebGLBulletRenderer | null = null;

const _sink: HtSink = {
  clock(): number { return performance.now(); },
  measure(text: string, fontPx: number, out: Float64Array): void {
    const c = scratch(0, 0);
    if (c === null) { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = fontPx; out[4] = fontPx; return; }
    _font(c, fontPx);
    c.textAlign = 'left';
    const tm = c.measureText(text);
    out[0] = tm.width;
    out[1] = tm.actualBoundingBoxLeft;
    out[2] = tm.actualBoundingBoxRight;
    const a = tm.fontBoundingBoxAscent, d = tm.fontBoundingBoxDescent;
    out[3] = typeof a === 'number' && a === a ? a : fontPx;
    out[4] = typeof d === 'number' && d === d ? d : fontPx;
  },
  joined(a: string, b: string, fontPx: number, bx: number, w: number): boolean {
    const pad = Math.ceil(fontPx * 0.5) + 2;
    const W = Math.ceil(w) + 2 * pad;
    const H = 2 * (Math.ceil(fontPx) + 2);
    const c = scratch(W, 2 * H);
    if (c === null) return false;
    c.clearRect(0, 0, W, 2 * H);
    _font(c, fontPx);
    c.textAlign = 'left';
    c.fillStyle = '#ffffff';
    const mid = H / 2;
    c.fillText(a + b, pad, mid);
    c.fillText(a, pad, H + mid);
    c.fillText(b, pad + bx, H + mid);
    const d = c.getImageData(0, 0, W, 2 * H).data;
    const half = W * H * 4;
    for (let i = 3; i < half; i += 4) {
      const e = d[i] - d[i + half];
      if (e > HT_JOIN_TOL || e < -HT_JOIN_TOL) return true;
    }
    return false;
  },
  glyph(text: string, fontPx: number, lwPx: number, fill: string, outline: string,
        ox: number, oy: number, bw: number, bh: number, x: number, y: number): void {
    const c = scratch(2 * bw, bh);
    if (c === null || _gl === null) return;
    c.clearRect(0, 0, 2 * bw, bh);
    _font(c, fontPx);
    c.textAlign = 'left';
    c.lineWidth = lwPx;
    c.strokeStyle = outline;
    c.fillStyle = fill;
    c.strokeText(text, ox, oy);
    c.fillText(text, bw + ox, oy);
    _gl.uploadTagPixels(x, y, c.getImageData(0, 0, 2 * bw, bh));
  },
  mark(text: string, fontPx: number, lwPx: number, outline: string, c0: string, c1: string, span: number,
       ax: number, oy: number, bw: number, bh: number, x: number, y: number): void {
    const c = scratch(bw, bh);
    if (c === null || _gl === null) return;
    c.clearRect(0, 0, bw, bh);
    _font(c, fontPx);
    c.textAlign = 'right';
    c.lineWidth = lwPx;
    c.strokeStyle = outline;
    const g = c.createLinearGradient(ax - span, 0, ax, 0);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    c.strokeText(text, ax, oy);
    c.fillStyle = g;
    c.fillText(text, ax, oy);
    _gl.uploadTagPixels(x, y, c.getImageData(0, 0, bw, bh));
  },
};

const HT_KEEP_ELEMENT: boolean = !(typeof location !== 'undefined' && /[?&]oldkeepcanvas(?:[=&]|$)/.test(location.search));
let _keep: HTMLCanvasElement | OffscreenCanvas | null = null;
let _kc: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
let _keepOk = false;
const _rect = { x: 0, y: 0, w: 0, h: 0 };
const _kept = { x: 0, y: 0, w: 0, h: 0 };

function keepCtx(w: number, h: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  if (w > HT_KEEP_MAX_W || h > HT_KEEP_MAX_H) return null;
  if (_keep === null) {
    if (HT_KEEP_ELEMENT && typeof document !== 'undefined') {
      const el = document.createElement('canvas');
      el.width = 256;
      el.height = 64;
      _keep = el;
      _kc = el.getContext('2d', { alpha: true });
    } else {
      if (typeof OffscreenCanvas === 'undefined') return null;
      const oc = new OffscreenCanvas(256, 64);
      _keep = oc;
      _kc = oc.getContext('2d', { alpha: true });
    }
    if (_kc === null) { _keep = null; return null; }
  }
  if (w > _keep.width || h > _keep.height) {
    let cw = _keep.width, ch = _keep.height;
    while (cw < w) cw *= 2;
    while (ch < h) ch *= 2;
    _keep.width = cw;
    _keep.height = ch;
  }
  return _kc;
}

let _pRows = -1;
const _pText: string[] = [];
const _pFill: string[] = [];
let _pCanvasRow = new Uint8Array(64);
let _pMarkOnCanvas = true;
let _pPending = 1;
let _pResets = -1;
let _pAnchorX = 0, _pFirstMid = 0, _pPitch = 0, _pF10 = 0, _pL10 = 0, _pOutline = '';
let _pMark = '', _pMarkMid = 0, _pMarkF10 = 0, _pMarkL10 = 0, _pMarkSpan = 0, _pC0 = '', _pC1 = '';
let _pClipTop = 0, _pClipH = 0, _pW = 0, _pH = 0;

function sameInputs(fr: HtFrame, clipTop: number, clipH: number, width: number, height: number): boolean {
  if (fr.rows !== _pRows || fr.anchorX !== _pAnchorX || fr.firstMid !== _pFirstMid || fr.pitch !== _pPitch
      || fr.f10 !== _pF10 || fr.l10 !== _pL10 || fr.outline !== _pOutline || fr.mark !== _pMark
      || fr.markMid !== _pMarkMid || fr.markF10 !== _pMarkF10 || fr.markL10 !== _pMarkL10
      || fr.markSpan !== _pMarkSpan || fr.markC0 !== _pC0 || fr.markC1 !== _pC1
      || clipTop !== _pClipTop || clipH !== _pClipH || width !== _pW || height !== _pH) return false;
  for (let r = 0; r < fr.rows; r++) {
    if (fr.text[r] !== _pText[r] || fr.fill[r] !== _pFill[r]) return false;
  }
  return true;
}

function storeInputs(fr: HtFrame, clipTop: number, clipH: number, width: number, height: number, resets: number): void {
  _pRows = fr.rows; _pAnchorX = fr.anchorX; _pFirstMid = fr.firstMid; _pPitch = fr.pitch;
  _pF10 = fr.f10; _pL10 = fr.l10; _pOutline = fr.outline; _pMark = fr.mark; _pMarkMid = fr.markMid;
  _pMarkF10 = fr.markF10; _pMarkL10 = fr.markL10; _pMarkSpan = fr.markSpan; _pC0 = fr.markC0; _pC1 = fr.markC1;
  _pClipTop = clipTop; _pClipH = clipH; _pW = width; _pH = height;
  if (_pCanvasRow.length < fr.rows) _pCanvasRow = new Uint8Array(fr.rows * 2);
  for (let r = 0; r < fr.rows; r++) {
    _pText[r] = fr.text[r];
    _pFill[r] = fr.fill[r];
    _pCanvasRow[r] = fr.canvasRow[r];
  }
  _pMarkOnCanvas = fr.markOnCanvas;
  _pPending = fr.pending;
  _pResets = resets;
}

let _scaleKey = -1;
let _since = 0;
let _epochSeen = -1;

export function hudTextDraw(
  webgl: WebGLBulletRenderer, ctx: CanvasRenderingContext2D, fr: HtFrame,
  width: number, height: number, clipTop: number, clipH: number, scaleKey: number, dtMs: number,
  camX: number, camY: number, zoom: number,
): boolean {
  if (!HUD_TEXT_GPU || webgl.tagInstanceStride() !== HT_STRIDE) return false;
  const atlas = tagAtlasReady(webgl);
  if (atlas === null || scratch(0, 0) === null) return false;
  const now = performance.now();

  const ep = tagFontEpoch();
  if (ep !== _epochSeen) {
    _epochSeen = ep;
    htReset();
    _keepOk = false;
    _pRows = -1;
  }
  if (scaleKey !== _scaleKey) {
    _since = _scaleKey < 0 ? now - HT_SETTLE_MS : now;
    _scaleKey = scaleKey;
  }
  if (now - _since < HT_SETTLE_MS) {
    _keepOk = false;
    _pRows = -1;
    return false;
  }

  const same = _pPending === 0 && atlas.resets === _pResets && sameInputs(fr, clipTop, clipH, width, height);
  if (same && _keepOk) {
    htKeepAlive(atlas, now);
    for (let r = 0; r < fr.rows; r++) fr.canvasRow[r] = _pCanvasRow[r];
    fr.markOnCanvas = _pMarkOnCanvas;
    fr.pending = 0;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(0, clipTop, width, clipH);
    ctx.clip();
    ctx.drawImage(_keep!, 0, 0, _kept.w, _kept.h, _kept.x, _kept.y, _kept.w, _kept.h);
    ctx.restore();
    return true;
  }

  _gl = webgl;
  const share = dtMs * HT_BUDGET_SHARE;
  atlas.beginFrame(share < HT_BUDGET_MIN_MS ? HT_BUDGET_MIN_MS : share > HT_BUDGET_MAX_MS ? HT_BUDGET_MAX_MS : share);
  const count = htLayout(fr, atlas, _sink, now, webgl.tagInstanceData(), webgl.tagInstanceRoom());
  storeInputs(fr, clipTop, clipH, width, height, atlas.resets);
  _keepOk = false;
  if (count === 0) return true;

  const prevScale = webgl.getRenderScale();
  webgl.setRenderScale(1);
  webgl.setCamera(width / 2, height / 2, 1, width, height);
  webgl.beginFrame();
  webgl.commitTagInstances(count, fr.minX, fr.minY, fr.maxX, fr.maxY);
  webgl.setSampleAlphaToCoverage(false);
  webgl.setDepthMask(false);
  webgl.flushTags();
  webgl.setDepthMask(true);
  webgl.setSampleAlphaToCoverage(true);

  const src = webgl.getCanvas();
  const cropped = webgl.getDirtyRectPx(_rect);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.rect(0, clipTop, width, clipH);
  ctx.clip();
  const kc = same && cropped ? keepCtx(_rect.w, _rect.h) : null;
  if (kc !== null) {
    kc.clearRect(0, 0, _keep!.width, _keep!.height);
    kc.drawImage(src, _rect.x, _rect.y, _rect.w, _rect.h, 0, 0, _rect.w, _rect.h);
    _kept.x = _rect.x; _kept.y = _rect.y; _kept.w = _rect.w; _kept.h = _rect.h;
    _keepOk = true;
    ctx.drawImage(_keep!, 0, 0, _kept.w, _kept.h, _kept.x, _kept.y, _kept.w, _kept.h);
  } else if (cropped) {
    ctx.drawImage(src, _rect.x, _rect.y, _rect.w, _rect.h, _rect.x, _rect.y, _rect.w, _rect.h);
  } else {
    ctx.drawImage(src, 0, 0);
  }
  ctx.restore();

  webgl.setCamera(camX, camY, zoom, width, height);
  webgl.setRenderScale(prevScale);
  return true;
}
