import React from 'react';
import type { LibEntry } from './catalog';
import type { LibraryItem } from '../../types';
import type { LibMode } from './libraryModes';
import { SwapText } from '../kit/Collapse';

export function tankInNames(e: LibEntry, names: ReadonlySet<string>): boolean {
  if (e.kind !== 'tank' || !e.item) return false;
  if (names.has(e.item.name)) return true;
  const m = e.item.id.match(/\/([^/]+)\.json$/);
  return m ? names.has(m[1]) : false;
}

export interface PickManyOptions {
  place: string;
  title: string;
  subtitle: string;
  selected: ReadonlySet<string>;
  toggle: (name: string) => void;
  onConfirm: () => void;
  onReturn: () => void;
  lockOf?: (name: string) => string | null;
  presetFilter?: LibMode['presetFilter'];
  chosenTitle?: string;
  wordOf?: (item: LibraryItem) => string;
  isPicked?: (e: LibEntry) => boolean;
}

export function pickManyMode(o: PickManyOptions): LibMode {
  let order: Map<string, number> | null = null;
  const rank = (e: LibEntry): number => {
    if (!order) { order = new Map(); let i = 0; for (const n of o.selected) order.set(n, i++); }
    if (!e.item) return Infinity;
    if (o.wordOf) { const byWord = order.get(o.wordOf(e.item)); if (byWord !== undefined) return byWord; }
    const byName = order.get(e.item.name);
    if (byName !== undefined) return byName;
    const m = e.item.id.match(/\/([^/]+)\.json$/);
    const byKey = m ? order.get(m[1]) : undefined;
    return byKey !== undefined ? byKey : Infinity;
  };
  return {
    place: o.place, title: o.title, subtitle: o.subtitle, kinds: ['tank'], presetFilter: o.presetFilter,
    isChosen: (e) => o.isPicked ? o.isPicked(e) : tankInNames(e, o.selected),
    chosenSection: o.chosenTitle ? { title: o.chosenTitle, rank } : undefined,
    lockOf: o.lockOf ? (e) => (e.item ? o.lockOf!(e.item.name) : null) : undefined,
    actionsOf: (e) => {
      if (!e.item) return [];
      const on = o.isPicked ? o.isPicked(e) : tankInNames(e, o.selected);
      return [{ id: 'toggle', label: on ? 'Remove' : 'Add', run: () => { o.toggle(o.wordOf ? o.wordOf(e.item!) : e.item!.name); return false; } }];
    },
    footer: (close) => (
      <div className="flex items-center gap-3 px-5 py-3">
        <span className="text-[12px] text-[var(--text-tertiary)] mr-auto tabular-nums"><SwapText>{`${o.selected.size} selected`}</SwapText></span>
        <button type="button" onClick={() => close(o.onReturn)} className="k-btn k-btn-secondary k-btn-lg">Return</button>
        <button type="button" onClick={() => close(o.onConfirm)} className="k-btn k-btn-primary k-btn-lg min-w-[112px]">Confirm</button>
      </div>
    ),
  };
}
