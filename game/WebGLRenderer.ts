import { DBG_LINE_BATCH, DBG_DISC_BATCH, DBG_CAP_BATCH } from '../utils/overlayGeom';
import { flashWhite } from '../utils/motionArras';
import { isSoftwareRendererName } from '../utils/gpuDetect';
import { HW_KINDS, HW_BATCH, HW_VEIL, outlineFansFromMiddle, cleanOutline, type HalloweenMeshes } from '../utils/halloween';
import { outlineFillTriangles, outlineStrokeLoops } from '../utils/outlineFill';
import { SMALL_FIX } from './smallFixSwitch';

const INSTANCE_STRIDE = 12;
const MAX_INSTANCES = 60000;
const ATLAS_SIZE = 2048;
const ATLAS_PADDING = 2;
const VERT_SRC = `#version 300 es
precision highp float;

in vec2 a_quadPos;

in vec2 a_worldPos;
in float a_rotation;
in vec2 a_scale;
in float a_alpha;
in vec4 a_uvRect;
in float a_dmgOverlay;
in float a_depth;

uniform vec4 u_camera;

out vec2 v_uv;
out float v_alpha;
out float v_dmgOverlay;

void main() {
    vec2 scaled = a_quadPos * a_scale;
    float c = cos(a_rotation);
    float s = sin(a_rotation);
    vec2 worldVertex = vec2(
        scaled.x * c - scaled.y * s,
        scaled.x * s + scaled.y * c
    ) + a_worldPos;

    gl_Position = vec4(
        worldVertex.x * u_camera.x + u_camera.z,
        worldVertex.y * u_camera.y + u_camera.w,
        a_depth, 1.0
    );

    v_uv = a_uvRect.xy + (a_quadPos + 0.5) * a_uvRect.zw;
    v_alpha = a_alpha;
    v_dmgOverlay = a_dmgOverlay;
}
`;

const FRAG_SRC = `#version 300 es
precision mediump float;

in vec2 v_uv;
in float v_alpha;
in float v_dmgOverlay;

uniform sampler2D u_atlas;
uniform float u_flashTo;

out vec4 fragColor;

void main() {
    vec4 texColor = texture(u_atlas, v_uv);
    if (texColor.a < 0.004) discard;
    texColor.rgb = mix(texColor.rgb, vec3(texColor.a * u_flashTo), v_dmgOverlay);
    float a = texColor.a * v_alpha;
    fragColor = vec4(texColor.rgb * a, a);
}
`;

const _OLD_RENDER: boolean = typeof location !== 'undefined' && /[?&]oldcircles(?:[=&]|$)/.test(location.search);
export const EXACT_CIRCLES: boolean = !_OLD_RENDER;
export const EXACT_CORNERS: boolean = !_OLD_RENDER;

export const GEOM_COLOR_GLSL = `
vec3 geomFill(vec3 fill, float dmg, float flashTo) { return mix(fill, vec3(flashTo), dmg); }
vec3 geomStroke(vec3 blendedFill, float darkMode, float blend) {
    float border = 0.2824 - 0.2824 * darkMode;
    return mix(blendedFill, vec3(border), blend);
}
`;

export const RIM_GLSL = `
float rimFillToLine(float d, float rPx) { return smoothstep(rPx - 0.5, rPx + 0.5, d); }
float rimInside(float d, float edgePx) { return 1.0 - smoothstep(edgePx - 0.5, edgePx + 0.5, d); }
float rimCoverage(float t, float c) { return 1.0 - t * (1.0 - c); }
float rimAlpha(float cov, float alpha, float a2c) {
    if (cov >= 1.0) return alpha;
    return alpha * mix(cov, sqrt(cov), a2c);
}
`;

const CAP_FAR_GLSL = `
float capFarY(float w, float tx, float nx, float ny) { return (w - tx * nx) / ny; }
`;

export const GEOM_VERT_SRC = `#version 300 es
precision highp float;

in vec2 a_localPos;
in vec2 a_strokeOffset;
in float a_isStroke;
in vec2 a_gWorldPos;
in float a_gRotation;
in vec2 a_gScale;
in vec3 a_gFillColor;
in float a_gDmgOverlay;
in float a_gDepth;
in float a_gAspect;
in float a_gAlpha;

uniform vec4 u_camera;
uniform float u_darkMode;
uniform float u_blend;
uniform float u_flashTo;
uniform float u_strokeK;
uniform vec3 u_ink;

out vec3 v_color;
out float v_alpha;
out vec3 v_cap;
${GEOM_COLOR_GLSL}${CAP_FAR_GLSL}
void main() {
    float isS = min(a_isStroke, 1.0);
    vec2 pos = a_localPos;
    pos.y *= mix(1.0, a_gAspect, max(pos.x, 0.0));
    vec2 scaled = pos * a_gScale;
    vec2 strokeOff = a_strokeOffset;
    if (a_isStroke > 0.5 && abs(a_gAspect - 1.0) > 0.001) {
        float absX = abs(a_strokeOffset.x);
        float absY = abs(a_strokeOffset.y);
        if (absY > absX * 2.0) {
            float sg = sign(a_strokeOffset.y);
            float taperDy = -0.5 * (a_gAspect - 1.0) * a_gScale.y;
            vec2 n = vec2(taperDy, sg * a_gScale.x);
            float nLen = length(n);
            if (nLen > 0.001) {
                strokeOff = (n / nLen) * length(a_strokeOffset);
            }
        } else if (a_isStroke > 1.5 && absX > 0.001 && absY > 0.001) {
            float sg = sign(a_strokeOffset.y);
            float taperDy = -0.5 * (a_gAspect - 1.0) * a_gScale.y;
            vec2 n = vec2(taperDy, sg * a_gScale.x);
            float nLen = length(n);
            if (nLen > 0.001 && abs(n.y) > nLen * 0.2) {
                float w = a_isStroke - 1.0;
                float tx = sign(a_strokeOffset.x) * w;
                strokeOff = vec2(tx, capFarY(w, tx, n.x / nLen, n.y / nLen));
            }
        }
    }
    float strokeK = max(u_strokeK, 1.0);
    strokeOff *= strokeK;
    scaled += strokeOff;
    float c = cos(a_gRotation);
    float s = sin(a_gRotation);
    vec2 worldVertex = vec2(
        scaled.x * c - scaled.y * s,
        scaled.x * s + scaled.y * c
    ) + a_gWorldPos;
    float depth = a_gDepth - isS * 0.000006;
    gl_Position = vec4(
        worldVertex.x * u_camera.x + u_camera.z,
        worldVertex.y * u_camera.y + u_camera.w,
        depth, 1.0
    );
    float hl = step(1.5, a_gDmgOverlay);
    float only = step(3.5, a_gDmgOverlay);
    if (only * (1.0 - isS) > 0.5) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    vec3 blendedFill = geomFill(a_gFillColor, a_gDmgOverlay - 2.0 * (hl + only), u_flashTo);
    v_color = mix(blendedFill, mix(geomStroke(blendedFill, u_darkMode, u_blend), u_ink, hl), isS);
    v_alpha = a_gAlpha;
    v_cap = vec3(strokeOff, (a_isStroke - 1.0) * strokeK);
}
`;

export const GEOM_FRAG_SRC_OLD = `#version 300 es
precision mediump float;
in vec3 v_color;
in float v_alpha;
out vec4 fragColor;
void main() {
    fragColor = vec4(v_color * v_alpha, v_alpha);
}
`;

export const GEOM_FRAG_SRC = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_alpha;
in vec3 v_cap;
uniform float u_pxPerWorld;
uniform float u_a2c;
out vec4 fragColor;
${RIM_GLSL}
void main() {
    float a = v_alpha;
    if (v_cap.z > 0.5) {
        float c = rimInside(length(v_cap.xy) * u_pxPerWorld, v_cap.z * u_pxPerWorld);
        if (c <= 0.0) discard;
        a = rimAlpha(c, v_alpha, u_a2c);
    }
    fragColor = vec4(v_color * a, a);
}
`;

const GRID_VERT_SRC = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec4 a_rect;
in vec2 a_count;
uniform vec4 u_camera;
uniform vec2 u_pad;
flat out vec4 v_rect;
flat out vec2 v_count;
void main() {
    vec2 w = mix(a_rect.xy - u_pad, a_rect.zw + u_pad, a_corner);
    v_rect = a_rect;
    v_count = a_count;
    gl_Position = vec4(w.x * u_camera.x + u_camera.z, w.y * u_camera.y + u_camera.w, 0.0, 1.0);
}
`;
const GRID_FRAG_SRC = `#version 300 es
precision highp float;
flat in vec4 v_rect;
flat in vec2 v_count;
uniform vec4 u_camera;
uniform vec4 u_viewport;
uniform float u_spacing;
uniform vec4 u_color;
out vec4 fragColor;
float cum(float x, float c0, float s, float h, float n) {
    float u = x - (c0 - h);
    if (u <= 0.0) return 0.0;
    float k = floor(u / s);
    if (k > n) return (n + 1.0) * 2.0 * h;
    return k * 2.0 * h + min(u - k * s, 2.0 * h);
}
float span(float a, float b, float lo, float hi) { return max(0.0, min(b, hi) - max(a, lo)); }
void main() {
    vec2 ndc = (gl_FragCoord.xy - u_viewport.xy) / u_viewport.zw * 2.0 - 1.0;
    vec2 w = (ndc - u_camera.zw) / u_camera.xy;
    vec2 hp = 1.0 / abs(u_camera.xy * u_viewport.zw);
    float x0 = w.x - hp.x, x1 = w.x + hp.x, y0 = w.y - hp.y, y1 = w.y + hp.y;
    float hx = min(max(0.5, hp.x), 0.5 * u_spacing), hy = min(max(0.5, hp.y), 0.5 * u_spacing);
    float cv = (cum(x1, v_rect.x, u_spacing, hx, v_count.x) - cum(x0, v_rect.x, u_spacing, hx, v_count.x)) / (x1 - x0)
             * (0.5 / hx) * span(y0, y1, v_rect.y, v_rect.w) / (y1 - y0);
    float ch = (cum(y1, v_rect.y, u_spacing, hy, v_count.y) - cum(y0, v_rect.y, u_spacing, hy, v_count.y)) / (y1 - y0)
             * (0.5 / hy) * span(x0, x1, v_rect.x, v_rect.z) / (x1 - x0);
    float a = u_color.a * clamp(cv + ch - cv * ch, 0.0, 1.0);
    if (a <= 0.0) discard;
    fragColor = vec4(u_color.rgb * a, a);
}
`;
export const GRID_STRIDE = 6;

const FOG_VERT_SRC = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec4 a_puff;
in vec2 a_look;
uniform vec4 u_camera;
out vec2 v_local;
out float v_alpha;
out float v_shade;
out float v_soft;
void main() {
    vec2 w = a_puff.xy + a_corner * a_puff.z;
    v_local = a_corner; v_alpha = a_puff.w; v_shade = a_look.x; v_soft = a_look.y;
    gl_Position = vec4(w.x * u_camera.x + u_camera.z, w.y * u_camera.y + u_camera.w, 0.0, 1.0);
}
`;
const FOG_FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_local;
in float v_alpha;
in float v_shade;
in float v_soft;
out vec4 fragColor;
void main() {
    float d = length(v_local);
    float px = max(fwidth(d), 1e-4);
    float a = v_alpha * (1.0 - smoothstep(1.0 - px, 1.0, d));
    if (v_soft > 0.001) a *= 1.0 - smoothstep(1.0 - v_soft, 1.0, d);
    if (a <= 0.0) discard;
    fragColor = vec4(vec3(v_shade) * a, a);
}
`;
export const FOG_PUFF_STRIDE = 6;
const GRID_MAX = 64;

export const GEOM_INSTANCE_STRIDE = 12;

export const GEOM_VERT_SIZE = 5;
export const STROKE_HALF_WIDTH = 3.0;
const ARC_SEGMENTS = 4;
export const CIRCLE_MESH_SIDES = 16;
export const CIRCLE_FILL_MARGIN_PX = 1.5;
export const CIRCLE_RING_IN_MARGIN_PX = 2.5;
export const CIRCLE_RING_OUT_MARGIN_PX = 2.5;

export const CIRCLE_GLSL = `
const float STROKE_W = ${STROKE_HALF_WIDTH.toFixed(1)};
float circleCoverage(float piece, float d, float rPx, float wPx) {
    bool body = d <= rPx - 0.5;
    if (piece < 0.5) return body ? 1.0 : -1.0;
    if (body) return -1.0;
    float cov = rimCoverage(rimFillToLine(d, rPx), rimInside(d, rPx + wPx));
    return cov > 0.0 ? cov : -1.0;
}
vec3 circleColor(vec3 fill, vec3 line, float t, float c, float cov) {
    return (fill * (1.0 - t) + line * (t * c)) / cov;
}
float circleVertRadius(float r, float addLine, float marginPx, float pxPerWorld) {
    return max(r + addLine * STROKE_W + marginPx / pxPerWorld, 0.0);
}
`;

export const CIRCLE_VERT_SRC = `#version 300 es
precision highp float;

in vec2 a_localPos;
in vec2 a_strokeOffset;
in float a_isStroke;
in vec2 a_gWorldPos;
in vec2 a_gScale;
in vec3 a_gFillColor;
in float a_gDmgOverlay;
in float a_gDepth;
in float a_gAlpha;

uniform vec4 u_camera;
uniform float u_darkMode;
uniform float u_blend;
uniform float u_flashTo;
uniform vec4 u_viewport;
uniform float u_pxPerWorld;
uniform float u_strokeK;
uniform vec3 u_ink;

flat out vec3 v_fill;
flat out vec3 v_stroke;
flat out float v_alpha;
flat out float v_piece;
flat out vec2 v_centerPx;
flat out float v_rPx;
${GEOM_COLOR_GLSL}${RIM_GLSL}${CIRCLE_GLSL}
void main() {
    float r = abs(a_gScale.x);
    float rad = circleVertRadius(r, a_strokeOffset.x * max(u_strokeK, 1.0), a_strokeOffset.y, u_pxPerWorld);
    vec2 world = a_gWorldPos + a_localPos * rad;
    float depth = a_gDepth - a_isStroke * 0.000006;
    gl_Position = vec4(
        world.x * u_camera.x + u_camera.z,
        world.y * u_camera.y + u_camera.w,
        depth, 1.0
    );
    vec2 centerNdc = vec2(
        a_gWorldPos.x * u_camera.x + u_camera.z,
        a_gWorldPos.y * u_camera.y + u_camera.w
    );
    v_centerPx = u_viewport.xy + (centerNdc * 0.5 + 0.5) * u_viewport.zw;
    v_rPx = r * u_pxPerWorld;
    float hl = step(1.5, a_gDmgOverlay);
    float only = step(3.5, a_gDmgOverlay);
    if (only * (1.0 - a_isStroke) > 0.5) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    vec3 blendedFill = geomFill(a_gFillColor, a_gDmgOverlay - 2.0 * (hl + only), u_flashTo);
    v_fill = blendedFill;
    v_stroke = mix(geomStroke(blendedFill, u_darkMode, u_blend), u_ink, hl);
    v_alpha = a_gAlpha;
    v_piece = a_isStroke;
}
`;

export const CIRCLE_FRAG_SRC = `#version 300 es
precision highp float;
flat in vec3 v_fill;
flat in vec3 v_stroke;
flat in float v_alpha;
flat in float v_piece;
flat in vec2 v_centerPx;
flat in float v_rPx;
uniform float u_pxPerWorld;
uniform float u_yFix;
uniform float u_a2c;
uniform float u_strokeK;
out vec4 fragColor;
${RIM_GLSL}${CIRCLE_GLSL}
void main() {
    vec2 q = gl_FragCoord.xy - v_centerPx;
    q.y *= u_yFix;
    float d = length(q);
    float wPx = STROKE_W * max(u_strokeK, 1.0) * u_pxPerWorld;
    float cov = circleCoverage(v_piece, d, v_rPx, wPx);
    if (cov < 0.0) discard;
    vec3 col = v_fill;
    if (v_piece > 0.5) {
        col = circleColor(v_fill, v_stroke, rimFillToLine(d, v_rPx), rimInside(d, v_rPx + wPx), cov);
    }
    float a = rimAlpha(cov, v_alpha, u_a2c);
    fragColor = vec4(col * a, a);
}
`;
const OUTLINE_BATCH_CAPACITY = 64;
const OUTLINE_BATCHES_MAX = 48;
const GEOM_INITIAL_CAPACITY = 8000;
const HW_CAPACITY = 2048;
export const POLY_BATCH_MAX_SIDES = 16;
export const POLY_BATCH_KEY: readonly string[] = (() => {
    const k: string[] = [];
    for (let s = 0; s <= POLY_BATCH_MAX_SIDES; s++) k.push(s >= 3 ? 'poly_' + s : '');
    return k;
})();

const DBG_DISC_SIDES = 20;
const DBG_CAP_SIDES = 10;
const DBG_LINE_CAPACITY = 32768;
const DBG_DISC_CAPACITY = 2048;
export const FOG_BATCH = 'fog_disc';
const FOG_DISC_SIDES = 24;
const FOG_CAPACITY = 4096;
export const AURA_BATCH = 'aura_ring';
const AURA_CAPACITY = 64;
const LOOK_CAPACITY = 256;
const DBG_CAP_CAPACITY = 2048;

interface KeptBlock {
    batch: GeomBatch;
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
    cap: number;
    count: number;
    order: number;
}
export interface KeptGeom {
    blocks: KeptBlock[];
    gen: number;
    minX: number; minY: number; maxX: number; maxY: number;
}
export function makeKeptGeom(): KeptGeom {
    return { blocks: [], gen: -1, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

interface GeomBatch {
    vertCount: number;
    vao: WebGLVertexArrayObject;
    vertexBuffer: WebGLBuffer;
    instanceBuffer: WebGLBuffer;
    instanceData: Float32Array;
    instanceCount: number;
    capacity: number;
    circle: boolean;
    reach: number;
}

const CAP_MAX_SWEEP = (100 * Math.PI) / 180;

function _emitExactCap(
    data: Float32Array, off: number,
    cx: number, cy: number,
    startAngle: number, sweep: number, w: number
): number {
    const parts = sweep > CAP_MAX_SWEEP ? 2 : 1;
    const tag = 1 + w;
    for (let k = 0; k < parts; k++) {
        const b0 = startAngle + (k / parts) * sweep;
        const b1 = startAngle + ((k + 1) / parts) * sweep;
        const far = w / Math.cos((b1 - b0) / 2);
        const bm = (b0 + b1) / 2;
        const p0x = Math.cos(b0) * w, p0y = Math.sin(b0) * w;
        const p1x = Math.cos(b1) * w, p1y = Math.sin(b1) * w;
        const fx = Math.cos(bm) * far, fy = Math.sin(bm) * far;
        data[off++] = cx; data[off++] = cy; data[off++] = 0;   data[off++] = 0;   data[off++] = tag;
        data[off++] = cx; data[off++] = cy; data[off++] = p0x; data[off++] = p0y; data[off++] = tag;
        data[off++] = cx; data[off++] = cy; data[off++] = fx;  data[off++] = fy;  data[off++] = tag;
        data[off++] = cx; data[off++] = cy; data[off++] = 0;   data[off++] = 0;   data[off++] = tag;
        data[off++] = cx; data[off++] = cy; data[off++] = fx;  data[off++] = fy;  data[off++] = tag;
        data[off++] = cx; data[off++] = cy; data[off++] = p1x; data[off++] = p1y; data[off++] = tag;
    }
    return off;
}

export function _triangulateExactCircle(): Float32Array {
    const n = CIRCLE_MESH_SIDES;
    const sec = 1 / Math.cos(Math.PI / n);
    const data = new Float32Array((n * 3 + n * 6) * GEOM_VERT_SIZE);
    let off = 0;
    for (let i = 0; i < n; i++) {
        const a0 = (Math.PI * 2 * i) / n, a1 = (Math.PI * 2 * (i + 1)) / n;
        data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = Math.cos(a0) * sec; data[off++] = Math.sin(a0) * sec; data[off++] = 0; data[off++] = CIRCLE_FILL_MARGIN_PX; data[off++] = 0;
        data[off++] = Math.cos(a1) * sec; data[off++] = Math.sin(a1) * sec; data[off++] = 0; data[off++] = CIRCLE_FILL_MARGIN_PX; data[off++] = 0;
    }
    for (let i = 0; i < n; i++) {
        const a0 = (Math.PI * 2 * i) / n, a1 = (Math.PI * 2 * (i + 1)) / n;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        data[off++] = c0; data[off++] = s0; data[off++] = 0; data[off++] = -CIRCLE_RING_IN_MARGIN_PX; data[off++] = 1;
        data[off++] = c1; data[off++] = s1; data[off++] = 0; data[off++] = -CIRCLE_RING_IN_MARGIN_PX; data[off++] = 1;
        data[off++] = c1 * sec; data[off++] = s1 * sec; data[off++] = 1; data[off++] = CIRCLE_RING_OUT_MARGIN_PX; data[off++] = 1;
        data[off++] = c0; data[off++] = s0; data[off++] = 0; data[off++] = -CIRCLE_RING_IN_MARGIN_PX; data[off++] = 1;
        data[off++] = c1 * sec; data[off++] = s1 * sec; data[off++] = 1; data[off++] = CIRCLE_RING_OUT_MARGIN_PX; data[off++] = 1;
        data[off++] = c0 * sec; data[off++] = s0 * sec; data[off++] = 1; data[off++] = CIRCLE_RING_OUT_MARGIN_PX; data[off++] = 1;
    }
    return data;
}

export function _triangulatePolygonWithStroke(sides: number, exactCaps: boolean = false): Float32Array {
    const fillTriCount = sides;
    const strokeEdgeTriCount = sides * 2;
    const strokeArcTriCount = sides * ARC_SEGMENTS;
    const totalTris = fillTriCount + strokeEdgeTriCount + strokeArcTriCount;
    const totalVerts = totalTris * 3;
    const data = new Float32Array(totalVerts * GEOM_VERT_SIZE);
    let off = 0;

    const vx = new Float64Array(sides);
    const vy = new Float64Array(sides);
    for (let i = 0; i < sides; i++) {
        const a = (Math.PI * 2 * i) / sides;
        vx[i] = Math.cos(a);
        vy[i] = Math.sin(a);
    }

    const normalAngles = new Float64Array(sides);
    for (let i = 0; i < sides; i++) {
        normalAngles[i] = (Math.PI * 2 * (i + 0.5)) / sides;
    }

    for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = vx[i]; data[off++] = vy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = vx[ni]; data[off++] = vy[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    }

    for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        const na = normalAngles[i];
        const enx = Math.cos(na) * STROKE_HALF_WIDTH;
        const eny = Math.sin(na) * STROKE_HALF_WIDTH;

        data[off++] = vx[i]; data[off++] = vy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = vx[ni]; data[off++] = vy[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = vx[ni]; data[off++] = vy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
        data[off++] = vx[i]; data[off++] = vy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = vx[ni]; data[off++] = vy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
        data[off++] = vx[i]; data[off++] = vy[i]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
    }

    for (let i = 0; i < sides; i++) {
        const prevEdge = (i - 1 + sides) % sides;
        const prevAngle = normalAngles[prevEdge];
        const nextAngle = normalAngles[i];
        let sweep = nextAngle - prevAngle;
        if (sweep < 0) sweep += Math.PI * 2;

        if (exactCaps) { off = _emitExactCap(data, off, vx[i], vy[i], prevAngle, sweep, STROKE_HALF_WIDTH); continue; }
        for (let j = 0; j < ARC_SEGMENTS; j++) {
            const a0 = prevAngle + (j / ARC_SEGMENTS) * sweep;
            const a1 = prevAngle + ((j + 1) / ARC_SEGMENTS) * sweep;
            data[off++] = vx[i]; data[off++] = vy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
            data[off++] = vx[i]; data[off++] = vy[i];
            data[off++] = Math.cos(a0) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a0) * STROKE_HALF_WIDTH; data[off++] = 1;
            data[off++] = vx[i]; data[off++] = vy[i];
            data[off++] = Math.cos(a1) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a1) * STROKE_HALF_WIDTH; data[off++] = 1;
        }
    }

    return off < data.length ? data.subarray(0, off) : data;
}

export function _triangulateBarrelWithStroke(exactCaps: boolean = false): Float32Array {
    const bvx = [0, 1, 1, 0];
    const bvy = [-0.5, -0.5, 0.5, 0.5];
    const bnx = [0, 1, 0, -1];
    const bny = [-1, 0, 1, 0];
    const bnAngles = [Math.PI * 1.5, 0, Math.PI * 0.5, Math.PI];

    const fillTriCount = 2;
    const strokeEdgeTriCount = 4 * 2;
    const strokeArcTriCount = 4 * ARC_SEGMENTS;
    const totalVerts = (fillTriCount + strokeEdgeTriCount + strokeArcTriCount) * 3;
    const data = new Float32Array(totalVerts * GEOM_VERT_SIZE);
    let off = 0;

    data[off++] = 0; data[off++] = -0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 1; data[off++] = -0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 1; data[off++] = 0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 0; data[off++] = -0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 1; data[off++] = 0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 0; data[off++] = 0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;

    for (let i = 0; i < 4; i++) {
        const ni = (i + 1) % 4;
        const enx = bnx[i] * STROKE_HALF_WIDTH;
        const eny = bny[i] * STROKE_HALF_WIDTH;

        data[off++] = bvx[i]; data[off++] = bvy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = bvx[ni]; data[off++] = bvy[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = bvx[ni]; data[off++] = bvy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;

        data[off++] = bvx[i]; data[off++] = bvy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = bvx[ni]; data[off++] = bvy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
        data[off++] = bvx[i]; data[off++] = bvy[i]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
    }

    for (let i = 0; i < 4; i++) {
        const prevEdge = (i - 1 + 4) % 4;
        const prevAngle = bnAngles[prevEdge];
        let sweep = bnAngles[i] - prevAngle;
        if (sweep < 0) sweep += Math.PI * 2;

        if (exactCaps) { off = _emitExactCap(data, off, bvx[i], bvy[i], prevAngle, sweep, STROKE_HALF_WIDTH); continue; }
        for (let j = 0; j < ARC_SEGMENTS; j++) {
            const a0 = prevAngle + (j / ARC_SEGMENTS) * sweep;
            const a1 = prevAngle + ((j + 1) / ARC_SEGMENTS) * sweep;
            data[off++] = bvx[i]; data[off++] = bvy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
            data[off++] = bvx[i]; data[off++] = bvy[i];
            data[off++] = Math.cos(a0) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a0) * STROKE_HALF_WIDTH; data[off++] = 1;
            data[off++] = bvx[i]; data[off++] = bvy[i];
            data[off++] = Math.cos(a1) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a1) * STROKE_HALF_WIDTH; data[off++] = 1;
        }
    }

    return off < data.length ? data.subarray(0, off) : data;
}

export function _triangulateCenteredRectWithStroke(exactCaps: boolean = false): Float32Array {
    const bvx = [-0.5, 0.5, 0.5, -0.5];
    const bvy = [-0.5, -0.5, 0.5, 0.5];
    const bnx = [0, 1, 0, -1];
    const bny = [-1, 0, 1, 0];
    const bnAngles = [Math.PI * 1.5, 0, Math.PI * 0.5, Math.PI];

    const fillTriCount = 2;
    const strokeEdgeTriCount = 4 * 2;
    const strokeArcTriCount = 4 * ARC_SEGMENTS;
    const totalVerts = (fillTriCount + strokeEdgeTriCount + strokeArcTriCount) * 3;
    const data = new Float32Array(totalVerts * GEOM_VERT_SIZE);
    let off = 0;

    data[off++] = -0.5; data[off++] = -0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 0.5; data[off++] = -0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 0.5; data[off++] = 0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = -0.5; data[off++] = -0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 0.5; data[off++] = 0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = -0.5; data[off++] = 0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;

    for (let i = 0; i < 4; i++) {
        const ni = (i + 1) % 4;
        const enx = bnx[i] * STROKE_HALF_WIDTH;
        const eny = bny[i] * STROKE_HALF_WIDTH;
        data[off++] = bvx[i]; data[off++] = bvy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = bvx[ni]; data[off++] = bvy[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = bvx[ni]; data[off++] = bvy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
        data[off++] = bvx[i]; data[off++] = bvy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = bvx[ni]; data[off++] = bvy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
        data[off++] = bvx[i]; data[off++] = bvy[i]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
    }

    for (let i = 0; i < 4; i++) {
        const prevEdge = (i - 1 + 4) % 4;
        const prevAngle = bnAngles[prevEdge];
        let sweep = bnAngles[i] - prevAngle;
        if (sweep < 0) sweep += Math.PI * 2;
        if (exactCaps) { off = _emitExactCap(data, off, bvx[i], bvy[i], prevAngle, sweep, STROKE_HALF_WIDTH); continue; }
        for (let j = 0; j < ARC_SEGMENTS; j++) {
            const a0 = prevAngle + (j / ARC_SEGMENTS) * sweep;
            const a1 = prevAngle + ((j + 1) / ARC_SEGMENTS) * sweep;
            data[off++] = bvx[i]; data[off++] = bvy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
            data[off++] = bvx[i]; data[off++] = bvy[i];
            data[off++] = Math.cos(a0) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a0) * STROKE_HALF_WIDTH; data[off++] = 1;
            data[off++] = bvx[i]; data[off++] = bvy[i];
            data[off++] = Math.cos(a1) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a1) * STROKE_HALF_WIDTH; data[off++] = 1;
        }
    }
    return off < data.length ? data.subarray(0, off) : data;
}

function _triangulateFillRectOnly(): Float32Array {
    const totalVerts = 6;
    const data = new Float32Array(totalVerts * GEOM_VERT_SIZE);
    let off = 0;
    data[off++] = -0.5; data[off++] = -0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 0.5;  data[off++] = -0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 0.5;  data[off++] = 0.5;  data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = -0.5; data[off++] = -0.5; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = 0.5;  data[off++] = 0.5;  data[off++] = 0; data[off++] = 0; data[off++] = 0;
    data[off++] = -0.5; data[off++] = 0.5;  data[off++] = 0; data[off++] = 0; data[off++] = 0;
    return data;
}

function _triangulateFillDiscOnly(sides: number): Float32Array {
    const totalVerts = sides * 3;
    const data = new Float32Array(totalVerts * GEOM_VERT_SIZE);
    let off = 0;
    for (let i = 0; i < sides; i++) {
        const a0 = (Math.PI * 2 * i) / sides;
        const a1 = (Math.PI * 2 * (i + 1)) / sides;
        data[off++] = 0;             data[off++] = 0;             data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = Math.cos(a0);  data[off++] = Math.sin(a0);  data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = Math.cos(a1);  data[off++] = Math.sin(a1);  data[off++] = 0; data[off++] = 0; data[off++] = 0;
    }
    return data;
}

function _triangulateFillHalfDiscOnly(sides: number): Float32Array {
    const totalVerts = sides * 3;
    const data = new Float32Array(totalVerts * GEOM_VERT_SIZE);
    const span = Math.PI / sides;
    let off = 0;
    for (let i = 0; i < sides; i++) {
        const a0 = -Math.PI / 2 + i * span;
        const a1 = -Math.PI / 2 + (i + 1) * span;
        data[off++] = 0;             data[off++] = 0;             data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = Math.cos(a0);  data[off++] = Math.sin(a0);  data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = Math.cos(a1);  data[off++] = Math.sin(a1);  data[off++] = 0; data[off++] = 0; data[off++] = 0;
    }
    return data;
}

export function _triangulateStarWithStroke(sides: number, innerRatio: number, exactCaps: boolean = false): Float32Array {
    const totalPoints = sides * 2;
    const svx = new Float64Array(totalPoints);
    const svy = new Float64Array(totalPoints);
    for (let i = 0; i < totalPoints; i++) {
        const a = (Math.PI * 2 * i) / totalPoints;
        const r = i % 2 === 0 ? 1.0 : innerRatio;
        svx[i] = r * Math.cos(a);
        svy[i] = r * Math.sin(a);
    }

    const snAngles = new Float64Array(totalPoints);
    for (let i = 0; i < totalPoints; i++) {
        const ni = (i + 1) % totalPoints;
        const dx = svx[ni] - svx[i];
        const dy = svy[ni] - svy[i];
        snAngles[i] = Math.atan2(-dx, dy);
    }

    const fillTriCount = totalPoints;
    const strokeEdgeTriCount = totalPoints * 2;
    const strokeArcTriCount = totalPoints * ARC_SEGMENTS;
    const totalVerts = (fillTriCount + strokeEdgeTriCount + strokeArcTriCount) * 3;
    const data = new Float32Array(totalVerts * GEOM_VERT_SIZE);
    let off = 0;

    for (let i = 0; i < totalPoints; i++) {
        const ni = (i + 1) % totalPoints;
        data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = svx[i]; data[off++] = svy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = svx[ni]; data[off++] = svy[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    }

    for (let i = 0; i < totalPoints; i++) {
        const ni = (i + 1) % totalPoints;
        const na = snAngles[i];
        const enx = Math.cos(na) * STROKE_HALF_WIDTH;
        const eny = Math.sin(na) * STROKE_HALF_WIDTH;

        data[off++] = svx[i]; data[off++] = svy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = svx[ni]; data[off++] = svy[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = svx[ni]; data[off++] = svy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;

        data[off++] = svx[i]; data[off++] = svy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = svx[ni]; data[off++] = svy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
        data[off++] = svx[i]; data[off++] = svy[i]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
    }

    for (let i = 0; i < totalPoints; i++) {
        const prevEdge = (i - 1 + totalPoints) % totalPoints;
        const prevAngle = snAngles[prevEdge];
        const nextAngle = snAngles[i];
        let sweep = nextAngle - prevAngle;
        if (sweep < 0) sweep += Math.PI * 2;
        if (sweep > Math.PI) sweep -= Math.PI * 2;
        if (sweep <= 0) continue;

        if (exactCaps) { off = _emitExactCap(data, off, svx[i], svy[i], prevAngle, sweep, STROKE_HALF_WIDTH); continue; }
        for (let j = 0; j < ARC_SEGMENTS; j++) {
            const a0 = prevAngle + (j / ARC_SEGMENTS) * sweep;
            const a1 = prevAngle + ((j + 1) / ARC_SEGMENTS) * sweep;
            data[off++] = svx[i]; data[off++] = svy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
            data[off++] = svx[i]; data[off++] = svy[i];
            data[off++] = Math.cos(a0) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a0) * STROKE_HALF_WIDTH; data[off++] = 1;
            data[off++] = svx[i]; data[off++] = svy[i];
            data[off++] = Math.cos(a1) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a1) * STROKE_HALF_WIDTH; data[off++] = 1;
        }
    }

    return data.subarray(0, off);
}

const CURVE_SEGMENTS = 8;
export function _triangulateCurvedStarWithStroke(sides: number, innerRatio: number, exactCaps: boolean = false): Float32Array {
    const totalPoints = sides * (CURVE_SEGMENTS + 1);
    const csvx: number[] = [];
    const csvy: number[] = [];

    for (let i = 0; i < sides; i++) {
        const outerAngle = (Math.PI * 2 * i) / sides;
        csvx.push(Math.cos(outerAngle));
        csvy.push(Math.sin(outerAngle));
        const halfAngle = (Math.PI * 2 * (i + 0.5)) / sides;
        const nextAngle = (Math.PI * 2 * (i + 1)) / sides;
        const cx = innerRatio * Math.cos(halfAngle);
        const cy = innerRatio * Math.sin(halfAngle);
        const px = Math.cos(nextAngle);
        const py = Math.sin(nextAngle);
        const ox = Math.cos(outerAngle);
        const oy = Math.sin(outerAngle);
        for (let s = 1; s <= CURVE_SEGMENTS; s++) {
            const t = s / (CURVE_SEGMENTS + 1);
            const mt = 1 - t;
            csvx.push(mt * mt * ox + 2 * mt * t * cx + t * t * px);
            csvy.push(mt * mt * oy + 2 * mt * t * cy + t * t * py);
        }
    }

    const N = csvx.length;
    const csna: number[] = [];
    for (let i = 0; i < N; i++) {
        const ni = (i + 1) % N;
        const dx = csvx[ni] - csvx[i];
        const dy = csvy[ni] - csvy[i];
        csna.push(Math.atan2(-dx, dy));
    }

    const maxVerts = (N + N * 2 + N * ARC_SEGMENTS) * 3;
    const data = new Float32Array(maxVerts * GEOM_VERT_SIZE);
    let off = 0;

    for (let i = 0; i < N; i++) {
        const ni = (i + 1) % N;
        data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = csvx[i]; data[off++] = csvy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = csvx[ni]; data[off++] = csvy[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    }

    for (let i = 0; i < N; i++) {
        const ni = (i + 1) % N;
        const na = csna[i];
        const enx = Math.cos(na) * STROKE_HALF_WIDTH;
        const eny = Math.sin(na) * STROKE_HALF_WIDTH;

        data[off++] = csvx[i]; data[off++] = csvy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = csvx[ni]; data[off++] = csvy[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = csvx[ni]; data[off++] = csvy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;

        data[off++] = csvx[i]; data[off++] = csvy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = csvx[ni]; data[off++] = csvy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
        data[off++] = csvx[i]; data[off++] = csvy[i]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
    }

    for (let i = 0; i < N; i++) {
        const prevEdge = (i - 1 + N) % N;
        const prevAngle = csna[prevEdge];
        const nextAngle = csna[i];
        let sweep = nextAngle - prevAngle;
        if (sweep < 0) sweep += Math.PI * 2;
        if (sweep > Math.PI) sweep -= Math.PI * 2;
        if (sweep <= 0.01) continue;

        if (exactCaps) { off = _emitExactCap(data, off, csvx[i], csvy[i], prevAngle, sweep, STROKE_HALF_WIDTH); continue; }
        for (let j = 0; j < ARC_SEGMENTS; j++) {
            const a0 = prevAngle + (j / ARC_SEGMENTS) * sweep;
            const a1 = prevAngle + ((j + 1) / ARC_SEGMENTS) * sweep;
            data[off++] = csvx[i]; data[off++] = csvy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
            data[off++] = csvx[i]; data[off++] = csvy[i];
            data[off++] = Math.cos(a0) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a0) * STROKE_HALF_WIDTH; data[off++] = 1;
            data[off++] = csvx[i]; data[off++] = csvy[i];
            data[off++] = Math.cos(a1) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a1) * STROKE_HALF_WIDTH; data[off++] = 1;
        }
    }

    return data.subarray(0, off);
}

export function _triangulateHealerCrossWithStroke(exactCaps: boolean = false): Float32Array {
    const hcx = [0.3, 1, 1, 0.3, 0.3, -0.3, -0.3, -1, -1, -0.3, -0.3, 0.3];
    const hcy = [-0.3, -0.3, 0.3, 0.3, 1, 1, 0.3, 0.3, -0.3, -0.3, -1, -1];
    const N = 12;
    const healerStrokeHW = STROKE_HALF_WIDTH * 0.7;
    const hcna: number[] = [];
    for (let i = 0; i < N; i++) {
        const ni = (i + 1) % N;
        const dx = hcx[ni] - hcx[i];
        const dy = hcy[ni] - hcy[i];
        hcna.push(Math.atan2(-dx, dy));
    }

    const maxVerts = (N + N * 2 + N * ARC_SEGMENTS) * 3;
    const data = new Float32Array(maxVerts * GEOM_VERT_SIZE);
    let off = 0;

    for (let i = 0; i < N; i++) {
        const ni = (i + 1) % N;
        data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = hcx[i]; data[off++] = hcy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = hcx[ni]; data[off++] = hcy[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    }

    for (let i = 0; i < N; i++) {
        const ni = (i + 1) % N;
        const na = hcna[i];
        const enx = Math.cos(na) * healerStrokeHW;
        const eny = Math.sin(na) * healerStrokeHW;

        data[off++] = hcx[i]; data[off++] = hcy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = hcx[ni]; data[off++] = hcy[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = hcx[ni]; data[off++] = hcy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;

        data[off++] = hcx[i]; data[off++] = hcy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = hcx[ni]; data[off++] = hcy[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
        data[off++] = hcx[i]; data[off++] = hcy[i]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
    }

    for (let i = 0; i < N; i++) {
        const prevEdge = (i - 1 + N) % N;
        const prevAngle = hcna[prevEdge];
        const nextAngle = hcna[i];
        let sweep = nextAngle - prevAngle;
        if (sweep < 0) sweep += Math.PI * 2;
        if (sweep > Math.PI) sweep -= Math.PI * 2;
        if (sweep <= 0) continue;

        if (exactCaps) { off = _emitExactCap(data, off, hcx[i], hcy[i], prevAngle, sweep, healerStrokeHW); continue; }
        for (let j = 0; j < ARC_SEGMENTS; j++) {
            const a0 = prevAngle + (j / ARC_SEGMENTS) * sweep;
            const a1 = prevAngle + ((j + 1) / ARC_SEGMENTS) * sweep;
            data[off++] = hcx[i]; data[off++] = hcy[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
            data[off++] = hcx[i]; data[off++] = hcy[i];
            data[off++] = Math.cos(a0) * healerStrokeHW; data[off++] = Math.sin(a0) * healerStrokeHW; data[off++] = 1;
            data[off++] = hcx[i]; data[off++] = hcy[i];
            data[off++] = Math.cos(a1) * healerStrokeHW; data[off++] = Math.sin(a1) * healerStrokeHW; data[off++] = 1;
        }
    }

    return data.subarray(0, off);
}

export function _triangulateOutlineWithStroke(pts: readonly (readonly [number, number])[], exactCaps: boolean = false): Float32Array {
    const N = pts.length;
    let area2 = 0;
    for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; area2 += a[0] * b[1] - a[1] * b[0]; }
    const px = new Float64Array(N), py = new Float64Array(N);
    for (let i = 0; i < N; i++) { const q = pts[area2 >= 0 ? i : N - 1 - i]; px[i] = q[0]; py[i] = q[1]; }
    const na = new Float64Array(N);
    for (let i = 0; i < N; i++) { const ni = (i + 1) % N; na[i] = Math.atan2(-(px[ni] - px[i]), py[ni] - py[i]); }

    const data = new Float32Array((N + N * 2 + N * ARC_SEGMENTS) * 3 * GEOM_VERT_SIZE);
    let off = 0;
    const ears = outlineFansFromMiddle(pts) ? null : outlineFillTriangles(pts);
    if (ears !== null) {
        for (let t = 0; t < ears.length; t += 2) { data[off++] = ears[t]; data[off++] = ears[t + 1]; data[off++] = 0; data[off++] = 0; data[off++] = 0; }
    } else for (let i = 0; i < N; i++) {
        const ni = (i + 1) % N;
        data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = px[i]; data[off++] = py[i]; data[off++] = 0; data[off++] = 0; data[off++] = 0;
        data[off++] = px[ni]; data[off++] = py[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 0;
    }
    const loops = outlineStrokeLoops(pts);
    if (loops !== null) {
        for (let L = 0; L < loops.length; L++) {
            const lp = loops[L], M = lp.length;
            const lx = new Float64Array(M), ly = new Float64Array(M), la = new Float64Array(M);
            for (let i = 0; i < M; i++) { const q = lp[area2 >= 0 ? i : M - 1 - i]; lx[i] = q[0]; ly[i] = q[1]; }
            for (let i = 0; i < M; i++) { const ni = (i + 1) % M; la[i] = Math.atan2(-(lx[ni] - lx[i]), ly[ni] - ly[i]); }
            off = _emitOutlineLines(data, off, lx, ly, la, M, exactCaps);
        }
        return data.subarray(0, off);
    }
    return data.subarray(0, _emitOutlineLines(data, off, px, py, na, N, exactCaps));
}

function _emitOutlineLines(data: Float32Array, off: number, px: Float64Array, py: Float64Array, na: Float64Array, N: number, exactCaps: boolean): number {
    for (let i = 0; i < N; i++) {
        const ni = (i + 1) % N;
        const enx = Math.cos(na[i]) * STROKE_HALF_WIDTH, eny = Math.sin(na[i]) * STROKE_HALF_WIDTH;
        data[off++] = px[i]; data[off++] = py[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = px[ni]; data[off++] = py[ni]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = px[ni]; data[off++] = py[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;

        data[off++] = px[i]; data[off++] = py[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = px[ni]; data[off++] = py[ni]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
        data[off++] = px[i]; data[off++] = py[i]; data[off++] = enx; data[off++] = eny; data[off++] = 1;
    }
    for (let i = 0; i < N; i++) {
        const prevAngle = na[(i - 1 + N) % N];
        let sweep = na[i] - prevAngle;
        if (sweep < 0) sweep += Math.PI * 2;
        if (sweep > Math.PI) sweep -= Math.PI * 2;
        if (sweep <= 1e-9) continue;

        if (exactCaps) { off = _emitExactCap(data, off, px[i], py[i], prevAngle, sweep, STROKE_HALF_WIDTH); continue; }
        for (let j = 0; j < ARC_SEGMENTS; j++) {
            const a0 = prevAngle + (j / ARC_SEGMENTS) * sweep;
            const a1 = prevAngle + ((j + 1) / ARC_SEGMENTS) * sweep;
            data[off++] = px[i]; data[off++] = py[i]; data[off++] = 0; data[off++] = 0; data[off++] = 1;
            data[off++] = px[i]; data[off++] = py[i];
            data[off++] = Math.cos(a0) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a0) * STROKE_HALF_WIDTH; data[off++] = 1;
            data[off++] = px[i]; data[off++] = py[i];
            data[off++] = Math.cos(a1) * STROKE_HALF_WIDTH; data[off++] = Math.sin(a1) * STROKE_HALF_WIDTH; data[off++] = 1;
        }
    }
    return off;
}

export function _triangulateLineStroke(exactCaps: boolean = false): Float32Array {
    const w = STROKE_HALF_WIDTH;
    const endX = [-1, 1];
    const normal = [-Math.PI / 2, Math.PI / 2];
    const data = new Float32Array((4 + 4 * ARC_SEGMENTS) * 3 * GEOM_VERT_SIZE);
    let off = 0;
    for (let e = 0; e < 2; e++) {
        const x0 = endX[e], x1 = endX[1 - e];
        const nx = Math.cos(normal[e]) * w, ny = Math.sin(normal[e]) * w;
        data[off++] = x0; data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = x1; data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = x1; data[off++] = 0; data[off++] = nx; data[off++] = ny; data[off++] = 1;

        data[off++] = x0; data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 1;
        data[off++] = x1; data[off++] = 0; data[off++] = nx; data[off++] = ny; data[off++] = 1;
        data[off++] = x0; data[off++] = 0; data[off++] = nx; data[off++] = ny; data[off++] = 1;
    }
    for (let e = 0; e < 2; e++) {
        const cx = endX[1 - e];
        if (exactCaps) { off = _emitExactCap(data, off, cx, 0, normal[e], Math.PI, w); continue; }
        const segs = ARC_SEGMENTS * 2;
        for (let j = 0; j < segs; j++) {
            const a0 = normal[e] + (j / segs) * Math.PI;
            const a1 = normal[e] + ((j + 1) / segs) * Math.PI;
            data[off++] = cx; data[off++] = 0; data[off++] = 0; data[off++] = 0; data[off++] = 1;
            data[off++] = cx; data[off++] = 0; data[off++] = Math.cos(a0) * w; data[off++] = Math.sin(a0) * w; data[off++] = 1;
            data[off++] = cx; data[off++] = 0; data[off++] = Math.cos(a1) * w; data[off++] = Math.sin(a1) * w; data[off++] = 1;
        }
    }
    return data.subarray(0, off);
}

export function _flatMesh(stroked: Float32Array): Float32Array {
    const out = new Float32Array(stroked);
    for (let i = 4; i < out.length; i += GEOM_VERT_SIZE) out[i] = 0;
    return out;
}

interface AtlasEntry {
    u0: number; v0: number;
    u1: number; v1: number;
    pixW: number;
    pixH: number;
}

export class WebGLBulletRenderer {
    private gl: WebGL2RenderingContext | null = null;
    private canvas: HTMLCanvasElement;
    private enabled: boolean = false;

    private program: WebGLProgram | null = null;
    private uCamera: WebGLUniformLocation | null = null;
    private uFlashTo: WebGLUniformLocation | null = null;

    private quadVAO: WebGLVertexArrayObject | null = null;
    private instanceBuffer: WebGLBuffer | null = null;
    private instanceData: Float32Array;
    private instanceCount: number = 0;

    private atlasTexture: WebGLTexture | null = null;
    private atlasEntries: Map<string, AtlasEntry> = new Map();
    private atlasCanvas: OffscreenCanvas | null = null;
    private atlasCtx: OffscreenCanvasRenderingContext2D | null = null;
    private atlasNextX: number = 0;
    private atlasNextY: number = 0;
    private atlasRowHeight: number = 0;
    private atlasDirty: boolean = false;

    private tagTexture: WebGLTexture | null = null;
    private _tagGen: number = 0;

    private _lastKey: string = '';
    private _lastEntry: AtlasEntry | null = null;

    private camScaleX: number = 0;
    private camScaleY: number = 0;
    private camOffsetX: number = 0;
    private camOffsetY: number = 0;

    private canvasW: number = 0;
    private canvasH: number = 0;

    private renderScale: number = 1;
    private viewW: number = 0;
    private viewH: number = 0;

    private _dirtyMinX = Infinity;
    private _dirtyMinY = Infinity;
    private _dirtyMaxX = -Infinity;
    private _dirtyMaxY = -Infinity;

    private geomProgram: WebGLProgram | null = null;
    private geomUCamera: WebGLUniformLocation | null = null;
    private geomUDarkMode: WebGLUniformLocation | null = null;
    private geomUFlashTo: WebGLUniformLocation | null = null;
    private geomBatches: Map<string, GeomBatch> = new Map();
    private readonly _starKeys: Map<number, string> = new Map();
    private _geomBatchArr: GeomBatch[] = [];
    private geomDarkMode: number = 0;
    private geomBlend: number = 0.598;
    private geomUBlend: WebGLUniformLocation | null = null;
    private circleUBlend: WebGLUniformLocation | null = null;
    private flashTo: number = 1.0;
    private _geomInited: boolean = false;
    private geomUPxPerWorld: WebGLUniformLocation | null = null;
    private geomUA2c: WebGLUniformLocation | null = null;
    private _exactCorners: boolean = false;

    private circleProgram: WebGLProgram | null = null;
    private _hwMeshes: HalloweenMeshes | null = null;
    private circleUCamera: WebGLUniformLocation | null = null;
    private circleUDarkMode: WebGLUniformLocation | null = null;
    private circleUFlashTo: WebGLUniformLocation | null = null;
    private circleUViewport: WebGLUniformLocation | null = null;
    private circleUPxPerWorld: WebGLUniformLocation | null = null;
    private circleUYFix: WebGLUniformLocation | null = null;
    private circleUA2c: WebGLUniformLocation | null = null;

    private _a2cOn: boolean = true;
    private _msaa: boolean = true;
    private strokeK: number = 1.0;
    private geomUStrokeK: WebGLUniformLocation | null = null;
    private geomUInk: WebGLUniformLocation | null = null;
    private circleUInk: WebGLUniformLocation | null = null;
    private circleUStrokeK: WebGLUniformLocation | null = null;
    private inkR: number = 0; private inkG: number = 0; private inkB: number = 0;
    private gridProgram: WebGLProgram | null = null;
    private gridVAO: WebGLVertexArrayObject | null = null;
    private gridBuffer: WebGLBuffer | null = null;
    private gridCornerBuffer: WebGLBuffer | null = null;
    private gridUCamera: WebGLUniformLocation | null = null;
    private gridUViewport: WebGLUniformLocation | null = null;
    private gridUSpacing: WebGLUniformLocation | null = null;
    private gridUColor: WebGLUniformLocation | null = null;
    private gridUPad: WebGLUniformLocation | null = null;
    private fogProgram: WebGLProgram | null = null;
    private fogVAO: WebGLVertexArrayObject | null = null;
    private fogBuffer: WebGLBuffer | null = null;
    private fogCornerBuffer: WebGLBuffer | null = null;
    private fogUCamera: WebGLUniformLocation | null = null;
    private fogCap = 0;
    private _fogFailed = false;
    private _gridFailed: boolean = false;
    private _software: number = -1;
    private _gpuGen: number = 0;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.instanceData = new Float32Array(MAX_INSTANCES * INSTANCE_STRIDE);
        if (SMALL_FIX.NH036 === 0) {
            this.atlasCanvas = new OffscreenCanvas(ATLAS_SIZE, ATLAS_SIZE);
            this.atlasCtx = this.atlasCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
        }
    }

    private _ensureAtlas(): boolean {
        if (!this.atlasCtx) {
            if (typeof OffscreenCanvas === 'undefined') return false;
            this.atlasCanvas = new OffscreenCanvas(ATLAS_SIZE, ATLAS_SIZE);
            this.atlasCtx = this.atlasCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
            if (!this.atlasCtx) return false;
        }
        const gl = this.gl;
        if (gl && !this.atlasTexture) {
            this.atlasTexture = this._makeAtlasTexture(gl);
            this.atlasDirty = false;
        }
        return true;
    }

    private _makeAtlasTexture(gl: WebGL2RenderingContext): WebGLTexture {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS_SIZE, ATLAS_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return tex;
    }

    init(): boolean {
        const gl = this.canvas.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: true,
            depth: true,
            stencil: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
        }) as WebGL2RenderingContext | null;

        if (!gl) return false;
        this.gl = gl;

        this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            this.enabled = false;
        });
        this.canvas.addEventListener('webglcontextrestored', () => {
            if (!this._rebuildGpuResources()) {
                console.error('[WebGL] Context restored but resource rebuild failed');
            }
        });

        if (!this._rebuildGpuResources()) return false;
        this.enabled = true;
        return true;
    }

    private _rebuildGpuResources(): boolean {
        const gl = this.gl;
        if (!gl) return false;

        const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
        const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
        if (!vs || !fs) return false;

        const prog = gl.createProgram()!;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('WebGL program link failed:', gl.getProgramInfoLog(prog));
            return false;
        }
        this.program = prog;
        gl.useProgram(prog);

        this.uCamera = gl.getUniformLocation(prog, 'u_camera');
        this.uFlashTo = gl.getUniformLocation(prog, 'u_flashTo');
        gl.uniform1f(this.uFlashTo, this.flashTo);
        this.quadVAO = gl.createVertexArray()!;
        gl.bindVertexArray(this.quadVAO);

        const quadVerts = new Float32Array([
            -0.5, -0.5,   0.5, -0.5,   0.5,  0.5,
            -0.5, -0.5,   0.5,  0.5,  -0.5,  0.5,
        ]);
        const quadBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

        const aQuadPos = gl.getAttribLocation(prog, 'a_quadPos');
        gl.enableVertexAttribArray(aQuadPos);
        gl.vertexAttribPointer(aQuadPos, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(aQuadPos, 0);
        this.instanceBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

        const stride = INSTANCE_STRIDE * 4;
        const aWorldPos = gl.getAttribLocation(prog, 'a_worldPos');
        gl.enableVertexAttribArray(aWorldPos);
        gl.vertexAttribPointer(aWorldPos, 2, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(aWorldPos, 1);

        const aRotation = gl.getAttribLocation(prog, 'a_rotation');
        gl.enableVertexAttribArray(aRotation);
        gl.vertexAttribPointer(aRotation, 1, gl.FLOAT, false, stride, 8);
        gl.vertexAttribDivisor(aRotation, 1);

        const aScale = gl.getAttribLocation(prog, 'a_scale');
        gl.enableVertexAttribArray(aScale);
        gl.vertexAttribPointer(aScale, 2, gl.FLOAT, false, stride, 12);
        gl.vertexAttribDivisor(aScale, 1);

        const aAlpha = gl.getAttribLocation(prog, 'a_alpha');
        gl.enableVertexAttribArray(aAlpha);
        gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, stride, 20);
        gl.vertexAttribDivisor(aAlpha, 1);

        const aUvRect = gl.getAttribLocation(prog, 'a_uvRect');
        gl.enableVertexAttribArray(aUvRect);
        gl.vertexAttribPointer(aUvRect, 4, gl.FLOAT, false, stride, 24);
        gl.vertexAttribDivisor(aUvRect, 1);

        const aDmgOverlay = gl.getAttribLocation(prog, 'a_dmgOverlay');
        gl.enableVertexAttribArray(aDmgOverlay);
        gl.vertexAttribPointer(aDmgOverlay, 1, gl.FLOAT, false, stride, 40);
        gl.vertexAttribDivisor(aDmgOverlay, 1);

        const aDepth = gl.getAttribLocation(prog, 'a_depth');
        gl.enableVertexAttribArray(aDepth);
        gl.vertexAttribPointer(aDepth, 1, gl.FLOAT, false, stride, 44);
        gl.vertexAttribDivisor(aDepth, 1);

        gl.bindVertexArray(null);

        this.atlasTexture = SMALL_FIX.NH036 === 0 ? this._makeAtlasTexture(gl) : null;

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        this._a2cOn = true;
        const _attrs = gl.getContextAttributes();
        this._msaa = !!(_attrs && _attrs.antialias);

        const _pv = gl.getExtension('WEBGL_provoking_vertex');
        if (_pv) _pv.provokingVertexWEBGL(_pv.FIRST_VERTEX_CONVENTION_WEBGL);

        this._geomInited = false;
        this.atlasEntries.clear();
        this.atlasNextX = 0;
        this.atlasNextY = 0;
        this.atlasRowHeight = 0;
        this._lastKey = '';
        this._lastEntry = null;
        if (this.atlasCtx) {
            this.atlasCtx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
        }
        this.atlasDirty = false;
        this.tagTexture = null;
        this.geomBatches.clear();
        this._geomBatchArr.length = 0;
        this.geomProgram = null;
        this.geomUCamera = null;
        this.geomUDarkMode = null; this.geomUBlend = null;
        this.geomUFlashTo = null;
        this.geomUPxPerWorld = null;
        this.geomUA2c = null;
        this.circleProgram = null;
        this.circleUCamera = null;
        this.circleUDarkMode = null; this.circleUBlend = null;
        this.circleUFlashTo = null;
        this.circleUViewport = null;
        this.circleUPxPerWorld = null;
        this.circleUYFix = null;
        this.circleUA2c = null;
        this.geomUStrokeK = null;
        this.geomUInk = null;
        this.circleUInk = null;
        this.circleUStrokeK = null;
        this._gpuGen++;
        this.gridProgram = null;
        this.gridVAO = null;
        this.gridBuffer = null;
        this.gridCornerBuffer = null;
        this._gridFailed = false;
        this.fogProgram = null;
        this.fogVAO = null;
        this.fogBuffer = null;
        this.fogCornerBuffer = null;
        this.fogCap = 0;
        this._fogFailed = false;

        this.enabled = true;
        return true;
    }

    private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('WebGL shader compile failed:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    isEnabled(): boolean { return this.enabled; }

    getCanvas(): HTMLCanvasElement { return this.canvas; }

    resize(width: number, height: number): void {
        this.canvasW = width;
        this.canvasH = height;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            if (this.gl) {
                this._applyViewport();
                this.gl.enable(this.gl.BLEND);
                this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
                this.gl.enable(this.gl.DEPTH_TEST);
                this.gl.depthFunc(this.gl.LEQUAL);
                this.gl.depthMask(true);
                this.gl.enable(this.gl.SAMPLE_ALPHA_TO_COVERAGE);
                this._a2cOn = true;
                this.gl.clearStencil(255);
            }
        } else if (this.gl) {
            this._applyViewport();
        }
    }

    private _applyViewport(): void {
        const vw = Math.max(1, Math.round(this.canvasW * this.renderScale));
        const vh = Math.max(1, Math.round(this.canvasH * this.renderScale));
        this.viewW = vw;
        this.viewH = vh;
        if (this.gl) this.gl.viewport(0, this.canvasH - vh, vw, vh);
    }

    setRenderScale(scale: number): void {
        const s = scale > 1 ? 1 : (scale < 0.1 ? 0.1 : scale);
        if (s === this.renderScale) return;
        this.renderScale = s;
        this._applyViewport();
    }

    getRenderScale(): number { return this.renderScale; }
    getViewW(): number { return this.viewW || this.canvasW; }
    getViewH(): number { return this.viewH || this.canvasH; }
    getCanvasW(): number { return this.canvasW; }
    getCanvasH(): number { return this.canvasH; }

    setCamera(camX: number, camY: number, zoom: number, canvasW: number, canvasH: number): void {
        this.camScaleX = (2 * zoom) / canvasW;
        this.camScaleY = -(2 * zoom) / canvasH;
        this.camOffsetX = -camX * this.camScaleX;
        this.camOffsetY = -camY * this.camScaleY;
    }

    private _resetDirty(): void {
        this._dirtyMinX = Infinity;
        this._dirtyMinY = Infinity;
        this._dirtyMaxX = -Infinity;
        this._dirtyMaxY = -Infinity;
    }

    private _expandDirty(x: number, y: number, r: number): void {
        if (x - r < this._dirtyMinX) this._dirtyMinX = x - r;
        if (x + r > this._dirtyMaxX) this._dirtyMaxX = x + r;
        if (y - r < this._dirtyMinY) this._dirtyMinY = y - r;
        if (y + r > this._dirtyMaxY) this._dirtyMaxY = y + r;
    }

    private static _quadRadius(scaleX: number, scaleY: number): number {
        const sx = scaleX < 0 ? -scaleX : scaleX;
        const sy = scaleY < 0 ? -scaleY : scaleY;
        return (sx + sy) * 0.5;
    }

    private static _geomRadius(scaleX: number, scaleY: number, aspect: number): number {
        const sx = scaleX < 0 ? -scaleX : scaleX;
        const sy = scaleY < 0 ? -scaleY : scaleY;
        const a = aspect < 0 ? -aspect : aspect;
        const ay = a > 1 ? a : 1;
        return sx + sy * ay + STROKE_HALF_WIDTH;
    }

    getDirtyRectPx(out: { x: number; y: number; w: number; h: number }): boolean {
        if (this._dirtyMinX === Infinity) return false;
        if (this.camScaleX === 0 || this.camScaleY === 0) return false;
        const W = this.canvas.width, H = this.canvas.height;
        if (W <= 0 || H <= 0) return false;

        const ndcX0 = this._dirtyMinX * this.camScaleX + this.camOffsetX;
        const ndcX1 = this._dirtyMaxX * this.camScaleX + this.camOffsetX;
        const ndcY0 = this._dirtyMinY * this.camScaleY + this.camOffsetY;
        const ndcY1 = this._dirtyMaxY * this.camScaleY + this.camOffsetY;

        const pxA = (ndcX0 + 1) * 0.5 * W, pxB = (ndcX1 + 1) * 0.5 * W;
        const pyA = (1 - ndcY0) * 0.5 * H, pyB = (1 - ndcY1) * 0.5 * H;

        const PAD = 4;
        let x0 = Math.floor((pxA < pxB ? pxA : pxB) - PAD);
        let x1 = Math.ceil((pxA > pxB ? pxA : pxB) + PAD);
        let y0 = Math.floor((pyA < pyB ? pyA : pyB) - PAD);
        let y1 = Math.ceil((pyA > pyB ? pyA : pyB) + PAD);

        if (x0 < 0) x0 = 0;
        if (y0 < 0) y0 = 0;
        if (x1 > W) x1 = W;
        if (y1 > H) y1 = H;
        if (x1 <= x0 || y1 <= y0) return false;
        if (x0 === 0 && y0 === 0 && x1 === W && y1 === H) return false;

        out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
        return true;
    }

    beginFrame(): void {
        if (!this.gl || !this.enabled) return;
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clearDepth(1.0);
        this.gl.clearStencil(255);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT | this.gl.STENCIL_BUFFER_BIT);
        this.instanceCount = 0;
        this._resetDirty();
        this.beginGeomFrame();
    }

    hasContent(): boolean { return this.instanceCount > 0; }

    hasDrawnSinceClear(): boolean { return this._dirtyMinX !== Infinity; }

    addBullet(
        x: number, y: number,
        rotation: number,
        bufSize: number,
        alpha: number,
        damageOverlay: number,
        shapeKey: string,
        shapeCanvas: OffscreenCanvas,
        depth: number = 0.0
    ): void {
        if (this.instanceCount >= MAX_INSTANCES) return;

        let entry: AtlasEntry | undefined;
        if (shapeKey === this._lastKey && this._lastEntry !== null) {
            entry = this._lastEntry;
        } else {
            entry = this.atlasEntries.get(shapeKey);
            if (!entry) {
                entry = this._addToAtlas(shapeKey, shapeCanvas, bufSize);
                if (!entry) return;
            }
            this._lastKey = shapeKey;
            this._lastEntry = entry;
        }

        const off = this.instanceCount * INSTANCE_STRIDE;
        const d = this.instanceData;

        d[off]     = x;
        d[off + 1] = y;
        d[off + 2] = rotation;
        d[off + 3] = bufSize;
        d[off + 4] = bufSize;
        d[off + 5] = alpha;
        d[off + 6] = entry.u0;
        d[off + 7] = entry.v0;
        d[off + 8] = entry.u1 - entry.u0;
        d[off + 9] = entry.v1 - entry.v0;
        d[off + 10] = damageOverlay;
        d[off + 11] = depth;

        this._expandDirty(x, y, WebGLBulletRenderer._quadRadius(bufSize, bufSize));
        this.instanceCount++;
    }

    addInstance(
        x: number, y: number,
        rotation: number,
        scaleX: number, scaleY: number,
        alpha: number,
        damageOverlay: number,
        depth: number,
        shapeKey: string,
        shapeCanvas: OffscreenCanvas
    ): void {
        if (this.instanceCount >= MAX_INSTANCES) return;

        let entry: AtlasEntry | undefined;
        if (shapeKey === this._lastKey && this._lastEntry !== null) {
            entry = this._lastEntry;
        } else {
            entry = this.atlasEntries.get(shapeKey);
            if (!entry) {
                entry = this._addToAtlas(shapeKey, shapeCanvas, Math.max(shapeCanvas.width, shapeCanvas.height));
                if (!entry) return;
            }
            this._lastKey = shapeKey;
            this._lastEntry = entry;
        }

        const off = this.instanceCount * INSTANCE_STRIDE;
        const d = this.instanceData;

        d[off]     = x;
        d[off + 1] = y;
        d[off + 2] = rotation;
        d[off + 3] = scaleX;
        d[off + 4] = scaleY;
        d[off + 5] = alpha;
        d[off + 6] = entry.u0;
        d[off + 7] = entry.v0;
        d[off + 8] = entry.u1 - entry.u0;
        d[off + 9] = entry.v1 - entry.v0;
        d[off + 10] = damageOverlay;
        d[off + 11] = depth;

        this._expandDirty(x, y, WebGLBulletRenderer._quadRadius(scaleX, scaleY));
        this.instanceCount++;
    }

    prerenderShape(
        key: string,
        drawFn: (ctx: OffscreenCanvasRenderingContext2D, size: number) => void,
        size: number
    ): string {
        if (this.atlasEntries.has(key)) return key;

        const shapeCanvas = new OffscreenCanvas(size, size);
        const ctx = shapeCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
        if (!ctx) return '';

        drawFn(ctx, size);

        const entry = this._addToAtlas(key, shapeCanvas, size);
        return entry ? key : '';
    }

    prerenderShapeRect(
        key: string,
        drawFn: (ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) => void,
        w: number,
        h: number
    ): string {
        if (this.atlasEntries.has(key)) return key;
        const shapeCanvas = new OffscreenCanvas(w, h);
        const ctx = shapeCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
        if (!ctx) return '';
        drawFn(ctx, w, h);
        const entry = this._addToAtlas(key, shapeCanvas, w);
        return entry ? key : '';
    }

    clearAtlas(): void {
        this.atlasEntries.clear();
        this.atlasNextX = 0;
        this.atlasNextY = 0;
        this.atlasRowHeight = 0;
        this._lastKey = '';
        this._lastEntry = null;
        if (this.atlasCtx) {
            this.atlasCtx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
        }
        this.atlasDirty = true;
    }

    hasAtlasEntry(key: string): boolean {
        return this.atlasEntries.has(key);
    }

    addInstanceByKey(
        x: number, y: number,
        rotation: number,
        scaleX: number, scaleY: number,
        alpha: number,
        damageOverlay: number,
        depth: number,
        shapeKey: string
    ): boolean {
        if (this.instanceCount >= MAX_INSTANCES) return false;

        let entry: AtlasEntry | undefined;
        if (shapeKey === this._lastKey && this._lastEntry !== null) {
            entry = this._lastEntry;
        } else {
            entry = this.atlasEntries.get(shapeKey);
            if (!entry) return false;
            this._lastKey = shapeKey;
            this._lastEntry = entry;
        }

        const off = this.instanceCount * INSTANCE_STRIDE;
        const d = this.instanceData;

        d[off]     = x;
        d[off + 1] = y;
        d[off + 2] = rotation;
        d[off + 3] = scaleX;
        d[off + 4] = scaleY;
        d[off + 5] = alpha;
        d[off + 6] = entry.u0;
        d[off + 7] = entry.v0;
        d[off + 8] = entry.u1 - entry.u0;
        d[off + 9] = entry.v1 - entry.v0;
        d[off + 10] = damageOverlay;
        d[off + 11] = depth;

        this._expandDirty(x, y, WebGLBulletRenderer._quadRadius(scaleX, scaleY));
        this.instanceCount++;
        return true;
    }


    private _addToAtlas(key: string, shapeCanvas: OffscreenCanvas, bufSize: number): AtlasEntry | undefined {
        if (SMALL_FIX.NH036 !== 0 && !this._ensureAtlas()) return undefined;
        if (!this.atlasCtx) return undefined;

        const w = shapeCanvas.width;
        const h = shapeCanvas.height;

        if (this.atlasNextX + w + ATLAS_PADDING > ATLAS_SIZE) {
            this.atlasNextX = 0;
            this.atlasNextY += this.atlasRowHeight + ATLAS_PADDING;
            this.atlasRowHeight = 0;
        }

        if (this.atlasNextY + h + ATLAS_PADDING > ATLAS_SIZE) {
            return undefined;
        }

        this.atlasCtx.drawImage(shapeCanvas, this.atlasNextX, this.atlasNextY);

        const gl = this.gl;
        if (gl && this.atlasTexture) {
            gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
            gl.texSubImage2D(
                gl.TEXTURE_2D, 0,
                this.atlasNextX, this.atlasNextY,
                gl.RGBA, gl.UNSIGNED_BYTE,
                shapeCanvas
            );
        }

        const entry: AtlasEntry = {
            u0: this.atlasNextX / ATLAS_SIZE,
            v0: this.atlasNextY / ATLAS_SIZE,
            u1: (this.atlasNextX + w) / ATLAS_SIZE,
            v1: (this.atlasNextY + h) / ATLAS_SIZE,
            pixW: w,
            pixH: h,
        };
        this.atlasEntries.set(key, entry);
        this._lastKey = key;
        this._lastEntry = entry;

        this.atlasNextX += w + ATLAS_PADDING;
        if (h > this.atlasRowHeight) this.atlasRowHeight = h;

        return entry;
    }

    flush(): void {
        const gl = this.gl;
        if (!gl || !this.enabled || this.instanceCount === 0) return;

        if (this.atlasDirty && this.atlasCanvas && this.atlasTexture) {
            gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
            gl.texSubImage2D(
                gl.TEXTURE_2D, 0, 0, 0,
                gl.RGBA, gl.UNSIGNED_BYTE,
                this.atlasCanvas
            );
            this.atlasDirty = false;
        }

        gl.useProgram(this.program);
        gl.bindVertexArray(this.quadVAO);

        gl.uniform4f(this.uCamera, this.camScaleX, this.camScaleY, this.camOffsetX, this.camOffsetY);
        gl.uniform1f(this.uFlashTo, this.flashTo);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, this.instanceCount * INSTANCE_STRIDE);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);

        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);

        gl.bindVertexArray(null);
    }

    ensureTagAtlas(width: number, height: number): boolean {
        const gl = this.gl;
        if (!gl || !this.enabled) return false;
        if (this.tagTexture) return true;
        const tex = gl.createTexture();
        if (!tex) return false;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.tagTexture = tex;
        this._tagGen++;
        return true;
    }

    getTagAtlasGen(): number { return this._tagGen; }

    uploadTagPixels(x: number, y: number, pixels: ImageData): void {
        const gl = this.gl;
        if (!gl || !this.tagTexture) return;
        gl.bindTexture(gl.TEXTURE_2D, this.tagTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    }

    pushTagQuads(buf: Float32Array, count: number): void {
        const d = this.instanceData;
        let n = this.instanceCount;
        let minX = this._dirtyMinX, minY = this._dirtyMinY, maxX = this._dirtyMaxX, maxY = this._dirtyMaxY;
        for (let i = 0, s = 0; i < count && n < MAX_INSTANCES; i++, s += 9, n++) {
            const off = n * INSTANCE_STRIDE;
            const cx = buf[s], cy = buf[s + 1], w = buf[s + 2], h = buf[s + 3];
            d[off]     = cx;
            d[off + 1] = cy;
            d[off + 2] = 0;
            d[off + 3] = w;
            d[off + 4] = h;
            d[off + 5] = buf[s + 4];
            d[off + 6] = buf[s + 5];
            d[off + 7] = buf[s + 6];
            d[off + 8] = buf[s + 7];
            d[off + 9] = buf[s + 8];
            d[off + 10] = 0;
            d[off + 11] = 0;
            const hw = w * 0.5, hh = h * 0.5;
            if (cx - hw < minX) minX = cx - hw;
            if (cx + hw > maxX) maxX = cx + hw;
            if (cy - hh < minY) minY = cy - hh;
            if (cy + hh > maxY) maxY = cy + hh;
        }
        this.instanceCount = n;
        this._dirtyMinX = minX; this._dirtyMinY = minY; this._dirtyMaxX = maxX; this._dirtyMaxY = maxY;
    }

    tagInstanceData(): Float32Array { return this.instanceData; }
    tagInstanceRoom(): number { return MAX_INSTANCES; }
    tagInstanceStride(): number { return INSTANCE_STRIDE; }

    commitTagInstances(count: number, minX: number, minY: number, maxX: number, maxY: number): void {
        if (count <= 0) return;
        this.instanceCount = count > MAX_INSTANCES ? MAX_INSTANCES : count;
        if (minX < this._dirtyMinX) this._dirtyMinX = minX;
        if (minY < this._dirtyMinY) this._dirtyMinY = minY;
        if (maxX > this._dirtyMaxX) this._dirtyMaxX = maxX;
        if (maxY > this._dirtyMaxY) this._dirtyMaxY = maxY;
    }

    flushTags(): void {
        const gl = this.gl;
        if (!gl || !this.enabled || this.instanceCount === 0 || !this.tagTexture) return;
        gl.useProgram(this.program);
        gl.bindVertexArray(this.quadVAO);
        gl.uniform4f(this.uCamera, this.camScaleX, this.camScaleY, this.camOffsetX, this.camOffsetY);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, this.instanceCount * INSTANCE_STRIDE);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tagTexture);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
        gl.bindVertexArray(null);
    }

    initGeomProgram(): boolean {
        const gl = this.gl;
        if (!gl || this._geomInited) return this._geomInited;

        let corners = EXACT_CORNERS;
        let prog = corners ? this._linkProgram(gl, GEOM_VERT_SRC, GEOM_FRAG_SRC, 'geometry') : null;
        if (!prog) {
            corners = false;
            prog = this._linkProgram(gl, GEOM_VERT_SRC, GEOM_FRAG_SRC_OLD, 'geometry (old)');
        }
        if (!prog) return false;
        this._exactCorners = corners;
        this.geomProgram = prog;
        this.geomUCamera = gl.getUniformLocation(prog, 'u_camera');
        this.geomUDarkMode = gl.getUniformLocation(prog, 'u_darkMode');
        this.geomUBlend = gl.getUniformLocation(prog, 'u_blend');
        this.geomUFlashTo = gl.getUniformLocation(prog, 'u_flashTo');
        this.geomUPxPerWorld = corners ? gl.getUniformLocation(prog, 'u_pxPerWorld') : null;
        this.geomUA2c = corners ? gl.getUniformLocation(prog, 'u_a2c') : null;
        this.geomUStrokeK = gl.getUniformLocation(prog, 'u_strokeK');
        this.geomUInk = gl.getUniformLocation(prog, 'u_ink');

        const circleProg = EXACT_CIRCLES ? this._linkProgram(gl, CIRCLE_VERT_SRC, CIRCLE_FRAG_SRC, 'circle') : null;
        this.circleProgram = circleProg;
        if (circleProg) {
            this.circleUCamera = gl.getUniformLocation(circleProg, 'u_camera');
            this.circleUDarkMode = gl.getUniformLocation(circleProg, 'u_darkMode');
            this.circleUBlend = gl.getUniformLocation(circleProg, 'u_blend');
            this.circleUFlashTo = gl.getUniformLocation(circleProg, 'u_flashTo');
            this.circleUViewport = gl.getUniformLocation(circleProg, 'u_viewport');
            this.circleUPxPerWorld = gl.getUniformLocation(circleProg, 'u_pxPerWorld');
            this.circleUYFix = gl.getUniformLocation(circleProg, 'u_yFix');
            this.circleUA2c = gl.getUniformLocation(circleProg, 'u_a2c');
            this.circleUInk = gl.getUniformLocation(circleProg, 'u_ink');
            this.circleUStrokeK = gl.getUniformLocation(circleProg, 'u_strokeK');
        }

        this._createGeomBatch('barrel', _triangulateBarrelWithStroke(corners));
        this._createGeomBatch('rect', _triangulateCenteredRectWithStroke(corners));
        this._createGeomBatch('rect_fill', _triangulateFillRectOnly());
        for (let s = 3; s <= POLY_BATCH_MAX_SIDES; s++) {
            this._createGeomBatch(POLY_BATCH_KEY[s], _triangulatePolygonWithStroke(s, corners));
        }
        if (circleProg) this._createGeomBatch('circle', _triangulateExactCircle(), GEOM_INITIAL_CAPACITY, circleProg);
        else this._createGeomBatch('circle', _triangulatePolygonWithStroke(32, corners));
        this._createGeomBatch('healer_cross', _triangulateHealerCrossWithStroke(corners));

        this._geomInited = true;
        return true;
    }

    private _linkProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string, label: string): WebGLProgram | null {
        const vs = this.compileShader(gl, gl.VERTEX_SHADER, vertSrc);
        const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
        if (!vs || !fs) return null;
        const prog = gl.createProgram()!;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('WebGL ' + label + ' program link failed:', gl.getProgramInfoLog(prog));
            return null;
        }
        return prog;
    }

    private _createGeomBatch(
        key: string, vertData: Float32Array,
        instanceCapacity: number = GEOM_INITIAL_CAPACITY,
        circleProg: WebGLProgram | null = null
    ): void {
        const gl = this.gl!;
        const prog = circleProg || this.geomProgram!;
        const vertCount = vertData.length / GEOM_VERT_SIZE;
        let reach = 1;
        for (let o = 0; o < vertData.length; o += GEOM_VERT_SIZE) {
            const ax = vertData[o] < 0 ? -vertData[o] : vertData[o], ay = vertData[o + 1] < 0 ? -vertData[o + 1] : vertData[o + 1];
            if (ax > reach) reach = ax;
            if (ay > reach) reach = ay;
        }

        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        const vertBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, vertBuf);
        gl.bufferData(gl.ARRAY_BUFFER, vertData, gl.STATIC_DRAW);

        const vertStride = GEOM_VERT_SIZE * 4;
        this._bindGeomAttr(gl, prog, 'a_localPos', 2, vertStride, 0, 0);
        this._bindGeomAttr(gl, prog, 'a_strokeOffset', 2, vertStride, 8, 0);
        this._bindGeomAttr(gl, prog, 'a_isStroke', 1, vertStride, 16, 0);

        const instBuf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        const capacity = instanceCapacity;
        const instData = new Float32Array(capacity * GEOM_INSTANCE_STRIDE);
        gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);

        const instStride = GEOM_INSTANCE_STRIDE * 4;
        this._bindGeomAttr(gl, prog, 'a_gWorldPos', 2, instStride, 0, 1);
        this._bindGeomAttr(gl, prog, 'a_gRotation', 1, instStride, 8, 1);
        this._bindGeomAttr(gl, prog, 'a_gScale', 2, instStride, 12, 1);
        this._bindGeomAttr(gl, prog, 'a_gFillColor', 3, instStride, 20, 1);
        this._bindGeomAttr(gl, prog, 'a_gDmgOverlay', 1, instStride, 32, 1);
        this._bindGeomAttr(gl, prog, 'a_gDepth', 1, instStride, 36, 1);
        this._bindGeomAttr(gl, prog, 'a_gAspect', 1, instStride, 40, 1);
        this._bindGeomAttr(gl, prog, 'a_gAlpha', 1, instStride, 44, 1);

        gl.bindVertexArray(null);

        const batch: GeomBatch = {
            vertCount,
            vao,
            vertexBuffer: vertBuf,
            instanceBuffer: instBuf,
            instanceData: instData,
            instanceCount: 0,
            capacity,
            circle: circleProg !== null,
            reach,
        };
        this.geomBatches.set(key, batch);
        this._geomBatchArr.push(batch);
    }

    private _bindGeomAttr(
        gl: WebGL2RenderingContext, prog: WebGLProgram, name: string,
        size: number, stride: number, offset: number, divisor: number
    ): void {
        const loc = gl.getAttribLocation(prog, name);
        if (loc < 0) return;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
        gl.vertexAttribDivisor(loc, divisor);
    }

    getOrCreateStarBatch(sides: number, starDepth: number, curved: boolean): string {
        const innerRatio = 1 - starDepth;
        const qDepth = Math.round(starDepth * 100);
        const nk = (sides >= 0 && sides < 1024 && sides === (sides | 0) && qDepth > -100000 && qDepth < 100000)
            ? ((qDepth + 100000) * 1024 + sides) * 2 + (curved ? 1 : 0) : -1;
        let key = nk >= 0 ? this._starKeys.get(nk) : undefined;
        if (key === undefined) {
            key = curved ? `cstar_${sides}_${qDepth}` : `star_${sides}_${qDepth}`;
            if (nk >= 0) this._starKeys.set(nk, key);
        }
        if (this.geomBatches.has(key)) return key;
        const verts = curved
            ? _triangulateCurvedStarWithStroke(sides, innerRatio, this._exactCorners)
            : _triangulateStarWithStroke(sides, innerRatio, this._exactCorners);
        this._createGeomBatch(key, verts);
        this._keepCrossLast();
        return key;
    }

    outlineLayerBatchKey(points: readonly (readonly [number, number])[]): string {
        const kept = this._outlineLayerKeys.get(points);
        if (kept === '') return '';
        if (kept !== undefined && this.geomBatches.has(kept)) { if (SMALL_FIX.G729 !== 0) this._outlineUsed.set(kept, ++this._outlineTick); return kept; }
        if (!this.gl || !this.enabled || !this.geomProgram) return '';
        let pts = points;
        if (!outlineFansFromMiddle(pts)) {
            const c = cleanOutline(pts);
            if (!outlineFansFromMiddle(c) && outlineFillTriangles(c) === null) { this._outlineLayerKeys.set(points, ''); return ''; }
            pts = c;
        }
        let h = 2166136261 >>> 0;
        for (let i = 0; i < pts.length; i++) { h = Math.imul(h ^ Math.round(pts[i][0] * 4096), 16777619) >>> 0; h = Math.imul(h ^ Math.round(pts[i][1] * 4096), 16777619) >>> 0; }
        const key = 'layer_o_' + pts.length + '_' + h.toString(36);
        if (!this.geomBatches.has(key)) {
            if (SMALL_FIX.G729 !== 0) {
                this._outlineEvict(key);
                this._createGeomBatch(key, _triangulateOutlineWithStroke(pts, this._exactCorners), OUTLINE_BATCH_CAPACITY);
            } else this._createGeomBatch(key, _triangulateOutlineWithStroke(pts, this._exactCorners));
            this._keepCrossLast();
        }
        if (SMALL_FIX.G729 !== 0) this._outlineUsed.set(key, ++this._outlineTick);
        this._outlineLayerKeys.set(points, key);
        return key;
    }
    private _outlineLayerKeys = new WeakMap<object, string>();
    private _outlineUsed = new Map<string, number>();
    private _outlineTick = 0;
    private _outlineEvict(adding: string): void {
        const gl = this.gl;
        if (!gl || this._outlineUsed.size < OUTLINE_BATCHES_MAX) return;
        let oldKey = '', oldTick = Infinity;
        for (const [k, t] of this._outlineUsed) {
            if (k === adding || t >= oldTick) continue;
            const b = this.geomBatches.get(k);
            if (b !== undefined && b.instanceCount > 0) continue;
            oldKey = k; oldTick = t;
        }
        if (oldKey === '') return;
        this._outlineUsed.delete(oldKey);
        const old = this.geomBatches.get(oldKey);
        if (!old) return;
        gl.deleteVertexArray(old.vao);
        gl.deleteBuffer(old.vertexBuffer);
        gl.deleteBuffer(old.instanceBuffer);
        this.geomBatches.delete(oldKey);
        const at = this._geomBatchArr.indexOf(old);
        if (at >= 0) this._geomBatchArr.splice(at, 1);
    }

    private _keepCrossLast(): void {
        const cross = this.geomBatches.get('healer_cross');
        if (cross === undefined) return;
        const arr = this._geomBatchArr, at = arr.indexOf(cross);
        if (at < 0 || at === arr.length - 1) return;
        arr.splice(at, 1);
        arr.push(cross);
    }

    ensureFogBatch(): boolean {
        if (!this.gl || !this.enabled || !this.geomProgram) return false;
        if (!this.geomBatches.has(FOG_BATCH)) this._createGeomBatch(FOG_BATCH, _triangulateFillDiscOnly(FOG_DISC_SIDES), FOG_CAPACITY);
        return this.geomBatches.has(FOG_BATCH);
    }

    ensureDebugOverlayBatches(): boolean {
        if (!this.gl || !this.enabled || !this.geomProgram) return false;
        if (!this.geomBatches.has(DBG_LINE_BATCH)) {
            this._createGeomBatch(DBG_LINE_BATCH, _triangulateFillRectOnly(), DBG_LINE_CAPACITY);
        }
        if (!this.geomBatches.has(DBG_DISC_BATCH)) {
            this._createGeomBatch(DBG_DISC_BATCH, _triangulateFillDiscOnly(DBG_DISC_SIDES), DBG_DISC_CAPACITY);
        }
        if (!this.geomBatches.has(DBG_CAP_BATCH)) {
            this._createGeomBatch(DBG_CAP_BATCH, _triangulateFillHalfDiscOnly(DBG_CAP_SIDES), DBG_CAP_CAPACITY);
        }
        return this.geomBatches.has(DBG_LINE_BATCH)
            && this.geomBatches.has(DBG_DISC_BATCH)
            && this.geomBatches.has(DBG_CAP_BATCH);
    }

    lookBatchKey(part: { kind: string; sides?: number; inner?: number; points?: [number, number][] }, memo: { key: string }): string {
        if (memo.key !== '' && this.geomBatches.has(memo.key)) return memo.key;
        if (!this.gl || !this.enabled || !this.geomProgram) return '';
        const corners = this._exactCorners;
        let key = '';
        if (part.kind === 'circle') key = 'circle';
        else if (part.kind === 'polygon') {
            const sides = part.sides as number;
            if (sides <= POLY_BATCH_MAX_SIDES) key = POLY_BATCH_KEY[sides];
            else { key = 'look_p_' + sides; if (!this.geomBatches.has(key)) this._createGeomBatch(key, _triangulatePolygonWithStroke(sides, corners), LOOK_CAPACITY); }
        } else if (part.kind === 'star') key = this.getOrCreateStarBatch(part.sides as number, 1 - (part.inner as number), false);
        else if (part.kind === 'line') { key = 'look_line'; if (!this.geomBatches.has(key)) this._createGeomBatch(key, _triangulateLineStroke(corners), LOOK_CAPACITY); }
        else if (part.kind === 'outline') {
            let pts = part.points as [number, number][];
            if (!outlineFansFromMiddle(pts)) { const c = cleanOutline(pts); if (!outlineFansFromMiddle(c) && outlineFillTriangles(c) === null) { memo.key = ''; return ''; } pts = c; }
            let h = 2166136261 >>> 0;
            for (let i = 0; i < pts.length; i++) { h = Math.imul(h ^ Math.round(pts[i][0] * 4096), 16777619) >>> 0; h = Math.imul(h ^ Math.round(pts[i][1] * 4096), 16777619) >>> 0; }
            key = 'look_o_' + pts.length + '_' + h.toString(36);
            if (!this.geomBatches.has(key)) this._createGeomBatch(key, _triangulateOutlineWithStroke(pts, corners), LOOK_CAPACITY);
        }
        memo.key = this.geomBatches.has(key) ? key : '';
        return memo.key;
    }

    ensureAuraBatch(): boolean {
        if (!this.gl || !this.enabled || !this.geomProgram) return false;
        if (this.geomBatches.has(AURA_BATCH)) return true;
        if (this.circleProgram) this._createGeomBatch(AURA_BATCH, _triangulateExactCircle(), AURA_CAPACITY, this.circleProgram);
        else this._createGeomBatch(AURA_BATCH, _triangulatePolygonWithStroke(64, this._exactCorners), AURA_CAPACITY);
        return this.geomBatches.has(AURA_BATCH);
    }

    ensureHalloweenBatches(m: HalloweenMeshes): boolean {
        const gl = this.gl;
        if (!gl || !this.enabled || !this.geomProgram) return false;
        if (this._hwMeshes === m && this.geomBatches.has(HW_BATCH.circle)) return true;
        for (let k = 0; k <= HW_KINDS.length; k++) {
            const key = k < HW_KINDS.length ? HW_BATCH[HW_KINDS[k]] : HW_VEIL;
            const old = this.geomBatches.get(key);
            if (!old) continue;
            gl.deleteVertexArray(old.vao);
            gl.deleteBuffer(old.vertexBuffer);
            gl.deleteBuffer(old.instanceBuffer);
            this.geomBatches.delete(key);
            const at = this._geomBatchArr.indexOf(old);
            if (at >= 0) this._geomBatchArr.splice(at, 1);
        }
        const corners = this._exactCorners;
        if (m.polygonSides >= 3) this._createGeomBatch(HW_BATCH.polygon, _triangulatePolygonWithStroke(m.polygonSides, corners), HW_CAPACITY);
        if (m.outline !== null) this._createGeomBatch(HW_BATCH.outline, _triangulateOutlineWithStroke(m.outline, corners), HW_CAPACITY);
        this._createGeomBatch(HW_BATCH.line, _triangulateLineStroke(corners), HW_CAPACITY);
        if (this.circleProgram) this._createGeomBatch(HW_BATCH.circle, _triangulateExactCircle(), HW_CAPACITY, this.circleProgram);
        else this._createGeomBatch(HW_BATCH.circle, _triangulatePolygonWithStroke(32, corners), HW_CAPACITY);
        if (m.starSides >= 3) this._createGeomBatch(HW_BATCH.star, _triangulateStarWithStroke(m.starSides, m.starInner, corners), HW_CAPACITY);
        if (m.flatKind !== '') {
            const body = m.flatKind === 'outline' && m.flatOutline !== null ? _triangulateOutlineWithStroke(m.flatOutline, false)
                : m.flatKind === 'polygon' ? _triangulatePolygonWithStroke(m.flatSides, false)
                : m.flatKind === 'star' ? _triangulateStarWithStroke(m.flatSides, m.flatInner, false)
                : _triangulatePolygonWithStroke(64, false);
            this._createGeomBatch(HW_VEIL, _flatMesh(body), HW_CAPACITY);
        }
        this._hwMeshes = m;
        return true;
    }

    setGeomDarkMode(dark: boolean, blend: number = dark ? 1 : 0.598): void {
        this.geomDarkMode = dark ? 1.0 : 0.0;
        this.geomBlend = blend;
        this.flashTo = flashWhite(dark) / 255;
    }

    beginGeomFrame(): void {
        const arr = this._geomBatchArr;
        for (let i = 0; i < arr.length; i++) {
            arr[i].instanceCount = 0;
        }
    }

    setDepthTestEnabled(enabled: boolean): void {
        const gl = this.gl;
        if (!gl) return;
        if (enabled) gl.enable(gl.DEPTH_TEST);
        else gl.disable(gl.DEPTH_TEST);
    }

    setDepthFunc(alwaysPass: boolean): void {
        const gl = this.gl;
        if (!gl) return;
        gl.depthFunc(alwaysPass ? gl.ALWAYS : gl.LEQUAL);
    }

    setDepthMask(enabled: boolean): void {
        const gl = this.gl;
        if (!gl) return;
        gl.depthMask(enabled);
    }

    clearColorOnly(): void {
        const gl = this.gl;
        if (!gl) return;
        gl.clear(gl.COLOR_BUFFER_BIT);
        this._resetDirty();
    }

    setColorMask(enabled: boolean): void {
        const gl = this.gl;
        if (!gl) return;
        gl.colorMask(enabled, enabled, enabled, enabled);
    }

    setSampleAlphaToCoverage(enabled: boolean): void {
        const gl = this.gl;
        if (!gl) return;
        if (enabled) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        else gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        this._a2cOn = enabled;
    }

    alphaIsSpread(): boolean { return this._a2cOn && this._msaa; }

    setStrokeScale(k: number): void { this.strokeK = k > 1 ? k : 1.0; }

    setInk(r: number, g: number, b: number): void { this.inkR = r; this.inkG = g; this.inkB = b; }

    isSoftware(): boolean {
        if (this._software < 0) {
            const gl = this.gl;
            let name = '';
            if (gl) {
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                if (dbg) name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
            }
            this._software = isSoftwareRendererName(name) ? 1 : 0;
        }
        return this._software === 1;
    }

    private _ensureGrid(): boolean {
        const gl = this.gl;
        if (!gl || !this.enabled) return false;
        if (this.gridProgram !== null) return true;
        if (this._gridFailed) return false;
        const prog = this._linkProgram(gl, GRID_VERT_SRC, GRID_FRAG_SRC, 'editor grid');
        if (!prog) { this._gridFailed = true; return false; }
        this.gridProgram = prog;
        this.gridUCamera = gl.getUniformLocation(prog, 'u_camera');
        this.gridUViewport = gl.getUniformLocation(prog, 'u_viewport');
        this.gridUSpacing = gl.getUniformLocation(prog, 'u_spacing');
        this.gridUColor = gl.getUniformLocation(prog, 'u_color');
        this.gridUPad = gl.getUniformLocation(prog, 'u_pad');
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);
        const corners = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, corners);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
        const aCorner = gl.getAttribLocation(prog, 'a_corner');
        gl.enableVertexAttribArray(aCorner);
        gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(aCorner, 0);
        const inst = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, inst);
        gl.bufferData(gl.ARRAY_BUFFER, GRID_MAX * GRID_STRIDE * 4, gl.DYNAMIC_DRAW);
        const aRect = gl.getAttribLocation(prog, 'a_rect');
        gl.enableVertexAttribArray(aRect);
        gl.vertexAttribPointer(aRect, 4, gl.FLOAT, false, GRID_STRIDE * 4, 0);
        gl.vertexAttribDivisor(aRect, 1);
        const aCount = gl.getAttribLocation(prog, 'a_count');
        gl.enableVertexAttribArray(aCount);
        gl.vertexAttribPointer(aCount, 2, gl.FLOAT, false, GRID_STRIDE * 4, 16);
        gl.vertexAttribDivisor(aCount, 1);
        gl.bindVertexArray(null);
        this.gridVAO = vao;
        this.gridCornerBuffer = corners;
        this.gridBuffer = inst;
        return true;
    }

    drawGrid(grids: Float32Array, n: number, spacing: number, r: number, g: number, b: number, alpha: number): boolean {
        if (n <= 0) return true;
        if (!this._ensureGrid()) return false;
        const gl = this.gl!;
        const vw = this.viewW || this.canvasW, vh = this.viewH || this.canvasH;
        const sx = this.camScaleX < 0 ? -this.camScaleX : this.camScaleX;
        const sy = this.camScaleY < 0 ? -this.camScaleY : this.camScaleY;
        if (!(sx > 0) || !(sy > 0) || vw <= 0 || vh <= 0) return true;
        const hpx = 1 / (sx * vw), hpy = 1 / (sy * vh);
        gl.useProgram(this.gridProgram);
        gl.uniform4f(this.gridUCamera, this.camScaleX, this.camScaleY, this.camOffsetX, this.camOffsetY);
        gl.uniform4f(this.gridUViewport, 0, this.canvasH - vh, vw, vh);
        gl.uniform1f(this.gridUSpacing, spacing);
        gl.uniform4f(this.gridUColor, r, g, b, alpha);
        gl.uniform2f(this.gridUPad, Math.max(0.5, hpx) + hpx * 4, Math.max(0.5, hpy) + hpy * 4);
        gl.bindVertexArray(this.gridVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuffer);
        const a2c = this._a2cOn;
        const depth = gl.isEnabled(gl.DEPTH_TEST);
        if (depth) gl.disable(gl.DEPTH_TEST);
        if (a2c) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        for (let at = 0; at < n; at += GRID_MAX) {
            const m = n - at < GRID_MAX ? n - at : GRID_MAX;
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, grids, at * GRID_STRIDE, m * GRID_STRIDE);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, m);
        }
        if (a2c) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        if (depth) gl.enable(gl.DEPTH_TEST);
        gl.bindVertexArray(null);
        if (this.program) gl.useProgram(this.program);
        for (let i = 0, o = 0; i < n; i++, o += GRID_STRIDE) {
            this._expandDirty((grids[o] + grids[o + 2]) * 0.5, (grids[o + 1] + grids[o + 3]) * 0.5,
                (grids[o + 2] - grids[o]) * 0.5 + (grids[o + 3] - grids[o + 1]) * 0.5 + 1);
        }
        return true;
    }

    private _ensureFog(): boolean {
        const gl = this.gl;
        if (!gl || !this.enabled) return false;
        if (this.fogProgram !== null) return true;
        if (this._fogFailed) return false;
        const prog = this._linkProgram(gl, FOG_VERT_SRC, FOG_FRAG_SRC, 'fog');
        if (!prog) { this._fogFailed = true; return false; }
        this.fogProgram = prog;
        this.fogUCamera = gl.getUniformLocation(prog, 'u_camera');
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);
        const corners = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, corners);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
        const aCorner = gl.getAttribLocation(prog, 'a_corner');
        gl.enableVertexAttribArray(aCorner);
        gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(aCorner, 0);
        const inst = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, inst);
        this.fogCap = 4096;
        gl.bufferData(gl.ARRAY_BUFFER, this.fogCap * FOG_PUFF_STRIDE * 4, gl.DYNAMIC_DRAW);
        const aPuff = gl.getAttribLocation(prog, 'a_puff');
        gl.enableVertexAttribArray(aPuff);
        gl.vertexAttribPointer(aPuff, 4, gl.FLOAT, false, FOG_PUFF_STRIDE * 4, 0);
        gl.vertexAttribDivisor(aPuff, 1);
        const aLook = gl.getAttribLocation(prog, 'a_look');
        gl.enableVertexAttribArray(aLook);
        gl.vertexAttribPointer(aLook, 2, gl.FLOAT, false, FOG_PUFF_STRIDE * 4, 16);
        gl.vertexAttribDivisor(aLook, 1);
        gl.bindVertexArray(null);
        this.fogVAO = vao;
        this.fogCornerBuffer = corners;
        this.fogBuffer = inst;
        return true;
    }

    drawFog(puffs: Float32Array, n: number): boolean {
        if (n <= 0) return true;
        if (!this._ensureFog()) return false;
        const gl = this.gl!;
        gl.useProgram(this.fogProgram);
        gl.uniform4f(this.fogUCamera, this.camScaleX, this.camScaleY, this.camOffsetX, this.camOffsetY);
        gl.bindVertexArray(this.fogVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.fogBuffer);
        if (n > this.fogCap) {
            while (this.fogCap < n) this.fogCap *= 2;
            gl.bufferData(gl.ARRAY_BUFFER, this.fogCap * FOG_PUFF_STRIDE * 4, gl.DYNAMIC_DRAW);
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, puffs, 0, n * FOG_PUFF_STRIDE);
        const a2c = this._a2cOn;
        const depth = gl.isEnabled(gl.DEPTH_TEST);
        if (depth) gl.disable(gl.DEPTH_TEST);
        if (a2c) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
        if (a2c) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        if (depth) gl.enable(gl.DEPTH_TEST);
        gl.bindVertexArray(null);
        if (this.program) gl.useProgram(this.program);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0, o = 0; i < n; i++, o += FOG_PUFF_STRIDE) {
            const r = puffs[o + 2];
            if (puffs[o] - r < x0) x0 = puffs[o] - r;
            if (puffs[o] + r > x1) x1 = puffs[o] + r;
            if (puffs[o + 1] - r < y0) y0 = puffs[o + 1] - r;
            if (puffs[o + 1] + r > y1) y1 = puffs[o + 1] + r;
        }
        this._expandDirty((x0 + x1) * 0.5, (y0 + y1) * 0.5, (x1 - x0) * 0.5 + (y1 - y0) * 0.5 + 1);
        return true;
    }

    getGeomInstanceCount(batchKey: string): number {
        const batch = this.geomBatches.get(batchKey);
        return batch ? batch.instanceCount : 0;
    }

    hasGeomContent(): boolean {
        const arr = this._geomBatchArr;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i].instanceCount > 0) return true;
        }
        return false;
    }

    pushGeomInstance(
        batchKey: string,
        worldX: number, worldY: number,
        rotation: number,
        scaleX: number, scaleY: number,
        r: number, g: number, b: number,
        dmgOverlay: number,
        depth: number,
        aspect: number,
        alpha: number
    ): void {
        const batch = this.geomBatches.get(batchKey);
        if (!batch) return;

        if (batch.instanceCount >= batch.capacity) {
            const newCap = batch.capacity * 2;
            const newData = new Float32Array(newCap * GEOM_INSTANCE_STRIDE);
            newData.set(batch.instanceData);
            batch.instanceData = newData;
            batch.capacity = newCap;
            const gl = this.gl!;
            gl.bindBuffer(gl.ARRAY_BUFFER, batch.instanceBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, newData.byteLength, gl.DYNAMIC_DRAW);
        }

        const off = batch.instanceCount * GEOM_INSTANCE_STRIDE;
        const d = batch.instanceData;
        d[off]     = worldX;
        d[off + 1] = worldY;
        d[off + 2] = rotation;
        d[off + 3] = scaleX;
        d[off + 4] = scaleY;
        d[off + 5] = r;
        d[off + 6] = g;
        d[off + 7] = b;
        d[off + 8] = dmgOverlay;
        d[off + 9] = depth;
        d[off + 10] = aspect;
        d[off + 11] = alpha;

        const k = batch.reach;
        this._expandDirty(worldX, worldY, WebGLBulletRenderer._geomRadius(scaleX * k, scaleY * k, aspect));
        batch.instanceCount++;
    }

    private _geomUniforms(gl: WebGL2RenderingContext): void {
        const vw = this.viewW || this.canvasW;
        const pxPerWorld = (this.camScaleX < 0 ? -this.camScaleX : this.camScaleX) * vw * 0.5;
        const a2c = (this._a2cOn && this._msaa) ? 1.0 : 0.0;
        gl.uniform4f(this.geomUCamera!, this.camScaleX, this.camScaleY, this.camOffsetX, this.camOffsetY);
        gl.uniform1f(this.geomUDarkMode!, this.geomDarkMode);
        gl.uniform1f(this.geomUBlend, this.geomBlend);
        gl.uniform1f(this.geomUFlashTo, this.flashTo);
        gl.uniform1f(this.geomUStrokeK, this.strokeK);
        gl.uniform3f(this.geomUInk, this.inkR, this.inkG, this.inkB);
        if (this.geomUPxPerWorld !== null) {
            gl.uniform1f(this.geomUPxPerWorld, pxPerWorld);
            gl.uniform1f(this.geomUA2c, a2c);
        }
    }
    private _circleUniforms(gl: WebGL2RenderingContext): void {
        const vw = this.viewW || this.canvasW;
        const vh = this.viewH || this.canvasH;
        const pxPerWorld = (this.camScaleX < 0 ? -this.camScaleX : this.camScaleX) * vw * 0.5;
        const a2c = (this._a2cOn && this._msaa) ? 1.0 : 0.0;
        const pxPerWorldY = (this.camScaleY < 0 ? -this.camScaleY : this.camScaleY) * vh * 0.5;
        gl.uniform4f(this.circleUCamera, this.camScaleX, this.camScaleY, this.camOffsetX, this.camOffsetY);
        gl.uniform1f(this.circleUDarkMode, this.geomDarkMode);
        gl.uniform1f(this.circleUBlend, this.geomBlend);
        gl.uniform1f(this.circleUFlashTo, this.flashTo);
        gl.uniform4f(this.circleUViewport, 0, this.canvasH - vh, vw, vh);
        gl.uniform1f(this.circleUPxPerWorld, pxPerWorld);
        gl.uniform1f(this.circleUYFix, pxPerWorldY > 0 ? pxPerWorld / pxPerWorldY : 1.0);
        gl.uniform1f(this.circleUA2c, a2c);
        gl.uniform1f(this.circleUStrokeK, this.strokeK);
        gl.uniform3f(this.circleUInk, this.inkR, this.inkG, this.inkB);
    }

    setKeptGeom(set: KeptGeom, keys: readonly string[], bufs: readonly Float32Array[], counts: readonly number[],
                minX: number, minY: number, maxX: number, maxY: number): boolean {
        const gl = this.gl;
        if (!gl || !this.enabled || !this.geomProgram) return false;
        if (set.gen !== this._gpuGen) this._dropKept(set);
        set.gen = this._gpuGen;
        for (let b = 0; b < set.blocks.length; b++) set.blocks[b].count = 0;
        let ok = true;
        for (let i = 0; i < keys.length; i++) {
            const count = counts[i];
            if (count <= 0) continue;
            const batch = this.geomBatches.get(keys[i]);
            if (!batch) { ok = false; continue; }
            let blk: KeptBlock | null = null;
            for (let b = 0; b < set.blocks.length; b++) if (set.blocks[b].batch === batch) { blk = set.blocks[b]; break; }
            if (blk === null) {
                const prog = batch.circle ? this.circleProgram! : this.geomProgram;
                const vao = gl.createVertexArray()!;
                gl.bindVertexArray(vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, batch.vertexBuffer);
                const vertStride = GEOM_VERT_SIZE * 4;
                this._bindGeomAttr(gl, prog, 'a_localPos', 2, vertStride, 0, 0);
                this._bindGeomAttr(gl, prog, 'a_strokeOffset', 2, vertStride, 8, 0);
                this._bindGeomAttr(gl, prog, 'a_isStroke', 1, vertStride, 16, 0);
                const buf = gl.createBuffer()!;
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                const instStride = GEOM_INSTANCE_STRIDE * 4;
                this._bindGeomAttr(gl, prog, 'a_gWorldPos', 2, instStride, 0, 1);
                this._bindGeomAttr(gl, prog, 'a_gRotation', 1, instStride, 8, 1);
                this._bindGeomAttr(gl, prog, 'a_gScale', 2, instStride, 12, 1);
                this._bindGeomAttr(gl, prog, 'a_gFillColor', 3, instStride, 20, 1);
                this._bindGeomAttr(gl, prog, 'a_gDmgOverlay', 1, instStride, 32, 1);
                this._bindGeomAttr(gl, prog, 'a_gDepth', 1, instStride, 36, 1);
                this._bindGeomAttr(gl, prog, 'a_gAspect', 1, instStride, 40, 1);
                this._bindGeomAttr(gl, prog, 'a_gAlpha', 1, instStride, 44, 1);
                gl.bindVertexArray(null);
                blk = { batch, vao, buf, cap: 0, count: 0, order: 0 };
                set.blocks.push(blk);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, blk.buf);
            if (count > blk.cap) {
                gl.bufferData(gl.ARRAY_BUFFER, bufs[i], gl.STATIC_DRAW, 0, count * GEOM_INSTANCE_STRIDE);
                blk.cap = count;
            } else {
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, bufs[i], 0, count * GEOM_INSTANCE_STRIDE);
            }
            blk.count = count;
        }
        for (let b = set.blocks.length - 1; b >= 0; b--) {
            const blk = set.blocks[b];
            blk.order = this._geomBatchArr.indexOf(blk.batch);
            if (blk.order < 0) {
                if (blk.vao) gl.deleteVertexArray(blk.vao);
                if (blk.buf) gl.deleteBuffer(blk.buf);
                set.blocks.splice(b, 1);
            }
        }
        set.blocks.sort((p, q) => p.order - q.order);
        set.minX = minX; set.minY = minY; set.maxX = maxX; set.maxY = maxY;
        if (!ok) { for (let b = 0; b < set.blocks.length; b++) set.blocks[b].count = 0; }
        return ok;
    }

    drawKeptGeom(set: KeptGeom): boolean {
        const gl = this.gl;
        if (!gl || !this.enabled || !this.geomProgram) return false;
        if (set.gen !== this._gpuGen) return false;
        for (let b = 0; b < set.blocks.length; b++) {
            if (set.blocks[b].count > 0 && this._geomBatchArr.indexOf(set.blocks[b].batch) < 0) return false;
        }
        let onCircle = false, circleSet = false, any = false;
        for (let b = 0; b < set.blocks.length; b++) {
            const blk = set.blocks[b];
            if (blk.count === 0) continue;
            if (!any) { any = true; gl.useProgram(this.geomProgram); this._geomUniforms(gl); }
            if (blk.batch.circle !== onCircle) {
                onCircle = blk.batch.circle;
                gl.useProgram(onCircle ? this.circleProgram : this.geomProgram);
                if (onCircle && !circleSet) { circleSet = true; this._circleUniforms(gl); }
            }
            gl.bindVertexArray(blk.vao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, blk.batch.vertCount, blk.count);
        }
        if (!any) return true;
        gl.bindVertexArray(null);
        if (this.program) gl.useProgram(this.program);
        if (set.minX < this._dirtyMinX) this._dirtyMinX = set.minX;
        if (set.maxX > this._dirtyMaxX) this._dirtyMaxX = set.maxX;
        if (set.minY < this._dirtyMinY) this._dirtyMinY = set.minY;
        if (set.maxY > this._dirtyMaxY) this._dirtyMaxY = set.maxY;
        return true;
    }

    releaseKeptGeom(set: KeptGeom): void { this._dropKept(set); }
    private _dropKept(set: KeptGeom): void {
        const gl = this.gl;
        if (gl && set.gen === this._gpuGen) {
            for (let b = 0; b < set.blocks.length; b++) {
                if (set.blocks[b].vao) gl.deleteVertexArray(set.blocks[b].vao);
                if (set.blocks[b].buf) gl.deleteBuffer(set.blocks[b].buf);
            }
        }
        set.blocks.length = 0;
        set.gen = -1;
    }

    flushGeom(): void {
        const gl = this.gl;
        if (!gl || !this.enabled || !this.geomProgram) return;

        const arr = this._geomBatchArr;
        let hasAny = false;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i].instanceCount > 0) { hasAny = true; break; }
        }
        if (!hasAny) return;

        gl.useProgram(this.geomProgram);
        this._geomUniforms(gl);

        let onCircle = false;
        let circleSet = false;
        for (let i = 0; i < arr.length; i++) {
            const batch = arr[i];
            if (batch.instanceCount === 0) continue;

            if (batch.circle !== onCircle) {
                onCircle = batch.circle;
                gl.useProgram(onCircle ? this.circleProgram : this.geomProgram);
                if (onCircle && !circleSet) {
                    circleSet = true;
                    this._circleUniforms(gl);
                }
            }

            gl.bindVertexArray(batch.vao);

            gl.bindBuffer(gl.ARRAY_BUFFER, batch.instanceBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.instanceData, 0, batch.instanceCount * GEOM_INSTANCE_STRIDE);

            gl.drawArraysInstanced(gl.TRIANGLES, 0, batch.vertCount, batch.instanceCount);
        }

        gl.bindVertexArray(null);

        if (this.program) gl.useProgram(this.program);
    }

    dispose(): void {
        const gl = this.gl;
        if (!gl) return;
        if (this.program) gl.deleteProgram(this.program);
        if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
        if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
        if (this.atlasTexture) gl.deleteTexture(this.atlasTexture);
        if (this.tagTexture) gl.deleteTexture(this.tagTexture);
        if (this.geomProgram) gl.deleteProgram(this.geomProgram);
        if (this.circleProgram) gl.deleteProgram(this.circleProgram);
        if (this.gridProgram) gl.deleteProgram(this.gridProgram);
        if (this.gridVAO) gl.deleteVertexArray(this.gridVAO);
        if (this.gridBuffer) gl.deleteBuffer(this.gridBuffer);
        if (this.gridCornerBuffer) gl.deleteBuffer(this.gridCornerBuffer);
        if (this.fogProgram) gl.deleteProgram(this.fogProgram);
        if (this.fogVAO) gl.deleteVertexArray(this.fogVAO);
        if (this.fogBuffer) gl.deleteBuffer(this.fogBuffer);
        if (this.fogCornerBuffer) gl.deleteBuffer(this.fogCornerBuffer);
        for (const batch of this.geomBatches.values()) {
            gl.deleteVertexArray(batch.vao);
            gl.deleteBuffer(batch.vertexBuffer);
            gl.deleteBuffer(batch.instanceBuffer);
        }
        this.geomBatches.clear();
        this.enabled = false;
        this.gl = null;
    }
}
