import { getEffectiveDPR } from '../../utils/zoomCompensation';
import { uiThemeId } from '../../utils/uiTheme';
import { CM, CM_USE, cmHex } from '../../utils/colorMap';

const _classicInk: { dark: boolean | null; pill: string; ink: string; words: string } = { dark: null, pill: '', ink: '', words: '' };
function drawClassicTip(ctx: CanvasRenderingContext2D, text: string, anchorX: number, anchorY: number, maxRight: number, s: number, isDark: boolean, minLeft: number): void {
  if (_classicInk.dark !== isDark) {
    const G = CM_USE.GENERAL, ink = cmHex(CM.BORDERS, isDark, G);
    const n = parseInt(ink.slice(1), 16);
    _classicInk.dark = isDark; _classicInk.ink = ink; _classicInk.words = cmHex(CM.TEXT, isDark, G);
    _classicInk.pill = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.5)`;
  }
  const size = 15 * s;
  ctx.save();
  ctx.font = `700 ${size}px Ubuntu, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const th = 20 * s, tw = ctx.measureText(text).width + 20 * s, gap = 6 * s, margin = 8 * s;
  let tx = anchorX - tw / 2;
  if (tx + tw > maxRight - margin) tx = maxRight - margin - tw;
  if (tx < minLeft + margin) tx = minLeft + margin;
  const canvasH = ctx.canvas.height;
  let ty = anchorY - th - gap;
  if (ty < margin) ty = anchorY + gap;
  if (ty + th > canvasH - margin) ty = canvasH - margin - th;
  if (ty < margin) ty = margin;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, th / 2);
  ctx.fillStyle = _classicInk.pill;
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.2 * size;
  ctx.strokeStyle = _classicInk.ink;
  ctx.fillStyle = _classicInk.words;
  ctx.strokeText(text, tx + tw / 2, ty + th / 2);
  ctx.fillText(text, tx + tw / 2, ty + th / 2);
  ctx.restore();
}

export function drawCanvasTooltip(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  anchorY: number,
  maxRight: number,
  chromeScale: number,
  isDark: boolean,
  minLeft: number = 0,
) {
  const dpr = getEffectiveDPR();
  const s = dpr * chromeScale;
  if (uiThemeId() === 'classic') { drawClassicTip(ctx, text, anchorX, anchorY, maxRight, s, isDark, minLeft); return; }
  const font =`${12 * s}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.save();
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const padH = 12 * s;
  const padV = 6 * s;
  const tw = metrics.width + padH * 2;
  const th = 16 * s + padV * 2;
  const gap = 6 * s;
  const margin = 8 * s;
  let tx = anchorX - tw / 2;
  if (tx + tw > maxRight - margin) tx = maxRight - margin - tw;
  if (tx < minLeft + margin) tx = minLeft + margin;

  const canvasH = ctx.canvas.height;
  let ty = anchorY - th - gap;
  let above = true;
  if (ty < margin) { ty = anchorY + gap; above = false; }
  if (ty + th > canvasH - margin) ty = canvasH - margin - th;
  if (ty < margin) ty = margin;
  const r = 6 * s;

  const ax = Math.max(tx + 10 * s, Math.min(tx + tw - 10 * s, anchorX));
  const edgeY = above ? ty + th : ty;
  const nextToAnchor = above ? Math.abs(anchorY - gap - edgeY) < 1 : Math.abs(anchorY + gap - edgeY) < 1;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, r);
  if (nextToAnchor) {
    ctx.save();
    ctx.translate(ax, edgeY + (above ? -1 : 1) * s);
    ctx.rotate(Math.PI / 4);
    ctx.roundRect(-5 * s, -5 * s, 10 * s, 10 * s, 2 * s);
    ctx.restore();
  }
  ctx.strokeStyle = '#39393a';
  ctx.lineWidth = 2 * s;
  ctx.stroke();
  ctx.fillStyle = '#242425';
  ctx.fill();

  ctx.fillStyle = isDark ? '#f0f0f1' : '#fcfcfd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tx + tw / 2, ty + th / 2);

  ctx.restore();
}
