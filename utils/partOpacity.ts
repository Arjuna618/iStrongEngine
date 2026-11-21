export function partOpacityOf(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 1;
}

export function designHasSeeThroughPart(
  bodyOpacity: number | undefined,
  layers: readonly { opacity?: number }[] | null | undefined,
  turrets: readonly { opacity?: number; look?: { alpha?: number }; autoSubTurrets?: readonly { opacity?: number; look?: { alpha?: number } }[] }[] | null | undefined,
): boolean {
  if (partOpacityOf(bodyOpacity) < 1) return true;
  if (layers) for (let i = 0; i < layers.length; i++) if (partOpacityOf(layers[i].opacity) < 1) return true;
  if (turrets) for (let i = 0; i < turrets.length; i++) {
    const t = turrets[i];
    if (partOpacityOf(t.opacity) < 1 || lookSeeThrough(t.look)) return true;
    const s = t.autoSubTurrets;
    if (s) for (let k = 0; k < s.length; k++) if (partOpacityOf(s[k].opacity) < 1 || lookSeeThrough(s[k].look)) return true;
  }
  return false;
}

function lookSeeThrough(look: { alpha?: number } | undefined): boolean {
  if (look === undefined) return false;
  const a = look.alpha;
  return a !== undefined && a < 1;
}

export class PartScratch {
  private readonly cv: (OffscreenCanvas | null)[] = [null, null, null];
  private readonly cx: (OffscreenCanvasRenderingContext2D | null)[] = [null, null, null];
  private readonly w = [0, 0, 0];
  private readonly h = [0, 0, 0];
  private depth = 0;
  begin(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
    const d = this.depth < 3 ? this.depth : 2;
    this.depth++;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    let c = this.cv[d], x = this.cx[d];
    if (c === null || x === null || c.width < w || c.height < h) {
      c = new OffscreenCanvas(Math.max(1, w, c !== null ? c.width : 0), Math.max(1, h, c !== null ? c.height : 0));
      x = c.getContext('2d'); this.cv[d] = c; this.cx[d] = x;
    }
    this.w[d] = w; this.h[d] = h;
    const g = x!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(ctx.getTransform());
    g.lineJoin = ctx.lineJoin; g.lineCap = ctx.lineCap;
    return g as unknown as CanvasRenderingContext2D;
  }
  paste(ctx: CanvasRenderingContext2D, sc: CanvasRenderingContext2D, op: number): void {
    this.depth--;
    const d = this.depth < 3 ? this.depth : 2;
    const w = this.w[d], h = this.h[d];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha *= op > 0 ? op : 0;
    ctx.drawImage((sc as unknown as OffscreenCanvasRenderingContext2D).canvas, 0, 0, w, h, 0, 0, w, h);
    ctx.restore();
  }
}
