import React, { useState, useMemo } from 'react';
import { useEscapeOwner } from './shared/escapeStack';
import { Plus, SlidersHorizontal, Trash2, Bot, Pencil, HdBrainCircuit } from './ui/icons';
import { openContextMenu } from './shell/ContextMenu';
import { VirtualList } from './kit/VirtualList';

const AICAT_ROW_H = 58;
const AICAT_ROWS = 7;
import { v4 as uuidv4 } from 'uuid';
import type { GameLogic } from '../game/GameLogic';
import type { AIBehaviorCategory, AICategorySettings, LibraryItem } from '../types';
import { createDefaultAICategorySettings } from '../types';
import { Group, IconButton, EmptyState, headerIcon, emptyArt } from './kit/kit';
import { ConfirmDialog } from './kit/Modal';
import { MotionList } from './kit/Collapse';
import { AIBehaviorCategoryTanksPopup } from './AIBehaviorCategoryTanksPopup';

interface Props {
  logic: GameLogic;
}

export const AIBehaviorCategoriesSection: React.FC<Props> = ({ logic }) => {
  const [open, setOpen] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState<string>('');

  useEscapeOwner(() => setEditingNameId(null), open && editingNameId !== null);
  const [editing, setEditing] = useState<AIBehaviorCategory | null>(null);
  const [deleting, setDeleting] = useState<AIBehaviorCategory | null>(null);

  const version = logic.state.aiBehaviorCategoriesVersion;
  const categories = logic.state.aiBehaviorCategories.categories;
  const library = logic.state.tankLibrary || [];

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.createdAt - b.createdAt),
    [version]
  );

  const focusOnce = React.useCallback((el: HTMLInputElement | null) => { if (el && document.activeElement !== el) el.focus({ preventScroll: true }); }, []);

  const handleAddCategory = () => {
    const newCategory: AIBehaviorCategory = {
      id: uuidv4(),
      name: 'New Category',
      tankNames: [],
      settings: createDefaultAICategorySettings(),
      createdAt: Date.now(),
    };
    logic.addAIBehaviorCategory(newCategory);
    setOpen(true);
    setEditingNameId(newCategory.id);
    setDraftName(newCategory.name);
  };

  const handleStartRename = (cat: AIBehaviorCategory) => {
    setEditingNameId(cat.id);
    setDraftName(cat.name);
  };

  const handleCommitRename = (id: string) => {
    const trimmed = draftName.trim();
    if (trimmed.length > 0) logic.updateAIBehaviorCategory(id, { name: trimmed });
    setEditingNameId(null);
  };

  const handleDeleteCategory = (cat: AIBehaviorCategory) => {
    setDeleting(cat);
  };

  const handleEditSave = (next: { tankNames: string[]; settings: AICategorySettings }) => {
    if (editing) {
      logic.updateAIBehaviorCategory(editing.id, { tankNames: next.tankNames, settings: next.settings });
      setEditing(null);
    }
  };

  return (
    <>
      <Group title="AI Behavior Categories" icon={headerIcon(HdBrainCircuit)} collapsible open={open} onToggle={setOpen}
        right={<IconButton size="sm" label="Add new category" onClick={handleAddCategory}><Plus size={14} /></IconButton>}>
          <VirtualList count={sortedCategories.length} rowHeight={AICAT_ROW_H} maxRows={AICAT_ROWS} revealNew
            rowKey={i => sortedCategories[i].id}
            empty={
            <EmptyState icon={emptyArt(Bot)} title="No categories yet"
              hint={'Click + to define a behavior category. Assign tanks to it; their AI will use the category\'s settings on every spawn.'} />
          }
            renderRow={i => {
              const cat = sortedCategories[i];
              const isEditing = editingNameId === cat.id;
              return (
                <div className="k-group k-l3 k-vl-cat flex items-center gap-1 pl-1.5 pr-1 py-1.5"
                  onContextMenu={e => {
                    if ((e.target as Element).tagName === 'INPUT') return;
                    openContextMenu(e, [
                      { label: 'Edit', icon: SlidersHorizontal, onSelect: () => setEditing(cat) },
                      { label: 'Rename', icon: Pencil, onSelect: () => handleStartRename(cat) },
                      'sep',
                      { label: 'Delete', icon: Trash2, onSelect: () => handleDeleteCategory(cat) },
                    ]);
                  }}>
                  {isEditing ? (
                    <input
                      type="text"
                      value={draftName}
                      onChange={e => setDraftName(e.target.value)}
                      onBlur={() => handleCommitRename(cat.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleCommitRename(cat.id); }
                      }}
                      onFocus={e => e.currentTarget.select()}
                      ref={focusOnce}
                      aria-label="Category name"
                      className="k-field flex-1 min-w-0"
                    />
                  ) : (
                    <button
                      onClick={() => handleStartRename(cat)}
                      className="k-rename flex-1 min-w-0"
                      title="Click to rename"
                    >
                      <span className="k-card-title k-fade block">{cat.name}</span>
                      <span className="k-row-desc block">{cat.tankNames.length} {cat.tankNames.length === 1 ? 'tank' : 'tanks'}</span>
                    </button>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <IconButton label="Edit category" size="sm" onClick={() => setEditing(cat)}><SlidersHorizontal size={14} /></IconButton>
                    <IconButton label="Delete category" size="sm" onClick={() => handleDeleteCategory(cat)}><Trash2 size={14} /></IconButton>
                  </div>
                </div>
              );
            }} />
      </Group>

      {deleting && (
        <ConfirmDialog title="Delete category" icon={<Trash2 size={18} />}
          message={`Delete category "${deleting.name}"? Assigned tanks will revert to default AI behavior.`}
          confirmLabel="Delete"
          onConfirm={() => { logic.removeAIBehaviorCategory(deleting.id); setDeleting(null); }}
          onClose={() => setDeleting(null)} />
      )}

      {editing && (
        <AIBehaviorCategoryTanksPopup
          category={editing}
          library={library as LibraryItem[]}
          allCategories={categories}
          logic={logic}
          onConfirm={handleEditSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};
