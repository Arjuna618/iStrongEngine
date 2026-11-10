import { findByShownNameOrFileKey, pickWordOf } from '../game/tankByName';
import { SMALL_FIX } from '../game/smallFixSwitch';
import React, { useState, useMemo } from 'react';
import type { LibraryItem } from '../types';
import type { GameLogic } from '../game/GameLogic';
import { ContentLibrary } from './library/ContentLibrary';
import { pickManyMode } from './library/libraryPickTanks';
import { KIND_GROUPS, collectionOfItem } from './library/catalog';

interface Props {
  groupName: string;
  selectedTanks: string[];
  library: LibraryItem[];
  logic: GameLogic;
  onConfirm: (tankNames: string[]) => void;
  onClose: () => void;
}

const BOSS_GROUP_IDS = new Set(KIND_GROUPS.tank.find(g => g.id === 'bossGroup')!.options.map(o => o.id));

export const BossTanksPopup: React.FC<Props> = ({ groupName, selectedTanks, library, logic, onConfirm, onClose }) => {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedTanks));

  const presetFilter = useMemo(() => {
    const first = selectedTanks[0];
    const hit = first ? findByShownNameOrFileKey(library, first, false) : undefined;
    const cat = (hit?.fileData?.category as string | undefined) ?? groupName;
    const col = hit ? collectionOfItem(hit)! : (cat === 'Celestials' ? 'celestials' : 'bosses');
    const picks: [string, string][] = [['collection', col]];
    if (col === 'bosses' && BOSS_GROUP_IDS.has(cat)) picks.push(['bossGroup', cat]);
    return { kind: 'tank' as const, picks };
  }, []);
  const pickedIds = useMemo(() => {
    if (SMALL_FIX.BH09 === 0) return null;
    const ids = new Set<string>();
    for (const w of selected) { const it = findByShownNameOrFileKey(library, w, false); if (it) ids.add(it.id); }
    return ids;
  }, [selected, library]);

  const mode = useMemo(() => pickManyMode({
    place: 'bosses', title: `Add Bosses to ${groupName}`,
    subtitle: 'Click a tank to add or remove it. Any tank can be a boss, in more than one group too.',
    selected,
    toggle: (name) => setSelected(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }),
    onConfirm: () => onConfirm(Array.from(selected)),
    onReturn: onClose,
    presetFilter,
    chosenTitle: `In ${groupName}`,
    wordOf: pickedIds ? (it) => pickWordOf(library, it, false) : undefined,
    isPicked: pickedIds ? (e) => !!e.item && pickedIds.has(e.item.id) : undefined,
  }), [groupName, selected, onConfirm, onClose, presetFilter, pickedIds, library]);

  return <ContentLibrary logic={logic} mode={mode} onClose={onClose} />;
};
