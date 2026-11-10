import React, { useEffect, useRef, useState } from 'react';
import { Trash2, HdDashboardSquareAdd, CornerDownRight, ChevronDown, Folder, FolderPlus, FolderMinus, Pencil, Tags, MousePointer2, Copy, SlidersHorizontal, MousePointerClick } from '../ui/icons';
import { Turret, TURRET_NAME_MAX, TURRET_TAG_MAX } from '../../types';
import type { TurretGroup } from '../../types';
import type { GameLogic } from '../../game/GameLogic';
import { PROJECTILE_LABELS } from './labels';
import { IconButton, EmptyState, emptyArt } from '../kit/kit';
import { SwapInPlace, SwapText } from '../kit/Collapse';
import { VirtualList, virtualRowAtPoint } from '../kit/VirtualList';
import { TagTitle, type TagItem } from '../kit/TagLine';
import { openContextMenu, openPromptAt, type MenuEntry } from '../shell/ContextMenu';
import { useEscapeOwner } from './escapeStack';

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
  | { kind: 'sub'; i: number; s: number };

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
  const [marked, setMarked] = useState<Set<string>>(() => new Set(selectedTurretId ? [selectedTurretId] : []));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [, setFoldTick] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ startLine: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const idKey = turrets.map(t => t.id).join('|');
  useEffect(() => {
    setMarked(prev => {
      const ids = new Set(turrets.map(t => t.id));
      let next = prev;
      if (selectedTurretId && !prev.has(selectedTurretId)) next = new Set([selectedTurretId]);
      for (const id of next) if (!ids.has(id)) { next = new Set([...next].filter(x => ids.has(x))); break; }
      return next;
    });
  }, [selectedTurretId, idKey]);
  useEffect(() => { turretListMarks.set(scope, [...marked]); }, [marked, scope]);
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
        for (let s = 0; s < t.autoSubTurrets.length; s++) out.push({ kind: 'sub', i, s });
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
      { label: 'Delete', icon: Trash2, hint: 'Del', onSelect: () => onRemove(t.id) },
    ];
  };
  const headerMenu = (g: TurretGroup, n: number): MenuEntry[] => [
    { label: 'Rename', icon: Pencil, onSelect: () => setRenamingGroup(g.id) },
    { label: 'Ungroup', icon: FolderMinus, onSelect: () => logic.ungroupTurretGroup(g.id) },
    'sep',
    { label: n > 0 ? 'Delete Group and Its Turrets' : 'Delete Group', icon: Trash2, onSelect: () => logic.deleteTurretGroupWithTurrets(g.id) },
  ];

  const clickTurret = (e: React.MouseEvent, t: Turret, index: number) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (inheritMode && onInheritFrom) { if (t.id !== inheritTargetId) onInheritFrom(t.id); return; }
    if (e.ctrlKey || e.metaKey) {
      setMarked(prev => { const n = new Set(prev); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; });
      setAnchor(t.id);
      return;
    }
    if (e.shiftKey && anchor) {
      const from = lines.findIndex(l => l.kind === 'turret' && turrets[l.i].id === anchor);
      const to = lines.findIndex(l => l.kind === 'turret' && l.i === index);
      if (from >= 0 && to >= 0) { setMarked(new Set(turretLineIds(from, to))); return; }
    }
    setMarked(new Set([t.id]));
    setAnchor(t.id);
    onSelect(t, index);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || inheritMode) return;
    const target = e.target as Element;
    if (target.closest('button, input, .k-pick-actions')) return;
    const row = target.closest('.k-vl-row') as HTMLElement | null;
    if (!row) return;
    const li = Number(row.dataset.vlIndex);
    if (lines[li]?.kind !== 'turret') return;
    drag.current = { startLine: li, y: e.clientY, moved: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.abs(ev.clientY - d.y) < 6) return;
      d.moved = true;
      const el = box.current;
      if (el) {
        const r = el.getBoundingClientRect();
        if (ev.clientY < r.top + 14) el.scrollTop -= 10;
        else if (ev.clientY > r.bottom - 14) el.scrollTop += 10;
      }
      const at = virtualRowAtPoint(box.current, Math.max(Math.min(ev.clientY, (el?.getBoundingClientRect().bottom ?? 0) - 1), (el?.getBoundingClientRect().top ?? 0) + 1));
      if (at >= 0) setMarked(new Set(turretLineIds(d.startLine, at)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      if (drag.current?.moved) suppressClick.current = true;
      drag.current = null;
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  };

  const renderLine = (k: number) => {
    const l = lines[k];
    if (l.kind === 'group') {
      const g = l.g, isFolded = folded.has(g.id);
      const allMarked = l.members.length > 0 && l.members.every(i => marked.has(turrets[i].id));
      return (
        <div className={`k-tgroup${allMarked ? ' k-tgroup-on' : ''}`} role="button" tabIndex={0}
          onClick={() => setMarked(new Set(l.members.map(i => turrets[i].id)))}
          onDoubleClick={() => setRenamingGroup(g.id)}
          onKeyDown={e => { if (e.key === 'Enter') setMarked(new Set(l.members.map(i => turrets[i].id))); }}
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
        <button type="button" onClick={() => onEditAutoTurret?.(t.id)} className={`k-subrow k-subrow-line${l.s === t.autoSubTurrets.length - 1 ? ' k-subrow-last' : ''}`}>
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
          onClick={e => clickTurret(e, t, idx)}
          onDoubleClick={e => { if ((e.target as Element).closest('.k-pick-title')) setRenaming(t.id); }}
          onContextMenu={e => {
            if (inheritMode) { e.preventDefault(); return; }
            const ids = marked.has(t.id) ? [...marked] : [t.id];
            if (!marked.has(t.id)) { setMarked(new Set([t.id])); setAnchor(t.id); }
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
      renderRow={renderLine} boxRef={box} boxProps={{ onPointerDown }} className="k-tlist"
      empty={<EmptyState icon={emptyIcon ?? emptyArt(HdDashboardSquareAdd)} title={emptyMessage} />} />
  );
};
