import { CM, CM_ARRAS_DARK, CM_BORDER_LIGHT } from './colorMap';

const _g = globalThis as { __ISTRONG_OLD_DEATH?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_DEATH === 1 || _g.process?.env?.ISTRONG_OLD_DEATH === '1';

export const DEATH_ARRAS: number = _old ? 0 : 1;

export function deathSmooth(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
}
export const DEATH_EASE = 'cubic-bezier(0.3333333, 0, 0.6666667, 1)';

export const DEATH_DIM_FROM = 0.1;
export const DEATH_DIM_TO = 0.25;
export const DEATH_DIM_SEC = 0.5;
export function deathDimAlpha(t: number): number {
  return DEATH_DIM_FROM + (DEATH_DIM_TO - DEATH_DIM_FROM) * deathSmooth(t / DEATH_DIM_SEC);
}
export const DEATH_DIM_LIGHT: string = CM_BORDER_LIGHT;
export const DEATH_DIM_DARK: string = CM_ARRAS_DARK[CM.BORDERS];

export const DEATH_DROP = 800;
export const DEATH_DROP_SEC = 1;
export function deathDrop(t: number): number {
  return DEATH_DROP * (1 - deathSmooth(t / DEATH_DROP_SEC));
}

export const DEATH_LINE_START = 1;
export const DEATH_LINE_STEP = 0.25;
export const DEATH_FADE_SEC = 0.25;
export const DEATH_BLOCK_START = 3;
export function deathLineAlpha(k: number, t: number): number {
  return deathSmooth((t - (DEATH_LINE_START + DEATH_LINE_STEP * k)) / DEATH_FADE_SEC);
}
export function deathBlockAlpha(t: number): number {
  return deathSmooth((t - DEATH_BLOCK_START) / DEATH_FADE_SEC);
}

export const DEATH_SCORE_SEC = 2;
export function deathScoreShown(score: number, t: number): number {
  const q = 1 - deathSmooth(t / DEATH_SCORE_SEC);
  return Math.floor(score * (1 - q * q * q * q * q));
}

export function deathY(hv: number): number {
  return Math.min(hv / 2 - 60, hv - 500);
}
export const DEATH_FONT = { stamp: 10, level: 13, tank: 19, scoreTitle: 25, score: 50, line: 15, respawn: 15, button: 15 } as const;
export const DEATH_STROKE_F = 0.2;
export const DEATH_MID = { stamp: -166.1, level: 94.875, tank: 118.125, scoreTitle: -58.875, score: -6.375, line0: 45.75, respawn: 213 } as const;
export const DEATH_LINE_PITCH = 25;
export const DEATH_X_LEFT = -170;
export const DEATH_X_WORDS = -145;
export const DEATH_X_TANK = -270;
export const DEATH_BTN_W = 120;
export const DEATH_BTN_H = 30;
export const DEATH_BTN_DX = 75;
export const DEATH_BTN_TOP = 198;
export const DEATH_BTN_EDGE = 3;
export const DEATH_BTN_BAND = 0.6;
export const DEATH_BTN_TOP_ALONE = 233;
export const DEATH_MID_END_TITLE = -93.875;

export const DEATH_TANK_LEN = 140;
export const DEATH_TANK_CIRCLE = 105;
export const DEATH_TANK_TURN = -Math.PI / 4;
export function deathTankCircle(axis: number, mx: number, my: number, wv: number, y: number, out: { x: number; y: number }): void {
  const S = DEATH_TANK_LEN / axis;
  const bx = Math.trunc(wv / 2 - S * Math.SQRT1_2 * mx - 191 - DEATH_TANK_LEN / 2 + 0.5) - wv / 2;
  const by = Math.trunc(y + S * Math.SQRT1_2 * my + 26 + 0.5) - y;
  const k = 0.75 * S;
  const c = Math.cos(DEATH_TANK_TURN), s = Math.sin(DEATH_TANK_TURN);
  out.x = bx + k * (mx * c - my * s);
  out.y = by + k * (mx * s + my * c);
}

export function deathPhonePlace(bw: number, bh: number, hudS: number, left: number, right: number, top: number, bottom: number,
  margin: number): { u: number; y: number; xs: number } {
  const w = right - left, h = bottom - top;
  const u = Math.max(0.05, Math.min(hudS, (bw - 2 * margin) / w, (bh - 2 * margin) / h));
  const yPx = (bh - h * u) / 2 - top * u;
  return { u, y: yPx / u, xs: -(left + right) / 2 };
}

export function deathCommas(n: number): string {
  const v = Math.trunc(n);
  const neg = v < 0;
  let s = String(neg ? -v : v);
  for (let i = s.length - 3; i > 0; i -= 3) s = s.slice(0, i) + ',' + s.slice(i);
  return neg ? '-' + s : s;
}
export function deathJoin(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return parts[0] + ' and ' + parts[1];
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}
const _count = (n: number, one: string, many: string) => `${deathCommas(n)} ${n === 1 ? one : many}`;
export function deathDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s === 0) return 'less than a second';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(_count(d, 'day', 'days'));
  if (d > 0 || h > 0) parts.push(_count(h, 'hour', 'hours'));
  if (d > 0 || h > 0 || m > 0) parts.push(_count(m, 'minute', 'minutes'));
  parts.push(_count(r, 'second', 'seconds'));
  return deathJoin(parts);
}
export function deathSecondsOf(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000 - 1e-9));
}

export const DEATH_ICON = {
  survived: '\u231A', tip: '\u2753', killer: '\u{1F52A}', noKiller: '\u26C8', wave: '\u{1F30A}',
} as const;
export function deathKillIcon(kills: number, visitors: number): string {
  const d = kills + 2 * visitors;
  return d === 0 ? '\u{1F33C}' : d < 4 ? '\u{1F3AF}' : d < 8 ? '\u{1F4A5}' : d < 15 ? '\u{1F4A2}' : d < 25 ? '\u{1F525}'
    : d < 50 ? '\u{1F4A3}' : d < 75 ? '\u{1F47A}' : d < 100 ? '\u{1F336}\uFE0F' : '\u{1F4AF}';
}
export function deathKillWords(kills: number, assists: number, visitors: number, polygons: number): string {
  const parts: string[] = [];
  if (kills > 0) parts.push(_count(kills, 'kill', 'kills'));
  if (assists > 0) parts.push(_count(assists, 'assist', 'assists'));
  if (visitors > 0) parts.push(_count(visitors, 'visitor', 'visitors') + ' defeated');
  if (polygons > 0) parts.push(_count(polygons, 'polygon', 'polygons') + ' destroyed');
  return parts.length === 0 ? 'A true pacifist' : deathJoin(parts);
}
export const DEATH_TIP = 'Kill players and polygons to get more score';
export function deathArticle(word: string): string {
  return /^[aeiouAEIOU]/.test(word) ? 'an ' + word : 'a ' + word;
}
export function deathKillerOf(name: string, tank: string): string {
  return name !== '' ? `${name}'s ${tank}` : deathArticle(tank);
}
export function deathKillerLine(kind: '' | 'tank' | 'shape' | 'zone' | 'area', name: string, tank: string): { icon: string; words: string } {
  if (kind === 'zone') return { icon: DEATH_ICON.killer, words: 'Succumbed to an enemy base' };
  if (kind === 'area') return { icon: DEATH_ICON.killer, words: 'Succumbed to a Damaging Area' };
  if ((kind === 'tank' || kind === 'shape') && tank !== '') return { icon: DEATH_ICON.killer, words: 'Succumbed to ' + deathJoin([deathKillerOf(kind === 'tank' ? name : '', tank)]) };
  return { icon: DEATH_ICON.noKiller, words: 'Vanished into thin air' };
}
export function deathScoreTitle(name: string): string {
  return name !== '' ? `${name}'s Score:` : 'Your Score:';
}
export function deathRespawnIn(ms: number): string {
  return `(you may respawn in ${deathDuration(deathSecondsOf(ms))})`;
}
export function deathCannotRespawn(reason: string): string {
  let r = reason.trim().replace(/\.+$/, '');
  r = r.replace(/^You cannot respawn:?\s*/i, '');
  return r === '' ? '(you cannot respawn)' : `(you cannot respawn: ${r.charAt(0).toLowerCase()}${r.slice(1)})`;
}
export function deathStamp(epochMs: number): string {
  return new Date(Math.floor(epochMs / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
