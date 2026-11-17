import { useSyncExternalStore, type CSSProperties } from 'react';
import { uiThemeId, subscribeUiTheme } from '../../utils/uiTheme';

const classicNow = () => uiThemeId() === 'classic';

export const useClassicUi = (): boolean => useSyncExternalStore(subscribeUiTheme, classicNow, classicNow);

export function fitWrapStyle(fit: number, classic: boolean): CSSProperties {
  return classic ? { zoom: fit } : { transform: `scale(${fit})`, transformOrigin: 'center center', willChange: 'transform' };
}
