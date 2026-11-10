import React, { useMemo, useState } from 'react';
import type { GameLogic } from '../game/GameLogic';
import type { GameModeConfig, LibraryItem } from '../types';
import type { MapPool, MapPoolRow } from '../game/modeWorlds';
import { Group, ToggleRow, Button, IconButton, headerIcon } from './kit/kit';
import { Reveal, MotionList, SwapText } from './kit/Collapse';
import { NumberBox } from './kit/NumberBox';
import { HdGame, X } from './ui/icons';
import { toast } from './ui/Toast';
import { sameProjectUndo } from './shared/sameProjectUndo';
import { SMALL_FIX } from '../game/smallFixSwitch';
import { MazeTypeName } from './maps/mazeTypeName';
import { MapLibrarySlot } from './maps/MapLibraryWindow';
import { useOpenFlag } from './library/LibraryWindowSlot';
import { ROCK_PATTERN_NAMES } from './maps/rockCatalog';
import { mapPoolShares } from '../game/mapPool';

const SHARE_MAX = 1000;

const RowOf: React.FC<{ row: MapPoolRow; percent: number; missing: boolean; onShare: (v: number) => void; onRemove: () => void }> = ({ row, percent, missing, onShare, onRemove }) => (
  <div className="k-row">
    <span className="k-row-text min-w-0 flex-1" data-tip={missing ? 'This saved map is gone from your library. A match skips it.' : row.kind === 'file' ? 'A saved map: always this map. A change to the file reaches this list.' : 'A new layout every match.'}>
      <span className="k-row-label truncate block">{row.name}</span>
      {missing ? <span className="k-row-desc block">Missing</span> : null}
    </span>
    <NumberBox className="k-field k-ev-num" value={row.share} min={0} max={SHARE_MAX} aria-label="Share" title="This map's share of the total" onChange={e => { const n = Number(e.target.value); onShare(Number.isFinite(n) ? Math.max(0, Math.min(SHARE_MAX, n)) : 0); }} />
    <span className="k-play-tag tabular-nums"><SwapText>{`${percent} %`}</SwapText></span>
    <IconButton aria-label={`Remove ${row.name}`} title="Remove" onClick={onRemove}><X size={14} /></IconButton>
  </div>
);

export const RandomMapCard: React.FC<{ logic: GameLogic; config: GameModeConfig; onChange: (pool: MapPool | undefined) => void }> = ({ logic, config, onChange }) => {
  const pool: MapPool = config.mapPool ?? { on: false, rows: [] };
  const flag = useOpenFlag(), rockFlag = useOpenFlag();
  const [, again] = useState(0);
  const library = logic.state.tankLibrary as LibraryItem[];
  const mapLibrary = useMemo(() => (library || []).filter(it => it.fileData && (it.fileData.type === 'Map' || it.fileData.type === 'MultiAreaMap')), [library]);
  const has = (id: string | undefined) => !!id && mapLibrary.some(it => it.id === id);
  const shares = mapPoolShares(pool.rows, r => r.kind !== 'file' || has(r.file));
  const setRows = (rows: MapPoolRow[]) => onChange({ ...pool, rows });
  const add = (r: Omit<MapPoolRow, 'id' | 'share'>) => {
    const id = pool.rows.reduce((a, x) => Math.max(a, x.id), 0) + 1;
    setRows([...pool.rows, { ...r, id, share: pool.rows.length > 0 ? Math.round(pool.rows.reduce((a, x) => a + x.share, 0) / pool.rows.length) || 1 : 50 }]);
    flag.set(false);
    again(n => n + 1);
  };
  const remove = (r: MapPoolRow) => {
    const at = pool.rows.indexOf(r);
    setRows(pool.rows.filter(x => x !== r));
    const back = () => { const now = logic.state.gameModeConfig.mapPool ?? pool; const rows = now.rows.slice(); rows.splice(at, 0, r); onChange({ ...now, rows }); };
    toast('success', `Removed "${r.name}" from the list.`, { label: 'Undo', run: SMALL_FIX.R908 !== 0 ? sameProjectUndo(logic, toast, back) : back });
  };
  return (
    <Group title="Random Map" icon={headerIcon(HdGame)}>
      <ToggleRow label="Random Map" help="Each match starts on one map of this list, picked by the shares. A maze type or a rock pattern gives a new layout every match; a saved map, single or multi area, is always that map. Your map in the editor stays yours."
        checked={pool.on} onChange={v => onChange({ ...pool, on: v })} />
      <Reveal when={pool.on}>
        <div className="k-stack">
          <MotionList gap={8} empty={<p className="k-hint">No maps yet: a match plays your map in the editor.</p>}>
            {pool.rows.map(r => <RowOf key={r.id} row={r} percent={shares.get(r.id) ?? 0} missing={r.kind === 'file' && !has(r.file)}
              onShare={v => setRows(pool.rows.map(x => (x === r ? { ...x, share: v } : x)))} onRemove={() => remove(r)} />)}
          </MotionList>
          <Button size="sm" variant="secondary" block onClick={() => flag.set(true)} title="Pick a maze type, a rock pattern or a saved map from the Map Library">Add Map</Button>
        </div>
      </Reveal>
      <MapLibrarySlot flag={flag} rockFlag={rockFlag} logic={logic} config={logic.state.mapConfig} library={mapLibrary} pickOnly
        onLoadMaze={type => add({ kind: 'maze', maze: type, name: MazeTypeName(type) })}
        onPickRock={pattern => add({ kind: 'rock', rock: pattern, name: ROCK_PATTERN_NAMES[pattern] })}
        onLoadFile={item => add({ kind: 'file', file: item.id, name: item.name || 'Map' })}
        onLoadCustom={() => {}} onLoadMode={() => {}} onSaveFile={() => {}} onRemove={() => {}} onImport={() => {}} onSaveCurrent={() => {}} />
    </Group>
  );
};
