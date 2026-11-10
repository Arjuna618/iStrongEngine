export interface InterestGrid { x0: number; y0: number; cw: number; ch: number; nx: number; ny: number; v: Float32Array }

export interface CamPlan {
  x0: number; y0: number; vx: number; vy: number;
  durS: number; extS: number;
  viewW: number; viewH: number;
  picX0: number; picY0: number; picW: number; picH: number;
  score: number;
  box: Box;
}

export const CAM_EXT = 1.4;

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

export function planCamera(grid: InterestGrid, box: Box, viewW: number, viewH: number, speed: number, durS: number,
  rand: () => number, prefer: { from: [number, number]; to: [number, number] } | null = null,
  hole: { w: number; h: number } | null = null): CamPlan {
  const { nx, ny, cw, ch, x0, y0, v } = grid;
  const S = new Float64Array((nx + 1) * (ny + 1));
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
    S[(ix + 1) * (ny + 1) + iy + 1] = v[ix * ny + iy] + S[ix * (ny + 1) + iy + 1] + S[(ix + 1) * (ny + 1) + iy] - S[ix * (ny + 1) + iy];
  }
  const cl = (n: number, hi: number) => (n < 0 ? 0 : n > hi ? hi : n);
  const rect = (cx: number, cy: number, w: number, h: number): number => {
    const a = cl(Math.round((cx - w / 2 - x0) / cw), nx), b = cl(Math.round((cx + w / 2 - x0) / cw), nx);
    const c = cl(Math.round((cy - h / 2 - y0) / ch), ny), d = cl(Math.round((cy + h / 2 - y0) / ch), ny);
    return S[b * (ny + 1) + d] - S[a * (ny + 1) + d] - S[b * (ny + 1) + c] + S[a * (ny + 1) + c];
  };
  const hw = hole ? Math.min(0.9, hole.w) * viewW : 0, hh = hole ? Math.min(0.9, hole.h) * viewH : 0;
  const sumAt = (cx: number, cy: number): number => rect(cx, cy, viewW, viewH) + rect(cx, cy, viewW * 0.6, viewH * 0.6)
    - (hw > 0 ? 1.6 * rect(cx, cy, hw, hh) : 0);
  const voidAt = (cx: number, cy: number): number => {
    const ix = Math.max(0, Math.min(cx + viewW / 2, box.maxX) - Math.max(cx - viewW / 2, box.minX));
    const iy = Math.max(0, Math.min(cy + viewH / 2, box.maxY) - Math.max(cy - viewH / 2, box.minY));
    return 1 - (ix * iy) / (viewW * viewH);
  };

  const spots: { x: number; y: number; s: number }[] = [];
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
    const x = x0 + (ix + 0.5) * cw, y = y0 + (iy + 0.5) * ch;
    spots.push({ x, y, s: sumAt(x, y) });
  }
  spots.sort((a, b) => b.s - a.s);
  const hot: { x: number; y: number; s: number }[] = [];
  for (const p of spots) {
    if (hot.length >= 10) break;
    if (hot.every(h => Math.hypot(h.x - p.x, h.y - p.y) > viewW * 0.45)) hot.push(p);
  }
  for (let i = 0; i < 3; i++) {
    const x = box.minX + rand() * (box.maxX - box.minX), y = box.minY + rand() * (box.maxY - box.minY);
    hot.push({ x, y, s: sumAt(x, y) });
  }
  const top = Math.max(1e-6, hot[0]?.s ?? 1);
  const L = speed * durS;

  type Cand = { sx: number; sy: number; dx: number; dy: number; score: number; inside: boolean };
  const cands: Cand[] = [];
  const roomy = box.maxX - box.minX > viewW * 1.05 && box.maxY - box.minY > viewH * 1.05;
  const score = (sx: number, sy: number, dx: number, dy: number, bonus: number): void => {
    let mean = 0, min = Infinity, vd = 0, worst = 0;
    const K = 8;
    for (let k = 0; k <= K; k++) {
      const t = (k / K) * L, x = sx + dx * t, y = sy + dy * t;
      const s = sumAt(x, y);
      mean += s; if (s < min) min = s;
      const v = voidAt(x, y); vd += v; if (v > worst) worst = v;
    }
    mean /= K + 1; vd /= K + 1;
    const ex = voidAt(sx + dx * L * CAM_EXT, sy + dy * L * CAM_EXT);
    const sc = (mean + 0.6 * min) / top - 4.5 * vd - 4 * Math.max(0, ex - 0.12) + bonus;
    cands.push({ sx, sy, dx, dy, score: sc, inside: worst < 0.004 && ex < 0.15 });
  };
  for (const h of hot) {
    const turn = rand() * Math.PI * 2;
    for (let a = 0; a < 16; a++) {
      const ang = turn + (a / 16) * Math.PI * 2;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (const u of [0.3, 0.5, 0.7]) score(h.x - dx * L * u, h.y - dy * L * u, dx, dy, 0);
    }
  }
  if (prefer) {
    const ddx = prefer.to[0] - prefer.from[0], ddy = prefer.to[1] - prefer.from[1], dl = Math.hypot(ddx, ddy) || 1;
    score(prefer.from[0], prefer.from[1], ddx / dl, ddy / dl, 0.35);
  }
  if (roomy) {
    const lo = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    for (const c of cands.slice()) {
      const sx = lo(c.sx, box.minX + viewW / 2, box.maxX - viewW / 2), sy = lo(c.sy, box.minY + viewH / 2, box.maxY - viewH / 2);
      if (sx !== c.sx || sy !== c.sy) score(sx, sy, c.dx, c.dy, 0);
    }
  }
  const pool = roomy && cands.some(c => c.inside) ? cands.filter(c => c.inside) : cands;
  pool.sort((a, b) => b.score - a.score);
  const best = pool.slice(0, 5);
  const w = best.map(c => Math.exp((c.score - best[0].score) * 6));
  let u = rand() * w.reduce((a, b) => a + b, 0);
  let pick = best[0];
  for (let i = 0; i < best.length; i++) { u -= w[i]; if (u <= 0) { pick = best[i]; break; } }

  const ex = pick.sx + pick.dx * L * CAM_EXT, ey = pick.sy + pick.dy * L * CAM_EXT;
  const m = 1.02;
  const picX0 = Math.min(pick.sx, ex) - (viewW * m) / 2, picY0 = Math.min(pick.sy, ey) - (viewH * m) / 2;
  return {
    x0: pick.sx, y0: pick.sy, vx: pick.dx * speed, vy: pick.dy * speed,
    durS, extS: durS * CAM_EXT, viewW, viewH,
    picX0, picY0, picW: Math.abs(ex - pick.sx) + viewW * m, picH: Math.abs(ey - pick.sy) + viewH * m,
    score: pick.score, box: { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY },
  };
}
