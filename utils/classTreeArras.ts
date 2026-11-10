import { hudEase } from './hudEase';
import { CM, cmBorderRgb, CM_BORDER_BLEND_LIGHT, CM_BORDER_BLEND_DARK } from './colorMap';

export const CT_CELL = 115;
export const CT_TILE = 100;
export const CT_TILE_INSET = 7.5;
export const CT_P_DEFAULT = 46;
export const CT_P_MIN = 23;
export const CT_P_MAX = 115;
export const CT_P_BUTTON = 23;
export const CT_EASE_SEC = 0.7;
export const CT_WHEEL_DIV = 300;
export const CT_WHEEL_NOTCH = 100;
export const CT_REF_W = 1920;
export const CT_REF_H = 1080;

export function ctScreenScale(w: number, h: number): number {
  return Math.max(w / CT_REF_W, h / CT_REF_H);
}

export function ctEase(p: number, pTarget: number, dtSec: number): number {
  const gap = pTarget - p;
  if (gap === 0) return p;
  return pTarget - Math.sign(gap) * hudEase(Math.abs(gap), dtSec / CT_EASE_SEC);
}

function clampP(p: number): number {
  return p < CT_P_MIN ? CT_P_MIN : p > CT_P_MAX ? CT_P_MAX : p;
}

export function ctWheel(pTarget: number, deltaY: number, deltaMode: number): number {
  const dy = deltaMode === 0 ? deltaY : Math.sign(deltaY) * CT_WHEEL_NOTCH;
  return clampP(pTarget * Math.pow(2, -dy / CT_WHEEL_DIV));
}

export function ctButton(pTarget: number, dir: number): number {
  return clampP(pTarget + dir * CT_P_BUTTON);
}

export function ctNameT(p: number): number {
  const x = (100 * (p / CT_CELL) - 64) / 12;
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c;
}

export function ctIconUnits(nameT: number): number {
  return 80 - 20 * nameT;
}

export function ctCeil01(x: number): number {
  return Math.ceil(x * 10) / 10;
}

export function ctNameFontPx(a: number, nameT: number): number {
  return nameT > 0 ? ctCeil01(11 * a * nameT) : 0;
}

export function ctNameStrokePx(fontPx: number): number {
  return ctCeil01(0.25 * fontPx);
}

export function ctNameMidUnits(nameT: number): number {
  return 95.35 - 5.5 * nameT;
}

export const CT_LINE_UNITS = 3;
export const CT_RING_UNITS = 3;
export const CT_OUTLINE_UNITS = 3;
export const CT_INK = cmBorderRgb(false)[0];

export const CT_BORDER_LIGHT: readonly [number, number, number] = cmBorderRgb(false);
export const CT_BORDER_DARK: readonly [number, number, number] = cmBorderRgb(true);
export const CT_STROKE_BLEND_LIGHT = CM_BORDER_BLEND_LIGHT;
export const CT_STROKE_BLEND_DARK = CM_BORDER_BLEND_DARK;
export const CT_SLOT_RED = CM.RED;
export const CT_SLOT_GREY = CM.BARRELS;

export function ctBorder(dark: boolean): readonly [number, number, number] {
  return dark ? CT_BORDER_DARK : CT_BORDER_LIGHT;
}

export function ctBandRGB(hex: string, border: readonly [number, number, number] = CT_BORDER_LIGHT): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [
    (border[0] * 51 + ((n >> 16) & 255) * 205) >> 8,
    (border[1] * 51 + ((n >> 8) & 255) * 205) >> 8,
    (border[2] * 51 + (n & 255) * 205) >> 8,
  ];
}

export function ctBandColor(hex: string): string {
  const [r, g, b] = ctBandRGB(hex);
  return `rgb(${r},${g},${b})`;
}

export const CT_BAR_TOP = 80;
export const CT_BAR_H = 40;
export const CT_BAR_RING = 3;
export const CT_BAR_X_L = -255;
export const CT_BAR_FIELD_L = -200;
export const CT_BAR_FIELD_W = 400;
export const CT_BAR_PLUS_L = 215;
export const CT_BAR_MINUS_L = 270;
export const CT_BAR_BTN = 40;
export const CT_BAR_FONT = 20;
export const CT_BAR_TEXT_PAD = 20;

export interface CtGroup { readonly layoutTier?: number; readonly upgrades: readonly string[]; }

export interface CtSource {
  groups(id: string): readonly CtGroup[] | undefined;
  has(id: string): boolean;
}

export interface CtNode {
  id: string;
  parent: number;
  sib: number;
  tier: number;
  kids: number[];
  lists: boolean;
}

function upgradesOf(src: CtSource, id: string, out: { id: string; tier: number }[]): void {
  out.length = 0;
  const groups = src.groups(id);
  if (!groups) return;
  for (let g = 0; g < groups.length; g++) {
    const gr = groups[g];
    const t = gr.layoutTier ?? 0;
    for (let i = 0; i < gr.upgrades.length; i++) {
      const u = gr.upgrades[i];
      if (src.has(u)) out.push({ id: u, tier: t });
    }
  }
}

function hasUpgrades(src: CtSource, id: string): boolean {
  const groups = src.groups(id);
  if (!groups) return false;
  for (let g = 0; g < groups.length; g++) {
    const ups = groups[g].upgrades;
    for (let i = 0; i < ups.length; i++) if (src.has(ups[i])) return true;
  }
  return false;
}

export function ctBuildNodes(root: string, src: CtSource): CtNode[] {
  const nodes: CtNode[] = [];
  if (!src.has(root)) return nodes;
  const path = new Set<string>();
  const ups: { id: string; tier: number }[] = [];
  const grow = (id: string, parent: number, sib: number, tier: number): number => {
    const me = nodes.length;
    nodes.push({ id, parent, sib, tier, kids: [], lists: false });
    path.add(id);
    upgradesOf(src, id, ups);
    const mine = ups.slice();
    let allDead = mine.length > 0;
    for (let i = 0; i < mine.length; i++) if (hasUpgrades(src, mine[i].id)) { allDead = false; break; }
    nodes[me].lists = allDead;
    for (let i = 0; i < mine.length; i++) {
      if (path.has(mine[i].id)) continue;
      nodes[me].kids.push(grow(mine[i].id, me, i, mine[i].tier));
    }
    path.delete(id);
    return me;
  };
  grow(root, -1, 0, 0);
  return nodes;
}

export interface CtLayout {
  cols: number;
  rows: number;
  tileNode: number[];
  tileCol: number[];
  tileRow: number[];
  segs: number[];
}

export function ctLayout(nodes: readonly CtNode[], keep: Uint8Array | null): CtLayout {
  const out: CtLayout = { cols: 0, rows: 0, tileNode: [], tileCol: [], tileRow: [], segs: [] };
  if (nodes.length === 0) return out;
  const C = CT_CELL;
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    out.segs.push((x1 + 0.5) * C, (y1 + 0.5) * C, (x2 + 0.5) * C, (y2 + 0.5) * C);
  };
  let maxRow = 0;
  const tile = (n: number, col: number, row: number) => {
    out.tileNode.push(n); out.tileCol.push(col); out.tileRow.push(row);
    if (row > maxRow) maxRow = row;
  };
  const kept: number[] = [];
  const place = (n: number, col: number, row: number): number => {
    tile(n, col, row);
    const node = nodes[n];
    kept.length = 0;
    for (let i = 0; i < node.kids.length; i++) if (!keep || keep[node.kids[i]]) kept.push(node.kids[i]);
    if (kept.length === 0) return 1;
    if (node.lists) {
      for (let i = 0; i < kept.length; i++) tile(kept[i], col, row + 2 + i);
      seg(col, row, col, row + 1 + kept.length);
      return 1;
    }
    const kids = kept.slice();
    let c = col;
    let lastCol = col;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const step = nodes[k].tier - node.tier;
      const kr = row + 2 * (step > 1 ? step : 1);
      if (i === 0) seg(col, row, col, kr);
      else seg(c, row + 1, c, kr);
      lastCol = c;
      c += place(k, c, kr);
    }
    if (lastCol > col) seg(col, row + 1, lastCol, row + 1);
    return Math.max(1, c - col);
  };
  out.cols = place(0, 0, 0);
  out.rows = maxRow + 1;
  return out;
}

export function ctSearchKeep(nodes: readonly CtNode[], lowerNames: readonly string[], query: string): Uint8Array | null {
  const q = query.toLowerCase();
  if (q === '' || nodes.length === 0) return null;
  const n = nodes.length;
  const keep = new Uint8Array(n);
  const under = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = nodes[i].parent;
    if (p >= 0 && (under[p] || keep[p])) under[i] = 1;
    if (lowerNames[i].includes(q)) keep[i] = 1;
  }
  for (let i = 0; i < n; i++) if (under[i]) keep[i] = 1;
  for (let i = n - 1; i > 0; i--) if (keep[i]) keep[nodes[i].parent] = 1;
  keep[0] = 1;
  return keep;
}

export interface CtView {
  cx: number;
  cy: number;
  p: number;
  pTarget: number;
  opened: boolean;
  rootKey: string;
  query: string;
}

export function ctNewView(): CtView {
  return { cx: 0, cy: 0, p: CT_P_DEFAULT, pTarget: CT_P_DEFAULT, opened: false, rootKey: '', query: '' };
}

export function ctOnWheel(v: CtView, deltaY: number, deltaMode: number): void {
  v.pTarget = ctWheel(v.pTarget, deltaY, deltaMode);
}

export function ctStep(v: CtView, dtSec: number): void {
  if (v.p !== v.pTarget) v.p = ctEase(v.p, v.pTarget, dtSec);
}

export function ctCentreOn(v: CtView, lay: CtLayout): void {
  v.cx = lay.cols * CT_CELL / 2;
  v.cy = lay.rows * CT_CELL / 2;
}

export function ctOnOpen(v: CtView, rootKey: string, full: CtLayout): void {
  if (v.rootKey !== rootKey) {
    v.rootKey = rootKey;
    v.opened = false;
    v.query = '';
  }
  if (!v.opened) {
    v.opened = true;
    ctCentreOn(v, full);
    v.p = 0;
    v.pTarget = CT_P_DEFAULT;
  }
}

export function ctClampCentre(v: CtView, lay: CtLayout): void {
  const mx = lay.cols * CT_CELL;
  const my = lay.rows * CT_CELL;
  v.cx = v.cx < 0 ? 0 : v.cx > mx ? mx : v.cx;
  v.cy = v.cy < 0 ? 0 : v.cy > my ? my : v.cy;
}

export function ctDrag(v: CtView, dxPx: number, dyPx: number, a: number): void {
  if (!(a > 0)) return;
  v.cx -= dxPx / a;
  v.cy -= dyPx / a;
}

export function ctPinch(v: CtView, ratio: number, mx0: number, my0: number, mx1: number, my1: number, w: number, h: number, sPx: number): void {
  const a0 = sPx * v.p / CT_CELL;
  if (!(a0 > 0) || !(ratio > 0)) return;
  const u = (mx0 - w / 2) / a0 + v.cx;
  const t = (my0 - h / 2) / a0 + v.cy;
  const p = clampP(v.p * ratio);
  v.p = p;
  v.pTarget = p;
  const a1 = sPx * p / CT_CELL;
  v.cx = u - (mx1 - w / 2) / a1;
  v.cy = t - (my1 - h / 2) / a1;
}
