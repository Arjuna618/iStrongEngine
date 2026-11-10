import { HUD_UP_ORIGIN, HUD_UP_PITCH, HUD_UP_TILE, HUD_REF_W, HUD_REF_H, HUD_UP_PHONE_COLS } from './hudArras';

export const MOB_UI = 1.5;
export const MOB_FIT_W = 1280;

export function mobHudFactor(w: number, h: number): number {
  const s1 = Math.max(w / HUD_REF_W, h / HUD_REF_H);
  if (!(s1 > 0)) return MOB_UI;
  const vw = w / (s1 * MOB_UI);
  return vw >= MOB_FIT_W ? MOB_UI : MOB_UI * vw / MOB_FIT_W;
}

export const MOB_STICK_LX = 0.15;
export const MOB_STICK_RX = 0.85;
export const MOB_STICK_Y = 0.7;
export function mobStickR(w: number, h: number): number { return Math.min(0.06 * w, 0.12 * h); }
export const MOB_FIT_GAP = 20;
export interface MobSticks { lx: number; rx: number; y: number; R: number; }
export function mobSticksAt(w: number, h: number, k: number, out: MobSticks): MobSticks {
  out.R = mobStickR(w, h) * k;
  out.lx = MOB_STICK_LX * w; out.rx = MOB_STICK_RX * w;
  out.y = h - (1 - MOB_STICK_Y) * h * k;
  return out;
}
export function mobRoom(cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0;
  const dy = cy < y0 ? y0 - cy : cy > y1 ? cy - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy) - r;
}
export const MOB_K_MIN = 0.8;
export const MOB_K_FLOOR = 0.6;
export const MOB_M_MIN = 0.7;
export const MOB_M_FLOOR = 0.4;
export const MOB_B_MIN = 0.85;
export const MOB_B_ROWS_MIN = 2;
export const MOB_BOARD_W = 262;
export const MOB_BOARD_PAD_R = 22;
export const MOB_BOARD_TITLE = 23;
export function mobBoardH(n: number): number { return n > 0 ? 45 + 19 * (n - 1) : 25; }
export const MOB_BOARD_UNDER = 12;
export function mobBoardTop(tileP: number, tileColY: number, skillP: number, skillReach: boolean, ySkill: number): number {
  const c0 = MOB_BOARD_TITLE;
  const cPanel = c0 + tileP * ((tileColY > c0 ? tileColY : c0) - c0);
  if (!skillReach || !(skillP > 0)) return cPanel;
  const cSkill = ySkill + MOB_SK_BLOCK - 2;
  return cPanel + skillP * ((cSkill > cPanel ? cSkill : cPanel) - cPanel);
}

export function mobTileColY(n: number, cols: number, rows: number, t: number, W: number): number {
  const edge = W - MOB_BOARD_W - MOB_BOARD_UNDER;
  let y = (MOB_DU_Y + 20) * t + MOB_BOARD_UNDER;
  for (let r = 0; r < rows; r++) {
    const c = r < rows - 1 ? cols : n - (rows - 1) * cols;
    if ((HUD_UP_ORIGIN + c * HUD_UP_PITCH - (HUD_UP_PITCH - HUD_UP_TILE)) * t > edge) y = (HUD_UP_ORIGIN + r * HUD_UP_PITCH + HUD_UP_TILE) * t + MOB_BOARD_UNDER;
  }
  return y;
}
export function mobSkillReach(n: number, W: number): boolean { return HUD_UP_ORIGIN + n * HUD_UP_PITCH + 40 > W - MOB_BOARD_W - MOB_BOARD_UNDER; }
export const MOB_PLUS_ROW_W = 2 * (160 / 3) + 20;
export const MOB_BOTTOM_NAMED = 114;
export const MOB_BOTTOM_BARS = 72;

export interface MobFitIn {
  W: number; H: number;
  mmX: number; mmY: number; mmW: number; mmH: number; plusGap: number; plusW: number; plusH: number;
  boardRows: number; boardTop: number;
  gap: number;
}
export interface MobFitOut { k: number; m: number; b: number; rows: number; hide: boolean; }
const _rg: MobSticks = { lx: 0, rx: 0, y: 0, R: 0 };
export function mobLeftRoom(f: MobFitIn, k: number, m: number): number {
  mobSticksAt(f.W, f.H, k, _rg);
  const w = f.mmW * m, h = f.mmH * m;
  const a = mobRoom(_rg.lx, _rg.y, _rg.R, f.mmX, f.mmY, f.mmX + w, f.mmY + h);
  const px = f.mmX + w + f.plusGap;
  const b = mobRoom(_rg.lx, _rg.y, _rg.R, px, f.mmY, px + f.plusW, f.mmY + f.plusH);
  return a < b ? a : b;
}
export function mobRightRoom(f: MobFitIn, k: number, b: number, n: number): number {
  mobSticksAt(f.W, f.H, k, _rg);
  return mobRoom(_rg.rx, _rg.y, _rg.R, f.W - MOB_BOARD_W * b, f.boardTop, f.W - MOB_BOARD_PAD_R * b, f.boardTop + mobBoardH(n) * b);
}
function _kLeft(f: MobFitIn, m: number, lo: number, hi: number): number {
  for (let i = 0; i < 24; i++) { const x = (lo + hi) / 2; if (mobLeftRoom(f, x, m) >= f.gap) lo = x; else hi = x; }
  return lo;
}
function _mLeft(f: MobFitIn, k: number, lo: number, hi: number): number {
  for (let i = 0; i < 24; i++) { const x = (lo + hi) / 2; if (mobLeftRoom(f, k, x) >= f.gap) lo = x; else hi = x; }
  return lo;
}
function _kRight(f: MobFitIn, b: number, n: number, lo: number, hi: number): number {
  for (let i = 0; i < 24; i++) { const x = (lo + hi) / 2; if (mobRightRoom(f, x, b, n) >= f.gap) lo = x; else hi = x; }
  return lo;
}
function _bRight(f: MobFitIn, k: number, n: number, lo: number, hi: number): number {
  for (let i = 0; i < 24; i++) { const x = (lo + hi) / 2; if (mobRightRoom(f, k, x, n) >= f.gap) lo = x; else hi = x; }
  return lo;
}
export function mobFitAll(f: MobFitIn, out: MobFitOut): MobFitOut {
  const g = f.gap;
  let kL: number;
  if (mobLeftRoom(f, 1, 1) >= g) kL = 1;
  else if (mobLeftRoom(f, MOB_K_MIN, 1) >= g) kL = _kLeft(f, 1, MOB_K_MIN, 1);
  else if (mobLeftRoom(f, MOB_K_MIN, MOB_M_MIN) >= g) kL = MOB_K_MIN;
  else if (mobLeftRoom(f, MOB_K_FLOOR, MOB_M_MIN) >= g) kL = _kLeft(f, MOB_M_MIN, MOB_K_FLOOR, MOB_K_MIN);
  else kL = MOB_K_FLOOR;
  const N = f.boardRows > 0 ? f.boardRows : 0;
  const nMin = N < MOB_B_ROWS_MIN ? N : MOB_B_ROWS_MIN;
  let kR = 1;
  if (N > 0 && mobRightRoom(f, 1, 1, N) < g) {
    if (mobRightRoom(f, MOB_K_MIN, 1, N) >= g) kR = _kRight(f, 1, N, MOB_K_MIN, 1);
    else if (mobRightRoom(f, MOB_K_MIN, MOB_B_MIN, nMin) >= g) kR = MOB_K_MIN;
    else if (mobRightRoom(f, MOB_K_FLOOR, MOB_B_MIN, nMin) >= g) kR = _kRight(f, MOB_B_MIN, nMin, MOB_K_FLOOR, MOB_K_MIN);
  }
  const k = kL < kR ? kL : kR;
  out.k = k;
  out.m = mobLeftRoom(f, k, 1) >= g ? 1 : mobLeftRoom(f, k, MOB_M_FLOOR) >= g ? _mLeft(f, k, MOB_M_FLOOR, 1) : MOB_M_FLOOR;
  out.hide = false;
  if (N === 0 || mobRightRoom(f, k, 1, N) >= g) { out.b = 1; out.rows = N; }
  else if (mobRightRoom(f, k, MOB_B_MIN, N) >= g) { out.b = _bRight(f, k, N, MOB_B_MIN, 1); out.rows = N; }
  else {
    out.b = MOB_B_MIN;
    let n = N - 1;
    while (n >= nMin && mobRightRoom(f, k, MOB_B_MIN, n) < g) n--;
    if (n >= nMin && n >= 1) out.rows = n;
    else { out.rows = N; out.hide = true; }
  }
  return out;
}

export const MOB_MENU_MAX = 0.8;
export const MOB_KEYS_MAX = 0.85;
export const MOB_MENU_MIN = 0.55;
export interface MobPlace { x: number; y: number; s: number; }
export function mobMenuPlace(W: number, H: number, k: number, y3: number, bottomTop: number, boxW: number, boxH: number, max: number, gap: number, out: MobPlace): MobPlace {
  mobSticksAt(W, H, k, _rg);
  const room = (_rg.rx - _rg.R - gap) - (_rg.lx + _rg.R + gap);
  let s = max;
  if (boxW * s > room) s = room / boxW;
  const down = bottomTop - gap;
  const fit = (down - y3) / boxH;
  if (fit < s) s = fit;
  if (!(s > MOB_MENU_MIN)) s = MOB_MENU_MIN;
  out.s = s;
  out.x = (W - boxW * s) / 2;
  const y = down - boxH * s;
  out.y = y < y3 ? y : y3;
  return out;
}

export const MOB_KNOB_R = 0.5;
export const MOB_KNOB_TRAVEL = 0.8;
export const MOB_RING_ALPHA = 0.2;
export const MOB_KNOB_ALPHA = 0.3;
export const MOB_STICK_SLOT = 19;

export interface MobXY { x: number; y: number; }

export function mobKnob(dx: number, dy: number, R: number, out: MobXY): MobXY {
  const L = Math.hypot(dx, dy); const max = MOB_KNOB_TRAVEL * R;
  if (L > max && L > 0) { out.x = dx * max / L; out.y = dy * max / L; } else { out.x = dx; out.y = dy; }
  return out;
}

export const MOB_DIR_SIN = Math.sin(Math.PI / 8);
export const MOB_UP = 1, MOB_DOWN = 2, MOB_LEFT = 4, MOB_RIGHT = 8;
export const MOB_KEY_CODES: readonly string[] = ['KeyW', 'KeyS', 'KeyA', 'KeyD'];

export function mobMoveBits(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx); const x = Math.cos(a), y = Math.sin(a);
  let b = 0;
  if (y < -MOB_DIR_SIN) b |= MOB_UP;
  if (y > MOB_DIR_SIN) b |= MOB_DOWN;
  if (x < -MOB_DIR_SIN) b |= MOB_LEFT;
  if (x > MOB_DIR_SIN) b |= MOB_RIGHT;
  return b;
}

export const MOB_AIM_GAIN = 4;
export const MOB_AIM_BOX_X = HUD_REF_W / 2;
export const MOB_AIM_BOX_Y = HUD_REF_H / 2;

export function mobAim(dx: number, dy: number, w: number, h: number, out: MobXY): boolean {
  const s1 = Math.max(w / HUD_REF_W, h / HUD_REF_H);
  const ax = MOB_AIM_GAIN * dx, ay = MOB_AIM_GAIN * dy;
  const bx = MOB_AIM_BOX_X * s1, by = MOB_AIM_BOX_Y * s1;
  let k = 1;
  if (Math.abs(ax) > bx) k = Math.min(k, bx / Math.abs(ax));
  if (Math.abs(ay) > by) k = Math.min(k, by / Math.abs(ay));
  out.x = ax * k; out.y = ay * k;
  return k < 1;
}

export const MOB_RC_NEVER = 0, MOB_RC_ALWAYS = 1, MOB_RC_AUTOMATIC = 2, MOB_RC_MANUAL = 3, MOB_RC_DOUBLE_TAP = 4;
export const MOB_RC_WORDS: readonly string[] = ['Never', 'Always', 'Automatic', 'Manual', 'Double Tap'];
export const MOB_RC_MARK = '\u2756';
export const MOB_DOUBLE_TAP_MS = 400;

export function mobAimAlt(mode: number, boxed: boolean, doubleTapped: boolean, aim: MobXY): boolean {
  switch (mode) {
    case MOB_RC_ALWAYS: return true;
    case MOB_RC_AUTOMATIC: if (boxed) { aim.x = -aim.x; aim.y = -aim.y; return true; } return false;
    case MOB_RC_DOUBLE_TAP: return doubleTapped;
    default: return false;
  }
}

export function mobManualZone(x: number, y: number, w: number, h: number): boolean { return x < w / 2 && y < h / 2; }

export const MOB_CROSS_IN = 0.15;
export const MOB_CROSS_OUT = 0.4;
export const MOB_CROSS_R = 0.025;
export const MOB_CROSS_ALPHA = 0.5;
export const MOB_BRACKET = 0.4;
export const MOB_BRACKET_ARM = 0.15;
export const MOB_ARROW_TIP = 1.2;
export const MOB_ARROW_LEG = 0.2 * Math.SQRT2;
export const MOB_ARROW_ALPHA = 0.4;
export function mobMoveAngle(bits: number): number {
  const x = ((bits & MOB_RIGHT) ? 1 : 0) - ((bits & MOB_LEFT) ? 1 : 0);
  const y = ((bits & MOB_DOWN) ? 1 : 0) - ((bits & MOB_UP) ? 1 : 0);
  return x === 0 && y === 0 ? NaN : Math.atan2(y, x);
}
export const MOB_ARROW_GAP = 0.2;
export function mobArrowTip(R: number, tankR: number): number {
  const far = tankR + (MOB_ARROW_GAP + MOB_ARROW_TIP - 1) * R;
  return far > MOB_ARROW_TIP * R ? far : MOB_ARROW_TIP * R;
}
export function mobArrow(angle: number, R: number, out: number[], tip: number = MOB_ARROW_TIP * R): number[] {
  const tx = Math.cos(angle) * tip, ty = Math.sin(angle) * tip;
  const l = MOB_ARROW_LEG * R, a1 = angle + Math.PI * 3 / 4, a2 = angle - Math.PI * 3 / 4;
  out[0] = tx; out[1] = ty;
  out[2] = tx + Math.cos(a1) * l; out[3] = ty + Math.sin(a1) * l;
  out[4] = tx + Math.cos(a2) * l; out[5] = ty + Math.sin(a2) * l;
  return out;
}

export const MOB_UP_COLS = HUD_UP_PHONE_COLS;
export const MOB_DU_X = HUD_UP_ORIGIN + MOB_UP_COLS * HUD_UP_PITCH;
export const MOB_DU_Y = 20;
export const MOB_UP_HIDE = HUD_UP_PITCH * (MOB_UP_COLS + 1);

export const MOB_SK_W = HUD_UP_TILE;
export const MOB_SK_H = 500 / 9;
export const MOB_SK_BAND = 0.6;
export const MOB_SK_STRIP = 100 / 9;
export const MOB_SK_FONT = 13.4;
export const MOB_SK_TEXT_MID = 29.3;
export const MOB_SK_TEXT_GAP = 16.5;
export const MOB_SK_COUNT_X = HUD_UP_ORIGIN + 10 * HUD_UP_PITCH;
export const MOB_SK_HIDE = 1225;
export const MOB_SK_BLOCK = 92.78;
export const MOB_SK_DRAG = 52.5;
export const MOB_SK_COL_H = 6 * MOB_SK_H;
export const MOB_SK_HOLD_MS = 150;
export const MOB_SK_LEVEL_DY = 13.9;
export function mobColumnLevel(yRow: number, M: number): number {
  const t = (yRow - MOB_SK_H) / MOB_SK_COL_H;
  if (!(t > 0)) return 0;
  const n = Math.floor(t * M) + 1;
  return n > M ? M : n;
}

export const MOB_MM_X = HUD_UP_ORIGIN;
export const MOB_BTN_H = 160 / 3;
export const MOB_PLUS_GAP = 25;
export const MOB_BTN_GAP = 20;
export const MOB_FULL_W = 200;
export interface MobKey { code: string; word: string; }
const _k = (codes: string, words: string): MobKey[] => codes.split(' ').map((c, i) => ({ code: c, word: words.split(' ')[i] }));
export const MOB_KEYBOARD: readonly { col: number; keys: readonly MobKey[] }[] = [
  { col: 0, keys: _k('Backquote Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal', '` 1 2 3 4 5 6 7 8 9 0 - =') },
  { col: 1, keys: _k('KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight', 'Q W E R T Y U I O P [ ]') },
  { col: 1, keys: _k('KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote', "A S D F G H J K L ; '") },
  { col: 2, keys: _k('KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash', 'Z X C V B N M , . /') },
];
export const MOB_BTN_FONT = 80 / 3;
export const MOB_MENU_PITCH = 220 / 3;
export type MobMenuAction = 'close' | 'rcMode' | 'selfDestruct' | 'autofire' | 'override' | 'pause' | 'action' | 'autospin' | 'reverse'
  | 'classTree' | 'chat';
export interface MobMenuButton { act: MobMenuAction; w: number; }
export const MOB_MENU_ROWS: readonly (readonly MobMenuButton[])[] = [
  [{ act: 'close', w: 160 / 3 }, { act: 'rcMode', w: 1040 / 3 }, { act: 'selfDestruct', w: 820 / 3 }],
  [{ act: 'autofire', w: 490 / 3 }, { act: 'override', w: 490 / 3 }, { act: 'pause', w: 200 }, { act: 'action', w: 380 / 3 }],
  [{ act: 'autospin', w: 490 / 3 }, { act: 'reverse', w: 490 / 3 }, { act: 'classTree', w: 200 }, { act: 'chat', w: 380 / 3 }],
];
export const MOB_MENU_WORDS: Readonly<Record<MobMenuAction, string>> = {
  close: '\u2212', rcMode: '', selfDestruct: 'Self-Destruct', autofire: 'Autofire', override: 'Override', pause: 'Pause',
  action: 'Action', autospin: 'Autospin', reverse: 'Reverse', classTree: 'Class Tree', chat: 'Chat',
};
export const MOB_MENU_KEYS: Partial<Readonly<Record<MobMenuAction, string>>> = {
  autofire: 'KeyE', override: 'KeyR', action: 'KeyF', autospin: 'KeyC', reverse: 'KeyV', selfDestruct: 'KeyO', classTree: 'KeyT',
};

export interface MobLayout { ySkill: number; y3: number; }
export function mobLayout(tileRows: number, skillShown: number, out: MobLayout): MobLayout {
  out.ySkill = HUD_UP_ORIGIN + tileRows * HUD_UP_PITCH;
  out.y3 = out.ySkill + skillShown * MOB_SK_BLOCK;
  return out;
}
export function mobTopShift(y3: number): number { return y3 - HUD_UP_ORIGIN; }

export function mobSkillLines(name: string): [string] | [string, string] {
  const i = name.indexOf(' ');
  return i < 0 ? [name] : [name.slice(0, i), name.slice(i + 1)];
}
