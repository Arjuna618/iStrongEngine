import type { GameLogic } from '../../game/GameLogic';
import type { ExportFile } from '../../types';

export function gameModeExportFile(logic: GameLogic, name: string): ExportFile {
  return { version: '1', type: 'GameMode', name, timestamp: Date.now(), data: logic.gameModeFileData() as unknown as ExportFile['data'] };
}
