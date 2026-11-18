import { SMALL_FIX } from '../../game/smallFixSwitch';
import { pushUndoAction } from '../shell/undoActions';
import { TEXT_LIMITS } from '../kit/textLimits';
import { UNDO_ELSEWHERE } from './sameProjectUndo';
import { toast } from '../ui/Toast';
import { firstFreeName } from '../../game/MapEditor';
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Plus, Trash2, Pencil } from '../ui/icons';
import { VirtualList } from '../kit/VirtualList';
import { openContextMenu } from '../shell/ContextMenu';

const BOSS_ROW_H = 31;
const BOSS_ROWS = 6;
import type { LibraryItem, MapConfig, BossGroupConfig } from '../../types';
import type { GameLogic } from '../../game/GameLogic';
import { ContentLibraryButton } from '../library/ContentLibraryButton';
import { SliderRow, ToggleItem } from './mapDesignerControls';
import { Reveal, MotionList, MotionRow } from '../kit/Collapse';
import { IconButton, Button } from '../kit/kit';
import { useEscapeOwner } from './escapeStack';
import { BossTanksPopup } from '../BossTanksPopup';
import { shownNameOfWord } from '../../game/tankByName';
import {
  BOSS_MAX_GROUPS,
  BOSS_MIN_DELAY_MS, BOSS_MAX_DELAY_MS, BOSS_MIN_COOLDOWN_MS, BOSS_MAX_COOLDOWN_MS,
  bossInitialDelay, bossSpawnCooldown, bossesCanGrow, bossesUsePortals, bossGroupsOf,
  bossGroupEligible, defaultBossGroups, copyBossGroup,
  bossGroupChances, bossGroupsWithChance, bossStrengthEveryWay,
} from '../../game/BossSpawn';
import { bossShares } from '../../game/statShares';
import { StatSharesRow } from './StatShares';

interface Props {
  config: MapConfig;
  updateConfig: (partial: Partial<MapConfig>) => void;
  tankLibrary: LibraryItem[];
  logic?: GameLogic | null;
  placeKey?: string;
}

function withGroup(groups: readonly BossGroupConfig[], index: number, patch: Partial<BossGroupConfig>): BossGroupConfig[] {
  const next = groups.map(copyBossGroup);
  if (next[index]) next[index] = { ...next[index], ...patch };
  return next;
}

function durationLabel(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

const GroupCard: React.FC<{
  groups: readonly BossGroupConfig[];
  index: number;
  updateConfig: (partial: Partial<MapConfig>) => void;
  tankLibrary: LibraryItem[];
  logic?: GameLogic | null;
  onDelete: (index: number) => void;
}> = ({ groups, index, updateConfig, tankLibrary, logic, onDelete }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const g = groups[index];
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelled = useRef(false);
  const startRename = () => { cancelled.current = false; setDraft(g.name); setRenaming(true); };
  const commitRename = () => {
    if (cancelled.current) return;
    const name = draft.trim();
    if (name && name !== g.name) updateConfig({ bossGroups: withGroup(groups, index, { name }) });
    setRenaming(false);
  };
  const cancelRename = useCallback(() => { cancelled.current = true; setRenaming(false); }, []);
  useEscapeOwner(cancelRename, renaming);
  const canBuild = SMALL_FIX.R803 && logic ? (x: BossGroupConfig) => logic.bossGroupBuildable(x) : undefined;
  const eligible = bossGroupEligible(g) && (!canBuild || canBuild(g));
  const chance = bossGroupChances(groups, canBuild)[index] ?? 0;
  const canChance = Array.isArray(g.tanks) && g.tanks.length > 0 && (!canBuild || canBuild(g));

  const removeTank = (name: string) => {
    updateConfig({ bossGroups: withGroup(groups, index, { tanks: g.tanks.filter(t => t !== name) }) });
  };

  return (
    <div className="k-split k-boss-group">
      <div className="k-split-head"
        onContextMenu={e => {
          if ((e.target as Element).tagName === 'INPUT') return;
          openContextMenu(e, [
            { label: 'Rename', icon: Pencil, onSelect: startRename },
            'sep',
            { label: 'Delete Group', icon: Trash2, onSelect: () => onDelete(index) },
          ]);
        }}>
        {renaming ? (
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } }}
            onFocus={e => e.currentTarget.select()}
            ref={el => { if (el && document.activeElement !== el) el.focus({ preventScroll: true }); }}
            aria-label="Group name"
            maxLength={TEXT_LIMITS.NAME}
            className="k-field flex-1 min-w-0"
          />
        ) : (
          <button type="button" onClick={startRename} className="k-rename k-split-title -ml-1.5 min-w-0" title="Click to rename">{g.name}</button>
        )}
        <span className="flex items-center gap-1 shrink-0">
        {!eligible && g.tanks.length > 0 ? <span className="text-[11px] shrink-0 font-medium text-[var(--text-primary)]">never spawns</span> : null}
          <IconButton label="Delete group" size="sm" onClick={() => onDelete(index)}><Trash2 size={14} /></IconButton>
        </span>
      </div>

      <SliderRow
        label="Chance"
        value={chance}
        disabled={!canChance}
        onChange={v => updateConfig({ bossGroups: bossGroupsWithChance(groups, index, v, canBuild) })}
        min={0} max={100} step={1} suffix="%"
        tooltip="The chance that a boss comes from this group, in percent. All groups together make 100, so moving one moves the others. 0 stops this group. A group with no bosses has no chance until you add some."
      />

      <StatSharesRow value={g.stats} onChange={stats => updateConfig({ bossGroups: withGroup(groups, index, { stats }) })}
        whose="Its bosses'" asFile="As Their Files"
        help="How strong the bosses of this group are, stat by stat, in percent of their own files. 90 is a tenth weaker, 120 a fifth stronger. Their skill points still count as usual. A boss already out keeps the strength it came with." />

      <Reveal when={g.tanks.length > 0}>
      <div className="k-list">
        <VirtualList count={g.tanks.length} rowHeight={BOSS_ROW_H} maxRows={BOSS_ROWS} revealNew
          rowKey={i => g.tanks[i]}
          renderRow={i => {
            const name = g.tanks[i];
            return (
              <div className="k-list-row" onContextMenu={e => openContextMenu(e, [{ label: 'Remove from Group', icon: Trash2, onSelect: () => removeTank(name) }])}>
                <span className="k-fade">{shownNameOfWord(tankLibrary, name, false)}{SMALL_FIX.R803 && logic && !logic.bossNameBuildable(name) ? ' (missing)' : ''}</span>
                <button
                  type="button"
                  onClick={() => removeTank(name)}
                  className="k-list-del"
                  aria-label={`Remove ${shownNameOfWord(tankLibrary, name, false)}`}
                  title="Remove from the group"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          }} />
      </div>
      </Reveal>

      <ContentLibraryButton onClick={() => setPickerOpen(true)} disabled={!logic} />

      {pickerOpen && logic && (
        <BossTanksPopup
          groupName={g.name}
          selectedTanks={g.tanks}
          library={tankLibrary}
          logic={logic}
          onConfirm={names => {
            updateConfig({ bossGroups: withGroup(groups, index, { tanks: names }) });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
};

export const BossSpawnSettings: React.FC<Props> = ({ config, updateConfig, tankLibrary, logic, placeKey }) => {
  const enabled = config.enableBossSpawns === true;
  const groups = bossGroupsOf(config);
  const canGrow = bossesCanGrow(config);

  const anyEligible = useMemo(() => groups.some(g => bossGroupEligible(g) && (!SMALL_FIX.R803 || !logic || logic.bossGroupBuildable(g))), [groups, logic, tankLibrary]);
  const keysRef = useRef<number[]>([]);
  const nextKey = useRef(0);
  if (keysRef.current.length !== groups.length) keysRef.current = groups.map(() => nextKey.current++);
  const copyGroups = () => groups.map(copyBossGroup);
  const latestUpdate = useRef(updateConfig);
  latestUpdate.current = updateConfig;
  const placeNow = `${placeKey ?? ''}|${logic?.state.gameModeConfig?.mode ?? ''}|${logic?.projectEpoch ?? 0}`;
  const placeRef = useRef(placeNow);
  placeRef.current = placeNow;
  const samePlace = (run: () => void): (() => void) => {
    const at = placeRef.current;
    return () => { if (SMALL_FIX.R824 && placeRef.current !== at) { toast('info', UNDO_ELSEWHERE); return; } run(); };
  };
  const deleteGroup = (index: number) => {
    const before = copyGroups(), beforeKeys = keysRef.current;
    keysRef.current = keysRef.current.filter((_, i) => i !== index);
    updateConfig({ bossGroups: copyGroups().filter((_, i) => i !== index) });
    if (SMALL_FIX.R811) { toast('success', `Deleted "${before[index].name}". Ctrl Z brings it back.`); if (logic) pushUndoAction(logic, samePlace(() => { keysRef.current = beforeKeys; latestUpdate.current({ bossGroups: before }); })); }
  };

  return (
    <>
      <ToggleItem
        label="Spawn Bosses"
        checked={enabled}
        onChange={v => {
          if (v && groups.length === 0) updateConfig({ enableBossSpawns: true, bossGroups: defaultBossGroups() });
          else updateConfig({ enableBossSpawns: v });
        }}
        desc="One boss roams the map at a time. When it dies, another arrives after a delay."
      />

      <Reveal when={enabled}>
        <div className="space-y-2 mt-1">

          <SliderRow
            label="First Boss"
            value={bossInitialDelay(config)}
            onChange={v => updateConfig({ bossInitialDelay: v })}
            min={BOSS_MIN_DELAY_MS} max={BOSS_MAX_DELAY_MS} step={5000}
            display={durationLabel}
            tooltip="How long after the game starts before the first boss appears."
          />

          <SliderRow
            label="Between Bosses"
            value={bossSpawnCooldown(config)}
            onChange={v => updateConfig({ bossSpawnCooldown: v })}
            min={BOSS_MIN_COOLDOWN_MS} max={BOSS_MAX_COOLDOWN_MS} step={5000}
            display={durationLabel}
            tooltip="How long after a boss dies before the next one arrives. A boss that is never killed stays forever, so the next one waits."
          />


          <Reveal when={!anyEligible}>
            <p className="text-[11px] text-[var(--text-primary)] font-medium py-1">
              No boss can spawn right now. Add at least one boss to a group and give that
              group a chance above 0.
            </p>
          </Reveal>

          <MotionList gap={8}>
          {groups.map((_g, i) => (
            <GroupCard
              key={keysRef.current[i]}
              groups={groups}
              index={i}
              updateConfig={updateConfig}
              tankLibrary={tankLibrary}
              logic={logic}
              onDelete={deleteGroup}
            />
          ))}
          </MotionList>

          {(groups.length < BOSS_MAX_GROUPS || groups.length > 0) && (
            <MotionRow className="flex items-stretch gap-2">
              {groups.length < BOSS_MAX_GROUPS && (
                <MotionRow.Item key="new" grow><Button block size="sm" icon={<Plus size={14} />}
                  onClick={() => {
                    keysRef.current = [...keysRef.current, nextKey.current++];
                    updateConfig({ bossGroups: [...copyGroups(), { name: SMALL_FIX.R802 ? firstFreeName('Group', groups.map(g => g.name)) : `Group ${groups.length + 1}`, tanks: [], weight: 1, stats: bossShares() }] });
                  }}>
                  New Group
                </Button></MotionRow.Item>
              )}
              {groups.length > 0 && (
                <MotionRow.Item key="reset"><Button size="sm" onClick={() => {
                  const before = copyGroups();
                  updateConfig({ bossGroups: defaultBossGroups() });
                  if (SMALL_FIX.R811) { toast('success', 'The shipped boss groups are back. Ctrl Z takes it back.'); if (logic) pushUndoAction(logic, samePlace(() => latestUpdate.current({ bossGroups: before }))); }
                }}
                  title="Put the shipped groups back">
                  Reset
                </Button></MotionRow.Item>
              )}
            </MotionRow>
          )}


          <ToggleItem
            label="Strength For Every Boss"
            checked={bossStrengthEveryWay(config)}
            onChange={v => updateConfig({ bossStrengthEveryWay: v })}
            desc="A boss from these groups has its group's Strength however it comes: from the Spawn Tool, a command, a Map Events Entity Type with no Strength of its own, or a boss you take over and play. Off: only the bosses this system brings and $spawnboss calls."
          />
          <ToggleItem
            label="Bosses Can Grow"
            checked={canGrow}
            onChange={v => updateConfig({ bossesCanGrow: v })}
            desc="In growth modes, bosses get bigger as they earn score."
          />
          <ToggleItem
            label="Bosses Use Portals"
            checked={bossesUsePortals(config)}
            onChange={v => updateConfig({ bossesUsePortals: v })}
            desc="Lets bosses from the boss spawn system travel through portals and wormholes like other bots. Off: they keep away from every portal, are pushed out of it and never travel. A portal with Blacklist Bosses on always keeps them out."
          />
        </div>
      </Reveal>
    </>
  );
};
