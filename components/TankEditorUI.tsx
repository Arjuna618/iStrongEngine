import React, { useState, useEffect } from 'react';
import { GameLogic } from '../game/GameLogic';
import { dialOfDepth, depthOfDial } from '../utils/shapeDepthDial';
import { Plus, Trash2, Layers, SlidersHorizontal, Copy, Pencil, Tags, CanvasTool, HdPhysics, Settings2, HdPreferenceHorizontal, BodyLayersIcon, HdProfile02, HdGeometricShapes01, HdFingerprintPattern, HdAiBrain01, HdAiSparkles, Lock, EyeOff } from './ui/icons';
import { ScrollArea } from './ui/ScrollArea';
import { Group, ToggleRow, SliderRow, SelectRow, FieldRow, Segmented, PickRow, NumberField, IconButton, Button, EmptyState, headerIcon, emptyArt, Dim } from './kit/kit';
import { Reveal, MotionList, PageSwap, SwapText, Collapse } from './kit/Collapse';
import { ColorMapControl, ColorMapSwitch } from './shared/ColorMapField';
import type { ColorMapValue } from './shared/colorMapRules';
import { CM_USE } from '../utils/colorMap';
import { BodyLayer, TURRET_NAME_MAX, TURRET_TAG_MAX } from '../types';
import { SkillCapsPopup } from './SkillCapsPopup';
import { PreDefinedSkillsPopup } from './PreDefinedSkillsPopup';
import { fireTip } from '../utils/tips';
import { ARRAS_BODY_PUSH_SHARE, ARRAS_TANK_BASE_PENETRATION } from '../game/arrasCombat';
import { openContextMenu, type MenuEntry } from './shell/ContextMenu';
import { InlineName } from './shared/InstalledTurretsList';
import { PlaceRow, SizeRow, AngleRow, OpacityRow, degreesOf } from './shared/transformRows';
import { LAYER_PLACE_MAX, layerIsPlaced } from '../utils/canvasParts';
import { layerHitKind, layerHitFrac } from '../utils/partHits';
import { layerSolidOf } from '../utils/layerOutline';
import type { SolidDesign } from '../types';
import type { Tool } from './shell/engineTools';
import { SMALL_FIX } from '../game/smallFixSwitch';
import { layerTeamShown, teamColourEntry } from '../game/teamColourSwitch';
import { fadeSecondsOfRate, fadeRateOfSeconds } from '../utils/seenRule';

interface Props {
  logic: GameLogic | null;
  onUpdate: () => void;
  className?: string;
  showTool?: (tool: Tool) => void;
}

const STAT_NAME_OPTIONS = [
  { value: 'generic', label: 'Generic (Bullet)' },
  { value: 'drone', label: 'Drone' },
  { value: 'swarm', label: 'Swarm' },
  { value: 'trap', label: 'Trap' },
  { value: 'necro', label: 'Necro' },
  { value: 'mixed', label: 'Mixed (Weapon)' },
  { value: 'smasher', label: 'Smasher (Ram)' },
];
const HIT_KINDS = [
  { value: 'none', label: 'None', title: 'Nothing touches this layer: bullets, walls and tanks pass through it' },
  { value: 'circle', label: 'Circle', title: 'A round area as big as the layer' },
  { value: 'exact', label: 'Shape', title: 'The layer\'s own outline' },
];
const PreviewSpinRow: React.FC<{ logic: GameLogic; onUpdate: () => void }> = ({ logic, onUpdate }) => (
  <ToggleRow label="Preview Spin" description="Watch the tank turn."
    help="Shows the body and every layer turning as they will in a game. One switch for the whole tank. While it is on, clicks on the canvas edit nothing, so nothing moves by mistake."
    checked={logic.previewMotion} onChange={v => { logic.setPreviewMotion(v); onUpdate(); }} />
);
const HitPeek: React.FC<{ logic: GameLogic; children: React.ReactNode }> = ({ logic, children }) => {
  const set = (on: boolean) => { if (logic.showHitAreas !== on) logic.showHitAreas = on; };
  useEffect(() => () => { logic.showHitAreas = false; }, [logic]);
  return (
    <div className="space-y-3" onPointerEnter={() => set(true)} onPointerLeave={() => set(false)}
      onFocus={() => set(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) set(false); }}>
      {children}
    </div>
  );
};
const SPIN_DIRECTIONS = [
  { value: '-1', label: 'CW', title: 'Clockwise' },
  { value: '1', label: 'CCW', title: 'Counterclockwise' },
];
const MAX_BODY_LAYERS = 10;
const round1 = (v: number) => String(Math.round(v * 10) / 10);
const GAME_SOLIDS = [
  { value: 'cube', label: 'Cube' },
  { value: 'dodecahedron', label: 'Dodecahedron' },
  { value: 'icosahedron', label: 'Icosahedron' },
];
const SOLID_WHY = 'This layer is drawn as a 3D solid. Pick None in Solid to draw its own shape again.';
function solidNameOf(id: string | undefined, library: { name: string; fileData: { data: unknown } }[]): string {
  if (id === undefined || id === '') return '';
  for (const g of GAME_SOLIDS) if (g.value === id) return g.label;
  for (const r of library) { const sd = r.fileData.data as SolidDesign; if (sd && sd.solidId === id) return r.name || sd.name; }
  return 'Missing Solid';
}

export const TankPartCard: React.FC<{ logic: GameLogic | null; onUpdate: () => void }> = ({ logic, onUpdate }) => {
  if (!logic) return null;
  const s = logic.state;
  const isProjectile = s.canvasIsProjectile === true;

  const handleChange = (key: keyof typeof s, val: any) => {
    logic.updateState({ [key]: val });
    onUpdate();
  };
  const bodyColorValue: ColorMapValue = { color: s.tankColor, colorMap: s.tankColorMap, colorFree: s.tankColorFree };
  const setBodyColor = (v: ColorMapValue) => {
    logic.updateState({ tankColor: v.color, tankColorMap: v.colorMap, tankColorFree: v.colorFree });
    onUpdate();
  };
  const activeLayer = s.activeBodyLayerId ? s.bodyLayers.find((l: BodyLayer) => l.id === s.activeBodyLayerId) ?? null : null;
  const updateLayer = (updates: Partial<BodyLayer>) => {
    if (activeLayer) { logic.updateBodyLayer(activeLayer.id, updates); onUpdate(); }
  };
  const layerColorValue: ColorMapValue = activeLayer
    ? { color: activeLayer.color, colorMap: activeLayer.colorMap, colorFree: activeLayer.colorFree }
    : { color: '', colorMap: undefined, colorFree: undefined };
  const setLayerColor = (v: ColorMapValue) => updateLayer({ color: v.color, colorMap: v.colorMap, colorFree: v.colorFree });
  const capBadge = (on: boolean | undefined, n: number | undefined) => (on ? `Max ${n ?? 8}` : undefined);
  const layerSolidId = activeLayer && activeLayer.solidId !== undefined ? activeLayer.solidId : '';
  const solidOn = !!activeLayer && layerSolidOf(activeLayer) !== null;
  const solidOptions = [{ value: '', label: 'None' }, ...GAME_SOLIDS];
  for (const r of s.solidLibrary) { const sd = r.fileData.data as SolidDesign; if (sd && !solidOptions.some(o => o.value === sd.solidId)) solidOptions.push({ value: sd.solidId, label: r.name || sd.name }); }
  if (layerSolidId !== '' && !solidOptions.some(o => o.value === layerSolidId)) solidOptions.push({ value: layerSolidId, label: solidNameOf(layerSolidId, s.solidLibrary) });

  const liveBody = !activeLayer ? (<>
            <Group title="Shape" level={3}>
              <SliderRow label="Sides" help="Polygon sides for the body. 0 = circle."
                value={s.tankSides} onChange={v => handleChange('tankSides', v)} min={0} max={16} step={1} keepFraction display={s.tankSides === 0 ? 'O' : String(s.tankSides)} />
              <Reveal when={s.tankSides >= 3}>
                <SliderRow label="Shape Depth" help="How deep the shape's points go. The middle is the plain shape. Slide right and the points go in, like a star. Slide left and the sides bulge out."
                  note={`Arras default: ${Math.round(dialOfDepth(6 / (Math.max(3, s.tankSides) ** 2), s.tankSides))}`}
                  value={dialOfDepth(s.tankShapeDepth ?? 0, s.tankSides)} onChange={v => handleChange('tankShapeDepth', depthOfDial(v, s.tankSides))} min={-100} max={100} step="any"
                  fillFrom={0} minLabel="Out" maxLabel="In" display={String(Math.round(dialOfDepth(s.tankShapeDepth ?? 0, s.tankSides)))} />
              </Reveal>
              <Reveal when={(s.tankShapeDepth ?? 0) > 0}>
                <ToggleRow label="Curved Edges" description="Rounds the star's points."
                  checked={!!s.tankShapeCurved} onChange={v => handleChange('tankShapeCurved', v)} />
              </Reveal>
              <SliderRow label="Size" help="Tank body radius in game units."
                value={s.tankSize} onChange={v => handleChange('tankSize', v)} min={1} max={100} step="any" display={round1(s.tankSize)} />
            </Group>

            <Group title="Color" level={3}>
              <ColorMapControl value={bodyColorValue} use={CM_USE.TANK} onChange={setBodyColor} label="Tank Color"
                help="The color of the tank's body. Click the square to pick your own, or turn on Color Map below for a named color." />
              <ColorMapSwitch value={bodyColorValue} use={CM_USE.TANK} onChange={setBodyColor} />
              <ToggleRow label="Keep Own Color" hidden={isProjectile}
                description="Keeps its colors in team modes."
                help="This tank always wears its own colors, even in team and FFA modes, like bosses do."
                checked={s.keepOwnColor ?? false} onChange={v => handleChange('keepOwnColor', v)} />
            </Group>

            <Group title="Motion" level={3} hidden={isProjectile}>
              <ToggleRow label="Spin" description="Turns the body all the time."
                checked={s.baseSpinEnabled} onChange={v => handleChange('baseSpinEnabled', v)} />
              <Reveal when={s.baseSpinEnabled}><div className="space-y-3">
                <FieldRow label="Direction" help="Which way the body turns while Spin is on.">
                  <Segmented value={s.baseSpinDirection === -1 ? '-1' : '1'} onChange={v => handleChange('baseSpinDirection', v === '-1' ? -1 : 1)} options={SPIN_DIRECTIONS} />
                </FieldRow>
                <SliderRow label="Spin Speed" help="Body rotation speed when spin is enabled."
                  value={s.baseSpinSpeed} onChange={v => handleChange('baseSpinSpeed', v)} min={0} max={100} step={1} />
              </div></Reveal>
              <PreviewSpinRow logic={logic} onUpdate={onUpdate} />
            </Group>

            <Group title="Display" level={3} hidden={isProjectile}>
              <ToggleRow label="Show Red Cross" description="A red cross on the body."
                checked={s.isHealer ?? false} onChange={v => handleChange('isHealer', v)} />
              <ToggleRow label="Show Health Bar" description="Its health and shield bars."
                checked={s.showHealthBar ?? true} onChange={v => handleChange('showHealthBar', v)} />
              <OpacityRow value={s.tankOpacity} onChange={v => handleChange('tankOpacity', v)}
                help="How much of the main body you see. Under 100 % the layers under it show through it. Its turrets and layers have their own." />
            </Group>

            <Group title="Projectile Cap" level={3} collapsible defaultOpen={false} count={capBadge(s.globalMaxAliveEnabled, s.globalMaxAlive)} hidden={isProjectile}>
              <ToggleRow label="Layer Max Alive" description="One cap for its turrets."
                help="Controls the maximum total projectiles from turrets on the main body (turrets not assigned to any body layer). When enabled, overrides per turret Max Alive for all main body turrets. Each body layer can have its own Layer Max Alive in the layer editor."
                checked={s.globalMaxAliveEnabled ?? false}
                onChange={on => { if (on && !(s.globalMaxAlive ?? 0)) handleChange('globalMaxAlive', 8); handleChange('globalMaxAliveEnabled', on); }} />
              <Reveal when={(s.globalMaxAliveEnabled ?? false)}>
                <SliderRow label="Max Alive" help="The most projectiles the main body's turrets can have out at once, all together." value={s.globalMaxAlive ?? 8} onChange={v => handleChange('globalMaxAlive', v)} min={1} max={200} step={1} />
              </Reveal>
            </Group>

        </>) : (<>
            <Group title="Transform" foldKey="Position" level={3}>
              <PlaceRow label="X Offset" help="Moves this layer forward or back from the middle of the tank, in body radii. 0 is the middle. A moved layer has a hit area of its own (Hits below)."
                value={activeLayer.x ?? 0} onChange={v => updateLayer({ x: v })} bound={LAYER_PLACE_MAX} />
              <PlaceRow label="Y Offset" help="Moves this layer to the side from the middle of the tank, in body radii. 0 is the middle. A moved layer has a hit area of its own (Hits below)."
                value={activeLayer.y ?? 0} onChange={v => updateLayer({ y: v })} bound={LAYER_PLACE_MAX} />
              <SizeRow label="Size Ratio" help="Scale relative to main body. 1.0 = same size."
                value={activeLayer.sizeRatio} onChange={v => updateLayer({ sizeRatio: v })} min={0.1} base={5} bound={100} suffix="x" />
              <Reveal when={activeLayer.sides >= 3 || solidOn}>
                <AngleRow label="Angle Offset" help="Starting rotation offset in degrees. Useful for positioning polygon copies at specific angles."
                  value={degreesOf(activeLayer.initialAngle ?? 0)} onChange={v => updateLayer({ initialAngle: v * Math.PI / 180 })} />
              </Reveal>
              <OpacityRow value={activeLayer.opacity} onChange={v => updateLayer({ opacity: v })}
                help="How much of this layer you see. Under 100 % what lies under it in the tank shows through it. Its turrets have their own." />
              <Reveal when={layerIsPlaced(activeLayer)}><Dim when={activeLayer.intangible} why="Intangible is on, so this layer hits nothing." className="space-y-3">
                <HitPeek logic={logic}>
                <FieldRow label="Hit Area" help="Where bullets, walls, shapes and other tanks touch this layer, now that it sits away from the middle of the tank. Point here to see it on the canvas as a dashed line. A layer in the middle of the tank uses the tank's own round area.">
                  <Segmented value={layerHitKind(activeLayer)} onChange={v => updateLayer({ hits: v as 'none' | 'circle' | 'exact' })} options={HIT_KINDS} />
                </FieldRow>
                <Reveal when={layerHitKind(activeLayer) !== 'none'}>
                  <SliderRow label="Hit Area Size" help="How big the hit area is, in percent of the layer's size. Point here to see it on the canvas."
                    value={Math.round(layerHitFrac(activeLayer, layerHitKind(activeLayer)) * 1000) / 10} onChange={v => updateLayer({ hitSize: v })}
                    min={1} max={200} step={1} keepFraction inputMin={1} inputMax={400} format={(v) => `${Math.round(v * 10) / 10}%`} />
                </Reveal>
                </HitPeek>
              </Dim></Reveal>
            </Group>

            <Group title="Shape" level={3}>
              <SelectRow label="Solid" help="Draws this layer as a 3D solid: the game's Cube, Dodecahedron and Icosahedron, or one of your solids from the Content Library. It turns with the layer, its corners at the layer's size. Its own sides and shape depth are kept, and None brings them back."
                value={layerSolidId} onChange={v => updateLayer({ solidId: v === '' ? undefined : v })} options={solidOptions} />
              <Dim when={solidOn} why={SOLID_WHY}>
              <SliderRow label="Sides" help={activeLayer.outline ? 'Polygon sides for the body. 0 = circle. This layer has a custom shape: picking sides or a shape depth replaces it, and Ctrl Z brings it back.' : 'Polygon sides for the body. 0 = circle.'}
                note={activeLayer.outline ? 'Custom shape' : undefined}
                value={activeLayer.sides} onChange={v => updateLayer({ sides: v })} min={0} max={16} step={1} keepFraction display={activeLayer.sides === 0 ? 'O' : String(activeLayer.sides)} />
              </Dim>
              <Reveal when={activeLayer.sides >= 3 || solidOn}>
                <SliderRow label="Copies" help="Number of overlapping polygon copies drawn at equal angular spacing. Spike=4x triangle, creates star like visual."
                  value={activeLayer.copies ?? 1} onChange={v => updateLayer({ copies: v })} min={1} max={8} step={1} />
              </Reveal>
              <Reveal when={activeLayer.sides >= 3}><Dim when={solidOn} why={SOLID_WHY}>
                <SliderRow label="Shape Depth" help="How deep the shape's points go. The middle is the plain shape. Slide right and the points go in, like a star. Slide left and the sides bulge out."
                  value={dialOfDepth(activeLayer.starDepth, activeLayer.sides)} onChange={v => updateLayer({ starDepth: depthOfDial(v, activeLayer.sides) })} min={-100} max={100} step="any"
                  fillFrom={0} minLabel="Out" maxLabel="In" display={String(Math.round(dialOfDepth(activeLayer.starDepth, activeLayer.sides)))} />
              </Dim></Reveal>
              <Reveal when={activeLayer.starDepth > 0}><Dim when={solidOn} why={SOLID_WHY}>
                <ToggleRow label="Curved Edges" description="Rounds the star's points."
                  checked={activeLayer.starCurved} onChange={v => updateLayer({ starCurved: v })} />
              </Dim></Reveal>
            </Group>

            <Group title="Color" level={3}>
              <ToggleRow label="Inherit Color" description="Wears the main body's color."
                checked={activeLayer.useInheritColor} onChange={v => updateLayer({ useInheritColor: v })} />
              <Reveal when={!activeLayer.useInheritColor}><div className="space-y-3">
                <ToggleRow label="Team Color" description="Takes its team's color when the tank joins a team, even with Keep Own Color on."
                  checked={layerTeamShown(activeLayer, s.keepOwnColor ?? false)} onChange={v => updateLayer({ teamColour: teamColourEntry(activeLayer, s.keepOwnColor ?? false, v) })} />
                <ColorMapControl value={layerColorValue} use={CM_USE.TANK} onChange={setLayerColor} label="Layer Color"
                  help="This layer's own color, shown while Inherit Color is off." />
                <ColorMapSwitch value={layerColorValue} use={CM_USE.TANK} onChange={setLayerColor} compact />
              </div></Reveal>
            </Group>

            <Group title="Motion" level={3}>
              <ToggleRow label="Stationary" description="Does not turn with the tank."
                checked={activeLayer.stationary} onChange={v => updateLayer({ stationary: v })} />
              <Reveal when={!activeLayer.stationary}>
                <ToggleRow label="Spin" description="Rotates this layer on its own."
                  checked={activeLayer.spinEnabled} onChange={v => updateLayer({ spinEnabled: v })} />
              </Reveal>
              <Reveal when={!activeLayer.stationary && activeLayer.spinEnabled}><div className="space-y-3">
                <FieldRow label="Direction" help="Which way this layer turns while Spin is on.">
                  <Segmented value={activeLayer.spinDirection === -1 ? '-1' : '1'} onChange={v => updateLayer({ spinDirection: v === '-1' ? -1 : 1 })} options={SPIN_DIRECTIONS} />
                </FieldRow>
                <SliderRow label="Spin Speed" help="Body rotation speed when spin is enabled."
                  value={activeLayer.spinSpeed} onChange={v => updateLayer({ spinSpeed: v })} min={0} max={500} step={1} />
              </div></Reveal>
              <PreviewSpinRow logic={logic} onUpdate={onUpdate} />
            </Group>

            <Group title="Display" level={3}>
              <SliderRow label="Render Layer" help="Draw order. Higher = on top. Negative = above main body."
                value={activeLayer.renderOrder} onChange={v => updateLayer({ renderOrder: v })} min={-5} max={10} step={1} />
              <ToggleRow label="Show Red Cross" description="A red cross on this layer."
                checked={activeLayer.showHealerCross ?? false} onChange={v => updateLayer({ showHealerCross: v })} />
              <ToggleRow label="Intangible" description="Visual only, no collision."
                checked={activeLayer.intangible} onChange={v => updateLayer({ intangible: v })} />
            </Group>

            <Group title="Projectile Cap" level={3} collapsible defaultOpen={false} count={capBadge(activeLayer.maxAliveEnabled, activeLayer.maxAlive)}>
              <ToggleRow label="Layer Max Alive" description="One cap for its turrets."
                help="Max total projectiles from turrets on this layer. When enabled, overrides per turret Max Alive for all turrets on this layer."
                checked={activeLayer.maxAliveEnabled ?? false}
                onChange={on => updateLayer(on && !(activeLayer.maxAlive ?? 0) ? { maxAliveEnabled: true, maxAlive: 8 } : { maxAliveEnabled: on })} />
              <Reveal when={(activeLayer.maxAliveEnabled ?? false)}>
                <SliderRow label="Max Alive" help="The most projectiles this layer's turrets can have out at once, all together." value={activeLayer.maxAlive ?? 8} onChange={v => updateLayer({ maxAlive: v })} min={1} max={200} step={1} />
              </Reveal>
            </Group>
        </>);

  return (
    <Group title={activeLayer ? activeLayer.label : 'Main Body'} icon={headerIcon(activeLayer ? HdProfile02 : HdGeometricShapes01)} foldKey="Picked Part" flush>
      <div className="k-card-body k-stack">
      {liveBody}
      </div>
    </Group>
  );
};

export const TankPartsTree: React.FC<{
  logic: GameLogic | null; onUpdate: () => void;
  turretsOf: (scope: string) => React.ReactNode;
  placing: boolean;
  onAddTurret: (part?: string | null) => void;
  onDone: () => void;
  headRight?: React.ReactNode;
  below?: React.ReactNode;
}> = ({ logic, onUpdate, turretsOf, placing, onAddTurret, onDone, headRight, below }) => {
  const [renamingLayer, setRenamingLayer] = useState<string | null>(null);
  if (!logic) return null;
  const s = logic.state;
  const isProjectile = s.canvasIsProjectile === true;
  const layersFull = s.bodyLayers.length >= MAX_BODY_LAYERS;
  const pickLayer = (id: string | null) => {
    if (placing) logic.setActiveBodyLayer(id);
    else logic.pickPart(id, true);
    onUpdate();
  };
  const partOn = (id: string | null) => logic.partPicked && !s.selectedTurretId && s.activeBodyLayerId === id;
  const addLayer = () => { logic.addBodyLayer(); onUpdate(); fireTip('bodyLayerAdded'); };
  const layerMenu = (layer: BodyLayer): MenuEntry[] => [
    { label: 'Edit', icon: SlidersHorizontal, disabled: partOn(layer.id), onSelect: () => pickLayer(layer.id) },
    { label: 'Add Turret Here', icon: CanvasTool, onSelect: () => onAddTurret(layer.id) },
    'sep',
    { label: 'Rename', icon: Pencil, onSelect: () => setRenamingLayer(layer.id) },
    layer.tag
      ? { label: 'Edit Tag', icon: Tags, prompt: { title: 'Tag', placeholder: 'Up to 8 letters', initial: layer.tag, maxLength: TURRET_TAG_MAX, submit: 'Save', onSubmit: (v: string) => { logic.setBodyLayerTag(layer.id, v); onUpdate(); } } }
      : { label: 'Add Tag', icon: Tags, prompt: { title: 'Add Tag', placeholder: 'Up to 8 letters', maxLength: TURRET_TAG_MAX, submit: 'Add', onSubmit: (v: string) => { logic.setBodyLayerTag(layer.id, v); onUpdate(); } } },
    ...(layer.tag ? [{ label: 'Remove Tag', icon: Tags, onSelect: () => { logic.setBodyLayerTag(layer.id, ''); onUpdate(); } }] : []),
    'sep',
    { label: 'Duplicate Layer', icon: Copy, disabled: layersFull, onSelect: () => { logic.duplicateBodyLayer(layer.id); onUpdate(); } },
    { label: 'Add Layer', icon: Plus, disabled: layersFull, onSelect: addLayer },
    'sep',
    { label: logic.partLocks.has(layer.id) ? 'Unlock on Canvas' : 'Lock on Canvas', icon: Lock, onSelect: () => logic.togglePartLock(layer.id) },
    { label: logic.partHides.has(layer.id) ? 'Unhide on Canvas' : 'Hide on Canvas', icon: EyeOff, onSelect: () => logic.togglePartHide(layer.id) },
    'sep',
    { label: 'Delete Layer', icon: Trash2, onSelect: () => { logic.removeBodyLayer(layer.id); onUpdate(); } },
  ];
  const mainMenu: MenuEntry[] = [
    { label: 'Edit', icon: SlidersHorizontal, disabled: partOn(null), onSelect: () => pickLayer(null) },
    { label: 'Add Turret Here', icon: CanvasTool, onSelect: () => onAddTurret(null) },
    'sep',
    { label: 'Add Layer', icon: Plus, disabled: layersFull, onSelect: addLayer },
    'sep',
    { label: logic.partLocks.has('main') ? 'Unlock on Canvas' : 'Lock on Canvas', icon: Lock, onSelect: () => logic.togglePartLock('main') },
    { label: logic.partHides.has('main') ? 'Unhide on Canvas' : 'Hide on Canvas', icon: EyeOff, onSelect: () => logic.togglePartHide('main') },
  ];

  return (
      <Group title={isProjectile ? 'Projectile Parts' : 'Tank Parts'} icon={headerIcon(BodyLayersIcon)} count={`${s.bodyLayers.length} / ${MAX_BODY_LAYERS}`} right={headRight}>
        <MotionList gap={8}>
          <div key="main" className="k-pnode">
            <PickRow title="Main Body" selected={partOn(null)}
              facts={[{ key: 'sides', text: s.tankSides === 0 ? 'Circle' : `${s.tankSides} sides` }, { key: 'size', text: `Size ${Math.round(s.tankSize * 10) / 10}` }]}
              onPick={() => pickLayer(null)} onContextMenu={(e) => openContextMenu(e, mainMenu)} />
            <Collapse open={s.activeBodyLayerId === null} container className="k-parts-fold"><div className="k-parts-branch">{s.activeBodyLayerId === null ? turretsOf('main') : null}</div></Collapse>
          </div>
          {s.bodyLayers.map((layer: BodyLayer) => (
            <div key={layer.id} className="k-pnode">
              <PickRow title={layer.label} tags={layer.tag ? [{ key: 'own', text: layer.tag }] : []} selected={partOn(layer.id)}
                onRename={() => setRenamingLayer(layer.id)}
                renaming={renamingLayer === layer.id
                  ? <InlineName value={layer.label} max={TURRET_NAME_MAX} onDone={v => { setRenamingLayer(null); if (v !== null) { logic.renameBodyLayer(layer.id, v); onUpdate(); } }} />
                  : undefined}
                facts={[
                  { key: 'sides', text: layerSolidOf(layer) !== null ? solidNameOf(layer.solidId, s.solidLibrary) : layer.outline ? 'Custom Shape' : layer.sides === 0 ? 'Circle' : `${layer.sides} sides` },
                  { key: 'size', text: `${layer.sizeRatio.toFixed(1)}x` },
                  ...(layer.spinEnabled ? [{ key: 'spin', text: layer.spinDirection === -1 ? 'Spins CW' : 'Spins CCW' }] : []),
                  { key: 'turrets', text: `${layer.turretIds.length} turret${layer.turretIds.length !== 1 ? 's' : ''}` },
                ]}
                onPick={() => pickLayer(layer.id)}
                onContextMenu={(e) => openContextMenu(e, layerMenu(layer))}
                actions={
                  <IconButton label="Delete Layer" size="sm" onClick={(e) => { e.stopPropagation(); logic.removeBodyLayer(layer.id); onUpdate(); }}>
                    <Trash2 size={14} />
                  </IconButton>
                } />
              <Collapse open={s.activeBodyLayerId === layer.id} container className="k-parts-fold"><div className="k-parts-branch">{s.activeBodyLayerId === layer.id ? turretsOf(layer.id) : null}</div></Collapse>
            </div>
          ))}
        </MotionList>
        {below}
        <div className="k-grid-2">
          <Button block size="sm" icon={<Plus size={14} />} disabled={layersFull} onClick={addLayer}>
            <SwapText>{layersFull ? 'Max Layers' : 'Add Layer'}</SwapText>
          </Button>
          <Button block size="sm" variant={placing ? 'primary' : 'secondary'} icon={placing ? undefined : <Plus size={14} />} onClick={() => (placing ? onDone() : onAddTurret())}
            title={placing ? 'Stop placing turrets' : 'Shows the new turret\'s settings; then each click on the canvas places it on its part.'}>
            <SwapText>{placing ? 'Done' : 'Add Turret'}</SwapText>
          </Button>
        </div>
      </Group>
  );
};

export const TankWideCards: React.FC<{ logic: GameLogic | null; onUpdate: () => void }> = ({ logic, onUpdate }) => {
  const [showSkillCaps, setShowSkillCaps] = useState(false);
  const [showPreDefined, setShowPreDefined] = useState(false);
  if (!logic) return null;
  const s = logic.state;
  const isProjectile = s.canvasIsProjectile === true;
  const handleChange = (key: keyof typeof s, val: any) => {
    logic.updateState({ [key]: val });
    onUpdate();
  };
  const growth = !!s.gameModeConfig.growth;
  const botOn = (s.healerAI ? 1 : 0) + (s.chargeAI ? 1 : 0) + (s.arenaCloserAI ? 1 : 0);
  const abilitiesOn = (s.invisibleEnabled ? 1 : 0) + (s.invisibleEnabled && s.invisibleAlways ? 1 : 0) + (s.ignoresWalls ? 1 : 0);
  const physicsOn = (s.tankPushShare !== undefined ? 1 : 0) + ((s.tankResistBase ?? 1) !== 1 ? 1 : 0)
    + ((s.tankPenetrationBase ?? ARRAS_TANK_BASE_PENETRATION) !== ARRAS_TANK_BASE_PENETRATION ? 1 : 0)
    + ((s.tankPushability ?? 1) !== 1 ? 1 : 0) + ((s.tankTouchScale ?? 1) !== 1 ? 1 : 0);

  return (<>
    <div className="space-y-3">

      <Group title="Base Stats" icon={headerIcon(HdPreferenceHorizontal)} hidden={isProjectile}>
        <div className="k-grid-2">
          <NumberField id="tank-hp" label="Hit Points" help="How much damage the tank can take before it dies." value={s.tankHP} onChange={(e) => handleChange('tankHP', parseFloat(e.target.value))} />
          <NumberField id="tank-body-damage" label="Body Damage" help="The damage the tank's body deals to what it touches. This base value matters much more than the Body Damage upgrade in a game." value={s.tankBodyDamage} onChange={(e) => handleChange('tankBodyDamage', parseFloat(e.target.value))} />
          <NumberField id="tank-shield-cap" label="Shield Cap" help="The size of the shield that takes damage before the tank's health does." value={s.tankShieldCapacity} min={SMALL_FIX.GH298 !== 0 ? 0 : undefined} onChange={(e) => handleChange('tankShieldCapacity', SMALL_FIX.GH298 !== 0 ? Math.max(0, parseFloat(e.target.value)) : parseFloat(e.target.value))} />
          <NumberField id="tank-shield-regen" label="Shield Regen" help="How fast the shield fills back up after it takes damage." value={s.tankShieldRegen} onChange={(e) => handleChange('tankShieldRegen', parseFloat(e.target.value))} />
        </div>
        <SliderRow label="Move Speed" help="Base movement speed before upgrades."
          value={s.tankMovementSpeed} onChange={v => handleChange('tankMovementSpeed', v)} min={0} max={100} step="any" display={round1(s.tankMovementSpeed)} />
        <SliderRow label="FOV Multiplier" help="Camera zoom multiplier. Higher = see farther (sniper: 1.2, assassin: 1.35)."
          value={s.fovMultiplier} onChange={v => handleChange('fovMultiplier', v)} min={0.5} max={2.0} step="any" display={(s.fovMultiplier ?? 1).toFixed(2)} />
      </Group>

      <Group title="Skills" icon={headerIcon(HdFingerprintPattern)} hidden={isProjectile}>
        <SelectRow label="Skill Labels" description="The names of the upgrade bars."
          help="Smasher renames Reload to Engine Acceleration and makes it speed the tank up instead of firing faster, the way ram tanks work."
          value={s.statNamesType ?? 'generic'} onChange={v => handleChange('statNamesType', v)} options={STAT_NAME_OPTIONS} />
        <SliderRow label="Max Skill Points" disabled={growth}
          why="Growth mode uses its own skill point rules."
          help="Hard cap on total skill points (bonus + earned from leveling)."
          value={s.maxSkillPoints} onChange={v => handleChange('maxSkillPoints', v)} min={0} max={100} step={1} />
        <SliderRow label="Bonus Skill Points" help="Extra unspent points given at spawn."
          value={s.bonusSkillPoints} onChange={v => handleChange('bonusSkillPoints', v)} min={0} max={100} step={1} />
        <ToggleRow label="Can Earn Skill Points" description="Points from leveling up."
          checked={s.canEarnSkillPoints !== false} onChange={v => handleChange('canEarnSkillPoints', v)} />
        <Button block size="sm" icon={<Settings2 size={14} />} onClick={() => setShowSkillCaps(true)}>Configure Skill Caps</Button>
        <Button block size="sm" icon={<Settings2 size={14} />} onClick={() => setShowPreDefined(true)}>Predefined Skills</Button>
      </Group>

      <Group title="Body Physics" icon={headerIcon(HdPhysics)} collapsible defaultOpen={false} hidden={isProjectile}
        count={physicsOn ? `${physicsOn} set` : undefined}>
        <SliderRow label="Start and Stop" help="How much of the body's speed is its push: low glides like a Drifter, high starts and stops at once. The Engine Acceleration skill grows this part."
          value={s.tankPushShare ?? ARRAS_BODY_PUSH_SHARE} min={0.02} max={1} step={0.005} display={(s.tankPushShare ?? ARRAS_BODY_PUSH_SHARE).toFixed(3)}
          onChange={v => handleChange('tankPushShare', Math.abs(v - ARRAS_BODY_PUSH_SHARE) < 1e-6 ? undefined : v)} />
        <SliderRow label="Body Resist" help="How much less damage the body takes from what hits it. 1 is an ordinary tank; a Dominator has 100 (99 percent less)."
          value={s.tankResistBase ?? 1} min={1} max={100} step={0.5} display={round1(s.tankResistBase ?? 1)}
          onChange={v => handleChange('tankResistBase', v)} />
        <SliderRow label="Body Penetration" help="How hard the body is to break through. Lower takes more damage from rounds: 1.05 is an ordinary tank, a Dominator's 0.25 takes double."
          value={s.tankPenetrationBase ?? ARRAS_TANK_BASE_PENETRATION} min={0.05} max={5} step={0.05} display={(s.tankPenetrationBase ?? ARRAS_TANK_BASE_PENETRATION).toFixed(2)}
          onChange={v => handleChange('tankPenetrationBase', v)} />
        <SliderRow label="Pushability" help="How far hits and rams push this tank. 1 is an ordinary tank; a boss is 0.05."
          value={s.tankPushability ?? 1} min={0} max={2} step={0.01} display={(s.tankPushability ?? 1).toFixed(2)}
          onChange={v => handleChange('tankPushability', v)} />
        <SliderRow label="Touch Size" help="The share of its drawn size the body touches and weighs with. 1 touches as drawn."
          value={s.tankTouchScale ?? 1} min={0.3} max={1.5} step={0.01} display={(s.tankTouchScale ?? 1).toFixed(2)}
          onChange={v => handleChange('tankTouchScale', v)} />
      </Group>

      <Group title="Bot Behavior" icon={headerIcon(HdAiBrain01)} collapsible defaultOpen={false} count={botOn ? `${botOn} on` : undefined} hidden={isProjectile}>
        <ToggleRow label="Healer AI" description="Bots go heal hurt teammates."
          help="Bots seek out hurt teammates and follow them to heal. Healing guns aim at teammates either way."
          checked={s.healerAI ?? false} onChange={v => handleChange('healerAI', v)} />
        <ToggleRow label="Charge AI" description="Bots ram their target front first."
          help="Bots drive only the way their front points, straight at their target, and stop pushing when they are close. Your own driving is not changed."
          checked={s.chargeAI ?? false} onChange={v => handleChange('chargeAI', v)} />
        <ToggleRow label="Arena Closer AI" description="Bots hunt like an Arena Closer."
          help="Bots chase the nearest tank they can hurt anywhere on the map, seen or not and through walls, aim where their shots will meet it and never stop firing. They move only as fast as the tank can."
          checked={s.arenaCloserAI ?? false} onChange={v => handleChange('arenaCloserAI', v)} />
      </Group>

      <Group title="Special Abilities" icon={headerIcon(HdAiSparkles)} collapsible defaultOpen={false} count={abilitiesOn ? `${abilitiesOn} on` : undefined} hidden={isProjectile}>
        <ToggleRow label="Invisible When Idle" description="Fades while it stands still."
          help="Tank fades when stationary. Damage breaks stealth."
          checked={s.invisibleEnabled ?? false} onChange={v => handleChange('invisibleEnabled', v)} />
        <Reveal when={(s.invisibleEnabled ?? false)}>
          <ToggleRow label="Always Invisible" description="Hidden while moving or firing."
            help="Stays hidden while moving, firing or hurt. Others only see it from close up."
            checked={s.invisibleAlways ?? false} onChange={v => handleChange('invisibleAlways', v)} />
        </Reveal>
        <Reveal when={(s.invisibleEnabled ?? false) && !(s.invisibleAlways ?? false)}>
          <SliderRow label="Fade Time" help="Seconds to turn fully invisible while standing still."
            value={fadeSecondsOfRate(s.invisibleFadeOutRate)} onChange={v => handleChange('invisibleFadeOutRate', fadeRateOfSeconds(v))}
            min={0.1} max={30} step={0.1} unit="s" display={fadeSecondsOfRate(s.invisibleFadeOutRate).toFixed(1)} />
        </Reveal>
        <ToggleRow label="Ignores Walls" description="Passes through walls and rocks."
          help="Tank and its projectiles pass through walls and rocks, and draw on top of them."
          checked={s.ignoresWalls ?? false} onChange={v => handleChange('ignoresWalls', v)} />
      </Group>

    </div>

    {showSkillCaps && s.skillCaps && (
      <SkillCapsPopup
        skillCaps={s.skillCaps}
        statNamesType={s.statNamesType}
        onConfirm={(caps) => {
          handleChange('skillCaps', caps);
          setShowSkillCaps(false);
        }}
        onClose={() => setShowSkillCaps(false)}
      />
    )}

    {showPreDefined && s.preDefinedSkills && s.skillCaps && (
      <PreDefinedSkillsPopup
        preDefinedSkills={s.preDefinedSkills}
        skillCaps={s.skillCaps}
        statNamesType={s.statNamesType}
        onConfirm={(skills) => {
          handleChange('preDefinedSkills', skills);
          setShowPreDefined(false);
        }}
        onClose={() => setShowPreDefined(false)}
      />
    )}
    </>
  );
};
