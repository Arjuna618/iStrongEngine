import type { MapState, WallEntity } from '../types';
import { TileType } from '../types';
import { SMALL_FIX } from './smallFixSwitch';
import { type MagicLattice, spotKind, mmRandom, mmOpenKind } from './magicMaze';

export interface MMHost {
  cellsChanged(ms: MapState, c0: number, c1: number, c2: number): void;
}

const DI = [2, -2, 0, 0], DJ = [0, 0, 2, -2];
const JUMP_MS = 1000;

export class MagicMover {
  readonly ms: MapState;
  readonly L: MagicLattice;
  readonly offX: number;
  readonly offY: number;
  private readonly rnd: () => number;
  private readonly occ: Int32Array;
  readonly wi: Int32Array;
  readonly n: number;
  private readonly at: Int32Array;
  private readonly st: Uint8Array;
  private readonly next: Float64Array;
  private readonly t0: Float64Array;
  private readonly mid: Int32Array;
  private readonly to: Int32Array;
  private readonly heldK: Uint8Array;
  private readonly fx: Float64Array; private readonly fy: Float64Array;
  private readonly tx: Float64Array; private readonly ty: Float64Array;
  private readonly homeX: Float64Array; private readonly homeY: Float64Array;
  private readonly homeAt: Int32Array;
  private readonly gridSnap: Int16Array;
  private readonly tileSnap: Uint8Array;
  sliding = 0;
  moves = 0;
  private lastNow = -1;
  private perMs: number;
  private slideMs: number;
  private restMs: number;
  private on: boolean;
  private stillMask = 0;

  constructor(ms: MapState, L: MagicLattice, offX: number, offY: number, now: number) {
    this.ms = ms; this.L = L; this.offX = offX; this.offY = offY;
    this.rnd = mmRandom(L.seed ^ 0x2f6b9d1);
    const nx = L.nx, ny = L.ny, gcY = ms.gridCellsY;
    this.occ = new Int32Array(nx * ny).fill(-2);
    this.gridSnap = new Int16Array(nx * ny);
    this.tileSnap = new Uint8Array(nx * ny);
    const movers: number[] = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const s = i * ny + j, g = (L.gx0 + i) * gcY + (L.gy0 + j);
      this.gridSnap[s] = ms.wallGrid[g]; this.tileSnap[s] = ms.tileGrid[g];
      if (L.floor[s] !== 255 && spotKind(i, j) === 1) this.occ[s] = -1;
    }
    const cs = ms.cellSize;
    for (let w = 0; w < ms.walls.length; w++) {
      const wall = ms.walls[w];
      if (!wall.active) continue;
      const gx0 = Math.round((wall.x - offX - wall.halfW + ms.mapHalf) / cs) - L.gx0, gx1 = Math.round((wall.x - offX + wall.halfW + ms.mapHalf) / cs) - L.gx0;
      const gy0 = Math.round((wall.y - offY - wall.halfH + ms.mapHalfY) / cs) - L.gy0, gy1 = Math.round((wall.y - offY + wall.halfH + ms.mapHalfY) / cs) - L.gy0;
      if (gx1 <= 0 || gy1 <= 0 || gx0 >= nx || gy0 >= ny) continue;
      const mine = wall.kind !== undefined && this._oneCell(wall) && gx1 - gx0 === 1 && gy1 - gy0 === 1;
      for (let i = Math.max(0, gx0); i < Math.min(nx, gx1); i++) for (let j = Math.max(0, gy0); j < Math.min(ny, gy1); j++) {
        const s = i * ny + j;
        if (this.occ[s] === -2) continue;
        if (mine && this.occ[s] === -1) { this.occ[s] = w; movers.push(w, s); } else this.occ[s] = -2;
      }
    }
    this.n = movers.length / 2;
    const n = this.n;
    this.wi = new Int32Array(n); this.at = new Int32Array(n); this.st = new Uint8Array(n);
    this.next = new Float64Array(n); this.t0 = new Float64Array(n); this.mid = new Int32Array(n); this.to = new Int32Array(n); this.heldK = new Uint8Array(n);
    this.fx = new Float64Array(n); this.fy = new Float64Array(n); this.tx = new Float64Array(n); this.ty = new Float64Array(n);
    this.homeX = new Float64Array(n); this.homeY = new Float64Array(n); this.homeAt = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      this.wi[k] = movers[k * 2]; this.at[k] = movers[k * 2 + 1]; this.homeAt[k] = this.at[k];
      const w = ms.walls[this.wi[k]];
      this.homeX[k] = w.x; this.homeY[k] = w.y;
    }
    this.perMs = 0; this.slideMs = 1990; this.restMs = 0; this.on = false;
    this.setPace(L.cfg.moving, L.cfg.perMinute, L.cfg.slide, L.cfg.rest, L.cfg.still);
    for (let k = 0; k < n; k++) this.next[k] = now + this._wait();
    this.lastNow = now;
  }

  private _oneCell(w: WallEntity): boolean {
    const h = this.ms.cellSize / 2;
    return Math.abs(w.halfW - h) < 0.01 && Math.abs(w.halfH - h) < 0.01;
  }

  setPace(on: boolean, perMinute: number, slideS: number, restS: number, still: readonly number[] | null): void {
    this.on = on && perMinute > 0;
    this.perMs = perMinute > 0 ? perMinute / 60000 : 0;
    const was = this.slideMs;
    this.slideMs = Math.max(500, Math.min(10000, slideS * 1000));
    if (SMALL_FIX.G679 !== 0 && was > 0 && this.slideMs !== was) {
      const now = this.lastNow;
      for (let k = 0; k < this.n; k++) if (this.st[k] === 1) this.t0[k] = now - (now - this.t0[k]) * (this.slideMs / was);
    }
    if (Number.isFinite(restS)) this.restMs = Math.max(0, Math.min(60000, restS * 1000));
    if (still !== null) { let m = 0; for (const t of still) if (t >= 0 && t < 31) m |= 1 << t; this.stillMask = m; }
  }
  isOn(): boolean { return this.on; }

  private _wait(): number {
    if (!(this.perMs > 0)) return Infinity;
    const u = this.rnd();
    return -Math.log(1 - u * 0.999999) / this.perMs;
  }

  private _cx(s: number): number { const i = (s / this.L.ny) | 0; return -this.ms.mapHalf + (this.L.gx0 + i + 0.5) * this.ms.cellSize + this.offX; }
  private _cy(s: number): number { const j = s % this.L.ny; return -this.ms.mapHalfY + (this.L.gy0 + j + 0.5) * this.ms.cellSize + this.offY; }
  gridOf(s: number): number { const i = (s / this.L.ny) | 0, j = s - i * this.L.ny; return (this.L.gx0 + i) * this.ms.gridCellsY + (this.L.gy0 + j); }

  step(now: number, host: MMHost): void {
    const jump = now - this.lastNow > JUMP_MS;
    this.lastNow = now;
    const ms = this.ms;
    for (let k = 0; k < this.n; k++) {
      const s = this.st[k];
      if (s === 2) continue;
      const w = ms.walls[this.wi[k]];
      if (!w || !w.active) { this.release(k); continue; }
      if (s === 1) {
        const p = (now - this.t0[k]) / this.slideMs;
        if (p >= 1) this._arrive(k, now, host);
        else { w.x = this.fx[k] + (this.tx[k] - this.fx[k]) * p; w.y = this.fy[k] + (this.ty[k] - this.fy[k]) * p; }
        continue;
      }
      if (this.next[k] === Infinity && this.perMs > 0) this.next[k] = now + this._wait();
      if (now < this.next[k]) continue;
      if (jump) { this.next[k] = now + this._wait(); continue; }
      if (!this.on || ((this.stillMask >> (w.kind ?? 0)) & 1) !== 0) { this.next[k] = now + this._wait(); continue; }
      this._tryStart(k, now, host);
    }
  }

  private _tryStart(k: number, now: number, host: MMHost): void {
    const L = this.L, ny = L.ny, s = this.at[k], i = (s / ny) | 0, j = s - i * ny;
    let pick = -1, seen = 0;
    for (let d = 0; d < 4; d++) {
      const a = i + DI[d], b = j + DJ[d];
      if (a < 0 || b < 0 || a >= L.nx || b >= ny) continue;
      const t = a * ny + b, m = (i + (DI[d] >> 1)) * ny + (j + (DJ[d] >> 1));
      if (this.occ[t] !== -1 || L.floor[m] === 255) continue;
      seen++;
      if (this.rnd() * seen < 1) pick = d;
    }
    if (pick < 0) { this.next[k] = now + this._wait(); return; }
    const t = (i + DI[pick]) * ny + (j + DJ[pick]), m = (i + (DI[pick] >> 1)) * ny + (j + (DJ[pick] >> 1));
    const wIdx = this.wi[k], ms = this.ms;
    this.occ[s] = -1; this.occ[t] = wIdx;
    this.st[k] = 1; this.t0[k] = now; this.mid[k] = m; this.to[k] = t;
    this.fx[k] = this._cx(s); this.fy[k] = this._cy(s); this.tx[k] = this._cx(t); this.ty[k] = this._cy(t);
    const gs = this.gridOf(s), gm = this.gridOf(m), gt = this.gridOf(t);
    if (ms.wallGrid[gs] === wIdx) { ms.wallGrid[gs] = -1; ms.tileGrid[gs] = L.floor[s]; }
    if (!mmOpenKind(ms.walls[wIdx].kind)) {
      if (ms.extraWalls === undefined) { ms.extraWalls = []; ms.extraOffX = this.offX; ms.extraOffY = this.offY; }
      if (ms.extraWalls.indexOf(wIdx) < 0) ms.extraWalls.push(wIdx);
      const held = ms.magicHeld!;
      held[gs]++; held[gm]++; held[gt]++;
      this.heldK[k] = 1;
    } else this.heldK[k] = 0;
    this.sliding++; this.moves++;
    host.cellsChanged(ms, gs, gm, gt);
  }

  private _arrive(k: number, now: number, host: MMHost): void {
    const ms = this.ms, wIdx = this.wi[k], w = ms.walls[wIdx];
    const s = this.at[k], m = this.mid[k], t = this.to[k];
    w.x = this.tx[k]; w.y = this.ty[k];
    const gs = this.gridOf(s), gm = this.gridOf(m), gt = this.gridOf(t);
    this._unextra(wIdx);
    if (this.heldK[k] === 1) {
      ms.wallGrid[gt] = wIdx; ms.tileGrid[gt] = TileType.WALL;
      const held = ms.magicHeld!;
      held[gs]--; held[gm]--; held[gt]--;
    }
    this.heldK[k] = 0;
    this.at[k] = t; this.st[k] = 0; this.sliding--;
    this.next[k] = now + this.restMs + this._wait();
    host.cellsChanged(ms, gs, gm, gt);
  }

  private _unextra(wIdx: number): void {
    const ex = this.ms.extraWalls;
    if (ex === undefined) return;
    const i = ex.indexOf(wIdx);
    if (i >= 0) ex.splice(i, 1);
  }

  settle(now: number, host: MMHost): void {
    for (let k = 0; k < this.n; k++) if (this.st[k] === 1) this._arrive(k, now, host);
  }

  moverOf(w: WallEntity): number {
    const ws = this.ms.walls;
    for (let k = 0; k < this.n; k++) if (ws[this.wi[k]] === w) return k;
    return -1;
  }

  release(k: number, host?: MMHost): void {
    if (this.st[k] === 2) return;
    const ms = this.ms;
    if (this.st[k] === 1) {
      const wIdx = this.wi[k], w = ms.walls[wIdx], s = this.at[k], m = this.mid[k], t = this.to[k];
      const gs = this.gridOf(s), gm = this.gridOf(m), gt = this.gridOf(t);
      this._unextra(wIdx);
      if (this.heldK[k] === 1) {
        if (w && w.active) { w.x = this.tx[k]; w.y = this.ty[k]; ms.wallGrid[gt] = wIdx; ms.tileGrid[gt] = TileType.WALL; }
        const held = ms.magicHeld!;
        held[gs]--; held[gm]--; held[gt]--;
      } else if (w && w.active) { w.x = this.tx[k]; w.y = this.ty[k]; }
      this.heldK[k] = 0;
      this.at[k] = t; this.sliding--;
      if (host) host.cellsChanged(ms, gs, gm, gt);
    }
    this.occ[this.at[k]] = -2;
    this.st[k] = 2;
  }

  reset(): void {
    const ms = this.ms, L = this.L, nx = L.nx, ny = L.ny;
    for (let k = 0; k < this.n; k++) {
      const w = ms.walls[this.wi[k]];
      this._unextra(this.wi[k]);
      if (w) { w.x = this.homeX[k]; w.y = this.homeY[k]; }
      this.at[k] = this.homeAt[k]; this.st[k] = 0;
    }
    for (let s = 0; s < nx * ny; s++) {
      const g = this.gridOf(s);
      ms.wallGrid[g] = this.gridSnap[s]; ms.tileGrid[g] = this.tileSnap[s];
    }
    if (ms.magicHeld) ms.magicHeld.fill(0);
    if (ms.extraWalls !== undefined && ms.extraWalls.length === 0) { delete ms.extraWalls; delete ms.extraOffX; delete ms.extraOffY; }
    this.sliding = 0;
  }

  isSliding(k: number): boolean { return this.st[k] === 1; }
  wallOf(k: number): WallEntity { return this.ms.walls[this.wi[k]]; }
  mine(k: number): boolean { return this.st[k] !== 2; }
  spotX(k: number): number { return this._cx(this.at[k]); }
  spotY(k: number): number { return this._cy(this.at[k]); }
  paintMask(skip: Uint8Array, tiles: Uint8Array): void {
    for (let k = 0; k < this.n; k++) {
      if (this.st[k] === 2) continue;
      const wIdx = this.wi[k];
      if (wIdx < skip.length) skip[wIdx] = 1;
      if (this.st[k] === 0) { const g = this.gridOf(this.at[k]); if (this.ms.wallGrid[g] === wIdx) tiles[g] = this.L.floor[this.at[k]]; }
    }
  }
  spotOwner(s: number): number { return this.occ[s]; }
}
