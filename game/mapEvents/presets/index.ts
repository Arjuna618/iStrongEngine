import type { MapEventsDoc, ZoneLike } from '../doc';
import { buildSiegeWorld, SIEGE_MAPS } from './siege';
import { buildHalloweenWorld } from './halloween';
import type { SiegeMapId } from './siege';
import { shippedOverlayWorld } from './overlays';
import { SMALL_FIX } from '../../smallFixSwitch';

export interface PresetWorld {
  map: { name: string; mazeType: number; gridCells: number; mapScale: number; enableMaze: boolean; enableRocks: boolean; enablePortals: boolean; enableSpawnAreas: boolean; bossesCanGrow: boolean; [more: string]: unknown };
  mapAreas: { nextId: number; zones: ZoneLike[] };
  events: MapEventsDoc;
}

const siegeMapOf = (preset: string): SiegeMapId | null => {
  const m = preset.startsWith('siege-') ? preset.slice(6) : '';
  return Object.prototype.hasOwnProperty.call(SIEGE_MAPS, m) ? m as SiegeMapId : null;
};

export function buildPresetWorld(preset: string | undefined, mode?: { world?: string; teams?: number }): PresetWorld | null {
  if (!preset) return null;
  if (preset === 'halloween') return buildHalloweenWorld() as unknown as PresetWorld;
  const siege = siegeMapOf(preset);
  if (siege) return buildSiegeWorld(siege);
  if (SMALL_FIX.G732 !== 0 && mode && mode.world) {
    const word = preset.startsWith('domination-') ? 'domination' : preset.startsWith('assault-') ? 'assault' : preset;
    const w = shippedOverlayWorld(word, mode.world, mode.teams);
    return w ? (w as unknown as PresetWorld) : null;
  }
  return null;
}

const _shipped = new Map<string, PresetWorld | null>();
export function shippedFormOf(doc: MapEventsDoc | undefined, list: 'rules' | 'types' | 'plans', id: number, mode?: { world?: string; teams?: number }): unknown {
  const word = doc?.meta?.shipped;
  if (!word) return undefined;
  const key = SMALL_FIX.G732 !== 0 && mode ? word + '|' + (mode.world ?? '') + '|' + (mode.teams ?? '') : word;
  let w = _shipped.get(key);
  if (w === undefined) { w = buildPresetWorld(word, mode); _shipped.set(key, w); }
  const was = (w?.events[list] as { id: number }[] | undefined)?.find(x => x.id === id);
  const now = (doc[list] as { id: number }[] | undefined)?.find(x => x.id === id);
  return was && JSON.stringify(was) !== JSON.stringify(now) ? was : undefined;
}

export function presetTitle(preset: string | undefined): string | undefined {
  if (!preset) return undefined;
  if (preset === 'halloween') return 'Halloween';
  const siege = siegeMapOf(preset);
  return siege ? `Siege ${SIEGE_MAPS[siege].title}` : undefined;
}
