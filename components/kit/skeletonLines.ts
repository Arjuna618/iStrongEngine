export const LINE_SAME = 0.3;
export const LINE_JOIN = 0.55;

export function joinTextRuns(q: readonly number[]): number[] {
  const n = Math.floor(q.length / 4);
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (q[i * 4 + 2] > 0 && q[i * 4 + 3] > 0) order.push(i);
  order.sort((a, b) => q[a * 4] - q[b * 4]);
  const bars: number[][] = [];
  for (const i of order) {
    const x = q[i * 4], y = q[i * 4 + 1], w = q[i * 4 + 2], h = q[i * 4 + 3];
    const cy = y + h / 2;
    let into: number[] | null = null;
    for (let k = bars.length - 1; k >= 0; k--) {
      const g = bars[k];
      const gh = g[3] - g[1];
      if (Math.abs((g[1] + g[3]) / 2 - cy) > Math.max(2, LINE_SAME * Math.min(gh, h))) continue;
      if (x - g[2] > LINE_JOIN * Math.max(gh, h)) continue;
      into = g; break;
    }
    if (into) {
      if (x + w > into[2]) into[2] = x + w;
      if (y < into[1]) into[1] = y;
      if (y + h > into[3]) into[3] = y + h;
    } else bars.push([x, y, x + w, y + h]);
  }
  const out: number[] = [];
  for (const g of bars) out.push(g[0], g[1], g[2] - g[0], g[3] - g[1]);
  return out;
}
