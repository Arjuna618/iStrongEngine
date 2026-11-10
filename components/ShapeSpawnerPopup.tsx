import React, { useCallback, useMemo, useState } from 'react';
import { Minus, Plus } from './ui/icons';
import { GameLogic } from '../game/GameLogic';
import { ContentLibrary } from './library/ContentLibrary';
import type { LibMode } from './library/libraryModes';
import type { LibEntry } from './library/catalog';
import { spawnerSpawn, spawnerTotals } from './library/spawnerSpawn';
import { RowLabel } from './kit/kit';
import { SwapInPlace, MotionRow } from './kit/Collapse';

interface Props {
  logic: GameLogic;
  onClose: () => void;
}

const COUNT_MAX = 999;

function formatXp(xp: number): string {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(xp % 1_000_000 === 0 ? 0 : 1)}M`;
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(xp % 1_000 === 0 ? 0 : 1)}K`;
  return String(xp);
}

const CountStepper: React.FC<{ value: number; onChange: (v: number) => void; big?: boolean }> = ({ value, onChange, big }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const caretToEnd = (el: HTMLInputElement) => { if (value === 0) { const n = el.value.length; el.setSelectionRange(n, n); } };
  return (
    <div className={`k-stepper${big ? ' k-stepper-big' : ''}${value > 0 ? ' k-stepper-on' : ''}`} onClick={stop} onDoubleClick={stop}>
      <button type="button" aria-label="One less" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))} className="k-stepper-btn">
        <Minus size={big ? 14 : 12} />
      </button>
      <input
        type="text" inputMode="numeric" aria-label="How many" value={String(value)}
        onChange={(e) => onChange(Math.max(0, Math.min(COUNT_MAX, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)))}
        onFocus={(e) => caretToEnd(e.currentTarget)} onMouseUp={(e) => caretToEnd(e.currentTarget)}
        className="k-stepper-input"
      />
      <button type="button" aria-label="One more" disabled={value >= COUNT_MAX} onClick={() => onChange(Math.min(COUNT_MAX, value + 1))} className="k-stepper-btn">
        <Plus size={big ? 14 : 12} />
      </button>
    </div>
  );
};

export const ShapeSpawnerPopup: React.FC<Props> = ({ logic, onClose }) => {
  const [counts, setCounts] = useState<Map<string, number>>(() => new Map());
  const setCount = useCallback((key: string, v: number) => {
    setCounts(prev => {
      const next = new Map(prev);
      if (v > 0) next.set(key, v); else next.delete(key);
      return next;
    });
  }, []);

  const _shapeBudget = logic.playerAreaShapeBudget();
  const foodCount = _shapeBudget.food;
  const crasherCount = _shapeBudget.crashers;
  const sentryCount = logic.countActiveSentries();
  const sentinelCount = logic.countActiveSentinels();
  const sentryCap = logic.sentryBudget('sentry');
  const sentinelCap = logic.sentryBudget('sentinel');

  const [entryOf] = useState(() => new Map<string, LibEntry>());

  const totals = useMemo(() => spawnerTotals(logic, counts, k => entryOf.get(k)), [logic, counts, entryOf]);
  const effectiveTotal = totals.effective;
  const totalSelected = totals.total;

  const handleSpawn = (close: () => void) => {
    if (effectiveTotal <= 0) return;
    const sentries = [...entryOf.values()].filter(e => e.kind === 'sentry').sort((a, b) => a.order - b.order);
    spawnerSpawn(logic, counts, k => entryOf.get(k), sentries);
    close();
  };

  const cap = (label: string, n: number, max: number) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[12px] text-[var(--text-tertiary)]">{label}</span>
      <span className={`text-[12px] [font-weight:var(--fw-control)] tabular-nums ${n >= max ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{n}/{max}</span>
    </div>
  );

  const caps = (
    <>
      {cap('Food', foodCount, _shapeBudget.foodCap)}
      <span className="w-px h-4 bg-[var(--alpha-divider)]" />
      {cap('Crashers', crasherCount, _shapeBudget.crasherCap)}
      <span className="w-px h-4 bg-[var(--alpha-divider)]" />
      {cap('Sentries', sentryCount, sentryCap)}
      <span className="w-px h-4 bg-[var(--alpha-divider)]" />
      {cap('Sentinels', sentinelCount, sentinelCap)}
    </>
  );

  const statsOf = (e: LibEntry): [string, string] | null => {
    if (e.kind === 'shape' && e.shape) {
      const ps = logic.shapeSpawnPreviewStats(e.shape);
      return [String(Math.round(ps.hp)), formatXp(ps.xpValue)];
    }
    if (e.kind === 'sentry' && e.sentry) return [String(e.sentry.hp), formatXp(e.sentry.xp)];
    return null;
  };

  const mode: LibMode = {
    place: 'spawner', title: 'Shape Spawner',
    subtitle: 'Choose how many of each, then Spawn. They appear on free spots near your tank.',
    kinds: ['shape', 'sentry'],
    isChosen: (e) => (counts.get(e.key) ?? 0) > 0,
    chosenSection: { title: 'To Spawn' },
    actionsOf: (e) => [{ id: 'more', label: 'Add One', run: () => { entryOf.set(e.key, e); setCount(e.key, Math.min(COUNT_MAX, (counts.get(e.key) ?? 0) + 1)); return false; } }],
    extraH: 62,
    renderExtra: (e) => {
      const v = counts.get(e.key) ?? 0;
      const st = statsOf(e);
      return (
        <div className="mt-2">
          <div className="flex items-center gap-1 h-5 tabular-nums k-fade">
            {st && <><span className="k-badge">HP {st[0]}</span><span className="k-badge">XP {st[1]}</span></>}
          </div>
          <div className="mt-1.5"><CountStepper value={v} onChange={(n) => { entryOf.set(e.key, e); setCount(e.key, n); }} /></div>
        </div>
      );
    },
    renderPanelExtra: (e) => (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--alpha-card-border)] bg-[var(--layer-2)] shadow-[var(--k-card-shadow)] px-4 py-2.5">
        <RowLabel label="How many" help="How many of this shape the Spawn button places." />
        <CountStepper big value={counts.get(e.key) ?? 0} onChange={(n) => { entryOf.set(e.key, e); setCount(e.key, n); }} />
      </div>
    ),
    status: caps,
    footer: (close, compact) => (
      <MotionRow className="flex items-center gap-4 px-5 py-3">
        <MotionRow.Item key="caps" grow><div className="flex flex-wrap items-center gap-x-4 gap-y-1 mr-auto">
          {compact ? null : caps}
        </div></MotionRow.Item>
        <MotionRow.Item key="sum"><div className="text-[12px] text-[var(--text-tertiary)] tabular-nums">
          <SwapInPlace swapKey={effectiveTotal > 0 ? `${effectiveTotal}/${totalSelected}` : 'none'} hold={false} className="k-swap-text">
          {effectiveTotal > 0 ? (
            <><span className="font-medium text-[var(--text-primary)]">{effectiveTotal}</span>{effectiveTotal < totalSelected && <span className="text-[var(--text-quaternary)]"> / {totalSelected}</span>} to spawn</>
          ) : 'Nothing chosen yet'}
          </SwapInPlace>
        </div></MotionRow.Item>
        {counts.size > 0 && <MotionRow.Item key="clear"><button type="button" onClick={() => setCounts(new Map())} className="k-btn k-btn-ghost k-btn-md">Clear</button></MotionRow.Item>}
        <MotionRow.Item key="return"><button type="button" onClick={() => close()} className="k-btn k-btn-secondary k-btn-lg">Return</button></MotionRow.Item>
        <MotionRow.Item key="spawn"><button type="button" onClick={() => handleSpawn(close)} disabled={effectiveTotal <= 0} className="k-btn k-btn-primary k-btn-lg min-w-[112px]">
          Spawn
        </button></MotionRow.Item>
      </MotionRow>
    ),
  };

  return <ContentLibrary logic={logic} mode={mode} onClose={onClose} />;
};
