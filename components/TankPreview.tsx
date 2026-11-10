import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { useGameDark, useGameThemeVersion } from '../utils/useGameTheme';
import { gameDark, gameThemeVersion } from '../utils/gameTheme';
import { TankConfig, Turret, BodyLayer } from '../types';
import { darkenColor, getRealSizeFactor } from '../utils/p5Utils';
import { getEffectiveDPR, getCumulativeZoom } from '../utils/zoomCompensation';
import { addPreview, previewGLAvailable, previewPicture, wake as wakePreviews, type PreviewItem } from './shared/tankPreviewGL';
import { polyAngleOffset } from './shared/ShapePreviewComponents';
import { turretFill, setGameDarkMode, isGameDark, mapBodyColor, bodyFill, healerCrossFill } from '../utils/gameColors';
import { cmMapOf } from '../utils/colorMap';
import { drawOtherList } from '../utils/otherDraw';
import { layerOutlineOf, strokeFillLayerOutline } from '../utils/layerOutline';
import { lookList, lookUnit, lookReach } from '../utils/placedLook';
import { autoBaseDepth, autoBaseTurn } from '../utils/autoBaseShape';
import { layerColourOf, LAYER_BODY, LAYER_TEAM } from '../game/teamColourSwitch';
import { CT_ICON_FACING } from '../utils/classTreeIcon';

interface Props {
  tankConfig: TankConfig;
  size?: number;
  animate?: boolean;
  colorOverride?: string;
  layerTeamColor?: string;
  boundsFit?: number;
  paused?: boolean;
  turn?: number;
}

const GRID_SPACING = 50;

const CORNER_ROUND_FACTOR = 0.072;

const PREVIEW_STROKE_SCREEN_PX = 6;

const BODY_FRACTION = 0.55;

const _HEALER_CROSS_X = [0.3, 1, 1, 0.3, 0.3, -0.3, -0.3, -1, -1, -0.3, -0.3, 0.3];
const _HEALER_CROSS_Y = [-0.3, -0.3, 0.3, 0.3, 1, 1, 0.3, 0.3, -0.3, -0.3, -1, -1];
const _HEALER_CROSS_SCALE = 0.325;

const _tpStarVx = new Float64Array(64);
const _tpStarVy = new Float64Array(64);

const _tpTurretSortBuf: any[] = [];
const _tpTurretCmp = (a: any, b: any) => (a.renderLayer ?? 0) - (b.renderLayer ?? 0);
function _tpSortTurrets(turrets: any[]): any[] {
    const len = turrets.length;
    _tpTurretSortBuf.length = len;
    for (let i = 0; i < len; i++) _tpTurretSortBuf[i] = turrets[i];
    _tpTurretSortBuf.sort(_tpTurretCmp);
    return _tpTurretSortBuf;
}

const _tpSubSortBuf: any[] = [];
function _tpSortSubTurrets(turrets: any[]): any[] {
    const len = turrets.length;
    _tpSubSortBuf.length = len;
    for (let i = 0; i < len; i++) _tpSubSortBuf[i] = turrets[i];
    _tpSubSortBuf.sort(_tpTurretCmp);
    return _tpSubSortBuf;
}

const _tpBodyLayerSortBuf: BodyLayer[] = [];
const _tpBodyLayerCmp = (a: BodyLayer, b: BodyLayer) => a.renderOrder - b.renderOrder;

let _tpTurretOnLayer = new Uint8Array(64);
let _tpTurretLayerOrder = new Int8Array(64);

function _tpBuildTurretLayerFlags(turrets: Turret[], layers: BodyLayer[] | undefined): void {
    if (_tpTurretOnLayer.length < turrets.length) {
        _tpTurretOnLayer = new Uint8Array(Math.max(turrets.length, 64));
        _tpTurretLayerOrder = new Int8Array(Math.max(turrets.length, 64));
    }
    _tpTurretOnLayer.fill(0, 0, turrets.length);
    _tpTurretLayerOrder.fill(-128, 0, turrets.length);
    if (!layers || layers.length === 0) return;
    for (let li = 0; li < layers.length; li++) {
        const ids = layers[li].turretIds;
        const order = layers[li].renderOrder;
        for (let ii = 0; ii < ids.length; ii++) {
            for (let ti = 0; ti < turrets.length; ti++) {
                if (turrets[ti].id === ids[ii]) {
                    _tpTurretOnLayer[ti] = 1;
                    _tpTurretLayerOrder[ti] = order;
                    break;
                }
            }
        }
    }
}

function mapVal(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return (val - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

function computeMaxExtent(
    turrets: Turret[] | undefined,
    tankSizePx: number,
    tankSides: number,
    bodyLayers?: BodyLayer[]
): number {
    const bodyRadius = tankSizePx / 2 * (tankSides >= 3 ? getRealSizeFactor(tankSides) : 1);
    let maxExtent = bodyRadius;

    if (bodyLayers && bodyLayers.length > 0) {
        for (let li = 0; li < bodyLayers.length; li++) {
            const layer = bodyLayers[li];
            const layerHalf = (tankSizePx / 2) * layer.sizeRatio;
            const layerRadius = layer.sides >= 3 ? layerHalf * getRealSizeFactor(layer.sides) : layerHalf;
            maxExtent = Math.max(maxExtent, layerRadius);
        }
    }

    if (!turrets || turrets.length === 0) return maxExtent;

    for (let i = 0; i < turrets.length; i++) {
        const t = turrets[i];
        const isAuto = t.turretType === 'auto';
        const off = Math.sqrt((t.xOffset * tankSizePx / 2) ** 2 + (t.yOffset * tankSizePx / 2) ** 2);

        const hasSubTurrets = isAuto && t.autoSubTurrets && t.autoSubTurrets.length > 0;

        if (hasSubTurrets) {
            const circleR = mapVal(t.autoCircleSize ?? 25, 0, 50, 0, tankSizePx * 0.96) * 0.7;
            const subSizePx = circleR * 2;
            for (let si = 0; si < t.autoSubTurrets!.length; si++) {
                const sub = t.autoSubTurrets![si];
                const subOff = Math.sqrt((sub.xOffset * subSizePx / 2) ** 2 + (sub.yOffset * subSizePx / 2) ** 2);
                const subLen = sub.look !== undefined ? lookUnit(sub.look, tankSizePx) * lookReach(sub.look)
                    : mapVal(sub.length, 1, 100, subSizePx * 0.01, subSizePx / 2 + subSizePx * 10);
                maxExtent = Math.max(maxExtent, off + subOff + subLen);
            }
        } else {
            const effLength = isAuto ? (t.autoTurretLength ?? 10) : t.length;
            const tLen = !isAuto && t.look !== undefined ? lookUnit(t.look, tankSizePx) * lookReach(t.look)
                : mapVal(effLength, 1, 100, tankSizePx * 0.01, tankSizePx / 2 + tankSizePx * 10);
            maxExtent = Math.max(maxExtent, off + tLen);
        }

        if (isAuto) {
            const circleR = mapVal(t.autoCircleSize ?? 25, 0, 50, 0, tankSizePx * 0.96) * 0.7;
            maxExtent = Math.max(maxExtent, off + circleR);
        }
    }

    return maxExtent;
}

const _ccPoints: [number, number][] = [];
const _SAMPLE_SIDES = 16;
function _pushLookRing(cx: number, cy: number, r: number): void {
    for (let i = 0; i < _SAMPLE_SIDES; i++) {
        const theta = (Math.PI * 2 / _SAMPLE_SIDES) * i;
        _ccPoints.push([cx + Math.cos(theta) * r, cy + Math.sin(theta) * r]);
    }
}

function _ccRounder(val: number): number {
    if (Math.abs(val) < 0.00001) val = 0;
    return +val.toPrecision(6);
}

function _ccConstructCircumcircle(
    p1: [number, number], p2: [number, number], p3: [number, number]
): { x: number; y: number; r: number } {
    let x1 = _ccRounder(p1[0]), y1 = _ccRounder(p1[1]);
    let x2 = _ccRounder(p2[0]), y2 = _ccRounder(p2[1]);
    let x3 = _ccRounder(p3[0]), y3 = _ccRounder(p3[1]);
    if (x3 === x1 || x3 === x2) x3 += 1e-5;
    const numer1 = x3 ** 2 + y3 ** 2 - x1 ** 2 - y1 ** 2;
    const numer2 = x2 ** 2 + y2 ** 2 - x1 ** 2 - y1 ** 2;
    const factorX1 = 2 * x2 - 2 * x1;
    const factorX2 = 2 * x3 - 2 * x1;
    const factorY1 = 2 * y1 - 2 * y2;
    const factorY2 = 2 * y1 - 2 * y3;
    const y = (numer1 * factorX1 - numer2 * factorX2) / (factorY1 * factorX2 - factorY2 * factorX1);
    const x = ((y - y3) ** 2 - (y - y1) ** 2 - x1 ** 2 + x3 ** 2) / factorX2;
    const r = Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
    return { x, y, r };
}

export function computeCircumcircle(
    turrets: Turret[] | undefined,
    tankSizePx: number,
    tankSides: number,
    bodyLayers?: BodyLayer[]
): { radius: number; centerX: number; centerY: number } {
    _ccPoints.length = 0;

    const bodyHalf = tankSizePx / 2;
    if (tankSides < 3) {
        for (let i = 0; i < _SAMPLE_SIDES; i++) {
            const theta = (Math.PI * 2 / _SAMPLE_SIDES) * i;
            _ccPoints.push([Math.cos(theta) * bodyHalf, Math.sin(theta) * bodyHalf]);
        }
    } else {
        const intSides = Math.floor(tankSides);
        const visualHalf = bodyHalf * getRealSizeFactor(intSides);
        const evenOff = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
        for (let i = 0; i < intSides; i++) {
            const theta = (Math.PI * 2 * i) / intSides + evenOff;
            _ccPoints.push([Math.cos(theta) * visualHalf, Math.sin(theta) * visualHalf]);
        }
    }

    if (bodyLayers && bodyLayers.length > 0) {
        for (let li = 0; li < bodyLayers.length; li++) {
            const layer = bodyLayers[li];
            const layerHalf = bodyHalf * layer.sizeRatio;
            const lSides = layer.sides;
            if (lSides < 3) {
                for (let i = 0; i < _SAMPLE_SIDES; i++) {
                    const theta = (Math.PI * 2 / _SAMPLE_SIDES) * i;
                    _ccPoints.push([Math.cos(theta) * layerHalf, Math.sin(theta) * layerHalf]);
                }
            } else {
                const intS = Math.floor(lSides);
                const vH = layerHalf * getRealSizeFactor(intS);
                const initAngle = layer.initialAngle || 0;
                for (let i = 0; i < intS; i++) {
                    const theta = (Math.PI * 2 * i) / intS + initAngle;
                    _ccPoints.push([Math.cos(theta) * vH, Math.sin(theta) * vH]);
                }
            }
        }
    }

    const _turretLayerRatio = new Map<string, number>();
    if (bodyLayers) {
        for (let li = 0; li < bodyLayers.length; li++) {
            const layer = bodyLayers[li];
            for (let ti = 0; ti < layer.turretIds.length; ti++) {
                _turretLayerRatio.set(layer.turretIds[ti], layer.sizeRatio);
            }
        }
    }
    if (turrets && turrets.length > 0) {
        for (let i = 0; i < turrets.length; i++) {
            const t = turrets[i];
            const isAuto = t.turretType === 'auto';
            const layerRatio = _turretLayerRatio.get(t.id) ?? 1;
            const effSizePx = tankSizePx * layerRatio;
            const offX = t.xOffset * effSizePx / 2;
            const offY = t.yOffset * effSizePx / 2;
            const hasSubTurrets = isAuto && t.autoSubTurrets && t.autoSubTurrets.length > 0;

            if (hasSubTurrets) {
                const circleR = mapVal(t.autoCircleSize ?? 25, 0, 50, 0, effSizePx * 0.96) * 0.7;
                const sinA = Math.sin(t.angle);
                const cosA = Math.cos(t.angle);
                for (let ci = 0; ci < _SAMPLE_SIDES; ci++) {
                    const theta = (Math.PI * 2 / _SAMPLE_SIDES) * ci;
                    const lx = Math.cos(theta) * circleR;
                    const ly = Math.sin(theta) * circleR;
                    _ccPoints.push([offX + lx * cosA - ly * sinA, offY + lx * sinA + ly * cosA]);
                }
                const subSizePx = circleR * 2;
                for (let si = 0; si < t.autoSubTurrets!.length; si++) {
                    const sub = t.autoSubTurrets![si];
                    const subOffX = sub.xOffset * subSizePx / 2;
                    const subOffY = sub.yOffset * subSizePx / 2;
                    if (sub.look !== undefined) {
                        _pushLookRing(offX + subOffX * cosA - subOffY * sinA, offY + subOffX * sinA + subOffY * cosA, lookUnit(sub.look, effSizePx) * lookReach(sub.look));
                        continue;
                    }
                    const subLen = mapVal(sub.length, 1, 100, subSizePx * 0.01, subSizePx / 2 + subSizePx * 10);
                    const subWid = mapVal(sub.width, 0, 50, 0, subSizePx * 0.96);
                    const subAngle = t.angle + sub.angle;
                    const sS = Math.sin(subAngle);
                    const sC = Math.cos(subAngle);
                    const hw = subWid / 2;
                    const corners: [number, number][] = [
                        [0, hw], [subLen, hw * sub.aspect],
                        [subLen, -hw * sub.aspect], [0, -hw]
                    ];
                    for (let ci = 0; ci < 4; ci++) {
                        const lx = corners[ci][0] + subOffX;
                        const ly = corners[ci][1] + subOffY;
                        _ccPoints.push([offX + lx * sC - ly * sS, offY + lx * sS + ly * sC]);
                    }
                }
            } else if (!isAuto && t.look !== undefined) {
                _pushLookRing(offX, offY, lookUnit(t.look, effSizePx) * lookReach(t.look));
            } else if (!isAuto) {
                const tLen = mapVal(t.length, 1, 100, effSizePx * 0.01, effSizePx / 2 + effSizePx * 10);
                const tWid = mapVal(t.width, 0, 50, 0, effSizePx * 0.96);
                const hw = tWid / 2;
                const sinA = Math.sin(t.angle);
                const cosA = Math.cos(t.angle);
                const corners: [number, number][] = [
                    [0, hw], [tLen, hw * t.aspect],
                    [tLen, -hw * t.aspect], [0, -hw]
                ];
                for (let ci = 0; ci < 4; ci++) {
                    const rx = corners[ci][0] * cosA - corners[ci][1] * sinA;
                    const ry = corners[ci][0] * sinA + corners[ci][1] * cosA;
                    _ccPoints.push([offX + rx, offY + ry]);
                }
            }

            if (isAuto && !hasSubTurrets && !(t as any).autoCircleHidden) {
                const circleR = mapVal(t.autoCircleSize ?? 25, 0, 50, 0, effSizePx * 0.96) * 0.7;
                for (let ci = 0; ci < _SAMPLE_SIDES; ci++) {
                    const theta = (Math.PI * 2 / _SAMPLE_SIDES) * ci;
                    _ccPoints.push([offX + Math.cos(theta) * circleR, offY + Math.sin(theta) * circleR]);
                }
            }
        }
    }

    if (_ccPoints.length < 3) {
        const r = bodyHalf * (tankSides >= 3 ? getRealSizeFactor(Math.floor(tankSides)) : 1);
        return { radius: r, centerX: 0, centerY: 0 };
    }

    _ccPoints.sort((a, b) => (b[0] ** 2 + b[1] ** 2) - (a[0] ** 2 + a[1] ** 2));

    const getFurthestFrom = (fx: number, fy: number): [number, number] => {
        let bestDist = 0, bestIdx = 0;
        for (let i = 0; i < _ccPoints.length; i++) {
            const dx = _ccPoints[i][0] - fx;
            const dy = _ccPoints[i][1] - fy;
            const d = dx * dx + dy * dy;
            if (d > bestDist) { bestDist = d; bestIdx = i; }
        }
        const pt: [number, number] = [_ccRounder(_ccPoints[bestIdx][0]), _ccRounder(_ccPoints[bestIdx][1])];
        _ccPoints.splice(bestIdx, 1);
        return pt;
    };

    const samePoint = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
    const onLine = (e1: [number, number], e2: [number, number], cp: [number, number]) => {
        const xD = e2[0] - e1[0], yD = e2[1] - e1[1];
        if (xD === 0) return cp[0] === e1[0];
        const slope = yD / xD;
        const predictedY = e1[1] + (cp[0] - e1[0]) * slope;
        return Math.abs(cp[1] - predictedY) <= 1e-5;
    };

    const point1 = getFurthestFrom(0, 0);
    let point2 = getFurthestFrom(point1[0], point1[1]);
    while ((point1[0] === 0 && point2[0] === 0) || (point1[1] === 0 && point2[1] === 0)) {
        if (_ccPoints.length === 0) break;
        point2 = getFurthestFrom(point1[0], point1[1]);
    }

    const avgX = (point1[0] + point2[0]) / 2;
    const avgY = (point1[1] + point2[1]) / 2;
    let point3 = getFurthestFrom(avgX, avgY);
    while ((samePoint(point3, point1) || samePoint(point3, point2) || onLine(point1, point2, point3)) && _ccPoints.length > 0) {
        point3 = getFurthestFrom(avgX, avgY);
    }

    if (samePoint(point3, point1) || samePoint(point3, point2) || onLine(point1, point2, point3)) {
        const dx = point2[0] - point1[0];
        const dy = point2[1] - point1[1];
        const r = Math.sqrt(dx * dx + dy * dy) / 2;
        return { radius: r, centerX: (point1[0] + point2[0]) / 2, centerY: (point1[1] + point2[1]) / 2 };
    }

    const cc = _ccConstructCircumcircle(point1, point2, point3);
    return { radius: cc.r, centerX: cc.x, centerY: cc.y };
}

function roundedPolygonPath(ctx: CanvasRenderingContext2D, sides: number, radius: number, angleOffset: number) {
    const cornerR = radius * CORNER_ROUND_FACTOR;
    const vx: number[] = [];
    const vy: number[] = [];
    for (let i = 0; i < sides; i++) {
        const a = (Math.PI * 2 * i) / sides + angleOffset;
        vx[i] = radius * Math.cos(a);
        vy[i] = radius * Math.sin(a);
    }
    const lastIdx = sides - 1;
    const mx = (vx[lastIdx] + vx[0]) * 0.5;
    const my = (vy[lastIdx] + vy[0]) * 0.5;
    ctx.moveTo(mx, my);
    for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        ctx.arcTo(vx[i], vy[i], vx[next], vy[next], cornerR);
    }
    ctx.closePath();
}

function roundedBarrelPath(
    ctx: CanvasRenderingContext2D,
    tLen: number, topY: number, botY: number, topScaled: number, botScaled: number
) {
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

function _tpRoundedStarPath(
    ctx: CanvasRenderingContext2D,
    sides: number,
    outerRadius: number,
    innerRadius: number,
    angleOffset: number,
    curved: boolean
) {
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
            _tpStarVx[i] = r * Math.cos(a);
            _tpStarVy[i] = r * Math.sin(a);
        }
        ctx.moveTo(_tpStarVx[0], _tpStarVy[0]);
        for (let i = 1; i < totalPoints; i++) {
            ctx.lineTo(_tpStarVx[i], _tpStarVy[i]);
        }
        ctx.closePath();
    }
}

function _tpStrokeFillPolygonCopies(
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
            _tpRoundedStarPath(ctx, sides, radius, radius * (1 - starDepth), rotOff, starCurved);
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

function _tpDrawHealerCross(ctx: CanvasRenderingContext2D, sizePx: number, strokeWidth: number) {
    const r = _HEALER_CROSS_SCALE * sizePx;
    ctx.beginPath();
    ctx.moveTo(_HEALER_CROSS_X[0] * r, _HEALER_CROSS_Y[0] * r);
    for (let i = 1; i < 12; i++) ctx.lineTo(_HEALER_CROSS_X[i] * r, _HEALER_CROSS_Y[i] * r);
    ctx.closePath();
    ctx.fillStyle = healerCrossFill();
    ctx.strokeStyle = darkenColor(healerCrossFill(), 0.598);
    ctx.lineWidth = strokeWidth * 0.7;
    ctx.stroke();
    ctx.fill();
}

const TankPreview2D: React.FC<Props> = ({ tankConfig, size = 100, animate = true, colorOverride, layerTeamColor, boundsFit, paused }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0);
  const animationRef = useRef<number>();
  const lastTimeRef = useRef(0);
  const ccCenterXRef = useRef(0);
  const ccCenterYRef = useRef(0);
  const pausedRef = useRef(paused ?? false);
  pausedRef.current = paused ?? false;
  const cacheCanvasRef = useRef<OffscreenCanvas | null>(null);
  const cacheDarkRef = useRef<number | null>(null);
  const htmlDark = useGameDark();
  const themeV = useGameThemeVersion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    lastTimeRef.current = 0;
    cacheCanvasRef.current = null;
    cacheDarkRef.current = null;

    const rawDpr = getEffectiveDPR();
    const total = Math.max(2, Math.min(rawDpr, 2));
    canvas.width = Math.round(size * total);
    canvas.height = Math.round(size * total);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(total, total);
    ctx.lineJoin = 'round';

    const draw = (timestamp?: number) => {
      let dtFactor = 1;
      if (timestamp !== undefined && lastTimeRef.current > 0) {
        const dtMs = Math.min(timestamp - lastTimeRef.current, 50);
        dtFactor = (dtMs / 1000) * 60;
      }
      if (timestamp !== undefined) lastTimeRef.current = timestamp;
      setGameDarkMode(gameDark());
      const isDark = isGameDark();

      if (animate && cacheCanvasRef.current && cacheDarkRef.current === (isDark ? 1 : 0) + gameThemeVersion() * 2) {
        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(angleRef.current);
        ctx.drawImage(cacheCanvasRef.current, -size / 2, -size / 2, size, size);
        ctx.restore();
        if (!pausedRef.current) {
          angleRef.current += 0.01 * dtFactor;
        }
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      const cacheIt = animate && typeof OffscreenCanvas !== 'undefined';
      const spin = animate && !cacheIt ? angleRef.current : 0;

      ctx.clearRect(0, 0, size, size);

      ctx.save();
      ctx.translate(size / 2, size / 2);

      const tankSizePx = mapVal(tankConfig.tankSize, 1, 100, GRID_SPACING, 10 * GRID_SPACING);

      const bodyColor = colorOverride ? mapBodyColor(colorOverride) : bodyFill(tankConfig.tankColor, cmMapOf(tankConfig.tankColorMap));

      let scale: number;

      if (boundsFit != null) {
        const cc = computeCircumcircle(tankConfig.turrets, tankSizePx, tankConfig.tankSides, tankConfig.bodyLayers);
        scale = (boundsFit * size) / (cc.radius * 2);
        ccCenterXRef.current = cc.centerX;
        ccCenterYRef.current = cc.centerY;
      } else {
        const padding = animate ? 6 : 0;
        const bodyFraction = animate ? BODY_FRACTION : 1.0;
        const availableSize = size - padding * 2;
        const bodyHalf = tankSizePx / 2;
        let visualBodyRadius = bodyHalf * (tankConfig.tankSides >= 3 ? getRealSizeFactor(tankConfig.tankSides) : 1);
        const bLayersEarly = tankConfig.bodyLayers;
        if (bLayersEarly && bLayersEarly.length > 0) {
          for (let li = 0; li < bLayersEarly.length; li++) {
            const layerHalf = bodyHalf * bLayersEarly[li].sizeRatio;
            const layerRadius = bLayersEarly[li].sides >= 3 ? layerHalf * getRealSizeFactor(bLayersEarly[li].sides) : layerHalf;
            if (layerRadius > visualBodyRadius) visualBodyRadius = layerRadius;
          }
        }
        const desiredScale = (availableSize * bodyFraction) / (visualBodyRadius * 2);
        scale = desiredScale;
        if (animate) {
            const actualMaxExtent = computeMaxExtent(tankConfig.turrets, tankSizePx, tankConfig.tankSides, tankConfig.bodyLayers);
            const strokeMargin = PREVIEW_STROKE_SCREEN_PX;
            if (actualMaxExtent * 2 * desiredScale + strokeMargin > availableSize) {
                scale = (availableSize - strokeMargin) / (actualMaxExtent * 2);
            }
        }
      }

      const screenStroke = PREVIEW_STROKE_SCREEN_PX / scale;
      const useStrokeThenFill = boundsFit != null;

      ctx.scale(scale, scale);

      if (boundsFit != null && (ccCenterXRef.current !== 0 || ccCenterYRef.current !== 0)) {
        const curAngle = animate ? spin : (tankConfig.tankSides >= 3 ? polyAngleOffset(tankConfig.tankSides) : 0);
        const cosA = Math.cos(curAngle);
        const sinA = Math.sin(curAngle);
        const xShift = ccCenterXRef.current * cosA - ccCenterYRef.current * sinA;
        const yShift = ccCenterXRef.current * sinA + ccCenterYRef.current * cosA;
        ctx.translate(-xShift, -yShift);
      }

      if (animate) {
        ctx.rotate(spin);
      } else if (tankConfig.tankSides >= 3) {
        ctx.rotate(polyAngleOffset(tankConfig.tankSides));
      }

      let lookHost = 0;
      const lookFill = (c: string, m: number): string => bodyFill(c, m);
      const lookLine = (f: string): string => darkenColor(f, 0.598);
      const drawTurret = (t: Turret, overrideSizePx?: number, parentRotation?: number,
          sideCorr = 1.0) => {
        const effSizePx = overrideSizePx ?? tankSizePx;
        const isAuto = t.turretType === 'auto';

        ctx.save();
        ctx.translate(t.xOffset * effSizePx / 2, t.yOffset * effSizePx / 2);

        const hasSubTurrets = isAuto && t.autoSubTurrets && t.autoSubTurrets.length > 0;

        if (isAuto) ctx.save();
        ctx.rotate(t.angle);

        if (hasSubTurrets) {
          const circleR = mapVal(t.autoCircleSize ?? 25, 0, 50, 0, effSizePx * 0.96) * 0.7;
          const subSizePx = circleR * 2;

          ctx.save();
          if (!t.autoCircleHidden) {
            ctx.beginPath();
            ctx.rect(-effSizePx * 10, -effSizePx * 10, effSizePx * 20, effSizePx * 20);
            const _cbSides = t.autoCircleBaseSides ?? 0;
            if (_cbSides >= 3) {
              const _cbDepth = autoBaseDepth(_cbSides, t.autoCircleBaseDepth);
              const _cbTurn = autoBaseTurn(_cbSides, _cbDepth) - t.angle;
              if (_cbDepth > 0) _tpRoundedStarPath(ctx, Math.floor(_cbSides), circleR, circleR * (1 - _cbDepth), _cbTurn, false);
              else roundedPolygonPath(ctx, _cbSides, circleR, _cbTurn);
            } else {
              ctx.arc(0, 0, circleR, 0, Math.PI * 2, true);
            }
            ctx.clip('evenodd');
          }

          const sortedSubs = _tpSortSubTurrets(t.autoSubTurrets!);
          lookHost = effSizePx;
          for (let si = 0; si < sortedSubs.length; si++) {
            if (sortedSubs[si].aboveBase === true) continue;
            drawTurret(sortedSubs[si], subSizePx, t.angle);
          }
          lookHost = 0;
          ctx.restore();
        } else if (!isAuto && t.look !== undefined) {
          const _ll = lookList(t.look);
          drawOtherList(ctx, _ll, 0, 0, lookUnit(t.look, lookHost > 0 ? lookHost : effSizePx) * 2, 0, _ll.rest, screenStroke, lookFill, lookLine);
        } else if (!isAuto) {
          const widthCorr = sideCorr;
          const lengthCorr = sideCorr < 1 ? Math.pow(sideCorr, 0.25) : 1.0;
          const effLength = isAuto ? (t.autoTurretLength ?? 10) : t.length;
          const effWidth = isAuto ? (t.autoTurretWidth ?? 25) : t.width;
          const tLen = mapVal(effLength, 1, 100, effSizePx * 0.01, effSizePx / 2 + effSizePx * 10) * lengthCorr;
          const tWid = mapVal(effWidth, 0, 50, 0, effSizePx * 0.96) * widthCorr;
          const aspect = t.aspect;

          const topY = -tWid / 2;
          const botY = tWid / 2;
          const topScaled = topY * aspect;
          const botScaled = botY * aspect;

          ctx.beginPath();
          roundedBarrelPath(ctx, tLen, topY, botY, topScaled, botScaled);

          const barrelColor = turretFill(t.color, cmMapOf(t.colorMap));
          if (useStrokeThenFill) {
            ctx.strokeStyle = darkenColor(barrelColor, 0.598);
            ctx.lineWidth = screenStroke;
            ctx.stroke();
            ctx.fillStyle = barrelColor;
            ctx.fill();
          } else {
            ctx.fillStyle = barrelColor;
            ctx.fill();
            ctx.strokeStyle = darkenColor(barrelColor, 0.598);
            ctx.lineWidth = screenStroke;
            ctx.stroke();
          }
        }

        if (isAuto) {
          ctx.restore();

          const circleR = mapVal(t.autoCircleSize ?? 25, 0, 50, 0, effSizePx * 0.96) * 0.7;
          if (!t.autoCircleHidden) {
            const _abSides = t.autoCircleBaseSides ?? 0;
            ctx.beginPath();
            if (_abSides >= 3) {
              const _abDepth = autoBaseDepth(_abSides, t.autoCircleBaseDepth);
              if (_abDepth > 0) _tpRoundedStarPath(ctx, Math.floor(_abSides), circleR, circleR * (1 - _abDepth), autoBaseTurn(_abSides, _abDepth), false);
              else roundedPolygonPath(ctx, _abSides, circleR, autoBaseTurn(_abSides, 0));
            } else {
              ctx.arc(0, 0, circleR, 0, Math.PI * 2);
            }
            const circleColor = t.autoCircleColorMatch ? bodyColor : turretFill(t.color, cmMapOf(t.colorMap));
            if (useStrokeThenFill) {
              ctx.strokeStyle = darkenColor(circleColor, 0.598);
              ctx.lineWidth = screenStroke;
              ctx.stroke();
              ctx.fillStyle = circleColor;
              ctx.fill();
            } else {
              ctx.fillStyle = circleColor;
              ctx.fill();
              ctx.strokeStyle = darkenColor(circleColor, 0.598);
              ctx.lineWidth = screenStroke;
              ctx.stroke();
            }
            if (t.autoCircleHealer) _tpDrawHealerCross(ctx, circleR * 2, screenStroke);
          }
          if (hasSubTurrets) {
            let anyAbove = false;
            for (let si = 0; si < t.autoSubTurrets!.length; si++) if (t.autoSubTurrets![si].aboveBase === true) { anyAbove = true; break; }
            if (anyAbove) {
              ctx.save();
              ctx.rotate(t.angle);
              const subsAbove = _tpSortSubTurrets(t.autoSubTurrets!);
              lookHost = effSizePx;
              for (let si = 0; si < subsAbove.length; si++) if (subsAbove[si].aboveBase === true) drawTurret(subsAbove[si], circleR * 2, t.angle);
              lookHost = 0;
              ctx.restore();
            }
          }
        }

        ctx.restore();
      };

      const turrets = tankConfig.turrets || [];
      const sortedT = turrets.length > 0 ? _tpSortTurrets(turrets) : null;
      const bLayers = tankConfig.bodyLayers;
      const hasBodyLayers = bLayers != null && bLayers.length > 0;

      if (sortedT) _tpBuildTurretLayerFlags(sortedT, bLayers);

      if (hasBodyLayers) {
        _tpBodyLayerSortBuf.length = bLayers!.length;
        for (let bli = 0; bli < bLayers!.length; bli++) _tpBodyLayerSortBuf[bli] = bLayers![bli];
        if (bLayers!.length > 1) _tpBodyLayerSortBuf.sort(_tpBodyLayerCmp);
      }

      if (hasBodyLayers) {
        for (let bli = 0; bli < _tpBodyLayerSortBuf.length; bli++) {
          const bLayer = _tpBodyLayerSortBuf[bli];
          if (bLayer.renderOrder < 0) continue;

          const layerSizePx = tankSizePx * bLayer.sizeRatio;
          const layerHalf = layerSizePx / 2;
          const _lw = layerColourOf(bLayer, !!colorOverride, !!layerTeamColor);
          const layerColor = _lw === LAYER_BODY ? bodyColor : _lw === LAYER_TEAM ? mapBodyColor(layerTeamColor!) : bodyFill(bLayer.color, cmMapOf(bLayer.colorMap));

          ctx.save();
          if (sortedT) {
          for (let ti = 0; ti < sortedT.length; ti++) {
            if (!sortedT[ti].aboveTankBody && _tpTurretLayerOrder[ti] === bLayer.renderOrder) {
              drawTurret(sortedT[ti], layerSizePx);
            }
          }
          }

          ctx.lineJoin = 'round';
          const _tpOutline = layerOutlineOf(bLayer);
          if (_tpOutline !== null) {
            const _loStroke = darkenColor(layerColor, 0.598);
            strokeFillLayerOutline(ctx, _tpOutline, layerHalf, bLayer.initialAngle || 0, bLayer.copies, _loStroke, screenStroke, (isDark && bLayer.intangible) ? _loStroke : layerColor);
          } else if (bLayer.sides < 3) {
            ctx.beginPath();
            ctx.arc(0, 0, layerHalf, 0, Math.PI * 2);
            ctx.closePath();
          } else {
            const visualHalf = layerHalf * getRealSizeFactor(bLayer.sides);
            const layerInitAngle = bLayer.initialAngle || 0;
            ctx.beginPath();
            if (bLayer.copies > 1) {
              const _cpStroke = darkenColor(layerColor, 0.598);
              _tpStrokeFillPolygonCopies(ctx, bLayer.sides, bLayer.copies, visualHalf, layerInitAngle,
                _cpStroke, screenStroke, (isDark && bLayer.intangible) ? _cpStroke : layerColor,
                bLayer.starDepth, bLayer.starCurved);
              ctx.beginPath();
            } else if (bLayer.starDepth > 0) {
              const innerR = visualHalf * (1 - bLayer.starDepth);
              _tpRoundedStarPath(ctx, bLayer.sides, visualHalf, innerR, layerInitAngle, bLayer.starCurved);
            } else {
              roundedPolygonPath(ctx, bLayer.sides, visualHalf, layerInitAngle);
            }
          }
          ctx.strokeStyle = darkenColor(layerColor, 0.598);
          ctx.lineWidth = screenStroke;
          ctx.stroke();
          ctx.fillStyle = (isDark && bLayer.intangible) ? ctx.strokeStyle : layerColor;
          ctx.fill();

          if (bLayer.showHealerCross) {
            _tpDrawHealerCross(ctx, layerSizePx, screenStroke);
          }

          if (sortedT) {
          for (let ti = 0; ti < sortedT.length; ti++) {
            if (sortedT[ti].aboveTankBody && _tpTurretLayerOrder[ti] === bLayer.renderOrder) {
              drawTurret(sortedT[ti], layerSizePx);
            }
          }
          }

          ctx.restore();
        }
      }

      if (sortedT) {
        for (let i = 0; i < sortedT.length; i++) {
          if (!sortedT[i].aboveTankBody && !_tpTurretOnLayer[i]) drawTurret(sortedT[i]);
        }
      }

      const drawBody = () => {
        const half = tankSizePx / 2;
        const rawSides = tankConfig.tankSides;
        if (rawSides < 3) {
          ctx.beginPath();
          ctx.arc(0, 0, half, 0, Math.PI * 2);
          ctx.closePath();
        } else {
          const intSides = Math.floor(rawSides);
          const fracRotation = (rawSides % 1) * Math.PI * 2;
          const visualHalf = half * getRealSizeFactor(intSides);
          const evenOff = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
          ctx.beginPath();
          const _mbDepth = tankConfig.tankShapeDepth ?? 0;
          if (_mbDepth > 0) {
            _tpRoundedStarPath(ctx, intSides, visualHalf, visualHalf * (1 - _mbDepth),
              evenOff + fracRotation, tankConfig.tankShapeCurved ?? false);
          } else {
            roundedPolygonPath(ctx, intSides, visualHalf, evenOff + fracRotation);
          }
        }
      };

      if (useStrokeThenFill) {
        ctx.strokeStyle = darkenColor(bodyColor, 0.598);
        ctx.lineWidth = screenStroke;
        drawBody();
        ctx.stroke();
        ctx.fillStyle = bodyColor;
        drawBody();
        ctx.fill();
      } else {
        ctx.fillStyle = bodyColor;
        drawBody();
        ctx.fill();
        ctx.strokeStyle = darkenColor(bodyColor, 0.598);
        ctx.lineWidth = screenStroke;
        drawBody();
        ctx.stroke();
      }

      if (tankConfig.isHealer) {
        _tpDrawHealerCross(ctx, tankSizePx, screenStroke);
      }

      if (sortedT) {
        for (let i = 0; i < sortedT.length; i++) {
          if (sortedT[i].aboveTankBody && !_tpTurretOnLayer[i]) drawTurret(sortedT[i]);
        }
      }

      if (hasBodyLayers) {
        for (let bli = 0; bli < _tpBodyLayerSortBuf.length; bli++) {
          const bLayer = _tpBodyLayerSortBuf[bli];
          if (bLayer.renderOrder >= 0) continue;

          const layerSizePx = tankSizePx * bLayer.sizeRatio;
          const layerHalf = layerSizePx / 2;
          const _lw = layerColourOf(bLayer, !!colorOverride, !!layerTeamColor);
          const layerColor = _lw === LAYER_BODY ? bodyColor : _lw === LAYER_TEAM ? mapBodyColor(layerTeamColor!) : bodyFill(bLayer.color, cmMapOf(bLayer.colorMap));

          ctx.save();
          if (sortedT) {
          for (let ti = 0; ti < sortedT.length; ti++) {
            if (!sortedT[ti].aboveTankBody && _tpTurretLayerOrder[ti] === bLayer.renderOrder) {
              drawTurret(sortedT[ti], layerSizePx);
            }
          }
          }

          ctx.lineJoin = 'round';
          const _tpOutline = layerOutlineOf(bLayer);
          if (_tpOutline !== null) {
            const _loStroke = darkenColor(layerColor, 0.598);
            strokeFillLayerOutline(ctx, _tpOutline, layerHalf, bLayer.initialAngle || 0, bLayer.copies, _loStroke, screenStroke, (isDark && bLayer.intangible) ? _loStroke : layerColor);
          } else if (bLayer.sides < 3) {
            ctx.beginPath();
            ctx.arc(0, 0, layerHalf, 0, Math.PI * 2);
            ctx.closePath();
          } else {
            const visualHalf = layerHalf * getRealSizeFactor(bLayer.sides);
            const layerInitAngle = bLayer.initialAngle || 0;
            ctx.beginPath();
            if (bLayer.copies > 1) {
              const _cpStroke = darkenColor(layerColor, 0.598);
              _tpStrokeFillPolygonCopies(ctx, bLayer.sides, bLayer.copies, visualHalf, layerInitAngle,
                _cpStroke, screenStroke, (isDark && bLayer.intangible) ? _cpStroke : layerColor,
                bLayer.starDepth, bLayer.starCurved);
              ctx.beginPath();
            } else if (bLayer.starDepth > 0) {
              const innerR = visualHalf * (1 - bLayer.starDepth);
              _tpRoundedStarPath(ctx, bLayer.sides, visualHalf, innerR, layerInitAngle, bLayer.starCurved);
            } else {
              roundedPolygonPath(ctx, bLayer.sides, visualHalf, layerInitAngle);
            }
          }
          ctx.strokeStyle = darkenColor(layerColor, 0.598);
          ctx.lineWidth = screenStroke;
          ctx.stroke();
          ctx.fillStyle = (isDark && bLayer.intangible) ? ctx.strokeStyle : layerColor;
          ctx.fill();

          if (bLayer.showHealerCross) {
            _tpDrawHealerCross(ctx, layerSizePx, screenStroke);
          }

          if (sortedT) {
          for (let ti = 0; ti < sortedT.length; ti++) {
            if (sortedT[ti].aboveTankBody && _tpTurretLayerOrder[ti] === bLayer.renderOrder) {
              drawTurret(sortedT[ti], layerSizePx);
            }
          }
          }

          ctx.restore();
        }
      }

      ctx.restore();

      if (cacheIt) {
        try {
          const oc = new OffscreenCanvas(canvas.width, canvas.height);
          const octx = oc.getContext('2d');
          if (octx) {
            octx.drawImage(canvas, 0, 0);
            cacheCanvasRef.current = oc;
            cacheDarkRef.current = (isDark ? 1 : 0) + gameThemeVersion() * 2;
          }
        } catch (_) {
        }
        if (cacheCanvasRef.current && angleRef.current !== 0) {
          ctx.clearRect(0, 0, size, size);
          ctx.save();
          ctx.translate(size / 2, size / 2);
          ctx.rotate(angleRef.current);
          ctx.drawImage(cacheCanvasRef.current, -size / 2, -size / 2, size, size);
          ctx.restore();
        }
      }

      if (animate) {
        if (!pausedRef.current) {
          angleRef.current += 0.01 * dtFactor;
        }
        animationRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [tankConfig, size, animate, colorOverride, layerTeamColor, boundsFit, animate ? null : htmlDark, animate ? null : themeV]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
      }}
    />
  );
};

const TankPreviewGL: React.FC<Props> = ({ tankConfig, size = 100, animate = true, colorOverride, layerTeamColor, boundsFit = 0.6, paused, turn }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const itemRef = useRef<PreviewItem | null>(null);
  const dark = useGameDark();
  const themeV = useGameThemeVersion();
  const shift = useRef({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const cv = canvasRef.current;
    const out = cv ? cv.getContext('bitmaprenderer') : null;
    if (!cv || !out) return;
    const it: PreviewItem = { out, pic: null, w: 0, h: 0, iconPx: 0, angle: 0, spinning: false, need: false, drawnAngle: NaN };
    itemRef.current = it;
    const off = addPreview(it);
    const place = () => {
      const r = cv.getBoundingClientRect();
      if (!(r.width > 0)) return;
      const k = r.width / cv.offsetWidth, d = window.devicePixelRatio || 1;
      const x0 = (r.left - shift.current.x * k) * d, y0 = (r.top - shift.current.y * k) * d;
      const tx = (Math.round(x0) - x0) / (d * k), ty = (Math.round(y0) - y0) / (d * k);
      if (Math.abs(tx - shift.current.x) < 0.001 && Math.abs(ty - shift.current.y) < 0.001) return;
      shift.current.x = tx; shift.current.y = ty;
      cv.style.transform = `translate(${tx}px, ${ty}px)`;
    };
    const settle = (ev: Event) => { const t = ev.target; if (t instanceof Element && t.contains(cv)) place(); };
    place();
    document.addEventListener('animationend', settle, true);
    document.addEventListener('transitionend', settle, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('animationend', settle, true);
      document.removeEventListener('transitionend', settle, true);
      window.removeEventListener('resize', place);
      off(); itemRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const cv = canvasRef.current, it = itemRef.current;
    if (!cv || !it) return;
    const px = Math.max(1, Math.round(size * getEffectiveDPR() * (getCumulativeZoom(cv) || 1)));
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    it.w = px; it.h = px; it.iconPx = px * boundsFit;
    it.need = true;
    wakePreviews();
  }, [size, boundsFit]);

  useLayoutEffect(() => {
    const it = itemRef.current;
    if (!it) return;
    it.pic = previewPicture(tankConfig, dark, colorOverride, layerTeamColor);
    it.need = true;
    wakePreviews();
  }, [tankConfig, dark, themeV, colorOverride, layerTeamColor]);

  useLayoutEffect(() => {
    const it = itemRef.current;
    if (!it) return;
    it.spinning = animate && !paused && turn === undefined;
    if (turn !== undefined) it.angle = turn - CT_ICON_FACING;
    it.need = true;
    wakePreviews();
  }, [animate, paused, turn]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
};

export const TankPreview: React.FC<Props> = (props) => {
  const [gpu] = useState(() => props.boundsFit != null && previewGLAvailable());
  if (gpu) return <TankPreviewGL {...props} />;
  if (props.turn !== undefined) return (
    <div style={{ width: props.size ?? 100, height: props.size ?? 100, transform: `rotate(${props.turn}rad)` }}>
      <TankPreview2D {...props} animate paused />
    </div>
  );
  return <TankPreview2D {...props} />;
};
