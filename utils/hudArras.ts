import { hudEase } from './hudEase';
import { CM, CM_USE, cmHex, cmRgb, cmBorderRgb, CM_BORDER_BLEND_LIGHT } from './colorMap';
import { borderBlendFor } from './gameTheme';
import type { UpgradeStat } from '../types';
import { SMALL_FIX } from '../game/smallFixSwitch';

export const HUD_REF_W = 1920;
export const HUD_REF_H = 1080;

export function hudScaleOf(w: number, h: number): number {
  return Math.max(w / HUD_REF_W, h / HUD_REF_H);
}

export type HudRgb = readonly [number, number, number];

export const HUD_SLOT = {
  TEAL: CM.SHIELD_BARS, LGREEN: CM.HEALTH_BARS, ORANGE: CM.TRIANGLES, YELLOW: CM.NEUTRAL, AQUA: CM.HEXAGONS,
  PINK: CM.CRASHERS, VLGREY: CM.EGGS, LGREY: CM.WALLS, TEXT: CM.TEXT, INK: CM.BORDERS, BLUE: CM.BLUE,
  GREEN: CM.GREEN, RED: CM.RED, GOLD: CM.SQUARES, PURPLE: CM.PENTAGONS, MAGENTA: CM.PURPLE,
  GREY: CM.BARRELS, DGREY: CM.ROGUES, WHITE: CM.BACKGROUND, GUIBLACK: CM.GRID,
} as const;

export const HUD_DARK_BORDER: HudRgb = cmBorderRgb(true);

function rgbOfHex(hex: string): [number, number, number] {
  let c = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const n = parseInt(c, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hudSlot(slot: number, dark: boolean): HudRgb {
  return cmRgb(slot, dark, CM_USE.GENERAL);
}

export function hudMix(a: HudRgb, b: HudRgb, k: number): HudRgb {
  return [
    (b[0] * k + a[0] * (256 - k)) >> 8,
    (b[1] * k + a[1] * (256 - k)) >> 8,
    (b[2] * k + a[2] * (256 - k)) >> 8,
  ];
}

export function hudCss(c: HudRgb): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export const HUD_K_BAND = 51;
export const HUD_K_HOVER = 38;
export const HUD_K_PRESSED = 102;
export const HUD_K_DOT = 76;
export const HUD_K_PREVIEW = 153;
export const HUD_K_OUTLINE = 153;
export const HUD_K_MM_BG = 128;

export function hudIconOutline(fill: HudRgb, dark: boolean): HudRgb {
  const b = borderBlendFor(dark);
  if (dark) return b >= 1 ? HUD_DARK_BORDER : hudMix(fill, HUD_DARK_BORDER, Math.round(b * 256));
  return hudMix(fill, hudSlot(HUD_SLOT.INK, false), b === CM_BORDER_BLEND_LIGHT ? HUD_K_OUTLINE : Math.round(b * 256));
}

export function hudLevelFillHex(dark: boolean): string {
  return cmHex(CM.PENTAGONS, dark, CM_USE.GENERAL);
}

export interface HudColors {
  ink: string;
  text: string;
  track: string;
  levelFill: string;
  scoreFill: string;
  killFill: string;
  duTop: string; duBottom: string; duTopHover: string; duBottomHover: string; duTopPressed: string;
  mmBg: string; mmGround: string; mmWall: string; mmPlayer: string; mmPortal: string;
  mmGap: string;
  health: string; shield: string;
}

let _colLight: HudColors | null = null;
let _colDark: HudColors | null = null;

function buildColors(dark: boolean): HudColors {
  const S = (i: number) => hudSlot(i, dark);
  const ink = S(HUD_SLOT.INK);
  const duTop = S(HUD_SLOT.VLGREY);
  const duBottom = hudMix(duTop, ink, HUD_K_BAND);
  return {
    ink: hudCss(ink),
    text: hudCss(S(HUD_SLOT.TEXT)),
    track: hudCss(S(HUD_SLOT.GREY)),
    levelFill: hudLevelFillHex(dark),
    scoreFill: hudCss(S(HUD_SLOT.GREEN)),
    killFill: hudCss(S(HUD_SLOT.TEAL)),
    duTop: hudCss(duTop),
    duBottom: hudCss(duBottom),
    duTopHover: hudCss(hudMix(duTop, S(HUD_SLOT.TEXT), HUD_K_HOVER)),
    duBottomHover: hudCss(hudMix(duBottom, S(HUD_SLOT.TEXT), HUD_K_HOVER)),
    duTopPressed: hudCss(hudMix(duTop, ink, HUD_K_PRESSED)),
    mmBg: hudCss(hudMix(S(HUD_SLOT.GREY), S(HUD_SLOT.WHITE), HUD_K_MM_BG)),
    mmGround: hudCss(S(HUD_SLOT.WHITE)),
    mmWall: hudCss(hudMix(S(HUD_SLOT.LGREY), ink, HUD_K_DOT)),
    mmPlayer: hudCss(S(HUD_SLOT.GUIBLACK)),
    mmPortal: hudCss(hudMix([0, 0, 0], ink, HUD_K_DOT)),
    mmGap: hudCss(S(HUD_SLOT.GREY)),
    health: hudCss(S(HUD_SLOT.LGREEN)),
    shield: hudCss(S(HUD_SLOT.TEAL)),
  };
}

export function hudColors(dark: boolean): HudColors {
  if (dark) return _colDark ?? (_colDark = buildColors(true));
  return _colLight ?? (_colLight = buildColors(false));
}

export function hudTileBands(slotHex: string, dark: boolean): { top: string; bottom: string } {
  const top = rgbOfHex(slotHex);
  return { top: hudCss(top), bottom: hudCss(hudMix(top, hudSlot(HUD_SLOT.INK, dark), HUD_K_BAND)) };
}

const _dotLight: Record<string, string> = {};
const _dotDark: Record<string, string> = {};

export function hudMinimapDot(hex: string, dark: boolean): string {
  const cache = dark ? _dotDark : _dotLight;
  let c = cache[hex];
  if (c === undefined) {
    c = hudCss(hudMix(rgbOfHex(hex), hudSlot(HUD_SLOT.INK, dark), HUD_K_DOT));
    cache[hex] = c;
  }
  return c;
}

export const HUD_FONT_FAMILY = 'Ubuntu, Inter, sans-serif';
export const HUD_STROKE_F = 0.25;
export const HUD_STROKE_F_BIG = 0.2;

export function hudCommas(n: number): string {
  const v = Math.trunc(n);
  const neg = v < 0;
  let s = String(neg ? -v : v);
  for (let i = s.length - 3; i > 0; i -= 3) s = s.slice(0, i) + ',' + s.slice(i);
  return neg ? '-' + s : s;
}

export const HUD_UP_TILE = 100;
export const HUD_UP_PITCH = 115;
export const HUD_UP_ORIGIN = 25;
export const HUD_UP_BAND_SPLIT = 0.6;
export const HUD_UP_BAND_ALPHA = 0.6;
export const HUD_RING = 3;
export const HUD_UP_ICON = 60;
export const HUD_ICON_OUTLINE = 3;
export const HUD_UP_SPIN = 0.5;
export const HUD_UP_NAME_FONT = 11;
export const HUD_UP_KEY_FONT = 9;
export const HUD_UP_NAME_DX = -4;
export const HUD_UP_KEY_RIGHT = 4;
export const HUD_UP_TEXT_BOTTOM = 5;
export const HUD_UP_KEYS: readonly string[] = ['Y', 'U', 'I', 'H', 'J', 'K'];
export const HUD_DU_TEXT = "Don't Upgrade";
export const HUD_DU_W = 100;
export const HUD_DU_H = 20;
export const HUD_DU_GAP = 10;
export const HUD_DU_FONT = 11;

export function hudUpCols(n: number): number {
  return Math.max(3, Math.floor(Math.pow(n, 0.55)));
}

export interface HudUpLayout {
  cols: number;
  rows: number;
  lastRow: number;
  btnLeft: number;
  btnTop: number;
  width: number;
  height: number;
  hideDist: number;
  scale: number;
}

export const HUD_UP_PHONE_COLS = 10;
export const HUD_UP_PHONE_SMALL = 0.8;
export const HUD_UP_PHONE_SMALL_COLS = 12;

export function hudUpFitCols(widthV: number): number {
  const c = Math.floor((widthV - 2 * HUD_UP_ORIGIN + (HUD_UP_PITCH - HUD_UP_TILE)) / HUD_UP_PITCH);
  return c >= 1 ? c : 1;
}

export function hudUpLayout(n: number, phone: boolean = false, maxCols: number = 0): HudUpLayout {
  if (phone) {
    const small = n > 2 * HUD_UP_PHONE_COLS;
    const mc = small ? HUD_UP_PHONE_SMALL_COLS : HUD_UP_PHONE_COLS;
    const pr = Math.max(1, Math.ceil(n / mc));
    const pc = pr === 1 ? mc : Math.ceil(n / pr);
    const bl = HUD_UP_ORIGIN + mc * HUD_UP_PITCH, bt = 20;
    const across = n < pc ? n : pc;
    return {
      cols: pc, rows: pr, lastRow: n - (pr - 1) * pc, btnLeft: bl, btnTop: bt,
      width: Math.max(bl + HUD_DU_W, HUD_UP_ORIGIN + across * HUD_UP_PITCH - (HUD_UP_PITCH - HUD_UP_TILE)) + HUD_UP_ORIGIN,
      height: Math.max(bt + HUD_DU_H, HUD_UP_ORIGIN + pr * HUD_UP_PITCH - (HUD_UP_PITCH - HUD_UP_TILE)) + HUD_UP_ORIGIN,
      hideDist: HUD_UP_PITCH * (mc + 1),
      scale: small ? HUD_UP_PHONE_SMALL : 1,
    };
  }
  const cols = maxCols > 0 && maxCols < hudUpCols(n) ? maxCols : hudUpCols(n);
  const rows = Math.max(1, Math.ceil(n / cols));
  const lastRow = n - (rows - 1) * cols;
  const across = n < cols ? n : cols;
  const btnLeft = HUD_UP_ORIGIN + (across * HUD_UP_PITCH - (HUD_UP_PITCH - HUD_UP_TILE)) / 2 - HUD_DU_W / 2;
  const btnTop = HUD_UP_ORIGIN + rows * HUD_UP_PITCH - (HUD_UP_PITCH - HUD_UP_TILE) + HUD_DU_GAP;
  return {
    cols, rows, lastRow, btnLeft, btnTop,
    width: HUD_UP_ORIGIN + cols * HUD_UP_PITCH - (HUD_UP_PITCH - HUD_UP_TILE) + HUD_UP_ORIGIN,
    height: btnTop + HUD_DU_H + HUD_UP_ORIGIN,
    hideDist: HUD_UP_PITCH * (cols + 1),
    scale: 1,
  };
}

export function hudUpTileX(i: number, cols: number): number {
  return HUD_UP_ORIGIN + (i % cols) * HUD_UP_PITCH;
}
export function hudUpTileY(i: number, cols: number): number {
  return HUD_UP_ORIGIN + Math.floor(i / cols) * HUD_UP_PITCH;
}

export function hudUpSpinAngle(clockSec: number): number {
  return (clockSec * HUD_UP_SPIN) % (Math.PI * 2);
}

export const HUD_SLIDE_SEC = 0.7;

export function hudSlideStep(p: number, target: number, dtSec: number): number {
  const gap = p - target;
  if (gap === 0) return target;
  const t = dtSec > 0 ? dtSec / HUD_SLIDE_SEC : 0;
  return target + Math.sign(gap) * hudEase(Math.abs(gap), t);
}

export interface HudBarGeom { x0: number; x1: number; y: number; h: number; font: number; }
export const HUD_BAR_LEVEL: HudBarGeom = { x0: 740, x1: 1180, y: 1045, h: 22, font: 22 };
export const HUD_BAR_SCORE: HudBarGeom = { x0: 788, x1: 988, y: 1019, h: 14, font: 14 };
export const HUD_BAR_KILL: HudBarGeom = { x0: 1012, x1: 1132, y: 1019, h: 14, font: 14 };
export const HUD_BAR_SCORE_ALONE: HudBarGeom = { x0: 810, x1: 1110, y: 1019, h: 14, font: 14 };
export const HUD_BAR_OUTLINE = 2.5;
export const HUD_NAME_X = 960;
export const HUD_NAME_Y = 985;
export const HUD_NAME_FONT = 32;

export function hudBarShift(g: HudBarGeom, fill: number): number {
  const L = g.x1 - g.x0;
  const f = fill > 0 ? (fill < 1 ? fill : 1) : 0;
  return -(1 - f) * L / (L + g.h);
}

export const HUD_KILL_WORTH = 35000;
export const HUD_BOSS_KILL_WORTH = 70000;

export function hudKillFill(kills: number, bossKills: number, score: number): number {
  if (kills === 0 && bossKills === 0) return 0;
  const f = (HUD_KILL_WORTH * kills + HUD_BOSS_KILL_WORTH * bossKills) / score;
  return f < 1 ? f : 1;
}

export function hudScoreFill(score: number, boardMax: number): number {
  const m = boardMax > 1 ? boardMax : 1;
  const f = score / m;
  return f > 0 ? (f < 1 ? f : 1) : 0;
}

export function hudKillText(kills: number, assists: number, bossKills: number): string {
  return assists === 0 && bossKills === 0
    ? 'Kills: ' + hudCommas(kills)
    : 'Kills: ' + hudCommas(kills) + '/' + hudCommas(assists) + '/' + hudCommas(bossKills);
}

export function hudScoreText(score: number): string {
  return 'Score: ' + hudCommas(score);
}

export const HUD_MM_BUDGET = 2000;
export const HUD_MM_MARGIN = 25;
export const HUD_MM_BG_ALPHA = 0.5;
export const HUD_MM_TILE_ALPHA = 0.5;
export const HUD_MM_DOT = 2;
export const HUD_MM_SAMPLE_SEC = 0.2;
export const HUD_MM_GLIDE_SEC = 0.25;

export interface HudMmSize { w: number; h: number; }

export function hudMinimapSize(cols: number, rows: number, out: HudMmSize): HudMmSize {
  const cell = HUD_MM_BUDGET / (3 * cols + 7 * rows);
  out.w = cols * cell;
  out.h = rows * cell;
  return out;
}

export function hudMmObstacleRadius(size: number, boxW: number, worldW: number): number {
  return size * (boxW / worldW) + 0.1;
}

export const HUD_MM_BOX_GLIDE_SEC = 0.3;
export function hudMmBoxGlideT(ageSec: number): number {
  if (ageSec >= HUD_MM_BOX_GLIDE_SEC) return 1;
  if (ageSec <= 0) return 0;
  const u = 1 - ageSec / HUD_MM_BOX_GLIDE_SEC;
  return 1 - u * u * u;
}

export function hudMmGlideT(ageSec: number): number {
  return ageSec >= HUD_MM_GLIDE_SEC ? 1 : ageSec > 0 ? ageSec / HUD_MM_GLIDE_SEC : 0;
}

export const HUD_SK_SEG = 194 / 9;
export const HUD_SK_CAP0 = 30.5;
export const HUD_SK_TRACK_L = 25;
export const HUD_SK_OUTLINE_R = 8;
export const HUD_SK_TRACK_R = 5.5;
export const HUD_SK_RIM_R = 6.75;
export const HUD_SK_SEP_W = 1.25;
export const HUD_SK_KEY_END = 17;
export const HUD_SK_PITCH = 19;
export const HUD_SK_LAST_Y = 1047.5;
export const HUD_SK_NAME_FONT = 11;
export const HUD_SK_KEY_FONT = 9;
export const HUD_SK_PLUS_FONT = 11;
export const HUD_SK_COUNT_FONT = 20;
export const HUD_SK_COUNT_ABOVE = 20.5;
export const HUD_SK_ZONE_W = 20;
export const HUD_SK_ZONE_H = 120;

export const HUD_SKILL_SLOTS: Readonly<Record<UpgradeStat, number>> = {
  bodyDamage: HUD_SLOT.ORANGE, maxHealth: HUD_SLOT.GOLD, bulletSpeed: HUD_SLOT.TEAL,
  bulletHealth: HUD_SLOT.GREEN, bulletPenetration: HUD_SLOT.YELLOW, bulletDamage: HUD_SLOT.RED,
  reload: HUD_SLOT.LGREEN, movementSpeed: HUD_SLOT.BLUE, shieldRegen: HUD_SLOT.PINK,
  shieldCapacity: HUD_SLOT.PURPLE,
};

export function hudSkillColors(stat: UpgradeStat, dark: boolean): { fill: string; preview: string } {
  const c = hudSlot(HUD_SKILL_SLOTS[stat], dark);
  return { fill: hudCss(c), preview: hudCss(hudMix(c, hudSlot(HUD_SLOT.WHITE, dark), HUD_K_PREVIEW)) };
}

export function hudStatDot(stat: UpgradeStat, dark: boolean, fixed: string): string {
  return SMALL_FIX.R753 !== 0 ? hudCss(hudSlot(HUD_SKILL_SLOTS[stat], dark)) : fixed;
}

export function hudSkillHideDist(M: number): number {
  return (1.2 * HUD_SK_SEG) * M + 80;
}

export function hudSkillRowY(r: number, n: number): number {
  return HUD_SK_LAST_Y - (n - 1 - r) * HUD_SK_PITCH;
}

export function hudSkillFillCap(L: number): number {
  const x = HUD_SK_TRACK_L + HUD_SK_SEG * L - HUD_SK_TRACK_R;
  return x > HUD_SK_CAP0 ? x : HUD_SK_CAP0;
}

export function hudSkillPreview(L: number, j: number, points: number, M: number): number {
  if (points <= 0 || L >= M) return L;
  const want = j + 1 > L + 1 ? j + 1 : L + 1;
  const cap = L + points < M ? L + points : M;
  return want < cap ? want : cap;
}

export function hudInRevealZone(x: number, y: number, screenH: number, s: number): boolean {
  return x < HUD_SK_ZONE_W * s && y >= screenH - HUD_SK_ZONE_H * s;
}

export const HUD_XI_WM_FONT = 18;
export const HUD_XI_FONT = 11;
export const HUD_XI_PITCH = 14;
export const HUD_XI_ABOVE_MM = 15;
export const HUD_XI_WM_GAP = 19.5;

export const HUD_MSG_FONT = 15;
export const HUD_MSG_TOP = 25;
export const HUD_MSG_BOX = 20;
export const HUD_MSG_PITCH = 23;
export const HUD_MSG_PILL_R = 10;
export const HUD_MSG_PILL_ALPHA = 0.5;
export const HUD_MSG_FADE_MS = 300;
export const HUD_MSG_LIFE_MS = 10000;
export const HUD_MSG_MAX = 4;
export const HUD_MSG_ROWS_MAX = 8;

export function hudSmoothstep(a: number): number {
  return a * a * (3 - 2 * a);
}

export function hudMsgOwnAlpha(age: number, life: number): number {
  const a = (age < life - age ? age : life - age) / HUD_MSG_FADE_MS;
  return a <= 0 ? 0 : a >= 1 ? 1 : a;
}

export function hudMsgEval(births: ArrayLike<number>, lives: ArrayLike<number>, n: number, t: number,
    outA: { [i: number]: number }, outY: { [i: number]: number }, weights?: ArrayLike<number>): void {
  let S = 0, Y = 0;
  for (let i = 0; i < n; i++) {
    let a = hudMsgOwnAlpha(t - births[i], lives[i]);
    const room = HUD_MSG_MAX - S;
    if (room < a) a = room > 0 ? room : 0;
    outA[i] = a; outY[i] = Y;
    S += a; Y += weights ? weights[i] * hudSmoothstep(a) : hudSmoothstep(a);
  }
}

export function hudMsgWeight(lines: number): number {
  return lines <= 1 ? 1 : (lines * HUD_MSG_BOX + (HUD_MSG_PITCH - HUD_MSG_BOX)) / HUD_MSG_PITCH;
}

export interface HudMsgTrack {
  end: number;
  capped: boolean;
  at: number[]; av: number[];
  yt: number[]; yv: number[]; c1: number[]; c2: number[];
}

const _MSG_LIN = 1e-9;

export function hudMsgPlan(births: ArrayLike<number>, lives: ArrayLike<number>, n: number, t0: number, weights?: ArrayLike<number>): HudMsgTrack[] {
  const w = (j: number): number => (weights ? weights[j] : 1);
  const out: HudMsgTrack[] = [];
  let horizon = 0;
  for (let i = 0; i < n; i++) { const d = births[i] + lives[i] - t0; if (d > horizon) horizon = d; }
  if (!(horizon > 0)) {
    for (let i = 0; i < n; i++) out.push({ end: 0, capped: false, at: [], av: [], yt: [], yv: [], c1: [], c2: [] });
    return out;
  }
  const cand: number[] = [];
  for (let i = 0; i < n; i++) {
    const b = births[i] - t0, L = lives[i];
    cand.push(b, b + HUD_MSG_FADE_MS, b + L - HUD_MSG_FADE_MS, b + L, b + L / 2);
  }
  cand.sort((x, y) => x - y);
  const A0: number[] = new Array(n), A1: number[] = new Array(n), Aq: number[] = new Array(n), Ay: number[] = new Array(n);
  const knots: number[] = [0];
  const refine = (a: number, b: number, depth: number): void => {
    if (b - a < 1e-6 || depth > 24 || knots.length > 256) { knots.push(b); return; }
    hudMsgEval(births, lives, n, t0 + a, A0, Ay);
    hudMsgEval(births, lives, n, t0 + b, A1, Ay);
    let worst = _MSG_LIN, row = -1;
    for (let q = 1; q <= 3; q++) {
      hudMsgEval(births, lives, n, t0 + a + (b - a) * q / 4, Aq, Ay);
      for (let i = 0; i < n; i++) {
        const dev = Math.abs(Aq[i] - (A0[i] + (A1[i] - A0[i]) * q / 4));
        if (dev > worst) { worst = dev; row = i; }
      }
    }
    if (row < 0) { knots.push(b); return; }
    const h = Math.max(1e-7, (b - a) * 1e-4);
    const va = A0[row], vb = A1[row];
    hudMsgEval(births, lives, n, t0 + a + h, Aq, Ay); const sL = (Aq[row] - va) / h;
    hudMsgEval(births, lives, n, t0 + b - h, Aq, Ay); const sR = (vb - Aq[row]) / h;
    let t = a + ((vb - va) - sR * (b - a)) / (sL - sR);
    if (!(t > a + 1e-6 && t < b - 1e-6)) t = (a + b) / 2;
    refine(a, t, depth + 1);
    refine(t, b, depth + 1);
  };
  let prev = 0;
  for (let k = 0; k < cand.length; k++) {
    const t = cand[k];
    if (!(t > prev + 1e-7) || !(t < horizon - 1e-7)) continue;
    refine(prev, t, 0);
    prev = t;
  }
  refine(prev, horizon, 0);
  const K = knots.length;
  const rowA: number[][] = [];
  for (let i = 0; i < n; i++) rowA.push(new Array(K));
  for (let k = 0; k < K; k++) {
    hudMsgEval(births, lives, n, t0 + knots[k], A0, Ay);
    for (let i = 0; i < n; i++) rowA[i][k] = A0[i];
  }
  const bends = (i: number, k: number): boolean => {
    const a = rowA[i];
    const s0 = (a[k] - a[k - 1]) / (knots[k] - knots[k - 1]);
    const s1 = (a[k + 1] - a[k]) / (knots[k + 1] - knots[k]);
    return Math.abs(s1 - s0) > 1e-10;
  };
  for (let i = 0; i < n; i++) {
    const a = rowA[i];
    let kr = 0;
    while (kr < K && !(a[kr] > _MSG_LIN)) kr++;
    if (kr >= K - 1) {
      out.push({ end: 0, capped: false, at: [], av: [], yt: [], yv: [], c1: [], c2: [] });
      continue;
    }
    let ke = kr + 1;
    while (ke < K - 1 && a[ke] > _MSG_LIN) ke++;
    const end = knots[ke];
    let capped = false;
    for (let k = 0; k <= ke; k++) {
      if (a[k] < hudMsgOwnAlpha(t0 + knots[k] - births[i], lives[i]) - 1e-9) { capped = true; break; }
    }
    const at: number[] = [0], av: number[] = [a[0]];
    for (let k = 1; k < ke; k++) if (bends(i, k)) { at.push(knots[k]); av.push(a[k]); }
    at.push(end); av.push(a[ke] > _MSG_LIN ? a[ke] : 0);
    const yt: number[] = [], yv: number[] = [], c1: number[] = [], c2: number[] = [];
    const piece = (ta: number, tb: number, pa: number[], pb: number[], depth: number): void => {
      let Ya = 0, Yb = 0, Da = 0, Db = 0;
      for (let j = 0; j < i; j++) {
        const x = pa[j], y = pb[j], wj = w(j);
        Ya += wj * hudSmoothstep(x); Yb += wj * hudSmoothstep(y);
        Da += wj * 6 * x * (1 - x) * (y - x); Db += wj * 6 * y * (1 - y) * (y - x);
      }
      const dY = Yb - Ya, span = Math.abs(dY), slope = Math.abs(Da) > Math.abs(Db) ? Math.abs(Da) : Math.abs(Db);
      if (slope > 1e-9 && slope > 24 * span && depth < 6) {
        const pm: number[] = new Array(i);
        for (let j = 0; j < i; j++) pm[j] = (pa[j] + pb[j]) / 2;
        piece(ta, (ta + tb) / 2, pa, pm, depth + 1);
        piece((ta + tb) / 2, tb, pm, pb, depth + 1);
        return;
      }
      yt.push(ta); yv.push(Ya);
      if (span < 1e-9) { c1.push(NaN); c2.push(NaN); }
      else { c1.push(Da / (3 * dY)); c2.push(1 - Db / (3 * dY)); }
    };
    let ka = 0;
    for (let k = 1; k <= ke; k++) {
      let cut = k === ke;
      for (let j = 0; j < i && !cut; j++) cut = bends(j, k);
      if (!cut) continue;
      const pa: number[] = new Array(i), pb: number[] = new Array(i);
      for (let j = 0; j < i; j++) { pa[j] = rowA[j][ka]; pb[j] = rowA[j][k]; }
      piece(knots[ka], knots[k], pa, pb, 0);
      ka = k;
    }
    let Ye = 0;
    for (let j = 0; j < i; j++) Ye += w(j) * hudSmoothstep(rowA[j][ke]);
    yt.push(end); yv.push(Ye);
    out.push({ end, capped, at, av, yt, yv, c1, c2 });
  }
  return out;
}

export function hudMsgTrackAlpha(tr: HudMsgTrack, t: number): number {
  const n = tr.at.length;
  if (n === 0) return 0;
  if (t <= tr.at[0]) return tr.av[0];
  if (t >= tr.at[n - 1]) return tr.av[n - 1];
  let k = 0;
  while (k < n - 2 && tr.at[k + 1] <= t) k++;
  return tr.av[k] + (tr.av[k + 1] - tr.av[k]) * (t - tr.at[k]) / (tr.at[k + 1] - tr.at[k]);
}

export function hudMsgTrackPlace(tr: HudMsgTrack, t: number): number {
  const n = tr.yt.length;
  if (n === 0) return 0;
  if (t <= tr.yt[0]) return tr.yv[0];
  if (t >= tr.yt[n - 1]) return tr.yv[n - 1];
  let k = 0;
  while (k < n - 2 && tr.yt[k + 1] <= t) k++;
  const u = (t - tr.yt[k]) / (tr.yt[k + 1] - tr.yt[k]);
  const e = Number.isNaN(tr.c1[k]) ? u : 3 * (1 - u) * (1 - u) * u * tr.c1[k] + 3 * (1 - u) * u * u * tr.c2[k] + u * u * u;
  return tr.yv[k] + (tr.yv[k + 1] - tr.yv[k]) * e;
}

export const HUD_MSG_WAKE_LEAD_MS = 60;
export const HUD_MSG_JOIN_MS = 2 * HUD_MSG_WAKE_LEAD_MS;

export interface HudMsgWindow { until: number; next: number; }

export function hudMsgWindow(plan: HudMsgTrack[], out: HudMsgWindow): void {
  const span: number[] = [];
  for (let i = 0; i < plan.length; i++) {
    const tr = plan[i];
    if (!(tr.end > 0)) continue;
    for (let k = 0; k + 1 < tr.at.length; k++) if (tr.av[k + 1] !== tr.av[k]) span.push(tr.at[k], tr.at[k + 1]);
    for (let k = 0; k + 1 < tr.yt.length; k++) if (tr.yv[k + 1] !== tr.yv[k] || !Number.isNaN(tr.c1[k])) span.push(tr.yt[k], tr.yt[k + 1]);
  }
  const order: number[] = [];
  for (let j = 0; j < span.length; j += 2) order.push(j);
  order.sort((a, b) => span[a] - span[b]);
  let until = 0, next = Infinity;
  for (let q = 0; q < order.length; q++) {
    const s = span[order[q]], e = span[order[q] + 1];
    if (s <= until + HUD_MSG_JOIN_MS) { if (e > until) until = e; }
    else { next = s; break; }
  }
  out.until = until; out.next = next;
}

export function hudMsgWithArticle(word: string): string {
  if (/^The /.test(word)) return word;
  return (/^[aeiou]/i.test(word) ? 'an ' : 'a ') + word;
}

export function hudMsgProjectileWord(visual: string, motor: boolean): string {
  switch (visual) {
    case 'bullet': return 'Bullet';
    case 'drone': return 'Drone';
    case 'swarm': return 'Swarm Drone';
    case 'trap': return motor ? 'Set Trap' : 'Thrown Trap';
    case 'minion': return 'Minion';
    case 'hive': return 'Hive';
    case 'boomerang': return 'Boomerang';
    default: return '';
  }
}

export function hudMsgKillLine(ownName: string, kind: string, boss: boolean): string {
  if (ownName !== '') return kind !== '' ? `You killed ${ownName}'s ${kind}.` : `You killed ${ownName}.`;
  if (kind === '') return '';
  return boss ? `You killed a visiting ${kind}.` : `You killed an unnamed ${kind}.`;
}

export function hudMsgShapeKillLine(name: string): string {
  return name !== '' ? `You killed ${hudMsgWithArticle(name)}.` : '';
}

export function hudMsgDeathLine(ownName: string, tool: string): string {
  if (ownName !== '') return tool !== '' ? `${ownName} killed you with ${hudMsgWithArticle(tool)}.` : `${ownName} killed you.`;
  return tool !== '' ? `You have been killed by ${hudMsgWithArticle(tool)}.` : '';
}

export const HUD_MSG_ALWAYS_INVISIBLE = 'You are always invisible.';

export function hudMsgAlwaysInvisibleRounds(visual: string): string {
  switch (visual) {
    case 'bullet': return 'Your bullets are always invisible.';
    case 'trap': return 'Your traps are always invisible.';
    case 'drone': return 'Your drones are always invisible.';
    case 'swarm': return 'Your swarm drones are always invisible.';
    case 'minion': return 'Your minions are always invisible.';
    case 'hive': return 'Your hives are always invisible.';
    case 'boomerang': return 'Your boomerangs are always invisible.';
    default: return '';
  }
}

export function hudMsgBarrelHint(n: number): string {
  if (!(n > 0)) return '';
  return n === 1 ? 'Right click to fire your main barrel.' : 'Right click to fire your main barrels.';
}

export const HUD_HP_TRACK_R = 3;
export const HUD_HP_FILL_R = 1.5;
export const HUD_HP_R_FACTOR = 1.1;
export const HUD_HP_BELOW = 12;

export function hudShieldAlpha(shield: number): number {
  return 0.3 + 0.3 * shield;
}

export function hudHpBarAlpha(op: number): number {
  if (!(op > 0.1)) return 0;
  return op >= 1 ? 1 : 1 - Math.sqrt((1 - op) / 0.9);
}
