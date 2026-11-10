import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import { SMALL_FIX } from '../game/smallFixSwitch';
import { GameLogic } from '../game/GameLogic';
import { AT_ON_LEADERBOARD } from '../game/adminPanel';
import { Turret, BodyLayer, TEAM_COLORS_DARK, TEAM_COLORS_LIGHT, isFfaStyleMode } from '../types';
import { darkenColor, getRealSizeFactor } from '../utils/p5Utils';
import { getEffectiveDPR } from '../utils/zoomCompensation';
import { useNewArrasHudScale } from '../utils/useGuiScale';
import { turretFillIn, setGameDarkMode, bodyFillIn } from '../utils/gameColors';
import { CM } from '../utils/colorMap';
const NO_TURRETS: Turret[] = [];
import { gameDark } from '../utils/gameTheme';
import { useGameThemeVersion } from '../utils/useGameTheme';
import { drawOtherList } from '../utils/otherDraw';
import { lookList, lookUnit } from '../utils/placedLook';
import {
    TARGET_STROKE_SCREEN_PX, GRID_SPACING,
    mapVal,
    sortTurretsByLayer as _lbSortTurrets,
    sortSubTurretsByLayer as _lbSortSubTurrets,
    bodyLayerSortBuf as _lbBodyLayerSortBuf,
    bodyLayerCmp as _lbBodyLayerCmp,
    buildTurretLayerFlags as _lbBuildTurretLayerFlags,
    getTurretOnLayer, getTurretLayerOrder,
    roundedPolygonPath, roundedBarrelPath,
    roundedStarPath as _lbRoundedStarPath,
    strokeFillPolygonCopies as _lbStrokeFillPolygonCopies,
    drawHealerCross as _lbDrawHealerCrossRaw,
} from './shared/tankIconRenderer';
import { computeCircumcircle } from './TankPreview';
import { lbU32, lbAbbrev, lbScoreOf } from '../utils/hudEase';
import { autoBaseDepth, autoBaseTurn } from '../utils/autoBaseShape';
import {
  LbRow, LbBoard, lbNewBoard, lbClearBoard, lbApplyUpdate, lbStep, lbMoving, lbFoldValues, lbBlending,
  lbTitleOff, lbFillFrac, lbRowPrefix, lbIconColorIndex, lbBarColorIndex, LB_PITCH, LB_SLIDE, LB_BAR_LEN,
  lbFitPrefix, lbNumShape, LB_NUM_MASKS, LB_LABEL_MAX,
} from '../utils/lbAnim';
import { botNameGlyphsRun } from '../utils/botNameGlyphs';
import { layerOutlineOf, strokeFillLayerOutline } from '../utils/layerOutline';
import { layerColourOf, LAYER_BODY, LAYER_TEAM, anyForcedTeamLayer } from '../game/teamColourSwitch';
import { mobileActive, subscribeMobile, mobHud, mobKeys, subscribeMobKeys, subscribeMobSticks } from '../utils/mobileMode';
import { motionOff } from './kit/presence';
import { MOB_BOARD_TITLE } from '../utils/mobileArras';
import { hudSlideLayer } from '../utils/hudLayer';
import { hudSlideStep } from '../utils/hudArras';

const LB_LAYER_REST_MS = 200;

function lbLayerTeam(index: number, palette: readonly string[]): string | undefined {
  return index >= 0 ? palette[index] : undefined;
}

function _lbDrawHealerCross(ctx: CanvasRenderingContext2D, sizePx: number, strokeWidth: number): void {
    _lbDrawHealerCrossRaw(ctx, sizePx, strokeWidth, darkenColor);
}

let _lbTurretOnLayer: Uint8Array;
let _lbTurretLayerOrder: Int8Array;
function _refreshLayerAccessors(): void {
    _lbTurretOnLayer = getTurretOnLayer();
    _lbTurretLayerOrder = getTurretLayerOrder();
}
_refreshLayerAccessors();


interface Props {
  logic: GameLogic | null;
}

interface LeaderboardEntry {
  id: string;
  name: string;
  tankType: string;
  fixedLabel?: string;
  score: number;
  isPlayer: boolean;
  tankColor: string;
  barColor: string;
  tankSides: number;
  turrets: Turret[];
  tankSize: number;
  bodyLayers?: BodyLayer[];
  isHealer?: boolean;
  tankShapeDepth?: number;
  tankShapeCurved?: boolean;
  teamColorOverride: boolean;
  layerTeamColor?: string;
}

const NO_ENTRIES: readonly LeaderboardEntry[] = [];

const LB_BAR_RIGHT = 30.5;
const LB_OUTLINE_H = 16;
const LB_TRACK_H = 11;
const LB_ROW_Y = 60;
const LB_ICON_GAP = 13;
const LB_ICON_SIZE = 13.5;
const LB_ICON_BOX = 19;
const LB_ROW_FONT = 11;
const LB_TITLE_FONT = 19;
const LB_TITLE_TOP = 23;
const LB_TITLE_H = 25;
const LB_ROOT_W = 520;
const LB_TEXT_BOX = 600;
const LB_FONT_FAMILY = "Ubuntu, 'Inter', sans-serif";

function lbFontPx(px: number, s: number): number {
  return Math.ceil(px * s * 10 - 1e-9) / 10;
}

interface LbRowView extends LbRow {
  id: string;
  entry: LeaderboardEntry;
  prefix: string;
  rowRef: React.RefObject<HTMLDivElement | null>;
  fillRef: React.RefObject<HTMLDivElement | null>;
  textRef: React.RefObject<HTMLDivElement | null>;
  pRowEl: HTMLDivElement | null;
  pX: number;
  pY: number;
  pFillEl: HTMLDivElement | null;
  pFill: number;
  pTextEl: HTMLDivElement | null;
  pN: number;
  pPrefix: string | null;
  pLabel: string;
  pShape: number;
  pFitGen: number;
  pHid: boolean;
}

function lbMakeRow(e: LeaderboardEntry): LbRowView {
  return {
    old: 0, now: 0, stampUs: 0, rank: 0, rankTo: 0, off: 1, offTo: 0,
    leaving: false, leftUs: 0, seen: 0, shown: 0,
    id: e.id, entry: e, prefix: lbRowPrefix(e.name, e.tankType),
    rowRef: React.createRef<HTMLDivElement>(), fillRef: React.createRef<HTMLDivElement>(),
    textRef: React.createRef<HTMLDivElement>(),
    pRowEl: null, pX: NaN, pY: NaN, pFillEl: null, pFill: NaN, pTextEl: null, pN: NaN, pPrefix: null, pLabel: '',
    pShape: -1, pFitGen: -1, pHid: false,
  };
}

let _lbRuler: CanvasRenderingContext2D | null = null;
let _lbRulerPx = -1;
let _lbRulerWatched = false;
let _lbFitGen = 0;
const _lbNumW = new Float64Array(LB_NUM_MASKS.length).fill(-1);

function lbMeasure(text: string): number {
  return _lbRuler !== null ? _lbRuler.measureText(text).width : 0;
}

function lbRulerFor(fontPx: number): boolean {
  if (_lbRuler === null) {
    if (_lbRulerPx === -2 || typeof document === 'undefined') return false;
    _lbRuler = document.createElement('canvas').getContext('2d');
    if (_lbRuler === null) { _lbRulerPx = -2; return false; }
  }
  if (!_lbRulerWatched) {
    _lbRulerWatched = true;
    try { document.fonts.addEventListener('loadingdone', () => { _lbRulerPx = -1; }); } catch { }
  }
  if (fontPx !== _lbRulerPx) {
    _lbRulerPx = fontPx;
    _lbRuler.font = `bold ${fontPx}px ${LB_FONT_FAMILY}`;
    _lbFitGen++;
    _lbNumW.fill(-1);
  }
  return true;
}

function lbRefit(r: LbRowView, shape: number, s: number): void {
  r.pShape = shape;
  r.pFitGen = _lbFitGen;
  const e = r.entry;
  if (_lbRuler === null || !e.name) { r.prefix = lbRowPrefix(e.name, e.tankType); return; }
  let numW = _lbNumW[shape];
  if (numW < 0) numW = _lbNumW[shape] = lbMeasure(LB_NUM_MASKS[shape]);
  r.prefix = lbFitPrefix(e.name, e.tankType, numW, LB_LABEL_MAX * s, lbMeasure);
}

interface LbView {
  board: LbBoard<LbRowView>;
  applied: readonly LeaderboardEntry[] | null;
  scale: number;
  raf: number;
  lastMs: number;
  frame: (nowMs: number) => void;
  titleRef: React.RefObject<HTMLDivElement | null>;
  pTitleEl: HTMLDivElement | null;
  pTitleX: number;
  pub: GameLogic | null;
  maxRows: number;
}

function lbPaint(v: LbView, clockUs: number): boolean {
  const board = v.board;
  const held = board.held;
  const s = v.scale;
  const max = lbFoldValues(board, clockUs);
  const pub = v.pub;
  if (pub && pub.lbShownMax !== max) {
    pub.lbShownMax = max;
    if (pub.onLbShownMax) pub.onLbShownMax();
  }
  const rowFontPx = lbFontPx(LB_ROW_FONT, s);
  if (rowFontPx !== _lbRulerPx) lbRulerFor(rowFontPx);
  for (let i = 0; i < held.length; i++) {
    const r = held[i];
    const row = r.rowRef.current;
    if (row) {
      const x = LB_SLIDE * s * r.off;
      const y = LB_PITCH * s * r.rank;
      const hid = r.rank > v.maxRows - 0.5;
      if (row !== r.pRowEl || hid !== r.pHid) { row.style.opacity = hid ? '0' : ''; r.pHid = hid; }
      if (row !== r.pRowEl || x !== r.pX || y !== r.pY) {
        row.style.transform = `translate(${x}px,${y}px)`;
        r.pRowEl = row; r.pX = x; r.pY = y;
      }
    }
    const fill = r.fillRef.current;
    if (fill) {
      const fx = (lbFillFrac(r.shown, max) - 1) * LB_BAR_LEN * s;
      if (fill !== r.pFillEl || fx !== r.pFill) {
        fill.style.transform = `translateX(${fx}px)`;
        r.pFillEl = fill; r.pFill = fx;
      }
    }
    const n = lbU32(r.shown);
    const text = r.textRef.current;
    if (text && (text !== r.pTextEl || n !== r.pN || r.prefix !== r.pPrefix || r.pFitGen !== _lbFitGen)) {
      const shape = lbNumShape(lbU32(r.now > r.old ? r.now : r.old));
      if (shape !== r.pShape || r.pFitGen !== _lbFitGen) lbRefit(r, shape, s);
      const label = r.entry.fixedLabel ?? r.prefix + lbAbbrev(n);
      if (text !== r.pTextEl || label !== r.pLabel) { text.textContent = label; r.pLabel = label; }
      r.pTextEl = text; r.pN = n; r.pPrefix = r.prefix;
    }
  }
  const title = v.titleRef.current;
  if (title) {
    const tx = LB_SLIDE * s * lbTitleOff(board);
    if (title !== v.pTitleEl || tx !== v.pTitleX) {
      title.style.transform = `translateX(${tx}px)`;
      v.pTitleEl = title; v.pTitleX = tx;
    }
  }
  return lbBlending(board, clockUs);
}

function lbNewView(): LbView {
  const v: LbView = {
    board: lbNewBoard<LbRowView>(), applied: null, scale: 1, raf: 0, lastMs: 0,
    frame: () => {}, titleRef: React.createRef<HTMLDivElement>(), pTitleEl: null, pTitleX: NaN, pub: null, maxRows: Infinity,
  };
  v.frame = (nowMs: number) => {
    v.raf = 0;
    const s = v.scale;
    const moving = lbStep(v.board, (nowMs - v.lastMs) / 1000, LB_PITCH * s, LB_SLIDE * s);
    v.lastMs = nowMs;
    const blending = lbPaint(v, Math.floor(nowMs * 1000));
    if (moving || blending) v.raf = requestAnimationFrame(v.frame);
  };
  return v;
}

const TankPreviewMini: React.FC<{
  tankColor: string;
  tankSides: number;
  tankShapeDepth?: number;
  tankShapeCurved?: boolean;
  turrets: Turret[];
  tankSize: number;
  previewSize: number;
  left: number;
  top: number;
  iconSize: number;
  isDark?: boolean;
  themeV?: number;
  bodyLayers?: BodyLayer[];
  isHealer?: boolean;
  teamColorOverride?: boolean;
  layerTeamColor?: string;
}> = ({ tankColor, tankSides, tankShapeDepth, tankShapeCurved, turrets, tankSize, previewSize, left, top, iconSize, isDark, themeV, bodyLayers, isHealer, teamColorOverride, layerTeamColor }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setGameDarkMode(!!isDark);

    const rawDpr = getEffectiveDPR();
    const total = Math.max(2, Math.min(rawDpr, 2));
    canvas.width = Math.round(previewSize * total);
    canvas.height = Math.round(previewSize * total);
    canvas.style.width = `${previewSize}px`;
    canvas.style.height = `${previewSize}px`;
    ctx.scale(total, total);
    ctx.lineJoin = 'round';

    ctx.clearRect(0, 0, previewSize, previewSize);

    const tankSizePx = mapVal(tankSize, 1, 100, GRID_SPACING, 10 * GRID_SPACING);

    const availableSize = iconSize;

    const cc = computeCircumcircle(turrets, tankSizePx, tankSides, bodyLayers);

    const scale = availableSize / (cc.radius * 2);

    const STROKE_SCALE_THRESHOLD = 0.15;
    const MIN_STROKE_PX = 1.0;
    const adaptiveStrokePx = scale >= STROKE_SCALE_THRESHOLD
        ? TARGET_STROKE_SCREEN_PX
        : TARGET_STROKE_SCREEN_PX * (scale / STROKE_SCALE_THRESHOLD);
    const screenStroke = Math.max(MIN_STROKE_PX, adaptiveStrokePx) / scale;

    const FACING = -Math.PI / 4;

    ctx.save();
    ctx.translate(previewSize / 2, previewSize / 2);
    ctx.rotate(FACING);
    ctx.scale(scale, scale);
    ctx.translate(-cc.centerX, -cc.centerY);

    const bodyColor = tankColor;

    let lookHost = 0;
    const lookFill = (c: string, m: number): string => bodyFillIn(c, m, !!isDark);
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
            if (_cbDepth > 0) _lbRoundedStarPath(ctx, Math.floor(_cbSides), circleR, circleR * (1 - _cbDepth), _cbTurn, false);
            else roundedPolygonPath(ctx, _cbSides, circleR, _cbTurn);
          } else {
            ctx.arc(0, 0, circleR, 0, Math.PI * 2, true);
          }
          ctx.clip('evenodd');
        }

        const sortedSubs = _lbSortSubTurrets(t.autoSubTurrets!);
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

        const barrelColor = turretFillIn(t.color, t.colorMap, !!isDark);
        ctx.fillStyle = barrelColor;
        ctx.fill();
        ctx.strokeStyle = darkenColor(barrelColor, 0.598);
        ctx.lineWidth = screenStroke;
        ctx.stroke();
      }

      if (isAuto) {
        ctx.restore();
        const circleR = mapVal(t.autoCircleSize ?? 25, 0, 50, 0, effSizePx * 0.96) * 0.7;
        if (!t.autoCircleHidden) {
          const _abSides = t.autoCircleBaseSides ?? 0;
          ctx.beginPath();
          if (_abSides >= 3) {
            const _abDepth = autoBaseDepth(_abSides, t.autoCircleBaseDepth);
            if (_abDepth > 0) _lbRoundedStarPath(ctx, Math.floor(_abSides), circleR, circleR * (1 - _abDepth), autoBaseTurn(_abSides, _abDepth), false);
            else roundedPolygonPath(ctx, _abSides, circleR, autoBaseTurn(_abSides, 0));
          } else {
            ctx.arc(0, 0, circleR, 0, Math.PI * 2);
          }
          const circleColor = t.autoCircleColorMatch ? bodyColor : turretFillIn(t.color, t.colorMap, !!isDark);
          ctx.fillStyle = circleColor;
          ctx.fill();
          ctx.strokeStyle = darkenColor(circleColor, 0.598);
          ctx.lineWidth = screenStroke;
          ctx.stroke();
          if (t.autoCircleHealer) _lbDrawHealerCross(ctx, circleR * 2, screenStroke);
        }
        if (hasSubTurrets) {
          let anyAbove = false;
          for (let si = 0; si < t.autoSubTurrets!.length; si++) if (t.autoSubTurrets![si].aboveBase === true) { anyAbove = true; break; }
          if (anyAbove) {
            ctx.save();
            ctx.rotate(t.angle);
            const subsAbove = _lbSortSubTurrets(t.autoSubTurrets!);
            lookHost = effSizePx;
            for (let si = 0; si < subsAbove.length; si++) if (subsAbove[si].aboveBase === true) drawTurret(subsAbove[si], circleR * 2, t.angle);
            lookHost = 0;
            ctx.restore();
          }
        }
      }

      ctx.restore();
    };

    const sortedT = (turrets && turrets.length > 0) ? _lbSortTurrets(turrets) : null;
    const hasBodyLayers = bodyLayers != null && bodyLayers.length > 0;

    if (sortedT) {
      _lbBuildTurretLayerFlags(sortedT, bodyLayers);
      _refreshLayerAccessors();
    }

    if (hasBodyLayers) {
      _lbBodyLayerSortBuf.length = bodyLayers!.length;
      for (let bli = 0; bli < bodyLayers!.length; bli++) _lbBodyLayerSortBuf[bli] = bodyLayers![bli];
      if (bodyLayers!.length > 1) _lbBodyLayerSortBuf.sort(_lbBodyLayerCmp);
    }

    if (hasBodyLayers) {
      for (let bli = 0; bli < _lbBodyLayerSortBuf.length; bli++) {
        const bLayer = _lbBodyLayerSortBuf[bli];
        if (bLayer.renderOrder < 0) continue;

        const layerSizePx = tankSizePx * bLayer.sizeRatio;
        const layerHalf = layerSizePx / 2;
        const _lw = layerColourOf(bLayer, !!teamColorOverride, !!layerTeamColor);
        const layerColor = _lw === LAYER_BODY ? bodyColor : _lw === LAYER_TEAM ? layerTeamColor! : bodyFillIn(bLayer.color, bLayer.colorMap, !!isDark);

        ctx.save();

        if (sortedT) {
        for (let ti = 0; ti < sortedT.length; ti++) {
          if (!sortedT[ti].aboveTankBody && _lbTurretLayerOrder[ti] === bLayer.renderOrder) {
            drawTurret(sortedT[ti], layerSizePx);
          }
        }
        }

        ctx.lineJoin = 'round';
        const _lbOutline = layerOutlineOf(bLayer);
        if (_lbOutline !== null) {
          const _loStroke = darkenColor(layerColor, 0.598);
          strokeFillLayerOutline(ctx, _lbOutline, layerHalf, bLayer.initialAngle || 0, bLayer.copies, _loStroke, screenStroke, (isDark && bLayer.intangible) ? _loStroke : layerColor);
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
            _lbStrokeFillPolygonCopies(ctx, bLayer.sides, bLayer.copies, visualHalf, layerInitAngle,
              _cpStroke, screenStroke, (isDark && bLayer.intangible) ? _cpStroke : layerColor,
              bLayer.starDepth, bLayer.starCurved);
            ctx.beginPath();
          } else if (bLayer.starDepth > 0) {
            const innerR = visualHalf * (1 - bLayer.starDepth);
            _lbRoundedStarPath(ctx, bLayer.sides, visualHalf, innerR, layerInitAngle, bLayer.starCurved);
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
          _lbDrawHealerCross(ctx, layerSizePx, screenStroke);
        }

        if (sortedT) {
        for (let ti = 0; ti < sortedT.length; ti++) {
          if (sortedT[ti].aboveTankBody && _lbTurretLayerOrder[ti] === bLayer.renderOrder) {
            drawTurret(sortedT[ti], layerSizePx);
          }
        }
        }

        ctx.restore();
      }
    }

    if (sortedT) {
      for (let i = 0; i < sortedT.length; i++) {
        if (!sortedT[i].aboveTankBody && !_lbTurretOnLayer[i]) drawTurret(sortedT[i]);
      }
    }

    const drawBody = () => {
      const half = tankSizePx / 2;
      const rawSides = tankSides;
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
        const _mbDepth = tankShapeDepth ?? 0;
        if (_mbDepth > 0) {
          _lbRoundedStarPath(ctx, intSides, visualHalf, visualHalf * (1 - _mbDepth),
            evenOff + fracRotation, tankShapeCurved ?? false);
        } else {
          roundedPolygonPath(ctx, intSides, visualHalf, evenOff + fracRotation);
        }
      }
    };

    ctx.fillStyle = bodyColor;
    drawBody();
    ctx.fill();

    ctx.strokeStyle = darkenColor(bodyColor, 0.598);
    ctx.lineWidth = screenStroke;
    drawBody();
    ctx.stroke();

    if (isHealer) {
      _lbDrawHealerCross(ctx, tankSizePx, screenStroke);
    }

    if (sortedT) {
      for (let i = 0; i < sortedT.length; i++) {
        if (sortedT[i].aboveTankBody && !_lbTurretOnLayer[i]) drawTurret(sortedT[i]);
      }
    }

    if (hasBodyLayers) {
      for (let bli = 0; bli < _lbBodyLayerSortBuf.length; bli++) {
        const bLayer = _lbBodyLayerSortBuf[bli];
        if (bLayer.renderOrder >= 0) continue;

        const layerSizePx = tankSizePx * bLayer.sizeRatio;
        const layerHalf = layerSizePx / 2;
        const _lw = layerColourOf(bLayer, !!teamColorOverride, !!layerTeamColor);
        const layerColor = _lw === LAYER_BODY ? bodyColor : _lw === LAYER_TEAM ? layerTeamColor! : bodyFillIn(bLayer.color, bLayer.colorMap, !!isDark);

        ctx.save();

        if (sortedT) {
        for (let ti = 0; ti < sortedT.length; ti++) {
          if (!sortedT[ti].aboveTankBody && _lbTurretLayerOrder[ti] === bLayer.renderOrder) {
            drawTurret(sortedT[ti], layerSizePx);
          }
        }
        }

        ctx.lineJoin = 'round';
        const _lbOutline2 = layerOutlineOf(bLayer);
        if (_lbOutline2 !== null) {
          const _loStroke = darkenColor(layerColor, 0.598);
          strokeFillLayerOutline(ctx, _lbOutline2, layerHalf, bLayer.initialAngle || 0, bLayer.copies, _loStroke, screenStroke, (isDark && bLayer.intangible) ? _loStroke : layerColor);
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
            _lbStrokeFillPolygonCopies(ctx, bLayer.sides, bLayer.copies, visualHalf, layerInitAngle,
              _cpStroke, screenStroke, (isDark && bLayer.intangible) ? _cpStroke : layerColor,
              bLayer.starDepth, bLayer.starCurved);
            ctx.beginPath();
          } else if (bLayer.starDepth > 0) {
            const innerR = visualHalf * (1 - bLayer.starDepth);
            _lbRoundedStarPath(ctx, bLayer.sides, visualHalf, innerR, layerInitAngle, bLayer.starCurved);
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
          _lbDrawHealerCross(ctx, layerSizePx, screenStroke);
        }

        if (sortedT) {
        for (let ti = 0; ti < sortedT.length; ti++) {
          if (sortedT[ti].aboveTankBody && _lbTurretLayerOrder[ti] === bLayer.renderOrder) {
            drawTurret(sortedT[ti], layerSizePx);
          }
        }
        }

        ctx.restore();
      }
    }

    ctx.restore();
  }, [tankColor, tankSides, tankShapeDepth, tankShapeCurved, turrets, tankSize, previewSize, iconSize, isDark, themeV, bodyLayers, isHealer, teamColorOverride, layerTeamColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        left,
        top,
        width: previewSize,
        height: previewSize,
      }}
    />
  );
};

const LeaderboardRow = React.memo(function LeaderboardRow({
  row, s, isDark, themeV, leaving, tankColor, barColor, tankSides, tankShapeDepth, tankShapeCurved, turrets,
  tankSize, bodyLayers, isHealer, teamColorOverride, layerTeamColor,
}: {
  row: LbRowView;
  s: number;
  isDark: boolean;
  themeV: number;
  leaving: boolean;
  tankColor: string;
  barColor: string;
  tankSides: number;
  tankShapeDepth?: number;
  tankShapeCurved?: boolean;
  turrets: Turret[];
  tankSize: number;
  bodyLayers?: BodyLayer[];
  isHealer?: boolean;
  teamColorOverride: boolean;
  layerTeamColor?: string;
}) {
  setGameDarkMode(!!isDark);
  const barFill = barColor;
  const R = LB_ROOT_W;
  const outlineW = LB_BAR_LEN + LB_OUTLINE_H;
  const outlineLeft = R - LB_BAR_RIGHT - LB_BAR_LEN - LB_OUTLINE_H / 2;
  const trackW = LB_BAR_LEN + LB_TRACK_H;
  const trackLeft = R - LB_BAR_RIGHT - LB_BAR_LEN - LB_TRACK_H / 2;
  const centerX = R - LB_BAR_RIGHT - LB_BAR_LEN / 2;
  const iconX = outlineLeft - LB_ICON_GAP;
  const font = lbFontPx(LB_ROW_FONT, s);
  return (
    <div ref={row.rowRef} style={{ position: 'absolute', left: 0, top: 0, zIndex: leaving ? 0 : 1, transition: 'opacity 240ms ease' }}>
      <TankPreviewMini
        tankColor={tankColor}
        tankSides={tankSides}
        tankShapeDepth={tankShapeDepth}
        tankShapeCurved={tankShapeCurved}
        turrets={turrets}
        tankSize={tankSize}
        previewSize={LB_ICON_BOX * s}
        left={(iconX - LB_ICON_BOX / 2) * s}
        top={(LB_ROW_Y - LB_ICON_BOX / 2) * s}
        iconSize={LB_ICON_SIZE * s}
        isDark={isDark}
        themeV={themeV}
        bodyLayers={bodyLayers}
        isHealer={isHealer}
        teamColorOverride={teamColorOverride}
        layerTeamColor={layerTeamColor}
      />
      <div
        style={{
          position: 'absolute',
          left: outlineLeft * s,
          top: (LB_ROW_Y - LB_OUTLINE_H / 2) * s,
          width: outlineW * s,
          height: LB_OUTLINE_H * s,
          borderRadius: (LB_OUTLINE_H / 2) * s,
          backgroundColor: 'var(--ig-stroke)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: trackLeft * s,
          top: (LB_ROW_Y - LB_TRACK_H / 2) * s,
          width: trackW * s,
          height: LB_TRACK_H * s,
          borderRadius: (LB_TRACK_H / 2) * s,
          backgroundColor: 'var(--ig-empty)',
          overflow: 'hidden',
          contain: 'layout',
        }}
      >
        <div
          ref={row.fillRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: trackW * s,
            height: LB_TRACK_H * s,
            borderRadius: (LB_TRACK_H / 2) * s,
            backgroundColor: barFill,
          }}
        />
      </div>
      <div
        ref={row.textRef}
        style={{
          position: 'absolute',
          left: (centerX - LB_TEXT_BOX / 2) * s,
          top: (LB_ROW_Y - LB_OUTLINE_H / 2) * s,
          width: LB_TEXT_BOX * s,
          height: LB_OUTLINE_H * s,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
          lineHeight: 1,
          fontFamily: LB_FONT_FAMILY,
          fontWeight: 'bold',
          fontSize: font,
          color: 'var(--ig-text)',
          WebkitTextStroke: `${(font + 1) / 4.5}px var(--ig-stroke)`,
          paintOrder: 'stroke fill',
          contain: 'size layout',
        }}
      />
    </div>
  );
});

export const LeaderboardUI: React.FC<Props> = ({ logic }) => {
  const boardScale = useNewArrasHudScale();
  useLayoutEffect(() => {
    const m = mobRoot.current;
    if (m.s !== boardScale && (m.shift !== 0 || mobileActive())) { m.s = boardScale; m.shift = NaN; mobApply(); } else m.s = boardScale;
  });

  const roRef = useRef<ResizeObserver | null>(null);
  const mobRoot = useRef<{ el: HTMLDivElement | null; bottom: number; shift: number; s: number; f: number; top: number; right: number; w: number; h: number;
    layered: boolean; movedAt: number; raf: number; growRaf: number; growAt: number; out: boolean }>({ el: null, bottom: 0, shift: 0, s: 1, f: 1, top: 0, right: 0, w: 0, h: 0,
    layered: false, movedAt: 0, raf: 0, growRaf: 0, growAt: 0, out: false });
  const viewRef = useRef<LbView | null>(null);
  const layerRest = useCallback((now: number) => {
    const m = mobRoot.current;
    m.raf = 0;
    if (!m.el) { m.layered = false; return; }
    if (now - m.movedAt >= LB_LAYER_REST_MS) m.layered = hudSlideLayer(m.el, false, m.layered);
    else m.raf = requestAnimationFrame(layerRest);
  }, []);
  const fitOf = useCallback((): number => (mobileActive() && mobHud.viewW > 0 ? mobHud.boardB : 1), []);
  const shiftOf = useCallback((f: number): number => (mobileActive() ? (mobHud.boardTop - MOB_BOARD_TITLE * f) * mobRoot.current.s : 0), []);
  const paint = useCallback((sh: number, f: number) => {
    const m = mobRoot.current; const el = m.el;
    if (el && (sh !== m.shift || f !== m.f)) {
      el.style.transform = sh !== 0 || f !== 1 ? `translateY(${sh}px) scale(${f})` : '';
      el.style.transformOrigin = f !== 1 ? '100% 0' : '';
      m.layered = hudSlideLayer(el, true, m.layered);
      m.movedAt = performance.now();
      if (m.raf === 0) m.raf = requestAnimationFrame(layerRest);
    }
    m.shift = sh; m.f = f;
    if (logic && el) logic.leaderboardBottomCss = m.bottom + sh - m.h * (1 - f);
  }, [logic, layerRest]);
  const grow = useCallback((now: number) => {
    const m = mobRoot.current;
    m.growRaf = 0;
    if (!m.el) return;
    const fit = fitOf();
    const dt = Math.min(0.1, Math.max(0, (now - m.growAt) / 1000));
    m.growAt = now;
    const f = fit <= m.f || motionOff() ? fit : hudSlideStep(m.f, fit, dt);
    paint(shiftOf(f), f);
    if (f < fit) m.growRaf = requestAnimationFrame(grow);
  }, [fitOf, shiftOf, paint]);
  const rowsAndOut = useCallback(() => {
    const v = viewRef.current;
    const n = mobileActive() ? mobHud.boardN : Infinity;
    const want = n > 0 ? n : Infinity;
    if (v && v.maxRows !== want) { v.maxRows = want; lbPaint(v, Math.floor(performance.now() * 1000)); }
    const out = mobileActive() && mobHud.boardHide;
    if (out !== mobRoot.current.out) { mobRoot.current.out = out; keysSlideRef.current(); }
  }, []);
  const mobApply = useCallback(() => {
    const m = mobRoot.current;
    const fit = fitOf();
    rowsAndOut();
    if (fit > m.f && mobileActive() && !motionOff()) {
      paint(shiftOf(m.f), m.f);
      if (m.growRaf === 0) { m.growAt = performance.now(); m.growRaf = requestAnimationFrame(grow); }
      return;
    }
    paint(shiftOf(fit), fit);
  }, [fitOf, shiftOf, paint, grow, rowsAndOut]);
  useEffect(() => {
    const u2 = subscribeMobile(mobApply); const u3 = subscribeMobSticks(mobApply);
    return () => {
      u2(); u3(); const m = mobRoot.current;
      if (m.raf !== 0) { cancelAnimationFrame(m.raf); m.raf = 0; }
      if (m.growRaf !== 0) { cancelAnimationFrame(m.growRaf); m.growRaf = 0; }
    };
  }, [mobApply]);
  const keysSlide = useCallback(() => {
    const el = mobRoot.current.el;
    if (!el) return;
    const out = (mobKeys.open || mobRoot.current.out) && mobileActive();
    el.style.transition = motionOff() ? '' : 'translate 420ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.translate = out ? `${el.offsetWidth + 16}px 0` : '';
  }, []);
  useEffect(() => subscribeMobKeys(keysSlide), [keysSlide]);
  const keysSlideRef = useRef(keysSlide); keysSlideRef.current = keysSlide;
  const setRootRef = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    mobRoot.current.el = el; mobRoot.current.shift = 0; mobRoot.current.f = 1; mobRoot.current.layered = false;
    if (el && (mobKeys.open || mobRoot.current.out)) { el.style.translate = `${el.offsetWidth + 16}px 0`; }
    if (!logic) return;
    if (!el) {
      logic.leaderboardBottomCss = 0;
      return;
    }
    const publish = () => {
      logic.leaderboardBottomCss = el.offsetTop + el.offsetHeight;
      mobRoot.current.bottom = el.offsetTop + el.offsetHeight;
      mobRoot.current.top = el.offsetTop; mobRoot.current.h = el.offsetHeight;
      mobRoot.current.w = el.offsetWidth; mobRoot.current.right = el.offsetLeft + el.offsetWidth;
      if (mobRoot.current.shift !== 0 || mobileActive()) mobApply();
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    roRef.current = ro;
  }, [logic, mobApply]);

  const themeV = useGameThemeVersion();
  const isDark = gameDark();

  const [lbTick, setLbTick] = useState(0);
  useEffect(() => {
    if (!logic) return;
    const cb = () => setLbTick(t => t + 1);
    logic.onLeaderboardUpdate = cb;
    return () => {
      if (logic.onLeaderboardUpdate === cb) logic.onLeaderboardUpdate = null;
    };
  }, [logic]);

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!logic?.state.isTestMode) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, [logic?.state.isTestMode]);

  const inGame = !!logic?.state.isTestMode;
  useEffect(() => { botNameGlyphsRun(!inGame); }, [inGame]);

  const shown = !!logic && logic.state.isTestMode && visible;

  const entries = useMemo((): readonly LeaderboardEntry[] => {
    if (!logic || !shown) return NO_ENTRIES;

    const result: LeaderboardEntry[] = [];
    const _sides = logic.mevLbTeamRows();
    if (_sides !== null) {
      const pal = isDark ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;
      for (const r of _sides) {
        const col = r.team >= 0 ? pal[r.team] : bodyFillIn('', CM.BORDERS, isDark);
        result.push({ id: r.id, name: '', tankType: r.label, fixedLabel: r.label, score: r.value, isPlayer: false, tankColor: col, barColor: col,
          tankSides: 0, turrets: NO_TURRETS, tankSize: 5, teamColorOverride: true });
      }
      return result;
    }

    const _teamPalette = isDark ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;
    const _ffaStyle = isFfaStyleMode(logic.state.gameModeConfig.mode);

    const _pIdx = logic.playerColorTeamIndex();
    const _pIcon = lbIconColorIndex(_pIdx, _ffaStyle);
    const _pBar = lbBarColorIndex(_pIdx, _ffaStyle);
    const _pLive = logic.liveColorSlotOf(null);
    const _pLiveFill = _pLive >= 0 ? bodyFillIn('', _pLive, isDark) : '';
    if ((logic.admin.attrs & AT_ON_LEADERBOARD) !== 0) result.push({
      id: 'player',
      name: logic.getPlayerDisplayName(),
      tankType: logic.playerTankDisplayName() ?? logic.resolveTankDisplayName(null),
      score: lbScoreOf(logic.state, logic.shownScoreStartOf(null)),
      isPlayer: true,
      tankColor: _pLiveFill || (_pIcon >= 0 && _teamPalette[_pIcon]) || bodyFillIn(logic.state.tankColor, logic.state.tankColorMap, isDark),
      barColor: _pLiveFill || (_pBar >= 0 && _teamPalette[_pBar]) || bodyFillIn(logic.state.tankColor, logic.state.tankColorMap, isDark),
      tankSides: logic.state.tankSides,
      tankShapeDepth: logic.state.tankShapeDepth,
      tankShapeCurved: logic.state.tankShapeCurved,
      turrets: logic.state.turrets,
      tankSize: logic.state.tankSize,
      bodyLayers: logic.state.bodyLayers.length > 0 ? logic.state.bodyLayers : undefined,
      isHealer: logic.state.isHealer,
      teamColorOverride: _pIcon >= 0 || _pLiveFill !== '',
      layerTeamColor: !(_pIcon >= 0 || _pLiveFill !== '') && anyForcedTeamLayer(logic.state.bodyLayers) ? lbLayerTeam(logic.playerLayerTeamIndex(), _teamPalette) : undefined,
    });

    for (const enemy of logic.state.enemyTanks) {
      if (!enemy.active || enemy.isDying) continue;
      if (enemy.isSentryEnemy) continue;
      if (logic.isArenaCloser(enemy)) continue;
      if (enemy.spawnedByEntityId) continue;
      if (enemy.isBaseProtector || ((enemy._mevF ?? 0) & 16) !== 0) continue;
      const config = logic.state.enemyConfigs.find(c => c.id === enemy.configId);
      const name = config?.enemyName || 'Enemy';
      const originalTankSize = config?.tankConfig?.tankSize || 5;

      const _eIdx = logic.enemyColorTeamIndex(enemy);
      const _eIcon = lbIconColorIndex(_eIdx, _ffaStyle);
      const _eBar = lbBarColorIndex(_eIdx, _ffaStyle);
      const _eLive = logic.liveColorSlotOf(enemy);
      const _pSlot = _eLive === -2 && SMALL_FIX.GH636 !== 0 ? logic.admin.playerSlot() : -1;
      const _eLiveFill = _eLive >= 0 ? bodyFillIn('', _eLive, isDark)
        : _eLive === -2 && SMALL_FIX.GH636 !== 0 ? (_pSlot >= 0 ? bodyFillIn('', _pSlot, isDark) : (_pIcon >= 0 && _teamPalette[_pIcon]) || bodyFillIn(logic.state.tankColor, logic.state.tankColorMap, isDark)) : '';

      result.push({
        id: enemy.id,
        name: enemy.displayName || name,
        tankType: logic.mevKindWord(enemy) || (enemy.currentTankName ? logic.resolveTankDisplayName(enemy.currentTankName) : name),
        score: lbScoreOf(enemy, logic.shownScoreStartOf(enemy)),
        isPlayer: false,
        tankColor: _eLiveFill || (_eIcon >= 0 && _teamPalette[_eIcon]) || bodyFillIn(enemy.color, enemy.colorMap, isDark),
        barColor: _eLiveFill || (_eBar >= 0 && _teamPalette[_eBar]) || bodyFillIn(enemy.color, enemy.colorMap, isDark),
        tankSides: enemy.sides,
        tankShapeDepth: enemy.shapeDepth,
        tankShapeCurved: enemy.shapeCurved,
        turrets: enemy.turrets,
        tankSize: originalTankSize,
        bodyLayers: enemy.bodyLayers.length > 0 ? enemy.bodyLayers : undefined,
        isHealer: enemy.isHealer,
        teamColorOverride: _eIcon >= 0 || _eLiveFill !== '',
        layerTeamColor: !(_eIcon >= 0 || _eLiveFill !== '') && anyForcedTeamLayer(enemy.bodyLayers) ? lbLayerTeam(logic.enemyLayerTeamIndex(enemy), _teamPalette) : undefined,
      });
    }

    result.sort((a, b) => b.score - a.score);

    return result.slice(0, 10);
  }, [logic, shown, logic?.state.leaderboardVersion, logic?.state.playerName, logic?.state.currentTankFileName, logic?.state.editorTankLabel, isDark, lbTick]);

  if (viewRef.current === null) viewRef.current = lbNewView();
  const view = viewRef.current;
  view.scale = boardScale;
  view.pub = logic ?? null;
  if (entries !== view.applied) {
    view.applied = entries;
    if (!shown) {
      lbClearBoard(view.board);
    } else {
      lbApplyUpdate(view.board, entries, Math.floor(performance.now() * 1000), lbMakeRow);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const r = view.board.rows.get(e.id);
        if (r === undefined) continue;
        if (r.entry.name !== e.name || r.entry.tankType !== e.tankType) { r.prefix = lbRowPrefix(e.name, e.tankType); r.pShape = -1; }
        r.entry = e;
      }
    }
  }

  useLayoutEffect(() => {
    const now = performance.now();
    const blending = lbPaint(view, Math.floor(now * 1000));
    if ((blending || lbMoving(view.board)) && view.raf === 0) {
      view.lastMs = now;
      view.raf = requestAnimationFrame(view.frame);
    }
  });
  useEffect(() => () => { if (view.raf !== 0) { cancelAnimationFrame(view.raf); view.raf = 0; } }, [view]);
  useLayoutEffect(() => {
    let n = 0;
    if (shown) { const held = view.board.held; for (let i = 0; i < held.length; i++) { const r = held[i]; if (!r.leaving && r.rankTo + 1 > n) n = r.rankTo + 1; } }
    mobHud.boardRows = n;
  });
  useEffect(() => () => { mobHud.boardRows = 0; }, []);

  if (!shown) return null;

  const s = boardScale;
  const held = view.board.held;
  let slots = 0;
  for (let i = 0; i < held.length; i++) {
    const r = held[i];
    if (!r.leaving && r.rankTo + 1 > slots) slots = r.rankTo + 1;
  }
  const height = slots > 0 ? (LB_ROW_Y + LB_OUTLINE_H / 2 + LB_PITCH * (slots - 1)) * s : 0;
  const titleFont = lbFontPx(LB_TITLE_FONT, s);
  const centerX = LB_ROOT_W - LB_BAR_RIGHT - LB_BAR_LEN / 2;

  return (
    <div
      ref={setRootRef}
      className="absolute z-40 pointer-events-none select-none"
      data-lb-root=""
      style={{
        top: 'env(safe-area-inset-top, 0px)',
        right: 'env(safe-area-inset-right, 0px)',
        width: LB_ROOT_W * s,
        height,
        overflowX: 'clip',
      }}
    >
      <div
        ref={view.titleRef}
        style={{
          position: 'absolute',
          left: (centerX - LB_TEXT_BOX / 2) * s,
          top: LB_TITLE_TOP * s,
          width: LB_TEXT_BOX * s,
          height: LB_TITLE_H * s,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
          lineHeight: 1,
          fontFamily: LB_FONT_FAMILY,
          fontWeight: 'bold',
          fontSize: titleFont,
          color: 'var(--ig-text)',
          WebkitTextStroke: `${(titleFont + 1) / 4.5}px var(--ig-stroke)`,
          paintOrder: 'stroke fill',
        }}
      >
        Leaderboard
      </div>

      {held.map((r) => (
        <LeaderboardRow
          key={r.id}
          row={r}
          s={s}
          isDark={isDark}
          themeV={themeV}
          leaving={r.leaving}
          tankColor={r.entry.tankColor}
          barColor={r.entry.barColor}
          tankSides={r.entry.tankSides}
          tankShapeDepth={r.entry.tankShapeDepth}
          tankShapeCurved={r.entry.tankShapeCurved}
          turrets={r.entry.turrets}
          tankSize={r.entry.tankSize}
          bodyLayers={r.entry.bodyLayers}
          isHealer={r.entry.isHealer}
          teamColorOverride={r.entry.teamColorOverride}
          layerTeamColor={r.entry.layerTeamColor}
        />
      ))}
    </div>
  );
};
