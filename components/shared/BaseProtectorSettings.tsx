import { findByShownNameOrFileKey, pickWordOf, shownNameOfWord } from '../../game/tankByName';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import { Info } from '../ui/icons';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { LibraryItem, MapConfig, BaseProtectorTeamConfig } from '../../types';
import { TEAM_NAMES } from '../../types';
import { SliderRow, ToggleItem } from './mapDesignerControls';
import { Reveal } from '../kit/Collapse';
import { SelectRow, Button } from '../kit/kit';
import type { SelectOption } from './CustomSelect';
import type { GameLogic } from '../../game/GameLogic';
import { ContentLibrary } from '../library/ContentLibrary';
import { ContentLibraryButton } from '../library/ContentLibraryButton';
import { tankInNames } from '../library/libraryPickTanks';
import type { LibMode } from '../library/libraryModes';
import { collectionOfCategory, collectionOfItem } from '../library/catalog';
import {
  BASE_PROTECTOR_MAX_COUNT, BASE_PROTECTOR_DEFAULT_TANK,
  BASE_PROTECTOR_MIN_RANGE, BASE_PROTECTOR_MAX_RANGE, BASE_PROTECTOR_DEFAULT_RANGE,
  BASE_PROTECTOR_MAX_PUSH_STRENGTH, BASE_PROTECTOR_CORNER_MAX, BASE_ARRANGE,
  resolveBaseProtectorTeam,
} from '../../game/BaseProtector';

const ARRANGEMENT_OPTIONS: SelectOption[] = [{ value: 'center', label: 'Center' }, { value: 'corners', label: 'Corners' }];
const TIP_ARRANGEMENT = 'Center spreads the guards evenly across the base. Corners stands them on the corners of the base.';
const TIP_COUNT_CENTER = 'More than one spreads them evenly across the base, with equal space between them and from each edge.';
const TIP_COUNT_CORNERS = 'One stands on the corner facing the middle of the map. Two stand on opposite corners, three and four on that many corners.';
const TIP_SMART = 'Places just enough guards, spread evenly, for their reach to cover every spot just outside the base. The number follows the size of the base and Defends Within.';

interface Props {
  config: MapConfig;
  updateConfig: (partial: Partial<MapConfig>) => void;
  teamCount: number;
  tankLibrary: LibraryItem[];
  logic?: GameLogic | null;
  onRangePreview?: (v: number | null) => void;
}

function withTeam(
  config: MapConfig,
  teamIndex: number,
  patch: Partial<BaseProtectorTeamConfig>,
): BaseProtectorTeamConfig[] {
  const next = [...(config.baseProtectorTeams ?? [])];
  while (next.length <= teamIndex) next.push(undefined as unknown as BaseProtectorTeamConfig);
  next[teamIndex] = { ...(next[teamIndex] ?? {}), ...patch };
  return next;
}

const TeamRow: React.FC<{
  config: MapConfig;
  updateConfig: (partial: Partial<MapConfig>) => void;
  teamIndex: number;
  tankLibrary: LibraryItem[];
  logic?: GameLogic | null;
}> = ({ config, updateConfig, teamIndex, tankLibrary, logic }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const resolved = resolveBaseProtectorTeam(config, teamIndex);
  const _expandCat = useMemo(() => {
    const hit = findByShownNameOrFileKey(tankLibrary, resolved.tank, false);
    return hit?.fileData?.category || 'Map Entities';
  }, [tankLibrary, resolved.tank]);
  const teamName = TEAM_NAMES[teamIndex] ?? `Team ${teamIndex + 1}`;
  const pickMode: LibMode = useMemo(() => {
    const names = new Set([resolved.tank]);
    const picked = findByShownNameOrFileKey(tankLibrary, resolved.tank, false);
    const colId = collectionOfItem(picked) ?? collectionOfCategory(_expandCat);
    return {
      place: 'baseProtector', title: `Base Protector for ${teamName}`, subtitle: 'The tank that guards this base. It cannot move and cannot be destroyed.',
      kinds: ['tank'], presetFilter: colId ? { kind: 'tank', picks: [['collection', colId]] } : undefined,
      isChosen: (e) => SMALL_FIX.BH09 !== 0 ? (!!e.item && !!picked && e.item.id === picked.id) : tankInNames(e, names),
      chosenSection: { title: 'Active' },
      actionsOf: (e) => (e.item ? [{ id: 'pick', label: 'Choose', run: () => {
        updateConfig({ baseProtectorTeams: withTeam(config, teamIndex, { tank: pickWordOf(tankLibrary, e.item!, false) }) });
        return true;
      } }] : []),
    };
  }, [resolved.tank, _expandCat, teamName, config, teamIndex, updateConfig, tankLibrary]);

  return (
    <div className="k-split">
      <ToggleItem
        label={teamName}
        desc="Turns the guard on or off for this team only."
        checked={resolved.enabled}
        onChange={v => updateConfig({ baseProtectorTeams: withTeam(config, teamIndex, { enabled: v }) })}
        why={resolved.enabled ? undefined : 'This base has no protector.'}
      />

      <Reveal when={resolved.enabled}>
        <div className="space-y-2.5">
          {BASE_ARRANGE !== 0 && (
            <SelectRow label="Arrangement" help={TIP_ARRANGEMENT} value={resolved.arrangement}
              onChange={v => updateConfig({ baseProtectorTeams: withTeam(config, teamIndex, { arrangement: v === 'corners' ? 'corners' : 'center' }) })}
              options={ARRANGEMENT_OPTIONS} />
          )}
          <Reveal when={!resolved.smart}>
            <SliderRow
              label="How many"
              value={resolved.count}
              onChange={v => updateConfig({ baseProtectorTeams: withTeam(config, teamIndex, { count: v }) })}
              min={1} max={resolved.arrangement === 'corners' ? BASE_PROTECTOR_CORNER_MAX : BASE_PROTECTOR_MAX_COUNT} step={1}
              tooltip={resolved.arrangement === 'corners' ? TIP_COUNT_CORNERS : TIP_COUNT_CENTER}
            />
          </Reveal>
          {BASE_ARRANGE !== 0 && (
            <Reveal when={resolved.arrangement === 'center'}>
              <ToggleItem
                label="Smart Arrangement"
                desc={TIP_SMART}
                checked={resolved.smart}
                onChange={v => updateConfig({ baseProtectorTeams: withTeam(config, teamIndex, { smart: v }) })}
              />
            </Reveal>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-[var(--text-secondary)]">Tank</span>
              <span className="text-[var(--text-primary)] [font-weight:var(--fw-head)] truncate">{shownNameOfWord(tankLibrary, resolved.tank, false)}</span>
            </div>
            <ContentLibraryButton onClick={() => setPickerOpen(true)} disabled={!logic} />
            <Reveal when={resolved.tank !== BASE_PROTECTOR_DEFAULT_TANK}>
              <Button block size="sm" onClick={() => updateConfig({ baseProtectorTeams: withTeam(config, teamIndex, { tank: undefined }) })}>
                Use the default Base Protector
              </Button>
            </Reveal>
            {pickerOpen && logic && <ContentLibrary logic={logic} mode={pickMode} onClose={() => setPickerOpen(false)} />}
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export const BaseProtectorSettings: React.FC<Props> = ({ config, updateConfig, teamCount, tankLibrary, logic, onRangePreview }) => {
  const _prevRef = useRef(onRangePreview);
  _prevRef.current = onRangePreview;
  useEffect(() => () => { _prevRef.current?.(null); }, []);
  const enabled = config.enableBaseProtectors ?? true;
  const pushOn = config.baseProtectorPush ?? true;
  const teams = Math.max(2, Math.min(4, teamCount || 2));

  return (
    <>
      <ToggleItem
        label="Base Protectors"
        checked={enabled}
        onChange={v => updateConfig({ enableBaseProtectors: v })}
        desc="Puts a guard in each team base. It cannot move and cannot be destroyed."
      />

      <Reveal when={enabled}>
        <div className="space-y-2 mt-1">
          {Array.from({ length: teams }, (_, i) => (
            <TeamRow
              key={i}
              config={config}
              updateConfig={updateConfig}
              teamIndex={i}
              tankLibrary={tankLibrary}
              logic={logic}
            />
          ))}


          <ToggleItem
            label="Pushing Shots"
            checked={pushOn}
            onChange={v => updateConfig({ baseProtectorPush: v })}
            desc="Its shots do little damage but shove enemies back hard, the same for every tank size."
          />

          <Reveal when={pushOn}>
            <SliderRow
              label="Push Strength"
              value={config.baseProtectorPushStrength ?? 100}
              onChange={v => updateConfig({ baseProtectorPushStrength: v })}
              min={0} max={BASE_PROTECTOR_MAX_PUSH_STRENGTH} step={5} suffix="%"
              tooltip="100% is the tuned default. Raise it for a harder shove."
            />
          </Reveal>

          <SliderRow
            label="Defends Within"
            value={config.baseProtectorRange ?? BASE_PROTECTOR_DEFAULT_RANGE}
            onChange={v => updateConfig({ baseProtectorRange: v })}
            onPreview={onRangePreview}
            min={BASE_PROTECTOR_MIN_RANGE} max={BASE_PROTECTOR_MAX_RANGE} step={50}
            tooltip="How far from itself the guard will engage enemies. The circle on the canvas shows it."
          />


          <p className="k-note"><Info size={13} /><span>
            <strong>Note:</strong> Guards never target or damage food shapes. Their shots can still nudge
            a shape they run into. They do fight crashers and sentries, the same as arras.
          </span></p>
        </div>
      </Reveal>
    </>
  );
};
