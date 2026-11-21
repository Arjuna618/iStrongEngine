import React, { useRef } from 'react';
import { TEXT_LIMITS } from './kit/textLimits';
import { GameLogic } from '../game/GameLogic';
import { ArrowLeft, Pentagon, HdAiElements, HdColorPicker, HdRanking, HdPendulum } from './ui/icons';
import { ScrollArea } from './ui/ScrollArea';
import { Group, ToggleRow, SliderRow, SelectRow, FieldRow, NumberField, Button, EmptyState, TextField, headerIcon, emptyArt } from './kit/kit';
import { Reveal } from './kit/Collapse';
import { HelpTooltip } from './shared/HelpTooltip';
import { ColorMapControl, ColorMapSwitch } from './shared/ColorMapField';
import type { ColorMapValue } from './shared/colorMapRules';
import { CM_USE } from '../utils/colorMap';
import { FoodShapeDesign } from '../types';
import { ALL_RARITIES, RARITY_LABELS, RARITY_MULTIPLIERS, RARITY_COLORS, LABY_LABELS, effectiveShapeColor, userShapeMass, POLYHEDRA_DEFS, isSolidBodyKey, foodShapeOfSolid, rescaleDesignForRarity, type Rarity, type LabyLevel } from '../game/ShapeRegistry';
import type { SolidDesign } from '../types';
import { FOOD_SHAPE_RANGES, clampFoodShapeDesign } from '../game/ValueClamp';

interface Props {
  logic: GameLogic | null;
  onUpdate: () => void;
  className?: string;
  top?: React.ReactNode;
}

const STAT_RANGE = FOOD_SHAPE_RANGES;
type StatKey = Exclude<keyof typeof STAT_RANGE, 'sides' | 'labyLevel'>;

const RARITY_OPTIONS = ALL_RARITIES.map(r => ({ value: r, label: RARITY_LABELS[r] }));

const SIZE_RANDOMIZATION_START = 15;

function clampNum(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

import { snapSides, nearSides } from '../utils/foodSidesSlider';

function fmtStat(v: number): string {
  const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  return r.toLocaleString();
}
const fmtNesting = (v: number) => (v === 0 ? 'None' : LABY_LABELS[Math.round(v) as LabyLevel] ?? String(v));

const lowerHex = (c: string): string => c.toLowerCase();

function bodyChangeOf(cur: FoodShapeDesign, key: string | undefined): Partial<FoodShapeDesign> {
  if (isSolidBodyKey(cur.polyhedronType) || !isSolidBodyKey(key)) return { polyhedronType: key };
  const model = foodShapeOfSolid(key as string, cur.name);
  const next: FoodShapeDesign = cur.rarity !== 'normal' ? rescaleDesignForRarity(cur, 'normal') : { ...cur };
  next.polyhedronType = key;
  next.labyLevel = 0;
  next.isCrasher = false;
  next.isIntangible = model.isIntangible;
  next.color = model.color;
  next.colorMap = model.colorMap;
  next.colorFree = model.colorFree;
  clampFoodShapeDesign(next);
  const out: Record<string, unknown> = {};
  const n = next as unknown as Record<string, unknown>, c = cur as unknown as Record<string, unknown>;
  for (const k of Object.keys(n)) if (k !== 'name' && k !== 'shapeId' && n[k] !== c[k]) out[k] = n[k];
  for (const k of Object.keys(c)) if (!(k in n)) out[k] = undefined;
  return out as Partial<FoodShapeDesign>;
}

export const FoodShapeEditorUI: React.FC<Props> = ({ logic, onUpdate, className, top }) => {
  const keptD = useRef<FoodShapeDesign | null>(null);
  if (!logic) return null;
  const liveD: FoodShapeDesign | null = logic.state.editingShape;
  if (liveD) keptD.current = liveD;
  const d: FoodShapeDesign | null = liveD ?? (logic.state.canvasEntityKind !== 'shape' ? keptD.current : null);

  const patch = (partial: Partial<FoodShapeDesign>) => {
    logic.updateEditingShape(partial);
    onUpdate();
  };
  const setStat = (key: StatKey, v: number) => {
    if (Number.isNaN(v)) return;
    const r = STAT_RANGE[key];
    patch({ [key]: clampNum(v, r.min, r.max) } as Partial<FoodShapeDesign>);
  };
  const backToTank = () => { logic.exitShapeEditing(); onUpdate(); };

  const rm = d ? RARITY_MULTIPLIERS[d.rarity] : null;
  const colourAnimated = !!rm?.isAnimatedColor;
  const isPoly = !!d && isSolidBodyKey(d.polyhedronType);
  const bodyKey = d && typeof d.polyhedronType === 'string' ? d.polyhedronType : '';
  const bodyOptions = [{ value: '', label: 'Flat Shape' }];
  for (const k in POLYHEDRA_DEFS) bodyOptions.push({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) });
  for (const l of logic.state.solidLibrary) { const sd = l.fileData.data as SolidDesign; bodyOptions.push({ value: sd.solidId, label: l.name || sd.name }); }
  if (bodyKey !== '' && !bodyOptions.some(o => o.value === bodyKey)) bodyOptions.push({ value: bodyKey, label: 'Missing Solid' });
  const isRelic = !!d && !isPoly && !!d.look;
  const colourFromMode = !!d && !!RARITY_COLORS[d.rarity];
  const colourLocked = colourAnimated || colourFromMode;
  const shownColor = d ? effectiveShapeColor(d) : '#ffffff';
  const colorTip = colourAnimated ? 'Color is animated in this mode.'
    : d?.rarity === 'shadow' ? 'Color comes from the color mode. Your own color returns on Normal. Shadow shapes are 20% visible by design.'
    : colourFromMode ? 'Color comes from the color mode. Your own color returns on Normal.'
    : 'The shape\'s own color. Shiny, Legendary and Shadow bring their own, and Rainbow and Trans change it all the time.';
  const shapeColorValue: ColorMapValue = d
    ? { color: d.color, colorMap: d.colorMap, colorFree: d.colorFree }
    : { color: '#ffffff', colorMap: undefined, colorFree: undefined };
  const setShapeColor = (v: ColorMapValue) => patch({ color: v.color, colorMap: v.colorMap, colorFree: v.colorFree });

  return (
    <ScrollArea className={className} contentClassName="p-4 space-y-3 overflow-x-hidden">
      {top}
      <Button block size="sm" icon={<ArrowLeft size={14} />} onClick={backToTank}>Back to Tank</Button>

      {!d ? (
        <EmptyState icon={emptyArt(Pentagon)} title="No food shape is loaded" hint="Pick a shape in the Content Library to edit it here." />
      ) : (<>

      <Group title="Shape" icon={headerIcon(HdAiElements)}>
        <FieldRow label="Name" help="Display name. The shape id is made from it." stacked>
          <TextField maxLength={TEXT_LIMITS.NAME} value={d.name} onChange={v => patch({ name: v })} placeholder="e.g. Golden Pentagon" />
        </FieldRow>
        {!isRelic && (
          <SelectRow label="Body" help="A flat shape with sides, or a 3D solid: the game's Cube, Dodecahedron and Icosahedron, or one of your solids from the Content Library. A solid turns as it moves."
            value={bodyKey} onChange={v => { const cur = logic.state.editingShape; if (cur) patch(bodyChangeOf(cur, v === '' ? undefined : v)); }} options={bodyOptions} />
        )}
        <Reveal when={isPoly}>
          <p className="k-row-desc">Its body is a 3D solid. Its look comes from the solid and cannot be edited here. Size and stats can.</p>
        </Reveal>
        {isRelic && (
          <p className="k-row-desc">This shape is drawn from its own parts. Its sides, nesting and color come from them and cannot be edited here. Size and stats can.</p>
        )}
        <Reveal when={!isPoly && !isRelic}>
          <SliderRow label="Sides" help="Polygon sides. 0 = circle. There is no 1 or 2 sided shape, so the slider jumps from circle to triangle."
            value={d.sides} onChange={v => patch({ sides: snapSides(Math.round(v), d.sides) })} dragSnap={nearSides} min={0} max={16} step={1} display={d.sides === 0 ? 'O' : String(d.sides)} />
          <SliderRow label="Nesting" help="Nested inner layers, like the Beta to Delta shapes. 0 = none." deferred
            value={d.labyLevel} onChange={v => patch({ labyLevel: clampNum(Math.round(v), 0, 5) as LabyLevel })} min={0} max={5} step={1} format={fmtNesting} />
        </Reveal>
        <SliderRow label="Size" help="Outer size in game units, the same number the Spawn Tool uses."
          value={d.size} onChange={v => setStat('size', v)} min={STAT_RANGE.size.min} max={STAT_RANGE.size.max} step="any" display={fmtStat(d.size)} />
        <ToggleRow label="Size Randomization" description="Spawns vary a little in size."
          help="Each spawn is a little bigger or smaller. Its health stays the same."
          checked={(d.sizeRandomization ?? 0) > 0} onChange={on => patch({ sizeRandomization: on ? SIZE_RANDOMIZATION_START : 0 })} />
        <Reveal when={(d.sizeRandomization ?? 0) > 0}>
          <SliderRow label="Size Range" help="How much bigger or smaller a spawn can be than the size above. At 20 a shape spawns up to 20 percent larger or smaller."
            value={d.sizeRandomization ?? 0} min={1} max={100} step={1} display={`${Math.round(d.sizeRandomization ?? 0)}%`}
            onChange={v => { if (!Number.isNaN(v)) patch({ sizeRandomization: clampNum(Math.round(v), 1, 100) }); }} />
        </Reveal>
      </Group>

      <Reveal when={!isPoly}>
        <Group title="Color" icon={headerIcon(HdColorPicker)}>
          <SelectRow label="Color Mode"
            help={`Normal, Shiny, Legendary, Shadow, Rainbow or Trans. Changing it moves HP, body damage and XP by the same steps the game uses for that mode (the nested shape tables when nesting is on). Everything else stays as it is. Now: HP ${fmtStat(d.hp)}, XP ${fmtStat(d.xpValue)}.`}
            value={d.rarity} onChange={v => { logic.setEditingShapeRarity(v as Rarity); onUpdate(); }} options={RARITY_OPTIONS} />
          {!isRelic && (<>
          <ColorMapControl value={shapeColorValue} use={CM_USE.SHAPE} onChange={setShapeColor} normalize={lowerHex}
            label="Color" help={colorTip} fixed={colourLocked ? shownColor : undefined} />
          <Reveal when={!colourLocked}><ColorMapSwitch value={shapeColorValue} use={CM_USE.SHAPE} onChange={setShapeColor} /></Reveal>
          </>)}
        </Group>
      </Reveal>

      <Group title="Stats" icon={headerIcon(HdRanking)}>
        <div className="k-grid-2">
          <NumberField id="shape-hp" label="Hit Points" help="How much damage the shape takes before it breaks." value={d.hp} onChange={(e) => setStat('hp', parseFloat(e.target.value))} />
          <NumberField id="shape-body-damage" label="Body Damage" help="The damage the shape deals to a tank that runs into it." value={d.bodyDamage} onChange={(e) => setStat('bodyDamage', parseFloat(e.target.value))} />
          <NumberField id="shape-shield" label="Shield" help="A shield that takes damage before the shape's health does. 0 means no shield." value={d.shield} onChange={(e) => setStat('shield', parseFloat(e.target.value))} />
          <NumberField id="shape-shield-regen" label="Shield Regen" help="Above 0, a hurt shape fills its shield back up and then its health. At 0 a hurt shape stays hurt." value={d.shieldRegen} onChange={(e) => setStat('shieldRegen', parseFloat(e.target.value))} />
          <NumberField id="shape-xp" label="XP Value" help="The XP the shape gives when it breaks, shared by everyone who damaged it, each by their share of the damage." value={d.xpValue} onChange={(e) => setStat('xpValue', parseFloat(e.target.value))} />
          <div className="k-num">
            <span className="k-num-label"><HelpTooltip text="Shown for information. It comes from the size, the same way it does for every other shape." />Mass</span>
            <span className="k-row-desc leading-7">From size: {Math.round(userShapeMass(d))}</span>
          </div>
        </div>
        <SliderRow label="Resist" help="Damage resistance: higher takes less damage from each hit."
          value={d.resist} onChange={v => setStat('resist', v)} min={STAT_RANGE.resist.min} max={STAT_RANGE.resist.max} step="any" display={fmtStat(d.resist)} />
        <SliderRow label="Penetration" help="How well the shape's body damage pushes through shields and bullets."
          value={d.penetration} onChange={v => setStat('penetration', v)} min={STAT_RANGE.penetration.min} max={STAT_RANGE.penetration.max} step="any" display={fmtStat(d.penetration)} />
      </Group>

      <Group title="Movement and Collision" icon={headerIcon(HdPendulum)}>
        <Reveal when={!isPoly}>
          <ToggleRow label="Crasher" description="Chases tanks instead of drifting."
            help="Hostile shape that chases tanks instead of drifting."
            checked={d.isCrasher} onChange={v => patch({ isCrasher: v })} />
          <Reveal when={d.isCrasher}>
            <SliderRow label="Chase Speed" help="How fast the crasher moves toward its target. At 0 it uses the default chase speed."
              value={d.crasherSpeed} onChange={v => setStat('crasherSpeed', v)} min={STAT_RANGE.crasherSpeed.min} max={STAT_RANGE.crasherSpeed.max} step="any" display={d.crasherSpeed === 0 ? 'Default' : fmtStat(d.crasherSpeed)} />
          </Reveal>
        </Reveal>
        <SliderRow label="Drift Speed" help="Idle wander speed. 0 = it holds still."
          value={d.driftSpeed} onChange={v => setStat('driftSpeed', v)} min={STAT_RANGE.driftSpeed.min} max={STAT_RANGE.driftSpeed.max} step="any" display={fmtStat(d.driftSpeed)} />
        <SliderRow label="Pushability" help="How far a hit shoves the shape. 0 = immovable."
          value={d.pushability} onChange={v => setStat('pushability', v)} min={STAT_RANGE.pushability.min} max={STAT_RANGE.pushability.max} step="any" display={fmtStat(d.pushability)} />
        <Reveal when={!isPoly}>
          <ToggleRow label="Intangible" description="Tanks pass through it."
            help="Tanks pass through it and it takes no push, like an egg."
            checked={d.isIntangible === true} onChange={v => patch({ isIntangible: v })} />
        </Reveal>
      </Group>

      </>)}
    </ScrollArea>
  );
};
