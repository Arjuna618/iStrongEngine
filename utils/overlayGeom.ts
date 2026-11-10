export const DBG_LINE_BATCH = 'dbg_line';
export const DBG_DISC_BATCH = 'dbg_disc';
export const DBG_CAP_BATCH = 'dbg_cap';

export const OVL_DEPTH = 0.9;

export const OVL_RING_MIN_SEGS = 16;
export const OVL_RING_MAX_SEGS = 96;
export const OVL_RING_MAX_SAGITTA_PX = 0.2;

export const OVL_MAX_DASHES = 512;

export interface GeomSink {
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
    ): void;
}

export interface OvlBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export function ovlLine(
    gl: GeomSink,
    x0: number, y0: number, x1: number, y1: number,
    width: number, r: number, g: number, b: number, a: number,
): void {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;
    gl.pushGeomInstance(DBG_LINE_BATCH, (x0 + x1) * 0.5, (y0 + y1) * 0.5,
        Math.atan2(dy, dx), len, width, r, g, b, 0, OVL_DEPTH, 1.0, a);
}

export function ovlDisc(
    gl: GeomSink,
    cx: number, cy: number, radius: number,
    r: number, g: number, b: number, a: number,
): void {
    if (radius <= 0) return;
    gl.pushGeomInstance(DBG_DISC_BATCH, cx, cy, 0, radius, radius, r, g, b, 0, OVL_DEPTH, 1.0, a);
}

export function ovlCapsule(
    gl: GeomSink,
    x0: number, y0: number, x1: number, y1: number,
    width: number, r: number, g: number, b: number, a: number,
): void {
    const cap = width * 0.5;
    ovlLine(gl, x0, y0, x1, y1, width, r, g, b, a);
    if (cap <= 0) return;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    gl.pushGeomInstance(DBG_CAP_BATCH, x1, y1, ang, cap, cap, r, g, b, 0, OVL_DEPTH, 1.0, a);
    gl.pushGeomInstance(DBG_CAP_BATCH, x0, y0, ang + Math.PI, cap, cap, r, g, b, 0, OVL_DEPTH, 1.0, a);
}

export function ovlRing(
    gl: GeomSink,
    cx: number, cy: number, radius: number, width: number,
    r: number, g: number, b: number, a: number,
    zoom: number,
): void {
    if (radius <= 0) return;
    const radiusPx = radius * zoom;
    let segs = Math.ceil(Math.PI * Math.sqrt(radiusPx / (2 * OVL_RING_MAX_SAGITTA_PX)));
    if (!(segs >= OVL_RING_MIN_SEGS)) segs = OVL_RING_MIN_SEGS;
    else if (segs > OVL_RING_MAX_SEGS) segs = OVL_RING_MAX_SEGS;
    const step = (Math.PI * 2) / segs;
    const rr = radius * (1 + (1 - Math.cos(step * 0.5)) * 0.5);
    let px = cx + rr, py = cy;
    for (let i = 1; i <= segs; i++) {
        const ang = i * step;
        const nx = cx + Math.cos(ang) * rr;
        const ny = cy + Math.sin(ang) * rr;
        ovlLine(gl, px, py, nx, ny, width, r, g, b, a);
        px = nx; py = ny;
    }
}

export function ovlArc(
    gl: GeomSink,
    cx: number, cy: number, radius: number, a0: number, a1: number, width: number,
    r: number, g: number, b: number, a: number,
    zoom: number,
): void {
    if (radius <= 0 || !(a1 > a0)) return;
    const span = a1 - a0;
    let segs = Math.ceil(span / (Math.PI * 2) * Math.PI * Math.sqrt(radius * zoom / (2 * OVL_RING_MAX_SAGITTA_PX)));
    if (!(segs >= 2)) segs = 2;
    else if (segs > OVL_RING_MAX_SEGS) segs = OVL_RING_MAX_SEGS;
    const step = span / segs;
    let px = cx + Math.cos(a0) * radius, py = cy + Math.sin(a0) * radius;
    for (let i = 1; i <= segs; i++) {
        const ang = a0 + i * step;
        const nx = cx + Math.cos(ang) * radius, ny = cy + Math.sin(ang) * radius;
        ovlLine(gl, px, py, nx, ny, width, r, g, b, a);
        px = nx; py = ny;
    }
}

export function ovlDashedLine(
    gl: GeomSink,
    x0: number, y0: number, x1: number, y1: number,
    width: number, r: number, g: number, b: number, a: number,
    dashOn: number, dashOff: number,
    bounds: OvlBounds,
): void {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;
    const period = dashOn + dashOff;
    if (!(period > 1e-6) || !(dashOn > 0)) {
        ovlLine(gl, x0, y0, x1, y1, width, r, g, b, a);
        return;
    }

    const pad = width * 0.5;
    let t0 = 0, t1 = 1;
    for (let side = 0; side < 4; side++) {
        const p = side === 0 ? -dx : side === 1 ? dx : side === 2 ? -dy : dy;
        const q = side === 0 ? x0 - (bounds.minX - pad)
                : side === 1 ? (bounds.maxX + pad) - x0
                : side === 2 ? y0 - (bounds.minY - pad)
                :              (bounds.maxY + pad) - y0;
        if (p === 0) { if (q < 0) return; continue; }
        const t = q / p;
        if (p < 0) { if (t > t1) return; if (t > t0) t0 = t; }
        else       { if (t < t0) return; if (t < t1) t1 = t; }
    }

    const ux = dx / len, uy = dy / len;
    const startDist = t0 * len;
    const endDist = t1 * len;

    if ((endDist - startDist) / period > OVL_MAX_DASHES) {
        ovlLine(gl, x0 + ux * startDist, y0 + uy * startDist,
                    x0 + ux * endDist, y0 + uy * endDist, width, r, g, b, a);
        return;
    }

    let d = Math.floor(startDist / period) * period;
    while (d < endDist) {
        let s = d;
        let e = d + dashOn;
        if (e > startDist && s < endDist) {
            if (s < startDist) s = startDist;
            if (e > endDist) e = endDist;
            ovlLine(gl, x0 + ux * s, y0 + uy * s, x0 + ux * e, y0 + uy * e, width, r, g, b, a);
        }
        d += period;
    }
}

export const OVL_ROW_STEP_PER_FONT = 1.25;

export function ovlStackTopWorld(
    anchorY: number, baseRowScreen: number, rowCount: number,
    fontPx: number, invZoom: number,
): number {
    if (rowCount <= 0) return Infinity;
    const step = fontPx * OVL_ROW_STEP_PER_FONT;
    return anchorY + (baseRowScreen - (rowCount - 1) * step - fontPx) * invZoom;
}

export function ovlXpTextY(
    stackTop: number | undefined, entityY: number, entityRadius: number,
    clearancePx: number, bodyGap: number, invZoom: number,
): number {
    if (stackTop === undefined || !isFinite(stackTop)) return entityY - (entityRadius + bodyGap);
    return stackTop - clearancePx * invZoom;
}
