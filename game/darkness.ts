import { polyHas } from './areaShape';
import { BoxGrid, BOX_GRID } from './boxGrid';
import { SMALL_FIX } from './smallFixSwitch';
export const DARKNESS = { ON: 1 };

export interface DarkSettings {
  fadeIn: number; fadeOut: number;
  followIn: number; followOut: number;
  circle: number; beam: number;
  beamHalf: number;
  gunBeam: number;
  walls: boolean;
  memory: number;
  feel: boolean;
  scatter: boolean;
  crashers: boolean;
  viewReach: boolean;
  spills: boolean;
  spillCells: number;
  roundLight: number;
}
export const DARK_DEFAULTS: Readonly<DarkSettings> = {
  fadeIn: 0.35, fadeOut: 0.25, followIn: 0.35, followOut: 0.25, circle: 5.6, beam: 24, beamHalf: 0.42, gunBeam: 6, walls: true, memory: 1.5, feel: true, scatter: false,
  crashers: true, viewReach: true, spills: false, spillCells: 6, roundLight: 60,
};

export class DarkSource implements DarkSettings {
  fadeIn = DARK_DEFAULTS.fadeIn; fadeOut = DARK_DEFAULTS.fadeOut;
  followIn = DARK_DEFAULTS.followIn; followOut = DARK_DEFAULTS.followOut;
  circle = DARK_DEFAULTS.circle; beam = DARK_DEFAULTS.beam; beamHalf = DARK_DEFAULTS.beamHalf; gunBeam = DARK_DEFAULTS.gunBeam;
  walls = DARK_DEFAULTS.walls; memory = DARK_DEFAULTS.memory; feel = DARK_DEFAULTS.feel; scatter = DARK_DEFAULTS.scatter;
  crashers = DARK_DEFAULTS.crashers; viewReach = DARK_DEFAULTS.viewReach;
  spills = DARK_DEFAULTS.spills; spillCells = DARK_DEFAULTS.spillCells; roundLight = DARK_DEFAULTS.roundLight;
  level = 0;
  target = 0;
  whole = false;
  outside = false;
  ox0 = 0; oy0 = 0; ox1 = 0; oy1 = 0;
  rects: Float64Array = new Float64Array(0);
  poly: Float64Array | null = null;
  ux0 = 0; uy0 = 0; ux1 = 0; uy1 = 0;
  beh = -1; uid = -1;
  cosHalf = Math.cos(DARK_DEFAULTS.beamHalf);
  tanHalf = Math.tan(DARK_DEFAULTS.beamHalf);
  setHalf(h: number): void { this.beamHalf = h; this.cosHalf = Math.cos(h); this.tanHalf = Math.tan(h); }
  read(a: Record<string, unknown> | undefined): void {
    const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const A = a ?? {};
    this.fadeIn = Math.max(0, n(A.fadeIn, DARK_DEFAULTS.fadeIn)); this.fadeOut = Math.max(0, n(A.fadeOut, DARK_DEFAULTS.fadeOut));
    this.followIn = Math.max(0, n(A.followIn, DARK_DEFAULTS.followIn)); this.followOut = Math.max(0, n(A.followOut, DARK_DEFAULTS.followOut));
    this.circle = Math.max(0, n(A.circle, DARK_DEFAULTS.circle)); this.beam = Math.max(0, n(A.beam, DARK_DEFAULTS.beam));
    this.setHalf(Math.max(0, Math.min(Math.PI * 0.49, n(A.beamWidth, DARK_DEFAULTS.beamHalf * 2 * 180 / Math.PI) * Math.PI / 360)));
    this.gunBeam = Math.max(0, n(A.gunBeam, DARK_DEFAULTS.gunBeam));
    this.walls = A.walls !== false; this.memory = Math.max(0, n(A.memory, DARK_DEFAULTS.memory));
    this.feel = A.feel !== false; this.scatter = A.minimap === 'scatter';
    this.crashers = A.crashers !== false; this.viewReach = A.viewReach !== false;
    this.spills = A.spills === true; this.spillCells = Math.max(1, Math.min(20, n(A.spillCells, DARK_DEFAULTS.spillCells)));
    this.roundLight = Math.max(0, n(A.roundLight, DARK_DEFAULTS.roundLight));
  }
  covers(x: number, y: number): boolean {
    if (this.whole) return true;
    if (this.outside) return x < this.ox0 || x > this.ox1 || y < this.oy0 || y > this.oy1;
    if (x < this.ux0 || x > this.ux1 || y < this.uy0 || y > this.uy1) return false;
    if (this.poly !== null) return polyHas(this.poly, x, y);
    const r = this.rects;
    for (let i = 0; i < r.length; i += 4) if (x >= r[i] && x <= r[i + 2] && y >= r[i + 1] && y <= r[i + 3]) return true;
    return false;
  }
}

export const DARK_FIXED = 2;

export class DarkWorld {
  sources: DarkSource[] = [new DarkSource(), new DarkSource()];
  ver = 0;
  private grid = new BoxGrid();
  private gridVer = -1; private gridLen = -1;
  live = false;
  hit = -1;
  viewersInDark = 0;
  glows: DarkGlow[] = [];
  constructor() { this.sources[0].whole = true; this.sources[1].outside = true; }
  setMapBox(x0: number, y0: number, x1: number, y1: number): void { const o = this.sources[1]; o.ox0 = x0; o.oy0 = y0; o.ox1 = x1; o.oy1 = y1; }
  clear(): void {
    this.ver++; this.sources.length = DARK_FIXED;
    for (let i = 0; i < DARK_FIXED; i++) { const m = this.sources[i]; m.level = 0; m.target = 0; m.read(undefined); }
    this.live = false; this.hit = -1; this.viewersInDark = 0; this.glows.length = 0;
  }
  step(dt: number): void {
    let live = false;
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i];
      if (s.level !== s.target) {
        const t = s.target > s.level ? s.fadeIn : s.fadeOut;
        const d = t > 0 ? dt / t : 1;
        s.level = s.target > s.level ? Math.min(s.target, s.level + d) : Math.max(s.target, s.level - d);
      }
      if (s.level > 0 || s.target > 0) live = true;
    }
    this.live = DARKNESS.ON !== 0 && (live || this.viewersInDark > 0);
  }
  levelAt(x: number, y: number): number {
    const best = this._levelAt(x, y);
    if (best <= 0 || this.glows.length === 0) return best;
    const G = this._glowGrid(x, y);
    if (G === null) return best;
    const s = this.hit >= 0 ? this.sources[this.hit] : this.sources[0];
    let g = G.seeded ? G.at(x, y) : 0;
    if (G.spilled && !s.spills) { const sp = G.atSpill(x, y); if (sp > g) g = sp; }
    return g > 0 ? best * (1 - g) : best;
  }
  levelFor(L: DarkLight, x: number, y: number, los: DarkLosFn | null): number {
    const best = this._levelAt(x, y);
    if (best <= 0 || this.glows.length === 0) return best;
    const G = this._glowGrid(x, y);
    if (G === null) return best;
    const s = this.hit >= 0 ? this.sources[this.hit] : this.sources[0];
    let g = G.spilled && !s.spills ? G.atSpill(x, y) : 0;
    if (g < 1 && G.seeded && !L.off) {
      const d = G.at(x, y);
      if (d > g && !(s.walls && los !== null && !los(L.x, L.y, x, y))) g = d;
    }
    return g > 0 ? best * (1 - g) : best;
  }
  private _glowGrid(x: number, y: number): DarkGlow | null {
    const G = this.glows;
    for (let i = 0; i < G.length; i++) { const g = G[i]; if (x >= g.ox && y >= g.oy && x < g.ox + g.w * g.cs && y < g.oy + g.h * g.cs) return g; }
    return null;
  }
  glowAt(x: number, y: number): number {
    const G = this._glowGrid(x, y);
    if (G === null) return 0;
    const a = G.seeded ? G.at(x, y) : 0, b = G.spilled ? G.atSpill(x, y) : 0;
    return a > b ? a : b;
  }
  spillAt(x: number, y: number): number {
    const G = this._glowGrid(x, y);
    return G !== null && G.spilled ? G.atSpill(x, y) : 0;
  }
  private _levelAt(x: number, y: number): number {
    let best = 0; this.hit = -1;
    const S = this.sources;
    if (S.length - DARK_FIXED >= BOX_GRID.DARK_MIN) {
      for (let i = 0; i < DARK_FIXED; i++) { const s = S[i]; if (s.level > best && s.covers(x, y)) { best = s.level; this.hit = i; } }
      const g = this.grid;
      if (this.gridVer !== this.ver || this.gridLen !== S.length) {
        this.gridVer = this.ver; this.gridLen = S.length;
        g.build(S.length - DARK_FIXED, (i, b) => { const s = S[i + DARK_FIXED]; b[0] = s.ux0; b[1] = s.uy0; b[2] = s.ux1; b[3] = s.uy1; });
      }
      const n = g.query(x, y, x, y), out = g.out;
      for (let k = 0; k < n; k++) {
        const i = out[k] + DARK_FIXED, s = S[i];
        if (s.level <= best) continue;
        if (s.covers(x, y)) { best = s.level; this.hit = i; }
      }
      return best;
    }
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (s.level <= best) continue;
      if (s.covers(x, y)) { best = s.level; this.hit = i; }
    }
    return best;
  }
}

export class DarkGlow {
  ox = 0; oy = 0; cs = 1; w = 0; h = 0;
  v: Float32Array = new Float32Array(0);
  sv: Float32Array = new Float32Array(0);
  open: Uint8Array = new Uint8Array(0);
  dk: Uint8Array = new Uint8Array(0);
  seeded = false; spilled = false;
  ver = 0;
  private sc: number[] = []; private ss: number[] = []; private sr: number[] = [];
  private u: Float32Array = new Float32Array(0); private rch: Float32Array = new Float32Array(0);
  private uBest: Float32Array = new Float32Array(0);
  private hc: Int32Array = new Int32Array(0); private hk: Float32Array = new Float32Array(0); private hn = 0;
  setGrid(ox: number, oy: number, cs: number, w: number, h: number): void {
    this.ox = ox; this.oy = oy; this.cs = cs > 0 ? cs : 1; this.w = w; this.h = h;
    const n = w * h;
    if (this.v.length !== n) { this.v = new Float32Array(n); this.sv = new Float32Array(n); this.dk = new Uint8Array(n); this.u = new Float32Array(n); this.rch = new Float32Array(n); this.uBest = new Float32Array(n); this.hc = new Int32Array(n * 9 + 16); this.hk = new Float32Array(n * 9 + 16); this.open = new Uint8Array(n); }
  }
  clearSeeds(): void { this.sc.length = 0; this.ss.length = 0; this.sr.length = 0; }
  clearLight(open: (cell: number) => boolean): void { const op = this.open; for (let c = 0; c < op.length; c++) op[c] = open(c) ? 1 : 0; this.v.fill(0); this.sv.fill(0); this.seeded = false; this.spilled = false; this.ver++; }
  get seeds(): number { return this.sc.length; }
  seed(cell: number, strength: number, reach: number): void {
    if (cell < 0 || cell >= this.w * this.h || !(strength > 0) || !(reach > 0)) return;
    this.sc.push(cell); this.ss.push(Math.min(1, strength)); this.sr.push(reach);
  }
  private push(c: number, k: number): void {
    if (this.hn >= this.hc.length) return;
    let i = this.hn++; const hc = this.hc, hk = this.hk;
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hc[i] = hc[p]; hk[i] = hk[p]; i = p; }
    hc[i] = c; hk[i] = k;
  }
  private pop(): number {
    const hc = this.hc, hk = this.hk; const top = hc[0];
    const n = --this.hn; const c = hc[n], k = hk[n];
    let i = 0;
    for (;;) { let m = i * 2 + 1; if (m >= n) break; if (m + 1 < n && hk[m + 1] < hk[m]) m++; if (hk[m] >= k) break; hc[i] = hc[m]; hk[i] = hk[m]; i = m; }
    hc[i] = c; hk[i] = k;
    return top;
  }
  fill(open: (cell: number) => boolean): void {
    const w = this.w, h = this.h, u = this.u, rch = this.rch, v = this.v, op = this.open;
    u.fill(2); v.fill(0); this.sv.fill(0); this.hn = 0; this.seeded = this.sc.length > 0; this.spilled = false;
    for (let c = 0; c < op.length; c++) op[c] = open(c) ? 1 : 0;
    this.ver++;
    let several = false;
    if (SMALL_FIX.GH446) for (let i = 1; i < this.sr.length; i++) if (this.sr[i] !== this.sr[0]) { several = true; break; }
    if (!several) { this.seedOf(-1); this.spread(); }
    else {
      const best = this.uBest;
      best.fill(2);
      for (let i = 0; i < this.sr.length; i++) {
        const R = this.sr[i];
        let seen = false;
        for (let j = 0; j < i; j++) if (this.sr[j] === R) { seen = true; break; }
        if (seen) continue;
        u.fill(2); this.hn = 0;
        this.seedOf(R); this.spread();
        for (let c = 0; c < u.length; c++) if (u[c] < best[c]) best[c] = u[c];
      }
      u.set(best);
    }
    for (let c = 0; c < v.length; c++) { const t = 1 - u[c]; v[c] = t > 0 ? t * t * (3 - 2 * t) : 0; }
  }
  private seedOf(R: number): void {
    const u = this.u, rch = this.rch;
    for (let i = 0; i < this.sc.length; i++) { if (R >= 0 && this.sr[i] !== R) continue; const c = this.sc[i], k = 1 - this.ss[i]; if (k < u[c]) { u[c] = k; rch[c] = this.sr[i]; this.push(c, k); } }
  }
  private spread(): void {
    const w = this.w, h = this.h, u = this.u, rch = this.rch, op = this.open;
    const D = Math.SQRT2;
    while (this.hn > 0) {
      const kTop = this.hk[0]; const c = this.pop();
      if (kTop > u[c]) continue;
      const gx = (c / h) | 0, gy = c - gx * h, step = 1 / rch[c];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = nx * h + ny;
        if (op[n] === 0) continue;
        if (dx !== 0 && dy !== 0 && (op[nx * h + gy] === 0 || op[gx * h + ny] === 0)) continue;
        const k = u[c] + (dx !== 0 && dy !== 0 ? D : 1) * step;
        if (k >= 1 || k >= u[n]) continue;
        u[n] = k; rch[n] = rch[c]; this.push(n, k);
      }
    }
  }
  spill(lit: Uint8Array, reachAt: (cell: number) => number): void {
    const w = this.w, h = this.h, op = this.open, dk = this.dk;
    this.sv.fill(0);
    for (let c = 0; c < op.length; c++) dk[c] = op[c] === 1 && lit[c] !== 1 ? 1 : 0;
    this.spilled = true;
    for (let gx = 0; gx < w; gx++) for (let gy = 0; gy < h; gy++) {
      if (dk[gx * h + gy] === 0) continue;
      for (let k = 0; k < 4; k++) {
        const ix = k === 0 ? -1 : k === 1 ? 1 : 0, iy = k === 2 ? -1 : k === 3 ? 1 : 0;
        const nx = gx - ix, ny = gy - iy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = nx * h + ny;
        if (lit[n] !== 1 || op[n] === 0) continue;
        this.fan(gx, gy, ix, iy, reachAt(n));
      }
    }
  }
  private fan(gx: number, gy: number, ix: number, iy: number, R: number): void {
    const w = this.w, h = this.h, dk = this.dk, sv = this.sv;
    const ex = gx + 0.5 - ix * 0.5, ey = gy + 0.5 - iy * 0.5, px = -iy, py = ix;
    const end = R + 0.5, full = R / 3 > 1 ? R / 3 : 1, span = Math.ceil(end);
    for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) {
      const cx = gx + a, cy = gy + b;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const c = cx * h + cy;
      if (dk[c] === 0) continue;
      const dx = cx + 0.5 - ex, dy = cy + 0.5 - ey;
      const along = dx * ix + dy * iy;
      if (along <= 0) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= end) continue;
      const tr = dist <= full ? 0 : (dist - full) / (end - full);
      let val = 1 - tr * tr * (3 - 2 * tr);
      const cosA = along / dist;
      if (cosA < DARK_SPILL_COS) { const ta = cosA / DARK_SPILL_COS; val *= ta * ta * (3 - 2 * ta); }
      if (val <= sv[c] + 1e-4) continue;
      if (this.clear(ex, ey, ix, iy, cx, cy) || this.clear(ex + px * 0.4, ey + py * 0.4, ix, iy, cx, cy) || this.clear(ex - px * 0.4, ey - py * 0.4, ix, iy, cx, cy)
        || this.clear(ex + ix, ey + iy, ix, iy, cx, cy) || this.clear(ex + ix + px * 0.4, ey + iy + py * 0.4, ix, iy, cx, cy) || this.clear(ex + ix - px * 0.4, ey + iy - py * 0.4, ix, iy, cx, cy)) sv[c] = val;
    }
  }
  private clear(x0: number, y0: number, ix: number, iy: number, cx: number, cy: number): boolean {
    const op = this.open, w = this.w, h = this.h;
    x0 += ix * 0.01; y0 += iy * 0.01;
    const dx = cx + 0.5 - x0, dy = cy + 0.5 - y0;
    let i = Math.floor(x0), j = Math.floor(y0);
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const ddx = sx !== 0 ? 1 / Math.abs(dx) : Infinity, ddy = sy !== 0 ? 1 / Math.abs(dy) : Infinity;
    let tx = sx > 0 ? (i + 1 - x0) * ddx : sx < 0 ? (x0 - i) * ddx : Infinity;
    let ty = sy > 0 ? (j + 1 - y0) * ddy : sy < 0 ? (y0 - j) * ddy : Infinity;
    for (let k = 0; k < 96; k++) {
      if (i < 0 || j < 0 || i >= w || j >= h || op[i * h + j] === 0) return false;
      if (i === cx && j === cy) return true;
      if (tx - ty < 1e-9 && ty - tx < 1e-9) {
        if (op[(i + sx) * h + j] === 0 || op[i * h + j + sy] === 0) return false;
        i += sx; j += sy; tx += ddx; ty += ddy;
      } else if (tx < ty) { i += sx; tx += ddx; } else { j += sy; ty += ddy; }
    }
    return false;
  }
  at(x: number, y: number): number { return this.read(this.v, this.open, x, y); }
  atSpill(x: number, y: number): number { return this.read(this.sv, this.dk, x, y); }
  private read(v: Float32Array, m: Uint8Array, x: number, y: number): number {
    const fx = (x - this.ox) / this.cs - 0.5, fy = (y - this.oy) / this.cs - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
    const w = this.w, h = this.h, i1 = i0 + 1, j1 = j0 + 1;
    let s = 0, sw = 0, c = 0, k = 0;
    if (i0 >= 0 && i0 < w && j0 >= 0 && j0 < h) { c = i0 * h + j0; if (m[c] !== 0) { k = (1 - tx) * (1 - ty); s += k * v[c]; sw += k; } }
    if (i1 >= 0 && i1 < w && j0 >= 0 && j0 < h) { c = i1 * h + j0; if (m[c] !== 0) { k = tx * (1 - ty); s += k * v[c]; sw += k; } }
    if (i0 >= 0 && i0 < w && j1 >= 0 && j1 < h) { c = i0 * h + j1; if (m[c] !== 0) { k = (1 - tx) * ty; s += k * v[c]; sw += k; } }
    if (i1 >= 0 && i1 < w && j1 >= 0 && j1 < h) { c = i1 * h + j1; if (m[c] !== 0) { k = tx * ty; s += k * v[c]; sw += k; } }
    return sw > 1e-6 ? s / sw : 0;
  }
}

export const DARK_MAX_GUNS = 24;
export class DarkLight {
  key = ''; stamp = -1;
  x = 0; y = 0; rad = 1;
  ax = 1; ay = 0;
  gn = 0;
  g: Float64Array = new Float64Array(DARK_MAX_GUNS * 5);
  inDark = false;
  off = false;
  view = 1;
  round = false;
  setAim(angle: number): void { this.ax = Math.cos(angle); this.ay = Math.sin(angle); }
  addGun(ox: number, oy: number, dir: number, len: number): void {
    if (this.gn >= DARK_MAX_GUNS || !(len > 0)) return;
    const o = this.gn * 5;
    this.g[o] = ox; this.g[o + 1] = oy; this.g[o + 2] = Math.cos(dir); this.g[o + 3] = Math.sin(dir); this.g[o + 4] = len;
    this.gn++;
  }
}

function inCone(ox: number, oy: number, dx: number, dy: number, len: number, tanH: number, cosH: number, x: number, y: number, r: number, minHalf = 0): boolean {
  const px = x - ox, py = y - oy;
  const along = px * dx + py * dy;
  if (along < -r) return false;
  const reach = len + r;
  if (px * px + py * py > reach * reach) return false;
  const across = px * dy - py * dx;
  const half = (along > 0 ? along : 0) * tanH;
  return (across < 0 ? -across : across) <= (half > minHalf ? half : minHalf) + r / cosH;
}

export function inLightShape(L: DarkLight, s: DarkSource, x: number, y: number, r: number): boolean {
  if (L.off) return false;
  const dx = x - L.x, dy = y - L.y;
  if (L.round) { const q = roundLightRadius(L, s) + r; return dx * dx + dy * dy <= q * q; }
  const c = s.circle * L.rad + r;
  if (dx * dx + dy * dy <= c * c) return true;
  const reach = s.viewReach ? L.view : 1;
  if (s.beam > 0 && inCone(L.x, L.y, L.ax, L.ay, s.beam * L.rad * reach, s.tanHalf, s.cosHalf, x, y, r, s.circle * L.rad)) return true;
  if (s.gunBeam > 0) {
    const g = L.g;
    for (let i = 0; i < L.gn; i++) {
      const o = i * 5;
      if (inCone(g[o], g[o + 1], g[o + 2], g[o + 3], s.gunBeam * g[o + 4] * reach, s.tanHalf, s.cosHalf, x, y, r)) return true;
    }
  }
  return false;
}

export function roundLightRadius(L: DarkLight, s: DarkSource): number {
  const b = s.beam * s.roundLight * 0.01 * (s.viewReach ? L.view : 1);
  return (b > s.circle ? b : s.circle) * L.rad;
}

export type DarkLosFn = (x0: number, y0: number, x1: number, y1: number) => boolean;

export function darkHides(W: DarkWorld, L: DarkLight, x: number, y: number, r: number, los: DarkLosFn | null): boolean {
  if (!W.live) return false;
  let lvl = W.levelFor(L, x, y, los);
  let s: DarkSource;
  if (L.inDark) { s = W.hit >= 0 ? W.sources[W.hit] : W.sources[0]; lvl = 1; }
  else { if (lvl < 0.5) return false; s = W.sources[W.hit]; }
  if (!inLightShape(L, s, x, y, r)) return true;
  if (s.walls && los !== null && !los(L.x, L.y, x, y)) return true;
  void lvl;
  return false;
}

export interface DarkBody { id: string }
export type DarkBotHidesFn = (viewer: DarkBody, target: DarkBody, held: boolean) => boolean;
export const DARK_HOOK: { botHides: DarkBotHidesFn | null } = { botHides: null };

export function darkAt(W: DarkWorld, x: number, y: number): boolean {
  return W.live && W.levelAt(x, y) >= 0.5;
}

export function sourceAt(W: DarkWorld, x: number, y: number): DarkSource | null {
  let best: DarkSource | null = null;
  const S = W.sources;
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    if (s.level <= 0 || (best !== null && s.level <= best.level)) continue;
    if (s.covers(x, y)) best = s;
  }
  return best;
}

const DARK_SPILL_COS = Math.cos(50 * Math.PI / 180);
