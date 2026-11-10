import React from 'react';
import type { GameLogic } from '../game/GameLogic';
import { DEFAULT_PROJECTILE_TYPE } from '../types';
import type { Turret, ExplodeConfig, BehaviorConfig, MotionType, ProjectileTypeConfig, CustomProjectileDesign, LibraryItem } from '../types';
import { getFragmentAt, updateAtPath, cloneRing, EXPLODE_MAX_RINGS } from '../game/explode';
import { explodeSeedFits } from '../game/roundLayers';
import { useEscapeOwner } from './shared/escapeStack';
import { TurretPropertiesEditor } from './shared/TurretPropertiesEditor';
import { ProjectileTypeEditor } from './shared/ProjectileTypeEditor';
import { BehaviorEditor } from './shared/BehaviorEditor';
import { Group, Crumbs, headerIcon } from './kit/kit';
import { HdBomb } from './ui/icons';

export function fragmentRoundLayer(hostLayer: number, path: readonly number[]): number {
  return hostLayer + path.length;
}

export function explodeWithAddedRing(root: Turret, path: readonly number[], logic: GameLogic, hostLayer: number): ExplodeConfig | undefined {
  const f = getFragmentAt(root, path);
  const ex = f ? f.explode : undefined;
  if (!f || !ex || !Array.isArray(ex.rings) || ex.rings.length >= EXPLODE_MAX_RINGS) return undefined;
  const layer = fragmentRoundLayer(hostLayer, path);
  if (ex.rings.length === 0 && !explodeSeedFits(layer, f)) return undefined;
  const ring = ex.rings.length > 0 ? cloneRing(ex.rings[ex.rings.length - 1]) : logic.createExplodeRing(f, layer);
  return updateAtPath(root, path, { explode: { ...ex, rings: [...ex.rings, ring] } });
}

export function explodeWithSeed(root: Turret, path: readonly number[], logic: GameLogic, hostLayer: number): ExplodeConfig | undefined {
  const f = getFragmentAt(root, path);
  if (!f) return undefined;
  const layer = fragmentRoundLayer(hostLayer, path);
  if (!explodeSeedFits(layer, f)) return undefined;
  return updateAtPath(root, path, { explode: logic.createExplodeConfig(f, layer) });
}

interface SectionOpenState { projectileType: boolean; behaviors: boolean }

interface Props {
  root: Turret;
  getRoot: () => Turret;
  path: number[];
  onPathChange: (path: number[]) => void;
  onRootExplodeChange: (ex: ExplodeConfig | undefined) => void;
  crumbsBefore: { label: string; onClick: () => void }[];
  logic: GameLogic;
  projectileDesigns: CustomProjectileDesign[];
  tankLibrary: LibraryItem[];
  getSectionState: (key: string) => SectionOpenState;
  onSectionChange: () => void;
  deriveMotionType: (behaviors: BehaviorConfig[]) => MotionType | null;
  escapeEnabled: boolean;
  hostLayer: number;
}

export const FragmentEditorPanel: React.FC<Props> = ({
  root, getRoot, path, onPathChange, onRootExplodeChange, crumbsBefore, logic,
  projectileDesigns, tankLibrary, getSectionState, onSectionChange, deriveMotionType, escapeEnabled,
  hostLayer,
}) => {
  const frag = path.length > 0 ? getFragmentAt(root, path) : null;
  const layer = fragmentRoundLayer(hostLayer, path);

  useEscapeOwner(() => onPathChange(path.slice(0, -1)), escapeEnabled && frag !== null);

  if (!frag) return null;

  const write = (build: (live: Turret) => Partial<Turret> | null) => {
    const liveRoot = getRoot();
    const live = getFragmentAt(liveRoot, path);
    if (!live) return;
    const updates = build(live);
    if (!updates) return;
    const ex = updateAtPath(liveRoot, path, updates);
    if (ex) onRootExplodeChange(ex);
  };
  const writeRootEx = (ex: ExplodeConfig | undefined) => { if (ex) onRootExplodeChange(ex); };

  const pt = frag.projectileType || DEFAULT_PROJECTILE_TYPE;
  const updatePT = (updates: Partial<ProjectileTypeConfig>) =>
    write(live => ({ projectileType: { ...(live.projectileType || DEFAULT_PROJECTILE_TYPE), ...updates } }));

  const levelCrumbs: string[] = [];
  for (let k = 1; k <= path.length; k++) {
    const bomb = getFragmentAt(root, path.slice(0, k - 1));
    const nRings = bomb && bomb.explode && Array.isArray(bomb.explode.rings) ? bomb.explode.rings.length : 0;
    levelCrumbs.push(nRings >= 2 ? `Ring ${path[k - 1] + 1} Fragment` : 'Fragment');
  }

  const ss = getSectionState('frag:' + path.join('.'));

  return (
    <>
      <Crumbs items={[
        ...crumbsBefore.map(c => ({ label: c.label, onClick: c.onClick })),
        ...levelCrumbs.map((label, i) => (i === levelCrumbs.length - 1 ? { label } : { label, onClick: () => onPathChange(path.slice(0, i + 1)) })),
      ]} />

      <Group title={levelCrumbs[levelCrumbs.length - 1] ?? 'Fragment'} icon={headerIcon(HdBomb)}>
        <TurretPropertiesEditor part="size" turret={frag} onUpdate={(updates) => write(() => updates)} fragmentMode={true} />
        <TurretPropertiesEditor part="firing" turret={frag} onUpdate={(updates) => write(() => updates)} fragmentMode={true} />
        <TurretPropertiesEditor part="bullet" turret={frag} onUpdate={(updates) => write(() => updates)} fragmentMode={true} />
      </Group>

        <ProjectileTypeEditor
          projectileType={pt}
          onUpdate={updatePT}
          projectileDesigns={projectileDesigns}
          tankLibrary={tankLibrary}
          onBehaviorsReset={(behaviors) => write(() => ({ projectileBehaviors: behaviors }))}
          onTurretReset={(updates) => write(() => updates)}
          behaviors={frag.projectileBehaviors || []}
          onBehaviorUpdate={(behaviorType, updates) => write(live => ({
            projectileBehaviors: (live.projectileBehaviors || []).map(b => b.type === behaviorType ? { ...b, ...updates } : b),
          }))}
          sectionOpen={ss.projectileType}
          onSectionToggle={(v) => { ss.projectileType = v; onSectionChange(); }}
          healerToggle={frag.healer ?? false}
          onToggleHealer={(v) => write(() => ({ healer: v }))}
          fragmentMode={true}
          roundLayer={layer}
          logic={logic}
        />

        <BehaviorEditor
          behaviors={frag.projectileBehaviors || []}
          onUpdate={(behaviors) => write(live => {
            const derived = deriveMotionType(behaviors);
            return derived
              ? { projectileBehaviors: behaviors, projectileType: { ...(live.projectileType || DEFAULT_PROJECTILE_TYPE), motionType: derived } }
              : { projectileBehaviors: behaviors };
          })}
          sectionOpen={ss.behaviors}
          onSectionToggle={(v) => { ss.behaviors = v; onSectionChange(); }}
          explode={frag.explode}
          onExplodeChange={(ex) => write(() => ({ explode: ex }))}
          onAddExplode={() => writeRootEx(explodeWithSeed(getRoot(), path, logic, hostLayer))}
          onAddRing={() => writeRootEx(explodeWithAddedRing(getRoot(), path, logic, hostLayer))}
          onEditFragment={(i) => onPathChange([...path, i])}
          explodeLevel={path.length + 1}
          bombTurret={frag}
          tankLibrary={tankLibrary}
          roundLayer={layer}
        />
    </>
  );
};
