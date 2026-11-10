import React from 'react';
import type { EntityType } from '../../game/mapEvents/doc';
import { setAt, removeAt, withIds } from '../../game/mapEvents/docOps';
import { SHAPE_SPEC_RANGE, TOUCH_DEFAULTS, TOUCH_STRENGTH_MAX, TOUCH_THEN, TOUCH_THEN_SHOWN, TOUCH_WHAT, TOUCH_WHAT_SHOWN } from '../../game/mapEvents/thingBody';
import type { ShapeBodySpec, TouchRow } from '../../game/mapEvents/thingBody';
import { isShapeThing } from '../../game/mapEvents/thingWord';
import { FieldRow, Group, IconButton, SelectRow, SliderRow, Switch, ToggleRow } from '../kit/kit';
import { Reveal } from '../kit/Collapse';
import { LongList } from '../kit/LongList';
import { NumberBox } from '../kit/NumberBox';
import { HelpTooltip } from '../shared/HelpTooltip';
import { Plus, Trash2 } from '../ui/icons';
import type { EvCtx } from './fields';

const num = (s: string): number | undefined => { const v = Number(s); return s.trim() !== '' && Number.isFinite(v) ? v : undefined; };
type SpecNum = keyof typeof SHAPE_SPEC_RANGE;
const SPEC_BOXES: [SpecNum, string, string][] = [
  ['health', 'Hit Points', 'How much damage it takes before it breaks. Empty: the shape\'s own.'],
  ['bodyDamage', 'Body Damage', 'The damage it deals to a tank that runs into it.'],
  ['roundHit', 'Hit On Rounds', 'How hard it hits a round that touches it. Low: rounds live long enough to push it. Empty: its Body Damage.'],
  ['shield', 'Shield', 'A shield that takes damage before its health does. 0 means no shield.'],
  ['shieldRegen', 'Shield Regen', 'Above 0, a hurt one fills its shield back up and then its health. At 0 a hurt one stays hurt.'],
  ['xp', 'XP Value', 'The XP it gives when it breaks, shared by everyone who damaged it. 0: bots never farm it.'],
  ['resist', 'Resist', 'Damage resistance: higher takes less damage from each hit.'],
  ['penetration', 'Penetration', 'How well its body damage pushes through shields and bullets.'],
  ['drift', 'Drift Speed', 'Idle wander speed. 0 = it holds still. Stands Still holds it still too.'],
  ['pushability', 'Pushability', 'How much a rock bounces it back.'],
  ['weight', 'Weight', 'How hard it is to push, by a round or a tank. A food pentagon is 8, the Soccer ball 1.'],
  ['push', 'Push Share', 'How much of a push it takes. 1 a whole one.'],
  ['keep', 'Speed Kept A Second', 'How much of its speed it keeps each second after a push or a throw, in percent. The Soccer ball keeps 23, the flag of Capture the Flag 0.0041: it stops at once.'],
  ['spin', 'Turns By Itself', 'Degrees a second it turns on its own, whatever it does. Below 0 the other way. The flag of Capture the Flag turns 143 a second the other way.'],
  ['thrown', 'Thrown Out When Born', 'How far it slides when it appears, in world units: the way a Spawn that spreads its bodies out faces it, else a new way each time. It is seen where it is born, then slides out, slowing by its Speed Kept A Second. The flag of Capture the Flag is thrown 167.'],
];
const PER_OPTIONS = [{ value: 'touch', label: 'At Each New Touch' }, { value: 'second', label: 'Each Second While It Touches' }];
const UNIT_OPTIONS = [{ value: 'pct', label: 'Percent Of Its Health' }, { value: 'points', label: 'Points' }];

export function typeIsShapeBody(type: EntityType): boolean {
  const t = type.forms[0]?.tank;
  return typeof t === 'string' ? isShapeThing(t) : !!t && t.list.length > 0 && t.list.every(c => isShapeThing(c.word));
}

export const ShapeSettingsCard: React.FC<{ type: EntityType; ti: number; ctx: EvCtx }> = ({ type, ti, ctx }) => {
  const spec = type.shape ?? {};
  const put = (k: keyof ShapeBodySpec, v: number | boolean | undefined) => ctx.commit(d => {
    const next: ShapeBodySpec = { ...(type.shape ?? {}) };
    if (v === undefined) delete next[k]; else (next as Record<string, unknown>)[k] = v;
    return setAt(d, ['types', ti, 'shape'], Object.keys(next).length > 0 ? next : undefined);
  });
  const box = (k: SpecNum, v: number | undefined) => { if (v === undefined) { put(k, undefined); return; } const g = SHAPE_SPEC_RANGE[k]; put(k, Math.max(g.min, Math.min(g.max, v))); };
  return (
    <Group title="Shape Settings" foldKey="type-shape" collapsible defaultOpen>
      <div className="k-grid-2">
        {SPEC_BOXES.map(([k, label, tip]) => (
          <label key={k} className="k-num"><span className="k-num-label"><HelpTooltip text={tip} />{label}</span>
            <NumberBox className="k-field k-num-field" value={spec[k] ?? ''} min={SHAPE_SPEC_RANGE[k].min} max={SHAPE_SPEC_RANGE[k].max} placeholder="Its Own" onChange={e => box(k, num(e.target.value))} />
          </label>
        ))}
      </div>
      <ToggleRow label="Intangible" help="Tanks pass through it and it takes no push, like an egg." checked={spec.intangible === true} onChange={v => put('intangible', v || undefined)} />
      <ToggleRow label="Rolls With Its Path" help="It turns as it rolls, by how far it goes, as the Soccer ball does." checked={spec.rolls === true} onChange={v => put('rolls', v || undefined)} />
      <ToggleRow label="A Round Born Inside Does Not Push It" help="A round fired from inside it hurts it but does not push it." checked={spec.noInsidePush === true} onChange={v => put('noInsidePush', v || undefined)} />
      <ToggleRow label="Appears Whole When Born" help="It is seen at its full size and colour the moment it is born, as a tank is. Off: it grows in and fades in as food does. The flag of Capture the Flag appears whole." checked={spec.bornWhole === true} onChange={v => put('bornWhole', v || undefined)} />
    </Group>
  );
};

const TouchRowCard: React.FC<{ row: TouchRow; ti: number; ri: number; ctx: EvCtx }> = ({ row, ti, ri, ctx }) => {
  const path = ['types', ti, 'touch', ri];
  const put = (k: keyof TouchRow, v: unknown) => ctx.commit(d => setAt(d, [...path, k], v));
  const amounts = row.then === 'damage' || row.then === 'heal';
  const unit = row.unit ?? TOUCH_DEFAULTS.unit;
  return (
    <div className="k-ev-card-row">
      <div className="k-ev-card-head">
        <div className="k-ev-card-pick"><span className="k-count">{TOUCH_WHAT_SHOWN[row.what]}: {TOUCH_THEN_SHOWN[row.then]}</span></div>
        <span data-tip="On: this row acts. Off: it is kept and does nothing."><Switch checked={row.off !== true} label="This row acts" onChange={v => put('off', v ? undefined : true)} /></span>
        <IconButton size="sm" label="Remove this row" onClick={() => ctx.commit(d => removeAt(d, ['types', ti, 'touch'], ri))}><Trash2 size={13} /></IconButton>
      </div>
      <SelectRow label="When It Touches" help="What it touches. Bosses: only a boss the boss spawner sent, never a boss by its class. Food Shapes: the map's food and the shapes a Map Event made." value={row.what} options={TOUCH_WHAT.map(w => ({ value: w, label: TOUCH_WHAT_SHOWN[w] }))} onChange={v => put('what', v)} />
      <SelectRow label="Then It" help="What it does. Bounces Off: it is thrown off what it touched, as a Bounce area throws. Dies: only what can die. Gets Damaged, Heals: by the amount below. Nobody gets the kill." value={row.then} options={TOUCH_THEN.map(w => ({ value: w, label: TOUCH_THEN_SHOWN[w] }))} onChange={v => put('then', v)} />
      <Reveal when={row.then === 'bounce'}>{() => (
        <SliderRow label="Bounce Strength" help="How hard it is thrown off, on the Bounce area's scale. 0.1 throws a resting Soccer ball about 150 units off a wall." value={row.strength ?? TOUCH_DEFAULTS.strength}
          min={0} max={TOUCH_STRENGTH_MAX} step={0.05} display={(row.strength ?? TOUCH_DEFAULTS.strength).toFixed(2)} onChange={v => { if (!Number.isNaN(v)) put('strength', Math.max(0, Math.min(TOUCH_STRENGTH_MAX, v))); }} />
      )}</Reveal>
      <Reveal when={amounts}>{() => (<>
        <FieldRow label="Amount" help="How much, in the unit below.">
          <NumberBox className="k-field k-ev-num" value={row.amount ?? TOUCH_DEFAULTS.amount} min={0} max={unit === 'pct' ? 100 : 1e9} onChange={e => { const n = num(e.target.value); if (n !== undefined) put('amount', Math.max(0, unit === 'pct' ? Math.min(100, n) : n)); }} />
        </FieldRow>
        <SelectRow label="Unit" help="Percent of its full health, or points of health." value={unit} options={UNIT_OPTIONS} onChange={v => put('unit', v)} />
        <SelectRow label="How Often" help="Once at each new touch, or each second while it touches." value={row.per ?? TOUCH_DEFAULTS.per} options={PER_OPTIONS} onChange={v => put('per', v)} />
      </>)}</Reveal>
    </div>
  );
};

export const TouchRulesCard: React.FC<{ type: EntityType; ti: number; ctx: EvCtx }> = ({ type, ti, ctx }) => {
  const rows = type.touch ?? [];
  const add = () => ctx.commit(d => {
    const r = withIds(d, id => ({ id: id(), what: 'walls', then: 'bounce', strength: TOUCH_DEFAULTS.strength }) as TouchRow);
    return setAt(r.doc, ['types', ti, 'touch'], [...rows, r.value]);
  });
  return (
    <Group title="When It Touches" foldKey="type-touch" collapsible defaultOpen={rows.length > 0} count={rows.length}
      right={<IconButton size="sm" label="Add A Touch" onClick={add}><Plus size={14} /></IconButton>}>
      <LongList estimate={150} count={rows.length} rowKey={i => String(rows[i].id)} renderRow={i => <TouchRowCard row={rows[i]} ti={ti} ri={i} ctx={ctx} />} />
    </Group>
  );
};
