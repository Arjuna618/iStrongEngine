import type { Turret, BodyLayer } from '../../types';
import { getRealSizeFactor } from '../../utils/p5Utils';
import { healerCrossFill } from '../../utils/gameColors';

export const CORNER_ROUND_FACTOR = 0.072;

export const TARGET_STROKE_SCREEN_PX = 2.5;

export const CIRCLE_SAMPLE_COUNT = 16;

export const GRID_SPACING = 50;

export const HEALER_CROSS_X = [0.3, 1, 1, 0.3, 0.3, -0.3, -0.3, -1, -1, -0.3, -0.3, 0.3];
export const HEALER_CROSS_Y = [-0.3, -0.3, 0.3, 0.3, 1, 1, 0.3, 0.3, -0.3, -0.3, -1, -1];
export const HEALER_CROSS_SCALE = 0.325;

export function mapVal(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return (val - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

const _turretSortBuf: any[] = [];
const _turretCmp = (a: any, b: any) => (a.renderLayer ?? 0) - (b.renderLayer ?? 0);

export function sortTurretsByLayer(turrets: any[]): any[] {
    const len = turrets.length;
    _turretSortBuf.length = len;
    for (let i = 0; i < len; i++) _turretSortBuf[i] = turrets[i];
    _turretSortBuf.sort(_turretCmp);
    return _turretSortBuf;
}

const _subSortBuf: any[] = [];

export function sortSubTurretsByLayer(turrets: any[]): any[] {
    const len = turrets.length;
    _subSortBuf.length = len;
    for (let i = 0; i < len; i++) _subSortBuf[i] = turrets[i];
    _subSortBuf.sort(_turretCmp);
    return _subSortBuf;
}

export const bodyLayerSortBuf: BodyLayer[] = [];
export const bodyLayerCmp = (a: BodyLayer, b: BodyLayer) => a.renderOrder - b.renderOrder;

let _turretOnLayer = new Uint8Array(64);
let _turretLayerOrder = new Int8Array(64);

export function getTurretOnLayer(): Uint8Array { return _turretOnLayer; }
export function getTurretLayerOrder(): Int8Array { return _turretLayerOrder; }

export function buildTurretLayerFlags(turrets: Turret[], layers: BodyLayer[] | undefined): void {
    if (_turretOnLayer.length < turrets.length) {
        _turretOnLayer = new Uint8Array(Math.max(turrets.length, 64));
        _turretLayerOrder = new Int8Array(Math.max(turrets.length, 64));
    }
    _turretOnLayer.fill(0, 0, turrets.length);
    _turretLayerOrder.fill(-128, 0, turrets.length);
    if (!layers || layers.length === 0) return;
    for (let li = 0; li < layers.length; li++) {
        const ids = layers[li].turretIds;
        const order = layers[li].renderOrder;
        for (let ii = 0; ii < ids.length; ii++) {
            for (let ti = 0; ti < turrets.length; ti++) {
                if (turrets[ti].id === ids[ii]) {
                    _turretOnLayer[ti] = 1;
                    _turretLayerOrder[ti] = order;
                    break;
                }
            }
        }
    }
}

const _bpX: number[] = [];
const _bpY: number[] = [];
let _bpLen = 0;

function _bpPush(x: number, y: number): void {
    if (_bpLen >= _bpX.length) {
        _bpX.push(x);
        _bpY.push(y);
    } else {
        _bpX[_bpLen] = x;
        _bpY[_bpLen] = y;
    }
    _bpLen++;
}

function _collectBarrelPoints(
    ox: number, oy: number, angle: number,
    tLen: number, topY: number, botY: number, topScaled: number, botScaled: number
): void {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const px0 = 0,    py0 = topY;
    const px1 = tLen,  py1 = topScaled;
    const px2 = tLen,  py2 = botScaled;
    const px3 = 0,    py3 = botY;
    _bpPush(ox + px0 * cosA - py0 * sinA, oy + px0 * sinA + py0 * cosA);
    _bpPush(ox + px1 * cosA - py1 * sinA, oy + px1 * sinA + py1 * cosA);
    _bpPush(ox + px2 * cosA - py2 * sinA, oy + px2 * sinA + py2 * cosA);
    _bpPush(ox + px3 * cosA - py3 * sinA, oy + px3 * sinA + py3 * cosA);
}

function _collectCirclePoints(cx: number, cy: number, r: number, n: number): void {
    for (let i = 0; i < n; i++) {
        const theta = (Math.PI * 2 / n) * i;
        _bpPush(cx + Math.cos(theta) * r, cy + Math.sin(theta) * r);
    }
}

function _circumcircle(
    x1: number, y1: number, x2: number, y2: number, x3: number, y3: number
): { x: number; y: number; r: number } {
    if (x3 === x1 || x3 === x2) x3 += 1e-5;
    const n1 = x3 * x3 + y3 * y3 - x1 * x1 - y1 * y1;
    const n2 = x2 * x2 + y2 * y2 - x1 * x1 - y1 * y1;
    const fx1 = 2 * x2 - 2 * x1;
    const fx2 = 2 * x3 - 2 * x1;
    const fy1 = 2 * y1 - 2 * y2;
    const fy2 = 2 * y1 - 2 * y3;
    const denom = fy1 * fx2 - fy2 * fx1;
    if (Math.abs(denom) < 1e-10) {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const r = Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2);
        return { x: cx, y: cy, r };
    }
    const y = (n1 * fx1 - n2 * fx2) / denom;
    const x = ((y - y3) ** 2 - (y - y1) ** 2 - x1 * x1 + x3 * x3) / fx2;
    const r = Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
    return { x, y, r };
}

const _sortIdx: number[] = [];

export function computeBounds(
    turrets: Turret[] | undefined,
    tankSizePx: number,
    tankSides: number,
    bodyLayers?: BodyLayer[]
): { axis: number; middle: { x: number; y: number } } {
    _bpLen = 0;
    const bodyHalf = tankSizePx / 2;

    if (tankSides < 3) {
        _collectCirclePoints(0, 0, bodyHalf, CIRCLE_SAMPLE_COUNT);
    } else {
        const vr = bodyHalf * getRealSizeFactor(tankSides);
        for (let i = 0; i < tankSides; i++) {
            const a = (Math.PI * 2 / tankSides) * i;
            _bpPush(Math.cos(a) * vr, Math.sin(a) * vr);
        }
    }

    if (bodyLayers && bodyLayers.length > 0) {
        for (let li = 0; li < bodyLayers.length; li++) {
            const layer = bodyLayers[li];
            const layerHalf = bodyHalf * layer.sizeRatio;
            if (layer.sides < 3) {
                _collectCirclePoints(0, 0, layerHalf, CIRCLE_SAMPLE_COUNT);
            } else {
                const vr = layerHalf * getRealSizeFactor(layer.sides);
                for (let vi = 0; vi < layer.sides; vi++) {
                    const a = (Math.PI * 2 / layer.sides) * vi;
                    _bpPush(Math.cos(a) * vr, Math.sin(a) * vr);
                }
            }
        }
    }

    let _turretSizeRatios: Map<string, number> | null = null;
    if (bodyLayers && bodyLayers.length > 0) {
        _turretSizeRatios = new Map();
        for (let li = 0; li < bodyLayers.length; li++) {
            const ids = bodyLayers[li].turretIds;
            for (let ii = 0; ii < ids.length; ii++) {
                _turretSizeRatios.set(ids[ii], bodyLayers[li].sizeRatio);
            }
        }
    }

    if (turrets && turrets.length > 0) {
        for (let ti = 0; ti < turrets.length; ti++) {
            const t = turrets[ti];
            const isAuto = t.turretType === 'auto';
            const sizeRatio = _turretSizeRatios?.get(t.id) ?? 1.0;
            const effTankSize = tankSizePx * sizeRatio;
            const effHalf = effTankSize / 2;
            const ox = t.xOffset * effHalf;
            const oy = t.yOffset * effHalf;

            const hasSubTurrets = isAuto && t.autoSubTurrets && t.autoSubTurrets.length > 0;

            if (hasSubTurrets) {
                const circleR = mapVal(t.autoCircleSize ?? 25, 0, 50, 0, effTankSize * 0.96) * 0.7;
                const subSizePx = circleR * 2;
                for (let si = 0; si < t.autoSubTurrets!.length; si++) {
                    const sub = t.autoSubTurrets![si];
                    const subOx = ox + sub.xOffset * subSizePx / 2;
                    const subOy = oy + sub.yOffset * subSizePx / 2;
                    const subLen = mapVal(sub.length, 1, 100, subSizePx * 0.01, subSizePx / 2 + subSizePx * 10);
                    const subWid = mapVal(sub.width, 0, 50, 0, subSizePx * 0.96);
                    const aspect = sub.aspect;
                    const topY = -subWid / 2;
                    const botY = subWid / 2;
                    _collectBarrelPoints(subOx, subOy, t.angle + sub.angle, subLen, topY, botY, topY * aspect, botY * aspect);
                }
            } else {
                const effLength = isAuto ? (t.autoTurretLength ?? 10) : t.length;
                const effWidth = isAuto ? (t.autoTurretWidth ?? 25) : t.width;
                const tLen = mapVal(effLength, 1, 100, effTankSize * 0.01, effHalf + effTankSize * 10);
                const tWid = mapVal(effWidth, 0, 50, 0, effTankSize * 0.96);
                const aspect = t.aspect;
                const topY = -tWid / 2;
                const botY = tWid / 2;
                _collectBarrelPoints(ox, oy, t.angle, tLen, topY, botY, topY * aspect, botY * aspect);
            }

            if (isAuto) {
                const circleR = mapVal(t.autoCircleSize ?? 25, 0, 50, 0, effTankSize * 0.96) * 0.7;
                _collectCirclePoints(ox, oy, circleR, 8);
            }
        }
    }

    const n = _bpLen;
    if (n < 3) {
        const br = bodyHalf * (tankSides >= 3 ? getRealSizeFactor(tankSides) : 1);
        return { axis: br * 2, middle: { x: 0, y: 0 } };
    }

    _sortIdx.length = n;
    for (let i = 0; i < n; i++) _sortIdx[i] = i;
    _sortIdx.sort((a, b) => (_bpX[b] ** 2 + _bpY[b] ** 2) - (_bpX[a] ** 2 + _bpY[a] ** 2));

    const i1 = _sortIdx[0];
    const p1x = _bpX[i1], p1y = _bpY[i1];

    let best = -1, bestDist = -1;
    for (let si = 0; si < n; si++) {
        const idx = _sortIdx[si];
        if (idx === i1) continue;
        const dx = _bpX[idx] - p1x, dy = _bpY[idx] - p1y;
        const d = dx * dx + dy * dy;
        if (d > bestDist) {
            bestDist = d;
            best = idx;
        }
    }
    const p2x = _bpX[best], p2y = _bpY[best];

    const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2;
    let p3x = 0, p3y = 0, found3 = false;

    _sortIdx.sort((a, b) => {
        const da = (_bpX[a] - mx) ** 2 + (_bpY[a] - my) ** 2;
        const db = (_bpX[b] - mx) ** 2 + (_bpY[b] - my) ** 2;
        return db - da;
    });

    for (let si = 0; si < n; si++) {
        const idx = _sortIdx[si];
        if (idx === i1 || idx === best) continue;
        const cx = _bpX[idx], cy = _bpY[idx];
        if (cx === p1x && cy === p1y) continue;
        if (cx === p2x && cy === p2y) continue;
        const cross = (p2x - p1x) * (cy - p1y) - (p2y - p1y) * (cx - p1x);
        if (Math.abs(cross) > 1e-5) {
            p3x = cx;
            p3y = cy;
            found3 = true;
            break;
        }
    }

    if (!found3) {
        const ccx = (p1x + p2x) / 2;
        const ccy = (p1y + p2y) / 2;
        let r = Math.sqrt((p1x - ccx) ** 2 + (p1y - ccy) ** 2);
        for (let i = 0; i < n; i++) {
            const dx = _bpX[i] - ccx;
            const dy = _bpY[i] - ccy;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > r) r = d;
        }
        const axis = Math.max(r * 2, bodyHalf * (tankSides >= 3 ? getRealSizeFactor(tankSides) : 1) * 2);
        return { axis, middle: { x: ccx, y: ccy } };
    }

    const cc = _circumcircle(p1x, p1y, p2x, p2y, p3x, p3y);
    let finalR = cc.r;
    for (let i = 0; i < n; i++) {
        const dx = _bpX[i] - cc.x;
        const dy = _bpY[i] - cc.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > finalR) finalR = d;
    }
    const minAxis = bodyHalf * (tankSides >= 3 ? getRealSizeFactor(tankSides) : 1) * 2;
    return {
        axis: Math.max(finalR * 2, minAxis),
        middle: { x: cc.x, y: cc.y },
    };
}

export function roundedPolygonPath(ctx: CanvasRenderingContext2D, sides: number, radius: number, angleOffset: number): void {
    const cornerR = radius * CORNER_ROUND_FACTOR;
    const vx: number[] = [];
    const vy: number[] = [];
    for (let i = 0; i < sides; i++) {
        const a = (Math.PI * 2 * i) / sides + angleOffset;
        vx[i] = radius * Math.cos(a);
        vy[i] = radius * Math.sin(a);
    }
    const lastIdx = sides - 1;
    const mmx = (vx[lastIdx] + vx[0]) * 0.5;
    const mmy = (vy[lastIdx] + vy[0]) * 0.5;
    ctx.moveTo(mmx, mmy);
    for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        ctx.arcTo(vx[i], vy[i], vx[next], vy[next], cornerR);
    }
    ctx.closePath();
}

export function roundedBarrelPath(
    ctx: CanvasRenderingContext2D,
    tLen: number, topY: number, botY: number, topScaled: number, botScaled: number
): void {
    const tWid = Math.abs(botY - topY);
    const bR = Math.min(tWid, tLen) * CORNER_ROUND_FACTOR;
    const px = [0, tLen, tLen, 0];
    const py = [topY, topScaled, botScaled, botY];
    ctx.moveTo((px[3] + px[0]) * 0.5, (py[3] + py[0]) * 0.5);
    for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4;
        ctx.arcTo(px[i], py[i], px[next], py[next], bR);
    }
    ctx.closePath();
}

const _starVx = new Float64Array(64);
const _starVy = new Float64Array(64);

export function roundedStarPath(
    ctx: CanvasRenderingContext2D,
    sides: number,
    outerRadius: number,
    innerRadius: number,
    angleOffset: number,
    curved: boolean
): void {
    if (curved) {
        ctx.moveTo(
            outerRadius * Math.cos(angleOffset),
            outerRadius * Math.sin(angleOffset)
        );
        for (let i = 0; i < sides; i++) {
            const halfAngle = ((i + 0.5) / sides) * Math.PI * 2 + angleOffset;
            const nextAngle = ((i + 1) / sides) * Math.PI * 2 + angleOffset;
            const cx = innerRadius * Math.cos(halfAngle);
            const cy = innerRadius * Math.sin(halfAngle);
            const px = outerRadius * Math.cos(nextAngle);
            const py = outerRadius * Math.sin(nextAngle);
            ctx.quadraticCurveTo(cx, cy, px, py);
        }
        ctx.closePath();
    } else {
        const totalPoints = sides * 2;
        for (let i = 0; i < totalPoints; i++) {
            const a = (Math.PI * 2 * i) / totalPoints + angleOffset;
            const r = i % 2 === 0 ? outerRadius : innerRadius;
            _starVx[i] = r * Math.cos(a);
            _starVy[i] = r * Math.sin(a);
        }
        ctx.moveTo(_starVx[0], _starVy[0]);
        for (let i = 1; i < totalPoints; i++) {
            ctx.lineTo(_starVx[i], _starVy[i]);
        }
        ctx.closePath();
    }
}

export function strokeFillPolygonCopies(
    ctx: CanvasRenderingContext2D,
    sides: number,
    copies: number,
    radius: number,
    angleOffset: number,
    strokeStyle: string,
    lineWidth: number,
    fillStyle: string,
    starDepth: number,
    starCurved: boolean
): void {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.fillStyle = fillStyle;
    for (let c = 0; c < copies; c++) {
        const rotOff = (Math.PI * 2 * c) / copies + angleOffset;
        ctx.beginPath();
        if (starDepth > 0) {
            roundedStarPath(ctx, sides, radius, radius * (1 - starDepth), rotOff, starCurved);
        } else {
            ctx.moveTo(radius * Math.cos(rotOff), radius * Math.sin(rotOff));
            for (let i = 1; i < sides; i++) {
                const a = (Math.PI * 2 * i) / sides + rotOff;
                ctx.lineTo(radius * Math.cos(a), radius * Math.sin(a));
            }
            ctx.closePath();
        }
        ctx.stroke();
        ctx.fill();
    }
}

export function drawHealerCross(ctx: CanvasRenderingContext2D, sizePx: number, strokeWidth: number, darkenColorFn: (c: string, f: number) => string): void {
    const r = HEALER_CROSS_SCALE * sizePx;
    ctx.beginPath();
    ctx.moveTo(HEALER_CROSS_X[0] * r, HEALER_CROSS_Y[0] * r);
    for (let i = 1; i < 12; i++) ctx.lineTo(HEALER_CROSS_X[i] * r, HEALER_CROSS_Y[i] * r);
    ctx.closePath();
    ctx.fillStyle = healerCrossFill();
    ctx.strokeStyle = darkenColorFn(healerCrossFill(), 0.598);
    ctx.lineWidth = strokeWidth * 0.7;
    ctx.stroke();
    ctx.fill();
}
