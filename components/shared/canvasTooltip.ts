import { getEffectiveDPR } from '../../utils/zoomCompensation';

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
  const font = `${12 * s}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
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
