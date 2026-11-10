import { GameLogic } from '../../game/GameLogic';
import { INITIAL_GAME_STATE } from '../../types';
import type { EnemyTank, LibraryItem, TankConfig } from '../../types';
import { PLAY_MODE_ENTRIES, getPlayEntry, resolvePlayConfig, cardMapKeyOf } from '../../game/gameModeRegistry';
import { MF_EDITOR } from '../../game/mapEvents/gameHost';
import { picDataOf, ENT_TEAM_BASE, type ModePicEntry, type ModePicFile } from './mapPicData';
import { MAP_LIB_BUILD_SEED } from './mapCatalog';

export function modeCardMapKeys(): string[] {
  const out: string[] = [];
  for (const e of PLAY_MODE_ENTRIES) { const k = cardMapKeyOf(e.key); if (!out.includes(k) && getPlayEntry(k)) out.push(k); }
  return out;
}

const DESIGN_SKIP = new Set(['projectileType', 'projectileBehaviors', 'subTurretProjectile', 'description', 'statNames', 'skillCaps', 'preDefinedSkills']);
function designOf(t: TankConfig): string { return JSON.stringify(t, (k, v) => (DESIGN_SKIP.has(k) ? undefined : v)); }

interface EngineDoors {
  _refreshBaseProtectors(): void; _refreshMapEntities(): void;
  enemyColorTeamIndex(e: EnemyTank): number; liveColorSlotOf(e: EnemyTank | null): number;
}

export function buildModeCardPictures(lib: readonly LibraryItem[], reseed: () => void): ModePicFile {
  const modes: ModePicEntry[] = [];
  const designs: unknown[] = [];
  const designAt = new Map<string, number>();
  for (const key of modeCardMapKeys()) {
    const entry = getPlayEntry(key);
    if (!entry) continue;
    reseed();
    const g = new GameLogic(JSON.parse(JSON.stringify(INITIAL_GAME_STATE)));
    g.resize(2560, 1440);
    g.updateState({ playerId: 'player-1', tankLibrary: lib as LibraryItem[] });
    g.applyGameMode(resolvePlayConfig(entry), true);
    const multi = g.state.multiAreaConfig.enableMultiArea && g.state.multiAreaConfig.areas.length > 1;
    if (!multi) g.updateState({ mapConfig: { ...g.state.mapConfig, seed: MAP_LIB_BUILD_SEED } });
    g.regenerateMap();
    g.isMapDesignerActive = true;
    const doors = g as unknown as EngineDoors;
    doors._refreshBaseProtectors();
    doors._refreshMapEntities();
    const ms = g.areaStates.length > 0 ? g.areaStates[0] : g.mapState;
    if (!ms) continue;
    const b0 = g.areaStates.length > 0 ? g.areaBounds[0] : null;
    const offX = b0 ? b0.centerX : 0, offY = b0 ? b0.centerY : 0;
    const cfg = b0 ? g.state.multiAreaConfig.areas[0].mapConfig : g.state.mapConfig;
    const pic = picDataOf(ms, cfg, offX, offY);
    const ents: number[] = [];
    for (const e of g.state.enemyTanks) {
      if (!e.active || e.isDying || !(e.isBaseProtector || (e._mevF & MF_EDITOR) !== 0)) continue;
      if (b0 && e.areaId !== b0.id) continue;
      const tc = g.state.enemyConfigs.find(c => c.id === e.configId)?.tankConfig;
      if (!tc) continue;
      const text = designOf(tc);
      let t = designAt.get(text);
      if (t === undefined) { t = designs.length; designs.push(JSON.parse(text)); designAt.set(text, t); }
      const slot = doors.liveColorSlotOf(e);
      const team = slot >= 0 ? -1 : doors.enemyColorTeamIndex(e);
      ents.push(Math.round((e.position.x - offX) * 10) / 10, Math.round((e.position.y - offY) * 10) / 10, Math.round(e.size * 10) / 10,
        Math.round(e.angle * 1000) / 1000, slot >= 0 ? slot : team >= 0 ? ENT_TEAM_BASE + team : -1, t);
    }
    const out: ModePicEntry = { key, seedUsed: ms.seedUsed, ...pic };
    if (ents.length > 0) out.ents = ents;
    modes.push(out);
  }
  return { format: 1, seed: MAP_LIB_BUILD_SEED, modes, designs };
}
