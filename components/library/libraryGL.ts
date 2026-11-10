import { GEOM_VERT_SIZE, GEOM_FRAG_SRC, CIRCLE_FRAG_SRC, CIRCLE_GLSL, RIM_GLSL } from '../../game/WebGLRenderer';
import { meshData, CT_GPU_PART_STRIDE, CT_PART_DEPTH0, ctPartDepthStep } from '../classTreeGL';
import { CT_PART_STRIDE, CT_MESH_CIRCLE } from '../../utils/classTreeIcon';
import { getAnimatedColor } from '../../game/ShapeRegistry';
import type { LibPicture } from './libraryPictures';
import { rgb01 } from './libraryPictures';

export const LIB_ICON_UNITS = 80;

const LIB_PART_VS = `#version 300 es
precision highp float;
in vec2 a_localPos; in vec2 a_strokeOffset; in float a_isStroke;
in vec2 a_tile; in vec2 a_pos; in float a_rot; in vec2 a_scale; in vec3 a_color; in float a_aspect; in float a_depth;
uniform vec4 u_camera; uniform float u_icon; uniform vec3 u_ink; uniform float u_blend; uniform vec4 u_solid;
out vec3 v_color; out float v_alpha; out vec3 v_cap;
void main() {
  float isS = min(a_isStroke, 1.0);
  vec2 sc = a_scale * u_icon;
  vec2 pos = a_localPos;
  pos.y *= mix(1.0, a_aspect, max(pos.x, 0.0));
  vec2 scaled = pos * sc;
  vec2 so = a_strokeOffset;
  if (a_isStroke > 0.5 && abs(a_aspect - 1.0) > 0.001) {
    float ax = abs(a_strokeOffset.x), ay = abs(a_strokeOffset.y);
    float sg = sign(a_strokeOffset.y);
    vec2 n = vec2(-0.5 * (a_aspect - 1.0) * sc.y, sg * sc.x);
    float nl = length(n);
    if (ay > ax * 2.0) {
      if (nl > 0.001) so = (n / nl) * length(a_strokeOffset);
    } else if (a_isStroke > 1.5 && ax > 0.001 && ay > 0.001) {
      if (nl > 0.001 && abs(n.y) > nl * 0.2) {
        float w = a_isStroke - 1.0;
        float tx = sign(a_strokeOffset.x) * w;
        so = vec2(tx, (w - tx * (n.x / nl)) / (n.y / nl));
      }
    }
  }
  scaled += so;
  float c = cos(a_rot), s = sin(a_rot);
  vec2 w = vec2(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c) + a_tile + a_pos * u_icon;
  gl_Position = vec4(w.x * u_camera.x + u_camera.z, w.y * u_camera.y + u_camera.w, a_depth, 1.0);
  bool solid = u_solid.a > 0.0;
  v_color = solid ? u_solid.rgb : mix(a_color, mix(a_color, u_ink, u_blend), isS);
  v_alpha = solid ? u_solid.a : 1.0;
  v_cap = vec3(so, a_isStroke - 1.0);
}`;

const LIB_CIRCLE_VS = `#version 300 es
precision highp float;
in vec2 a_localPos; in vec2 a_strokeOffset; in float a_isStroke;
in vec2 a_tile; in vec2 a_pos; in vec2 a_scale; in vec3 a_color; in float a_depth;
uniform vec4 u_camera; uniform float u_icon; uniform vec3 u_ink; uniform float u_blend; uniform vec4 u_solid;
uniform vec4 u_viewport; uniform float u_pxPerWorld;
flat out vec3 v_fill; flat out vec3 v_stroke; flat out float v_alpha; flat out float v_piece;
flat out vec2 v_centerPx; flat out float v_rPx;
${RIM_GLSL}${CIRCLE_GLSL}
void main() {
  float r = abs(a_scale.x) * u_icon;
  float rad = circleVertRadius(r, a_strokeOffset.x, a_strokeOffset.y, u_pxPerWorld);
  vec2 ctr = a_tile + a_pos * u_icon;
  vec2 w = ctr + a_localPos * rad;
  gl_Position = vec4(w.x * u_camera.x + u_camera.z, w.y * u_camera.y + u_camera.w, a_depth, 1.0);
  vec2 cn = vec2(ctr.x * u_camera.x + u_camera.z, ctr.y * u_camera.y + u_camera.w);
  v_centerPx = u_viewport.xy + (cn * 0.5 + 0.5) * u_viewport.zw;
  v_rPx = r * u_pxPerWorld;
  bool solid = u_solid.a > 0.0;
  v_fill = solid ? u_solid.rgb : a_color;
  v_stroke = solid ? u_solid.rgb : mix(a_color, u_ink, u_blend);
  v_alpha = solid ? u_solid.a : 1.0;
  v_piece = a_isStroke;
}`;

export interface LibSlot { pic: LibPicture; x: number; y: number; fade: number; alpha?: number;
  turn?: number; }

const LIB_QUAD_VS = `#version 300 es
in vec2 a_p;
uniform vec4 u_rect;
out vec2 v_uv;
void main() { v_uv = a_p; gl_Position = vec4(mix(u_rect.x, u_rect.z, a_p.x), mix(u_rect.y, u_rect.w, a_p.y), 0.0, 1.0); }`;
const LIB_QUAD_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_alpha;
out vec4 fragColor;
void main() { fragColor = texture(u_tex, v_uv) * u_alpha; }`;
interface IsoFrame { size: number; msFb: WebGLFramebuffer; msColor: WebGLRenderbuffer; msDepth: WebGLRenderbuffer; rsFb: WebGLFramebuffer; tex: WebGLTexture }

export interface LibPass { x: number; y: number; w: number; h: number; iconPx: number; slots: LibSlot[]; count: number; }

export interface LibFrame {
  w: number; h: number;
  dark: boolean;
  ink: readonly number[]; blend: number;
  veil: readonly number[];
  passes: LibPass[];
  passCount: number;
}

interface Batch { mesh: number; circle: boolean; vao: WebGLVertexArrayObject; inst: WebGLBuffer; cap: number; data: Float32Array; count: number; vertCount: number; }

export class LibraryGL<C extends HTMLCanvasElement | OffscreenCanvas = HTMLCanvasElement> {
  readonly canvas: C;
  private gl: WebGL2RenderingContext | null = null;
  private ok = false;
  onRestored: (() => void) | null = null;
  private prog: WebGLProgram | null = null;
  private circProg: WebGLProgram | null = null;
  private a2c = false;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private meshBufs = new Map<number, { buf: WebGLBuffer; vertCount: number }>();
  private batches = new Map<number, Batch>();
  private batchList: Batch[] = [];
  private veilVAOs = new Map<number, { vao: WebGLVertexArrayObject; vertCount: number }>();
  private veilInst: WebGLBuffer | null = null;
  private veilData = new Float32Array(CT_GPU_PART_STRIDE);
  private iso: IsoFrame | null = null;
  private isoBroken = false;
  private samples = 0;
  private quadProg: WebGLProgram | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;
  private uq: Record<string, WebGLUniformLocation | null> = {};
  private isoSlot: LibSlot = { pic: null as unknown as LibPicture, x: 0, y: 0, fade: 0 };
  private isoPass: LibPass = { x: 0, y: 0, w: 0, h: 0, iconPx: 0, slots: [], count: 1 };
  private isoFrame: LibFrame = { w: 0, h: 0, dark: false, ink: [0, 0, 0], blend: 0, veil: [1, 1, 1], passes: [], passCount: 0 };
  animatedShown = false;
  lastCalls = 0;

  constructor(surface?: C) {
    if (surface) this.canvas = surface;
    else {
      const cv = document.createElement('canvas');
      const s = cv.style;
      s.position = 'absolute'; s.left = '0'; s.top = '0'; s.width = '100%'; s.height = '100%';
      s.display = 'block'; s.pointerEvents = 'none';
      s.zIndex = '5';
      cv.setAttribute('aria-hidden', 'true');
      this.canvas = cv as C;
    }
    const target = this.canvas as unknown as EventTarget;
    target.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    target.addEventListener('webglcontextrestored', () => { this.init(); this.onRestored?.(); });
    this.gl = (this.canvas as HTMLCanvasElement).getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;
    this.init();
  }

  get ready(): boolean { return this.ok; }
  get available(): boolean { return this.gl !== null; }

  private compile(vs: string, fs: string): WebGLProgram | null {
    const gl = this.gl!;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('[LibraryGL] shader:', gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram()!;
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error('[LibraryGL] link:', gl.getProgramInfoLog(p)); return null; }
    return p;
  }

  private init(): void {
    const gl = this.gl;
    this.ok = false;
    if (!gl) { console.error('[LibraryGL] WebGL2 is not available'); return; }
    this.prog = this.compile(LIB_PART_VS, GEOM_FRAG_SRC);
    this.circProg = this.compile(LIB_CIRCLE_VS, CIRCLE_FRAG_SRC);
    if (!this.prog || !this.circProg) return;
    this.a2c = (gl.getParameter(gl.SAMPLES) as number) > 0;
    const U = (p: WebGLProgram, n: string, k: string) => { this.u[k] = gl.getUniformLocation(p, n); };
    for (const [p, x] of [[this.prog, ''], [this.circProg, 'c']] as const) {
      U(p, 'u_camera', x + 'cam'); U(p, 'u_icon', x + 'icon'); U(p, 'u_ink', x + 'ink'); U(p, 'u_blend', x + 'blend');
      U(p, 'u_solid', x + 'solid'); U(p, 'u_pxPerWorld', x + 'px'); U(p, 'u_a2c', x + 'a2c');
    }
    U(this.circProg, 'u_viewport', 'cview'); U(this.circProg, 'u_yFix', 'cyfix');
    this.meshBufs.clear();
    this.batches.clear();
    this.batchList = [];
    this.veilVAOs.clear();
    this.veilInst = gl.createBuffer();
    this.samples = gl.getParameter(gl.SAMPLES) as number;
    this.iso = null; this.isoBroken = false;
    this.quadProg = this.compile(LIB_QUAD_VS, LIB_QUAD_FS);
    this.quadVao = null;
    if (this.quadProg) {
      for (const n of ['u_rect', 'u_alpha', 'u_tex']) this.uq[n] = gl.getUniformLocation(this.quadProg, n);
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      this.attr(this.quadProg, 'a_p', this.buffer(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW), 2, 8, 0, 0);
      gl.bindVertexArray(null);
      this.quadVao = vao;
    }
    this.isoPass.slots[0] = this.isoSlot;
    this.ok = true;
  }

  private ensureIso(size: number): IsoFrame | null {
    const gl = this.gl!;
    if (this.isoBroken || !this.quadProg || !this.quadVao) return null;
    if (this.iso && this.iso.size >= size) return this.iso;
    this.freeIso();
    const S = Math.max(64, Math.ceil(size / 64) * 64);
    const samples = Math.min(this.samples, gl.getParameter(gl.MAX_SAMPLES) as number);
    const rb = (fmt: number) => {
      const r = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, r);
      if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, S, S);
      else gl.renderbufferStorage(gl.RENDERBUFFER, fmt, S, S);
      return r;
    };
    const msColor = rb(gl.RGBA8), msDepth = rb(gl.DEPTH_COMPONENT24);
    const msFb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, msFb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColor);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepth);
    const okMs = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const rsFb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rsFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const okRs = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.iso = { size: S, msFb, msColor, msDepth, rsFb, tex };
    if (!okMs || !okRs) { this.freeIso(); this.isoBroken = true; return null; }
    return this.iso;
  }

  private freeIso(): void {
    const gl = this.gl, f = this.iso;
    this.iso = null;
    if (!gl || !f) return;
    gl.deleteFramebuffer(f.msFb); gl.deleteFramebuffer(f.rsFb);
    gl.deleteRenderbuffer(f.msColor); gl.deleteRenderbuffer(f.msDepth);
    gl.deleteTexture(f.tex);
  }

  private drawIsolated(f: LibFrame, pass: LibPass, S: number, iso: IsoFrame): void {
    const gl = this.gl!;
    const F = this.isoFrame, P = this.isoPass, o = this.isoSlot;
    F.w = S; F.h = S; F.dark = f.dark; F.ink = f.ink; F.blend = f.blend; F.veil = f.veil;
    P.w = S; P.h = S; P.iconPx = pass.iconPx; P.count = 1;
    for (let si = 0; si < pass.count; si++) {
      const slot = pass.slots[si];
      const a = this.slotAlpha(slot);
      if (!(a < 1) || !(a > 0)) continue;
      const ox = Math.floor(slot.x) - S / 2, oy = Math.floor(slot.y) - S / 2;
      o.pic = slot.pic; o.x = slot.x - ox; o.y = slot.y - oy; o.fade = slot.fade; o.alpha = undefined; o.turn = slot.turn;
      gl.bindFramebuffer(gl.FRAMEBUFFER, iso.msFb);
      gl.viewport(0, 0, S, S);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.isoDrawing = true;
      this.drawPass(F, P);
      this.isoDrawing = false;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, iso.msFb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, iso.rsFb);
      gl.blitFramebuffer(0, 0, S, S, 0, 0, S, S, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, f.w, f.h);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(Math.floor(pass.x), Math.floor(f.h - pass.y - pass.h), Math.ceil(pass.w), Math.ceil(pass.h));
      gl.useProgram(this.quadProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, iso.tex);
      gl.uniform1i(this.uq.u_tex, 0);
      gl.uniform1f(this.uq.u_alpha, a);
      gl.uniform4f(this.uq.u_rect, (ox / f.w) * 2 - 1, 1 - ((oy + S) / f.h) * 2, ((ox + S) / f.w) * 2 - 1, 1 - (oy / f.h) * 2);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.lastCalls++;
    }
  }

  private buffer(data: Float32Array, usage: number): WebGLBuffer {
    const gl = this.gl!;
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    return b;
  }

  private attr(prog: WebGLProgram, name: string, buf: WebGLBuffer, size: number, stride: number, offset: number, divisor: number): void {
    const gl = this.gl!;
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, divisor);
  }

  private mesh(id: number): { buf: WebGLBuffer; vertCount: number } {
    let m = this.meshBufs.get(id);
    if (!m) {
      const d = meshData(id, true);
      m = { buf: this.buffer(d, this.gl!.STATIC_DRAW), vertCount: d.length / GEOM_VERT_SIZE };
      this.meshBufs.set(id, m);
    }
    return m;
  }

  private vaoFor(prog: WebGLProgram, meshId: number, inst: WebGLBuffer): { vao: WebGLVertexArrayObject; vertCount: number } {
    const gl = this.gl!;
    const m = this.mesh(meshId);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    this.attr(prog, 'a_localPos', m.buf, 2, GEOM_VERT_SIZE * 4, 0, 0);
    this.attr(prog, 'a_strokeOffset', m.buf, 2, GEOM_VERT_SIZE * 4, 8, 0);
    this.attr(prog, 'a_isStroke', m.buf, 1, GEOM_VERT_SIZE * 4, 16, 0);
    const s = CT_GPU_PART_STRIDE * 4;
    this.attr(prog, 'a_tile', inst, 2, s, 0, 1);
    this.attr(prog, 'a_pos', inst, 2, s, 8, 1);
    this.attr(prog, 'a_rot', inst, 1, s, 16, 1);
    this.attr(prog, 'a_scale', inst, 2, s, 20, 1);
    this.attr(prog, 'a_color', inst, 3, s, 28, 1);
    this.attr(prog, 'a_aspect', inst, 1, s, 40, 1);
    this.attr(prog, 'a_depth', inst, 1, s, 44, 1);
    gl.bindVertexArray(null);
    return { vao, vertCount: m.vertCount };
  }

  private batch(meshId: number): Batch {
    let b = this.batches.get(meshId);
    if (!b) {
      const cap = 64;
      const data = new Float32Array(cap * CT_GPU_PART_STRIDE);
      const inst = this.buffer(data, this.gl!.DYNAMIC_DRAW);
      const circle = meshId === CT_MESH_CIRCLE;
      const v = this.vaoFor(circle ? this.circProg! : this.prog!, meshId, inst);
      b = { mesh: meshId, circle, vao: v.vao, inst, cap, data, count: 0, vertCount: v.vertCount };
      this.batches.set(meshId, b);
      this.batchList.push(b);
      this.batchList.sort((x, y) => x.mesh - y.mesh);
    }
    return b;
  }

  private grow(b: Batch, need: number): void {
    let cap = b.cap;
    while (cap < need) cap *= 2;
    const data = new Float32Array(cap * CT_GPU_PART_STRIDE);
    data.set(b.data.subarray(0, b.count * CT_GPU_PART_STRIDE));
    b.data = data; b.cap = cap;
    const gl = this.gl!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.inst);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  }

  setSize(w: number, h: number): boolean {
    if (this.canvas.width === w && this.canvas.height === h) return false;
    this.canvas.width = w; this.canvas.height = h;
    return true;
  }

  release(): void {
    const gl = this.gl;
    if (!gl || !this.ok) return;
    for (const b of this.batchList) {
      if (b.cap > 64) {
        b.cap = 64; b.data = new Float32Array(64 * CT_GPU_PART_STRIDE);
        gl.bindBuffer(gl.ARRAY_BUFFER, b.inst);
        gl.bufferData(gl.ARRAY_BUFFER, b.data.byteLength, gl.DYNAMIC_DRAW);
      }
      b.count = 0;
    }
    this.freeIso();
    this.canvas.width = 1; this.canvas.height = 1;
  }

  draw(f: LibFrame): void {
    const gl = this.gl;
    this.animatedShown = false;
    this.lastCalls = 0;
    if (!gl || !this.ok) return;
    gl.viewport(0, 0, f.w, f.h);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    for (let pi = 0; pi < f.passCount; pi++) {
      const pass = f.passes[pi];
      if (pass.count === 0 || pass.w <= 0 || pass.h <= 0 || pass.iconPx <= 0) continue;
      gl.scissor(Math.floor(pass.x), Math.floor(f.h - pass.y - pass.h), Math.ceil(pass.w), Math.ceil(pass.h));
      this.drawPass(f, pass);
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(null);
  }

  private isoDrawing = false;
  private slotAlpha(slot: LibSlot): number {
    const a = slot.alpha === undefined ? 1 : slot.alpha;
    const p = slot.pic;
    return !this.isoDrawing && p.alpha < 1 ? a * p.alpha : a;
  }

  private drawPass(f: LibFrame, pass: LibPass): void {
    const gl = this.gl!;
    const unit = pass.iconPx / LIB_ICON_UNITS;
    const sx = (2 * unit) / f.w, sy = -(2 * unit) / f.h;
    for (const b of this.batchList) b.count = 0;
    let veils = 0;
    let isoN = 0;
    for (let si = 0; si < pass.count; si++) { if (this.slotAlpha(pass.slots[si]) < 1) isoN++; }
    const iso = isoN > 0 ? this.ensureIso(Math.ceil(pass.iconPx * 1.6) + 4) : null;
    for (let si = 0; si < pass.count; si++) {
      const slot = pass.slots[si];
      const sa = this.slotAlpha(slot);
      if (sa < 1 && (iso || !(sa > 0))) continue;
      const p = slot.pic;
      const parts = p.parts;
      const n = parts.length / CT_PART_STRIDE;
      if (n === 0) continue;
      let ar = 0, ag = 0, ab = 0;
      if (p.anim) {
        const c = rgb01(getAnimatedColor(p.anim, f.dark));
        ar = c[0]; ag = c[1]; ab = c[2];
        this.animatedShown = true;
      }
      const fade = slot.fade > 0 ? slot.fade : 0, keep = 1 - fade;
      const vr = f.veil[0] * fade, vg = f.veil[1] * fade, vb = f.veil[2] * fade;
      const tx = slot.x / unit, ty = slot.y / unit;
      const dStep = ctPartDepthStep(n);
      const turn = slot.turn || 0, tc = Math.cos(turn), ts = Math.sin(turn);
      for (let k = 0; k < n; k++) {
        const q = k * CT_PART_STRIDE;
        const b = this.batch(parts[q]);
        if (b.count + 1 > b.cap) this.grow(b, b.count + 1);
        const d = b.data, o = (b.count++) * CT_GPU_PART_STRIDE;
        d[o] = tx; d[o + 1] = ty;
        if (turn !== 0) {
          const px = parts[q + 1], py = parts[q + 2];
          d[o + 2] = px * tc - py * ts; d[o + 3] = px * ts + py * tc; d[o + 4] = parts[q + 3] + turn;
        } else { d[o + 2] = parts[q + 1]; d[o + 3] = parts[q + 2]; d[o + 4] = parts[q + 3]; }
        d[o + 5] = parts[q + 4]; d[o + 6] = parts[q + 5];
        if (p.anim) { d[o + 7] = ar * keep + vr; d[o + 8] = ag * keep + vg; d[o + 9] = ab * keep + vb; }
        else { d[o + 7] = parts[q + 6] * keep + vr; d[o + 8] = parts[q + 7] * keep + vg; d[o + 9] = parts[q + 8] * keep + vb; }
        d[o + 10] = parts[q + 9];
        d[o + 11] = CT_PART_DEPTH0 - k * dStep;
      }
      if (p.alpha < 1 && p.veilMesh >= 0 && !this.isoDrawing) veils++;
    }
    const a2c = this.a2c ? 1 : 0;
    for (const x of ['', 'c']) {
      gl.useProgram(x ? this.circProg : this.prog);
      gl.uniform4f(this.u[x + 'cam'], sx, sy, -1, 1);
      gl.uniform1f(this.u[x + 'icon'], LIB_ICON_UNITS);
      gl.uniform3f(this.u[x + 'ink'], f.ink[0], f.ink[1], f.ink[2]);
      gl.uniform1f(this.u[x + 'blend'], f.blend);
      gl.uniform4f(this.u[x + 'solid'], 0, 0, 0, 0);
      gl.uniform1f(this.u[x + 'px'], unit);
      gl.uniform1f(this.u[x + 'a2c'], a2c);
    }
    gl.uniform4f(this.u.cview, 0, 0, f.w, f.h);
    gl.uniform1f(this.u.cyfix, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    if (this.a2c) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    let onCircle = true;
    for (const b of this.batchList) {
      if (b.count === 0) continue;
      if (b.circle !== onCircle) { onCircle = b.circle; gl.useProgram(onCircle ? this.circProg : this.prog); }
      gl.bindBuffer(gl.ARRAY_BUFFER, b.inst);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, b.count * CT_GPU_PART_STRIDE);
      gl.bindVertexArray(b.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, b.vertCount, b.count);
      this.lastCalls++;
    }
    if (this.a2c) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.disable(gl.DEPTH_TEST);
    if (veils > 0) {
      for (const x of ['', 'c']) { gl.useProgram(x ? this.circProg : this.prog); gl.uniform1f(this.u[x + 'a2c'], 0); }
      for (let si = 0; si < pass.count; si++) {
        const p = pass.slots[si].pic;
        const sa = pass.slots[si].alpha;
        if (sa !== undefined && sa < 1 && (iso || !(sa > 0))) continue;
        if (!(p.alpha < 1) || p.veilMesh < 0) continue;
        const a = 1 - p.alpha;
        const vc = p.veilMesh === CT_MESH_CIRCLE ? 'c' : '';
        gl.useProgram(vc ? this.circProg : this.prog);
        gl.uniform4f(this.u[vc + 'solid'], f.veil[0], f.veil[1], f.veil[2], a);
        const d = this.veilData;
        d[0] = pass.slots[si].x / unit; d[1] = pass.slots[si].y / unit;
        d[2] = 0; d[3] = 0; d[4] = p.veilRot + (pass.slots[si].turn || 0); d[5] = p.veilScale; d[6] = p.veilScale;
        d[7] = 0; d[8] = 0; d[9] = 0; d[10] = 1; d[11] = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.veilInst);
        gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
        let v = this.veilVAOs.get(p.veilMesh);
        if (!v) { v = this.vaoFor(vc ? this.circProg! : this.prog!, p.veilMesh, this.veilInst!); this.veilVAOs.set(p.veilMesh, v); }
        gl.bindVertexArray(v.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, v.vertCount, 1);
        this.lastCalls++;
      }
    }
    if (iso) this.drawIsolated(f, pass, iso.size, iso);
  }
}

let _gl: LibraryGL | null = null;
export function libraryGL(): LibraryGL {
  if (!_gl) _gl = new LibraryGL();
  return _gl;
}
