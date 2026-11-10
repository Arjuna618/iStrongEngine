import React, { useState, useMemo } from 'react';
import type { AIBehaviorCategory, AICategorySettings, LibraryItem } from '../types';
import type { GameLogic } from '../game/GameLogic';
import { ContentLibrary } from './library/ContentLibrary';
import { pickManyMode } from './library/libraryPickTanks';
import { AICategorySettingsPanel } from './AICategorySettingsPanel';

interface Props {
  category: AIBehaviorCategory;
  library: LibraryItem[];
  allCategories: AIBehaviorCategory[];
  logic: GameLogic;
  onConfirm: (next: { tankNames: string[]; settings: AICategorySettings }) => void;
  onClose: () => void;
}

const draftOf = (s: AICategorySettings): AICategorySettings => ({
  ...s, customUpgradeLogic: { ...s.customUpgradeLogic, priorities: { ...s.customUpgradeLogic.priorities } },
});

export const AIBehaviorCategoryTanksPopup: React.FC<Props> = ({ category, allCategories, logic, onConfirm, onClose }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(category.tankNames));
  const [settings, setSettings] = useState<AICategorySettings>(() => draftOf(category.settings));

  const disabledByMap = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < allCategories.length; i++) {
      const c = allCategories[i];
      if (c.id === category.id) continue;
      for (let j = 0; j < c.tankNames.length; j++) {
        const t = c.tankNames[j];
        if (!map.has(t)) map.set(t, c.name);
      }
    }
    return map;
  }, [allCategories, category.id]);

  const mode = useMemo(() => ({
    ...pickManyMode({
      place: 'aiCategory', title: `Edit ${category.name}`,
      chosenTitle: `In ${category.name}`,
      subtitle: 'Double click a tank to add or remove it. The category\'s settings are on the right.',
      selected,
      toggle: (name) => setSelected(prev => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; }),
      onConfirm: () => onConfirm({ tankNames: Array.from(selected), settings }),
      onReturn: onClose,
      lockOf: (name) => { const owner = disabledByMap.get(name); return owner ? `Already in "${owner}". Remove it from there first to add it here.` : null; },
    }),
    settingsPanel: { title: 'Category Settings', content: <AICategorySettingsPanel value={settings} onChange={setSettings} /> },
  }), [category.name, selected, settings, onConfirm, onClose, disabledByMap]);

  return <ContentLibrary logic={logic} mode={mode} onClose={onClose} />;
};
