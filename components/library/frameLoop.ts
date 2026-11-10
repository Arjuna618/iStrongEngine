export type FrameTicker = (dtMs: number, nowMs: number) => boolean;

export class FrameLoop {
  private raf = 0;
  private alive = true;
  private last = 0;
  private readonly tickers: FrameTicker[] = [];
  draw: (() => boolean) | null = null;
  frames = 0;

  add(t: FrameTicker): () => void {
    this.tickers.push(t);
    return () => { const i = this.tickers.indexOf(t); if (i >= 0) this.tickers.splice(i, 1); };
  }

  request(): void {
    if (!this.alive || this.raf !== 0) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (ts: number): void => {
    this.raf = 0;
    if (!this.alive) return;
    const dt = this.last > 0 ? Math.min(100, Math.max(0, ts - this.last)) : 16.7;
    this.last = ts;
    this.frames++;
    let more = false;
    for (let i = 0; i < this.tickers.length; i++) if (this.tickers[i](dt, ts)) more = true;
    if (this.draw && this.draw()) more = true;
    if (more) this.request();
    else this.last = 0;
  };

  revive(): void {
    this.alive = true;
    this.last = 0;
  }

  dispose(): void {
    this.alive = false;
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.tickers.length = 0;
    this.draw = null;
  }
}
