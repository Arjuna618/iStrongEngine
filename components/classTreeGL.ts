import {
  GEOM_VERT_SIZE, _triangulatePolygonWithStroke, _triangulateBarrelWithStroke, _triangulateStarWithStroke,
  _triangulateCurvedStarWithStroke, _triangulateHealerCrossWithStroke, _triangulateOutlineWithStroke, _triangulateLineStroke,
  _triangulateExactCircle, GEOM_FRAG_SRC, CIRCLE_FRAG_SRC, CIRCLE_GLSL, RIM_GLSL,
} from '../game/WebGLRenderer';
import { CT_CELL, CT_TILE, CT_RING_UNITS, CT_LINE_UNITS } from '../utils/classTreeArras';
import {
  CT_MESH_BARREL, CT_MESH_CIRCLE, CT_MESH_POLY0, CT_MESH_POLY_MAX_SIDES, CT_MESH_CROSS, CT_MESH_STAR0,
  ctStarMeshes, CT_PART_STRIDE,
} from '../utils/classTreeIcon';

export const CT_TILE_STRIDE = 8;
export const CT_GPU_PART_STRIDE = 12;
export const CT_LABEL_STRIDE = 8;
export const CT_SEG_STRIDE = 4;
export const CT_PART_DEPTH0 = 0.5;
export const CT_PART_DEPTH_STEP = 1e-4;
export function ctPartDepthStep(n: number): number { return n * CT_PART_DEPTH_STEP <= 1.4 ? CT_PART_DEPTH_STEP : 1.4 / n; }
const LABEL_REACH = 60;

export interface CtLabelCell { u: number; v: number; uw: number; vh: number; w: number; h: number; }

export interface CtSceneInput {
  cols: number;
  tileCol: readonly number[];
  tileRow: readonly number[];
  tileTop: readonly number[];
  tileBand: readonly number[];
  tileParts: readonly (readonly number[] | null)[];
  tileName: readonly string[];
  segs: readonly number[];
}

export interface CtPartBatch {
  mesh: number;
  count: number;
  data: Float32Array;
  colStart: Int32Array;
}

export interface CtPacked {
  cols: number;
  tileCount: number;
  tiles: Float32Array;
  tileColStart: Int32Array;
  order: Int32Array;
  names: string[];
  segCount: number;
  segs: Float32Array;
  batches: CtPartBatch[];
}

export function ctPackScene(inp: CtSceneInput): CtPacked {
  const n = inp.tileCol.length;
  const cols = Math.max(1, inp.cols);
  const colCount = new Int32Array(cols + 1);
  for (let t = 0; t < n; t++) colCount[inp.tileCol[t] + 1]++;
  const tileColStart = new Int32Array(cols + 1);
  for (let c = 0; c < cols; c++) tileColStart[c + 1] = tileColStart[c] + colCount[c + 1];
  const fill = tileColStart.slice(0, cols);
  const order = new Int32Array(n);
  for (let t = 0; t < n; t++) order[fill[inp.tileCol[t]]++] = t;

  const tiles = new Float32Array(n * CT_TILE_STRIDE);
  const names: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = order[i];
    const o = i * CT_TILE_STRIDE;
    tiles[o] = (inp.tileCol[t] + 0.5) * CT_CELL;
    tiles[o + 1] = (inp.tileRow[t] + 0.5) * CT_CELL;
    tiles[o + 2] = inp.tileTop[t * 3]; tiles[o + 3] = inp.tileTop[t * 3 + 1]; tiles[o + 4] = inp.tileTop[t * 3 + 2];
    tiles[o + 5] = inp.tileBand[t * 3]; tiles[o + 6] = inp.tileBand[t * 3 + 1]; tiles[o + 7] = inp.tileBand[t * 3 + 2];
    names[i] = inp.tileName[t];
  }

  const perMesh = new Map<number, Int32Array>();
  for (let i = 0; i < n; i++) {
    const t = order[i];
    const parts = inp.tileParts[t];
    if (!parts) continue;
    const c = inp.tileCol[t];
    for (let p = 0; p < parts.length; p += CT_PART_STRIDE) {
      const m = parts[p];
      let cc = perMesh.get(m);
      if (!cc) { cc = new Int32Array(cols + 1); perMesh.set(m, cc); }
      cc[c + 1]++;
    }
  }
  const batches: CtPartBatch[] = [];
  const byMesh = new Map<number, { b: CtPartBatch; w: Int32Array }>();
  for (const [m, cc] of perMesh) {
    const colStart = new Int32Array(cols + 1);
    for (let c = 0; c < cols; c++) colStart[c + 1] = colStart[c] + cc[c + 1];
    const count = colStart[cols];
    const b: CtPartBatch = { mesh: m, count, data: new Float32Array(count * CT_GPU_PART_STRIDE), colStart };
    batches.push(b);
    byMesh.set(m, { b, w: colStart.slice(0, cols) });
  }
  batches.sort((x, y) => x.mesh - y.mesh);
  for (let i = 0; i < n; i++) {
    const t = order[i];
    const parts = inp.tileParts[t];
    if (!parts) continue;
    const c = inp.tileCol[t];
    const cx = tiles[i * CT_TILE_STRIDE], cy = tiles[i * CT_TILE_STRIDE + 1];
    const dStep = ctPartDepthStep(parts.length / CT_PART_STRIDE);
    for (let p = 0, k = 0; p < parts.length; p += CT_PART_STRIDE, k++) {
      const e = byMesh.get(parts[p])!;
      const o = (e.w[c]++) * CT_GPU_PART_STRIDE;
      const d = e.b.data;
      d[o] = cx; d[o + 1] = cy;
      d[o + 2] = parts[p + 1]; d[o + 3] = parts[p + 2]; d[o + 4] = parts[p + 3];
      d[o + 5] = parts[p + 4]; d[o + 6] = parts[p + 5];
      d[o + 7] = parts[p + 6]; d[o + 8] = parts[p + 7]; d[o + 9] = parts[p + 8];
      d[o + 10] = parts[p + 9];
      d[o + 11] = CT_PART_DEPTH0 - k * dStep;
    }
  }

  const segCount = Math.floor(inp.segs.length / CT_SEG_STRIDE);
  return { cols, tileCount: n, tiles, tileColStart, order, names, segCount, segs: Float32Array.from(inp.segs), batches };
}

export function ctVisibleCols(cx: number, w: number, a: number, cols: number, out: Int32Array): void {
  const half = (w / 2) / a;
  const c0 = Math.ceil((cx - half - CT_CELL - LABEL_REACH) / CT_CELL);
  const c1 = Math.floor((cx + half + LABEL_REACH) / CT_CELL);
  out[0] = c0 < 0 ? 0 : c0;
  out[1] = c1 > cols - 1 ? cols - 1 : c1;
}

export function ctPackLabels(packed: CtPacked, cellOf: (name: string) => CtLabelCell | undefined, out: Float32Array): void {
  for (let i = 0; i < packed.tileCount; i++) {
    const o = i * CT_LABEL_STRIDE;
    out[o] = packed.tiles[i * CT_TILE_STRIDE];
    out[o + 1] = packed.tiles[i * CT_TILE_STRIDE + 1];
    const cell = cellOf(packed.names[i]);
    if (cell) {
      out[o + 2] = cell.u; out[o + 3] = cell.v; out[o + 4] = cell.uw; out[o + 5] = cell.vh;
      out[o + 6] = cell.w; out[o + 7] = cell.h;
    } else {
      out[o + 2] = 0; out[o + 3] = 0; out[o + 4] = 0; out[o + 5] = 0; out[o + 6] = 0; out[o + 7] = 0;
    }
  }
}

export interface CtFrame {
  cx: number; cy: number;
  a: number; w: number; h: number;
  px: number; py: number;
  icon: number;
  nameMid: number; nameScale: number; snap: boolean;
  ink: number[]; strokeBlend: number; line: number[];
}

export const PART_VS = `#version 300 es
precision highp float;
in vec2 a_localPos; in vec2 a_strokeOffset; in float a_isStroke;
in vec2 a_tile; in vec2 a_pos; in float a_rot; in vec2 a_scale; in vec3 a_color; in float a_aspect; in float a_depth;
uniform vec4 u_camera; uniform float u_icon; uniform vec3 u_ink; uniform float u_blend;
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
  v_color = mix(a_color, mix(a_color, u_ink, u_blend), isS);
  v_alpha = 1.0;
  v_cap = vec3(so, a_isStroke - 1.0);
}`;

export const CIRCLE_VS = `#version 300 es
precision highp float;
in vec2 a_localPos; in vec2 a_strokeOffset; in float a_isStroke;
in vec2 a_tile; in vec2 a_pos; in vec2 a_scale; in vec3 a_color; in float a_depth;
uniform vec4 u_camera; uniform float u_icon; uniform vec3 u_ink; uniform float u_blend;
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
  v_fill = a_color;
  v_stroke = mix(a_color, u_ink, u_blend);
  v_alpha = 1.0;
  v_piece = a_isStroke;
}`;

const TILE_VS = `#version 300 es
precision highp float;
in vec3 a_p; in vec2 a_c; in vec3 a_top; in vec3 a_band;
uniform vec4 u_camera; uniform vec4 u_ring;
out vec4 v_col;
void main() {
  vec2 w = a_c + a_p.xy;
  gl_Position = vec4(w.x * u_camera.x + u_camera.z, w.y * u_camera.y + u_camera.w, 0.0, 1.0);
  v_col = a_p.z < 0.5 ? vec4(a_top, 1.0) : (a_p.z < 1.5 ? vec4(a_band, 1.0) : u_ring);
}`;
const TILE_FS = `#version 300 es
precision mediump float;
in vec4 v_col; out vec4 o;
void main() { o = v_col; }`;

const LINE_VS = `#version 300 es
precision highp float;
in vec2 a_q; in vec4 a_seg;
uniform vec4 u_camera; uniform float u_reach;
out vec2 v_w; flat out vec4 v_seg;
void main() {
  vec2 d = a_seg.zw - a_seg.xy;
  float l = length(d);
  vec2 dir = l > 1e-6 ? d / l : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 w = mix(a_seg.xy - dir * u_reach, a_seg.zw + dir * u_reach, a_q.x) + nrm * (a_q.y * u_reach);
  v_w = w; v_seg = a_seg;
  gl_Position = vec4(w.x * u_camera.x + u_camera.z, w.y * u_camera.y + u_camera.w, 0.0, 1.0);
}`;
const LINE_FS = `#version 300 es
precision highp float;
in vec2 v_w; flat in vec4 v_seg;
uniform vec4 u_color; uniform float u_px; uniform float u_half;
out vec4 o;
void main() {
  vec2 pa = v_w - v_seg.xy, ba = v_seg.zw - v_seg.xy;
  float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
  float d = length(pa - ba * t);
  o = u_color * clamp((u_half - d) * u_px + 0.5, 0.0, 1.0);
}`;

const LABEL_VS = `#version 300 es
precision highp float;
in vec2 a_q; in vec2 a_c; in vec4 a_uv; in vec2 a_size;
uniform vec4 u_camera; uniform float u_mid; uniform float u_scale; uniform vec2 u_view; uniform float u_snap;
out vec2 v_uv;
void main() {
  vec2 w = a_c + vec2(0.0, u_mid);
  vec2 ndc = vec2(w.x * u_camera.x + u_camera.z, w.y * u_camera.y + u_camera.w);
  vec2 px = (ndc * vec2(0.5, -0.5) + 0.5) * u_view;
  vec2 sz = a_size * u_scale;
  vec2 tl = px - sz * 0.5;
  if (u_snap > 0.5) tl = floor(tl + 0.5);
  vec2 corner = tl + (a_q + 0.5) * sz;
  gl_Position = vec4((corner / u_view - 0.5) * vec2(2.0, -2.0), 0.0, 1.0);
  v_uv = a_uv.xy + (a_q + 0.5) * a_uv.zw;
}`;
const LABEL_FS = `#version 300 es
precision mediump float;
in vec2 v_uv; uniform sampler2D u_tex; out vec4 o;
void main() { o = texture(u_tex, v_uv); }`;

function tileMesh(): Float32Array {
  const H = CT_TILE / 2, R = CT_RING_UNITS / 2;
  const split = -H + CT_TILE * 0.6;
  const rects: [number, number, number, number, number][] = [
    [-H, -H, H, split, 0],
    [-H, split, H, H, 1],
    [-H - R, -H - R, H + R, -H + R, 2],
    [-H - R, H - R, H + R, H + R, 2],
    [-H - R, -H + R, -H + R, H - R, 2],
    [H - R, -H + R, H + R, H - R, 2],
  ];
  const out: number[] = [];
  for (const [x0, y0, x1, y1, p] of rects) out.push(x0, y0, p, x1, y0, p, x1, y1, p, x0, y0, p, x1, y1, p, x0, y1, p);
  return new Float32Array(out);
}

export function meshData(id: number, exact = false): Float32Array {
  if (id === CT_MESH_BARREL) return _triangulateBarrelWithStroke(exact);
  if (id === CT_MESH_CIRCLE) return exact ? _triangulateExactCircle() : _triangulatePolygonWithStroke(32);
  if (id === CT_MESH_CROSS) return _triangulateHealerCrossWithStroke(exact);
  if (id >= CT_MESH_POLY0 && id < CT_MESH_POLY0 + CT_MESH_POLY_MAX_SIDES - 2) return _triangulatePolygonWithStroke(id - CT_MESH_POLY0 + 3, exact);
  const st = ctStarMeshes[id - CT_MESH_STAR0];
  if (st && st.outline) return _triangulateOutlineWithStroke(st.outline, exact);
  if (st && st.line) return _triangulateLineStroke(exact);
  return st.curved ? _triangulateCurvedStarWithStroke(st.sides, 1 - st.depth, exact) : _triangulateStarWithStroke(st.sides, 1 - st.depth, exact);
}

const ATLAS_W = 2048;

class NameAtlas {
  canvas: OffscreenCanvas | null = null;
  ctx: OffscreenCanvasRenderingContext2D | null = null;
  cells = new Map<string, CtLabelCell>();
  private queue: string[] = [];
  private qi = 0;
  private x = 0; private y = 0; private rowH = 0;
  private height = 0;
  fontPx = 0; strokePx = 0; ink = '';
  fontReady = false;
  dirtyY0 = Infinity; dirtyY1 = 0;
  version = 0;

  reset(fontPx: number, strokePx: number, ink: string, names: Iterable<string>): void {
    this.fontPx = fontPx; this.strokePx = strokePx; this.ink = ink;
    this.cells.clear();
    this.queue = [...new Set(names)];
    this.qi = 0;
    this.x = 0; this.y = 0; this.rowH = 0;
    this.height = 0;
    this.canvas = null; this.ctx = null;
    this.dirtyY0 = Infinity; this.dirtyY1 = 0;
    this.version++;
  }
  add(names: Iterable<string>): void {
    for (const n of names) if (!this.cells.has(n)) this.queue.push(n);
  }
  pending(): boolean { return this.qi < this.queue.length; }
  private font(): string { return `bold ${this.fontPx}px Ubuntu, Inter, sans-serif`; }

  build(untilMs: number): boolean {
    if (!this.fontReady || !this.pending()) return false;
    if (!this.canvas) {
      const m = new OffscreenCanvas(1, 1).getContext('2d')!;
      m.font = this.font();
      let x = 0, y = 0, rh = 0;
      const ch = Math.ceil(this.fontPx * 1.3 + this.strokePx + 4);
      for (let i = this.qi; i < this.queue.length; i++) {
        const w = Math.ceil(m.measureText(this.queue[i]).width + this.strokePx + 4);
        if (x + w > ATLAS_W) { x = 0; y += rh; rh = 0; }
        x += w; rh = Math.max(rh, ch);
      }
      let hgt = 64;
      while (hgt < y + rh + 64) hgt *= 2;
      this.height = Math.min(hgt, 8192);
      this.canvas = new OffscreenCanvas(ATLAS_W, this.height);
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    }
    const ctx = this.ctx!;
    ctx.font = this.font();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.strokePx;
    ctx.strokeStyle = this.ink;
    ctx.fillStyle = '#ffffff';
    const ch = Math.ceil(this.fontPx * 1.3 + this.strokePx + 4);
    let added = false;
    while (this.qi < this.queue.length) {
      const name = this.queue[this.qi++];
      if (this.cells.has(name)) continue;
      const w = Math.ceil(ctx.measureText(name).width + this.strokePx + 4);
      if (this.x + w > ATLAS_W) { this.x = 0; this.y += this.rowH; this.rowH = 0; }
      if (this.y + ch > this.height) break;
      ctx.strokeText(name, this.x + w / 2, this.y + ch / 2);
      ctx.fillText(name, this.x + w / 2, this.y + ch / 2);
      this.cells.set(name, { u: this.x / ATLAS_W, v: this.y / this.height, uw: w / ATLAS_W, vh: ch / this.height, w, h: ch });
      if (this.y < this.dirtyY0) this.dirtyY0 = this.y;
      if (this.y + ch > this.dirtyY1) this.dirtyY1 = this.y + ch;
      this.x += w;
      if (ch > this.rowH) this.rowH = ch;
      added = true;
      if (performance.now() >= untilMs) break;
    }
    if (added) this.version++;
    return added;
  }
}

const PART_UNIFORMS = ['u_camera', 'u_icon', 'u_ink', 'u_blend', 'u_pxPerWorld', 'u_a2c'];

interface GpuBatch { mesh: number; circle: boolean; vao: WebGLVertexArrayObject; inst: WebGLBuffer; count: number; colStart: Int32Array; vertCount: number; }

export class ClassTreeGL {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ok = false;
  private partProg: WebGLProgram | null = null;
  private circProg: WebGLProgram | null = null;
  private a2c = false;
  private tileProg: WebGLProgram | null = null;
  private lineProg: WebGLProgram | null = null;
  private labelProg: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private partU: (WebGLUniformLocation | null)[] = [];
  private circU: (WebGLUniformLocation | null)[] = [];
  private meshBufs = new Map<number, { buf: WebGLBuffer; vertCount: number }>();
  private tileVAO: WebGLVertexArrayObject | null = null;
  private tileInst: WebGLBuffer | null = null;
  private tileVerts = 0;
  private lineVAO: WebGLVertexArrayObject | null = null;
  private lineInst: WebGLBuffer | null = null;
  private labelVAO: WebGLVertexArrayObject | null = null;
  private labelInst: WebGLBuffer | null = null;
  private tex: WebGLTexture | null = null;
  private texH = 0;
  private batches: GpuBatch[] = [];
  private packed: CtPacked | null = null;
  private labelData = new Float32Array(0);
  private labelVersion = -1;
  private _cols = new Int32Array(2);
  private loc = { tC: -1, tTop: -1, tBand: -1, nC: -1, nUv: -1, nSize: -1,
    pTile: -1, pPos: -1, pRot: -1, pScale: -1, pColor: -1, pAspect: -1, pDepth: -1,
    cTile: -1, cPos: -1, cScale: -1, cColor: -1, cDepth: -1 };
  readonly atlas = new NameAtlas();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.init(); if (this.packed) this.upload(this.packed); this._restored = true; });
    this.gl = this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;
    this.init();
  }

  get ready(): boolean { return this.ok; }

  private compile(vs: string, fs: string): WebGLProgram | null {
    const gl = this.gl!;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('[ClassTreeGL] shader:', gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram()!;
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error('[ClassTreeGL] link:', gl.getProgramInfoLog(p)); return null; }
    return p;
  }

  private init(): void {
    const gl = this.gl;
    this.ok = false;
    if (!gl) { console.error('[ClassTreeGL] WebGL2 is not available'); return; }
    this.partProg = this.compile(PART_VS, GEOM_FRAG_SRC);
    this.circProg = this.compile(CIRCLE_VS, CIRCLE_FRAG_SRC);
    this.tileProg = this.compile(TILE_VS, TILE_FS);
    this.lineProg = this.compile(LINE_VS, LINE_FS);
    this.labelProg = this.compile(LABEL_VS, LABEL_FS);
    if (!this.partProg || !this.circProg || !this.tileProg || !this.lineProg || !this.labelProg) return;
    this.a2c = (gl.getParameter(gl.SAMPLES) as number) > 0;
    const U = (p: WebGLProgram, n: string, k: string) => { this.u[k] = gl.getUniformLocation(p, n); };
    this.partU = PART_UNIFORMS.map(n => gl.getUniformLocation(this.partProg!, n));
    this.circU = PART_UNIFORMS.map(n => gl.getUniformLocation(this.circProg!, n));
    U(this.circProg, 'u_viewport', 'cView'); U(this.circProg, 'u_yFix', 'cYFix');
    U(this.tileProg, 'u_camera', 'tCam'); U(this.tileProg, 'u_ring', 'tRing');
    U(this.lineProg, 'u_camera', 'lCam'); U(this.lineProg, 'u_reach', 'lReach'); U(this.lineProg, 'u_color', 'lColor');
    U(this.lineProg, 'u_px', 'lPx'); U(this.lineProg, 'u_half', 'lHalf');
    U(this.labelProg, 'u_camera', 'nCam'); U(this.labelProg, 'u_mid', 'nMid'); U(this.labelProg, 'u_scale', 'nScale');
    U(this.labelProg, 'u_view', 'nView'); U(this.labelProg, 'u_snap', 'nSnap'); U(this.labelProg, 'u_tex', 'nTex');
    const L = this.loc;
    const al = (p: WebGLProgram, n: string) => gl.getAttribLocation(p, n);
    L.tC = al(this.tileProg, 'a_c'); L.tTop = al(this.tileProg, 'a_top'); L.tBand = al(this.tileProg, 'a_band');
    L.nC = al(this.labelProg, 'a_c'); L.nUv = al(this.labelProg, 'a_uv'); L.nSize = al(this.labelProg, 'a_size');
    L.pTile = al(this.partProg, 'a_tile'); L.pPos = al(this.partProg, 'a_pos'); L.pRot = al(this.partProg, 'a_rot');
    L.pScale = al(this.partProg, 'a_scale'); L.pColor = al(this.partProg, 'a_color');
    L.pAspect = al(this.partProg, 'a_aspect'); L.pDepth = al(this.partProg, 'a_depth');
    L.cTile = al(this.circProg, 'a_tile'); L.cPos = al(this.circProg, 'a_pos'); L.cScale = al(this.circProg, 'a_scale');
    L.cColor = al(this.circProg, 'a_color'); L.cDepth = al(this.circProg, 'a_depth');
    this.meshBufs.clear();
    this.batches = [];

    const tm = tileMesh();
    this.tileVerts = tm.length / 3;
    this.tileVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.tileVAO);
    this.attr(this.tileProg, 'a_p', this.buffer(tm), 3, 12, 0, 0);
    this.tileInst = gl.createBuffer()!;
    const ts = CT_TILE_STRIDE * 4;
    this.attr(this.tileProg, 'a_c', this.tileInst, 2, ts, 0, 1);
    this.attr(this.tileProg, 'a_top', this.tileInst, 3, ts, 8, 1);
    this.attr(this.tileProg, 'a_band', this.tileInst, 3, ts, 20, 1);

    this.lineVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.lineVAO);
    this.attr(this.lineProg, 'a_q', this.buffer(new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1])), 2, 8, 0, 0);
    this.lineInst = gl.createBuffer()!;
    this.attr(this.lineProg, 'a_seg', this.lineInst, 4, 16, 0, 1);

    this.labelVAO = gl.createVertexArray()!;
    gl.bindVertexArray(this.labelVAO);
    this.attr(this.labelProg, 'a_q', this.buffer(new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5])), 2, 8, 0, 0);
    this.labelInst = gl.createBuffer()!;
    const ls = CT_LABEL_STRIDE * 4;
    this.attr(this.labelProg, 'a_c', this.labelInst, 2, ls, 0, 1);
    this.attr(this.labelProg, 'a_uv', this.labelInst, 4, ls, 8, 1);
    this.attr(this.labelProg, 'a_size', this.labelInst, 2, ls, 24, 1);
    gl.bindVertexArray(null);

    this.tex = gl.createTexture();
    this.texH = 0;
    this.labelVersion = -1;
    if (this.atlas.canvas) { this.atlas.dirtyY0 = 0; this.atlas.dirtyY1 = this.atlas.canvas.height; }
    this.ok = true;
  }

  private buffer(data: Float32Array): WebGLBuffer {
    const gl = this.gl!;
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
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
      m = { buf: this.buffer(d), vertCount: d.length / GEOM_VERT_SIZE };
      this.meshBufs.set(id, m);
    }
    return m;
  }

  private pointParts(first: number, circle: boolean): void {
    const gl = this.gl!;
    const L = this.loc;
    const s = CT_GPU_PART_STRIDE * 4, o = first * s;
    if (circle) {
      if (L.cTile >= 0) gl.vertexAttribPointer(L.cTile, 2, gl.FLOAT, false, s, o);
      if (L.cPos >= 0) gl.vertexAttribPointer(L.cPos, 2, gl.FLOAT, false, s, o + 8);
      if (L.cScale >= 0) gl.vertexAttribPointer(L.cScale, 2, gl.FLOAT, false, s, o + 20);
      if (L.cColor >= 0) gl.vertexAttribPointer(L.cColor, 3, gl.FLOAT, false, s, o + 28);
      if (L.cDepth >= 0) gl.vertexAttribPointer(L.cDepth, 1, gl.FLOAT, false, s, o + 44);
      return;
    }
    if (L.pTile >= 0) gl.vertexAttribPointer(L.pTile, 2, gl.FLOAT, false, s, o);
    if (L.pPos >= 0) gl.vertexAttribPointer(L.pPos, 2, gl.FLOAT, false, s, o + 8);
    if (L.pRot >= 0) gl.vertexAttribPointer(L.pRot, 1, gl.FLOAT, false, s, o + 16);
    if (L.pScale >= 0) gl.vertexAttribPointer(L.pScale, 2, gl.FLOAT, false, s, o + 20);
    if (L.pColor >= 0) gl.vertexAttribPointer(L.pColor, 3, gl.FLOAT, false, s, o + 28);
    if (L.pAspect >= 0) gl.vertexAttribPointer(L.pAspect, 1, gl.FLOAT, false, s, o + 40);
    if (L.pDepth >= 0) gl.vertexAttribPointer(L.pDepth, 1, gl.FLOAT, false, s, o + 44);
  }

  private partUniforms(prog: WebGLProgram, u: (WebGLUniformLocation | null)[], f: CtFrame, sx: number, sy: number, ox: number, oy: number): void {
    const gl = this.gl!;
    gl.useProgram(prog);
    gl.uniform4f(u[0], sx, sy, ox, oy);
    gl.uniform1f(u[1], f.icon);
    gl.uniform3f(u[2], f.ink[0], f.ink[1], f.ink[2]);
    gl.uniform1f(u[3], f.strokeBlend);
    gl.uniform1f(u[4], f.a);
    gl.uniform1f(u[5], this.a2c ? 1 : 0);
  }

  upload(packed: CtPacked): void {
    this.packed = packed;
    if (!this.ok) return;
    const gl = this.gl!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tileInst);
    gl.bufferData(gl.ARRAY_BUFFER, packed.tiles, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineInst);
    gl.bufferData(gl.ARRAY_BUFFER, packed.segs, gl.STATIC_DRAW);
    for (const b of this.batches) { gl.deleteVertexArray(b.vao); gl.deleteBuffer(b.inst); }
    this.batches = [];
    const s = CT_GPU_PART_STRIDE * 4;
    for (const pb of packed.batches) {
      const circle = pb.mesh === CT_MESH_CIRCLE;
      const p = circle ? this.circProg! : this.partProg!;
      const m = this.mesh(pb.mesh);
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      this.attr(p, 'a_localPos', m.buf, 2, GEOM_VERT_SIZE * 4, 0, 0);
      this.attr(p, 'a_strokeOffset', m.buf, 2, GEOM_VERT_SIZE * 4, 8, 0);
      this.attr(p, 'a_isStroke', m.buf, 1, GEOM_VERT_SIZE * 4, 16, 0);
      const inst = this.buffer(pb.data);
      this.attr(p, 'a_tile', inst, 2, s, 0, 1);
      this.attr(p, 'a_pos', inst, 2, s, 8, 1);
      this.attr(p, 'a_rot', inst, 1, s, 16, 1);
      this.attr(p, 'a_scale', inst, 2, s, 20, 1);
      this.attr(p, 'a_color', inst, 3, s, 28, 1);
      this.attr(p, 'a_aspect', inst, 1, s, 40, 1);
      this.attr(p, 'a_depth', inst, 1, s, 44, 1);
      this.batches.push({ mesh: pb.mesh, circle, vao, inst, count: pb.count, colStart: pb.colStart, vertCount: m.vertCount });
    }
    gl.bindVertexArray(null);
    if (this.labelData.length < packed.tileCount * CT_LABEL_STRIDE) this.labelData = new Float32Array(packed.tileCount * CT_LABEL_STRIDE);
    this.labelVersion = -1;
  }

  release(): void {
    this.canvas.width = 1; this.canvas.height = 1;
  }

  setSize(w: number, h: number): boolean {
    if (this.canvas.width === w && this.canvas.height === h) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    return true;
  }

  private syncLabels(): boolean {
    const gl = this.gl!;
    const at = this.atlas;
    let changed = false;
    if (at.canvas && at.dirtyY1 > at.dirtyY0) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      if (this.texH !== at.canvas.height) {
        this.texH = at.canvas.height;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, at.canvas);
      } else {
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, at.dirtyY0);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, at.dirtyY0, ATLAS_W, at.dirtyY1 - at.dirtyY0, gl.RGBA, gl.UNSIGNED_BYTE, at.canvas);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      }
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      at.dirtyY0 = Infinity; at.dirtyY1 = 0;
      changed = true;
    }
    if (this.packed && this.labelVersion !== at.version) {
      this.labelVersion = at.version;
      ctPackLabels(this.packed, (n) => at.cells.get(n), this.labelData);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.labelInst);
      gl.bufferData(gl.ARRAY_BUFFER, this.labelData.subarray(0, this.packed.tileCount * CT_LABEL_STRIDE), gl.STATIC_DRAW);
      changed = true;
    }
    return changed;
  }

  labelsBusy(): boolean { return this.atlas.pending() || this.atlas.dirtyY1 > this.atlas.dirtyY0 || this.labelVersion !== this.atlas.version; }

  syncNames(): boolean { return this.ok && this.packed ? this.syncLabels() : false; }
  takeRestored(): boolean { const r = this._restored; this._restored = false; return r; }
  private _restored = false;

  draw(f: CtFrame): void {
    const gl = this.gl;
    const pk = this.packed;
    if (!gl || !this.ok || !pk) return;
    gl.viewport(0, 0, f.w, f.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!(f.a > 0)) return;

    const sx = (2 * f.a) / f.w, sy = -(2 * f.a) / f.h;
    const ox = -f.cx * sx + (2 * f.px / f.w - 1), oy = -f.cy * sy + (1 - 2 * f.py / f.h);
    ctVisibleCols(f.cx, f.w, f.a, pk.cols, this._cols);
    const c0 = this._cols[0], c1 = this._cols[1];
    gl.enable(gl.BLEND);

    if (pk.segCount > 0) {
      gl.useProgram(this.lineProg);
      gl.blendEquation(gl.MAX);
      gl.uniform4f(this.u.lCam, sx, sy, ox, oy);
      gl.uniform1f(this.u.lReach, CT_LINE_UNITS / 2 + 1.5 / f.a);
      gl.uniform1f(this.u.lPx, f.a);
      gl.uniform1f(this.u.lHalf, CT_LINE_UNITS / 2);
      gl.uniform4f(this.u.lColor, f.line[0], f.line[1], f.line[2], f.line[3]);
      gl.bindVertexArray(this.lineVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, pk.segCount);
      gl.blendEquation(gl.FUNC_ADD);
    }
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    if (c0 > c1) { gl.bindVertexArray(null); return; }

    const t0 = pk.tileColStart[c0], t1 = pk.tileColStart[c1 + 1];
    if (t1 > t0) {
      gl.useProgram(this.tileProg);
      gl.uniform4f(this.u.tCam, sx, sy, ox, oy);
      gl.uniform4f(this.u.tRing, f.ink[0], f.ink[1], f.ink[2], 1);
      gl.bindVertexArray(this.tileVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tileInst);
      const s = CT_TILE_STRIDE * 4, o = t0 * s, L = this.loc;
      if (L.tC >= 0) gl.vertexAttribPointer(L.tC, 2, gl.FLOAT, false, s, o);
      if (L.tTop >= 0) gl.vertexAttribPointer(L.tTop, 3, gl.FLOAT, false, s, o + 8);
      if (L.tBand >= 0) gl.vertexAttribPointer(L.tBand, 3, gl.FLOAT, false, s, o + 20);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, this.tileVerts, t1 - t0);
    }

    if (f.icon > 0) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      this.partUniforms(this.partProg!, this.partU, f, sx, sy, ox, oy);
      this.partUniforms(this.circProg!, this.circU, f, sx, sy, ox, oy);
      gl.uniform4f(this.u.cView, 0, 0, f.w, f.h);
      gl.uniform1f(this.u.cYFix, 1);
      if (this.a2c) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      let onCircle = true;
      for (const b of this.batches) {
        const i0 = b.colStart[c0], i1 = b.colStart[c1 + 1];
        if (i1 <= i0) continue;
        if (b.circle !== onCircle) { onCircle = b.circle; gl.useProgram(onCircle ? this.circProg : this.partProg); }
        gl.bindVertexArray(b.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, b.inst);
        this.pointParts(i0, b.circle);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, b.vertCount, i1 - i0);
      }
      if (this.a2c) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      gl.disable(gl.DEPTH_TEST);
    }

    if (f.nameScale > 0 && this.texH > 0 && t1 > t0) {
      gl.useProgram(this.labelProg);
      gl.uniform4f(this.u.nCam, sx, sy, ox, oy);
      gl.uniform1f(this.u.nMid, f.nameMid);
      gl.uniform1f(this.u.nScale, f.nameScale);
      gl.uniform2f(this.u.nView, f.w, f.h);
      gl.uniform1f(this.u.nSnap, f.snap ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(this.u.nTex, 0);
      gl.bindVertexArray(this.labelVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.labelInst);
      const s = CT_LABEL_STRIDE * 4, o = t0 * s, L = this.loc;
      if (L.nC >= 0) gl.vertexAttribPointer(L.nC, 2, gl.FLOAT, false, s, o);
      if (L.nUv >= 0) gl.vertexAttribPointer(L.nUv, 4, gl.FLOAT, false, s, o + 8);
      if (L.nSize >= 0) gl.vertexAttribPointer(L.nSize, 2, gl.FLOAT, false, s, o + 24);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, t1 - t0);
    }
    gl.bindVertexArray(null);
  }
}

let _gl: ClassTreeGL | null = null;
export function classTreeGL(): ClassTreeGL {
  if (!_gl) _gl = new ClassTreeGL();
  return _gl;
}
