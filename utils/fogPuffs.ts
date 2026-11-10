import { DarkWorld, DarkLight, DarkSource, inLightShape, type DarkLosFn } from '../game/darkness';

export const FOG = {
  LATTICE: 40,
  RADIUS: 48,
  JITTER: 7,
  BREATH: 12,
  SHADE_MAX: 16,
  THIN_SIZE: 0.55,
  THIN_FADE: 1 as number,
  SOFT_K: 2 as number,
  SOFT_GROW: 1 as number,
  SOFT_EVEN: 0.25 as number,
} as const;

export interface FogWalls { tg: Uint8Array; ox: number; oy: number; cs: number; w: number; h: number; wall: number }
const _faceAt = new Float64Array(2);

export function fogWallFace(fw: FogWalls, x: number, y: number, out: Float64Array): boolean {
  const tg = fw.tg, w = fw.w, h = fw.h, W = fw.wall;
  const fx = (x - fw.ox) / fw.cs, fy = (y - fw.oy) / fw.cs;
  const i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= w || j >= h || tg[i * h + j] !== W) return false;
  const tx = fx - i, ty = fy - j, E = 0.02;
  let best = 2, bx = 0, by = 0;
  if (i > 0 && tg[(i - 1) * h + j] !== W && tx < best) { best = tx; bx = i - E; by = fy; }
  if (i + 1 < w && tg[(i + 1) * h + j] !== W && 1 - tx < best) { best = 1 - tx; bx = i + 1 + E; by = fy; }
  if (j > 0 && tg[i * h + j - 1] !== W && ty < best) { best = ty; bx = fx; by = j - E; }
  if (j + 1 < h && tg[i * h + j + 1] !== W && 1 - ty < best) { best = 1 - ty; bx = fx; by = j + 1 + E; }
  for (let k = 0; k < 4; k++) {
    const di = k & 1 ? 1 : -1, dj = k & 2 ? 1 : -1, ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= w || nj >= h || tg[ni * h + nj] === W) continue;
    const ddx = di > 0 ? 1 - tx : tx, ddy = dj > 0 ? 1 - ty : ty, d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d < best) { best = d; bx = (di > 0 ? i + 1 : i) + di * E; by = (dj > 0 ? j + 1 : j) + dj * E; }
  }
  if (best > 1.5) return false;
  out[0] = bx * fw.cs + fw.ox; out[1] = by * fw.cs + fw.oy;
  return true;
}

function hash(ix: number, iy: number, salt: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(salt, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const FOG_STRIDE = 6;

export class FogField {
  out: Float32Array = new Float32Array(0);
  n = 0;
  any = false;
  private w = 0; private h = 0;
  private v: Float32Array = new Float32Array(0);
  private kx: Int32Array = new Int32Array(0);
  private ky: Int32Array = new Int32Array(0);
  private t: Float32Array = new Float32Array(0);
  private tw = 0;
  private fin: Float32Array = new Float32Array(0);
  private fout: Float32Array = new Float32Array(0);
  private inw: Uint8Array = new Uint8Array(0);
  private wk: Int32Array = new Int32Array(0);
  private wfx: Float32Array = new Float32Array(0);
  private wfy: Float32Array = new Float32Array(0);

  private _judge(W: DarkWorld, L: DarkLight, los: DarkLosFn | null, map: DarkSource, px: number, py: number, k: number): void {
    let lvl = W.live ? W.levelFor(L, px, py, los) : 0;
    const src: DarkSource = W.hit >= 0 ? W.sources[W.hit] : map;
    if (L.inDark) { lvl = 1; }
    this.fin[k] = src.followIn; this.fout[k] = src.followOut;
    if (lvl <= 0) { this.t[k] = 0; return; }
    const lit = inLightShape(L, src, px, py, 0) && (!src.walls || los === null || los(L.x, L.y, px, py));
    this.t[k] = lit ? 0 : lvl;
  }

  reset(): void { this.kx.fill(0x7fffffff); this.n = 0; this.any = false; }

  update(W: DarkWorld, L: DarkLight, los: DarkLosFn | null, x0: number, y0: number, x1: number, y1: number, dt: number, now: number, walls: FogWalls | null = null): void {
    if (!W.live && !this.any) { this.n = 0; return; }
    const S = FOG.LATTICE, R = FOG.RADIUS;
    const ix0 = Math.floor((x0 - R) / S), iy0 = Math.floor((y0 - R) / S);
    const ix1 = Math.ceil((x1 + R) / S), iy1 = Math.ceil((y1 + R) / S);
    const nw = ix1 - ix0 + 1, nh = iy1 - iy0 + 1;
    if (nw > this.w || nh > this.h) this._grow(Math.max(nw, this.w), Math.max(nh, this.h));
    const tw = nw + 2, th = nh + 2;
    if (this.t.length < tw * th) {
      const m = tw * th * 2;
      this.t = new Float32Array(m); this.fin = new Float32Array(m); this.fout = new Float32Array(m); this.inw = new Uint8Array(m);
      this.wk = new Int32Array(m); this.wfx = new Float32Array(m); this.wfy = new Float32Array(m);
    }
    this.tw = tw;
    const t = this.t, fin = this.fin, fout = this.fout, inw = this.inw, wk = this.wk, wfx = this.wfx, wfy = this.wfy;
    let nw2 = 0;
    const map = W.sources[0];
    for (let j = 0; j < th; j++) {
      const iy = iy0 - 1 + j;
      for (let i = 0; i < tw; i++) {
        const ix = ix0 - 1 + i;
        const px = ix * S + (hash(ix, iy, 1) * 2 - 1) * FOG.JITTER, py = iy * S + (hash(ix, iy, 2) * 2 - 1) * FOG.JITTER;
        const k = j * tw + i;
        inw[k] = 0;
        if (walls !== null) {
          const ci = Math.floor((px - walls.ox) / walls.cs), cj = Math.floor((py - walls.oy) / walls.cs);
          if (ci >= 0 && cj >= 0 && ci < walls.w && cj < walls.h && walls.tg[ci * walls.h + cj] === walls.wall && fogWallFace(walls, px, py, _faceAt)) {
            inw[k] = 1; wfx[nw2] = _faceAt[0]; wfy[nw2] = _faceAt[1]; wk[nw2++] = k;
            continue;
          }
        }
        this._judge(W, L, los, map, px, py, k);
      }
    }
    for (let q = 0; q < nw2; q++) {
      const k = wk[q], fx = wfx[q], fy = wfy[q];
      const j = (k / tw) | 0, i = k - j * tw;
      const ox = (ix0 - 1 + i) * S + (hash(ix0 - 1 + i, iy0 - 1 + j, 1) * 2 - 1) * FOG.JITTER, oy = (iy0 - 1 + j) * S + (hash(ix0 - 1 + i, iy0 - 1 + j, 2) * 2 - 1) * FOG.JITTER;
      const sx = fx - ox > 1e-6 ? 1 : fx - ox < -1e-6 ? -1 : 0, sy = fy - oy > 1e-6 ? 1 : fy - oy < -1e-6 ? -1 : 0;
      const n = k + sx + sy * tw, ni = i + sx, nj = j + sy;
      if (ni >= 0 && nj >= 0 && ni < tw && nj < th && inw[n] === 0) { t[k] = t[n]; fin[k] = fin[n]; fout[k] = fout[n]; }
      else this._judge(W, L, los, map, fx, fy, k);
    }
    const need = nw * nh * FOG_STRIDE;
    if (this.out.length < need) this.out = new Float32Array(need * 2);
    const out = this.out;
    let n = 0, any = false;
    const mw = this.w - 1, mh = this.h - 1;
    const breath = (2 * Math.PI) / FOG.BREATH;
    for (let j = 1; j <= nh; j++) {
      const iy = iy0 - 1 + j;
      for (let i = 1; i <= nw; i++) {
        const ix = ix0 - 1 + i;
        const k = j * tw + i;
        const own = t[k], wl = inw[k] === 0;
        const sm = (2 * own + (wl && inw[k - 1] === 1 ? own : t[k - 1]) + (wl && inw[k + 1] === 1 ? own : t[k + 1])
          + (wl && inw[k - tw] === 1 ? own : t[k - tw]) + (wl && inw[k + tw] === 1 ? own : t[k + tw])) / 6;
        const target = wl || sm > own ? sm : own;
        const slot = (iy & mh) * this.w + (ix & mw);
        let v: number;
        if (this.kx[slot] !== ix || this.ky[slot] !== iy) { this.kx[slot] = ix; this.ky[slot] = iy; v = target; }
        else {
          v = this.v[slot];
          if (v < target) { const f = fin[k]; v = f > 0 ? Math.min(target, v + dt / f) : target; }
          else if (v > target) { const f = fout[k]; v = f > 0 ? Math.max(target, v - dt / f) : target; }
        }
        this.v[slot] = v;
        if (v < 0.01) continue;
        any = true;
        const sizeShare = 5 / 6 + Math.sin(now * breath + hash(ix, iy, 3) * 6.2832) / 6;
        const o = n * FOG_STRIDE;
        out[o] = ix * S + (hash(ix, iy, 1) * 2 - 1) * FOG.JITTER;
        out[o + 1] = iy * S + (hash(ix, iy, 2) * 2 - 1) * FOG.JITTER;
        let soft = 0;
        if (FOG.THIN_FADE !== 0 && v < 1) {
          soft = FOG.SOFT_K > 0 ? Math.min(1, (1 - v) * FOG.SOFT_K) : 0;
          const rad = R * sizeShare * (FOG.THIN_SIZE + (1 - FOG.THIN_SIZE) * v) * (1 + FOG.SOFT_GROW * soft);
          const cover = (Math.PI * rad * rad) / (S * S) * (1 - soft + soft * soft / 3) * (1 - FOG.SOFT_EVEN * soft);
          out[o + 2] = rad;
          out[o + 3] = Math.min(1, 1 - Math.pow(1 - v, 1 / (cover > 1 ? cover : 1)));
        } else {
          out[o + 2] = R * sizeShare * v;
          out[o + 3] = v;
        }
        out[o + 4] = Math.floor(hash(ix, iy, 4) * (FOG.SHADE_MAX + 1)) / 255;
        out[o + 5] = soft;
        n++;
      }
    }
    this.n = n;
    this.any = any;
  }

  private _grow(nw: number, nh: number): void {
    let w = 1; while (w < nw) w <<= 1;
    let h = 1; while (h < nh) h <<= 1;
    this.w = w; this.h = h;
    this.v = new Float32Array(w * h);
    this.kx = new Int32Array(w * h).fill(0x7fffffff);
    this.ky = new Int32Array(w * h);
  }
}
