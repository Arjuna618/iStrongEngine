export const BOX_GRID = { AREA_MIN: 8, DARK_MIN: 8 };

export class BoxGrid {
  out: Int32Array = new Int32Array(0);
  n = 0;
  private gx0 = 0; private gy0 = 0; private inv = 1; private w = 0; private h = 0;
  private start: Int32Array = new Int32Array(1);
  private items: Int32Array = new Int32Array(0);
  private stamp: Int32Array = new Int32Array(0);
  private tick = 0;
  count = 0;

  build(count: number, boxOf: (i: number, b: Float64Array) => void, cellsAcross = 48): void {
    this.count = count;
    this.out = new Int32Array(Math.max(1, count));
    this.stamp = new Int32Array(Math.max(1, count));
    this.tick = 0;
    this.n = 0;
    if (count === 0) { this.w = 0; this.h = 0; this.start = new Int32Array(1); this.items = new Int32Array(0); return; }
    const B = new Float64Array(count * 4), b = new Float64Array(4);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < count; i++) {
      b[0] = 0; b[1] = 0; b[2] = -1; b[3] = -1;
      boxOf(i, b);
      B[i * 4] = b[0]; B[i * 4 + 1] = b[1]; B[i * 4 + 2] = b[2]; B[i * 4 + 3] = b[3];
      if (!(b[2] >= b[0] && b[3] >= b[1])) continue;
      if (b[0] < x0) x0 = b[0]; if (b[1] < y0) y0 = b[1]; if (b[2] > x1) x1 = b[2]; if (b[3] > y1) y1 = b[3];
    }
    if (!(x1 >= x0)) { this.w = 0; this.h = 0; this.start = new Int32Array(1); this.items = new Int32Array(0); return; }
    const span = Math.max(x1 - x0, y1 - y0, 1e-6);
    const cell = span / Math.max(1, cellsAcross);
    this.gx0 = x0; this.gy0 = y0; this.inv = 1 / cell;
    this.w = Math.max(1, Math.min(cellsAcross, Math.floor((x1 - x0) * this.inv) + 1));
    this.h = Math.max(1, Math.min(cellsAcross, Math.floor((y1 - y0) * this.inv) + 1));
    const cells = this.w * this.h;
    const cnt = new Int32Array(cells + 1);
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) {
        let s = 0;
        for (let c = 0; c < cells; c++) { const k = cnt[c]; cnt[c] = s; s += k; }
        cnt[cells] = s;
        this.start = cnt.slice();
        this.items = new Int32Array(s);
      }
      for (let i = 0; i < count; i++) {
        const bx0 = B[i * 4], by0 = B[i * 4 + 1], bx1 = B[i * 4 + 2], by1 = B[i * 4 + 3];
        if (!(bx1 >= bx0 && by1 >= by0)) continue;
        const cx0 = this.cx(bx0), cx1 = this.cx(bx1), cy0 = this.cy(by0), cy1 = this.cy(by1);
        for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
          const c = cx * this.h + cy;
          if (pass === 0) cnt[c]++;
          else this.items[cnt[c]++] = i;
        }
      }
    }
  }
  private cx(x: number): number { const c = Math.floor((x - this.gx0) * this.inv); return c < 0 ? 0 : c >= this.w ? this.w - 1 : c; }
  private cy(y: number): number { const c = Math.floor((y - this.gy0) * this.inv); return c < 0 ? 0 : c >= this.h ? this.h - 1 : c; }

  query(x0: number, y0: number, x1: number, y1: number): number {
    this.n = 0;
    if (this.w === 0) return 0;
    if (++this.tick === 0x7fffffff) { this.stamp.fill(0); this.tick = 1; }
    const t = this.tick, cx0 = this.cx(x0), cx1 = this.cx(x1), cy0 = this.cy(y0), cy1 = this.cy(y1);
    const st = this.start, it = this.items, sp = this.stamp, out = this.out;
    let n = 0, sorted = true;
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      const c = cx * this.h + cy;
      for (let k = st[c], e = st[c + 1]; k < e; k++) {
        const i = it[k];
        if (sp[i] === t) continue;
        sp[i] = t;
        if (n > 0 && out[n - 1] > i) sorted = false;
        out[n++] = i;
      }
    }
    if (!sorted) {
      if (n <= 32) { for (let a = 1; a < n; a++) { const v = out[a]; let j = a - 1; while (j >= 0 && out[j] > v) { out[j + 1] = out[j]; j--; } out[j + 1] = v; } }
      else out.subarray(0, n).sort();
    }
    this.n = n;
    return n;
  }
}
