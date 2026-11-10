import { TileType, TEAM_COLORS_DARK, TEAM_COLORS_LIGHT } from '../types';
import { HUD_MM_BG_ALPHA, HUD_MM_TILE_ALPHA, HUD_MM_DOT, hudMmObstacleRadius, hudColors, hudMinimapDot, type HudColors } from '../utils/hudArras';
import { rockWearsPumpkin } from '../utils/halloween';
import { customAreaFill, cmHex, CM_USE } from '../utils/colorMap';
import { tracePoly } from '../game/areaShape';
import { SMALL_FIX } from '../game/smallFixSwitch';
import { WALL_RULES } from '../game/wallTypes';

export type MmCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export interface MmRock { x: number; y: number; size: number; shape: number; active: boolean;
    paintSlot?: number; paintHex?: string }
export interface MmPortal { x: number; y: number; timed: boolean; _timedActive: boolean; invisible: boolean }
export interface MmWall { x: number; y: number; halfW: number; halfH: number; active: boolean;
    kind?: number; wslot?: number;
    paintSlot?: number; paintHex?: string }
export interface MmArea { x0: number; y0: number; x1: number; y1: number; color: string; colorMap?: number; opacity: number; noDraw?: boolean;
    poly?: ArrayLike<number> | null }
export interface MmMap {
    mapHalf: number; mapHalfY: number; tileGrid: Uint8Array | null; gridCells: number; gridCellsY: number; cellSize: number;
    rocks: readonly MmRock[]; portals: readonly MmPortal[]; walls: readonly MmWall[];
    customAreas?: readonly MmArea[];
    marks?: readonly number[];
    wallPaint?: { slot?: number; hex?: string };
    rockPaint?: { slot?: number; hex?: string };
    wallGrid?: ArrayLike<number>;
    extraWalls?: readonly number[];
}
export interface MmMoving { skip: Uint8Array; tiles: Uint8Array }
export interface MmMover {
    readonly ms: object; readonly n: number;
    mine(k: number): boolean; isSliding(k: number): boolean; wallOf(k: number): MmWall; spotX(k: number): number; spotY(k: number): number;
}
function mmPaintFill(o: { paintSlot?: number; paintHex?: string }, dark: boolean): string {
    if (o.paintSlot !== undefined && o.paintSlot >= 0) return cmHex(o.paintSlot, dark, CM_USE.GENERAL);
    return o.paintHex !== undefined ? o.paintHex : '';
}
function mmTypedFill(wl: MmWall, dark: boolean, col: HudColors, slotOf: ((o: object) => number) | null): string {
    if (slotOf !== null) { const s = slotOf(wl); if (s >= 0) return hudMinimapDot(cmHex(s, dark, CM_USE.GENERAL), dark); }
    const r = wl.kind !== undefined && wl.kind > 0 ? WALL_RULES[wl.kind] : undefined;
    if (r === undefined) return col.mmWall;
    const sl = wl.wslot !== undefined && wl.wslot >= 0 ? wl.wslot : r.slot;
    return sl === 7 ? col.mmWall : hudMinimapDot(cmHex(sl, dark, CM_USE.GENERAL), dark);
}
export function mmPaintMovers(sCtx: MmCtx, dark: boolean, movers: readonly MmMover[], ms: MmMap, ox: number, oy: number,
    scaleX: number, scaleY: number, areaOffX: number, areaOffY: number, sliding: boolean, col: HudColors,
    slotOf: ((o: object) => number) | null): void {
    const mapHalf = ms.mapHalf, mapHalfY = ms.mapHalfY;
    let last = '';
    for (let i = 0; i < movers.length; i++) {
        const m = movers[i];
        if (m.ms !== ms) continue;
        for (let k = 0; k < m.n; k++) {
            if (m.isSliding(k) !== sliding || !m.mine(k)) continue;
            const wl = m.wallOf(k);
            if (!wl || !wl.active) continue;
            const x = sliding ? wl.x : m.spotX(k), y = sliding ? wl.y : m.spotY(k);
            const c = mmTypedFill(wl, dark, col, slotOf);
            if (c !== last) { sCtx.fillStyle = c; last = c; }
            sCtx.fillRect(ox + (x - areaOffX - wl.halfW + mapHalf) * scaleX, oy + (y - areaOffY - wl.halfH + mapHalfY) * scaleY,
                wl.halfW * 2 * scaleX, wl.halfH * 2 * scaleY);
        }
    }
}

function mmPaintCustomAreas(sCtx: MmCtx, dark: boolean, ms: MmMap, ox: number, oy: number, scaleX: number, scaleY: number,
    areaOffX: number, areaOffY: number, col: HudColors | null = null): void {
    const cas = ms.customAreas;
    if (!cas || cas.length === 0) return;
    const asTile = SMALL_FIX.R663 !== 0;
    for (let i = 0; i < cas.length; i++) {
        const a = cas[i];
        if (a.noDraw === true || a.opacity <= 0) continue;
        const x0 = Math.round(ox + (a.x0 - areaOffX + ms.mapHalf) * scaleX), x1 = Math.round(ox + (a.x1 - areaOffX + ms.mapHalf) * scaleX);
        const y0 = Math.round(oy + (a.y0 - areaOffY + ms.mapHalfY) * scaleY), y1 = Math.round(oy + (a.y1 - areaOffY + ms.mapHalfY) * scaleY);
        if (x1 <= x0 || y1 <= y0) continue;
        if (a.poly != null) {
            sCtx.globalAlpha = asTile ? HUD_MM_TILE_ALPHA : HUD_MM_TILE_ALPHA * a.opacity;
            sCtx.fillStyle = customAreaFill(a, dark);
            sCtx.beginPath(); tracePoly(sCtx, a.poly, ox + (ms.mapHalf - areaOffX) * scaleX, oy + (ms.mapHalfY - areaOffY) * scaleY, scaleX, scaleY); sCtx.fill();
            continue;
        }
        if (asTile && col !== null) {
            sCtx.clearRect(x0, y0, x1 - x0, y1 - y0);
            sCtx.globalAlpha = HUD_MM_BG_ALPHA; sCtx.fillStyle = col.mmBg; sCtx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
        sCtx.globalAlpha = asTile ? HUD_MM_TILE_ALPHA : HUD_MM_TILE_ALPHA * a.opacity;
        sCtx.fillStyle = customAreaFill(a, dark);
        sCtx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    sCtx.globalAlpha = HUD_MM_TILE_ALPHA;
}
function mmUnderArea(cas: readonly MmArea[], gx: number, gy: number, ms: MmMap, areaOffX: number, areaOffY: number): boolean {
    const cs = ms.cellSize, wx = -ms.mapHalf + (gx + 0.5) * cs + areaOffX, wy = -ms.mapHalfY + (gy + 0.5) * cs + areaOffY;
    for (let i = 0; i < cas.length; i++) { const a = cas[i]; if (a.opacity > 0 && a.poly == null && wx >= a.x0 && wx <= a.x1 && wy >= a.y0 && wy <= a.y1) return true; }
    return false;
}

export function mmPaintArea(sCtx: MmCtx, dark: boolean, ms: MmMap, ox: number, oy: number, pxW: number, pxH: number,
    scaleX: number, scaleY: number, boxW: number, worldW: number, k: number, areaOffX: number, areaOffY: number, pumpkinDot: string,
    col: HudColors = hudColors(dark), slotOf: ((o: object) => number) | null = null, mv: MmMoving | null = null): void {
    const teams = dark ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;
    const skip = mv !== null ? mv.skip : null;
    const slotCol = (o: object): string => {
        if (slotOf === null) return '';
        const sl = slotOf(o);
        return sl >= 0 ? hudMinimapDot(cmHex(sl, dark, CM_USE.GENERAL), dark) : '';
    };
    const mapHalf = ms.mapHalf;
    const mapHalfY = ms.mapHalfY;
    const tg = mv !== null ? mv.tiles : ms.tileGrid;
    const gc = ms.gridCells;
    const gcY = ms.gridCellsY;
    const cs = ms.cellSize;
    sCtx.globalAlpha = HUD_MM_TILE_ALPHA;
    if (tg && gc > 0) {
        const csScaleX = cs * scaleX;
        const csScaleY = cs * scaleY;
        let lastFill = '';
        const _mmCas = SMALL_FIX.R663 !== 0 && ms.customAreas && ms.customAreas.length > 0 ? ms.customAreas : null;
        for (let gx = 0; gx < gc; gx++) {
            const x0 = Math.round(ox + gx * csScaleX);
            const x1 = Math.round(ox + (gx + 1) * csScaleX);
            let runFill = '', runY0 = 0;
            for (let gy = 0; gy <= gcY; gy++) {
                let fill = '';
                if (gy < gcY) {
                    const t = tg[gx * gcY + gy];
                    if (t === TileType.NORMAL || t === TileType.SPAWN_AREA || t === TileType.PORTAL) {
                        fill = _mmCas !== null && mmUnderArea(_mmCas, gx, gy, ms, areaOffX, areaOffY) ? '' : col.mmGround;
                    } else if (t >= TileType.BASE_BLUE && t <= TileType.BASE_PURPLE) fill = teams[t - TileType.BASE_BLUE];
                    else if (t === TileType.OUT_BORDER) fill = col.mmPlayer;
                }
                if (fill === runFill) continue;
                const y = Math.round(oy + gy * csScaleY);
                if (runFill !== '') {
                    if (runFill !== lastFill) { sCtx.fillStyle = runFill; lastFill = runFill; }
                    sCtx.fillRect(x0, runY0, x1 - x0, y - runY0);
                }
                runFill = fill; runY0 = y;
            }
        }
        mmPaintCustomAreas(sCtx, dark, ms, ox, oy, scaleX, scaleY, areaOffX, areaOffY);
        sCtx.globalAlpha = 1;
        sCtx.fillStyle = (ms.wallPaint ? mmPaintFill({ paintSlot: ms.wallPaint.slot, paintHex: ms.wallPaint.hex }, dark) : '') || col.mmWall;
        for (let gx = 0; gx < gc; gx++) {
            const x0 = Math.round(ox + gx * csScaleX);
            const x1 = Math.round(ox + (gx + 1) * csScaleX);
            let inRun = false, runY0 = 0;
            for (let gy = 0; gy <= gcY; gy++) {
                let wall = false;
                if (gy < gcY) {
                    const t = tg[gx * gcY + gy];
                    wall = !(t === TileType.NORMAL || t === TileType.SPAWN_AREA || t === TileType.PORTAL || t === TileType.OUT_BORDER ||
                        (t >= TileType.BASE_BLUE && t <= TileType.BASE_PURPLE));
                }
                if (wall === inRun) continue;
                const y = Math.round(oy + gy * csScaleY);
                if (inRun) sCtx.fillRect(x0, runY0, x1 - x0, y - runY0);
                inRun = wall; runY0 = y;
            }
        }
        {
            const walls = ms.walls;
            let any = false, last = '';
            for (let i = 0; i < walls.length; i++) {
                const wl = walls[i];
                if (!wl || !wl.active || (skip !== null && skip[i] === 1)) continue;
                const pc = mmPaintFill(wl, dark);
                if (pc === '') continue;
                if (pc !== last) { sCtx.fillStyle = pc; last = pc; }
                any = true;
                sCtx.fillRect(ox + (wl.x - areaOffX - wl.halfW + mapHalf) * scaleX, oy + (wl.y - areaOffY - wl.halfH + mapHalfY) * scaleY,
                    wl.halfW * 2 * scaleX, wl.halfH * 2 * scaleY);
            }
            if (any) sCtx.fillStyle = col.mmWall;
        }
        if (slotOf !== null) {
            const walls = ms.walls;
            for (let i = 0; i < walls.length; i++) {
                const wl = walls[i];
                if (!wl || !wl.active || (skip !== null && skip[i] === 1)) continue;
                const c = slotCol(wl);
                if (c === '') continue;
                sCtx.fillStyle = c;
                sCtx.fillRect(ox + (wl.x - areaOffX - wl.halfW + mapHalf) * scaleX, oy + (wl.y - areaOffY - wl.halfH + mapHalfY) * scaleY,
                    wl.halfW * 2 * scaleX, wl.halfH * 2 * scaleY);
            }
            sCtx.fillStyle = col.mmWall;
        }
        const ex = ms.extraWalls, wg = ms.wallGrid;
        if (ex !== undefined && ex.length > 0 && wg) {
            for (let gx = 0; gx < gc; gx++) {
                const x0 = Math.round(ox + gx * csScaleX), x1 = Math.round(ox + (gx + 1) * csScaleX);
                for (let gy = 0; gy < gcY; gy++) {
                    const c = gx * gcY + gy, t = tg[c];
                    if (wg[c] >= 0 || t === TileType.NORMAL || t === TileType.SPAWN_AREA || t === TileType.PORTAL || t === TileType.OUT_BORDER ||
                        (t >= TileType.BASE_BLUE && t <= TileType.BASE_PURPLE)) continue;
                    const y0 = Math.round(oy + gy * csScaleY), y1 = Math.round(oy + (gy + 1) * csScaleY);
                    sCtx.clearRect(x0, y0, x1 - x0, y1 - y0);
                    sCtx.globalAlpha = HUD_MM_BG_ALPHA; sCtx.fillStyle = col.mmBg; sCtx.fillRect(x0, y0, x1 - x0, y1 - y0);
                    sCtx.globalAlpha = HUD_MM_TILE_ALPHA; sCtx.fillStyle = col.mmGround; sCtx.fillRect(x0, y0, x1 - x0, y1 - y0);
                }
            }
            sCtx.globalAlpha = 1;
            sCtx.fillStyle = col.mmWall;
            const walls = ms.walls;
            for (let i = 0; i < ex.length; i++) {
                const wl = walls[ex[i]];
                if (!wl || !wl.active || (skip !== null && skip[ex[i]] === 1)) continue;
                if (slotOf !== null) sCtx.fillStyle = slotCol(wl) || col.mmWall;
                sCtx.fillRect(ox + (wl.x - areaOffX - wl.halfW + mapHalf) * scaleX, oy + (wl.y - areaOffY - wl.halfH + mapHalfY) * scaleY,
                    wl.halfW * 2 * scaleX, wl.halfH * 2 * scaleY);
            }
        }
        {
            const walls = ms.walls;
            let any = false;
            for (let i = 0; i < walls.length; i++) {
                const wl = walls[i];
                if (!wl || !wl.active || wl.kind === undefined || wl.kind <= 0 || (skip !== null && skip[i] === 1)) continue;
                if (WALL_RULES[wl.kind] === undefined) continue;
                sCtx.fillStyle = mmTypedFill(wl, dark, col, slotOf); any = true;
                sCtx.fillRect(ox + (wl.x - areaOffX - wl.halfW + mapHalf) * scaleX, oy + (wl.y - areaOffY - wl.halfH + mapHalfY) * scaleY,
                    wl.halfW * 2 * scaleX, wl.halfH * 2 * scaleY);
            }
            if (any) sCtx.fillStyle = col.mmWall;
        }
    } else {
        sCtx.fillStyle = col.mmGround;
        sCtx.fillRect(ox, oy, pxW, pxH);
        mmPaintCustomAreas(sCtx, dark, ms, ox, oy, scaleX, scaleY, areaOffX, areaOffY, col);
    }
    sCtx.globalAlpha = 1;

    const rocks = ms.rocks;
    if (rocks.length > 0) {
        const _mmRockMap = ms.rockPaint ? mmPaintFill({ paintSlot: ms.rockPaint.slot, paintHex: ms.rockPaint.hex }, dark) : '';
        let _mmRockFill = col.mmWall;
        sCtx.fillStyle = _mmRockFill;
        for (let i = 0; i < rocks.length; i++) {
            const rock = rocks[i];
            if (!rock.active) continue;
            const _want = (pumpkinDot !== '' && rockWearsPumpkin(rock.shape)) ? pumpkinDot : (slotOf !== null ? slotCol(rock) || mmPaintFill(rock, dark) || _mmRockMap || col.mmWall : mmPaintFill(rock, dark) || _mmRockMap || col.mmWall);
            if (_want !== _mmRockFill) { _mmRockFill = _want; sCtx.fillStyle = _want; }
            const rx = ox + (rock.x - areaOffX + mapHalf) * scaleX;
            const ry = oy + (rock.y - areaOffY + mapHalfY) * scaleY;
            const rr = hudMmObstacleRadius(rock.size, boxW, worldW * k) * k;
            sCtx.beginPath();
            sCtx.arc(rx, ry, rr, 0, Math.PI * 2);
            sCtx.fill();
        }
    }

    const portals = ms.portals;
    if (portals.length > 0) {
        sCtx.fillStyle = col.mmPortal;
        const portalDotR = HUD_MM_DOT * k;
        for (let i = 0; i < portals.length; i++) {
            const portal = portals[i];
            if (portal.timed && !portal._timedActive) continue;
            if (portal.invisible) continue;
            const px = ox + (portal.x - areaOffX + mapHalf) * scaleX;
            const py = oy + (portal.y - areaOffY + mapHalfY) * scaleY;
            sCtx.beginPath();
            sCtx.arc(px, py, portalDotR, 0, Math.PI * 2);
            sCtx.fill();
        }
    }

    const marks = ms.marks;
    if (marks !== undefined && marks.length > 0) {
        const markR = HUD_MM_DOT * k;
        for (let i = 0; i + 2 < marks.length; i += 3) {
            if (!(marks[i + 2] > 0)) continue;
            sCtx.fillStyle = teams[marks[i + 2] - 1];
            sCtx.beginPath();
            sCtx.arc(ox + (marks[i] + mapHalf) * scaleX, oy + (marks[i + 1] + mapHalfY) * scaleY, markR, 0, Math.PI * 2);
            sCtx.fill();
        }
    }

    const walls = ms.walls;
    if (walls.length > 0 && !(tg && gc > 0)) {
        sCtx.fillStyle = col.mmWall;
        for (let i = 0; i < walls.length; i++) {
            const wl = walls[i];
            if (!wl.active) continue;
            sCtx.fillStyle = (slotOf !== null ? slotCol(wl) : '') || mmPaintFill(wl, dark) || col.mmWall;
            const wx = ox + (wl.x - areaOffX - wl.halfW + mapHalf) * scaleX;
            const wy = oy + (wl.y - areaOffY - wl.halfH + mapHalfY) * scaleY;
            const ww = wl.halfW * 2 * scaleX;
            const wh = wl.halfH * 2 * scaleY;
            sCtx.fillRect(wx, wy, ww, wh);
        }
    }
}

export function mmPaintMap(sCtx: MmCtx, dark: boolean, ms: MmMap, w: number, h: number, k: number, areaOffX: number, areaOffY: number, pumpkinDot: string,
    col: HudColors = hudColors(dark), slotOf: ((o: object) => number) | null = null, mv: MmMoving | null = null): void {
    const mapW = ms.mapHalf * 2;
    const mapH = ms.mapHalfY * 2;
    sCtx.clearRect(0, 0, w, h);
    sCtx.globalAlpha = HUD_MM_BG_ALPHA;
    sCtx.fillStyle = col.mmBg;
    sCtx.fillRect(0, 0, w, h);
    mmPaintArea(sCtx, dark, ms, 0, 0, w, h, w / mapW, h / mapH, w, mapW, k, areaOffX, areaOffY, pumpkinDot, col, slotOf, mv);
}

export interface MmWorldArea { ms: MmMap; minX: number; minY: number; maxX: number; maxY: number; offX: number; offY: number;
    mv?: MmMoving | null; }

export function mmPaintWorld(sCtx: MmCtx, dark: boolean, areas: readonly MmWorldArea[], w: number, h: number, k: number,
    wx0: number, wy0: number, worldW: number, worldH: number, pumpkinDot: string, col: HudColors = hudColors(dark),
    slotOf: ((o: object) => number) | null = null): void {
    const sx = w / worldW, sy = h / worldH;
    sCtx.clearRect(0, 0, w, h);
    sCtx.globalAlpha = HUD_MM_BG_ALPHA;
    sCtx.fillStyle = col.mmBg;
    sCtx.fillRect(0, 0, w, h);
    sCtx.globalAlpha = HUD_MM_TILE_ALPHA;
    sCtx.fillStyle = col.mmGap;
    sCtx.beginPath();
    sCtx.rect(0, 0, w, h);
    for (let i = 0; i < areas.length; i++) {
        const a = areas[i];
        const x0 = Math.round((a.minX - wx0) * sx), x1 = Math.round((a.maxX - wx0) * sx);
        const y0 = Math.round((a.minY - wy0) * sy), y1 = Math.round((a.maxY - wy0) * sy);
        sCtx.rect(x0, y0, x1 - x0, y1 - y0);
    }
    sCtx.fill('evenodd');
    sCtx.globalAlpha = 1;
    for (let i = 0; i < areas.length; i++) {
        const a = areas[i];
        mmPaintArea(sCtx, dark, a.ms, (a.minX - wx0) * sx, (a.minY - wy0) * sy, (a.maxX - a.minX) * sx, (a.maxY - a.minY) * sy,
            sx, sy, w, worldW, k, a.offX, a.offY, pumpkinDot, col, slotOf, a.mv ?? null);
    }
}
