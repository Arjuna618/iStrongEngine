import React from 'react';
import type { CarryFollow, EntityForm, EntityType, Row } from '../../game/mapEvents/doc';
import { SIDE_WORDS, CARRY_FOLLOW_DEF, CARRY_FOLLOW_RANGE } from '../../game/mapEvents/doc';
import { addForm, setAt, setBecome, removeAt, makeRow, withIds } from '../../game/mapEvents/docOps';
import { shippedFormOf } from '../../game/mapEvents/presets/index';
import { Button, FieldRow, Group, IconButton, NumberField, SelectRow, Switch, TextField, ToggleRow } from '../kit/kit';
import { Reveal } from '../kit/Collapse';
import { LongList } from '../kit/LongList';
import { NumberBox } from '../kit/NumberBox';
import { EvSelect } from './EvSelect';
import { ChipsField, NumField, OrderField, RowFields, TankField, ThingField, TextWords, type EvCtx } from './fields';
import { HelpTooltip } from '../shared/HelpTooltip';
import { Plus, Trash2 } from '../ui/icons';
import { MAP_TANK_HEAD } from '../../game/mapEvents/thingWord';
import { ShapeSettingsCard, TouchRulesCard, typeIsShapeBody } from './thingCards';
import { SMALL_FIX } from '../../game/smallFixSwitch';

const num = (s: string): number | undefined => { const v = Number(s); return s.trim() !== '' && Number.isFinite(v) ? v : undefined; };
const CarryRows: React.FC<{ type: EntityType; put: (k: 'carry', v: EntityType['carry']) => void }> = ({ type, put }) => {
  const c = type.carry ?? {};
  const fo = c.follow;
  const setFo = (k: keyof CarryFollow, v: number | undefined) => put('carry', { ...c, follow: { ...fo, [k]: v } });
  return (
    <>
      <SelectRow label="Picked Up By" help="Any Hit Of Another Side: the first hit of another side's tank takes it, and its own side's hit or a wall destroys it. Its Killer Of Another Side: it takes its hits as any body; the blow that would kill it takes it to that tank instead (its health as before that blow); its own side, a food shape or a Map Entity that kills it destroys it." value={c.by === 'kill' ? 'kill' : 'hit'} options={[{ value: 'hit', label: 'Any Hit Of Another Side' }, { value: 'kill', label: 'Its Killer Of Another Side' }]} onChange={v => put('carry', { ...c, by: v === 'kill' ? 'kill' : undefined })} />
      <ToggleRow label="One At A Time" help="On: a tank that already carries one cannot take another: its killing blow leaves that one just above nothing." checked={c.one === true} onChange={v => put('carry', { ...c, one: v || undefined })} />
      <ToggleRow label="Bots Bring It Home" help="On: a bot that carries it goes to its own base as fast as it can, fighting what is in its sight on the way and farming nothing. Off: it goes where its own mind takes it." checked={c.home !== false} onChange={v => put('carry', { ...c, home: v ? undefined : false })} />
      <SelectRow label="How It Rides" help="On Its Carrier's Back: a little behind its middle. On A Rubber Band: it circles close to its carrier's middle and swings behind as the carrier moves." value={fo ? 'band' : 'back'} options={[{ value: 'back', label: "On Its Carrier's Back" }, { value: 'band', label: 'On A Rubber Band' }]} onChange={v => put('carry', { ...c, follow: v === 'band' ? { ...CARRY_FOLLOW_DEF } : undefined })} />
      <Reveal when={!!fo}>{() => (
        <>
          <FieldRow label="Distance From Its Middle" help="How far from its carrier's middle it rides, in world units."><NumBox value={fo?.distance} min={CARRY_FOLLOW_RANGE.distance.min} max={CARRY_FOLLOW_RANGE.distance.max} placeholder={String(CARRY_FOLLOW_DEF.distance)} onChange={v => setFo('distance', v)} /></FieldRow>
          <FieldRow label="Circles, Degrees A Second" help="How fast its place turns round its carrier. Below 0: the other way round."><NumBox value={fo?.circle} min={CARRY_FOLLOW_RANGE.circle.min} max={CARRY_FOLLOW_RANGE.circle.max} placeholder={String(CARRY_FOLLOW_DEF.circle)} onChange={v => setFo('circle', v)} /></FieldRow>
          <FieldRow label="Pull, Percent" help="How much of the gap to its place it wants to close each thirtieth of a second. Higher: it keeps closer."><NumBox value={fo?.pull} min={CARRY_FOLLOW_RANGE.pull.min} max={CARRY_FOLLOW_RANGE.pull.max} placeholder={String(CARRY_FOLLOW_DEF.pull)} onChange={v => setFo('pull', v)} /></FieldRow>
          <FieldRow label="Top Speed" help="The fastest it moves to its place, in world units a second (it flies to whoever takes it from afar at this speed)."><NumBox value={fo?.top} min={CARRY_FOLLOW_RANGE.top.min} max={CARRY_FOLLOW_RANGE.top.max} placeholder={String(CARRY_FOLLOW_DEF.top)} onChange={v => setFo('top', v)} /></FieldRow>
          <FieldRow label="Swing, Percent" help="How much of its last motion it keeps each thirtieth of a second: the rubber band. 0: no swing."><NumBox value={fo?.keep} min={CARRY_FOLLOW_RANGE.keep.min} max={CARRY_FOLLOW_RANGE.keep.max} placeholder={String(CARRY_FOLLOW_DEF.keep)} onChange={v => setFo('keep', v)} /></FieldRow>
        </>
      )}</Reveal>
    </>
  );
};

const NumBox: React.FC<{ value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string }> = ({ value, onChange, min, max, step, placeholder }) => (
  <NumberBox className="k-field k-ev-num" value={value ?? ''} min={min} max={max} step={step} placeholder={placeholder} onChange={e => onChange(num(e.target.value))} />
);
const TEAM_OPTIONS = SIDE_WORDS.map(s => ({ value: s.word, get label() { return s.shown; } }));
const CAMP_OPTIONS = [{ value: 'none', label: 'Its Side Alone' }, { value: 'boss', label: 'With The Bosses' }, { value: 'shape', label: 'With The Shapes' }];
const SKILLS: [string, string][] = [['bodyDamage', 'Body Damage'], ['maxHealth', 'Max Health'], ['bulletSpeed', 'Bullet Speed'], ['bulletHealth', 'Bullet Health'], ['bulletPenetration', 'Bullet Penetration'], ['bulletDamage', 'Bullet Damage'], ['reload', 'Reload'], ['movementSpeed', 'Movement Speed'], ['shieldRegen', 'Shield Regeneration'], ['shieldCapacity', 'Shield Capacity']];

const tankWord = (f: EntityForm): string | undefined => (typeof f.tank === 'string' ? f.tank : undefined);

const MapTankRow: React.FC<{ form: EntityForm; path: (string | number)[]; ctx: EvCtx }> = ({ form, path, ctx }) => {
  const tanks = ctx.doc?.tanks ?? [];
  const word = tankWord(form);
  return (
    <>
      <Reveal when={tanks.length > 0}>{() => (
        <SelectRow label="Or A Tank Of This Map" help="A tank this map keeps itself, so it goes wherever the map goes." value={word?.startsWith(MAP_TANK_HEAD) ? word : ''}
          options={[{ value: '', label: 'None' }, ...tanks.map(t => ({ value: MAP_TANK_HEAD + t.id, label: t.name || 'Tank' }))]} onChange={v => { if (v) ctx.commit(d => setAt(d, [...path, 'tank'], v)); }} />
      )}</Reveal>
      <Button size="sm" variant="ghost" block title="The tank on the Canvas tool now is kept in this map, and this form becomes it" onClick={() => ctx.commit(d => {
        const r = withIds(d, id => ({ id: id(), name: ctx.logic.resolveTankDisplayName(ctx.logic.state.currentTankFileName) || 'My Tank', data: structuredClone(ctx.logic.getTankExportData()) as unknown as Record<string, unknown> }));
        return setAt(setAt(r.doc, ['tanks'], [...(r.doc.tanks ?? []), r.value]), [...path, 'tank'], MAP_TANK_HEAD + r.value.id);
      })}>Keep The Canvas Tank In This Map</Button>
    </>
  );
};

const FormCard: React.FC<{ type: EntityType; ti: number; fi: number; ctx: EvCtx }> = ({ type, ti, fi, ctx }) => {
  const form = type.forms[fi];
  const path = ['types', ti, 'forms', fi];
  const put = (k: keyof EntityForm, v: unknown) => ctx.commit(d => setAt(d, [...path, k], v));
  const list = typeof form.tank === 'object' ? form.tank.list : null;
  const others = type.forms.filter(f => f.id !== form.id);
  const hasPlan = (ctx.doc?.plans?.length ?? 0) > 0 || ctx.logic.state.multiAreaConfig.areas.some(a => (a.mapConfig.events?.plans?.length ?? 0) > 0);
  const when = () => (form.tank as { when: 'eachTime' | 'oncePerPlace' }).when;
  return (
    <Group title={form.name} foldKey={`form-${form.id}`} collapsible defaultOpen={fi === 0} right={fi > 0 ? <IconButton size="sm" label="Remove this form" onClick={() => ctx.commit(d => removeAt(d, ['types', ti, 'forms'], fi))}><Trash2 size={13} /></IconButton> : undefined}>
      <FieldRow stacked label="Name Of This Form" help="The name of this form, in the lists of this window. Players never read it."><TextField value={form.name} onChange={v => put('name', v)} /></FieldRow>
      <FieldRow stacked label="What It Is" help="Anything of the Content Library: a tank, a shape of the food or your own, a ball, a flag.">
        <Reveal when={!list}>{() => <ThingField value={tankWord(form)} ctx={ctx} onChange={w => put('tank', w)} />}</Reveal>
        <Reveal when={!!list}>{() => (
          <div className="k-ev-stack">
            <LongList estimate={56} count={list!.length} rowKey={j => String(j)} renderRow={j => { const c = list![j]; return (
                <div className="k-ev-card-row">
                  <div className="k-ev-card-head">
                    <div className="k-ev-card-pick"><ThingField value={c.word} ctx={ctx} onChange={w => put('tank', { list: list!.map((x, k) => (k === j ? { ...x, word: w } : x)), when: when() })} /></div>
                    <NumberBox className="k-field k-ev-num" value={c.weight} step={0.1} min={0} title="Its share" onChange={e => { const n = num(e.target.value); if (n !== undefined) put('tank', { list: list!.map((x, k) => (k === j ? { ...x, weight: n } : x)), when: when() }); }} />
                    <IconButton size="sm" label="Take it off" disabled={list!.length < 2} onClick={() => put('tank', { list: list!.filter((_, k) => k !== j), when: when() })}><Trash2 size={13} /></IconButton>
                  </div>
                </div>
              ); }} />
            <ThingField value={undefined} ctx={ctx} add title="Add One" onChange={w => put('tank', { list: [...list!, { word: w, weight: 1 }], when: when() })} />
          </div>
        )}</Reveal>
      </FieldRow>
      <Reveal when={!list}>{() => <Button size="sm" variant="ghost" block title="Each birth picks one of several tanks" onClick={() => put('tank', { list: [{ word: tankWord(form) ?? 'basic', weight: 1 }], when: 'eachTime' })}>Several Tanks</Button>}</Reveal>
      <Reveal when={!list}>{() => <MapTankRow form={form} path={path} ctx={ctx} />}</Reveal>
      <SelectRow label="Team Colour" help="As Its File: the colour of its tank file. Its Side's: the colour of its team. A Colour Of The Map: a number of the colour map." value={form.colour?.use ?? 'file'} onChange={v => put('colour', v === 'file' ? undefined : { use: v, slot: form.colour?.slot ?? 3 })}
        options={[{ value: 'file', label: 'As Its File' }, { value: 'team', label: 'Its Side\'s' }, { value: 'slot', label: 'A Colour Of The Map' }]} />
      <Reveal when={form.colour?.use === 'slot'}>{() => (
        <FieldRow label="Colour Number" help="A number of the colour map."><NumBox value={form.colour?.slot ?? 0} min={0} max={255} onChange={n => { if (n !== undefined) put('colour', { use: 'slot', slot: n }); }} /></FieldRow>
      )}</Reveal>
      <FieldRow stacked label="Its Name In This Form" help="The name it shows while in this form. Empty: its usual one."><TextField value={form.shownName ?? ''} onChange={v => put('shownName', v || undefined)} /></FieldRow>
      <SelectRow label="Stands With" help="With The Bosses: a boss class, whom others of that class never hurt. With The Shapes: as the food is." value={form.side?.camp ?? ''} onChange={v => put('side', { team: form.side?.team ?? type.side.team, camp: v || undefined })} options={[{ value: '', label: 'As Its Type' }, ...CAMP_OPTIONS]} />
      <SelectRow label="Side In This Form" help="The side it fights for while in this form." value={form.side?.team ?? ''} onChange={v => put('side', v ? { team: v, camp: form.side?.camp } : undefined)} options={[{ value: '', label: 'The Type\'s' }, ...TEAM_OPTIONS]} />
      <FieldRow label="Size" help="How big it is in this form. Empty: its file's."><NumBox value={form.size} min={1} placeholder="Its File's" onChange={v => put('size', v)} /></FieldRow>
      <FieldRow label="Score In This Form" help="The score it carries in this form. Empty: the Type's."><NumBox value={form.score} min={0} placeholder="The Type's" onChange={v => put('score', v)} /></FieldRow>
      <FieldRow stacked label="Kill Line In This Form" help="The line its killer reads while it is in this form."><TextWords value={form.killLine ?? ''} tokens={['name', 'tank']} onChange={v => put('killLine', v || undefined)} /></FieldRow>
      <FieldRow stacked label="How It Moves In This Form" help="A walking order for this form. Stands Where It Is: none."><OrderField value={form.order} path={[...path, 'order']} ctx={ctx} /></FieldRow>
      <FieldRow stacked label="Tags While In This Form" help="The tags it counts under while in this form."><RowlessTags value={form.tags ?? []} onChange={v => put('tags', v.length ? v : undefined)} ctx={ctx} /></FieldRow>
      <SelectRow label="When It Dies" help="It Dies: that is the end. Comes Back As This, or Becomes another form: a new body stands on the spot." value={form.onDeath ? String(form.onDeath.to) : ''} onChange={v => put('onDeath', v ? { ...(form.onDeath ?? {}), to: v === 'same' ? 'same' : Number(v), team: form.onDeath?.team ?? 'form' } : undefined)}
        options={[{ value: '', label: 'It Dies' }, { value: 'same', label: 'Comes Back As This' }, ...others.map(f => ({ value: String(f.id), label: `Becomes ${f.name}` }))]} />
      <Reveal when={form.onDeath}>{() => (<>
        <SelectRow label="On The Side Of" help="Which side the new body fights for." value={form.onDeath!.team ?? 'form'} onChange={v => put('onDeath', { ...form.onDeath, team: v })} options={[{ value: 'form', label: 'On Its Form\'s Side' }, { value: 'killer', label: 'On Its Killer\'s Side' }]} />
        <FieldRow label="After" help="How long until it happens."><NumField value={form.onDeath!.delay ?? 0} unit="s" onChange={v => put('onDeath', { ...form.onDeath, delay: v })} /></FieldRow>
        <FieldRow label="Cannot Be Hurt For" help="For this long after the change nothing can hurt it."><NumField value={form.onDeath!.grace ?? 0} unit="s" onChange={v => put('onDeath', { ...form.onDeath, grace: v })} /></FieldRow>
      </>)}</Reveal>
      <SelectRow label="After Some Time" help="After a time by itself it turns into another form." value={form.after ? String(form.after.to) : ''} onChange={v => put('after', v ? { seconds: form.after?.seconds ?? 60, to: Number(v), how: form.after?.how ?? 'morph', refill: form.after?.refill } : undefined)}
        options={[{ value: '', label: 'Nothing' }, ...others.map(f => ({ value: String(f.id), label: `It Turns Into ${f.name}` }))]} />
      <Reveal when={form.after}>{() => (<>
        <FieldRow label="After" help="How long until it happens."><NumField value={form.after!.seconds} unit="s" onChange={v => put('after', { ...form.after, seconds: v })} /></FieldRow>
        <SelectRow label="How" help="Change Tank: the same body, its health share kept. Become: a new body at full health." value={form.after!.how} onChange={v => put('after', { ...form.after, how: v })} options={[{ value: 'morph', label: 'Change Tank: the same body' }, { value: 'become', label: 'Become: a new body' }]} />
        <SelectRow label="It Fills" help="What a Change Tank fills up." value={form.after!.refill ?? 'none'} onChange={v => put('after', { ...form.after, refill: v })} options={[{ value: 'none', label: 'Fills Nothing' }, { value: 'shield', label: 'Fills Its Shield' }, { value: 'all', label: 'Fills Health And Shield' }]} />
      </>)}</Reveal>
      <Reveal when={hasPlan}>{() => (
        <FieldRow stacked label="Evolve At Waves" help="At these waves of a Wave Plan this form changes tank, for the bodies born from then on.">
          <div className="k-ev-stack">
            <LongList estimate={56} count={form.evolve?.length ?? 0} rowKey={j => String(form.evolve![j].id)} renderRow={j => { const ev = form.evolve![j]; return (
                <div className="k-ev-card-row">
                  <div className="k-ev-card-head">
                    <NumberBox className="k-field k-ev-num" value={ev.wave} min={1} title="At Wave" onChange={e => { const n = num(e.target.value); if (n !== undefined) ctx.commit(d => setAt(d, [...path, 'evolve', j, 'wave'], n)); }} />
                    <div className="k-ev-card-pick"><TankField value={ev.tank} ctx={ctx} onChange={w => ctx.commit(d => setAt(d, [...path, 'evolve', j, 'tank'], w))} /></div>
                    <IconButton size="sm" label="Remove" onClick={() => ctx.commit(d => removeAt(d, [...path, 'evolve'], j))}><Trash2 size={13} /></IconButton>
                  </div>
                </div>
              ); }} />
            <Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={() => ctx.commit(d => { const r = withIds(d, id => ({ id: id(), wave: (form.evolve?.[form.evolve.length - 1]?.wave ?? 0) + 5, tank: tankWord(form) ?? 'basic', plan: d?.plans?.[0] ? { id: d.plans[0].id, n: d.plans[0].name } : undefined })); return setAt(r.doc, [...path, 'evolve'], [...(form.evolve ?? []), r.value]); })}>Add A Wave</Button>
          </div>
        </FieldRow>
      )}</Reveal>
    </Group>
  );
};

const RowlessTags: React.FC<{ value: { id: number; n: string }[]; onChange: (v: { id: number; n: string }[]) => void; ctx: EvCtx }> = ({ value, onChange, ctx }) => (
  <ChipsField values={value.map(r => ({ key: String(r.id), label: r.n }))} offer={(ctx.doc?.tags ?? []).map(t => ({ key: String(t.id), label: t.name }))} addLabel="Add A Tag"
    onAdd={k => { const t = ctx.doc?.tags?.find(x => String(x.id) === k); if (t) onChange([...value, { id: t.id, n: t.name }]); }} onRemove={k => onChange(value.filter(r => String(r.id) !== k))} />
);

export const EntityTypePage: React.FC<{ type: EntityType; ti: number; ctx: EvCtx }> = ({ type, ti, ctx }) => {
  const put = (k: keyof EntityType, v: unknown) => ctx.commit(d => setAt(d, ['types', ti, k], v));
  const first = type.forms[0];
  const second = type.forms[1];
  const becomes = !!first?.onDeath && first.onDeath.to !== 'none';
  const bothWays = !!second?.onDeath;
  return (
    <div className="k-ev-page">
      <div className="k-ev-detail-head"><span className="k-ev-detail-title">{type.name}</span></div>
      <Group title="What It Is">
        <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={type.name} onChange={v => put('name', v)} /></FieldRow>
        <SelectRow label="Side" help="The side it fights for." value={type.side.team} options={TEAM_OPTIONS} onChange={v => put('side', { ...type.side, team: v })} />
        <SelectRow label="Stands With" help="With The Bosses: a side's boss class, whom others of that class never hurt." value={type.side.camp ?? 'none'} options={CAMP_OPTIONS} onChange={v => put('side', { ...type.side, camp: v })} />
        <SelectRow label="Mind" help="Thinks For Itself: as any bot. Follows Its Order: walks by How It Moves and shoots the nearest hostile in sight. None: it does nothing." value={type.brain ?? 'full'} options={[{ value: 'full', label: 'Thinks For Itself' }, { value: 'order', label: 'Follows Its Order' }, { value: 'none', label: 'None' }]} onChange={v => put('brain', v)} />
        <ToggleRow label="Counts As A Boss" help="In kill counts and in how others decide to hunt it." checked={!!type.bossTier} onChange={v => put('bossTier', v || undefined)} />
        <FieldRow stacked label="Names" help="One is drawn at its birth and kept through a Change Tank. Leave it empty: no name of its own.">
          <TextField value={(type.names ?? []).join(', ')} onChange={v => { const l = v.split(',').map(s => s.trim()).filter(Boolean); put('names', l.length ? l : undefined); }} />
        </FieldRow>
        <FieldRow stacked label="Name Of Its Class" help="What the leaderboard calls it, beside its name: Celestial."><TextField value={type.classWord ?? ''} onChange={v => put('classWord', v || undefined)} /></FieldRow>
        <FieldRow stacked label="Note" help="A note for yourself. It changes nothing in play."><TextField value={type.note ?? ''} onChange={v => put('note', v || undefined)} /></FieldRow>
        <SelectRow label="Folder" help="Folders tidy the lists. A folder changes nothing in play." value={type.folder === undefined ? '' : String(type.folder)} onChange={v => put('folder', v ? Number(v) : undefined)} options={[{ value: '', label: 'No Folder' }, ...(ctx.doc?.folders ?? []).map(f => ({ value: String(f.id), label: f.name }))]} />
        <Reveal when={shippedFormOf(ctx.doc, 'types', type.id, ctx.logic.state.gameModeConfig) !== undefined}><Button size="sm" variant="ghost" block title="This Entity Type as the mode ships it. Undo brings yours back." onClick={() => { const was = shippedFormOf(ctx.doc, 'types', type.id, ctx.logic.state.gameModeConfig); if (was !== undefined) ctx.commit(d => setAt(d, ['types', ti], was)); }}>Restore As Shipped</Button></Reveal>
      </Group>
      <Group title="Forms" count={type.forms.length} right={<IconButton size="sm" label="Add A Form" onClick={() => ctx.commit(d => addForm(d!, type.id, `Form ${type.forms.length + 1}`, tankWord(first) ?? 'basic').doc)}><Plus size={14} /></IconButton>}>
        <ToggleRow label="Become Upon Death" help="At its death a new body stands on the very spot, at full health." checked={becomes} onChange={v => ctx.commit(d => setBecome(d!, type.id, v ? (typeof second?.tank === 'string' ? second.tank : 'basic') : null))} />
        <Reveal when={becomes}><ToggleRow label="Works Both Ways" help="When that one dies, this one comes back." checked={bothWays} onChange={v => ctx.commit(d => setBecome(d!, type.id, typeof second?.tank === 'string' ? second.tank : 'basic', v))} /></Reveal>
        <LongList estimate={120} count={type.forms.length} rowKey={i => String(type.forms[i].id)} renderRow={i => <FormCard type={type} ti={ti} fi={i} ctx={ctx} />} />
      </Group>
      <Group title="How It Acts" foldKey="type-acts" collapsible defaultOpen={false}>
        <ToggleRow label="Stands Still" help="On: it stays where it was placed. Off: it walks by its order or its mind." checked={type.stands !== false && type.stands !== undefined ? true : type.stands === undefined ? true : false} onChange={v => put('stands', v)} />
        <ToggleRow label="Can Die" help="Off: nothing can kill it." checked={type.canDie !== false} onChange={v => put('canDie', v)} />
        <ToggleRow label="Can Stand In A Wall" help="On: walls do not push it out, so it can stand half inside one and is drawn under it, as a door's button." checked={type.inWalls === true} onChange={v => put('inWalls', v)} />   { }
        <ToggleRow label="Seen By Bots" help="Off: bots act as if it were not there." checked={type.seenByBots !== false} onChange={v => put('seenByBots', v)} />
        <ToggleRow label="Can Be Healed" help="Off: healing does nothing to it." checked={type.canBeHealed !== false} onChange={v => put('canBeHealed', v)} />
        <ToggleRow label="Crashers Ignore It" help="On: crashers never go for it." checked={!!type.crashersIgnore} onChange={v => put('crashersIgnore', v || undefined)} />
        <ToggleRow label="Can Be Controlled" help="On: a player of its side can press F to take it over: the mouse aims it, the trigger fires it and the movement keys move it if it can move. F again gives it back." checked={type.control !== undefined} onChange={v => put('control', v ? { word: 'dominator' } : undefined)} />
        <Reveal when={type.control !== undefined}>{() => <FieldRow stacked label="Its Word In The Lines" help="What the lines call it: You are now controlling the dominator."><TextField value={type.control?.word ?? ''} onChange={v => put('control', { word: v || undefined })} /></FieldRow>}</Reveal>
        <FieldRow label="Keeps Away From Portals" help="It never travels by a portal and keeps this much farther from every portal than a bot does, going round it. Empty: as every bot."><NumBox value={type.portalKeep} min={0} max={3000} placeholder="As A Bot" onChange={v => put('portalKeep', v)} /></FieldRow>
        <Reveal when={SMALL_FIX.GH583 === 0 || typeIsShapeBody(type)}>
                <ToggleRow label="Can Be Carried" help="On: a tank of another side takes it (by any hit, or by the blow that would kill it: Picked Up By) and it rides on that tank; it drops where its carrier dies. Off: hits hurt it." checked={type.carry !== undefined} onChange={v => put('carry', v ? {} : undefined)} />
        <Reveal when={type.carry !== undefined}>{() => <FieldRow stacked label="Line For Whoever Picks It Up" help="What the player reads when he picks it up. Empty: nothing."><TextField value={type.carry?.line ?? ''} onChange={v => put('carry', { ...type.carry, line: v || undefined })} /></FieldRow>}</Reveal>
        <Reveal when={SMALL_FIX.R941 !== 0 && type.carry !== undefined}>{() => <CarryRows type={type} put={put} />}</Reveal>
        </Reveal>
        <SelectRow label="Pushed" help="As Its File: its own weight. Can Be Pushed, or Cannot." value={type.pushable === undefined ? 'file' : type.pushable ? 'yes' : 'no'} options={[{ value: 'file', label: 'As Its File' }, { value: 'yes', label: 'Can Be Pushed' }, { value: 'no', label: 'Cannot Be Pushed' }]} onChange={v => put('pushable', v === 'file' ? undefined : v === 'yes')} />
        <SelectRow label="When A Tank Rams It" help="As A Tank: a ram hurts both as tanks do. As A Food Shape: as a shape is hit." value={type.contact ?? 'tank'} options={[{ value: 'tank', label: 'As A Tank' }, { value: 'shape', label: 'As A Food Shape' }]} onChange={v => put('contact', v)} />
        <FieldRow stacked label="How It Moves" help="A walking order. Stands Where It Is: none."><OrderField value={type.order} path={['types', ti, 'order']} ctx={ctx} /></FieldRow>
        <FieldRow label="Sight" help="How far it sees, in world units. Empty: its file's."><NumBox value={type.sight} min={0} placeholder="Its File's" onChange={v => put('sight', v)} /></FieldRow>
        <FieldRow label="Health" help="How much health it has. Empty: its file's."><NumBox value={type.health} min={0} placeholder="Its File's" onChange={v => put('health', v)} /></FieldRow>
        <FieldRow label="Level" help="The level it stands on. Empty: its file's."><NumBox value={type.level} min={0} placeholder="Its File's" onChange={v => put('level', v)} /></FieldRow>
      </Group>
      <Reveal when={typeIsShapeBody(type)}>{() => <ShapeSettingsCard type={type} ti={ti} ctx={ctx} />}</Reveal>
      <TouchRulesCard type={type} ti={ti} ctx={ctx} />
      <Group title="Skill Points" foldKey="type-skills" collapsible defaultOpen={false}>
                <div className="k-grid-2">
          {SKILLS.map(([k, label]) => (
            <label key={k} className="k-num"><span className="k-num-label"><HelpTooltip text={`Its points in ${label}. Empty: its file's.`} />{label}</span>
              <NumberBox className="k-field k-num-field" value={type.skills?.[k] ?? ''} min={0} onChange={e => { const n = num(e.target.value); const s = { ...(type.skills ?? {}) }; if (n === undefined) delete s[k]; else s[k] = n; put('skills', Object.keys(s).length ? s : undefined); }} />
            </label>
          ))}
        </div>
      </Group>
      <Group title="On Screen" foldKey="type-screen" collapsible defaultOpen={false}>
        <ToggleRow label="Show Name" help="Its name, drawn over it in a match." checked={type.showName === true} onChange={v => put('showName', v)} />
        <ToggleRow label="On Leaderboard" help="Whether it stands on the leaderboard." checked={type.onLeaderboard === true} onChange={v => put('onLeaderboard', v)} />
        <ToggleRow label="On Minimap" help="Whether it shows on the minimap." checked={type.onMinimap !== false} onChange={v => put('onMinimap', v)} />
        <Reveal when={type.onMinimap !== false}><ToggleRow label="On Everyone's Minimap" help="Every player sees it on the minimap in its colour, whatever its side, as a boss. Off: as a tank of its side." checked={type.minimapAll === true} onChange={v => put('minimapAll', v)} /></Reveal>
        <SelectRow label="Its Birth" help="Stands At Once, or fades in as a food shape does." value={type.birthLook ?? 'none'} options={[{ value: 'none', label: 'Stands At Once' }, { value: 'food', label: 'Fades In As A Food Shape' }]} onChange={v => put('birthLook', v)} />
        <SelectRow label="Worth" help="What its killer gets: its score, or nothing." value={type.worth ?? 'score'} options={[{ value: 'score', label: 'Its Score' }, { value: 'none', label: 'Nothing' }]} onChange={v => put('worth', v)} />
        <ToggleRow label="Counts As A Kill" help="Off: its killer reads no line and no kill is counted, as a door's button or a generator." checked={type.countsAsKill !== false} onChange={v => put('countsAsKill', v)} />
        <FieldRow label="Score" help="The score it carries. Empty: its file's."><NumBox value={type.score} min={0} onChange={v => put('score', v)} /></FieldRow>
        <FieldRow stacked label="Kill Line" help="The line its killer reads."><TextWords value={type.killLine ?? ''} tokens={['name', 'tank']} onChange={v => put('killLine', v || undefined)} /></FieldRow>
        <FieldRow stacked label="Kill Lines Of What Its Guns Make" help="What its killer reads when killed by a thing its guns made.">
          <div className="k-ev-stack">
            {Object.keys(type.madeLines ?? {}).map(word => (
              <div key={word} className="k-ev-card-row">
                <div className="k-ev-card-head"><span className="k-count">{word}</span><IconButton size="sm" label="Remove" onClick={() => { const m = { ...type.madeLines }; delete m[word]; put('madeLines', Object.keys(m).length ? m : undefined); }}><Trash2 size={13} /></IconButton></div>
                <TextField value={type.madeLines![word]} onChange={v => put('madeLines', { ...type.madeLines, [word]: v })} />
              </div>
            ))}
            <TankField value={undefined} ctx={ctx} add title="Add A Tank Its Guns Make" onChange={w => put('madeLines', { ...(type.madeLines ?? {}), [w]: 'You killed a {tank}.' })} />
          </div>
        </FieldRow>
      </Group>
    </div>
  );
};
void RowFields; void makeRow; void NumberField; void Switch;
export type { Row };
