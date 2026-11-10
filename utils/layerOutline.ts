export const LAYER_OUTLINE_MAX_POINTS = 512;
export const LAYER_OUTLINE_MAX_REACH = 4;

export function layerOutlineOf(l: { outline?: [number, number][] } | null | undefined): [number, number][] | null {
  const o = l ? l.outline : undefined;
  return o !== undefined && o !== null && o.length >= 3 ? o : null;
}

export function traceLayerOutline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  o: readonly (readonly [number, number])[], x: number, y: number, r: number, angle: number,
): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  ctx.beginPath();
  for (let i = 0; i < o.length; i++) {
    const px = o[i][0] * r, py = o[i][1] * r;
    const X = x + px * c - py * s, Y = y + px * s + py * c;
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.closePath();
}

export function strokeFillLayerOutline(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  o: readonly (readonly [number, number])[], r: number, initAngle: number, copies: number,
  stroke: string, lineWidth: number, fill: string,
): void {
  ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.fillStyle = fill;
  const n = copies > 1 ? copies : 1;
  for (let c = 0; c < n; c++) { traceLayerOutline(ctx, o, 0, 0, r, initAngle + (Math.PI * 2 * c) / n); ctx.stroke(); ctx.fill(); }
  ctx.beginPath();
}

export function cleanLayerOutline(v: unknown): [number, number][] | undefined {
  if (!Array.isArray(v) || v.length < 3) return undefined;
  const out: [number, number][] = [];
  for (let i = 0; i < v.length && out.length < LAYER_OUTLINE_MAX_POINTS; i++) {
    const p = v[i];
    if (!Array.isArray(p) || p.length < 2) return undefined;
    const x = Number(p[0]), y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > LAYER_OUTLINE_MAX_REACH || Math.abs(y) > LAYER_OUTLINE_MAX_REACH) return undefined;
    out.push([Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
  }
  return out;
}
