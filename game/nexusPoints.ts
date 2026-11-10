import type { GameModeConfig, MapConfig } from '../types';
import { MODE_WORLDS, isWorldId } from './modeWorlds';
import { MISSING_MODES } from './missingModesSwitch';

export const NEXUS_POINT = { OPEN_MS: 60000, AWAY_MS: 180000, FIRST_MS: 90000 } as const;

export function nexusPointsOf(config: GameModeConfig, map: MapConfig): Partial<MapConfig> | null {
  if (MISSING_MODES.ON === 0) return null;
  const w = config.world;
  if (!isWorldId(w) || config.growth || config.armsRace || config.preset) return null;
  const mw = MODE_WORLDS[w];
  if (mw.eventOnly || mw.oneCard || mw.noCard || mw.overlay === 'assault' || mw.mode.startsWith('portal-')) return null;
  if (config.overlay && config.overlay !== mw.overlay) return null;
  if (map.enablePortals) return null;
  return {
    enablePortals: true, portalCount: 1,
    portalKinds: [{ portalId: 0, kind: 'blackHole', toMode: 'nexus', theme: true, themeUseMap: true, themeMap: 5 }],
    portalBotOdds: [{ portalId: 0, odds: 80, highLevel: 45, oddsHigh: 88, dreadShare: 15 }],
    portalTimings: [{ portalId: 0, timed: true, appearDuration: NEXUS_POINT.OPEN_MS, disappearDuration: NEXUS_POINT.AWAY_MS, initialDelay: NEXUS_POINT.FIRST_MS }],
  };
}
