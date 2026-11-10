import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GameLogic } from '../game/GameLogic';
import { getIconColor, buildTankLibraryMap, getMenuTankLibraryItems, isMenuTank } from '../game/evolutionTree';
import { pageCardLabel } from '../game/bookTrees';
import { isGameDark } from '../utils/gameColors';
import { gameThemeVersion } from '../utils/gameTheme';
import { useHudScale } from '../utils/useGuiScale';
import { getEffectiveDPR, getEffectiveViewportHeight, getEffectiveViewportWidth } from '../utils/zoomCompensation';
import { teamOverrideColor } from '../types';
import type { LibraryItem, TankConfig } from '../types';
import {
  hudColors, hudTileBands, hudUpLayout, hudUpFitCols, hudUpTileX, hudUpTileY, hudUpSpinAngle, hudSlideStep,
  HUD_UP_TILE, HUD_UP_SPIN, HUD_UP_BAND_SPLIT, HUD_UP_BAND_ALPHA, HUD_RING, HUD_UP_ICON, HUD_ICON_OUTLINE,
  HUD_UP_NAME_FONT, HUD_UP_KEY_FONT, HUD_UP_NAME_DX, HUD_UP_KEY_RIGHT, HUD_UP_TEXT_BOTTOM, HUD_UP_KEYS,
  HUD_DU_TEXT, HUD_DU_W, HUD_DU_H, HUD_DU_FONT, HUD_STROKE_F, HUD_FONT_FAMILY,
} from '../utils/hudArras';
import { hudBuildIcon, hudDrawIcon } from '../utils/hudIcon2d';
import { hudSlideLayer } from '../utils/hudLayer';
import type { HudIcon } from '../utils/hudIcon2d';
import { keepStyle } from '../utils/keptStyle';
import { mobileActive, mobHud, mobTilesChanged } from '../utils/mobileMode';
import { mobTileColY, MOB_FIT_W } from '../utils/mobileArras';
import { SMALL_FIX } from '../game/smallFixSwitch';
const HUD_DU_CSS = `
.hud-du .hud-du-bands { background: linear-gradient(to bottom, var(--du-t) 60%, var(--du-b) 60%); }
.hud-du:hover .hud-du-bands { background: linear-gradient(to bottom, var(--du-th) 60%, var(--du-bh) 60%); }
.hud-du:active .hud-du-bands { background: linear-gradient(to bottom, var(--du-tp) 60%, var(--du-bh) 60%); }
`;

let _spinSec = 0;

const ICON_SPIN_EVERY_FRAME: boolean = typeof location !== 'undefined' && /[?&]oldiconspin(?:[=&]|$)/.test(location.search);
const ICON_STEP_PX = 0.25;

const _icons = new WeakMap<TankConfig, Map<string, HudIcon>>();
function iconFor(config: TankConfig, dark: boolean, body: string | undefined): HudIcon {
  let m = _icons.get(config);
  if (!m) { m = new Map(); _icons.set(config, m); }
  const key = (dark ? 'd' : 'l') + gameThemeVersion() + '|' + (body ?? '');
  let ic = m.get(key);
  if (!ic) { ic = hudBuildIcon(config, dark, body); m.set(key, ic); }
  return ic;
}

const _bands = new Map<string, { top: string; bottom: string }>();
function bandsFor(i: number, dark: boolean): { top: string; bottom: string } {
  const hex = getIconColor(i, dark);
  const key = hex + (dark ? 'd' : 'l');
  let b = _bands.get(key);
  if (!b) { b = hudTileBands(hex, dark); _bands.set(key, b); }
  return b;
}

interface TileDraw { cx: number; cy: number; icon: HudIcon | null; }

interface PanelAnim {
  p: number;
  target: number;
  raf: number;
  lastMs: number;
  shown: readonly string[] | null;
  dismissing: boolean;
  paused: boolean;
  root: HTMLDivElement | null;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  tiles: TileDraw[];
  hidePx: number;
  iconPx: number;
  outlinePx: number;
  dpr: number;
  shownX: number;
  paintedRoot: HTMLDivElement | null;
  layered: boolean;
  drawnSec: number;
  phone: boolean;
  rows: number;
  colY: number;
  bump: () => void;
  frame: (nowMs: number) => void;
}

function paintSlide(a: PanelAnim): void {
  const root = a.root;
  if (!root) return;
  const x = -(1 - a.p) * a.hidePx;
  if (root !== a.paintedRoot) a.layered = false;
  if (root !== a.paintedRoot || x !== a.shownX) {
    root.style.transform = `translateX(${x}px)`;
    a.paintedRoot = root; a.shownX = x;
  }
  a.layered = hudSlideLayer(root, a.p !== a.target, a.layered);
  if (a.phone) { mobHud.tileRowsTarget = a.rows * a.target; mobHud.tileTarget = a.target; mobHud.tileColY = a.colY; mobHud.tileP = a.p; publishPhoneRows(a.rows * a.p); }
}

function publishPhoneRows(tr: number): void {
  if (tr === mobHud.tileRows) return;
  mobHud.tileRows = tr;
  mobTilesChanged();
}

function drawIcons(a: PanelAnim): void {
  const cv = a.canvas;
  if (!cv) return;
  if (!a.ctx) a.ctx = cv.getContext('2d');
  const ctx = a.ctx;
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  a.drawnSec = _spinSec;
  const angle = hudUpSpinAngle(_spinSec);
  const tiles = a.tiles;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t.icon) hudDrawIcon(ctx, t.icon, t.cx, t.cy, a.iconPx, angle, a.outlinePx, a.dpr);
  }
}

function newAnim(): PanelAnim {
  const a: PanelAnim = {
    p: 0, target: 0, raf: 0, lastMs: 0, shown: null, dismissing: false, paused: false,
    root: null, canvas: null, ctx: null, tiles: [], hidePx: 0, iconPx: 0, outlinePx: 0, dpr: 1,
    shownX: NaN, paintedRoot: null, layered: false, drawnSec: NaN, phone: false, rows: 0, colY: 0, bump: () => {}, frame: () => {},
  };
  a.frame = (nowMs: number) => {
    a.raf = 0;
    const dt = nowMs > a.lastMs ? (nowMs - a.lastMs) / 1000 : 0;
    a.lastMs = nowMs;
    if (!a.paused) _spinSec += dt;
    if (a.p !== a.target) a.p = hudSlideStep(a.p, a.target, dt);
    if (a.p === 0 && a.target === 0) {
      a.shown = null; a.dismissing = false;
      a.bump();
      return;
    }
    paintSlide(a);
    if (ICON_SPIN_EVERY_FRAME || !(Math.abs(_spinSec - a.drawnSec) * HUD_UP_SPIN * (a.iconPx * 0.5 + a.outlinePx) * a.dpr < ICON_STEP_PX)) drawIcons(a);
    if (!a.paused || a.p !== a.target) a.raf = requestAnimationFrame(a.frame);
  };
  return a;
}

function fitColsNow(scale: number): number {
  return SMALL_FIX.GH735 !== 0 && scale > 0 ? hudUpFitCols(getEffectiveViewportWidth() / scale) : 0;
}
function useFitCols(scale: number): number {
  const [cols, setCols] = useState<number>(() => fitColsNow(scale));
  useEffect(() => {
    if (SMALL_FIX.GH735 === 0) return;
    const onResize = () => { const n = fitColsNow(scale); setCols(p => (p === n ? p : n)); };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [scale]);
  return cols;
}

const TankEvolutionMenu: React.FC<{ logic: GameLogic; dark?: boolean }> = ({ logic, dark: darkProp }) => {
  keepStyle('k-hud-du', HUD_DU_CSS);
  const s = logic.state;
  const dark = darkProp ?? isGameDark();
  const scale = useHudScale();
  const [, setTick] = useState(0);

  const tankMap = useMemo(() => {
    const map = buildTankLibraryMap(s.tankLibrary, s.gameModeConfig.mode);
    const menuItems = getMenuTankLibraryItems(dark);
    for (const [name, item] of menuItems) map.set(name, item);
    return map;
  }, [s.tankLibrary, dark, s.gameModeConfig.mode]);

  const handlePick = useCallback(
    (fileName: string) => logic.evolveToTank(fileName, true),
    [logic],
  );

  const animRef = useRef<PanelAnim | null>(null);
  if (animRef.current === null) animRef.current = newAnim();
  const a = animRef.current;
  a.bump = () => setTick(t => t + 1);

  const watching = logic.spectatedTank() !== null;
  const live = !watching && s.evolutionMenuVisible && s.availableEvolutions.length > 0 ? s.availableEvolutions : null;
  if (watching && a.shown !== null) a.dismissing = true;
  if (live !== null) {
    if (a.shown === null) a.p = 0;
    a.shown = live; a.target = 1; a.dismissing = false;
  } else if (a.shown !== null) {
    if (a.dismissing) a.target = 0;
    else { a.shown = null; a.p = 0; a.target = 0; }
  }
  a.paused = s.paused;

  const list = a.shown;
  const phone = mobileActive();
  const fitCols = useFitCols(scale);
  const lay = list ? hudUpLayout(list.length, phone, fitCols) : null;
  a.phone = phone;
  a.rows = lay ? lay.rows * lay.scale : 0;
  a.colY = lay && list && phone ? mobTileColY(list.length, lay.cols, lay.rows, lay.scale, MOB_FIT_W) : 0;
  const col = hudColors(dark);
  const u = scale * (lay ? lay.scale : 1);
  a.hidePx = lay ? lay.hideDist * u : 0;
  a.iconPx = HUD_UP_ICON * u;
  a.outlinePx = HUD_ICON_OUTLINE * u;
  a.dpr = getEffectiveDPR();

  const tiles: { i: number; fileName: string; item: LibraryItem; body: string | undefined; name: string }[] = [];
  const onMenuPage = isMenuTank(s.currentTankFileName ?? '');
  const draws: TileDraw[] = [];
  if (list && lay) {
    for (let i = 0; i < list.length; i++) {
      const item = tankMap.get(list[i]);
      if (!item) continue;
      const cfg = item.fileData.data as TankConfig;
      const body = teamOverrideColor(logic.playerTankColorTeamIndex(list[i], cfg.keepOwnColor), dark);
      tiles.push({ i, fileName: list[i], item, body, name: (onMenuPage ? pageCardLabel(list[i]) : undefined) ?? item.name });
      draws.push({
        cx: (hudUpTileX(i, lay.cols) + HUD_UP_TILE / 2) * u,
        cy: (hudUpTileY(i, lay.cols) + HUD_UP_TILE / 2) * u,
        icon: iconFor(cfg, dark, body),
      });
    }
  }
  a.tiles = draws;

  const setRoot = useCallback((el: HTMLDivElement | null) => { a.root = el; if (el === null && SMALL_FIX.G726 !== 0) a.paintedRoot = null; }, [a]);
  const setCanvas = useCallback((el: HTMLCanvasElement | null) => {
    if (el !== a.canvas) { a.canvas = el; a.ctx = null; }
  }, [a]);

  const boxW = lay ? lay.width * u : 0;
  const boxH = lay ? lay.height * u : 0;

  useLayoutEffect(() => {
    if (a.phone && !a.shown) { mobHud.tileRowsTarget = 0; mobHud.tileTarget = 0; mobHud.tileP = 0; publishPhoneRows(0); }
    if (!a.shown) return;
    const cv = a.canvas;
    if (cv) {
      const bw = Math.max(1, Math.round(boxW * a.dpr));
      const bh = Math.max(1, Math.round(boxH * a.dpr));
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; a.ctx = null; }
    }
    paintSlide(a);
    drawIcons(a);
    if (a.raf === 0 && (!a.paused || a.p !== a.target)) {
      a.lastMs = performance.now();
      a.raf = requestAnimationFrame(a.frame);
    }
  });
  useEffect(() => () => { if (a.raf !== 0) { cancelAnimationFrame(a.raf); a.raf = 0; } }, [a]);

  if (!list || !lay) return null;

  const overflow = boxH > getEffectiveViewportHeight();
  const ringInset = -HUD_RING / 2 * u;
  const ringStyle: React.CSSProperties = {
    position: 'absolute', left: ringInset, top: ringInset, right: ringInset, bottom: ringInset,
    border: `${HUD_RING * u}px solid ${col.ink}`, borderRadius: (HUD_RING / 2) * u, pointerEvents: 'none',
  };
  const ring = (w: number, h: number) => SMALL_FIX.R945 !== 0
    ? <svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        <rect x={0} y={0} width={w} height={h} fill="none" stroke={col.ink} strokeWidth={HUD_RING * u} strokeLinejoin="round" />
      </svg>
    : <div style={ringStyle} />;
  const text = (font: number): React.CSSProperties => ({
    position: 'absolute', fontFamily: HUD_FONT_FAMILY, fontWeight: 'bold', fontSize: font * u,
    lineHeight: `${font * u}px`, height: font * u, color: col.text, whiteSpace: 'pre',
    WebkitTextStroke: `${HUD_STROKE_F * font * u}px ${col.ink}`, paintOrder: 'stroke fill',
    letterSpacing: 'normal', pointerEvents: 'none',
  });
  const dismissing = a.dismissing;

  return (
    <div
      ref={setRoot}
      className="absolute custom-scrollbar"
      style={{
        top: 0, left: 0, maxHeight: '100%',
        overflowY: overflow ? 'auto' : 'hidden', overflowX: 'hidden',
        pointerEvents: overflow ? 'auto' : 'none',
      }}
    >
      <div style={{ position: 'relative', width: boxW, height: boxH }}>
        {tiles.map(t => {
          const b = bandsFor(t.i, dark);
          return (
            <div
              key={t.fileName}
              onClick={dismissing ? undefined : () => handlePick(t.fileName)}
              style={{
                position: 'absolute', left: hudUpTileX(t.i, lay.cols) * u, top: hudUpTileY(t.i, lay.cols) * u,
                width: HUD_UP_TILE * u, height: HUD_UP_TILE * u,
                cursor: 'var(--cur-pointer)', pointerEvents: dismissing ? 'none' : 'auto',
              }}
            >
              <div style={{
                position: 'absolute', inset: 0, opacity: HUD_UP_BAND_ALPHA,
                background: `linear-gradient(to bottom, ${b.top} ${HUD_UP_BAND_SPLIT * 100}%, ${b.bottom} ${HUD_UP_BAND_SPLIT * 100}%)`,
              }} />
              {ring(HUD_UP_TILE * u, HUD_UP_TILE * u)}
            </div>
          );
        })}

        <canvas
          ref={setCanvas}
          style={{ position: 'absolute', left: 0, top: 0, width: boxW, height: boxH, pointerEvents: 'none' }}
        />

        {tiles.map(t => {
          const x = hudUpTileX(t.i, lay.cols);
          const y = hudUpTileY(t.i, lay.cols);
          const key = t.i < HUD_UP_KEYS.length ? HUD_UP_KEYS[t.i] : undefined;
          return (
            <React.Fragment key={t.fileName}>
              <div style={{
                ...text(HUD_UP_NAME_FONT),
                left: (x + HUD_UP_TILE / 2 + (key ? HUD_UP_NAME_DX : 0)) * u,
                top: (y + HUD_UP_TILE - HUD_UP_TEXT_BOTTOM - HUD_UP_NAME_FONT) * u,
                transform: 'translateX(-50%)',
              }}>{t.name}</div>
              {key && (
                <div style={{
                  ...text(HUD_UP_KEY_FONT),
                  left: (x + HUD_UP_TILE - HUD_UP_KEY_RIGHT) * u,
                  top: (y + HUD_UP_TILE - HUD_UP_TEXT_BOTTOM - HUD_UP_KEY_FONT) * u,
                  transform: 'translateX(-100%)',
                }}>{`[${key}]`}</div>
              )}
            </React.Fragment>
          );
        })}

        <div
          className="hud-du"
          onClick={dismissing ? undefined : () => { a.dismissing = true; logic.dismissEvolutionMenu(); }}
          style={{
            position: 'absolute', left: lay.btnLeft * u, top: lay.btnTop * u,
            width: HUD_DU_W * u, height: HUD_DU_H * u, cursor: 'var(--cur-pointer)',
            pointerEvents: dismissing ? 'none' : 'auto',
            ['--du-t' as string]: col.duTop, ['--du-b' as string]: col.duBottom,
            ['--du-th' as string]: col.duTopHover, ['--du-bh' as string]: col.duBottomHover,
            ['--du-tp' as string]: col.duTopPressed,
          } as React.CSSProperties}
        >
          <div className="hud-du-bands" style={{ position: 'absolute', inset: 0, opacity: HUD_UP_BAND_ALPHA }} />
          {ring(HUD_DU_W * u, HUD_DU_H * u)}
          <div style={{
            ...text(HUD_DU_FONT), left: 0, right: 0, top: ((HUD_DU_H - HUD_DU_FONT) / 2) * u, textAlign: 'center',
          }}>{HUD_DU_TEXT}</div>
        </div>
      </div>

    </div>
  );
};

export default TankEvolutionMenu;
