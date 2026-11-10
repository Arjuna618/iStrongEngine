import React, { useEffect, useRef } from 'react';
import { getEffectiveDPR } from '../../utils/zoomCompensation';
import { SmokeSim, smokeGridFor, SMOKE_CELLS, SMOKE_HZ } from './smokeSim';

const ROWS_TARGET = 90;
const CELL_MIN_CSS = 9;
const CELL_MAX_CSS = 16;
const CELL_ASPECT = 0.6;
const FONT_FILL = 0.74;
const FONT = '"JetBrains Mono", Consolas, ui-monospace, monospace';
const MAX_DPR = 2;

const RAMP = ['.', ':', ';', '+', '*', '%', '#', '@'] as const;
const EDGES = ['-', '\\', '|', '/'] as const;

const LIGHT_INK = [0x0a / 255, 0x0a / 255, 0x0a / 255] as const;
const DARK_INK = [0xfa / 255, 0xfa / 255, 0xfa / 255] as const;
const LIGHT_ALPHA: readonly [number, number] = [0.037, 0.443];
const DARK_ALPHA: readonly [number, number] = [0.045, 0.59];
const COVER_MIN = 0.035;
const WHITE = 0.6;
const TONE_GAMMA = 1.0;
const EDGE_GRAD = 0.3;
const DETAIL = 0.8;
const STEP = 1 / SMOKE_HZ;
const MAX_STEPS_PER_FRAME = 3;
const WARM_SECONDS = 6;
const WARM_BUDGET_MS = 3;
const FALLBACK_INTERVAL_MS = 1000 / 30;

const STIR_RADIUS_CSS = 34;
const STIR_RADIUS_MIN = 1.8;
const DRAG_THRESHOLD = 6;
const GRID_TIERS = [1, 0.62, 0.4] as const;
const DEGRADE_STEP_MS = 3;
const DEGRADE_GRACE_STEPS = SMOKE_HZ * 3;

const VERT = `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uField;
uniform sampler2D uAtlas;
uniform vec2 uView;
uniform vec2 uOrigin;
uniform vec2 uCell;
uniform vec2 uGrid;
uniform vec2 uFieldA;
uniform vec2 uFieldB;
uniform vec2 uAtlasInv;
uniform float uMix;
uniform vec3 uInk;
uniform vec4 uTone;
#define RAMP_N ${RAMP.length}.0
#define DETAIL ${DETAIL.toFixed(3)}
#define TONE_GAMMA ${TONE_GAMMA.toFixed(3)}
#define WHITE ${WHITE.toFixed(3)}
float cov(vec2 uv) { vec2 s = texture2D(uField, uv).rg; return mix(s.g * s.g, s.r * s.r, uMix); }
float ink(float slot, vec2 local) { return texture2D(uAtlas, (vec2(slot * uCell.x, 0.0) + local + 0.5) * uAtlasInv).a; }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y) - uOrigin;
  vec2 cell = floor(p / uCell);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) discard;
  vec2 local = clamp(floor(p - cell * uCell), vec2(0.0), uCell - 1.0);
  vec2 uv = (uOrigin + (cell + 0.5) * uCell) * uFieldA + uFieldB;
  float c = cov(uv);
  if (c < uTone.x) discard;
  vec2 st = uCell * uFieldA;
  float cr = cov(uv + vec2(st.x, 0.0));
  float cl = cov(uv - vec2(st.x, 0.0));
  float cd = cov(uv + vec2(0.0, st.y));
  float cu = cov(uv - vec2(0.0, st.y));
  float cs = c + DETAIL * (c - 0.25 * (cr + cl + cd + cu));
  float span = 1.0 / (WHITE - uTone.x);
  float lv = pow(clamp((cs - uTone.x) * span, 0.0, 1.0), TONE_GAMMA);
  float g = lv * (RAMP_N - 0.001);
  float k = floor(g);
  float body = mix(ink(k, local), ink(min(k + 1.0, RAMP_N - 1.0), local), smoothstep(0.6, 1.0, g - k));
  float gx = (cr - cl) * span;
  float gy = (cd - cu) * span;
  float edge = smoothstep(uTone.w, uTone.w * 2.0, length(vec2(gx, gy))) * (1.0 - smoothstep(0.15, 0.35, lv));
  float glyph = body;
  if (edge > 0.0) {
    float ang = atan(gx, -gy);
    if (ang < 0.0) ang += 3.14159265;
    float o = ang * 1.27323954 + 0.5;
    float oi = mod(floor(o), 4.0);
    float stroke = mix(ink(RAMP_N + oi, local), ink(RAMP_N + mod(oi + 1.0, 4.0), local), smoothstep(0.75, 1.0, fract(o)));
    glyph = mix(body, stroke, edge);
  }
  float a = mix(uTone.y, uTone.z, lv) * glyph * smoothstep(0.0, 0.12, lv);
  gl_FragColor = vec4(uInk * a, a);
}`;

class GlPainter {
  private readonly gl: WebGLRenderingContext;
  private prog: WebGLProgram | null = null;
  private fieldTex: WebGLTexture | null = null;
  private atlasTex: WebGLTexture | null = null;
  private fieldW = 0;
  private fieldH = 0;
  private uView: WebGLUniformLocation | null = null;
  private uOrigin: WebGLUniformLocation | null = null;
  private uCell: WebGLUniformLocation | null = null;
  private uGrid: WebGLUniformLocation | null = null;
  private uFieldA: WebGLUniformLocation | null = null;
  private uFieldB: WebGLUniformLocation | null = null;
  private uAtlasInv: WebGLUniformLocation | null = null;
  private uMix: WebGLUniformLocation | null = null;
  private uInk: WebGLUniformLocation | null = null;
  private uTone: WebGLUniformLocation | null = null;
  ok = false;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.init();
  }

  init(): void {
    const gl = this.gl;
    this.ok = false;
    this.fieldW = 0;
    this.fieldH = 0;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('AsciiFluidBackground: link failed', gl.getProgramInfoLog(prog));
      return;
    }
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.uView = gl.getUniformLocation(prog, 'uView');
    this.uOrigin = gl.getUniformLocation(prog, 'uOrigin');
    this.uCell = gl.getUniformLocation(prog, 'uCell');
    this.uGrid = gl.getUniformLocation(prog, 'uGrid');
    this.uFieldA = gl.getUniformLocation(prog, 'uFieldA');
    this.uFieldB = gl.getUniformLocation(prog, 'uFieldB');
    this.uAtlasInv = gl.getUniformLocation(prog, 'uAtlasInv');
    this.uMix = gl.getUniformLocation(prog, 'uMix');
    this.uInk = gl.getUniformLocation(prog, 'uInk');
    this.uTone = gl.getUniformLocation(prog, 'uTone');
    gl.uniform1i(gl.getUniformLocation(prog, 'uField'), 0);
    gl.uniform1i(gl.getUniformLocation(prog, 'uAtlas'), 1);
    this.fieldTex = makeTexture(gl, 0, gl.LINEAR);
    this.atlasTex = makeTexture(gl, 1, gl.NEAREST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    this.ok = true;
  }

  setAtlas(atlas: HTMLCanvasElement): void {
    if (!this.ok) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  }

  setField(sim: SmokeSim): void {
    if (!this.ok) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    if (sim.w !== this.fieldW || sim.h !== this.fieldH) {
      this.fieldW = sim.w;
      this.fieldH = sim.h;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sim.w, sim.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, sim.texels);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sim.w, sim.h, gl.RGBA, gl.UNSIGNED_BYTE, sim.texels);
    }
  }

  draw(v: SmokeView, sim: SmokeSim, mix: number): void {
    const gl = this.gl;
    gl.viewport(0, 0, v.pxW, v.pxH);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.ok || this.fieldW === 0) return;
    const ink = v.dark ? DARK_INK : LIGHT_INK;
    const alpha = v.dark ? DARK_ALPHA : LIGHT_ALPHA;
    const fw = this.fieldW;
    const fh = this.fieldH;
    gl.uniform2f(this.uView, v.pxW, v.pxH);
    gl.uniform2f(this.uOrigin, v.originX, v.originY);
    gl.uniform2f(this.uCell, v.cellW, v.cellH);
    gl.uniform2f(this.uGrid, v.cols, v.rows);
    gl.uniform2f(this.uFieldA, (sim.viewR - sim.viewL) / (fw * v.pxW), (sim.viewB - sim.viewT) / (fh * v.pxH));
    gl.uniform2f(this.uFieldB, (sim.viewL + 0.5) / fw, (sim.viewT + 0.5) / fh);
    gl.uniform2f(this.uAtlasInv, 1 / v.atlasW, 1 / v.atlasH);
    gl.uniform1f(this.uMix, mix);
    gl.uniform3f(this.uInk, ink[0], ink[1], ink[2]);
    gl.uniform4f(this.uTone, COVER_MIN, alpha[0], alpha[1], EDGE_GRAD);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    if (!gl.isContextLost()) console.error('AsciiFluidBackground: shader failed', gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

function makeTexture(gl: WebGLRenderingContext, unit: number, filter: number): WebGLTexture | null {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

const FALLBACK_TIERS = 6;

class CanvasPainter {
  private readonly ctx: CanvasRenderingContext2D;
  private atlas: HTMLCanvasElement | null = null;
  private tableCols = 0;
  private tableRows = 0;
  private tableSim: SmokeSim | null = null;
  private colJ = new Int32Array(0);
  private colF = new Float32Array(0);
  private rowJ = new Int32Array(0);
  private rowF = new Float32Array(0);
  private atlasDark = false;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  private buildAtlas(v: SmokeView): void {
    const cols = RAMP.length * FALLBACK_TIERS;
    const atlas = this.atlas ?? document.createElement('canvas');
    atlas.width = v.cellW * cols;
    atlas.height = v.cellH;
    const ctx = atlas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, atlas.width, atlas.height);
    const ink = v.dark ? DARK_INK : LIGHT_INK;
    const alpha = v.dark ? DARK_ALPHA : LIGHT_ALPHA;
    ctx.fillStyle = `rgb(${Math.round(ink[0] * 255)}, ${Math.round(ink[1] * 255)}, ${Math.round(ink[2] * 255)})`;
    ctx.font = `${Math.round(v.cellH * FONT_FILL)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let c = 0; c < cols; c++) {
      const lv = (c + 0.5) / cols;
      ctx.globalAlpha = alpha[0] + (alpha[1] - alpha[0]) * lv;
      ctx.fillText(RAMP[Math.floor(c / FALLBACK_TIERS)], c * v.cellW + v.cellW * 0.5, v.cellH * 0.52);
    }
    ctx.globalAlpha = 1;
    this.atlas = atlas;
    this.atlasDark = v.dark;
  }

  rebuild(v: SmokeView): void {
    this.buildAtlas(v);
    this.tableCols = 0;
  }

  draw(v: SmokeView, sim: SmokeSim, mix: number): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, v.pxW, v.pxH);
    if (!this.atlas || this.atlasDark !== v.dark) this.buildAtlas(v);
    const atlas = this.atlas;
    if (!atlas) return;
    const { cols, rows, cellW, cellH, originX, originY } = v;
    const fw = sim.w;
    if (this.tableCols !== cols || this.tableRows !== rows || this.tableSim !== sim) {
      this.colJ = new Int32Array(cols);
      this.colF = new Float32Array(cols);
      this.rowJ = new Int32Array(rows);
      this.rowF = new Float32Array(rows);
      for (let x = 0; x < cols; x++) {
        const s = sim.cellX((originX + (x + 0.5) * cellW) / v.pxW);
        const j = Math.min(fw - 2, Math.max(0, Math.floor(s)));
        this.colJ[x] = j;
        this.colF[x] = Math.min(1, Math.max(0, s - j));
      }
      for (let y = 0; y < rows; y++) {
        const s = sim.cellY((originY + (y + 0.5) * cellH) / v.pxH);
        const j = Math.min(sim.h - 2, Math.max(0, Math.floor(s)));
        this.rowJ[y] = j;
        this.rowF[y] = Math.min(1, Math.max(0, s - j));
      }
      this.tableCols = cols;
      this.tableRows = rows;
      this.tableSim = sim;
    }
    const tx = sim.texels;
    const tiers = RAMP.length * FALLBACK_TIERS;
    const inv = 1 / (255 * 255);
    for (let y = 0; y < rows; y++) {
      const r0 = this.rowJ[y] * fw;
      const fy = this.rowF[y];
      const dy = originY + y * cellH;
      for (let x = 0; x < cols; x++) {
        const j = (r0 + this.colJ[x]) * 4;
        const fx = this.colF[x];
        const jr = j + 4;
        const jd = j + fw * 4;
        const je = jd + 4;
        const cNow = lerp2(tx[j] * tx[j], tx[jr] * tx[jr], tx[jd] * tx[jd], tx[je] * tx[je], fx, fy);
        const cOld = lerp2(tx[j + 1] * tx[j + 1], tx[jr + 1] * tx[jr + 1], tx[jd + 1] * tx[jd + 1], tx[je + 1] * tx[je + 1], fx, fy);
        const c = (cOld + (cNow - cOld) * mix) * inv;
        if (c < COVER_MIN) continue;
        let col = (((c - COVER_MIN) / (1 - COVER_MIN)) * tiers) | 0;
        if (col >= tiers) col = tiers - 1;
        ctx.drawImage(atlas, col * cellW, 0, cellW, cellH, originX + x * cellW, dy, cellW, cellH);
      }
    }
  }
}

function lerp2(a: number, b: number, c: number, e: number, fx: number, fy: number): number {
  const top = a + (b - a) * fx;
  return top + (c + (e - c) * fx - top) * fy;
}

class SmokeView {
  canvas: HTMLCanvasElement;
  private gl: GlPainter | null = null;
  private cpu: CanvasPainter | null = null;
  private sim: SmokeSim | null = null;
  private host: HTMLElement | null = null;
  private abort: AbortController | null = null;
  private readonly resizeObs: ResizeObserver;
  private readonly screenObs: IntersectionObserver | null;
  private readonly atlas: HTMLCanvasElement;
  private readonly loop: (now: number) => void;
  private rafId = 0;
  private onScreen = true;
  private reduced = false;
  private glLost = false;
  private fontAsked = false;
  dark = false;

  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  pxW = 0;
  pxH = 0;
  cellW = 0;
  cellH = 0;
  cols = 0;
  rows = 0;
  originX = 0;
  originY = 0;
  atlasW = 1;
  atlasH = 1;

  private lastNow = 0;
  private acc = 0;
  private warmLeft = 0;
  private lastPaint = 0;
  private stillDrawn = false;
  private tier = 0;
  private costEma = 0;
  private stepsSinceTier = 0;

  private rect: DOMRect | null = null;
  private ptrKnown = false;
  private ptrClientX = 0;
  private ptrClientY = 0;
  private downId = -1;
  private downX = 0;
  private downY = 0;
  private dragged = false;

  constructor() {
    let canvas = makeCanvas();
    this.canvas = canvas;
    this.atlas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true,
    });
    if (gl) {
      this.gl = new GlPainter(gl);
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.glLost = true; });
      canvas.addEventListener('webglcontextrestored', () => {
        this.glLost = false;
        if (!this.gl) return;
        this.gl.init();
        this.uploadAtlas();
        if (this.sim) this.gl.setField(this.sim);
        this.stillDrawn = false;
        this.kick();
      });
      if (!this.gl.ok) this.gl = null;
    }
    if (!this.gl) {
      if (gl) { canvas = makeCanvas(); this.canvas = canvas; }
      const ctx = canvas.getContext('2d');
      if (ctx) this.cpu = new CanvasPainter(ctx);
    }
    canvas.dataset.smokePath = this.gl ? 'webgl' : this.cpu ? 'canvas' : 'none';
    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.screenObs = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          const e = entries[entries.length - 1];
          this.onScreen = e ? e.isIntersecting : true;
          this.kick();
        })
      : null;
    this.loop = (now: number) => this.frame(now);
  }

  attach(host: HTMLElement, dark: boolean): void {
    if (this.host && this.host !== host) this.detachInternal();
    this.host = host;
    this.dark = dark;
    host.appendChild(this.canvas);
    this.reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.abort = new AbortController();
    this.installInput(this.abort.signal);
    this.resizeObs.observe(this.canvas);
    this.screenObs?.observe(this.canvas);
    this.cssW = 0;
    this.cssH = 0;
    this.rebuild();
    this.askFont();
    this.lastNow = 0;
    this.kick();
  }

  detach(host: HTMLElement): void {
    if (this.host !== host) return;
    this.detachInternal();
  }

  private detachInternal(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.abort?.abort();
    this.abort = null;
    this.resizeObs.disconnect();
    this.screenObs?.disconnect();
    this.canvas.remove();
    this.host = null;
    this.resetPointer();
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.cssW = 0;
    this.cssH = 0;
  }

  setTheme(dark: boolean): void {
    if (this.dark === dark) return;
    this.dark = dark;
    this.stillDrawn = false;
    this.kick();
  }

  private onResize(): void {
    this.rect = null;
    if (this.sim && Math.abs(this.canvas.clientWidth - this.cssW) <= 4 && Math.abs(this.canvas.clientHeight - this.cssH) <= 4) return;
    this.rebuild();
    this.kick();
  }

  private rebuild(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.cssW = w;
    this.cssH = h;
    this.rect = null;
    if (w < 32 || h < 32) return;
    this.dpr = Math.min(getEffectiveDPR(), MAX_DPR);
    this.pxW = Math.round(w * this.dpr);
    this.pxH = Math.round(h * this.dpr);
    this.canvas.width = this.pxW;
    this.canvas.height = this.pxH;
    const cellCss = Math.min(CELL_MAX_CSS, Math.max(CELL_MIN_CSS, h / ROWS_TARGET));
    const cellH = Math.max(6, Math.round(cellCss * this.dpr));
    const cellW = Math.max(4, Math.round(cellH * CELL_ASPECT));
    const atlasChanged = cellH !== this.cellH || cellW !== this.cellW;
    this.cellH = cellH;
    this.cellW = cellW;
    this.cols = Math.max(1, Math.floor(this.pxW / cellW));
    this.rows = Math.max(1, Math.floor(this.pxH / cellH));
    this.originX = Math.floor((this.pxW - this.cols * cellW) / 2);
    this.originY = Math.floor((this.pxH - this.rows * cellH) / 2);
    this.ensureSim(w / h);
    if (atlasChanged) this.uploadAtlas();
    this.cpu?.rebuild(this);
    this.stillDrawn = false;
  }

  private ensureSim(aspect: number): void {
    const { w, h } = smokeGridFor(aspect, SMOKE_CELLS * GRID_TIERS[this.tier]);
    const old = this.sim;
    if (old && old.w === w && old.h === h) return;
    const next = new SmokeSim(w, h, (Math.random() * 4294967296) >>> 0);
    if (old) next.resampleFrom(old);
    else this.warmLeft = WARM_SECONDS;
    this.sim = next;
    this.costEma = 0;
    this.stepsSinceTier = 0;
    this.gl?.setField(next);
  }

  private uploadAtlas(): void {
    if (!this.gl || this.cellW === 0) return;
    const slots = RAMP.length + EDGES.length;
    const atlas = this.atlas;
    atlas.width = this.cellW * slots;
    atlas.height = this.cellH;
    this.atlasW = atlas.width;
    this.atlasH = atlas.height;
    const ctx = atlas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, atlas.width, atlas.height);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(this.cellH * FONT_FILL)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let s = 0; s < slots; s++) {
      const ch = s < RAMP.length ? RAMP[s] : EDGES[s - RAMP.length];
      ctx.fillText(ch, s * this.cellW + this.cellW * 0.5, this.cellH * 0.52);
    }
    this.gl.setAtlas(atlas);
  }

  private askFont(): void {
    if (this.fontAsked || typeof document === 'undefined' || !document.fonts) return;
    this.fontAsked = true;
    document.fonts.load(`400 ${Math.max(12, this.cellH)}px "JetBrains Mono"`).then(() => {
      this.uploadAtlas();
      this.cpu?.rebuild(this);
      this.stillDrawn = false;
      this.kick();
    }, () => undefined);
  }

  private running(): boolean {
    return !!this.host && this.onScreen && !document.hidden && !this.glLost && !!this.sim && (!!this.gl || !!this.cpu);
  }

  private kick(): void {
    if (this.rafId || !this.running()) return;
    this.lastNow = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  private frame(now: number): void {
    this.rafId = 0;
    if (!this.running()) return;
    const sim = this.sim;
    if (!sim) return;
    let stepped = false;
    if (this.warmLeft > 0) {
      const t0 = performance.now();
      while (this.warmLeft > 0 && performance.now() - t0 < WARM_BUDGET_MS) {
        sim.step(STEP);
        this.warmLeft -= STEP;
      }
      stepped = true;
      this.acc = 0;
    } else if (this.reduced) {
      if (this.stillDrawn) return;
    } else {
      const dt = this.lastNow > 0 ? Math.min(0.25, (now - this.lastNow) / 1000) : 0;
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < MAX_STEPS_PER_FRAME) {
        this.feedPointer(sim);
        const t0 = performance.now();
        sim.step(STEP);
        this.watchCost(performance.now() - t0);
        this.acc -= STEP;
        n++;
        stepped = true;
      }
      if (this.acc >= STEP) this.acc = 0;
    }
    this.lastNow = now;
    const mix = this.reduced || this.warmLeft > 0 ? 1 : Math.min(1, this.acc / STEP);
    if (this.gl) {
      if (stepped || !this.stillDrawn) this.gl.setField(sim);
      this.gl.draw(this, sim, mix);
    } else if (this.cpu && (stepped || !this.stillDrawn || this.reduced) && now - this.lastPaint >= FALLBACK_INTERVAL_MS - 1) {
      this.lastPaint = now;
      this.cpu.draw(this, sim, mix);
    }
    this.stillDrawn = true;
    if (this.reduced && this.warmLeft <= 0) return;
    this.rafId = requestAnimationFrame(this.loop);
  }

  private watchCost(ms: number): void {
    this.costEma = this.stepsSinceTier === 0 ? ms : this.costEma * 0.97 + ms * 0.03;
    this.stepsSinceTier++;
    if (this.costEma > DEGRADE_STEP_MS && this.stepsSinceTier > DEGRADE_GRACE_STEPS && this.tier < GRID_TIERS.length - 1) {
      this.tier++;
      if (this.cssW > 0 && this.cssH > 0) this.ensureSim(this.cssW / this.cssH);
    }
  }

  private installInput(signal: AbortSignal): void {
    const opts: AddEventListenerOptions = { passive: true, signal };
    window.addEventListener('pointermove', (e) => this.onPointerMove(e), opts);
    window.addEventListener('pointerdown', (e) => this.onPointerDown(e), opts);
    window.addEventListener('pointerup', (e) => this.onPointerUp(e), opts);
    window.addEventListener('pointercancel', (e) => this.onPointerCancel(e), opts);
    window.addEventListener('blur', () => this.resetPointer(), { signal });
    window.addEventListener('resize', () => { this.rect = null; }, opts);
    window.addEventListener('pointerout', (e) => { if (!e.relatedTarget && e.pointerType === 'mouse') this.ptrKnown = false; }, opts);
    document.addEventListener('visibilitychange', () => this.kick(), { signal });
  }

  private boxRect(): DOMRect | null {
    if (!this.rect) {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      this.rect = r;
    }
    return this.rect;
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType && e.pointerType !== 'mouse' && this.downId !== e.pointerId) return;
    this.ptrKnown = true;
    this.ptrClientX = e.clientX;
    this.ptrClientY = e.clientY;
    if (this.downId === e.pointerId && !this.dragged) {
      const dx = e.clientX - this.downX;
      const dy = e.clientY - this.downY;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) this.dragged = true;
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.isPrimary === false) return;
    this.downId = e.pointerId;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.dragged = false;
    this.ptrKnown = true;
    this.ptrClientX = e.clientX;
    this.ptrClientY = e.clientY;
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.downId !== e.pointerId) return;
    const wasDrag = this.dragged;
    this.downId = -1;
    this.dragged = false;
    if (e.pointerType && e.pointerType !== 'mouse') this.ptrKnown = false;
    if (wasDrag || this.reduced) return;
    const target = e.target as Element | null;
    if (target && typeof target.closest === 'function' &&
        target.closest('button, a, input, select, textarea, [role="slider"], [role="dialog"]')) return;
    const sim = this.sim;
    const r = this.boxRect();
    if (!sim || !r) return;
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return;
    sim.puff(sim.cellX(fx), sim.cellY(fy), Math.random() * 1000);
  }

  private onPointerCancel(e: PointerEvent): void {
    if (this.downId !== e.pointerId) return;
    this.resetPointer();
  }

  private resetPointer(): void {
    this.downId = -1;
    this.dragged = false;
    this.ptrKnown = false;
  }

  private feedPointer(sim: SmokeSim): void {
    const r = this.ptrKnown && !this.reduced ? this.boxRect() : null;
    if (!r) { sim.setPointer(false, 0, 0, 0, 0); return; }
    const fx = (this.ptrClientX - r.left) / r.width;
    const fy = (this.ptrClientY - r.top) / r.height;
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) { sim.setPointer(false, 0, 0, 0, 0); return; }
    const cellCss = this.cssW / (sim.viewR - sim.viewL);
    const radius = Math.max(STIR_RADIUS_MIN, STIR_RADIUS_CSS / cellCss);
    sim.setPointer(true, sim.cellX(fx), sim.cellY(fy), radius, this.dragged ? 1 : 0);
  }
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;';
  return canvas;
}

let _view: SmokeView | null = null;
function smokeView(): SmokeView {
  if (!_view) _view = new SmokeView();
  return _view;
}

interface Props {
  isDark: boolean;
}

export const AsciiFluidBackground: React.FC<Props> = ({ isDark }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef(isDark);
  darkRef.current = isDark;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = smokeView();
    view.attach(host, darkRef.current);
    return () => view.detach(host);
  }, []);

  useEffect(() => {
    _view?.setTheme(isDark);
  }, [isDark]);

  return <div ref={hostRef} aria-hidden="true" className="absolute inset-0 pointer-events-none" />;
};
