import React, { useCallback, useState, useSyncExternalStore } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import type { HistoryKind, HistoryRow } from '../../game/designHistory';
import { Group, headerIcon } from '../kit/kit';
import { VirtualList } from '../kit/VirtualList';
import { HdHistory, Flag, Plus, Trash2, SlidersHorizontal, FolderOpen, Layers, Folder, Box, Pencil, UndoStep } from '../ui/icons';
import type { AppIcon } from '../ui/icons';
import { openContextMenu } from '../shell/ContextMenu';
import { flushDesignHistory } from '../shell/historyRecorder';

export function useDesignHistory(logic: GameLogic): { rows: readonly HistoryRow[]; canUndo: boolean; trimmed: boolean } {
  const h = logic.designHistory;
  const sub = useCallback((fn: () => void) => h.subscribe(fn), [h]);
  const get = useCallback(() => h.version, [h]);
  useSyncExternalStore(sub, get, get);
  return { rows: h.rows(), canUndo: h.canUndo(), trimmed: h.trimmed };
}

const KIND_ICON: Record<HistoryKind, AppIcon> = {
  start: Flag, add: Plus, remove: Trash2, edit: SlidersHorizontal, load: FolderOpen, layer: Layers, group: Folder, body: Box, name: Pencil,
};
const ROW_H = 30;
const ROW_H_DETAIL = 42;

function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const HistoryGroup: React.FC<{ logic: GameLogic }> = ({ logic }) => {
  const { rows, trimmed } = useDesignHistory(logic);
  const [hover, setHover] = useState(-1);
  const last = rows.length - 1;
  const goTo = (row: HistoryRow, i: number) => {
    if (i === last) return;
    flushDesignHistory();
    logic.rewindDesignTo(row.id);
    setHover(-1);
  };
  const rowH = useCallback((i: number) => (rows[last - i]?.detail ? ROW_H_DETAIL : ROW_H), [rows, last]);
  const renderRow = (i: number) => {
    i = last - i;
    const r = rows[i];
    const Icon = KIND_ICON[r.kind] ?? SlidersHorizontal;
    const now = i === last;
    const goes = hover >= 0 && i > hover;
    return (
      <div role="button" tabIndex={0} aria-current={now ? 'step' : undefined}
        className={`k-hist-row${now ? ' k-hist-now' : ''}${goes ? ' k-hist-goes' : ''}`}
        data-tip={now ? 'The tank as it is now' : 'Go back to here. The steps after it are removed for good.'}
        onMouseEnter={() => setHover(now ? -1 : i)} onMouseLeave={() => setHover(-1)}
        onClick={() => goTo(r, i)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(r, i); } }}
        onContextMenu={e => openContextMenu(e, now ? [] : [{ label: 'Go Back to Here', icon: UndoStep, onSelect: () => goTo(r, i) }])}>
        <span className="k-hist-icon"><Icon size={13} /></span>
        <span className="k-hist-text">
          <span className="k-hist-label k-fade">{r.label}</span>
          {r.detail && <span className="k-hist-detail k-fade">{r.detail}</span>}
        </span>
        <span className="k-hist-time">{clock(r.at)}</span>
      </div>
    );
  };
  return (
    <Group title="History" icon={headerIcon(HdHistory)} collapsible defaultOpen={false} count={rows.length > 1 ? rows.length - 1 : undefined}>
      {trimmed && <p className="k-row-desc">The oldest steps were let go to keep the editor light.</p>}
      <VirtualList count={rows.length} rowHeight={rowH} maxRows={9}
        rowKey={i => String(rows[last - i].id)} renderRow={renderRow} className="k-hist" />
    </Group>
  );
};
