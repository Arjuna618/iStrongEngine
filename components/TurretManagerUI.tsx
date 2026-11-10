import React, { useRef, useMemo, useState, useEffect } from 'react';
import { SMALL_FIX } from '../game/smallFixSwitch';
import { GameLogic, GRID_SPACING } from '../game/GameLogic';
import { DEFAULT_PROJECTILE_TYPE, ProjectileTypeConfig, Turret, BehaviorConfig, MotionType } from '../types';
import { Shapes, ArrowLeft, HdRectangleCircle, HdDashboardSquareSetting, HdArrowAllDirection, HdPaintBoard, HdAsteroid02, HdAiElements, HdAiDrawing, HdMouseRightClick04, HdTarget01, HdDashboardSpeed01, HdCaduceus, HdEye, HdJoker } from './ui/icons';
import { Group, Button, SelectRow, Crumbs, headerIcon } from './kit/kit';
import { Reveal, PageSwap, SwapBox } from './kit/Collapse';

import { InstalledTurretsList, NewGroupButton } from './shared/InstalledTurretsList';
import { TurretPropertiesEditor, turretPropsPartShows, type TurretPropsPart } from './shared/TurretPropertiesEditor';
import { TurretTypeEditor, turretTypePartShows, type TurretTypePart } from './shared/TurretTypeEditor';
import { ProjectileTypeEditor } from './shared/ProjectileTypeEditor';
import { BehaviorEditor } from './shared/BehaviorEditor';
import { TurretActionBar, turretActionPartShows, type TurretActionPart } from './shared/TurretActionBar';
import type { SelectOption } from './shared/CustomSelect';
import { otherPartCount } from '../utils/otherDraw';
import { useToast } from './ui/Toast';
import { ScrollArea } from './ui/ScrollArea';
import { FragmentEditorPanel, explodeWithAddedRing, explodeWithSeed } from './FragmentEditorPanel';
import { getFragmentAt } from '../game/explode';
import { LibraryWindowSlot, useOpenFlag } from './library/LibraryWindowSlot';
import { ContentLibraryButton } from './library/ContentLibraryButton';
import { canvasLibraryDoor } from './shell/doors';
import { PlacementBar } from './shell/PlacementBar';
import { HistoryGroup } from './shared/HistoryPanel';
import { PresetGroupControls } from './shared/PresetGroupControls';
import { canvasMode } from './library/libraryModes';
import type { Tool } from './shell/engineTools';

const OTHER_SHOWN_BIGGER_BELOW = 90;

const TANK_GUN_ROUND_LAYER = 1;

function deriveMotionTypeForUI(behaviors: BehaviorConfig[]): MotionType | null {
  for (let i = 0; i < behaviors.length; i++) {
    const b = behaviors[i];
    if (!b.enabled) continue;
    switch (b.type) {
      case 'motionGlide':      return 'glide';
      case 'motionMotor':      return 'motor';
      case 'motionChase':      return 'chase';
      case 'motionSwarm':      return 'swarm';
      case 'motionGrow':       return 'grow';
      case 'motionWithMaster': return 'withMaster';
    }
  }
  return null;
}

interface Props {
  logic: GameLogic | null;
  onUpdate: () => void;
  className?: string;
  panelVisible?: boolean;
  showTool?: (tool: Tool) => void;
}

interface SectionStates { turretType: boolean; projectileType: boolean; behaviors: boolean }

interface FragDrill { owner: string; path: number[] }

export const TurretManagerUI: React.FC<Props> = ({ logic, onUpdate, className, panelVisible, showTool }) => {
  const sectionStatesRef = useRef<Map<string, SectionStates>>(new Map());
  const getSectionState = (key: string): SectionStates => {
    let st = sectionStatesRef.current.get(key);
    if (!st) { st = { turretType: false, projectileType: false, behaviors: false }; sectionStatesRef.current.set(key, st); }
    return st;
  };

  const libFlag = useOpenFlag();
  useEffect(() => { canvasLibraryDoor.set(() => libFlag.set(true)); return () => canvasLibraryDoor.set(null); }, [libFlag]);
  const [fragDrill, setFragDrill] = useState<FragDrill | null>(null);
  const { showToast } = useToast();
  const _ls = logic ? logic.state : null;
  const libMode = useMemo(() => (logic ? canvasMode({ logic, onUpdate, showToast, showTool }, 'canvas') : null),
    [logic, onUpdate, showToast, showTool, _ls?.canvasEntityKind, _ls?.viewingOther, _ls?.editingShape, _ls?.autoSubTurretEditMode, _ls?.isTestMode]);

  const _autoSnapActiveSides = logic ? logic.getActiveLayerSides() : 0;
  useEffect(() => {
    if (!logic) return;
    if (SMALL_FIX.R786) {
      if (logic.state.isTestMode || logic.placementSides === _autoSnapActiveSides) return;
      logic.placementSides = _autoSnapActiveSides;
    }
    const shouldSnap = _autoSnapActiveSides >= 3;
    const nextCount = _autoSnapActiveSides >= 3 ? _autoSnapActiveSides : 8;
    if (logic.state.snapPlacement !== shouldSnap) {
      logic.updateState({ snapPlacement: shouldSnap });
    }
    if (SMALL_FIX.R786 && logic.state.autoPlacementCount !== nextCount) {
      logic.updateState({ autoPlacementCount: nextCount });
    }
  }, [_autoSnapActiveSides, logic]);

  useEffect(() => {
    if (!logic || SMALL_FIX.R786) return;
    const nextCount = _autoSnapActiveSides >= 3 ? _autoSnapActiveSides : 8;
    if (logic.state.autoPlacementCount !== nextCount) {
      logic.updateState({ autoPlacementCount: nextCount });
    }
  }, [_autoSnapActiveSides, logic]);

  if (!logic) return null;
  return <PageSwap>{(() => {
  const s = logic.state;
  const t = s.editingTurret;
  const pt = t.projectileType || DEFAULT_PROJECTILE_TYPE;

  const layerOptions: SelectOption[] = [{ value: 'main', label: 'Main Body' }];
  for (let i = 0; i < s.bodyLayers.length; i++) {
    layerOptions.push({ value: s.bodyLayers[i].id, label: s.bodyLayers[i].label });
  }

  let inheritLayerLabels: Map<string, string> | undefined;
  if (s.inheritMode) {
    inheritLayerLabels = new Map<string, string>();
    for (let li = 0; li < s.bodyLayers.length; li++) {
      const layer = s.bodyLayers[li];
      for (let ti = 0; ti < layer.turretIds.length; ti++) {
        inheritLayerLabels.set(layer.turretIds[ti], layer.label);
      }
    }
  }

  const updateT = (updates: Partial<Turret>) => logic.updateEditingTurret(updates);

  const drillPathFor = (ownerKey: string, root: Turret): number[] | null => {
    if (fragDrill === null) return null;
    if (fragDrill.owner === ownerKey && fragDrill.path.length > 0 && getFragmentAt(root, fragDrill.path) !== null) return fragDrill.path;
    setFragDrill(null);
    return null;
  };
  const fragEscapeEnabled = panelVisible === true && !s.isTestMode;

  const _turretLayerMaxAliveActive = (() => {
    for (let i = 0; i < s.bodyLayers.length; i++) {
      if (s.bodyLayers[i].turretIds.indexOf(t.id) !== -1) {
        return !!(s.bodyLayers[i].maxAliveEnabled);
      }
    }
    return !!(s.globalMaxAliveEnabled);
  })();

  const selectedAngle = (() => {
    if (!s.selectedTurretId) return null;
    const sel = s.turrets.find(t => t.id === s.selectedTurretId);
    if (!sel) return null;
    if (sel.turretType === 'auto') {
      if (!sel.primarySubTurretId) return null;
      const primarySub = sel.autoSubTurrets.find(st => st.id === sel.primarySubTurretId);
      if (!primarySub) return null;
      return sel.angle + primarySub.angle;
    }
    return sel.angle;
  })();

  const activeSides = logic.getActiveLayerSides();
  const comboPreviewAngle = (s.autoPlacement && s.snapPlacement && activeSides >= 3 && !s.selectMode) ? 0 : null;

  const updatePT = (updates: Partial<ProjectileTypeConfig>) => {
    const current = t.projectileType || { ...DEFAULT_PROJECTILE_TYPE };
    updateT({ projectileType: { ...current, ...updates } });
  };

  const renderContentLibrary = () => (
    <>
      <ContentLibraryButton onClick={() => libFlag.set(true)} />
      <LibraryWindowSlot flag={libFlag} logic={logic} mode={libMode} />
    </>
  );

  const PAGE = 'p-4 space-y-3 overflow-x-hidden';

  const otherMode = !s.isTestMode && s.canvasEntityKind === 'other' && s.viewingOther !== null;
  if (otherMode && s.viewingOther) {
    const od = s.viewingOther;
    const parts = otherPartCount(od.body);
    return (
      <ScrollArea key="other" className={className || ''} contentClassName={PAGE}>
        {renderContentLibrary()}
        <Group title="Showing an Other" icon={headerIcon(HdJoker)}>
          <p className="k-card-title break-words">{od.name}</p>
          <p className="k-row-desc">
            {parts === 1 ? 'One shape.' : `${parts} shapes.`} It cannot be edited yet{od.size < OTHER_SHOWN_BIGGER_BELOW ? ', and it is shown bigger than it is so you can see it' : ''}.
          </p>
          <p className="k-row-desc">
            Your tank is kept exactly as it was. Only the Others are listed here until you return to it.
          </p>
          <Button block size="sm" icon={<ArrowLeft size={14} />} onClick={() => { logic.exitOtherViewing(); onUpdate(); }}>
            Back to Tank
          </Button>
        </Group>
      </ScrollArea>
    );
  }

  const shapeMode = !s.isTestMode && s.canvasEntityKind === 'shape' && s.editingShape !== null;
  if (shapeMode && s.editingShape) {
    const shapeName = s.editingShape.name;
    return (
      <ScrollArea key="shape" className={className || ''} contentClassName={PAGE}>
        {renderContentLibrary()}
        <Group title="Editing food shape" icon={headerIcon(Shapes)}>
          <p className="k-card-title break-words">{shapeName}</p>
          <p className="k-row-desc">
            Your tank is kept exactly as it was. Only food shapes are listed here until you return to it.
          </p>
          <Button block size="sm" icon={<ArrowLeft size={14} />} onClick={() => { logic.exitShapeEditing(); onUpdate(); }}>
            Back to Tank
          </Button>
        </Group>
      </ScrollArea>
    );
  }

  if (s.autoSubTurretEditMode) {
    const parentTurret = s.turrets.find(tt => tt.id === s.autoSubTurretParentId);
    if (!parentTurret) { logic.exitAutoSubTurretMode(); return null; }
    const parentIndex = s.turrets.findIndex(tt => tt.id === s.autoSubTurretParentId);

    const subT = s.autoSubTurretEditing;
    const subPT = subT.projectileType || DEFAULT_PROJECTILE_TYPE;

    const updateSubT = (updates: Partial<Turret>) => logic.updateAutoSubTurretEditing(updates);
    const updateSubPT = (updates: Partial<ProjectileTypeConfig>) => {
      const current = subT.projectileType || { ...DEFAULT_PROJECTILE_TYPE };
      updateSubT({ projectileType: { ...current, ...updates } });
    };

    const selectedSubAngle = s.autoSubTurretSelectedId
      ? (() => {
          const sub = parentTurret.autoSubTurrets.find(st => st.id === s.autoSubTurretSelectedId);
          return sub != null ? parentTurret.angle + sub.angle : null;
        })()
      : null;

    const subRoot = subT as Turret;
    const subOwnerKey = 'sub:' + parentTurret.id + ':' + (s.autoSubTurretSelectedId ?? 'ghost');
    const pickSub = (tur: Turret) => {
      logic.overlayResetCounter++;
      logic.saveSubGhostBeforePick();
      const { id, angle, animProgress, ...rest } = tur;
      logic.updateState({
        autoSubTurretSelectedId: tur.id,
        autoSubTurretSelectMode: true,
        autoSubTurretEditing: { ...rest },
        autoSubTurretMirrorMode: false,
        autoSubTurretAutoPlacement: false,
        autoSubTurretSnapPlacement: false,
      });
      onUpdate();
    };
    const subDrillPath = drillPathFor(subOwnerKey, subRoot);
    if (subDrillPath !== null) {
      const subIndex = s.autoSubTurretSelectedId
        ? parentTurret.autoSubTurrets.findIndex(st => st.id === s.autoSubTurretSelectedId)
        : -1;
      const leaveSubMode = () => { setFragDrill(null); logic.exitAutoSubTurretMode(); onUpdate(); };
      return (
        <ScrollArea key={'subfrag:' + parentTurret.id + ':' + subDrillPath.join('.')} className={className || ''} contentClassName={PAGE}>
          <FragmentEditorPanel
            root={subRoot}
            getRoot={() => logic.state.autoSubTurretEditing as Turret}
            hostLayer={TANK_GUN_ROUND_LAYER}
            path={subDrillPath}
            onPathChange={(p) => setFragDrill(p.length > 0 ? { owner: subOwnerKey, path: p } : null)}
            onRootExplodeChange={(ex) => updateSubT({ explode: ex })}
            crumbsBefore={[
              { label: 'Tank', onClick: leaveSubMode },
              { label: `Turret #${parentIndex + 1}`, onClick: leaveSubMode },
              { label: 'Sub-Turrets', onClick: () => setFragDrill(null) },
              { label: subIndex >= 0 ? `Sub-Turret #${subIndex + 1}` : 'Sub-Turret', onClick: () => setFragDrill(null) },
            ]}
            logic={logic}
            projectileDesigns={s.projectileDesigns}
            tankLibrary={s.tankLibrary || []}
            getSectionState={getSectionState}
            onSectionChange={onUpdate}
            deriveMotionType={deriveMotionTypeForUI}
            escapeEnabled={fragEscapeEnabled}
          />
        </ScrollArea>
      );
    }

    const subEditing = !!s.autoSubTurretSelectedId;
    const subDisabled = s.autoSubTurretSelectMode && !s.autoSubTurretSelectedId;
    const subSpawner = (!!subPT.tankAsProjectile || !!(subPT.cycleProjectilesEnabled && subPT.tankAsProjectileCycle?.length)) && !!subPT.tankAsProjectileUseAI;
    const subOrientation = s.autoSubTurretSelectedId ? (angleDeg: number) => {
      const sub = parentTurret.autoSubTurrets.find(st => st.id === s.autoSubTurretSelectedId);
      if (!sub) return;
      const newBodyRelAngle = angleDeg * Math.PI / 180;
      const newSubAngle = newBodyRelAngle - parentTurret.angle;
      const dist = Math.sqrt(sub.xOffset * sub.xOffset + sub.yOffset * sub.yOffset);
      updateSubT({
        angle: newSubAngle,
        xOffset: dist * Math.cos(newBodyRelAngle),
        yOffset: dist * Math.sin(newBodyRelAngle),
      } as Partial<Turret>);
      onUpdate();
    } : undefined;
    const subProps = (part: TurretPropsPart) => (
      <TurretPropertiesEditor
        turret={subT}
        onUpdate={updateSubT}
        part={part}
        showAboveBase
        disabled={subDisabled}
        selectedTurretAngle={selectedSubAngle}
        tankSpawnerMode={subSpawner}
        onOrientationChange={subOrientation}
      />
    );
    const subShows = (part: TurretPropsPart) => turretPropsPartShows(part, subT, { showAboveBase: true });
    const subTypeEd = (part: TurretTypePart) => (
      <TurretTypeEditor part={part} turret={subT} onUpdate={updateSubT} tankSize={s.tankSize} gridSpacing={GRID_SPACING} isSubTurret={true} />
    );
    const subBar = {
      mirrorMode: s.autoSubTurretMirrorMode,
      selectMode: s.autoSubTurretSelectMode,
      autoPlacement: s.autoSubTurretAutoPlacement,
      autoPlacementCount: s.autoSubTurretAutoPlacementCount,
      snapPlacement: s.autoSubTurretSnapPlacement,
      snapPlacementCount: s.autoSubTurretSnapPlacementCount,
      aboveTankBody: subT.aboveTankBody ?? false,
      bodySides: s.tankSides,
      hideAboveTankBody: true,
      hideHealerToggle: true,
      onToggleMirror: (v: boolean) => logic.updateState({ autoSubTurretMirrorMode: v }),
      onToggleCompass: (v: boolean) => {
        if (v) {
          const sides = s.tankSides;
          const max = sides >= 3 ? sides : 8;
          logic.updateState({ autoSubTurretAutoPlacement: v, autoSubTurretAutoPlacementCount: max });
        } else {
          logic.updateState({ autoSubTurretAutoPlacement: v });
        }
      },
      onSetAutoPlacementCount: (v: number) => logic.updateState({ autoSubTurretAutoPlacementCount: v }),
      onToggleSnap: (v: boolean) => logic.updateState({ autoSubTurretSnapPlacement: v }),
      onSetSnapCount: (v: number) => logic.updateState({ autoSubTurretSnapPlacementCount: v }),
      onToggleAbove: (v: boolean) => updateSubT({ aboveTankBody: v }),
      canMakePrimary: !!s.autoSubTurretSelectedId,
      onMakePrimary: () => { logic.makeAutoSubTurretPrimary(); onUpdate(); },
      onUndoLast: () => { logic.undoLastAutoSubTurret(); onUpdate(); },
      inheritMode: s.autoSubTurretInheritMode,
      canInherit: !!s.autoSubTurretSelectedId,
      onToggleInherit: () => {
        if (s.autoSubTurretInheritMode) {
          logic.cancelAutoSubTurretInheritMode();
        } else if (s.autoSubTurretSelectedId) {
          logic.startAutoSubTurretInheritMode(s.autoSubTurretSelectedId);
        }
        onUpdate();
      },
      instructionContext: 'auto-turret' as const,
    };
    const ss = getSectionState(parentTurret.id);
    const subPreviewing = s.presetPreviewTurrets.length > 0;
    const subFires = subT.turretType !== 'decorative' && !subPreviewing;

    return (
      <ScrollArea key={'sub:' + parentTurret.id} className={className || ''} contentClassName={PAGE}>
        <Crumbs items={[
          { label: 'Tank', onClick: () => { logic.exitAutoSubTurretMode(); onUpdate(); } },
          { label: `Turret #${parentIndex + 1}`, onClick: () => { logic.exitAutoSubTurretMode(); onUpdate(); } },
          { label: 'Sub-Turrets' },
        ]} />

        <Group title="Installed Turrets" icon={headerIcon(HdRectangleCircle)} count={parentTurret.autoSubTurrets.length}
          right={!s.autoSubTurretInheritMode ? <NewGroupButton logic={logic} scope={'base:' + parentTurret.id} /> : null}>
          {renderContentLibrary()}
          <InstalledTurretsList
            logic={logic}
            scope={'base:' + parentTurret.id}
            onMakePrimary={(id) => logic.setPrimaryFromList(id)}
            onInheritInto={(id) => { if (logic.state.autoSubTurretSelectedId !== id) { const tur = parentTurret.autoSubTurrets.find(x => x.id === id); if (tur) pickSub(tur); } logic.startAutoSubTurretInheritMode(id); onUpdate(); }}
            turrets={parentTurret.autoSubTurrets}
            selectedTurretId={s.autoSubTurretSelectedId}
            primaryTurretId={parentTurret.primarySubTurretId ?? null}
            inheritMode={s.autoSubTurretInheritMode}
            inheritTargetId={s.autoSubTurretInheritTargetId}
            onInheritFrom={(sourceId) => {
              logic.completeAutoSubTurretInherit(sourceId);
              onUpdate();
            }}
            onSelect={(tur) => {
              if (tur.id === logic.state.autoSubTurretSelectedId) {
                logic.setAutoSubTurretSelectMode(false);
                onUpdate();
                return;
              }
              pickSub(tur);
            }}
            onRemove={(id) => {
              logic.removeAutoSubTurret(id);
              onUpdate();
            }}
            emptyMessage="Click canvas to place sub turrets on the circle."
          />
          <TurretActionBar {...subBar} part="listActions" />
        </Group>

        <PlacementBar bar={subBar} sub />

        <Reveal when={!subPreviewing}>
        <Group title={subEditing ? 'Editing Turret' : 'Turret Properties'} icon={headerIcon(HdDashboardSquareSetting)}
          right={subEditing ? <Button size="sm" onClick={() => logic.setAutoSubTurretSelectMode(false)} title="Stop editing this turret">Done</Button> : null}>
          {subTypeEd('type')}
          <TurretActionBar {...subBar} part="primary" />
        </Group>
        </Reveal>

        <Reveal when={subShows('look') && !subPreviewing}><Group title="Look" icon={headerIcon(HdEye)}>{subProps('look')}</Group></Reveal>
        <Group title="Position" icon={headerIcon(HdArrowAllDirection)}>
          <SwapBox swapKey={subPreviewing ? 'preset' : 'turret'} className="k-swap-rows">
            {subPreviewing ? <PresetGroupControls logic={logic} /> : subProps('position')}
          </SwapBox>
        </Group>
        <Reveal when={!subPreviewing && (subShows('shape') || subShows('color'))}>
          <Group title="Shape and Color" icon={headerIcon(HdPaintBoard)}>
            {subProps('shape')}
            {subProps('color')}
          </Group>
        </Reveal>

        <Reveal when={subFires}>
          <>
              <ProjectileTypeEditor
                key={subOwnerKey}
                projectileType={subPT}
                onUpdate={updateSubPT}
                projectileDesigns={s.projectileDesigns}
                tankLibrary={s.tankLibrary || []}
                wifiRange={subT.wifiRange}
                wifiRangeValue={subT.wifiRangeValue}
                onWifiUpdate={(updates) => updateSubT(updates)}
                onBehaviorsReset={(behaviors) => {
                  updateSubT({ projectileBehaviors: behaviors });
                }}
                onTurretUpdate={updateSubT}
                onTurretReset={updateSubT}
                behaviors={subT.projectileBehaviors || []}
                onBehaviorUpdate={(behaviorType, updates) => {
                  const behaviors = (subT.projectileBehaviors || []).map(b =>
                    b.type === behaviorType ? { ...b, ...updates } : b
                  );
                  updateSubT({ projectileBehaviors: behaviors });
                }}
                sectionOpen={ss.projectileType}
                onSectionToggle={(v) => { ss.projectileType = v; onUpdate(); }}
                layerMaxAliveActive={_turretLayerMaxAliveActive}
                roundLayer={TANK_GUN_ROUND_LAYER}
                logic={logic}
              />
          </>
        </Reveal>

        <Reveal when={!subPreviewing && (subShows('firing') || turretTypePartShows('firing', subT))}>
          <Group title="Firing" icon={headerIcon(HdAsteroid02)}>
            {subProps('firing')}
            {subTypeEd('firing')}
          </Group>
        </Reveal>
        <Reveal when={subShows('bullet') && !subPreviewing}><Group title="Bullet" icon={headerIcon(HdAiElements)}>{subProps('bullet')}</Group></Reveal>

        <Reveal when={subFires}>
              <BehaviorEditor
                behaviors={subT.projectileBehaviors || []}
                onUpdate={(behaviors) => {
                  updateSubT({ projectileBehaviors: behaviors });
                  const derived = deriveMotionTypeForUI(behaviors);
                  if (derived) updateSubPT({ motionType: derived });
                }}
                sectionOpen={ss.behaviors}
                onSectionToggle={(v) => { ss.behaviors = v; onUpdate(); }}
                explode={subT.explode}
                onExplodeChange={(ex) => updateSubT({ explode: ex })}
                onAddExplode={() => {
                  const ex = explodeWithSeed(logic.state.autoSubTurretEditing as Turret, [], logic, TANK_GUN_ROUND_LAYER);
                  if (ex) updateSubT({ explode: ex });
                }}
                onAddRing={() => {
                  const ex = explodeWithAddedRing(logic.state.autoSubTurretEditing as Turret, [], logic, TANK_GUN_ROUND_LAYER);
                  if (ex) updateSubT({ explode: ex });
                }}
                onEditFragment={(i) => setFragDrill({ owner: subOwnerKey, path: [i] })}
                explodeLevel={1}
                bombTurret={subRoot}
                tankLibrary={s.tankLibrary || []}
                roundLayer={TANK_GUN_ROUND_LAYER}
              />
        </Reveal>

        <Reveal when={!subPreviewing}>
        <Group title="Draw Order" icon={headerIcon(HdAiDrawing)} collapsible defaultOpen={false}>
          {subProps('aboveBase')}
          {subProps('drawOrder')}
          {subTypeEd('drawOrder')}
        </Group>
        </Reveal>

        <HistoryGroup logic={logic} />
      </ScrollArea>
    );
  }

  const activeTurrets = s.activeBodyLayerId === null
    ? s.turrets.filter((t: Turret) => {
        for (let i = 0; i < s.bodyLayers.length; i++) {
          if (s.bodyLayers[i].turretIds.indexOf(t.id) !== -1) return false;
        }
        return true;
      })
    : s.turrets.filter((t: Turret) => {
        const layer = s.bodyLayers.find((l: any) => l.id === s.activeBodyLayerId);
        return layer ? layer.turretIds.indexOf(t.id) !== -1 : false;
      });

  const pickMain = (tur: Turret) => {
    logic.saveGhostBeforePick();
    logic.overlayResetCounter++;
    const unbaked = logic.unbakeStoredTurretForEditing(tur);
    const { id, angle, animProgress, ...rest } = unbaked;
    logic.updateState({
      selectedTurretId: tur.id,
      selectMode: true,
      editingTurret: { ...rest },
      mirrorMode: false,
      autoPlacement: false,
      snapPlacement: false,
    });
    onUpdate();
  };

  const mainRoot = t as Turret;
  const mainOwnerKey = 'main:' + (s.activeBodyLayerId ?? 'main') + ':' + (s.selectedTurretId ?? 'ghost');
  const mainDrillPath = drillPathFor(mainOwnerKey, mainRoot);
  if (mainDrillPath !== null) {
    const selIndex = s.selectedTurretId ? s.turrets.findIndex(tt => tt.id === s.selectedTurretId) : -1;
    return (
      <ScrollArea key={'frag:' + (s.activeBodyLayerId ?? 'main') + ':' + mainDrillPath.join('.')} className={className || ''} contentClassName={PAGE}>
        <FragmentEditorPanel
          root={mainRoot}
          getRoot={() => logic.state.editingTurret as Turret}
          hostLayer={TANK_GUN_ROUND_LAYER}
          path={mainDrillPath}
          onPathChange={(p) => setFragDrill(p.length > 0 ? { owner: mainOwnerKey, path: p } : null)}
          onRootExplodeChange={(ex) => updateT({ explode: ex })}
          crumbsBefore={[
            { label: 'Tank', onClick: () => setFragDrill(null) },
            { label: selIndex >= 0 ? `Turret #${selIndex + 1}` : 'Turret', onClick: () => setFragDrill(null) },
          ]}
          logic={logic}
          projectileDesigns={s.projectileDesigns}
          tankLibrary={s.tankLibrary || []}
          getSectionState={getSectionState}
          onSectionChange={onUpdate}
          deriveMotionType={deriveMotionTypeForUI}
          escapeEnabled={fragEscapeEnabled}
        />
      </ScrollArea>
    );
  }

  const isAuto = t.turretType === 'auto';
  const mainEditing = !!s.selectedTurretId;
  const mainSpawner = (!!pt.tankAsProjectile || !!(pt.cycleProjectilesEnabled && pt.tankAsProjectileCycle?.length)) && !!pt.tankAsProjectileUseAI;
  const mainOrientation = s.selectedTurretId ? (angleDeg: number) => {
    const sel = s.turrets.find(t => t.id === s.selectedTurretId);
    if (!sel) return;
    const newAngleRad = angleDeg * Math.PI / 180;
    const dist = Math.sqrt(sel.xOffset * sel.xOffset + sel.yOffset * sel.yOffset);
    if (sel.turretType === 'auto') {
      const primarySub = sel.primarySubTurretId
        ? sel.autoSubTurrets.find(st => st.id === sel.primarySubTurretId)
        : null;
      const subAngle = primarySub ? primarySub.angle : 0;
      updateT({
        angle: newAngleRad - subAngle,
        xOffset: dist * Math.cos(newAngleRad),
        yOffset: dist * Math.sin(newAngleRad),
      } as Partial<Turret>);
    } else {
      updateT({
        angle: newAngleRad,
        xOffset: dist * Math.cos(newAngleRad),
        yOffset: dist * Math.sin(newAngleRad),
      } as Partial<Turret>);
    }
    onUpdate();
  } : undefined;
  const mainProps = (part: TurretPropsPart) => (
    <TurretPropertiesEditor
      turret={t}
      onUpdate={updateT}
      part={part}
      disabled={s.selectMode && !s.selectedTurretId}
      selectedTurretAngle={selectedAngle ?? comboPreviewAngle}
      hideAmmoStats={isAuto}
      tankSpawnerMode={mainSpawner}
      onOrientationChange={mainOrientation}
    />
  );
  const mainShows = (part: TurretPropsPart) => turretPropsPartShows(part, t, { hideAmmoStats: isAuto });
  const mainTypeEd = (part: TurretTypePart) => (
    <TurretTypeEditor
      part={part}
      turret={t}
      onUpdate={updateT}
      tankSize={s.tankSize}
      gridSpacing={GRID_SPACING}
      onEnterSubTurretMode={s.selectedTurretId ? () => {
        logic.enterAutoSubTurretMode(s.selectedTurretId!);
        onUpdate();
      } : undefined}
    />
  );
  const typeShows = (part: TurretTypePart) => turretTypePartShows(part, t, { onEnterSubTurretMode: s.selectedTurretId ? true : undefined });

  const _syncMt = deriveMotionTypeForUI(t.projectileBehaviors || []) || pt.motionType;
  const _showSync = t.turretType !== 'auto' && (
    _syncMt === 'motor' || _syncMt === 'minion' || _syncMt === 'chase' || _syncMt === 'swarm'
  );
  const mainBar = {
    mirrorMode: s.mirrorMode,
    selectMode: s.selectMode,
    autoPlacement: s.autoPlacement,
    autoPlacementCount: s.autoPlacementCount,
    snapPlacement: s.snapPlacement,
    snapPlacementCount: s.snapPlacementCount,
    showSyncsSkills: _showSync,
    syncsSkillsToggle: t.syncsSkills ?? false,
    onToggleSyncsSkills: (v: boolean) => updateT({ syncsSkills: v }),
    aboveTankBody: t.aboveTankBody ?? false,
    bodySides: logic.getActiveLayerSides(),
    onToggleMirror: (v: boolean) => logic.updateState({ mirrorMode: v }),
    onToggleCompass: (v: boolean) => {
      const _lt = logic.state.editingTurret ?? t;
      const _snapOn = logic.state.snapPlacement;
      const _cActiveSides = logic.getActiveLayerSides();
      const compassMax = _cActiveSides >= 3 ? _cActiveSides : 8;
      const _w14SnapPatch = (v && _cActiveSides >= 3 && !_snapOn)
        ? { snapPlacement: true } as const
        : null;
      logic.updateState({
        autoPlacement: v,
        ...(v ? { autoPlacementCount: compassMax } : undefined),
        ...(_w14SnapPatch ?? {}),
      });
      const _comboNow = _cActiveSides >= 3 && (_snapOn || _w14SnapPatch !== null);
      if (v && _comboNow && _lt.turretType === 'auto') {
        const offset = logic.computeFaceEdgeOffset(_cActiveSides, _lt.autoCircleSize ?? 25);
        updateT({ xOffset: offset, yOffset: 0, aboveTankBody: false });
      }
      if (!v && _lt.turretType === 'auto') {
        updateT({ xOffset: 0, yOffset: 0 });
      }
    },
    onSetAutoPlacementCount: (v: number) => logic.updateState({ autoPlacementCount: v }),
    onToggleSnap: (v: boolean) => {
      const _lt = logic.state.editingTurret ?? t;
      const _compassOn = logic.state.autoPlacement;
      const _sActiveSides = logic.getActiveLayerSides();
      if (!v && _sActiveSides >= 3 && _compassOn) {
        logic.updateState({ snapPlacement: false, autoPlacement: false });
      } else {
        logic.updateState({ snapPlacement: v });
      }
      if (v && _compassOn && _sActiveSides >= 3 && _lt.turretType === 'auto') {
        const offset = logic.computeFaceEdgeOffset(_sActiveSides, _lt.autoCircleSize ?? 25);
        updateT({ xOffset: offset, yOffset: 0, aboveTankBody: false });
      }
      if (!v && _lt.turretType === 'auto') {
        updateT({ xOffset: 0, yOffset: 0 });
      }
    },
    onSetSnapCount: (v: number) => logic.updateState({ snapPlacementCount: v }),
    onToggleAbove: (v: boolean) => updateT({ aboveTankBody: v }),
    autoCircleColorMatch: t.autoCircleColorMatch ?? false,
    isAutoTurret: t.turretType === 'auto',
    onToggleCircleColorMatch: (v: boolean) => updateT({ autoCircleColorMatch: v }),
    autoCircleSpin: t.autoCircleSpin ?? false,
    autoCircleSpinMode: t.autoCircleSpinMode ?? 'fixed',
    autoCircleSpinSpeed: t.autoCircleSpinSpeed ?? 50,
    autoCircleSpinDirection: t.autoCircleSpinDirection ?? 1,
    onToggleCircleSpin: (v: boolean) => updateT({ autoCircleSpin: v }),
    onSetCircleSpinMode: (v: 'fixed' | 'withBody') => updateT({ autoCircleSpinMode: v }),
    onSetCircleSpinSpeed: (v: number) => updateT({ autoCircleSpinSpeed: v }),
    onSetCircleSpinDirection: (v: 1 | -1) => updateT({ autoCircleSpinDirection: v }),
    healerToggle: t.healer ?? false,
    autoCircleHealer: t.autoCircleHealer ?? false,
    autoCircleFixed: t.autoCircleFixed ?? false,
    onToggleHealer: (v: boolean) => updateT({ healer: v }),
    onToggleAutoCircleHealer: (v: boolean) => updateT({ autoCircleHealer: v }),
    aura: t.aura,
    auraType: t.auraType,
    auraSize: t.auraSize,
    auraStrength: t.auraStrength,
    auraOpacity: t.auraOpacity,
    onPatchAura: (p: Partial<Turret>) => updateT(p),
    onToggleCircleFixed: (v: boolean) => updateT({ autoCircleFixed: v }),
    useCustomAimDirection: s.useCustomAimDirection,
    onToggleCustomAimDirection: (v: boolean) => logic.updateState({ useCustomAimDirection: v }),
    cameraZoomEnabled: s.cameraZoomEnabled,
    cameraZoomDistance: s.cameraZoomDistance,
    onToggleCameraZoom: (v: boolean) => logic.updateState({ cameraZoomEnabled: v }),
    onSetCameraZoomDistance: (v: number) => logic.updateState({ cameraZoomDistance: v }),
    canMakePrimary: !!s.selectedTurretId && !s.inheritMode && !s.useCustomAimDirection,
    onMakePrimary: () => logic.makeSelectedPrimary(),
    onUndoLast: () => logic.undoLastTurret(),
    canUndoLast: activeTurrets.length > 0,
    inheritMode: s.inheritMode,
    canInherit: !!s.selectedTurretId,
    onToggleInherit: () => {
      if (s.inheritMode) {
        logic.cancelInheritMode();
      } else if (s.selectedTurretId) {
        logic.startInheritMode(s.selectedTurretId);
      }
      onUpdate();
    },
    instructionContext: 'tank' as const,
  };
  const barShows = (part: TurretActionPart) => turretActionPartShows(part, mainBar);
  const ms = getSectionState('main');
  const previewing = s.presetPreviewTurrets.length > 0;

  return (
    <ScrollArea key={'main:' + (s.activeBodyLayerId ?? 'main')} className={className || ''} contentClassName={PAGE}>

      <Group title="Installed Turrets" icon={headerIcon(HdRectangleCircle)} count={activeTurrets.length}
        right={!s.inheritMode ? <NewGroupButton logic={logic} scope={s.activeBodyLayerId ?? 'main'} /> : null}>
        {renderContentLibrary()}
        <Reveal when={s.bodyLayers.length > 0}>
          <SelectRow label="Turrets for" help="Which part's turrets the list shows: the main body or one of the body layers."
            value={s.activeBodyLayerId ?? 'main'}
            onChange={(val) => {
              logic.setActiveBodyLayer(val === 'main' ? null : val);
              onUpdate();
            }}
            options={layerOptions}
          />
        </Reveal>
        <InstalledTurretsList
          logic={logic}
          scope={s.activeBodyLayerId ?? 'main'}
          onMakePrimary={(id) => logic.setPrimaryFromList(id)}
          onInheritInto={(id) => { if (logic.state.selectedTurretId !== id) { const tur = s.turrets.find(x => x.id === id); if (tur) pickMain(tur); } logic.startInheritMode(id); onUpdate(); }}
          turrets={s.inheritMode ? s.turrets : activeTurrets}
          layerLabels={inheritLayerLabels}
          selectedTurretId={s.selectedTurretId}
          primaryTurretId={s.primaryTurretId}
          inheritMode={s.inheritMode}
          inheritTargetId={s.inheritTargetTurretId}
          onInheritFrom={(sourceId) => {
            logic.completeInherit(sourceId);
            onUpdate();
          }}
          onSelect={(tur) => {
            if (tur.id === logic.state.selectedTurretId) {
              logic.setSelectMode(false);
              onUpdate();
              return;
            }
            pickMain(tur);
          }}
          onRemove={(id) => {
            logic.removeTurret(id);
            onUpdate();
          }}
          onEditAutoTurret={(turretId) => {
            logic.enterAutoSubTurretMode(turretId);
            onUpdate();
          }}
        />
        <TurretActionBar {...mainBar} part="listActions" />
      </Group>

      <PlacementBar bar={mainBar} sub={false} />

      <Reveal when={!previewing}>
      <Group title={mainEditing ? 'Editing Turret' : 'Turret Properties'} icon={headerIcon(HdDashboardSquareSetting)}
        right={mainEditing ? <Button size="sm" onClick={() => logic.setSelectMode(false)} title="Stop editing this turret">Done</Button> : null}>
        {mainTypeEd('type')}
        <Reveal when={typeShows('subTurrets')}><div className="space-y-3">{mainTypeEd('subTurrets')}</div></Reveal>
      </Group>
      </Reveal>

      <Reveal when={mainShows('look') && !previewing}><Group title="Look" icon={headerIcon(HdEye)}>{mainProps('look')}</Group></Reveal>
      <Group title="Position" icon={headerIcon(HdArrowAllDirection)}>
        <SwapBox swapKey={previewing ? 'preset' : 'turret'} className="k-swap-rows">
          {previewing ? <PresetGroupControls logic={logic} /> : mainProps('position')}
        </SwapBox>
      </Group>
      <Reveal when={!previewing && (mainShows('shape') || mainShows('color') || typeShows('baseShape') || barShows('colorMatch'))}>
        <Group title="Shape and Color" icon={headerIcon(HdPaintBoard)}>
          <SwapBox swapKey={t.turretType} className="k-swap-rows">
          {mainProps('shape')}
          {mainTypeEd('baseShape')}
          {mainProps('color')}
          <TurretActionBar {...mainBar} part="colorMatch" />
          </SwapBox>
        </Group>
      </Reveal>

      <Reveal when={t.turretType !== 'auto' && !previewing}>
        <ProjectileTypeEditor
          key={mainOwnerKey}
          projectileType={pt}
          onUpdate={updatePT}
          projectileDesigns={s.projectileDesigns}
          tankLibrary={s.tankLibrary || []}
          wifiRange={t.wifiRange}
          wifiRangeValue={t.wifiRangeValue}
          onWifiUpdate={(updates) => updateT(updates)}
          onBehaviorsReset={(behaviors) => {
            updateT({ projectileBehaviors: behaviors });
          }}
          onTurretUpdate={updateT}
          onTurretReset={updateT}
          behaviors={t.projectileBehaviors || []}
          onBehaviorUpdate={(behaviorType, updates) => {
            const behaviors = (t.projectileBehaviors || []).map(b =>
              b.type === behaviorType ? { ...b, ...updates } : b
            );
            updateT({ projectileBehaviors: behaviors });
          }}
          sectionOpen={ms.projectileType}
          onSectionToggle={(v) => { ms.projectileType = v; onUpdate(); }}
          layerMaxAliveActive={_turretLayerMaxAliveActive}
          healerToggle={t.healer ?? false}
          onToggleHealer={(v) => updateT({ healer: v })}
          roundLayer={TANK_GUN_ROUND_LAYER}
          logic={logic}
          footer={barShows('syncs') ? <TurretActionBar {...mainBar} part="syncs" /> : undefined}
        />
      </Reveal>

      <Reveal when={!previewing && (mainShows('firing') || typeShows('firing'))}>
        <Group title="Firing" icon={headerIcon(HdAsteroid02)}>
          <SwapBox swapKey={t.turretType} className="k-swap-rows">
          {mainProps('firing')}
          {mainTypeEd('firing')}
          </SwapBox>
        </Group>
      </Reveal>
      <Reveal when={mainShows('bullet') && !previewing}><Group title="Bullet" icon={headerIcon(HdAiElements)}>{mainProps('bullet')}</Group></Reveal>

      <Reveal when={typeShows('targeting') && !previewing}><Group title="Targeting" icon={headerIcon(HdTarget01)}>{mainTypeEd('targeting')}</Group></Reveal>
      <Reveal when={barShows('baseMotion') && !previewing}>
        <Group title="Base Motion" icon={headerIcon(HdDashboardSpeed01)} collapsible defaultOpen={false} count={t.autoCircleSpin || t.autoCircleFixed ? 'On' : undefined}>
          <TurretActionBar {...mainBar} part="baseMotion" />
        </Group>
      </Reveal>
      <Reveal when={barShows('healAura') && !previewing}>
        <Group title="Healing and Aura" icon={headerIcon(HdCaduceus)} collapsible defaultOpen={false} count={t.autoCircleHealer || t.aura ? 'On' : undefined}>
          <TurretActionBar {...mainBar} part="healAura" />
        </Group>
      </Reveal>

      <Reveal when={t.turretType !== 'auto' && !previewing}>
        <BehaviorEditor
          behaviors={t.projectileBehaviors || []}
          onUpdate={(behaviors) => {
            updateT({ projectileBehaviors: behaviors });
            const derived = deriveMotionTypeForUI(behaviors);
            if (derived) updatePT({ motionType: derived });
          }}
          sectionOpen={ms.behaviors}
          onSectionToggle={(v) => { ms.behaviors = v; onUpdate(); }}
          explode={t.explode}
          onExplodeChange={(ex) => updateT({ explode: ex })}
          onAddExplode={() => {
            const ex = explodeWithSeed(logic.state.editingTurret as Turret, [], logic, TANK_GUN_ROUND_LAYER);
            if (ex) updateT({ explode: ex });
          }}
          onAddRing={() => {
            const ex = explodeWithAddedRing(logic.state.editingTurret as Turret, [], logic, TANK_GUN_ROUND_LAYER);
            if (ex) updateT({ explode: ex });
          }}
          onEditFragment={(i) => setFragDrill({ owner: mainOwnerKey, path: [i] })}
          explodeLevel={1}
          bombTurret={mainRoot}
          tankLibrary={s.tankLibrary || []}
          roundLayer={TANK_GUN_ROUND_LAYER}
        />
      </Reveal>

      <Group title="Draw Order" icon={headerIcon(HdAiDrawing)} collapsible defaultOpen={false}>
        {mainProps('drawOrder')}
        <Reveal when={!previewing}><div className="space-y-3">
          <TurretActionBar {...mainBar} part="above" />
          {mainTypeEd('drawOrder')}
        </div></Reveal>
      </Group>

      <Group title="Tank Aim" icon={headerIcon(HdMouseRightClick04)} collapsible defaultOpen={false}>
        <TurretActionBar {...mainBar} part="primary" />
        <TurretActionBar {...mainBar} part="aim" />
      </Group>

      <HistoryGroup logic={logic} />
    </ScrollArea>
  );
  })()}</PageSwap>;
};
