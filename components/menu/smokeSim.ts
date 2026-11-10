export const SMOKE_CELLS = 9600;
export const SMOKE_HZ = 40;
export const SMOKE_MARGIN_X = 6;
export const SMOKE_MARGIN_BOTTOM = 10;

const PRESSURE_SWEEPS = 10;
const SOR_OMEGA = 1.72;
const BUOYANCY = 95;
const SMOKE_WEIGHT = 2.2;
const VORTICITY = 6;
const VELOCITY_KEEP = 0.25;
const SMOKE_FADE = 0.065;
const SMOKE_CUT = 0.03;
const HEAT_FADE = 0.08;
const VISCOSITY = 1;
const TOP_FADE_BAND = 0.1;
const TOP_FADE = 1.2;

const PLUME_SPACING = 18;
const PLUME_RADIUS = 1.5;
const PLUME_SMOKE = 5.0;
const PLUME_HEAT = 4.5;
const PLUME_JET = 40;
const PLUME_SWAY = 8;
const DRAFT_WAVES = 3;
const DRAFT_FORCE = 0.8;
const STIR_FOLLOW = 0.42;
const STIR_MAX_SPEED = 70;
const STIR_SMOKE = 0.075;
const STIR_HEAT = 0.06;
const STIR_SPACING = 0.6;
const STIR_JUMP = 24;
const PUFF_POOL = 6;
const PUFF_LIFE = 0.55;
const PUFF_REACH = 9;
const PUFF_PUSH = 70;
const PUFF_SMOKE = 1.6;
const PUFF_THICK = 1.6;

function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smokeGridFor(aspect: number, cells: number = SMOKE_CELLS): { w: number; h: number } {
  const a = aspect > 0.2 ? (aspect < 5 ? aspect : 5) : 0.2;
  const vh = Math.max(20, Math.round(Math.sqrt(cells / a)));
  const vw = Math.max(20, Math.round(cells / vh));
  return { w: vw + 2 * SMOKE_MARGIN_X + 2, h: vh + SMOKE_MARGIN_BOTTOM + 2 };
}

export class SmokeSim {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  readonly d: Float32Array;
  readonly texels: Uint8Array;
  time = 0;
  readonly viewL: number;
  readonly viewR: number;
  readonly viewT: number;
  readonly viewB: number;

  private readonly u: Float32Array;
  private readonly v: Float32Array;
  private readonly u0: Float32Array;
  private readonly v0: Float32Array;
  private readonly d0: Float32Array;
  private readonly dHat: Float32Array;
  private readonly heat: Float32Array;
  private readonly heat0: Float32Array;
  private readonly p: Float32Array;
  private readonly div: Float32Array;
  private readonly curl: Float32Array;
  private readonly plumeCount: number;
  private readonly plumeBase: Float32Array;
  private readonly plumePhase: Float32Array;
  private readonly plumeRate: Float32Array;
  private readonly draftKx = new Float32Array(DRAFT_WAVES);
  private readonly draftKy = new Float32Array(DRAFT_WAVES);
  private readonly draftW = new Float32Array(DRAFT_WAVES);
  private readonly draftPhase = new Float32Array(DRAFT_WAVES);
  private readonly draftCosX: Float32Array;
  private readonly draftSinX: Float32Array;
  private readonly draftCosY: Float32Array;
  private readonly draftSinY: Float32Array;
  private readonly draftFu = new Float32Array(DRAFT_WAVES);
  private readonly draftFv = new Float32Array(DRAFT_WAVES);

  private ptrActive = false;
  private ptrHasPrev = false;
  private ptrX = 0;
  private ptrY = 0;
  private ptrPrevX = 0;
  private ptrPrevY = 0;
  private ptrRadius = 2;
  private ptrBoost = 0;

  private readonly puffX = new Float32Array(PUFF_POOL);
  private readonly puffY = new Float32Array(PUFF_POOL);
  private readonly puffT = new Float32Array(PUFF_POOL).fill(-1);
  private readonly puffSeed = new Float32Array(PUFF_POOL);
  private puffNext = 0;

  constructor(w: number, h: number, seed: number) {
    this.w = w;
    this.h = h;
    this.n = w * h;
    const n = this.n;
    this.viewL = 0.5 + SMOKE_MARGIN_X;
    this.viewR = w - 1.5 - SMOKE_MARGIN_X;
    this.viewT = 0.5;
    this.viewB = h - 1.5 - SMOKE_MARGIN_BOTTOM;
    this.d = new Float32Array(n);
    this.d0 = new Float32Array(n);
    this.dHat = new Float32Array(n);
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u0 = new Float32Array(n);
    this.v0 = new Float32Array(n);
    this.heat = new Float32Array(n);
    this.heat0 = new Float32Array(n);
    this.p = new Float32Array(n);
    this.div = new Float32Array(n);
    this.curl = new Float32Array(n);
    this.texels = new Uint8Array(n * 4);
    const rnd = makeRandom(seed);
    this.plumeCount = Math.max(2, Math.min(6, Math.round((this.viewR - this.viewL) / PLUME_SPACING)));
    this.plumeBase = new Float32Array(this.plumeCount);
    this.plumePhase = new Float32Array(this.plumeCount * 4);
    this.plumeRate = new Float32Array(this.plumeCount * 4);
    for (let k = 0; k < this.plumeCount; k++) {
      this.plumeBase[k] = (k + 0.5 + (rnd() - 0.5) * 0.3) / this.plumeCount;
      for (let j = 0; j < 4; j++) {
        this.plumePhase[k * 4 + j] = rnd() * Math.PI * 2;
        this.plumeRate[k * 4 + j] = 0.6 + rnd() * 0.8;
      }
    }
    this.draftCosX = new Float32Array(DRAFT_WAVES * w);
    this.draftSinX = new Float32Array(DRAFT_WAVES * w);
    this.draftCosY = new Float32Array(DRAFT_WAVES * h);
    this.draftSinY = new Float32Array(DRAFT_WAVES * h);
    for (let k = 0; k < DRAFT_WAVES; k++) {
      const len = h * (0.7 + 0.8 * rnd());
      const dir = rnd() * Math.PI * 2;
      const kk = (Math.PI * 2) / len;
      this.draftKx[k] = kk * Math.cos(dir);
      this.draftKy[k] = kk * Math.sin(dir);
      this.draftW[k] = (Math.PI * 2) / (28 + 34 * rnd());
      this.draftPhase[k] = rnd() * Math.PI * 2;
      for (let x = 0; x < w; x++) {
        this.draftCosX[k * w + x] = Math.cos(this.draftKx[k] * x);
        this.draftSinX[k * w + x] = Math.sin(this.draftKx[k] * x);
      }
    }
    this.time = rnd() * 100;
  }

  resampleFrom(old: SmokeSim): void {
    this.time = old.time;
    const ow = old.w;
    const oh = old.h;
    const sx = (old.viewR - old.viewL) / (this.viewR - this.viewL);
    const sy = (old.viewB - old.viewT) / (this.viewB - this.viewT);
    for (let y = 0; y < this.h; y++) {
      let py = old.viewT + (y - this.viewT) * sy;
      if (py < 0) py = 0; else if (py > oh - 1.001) py = oh - 1.001;
      const y0 = py | 0;
      const fy = py - y0;
      for (let x = 0; x < this.w; x++) {
        let px = old.viewL + (x - this.viewL) * sx;
        if (px < 0) px = 0; else if (px > ow - 1.001) px = ow - 1.001;
        const x0 = px | 0;
        const fx = px - x0;
        const j = x0 + y0 * ow;
        const i = x + y * this.w;
        this.d[i] = bilerp(old.d, j, ow, fx, fy);
        this.heat[i] = bilerp(old.heat, j, ow, fx, fy);
        this.u[i] = bilerp(old.u, j, ow, fx, fy) / sx;
        this.v[i] = bilerp(old.v, j, ow, fx, fy) / sy;
      }
    }
    this.encode(true);
  }

  cellX(fx: number): number { return this.viewL + fx * (this.viewR - this.viewL); }
  cellY(fy: number): number { return this.viewT + fy * (this.viewB - this.viewT); }

  setPointer(active: boolean, x: number, y: number, radius: number, boost: number): void {
    if (!active) { this.ptrActive = false; this.ptrHasPrev = false; return; }
    if (!this.ptrActive) { this.ptrHasPrev = false; }
    this.ptrActive = true;
    this.ptrX = x;
    this.ptrY = y;
    this.ptrRadius = radius;
    this.ptrBoost = boost;
  }

  puff(x: number, y: number, seed: number): void {
    const k = this.puffNext;
    this.puffNext = (k + 1) % PUFF_POOL;
    this.puffX[k] = x;
    this.puffY[k] = y;
    this.puffT[k] = this.time;
    this.puffSeed[k] = seed;
  }

  step(dt: number): void {
    const { u, v, u0, v0 } = this;
    this.time += dt;
    u0.set(u);
    v0.set(v);
    this.advectVelocity(dt);
    this.smoothVel(dt);
    this.addPlumes(dt);
    this.addDraft(dt);
    this.addPointer(dt);
    this.addPuffs(dt);
    this.addBuoyancyAndCurl(dt);
    this.project();
    this.d0.set(this.d);
    this.heat0.set(this.heat);
    this.advectScalars(dt);
    this.fade(dt);
    this.encode(false);
  }

  private addPlumes(dt: number): void {
    const { time } = this;
    const sy = this.viewB + SMOKE_MARGIN_BOTTOM * 0.6;
    for (let k = 0; k < this.plumeCount; k++) {
      const ph = this.plumePhase;
      const rt = this.plumeRate;
      const q = k * 4;
      const drift = 0.04 * Math.sin(time * 0.045 * rt[q] + ph[q]) + 0.02 * Math.sin(time * 0.13 * rt[q + 1] + ph[q + 1]);
      const sx = this.cellX(this.plumeBase[k] + drift);
      const b1 = 0.5 + 0.5 * Math.sin(time * 0.11 * rt[q + 2] + ph[q + 2]);
      const breath = 0.55 + 0.45 * b1;
      const sway = Math.sin(time * 1.1 * rt[q + 3] + ph[q + 3]) + 0.5 * Math.sin(time * 2.7 * rt[q] + ph[q + 1]);
      this.splat(sx, sy, PLUME_RADIUS, PLUME_SWAY * sway * dt, -PLUME_JET * breath * dt,
        PLUME_SMOKE * breath * dt, PLUME_HEAT * breath * dt);
    }
  }

  private addDraft(dt: number): void {
    const { w, h, u, v, time, draftCosY, draftSinY, draftFu, draftFv } = this;
    const gust = 0.65 + 0.35 * Math.sin(time * 0.021 + this.draftPhase[0]);
    for (let k = 0; k < DRAFT_WAVES; k++) {
      const kx = this.draftKx[k];
      const ky = this.draftKy[k];
      const kk = Math.sqrt(kx * kx + ky * ky);
      draftFu[k] = (DRAFT_FORCE * gust * dt * ky) / kk;
      draftFv[k] = (-DRAFT_FORCE * gust * dt * kx) / kk;
      const ph = this.draftW[k] * time + this.draftPhase[k];
      for (let y = 0; y < h; y++) {
        draftCosY[k * h + y] = Math.cos(ky * y + ph);
        draftSinY[k * h + y] = Math.sin(ky * y + ph);
      }
    }
    const cx = this.draftCosX;
    const sx = this.draftSinX;
    const fu0 = draftFu[0], fu1 = draftFu[1], fu2 = draftFu[2];
    const fv0 = draftFv[0], fv1 = draftFv[1], fv2 = draftFv[2];
    for (let y = 1; y < h - 1; y++) {
      const c0 = draftCosY[y], s0 = draftSinY[y];
      const c1 = draftCosY[h + y], s1 = draftSinY[h + y];
      const c2 = draftCosY[2 * h + y], s2 = draftSinY[2 * h + y];
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        const a0 = cx[x] * c0 - sx[x] * s0;
        const a1 = cx[w + x] * c1 - sx[w + x] * s1;
        const a2 = cx[2 * w + x] * c2 - sx[2 * w + x] * s2;
        u[i] += fu0 * a0 + fu1 * a1 + fu2 * a2;
        v[i] += fv0 * a0 + fv1 * a1 + fv2 * a2;
      }
    }
  }

  private addPointer(dt: number): void {
    if (!this.ptrActive) return;
    const x1 = this.ptrX;
    const y1 = this.ptrY;
    if (!this.ptrHasPrev) {
      this.ptrHasPrev = true;
      this.ptrPrevX = x1;
      this.ptrPrevY = y1;
      return;
    }
    const x0 = this.ptrPrevX;
    const y0 = this.ptrPrevY;
    this.ptrPrevX = x1;
    this.ptrPrevY = y1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-4 || dist > STIR_JUMP) return;
    let vx = dx / dt;
    let vy = dy / dt;
    const sp = dist / dt;
    if (sp > STIR_MAX_SPEED) { const k = STIR_MAX_SPEED / sp; vx *= k; vy *= k; }
    const boost = this.ptrBoost * (sp < 40 ? sp / 40 : 1);
    const r = this.ptrRadius * (1 + boost);
    const travel = dist < 6 ? dist : 6;
    const stamps = Math.max(1, Math.min(32, Math.ceil(dist / STIR_SPACING)));
    const smoke = (STIR_SMOKE * (1 + 1.5 * boost) * travel) / stamps;
    const heat = (STIR_HEAT * travel) / stamps;
    for (let s = 1; s <= stamps; s++) {
      const f = s / stamps;
      this.stir(x0 + dx * f, y0 + dy * f, r, vx, vy, STIR_FOLLOW / Math.sqrt(stamps), smoke, heat);
    }
  }

  private addPuffs(dt: number): void {
    const { w, h, u, v, d } = this;
    for (let k = 0; k < PUFF_POOL; k++) {
      const t0 = this.puffT[k];
      if (t0 < 0) continue;
      const age = this.time - t0;
      if (age > PUFF_LIFE) { this.puffT[k] = -1; continue; }
      const prog = age / PUFF_LIFE;
      const left = 1 - prog;
      const eased = 1 - left * left * left;
      const radius = 0.6 + eased * PUFF_REACH;
      const cx = this.puffX[k];
      const cy = this.puffY[k];
      const seed = this.puffSeed[k];
      const reach = radius + PUFF_THICK * 2.5;
      const x0 = Math.max(1, Math.floor(cx - reach));
      const x1 = Math.min(w - 2, Math.ceil(cx + reach));
      const y0 = Math.max(1, Math.floor(cy - reach));
      const y1 = Math.min(h - 2, Math.ceil(cy + reach));
      const push = PUFF_PUSH * left * left * dt;
      const smoke = PUFF_SMOKE * left * dt / PUFF_LIFE;
      const invT = 1 / (PUFF_THICK * PUFF_THICK);
      for (let y = y0; y <= y1; y++) {
        const ry = y - cy;
        for (let x = x0; x <= x1; x++) {
          const rx = x - cx;
          const dist = Math.sqrt(rx * rx + ry * ry);
          if (dist < 1e-3) continue;
          const ang = Math.atan2(ry, rx);
          const wave = 1 + 0.18 * Math.sin(5 * ang + seed) + 0.1 * Math.sin(9 * ang - seed * 1.7);
          const off = dist - radius * wave;
          const g = Math.exp(-off * off * invT);
          if (g < 0.01) continue;
          const i = x + y * w;
          const inv = 1 / dist;
          u[i] += rx * inv * push * g;
          v[i] += ry * inv * push * g;
          d[i] += smoke * g * wave;
        }
      }
    }
  }

  private splat(cx: number, cy: number, r: number, du: number, dv: number, dd: number, dh: number): void {
    const { w, h, u, v, d, heat } = this;
    const reach = r * 2.6;
    const x0 = Math.max(1, Math.floor(cx - reach));
    const x1 = Math.min(w - 2, Math.ceil(cx + reach));
    const y0 = Math.max(1, Math.floor(cy - reach));
    const y1 = Math.min(h - 2, Math.ceil(cy + reach));
    const inv = 1 / (r * r);
    for (let y = y0; y <= y1; y++) {
      const ry = y - cy;
      for (let x = x0; x <= x1; x++) {
        const rx = x - cx;
        const g = Math.exp(-(rx * rx + ry * ry) * inv);
        const i = x + y * w;
        u[i] += du * g;
        v[i] += dv * g;
        d[i] += dd * g;
        heat[i] += dh * g;
      }
    }
  }

  private stir(cx: number, cy: number, r: number, vx: number, vy: number, follow: number, dd: number, dh: number): void {
    const { w, h, u, v, d, heat } = this;
    const reach = r * 2.4;
    const x0 = Math.max(1, Math.floor(cx - reach));
    const x1 = Math.min(w - 2, Math.ceil(cx + reach));
    const y0 = Math.max(1, Math.floor(cy - reach));
    const y1 = Math.min(h - 2, Math.ceil(cy + reach));
    const inv = 1 / (r * r);
    for (let y = y0; y <= y1; y++) {
      const ry = y - cy;
      for (let x = x0; x <= x1; x++) {
        const rx = x - cx;
        const g = Math.exp(-(rx * rx + ry * ry) * inv);
        const i = x + y * w;
        const k = follow * g;
        u[i] += (vx - u[i]) * k;
        v[i] += (vy - v[i]) * k;
        d[i] += dd * g;
        heat[i] += dh * g;
      }
    }
  }

  private addBuoyancyAndCurl(dt: number): void {
    const { w, h, u, v, d, heat, curl } = this;
    for (let y = 1; y < h - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        curl[i] = 0.25 * ((v[i + 1 - w] + v[i + 1] - v[i - 1 - w] - v[i - 1]) - (u[i + w - 1] + u[i + w] - u[i - w - 1] - u[i - w]));
      }
    }
    const eps = VORTICITY * dt;
    for (let y = 2; y < h - 2; y++) {
      let i = y * w + 2;
      for (let x = 2; x < w - 2; x++, i++) {
        const c = curl[i];
        const cr = curl[i + 1], cl = curl[i - 1], cd = curl[i + w], cu = curl[i - w];
        const gx = 0.5 * ((cr < 0 ? -cr : cr) - (cl < 0 ? -cl : cl));
        const gy = 0.5 * ((cd < 0 ? -cd : cd) - (cu < 0 ? -cu : cu));
        const k = (eps * c) / (Math.sqrt(gx * gx + gy * gy) + 1e-5);
        const fx = 0.5 * gy * k;
        const fy = 0.5 * (-gx * k + dt * (SMOKE_WEIGHT * d[i] - BUOYANCY * heat[i]));
        u[i - 1] += fx;
        u[i] += fx;
        v[i - w] += fy;
        v[i] += fy;
      }
    }
  }

  private smoothVel(dt: number): void {
    const { w, h, u, v, u0, v0 } = this;
    const k = 1 - Math.exp(-VISCOSITY * dt);
    u0.set(u);
    v0.set(v);
    for (let y = 1; y < h - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 2; x++, i++) {
        u[i] += k * ((u0[i - 1] + u0[i + 1] + u0[i - w] + u0[i + w]) * 0.25 - u0[i]);
      }
    }
    for (let y = 1; y < h - 2; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        v[i] += k * ((v0[i - 1] + v0[i + 1] + v0[i - w] + v0[i + w]) * 0.25 - v0[i]);
      }
    }
    this.boundVel();
  }

  private project(): void {
    const { w, h, u, v, p, div } = this;
    this.boundVel();
    for (let y = 1; y < h - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        div[i] = -(u[i] - u[i - 1] + v[i] - v[i - w]);
      }
    }
    for (let it = 0; it < PRESSURE_SWEEPS; it++) {
      for (let color = 0; color < 2; color++) {
        for (let y = 1; y < h - 1; y++) {
          const row = y * w;
          for (let x = 1 + ((y + color) & 1); x < w - 1; x += 2) {
            const i = row + x;
            const gs = (div[i] + p[i - 1] + p[i + 1] + p[i - w] + p[i + w]) * 0.25;
            p[i] += SOR_OMEGA * (gs - p[i]);
          }
        }
      }
      this.boundPressure();
    }
    for (let y = 1; y < h - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 2; x++, i++) u[i] -= p[i + 1] - p[i];
    }
    for (let y = 0; y < h - 2; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) v[i] -= p[i + w] - p[i];
    }
    this.boundVel();
  }

  private advectVelocity(dt: number): void {
    const { w, h, u, v, u0, v0 } = this;
    const maxFace = w - 2.001;
    const maxRowU = h - 2.001;
    for (let y = 1; y < h - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 2; x++, i++) {
        const vu = 0.25 * (v0[i - w] + v0[i - w + 1] + v0[i] + v0[i + 1]);
        let px = x - dt * u0[i];
        let py = y - dt * vu;
        if (px < 0) px = 0; else if (px > maxFace) px = maxFace;
        if (py < 1) py = 1; else if (py > maxRowU) py = maxRowU;
        const x0 = px | 0;
        const y0 = py | 0;
        const fx = px - x0;
        const fy = py - y0;
        const j = x0 + y0 * w;
        const a = u0[j], b = u0[j + 1], c = u0[j + w], e = u0[j + w + 1];
        const top = a + (b - a) * fx;
        u[i] = top + (c + (e - c) * fx - top) * fy;
      }
    }
    const maxColV = w - 2.001;
    const maxRowV = h - 2.001;
    for (let y = 0; y < h - 2; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        const uv = 0.25 * (u0[i - 1] + u0[i] + u0[i - 1 + w] + u0[i + w]);
        let px = x - dt * uv;
        let py = y - dt * v0[i];
        if (px < 1) px = 1; else if (px > maxColV) px = maxColV;
        if (py < 0) py = 0; else if (py > maxRowV) py = maxRowV;
        const x0 = px | 0;
        const y0 = py | 0;
        const fx = px - x0;
        const fy = py - y0;
        const j = x0 + y0 * w;
        const a = v0[j], b = v0[j + 1], c = v0[j + w], e = v0[j + w + 1];
        const top = a + (b - a) * fx;
        v[i] = top + (c + (e - c) * fx - top) * fy;
      }
    }
    this.boundVel();
  }

  private advectScalars(dt: number): void {
    const { w, h, u, v, d, d0, dHat, heat, heat0 } = this;
    const lo = this.div;
    const hi = this.curl;
    const maxX = w - 1.501;
    const maxY = h - 1.501;
    for (let y = 1; y < h - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        let px = x - dt * 0.5 * (u[i - 1] + u[i]);
        let py = y - dt * 0.5 * (v[i - w] + v[i]);
        if (px < 0.5) px = 0.5; else if (px > maxX) px = maxX;
        if (py < 0.5) py = 0.5; else if (py > maxY) py = maxY;
        const x0 = px | 0;
        const y0 = py | 0;
        const fx = px - x0;
        const fy = py - y0;
        const j = x0 + y0 * w;
        let a = d0[j], b = d0[j + 1], c = d0[j + w], e = d0[j + w + 1];
        let top = a + (b - a) * fx;
        dHat[i] = top + (c + (e - c) * fx - top) * fy;
        lo[i] = Math.min(a, b, c, e);
        hi[i] = Math.max(a, b, c, e);
        a = heat0[j]; b = heat0[j + 1]; c = heat0[j + w]; e = heat0[j + w + 1];
        top = a + (b - a) * fx;
        heat[i] = top + (c + (e - c) * fx - top) * fy;
      }
    }
    this.boundScalar(dHat);
    for (let y = 1; y < h - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        let qx = x + dt * 0.5 * (u[i - 1] + u[i]);
        let qy = y + dt * 0.5 * (v[i - w] + v[i]);
        if (qx < 0.5) qx = 0.5; else if (qx > maxX) qx = maxX;
        if (qy < 0.5) qy = 0.5; else if (qy > maxY) qy = maxY;
        const x0 = qx | 0;
        const y0 = qy | 0;
        const fx = qx - x0;
        const fy = qy - y0;
        const j = x0 + y0 * w;
        const a = dHat[j], b = dHat[j + 1], c = dHat[j + w], e = dHat[j + w + 1];
        const top = a + (b - a) * fx;
        const back = top + (c + (e - c) * fx - top) * fy;
        const r = dHat[i] + 0.5 * (d0[i] - back);
        const mn = lo[i];
        const mx = hi[i];
        d[i] = r < mn ? mn : r > mx ? mx : r;
      }
    }
    this.boundScalar(d);
    this.boundScalar(heat);
  }

  private fade(dt: number): void {
    const { w, h, u, v, d, heat, n } = this;
    const kd = Math.exp(-SMOKE_FADE * dt);
    const kh = Math.exp(-HEAT_FADE * dt);
    const kv = Math.exp(-VELOCITY_KEEP * dt);
    const cut = SMOKE_CUT * dt;
    for (let i = 0; i < n; i++) {
      const dv = d[i] * kd - cut;
      d[i] = dv > 0 ? dv : 0;
      heat[i] *= kh;
      u[i] *= kv;
      v[i] *= kv;
    }
    const band = Math.max(2, Math.round(h * TOP_FADE_BAND));
    for (let y = 1; y < band; y++) {
      const q = (band - y) / band;
      const k = Math.exp(-TOP_FADE * dt * q * q * 4);
      let i = y * w;
      for (let x = 0; x < w; x++, i++) d[i] *= k;
    }
  }

  private encode(both: boolean): void {
    const { d, texels, n } = this;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const dv = d[i];
      const c = dv > 0 ? Math.sqrt(1 - Math.exp(-dv)) : 0;
      const q = (c * 255 + 0.5) | 0;
      texels[j + 1] = both ? q : texels[j];
      texels[j] = q;
    }
  }

  private boundVel(): void {
    const { w, h, u, v } = this;
    for (let y = 0; y < h; y++) {
      const r = y * w;
      u[r] = 0;
      u[r + w - 2] = 0;
      u[r + w - 1] = 0;
      v[r] = v[r + 1];
      v[r + w - 1] = v[r + w - 2];
    }
    const bot = (h - 1) * w;
    for (let x = 0; x < w; x++) {
      u[x] = u[x + w];
      u[bot + x] = u[bot - w + x];
      v[bot - w + x] = 0;
      v[bot + x] = 0;
    }
  }

  private boundScalar(s: Float32Array): void {
    const { w, h } = this;
    for (let y = 1; y < h - 1; y++) {
      const r = y * w;
      s[r] = s[r + 1];
      s[r + w - 1] = s[r + w - 2];
    }
    const bot = (h - 1) * w;
    for (let x = 0; x < w; x++) {
      s[x] = 0;
      s[bot + x] = s[bot - w + x];
    }
  }

  private boundPressure(): void {
    const { w, h, p } = this;
    for (let y = 1; y < h - 1; y++) {
      const r = y * w;
      p[r] = p[r + 1];
      p[r + w - 1] = p[r + w - 2];
    }
    const bot = (h - 1) * w;
    for (let x = 0; x < w; x++) {
      p[x] = 0;
      p[bot + x] = p[bot - w + x];
    }
  }
}

function bilerp(s: Float32Array, j: number, w: number, fx: number, fy: number): number {
  const a = s[j], b = s[j + 1], c = s[j + w], e = s[j + w + 1];
  const top = a + (b - a) * fx;
  return top + (c + (e - c) * fx - top) * fy;
}
