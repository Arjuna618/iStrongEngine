import React, { useState, useMemo } from 'react';
import { Bot, HdFileUser, HdArtificialIntelligence03, HdBoxingGlove01, HdFingerprintScan } from './ui/icons';
import { dreadBehavior } from '../types';
import { LibraryItem, EnemyConfig, AIBehavior, UpgradeLogic, FacingType, TankConfig, GameModeConfig, TEAM_COLORS, TEAM_COLORS_DARK, TEAM_COLORS_LIGHT, TEAM_NAMES, AIBehaviorCategory, isTeamMode, offeredBehaviorsForMode, allowedBehaviorsForMode, defaultBehaviorForMode, keepsOwnColor, SANDBOX_TEAMS, TEAM_IDX_NEUTRAL } from '../types';
import { isGameDark } from '../utils/gameColors';
import { TankPreview } from './TankPreview';
import { GameFloor } from './shared/GameFloor';
import { v4 as uuidv4 } from 'uuid';
import { normalizeTurret } from '../game/GameLogic';
import { Modal } from './kit/Modal';
import { Group, NumberField, SelectRow, ToggleRow, SliderRow, headerIcon } from './kit/kit';
import { HelpTooltip } from './shared/HelpTooltip';


interface Props {
  libraryItem: LibraryItem;
  existingConfig: EnemyConfig | null;
  onSave: (config: EnemyConfig) => void;
  onCancel: () => void;
  gameModeConfig?: GameModeConfig;
  aiBehaviorCategories?: AIBehaviorCategory[];
}

const BOSS_TEAM_OPTION = '__bosses';

export const EnemyConfigPopup: React.FC<Props> = ({
  libraryItem,
  existingConfig,
  onSave,
  onCancel,
  gameModeConfig,
  aiBehaviorCategories,
}) => {
  const tankConfig = libraryItem.fileData.data as TankConfig;
  const mode = gameModeConfig?.mode || 'sandbox';
  const sbFfa = mode === 'sandbox' && gameModeConfig?.sandboxFfa === true;
  const teamCount = mode === 'sandbox' ? 4 : (gameModeConfig?.teams || 2);

  const behaviorLabel = (b: AIBehavior): string => {
    if (b === 'Enemy') return 'Enemy: Attacks player on sight';
    if (b === 'Friendly') return "Friendly: Helps player, won't attack";
    if (b === 'Neutral') return 'Neutral: Attacks only if provoked';
    if (b === 'FFA') return 'FFA: Attacks everyone';
    if (b === 'Team5') return 'Dreadnoughts';
    return `${TEAM_NAMES[parseInt(b.charAt(4)) - 1]} Team`;
  };

  const behaviorOptions: Record<string, string> = {};
  for (const b of offeredBehaviorsForMode(mode, teamCount)) behaviorOptions[b] = behaviorLabel(b);
  behaviorOptions[BOSS_TEAM_OPTION] = 'Bosses: Fights as a boss does';
  const defaultBehavior: AIBehavior = defaultBehaviorForMode(mode);
  const ffaOptions: Record<string, string> = { FFA: behaviorLabel('FFA') };

  const storedBehavior = existingConfig?.aiBehavior;
  const storedIsAllowed = !!storedBehavior &&
    allowedBehaviorsForMode(mode, teamCount).indexOf(storedBehavior) !== -1;
  if (storedIsAllowed && !(storedBehavior! in behaviorOptions)) {
    behaviorOptions[storedBehavior!] = behaviorLabel(storedBehavior!);
  }

  const initialBehavior: string = existingConfig?.bossTeam === true ? BOSS_TEAM_OPTION
    : storedBehavior && (storedBehavior in behaviorOptions) ? storedBehavior : defaultBehavior;

  const lockingCategory = useMemo<AIBehaviorCategory | null>(() => {
    if (!aiBehaviorCategories || aiBehaviorCategories.length === 0) return null;
    const sourceName = existingConfig?.sourceLibraryName || existingConfig?.enemyName || libraryItem.name;
    for (let i = 0; i < aiBehaviorCategories.length; i++) {
      const cat = aiBehaviorCategories[i];
      if (cat.tankNames.indexOf(sourceName) !== -1) return cat;
    }
    return null;
  }, [aiBehaviorCategories, existingConfig?.sourceLibraryName, existingConfig?.enemyName, libraryItem.name]);

  const culEnabled = lockingCategory?.settings.customUpgradeLogic.enabled === true;
  const culHasSkills = useMemo(() => {
    if (!culEnabled || !lockingCategory) return false;
    const p = lockingCategory.settings.customUpgradeLogic.priorities;
    for (const k in p) if (p[k as keyof typeof p] > 0) return true;
    return false;
  }, [culEnabled, lockingCategory]);
  const upgradeLockMode: 'none' | 'custom' | 'random' = culEnabled ? (culHasSkills ? 'custom' : 'random') : 'none';

  const [enemyName, setEnemyName] = useState(existingConfig?.enemyName || libraryItem.name);
  const [baseLevel, setBaseLevel] = useState(existingConfig?.baseLevel || 0);
  const [aiBehavior, setAiBehavior] = useState<string>(initialBehavior);
  const [upgradeLogic, setUpgradeLogic] = useState<UpgradeLogic>(existingConfig?.upgradeLogic || 'OffensiveWeighted');
  const [forceAutospin, setForceAutospin] = useState(existingConfig?.forceAutospin || false);
  const [forceAutoshoot, setForceAutoshoot] = useState(existingConfig?.forceAutoshoot || false);
  const [maxSpawnCount, setMaxSpawnCount] = useState(existingConfig?.maxSpawnCount || 1);
  const [autoRevival, setAutoRevival] = useState(existingConfig?.autoRevival ?? true);
  const [aimbotStrength, setAimbotStrength] = useState(existingConfig?.aimbotStrength ?? 25);
  const [turnSpeed] = useState(existingConfig?.turnSpeed ?? 50);
  const [facingType, setFacingType] = useState<FacingType>(existingConfig?.facingType || 'primaryTurret');
  const [canUsePortal, setCanUsePortal] = useState(existingConfig?.canUsePortal ?? true);
  const [useHardcodedColor, setUseHardcodedColor] = useState(existingConfig?.useHardcodedColor ?? false);

  const _tankKeepsOwnColor = tankConfig.keepOwnColor === true;

  const _previewColorOverride = (() => {
    if (keepsOwnColor(tankConfig.keepOwnColor, useHardcodedColor)) return undefined;
    if (aiBehavior === BOSS_TEAM_OPTION) return undefined;
    const palette0 = isGameDark() ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;
    if (SANDBOX_TEAMS.ON !== 0 && aiBehavior === 'Neutral') return palette0[TEAM_IDX_NEUTRAL];
    if (mode === 'sandbox' && SANDBOX_TEAMS.ON !== 0) {
      if (sbFfa) return palette0[1];
      if (aiBehavior.startsWith('Team')) return palette0[parseInt(aiBehavior.charAt(4)) - 1];
    }
    if (mode === 'sandbox') return undefined;
    if (mode === 'old-dreadnoughts' && aiBehavior === dreadBehavior()) return undefined;
    const palette = isGameDark() ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;
    if (isTeamMode(mode)) {
      if (aiBehavior.startsWith('Team')) {
        const idx = parseInt(aiBehavior.charAt(4)) - 1;
        return palette[idx];
      }
      return undefined;
    }
    return palette[1];
  })();

  const handleSave = () => {
    const lockedAimbot = lockingCategory ? lockingCategory.settings.aimbotStrength : null;
    const lockedAutoshoot = lockingCategory ? lockingCategory.settings.forceAutoshoot : null;
    const lockedAutospin = lockingCategory ? lockingCategory.settings.forceAutospin : null;
    const finalUpgradeLogic: UpgradeLogic = upgradeLockMode === 'random' ? 'Random' : upgradeLogic;

    const config: EnemyConfig = {
      id: existingConfig?.id || uuidv4(),
      enemyName,
      tankConfig: {
        ...tankConfig,
        turrets: (tankConfig.turrets || []).map(t => normalizeTurret(t)),
      },
      baseLevel: Math.max(0, Math.min(100, baseLevel)),
      aiBehavior: (aiBehavior === BOSS_TEAM_OPTION ? 'FFA' : aiBehavior) as AIBehavior,
      bossTeam: aiBehavior === BOSS_TEAM_OPTION ? true : undefined,
      upgradeLogic: finalUpgradeLogic,
      forceAutospin: lockedAutospin !== null ? lockedAutospin : forceAutospin,
      forceAutoshoot: lockedAutoshoot !== null ? lockedAutoshoot : forceAutoshoot,
      maxSpawnCount: Math.max(1, Math.min(20, maxSpawnCount)),
      autoRevival,
      enabled: existingConfig?.enabled ?? true,
      aimbotStrength: lockedAimbot !== null ? lockedAimbot : Math.max(0, Math.min(100, aimbotStrength)),
      turnSpeed: Math.max(0, Math.min(100, turnSpeed)),
      facingType,
      canUsePortal,
      useHardcodedColor,
      sourceLibraryName: existingConfig?.sourceLibraryName ?? libraryItem.name,
    };
    onSave(config);
  };

  const handleLevelChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setBaseLevel(Math.max(0, Math.min(100, num)));
    } else if (value === '') {
      setBaseLevel(0);
    }
  };

  const handleSpawnCountChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setMaxSpawnCount(Math.max(1, Math.min(20, num)));
    } else if (value === '') {
      setMaxSpawnCount(1);
    }
  };

  const catNote = lockingCategory ? <span className="text-[var(--accent)]">Set by category &quot;{lockingCategory.name}&quot;.</span> : null;
  const shownAim = lockingCategory ? lockingCategory.settings.aimbotStrength : aimbotStrength;

  const behaviorNote =
    aiBehavior === 'Enemy' ? 'Will attack you when you enter their field of view.'
    : aiBehavior === 'Friendly' ? 'Will fight alongside you against enemies.'
    : aiBehavior === 'Neutral' ? 'Will only attack if you deal more than 10% of their HP.'
    : aiBehavior === 'FFA' ? 'Will attack everyone: players and other enemies alike.'
    : aiBehavior === BOSS_TEAM_OPTION ? 'In the bosses team it fights as a boss does: crashers and sentinels leave it alone, and it attacks everyone else, other bosses too for now. It keeps its own colours.'
    : (aiBehavior === 'Team1' || aiBehavior === 'Team2' || aiBehavior === 'Team3' || aiBehavior === 'Team4') ? 'Will attack enemies on other teams. Same team units are allies.'
    : undefined;
  const facingNote =
    facingType === 'primaryTurret' ? 'Body rotates so the primary turret barrel aims at the target.'
    : facingType === 'faceTarget' ? 'Body tip faces the target directly. Great for triangle/polygon bosses.'
    : facingType === 'smoothFaceTarget' ? 'Body gradually turns toward the target. Slower, more organic rotation.'
    : facingType === 'faceMotion' ? 'Body faces the movement direction. Good for ram/charging enemies.'
    : undefined;
  const upgradeNote = upgradeLockMode === 'custom'
    ? <span className="text-[var(--accent)]">Set by category &quot;{lockingCategory!.name}&quot;. Edit the category in its window to change which skills are upgraded.</span>
    : upgradeLockMode === 'random'
    ? <span className="text-[var(--accent)]">Set by category &quot;{lockingCategory!.name}&quot;. Custom Upgrade Logic is enabled but no skills are toggled on, so the AI defaults to Random.</span>
    : upgradeLogic === 'OffensiveWeighted' ? '92% offensive, 8% mobility. No points spent on HP, body damage, or shields.'
    : upgradeLogic === 'ByOrder' ? 'Upgrades stats in order: Body Damage, then Max Health, then Bullet Speed, and so on.'
    : upgradeLogic === 'Random' ? 'Randomly selects any available stat to upgrade (equal probability).'
    : undefined;
  const aimNote = lockingCategory ? catNote : (
    aimbotStrength === 0 ? 'Aims at where the target is right now, no lead, so fast movers walk out of the shot.'
    : aimbotStrength <= 25 ? 'Slight lead: trails fast targets, lands on slow ones.'
    : aimbotStrength <= 50 ? 'Partial lead: hits steady movers, trails dodging targets.'
    : aimbotStrength <= 75 ? 'Good aim: decent prediction on moving targets.'
    : aimbotStrength < 100 ? 'Great aim: accurate prediction, rarely misses.'
    : 'Perfect aimbot: mathematically precise prediction.');

  const upgradeSelect = upgradeLockMode === 'custom'
    ? { value: '__CUSTOM__', options: { '__CUSTOM__': 'Custom Upgrade Logic' } as Record<string, string>, disabled: true }
    : upgradeLockMode === 'random'
    ? { value: 'Random', options: { 'Random': 'Random: Equal probability for all stats' } as Record<string, string>, disabled: true }
    : { value: upgradeLogic as string, options: {
        'OffensiveWeighted': 'Offensive Weighted: Zero defense, all offense (Recommended)',
        'ByOrder': 'By Order: Cycles through stats sequentially',
        'Random': 'Random: Equal probability for all stats',
      } as Record<string, string>, disabled: false };

  return (
    <Modal title={existingConfig ? 'Edit Enemy' : 'Add Enemy'} icon={<Bot size={18} />} size="md" width={440} z={50} closeLabel="Cancel" onClose={onCancel}
      footer={(close) => <>
        <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={close}>Cancel</button>
        <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={handleSave}>{existingConfig ? 'Save Changes' : 'Add Enemy'}</button>
      </>}>
      <div className="space-y-3">
        <div className="k-info-card k-card text-center">
          <GameFloor className="k-preview-well h-32 flex items-center justify-center" cell={16}>
            <TankPreview tankConfig={tankConfig} size={120} colorOverride={_previewColorOverride} boundsFit={0.6} />
          </GameFloor>
          <div className="k-card-title">{libraryItem.name}</div>
          <div className="k-row-desc">{tankConfig.turrets?.length || 0} turret{(tankConfig.turrets?.length || 0) !== 1 ? 's' : ''}</div>
        </div>

        <Group title="Enemy" icon={headerIcon(HdFileUser)}>
          <div className="k-num">
            <label htmlFor="enemy-cfg-name" className="k-num-label"><HelpTooltip text="The name shown over this bot in a game and on the leaderboard." />Enemy Name</label>
            <input id="enemy-cfg-name" type="text" value={enemyName} onChange={(e) => setEnemyName(e.target.value)} placeholder="Enter enemy name..." className="k-field" />
          </div>
          <div className="k-grid-2">
            <NumberField id="enemy-cfg-level" label="Base Level (0 to 100)" value={baseLevel} onChange={(e) => handleLevelChange(e.target.value)} min={0} max={100}
              help="Higher levels get more stat points automatically invested." />
            <NumberField id="enemy-cfg-max-spawns" label="Max Simultaneous Spawns" value={maxSpawnCount} onChange={(e) => handleSpawnCountChange(e.target.value)} min={1} max={20}
              help="How many of this enemy can exist at the same time." />
          </div>
        </Group>

        <Group title="Behavior" icon={headerIcon(HdArtificialIntelligence03)}>
          <SelectRow label="AI Behavior" description={behaviorNote} value={sbFfa ? 'FFA' : aiBehavior} onChange={(val) => { if (!sbFfa) setAiBehavior(val); }} options={sbFfa ? ffaOptions : behaviorOptions} locked={sbFfa} />
          <SelectRow label="Facing Type" description={facingNote} value={facingType} onChange={(val) => setFacingType(val as FacingType)}
            options={{ 'primaryTurret': 'Primary Turret (Default)', 'faceTarget': 'Face Target', 'smoothFaceTarget': 'Smooth Face Target', 'faceMotion': 'Face Motion' }} />
          <SelectRow label="Upgrade Logic" locked={upgradeLockMode !== 'none'} description={upgradeNote}
            value={upgradeSelect.value} onChange={(val) => { if (!upgradeSelect.disabled) setUpgradeLogic(val as UpgradeLogic); }} options={upgradeSelect.options} disabled={upgradeSelect.disabled} />
        </Group>

        <Group title="Combat" icon={headerIcon(HdBoxingGlove01)}>
          <ToggleRow label="Force Autospin" locked={!!lockingCategory}
            description={catNote ?? 'Tank will continuously rotate.'}
            checked={lockingCategory ? lockingCategory.settings.forceAutospin : forceAutospin} disabled={!!lockingCategory} onChange={setForceAutospin} />
          <ToggleRow label="Force Autoshoot" locked={!!lockingCategory}
            description={catNote ?? 'Tank will always fire regardless of target.'}
            checked={lockingCategory ? lockingCategory.settings.forceAutoshoot : forceAutoshoot} disabled={!!lockingCategory} onChange={setForceAutoshoot} />
          <SliderRow label="Aimbot Strength" locked={!!lockingCategory} description={aimNote}
            value={shownAim} onChange={v => setAimbotStrength(v)} min={0} max={100} step={1} unit="%" disabled={!!lockingCategory}
            minLabel="0% No prediction" maxLabel="100% Perfect prediction" />
        </Group>

        <Group title="Life and Look" icon={headerIcon(HdFingerprintScan)}>
          <ToggleRow label="Auto Revival" description="Respawns 3 to 10 seconds after death. If off, enemy won't respawn." checked={autoRevival} onChange={setAutoRevival} />
          <ToggleRow label="Can Use Portal" description="If off, enemy is always repelled from portals (like bosses)." checked={canUsePortal} onChange={setCanUsePortal} />
          <ToggleRow label="Use Hardcoded Color" locked={_tankKeepsOwnColor}
            description={_tankKeepsOwnColor
              ? <span className="text-[var(--accent)]">Always on: this tank has Keep Own Color turned on in its design, so it keeps its own colors in every mode.</span>
              : 'Tank renders in its design colors (body, layers, projectiles) instead of its team color. Team membership and AI behavior are unchanged. Smasher rings keep their grey.'}
            checked={useHardcodedColor || _tankKeepsOwnColor} disabled={_tankKeepsOwnColor} onChange={setUseHardcodedColor} />
        </Group>
      </div>
    </Modal>
  );
};
