import { CM, CM_COUNT, CM_FREE, CM_NAMES, CM_TAB_ORDER, cmHex, cmMapOf, cmDesignHex } from '../../utils/colorMap';

export interface ColorMapValue {
  color: string;
  colorMap: number | undefined;
  colorFree: string | undefined;
}

export function cmfSlot(v: ColorMapValue): number {
  const m = cmMapOf(v.colorMap);
  return m !== undefined && m >= 0 ? m : -1;
}

export function cmfIsNamed(v: ColorMapValue): boolean {
  return cmfSlot(v) >= 0;
}

export function cmfSwitchOn(v: ColorMapValue, use: number): ColorMapValue {
  if (cmfIsNamed(v)) return v;
  const hex = v.color.toLowerCase();
  let slot = CM_TAB_ORDER[0];
  for (let s = 0; s < CM_COUNT; s++) if (cmHex(s, false, use) === hex) { slot = s; break; }
  return { color: cmHex(slot, false, use), colorMap: slot, colorFree: v.color };
}

export function cmfSwitchOff(v: ColorMapValue): ColorMapValue {
  if (!cmfIsNamed(v)) return v;
  return { color: v.colorFree ?? v.color, colorMap: CM_FREE, colorFree: undefined };
}

export function cmfPickName(v: ColorMapValue, slot: number, use: number): ColorMapValue {
  const s = cmMapOf(slot);
  if (s === undefined || s < 0 || s === cmfSlot(v)) return v;
  return { color: cmHex(s, false, use), colorMap: s, colorFree: cmfIsNamed(v) ? v.colorFree : v.color };
}

export function cmfPickColor(v: ColorMapValue, hex: string): ColorMapValue {
  if (v.color === hex && v.colorMap === CM_FREE && v.colorFree === undefined) return v;
  return { color: hex, colorMap: CM_FREE, colorFree: undefined };
}

export interface TurretColorWords {
  color?: string;
  colorMap?: number;
  colorFree?: string;
}

export function cmfTurretIsSet(t: TurretColorWords): boolean {
  return cmMapOf(t.colorMap) !== undefined;
}

const CMF_TURRET_DEFAULT_NAME = CM.BARRELS;
export const CMF_TURRET_DEFAULT_LABEL = CM_NAMES[CMF_TURRET_DEFAULT_NAME];

export function cmfTurretValue(t: TurretColorWords, whenUnset: string, use: number): ColorMapValue {
  const m = cmMapOf(t.colorMap);
  if (m === undefined) return { color: cmHex(CMF_TURRET_DEFAULT_NAME, false, use), colorMap: CMF_TURRET_DEFAULT_NAME, colorFree: undefined };
  return { color: cmDesignHex(t.color ?? whenUnset, m, use), colorMap: m, colorFree: m >= 0 ? t.colorFree : undefined };
}

export function cmfTurretSwitchValue(_t: TurretColorWords, shown: ColorMapValue, _use: number): ColorMapValue {
  return shown;
}

export function cmfTurretIsDefaultLook(t: TurretColorWords): boolean {
  const m = cmMapOf(t.colorMap);
  return m === undefined || m === CMF_TURRET_DEFAULT_NAME;
}

export function cmfTurretPatch(shown: ColorMapValue, next: ColorMapValue, defaultShade?: string): TurretColorWords | null {
  if (next === shown) return null;
  if (cmfSlot(shown) === CMF_TURRET_DEFAULT_NAME && shown.colorFree === undefined && next.colorMap === CM_FREE) return { color: defaultShade ?? next.color, colorMap: CM_FREE, colorFree: undefined };
  return { color: next.color, colorMap: next.colorMap, colorFree: shown.colorMap !== undefined ? next.colorFree : undefined };
}

export function cmfTurretDefault(): TurretColorWords {
  return { color: undefined, colorMap: undefined, colorFree: undefined };
}

export function cmfOptions(dark: boolean, use: number): { value: string; label: string; swatch: string }[] {
  return CM_TAB_ORDER.map(s => ({ value: String(s), label: CM_NAMES[s], swatch: cmHex(s, dark, use) }));
}
