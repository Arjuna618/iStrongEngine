import { useSyncExternalStore } from 'react';
import { subscribeGameTheme, gameThemeVersion, gameDark } from './gameTheme';

export function useGameThemeVersion(): number {
  return useSyncExternalStore(subscribeGameTheme, gameThemeVersion, gameThemeVersion);
}
export function useGameDark(): boolean {
  useGameThemeVersion();
  return gameDark();
}
