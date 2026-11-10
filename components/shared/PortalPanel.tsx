import React from 'react';
import type { GameLogic } from '../../game/GameLogic';
import type { MapConfig, AreaConfig, PlacedPortal } from '../../types';
import { ToggleItem } from './mapDesignerControls';
import { PortalLinkRow, PortalTimingRow, PortalLevelRow, PortalKindRows, PortalPhysicsRows, PortalBotOddsRow, PortalBossBlacklistRow, portalLeads } from './PortalSettings';
import { Reveal } from '../kit/Collapse';
import { SelectRow } from '../kit/kit';
import { editZones, opUpdatePortal, opPortalAppear, portalAppearOf } from '../../game/MapEditor';
import { PLACED_PORTALS } from '../../game/placedPortalsSwitch';
import { SMALL_FIX } from '../../game/smallFixSwitch';

interface Props {
  logic: GameLogic;
  config: MapConfig;
  updateConfig: (partial: Partial<MapConfig>) => void;
  activeArea: AreaConfig | null;
  isMultiArea: boolean;
  areas: AreaConfig[];
  areaId: string;
  portal: PlacedPortal;
  apply: (mutate: (cfg: MapConfig) => void) => void;
}

export const PortalPanel: React.FC<Props> = ({ logic, config, updateConfig, activeArea, isMultiArea, areas, areaId, portal, apply }) => {
  const id = portal.id;
  const appear = portalAppearOf(config, portal);
  const legacyMoving = portal.appear === undefined && appear === 'fixed' && !portal.staticPos;
  const areaOptions = editZones(config).filter(z => typeof z.uid === 'number').map(z => ({ value: String(z.uid), label: z.name ?? 'Custom Area' }));
  return (
    <div className="space-y-2">
      <PortalKindRows logic={logic} config={config} updateConfig={updateConfig} activeArea={activeArea} isMultiArea={isMultiArea} portalId={id} variant="named" areas={areas} />
      <Reveal when={isMultiArea && areas.length > 1 && (config.portalKinds || []).find(r => r.portalId === id)?.kind !== 'wormhole'}>
        <PortalLinkRow logic={logic} config={config} updateConfig={updateConfig} activeArea={activeArea} isMultiArea={isMultiArea} portalId={id} variant="named" areas={areas} />
      </Reveal>
      <div className="space-y-2">
        <Reveal when={PLACED_PORTALS.ON !== 0}>{() => (
          <>
            <SelectRow label="Where It Appears"
              help="Fixed Here: always on its own cell. Anywhere On The Map: a place of its own on each new map, never on a wall, a rock, a base or another portal, and a new one after each hidden phase. In An Area: somewhere inside the area you pick, even at the start (its own cell does not count)."
              value={legacyMoving ? 'legacy' : appear}
              options={[{ value: 'fixed', label: 'Fixed Here' }, { value: 'map', label: 'Anywhere On The Map' }, { value: 'area', label: 'In An Area' }, ...(legacyMoving ? [{ value: 'legacy', label: 'Here, Then Anywhere' }] : [])]}
              onChange={v => { if (v === 'fixed' || v === 'map') apply(cfg => opPortalAppear(cfg, id, v)); else if (v === 'area' && areaOptions.length > 0) apply(cfg => opPortalAppear(cfg, id, 'area', typeof portal.inArea === 'number' ? portal.inArea : Number(areaOptions[0].value))); }} />
            <Reveal when={appear === 'area'}>{() => (
              <SelectRow label="Area" help="The Custom Area it appears in. Draw one with the Custom Area tool first."
                value={typeof portal.inArea === 'number' ? String(portal.inArea) : ''} options={areaOptions}
                onChange={v => apply(cfg => opPortalAppear(cfg, id, 'area', Number(v)))} />
            )}</Reveal>
          </>
        )}</Reveal>
        <Reveal when={PLACED_PORTALS.ON === 0}>
          <ToggleItem label="Static Position" checked={portal.staticPos} onChange={v => apply(cfg => opUpdatePortal(cfg, id, v))}
            desc="On: always reopens here. Off: reopens somewhere random on the map after each hidden phase (turn Timed on for that)." />
        </Reveal>
        <PortalTimingRow logic={logic} config={config} updateConfig={updateConfig} activeArea={activeArea} isMultiArea={isMultiArea} portalId={id} variant="named" />
        <PortalLevelRow logic={logic} config={config} updateConfig={updateConfig} activeArea={activeArea} isMultiArea={isMultiArea} portalId={id} variant="named" />
        <Reveal when={portalLeads(config, id, isMultiArea, SMALL_FIX.R826 ? areas : undefined, SMALL_FIX.R826 ? areaId : undefined)}>
          <PortalBotOddsRow logic={logic} config={config} updateConfig={updateConfig} activeArea={activeArea} isMultiArea={isMultiArea} portalId={id} variant="named" />
          <PortalBossBlacklistRow logic={logic} config={config} updateConfig={updateConfig} activeArea={activeArea} isMultiArea={isMultiArea} portalId={id} variant="named" />
        </Reveal>
      </div>
      <PortalPhysicsRows logic={logic} config={config} updateConfig={updateConfig} activeArea={activeArea} isMultiArea={isMultiArea} portalId={id} variant="named" />
    </div>
  );
};
