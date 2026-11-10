import React from 'react';
import type { CustomProjectileDesign, ProjectileTypeConfig } from '../../types';
import { designFits } from '../../game/roundLayers';
import { LAYER_CAP_REASON, LAYER_CAP_HELP } from '../shared/labels';
import { isCarriedDesign } from '../shared/projectileDesignPick';
import { tankInNames } from './libraryPickTanks';
import type { LibMode } from './libraryModes';
import type { LibEntry } from './catalog';
import type { LibraryItem } from '../../types';
import { SwapText } from '../kit/Collapse';

export function designPickPatch(design: CustomProjectileDesign): Partial<ProjectileTypeConfig> {
  return {
    customProjectileDesignName: design.name,
    customProjectileDesign: design,
    shape: design.shape,
    size: design.size,
    useMuzzleSize: design.useMuzzleSize,
    color: design.color,
    useTankColor: design.useTankColor,
    trapDepth: design.trapDepth ?? 0,
    trapCurved: design.trapCurved ?? false,
    tankAsProjectile: undefined,
    tankAsProjectileCycle: undefined,
    cycleProjectilesEnabled: false,
  };
}

export interface ProjectilePickArgs {
  pt: ProjectileTypeConfig;
  roundLayer: number;
  cycleEnabled: boolean;
  cycleCount: number;
  selectedTankNames: ReadonlySet<string>;
  hasTankSelection: boolean;
  hasCPDSelection: boolean;
  handleTankSelect: (name: string) => void;
  pickDesign: (design: CustomProjectileDesign) => boolean;
  onDone: () => void;
  chosenTankCollection?: string;
  library?: readonly { id?: string; fileData: { data: unknown } }[];
  wordOf?: (item: LibraryItem) => string;
  isTankPicked?: (e: LibEntry) => boolean;
}

export function projectilePickMode(a: ProjectilePickArgs): LibMode {
  return {
    place: 'projectile', title: 'Choose a Projectile',
    subtitle: a.cycleEnabled ? 'Click tanks to add them to the cycle, or pick a projectile' : 'A tank or a projectile this gun fires',
    kinds: ['tank', 'projectile'], startKind: 'projectile',
    presetFilter: a.chosenTankCollection ? { kind: 'tank', picks: [['collection', a.chosenTankCollection]] } : undefined,
    isChosen: (e) => e.kind === 'tank' ? (a.isTankPicked ? a.isTankPicked(e) : tankInNames(e, a.selectedTankNames))
      : (e.kind === 'projectile' && !!e.item && isCarriedDesign(a.pt.customProjectileDesignName, a.pt.customProjectileDesign, e.item.fileData.data as CustomProjectileDesign, a.library ?? [])),
    chosenSection: { title: 'Active' },
    lockOf: (e) => (e.kind === 'projectile' && e.item && !designFits(a.roundLayer, e.item.fileData.data as CustomProjectileDesign)
      ? LAYER_CAP_REASON + '. ' + LAYER_CAP_HELP : null),
    actionsOf: (e) => {
      if (e.kind === 'tank' && e.item) {
        const on = a.isTankPicked ? a.isTankPicked(e) : tankInNames(e, a.selectedTankNames);
        return [{ id: 'tank', label: on ? 'Remove' : (a.cycleEnabled ? 'Add to the Cycle' : 'Choose'), run: () => { a.handleTankSelect(a.wordOf ? a.wordOf(e.item!) : e.item!.name); return !a.cycleEnabled && !on; } }];
      }
      if (e.kind === 'projectile' && e.item) {
        const d = e.item.fileData.data as CustomProjectileDesign;
        return [{ id: 'design', label: 'Choose', run: () => {
          if (!designFits(a.roundLayer, d)) return false;
          a.pickDesign(d);
          return true;
        } }];
      }
      return [];
    },
    footer: a.cycleEnabled ? (close) => (
      <div className="flex items-center gap-3 px-5 py-3">
        <span className="text-[12px] text-[var(--text-tertiary)] mr-auto"><SwapText>{`${a.cycleCount} ${a.cycleCount === 1 ? 'tank' : 'tanks'} in the cycle`}</SwapText></span>
        <button type="button" onClick={() => close(a.onDone)} className="k-btn k-btn-primary k-btn-lg min-w-[112px]">Done</button>
      </div>
    ) : undefined,
  };
}
