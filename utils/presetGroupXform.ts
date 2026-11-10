import type { Turret } from '../types';
import { SMALL_FIX } from '../game/smallFixSwitch';
export interface PresetXform { x: number; y: number; turn: number; size: number; }

export const PRESET_XFORM_NONE: Readonly<PresetXform> = Object.freeze({ x: 0, y: 0, turn: 0, size: 1 });

export const PRESET_SIZE_MIN = 0.2;
export const PRESET_SIZE_MAX = 3;

const LEN_PIVOT = 1 - 0.99 / 10.49;
const sizedLength = (len: number, s: number): number => len * s + (1 - s) * LEN_PIVOT;

export function presetXformIsNone(xf: PresetXform | undefined | null): boolean {
  return !xf || (xf.x === 0 && xf.y === 0 && xf.turn === 0 && xf.size === 1);
}

export function presetXformClean(xf: Partial<PresetXform> | undefined | null): PresetXform {
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const size = Math.min(PRESET_SIZE_MAX, Math.max(PRESET_SIZE_MIN, n(xf?.size, 1)));
  return { x: n(xf?.x, 0), y: n(xf?.y, 0), turn: n(xf?.turn, 0), size };
}

export function presetPieceXformed(t: Turret, xf: PresetXform): Turret {
  const s = xf.size, c = Math.cos(xf.turn), sn = Math.sin(xf.turn);
  const x0 = t.xOffset * s, y0 = t.yOffset * s;
  const out: Turret = {
    ...t,
    xOffset: x0 * c - y0 * sn + xf.x,
    yOffset: x0 * sn + y0 * c + xf.y,
    angle: t.angle + xf.turn,
  };
  if (s !== 1) {
    out.length = sizedLength(t.length, s);
    out.width = t.width * s;
    out.autoCircleSize = (t.autoCircleSize ?? 25) * s;
    out.autoTurretLength = sizedLength(t.autoTurretLength ?? 10, s);
    out.autoTurretWidth = (t.autoTurretWidth ?? 25) * s;
    if (t.look !== undefined) out.look = { ...t.look, size: t.look.size * s };
    if (SMALL_FIX.G665 !== 0 && Array.isArray(t.autoSubTurrets) && t.autoSubTurrets.some(u => u.look !== undefined)) {
      out.autoSubTurrets = t.autoSubTurrets.map(u => (u.look !== undefined ? { ...u, look: { ...u.look, size: u.look.size * s } } : u));
    }
  }
  return out;
}

export function presetPieceMirrored(t: Turret): Turret {
  const out: Turret = { ...t, yOffset: -t.yOffset, angle: -t.angle };
  if (Array.isArray(t.autoSubTurrets) && t.autoSubTurrets.length > 0) {
    out.autoSubTurrets = t.autoSubTurrets.map(u => ({ ...u, yOffset: -u.yOffset, angle: -u.angle }));
  }
  return out;
}

export function presetPiecesXformed(pieces: Turret[], xf: PresetXform): Turret[] {
  if (presetXformIsNone(xf)) return pieces;
  return pieces.map(t => presetPieceXformed(t, xf));
}

export function presetXformShown(xf: PresetXform): { x: number; y: number; distance: number; turnDeg: number; size: number } {
  const d = Math.sqrt(xf.x * xf.x + xf.y * xf.y);
  const deg = ((xf.turn * 180 / Math.PI) % 360 + 360) % 360;
  return { x: xf.x, y: xf.y, distance: d, turnDeg: deg, size: xf.size };
}

export function presetXformWithDistance(xf: PresetXform, d: number): PresetXform {
  const dd = Number.isFinite(d) ? Math.max(0, d) : 0;
  return { ...xf, x: dd * Math.cos(xf.turn), y: dd * Math.sin(xf.turn) };
}

export function presetXformWithTurn(xf: PresetXform, deg: number): PresetXform {
  const turn = (Number.isFinite(deg) ? deg : 0) * Math.PI / 180;
  const d = Math.sqrt(xf.x * xf.x + xf.y * xf.y);
  return { ...xf, turn, x: d * Math.cos(turn), y: d * Math.sin(turn) };
}
