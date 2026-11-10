import { SMALL_FIX } from '../../game/smallFixSwitch';
import React from 'react';
import type { GameLogic } from '../../game/GameLogic';
import type { MapConfig, AreaConfig, PortalKindConfig, PortalThingsWord, PortalBotOddsConfig } from '../../types';
import { PORTAL_TIMING_DEFAULTS, PORTAL_KIND_PRESETS, PORTAL_BOT_ODDS_DEFAULT } from '../../types';
import { SliderRow, ToggleItem } from './mapDesignerControls';
import { Reveal } from '../kit/Collapse';
import type { SelectOption } from './CustomSelect';
import { SelectRow, FieldRow } from '../kit/kit';
import { NumberBox } from '../kit/NumberBox';
import { DirectionDial } from '../kit/DirectionDial';
import { isCustomMap, editPortals, portalLinksAfterPick, portalExitExists, editZones, builtPortalRows } from '../../game/MapEditor';
import { MISSING_MODES } from '../../game/missingModesSwitch';
import { PLAY_MODE_ENTRIES } from '../../game/gameModeRegistry';
import { ColorMapControl, ColorMapSwitch } from './ColorMapField';
import type { ColorMapValue } from './colorMapRules';
import { CM_USE, CM_FREE } from '../../utils/colorMap';
import { PORTAL_PARTICLE_RAND_DEFAULT } from '../../game/MapSystem';

interface CommonProps {
  logic: GameLogic;
  config: MapConfig;
  updateConfig: (partial: Partial<MapConfig>) => void;
  activeArea: AreaConfig | null;
  isMultiArea: boolean;
  portalId: number;
  variant?: 'numbered' | 'named';
  label?: string;
}

const TIP_DESTINATION = 'The area this portal sends tanks to. Each area can be the destination of only one portal here.';
const TIP_TIMED = 'On: the portal opens and closes on a timer. Off: it stays open.';
const TIP_LEVEL = 'The level a tank needs to go through this portal. 0 lets every tank through. A tank below the level is pushed away instead of pulled in.';
const TIP_BOT_ODDS = 'The chance that a bot which sees this portal chooses to go through it. Only this way: the exit portal has its own. Bots can still fall in by mistake, as you can.';

function findRuntimePortal(logic: GameLogic, portalId: number, isMultiArea: boolean, activeArea: AreaConfig | null) {
  return logic.mapState?.portals.find(
    p => p.id === portalId && (!isMultiArea || (activeArea && p.areaId === activeArea.id))
  );
}

export const PortalLinkRow: React.FC<CommonProps & { areas: AreaConfig[] }> = ({
  config, updateConfig, activeArea, portalId, label, areas, variant = 'numbered',
}) => {
  const existingLink = (config.portalLinks || []).find(l => l.portalId === portalId);
  const otherAreas = areas.filter(a => activeArea && a.id !== activeArea.id);
  const placed = builtPortalRows(config);
  const portalExists = (id: number) => placed
    ? placed.some(p => p.id === id)
    : id >= 0 && id < config.portalCount;
  const takenDestinations = new Set(
    (config.portalLinks || [])
      .filter(l => l.portalId !== portalId && portalExists(l.portalId))
      .map(l => l.destinationAreaId)
  );
  const options: SelectOption[] = [
    { value: '', label: 'None' },
    ...otherAreas.map(a => ({
      value: a.id,
      label: takenDestinations.has(a.id) ? `${areaLabel(a, areas)} (taken)` : areaLabel(a, areas),
      disabled: takenDestinations.has(a.id),
    })),
  ];
  const setDestination = (val: string) => {
    updateConfig({ portalLinks: portalLinksAfterPick(config.portalLinks || [], portalId, val, portalExists) });
  };
  return <SelectRow label={variant === 'named' ? 'Destination' : label ? `${label} Destination` : 'Destination'} help={TIP_DESTINATION}
    value={existingLink?.destinationAreaId || ''} onChange={setDestination} options={options} />;
};

export const PortalTimingRow: React.FC<CommonProps> = ({
  logic, config, updateConfig, activeArea, isMultiArea, portalId, label, variant = 'numbered',
}) => {
  const portal = findRuntimePortal(logic, portalId, isMultiArea, activeArea);
  const tc = (config.portalTimings || []).find(t => t.portalId === portalId);
  const isTimed = tc?.timed || false;

  const saveTimingToConfig = (patch: Partial<{ timed: boolean; appearDuration: number; disappearDuration: number; initialDelay: number }>) => {
    const timings = [...(config.portalTimings || [])];
    const idx = timings.findIndex(t => t.portalId === portalId);
    if (idx >= 0) {
      timings[idx] = { ...timings[idx], ...patch };
    } else {
      timings.push({ portalId, timed: false, ...PORTAL_TIMING_DEFAULTS, ...patch });
    }
    updateConfig({ portalTimings: timings });
    if (portal) {
      const t = timings.find(x => x.portalId === portalId)!;
      portal.timed = t.timed;
      portal.appearDuration = t.appearDuration;
      portal.disappearDuration = t.disappearDuration;
      portal.initialDelay = t.initialDelay;
    }
  };

  const named = variant === 'named';
  return (
      <div className="space-y-2">
        <ToggleItem label={named || !label ? 'Timed' : `${label} Timed`} checked={isTimed} onChange={v => saveTimingToConfig({ timed: v })} desc={TIP_TIMED} />
        <Reveal when={isTimed}>
          <div className="space-y-2">
            <SliderRow label="Visible" value={(tc?.appearDuration || PORTAL_TIMING_DEFAULTS.appearDuration) / 1000} onChange={v => saveTimingToConfig({ appearDuration: v * 1000 })} min={1} max={60} step={1} suffix="s"
              tooltip="How long the portal stays open each time, in seconds." />
            <SliderRow label="Hidden" value={(tc?.disappearDuration || PORTAL_TIMING_DEFAULTS.disappearDuration) / 1000} onChange={v => saveTimingToConfig({ disappearDuration: v * 1000 })} min={1} max={60} step={1} suffix="s"
              tooltip="How long the portal stays closed between two openings, in seconds." />
            <SliderRow label="Initial Delay" value={(tc?.initialDelay ?? PORTAL_TIMING_DEFAULTS.initialDelay) / 1000} onChange={v => saveTimingToConfig({ initialDelay: v * 1000 })} min={0} max={30} step={1} suffix="s"
              tooltip="How long the portal stays closed when the game starts, before it first opens, in seconds." />
          </div>
        </Reveal>
      </div>
  );
};

const TIP_TYPE = 'Black Hole: a tank that falls in comes out on a safe spot of its destination area. Wormhole: it comes out of the exit portal you pick, thrown out with the speed it came in with. Each type comes with its own settings.';
const TIP_EXIT = 'The portal this Wormhole sends you out of. Until one is picked it pulls, but nothing goes through.';
const TIP_BOTH_WAYS = 'On: picking an exit also makes that exit lead back here. Off: each portal is set alone, so you can make chains like A to B, B to C, C to A.';
const TIP_INVISIBLE = 'Nothing of it is drawn in a match, not even on the minimap. The editor still shows it so you can pick it and move it.';
const TIP_REACH = 'How far its pull and its push reach, in units.';
const TIP_SHAPE = 'Circle: it reaches the same distance all round. Square: it reaches a square around it, the way a Wormhole does.';
const TIP_PULL = 'How strong its pull is. 100% is its type\'s own.';
const TIP_JUMP = 'A tank whose middle comes this close to its middle goes through.';
const TIP_EXIT_DIST = 'How far from the exit\'s middle you come out.';
const TIP_THROW = 'How hard you are thrown out of the exit. 100% is the Wormhole type\'s own.';
const TIP_KEEP = 'On: you come out with the speed you went in with, plus the throw. Off: only the throw.';
const TIP_EMIT_FIXED = 'On: everything that comes out of this wormhole leaves the way its arrow points. Off: a random way each time.';
const TIP_EMIT = 'The way out of this wormhole. Click or drag the arrow; hold Shift for steps of 15 degrees.';
const TIP_SHAPES = 'What it does to food shapes that come near it.';
const TIP_ROUNDS = 'What it does to bullets, traps, drones and every other projectile that comes near it.';

const THINGS_LABEL: Record<PortalThingsWord, string> = {
  push: 'Pushed away', destroy: 'Destroyed on touch', pullDestroy: 'Pulled in, destroyed', pullThrough: 'Pulled in, thrown out',
};

function areaLabel(a: AreaConfig, areas: readonly AreaConfig[]): string {
  return a.name || (SMALL_FIX.R806 ? `Area ${areas.indexOf(a) + 1}` : '');
}

function portalsOf(cfg: MapConfig): { id: number; n: number }[] {
  const rows = builtPortalRows(cfg);
  if (rows !== null) return rows.map((p, i) => ({ id: p.id, n: i + 1 }));
  return Array.from({ length: SMALL_FIX.R826 && !cfg.enablePortals ? 0 : (cfg.portalCount || 0) }, (_, i) => ({ id: i, n: i + 1 }));
}

function withKindRow(rows: PortalKindConfig[] | undefined, portalId: number, patch: Partial<PortalKindConfig>): PortalKindConfig[] {
  const out = [...(rows || [])];
  const i = out.findIndex(r => r.portalId === portalId);
  if (i >= 0) out[i] = { ...out[i], ...patch, portalId };
  else out.push({ portalId, kind: 'blackHole', ...patch });
  return out;
}

export function asReturnWormhole(rows: PortalKindConfig[] | undefined, portalId: number, exitAreaId: string, exitPortalId: number): PortalKindConfig[] {
  if ((rows || []).some(r => r.portalId === portalId && r.kind === 'wormhole')) {
    return withKindRow(rows, portalId, { kind: 'wormhole', exitAreaId, exitPortalId });
  }
  const out = (rows || []).filter(r => r.portalId !== portalId);
  out.push({ portalId, kind: 'wormhole', invisible: PORTAL_KIND_PRESETS.wormhole.invisible, exitAreaId, exitPortalId });
  return out;
}

function usePortalKind(config: MapConfig, portalId: number, updateConfig: (partial: Partial<MapConfig>) => void) {
  const row = (config.portalKinds || []).find(r => r.portalId === portalId);
  const kind: 'blackHole' | 'wormhole' = row?.kind ?? 'blackHole';
  const pre = PORTAL_KIND_PRESETS[kind];
  const save = (patch: Partial<PortalKindConfig>) => updateConfig({ portalKinds: withKindRow(config.portalKinds, portalId, patch) });
  return { row, kind, pre, wh: kind === 'wormhole', save };
}

const TYPE_OPTIONS: SelectOption[] = [{ value: 'blackHole', label: 'Black Hole' }, { value: 'wormhole', label: 'Wormhole' }];
const TIP_LEADS_TO = 'Where a tank that goes through it arrives. Another game mode is a match already going on there (one you left comes back aged by the time you were away). A Random Normal Mode picks a new one each time it opens, never a Growth, Arms Race or Others mode.';
const TIP_APPEARS_IN = 'The Custom Area it stands in. A timed one opens again at a new place inside the same area. Anywhere: any free place of the map, as before.';
let _leadsToOptions: SelectOption[] | null = null;
function leadsToOptions(): SelectOption[] {
  if (_leadsToOptions) return _leadsToOptions;
  const out: SelectOption[] = [{ value: '', label: 'This Map\'s Areas' }, { value: 'random', label: 'A Random Normal Mode' }, { value: 'nexus', label: 'The Nexus' }, { value: 'forge', label: 'The Forge' }, { value: 'labyrinth', label: 'The Labyrinth' }];
  for (const e of PLAY_MODE_ENTRIES) if (e.key !== 'nexus' && e.key !== 'labyrinth') out.push({ value: e.key, label: e.title });
  _leadsToOptions = out;
  return out;
}
const REACH_SHAPE_OPTIONS: SelectOption[] = [{ value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }];

export const PortalKindRows: React.FC<CommonProps & { areas: AreaConfig[] }> = ({
  logic, config, updateConfig, activeArea, isMultiArea, portalId, areas,
}) => {
  const { row, kind, pre, wh, save } = usePortalKind(config, portalId, updateConfig);
  const ownAreaId = isMultiArea && activeArea ? activeArea.id : '';

  const setKind = (k: string) => {
    if (k === kind) return;
    const rest = { portalId, kind: k as PortalKindConfig['kind'], invisible: PORTAL_KIND_PRESETS[k as 'blackHole' | 'wormhole'].invisible,
      ...(row ? { theme: row.theme, themeUseMap: row.themeUseMap, themeHex: row.themeHex, themeMap: row.themeMap, particleCountRand: row.particleCountRand, particleSpeedRand: row.particleSpeedRand } : {}) };
    const rows = (config.portalKinds || []).filter(r => r.portalId !== portalId);
    rows.push(k === 'wormhole' && row ? { ...rest, exitAreaId: row.exitAreaId, exitPortalId: row.exitPortalId, bothWays: row.bothWays } : rest);
    updateConfig({ portalKinds: rows });
  };

  const exitOptions: SelectOption[] = [{ value: '|-1', label: 'None' }];
  for (const p of portalsOf(config)) if (p.id !== portalId) exitOptions.push({ value: `|${p.id}`, label: `Portal ${p.n}` });
  if (isMultiArea) for (const a of areas) {
    if (activeArea && a.id === activeArea.id) continue;
    for (const p of portalsOf(a.mapConfig)) exitOptions.push({ value: `${a.id}|${p.id}`, label: `${areaLabel(a, areas)}: Portal ${p.n}` });
  }
  const exitValue = row && !portalExitExists(row, config, areas, ownAreaId) ? '|-1' : `${row?.exitAreaId && row.exitAreaId !== ownAreaId ? row.exitAreaId : ''}|${row?.exitPortalId ?? -1}`;
  const setExit = (val: string) => {
    const bar = val.indexOf('|');
    const area = val.slice(0, bar), pid = Number(val.slice(bar + 1));
    const ownRows = withKindRow(config.portalKinds, portalId, { kind: 'wormhole', exitAreaId: area, exitPortalId: pid });
    const both = row?.bothWays !== false && pid >= 0;
    if (!both || area === '' || area === ownAreaId) {
      const back = both ? asReturnWormhole(ownRows, pid, '', portalId) : ownRows;
      updateConfig({ portalKinds: back });
      return;
    }
    updateConfig({ portalKinds: ownRows });
    const mac = logic.state.multiAreaConfig;
    const other = mac.areas.find(a => a.id === area);
    if (!other) return;
    const otherCfg: MapConfig = { ...other.mapConfig, portalKinds: asReturnWormhole(other.mapConfig.portalKinds, pid, ownAreaId, portalId) };
    const newAreas = mac.areas.map(a => (a.id === area ? { ...a, mapConfig: otherCfg } : a));
    logic.updateState({ multiAreaConfig: { ...mac, areas: newAreas }, mapConfig: area === newAreas[0]?.id ? otherCfg : logic.state.mapConfig });
  };

  return (
    <div className="space-y-2">
      <SelectRow label="Type" help={TIP_TYPE} value={kind} onChange={setKind} options={TYPE_OPTIONS} />
      <Reveal when={wh}>
        <div className="space-y-2">
          <SelectRow label="Exit Portal" help={TIP_EXIT} value={exitValue} onChange={setExit} options={exitOptions} />
          <ToggleItem label="Linked Both Ways" checked={row?.bothWays !== false} onChange={v => save({ bothWays: v })} desc={TIP_BOTH_WAYS} />
        </div>
      </Reveal>
      {MISSING_MODES.ON !== 0 && (
        <Reveal when={!wh}>
          <SelectRow label="Leads To" help={TIP_LEADS_TO} value={row?.toMode ?? ''} onChange={v => save({ toMode: v || undefined })} options={leadsToOptions()} />
        </Reveal>
      )}
      {MISSING_MODES.ON !== 0 && (
        <SelectRow label="Appears Only In" help={TIP_APPEARS_IN} value={String(row?.inArea ?? -1)} onChange={v => save({ inArea: Number(v) >= 0 ? Number(v) : undefined })}
          options={[{ value: '-1', label: 'Anywhere' }, ...editZones(config).filter(z => typeof z.uid === 'number' && z.name).map(z => ({ value: String(z.uid), label: z.name as string }))]} />
      )}
      <ToggleItem label="Invisible" checked={row?.invisible ?? pre.invisible} onChange={v => save({ invisible: v })} desc={TIP_INVISIBLE} />
      <ToggleItem label="Show Name" checked={row?.showName ?? true} onChange={v => save({ showName: v })} desc="The name of the area or game mode it leads to, above it." />
      {MISSING_MODES.ON !== 0 && <PortalLookRows row={row} save={save} />}
    </div>
  );
};

const TIP_THEME = 'On: its rings and the particles drawn into it wear this colour, never its black middle. Off: white, or the colour of its game mode for a black hole into another mode.';
const TIP_PCOUNT = 'Each time it appears it has up to this much more or fewer particles. 0: always the same number.';
const TIP_PSPEED = 'Each time it appears its particles move up to this much faster or slower. 0: always the same speed.';
const PortalLookRows: React.FC<{ row: PortalKindConfig | undefined; save: (patch: Partial<PortalKindConfig>) => void }> = ({ row, save }) => {
  const on = row?.theme === true;
  const value: ColorMapValue = { color: row?.themeHex ?? '#ffffff', colorMap: row?.themeUseMap === true && typeof row.themeMap === 'number' ? row.themeMap : CM_FREE, colorFree: undefined };
  const setValue = (v: ColorMapValue) => {
    const named = typeof v.colorMap === 'number' && v.colorMap >= 0;
    save({ theme: true, themeUseMap: named, themeMap: named ? v.colorMap : undefined, themeHex: /^#[0-9a-fA-F]{6}$/.test(v.color) ? v.color : undefined });
  };
  return (
    <div className="space-y-2">
      <ToggleItem label="Theme Colour" checked={on} onChange={v => save({ theme: v || undefined })} desc={TIP_THEME} />
      <Reveal when={on}>
        <div className="space-y-2">
          <ColorMapControl value={value} use={CM_USE.GENERAL} onChange={setValue} label="Its Colour" help={TIP_THEME} />
          <ColorMapSwitch value={value} use={CM_USE.GENERAL} onChange={setValue} />
        </div>
      </Reveal>
      <SliderRow label="Particle Count Randomness" value={row?.particleCountRand ?? PORTAL_PARTICLE_RAND_DEFAULT} onChange={v => save({ particleCountRand: v })} min={0} max={100} step={1} suffix="%" tooltip={TIP_PCOUNT} />
      <SliderRow label="Particle Speed Randomness" value={row?.particleSpeedRand ?? PORTAL_PARTICLE_RAND_DEFAULT} onChange={v => save({ particleSpeedRand: v })} min={0} max={100} step={1} suffix="%" tooltip={TIP_PSPEED} />
    </div>
  );
};

export const PortalPhysicsRows: React.FC<CommonProps> = ({ config, updateConfig, portalId }) => {
  const { row, pre, wh, save } = usePortalKind(config, portalId, updateConfig);
  const resetPhysics = () => {
    if (!row) return;
    const { reach, reachSquare, pull, jump, exitDistance, exitThrow, keepSpeed, shapes, rounds, emitAngle, ...keep } = row;
    void reach; void reachSquare; void pull; void jump; void exitDistance; void exitThrow; void keepSpeed; void shapes; void rounds; void emitAngle;
    updateConfig({ portalKinds: [...(config.portalKinds || []).filter(r => r.portalId !== portalId), keep as PortalKindConfig] });
  };
  const thingOptions = (w: boolean): SelectOption[] => (['push', 'destroy', 'pullDestroy', 'pullThrough'] as PortalThingsWord[])
    .filter(t => w || t !== 'pullThrough').map(t => ({ value: t, label: THINGS_LABEL[t] }));
  const reach = row?.reach ?? pre.reach, square = row?.reachSquare ?? pre.reachSquare;
  const pull = Math.round((row?.pull ?? pre.pull) * 100), jump = row?.jump ?? pre.jump;
  const exitDist = row?.exitDistance ?? pre.exitDistance, thr = Math.round((row?.exitThrow ?? pre.exitThrow) * 100);
  const keepSpeed = row?.keepSpeed ?? pre.keepSpeed;
  const emit = row?.emitAngle;
  const setEmit = (on: boolean) => {
    if (on) { save({ emitAngle: 0 }); return; }
    if (!row) return;
    const { emitAngle, ...rest } = row; void emitAngle;
    updateConfig({ portalKinds: [...(config.portalKinds || []).filter(r => r.portalId !== portalId), rest as PortalKindConfig] });
  };
  const shapes = row?.shapes ?? pre.shapes, rounds = row?.rounds ?? pre.rounds;

  return (
    <div className="space-y-2">
      <SliderRow label="Pull Reach" value={reach} onChange={v => save({ reach: v })} min={20} max={1000} step={5} tooltip={TIP_REACH} />
      <SelectRow label="Reach Shape" help={TIP_SHAPE} value={square ? 'square' : 'circle'} onChange={v => save({ reachSquare: v === 'square' })} options={REACH_SHAPE_OPTIONS} />
      <SliderRow label="Pull Strength" value={pull} onChange={v => save({ pull: v / 100 })} min={0} max={300} step={5} suffix="%" tooltip={TIP_PULL} />
      <SliderRow label="Jump Radius" value={jump} onChange={v => save({ jump: v })} min={1} max={150} step={1} tooltip={TIP_JUMP} />
      <Reveal when={wh}>
        <div className="space-y-2">
          <SliderRow label="Exit Distance" value={exitDist} onChange={v => save({ exitDistance: v })} min={0} max={400} step={5} tooltip={TIP_EXIT_DIST} />
          <SliderRow label="Exit Throw" value={thr} onChange={v => save({ exitThrow: v / 100 })} min={0} max={300} step={5} suffix="%" tooltip={TIP_THROW} />
          <ToggleItem label="Keep Speed" checked={keepSpeed} onChange={v => save({ keepSpeed: v })} desc={TIP_KEEP} />
          <ToggleItem label="Fixed Emit Direction" checked={emit !== undefined} onChange={setEmit} desc={TIP_EMIT_FIXED} />
          <Reveal when={emit !== undefined}>
            <FieldRow label="Emit Direction" help={TIP_EMIT}>
              <DirectionDial value={emit ?? 0} onChange={d => save({ emitAngle: d })} label="Emit Direction" />
            </FieldRow>
          </Reveal>
        </div>
      </Reveal>
      <SelectRow label="Food Shapes" help={TIP_SHAPES} value={shapes} onChange={v => save({ shapes: v as PortalThingsWord })} options={thingOptions(wh)} />
      <SelectRow label="Projectiles" help={TIP_ROUNDS} value={rounds} onChange={v => save({ rounds: v as PortalThingsWord })} options={thingOptions(wh)} />
      <button type="button" onClick={resetPhysics} disabled={!row} className="k-btn k-btn-secondary k-btn-sm w-full">
        Use the type&apos;s settings
      </button>
    </div>
  );
};

export const PortalLevelRow: React.FC<CommonProps> = ({
  logic, config, updateConfig, activeArea, isMultiArea, portalId, label, variant = 'numbered',
}) => {
  const lc = (config.portalLevels || []).find(l => l.portalId === portalId);
  const reqLevel = lc?.requireLevel || 0;

  const saveLevelToConfig = (level: number) => {
    const clamped = Math.max(0, Math.min(100, Math.floor(level) || 0));
    const levels = [...(config.portalLevels || [])];
    const idx = levels.findIndex(l => l.portalId === portalId);
    if (idx >= 0) {
      levels[idx] = { ...levels[idx], requireLevel: clamped };
    } else {
      levels.push({ portalId, requireLevel: clamped });
    }
    updateConfig({ portalLevels: levels });
    const portal = findRuntimePortal(logic, portalId, isMultiArea, activeArea);
    if (portal) portal.requireLevel = clamped;
  };

  return (
    <FieldRow label={variant === 'named' || !label ? 'Require Level' : `${label} Require Level`} help={TIP_LEVEL}>
      <NumberBox inputMode="numeric" value={reqLevel} min={0} max={100}
        onChange={e => saveLevelToConfig(parseInt(e.target.value, 10))} className="k-field k-num-box text-center" />
    </FieldRow>
  );
};

export function portalLeads(cfg: MapConfig, portalId: number, isMultiArea: boolean, areas: readonly AreaConfig[] = [], ownAreaId?: string): boolean {
  const k = (cfg.portalKinds || []).find(r => r.portalId === portalId);
  if (k?.kind === 'wormhole') return portalExitExists(k, cfg, areas, ownAreaId);
  return isMultiArea && (cfg.portalLinks || []).some(l => l.portalId === portalId && !!l.destinationAreaId);
}

export const PortalBotOddsRow: React.FC<CommonProps> = ({
  logic, config, updateConfig, activeArea, isMultiArea, portalId, label, variant = 'numbered',
}) => {
  const oc = (config.portalBotOdds || []).find(o => o.portalId === portalId);
  const odds = oc && Number.isFinite(oc.odds) ? oc.odds : PORTAL_BOT_ODDS_DEFAULT;
  const saveOdds = (v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v) || 0));
    const rows = (config.portalBotOdds || []).filter(o => o.portalId !== portalId);
    rows.push({ ...(oc ?? {}), portalId, odds: clamped });
    updateConfig({ portalBotOdds: rows });
    const portal = findRuntimePortal(logic, portalId, isMultiArea, activeArea);
    if (portal) portal.botOdds = clamped;
  };
  const saveMore = (patch: Partial<PortalBotOddsConfig>) => {
    const rows = (config.portalBotOdds || []).filter(o => o.portalId !== portalId);
    const next: PortalBotOddsConfig = { ...(oc ?? { portalId, odds }), ...patch, portalId };
    for (const k of Object.keys(patch) as (keyof PortalBotOddsConfig)[]) if (patch[k] === undefined) delete next[k];
    rows.push(next);
    updateConfig({ portalBotOdds: rows });
  };
  const odds2 = oc?.highLevel !== undefined;
  return (
    <div className="space-y-2">
      <SliderRow label={variant === 'named' ? 'Bot Odds' : label ? `${label} Bot Odds` : 'Bot Odds'} value={odds} onChange={saveOdds}
        min={0} max={100} step={5} suffix="%" tooltip={TIP_BOT_ODDS} />
      {MISSING_MODES.ON !== 0 && <>
        <ToggleItem label="Bots Know Where It Is" checked={oc?.known === true} onChange={v => saveMore({ known: v || undefined })} desc={TIP_BOT_KNOWN} />
        <ToggleItem label="Other Odds From A Level" checked={odds2} onChange={v => saveMore(v ? { highLevel: 45, oddsHigh: odds } : { highLevel: undefined, oddsHigh: undefined })} desc={TIP_BOT_LEVEL} />
        <Reveal when={odds2}>{() => <div className="space-y-2">
          <SliderRow label="From Level" value={oc!.highLevel ?? 45} onChange={v => saveMore({ highLevel: Math.max(1, Math.round(v)) })} min={1} max={195} step={1} tooltip="Bots at this level or higher take the odds below instead." />
          <SliderRow label="Odds From That Level" value={oc!.oddsHigh ?? odds} onChange={v => saveMore({ oddsHigh: Math.max(0, Math.min(100, Math.round(v))) })} min={0} max={100} step={5} suffix="%" tooltip="The chance a bot of that level or higher goes through it when it sees it, or when it knows where it is." />
        </div>}</Reveal>
        <ToggleItem label="Own Dreadnought Odds" checked={oc?.dreadShare !== undefined} onChange={v => saveMore({ dreadShare: v ? 100 : undefined })} desc={TIP_BOT_DREAD} />
        <Reveal when={oc?.dreadShare !== undefined}>{() => (
          <SliderRow label="Dreadnought Odds" value={oc!.dreadShare ?? 100} onChange={v => saveMore({ dreadShare: Math.max(0, Math.min(100, Math.round(v))) })} min={0} max={100} step={5} suffix="%" tooltip="A Dreadnought's chance is this share of the Bot Odds. 0: a Dreadnought never takes it." />
        )}</Reveal>
      </>}
    </div>
  );
};

const TIP_BOT_KNOWN = 'On: bots know where it is. They head for it from anywhere in its area by the map\'s paths, without seeing it, and keep at it longer. The Forge\'s black hole in the Nexus has it on.';
const TIP_BOT_LEVEL = 'On: bots at a level or higher take it with other odds, the two rows below. The black holes to the Nexus send tanks past level 45 on most times.';
const TIP_BOT_DREAD = 'On: a Dreadnought takes it with a share of the Bot Odds, the row below. Off: as every bot (in Old Dreadnoughts its own Dreadnoughts never go back to its Forge).';

const TIP_BOSS_BLACKLIST = 'Bosses never go through this portal: they keep away from it, are pushed out of it and never travel, whatever Bosses Use Portals and their level say. Only works on bosses that spawned through the boss spawn system.';

export const PortalBossBlacklistRow: React.FC<CommonProps> = ({
  logic, config, updateConfig, activeArea, isMultiArea, portalId, label, variant = 'numbered',
}) => {
  const row = (config.portalBossBlacklist || []).find(r => r.portalId === portalId);
  const on = row?.on === true;
  const save = (v: boolean) => {
    const rows = (config.portalBossBlacklist || []).filter(r => r.portalId !== portalId);
    rows.push({ portalId, on: v });
    updateConfig({ portalBossBlacklist: rows });
    const portal = findRuntimePortal(logic, portalId, isMultiArea, activeArea);
    if (portal) portal.bossBlacklist = v;
  };
  return (
    <ToggleItem label={variant === 'named' ? 'Blacklist Bosses' : label ? `${label} Blacklist Bosses` : 'Blacklist Bosses'} checked={on}
      onChange={save} desc={TIP_BOSS_BLACKLIST} />
  );
};
