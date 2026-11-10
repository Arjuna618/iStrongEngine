import React, { useState, useRef, useCallback, useSyncExternalStore } from 'react';
import { GameLogic } from '../game/GameLogic';
import { GameModeConfig, TEAM_NAMES, isManhuntMode, BOT_PORTAL_DEFAULTS, isPortalMode, SANDBOX_TEAMS } from '../types';
import { SMALL_FIX } from '../game/smallFixSwitch';
import { Joystick, ChevronRight, MevEvents, HdGame, HdActivityCircle, HdSettingDone01, HdAnalyticsUp, HdChart02, HdUserGroup03 } from './ui/icons';
import { Reveal, SwapText } from './kit/Collapse';
import { GameModesWindow, gameModeArt } from './GameModesWindow';
import { useGameDark } from '../utils/useGameTheme';
import { modeCardPictures, modeCardUrl } from './menu/modeCardPictures';
import { Group, ToggleRow, SliderRow, SelectRow, FieldRow, Segmented, Dim, RowLabel, headerIcon, Button } from './kit/kit';
import { sliderFillStyle } from './shared/uiHelpers';
import { EditableValue } from './shared/EditableValue';
import { ScrollArea } from './ui/ScrollArea';
import { getPlayEntry, MODE_OPTIONS, ENGINE_MODE_GROUPS, engineModeKey, isCurrentEngineModeKey, engineModeIdForKey, engineModeLabel, resolveEngineModeConfig, isTeamModeId, supportsTeamCountChoice, teamCountForMode } from '../game/gameModeRegistry';
import { fireTip } from '../utils/tips';
import { MapModeConflictPopup } from './MapModeConflictPopup';
import { askBeforeModeSwitch } from './project/projectActions';
import { openMapEvents } from './mapEvents/mapEventsStore';
import { NumberBox } from './kit/NumberBox';
import { toast } from './ui/Toast';
import { markOfLastEdit, undoMarkedEdit } from './shared/markedUndo';
import { CMD_ROOM_MAX } from '../game/chatCommands';
import { STARTING_SCORE_MAX } from '../game/vampirism';
import { useMenuScale } from '../utils/useMenuScale';
import { RandomMapCard } from './RandomMapCard';
import { GrowthRulesCard, RuleNum, SkillPointRuns } from './GrowthRulesCard';
import { GROWTH_LIMITS, growthModeRules, type GrowthRules } from '../game/growthRules';
import { ALL_MODES } from '../game/allModesSwitch';
import { HALLOWEEN_FULL, halloweenLocked } from '../utils/halloween';
import { BASE_AREAS } from '../game/baseAreasSwitch';
const HALLOWEEN_LOCKED_TIP = 'Locked in this match: its map has stone and gravel, which never turn into pumpkins. It stays as you started the match. Start a new match to change it.';

export { MODE_OPTIONS };

function modeKeyLabel(key: string): string {
  for (const g of ENGINE_MODE_GROUPS) {
    const hit = g.options.find(o => o.key === key);
    if (hit) return hit.label;
  }
  return key;
}

export type DeferredRangeProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'min' | 'max' | 'style'
> & {
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
};

export function DeferredRangeInput({ value, onCommit, min, max, ...rest }: DeferredRangeProps) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const isDragging = useRef(false);
  const latestRef = useRef(value);
  const showValue = dragValue !== null ? dragValue : value;
  return (
    <input
      {...rest}
      type="range"
      min={min}
      max={max}
      value={showValue}
      style={sliderFillStyle(showValue, min, max)}
      onPointerDown={() => {
        isDragging.current = true;
        latestRef.current = value;
        setDragValue(value);
      }}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (isDragging.current) {
          latestRef.current = v;
          setDragValue(v);
        } else {
          onCommit(v);
        }
      }}
      onPointerUp={() => {
        if (isDragging.current) {
          isDragging.current = false;
          const final = latestRef.current;
          setDragValue(null);
          if (final !== value) onCommit(final);
        }
      }}
      onLostPointerCapture={() => {
        if (isDragging.current) {
          isDragging.current = false;
          const final = latestRef.current;
          setDragValue(null);
          if (final !== value) onCommit(final);
        }
      }}
    />
  );
}


interface Props {
  logic: GameLogic | null;
  onUpdate: () => void;
  className?: string;
}

const TEAM_COUNT_OPTIONS = [
  { value: '2', label: '2', title: '2 Teams' },
  { value: '3', label: '3', title: '3 Teams' },
  { value: '4', label: '4', title: '4 Teams' },
];

const ModeRulesCard: React.FC<{ logic: GameLogic; config: GameModeConfig; applyConfig: (patch: Partial<GameModeConfig>, full?: boolean) => void; onUpdate: () => void }> = ({ logic, config, applyConfig, onUpdate }) => {
  const scripted = config.mode === 'scripted';
  const areaId = logic.state.multiAreaConfig.enableMultiArea ? logic.state.multiAreaConfig.activeAreaId : '';
  const saveFile = async () => {
    const data = logic.gameModeFileData();
    const file = { version: '1', type: 'GameMode', name: logic.state.mapConfig.events?.meta?.title ?? engineModeLabel(engineModeKey(config.mode, config.growth, config.preset, config.armsRace, config.world, config.teams, config.enableSpawnZones, config.overlay)), timestamp: Date.now(), data };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    a.download = `mode-${file.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Group title="Map Events" icon={headerIcon(MevEvents)}>
      <FieldRow label="Max Tanks Alive" help="How many tanks this mode holds at once, bots and bosses. Past it they wait for room and none is lost. Shapes never count. Empty: the game's own 50.">
        <NumberBox className="k-field k-ev-num" value={config.maxTanksAlive ?? ''} min={1} max={CMD_ROOM_MAX} placeholder="50" onChange={e => { const v = e.target.value.trim(); const n = Number(v); applyConfig({ maxTanksAlive: v === '' || !Number.isFinite(n) ? undefined : Math.max(1, Math.min(CMD_ROOM_MAX, Math.round(n))) }); }} />
      </FieldRow>
      <Reveal when={scripted && ALL_MODES.ON === 0}>
        <ToggleRow label="Arms Race Tree" help="You start on the Arms Race tree. Bots stay on the Basic one." checked={config.armsRace === true} onChange={v => applyConfig({ armsRace: v || undefined })} />
      </Reveal>
      <div className="k-ev-door-col">
        <Button size="sm" variant="primary" block onClick={() => openMapEvents(areaId)}>Open Map Events</Button>
        <Button size="sm" variant="secondary" block onClick={() => openMapEvents(areaId, 'match')}>Match Rules</Button>
        <Button size="sm" variant="secondary" block title="Tank Debuffs, Bots Stop Upgrading and Bots and Portals, with groups of tanks of your own." onClick={() => openMapEvents(areaId, 'groups')}>Tank Groups</Button>
        <Reveal when={scripted || config.mode === 'sandbox'}><Button size="sm" variant="secondary" block onClick={() => { void saveFile(); }} title="Saves this mode as a file: its rules, its map, its Map Events.">Save Mode As File</Button></Reveal>
        <Reveal when={!!config.preset}><Button size="sm" variant="ghost" block title="This mode's Map Events and Custom Areas again, as shipped. Undo brings yours back." onClick={() => { logic.resetModeToShipped(areaId); onUpdate(); const mark = markOfLastEdit(logic); toast('info', 'Reset to shipped.', { label: 'Undo', run: () => { undoMarkedEdit(logic, mark); onUpdate(); } }); }}>Reset To Shipped</Button></Reveal>
      </div>
    </Group>
  );
};

export const GameModeDesignerUI: React.FC<Props> = ({ logic, onUpdate, className }) => {
  const gameDarkNow = useGameDark();
  useSyncExternalStore(modeCardPictures.subscribe, modeCardPictures.version, modeCardPictures.version);
  const [modesOpen, setModesOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<string | null>(null);
  const [pendingTeams, setPendingTeams] = useState<number | null>(null);
  const menuScale = useMenuScale();

  const applyConfig = useCallback((partial: Partial<GameModeConfig>, replace = false) => {
    if (!logic) return;
    const newConfig = replace
      ? ({ ...partial } as GameModeConfig)
      : { ...logic.state.gameModeConfig, ...partial };
    if (newConfig.mode === 'tdm') {
      newConfig.enableSpawnZones = true;
    } else if (newConfig.mode === 'open-tdm') {
      newConfig.enableSpawnZones = false;
    }
    if (newConfig.playerTeam > newConfig.teams) {
      newConfig.playerTeam = 1;
    }
    if (partial.growth !== undefined && partial.levelCap === undefined) {
      newConfig.levelCap = partial.growth ? 1000 : 45;
    }
    if (partial.growth === true) {
      if (partial.growthMaxMultiplier === undefined && newConfig.growthMaxMultiplier === undefined) {
        newConfig.growthMaxMultiplier = 5;
      }
      if (partial.growthPerLevel === undefined && newConfig.growthPerLevel === undefined) {
        newConfig.growthPerLevel = 0.05;
      }
      if (partial.growthStartLevel === undefined && newConfig.growthStartLevel === undefined) {
        newConfig.growthStartLevel = 1;
      }
      if (partial.growthModel === undefined && newConfig.growthModel === undefined) {
        newConfig.growthModel = 'rules';
        if (newConfig.growthRules === undefined) newConfig.growthRules = growthModeRules();
      }
      if (partial.smartGrowthCap === undefined) {
        const _sgMac = logic.state.multiAreaConfig;
        const _sgMaze = logic.state.mapConfig.enableMaze ||
          (_sgMac.enableMultiArea && _sgMac.areas.some(a => a.mapConfig.enableMaze));
        newConfig.smartGrowthCap = _sgMaze && newConfig.mode !== 'old-dreadnoughts';
      }
    }
    if (partial.growthFixedSpRate === true) {
      if (partial.growthLevelsPerSp === undefined && newConfig.growthLevelsPerSp === undefined) {
        newConfig.growthLevelsPerSp = 6;
      }
    }
    logic.applyGameMode(newConfig);
    onUpdate();
  }, [logic, onUpdate]);
  const pickTeams = (n: number) => {
    if (logic && SMALL_FIX.R898 !== 0 && SMALL_FIX.R899 !== 0 && logic.teamTwinOf(n) !== ''
      && logic.worldHoldsWork(logic.state.multiAreaConfig.enableMultiArea ? logic.state.multiAreaConfig.activeAreaId : '')) {
      void askBeforeModeSwitch(`The ${n} team mode`).then(ok => { if (ok) { logic.convertCustomMapsToGenerated(); applyConfig({ teams: n }); } });
      return;
    }
    if (logic && SMALL_FIX.R899 !== 0 && logic.teamTwinOf(n) !== ''
      && (logic.isCustomMapActive() || logic.worldHasHandRows(logic.state.multiAreaConfig.enableMultiArea ? logic.state.multiAreaConfig.activeAreaId : ''))) { setPendingTeams(n); return; }
    applyConfig({ teams: n });
  };

  const handleLevelCapChange = useCallback((val: number) => {
    if (!logic) return;
    logic.updateState({ gameModeConfig: { ...logic.state.gameModeConfig, levelCap: val } });
    onUpdate();
  }, [logic, onUpdate]);

  const setModeWords = useCallback((patch: Pick<Partial<GameModeConfig>, 'vampirism' | 'startingScore'>) => {
    if (!logic) return;
    logic.updateState({ gameModeConfig: { ...logic.state.gameModeConfig, ...patch } });
    onUpdate();
  }, [logic, onUpdate]);

  const commitMode = useCallback((key: string) => {
    applyConfig(resolveEngineModeConfig(key), true);
    if (key !== 'sandbox') fireTip('teamModeSelected');
  }, [applyConfig]);

  const handleModeChange = useCallback((key: string) => {
    if (!logic) return;
    if (isCurrentEngineModeKey(logic.state.gameModeConfig, key)) return;
    if (SMALL_FIX.R898 !== 0) {
      const work = logic.worldHoldsWork(logic.state.multiAreaConfig.enableMultiArea ? logic.state.multiAreaConfig.activeAreaId : '');
      const go = () => { logic.convertCustomMapsToGenerated(); commitMode(key); };
      if (work && (logic.state.gameModeConfig.mode !== 'sandbox' || SMALL_FIX.R898S !== 0)) { void askBeforeModeSwitch(modeKeyLabel(key)).then(ok => { if (ok) go(); }); return; }
      go();
      return;
    }
    if ((key !== 'sandbox' && logic.isCustomMapActive()) || logic.worldHasHandRows(logic.state.multiAreaConfig.enableMultiArea ? logic.state.multiAreaConfig.activeAreaId : '')) {
      setPendingMode(key);
      return;
    }
    commitMode(key);
  }, [logic, commitMode]);

  if (!logic) return null;

  const config = logic.state.gameModeConfig;
  const hwLocked = halloweenLocked(logic.state.isTestMode, logic.mapState?.rocks);
  const hw = config.halloween;
  const selectedModeKey = engineModeKey(config.mode, config.growth, config.preset, config.armsRace, config.world, config.teams, config.enableSpawnZones, config.overlay);

  const _mazeMac = logic.state.multiAreaConfig;
  const mazeEnabled = logic.state.mapConfig.enableMaze ||
    (_mazeMac.enableMultiArea && _mazeMac.areas.some(a => a.mapConfig.enableMaze));
  const smartCapActive = !!config.smartGrowthCap && mazeEnabled;
  const isTDM = isTeamModeId(config.mode) && !config.preset;
  const canPickTeamCount = supportsTeamCountChoice(config.mode) && !config.preset;
  const isOD = config.mode === 'old-dreadnoughts';
  const isManhunt = isManhuntMode(config.mode);

  const respawn = {
    percent: logic.state.respawnLevelPercent,
    minLevel: logic.state.respawnMinLevel,
    maxLevel: logic.state.respawnMaxLevel,
  };
  const setRespawn = (patch: Parameters<GameLogic['setRespawnSettings']>[0]) => {
    logic.setRespawnSettings(patch);
    onUpdate();
  };
  const growthModel = config.growthModel ?? 'simple';
  const growthRules = config.growthRules;
  const setGrowthModel = (m: 'simple' | 'rules') => { logic.setGrowthModel(m); onUpdate(); };
  const setGrowthRules = (r: GrowthRules) => { logic.setGrowthRules(r); onUpdate(); };
  const scoreKept = growthModel === 'rules' && !!growthRules?.respawn.on;

  const growthCapUnlimited = (config.growthMaxMultiplier ?? 5) >= 1000;
  const botRest = config.botPortalRest ?? BOT_PORTAL_DEFAULTS.rest;
  const botRestMin = config.botPortalRestMin ?? BOT_PORTAL_DEFAULTS.restMin;
  return (
    <ScrollArea
      className={className || ''}
      contentClassName="p-4 space-y-3 overflow-x-hidden"
    >
      <Group title="Mode" icon={headerIcon(HdGame)}>
        <button type="button" className="k-mode-pick" aria-haspopup="dialog" onClick={() => setModesOpen(true)} title="Choose a game mode">
          <span className="k-mode-pick-art">
            {(() => { const mk = gameModeArt(selectedModeKey), u = mk ? modeCardUrl(mk, gameDarkNow) : null; return u ? <img src={u} alt="" draggable={false} /> : <Joystick size={18} />; })()}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="k-card-title truncate block">{engineModeLabel(selectedModeKey)}</span>
            <span className="k-row-desc block">Change mode</span>
          </span>
          <ChevronRight size={16} className="text-[var(--text-tertiary)] shrink-0" />
        </button>
        {modesOpen && (
          <GameModesWindow
            current={selectedModeKey}
            onPick={handleModeChange}
            onClose={() => setModesOpen(false)}
          />
        )}
        <ToggleRow label="Growth Mode" description="Tanks grow as they level up."
          help="Level cap 1000. Tanks grow in size as they level up. Speed decreases with size. Skill points: every level (1 to 40), every other (41 to 51), every 10 (52 and up). Size scaling: tanks grow per level past the start level, capped by the max multiplier. Speed penalty: up to 4x slower at max growth (2x normally)."
          checked={config.growth} onChange={v => applyConfig({ growth: v })} />
        <Reveal when={ALL_MODES.ON !== 0 && config.mode !== 'sandbox' && config.mode !== 'old-dreadnoughts'}>
          <ToggleRow label="Arms Race Tree" help="You and the bots upgrade along the Arms Race tree."
            checked={config.armsRace === true} onChange={v => applyConfig({ armsRace: v || undefined })} />
        </Reveal>
        <ToggleRow label="Vampirism"
          help="Your score is your health. Above your starting score a hit takes score first, and the tank that hit you gets half of it. Below it your score follows your health bar, and any score you gain fills your bar first. A tank that loses score can lose levels."
          checked={config.vampirism === true} onChange={v => setModeWords({ vampirism: v || undefined })} />
        <FieldRow label="Starting Score" help="The score every tank shows at level 0, on the HUD, the leaderboard and over the tanks. 26,263 is the score arras starts you with. With Vampirism on it is also what one full health bar is worth; otherwise only the number you see changes. Empty: 0.">
          <NumberBox className="k-field k-ev-num" value={config.startingScore ?? ''} min={0} max={STARTING_SCORE_MAX} placeholder="0" onChange={e => { const v = e.target.value.trim(); const n = Number(v); setModeWords({ startingScore: v === '' || !Number.isFinite(n) || n <= 0 ? undefined : Math.min(STARTING_SCORE_MAX, Math.round(n)) }); }} />
        </FieldRow>
        <Reveal when={config.mode === 'sandbox' && SANDBOX_TEAMS.ON !== 0}>
          <ToggleRow label="Free For All"
            help="Every bot fights every other bot and you, with no teams. Off: the Sandbox plays on teams (Blue, Red, Green, Purple and Neutral) and you start on Blue. Bots keep the team you gave them for a game on teams."
            checked={config.sandboxFfa === true} onChange={v => applyConfig({ sandboxFfa: v })} />
        </Reveal>
        <ToggleRow label="Halloween Look" description={hwLocked ? HALLOWEEN_LOCKED_TIP : 'Eyes on walls, pumpkins for rocks.'}
          help="Puts an eye on every wall and draws every rock as a pumpkin in this mode. It belongs to the mode, so everyone who plays it sees it." locked={hwLocked}
          checked={!!hw} onChange={v => { if (hwLocked) return; logic.setHalloweenLook(v ? HALLOWEEN_FULL : undefined); onUpdate(); }} />
        <Reveal when={!!hw}>
          <div className="k-stack">
            <ToggleRow label="Spooky Eyes" description="An eye on every wall."
              help="Shows the eyes that watch you from the walls. Turn it off to keep only the pumpkins. Only the look changes."
              checked={!!hw?.eyes} onChange={v => { logic.setHalloweenLook({ eyes: v, pumpkins: !!hw?.pumpkins }); onUpdate(); }} />
            <ToggleRow label="Pumpkin Rocks" description={hwLocked ? HALLOWEEN_LOCKED_TIP : 'Rocks drawn as pumpkins.'}
              help="Draws every rock as a pumpkin. Turn it off to keep only the eyes. The rocks stay where they are and block the same way. While it is on, maps are made of big rocks only, the only ones big enough to look right as pumpkins."
              locked={hwLocked} checked={!!hw?.pumpkins} onChange={v => { if (hwLocked) return; logic.setHalloweenLook({ eyes: !!hw?.eyes, pumpkins: v }); onUpdate(); }} />
          </div>
        </Reveal>
        <Reveal when={!isManhunt}>
        <SliderRow label="Level Cap" help="Maximum achievable level. Default: 45. Growth mode: 1000." deferred
          value={config.levelCap ?? 45} onChange={handleLevelCapChange} min={1} max={config.growth ? 1000 : 200} step={1} inputMax={1000} />
        </Reveal>
        <Reveal when={isManhunt}>
          <FieldRow label="Level Cap" help="Manhunt has no level cap: levels keep going up."><span className="k-value-text">None in Manhunt</span></FieldRow>
        </Reveal>
        <Reveal when={isOD && (config.levelCap ?? 45) < 45}>
          <p className="k-hint k-hint-strong">
            Warning: Level cap ({config.levelCap}) is below the Forge gate (45). Players cannot reach the Forge.
          </p>
        </Reveal>
        <Reveal when={isOD}><div className="space-y-3">
          <FieldRow label="Areas" help="Old Dreadnoughts is played on three areas: the main arena, the maze and the Forge."><span className="k-value-text">Main + Maze + Forge</span></FieldRow>
          <FieldRow label="Forge Gate" help="The level a tank needs to go through the portal into the Forge."><span className="k-value-text">Lvl 45</span></FieldRow>
          <FieldRow label="Forge Tank" help="The tank you become the first time you enter the Forge: the first Dreadnought."><span className="k-value-text">dreadOfficialV1</span></FieldRow>
        </div></Reveal>
      </Group>

      {pendingMode && (() => {
        const pendingModeLabel = modeKeyLabel(pendingMode);
        return (
        <MapModeConflictPopup
          modeName={pendingModeLabel}
          handWork={logic.worldHasHandRows(logic.state.multiAreaConfig.enableMultiArea ? logic.state.multiAreaConfig.activeAreaId : '')}
          forceReplace={engineModeIdForKey(pendingMode) === 'old-dreadnoughts'
            || (SMALL_FIX.CC041 !== 0 && isPortalMode(engineModeIdForKey(pendingMode)))
            || !!getPlayEntry(pendingMode)?.preset}
          menuScale={menuScale}
          onKeep={() => { const m = pendingMode; setPendingMode(null); logic._keepEventsThroughMode = true; try { commitMode(m); } finally { logic._keepEventsThroughMode = false; } }}
          onReplace={() => {
            const m = pendingMode;
            setPendingMode(null);
            logic.convertCustomMapsToGenerated();
            commitMode(m);
          }}
          onCancel={() => setPendingMode(null)}
        />
        );
      })()}
      {pendingTeams !== null && (
        <MapModeConflictPopup
          modeName={`${pendingTeams} Teams`}
          handWork={true}
          forceReplace={false}
          menuScale={menuScale}
          onKeep={() => { const n = pendingTeams; setPendingTeams(null); logic._keepEventsThroughMode = true; try { applyConfig({ teams: n }); } finally { logic._keepEventsThroughMode = false; } }}
          onReplace={() => { const n = pendingTeams; setPendingTeams(null); logic.convertCustomMapsToGenerated(); applyConfig({ teams: n }); }}
          onCancel={() => setPendingTeams(null)}
        />
      )}

      <ModeRulesCard logic={logic} config={config} applyConfig={applyConfig} onUpdate={onUpdate} />

      <Reveal when={ALL_MODES.ON !== 0 && !config.preset && !isOD}>
        <RandomMapCard logic={logic} config={config} onChange={pool => { logic.updateState({ gameModeConfig: { ...logic.state.gameModeConfig, mapPool: pool } }); onUpdate(); }} />
      </Reveal>

      <Reveal when={isTDM}>
        <Group title="Teams" icon={headerIcon(HdUserGroup03)}>
          <Reveal when={canPickTeamCount}>
            <FieldRow label="Number of Teams" help="How many teams the game has.">
              <Segmented value={String(config.teams)} onChange={v => pickTeams(Number(v))}
                options={TEAM_COUNT_OPTIONS} />
            </FieldRow>
          </Reveal>
          <SelectRow label="Your Team" value={String(config.playerTeam)}
            onChange={(val) => applyConfig({ playerTeam: Number(val) })}
            options={Array.from({ length: canPickTeamCount ? config.teams : teamCountForMode(config.mode) }, (_, i) => ({
              value: String(i + 1),
              label: TEAM_NAMES[i],
            }))} />
          <Reveal when={config.mode === 'tdm' && BASE_AREAS.ON === 0}>
            <FieldRow label="Team Bases" description="Protected bases, always on in TDM.">
              <span className="k-value-text">Always on</span>
            </FieldRow>
          </Reveal>
        </Group>
      </Reveal>

      <Reveal when={!!config.growth}>
      <div className="space-y-3">
        <Group title="Growth" icon={headerIcon(HdAnalyticsUp)}>
          <FieldRow label="Growth Model" help="Simple: tanks get bigger by the rows below. Rules: choose every stat that grows, its curve, the level it stops at, the skill points and how much score a respawn keeps.">
            <Segmented value={growthModel} onChange={setGrowthModel}
              options={[{ value: 'simple', label: 'Simple' }, { value: 'rules', label: 'Rules' }]} />
          </FieldRow>
          <ToggleRow label="Smart Growth Cap"
            description="Tanks always fit the maze."
            why="Enable Maze in the Map Designer to use this."
            help="Auto sizes tanks so they always fit through the maze corridors and never get stuck. Overrides the Max Growth Multiplier below."
            checked={!!config.smartGrowthCap && mazeEnabled}
            onChange={v => applyConfig({ smartGrowthCap: v })}
            disabled={!mazeEnabled} />

          <Reveal when={growthModel !== 'rules'}>
          <Dim when={smartCapActive} why="Smart Growth Cap sets the size cap while it is on." className="k-stack">
            <div className="k-slider-row">
              <div className="k-row">
                <RowLabel label="Max Growth Multiplier" help="Hard cap on tank size. 5 = max 5x base size. Toggle Unlimited below for growth manhunt style uncapped growth." />
                <span className="k-value">
                  <EditableValue
                    value={config.growthMaxMultiplier ?? 5}
                    onChange={v => applyConfig({ growthMaxMultiplier: v })}
                    min={1}
                    max={1000}
                    step={0.5}
                    className="k-value-field"
                  />
                </span>
              </div>
              <DeferredRangeInput
                min={1} max={50} step={0.5}
                value={Math.min(50, config.growthMaxMultiplier ?? 5)}
                onCommit={(v) => applyConfig({ growthMaxMultiplier: v })}
                disabled={growthCapUnlimited}
                className="w-full"
              />
            </div>
            <ToggleRow label="Unlimited" description="No cap on tank size."
              help="Disables the cap: tanks can keep growing for as long as you keep leveling."
              checked={growthCapUnlimited}
              onChange={v => applyConfig({ growthMaxMultiplier: v ? 1000 : 5 })} />
          </Dim>

          <SliderRow label="Growth Per Level" help="Size gain per level past the start level. 0.05 = +5% per level. Higher = faster growth." deferred
            value={config.growthPerLevel ?? 0.05} onChange={v => applyConfig({ growthPerLevel: v })} min={0} max={0.5} step={0.005} />

          <SliderRow label="Growth Start Level" help="Below this level, no growth happens. Default 1 = growth begins immediately (your level 0 is the classic level 45, so growth starts right after the normal level cap). Raise to delay growth until a higher level." deferred
            value={config.growthStartLevel ?? 1} onChange={v => applyConfig({ growthStartLevel: v })} min={1} max={100} step={1} />
          </Reveal>
        </Group>

        <Reveal when={growthModel === 'rules' && !!growthRules}>
          {() => <GrowthRulesCard rules={growthRules!} onChange={setGrowthRules} logic={logic} />}
        </Reveal>

        <Group title="Growth Skill Points" icon={headerIcon(HdChart02)}>
          <Reveal when={growthModel !== 'rules'}>
          <ToggleRow label="Fixed SP rate" description="One point every N level ups."
            help="Replace the classic SP curve (your levels 2, 4, 6 and 7, then one every 10 levels from 17) with a fixed rate of 1 skill point every N level ups."
            checked={config.growthFixedSpRate ?? false}
            onChange={v => applyConfig({ growthFixedSpRate: v })} />
          <Reveal when={!!config.growthFixedSpRate}>
            <SliderRow label="Levels per Skill Point" help="When Fixed SP rate is on, you gain 1 skill point every N level ups. Lower N = faster skill progression. The starting bonusSkillPoints from your tank's config still applies." deferred
              value={config.growthLevelsPerSp ?? 6} onChange={v => applyConfig({ growthLevelsPerSp: v })} min={1} max={100} step={1} />
          </Reveal>
          </Reveal>
          <Reveal when={growthModel === 'rules' && !!growthRules}>
            {() => { const sp = growthRules!.skillPoints; return (<>
              <ToggleRow label="Point Every Few Levels" help="On: skill points come by the runs below, each one a point at its first level, then one every so many levels until its last level. Off: the classic skill point curve, your levels 2, 4, 6 and 7, then one every 10 levels from 17. New arras, recorded in every growth mode and Old Dreadnoughts: levels 2, 4 and 6, then one every 10 levels from 16 to 336 (the classic 47, 49 and 51, then 61, 71 and on to 381), 78 points in all with the 42 a tank starts with."
                checked={sp.on} onChange={v => setGrowthRules({ ...growthRules!, skillPoints: { ...sp, on: v } })} />
              <Reveal when={sp.on}>
                <SkillPointRuns rule={sp} onChange={next => setGrowthRules({ ...growthRules!, skillPoints: next })} logic={logic} />
              </Reveal>
            </>); }}
          </Reveal>
        </Group>
      </div>
      </Reveal>

      <Group title="Respawn" icon={headerIcon(HdActivityCircle)} collapsible defaultOpen={false}>
        <Reveal when={!!config.growth && growthModel === 'rules' && !!growthRules}>
          {() => { const rs = growthRules!.respawn; return (<>
            <ToggleRow label="Keep Score" help="On: a respawn keeps a share of your score, and the level rows below are not used. Every growth mode keeps a quarter, at least 26,263 and at most 402,171 (recorded in Old Dreadnoughts and Growth Manhunt)."
              checked={rs.on} onChange={v => setGrowthRules({ ...growthRules!, respawn: { ...rs, on: v } })} />
            <Reveal when={rs.on}>
              <FieldRow label="Score Kept" help="The share of your score you come back with.">
                <RuleNum value={rs.keepPercent} min={0} max={100} step={1} unit="%" label="Score kept" onChange={v => setGrowthRules({ ...growthRules!, respawn: { ...rs, keepPercent: v } })} />
              </FieldRow>
              <FieldRow label="At Least" help="Never come back with less score than this. 26,263 is the start score, your level 0.">
                <RuleNum value={rs.minScore} min={0} max={GROWTH_LIMITS.SCORE_MAX} step={1} label="Lowest score kept" onChange={v => setGrowthRules({ ...growthRules!, respawn: { ...rs, minScore: Math.round(v), maxScore: Math.max(Math.round(v), rs.maxScore) } })} />
              </FieldRow>
              <FieldRow label="At Most" help="Never come back with more score than this, however high you were.">
                <RuleNum value={rs.maxScore} min={rs.minScore} max={GROWTH_LIMITS.SCORE_MAX} step={1} label="Highest score kept" onChange={v => setGrowthRules({ ...growthRules!, respawn: { ...rs, maxScore: Math.round(v) } })} />
              </FieldRow>
            </Reveal>
          </>); }}
        </Reveal>
        <Dim when={scoreKept} why="Keep Score is on: the mode's Growth Rules decide the respawn." className="k-stack">
        <SliderRow label="Level Kept" unit="%" help="How much of your level you come back with. At 25%, dying at level 160 returns you at level 40. The engine works out the exact XP for that level, so your size, growth and skill points all follow automatically." deferred
          value={respawn.percent} onChange={v => setRespawn({ respawnLevelPercent: v })} min={0} max={100} step={1} />
        <SliderRow label="Minimum Level" help="Die below this level and you keep nothing, returning at level 0. Note that a mode's own level cap still applies: in modes capped at 45 you can never reach a minimum set above it, so nothing would ever carry over there." deferred
          value={respawn.minLevel} onChange={v => setRespawn({ respawnMinLevel: v })} min={0} max={1000} step={1} />
        <SliderRow label="Highest Respawn Level" help="The ceiling on where you can come back, however high you were when you died. At 40, a level 160 death and a level 900 death both return you at level 40." deferred
          value={respawn.maxLevel} onChange={v => setRespawn({ respawnMaxLevel: v })} min={0} max={1000} step={1} />
        </Dim>
      </Group>

      <Group title="Active Settings" icon={headerIcon(HdSettingDone01)} collapsible defaultOpen={false}>
        <SummaryRow label="Mode" value={engineModeLabel(selectedModeKey)} />
        <Reveal when={isTDM}><SummaryRow label="Teams" value={`${config.teams}`} /></Reveal>
        <Reveal when={isTDM}><SummaryRow label="Your Team" value={TEAM_NAMES[config.playerTeam - 1] ?? ''} /></Reveal>
        <Reveal when={config.mode === 'tdm' && BASE_AREAS.ON === 0}><SummaryRow label="Team Bases" value={config.enableSpawnZones ? 'On' : 'Off'} /></Reveal>
        <SummaryRow label="Growth" value={isManhunt ? (config.growth ? 'On (no level cap)' : 'Off (no level cap)') : config.growth ? `On (Lvl ${config.levelCap ?? 1000})` : `Off (Lvl ${config.levelCap ?? 45})`} />
        <SummaryRow label="Bots Rest After a Trip" value={botRest ? `${botRestMin} min` : 'Off'} />
      </Group>
    </ScrollArea>
  );
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <FieldRow label={label}><span className="k-value-text"><SwapText>{value}</SwapText></span></FieldRow>
  );
}
