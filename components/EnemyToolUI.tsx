import React, { useState, useRef, useCallback, useMemo } from 'react';
import { GameLogic } from '../game/GameLogic';
import { DataRegistry } from '../game/DataRegistry';
import { importChangedNotice } from './shared/labels';
import { Trash2, Settings, Bot, Power, HdList, HdAiCoEditing } from './ui/icons';
import { openContextMenu } from './shell/ContextMenu';
import { VirtualList } from './kit/VirtualList';

const ENEMY_ROW_H = 86;
const ENEMY_ROWS = 6;
import { useToast } from './ui/Toast';
import { SMALL_FIX } from '../game/smallFixSwitch';
import { pickWordOf } from '../game/tankByName';
import { sameProjectUndo } from './shared/sameProjectUndo';
import { LibraryItem, EnemyConfig, TEAM_COLORS_LIGHT, TEAM_COLORS_DARK, TEAM_NAMES, TeamEnemyConfig, TeamBotKey, isFfaStyleMode, MAX_ARENA_TANKS } from '../types';
import { EnemyConfigPopup } from './EnemyConfigPopup';
import { TeamBotSettingsPopup } from './TeamBotSettingsPopup';
import { AIBehaviorCategoriesSection } from './AIBehaviorCategoriesSection';
import { sliderFillStyle } from './shared/uiHelpers';
import { LibraryWindowSlot, useOpenFlag } from './library/LibraryWindowSlot';
import { ContentLibraryButton } from './library/ContentLibraryButton';
import type { LibMode } from './library/libraryModes';
import { isGameDark } from '../utils/gameColors';
import { ScrollArea } from './ui/ScrollArea';
import { fireTip } from '../utils/tips';
import { Group, IconButton, Switch, Chip, EmptyState, headerIcon, emptyArt } from './kit/kit';
import { HelpTooltip } from './shared/HelpTooltip';
import { usePanelMemory, isBool } from './kit/panelMemory';
import { cardStartsOpen } from './kit/panelFolds';
import { MotionList, Reveal } from './kit/Collapse';
import { InlineMotion } from './kit/TagLine';
import { ImportButton } from './shared/ImportButton';
import { routeProjectFiles, isProjectFileName, APP_FILE_ACCEPT } from './project/projectActions';

const TeamBotsSection: React.FC<{ logic: GameLogic }> = ({ logic }) => {
  const [open, setOpen] = usePanelMemory('enemy.teamBotsOpen', cardStartsOpen('tool:enemy', 'Team Bots') ?? true, isBool);
  const [, forceUpdate] = useState(0);
  const [settingsFor, setSettingsFor] = useState<{ key: TeamBotKey; label: string; color: string } | null>(null);
  const gm = logic.state.gameModeConfig;
  const tec = gm.teamEnemyConfig;
  const dark = isGameDark();
  const teamColors = dark ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;

  const handleSliderChange = useCallback((key: keyof TeamEnemyConfig, val: number) => {
    const gmc = logic.state.gameModeConfig;
    logic.updateState({
      gameModeConfig: { ...gmc, teamEnemyConfig: { ...gmc.teamEnemyConfig, [key]: val } },
    });
    forceUpdate(n => n + 1);
  }, [logic]);

  const isFFA = isFfaStyleMode(gm.mode);

  const rows: { key: keyof TeamEnemyConfig; label: string; color: string; max: number }[] = [];
  if (isFFA) {
    rows.push({ key: 'ffa', label: 'FFA Bots', color: 'var(--accent)', max: Math.min(60, MAX_ARENA_TANKS) });
  } else {
    for (let i = 0; i < gm.teams; i++) {
      const teamKey = `team${i + 1}` as keyof TeamEnemyConfig;
      let others = 0;
      for (let j = 0; j < gm.teams; j++) {
        if (j === i) continue;
        others += tec[`team${j + 1}` as keyof TeamEnemyConfig] || 0;
      }
      const own = tec[teamKey] || 0;
      const budget = Math.max(0, MAX_ARENA_TANKS - others);
      rows.push({
        key: teamKey, label: `${TEAM_NAMES[i]} Team`, color: teamColors[i],
        max: Math.max(own, Math.min(30, budget)),
      });
    }
  }

  return (
    <>
      <Group title="Team Bots" icon={headerIcon(HdAiCoEditing)} count={isFFA ? String(tec.ffa) : String(rows.reduce((s, r) => s + (tec[r.key] || 0), 0))}
        collapsible open={open} onToggle={setOpen}>
        {rows.map(row => {
          const val = tec[row.key] || 0;
          const custom = logic.state.teamBotSettings[row.key as TeamBotKey]?.overridden === true;
          return (
            <div key={row.key} className="k-slider-row">
              <div className="k-row">
                <span className="k-row-label">
                  <span className="k-dot" style={{ backgroundColor: row.color }} />
                  <span className="k-row-lead"><HelpTooltip text={isFFA ? 'How many bots join a game started here in the engine. The gear opens their bot settings.' : 'How many bots this team gets in a game started here in the engine. The gear opens this team\'s bot settings.'} /></span>
                  <span className="truncate">{row.label}</span>
                  {custom && <Chip>custom</Chip>}
                </span>
                <span className="k-value">
                  <IconButton label={`${row.label} bot settings`} size="sm"
                    onClick={() => setSettingsFor({ key: row.key as TeamBotKey, label: row.label, color: row.color })}>
                    <Settings size={14} />
                  </IconButton>
                  <span className="k-value-text min-w-[24px] text-right">{val}</span>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={row.max}
                step={1}
                value={val}
                onChange={(e) => handleSliderChange(row.key, parseInt(e.target.value))}
                className="w-full"
                style={sliderFillStyle(val, 0, row.max)}
              />
            </div>
          );
        })}
        <p className="k-hint">Bots spawn and evolve. You can add enemies below.</p>
      </Group>

      {settingsFor && (
        <TeamBotSettingsPopup
          key={settingsFor.key}
          logic={logic}
          teamKey={settingsFor.key}
          teamLabel={settingsFor.label}
          teamColor={settingsFor.color}
          onClose={() => { setSettingsFor(null); forceUpdate(n => n + 1); }}
        />
      )}
    </>
  );
};

interface Props {
  logic: GameLogic | null;
  className?: string;
}

export const EnemyToolUI: React.FC<Props> = ({ logic, className }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<LibraryItem | null>(null);
  const [showConfigPopup, setShowConfigPopup] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EnemyConfig | null>(null);
  const [listKept, setEnemyListExpanded] = usePanelMemory<boolean | null>('enemy.listOpen', null, v => v === null || isBool(v));
  const enemyListExpanded = listKept ?? (logic?.state?.gameModeConfig?.mode === 'sandbox' || (cardStartsOpen('tool:enemy', 'Enemy List') ?? true));
  const { showToast } = useToast();
  const libFlag = useOpenFlag();

  const allLib = logic ? (logic.state.tankLibrary || []) : [];
  const allLibLen = allLib.length;
  const library = useMemo(() => allLib.filter((item: LibraryItem) => item.fileData.type === 'Tank'), [allLibLen]);
  const libMode: LibMode = useMemo(() => ({
    place: 'enemy', title: 'Add an Enemy', subtitle: 'Double click a tank to set it up as an enemy',
    kinds: ['tank'], allowImport: true,
    actionsOf: (e) => (e.item ? [{ id: 'add', label: 'Add as Enemy', run: () => { handleAddAsEnemyRef.current(e.item!); return true; } }] : []),
  }), []);
  const handleAddAsEnemyRef = useRef<(item: LibraryItem) => void>(() => {});

  if (!logic) return null;

  const enemyConfigs = (logic.state.enemyConfigs || []).filter(
    c => !c.isSentryEnemy && !c.isBossTier && !c.isBaseProtector && !c.isCmdBot && !c.isStageBody
  );

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isProjectFileName(file.name)) { e.target.value = ''; routeProjectFiles([{ file, path: file.name }]); return; }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const validated = DataRegistry.validateImport(json);
        if (!validated) {
          showToast('error', 'Invalid file format: Missing type or data.');
          return;
        }

        const newItem: LibraryItem = {
          id: DataRegistry.libraryIdFor(validated),
          name: validated.name || file.name.replace('.json', ''),
          fileData: validated,
          loadedAt: Date.now(),
          source: 'manual-import',
        };

        logic.addToLibrary(newItem);
        const changed = importChangedNotice(newItem.name, validated);
        if (changed) showToast('info', changed);
        else showToast('success', `Imported "${newItem.name}" to library`);
      } catch (err) {
        showToast('error', 'Failed to parse JSON file.');
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddAsEnemy = (item: LibraryItem) => {
    setSelectedLibraryItem(item);
    setEditingConfig(null);
    setShowConfigPopup(true);
    fireTip('enemyConfigOpened');
  };
  handleAddAsEnemyRef.current = handleAddAsEnemy;

  const handleEditEnemy = (config: EnemyConfig) => {
    const libraryItem = library.find(l => l.fileData.data === config.tankConfig);
    setSelectedLibraryItem(libraryItem || {
      id: config.id,
      name: config.enemyName,
      fileData: {
        version: '1.0',
        type: 'Tank' as const,
        name: config.enemyName,
        timestamp: Date.now(),
        data: config.tankConfig,
      },
      loadedAt: Date.now(),
    });
    setEditingConfig(config);
    setShowConfigPopup(true);
  };

  const handleSaveConfig = (config: EnemyConfig) => {
    if (editingConfig) {
      logic.updateEnemyConfig(config.id, config);
    } else {
      logic.addEnemyConfig(selectedLibraryItem ? { ...config, sourceTankWord: pickWordOf(logic.state.tankLibrary, selectedLibraryItem, false) } : config);
      fireTip('enemySaved');
    }
    setShowConfigPopup(false);
    setSelectedLibraryItem(null);
    setEditingConfig(null);
  };

  const handleDeleteEnemy = (id: string) => {
    const at = logic.state.enemyConfigs.findIndex(c => c.id === id);
    const cfg = logic.state.enemyConfigs[at];
    logic.removeEnemyConfig(id);
    if (SMALL_FIX.R811 && cfg) showToast('success', `Deleted "${cfg.enemyName || 'the bot setting'}".`, { label: 'Undo', run: sameProjectUndo(logic, showToast, () => logic.restoreEnemyConfig(cfg, at)) });
  };

  const handleToggleEnabled = (id: string) => {
    logic.toggleEnemyEnabled(id);
  };

  return (
    <ScrollArea className={className} contentClassName="p-4 space-y-3 overflow-x-hidden">
      <Reveal when={logic.state.gameModeConfig.mode !== 'sandbox'}>
        <TeamBotsSection logic={logic} />
      </Reveal>

      <Group title="Enemy List" icon={headerIcon(HdList)} count={String(enemyConfigs.length)} collapsible open={enemyListExpanded} onToggle={setEnemyListExpanded}>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0"><ContentLibraryButton onClick={() => libFlag.set(true)} /></div>
          <ImportButton logic={logic} label="Import New" look="icon" onImportFile={handleImportClick} />
        </div>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept={APP_FILE_ACCEPT}
          onChange={handleFileChange}
        />
        <LibraryWindowSlot flag={libFlag} logic={logic} mode={libMode} />

        <VirtualList count={enemyConfigs.length} rowHeight={ENEMY_ROW_H} maxRows={ENEMY_ROWS} revealNew
          rowKey={i => enemyConfigs[i].id}
          empty={<EmptyState icon={emptyArt(Bot)} title="No enemies configured" />}
          renderRow={i => {
            const config = enemyConfigs[i];
            return (
            <div className={`k-group k-l3 k-card k-vl-card ${config.enabled ? '' : 'opacity-70'}`}
              onContextMenu={e => openContextMenu(e, [
                { label: 'Edit', icon: Settings, onSelect: () => handleEditEnemy(config) },
                { label: config.enabled ? 'Disable' : 'Enable', icon: Power, onSelect: () => handleToggleEnabled(config.id) },
                'sep',
                { label: 'Delete', icon: Trash2, onSelect: () => handleDeleteEnemy(config.id) },
              ])}>
              <div className="k-card-head">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="k-card-title k-fade min-w-0">{config.enemyName}</span>
                  <Chip>{config.aiBehavior}</Chip>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="flex" title={config.enabled ? 'Enabled (click to disable)' : 'Disabled (click to enable)'}>
                    <Switch checked={config.enabled} onChange={() => handleToggleEnabled(config.id)} label={config.enabled ? 'Enabled (click to disable)' : 'Disabled (click to enable)'} />
                  </span>
                  <IconButton label="Edit" size="sm" onClick={() => handleEditEnemy(config)}><Settings size={14} /></IconButton>
                  <IconButton label="Delete" size="sm" onClick={() => handleDeleteEnemy(config.id)}><Trash2 size={14} /></IconButton>
                </div>
              </div>
              <div className="flex items-center k-fade">
                <InlineMotion items={[
                  { key: 'lv', node: <Chip>Lv. {config.baseLevel}</Chip> },
                  { key: 'max', node: <Chip>Max {config.maxSpawnCount}x</Chip> },
                  ...(config.autoRevival ? [{ key: 'revive', node: <Chip>Auto Revive</Chip> }] : []),
                ]} />
              </div>
            </div>
            );
          }} />
      </Group>

      <AIBehaviorCategoriesSection logic={logic} />

      {showConfigPopup && selectedLibraryItem && (
        <EnemyConfigPopup
          libraryItem={selectedLibraryItem}
          existingConfig={editingConfig}
          onSave={handleSaveConfig}
          onCancel={() => {
            setShowConfigPopup(false);
            setSelectedLibraryItem(null);
            setEditingConfig(null);
          }}
          gameModeConfig={logic.state.gameModeConfig}
          aiBehaviorCategories={logic.state.aiBehaviorCategories.categories}
        />
      )}
    </ScrollArea>
  );
};
