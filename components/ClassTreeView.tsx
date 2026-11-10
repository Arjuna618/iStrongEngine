import React, { useRef, useEffect, useState } from 'react';
import { escapeIsOwned } from './shared/escapeStack';
import type { GameLogic } from '../game/GameLogic';
import {
  matchTreeGroups, EVOLUTION_TREE, ICON_COLOR_ORDER,
  DEFAULT_TREE_ROOT, buildTankLibraryMap, getMenuTankLibraryItems, getTreeRoot, getMenuTankColorIdx, isMenuTank,
} from '../game/evolutionTree';
import { pageCardLabel, bookTreeStartsListColours } from '../game/bookTrees';
import { isGameDark } from '../utils/gameColors';
import { CM, CM_USE, cmTable } from '../utils/colorMap';
import { borderBlendFor } from '../utils/gameTheme';
import { getEffectiveDPR } from '../utils/zoomCompensation';
import { getNewArrasHudScale } from '../utils/useGuiScale';
import { teamOverrideColor } from '../types';
import type { LibraryItem, TankConfig } from '../types';
import {
  CT_CELL, CT_TILE, CT_TILE_INSET, CT_P_MAX,
  CT_BAR_TOP, CT_BAR_H, CT_BAR_RING, CT_BAR_X_L, CT_BAR_FIELD_L, CT_BAR_FIELD_W, CT_BAR_PLUS_L,
  CT_BAR_MINUS_L, CT_BAR_BTN, CT_BAR_FONT, CT_BAR_TEXT_PAD,
  CT_SLOT_RED, CT_SLOT_GREY, CT_STROKE_BLEND_LIGHT, ctBorder,
  ctScreenScale, ctStep, ctOnWheel, ctButton, ctNameT, ctIconUnits, ctNameFontPx, ctNameStrokePx,
  ctNameMidUnits, ctBandRGB, ctBuildNodes, ctLayout, ctSearchKeep, ctNewView, ctCentreOn, ctOnOpen,
  ctClampCentre, ctDrag, ctPinch,
} from '../utils/classTreeArras';
import type { CtNode, CtLayout, CtSource, CtView } from '../utils/classTreeArras';
import { ctIconParts } from '../utils/classTreeIcon';
import { anyForcedTeamLayer } from '../game/teamColourSwitch';
import { classTreeGL, ctPackScene } from './classTreeGL';
import type { CtFrame, CtPacked } from './classTreeGL';
import { keepStyle } from '../utils/keptStyle';

const CT_SEARCH_CSS = `.ct-search::placeholder{color:rgb(182,182,182);opacity:1}
input.ct-search[type="text"],input.ct-search[type="text"]:focus{background-color:transparent!important;border-color:transparent!important;transition:none!important}`;

const _view: CtView = ctNewView();

const rgb01 = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const _PAL: readonly (readonly string[])[] = [cmTable(false, CM_USE.GENERAL), cmTable(true, CM_USE.GENERAL)];
const _css = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const _TOP: readonly (readonly [number, number, number])[][] = [_PAL[0].map(rgb01), _PAL[1].map(rgb01)];
const _BAND: readonly (readonly [number, number, number])[][] = [0, 1].map(th =>
  _PAL[th].map(h => ctBandRGB(h, ctBorder(th === 1)).map(c => c / 255) as [number, number, number]));
const _TEXT_CSS = [_PAL[0][CM.TEXT], _PAL[1][CM.TEXT]];
const _VEIL = ['rgba(255,255,255,0.5)', 'rgba(33,33,33,0.5)'];
const _BORDER_CSS = [_css(ctBorder(false)), _css(ctBorder(true))];
const _BORDER01 = [ctBorder(false).map(c => c / 255), ctBorder(true).map(c => c / 255)];
const _INK01 = ctBorder(false)[0] / 255;
const _LINE = [[_INK01 * 0.5, _INK01 * 0.5, _INK01 * 0.5, 0.5], [0xaa / 255, 0xaa / 255, 0xaa / 255, 1]];
const _BTN = [0, 1].map(th => {
  const top = _PAL[th][CT_SLOT_GREY];
  const n = parseInt(top.slice(1), 16);
  const band = ctBandRGB(top, ctBorder(th === 1));
  return { top: `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.6)`, band: `rgba(${band[0]},${band[1]},${band[2]},0.6)` };
});
export const __ctColorHooks = {
  TOP: _TOP, BAND: _BAND, VEIL: _VEIL, BORDER_CSS: _BORDER_CSS, BORDER01: _BORDER01, LINE: _LINE, BTN: _BTN,
  X_BUTTON: [_PAL[0][CT_SLOT_RED], _PAL[1][CT_SLOT_RED]], TEXT: _TEXT_CSS,
};

const ARROW_PAN_PX_PER_SEC = 1200;
const ARROW_FAST = 5;
const ICON_MIN_DEVICE_PX = 6;
const CLICK_SLOP = 5;

export interface ClassTreeData {
  root: string;
  nodes: CtNode[];
  names: string[];
  lower: string[];
  palette: Int8Array;
  full: CtLayout;
  lay: CtLayout;
}

export function buildClassTreeData(root: string, tankMap: Map<string, LibraryItem>): ClassTreeData {
  const src: CtSource = { groups: id => matchTreeGroups(id), has: id => tankMap.has(id) };
  const nodes = ctBuildNodes(root, src);
  const n = nodes.length;
  const names: string[] = new Array(n);
  const lower: string[] = new Array(n);
  const palette = new Int8Array(n);
  const passDown: (number | undefined)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const nd = nodes[i];
    const item = tankMap.get(nd.id);
    const label = nd.parent >= 0 && isMenuTank(nodes[nd.parent].id) ? pageCardLabel(nd.id) : undefined;
    const ownName: string | undefined = item?.name;
    names[i] = item ? (label ?? ownName ?? '') : '';
    lower[i] = (label ?? ownName ?? nd.id).toLowerCase();
    const own = getMenuTankColorIdx(nd.id) ?? (nd.parent >= 0 ? passDown[nd.parent] : undefined);
    palette[i] = own ?? ICON_COLOR_ORDER[nd.sib % ICON_COLOR_ORDER.length];
    passDown[i] = ((EVOLUTION_TREE[nd.id] && !isMenuTank(nd.id)) || bookTreeStartsListColours(nd.id)) ? undefined : own;
  }
  const full = ctLayout(nodes, null);
  return { root, nodes, names, lower, palette, full, lay: full };
}

export function setClassTreeQuery(data: ClassTreeData, query: string): void {
  const keep = ctSearchKeep(data.nodes, data.lower, query);
  data.lay = keep ? ctLayout(data.nodes, keep) : data.full;
}

const _partsCache = new Map<string, number[]>();

export const CT_BIG_TREE = 700;
export const CT_PARTS_NOW = 60;
export interface CtPartsPending {
  keys: string[]; cfgs: TankConfig[]; overrides: (string | undefined)[]; layerTeams: (string | undefined)[]; seen: Set<string>; dark: boolean; next: number;
}
export function ctNewPartsPending(): CtPartsPending {
  return { keys: [], cfgs: [], overrides: [], layerTeams: [], seen: new Set<string>(), dark: false, next: 0 };
}
function _clearPending(p: CtPartsPending): void {
  p.keys.length = 0; p.cfgs.length = 0; p.overrides.length = 0; p.layerTeams.length = 0; p.seen.clear(); p.next = 0;
}
export function ctBuildPendingParts(p: CtPartsPending, budgetMs: number, now: () => number): boolean {
  const t0 = now();
  while (p.next < p.keys.length) {
    const i = p.next++;
    if (!_partsCache.has(p.keys[i])) {
      const parts: number[] = [];
      ctIconParts(p.cfgs[i], p.dark, p.overrides[i], parts, p.layerTeams[i]);
      _partsCache.set(p.keys[i], parts);
    }
    if (now() - t0 >= budgetMs) break;
  }
  return p.next >= p.keys.length;
}

export function buildClassTreeScene(data: ClassTreeData, tankMap: Map<string, LibraryItem>, dark: boolean,
  colourIndexOf: (id: string, keepOwn: boolean | undefined) => number, pending?: CtPartsPending): CtPacked {
  const lay = data.lay;
  const n = lay.tileNode.length;
  const th = dark ? 1 : 0;
  let slice = false;
  if (pending) {
    _clearPending(pending);
    pending.dark = dark;
    if (n > CT_BIG_TREE) {
      for (let t = 0; t < n; t++) {
        const id = data.nodes[lay.tileNode[t]].id;
        const item = tankMap.get(id);
        if (!item) continue;
        const cfg = item.fileData.data as TankConfig;
        const override = teamOverrideColor(colourIndexOf(id, cfg.keepOwnColor), dark);
        const layerTeam = override === undefined && anyForcedTeamLayer(cfg.bodyLayers) ? teamOverrideColor(colourIndexOf(id, false), dark) : undefined; const key = id + '|' + th + '|' + (override ?? '') + '|' + (layerTeam ?? '');
        if (_partsCache.has(key) || pending.seen.has(key)) continue;
        pending.seen.add(key); pending.keys.push(key); pending.cfgs.push(cfg); pending.overrides.push(override); pending.layerTeams.push(layerTeam);
      }
      slice = pending.keys.length > CT_PARTS_NOW;
      if (!slice) _clearPending(pending);
    }
  }
  const tileTop: number[] = new Array(n * 3);
  const tileBand: number[] = new Array(n * 3);
  const tileParts: (number[] | null)[] = new Array(n);
  const tileName: string[] = new Array(n);
  for (let t = 0; t < n; t++) {
    const node = lay.tileNode[t];
    const pi = data.palette[node];
    const top = _TOP[th][pi], band = _BAND[th][pi];
    tileTop[t * 3] = top[0]; tileTop[t * 3 + 1] = top[1]; tileTop[t * 3 + 2] = top[2];
    tileBand[t * 3] = band[0]; tileBand[t * 3 + 1] = band[1]; tileBand[t * 3 + 2] = band[2];
    const id = data.nodes[node].id;
    const item = tankMap.get(id);
    tileName[t] = data.names[node];
    if (!item) { tileParts[t] = null; continue; }
    const cfg = item.fileData.data as TankConfig;
    const override = teamOverrideColor(colourIndexOf(id, cfg.keepOwnColor), dark);
    const layerTeam = override === undefined && anyForcedTeamLayer(cfg.bodyLayers) ? teamOverrideColor(colourIndexOf(id, false), dark) : undefined; const key = id + '|' + th + '|' + (override ?? '') + '|' + (layerTeam ?? '');
    let parts = _partsCache.get(key);
    if (!parts) {
      if (slice) { tileParts[t] = null; continue; }
      parts = [];
      ctIconParts(cfg, dark, override, parts, layerTeam);
      _partsCache.set(key, parts);
    }
    tileParts[t] = parts;
  }
  return ctPackScene({ cols: lay.cols, tileCol: lay.tileCol, tileRow: lay.tileRow, tileTop, tileBand, tileParts, tileName, segs: lay.segs });
}

interface TreeInput {
  cssW: number; cssH: number;
  isDragging: boolean;
  dragStartX: number; dragStartY: number;
  lastX: number; lastY: number;
  panX: number; panY: number; panFast: boolean;
  sceneStale: boolean;
  dirty: boolean;
  dCx: number; dCy: number; dP: number; dW: number; dH: number;
  dark: boolean; cTest: boolean; cMode: string; cTeam: number; cCrown: boolean;
  shiftX: number; shiftY: number;
}

const _frame: CtFrame = { cx: 0, cy: 0, a: 0, w: 0, h: 0, px: 0, py: 0, icon: 0, nameMid: 0, nameScale: 0, snap: false,
  ink: _BORDER01[0], strokeBlend: CT_STROKE_BLEND_LIGHT, line: _LINE[0] };

let _pendingNames: Set<string> | null = null;
const _partsPending: CtPartsPending = ctNewPartsPending();
const _nowMs = (): number => performance.now();

const ClassTreeView: React.FC<{ logic: GameLogic }> = ({ logic }) => {
  keepStyle('k-ct-search', CT_SEARCH_CSS);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [darkUi, setDarkUi] = useState(isGameDark);
  const [barScale, setBarScale] = useState(getNewArrasHudScale);
  const stateRef = useRef<TreeInput>({
    cssW: 0, cssH: 0,
    isDragging: false,
    dragStartX: 0, dragStartY: 0,
    lastX: 0, lastY: 0,
    panX: 0, panY: 0, panFast: false,
    sceneStale: true, dirty: true,
    dCx: NaN, dCy: NaN, dP: NaN, dW: 0, dH: 0,
    dark: isGameDark(), cTest: false, cMode: '', cTeam: -1, cCrown: false,
    shiftX: 0, shiftY: 0,
  });

  const tankMapRef = useRef<Map<string, LibraryItem>>(new Map());
  const dataRef = useRef<ClassTreeData | null>(null);

  useEffect(() => {
    const lib = logic.state.tankLibrary;
    if (!lib) return;
    const map = buildTankLibraryMap(lib, logic.state.gameModeConfig.mode);
    const dark = isGameDark();
    for (const [name, item] of getMenuTankLibraryItems(dark)) map.set(name, item);
    tankMapRef.current = map;

    const root = getTreeRoot(logic.state.currentTankFileName || DEFAULT_TREE_ROOT);
    const data = buildClassTreeData(root, map);
    ctOnOpen(_view, root, data.full);
    if (_view.query !== '') setClassTreeQuery(data, _view.query);
    ctClampCentre(_view, data.lay);
    dataRef.current = data;
    if (inputRef.current && inputRef.current.value !== _view.query) inputRef.current.value = _view.query;
    const st = stateRef.current;
    st.dark = dark;
    st.sceneStale = true;
    const names = new Set<string>();
    for (let i = 0; i < data.names.length; i++) if (data.names[i] !== '') names.add(data.names[i]);
    _pendingNames = names;
  }, [logic.state.tankLibrary, logic.state.currentTankFileName, logic.state.gameModeConfig.mode]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const glr = classTreeGL();
    root.insertBefore(glr.canvas, root.firstChild);
    const st = stateRef.current;
    st.dirty = true;

    let placed = '';
    const place = () => {
      const cv = glr.canvas, dpr = getEffectiveDPR();
      if (root.offsetWidth <= 0) return;
      const b = root.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      const x0 = b.left * d, y0 = b.top * d;
      st.shiftX = (Math.round(x0) - x0) / dpr;
      st.shiftY = (Math.round(y0) - y0) / dpr;
      const key = `${cv.width / dpr}px|${cv.height / dpr}px|translate(${st.shiftX}px, ${st.shiftY}px)`;
      if (key === placed) return;
      placed = key;
      cv.style.width = `${cv.width / dpr}px`; cv.style.height = `${cv.height / dpr}px`;
      cv.style.transform = `translate(${st.shiftX}px, ${st.shiftY}px)`;
      st.dirty = true;
    };

    const applySize = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      st.cssW = w;
      st.cssH = h;
      st.dirty = true;
      const s = ctScreenScale(w, h);
      setBarScale(prev => (Math.abs(prev - s) > 1e-3 ? s : prev));
      const dpr = getEffectiveDPR();
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (Math.abs(bw - glr.canvas.width) > 4 || Math.abs(bh - glr.canvas.height) > 4) glr.setSize(bw, bh);
      place();
    };
    applySize(root.clientWidth, root.clientHeight);
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) applySize(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(root);
    window.addEventListener('resize', place);

    const fonts = (document as any).fonts;
    if (!glr.atlas.fontReady) {
      if (fonts && typeof fonts.load === 'function') {
        fonts.load(`bold ${CT_BAR_FONT}px Ubuntu`).then(() => { glr.atlas.fontReady = true; }, () => { glr.atlas.fontReady = true; });
      } else {
        glr.atlas.fontReady = true;
      }
    }

    let running = true;
    let raf = 0;
    let lastTs = performance.now();
    const frame = (ts: number) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const data = dataRef.current;
      const w = st.cssW, h = st.cssH;
      if (!data || w <= 0 || h <= 0) return;
      const dt = ts > lastTs ? (ts - lastTs) / 1000 : 0;
      lastTs = ts;

      const V = _view;
      ctStep(V, dt);
      const s = ctScreenScale(w, h);
      const aCss = s * V.p / CT_CELL;
      if ((st.panX !== 0 || st.panY !== 0) && aCss > 0) {
        const step = ARROW_PAN_PX_PER_SEC * s * (st.panFast ? ARROW_FAST : 1) * (dt < 0.1 ? dt : 0.1);
        ctDrag(V, -st.panX * step, -st.panY * step, aCss);
      }
      ctClampCentre(V, data.lay);

      const dark = isGameDark();
      if (dark !== st.dark) {
        st.dark = dark;
        for (const [name, item] of getMenuTankLibraryItems(dark)) tankMapRef.current.set(name, item);
        setDarkUi(dark);
        st.sceneStale = true;
      }
      const gs = logic.state;
      const gm = gs.gameModeConfig;
      const crown = gs.manhuntLeaderId === gs.playerId;
      if (gs.isTestMode !== st.cTest || gm.mode !== st.cMode || gm.playerTeam !== st.cTeam || crown !== st.cCrown) {
        st.cTest = gs.isTestMode; st.cMode = gm.mode; st.cTeam = gm.playerTeam; st.cCrown = crown;
        st.sceneStale = true;
      }
      if (st.sceneStale) {
        st.sceneStale = false;
        glr.upload(buildClassTreeScene(data, tankMapRef.current, dark,
          (id, keepOwn) => logic.playerTankColorTeamIndex(id, keepOwn), _partsPending));
        st.dirty = true;
      }
      if (_partsPending.next < _partsPending.keys.length) {
        const share = dt * 200;
        if (ctBuildPendingParts(_partsPending, share < 0.5 ? 0.5 : share > 3 ? 3 : share, _nowMs)) st.sceneStale = true;
      }

      const dev = getEffectiveDPR();
      const fontCssMax = ctNameFontPx(s * (CT_P_MAX / CT_CELL), 1);
      const atlasFont = fontCssMax * dev;
      const atlasStroke = ctNameStrokePx(fontCssMax) * dev;
      const ink = _BORDER_CSS[dark ? 1 : 0];
      const at = glr.atlas;
      if (at.fontPx !== atlasFont || at.strokePx !== atlasStroke || at.ink !== ink) {
        at.reset(atlasFont, atlasStroke, ink, _pendingNames ? [..._pendingNames] : [...at.cells.keys()]);
        _pendingNames = null;
      } else if (_pendingNames) {
        let missing = false;
        for (const nm of _pendingNames) if (!at.cells.has(nm)) { missing = true; break; }
        if (missing) at.reset(atlasFont, atlasStroke, ink, [...at.cells.keys(), ..._pendingNames]);
        _pendingNames = null;
      }
      const nameT = ctNameT(V.p);
      if (at.pending()) {
        const budget = dt * 200;
        at.build(performance.now() + (budget < 0.5 ? 0.5 : budget > 3 ? 3 : budget));
      }
      if (glr.syncNames() && nameT > 0) st.dirty = true;
      if (glr.takeRestored()) st.dirty = true;
      const cw = glr.canvas.width, ch = glr.canvas.height;
      if (!st.dirty && V.cx === st.dCx && V.cy === st.dCy && V.p === st.dP && cw === st.dW && ch === st.dH) return;
      st.dirty = false;
      st.dCx = V.cx; st.dCy = V.cy; st.dP = V.p; st.dW = cw; st.dH = ch;

      const f = _frame;
      f.cx = V.cx; f.cy = V.cy;
      f.a = aCss * dev; f.w = cw; f.h = ch;
      f.px = (w / 2 - st.shiftX) * dev; f.py = (h / 2 - st.shiftY) * dev;
      const iconUnits = ctIconUnits(nameT);
      f.icon = iconUnits * f.a >= ICON_MIN_DEVICE_PX ? iconUnits : 0;
      const fontNow = ctNameFontPx(aCss, nameT) * dev;
      f.nameScale = fontNow > 0 && at.fontPx > 0 ? fontNow / at.fontPx : 0;
      f.snap = Math.abs(f.nameScale - 1) < 1e-6;
      f.nameMid = CT_TILE_INSET + ctNameMidUnits(nameT) - CT_CELL / 2;
      const th = dark ? 1 : 0;
      f.ink = _BORDER01[th];
      f.strokeBlend = borderBlendFor(dark);
      f.line = _LINE[th];
      glr.draw(f);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', place);
      glr.canvas.remove();
      glr.release();
    };
  }, [logic]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      ctOnWheel(_view, e.deltaY, e.deltaMode);
    };

    let _lx = 0, _ly = 0;
    const toLocal = (e: { clientX: number; clientY: number }) => {
      const st = stateRef.current;
      const rect = root.getBoundingClientRect();
      _lx = rect.width > 0 ? (e.clientX - rect.left) * st.cssW / rect.width : 0;
      _ly = rect.height > 0 ? (e.clientY - rect.top) * st.cssH / rect.height : 0;
    };
    const aNow = () => {
      const st = stateRef.current;
      return ctScreenScale(st.cssW, st.cssH) * _view.p / CT_CELL;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (barRef.current && barRef.current.contains(e.target as Node)) return;
      if (e.button !== 0) return;
      const st = stateRef.current;
      inputRef.current?.blur();
      toLocal(e);
      st.isDragging = true;
      st.dragStartX = _lx;
      st.dragStartY = _ly;
      st.lastX = _lx;
      st.lastY = _ly;
    };

    const onMouseMove = (e: MouseEvent) => {
      const st = stateRef.current;
      if (!st.isDragging) return;
      toLocal(e);
      ctDrag(_view, _lx - st.lastX, _ly - st.lastY, aNow());
      const data = dataRef.current;
      if (data) ctClampCentre(_view, data.lay);
      st.lastX = _lx;
      st.lastY = _ly;
    };

    const onMouseUp = (e: MouseEvent) => {
      const st = stateRef.current;
      if (!st.isDragging || e.button !== 0) return;
      st.isDragging = false;
      toLocal(e);
      clickAt(Math.abs(_lx - st.dragStartX) + Math.abs(_ly - st.dragStartY));
    };

    const clickAt = (dragDist: number) => {
      const st = stateRef.current;
      const data = dataRef.current;
      const a = aNow();
      if (dragDist < CLICK_SLOP && data && a > 0 && logic.state.debugMode) {
        const u = (_lx - st.cssW / 2) / a + _view.cx;
        const v = (_ly - st.cssH / 2) / a + _view.cy;
        const col = Math.floor(u / CT_CELL);
        const row = Math.floor(v / CT_CELL);
        const fx = u - col * CT_CELL;
        const fy = v - row * CT_CELL;
        if (fx >= CT_TILE_INSET && fx <= CT_TILE_INSET + CT_TILE && fy >= CT_TILE_INSET && fy <= CT_TILE_INSET + CT_TILE) {
          const lay = data.lay;
          for (let t = 0; t < lay.tileNode.length; t++) {
            if (lay.tileCol[t] === col && lay.tileRow[t] === row) {
              logic.evolveToTank(data.nodes[lay.tileNode[t]].id, true );
              logic.updateState({ classTreeOpen: false });
              return;
            }
          }
        }
      }
    };

    const onDragRelease = () => {
      const st = stateRef.current;
      st.isDragging = false;
      st.panX = 0;
      st.panY = 0;
    };
    const tch = { id: -1, n: 0, sx: 0, sy: 0, lx: 0, ly: 0, mx: 0, my: 0, dist: 0, far: false };
    const readFingers = (e: TouchEvent) => {
      const ts = e.targetTouches;
      tch.n = ts.length;
      if (tch.n === 1) { toLocal(ts[0]); tch.lx = _lx; tch.ly = _ly; tch.id = ts[0].identifier; }
      else if (tch.n >= 2) {
        toLocal(ts[0]); const x0 = _lx, y0 = _ly;
        toLocal(ts[1]); const x1 = _lx, y1 = _ly;
        tch.mx = (x0 + x1) / 2; tch.my = (y0 + y1) / 2;
        tch.dist = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      if (barRef.current && barRef.current.contains(e.target as Node)) return;
      if (e.cancelable) e.preventDefault();
      inputRef.current?.blur();
      stateRef.current.isDragging = false;
      const was = tch.n;
      readFingers(e);
      if (was === 0 && tch.n === 1) { tch.sx = tch.lx; tch.sy = tch.ly; tch.far = false; }
      if (tch.n >= 2) tch.far = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (tch.n === 0) return;
      if (e.cancelable) e.preventDefault();
      const st = stateRef.current;
      const n = e.targetTouches.length;
      if (n === 1 && tch.n === 1 && e.targetTouches[0].identifier === tch.id) {
        toLocal(e.targetTouches[0]);
        ctDrag(_view, _lx - tch.lx, _ly - tch.ly, aNow());
        tch.lx = _lx; tch.ly = _ly;
        if (Math.abs(_lx - tch.sx) + Math.abs(_ly - tch.sy) >= CLICK_SLOP) tch.far = true;
      } else if (n >= 2 && tch.n >= 2) {
        const mx0 = tch.mx, my0 = tch.my, d0 = tch.dist;
        readFingers(e);
        if (d0 > 0) ctPinch(_view, tch.dist / d0, mx0, my0, tch.mx, tch.my, st.cssW, st.cssH, ctScreenScale(st.cssW, st.cssH));
      } else {
        readFingers(e);
      }
      const data = dataRef.current;
      if (data) ctClampCentre(_view, data.lay);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (tch.n === 0) return;
      if (e.cancelable) e.preventDefault();
      const tap = tch.n === 1 && !tch.far && e.targetTouches.length === 0;
      if (tap) { _lx = tch.lx; _ly = tch.ly; clickAt(0); }
      readFingers(e);
      if (tch.n === 0) tch.far = false;
    };
    root.addEventListener('touchstart', onTouchStart, { passive: false });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    root.addEventListener('touchend', onTouchEnd, { passive: false });
    root.addEventListener('touchcancel', onTouchEnd, { passive: false });
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onDragRelease);
    document.addEventListener('visibilitychange', onDragRelease);
    return () => {
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('touchcancel', onTouchEnd);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onDragRelease);
      document.removeEventListener('visibilitychange', onDragRelease);
    };
  }, [logic]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const setQuery = (q: string) => {
      if (q === _view.query) return;
      _view.query = q;
      const data = dataRef.current;
      if (!data) return;
      setClassTreeQuery(data, q);
      ctCentreOn(_view, data.lay);
      stateRef.current.sceneStale = true;
    };
    const onInput = () => setQuery(input.value);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (escapeIsOwned()) return;
        e.preventDefault();
        e.stopPropagation();
        if (input.value !== '') { input.value = ''; setQuery(''); }
        input.blur();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        input.blur();
        return;
      }
      if (e.key === 'Tab') e.preventDefault();
      e.stopPropagation();
    };
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    return () => {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target === inputRef.current) return;
      const st = stateRef.current;
      if (e.key === '+' || e.key === '=') { _view.pTarget = ctButton(_view.pTarget, 1); e.preventDefault(); return; }
      if (e.key === '-' || e.key === '_') { _view.pTarget = ctButton(_view.pTarget, -1); e.preventDefault(); return; }
      st.panFast = e.shiftKey;
      if (e.key === 'ArrowUp') { st.panY = -1; e.preventDefault(); e.stopPropagation(); }
      if (e.key === 'ArrowDown') { st.panY = 1; e.preventDefault(); e.stopPropagation(); }
      if (e.key === 'ArrowLeft') { st.panX = -1; e.preventDefault(); e.stopPropagation(); }
      if (e.key === 'ArrowRight') { st.panX = 1; e.preventDefault(); e.stopPropagation(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const st = stateRef.current;
      st.panFast = e.shiftKey;
      if ((e.key === 'ArrowUp' && st.panY < 0) || (e.key === 'ArrowDown' && st.panY > 0)) st.panY = 0;
      if ((e.key === 'ArrowLeft' && st.panX < 0) || (e.key === 'ArrowRight' && st.panX > 0)) st.panX = 0;
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, []);

  const S = barScale;
  const th = darkUi ? 1 : 0;
  const barInk = _BORDER_CSS[th];
  const piece = (leftV: number, widthV: number): React.CSSProperties => ({
    position: 'absolute', left: (leftV - CT_BAR_RING / 2) * S, top: (CT_BAR_TOP - CT_BAR_RING / 2) * S,
    width: (widthV + CT_BAR_RING) * S, height: (CT_BAR_H + CT_BAR_RING) * S, boxSizing: 'border-box',
    border: `${CT_BAR_RING * S}px solid ${barInk}`, borderRadius: (CT_BAR_RING / 2) * S, cursor: 'var(--cur-default)',
  });
  const pathBox: React.CSSProperties = {
    position: 'absolute', left: -(CT_BAR_RING / 2) * S, top: -(CT_BAR_RING / 2) * S,
    width: CT_BAR_BTN * S, height: CT_BAR_H * S, overflow: 'visible', pointerEvents: 'none',
  };
  const split = (CT_BAR_H * 0.6 - CT_BAR_RING / 2) * S;
  const bands = `linear-gradient(${_BTN[th].top} ${split}px, ${_BTN[th].band} ${split}px)`;
  const glyph = (ch: string) => (
    <svg style={pathBox} viewBox={`0 0 ${CT_BAR_BTN} ${CT_BAR_H}`}>
      <text x={CT_BAR_BTN / 2} y={CT_BAR_H / 2} textAnchor="middle" dominantBaseline="central"
        fontFamily="Ubuntu, Inter, sans-serif" fontWeight="bold" fontSize={CT_BAR_FONT}
        fill={_TEXT_CSS[th]} stroke={barInk} strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">{ch}</text>
    </svg>
  );
  const zoomBy = (dir: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    _view.pTarget = ctButton(_view.pTarget, dir);
  };

  return (
    <div
      ref={rootRef}
      style={{ position: 'absolute', inset: 0, zIndex: 40, cursor: 'var(--cur-default)', pointerEvents: 'auto', overflow: 'hidden',
        background: _VEIL[th], userSelect: 'none', touchAction: 'none' }}
    >
      <div ref={barRef} style={{ position: 'absolute', left: '50%', top: 0, width: 0, height: 0 }}>
        <div style={{ ...piece(CT_BAR_X_L, CT_BAR_BTN), background: _PAL[th][CT_SLOT_RED] }}
          onClick={() => logic.updateState({ classTreeOpen: false })}>
          <svg style={pathBox} viewBox={`0 0 ${CT_BAR_BTN} ${CT_BAR_H}`}>
            <path d="M10 10L30 30M30 10L10 30" stroke={_TEXT_CSS[th]} strokeWidth={3} strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <div style={{ ...piece(CT_BAR_FIELD_L, CT_BAR_FIELD_W), background: _TEXT_CSS[th], cursor: 'var(--cur-text)' }}
          onMouseDown={(e) => { if (e.target !== inputRef.current) { e.preventDefault(); inputRef.current?.focus(); } }}>
          <input
            ref={inputRef}
            className="ct-search"
            type="text"
            placeholder="Search"
            defaultValue={_view.query}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            style={{
              position: 'absolute', left: (CT_BAR_TEXT_PAD - CT_BAR_RING / 2) * S, top: (4 - CT_BAR_RING / 2) * S,
              width: (CT_BAR_FIELD_W - 2 * CT_BAR_TEXT_PAD) * S, height: 32 * S, boxSizing: 'border-box',
              border: 'none', outline: 'none', background: 'transparent', padding: 0, margin: 0,
              font: `bold ${CT_BAR_FONT * S}px Ubuntu, Inter, sans-serif`, lineHeight: `${32 * S}px`,
              color: barInk, caretColor: barInk, userSelect: 'text', cursor: 'var(--cur-text)',
            }}
          />
        </div>
        <div style={{ ...piece(CT_BAR_PLUS_L, CT_BAR_BTN), background: bands }} onMouseDown={zoomBy(1)}>{glyph('+')}</div>
        <div style={{ ...piece(CT_BAR_MINUS_L, CT_BAR_BTN), background: bands }} onMouseDown={zoomBy(-1)}>{glyph('\u2212')}</div>
      </div>
    </div>
  );
};

export default ClassTreeView;
