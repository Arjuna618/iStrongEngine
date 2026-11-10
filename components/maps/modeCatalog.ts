import { PLAY_MODE_ENTRIES, type PlayModeEntry } from '../../game/gameModeRegistry';
import { buildPresetWorld } from '../../game/mapEvents/presets/index';
import { createDefaultMapConfig } from '../../types';
import type { GameModeFile, LibraryItem, MapConfig } from '../../types';
import { aspectOfConfig, cardAreaLayout, MAP_LIB_BUILD_SEED, type MapCard } from './mapCatalog';
import { writeWorldMap, worldWritesMap, type WorldId } from '../../game/modeWorlds';
import { buildPortalWorld, type PortalModeId } from '../../game/portalModes';

export function modeCardEntries(): readonly PlayModeEntry[] {
  return PLAY_MODE_ENTRIES.filter(e => (e.preset || e.world) && !e.growth && !e.armsRace && !e.key.startsWith('arms-'));
}

const _kept = new Map<string, MapConfig | null>();
export function modeCardConfig(preset: string): MapConfig | null {
  let c = _kept.get(preset);
  if (c === undefined) {
    const w = buildPresetWorld(preset);
    c = w ? ({ ...createDefaultMapConfig(), ...w.map, mapAreas: w.mapAreas, events: w.events, seed: MAP_LIB_BUILD_SEED } as MapConfig) : null;
    _kept.set(preset, c);
  }
  return c;
}

export function worldCardConfig(world: WorldId): MapConfig {
  let c = _kept.get('world:' + world);
  if (!c) {
    if (world === 'portal-2tdm' || world === 'portal-4tdm' || world === 'portal-maze-4tdm') c = { ...buildPortalWorld(world as PortalModeId, 1, MAP_LIB_BUILD_SEED).areas[0].mapConfig, seed: MAP_LIB_BUILD_SEED };
    else {
      const m: MapConfig = { ...createDefaultMapConfig(), seed: MAP_LIB_BUILD_SEED };
      if (worldWritesMap(world)) writeWorldMap(m, world, false, MODE_TEAMS[world] ?? 2);
      else { m.enableMaze = false; m.enableRocks = true; m.gridCells = 32; m.mapScale = 7; m.rockPattern = 'random'; m.rockDensity = 450; m.rockSizeVariation = 100; }
      c = m;
    }
    _kept.set('world:' + world, c);
  }
  return c;
}
const MODE_TEAMS: Partial<Record<WorldId, number>> = { '2tdm': 2, '4tdm': 4, 'maze-2tdm': 2, 'maze-4tdm': 4 };
export function entryCardConfig(e: PlayModeEntry): MapConfig | null {
  return e.preset ? modeCardConfig(e.preset) : e.world ? worldCardConfig(e.world) : null;
}

function aspectOfModeFile(item: LibraryItem): number {
  try {
    const f = item.fileData.data as unknown as GameModeFile;
    if (f.areas && f.areas.areas.length >= 2) {
      const L = cardAreaLayout(f.areas);
      const h = L.maxY - L.minY;
      return h > 0 ? (L.maxX - L.minX) / h : 1;
    }
    return aspectOfConfig(f.map);
  } catch { return 1; }
}

export function modeCards(library: readonly LibraryItem[]): MapCard[] {
  const out: MapCard[] = [];
  for (const e of modeCardEntries()) {
    const cfg = entryCardConfig(e);
    if (cfg) out.push({ key: 'mode:' + e.key, kind: 'mode', name: e.title, aspect: aspectOfConfig(cfg), type: -1, item: null, lower: e.title.toLowerCase(), modeKey: e.key });
  }
  for (const it of library) if (it.fileData?.type === 'GameMode') out.push({ key: 'modefile:' + it.id, kind: 'mode', name: it.name || 'Game Mode', aspect: aspectOfModeFile(it), type: -1, item: it, lower: (it.name || 'game mode').toLowerCase() });
  return out;
}

