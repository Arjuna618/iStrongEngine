import { CM_COUNT, CM_NAMES, CM_RGB_BASE, cmHex, cmRgbLive } from '../../utils/colorMap';

export type ColourWord = number | string;

export function colourCodeOf(w: unknown): number {
  if (typeof w === 'number') return Number.isInteger(w) && w >= 0 && w < CM_COUNT ? w : -1;
  return typeof w === 'string' ? cmRgbLive(w.trim()) : -1;
}

export function colourWordShown(w: unknown): string {
  if (typeof w === 'number') return w >= 0 && w < CM_COUNT && Number.isInteger(w) ? CM_NAMES[w] : String(w);
  return typeof w === 'string' ? w.trim().toLowerCase() : '';
}

export function hexWordOf(text: string): string | null {
  const t = text.trim();
  const h = t.startsWith('#') ? t : '#' + t;
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : null;
}

export function wornMatches(worn: number, c: number, dark: boolean, use: number): boolean {
  if (worn < 0 || c < 0) return false;
  if (c < CM_RGB_BASE) return worn === c;
  const shown = worn >= CM_RGB_BASE ? worn : worn < CM_COUNT ? cmRgbLive(cmHex(worn, dark, use)) : -1;
  return shown === c;
}
