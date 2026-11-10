import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameModeType } from '../types';
import { worldIdOf, worldHudName, odVariantOf } from '../game/modeWorlds';
import { ALL_MODES } from '../game/allModesSwitch';
import { getEffectiveDPR, getBrowserZoomFactor, getEffectiveViewportHeight } from '../utils/zoomCompensation';
import { getEffectiveRenderScale, noteFrameInterval } from '../utils/renderQuality';
import { GRID_BOXES, gridBoxesOf } from '../utils/gridBoxes';
import { StepAccumulator, runFixedStepFrame } from '../game/fixedStep';
import { useHudScale, getHudScale } from '../utils/useGuiScale';
import { GameLogic, GRID_SPACING, tankSizeFromSlider, AUTO_FOV_BASE_RANGE, WIFI_RANGE_MAX, snapAngleToGrid, snapAngleToFaceMidpoint, XP_LEVEL_OFFSET, XP_CURVE_COEFF, XP_SCORE_BASE, levelHeldIn } from '../game/GameLogic';
import { AT_ALL_TEAM_MINIMAP, DOT_R as ADMIN_DOT_R, type WallLook } from '../game/adminPanel';
import { WALL_TYPES_4S, WALL_TEAM, wallLookAlpha, WALL_RULES } from '../game/wallTypes';
import { HudEaseRecord, HudXpView, hudXpAdvance, hudXpView, hudScoreOfXp, roundHalfAway } from '../utils/hudEase';
import {
    hudColors, hudSlot, HUD_SLOT, HUD_REF_W, HUD_REF_H, HUD_FONT_FAMILY, HUD_STROKE_F, HUD_STROKE_F_BIG, HUD_RING,
    HUD_BAR_LEVEL, HUD_BAR_SCORE, HUD_BAR_KILL, HUD_BAR_SCORE_ALONE, HUD_BAR_OUTLINE, HUD_NAME_Y, HUD_NAME_FONT,
    hudBarShift, hudScoreFill, hudKillFill, hudScoreText, hudKillText,
    HUD_SK_SEG, HUD_SK_CAP0, HUD_SK_TRACK_L, HUD_SK_OUTLINE_R, HUD_SK_TRACK_R, HUD_SK_RIM_R, HUD_SK_SEP_W, HUD_SK_KEY_END,
    HUD_SK_NAME_FONT, HUD_SK_KEY_FONT, HUD_SK_PLUS_FONT, HUD_SK_COUNT_FONT, HUD_SK_COUNT_ABOVE,
    hudSkillColors, hudSkillHideDist, hudSkillRowY, hudSkillFillCap, hudSkillPreview, hudInRevealZone, hudSlideStep,
    hudMinimapSize, hudMinimapDot, hudMmGlideT, hudMmBoxGlideT, HUD_MM_MARGIN, HUD_UP_ORIGIN, HUD_UP_PITCH,
    HUD_MM_DOT, HUD_MM_SAMPLE_SEC, HUD_MM_GLIDE_SEC, HUD_MM_BG_ALPHA,
    HUD_XI_WM_FONT, HUD_XI_FONT, HUD_XI_PITCH, HUD_XI_ABOVE_MM, HUD_XI_WM_GAP,
    HUD_HP_TRACK_R, HUD_HP_FILL_R, HUD_HP_R_FACTOR, HUD_HP_BELOW, hudShieldAlpha, hudHpBarAlpha,
} from '../utils/hudArras';
import type { HudBarGeom, HudMmSize } from '../utils/hudArras';
import { hudSlideLayer } from '../utils/hudLayer';
import { HudMsgView, HUD_MSG_CSS } from '../utils/hudMsgView';
import { keepStyle } from '../utils/keptStyle';
import { mobileActive, subscribeMobile, subscribeMobY3, mobHud, mobTilesChanged, mobSticksChanged } from '../utils/mobileMode';
import { MOB_MM_X, MOB_FIT_GAP, MOB_PLUS_GAP, MOB_BTN_H, MOB_PLUS_ROW_W, MOB_SK_BLOCK, mobFitAll, mobBoardTop, type MobFitIn, type MobFitOut } from '../utils/mobileArras';
import { TouchControls, drawTouchControls } from './mobile/touchControls';
import { MobileHud } from './mobile/MobileHud';
import { usePhoneMatch } from './mobile/phoneMatch';
import { safeInsets } from '../utils/safeArea';
const _touch = new TouchControls();
const HUD_TEXT_CSS = `
.arras-text {
    font-family: Ubuntu, 'Inter', sans-serif;
    font-weight: bold;
    letter-spacing: normal;
    color: var(--ig-text);
    -webkit-text-stroke: 3.5px var(--ig-stroke);
    paint-order: stroke fill;
}
.text-stroke-black {
    font-family: Ubuntu, 'Inter', sans-serif;
    font-weight: bold;
    letter-spacing: normal;
    -webkit-text-stroke: 3.5px var(--ig-stroke);
    paint-order: stroke fill;
}
${HUD_MSG_CSS}`;
import { GameState, FloatingPolygon, Bullet, UpgradeStat, EnemyTank, Turret, SubTurretConfig, MotionType, FacingType, ProjectileVisual, SNAP_COUNTS, BodyLayer, TileType, TEAM_COLORS, TEAM_COLORS_DARK, TEAM_COLORS_LIGHT, getStatLabel, isFfaStyleMode, isManhuntMode, teamColourMode, AI_CONSTANTS, type PortalEntity } from '../types';
import { SMALL_FIX } from '../game/smallFixSwitch';
import { layerColourOf, LAYER_BODY, LAYER_TEAM, anyForcedTeamLayer, TEAM_COLOUR } from '../game/teamColourSwitch';
import { darkenColor, getRealSizeFactor, mixColorToWhite, computeSideCorr, syncDarkenTheme } from '../utils/p5Utils';
import { computeWidthFitAdjustment, readAdjustedWidth, readAdjustedYOffset } from '../utils/turretWidthFit';
import type { WidthFitInput } from '../utils/turretWidthFit';
import { needsLayerInterleaveSlot, enemyQueueBudget, playerReservesMultiLayerSlot, playerReservesInvisibleSlot, fadesAsOneUnit, nestedShapeFadesAsOneUnit, roundDrawsAsOneUnit } from '../utils/renderQueueAdmission';
import { presetPieceMirrored } from '../utils/presetGroupXform';
import { LAYER_ROUNDS_ABOVE } from '../game/layerTurn';
import { drawnOpacity } from '../utils/seenRule';
import { carryFloor, CARRY_PLAYER_KEY, type CarryMarked } from '../utils/carryShow';
import { dbgInk, DBG_INK } from '../utils/debugInk';
import { scratchScale } from '../utils/scratchScale';
import { portalRandomised } from '../game/MapSystem';
import { WALL_COLORS, getWallStroke, clearWallStrokeCache, portalMoveCount, customAreaFill, minimapShowsAllAreas, portalNameAreaId, mapLineOf } from '../game/MapSystem';
import { mmPaintMap, mmPaintWorld, mmPaintMovers, type MmWorldArea, type MmMoving } from './minimapPicture';
import { MAX_ROUND_LAYERS } from '../game/constants';
import { cancelMapEditInteraction, clearMapEditSelection, rockShapeFor, entityShownCell } from '../game/MapEditor';
import { behaviorsOf, zoneShapeOf } from '../game/mapEvents/doc';
import { tracePoly, shapeCellPoints } from '../game/areaShape';
import { kindOf } from '../game/mapEvents/registry';
import { gameModeTitleOf } from '../game/gameModeTitles';
import { presetTitle } from '../game/mapEvents/presets/index';
import { mapEditorClickMoved, mapEditorPointerDown, mapEditorPointerMove, mapEditorPointerUp, mapEditorRightPointerDown, mapEditorRightPointerUp, refreshMapEditorVisuals, dragHideInfo, selectionOutline, effectiveMapEditorTool, toolRockKind, noteMapEditorMods } from '../game/MapEditorInput';
import { drawMapEditorOverlay, drawMapEditorHint, setMapEditorOverlayGpu, mapEditorHoverColor, mapEditorInk, mapEditorMuted, GHOST_ALPHA, mapRockAt, mapRockTurnAt, mapObjectLabels } from './shared/mapEditorOverlay';
import { setGameDarkMode, canvasBg, gridBg, gridStroke, strokeHex, wallDefault, wallFill, turretGrey, turretFill, healerCrossFill, healthBarColor, shieldBarColor, bodyFill, shapeFill, isGameDark } from '../utils/gameColors';
import { CM, CM_USE, CM_FREE, cmHex, cmRgb } from '../utils/colorMap';
import { AURA_RING_SLOT } from '../utils/aura';
import { lookList, lookUnit, lookReach, CROSS_LOOK_ID } from '../utils/placedLook';
import { drawOtherDesign, drawOtherList, otherDrawList, type OtherDrawList } from '../utils/otherDraw';
import { layerOutlineOf, traceLayerOutline, strokeFillLayerOutline } from '../utils/layerOutline';
import { makeShapeLook, type ShapeLook } from '../utils/shapeLook';
import { pushEyes, pushEyeVeils, pushOtherList, pumpkinTurn, rockTurn, eyeRowToDraw, rockWearsPumpkin, eyeAlpha, eyeAimOf, placeEye, EYE_LINE, EYE_STRIDE, E_UNIT, E_X, E_Y, E_TURN, HW_VEIL, type EyeTable, type GeomPusher } from '../utils/halloween';
import { halloweenLook, hwBeginEyes, hwEyeTable, hwEyeTargets, hwEyeRgb, hwWallRgb, hwPumpkinRgb, hwQueuePumpkin, hwFlushPumpkins, hwQueueEye, hwFlushEyes, EYE_MIN_PX, PUMPKIN_FULL_PX } from './shared/halloweenLook';
import { updateAnimatedColors, getAnimatedColor, updateWorldAnimatedColors, getWorldAnimatedColor, labyDownscale, RARITY_MULTIPLIERS, effectiveShapeColor, effectiveShapeColorMap, polyhedronExtent } from '../game/ShapeRegistry';
import { solidOf, solidPath, SOLID_STROKE_OF_BORDER, SOLID_STILL_X, SOLID_STILL_Y, type ArrasSolid } from '../utils/solidArras';
import type { FoodShapeDesign, PlacedLook } from '../types';
import { dreadTeamId, dreadBehavior, TEAM_IDX_DREAD } from '../types';
import { Vector } from '../utils/MathUtils';
import { debugHudOrderOf } from '../utils/debugHudOrder';
import { getEnemyStatMultiplier } from '../game/EnemyAI';
import { arrasSkillCurve, ARRAS_PARITY } from '../game/arrasCombat';
import { roundBodyTurnGL, roundPoly2DStart, roundTankBodyStart } from '../utils/roundHeading';
import { autoBaseDepth, autoBaseTurn } from '../utils/autoBaseShape';
import { foodBirthOpacity, foodBirthGrowth, MOTION_ARRAS, blinkCombine, kickPull, tankDeathFadeMs, tankDeathAlpha, tankDeathScale, deathSpreadGain, deathC, deathScale } from '../utils/motionArras';
import { SEE_THROUGH, shapePassExactAlpha, plainRoundAlpha } from '../utils/seeThrough';
import TankEvolutionMenu from './TankEvolutionMenu';
import ClassTreeView from './ClassTreeView';
import type { WebGLBulletRenderer } from '../game/WebGLRenderer';
import { POLY_BATCH_KEY, POLY_BATCH_MAX_SIDES, AURA_BATCH, GEOM_INSTANCE_STRIDE, STROKE_HALF_WIDTH, makeKeptGeom, type KeptGeom, FOG_BATCH } from '../game/WebGLRenderer';
import { FogField, FOG_STRIDE } from '../utils/fogPuffs';
import { DarkLight, roundLightRadius, type DarkSource } from '../game/darkness';
import { ovlLine, ovlDisc, ovlCapsule, ovlRing, ovlArc, ovlDashedLine,
         ovlStackTopWorld, ovlXpTextY, OVL_ROW_STEP_PER_FONT,
         DBG_LINE_BATCH, DBG_DISC_BATCH, DBG_CAP_BATCH } from '../utils/overlayGeom';
import { tagHalfView, tagEdge, tagBarAlphaAt, tagReachWorld } from '../utils/nameTagArras';
import { nameTagsDraw, nameTagsDone, editorLabelsDraw } from './nameTagGL';
import type { ShapeDefinition } from '../game/ShapeRegistry';
import { chatDraw, chatDone, chatWanted } from './chatGL';
import { ChatInput, chatInputElement, chatInputOpenNow } from './ChatInput';
import { typingFor } from '../utils/typeSheet';
import { htNewFrame, htRound10, htSnapMid } from '../utils/hudTextGlyphs';
import type { HtFrame } from '../utils/hudTextGlyphs';
import { hudTextDraw } from './hudTextGL';
import { photoHiding, PHOTO_MODE } from '../game/photoMode';
import { toolStore } from './shell/toolStore';
import { BROWSER_KEYS_OLD, browserActsOnKey } from '../utils/browserKeys';
import { gameDark, gameThemeVersion, borderBlend } from '../utils/gameTheme';
import { useGameDark } from '../utils/useGameTheme';
import { BASE_AREAS, zoneBaseTeam } from '../game/baseAreas';
setGameDarkMode(gameDark());

const FIXED_STROKE_WIDTH = 6;
const MIN_STROKE_SCREEN_PX = 0.5;
const _HEALER_CROSS_X = [0.3, 1, 1, 0.3, 0.3, -0.3, -0.3, -1, -1, -0.3, -0.3, 0.3];
const _HEALER_CROSS_Y = [-0.3, -0.3, 0.3, 0.3, 1, 1, 0.3, 0.3, -0.3, -0.3, -1, -1];
const _HEALER_CROSS_SCALE = 0.325;
const LOD_FULL_PX = 0;
const LOD_SIMPLE_PX = 0;

const SHADOW_HP_BAR_MAX_ALPHA = 0.10;
const _hexCache: Record<string, number> = {};
function _hexToRGB(hex: string, out: Float64Array, off: number): void {
    let n = _hexCache[hex];
    if (n === undefined) {
        let c = hex;
        if (c.charCodeAt(0) === 35) c = c.slice(1);
        if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
        n = parseInt(c, 16) || 0;
        _hexCache[hex] = n;
    }
    out[off]     = ((n >> 16) & 0xFF) / 255;
    out[off + 1] = ((n >> 8) & 0xFF) / 255;
    out[off + 2] = (n & 0xFF) / 255;
}
const _gColor = new Float64Array(3);
const _lookColor = new Float64Array(3);
let _turretGreyR = 0.655;
let _turretGreyG = 0.655;
let _turretGreyB = 0.686;
const _tColor = new Float64Array(3);

let _geoSubSlot = 0;
let _geoSubSlotKeep = 0;
let _geoEntityIdx = 0;
const _GEO_DEPTH_SPACING = 0.000012;
let _geoUseBulletDepth = false;
let _prevRL = -129;
let _rlHasGeom = false;

let _geoForceDepth = -1;
let _wantAboveRoundSlot = false;
let _aboveRoundDepth = -1;
function _nextGeoDepth(): number {
    if (_geoForceDepth >= 0) return _geoForceDepth;
    if (_geoUnitDepthOn) {
        if (_geoUnitDepthOn === 2) {
            if (ROUND_FINE_LADDER) return _geoUnitDepthBuf[0] - (_geoUnitSub < _FINE_SUB_MAX ? _geoUnitSub++ : _FINE_SUB_MAX) * _FINE_SUB_STEP;
            return _geoUnitDepthBuf[0] - (_geoUnitSub < _UNIT_SUB_MAX ? _geoUnitSub++ : _UNIT_SUB_MAX) * _GEO_DEPTH_SPACING;
        }
        if (_geoUnitDepthOn === 3) return _geoUnitDepthBuf[0] - (_geoUnitSub < _mlLadderCap ? _geoUnitSub++ : _mlLadderCap) * _FINE_SUB_STEP;
        return _geoUnitDepthBuf[0];
    }
    if (_geoUseBulletDepth) {
        return Math.max(_BULLET_DEPTH_START, _BULLET_DEPTH_END - (_geoBulletGlobalSlot++) * _BULLET_DEPTH_STEP);
    }
    return _BODY_DEPTH_END - _geoEntityIdx * _bodyRangePerEntity - (_geoSubSlot++) * _GEO_DEPTH_SPACING;
}

function _geoEmit(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    batchKey: string,
    worldX: number, worldY: number,
    rotation: number,
    scaleX: number, scaleY: number,
    r: number, g: number, b: number,
    dmgOverlay: number,
    aspect: number,
    alpha: number = 1.0
): void {
    const depth = _nextGeoDepth();
    webgl.pushGeomInstance(batchKey, worldX, worldY, rotation, scaleX, scaleY, r, g, b, _geoHl ? dmgOverlay + 2 : dmgOverlay, depth, aspect, alpha);
}
let _geoHl = false;
function _edPicked(t: Turret): boolean {
    return _edTankGL !== null && !_rd.isTestMode && (_rd.selectedTurretId === t.id || _inheritHighlightIds.has(t.id));
}

const _crossLookLists: WeakMap<object, boolean> = new WeakMap();
function _wearsCrossLook(subs: readonly { turretData: Turret | null }[] | null): boolean {
    if (subs === null || subs.length === 0) return false;
    let v = _crossLookLists.get(subs);
    if (v === undefined) {
        v = false;
        for (let i = 0; i < subs.length && !v; i++) {
            const t = subs[i].turretData;
            if (t === null) continue;
            if (t.look !== undefined && t.look.design.otherId === CROSS_LOOK_ID) v = true;
            const inner = t.autoSubTurrets;
            if (inner) for (let k = 0; k < inner.length && !v; k++) if (inner[k].look !== undefined && inner[k].look!.design.otherId === CROSS_LOOK_ID) v = true;
        }
        _crossLookLists.set(subs, v);
    }
    return v;
}

const _lookMemos: WeakMap<object, { key: string }[]> = new WeakMap();
function _lookMemoOf(design: object, n: number): { key: string }[] {
    let m = _lookMemos.get(design);
    if (m === undefined || m.length !== n) { m = []; for (let i = 0; i < n; i++) m.push({ key: '' }); _lookMemos.set(design, m); }
    return m;
}
let _lookDeferOn = false;
let _lookAnimLogic: GameLogic | null = null;
let _lookDeferCap = 16;
let _lookDeferRef: (PlacedLook | null)[] = new Array(_lookDeferCap).fill(null);
let _lookDeferNum = new Float64Array(_lookDeferCap * 7);
let _lookDeferCount = 0;
function _growLookDefer(): void {
    const cap = _lookDeferCap * 2;
    const ref: (PlacedLook | null)[] = new Array(cap).fill(null);
    const num = new Float64Array(cap * 7);
    for (let i = 0; i < _lookDeferCap; i++) ref[i] = _lookDeferRef[i];
    num.set(_lookDeferNum);
    _lookDeferRef = ref; _lookDeferNum = num; _lookDeferCap = cap;
}
function _lookPartFill(look: PlacedLook, color: string, colorMap: number): string {
    if (look.anim !== undefined) {
        if (_lookAnimLogic !== null && !_lookAnimLogic.state.isTestMode) {
            updateAnimatedColors(_shapeCacheFrame);
            return getAnimatedColor(look.anim, _isDarkMode);
        }
        if (_lookAnimLogic !== null) _worldColorsOfFrame(_lookAnimLogic, _shapeCacheFrame);
        return getWorldAnimatedColor(look.anim, _isDarkMode);
    }
    return bodyFill(color, colorMap);
}
function _geoEmitLook(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    look: PlacedLook, cx: number, cy: number, facing: number, sizePx: number, dmgOverlay: number
): void {
    const la = look.alpha;
    if (la === undefined || !(la < 1)) { _pushLookParts(webgl, look, cx, cy, facing, sizePx, dmgOverlay, _entityAlpha); return; }
    if (!_lookDeferOn) {
        _pushLookParts(webgl, look, cx, cy, facing, sizePx, dmgOverlay, _entityAlpha * (webgl.alphaIsSpread() ? Math.sqrt(la) : la));
        return;
    }
    if (_lookDeferCount >= _lookDeferCap) _growLookDefer();
    const n = lookList(look).items.length;
    const d0 = _nextGeoDepth();
    for (let k = 1; k < n; k++) _nextGeoDepth();
    const o = _lookDeferCount * 7;
    _lookDeferRef[_lookDeferCount] = look;
    _lookDeferNum[o] = cx; _lookDeferNum[o + 1] = cy; _lookDeferNum[o + 2] = facing; _lookDeferNum[o + 3] = sizePx;
    _lookDeferNum[o + 4] = dmgOverlay; _lookDeferNum[o + 5] = la * _entityAlpha; _lookDeferNum[o + 6] = d0;
    _lookDeferCount++;
}
function _drainLookUnits(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    ctx: CanvasRenderingContext2D, logic: GameLogic, width: number, height: number
): void {
    for (let i = 0; i < _lookDeferCount; i++) {
        const look = _lookDeferRef[i];
        _lookDeferRef[i] = null;
        if (look === null) continue;
        const o = i * 7;
        webgl.clearColorOnly();
        webgl.beginGeomFrame();
        webgl.setDepthFunc(false);
        webgl.setDepthMask(true);
        _geoUnitDepthBuf[0] = _lookDeferNum[o + 6];
        _geoUnitSub = 0;
        _geoUnitDepthOn = 2;
        _pushLookParts(webgl, look, _lookDeferNum[o], _lookDeferNum[o + 1], _lookDeferNum[o + 2], _lookDeferNum[o + 3], _lookDeferNum[o + 4], 1.0);
        const has = webgl.hasGeomContent();
        webgl.flushGeom();
        _geoUnitDepthOn = 0;
        if (has) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = _lookDeferNum[o + 5];
            _compositeMiniFlush(ctx, webgl);
            ctx.globalAlpha = 1.0;
            ctx.restore();
            _restoreCameraTransform(ctx, logic, width, height);
        }
    }
    _lookDeferCount = 0;
}
function _pushLookParts(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    look: PlacedLook, cx: number, cy: number, facing: number, sizePx: number, dmgOverlay: number, alpha: number
): void {
    const items = lookList(look).items;
    const memo = _lookMemoOf(look.design, items.length);
    const unit = lookUnit(look, sizePx);
    const cF = Math.cos(facing), sF = Math.sin(facing);
    for (let i = 0; i < items.length; i++) {
        const it = items[i], p = it.part;
        const key = webgl.lookBatchKey(p, memo[i]);
        if (key === '') continue;
        const x = cx + (it.lx * cF - it.ly * sF) * unit;
        const y = cy + (it.lx * sF + it.ly * cF) * unit;
        const R = p.radius * unit;
        _hexToRGB(_lookPartFill(look, p.color, p.colorMap), _lookColor, 0);
        if (p.kind === 'line') _geoEmit(webgl, 'look_line', x, y, facing + it.rot, R, 1,
            _lookColor[0], _lookColor[1], _lookColor[2], dmgOverlay, 1.0, alpha);
        else _geoEmit(webgl, key, x, y, p.kind === 'circle' ? 0 : facing + it.rot, R, R,
            _lookColor[0], _lookColor[1], _lookColor[2], dmgOverlay, 1.0, alpha);
    }
}

let _lookCap = 256;
let _lookShapeRef: (FloatingPolygon | null)[] = new Array(_lookCap).fill(null);
let _lookShapeAlpha = new Float64Array(_lookCap);
let _lookShapeCount = 0;
const _LOOK_DEPTH_START = 0.9, _LOOK_DEPTH_STEP = 1 / 65536, _LOOK_DEPTH_FLOOR = -0.9;
function _growLookQueue(): void {
    const cap = _lookCap * 2;
    const ref: (FloatingPolygon | null)[] = new Array(cap).fill(null);
    const al = new Float64Array(cap);
    for (let i = 0; i < _lookCap; i++) { ref[i] = _lookShapeRef[i]; al[i] = _lookShapeAlpha[i]; }
    _lookShapeRef = ref; _lookShapeAlpha = al; _lookCap = cap;
}
function _shapeLookFill(color: string, colorMap: number): string { return colorMap >= 0 ? shapeFill(color, colorMap, false) : color; }
function _wornFillOf(poly: FloatingPolygon, logic: GameLogic): string {
    if (TEAM_COLOUR.ON === 0 || poly.look === null || !poly.look.team) return '';
    const w = poly._wornSlot === -2 ? logic.wornSlotOfTank(null) : poly._wornSlot;
    return w >= 0 ? bodyFill('', w) : '';
}
function _pushShapeLook(webgl: import('../game/WebGLRenderer').WebGLBulletRenderer, poly: FloatingPolygon, depth: number, worn = ''): number {
    const look = poly.look!;
    const items = look.list.items, memo = look.memo;
    const unit = poly.size * poly.growth / 2;
    const facing = poly.rotation, cF = Math.cos(facing), sF = Math.sin(facing);
    const px = poly.position.x, py = poly.position.y;
    for (let i = 0; i < items.length; i++) {
        const it = items[i], p = it.part;
        const key = webgl.lookBatchKey(p, memo[i]);
        if (key === '') continue;
        const x = px + (it.lx * cF - it.ly * sF) * unit;
        const y = py + (it.lx * sF + it.ly * cF) * unit;
        const R = p.radius * unit;
        _hexToRGB(worn !== '' && p.teamColour === true ? worn : _shapeLookFill(p.color, p.colorMap), _lookColor, 0);
        if (p.kind === 'line') webgl.pushGeomInstance('look_line', x, y, facing + it.rot, R, 1,
            _lookColor[0], _lookColor[1], _lookColor[2], poly.damageOverlay, depth, 1.0, 1.0);
        else webgl.pushGeomInstance(key, x, y, p.kind === 'circle' ? 0 : facing + it.rot, R, R,
            _lookColor[0], _lookColor[1], _lookColor[2], poly.damageOverlay, depth, 1.0, 1.0);
        depth -= _LOOK_DEPTH_STEP;
    }
    return depth;
}
let _look2dFlash = 0;
let _look2dWorn = '';
function _look2dFill(color: string, colorMap: number, team?: boolean): string { const f = team === true && _look2dWorn !== '' ? _look2dWorn : _shapeLookFill(color, colorMap); return _look2dFlash > 0 ? mixColorToWhite(f, _look2dFlash) : f; }
function _look2dLine(fill: string): string { return darkenColor(fill, 0.598); }

function _geoEmitBarrel(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    t: Turret,
    entityX: number, entityY: number,
    bodyAngle: number, aimAngle: number,
    sizePx: number, dmgOverlay: number,
    isTestMode: boolean,
    layerSpinAngle: number,
    bodyScaleFactor: number,
    posSz: number,
    sideCorr: number,
    isAutoSub: boolean,
    parentRotation?: number
): void {
    const isAuto = t.turretType === 'auto';

    const widthCorr = 1.0;
    const lengthCorr = 1.0;

    let turretRotation: number;
    if (isAuto) {
        turretRotation = isTestMode ? (t.autoCurrentAngle - bodyAngle) : t.angle;
    } else {
        turretRotation = (aimAngle - bodyAngle) + t.angle;
    }

    const mountLocalX = t.xOffset * posSz / 2;
    const mountLocalY = t.yOffset * posSz / 2;

    const effLength = isAuto ? (t.autoTurretLength ?? 10) : t.length;
    const effWidth = isAuto ? (t.autoTurretWidth ?? 25) : t.width;
    const tLen = _mapVal(effLength, 1, 100, sizePx * 0.01, sizePx / 2 + sizePx * 10) * lengthCorr;
    const tWid = _mapVal(effWidth, 0, 50, 0, sizePx * 0.96) * widthCorr;

    let recoil = 0;
    if (t.animProgress > 0) recoil = -kickPull(t.animProgress, sizePx, _rd.kickSpeed, t.knockback) * lengthCorr;

    const worldTurretAngle = bodyAngle + turretRotation;
    const cosBody = Math.cos(bodyAngle);
    const sinBody = Math.sin(bodyAngle);
    let wx = entityX + mountLocalX * cosBody - mountLocalY * sinBody;
    let wy = entityY + mountLocalX * sinBody + mountLocalY * cosBody;
    if (recoil !== 0) {
        wx += recoil * Math.cos(worldTurretAngle);
        wy += recoil * Math.sin(worldTurretAngle);
    }

    _geoHl = _edTankGL !== null && _edPicked(t);
    if (t.look !== undefined) { _geoEmitLook(webgl, t.look, wx, wy, worldTurretAngle, sizePx, dmgOverlay); _geoHl = false; return; }

    if (t.colorMap === undefined) {
        _geoEmit(webgl, 'barrel', wx, wy, worldTurretAngle, tLen, tWid,
            _turretGreyR, _turretGreyG, _turretGreyB, dmgOverlay, t.aspect, _entityAlpha);
    } else {
        _hexToRGB(turretFill(t.color, t.colorMap), _tColor, 0);
        _geoEmit(webgl, 'barrel', wx, wy, worldTurretAngle, tLen, tWid,
            _tColor[0], _tColor[1], _tColor[2], dmgOverlay, t.aspect, _entityAlpha);
    }
    _geoHl = false;
}

function _pushAuraRings(webgl: import('../game/WebGLRenderer').WebGLBulletRenderer, logic: GameLogic, vb: ViewportBounds): number {
    const n = logic.auraRingCount;
    if (n === 0 || !webgl.ensureAuraBatch()) return 0;
    const rings = logic.auraRings;
    const hurt = cmRgb(AURA_RING_SLOT.damage, _isDarkMode, CM_USE.SHAPE), heal = cmRgb(AURA_RING_SLOT.heal, _isDarkMode, CM_USE.SHAPE);
    let pushed = 0;
    for (let i = 0; i < n; i++) {
        const g = rings[i];
        if (g.opacity <= 0 || !isInViewport(g.x, g.y, g.r, vb)) continue;
        const c = g.heal ? heal : hurt;
        webgl.pushGeomInstance(AURA_BATCH, g.x, g.y, 0, g.r, g.r, c[0] / 255, c[1] / 255, c[2] / 255, 0, 1.0, 1.0, g.opacity);
        pushed++;
    }
    return pushed;
}
function _drawAuraRings2D(ctx: CanvasRenderingContext2D, logic: GameLogic): void {
    const n = logic.auraRingCount;
    if (n === 0) return;
    const rings = logic.auraRings;
    const prev = ctx.globalAlpha;
    const band = Math.max(MIN_STROKE_SCREEN_PX / (logic.zoom || 1), FIXED_STROKE_WIDTH) / 2;
    for (let i = 0; i < n; i++) {
        const g = rings[i];
        if (g.opacity <= 0) continue;
        const fill = cmHex(g.heal ? AURA_RING_SLOT.heal : AURA_RING_SLOT.damage, _isDarkMode, CM_USE.SHAPE);
        ctx.globalAlpha = prev * g.opacity;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = darkenColor(fill, 0.598);
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r + band, 0, Math.PI * 2);
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
    }
    ctx.globalAlpha = prev;
}

function _geoEmitAutoTurret(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    t: Turret,
    entityX: number, entityY: number,
    bodyAngle: number, aimAngle: number,
    sizePx: number, dmgOverlay: number,
    isTestMode: boolean,
    layerSpinAngle: number,
    bodyScaleFactor: number,
    posSz: number,
    sideCorr: number,
    bodyColorR: number, bodyColorG: number, bodyColorB: number
): void {
    const autoAngle = isTestMode ? (t.autoCurrentAngle - bodyAngle) : t.angle;
    const worldAutoAngle = bodyAngle + autoAngle;

    const mountLocalX = t.xOffset * posSz / 2;
    const mountLocalY = t.yOffset * posSz / 2;
    const cosBody = Math.cos(bodyAngle);
    const sinBody = Math.sin(bodyAngle);
    const wx = entityX + mountLocalX * cosBody - mountLocalY * sinBody;
    const wy = entityY + mountLocalX * sinBody + mountLocalY * cosBody;

    const circleR = _mapVal(t.autoCircleSize ?? 25, 0, 50, 0, sizePx * 0.96) * 0.7;

    let _anyAboveBase = false;
    const subSizePx = circleR * 2;
    const subPosSz = subSizePx;
    const _subsAll = t.autoSubTurrets;
    let _subs: any[] | undefined = _subsAll;
    if (_subsAll && _subsAll.length > 1) {
        _geoSubSortBuf.length = _subsAll.length;
        for (let i = 0; i < _subsAll.length; i++) _geoSubSortBuf[i] = _subsAll[i];
        _geoSubSortBuf.sort(_turretLayerCmp);
        _subs = _geoSubSortBuf;
    }
    const _baseAng = (_edTankGL !== null && !isTestMode) ? bodyAngle : worldAutoAngle;
    for (let pass = 0; pass < 2; pass++) {
        if (pass === 1) {
            if (!t.autoCircleHidden) {
                let cr: number, cg: number, cb: number;
                if (t.autoCircleColorMatch) {
                    cr = bodyColorR; cg = bodyColorG; cb = bodyColorB;
                } else if (t.colorMap === undefined) {
                    cr = _turretGreyR; cg = _turretGreyG; cb = _turretGreyB;
                } else {
                    _hexToRGB(turretFill(t.color, t.colorMap), _tColor, 0);
                    cr = _tColor[0]; cg = _tColor[1]; cb = _tColor[2];
                }

                const abSides = t.autoCircleBaseSides ?? 0;
                _geoHl = _edTankGL !== null && _edPicked(t);
                if (abSides >= 3) {
                    const abDepth = autoBaseDepth(abSides, t.autoCircleBaseDepth);
                    const batchKey = abDepth > 0 ? webgl.getOrCreateStarBatch(Math.floor(abSides), abDepth, false) : POLY_BATCH_KEY[abSides];
                    _geoEmit(webgl, batchKey, wx, wy, _baseAng + autoBaseTurn(abSides, abDepth), circleR, circleR,
                        cr, cg, cb, dmgOverlay, 1.0, _entityAlpha);
                } else {
                    _geoEmit(webgl, 'circle', wx, wy, 0, circleR, circleR,
                        cr, cg, cb, dmgOverlay, 1.0, _entityAlpha);
                }
                _geoHl = false;

                if (t.autoCircleHealer) {
                    const crossR = _HEALER_CROSS_SCALE * circleR * 2;
                    _hexToRGB(healerCrossFill(), _gColor, 0);
                    _geoEmit(webgl, 'healer_cross', wx, wy, _baseAng,
                        crossR, crossR, _gColor[0], _gColor[1], _gColor[2], dmgOverlay, 1.0, _entityAlpha);
                }
            }
            if (!_anyAboveBase) break;
        }
        if (!_subs || _subs.length === 0) continue;
        for (let si = 0; si < _subs.length; si++) {
            const sub = _subs[si];
            const above = sub.aboveBase === true;
            if (pass === 0 && above) { _anyAboveBase = true; continue; }
            if (pass === 1 && !above) continue;
            const subMountX = sub.xOffset * subPosSz / 2;
            const subMountY = sub.yOffset * subPosSz / 2;
            const cosAuto = Math.cos(worldAutoAngle);
            const sinAuto = Math.sin(worldAutoAngle);
            const subWx = wx + subMountX * cosAuto - subMountY * sinAuto;
            const subWy = wy + subMountX * sinAuto + subMountY * cosAuto;

            const worldSubAngle = worldAutoAngle + sub.angle;

            const subLen = _mapVal(sub.length, 1, 100, subSizePx * 0.01, subSizePx / 2 + subSizePx * 10);
            const subWid = _mapVal(sub.width, 0, 50, 0, subSizePx * 0.96);

            let subRecoil = 0;
            if (sub.animProgress > 0) subRecoil = -kickPull(sub.animProgress, subSizePx, _rd.kickSpeed, sub.knockback);

            let subBx = subWx;
            let subBy = subWy;
            if (subRecoil !== 0) {
                subBx += subRecoil * Math.cos(worldSubAngle);
                subBy += subRecoil * Math.sin(worldSubAngle);
            }

            _geoHl = _edTankGL !== null && _edPicked(sub);
            if (sub.look !== undefined) { _geoEmitLook(webgl, sub.look, subWx, subWy, (isTestMode && sub.turnsLate === true && sub._lateTurn !== undefined) ? worldSubAngle + sub._lateTurn : worldSubAngle, sizePx, dmgOverlay); _geoHl = false; continue; }

            if (sub.colorMap === undefined) {
                _geoEmit(webgl, 'barrel', subBx, subBy, worldSubAngle, subLen, subWid,
                    _turretGreyR, _turretGreyG, _turretGreyB, dmgOverlay, sub.aspect, _entityAlpha);
            } else {
                _hexToRGB(turretFill(sub.color, sub.colorMap), _tColor, 0);
                _geoEmit(webgl, 'barrel', subBx, subBy, worldSubAngle, subLen, subWid,
                    _tColor[0], _tColor[1], _tColor[2], dmgOverlay, sub.aspect, _entityAlpha);
            }
            _geoHl = false;
        }
    }
}

function _addTankGeometry(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    entityIdx: number
): void {
    _geoEntityIdx = entityIdx;
    _geoSubSlot = 0;
    _entityAlpha = _rd.alpha;

    const sizePx = _rd.sizePx;
    const turrets = _rd.turrets!;
    const sorted = _sortTurrets(turrets);
    _buildTurretLayerFlags(sorted, _rd.bodyLayers);

    const bodyColor = bodyFill(_rd.color, _rd.colorMap);
    _hexToRGB(bodyColor, _gColor, 0);
    const bodyR = _gColor[0], bodyG = _gColor[1], bodyB = _gColor[2];
    const dmg = _rd.damageOverlay;
    const entityX = _rd.posX;
    const entityY = _rd.posY;
    const bodyAngle = _rd.bodyAngle;
    const aimAngle = _rd.aimAngle;
    const isTestMode = _rd.isTestMode;

    _hexToRGB(turretGrey(), _gColor, 0);
    _turretGreyR = _gColor[0]; _turretGreyG = _gColor[1]; _turretGreyB = _gColor[2];

    _geoEmitBodyLayers(webgl, sizePx, sorted, false, entityX, entityY, bodyAngle, aimAngle, dmg, isTestMode, bodyR, bodyG, bodyB);

    const aimOffset = aimAngle - bodyAngle;
    for (let i = 0; i < sorted.length; i++) {
        if (!sorted[i].aboveTankBody && !_turretOnLayerFlags[i]) {
            const t = sorted[i];
            if (_edHookOn) _edSlot(0, t);
            if (t.turretType === 'auto') {
                _geoEmitAutoTurret(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, bodyR, bodyG, bodyB);
            } else {
                _geoEmitBarrel(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, false);
            }
        }
    }
    if (_edHookOn) _edBelowDone();
    if (!_rd.showTurretsOnly) {
        const intSides = Math.floor(_rd.sides);
        const fracRotation = (_rd.sides % 1) * Math.PI * 2;
        const baseSpin = _rd.baseBodyAngle || 0;

        _geoHl = _edTankGL !== null && _rd.pickedBody === 'main';
        if (intSides < 3) {
            const half = sizePx / 2;
            _geoEmit(webgl, 'circle', entityX, entityY, bodyAngle + baseSpin, half, half, bodyR, bodyG, bodyB, dmg, 1.0, _entityAlpha);
        } else {
            const visualHalf = (sizePx / 2) * getRealSizeFactor(intSides);
            const evenOff = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
            const polyRot = bodyAngle + evenOff + fracRotation + baseSpin;
            const batchKey = (_rd.shapeDepth > 0)
                ? webgl.getOrCreateStarBatch(intSides, _rd.shapeDepth, _rd.shapeCurved)
                : (intSides <= 16 ? POLY_BATCH_KEY[intSides] : 'circle');
            _geoEmit(webgl, batchKey, entityX, entityY, polyRot, visualHalf, visualHalf, bodyR, bodyG, bodyB, dmg, 1.0, _entityAlpha);
        }
        _geoHl = false;

        if (_rd.isHealer) {
            const crossR = _HEALER_CROSS_SCALE * sizePx;
            _hexToRGB(healerCrossFill(), _gColor, 0);
            _geoEmit(webgl, 'healer_cross', entityX, entityY, bodyAngle + baseSpin,
                crossR, crossR, _gColor[0], _gColor[1], _gColor[2], dmg, 1.0, _entityAlpha);
        }
    }

    if (_wantAboveRoundSlot) { _aboveRoundDepth = _nextGeoDepth(); _geoSubSlot += _ABOVE_ROUND_SLOTS - 1; }

    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].aboveTankBody && !_turretOnLayerFlags[i]) {
            const t = sorted[i];
            if (_edHookOn) _edSlot(1, t);
            if (t.turretType === 'auto') {
                _geoEmitAutoTurret(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, bodyR, bodyG, bodyB);
            } else {
                _geoEmitBarrel(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, false);
            }
        }
    }
    if (_edHookOn) _edSlotEnd(1);

    _geoEmitBodyLayers(webgl, sizePx, sorted, true, entityX, entityY, bodyAngle, aimAngle, dmg, isTestMode, bodyR, bodyG, bodyB);
    if (_edHookOn) _edAboveDone();
}

function _geoEmitBodyLayers(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    sizePx: number, turrets: Turret[], aboveBody: boolean,
    entityX: number, entityY: number, bodyAngle: number, aimAngle: number,
    dmg: number, isTestMode: boolean,
    bodyR: number, bodyG: number, bodyB: number
): void {
    const layers = _rd.bodyLayers;
    if (!layers || layers.length === 0) return;

    _innerBodyLayerSortBuf.length = layers.length;
    for (let i = 0; i < layers.length; i++) _innerBodyLayerSortBuf[i] = layers[i];
    if (layers.length > 1) _innerBodyLayerSortBuf.sort(_bodyLayerCmp);

    for (let li = 0; li < _innerBodyLayerSortBuf.length; li++) {
        const layer = _innerBodyLayerSortBuf[li];
        if (aboveBody ? layer.renderOrder >= 0 : layer.renderOrder < 0) continue;

        const layerSizePx = sizePx * layer.sizeRatio;
        const layerColor = _layerFill(layer);
        _hexToRGB(layerColor, _gColor, 0);
        let lr = _gColor[0], lg = _gColor[1], lb = _gColor[2];
        if (_isDarkMode && layer.intangible) { lr = 0; lg = 0; lb = 0; }

        const effectiveAngle = layer.stationary ? -bodyAngle : layer._currentAngle;
        const layerWorldAngle = bodyAngle + effectiveAngle;
        const layerSideCorr = computeSideCorr(layer.sides, _rd.sides);
        const barrelEffSizePx = layerSizePx;
        for (let ti = 0; ti < turrets.length; ti++) {
            if (turrets[ti].aboveTankBody || _turretLayerRef[ti] !== layer) continue;
            const t = turrets[ti];
            if (t.turretType === 'auto') {
                _geoEmitAutoTurret(webgl, t, entityX, entityY, layerWorldAngle, aimAngle, layerSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, bodyR, bodyG, bodyB);
            } else {
                _geoEmitBarrel(webgl, t, entityX, entityY, layerWorldAngle, layerWorldAngle, barrelEffSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, false);
            }
        }
        if (_edHookOn) _edLayer(layer, 0);
        if (!_rd.showTurretsOnly) {
            const layerHalf = layerSizePx / 2;
            _geoHl = _edTankGL !== null && _rd.pickedBody === layer.id;
            const layerInitAngle = layer.initialAngle || 0;
            const _loKey = layerOutlineOf(layer) !== null ? webgl.outlineLayerBatchKey(layer.outline!) : '';

            if (_loKey !== '') {
                const _loN = layer.copies > 1 ? layer.copies : 1;
                for (let c = 0; c < _loN; c++) _geoEmit(webgl, _loKey, entityX, entityY, layerWorldAngle + layerInitAngle + (Math.PI * 2 * c) / _loN, layerHalf, layerHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            } else if (layer.sides < 3) {
                _geoEmit(webgl, 'circle', entityX, entityY, layerWorldAngle, layerHalf, layerHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            } else if (layer.copies > 1) {
                const visualHalf = layerHalf * getRealSizeFactor(layer.sides);
                const batchKey = layer.starDepth > 0
                    ? webgl.getOrCreateStarBatch(layer.sides, layer.starDepth, layer.starCurved)
                    : (layer.sides <= 16 ? POLY_BATCH_KEY[layer.sides] : 'circle');
                for (let c = 0; c < layer.copies; c++) {
                    const copyRot = layerWorldAngle + (Math.PI * 2 * c) / layer.copies + layerInitAngle;
                    _geoEmit(webgl, batchKey, entityX, entityY, copyRot, visualHalf, visualHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
                }
            } else if (layer.starDepth > 0) {
                const visualHalf = layerHalf * getRealSizeFactor(layer.sides);
                const starKey = webgl.getOrCreateStarBatch(layer.sides, layer.starDepth, layer.starCurved);
                _geoEmit(webgl, starKey, entityX, entityY, layerWorldAngle + layerInitAngle, visualHalf, visualHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            } else {
                const visualHalf = layerHalf * getRealSizeFactor(layer.sides);
                const batchKey = layer.sides <= 16 ? POLY_BATCH_KEY[layer.sides] : 'circle';
                _geoEmit(webgl, batchKey, entityX, entityY, layerWorldAngle + layerInitAngle, visualHalf, visualHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            }

            _geoHl = false;
            if (layer.showHealerCross) {
                const crossR = _HEALER_CROSS_SCALE * layerSizePx;
                _hexToRGB(healerCrossFill(), _gColor, 0);
                _geoEmit(webgl, 'healer_cross', entityX, entityY, layerWorldAngle + layerInitAngle,
                    crossR, crossR, _gColor[0], _gColor[1], _gColor[2], dmg, 1.0, _entityAlpha);
            }
        }

        for (let ti = 0; ti < turrets.length; ti++) {
            if (!turrets[ti].aboveTankBody || _turretLayerRef[ti] !== layer) continue;
            const t = turrets[ti];
            if (t.turretType === 'auto') {
                _geoEmitAutoTurret(webgl, t, entityX, entityY, layerWorldAngle, aimAngle, layerSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, bodyR, bodyG, bodyB);
            } else {
                _geoEmitBarrel(webgl, t, entityX, entityY, layerWorldAngle, layerWorldAngle, barrelEffSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, false);
            }
        }
        if (_edHookOn) _edLayer(layer, 1);
    }
}

const _bulletTurretBuf: Turret[] = [];
let _geoBulletEntityIdx = 0;

const _TRI_WEBGL_OFFSET = -Math.PI / 2;
function _roundTurn(sides: number, fromFacing: boolean): number {
    return roundBodyTurnGL(sides, ARRAS_PARITY.ROUND_HEADING !== 0, fromFacing, ARRAS_PARITY.AIM_PICTURE !== 0);
}

function _emitTurrettedBulletGeometry(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    b: Bullet,
    alpha: number
): void {
    const sPosX = _rd.posX, sPosY = _rd.posY;
    const sBodyAngle = _rd.bodyAngle, sAimAngle = _rd.aimAngle;
    const sSizePx = _rd.sizePx, sSides = _rd.sides;
    const sShapeDepth = _rd.shapeDepth, sShapeCurved = _rd.shapeCurved;
    const sColor = _rd.color, sColorMap = _rd.colorMap, sDmg = _rd.damageOverlay, sKick = _rd.kickSpeed;
    const sTurrets = _rd.turrets, sLayers = _rd.bodyLayers;
    const sTest = _rd.isTestMode, sHealer = _rd.isHealer;
    const sBaseSpin = _rd.baseBodyAngle;
    const sTeamOvr = _rd.teamColorOverride, sLtf = _rd.layerTeamFill, sShowTO = _rd.showTurretsOnly;
    const sSelTurret = _rd.selectedTurretId, sSelAuto = _rd.selectedAutoParentId, sPick = _rd.pickedBody; _rd.pickedBody = '';
    const sEditing = _rd.editingTurret;
    const sAlpha = _rd.alpha;

    _rd.posX = b.position.x;
    _rd.posY = b.position.y;
    const bodyRotation = b.motionType === 'minion' ? b.visualAimAngle : b.facingAngle;
    const triAdj = _roundTurn(b.shapeSides, b.motionType !== 'minion');
    _rd.bodyAngle = bodyRotation + triAdj;
    _rd.aimAngle = bodyRotation + triAdj;
    _rd.sizePx = b.size * b.growth;
    _rd.sides = b.shapeSides;
    _rd.shapeDepth = b.trapDepth ?? 0;
    _rd.shapeCurved = b.trapCurved ?? false;
    _rd.color = b.color; _rd.colorMap = b.colorMap;
    _rd.damageOverlay = b.damageOverlay; _rd.kickSpeed = roundKickSpeed(b);
    _rd.isTestMode = true;
    _rd.isHealer = b.healer && !_wearsCrossLook(b.subTurrets);
    _rd.baseBodyAngle = 0;
    _rd.teamColorOverride = false; _rd.layerTeamFill = '';
    _rd.showTurretsOnly = false;
    _rd.selectedTurretId = null;
    _rd.selectedAutoParentId = null;
    _rd.editingTurret = null;
    _rd.alpha = alpha;

    _bulletTurretBuf.length = 0;
    const subTurrets = b.subTurrets;
    if (subTurrets) {
        for (let i = 0; i < subTurrets.length; i++) {
            const st = subTurrets[i];
            if (st.turretData) {
                st.turretData.animProgress = MOTION_ARRAS.RECOIL ? st.kick : st.animProgress;
                _bulletTurretBuf.push(st.turretData);
            }
        }
    }
    _rd.turrets = _bulletTurretBuf;
    _rd.bodyLayers = b._bulletBodyLayers;

    _geoUseBulletDepth = true;
    _geoEntityIdx = _geoBulletEntityIdx++;
    _geoSubSlot = 0;

    _lastSortedTurretsRef = null;

    _addTankGeometry(webgl, _geoEntityIdx);

    _geoUseBulletDepth = false;
    _rd.posX = sPosX; _rd.posY = sPosY;
    _rd.bodyAngle = sBodyAngle; _rd.aimAngle = sAimAngle;
    _rd.sizePx = sSizePx; _rd.sides = sSides;
    _rd.shapeDepth = sShapeDepth; _rd.shapeCurved = sShapeCurved;
    _rd.color = sColor; _rd.colorMap = sColorMap; _rd.damageOverlay = sDmg; _rd.kickSpeed = sKick;
    _rd.turrets = sTurrets; _rd.bodyLayers = sLayers;
    _rd.isTestMode = sTest; _rd.isHealer = sHealer;
    _rd.baseBodyAngle = sBaseSpin;
    _rd.teamColorOverride = sTeamOvr; _rd.layerTeamFill = sLtf; _rd.showTurretsOnly = sShowTO;
    _rd.selectedTurretId = sSelTurret; _rd.selectedAutoParentId = sSelAuto; _rd.pickedBody = sPick;
    _rd.editingTurret = sEditing;
    _rd.alpha = sAlpha;
}

function _emitTurrettedBulletBelow(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    b: Bullet,
    alpha: number
): void {
    const sPosX = _rd.posX, sPosY = _rd.posY;
    const sBodyAngle = _rd.bodyAngle, sAimAngle = _rd.aimAngle;
    const sSizePx = _rd.sizePx, sSides = _rd.sides;
    const sShapeDepth = _rd.shapeDepth, sShapeCurved = _rd.shapeCurved;
    const sColor = _rd.color, sColorMap = _rd.colorMap, sDmg = _rd.damageOverlay, sKick = _rd.kickSpeed;
    const sTurrets = _rd.turrets, sLayers = _rd.bodyLayers;
    const sTest = _rd.isTestMode, sHealer = _rd.isHealer;
    const sBaseSpin = _rd.baseBodyAngle;
    const sTeamOvr = _rd.teamColorOverride, sLtf = _rd.layerTeamFill, sShowTO = _rd.showTurretsOnly;
    const sSelTurret = _rd.selectedTurretId, sSelAuto = _rd.selectedAutoParentId, sPick = _rd.pickedBody; _rd.pickedBody = '';
    const sEditing = _rd.editingTurret;
    const sAlpha = _rd.alpha;
    const sEntityAlpha = _entityAlpha;

    _rd.posX = b.position.x;
    _rd.posY = b.position.y;
    const bodyRotation = b.motionType === 'minion' ? b.visualAimAngle : b.facingAngle;
    const triAdj = _roundTurn(b.shapeSides, b.motionType !== 'minion');
    _rd.bodyAngle = bodyRotation + triAdj;
    _rd.aimAngle = bodyRotation + triAdj;
    _rd.sizePx = b.size * b.growth;
    _rd.sides = b.shapeSides;
    _rd.shapeDepth = b.trapDepth ?? 0;
    _rd.shapeCurved = b.trapCurved ?? false;
    _rd.color = b.color; _rd.colorMap = b.colorMap;
    _rd.damageOverlay = b.damageOverlay; _rd.kickSpeed = roundKickSpeed(b);
    _rd.isTestMode = true;
    _rd.isHealer = b.healer && !_wearsCrossLook(b.subTurrets);
    _rd.baseBodyAngle = 0;
    _rd.teamColorOverride = false; _rd.layerTeamFill = '';
    _rd.showTurretsOnly = false;
    _rd.selectedTurretId = null;
    _rd.selectedAutoParentId = null;
    _rd.editingTurret = null;
    _rd.alpha = alpha;

    _bulletTurretBuf.length = 0;
    const subTurrets = b.subTurrets;
    if (subTurrets) {
        for (let i = 0; i < subTurrets.length; i++) {
            const st = subTurrets[i];
            if (st.turretData) {
                st.turretData.animProgress = MOTION_ARRAS.RECOIL ? st.kick : st.animProgress;
                _bulletTurretBuf.push(st.turretData);
            }
        }
    }
    _rd.turrets = _bulletTurretBuf;
    _rd.bodyLayers = b._bulletBodyLayers;

    _geoUseBulletDepth = true;
    _geoEntityIdx = _geoBulletEntityIdx++;
    _geoSubSlot = 0;
    _lastSortedTurretsRef = null;

    _entityAlpha = _rd.alpha;
    const sizePx = _rd.sizePx;
    const turrets = _rd.turrets!;
    const sorted = _sortTurrets(turrets);
    _buildTurretLayerFlags(sorted, _rd.bodyLayers);

    const bodyColor = bodyFill(_rd.color, _rd.colorMap);
    _hexToRGB(bodyColor, _gColor, 0);
    const bodyR = _gColor[0], bodyG = _gColor[1], bodyB = _gColor[2];
    const dmg = _rd.damageOverlay;
    const entityX = _rd.posX, entityY = _rd.posY;
    const bodyAngle = _rd.bodyAngle, aimAngle = _rd.aimAngle;
    const isTestMode = _rd.isTestMode;

    _hexToRGB(turretGrey(), _gColor, 0);
    _turretGreyR = _gColor[0]; _turretGreyG = _gColor[1]; _turretGreyB = _gColor[2];

    _geoEmitBodyLayers(webgl, sizePx, sorted, false, entityX, entityY, bodyAngle, aimAngle, dmg, isTestMode, bodyR, bodyG, bodyB);

    for (let i = 0; i < sorted.length; i++) {
        if (!sorted[i].aboveTankBody && !_turretOnLayerFlags[i]) {
            const t = sorted[i];
            if (t.turretType === 'auto') {
                _geoEmitAutoTurret(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, bodyR, bodyG, bodyB);
            } else {
                _geoEmitBarrel(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, false);
            }
        }
    }

    _geoUseBulletDepth = false;
    _rd.posX = sPosX; _rd.posY = sPosY;
    _rd.bodyAngle = sBodyAngle; _rd.aimAngle = sAimAngle;
    _rd.sizePx = sSizePx; _rd.sides = sSides;
    _rd.shapeDepth = sShapeDepth; _rd.shapeCurved = sShapeCurved;
    _rd.color = sColor; _rd.colorMap = sColorMap; _rd.damageOverlay = sDmg; _rd.kickSpeed = sKick;
    _rd.turrets = sTurrets; _rd.bodyLayers = sLayers;
    _rd.isTestMode = sTest; _rd.isHealer = sHealer;
    _rd.baseBodyAngle = sBaseSpin;
    _rd.teamColorOverride = sTeamOvr; _rd.layerTeamFill = sLtf; _rd.showTurretsOnly = sShowTO;
    _rd.selectedTurretId = sSelTurret; _rd.selectedAutoParentId = sSelAuto; _rd.pickedBody = sPick;
    _rd.editingTurret = sEditing;
    _rd.alpha = sAlpha;
    _entityAlpha = sEntityAlpha;
}

function _emitTurrettedBulletBody(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    b: Bullet,
    alpha: number
): void {
    const sPosX = _rd.posX, sPosY = _rd.posY;
    const sBodyAngle = _rd.bodyAngle, sAimAngle = _rd.aimAngle;
    const sSizePx = _rd.sizePx, sSides = _rd.sides;
    const sShapeDepth = _rd.shapeDepth, sShapeCurved = _rd.shapeCurved;
    const sColor = _rd.color, sColorMap = _rd.colorMap, sDmg = _rd.damageOverlay, sKick = _rd.kickSpeed;
    const sTurrets = _rd.turrets, sLayers = _rd.bodyLayers;
    const sTest = _rd.isTestMode, sHealer = _rd.isHealer;
    const sBaseSpin = _rd.baseBodyAngle;
    const sTeamOvr = _rd.teamColorOverride, sLtf = _rd.layerTeamFill, sShowTO = _rd.showTurretsOnly;
    const sSelTurret = _rd.selectedTurretId, sSelAuto = _rd.selectedAutoParentId, sPick = _rd.pickedBody; _rd.pickedBody = '';
    const sEditing = _rd.editingTurret;
    const sAlpha = _rd.alpha;
    const sEntityAlpha = _entityAlpha;

    _rd.posX = b.position.x;
    _rd.posY = b.position.y;
    const bodyRotation = b.motionType === 'minion' ? b.visualAimAngle : b.facingAngle;
    const triAdj = _roundTurn(b.shapeSides, b.motionType !== 'minion');
    _rd.bodyAngle = bodyRotation + triAdj;
    _rd.aimAngle = bodyRotation + triAdj;
    _rd.sizePx = b.size * b.growth;
    _rd.sides = b.shapeSides;
    _rd.shapeDepth = b.trapDepth ?? 0;
    _rd.shapeCurved = b.trapCurved ?? false;
    _rd.color = b.color; _rd.colorMap = b.colorMap;
    _rd.damageOverlay = b.damageOverlay; _rd.kickSpeed = roundKickSpeed(b);
    _rd.isTestMode = true;
    _rd.isHealer = b.healer && !_wearsCrossLook(b.subTurrets);
    _rd.baseBodyAngle = 0;
    _rd.teamColorOverride = false; _rd.layerTeamFill = '';
    _rd.showTurretsOnly = false;
    _rd.selectedTurretId = null;
    _rd.selectedAutoParentId = null;
    _rd.editingTurret = null;
    _rd.alpha = alpha;

    _bulletTurretBuf.length = 0;
    const subTurrets = b.subTurrets;
    if (subTurrets) {
        for (let i = 0; i < subTurrets.length; i++) {
            const st = subTurrets[i];
            if (st.turretData) {
                st.turretData.animProgress = MOTION_ARRAS.RECOIL ? st.kick : st.animProgress;
                _bulletTurretBuf.push(st.turretData);
            }
        }
    }
    _rd.turrets = _bulletTurretBuf;
    _rd.bodyLayers = b._bulletBodyLayers;

    _geoUseBulletDepth = true;
    _geoEntityIdx = _geoBulletEntityIdx++;
    _geoSubSlot = 0;
    _lastSortedTurretsRef = null;

    _entityAlpha = _rd.alpha;
    const sizePx = _rd.sizePx;
    const bodyColor = bodyFill(_rd.color, _rd.colorMap);
    _hexToRGB(bodyColor, _gColor, 0);
    const bodyR = _gColor[0], bodyG = _gColor[1], bodyB = _gColor[2];
    const dmg = _rd.damageOverlay;
    const entityX = _rd.posX, entityY = _rd.posY;
    const bodyAngle = _rd.bodyAngle;

    if (!_rd.showTurretsOnly) {
        const intSides = Math.floor(_rd.sides);
        const fracRotation = (_rd.sides % 1) * Math.PI * 2;
        const baseSpin = _rd.baseBodyAngle || 0;

        if (intSides < 3) {
            const half = sizePx / 2;
            _geoEmit(webgl, 'circle', entityX, entityY, bodyAngle + baseSpin, half, half, bodyR, bodyG, bodyB, dmg, 1.0, _entityAlpha);
        } else {
            const visualHalf = (sizePx / 2) * getRealSizeFactor(intSides);
            const evenOff = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
            const polyRot = bodyAngle + evenOff + fracRotation + baseSpin;
            const batchKey = (_rd.shapeDepth > 0)
                ? webgl.getOrCreateStarBatch(intSides, _rd.shapeDepth, _rd.shapeCurved)
                : (intSides <= 16 ? POLY_BATCH_KEY[intSides] : 'circle');
            _geoEmit(webgl, batchKey, entityX, entityY, polyRot, visualHalf, visualHalf, bodyR, bodyG, bodyB, dmg, 1.0, _entityAlpha);
        }

        if (_rd.isHealer) {
            const crossR = _HEALER_CROSS_SCALE * sizePx;
            _hexToRGB(healerCrossFill(), _gColor, 0);
            _geoEmit(webgl, 'healer_cross', entityX, entityY, bodyAngle + baseSpin,
                crossR, crossR, _gColor[0], _gColor[1], _gColor[2], dmg, 1.0, _entityAlpha);
        }
    }

    _geoUseBulletDepth = false;
    _rd.posX = sPosX; _rd.posY = sPosY;
    _rd.bodyAngle = sBodyAngle; _rd.aimAngle = sAimAngle;
    _rd.sizePx = sSizePx; _rd.sides = sSides;
    _rd.shapeDepth = sShapeDepth; _rd.shapeCurved = sShapeCurved;
    _rd.color = sColor; _rd.colorMap = sColorMap; _rd.damageOverlay = sDmg; _rd.kickSpeed = sKick;
    _rd.turrets = sTurrets; _rd.bodyLayers = sLayers;
    _rd.isTestMode = sTest; _rd.isHealer = sHealer;
    _rd.baseBodyAngle = sBaseSpin;
    _rd.teamColorOverride = sTeamOvr; _rd.layerTeamFill = sLtf; _rd.showTurretsOnly = sShowTO;
    _rd.selectedTurretId = sSelTurret; _rd.selectedAutoParentId = sSelAuto; _rd.pickedBody = sPick;
    _rd.editingTurret = sEditing;
    _rd.alpha = sAlpha;
    _entityAlpha = sEntityAlpha;
}

function _emitTurrettedBulletAbove(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    b: Bullet,
    alpha: number
): void {
    const sPosX = _rd.posX, sPosY = _rd.posY;
    const sBodyAngle = _rd.bodyAngle, sAimAngle = _rd.aimAngle;
    const sSizePx = _rd.sizePx, sSides = _rd.sides;
    const sShapeDepth = _rd.shapeDepth, sShapeCurved = _rd.shapeCurved;
    const sColor = _rd.color, sColorMap = _rd.colorMap, sDmg = _rd.damageOverlay, sKick = _rd.kickSpeed;
    const sTurrets = _rd.turrets, sLayers = _rd.bodyLayers;
    const sTest = _rd.isTestMode, sHealer = _rd.isHealer;
    const sBaseSpin = _rd.baseBodyAngle;
    const sTeamOvr = _rd.teamColorOverride, sLtf = _rd.layerTeamFill, sShowTO = _rd.showTurretsOnly;
    const sSelTurret = _rd.selectedTurretId, sSelAuto = _rd.selectedAutoParentId, sPick = _rd.pickedBody; _rd.pickedBody = '';
    const sEditing = _rd.editingTurret;
    const sAlpha = _rd.alpha;
    const sEntityAlpha = _entityAlpha;

    _rd.posX = b.position.x;
    _rd.posY = b.position.y;
    const bodyRotation = b.motionType === 'minion' ? b.visualAimAngle : b.facingAngle;
    const triAdj = _roundTurn(b.shapeSides, b.motionType !== 'minion');
    _rd.bodyAngle = bodyRotation + triAdj;
    _rd.aimAngle = bodyRotation + triAdj;
    _rd.sizePx = b.size * b.growth;
    _rd.sides = b.shapeSides;
    _rd.shapeDepth = b.trapDepth ?? 0;
    _rd.shapeCurved = b.trapCurved ?? false;
    _rd.color = b.color; _rd.colorMap = b.colorMap;
    _rd.damageOverlay = b.damageOverlay; _rd.kickSpeed = roundKickSpeed(b);
    _rd.isTestMode = true;
    _rd.isHealer = b.healer && !_wearsCrossLook(b.subTurrets);
    _rd.baseBodyAngle = 0;
    _rd.teamColorOverride = false; _rd.layerTeamFill = '';
    _rd.showTurretsOnly = false;
    _rd.selectedTurretId = null;
    _rd.selectedAutoParentId = null;
    _rd.editingTurret = null;
    _rd.alpha = alpha;

    _bulletTurretBuf.length = 0;
    const subTurrets = b.subTurrets;
    if (subTurrets) {
        for (let i = 0; i < subTurrets.length; i++) {
            const st = subTurrets[i];
            if (st.turretData) {
                st.turretData.animProgress = MOTION_ARRAS.RECOIL ? st.kick : st.animProgress;
                _bulletTurretBuf.push(st.turretData);
            }
        }
    }
    _rd.turrets = _bulletTurretBuf;
    _rd.bodyLayers = b._bulletBodyLayers;

    _geoUseBulletDepth = true;
    _geoEntityIdx = _geoBulletEntityIdx++;
    _geoSubSlot = 0;
    _lastSortedTurretsRef = null;

    _entityAlpha = _rd.alpha;
    const sizePx = _rd.sizePx;
    const turrets = _rd.turrets!;
    const sorted = _sortTurrets(turrets);
    _buildTurretLayerFlags(sorted, _rd.bodyLayers);

    const bodyColor = bodyFill(_rd.color, _rd.colorMap);
    _hexToRGB(bodyColor, _gColor, 0);
    const bodyR = _gColor[0], bodyG = _gColor[1], bodyB = _gColor[2];
    const dmg = _rd.damageOverlay;
    const entityX = _rd.posX, entityY = _rd.posY;
    const bodyAngle = _rd.bodyAngle, aimAngle = _rd.aimAngle;
    const isTestMode = _rd.isTestMode;

    _hexToRGB(turretGrey(), _gColor, 0);
    _turretGreyR = _gColor[0]; _turretGreyG = _gColor[1]; _turretGreyB = _gColor[2];

    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].aboveTankBody && !_turretOnLayerFlags[i]) {
            const t = sorted[i];
            if (t.turretType === 'auto') {
                _geoEmitAutoTurret(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, bodyR, bodyG, bodyB);
            } else {
                _geoEmitBarrel(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, false);
            }
        }
    }

    _geoEmitBodyLayers(webgl, sizePx, sorted, true, entityX, entityY, bodyAngle, aimAngle, dmg, isTestMode, bodyR, bodyG, bodyB);

    _geoUseBulletDepth = false;
    _rd.posX = sPosX; _rd.posY = sPosY;
    _rd.bodyAngle = sBodyAngle; _rd.aimAngle = sAimAngle;
    _rd.sizePx = sSizePx; _rd.sides = sSides;
    _rd.shapeDepth = sShapeDepth; _rd.shapeCurved = sShapeCurved;
    _rd.color = sColor; _rd.colorMap = sColorMap; _rd.damageOverlay = sDmg; _rd.kickSpeed = sKick;
    _rd.turrets = sTurrets; _rd.bodyLayers = sLayers;
    _rd.isTestMode = sTest; _rd.isHealer = sHealer;
    _rd.baseBodyAngle = sBaseSpin;
    _rd.teamColorOverride = sTeamOvr; _rd.layerTeamFill = sLtf; _rd.showTurretsOnly = sShowTO;
    _rd.selectedTurretId = sSelTurret; _rd.selectedAutoParentId = sSelAuto; _rd.pickedBody = sPick;
    _rd.editingTurret = sEditing;
    _rd.alpha = sAlpha;
    _entityAlpha = sEntityAlpha;
}

function _emit3PhaseTurrettedBullets(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    bulletsArr: Bullet[],
    indices: Int32Array, count: number,
    viewportBounds: ViewportBounds,
    ghostMode: boolean, playerId: string
): void {
    webgl.beginGeomFrame();
    webgl.setDepthFunc(false);
    webgl.setDepthMask(false);
    for (let i = 0; i < count; i++) {
        const b = bulletsArr[indices[i]];
        if (b.inExitPhase && !_exitBulletToWebGL(b)) continue;
        if (b.isFading) continue;
        if (!b.inExitPhase && b.opacity > 0 && _roundIsUnit(b, _bulletIsGhostly(b, ghostMode, playerId))) continue;
        const hasST = b.subTurrets && b.subTurrets.length > 0;
        const hasBL = b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0;
        if (!hasST && !hasBL) continue;
        if (hasBL && ROUND_FINE_LADDER && _geoUnitDepthOn === 1) continue;
        if (!isInViewport(b.position.x, b.position.y, _roundCullR(b), viewportBounds)) continue;
        let alpha = b.opacity / 255;
        if (_bulletIsGhostly(b, ghostMode, playerId)) alpha *= 0.3;
        _emitTurrettedBulletBelow(webgl, b, alpha);
    }
    webgl.flushGeom();

    webgl.beginGeomFrame();
    webgl.setDepthFunc(false);
    webgl.setDepthMask(false);
    for (let i = 0; i < count; i++) {
        const b = bulletsArr[indices[i]];
        if (b.inExitPhase && !_exitBulletToWebGL(b)) continue;
        if (b.isFading) continue;
        if (!b.inExitPhase && b.opacity > 0 && _roundIsUnit(b, _bulletIsGhostly(b, ghostMode, playerId))) continue;
        const hasST = b.subTurrets && b.subTurrets.length > 0;
        const hasBL = b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0;
        if (!hasST && !hasBL) continue;
        if (hasBL && ROUND_FINE_LADDER && _geoUnitDepthOn === 1) continue;
        if (!isInViewport(b.position.x, b.position.y, _roundCullR(b), viewportBounds)) continue;
        let alpha = b.opacity / 255;
        if (_bulletIsGhostly(b, ghostMode, playerId)) alpha *= 0.3;
        _emitTurrettedBulletBody(webgl, b, alpha);
    }
    webgl.flushGeom();

    webgl.beginGeomFrame();
    webgl.setDepthFunc(false);
    webgl.setDepthMask(false);
    for (let i = 0; i < count; i++) {
        const b = bulletsArr[indices[i]];
        if (b.inExitPhase && !_exitBulletToWebGL(b)) continue;
        if (b.isFading) continue;
        if (!b.inExitPhase && b.opacity > 0 && _roundIsUnit(b, _bulletIsGhostly(b, ghostMode, playerId))) continue;
        const hasST = b.subTurrets && b.subTurrets.length > 0;
        const hasBL = b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0;
        if (!hasST && !hasBL) continue;
        if (hasBL && ROUND_FINE_LADDER && _geoUnitDepthOn === 1) continue;
        if (!isInViewport(b.position.x, b.position.y, _roundCullR(b), viewportBounds)) continue;
        let alpha = b.opacity / 255;
        if (_bulletIsGhostly(b, ghostMode, playerId)) alpha *= 0.3;
        _emitTurrettedBulletAbove(webgl, b, alpha);
    }
    webgl.flushGeom();

    _emitLayeredRoundsOnLadder(webgl, bulletsArr, indices, count, viewportBounds, ghostMode, playerId);
}

function _emitLayeredRoundsOnLadder(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    bulletsArr: Bullet[],
    indices: Int32Array, count: number,
    viewportBounds: ViewportBounds,
    ghostMode: boolean, playerId: string
): void {
    if (!(ROUND_FINE_LADDER && _geoUnitDepthOn === 1)) return;
    let _mlU = -1, _mlA = 1;
    for (let i = 0; i < count; i++) {
        const b = bulletsArr[indices[i]];
        if (b.inExitPhase && !_exitBulletToWebGL(b)) continue;
        if (b.isFading) continue;
        if (!b.inExitPhase && b.opacity > 0 && _roundIsUnit(b, _bulletIsGhostly(b, ghostMode, playerId))) continue;
        if (b._bulletBodyLayers === null || b._bulletBodyLayers.length === 0) continue;
        if (!isInViewport(b.position.x, b.position.y, _roundCullR(b), viewportBounds)) continue;
        let alpha = b.opacity / 255;
        if (_bulletIsGhostly(b, ghostMode, playerId)) alpha *= 0.3;
        if (_mlU < 0) {
            _mlU = _geoUnitDepthBuf[0]; _mlA = _entityAlpha;
            webgl.beginGeomFrame();
            webgl.setDepthFunc(false);
            webgl.setDepthMask(true);
            _geoUnitDepthBuf[0] = _mlLadderBase(_mlU);
            _geoUnitSub = _mlDyingSub;
            _geoUnitDepthOn = 3;
        }
        _emitTurrettedBulletGeometry(webgl, b, alpha);
    }
    if (_mlU >= 0) {
        webgl.flushGeom();
        _mlDyingSub = _geoUnitSub;
        _geoUnitDepthOn = 1;
        _geoUnitDepthBuf[0] = _mlU;
        _entityAlpha = _mlA;
        webgl.setDepthMask(false);
    }
}

function _drawDyingTurrettedBulletsAsUnits(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    ctx: CanvasRenderingContext2D,
    bulletsArr: Bullet[],
    indices: Int32Array, count: number,
    viewportBounds: ViewportBounds,
    ghostMode: boolean, playerId: string,
    width: number, height: number,
    logic: GameLogic
): boolean {
    let _hasDying = false;
    for (let i = 0; i < count; i++) {
        const b = bulletsArr[indices[i]];
        if (b.inExitPhase) continue;
        const hasST = b.subTurrets && b.subTurrets.length > 0;
        const hasBL = b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0;
        if (!(b.isFading && (hasST || hasBL)) && !(b.opacity > 0 && _roundIsUnit(b, _bulletIsGhostly(b, ghostMode, playerId)))) continue;
        if (!isInViewport(b.position.x, b.position.y, _roundCullR(b), viewportBounds)) continue;
        _hasDying = true;
        break;
    }
    if (!_hasDying) return false;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    _compositeWorld(ctx, webgl);
    ctx.restore();
    webgl.clearColorOnly();

    for (let i = 0; i < count; i++) {
        const b = bulletsArr[indices[i]];
        if (b.inExitPhase) continue;
        const hasST = b.subTurrets && b.subTurrets.length > 0;
        const hasBL = b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0;
        if (!(b.isFading && (hasST || hasBL)) && !(b.opacity > 0 && _roundIsUnit(b, _bulletIsGhostly(b, ghostMode, playerId)))) continue;
        if (!isInViewport(b.position.x, b.position.y, _roundCullR(b), viewportBounds)) continue;

        let alpha = b.opacity / 255;
        if (alpha <= 0) continue;
        if (_bulletIsGhostly(b, ghostMode, playerId)) alpha *= 0.3;

        if ((hasST || hasBL) && ROUND_FINE_LADDER && _geoUnitDepthOn === 1) {
        const _mlU = _geoUnitDepthBuf[0], _mlA = _entityAlpha;
        webgl.beginGeomFrame();
        webgl.setDepthFunc(false);
        webgl.setDepthMask(true);
        _geoUnitDepthBuf[0] = _mlLadderBase(_mlU);
        _geoUnitSub = _mlDyingSub;
        _geoUnitDepthOn = 3;
        _emitTurrettedBulletGeometry(webgl, b, 1.0);
        webgl.flushGeom();
        _mlDyingSub = _geoUnitSub;
        _geoUnitDepthOn = 1;
        _geoUnitDepthBuf[0] = _mlU;
        _entityAlpha = _mlA;
        webgl.setDepthMask(false);
        } else if (hasST || hasBL) {
        webgl.beginGeomFrame();
        webgl.setDepthFunc(false);
        webgl.setDepthMask(false);
        _emitTurrettedBulletBelow(webgl, b, 1.0);
        webgl.flushGeom();
        webgl.beginGeomFrame();
        webgl.setDepthFunc(false);
        webgl.setDepthMask(false);
        _emitTurrettedBulletBody(webgl, b, 1.0);
        webgl.flushGeom();
        webgl.beginGeomFrame();
        webgl.setDepthFunc(false);
        webgl.setDepthMask(false);
        _emitTurrettedBulletAbove(webgl, b, 1.0);
        webgl.flushGeom();
        } else {
        webgl.beginGeomFrame();
        webgl.setDepthFunc(false);
        webgl.setDepthMask(false);
        _emitPlainRoundUnit(webgl, b, 1, true);
        webgl.flushGeom();
        webgl.beginGeomFrame();
        webgl.setDepthFunc(false);
        webgl.setDepthMask(false);
        _emitPlainRoundUnit(webgl, b, 2, true);
        webgl.flushGeom();
        }

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = alpha;
        _compositeMiniFlush(ctx, webgl);
        ctx.globalAlpha = 1.0;
        ctx.restore();
        webgl.clearColorOnly();
    }

    _restoreCameraTransform(ctx, logic, width, height);
    return true;
}

const _pathVx = new Float64Array(64);
const _pathVy = new Float64Array(64);
const _barrelPx = new Float64Array(4);
const _barrelPy = new Float64Array(4);

function roundedPolygonPath(ctx: CanvasRenderingContext2D, sides: number, radius: number, angleOffset: number) {
    for (let i = 0; i < sides; i++) {
        const a = (Math.PI * 2 * i) / sides + angleOffset;
        _pathVx[i] = radius * Math.cos(a);
        _pathVy[i] = radius * Math.sin(a);
    }
    ctx.moveTo(_pathVx[0], _pathVy[0]);
    for (let i = 1; i < sides; i++) {
        ctx.lineTo(_pathVx[i], _pathVy[i]);
    }
    ctx.closePath();
}

function _autoBasePath(ctx: CanvasRenderingContext2D, sides: number, depth: number, radius: number, turn: number) {
    if (depth > 0) roundedStarPath(ctx, Math.floor(sides), radius, radius * (1 - depth), turn, false);
    else roundedPolygonPath(ctx, sides, radius, turn);
}

function roundedStarPath(
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
            _pathVx[i] = r * Math.cos(a);
            _pathVy[i] = r * Math.sin(a);
        }
        ctx.moveTo(_pathVx[0], _pathVy[0]);
        for (let i = 1; i < totalPoints; i++) {
            ctx.lineTo(_pathVx[i], _pathVy[i]);
        }
        ctx.closePath();
    }
}

function _strokeFillPolygonCopies(
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

function roundedBarrelPath(
    ctx: CanvasRenderingContext2D,
    tLen: number, topY: number, botY: number, topScaled: number, botScaled: number
) {
    _barrelPx[0] = 0; _barrelPx[1] = tLen; _barrelPx[2] = tLen; _barrelPx[3] = 0;
    _barrelPy[0] = topY; _barrelPy[1] = topScaled; _barrelPy[2] = botScaled; _barrelPy[3] = botY;
    ctx.moveTo(_barrelPx[0], _barrelPy[0]);
    for (let i = 1; i < 4; i++) {
        ctx.lineTo(_barrelPx[i], _barrelPy[i]);
    }
    ctx.closePath();
}

const _rd = {
  posX: 0,
  posY: 0,
  bodyAngle: 0,
  aimAngle: 0,
  turrets: null as Turret[] | null,
  sides: 0,
  shapeDepth: 0,
  shapeCurved: false,
  sizePx: 0,
  color: '',
  colorMap: CM_FREE as number | undefined,
  damageOverlay: 0,
  kickSpeed: 1,
  isTestMode: false,
  zoom: 1,
  bodyLayers: null as BodyLayer[] | null,
  baseBodyAngle: 0,
  isHealer: false,
  selectedTurretId: null as string | null,
  selectedAutoParentId: null as string | null,
  pickedBody: '' as string,
  editingTurret: null as Omit<Turret, 'id' | 'angle' | 'animProgress'> | null,
  teamColorOverride: false,
  layerTeamFill: '',
  showTurretsOnly: false,
  alpha: 1.0,
  canFade: false,
};
let _entityAlpha = 1.0;

function _layerFill(layer: BodyLayer): string {
    const w = layerColourOf(layer, _rd.teamColorOverride, _rd.layerTeamFill !== '');
    if (w === LAYER_BODY) return bodyFill(_rd.color, _rd.colorMap);
    if (w === LAYER_TEAM) return _rd.layerTeamFill;
    return bodyFill(layer.color, layer.colorMap);
}
function _roundFill(b: Bullet): string {
    return bodyFill(b.color, b.colorMap);
}
function _roundBodyFill(b: Bullet): string {
    return b._bulletBodyColor ? bodyFill(b._bulletBodyColor, b._bulletBodyColorMap) : bodyFill(b.color, b.colorMap);
}
function _roundLayerFill(b: Bullet, l: BodyLayer): string {
    return l.useInheritColor ? _roundBodyFill(b) : bodyFill(l.color, l.colorMap);
}
function _editorBodyColor(logic: GameLogic): string {
    return bodyFill(logic.state.tankColor, logic.state.tankColorMap);
}

function roundKickSpeed(b: Bullet): number {
    return 1 + arrasSkillCurve(b._skSpd, b._skCap);
}

function _mapVal(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return (val - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

const _turretSortBuf: any[] = [];
const _bulletSubSortBuf: any[] = [];
const _subTurretSortBuf: any[] = [];
const _geoSubSortBuf: any[] = [];
const _turretLayerCmp = (a: any, b: any) => (a.renderLayer ?? 0) - (b.renderLayer ?? 0);
const ZERO_ROUND_BELOW = 0.1;
const _bulletSubCmp = (a: any, b: any) => ((a.turretData?.renderLayer ?? 0) - (b.turretData?.renderLayer ?? 0));

const _bodyLayerSortBuf: BodyLayer[] = [];

const _portalLabelText: string[] = [];
function _portalThemeFill(portal: PortalEntity, logic: GameLogic): string {
  void logic;
  if (portal.themeHex) return portal.themeHex;
  return portal.themeSlot >= 0 ? cmHex(portal.themeSlot, isGameDark(), CM_USE.GENERAL) : '';
}
const _portalThemeStrokes: Record<string, string> = {};
function _portalThemeStroke(fill: string): string { let s = _portalThemeStrokes[fill]; if (s === undefined) { s = darkenColor(fill, 0.598); _portalThemeStrokes[fill] = s; } return s; }
function _collectPortalLabel(portal: PortalEntity, logic: GameLogic, zoom: number, scaledR: number, alpha: number, inMatch: boolean): void {
  if (!portal.showName && !(SMALL_FIX.R665 !== 0 && logic.state.debugMode && logic.state.debugShowAllNames === true)) return;
  if (portal._toModeNow && !portal._particlesDraining && !(portal.invisible && inMatch)) {
    const t = logic.portalModeName(portal._toModeNow);
    if (t) { _portalLabelText.push(t); _portalLabelSub.push(logic.portalModePlayersText(portal._toModeNow)); _portalLabelX.push(portal.x); _portalLabelY.push(portal.y - scaledR * 1.92 - 12 / zoom); _portalLabelAlpha.push(alpha); _portalLabelZoom.push(zoom); }
    return;
  }
  const nameArea = portal._particlesDraining ? null : portalNameAreaId(portal, inMatch);
  if (nameArea === null) return;
  const areas = logic.state.multiAreaConfig.areas;
  let text = '';
  for (let i = 0; i < areas.length; i++) if (areas[i].id === nameArea) { text = areas[i].name; break; }
  if (!text) return;
  _portalLabelText.push(text);
  _portalLabelSub.push('');
  _portalLabelX.push(portal.x);
  _portalLabelY.push(portal.y - scaledR * 1.92 - 12 / zoom);
  _portalLabelAlpha.push(alpha);
  _portalLabelZoom.push(zoom);
}
const _portalLabelX: number[] = [];
const _portalLabelSub: string[] = [];
const _portalLabelY: number[] = [];
const _portalLabelAlpha: number[] = [];
const _portalLabelZoom: number[] = [];
const _innerBodyLayerSortBuf: BodyLayer[] = [];
const _scratchRoundLayerBuf: BodyLayer[] = [];
const INVISIBLE_PORTAL_EDITOR_ALPHA = 0.3;
const _bodyLayerCmp = (a: BodyLayer, b: BodyLayer) => a.renderOrder - b.renderOrder;

let _previewInjectLayerId: string | null = null;
let _previewInjectLogic: GameLogic | null = null;
let _turretOnLayerFlags = new Uint8Array(64);
let _turretLayerOrder = new Int8Array(64);
let _turretLayerRef: (BodyLayer | null)[] = new Array(64).fill(null);

interface _OverlayFade { lastChange: number; alpha: number; prevVal: string; lastStep: number; }
const _overlayFades: Record<string, _OverlayFade> = {};
const _bpFadeKeys: Record<string, string> = {};
const BP_FADE_KEYS_MAX = 64;
let _bpFadeKeyCount = 0;
function _bpFadeKey(areaId: string): string {
  let k = _bpFadeKeys[areaId];
  if (k === undefined) {
    if (_bpFadeKeyCount >= BP_FADE_KEYS_MAX) { for (const a in _bpFadeKeys) delete _bpFadeKeys[a]; _bpFadeKeyCount = 0; }
    k = _bpFadeKeys[areaId] = 'bpRange:' + areaId;
    _bpFadeKeyCount++;
  }
  return k;
}
const OVERLAY_FADE_IN_SPEED = 0.75;
const OVERLAY_FADE_OUT_SPEED = 0.3;
const OVERLAY_LINGER_MS = 2000;
let _lastOverlayResetCounter = 0;
function _clearOverlayFades() {
  for (const key in _overlayFades) delete _overlayFades[key];
  for (const a in _bpFadeKeys) delete _bpFadeKeys[a];
  _bpFadeKeyCount = 0;
}

function _getOverlayAlpha(key: string, currentVal: string, maxAlpha: number, dtSec: number): number {
  let f = _overlayFades[key];
  if (!f) { f = { lastChange: 0, alpha: 0, prevVal: currentVal, lastStep: 0 }; _overlayFades[key] = f; }
  const now = performance.now();
  if (f.lastStep > 0) dtSec = (now - f.lastStep) / 1000;
  f.lastStep = now;
  if (f.prevVal !== currentVal) {
    f.prevVal = currentVal;
    f.lastChange = now;
  }
  const target = (f.lastChange > 0 && now - f.lastChange < OVERLAY_LINGER_MS) ? maxAlpha : 0;
  const speed = target > f.alpha ? OVERLAY_FADE_IN_SPEED : OVERLAY_FADE_OUT_SPEED;
  const diff = target - f.alpha;
  if (Math.abs(diff) < speed * dtSec) {
    f.alpha = target;
  } else {
    f.alpha += Math.sign(diff) * speed * dtSec;
  }
  return f.alpha;
}

const _inheritHighlightIds = new Set<string>();

let _bulletSortIdx = new Int32Array(0);
let _bulletSortLen = 0;
let _bulletSortPairs = new Int32Array(0);
const _csCount = new Int32Array(MAX_ROUND_LAYERS * 4);
const _PASS_BELOW = 1;
const _PASS_BODY  = 2;
const _PASS_ABOVE = 4;
const _PASS_ALL   = 7;
const _PASS_BELOW_BODY = 3;
let _isDarkMode = gameDark();
let _themeVerSeen = gameThemeVersion();

const _BODY_DEPTH_START = 0.0;
const _BODY_DEPTH_END   = 0.49;
const _BULLET_DEPTH_START = 0.5;
const _BULLET_DEPTH_END   = 0.99;
const _MAX_DEPTH_ENTITIES = 100;
const _BODY_RANGE_PER_ENTITY = (_BODY_DEPTH_END - _BODY_DEPTH_START) / _MAX_DEPTH_ENTITIES;
const DEPTH_FIT: boolean = !(typeof location !== 'undefined' && /[?&]olddepthfit(?:[=&]|$)/.test(location.search));
const _DEPTH_FIT_FROM = 290;
const _DEPTH_FIT_SPAN = 1.47;
let _bodyRangePerEntity = _BODY_RANGE_PER_ENTITY;
const _BULLET_DEPTH_STEP = 0.0002;
let _geoBulletGlobalSlot = 0;
let _bulletDepthMap = new Float32Array(0);

function _bodyDepth(entityIdx: number, slot: number): number {
    return _BODY_DEPTH_START + entityIdx * _BODY_RANGE_PER_ENTITY + slot * 0.0001;
}

function _bulletDepth(entityIdx: number, slot: number): number {
    const range = (_BULLET_DEPTH_END - _BULLET_DEPTH_START) / _MAX_DEPTH_ENTITIES;
    return _BULLET_DEPTH_START + entityIdx * range + slot * 0.0001;
}

let _wglUnifiedPassActive = false;
let _wglVisibleEntityIdx = 0;
let _dbg5Active = false;
let _dbg5C2d: string[] = [];
let _dbg5Wgl: string[] = [];

const _MAX_ML_ENTITIES = 8;
let _mlCount = 0;
const _mlVisibleIdx = new Int32Array(_MAX_ML_ENTITIES);
const _mlBulletSlot = new Int32Array(_MAX_ML_ENTITIES);
const _mlIsPlayer = new Uint8Array(_MAX_ML_ENTITIES);
const _mlEnemyRefs: any[] = new Array(_MAX_ML_ENTITIES).fill(null);

const _ENTITY_FADE_THRESHOLD = 0.99;

const ML_BULLETS_EMITTED_ONCE = 1;

const ML_CROSS_ENTITY_DEPTH_STAMP: number = 1;

const ML_ENTITY_UNIT_DEPTH: number = 1;

const _geoUnitDepthBuf = new Float64Array(1);
let _geoUnitDepthOn = 0;
let _geoUnitSub = 0;
const _UNIT_SUB_MAX = Math.floor(_BULLET_DEPTH_STEP / _GEO_DEPTH_SPACING) - 1;
const _ABOVE_ROUND_SLOTS = _UNIT_SUB_MAX + 1;
const ROUND_FINE_LADDER: number = 1;
const _OUTLINE_DEPTH_BIAS = 0.000006;
const _FINE_SUB_STEP = _OUTLINE_DEPTH_BIAS + 0.000001;
const _FINE_SUB_MAX = Math.floor((_UNIT_SUB_MAX * _GEO_DEPTH_SPACING) / _FINE_SUB_STEP);
let _mlDyingSub = 0;
let _mlLadderCap = 0;
function _mlLadderBase(u: number): number { return u + _mlLadderCap * _FINE_SUB_STEP; }
function _aboveOr(b: Bullet, ladder: number): number {
    return _aboveRoundDepth >= 0 && b.aboveBody ? _aboveRoundDepth : ladder;
}

const FADE_KEEPS_ALIVE_Z: number = 1;

const _MAX_INVIS_DEFER = 32;
const _invisDeferIdx = new Int32Array(_MAX_INVIS_DEFER);
const _invisDeferAlpha = new Float32Array(_MAX_INVIS_DEFER);
const _invisDeferIsPlayer = new Uint8Array(_MAX_INVIS_DEFER);
const _invisDeferEnemyRef: (any | null)[] = new Array(_MAX_INVIS_DEFER).fill(null);
let _invisDeferCount = 0;

const _MAX_DYING_DEFER = 32;
let _dyingDeferCount = 0;
const _dyingDeferIsPlayer = new Uint8Array(_MAX_DYING_DEFER);
const _dyingDeferEnemyRef: (any | null)[] = new Array(_MAX_DYING_DEFER).fill(null);
const _dyingDeferAlpha = new Float32Array(_MAX_DYING_DEFER);
const _dyingDeferScale = new Float32Array(_MAX_DYING_DEFER);
const _dyingDeferPosX = new Float32Array(_MAX_DYING_DEFER);
const _dyingDeferPosY = new Float32Array(_MAX_DYING_DEFER);

const _MAX_DYING_BULLET_DEFER = 64;
let _dyingBulletDeferCount = 0;
const _dyingBulletDeferRef: (Bullet | null)[] = new Array(_MAX_DYING_BULLET_DEFER).fill(null);
const _dyingBulletDeferAlpha = new Float32Array(_MAX_DYING_BULLET_DEFER);
const _dyingBulletDeferScale = new Float32Array(_MAX_DYING_BULLET_DEFER);
const _dyingBulletDeferPosX = new Float32Array(_MAX_DYING_BULLET_DEFER);
const _dyingBulletDeferPosY = new Float32Array(_MAX_DYING_BULLET_DEFER);
const _dyingBulletDeferDepth = new Float64Array(_MAX_DYING_BULLET_DEFER);

const _MAX_DYING_SHAPE_DEFER = 32;
let _dyingShapeDeferCount = 0;
const _dyingShapeDeferRef: (FloatingPolygon | null)[] = new Array(_MAX_DYING_SHAPE_DEFER).fill(null);
const _dyingShapeDeferAlpha = new Float32Array(_MAX_DYING_SHAPE_DEFER);
const _dyingShapeDeferPosX = new Float32Array(_MAX_DYING_SHAPE_DEFER);
const _dyingShapeDeferPosY = new Float32Array(_MAX_DYING_SHAPE_DEFER);

function _roundIsUnit(b: Bullet, ghostly: boolean): boolean {
    return roundDrawsAsOneUnit(
        b.labyLevel > 0,
        !!(b.subTurrets && b.subTurrets.length > 0) || (b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0),
        b.isFading,
        b._invisEnabled || b._invisAlways || ghostly);
}
function _plainUnitDepth(ml: boolean): number {
    if (!ml) return _nextGeoDepth();
    return _geoUnitDepthOn ? _geoUnitDepthBuf[0] : Math.max(_BULLET_DEPTH_START, _BULLET_DEPTH_END - (_geoBulletGlobalSlot++) * _BULLET_DEPTH_STEP);
}
function _emitPlainRoundUnit(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer, b: Bullet, part: number, ml: boolean,
): void {
    if (!ml) { _geoEntityIdx = 0; _geoSubSlot = 0; }
    const sz = b.size * b.growth;
    _hexToRGB(_roundFill(b), _gColor, 0);
    const br = _gColor[0], bg = _gColor[1], bb = _gColor[2];
    const intSides = b.shapeSides >= 3 ? Math.floor(b.shapeSides) : b.shapeSides;
    if (part !== 2) {
        if (intSides < 3) {
            const half = sz / 2;
            webgl.pushGeomInstance('circle', b.position.x, b.position.y, 0,
                half, half, br, bg, bb, b.damageOverlay, _plainUnitDepth(ml), 1.0, 1.0);
        } else if (b.trapDepth > 0) {
            const starKey = webgl.getOrCreateStarBatch(intSides, b.trapDepth, b.trapCurved);
            const half = (sz / 2) * getRealSizeFactor(intSides);
            const triAdj = (intSides === 3) ? _TRI_WEBGL_OFFSET : 0;
            webgl.pushGeomInstance(starKey, b.position.x, b.position.y, b.facingAngle + triAdj,
                half, half, br, bg, bb, b.damageOverlay, _plainUnitDepth(ml), 1.0, 1.0);
        } else {
            const half = (sz / 2) * getRealSizeFactor(intSides);
            const batchKey = intSides <= 16 ? POLY_BATCH_KEY[intSides] : 'circle';
            const evenOff = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
            const fracRot = (b.shapeSides % 1) * Math.PI * 2;
            const triAdj = _roundTurn(b.shapeSides, true);
            webgl.pushGeomInstance(batchKey, b.position.x, b.position.y,
                b.facingAngle + evenOff + fracRot + triAdj,
                half, half, br, bg, bb, b.damageOverlay, _plainUnitDepth(ml), 1.0, 1.0);
        }
    }
    if (part !== 1 && b.labyLevel > 0) {
        const ds = labyDownscale(b.shapeSides);
        if (intSides < 3) {
            for (let li = 1; li <= b.labyLevel; li++) {
                const layerR = (sz / 2) * Math.pow(ds, li);
                webgl.pushGeomInstance('circle', b.position.x, b.position.y, 0,
                    layerR, layerR, br, bg, bb, b.damageOverlay, _plainUnitDepth(ml), 1.0, 1.0);
            }
        } else {
            const outerR = (sz / 2) * getRealSizeFactor(intSides);
            const nestKey = intSides <= 16 ? POLY_BATCH_KEY[intSides] : 'circle';
            const evenOff2 = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
            const triAdj2 = b.trapDepth > 0 ? ((intSides === 3) ? _TRI_WEBGL_OFFSET : 0) : _roundTurn(b.shapeSides, true);
            const mainRot = b.facingAngle + evenOff2 + triAdj2;
            for (let li = 1; li <= b.labyLevel; li++) {
                const layerR = outerR * Math.pow(ds, li);
                const layerRot = (li % 2 !== 0) ? mainRot + Math.PI / intSides : mainRot;
                webgl.pushGeomInstance(nestKey, b.position.x, b.position.y,
                    layerRot, layerR, layerR, br, bg, bb, b.damageOverlay, _plainUnitDepth(ml), 1.0, 1.0);
            }
        }
    }
}
function _deferRoundUnit(b: Bullet, alpha: number): number {
    const k = _dyingBulletDeferCount++;
    const depth = _aboveOr(b, Math.max(_BULLET_DEPTH_START, _BULLET_DEPTH_END - (_geoBulletGlobalSlot++) * _BULLET_DEPTH_STEP));
    _dyingBulletDeferRef[k] = b;
    _dyingBulletDeferDepth[k] = depth;
    _dyingBulletDeferAlpha[k] = alpha;
    _dyingBulletDeferScale[k] = 1.0;
    _dyingBulletDeferPosX[k] = b.position.x;
    _dyingBulletDeferPosY[k] = b.position.y;
    return depth;
}

function _exitSubBulletToWebGL(b: Bullet): boolean {
    if (b.subTurrets && b.subTurrets.length > 0) return false;
    if (b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0) return false;
    if (_geoUnitDepthOn) return true;
    if (b.exitOwnerType !== 2 && b.exitOwnerType !== 5) return false;
    return true;
}
function _exitBulletToWebGL(b: Bullet): boolean {
    if (_exitSubBulletToWebGL(b)) return true;
    if (!_geoUnitDepthOn) return false;
    if (b.isFading) return false;
    return b.exitOwnerType !== 2 && b.exitOwnerType !== 5;
}

function _drainDyingBulletUnits(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    ctx: CanvasRenderingContext2D,
    logic: GameLogic,
    width: number, height: number,
    camOffX: number, camOffY: number,
    keepAliveZ: boolean
): void {
    for (let _bdi = 0; _bdi < _dyingBulletDeferCount; _bdi++) {
        const _db = _dyingBulletDeferRef[_bdi];
        if (!_db || !_db.active) {
            _dyingBulletDeferRef[_bdi] = null;
            continue;
        }

        const sPosX = _rd.posX, sPosY = _rd.posY;
        const sBodyAngle = _rd.bodyAngle, sAimAngle = _rd.aimAngle;
        const sSizePx = _rd.sizePx, sSides = _rd.sides;
        const sShapeDepth = _rd.shapeDepth, sShapeCurved = _rd.shapeCurved;
        const sColor = _rd.color, sColorMap = _rd.colorMap, sDmg = _rd.damageOverlay, sKick = _rd.kickSpeed;
        const sTurrets = _rd.turrets, sLayers = _rd.bodyLayers;
        const sTest = _rd.isTestMode, sHealer = _rd.isHealer;
        const sBaseSpin = _rd.baseBodyAngle;
        const sTeamOvr = _rd.teamColorOverride, sLtf = _rd.layerTeamFill, sShowTO = _rd.showTurretsOnly;
        const sSelTurret = _rd.selectedTurretId, sSelAuto = _rd.selectedAutoParentId, sPick = _rd.pickedBody; _rd.pickedBody = '';
        const sEditing = _rd.editingTurret;
        const sAlpha = _rd.alpha;
        const sBulletDepth = _geoUseBulletDepth;

        _rd.posX = _db.position.x;
        _rd.posY = _db.position.y;
        const _dbRot = _db.motionType === 'minion' ? _db.visualAimAngle : _db.facingAngle;
        const _dbTriAdj = _roundTurn(_db.shapeSides, _db.motionType !== 'minion');
        _rd.bodyAngle = _dbRot + _dbTriAdj;
        _rd.aimAngle = _dbRot + _dbTriAdj;
        _rd.sizePx = _db.size * _db.growth;
        _rd.sides = _db.shapeSides;
        _rd.shapeDepth = _db.trapDepth ?? 0;
        _rd.shapeCurved = _db.trapCurved ?? false;
        _rd.color = _db.color; _rd.colorMap = _db.colorMap;
        _rd.damageOverlay = _db.damageOverlay; _rd.kickSpeed = roundKickSpeed(_db);
        _rd.isTestMode = true;
        _rd.isHealer = _db.healer && !_wearsCrossLook(_db.subTurrets);
        _rd.baseBodyAngle = 0;
        _rd.teamColorOverride = false; _rd.layerTeamFill = '';
        _rd.showTurretsOnly = false;
        _rd.selectedTurretId = null;
        _rd.selectedAutoParentId = null;
        _rd.editingTurret = null;
        _rd.alpha = 1.0;
        _bulletTurretBuf.length = 0;
        const _dbSubs = _db.subTurrets;
        if (_dbSubs) {
            for (let i = 0; i < _dbSubs.length; i++) {
                const _st = _dbSubs[i];
                if (_st.turretData) {
                    _st.turretData.animProgress = MOTION_ARRAS.RECOIL ? _st.kick : _st.animProgress;
                    _bulletTurretBuf.push(_st.turretData);
                }
            }
        }
        _rd.turrets = _bulletTurretBuf;
        _rd.bodyLayers = _db._bulletBodyLayers;

        _geoUseBulletDepth = false;
        _lastSortedTurretsRef = null;

        if (keepAliveZ) {
            webgl.clearColorOnly();
            webgl.beginGeomFrame();
            webgl.setDepthFunc(false);
            webgl.setDepthMask(true);
            _geoUnitDepthBuf[0] = _dyingBulletDeferDepth[_bdi];
            _geoUnitSub = 0;
            _geoUnitDepthOn = 2;
        } else {
            webgl.beginFrame();
        }
        if (!(_dbSubs && _dbSubs.length > 0) && (_db._bulletBodyLayers === null || _db._bulletBodyLayers.length === 0)) _emitPlainRoundUnit(webgl, _db, 0, false);
        else
        _addTankGeometry(webgl, 0);
        const _hasBulletGeom = webgl.hasGeomContent();
        webgl.flushGeom();
        _geoUnitDepthOn = 0;

        if (_hasBulletGeom) {
            const _bScreenX = (_dyingBulletDeferPosX[_bdi] - camOffX) * logic.zoom + width / 2;
            const _bScreenY = (_dyingBulletDeferPosY[_bdi] - camOffY) * logic.zoom + height / 2;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = _dyingBulletDeferAlpha[_bdi];
            ctx.translate(_bScreenX, _bScreenY);
            ctx.scale(_dyingBulletDeferScale[_bdi], _dyingBulletDeferScale[_bdi]);
            ctx.translate(-_bScreenX, -_bScreenY);
            _compositeMiniFlush(ctx, webgl);
            ctx.globalAlpha = 1.0;
            ctx.restore();
            _restoreCameraTransform(ctx, logic, width, height);
        }

        _rd.posX = sPosX; _rd.posY = sPosY;
        _rd.bodyAngle = sBodyAngle; _rd.aimAngle = sAimAngle;
        _rd.sizePx = sSizePx; _rd.sides = sSides;
        _rd.shapeDepth = sShapeDepth; _rd.shapeCurved = sShapeCurved;
        _rd.color = sColor; _rd.colorMap = sColorMap; _rd.damageOverlay = sDmg; _rd.kickSpeed = sKick;
        _rd.turrets = sTurrets; _rd.bodyLayers = sLayers;
        _rd.isTestMode = sTest; _rd.isHealer = sHealer;
        _rd.baseBodyAngle = sBaseSpin;
        _rd.teamColorOverride = sTeamOvr; _rd.layerTeamFill = sLtf; _rd.showTurretsOnly = sShowTO;
        _rd.selectedTurretId = sSelTurret; _rd.selectedAutoParentId = sSelAuto; _rd.pickedBody = sPick;
        _rd.editingTurret = sEditing;
        _rd.alpha = sAlpha;
        _geoUseBulletDepth = sBulletDepth;

        _dyingBulletDeferRef[_bdi] = null;
    }
    _dyingBulletDeferCount = 0;
}


function _emitBulletGeometry(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    indices: Int32Array, count: number,
    bulletsArr: Bullet[],
    viewportBounds: ViewportBounds,
    ghostMode: boolean, playerId: string
): void {
    for (let i = 0; i < count; i++) {
        const b = bulletsArr[indices[i]];
        const sz = b.size * b.growth;
        if (!isInViewport(b.position.x, b.position.y, sz, viewportBounds)) continue;
        if (b.subTurrets && b.subTurrets.length > 0) continue;
        if (b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0) continue;
        if (b.inExitPhase && !_exitSubBulletToWebGL(b)) continue;
        if (b.labyLevel > 0 && !b.inExitPhase && b.opacity > 0 && _roundIsUnit(b, _bulletIsGhostly(b, ghostMode, playerId))) continue;

        const alpha = plainRoundAlpha(b.opacity, b._fadeT, b._fadeO0,
            _bulletIsGhostly(b, ghostMode, playerId) ? 0.3 : 1, webgl.alphaIsSpread());

        const mappedColor = _roundFill(b);
        _hexToRGB(mappedColor, _gColor, 0);
        const br = _gColor[0], bg = _gColor[1], bb = _gColor[2];
        const intSides = b.shapeSides >= 3 ? Math.floor(b.shapeSides) : b.shapeSides;
        const _bdLadder = Math.max(_BULLET_DEPTH_START, _BULLET_DEPTH_END - (_geoBulletGlobalSlot++) * _BULLET_DEPTH_STEP);
        const bulletDepth = _geoUnitDepthOn ? _geoUnitDepthBuf[0] : _bdLadder;
        if (indices[i] < _bulletDepthMap.length) _bulletDepthMap[indices[i]] = _bdLadder;

        if (intSides < 3) {
            const half = sz / 2;
            webgl.pushGeomInstance('circle', b.position.x, b.position.y, 0,
                half, half, br, bg, bb, b.damageOverlay, bulletDepth, 1.0, alpha);
        } else if (b.trapDepth > 0) {
            const starKey = webgl.getOrCreateStarBatch(intSides, b.trapDepth, b.trapCurved);
            const half = (sz / 2) * getRealSizeFactor(intSides);
            const triAdj = (intSides === 3) ? _TRI_WEBGL_OFFSET : 0;
            webgl.pushGeomInstance(starKey, b.position.x, b.position.y, b.facingAngle + triAdj,
                half, half, br, bg, bb, b.damageOverlay, bulletDepth, 1.0, alpha);
        } else {
            const half = (sz / 2) * getRealSizeFactor(intSides);
            const batchKey = intSides <= 16 ? POLY_BATCH_KEY[intSides] : 'circle';
            const evenOff = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
            const fracRot = (b.shapeSides % 1) * Math.PI * 2;
            const triAdj = _roundTurn(b.shapeSides, true);
            webgl.pushGeomInstance(batchKey, b.position.x, b.position.y,
                b.facingAngle + evenOff + fracRot + triAdj,
                half, half, br, bg, bb, b.damageOverlay, bulletDepth, 1.0, alpha);
        }

        if (b.labyLevel > 0) {
            const ds = labyDownscale(b.shapeSides);
            if (intSides < 3) {
                for (let li = 1; li <= b.labyLevel; li++) {
                    const layerR = (sz / 2) * Math.pow(ds, li);
                    const _ldLadder = Math.max(_BULLET_DEPTH_START, _BULLET_DEPTH_END - (_geoBulletGlobalSlot++) * _BULLET_DEPTH_STEP);
                    const ld = _geoUnitDepthOn ? _geoUnitDepthBuf[0] : _ldLadder;
                    webgl.pushGeomInstance('circle', b.position.x, b.position.y, 0,
                        layerR, layerR, br, bg, bb, b.damageOverlay, ld, 1.0, alpha);
                }
            } else {
                const outerR = (sz / 2) * getRealSizeFactor(intSides);
                const nestKey = intSides <= 16 ? POLY_BATCH_KEY[intSides] : 'circle';
                const evenOff2 = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
                const triAdj2 = b.trapDepth > 0 ? ((intSides === 3) ? _TRI_WEBGL_OFFSET : 0) : _roundTurn(b.shapeSides, true);
                const mainRot = b.facingAngle + evenOff2 + triAdj2;
                for (let li = 1; li <= b.labyLevel; li++) {
                    const layerR = outerR * Math.pow(ds, li);
                    const layerRot = (li % 2 !== 0) ? mainRot + Math.PI / intSides : mainRot;
                    const _ldLadder = Math.max(_BULLET_DEPTH_START, _BULLET_DEPTH_END - (_geoBulletGlobalSlot++) * _BULLET_DEPTH_STEP);
                    const ld = _geoUnitDepthOn ? _geoUnitDepthBuf[0] : _ldLadder;
                    webgl.pushGeomInstance(nestKey, b.position.x, b.position.y,
                        layerRot, layerR, layerR, br, bg, bb, b.damageOverlay, ld, 1.0, alpha);
                }
            }
        }
    }
}

function _emitLayerRoundBucket(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    ctx: CanvasRenderingContext2D,
    idx: Int32Array, len: number,
    bulletsArr: Bullet[], viewportBounds: ViewportBounds,
    ghostMode: boolean, playerId: string,
    width: number, height: number, logic: GameLogic,
    turrets: Turret[], sorted: Turret[], layers: BodyLayer[], entityIdx: number,
): void {
    webgl.beginGeomFrame();
    webgl.setDepthFunc(false);
    webgl.setDepthMask(false);
    _emitBulletGeometry(webgl, idx, len,
        bulletsArr, viewportBounds, ghostMode, playerId);
    webgl.flushGeom();
    let hasT = false, hasExit = false;
    for (let ci = 0; ci < len; ci++) {
        const cb = bulletsArr[idx[ci]];
        if (cb.inExitPhase && !_exitBulletToWebGL(cb)) { hasExit = true; }
        else if ((cb.subTurrets && cb.subTurrets.length > 0) ||
                 (cb._bulletBodyLayers !== null && cb._bulletBodyLayers.length > 0)) { hasT = true; }
    }
    if (hasT) {
        _geoSubSlotKeep = _geoSubSlot;
        _emit3PhaseTurrettedBullets(webgl, bulletsArr, idx, len,
            viewportBounds, ghostMode, playerId);
        _sortTurrets(turrets);
        _buildTurretLayerFlags(sorted, layers);
        _geoEntityIdx = entityIdx;
        _geoSubSlot = _geoSubSlotKeep;
    }
    _geoSubSlotKeep = _geoSubSlot;
    if (_drawDyingTurrettedBulletsAsUnits(webgl, ctx, bulletsArr, idx, len,
        viewportBounds, ghostMode, playerId, width, height, logic)) {
        _sortTurrets(turrets);
        _buildTurretLayerFlags(sorted, layers);
        _geoEntityIdx = entityIdx;
        _geoSubSlot = _geoSubSlotKeep;
    }
    if (hasExit) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        _compositeWorld(ctx, webgl);
        ctx.restore();
        webgl.clearColorOnly();
        for (let ci = 0; ci < len; ci++) {
            const cb = bulletsArr[idx[ci]];
            if (!cb.inExitPhase || _exitBulletToWebGL(cb)) continue;
            if (!isInViewport(cb.position.x, cb.position.y, _roundCullR(cb), viewportBounds)) continue;
            let cA = cb.opacity / 255;
            if (_bulletIsGhostly(cb, ghostMode, playerId)) cA *= 0.3;
            _drawExitingBullet(ctx, logic, cb, cA);
        }
    }
}

function _emitLayerAboveRounds(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    ctx: CanvasRenderingContext2D,
    layer: BodyLayer,
    bulletsArr: Bullet[], viewportBounds: ViewportBounds,
    ghostMode: boolean, playerId: string,
    width: number, height: number, logic: GameLogic,
    turrets: Turret[], sorted: Turret[], layers: BodyLayer[], entityIdx: number,
): void {
    for (let lbi = 0; lbi < _layerBulletCount; lbi++) {
        if (_layerBulletAbove[lbi] !== 1 || _layerBulletOrder[lbi] !== layer.renderOrder || _layerBulletLen[lbi] === 0) continue;
        if (_layerBulletLid[lbi] !== '' && _layerBulletLid[lbi] !== layer.id) continue;
        _emitLayerRoundBucket(webgl, ctx, _layerBulletIdx[lbi], _layerBulletLen[lbi], bulletsArr, viewportBounds,
            ghostMode, playerId, width, height, logic, turrets, sorted, layers, entityIdx);
    }
}

function _renderMultiLayerEntity(
    webgl: import('../game/WebGLRenderer').WebGLBulletRenderer,
    ctx: CanvasRenderingContext2D,
    entityIdx: number,
    bulletsArr: Bullet[],
    bulletSlot: number,
    isPlayer: boolean,
    viewportBounds: ViewportBounds,
    ghostMode: boolean, playerId: string,
    width: number, height: number,
    logic: GameLogic
): void {
    if (isPlayer) {
        _layerBulletCount = _playerLayerBulletCount;
        _hasLayerBullets = _playerHasLayerBullets;
        for (let ri = 0; ri < _playerLayerBulletCount; ri++) {
            _layerBulletOrder[ri] = _playerLayerBulletOrder[ri];
            _layerBulletLid[ri] = _playerLayerBulletLid[ri];
            _layerBulletAbove[ri] = _playerLayerBulletAbove[ri];
            _layerBulletLen[ri] = _playerLayerBulletLen[ri];
            _layerBulletIdx[ri].set(_playerLayerBulletIdx[ri].subarray(0, _playerLayerBulletLen[ri]));
        }
        _activeBelowLen = _playerMainBelowLen;
        if (_playerMainBelowLen > 0) _activeBelowIdx.set(_playerMainBelowIdx.subarray(0, _playerMainBelowLen));
        _activeAboveLen = _playerMainAboveLen;
        if (_playerMainAboveLen > 0) _activeAboveIdx.set(_playerMainAboveIdx.subarray(0, _playerMainAboveLen));
        _hasActiveAboveBullets = _hasPlayerAboveBullets;
    } else if (bulletSlot >= 0) {
        _subBucketBullets(_perEnemyBulletIdx[bulletSlot], _perEnemyBulletLen[bulletSlot], bulletsArr);
    } else {
        _hasLayerBullets = false;
        _layerBulletCount = 0;
        _activeBelowLen = 0;
        _activeAboveLen = 0;
        _hasActiveAboveBullets = false;
    }

    _geoEntityIdx = entityIdx;
    _geoSubSlot = 0;
    _entityAlpha = _rd.alpha;
    _mlDyingSub = 0;
    _mlLadderCap = Math.floor(0.45 * _bodyRangePerEntity / _FINE_SUB_STEP);

    const sizePx = _rd.sizePx;
    const turrets = _rd.turrets!;
    const sorted = _sortTurrets(turrets);
    _buildTurretLayerFlags(sorted, _rd.bodyLayers);

    const bodyColor = bodyFill(_rd.color, _rd.colorMap);
    _hexToRGB(bodyColor, _gColor, 0);
    const bodyR = _gColor[0], bodyG = _gColor[1], bodyB = _gColor[2];
    const dmg = _rd.damageOverlay;
    const entityX = _rd.posX, entityY = _rd.posY;
    const bodyAngle = _rd.bodyAngle, aimAngle = _rd.aimAngle;
    const isTestMode = _rd.isTestMode;

    _hexToRGB(turretGrey(), _gColor, 0);
    _turretGreyR = _gColor[0]; _turretGreyG = _gColor[1]; _turretGreyB = _gColor[2];

    const layers = _rd.bodyLayers!;
    _bodyLayerSortBuf.length = layers.length;
    for (let i = 0; i < layers.length; i++) _bodyLayerSortBuf[i] = layers[i];
    if (layers.length > 1) _bodyLayerSortBuf.sort(_bodyLayerCmp);

    webgl.clearColorOnly();
    webgl.setDepthMask(false);
    for (let li = 0; li < _bodyLayerSortBuf.length; li++) {
        const layer = _bodyLayerSortBuf[li];
        if (layer.renderOrder < 0) continue;

        const layerSizePx = sizePx * layer.sizeRatio;
        const layerColor = _layerFill(layer);
        _hexToRGB(layerColor, _gColor, 0);
        let lr = _gColor[0], lg = _gColor[1], lb = _gColor[2];
        if (_isDarkMode && layer.intangible) { lr = 0; lg = 0; lb = 0; }

        const effectiveAngle = layer.stationary ? -bodyAngle : layer._currentAngle;
        const layerWorldAngle = bodyAngle + effectiveAngle;
        const layerSideCorr = computeSideCorr(layer.sides, _rd.sides);
        const barrelEffSizePx = layerSizePx;
        if (_hasLayerBullets) {
            for (let lbi = 0; lbi < _layerBulletCount; lbi++) {
                if (_layerBulletAbove[lbi] === 0 && _layerBulletOrder[lbi] === layer.renderOrder && _layerBulletLen[lbi] > 0 && (_layerBulletLid[lbi] === '' || _layerBulletLid[lbi] === layer.id)) {
                    _emitLayerRoundBucket(webgl, ctx, _layerBulletIdx[lbi], _layerBulletLen[lbi], bulletsArr, viewportBounds,
                        ghostMode, playerId, width, height, logic, turrets, sorted, layers, entityIdx);
                    break;
                }
            }
        }

        let _hasBelow = false;
        for (let ti = 0; ti < sorted.length; ti++) {
            if (!sorted[ti].aboveTankBody && _turretLayerRef[ti] === layer) { _hasBelow = true; break; }
        }
        if (_hasBelow) {
            _prevRL = -129; _rlHasGeom = false;
            webgl.beginGeomFrame();
            webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
            webgl.setDepthMask(false);
            for (let ti = 0; ti < sorted.length; ti++) {
                if (sorted[ti].aboveTankBody || _turretLayerRef[ti] !== layer) continue;
                const rl = sorted[ti].renderLayer ?? 0;
                if (rl !== _prevRL && _rlHasGeom) {
                    webgl.flushGeom();
                    webgl.beginGeomFrame();
                    webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
                    webgl.setDepthMask(false);
                }
                _prevRL = rl; _rlHasGeom = true;
                const t = sorted[ti];
                if (t.turretType === 'auto') {
                    _geoEmitAutoTurret(webgl, t, entityX, entityY, layerWorldAngle, aimAngle, layerSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, bodyR, bodyG, bodyB);
                } else {
                    _geoEmitBarrel(webgl, t, entityX, entityY, layerWorldAngle, layerWorldAngle, barrelEffSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, false);
                }
            }
            if (_rlHasGeom) webgl.flushGeom();
        }

        if (!_rd.showTurretsOnly) {
            webgl.beginGeomFrame();
            webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
            webgl.setDepthMask(false);
            const layerHalf = layerSizePx / 2;
            const layerInitAngle = layer.initialAngle || 0;
            const _loKey = layerOutlineOf(layer) !== null ? webgl.outlineLayerBatchKey(layer.outline!) : '';
            if (_loKey !== '') {
                const _loN = layer.copies > 1 ? layer.copies : 1;
                for (let c = 0; c < _loN; c++) _geoEmit(webgl, _loKey, entityX, entityY, layerWorldAngle + layerInitAngle + (Math.PI * 2 * c) / _loN, layerHalf, layerHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            } else if (layer.sides < 3) {
                _geoEmit(webgl, 'circle', entityX, entityY, layerWorldAngle, layerHalf, layerHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            } else if (layer.copies > 1) {
                const visualHalf = layerHalf * getRealSizeFactor(layer.sides);
                const batchKey = layer.starDepth > 0
                    ? webgl.getOrCreateStarBatch(layer.sides, layer.starDepth, layer.starCurved)
                    : (layer.sides <= 16 ? POLY_BATCH_KEY[layer.sides] : 'circle');
                for (let c = 0; c < layer.copies; c++) {
                    const copyRot = layerWorldAngle + (Math.PI * 2 * c) / layer.copies + layerInitAngle;
                    _geoEmit(webgl, batchKey, entityX, entityY, copyRot, visualHalf, visualHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
                }
            } else if (layer.starDepth > 0) {
                const visualHalf = layerHalf * getRealSizeFactor(layer.sides);
                const starKey = webgl.getOrCreateStarBatch(layer.sides, layer.starDepth, layer.starCurved);
                _geoEmit(webgl, starKey, entityX, entityY, layerWorldAngle + layerInitAngle, visualHalf, visualHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            } else {
                const visualHalf = layerHalf * getRealSizeFactor(layer.sides);
                const batchKey = layer.sides <= 16 ? POLY_BATCH_KEY[layer.sides] : 'circle';
                _geoEmit(webgl, batchKey, entityX, entityY, layerWorldAngle + layerInitAngle, visualHalf, visualHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            }
            if (layer.showHealerCross) {
                const crossR = _HEALER_CROSS_SCALE * layerSizePx;
                _hexToRGB(healerCrossFill(), _gColor, 0);
                _geoEmit(webgl, 'healer_cross', entityX, entityY, layerWorldAngle + layerInitAngle,
                    crossR, crossR, _gColor[0], _gColor[1], _gColor[2], dmg, 1.0, _entityAlpha);
            }
            webgl.flushGeom();
        }

        if (_hasLayerBullets) _emitLayerAboveRounds(webgl, ctx, layer, bulletsArr, viewportBounds,
            ghostMode, playerId, width, height, logic, turrets, sorted, layers, entityIdx);

        let _hasAbove = false;
        for (let ti = 0; ti < sorted.length; ti++) {
            if (sorted[ti].aboveTankBody && _turretLayerRef[ti] === layer) { _hasAbove = true; break; }
        }
        if (_hasAbove) {
            _prevRL = -129; _rlHasGeom = false;
            webgl.beginGeomFrame();
            webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
            webgl.setDepthMask(false);
            for (let ti = 0; ti < sorted.length; ti++) {
                if (!sorted[ti].aboveTankBody || _turretLayerRef[ti] !== layer) continue;
                const rl = sorted[ti].renderLayer ?? 0;
                if (rl !== _prevRL && _rlHasGeom) {
                    webgl.flushGeom();
                    webgl.beginGeomFrame();
                    webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
                    webgl.setDepthMask(false);
                }
                _prevRL = rl; _rlHasGeom = true;
                const t = sorted[ti];
                if (t.turretType === 'auto') {
                    _geoEmitAutoTurret(webgl, t, entityX, entityY, layerWorldAngle, aimAngle, layerSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, bodyR, bodyG, bodyB);
                } else {
                    _geoEmitBarrel(webgl, t, entityX, entityY, layerWorldAngle, layerWorldAngle, barrelEffSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, false);
                }
            }
            if (_rlHasGeom) webgl.flushGeom();
        }
    }

    if (_activeBelowLen > 0) {
        webgl.beginGeomFrame();
        webgl.setDepthFunc(false);
        webgl.setDepthMask(false);
        _emitBulletGeometry(webgl, _activeBelowIdx, _activeBelowLen,
            bulletsArr, viewportBounds, ghostMode, playerId);
        webgl.flushGeom();
        let _mbHasT = false, _mbHasExit = false;
        for (let _ci = 0; _ci < _activeBelowLen; _ci++) {
            const _cb = bulletsArr[_activeBelowIdx[_ci]];
            if (_cb.inExitPhase && !_exitBulletToWebGL(_cb)) { _mbHasExit = true; }
            else if ((_cb.subTurrets && _cb.subTurrets.length > 0) ||
                     (_cb._bulletBodyLayers !== null && _cb._bulletBodyLayers.length > 0)) { _mbHasT = true; }
        }
        if (_mbHasT) {
            _geoSubSlotKeep = _geoSubSlot;
            _emit3PhaseTurrettedBullets(webgl, bulletsArr, _activeBelowIdx, _activeBelowLen,
                viewportBounds, ghostMode, playerId);
            _sortTurrets(turrets);
            _buildTurretLayerFlags(sorted, layers);
            _geoEntityIdx = entityIdx;
            _geoSubSlot = _geoSubSlotKeep;
        }
        _geoSubSlotKeep = _geoSubSlot;
        if (_drawDyingTurrettedBulletsAsUnits(webgl, ctx, bulletsArr, _activeBelowIdx, _activeBelowLen,
            viewportBounds, ghostMode, playerId, width, height, logic)) {
            _sortTurrets(turrets);
            _buildTurretLayerFlags(sorted, layers);
            _geoEntityIdx = entityIdx;
            _geoSubSlot = _geoSubSlotKeep;
        }
        if (_mbHasExit) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            _compositeWorld(ctx, webgl);
            ctx.restore();
            webgl.clearColorOnly();
            for (let _ci = 0; _ci < _activeBelowLen; _ci++) {
                const _cb = bulletsArr[_activeBelowIdx[_ci]];
                if (!_cb.inExitPhase || _exitBulletToWebGL(_cb)) continue;
                if (!isInViewport(_cb.position.x, _cb.position.y, _roundCullR(_cb), viewportBounds)) continue;
                let _cA = _cb.opacity / 255;
                if (_bulletIsGhostly(_cb, ghostMode, playerId)) _cA *= 0.3;
                _drawExitingBullet(ctx, logic, _cb, _cA);
            }
        }
    }

    let _hasMainBelow = false;
    for (let i = 0; i < sorted.length; i++) {
        if (!sorted[i].aboveTankBody && !_turretOnLayerFlags[i]) { _hasMainBelow = true; break; }
    }
    if (_hasMainBelow) {
        _prevRL = -129; _rlHasGeom = false;
        webgl.beginGeomFrame();
        webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
        webgl.setDepthMask(false);
        for (let i = 0; i < sorted.length; i++) {
            if (!sorted[i].aboveTankBody && !_turretOnLayerFlags[i]) {
                const rl = sorted[i].renderLayer ?? 0;
                if (rl !== _prevRL && _rlHasGeom) {
                    webgl.flushGeom();
                    webgl.beginGeomFrame();
                    webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
                    webgl.setDepthMask(false);
                }
                _prevRL = rl; _rlHasGeom = true;
                const t = sorted[i];
                if (t.turretType === 'auto') {
                    _geoEmitAutoTurret(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, bodyR, bodyG, bodyB);
                } else {
                    _geoEmitBarrel(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, false);
                }
            }
        }
        if (_rlHasGeom) webgl.flushGeom();
    }

    if (!_rd.showTurretsOnly) {
        webgl.beginGeomFrame();
        webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
        webgl.setDepthMask(false);
        const intSides = Math.floor(_rd.sides);
        const fracRotation = (_rd.sides % 1) * Math.PI * 2;
        const baseSpin = _rd.baseBodyAngle || 0;
        if (intSides < 3) {
            const half = sizePx / 2;
            _geoEmit(webgl, 'circle', entityX, entityY, bodyAngle + baseSpin, half, half, bodyR, bodyG, bodyB, dmg, 1.0, _entityAlpha);
        } else {
            const visualHalf = (sizePx / 2) * getRealSizeFactor(intSides);
            const evenOff = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
            const polyRot = bodyAngle + evenOff + fracRotation + baseSpin;
            const batchKey = (_rd.shapeDepth > 0)
                ? webgl.getOrCreateStarBatch(intSides, _rd.shapeDepth, _rd.shapeCurved)
                : (intSides <= 16 ? POLY_BATCH_KEY[intSides] : 'circle');
            _geoEmit(webgl, batchKey, entityX, entityY, polyRot, visualHalf, visualHalf, bodyR, bodyG, bodyB, dmg, 1.0, _entityAlpha);
        }
        if (_rd.isHealer) {
            const crossR = _HEALER_CROSS_SCALE * sizePx;
            _hexToRGB(healerCrossFill(), _gColor, 0);
            _geoEmit(webgl, 'healer_cross', entityX, entityY, bodyAngle + ((_rd.baseBodyAngle) || 0),
                crossR, crossR, _gColor[0], _gColor[1], _gColor[2], dmg, 1.0, _entityAlpha);
        }
        webgl.flushGeom();
    }

    if (_hasActiveAboveBullets && _activeAboveLen > 0) {
        webgl.beginGeomFrame();
        webgl.setDepthFunc(false);
        webgl.setDepthMask(false);
        _emitBulletGeometry(webgl, _activeAboveIdx, _activeAboveLen,
            bulletsArr, viewportBounds, ghostMode, playerId);
        webgl.flushGeom();
        let _maHasT = false, _maHasExit = false;
        for (let _ci = 0; _ci < _activeAboveLen; _ci++) {
            const _cb = bulletsArr[_activeAboveIdx[_ci]];
            if (_cb.inExitPhase && !_exitBulletToWebGL(_cb)) { _maHasExit = true; }
            else if ((_cb.subTurrets && _cb.subTurrets.length > 0) ||
                     (_cb._bulletBodyLayers !== null && _cb._bulletBodyLayers.length > 0)) { _maHasT = true; }
        }
        if (_maHasT) {
            _geoSubSlotKeep = _geoSubSlot;
            _emit3PhaseTurrettedBullets(webgl, bulletsArr, _activeAboveIdx, _activeAboveLen,
                viewportBounds, ghostMode, playerId);
            _sortTurrets(turrets);
            _buildTurretLayerFlags(sorted, layers);
            _geoEntityIdx = entityIdx;
            _geoSubSlot = _geoSubSlotKeep;
        }
        _geoSubSlotKeep = _geoSubSlot;
        if (_drawDyingTurrettedBulletsAsUnits(webgl, ctx, bulletsArr, _activeAboveIdx, _activeAboveLen,
            viewportBounds, ghostMode, playerId, width, height, logic)) {
            _sortTurrets(turrets);
            _buildTurretLayerFlags(sorted, layers);
            _geoEntityIdx = entityIdx;
            _geoSubSlot = _geoSubSlotKeep;
        }
        if (_maHasExit) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            _compositeWorld(ctx, webgl);
            ctx.restore();
            webgl.clearColorOnly();
            for (let _ci = 0; _ci < _activeAboveLen; _ci++) {
                const _cb = bulletsArr[_activeAboveIdx[_ci]];
                if (!_cb.inExitPhase || _exitBulletToWebGL(_cb)) continue;
                if (!isInViewport(_cb.position.x, _cb.position.y, _roundCullR(_cb), viewportBounds)) continue;
                let _cA = _cb.opacity / 255;
                if (_bulletIsGhostly(_cb, ghostMode, playerId)) _cA *= 0.3;
                _drawExitingBullet(ctx, logic, _cb, _cA);
            }
        }
    }

    {
        _prevRL = -129; _rlHasGeom = false;
        webgl.beginGeomFrame();
        webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
        webgl.setDepthMask(false);
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].aboveTankBody && !_turretOnLayerFlags[i]) {
                const rl = sorted[i].renderLayer ?? 0;
                if (rl !== _prevRL && _rlHasGeom) {
                    webgl.flushGeom();
                    webgl.beginGeomFrame();
                    webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
                    webgl.setDepthMask(false);
                }
                _prevRL = rl; _rlHasGeom = true;
                const t = sorted[i];
                if (t.turretType === 'auto') {
                    _geoEmitAutoTurret(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, bodyR, bodyG, bodyB);
                } else {
                    _geoEmitBarrel(webgl, t, entityX, entityY, bodyAngle, aimAngle, sizePx, dmg, isTestMode, 0, 1.0, sizePx, 1.0, false);
                }
            }
        }
        if (_rlHasGeom) webgl.flushGeom();
    }

    for (let li = 0; li < _bodyLayerSortBuf.length; li++) {
        const layer = _bodyLayerSortBuf[li];
        if (layer.renderOrder >= 0) continue;

        const layerSizePx = sizePx * layer.sizeRatio;
        const layerColor = _layerFill(layer);
        _hexToRGB(layerColor, _gColor, 0);
        let lr = _gColor[0], lg = _gColor[1], lb = _gColor[2];
        if (_isDarkMode && layer.intangible) { lr = 0; lg = 0; lb = 0; }

        const effectiveAngle = layer.stationary ? -bodyAngle : layer._currentAngle;
        const layerWorldAngle = bodyAngle + effectiveAngle;
        const layerSideCorr = computeSideCorr(layer.sides, _rd.sides);
        const barrelEffSizePx = layerSizePx;
        if (_hasLayerBullets) {
            for (let lbi = 0; lbi < _layerBulletCount; lbi++) {
                if (_layerBulletAbove[lbi] === 0 && _layerBulletOrder[lbi] === layer.renderOrder && _layerBulletLen[lbi] > 0 && (_layerBulletLid[lbi] === '' || _layerBulletLid[lbi] === layer.id)) {
                    _emitLayerRoundBucket(webgl, ctx, _layerBulletIdx[lbi], _layerBulletLen[lbi], bulletsArr, viewportBounds,
                        ghostMode, playerId, width, height, logic, turrets, sorted, layers, entityIdx);
                    break;
                }
            }
        }

        let _hasBelow2 = false;
        for (let ti = 0; ti < sorted.length; ti++) {
            if (!sorted[ti].aboveTankBody && _turretLayerRef[ti] === layer) { _hasBelow2 = true; break; }
        }
        if (_hasBelow2) {
            _prevRL = -129; _rlHasGeom = false;
            webgl.beginGeomFrame();
            webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
            webgl.setDepthMask(false);
            for (let ti = 0; ti < sorted.length; ti++) {
                if (sorted[ti].aboveTankBody || _turretLayerRef[ti] !== layer) continue;
                const rl = sorted[ti].renderLayer ?? 0;
                if (rl !== _prevRL && _rlHasGeom) {
                    webgl.flushGeom();
                    webgl.beginGeomFrame();
                    webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
                    webgl.setDepthMask(false);
                }
                _prevRL = rl; _rlHasGeom = true;
                const t = sorted[ti];
                if (t.turretType === 'auto') {
                    _geoEmitAutoTurret(webgl, t, entityX, entityY, layerWorldAngle, aimAngle, layerSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, bodyR, bodyG, bodyB);
                } else {
                    _geoEmitBarrel(webgl, t, entityX, entityY, layerWorldAngle, layerWorldAngle, barrelEffSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, false);
                }
            }
            if (_rlHasGeom) webgl.flushGeom();
        }

        if (!_rd.showTurretsOnly) {
            webgl.beginGeomFrame();
            webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
            webgl.setDepthMask(false);
            const layerHalf = layerSizePx / 2;
            const layerInitAngle = layer.initialAngle || 0;
            const _loKey = layerOutlineOf(layer) !== null ? webgl.outlineLayerBatchKey(layer.outline!) : '';
            if (_loKey !== '') {
                const _loN = layer.copies > 1 ? layer.copies : 1;
                for (let c = 0; c < _loN; c++) _geoEmit(webgl, _loKey, entityX, entityY, layerWorldAngle + layerInitAngle + (Math.PI * 2 * c) / _loN, layerHalf, layerHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            } else if (layer.sides < 3) {
                _geoEmit(webgl, 'circle', entityX, entityY, layerWorldAngle, layerHalf, layerHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            } else if (layer.copies > 1) {
                const visualHalf = layerHalf * getRealSizeFactor(layer.sides);
                const batchKey = layer.starDepth > 0
                    ? webgl.getOrCreateStarBatch(layer.sides, layer.starDepth, layer.starCurved)
                    : (layer.sides <= 16 ? POLY_BATCH_KEY[layer.sides] : 'circle');
                for (let c = 0; c < layer.copies; c++) {
                    const copyRot = layerWorldAngle + (Math.PI * 2 * c) / layer.copies + layerInitAngle;
                    _geoEmit(webgl, batchKey, entityX, entityY, copyRot, visualHalf, visualHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
                }
            } else if (layer.starDepth > 0) {
                const visualHalf = layerHalf * getRealSizeFactor(layer.sides);
                const starKey = webgl.getOrCreateStarBatch(layer.sides, layer.starDepth, layer.starCurved);
                _geoEmit(webgl, starKey, entityX, entityY, layerWorldAngle + layerInitAngle, visualHalf, visualHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            } else {
                const visualHalf = layerHalf * getRealSizeFactor(layer.sides);
                const batchKey = layer.sides <= 16 ? POLY_BATCH_KEY[layer.sides] : 'circle';
                _geoEmit(webgl, batchKey, entityX, entityY, layerWorldAngle + layerInitAngle, visualHalf, visualHalf, lr, lg, lb, dmg, 1.0, _entityAlpha);
            }
            if (layer.showHealerCross) {
                const crossR = _HEALER_CROSS_SCALE * layerSizePx;
                _hexToRGB(healerCrossFill(), _gColor, 0);
                _geoEmit(webgl, 'healer_cross', entityX, entityY, layerWorldAngle + layerInitAngle,
                    crossR, crossR, _gColor[0], _gColor[1], _gColor[2], dmg, 1.0, _entityAlpha);
            }
            webgl.flushGeom();
        }

        if (_hasLayerBullets) _emitLayerAboveRounds(webgl, ctx, layer, bulletsArr, viewportBounds,
            ghostMode, playerId, width, height, logic, turrets, sorted, layers, entityIdx);

        let _hasAbove2 = false;
        for (let ti = 0; ti < sorted.length; ti++) {
            if (sorted[ti].aboveTankBody && _turretLayerRef[ti] === layer) { _hasAbove2 = true; break; }
        }
        if (_hasAbove2) {
            _prevRL = -129; _rlHasGeom = false;
            webgl.beginGeomFrame();
            webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
            webgl.setDepthMask(false);
            for (let ti = 0; ti < sorted.length; ti++) {
                if (!sorted[ti].aboveTankBody || _turretLayerRef[ti] !== layer) continue;
                const rl = sorted[ti].renderLayer ?? 0;
                if (rl !== _prevRL && _rlHasGeom) {
                    webgl.flushGeom();
                    webgl.beginGeomFrame();
                    webgl.setDepthFunc(ML_ENTITY_UNIT_DEPTH ? false : true);
                    webgl.setDepthMask(false);
                }
                _prevRL = rl; _rlHasGeom = true;
                const t = sorted[ti];
                if (t.turretType === 'auto') {
                    _geoEmitAutoTurret(webgl, t, entityX, entityY, layerWorldAngle, aimAngle, layerSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, bodyR, bodyG, bodyB);
                } else {
                    _geoEmitBarrel(webgl, t, entityX, entityY, layerWorldAngle, layerWorldAngle, barrelEffSizePx, dmg, isTestMode, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0, false);
                }
            }
            if (_rlHasGeom) webgl.flushGeom();
        }
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    _compositeWorld(ctx, webgl);
    ctx.restore();
    _restoreCameraTransform(ctx, logic, width, height);
}

const _WGL_MAX_ATLAS_ENTRY = 512;

const _bodyWorldSize: Record<string, number> = {};


function _ensureBodyInAtlas(
    webgl: WebGLBulletRenderer,
    sides: number,
    color: string,
    isHealer: boolean,
    sizePx: number,
    starDepth: number = 0,
    copies: number = 1,
    starCurved: boolean = false
): string {
    const strokeColor = darkenColor(color, 0.598);
    const keySize = Math.round(sizePx * 10);
    const key = `body_${Math.floor(sides)}_${color}_${isHealer ? 1 : 0}_${starDepth}_${copies}_${starCurved ? 1 : 0}_${keySize}_${_currentCacheScale}`;
    if (webgl.hasAtlasEntry(key)) return key;

    const worldSize = sizePx + 2 * FIXED_STROKE_WIDTH + 2;
    const ppw = _currentCacheScale;
    const atlasPx = Math.max(32, Math.min(_WGL_MAX_ATLAS_ENTRY, Math.ceil(worldSize * ppw)));
    const eppw = atlasPx / worldSize;
    const bodyRadiusPx = (sizePx / 2) * eppw;
    const strokePx = Math.max(1, Math.round(FIXED_STROKE_WIDTH * eppw));

    _bodyWorldSize[key] = worldSize;

    webgl.prerenderShape(key, (ctx, size) => {
        const half = size / 2;
        ctx.translate(half, half);
        ctx.lineJoin = 'round';
        const intSides = Math.floor(sides);
        if (intSides < 3) {
            ctx.beginPath();
            ctx.arc(0, 0, bodyRadiusPx, 0, Math.PI * 2);
            ctx.closePath();
        } else {
            const fracRot = (sides % 1) * Math.PI * 2;
            const visualHalf = bodyRadiusPx * getRealSizeFactor(intSides);
            const evenOff = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
            ctx.beginPath();
            if (copies > 1) {
                _strokeFillPolygonCopies(ctx as any, intSides, copies, visualHalf, evenOff + fracRot,
                    strokeColor, strokePx, color, starDepth, starCurved);
                ctx.beginPath();
            } else if (starDepth > 0) {
                const innerR = visualHalf * (1 - starDepth);
                roundedStarPath(ctx as any, intSides, visualHalf, innerR, evenOff + fracRot, starCurved);
            } else {
                roundedPolygonPath(ctx as any, intSides, visualHalf, evenOff + fracRot);
            }
        }
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokePx;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fill();
        if (isHealer) {
            const r = _HEALER_CROSS_SCALE * (bodyRadiusPx * 2);
            ctx.beginPath();
            ctx.moveTo(_HEALER_CROSS_X[0] * r, _HEALER_CROSS_Y[0] * r);
            for (let i = 1; i < 12; i++) ctx.lineTo(_HEALER_CROSS_X[i] * r, _HEALER_CROSS_Y[i] * r);
            ctx.closePath();
            ctx.fillStyle = healerCrossFill();
            ctx.strokeStyle = darkenColor(healerCrossFill(), 0.598);
            ctx.lineWidth = strokePx;
            ctx.stroke();
            ctx.fill();
        }
    }, atlasPx);
    return key;
}




function _teamColor(index: number): string {
  return _isDarkMode ? TEAM_COLORS_DARK[index] : TEAM_COLORS_LIGHT[index];
}
function _layerTeamFillOf(index: number): string {
  return index >= 0 ? _teamColor(index) : '';
}

let _mdDragging = false;
let _mdDragStartX = 0;
let _mdDragStartY = 0;
let _mdCamStartX = 0;
let _mdCamStartY = 0;

const _enemyIdToSlot = new Map<string, number>();
let _enemySlotCount = 0;
let _perEnemyBulletIdx: Int32Array[] = [];
let _perEnemyBulletLen = new Int32Array(64);
for (let _esi = 0; _esi < 64; _esi++) _perEnemyBulletIdx.push(new Int32Array(64));

let _orphanEnemyBulletIdx = new Int32Array(64);
let _orphanEnemyBulletLen = 0;
let _fadingBulletIdx = new Int32Array(64);
let _fadingBulletLen = 0;

let _wallIgnoreBulletIdx = new Int32Array(64);
let _wallIgnoreBulletLen = 0;
const _MAX_WALL_IGNORE_ENTITIES = 64;
let _wallIgnoreIsPlayer = new Uint8Array(_MAX_WALL_IGNORE_ENTITIES);
let _wallIgnoreEnemyRef: (EnemyTank | null)[] = new Array(_MAX_WALL_IGNORE_ENTITIES).fill(null);
let _wallIgnoreCount = 0;
function _wallIgnoreRoom(): void {
    if (_wallIgnoreCount < _wallIgnoreIsPlayer.length) return;
    const n = _wallIgnoreIsPlayer.length * 2;
    const p = new Uint8Array(n); p.set(_wallIgnoreIsPlayer); _wallIgnoreIsPlayer = p;
    const r: (EnemyTank | null)[] = new Array(n).fill(null);
    for (let i = 0; i < _wallIgnoreEnemyRef.length; i++) r[i] = _wallIgnoreEnemyRef[i];
    _wallIgnoreEnemyRef = r;
}

let _playerMainBelowIdx = new Int32Array(64);
let _playerMainBelowLen = 0;
let _playerMainAboveIdx = new Int32Array(64);
let _playerMainAboveLen = 0;
let _hasPlayerAboveBullets = false;

let _activeBelowIdx = new Int32Array(64);
let _activeBelowLen = 0;
let _activeAboveIdx = new Int32Array(64);
let _activeAboveLen = 0;
let _hasActiveAboveBullets = false;

let _playerAllIdx = new Int32Array(64);
let _playerAllLen = 0;

const _MAX_LAYER_BUCKETS = 24;
let _layerBulletIdx: Int32Array[] = [];
let _layerBulletLen = new Int32Array(_MAX_LAYER_BUCKETS);
let _layerBulletOrder = new Float64Array(_MAX_LAYER_BUCKETS);
const _layerBulletLid: string[] = new Array(_MAX_LAYER_BUCKETS).fill('');
const _layerBulletAbove = new Uint8Array(_MAX_LAYER_BUCKETS);
let _layerBulletCount = 0;
let _hasLayerBullets = false;

for (let _lbi = 0; _lbi < _MAX_LAYER_BUCKETS; _lbi++) {
    _layerBulletIdx.push(new Int32Array(64));
}

let _playerLayerBulletIdx: Int32Array[] = [];
let _playerLayerBulletLen = new Int32Array(_MAX_LAYER_BUCKETS);
let _playerLayerBulletOrder = new Float64Array(_MAX_LAYER_BUCKETS);
const _playerLayerBulletLid: string[] = new Array(_MAX_LAYER_BUCKETS).fill('');
const _playerLayerBulletAbove = new Uint8Array(_MAX_LAYER_BUCKETS);
let _playerLayerBulletCount = 0;
let _playerHasLayerBullets = false;
for (let _plbi = 0; _plbi < _MAX_LAYER_BUCKETS; _plbi++) {
    _playerLayerBulletIdx.push(new Int32Array(64));
}

let _layerBulletRender = {
    enabled: false,
    logic: null as GameLogic | null,
    webgl: null as any,
    useWebGL: false,
    viewportBounds: null as any,
    bulletStrokeWidth: 0,
    width: 0,
    height: 0,
    camOffX: 0,
    camOffY: 0,
    bulletsArr: null as Bullet[] | null,
};

const _MAX_GEN = MAX_ROUND_LAYERS - 1;
function _bulletSortKey(b: Bullet): number {
    let typeKey: number;
    switch (b.projectileVisual) {
        case 'swarm':     typeKey = 1; break;
        case 'trap':      typeKey = 2; break;
        case 'drone':
        case 'minion':
        case 'hive':      typeKey = 3; break;
        default:          typeKey = 0; break;
    }
    const gen = b.generation < _MAX_GEN ? b.generation : _MAX_GEN;
    return (_MAX_GEN - gen) * 4 + typeKey;
}

function _roundAboveItsLayer(b: Bullet): boolean {
    return LAYER_ROUNDS_ABOVE !== 0 && b.aboveBody && ((b.sourceLayerId || '') !== '' || b.sourceLayerOrder >= 0);
}

function _subBucketBullets(
    srcIdx: Int32Array,
    srcLen: number,
    bullets: Bullet[],
): void {
    _layerBulletCount = 0;
    _hasLayerBullets = false;
    _activeBelowLen = 0;
    _activeAboveLen = 0;
    _hasActiveAboveBullets = false;

    for (let i = 0; i < srcLen; i++) {
        const bi = srcIdx[i];
        const b = bullets[bi];

        const _bAbove = _roundAboveItsLayer(b) ? 1 : 0;
        if (b.sourceLayerOrder >= 0 || _bAbove === 1) {
            _hasLayerBullets = true;
            let found = -1;
            const _blid = b.sourceLayerId || '';
            for (let lk = 0; lk < _layerBulletCount; lk++) {
                if (_layerBulletOrder[lk] === b.sourceLayerOrder && _layerBulletLid[lk] === _blid && _layerBulletAbove[lk] === _bAbove) { found = lk; break; }
            }
            if (found < 0 && _layerBulletCount >= _MAX_LAYER_BUCKETS) {
                if (b.aboveBody) { _activeAboveIdx[_activeAboveLen++] = bi; _hasActiveAboveBullets = true; }
                else _activeBelowIdx[_activeBelowLen++] = bi;
                continue;
            }
            if (found < 0) {
                found = _layerBulletCount++;
                _layerBulletOrder[found] = b.sourceLayerOrder;
                _layerBulletLid[found] = _blid;
                _layerBulletAbove[found] = _bAbove;
                _layerBulletLen[found] = 0;
            }
            _layerBulletIdx[found][_layerBulletLen[found]++] = bi;
        } else if (b.aboveBody) {
            _activeAboveIdx[_activeAboveLen++] = bi;
            _hasActiveAboveBullets = true;
        } else {
            _activeBelowIdx[_activeBelowLen++] = bi;
        }
    }
}

function _renderLayerBulletsForOrder(
    ctx: CanvasRenderingContext2D,
    layerOrder: number,
    layerId: string = '',
    above: number = 0,
): void {
    const s = _layerBulletRender;
    if (!s.enabled || !s.logic || !s.bulletsArr) return;

    for (let bi = 0; bi < _layerBulletCount; bi++) {
        if (_layerBulletAbove[bi] !== above) continue;
        if (_layerBulletOrder[bi] !== layerOrder) continue;
        if (layerId !== '' && _layerBulletLid[bi] !== '' && _layerBulletLid[bi] !== layerId) continue;
        if (_layerBulletLen[bi] === 0) continue;

        ctx.save();
        if (s.logic.state.isTestMode) {
            ctx.setTransform(
                s.logic.zoom, 0, 0, s.logic.zoom,
                s.width / 2 - s.logic.cameraX * s.logic.zoom,
                s.height / 2 - s.logic.cameraY * s.logic.zoom
            );
        } else {
            ctx.setTransform(
                s.logic.zoom, 0, 0, s.logic.zoom,
                s.width / 2 - s.logic.cameraX * s.logic.zoom,
                s.height / 2 - s.logic.cameraY * s.logic.zoom
            );
        }

        _renderBulletBatch(
            ctx, s.logic, s.webgl, s.useWebGL,
            _layerBulletIdx[bi], _layerBulletLen[bi],
            s.bulletsArr, s.viewportBounds, s.bulletStrokeWidth,
            s.width, s.height, s.camOffX, s.camOffY
        );

        ctx.restore();
    }
}

function playerRenderSizePx(logic: GameLogic): number {
  return tankSizeFromSlider(logic.state.tankSize) * logic.state.playerGrowthScale;
}

function _layerReach(bl: { sides: number; outline?: [number, number][] }): number {
  if (SMALL_FIX.G728 !== 0) {
    const o = layerOutlineOf(bl);
    if (o !== null) { let m = 0; for (let i = 0; i < o.length; i++) { const d = o[i][0] * o[i][0] + o[i][1] * o[i][1]; if (d > m) m = d; } return Math.sqrt(m); }
  }
  return getRealSizeFactor(bl.sides);
}
function playerBodyRadiusPx(logic: GameLogic): number {
  const entityRadius = playerRenderSizePx(logic) / 2;
  let visualRadius = entityRadius * getRealSizeFactor(logic.state.tankSides);
  for (let _li = 0; _li < logic.state.bodyLayers.length; _li++) {
    const _bl = logic.state.bodyLayers[_li];
    const _lr = entityRadius * _bl.sizeRatio * _layerReach(_bl);
    if (_lr > visualRadius) visualRadius = _lr;
  }
  return visualRadius;
}

const SPAWN_FADE_IN: boolean = false;

function _playerShownAlpha(logic: GameLogic): number {
  if (!logic.state.invisibleEnabled) return 1.0;
  const a = logic.state.tankInvisAlpha, m = logic as unknown as CarryMarked;
  if (m._carryKey === undefined) return a;
  const f = carryFloor(m, CARRY_PLAYER_KEY, logic.gameNow());
  return f > a ? f : a;
}
function _carryNow(o: object, logic: GameLogic): number {
  return (o as CarryMarked)._carryKey !== undefined ? logic.gameNow() : NaN;
}

function fillPlayerRenderData(logic: GameLogic) {
  _rd.posX = logic.tankPos.x;
  _rd.posY = logic.tankPos.y;
  _rd.bodyAngle = logic.tankAngle;
  _rd.aimAngle = logic.tankAngle;
  _rd.turrets = logic.state.turrets;
  _rd.sizePx = playerRenderSizePx(logic);
  _rd.sides = logic.state.tankSides;
  _rd.shapeDepth = logic.state.tankShapeDepth ?? 0;
  _rd.shapeCurved = logic.state.tankShapeCurved ?? false;
  const _pci = logic.playerBodyColorTeamIndex();
  if (logic.admin.colorsOn && logic.admin.playerSlot() >= 0) {
    _rd.color = bodyFill('', logic.admin.playerSlot()); _rd.colorMap = CM_FREE;
    _rd.teamColorOverride = true;
  } else if (logic.mevPlayerColour >= 0) {
    _rd.color = bodyFill('', logic.mevPlayerColour); _rd.colorMap = CM_FREE;
    _rd.teamColorOverride = true;
  } else if (_pci >= 0) {
    _rd.color = _teamColor(_pci); _rd.colorMap = CM_FREE;
    _rd.teamColorOverride = true;
  } else {
    _rd.color = bodyFill(logic.state.tankColor, logic.state.tankColorMap); _rd.colorMap = CM_FREE;
    _rd.teamColorOverride = false;
  }
  _rd.layerTeamFill = !_rd.teamColorOverride && anyForcedTeamLayer(logic.state.bodyLayers) ? _layerTeamFillOf(logic.playerLayerTeamIndex()) : '';
  if (logic.state.gracePeriodActive) {
    const elapsed = logic.gameNow() - logic.state.gracePeriodStartTime;
    _rd.damageOverlay = MOTION_ARRAS.BLINK
      ? blinkCombine(logic.tankDamageOverlay, elapsed)
      : ((elapsed % 200 < 100) ? 0.3 : 0);
  } else if (SMALL_FIX.R209 !== 0 && !SPAWN_FADE_IN && logic.state.tankSpawning && logic.state.isTestMode) {
    const elapsed = logic.gameNow() - logic.state.tankSpawnStartTime;
    _rd.damageOverlay = MOTION_ARRAS.BLINK
      ? blinkCombine(logic.tankDamageOverlay, elapsed)
      : ((elapsed % 200 < 100) ? 0.3 : 0);
  } else {
    _rd.damageOverlay = logic.tankDamageOverlay;
  }
  _rd.kickSpeed = logic.getStatMultiplier('bulletSpeed');
  _rd.isTestMode = logic.state.isTestMode;
  _rd.zoom = logic.zoom;
  _rd.bodyLayers = logic.state.bodyLayers.length > 0 ? logic.state.bodyLayers : null;
  _rd.baseBodyAngle = logic._baseBodyAngle;
  _rd.isHealer = !!(logic.state as any).isHealer;
  _rd.alpha = _playerShownAlpha(logic);
  _rd.canFade = !!logic.state.invisibleEnabled;
  if (!logic.state.isTestMode && logic.state.canvasEntityKind !== 'shape' && logic.isTurretPlacementEnabled) {
    if (logic.state.autoSubTurretEditMode) {
      _rd.selectedAutoParentId = logic.state.autoSubTurretParentId;
      _rd.selectedTurretId = logic.state.autoSubTurretSelectMode
        ? logic.state.autoSubTurretSelectedId : null;
    } else {
      _rd.selectedAutoParentId = null;
      _rd.selectedTurretId = logic.state.selectMode
        ? logic.state.selectedTurretId : null;
    }
  } else {
    _rd.selectedTurretId = null;
    _rd.selectedAutoParentId = null;
  }
  _rd.pickedBody = (!logic.state.isTestMode && logic.state.canvasEntityKind === 'tank' && logic.isTankToolActive && logic.layerPickMode)
    ? (logic.state.activeBodyLayerId ?? 'main') : '';
  if (logic.state.inheritMode || logic.state.autoSubTurretInheritMode) {
    _rd.selectedTurretId = null;
  }
  _rd.editingTurret = (!logic.state.isTestMode && logic.state.canvasEntityKind !== 'shape' && !logic.state.selectMode && logic.isTurretPlacementEnabled)
    ? logic.state.editingTurret : null;
  _rd.showTurretsOnly = logic.showTurretsOnly && toolStore.get() === 'import-export' && !(SMALL_FIX.R814 && logic.state.isTestMode);
  _computeInheritHighlights(logic);
}

function _computeInheritHighlights(logic: GameLogic): void {
    _inheritHighlightIds.clear();
    if (logic.state.isTestMode || logic.state.canvasEntityKind === 'shape' || !logic.isTurretPlacementEnabled) return;

    if (logic.state.autoSubTurretInheritMode) {
        const parentId = logic.state.autoSubTurretParentId;
        const targetId = logic.state.autoSubTurretInheritTargetId;
        if (!parentId || !targetId) return;
        const turrets = logic.state.turrets;
        let parentTurret: Turret | null = null;
        for (let i = 0; i < turrets.length; i++) {
            if (turrets[i].id === parentId) { parentTurret = turrets[i]; break; }
        }
        if (!parentTurret?.autoSubTurrets) return;
        const subs = parentTurret.autoSubTurrets;
        for (let i = 0; i < subs.length; i++) {
            if (subs[i].id !== targetId) _inheritHighlightIds.add(subs[i].id);
        }
    } else if (logic.state.inheritMode) {
        const targetId = logic.state.inheritTargetTurretId;
        if (!targetId) return;
        const turrets = logic.state.turrets;
        for (let i = 0; i < turrets.length; i++) {
            if (turrets[i].id !== targetId) _inheritHighlightIds.add(turrets[i].id);
        }
    }
}

function fillEnemyRenderData(enemy: EnemyTank, logic: GameLogic) {
  _rd.posX = enemy.position.x;
  _rd.posY = enemy.position.y;
  _rd.bodyAngle = enemy.angle;
  _rd.aimAngle = enemy.angle;
  _rd.turrets = enemy.turrets;
  const _eBirthMs = enemy._mevBirthAt >= 0 ? logic.gameNow() - enemy._mevBirthAt : -1;
  _rd.sizePx = _eBirthMs >= 0 ? enemy.size * foodBirthGrowth(_eBirthMs) : enemy.size;
  _rd.sides = enemy.sides;
  _rd.shapeDepth = enemy.shapeDepth ?? 0;
  _rd.shapeCurved = enemy.shapeCurved ?? false;
  const _elf = _liveBotFill(logic, enemy);
  if (_elf !== '') {
    _rd.color = _elf; _rd.colorMap = CM_FREE;
    _rd.teamColorOverride = true;
  } else {
    _rd.color = bodyFill(enemy.color, enemy.colorMap); _rd.colorMap = CM_FREE;
    _rd.teamColorOverride = false;
  }
  _rd.layerTeamFill = !_rd.teamColorOverride && anyForcedTeamLayer(enemy.bodyLayers) ? _layerTeamFillOf(logic.enemyLayerTeamIndex(enemy)) : '';
  const _waitBlink = SMALL_FIX.R209 !== 0 && !SPAWN_FADE_IN && enemy.isSpawning && !enemy.graceActive;
  if (MOTION_ARRAS.BLINK) {
    _rd.damageOverlay = (enemy.graceActive && !(SPAWN_FADE_IN && enemy.isSpawning))
      ? blinkCombine(enemy.damageOverlay, logic.gameNow() - enemy.graceStartTime)
      : _waitBlink ? blinkCombine(enemy.damageOverlay, logic.gameNow() - enemy.spawnStartTime)
      : enemy.damageOverlay;
  } else {
    _rd.damageOverlay = (!SPAWN_FADE_IN && enemy.isSpawning && (enemy.graceActive || _waitBlink))
      ? (logic.gameNow() % 200 < 100 ? 0.3 : 0)
      : enemy.damageOverlay;
  }
  _rd.kickSpeed = getEnemyStatMultiplier(enemy, 'bulletSpeed');
  _rd.isTestMode = logic.state.isTestMode;
  _rd.zoom = (logic.isMapDesignerActive && !logic.state.isTestMode) ? logic.mapDesignerZoom : logic.zoom;
  _rd.bodyLayers = enemy.bodyLayers.length > 0 ? enemy.bodyLayers : null;
  _rd.baseBodyAngle = enemy._baseBodyAngle;
  _rd.isHealer = enemy.isHealer;
  const _eGhost = enemy.ghostMode
    || (logic.state.ghostMode && AI_CONSTANTS.GHOST_FAMILY !== 0
        && enemy._tapRootId === logic.state.playerId);
  _rd.alpha = drawnOpacity(enemy, _carryNow(enemy, logic)) * (_eGhost ? 0.3 : 1.0) * (_eBirthMs >= 0 ? foodBirthOpacity(_eBirthMs) : 1);
  _rd.canFade = _eGhost || !!enemy.invisEnabled || (enemy._mevF & 32768) !== 0;
  _rd.selectedTurretId = null;
  _rd.selectedAutoParentId = null;
  _rd.pickedBody = '';
  _rd.editingTurret = null;
  _rd.showTurretsOnly = false;
}

interface Props {
  gameState: GameState;
  onInit: (logic: GameLogic) => void;
  activeTool?: string;
  suspended?: boolean;
}

export const GameCanvas: React.FC<Props> = React.memo(({ gameState, onInit, activeTool, suspended }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const logicRef = useRef<GameLogic | null>(null);
  const requestRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const activeToolRef = useRef<string | undefined>(undefined);
  const suspendedRef = useRef(false);
  const [logicReady, setLogicReady] = useState(false);

  activeToolRef.current = activeTool ?? toolStore.get();
  useEffect(() => (activeTool === undefined ? toolStore.subscribe(() => { activeToolRef.current = toolStore.get(); }) : undefined), [activeTool]);
  suspendedRef.current = !!suspended;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let logic = logicRef.current;
    if (!logic) {
      logic = new GameLogic(gameState);
      logicRef.current = logic;
      onInit(logic);
      setLogicReady(true);
    }

    logic.initWebGL();

    const currentLogic = logic;

    currentLogic.onRecycleAllEnemies = clearEnemyDeathCanvasCache;
    currentLogic.onEnemyRecycled = cleanupDeathCanvas;

    let _resizeSnapshot: HTMLCanvasElement | null = null;
    let _pendingSize: { width: number; height: number } | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (suspendedRef.current && !currentLogic.state.isTestMode) { canvas.style.width = width + 'px'; canvas.style.height = height + 'px'; _pendingSize = { width, height }; continue; }
            _pendingSize = null;
            applyCanvasSize(width, height);
        }
    });
    const applyCanvasSize = (width: number, height: number): void => {
        {
            const dpr = getEffectiveDPR();
            const newW = Math.round(width * dpr);
            const newH = Math.round(height * dpr);
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            if (Math.abs(newW - canvas.width) <= 4 && Math.abs(newH - canvas.height) <= 4) return;
            const oldW = canvas.width;
            const oldH = canvas.height;
            let sctx: CanvasRenderingContext2D | null = null;
            if (oldW > 0 && oldH > 0) {
                if (!_resizeSnapshot) _resizeSnapshot = document.createElement('canvas');
                _resizeSnapshot.width = oldW;
                _resizeSnapshot.height = oldH;
                sctx = _resizeSnapshot.getContext('2d');
                sctx?.drawImage(canvas, 0, 0);
            }
            canvas.width = newW;
            canvas.height = newH;
            if (sctx && _resizeSnapshot) {
                ctx.drawImage(_resizeSnapshot, 0, 0, oldW, oldH, 0, 0, newW, newH);
                _resizeSnapshot.width = 0;
                _resizeSnapshot.height = 0;
            }
            currentLogic.resize(canvas.width, canvas.height);
        }
    };

    resizeObserver.observe(container);

    const onKeyDown = (e: KeyboardEvent) => {
      const _chatEl = chatInputElement();
      if (_chatEl !== null && e.target === _chatEl) {
        if ((e.code === 'Enter' || e.code === 'NumpadEnter' || (e.key === 'Enter' && e.code === '')) && !e.isComposing) { e.preventDefault(); currentLogic.chatSubmit(_chatEl.value, performance.now()); }
        else if (e.code === 'Tab') e.preventDefault();
        return;
      }
      if (_chatEl !== null && typingFor(e.target) === _chatEl) return;
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && !e.isComposing && currentLogic.state.isTestMode && !_typedInField(e.target)) {
        if (currentLogic.chat.boxOpen && _chatEl !== null) { e.preventDefault(); _chatEl.focus({ preventScroll: true }); return; }
        if (currentLogic.chatOpen(performance.now())) { e.preventDefault(); chatInputOpenNow(); return; }
      }
      if (e.code === 'Tab' && currentLogic.state.isTestMode) e.preventDefault();
      if (currentLogic.handleInput('keydown', e.code, e.repeat, _typedInField(e.target))) e.preventDefault();
      else if (!BROWSER_KEYS_OLD && currentLogic.state.isTestMode && browserActsOnKey(e.code, e.ctrlKey || e.metaKey) && !_typedInField(e.target)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!BROWSER_KEYS_OLD && currentLogic.state.isTestMode && (e.code === 'AltLeft' || e.code === 'AltRight') && !_typedInField(e.target)) e.preventDefault();
      currentLogic.handleInput('keyup', e.code);
    };
    const onMouseMove = (e: MouseEvent) => {
        if (currentLogic.state.isTestMode && mobileActive()) return;
        if (e.target !== canvas && !currentLogic.state.isTestMode
            && !currentLogic.mapEditor.dragArmed && !currentLogic.mapEditor.zoneDragActive && currentLogic.mapEditor.vtxDrag === -1
            && !currentLogic.mapEditor.placeStrokeActive && !currentLogic.mapEditor.eraseStrokeActive) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = getEffectiveDPR();
        const mx = (e.clientX - rect.left) * dpr;
        const my = (e.clientY - rect.top) * dpr;
        if (_mdDragging) {
            mapEditorClickMoved(currentLogic, mx, my);
            const dx = (mx - _mdDragStartX) / currentLogic.mapDesignerZoom;
            const dy = (my - _mdDragStartY) / currentLogic.mapDesignerZoom;
            currentLogic.mapDesignerCamX = _mdCamStartX - dx;
            currentLogic.mapDesignerCamY = _mdCamStartY - dy;
            return;
        }
        currentLogic.handleMouseMove(mx, my);
        if (currentLogic.isMapDesignerActive && !currentLogic.state.isTestMode) {
            const worldX = (mx - canvas.width / 2) / currentLogic.mapDesignerZoom + currentLogic.mapDesignerCamX;
            const worldY = (my - canvas.height / 2) / currentLogic.mapDesignerZoom + currentLogic.mapDesignerCamY;
            noteMapEditorMods(currentLogic, e.shiftKey, e.altKey);
            mapEditorPointerMove(currentLogic, worldX, worldY, mx, my);
        }
    };
    const onMouseDown = (e: MouseEvent) => {
        if (currentLogic.state.isTestMode && mobileActive()) return;
        if (e.button === 2) {
            if (currentLogic.isMapDesignerActive && !currentLogic.state.isTestMode) {
                const rect = canvas.getBoundingClientRect();
                const dpr = getEffectiveDPR();
                const screenX = (e.clientX - rect.left) * dpr;
                const screenY = (e.clientY - rect.top) * dpr;
                const worldX = (screenX - canvas.width / 2) / currentLogic.mapDesignerZoom + currentLogic.mapDesignerCamX;
                const worldY = (screenY - canvas.height / 2) / currentLogic.mapDesignerZoom + currentLogic.mapDesignerCamY;
                if (SMALL_FIX.GH605 !== 0) currentLogic.cancelMapGlide();
                mapEditorRightPointerDown(currentLogic, worldX, worldY);
            }
            currentLogic.handleMouseRightDown();
            return;
        }
        if (e.button !== 0) return;
        if (currentLogic.isMapDesignerActive && e.button === 0) {
            const rect = canvas.getBoundingClientRect();
            const dpr = getEffectiveDPR();
            const screenX = (e.clientX - rect.left) * dpr;
            const screenY = (e.clientY - rect.top) * dpr;

            const worldX = (screenX - canvas.width / 2) / currentLogic.mapDesignerZoom + currentLogic.mapDesignerCamX;
            const worldY = (screenY - canvas.height / 2) / currentLogic.mapDesignerZoom + currentLogic.mapDesignerCamY;
            noteMapEditorMods(currentLogic, e.shiftKey, e.altKey);
            if (SMALL_FIX.GH605 !== 0) currentLogic.cancelMapGlide();
            if (mapEditorPointerDown(currentLogic, worldX, worldY, screenX, screenY)) return;

            currentLogic.cancelMapGlide();
            _mdDragging = true;
            _mdDragStartX = screenX;
            _mdDragStartY = screenY;
            _mdCamStartX = currentLogic.mapDesignerCamX;
            _mdCamStartY = currentLogic.mapDesignerCamY;
            return;
        }
        currentLogic.handleMouseDown();
    };
    const onMouseUp = (e: MouseEvent) => {
        if (currentLogic.state.isTestMode && mobileActive()) return;
        if (e.button === 2) {
            if (currentLogic.isMapDesignerActive && !currentLogic.state.isTestMode) {
                const rect = canvas.getBoundingClientRect();
                const dpr = getEffectiveDPR();
                const screenX = (e.clientX - rect.left) * dpr;
                const screenY = (e.clientY - rect.top) * dpr;
                const worldX = (screenX - canvas.width / 2) / currentLogic.mapDesignerZoom + currentLogic.mapDesignerCamX;
                const worldY = (screenY - canvas.height / 2) / currentLogic.mapDesignerZoom + currentLogic.mapDesignerCamY;
                mapEditorRightPointerUp(currentLogic, worldX, worldY);
            }
            currentLogic.handleMouseRightUp(true);
            return;
        }
        if (e.button !== 0) return;
        if (currentLogic.isMapDesignerActive && !currentLogic.state.isTestMode) {
            const rect = canvas.getBoundingClientRect();
            const dpr = getEffectiveDPR();
            const screenX = (e.clientX - rect.left) * dpr;
            const screenY = (e.clientY - rect.top) * dpr;
            const worldX = (screenX - canvas.width / 2) / currentLogic.mapDesignerZoom + currentLogic.mapDesignerCamX;
            const worldY = (screenY - canvas.height / 2) / currentLogic.mapDesignerZoom + currentLogic.mapDesignerCamY;
            noteMapEditorMods(currentLogic, e.shiftKey, e.altKey);
            mapEditorPointerUp(currentLogic, worldX, worldY);
        }
        if (_mdDragging) { _mdDragging = false; return; }
        currentLogic.handleMouseUp(true);
    };
    const onWheel = (e: WheelEvent) => {
        if (!currentLogic.isMapDesignerActive) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const dpr = getEffectiveDPR();
        const mx = (e.clientX - rect.left) * dpr;
        const my = (e.clientY - rect.top) * dpr;
        currentLogic.handleMapDesignerWheel(mx, my, e.deltaY, canvas.width, canvas.height);
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onWindowBlur = () => {
        _mdDragging = false;
        if (logicRef.current) {
            if (logicRef.current.endMapEditStroke() && SMALL_FIX.GH589 !== 0 && logicRef.current.onStateChange) logicRef.current.onStateChange(logicRef.current.state);
            cancelMapEditInteraction(logicRef.current.mapEditor);
            logicRef.current.keys.clear();
            logicRef.current.admin.release();
            logicRef.current.handleMouseUp();
            logicRef.current.handleMouseRightUp();
        }
        _touch.releaseAll();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove, true);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('blur', onWindowBlur);
    _touch.attach(canvas, () => logicRef.current);
    const _unsubMobScale = subscribeMobile(() => { if (logicRef.current) logicRef.current.hudScale = getHudScale(); });

    const onVisibilityChange = () => {
      if (document.hidden) _mdDragging = false;
      if (!document.hidden || !logicRef.current) return;
      if (logicRef.current.endMapEditStroke() && SMALL_FIX.GH589 !== 0 && logicRef.current.onStateChange) logicRef.current.onStateChange(logicRef.current.state);
      cancelMapEditInteraction(logicRef.current.mapEditor);
      logicRef.current.keys.clear();
      logicRef.current.admin.release();
      logicRef.current.handleMouseUp();
      logicRef.current.handleMouseRightUp();
      if (logicRef.current.state.isTestMode && !logicRef.current.state.paused && !logicRef.current.state.playerDead) {
        logicRef.current.setPaused(true);
        previousTimeRef.current = null;
      } else if (logicRef.current.state.isTestMode && logicRef.current.state.playerDead) {
        previousTimeRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    previousTimeRef.current = null;
    const _fsAcc = new StepAccumulator();

    const animate = (time: number) => {
      if (!logicRef.current || !ctx) {
        return;
      }

      if (suspendedRef.current && !logicRef.current.state.isTestMode) {
        previousTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
        return;
      }
      if (_pendingSize !== null) { const ps = _pendingSize; _pendingSize = null; applyCanvasSize(ps.width, ps.height); }

      try {
        if (previousTimeRef.current !== null) {
          const deltaTime = (time - previousTimeRef.current) / 1000;

          if (deltaTime < 0.001) {
            requestRef.current = requestAnimationFrame(animate);
            return;
          }

          const clampedDt = deltaTime > 0.05 ? 0.05 : deltaTime;

          noteFrameInterval(
            deltaTime * 1000,
            logicRef.current.state.isTestMode && !logicRef.current.state.paused,
            _lastUpdateMs,
          );

          const _ft0 = performance.now();
          const _lg = logicRef.current;
          const _fsOn = _lg.tripBuilding() ? _lg.tripFrame(clampedDt) : runFixedStepFrame(_lg, _fsAcc, clampedDt);
          _lastUpdateMs = performance.now() - _ft0;
          if (_fsOn) {
            _lg.setInterpTankReach(_tankCullR);
            _lg.interpBegin(_fsAcc.frac());
            try {
              render(ctx, _lg, clampedDt, activeToolRef.current);
            } finally {
              _lg.interpEnd();
            }
          } else {
            render(ctx, _lg, clampedDt, activeToolRef.current);
          }
          const _ft2 = performance.now();
          const _frameDt = _ft2 - _ft0;
          _ftSamples++;
          _ftSum += _frameDt;
          _ftSumSq += _frameDt * _frameDt;
          if (_frameDt < _ftMin) _ftMin = _frameDt;
          if (_frameDt > _ftMax) _ftMax = _frameDt;
          if (_ft2 - _lastJitterResetTime > 2000) {
            const _ftAvg = _ftSum / Math.max(_ftSamples, 1);
            const _ftVar = (_ftSumSq / Math.max(_ftSamples, 1)) - (_ftAvg * _ftAvg);
            _lastJitter = Math.sqrt(Math.max(0, _ftVar));
            _lastJitterResetTime = _ft2;
            _ftMin = Infinity; _ftMax = 0;
            _ftSum = 0; _ftSumSq = 0; _ftSamples = 0;
          }
        }
        previousTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
      } catch (error) {
        console.error('Game loop error:', error);
        _loopErrorCount++;
        _loopErrorLast = String((error as any)?.message ?? error).slice(0, 90);
        try {
          if (typeof (ctx as any).reset === 'function') (ctx as any).reset();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const bw = Math.min(canvas.width - 16, 900);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
          ctx.fillRect(8, 8, bw, 30);
          ctx.fillStyle = '#ffffff';
          ctx.font = '13px ui-monospace, monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`GAME LOOP ERROR x${_loopErrorCount}: ${_loopErrorLast}`, 16, 23, bw - 16);
        } catch { }
        previousTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
      }
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      currentLogic.onRecycleAllEnemies = null;
      currentLogic.onEnemyRecycled = null;
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove, true);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', onWindowBlur);
      _touch.detach(); _unsubMobScale();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      currentLogic.endMapEditStroke();
      cancelMapEditInteraction(currentLogic.mapEditor);
      _mdDragging = false;
      currentLogic.keys.clear();
      currentLogic.handleMouseUp();
      currentLogic.handleMouseRightUp();
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden bg-[#e5e5e5]">
        <canvas ref={canvasRef} className="block w-full h-full outline-none" />

        {logicReady && logicRef.current && <InGameHUD logic={logicRef.current} />}
        {logicReady && logicRef.current && <ChatInput logic={logicRef.current} />}
    </div>
  );
});
const HudMessages: React.FC<{ logic: GameLogic; scale: number; hidden: boolean }> = React.memo(({ logic, scale, hidden }) => {
    const viewRef = useRef<HudMsgView | null>(null);
    if (viewRef.current === null) viewRef.current = new HudMsgView(logic);
    const view = viewRef.current;
    const attach = useCallback((el: HTMLDivElement | null) => view.attach(el), [view]);
    useLayoutEffect(() => { view.setScale(scale); }, [view, scale]);
    useLayoutEffect(() => { view.setHidden(hidden); }, [view, hidden]);
    useEffect(() => { const u1 = subscribeMobY3(view.replace.bind(view)); const u2 = subscribeMobile(view.replace.bind(view)); return () => { u1(); u2(); }; }, [view]);
    useLayoutEffect(() => {
        logic.onMessage = view.poke;
        return () => { if (logic.onMessage === view.poke) logic.onMessage = null; };
    }, [logic, view]);
    return <div ref={attach} className="hud-msgs" />;
});

interface HudBarRefs {
    fill: React.RefObject<HTMLDivElement | null>;
    text: React.RefObject<HTMLDivElement | null>;
}

const HudBar: React.FC<{ g: HudBarGeom; scale: number; fillColor: string; ink: string; track: string; textColor: string; refs: HudBarRefs }> =
    ({ g, scale, fillColor, ink, track, textColor, refs }) => {
    const r = g.h / 2;
    const ro = r + HUD_BAR_OUTLINE;
    const L = g.x1 - g.x0;
    return (
        <div style={{
            position: 'absolute', left: `calc(50% + ${(g.x0 - HUD_REF_W / 2 - ro) * scale}px)`,
            bottom: (HUD_REF_H - g.y - ro) * scale, width: (L + 2 * ro) * scale, height: 2 * ro * scale,
            borderRadius: ro * scale, backgroundColor: ink, contain: 'layout',
        }}>
            <div style={{
                position: 'absolute', left: HUD_BAR_OUTLINE * scale, top: HUD_BAR_OUTLINE * scale,
                width: (L + g.h) * scale, height: g.h * scale, borderRadius: r * scale,
                backgroundColor: track, overflow: 'hidden',
            }}>
                <div ref={refs.fill} style={{ width: '100%', height: '100%', borderRadius: r * scale, backgroundColor: fillColor }} />
            </div>
            <div ref={refs.text} style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: HUD_FONT_FAMILY, fontWeight: 'bold', fontSize: g.font * scale, lineHeight: 1,
                color: textColor, whiteSpace: 'pre', letterSpacing: 'normal',
                WebkitTextStroke: `${HUD_STROKE_F * g.font * scale}px ${ink}`, paintOrder: 'stroke fill',
            }} />
        </div>
    );
};

interface HudSlot { el: HTMLDivElement | null; v: number; }
const _newSlot = (): HudSlot => ({ el: null, v: NaN });

function _paintShift(slot: HudSlot, el: HTMLDivElement | null, shift: number): void {
    if (!el || (el === slot.el && shift === slot.v)) return;
    el.style.transform = `translateX(${shift * 100}%)`;
    slot.el = el; slot.v = shift;
}

interface XpBarAnim {
    rec: HudEaseRecord;
    v: number;
    raf: number;
    view: HudXpView;
    level: HudBarRefs;
    score: HudBarRefs;
    kill: HudBarRefs;
    name: string | null;
    lvFill: HudSlot; lvText: HudSlot; lvName: string | null;
    scFill: HudSlot; scText: HudSlot;
    klFill: HudSlot; klText: HudSlot; klBoss: number;
    subj: string;
}

function _hudXpOf(logic: GameLogic): number { const w = logic.spectatedTank(); return w !== null ? w.currentXp : logic.state.currentXp; }

function paintHudBars(a: XpBarAnim, st: GameState, logic: GameLogic): void {
    const cap = isManhuntMode(st.gameModeConfig.mode) ? Infinity : levelHeldIn(st.gameModeConfig) && st.gameModeConfig.vampirism !== true ? 0 : (st.gameModeConfig.levelCap ?? 45);
    hudXpView(a.v, XP_CURVE_COEFF, XP_LEVEL_OFFSET, cap, a.view);
    if (a.view.level > cap) a.view.level = cap;
    _paintShift(a.lvFill, a.level.fill.current, hudBarShift(HUD_BAR_LEVEL, a.view.pct / 100));
    const lt = a.level.text.current;
    if (lt && (lt !== a.lvText.el || a.view.level !== a.lvText.v || a.name !== a.lvName)) {
        lt.textContent = `Level ${a.view.level} ${a.name ?? ''}`;
        a.lvText.el = lt; a.lvText.v = a.view.level; a.lvName = a.name;
    }
    const sv = roundHalfAway(a.v) - XP_SCORE_BASE;
    const _w = logic.spectatedTank();
    const score = (sv > 0 ? sv : 0) + logic.shownScoreStartOf(_w);
    const killsOn = st.showKillsBar;
    _paintShift(a.scFill, a.score.fill.current, hudBarShift(killsOn ? HUD_BAR_SCORE : HUD_BAR_SCORE_ALONE,
        hudScoreFill(score, logic.lbShownMax)));
    const stx = a.score.text.current;
    if (stx && (stx !== a.scText.el || score !== a.scText.v)) {
        stx.textContent = hudScoreText(score);
        a.scText.el = stx; a.scText.v = score;
    }
    if (killsOn) {
        const k = _w !== null ? _w.kills : st.kills, b = _w !== null ? 0 : (st.bossKills ?? 0);
        _paintShift(a.klFill, a.kill.fill.current, hudBarShift(HUD_BAR_KILL, hudKillFill(k, b, score)));
        const ktx = a.kill.text.current;
        if (ktx && (ktx !== a.klText.el || k !== a.klText.v || b !== a.klBoss)) {
            ktx.textContent = hudKillText(k, 0, b);
            a.klText.el = ktx; a.klText.v = k; a.klBoss = b;
        }
    }
}

function useHudDark(): boolean {
    return useGameDark();
}

const InGameHUD: React.FC<{ logic: GameLogic }> = ({ logic }) => {
    keepStyle('k-hud-text', HUD_TEXT_CSS);
    usePhoneMatch(logic.state.isTestMode);
    const [, setTick] = useState(0);
    const originalCallbackRef = useRef<((state: GameState) => void) | undefined>(undefined);

    useEffect(() => {
        originalCallbackRef.current = logic.onStateChange;

        logic.onStateChange = (state: GameState) => {
            setTick(t => t + 1);
            if (originalCallbackRef.current) {
                originalCallbackRef.current(state);
            }
        };

        return () => {
            logic.onStateChange = originalCallbackRef.current;
        };
    }, [logic]);

    const s = logic.state;

    const hs = useHudScale();
    const dark = useHudDark();
    const col = hudColors(dark);

    const levelFillRef = useRef<HTMLDivElement | null>(null);
    const levelTextRef = useRef<HTMLDivElement | null>(null);
    const scoreFillRef = useRef<HTMLDivElement | null>(null);
    const scoreTextRef = useRef<HTMLDivElement | null>(null);
    const killFillRef = useRef<HTMLDivElement | null>(null);
    const killTextRef = useRef<HTMLDivElement | null>(null);
    const xpAnimRef = useRef<XpBarAnim | null>(null);
    if (xpAnimRef.current === null) {
        const S0 = hudScoreOfXp(_hudXpOf(logic), XP_SCORE_BASE);
        xpAnimRef.current = {
            rec: { stampUs: 0, x: S0, T: S0 }, v: S0, raf: 0, view: { level: 0, pct: 0 },
            level: { fill: levelFillRef, text: levelTextRef },
            score: { fill: scoreFillRef, text: scoreTextRef },
            kill: { fill: killFillRef, text: killTextRef },
            name: null,
            lvFill: _newSlot(), lvText: _newSlot(), lvName: null,
            scFill: _newSlot(), scText: _newSlot(),
            klFill: _newSlot(), klText: _newSlot(), klBoss: NaN,
            subj: logic.spectatedTank()?.id ?? '',
        };
    }
    const xpAnim = xpAnimRef.current;
    const xpTarget = hudScoreOfXp(_hudXpOf(logic), XP_SCORE_BASE);
    const _hudSubj = logic.spectatedTank()?.id ?? '';
    if (xpAnim.subj !== _hudSubj) { xpAnim.subj = _hudSubj; xpAnim.rec.x = xpTarget; xpAnim.rec.T = xpTarget; xpAnim.v = xpTarget; }

    const xpTick = (now: number) => {
        xpAnim.raf = 0;
        const st = logic.state;
        const vamp = st.gameModeConfig.vampirism === true && st.isTestMode;
        xpAnim.v = hudXpAdvance(xpAnim.rec, hudScoreOfXp(_hudXpOf(logic), XP_SCORE_BASE), Math.floor(now * 1000), vamp && !logic.tankDying);
        paintHudBars(xpAnim, st, logic);
        if ((xpAnim.rec.x !== xpAnim.rec.T && xpAnim.rec.x === xpAnim.rec.x) || vamp) xpAnim.raf = requestAnimationFrame(xpTick);
    };
    const vampLoop = s.gameModeConfig.vampirism === true && s.isTestMode;
    useEffect(() => {
        if (xpAnim.raf === 0 && (vampLoop || xpAnim.rec.x !== xpTarget || xpAnim.rec.T !== xpTarget)) {
            xpAnim.raf = requestAnimationFrame(xpTick);
        }
    }, [xpTarget, vampLoop]);
    useEffect(() => () => { if (xpAnim.raf !== 0) { cancelAnimationFrame(xpAnim.raf); xpAnim.raf = 0; } }, []);
    useEffect(() => {
        const cb = () => paintHudBars(xpAnim, logic.state, logic);
        logic.onLbShownMax = cb;
        return () => { if (logic.onLbShownMax === cb) logic.onLbShownMax = null; };
    }, [logic]);
    useLayoutEffect(() => { paintHudBars(xpAnim, logic.state, logic); });

    if (!s.isTestMode) return null;

    const _watched = logic.spectatedTank();
    const tankDisplayName = _watched !== null ? logic.tankKindWordOf(_watched) : logic.playerTankDisplayName();
    xpAnim.name = tankDisplayName || null;
    const playerName = _watched !== null ? (_watched.displayName || '') : logic.playerShownName();
    const killsOn = s.showKillsBar;

    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{ ['--hud-s' as any]: hs, left: SAFE_L, top: SAFE_T, right: SAFE_R, bottom: SAFE_B }}
        >

            <HudMessages logic={logic} scale={hs} hidden={s.paused} />

            {playerName !== '' && (
                <div style={{
                    position: 'absolute', left: '50%', bottom: (HUD_REF_H - HUD_NAME_Y) * hs,
                    transform: 'translate(-50%, 50%)', height: HUD_NAME_FONT * hs,
                    fontFamily: HUD_FONT_FAMILY, fontWeight: 'bold', fontSize: HUD_NAME_FONT * hs,
                    lineHeight: `${HUD_NAME_FONT * hs}px`, color: col.text, whiteSpace: 'pre', letterSpacing: 'normal',
                    WebkitTextStroke: `${HUD_STROKE_F_BIG * HUD_NAME_FONT * hs}px ${col.ink}`, paintOrder: 'stroke fill',
                }}>{playerName}</div>
            )}

            <HudBar key={killsOn ? 'sc2' : 'sc1'} g={killsOn ? HUD_BAR_SCORE : HUD_BAR_SCORE_ALONE} scale={hs}
                fillColor={col.scoreFill} ink={col.ink} track={col.track} textColor={col.text} refs={xpAnim.score} />
            {killsOn && (
                <HudBar g={HUD_BAR_KILL} scale={hs} fillColor={col.killFill} ink={col.ink} track={col.track}
                    textColor={col.text} refs={xpAnim.kill} />
            )}
            <HudBar g={HUD_BAR_LEVEL} scale={hs} fillColor={col.levelFill} ink={col.ink} track={col.track}
                textColor={col.text} refs={xpAnim.level} />

            {mobileActive() ? <MobileHud logic={logic} scale={hs} dark={dark} tc={_touch} /> : <UpgradeMenu logic={logic} scale={hs} dark={dark} />}

            <TankEvolutionMenu logic={logic} dark={dark} />

            {s.classTreeOpen && <ClassTreeView logic={logic} />}

        </div>
    );
};

const _skColors: Record<string, { fill: string; preview: string }> = {};
function _skillColors(stat: UpgradeStat, dark: boolean): { fill: string; preview: string } {
    const key = dark ? stat + '|d' : stat;
    return _skColors[key] ?? (_skColors[key] = hudSkillColors(stat, dark));
}

interface SkillMenuAnim {
    p: number;
    target: number;
    raf: number;
    lastMs: number;
    inZone: boolean;
    byPoints: boolean;
    el: HTMLDivElement | null;
    hidePx: number;
    shownX: number;
    paintedEl: HTMLDivElement | null;
    layered: boolean;
    bump: () => void;
    frame: (nowMs: number) => void;
}

function _skPaint(a: SkillMenuAnim): void {
    const el = a.el;
    if (!el) return;
    const x = -(1 - a.p) * a.hidePx;
    if (el !== a.paintedEl) a.layered = false;
    if (el !== a.paintedEl || x !== a.shownX) {
        el.style.transform = `translateX(${x}px)`;
        a.paintedEl = el; a.shownX = x;
    }
    a.layered = hudSlideLayer(el, a.p !== a.target, a.layered);
}

function _skRetarget(a: SkillMenuAnim): void {
    const target = a.byPoints || a.inZone ? 1 : 0;
    if (target === a.target) return;
    a.target = target;
    if (a.p === 0 && target === 1 && !a.el) { a.bump(); return; }
    if (a.raf === 0) { a.lastMs = performance.now(); a.raf = requestAnimationFrame(a.frame); }
}

function _newSkillAnim(shown: boolean): SkillMenuAnim {
    const a: SkillMenuAnim = {
        p: shown ? 1 : 0, target: shown ? 1 : 0, raf: 0, lastMs: 0, inZone: false, byPoints: shown,
        el: null, hidePx: 0, shownX: NaN, paintedEl: null, layered: false, bump: () => {}, frame: () => {},
    };
    a.frame = (nowMs: number) => {
        a.raf = 0;
        const dt = nowMs > a.lastMs ? (nowMs - a.lastMs) / 1000 : 0;
        a.lastMs = nowMs;
        a.p = hudSlideStep(a.p, a.target, dt);
        _skPaint(a);
        if (a.p !== a.target) a.raf = requestAnimationFrame(a.frame);
        else if (a.p === 0) a.bump();
    };
    return a;
}

const UpgradeMenu: React.FC<{ logic: GameLogic; scale: number; dark: boolean }> = ({ logic, scale, dark }) => {
    const s = logic.state;
    const w = logic.spectatedTank();
    const upg = w !== null ? w.upgrades : s.upgrades;
    const ptsNow = w !== null ? w.skillPoints : s.skillPoints;
    const isMaxed = w !== null ? true : logic.areSkillsMaxed();
    const hasPoints = ptsNow > 0;
    const [, setTick] = useState(0);
    const animRef = useRef<SkillMenuAnim | null>(null);
    if (animRef.current === null) animRef.current = _newSkillAnim(hasPoints && !isMaxed);
    const a = animRef.current;
    a.bump = () => setTick(t => t + 1);
    const dead = s.playerDead === true;
    if (dead) a.inZone = false;
    a.byPoints = hasPoints && !isMaxed && !dead;

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const z = getBrowserZoomFactor();
            const inZone = hudInRevealZone(e.clientX * z, e.clientY * z, getEffectiveViewportHeight(), getHudScale()) && logic.state.playerDead !== true;
            if (inZone !== a.inZone) { a.inZone = inZone; _skRetarget(a); }
        };
        window.addEventListener('mousemove', onMove, { capture: true, passive: true });
        const onLeave = (e: MouseEvent) => { if (e.relatedTarget === null && a.inZone) { a.inZone = false; _skRetarget(a); } };
        const onBlur = () => { if (a.inZone) { a.inZone = false; _skRetarget(a); } };
        const leaveOn = SMALL_FIX.G725 !== 0;
        if (leaveOn) { window.addEventListener('mouseout', onLeave, { capture: true, passive: true }); window.addEventListener('blur', onBlur); }
        return () => {
            window.removeEventListener('mousemove', onMove, { capture: true });
            if (leaveOn) { window.removeEventListener('mouseout', onLeave, { capture: true }); window.removeEventListener('blur', onBlur); }
        };
    }, [a]);
    useEffect(() => () => { if (a.raf !== 0) { cancelAnimationFrame(a.raf); a.raf = 0; } }, [a]);

    const _snt = w !== null ? logic.enemyStatNamesType(w) : (s.statNamesType ?? 'generic');
    const caps = w !== null ? w.skillCaps : s.skillCaps;
    const rows: { id: UpgradeStat; label: string; hotkey: number; M: number }[] = [];
    for (let i = 0; i < STAT_ORDER.length; i++) {
        const id = STAT_ORDER[i];
        const M = caps ? caps[id] : (w !== null ? w.maxPointsPerSkill : s.maxPointsPerSkill);
        if (!(M > 0)) continue;
        rows.push({ id, label: getStatLabel(id, _snt), hotkey: (i + 1) % 10, M });
    }
    let Mmax = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i].M > Mmax) Mmax = rows[i].M;
    a.hidePx = hudSkillHideDist(Mmax) * scale;

    const wantTarget = a.byPoints || a.inZone ? 1 : 0;
    if (wantTarget !== a.target) {
        a.target = wantTarget;
    }
    const mounted = a.p > 0 || a.target > 0;

    const setEl = useCallback((el: HTMLDivElement | null) => { a.el = el; if (el === null && SMALL_FIX.G726 !== 0) a.paintedEl = null; }, [a]);
    useLayoutEffect(() => {
        if (!mounted) return;
        _skPaint(a);
        if (a.raf === 0 && a.p !== a.target) {
            a.lastMs = performance.now();
            a.raf = requestAnimationFrame(a.frame);
        }
    });

    if (!mounted || rows.length === 0) return null;

    const col = hudColors(dark);
    const n = rows.length;
    const points = ptsNow;
    const topM = rows[0].M;
    const topY = hudSkillRowY(0, n);
    return (
        <div ref={setEl} className="absolute" style={{ left: 0, bottom: 0, width: 0, height: 0, pointerEvents: 'none' }}>
            {points > 0 && (
                <div style={{
                    ...skText(HUD_SK_COUNT_FONT, HUD_STROKE_F_BIG, scale, col.text, col.ink),
                    left: (HUD_SK_TRACK_L + HUD_SK_SEG * topM + 16) * scale,
                    bottom: (HUD_REF_H - (topY - HUD_SK_COUNT_ABOVE) - HUD_SK_COUNT_FONT / 2) * scale,
                    transform: 'translateX(-100%)',
                }}>{`x${points}`}</div>
            )}
            {rows.map((row, r) => (
                <SkillRow
                    key={row.id}
                    stat={row.id}
                    label={row.label}
                    hotkey={row.hotkey}
                    L={upg[row.id]}
                    M={row.M}
                    points={points}
                    readOnly={w !== null}
                    y={hudSkillRowY(r, n)}
                    scale={scale}
                    dark={dark}
                    logic={logic}
                />
            ))}
        </div>
    );
};

const STAT_ORDER: readonly UpgradeStat[] = [
    'bodyDamage', 'maxHealth', 'bulletSpeed', 'bulletHealth', 'bulletPenetration',
    'bulletDamage', 'reload', 'movementSpeed', 'shieldRegen', 'shieldCapacity',
];

const _skLabelW = new Map<string, number>();
const SK_NAME_FADE_MS = 500;
let _skRuler: CanvasRenderingContext2D | null | undefined;
function _skLabelFits(label: string, M: number): boolean {
    let w = _skLabelW.get(label);
    if (w === undefined) {
        if (_skRuler === undefined) {
            try { const c = document.createElement('canvas'); _skRuler = c.getContext ? c.getContext('2d') : null; } catch { _skRuler = null; }
        }
        if (!_skRuler) return true;
        _skRuler.font = `bold ${HUD_SK_NAME_FONT}px ${HUD_FONT_FAMILY}`;
        w = _skRuler.measureText(label).width + HUD_STROKE_F * HUD_SK_NAME_FONT;
        _skLabelW.set(label, w);
    }
    return w + 8 <= HUD_SK_SEG * M;
}

function skText(font: number, f: number, scale: number, color: string, ink: string): React.CSSProperties {
    return {
        position: 'absolute', height: font * scale, lineHeight: `${font * scale}px`,
        fontFamily: HUD_FONT_FAMILY, fontWeight: 'bold', fontSize: font * scale, color,
        whiteSpace: 'pre', letterSpacing: 'normal',
        WebkitTextStroke: `${f * font * scale}px ${ink}`, paintOrder: 'stroke fill', pointerEvents: 'none',
    };
}

const SkillRow: React.FC<{
    stat: UpgradeStat;
    label: string;
    hotkey: number;
    L: number;
    M: number;
    points: number;
    y: number;
    scale: number;
    dark: boolean;
    logic: GameLogic;
    readOnly?: boolean;
}> = React.memo(({ stat, label, hotkey, L, M, points, y, scale, dark, logic, readOnly }) => {
    const [hover, setHover] = React.useState<number | null>(null);
    const fitM = _skLabelFits(label, M);
    const [W, setW] = React.useState(M);
    const [nameOn, setNameOn] = React.useState(fitM);
    const fadeEnd = React.useRef(0);
    React.useEffect(() => {
        if (M >= W || fitM) {
            if (M !== W) setW(M);
            if (nameOn !== fitM) setNameOn(fitM);
            fadeEnd.current = 0;
            return;
        }
        if (nameOn) { setNameOn(false); fadeEnd.current = performance.now() + SK_NAME_FADE_MS; return; }
        const wait = fadeEnd.current - performance.now();
        if (wait <= 0) { setW(M); return; }
        const t = setTimeout(() => setW(M), wait);
        return () => clearTimeout(t);
    }, [M, W, fitM, nameOn]);
    const col = hudColors(dark);
    const sc = _skillColors(stat, dark);
    const u = scale;
    const seg = HUD_SK_SEG;
    const Lc = L < M ? L : M;
    const preview = hover !== null ? hudSkillPreview(Lc, hover, points, M) : Lc;
    const maxed = Lc >= M;
    const ink = col.ink;
    const nameColor = maxed ? sc.fill : points <= 0 ? col.track : col.text;
    const top = y - HUD_SK_OUTLINE_R;
    const ox = HUD_SK_CAP0 - HUD_SK_OUTLINE_R;
    const outRight = HUD_SK_TRACK_L + seg * W - HUD_SK_TRACK_R + HUD_SK_KEY_END + HUD_SK_OUTLINE_R;
    const cy = HUD_SK_OUTLINE_R;
    const cap = (x2: number, width: number, color: string, key: string) => (
        <line key={key} x1={HUD_SK_CAP0} y1={cy} x2={x2} y2={cy} stroke={color} strokeWidth={width} strokeLinecap="round" />
    );
    const disc = (x: number, r: number, color: string, key: string) => <circle key={key} cx={x} cy={cy} r={r} fill={color} />;
    const seps = (from: number, to: number, key: string) => {
        const out: React.ReactNode[] = [];
        const sy = HUD_SK_TRACK_R - HUD_SK_SEP_W / 2;
        for (let i = from; i < to; i++) {
            const x = HUD_SK_TRACK_L + seg * i;
            out.push(<line key={key + i} x1={x} y1={cy - sy} x2={x} y2={cy + sy} stroke={ink}
                strokeWidth={HUD_SK_SEP_W} strokeLinecap="round" />);
        }
        return out;
    };
    const fillTo = (lv: number, capX: number, color: string, key: string) => [
        disc(capX, HUD_SK_RIM_R, ink, key + 'r'),
        lv > 0 ? cap(capX, 2 * HUD_SK_TRACK_R, color, key + 'c') : disc(HUD_SK_CAP0, HUD_SK_TRACK_R, color, key + 'c'),
    ];
    const fillCap = hudSkillFillCap(Lc);
    const previewCap = hudSkillFillCap(preview);
    const plus = preview > Lc ? preview : Lc;
    const zones: React.ReactNode[] = [];
    if (points > 0 && !readOnly) {
        for (let j = 0; j < M; j++) {
            zones.push(<div key={'z' + j} onMouseEnter={() => setHover(j)} style={{
                position: 'absolute', left: (HUD_SK_TRACK_L + seg * j - ox) * u, top: 0, width: seg * u,
                height: 2 * HUD_SK_OUTLINE_R * u,
            }} />);
        }
    }
    return (
        <div
            className="cursor-pointer select-none"
            onMouseLeave={() => setHover(null)}
            onClick={() => { if (!readOnly && preview > Lc) logic.upgradeStat(stat, preview - Lc); }}
            style={{
                position: 'absolute', left: ox * u, bottom: (HUD_REF_H - top - 2 * HUD_SK_OUTLINE_R) * u,
                width: (outRight - ox) * u, height: 2 * HUD_SK_OUTLINE_R * u,
                pointerEvents: points > 0 && !readOnly ? 'auto' : 'none', contain: 'layout',
            }}
        >
            <svg width={(outRight - ox) * u} height={2 * HUD_SK_OUTLINE_R * u}
                viewBox={`${ox} 0 ${outRight - ox} ${2 * HUD_SK_OUTLINE_R}`}
                style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
                {cap(outRight - HUD_SK_OUTLINE_R, 2 * HUD_SK_OUTLINE_R, ink, 'o')}
                {cap(HUD_SK_TRACK_L + seg * W - HUD_SK_TRACK_R, 2 * HUD_SK_TRACK_R, col.track, 't')}
                {preview > Lc && fillTo(preview, previewCap, sc.preview, 'p')}
                {preview > Lc && seps(Lc + 1, preview, 'ps')}
                {fillTo(Lc, fillCap, sc.fill, 'f')}
                {seps(1, Lc, 's')}
            </svg>
            <div style={{ ...skText(HUD_SK_NAME_FONT, HUD_STROKE_F, u, nameColor, ink),
                left: (33 + seg * W / 2 - ox) * u, top: (cy - HUD_SK_NAME_FONT / 2) * u, transform: 'translateX(-50%)',
                opacity: nameOn ? 1 : 0, transition: 'opacity 500ms ease-in-out' }}>{label}</div>
            <div style={{ ...skText(HUD_SK_KEY_FONT, HUD_STROKE_F, u, nameColor, ink),
                left: (40 + seg * W - ox) * u, top: (cy - HUD_SK_KEY_FONT / 2) * u, transform: 'translateX(-100%)' }}>{`[${hotkey}]`}</div>
            {plus > 0 && (
                <div style={{ ...skText(HUD_SK_PLUS_FONT, HUD_STROKE_F, u, preview > Lc ? col.text : sc.fill, ink),
                    left: (48.4 + seg * W - ox) * u, top: (cy - HUD_SK_PLUS_FONT / 2) * u }}>{`+${plus}`}</div>
            )}
            {zones}
        </div>
    );
});

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function getScratch(width: number, height: number, scale = 1) {
    if (!scratchCanvas) {
        scratchCanvas = document.createElement('canvas');
        scratchCtx = scratchCanvas.getContext('2d', { alpha: true });
    }
    const w = Math.ceil(width * scale);
    const h = Math.ceil(height * scale);
    if (scratchCanvas.width < w || scratchCanvas.height < h) {
         scratchCanvas.width = Math.max(scratchCanvas.width, w);
         scratchCanvas.height = Math.max(scratchCanvas.height, h);
         if (scratchCtx) scratchCtx.lineJoin = 'round';
    } else {
        scratchCtx?.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    }
}

let _presetCompCanvas: HTMLCanvasElement | null = null;
let _presetCompCtx: CanvasRenderingContext2D | null = null;
const _presetAngleCosBuf: number[] = [];
const _presetAngleSinBuf: number[] = [];

function _ensurePresetComp(size: number): CanvasRenderingContext2D {
    const px = Math.ceil(size);
    if (!_presetCompCanvas) {
        _presetCompCanvas = document.createElement('canvas');
        _presetCompCtx = _presetCompCanvas.getContext('2d', { alpha: true })!;
        _presetCompCtx.lineJoin = 'round';
    }
    if (_presetCompCanvas.width < px || _presetCompCanvas.height < px) {
        _presetCompCanvas.width = Math.max(_presetCompCanvas.width, px);
        _presetCompCanvas.height = Math.max(_presetCompCanvas.height, px);
        _presetCompCtx!.lineJoin = 'round';
    } else {
        _presetCompCtx!.clearRect(0, 0, _presetCompCanvas.width, _presetCompCanvas.height);
    }
    return _presetCompCtx!;
}

const SHAPE_CACHE_MAX_SIZE = 1024;
const SHAPE_SIZE_BUCKET = 2;

interface CachedShape {
    canvas: OffscreenCanvas;
    bufSize: number;
    lastUsedFrame: number;
}

const _shapeCache = new Map<string, CachedShape>();
let _shapeCacheFrame = 0;
let _lastJitterResetTime = 0;
let _smoothFps = 0;
let _fpsDisplayCounter = 0;
let _displayedFps = 0;

let _ftMin = Infinity;
let _ftMax = 0;
let _ftSum = 0;
let _ftSumSq = 0;
let _lastUpdateMs = 0;
let _ftSamples = 0;
let _lastJitter = 0;
let _loopErrorCount = 0;
let _loopErrorLast = '';
const _debugAreaFoodCounts: number[] = [];
let _diagDrawOps = 0;
let _diagLodFull = 0;
let _diagLodSimple = 0;
let _diagLodMinimal = 0;
const _AI_FLEE_ORANGE = '#ff6a00';
const _FONT_DEBUG_HUD = 'bold 16px "Ubuntu", "Inter", sans-serif';
const _FONT_DEBUG_WORLD_11 = 'bold 11px "Ubuntu", "Inter", sans-serif';
const _FONT_DEBUG_WORLD_12 = 'bold 12px "Ubuntu", "Inter", sans-serif';
const _FONT_DEBUG_WORLD_20 = 'bold 20px "Ubuntu", "Inter", sans-serif';
let _DEBUG_STROKE_COLOR = strokeHex();
const _STROKE_HUD_16 = (16 + 1) / 4.5;
const _STROKE_12 = (12 + 1) / 4.5;
const _STROKE_11 = (11 + 1) / 4.5;
const _STROKE_20 = (20 + 1) / 4.5;
const _FONT_SPAWN_STATS = 'bold 12px "Ubuntu", "Inter", sans-serif';

const _AI_DASH_NONE: number[] = [];
const _AI_DASH_FOLLOW: number[] = [0, 0];

const _ovlColor = new Float64Array(3);

let _dbgVecGeom = -1;

const _FLEE_BAR_FIELDS = 7;
let _fleeBarBuf = new Float64Array(128 * _FLEE_BAR_FIELDS);
let _fleeBarCount = 0;

function _pushFleeHeatBar(
    x: number, y: number, entityRadius: number, visualRadius: number,
    heatPct: number, alpha: number, growthScale: number,
): void {
    const need = (_fleeBarCount + 1) * _FLEE_BAR_FIELDS;
    if (need > _fleeBarBuf.length) {
        const grown = new Float64Array(_fleeBarBuf.length * 2);
        grown.set(_fleeBarBuf);
        _fleeBarBuf = grown;
    }
    const o = _fleeBarCount * _FLEE_BAR_FIELDS;
    _fleeBarBuf[o] = x; _fleeBarBuf[o + 1] = y;
    _fleeBarBuf[o + 2] = entityRadius; _fleeBarBuf[o + 3] = visualRadius;
    _fleeBarBuf[o + 4] = heatPct; _fleeBarBuf[o + 5] = alpha;
    _fleeBarBuf[o + 6] = growthScale;
    _fleeBarCount++;
}

const _AI_STATE_LABEL: Record<string, string> = {
  idle: 'IDLE', roaming: 'ROAM', targeting_shapes: 'FARM',
  attacking: 'ATK', following: 'CHASE', fleeing: 'FLEE',
  protecting_base: 'PROTECTING BASE',
};

function _drawDebugText(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number): void {
    ctx.strokeText(txt, x, y);
    ctx.fillText(txt, x, y);
}

const _DBG_GLYPH_FONT_SIZE = 32;
const _DBG_GLYPH_FONT = `bold ${_DBG_GLYPH_FONT_SIZE}px "Ubuntu", "Inter", sans-serif`;
const _DBG_GLYPH_STROKE = (_DBG_GLYPH_FONT_SIZE + 1) / 4.5;
const _DBG_GLYPH_CELL = 48;
const _DBG_CELL_PER_FONT = _DBG_GLYPH_CELL / _DBG_GLYPH_FONT_SIZE;
const _DBG_BASELINE_LIFT = 0.35;

const _DBG_GLYPH_CHARS = '0123456789.-+';
const _DBG_GLYPH_BASE = 43;
const _dbgGlyphAdvance = new Float32Array(15);
const _dbgNeutralInk = (): string => cmHex(CM.TEXT, _isDarkMode, CM_USE.GENERAL);

const _dbgThemeTag = (): string => (_isDarkMode ? 'd' : 'l');

const _DBG_ROWS_MAX = 6;
const _dbgRowKey: string[] = ['', '', '', '', '', ''];
const _dbgRowCh: string[] = ['', '', '', '', '', ''];
const _dbgRowVal = new Float32Array(_DBG_ROWS_MAX);
const _dbgRowSymW = new Float32Array(_DBG_ROWS_MAX);
const _dbgRowNumW = new Float32Array(_DBG_ROWS_MAX);
const _dbgStackTop = new Map<string, number>();
const _XP_CLEARANCE_PX = 22;
const _DBG_SYM_HP = '\u2764\ufe0e';
const _DBG_SYM_SHIELD = '\u26ca';
const _DBG_SYM_POWER = '\u2605';
const _DBG_SYM_UP = '▲';
const _DBG_SYM_DOWN = '▼';
const _DBG_SYM_EVEN = '=';
const _dbgGlyphSets = new Map<string, string[]>();
const _dbgWordW = new Map<string, number>();
const _dbgWordH = new Map<string, number>();

const _DBG_RETRY_MS = 2000;
const _dbgRetryAt = new Map<string, number>();
function _dbgBlocked(key: string): boolean {
    const at = _dbgRetryAt.get(key);
    if (at === undefined) return false;
    if (performance.now() < at) return true;
    _dbgRetryAt.delete(key);
    return false;
}

let _dbgMeasureCtx: OffscreenCanvasRenderingContext2D | null = null;
function _dbgMeasure(): OffscreenCanvasRenderingContext2D {
    if (_dbgMeasureCtx === null) {
        _dbgMeasureCtx = new OffscreenCanvas(1, 1).getContext('2d')!;
        _dbgMeasureCtx.font = _DBG_GLYPH_FONT;
    }
    return _dbgMeasureCtx;
}

function _dbgGlyphSet(webgl: WebGLBulletRenderer, color: string): string[] | null {
    const setKey = `${_dbgThemeTag()}|${color}`;
    let keys = _dbgGlyphSets.get(setKey);
    if (keys === undefined) {
        keys = new Array(15);
        for (let i = 0; i < _DBG_GLYPH_CHARS.length; i++) {
            const code = _DBG_GLYPH_CHARS.charCodeAt(i);
            keys[code - _DBG_GLYPH_BASE] = `_dbgG${setKey}${code}`;
        }
        _dbgGlyphSets.set(setKey, keys);
    }
    if (webgl.hasAtlasEntry(keys[48 - _DBG_GLYPH_BASE])) return keys;
    if (_dbgBlocked(setKey)) return null;

    const measureCtx = _dbgMeasure();
    const strokeColor = _DEBUG_STROKE_COLOR;
    const halfCell = _DBG_GLYPH_CELL / 2;
    for (let i = 0; i < _DBG_GLYPH_CHARS.length; i++) {
        const ch = _DBG_GLYPH_CHARS[i];
        const code = ch.charCodeAt(0);
        _dbgGlyphAdvance[code - _DBG_GLYPH_BASE] = measureCtx.measureText(ch).width;
        webgl.prerenderShape(keys[code - _DBG_GLYPH_BASE], (ctx: OffscreenCanvasRenderingContext2D) => {
            ctx.font = _DBG_GLYPH_FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = _DBG_GLYPH_STROKE;
            ctx.fillStyle = color;
            ctx.strokeText(ch, halfCell, halfCell);
            ctx.fillText(ch, halfCell, halfCell);
        }, _DBG_GLYPH_CELL);
    }
    if (webgl.hasAtlasEntry(keys[48 - _DBG_GLYPH_BASE])) return keys;
    _dbgRetryAt.set(setKey, performance.now() + _DBG_RETRY_MS);
    return null;
}

function _dbgWord(webgl: WebGLBulletRenderer, text: string, color: string): string {
    const key = `_dbgW${_dbgThemeTag()}|${color}|${text}`;
    if (webgl.hasAtlasEntry(key)) return _dbgWordW.has(key) ? key : '';
    if (_dbgBlocked(key)) return '';
    const measureCtx = _dbgMeasure();
    const pad = Math.ceil(_DBG_GLYPH_STROKE) + 2;
    const w = Math.ceil(measureCtx.measureText(text).width) + pad * 2;
    const h = _DBG_GLYPH_CELL;
    const strokeColor = _DEBUG_STROKE_COLOR;
    const out = webgl.prerenderShapeRect(key, (ctx: OffscreenCanvasRenderingContext2D) => {
        ctx.font = _DBG_GLYPH_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = _DBG_GLYPH_STROKE;
        ctx.fillStyle = color;
        ctx.strokeText(text, w / 2, h / 2);
        ctx.fillText(text, w / 2, h / 2);
    }, w, h);
    if (out === '') { _dbgRetryAt.set(key, performance.now() + _DBG_RETRY_MS); return ''; }
    _dbgWordW.set(key, w);
    _dbgWordH.set(key, h);
    return key;
}

let _dbgOverlayPath = '';
let _dbgOverlayQuads = 0;
let _ovlVectorMs = 0;
let _ovlLabelMs = 0;
let _ovlVecAcc = 0, _ovlLabAcc = 0, _ovlSamples = 0;

let _ndFontPx = -1;
let _ndFontStr = '';
function _ndFont(px: number): string {
    if (px !== _ndFontPx) { _ndFontPx = px; _ndFontStr = `${px}px "Ubuntu", sans-serif`; }
    return _ndFontStr;
}

const _DBG_SYM_INK_FRAC = 0.48;
function _dbgSymbol(webgl: WebGLBulletRenderer, ch: string, color: string): string {
    const key = `_dbgS${_dbgThemeTag()}|${color}|${ch}`;
    if (webgl.hasAtlasEntry(key)) return _dbgWordW.has(key) ? key : '';
    if (_dbgBlocked(key)) return '';
    const m = _dbgMeasure();
    const tm = m.measureText(ch);
    const inkL = tm.actualBoundingBoxLeft ?? 0;
    const inkR = tm.actualBoundingBoxRight ?? 0;
    const inkA = tm.actualBoundingBoxAscent ?? 0;
    const inkD = tm.actualBoundingBoxDescent ?? 0;
    const inkW = inkL + inkR;
    const inkH = inkA + inkD;
    const cell = _DBG_GLYPH_CELL;
    const target = cell * _DBG_SYM_INK_FRAC;
    let s = Math.min(target / inkH, target / inkW);
    if (!isFinite(s) || s <= 0) s = 1;
    const strokeColor = _DEBUG_STROKE_COLOR;
    webgl.prerenderShape(key, (ctx: OffscreenCanvasRenderingContext2D) => {
        ctx.save();
        ctx.font = _DBG_GLYPH_FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = color;
        ctx.translate(cell / 2, cell / 2);
        ctx.scale(s, s);
        ctx.lineWidth = _DBG_GLYPH_STROKE / s;
        const x = -(inkR - inkL) / 2;
        const y = (inkA - inkD) / 2;
        ctx.strokeText(ch, x, y);
        ctx.fillText(ch, x, y);
        ctx.restore();
    }, cell);
    if (!webgl.hasAtlasEntry(key)) { _dbgRetryAt.set(key, performance.now() + _DBG_RETRY_MS); return ''; }
    _dbgWordW.set(key, cell);
    _dbgWordH.set(key, cell);
    return key;
}

function _dbgWordScreenW(key: string, fontPx: number): number {
    const w = _dbgWordW.get(key);
    const h = _dbgWordH.get(key);
    if (w === undefined || h === undefined) return 0;
    return (w / h) * fontPx * _DBG_CELL_PER_FONT;
}

function _dbgNumberAdvance(value: number, decimals: number, showPlus = false): number {
    const factor = decimals > 0 ? Math.pow(10, decimals) : 1;
    let n = value;
    let adv = 0;
    if (n < 0) { adv += _dbgGlyphAdvance[45 - _DBG_GLYPH_BASE]; n = -n; }
    else if (showPlus) adv += _dbgGlyphAdvance[43 - _DBG_GLYPH_BASE];
    if (decimals > 0) {
        adv += _dbgGlyphAdvance[46 - _DBG_GLYPH_BASE];
        adv += decimals * _dbgGlyphAdvance[48 - _DBG_GLYPH_BASE];
    }
    let intPart = Math.floor(Math.round(n * factor) / factor);
    let digits = 1;
    while (intPart >= 10) { intPart = Math.floor(intPart / 10); digits++; }
    adv += digits * _dbgGlyphAdvance[48 - _DBG_GLYPH_BASE];
    return adv;
}

function _dbgNumberScreenW(value: number, decimals: number, fontPx: number, showPlus = false): number {
    return _dbgNumberAdvance(value, decimals, showPlus) * (fontPx * _DBG_CELL_PER_FONT / _DBG_GLYPH_CELL);
}

function _dbgEmitWord(
    webgl: WebGLBulletRenderer, key: string,
    leftX: number, centerY: number, fontPx: number, invZoom: number,
    alpha: number, depth: number,
): number {
    const screenW = _dbgWordScreenW(key, fontPx);
    if (screenW <= 0) return 0;
    const worldW = screenW * invZoom;
    const worldH = fontPx * _DBG_CELL_PER_FONT * invZoom;
    webgl.addInstanceByKey(leftX + worldW * 0.5, centerY, 0, worldW, worldH, alpha, 0, depth, key);
    return worldW;
}

function _dbgGlyphAt(webgl: WebGLBulletRenderer, keys: string[], code: number, x: number, centerY: number, cellWorld: number, scaleToWorld: number, alpha: number, depth: number): number {
    const advWorld = _dbgGlyphAdvance[code - _DBG_GLYPH_BASE] * scaleToWorld;
    webgl.addInstanceByKey(x + advWorld * 0.5, centerY, 0, cellWorld, cellWorld, alpha, 0, depth, keys[code - _DBG_GLYPH_BASE]);
    return x + advWorld;
}
function _dbgEmitNumber(
    webgl: WebGLBulletRenderer, keys: string[], value: number, decimals: number,
    leftX: number, centerY: number, fontPx: number, invZoom: number,
    alpha: number, depth: number, showPlus = false,
): number {
    if (SMALL_FIX.G734 === 0) return _dbgEmitNumberBefore(webgl, keys, value, decimals, leftX, centerY, fontPx, invZoom, alpha, depth, showPlus);
    const cell = fontPx * _DBG_CELL_PER_FONT;
    const cellWorld = cell * invZoom;
    const scaleToWorld = cellWorld / _DBG_GLYPH_CELL;
    let n = value;
    let x = leftX;
    if (n < 0) { x = _dbgGlyphAt(webgl, keys, 45, x, centerY, cellWorld, scaleToWorld, alpha, depth); n = -n; }
    else if (showPlus) x = _dbgGlyphAt(webgl, keys, 43, x, centerY, cellWorld, scaleToWorld, alpha, depth);
    const factor = decimals > 0 ? Math.pow(10, decimals) : 1;
    const scaled = Math.round(n * factor);
    const whole = Math.floor(scaled / factor);
    const frac = scaled - whole * factor;
    let div = 1;
    let w = whole;
    while (w >= 10) { w = Math.floor(w / 10); div *= 10; }
    let rest = whole;
    while (div >= 1) {
        const d = Math.floor(rest / div);
        x = _dbgGlyphAt(webgl, keys, 48 + d, x, centerY, cellWorld, scaleToWorld, alpha, depth);
        rest -= d * div;
        div /= 10;
    }
    if (decimals > 0) {
        x = _dbgGlyphAt(webgl, keys, 46, x, centerY, cellWorld, scaleToWorld, alpha, depth);
        let fdiv = factor / 10;
        let frest = frac;
        while (fdiv >= 1) {
            const d = Math.floor(frest / fdiv);
            x = _dbgGlyphAt(webgl, keys, 48 + d, x, centerY, cellWorld, scaleToWorld, alpha, depth);
            frest -= d * fdiv;
            fdiv /= 10;
        }
    }
    return x - leftX;
}
function _dbgEmitNumberBefore(
    webgl: WebGLBulletRenderer, keys: string[], value: number, decimals: number,
    leftX: number, centerY: number, fontPx: number, invZoom: number,
    alpha: number, depth: number, showPlus = false,
): number {
    const cell = fontPx * _DBG_CELL_PER_FONT;
    const cellWorld = cell * invZoom;
    const scaleToWorld = cellWorld / _DBG_GLYPH_CELL;
    let n = value;
    let x = leftX;

    const emit = (code: number) => {
        const advWorld = _dbgGlyphAdvance[code - _DBG_GLYPH_BASE] * scaleToWorld;
        webgl.addInstanceByKey(x + advWorld * 0.5, centerY, 0, cellWorld, cellWorld,
            alpha, 0, depth, keys[code - _DBG_GLYPH_BASE]);
        x += advWorld;
    };

    if (n < 0) { emit(45); n = -n; }
    else if (showPlus) emit(43);
    const factor = decimals > 0 ? Math.pow(10, decimals) : 1;
    const scaled = Math.round(n * factor);
    const whole = Math.floor(scaled / factor);
    const frac = scaled - whole * factor;

    let div = 1;
    let w = whole;
    while (w >= 10) { w = Math.floor(w / 10); div *= 10; }
    let rest = whole;
    while (div >= 1) {
        const d = Math.floor(rest / div);
        emit(48 + d);
        rest -= d * div;
        div /= 10;
    }
    if (decimals > 0) {
        emit(46);
        let fdiv = factor / 10;
        let frest = frac;
        while (fdiv >= 1) {
            const d = Math.floor(frest / fdiv);
            emit(48 + d);
            frest -= d * fdiv;
            fdiv /= 10;
        }
    }
    return x - leftX;
}

function _dbgEmitLabelValue(
    webgl: WebGLBulletRenderer, wordKey: string, keys: string[],
    value: number, decimals: number, wordFirst: boolean,
    centerX: number, centerY: number, fontPx: number, invZoom: number,
    alpha: number, depth: number, showPlus = false,
): void {
    const wordScreen = _dbgWordScreenW(wordKey, fontPx);
    const numScreen = _dbgNumberScreenW(value, decimals, fontPx, showPlus);
    const gapScreen = fontPx * 0.28;
    const totalWorld = (wordScreen + gapScreen + numScreen) * invZoom;
    let x = centerX - totalWorld * 0.5;
    if (wordFirst) {
        x += _dbgEmitWord(webgl, wordKey, x, centerY, fontPx, invZoom, alpha, depth);
        x += gapScreen * invZoom;
        _dbgEmitNumber(webgl, keys, value, decimals, x, centerY, fontPx, invZoom, alpha, depth, showPlus);
    } else {
        x += _dbgEmitNumber(webgl, keys, value, decimals, x, centerY, fontPx, invZoom, alpha, depth, showPlus);
        x += gapScreen * invZoom;
        _dbgEmitWord(webgl, wordKey, x, centerY, fontPx, invZoom, alpha, depth);
    }
}

function _emitBulletHPText(
    webgl: WebGLBulletRenderer,
    bulletsArr: Bullet[],
    zoom: number,
    viewportBounds: ViewportBounds
): void {
    const keys = _dbgGlyphSet(webgl, _dbgNeutralInk());
    if (keys === null) return;
    const invZoom = 1 / zoom;
    const _MAX_CELL_SCREEN = 36;
    const _MIN_CELL_SCREEN = 15;

    for (let i = 0; i < bulletsArr.length; i++) {
        const b = bulletsArr[i];
        if (b.opacity <= 0) continue;

        const textDepth = i < _bulletDepthMap.length ? _bulletDepthMap[i] : 0;
        if (textDepth <= 0) continue;

        const sz = b.size * b.growth;
        if (!isInViewport(b.position.x, b.position.y, sz, viewportBounds)) continue;

        const totalAdvance = _dbgNumberAdvance(b.health, 1);
        if (totalAdvance <= 0) continue;

        const projScreen = sz * zoom;
        const isTrap = (b.trapDepth ?? 0) > 0.05;
        let cellScreen = projScreen * (isTrap ? 0.42 : 0.6);
        const cellForWidth = (projScreen * (isTrap ? 0.6 : 0.9)) * _DBG_GLYPH_CELL / totalAdvance;
        if (cellScreen > cellForWidth) cellScreen = cellForWidth;
        const _floor = _MIN_CELL_SCREEN < cellForWidth ? _MIN_CELL_SCREEN : cellForWidth;
        if (cellScreen < _floor) cellScreen = _floor;
        if (cellScreen > _MAX_CELL_SCREEN) cellScreen = _MAX_CELL_SCREEN;
        const cellWorldSize = cellScreen * invZoom;
        const scaleToWorld = cellWorldSize / _DBG_GLYPH_CELL;

        _dbgEmitNumber(webgl, keys, b.health, 1,
            b.position.x - totalAdvance * scaleToWorld * 0.5, b.position.y,
            cellScreen / _DBG_CELL_PER_FONT, invZoom, 1.0, textDepth);
    }
}

export const __dbgTestHooks = {
    glyphSet: _dbgGlyphSet,
    word: _dbgWord,
    emitWord: _dbgEmitWord,
    emitNumber: _dbgEmitNumber,
    emitLabelValue: _dbgEmitLabelValue,
    numberScreenW: _dbgNumberScreenW,
    wordScreenW: _dbgWordScreenW,
    CELL: _DBG_GLYPH_CELL,
    CELL_PER_FONT: _DBG_CELL_PER_FONT,
    emitAIVectorGeom: _emitAIVectorGeom,
    pushFleeHeatBar: _pushFleeHeatBar,
    resetFleeHeatBars: () => { _fleeBarCount = 0; },
    rd: _rd,
    fillPlayerRenderData,
    fillEnemyRenderData,
    applyBulletTeamColors: _applyBulletTeamColors,
    resetBulletColorCache: () => { _hardcodedSetFrame = -1; _lcFrameStamp++; },
    liveBotFill: _liveBotFill,
    applyLiveOwnerColors: (logic: GameLogic, idx: Int32Array, n: number, arr: Bullet[]) => _applyLiveOwnerColors(logic, idx, n, arr, ++_lcFrameStamp),
    teamColor: _teamColor,
    layerFill: _layerFill,
    wornFillOf: _wornFillOf,
    pushShapeLook: _pushShapeLook,
    drawShape: (c: CanvasRenderingContext2D, logic: GameLogic, poly: FloatingPolygon) => drawPolygonShape(c, logic, poly, 1.0),
    drawShapeAt: (c: CanvasRenderingContext2D, logic: GameLogic, poly: FloatingPolygon, alpha: number) => drawPolygonWithScratch(c, logic, poly, alpha),
    worldColorsOfFrame: (logic: GameLogic, frame: number) => _worldColorsOfFrame(logic, frame),
    drawEditorShapePreview: (c: CanvasRenderingContext2D, logic: GameLogic) => _drawEditorShapePreview(c, logic),
    drawEditorShape: (c: CanvasRenderingContext2D, sides: number, halfSz: number, labyLevel: number, fill: string, stroke: string, strokeWidth: number, polyType: string) => _drawEditorShapeGeometry(c, sides, halfSz, labyLevel, fill, stroke, strokeWidth, polyType),
    roundFill: _roundFill,
    roundBodyFill: _roundBodyFill,
    roundLayerFill: _roundLayerFill,
    addTankGeometry: _addTankGeometry,
    emitTurrettedBulletGeometry: _emitTurrettedBulletGeometry,
    renderMultiLayerEntity: _renderMultiLayerEntity,
    emit3PhaseTurrettedBullets: _emit3PhaseTurrettedBullets,
    drawTankAndTurrets: (c: CanvasRenderingContext2D) => drawTankAndTurrets(c),
    drawPreviewTurret: (c: CanvasRenderingContext2D, logic: GameLogic, pass: 'below' | 'above' = 'below') => drawPreviewTurret(c, logic, pass),
    drawPresetPreview: (c: CanvasRenderingContext2D, logic: GameLogic, pass: 'below' | 'above' = 'below') => drawPresetPreview(c, logic, pass),
    drawAutoSubTurretPreview: (c: CanvasRenderingContext2D, logic: GameLogic) => drawAutoSubTurretPreview(c, logic),
    drawAutoSubTurretPresetPreview: (c: CanvasRenderingContext2D, logic: GameLogic) => drawAutoSubTurretPresetPreview(c, logic),
};

function _aiStateColor(state: string): string {
    if (SMALL_FIX.R667 !== 0) {
        const d = _isDarkMode;
        return state === 'attacking' ? dbgInk(DBG_INK.ATTACK, d)
            : state === 'following' ? dbgInk(DBG_INK.CHASE, d)
            : state === 'targeting_shapes' ? dbgInk(DBG_INK.FARM, d)
            : state === 'fleeing' ? dbgInk(DBG_INK.FLEE, d)
            : state === 'roaming' ? dbgInk(DBG_INK.ROAM, d)
            : state === 'protecting_base' ? dbgInk(DBG_INK.GUARD, d)
            : dbgInk(DBG_INK.OTHER, d);
    }
    return state === 'attacking' ? '#ff4444'
        : state === 'following' ? '#ff8800'
        : state === 'targeting_shapes' ? '#ff3ea5'
        : state === 'fleeing' ? _AI_FLEE_ORANGE
        : state === 'roaming' ? (_isDarkMode ? '#5ab0ff' : '#2b7fd4')
        : state === 'protecting_base' ? (_isDarkMode ? '#4fd6a8' : '#1f9e73')
        : (_isDarkMode ? '#b8b8b8' : '#6f6f77');
}

const _DBG_LABEL_DEPTH = 0.5;
const _DBG_XP_PURPLE = '#9580ff';
function _dbgXpInk(): string { return SMALL_FIX.R667 !== 0 ? dbgInk(DBG_INK.XP, _isDarkMode) : _DBG_XP_PURPLE; }

function _emitAIVectorGeom(
    gl: WebGLBulletRenderer,
    logic: GameLogic,
    viewportBounds: ViewportBounds,
): void {
    const zoom = logic.zoom;
    const inv = 1 / zoom;
    const w2 = 2 * inv;
    const dashOnLaser = 10 * inv, dashOffLaser = 5 * inv;
    const dashOnFollow = 8 * inv, dashOffFollow = 4 * inv;
    const _vs = logic.state;
    const showLaser = _vs.dbgAiAimLaser;
    const showTargetLine = _vs.dbgAiTargetLine;
    const showFollowMark = _vs.dbgAiFollowMarker;
    const showThreatLine = _vs.dbgAiThreatLine;
    const showOrbitRing = _vs.dbgAiOrbitRing;
    if (!showLaser && !showTargetLine && !showFollowMark && !showThreatLine
        && !showOrbitRing && !(_fleeBarCount > 0 && _vs.dbgAiFearMeter)) return;

    if (_fleeBarCount > 0 && logic.state.dbgAiFearMeter) {
        _hexToRGB(strokeHex(), _ovlColor, 0);
        const bgR = _ovlColor[0], bgG = _ovlColor[1], bgB = _ovlColor[2];
        for (let i = 0; i < _fleeBarCount; i++) {
            const o = i * _FLEE_BAR_FIELDS;
            const x = _fleeBarBuf[o], y = _fleeBarBuf[o + 1];
            const entityRadius = _fleeBarBuf[o + 2], visualRadius = _fleeBarBuf[o + 3];
            const heatPct = _fleeBarBuf[o + 4], alpha = _fleeBarBuf[o + 5];
            const growthScale = _fleeBarBuf[o + 6];
            const thickness = BAR_THICKNESS_BASE * growthScale;
            const barY = _barCentreY(y, visualRadius, growthScale) + BAR_ROW_SPACING_BASE * growthScale;
            const x1 = x - entityRadius;
            const x2 = x + entityRadius;
            ovlCapsule(gl, x1, barY, x2, barY,
                thickness + BAR_BG_EXTRA_BASE * growthScale, bgR, bgG, bgB, alpha);
            if (heatPct > 0.001) {
                ovlCapsule(gl, x1, barY, x1 + (x2 - x1) * heatPct, barY,
                    thickness, 1, 0.415686, 0, alpha);
            }
        }
    }
    for (let _ei = 0; _ei < logic.state.enemyTanks.length; _ei++) {
        const enemy = logic.state.enemyTanks[_ei];
        if (!enemy.active || enemy.isDying || enemy.isSpawning) continue;
        if (!isInViewport(enemy.position.x, enemy.position.y, enemy.size * 2, viewportBounds)
            && !((enemy.followTargetX !== 0 || enemy.followTargetY !== 0)
                 && isInViewport(enemy.followTargetX, enemy.followTargetY, 40, viewportBounds))
            && !(enemy.targetPosition !== null
                 && isInViewport(enemy.targetPosition.x, enemy.targetPosition.y, 40, viewportBounds))) continue;
        if (enemy.isSentryEnemy) continue;

        const mainTurret = enemy.turrets[enemy.primaryTurretIndex];
        const isSpinningEnemy = enemy.forceAutospin || enemy.baseSpinEnabled;
        let _aiAnchorX = enemy.position.x;
        let _aiAnchorY = enemy.position.y;

        if (mainTurret) {
            let _mtAngle = enemy.angle;
            let _mtSize = enemy.size;
            for (let _li = 0; _li < enemy.bodyLayers.length; _li++) {
                const _L = enemy.bodyLayers[_li];
                if (_L.turretIds.indexOf(mainTurret.id) === -1) continue;
                _mtAngle = enemy.angle + (_L.stationary ? -enemy.angle : _L._currentAngle);
                _mtSize = enemy.size * _L.sizeRatio;
                break;
            }
            const rawOffX = mainTurret.xOffset * _mtSize / 2;
            const rawOffY = mainTurret.yOffset * _mtSize / 2;
            const cosA = Math.cos(_mtAngle);
            const sinA = Math.sin(_mtAngle);
            const turretBaseX = enemy.position.x + rawOffX * cosA - rawOffY * sinA;
            const turretBaseY = enemy.position.y + rawOffX * sinA + rawOffY * cosA;
            const tLen = _mapVal(mainTurret.length, 1, 100, _mtSize * 0.01, _mtSize / 2 + _mtSize * 10);
            const visualTurretAngle = mainTurret.turretType === 'auto'
                ? mainTurret.autoCurrentAngle
                : _mtAngle + mainTurret.angle;
            const muzzleX = turretBaseX + Math.cos(visualTurretAngle) * tLen;
            const muzzleY = turretBaseY + Math.sin(visualTurretAngle) * tLen;
            _aiAnchorX = muzzleX;
            _aiAnchorY = muzzleY;

            if (showLaser && !isSpinningEnemy) {
                const laserLength = 500;
                ovlDashedLine(gl, muzzleX, muzzleY,
                    muzzleX + Math.cos(visualTurretAngle) * laserLength,
                    muzzleY + Math.sin(visualTurretAngle) * laserLength,
                    w2, 1, 0, 0, 0.7, dashOnLaser, dashOffLaser, viewportBounds);
            }
        }

        if (showTargetLine && enemy.targetPosition) {
            ovlLine(gl, _aiAnchorX, _aiAnchorY, enemy.targetPosition.x, enemy.targetPosition.y,
                w2, 0, 1, 0, 0.7);
            ovlDisc(gl, enemy.targetPosition.x, enemy.targetPosition.y, 10 * inv, 0, 1, 0, 0.5);
        }

        const _followHold = enemy.aiState === 'following'
            || (enemy.aiState === 'attacking' && logic.gameNow() - enemy.followStartTime < 300);
        if (showFollowMark && _followHold && (enemy.followTargetX !== 0 || enemy.followTargetY !== 0)) {
            ovlDashedLine(gl, enemy.position.x, enemy.position.y,
                enemy.followTargetX, enemy.followTargetY,
                w2, 1, 0.533333, 0, 0.6, dashOnFollow, dashOffFollow, viewportBounds);
            ovlDisc(gl, enemy.followTargetX, enemy.followTargetY, 15 * inv, 1, 0.533333, 0, 0.4);
        }

        if (showThreatLine && enemy.threatDodgeRef && enemy.threatDodgeWeight > 0.001
            && enemy.threatDodgeRef.bulletId === enemy.threatDodgeId
            && enemy.threatDodgeRef.active) {
            const _thB = enemy.threatDodgeRef;
            ovlLine(gl, enemy.position.x, enemy.position.y,
                enemy.position.x + enemy.threatDodgeDirX * 70 * enemy.threatDodgeWeight,
                enemy.position.y + enemy.threatDodgeDirY * 70 * enemy.threatDodgeWeight,
                w2, 0, 0.898039, 1, 0.85);
            ovlRing(gl, _thB.position.x, _thB.position.y, _thB.size * 0.5 + 6,
                1.5 * inv, 0, 0.898039, 1, 0.7, zoom);
        }

        if (showOrbitRing && enemy.aiState === 'attacking' && enemy.orbitDistance > 0) {
            ovlRing(gl, enemy.position.x, enemy.position.y, enemy.orbitDistance,
                1.5 * inv, 0.470588, 0.705882, 1, 0.35, zoom);
        }
    }


}

const _dlLight = new DarkLight();
function _emitDarkLights(gl: WebGLBulletRenderer, logic: GameLogic, vb: ViewportBounds): void {
    const zoom = logic.zoom, w = 1.5 / zoom;
    _emitOneLight(gl, logic.debugLightOf(null, _dlLight), _dlLight, w, zoom, vb, 1, 0.92, 0.45);
    const list = logic.state.enemyTanks;
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.active || e.isDying) continue;
        _emitOneLight(gl, logic.debugLightOf(e, _dlLight), _dlLight, w, zoom, vb, 1, 0.75, 0.3);
    }
}
function _emitOneLight(gl: WebGLBulletRenderer, s: DarkSource | null, L: DarkLight, w: number, zoom: number, vb: ViewportBounds, r: number, g: number, b: number): void {
    if (s === null) return;
    const reach = Math.max(s.circle, s.beam) * L.rad;
    if (!isInViewport(L.x, L.y, reach + 600, vb)) return;
    const A = 0.85;
    if (L.round) { ovlRing(gl, L.x, L.y, roundLightRadius(L, s), w, r, g, b, A, zoom); return; }
    if (s.circle > 0) ovlRing(gl, L.x, L.y, s.circle * L.rad, w, r, g, b, A, zoom);
    const h = s.beamHalf;
    if (s.beam > 0) _emitCone(gl, L.x, L.y, Math.atan2(L.ay, L.ax), s.beam * L.rad, h, w, r, g, b, A, zoom);
    if (s.gunBeam > 0) {
        const G = L.g;
        for (let k = 0; k < L.gn; k++) { const o = k * 5; _emitCone(gl, G[o], G[o + 1], Math.atan2(G[o + 3], G[o + 2]), s.gunBeam * G[o + 4], h, w, r, g, b, A * 0.7, zoom); }
    }
}
function _emitCone(gl: WebGLBulletRenderer, x: number, y: number, dir: number, len: number, h: number, w: number, r: number, g: number, b: number, a: number, zoom: number): void {
    if (!(len > 0)) return;
    ovlLine(gl, x, y, x + Math.cos(dir - h) * len, y + Math.sin(dir - h) * len, w, r, g, b, a);
    ovlLine(gl, x, y, x + Math.cos(dir + h) * len, y + Math.sin(dir + h) * len, w, r, g, b, a);
    ovlArc(gl, x, y, len, dir - h, dir + h, w, r, g, b, a, zoom);
}

function _drawWorldDebugLabels(
    ctx: CanvasRenderingContext2D,
    logic: GameLogic,
    webgl: WebGLBulletRenderer | null,
    useWebGL: boolean,
    width: number,
    height: number,
    viewportBounds: ViewportBounds,
): void {
    const showShape = logic.state.debugShowShapeHP;
    const showAI = logic.state.debugShowAILogic;
    const showXp = logic.state.debugShowXpGain;
    if (!showShape && !showAI && !showXp) return;

    const zoom = logic.zoom;
    const invZoom = 1 / zoom;
    const ink = _dbgNeutralInk();

    const gl = useWebGL && webgl !== null ? webgl : null;
    const keys = gl !== null ? _dbgGlyphSet(gl, ink) : null;
    const useGL = gl !== null && keys !== null;
    const wHealth = useGL ? _dbgSymbol(gl!, _DBG_SYM_HP, ink) : '';
    const wShield = useGL ? _dbgSymbol(gl!, _DBG_SYM_SHIELD, ink) : '';
    const showStateLabel = showAI && logic.state.dbgAiStateLabel;
    const roleActive = showAI && logic.state.dbgAiRoleColumn && logic.roleSenseActive;
    _dbgOverlayPath = useGL
        ? (wHealth !== '' && wShield !== '' ? 'WebGL' : 'WebGL (symbol missing)')
        : (gl === null ? 'Canvas2D (no GL)' : 'Canvas2D (atlas full)');
    _dbgOverlayQuads = 0;
    const wPower = useGL && roleActive ? _dbgSymbol(gl!, _DBG_SYM_POWER, ink) : '';
    const wRoleUp = useGL && roleActive ? _dbgSymbol(gl!, _DBG_SYM_UP, ink) : '';
    const wRoleDown = useGL && roleActive ? _dbgSymbol(gl!, _DBG_SYM_DOWN, ink) : '';
    const wRoleEven = useGL && roleActive ? _dbgSymbol(gl!, _DBG_SYM_EVEN, ink) : '';

    if (useGL) gl!.beginFrame();

    const camTx = width / 2 - logic.cameraX * zoom;
    const camTy = height / 2 - logic.cameraY * zoom;
    let c2dReady = false;
    const c2dBegin = (fontPx: number) => {
        if (!c2dReady) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.strokeStyle = _DEBUG_STROKE_COLOR;
            c2dReady = true;
        }
        ctx.font = fontPx >= 20 ? _FONT_DEBUG_WORLD_20 : _FONT_DEBUG_WORLD_12;
        ctx.lineWidth = fontPx >= 20 ? _STROKE_20 : _STROKE_12;
    };

    let _rowN = 0;
    const pushRow = (wordKey: string, ch: string, value: number) => {
        if (_rowN >= _DBG_ROWS_MAX) return;
        _dbgRowKey[_rowN] = wordKey; _dbgRowCh[_rowN] = ch; _dbgRowVal[_rowN] = value; _rowN++;
    };
    const flushRows = (anchorX: number, anchorY: number, baseRowScreen: number, fontPx: number): number => {
        if (_rowN === 0) return Infinity;
        const symCell = fontPx * _DBG_CELL_PER_FONT;
        const symInk = symCell * _DBG_SYM_INK_FRAC;
        const gap = fontPx * 0.30;
        const step = fontPx * OVL_ROW_STEP_PER_FONT;
        if (!useGL) c2dBegin(fontPx);
        let maxNum = 0;
        for (let i = 0; i < _rowN; i++) {
            const nw = useGL ? _dbgNumberScreenW(_dbgRowVal[i], 0, fontPx)
                             : ctx.measureText(String(Math.ceil(_dbgRowVal[i]))).width;
            _dbgRowNumW[i] = nw;
            if (nw > maxNum) maxNum = nw;
        }
        const leftScreen = -(symInk + gap + maxNum) * 0.5;
        const symCentreScreen = leftScreen + symInk * 0.5;
        const numLeftScreen = leftScreen + symInk + gap;
        if (!useGL) {
            ctx.fillStyle = ink;
            ctx.setTransform(1, 0, 0, 1, anchorX * zoom + camTx, anchorY * zoom + camTy);
        }
        for (let i = 0; i < _rowN; i++) {
            const rs = baseRowScreen - i * step;
            if (useGL) {
                const cy = anchorY + (rs - fontPx * _DBG_BASELINE_LIFT) * invZoom;
                if (_dbgRowKey[i] !== '') {
                    _dbgEmitWord(gl!, _dbgRowKey[i],
                        anchorX + (symCentreScreen - symCell * 0.5) * invZoom,
                        cy, fontPx, invZoom, 1, _DBG_LABEL_DEPTH);
                }
                _dbgEmitNumber(gl!, keys!, _dbgRowVal[i], 0, anchorX + numLeftScreen * invZoom,
                    cy, fontPx, invZoom, 1, _DBG_LABEL_DEPTH);
            } else {
                ctx.textAlign = 'center';
                ctx.strokeText(_dbgRowCh[i], symCentreScreen, rs);
                ctx.fillText(_dbgRowCh[i], symCentreScreen, rs);
                ctx.textAlign = 'left';
                const s = String(Math.ceil(_dbgRowVal[i]));
                ctx.strokeText(s, numLeftScreen, rs);
                ctx.fillText(s, numLeftScreen, rs);
            }
        }
        if (!useGL) ctx.textAlign = 'center';
        _dbgOverlayQuads += _rowN;
        const topWorld = ovlStackTopWorld(anchorY, baseRowScreen, _rowN, fontPx, invZoom);
        _rowN = 0;
        return topWorld;
    };

    _dbgStackTop.clear();
    const recordTop = showXp
        ? (id: string, topWorld: number) => {
            const prev = _dbgStackTop.get(id);
            if (prev === undefined || topWorld < prev) _dbgStackTop.set(id, topWorld);
          }
        : null;

    if (showShape) {
        const playerSizePx = playerRenderSizePx(logic);
        const pAnchorY = logic.tankPos.y - playerSizePx / 2 - 30;
        pushRow(wHealth, _DBG_SYM_HP, logic.state.tankCurrentHealth);
        const maxShield = logic.state.tankShieldCapacity * logic.getStatMultiplier('shieldCapacity');
        if (maxShield > 0) pushRow(wShield, _DBG_SYM_SHIELD, logic.state.tankCurrentShield);
        const pTop = flushRows(logic.tankPos.x, pAnchorY, 0, 20);
        if (recordTop && pTop !== Infinity) recordTop(logic.state.playerId, pTop);

        for (let i = 0; i < logic.floatingPolygons.length; i++) {
            const poly = logic.floatingPolygons[i];
            if (!poly.active || poly.fadingOut) continue;
            const sz = poly.size * poly.growth;
            if (!isInViewport(poly.position.x, poly.position.y, sz, viewportBounds)) continue;
            const topY = poly.position.y - (sz / 2) * (poly.isPolyhedron ? polyhedronExtent(poly.polyhedronType) : getRealSizeFactor(poly.baseSides)) - 15;
            pushRow(wHealth, _DBG_SYM_HP, poly.hp);
            pushRow(wShield, _DBG_SYM_SHIELD, poly.shield);
            flushRows(poly.position.x, topY, 0, 12);
        }
    }

    if (showStateLabel || roleActive) {
        const tanks = logic.state.enemyTanks;
        const _stAll = SMALL_FIX.R665 !== 0 && logic.state.debugMode && logic.state.debugShowAllNames === true;
        const _tagNames = logic.state.showPlayerNames || _stAll, _tagScores = logic.state.showPlayerScores;
        const _tagRoom = SMALL_FIX.R666 !== 0 && (_tagNames || _tagScores);
        for (let i = 0; i < tanks.length; i++) {
            const enemy = tanks[i];
            if (!enemy.active || enemy.isDying || enemy.isSpawning) continue;
            if (!isInViewport(enemy.position.x, enemy.position.y, enemy.size * 2, viewportBounds)) continue;

            let anchorY = enemy.position.y - enemy.size / 2 - 30;
            if (_tagRoom) {
                const reach = tagReachWorld(enemy, _tagNames, _tagScores, logic.shownScoreStartOf(enemy));
                if (reach > 0 && enemy.position.y - reach - 4 * invZoom < anchorY) anchorY = enemy.position.y - reach - 4 * invZoom;
            }
            const label = logic.isHealEngagement(enemy)
                ? 'HEALING'
                : (_AI_STATE_LABEL[enemy.aiState] || enemy.aiState);
            const labelColor = _aiStateColor(enemy.aiState);

            if (!showStateLabel) {
            } else if (useGL) {
                const lk = _dbgWord(gl!, label, labelColor);
                if (lk !== '') {
                    const wWorld = _dbgWordScreenW(lk, 20) * invZoom;
                    _dbgEmitWord(gl!, lk, enemy.position.x - wWorld * 0.5,
                        anchorY + (0 - 20 * _DBG_BASELINE_LIFT) * invZoom,
                        20, invZoom, 1, _DBG_LABEL_DEPTH);
                }
            } else {
                c2dBegin(20);
                ctx.fillStyle = labelColor;
                ctx.setTransform(1, 0, 0, 1, enemy.position.x * zoom + camTx, anchorY * zoom + camTy);
                ctx.strokeText(label, 0, 0);
                ctx.fillText(label, 0, 0);
            }

            if (showStateLabel) {
                pushRow(wHealth, _DBG_SYM_HP, enemy.currentHealth);
                const maxShield = enemy.maxShield * getEnemyStatMultiplier(enemy, 'shieldCapacity');
                if (maxShield > 0) pushRow(wShield, _DBG_SYM_SHIELD, enemy.currentShield);
            }
            if (roleActive && enemy.rolePowerCeilRef !== 0 && (!useGL || wPower !== '')) {
                pushRow(wPower, _DBG_SYM_POWER, enemy.rolePower);
                const rc = logic.roleClassify(enemy);
                if (rc !== 0) {
                    const rk = rc === 1 ? wRoleUp : rc === 2 ? wRoleDown : wRoleEven;
                    const rt = rc === 1 ? _DBG_SYM_UP : rc === 2 ? _DBG_SYM_DOWN : _DBG_SYM_EVEN;
                    if (!useGL || rk !== '') pushRow(rk, rt, enemy.roleHunterPowerSum);
                }
            }
            const eTop = flushRows(enemy.position.x, anchorY, -22, 20);
            if (recordTop) {
                if (showStateLabel) recordTop(enemy.id, anchorY - 20 * invZoom);
                if (eTop !== Infinity) recordTop(enemy.id, eTop);
            }
        }
    }

    if (showXp && logic.xpTextAnimations.length > 0) {
        const XP_TEXT_DURATION_MS = 2500;
        const now = logic.gameNow();
        const xpInk = _dbgXpInk();
        const xpKeys = useGL ? _dbgGlyphSet(gl!, xpInk) : null;
        const wXp = useGL && xpKeys !== null ? _dbgWord(gl!, 'XP', xpInk) : '';
        const xpGL = useGL && xpKeys !== null && wXp !== '';

        for (let i = 0; i < logic.xpTextAnimations.length; i++) {
            const xpText = logic.xpTextAnimations[i];
            const progress = Math.min((now - xpText.createdAt) / XP_TEXT_DURATION_MS, 1);
            const entityPos = logic.getEntityPosition(xpText.ownerId);
            if (!entityPos) continue;

            let opacity = 1;
            if (progress < 0.1) opacity = progress / 0.1;
            else if (progress > 0.7) opacity = 1 - ((progress - 0.7) / 0.3);

            const radius = logic.getEntityRenderRadius(xpText.ownerId);
            const floatOffset = (progress * 26) * invZoom;
            const cy = ovlXpTextY(_dbgStackTop.get(xpText.ownerId), entityPos.y, radius,
                    _XP_CLEARANCE_PX, 16, invZoom)
                + xpText.offsetY - floatOffset;

            const decimals = xpText.amount % 1 === 0 ? 0 : 2;
            if (xpGL) {
                _dbgEmitLabelValue(gl!, wXp, xpKeys!, xpText.amount, decimals, false,
                    entityPos.x, cy, 20, invZoom, opacity, _DBG_LABEL_DEPTH, true);
            } else {
                c2dBegin(20);
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = opacity;
                ctx.fillStyle = xpInk;
                ctx.setTransform(1, 0, 0, 1, entityPos.x * zoom + camTx, cy * zoom + camTy);
                const s = decimals === 0
                    ? `+${Math.round(xpText.amount)} XP`
                    : `+${xpText.amount.toFixed(2)} XP`;
                ctx.strokeText(s, 0, 0);
                ctx.fillText(s, 0, 0);
                ctx.globalAlpha = 1;
                ctx.textBaseline = 'bottom';
            }
        }
    }

    if (useGL) {
        const has = gl!.hasContent();
        gl!.flushGeom();
        gl!.flush();
        if (has) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            _compositeWorld(ctx, gl!);
            ctx.restore();
        }
        _restoreCameraTransform(ctx, logic, width, height);
    } else if (c2dReady) {
        _restoreCameraTransform(ctx, logic, width, height);
    }
}

let _lastSpawnStatsUpdateTime = 0;
let _spawnStatsText1 = '';
let _spawnStatsText2 = '';
let _spawnStatsText3 = '';
const _SPAWN_STATS_UPDATE_INTERVAL = 500;
let _currentCacheScale = 1;
let _cacheScaleChanged = false;
let _darkModeKeyDirty = false;
const _MAX_SCRATCH_PX = 2048;
const _PREVIEW_MAX_SCRATCH_PX = 4096;
const _PREVIEW_COMP_MAX_PX = 8192;
let _bulletBodyInitAngle = 0;
const _EMPTY_SUB_TURRETS: import('../types').BulletSubTurret[] = [];
let _lastShapeKey = '';
let _lastShapeEntry: CachedShape | null = null;

function getShapeCacheKey(
    sides: number, trapDepth: number, trapCurved: boolean,
    color: string, sizeBucket: number, strokeWidth: number, cacheScale: number,
    labyLevel: number = 0
): string {
    return `${sides}|${trapDepth}|${trapCurved ? 1 : 0}|${color}|${sizeBucket}|${strokeWidth}|${cacheScale}|${_isDarkMode ? 1 : 0}${labyLevel > 0 ? `|L${labyLevel}` : ''}`;
}

function polyAngleOffset(sides: number): number {
    if (sides <= 2) return 0;
    return sides % 2 === 0 ? -Math.PI / sides : -Math.PI / 2;
}

function getPolyCacheKey(
    baseSides: number, color: string, sizeBucket: number, strokeWidth: number,
    labyLevel: number, cacheScale: number
): string {
    const dk = _isDarkMode ? 1 : 0;
    return `P|${baseSides}|${color}|${sizeBucket}|${strokeWidth}|${labyLevel}|${cacheScale}|${dk}`;
}

function bucketSize(size: number): number {
    return Math.round(size / SHAPE_SIZE_BUCKET) * SHAPE_SIZE_BUCKET;
}

function evictShapeCache(): void {
    if (_shapeCache.size <= SHAPE_CACHE_MAX_SIZE) return;
    let oldestKey = '';
    let oldestFrame = Infinity;
    for (const [key, entry] of _shapeCache) {
        if (entry.lastUsedFrame < oldestFrame) {
            oldestFrame = entry.lastUsedFrame;
            oldestKey = key;
        }
    }
    if (oldestKey) _shapeCache.delete(oldestKey);
}

function getCachedBulletShape(
    sides: number, trapDepth: number, trapCurved: boolean,
    color: string, sz: number, strokeWidth: number, cacheScale: number
): CachedShape {
    const sizeBkt = bucketSize(sz);
    const swBkt = Math.round(strokeWidth * 100) / 100;
    const key = getShapeCacheKey(sides, trapDepth, trapCurved, color, sizeBkt, swBkt, cacheScale);
    return getCachedBulletShapeByKey(key, sides, trapDepth, trapCurved, color, sizeBkt, strokeWidth, cacheScale);
}

function getCachedBulletShapeByKey(
    key: string, sides: number, trapDepth: number, trapCurved: boolean,
    color: string, sizeBkt: number, strokeWidth: number, cacheScale: number,
    labyLevel: number = 0
): CachedShape {
    if (key === _lastShapeKey && _lastShapeEntry !== null) {
        _lastShapeEntry.lastUsedFrame = _shapeCacheFrame;
        return _lastShapeEntry;
    }
    let entry = _shapeCache.get(key);
    if (entry) {
        entry.lastUsedFrame = _shapeCacheFrame;
        _lastShapeKey = key;
        _lastShapeEntry = entry;
        return entry;
    }

    const bulletVisualFactor = sides > 0 ? getRealSizeFactor(sides) : 1;
    const bufSize = Math.ceil(sizeBkt * 1.2 * bulletVisualFactor + strokeWidth + 4);
    const scaledBufSize = Math.ceil(bufSize * cacheScale);
    const canvas = new OffscreenCanvas(scaledBufSize, scaledBufSize);
    const sCtx = canvas.getContext('2d', { alpha: true, willReadFrequently: true })!;
    sCtx.scale(cacheScale, cacheScale);
    sCtx.lineJoin = 'round';

    sCtx.translate(bufSize / 2, bufSize / 2);
    sCtx.fillStyle = color;
    sCtx.strokeStyle = darkenColor(color, 0.598);
    sCtx.lineWidth = strokeWidth;

    sCtx.beginPath();
    if (sides >= 3 && trapDepth > 0) {
        const outerR = (sizeBkt / 2) * getRealSizeFactor(sides);
        const innerR = outerR * (1 - trapDepth);
        roundedStarPath(sCtx as any, sides, outerR, innerR, -Math.PI / 2, trapCurved);
    } else if (sides > 0) {
        const visualR = (sizeBkt / 2) * getRealSizeFactor(sides);
        roundedPolygonPath(sCtx as any, sides, visualR, -Math.PI / 2);
    } else {
        sCtx.arc(0, 0, sizeBkt / 2, 0, Math.PI * 2);
    }
    sCtx.stroke();
    sCtx.fill();

    if (labyLevel > 0) {
        const ds = labyDownscale(sides);
        if (sides === 0) {
            for (let li = 1; li <= labyLevel; li++) {
                const layerR = (sizeBkt / 2) * Math.pow(ds, li);
                sCtx.beginPath();
                sCtx.arc(0, 0, layerR, 0, Math.PI * 2);
                sCtx.stroke();
                sCtx.fill();
            }
        } else {
            const outerR = (sizeBkt / 2) * getRealSizeFactor(sides);
            for (let li = 1; li <= labyLevel; li++) {
                const layerR = outerR * Math.pow(ds, li);
                const layerAngleOff = (li % 2 === 0) ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / sides;
                sCtx.beginPath();
                roundedPolygonPath(sCtx as any, sides, layerR, layerAngleOff);
                sCtx.stroke();
                sCtx.fill();
            }
        }
    }

    entry = { canvas, bufSize, lastUsedFrame: _shapeCacheFrame };
    _shapeCache.set(key, entry);
    _lastShapeKey = key;
    _lastShapeEntry = entry;
    evictShapeCache();
    return entry;
}

function getCachedPolyShapeByKey(
    key: string, poly: FloatingPolygon, color: string, sizeBkt: number, strokeWidth: number, cacheScale: number
): CachedShape {
    if (key === _lastShapeKey && _lastShapeEntry !== null) {
        _lastShapeEntry.lastUsedFrame = _shapeCacheFrame;
        return _lastShapeEntry;
    }
    let entry = _shapeCache.get(key);
    if (entry) {
        entry.lastUsedFrame = _shapeCacheFrame;
        _lastShapeKey = key;
        _lastShapeEntry = entry;
        return entry;
    }

    const sides = poly.baseSides;
    const halfSz = sizeBkt / 2;
    const visualDiameter = sizeBkt * getRealSizeFactor(sides);
    const bufSize = Math.ceil(visualDiameter + strokeWidth * 2 + 20);
    const scaledBufSize = Math.ceil(bufSize * cacheScale);
    const canvas = new OffscreenCanvas(scaledBufSize, scaledBufSize);
    const sCtx = canvas.getContext('2d', { alpha: true })!;
    sCtx.scale(cacheScale, cacheScale);
    sCtx.lineJoin = 'round';

    sCtx.translate(bufSize / 2, bufSize / 2);
    sCtx.lineWidth = strokeWidth;

    const strokeCol = darkenColor(color, 0.598);

    {
        sCtx.beginPath();
        if (sides === 0) {
            sCtx.arc(0, 0, halfSz, 0, Math.PI * 2);
        } else {
            const visualR = halfSz * getRealSizeFactor(sides);
            const angleOff = polyAngleOffset(sides);
            roundedPolygonPath(sCtx as any, sides, visualR, angleOff);
        }
        sCtx.strokeStyle = strokeCol;
        sCtx.stroke();
        sCtx.fillStyle = color;
        sCtx.fill();

        if (poly.labyLevel > 0) {
            const ds = labyDownscale(sides);
            if (sides === 0) {
                for (let li = 1; li <= poly.labyLevel; li++) {
                    const layerR = halfSz * Math.pow(ds, li);
                    sCtx.beginPath();
                    sCtx.arc(0, 0, layerR, 0, Math.PI * 2);
                    sCtx.strokeStyle = strokeCol;
                    sCtx.stroke();
                    sCtx.fillStyle = color;
                    sCtx.fill();
                }
            } else {
                const outerR = halfSz * getRealSizeFactor(sides);
                for (let li = 1; li <= poly.labyLevel; li++) {
                    const layerR = outerR * Math.pow(ds, li);
                    const layerAngleOff = (li % 2 === 0) ? polyAngleOffset(sides) : polyAngleOffset(sides) + Math.PI / sides;
                    sCtx.beginPath();
                    roundedPolygonPath(sCtx as any, sides, layerR, layerAngleOff);
                    sCtx.strokeStyle = strokeCol;
                    sCtx.stroke();
                    sCtx.fillStyle = color;
                    sCtx.fill();
                }
            }
        }
    }

    entry = { canvas, bufSize, lastUsedFrame: _shapeCacheFrame };
    _shapeCache.set(key, entry);
    _lastShapeKey = key;
    _lastShapeEntry = entry;
    evictShapeCache();
    return entry;
}

interface DeathCanvasCache {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    bufSize: number;
    scaledBufSize: number;
    initialScale: number;
    angle: number;
}
const enemyDeathCanvasCache = new Map<string, DeathCanvasCache>();

function _deathBufSize(enemy: EnemyTank, logic: GameLogic): number {
    const sizePx = enemy.size;
    const maxTurretLen = sizePx / 2 + sizePx * 10;
    const maxStroke = Math.max(2 / logic.zoom, sizePx / 12);
    const maxScale = 1.3;
    return Math.ceil((sizePx * maxScale + maxTurretLen) * 2.5 + maxStroke * 2);
}

function getOrCreateDeathCanvas(enemy: EnemyTank, logic: GameLogic): DeathCanvasCache {
    let cache = enemyDeathCanvasCache.get(enemy.id);
    if (cache) return cache;

    const bufSize = _deathBufSize(enemy, logic);
    const cs = Math.min(_currentCacheScale, Math.max(1, Math.floor(_MAX_SCRATCH_PX / bufSize)));
    const scaledBufSize = Math.ceil(bufSize * cs);

    const canvas = document.createElement('canvas');
    canvas.width = scaledBufSize;
    canvas.height = scaledBufSize;
    const ctx = canvas.getContext('2d', { alpha: true })!;
    ctx.lineJoin = 'round';

    ctx.save();
    ctx.translate(scaledBufSize / 2, scaledBufSize / 2);
    ctx.scale(cs, cs);
    renderEnemyToCache(ctx, logic, enemy);
    ctx.restore();

    cache = { canvas, ctx, bufSize, scaledBufSize, initialScale: 1, angle: enemy.angle };
    enemyDeathCanvasCache.set(enemy.id, cache);
    return cache;
}

function cleanupDeathCanvas(enemyId: string) {
    enemyDeathCanvasCache.delete(enemyId);
}

function clearEnemyDeathCanvasCache() {
    enemyDeathCanvasCache.clear();
}

function renderEnemyToCache(ctx: CanvasRenderingContext2D, logic: GameLogic, enemy: EnemyTank) {
    fillEnemyRenderData(enemy, logic);
    drawTankAndTurrets(ctx, true);
}

function drawEnemyFromDeathCache(targetCtx: CanvasRenderingContext2D, enemy: EnemyTank, logic: GameLogic, scale: number, alpha: number) {
    if (!enemyDeathCanvasCache.has(enemy.id) && _deathBufSize(enemy, logic) > _MAX_SCRATCH_PX) {
        targetCtx.save();
        targetCtx.globalAlpha = alpha;
        targetCtx.translate(enemy.position.x, enemy.position.y);
        targetCtx.rotate(enemy.angle);
        targetCtx.scale(scale, scale);
        renderEnemyToCache(targetCtx, logic, enemy);
        targetCtx.restore();
        return;
    }

    const cache = getOrCreateDeathCanvas(enemy, logic);

    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.translate(enemy.position.x, enemy.position.y);
    targetCtx.rotate(cache.angle);
    targetCtx.scale(scale, scale);
    targetCtx.drawImage(
        cache.canvas,
        0, 0, cache.scaledBufSize, cache.scaledBufSize,
        -cache.bufSize / 2, -cache.bufSize / 2, cache.bufSize, cache.bufSize
    );
    targetCtx.restore();
}

interface ViewportBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

const _viewportBounds: ViewportBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

const _fog = new FogField();
let _fogMatch = -1;
const _FOG_SHADES: string[] = [];
for (let i = 0; i <= 16; i++) _FOG_SHADES.push('rgb(' + i + ',' + i + ',' + i + ')');
function _fogShade(s: number): string { const i = Math.round(s * 255); return _FOG_SHADES[i < 0 ? 0 : i > 16 ? 16 : i]; }

function calculateViewportBounds(logic: GameLogic, width: number, height: number, margin: number = 300): ViewportBounds {
    const halfWidth = (width / 2) / logic.zoom;
    const halfHeight = (height / 2) / logic.zoom;

    let centerX: number, centerY: number;
    if (logic.isMapDesignerActive && !logic.state.isTestMode) {
      centerX = logic.mapDesignerCamX;
      centerY = logic.mapDesignerCamY;
    } else {
      centerX = logic.cameraX;
      centerY = logic.cameraY;
    }

    _viewportBounds.minX = centerX - halfWidth - margin;
    _viewportBounds.maxX = centerX + halfWidth + margin;
    _viewportBounds.minY = centerY - halfHeight - margin;
    _viewportBounds.maxY = centerY + halfHeight + margin;
    return _viewportBounds;
}

function isInViewport(x: number, y: number, radius: number, bounds: ViewportBounds): boolean {
    return x + radius >= bounds.minX &&
           x - radius <= bounds.maxX &&
           y + radius >= bounds.minY &&
           y - radius <= bounds.maxY;
}

function _gunReachOf(t: Turret): number {
    const off = Math.sqrt(t.xOffset * t.xOffset + t.yOffset * t.yOffset) * 0.5;
    if (t.look !== undefined) return off + lookUnit(t.look, 1) * lookReach(t.look);
    const asp = Math.abs(t.aspect ?? 1);
    if (t.turretType === 'auto') {
        const circleR = Math.abs(_mapVal(t.autoCircleSize ?? 25, 0, 50, 0, 0.96)) * 0.7;
        const k = circleR * 2 > 1 ? circleR * 2 : 1;
        const gun = (Math.abs(_mapVal(t.autoTurretLength ?? 10, 1, 100, 0.01, 10.5)) + Math.abs(_mapVal(t.autoTurretWidth ?? 25, 0, 50, 0, 0.96)) * asp * 0.5) * k;
        return off + (gun > circleR ? gun : circleR) + _autoSubsReach(t, circleR, 1);
    }
    return off + Math.abs(_mapVal(t.length, 1, 100, 0.01, 10.5)) + Math.abs(_mapVal(t.width, 0, 50, 0, 0.96)) * asp * 0.5;
}
function _layersRatio(layers: BodyLayer[] | null): number {
    let m = 1;
    if (layers !== null) for (let i = 0; i < layers.length; i++) { const r = Math.abs(layers[i].sizeRatio); if (r > m) m = r; }
    return m;
}
const _cullKByTurrets = new WeakMap<Turret[], { layers: BodyLayer[]; k: number }>();
function _tankCullR(enemy: EnemyTank): number {
    const ts = enemy.turrets;
    let rec = _cullKByTurrets.get(ts);
    if (rec === undefined || rec.layers !== enemy.bodyLayers) {
        let g = 0;
        for (let i = 0; i < ts.length; i++) { const r = _gunReachOf(ts[i]); if (r > g) g = r; }
        const ratio = _layersRatio(enemy.bodyLayers.length > 0 ? enemy.bodyLayers : null);
        const k0 = (g > 0.6 ? g : 0.6) * ratio;
        const k = k0 > 2 ? k0 : 2;
        if (rec === undefined) { rec = { layers: enemy.bodyLayers, k }; _cullKByTurrets.set(ts, rec); }
        else { rec.layers = enemy.bodyLayers; rec.k = k; }
    }
    return enemy.size * rec.k;
}
function _roundCullR(b: Bullet): number {
    const S = b.size * b.growth;
    const st = b.subTurrets;
    let g = 0;
    if (st) for (let i = 0; i < st.length; i++) { const td = st[i].turretData; const r = td ? _gunReachOf(td) : 11; if (r > g) g = r; }
    const k = (g > 0.6 ? g : 0.6) * _layersRatio(b._bulletBodyLayers);
    return S * (k > 1 ? k : 1);
}

const WORLD_STRETCH_SMOOTH = true;
const WORLD_STRETCH_INSET = WORLD_STRETCH_SMOOTH ? 0.5 : 0;

const _miniFlushRect = { x: 0, y: 0, w: 0, h: 0 };

function _compositeMiniFlush(ctx: CanvasRenderingContext2D, webgl: WebGLBulletRenderer): void {
    const src = webgl.getCanvas();
    const s = webgl.getRenderScale();
    if (webgl.getDirtyRectPx(_miniFlushRect)) {
        const r = _miniFlushRect;
        if (s >= 1) {
            ctx.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        } else {
            const sx = r.x * s, sy = r.y * s;
            let sw = r.w * s, sh = r.h * s;
            if (WORLD_STRETCH_INSET > 0) {
                const maxW = webgl.getViewW() - WORLD_STRETCH_INSET - sx;
                const maxH = webgl.getViewH() - WORLD_STRETCH_INSET - sy;
                if (sw > maxW) sw = maxW;
                if (sh > maxH) sh = maxH;
            }
            if (sw > 0 && sh > 0) {
                const prev = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = WORLD_STRETCH_SMOOTH;
                ctx.drawImage(src, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
                ctx.imageSmoothingEnabled = prev;
            }
        }
    } else {
        _compositeWorld(ctx, webgl);
    }
}

function _compositeWorld(ctx: CanvasRenderingContext2D, webgl: WebGLBulletRenderer): void {
    if (!webgl.hasDrawnSinceClear()) return;
    const src = webgl.getCanvas();
    const s = webgl.getRenderScale();
    if (s >= 1) { ctx.drawImage(src, 0, 0); return; }
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = WORLD_STRETCH_SMOOTH;
    ctx.drawImage(src, 0, 0, webgl.getViewW() - WORLD_STRETCH_INSET, webgl.getViewH() - WORLD_STRETCH_INSET,
                       0, 0, webgl.getCanvasW(), webgl.getCanvasH());
    ctx.imageSmoothingEnabled = prev;
}

function _restoreCameraTransform(ctx: CanvasRenderingContext2D, logic: GameLogic, canvasW: number, canvasH: number): void {
    if (logic.state.isTestMode) {
        ctx.setTransform(
            logic.zoom, 0, 0, logic.zoom,
            canvasW / 2 - logic.cameraX * logic.zoom,
            canvasH / 2 - logic.cameraY * logic.zoom
        );
    } else {
        ctx.setTransform(
            logic.zoom, 0, 0, logic.zoom,
            canvasW / 2 - logic.cameraX * logic.zoom,
            canvasH / 2 - logic.cameraY * logic.zoom
        );
    }
}

function _pushWallLook(webgl: WebGLBulletRenderer, wl: WallLook, px: number, py: number, half: number, depth: number,
    tSlot: number = -1, tHex: string = ''): number {
    const look = wl.look, items = look.list.items, memo = look.memo;
    const unit = half * wl.perHalf;
    for (let i = 0; i < items.length; i++) {
        const it = items[i], p = it.part;
        const key = webgl.lookBatchKey(p, memo[i]);
        if (key === '') continue;
        const R = p.radius * unit;
        const own = wl.bodyMap < 0 || p.colorMap !== wl.bodyMap;
        _hexToRGB(own || tSlot === -1 ? _shapeLookFill(p.color, p.colorMap) : tSlot >= 0 ? _shapeLookFill(p.color, tSlot) : (tHex || p.color), _lookColor, 0);
        if (p.kind === 'line') webgl.pushGeomInstance('look_line', px + it.lx * unit, py + it.ly * unit, it.rot, R, 1,
            _lookColor[0], _lookColor[1], _lookColor[2], 0, depth, 1.0, 1.0);
        else webgl.pushGeomInstance(key, px + it.lx * unit, py + it.ly * unit, p.kind === 'circle' ? 0 : it.rot, R, R,
            _lookColor[0], _lookColor[1], _lookColor[2], 0, depth, 1.0, 1.0);
        depth -= _LOOK_DEPTH_STEP;
    }
    return depth;
}

function _drawPanelWalls(ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number,
    hw: ReturnType<typeof halloweenLook>): void {
    const ad = logic.admin;
    const walls = ad.lookWalls;
    if (walls.length > 0) {
        webgl.setDepthTestEnabled(true);
        webgl.beginFrame();
        let depth = _LOOK_DEPTH_START;
        let seeThrough = false;
        let mineHex = '';
        for (let i = 0; i < walls.length; i++) {
            const w = walls[i];
            if (!w.active || !w.look) continue;
            if (w.kind !== undefined && w.kind !== 0 && logic.wallDrawAlpha(w) < 0.999) { seeThrough = true; continue; }
            if (depth < _LOOK_DEPTH_FLOOR) {
                const has = webgl.hasGeomContent();
                webgl.flushGeom();
                if (has) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); _compositeWorld(ctx, webgl); ctx.restore(); _restoreCameraTransform(ctx, logic, width, height); }
                webgl.beginFrame();
                depth = _LOOK_DEPTH_START;
            }
            const ts = logic.wallTintSlot(w);
            if (ts === -2 && mineHex === '') mineHex = _adminPlayerFill(logic);
            depth = _pushWallLook(webgl, w.look, w.x, w.y, Math.min(w.halfW, w.halfH) - 1.5, depth, ts, mineHex);
        }
        const has = webgl.hasGeomContent();
        webgl.flushGeom();
        if (has) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); _compositeWorld(ctx, webgl); ctx.restore(); _restoreCameraTransform(ctx, logic, width, height); }
        let lastA = -1;
        while (seeThrough) {
            let a = 2;
            for (let i = 0; i < walls.length; i++) {
                const w = walls[i];
                if (!w.active || !w.look || w.kind === undefined || w.kind === 0) continue;
                const x = logic.wallDrawAlpha(w);
                if (x < 0.999 && x > lastA && x < a) a = x;
            }
            if (a >= 2) break;
            webgl.beginFrame();
            let d2 = _LOOK_DEPTH_START;
            for (let i = 0; i < walls.length; i++) {
                const w = walls[i];
                if (!w.active || !w.look || w.kind === undefined || w.kind === 0 || logic.wallDrawAlpha(w) !== a) continue;
                if (d2 < _LOOK_DEPTH_FLOOR) {
                    const h1 = webgl.hasGeomContent();
                    webgl.flushGeom();
                    if (h1) _pastePanelFrame(ctx, logic, webgl, width, height, a);
                    webgl.beginFrame();
                    d2 = _LOOK_DEPTH_START;
                }
                const ts = logic.wallTintSlot(w);
                if (ts === -2 && mineHex === '') mineHex = _adminPlayerFill(logic);
                d2 = _pushWallLook(webgl, w.look, w.x, w.y, Math.min(w.halfW, w.halfH) - 1.5, d2, ts, mineHex);
            }
            const h2 = webgl.hasGeomContent();
            webgl.flushGeom();
            if (h2) _pastePanelFrame(ctx, logic, webgl, width, height, a);
            lastA = a;
        }
        webgl.setDepthTestEnabled(false);
    }
    const now = logic.gameNow();
    const dying = ad.dying;
    _hexToRGB(wallDefault(), _gColor, 0);
    const wr = _gColor[0], wg = _gColor[1], wb = _gColor[2];
    const eyes = hw !== null && hw.eyeList !== null ? hwEyeTable() : null;
    for (let i = 0; i < dying.length; i++) {
        const d = dying[i];
        const c = deathC((now - d.at) / 1000);
        if (c <= 0) continue;
        const k = deathScale(c);
        webgl.setDepthTestEnabled(d.look !== null);
        webgl.beginFrame();
        let eo = -1;
        if (d.look) _pushWallLook(webgl, d.look, d.x, d.y, (Math.min(d.halfW, d.halfH) - 1.5) * k, _LOOK_DEPTH_START, d.slot);
        else {
            if (d.slot >= 0) _hexToRGB(wallFill(d.slot), _gColor, 0);
            webgl.pushGeomInstance('rect', d.x, d.y, 0, (d.halfW - 1.5) * 2 * k, (d.halfH - 1.5) * 2 * k,
                d.slot >= 0 ? _gColor[0] : wr, d.slot >= 0 ? _gColor[1] : wg, d.slot >= 0 ? _gColor[2] : wb, 0, 0.0, 1.0, 1.0);
            if (eyes !== null && eyes.look === hw && d.wi >= 0 && d.wi < eyes.n) {
                const o = d.wi * EYE_STRIDE, t = eyes.t;
                if (t[o + E_UNIT] > 0) {
                    eo = o;
                    pushOtherList(webgl, hw!.eyeList!, hw!.eyeKeys, hwEyeRgb(hw!), d.x + (t[o + E_X] - d.x) * k, d.y + (t[o + E_Y] - d.y) * k,
                        t[o + E_UNIT] * k, t[o + E_TURN], eyeAimOf(eyes, o), 1.0);
                }
            }
        }
        const has = webgl.hasGeomContent();
        webgl.flushGeom();
        if (eo >= 0 && eyeAlpha() < 1) {
            const t = eyes!.t, body = hw!.eyeList!.items[0], R = body.part.radius * t[eo + E_UNIT] * k, _wc = hwWallRgb(hw!);
            webgl.setSampleAlphaToCoverage(false);
            webgl.beginGeomFrame();
            webgl.pushGeomInstance(HW_VEIL, d.x + (t[eo + E_X] - d.x) * k, d.y + (t[eo + E_Y] - d.y) * k, t[eo + E_TURN] + body.rot, R, R,
                _wc[0], _wc[1], _wc[2], 0, 0.0, 1.0, 1 - eyeAlpha());
            webgl.flushGeom();
            webgl.setSampleAlphaToCoverage(true);
        }
        webgl.setDepthTestEnabled(false);
        if (has) _pastePanelFrame(ctx, logic, webgl, width, height, d.look !== null && WALL_TYPES_4S.ON ? c * wallLookAlpha(d.look.type, Infinity) : c);
    }
    const rocks = ad.dyingRocks;
    const pk = hw !== null ? hw.pumpkinList : null;
    for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i];
        const c = deathC((now - r.at) / 1000);
        if (c <= 0) continue;
        const k = deathScale(c);
        webgl.setDepthTestEnabled(false);
        webgl.beginFrame();
        if (pk !== null && rockWearsPumpkin(r.shape)) {
            const pt = rockTurn(r);
            pushOtherList(webgl, pk, hw!.pumpkinKeys, hwPumpkinRgb(hw!), r.x, r.y, r.size * k, pt, pt, 1.0);
        } else {
            const sides = Math.abs(r.shape);
            if (r.slot >= 0) _hexToRGB(wallFill(r.slot), _gColor, 0);
            if (sides >= 3) webgl.pushGeomInstance(webgl.getOrCreateStarBatch(sides, 6 / (sides * sides), false), r.x, r.y, r.rotation,
                r.size * k, r.size * k, r.slot >= 0 ? _gColor[0] : wr, r.slot >= 0 ? _gColor[1] : wg, r.slot >= 0 ? _gColor[2] : wb, 0, 0.0, 1.0, 1.0);
        }
        const has = webgl.hasGeomContent();
        webgl.flushGeom();
        if (has) _pastePanelFrame(ctx, logic, webgl, width, height, c);
    }
}

function _drawPanelDots(ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number): void {
    const ad = logic.admin, now = logic.gameNow();
    for (let i = 0; i < 2; i++) {
        const c = ad.dotC(i, now);
        if (c <= 0) continue;
        const R = ADMIN_DOT_R * (c < 1 ? deathScale(c) : 1);
        webgl.setDepthTestEnabled(false);
        webgl.beginFrame();
        webgl.pushGeomInstance('circle', ad.dotX[i], ad.dotY[i], 0, R, R, 1, 1, 1, 0, 0.0, 1.0, 1.0);
        const has = webgl.hasGeomContent();
        webgl.flushGeom();
        if (has) _pastePanelFrame(ctx, logic, webgl, width, height, ADMIN_DOT_ALPHA * c);
    }
}
const ADMIN_DOT_ALPHA = 0.3;

function _pastePanelFrame(ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number, alpha: number): void {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    _compositeMiniFlush(ctx, webgl);
    ctx.globalAlpha = 1.0;
    ctx.restore();
    _restoreCameraTransform(ctx, logic, width, height);
}

function _typedInField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type !== 'range' && type !== 'checkbox' && type !== 'radio' && type !== 'button';
}

function _bulletIsGhostly(b: Bullet, ghostMode: boolean, playerId: string): boolean {
  if (b._ownerGhost) return true;
  if (!ghostMode) return false;
  return b.ownerId === playerId
    || (AI_CONSTANTS.GHOST_FAMILY !== 0 && b._tapRootId === playerId);
}

const _hardcodedColorOwnerSet: Set<string> = new Set();
let _hardcodedSetFrame = -1;

function _liveBotFill(logic: GameLogic, e: EnemyTank): string {
    const s = logic.liveColorSlotOf(e);
    if (s >= 0) return bodyFill('', s);
    if (s === -2) return _adminPlayerFill(logic);
    const i = logic.enemyColorTeamIndex(e);
    return i >= 0 ? _teamColor(i) : '';
}
function _livePlayerFill(logic: GameLogic): string {
    const s = logic.liveColorSlotOf(null);
    if (s >= 0) return bodyFill('', s);
    const i = logic.playerColorTeamIndex();
    return i >= 0 ? _teamColor(i) : '';
}
const _lcFill: Map<string, string> = new Map();
let _lcStamp = -1;
let _lcFrameStamp = 0;
const _lcGone = '\u0000';
function _liveOwnerFill(logic: GameLogic, id: string, stamp: number): string {
    if (_lcStamp !== stamp) { _lcFill.clear(); _lcStamp = stamp; }
    let f = _lcFill.get(id);
    if (f !== undefined) return f;
    if (id === logic.state.playerId) f = logic.tankDying ? _lcGone : _livePlayerFill(logic);
    else { const e = logic.liveBotById(id); f = e !== undefined ? _liveBotFill(logic, e) : _lcGone; }
    _lcFill.set(id, f);
    return f;
}
function _applyLiveOwnerColors(logic: GameLogic, sortIdx: Int32Array, sortLen: number, bulletsArr: Bullet[], stamp: number): void {
    for (let si = 0; si < sortLen; si++) {
        const b = bulletsArr[sortIdx[si]];
        const f = _liveOwnerFill(logic, b.ownerId, stamp);
        if (f === _lcGone) continue;
        if (f !== '') { _paintRoundTeam(b, -1, f); b._liveCol = true; continue; }
        if (b._liveCol) {
            b._liveCol = false;
            const e = b.ownerId === logic.state.playerId ? null : logic.liveBotById(b.ownerId);
            _paintRoundTeam(b, -1, e ? bodyFill(e.color, e.colorMap) : bodyFill(logic.state.tankColor, logic.state.tankColorMap));
        }
    }
}
function _adminPlayerFill(logic: GameLogic): string {
    const slot = logic.admin.playerSlot();
    if (slot >= 0) return bodyFill('', slot);
    const pci = logic.playerColorTeamIndex();
    return pci >= 0 ? _teamColor(pci) : bodyFill(logic.state.tankColor, logic.state.tankColorMap);
}
function _applyPanelRoundColors(logic: GameLogic, sortIdx: Int32Array, sortLen: number, bulletsArr: Bullet[]): void {
    const ad = logic.admin;
    const pid = logic.state.playerId;
    const pSlot = ad.playerSlot();
    const pFill = pSlot >= 0 ? bodyFill('', pSlot) : '';
    const bots = ad.botSlots.size > 0 || ad.botMine.size > 0;
    for (let si = 0; si < sortLen; si++) {
        const b = bulletsArr[sortIdx[si]];
        let fill = '';
        if (b.ownerId === pid || b._tapRootId === pid) fill = pFill;
        else if (bots) {
            const bs = ad.botSlot(b.ownerId);
            fill = bs >= 0 ? bodyFill('', bs) : bs === -2 ? _adminPlayerFill(logic) : '';
        }
        if (fill !== '') _paintRoundTeam(b, -1, fill);
    }
}

function _applyBulletTeamColors(logic: GameLogic, sortIdx: Int32Array, sortLen: number, bulletsArr: Bullet[]): void {
    const _bgm2 = logic.state.gameModeConfig;
    const _isTDM2 = teamColourMode(_bgm2.mode);
    const _isFFA2 = isFfaStyleMode(_bgm2.mode);
    const _manhunt2 = isManhuntMode(_bgm2.mode);
    const _mhLeaderId2 = _manhunt2 ? logic.state.manhuntLeaderId : null;
    const _pg2 = logic.playerGroupId;
    const _teamBulletColorActive2 = (_isTDM2 || _isFFA2) && logic.state.isTestMode;
    const _playerTeamIdx2 = _isTDM2 ? _bgm2.playerTeam - 1 : -1;
    const _playerId2 = logic.state.playerId;
    const _playerBulletTeamOverride = _isTDM2 &&
      (_bgm2.mode !== 'old-dreadnoughts' || logic.getPlayerTeam() !== dreadTeamId());
    const _playerIdx2 = logic.playerColorTeamIndex();

    const _odMode2 = _bgm2.mode === 'old-dreadnoughts';
    if (_teamBulletColorActive2) {
      if (_hardcodedSetFrame !== logic.frameCounter) {
        _hardcodedColorOwnerSet.clear();
        const _ets = logic.state.enemyTanks;
        for (let _hi = 0; _hi < _ets.length; _hi++) {
          const _hen = _ets[_hi];
          if (_hen.active && logic.enemyKeepsOwnColor(_hen)) _hardcodedColorOwnerSet.add(_hen.id);
        }
        _hardcodedSetFrame = logic.frameCounter;
      }
      const _hasHardcodedOwners = _hardcodedColorOwnerSet.size > 0;
      for (let si = 0; si < sortLen; si++) {
        const b = bulletsArr[sortIdx[si]];
        const _gi = _guardRoundTeam(b);
        if (_gi >= 0) { _paintRoundTeam(b, _gi); continue; }
        if (b._keepOwn || b._liveCol) continue;
        if (_hasHardcodedOwners && _hardcodedColorOwnerSet.has(b.ownerId)) { b._keepOwn = true; continue; }
        if (b.ownerId === _playerId2) {
          if (_playerIdx2 >= 0) {
            _paintRoundTeam(b, _playerIdx2);
          }
          continue;
        }
        if (_mhLeaderId2 !== null && (b.ownerId === _mhLeaderId2 || b._tapRootId === _mhLeaderId2)) {
          _paintRoundTeam(b, 2);
          continue;
        }
        const _bBeh = b.ownerBehavior;
        if (_bBeh === 'Team1' || _bBeh === 'Team2' || _bBeh === 'Team3' || _bBeh === 'Team4' || _bBeh === 'Team5') {
          if (_bBeh === 'Team5') { _paintRoundTeam(b, TEAM_IDX_DREAD); continue; }
          if (_odMode2 && (_bBeh === dreadBehavior() || b.team === dreadTeamId())) continue;
          _paintRoundTeam(b, parseInt(_bBeh.charAt(4)) - 1);
        } else if (_playerBulletTeamOverride && b._tapRootId === _playerId2 && _playerTeamIdx2 >= 0) {
          _paintRoundTeam(b, _playerTeamIdx2);
        } else if (_isFFA2 && _bBeh === 'FFA') {
          _paintRoundTeam(b, _pg2 !== 0 && b.groupId === _pg2 ? 0 : 1);
        } else if (_isFFA2 && b._tapRootId === _playerId2) {
          _paintRoundTeam(b, 0);
        } else if (_isFFA2 && b._tapRootId !== '' && b._tapRootId !== _playerId2) {
          _paintRoundTeam(b, _pg2 !== 0 && b.groupId === _pg2 ? 0 : 1);
        }
      }
    } else if (logic.state.isTestMode) {
      for (let si = 0; si < sortLen; si++) {
        const b = bulletsArr[sortIdx[si]];
        if (b._liveCol) continue;
        const _gi = _guardRoundTeam(b);
        if (_gi >= 0) _paintRoundTeam(b, _gi);
      }
    }
    if (logic.admin.colorsOn && logic.state.isTestMode) _applyPanelRoundColors(logic, sortIdx, sortLen, bulletsArr);
    if (logic.state.isTestMode) _applyLiveOwnerColors(logic, sortIdx, sortLen, bulletsArr, _lcFrameStamp);
}

function _guardRoundTeam(b: Bullet): number {
    if (!b.ownerIsBaseProtector) return -1;
    const beh = b.ownerBehavior;
    return (beh === 'Team1' || beh === 'Team2' || beh === 'Team3' || beh === 'Team4') ? parseInt(beh.charAt(4)) - 1 : -1;
}
function _paintRoundTeam(b: Bullet, index: number, fill?: string): void {
    const nc = fill !== undefined ? fill : _teamColor(index);
    if (b.color !== nc || b.colorMap !== CM_FREE) { b.color = nc; b.colorMap = CM_FREE; b._renderDirty = true; }
    if (b._bulletBodyColor !== '') { b._bulletBodyColor = ''; b._bulletBodyColorMap = undefined; }
}

function _renderBulletBatch(
    ctx: CanvasRenderingContext2D,
    logic: GameLogic,
    webgl: any,
    useWebGL: boolean,
    sortIdx: Int32Array,
    sortLen: number,
    bulletsArr: Bullet[],
    viewportBounds: ReturnType<typeof calculateViewportBounds>,
    bulletStrokeWidth: number,
    width: number,
    height: number,
    camOffX: number,
    camOffY: number,
    skipSimple: boolean = false,
): void {
    if (sortLen === 0) return;

    _applyBulletTeamColors(logic, sortIdx, sortLen, bulletsArr);

    if (useWebGL && webgl) {
        const _ghostMode = logic.state.ghostMode;
        const _playerId = logic.state.playerId;

        if (!skipSimple)
        for (let si = 0; si < sortLen; si++) {
            const _idx = sortIdx[si];
            const b = bulletsArr[_idx];

            const sz = b.size * b.growth;
            if (!isInViewport(b.position.x, b.position.y, sz, viewportBounds)) continue;

            if (b.subTurrets && b.subTurrets.length > 0) continue;
            if (b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0) continue;
            if (b.inExitPhase && !_exitSubBulletToWebGL(b)) continue;
            if (b.labyLevel > 0 && !b.inExitPhase && b.opacity > 0 && _wglUnifiedPassActive && _dyingBulletDeferCount < _MAX_DYING_BULLET_DEFER) {
                const _uGhost = _bulletIsGhostly(b, _ghostMode, _playerId);
                if (_roundIsUnit(b, _uGhost)) {
                    const _uDepth = _deferRoundUnit(b, (b.opacity / 255) * (_uGhost ? 0.3 : 1));
                    if (_idx < _bulletDepthMap.length) _bulletDepthMap[_idx] = _uDepth;
                    continue;
                }
            }

            const alpha = plainRoundAlpha(b.opacity, b._fadeT, b._fadeO0,
                _bulletIsGhostly(b, _ghostMode, _playerId) ? 0.3 : 1, webgl.alphaIsSpread());

            const mappedColor = _roundFill(b);
            _hexToRGB(mappedColor, _gColor, 0);
            const br = _gColor[0], bg = _gColor[1], bb = _gColor[2];

            const intSides = b.shapeSides >= 3 ? Math.floor(b.shapeSides) : b.shapeSides;

            const _aAbove = _aboveRoundDepth >= 0 && b.aboveBody;
            const bulletDepth = _aboveOr(b, Math.max(_BULLET_DEPTH_START, _BULLET_DEPTH_END - (_geoBulletGlobalSlot++) * _BULLET_DEPTH_STEP));
            if (_idx < _bulletDepthMap.length) _bulletDepthMap[_idx] = bulletDepth;

            if (intSides < 3) {
                const half = sz / 2;
                webgl.pushGeomInstance('circle', b.position.x, b.position.y, 0,
                    half, half, br, bg, bb, b.damageOverlay, bulletDepth, 1.0, alpha);
            } else if (b.trapDepth > 0) {
                const starKey = webgl.getOrCreateStarBatch(intSides, b.trapDepth, b.trapCurved);
                const half = (sz / 2) * getRealSizeFactor(intSides);
                const triAdj = (intSides === 3) ? _TRI_WEBGL_OFFSET : 0;
                webgl.pushGeomInstance(starKey, b.position.x, b.position.y, b.facingAngle + triAdj,
                    half, half, br, bg, bb, b.damageOverlay, bulletDepth, 1.0, alpha);
            } else {
                const half = (sz / 2) * getRealSizeFactor(intSides);
                const batchKey = intSides <= 16 ? POLY_BATCH_KEY[intSides] : 'circle';
                const evenOff = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
                const fracRot = (b.shapeSides % 1) * Math.PI * 2;
                const triAdj = _roundTurn(b.shapeSides, true);
                webgl.pushGeomInstance(batchKey, b.position.x, b.position.y,
                    b.facingAngle + evenOff + fracRot + triAdj,
                    half, half, br, bg, bb, b.damageOverlay, bulletDepth, 1.0, alpha);
            }

            if (b.labyLevel > 0) {
                const ds = labyDownscale(b.shapeSides);
                if (intSides < 3) {
                    for (let li = 1; li <= b.labyLevel; li++) {
                        const layerR = (sz / 2) * Math.pow(ds, li);
                        const ldl = Math.max(_BULLET_DEPTH_START, _BULLET_DEPTH_END - (_geoBulletGlobalSlot++) * _BULLET_DEPTH_STEP);
                        const ld = _aAbove ? _aboveRoundDepth - (li < _UNIT_SUB_MAX ? li : _UNIT_SUB_MAX) * _GEO_DEPTH_SPACING : ldl;
                        webgl.pushGeomInstance('circle', b.position.x, b.position.y, 0,
                            layerR, layerR, br, bg, bb, b.damageOverlay, ld, 1.0, alpha);
                    }
                } else {
                    const outerR = (sz / 2) * getRealSizeFactor(intSides);
                    const nestKey = intSides <= 16 ? POLY_BATCH_KEY[intSides] : 'circle';
                    const evenOff2 = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
                    const triAdj2 = b.trapDepth > 0 ? ((intSides === 3) ? _TRI_WEBGL_OFFSET : 0) : _roundTurn(b.shapeSides, true);
                    const mainRot = b.facingAngle + evenOff2 + triAdj2;
                    for (let li = 1; li <= b.labyLevel; li++) {
                        const layerR = outerR * Math.pow(ds, li);
                        const layerRot = (li % 2 !== 0) ? mainRot + Math.PI / intSides : mainRot;
                        const ldl = Math.max(_BULLET_DEPTH_START, _BULLET_DEPTH_END - (_geoBulletGlobalSlot++) * _BULLET_DEPTH_STEP);
                        const ld = _aAbove ? _aboveRoundDepth - (li < _UNIT_SUB_MAX ? li : _UNIT_SUB_MAX) * _GEO_DEPTH_SPACING : ldl;
                        webgl.pushGeomInstance(nestKey, b.position.x, b.position.y,
                            layerRot, layerR, layerR, br, bg, bb, b.damageOverlay, ld, 1.0, alpha);
                    }
                }
            }
        }

        for (let si = 0; si < sortLen; si++) {
            const _idx3 = sortIdx[si];
            const b = bulletsArr[_idx3];

            const _hasST = b.subTurrets && b.subTurrets.length > 0;
            const _hasBL = b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0;
            if (!_hasST && !_hasBL && !b.inExitPhase) continue;
            if (ML_BULLETS_EMITTED_ONCE ? skipSimple : (skipSimple && b.sourceLayerOrder >= 0)) continue;
            if (!isInViewport(b.position.x, b.position.y, _roundCullR(b), viewportBounds)) continue;
            let alpha = b.opacity / 255;
            const _ghostly3 = _bulletIsGhostly(b, _ghostMode, _playerId);
            if (_ghostly3) alpha *= 0.3;

            if ((_hasST || _hasBL) && !b.inExitPhase) {
                if (b.isFading && alpha <= 0) continue;
                if ((b.isFading || (alpha > 0 && _roundIsUnit(b, _ghostly3))) && _wglUnifiedPassActive && webgl && _dyingBulletDeferCount < _MAX_DYING_BULLET_DEFER) {
                    _dyingBulletDeferRef[_dyingBulletDeferCount] = b;
                    if (FADE_KEEPS_ALIVE_Z) {
                        _dyingBulletDeferDepth[_dyingBulletDeferCount] = _aboveOr(b, Math.max(_BULLET_DEPTH_START,
                            _BULLET_DEPTH_END - (_geoBulletGlobalSlot++) * _BULLET_DEPTH_STEP));
                    }
                    _dyingBulletDeferAlpha[_dyingBulletDeferCount] = alpha;
                    _dyingBulletDeferScale[_dyingBulletDeferCount] = 1.0;
                    _dyingBulletDeferPosX[_dyingBulletDeferCount] = b.position.x;
                    _dyingBulletDeferPosY[_dyingBulletDeferCount] = b.position.y;
                    _dyingBulletDeferCount++;
                    if (_idx3 < _bulletDepthMap.length) _bulletDepthMap[_idx3] = FADE_KEEPS_ALIVE_Z ? _dyingBulletDeferDepth[_dyingBulletDeferCount - 1] : _bulletDepth(_geoBulletEntityIdx, 0);
                } else {
                    const _hpSlot0 = _geoBulletGlobalSlot;
                    const _tAbove = _aboveRoundDepth >= 0 && b.aboveBody && _geoUnitDepthOn === 0;
                    if (_tAbove) { _geoUnitDepthBuf[0] = _aboveRoundDepth; _geoUnitSub = 0; _geoUnitDepthOn = 2; }
                    _emitTurrettedBulletGeometry(webgl, b, alpha);
                    if (_tAbove) _geoUnitDepthOn = 0;
                    if (_idx3 < _bulletDepthMap.length) _bulletDepthMap[_idx3] = _geoBulletGlobalSlot > _hpSlot0
                        ? Math.max(_BULLET_DEPTH_START, _BULLET_DEPTH_END - (_geoBulletGlobalSlot - 1) * _BULLET_DEPTH_STEP)
                        : _bulletDepth(_geoEntityIdx, 0);
                }
            } else if (b.inExitPhase && !_exitSubBulletToWebGL(b)) {
                _drawExitingBullet(ctx, logic, b, alpha);
            }
        }

    }
}

type GeomSink = GeomPusher & Pick<WebGLBulletRenderer, 'getOrCreateStarBatch'>;

function _wallShownHex(w: NonNullable<typeof GameLogic.prototype.mapState>['walls'][number], slot: number | undefined, mine: boolean, mineHex: string): string {
    return mine ? mineHex
        : slot !== undefined ? wallFill(slot) : w.door !== undefined ? _doorHex(false)
        : w.paintSlot !== undefined ? wallFill(w.paintSlot) : w.paintHex !== undefined ? w.paintHex
        : w.kind !== undefined && w.kind > 0 && WALL_TYPES_4S.ON && WALL_RULES[w.kind] !== undefined && WALL_RULES[w.kind].slot !== 7 ? wallFill(w.wslot !== undefined && w.wslot >= 0 ? w.wslot : WALL_RULES[w.kind].slot)
        : w.type === TileType.WALL ? wallDefault()
        : (w.type >= TileType.BASE_BLUE && w.type <= TileType.BASE_PURPLE)
            ? _teamColor(w.type - TileType.BASE_BLUE)
            : (WALL_COLORS[w.type] || wallDefault());
}
let _veilWalls: NonNullable<typeof GameLogic.prototype.mapState>['walls'] | null = null;
let _veilSlots: WeakMap<object, number> | null = null, _veilTeam = 0, _veilMineHex = '';
function _veilRgbOfRow(row: number, out: Float64Array): void {
    const ws = _veilWalls;
    const w = ws !== null && row >= 0 && row < ws.length ? ws[row] : undefined;
    if (w === undefined) { _hexToRGB(wallDefault(), out, 0); return; }
    const slot = _veilSlots !== null ? _veilSlots.get(w) : undefined;
    const mine = _veilMineHex !== '' && (w.wteam !== undefined ? w.wteam : WALL_TEAM) === _veilTeam;
    _hexToRGB(_wallShownHex(w, slot, mine, _veilMineHex), out, 0);
}
function _glPushWalls(webgl: GeomSink, walls: NonNullable<typeof GameLogic.prototype.mapState>['walls'], hide: ReturnType<typeof dragHideInfo>,
    slots: WeakMap<object, number> | null, mineTeam: number = 0, mineHex: string = ''): void {
    const wallInset = 1.5;
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (!w.active) continue;
        if (w.look && WALL_TYPES_4S.ON) continue;
        if (hide !== null && hide.kind === 'wall'
            && Math.abs(w.x - hide.x) < hide.halfW
            && Math.abs(w.y - hide.y) < hide.halfH) continue;

        const slot = slots !== null ? slots.get(w) : undefined;
        const mine = mineHex !== '' && (w.wteam !== undefined ? w.wteam : WALL_TEAM) === mineTeam;
        const color = _wallShownHex(w, slot, mine, mineHex);
        _hexToRGB(color, _gColor, 0);
        const wr = _gColor[0], wg = _gColor[1], wb = _gColor[2];
        const wa = !mine && slot === undefined && w.paintAlpha !== undefined ? w.paintAlpha : 1;
        if (wa < 1) _seeThruPushed = true;
        if (w.block !== undefined && w.block > 0) { _glPushBlocks(webgl, w, w.block, wallInset, wr, wg, wb, wa); continue; }
        const whInset = w.halfW - wallInset;
        const hhInset = w.halfH - wallInset;
        if (whInset > 0 && hhInset > 0) {
            webgl.pushGeomInstance('rect', w.x, w.y, 0,
                whInset * 2, hhInset * 2, wr, wg, wb, 0, 0.0, 1.0, wa);
        }
    }
}

let _seeThruPushed = false;

function _glPushBlocks(webgl: GeomSink, w: { x: number; y: number; halfW: number; halfH: number }, bk: number, inset: number, r: number, g: number, b: number, a: number = 1): void {
    const nx = Math.max(1, Math.round(w.halfW * 2 / bk)), ny = Math.max(1, Math.round(w.halfH * 2 / bk));
    const x0 = w.x - w.halfW, y0 = w.y - w.halfH, side = bk - inset * 2;
    if (side <= 0) return;
    for (let i = 0; i < nx; i++) for (let c = 0; c < ny; c++) webgl.pushGeomInstance('rect', x0 + (i + 0.5) * bk, y0 + (c + 0.5) * bk, 0, side, side, r, g, b, 0, 0.0, 1.0, a);
}

let _doorBase = '', _doorShut = '', _doorOpen = '';
let _doorBaseW = '', _doorBaseG = '';
const DOOR_OPEN_EDGE_ALPHA = 0.5, DOOR_EDGE_WIDTH = 3;
function _doorHex(open: boolean): string {
    const base = wallDefault(), ground = gridBg();
    if (SMALL_FIX.G727 !== 0 ? (base !== _doorBaseW || ground !== _doorBaseG) : base + ground !== _doorBase) {
        _doorBaseW = base; _doorBaseG = ground;
        _doorBase = SMALL_FIX.G727 !== 0 ? '' : base + ground;
        _hexToRGB(ground, _gColor, 0);
        const g0 = _gColor[0], g1 = _gColor[1], g2 = _gColor[2];
        _hexToRGB(base, _gColor, 0);
        const hex = (f: (c: number) => number) => '#' + [0, 1, 2].map(c => Math.round(f(c) * 255).toString(16).padStart(2, '0')).join('');
        const gr = [g0, g1, g2];
        _doorShut = hex(c => _gColor[c] + (1 - _gColor[c]) * 0.18);
        _doorOpen = hex(c => _gColor[c] * 0.3 + gr[c] * 0.7);
    }
    return open ? _doorOpen : _doorShut;
}

function _glPushRocks(
    webgl: GeomSink, rocks: NonNullable<typeof GameLogic.prototype.mapState>['rocks'], hw: ReturnType<typeof halloweenLook>,
    rvLeft: number, rvRight: number, rvTop: number, rvBottom: number, hide: ReturnType<typeof dragHideInfo>,
    slots: WeakMap<object, number> | null,
): void {
    const rockColor = wallDefault();
    _hexToRGB(rockColor, _gColor, 0);
    const rr = _gColor[0], rg = _gColor[1], rb = _gColor[2];
    const _hwPk = hw !== null ? hw.pumpkinList : null;
    const _hwPkRgb = (hw !== null && _hwPk !== null) ? hwPumpkinRgb(hw) : null;
    const _hwPkReach = (hw !== null && _hwPk !== null) ? hw.pumpkinReach : 1;

    for (let ri = 0; ri < rocks.length; ri++) {
        const rock = rocks[ri];
        if (!rock.active) continue;
        if (hide !== null && hide.kind === 'rock'
            && Math.abs(rock.x - hide.x) < 1 && Math.abs(rock.y - hide.y) < 1) continue;
        const _pkHere = _hwPk !== null && rockWearsPumpkin(rock.shape);
        const rHalf = _pkHere ? rock.size * _hwPkReach + EYE_LINE : rock.size;
        if (rock.x + rHalf < rvLeft || rock.x - rHalf > rvRight ||
            rock.y + rHalf < rvTop || rock.y - rHalf > rvBottom) continue;

        const sides = Math.abs(rock.shape);
        if (sides < 3) continue;
        if (hw !== null && _hwPk !== null && _hwPkRgb !== null && _pkHere) {
            const _pt = rockTurn(rock);
            pushOtherList(webgl, _hwPk, hw.pumpkinKeys, _hwPkRgb, rock.x, rock.y, rock.size, _pt, _pt, 1.0);
            continue;
        }
        const starDepth = 6 / (sides * sides);
        const starKey = webgl.getOrCreateStarBatch(sides, starDepth, false);
        const slot = slots !== null ? slots.get(rock) : undefined;
        if (slot !== undefined) {
            _hexToRGB(wallFill(slot), _gColor, 0);
            webgl.pushGeomInstance(starKey, rock.x, rock.y, rock.rotation, rock.size, rock.size, _gColor[0], _gColor[1], _gColor[2], 0, 0.0, 1.0, 1.0);
            continue;
        }
        if (rock.paintSlot !== undefined || rock.paintHex !== undefined || rock.paintAlpha !== undefined) {
            _hexToRGB(rock.paintSlot !== undefined ? wallFill(rock.paintSlot) : rock.paintHex !== undefined ? rock.paintHex : rockColor, _gColor, 0);
            const ra = rock.paintAlpha ?? 1;
            if (ra < 1) _seeThruPushed = true;
            webgl.pushGeomInstance(starKey, rock.x, rock.y, rock.rotation, rock.size, rock.size, _gColor[0], _gColor[1], _gColor[2], 0, 0.0, 1.0, ra);
            continue;
        }
        webgl.pushGeomInstance(starKey, rock.x, rock.y, rock.rotation,
            rock.size, rock.size, rr, rg, rb, 0, 0.0, 1.0, 1.0);
    }
}

const _EDITOR_GPU_OFF: boolean = typeof location !== 'undefined' && /[?&]oldeditor(?:[=&]|$)/.test(location.search);
const EDITOR_GPU = !_EDITOR_GPU_OFF;

function _editorOnGpu(webgl: WebGLBulletRenderer | null, useWebGL: boolean): boolean {
    return EDITOR_GPU && useWebGL && webgl !== null && !webgl.isSoftware() && webgl.initGeomProgram();
}

function _editorGLBegin(webgl: WebGLBulletRenderer, width: number, height: number, z: number, cx: number, cy: number): void {
    webgl.resize(width, height);
    webgl.setRenderScale(1);
    webgl.setCamera(cx, cy, z, width, height);
    webgl.setGeomDarkMode(_isDarkMode, borderBlend());
    webgl.setSampleAlphaToCoverage(true);
    webgl.setStrokeScale(1);
    webgl.beginFrame();
    webgl.setDepthTestEnabled(false);
}
function _editorGLState(webgl: WebGLBulletRenderer): void {
    webgl.setStrokeScale(1);
    webgl.setSampleAlphaToCoverage(true);
    webgl.setDepthTestEnabled(true);
    webgl.setDepthFunc(false);
    webgl.setDepthMask(true);
}
function _editorGLEnd(ctx: CanvasRenderingContext2D, webgl: WebGLBulletRenderer): void {
    _editorGLState(webgl);
    if (!webgl.hasDrawnSinceClear()) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    _compositeWorld(ctx, webgl);
    ctx.restore();
}

let _editorGrids = new Float32Array(64 * 6);
let _editorGridN = 0;
function _editorGridPut(gMinX: number, gMinY: number, gMaxX: number, gMaxY: number): void {
    if ((_editorGridN + 1) * 6 > _editorGrids.length) {
        const grown = new Float32Array(_editorGrids.length * 2);
        grown.set(_editorGrids);
        _editorGrids = grown;
    }
    const o = _editorGridN * 6;
    _editorGrids[o] = gMinX; _editorGrids[o + 1] = gMinY; _editorGrids[o + 2] = gMaxX; _editorGrids[o + 3] = gMaxY;
    _editorGrids[o + 4] = Math.floor((gMaxX - gMinX) / GRID_SPACING + 1e-9);
    _editorGrids[o + 5] = Math.floor((gMaxY - gMinY) / GRID_SPACING + 1e-9);
    _editorGridN++;
}

function _drawEditorGridGL(
    ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number,
    inDesigner: boolean, z: number, cx: number, cy: number,
): boolean {
    const hw = (width / 2) / z, hh = (height / 2) / z;
    const bMinX = cx - hw, bMaxX = cx + hw, bMinY = cy - hh, bMaxY = cy + hh;
    _editorGridN = 0;
    const _gn = gridBoxesOf(logic.areaBounds, inDesigner, logic.getMapLimit(), logic.getMapLimitY(), bMinX, bMinY, bMaxX, bMaxY);
    for (let _gi = 0; _gi < _gn; _gi++) {
        const o = _gi * 4;
        _editorGridPut(GRID_BOXES.a[o], GRID_BOXES.a[o + 1], GRID_BOXES.a[o + 2], GRID_BOXES.a[o + 3]);
    }
    _editorGLBegin(webgl, width, height, z, cx, cy);
    _hexToRGB(gridStroke(), _gColor, 0);
    const ok = webgl.drawGrid(_editorGrids, _editorGridN, GRID_SPACING, _gColor[0], _gColor[1], _gColor[2], 0.04);
    _editorGLEnd(ctx, webgl);
    return ok;
}

function _drawEditorMapGL(
    ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number,
    dragHide: ReturnType<typeof dragHideInfo>,
): void {
    const ms = logic.mapState;
    if (!ms || (ms.walls.length === 0 && ms.rocks.length === 0)) return;
    const z = logic.mapDesignerZoom, cx = logic.mapDesignerCamX, cy = logic.mapDesignerCamY;
    _editorGLBegin(webgl, width, height, z, cx, cy);
    const look = halloweenLook(logic);
    const hw = (look !== null && webgl.ensureHalloweenBatches(look.meshes)) ? look : null;
    const hide = dragHide !== null && (dragHide.kind === 'wall' || dragHide.kind === 'rock') ? dragHide : null;

    const sum = _emlContentSum(ms);
    const hideKind = hide !== null ? hide.kind : '', hideX = hide !== null ? hide.x : 0, hideY = hide !== null ? hide.y : 0;
    const stale = ms !== _egMap || sum !== _egSum || _isDarkMode !== _egDark || hw !== _egLook
        || hideKind !== _egHideKind || hideX !== _egHideX || hideY !== _egHideY;
    if (stale) {
        _egMap = ms; _egSum = sum; _egDark = _isDarkMode; _egLook = hw;
        _egHideKind = hideKind; _egHideX = hideX; _egHideY = hideY;
        _egEyeK = -1;
        _egEyeUnitN = 0;
        if (hw !== null && hw.eyeList !== null && ms.walls.length > 0) {
            const eyes = hwBeginEyes(logic, hw);
            if (eyes !== null) {
                const hideW = hide !== null && hide.kind === 'wall' ? hide : null;
                if (_egEyeUnits.length < ms.walls.length) _egEyeUnits = new Float64Array(ms.walls.length * 2);
                for (let i = 0; i < ms.walls.length; i++) {
                    const w = ms.walls[i];
                    if (hideW !== null && Math.abs(w.x - hideW.x) < hideW.halfW && Math.abs(w.y - hideW.y) < hideW.halfH) continue;
                    const o = eyeRowToDraw(eyes, i, w, TileType.WALL, -Infinity, Infinity, -Infinity, Infinity, hwEyeTargets());
                    if (o >= 0) _egEyeUnits[_egEyeUnitN++] = eyes.t[o + E_UNIT];
                }
                _egEyeUnits.subarray(0, _egEyeUnitN).sort();
            }
        }
    }
    const eyeMin = EYE_MIN_PX / 2 / z;
    let lo = 0, hi = _egEyeUnitN;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (_egEyeUnits[mid] < eyeMin) lo = mid + 1; else hi = mid; }
    const eyeK = _egEyeUnitN - lo;
    const eyesStale = stale || eyeK !== _egEyeK || eyeAlpha() !== _egEyeAlpha;
    _egEyeK = eyeK; _egEyeAlpha = eyeAlpha();

    let ok = true;
    if (ms.walls.length > 0) {
        if (stale) { _keepWalls.begin(webgl); _seeThruPushed = false; _glPushWalls(_keepWalls, ms.walls, hide, null); _keepWallsSeeThru = _seeThruPushed; ok = _keepWalls.upload(webgl) && ok; }
        webgl.setStrokeScale(Math.max(MIN_STROKE_SCREEN_PX / z, FIXED_STROKE_WIDTH) / FIXED_STROKE_WIDTH);
        if (_keepWallsSeeThru) webgl.setSampleAlphaToCoverage(false);
        ok = _keepWalls.draw(webgl) && ok;
        if (_keepWallsSeeThru) webgl.setSampleAlphaToCoverage(true);
        webgl.setStrokeScale(1);
        if (hw !== null && hw.eyeList !== null) {
            if (eyesStale) {
                _keepEyes.begin(webgl); _keepVeils.begin(webgl);
                const eyes = hwBeginEyes(logic, hw);
                if (eyes !== null && pushEyes(_keepEyes, eyes, ms.walls, TileType.WALL, hwEyeRgb(hw), -Infinity, Infinity, -Infinity, Infinity,
                    hwEyeTargets(), eyeMin, hide !== null && hide.kind === 'wall' ? hide : null) > 0 && eyeAlpha() < 1) {
                    const wc = hwWallRgb(hw);
                    _veilWalls = ms.walls; _veilSlots = null; _veilTeam = 0; _veilMineHex = '';
                    pushEyeVeils(_keepVeils, eyes, wc[0], wc[1], wc[2], eyeAlpha(), SMALL_FIX.G736 !== 0 ? _veilRgbOfRow : null);
                }
                ok = _keepEyes.upload(webgl) && ok;
                ok = _keepVeils.upload(webgl) && ok;
            }
            ok = _keepEyes.draw(webgl) && ok;
            if (_keepVeils.count() > 0) {
                webgl.setSampleAlphaToCoverage(false);
                ok = _keepVeils.draw(webgl) && ok;
                webgl.setSampleAlphaToCoverage(true);
            }
        }
    }
    if (ms.rocks.length > 0) {
        if (stale) { _keepRocks.begin(webgl); _seeThruPushed = false; _glPushRocks(_keepRocks, ms.rocks, hw, -Infinity, Infinity, -Infinity, Infinity, hide, null); _keepRocksSeeThru = _seeThruPushed; ok = _keepRocks.upload(webgl) && ok; }
        if (_keepRocksSeeThru) webgl.setSampleAlphaToCoverage(false);
        ok = _keepRocks.draw(webgl) && ok;
        if (_keepRocksSeeThru) webgl.setSampleAlphaToCoverage(true);
    }
    if (!ok) _egMap = null;
    _editorGLEnd(ctx, webgl);
}

let _edTankGL: WebGLBulletRenderer | null = null;
let _edHookOn = false;
let _ghostOn = false;
let _edCtx: CanvasRenderingContext2D | null = null;
let _edLogic: GameLogic | null = null;
let _edW = 0, _edH = 0;
let _edSegOpen = false;
let _edRLBelow = -1, _edRLAbove = -1, _edRLBelowDone = true, _edRLAboveDone = true;
let _edOverlaysBroke = false;

function _edSegBegin(): void {
    const gl = _edTankGL!;
    gl.beginFrame();
    gl.setDepthTestEnabled(true);
    gl.setDepthFunc(false);
    gl.setDepthMask(true);
    gl.setSampleAlphaToCoverage(true);
    _lookDeferOn = true;
    _edSegOpen = true;
}
function _edSegEnd(): void {
    if (!_edSegOpen) return;
    _edSegOpen = false;
    _lookDeferOn = false;
    const gl = _edTankGL!, ctx = _edCtx!;
    if (gl.hasGeomContent()) gl.flushGeom();
    if (gl.hasDrawnSinceClear()) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        _compositeMiniFlush(ctx, gl);
        ctx.restore();
    }
    if (_lookDeferCount > 0) {
        ctx.save();
        _drainLookUnits(gl, ctx, _edLogic!, _edW, _edH);
        ctx.restore();
    }
}
function _edOverlayBreak(): void {
    if (!_edHookOn || _edOverlaysBroke) return;
    _edOverlaysBroke = true;
    _edSegEnd();
}
function _edGhosts(pass: 'below' | 'above', both: boolean): void {
    const ctx = _edCtx!, logic = _edLogic!;
    _edSegEnd();
    ctx.save();
    ctx.translate(_rd.posX, _rd.posY);
    ctx.rotate(_rd.bodyAngle);
    _ghostOn = true;
    drawPreviewTurret(ctx, logic, pass, true);
    if (both) drawPresetPreview(ctx, logic, pass, true);
    _ghostOn = false;
    ctx.restore();
    _edSegBegin();
}
function _edSlot(pass: number, t: Turret): void {
    if (pass === 0) {
        if (!_edRLBelowDone && (t.renderLayer ?? 0) > _edRLBelow) { _edRLBelowDone = true; _edGhosts('below', true); }
    } else if (!_edRLAboveDone && (t.renderLayer ?? 0) > _edRLAbove) { _edRLAboveDone = true; _edGhosts('above', true); }
}
function _edSlotEnd(pass: number): void {
    if (pass === 0) { if (!_edRLBelowDone) { _edRLBelowDone = true; _edGhosts('below', true); } }
    else if (!_edRLAboveDone) { _edRLAboveDone = true; _edGhosts('above', true); }
}
function _edLayer(layer: BodyLayer, which: number): void {
    if (_previewInjectLayerId !== null && layer.id === _previewInjectLayerId && _previewInjectLogic !== null) {
        _edGhosts(which === 0 ? 'below' : 'above', true);
    }
}
function _edBelowDone(): void {
    _edSlotEnd(0);
    const ctx = _edCtx!, logic = _edLogic!;
    if (!_rd.isTestMode) {
        _edOverlaysBroke = false;
        ctx.save();
        ctx.translate(_rd.posX, _rd.posY);
        ctx.rotate(_rd.bodyAngle);
        _drawTurretRangeOverlays(ctx, _rd.sizePx, _rd.turrets!);
        ctx.restore();
        if (_edOverlaysBroke) _edSegBegin();
    }
    if (logic.state.autoSubTurretEditMode && _previewInjectLayerId === null) _edAutoSubGhosts('below');
}
function _edAboveDone(): void {
    const logic = _edLogic!;
    if (logic.state.autoSubTurretEditMode && _previewInjectLayerId === null) _edAutoSubGhosts('above');
}
function _edAutoSubGhosts(pass: 'below' | 'above'): void {
    const ctx = _edCtx!, logic = _edLogic!;
    _edSegEnd();
    _ghostOn = true;
    drawPreviewTurret(ctx, logic, pass);
    drawPresetPreview(ctx, logic, pass);
    _ghostOn = false;
    _edSegBegin();
}

function _ghostBegin(): void {
    const gl = _edTankGL!;
    gl.beginFrame();
    gl.setDepthTestEnabled(true);
    gl.setDepthFunc(false);
    gl.setDepthMask(true);
    gl.setSampleAlphaToCoverage(true);
}
function _ghostEnd(ctx: CanvasRenderingContext2D, alpha: number): void {
    const gl = _edTankGL!;
    if (gl.hasGeomContent()) gl.flushGeom();
    if (!gl.hasDrawnSinceClear()) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    _compositeMiniFlush(ctx, gl);
    ctx.restore();
}
let _ghCos = 1, _ghSin = 0, _ghX = 0, _ghY = 0, _ghAng = 0;
function _ghostFrameOfTank(logic: GameLogic): void {
    _ghAng = logic.tankAngle; _ghCos = Math.cos(_ghAng); _ghSin = Math.sin(_ghAng);
    _ghX = logic.tankPos.x; _ghY = logic.tankPos.y;
}
type GhostPart = Pick<Turret, 'look' | 'color' | 'colorMap' | 'aspect' | 'autoCircleBaseSides' | 'autoCircleBaseDepth'>;
function _ghostBarrel(t: GhostPart, lx: number, ly: number, la: number, tLen: number, tWid: number, sizePx: number): void {
    const gl = _edTankGL!;
    const wx = _ghX + lx * _ghCos - ly * _ghSin, wy = _ghY + lx * _ghSin + ly * _ghCos;
    if (t.look !== undefined) { _pushLookParts(gl, t.look, wx, wy, _ghAng + la, sizePx, 0, 1.0); return; }
    _hexToRGB(turretFill(t.color, t.colorMap), _tColor, 0);
    _geoEmit(gl, 'barrel', wx, wy, _ghAng + la, tLen, tWid, _tColor[0], _tColor[1], _tColor[2], 0, t.aspect, 1.0);
}
function _ghostBase(t: GhostPart, lx: number, ly: number, circleR: number, color: string, turn: number): void {
    const gl = _edTankGL!;
    const wx = _ghX + lx * _ghCos - ly * _ghSin, wy = _ghY + lx * _ghSin + ly * _ghCos;
    _hexToRGB(color, _tColor, 0);
    const sides = t.autoCircleBaseSides ?? 0;
    if (sides >= 3) {
        const depth = autoBaseDepth(sides, t.autoCircleBaseDepth);
        const key = depth > 0 ? gl.getOrCreateStarBatch(Math.floor(sides), depth, false) : POLY_BATCH_KEY[sides];
        _geoEmit(gl, key, wx, wy, _ghAng + turn + autoBaseTurn(sides, depth), circleR, circleR, _tColor[0], _tColor[1], _tColor[2], 0, 1.0, 1.0);
    } else {
        _geoEmit(gl, 'circle', wx, wy, 0, circleR, circleR, _tColor[0], _tColor[1], _tColor[2], 0, 1.0, 1.0);
    }
}
function _ghostFovArc(ctx: CanvasRenderingContext2D, fovDeg: number, r: number, a: number, k: number): void {
    ctx.globalAlpha = a * k;
    ctx.fillStyle = '#ffdd44';
    ctx.beginPath();
    if (fovDeg >= 360) {
        ctx.arc(0, 0, r, 0, Math.PI * 2);
    } else {
        const h = (fovDeg * Math.PI / 180) / 2;
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, -h, h);
        ctx.closePath();
    }
    ctx.fill();
    if (fovDeg < 360) {
        const h = (fovDeg * Math.PI / 180) / 2;
        ctx.globalAlpha = Math.min(a * 2.7, 0.4) * k;
        ctx.strokeStyle = '#ffdd44';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r * Math.cos(-h), r * Math.sin(-h));
        ctx.moveTo(0, 0);
        ctx.lineTo(r * Math.cos(h), r * Math.sin(h));
        ctx.stroke();
    }
}
function _ghostSubs(t: Pick<Turret, 'autoSubTurrets'>, lx: number, ly: number, ang: number, circleR: number, hostSizePx: number, above: boolean): void {
    const subs = _sortSubTurrets(t.autoSubTurrets);
    const c = Math.cos(ang), s = Math.sin(ang), subSz = circleR * 2;
    for (let i = 0; i < subs.length; i++) {
        const sub = subs[i];
        if ((sub.aboveBase === true) !== above) continue;
        const ox = sub.xOffset * subSz / 2, oy = sub.yOffset * subSz / 2;
        const sx = lx + ox * c - oy * s, sy = ly + ox * s + oy * c;
        const len = _mapVal(sub.length, 1, 100, subSz * 0.01, subSz / 2 + subSz * 10);
        const wid = _mapVal(sub.width, 0, 50, 0, subSz * 0.96);
        _ghostBarrel(sub, sx, sy, ang + sub.angle, len, wid, sub.look !== undefined ? hostSizePx : subSz);
    }
}

function _drawEditorTankGL(ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number, alpha: number): void {
    _edTankGL = webgl; _edCtx = ctx; _edLogic = logic; _edW = width; _edH = height;
    const z = logic.zoom;
    _editorGLBegin(webgl, width, height, z, logic.cameraX, logic.cameraY);
    webgl.setDepthTestEnabled(true);
    webgl.setStrokeScale(Math.max(MIN_STROKE_SCREEN_PX / z, FIXED_STROKE_WIDTH) / FIXED_STROKE_WIDTH);
    _hexToRGB(_isDarkMode ? '#fcfcfd' : '#171718', _gColor, 0);
    webgl.setInk(_gColor[0], _gColor[1], _gColor[2]);

    _edRLBelow = -1; _edRLAbove = -1; _edRLBelowDone = true; _edRLAboveDone = true;
    if (_previewInjectLogic !== null && _previewInjectLayerId === null) {
        _edRLBelow = _getPreviewRenderLayerForPass(_previewInjectLogic, 'below'); _edRLBelowDone = _edRLBelow < 0;
        _edRLAbove = _getPreviewRenderLayerForPass(_previewInjectLogic, 'above'); _edRLAboveDone = _edRLAbove < 0;
    }

    _edSegBegin();
    if (_pushAuraRings(webgl, logic, calculateViewportBounds(logic, width, height, 400)) > 0) {
        webgl.setSampleAlphaToCoverage(false);
        webgl.setDepthMask(false);
        webgl.flushGeom();
        webgl.setDepthMask(true);
        webgl.setSampleAlphaToCoverage(true);
        webgl.beginGeomFrame();
    }
    const keepAlpha = _rd.alpha;
    _rd.alpha = 1.0;
    _edHookOn = alpha >= 1;
    if (!_edHookOn) _lookDeferOn = false;
    try {
        _addTankGeometry(webgl, 0);
    } finally {
        _edHookOn = false;
        _rd.alpha = keepAlpha;
        _geoHl = false;
    }
    if (alpha >= 1) {
        _edSegEnd();
    } else {
        _edSegOpen = false; _lookDeferOn = false;
        if (webgl.hasGeomContent()) webgl.flushGeom();
        if (webgl.hasDrawnSinceClear()) {
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; _compositeMiniFlush(ctx, webgl); ctx.restore();
        }
        if (!_rd.isTestMode) {
            ctx.save(); ctx.globalAlpha = alpha; ctx.translate(_rd.posX, _rd.posY); ctx.rotate(_rd.bodyAngle);
            _drawTurretRangeOverlays(ctx, _rd.sizePx, _rd.turrets!);
            ctx.restore();
        }
    }
    _editorGLState(webgl);
    _edTankGL = null; _edCtx = null; _edLogic = null;
}

function _glPushListItems(gl: WebGLBulletRenderer, list: OtherDrawList, memo: { key: string }[], cx: number, cy: number,
                          unit: number, facing: number, aim: number, fillOf: (color: string, map: number) => string, skipMissing: boolean = false): boolean {
    const items = list.items;
    if (!skipMissing) for (let i = 0; i < items.length; i++) if (gl.lookBatchKey(items[i].part, memo[i]) === '') return false;
    const cF = Math.cos(facing), sF = Math.sin(facing), cA = Math.cos(aim), sA = Math.sin(aim);
    for (let i = 0; i < items.length; i++) {
        const it = items[i], pt = it.part;
        if (skipMissing && gl.lookBatchKey(pt, memo[i]) === '') continue;
        const cb = it.aimed ? cA : cF, sb = it.aimed ? sA : sF;
        const x = cx + ((it.ax * cF - it.ay * sF) + (it.lx * cb - it.ly * sb)) * unit;
        const y = cy + ((it.ax * sF + it.ay * cF) + (it.lx * sb + it.ly * cb)) * unit;
        const R = pt.radius * unit;
        _hexToRGB(fillOf(pt.color, pt.colorMap), _lookColor, 0);
        const ang = (it.aimed ? aim : facing) + it.rot;
        if (pt.kind === 'circle') _geoEmit(gl, memo[i].key, x, y, 0, R, R, _lookColor[0], _lookColor[1], _lookColor[2], 0, 1.0, 1.0);
        else _geoEmit(gl, memo[i].key, x, y, ang, R, pt.kind === 'line' ? 1 : R, _lookColor[0], _lookColor[1], _lookColor[2], 0, 1.0, 1.0);
    }
    return true;
}
function _edStillBegin(logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number): void {
    _editorGLBegin(webgl, width, height, logic.zoom, logic.cameraX, logic.cameraY);
    webgl.setDepthTestEnabled(true);
    webgl.setDepthFunc(false);
    webgl.setDepthMask(true);
    webgl.setStrokeScale(Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH) / FIXED_STROKE_WIDTH);
    _geoEntityIdx = 0; _geoSubSlot = 0;
}
function _edStillEnd(ctx: CanvasRenderingContext2D, webgl: WebGLBulletRenderer, alpha: number): void {
    if (webgl.hasGeomContent()) webgl.flushGeom();
    if (webgl.hasDrawnSinceClear()) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = alpha;
        _compositeMiniFlush(ctx, webgl);
        ctx.restore();
    }
    _editorGLState(webgl);
}
function _drawEditorShapeGL(ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number): boolean {
    const d = logic.state.editingShape;
    if (d === null) return true;
    const polyType = d.polyhedronType !== undefined && d.polyhedronType !== null ? d.polyhedronType : '';
    if (polyType !== '') return false;
    const rm = RARITY_MULTIPLIERS[d.rarity];
    let fill: string;
    if (rm !== undefined && rm.isAnimatedColor) {
        updateAnimatedColors(_shapeCacheFrame);
        fill = getAnimatedColor(rm.animationType, isGameDark());
    } else {
        fill = shapeFill(effectiveShapeColor(d), effectiveShapeColorMap(d), d.isCrasher === true);
    }
    const alpha = rm !== undefined ? rm.opacity : 1;
    const sides = d.sides >= 3 ? (d.sides | 0) : 0;
    if (sides > POLY_BATCH_MAX_SIDES) return false;
    const halfSz = d.size / 2;
    const px = logic.tankPos.x, py = logic.tankPos.y;
    if (d.look !== undefined) {
        if (d.look !== _spvLookSrc) { _spvLookSrc = d.look; _spvLook = makeShapeLook(d.look); }
        if (_spvLook !== null) {
            const facing = sides >= 3 && sides % 2 === 1 ? -Math.PI / 2 : 0;
            _edStillBegin(logic, webgl, width, height);
            if (!_glPushListItems(webgl, _spvLook.list, _spvLook.memo, px, py, d.size / 2, facing, facing, _shapeLookFill)) { webgl.beginGeomFrame(); _editorGLState(webgl); return false; }
            _edStillEnd(ctx, webgl, 1);
            return true;
        }
    }
    _hexToRGB(fill, _gColor, 0);
    const r = _gColor[0], g = _gColor[1], b = _gColor[2];
    _edStillBegin(logic, webgl, width, height);
    if (sides === 0) {
        _geoEmit(webgl, 'circle', px, py, 0, halfSz, halfSz, r, g, b, 0, 1.0, 1.0);
    } else {
        _geoEmit(webgl, POLY_BATCH_KEY[sides], px, py, polyAngleOffset(sides), halfSz * getRealSizeFactor(sides), halfSz * getRealSizeFactor(sides), r, g, b, 0, 1.0, 1.0);
    }
    const labyLevel = d.labyLevel;
    if (labyLevel > 0) {
        const ds = labyDownscale(sides);
        const outerR = sides === 0 ? halfSz : halfSz * getRealSizeFactor(sides);
        for (let li = 1; li <= labyLevel; li++) {
            const layerR = outerR * Math.pow(ds, li);
            if (sides === 0) _geoEmit(webgl, 'circle', px, py, 0, layerR, layerR, r, g, b, 0, 1.0, 1.0);
            else _geoEmit(webgl, POLY_BATCH_KEY[sides], px, py, (li % 2 === 0) ? polyAngleOffset(sides) : polyAngleOffset(sides) + Math.PI / sides, layerR, layerR, r, g, b, 0, 1.0, 1.0);
        }
    }
    _edStillEnd(ctx, webgl, alpha >= 0.99 ? 1 : alpha);
    return true;
}
function _drawEditorProtectorGL(ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number, alpha: number = 1): void {
    _editorGLBegin(webgl, width, height, logic.mapDesignerZoom, logic.mapDesignerCamX, logic.mapDesignerCamY);
    webgl.setDepthTestEnabled(true);
    webgl.setDepthFunc(false);
    webgl.setDepthMask(true);
    webgl.setStrokeScale(Math.max(MIN_STROKE_SCREEN_PX / _rd.zoom, FIXED_STROKE_WIDTH) / FIXED_STROKE_WIDTH);
    _edTankGL = webgl;
    const keep = _rd.alpha;
    _rd.alpha = 1.0;
    try {
        _addTankGeometry(webgl, 0);
    } finally {
        _rd.alpha = keep;
        _edTankGL = null;
        _geoHl = false;
    }
    _edStillEnd(ctx, webgl, alpha);
}
function _editorBodiesBegin(logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number): void {
    const z = logic.mapDesignerZoom;
    _editorGLBegin(webgl, width, height, z, logic.mapDesignerCamX, logic.mapDesignerCamY);
    webgl.setDepthTestEnabled(true);
    webgl.setDepthFunc(false);
    webgl.setDepthMask(true);
    webgl.setStrokeScale(Math.max(MIN_STROKE_SCREEN_PX / z, FIXED_STROKE_WIDTH) / FIXED_STROKE_WIDTH);
}
function _editorBodyAdd(webgl: WebGLBulletRenderer, slot: number): void {
    _edTankGL = webgl;
    const keep = _rd.alpha;
    _rd.alpha = 1.0;
    try { _addTankGeometry(webgl, slot); } finally { _rd.alpha = keep; _edTankGL = null; _geoHl = false; }
}
function _editorShapeAdd(webgl: WebGLBulletRenderer, def: ShapeDefinition, x: number, y: number, size: number, angle: number, slot: number): void {
    _geoEntityIdx = slot; _geoSubSlot = 0;
    const halfSz = size / 2;
    const sides = def.sides >= 3 ? (def.sides | 0) : 0;
    if (def.look) { _glPushListItems(webgl, def.look.list, def.look.memo, x, y, halfSz, angle, angle, _shapeLookFill, true); return; }
    _hexToRGB(shapeFill(def.defaultColor, def.colorMap, def.isCrasher === true), _gColor, 0);
    const r = _gColor[0], g = _gColor[1], b = _gColor[2];
    if (sides === 0 || sides > POLY_BATCH_MAX_SIDES) { _geoEmit(webgl, 'circle', x, y, 0, halfSz, halfSz, r, g, b, 0, 1.0, 1.0); return; }
    const R = halfSz * getRealSizeFactor(sides);
    _geoEmit(webgl, POLY_BATCH_KEY[sides], x, y, angle + polyAngleOffset(sides), R, R, r, g, b, 0, 1.0, 1.0);
    const ds = labyDownscale(sides);
    for (let li = 1; li <= (def.labyLevel || 0); li++) {
        const layerR = R * Math.pow(ds, li);
        _geoEmit(webgl, POLY_BATCH_KEY[sides], x, y, angle + ((li % 2 === 0) ? polyAngleOffset(sides) : polyAngleOffset(sides) + Math.PI / sides), layerR, layerR, r, g, b, 0, 1.0, 1.0);
    }
}
function _editorShape2D(ctx: CanvasRenderingContext2D, logic: GameLogic, def: ShapeDefinition, x: number, y: number, size: number, angle: number, alpha: number): void {
    const halfSz = size / 2;
    const sides = def.sides >= 3 ? (def.sides | 0) : 0;
    const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    if (def.look) {
        _look2dFlash = 0; _look2dWorn = '';
        drawOtherList(ctx, def.look.list, 0, 0, size, 0, 0, strokeWidth, _look2dFill, _look2dLine);
        ctx.restore();
        return;
    }
    const col = shapeFill(def.defaultColor, def.colorMap, def.isCrasher === true);
    const draw = (r: number, off: number) => {
        ctx.beginPath();
        if (sides === 0 || sides > POLY_BATCH_MAX_SIDES) ctx.arc(0, 0, r, 0, Math.PI * 2);
        else roundedPolygonPath(ctx, sides, r, off);
        ctx.strokeStyle = darkenColor(col, 0.598); ctx.stroke();
        ctx.fillStyle = col; ctx.fill();
    };
    if (sides === 0 || sides > POLY_BATCH_MAX_SIDES) { draw(halfSz, 0); ctx.restore(); return; }
    const R = halfSz * getRealSizeFactor(sides);
    draw(R, polyAngleOffset(sides));
    const ds = labyDownscale(sides);
    for (let li = 1; li <= (def.labyLevel || 0); li++) draw(R * Math.pow(ds, li), (li % 2 === 0) ? polyAngleOffset(sides) : polyAngleOffset(sides) + Math.PI / sides);
    ctx.restore();
}
let _eovDesign: object | null = null, _eovList: OtherDrawList | null = null;
function _drawEditorOtherGL(ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number): boolean {
    const d = logic.state.viewingOther;
    if (d === null) return true;
    if (d !== _eovDesign) { _eovDesign = d; _eovList = otherDrawList(d); }
    const list = _eovList!;
    const w = d.size < OTHER_VIEW_MIN_WIDTH ? OTHER_VIEW_MIN_WIDTH : d.size;
    _edStillBegin(logic, webgl, width, height);
    if (!_glPushListItems(webgl, list, _lookMemoOf(d, list.items.length), logic.tankPos.x, logic.tankPos.y, w / 2, 0, list.rest, _otherFillOf)) {
        webgl.beginGeomFrame(); _editorGLState(webgl); return false;
    }
    _edStillEnd(ctx, webgl, 1);
    return true;
}

const _edEyeRow = new Float64Array(EYE_STRIDE);
let _edMutedRgb = new Float32Array(48);
const _rockAt = mapRockAt;
function _edOutlineEntity(gl: WebGLBulletRenderer, logic: GameLogic, hw: ReturnType<typeof halloweenLook>, kind: string,
                          x: number, y: number, w: number, h: number, r: number, rotation: number): void {
    if (kind === 'wall') {
        const iw = w - 3, ih = h - 3;
        if (iw > 0 && ih > 0) gl.pushGeomInstance('rect', x, y, 0, iw, ih, 0, 0, 0, 4, 0.0, 1.0, 1.0);
        return;
    }
    if (hw !== null && hw.pumpkinList !== null && hw.pumpkin !== null) {
        const items = hw.pumpkinList.items, body = hw.pumpkin.body;
        const t = mapRockTurnAt(logic, x, y, rotation), c = Math.cos(t), sn = Math.sin(t);
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.part !== body) continue;
            const px = x + ((it.ax * c - it.ay * sn) + (it.lx * c - it.ly * sn)) * r;
            const py = y + ((it.ax * sn + it.ay * c) + (it.lx * sn + it.ly * c)) * r;
            const R = it.part.radius * r;
            gl.pushGeomInstance(hw.pumpkinKeys[i], px, py, it.part.kind === 'circle' ? 0 : t + it.rot, R, it.part.kind === 'line' ? 1 : R, 0, 0, 0, 4, 0.0, 1.0, 1.0);
        }
        return;
    }
    const rock = _rockAt(logic, x, y);
    const sides = rock !== null ? Math.abs(rock.shape) : 9;
    if (sides < 3) return;
    gl.pushGeomInstance(gl.getOrCreateStarBatch(sides, 6 / (sides * sides), false), x, y, rotation, r, r, 0, 0, 0, 4, 0.0, 1.0, 1.0);
}
function _drawEditorMapMarksGL(ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number): void {
    const me = logic.mapEditor;
    const tool = effectiveMapEditorTool(logic);
    if (tool === 'none' && !me.hasSelection) return;
    const z = logic.mapDesignerZoom;
    const look = halloweenLook(logic);
    const hw = (look !== null && webgl.ensureHalloweenBatches(look.meshes)) ? look : null;
    let open = false;
    const begin = (): void => {
        _editorGLBegin(webgl, width, height, z, logic.mapDesignerCamX, logic.mapDesignerCamY);
        webgl.setStrokeScale(Math.max(MIN_STROKE_SCREEN_PX / z, FIXED_STROKE_WIDTH) / FIXED_STROKE_WIDTH);
        open = true;
    };
    if (me.hasHover && !me.dragActive && (me.hoverKind === 'wall' || me.hoverKind === 'rock')) {
        begin();
        _hexToRGB(mapEditorHoverColor(logic, _isDarkMode), _gColor, 0);
        webgl.setInk(_gColor[0], _gColor[1], _gColor[2]);
        _edOutlineEntity(webgl, logic, hw, me.hoverKind, me.hoverX, me.hoverY, me.hoverW, me.hoverH, me.hoverR, me.hoverRotation);
        webgl.flushGeom();
        webgl.beginGeomFrame();
    }
    if (me.hasSelection && !me.dragActive) {
        const g = selectionOutline(logic);
        if (g !== null && (g.kind === 'wall' || g.kind === 'rock')) {
            if (!open) begin();
            _hexToRGB(mapEditorInk(_isDarkMode), _gColor, 0);
            webgl.setInk(_gColor[0], _gColor[1], _gColor[2]);
            _edOutlineEntity(webgl, logic, hw, g.kind, g.x, g.y, g.w, g.h, g.r, g.rotation);
            webgl.flushGeom();
            webgl.beginGeomFrame();
        }
    }
    if (open && webgl.hasDrawnSinceClear()) {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; _compositeMiniFlush(ctx, webgl); ctx.restore();
    }
    if (tool !== 'none' && me.hasGhost && (me.ghostKind === 'wall' || me.ghostKind === 'rock')) {
        if (open) webgl.beginFrame(); else begin();
        const valid = me.ghostValid;
        const fillHex = valid ? wallDefault() : mapEditorMuted(_isDarkMode);
        _hexToRGB(fillHex, _gColor, 0);
        const fr = _gColor[0], fg = _gColor[1], fb = _gColor[2];
        let veil = false;
        if (me.ghostKind === 'wall') {
            const iw = me.ghostW - 3, ih = me.ghostH - 3;
            if (iw > 0 && ih > 0) webgl.pushGeomInstance('rect', me.ghostX, me.ghostY, 0, iw, ih, fr, fg, fb, 0, 0.0, 1.0, 1.0);
            if (valid && hw !== null && hw.eyeList !== null) {
                placeEye(_edEyeRow, 0, me.ghostX, me.ghostY, me.ghostW / 2, me.ghostH / 2, logic.state.mapConfig.seed | 0, hw, me.ghostLookDx, me.ghostLookDy);
                const unit = _edEyeRow[E_UNIT];
                if (unit > 0) {
                    const turn = _edEyeRow[E_TURN];
                    pushOtherList(webgl, hw.eyeList, hw.eyeKeys, hwEyeRgb(hw), _edEyeRow[E_X], _edEyeRow[E_Y], unit, turn, turn + hw.eyeList.rest, 1.0);
                    veil = eyeAlpha() < 1;
                }
            }
        } else if (hw !== null && hw.pumpkinList !== null) {
            const t = pumpkinTurn(me.ghostX + me.ghostLookDx, me.ghostY + me.ghostLookDy, me.ghostRot);
            let rgb = hwPumpkinRgb(hw);
            if (!valid) {
                const n = hw.pumpkinList.items.length * 3;
                if (_edMutedRgb.length < n) _edMutedRgb = new Float32Array(n * 2);
                for (let i = 0; i < n; i += 3) { _edMutedRgb[i] = fr; _edMutedRgb[i + 1] = fg; _edMutedRgb[i + 2] = fb; }
                rgb = _edMutedRgb;
            }
            pushOtherList(webgl, hw.pumpkinList, hw.pumpkinKeys, rgb, me.ghostX, me.ghostY, me.ghostR, t, t, 1.0);
        } else {
            const dh = me.dragActive ? dragHideInfo(logic) : null;
            const dragged = dh !== null && dh.kind === 'rock' ? _rockAt(logic, dh.x, dh.y) : null;
            const sides = dragged !== null ? Math.abs(dragged.shape) : Math.abs(rockShapeFor(toolRockKind(logic)));
            if (sides >= 3) webgl.pushGeomInstance(webgl.getOrCreateStarBatch(sides, 6 / (sides * sides), false), me.ghostX, me.ghostY, me.ghostRot, me.ghostR, me.ghostR, fr, fg, fb, 0, 0.0, 1.0, 1.0);
        }
        webgl.flushGeom();
        if (veil && hw !== null && hw.eyeList !== null) {
            const wc = hwWallRgb(hw), body = hw.eyeList.items[0], R = body.part.radius * _edEyeRow[E_UNIT];
            webgl.setSampleAlphaToCoverage(false);
            webgl.beginGeomFrame();
            webgl.pushGeomInstance(HW_VEIL, _edEyeRow[E_X], _edEyeRow[E_Y], _edEyeRow[E_TURN] + body.rot, R, R, wc[0], wc[1], wc[2], 0, 0.0, 1.0, 1 - eyeAlpha());
            webgl.flushGeom();
            webgl.setSampleAlphaToCoverage(true);
        }
        if (webgl.hasDrawnSinceClear()) {
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = GHOST_ALPHA; _compositeMiniFlush(ctx, webgl); ctx.restore();
        }
    }
    if (open) _editorGLState(webgl);
}

function _releaseEditorMapGL(webgl: WebGLBulletRenderer | null): void {
    if (_egMap === null && !_keepWalls.holds() && !_keepEyes.holds() && !_keepVeils.holds() && !_keepRocks.holds()) return;
    _egMap = null;
    if (webgl === null) return;
    _keepWalls.release(webgl); _keepEyes.release(webgl); _keepVeils.release(webgl); _keepRocks.release(webgl);
}

class _GeomKeep implements GeomSink {
    private keys: string[] = [];
    private bufs: Float32Array[] = [];
    private counts: number[] = [];
    private last = -1;
    private gl: WebGLBulletRenderer | null = null;
    private minX = Infinity; private minY = Infinity; private maxX = -Infinity; private maxY = -Infinity;
    private readonly kept: KeptGeom = makeKeptGeom();
    begin(gl: WebGLBulletRenderer): void {
        this.gl = gl;
        for (let i = 0; i < this.counts.length; i++) this.counts[i] = 0;
        this.last = -1;
        this.minX = Infinity; this.minY = Infinity; this.maxX = -Infinity; this.maxY = -Infinity;
    }
    count(): number { let n = 0; for (let i = 0; i < this.counts.length; i++) n += this.counts[i]; return n; }
    getOrCreateStarBatch(sides: number, starDepth: number, curved: boolean): string {
        return this.gl !== null ? this.gl.getOrCreateStarBatch(sides, starDepth, curved) : '';
    }
    pushGeomInstance(key: string, x: number, y: number, rot: number, sx: number, sy: number, r: number, g: number, b: number, dmg: number, depth: number, aspect: number, alpha: number): void {
        let s = this.last;
        if (s < 0 || this.keys[s] !== key) {
            s = this.keys.indexOf(key);
            if (s < 0) { s = this.keys.length; this.keys.push(key); this.bufs.push(new Float32Array(GEOM_INSTANCE_STRIDE * 256)); this.counts.push(0); }
            this.last = s;
        }
        let buf = this.bufs[s];
        const o = this.counts[s] * GEOM_INSTANCE_STRIDE;
        if (o + GEOM_INSTANCE_STRIDE > buf.length) {
            const nb = new Float32Array(buf.length * 2); nb.set(buf); this.bufs[s] = nb; buf = nb;
        }
        buf[o] = x; buf[o + 1] = y; buf[o + 2] = rot; buf[o + 3] = sx; buf[o + 4] = sy;
        buf[o + 5] = r; buf[o + 6] = g; buf[o + 7] = b; buf[o + 8] = dmg; buf[o + 9] = depth; buf[o + 10] = aspect; buf[o + 11] = alpha;
        this.counts[s]++;
        const ax = sx < 0 ? -sx : sx, ay = sy < 0 ? -sy : sy, aa = aspect < 0 ? -aspect : aspect;
        const rad = ax + ay * (aa > 1 ? aa : 1) + STROKE_HALF_WIDTH * 4;
        if (x - rad < this.minX) this.minX = x - rad;
        if (x + rad > this.maxX) this.maxX = x + rad;
        if (y - rad < this.minY) this.minY = y - rad;
        if (y + rad > this.maxY) this.maxY = y + rad;
    }
    upload(webgl: WebGLBulletRenderer): boolean {
        return webgl.setKeptGeom(this.kept, this.keys, this.bufs, this.counts, this.minX, this.minY, this.maxX, this.maxY);
    }
    draw(webgl: WebGLBulletRenderer): boolean { return webgl.drawKeptGeom(this.kept); }
    holds(): boolean { return this.kept.blocks.length > 0; }
    release(webgl: WebGLBulletRenderer): void { webgl.releaseKeptGeom(this.kept); }
}
const _keepWalls = new _GeomKeep(), _keepEyes = new _GeomKeep(), _keepVeils = new _GeomKeep(), _keepRocks = new _GeomKeep();
let _keepWallsSeeThru = false, _keepRocksSeeThru = false;
let _egMap: object | null = null, _egSum = NaN, _egDark = false, _egLook: object | null = null;
let _egHideKind = '', _egHideX = 0, _egHideY = 0, _egEyeK = -1, _egEyeAlpha = NaN;
let _egEyeUnits = new Float64Array(256), _egEyeUnitN = 0;

function _drawWallsRocks2D(
    ctx: CanvasRenderingContext2D, logic: GameLogic, width: number, height: number,
    currentZoom: number, vpCx: number, vpCy: number, _dragHide: ReturnType<typeof dragHideInfo>, pkFullPx: number,
): void {
    const ms = logic.mapState;
    if (!ms) return;
    const _wallSlots2 = logic.state.isTestMode && logic.admin.wallSlotsOn ? logic.admin.wallSlots : null;
    if (ms.walls.length > 0) {
      const walls = ms.walls;
      const wallStrokeWidth = Math.max(MIN_STROKE_SCREEN_PX / currentZoom, FIXED_STROKE_WIDTH);
      const wallInset = 1.5;

      const vpHalfW = (width / 2) / currentZoom;
      const vpHalfH = (height / 2) / currentZoom;
      const vpLeft = vpCx - vpHalfW;
      const vpRight = vpCx + vpHalfW;
      const vpTop = vpCy - vpHalfH;
      const vpBottom = vpCy + vpHalfH;

      ctx.lineJoin = 'round';
      ctx.lineWidth = wallStrokeWidth;

      const _hwLook2 = halloweenLook(logic);
      const _hwEyes2 = _hwLook2 !== null ? hwBeginEyes(logic, _hwLook2) : null;
      const _hwCap2 = ctx.lineCap;
      const _hwEyeSmall = EYE_MIN_PX / 2 / currentZoom;

      let prevColor = '';
      let prevStroke = '';

      for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (!w.active) continue;
        if (_dragHide !== null && _dragHide.kind === 'wall'
            && Math.abs(w.x - _dragHide.x) < _dragHide.halfW
            && Math.abs(w.y - _dragHide.y) < _dragHide.halfH) continue;
        if (w.x + w.halfW < vpLeft || w.x - w.halfW > vpRight ||
            w.y + w.halfH < vpTop || w.y - w.halfH > vpBottom) continue;

        const slot2 = _wallSlots2 !== null ? _wallSlots2.get(w) : undefined;
        const color = slot2 !== undefined ? wallFill(slot2) : w.door !== undefined ? _doorHex(false)
          : w.paintSlot !== undefined ? wallFill(w.paintSlot) : w.paintHex !== undefined ? w.paintHex
          : w.type === TileType.WALL ? wallDefault()
          : (w.type >= TileType.BASE_BLUE && w.type <= TileType.BASE_PURPLE)
            ? _teamColor(w.type - TileType.BASE_BLUE)
            : (WALL_COLORS[w.type] || wallDefault());
        const stroke = getWallStroke(color);

        if (stroke !== prevStroke) { ctx.strokeStyle = stroke; prevStroke = stroke; }
        if (color !== prevColor) { ctx.fillStyle = color; prevColor = color; }

        const wx = w.x - w.halfW + wallInset;
        const wy = w.y - w.halfH + wallInset;
        const ww = w.halfW * 2 - wallInset * 2;
        const wh = w.halfH * 2 - wallInset * 2;

        const _ga = ctx.globalAlpha, _wa = slot2 === undefined && w.paintAlpha !== undefined ? w.paintAlpha : 1;
        if (_wa < 1) ctx.globalAlpha = _ga * _wa;
        if (w.block !== undefined && w.block > 0) {
            const bk = w.block, nbx = Math.max(1, Math.round(w.halfW * 2 / bk)), nby = Math.max(1, Math.round(w.halfH * 2 / bk)), side = bk - wallInset * 2;
            for (let a = 0; a < nbx; a++) for (let c = 0; c < nby; c++) { const bx = w.x - w.halfW + a * bk + wallInset, by = w.y - w.halfH + c * bk + wallInset; ctx.strokeRect(bx, by, side, side); ctx.fillRect(bx, by, side, side); }
        } else {
            ctx.strokeRect(wx, wy, ww, wh);
            ctx.fillRect(wx, wy, ww, wh);
        }
        if (_wa < 1) ctx.globalAlpha = _ga;

        if (_hwEyes2 !== null) {
          const _eo = eyeRowToDraw(_hwEyes2, i, w, TileType.WALL, vpLeft, vpRight, vpTop, vpBottom, hwEyeTargets());
          if (_eo >= 0 && _hwEyes2.t[_eo + E_UNIT] >= _hwEyeSmall) hwQueueEye(_hwEyes2, _eo);
        }
      }
      if (_hwEyes2 !== null) {
        hwFlushEyes(ctx, _hwEyes2, FIXED_STROKE_WIDTH, currentZoom);
        ctx.lineCap = _hwCap2;
      }

    }

    if (ms.rocks.length > 0) {
      const rockFill = wallDefault();
      const rockStroke = darkenColor(wallDefault(), 0.598);
      const vpHalfW = (width / 2) / currentZoom;
      const vpHalfH = (height / 2) / currentZoom;
      const rvLeft = vpCx - vpHalfW;
      const rvRight = vpCx + vpHalfW;
      const rvTop = vpCy - vpHalfH;
      const rvBottom = vpCy + vpHalfH;
      const _hwLook3 = halloweenLook(logic);
      const _hwPk3 = (_hwLook3 !== null && _hwLook3.pumpkinList !== null) ? _hwLook3 : null;
      const _hwCap3 = ctx.lineCap;

      for (let ri = 0; ri < ms.rocks.length; ri++) {
        const rock = ms.rocks[ri];
        if (!rock.active) continue;
        if (_dragHide !== null && _dragHide.kind === 'rock'
            && Math.abs(rock.x - _dragHide.x) < 1 && Math.abs(rock.y - _dragHide.y) < 1) continue;
        const _pkHere3 = _hwPk3 !== null && rockWearsPumpkin(rock.shape);
        const rHalf = _pkHere3 ? rock.size * _hwPk3!.pumpkinReach + EYE_LINE : rock.size;
        if (rock.x + rHalf < rvLeft || rock.x - rHalf > rvRight ||
            rock.y + rHalf < rvTop || rock.y - rHalf > rvBottom) continue;

        if (_hwPk3 !== null && _pkHere3) {
          hwQueuePumpkin(rock.x, rock.y, rock.size, rockTurn(rock));
          continue;
        }

        ctx.save();
        ctx.translate(rock.x, rock.y);
        if (rock.rotation !== 0) ctx.rotate(rock.rotation);

        const sides = Math.abs(rock.shape);
        const outerR = rock.size;
        const dip = 1 - 6 / (sides * sides);
        ctx.beginPath();
        ctx.moveTo(outerR, 0);
        for (let i = 0; i < sides; i++) {
          const halfAngle = ((i + 0.5) / sides) * Math.PI * 2;
          const nextAngle = ((i + 1) / sides) * Math.PI * 2;
          ctx.lineTo(outerR * dip * Math.cos(halfAngle), outerR * dip * Math.sin(halfAngle));
          ctx.lineTo(outerR * Math.cos(nextAngle), outerR * Math.sin(nextAngle));
        }
        ctx.closePath();
        ctx.lineWidth = FIXED_STROKE_WIDTH;
        ctx.lineJoin = 'round';
        const slot3 = _wallSlots2 !== null ? _wallSlots2.get(rock) : undefined;
        const _rp = slot3 === undefined ? (rock.paintSlot !== undefined ? wallFill(rock.paintSlot) : rock.paintHex) : undefined;
        if (slot3 === undefined && rock.paintAlpha !== undefined) ctx.globalAlpha *= rock.paintAlpha;
        ctx.strokeStyle = slot3 !== undefined ? darkenColor(wallFill(slot3), 0.598) : _rp !== undefined ? darkenColor(_rp, 0.598) : rockStroke;
        ctx.stroke();
        ctx.fillStyle = slot3 !== undefined ? wallFill(slot3) : _rp !== undefined ? _rp : rockFill;
        ctx.fill();

        ctx.restore();
      }
      if (_hwPk3 !== null) {
        hwFlushPumpkins(ctx, _hwPk3, FIXED_STROKE_WIDTH, currentZoom, pkFullPx);
        ctx.lineCap = _hwCap3;
      }
    }
}

const EDITOR_MAP_FROZEN = true;
const EDITOR_GROUND_KEPT = true;
const EML_MARGIN = 0.2;
const EML_SETTLE_S = 0.1;
type KeptDraw = (lc: CanvasRenderingContext2D, logic: GameLogic, lw: number, lh: number, z: number, cx: number, cy: number) => void;

function _camMoved(z: number, cx: number, cy: number, z0: number, cx0: number, cy0: number): boolean {
    return !(Math.abs(z - z0) <= z * 1e-6 && Math.abs(cx - cx0) * z <= 0.01 && Math.abs(cy - cy0) * z <= 0.01);
}

class KeptLayer {
    private canvas: HTMLCanvasElement | null = null;
    private lc: CanvasRenderingContext2D | null = null;
    private ok = false;
    private zoom = 0; private camX = 0; private camY = 0;
    private w = 0; private h = 0; private mx = 0; private my = 0;
    private lastZoom = Infinity; private lastCamX = Infinity; private lastCamY = Infinity; private still = 0;
    private seenFrame = -2;
    constructor(private readonly opaque: boolean) {}
    paste(ctx: CanvasRenderingContext2D, logic: GameLogic, width: number, height: number, z: number, cx: number, cy: number, dt: number, stale: boolean, draw: KeptDraw): void {
        if (_camMoved(z, cx, cy, this.lastZoom, this.lastCamX, this.lastCamY)) {
            this.lastZoom = z; this.lastCamX = cx; this.lastCamY = cy; this.still = 0;
        } else {
            this.still += dt;
        }
        const gap = _shapeCacheFrame !== this.seenFrame + 1;
        this.seenFrame = _shapeCacheFrame;
        let redraw = stale || gap || !this.ok || this.canvas === null || width !== this.w || height !== this.h;
        let s = 1, dx = -this.mx, dy = -this.my;
        if (!redraw && _camMoved(z, cx, cy, this.zoom, this.camX, this.camY)) {
            const lw = this.canvas!.width, lh = this.canvas!.height;
            s = z / this.zoom;
            dx = width / 2 + (this.camX - cx) * z - (lw / 2) * s;
            dy = height / 2 + (this.camY - cy) * z - (lh / 2) * s;
            if (this.still >= EML_SETTLE_S
                || dx > 0.5 || dy > 0.5 || dx + lw * s < width - 0.5 || dy + lh * s < height - 0.5) redraw = true;
        }
        if (redraw) {
            const mx = Math.ceil(width * EML_MARGIN), my = Math.ceil(height * EML_MARGIN);
            const lw = width + mx * 2, lh = height + my * 2;
            if (this.canvas === null) { this.canvas = document.createElement('canvas'); this.lc = this.canvas.getContext('2d', { alpha: !this.opaque }); }
            if (this.lc === null) return;
            if (this.canvas.width !== lw || this.canvas.height !== lh) { this.canvas.width = lw; this.canvas.height = lh; }
            const lc = this.lc;
            lc.setTransform(1, 0, 0, 1, 0, 0);
            lc.globalAlpha = 1;
            lc.clearRect(0, 0, lw, lh);
            lc.setTransform(z, 0, 0, z, lw / 2 - cx * z, lh / 2 - cy * z);
            lc.lineJoin = 'round';
            draw(lc, logic, lw, lh, z, cx, cy);
            this.ok = true; this.zoom = z; this.camX = cx; this.camY = cy; this.w = width; this.h = height; this.mx = mx; this.my = my;
            s = 1; dx = -mx; dy = -my;
        }
        const pic = this.canvas!;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.drawImage(pic, dx, dy, pic.width * s, pic.height * s);
        ctx.restore();
    }
    release(): void {
        if (!this.ok) return;
        if (this.canvas !== null) { this.canvas.width = 1; this.canvas.height = 1; }
        this.ok = false;
    }
}

const _keptMap = new KeptLayer(false);
let _kmMap: object | null = null, _kmSum = 0, _kmDark = false, _kmTheme = -1, _kmLook: object | null = null;
let _kmHideKind = '', _kmHideX = 0, _kmHideY = 0;
let _kmHide: ReturnType<typeof dragHideInfo> = null;
function _emlContentSum(ms: NonNullable<typeof GameLogic.prototype.mapState>): number {
    let s = ms.walls.length * 7.13 + ms.rocks.length * 13.7;
    const walls = ms.walls;
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        s += (w.active ? 1 : 0.37) * (1 + i * 1e-6) * (w.x * 1.31 + w.y * 1.77 + w.halfW * 2.03 + w.halfH * 2.39 + w.type * 3.1 + 1);
    }
    const rocks = ms.rocks;
    for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i];
        s += (r.active ? 1 : 0.41) * (1 + i * 1e-6) * (r.x * 1.13 + r.y * 1.57 + r.size * 2.21 + r.shape * 3.7 + r.rotation * 5.3 + 2);
    }
    return s;
}
function _keptMapDraw(lc: CanvasRenderingContext2D, logic: GameLogic, lw: number, lh: number, z: number, cx: number, cy: number): void {
    _drawWallsRocks2D(lc, logic, lw, lh, z, cx, cy, _kmHide, 0);
}
function _drawEditorMapLayer(
    ctx: CanvasRenderingContext2D, logic: GameLogic, width: number, height: number, dt: number,
    dragHide: ReturnType<typeof dragHideInfo>,
): void {
    const ms = logic.mapState;
    if (!ms || (ms.walls.length === 0 && ms.rocks.length === 0)) return;
    const look = halloweenLook(logic);
    const hides = dragHide !== null && (dragHide.kind === 'wall' || dragHide.kind === 'rock');
    const hideKind = hides ? dragHide!.kind : '';
    const hideX = hides ? dragHide!.x : 0, hideY = hides ? dragHide!.y : 0;
    const sum = _emlContentSum(ms);
    const stale = ms !== _kmMap || sum !== _kmSum || _isDarkMode !== _kmDark || _themeVerSeen !== _kmTheme || look !== _kmLook
        || hideKind !== _kmHideKind || hideX !== _kmHideX || hideY !== _kmHideY;
    _kmMap = ms; _kmSum = sum; _kmDark = _isDarkMode; _kmTheme = _themeVerSeen; _kmLook = look;
    _kmHideKind = hideKind; _kmHideX = hideX; _kmHideY = hideY;
    _kmHide = hides ? dragHide : null;
    _keptMap.paste(ctx, logic, width, height, logic.mapDesignerZoom, logic.mapDesignerCamX, logic.mapDesignerCamY, dt, stale, _keptMapDraw);
}

const _keptAreaMarks = new KeptLayer(false);
let _kamMap: object | null = null, _kamCfg: object | null = null, _kamAreas: object | null = null, _kamDark = false, _kamTheme = -1, _kamHide = -1, _kamHideArea = '', _kamAny = true;
function _keptAreaMarksDraw(lc: CanvasRenderingContext2D, logic: GameLogic, _lw: number, _lh: number, z: number): void {
    const line = mapEditorMuted(_isDarkMode);
    const px = (logic.dpr * logic.chromeScale) / z;
    lc.font = `bold ${14 * px}px Ubuntu, Inter, sans-serif`;
    lc.textBaseline = 'top';
    const name = (t: string, x: number, y: number): void => { lc.lineWidth = 3 * px; lc.strokeStyle = '#000000'; lc.strokeText(t, x, y); lc.fillStyle = '#ffffff'; lc.fillText(t, x, y); };
    for (const w of logic.mapEventsWorlds()) {
        const cs = w.cell;
        for (const a of w.zones) {
            if ((BASE_AREAS.ON === 0 && (!a.kind || a.kind === 'base')) || (a.uid === _kamHide && (SMALL_FIX.GH615 === 0 || w.areaId === _kamHideArea))) continue;
            lc.lineWidth = px;
            lc.strokeStyle = line;
            const ash = zoneShapeOf(a);
            if (ash !== null) { lc.beginPath(); tracePoly(lc, shapeCellPoints(ash), w.originX, w.originY, cs); lc.stroke(); }
            else {
            lc.strokeRect(w.originX + a.gx * cs, w.originY + a.gy * cs, a.cw * cs, a.ch * cs);
            if (a.more) for (const m of a.more) lc.strokeRect(w.originX + m.gx * cs, w.originY + m.gy * cs, m.cw * cs, m.ch * cs);
            }
            name(a.name ?? 'Custom Area', w.originX + a.gx * cs + 5 * px, w.originY + a.gy * cs + 4 * px);
        }
        const placed = w.doc?.placed;
        if (placed) {
            lc.textAlign = 'center';
            for (const e of placed) { const at = entityShownCell(w.doc, e); name(e.name, w.originX + at.cx * cs, w.originY + at.cy * cs + logic.mapEntityRadius(e.id, w.areaId) + 5 * px); }
            lc.textAlign = 'left';
        }
    }
}
function _drawEditorAreaMarks(ctx: CanvasRenderingContext2D, logic: GameLogic, width: number, height: number, dt: number, dragHide: ReturnType<typeof dragHideInfo>): void {
    const ms = logic.mapState, cfg = logic.state.mapConfig, areas = logic.state.multiAreaConfig.enableMultiArea ? logic.state.multiAreaConfig.areas : null;
    const hide = dragHide !== null && dragHide.kind === 'zone' ? dragHide.uid : -1;
    const hideArea = dragHide !== null && dragHide.kind === 'zone' ? dragHide.areaId : '';
    const stale = ms !== _kamMap || cfg !== _kamCfg || areas !== _kamAreas || _isDarkMode !== _kamDark || _themeVerSeen !== _kamTheme || hide !== _kamHide || hideArea !== _kamHideArea;
    if (stale) {
        _kamMap = ms; _kamCfg = cfg; _kamAreas = areas; _kamDark = _isDarkMode; _kamTheme = _themeVerSeen; _kamHide = hide; _kamHideArea = hideArea;
        _kamAny = logic.mapEventsWorlds().some(w => w.zones.some(a => BASE_AREAS.ON !== 0 || (a.kind && a.kind !== 'base')) || (w.doc?.placed?.length ?? 0) > 0);
        if (!_kamAny) _keptAreaMarks.release();
    }
    const _inMatch = logic.state.isTestMode;
    if (_kamAny) _keptAreaMarks.paste(ctx, logic, width, height, _inMatch ? logic.zoom : logic.mapDesignerZoom, _inMatch ? logic.cameraX : logic.mapDesignerCamX, _inMatch ? logic.cameraY : logic.mapDesignerCamY, dt, stale, _keptAreaMarksDraw);
}

function _drawEditorAreasGL(ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number, dragHide: ReturnType<typeof dragHideInfo>): void {
    const cas = logic.mapState ? logic.mapState.customAreas : undefined;
    if (!cas || cas.length === 0) return;
    let open = false, shaped = false;
    for (let i = 0; i < cas.length; i++) {
        const ca = cas[i];
        if (ca.noDraw === true || ca.opacity > 0 || ca.isBase === true) continue;
        if (dragHide !== null && dragHide.kind === 'zone' && dragHide.areaId === ca.areaId
            && ((dragHide.gx === ca.gx && dragHide.gy === ca.gy) || (dragHide.uid >= 0 && dragHide.uid === ca.uid))) continue;
        if (ca.poly != null) { shaped = true; continue; }
        if (!open) {
            const z = logic.mapDesignerZoom;
            _editorGLBegin(webgl, width, height, z, logic.mapDesignerCamX, logic.mapDesignerCamY);
            webgl.setStrokeScale(Math.max(MIN_STROKE_SCREEN_PX / z, FIXED_STROKE_WIDTH) / FIXED_STROKE_WIDTH / 2);
            _hexToRGB(mapEditorMuted(_isDarkMode), _gColor, 0);
            webgl.setInk(_gColor[0], _gColor[1], _gColor[2]);
            open = true;
        }
        webgl.pushGeomInstance('rect', (ca.x0 + ca.x1) / 2, (ca.y0 + ca.y1) / 2, 0, ca.x1 - ca.x0, ca.y1 - ca.y0, 0, 0, 0, 4, 0.0, 1.0, 1.0);
    }
    if (open) { webgl.flushGeom(); _editorGLEnd(ctx, webgl); }
    if (!shaped) return;
    const z = logic.mapDesignerZoom;
    ctx.save();
    ctx.setTransform(z, 0, 0, z, width / 2 - logic.mapDesignerCamX * z, height / 2 - logic.mapDesignerCamY * z);
    ctx.lineWidth = Math.max(MIN_STROKE_SCREEN_PX / z, FIXED_STROKE_WIDTH) / 2;
    ctx.strokeStyle = mapEditorMuted(_isDarkMode);
    ctx.globalAlpha = 1;
    for (let i = 0; i < cas.length; i++) {
        const ca = cas[i];
        if (ca.poly == null || ca.noDraw === true || ca.opacity > 0 || ca.isBase === true) continue;
        if (dragHide !== null && dragHide.kind === 'zone' && dragHide.areaId === ca.areaId && dragHide.uid >= 0 && dragHide.uid === ca.uid) continue;
        ctx.beginPath(); tracePoly(ctx, ca.poly); ctx.stroke();
    }
    ctx.restore();
}
const _edLblText: string[] = [];
const _edLblX: number[] = [], _edLblY: number[] = [];
function _drawEditorLabelsGL(ctx: CanvasRenderingContext2D, logic: GameLogic, webgl: WebGLBulletRenderer, width: number, height: number, dt: number): void {
    const z = logic.mapDesignerZoom, camX = logic.mapDesignerCamX, camY = logic.mapDesignerCamY;
    const px = logic.dpr * logic.chromeScale;
    const n = mapObjectLabels(logic, _edLblText, _edLblX, _edLblY, 16 * px / z);
    if (n === 0) return;
    for (let i = 0; i < n; i++) { _edLblX[i] = (_edLblX[i] - camX) * z + width / 2; _edLblY[i] = (_edLblY[i] - camY) * z + height / 2; }
    if (editorLabelsDraw(webgl, width, height, _isDarkMode, dt * 1000, n, _edLblText, _edLblX, _edLblY, 16 * px)) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        _compositeMiniFlush(ctx, webgl);
        ctx.restore();
    }
    nameTagsDone(webgl, camX, camY, z, width, height);
    _editorGLState(webgl);
}

const _keptGround = new KeptLayer(true);
let _kgKey = NaN;
function _groundKey(logic: GameLogic, inDesigner: boolean): number {
    let s = (_isDarkMode ? 1 : 0) + (inDesigner ? 2 : 0) + logic.getMapLimit() * 3.1 + logic.getMapLimitY() * 5.3 + logic.areaBounds.length * 11;
    for (let i = 0; i < logic.areaBounds.length; i++) {
        const ab = logic.areaBounds[i];
        s += (1 + i * 1e-6) * (ab.minX * 1.3 + ab.maxX * 1.7 + ab.minY * 2.1 + ab.maxY * 2.9);
    }
    return s;
}
function _keptGroundDraw(lc: CanvasRenderingContext2D, logic: GameLogic, lw: number, lh: number, z: number, cx: number, cy: number): void {
    lc.save();
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.fillStyle = canvasBg();
    lc.fillRect(0, 0, lw, lh);
    lc.restore();
    const hw = lw / 2 / z, hh = lh / 2 / z;
    _drawGround2D(lc, logic, logic.isMapDesignerActive && !logic.state.isTestMode, cx - hw, cx + hw, cy - hh, cy + hh);
}

function _drawGround2D(ctx: CanvasRenderingContext2D, logic: GameLogic, inDesigner: boolean, bMinX: number, bMaxX: number, bMinY: number, bMaxY: number, gridLines: boolean = true): void {
    const mapLimit = logic.getMapLimit();
    const mapLimitY = logic.getMapLimitY();
    if (logic.areaBounds.length > 0) {
      ctx.fillStyle = gridBg();
      for (let _ai = 0; _ai < logic.areaBounds.length; _ai++) {
        const ab = logic.areaBounds[_ai];
        if (!inDesigner && (ab.maxX < bMinX || ab.minX > bMaxX ||
            ab.maxY < bMinY || ab.minY > bMaxY)) continue;
        ctx.fillRect(ab.minX, ab.minY, ab.maxX - ab.minX, ab.maxY - ab.minY);
      }
    } else {
      ctx.fillStyle = gridBg();
      ctx.fillRect(-mapLimit, -mapLimitY, mapLimit * 2, mapLimitY * 2);
    }
    if (!logic.state.isTestMode && gridLines) {
      ctx.globalAlpha = 0.04;
      ctx.strokeStyle = gridStroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      const _gn = gridBoxesOf(logic.areaBounds, inDesigner, mapLimit, mapLimitY, bMinX, bMinY, bMaxX, bMaxY);
      for (let _gi = 0; _gi < _gn; _gi++) {
        const o = _gi * 4;
        const gMinX = GRID_BOXES.a[o], gMinY = GRID_BOXES.a[o + 1], gMaxX = GRID_BOXES.a[o + 2], gMaxY = GRID_BOXES.a[o + 3];
        for (let x = gMinX; x <= gMaxX; x += GRID_SPACING) { ctx.moveTo(x, gMinY); ctx.lineTo(x, gMaxY); }
        for (let y = gMinY; y <= gMaxY; y += GRID_SPACING) { ctx.moveTo(gMinX, y); ctx.lineTo(gMaxX, y); }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
}

function render(ctx: CanvasRenderingContext2D, logic: GameLogic, dt: number, activeTool?: string) {
    const _photoHide = photoHiding();
    _lcFrameStamp++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    _shapeCacheFrame++;
    _lookAnimLogic = logic;
    _lookDeferOn = false;
    if (_lookDeferCount > 0) { for (let i = 0; i < _lookDeferCount; i++) _lookDeferRef[i] = null; _lookDeferCount = 0; }
    _edTankGL = null; _edCtx = null; _edLogic = null; _edHookOn = false; _ghostOn = false; _edSegOpen = false; _geoHl = false;

    _diagDrawOps = 0;
    _diagLodFull = 0;
    _diagLodSimple = 0;
    _diagLodMinimal = 0;

    _bodyRangePerEntity = DEPTH_FIT && _wglVisibleEntityIdx > _DEPTH_FIT_FROM
        ? _DEPTH_FIT_SPAN / (_wglVisibleEntityIdx * 1.25) : _BODY_RANGE_PER_ENTITY;
    _wglVisibleEntityIdx = 0;
    _geoBulletEntityIdx = 0;
    _geoBulletGlobalSlot = 0;
    _wglUnifiedPassActive = false;
    _mlCount = 0;
    _invisDeferCount = 0;
    _dyingDeferCount = 0;
    _dyingBulletDeferCount = 0;
    _geoUnitDepthOn = 0;
    _geoUnitSub = 0;
    _wantAboveRoundSlot = false; _aboveRoundDepth = -1;
    _dyingShapeDeferCount = 0;

    if (logic.state.debugMode && logic.state.debugShowProjectileHP) {
        const _bLen = logic.bullets.length;
        if (_bulletDepthMap.length < _bLen) _bulletDepthMap = new Float32Array(_bLen);
        else _bulletDepthMap.fill(0, 0, _bLen);
    }

    const CACHE_SCALE_HYST = 0.25;
    let newCacheScale = _currentCacheScale;
    if (logic.zoom > _currentCacheScale) {
        newCacheScale = Math.min(4, Math.max(1, Math.ceil(logic.zoom)));
    } else if (logic.zoom < _currentCacheScale - 1 - CACHE_SCALE_HYST) {
        newCacheScale = Math.min(4, Math.max(1, Math.ceil(logic.zoom)));
    }
    _cacheScaleChanged = newCacheScale !== _currentCacheScale;
    if (_cacheScaleChanged) {
        _currentCacheScale = newCacheScale;
        _lastShapeKey = '';
        _lastShapeEntry = null;
    }

    if (logic.overlayResetCounter !== _lastOverlayResetCounter) {
      _lastOverlayResetCounter = logic.overlayResetCounter;
      _clearOverlayFades();
    }

    const viewportBounds = calculateViewportBounds(logic, width, height, 400);

    ctx.lineJoin = 'round';

    _darkModeKeyDirty = false;
    const _newDark = gameDark();
    setGameDarkMode(_newDark);
    const _themeVer = gameThemeVersion();
    if (_newDark !== _isDarkMode || _themeVer !== _themeVerSeen) {
        _isDarkMode = _newDark;
        _themeVerSeen = _themeVer;
        syncDarkenTheme();
        clearWallStrokeCache();
        _shapeCache.clear();
        _lastShapeKey = '';
        _lastShapeEntry = null;
        _mmCachedMapRef = null;
        _DEBUG_STROKE_COLOR = strokeHex();
        _darkModeKeyDirty = true;
    }

    ctx.fillStyle = canvasBg();
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    try {

    ctx.translate(width / 2, height / 2);
    if (logic.state.isTestMode) {
        ctx.scale(logic.zoom, logic.zoom);
        ctx.translate(-logic.cameraX, -logic.cameraY);
    } else if (logic.isMapDesignerActive) {
        ctx.scale(logic.mapDesignerZoom, logic.mapDesignerZoom);
        ctx.translate(-logic.mapDesignerCamX, -logic.mapDesignerCamY);
    } else {
        ctx.scale(logic.zoom, logic.zoom);
        ctx.translate(-logic.cameraX, -logic.cameraY);
    }

    let _camOffX: number;
    let _camOffY: number;
    if (logic.state.isTestMode) {
      _camOffX = logic.cameraX;
      _camOffY = logic.cameraY;
    } else if (logic.isMapDesignerActive) {
      _camOffX = logic.mapDesignerCamX;
      _camOffY = logic.mapDesignerCamY;
    } else {
      _camOffX = logic.cameraX;
      _camOffY = logic.cameraY;
    }
    if (logic.state.isTestMode) logic.noteSeenView(_camOffX, _camOffY, logic.zoom, width, height);

    const mapLimit = logic.getMapLimit();

    const webgl = logic.webglRenderer;
    const useWebGL = webgl !== null && webgl.isEnabled();

    if (logic.state.isTestMode && !useWebGL) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(SMALL_FIX.R742 !== 0 ? 'WebGL 2 is required but not available.' : 'WebGL is required but not available.', width / 2, height / 2 - 15);
        ctx.font = '14px Arial';
        ctx.fillText(SMALL_FIX.R742 !== 0 ? 'Please use a modern browser (Chrome, Edge, Firefox or Safari).' : 'Please use a modern browser (Chrome, Firefox, Edge).', width / 2, height / 2 + 15);
        ctx.restore();
        return;
    }

    if ((_cacheScaleChanged || _darkModeKeyDirty) && webgl) {
        webgl.clearAtlas();
    }

    const inDesigner = logic.isMapDesignerActive && !logic.state.isTestMode;

    const _edGL = !logic.state.isTestMode && _editorOnGpu(webgl, useWebGL);

    const _edZoom = logic.isMapDesignerActive ? logic.mapDesignerZoom : logic.zoom;
    if (_edGL && webgl !== null) {
      _keptGround.release();
      _kgKey = NaN;
      _drawGround2D(ctx, logic, inDesigner, viewportBounds.minX, viewportBounds.maxX, viewportBounds.minY, viewportBounds.maxY, false);
      if (!_drawEditorGridGL(ctx, logic, webgl, width, height, inDesigner, _edZoom, _camOffX, _camOffY)) {
        _drawGround2D(ctx, logic, inDesigner, viewportBounds.minX, viewportBounds.maxX, viewportBounds.minY, viewportBounds.maxY);
      }
    } else if (!logic.state.isTestMode && EDITOR_GROUND_KEPT) {
      const _gk = _groundKey(logic, inDesigner);
      const _gStale = _gk !== _kgKey;
      _kgKey = _gk;
      _keptGround.paste(ctx, logic, width, height, _edZoom, _camOffX, _camOffY, dt, _gStale, _keptGroundDraw);
    } else {
      if (logic.state.isTestMode) _keptGround.release();
      _drawGround2D(ctx, logic, inDesigner, viewportBounds.minX, viewportBounds.maxX, viewportBounds.minY, viewportBounds.maxY);
    }

    const showMapFeatures = logic.isMapDesignerActive || logic.state.isTestMode;
    const _dragHide = dragHideInfo(logic);
    if (logic.mapState && showMapFeatures) {
      const ovZoom = logic.isMapDesignerActive && !logic.state.isTestMode ? logic.mapDesignerZoom : logic.zoom;
      const ovHalfW = (width / 2) / ovZoom;
      const ovHalfH = (height / 2) / ovZoom;
      const ovCx = logic.isMapDesignerActive && !logic.state.isTestMode ? logic.mapDesignerCamX : logic.cameraX;
      const ovCy = logic.isMapDesignerActive && !logic.state.isTestMode ? logic.mapDesignerCamY : logic.cameraY;
      const ovLeft = ovCx - ovHalfW;
      const ovRight = ovCx + ovHalfW;
      const ovTop = ovCy - ovHalfH;
      const ovBottom = ovCy + ovHalfH;

      const tileStates = logic.areaStates.length > 0 ? logic.areaStates : [logic.mapState];
      const tileAreas = logic.areaStates.length > 0 ? logic.state.multiAreaConfig.areas : null;
      const _tileCount = tileAreas ? Math.min(tileStates.length, tileAreas.length) : tileStates.length;
      for (let _ti = 0; _ti < _tileCount; _ti++) {
        const ts = tileStates[_ti];
        if (!ts.tileGrid) continue;
        const tg = ts.tileGrid;
        const gc = ts.gridCells;
        const gcY = ts.gridCellsY;
        const cs = ts.cellSize;
        const mh = ts.mapHalf;
        const mhY = ts.mapHalfY;
        const ox = tileAreas ? tileAreas[_ti].worldOffsetX : 0;
        const oy = tileAreas ? tileAreas[_ti].worldOffsetY : 0;

        if (ox + mh < ovLeft || ox - mh > ovRight || oy + mhY < ovTop || oy - mhY > ovBottom) continue;

        const gxMin = Math.max(0, Math.floor((ovLeft - ox + mh) / cs));
        const gxMax = Math.min(gc - 1, Math.ceil((ovRight - ox + mh) / cs));
        const gyMin = Math.max(0, Math.floor((ovTop - oy + mhY) / cs));
        const gyMax = Math.min(gcY - 1, Math.ceil((ovBottom - oy + mhY) / cs));

        const _hideZoneHere = _dragHide !== null && _dragHide.kind === 'zone'
          && _dragHide.areaId === (tileAreas ? tileAreas[_ti].id : '');

        let hasSpawn = false;
        let _lastBaseStyle = '';
        for (let gx = gxMin; gx <= gxMax; gx++) {
          for (let gy = gyMin; gy <= gyMax; gy++) {
            const _tt = tg[gx * gcY + gy];
            if (_tt === TileType.SPAWN_AREA) {
              if (!hasSpawn) {
                ctx.fillStyle = 'rgba(100, 200, 100, 0.15)';
                hasSpawn = true;
              }
              ctx.fillRect(ox - mh + gx * cs, oy - mhY + gy * cs, cs, cs);
            } else if (_tt >= TileType.BASE_BLUE && _tt <= TileType.BASE_PURPLE) {
              if (_hideZoneHere
                  && gx >= _dragHide!.gx && gx < _dragHide!.gx + _dragHide!.cw
                  && gy >= _dragHide!.gy && gy < _dragHide!.gy + _dragHide!.ch) continue;
              const _bi = _tt - TileType.BASE_BLUE;
              const _bc = _teamColor(_bi);
              const _bStyle = `${_bc}4d`;
              if (_bStyle !== _lastBaseStyle) {
                ctx.fillStyle = _bStyle;
                _lastBaseStyle = _bStyle;
              }
              ctx.fillRect(ox - mh + gx * cs, oy - mhY + gy * cs, cs, cs);
            }
          }
        }
      }

      const _cas = logic.mapState.customAreas;
      if (_cas && _cas.length > 0) {
        for (let _ci = 0; _ci < _cas.length; _ci++) {
          const ca = _cas[_ci];
          if (ca.noDraw === true) continue;
          if (ca.x1 < ovLeft || ca.x0 > ovRight || ca.y1 < ovTop || ca.y0 > ovBottom) continue;
          if (_dragHide !== null && _dragHide.kind === 'zone' && _dragHide.areaId === ca.areaId
              && ((_dragHide.gx === ca.gx && _dragHide.gy === ca.gy) || (_dragHide.uid >= 0 && _dragHide.uid === ca.uid))) continue;
          ctx.globalAlpha = ca.opacity;
          ctx.fillStyle = customAreaFill(ca, _isDarkMode);
          if (ca.poly != null) { ctx.beginPath(); tracePoly(ctx, ca.poly); ctx.fill(); }
          else ctx.fillRect(ca.x0, ca.y0, ca.x1 - ca.x0, ca.y1 - ca.y0);
        }
        ctx.globalAlpha = 1;
      }
      const _dws = logic.mapState.walls;
      let _dOpen = false;
      for (let _wi = 0; _wi < _dws.length; _wi++) {
        const w = _dws[_wi];
        if (w.active || w.door === undefined) continue;
        if (w.x + w.halfW < ovLeft || w.x - w.halfW > ovRight || w.y + w.halfH < ovTop || w.y - w.halfH > ovBottom) continue;
        if (!_dOpen) { _dOpen = true; ctx.fillStyle = _doorHex(true); ctx.strokeStyle = getWallStroke(_doorHex(false)); ctx.lineWidth = DOOR_EDGE_WIDTH; }
        ctx.globalAlpha = 1;
        ctx.fillRect(w.x - w.halfW, w.y - w.halfH, w.halfW * 2, w.halfH * 2);
        ctx.globalAlpha = DOOR_OPEN_EDGE_ALPHA;
        ctx.strokeRect(w.x - w.halfW, w.y - w.halfH, w.halfW * 2, w.halfH * 2);
      }
      if (_dOpen) ctx.globalAlpha = 1;
    }

    const _portalsInEditor = logic.isMapDesignerActive && !logic.state.isTestMode && logic.isCustomMapActive();
    const _allNames = SMALL_FIX.R665 !== 0 && logic.state.debugMode && logic.state.debugShowAllNames === true;
    const _portalPreview = _portalsInEditor ? logic.portalPlacementPreview : null;
    _portalLabelText.length = 0;
    _portalLabelX.length = 0;
    _portalLabelSub.length = 0;
    _portalLabelY.length = 0;
    _portalLabelAlpha.length = 0;
    _portalLabelZoom.length = 0;
    if ((logic.state.isTestMode || _portalsInEditor) && logic.mapState
        && (logic.mapState.portals.length > 0 || _portalPreview !== null)) {
      const portals = logic.mapState.portals;
      const _portalDrawCount = portals.length + (_portalPreview !== null ? 1 : 0);
      const _pZoom = _portalsInEditor ? logic.mapDesignerZoom : logic.zoom;
      const camX = _portalsInEditor ? logic.mapDesignerCamX : logic.cameraX;
      const camY = _portalsInEditor ? logic.mapDesignerCamY : logic.cameraY;
      const viewHalf = (Math.max(width, height) / _pZoom) * 0.6;

      const _particleFill = '#ffffff';
      const _particleStroke = darkenColor(_particleFill, 0.598);

      for (let pi = 0; pi < _portalDrawCount; pi++) {
        const portal = pi < portals.length ? portals[pi] : _portalPreview!;

        if (_dragHide !== null && _dragHide.kind === 'portal' && portal !== _portalPreview
            && Math.abs(portal.x - _dragHide.x) < 1 && Math.abs(portal.y - _dragHide.y) < 1) continue;

        if (portal._opacity <= 0 && !portal._particlesDraining && !portal._dying) continue;
        let _pCarry = 0;
        if (portal.invisible && logic.state.isTestMode) {
          _pCarry = (portal as CarryMarked)._carryKey !== undefined ? carryFloor(portal as CarryMarked, portal, logic.gameNow()) : 0;
          if (_pCarry <= 0) {
            if (_allNames) _collectPortalLabel(portal, logic, _pZoom, portal.eventHorizon * 0.85 * portal._scale, portal._opacity, false);
            continue;
          }
        }

        const dxCam = portal.x - camX;
        const dyCam = portal.y - camY;
        if (Math.abs(dxCam) > viewHalf + portal.tileSize || Math.abs(dyCam) > viewHalf + portal.tileSize) continue;

        const bodyR = portal.eventHorizon * 0.85;
        const scale = portal._scale;
        const opacity = portal.invisible ? portal._opacity * (_pCarry > 0 ? _pCarry : INVISIBLE_PORTAL_EDITOR_ALPHA) : portal._opacity;
        const pScale = Math.min(scale, 1.0);
        const scaledR = bodyR * scale;
        const pScaledR = bodyR * pScale;

        ctx.save();
        ctx.translate(portal.x, portal.y);
        ctx.lineJoin = 'round';

        const _pRv = portalRandomised(portal);
        const pT = _pRv ? portal._vT : portal._particleT;
        const pAngle = _pRv ? portal._vAngle : portal._particleAngle;
        const pSpawnR = _pRv ? portal._vSpawnR : portal._particleSpawnR;
        const pSz = _pRv ? portal._vSize : portal._particleSize;
        const pOpac = _pRv ? portal._vOpac : portal._particleOpacity;
        const pLen = _pRv ? portal._vN : pT.length;
        const _pTheme = _portalThemeFill(portal, logic);
        const _pFill = _pTheme || _particleFill;
        const _pStroke = _pTheme ? _portalThemeStroke(_pTheme) : _particleStroke;
        const _borderW = FIXED_STROKE_WIDTH * 0.5;
        for (let r = 0; r < pLen; r++) {
          const t = pT[r];
          if (t < 0) continue;
          const radius = (pSpawnR[r] + (0.2 - pSpawnR[r]) * t) * pScaledR;
          const baseOp = pOpac[r];
          let pAlpha: number;
          if (t < 0.1) {
            pAlpha = (t / 0.1) * baseOp;
          } else if (t > 0.90) {
            pAlpha = ((1.0 - t) / 0.10) * baseOp;
          } else {
            pAlpha = baseOp;
          }
          ctx.globalAlpha = (portal._dying || portal._particlesDraining ? 1.0 : opacity) * pAlpha;
          const dotR = pSz[r] * pScale;
          const px = Math.cos(pAngle[r]) * radius;
          const py = Math.sin(pAngle[r]) * radius;
          ctx.fillStyle = _pStroke;
          ctx.beginPath();
          ctx.arc(px, py, dotR + _borderW, 0, 6.283185307);
          ctx.arc(px, py, dotR, 0, 6.283185307, true);
          ctx.fill();
          ctx.fillStyle = _pFill;
          ctx.beginPath();
          ctx.arc(px, py, dotR, 0, 6.283185307);
          ctx.fill();
        }

        if (!portal._particlesDraining) {
        const auraMinR = scaledR * 1.0;
        const auraMaxR = scaledR * 1.92;
        const auraRange = auraMaxR - auraMinR;
        const aP = portal._auraPos;
        let s0 = 0, s1 = 1, s2 = 2, st: number;
        if (aP[s0] < aP[s1]) { st = s0; s0 = s1; s1 = st; }
        if (aP[s1] < aP[s2]) { st = s1; s1 = s2; s2 = st; }
        if (aP[s0] < aP[s1]) { st = s0; s0 = s1; s1 = st; }
        ctx.globalAlpha = opacity * 0.30;
        let aR: number;
        aR = auraMinR + aP[s0] * auraRange;
        ctx.fillStyle = _pStroke;
        ctx.beginPath(); ctx.arc(0, 0, aR + _borderW, 0, 6.283185307); ctx.arc(0, 0, aR, 0, 6.283185307, true); ctx.fill();
        ctx.fillStyle = _pFill;
        ctx.beginPath(); ctx.arc(0, 0, aR, 0, 6.283185307); ctx.fill();
        aR = auraMinR + aP[s1] * auraRange;
        ctx.fillStyle = _pStroke;
        ctx.beginPath(); ctx.arc(0, 0, aR + _borderW, 0, 6.283185307); ctx.arc(0, 0, aR, 0, 6.283185307, true); ctx.fill();
        ctx.fillStyle = _pFill;
        ctx.beginPath(); ctx.arc(0, 0, aR, 0, 6.283185307); ctx.fill();
        aR = auraMinR + aP[s2] * auraRange;
        ctx.fillStyle = _pStroke;
        ctx.beginPath(); ctx.arc(0, 0, aR + _borderW, 0, 6.283185307); ctx.arc(0, 0, aR, 0, 6.283185307, true); ctx.fill();
        ctx.fillStyle = _pFill;
        ctx.beginPath(); ctx.arc(0, 0, aR, 0, 6.283185307); ctx.fill();

        ctx.globalAlpha = opacity;
        ctx.fillStyle = isGameDark() ? '#3a3a3a' : darkenColor('#000000', 0.598);
        ctx.beginPath();
        ctx.arc(0, 0, scaledR + _borderW, 0, 6.283185307);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 0, scaledR, 0, 6.283185307);
        ctx.fill();
        }
        if (_allNames && portal.invisible) _collectPortalLabel(portal, logic, _pZoom, scaledR, portal._opacity, false);
        else _collectPortalLabel(portal, logic, _pZoom, scaledR, opacity, logic.state.isTestMode);

        ctx.restore();
      }
    }

    if (inDesigner) {
        const _bpTanks = logic.state.enemyTanks;
        let _bpOpen = false, _bpSlot = 0, _bpGhostTank: typeof _bpTanks[number] | null = null;
        for (let _bpi = 0; _bpi < _bpTanks.length; _bpi++) {
            const _bp = _bpTanks[_bpi];
            if (!_bp.active || (!_bp.isBaseProtector && (_bp._mevF & 8192) === 0)) continue;
            const _bpGhost = (_bp._mevF & 65536) !== 0;
            if (_bpGhost && !(logic.mapEditor.hasGhost && logic.mapEditor.ghostKind === 'entity')) continue;
            if (!_bpGhost && (_bp._mevF & 8192) !== 0 && _dragHide !== null && _dragHide.kind === 'entity' && Math.abs(_bp.position.x - _dragHide.x) < 1 && Math.abs(_bp.position.y - _dragHide.y) < 1) continue;

            const _bpPrevArea = logic.baseProtectorRangePreviewAreaId;
            const _bpPrev = (logic.baseProtectorRangePreview != null &&
                             (_bpPrevArea === '' || _bpPrevArea === _bp.areaId))
                ? logic.baseProtectorRangePreview : null;
            const _bpRingR = _bpPrev != null ? _bpPrev : _bp.fovRadius;
            if (_bpRingR > 0 && _bp.isBaseProtector) {
                const _bpRingA = _bpPrev != null
                    ? 0.15
                    : _getOverlayAlpha(_bpFadeKey(_bp.areaId), String(_bpRingR), 0.15, 1 / 60);
                if (_bpRingA > 0.001) {
                    ctx.save();
                    ctx.globalAlpha = _bpRingA;
                    ctx.fillStyle = '#ffdd44';
                    ctx.beginPath();
                    ctx.arc(_bp.position.x, _bp.position.y, _bpRingR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = Math.min(_bpRingA * 2.7, 0.4);
                    ctx.strokeStyle = '#ffdd44';
                    ctx.lineWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            if (_edGL && webgl !== null) {
                if (_bpGhost) { _bpGhostTank = _bp; continue; }
                fillEnemyRenderData(_bp, logic);
                if (!_bpOpen) { _editorBodiesBegin(logic, webgl, width, height); _bpOpen = true; }
                _editorBodyAdd(webgl, _bpSlot++);
            } else {
                fillEnemyRenderData(_bp, logic);
                ctx.save();
                if (_bpGhost) ctx.globalAlpha = logic.mapEditor.ghostValid ? GHOST_ALPHA : GHOST_ALPHA * 0.5;
                drawTankAndTurrets(ctx, false);
                ctx.restore();
            }
        }
        if (_edGL && webgl !== null) {
            const _edShapes = logic.mapEntityShapes();
            for (let _si = 0; _si < _edShapes.length; _si++) {
                const _s = _edShapes[_si];
                if (_dragHide !== null && _dragHide.kind === 'entity' && Math.abs(_s.x - _dragHide.x) < 1 && Math.abs(_s.y - _dragHide.y) < 1) continue;
                if (!_bpOpen) { _editorBodiesBegin(logic, webgl, width, height); _bpOpen = true; }
                _editorShapeAdd(webgl, _s.def, _s.x, _s.y, _s.size, _s.angle, _bpSlot++);
            }
        }
        if (_bpOpen) _edStillEnd(ctx, webgl!, 1);
        if (_edGL && webgl !== null && logic.mapEditor.hasGhost && logic.mapEditor.ghostKind === 'entity') {
            const _gs = logic.mapEntityGhostShape();
            if (_gs !== null) {
                _editorBodiesBegin(logic, webgl, width, height);
                _editorShapeAdd(webgl, _gs.def, _gs.x, _gs.y, _gs.size, 0, 0);
                _edStillEnd(ctx, webgl, logic.mapEditor.ghostValid ? GHOST_ALPHA : GHOST_ALPHA * 0.5);
            }
        }
        if (!_edGL && SMALL_FIX.G715 !== 0) {
            const _edShapes2 = logic.mapEntityShapes();
            for (let _si = 0; _si < _edShapes2.length; _si++) {
                const _s = _edShapes2[_si];
                if (_dragHide !== null && _dragHide.kind === 'entity' && Math.abs(_s.x - _dragHide.x) < 1 && Math.abs(_s.y - _dragHide.y) < 1) continue;
                _editorShape2D(ctx, logic, _s.def, _s.x, _s.y, _s.size, _s.angle, 1);
            }
            if (logic.mapEditor.hasGhost && logic.mapEditor.ghostKind === 'entity') {
                const _gs = logic.mapEntityGhostShape();
                if (_gs !== null) _editorShape2D(ctx, logic, _gs.def, _gs.x, _gs.y, _gs.size, 0, logic.mapEditor.ghostValid ? GHOST_ALPHA : GHOST_ALPHA * 0.5);
            }
        }
        if (_bpGhostTank !== null) { fillEnemyRenderData(_bpGhostTank, logic); _drawEditorProtectorGL(ctx, logic, webgl!, width, height, logic.mapEditor.ghostValid ? GHOST_ALPHA : GHOST_ALPHA * 0.5); }
    }

    const bulletStrokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);

    const _bulletsArr = logic.bullets;
    const _bulletsLen = _bulletsArr.length;

    if (_bulletSortIdx.length < _bulletsLen) {
        const newLen = Math.max(_bulletsLen, (_bulletSortIdx.length || 64) * 2);
        _bulletSortIdx = new Int32Array(newLen);
        _bulletSortPairs = new Int32Array(newLen * 2);
    }

    let _needBulletSort = false;
    for (let i = 0; i < _bulletsLen; i++) {
        const b = _bulletsArr[i];
        if (b.opacity > 0 && (b.projectileVisual !== 'bullet' || b.generation > 0)) {
            _needBulletSort = true;
            break;
        }
    }

    _bulletSortLen = 0;
    if (_needBulletSort) {
        let _pairIdx = 0;
        for (let i = 0; i < _bulletsLen; i++) {
            if ((!_bulletsArr[i].active && !_bulletsArr[i].isFading) || _bulletsArr[i].opacity <= 0 || _bulletsArr[i].size < ZERO_ROUND_BELOW) continue;
            _bulletSortPairs[_pairIdx++] = _bulletSortKey(_bulletsArr[i]);
            _bulletSortPairs[_pairIdx++] = i;
        }
        const _activeCount = _pairIdx >> 1;

        const _CR = _csCount.length;
        for (let k = 0; k < _CR; k++) _csCount[k] = 0;
        for (let p = 0; p < _pairIdx; p += 2) _csCount[_bulletSortPairs[p]]++;
        let _sum = 0;
        for (let k = 0; k < _CR; k++) { const c = _csCount[k]; _csCount[k] = _sum; _sum += c; }
        for (let p = 0; p < _pairIdx; p += 2) {
            const key = _bulletSortPairs[p];
            _bulletSortIdx[_csCount[key]++] = _bulletSortPairs[p + 1];
        }
        _bulletSortLen = _activeCount;
    } else {
        for (let i = 0; i < _bulletsLen; i++) {
            if ((_bulletsArr[i].active || _bulletsArr[i].isFading) && _bulletsArr[i].opacity > 0 && _bulletsArr[i].size >= ZERO_ROUND_BELOW) {
                _bulletSortIdx[_bulletSortLen++] = i;
            }
        }
    }

    _playerMainBelowLen = 0;
    _playerMainAboveLen = 0;
    _playerAllLen = 0;
    _hasPlayerAboveBullets = false;
    _layerBulletCount = 0;
    _hasLayerBullets = false;
    _playerLayerBulletCount = 0;
    _playerHasLayerBullets = false;
    _orphanEnemyBulletLen = 0;
    _fadingBulletLen = 0;
    _wallIgnoreBulletLen = 0;

    _enemyIdToSlot.clear();
    _enemySlotCount = 0;
    if (logic.state.isTestMode) {
        const _enemies = logic.state.enemyTanks;
        for (let _ei = 0; _ei < _enemies.length; _ei++) {
            if (!_enemies[_ei].active) continue;
            const _slot = _enemySlotCount++;
            _enemyIdToSlot.set(_enemies[_ei].id, _slot);
            _perEnemyBulletLen[_slot] = 0;
            if (_slot >= _perEnemyBulletIdx.length) {
                _perEnemyBulletIdx.push(new Int32Array(Math.max(64, _playerMainBelowIdx.length)));
                const _newPLen = new Int32Array(_perEnemyBulletIdx.length);
                _newPLen.set(_perEnemyBulletLen);
                _perEnemyBulletLen = _newPLen;
            }
        }
    }

    if (_bulletSortLen > 0) {
        const _playerId = logic.state.playerId;

        if (_playerMainBelowIdx.length < _bulletSortLen) {
            const _bkLen = Math.max(_bulletSortLen, (_playerMainBelowIdx.length || 64) * 2);
            _playerMainBelowIdx = new Int32Array(_bkLen);
            _playerMainAboveIdx = new Int32Array(_bkLen);
            _playerAllIdx = new Int32Array(_bkLen);
            _activeBelowIdx = new Int32Array(_bkLen);
            _activeAboveIdx = new Int32Array(_bkLen);
            _orphanEnemyBulletIdx = new Int32Array(_bkLen);
            _fadingBulletIdx = new Int32Array(_bkLen);
            _wallIgnoreBulletIdx = new Int32Array(_bkLen);
            for (let _lbi = 0; _lbi < _MAX_LAYER_BUCKETS; _lbi++) {
                _layerBulletIdx[_lbi] = new Int32Array(_bkLen);
                _playerLayerBulletIdx[_lbi] = new Int32Array(_bkLen);
            }
            for (let _esi = 0; _esi < _perEnemyBulletIdx.length; _esi++) {
                _perEnemyBulletIdx[_esi] = new Int32Array(_bkLen);
            }
        }

        for (let _si = 0; _si < _bulletSortLen; _si++) {
            const _bi = _bulletSortIdx[_si];
            const _b = _bulletsArr[_bi];

            if (_b.ignoresWalls) {
                _wallIgnoreBulletIdx[_wallIgnoreBulletLen++] = _bi;
                continue;
            }

            if (!FADE_KEEPS_ALIVE_Z && _b.isFading) {
                const _keepInLayer = _b.sourceLayerOrder >= 0
                    && (_b.ownerId === _playerId || _enemyIdToSlot.has(_b.ownerId));
                if (!_keepInLayer) {
                    _fadingBulletIdx[_fadingBulletLen++] = _bi;
                    continue;
                }
            }

            if (_b.ownerId !== _playerId) {
                const _eslot = _enemyIdToSlot.get(_b.ownerId);
                if (_eslot !== undefined) {
                    _perEnemyBulletIdx[_eslot][_perEnemyBulletLen[_eslot]++] = _bi;
                } else {
                    _orphanEnemyBulletIdx[_orphanEnemyBulletLen++] = _bi;
                }
            } else {
                _playerAllIdx[_playerAllLen++] = _bi;

                const _pAbove = _roundAboveItsLayer(_b) ? 1 : 0;
                let _pInLayer = _b.sourceLayerOrder >= 0 || _pAbove === 1;
                if (_pInLayer) {
                    let _found = -1;
                    const _plid = _b.sourceLayerId || '';
                    for (let _lk = 0; _lk < _playerLayerBulletCount; _lk++) {
                        if (_playerLayerBulletOrder[_lk] === _b.sourceLayerOrder && _playerLayerBulletLid[_lk] === _plid && _playerLayerBulletAbove[_lk] === _pAbove) { _found = _lk; break; }
                    }
                    if (_found < 0 && _playerLayerBulletCount >= _MAX_LAYER_BUCKETS) {
                        _pInLayer = false;
                    } else {
                        _playerHasLayerBullets = true;
                        if (_found < 0) {
                            _found = _playerLayerBulletCount++;
                            _playerLayerBulletOrder[_found] = _b.sourceLayerOrder;
                            _playerLayerBulletLid[_found] = _plid;
                            _playerLayerBulletAbove[_found] = _pAbove;
                            _playerLayerBulletLen[_found] = 0;
                        }
                        _playerLayerBulletIdx[_found][_playerLayerBulletLen[_found]++] = _bi;
                    }
                }
                if (!_pInLayer) {
                    if (_b.aboveBody) {
                        _playerMainAboveIdx[_playerMainAboveLen++] = _bi;
                        _hasPlayerAboveBullets = true;
                    } else {
                        _playerMainBelowIdx[_playerMainBelowLen++] = _bi;
                    }
                }
            }
        }
    }

    _layerBulletRender.logic = logic;
    _layerBulletRender.webgl = webgl;
    _layerBulletRender.useWebGL = useWebGL;
    _layerBulletRender.viewportBounds = viewportBounds;
    _layerBulletRender.bulletStrokeWidth = bulletStrokeWidth;
    _layerBulletRender.width = width;
    _layerBulletRender.height = height;
    _layerBulletRender.camOffX = _camOffX;
    _layerBulletRender.camOffY = _camOffY;
    _layerBulletRender.bulletsArr = _bulletsArr;
    _layerBulletRender.enabled = false;

    if (webgl && useWebGL && logic.state.isTestMode) {
        webgl.resize(width, height);
        webgl.setRenderScale(getEffectiveRenderScale());
        webgl.setCamera(_camOffX, _camOffY, logic.zoom, width, height);
        webgl.initGeomProgram();
        webgl.setGeomDarkMode(_isDarkMode, borderBlend());
        webgl.setSampleAlphaToCoverage(true);
        webgl.beginFrame();
        _wglUnifiedPassActive = true;
        if ((window as any).__wglDebug5) {
            _dbg5Active = true;
            _dbg5C2d.length = 0;
            _dbg5Wgl.length = 0;
            (window as any).__wglDebug5 = false;
        }
    }

    if (webgl && useWebGL && _wglUnifiedPassActive && showMapFeatures && logic.mapState) {
        _hexToRGB(gridStroke(), _gColor, 0);
        const _grR = _gColor[0], _grG = _gColor[1], _grB = _gColor[2];
        const _grAlpha = 0.04;
        const _grDepth = 1.0;
        let _gridPushed = 0;

        const _gn = gridBoxesOf(logic.areaBounds, inDesigner, mapLimit, logic.getMapLimitY(),
            viewportBounds.minX, viewportBounds.minY, viewportBounds.maxX, viewportBounds.maxY);
        for (let _gi = 0; _gi < _gn; _gi++) {
            const o = _gi * 4;
            const gMinX = GRID_BOXES.a[o], gMinY = GRID_BOXES.a[o + 1], gMaxX = GRID_BOXES.a[o + 2], gMaxY = GRID_BOXES.a[o + 3];
            const _gCy = (gMinY + gMaxY) * 0.5;
            const _gH = gMaxY - gMinY;
            const _gCx = (gMinX + gMaxX) * 0.5;
            const _gW = gMaxX - gMinX;
            for (let x = gMinX; x <= gMaxX; x += GRID_SPACING) {
                webgl.pushGeomInstance('rect_fill', x, _gCy, 0, 1, _gH, _grR, _grG, _grB, 0, _grDepth, 1.0, _grAlpha);
                _gridPushed++;
            }
            for (let y = gMinY; y <= gMaxY; y += GRID_SPACING) {
                webgl.pushGeomInstance('rect_fill', _gCx, y, 0, _gW, 1, _grR, _grG, _grB, 0, _grDepth, 1.0, _grAlpha);
                _gridPushed++;
            }
        }

        const _auraWithGrid = _pushAuraRings(webgl, logic, viewportBounds);
        if (_gridPushed > 0 || _auraWithGrid > 0) {
            webgl.setSampleAlphaToCoverage(false);
            webgl.setDepthMask(false);
            webgl.flushGeom();
            webgl.setDepthMask(true);
            webgl.setSampleAlphaToCoverage(true);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            _compositeWorld(ctx, webgl);
            ctx.restore();
            _restoreCameraTransform(ctx, logic, width, height);
            webgl.clearColorOnly();
            webgl.beginGeomFrame();
        }
    } else if (webgl && useWebGL && _wglUnifiedPassActive && _pushAuraRings(webgl, logic, viewportBounds) > 0) {
        webgl.setSampleAlphaToCoverage(false);
        webgl.setDepthMask(false);
        webgl.flushGeom();
        webgl.setDepthMask(true);
        webgl.setSampleAlphaToCoverage(true);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        _compositeWorld(ctx, webgl);
        ctx.restore();
        _restoreCameraTransform(ctx, logic, width, height);
        webgl.clearColorOnly();
        webgl.beginGeomFrame();
    }
    _lookDeferOn = _wglUnifiedPassActive;

    if (logic.state.isTestMode && logic.mapState && logic.mapState.portals.length > 0) {
      const _rsPortals = logic.mapState.portals;
      const _rsCamX = logic.cameraX;
      const _rsCamY = logic.cameraY;
      const _rsViewHalf = (Math.max(width, height) / logic.zoom) * 0.6;
      for (let _rsPi = 0; _rsPi < _rsPortals.length; _rsPi++) {
        const _rsP = _rsPortals[_rsPi];
        if (_rsP._opacity <= 0 || _rsP._particlesDraining || _rsP.invisible) continue;
        const _rsDx = _rsP.x - _rsCamX;
        const _rsDy = _rsP.y - _rsCamY;
        if (Math.abs(_rsDx) > _rsViewHalf + _rsP.tileSize || Math.abs(_rsDy) > _rsViewHalf + _rsP.tileSize) continue;
        const _rsBodyR = _rsP.eventHorizon * 0.85;
        const _rsScaledR = _rsBodyR * _rsP._scale;
        ctx.save();
        ctx.translate(_rsP.x, _rsP.y);
        ctx.globalAlpha = _rsP._opacity;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 0, _rsScaledR, 0, 6.283185307);
        ctx.fill();
        ctx.restore();
      }
    }

    const isMapDesigner = logic.isMapDesignerActive && !logic.state.isTestMode;
    if (!isMapDesigner && _orphanEnemyBulletLen > 0) {
        _renderBulletBatch(ctx, logic, webgl, useWebGL,
            _orphanEnemyBulletIdx, _orphanEnemyBulletLen, _bulletsArr,
            viewportBounds, bulletStrokeWidth,
            width, height, _camOffX, _camOffY);
    }

    if (!isMapDesigner && _fadingBulletLen > 0) {
        _renderBulletBatch(ctx, logic, webgl, useWebGL,
            _fadingBulletIdx, _fadingBulletLen, _bulletsArr,
            viewportBounds, bulletStrokeWidth,
            width, height, _camOffX, _camOffY);
    }

    if (logic.state.isTestMode) {
        const _pLayerCount = logic.state.bodyLayers.length;
        const _pTurretCount = logic.state.turrets.length;
        const _mlEnemyBudget = enemyQueueBudget(
            _MAX_ML_ENTITIES, playerReservesMultiLayerSlot(_pLayerCount, _pTurretCount));
        const _invisEnemyBudget = enemyQueueBudget(
            _MAX_INVIS_DEFER, playerReservesInvisibleSlot(
                _pLayerCount,
                _playerShownAlpha(logic),
                _ENTITY_FADE_THRESHOLD,
                !!logic.state.invisibleEnabled,
                _pTurretCount));
        for (let _ei = 0; _ei < logic.state.enemyTanks.length; _ei++) {
            const enemy = logic.state.enemyTanks[_ei];
            if (!enemy.active) continue;

            const _eSlot = _enemyIdToSlot.get(enemy.id);
            const _eHasBullets = _eSlot !== undefined && _perEnemyBulletLen[_eSlot] > 0;

            const enemyRadius = _tankCullR(enemy);
            if (!isInViewport(enemy.position.x, enemy.position.y, enemyRadius, viewportBounds)) {
                if (_eHasBullets) {
                    _renderBulletBatch(ctx, logic, webgl, useWebGL,
                        _perEnemyBulletIdx[_eSlot!], _perEnemyBulletLen[_eSlot!], _bulletsArr,
                        viewportBounds, bulletStrokeWidth,
                        width, height, _camOffX, _camOffY);
                }
                continue;
            }

            let alpha = 1;
            let scale = 1;

            if (SPAWN_FADE_IN && enemy.isSpawning) {
                const progress = (logic.gameNow() - enemy.spawnStartTime) / 500;
                const ease = Math.max(0, Math.min(1, progress));
                alpha = ease;
                scale = ease;
            } else if (enemy.isDying) {
                const _deathMs = logic.gameNow() - enemy.deathStartTime;
                alpha = tankDeathAlpha(_deathMs);
                scale = tankDeathScale(_deathMs);
            }

            if (alpha > 0.01) {
                if (enemy.isDying) {
                    if (_eHasBullets) {
                        _renderBulletBatch(ctx, logic, webgl, useWebGL,
                            _perEnemyBulletIdx[_eSlot!], _perEnemyBulletLen[_eSlot!], _bulletsArr,
                            viewportBounds, bulletStrokeWidth,
                            width, height, _camOffX, _camOffY);
                    }
                    if (_wglUnifiedPassActive && webgl && _dyingDeferCount < _MAX_DYING_DEFER) {
                        _dyingDeferIsPlayer[_dyingDeferCount] = 0;
                        _dyingDeferEnemyRef[_dyingDeferCount] = enemy;
                        _dyingDeferAlpha[_dyingDeferCount] = alpha;
                        _dyingDeferScale[_dyingDeferCount] = scale;
                        _dyingDeferPosX[_dyingDeferCount] = enemy.position.x;
                        _dyingDeferPosY[_dyingDeferCount] = enemy.position.y;
                        _dyingDeferCount++;
                    } else {
                        drawEnemyFromDeathCache(ctx, enemy, logic, scale, alpha);
                    }
                } else {
                    fillEnemyRenderData(enemy, logic);

                    if (_rd.alpha <= 0) {
                        if (_eHasBullets) {
                            _renderBulletBatch(ctx, logic, webgl, useWebGL,
                                _perEnemyBulletIdx[_eSlot!], _perEnemyBulletLen[_eSlot!], _bulletsArr,
                                viewportBounds, bulletStrokeWidth,
                                width, height, _camOffX, _camOffY);
                        }
                        continue;
                    }

                    if (alpha < 0.99) {
                        if (_eHasBullets) {
                            _renderBulletBatch(ctx, logic, webgl, useWebGL,
                                _perEnemyBulletIdx[_eSlot!], _perEnemyBulletLen[_eSlot!], _bulletsArr,
                                viewportBounds, bulletStrokeWidth,
                                width, height, _camOffX, _camOffY);
                        }
                        drawTankWithScratch(ctx, scale, alpha);
                    } else {
                        const _eLodPx = enemy.size * logic.zoom;

                        if (_eLodPx < LOD_SIMPLE_PX) {
                            _diagLodMinimal++;
                            const lodKey = _ensureBodyInAtlas(webgl!, 0, _rd.color, false, _rd.sizePx);
                            if (lodKey) {
                                const lodWS = _bodyWorldSize[lodKey] ?? (_rd.sizePx + 14);
                                webgl!.addInstanceByKey(_rd.posX, _rd.posY, 0,
                                    lodWS, lodWS,
                                    1.0, _rd.damageOverlay, _bodyDepth(_wglVisibleEntityIdx, 0), lodKey);
                            }
                            if (_eHasBullets) {
                                _renderBulletBatch(ctx, logic, webgl, useWebGL,
                                    _perEnemyBulletIdx[_eSlot!], _perEnemyBulletLen[_eSlot!], _bulletsArr,
                                    viewportBounds, bulletStrokeWidth,
                                    width, height, _camOffX, _camOffY);
                            }
                            _wglVisibleEntityIdx++;
                        } else if (_eLodPx < LOD_FULL_PX) {
                            _diagLodSimple++;
                            const lodKey = _ensureBodyInAtlas(webgl!, _rd.sides, _rd.color, _rd.isHealer, _rd.sizePx);
                            if (lodKey) {
                                const lodWS = _bodyWorldSize[lodKey] ?? (_rd.sizePx + 14);
                                webgl!.addInstanceByKey(_rd.posX, _rd.posY, _rd.bodyAngle,
                                    lodWS, lodWS,
                                    1.0, _rd.damageOverlay, _bodyDepth(_wglVisibleEntityIdx, 0), lodKey);
                            }
                            if (_eHasBullets) {
                                _renderBulletBatch(ctx, logic, webgl, useWebGL,
                                    _perEnemyBulletIdx[_eSlot!], _perEnemyBulletLen[_eSlot!], _bulletsArr,
                                    viewportBounds, bulletStrokeWidth,
                                    width, height, _camOffX, _camOffY);
                            }
                            _wglVisibleEntityIdx++;
                        } else {
                            _diagLodFull++;
                            const _eHasLayers = _rd.bodyLayers !== null && _rd.bodyLayers.length > 0;
                            const _eLayerCount = _eHasLayers ? _rd.bodyLayers!.length : 0;
                            const _eTurretCount = _rd.turrets ? _rd.turrets.length : 0;
                            const _eOneUnit = fadesAsOneUnit(_rd.canFade, _eLayerCount, _eTurretCount);
                            const _eNeedsML = !_eOneUnit && needsLayerInterleaveSlot(
                                _eLayerCount, _eTurretCount);
                            if (_eNeedsML && _mlCount < _mlEnemyBudget) {
                                _mlVisibleIdx[_mlCount] = _wglVisibleEntityIdx;
                                _mlBulletSlot[_mlCount] = _eHasBullets ? _eSlot! : -2;
                                _mlIsPlayer[_mlCount] = 0;
                                _mlEnemyRefs[_mlCount] = enemy;
                                _mlCount++;
                                if (_eHasBullets) {
                                    _renderBulletBatch(ctx, logic, webgl, useWebGL,
                                        _perEnemyBulletIdx[_eSlot!], _perEnemyBulletLen[_eSlot!], _bulletsArr,
                                        viewportBounds, bulletStrokeWidth,
                                        width, height, _camOffX, _camOffY, true);
                                }
                            } else if ((_eOneUnit || (_rd.alpha < _ENTITY_FADE_THRESHOLD && !_eHasLayers)) && _invisDeferCount < _invisEnemyBudget) {
                                _invisDeferIdx[_invisDeferCount] = _wglVisibleEntityIdx;
                                _invisDeferAlpha[_invisDeferCount] = _rd.alpha;
                                _invisDeferIsPlayer[_invisDeferCount] = 0;
                                _invisDeferEnemyRef[_invisDeferCount] = enemy;
                                _invisDeferCount++;
                                if (_eHasBullets) {
                                    _renderBulletBatch(ctx, logic, webgl, useWebGL,
                                        _perEnemyBulletIdx[_eSlot!], _perEnemyBulletLen[_eSlot!], _bulletsArr,
                                        viewportBounds, bulletStrokeWidth,
                                        width, height, _camOffX, _camOffY);
                                }
                            } else {
                                _wantAboveRoundSlot = LAYER_ROUNDS_ABOVE !== 0;
                                _addTankGeometry(webgl!, _wglVisibleEntityIdx);
                                _wantAboveRoundSlot = false;
                                if (_eHasBullets) {
                                    _renderBulletBatch(ctx, logic, webgl, useWebGL,
                                        _perEnemyBulletIdx[_eSlot!], _perEnemyBulletLen[_eSlot!], _bulletsArr,
                                        viewportBounds, bulletStrokeWidth,
                                        width, height, _camOffX, _camOffY);
                                }
                                _aboveRoundDepth = -1;
                            }
                            _wglVisibleEntityIdx++;
                        }
                    }
                }
            } else if (enemy.isDying) {
                if (_eHasBullets) {
                    _renderBulletBatch(ctx, logic, webgl, useWebGL,
                        _perEnemyBulletIdx[_eSlot!], _perEnemyBulletLen[_eSlot!], _bulletsArr,
                        viewportBounds, bulletStrokeWidth,
                        width, height, _camOffX, _camOffY);
                }
                cleanupDeathCanvas(enemy.id);
            }
        }
    }

    if (!isMapDesigner && !PHOTO_MODE && !logic.controlling) {
        const invisAlpha = _playerShownAlpha(logic);
        const ghostModeAlpha = (logic.state.ghostMode ? 0.3 : 1.0) * invisAlpha;

        fillPlayerRenderData(logic);

        if (logic.tankDying) {
            if (_playerAllLen > 0) {
                _renderBulletBatch(ctx, logic, webgl, useWebGL,
                    _playerAllIdx, _playerAllLen, _bulletsArr,
                    viewportBounds, bulletStrokeWidth,
                    width, height, _camOffX, _camOffY);
            }
            const _deathMs = logic.gameNow() - logic.tankDeathStartTime;
            const alpha = tankDeathAlpha(_deathMs) * ghostModeAlpha;
            const scale = tankDeathScale(_deathMs);
            if (alpha <= 0) {
            } else if (_wglUnifiedPassActive && webgl && _dyingDeferCount < _MAX_DYING_DEFER) {
                _dyingDeferIsPlayer[_dyingDeferCount] = 1;
                _dyingDeferEnemyRef[_dyingDeferCount] = null;
                _dyingDeferAlpha[_dyingDeferCount] = alpha;
                _dyingDeferScale[_dyingDeferCount] = scale;
                _dyingDeferPosX[_dyingDeferCount] = logic.tankPos.x;
                _dyingDeferPosY[_dyingDeferCount] = logic.tankPos.y;
                _dyingDeferCount++;
            } else {
                drawTankWithScratch(ctx, scale, alpha);
            }
        } else if (SPAWN_FADE_IN && logic.state.tankSpawning) {
            if (_playerAllLen > 0) {
                _renderBulletBatch(ctx, logic, webgl, useWebGL,
                    _playerAllIdx, _playerAllLen, _bulletsArr,
                    viewportBounds, bulletStrokeWidth,
                    width, height, _camOffX, _camOffY);
            }
            let progress = (logic.gameNow() - logic.state.tankSpawnStartTime) / 500;
            progress = Math.min(Math.max(progress, 0), 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            const alpha = ease * ghostModeAlpha;
            const scale = ease;
            drawTankWithScratch(ctx, scale, alpha);
        } else {
            const _otherMode = !logic.state.isTestMode && logic.state.canvasEntityKind === 'other' && logic.state.viewingOther !== null;
            const _shapeMode = _otherMode || (!logic.state.isTestMode && logic.state.canvasEntityKind === 'shape' && logic.state.editingShape !== null);
            const _editingOnLayer = !logic.state.isTestMode && !_shapeMode && logic.state.activeBodyLayerId !== null;

            if (_editingOnLayer) {
                _previewInjectLayerId = logic.state.activeBodyLayerId;
                _previewInjectLogic = logic;
            } else if (!logic.state.isTestMode && !_shapeMode) {
                _previewInjectLogic = logic;
            }
            const _edTankOnGL = _edGL && webgl !== null && !logic.state.isTestMode && _playerAllLen === 0;
            if (_otherMode) {
                if (!(_edTankOnGL && _drawEditorOtherGL(ctx, logic, webgl!, width, height))) _drawEditorOtherView(ctx, logic);
            } else if (_shapeMode) {
                if (!(_edTankOnGL && _drawEditorShapeGL(ctx, logic, webgl!, width, height))) _drawEditorShapePreview(ctx, logic);
            } else if (_edTankOnGL) {
                _drawEditorTankGL(ctx, logic, webgl!, width, height, logic.state.ghostMode ? ghostModeAlpha : 1);
            } else if (logic.state.ghostMode) {
                if (_playerAllLen > 0) {
                    _renderBulletBatch(ctx, logic, webgl, useWebGL,
                        _playerAllIdx, _playerAllLen, _bulletsArr,
                        viewportBounds, bulletStrokeWidth,
                        width, height, _camOffX, _camOffY);
                }
                drawTankWithScratch(ctx, 1.0, ghostModeAlpha);
            } else if (_wglUnifiedPassActive && webgl && logic.state.isTestMode) {
                const _pHasLayers = _rd.bodyLayers !== null && _rd.bodyLayers.length > 0;
                const _pFillLayers = _pHasLayers ? _rd.bodyLayers!.length : 0;
                const _pFillTurrets = _rd.turrets ? _rd.turrets.length : 0;
                const _pOneUnit = fadesAsOneUnit(_rd.canFade, _pFillLayers, _pFillTurrets);
                const _pNeedsML = !_pOneUnit && needsLayerInterleaveSlot(
                    _pFillLayers, _pFillTurrets);
                if (_pNeedsML && _mlCount < _MAX_ML_ENTITIES) {
                    _mlVisibleIdx[_mlCount] = _wglVisibleEntityIdx;
                    _mlBulletSlot[_mlCount] = -1;
                    _mlIsPlayer[_mlCount] = 1;
                    _mlEnemyRefs[_mlCount] = null;
                    _mlCount++;
                    if (_playerAllLen > 0) {
                        _renderBulletBatch(ctx, logic, webgl, useWebGL,
                            _playerAllIdx, _playerAllLen, _bulletsArr,
                            viewportBounds, bulletStrokeWidth,
                            width, height, _camOffX, _camOffY, true);
                    }
                } else if ((_pOneUnit || (_rd.alpha < _ENTITY_FADE_THRESHOLD && !_pHasLayers)) && _invisDeferCount < _MAX_INVIS_DEFER) {
                    _invisDeferIdx[_invisDeferCount] = _wglVisibleEntityIdx;
                    _invisDeferAlpha[_invisDeferCount] = _rd.alpha;
                    _invisDeferIsPlayer[_invisDeferCount] = 1;
                    _invisDeferEnemyRef[_invisDeferCount] = null;
                    _invisDeferCount++;
                    if (_playerAllLen > 0) {
                        _renderBulletBatch(ctx, logic, webgl, useWebGL,
                            _playerAllIdx, _playerAllLen, _bulletsArr,
                            viewportBounds, bulletStrokeWidth,
                            width, height, _camOffX, _camOffY);
                    }
                } else {
                    _wantAboveRoundSlot = LAYER_ROUNDS_ABOVE !== 0;
                    _addTankGeometry(webgl, _wglVisibleEntityIdx);
                    _wantAboveRoundSlot = false;
                    if (_playerAllLen > 0) {
                        _renderBulletBatch(ctx, logic, webgl, useWebGL,
                            _playerAllIdx, _playerAllLen, _bulletsArr,
                            viewportBounds, bulletStrokeWidth,
                            width, height, _camOffX, _camOffY);
                    }
                    _aboveRoundDepth = -1;
                }
                _wglVisibleEntityIdx++;
            } else {
                _activeBelowLen = _playerMainBelowLen;
                if (_playerMainBelowLen > 0) _activeBelowIdx.set(_playerMainBelowIdx.subarray(0, _playerMainBelowLen));
                _activeAboveLen = _playerMainAboveLen;
                if (_playerMainAboveLen > 0) _activeAboveIdx.set(_playerMainAboveIdx.subarray(0, _playerMainAboveLen));
                _hasActiveAboveBullets = _hasPlayerAboveBullets;

                _layerBulletCount = _playerLayerBulletCount;
                _hasLayerBullets = _playerHasLayerBullets;
                for (let _rli = 0; _rli < _playerLayerBulletCount; _rli++) {
                    _layerBulletOrder[_rli] = _playerLayerBulletOrder[_rli];
                    _layerBulletLid[_rli] = _playerLayerBulletLid[_rli];
                    _layerBulletAbove[_rli] = _playerLayerBulletAbove[_rli];
                    _layerBulletLen[_rli] = _playerLayerBulletLen[_rli];
                    _layerBulletIdx[_rli].set(
                        _playerLayerBulletIdx[_rli].subarray(0, _playerLayerBulletLen[_rli])
                    );
                }

                _layerBulletRender.enabled = true;

                if (!_wglUnifiedPassActive) _drawAuraRings2D(ctx, logic);

                drawTankAndTurrets(ctx, false, _PASS_BELOW);
                if (!logic.state.isTestMode && !_editingOnLayer && logic.state.autoSubTurretEditMode) {
                    drawPreviewTurret(ctx, logic, 'below');
                    drawPresetPreview(ctx, logic, 'below');
                }

                drawTankAndTurrets(ctx, false, _PASS_BODY);

                if (_hasActiveAboveBullets) {
                    _renderBulletBatch(ctx, logic, webgl, useWebGL,
                        _activeAboveIdx, _activeAboveLen, _bulletsArr,
                        viewportBounds, bulletStrokeWidth,
                        width, height, _camOffX, _camOffY);
                }

                drawTankAndTurrets(ctx, false, _PASS_ABOVE);

                _layerBulletRender.enabled = false;
            }
            if (!logic.state.isTestMode && !_shapeMode && !_editingOnLayer && logic.state.autoSubTurretEditMode && !(_edTankOnGL && !logic.state.ghostMode)) {
                 drawPreviewTurret(ctx, logic, 'above');
                 drawPresetPreview(ctx, logic, 'above');
            }
            _previewInjectLayerId = null;
            _previewInjectLogic = null;
        }
    }

    const _wglWasActive = _wglUnifiedPassActive;
    if (_wglUnifiedPassActive && webgl) {
        _lookDeferOn = false;
        const _hasGeom1 = webgl.hasGeomContent();
        webgl.flushGeom();
        if (logic.state.debugMode && logic.state.isTestMode && logic.state.debugShowProjectileHP) {
            _emitBulletHPText(webgl, logic.bullets, logic.zoom, viewportBounds);
        }
        const _hasAtlas1 = webgl.hasContent();
        webgl.flush();
        if (_hasGeom1 || _hasAtlas1) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            _compositeWorld(ctx, webgl);
            ctx.restore();
            _restoreCameraTransform(ctx, logic, width, height);
        }

        if (_lookDeferCount > 0) _drainLookUnits(webgl, ctx, logic, width, height);

        if (FADE_KEEPS_ALIVE_Z && _dyingBulletDeferCount > 0) {
            _drainDyingBulletUnits(webgl, ctx, logic, width, height, _camOffX, _camOffY, true);
        }

        if (_mlCount > 0) {
            const _mlGhost = logic.state.ghostMode;
            const _mlPlayerId = logic.state.playerId;
            for (let mi = 0; mi < _mlCount; mi++) {
                if (_mlIsPlayer[mi]) {
                    fillPlayerRenderData(logic);
                } else {
                    fillEnemyRenderData(_mlEnemyRefs[mi], logic);
                }

                if (ML_ENTITY_UNIT_DEPTH) {
                    _geoUnitDepthBuf[0] = _BODY_DEPTH_END
                        - (_mlVisibleIdx[mi] + 0.5) * _bodyRangePerEntity;
                    _geoUnitDepthOn = 1;
                }
                _renderMultiLayerEntity(webgl, ctx, _mlVisibleIdx[mi], _bulletsArr,
                    _mlBulletSlot[mi], _mlIsPlayer[mi] !== 0,
                    viewportBounds, _mlGhost, _mlPlayerId, width, height, logic);
                _geoUnitDepthOn = 0;

                webgl.clearColorOnly();
                if (ML_CROSS_ENTITY_DEPTH_STAMP) {
                    if (!ML_ENTITY_UNIT_DEPTH) {
                        webgl.beginGeomFrame();
                        webgl.setColorMask(false);
                        webgl.setDepthFunc(true);
                        webgl.setDepthMask(true);
                        const _aAlpha = _rd.alpha;
                        _rd.alpha = 1.0;
                        _addTankGeometry(webgl, _mlVisibleIdx[mi]);
                        _rd.alpha = _aAlpha;
                        webgl.flushGeom();
                        webgl.setColorMask(true);
                    }
                }
            }
            webgl.setDepthFunc(false);
            webgl.setDepthMask(true);
        }

        if (_invisDeferCount > 0) {
            for (let _idi = 0; _idi < _invisDeferCount; _idi++) {
                if (_invisDeferIsPlayer[_idi]) {
                    fillPlayerRenderData(logic);
                } else {
                    fillEnemyRenderData(_invisDeferEnemyRef[_idi], logic);
                }
                const _savedInvisAlpha = _rd.alpha;
                _rd.alpha = 1.0;

                webgl.beginFrame();
                _addTankGeometry(webgl, _invisDeferIdx[_idi]);
                const _hasInvisGeom = webgl.hasGeomContent();
                webgl.flushGeom();

                if (_hasInvisGeom) {
                    ctx.save();
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.globalAlpha = _invisDeferAlpha[_idi];
                    _compositeMiniFlush(ctx, webgl);
                    ctx.globalAlpha = 1.0;
                    ctx.restore();
                    _restoreCameraTransform(ctx, logic, width, height);
                }
                _rd.alpha = _savedInvisAlpha;
            }
        }

        if (_dyingDeferCount > 0) {
            for (let _ddi = 0; _ddi < _dyingDeferCount; _ddi++) {
                if (_dyingDeferIsPlayer[_ddi]) {
                    fillPlayerRenderData(logic);
                } else {
                    fillEnemyRenderData(_dyingDeferEnemyRef[_ddi]!, logic);
                }
                const _dyingOwnAlpha = (MOTION_ARRAS.DEATH && !_dyingDeferIsPlayer[_ddi]) ? _rd.alpha : 1.0;
                _rd.alpha = 1.0;
                if (MOTION_ARRAS.DEATH) _rd.sizePx *= _dyingDeferScale[_ddi];

                webgl.beginFrame();
                _addTankGeometry(webgl, 0);
                const _hasDyingGeom = webgl.hasGeomContent();
                webgl.flushGeom();

                if (_hasDyingGeom) {
                    const _dScreenX = (_dyingDeferPosX[_ddi] - _camOffX) * logic.zoom + width / 2;
                    const _dScreenY = (_dyingDeferPosY[_ddi] - _camOffY) * logic.zoom + height / 2;
                    ctx.save();
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.globalAlpha = _dyingDeferAlpha[_ddi] * _dyingOwnAlpha;
                    if (!MOTION_ARRAS.DEATH) {
                        ctx.translate(_dScreenX, _dScreenY);
                        ctx.scale(_dyingDeferScale[_ddi], _dyingDeferScale[_ddi]);
                        ctx.translate(-_dScreenX, -_dScreenY);
                    }
                    _compositeMiniFlush(ctx, webgl);
                    ctx.globalAlpha = 1.0;
                    ctx.restore();
                    _restoreCameraTransform(ctx, logic, width, height);
                }
                _dyingDeferEnemyRef[_ddi] = null;
            }
            _dyingDeferCount = 0;
        }

        if (!FADE_KEEPS_ALIVE_Z && _dyingBulletDeferCount > 0) {
            _drainDyingBulletUnits(webgl, ctx, logic, width, height, _camOffX, _camOffY, false);
        }

        webgl.beginGeomFrame();
        webgl.clearColorOnly();
        webgl.setDepthTestEnabled(false);
        const _shapesExact = shapePassExactAlpha();
        if (_shapesExact) webgl.setSampleAlphaToCoverage(false);

        _worldColorsOfFrame(logic, _shapeCacheFrame);

        let _shapePolyhedronCount = 0;
        const _polys = logic.floatingPolygons, _puffs = logic.shapePuffs;
        const _nPolys = _polys.length, _nShapes = _nPolys + _puffs.length;
        const _admShapeTeam = logic.admin.shapeTeamOn;
        const _admMyFill = _admShapeTeam ? _adminPlayerFill(logic) : '';
        for (let i = 0; i < _nShapes; i++) {
            const poly = i < _nPolys ? _polys[i] : _puffs[i - _nPolys];
            if (!poly.active || poly.opacity <= 0) continue;
            if (poly.isPolyhedron) { _shapePolyhedronCount++; continue; }
            const polyRadius = poly.look !== null ? Math.max(poly.size, poly.size * poly.look.reach / 2) * poly.growth : poly.size * poly.growth;
            if (!isInViewport(poly.position.x, poly.position.y, polyRadius, viewportBounds)) continue;

            let finalAlpha = poly.opacity / 255;
            if (poly.baseOpacity < 1.0) {
                const _shNear = logic.shadowShapeNearness(poly);
                const _shFl = (poly as CarryMarked)._carryKey !== undefined ? carryFloor(poly as CarryMarked, poly.id, logic.gameNow()) : 0;
                if (_shNear <= 0 && _shFl <= 0) continue;
                finalAlpha = Math.max(finalAlpha * _shNear, _shFl);
            }
            if (poly.look !== null) {
                if (_lookShapeCount >= _lookCap) _growLookQueue();
                _lookShapeRef[_lookShapeCount] = poly; _lookShapeAlpha[_lookShapeCount] = finalAlpha; _lookShapeCount++;
                continue;
            }

            if (nestedShapeFadesAsOneUnit(poly.labyLevel, poly.fadingOut, poly.fadingIn, poly.baseOpacity, SEE_THROUGH.AS_SET) && _dyingShapeDeferCount < _MAX_DYING_SHAPE_DEFER) {
                _dyingShapeDeferRef[_dyingShapeDeferCount] = poly;
                _dyingShapeDeferAlpha[_dyingShapeDeferCount] = finalAlpha;
                _dyingShapeDeferPosX[_dyingShapeDeferCount] = poly.position.x;
                _dyingShapeDeferPosY[_dyingShapeDeferCount] = poly.position.y;
                _dyingShapeDeferCount++;
                continue;
            }
            if (poly._fadeT >= 0) finalAlpha *= deathSpreadGain(poly.opacity, poly._fadeO0, webgl.alphaIsSpread());

            const sz = poly.size * poly.growth;
            const sides = poly.baseSides;

            let baseCol = (_admShapeTeam && (SMALL_FIX.G656 !== 0 ? logic.admin.shapeWearsMine(poly) : logic.admin.shapeOnMyTeam(poly))) ? _admMyFill : shapeFill(poly.color, poly.colorMap, poly.isCrasher);
            if (poly.isAnimatedColor) {
                baseCol = getWorldAnimatedColor(poly.animationType, _isDarkMode);
            }
            _hexToRGB(baseCol, _gColor, 0);
            const sr = _gColor[0], sg = _gColor[1], sb = _gColor[2];

            let batchKey: string;
            let halfExtent: number;
            if (sides < 3) {
                batchKey = 'circle';
                halfExtent = sz / 2;
            } else {
                batchKey = sides <= 16 ? POLY_BATCH_KEY[sides] : 'circle';
                halfExtent = (sz / 2) * getRealSizeFactor(sides);
            }

            let polyRot = poly.rotation;
            if (sides >= 4 && sides % 2 === 0) {
                polyRot += -Math.PI / sides;
            }

            webgl.pushGeomInstance(batchKey, poly.position.x, poly.position.y,
                sides >= 3 ? polyRot : 0,
                halfExtent, halfExtent, sr, sg, sb, poly.damageOverlay,
                0.0, 1.0, finalAlpha);

            if (poly.labyLevel > 0) {
                const ds = labyDownscale(sides);
                if (sides < 3) {
                    for (let li = 1; li <= poly.labyLevel; li++) {
                        const layerR = (sz / 2) * Math.pow(ds, li);
                        webgl.pushGeomInstance('circle', poly.position.x, poly.position.y, 0,
                            layerR, layerR, sr, sg, sb, poly.damageOverlay, 0.0, 1.0, finalAlpha);
                    }
                } else {
                    const nestKey = sides <= 16 ? POLY_BATCH_KEY[sides] : 'circle';
                    const outerR = (sz / 2) * getRealSizeFactor(sides);
                    for (let li = 1; li <= poly.labyLevel; li++) {
                        const layerR = outerR * Math.pow(ds, li);
                        const layerRot = (li % 2 !== 0) ? polyRot + Math.PI / sides : polyRot;
                        webgl.pushGeomInstance(nestKey, poly.position.x, poly.position.y,
                            layerRot, layerR, layerR, sr, sg, sb, poly.damageOverlay, 0.0, 1.0, finalAlpha);
                    }
                }
            }
        }

        const _hasShapeGeom = webgl.hasGeomContent();
        webgl.flushGeom();
        if (_hasShapeGeom) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            _compositeWorld(ctx, webgl);
            ctx.restore();
            _restoreCameraTransform(ctx, logic, width, height);
        }

        if (_lookShapeCount > 0) {
            webgl.setDepthTestEnabled(true);
            webgl.beginFrame();
            let _lkDepth = _LOOK_DEPTH_START;
            for (let _li = 0; _li < _lookShapeCount; _li++) {
                const _lp = _lookShapeRef[_li];
                if (_lp === null || _lookShapeAlpha[_li] < 0.999) continue;
                if (_lkDepth < _LOOK_DEPTH_FLOOR) {
                    const _hasPart = webgl.hasGeomContent();
                    webgl.flushGeom();
                    if (_hasPart) {
                        ctx.save();
                        ctx.setTransform(1, 0, 0, 1, 0, 0);
                        _compositeWorld(ctx, webgl);
                        ctx.restore();
                        _restoreCameraTransform(ctx, logic, width, height);
                    }
                    webgl.beginFrame();
                    _lkDepth = _LOOK_DEPTH_START;
                }
                _lkDepth = _pushShapeLook(webgl, _lp, _lkDepth, _wornFillOf(_lp, logic));
            }
            const _hasLookGeom = webgl.hasGeomContent();
            webgl.flushGeom();
            if (_hasLookGeom) {
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                _compositeWorld(ctx, webgl);
                ctx.restore();
                _restoreCameraTransform(ctx, logic, width, height);
            }
            for (let _li = 0; _li < _lookShapeCount; _li++) {
                const _lp = _lookShapeRef[_li];
                _lookShapeRef[_li] = null;
                if (_lp === null || _lookShapeAlpha[_li] >= 0.999) continue;
                webgl.beginFrame();
                _pushShapeLook(webgl, _lp, _LOOK_DEPTH_START, _wornFillOf(_lp, logic));
                const _hasOne = webgl.hasGeomContent();
                webgl.flushGeom();
                if (_hasOne) {
                    ctx.save();
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.globalAlpha = _lookShapeAlpha[_li];
                    _compositeMiniFlush(ctx, webgl);
                    ctx.globalAlpha = 1.0;
                    ctx.restore();
                    _restoreCameraTransform(ctx, logic, width, height);
                }
            }
            _lookShapeCount = 0;
            webgl.setDepthTestEnabled(false);
        }

        if (_dyingShapeDeferCount > 0) {
            for (let _sdi = 0; _sdi < _dyingShapeDeferCount; _sdi++) {
                const _dp = _dyingShapeDeferRef[_sdi];
                if (!_dp || !_dp.active) {
                    _dyingShapeDeferRef[_sdi] = null;
                    continue;
                }

                const _dpSz = _dp.size * _dp.growth;
                const _dpSides = _dp.baseSides;

                let _dpBaseCol = shapeFill(_dp.color, _dp.colorMap, _dp.isCrasher);
                if (_dp.isAnimatedColor) {
                    _dpBaseCol = getWorldAnimatedColor(_dp.animationType, _isDarkMode);
                }
                _hexToRGB(_dpBaseCol, _gColor, 0);
                const _dpR = _gColor[0], _dpG = _gColor[1], _dpB = _gColor[2];

                let _dpBatchKey: string;
                let _dpHalfExtent: number;
                if (_dpSides < 3) {
                    _dpBatchKey = 'circle';
                    _dpHalfExtent = _dpSz / 2;
                } else {
                    _dpBatchKey = _dpSides <= 16 ? POLY_BATCH_KEY[_dpSides] : 'circle';
                    _dpHalfExtent = (_dpSz / 2) * getRealSizeFactor(_dpSides);
                }

                let _dpRot = _dp.rotation;
                if (_dpSides >= 4 && _dpSides % 2 === 0) {
                    _dpRot += -Math.PI / _dpSides;
                }

                webgl.beginFrame();

                webgl.pushGeomInstance(_dpBatchKey, _dp.position.x, _dp.position.y,
                    _dpSides >= 3 ? _dpRot : 0,
                    _dpHalfExtent, _dpHalfExtent, _dpR, _dpG, _dpB, _dp.damageOverlay,
                    0.0, 1.0, 1.0);
                const _dpDs = labyDownscale(_dpSides);
                if (_dpSides < 3) {
                    for (let _li = 1; _li <= _dp.labyLevel; _li++) {
                        const _layerR = (_dpSz / 2) * Math.pow(_dpDs, _li);
                        webgl.pushGeomInstance('circle', _dp.position.x, _dp.position.y, 0,
                            _layerR, _layerR, _dpR, _dpG, _dpB, _dp.damageOverlay, 0.0, 1.0, 1.0);
                    }
                } else {
                    const _dpNestKey = _dpSides <= 16 ? POLY_BATCH_KEY[_dpSides] : 'circle';
                    const _dpOuterR = (_dpSz / 2) * getRealSizeFactor(_dpSides);
                    for (let _li = 1; _li <= _dp.labyLevel; _li++) {
                        const _layerR = _dpOuterR * Math.pow(_dpDs, _li);
                        const _layerRot = (_li % 2 !== 0) ? _dpRot + Math.PI / _dpSides : _dpRot;
                        webgl.pushGeomInstance(_dpNestKey, _dp.position.x, _dp.position.y,
                            _layerRot, _layerR, _layerR, _dpR, _dpG, _dpB, _dp.damageOverlay, 0.0, 1.0, 1.0);
                    }
                }

                const _hasDyingShape = webgl.hasGeomContent();
                webgl.flushGeom();

                if (_hasDyingShape) {
                    ctx.save();
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.globalAlpha = _dyingShapeDeferAlpha[_sdi];
                    _compositeMiniFlush(ctx, webgl);
                    ctx.globalAlpha = 1.0;
                    ctx.restore();
                    _restoreCameraTransform(ctx, logic, width, height);
                }

                _dyingShapeDeferRef[_sdi] = null;
            }
            _dyingShapeDeferCount = 0;
        }
        if (_shapesExact) webgl.setSampleAlphaToCoverage(true);

        if (_shapePolyhedronCount > 0) {
            for (let i = 0; i < _nShapes; i++) {
                const poly = i < _nPolys ? _polys[i] : _puffs[i - _nPolys];
                if (!poly.isPolyhedron || !poly.active || poly.opacity <= 0) continue;
                if (!isInViewport(poly.position.x, poly.position.y, poly.size * poly.growth * 1.1, viewportBounds)) continue;
                const pAlpha = poly.opacity / 255;
                drawPolygonWithScratch(ctx, logic, poly, pAlpha);
            }
        }

        webgl.beginGeomFrame();
        webgl.clearColorOnly();
        _seeThruPushed = false;
        const _hwLook = (showMapFeatures && logic.mapState) ? halloweenLook(logic) : null;
        const _hw = (_hwLook !== null && webgl.ensureHalloweenBatches(_hwLook.meshes)) ? _hwLook : null;
        const _hwHalfW = (width / 2) / logic.zoom * 1.25, _hwHalfH = (height / 2) / logic.zoom * 1.25;
        const _hwVL = logic.cameraX - _hwHalfW, _hwVR = logic.cameraX + _hwHalfW;
        const _hwVT = logic.cameraY - _hwHalfH, _hwVB = logic.cameraY + _hwHalfH;
        let _hwVeilEyes: EyeTable | null = null;

        if (showMapFeatures && logic.mapState && logic.mapState.walls.length > 0) {
            const ms = logic.mapState;
            const walls = ms.walls;

            const _wtMine = WALL_TYPES_4S.ON && logic.state.isTestMode ? logic.admin.myTeam() : 0;
            _glPushWalls(webgl, walls, null, logic.admin.wallSlotsOn ? logic.admin.wallSlots : null,
                _wtMine, _wtMine === WALL_TEAM ? _adminPlayerFill(logic) : '');
            _veilWalls = walls; _veilSlots = logic.admin.wallSlotsOn ? logic.admin.wallSlots : null;
            _veilTeam = _wtMine; _veilMineHex = _wtMine === WALL_TEAM ? _adminPlayerFill(logic) : '';

            if (_hw !== null && _hw.eyeList !== null) {
                const _hwEyes = hwBeginEyes(logic, _hw);
                if (_hwEyes !== null && pushEyes(webgl, _hwEyes, walls, TileType.WALL, hwEyeRgb(_hw), _hwVL, _hwVR, _hwVT, _hwVB, hwEyeTargets()) > 0) _hwVeilEyes = _hwEyes;
            }

        }

        if (showMapFeatures && logic.mapState && logic.mapState.rocks.length > 0) {
            const ms = logic.mapState;
            const currentZoom = logic.isMapDesignerActive && !logic.state.isTestMode ? logic.mapDesignerZoom : logic.zoom;
            const vpHalfW = (width / 2) / currentZoom;
            const vpHalfH = (height / 2) / currentZoom;
            const vpCx = logic.isMapDesignerActive && !logic.state.isTestMode ? logic.mapDesignerCamX : logic.cameraX;
            const vpCy = logic.isMapDesignerActive && !logic.state.isTestMode ? logic.mapDesignerCamY : logic.cameraY;
            const rvLeft = vpCx - vpHalfW;
            const rvRight = vpCx + vpHalfW;
            const rvTop = vpCy - vpHalfH;
            const rvBottom = vpCy + vpHalfH;
            _glPushRocks(webgl, ms.rocks, _hw, rvLeft, rvRight, rvTop, rvBottom, null, logic.admin.wallSlotsOn ? logic.admin.wallSlots : null);
        }

        const _hasWallGeom = webgl.hasGeomContent();
        const _seeThruNow = _seeThruPushed;
        if (_seeThruNow) webgl.setSampleAlphaToCoverage(false);
        webgl.flushGeom();
        if (_seeThruNow) webgl.setSampleAlphaToCoverage(true);
        if (_hwVeilEyes !== null && _hw !== null && eyeAlpha() < 1) {
            const _wc = hwWallRgb(_hw);
            webgl.setSampleAlphaToCoverage(false);
            webgl.beginGeomFrame();
            pushEyeVeils(webgl, _hwVeilEyes, _wc[0], _wc[1], _wc[2], eyeAlpha(), SMALL_FIX.G736 !== 0 ? _veilRgbOfRow : null);
            webgl.flushGeom();
            webgl.setSampleAlphaToCoverage(true);
        }
        if (_hasWallGeom) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            _compositeWorld(ctx, webgl);
            ctx.restore();
            _restoreCameraTransform(ctx, logic, width, height);
        }

        if (showMapFeatures && (logic.admin.lookWalls.length > 0 || logic.admin.dying.length > 0 || logic.admin.dyingRocks.length > 0)) {
            _drawPanelWalls(ctx, logic, webgl, width, height, _hw);
        }
        if (logic.admin.dotUntil[0] >= 0 || logic.admin.dotUntil[1] >= 0) _drawPanelDots(ctx, logic, webgl, width, height);

        webgl.setDepthTestEnabled(true);
        _wglUnifiedPassActive = false;

        if (_dbg5Active) {
            _dbg5Active = false;
        }
    }

    const polyStrokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);

    if (!_wglWasActive) {
        const pswBkt = Math.round(polyStrokeWidth * 100) / 100;
        let polyTransformDirty = false;

        _worldColorsOfFrame(logic, _shapeCacheFrame);

        const _polys = logic.floatingPolygons, _puffs = logic.shapePuffs;
        const _nPolys = _polys.length, _nShapes = _nPolys + _puffs.length;
        for (let i = 0; i < _nShapes; i++) {
            const poly = i < _nPolys ? _polys[i] : _puffs[i - _nPolys];

            if (!poly.active || poly.opacity <= 0) continue;
            const polyRadius = poly.look !== null ? Math.max(poly.size, poly.size * poly.look.reach / 2) * poly.growth : poly.size * poly.growth;
            if (!isInViewport(poly.position.x, poly.position.y, polyRadius, viewportBounds)) continue;

            const alpha = poly.opacity / 255;

            let finalAlpha = alpha;
            if (poly.baseOpacity < 1.0) {
                const _shNear = logic.shadowShapeNearness(poly);
                const _shFl = (poly as CarryMarked)._carryKey !== undefined ? carryFloor(poly as CarryMarked, poly.id, logic.gameNow()) : 0;
                if (_shNear <= 0 && _shFl <= 0) continue;
                finalAlpha = Math.max(finalAlpha * _shNear, _shFl);
            }

            const sz = poly.size * poly.growth;

            const useScratch = finalAlpha < 0.99 || poly.isAnimatedColor || poly.damageOverlay > 0 || poly.isPolyhedron || poly.look !== null;

            if (useScratch) {
                if (polyTransformDirty) { _restoreCameraTransform(ctx, logic, width, height); polyTransformDirty = false; }
                drawPolygonWithScratch(ctx, logic, poly, poly.isAnimatedColor && finalAlpha >= 0.99 ? 1.0 : finalAlpha);
            } else {
                const szBkt = bucketSize(sz);
                const mappedColor = shapeFill(poly.color, poly.colorMap, poly.isCrasher);

                let key = poly._renderKey;
                if (key === '' || szBkt !== poly._lastSzBkt || _cacheScaleChanged || _darkModeKeyDirty) {
                    key = getPolyCacheKey(
                        poly.baseSides, mappedColor, szBkt, pswBkt,
                        poly.labyLevel, _currentCacheScale
                    );
                    poly._renderKey = key;
                    poly._lastSzBkt = szBkt;
                }

                const cached = getCachedPolyShapeByKey(key, poly, mappedColor, szBkt, polyStrokeWidth, _currentCacheScale);
                const half = cached.bufSize / 2;

                const cos = Math.cos(poly.rotation);
                const sin = Math.sin(poly.rotation);
                ctx.setTransform(
                    cos * logic.zoom, sin * logic.zoom,
                    -sin * logic.zoom, cos * logic.zoom,
                    (poly.position.x - _camOffX) * logic.zoom + width / 2,
                    (poly.position.y - _camOffY) * logic.zoom + height / 2
                );
                ctx.drawImage(cached.canvas, -half, -half, cached.bufSize, cached.bufSize);
                polyTransformDirty = true;
            }
        }
        if (polyTransformDirty) { _restoreCameraTransform(ctx, logic, width, height); }
    }

    if (!inDesigner || _edGL) _keptMap.release();
    if ((inDesigner && !_edGL) || (logic.state.isTestMode && logic.state.debugMode && logic.state.dbgShowAreaMarks)) _drawEditorAreaMarks(ctx, logic, width, height, dt, _dragHide); else _keptAreaMarks.release();
    if (inDesigner && _edGL && webgl !== null) _drawEditorAreasGL(ctx, logic, webgl, width, height, _dragHide);
    if (!inDesigner || !_edGL) _releaseEditorMapGL(webgl);
    if (!_wglWasActive && showMapFeatures && logic.mapState) {
      if (inDesigner && _edGL && webgl !== null) {
        _kmMap = null;
        _drawEditorMapGL(ctx, logic, webgl, width, height, _dragHide);
      } else if (inDesigner && EDITOR_MAP_FROZEN) {
        _drawEditorMapLayer(ctx, logic, width, height, dt, _dragHide);
      } else {
        _drawWallsRocks2D(ctx, logic, width, height,
          inDesigner ? logic.mapDesignerZoom : logic.zoom,
          inDesigner ? logic.mapDesignerCamX : logic.cameraX,
          inDesigner ? logic.mapDesignerCamY : logic.cameraY,
          _dragHide, PUMPKIN_FULL_PX);
      }
    }

    if (logic.isMapDesignerActive && !logic.state.isTestMode) {
      if (logic.mapEditor.cacheState !== null && logic.mapEditor.cacheState !== logic.mapState) {
        const _mw = (logic.mouseX - width / 2) / logic.mapDesignerZoom + logic.mapDesignerCamX;
        const _mh2 = (logic.mouseY - height / 2) / logic.mapDesignerZoom + logic.mapDesignerCamY;
        refreshMapEditorVisuals(logic, _mw, _mh2);
      }
      const _meZoom = logic.mapDesignerZoom;
      setMapEditorOverlayGpu(_edGL && webgl !== null);
      drawMapEditorOverlay(ctx, logic, _isDarkMode, _meZoom,
        Math.max(MIN_STROKE_SCREEN_PX / _meZoom, FIXED_STROKE_WIDTH));
      if (_edGL && webgl !== null) { _drawEditorMapMarksGL(ctx, logic, webgl, width, height); _drawEditorLabelsGL(ctx, logic, webgl, width, height, dt); }
    }

    _wallIgnoreCount = 0;
    if (logic.state.isTestMode) {
        if (logic.state.ignoresWalls && !logic.tankDying && !(SPAWN_FADE_IN && logic.state.tankSpawning) && !PHOTO_MODE
            && !logic.state.ghostMode) {
            _wallIgnoreIsPlayer[_wallIgnoreCount] = 1;
            _wallIgnoreEnemyRef[_wallIgnoreCount] = null;
            _wallIgnoreCount++;
        }
        const _wiEnemies = logic.state.enemyTanks;
        for (let _wi = 0; _wi < _wiEnemies.length && (SMALL_FIX.G659 !== 0 || _wallIgnoreCount < _MAX_WALL_IGNORE_ENTITIES); _wi++) {
            const _we = _wiEnemies[_wi];
            if (!_we.active || !_we.ignoresWalls || _we.isDying || (SPAWN_FADE_IN && _we.isSpawning)) continue;
            if (!isInViewport(_we.position.x, _we.position.y, _tankCullR(_we), viewportBounds)) continue;
            if (SMALL_FIX.G659 !== 0) _wallIgnoreRoom();
            _wallIgnoreIsPlayer[_wallIgnoreCount] = 0;
            _wallIgnoreEnemyRef[_wallIgnoreCount] = _we;
            _wallIgnoreCount++;
        }
    }

    if (_wallIgnoreBulletLen > 0 || _wallIgnoreCount > 0) {
        if (_wallIgnoreBulletLen > 0) {
            if (useWebGL && webgl) {
                webgl.beginFrame();
                _renderBulletBatch(ctx, logic, webgl, true,
                    _wallIgnoreBulletIdx, _wallIgnoreBulletLen, _bulletsArr,
                    viewportBounds, bulletStrokeWidth, width, height, _camOffX, _camOffY);
                const _hasWIBullets = webgl.hasGeomContent() || webgl.hasContent();
                webgl.flushGeom();
                webgl.flush();
                if (_hasWIBullets) {
                    ctx.save();
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    _compositeMiniFlush(ctx, webgl);
                    ctx.restore();
                    _restoreCameraTransform(ctx, logic, width, height);
                }
            } else {
                _renderBulletBatch(ctx, logic, webgl, false,
                    _wallIgnoreBulletIdx, _wallIgnoreBulletLen, _bulletsArr,
                    viewportBounds, bulletStrokeWidth, width, height, _camOffX, _camOffY);
            }
        }

        for (let _wi = 0; _wi < _wallIgnoreCount; _wi++) {
            if (_wallIgnoreIsPlayer[_wi]) fillPlayerRenderData(logic);
            else fillEnemyRenderData(_wallIgnoreEnemyRef[_wi]!, logic);
            if (_rd.alpha >= 0.999) drawTankWithScratch(ctx, 1, 1);
        }
    }

    if (_portalLabelText.length > 0 && !_photoHide) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = '#ffffff';
      for (let _li = 0; _li < _portalLabelText.length; _li++) {
        const _lInvZ = 1 / _portalLabelZoom[_li];
        ctx.globalAlpha = _portalLabelAlpha[_li];
        let _lY = _portalLabelY[_li];
        const _lSub = _portalLabelSub[_li];
        if (_lSub) {
          ctx.font = `bold ${22 * _lInvZ}px "Ubuntu", "Inter", sans-serif`;
          ctx.lineWidth = 4 * _lInvZ;
          ctx.strokeText(_lSub, _portalLabelX[_li], _lY);
          ctx.fillText(_lSub, _portalLabelX[_li], _lY);
          _lY -= 26 * _lInvZ;
        }
        ctx.font = `bold ${42 * _lInvZ}px "Ubuntu", "Inter", sans-serif`;
        ctx.lineWidth = 6 * _lInvZ;
        ctx.strokeText(_portalLabelText[_li], _portalLabelX[_li], _lY);
        ctx.fillText(_portalLabelText[_li], _portalLabelX[_li], _lY);
      }
      ctx.restore();
    }

    _fleeBarCount = 0;
    if (logic.state.showHPBars && logic.state.isTestMode && !_photoHide) {
        _barCamX = logic.cameraX;
        _barHalfView = tagHalfView(width, height, logic.zoom);
        if (logic.state.showHealthBar && logic.state.tankHpBarOpacity > 0.01 && !logic.tankDying && !PHOTO_MODE && !logic.controlling) {
            const entityRadius = playerRenderSizePx(logic) / 2;
            const visualRadius = playerBodyRadiusPx(logic);
            const maxHp = logic.state.tankHP * logic.getStatMultiplier('maxHealth');
            const pct = Math.max(0, logic.state.tankDisplayHealth / maxHp);
            const maxShield = logic.state.tankShieldCapacity * logic.getStatMultiplier('shieldCapacity');
            const shieldPct = maxShield > 0 ? Math.max(0, logic.state.tankDisplayShield / maxShield) : 0;
            const _pHpAlpha = logic.state.tankHpBarOpacity * tagBarAlphaAt(
                _barEdge(logic.tankPos.x, entityRadius),
                _playerShownAlpha(logic));
            drawHealthBar(ctx, logic.tankPos.x, logic.tankPos.y,
                entityRadius, visualRadius, pct, shieldPct,
                _pHpAlpha, maxShield > 0, logic.state.playerGrowthScale);
        }

        for (let i = 0; i < logic.floatingPolygons.length; i++) {
            const poly = logic.floatingPolygons[i];
            if (poly.hpBarOpacity > 0.01 && !poly.fadingOut && !poly.isIntangible) {
                const sz = poly.size * poly.growth;
                if (!isInViewport(poly.position.x, poly.position.y, sz, viewportBounds)) continue;

                let barAlpha = poly.hpBarOpacity;
                if (poly.baseOpacity < 1.0) {
                    const distFactor = logic.shadowShapeNearness(poly);
                    if (distFactor <= 0) continue;
                    barAlpha = Math.min(barAlpha, distFactor * SHADOW_HP_BAR_MAX_ALPHA);
                    if (barAlpha < 0.005) continue;
                }

                const entityRadius = sz / 2;
                const visualRadius = entityRadius * (poly.isPolyhedron ? polyhedronExtent(poly.polyhedronType) : getRealSizeFactor(poly.baseSides));
                const pct = Math.max(0, poly.displayHp / poly.maxHp);
                const shieldPct = poly.maxShield > 0 ? Math.max(0, poly.displayShield / poly.maxShield) : 0;
                drawHealthBar(ctx, poly.position.x, poly.position.y,
                    entityRadius, visualRadius, pct, shieldPct,
                    barAlpha * tagBarAlphaAt(_barEdge(poly.position.x, entityRadius), 1), poly.maxShield > 0);
            }
        }

        for (let _ei = 0; _ei < logic.state.enemyTanks.length; _ei++) {
            const enemy = logic.state.enemyTanks[_ei];
            if (!enemy.active || enemy.isDying) continue;
            if (!(hudHpBarAlpha(drawnOpacity(enemy, _carryNow(enemy, logic))) > 0)) continue;
            {
                let _hbR = enemy.size * 0.5;
                for (let _hbl = 0; _hbl < enemy.bodyLayers.length; _hbl++) { const _r = enemy.size * 0.5 * enemy.bodyLayers[_hbl].sizeRatio; if (_r > _hbR) _hbR = _r; }
                if (!isInViewport(enemy.position.x, enemy.position.y, _hbR * 2 + 40 * (enemy.growthScale || 1), viewportBounds)) continue;
            }
            if (enemy.hpBarOpacity > 0.01) {
                drawEnemyHPBar(ctx, logic, enemy);
            }
        }
    }

    if (logic.state.isTestMode && (logic.state.showPlayerNames || logic.state.showPlayerScores
          || (SMALL_FIX.CC013 !== 0 && SMALL_FIX.R665 !== 0 && logic.state.debugMode && logic.state.debugShowAllNames === true))
        && webgl !== null && useWebGL && !_photoHide) {
        if (nameTagsDraw(webgl, logic, width, height, viewportBounds, _isDarkMode, tankDeathFadeMs(), dt * 1000)) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            _compositeMiniFlush(ctx, webgl);
            ctx.restore();
            _restoreCameraTransform(ctx, logic, width, height);
        }
        nameTagsDone(webgl, _camOffX, _camOffY, logic.zoom, width, height);
    }

    if (logic.state.isTestMode && webgl !== null && useWebGL && !_photoHide && chatWanted(logic)) {
        if (chatDraw(webgl, logic, width, height, viewportBounds, _isDarkMode, getEffectiveDPR(), tankDeathFadeMs(), playerRenderSizePx(logic))) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            _compositeMiniFlush(ctx, webgl);
            ctx.restore();
            _restoreCameraTransform(ctx, logic, width, height);
        }
        chatDone(webgl, _camOffX, _camOffY, logic.zoom, width, height);
    }

    if (SMALL_FIX.G723 !== 0 && logic.matchSerial !== _fogMatch) { _fogMatch = logic.matchSerial; _fog.reset(); }
    if (logic.state.isTestMode && (logic.dark.live || _fog.any) && !(logic.state.debugMode && logic.state.dbgDarkNoFog) && !logic.dkPlayerSeesAll) {
        const _fhw = (width / 2) / logic.zoom, _fhh = (height / 2) / logic.zoom;
        _fog.update(logic.dark, logic.fogLight(), logic.darkLos, logic.cameraX - _fhw, logic.cameraY - _fhh, logic.cameraX + _fhw, logic.cameraY + _fhh,
            dt > 0 && dt < 0.25 ? dt : 1 / 60, logic.gameNow() / 1000, logic.fogWalls());
        const _fn = _fog.n, _fo = _fog.out;
        if (_fn > 0) {
            const _fgl = webgl !== null && useWebGL ? webgl : null;
            if (_fgl !== null) _fgl.beginFrame();
            const _fShader = _fgl !== null && _fgl.drawFog(_fo, _fn);
            if (_fgl !== null && (_fShader || _fgl.ensureFogBatch())) {
                if (!_fShader) {
                    for (let _fi = 0; _fi < _fn; _fi++) {
                        const o = _fi * FOG_STRIDE, sh = _fo[o + 4], sf = _fo[o + 5];
                        _fgl.pushGeomInstance(FOG_BATCH, _fo[o], _fo[o + 1], 0, _fo[o + 2], _fo[o + 2], sh, sh, sh, 0, 0.9, 1.0, _fo[o + 3] * (1 - sf + sf * sf / 3));
                    }
                    _fgl.setSampleAlphaToCoverage(false);
                    _fgl.setDepthMask(false);
                    _fgl.flushGeom();
                    _fgl.setDepthMask(true);
                    _fgl.setSampleAlphaToCoverage(true);
                }
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                _compositeWorld(ctx, _fgl);
                ctx.restore();
                _restoreCameraTransform(ctx, logic, width, height);
            } else {
                for (let _fi = 0; _fi < _fn; _fi++) {
                    const o = _fi * FOG_STRIDE, sf = _fo[o + 5];
                    ctx.globalAlpha = _fo[o + 3] * (1 - sf + sf * sf / 3);
                    ctx.fillStyle = _fogShade(_fo[o + 4]);
                    ctx.beginPath();
                    ctx.arc(_fo[o], _fo[o + 1], _fo[o + 2], 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
            }
        }
    }

    if (logic.state.isTestMode && logic.state.debugMode && !_photoHide) {
        _dbgVecGeom = -1;
        _dbgOverlayPath = '';
        _dbgOverlayQuads = 0;
        if (logic.state.debugShowAILogic) {
            const _ovlVecT0 = performance.now();

        _dbgVecGeom = -2;
        if (webgl !== null && useWebGL && webgl.ensureDebugOverlayBatches()) {
            webgl.beginFrame();
            _emitAIVectorGeom(webgl, logic, viewportBounds);
            if (logic.state.dbgAiLight && logic.dark.live) _emitDarkLights(webgl, logic, viewportBounds);
            _dbgVecGeom = webgl.getGeomInstanceCount(DBG_LINE_BATCH)
                        + webgl.getGeomInstanceCount(DBG_DISC_BATCH)
                        + webgl.getGeomInstanceCount(DBG_CAP_BATCH);
            webgl.setSampleAlphaToCoverage(false);
            webgl.setDepthMask(false);
            webgl.flushGeom();
            webgl.setDepthMask(true);
            webgl.setSampleAlphaToCoverage(true);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            _compositeWorld(ctx, webgl);
            ctx.restore();
            _restoreCameraTransform(ctx, logic, width, height);
        }

        const _aiZoom = logic.zoom;
        _AI_DASH_FOLLOW[0] = 8 / _aiZoom; _AI_DASH_FOLLOW[1] = 4 / _aiZoom;

        for (let _ei = 0; _ei < logic.state.enemyTanks.length; _ei++) {
            const enemy = logic.state.enemyTanks[_ei];
            if (!enemy.active || enemy.isDying || enemy.isSpawning) continue;

            if (!isInViewport(enemy.position.x, enemy.position.y, enemy.size * 2, viewportBounds)) continue;

            if (!enemy.isSentryEnemy) {
            {
                const _ndB = enemy.navDbgBranch ?? 0;
                const _ndOn = logic.state.dbgAiNavDebug;
                const _ndRouteOn = _ndOn && enemy.aiState === 'following'
                    && (_ndB > 0 || (enemy.navDbgPathLen ?? 0) > 0);
                const _ndGuAt = enemy.navDbgGiveUpAt ?? 0;
                const _ndGiveUpOn = _ndOn && _ndGuAt > 0 && logic.gameNow() - _ndGuAt < 3000;
                if (!_ndRouteOn && !_ndGiveUpOn) continue;

                ctx.save();
                if (_ndRouteOn) {
                    const _ndInv = 1 / logic.zoom;
                    const _ndLen = enemy.navDbgPathLen ?? 0;
                    if (_ndLen > 0 && enemy.navDbgPath) {
                        ctx.strokeStyle = 'rgba(66, 165, 245, 0.6)';
                        ctx.lineWidth = 3 * _ndInv;
                        ctx.setLineDash(_AI_DASH_FOLLOW);
                        ctx.beginPath();
                        ctx.moveTo(enemy.position.x, enemy.position.y);
                        for (let _ndI = 0; _ndI < _ndLen; _ndI++) {
                            ctx.lineTo(enemy.navDbgPath[_ndI * 2], enemy.navDbgPath[_ndI * 2 + 1]);
                        }
                        ctx.stroke();
                        ctx.setLineDash(_AI_DASH_NONE);
                        const _ndEx = enemy.navDbgPath[(_ndLen - 1) * 2];
                        const _ndEy = enemy.navDbgPath[(_ndLen - 1) * 2 + 1];
                        if (enemy.navDbgPathStalled) {
                            ctx.strokeStyle = 'rgba(255, 23, 68, 0.95)';
                            ctx.lineWidth = 4 * _ndInv;
                            const _ndR = 12 * _ndInv;
                            ctx.beginPath();
                            ctx.moveTo(_ndEx - _ndR, _ndEy - _ndR); ctx.lineTo(_ndEx + _ndR, _ndEy + _ndR);
                            ctx.moveTo(_ndEx - _ndR, _ndEy + _ndR); ctx.lineTo(_ndEx + _ndR, _ndEy - _ndR);
                            ctx.stroke();
                        } else {
                            ctx.fillStyle = 'rgba(0, 230, 118, 0.9)';
                            ctx.beginPath();
                            ctx.arc(_ndEx, _ndEy, 6 * _ndInv, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                    const _ndD0 = enemy.navDbgD0 ?? -1;
                    if (enemy.aiState === 'following' && (_ndD0 < 0 || _ndD0 >= 65535)) {
                        ctx.fillStyle = 'rgba(255, 23, 68, 0.95)';
                        ctx.beginPath();
                        ctx.arc(enemy.position.x, enemy.position.y - enemy.size / 2 - 14 * _ndInv, 7 * _ndInv, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    const _ndSk = enemy.navDbgSteerKind ?? 0;
                    if (_ndSk > 0) {
                        const _ndSc = _ndSk === 1 ? 'rgba(255,255,255,0.9)'
                            : _ndSk === 3 ? 'rgba(255,238,88,0.9)' : 'rgba(0,229,255,0.9)';
                        ctx.strokeStyle = _ndSc;
                        ctx.lineWidth = 2 * _ndInv;
                        ctx.beginPath();
                        ctx.moveTo(enemy.position.x, enemy.position.y);
                        ctx.lineTo(enemy.navDbgSteerX ?? 0, enemy.navDbgSteerY ?? 0);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.arc(enemy.navDbgSteerX ?? 0, enemy.navDbgSteerY ?? 0, 7 * _ndInv, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    const _ndRing = _ndB === 1 ? '#ffffff' : _ndB === 2 ? '#00e676'
                        : _ndB === 3 ? '#ff00ff' : _ndB === 4 ? '#ffee58'
                        : _ndB === 5 ? '#00e5ff' : _ndB === 6 ? '#42a5f5'
                        : _ndB === 7 ? '#9ccc65' : _ndB === 8 ? '#bdbdbd'
                        : _ndB === 10 ? '#f48fb1'
                        : _ndB === 11 ? '#ce93d8' : _ndB === 12 ? '#ff1744'
                        : _ndB === 13 ? '#7c4dff' : '';
                    if (_ndRing !== '') {
                        ctx.strokeStyle = _ndRing;
                        ctx.globalAlpha = enemy.navDbgCoast ? 0.35 : 0.9;
                        ctx.lineWidth = 3.5 * _ndInv;
                        ctx.beginPath();
                        ctx.arc(enemy.position.x, enemy.position.y, enemy.size / 2 + 14 * _ndInv, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.globalAlpha = 1;
                    }
                    ctx.font = _ndFont(Math.max(11, 12 * _ndInv));
                    ctx.textAlign = 'center';
                    ctx.fillStyle = _ndB === 3 ? (SMALL_FIX.R667 !== 0 ? dbgInk(DBG_INK.NAV_B3, _isDarkMode) : '#ff00ff') : '#e0e0e0';
                    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                    ctx.lineWidth = 3 * _ndInv;
                    const _ndVeto = enemy.navDbgVetoShown ?? 0;
                    const _ndTxt = `B${_ndB} d${_ndD0 >= 65535 ? 'X' : _ndD0} f${enemy.navDbgFailsShown ?? 0}${_ndVeto > 0 ? ` v${_ndVeto}` : ''}`;
                    const _ndTy = enemy.position.y + enemy.size / 2 + 24 * _ndInv;
                    ctx.strokeText(_ndTxt, enemy.position.x, _ndTy);
                    ctx.fillText(_ndTxt, enemy.position.x, _ndTy);
                    ctx.textAlign = 'left';
                }
                if (_ndGiveUpOn) {
                    const _ndInv2 = 1 / logic.zoom;
                    ctx.font = _ndFont(Math.max(11, 12 * _ndInv2));
                    ctx.textAlign = 'center';
                    ctx.fillStyle = SMALL_FIX.R667 !== 0
                        ? dbgInk((enemy.navDbgGiveUpKind ?? 0) === 1 ? DBG_INK.GIVE_UP_ROUTE : DBG_INK.GIVE_UP_OTHER, _isDarkMode)
                        : (enemy.navDbgGiveUpKind ?? 0) === 1 ? '#ff1744' : '#ff9800';
                    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                    ctx.lineWidth = 3 * _ndInv2;
                    const _ndGuKind = enemy.navDbgGiveUpKind ?? 0;
                    const _ndGuTxt = _ndGuKind === 1 ? 'GAVE UP: NO ROUTE'
                        : _ndGuKind === 3 ? 'GAVE UP: TOO FAR' : 'GAVE UP: STARVED';
                    const _ndGuY = enemy.position.y + enemy.size / 2 + 42 * _ndInv2;
                    ctx.strokeText(_ndGuTxt, enemy.position.x, _ndGuY);
                    ctx.fillText(_ndGuTxt, enemy.position.x, _ndGuY);
                    ctx.textAlign = 'left';
                }
                ctx.restore();
            }
            }
        }
            _ovlVecAcc += performance.now() - _ovlVecT0;
        }
        const _ovlT0 = performance.now();
        _drawWorldDebugLabels(ctx, logic, webgl, useWebGL, width, height, viewportBounds);
        _ovlLabAcc += performance.now() - _ovlT0;
        _ovlSamples++;
        if (_ovlSamples >= 30) {
            _ovlLabelMs = _ovlLabAcc / _ovlSamples;
            _ovlVectorMs = _ovlVecAcc / _ovlSamples;
            _ovlLabAcc = 0; _ovlVecAcc = 0; _ovlSamples = 0;
        }
    }

    } finally {
        ctx.restore();
    }

    drawMapEditorHint(ctx, logic, width, _isDarkMode);

    if (logic.isMapDesignerActive && !logic.state.isTestMode) {
        const _me = logic.mapEditor;
        const _want = _me.dragActive || _me.zoneDragActive ? 'var(--cur-grabbing)'
            : _me.tool === 'select' ? (_me.hasHover ? 'var(--cur-grab)' : 'var(--cur-default)')
            : _me.tool === 'none' ? (_me.hasHover ? 'var(--cur-pointer)' : 'var(--cur-default)')
            : 'var(--cur-crosshair)';
        if (ctx.canvas.style.cursor !== _want) ctx.canvas.style.cursor = _want;
    } else if (ctx.canvas.style.cursor !== '') {
        ctx.canvas.style.cursor = '';
    }

    if (logic.state.isTestMode) {
        const _sb = logic.shrinkBox();
        if (_sb !== null) {
            const z = logic.zoom, cx = logic.cameraX, cy = logic.cameraY;
            const x0 = width / 2 + (-_sb.hx - cx) * z, x1 = width / 2 + (_sb.hx - cx) * z;
            const y0 = height / 2 + (-_sb.hy - cy) * z, y1 = height / 2 + (_sb.hy - cy) * z;
            ctx.save();
            ctx.fillStyle = _isDarkMode ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.28)';
            if (y0 > 0) ctx.fillRect(0, 0, width, Math.min(height, y0));
            if (y1 < height) ctx.fillRect(0, Math.max(0, y1), width, height - Math.max(0, y1));
            const ya = Math.max(0, y0), yb = Math.min(height, y1);
            if (yb > ya) { if (x0 > 0) ctx.fillRect(0, ya, Math.min(width, x0), yb - ya); if (x1 < width) ctx.fillRect(Math.max(0, x1), ya, width - Math.max(0, x1), yb - ya); }
            ctx.restore();
        }
    }

    if (logic.state.isTestMode && !logic.state.paused && !_photoHide) {
        drawMinimap(ctx, width, height, logic);
    }
    {
        const _tc = logic.tripCurtain();
        _tripDarkNow = _tc;
        if (_tc > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, _tc); ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, width, height); ctx.restore(); }
    }

    if (logic.state.isTestMode && !logic.state.paused) {
        const instantFps = 1 / dt;
        _smoothFps = _smoothFps === 0 ? instantFps : _smoothFps * 0.98 + instantFps * 0.02;
        _fpsDisplayCounter++;
        if (_fpsDisplayCounter >= 30) {
            _fpsDisplayCounter = 0;
            _displayedFps = Math.round(_smoothFps);
        }
    }

    if (logic.state.debugMode && logic.state.showSpawnStats && logic.state.isTestMode && !logic.state.paused) {
        const now = performance.now();
        if (now - _lastSpawnStatsUpdateTime > _SPAWN_STATS_UPDATE_INTERVAL) {
          _lastSpawnStatsUpdateTime = now;
          const ss = logic._spawnStats;
          const elapsed = Math.max(1, (logic.gameNow() - ss.sessionStartTime) / 60000);
          const rate = Math.round(ss.totalSpawned / elapsed);
          _spawnStatsText1 = `Shiny:${ss.byRarity.shiny} Leg:${ss.byRarity.legendary} Shd:${ss.byRarity.shadow} Rbw:${ss.byRarity.rainbow} Trn:${ss.byRarity.trans}`;
          _spawnStatsText2 = `Egg:${ss.byBaseShape.egg} Tri:${ss.byBaseShape.triangle} Sq:${ss.byBaseShape.square} Pent:${ss.byBaseShape.pentagon} Hex:${ss.byBaseShape.hexagon} Gem:${ss.byBaseShape.gem} Jwl:${ss.byBaseShape.jewel}`;
          _spawnStatsText3 = `Beta:${ss.byScaleVariant.beta} Alpha:${ss.byScaleVariant.alpha} Poly:${ss.totalPolyhedraSpawned} Laby:${(ss.byLabyLevel[1] ?? 0) + (ss.byLabyLevel[2] ?? 0) + (ss.byLabyLevel[3] ?? 0) + (ss.byLabyLevel[4] ?? 0) + (ss.byLabyLevel[5] ?? 0)} | ${rate}/min Total:${ss.totalSpawned}`;
        }
    }

    if (logic.state.isTestMode && !logic.state.paused && _mmLastW > 0 && !_photoHide && !(SMALL_FIX.G699 !== 0 && _tripDarkNow >= 1)) {
        _drawAboveMinimapHUD(ctx, logic, dt * 1000);
    }
    if (logic.state.isTestMode && !_photoHide && mobileActive() && logic.state.playerDead !== true) {
        const _live = !logic.state.playerDead && !logic.tankDying && logic.spectatedTank() === null;
        const _cw = ctx.canvas.width, _ch = ctx.canvas.height, _z = logic.zoom;
        drawTouchControls(ctx, _touch, _cw, _ch, isGameDark(),
            _live ? _cw / 2 + (logic.tankPos.x - logic.cameraX) * _z : NaN,
            _live ? _ch / 2 + (logic.tankPos.y - logic.cameraY) * _z : NaN,
            _live ? playerBodyRadiusPx(logic) * _z : 0);
    }

}

let _tripDarkNow = 0;
function _drawAboveMinimapHUD(ctx: CanvasRenderingContext2D, logic: GameLogic, dtMs: number): void {
    _updateHudFontCache(logic.dpr, logic.hudScale || 1);
    const rightEdge = _mmLastX + _mmLastW;
    const debugMode = logic.state.debugMode;
    const showSpawn = debugMode && logic.state.showSpawnStats && _spawnStatsText1 !== '';
    const rarityMult = logic.maxRarityTestMultiplier();
    const showRarity = logic.state.dbgHudRarity && rarityMult > 1;

    _hudN = 0;
    _hudCurKey = '';
    const _baseMode = _getGameModeName(logic.state.gameModeConfig);
    if (_displayedFps !== _hudBaseFps || _baseMode !== _hudBaseMode) {
        _hudBaseFps = _displayedFps;
        _hudBaseMode = _baseMode;
        _hudBaseLine = `${_displayedFps} FPS / ${_baseMode}`;
    }
    _hudPush(_hudBaseLine, '');
    if (logic.mevHudLine !== '') _hudPush(logic.mevHudLine, '');
    if (logic.mevSkipHint !== '') _hudPush(logic.mevSkipHint, '');
    {
      const _hudVm = logic.mevOfHud();
      if (_hudVm !== null) for (let _k = 0, _n = _hudVm.hudTimerCount(); _k < _n; _k++) { const _l = _hudVm.hudTimerLine(_k); if (_l !== '') _hudPush(_l, ''); }
    }

    if (debugMode) {
        const st = logic.state;
        if (_hudSec('dbgHudEntities', st.dbgHudEntities)) {
          _hudPush(`Food: ${logic.floatingPolygons.length} / Proj: ${logic.bullets.length}`, '');
          if (logic.areaBounds.length > 0) {
            const numAreas = logic.areaBounds.length;
            while (_debugAreaFoodCounts.length < numAreas) _debugAreaFoodCounts.push(0);
            for (let i = 0; i < numAreas; i++) _debugAreaFoodCounts[i] = 0;
            for (let i = 0; i < logic.floatingPolygons.length; i++) {
              const ai = logic.floatingPolygons[i].areaIdx;
              if (ai >= 0 && ai < numAreas) _debugAreaFoodCounts[ai]++;
            }
            const areas = st.multiAreaConfig.areas;
            for (let i = 0; i < numAreas && i < areas.length; i++) {
              _hudPush(`${areas[i].name}: ${_debugAreaFoodCounts[i]}`, '');
            }
          }
        }

        if (_hudSec('dbgHudJitter', st.dbgHudJitter)) _hudPush(`Jitter: ${_lastJitter.toFixed(1)}ms`, '');

        if (_hudSec('dbgHudPerf', st.dbgHudPerf)) {
          _hudPush(`AI: ${logic.perfAiMs.toFixed(1)}ms / Col: ${logic.perfCollisionMs.toFixed(1)}ms / Bul: ${logic.perfBulletsMs.toFixed(1)}ms`, '');
        }

        if (_hudSec('dbgHudMemory', st.dbgHudMemory) && (performance as any).memory) {
          _hudPush(`Heap: ${((performance as any).memory.usedJSHeapSize / (1024 * 1024)).toFixed(0)}MB / Maps: ${logic.perfMapSizes}`, '');
        }

        if (_hudSec('dbgHudWaves', st.dbgHudWaves)) {
          const _mevMon = logic.mevMonitor();
          if (_mevMon !== null) for (const _p of _mevMon.monitorPlans()) _hudPush(`Wave ${_p.wave} of ${_p.name}: ${_p.phase}${_p.paused ? ', paused' : ''}, ${_p.holders} hold it, ${_p.toBorn} to come`, '');
        }
        if (_hudSec('dbgHudDrawOps', st.dbgHudDrawOps)) {
          const _turretAvg = st.turrets ? st.turrets.length : 2;
          _diagDrawOps = _diagLodFull * (3 + _turretAvg * 3) + _diagLodSimple * 5 + _diagLodMinimal * 3;
          _hudPush(`~Draw: ${_diagDrawOps} / LOD: ${_diagLodFull}F ${_diagLodSimple}S ${_diagLodMinimal}M`, '');
        }

        if (_hudSec('dbgHudNaN', st.dbgHudNaN) && logic.nanRepairCount > 0) {
          _hudPush(`NaN fixes: ${logic.nanRepairCount}`, '');
          if (logic.nanLastSource) _hudPush(`Last: ${logic.nanLastSource}`, '');
        }

        if (_hudSec('dbgHudOverlayCost', st.dbgHudOverlayCost)) {
          _hudPush(`Ovl vec ${_ovlVectorMs.toFixed(2)}ms lbl ${_ovlLabelMs.toFixed(2)}ms`
            + ` (${_dbgOverlayPath === '' ? 'labels off' : _dbgOverlayPath}, ${_dbgOverlayQuads} rows`
            + (_dbgVecGeom === -1 ? ')' : _dbgVecGeom < 0 ? ', geo OFF)' : `, geo ${_dbgVecGeom})`), '');
        }

        if (_hudSec('dbgHudAimError', st.dbgHudAimError) &&
            (logic.atkAimBots > 0.02 || logic.chaseAimBots > 0.02 || logic.chaseAimExclPct > 0.5)) {
          _hudPush(`Aim err atk ${logic.atkAimErrDeg.toFixed(0)} (${logic.atkAimBots.toFixed(0)})`
            + ` chase ${logic.chaseAimErrDeg.toFixed(0)} (${logic.chaseAimBots.toFixed(0)},`
            + ` ${logic.chaseAimExclPct.toFixed(0)}% excl) deg`, '');
        }

        if (_hudSec('dbgHudAimReact', st.dbgHudAimReact)) {
          _hudPush(AI_CONSTANTS.AIM_REACTION_MS > 0
            ? `Aim react ${AI_CONSTANTS.AIM_REACTION_MS}ms holds ${logic._aimReactHoldStarts}`
              + (AI_CONSTANTS.AIM_REACTION_SWITCH_HOLD === 0 ? ' (hold off)' : '')
            : 'Aim react OFF', '');
        }

        if (_hudSec('dbgHudStalkFlee', st.dbgHudStalkFlee)) {
          let _skAct = 0;
          const _skTanks = st.enemyTanks;
          for (let i = 0; i < _skTanks.length; i++) {
            const _skT = _skTanks[i];
            if (_skT.active && _skT.fear.isFleeing && _skT.fear.fearReason === 'hunted') _skAct++;
          }
          const _skOff = AI_CONSTANTS.STALK_REACT === 0 ? ' [OFF]' : '';
          _hudPush(`Hunted flee ${logic.stalkFleeCount} (act ${_skAct})${_skOff}`, '');
        }

        if (_hudSec('dbgHudWallShots', st.dbgHudWallShots)) {
          const _wsFlew = logic.botShotsWallDeadShort - logic.botShotsWallDeadAfterHit
                        - logic.botShotsWallDeadInMuzzle;
          const _wsPct = logic.botShotsFired > 0
            ? (_wsFlew * 100 / logic.botShotsFired).toFixed(1) : '0.0';
          _hudPush(`Wall shots ${logic.botShotsFired} fired / ${_wsFlew} into walls (${_wsPct}%) / ${logic.botShotsWallDeadInMuzzle} in barrel`, '');
        }

        if (_hudSec('dbgHudAttackAim', st.dbgHudAttackAim)) {
          const _aaOff = AI_CONSTANTS.ATTACK_AIM_THROUGH_COVER <= 0 ? ' [OFF]' : '';
          _hudPush(`Corner aim ${logic.attackCoverAimFrames} held / ${logic.attackAimFlips} crossings${_aaOff}`, '');
        }

        if (_hudSec('dbgHudAimTruth', st.dbgHudAimTruth)) {
          const _atD = AI_CONSTANTS.AIM_FLIGHT_DECEL === 0 ? ' [OFF]' : '';
          const _atG = AI_CONSTANTS.AIM_GUN_TRUTH === 0 ? ' [OFF]' : '';
          const _atPct = logic.aimDecelSolves > 0
            ? (logic.aimDecelGainSum / logic.aimDecelSolves * 100).toFixed(1) : '0.0';
          _hudPush(`Aim truth this test ${logic.aimDecelSolves} decel aims${_atD} (+${_atPct}% flight) / ${logic.aimGunSwaps} gun swaps${_atG}`, '');
        }

        if (_hudSec('dbgHudAimGodly', st.dbgHudAimGodly)) {
          const _agS = AI_CONSTANTS.AIM_SHARPEN === 0 ? '[OFF]' : '';
          const _agP = AI_CONSTANTS.AIM_PLAYER_VEL_TRUTH === 0 ? '[OFF]' : '';
          const _agN = logic.aimGodlySamples;
          const _agSm = _agN > 0 ? (logic.aimSharpenSum / _agN).toFixed(2) : '0.25';
          const _agRaw = logic.aimPlayerVelSamples > 0
            ? (logic.aimPlayerRawSum / logic.aimPlayerVelSamples * 100).toFixed(0) : '0';
          _hudPush(`Aim godly this test smooth ${_agSm}${_agS} / you raw ${_agRaw}%${_agP}`, '');
        }

        if (_hudSec('dbgHudStandoff', st.dbgHudStandoff)) {
          const _soR = AI_CONSTANTS.STANDOFF_REACH === 0 ? ' [OFF]' : '';
          const _soB = AI_CONSTANTS.STANDOFF_BAND_FIX === 0 ? ' [OFF]' : '';
          const _soMs = logic.standoffAtkMs;
          const _soOver = _soMs > 0 ? (logic.standoffOverMs / _soMs * 100).toFixed(1) : '0.0';
          const _soPull = _soMs > 0 ? (logic.standoffPullMs / _soMs * 100).toFixed(0) : '0';
          const _soPush = _soMs > 0 ? (logic.standoffPushMs / _soMs * 100).toFixed(0) : '0';
          const _soBand = _soMs > 0 ? (logic.standoffBandMs / _soMs * 100).toFixed(0) : '0';
          const _soEye = _soMs > 0 ? (logic.standoffEyeMs / _soMs * 100).toFixed(0) : '0';
          _hudPush(`Standoff this test ${_soOver}% out of range / pull ${_soPull}% push ${_soPush}% eye ${_soEye}%${_soR} / band ${_soBand}%${_soB}`, '');
        }

        if (_hudSec('dbgHudPeekFreeze', st.dbgHudPeekFreeze)) {
          const _pfOff = AI_CONSTANTS.PEEK_RELEASE === 0 ? ' [OFF]' : '';
          const _pfHeld = logic.peekStandHeldMs;
          const _pfNowhere = _pfHeld > 0
            ? (logic.peekStandNowhereMs / _pfHeld * 100).toFixed(0) : '0';
          _hudPush(`Corner stand this test ${logic.peekStandEpisodes} holds (${(_pfHeld / 1000).toFixed(1)}s held, longest ${logic.peekStandMaxMs.toFixed(0)}ms) / went nowhere ${_pfNowhere}% / released ${logic.peekReleases} (${(logic.peekReleaseHeldMs / 1000).toFixed(1)}s)${_pfOff}`, '');
        }

        if (_hudSec('dbgHudCornerSidestep', st.dbgHudCornerSidestep)) {
          const _ssOff = AI_CONSTANTS.PEEK_SIDESTEP === 0 ? ' [OFF]' : '';
          const _ssBlocked = logic.peekFloorRefusedMs;
          const _ssShare = _ssBlocked > 0
            ? (logic.peekSidestepMs / _ssBlocked * 100).toFixed(0) : '0';
          _hudPush(`Corner sidestep this test ${(_ssBlocked / 1000).toFixed(1)}s blocked from peeking / ${(logic.peekSidestepMs / 1000).toFixed(1)}s stepped aside (${_ssShare}%)${_ssOff}`, '');
        }

        if (_hudSec('dbgHudGhost', st.dbgHudGhost)) {
          let _ghOff = '';
          if (AI_CONSTANTS.GHOST_PERCEPTION === 0) _ghOff += ' [PERC OFF]';
          if (AI_CONSTANTS.GHOST_BOT === 0) _ghOff += ' [BOT OFF]';
          _hudPush(`Ghost this test ${logic.ghostReactsBlocked} rounds hidden / you ${(logic.ghostPlayerMs / 1000).toFixed(1)}s / bots ${(logic.ghostBotMs / 1000).toFixed(1)}s${_ghOff}`, '');
        }

        if (_hudSec('dbgHudPathBlock', st.dbgHudPathBlock)) {
          const _pbOff = AI_CONSTANTS.PATHBLOCK_SENSE === 0 ? ' [OFF]' : '';
          const _pbHeld = logic.pathBlockMs;
          const _pbSealed = _pbHeld > 0 ? (logic.pathBlockSealedMs / _pbHeld * 100).toFixed(0) : '0';
          _hudPush(`Path blocked this test ${logic.pathBlockEpisodes} times (${(_pbHeld / 1000).toFixed(1)}s, no way past ${_pbSealed}%) / replanned ${logic.pathBlockRoutePlans} / wide ${(logic.pathBlockBerthMs / 1000).toFixed(1)}s / watched ${(logic.pathBlockAimMs / 1000).toFixed(1)}s${_pbOff}`, '');
        }

        if (_hudSec('dbgHudChaseFutile', st.dbgHudChaseFutile)) {
          const _cfOff = AI_CONSTANTS.CHASE_SPEED_FUTILE === 0 ? ' [OFF]' : '';
          _hudPush(`Chase given up this test ${logic.chaseFutileGaveUp} / refused ${logic.chaseFutileRefused} / not gaining ${(logic.chaseFutileStallMs / 1000).toFixed(1)}s${_cfOff}`, '');
        }

        if (_hudSec('dbgHudAimSelf', st.dbgHudAimSelf)) {
          const _asOff = AI_CONSTANTS.AIM_SELF_MOTION === 0 ? ' [OFF]' : '';
          const _asDeg = logic.aimSelfSolves > 0
            ? (logic.aimSelfDegSum / logic.aimSelfSolves).toFixed(1) : '0.0';
          _hudPush(`Aim self motion ${logic.aimSelfSolves} aims (${_asDeg} deg)${_asOff}`, '');
        }

        if (_hudSec('dbgHudPlayerHunt', st.dbgHudPlayerHunt)) {
          const _phOff = AI_CONSTANTS.ROLE_PLAYER_HUNT === 0 ? ' [OFF]' : '';
          _hudPush(`Player hunt ${logic.rolePlayerSeenBots} seen / ${logic.rolePlayerNamedBots} named / ${logic.rolePlayerWithdrawFrames} withdrew${_phOff}`, '');
        }

        if (_hudSec('dbgHudDroneCloud', st.dbgHudDroneCloud)) {
          const _dcOff = AI_CONSTANTS.THREAT_DRONE_OBSTACLE !== 1 ? ' [OFF]'
            : AI_CONSTANTS.THREAT_DRONE_GROUP !== 1 ? ' [single only]' : '';
          _hudPush(`Drone cloud ${logic.droneCloudSteers} steered (${logic.droneCloudWalls} as a wall)${_dcOff}`, '');
        }

        if (_hudSec('dbgHudChaseFlap', st.dbgHudChaseFlap)) {
          const _cfOff = AI_CONSTANTS.CHASE_HANDBACK_RANGE === 0 ? ' [OFF]' : '';
          _hudPush(`Chase range ${logic.chaseHandbackRefused} refused / ${logic.chaseHandbackAllowed} ok${_cfOff}`, '');
        }

        if (_hudSec('dbgHudFarmAim', st.dbgHudFarmAim)) {
          const _faDeg = logic.farmAimErrN > 0
            ? (logic.farmAimErrSum / logic.farmAimErrN) * 180 / Math.PI : 0;
          const _faOff = AI_CONSTANTS.FARM_AIM_THROUGH_COVER <= 0 ? ' [OFF]' : '';
          _hudPush(`Farm aim ${logic.farmCoverAimFrames} (${_faDeg.toFixed(1)} deg)${_faOff}`, '');
        }

        if (_hudSec('dbgHudCornerFire', st.dbgHudCornerFire)) {
          const _cfOff = AI_CONSTANTS.CORNERFIRE_MOVE === 0 ? ' [OFF]' : '';
          _hudPush(`Corner fire this test ${logic.cornerFireEpisodes} stands (${(logic.cornerFireMs / 1000).toFixed(1)}s, longest ${(logic.cornerFireMaxMs / 1000).toFixed(1)}s) / moved ${(logic.cornerFireMoverMs / 1000).toFixed(1)}s${_cfOff}`, '');
        }

        if (_hudSec('dbgHudAimMount', st.dbgHudAimMount)) {
          const _amOff = AI_CONSTANTS.AIM_MOUNT_EXACT === 0 ? ' [OFF]' : '';
          _hudPush(`Gun mount aim ${(logic.aimMountSingularMs / 1000).toFixed(1)}s (max ${logic.aimMountCorrDegMax.toFixed(1)} deg)${_amOff}`, '');
        }

        if (_hudSec('dbgHudYield', st.dbgHudYield)) {
          let _yAct = 0;
          const _yTanks = st.enemyTanks;
          for (let i = 0; i < _yTanks.length; i++) {
            const _yT = _yTanks[i];
            if (_yT.active && !_yT.isDying && _yT.pursuitYieldActive &&
                _yT.aiState === 'following') _yAct++;
          }
          const _yOff = AI_CONSTANTS.PURSUIT_YIELD <= 0 ? ' [OFF]'
            : (AI_CONSTANTS.PURSUIT_YIELD_RELEASE_RETRY_MS <= 0 ? ' [lock OFF]' : '');
          _hudPush(
            `Stand aside ${logic.yieldEpisodeCount} (${(logic.yieldHoldMs / 1000).toFixed(1)}s` +
            `, ${logic.yieldRefuseCount} blocked, act ${_yAct})${_yOff}`, '');
        }

        if (_hudSec('dbgHudFleeReroute', st.dbgHudFleeReroute)) {
          const _frOff = AI_CONSTANTS.FLEE_REROUTE === 0 ? ' [OFF]' : '';
          const _frH = AI_CONSTANTS.FLEE_REROUTE === 0 ? ''
            : AI_CONSTANTS.FLEE_REROUTE_HUNTED === 0 ? ' [hunted OFF]'
            : AI_CONSTANTS.FLEE_REROUTE_HUNTED === 2 ? ' [hunted DIAG]' : '';
          _hudPush(`Flee reroute ${logic.fleeRerouteCount} (hunted ${logic.fleeRerouteHuntedCount})${_frOff}${_frH}`, '');
        }

        if (_hudSec('dbgHudFleeDeadEnd', st.dbgHudFleeDeadEnd)) {
          const _deAvOff = AI_CONSTANTS.FLEE_DEADEND_AVOID === 0 ? ' [avoid OFF]' : '';
          const _deOutOff = AI_CONSTANTS.FLEE_DEADEND_COMMIT_MS === 0 ? ' [pinned]' : '';
          const _deTrpOff = AI_CONSTANTS.FLEE_DEADEND_TRAPPED === 0 ? ' [pinned]' : '';
          _hudPush(`Dead end: out ${logic.fleeDeadEndCount}${_deOutOff}, ` +
            `trapped ${logic.fleeTrappedCount}${_deTrpOff}${_deAvOff}`, '');
        }

        if (_hudSec('dbgHudFleeStand', st.dbgHudFleeStand)) {
          let _fsAct = 0;
          const _fsTanks = st.enemyTanks;
          for (let i = 0; i < _fsTanks.length; i++) {
            const _fsT = _fsTanks[i];
            if (_fsT.active && !_fsT.isDying && _fsT.fear.isFleeing &&
                _fsT.fleeStandHeldFor === _fsT.fear.fleeStartTime &&
                _fsT.fear.fleeStartTime > 0) _fsAct++;
          }
          const _fsOff = AI_CONSTANTS.FLEE_STAND_POWER === 0 ? ' [OFF]'
            : (!logic.roleSenseActive ? ' [no power scale]' : '');
          const _rvOff = AI_CONSTANTS.RAM_VETO_RESTORES_FLEE === 0 ? ' [restore OFF]' : '';
          _hudPush(`Flee stand ${logic.fleeStandCount}, ` +
            `held ${logic.fleeStandHoldCount} (act ${_fsAct}) session, ` +
            `ram back ${logic.ramVetoRestoredCount} this test${_fsOff}${_rvOff}`, '');
        }

        if (_hudSec('dbgHudFearRearm', st.dbgHudFearRearm)) {
          const _frOff = AI_CONSTANTS.FEAR_REARM_COOLDOWN === 0 ? ' [OFF]' : '';
          _hudPush(`Fear rearm held ${(logic.fearRearmHeldGunMs / 1000).toFixed(1)}s gun, ` +
            `${(logic.fearRearmHeldHpMs / 1000).toFixed(1)}s hurt${_frOff}`, '');
        }

        if (_hudSec('dbgHudFleeCommit', st.dbgHudFleeCommit)) {
          const _fcOff = AI_CONSTANTS.FLEE_LEGACY_COMMIT === 0 ? ' [OFF]' : '';
          _hudPush(`Flee commit ${(logic.fleeLegacyHeldMs / 1000).toFixed(1)}s held | ` +
            `stuck ${(logic.fleeDangleMs / 1000).toFixed(1)}s${_fcOff}`, '');
        }

        if (_hudSec('dbgHudBorderSqueeze', st.dbgHudBorderSqueeze)) {
          _hudPush(`Border squeeze ${logic.borderSqueezeCount} | band ${(logic.borderLeanMs / 1000).toFixed(1)}s`, '');
        }

        if (_hudSec('dbgHudProvokeShield', st.dbgHudProvokeShield)) {
          _hudPush(AI_CONSTANTS.PROVOKE_SHIELD === 0
            ? 'Shield hits noticed OFF'
            : `Shield hits noticed ${logic.provokeShieldCount}`, '');
        }

        if (_hudSec('dbgHudRetaliate', st.dbgHudRetaliate)) {
          _hudPush(AI_CONSTANTS.PROVOKE_RETALIATE === 0
            ? 'Shot back OFF'
            : `Shot back ${logic.provokeRetaliateCount}`, '');
        }

        if (_hudSec('dbgHudRoleRepair', st.dbgHudRoleRepair) && logic.roleSenseActive) {
          let _rpZero = 0;
          const _rpTanks = st.enemyTanks;
          for (let i = 0; i < _rpTanks.length; i++) {
            const _rpT = _rpTanks[i];
            if (_rpT.active && !_rpT.isDying && _rpT.rolePower === 0
                && _rpT.rolePowerCeilRef !== 0 && logic.roleClassify(_rpT) !== 0) _rpZero++;
          }
          _hudPush(`Role fix: swap ${logic.roleWdAggSwapCount}, zeroPwr ${_rpZero}`, '');
        }

        if (_hudSec('dbgHudLoopErrors', st.dbgHudLoopErrors) && _loopErrorCount > 0) {
          _hudPush(`Loop errors: ${_loopErrorCount}`, '');
          if (_loopErrorLast) _hudPush(`Last: ${_loopErrorLast.slice(0, 48)}`, '');
        }
    }

    if (_hudSec('showSpawnStats', showSpawn)) {
        _hudPush(_spawnStatsText1, '');
        _hudPush(_spawnStatsText2, '');
        _hudPush(_spawnStatsText3, '');
    }
    if (_hudSec('dbgHudRarity', showRarity)) _hudPush(`RARITY ${rarityMult.toLocaleString()}x`, SMALL_FIX.R667 !== 0 ? dbgInk(DBG_INK.RARITY, _isDarkMode) : '#ffaa00');
    _hudBuildOrder(_hudN);

    const gap = Math.round(10 * (logic.hudScale || 1) * logic.dpr);
    const boxBottom = _mmLastY - _HUD_STACK_LIFT;
    const minBoxH = _HUD_WM_BLOCK + _INFO_LINE_SPACING;
    const boxTop = Math.min(
      Math.round(logic.leaderboardBottomCss * logic.dpr) + gap,
      boxBottom - minBoxH,
    );
    const boxH = Math.max(0, boxBottom - boxTop);

    let fit = 1;
    let lineH = _INFO_LINE_SPACING;
    let wmH = _HUD_WM_BLOCK;
    let wmGap = _HUD_WM_GAP;
    let capacity = Math.max(1, Math.floor((boxH - wmH) / lineH));
    if (_hudN > capacity) {
      fit = HUD_MIN_FIT_SCALE;
      lineH = Math.max(1, _INFO_LINE_SPACING * fit);
      wmH = _HUD_WM_BLOCK * fit;
      wmGap = _HUD_WM_GAP * fit;
      capacity = Math.max(1, Math.floor((boxH - wmH) / lineH));
    }

    const paged = _hudN > capacity;
    const perPage = paged ? Math.max(1, capacity - 1) : capacity;
    const pageCount = paged ? Math.ceil(_hudN / perPage) : 1;

    let page = logic.dbgHudPage;
    if (!Number.isFinite(page)) page = 0;
    page = ((page % pageCount) + pageCount) % pageCount;
    logic.dbgHudPage = page;

    const first = page * perPage;
    const last = Math.min(_hudN, first + perPage);
    const shown = last - first;

    const drawnLines = shown + (paged ? 1 : 0);
    const firstMid = boxBottom - drawnLines * lineH + lineH / 2;
    const watermarkY = firstMid - wmGap;

    _applyHudFitScale(fit);

    const textColor = cmHex(CM.TEXT, _isDarkMode, CM_USE.GENERAL);
    const fr = _htFrame;
    let rows = 0;
    for (let i = first; i < last; i++) {
        const idx = _hudOrderIdx[i];
        fr.text[rows] = _hudLine[idx];
        fr.fill[rows] = _hudColor[idx] !== '' ? _hudColor[idx] : textColor;
        rows++;
    }
    if (paged) {
        fr.text[rows] = `${last} / ${_hudN}  -  page ${page + 1} / ${pageCount}   [ ]  to page`;
        fr.fill[rows] = _HUD_PAGE_COLOR;
        rows++;
    }
    fr.rows = rows;
    fr.anchorX = rightEdge;
    fr.firstMid = firstMid;
    fr.pitch = lineH;
    fr.f10 = _hudFitInfo10;
    fr.l10 = _hudFitInfoL10;
    fr.outline = _DEBUG_STROKE_COLOR;
    fr.mark = _HUD_WATERMARK;
    fr.markMid = watermarkY;
    fr.markF10 = _hudFitWm10;
    fr.markL10 = _hudFitWmL10;
    fr.markSpan = rightEdge - _mmLastX;
    fr.markC0 = _HUD_WM_C0;
    fr.markC1 = _HUD_WM_C1;

    const webgl = logic.webglRenderer;
    const gpu = webgl !== null && webgl.isEnabled()
        && hudTextDraw(webgl, ctx, fr, ctx.canvas.width, ctx.canvas.height, boxTop, boxH,
                       (logic.hudScale || 1) * logic.dpr, dtMs, logic.cameraX, logic.cameraY, logic.zoom);
    if (gpu) {
        let left = fr.markOnCanvas;
        for (let r = 0; r < rows && !left; r++) left = fr.canvasRow[r] === 1;
        if (!left) return;
    }
    _drawHudStackCanvas(ctx, fr, gpu, boxTop, boxH);
}

function _drawHudStackCanvas(ctx: CanvasRenderingContext2D, fr: HtFrame, onlyLeft: boolean, boxTop: number, boxH: number): void {
    const rightEdge = fr.anchorX;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, boxTop, ctx.canvas.width, boxH);
    ctx.clip();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = _DEBUG_STROKE_COLOR;

    if (fr.mark !== '' && (!onlyLeft || fr.markOnCanvas)) {
        ctx.font = _hudFitFontWatermark;
        ctx.lineWidth = _hudFitStrokeWatermark;
        const gradKey = _mmLastX + _mmLastW;
        const _g668 = SMALL_FIX.G668 !== 0 && (_watermarkGradSpan !== fr.markSpan || _watermarkGradEdge !== rightEdge || _watermarkGradC0 !== fr.markC0 || _watermarkGradC1 !== fr.markC1);
        if (!_watermarkGradient || _watermarkGradientKey !== gradKey || _g668) {
            _watermarkGradient = ctx.createLinearGradient(rightEdge - fr.markSpan, 0, rightEdge, 0);
            _watermarkGradient.addColorStop(0, fr.markC0);
            _watermarkGradient.addColorStop(1, fr.markC1);
            _watermarkGradientKey = gradKey;
            _watermarkGradSpan = fr.markSpan; _watermarkGradEdge = rightEdge; _watermarkGradC0 = fr.markC0; _watermarkGradC1 = fr.markC1;
        }
        const y = htSnapMid(fr.markMid, fr.markF10 / 10, fr.markL10 / 10);
        ctx.strokeText(fr.mark, rightEdge, y);
        ctx.fillStyle = _watermarkGradient;
        ctx.fillText(fr.mark, rightEdge, y);
    }

    ctx.font = _hudFitFontInfo;
    ctx.lineWidth = _hudFitStrokeInfo;
    const fontPx = fr.f10 / 10, lwPx = fr.l10 / 10;
    for (let r = 0; r < fr.rows; r++) {
        if (onlyLeft && fr.canvasRow[r] === 0) continue;
        ctx.fillStyle = fr.fill[r];
        _drawDebugText(ctx, fr.text[r], rightEdge, htSnapMid(fr.firstMid + r * fr.pitch, fontPx, lwPx));
    }
    ctx.restore();
}

const _mmSize: HudMmSize = { w: 0, h: 0 };

let _mmLastX = 0;
let _mmLastY = 0;
let _mmLastW = 0;
let _hudDpr = 0;
let _hudScaleC = 0;
let _INFO_LINE_SPACING = 0;
let _HUD_WM_GAP = 0;
let _HUD_WM_BLOCK = 0;
let _HUD_STACK_LIFT = 0;
const _hudLine: string[] = [];
const _hudColor: string[] = [];
const _hudKey: string[] = [];
let _hudN = 0;
let _hudCurKey = '';

function _hudSec(key: string, on: boolean): boolean {
    _hudCurKey = key;
    return on;
}

function _hudPush(text: string, color: string): void {
    if (_hudN < _hudLine.length) { _hudLine[_hudN] = text; _hudColor[_hudN] = color; _hudKey[_hudN] = _hudCurKey; }
    else { _hudLine.push(text); _hudColor.push(color); _hudKey.push(_hudCurKey); }
    _hudN++;
}

const _hudOrderIdx: number[] = [];
function _hudBuildOrder(n: number): void {
    for (let i = 0; i < n; i++) _hudOrderIdx[i] = i;
    for (let i = 1; i < n; i++) {
        const v = _hudOrderIdx[i];
        const rv = _hudRank(v);
        let j = i - 1;
        while (j >= 0 && _hudRank(_hudOrderIdx[j]) < rv) { _hudOrderIdx[j + 1] = _hudOrderIdx[j]; j--; }
        _hudOrderIdx[j + 1] = v;
    }
}
function _hudRank(i: number): number {
    const k = _hudKey[i];
    return k === '' ? Number.POSITIVE_INFINITY : debugHudOrderOf(k);
}
const HUD_MIN_FIT_SCALE = 0.85;

const _HUD_PAGE_COLOR = '#c8c8c8';

let _hudFitFontInfo = '';
let _hudFitFontWatermark = '';
let _hudFitStrokeInfo = 0;
let _hudFitStrokeWatermark = 0;
let _hudFitScaleCached = -1;
let _hudFitBaseDpr = -1;
let _hudFitBaseScale = -1;
let _hudFitInfo10 = 0;
let _hudFitInfoL10 = 0;
let _hudFitWm10 = 0;
let _hudFitWmL10 = 0;

const _HUD_WATERMARK = 'iStrongEngine';
const _HUD_WM_C0 = '#6554ff';
const _HUD_WM_C1 = '#a78bfa';

const _htFrame: HtFrame = htNewFrame();

let _hudBaseFps = -1;
let _hudBaseMode = '';
let _hudBaseLine = '';

function _applyHudFitScale(scale: number): void {
    if (scale === _hudFitScaleCached && _hudDpr === _hudFitBaseDpr && _hudScaleC === _hudFitBaseScale) return;
    _hudFitScaleCached = scale;
    _hudFitBaseDpr = _hudDpr;
    _hudFitBaseScale = _hudScaleC;
    const k = (_hudScaleC || 1) * _hudDpr * scale;
    _hudFitWm10 = htRound10(HUD_XI_WM_FONT * k);
    _hudFitInfo10 = htRound10(HUD_XI_FONT * k);
    _hudFitWmL10 = htRound10(HUD_STROKE_F_BIG * HUD_XI_WM_FONT * k);
    _hudFitInfoL10 = htRound10(HUD_STROKE_F * HUD_XI_FONT * k);
    _hudFitFontWatermark = `bold ${_hudFitWm10 / 10}px "Ubuntu", "Inter", sans-serif`;
    _hudFitFontInfo = `bold ${_hudFitInfo10 / 10}px "Ubuntu", "Inter", sans-serif`;
    _hudFitStrokeWatermark = _hudFitWmL10 / 10;
    _hudFitStrokeInfo = _hudFitInfoL10 / 10;
}

function _updateHudFontCache(dpr: number, hudScale: number): void {
    if (dpr === _hudDpr && hudScale === _hudScaleC) return;
    _hudDpr = dpr;
    _hudScaleC = hudScale;
    const k = (hudScale || 1) * dpr;
    _INFO_LINE_SPACING = HUD_XI_PITCH * k;
    _HUD_WM_GAP = HUD_XI_WM_GAP * k;
    _HUD_WM_BLOCK = (HUD_XI_WM_GAP + HUD_XI_WM_FONT / 2 - HUD_XI_PITCH / 2) * k;
    _HUD_STACK_LIFT = (HUD_XI_ABOVE_MM - HUD_XI_PITCH / 2) * k;
    _watermarkGradient = null;
    _hudFitScaleCached = -1;
    _applyHudFitScale(1);
}

let _watermarkGradient: CanvasGradient | null = null;
let _watermarkGradSpan = NaN, _watermarkGradEdge = NaN, _watermarkGradC0 = '', _watermarkGradC1 = '';
let _watermarkGradientKey = 0;
let _gameModeName = '';
let _gameModeMode = '';
let _gameModeTeams = -1;
let _gameModePreset = '';
let _gameModeOverlay = '';
let _gameModeGrowth = false;
let _gameModeArms = false;

function _getGameModeName(gm: { mode: string; teams: number; preset?: string; world?: string; growth?: boolean; armsRace?: boolean; enableSpawnZones?: boolean; overlay?: string }): string {
    const _key = gm.preset ?? gm.world ?? (gm.enableSpawnZones === false ? 'open' : '');
    const _ov = gm.overlay ?? '';
    if (gm.mode === _gameModeMode && gm.teams === _gameModeTeams && _key === _gameModePreset && !!gm.growth === _gameModeGrowth && !!gm.armsRace === _gameModeArms && _ov === _gameModeOverlay) return _gameModeName;
    _gameModeOverlay = _ov;
    _gameModeGrowth = !!gm.growth;
    _gameModeArms = !!gm.armsRace;
    _gameModeMode = gm.mode;
    _gameModeTeams = gm.teams;
    _gameModePreset = _key;
    if (gm.preset && gm.mode !== 'scripted') { const _pt = presetTitle(gm.preset); if (_pt) { _gameModeName = _pt; return _gameModeName; } }
    const _hudWorld = worldIdOf(gm.mode as GameModeType, gm.teams, gm.world);
    if (_hudWorld !== null) { _gameModeName = worldHudName(_hudWorld, !!gm.growth, !!gm.armsRace, gm.overlay); return _gameModeName; }
    if (ALL_MODES.ON !== 0 && gm.mode === 'old-dreadnoughts') { const _odv = odVariantOf(gm.teams, gm.enableSpawnZones === false); if (_odv !== null) { _gameModeName = _odv.title; return _gameModeName; } }
    switch (gm.mode) {
      case 'scripted': _gameModeName = `${gm.preset && gm.growth ? 'Growth ' : ''}${gm.preset && gm.armsRace ? 'Arms Race ' : ''}${presetTitle(gm.preset) ?? (gameModeTitleOf(gm.mode) ?? gm.mode)}`; break;
      case 'sandbox': _gameModeName = 'Sandbox'; break;
      case 'ffa': _gameModeName = 'FFA'; break;
      case 'rock-ffa': _gameModeName = 'Rock FFA'; break;
      case 'maze': _gameModeName = 'Maze'; break;
      case 'tdm': _gameModeName = `${gm.teams}TDM`; break;
      case 'open-tdm': _gameModeName = `Open ${gm.teams}TDM`; break;
      case 'duos': _gameModeName = 'Duos'; break;
      case 'maze-duos': _gameModeName = 'Maze Duos'; break;
      case 'squads': _gameModeName = 'Squads'; break;
      case 'maze-squads': _gameModeName = 'Maze Squads'; break;
      case 'portal-2tdm': _gameModeName = 'Portal 2TDM'; break;
      case 'portal-4tdm': _gameModeName = 'Portal 4TDM'; break;
      case 'portal-maze-4tdm': _gameModeName = 'Portal Maze 4TDM'; break;
      default: { const _t = gameModeTitleOf(gm.mode); _gameModeName = _t !== undefined ? _t : gm.mode; break; }
    }
    return _gameModeName;
}

let _mmStaticCanvas: OffscreenCanvas | null = null;
let _mmStaticCtx: OffscreenCanvasRenderingContext2D | null = null;
let _mmCachedMapRef: object | null = null;
let _mmCachedW: number = 0;
let _mmCachedH: number = 0;
let _mmCachedActivePortals: number = -1;
let _mmCachedPortalMoves: number = -1;
let _mmCachedPumpkinDot = '';
let _mmCachedAll = false;
let _mmCachedAreaVer = 0;
let _mmCachedMagic = -1;
let _mmMoveCanvas: OffscreenCanvas | null = null;
let _mmMoveCtx: OffscreenCanvasRenderingContext2D | null = null;
let _mmMoveVerDrawn = -1;
let _mmCachedPanel = -1;
function _mmStaticCanvasOf(pixW: number, pixH: number): OffscreenCanvasRenderingContext2D {
    const w = Math.round(pixW);
    const h = Math.round(pixH);
    if (!_mmStaticCanvas || _mmStaticCanvas.width !== w || _mmStaticCanvas.height !== h) {
        _mmStaticCanvas = new OffscreenCanvas(w, h);
        _mmStaticCtx = _mmStaticCanvas.getContext('2d')!;
    }
    return _mmStaticCtx!;
}
function _renderMinimapStatic(ms: NonNullable<typeof GameLogic.prototype.mapState>, pixW: number, pixH: number, k: number, areaOffX = 0, areaOffY = 0, pumpkinDot = '', mv: MmMoving | null = null) {
    const sCtx = _mmStaticCanvasOf(pixW, pixH);
    mmPaintMap(sCtx, _isDarkMode, ms, Math.round(pixW), Math.round(pixH), k, areaOffX, areaOffY, pumpkinDot, undefined, _mmSlotOf, mv);
    _mmCachedMapRef = ms;
    _mmCachedW = pixW;
    _mmCachedH = pixH;
}
const _mmWorldAreas: MmWorldArea[] = [];
let _mmSlotOf: ((o: object) => number) | null = null;
function _renderMinimapStaticAll(logic: GameLogic, ref: object, pixW: number, pixH: number, k: number,
    wx0: number, wy0: number, worldW: number, worldH: number, pumpkinDot: string) {
    const sCtx = _mmStaticCanvasOf(pixW, pixH);
    const states = logic.areaStates, bounds = logic.areaBounds, areas = logic.state.multiAreaConfig.areas;
    _mmWorldAreas.length = 0;
    for (let i = 0; i < states.length; i++) {
        const st = states[i];
        let b = null, a = null;
        for (let j = 0; j < bounds.length; j++) if (bounds[j].id === st.areaId) { b = bounds[j]; break; }
        for (let j = 0; j < areas.length; j++) if (areas[j].id === st.areaId) { a = areas[j]; break; }
        if (b === null || a === null) continue;
        _mmWorldAreas.push({ ms: st, minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY, offX: a.worldOffsetX, offY: a.worldOffsetY, mv: logic.mmPictureOf(st) });
    }
    mmPaintWorld(sCtx, _isDarkMode, _mmWorldAreas, Math.round(pixW), Math.round(pixH), k, wx0, wy0, worldW, worldH, pumpkinDot, undefined, _mmSlotOf);
    if (SMALL_FIX.GH299 !== 0) _mmWorldAreas.length = 0;
    _mmCachedMapRef = ref;
    _mmCachedW = pixW;
    _mmCachedH = pixH;
}
function _mmPaintMoversAt(c: MmCtxOf, logic: GameLogic, all: boolean, ms: NonNullable<typeof GameLogic.prototype.mapState>,
    dx: number, dy: number, dw: number, dh: number, areaOffX: number, areaOffY: number,
    wx0: number, wy0: number, worldW: number, worldH: number, sliding: boolean): void {
    const movers = logic.magicMovers, col = hudColors(_isDarkMode);
    if (sliding && SMALL_FIX.G663 !== 0) { let any = false; for (let i = 0; i < movers.length; i++) if (movers[i].sliding > 0) { any = true; break; } if (!any) return; }
    if (!all) {
        mmPaintMovers(c, _isDarkMode, movers, ms, dx, dy, dw / (ms.mapHalf * 2), dh / (ms.mapHalfY * 2), areaOffX, areaOffY, sliding, col, _mmSlotOf);
        return;
    }
    const sx = dw / worldW, sy = dh / worldH;
    const states = logic.areaStates, bounds = logic.areaBounds, areas = logic.state.multiAreaConfig.areas;
    for (let i = 0; i < states.length; i++) {
        const st = states[i];
        let b = null, a = null;
        for (let j = 0; j < bounds.length; j++) if (bounds[j].id === st.areaId) { b = bounds[j]; break; }
        for (let j = 0; j < areas.length; j++) if (areas[j].id === st.areaId) { a = areas[j]; break; }
        if (b === null || a === null) continue;
        mmPaintMovers(c, _isDarkMode, movers, st, dx + (b.minX - wx0) * sx, dy + (b.minY - wy0) * sy, sx, sy, a.worldOffsetX, a.worldOffsetY, sliding, col, _mmSlotOf);
    }
}
type MmCtxOf = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
function _renderMinimapMovers(logic: GameLogic, all: boolean, ms: NonNullable<typeof GameLogic.prototype.mapState>, pixW: number, pixH: number,
    areaOffX: number, areaOffY: number, wx0: number, wy0: number, worldW: number, worldH: number): void {
    const w = Math.round(pixW), h = Math.round(pixH);
    if (!_mmMoveCanvas || _mmMoveCanvas.width !== w || _mmMoveCanvas.height !== h) {
        _mmMoveCanvas = new OffscreenCanvas(w, h);
        _mmMoveCtx = _mmMoveCanvas.getContext('2d')!;
    }
    const c = _mmMoveCtx!;
    c.clearRect(0, 0, _mmMoveCanvas.width, _mmMoveCanvas.height);
    c.globalAlpha = 1;
    _mmPaintMoversAt(c, logic, all, ms, 0, 0, w, h, areaOffX, areaOffY, wx0, wy0, worldW, worldH, false);
    _mmMoveVerDrawn = logic.mmMoveVer;
}

interface _MmDot {
    id: string;
    fx: number; fy: number; tx: number; ty: number;
    a0: number; a1: number;
    moveMs: number; alphaMs: number;
    color: string;
    seen: number;
}
const _mmDots: _MmDot[] = [];
const _mmDotById = new Map<string, _MmDot>();
let _mmSampleGen = 0;
let _mmLastSampleMs = -1e9;
let _mmDotsMapRef: object | null = null;
let _mmDotsLine = -1;
let _mmExtFromW = -1, _mmExtFromH = -1, _mmExtMs = 0, _mmExtToW = 0, _mmExtToH = 0;
let _mmShownW = -1, _mmShownH = -1;

function _mmDotX(d: _MmDot, nowMs: number): number { return d.fx + (d.tx - d.fx) * hudMmGlideT((nowMs - d.moveMs) / 1000); }
function _mmDotY(d: _MmDot, nowMs: number): number { return d.fy + (d.ty - d.fy) * hudMmGlideT((nowMs - d.moveMs) / 1000); }
function _mmDotA(d: _MmDot, nowMs: number): number { return d.a0 + (d.a1 - d.a0) * hudMmGlideT((nowMs - d.alphaMs) / 1000); }

function _mmSampleDot(id: string, fx: number, fy: number, color: string, nowMs: number): void {
    let d = _mmDotById.get(id);
    if (d === undefined) {
        d = { id, fx, fy, tx: fx, ty: fy, a0: 0, a1: 1, moveMs: nowMs, alphaMs: nowMs, color, seen: _mmSampleGen };
        _mmDotById.set(id, d);
        _mmDots.push(d);
        return;
    }
    const cx = _mmDotX(d, nowMs), cy = _mmDotY(d, nowMs);
    d.fx = cx; d.fy = cy; d.tx = fx; d.ty = fy; d.moveMs = nowMs;
    if (d.a1 !== 1) { d.a0 = _mmDotA(d, nowMs); d.a1 = 1; d.alphaMs = nowMs; }
    d.color = color;
    d.seen = _mmSampleGen;
}

let _mmBoxW = -1, _mmBoxH = -1;
let _mmBoxFromW = 0, _mmBoxFromH = 0, _mmBoxToW = 0, _mmBoxToH = 0, _mmBoxMs = 0, _mmBoxDrawnMs = -1e9;
function _mmBoxGlideTo(tw: number, th: number, nowMs: number): void {
    if (_mmBoxW < 0 || nowMs - _mmBoxDrawnMs > 250) {
        _mmBoxW = _mmBoxFromW = _mmBoxToW = tw;
        _mmBoxH = _mmBoxFromH = _mmBoxToH = th;
        _mmBoxMs = nowMs;
    } else {
        if (tw !== _mmBoxToW || th !== _mmBoxToH) {
            _mmBoxFromW = _mmBoxW; _mmBoxFromH = _mmBoxH;
            _mmBoxToW = tw; _mmBoxToH = th;
            _mmBoxMs = nowMs;
        }
        const t = hudMmBoxGlideT((nowMs - _mmBoxMs) / 1000);
        _mmBoxW = t >= 1 ? _mmBoxToW : _mmBoxFromW + (_mmBoxToW - _mmBoxFromW) * t;
        _mmBoxH = t >= 1 ? _mmBoxToH : _mmBoxFromH + (_mmBoxToH - _mmBoxFromH) * t;
    }
    _mmBoxDrawnMs = nowMs;
}

function _mmHash(i: number, sec: number, salt: number): number {
    let h = Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(sec, 0x165667b1) ^ Math.imul(salt, 0x9e3779b9);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const SAFE_L = 'env(safe-area-inset-left, 0px)', SAFE_T = 'env(safe-area-inset-top, 0px)', SAFE_R = 'env(safe-area-inset-right, 0px)', SAFE_B = 'env(safe-area-inset-bottom, 0px)';

const _mfIn: MobFitIn = { W: 0, H: 0, mmX: MOB_MM_X, mmY: 0, mmW: 0, mmH: 0, plusGap: MOB_PLUS_GAP, plusW: MOB_PLUS_ROW_W, plusH: MOB_BTN_H, boardRows: 0, boardTop: 0, gap: MOB_FIT_GAP };
const _mfNow: MobFitOut = { k: 1, m: 1, b: 1, rows: 0, hide: false };
const _mfTarget: MobFitOut = { k: 1, m: 1, b: 1, rows: 0, hide: false };
function _mobFit(target: boolean, W: number, H: number, mmW: number, mmH: number): MobFitOut {
    const f = _mfIn;
    f.W = W; f.H = H; f.mmW = mmW; f.mmH = mmH;
    const tileP = target ? mobHud.tileTarget : mobHud.tileP;
    const ySkill = target ? HUD_UP_ORIGIN + mobHud.tileRowsTarget * HUD_UP_PITCH : mobHud.ySkill;
    const skillP = target ? mobHud.skillTarget : mobHud.skillShown;
    f.mmY = ySkill + skillP * MOB_SK_BLOCK;
    f.boardRows = mobHud.boardRows;
    f.boardTop = mobBoardTop(tileP, mobHud.tileColY, skillP, mobHud.skillReach, ySkill);
    return mobFitAll(f, target ? _mfTarget : _mfNow);
}

function drawMinimap(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, logic: GameLogic) {
    let ms = logic.mapState;
    if (!ms) return;
    const _mmW = logic.spectatedTank();
    const _mmArea = _mmW !== null && _mmW.areaId ? _mmW.areaId : logic.playerAreaId;

    if (logic.areaStates.length >= 1 && _mmArea) {
      const areaMs = logic.areaStates.find(s => s.areaId === _mmArea);
      if (areaMs) ms = areaMs;
    }

    const _mmAll = logic.areaStates.length > 1 && minimapShowsAllAreas(logic.state.multiAreaConfig);
    let mapHalf = ms.mapHalf;
    let mapHalfY = ms.mapHalfY;
    let _wx0 = 0, _wy0 = 0;
    if (_mmAll) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < logic.areaBounds.length; i++) {
        const ab = logic.areaBounds[i];
        if (ab.minX < x0) x0 = ab.minX;
        if (ab.minY < y0) y0 = ab.minY;
        if (ab.maxX > x1) x1 = ab.maxX;
        if (ab.maxY > y1) y1 = ab.maxY;
      }
      _wx0 = x0; _wy0 = y0;
      mapHalf = (x1 - x0) / 2;
      mapHalfY = (y1 - y0) / 2;
    }
    if (mapHalf <= 0) return;
    const mapW = mapHalf * 2;
    const mapH = mapHalfY * 2;
    const dpr = logic.dpr;
    const k = (logic.hudScale || 1) * dpr;
    hudMinimapSize(mapW, mapH, _mmSize);
    const _mob = logic.state.isTestMode && mobileActive();
    let _kmPic = 1, _kmNow = 1;
    const _sl = _mob ? safeInsets.l * dpr : 0, _st = _mob ? safeInsets.t * dpr : 0, _sr = _mob ? safeInsets.r * dpr : 0, _sb = _mob ? safeInsets.b * dpr : 0;
    const _sW = canvasW - _sl - _sr, _sH = canvasH - _st - _sb;
    if (_mob) _kmPic = _mobFit(true, _sW / k, _sH / k, _mmSize.w, _mmSize.h).m;
    const picW = SMALL_FIX.GH300 !== 0 ? Math.max(1, Math.round(_mmSize.w * _kmPic * k)) : Math.round(_mmSize.w * _kmPic * k);
    const picH = SMALL_FIX.GH300 !== 0 ? Math.max(1, Math.round(_mmSize.h * _kmPic * k)) : Math.round(_mmSize.h * _kmPic * k);
    const nowMs = performance.now();
    _mmBoxGlideTo(_mmSize.w, _mmSize.h, nowMs);
    if (_mob) _kmNow = _mobFit(false, _sW / k, _sH / k, _mmBoxW, _mmBoxH).m;
    const mmW = Math.round(_mmBoxW * _kmNow * k);
    const mmH = Math.round(_mmBoxH * _kmNow * k);
    const margin = HUD_MM_MARGIN * k;
    const mmX = _mob ? Math.round(_sl + MOB_MM_X * k) : Math.round(canvasW - margin - mmW);
    const mmY = _mob ? Math.round(_st + mobHud.y3 * k) : Math.round(canvasH - margin - mmH);
    if (_mob && mobHud.mmW !== _mmBoxW * _kmNow) { mobHud.mmW = _mmBoxW * _kmNow; mobTilesChanged(); }
    if (_mob) {
      const _f = _mfNow, _bt = _mfIn.boardTop;
      const _vw = _sW / dpr, _vh = _sH / dpr;
      if (_f.k !== mobHud.stickK || _vw !== mobHud.viewW || _vh !== mobHud.viewH || _bt !== mobHud.boardTop || _f.b !== mobHud.boardB
        || _f.rows !== mobHud.boardN || _f.hide !== mobHud.boardHide) {
        mobHud.stickK = _f.k; mobHud.viewW = _vw; mobHud.viewH = _vh;
        mobHud.boardTop = _bt; mobHud.boardB = _f.b; mobHud.boardN = _f.rows; mobHud.boardHide = _f.hide;
        mobSticksChanged();
      }
    }

    _mmLastX = _mob ? Math.round(canvasW - _sr - margin - mmW) : mmX;
    _mmLastY = _mob ? Math.round(canvasH - _sb) : mmY;
    _mmLastW = mmW;

    let areaOffX = 0, areaOffY = 0;
    if (_mmAll) {
      areaOffX = _wx0 + mapHalf;
      areaOffY = _wy0 + mapHalfY;
    } else if (logic.areaStates.length >= 1 && _mmArea) {
      const mac = logic.state.multiAreaConfig;
      const areaConf = mac.areas.find(a => a.id === _mmArea);
      if (areaConf) {
        areaOffX = areaConf.worldOffsetX;
        areaOffY = areaConf.worldOffsetY;
      }
    }

    let activePortalCount = 0;
    for (let si = 0, sn = _mmAll ? logic.areaStates.length : 1; si < sn; si++) {
      const pp = _mmAll ? logic.areaStates[si].portals : ms.portals;
      for (let i = 0; i < pp.length; i++) {
        if (!pp[i].timed || pp[i]._timedActive) activePortalCount++;
      }
    }
    const _mmHw = halloweenLook(logic);
    const _mmPumpkinDot = (_mmHw !== null && _mmHw.pumpkin !== null) ? hudMinimapDot(bodyFill(_mmHw.pumpkin.body.color, _mmHw.pumpkin.body.colorMap), _isDarkMode) : '';
    const _mmMoves = portalMoveCount();
    const _mmRef: object = _mmAll ? logic.areaStates[0] : ms;
    if (_mmRef !== _mmCachedMapRef || _mmAll !== _mmCachedAll || picW !== _mmCachedW || picH !== _mmCachedH || activePortalCount !== _mmCachedActivePortals || logic.admin.mapVer !== _mmCachedPanel || logic.mevAreaVer !== _mmCachedAreaVer || logic.mmMapVer !== _mmCachedMagic || _mmPumpkinDot !== _mmCachedPumpkinDot || _mmMoves !== _mmCachedPortalMoves) {
        _mmCachedActivePortals = activePortalCount;
        _mmCachedPortalMoves = _mmMoves;
        _mmCachedPanel = logic.admin.mapVer;
        _mmCachedAreaVer = logic.mevAreaVer;
        _mmCachedMagic = logic.mmMapVer;
        _mmCachedPumpkinDot = _mmPumpkinDot;
        _mmCachedAll = _mmAll;
        _mmSlotOf = SMALL_FIX.R752B !== 0 && logic.admin.wallSlotsOn ? (o: object) => logic.admin.slotOf(o) : null;
        if (_mmAll) _renderMinimapStaticAll(logic, _mmRef, picW, picH, k, _wx0, _wy0, mapW, mapH, _mmPumpkinDot);
        else _renderMinimapStatic(ms, picW, picH, k, areaOffX, areaOffY, _mmPumpkinDot, logic.mmPictureOf(ms));
        _mmMoveVerDrawn = -1;
    }
    const _mmMov = logic.magicMovers.length > 0;
    if (_mmMov && (logic.mmMoveVer !== _mmMoveVerDrawn || !_mmMoveCanvas || _mmMoveCanvas.width !== Math.round(picW) || _mmMoveCanvas.height !== Math.round(picH))) {
        _renderMinimapMovers(logic, _mmAll, ms, picW, picH, areaOffX, areaOffY, _wx0, _wy0, mapW, mapH);
    }

    const _mmLine = _mmAll ? -1 : mapLineOf(ms);
    if (_mmDotsMapRef !== null && _mmDotsMapRef !== ms && _mmLine >= 0 && _mmLine === _mmDotsLine && _mmShownW > 0) {
        _mmExtFromW = _mmShownW; _mmExtFromH = _mmShownH; _mmExtToW = mapW; _mmExtToH = mapH; _mmExtMs = nowMs;
    }
    let _shW = mapW, _shH = mapH;
    if (_mmExtFromW >= 0) {
        const t = hudMmGlideT((nowMs - _mmExtMs) / 1000);
        if (t >= 1 || _mmExtToW !== mapW || _mmExtToH !== mapH) _mmExtFromW = -1;
        else { _shW = _mmExtFromW + (mapW - _mmExtFromW) * t; _shH = _mmExtFromH + (mapH - _mmExtFromH) * t; }
    }
    _mmShownW = _shW; _mmShownH = _shH;

    const _mmScatter = logic.minimapScattered();
    if (_mmScatter) {
        ctx.globalAlpha = HUD_MM_BG_ALPHA; ctx.fillStyle = hudColors(_isDarkMode).mmBg;
        ctx.fillRect(mmX, mmY, mmW, mmH);
        ctx.globalAlpha = 1;
    }
    let _mmPX = mmX, _mmPY = mmY, _mmPW = mmW, _mmPH = mmH;
    if (_shW !== mapW || _shH !== mapH) { _mmPW = mmW * mapW / _shW; _mmPH = mmH * mapH / _shH; _mmPX = mmX + (mmW - _mmPW) / 2; _mmPY = mmY + (mmH - _mmPH) / 2; }
    const _mmMovLayer = _mmMov && _mmMoveCanvas !== null;
    if (_mmStaticCanvas && !_mmScatter) {
        if (_shW === mapW && _shH === mapH) {
            ctx.drawImage(_mmStaticCanvas, mmX, mmY, mmW, mmH);
            if (_mmMovLayer) ctx.drawImage(_mmMoveCanvas!, mmX, mmY, mmW, mmH);
        } else {
            const pw = _mmPW, ph = _mmPH;
            const px = _mmPX, py = _mmPY;
            ctx.save();
            ctx.beginPath(); ctx.rect(mmX, mmY, mmW, mmH); ctx.clip();
            if (pw < mmW || ph < mmH) {
                ctx.globalAlpha = HUD_MM_BG_ALPHA; ctx.fillStyle = hudColors(_isDarkMode).mmBg;
                ctx.beginPath(); ctx.rect(mmX, mmY, mmW, mmH); ctx.rect(px, py, pw, ph); ctx.fill('evenodd');
                ctx.globalAlpha = 1;
            }
            ctx.drawImage(_mmStaticCanvas, px, py, pw, ph);
            if (_mmMovLayer) ctx.drawImage(_mmMoveCanvas!, px, py, pw, ph);
            ctx.restore();
        }
    }

    const col = hudColors(_isDarkMode);
    const dotR = HUD_MM_DOT * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(mmX, mmY, mmW, mmH);
    ctx.clip();

    if (_mmMovLayer && !_mmScatter) {
        ctx.globalAlpha = 1;
        _mmPaintMoversAt(ctx, logic, _mmAll, ms, _mmPX, _mmPY, _mmPW, _mmPH, areaOffX, areaOffY, _wx0, _wy0, mapW, mapH, true);
    }

    if (_mmDotsMapRef !== ms) {
        if (_mmLine < 0 || _mmLine !== _mmDotsLine) {
            _mmDots.length = 0;
            _mmDotById.clear();
            _mmLastSampleMs = -1e9;
        }
        _mmDotsMapRef = ms;
        _mmDotsLine = _mmLine;
    }

    const _mmGm = logic.state.gameModeConfig;
    const _mmTeamActive = teamColourMode(_mmGm.mode) && logic.state.isTestMode;
    const _mmPg = logic.playerGroupId;
    const _mmPlayerTeam = _mmTeamActive ? logic.getPlayerTeam() : null;
    const _mmManhunt = isManhuntMode(_mmGm.mode) && logic.state.isTestMode;
    const _mmLeaderId = _mmManhunt ? logic.state.manhuntLeaderId : null;

    if (nowMs - _mmLastSampleMs >= HUD_MM_SAMPLE_SEC * 1000) {
      _mmLastSampleMs = nowMs;
      _mmSampleGen++;
      const enemies = logic.state.enemyTanks;
      const showAll = (logic.state.debugMode && logic.state.showAllMinimap) || (logic.admin.attrs & AT_ALL_TEAM_MINIMAP) !== 0;
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy.active) continue;
        if (enemy.isBaseProtector || (enemy._mevF & 32) !== 0) continue;
        const _isManhunted = _mmLeaderId !== null && enemy.id === _mmLeaderId;
        const _isBoss = enemy.isBossTier === true || (enemy._mevF & 4194304) !== 0;
        if (!showAll && !_isManhunted && !_isBoss) {
          if (_mmTeamActive) {
            if (enemy.team !== _mmPlayerTeam) continue;
          } else if (_mmGm.mode === 'sandbox') {
            if (enemy.aiBehavior !== 'Friendly') continue;
          } else {
            if (!(_mmPg !== 0 && enemy.groupId === _mmPg)) continue;
          }
        }
        if (!_mmAll && !_isManhunted && !_isBoss && logic.areaStates.length >= 1 && enemy.areaId !== _mmArea) continue;

        let fx = (enemy.position.x - areaOffX + mapHalf) / mapW;
        let fy = (enemy.position.y - areaOffY + mapHalfY) / mapH;
        fx = fx < 0 ? 0 : fx > 1 ? 1 : fx;
        fy = fy < 0 ? 0 : fy > 1 ? 1 : fy;

        const _mlf = _liveBotFill(logic, enemy);
        _mmSampleDot(enemy.id, fx, fy, hudMinimapDot(_mlf !== '' ? _mlf : bodyFill(enemy.color, enemy.colorMap), _isDarkMode), nowMs);
      }
      const _mmPolys = logic.floatingPolygons;
      for (let i = 0; i < _mmPolys.length; i++) {
        const p = _mmPolys[i];
        if (!p._mmAll || !p.active || p.fadingOut) continue;
        let fx = (p.position.x - areaOffX + mapHalf) / mapW;
        let fy = (p.position.y - areaOffY + mapHalfY) / mapH;
        fx = fx < 0 ? 0 : fx > 1 ? 1 : fx;
        fy = fy < 0 ? 0 : fy > 1 ? 1 : fy;
        const _mwf = p.look !== null && p.look.body.teamColour === true ? _wornFillOf(p, logic) : '';
        _mmSampleDot(p.id, fx, fy, hudMinimapDot(_mwf !== '' ? _mwf : shapeFill(p.color, p.colorMap, false), _isDarkMode), nowMs);
      }
      for (let i = _mmDots.length - 1; i >= 0; i--) {
        const d = _mmDots[i];
        if (d.seen === _mmSampleGen) continue;
        if (d.a1 !== 0) {
          d.a0 = _mmDotA(d, nowMs); d.a1 = 0; d.alphaMs = nowMs;
          const cx = _mmDotX(d, nowMs), cy = _mmDotY(d, nowMs);
          d.fx = cx; d.fy = cy; d.tx = cx; d.ty = cy;
        } else if (nowMs - d.alphaMs >= HUD_MM_GLIDE_SEC * 1000) {
          _mmDotById.delete(d.id);
          const last = _mmDots.pop()!;
          if (i < _mmDots.length) _mmDots[i] = last;
        }
      }
    }

    for (let i = 0; i < _mmDots.length; i++) {
        const d = _mmDots[i];
        const al = _mmDotA(d, nowMs);
        if (al <= 0) continue;
        ctx.globalAlpha = al;
        if (_mmScatter) {
            ctx.fillStyle = col.mmPlayer;
            const sec = Math.floor(nowMs / 1000);
            ctx.beginPath();
            ctx.arc(mmX + _mmHash(i, sec, 1) * mmW, mmY + _mmHash(i, sec, 2) * mmH, dotR, 0, Math.PI * 2);
            ctx.fill();
            continue;
        }
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(mmX + _mmDotX(d, nowMs) * mmW, mmY + _mmDotY(d, nowMs) * mmH, dotR, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = (_mmLeaderId !== null && _mmLeaderId === logic.state.playerId && logic.playerColorTeamIndex() === 2)
      ? _teamColor(2)
      : col.mmPlayer;
    let pfx = ((_mmW !== null ? _mmW.position.x : logic.tankPos.x) - areaOffX + mapHalf) / mapW;
    let pfy = ((_mmW !== null ? _mmW.position.y : logic.tankPos.y) - areaOffY + mapHalfY) / mapH;
    pfx = pfx < 0 ? 0 : pfx > 1 ? 1 : pfx;
    pfy = pfy < 0 ? 0 : pfy > 1 ? 1 : pfy;
    ctx.beginPath();
    ctx.arc(mmX + pfx * mmW, mmY + pfy * mmH, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = col.ink;
    ctx.lineWidth = HUD_RING * k;
    ctx.lineJoin = 'round';
    ctx.strokeRect(mmX, mmY, mmW, mmH);
}



const BAR_GAP_BASE = HUD_HP_BELOW;
const BAR_THICKNESS_BASE = 2 * HUD_HP_FILL_R;
const BAR_BG_EXTRA_BASE = 2 * (HUD_HP_TRACK_R - HUD_HP_FILL_R);
const BAR_ROW_SPACING_BASE = 7.5;
function _barCentreY(y: number, visualRadius: number, growthScale: number): number {
    return y + HUD_HP_R_FACTOR * visualRadius + BAR_GAP_BASE * growthScale;
}

let _barCamX = 0;
let _barHalfView = Infinity;
function _barEdge(x: number, entityRadius: number): number {
    return tagEdge(x - _barCamX, entityRadius, _barHalfView);
}

function _capsulePath(ctx: CanvasRenderingContext2D, xa: number, xb: number, y: number, r: number): void {
    ctx.moveTo(xa, y - r);
    ctx.lineTo(xb, y - r);
    ctx.arc(xb, y, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(xa, y + r);
    ctx.arc(xa, y, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
}

const _hpBlendCache: string[] = [];
function _hpBlend(variant: number, q: number): string {
    const key = (variant * 2 + (_isDarkMode ? 1 : 0)) * 256 + q;
    let c = _hpBlendCache[key];
    if (c === undefined) {
        const sh = hudSlot(HUD_SLOT.TEAL, _isDarkMode);
        const base = hudSlot(variant === 0 ? HUD_SLOT.LGREEN : HUD_SLOT.INK, _isDarkMode);
        const t = q / 255;
        c = `rgb(${Math.round(sh[0] * t + base[0] * (1 - t))},${Math.round(sh[1] * t + base[1] * (1 - t))},${Math.round(sh[2] * t + base[2] * (1 - t))})`;
        _hpBlendCache[key] = c;
    }
    return c;
}

function drawHealthBar(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    entityRadius: number,
    visualRadius: number,
    hpPct: number,
    shieldPct: number,
    alpha: number,
    hasShield: boolean,
    growthScale: number = 1
): void {
    if (!(alpha > 0)) return;
    const barY = _barCentreY(y, visualRadius, growthScale);
    const rT = HUD_HP_TRACK_R * growthScale;
    const rF = HUD_HP_FILL_R * growthScale;
    const x1 = x - entityRadius;
    const len = 2 * entityRadius;
    const hp = hpPct > 0 ? (hpPct < 1 ? hpPct : 1) : 0;
    const sh = shieldPct > 0 ? (shieldPct < 1 ? shieldPct : 1) : 0;
    const xh = x1 + len * hp;
    const xs = x1 + len * sh;
    const shA = hudShieldAlpha(sh);
    const col = hudColors(_isDarkMode);

    const prevAlpha = ctx.globalAlpha;
    const prevCap = ctx.lineCap;
    const prevStroke = ctx.strokeStyle;
    const prevFill = ctx.fillStyle;
    const prevLineW = ctx.lineWidth;
    ctx.globalAlpha = prevAlpha * (alpha < 1 ? alpha : 1);

    if (alpha >= 1) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = col.ink;
        ctx.lineWidth = 2 * rT;
        ctx.beginPath();
        ctx.moveTo(x1, barY);
        ctx.lineTo(x1 + len, barY);
        ctx.stroke();
        ctx.fillStyle = col.health;
        ctx.beginPath();
        _capsulePath(ctx, x1, xh, barY, rF);
        ctx.fill();
        if (hasShield) {
            ctx.globalAlpha = prevAlpha * shA;
            ctx.fillStyle = col.shield;
            ctx.beginPath();
            _capsulePath(ctx, x1, xs, barY, rF);
            ctx.fill();
        }
    } else {
        const hi = hasShield && xs > xh ? xs : xh;
        const lo = hasShield && xs < xh ? xs : xh;
        ctx.fillStyle = col.ink;
        ctx.beginPath();
        _capsulePath(ctx, x1, x1 + len, barY, rT);
        _capsulePath(ctx, x1, hi, barY, rF);
        ctx.fill('evenodd');
        if (hasShield) {
            const q = Math.round(shA * 255);
            ctx.fillStyle = _hpBlend(0, q);
            ctx.beginPath();
            _capsulePath(ctx, x1, lo, barY, rF);
            ctx.fill();
            if (hi > lo) {
                ctx.fillStyle = xh > xs ? col.health : _hpBlend(1, q);
                ctx.beginPath();
                _capsulePath(ctx, x1, hi, barY, rF);
                _capsulePath(ctx, x1, lo, barY, rF);
                ctx.fill('evenodd');
            }
        } else {
            ctx.fillStyle = col.health;
            ctx.beginPath();
            _capsulePath(ctx, x1, xh, barY, rF);
            ctx.fill();
        }
    }

    ctx.globalAlpha = prevAlpha;
    ctx.lineCap = prevCap;
    ctx.strokeStyle = prevStroke;
    ctx.fillStyle = prevFill;
    ctx.lineWidth = prevLineW;
}

function drawBulletWithScratch(targetCtx: CanvasRenderingContext2D, logic: GameLogic, b: Bullet, alpha: number) {
    const sz = b.size * b.growth;
    const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);
    const bulletVisualFactor = b.shapeSides > 0 ? getRealSizeFactor(b.shapeSides) : 1;
    const bufSize = Math.ceil(sz * 1.2 * bulletVisualFactor + strokeWidth + 4);

    if (bufSize > _MAX_SCRATCH_PX) {
        targetCtx.save();
        targetCtx.translate(b.position.x, b.position.y);
        targetCtx.globalAlpha = alpha;
        if (b.shapeSides > 0) targetCtx.rotate(b.facingAngle);
        const _bBypassMapped = _roundFill(b);
        const bBypassColor = b.damageOverlay > 0 ? mixColorToWhite(_bBypassMapped, b.damageOverlay) : _bBypassMapped;
        targetCtx.fillStyle = bBypassColor;
        targetCtx.strokeStyle = darkenColor(bBypassColor, 0.598);
        targetCtx.lineWidth = strokeWidth;
        targetCtx.beginPath();
        if (b.shapeSides >= 3 && b.trapDepth > 0) {
            const outerR = (sz / 2) * getRealSizeFactor(b.shapeSides);
            roundedStarPath(targetCtx, b.shapeSides, outerR, outerR * (1 - b.trapDepth), -Math.PI / 2, b.trapCurved);
        } else if (b.shapeSides > 0) {
            roundedPolygonPath(targetCtx, b.shapeSides, (sz / 2) * getRealSizeFactor(b.shapeSides), roundPoly2DStart(b.shapeSides, ARRAS_PARITY.ROUND_HEADING !== 0));
        } else {
            targetCtx.arc(0, 0, sz / 2, 0, Math.PI * 2);
        }
        targetCtx.stroke();
        targetCtx.fill();
        if (b.labyLevel > 0) {
            const ds = labyDownscale(b.shapeSides);
            if (b.shapeSides === 0) {
                for (let li = 1; li <= b.labyLevel; li++) {
                    const layerR = (sz / 2) * Math.pow(ds, li);
                    targetCtx.beginPath();
                    targetCtx.arc(0, 0, layerR, 0, Math.PI * 2);
                    targetCtx.stroke();
                    targetCtx.fill();
                }
            } else {
                const outerR = (sz / 2) * getRealSizeFactor(b.shapeSides);
                for (let li = 1; li <= b.labyLevel; li++) {
                    const layerR = outerR * Math.pow(ds, li);
                    const layerAngleOff = roundPoly2DStart(b.shapeSides, ARRAS_PARITY.ROUND_HEADING !== 0) + ((li % 2 === 0) ? 0 : Math.PI / b.shapeSides);
                    targetCtx.beginPath();
                    roundedPolygonPath(targetCtx, b.shapeSides, layerR, layerAngleOff);
                    targetCtx.stroke();
                    targetCtx.fill();
                }
            }
        }
        targetCtx.restore();
        return;
    }

    const cs = Math.min(_currentCacheScale, Math.max(1, Math.floor(_MAX_SCRATCH_PX / bufSize)));
    const scaledBuf = Math.ceil(bufSize * cs);

    getScratch(bufSize, bufSize, cs);
    const sc = scratchCanvas!;
    const sCtx = scratchCtx!;

    sCtx.save();
    sCtx.translate(scaledBuf / 2, scaledBuf / 2);
    sCtx.scale(cs, cs);

    if (b.shapeSides > 0) {
        sCtx.rotate(b.facingAngle);
    }

    const _bScratchMapped = _roundFill(b);
    const bScratchColor = b.damageOverlay > 0 ? mixColorToWhite(_bScratchMapped, b.damageOverlay) : _bScratchMapped;
    sCtx.fillStyle = bScratchColor;
    sCtx.strokeStyle = darkenColor(bScratchColor, 0.598);
    sCtx.lineWidth = strokeWidth;

    sCtx.beginPath();
    if (b.shapeSides >= 3 && b.trapDepth > 0) {
        const outerR = (sz / 2) * getRealSizeFactor(b.shapeSides);
        const innerR = outerR * (1 - b.trapDepth);
        roundedStarPath(sCtx, b.shapeSides, outerR, innerR, -Math.PI / 2, b.trapCurved);
    } else if (b.shapeSides > 0) {
        const visualR = (sz / 2) * getRealSizeFactor(b.shapeSides);
        roundedPolygonPath(sCtx, b.shapeSides, visualR, roundPoly2DStart(b.shapeSides, ARRAS_PARITY.ROUND_HEADING !== 0));
    } else {
        sCtx.arc(0, 0, sz / 2, 0, Math.PI * 2);
    }
    sCtx.stroke();
    sCtx.fill();
    if (b.labyLevel > 0) {
        const ds = labyDownscale(b.shapeSides);
        if (b.shapeSides === 0) {
            for (let li = 1; li <= b.labyLevel; li++) {
                const layerR = (sz / 2) * Math.pow(ds, li);
                sCtx.beginPath();
                sCtx.arc(0, 0, layerR, 0, Math.PI * 2);
                sCtx.stroke();
                sCtx.fill();
            }
        } else {
            const outerR = (sz / 2) * getRealSizeFactor(b.shapeSides);
            for (let li = 1; li <= b.labyLevel; li++) {
                const layerR = outerR * Math.pow(ds, li);
                const layerAngleOff = roundPoly2DStart(b.shapeSides, ARRAS_PARITY.ROUND_HEADING !== 0) + ((li % 2 === 0) ? 0 : Math.PI / b.shapeSides);
                sCtx.beginPath();
                roundedPolygonPath(sCtx, b.shapeSides, layerR, layerAngleOff);
                sCtx.stroke();
                sCtx.fill();
            }
        }
    }

    sCtx.restore();

    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.translate(b.position.x, b.position.y);
    targetCtx.drawImage(sc, 0, 0, scaledBuf, scaledBuf, -bufSize/2, -bufSize/2, bufSize, bufSize);
    targetCtx.restore();
}

function _drawExitingBullet(ctx: CanvasRenderingContext2D, logic: GameLogic, b: Bullet, alpha: number) {
    const needsClip = b.exitOwnerType === 2 || b.exitOwnerType === 5;

    if (needsClip) {
        const mAngle = b.exitBarrelAngle;
        const mx = b.exitBaseX + Math.cos(mAngle) * b.exitBarrelLen;
        const my = b.exitBaseY + Math.sin(mAngle) * b.exitBarrelLen;

        const perpX = Math.cos(mAngle + Math.PI * 0.5);
        const perpY = Math.sin(mAngle + Math.PI * 0.5);
        const fwdX = Math.cos(mAngle);
        const fwdY = Math.sin(mAngle);
        const FAR = 5000;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(mx + perpX * FAR, my + perpY * FAR);
        ctx.lineTo(mx - perpX * FAR, my - perpY * FAR);
        ctx.lineTo(mx - perpX * FAR + fwdX * FAR * 2, my - perpY * FAR + fwdY * FAR * 2);
        ctx.lineTo(mx + perpX * FAR + fwdX * FAR * 2, my + perpY * FAR + fwdY * FAR * 2);
        ctx.closePath();
        ctx.clip();
    }

    if ((b.subTurrets && b.subTurrets.length > 0) || (b._bulletBodyLayers !== null && b._bulletBodyLayers.length > 0)) {
        drawTurrettedBulletWithScratch(ctx, logic, b, alpha);
    } else {
        drawBulletWithScratch(ctx, logic, b, alpha);
    }

    if (needsClip) {
        ctx.restore();
    }
}

function drawTurrettedBulletWithScratch(targetCtx: CanvasRenderingContext2D, logic: GameLogic, b: Bullet, alpha: number) {
    const sz = b.size * b.growth;
    const sizePx = sz;
    const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);
    const _bvfSides = b.shapeSides >= 3 ? Math.floor(b.shapeSides) : b.shapeSides;
    const bulletVisualFactor = _bvfSides > 0 ? getRealSizeFactor(_bvfSides) : 1;

    const subTurrets = b.subTurrets || _EMPTY_SUB_TURRETS;

    const bLayers = b._bulletBodyLayers;
    const hasBodyLayers = bLayers !== null && bLayers.length > 0;
    let bOrd: BodyLayer[] | null = bLayers;
    if (SMALL_FIX.CC004 !== 0 && hasBodyLayers && bLayers!.length > 1) {
        _scratchRoundLayerBuf.length = bLayers!.length;
        for (let _li = 0; _li < bLayers!.length; _li++) _scratchRoundLayerBuf[_li] = bLayers![_li];
        _scratchRoundLayerBuf.sort(_bodyLayerCmp);
        bOrd = _scratchRoundLayerBuf;
    }

    let maxExtent = (sz / 2) * bulletVisualFactor * 1.2;
    if (hasBodyLayers) {
        for (let _li = 0; _li < bLayers!.length; _li++) {
            const _lr = bLayers![_li].sizeRatio;
            if (_lr > 1) {
                const layerExtent = (sz / 2) * _lr * 1.2;
                if (layerExtent > maxExtent) maxExtent = layerExtent;
            }
        }
    }
    for (let i = 0; i < subTurrets.length; i++) {
        const td = subTurrets[i].turretData;
        if (!td) continue;
        const isAuto = td.turretType === 'auto';
        const offsetDist = Math.sqrt((td.xOffset * sizePx / 2) * (td.xOffset * sizePx / 2) + (td.yOffset * sizePx / 2) * (td.yOffset * sizePx / 2));

        const effLen = isAuto ? (td.autoTurretLength ?? 10) : td.length;
        const barrelLen = _mapVal(effLen, 1, 100, sizePx * 0.01, sizePx / 2 + sizePx * 10);
        const turretExtent = offsetDist + barrelLen;
        if (turretExtent > maxExtent) maxExtent = turretExtent;

        if (isAuto) {
            const circleR = _mapVal(td.autoCircleSize ?? 25, 0, 50, 0, sizePx * 0.96) * 0.7;
            const circleExtent = offsetDist + circleR;
            if (circleExtent > maxExtent) maxExtent = circleExtent;

            if (td.autoSubTurrets && td.autoSubTurrets.length > 0) {
                const subSizePx = circleR * 2;
                for (let si = 0; si < td.autoSubTurrets.length; si++) {
                    const sub = td.autoSubTurrets[si];
                    const subOffDist = Math.sqrt(
                        (sub.xOffset * subSizePx / 2) * (sub.xOffset * subSizePx / 2) +
                        (sub.yOffset * subSizePx / 2) * (sub.yOffset * subSizePx / 2)
                    );
                    const subBarrelLen = _mapVal(sub.length, 1, 100, subSizePx * 0.01, subSizePx / 2 + subSizePx * 10);
                    const subTotalExtent = offsetDist + subOffDist + subBarrelLen;
                    if (subTotalExtent > maxExtent) maxExtent = subTotalExtent;
                }
            }
        }
    }
    const bufSize = Math.ceil(maxExtent * 2 + strokeWidth * 2 + 8);
    const cs = scratchScale(bufSize, _MAX_SCRATCH_PX, _currentCacheScale);
    const scaledBuf = Math.ceil(bufSize * cs);

    getScratch(bufSize, bufSize, cs);
    const sc = scratchCanvas!;
    const sCtx = scratchCtx!;

    const savedZoom = _rd.zoom;
    const savedDmg = _rd.damageOverlay, savedKick = _rd.kickSpeed;
    const savedTest = _rd.isTestMode;
    const savedBody = _rd.bodyAngle;
    const savedAim = _rd.aimAngle;
    const savedColor = _rd.color, savedColorMap = _rd.colorMap;

    _rd.zoom = logic.zoom;
    _rd.damageOverlay = b.damageOverlay; _rd.kickSpeed = roundKickSpeed(b);
    _rd.isTestMode = true;
    _rd.color = b.color; _rd.colorMap = b.colorMap;
    const bodyRotation = b.motionType === 'minion' ? b.visualAimAngle : b.facingAngle;
    _rd.bodyAngle = bodyRotation;
    _rd.aimAngle = bodyRotation;

    sCtx.save();
    sCtx.translate(scaledBuf / 2, scaledBuf / 2);
    sCtx.scale(cs, cs);
    sCtx.rotate(bodyRotation);

    const sortedBSubs = _sortBulletSubs(subTurrets);

    if (hasBodyLayers) {
        for (let _li = 0; _li < bOrd!.length; _li++) {
            const _bl = bOrd![_li];
            if (_bl.renderOrder < 0) continue;
            const _blSizePx = sizePx * _bl.sizeRatio;
            const _blColorMapped = _roundLayerFill(b, _bl);
            const _blFill = b.damageOverlay > 0 ? mixColorToWhite(_blColorMapped, b.damageOverlay) : _blColorMapped;

            sCtx.save();
            const _blAngle = _bl.stationary ? -bodyRotation : _bl._currentAngle;
            sCtx.rotate(_blAngle);

            for (let _si = 0; _si < sortedBSubs.length; _si++) {
                const _st = sortedBSubs[_si];
                if (!_st.turretData || _st.turretData.aboveTankBody) continue;
                if ((_st.sourceLayerId || '') !== _bl.id) continue;
                _st.turretData.animProgress = MOTION_ARRAS.RECOIL ? _st.kick : _st.animProgress;
                _drawSingleTurret(sCtx, _blSizePx, 0, _st.turretData, undefined, undefined, _blAngle, _bl.sizeRatio, 0, 1.0);
            }

            const _blInitAngle0 = _bl.initialAngle || 0;
            const _blStroke0 = darkenColor(_blFill, 0.598);
            sCtx.fillStyle = _blFill;
            sCtx.strokeStyle = _blStroke0;
            sCtx.lineWidth = strokeWidth;
            sCtx.beginPath();
            const _blo0 = layerOutlineOf(_bl);
            if (_blo0 !== null) {
                strokeFillLayerOutline(sCtx, _blo0, _blSizePx / 2, _blInitAngle0, (_bl.copies || 1), _blStroke0, strokeWidth, _blFill);
            } else if (_bl.sides < 3) {
                sCtx.arc(0, 0, _blSizePx / 2, 0, Math.PI * 2);
            } else if ((_bl.copies || 1) > 1) {
                _strokeFillPolygonCopies(sCtx, _bl.sides, (_bl.copies || 1),
                    (_blSizePx / 2) * getRealSizeFactor(_bl.sides), _blInitAngle0,
                    _blStroke0, strokeWidth, _blFill, _bl.starDepth, _bl.starCurved);
                sCtx.beginPath();
            } else if (_bl.starDepth > 0) {
                const _blOuterR = (_blSizePx / 2) * getRealSizeFactor(_bl.sides);
                roundedStarPath(sCtx, _bl.sides, _blOuterR, _blOuterR * (1 - _bl.starDepth), _blInitAngle0, _bl.starCurved);
            } else {
                roundedPolygonPath(sCtx, _bl.sides, (_blSizePx / 2) * getRealSizeFactor(_bl.sides), _blInitAngle0);
            }
            sCtx.stroke();
            sCtx.fill();

            for (let _si = 0; _si < sortedBSubs.length; _si++) {
                const _st = sortedBSubs[_si];
                if (!_st.turretData || !_st.turretData.aboveTankBody) continue;
                if ((_st.sourceLayerId || '') !== _bl.id) continue;
                _st.turretData.animProgress = MOTION_ARRAS.RECOIL ? _st.kick : _st.animProgress;
                _drawSingleTurret(sCtx, _blSizePx, 0, _st.turretData, undefined, undefined, _blAngle, _bl.sizeRatio, 0, 1.0);
            }

            sCtx.restore();
        }
    }

    for (let i = 0; i < sortedBSubs.length; i++) {
        const td = sortedBSubs[i].turretData;
        if (!td || td.aboveTankBody) continue;
        if (hasBodyLayers && (sortedBSubs[i].sourceLayerId || '') !== '') continue;
        td.animProgress = MOTION_ARRAS.RECOIL ? sortedBSubs[i].kick : sortedBSubs[i].animProgress;
        _drawSingleTurret(sCtx, sizePx, 0, td);
    }

    const _bDroneMapped = _roundBodyFill(b);
    const bDroneColor = b.damageOverlay > 0 ? mixColorToWhite(_bDroneMapped, b.damageOverlay) : _bDroneMapped;
    sCtx.fillStyle = bDroneColor;
    sCtx.strokeStyle = darkenColor(bDroneColor, 0.598);
    sCtx.lineWidth = strokeWidth;

    const _bDrawSides = b.shapeSides >= 3 ? Math.floor(b.shapeSides) : b.shapeSides;
    if ((b._useTankBodyAngle || (ARRAS_PARITY.AIM_PICTURE !== 0 && b.motionType === 'minion')) && b.shapeSides >= 3) {
        _bulletBodyInitAngle = roundTankBodyStart(b.shapeSides);
    } else {
        _bulletBodyInitAngle = roundPoly2DStart(_bDrawSides, ARRAS_PARITY.ROUND_HEADING !== 0);
    }

    sCtx.beginPath();
    if (_bDrawSides >= 3 && b.trapDepth > 0) {
        const outerR = (sz / 2) * getRealSizeFactor(_bDrawSides);
        const innerR = outerR * (1 - b.trapDepth);
        roundedStarPath(sCtx, _bDrawSides, outerR, innerR, _bulletBodyInitAngle, b.trapCurved);
    } else if (_bDrawSides > 0) {
        const visualR = (sz / 2) * getRealSizeFactor(_bDrawSides);
        roundedPolygonPath(sCtx, _bDrawSides, visualR, _bulletBodyInitAngle);
    } else {
        sCtx.arc(0, 0, sz / 2, 0, Math.PI * 2);
    }
    sCtx.stroke();
    sCtx.fill();
    if (b.labyLevel > 0) {
        const ds = labyDownscale(_bDrawSides);
        if (_bDrawSides === 0) {
            for (let li = 1; li <= b.labyLevel; li++) {
                const layerR = (sz / 2) * Math.pow(ds, li);
                sCtx.beginPath();
                sCtx.arc(0, 0, layerR, 0, Math.PI * 2);
                sCtx.stroke();
                sCtx.fill();
            }
        } else {
            const outerR = (sz / 2) * getRealSizeFactor(_bDrawSides);
            for (let li = 1; li <= b.labyLevel; li++) {
                const layerR = outerR * Math.pow(ds, li);
                const layerAngleOff = (li % 2 === 0) ? _bulletBodyInitAngle : _bulletBodyInitAngle + Math.PI / _bDrawSides;
                sCtx.beginPath();
                roundedPolygonPath(sCtx, _bDrawSides, layerR, layerAngleOff);
                sCtx.stroke();
                sCtx.fill();
            }
        }
    }

    for (let i = 0; i < sortedBSubs.length; i++) {
        const td = sortedBSubs[i].turretData;
        if (!td || !td.aboveTankBody) continue;
        if (hasBodyLayers && (sortedBSubs[i].sourceLayerId || '') !== '') continue;
        td.animProgress = MOTION_ARRAS.RECOIL ? sortedBSubs[i].kick : sortedBSubs[i].animProgress;
        _drawSingleTurret(sCtx, sizePx, 0, td);
    }

    if (hasBodyLayers) {
        for (let _li = 0; _li < bOrd!.length; _li++) {
            const _bl = bOrd![_li];
            if (_bl.renderOrder >= 0) continue;
            const _blSizePx = sizePx * _bl.sizeRatio;
            const _blColorMapped2 = _roundLayerFill(b, _bl);
            const _blFill = b.damageOverlay > 0 ? mixColorToWhite(_blColorMapped2, b.damageOverlay) : _blColorMapped2;

            sCtx.save();
            const _blAngle = _bl.stationary ? -bodyRotation : _bl._currentAngle;
            sCtx.rotate(_blAngle);

            for (let _si = 0; _si < sortedBSubs.length; _si++) {
                const _st = sortedBSubs[_si];
                if (!_st.turretData || _st.turretData.aboveTankBody) continue;
                if ((_st.sourceLayerId || '') !== _bl.id) continue;
                _st.turretData.animProgress = MOTION_ARRAS.RECOIL ? _st.kick : _st.animProgress;
                _drawSingleTurret(sCtx, _blSizePx, 0, _st.turretData, undefined, undefined, _blAngle, _bl.sizeRatio, 0, 1.0);
            }

            const _blInitAngle1 = _bl.initialAngle || 0;
            const _blStroke1 = darkenColor(_blFill, 0.598);
            sCtx.fillStyle = _blFill;
            sCtx.strokeStyle = _blStroke1;
            sCtx.lineWidth = strokeWidth;
            sCtx.beginPath();
            const _blo1 = layerOutlineOf(_bl);
            if (_blo1 !== null) {
                strokeFillLayerOutline(sCtx, _blo1, _blSizePx / 2, _blInitAngle1, (_bl.copies || 1), _blStroke1, strokeWidth, _blFill);
            } else if (_bl.sides < 3) {
                sCtx.arc(0, 0, _blSizePx / 2, 0, Math.PI * 2);
            } else if ((_bl.copies || 1) > 1) {
                _strokeFillPolygonCopies(sCtx, _bl.sides, (_bl.copies || 1),
                    (_blSizePx / 2) * getRealSizeFactor(_bl.sides), _blInitAngle1,
                    _blStroke1, strokeWidth, _blFill, _bl.starDepth, _bl.starCurved);
                sCtx.beginPath();
            } else if (_bl.starDepth > 0) {
                const _blOuterR = (_blSizePx / 2) * getRealSizeFactor(_bl.sides);
                roundedStarPath(sCtx, _bl.sides, _blOuterR, _blOuterR * (1 - _bl.starDepth), _blInitAngle1, _bl.starCurved);
            } else {
                roundedPolygonPath(sCtx, _bl.sides, (_blSizePx / 2) * getRealSizeFactor(_bl.sides), _blInitAngle1);
            }
            sCtx.stroke();
            sCtx.fill();

            for (let _si = 0; _si < sortedBSubs.length; _si++) {
                const _st = sortedBSubs[_si];
                if (!_st.turretData || !_st.turretData.aboveTankBody) continue;
                if ((_st.sourceLayerId || '') !== _bl.id) continue;
                _st.turretData.animProgress = MOTION_ARRAS.RECOIL ? _st.kick : _st.animProgress;
                _drawSingleTurret(sCtx, _blSizePx, 0, _st.turretData, undefined, undefined, _blAngle, _bl.sizeRatio, 0, 1.0);
            }

            sCtx.restore();
        }
    }

    sCtx.restore();

    _rd.zoom = savedZoom;
    _rd.damageOverlay = savedDmg; _rd.kickSpeed = savedKick;
    _rd.isTestMode = savedTest;
    _rd.bodyAngle = savedBody;
    _rd.aimAngle = savedAim;
    _rd.color = savedColor; _rd.colorMap = savedColorMap;

    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.translate(b.position.x, b.position.y);
    targetCtx.drawImage(sc, 0, 0, scaledBuf, scaledBuf, -bufSize / 2, -bufSize / 2, bufSize, bufSize);
    targetCtx.restore();
}

function _worldColorsOfFrame(logic: GameLogic, frame: number): void {
    updateWorldAnimatedColors(frame, logic.gameNow());
}

function _drawSolid(c: CanvasRenderingContext2D, solid: ArrasSolid, wx: number, wy: number, r: number, fill: string, stroke: string, borderWidth: number): void {
    c.beginPath();
    solidPath(c, solid, wx, wy, 0, 0, r);
    c.fillStyle = fill;
    c.fill();
    c.lineJoin = 'round';
    c.lineWidth = borderWidth * SOLID_STROKE_OF_BORDER;
    c.strokeStyle = stroke;
    c.stroke();
}

function drawPolygonWithScratch(targetCtx: CanvasRenderingContext2D, logic: GameLogic, poly: FloatingPolygon, alpha: number) {
    const sz = poly.size * poly.growth;
    if (poly.isPolyhedron && alpha >= 0.99) {
        targetCtx.save();
        targetCtx.translate(poly.position.x, poly.position.y);
        drawPolygonShape(targetCtx, logic, poly, 1.0);
        targetCtx.restore();
        return;
    }
    const visualDiameter = poly.isPolyhedron ? sz * polyhedronExtent(poly.polyhedronType) : poly.look !== null ? sz * Math.max(1, poly.look.reach) : sz * getRealSizeFactor(poly.baseSides);
    const maxStroke = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);
    const bufSize = Math.ceil(visualDiameter + maxStroke * 2 + 20);

    if (bufSize > _MAX_SCRATCH_PX) {
        targetCtx.save();
        targetCtx.translate(poly.position.x, poly.position.y);
        targetCtx.globalAlpha = alpha;
        if (!poly.isPolyhedron) targetCtx.rotate(poly.rotation);
        drawPolygonShape(targetCtx, logic, poly, 1.0);
        targetCtx.restore();
        return;
    }

    const cs = Math.min(_currentCacheScale, Math.max(1, Math.floor(_MAX_SCRATCH_PX / bufSize)));
    const scaledBuf = Math.ceil(bufSize * cs);
    getScratch(bufSize, bufSize, cs);
    const sc = scratchCanvas!;
    const sCtx = scratchCtx!;

    sCtx.save();
    sCtx.translate(scaledBuf / 2, scaledBuf / 2);
    sCtx.scale(cs, cs);
    if (!poly.isPolyhedron) sCtx.rotate(poly.rotation);
    drawPolygonShape(sCtx, logic, poly, 1.0);

    sCtx.restore();

    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.translate(poly.position.x, poly.position.y);
    targetCtx.drawImage(sc, 0, 0, scaledBuf, scaledBuf, -bufSize/2, -bufSize/2, bufSize, bufSize);
    targetCtx.restore();
}

function drawPolygonShape(ctx: CanvasRenderingContext2D, logic: GameLogic, poly: FloatingPolygon, forceAlpha: number) {
    const sz = poly.size * poly.growth;
    const halfSz = sz / 2;
    const sides = poly.baseSides;

    let baseCol = shapeFill(poly.color, poly.colorMap, poly.isCrasher);
    if (poly.isAnimatedColor) {
        baseCol = getWorldAnimatedColor(poly.animationType, _isDarkMode);
    }
    const col = poly.damageOverlay > 0 ? mixColorToWhite(baseCol, poly.damageOverlay) : baseCol;
    const strokeCol = darkenColor(col, 0.598);

    const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);
    ctx.lineWidth = strokeWidth;

    if (poly.look !== null) {
        _look2dFlash = poly.damageOverlay;
        _look2dWorn = _wornFillOf(poly, logic);
        drawOtherList(ctx, poly.look.list, 0, 0, sz, 0, 0, strokeWidth, _look2dFill, _look2dLine);
        _look2dFlash = 0; _look2dWorn = '';
        return;
    }

    if (poly.isPolyhedron) {
        const solid = solidOf(poly.polyhedronType);
        if (solid !== undefined) {
            _drawSolid(ctx, solid, poly.position.x, poly.position.y, halfSz, col, strokeCol, strokeWidth);
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, halfSz, 0, Math.PI * 2);
            ctx.strokeStyle = strokeCol;
            ctx.stroke();
            ctx.fillStyle = col;
            ctx.fill();
        }
    } else {
        ctx.beginPath();
        if (sides === 0) {
            ctx.arc(0, 0, halfSz, 0, Math.PI * 2);
        } else {
            const visualR = halfSz * getRealSizeFactor(sides);
            const angleOff = polyAngleOffset(sides);
            roundedPolygonPath(ctx, sides, visualR, angleOff);
        }
        ctx.strokeStyle = strokeCol;
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.fill();

        if (poly.labyLevel > 0) {
            const ds = labyDownscale(sides);
            if (sides === 0) {
                for (let li = 1; li <= poly.labyLevel; li++) {
                    const layerR = halfSz * Math.pow(ds, li);
                    ctx.beginPath();
                    ctx.arc(0, 0, layerR, 0, Math.PI * 2);
                    ctx.strokeStyle = strokeCol;
                    ctx.stroke();
                    ctx.fillStyle = col;
                    ctx.fill();
                }
            } else {
                const outerR = halfSz * getRealSizeFactor(sides);
                for (let li = 1; li <= poly.labyLevel; li++) {
                    const layerR = outerR * Math.pow(ds, li);
                    const layerAngleOff = (li % 2 === 0) ? polyAngleOffset(sides) : polyAngleOffset(sides) + Math.PI / sides;
                    ctx.beginPath();
                    roundedPolygonPath(ctx, sides, layerR, layerAngleOff);
                    ctx.strokeStyle = strokeCol;
                    ctx.stroke();
                    ctx.fillStyle = col;
                    ctx.fill();
                }
            }
        }
    }

}

let _spvDesign: FoodShapeDesign | null = null;
let _spvLookSrc: FoodShapeDesign['look'] | null = null;
let _spvLook: ShapeLook | null = null;
let _spvColor = '';
let _spvDark = false;
let _spvFill = '';
let _spvStroke = '';

function _drawEditorShapeGeometry(ctx: CanvasRenderingContext2D, sides: number, halfSz: number, labyLevel: number, fill: string, stroke: string, strokeWidth: number, polyType: string) {
    if (polyType !== '') {
        const solid = solidOf(polyType);
        if (solid !== undefined) {
            _drawSolid(ctx, solid, SOLID_STILL_X, SOLID_STILL_Y, halfSz, fill, stroke, strokeWidth);
            return;
        }
        sides = 0;
        labyLevel = 0;
    }
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    if (sides === 0) {
        ctx.arc(0, 0, halfSz, 0, Math.PI * 2);
    } else {
        roundedPolygonPath(ctx, sides, halfSz * getRealSizeFactor(sides), polyAngleOffset(sides));
    }
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();

    if (labyLevel > 0) {
        const ds = labyDownscale(sides);
        if (sides === 0) {
            for (let li = 1; li <= labyLevel; li++) {
                const layerR = halfSz * Math.pow(ds, li);
                ctx.beginPath();
                ctx.arc(0, 0, layerR, 0, Math.PI * 2);
                ctx.strokeStyle = stroke;
                ctx.stroke();
                ctx.fillStyle = fill;
                ctx.fill();
            }
        } else {
            const outerR = halfSz * getRealSizeFactor(sides);
            for (let li = 1; li <= labyLevel; li++) {
                const layerR = outerR * Math.pow(ds, li);
                const layerAngleOff = (li % 2 === 0) ? polyAngleOffset(sides) : polyAngleOffset(sides) + Math.PI / sides;
                ctx.beginPath();
                roundedPolygonPath(ctx, sides, layerR, layerAngleOff);
                ctx.strokeStyle = stroke;
                ctx.stroke();
                ctx.fillStyle = fill;
                ctx.fill();
            }
        }
    }
}

function _drawEditorShapePreview(ctx: CanvasRenderingContext2D, logic: GameLogic) {
    const d = logic.state.editingShape;
    if (d === null) return;
    const rm = RARITY_MULTIPLIERS[d.rarity];

    let fill: string;
    let stroke: string;
    if (rm !== undefined && rm.isAnimatedColor) {
        updateAnimatedColors(_shapeCacheFrame);
        fill = getAnimatedColor(rm.animationType, isGameDark());
        stroke = darkenColor(fill, 0.598);
    } else {
        const dark = isGameDark();
        if (d !== _spvDesign || d.color !== _spvColor || dark !== _spvDark) {
            _spvDesign = d;
            _spvColor = d.color;
            _spvDark = dark;
            _spvFill = shapeFill(effectiveShapeColor(d), effectiveShapeColorMap(d), d.isCrasher === true);
            _spvStroke = darkenColor(_spvFill, 0.598);
        }
        fill = _spvFill;
        stroke = _spvStroke;
    }

    const alpha = rm !== undefined ? rm.opacity : 1;
    const polyType = d.polyhedronType !== undefined && d.polyhedronType !== null ? d.polyhedronType : '';
    const sides = polyType !== '' ? 0 : d.sides >= 3 ? (d.sides | 0) : 0;
    const halfSz = d.size / 2;
    const labyLevel = polyType !== '' ? 0 : d.labyLevel;
    const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);
    const px = logic.tankPos.x;
    const py = logic.tankPos.y;

    if (d.look !== undefined) {
        if (d.look !== _spvLookSrc) { _spvLookSrc = d.look; _spvLook = makeShapeLook(d.look); }
        if (_spvLook !== null) {
            const facing = sides >= 3 && sides % 2 === 1 ? -Math.PI / 2 : 0;
            ctx.save();
            ctx.translate(px, py);
            _look2dFlash = 0;
            drawOtherList(ctx, _spvLook.list, 0, 0, d.size, facing, facing, strokeWidth, _look2dFill, _look2dLine);
            ctx.restore();
            return;
        }
    }

    if (alpha >= 0.99) {
        ctx.save();
        ctx.translate(px, py);
        _drawEditorShapeGeometry(ctx, sides, halfSz, labyLevel, fill, stroke, strokeWidth, polyType);
        ctx.restore();
        return;
    }

    const visualDiameter = polyType !== '' ? d.size * polyhedronExtent(polyType) : d.size * getRealSizeFactor(sides);
    const bufSize = Math.ceil(visualDiameter + strokeWidth * 2 + 20);
    if (bufSize > _MAX_SCRATCH_PX) {
        ctx.save();
        ctx.translate(px, py);
        ctx.globalAlpha = alpha;
        _drawEditorShapeGeometry(ctx, sides, halfSz, labyLevel, fill, stroke, strokeWidth, polyType);
        ctx.restore();
        return;
    }
    const cs = Math.min(_currentCacheScale, Math.max(1, Math.floor(_MAX_SCRATCH_PX / bufSize)));
    const scaledBuf = Math.ceil(bufSize * cs);
    getScratch(bufSize, bufSize, cs);
    const sc = scratchCanvas!;
    const sCtx = scratchCtx!;

    sCtx.save();
    sCtx.translate(scaledBuf / 2, scaledBuf / 2);
    sCtx.scale(cs, cs);
    _drawEditorShapeGeometry(sCtx, sides, halfSz, labyLevel, fill, stroke, strokeWidth, polyType);
    sCtx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    ctx.drawImage(sc, 0, 0, scaledBuf, scaledBuf, -bufSize / 2, -bufSize / 2, bufSize, bufSize);
    ctx.restore();
}

const OTHER_VIEW_MIN_WIDTH = 90;
const _otherFillOf = (color: string, map: number): string => bodyFill(color, map);
const _otherLineOf = (fill: string): string => darkenColor(fill, 0.598);
function _drawEditorOtherView(ctx: CanvasRenderingContext2D, logic: GameLogic) {
    const d = logic.state.viewingOther;
    if (d === null) return;
    const width = d.size < OTHER_VIEW_MIN_WIDTH ? OTHER_VIEW_MIN_WIDTH : d.size;
    const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);
    drawOtherDesign(ctx, d, logic.tankPos.x, logic.tankPos.y, width, 0, strokeWidth, _otherFillOf, _otherLineOf);
}

function drawTankWithScratch(targetCtx: CanvasRenderingContext2D, scale: number, alpha: number, passes = _PASS_ALL) {
    const sizePx = _rd.sizePx;

    const turrets = _rd.turrets;
    let maxTurretLen = sizePx;
    const _scratchLayers = _rd.bodyLayers;
    if (_scratchLayers) {
        for (let i = 0; i < _scratchLayers.length; i++) {
            const layerExtent = sizePx * _scratchLayers[i].sizeRatio;
            if (layerExtent > maxTurretLen) maxTurretLen = layerExtent;
        }
    }
    if (turrets) {
        for (let i = 0; i < turrets.length; i++) {
            const t = turrets[i];
            const isAuto = t.turretType === 'auto';
            const off = Math.sqrt(t.xOffset * t.xOffset + t.yOffset * t.yOffset) * sizePx / 2;

            const effLen = isAuto ? (t.autoTurretLength ?? 10) : t.length;
            const tLen = _mapVal(effLen, 1, 100, sizePx / 2, sizePx / 2 + sizePx * 10);
            const totalExtent = off + tLen;
            if (totalExtent > maxTurretLen) maxTurretLen = totalExtent;
            if (isAuto) {
                const circleR = _mapVal(t.autoCircleSize ?? 25, 0, 50, 0, sizePx * 0.96) * 0.7;
                const circleExtent = off + circleR;
                if (circleExtent > maxTurretLen) maxTurretLen = circleExtent;
            }
        }
    }
    const maxStroke = Math.max(MIN_STROKE_SCREEN_PX / _rd.zoom, FIXED_STROKE_WIDTH);
    const bufSize = Math.ceil((maxTurretLen * scale) * 2.2 + maxStroke * 2);

    if (bufSize > _MAX_SCRATCH_PX) {
        targetCtx.save();
        targetCtx.translate(_rd.posX, _rd.posY);
        targetCtx.rotate(_rd.bodyAngle);
        targetCtx.scale(scale, scale);
        targetCtx.globalAlpha = alpha;
        drawTankAndTurrets(targetCtx, true, passes);
        targetCtx.restore();
        return;
    }

    const cs = Math.min(_currentCacheScale, Math.max(1, Math.floor(_MAX_SCRATCH_PX / bufSize)));
    const scaledBuf = Math.ceil(bufSize * cs);

    getScratch(bufSize, bufSize, cs);
    const sc = scratchCanvas!;
    const sCtx = scratchCtx!;

    sCtx.save();
    sCtx.translate(scaledBuf / 2, scaledBuf / 2);
    sCtx.scale(cs * scale, cs * scale);
    drawTankAndTurrets(sCtx, true, passes);
    sCtx.restore();

    targetCtx.save();
    targetCtx.globalAlpha = alpha;
    targetCtx.translate(_rd.posX, _rd.posY);
    targetCtx.rotate(_rd.bodyAngle);

    targetCtx.drawImage(sc, 0, 0, scaledBuf, scaledBuf, -bufSize / 2, -bufSize / 2, bufSize, bufSize);
    targetCtx.restore();
}

let _lastSortedTurretsRef: any[] | null = null;
let _lastSortedTurretsLen = 0;
function _sortTurrets(turrets: any[]): any[] {
    const len = turrets.length;
    _lastSortedTurretsRef = turrets;
    _lastSortedTurretsLen = len;
    _turretSortBuf.length = len;
    for (let i = 0; i < len; i++) _turretSortBuf[i] = turrets[i];
    _turretSortBuf.sort(_turretLayerCmp);
    return _turretSortBuf;
}

function _sortSubTurrets(turrets: any[]): any[] {
    const len = turrets.length;
    _subTurretSortBuf.length = len;
    for (let i = 0; i < len; i++) _subTurretSortBuf[i] = turrets[i];
    _subTurretSortBuf.sort(_turretLayerCmp);
    return _subTurretSortBuf;
}

function _sortBulletSubs(subs: any[]): any[] {
    const len = subs.length;
    _bulletSubSortBuf.length = len;
    for (let i = 0; i < len; i++) _bulletSubSortBuf[i] = subs[i];
    _bulletSubSortBuf.sort(_bulletSubCmp);
    return _bulletSubSortBuf;
}

let _lookHostSizePx = 0;
let _lookFlash = 0;
let _lookAnimFill = '';
const _lookFillOf2D = (color: string, map: number): string => {
    const f = _lookAnimFill !== '' ? _lookAnimFill : bodyFill(color, map);
    return _lookFlash > 0 ? mixColorToWhite(f, _lookFlash) : f;
};
const _lookLineSel = (): string => (_isDarkMode ? '#fcfcfd' : '#171718');
let _lookUnitCanvas: HTMLCanvasElement | null = null;
let _lookUnitCtx: CanvasRenderingContext2D | null = null;
const _LOOK_UNIT_MAX_PX = 2048;
function _drawLook2D(ctx: CanvasRenderingContext2D, look: PlacedLook, sizePx: number, lineWidth: number, selected: boolean, flash: number): void {
    const list = lookList(look);
    _lookFlash = flash;
    if (look.anim !== undefined) {
        if (_lookAnimLogic !== null && _lookAnimLogic.state.isTestMode) {
            _worldColorsOfFrame(_lookAnimLogic, _shapeCacheFrame);
            _lookAnimFill = getWorldAnimatedColor(look.anim, _isDarkMode);
        } else {
            updateAnimatedColors(_shapeCacheFrame);
            _lookAnimFill = getAnimatedColor(look.anim, _isDarkMode);
        }
    }
    const lineOf = selected ? _lookLineSel : _otherLineOf;
    const width = lookUnit(look, sizePx) * 2;
    const la = look.alpha;
    if (la !== undefined && la < 1) {
        const m = ctx.getTransform();
        const half = Math.ceil((lookUnit(look, sizePx) * lookReach(look) + lineWidth) * Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d))) + 2;
        if (half > 0 && half * 2 <= _LOOK_UNIT_MAX_PX) {
            const px = half * 2;
            if (_lookUnitCanvas === null) { _lookUnitCanvas = document.createElement('canvas'); _lookUnitCtx = _lookUnitCanvas.getContext('2d', { alpha: true }); }
            const c = _lookUnitCtx!;
            if (_lookUnitCanvas.width < px || _lookUnitCanvas.height < px) {
                _lookUnitCanvas.width = Math.max(_lookUnitCanvas.width, px);
                _lookUnitCanvas.height = Math.max(_lookUnitCanvas.height, px);
            } else {
                c.setTransform(1, 0, 0, 1, 0, 0);
                c.clearRect(0, 0, _lookUnitCanvas.width, _lookUnitCanvas.height);
            }
            const ox = Math.floor(m.e), oy = Math.floor(m.f);
            c.setTransform(m.a, m.b, m.c, m.d, half + (m.e - ox), half + (m.f - oy));
            drawOtherList(c, list, 0, 0, width, 0, list.rest, lineWidth, _lookFillOf2D, lineOf);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha *= la;
            ctx.drawImage(_lookUnitCanvas, 0, 0, px, px, ox - half, oy - half, px, px);
            ctx.restore();
        } else {
            ctx.save();
            ctx.globalAlpha *= la;
            drawOtherList(ctx, list, 0, 0, width, 0, list.rest, lineWidth, _lookFillOf2D, lineOf);
            ctx.restore();
        }
    } else {
        drawOtherList(ctx, list, 0, 0, width, 0, list.rest, lineWidth, _lookFillOf2D, lineOf);
    }
    _lookFlash = 0;
    _lookAnimFill = '';
}

function _drawSingleTurret(ctx: CanvasRenderingContext2D, sizePx: number, aimOffset: number, t: Turret, overrideAim?: number, parentRotation?: number, layerSpinAngle = 0, bodyScaleFactor = 1.0, positionSizePx = 0, sideCorr = 1.0) {

    ctx.save();
    const isAuto = t.turretType === 'auto';


    const widthCorr = 1.0;
    const lengthCorr = 1.0;

    const turretRotation = overrideAim !== undefined ? overrideAim : (aimOffset + t.angle);

    const posSz = positionSizePx > 0 ? positionSizePx : sizePx;

    ctx.translate(t.xOffset * posSz / 2, t.yOffset * posSz / 2);

    const hasSubTurrets = isAuto && t.autoSubTurrets && t.autoSubTurrets.length > 0;
    if (_dbg5Active && isAuto) _dbg5C2d.push(`  [C2D-T] id=${t.id} type=auto above=${t.aboveTankBody} subs=${t.autoSubTurrets?.length ?? 0} sizePx=${sizePx.toFixed(1)} posSz=${posSz.toFixed(1)} xOff=${t.xOffset} yOff=${t.yOffset} circleSize=${t.autoCircleSize ?? 25}`);

    if (isAuto) {
        ctx.save();
        if (_rd.isTestMode) {
            ctx.rotate(t.autoCurrentAngle - _rd.bodyAngle - layerSpinAngle);
        } else {
            ctx.rotate(t.angle);
        }
    } else {
        ctx.rotate((_rd.isTestMode && t.turnsLate === true && t._lateTurn !== undefined) ? turretRotation + t._lateTurn : turretRotation);
    }

    if (hasSubTurrets) {
        const circleR = _mapVal(t.autoCircleSize ?? 25, 0, 50, 0, sizePx * 0.96) * 0.7;
        const subSizePx = circleR * 2;

        ctx.save();
        if (!t.autoCircleHidden) {
            ctx.beginPath();
            ctx.rect(-posSz * 10, -posSz * 10, posSz * 20, posSz * 20);
            const _cbSides = t.autoCircleBaseSides ?? 0;
            if (_cbSides >= 3) {
                const _cbDepth = autoBaseDepth(_cbSides, t.autoCircleBaseDepth);
                _autoBasePath(ctx, _cbSides, _cbDepth, circleR, autoBaseTurn(_cbSides, _cbDepth) - (_rd.isTestMode ? 0 : t.angle));
            } else {
                ctx.arc(0, 0, circleR, 0, Math.PI * 2, true);
            }
            ctx.clip('evenodd');
        }

        const parentRot = _rd.isTestMode ? (t.autoCurrentAngle - _rd.bodyAngle) : t.angle;
        const sortedSubs = _sortSubTurrets(t.autoSubTurrets);
        _lookHostSizePx = sizePx;
        for (let si = 0; si < sortedSubs.length; si++) {
            const sub = sortedSubs[si];
            if (sub.aboveBase === true) continue;
            _drawSingleTurret(ctx, subSizePx, 0, sub, undefined, parentRot, 0, bodyScaleFactor);
        }
        _lookHostSizePx = 0;
        ctx.restore();
    } else if (!isAuto && t.look !== undefined) {
        const _lkSel = !_rd.isTestMode && (_rd.selectedTurretId === t.id || _inheritHighlightIds.has(t.id));
        _drawLook2D(ctx, t.look, _lookHostSizePx > 0 ? _lookHostSizePx : sizePx, Math.max(MIN_STROKE_SCREEN_PX / _rd.zoom, FIXED_STROKE_WIDTH), _lkSel, _rd.damageOverlay);
    } else if (!isAuto) {
        let recoil = 0;
        if (t.animProgress > 0) recoil = -kickPull(t.animProgress, sizePx, _rd.kickSpeed, t.knockback) * lengthCorr;
        ctx.translate(recoil, 0);

        const effLength = isAuto ? (t.autoTurretLength ?? 10) : t.length;
        const effWidth = isAuto ? (t.autoTurretWidth ?? 25) : t.width;
        const tLen = _mapVal(effLength, 1, 100, sizePx * 0.01, sizePx / 2 + sizePx * 10) * lengthCorr;
        const tWid = _mapVal(effWidth, 0, 50, 0, sizePx * 0.96) * widthCorr;
        if (_dbg5Active) _dbg5C2d.push(`  [C2D-T] id=${t.id} type=${t.turretType} above=${t.aboveTankBody} len=${tLen.toFixed(1)} wid=${tWid.toFixed(1)} sizePx=${sizePx.toFixed(1)} posSz=${posSz.toFixed(1)} angle=${turretRotation.toFixed(3)} xOff=${t.xOffset} yOff=${t.yOffset}`);
        const aspect = t.aspect;

        const topY = -tWid / 2;
        const botY = tWid / 2;
        const topScaled = topY * aspect;
        const botScaled = botY * aspect;

        ctx.beginPath();
        roundedBarrelPath(ctx, tLen, topY, botY, topScaled, botScaled);

        const _tFill = turretFill(t.color, t.colorMap);
        const barrelDispColor = _rd.damageOverlay > 0 ? mixColorToWhite(_tFill, _rd.damageOverlay) : _tFill;
        const _barrelHighlighted = !_rd.isTestMode && (_rd.selectedTurretId === t.id || _inheritHighlightIds.has(t.id));
        ctx.strokeStyle = _barrelHighlighted ? (_isDarkMode ? '#fcfcfd' : '#171718') : darkenColor(barrelDispColor, 0.598);
        ctx.lineWidth = Math.max(MIN_STROKE_SCREEN_PX / _rd.zoom, FIXED_STROKE_WIDTH);
        ctx.stroke();
        ctx.fillStyle = barrelDispColor;
        ctx.fill();

    }

    if (isAuto) {
        ctx.restore();

        const _baseRot = _rd.isTestMode ? (t.autoCurrentAngle - _rd.bodyAngle - layerSpinAngle) : 0;
        if (_baseRot !== 0) {
            ctx.save();
            ctx.rotate(_baseRot);
        }

        const circleR = _mapVal(t.autoCircleSize ?? 25, 0, 50, 0, sizePx * 0.96) * 0.7;
        const _abSides = t.autoCircleBaseSides ?? 0;
        if (!t.autoCircleHidden) {
            const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / _rd.zoom, FIXED_STROKE_WIDTH);
            ctx.beginPath();
            if (_abSides >= 3) {
                const _abDepth = autoBaseDepth(_abSides, t.autoCircleBaseDepth);
                _autoBasePath(ctx, _abSides, _abDepth, circleR, autoBaseTurn(_abSides, _abDepth));
            } else {
                ctx.arc(0, 0, circleR, 0, Math.PI * 2);
            }
            const circleBaseColor = t.autoCircleColorMatch ? _rd.color : turretFill(t.color, t.colorMap);
            const circleDispColor = _rd.damageOverlay > 0 ? mixColorToWhite(circleBaseColor, _rd.damageOverlay) : circleBaseColor;
            const _circleHighlighted = !_rd.isTestMode && (_rd.selectedTurretId === t.id || _inheritHighlightIds.has(t.id));
            ctx.strokeStyle = _circleHighlighted ? (_isDarkMode ? '#fcfcfd' : '#171718') : darkenColor(circleDispColor, 0.598);
            ctx.lineWidth = strokeWidth;
            ctx.stroke();
            ctx.fillStyle = circleDispColor;
            ctx.fill();
        }

        if (t.autoCircleHealer && !t.autoCircleHidden) {
            _drawHealerCross(ctx, circleR * 2);
        }

        if (_baseRot !== 0) {
            ctx.restore();
        }

        if (hasSubTurrets) {
            let _anyAbove2D = false;
            for (let si = 0; si < t.autoSubTurrets.length; si++) if (t.autoSubTurrets[si].aboveBase === true) { _anyAbove2D = true; break; }
            if (_anyAbove2D) {
                ctx.save();
                ctx.rotate(_rd.isTestMode ? (t.autoCurrentAngle - _rd.bodyAngle - layerSpinAngle) : t.angle);
                const parentRot = _rd.isTestMode ? (t.autoCurrentAngle - _rd.bodyAngle) : t.angle;
                const sortedSubs = _sortSubTurrets(t.autoSubTurrets);
                _lookHostSizePx = sizePx;
                for (let si = 0; si < sortedSubs.length; si++) {
                    const sub = sortedSubs[si];
                    if (sub.aboveBase !== true) continue;
                    _drawSingleTurret(ctx, circleR * 2, 0, sub, undefined, parentRot, 0, bodyScaleFactor);
                }
                _lookHostSizePx = 0;
                ctx.restore();
            }
        }
    }

    ctx.restore();
}

function _drawHealerCross(ctx: CanvasRenderingContext2D, sizePx: number) {
    const r = _HEALER_CROSS_SCALE * sizePx;
    ctx.beginPath();
    ctx.moveTo(_HEALER_CROSS_X[0] * r, _HEALER_CROSS_Y[0] * r);
    for (let i = 1; i < 12; i++) ctx.lineTo(_HEALER_CROSS_X[i] * r, _HEALER_CROSS_Y[i] * r);
    ctx.closePath();
    ctx.fillStyle = healerCrossFill();
    ctx.strokeStyle = darkenColor(healerCrossFill(), 0.598);
    ctx.lineWidth = Math.max(MIN_STROKE_SCREEN_PX / _rd.zoom, FIXED_STROKE_WIDTH) * 0.7;
    ctx.stroke();
    ctx.fill();
}

function _drawBodyPath(ctx: CanvasRenderingContext2D, sizePx: number) {
    const half = sizePx / 2;
    if (_rd.sides < 3) {
        ctx.beginPath();
        ctx.arc(0, 0, half, 0, Math.PI * 2);
        ctx.closePath();
    } else {
        const intSides = Math.floor(_rd.sides);
        const fracRotation = (_rd.sides % 1) * Math.PI * 2;
        const visualHalf = half * getRealSizeFactor(intSides);
        const evenOff = (intSides >= 4 && intSides % 2 === 0) ? -Math.PI / intSides : 0;
        ctx.beginPath();
        if (_rd.shapeDepth > 0) {
            const innerR = visualHalf * (1 - _rd.shapeDepth);
            roundedStarPath(ctx, intSides, visualHalf, innerR, evenOff + fracRotation, _rd.shapeCurved);
        } else {
            roundedPolygonPath(ctx, intSides, visualHalf, evenOff + fracRotation);
        }
    }
}

function _buildTurretLayerFlags(turrets: Turret[], layers: BodyLayer[] | null) {
    if (_turretOnLayerFlags.length < turrets.length) {
      _turretOnLayerFlags = new Uint8Array(Math.max(turrets.length, 64));
      _turretLayerOrder = new Int8Array(Math.max(turrets.length, 64));
      _turretLayerRef = new Array(Math.max(turrets.length, 64)).fill(null);
    }
    _turretOnLayerFlags.fill(0, 0, turrets.length);
    _turretLayerOrder.fill(-128, 0, turrets.length);
    _turretLayerRef.fill(null, 0, turrets.length);
    if (!layers) return;
    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const ids = layer.turretIds;
      const order = layer.renderOrder;
      for (let ii = 0; ii < ids.length; ii++) {
        for (let ti = 0; ti < turrets.length; ti++) {
          if (turrets[ti].id === ids[ii]) {
            _turretOnLayerFlags[ti] = 1;
            _turretLayerOrder[ti] = order;
            _turretLayerRef[ti] = layer;
            break;
          }
        }
      }
    }
}

function _drawBodyLayers(ctx: CanvasRenderingContext2D, sizePx: number, turrets: Turret[], aboveBody = false) {
    const layers = _rd.bodyLayers;
    if (!layers || layers.length === 0) return;

    _bodyLayerSortBuf.length = layers.length;
    for (let i = 0; i < layers.length; i++) _bodyLayerSortBuf[i] = layers[i];
    if (layers.length > 1) _bodyLayerSortBuf.sort(_bodyLayerCmp);

    for (let li = 0; li < _bodyLayerSortBuf.length; li++) {
        const layer = _bodyLayerSortBuf[li];

        if (aboveBody ? layer.renderOrder >= 0 : layer.renderOrder < 0) continue;

        const layerSizePx = sizePx * layer.sizeRatio;
        const layerHalf = layerSizePx / 2;
        const layerColor = _layerFill(layer);
        const sideCorr = computeSideCorr(layer.sides, _rd.sides);
        if (_dbg5Active) {
            let _abC = 0, _blC = 0;
            for (let _di = 0; _di < turrets.length; _di++) {
                if (_turretLayerRef[_di] !== layer) continue;
                if (turrets[_di].aboveTankBody) _abC++; else _blC++;
            }
            _dbg5C2d.push(`[C2D-LAYER] id=${layer.id} order=${layer.renderOrder} sides=${layer.sides} ratio=${layer.sizeRatio} layerSizePx=${layerSizePx.toFixed(1)} above=${_abC} below=${_blC} (aboveBody=${aboveBody})`);
        }

        ctx.save();
        const effectiveAngle = layer.stationary ? -_rd.bodyAngle : layer._currentAngle;
        ctx.rotate(effectiveAngle);

        if (_hasLayerBullets && _layerBulletRender.enabled) {
            _renderLayerBulletsForOrder(ctx, layer.renderOrder, layer.id);
        }

        const _barrelEffSizePx = layerSizePx;
        for (let ti = 0; ti < turrets.length; ti++) {
            if (turrets[ti].aboveTankBody || _turretLayerRef[ti] !== layer) continue;
            const _turretEffSizePx = turrets[ti].turretType === 'auto' ? layerSizePx : _barrelEffSizePx;
            _drawSingleTurret(ctx, _turretEffSizePx, 0, turrets[ti], undefined, undefined, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0);
        }

        if (_previewInjectLayerId && layer.id === _previewInjectLayerId && _previewInjectLogic) {
            ctx.save();
            ctx.rotate(-effectiveAngle);
            drawPreviewTurret(ctx, _previewInjectLogic, 'below', true);
            drawPresetPreview(ctx, _previewInjectLogic, 'below', true);
            ctx.restore();
        }

        if (!_rd.showTurretsOnly) {
        const bodyDispColor = _rd.damageOverlay > 0 ? mixColorToWhite(layerColor, _rd.damageOverlay) : layerColor;
        const _layerInitAngle = layer.initialAngle || 0;
        ctx.lineJoin = 'round';
        const _lyOutline = layerOutlineOf(layer);
        if (_lyOutline !== null && layer.copies > 1) {
            const _loStroke = darkenColor(bodyDispColor, 0.598);
            strokeFillLayerOutline(ctx, _lyOutline, layerHalf, _layerInitAngle, layer.copies, _rd.pickedBody === layer.id ? _lookLineSel() : _loStroke,
                Math.max(MIN_STROKE_SCREEN_PX / _rd.zoom, FIXED_STROKE_WIDTH), (_isDarkMode && layer.intangible) ? _loStroke : bodyDispColor);
        } else if (_lyOutline !== null) {
            traceLayerOutline(ctx, _lyOutline, 0, 0, layerHalf, _layerInitAngle);
        } else if (layer.sides < 3) {
            ctx.beginPath();
            ctx.arc(0, 0, layerHalf, 0, Math.PI * 2);
            ctx.closePath();
        } else {
            const visualHalf = layerHalf * getRealSizeFactor(layer.sides);
            ctx.beginPath();
            if (layer.copies > 1) {
                const _cpStroke = _rd.pickedBody === layer.id ? (_isDarkMode ? '#fcfcfd' : '#171718') : darkenColor(bodyDispColor, 0.598);
                _strokeFillPolygonCopies(ctx, layer.sides, layer.copies, visualHalf, _layerInitAngle,
                    _cpStroke, Math.max(MIN_STROKE_SCREEN_PX / _rd.zoom, FIXED_STROKE_WIDTH),
                    (_isDarkMode && layer.intangible) ? (SMALL_FIX.CC003 !== 0 ? darkenColor(bodyDispColor, 0.598) : _cpStroke) : bodyDispColor,
                    layer.starDepth, layer.starCurved);
                ctx.beginPath();
            } else if (layer.starDepth > 0) {
                const innerR = visualHalf * (1 - layer.starDepth);
                roundedStarPath(ctx, layer.sides, visualHalf, innerR, _layerInitAngle, layer.starCurved);
            } else {
                roundedPolygonPath(ctx, layer.sides, visualHalf, _layerInitAngle);
            }
        }
        const _layerStroke = darkenColor(bodyDispColor, 0.598);
        ctx.strokeStyle = _rd.pickedBody === layer.id ? (_isDarkMode ? '#fcfcfd' : '#171718') : _layerStroke;
        ctx.lineWidth = Math.max(MIN_STROKE_SCREEN_PX / _rd.zoom, FIXED_STROKE_WIDTH);
        ctx.stroke();
        ctx.fillStyle = (_isDarkMode && layer.intangible) ? _layerStroke : bodyDispColor;
        ctx.fill();

        if (layer.showHealerCross) {
            _drawHealerCross(ctx, layerSizePx);
        }
        }
        if (_hasLayerBullets && _layerBulletRender.enabled) {
            _renderLayerBulletsForOrder(ctx, layer.renderOrder, layer.id, 1);
        }

        for (let ti = 0; ti < turrets.length; ti++) {
            if (!turrets[ti].aboveTankBody || _turretLayerRef[ti] !== layer) continue;
            const _turretEffSizePx = turrets[ti].turretType === 'auto' ? layerSizePx : _barrelEffSizePx;
            _drawSingleTurret(ctx, _turretEffSizePx, 0, turrets[ti], undefined, undefined, effectiveAngle, layer.sizeRatio, layerSizePx, 1.0);
        }

        if (_previewInjectLayerId && layer.id === _previewInjectLayerId && _previewInjectLogic) {
            ctx.save();
            ctx.rotate(-effectiveAngle);
            drawPreviewTurret(ctx, _previewInjectLogic, 'above', true);
            drawPresetPreview(ctx, _previewInjectLogic, 'above', true);
            ctx.restore();
        }

        ctx.restore();
    }
}


function _fovArcDrawn(t: Pick<Turret, 'autoSubTurrets' | 'primarySubTurretId'>): boolean {
    if (SMALL_FIX.R146E === 0) return true;
    const subs = t.autoSubTurrets;
    if (!t.primarySubTurretId || !subs) return false;
    for (let i = 0; i < subs.length; i++) if (subs[i].id === t.primarySubTurretId) return true;
    return false;
}
function _fovArcRadius(logic: GameLogic | null, t: Pick<Turret, 'fovSize' | 'autoSubTurrets' | 'primarySubTurretId'>): number {
    return logic ? logic.playerAutoTurretRange(t) : ((t.fovSize ?? 10) / 10) * AUTO_FOV_BASE_RANGE;
}
function _drawTurretRangeOverlays(ctx: CanvasRenderingContext2D, sizePx: number, turrets: Turret[]): void {
    const _fadeDt = 1 / 60;
    const _overlayTurretId = _rd.selectedAutoParentId || _rd.selectedTurretId;

    for (let i = 0; i < turrets.length; i++) {
        const t = turrets[i];
        if (!_overlayTurretId || t.id !== _overlayTurretId) continue;
        let _wifiOn = !!t.wifiRange;
        let _wifiVal = t.wifiRangeValue ?? 50;
        if (!_wifiOn && t.turretType === 'auto' && t.autoSubTurrets && _rd.selectedTurretId) {
            for (let si = 0; si < t.autoSubTurrets.length; si++) {
                const sub = t.autoSubTurrets[si];
                if (sub.id === _rd.selectedTurretId && sub.wifiRange) {
                    _wifiOn = true;
                    _wifiVal = sub.wifiRangeValue ?? 50;
                    break;
                }
            }
        }
        if (!_wifiOn || _wifiVal <= 0) continue;
        const wifiR = (_wifiVal / 100) * WIFI_RANGE_MAX;
        const wifiKey = t._wifiKey || (t._wifiKey = `wifi-${t.id || i}`);
        const wifiVal = `${_wifiOn ? 1 : 0}-${_wifiVal}`;
        const wifiAlpha = _getOverlayAlpha(wifiKey, wifiVal, 0.12, _fadeDt);
        if (wifiAlpha < 0.001) continue;

        if (_edTankGL !== null) _edOverlayBreak();
        ctx.save();
        ctx.rotate(-_rd.bodyAngle);
        ctx.globalAlpha = wifiAlpha;
        ctx.fillStyle = '#44dd88';
        ctx.beginPath();
        ctx.arc(0, 0, wifiR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.min(wifiAlpha * 2.5, 0.3);
        ctx.strokeStyle = '#44dd88';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    if (_rd.editingTurret && !_overlayTurretId) {
        const et = _rd.editingTurret;
        let _etWifiOn = !!et.wifiRange;
        let _etWifiVal = et.wifiRangeValue ?? 50;
        if (_etWifiOn && _etWifiVal > 0) {
            const etWifiR = (_etWifiVal / 100) * WIFI_RANGE_MAX;
            const etWifiKey = 'wifi-editing';
            const etWifiValStr = `${_etWifiOn ? 1 : 0}-${_etWifiVal}`;
            const etWifiAlpha = _getOverlayAlpha(etWifiKey, etWifiValStr, 0.12, _fadeDt);
            if (etWifiAlpha >= 0.001) {
                if (_edTankGL !== null) _edOverlayBreak();
                ctx.save();
                ctx.rotate(-_rd.bodyAngle);
                ctx.globalAlpha = etWifiAlpha;
                ctx.fillStyle = '#44dd88';
                ctx.beginPath();
                ctx.arc(0, 0, etWifiR, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = Math.min(etWifiAlpha * 2.5, 0.3);
                ctx.strokeStyle = '#44dd88';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.globalAlpha = 1;
                ctx.restore();
            }
        }
    }

    for (let i = 0; i < turrets.length; i++) {
        const t = turrets[i];
        if (!_overlayTurretId || t.id !== _overlayTurretId) continue;
        const fovDeg = t.fov ?? 200;
        const fovSizeVal = t.fovSize ?? 10;
        if (t.turretType !== 'auto' || fovDeg <= 0 || fovSizeVal <= 0) continue;

        let fovPrimaryOffset = 0;
        if (!t.primarySubTurretId || !t.autoSubTurrets || t.autoSubTurrets.length === 0) continue;
        for (let si = 0; si < t.autoSubTurrets.length; si++) {
            if (t.autoSubTurrets[si].id === t.primarySubTurretId) {
                fovPrimaryOffset = t.autoSubTurrets[si].angle;
                break;
            }
        }

        const fovKey = t._fovKey || (t._fovKey = `fov-${t.id || i}`);
        const fovVal = `${fovDeg}-${fovSizeVal}`;
        const fovAlpha = _getOverlayAlpha(fovKey, fovVal, 0.15, _fadeDt);
        if (fovAlpha < 0.001) continue;

        if (_edTankGL !== null) _edOverlayBreak();
        ctx.save();
        ctx.translate(t.xOffset * sizePx / 2, t.yOffset * sizePx / 2);
        ctx.rotate(t.angle + fovPrimaryOffset);

        const arcRadius = _fovArcRadius(_layerBulletRender.logic, t);

        ctx.globalAlpha = fovAlpha;
        ctx.fillStyle = '#ffdd44';
        ctx.beginPath();
        if (fovDeg >= 360) {
            ctx.arc(0, 0, arcRadius, 0, Math.PI * 2);
        } else {
            const fovHalf = (fovDeg * Math.PI / 180) / 2;
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, arcRadius, -fovHalf, fovHalf);
            ctx.closePath();
        }
        ctx.fill();

        if (fovDeg < 360) {
            const fovHalf = (fovDeg * Math.PI / 180) / 2;
            ctx.globalAlpha = Math.min(fovAlpha * 2.7, 0.4);
            ctx.strokeStyle = '#ffdd44';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(arcRadius * Math.cos(-fovHalf), arcRadius * Math.sin(-fovHalf));
            ctx.moveTo(0, 0);
            ctx.lineTo(arcRadius * Math.cos(fovHalf), arcRadius * Math.sin(fovHalf));
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    if (_rd.editingTurret && !_overlayTurretId) {
        const et = _rd.editingTurret;
        const etFovDeg = et.fov ?? 200;
        const etFovSize = et.fovSize ?? 10;
        if (et.turretType === 'auto' && etFovDeg > 0 && etFovSize > 0 && et.primarySubTurretId && et.autoSubTurrets && et.autoSubTurrets.length > 0) {
            let etFovPrimaryOffset = 0;
            for (let si = 0; si < et.autoSubTurrets.length; si++) {
                if (et.autoSubTurrets[si].id === et.primarySubTurretId) {
                    etFovPrimaryOffset = et.autoSubTurrets[si].angle;
                    break;
                }
            }
            const etFovKey = 'fov-editing';
            const etFovVal = `${etFovDeg}-${etFovSize}`;
            const etFovAlpha = _getOverlayAlpha(etFovKey, etFovVal, 0.15, _fadeDt);
            if (etFovAlpha >= 0.001) {
                if (_edTankGL !== null) _edOverlayBreak();
                ctx.save();
                ctx.rotate(etFovPrimaryOffset);
                const etArcR = _fovArcRadius(_layerBulletRender.logic, et);
                ctx.globalAlpha = etFovAlpha;
                ctx.fillStyle = '#ffdd44';
                ctx.beginPath();
                if (etFovDeg >= 360) {
                    ctx.arc(0, 0, etArcR, 0, Math.PI * 2);
                } else {
                    const etFovHalf = (etFovDeg * Math.PI / 180) / 2;
                    ctx.moveTo(0, 0);
                    ctx.arc(0, 0, etArcR, -etFovHalf, etFovHalf);
                    ctx.closePath();
                }
                ctx.fill();
                if (etFovDeg < 360) {
                    const etFovHalf = (etFovDeg * Math.PI / 180) / 2;
                    ctx.globalAlpha = Math.min(etFovAlpha * 2.7, 0.4);
                    ctx.strokeStyle = '#ffdd44';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(etArcR * Math.cos(-etFovHalf), etArcR * Math.sin(-etFovHalf));
                    ctx.moveTo(0, 0);
                    ctx.lineTo(etArcR * Math.cos(etFovHalf), etArcR * Math.sin(etFovHalf));
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
                ctx.restore();
            }
        }
    }

    for (let i = 0; i < turrets.length; i++) {
        const t = turrets[i];
        if (!_overlayTurretId || t.id !== _overlayTurretId) continue;
        const behaviors = t.projectileBehaviors;
        if (!behaviors) continue;
        let targetRange = 0;
        for (let bi = 0; bi < behaviors.length; bi++) {
            if (behaviors[bi].type === 'autoTargetEnemy' && behaviors[bi].enabled && behaviors[bi].targetRange > 0) {
                targetRange = behaviors[bi].targetRange;
                break;
            }
        }
        if (targetRange <= 0) continue;

        const trKey = t._trKey || (t._trKey = `tr-${t.id || i}`);
        const trVal = `${targetRange}`;
        const trAlpha = _getOverlayAlpha(trKey, trVal, 0.12, _fadeDt);
        if (trAlpha < 0.001) continue;

        if (_edTankGL !== null) _edOverlayBreak();
        ctx.save();
        ctx.rotate(-_rd.bodyAngle);
        ctx.globalAlpha = trAlpha;
        ctx.fillStyle = '#ff6644';
        ctx.beginPath();
        ctx.arc(0, 0, targetRange, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.min(trAlpha * 2.5, 0.3);
        ctx.strokeStyle = '#ff6644';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    if (_rd.editingTurret && !_overlayTurretId) {
        const et = _rd.editingTurret;
        const etBehaviors = et.projectileBehaviors;
        if (etBehaviors) {
            let etTargetRange = 0;
            for (let bi = 0; bi < etBehaviors.length; bi++) {
                if (etBehaviors[bi].type === 'autoTargetEnemy' && etBehaviors[bi].enabled && etBehaviors[bi].targetRange > 0) {
                    etTargetRange = etBehaviors[bi].targetRange;
                    break;
                }
            }
            if (etTargetRange > 0) {
                const etTrKey = 'tr-editing';
                const etTrVal = `${etTargetRange}`;
                const etTrAlpha = _getOverlayAlpha(etTrKey, etTrVal, 0.12, _fadeDt);
                if (etTrAlpha >= 0.001) {
                    if (_edTankGL !== null) _edOverlayBreak();
                    ctx.save();
                    ctx.rotate(-_rd.bodyAngle);
                    ctx.globalAlpha = etTrAlpha;
                    ctx.fillStyle = '#ff6644';
                    ctx.beginPath();
                    ctx.arc(0, 0, etTargetRange, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = Math.min(etTrAlpha * 2.5, 0.3);
                    ctx.strokeStyle = '#ff6644';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                    ctx.restore();
                }
            }
        }
    }
}

function drawTankAndTurrets(ctx: CanvasRenderingContext2D, localCoords = false, passes = _PASS_ALL) {
    if (!localCoords) {
        ctx.save();
        ctx.translate(_rd.posX, _rd.posY);
        ctx.rotate(_rd.bodyAngle);
    }

    const sizePx = _rd.sizePx;
    const aimOffset = _rd.aimAngle - _rd.bodyAngle;

    const turrets = _rd.turrets!;
    const sorted = _sortTurrets(turrets);

    _buildTurretLayerFlags(sorted, _rd.bodyLayers);

    if (_dbg5Active) _dbg5C2d.push(`[C2D-TANK] sides=${_rd.sides} sizePx=${sizePx.toFixed(1)} turrets=${turrets.length} sorted=${sorted.length} layers=${_rd.bodyLayers?.length ?? 0} pos=(${_rd.posX.toFixed(1)},${_rd.posY.toFixed(1)}) bodyAngle=${_rd.bodyAngle.toFixed(3)}`);

    if (passes & _PASS_BELOW) {
    _drawBodyLayers(ctx, sizePx, sorted);
    if (_layerBulletRender.enabled && _activeBelowLen > 0) {
        const _lbr = _layerBulletRender;
        ctx.save();
        if (_lbr.logic!.state.isTestMode) {
            ctx.setTransform(
                _lbr.logic!.zoom, 0, 0, _lbr.logic!.zoom,
                _lbr.width / 2 - _lbr.logic!.tankPos.x * _lbr.logic!.zoom,
                _lbr.height / 2 - _lbr.logic!.tankPos.y * _lbr.logic!.zoom
            );
        } else {
            ctx.setTransform(
                _lbr.logic!.zoom, 0, 0, _lbr.logic!.zoom,
                _lbr.width / 2, _lbr.height / 2
            );
        }
        _renderBulletBatch(
            ctx, _lbr.logic!, _lbr.webgl, _lbr.useWebGL,
            _activeBelowIdx, _activeBelowLen,
            _lbr.bulletsArr!, _lbr.viewportBounds, _lbr.bulletStrokeWidth,
            _lbr.width, _lbr.height, _lbr.camOffX, _lbr.camOffY
        );
        ctx.restore();
    }

    let _previewBelowRL = -1;
    let _previewBelowDrawn = true;
    if (!localCoords && _previewInjectLogic && _previewInjectLayerId === null) {
        _previewBelowRL = _getPreviewRenderLayerForPass(_previewInjectLogic, 'below');
        if (_previewBelowRL >= 0) _previewBelowDrawn = false;
    }
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].aboveTankBody || _turretOnLayerFlags[i]) continue;
        if (!_previewBelowDrawn && (sorted[i].renderLayer ?? 0) > _previewBelowRL) {
            drawPreviewTurret(ctx, _previewInjectLogic!, 'below', true);
            drawPresetPreview(ctx, _previewInjectLogic!, 'below', true);
            _previewBelowDrawn = true;
        }
        _drawSingleTurret(ctx, sizePx, aimOffset, sorted[i]);
    }
    if (!_previewBelowDrawn) {
        drawPreviewTurret(ctx, _previewInjectLogic!, 'below', true);
        drawPresetPreview(ctx, _previewInjectLogic!, 'below', true);
    }

    if (!_rd.isTestMode) _drawTurretRangeOverlays(ctx, sizePx, turrets);
    }

    if ((passes & _PASS_BODY) && !_rd.showTurretsOnly) {
    const _hasBaseSpin = _rd.baseBodyAngle !== 0;
    if (_hasBaseSpin) { ctx.save(); ctx.rotate(_rd.baseBodyAngle); }

    _drawBodyPath(ctx, sizePx);

    const bodyDispColor = _rd.damageOverlay > 0 ? mixColorToWhite(_rd.color, _rd.damageOverlay) : _rd.color;
    ctx.strokeStyle = _rd.pickedBody === 'main' ? (_isDarkMode ? '#fcfcfd' : '#171718') : darkenColor(bodyDispColor, 0.598);
    ctx.lineWidth = Math.max(MIN_STROKE_SCREEN_PX / _rd.zoom, FIXED_STROKE_WIDTH);
    ctx.stroke();
    ctx.fillStyle = bodyDispColor;
    ctx.fill();

    if (_rd.isHealer) _drawHealerCross(ctx, sizePx);

    if (_hasBaseSpin) { ctx.restore(); }
    }

    if (passes & _PASS_ABOVE) {
    let _previewAboveRL = -1;
    let _previewAboveDrawn = true;
    if (!localCoords && _previewInjectLogic && _previewInjectLayerId === null) {
        _previewAboveRL = _getPreviewRenderLayerForPass(_previewInjectLogic, 'above');
        if (_previewAboveRL >= 0) _previewAboveDrawn = false;
    }
    for (let i = 0; i < sorted.length; i++) {
        if (!sorted[i].aboveTankBody || _turretOnLayerFlags[i]) continue;
        if (!_previewAboveDrawn && (sorted[i].renderLayer ?? 0) > _previewAboveRL) {
            drawPreviewTurret(ctx, _previewInjectLogic!, 'above', true);
            drawPresetPreview(ctx, _previewInjectLogic!, 'above', true);
            _previewAboveDrawn = true;
        }
        _drawSingleTurret(ctx, sizePx, aimOffset, sorted[i]);
    }
    if (!_previewAboveDrawn) {
        drawPreviewTurret(ctx, _previewInjectLogic!, 'above', true);
        drawPresetPreview(ctx, _previewInjectLogic!, 'above', true);
    }

    _drawBodyLayers(ctx, sizePx, sorted, true);
    }

    if (!localCoords) {
        ctx.restore();
    }
}

function drawEnemyHPBar(ctx: CanvasRenderingContext2D, logic: GameLogic, enemy: EnemyTank) {
    if (!enemy.showHealthBar) return;
    if (enemy.isBaseProtector) return;
    const maxHp = enemy.maxHealth * getEnemyStatMultiplier(enemy, 'maxHealth');
    const maxShield = enemy.maxShield * getEnemyStatMultiplier(enemy, 'shieldCapacity');
    if ((enemy._mevF & 4) !== 0 && enemy.displayHp >= maxHp) return;
    const hpPercent = Math.max(0, enemy.displayHp / maxHp);
    const shieldPercent = maxShield > 0 ? Math.max(0, enemy.displayShield / maxShield) : 0;

    const entityRadius = enemy.size / 2;
    let visualRadius = entityRadius * getRealSizeFactor(enemy.sides);
    for (let _li = 0; _li < enemy.bodyLayers.length; _li++) {
        const _bl = enemy.bodyLayers[_li];
        const _lr = entityRadius * _bl.sizeRatio * _layerReach(_bl);
        if (_lr > visualRadius) visualRadius = _lr;
    }

    drawHealthBar(ctx, enemy.position.x, enemy.position.y,
        entityRadius, visualRadius, hpPercent, shieldPercent,
        enemy.hpBarOpacity * tagBarAlphaAt(_barEdge(enemy.position.x, entityRadius), drawnOpacity(enemy, _carryNow(enemy, logic))),
        maxShield > 0, enemy.growthScale);

    if (logic.state.debugShowAILogic && logic.state.dbgAiFearMeter && enemy.fearHeat > 1) {
        const _fhPct = (enemy.fearHeat > 100 ? 100 : enemy.fearHeat) / 100;
        _pushFleeHeatBar(enemy.position.x, enemy.position.y,
            entityRadius, visualRadius, _fhPct,
            enemy.hpBarOpacity, enemy.growthScale);
    }
}

function _getPreviewRenderLayerForPass(logic: GameLogic, pass: 'below' | 'above'): number {
    if (logic.state.isTestMode) return -1;
    if (logic.state.canvasEntityKind === 'shape') return -1;
    if (logic.state.selectMode) return -1;
    if (logic.state.autoSubTurretEditMode) return -1;
    if (!logic.isTurretPlacementEnabled) return -1;

    const presetTurrets = logic.state.presetPreviewTurrets;
    if (presetTurrets.length > 0) {
        let minRL = Number.POSITIVE_INFINITY;
        for (let i = 0; i < presetTurrets.length; i++) {
            const t = presetTurrets[i];
            const isAbove = t.aboveTankBody ?? false;
            if (pass === 'below' && isAbove) continue;
            if (pass === 'above' && !isAbove) continue;
            const rl = t.renderLayer ?? 0;
            if (rl < minRL) minRL = rl;
        }
        return minRL === Number.POSITIVE_INFINITY ? -1 : minRL;
    }

    const t = logic.state.editingTurret;
    if (!t) return -1;
    const isAbove = t.aboveTankBody ?? false;
    if (pass === 'below' && isAbove) return -1;
    if (pass === 'above' && !isAbove) return -1;
    return t.renderLayer ?? 0;
}

function drawPreviewTurret(ctx: CanvasRenderingContext2D, logic: GameLogic, pass: 'below' | 'above' = 'below', tankLocal = false) {
    if (!logic.state.isTestMode && logic.state.canvasEntityKind === 'shape') return;
    if (logic.state.autoSubTurretEditMode) {
        if (logic.state.autoSubTurretSelectMode) return;
        const _subParent = logic.state.turrets.find(t => t.id === logic.state.autoSubTurretParentId);
        const _subParentAbove = _subParent?.aboveTankBody ?? false;
        if ((_subParentAbove && pass === 'above') || (!_subParentAbove && pass === 'below')) {
            if (logic.state.presetPreviewTurrets.length > 0) {
                drawAutoSubTurretPresetPreview(ctx, logic, tankLocal);
            } else {
                drawAutoSubTurretPreview(ctx, logic, tankLocal);
            }
        }
        return;
    }

    if (!logic.isTurretPlacementEnabled) return;
    if (logic.state.selectMode || logic.state.isTestMode) return;
    if (logic.state.presetPreviewTurrets.length > 0) return;

    const t = logic.state.editingTurret;

    const isAbove = t.aboveTankBody ?? false;
    if (pass === 'below' && isAbove) return;
    if (pass === 'above' && !isAbove) return;

    const mx = (logic.mouseX - logic.width/2)/logic.zoom + (logic.cameraX - logic.tankPos.x);
    const my = (logic.mouseY - logic.height/2)/logic.zoom + (logic.cameraY - logic.tankPos.y);
    let desiredAngle = Math.atan2(my, mx);
    const activeSides = logic.getActiveLayerSides();
    if (logic.state.snapPlacement) {
        if (activeSides >= 3) {
            desiredAngle = snapAngleToFaceMidpoint(desiredAngle, activeSides, logic.tankAngle, logic.getActiveFaceOffset(activeSides));
        } else {
            desiredAngle = snapAngleToGrid(desiredAngle, SNAP_COUNTS[logic.state.snapPlacementCount]);
        }
    } else if (logic.keys.has('ShiftLeft') || logic.keys.has('ShiftRight')) {
        desiredAngle = snapAngleToGrid(desiredAngle, 16);
    }
    const relativeAngle = desiredAngle - logic.tankAngle;

    const baseSizePx = tankSizeFromSlider(logic.state.tankSize);
    const sizeRatio = logic.getActiveLayerSizeRatio();
    const sideCorr = computeSideCorr(activeSides, logic.state.tankSides);
    const widthCorr = 1.0;
    const lengthCorr = 1.0;
    const layerSizePx = baseSizePx * sizeRatio;
    const isAuto = t.turretType === 'auto';
    const sizePx = layerSizePx;
    const posSizePx = layerSizePx;

    const bodyScale = sizeRatio;

    const _ratioSideCorr = (logic.state.snapPlacement && activeSides >= 3 && !isAuto)
      ? sideCorr
      : 1.0;

    const _scaledForFit = _ratioSideCorr === 1.0
      ? t
      : { ...t, width: t.width * _ratioSideCorr, yOffset: t.yOffset * _ratioSideCorr };
    const effLength = isAuto ? (t.autoTurretLength ?? 10) : (t.length * _ratioSideCorr + (1 - _ratioSideCorr) * 0.9056);
    const effWidth = isAuto ? (t.autoTurretWidth ?? 25) : _scaledForFit.width;
    const tLen = _mapVal(effLength, 1, 100, sizePx * 0.01, sizePx/2 + sizePx*10) * lengthCorr;
    const tWid = _mapVal(effWidth, 0, 50, 0, sizePx * 0.96) * widthCorr;
    const aspect = t.aspect;
    const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);
    const circleR = isAuto ? _mapVal(t.autoCircleSize ?? 25, 0, 50, 0, sizePx * 0.96) * 0.7 : tWid * 0.7;

    const maxW = tWid * aspect;
    const fovSizeForBuf = t.fovSize ?? 10;
    const fovArcRadius = (isAuto && (t.fov ?? 200) > 0 && fovSizeForBuf > 0 && _fovArcDrawn(t)) ? _fovArcRadius(logic, t) : 0;
    const allLayers = t.visualLayers || [];
    let layerMaxSize = 0;
    for (let li = 0; li < allLayers.length; li++) {
        const l = allLayers[li];
        const offExt = Math.abs(l.xOffset) + Math.abs(l.yOffset);
        const sizeExt = (l.size + l.width) * bodyScale;
        const ext = offExt + sizeExt;
        if (ext > layerMaxSize) layerMaxSize = ext;
    }
    const hyp = Math.sqrt(tLen * tLen + (maxW/2)*(maxW/2));
    const lookExt = (!isAuto && t.look !== undefined) ? lookUnit(t.look, sizePx) * lookReach(t.look) : 0;
    const bufSize = Math.ceil(Math.max(lookExt > 0 ? lookExt : hyp, circleR, layerMaxSize, fovArcRadius) * 2 + strokeWidth * 2 + 60);

    const cs = scratchScale(bufSize, _PREVIEW_MAX_SCRATCH_PX, _currentCacheScale);
    const scaledBuf = Math.ceil(bufSize * cs);
    const gpu = _ghostOn && _edTankGL !== null;
    if (gpu) _ghostFrameOfTank(logic);
    else getScratch(bufSize, bufSize, cs);
    const sc = scratchCanvas!;
    const sCtx = scratchCtx!;

    if (!gpu) {
    sCtx.save();
    sCtx.translate(scaledBuf/2, scaledBuf/2);
    sCtx.scale(cs, cs);
    sCtx.lineJoin = 'round';

    if (!isAuto && t.look !== undefined) {
        _drawLook2D(sCtx, t.look, sizePx, strokeWidth, false, 0);
    } else if (!isAuto) {
        const topY = -tWid / 2;
        const botY = tWid / 2;
        const topScaled = topY * aspect;
        const botScaled = botY * aspect;

        sCtx.beginPath();
        roundedBarrelPath(sCtx, tLen, topY, botY, topScaled, botScaled);

        sCtx.fillStyle = turretFill(t.color, t.colorMap);
        sCtx.strokeStyle = darkenColor(turretFill(t.color, t.colorMap), 0.598);
        sCtx.lineWidth = strokeWidth;
        sCtx.stroke();
        sCtx.fill();
    }
    }

    const fovDegBuf = t.fov ?? 200;
    const fovSizeValBuf = t.fovSize ?? 10;
    let bufPrimaryOffset = 0;
    let bufHasPrimary = false;
    if (isAuto && t.primarySubTurretId && t.autoSubTurrets && t.autoSubTurrets.length > 0) {
        for (let si = 0; si < t.autoSubTurrets.length; si++) {
            if (t.autoSubTurrets[si].id === t.primarySubTurretId) {
                bufPrimaryOffset = t.autoSubTurrets[si].angle;
                bufHasPrimary = true;
                break;
            }
        }
    }
    let gpuFovA = 0, gpuFovR = 0;
    if (isAuto && bufHasPrimary && fovDegBuf > 0 && fovSizeValBuf > 0) {
        const fovKeyBuf = `fov-${(t as any).id || 'buf'}`;
        const fovValBuf = `${fovDegBuf}-${fovSizeValBuf}`;
        const fovAlphaBuf = _getOverlayAlpha(fovKeyBuf, fovValBuf, 0.15, 1/60);
        if (gpu) { if (fovAlphaBuf > 0.001) { gpuFovA = fovAlphaBuf; gpuFovR = _fovArcRadius(logic, t); } }
        else if (fovAlphaBuf > 0.001) {
        const arcRadius = _fovArcRadius(logic, t);

        sCtx.save();
        sCtx.rotate(bufPrimaryOffset);
        sCtx.globalAlpha = fovAlphaBuf;
        sCtx.fillStyle = '#ffdd44';
        sCtx.beginPath();
        if (fovDegBuf >= 360) {
            sCtx.arc(0, 0, arcRadius, 0, Math.PI * 2);
        } else {
            const fovHalf = (fovDegBuf * Math.PI / 180) / 2;
            sCtx.moveTo(0, 0);
            sCtx.arc(0, 0, arcRadius, -fovHalf, fovHalf);
            sCtx.closePath();
        }
        sCtx.fill();

        if (fovDegBuf < 360) {
            const fovHalf = (fovDegBuf * Math.PI / 180) / 2;
            sCtx.globalAlpha = Math.min(fovAlphaBuf * 2.7, 0.4);
            sCtx.strokeStyle = '#ffdd44';
            sCtx.lineWidth = 1.5;
            sCtx.beginPath();
            sCtx.moveTo(0, 0);
            sCtx.lineTo(arcRadius * Math.cos(-fovHalf), arcRadius * Math.sin(-fovHalf));
            sCtx.moveTo(0, 0);
            sCtx.lineTo(arcRadius * Math.cos(fovHalf), arcRadius * Math.sin(fovHalf));
            sCtx.stroke();
        }
        sCtx.restore();
        sCtx.globalAlpha = 1;
        }
    }

    if (!gpu) sCtx.restore();

    const drawOneAtOffset = (relAngle: number, xOff: number, yOff: number) => {
        if (gpu) {
            const lx = xOff * posSizePx / 2, ly = yOff * posSizePx / 2;
            if (!isAuto) {
                _ghostBegin(); _ghostBarrel(t, lx, ly, relAngle, tLen, tWid, sizePx); _ghostEnd(ctx, 0.6);
                return;
            }
            if (gpuFovA > 0) {
                ctx.save();
                if (!tankLocal) { ctx.translate(logic.tankPos.x, logic.tankPos.y); ctx.rotate(logic.tankAngle); }
                ctx.translate(lx, ly);
                ctx.rotate(relAngle + bufPrimaryOffset);
                _ghostFovArc(ctx, fovDegBuf, gpuFovR, gpuFovA, 0.6);
                ctx.restore();
            }
            _ghostBegin();
            _ghostBase(t, lx, ly, circleR, t.autoCircleColorMatch ? _editorBodyColor(logic) : turretFill(t.color, t.colorMap), 0);
            _ghostEnd(ctx, 0.6);
            return;
        }
        ctx.save();
        if (!tankLocal) {
            ctx.translate(logic.tankPos.x, logic.tankPos.y);
            ctx.rotate(logic.tankAngle);
        }
        ctx.translate(xOff * posSizePx/2, yOff * posSizePx/2);
        ctx.rotate(relAngle);

        ctx.globalAlpha = 0.6;
        ctx.drawImage(sc, 0, 0, scaledBuf, scaledBuf, -bufSize/2, -bufSize/2, bufSize, bufSize);

        ctx.restore();

        if (isAuto) {
            ctx.save();
            if (!tankLocal) {
                ctx.translate(logic.tankPos.x, logic.tankPos.y);
                ctx.rotate(logic.tankAngle);
            }
            ctx.translate(xOff * posSizePx/2, yOff * posSizePx/2);

            const prevCircleColor = t.autoCircleColorMatch ? _editorBodyColor(logic) : turretFill(t.color, t.colorMap);
            ctx.globalAlpha = 0.6;
            const _pvSides = t.autoCircleBaseSides ?? 0;
            const _pvDepth = autoBaseDepth(_pvSides, t.autoCircleBaseDepth);
            const _pvOff = autoBaseTurn(_pvSides, _pvDepth);
            ctx.beginPath();
            if (_pvSides >= 3) { _autoBasePath(ctx, _pvSides, _pvDepth, circleR, _pvOff); }
            else { ctx.arc(0, 0, circleR, 0, Math.PI * 2); }
            ctx.fillStyle = prevCircleColor;
            ctx.fill();
            const halfSW = strokeWidth / 2;
            ctx.beginPath();
            if (_pvSides >= 3) {
                _autoBasePath(ctx, _pvSides, _pvDepth, circleR + halfSW, _pvOff);
                _autoBasePath(ctx, _pvSides, _pvDepth, circleR, _pvOff);
            } else {
                ctx.arc(0, 0, circleR + halfSW, 0, Math.PI * 2);
                ctx.arc(0, 0, circleR, 0, Math.PI * 2, true);
            }
            ctx.fillStyle = darkenColor(prevCircleColor, 0.598);
            ctx.fill('evenodd');

            ctx.restore();
        }
    };

    const prevEffX = t.xOffset * _ratioSideCorr;
    const prevEffY = isAuto ? t.yOffset : _scaledForFit.yOffset;

    const _w18BaseSizePx = tankSizeFromSlider(logic.state.tankSize);
    const _w18Layer1 = logic.state.bodyLayers[0];
    const _w18ApothemFracActive = activeSides >= 3
      ? getRealSizeFactor(activeSides) * Math.cos(Math.PI / activeSides)
      : 0;
    const _w18ApothemFracMain = logic.state.tankSides >= 3
      ? getRealSizeFactor(logic.state.tankSides) * Math.cos(Math.PI / logic.state.tankSides)
      : 0;
    const _w18UseW18 = (_w18Layer1 !== undefined
                        && logic.state.activeBodyLayerId !== null
                        && logic.state.activeBodyLayerId !== _w18Layer1.id
                        && activeSides >= 3
                        && logic.state.snapPlacement
                        && !isAuto
                        && _w18Layer1.sides >= 3);
    let layerShift: number;
    if (_w18UseW18) {
      const refXOff = t.xOffset;
      const refLength = t.length;
      const _w18L1SideCorr = computeSideCorr(_w18Layer1.sides, logic.state.tankSides);
      const _w18L1SizePx = _w18BaseSizePx * _w18Layer1.sizeRatio;
      const _w18L1ApothemFrac = getRealSizeFactor(_w18Layer1.sides) * Math.cos(Math.PI / _w18Layer1.sides);
      const _w18L1XOffBakedW15 = refXOff * _w18L1SideCorr + (_w18L1ApothemFrac - _w18L1SideCorr * _w18ApothemFracMain);
      const _w18L1ScaledLen = refLength * _w18L1SideCorr + (1 - _w18L1SideCorr) * 0.9056;
      const _w18L1TLenBaked = (_w18L1ScaledLen - 1) * (_w18L1SizePx / 2 + _w18L1SizePx * 10 - _w18L1SizePx * 0.01) / 99 + _w18L1SizePx * 0.01;
      const _w18TargetVisible = (_w18L1XOffBakedW15 - _w18L1ApothemFrac) * _w18L1SizePx / 2 + _w18L1TLenBaked;
      const _w18ActiveSizePx = _w18BaseSizePx * logic.getActiveLayerSizeRatio();
      const _w18ActiveScaledLen = refLength * _ratioSideCorr + (1 - _ratioSideCorr) * 0.9056;
      const _w18ActiveTLenBaked = (_w18ActiveScaledLen - 1) * (_w18ActiveSizePx / 2 + _w18ActiveSizePx * 10 - _w18ActiveSizePx * 0.01) / 99 + _w18ActiveSizePx * 0.01;
      const _w18RefXOffBaked = _w18ApothemFracActive + 2 * (_w18TargetVisible - _w18ActiveTLenBaked) / _w18ActiveSizePx;
      layerShift = _w18RefXOffBaked - refXOff * _ratioSideCorr;
    } else {
      layerShift = (_ratioSideCorr !== 1.0)
        ? _w18ApothemFracActive - _ratioSideCorr * _w18ApothemFracMain
        : 0;
    }

    if (logic.state.autoPlacement) {
        const isCombo = logic.state.snapPlacement && activeSides >= 3;

        if (isCombo) {
            const count = Math.min(logic.state.autoPlacementCount, activeSides);
            const faceAngles = logic.getSideSnapAngles(count, activeSides, logic.getActiveFaceOffset(activeSides));
            const presetMag = Math.sqrt(t.xOffset * t.xOffset + prevEffY * prevEffY);

            for (let i = 0; i < faceAngles.length; i++) {
                const faceAngle = faceAngles[i];
                if (isAuto) {
                    const rawDist = presetMag || logic.computeFaceEdgeOffset(activeSides, t.autoCircleSize ?? 25);
                    drawOneAtOffset(faceAngle, rawDist * Math.cos(faceAngle), rawDist * Math.sin(faceAngle));
                } else {
                    const shiftedDist = presetMag + layerShift;
                    if (shiftedDist > 0) {
                        drawOneAtOffset(faceAngle, shiftedDist * Math.cos(faceAngle), shiftedDist * Math.sin(faceAngle));
                    } else {
                        drawOneAtOffset(faceAngle, prevEffX, prevEffY);
                    }
                }
            }
        } else {
            const _pvMaxCount = activeSides >= 3 ? activeSides : 8;
            const _pvEffectiveCount = Math.min(logic.state.autoPlacementCount, _pvMaxCount);
            const offsets = logic.getCompassAngles(_pvEffectiveCount);
            for (let _oi = 0; _oi < offsets.length; _oi++) {
                const ghostAngle = relativeAngle + offsets[_oi];
                _previewLayerShift(prevEffX, prevEffY, ghostAngle, layerShift);
                drawOneAtOffset(ghostAngle, _plsOut.xOff, _plsOut.yOff);
            }
        }
    } else {
        _previewLayerShift(prevEffX, prevEffY, relativeAngle, layerShift);
        drawOneAtOffset(relativeAngle, _plsOut.xOff, _plsOut.yOff);
        if (logic.state.mirrorMode) {
            _previewLayerShift(prevEffX, -prevEffY, -relativeAngle, layerShift);
            drawOneAtOffset(-relativeAngle, _plsOut.xOff, _plsOut.yOff);
        }
    }
}

const _plsOut = { xOff: 0, yOff: 0 };
function _previewLayerShift(xOff: number, yOff: number, defaultAngle: number, layerShift: number): void {
    if (layerShift === 0) { _plsOut.xOff = xOff; _plsOut.yOff = yOff; return; }
    const newR = Math.sqrt(xOff * xOff + yOff * yOff) + layerShift;
    _plsOut.xOff = newR * Math.cos(defaultAngle);
    _plsOut.yOff = newR * Math.sin(defaultAngle);
}

function _autoSubsReach(t: Turret, circleR: number, hostSizePx: number): number {
    const subs = t.autoSubTurrets;
    if (!subs || subs.length === 0) return 0;
    const sz = circleR * 2;
    let reach = 0;
    for (let i = 0; i < subs.length; i++) {
        const u = subs[i];
        const off = Math.sqrt(u.xOffset * u.xOffset + u.yOffset * u.yOffset) * sz / 2;
        let own: number;
        if (u.look !== undefined) own = lookUnit(u.look, hostSizePx) * lookReach(u.look);
        else {
            const len = _mapVal(u.length, 1, 100, sz * 0.01, sz / 2 + sz * 10);
            const halfW = _mapVal(u.width, 0, 50, 0, sz * 0.96) * (u.aspect ?? 1) / 2;
            own = Math.sqrt(len * len + halfW * halfW);
        }
        if (off + own > reach) reach = off + own;
    }
    return reach;
}

function _ghostAutoSubs(
    ctx: CanvasRenderingContext2D, t: Turret, angle: number, circleR: number,
    baseSides: number, baseDepth: number, baseOff: number, hostSizePx: number, bodyScale: number, reach: number, above: boolean,
): void {
    const subs = t.autoSubTurrets;
    let any = false;
    for (let i = 0; i < subs.length; i++) if ((subs[i].aboveBase === true) === above) { any = true; break; }
    if (!any) return;
    ctx.save();
    ctx.rotate(angle);
    if (!above && !t.autoCircleHidden) {
        const b = reach + circleR + 10;
        ctx.beginPath();
        ctx.rect(-b, -b, b * 2, b * 2);
        if (baseSides >= 3) _autoBasePath(ctx, baseSides, baseDepth, circleR, baseOff - angle);
        else ctx.arc(0, 0, circleR, 0, Math.PI * 2, true);
        ctx.clip('evenodd');
    }
    const sorted = _sortSubTurrets(subs);
    _lookHostSizePx = hostSizePx;
    for (let i = 0; i < sorted.length; i++) {
        const sub = sorted[i];
        if ((sub.aboveBase === true) !== above) continue;
        _drawSingleTurret(ctx, circleR * 2, 0, sub, undefined, angle, 0, bodyScale);
    }
    _lookHostSizePx = 0;
    ctx.restore();
}

let _presetScaledSrc: Turret[] | null = null;
let _presetScaledCorr = 1;
let _presetScaledOut: Turret[] = [];
const _presetFitIn: WidthFitInput = { pieces: [], activeSides: 0, snapEnabled: false, barrelSizePx: 0 };
const _presetMirrorCache = new WeakMap<Turret, Turret>();
function _presetMirrorOf(t: Turret): Turret {
    let m = _presetMirrorCache.get(t);
    if (m === undefined) { m = presetPieceMirrored(t); _presetMirrorCache.set(t, m); }
    return m;
}

function drawPresetPreview(ctx: CanvasRenderingContext2D, logic: GameLogic, pass: 'below' | 'above' = 'below', tankLocal = false) {
    const previewTurrets = logic.presetPieces();
    if (previewTurrets.length === 0) return;
    const mirrorSet = logic.state.mirrorMode && !logic.state.autoPlacement;
    if (logic.state.isTestMode) return;
    if (logic.state.canvasEntityKind === 'shape') return;
    if (logic.state.autoSubTurretEditMode) return;

    const { angles, isCombo } = logic.computePlacementAngles();
    const activeSides = logic.getActiveLayerSides();

    _presetAngleCosBuf.length = 0;
    _presetAngleSinBuf.length = 0;
    for (let _a = 0; _a < angles.length; _a++) {
        _presetAngleCosBuf.push(Math.cos(angles[_a]));
        _presetAngleSinBuf.push(Math.sin(angles[_a]));
    }

    const baseSizePx = tankSizeFromSlider(logic.state.tankSize);
    const sizeRatio = logic.getActiveLayerSizeRatio();
    const sideCorr = computeSideCorr(activeSides, logic.state.tankSides);
    const widthCorr = 1.0;
    const lengthCorr = 1.0;
    const layerSizePx = baseSizePx * sizeRatio;
    const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);

    const snapPresetShift = 0;

    const _w15SideCorr = (logic.state.snapPlacement && activeSides >= 3 && logic.state.tankSides >= 3)
        ? computeSideCorr(activeSides, logic.state.tankSides)
        : 1.0;
    let _scaledTurrets: Turret[];
    if (_w15SideCorr === 1.0) _scaledTurrets = previewTurrets;
    else {
        if (_presetScaledSrc !== previewTurrets || _presetScaledCorr !== _w15SideCorr) {
            _presetScaledSrc = previewTurrets; _presetScaledCorr = _w15SideCorr;
            _presetScaledOut = previewTurrets.map(t => t.turretType === 'auto'
                ? t
                : {
                    ...t,
                    width: t.width * _w15SideCorr,
                    length: t.length * _w15SideCorr,
                    xOffset: t.xOffset * _w15SideCorr,
                    yOffset: t.yOffset * _w15SideCorr,
                });
        }
        _scaledTurrets = _presetScaledOut;
    }

    _presetFitIn.pieces = _scaledTurrets;
    _presetFitIn.activeSides = activeSides;
    _presetFitIn.snapEnabled = logic.state.snapPlacement;
    _presetFitIn.barrelSizePx = layerSizePx;
    const presetWidthFitAdj = computeWidthFitAdjustment(_presetFitIn);

    const _w15KWidth = (presetWidthFitAdj && activeSides >= 3) ? presetWidthFitAdj.kWidth : 1;
    const _w15CombinedScale = _w15SideCorr * _w15KWidth;
    const _w15ApothemFracLayer = activeSides >= 3
        ? getRealSizeFactor(activeSides) * Math.cos(Math.PI / activeSides)
        : 0;
    const _w15ApothemFracMain = logic.state.tankSides >= 3
        ? getRealSizeFactor(logic.state.tankSides) * Math.cos(Math.PI / logic.state.tankSides)
        : 0;
    const _w18Layer1 = logic.state.bodyLayers[0];
    const _w18UseW18 = (_w18Layer1 !== undefined
                        && logic.state.activeBodyLayerId !== null
                        && logic.state.activeBodyLayerId !== _w18Layer1.id
                        && activeSides >= 3
                        && logic.state.snapPlacement
                        && _w18Layer1.sides >= 3
                        && previewTurrets.length > 0);
    let _w15XShift: number;
    if (_w18UseW18) {
      const _w18BaseSizePx = tankSizeFromSlider(logic.state.tankSize);
      let _w18RefPiece = previewTurrets[0];
      for (let i = 0; i < previewTurrets.length; i++) {
        if (previewTurrets[i].turretType !== 'auto') { _w18RefPiece = previewTurrets[i]; break; }
      }
      const refXOff = _w18RefPiece.xOffset;
      const refLength = _w18RefPiece.length;
      const _w18L1SideCorr = computeSideCorr(_w18Layer1.sides, logic.state.tankSides);
      const _w18L1SizePx = _w18BaseSizePx * _w18Layer1.sizeRatio;
      const _w18L1ApothemFrac = getRealSizeFactor(_w18Layer1.sides) * Math.cos(Math.PI / _w18Layer1.sides);
      const _w18L1XOffBakedW15 = refXOff * _w18L1SideCorr + (_w18L1ApothemFrac - _w18L1SideCorr * _w15ApothemFracMain);
      const _w18L1ScaledLen = refLength * _w18L1SideCorr + (1 - _w18L1SideCorr) * 0.9056;
      const _w18L1TLenBaked = (_w18L1ScaledLen - 1) * (_w18L1SizePx / 2 + _w18L1SizePx * 10 - _w18L1SizePx * 0.01) / 99 + _w18L1SizePx * 0.01;
      const _w18TargetVisible = (_w18L1XOffBakedW15 - _w18L1ApothemFrac) * _w18L1SizePx / 2 + _w18L1TLenBaked;
      const _w18ActiveSizePx = _w18BaseSizePx * logic.getActiveLayerSizeRatio();
      const _w18ActiveScaledLen = refLength * _w15CombinedScale + (1 - _w15CombinedScale) * 0.9056;
      const _w18ActiveTLenBaked = (_w18ActiveScaledLen - 1) * (_w18ActiveSizePx / 2 + _w18ActiveSizePx * 10 - _w18ActiveSizePx * 0.01) / 99 + _w18ActiveSizePx * 0.01;
      const _w18RefXOffBaked = _w15ApothemFracLayer + 2 * (_w18TargetVisible - _w18ActiveTLenBaked) / _w18ActiveSizePx;
      _w15XShift = _w18RefXOffBaked - refXOff * _w15CombinedScale;
    } else {
      _w15XShift = _w15ApothemFracLayer - _w15CombinedScale * _w15ApothemFracMain;
    }

    let maxExtent = 0;
    let turretCount = 0;
    for (let ti = 0; ti < previewTurrets.length; ti++) {
        const t = previewTurrets[ti];
        const isAbove = t.aboveTankBody ?? false;
        if (pass === 'below' && isAbove) continue;
        if (pass === 'above' && !isAbove) continue;
        turretCount++;

        const isAuto = t.turretType === 'auto';
    const sizePx = layerSizePx;
        const turretBodyScale = sizeRatio;
        const effLength = isAuto ? (t.autoTurretLength ?? 10) : (t.length * _w15CombinedScale + (1 - _w15CombinedScale) * 0.9056);
        const fitW = isAuto ? t.width : readAdjustedWidth(_scaledTurrets[ti], ti, presetWidthFitAdj);
        const fitY = isAuto ? t.yOffset : readAdjustedYOffset(_scaledTurrets[ti], ti, presetWidthFitAdj);
        const effWidth = isAuto ? (t.autoTurretWidth ?? 25) : fitW;
        const tLen = _mapVal(effLength, 1, 100, sizePx * 0.01, sizePx/2 + sizePx*10) * lengthCorr;
        const tWid = _mapVal(effWidth, 0, 50, 0, sizePx * 0.96) * widthCorr;
        const circleR = isAuto ? _mapVal(t.autoCircleSize ?? 25, 0, 50, 0, sizePx * 0.96) * 0.7 : tWid * 0.7;
        const maxW = tWid * t.aspect;
        const fovSizeForBuf = t.fovSize ?? 10;
        const fovArcRadius = (isAuto && (t.fov ?? 200) > 0 && fovSizeForBuf > 0 && _fovArcDrawn(t)) ? _fovArcRadius(logic, t) : 0;
        const allLayers = t.visualLayers || [];
        let layerMaxSize = 0;
        for (let li = 0; li < allLayers.length; li++) {
            const l = allLayers[li];
            const ext = Math.abs(l.xOffset) + Math.abs(l.yOffset) + (l.size + l.width) * turretBodyScale;
            if (ext > layerMaxSize) layerMaxSize = ext;
        }
        const hyp = (!isAuto && t.look !== undefined) ? lookUnit(t.look, sizePx) * lookReach(t.look) : Math.sqrt(tLen * tLen + (maxW/2)*(maxW/2));
        const subReach = isAuto ? _autoSubsReach(t, circleR, sizePx) : 0;
        const bufSize = Math.ceil(Math.max(hyp, circleR, layerMaxSize, fovArcRadius, subReach) * 2 + strokeWidth * 2 + 60);

        const shiftedXOff = isAuto
            ? t.xOffset + snapPresetShift
            : t.xOffset * _w15CombinedScale + _w15XShift + snapPresetShift;
        const effDist = Math.sqrt(shiftedXOff * shiftedXOff + fitY * fitY);
        const posDist = effDist * layerSizePx / 2;
        const ext = posDist + bufSize / 2;
        if (ext > maxExtent) maxExtent = ext;
    }

    if (turretCount === 0) return;

    const compSize = Math.ceil(maxExtent * 2 + 4);
    const compHalf = compSize / 2;
    const compCs = scratchScale(Math.max(compSize, 1), _PREVIEW_COMP_MAX_PX, _currentCacheScale);
    const compSizePx = Math.ceil(compSize * compCs);
    const gpu = _ghostOn && _edTankGL !== null;
    const cCtx = gpu ? (null as unknown as CanvasRenderingContext2D) : _ensurePresetComp(compSizePx);

    if (gpu) { _ghostFrameOfTank(logic); _ghostBegin(); }
    else {
    cCtx.save();
    cCtx.translate(compSizePx / 2, compSizePx / 2);
    cCtx.scale(compCs, compCs);
    }

    for (let ti = 0; ti < previewTurrets.length; ti++) {
        const t = previewTurrets[ti];
        const isAbove = t.aboveTankBody ?? false;
        if (pass === 'below' && isAbove) continue;
        if (pass === 'above' && !isAbove) continue;

        const isAuto = t.turretType === 'auto';
    const sizePx = layerSizePx;
        const turretBodyScale = sizeRatio;
        const effLength = isAuto ? (t.autoTurretLength ?? 10) : (t.length * _w15CombinedScale + (1 - _w15CombinedScale) * 0.9056);
        const fitW = isAuto ? t.width : readAdjustedWidth(_scaledTurrets[ti], ti, presetWidthFitAdj);
        const fitY = isAuto ? t.yOffset : readAdjustedYOffset(_scaledTurrets[ti], ti, presetWidthFitAdj);
        const effWidth = isAuto ? (t.autoTurretWidth ?? 25) : fitW;
        const tLen = _mapVal(effLength, 1, 100, sizePx * 0.01, sizePx/2 + sizePx*10) * lengthCorr;
        const tWid = _mapVal(effWidth, 0, 50, 0, sizePx * 0.96) * widthCorr;
        const aspect = t.aspect;
        const circleR = isAuto ? _mapVal(t.autoCircleSize ?? 25, 0, 50, 0, sizePx * 0.96) * 0.7 : tWid * 0.7;

        const maxW = tWid * aspect;
        const fovSizeForBuf = t.fovSize ?? 10;
        const fovArcRadius = (isAuto && (t.fov ?? 200) > 0 && fovSizeForBuf > 0 && _fovArcDrawn(t)) ? _fovArcRadius(logic, t) : 0;
        const allLayers = t.visualLayers || [];
        let layerMaxSize = 0;
        for (let li = 0; li < allLayers.length; li++) {
            const l = allLayers[li];
            const ext = Math.abs(l.xOffset) + Math.abs(l.yOffset) + (l.size + l.width) * turretBodyScale;
            if (ext > layerMaxSize) layerMaxSize = ext;
        }
        const hyp = (!isAuto && t.look !== undefined) ? lookUnit(t.look, sizePx) * lookReach(t.look) : Math.sqrt(tLen * tLen + (maxW/2)*(maxW/2));
        const subReach = isAuto ? _autoSubsReach(t, circleR, sizePx) : 0;
        const bufSize = Math.ceil(Math.max(hyp, circleR, layerMaxSize, fovArcRadius, subReach) * 2 + strokeWidth * 2 + 60);

        const cs = scratchScale(bufSize, _PREVIEW_MAX_SCRATCH_PX, _currentCacheScale);
        const scaledBuf = Math.ceil(bufSize * cs);
        if (!gpu) getScratch(bufSize, bufSize, cs);
        const sc = scratchCanvas!;
        const sCtx = scratchCtx!;

        if (!gpu) {
        sCtx.save();
        sCtx.translate(scaledBuf/2, scaledBuf/2);
        sCtx.scale(cs, cs);
        sCtx.lineJoin = 'round';

        if (!isAuto && t.look !== undefined) {
            _drawLook2D(sCtx, t.look, sizePx, strokeWidth, false, 0);
        } else if (!isAuto) {
            const topY = -tWid / 2;
            const botY = tWid / 2;
            const topScaled = topY * aspect;
            const botScaled = botY * aspect;
            sCtx.beginPath();
            roundedBarrelPath(sCtx, tLen, topY, botY, topScaled, botScaled);
            sCtx.fillStyle = turretFill(t.color, t.colorMap);
            sCtx.strokeStyle = darkenColor(turretFill(t.color, t.colorMap), 0.598);
            sCtx.lineWidth = strokeWidth;
            sCtx.stroke();
            sCtx.fill();
        }
        }

        const fovDeg = t.fov ?? 200;
        const fovSizeVal = t.fovSize ?? 10;
        let primaryOffset = 0;
        let hasPrimary = false;
        if (isAuto && t.primarySubTurretId && t.autoSubTurrets && t.autoSubTurrets.length > 0) {
            for (let si = 0; si < t.autoSubTurrets.length; si++) {
                if (t.autoSubTurrets[si].id === t.primarySubTurretId) {
                    primaryOffset = t.autoSubTurrets[si].angle;
                    hasPrimary = true;
                    break;
                }
            }
        }
        let gpuFovA = 0, gpuFovR = 0;
        if (isAuto && hasPrimary && fovDeg > 0 && fovSizeVal > 0) {
            const fovKey = `fov-preset-${ti}`;
            const fovVal = `${fovDeg}-${fovSizeVal}`;
            const fovAlpha = _getOverlayAlpha(fovKey, fovVal, 0.15, 1/60);
            if (gpu) { if (fovAlpha > 0.001) { gpuFovA = fovAlpha; gpuFovR = _fovArcRadius(logic, t); } }
            else if (fovAlpha > 0.001) {
                const arcRadius = _fovArcRadius(logic, t);
                sCtx.save();
                sCtx.rotate(primaryOffset);
                sCtx.globalAlpha = fovAlpha;
                sCtx.fillStyle = '#ffdd44';
                sCtx.beginPath();
                if (fovDeg >= 360) {
                    sCtx.arc(0, 0, arcRadius, 0, Math.PI * 2);
                } else {
                    const fovHalf = (fovDeg * Math.PI / 180) / 2;
                    sCtx.moveTo(0, 0);
                    sCtx.arc(0, 0, arcRadius, -fovHalf, fovHalf);
                    sCtx.closePath();
                }
                sCtx.fill();
                if (fovDeg < 360) {
                    const fovHalf = (fovDeg * Math.PI / 180) / 2;
                    sCtx.globalAlpha = Math.min(fovAlpha * 2.7, 0.4);
                    sCtx.strokeStyle = '#ffdd44';
                    sCtx.lineWidth = 1.5;
                    sCtx.beginPath();
                    sCtx.moveTo(0, 0);
                    sCtx.lineTo(arcRadius * Math.cos(-fovHalf), arcRadius * Math.sin(-fovHalf));
                    sCtx.moveTo(0, 0);
                    sCtx.lineTo(arcRadius * Math.cos(fovHalf), arcRadius * Math.sin(fovHalf));
                    sCtx.stroke();
                }
                sCtx.restore();
                sCtx.globalAlpha = 1;
            }
        }

        if (!gpu) sCtx.restore();

        const shiftedXOff = isAuto
            ? t.xOffset + snapPresetShift
            : t.xOffset * _w15CombinedScale + _w15XShift + snapPresetShift;
        for (let _aIdx = 0; _aIdx < angles.length; _aIdx++)
        for (let _m = 0; _m < (mirrorSet ? 2 : 1); _m++) {
            const _mir = _m === 1;
            const _baseAng = angles[_aIdx];
            const _cosB = _presetAngleCosBuf[_aIdx];
            const _sinB = _presetAngleSinBuf[_aIdx];
            const effectiveAngle = t.angle + _baseAng;
            const rotX = shiftedXOff * _cosB - fitY * _sinB;
            const rotY = shiftedXOff * _sinB + fitY * _cosB;

            if (gpu) {
                const gx = rotX * layerSizePx / 2, gy = (_mir ? -rotY : rotY) * layerSizePx / 2;
                const ga = _mir ? -effectiveAngle : effectiveAngle;
                if (!isAuto) { _ghostBarrel(t, gx, gy, ga, tLen, tWid, sizePx); continue; }
                const tp = _mir ? _presetMirrorOf(t) : t;
                if (gpuFovA > 0) {
                    ctx.save();
                    if (!tankLocal) { ctx.translate(logic.tankPos.x, logic.tankPos.y); ctx.rotate(logic.tankAngle); }
                    ctx.translate(gx, gy);
                    ctx.rotate(_mir ? -(effectiveAngle + primaryOffset) : effectiveAngle + primaryOffset);
                    _ghostFovArc(ctx, fovDeg, gpuFovR, gpuFovA, 0.6);
                    ctx.restore();
                }
                if (subReach > 0) _ghostSubs(tp, gx, gy, ga, circleR, sizePx, false);
                _ghostBase(t, gx, gy, circleR, t.autoCircleColorMatch ? _editorBodyColor(logic) : turretFill(t.color, t.colorMap), 0);
                if (subReach > 0) _ghostSubs(tp, gx, gy, ga, circleR, sizePx, true);
                continue;
            }

            const _lookMir = _mir && !isAuto && t.look !== undefined;
            if (_mir && !_lookMir) { cCtx.save(); cCtx.scale(1, -1); }
            if (_lookMir) {
                cCtx.save();
                cCtx.translate(rotX * layerSizePx / 2, -rotY * layerSizePx / 2);
                cCtx.rotate(-effectiveAngle);
                cCtx.drawImage(sc, 0, 0, scaledBuf, scaledBuf, -bufSize / 2, -bufSize / 2, bufSize, bufSize);
                cCtx.restore();
                continue;
            }
            cCtx.save();
            cCtx.translate(rotX * layerSizePx / 2, rotY * layerSizePx / 2);
            cCtx.rotate(effectiveAngle);
            cCtx.drawImage(sc, 0, 0, scaledBuf, scaledBuf, -bufSize / 2, -bufSize / 2, bufSize, bufSize);
            cCtx.restore();

            if (isAuto) {
                cCtx.save();
                cCtx.translate(rotX * layerSizePx / 2, rotY * layerSizePx / 2);
                const circleColor = t.autoCircleColorMatch ? _editorBodyColor(logic) : turretFill(t.color, t.colorMap);
                const pvSides = t.autoCircleBaseSides ?? 0;
                const pvDepth = autoBaseDepth(pvSides, t.autoCircleBaseDepth);
                const pvOff = autoBaseTurn(pvSides, pvDepth);
                if (subReach > 0) _ghostAutoSubs(cCtx, t, effectiveAngle, circleR, pvSides, pvDepth, pvOff, sizePx, turretBodyScale, subReach, false);
                cCtx.beginPath();
                if (pvSides >= 3) { _autoBasePath(cCtx, pvSides, pvDepth, circleR, pvOff); }
                else { cCtx.arc(0, 0, circleR, 0, Math.PI * 2); }
                cCtx.fillStyle = circleColor;
                cCtx.fill();
                const halfSW = strokeWidth / 2;
                cCtx.beginPath();
                if (pvSides >= 3) {
                    _autoBasePath(cCtx, pvSides, pvDepth, circleR + halfSW, pvOff);
                    _autoBasePath(cCtx, pvSides, pvDepth, circleR, pvOff);
                } else {
                    cCtx.arc(0, 0, circleR + halfSW, 0, Math.PI * 2);
                    cCtx.arc(0, 0, circleR, 0, Math.PI * 2, true);
                }
                cCtx.fillStyle = darkenColor(circleColor, 0.598);
                cCtx.fill('evenodd');
                if (subReach > 0) _ghostAutoSubs(cCtx, t, effectiveAngle, circleR, pvSides, pvDepth, pvOff, sizePx, turretBodyScale, subReach, true);
                cCtx.restore();
            }
            if (_mir) cCtx.restore();
        }
    }

    if (gpu) { _ghostEnd(ctx, 0.6); return; }
    cCtx.restore();

    ctx.save();
    if (!tankLocal) {
        ctx.translate(logic.tankPos.x, logic.tankPos.y);
        ctx.rotate(logic.tankAngle);
    }
    ctx.globalAlpha = 0.6;
    ctx.drawImage(_presetCompCanvas!, 0, 0, compSizePx, compSizePx, -compHalf, -compHalf, compSize, compSize);
    ctx.restore();
}

function drawAutoSubTurretPreview(ctx: CanvasRenderingContext2D, logic: GameLogic, tankLocal = false) {
    const _ox = tankLocal ? 0 : logic.tankPos.x, _oy = tankLocal ? 0 : logic.tankPos.y;
    if (logic.state.isTestMode) return;
    const parentId = logic.state.autoSubTurretParentId;
    if (!parentId) return;
    const parent = logic.state.turrets.find(t => t.id === parentId);
    if (!parent || parent.turretType !== 'auto') return;

    const subT = logic.state.autoSubTurretEditing;

    const baseSizePx = tankSizeFromSlider(logic.state.tankSize);
    let parentSizeRatio = 1.0;
    let parentLayerSides = logic.state.tankSides;
    for (let li = 0; li < logic.state.bodyLayers.length; li++) {
        if (logic.state.bodyLayers[li].turretIds.indexOf(parentId) !== -1) {
            parentSizeRatio = logic.state.bodyLayers[li].sizeRatio;
            parentLayerSides = logic.state.bodyLayers[li].sides;
            break;
        }
    }
    const sizePx = baseSizePx * parentSizeRatio;
    const circleR = _mapVal(parent.autoCircleSize ?? 25, 0, 50, 0, sizePx * 0.96) * 0.7;
    const subSizePx = circleR * 2;

    const parentOffX = parent.xOffset * sizePx / 2;
    const parentOffY = parent.yOffset * sizePx / 2;
    const cosA = Math.cos(logic.tankAngle);
    const sinA = Math.sin(logic.tankAngle);
    const circleCX = parentOffX * cosA - parentOffY * sinA;
    const circleCY = parentOffX * sinA + parentOffY * cosA;

    const mx = (logic.mouseX - logic.width / 2) / logic.zoom + (logic.cameraX - logic.tankPos.x);
    const my = (logic.mouseY - logic.height / 2) / logic.zoom + (logic.cameraY - logic.tankPos.y);
    let desiredAngle = Math.atan2(my - circleCY, mx - circleCX);

    if (logic.state.autoSubTurretSnapPlacement) {
        if (logic.state.tankSides >= 3) {
            desiredAngle = snapAngleToFaceMidpoint(desiredAngle, logic.state.tankSides, logic.tankAngle);
        } else {
            desiredAngle = snapAngleToGrid(desiredAngle, SNAP_COUNTS[logic.state.autoSubTurretSnapPlacementCount]);
        }
    } else if (logic.keys.has('ShiftLeft') || logic.keys.has('ShiftRight')) {
        desiredAngle = snapAngleToGrid(desiredAngle, 16);
    }

    const subLen = _mapVal(subT.length, 1, 100, subSizePx * 0.01, subSizePx / 2 + subSizePx * 10);
    const subWid = _mapVal(subT.width, 0, 50, 0, subSizePx * 0.96);
    const subAspect = subT.aspect;
    const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);

    const subLookExt = subT.look !== undefined ? lookUnit(subT.look, sizePx) * lookReach(subT.look) : 0;
    const maxDim = subLookExt > 0 ? subLookExt : Math.max(subLen, subWid * subAspect);
    const bufSize = Math.ceil(maxDim * 2 + strokeWidth * 2 + 40);
    const cs = scratchScale(bufSize, _PREVIEW_MAX_SCRATCH_PX, _currentCacheScale);
    const scaledBuf = Math.ceil(bufSize * cs);
    const gpu = _ghostOn && _edTankGL !== null;
    if (gpu) _ghostFrameOfTank(logic);
    else getScratch(bufSize, bufSize, cs);
    const sc = scratchCanvas!;
    const sCtx = scratchCtx!;

    if (!gpu) {
    sCtx.save();
    sCtx.translate(scaledBuf / 2, scaledBuf / 2);
    sCtx.scale(cs, cs);
    sCtx.lineJoin = 'round';

    const topY = -subWid / 2;
    const botY = subWid / 2;
    const topScaled = topY * subAspect;
    const botScaled = botY * subAspect;

    if (subT.look !== undefined) {
        _drawLook2D(sCtx, subT.look, sizePx, strokeWidth, false, 0);
    } else {
        sCtx.beginPath();
        roundedBarrelPath(sCtx, subLen, topY, botY, topScaled, botScaled);
        sCtx.fillStyle = turretFill(subT.color, subT.colorMap);
        sCtx.strokeStyle = darkenColor(turretFill(subT.color, subT.colorMap), 0.598);
        sCtx.lineWidth = strokeWidth;
        sCtx.stroke();
        sCtx.fill();
    }
    sCtx.restore();
    }

    const circleAngle = logic.tankAngle + parent.angle;
    const relativeAngle = desiredAngle - circleAngle;

    const clipR = circleR + strokeWidth / 2;
    const vpW = logic.width / logic.zoom;
    const vpH = logic.height / logic.zoom;
    ctx.save();
    if (subT.aboveBase !== true) {
        ctx.beginPath();
        ctx.rect(_ox - vpW, _oy - vpH, vpW * 2, vpH * 2);
        ctx.arc(_ox + circleCX, _oy + circleCY, clipR, 0, Math.PI * 2, true);
        ctx.clip('evenodd');
    }

    const drawSubGhost = (relAngle: number, yOff: number) => {
        if (gpu) {
            const pa = parent.angle, pc = Math.cos(pa), ps = Math.sin(pa);
            const ax = subT.xOffset * subSizePx / 2, ay = yOff * subSizePx / 2;
            _ghostBegin();
            _ghostBarrel(subT, parentOffX + ax * pc - ay * ps, parentOffY + ax * ps + ay * pc, pa + relAngle, subLen, subWid, sizePx);
            _ghostEnd(ctx, 0.6);
            return;
        }
        ctx.save();
        ctx.translate(_ox + circleCX, _oy + circleCY);
        ctx.rotate(circleAngle);
        ctx.translate(subT.xOffset * subSizePx / 2, yOff * subSizePx / 2);
        ctx.rotate(relAngle);

        ctx.globalAlpha = 0.6;
        ctx.drawImage(sc, 0, 0, scaledBuf, scaledBuf, -bufSize / 2, -bufSize / 2, bufSize, bufSize);
        ctx.restore();
    };

    if (logic.state.autoSubTurretAutoPlacement) {
        const offsets = logic.getCompassAngles(logic.state.autoSubTurretAutoPlacementCount);
        for (let i = 0; i < offsets.length; i++) {
            drawSubGhost(relativeAngle + offsets[i], subT.yOffset);
        }
    } else {
        drawSubGhost(relativeAngle, subT.yOffset);
        if (logic.state.autoSubTurretMirrorMode) {
            drawSubGhost(-relativeAngle, -subT.yOffset);
        }
    }
    ctx.restore();
}

function drawAutoSubTurretPresetPreview(ctx: CanvasRenderingContext2D, logic: GameLogic, tankLocal = false) {
    const _ox = tankLocal ? 0 : logic.tankPos.x, _oy = tankLocal ? 0 : logic.tankPos.y;
    if (logic.state.isTestMode) return;
    const parentId = logic.state.autoSubTurretParentId;
    if (!parentId) return;
    const parent = logic.state.turrets.find(t => t.id === parentId);
    if (!parent || parent.turretType !== 'auto') return;

    const previewTurrets = logic.presetPieces();
    if (previewTurrets.length === 0) return;
    const subMirrorSet = logic.state.autoSubTurretMirrorMode && !logic.state.autoSubTurretAutoPlacement;

    const baseSizePx = tankSizeFromSlider(logic.state.tankSize);
    let parentSizeRatio = 1.0;
    for (let li = 0; li < logic.state.bodyLayers.length; li++) {
        if (logic.state.bodyLayers[li].turretIds.indexOf(parentId) !== -1) {
            parentSizeRatio = logic.state.bodyLayers[li].sizeRatio;
            break;
        }
    }
    const sizePx = baseSizePx * parentSizeRatio;
    const circleR = _mapVal(parent.autoCircleSize ?? 25, 0, 50, 0, sizePx * 0.96) * 0.7;
    const subSizePx = circleR * 2;

    const parentOffX = parent.xOffset * sizePx / 2;
    const parentOffY = parent.yOffset * sizePx / 2;
    const cosA = Math.cos(logic.tankAngle);
    const sinA = Math.sin(logic.tankAngle);
    const circleCX = parentOffX * cosA - parentOffY * sinA;
    const circleCY = parentOffX * sinA + parentOffY * cosA;

    const mx = (logic.mouseX - logic.width / 2) / logic.zoom + (logic.cameraX - logic.tankPos.x);
    const my = (logic.mouseY - logic.height / 2) / logic.zoom + (logic.cameraY - logic.tankPos.y);
    let desiredAngle = Math.atan2(my - circleCY, mx - circleCX);
    if (logic.state.autoSubTurretSnapPlacement) {
        if (logic.state.tankSides >= 3) {
            desiredAngle = snapAngleToFaceMidpoint(desiredAngle, logic.state.tankSides, logic.tankAngle);
        } else {
            desiredAngle = snapAngleToGrid(desiredAngle, SNAP_COUNTS[logic.state.autoSubTurretSnapPlacementCount]);
        }
    } else if (logic.keys.has('ShiftLeft') || logic.keys.has('ShiftRight')) {
        desiredAngle = snapAngleToGrid(desiredAngle, 16);
    }
    const circleAngle = logic.tankAngle + parent.angle;
    const baseAngleOffset = desiredAngle - circleAngle;
    const cosB = Math.cos(baseAngleOffset);
    const sinB = Math.sin(baseAngleOffset);

    const strokeWidth = Math.max(MIN_STROKE_SCREEN_PX / logic.zoom, FIXED_STROKE_WIDTH);

    let maxExtent = 0;
    let turretCount = 0;
    for (let ti = 0; ti < previewTurrets.length; ti++) {
        const t = previewTurrets[ti];
        if (t.turretType === 'auto' && t.autoSubTurrets && t.autoSubTurrets.length > 0) continue;
        turretCount++;

        const isAuto = t.turretType === 'auto';
        const effLength = isAuto ? (t.autoTurretLength ?? 10) : t.length;
        const effWidth = isAuto ? (t.autoTurretWidth ?? 25) : t.width;
        const tLen = _mapVal(effLength, 1, 100, subSizePx * 0.01, subSizePx / 2 + subSizePx * 10);
        const tWid = _mapVal(effWidth, 0, 50, 0, subSizePx * 0.96);
        const circR2 = isAuto ? _mapVal(t.autoCircleSize ?? 25, 0, 50, 0, subSizePx * 0.96) * 0.7 : tWid * 0.7;
        const maxW = tWid * t.aspect;
        const hyp = (!isAuto && t.look !== undefined) ? lookUnit(t.look, sizePx) * lookReach(t.look) : Math.sqrt(tLen * tLen + (maxW / 2) * (maxW / 2));
        const bufSize = Math.ceil(Math.max(hyp, circR2) * 2 + strokeWidth * 2 + 40);

        const rotX = t.xOffset * cosB - t.yOffset * sinB;
        const rotY = t.xOffset * sinB + t.yOffset * cosB;
        const posDist = Math.sqrt(rotX * rotX + rotY * rotY) * subSizePx / 2;
        const ext = posDist + bufSize / 2;
        if (ext > maxExtent) maxExtent = ext;
    }

    if (turretCount === 0) return;

    const compSize = Math.ceil(maxExtent * 2 + 4);
    const compHalf = compSize / 2;
    const compCs = scratchScale(Math.max(compSize, 1), _PREVIEW_COMP_MAX_PX, _currentCacheScale);
    const compSizePx = Math.ceil(compSize * compCs);
    const gpu = _ghostOn && _edTankGL !== null;
    const cCtx = gpu ? (null as unknown as CanvasRenderingContext2D) : _ensurePresetComp(compSizePx);
    const pa = parent.angle, pc = Math.cos(pa), ps = Math.sin(pa);

    if (gpu) { _ghostFrameOfTank(logic); _ghostBegin(); }
    else {
    cCtx.save();
    cCtx.translate(compSizePx / 2, compSizePx / 2);
    cCtx.scale(compCs, compCs);
    }

    for (let ti = 0; ti < previewTurrets.length; ti++) {
        const t = previewTurrets[ti];
        if (t.turretType === 'auto' && t.autoSubTurrets && t.autoSubTurrets.length > 0) continue;
        const isAuto = t.turretType === 'auto';
        const effLength = isAuto ? (t.autoTurretLength ?? 10) : t.length;
        const effWidth = isAuto ? (t.autoTurretWidth ?? 25) : t.width;
        const tLen = _mapVal(effLength, 1, 100, subSizePx * 0.01, subSizePx / 2 + subSizePx * 10);
        const tWid = _mapVal(effWidth, 0, 50, 0, subSizePx * 0.96);
        const aspect = t.aspect;
        const circR2 = isAuto ? _mapVal(t.autoCircleSize ?? 25, 0, 50, 0, subSizePx * 0.96) * 0.7 : tWid * 0.7;
        const maxW = tWid * aspect;
        const hyp = (!isAuto && t.look !== undefined) ? lookUnit(t.look, sizePx) * lookReach(t.look) : Math.sqrt(tLen * tLen + (maxW / 2) * (maxW / 2));
        const bufSize = Math.ceil(Math.max(hyp, circR2) * 2 + strokeWidth * 2 + 40);

        if (gpu) {
            for (let _m = 0; _m < (subMirrorSet ? 2 : 1); _m++) {
                const effA = _m === 1 ? -(t.angle + baseAngleOffset) : t.angle + baseAngleOffset;
                const rx = (t.xOffset * cosB - t.yOffset * sinB) * subSizePx / 2, ry0 = (t.xOffset * sinB + t.yOffset * cosB) * subSizePx / 2;
                const ry = _m === 1 ? -ry0 : ry0;
                const lx = parentOffX + rx * pc - ry * ps, ly = parentOffY + rx * ps + ry * pc;
                if (!isAuto) _ghostBarrel(t, lx, ly, pa + effA, tLen, tWid, sizePx);
                else _ghostBase(t, lx, ly, circR2, t.autoCircleColorMatch ? _editorBodyColor(logic) : turretFill(t.color, t.colorMap), pa);
            }
            continue;
        }

        const cs = scratchScale(bufSize, _PREVIEW_MAX_SCRATCH_PX, _currentCacheScale);
        const scaledBuf = Math.ceil(bufSize * cs);
        getScratch(bufSize, bufSize, cs);
        const sc = scratchCanvas!;
        const sCtx = scratchCtx!;

        sCtx.save();
        sCtx.translate(scaledBuf / 2, scaledBuf / 2);
        sCtx.scale(cs, cs);
        sCtx.lineJoin = 'round';

        if (!isAuto && t.look !== undefined) {
            _drawLook2D(sCtx, t.look, sizePx, strokeWidth, false, 0);
        } else if (!isAuto) {
            const topY = -tWid / 2;
            const botY = tWid / 2;
            const topScaled = topY * aspect;
            const botScaled = botY * aspect;
            sCtx.beginPath();
            roundedBarrelPath(sCtx, tLen, topY, botY, topScaled, botScaled);
            sCtx.fillStyle = turretFill(t.color, t.colorMap);
            sCtx.strokeStyle = darkenColor(turretFill(t.color, t.colorMap), 0.598);
            sCtx.lineWidth = strokeWidth;
            sCtx.stroke();
            sCtx.fill();
        }
        sCtx.restore();

        const effectiveAngle = t.angle + baseAngleOffset;
        const rotX = t.xOffset * cosB - t.yOffset * sinB;
        const rotY = t.xOffset * sinB + t.yOffset * cosB;

        for (let _m = 0; _m < (subMirrorSet ? 2 : 1); _m++) {
        const _mir = _m === 1, _lookMir = _mir && !isAuto && t.look !== undefined;
        if (_mir && !_lookMir) { cCtx.save(); cCtx.scale(1, -1); }
        cCtx.save();
        cCtx.translate(rotX * subSizePx / 2, (_lookMir ? -rotY : rotY) * subSizePx / 2);
        cCtx.rotate(_lookMir ? -effectiveAngle : effectiveAngle);
        cCtx.drawImage(sc, 0, 0, scaledBuf, scaledBuf, -bufSize / 2, -bufSize / 2, bufSize, bufSize);
        cCtx.restore();

        if (isAuto) {
            cCtx.save();
            cCtx.translate(rotX * subSizePx / 2, rotY * subSizePx / 2);
            const circleColor = t.autoCircleColorMatch ? _editorBodyColor(logic) : turretFill(t.color, t.colorMap);
            const pvSides = t.autoCircleBaseSides ?? 0;
            const pvDepth = autoBaseDepth(pvSides, t.autoCircleBaseDepth);
            const pvOff = autoBaseTurn(pvSides, pvDepth);
            cCtx.beginPath();
            if (pvSides >= 3) { _autoBasePath(cCtx, pvSides, pvDepth, circR2, pvOff); }
            else { cCtx.arc(0, 0, circR2, 0, Math.PI * 2); }
            cCtx.fillStyle = circleColor;
            cCtx.fill();
            const halfSW = strokeWidth / 2;
            cCtx.beginPath();
            if (pvSides >= 3) {
                _autoBasePath(cCtx, pvSides, pvDepth, circR2 + halfSW, pvOff);
                _autoBasePath(cCtx, pvSides, pvDepth, circR2, pvOff);
            } else {
                cCtx.arc(0, 0, circR2 + halfSW, 0, Math.PI * 2);
                cCtx.arc(0, 0, circR2, 0, Math.PI * 2, true);
            }
            cCtx.fillStyle = darkenColor(circleColor, 0.598);
            cCtx.fill('evenodd');
            cCtx.restore();
        }
        if (_mir && !_lookMir) cCtx.restore();
        }
    }

    if (!gpu) cCtx.restore();

    const clipR = circleR + strokeWidth / 2;
    const vpW = logic.width / logic.zoom;
    const vpH = logic.height / logic.zoom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(_ox - vpW, _oy - vpH, vpW * 2, vpH * 2);
    ctx.arc(_ox + circleCX, _oy + circleCY, clipR, 0, Math.PI * 2, true);
    ctx.clip('evenodd');

    if (gpu) { _ghostEnd(ctx, 0.6); ctx.restore(); return; }

    ctx.save();
    ctx.translate(_ox + circleCX, _oy + circleCY);
    ctx.rotate(circleAngle);
    ctx.globalAlpha = 0.6;
    ctx.drawImage(_presetCompCanvas!, 0, 0, compSizePx, compSizePx, -compHalf, -compHalf, compSize, compSize);
    ctx.restore();

    ctx.restore();
}

export function renderSceneFrame(ctx: CanvasRenderingContext2D, logic: GameLogic): void {
  render(ctx, logic, 1 / 60);
}
export function renderSceneDone(): void {
  clearEnemyDeathCanvasCache();
  if (SMALL_FIX.G660 !== 0) { _layerBulletRender.logic = null; _layerBulletRender.bulletsArr = null; _layerBulletRender.viewportBounds = null; }
}
