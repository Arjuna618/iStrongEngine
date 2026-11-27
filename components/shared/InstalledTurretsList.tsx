import React, { useEffect, useRef, useState } from 'react';
import { Trash2, HdDashboardSquareAdd, CornerDownRight, ChevronDown, Folder, FolderPlus, FolderMinus, Pencil, Tags, MousePointer2, Copy, SlidersHorizontal, MousePointerClick, Lock, EyeOff } from '../ui/icons';
import { Turret, TURRET_NAME_MAX, TURRET_TAG_MAX } from '../../types';
import type { TurretGroup } from '../../types';
import type { GameLogic } from '../../game/GameLogic';
import { PROJECTILE_LABELS } from './labels';
import { IconButton, EmptyState, emptyArt } from '../kit/kit';
import { SwapInPlace, SwapText } from '../kit/Collapse';
import { VirtualList, virtualRowAtPoint, scrollVirtualRowIntoView } from '../kit/VirtualList';
import { TagTitle, type TagItem } from '../kit/TagLine';
import { openContextMenu, openPromptAt, type MenuEntry } from '../shell/ContextMenu';
import { useEscapeOwner } from './escapeStack';
import { onNameWords } from '../../utils/pointOnText';

interface Props {
  turrets: Turret[];
  logic: GameLogic;
  scope: string;
  selectedTurretId: string | null;
  primaryTurretId: string | null;
  onSelect: (turret: Turret, index: number) => void;
  onRemove: (turretId: string) => void;
  onEditAutoTurret?: (turretId: string) => void;
  onMakePrimary?: (turretId: string) => void;
  onInheritInto?: (turretId: string) => void;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  inheritMode?: boolean;
  inheritTargetId?: string | null;
  onInheritFrom?: (turretId: string) => void;
  layerLabels?: Map<string, string>;
}

export const turretListMarks = new Map<string, string[]>();
const folded = new Set<string>();
const FOLDED_MAX = 512;
const foldGroup = (id: string) => {
  folded.delete(id);
  folded.add(id);
  if (folded.size > FOLDED_MAX) { const oldest = folded.values().next().value; if (oldest !== undefined) folded.delete(oldest); }
};

type Line =
  | { kind: 'group'; g: TurretGroup; members: number[] }
  | { kind: 'turret'; i: number; inGroup: boolean }
  | { kind: 'sub'; i: number; s: number; inGroup: boolean };

const H_GROUP = 34, H_TURRET = 48, H_SUB = 28;

function rowName(t: Turret): string {
  if (t.name) return t.name;
  if (t.look && t.look.name) return t.look.name;
  return t.turretType === 'auto' ? 'Auto Turret' : t.turretType === 'decorative' ? 'Decorative' : 'Standard Turret';
}
const lineH = (l: Line) => (l.kind === 'group' ? H_GROUP : l.kind === 'turret' ? H_TURRET : H_SUB);

export const NewGroupButton: React.FC<{ logic: GameLogic; scope: string; onDone?: () => void }> = ({ logic, scope, onDone }) => (
  <IconButton label="New Group" size="sm" onClick={(e) => {
    e.stopPropagation();
    const ids = turretListMarks.get(scope) ?? [];
    openPromptAt(e.currentTarget, {
      title: ids.length > 1 ? `New Group of ${ids.length} turrets` : 'New Group', placeholder: 'Group name', maxLength: TURRET_NAME_MAX, submit: 'Create',
      onSubmit: (name) => { logic.createTurretGroup(name, scope, ids.length > 1 ? ids : []); onDone?.(); },
    });
  }}><FolderPlus size={15} /></IconButton>
);

export const InlineName: React.FC<{ value: string; max: number; onDone: (v: string | null) => void }> = ({ value, max, onDone }) => {
  const [text, setText] = useState(value);
  const done = useRef(false);
  const finish = (v: string | null) => { if (done.current) return; done.current = true; onDone(v); };
  useEscapeOwner(() => finish(null), true);
  return (
    <input autoFocus className="k-field k-inline-name" value={text} maxLength={max} spellCheck={false}
      onFocus={e => e.currentTarget.select()} onChange={e => setText(e.target.value)}
      onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); finish(text); } }}
      onBlur={() => finish(text)} />
  );
};

export const InstalledTurretsList: React.FC<Props> = ({
  turrets, logic, scope, selectedTurretId, primaryTurretId, onSelect, onRemove, onEditAutoTurret, onMakePrimary, onInheritInto,
  emptyMessage = 'No Turrets', emptyIcon, inheritMode, inheritTargetId, onInheritFrom, layerLabels,
}) => {
  const marked: ReadonlySet<string> = new Set(selectedTurretId ? [selectedTurretId] : []);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [, setFoldTick] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => { turretListMarks.set(scope, selectedTurretId ? [selectedTurretId] : []); }, [selectedTurretId, scope]);
  useEffect(() => () => { turretListMarks.delete(scope); }, [scope]);

  const groups = logic.state.turretGroups;
  const flat = !!inheritMode || !!layerLabels;
  const lines = ((): Line[] => {
    const out: Line[] = [];
    const scoped: TurretGroup[] = flat ? [] : groups.filter(g => g.scope === scope);
    const byId = new Map<string, TurretGroup>(scoped.map(g => [g.id, g] as [string, TurretGroup]));
    const members = new Map<string, number[]>();
    turrets.forEach((t, i) => { if (!flat && t.groupId && byId.has(t.groupId)) { let m = members.get(t.groupId); if (!m) members.set(t.groupId, m = []); m.push(i); } });
    const shown = new Set<string>();
    const pushTurret = (i: number, inGroup: boolean) => {
      out.push({ kind: 'turret', i, inGroup });
      const t = turrets[i];
      if (t.turretType === 'auto' && t.autoSubTurrets && t.autoSubTurrets.length > 0 && onEditAutoTurret)
        for (let s = 0; s < t.autoSubTurrets.length; s++) out.push({ kind: 'sub', i, s, inGroup });
    };
    turrets.forEach((t, i) => {
      const g = !flat && t.groupId ? byId.get(t.groupId) : undefined;
      if (!g) { pushTurret(i, false); return; }
      if (shown.has(g.id)) return;
      shown.add(g.id);
      const m = members.get(g.id) ?? [];
      out.push({ kind: 'group', g, members: m });
      if (!folded.has(g.id)) for (const mi of m) pushTurret(mi, true);
    });
    for (const g of scoped) if (!shown.has(g.id)) out.push({ kind: 'group', g, members: [] });
    return out;
  })();

  const pickSeen = useRef<string | null>(selectedTurretId);
  const pickToShow = useRef<string | null>(selectedTurretId);
  if (selectedTurretId !== pickSeen.current) { pickSeen.current = selectedTurretId; pickToShow.current = selectedTurretId; }
  useEffect(() => {
    const id = pickToShow.current;
    if (!id) return;
    const pt = turrets.find(x => x.id === id);
    if (!pt) { pickToShow.current = null; return; }
    if (!flat && pt.groupId && folded.has(pt.groupId)) { folded.delete(pt.groupId); setFoldTick(x => x + 1); return; }
    pickToShow.current = null;
    let top = 0;
    for (let k = 0; k < lines.length; k++) {
      const l = lines[k];
      if (l.kind === 'turret' && turrets[l.i].id === id) { scrollVirtualRowIntoView(box.current, top, lineH(l)); return; }
      top += lineH(l);
    }
  });

  const turretLineIds = (from: number, to: number): string[] => {
    const a = Math.min(from, to), b = Math.max(from, to), ids: string[] = [];
    for (let k = a; k <= b; k++) { const l = lines[k]; if (l && l.kind === 'turret') ids.push(turrets[l.i].id); }
    return ids;
  };

  const groupMenu = (ids: string[]): MenuEntry => {
    const scoped = groups.filter(g => g.scope === scope);
    return {
      label: 'Add to Group', icon: Folder, items: [
        { label: 'New Group', icon: FolderPlus, prompt: { title: ids.length > 1 ? `New Group of ${ids.length} turrets` : 'New Group', placeholder: 'Group name', maxLength: TURRET_NAME_MAX, submit: 'Create', onSubmit: (n) => logic.createTurretGroup(n, scope, ids) } },
        ...(scoped.length ? ['sep' as const] : []),
        ...scoped.map(g => ({ label: g.name, icon: Folder, onSelect: () => logic.setTurretsGroup(ids, g.id) })),
      ],
    };
  };
  const turretMenu = (t: Turret, index: number, ids: string[]): MenuEntry[] => {
    const anyGrouped = ids.some(id => { const x = turrets.find(tt => tt.id === id); return !!x?.groupId; });
    if (ids.length > 1) {
      return [
        groupMenu(ids),
        ...(anyGrouped ? [{ label: 'Remove from Group', icon: FolderMinus, onSelect: () => logic.setTurretsGroup(ids, null) }] : []),
        'sep',
        { label: `Delete ${ids.length} Turrets`, icon: Trash2, hint: 'Del', onSelect: () => logic.removeTurrets(ids) },
      ];
    }
    return [
      { label: 'Edit', icon: SlidersHorizontal, disabled: t.id === selectedTurretId, onSelect: () => onSelect(t, index) },
      { label: 'Rename', icon: Pencil, onSelect: () => setRenaming(t.id) },
      t.tag
        ? { label: 'Edit Tag', icon: Tags, prompt: { title: 'Tag', placeholder: 'Up to 8 letters', initial: t.tag, maxLength: TURRET_TAG_MAX, submit: 'Save', onSubmit: (v) => logic.setTurretTag(t.id, v) } }
        : { label: 'Add Tag', icon: Tags, prompt: { title: 'Add Tag', placeholder: 'Up to 8 letters', maxLength: TURRET_TAG_MAX, submit: 'Add', onSubmit: (v) => logic.setTurretTag(t.id, v) } },
      ...(t.tag ? [{ label: 'Remove Tag', icon: Tags, onSelect: () => logic.setTurretTag(t.id, '') }] : []),
      'sep',
      groupMenu([t.id]),
      ...(t.groupId ? [{ label: 'Remove from Group', icon: FolderMinus, onSelect: () => logic.setTurretsGroup([t.id], null) }] : []),
      'sep',
      ...(onMakePrimary ? [{ label: 'Make Primary', icon: MousePointer2,
        disabled: primaryTurretId === t.id, onSelect: () => onMakePrimary(t.id) }] : []),
      ...(t.turretType === 'auto' && onEditAutoTurret ? [{ label: 'Edit Sub Turrets', icon: MousePointerClick, onSelect: () => onEditAutoTurret(t.id) }] : []),
      ...(onInheritInto ? [{ label: 'Inherit Settings', icon: Copy, onSelect: () => onInheritInto(t.id) }] : []),
      'sep',
      { label: logic.partLocks.has(t.id) ? 'Unlock on Canvas' : 'Lock on Canvas', icon: Lock, onSelect: () => logic.togglePartLock(t.id) },
      { label: logic.partHides.has(t.id) ? 'Unhide on Canvas' : 'Hide on Canvas', icon: EyeOff, onSelect: () => logic.togglePartHide(t.id) },
      'sep',
      { label: 'Delete', icon: Trash2, hint: 'Del', onSelect: () => onRemove(t.id) },
    ];
  };
  const headerMenu = (g: TurretGroup, n: number): MenuEntry[] => [
    { label: 'Rename', icon: Pencil, onSelect: () => setRenamingGroup(g.id) },
    { label: 'Ungroup', icon: FolderMinus, onSelect: () => logic.ungroupTurretGroup(g.id) },
    'sep',
    { label: n > 0 ? 'Delete Group and Its Turrets' : 'Delete Group', icon: Trash2, onSelect: () => logic.deleteTurretGroupWithTurrets(g.id) },
  ];

  const clickTurret = (_e: React.MouseEvent, t: Turret, index: number) => {
    if (inheritMode && onInheritFrom) { if (t.id !== inheritTargetId) onInheritFrom(t.id); return; }
    onSelect(t, index);
  };

  const renderLine = (k: number) => {
    const l = lines[k];
    if (l.kind === 'group') {
      const g = l.g, isFolded = folded.has(g.id);
      const allMarked = l.members.length > 0 && l.members.every(i => marked.has(turrets[i].id));
      return (
        <div className="k-tgroup" role="button" tabIndex={0}
          onClick={e => { if (onNameWords(e, '.k-tgroup-name')) return; if (folded.has(g.id)) folded.delete(g.id); else foldGroup(g.id); setFoldTick(x => x + 1); }}
          onDoubleClick={e => { if (onNameWords(e, '.k-tgroup-name')) setRenamingGroup(g.id); }}
          onKeyDown={e => { if (e.key === 'Enter') { if (folded.has(g.id)) folded.delete(g.id); else foldGroup(g.id); setFoldTick(x => x + 1); } }}
          onContextMenu={e => openContextMenu(e, headerMenu(g, l.members.length))}>
          <button type="button" className="k-tgroup-fold" aria-label={isFolded ? 'Open group' : 'Fold group'} aria-expanded={!isFolded}
            onClick={e => { e.stopPropagation(); if (isFolded) folded.delete(g.id); else foldGroup(g.id); setFoldTick(x => x + 1); }}>
            <ChevronDown size={13} className={`k-chevron${isFolded ? '' : ' k-chevron-open'}`} />
          </button>
          <Folder size={14} className="k-tgroup-icon" />
          <SwapInPlace swapKey={renamingGroup === g.id} hold={false} className="min-w-0 flex-1">
          {renamingGroup === g.id
            ? <InlineName value={g.name} max={TURRET_NAME_MAX} onDone={v => { setRenamingGroup(null); if (v !== null) logic.renameTurretGroup(g.id, v); }} />
            : <span className="k-tgroup-name k-fade">{g.name}</span>}
          </SwapInPlace>
          <span className="k-count"><SwapText>{l.members.length}</SwapText></span>
        </div>
      );
    }
    if (l.kind === 'sub') {
      const t = turrets[l.i], sub = t.autoSubTurrets[l.s];
      return (
        <button type="button" onClick={() => onEditAutoTurret?.(t.id)} className={`k-subrow k-subrow-line${l.s === t.autoSubTurrets.length - 1 ? ' k-subrow-last' : ''}${l.inGroup ? ' k-subrow-in' : ''}`}>
          <span className="k-subrow-grail" />
          <CornerDownRight size={12} className="shrink-0" />
          <span className="k-fade">{sub.name || `Sub #${l.s + 1}`} ({sub.turretType === 'decorative' ? 'Decorative' : 'Standard'})</span>
        </button>
      );
    }
    const t = turrets[l.i], idx = l.i;
    const isPrimary = primaryTurretId === t.id;
    const isSelected = selectedTurretId === t.id;
    const isMarked = marked.has(t.id);
    const cls = inheritMode && t.id === inheritTargetId ? 'k-pick k-pick-on k-dim'
      : inheritMode ? 'k-pick k-pick-source'
      : isSelected ? 'k-pick k-pick-on' : isMarked ? 'k-pick k-pick-mark' : 'k-pick';
    const kind = t.projectileType?.visual !== 'bullet' ? (PROJECTILE_LABELS[t.projectileType?.visual || 'bullet'] || t.projectileType?.visual) : null;
    const tags: TagItem[] = [];
    if (isPrimary) tags.push({ key: 'primary', text: 'Primary' });
    if (t.tag) tags.push({ key: 'own', text: t.tag });
    if (kind) tags.push({ key: 'kind', text: kind, optional: true });
    if (layerLabels) tags.push({ key: 'layer', text: layerLabels.get(t.id) || 'Main Body', optional: true });
    return (
      <div className={`k-tline${l.inGroup ? ' k-tline-in' : ''}`}>
        <div role="button" tabIndex={0} aria-pressed={isSelected} className={cls}
          onClick={e => { if (!inheritMode && isSelected && onNameWords(e, '.k-pick-title')) return; clickTurret(e, t, idx); }}
          onDoubleClick={e => { if (onNameWords(e, '.k-pick-title')) setRenaming(t.id); }}
          onContextMenu={e => {
            if (inheritMode) { e.preventDefault(); return; }
            const ids = [t.id];
            openContextMenu(e, turretMenu(t, idx, ids));
          }}
          onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); clickTurret(e as unknown as React.MouseEvent, t, idx); } }}>
          <span className="k-pick-text">
            <SwapInPlace swapKey={renaming === t.id} hold={false} className="min-w-0">
            {renaming === t.id
              ? <InlineName value={t.name ?? ''} max={TURRET_NAME_MAX} onDone={v => { setRenaming(null); if (v !== null) logic.renameTurret(t.id, v); }} />
              : <TagTitle lead={<span className="k-pick-num">#{idx + 1}</span>} title={rowName(t)}
                  titleTip={t.name ? undefined : 'Double click to rename'} tags={tags} />}
            </SwapInPlace>
          </span>
          <span className="k-pick-actions" onClick={e => e.stopPropagation()}>
            <IconButton label="Delete Turret" size="sm" onClick={(e) => { e.stopPropagation(); onRemove(t.id); }}>
              <Trash2 size={14} />
            </IconButton>
          </span>
        </div>
      </div>
    );
  };

  return (
    <VirtualList count={lines.length} rowHeight={k => lineH(lines[k])} maxHeight={6 * H_TURRET + 12} revealNew
      rowKey={k => { const l = lines[k]; return l.kind === 'group' ? 'g:' + l.g.id : l.kind === 'turret' ? 't:' + turrets[l.i].id : 's:' + turrets[l.i].id + ':' + l.s; }}
      renderRow={renderLine} boxRef={box} className="k-tlist"
      empty={<EmptyState icon={emptyIcon ?? emptyArt(HdDashboardSquareAdd)} title={emptyMessage} />} />
  );
};
