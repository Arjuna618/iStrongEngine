import { hudColors, type HudColors } from '../../utils/hudArras';

let _cardDark: HudColors | null = null;
export function cardColors(dark: boolean): HudColors | undefined {
  if (!dark) return undefined;
  if (!_cardDark) _cardDark = { ...hudColors(true), mmWall: hudColors(false).mmWall };
  return _cardDark;
}
