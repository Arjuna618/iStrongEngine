import React, { useMemo, useState } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import { kindOf, kindsOf, SPARE_WORD_SHOWN, darkStepHides, type Family, type Field, type KindDef, type RefOf } from '../../game/mapEvents/registry';
import { SIDE_WORDS } from '../../game/mapEvents/doc';
import type { BodyTest, MapEventsDoc, Num, PlaceRule, Ref, Row, SpawnCard, Target, WaveTest, ZoneLike } from '../../game/mapEvents/doc';
import { addCard, addRowAt, changeRowKind, factsOf, getAt, insertAt, makeRow, removeAt, setAt, tokensToIds, tokensToNames, withIds, wordOfTarget, namesOf, type Fact, type Path } from '../../game/mapEvents/docOps';
import { SHAPE_DEFINITIONS } from '../../game/ShapeRegistry';
import { Button, Chip, FieldRow, Group, IconButton, RowLabel, Segmented, SelectRow, SliderRow as KitSliderRow, Switch, TextField, ToggleRow } from '../kit/kit';
import { FarmableShapesWindow } from '../FarmableShapesWindow';
import type { ShapeSpawnConfig } from '../../types';
import { Collapse, Reveal, SwapBox } from '../kit/Collapse';
import { LongList } from '../kit/LongList';
import { InlineMotion } from '../kit/TagLine';
import { HelpTooltip } from '../shared/HelpTooltip';
import { helpOfLabel, helpWithPick, OPTION_HELP, TARGET_HELP } from './fieldHelp';
import { DropMenu, menuOpen, useDropMenu } from '../kit/DropMenu';
import { NumberBox } from '../kit/NumberBox';
import { EvSelect } from './EvSelect';
import type { SelectGroup } from '../shared/CustomSelect';
import { ContentLibrary } from '../library/ContentLibrary';
import type { LibMode } from '../library/libraryModes';
import type { LibEntry, LibKind } from '../library/catalog';
import { OTHER_HEAD, PROJECTILE_HEAD, SHAPE_HEAD, TURRET_HEAD } from '../../game/mapEvents/thingWord';
import { WALL_RULES } from '../../game/wallTypes';
import { CM_NAMES } from '../../utils/colorMap';
import { colourWordShown, hexWordOf } from '../../game/mapEvents/colourWord';
import { pickWordOf, shownNameOfWord } from '../../game/tankByName';
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, SlidersHorizontal, X, Shapes } from '../ui/icons';

export const ZONES_KEY = '@zones';

export interface EvCtx {
  logic: GameLogic;
  areaId: string;
  doc: MapEventsDoc | undefined;
  zones: readonly ZoneLike[];
  commit: (edit: (doc: MapEventsDoc | undefined) => MapEventsDoc | undefined) => void;
  refresh?: () => void;
}

const num = (s: string): number | null => { const v = Number(s); return s.trim() !== '' && Number.isFinite(v) ? v : null; };

type NumMode = 'number' | 'random' | 'wave' | 'curve' | 'formula';
const modeOfNum = (v: Num | undefined): NumMode => (typeof v === 'number' || v === undefined ? 'number' : 'r' in v ? 'random' : 'ramp' in v ? 'wave' : 'curve' in v ? 'curve' : 'formula');
export function wordOfNum(v: Num | undefined, unit?: string): string {
  const u = unit ? ` ${unit}` : '';
  if (v === undefined) return '...';
  if (typeof v === 'number') return `${v}${u}`;
  if ('r' in v) return `${v.r[0]} to ${v.r[1]}${u}`;
  if ('ramp' in v) { const r = v.ramp; return `${r.base ? `${r.base} + ` : ''}${r.per ?? 0} x wave${r.max !== undefined ? `, at most ${r.max}` : ''}${r.every?.length ? `, every ${r.every[0].n} x ${r.every[0].mult}` : ''}`; }
  if ('curve' in v) return `curve of ${v.curve.length} points`;
  return v.f;
}
const FORMULA_WORDS = 'wave, seconds, players, humans, bots, tier; min, max, floor, ceil, round, abs, pow, rnd; {id} of a variable, a timer, a tag or a type';
const SmallNum: React.FC<{ value: number | undefined; onChange: (v: number | undefined) => void; label: string; step?: number; min?: number; help?: string; empty?: string }> = ({ value, onChange, label, step = 1, min, help, empty }) => (
  <label className="k-num"><span className="k-num-label">{help ? <HelpTooltip text={help} /> : null}{label}</span>
    <NumberBox className="k-field k-num-field" value={value ?? ''} step={step} min={min} placeholder={empty} onChange={e => { const n = num(e.target.value); onChange(n ?? undefined); }} />
  </label>
);
export const NumField: React.FC<{ value: Num | undefined; onChange: (v: Num) => void; unit?: string; min?: number; max?: number; plain?: boolean }> = ({ value, onChange, unit, min, max, plain }) => {
  const menu = useDropMenu({ estimatedHeight: 230, estimatedWidth: 320 });
  const mode = modeOfNum(value);
  const setMode = (m: NumMode) => {
    const now = typeof value === 'number' ? value : 0;
    if (m === 'number') onChange(now);
    else if (m === 'random') onChange({ r: [now, now + 1] });
    else if (m === 'wave') onChange({ ramp: { base: now, per: 1 } });
    else if (m === 'curve') onChange({ curve: [[1, now], [10, now * 2 || 1]] });
    else onChange({ f: String(now) });
  };
  if (plain) return <NumberBox className="k-field k-ev-num" value={typeof value === 'number' ? value : 0} min={min} max={max} onChange={e => { const n = num(e.target.value); if (n !== null) onChange(n); }} />;
  const isPlain = typeof value === 'number' || value === undefined;
  return (
    <span className="k-ev-numfield">
      <SwapBox swapKey={isPlain}>{isPlain
        ? <span className="k-ev-numbox"><NumberBox className="k-field k-ev-num" value={typeof value === 'number' ? value : ''} min={min} max={max} step={0.1} onChange={e => { const n = num(e.target.value); if (n !== null) onChange(n); }} />{unit ? <span className="k-unit">{unit}</span> : null}</span>
        : <button type="button" className="k-ev-numword" onClick={e => menu.toggle(e.currentTarget.getBoundingClientRect())}><span className="truncate">{wordOfNum(value, unit)}</span></button>}
      </SwapBox>
      <IconButton ref={menu.triggerRef as React.Ref<HTMLButtonElement>} size="sm" label="Random, by wave, a curve or a formula" aria-expanded={menuOpen(menu)} onClick={e => menu.toggle(e.currentTarget.getBoundingClientRect())}><SlidersHorizontal size={13} /></IconButton>
      <DropMenu menu={menu} className="k-menu k-ev-pop popup-scrollbar" label="A number">
        <Segmented<NumMode> value={mode} onChange={setMode} block options={[{ value: 'number', label: 'Number' }, { value: 'random', label: 'Random' }, { value: 'wave', label: 'By Wave' }, { value: 'curve', label: 'Curve' }, { value: 'formula', label: 'Formula' }]} />
        <SwapBox swapKey={mode}>
        <div className="k-ev-pop-body k-grid-2">
          {mode === 'number' && <SmallNum label={unit ? `Value (${unit})` : 'Value'} help="The number it uses, always the same." value={typeof value === 'number' ? value : 0} min={min} step={0.1} onChange={v => onChange(v ?? 0)} />} { }
          {mode === 'random' && value && typeof value === 'object' && 'r' in value && (<>
            <SmallNum label="From" help="The lowest it can roll." value={value.r[0]} step={0.1} onChange={v => onChange({ r: [v ?? 0, value.r[1]] })} />
            <SmallNum label="To" help="The highest it can roll." value={value.r[1]} step={0.1} onChange={v => onChange({ r: [value.r[0], v ?? 0] })} />
          </>)}
          {mode === 'wave' && value && typeof value === 'object' && 'ramp' in value && (<>
            <SmallNum label="Start At" help="What it is before any wave adds to it." value={value.ramp.base} step={0.1} onChange={v => onChange({ ramp: { ...value.ramp, base: v } })} />
            <SmallNum label="Add Each Wave" help="How much it grows from one wave to the next." value={value.ramp.per} step={0.01} onChange={v => onChange({ ramp: { ...value.ramp, per: v } })} />
            <SmallNum label="Never Under" help="It never goes below this." value={value.ramp.min} step={0.1} onChange={v => onChange({ ramp: { ...value.ramp, min: v } })} />
            <SmallNum label="Never Over" help="It never goes above this." value={value.ramp.max} step={0.1} onChange={v => onChange({ ramp: { ...value.ramp, max: v } })} />
            <SmallNum label="Every N Waves" help="Every this many waves it is multiplied." value={value.ramp.every?.[0]?.n} min={1} onChange={v => onChange({ ramp: { ...value.ramp, every: v ? [{ n: v, rem: value.ramp.every?.[0]?.rem ?? 1, mult: value.ramp.every?.[0]?.mult ?? 2 }] : undefined } })} />
            {value.ramp.every?.[0] && (<>
              <SmallNum label="At Wave" help="Which wave of the N it falls on." value={value.ramp.every[0].rem} min={0} onChange={v => onChange({ ramp: { ...value.ramp, every: [{ ...value.ramp.every![0], rem: v ?? 0 }] } })} />
              <SmallNum label="Times" help="What it is multiplied by on those waves." value={value.ramp.every[0].mult} step={0.1} onChange={v => onChange({ ramp: { ...value.ramp, every: [{ ...value.ramp.every![0], mult: v ?? 1 }] } })} />
            </>)}
          </>)}
          {mode === 'curve' && value && typeof value === 'object' && 'curve' in value && (
            <div className="k-ev-curve">
              {value.curve.map(([w, n], i) => (
                <div key={i} className="k-ev-curve-row">
                  <SmallNum label="Wave" help="The wave this point of the curve is at." value={w} min={0} onChange={v => { const c = value.curve.slice(); c[i] = [v ?? 0, n]; onChange({ curve: c }); }} />
                  <SmallNum label="Value" help="What the number is at that wave. Between two points it goes in a straight line." value={n} step={0.1} onChange={v => { const c = value.curve.slice(); c[i] = [w, v ?? 0]; onChange({ curve: c }); }} />
                  <IconButton label="Remove this point" disabled={value.curve.length < 2} onClick={() => onChange({ curve: value.curve.filter((_, j) => j !== i) })}><Trash2 size={13} /></IconButton>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => { const last = value.curve[value.curve.length - 1]; onChange({ curve: [...value.curve, [last[0] + 10, last[1]]] }); }}>Add A Point</Button>
            </div>
          )}
          {mode === 'formula' && value && typeof value === 'object' && 'f' in value && (
            <label className="k-num k-ev-span2"><span className="k-num-label"><HelpTooltip text={FORMULA_WORDS} />Formula</span>
              <TextField value={value.f} onChange={v => onChange({ f: v })} />
            </label>
          )}
        </div>
        </SwapBox>
      </DropMenu>
    </span>
  );
};

export function choicesOf(of: RefOf, ctx: EvCtx): { id: number; name: string }[] {
  const d = ctx.doc;
  const named = (list: readonly { id: number; name: string }[] | undefined) => (list ?? []).map(x => ({ id: x.id, name: x.name }));
  switch (of) {
    case 'area': return ctx.zones.filter(z => typeof z.uid === 'number').map(z => ({ id: z.uid as number, name: z.name ?? 'Custom Area' }));
    case 'entity': return named(d?.placed);
    case 'type': return named(d?.types);
    case 'form': return (d?.types ?? []).flatMap(t => t.forms.map(f => ({ id: f.id, name: `${t.name}: ${f.name}` })));
    case 'plan': return named(d?.plans);
    case 'rule': return named(d?.rules);
    case 'var': return named(d?.vars);
    case 'timer': return named(d?.timers);
    case 'signal': return named(d?.signals);
    case 'tag': return named(d?.tags);
    case 'status': return named(d?.statuses);
    case 'seq': return named(d?.sequences);
    case 'group': return named(d?.areaGroups);
    case 'behavior': return ctx.zones.flatMap(z => (z.behaviors ?? []).map(b => ({ id: b.id, name: `${z.name ?? 'Custom Area'}: ${kindOf('behavior', b.k)?.label ?? b.k}` })));
  }
}
const OF_WORD: Record<RefOf, string> = { area: 'Custom Area', entity: 'Map Entity', type: 'Entity Type', form: 'Form', plan: 'Wave Plan', rule: 'Map Event', var: 'Variable', timer: 'Timer', signal: 'Signal', tag: 'Tag', status: 'Status', seq: 'Sequence', group: 'Area Group', behavior: 'Behaviour' };

export const RefField: React.FC<{ of: RefOf; optional?: boolean; value: Ref | undefined; onChange: (v: Ref | undefined) => void; ctx: EvCtx }> = ({ of, optional, value, onChange, ctx }) => {
  const list = choicesOf(of, ctx);
  const dead = !!value && !list.some(x => x.id === value.id);
  const options = [
    ...(optional ? [{ value: '', label: 'None' }] : []),
    ...(dead ? [{ value: String(value!.id), label: `${value!.n || OF_WORD[of]} (it is gone)` }] : []),
    ...list.map(x => ({ value: String(x.id), label: x.name })),
  ];
  return <EvSelect className={dead ? 'k-ev-dead' : undefined} value={value ? String(value.id) : ''} placeholder={`Pick a ${OF_WORD[of]}`}
    options={options} onChange={v => { if (!v) { onChange(undefined); return; } const hit = list.find(x => String(x.id) === v); if (hit) onChange({ id: hit.id, n: hit.name }); }} />;
};

export const thingNamer = (ctx: EvCtx) => (w: string): string => (SHAPE_DEFINITIONS.get(w) as { name?: string } | undefined)?.name ?? (shownNameOfWord(ctx.logic.state.tankLibrary, w, false) || w);
export const Facts: React.FC<{ items: readonly Fact[] }> = ({ items }) => (
  <span className="k-ev-facts"><InlineMotion items={items.map(f => ({ key: f.key, node: <Chip>{f.text}</Chip> }))} /></span>
);
export const factsFrom = (words: readonly string[]): Fact[] => words.filter(Boolean).map(w => ({ key: w, text: w }));
export const TakeOffTags: React.FC<{ items: readonly { key: string; label: string }[]; onRemove: (key: string) => void }> = ({ items, onRemove }) => (
  <span className="k-ev-facts"><InlineMotion items={items.map(v => ({ key: v.key, node: (
    <span className="k-chip k-ev-tag"><span className="truncate">{v.label}</span><button type="button" className="k-chip-x" aria-label={`Take off ${v.label}`} title="Take it off" onClick={() => onRemove(v.key)}><X size={11} /></button></span>
  ) }))} /></span>
);
export const ChipsField: React.FC<{ values: { key: string; label: string }[]; offer: { key: string; label: string }[]; onAdd: (key: string) => void; onRemove: (key: string) => void; addLabel?: string }> = ({ values, offer, onAdd, onRemove, addLabel = 'Add' }) => {
  const left = offer.filter(o => !values.some(v => v.key === o.key));
  return (
    <div className="k-ev-stack">
      <Reveal when={values.length > 0}><TakeOffTags items={values} onRemove={onRemove} /></Reveal>
      <EvSelect add={addLabel} disabled={left.length === 0} options={left.map(o => ({ value: o.key, label: o.label }))} onChange={onAdd} />
    </div>
  );
};

export const TankField: React.FC<{ value: string | undefined; onChange: (word: string) => void; ctx: EvCtx; title?: string; add?: boolean }> = ({ value, onChange, ctx, title, add }) => {
  const [open, setOpen] = useState(false);
  const lib = ctx.logic.state.tankLibrary;
  const mode: LibMode = useMemo(() => ({
    place: 'mapEntity', title: title ?? 'Pick A Tank', subtitle: 'Any tank of the game can stand here.', kinds: ['tank'],
    actionsOf: e => (e.item ? [{ id: 'pick', label: 'Choose', run: () => { onChange(pickWordOf(lib, e.item!, false)); return true; } }] : []),
  }), [lib, onChange, title]);
  return (
    <>
      {add ? <Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={() => setOpen(true)}>{title}</Button>
        : <button type="button" className="k-select-trigger k-ev-pick" onClick={() => setOpen(true)}><span className="truncate">{value ? (shownNameOfWord(lib, value, false) || value) : (title ?? 'Pick A Tank')}</span><ChevronRight size={14} className="k-chevron" /></button>}
      {open && <ContentLibrary logic={ctx.logic} mode={mode} onClose={() => setOpen(false)} />} { }
    </>
  );
};

export function thingWordOf(e: LibEntry, lib: GameLogic['state']['tankLibrary']): string | null {
  switch (e.kind) {
    case 'tank': return e.item ? pickWordOf(lib, e.item, false) : null;
    case 'sentry': return e.id;
    case 'shape': return SHAPE_HEAD + e.id;
    case 'other': return e.item ? OTHER_HEAD + e.item.id : null;
    case 'projectile': return e.item ? PROJECTILE_HEAD + e.id : null;
    case 'turret': return e.item ? TURRET_HEAD + e.item.id : null;
    default: return null;
  }
}
export const THING_KINDS: readonly LibKind[] = ['tank', 'sentry', 'shape', 'other', 'projectile', 'turret'];
export const ThingField: React.FC<{ value: string | undefined; onChange: (word: string) => void; ctx: EvCtx; title?: string; add?: boolean }> = ({ value, onChange, ctx, title, add }) => {
  const [open, setOpen] = useState(false);
  const lib = ctx.logic.state.tankLibrary;
  const mode: LibMode = useMemo(() => ({
    place: 'mapEntity', title: title ?? 'Pick What It Is', subtitle: 'Anything of the Content Library can stand here.', kinds: THING_KINDS,
    actionsOf: e => { const w = thingWordOf(e, lib); return w ? [{ id: 'pick', label: 'Choose', run: () => { onChange(w); return true; } }] : []; },
  }), [lib, onChange, title]);
  return (
    <>
      {add ? <Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={() => setOpen(true)}>{title}</Button>
        : <button type="button" className="k-select-trigger k-ev-pick" onClick={() => setOpen(true)}><span className="truncate">{value ? ctx.logic.mapThingName(value, ctx.areaId) : (title ?? 'Pick What It Is')}</span><ChevronRight size={14} className="k-chevron" /></button>}
      {open && <ContentLibrary logic={ctx.logic} mode={mode} onClose={() => setOpen(false)} />} { }
    </>
  );
};

const TARGET_WORDS: [Target['w'], string][] = [['subject', 'It'], ['other', 'What Hit It'], ['killer', 'Its Killer'], ['self', 'This One'], ['lastSpawned', 'What This Spawned'], ['player', 'The Player'], ['allPlayers', 'Every Player'], ['allTanks', 'Every Tank'], ['leader', 'The Top Score'], ['followers', 'Its Followers'], ['homeMates', 'Everything Of Its Home']];
const TARGET_GROUP_SHOWN: Record<string, string> = { entity: 'A Map Entity', type: 'All Of An Entity Type', tag: 'All With A Tag', inArea: 'All In A Custom Area', team: 'A Whole Side', colour: 'A Whole Colour' };
function targetTip(label: string, t: Target | undefined): string | undefined {
  const w = t?.w;
  if (!w) return helpOfLabel(label);
  return helpWithPick(label, TARGET_WORDS.find(x => x[0] === w)?.[1] ?? TARGET_GROUP_SHOWN[w], TARGET_HELP[w]);
}
const TargetField: React.FC<{ value: Target | undefined; only?: readonly string[]; onChange: (t: Target) => void; ctx: EvCtx }> = ({ value, only, onChange, ctx }) => {
  const allowed = (w: string) => !only || only.includes(w);
  const names = namesOf(ctx.doc, ctx.zones);
  const keyOf = (t: Target | undefined): string => { if (!t) return ''; const q = t as { w: string; team?: string; ref?: Ref; colour?: unknown }; return q.w === 'team' ? `team:${q.team}` : q.w === 'colour' ? `colour:${String(q.colour)}` : q.ref ? `${q.w}:${q.ref.id}` : q.w; };
  const groups: SelectGroup[] = [{ label: 'Who', options: TARGET_WORDS.filter(([w]) => allowed(w)).map(([w, label]) => ({ value: w, label })) }];
  const SUBS: ['entity' | 'type' | 'tag' | 'inArea', RefOf, string][] = [['entity', 'entity', 'A Map Entity'], ['type', 'type', 'All Of An Entity Type'], ['tag', 'tag', 'All With A Tag'], ['inArea', 'area', 'All In A Custom Area']];
  for (const [w, of, head] of SUBS) {
    if (!allowed(w)) continue;
    const list = choicesOf(of, ctx);
    if (list.length > 0) groups.push({ label: head, options: list.map(x => ({ value: `${w}:${x.id}`, label: wordOfTarget({ w, ref: { id: x.id, n: x.name } }, names) })) });
  }
  if (allowed('team')) groups.push({ label: 'A Whole Side', options: SIDE_WORDS.map(q => ({ value: `team:${q.word}`, label: q.shown })) });
  if (allowed('colour')) groups.push({ label: 'A Whole Colour', options: CM_NAMES.map((n, i) => ({ value: `colour:${i}`, label: `Coloured ${n}` })) });
  const key = keyOf(value);
  if (value && !groups.some(g => g.options.some(o => o.value === key))) groups.push({ label: 'It Is Gone', options: [{ value: key, label: `${wordOfTarget(value as never, names)} (it is gone)` }] });
  const pick = (k: string) => {
    const [w, rest] = k.split(':');
    if (w === 'team') { onChange({ w: 'team', team: rest }); return; }
    if (w === 'colour') { const n = Number(rest); onChange({ w: 'colour', colour: Number.isInteger(n) && String(n) === rest ? n : rest }); return; }
    if (rest === undefined) { onChange({ w } as Target); return; }
    const sub = SUBS.find(x => x[0] === w);
    const hit = sub ? choicesOf(sub[1], ctx).find(x => String(x.id) === rest) : undefined;
    if (hit) onChange({ w, ref: { id: hit.id, n: hit.name } } as Target);
  };
  return <EvSelect value={key} groups={groups} onChange={pick} />;
};

const TeamSelect: React.FC<{ value: string | undefined; onChange: (v: string | undefined) => void; none?: string }> = ({ value, onChange, none = 'None' }) => (
  <EvSelect value={value ?? ''} onChange={v => onChange(v || undefined)} options={[{ value: '', label: none }, ...SIDE_WORDS.map(s => ({ value: s.word, label: s.shown }))]} />
);

export const WordsField: React.FC<{ value: string[]; onChange: (v: string[]) => void; ctx: EvCtx }> = ({ value, onChange, ctx }) => {
  const nameOfWord = (w: string): string => {
    if (SPARE_WORD_SHOWN[w]) return SPARE_WORD_SHOWN[w];
    const [head, rest] = w.split(':');
    if (head === 'tag') return `Tag: ${ctx.doc?.tags?.find(t => String(t.id) === rest)?.name ?? rest}`;
    if (head === 'type') return `Entity Type: ${ctx.doc?.types?.find(t => String(t.id) === rest)?.name ?? rest}`;
    if (head === 'cat') return `Folder: ${rest}`;
    if (head === 'tank') return shownNameOfWord(ctx.logic.state.tankLibrary, rest, false) || rest;
    return w;
  };
  const folders = useMemo(() => [...new Set(ctx.logic.state.tankLibrary.map(i => i.fileData?.category).filter((c): c is string => !!c))], [ctx.logic.state.tankLibrary]);
  const offer = [
    ...Object.keys(SPARE_WORD_SHOWN).map(k => ({ key: k, label: SPARE_WORD_SHOWN[k] })),
    ...(ctx.doc?.tags ?? []).map(t => ({ key: `tag:${t.id}`, label: `Tag: ${t.name}` })),
    ...(ctx.doc?.types ?? []).map(t => ({ key: `type:${t.id}`, label: `Entity Type: ${t.name}` })),
    ...folders.map(c => ({ key: `cat:${c}`, label: `Folder: ${c}` })),
  ];
  return <ChipsField values={value.map(w => ({ key: w, label: nameOfWord(w) }))} offer={offer} addLabel="Add To Whitelist"
    onAdd={k => onChange([...value, k])} onRemove={k => onChange(value.filter(w => w !== k))} />;
};

export const TeamsField: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => (
  <ChipsField values={value.map(w => ({ key: w, label: SIDE_WORDS.find(s => s.word === w)?.shown ?? w }))} offer={SIDE_WORDS.map(s => ({ key: s.word, label: s.shown }))} addLabel="Add A Side"
    onAdd={k => onChange([...value, k])} onRemove={k => onChange(value.filter(w => w !== k))} />
);

export const WaveTestField: React.FC<{ value: WaveTest | undefined; onChange: (v: WaveTest | undefined) => void }> = ({ value, onChange }) => {
  const v = value ?? {};
  const set = (patch: WaveTest) => { const n = { ...v, ...patch }; for (const k of Object.keys(n) as (keyof WaveTest)[]) if (n[k] === undefined) delete n[k]; onChange(Object.keys(n).length ? n : undefined); };
  return (
    <div className="k-grid-2">
      <SmallNum label="From Wave" help="The first wave it counts." empty="The First" value={v.from} min={0} onChange={x => set({ from: x })} />
      <SmallNum label="To Wave" help="The last wave it counts." empty="No End" value={v.to} min={0} onChange={x => set({ to: x })} />
      <SmallNum label="Every" help="3: every third wave." empty="1" value={v.every} min={1} onChange={x => set({ every: x })} />
      <label className="k-num"><span className="k-num-label"><HelpTooltip text="Exactly these waves, whatever the other three say." />Only These</span>
        <TextField value={v.list?.join(', ') ?? ''} placeholder="5, 10, 15" onChange={s => { const l = s.split(/[^0-9]+/).filter(Boolean).map(Number); set({ list: l.length ? l : undefined }); }} />
      </label>
    </div>
  );
};

export const BodyTestField: React.FC<{ value: BodyTest | undefined; onChange: (v: BodyTest | undefined) => void; ctx: EvCtx }> = ({ value, onChange, ctx }) => {
  const v: BodyTest = value ?? {};
  const put = (patch: Partial<BodyTest>) => { const n: BodyTest = { ...v, ...patch }; for (const k of Object.keys(n) as (keyof BodyTest)[]) { const x = n[k]; if (x === undefined || (Array.isArray(x) && x.length === 0)) delete n[k]; } onChange(Object.keys(n).length ? n : undefined); };
  const values = [
    ...(v.types ?? []).map(r => ({ key: `type:${r.id}`, label: `Entity Type: ${r.n}` })),
    ...(v.tags ?? []).map(r => ({ key: `tag:${r.id}`, label: `Tag: ${r.n}` })),
    ...(v.tanks ?? []).map(w => ({ key: `tank:${w}`, label: `Tank: ${shownNameOfWord(ctx.logic.state.tankLibrary, w, false) || w}` })),
    ...(v.teams ?? []).map(w => ({ key: `team:${w}`, label: SIDE_WORDS.find(s => s.word === w)?.shown ?? w })),
    ...(v.colours ?? []).map(c => ({ key: `colour:${String(c)}`, label: `Colour: ${colourWordShown(c)}` })),
    ...(v.boss !== undefined ? [{ key: 'boss', label: v.boss ? 'Bosses' : 'No Bosses' }] : []),
    ...(v.player !== undefined ? [{ key: 'player', label: v.player ? 'The Player' : 'No Player' }] : []),
  ];
  const offer = [
    { key: 'boss', label: 'Bosses' }, { key: 'player', label: 'The Player' },
    ...SIDE_WORDS.map(s => ({ key: `team:${s.word}`, label: s.shown })),
    ...CM_NAMES.map((n, i) => ({ key: `colour:${i}`, label: `Colour: ${n}` })),
    ...choicesOf('type', ctx).map(x => ({ key: `type:${x.id}`, label: `Entity Type: ${x.name}` })),
    ...choicesOf('tag', ctx).map(x => ({ key: `tag:${x.id}`, label: `Tag: ${x.name}` })),
  ];
  const add = (k: string) => {
    if (k === 'boss') put({ boss: true });
    else if (k === 'player') put({ player: true });
    else {
      const [h, r] = k.split(':');
      if (h === 'team') put({ teams: [...(v.teams ?? []), r] });
      else if (h === 'colour') put({ colours: [...(v.colours ?? []), Number(r)] });
      else if (h === 'type') put({ types: [...(v.types ?? []), { id: +r, n: choicesOf('type', ctx).find(x => x.id === +r)?.name ?? '' }] });
      else if (h === 'tag') put({ tags: [...(v.tags ?? []), { id: +r, n: choicesOf('tag', ctx).find(x => x.id === +r)?.name ?? '' }] });
    }
  };
  const remove = (k: string) => {
    if (k === 'boss') put({ boss: undefined });
    else if (k === 'player') put({ player: undefined });
    else {
      const [h, r] = k.split(':');
      if (h === 'team') put({ teams: v.teams?.filter(w => w !== r) });
      else if (h === 'colour') put({ colours: v.colours?.filter(c => String(c) !== r) });
      else if (h === 'type') put({ types: v.types?.filter(x => x.id !== +r) });
      else if (h === 'tag') put({ tags: v.tags?.filter(x => x.id !== +r) });
      else if (h === 'tank') put({ tanks: v.tanks?.filter(w => w !== r) });
    }
  };
  return (
    <div className="k-ev-chips-wrap">
      <ChipsField values={values} offer={offer} addLabel={values.length ? 'Add A Filter' : 'Anything: Add A Filter'} onAdd={add} onRemove={remove} />
      <TankField value={undefined} ctx={ctx} add title="Add A Tank" onChange={w => put({ tanks: [...(v.tanks ?? []), w] })} />
      <HexColourAdd onAdd={h => { if (!(v.colours ?? []).some(c => c === h)) put({ colours: [...(v.colours ?? []), h] }); }} />
    </div>
  );
};

const HexColourAdd: React.FC<{ onAdd: (hex: string) => void }> = ({ onAdd }) => {
  const [text, setText] = useState('');
  const hex = hexWordOf(text);
  return (
    <div className="k-ev-stack">
      <TextField value={text} placeholder="A colour of its own, as a hex" onChange={setText} />
      <Button size="sm" variant="secondary" block icon={<Plus size={13} />} disabled={hex === null} onClick={() => { if (hex) { onAdd(hex); setText(''); } }}>Add This Colour</Button>
    </div>
  );
};

export const CardsField: React.FC<{ value: SpawnCard[]; path: Path; ctx: EvCtx }> = ({ value, path, ctx }) => {
  const total = value.reduce((s, c) => s + (c.weight > 0 ? c.weight : 0), 0);
  const shapes = useMemo(() => [...SHAPE_DEFINITIONS.entries()].map(([id, s]) => ({ value: id, label: (s as { name?: string }).name ?? id })), []);
  const types = choicesOf('type', ctx);
  const budgetOn = path[0] === 'plans' && ctx.doc?.plans?.[path[1] as number]?.compose?.mode === 'budget';
  return (
    <div className="k-ev-cards">
      <LongList gap={0} estimate={150} count={value.length} rowKey={i => String(value[i].id)} renderRow={i => { const c = value[i]; return (
          <div className="k-ev-card-row">
            <div className="k-ev-card-head">
              <div className="k-ev-card-pick">
                {c.shape !== undefined
                  ? <EvSelect value={c.shape} options={shapes} onChange={v => ctx.commit(d => setAt(d, [...path, i, 'shape'], v))} />
                  : c.type
                    ? <EvSelect value={String(c.type.id)} options={types.map(x => ({ value: String(x.id), label: x.name }))} onChange={v => { const hit = types.find(x => String(x.id) === v); if (hit) ctx.commit(d => setAt(d, [...path, i, 'type'], { id: hit.id, n: hit.name })); }} />
                    : <TankField value={c.tank} ctx={ctx} onChange={w => ctx.commit(d => setAt(d, [...path, i, 'tank'], w))} />}
              </div>
              <span className="k-count">{total > 0 ? `${Math.round((c.weight > 0 ? c.weight : 0) / total * 100)}%` : '0%'}</span>
              <IconButton size="sm" label="Take it off" onClick={() => ctx.commit(d => removeAt(d, path, i))}><Trash2 size={13} /></IconButton>
            </div>
            <div className="k-grid-2">
              <SmallNum label="Share" help="How likely this one is beside the others. The tag above says it in percent." value={c.weight} step={0.1} min={0} onChange={v => ctx.commit(d => setAt(d, [...path, i, 'weight'], v ?? 0))} />
              <Reveal when={budgetOn}><SmallNum label="Cost" help="The points of the wave one of these takes." value={c.cost ?? 1} step={0.5} min={0} onChange={v => ctx.commit(d => setAt(d, [...path, i, 'cost'], v))} /></Reveal>
              <SmallNum label="Size From" help="Each one rolls a size between these two, times its own." value={c.size?.[0]} step={0.05} min={0} onChange={v => ctx.commit(d => setAt(d, [...path, i, 'size'], v === undefined ? undefined : [v, c.size?.[1] ?? v]))} />
              <SmallNum label="Size To" help="Each one rolls a size between these two, times its own." value={c.size?.[1]} step={0.05} min={0} onChange={v => ctx.commit(d => setAt(d, [...path, i, 'size'], v === undefined ? undefined : [c.size?.[0] ?? v, v]))} />
            </div>
            <ToggleRow label="One Alive" help="Never two of this one alive at once." checked={!!c.uniqueAlive} onChange={v => ctx.commit(d => setAt(d, [...path, i, 'uniqueAlive'], v || undefined))} />
          </div>
        ); }} />
      <div className="k-ev-stack">
        <TankField value={undefined} ctx={ctx} add title="Add A Tank" onChange={w => ctx.commit(d => addCard(d!, path, { tank: w, weight: 1 }))} />
        <Reveal when={types.length > 0}>{() => <EvSelect add="Add An Entity Type" options={types.map(x => ({ value: String(x.id), label: x.name }))} onChange={v => { const hit = types.find(x => String(x.id) === v); if (hit) ctx.commit(d => addCard(d!, path, { type: { id: hit.id, n: hit.name }, weight: 1 })); }} />}</Reveal>
        <EvSelect add="Add A Shape" options={shapes} onChange={v => ctx.commit(d => addCard(d!, path, { shape: v, weight: 1 }))} />
      </div>
    </div>
  );
};

export const PlaceRuleField: React.FC<{ value: PlaceRule | undefined; onChange: (v: PlaceRule) => void; ctx: EvCtx }> = ({ value, onChange, ctx }) => {
  const v: PlaceRule = value ?? { how: 'random', onFull: 'wait' };
  const put = (patch: Partial<PlaceRule>) => onChange({ ...v, ...patch });
  return (
    <div className="k-ev-form">
      <SelectRow label="Where In It" help="Anywhere inside the area, along its edge, or at its middle." value={v.how} onChange={x => put({ how: x as PlaceRule['how'] })} options={[{ value: 'random', label: 'Anywhere' }, { value: 'edge', label: 'On Its Edge' }, { value: 'center', label: 'Its Middle' }]} />
      <SelectRow label="When It Is Full" help="No free place left. Wait For Room: it comes later. Ignore The Gap: it may stand close. Skip It: it does not come." value={v.onFull} onChange={x => put({ onFull: x as PlaceRule['onFull'] })} options={[{ value: 'wait', label: 'Wait For Room' }, { value: 'ignoreGap', label: 'Ignore The Gap' }, { value: 'skip', label: 'Skip It' }]} />
      <div className="k-grid-2">
        <SmallNum label="Gap" help="How far apart they keep at their birth, in world units." empty="0" value={v.gap} min={0} onChange={x => put({ gap: x })} />
        <SmallNum label="Keep From Damaging Areas" help="How far from a Damaging Area they are born, in world units." empty="0" value={v.keepFromDamaging} min={0} onChange={x => put({ keepFromDamaging: x })} />
        <SmallNum label="Away From Players" help="How far from any player they are born, in world units." empty="0" value={v.awayFromPlayers?.base} min={0} onChange={x => put({ awayFromPlayers: x === undefined ? undefined : { base: x, perSize: v.awayFromPlayers?.perSize ?? 0 } })} />
        <SmallNum label="And Per Size" help="More distance for each unit of the player's size." empty="0" value={v.awayFromPlayers?.perSize} step={0.01} min={0} onChange={x => put({ awayFromPlayers: { base: v.awayFromPlayers?.base ?? 0, perSize: x ?? 0 } })} />
      </div>
      <FieldRow stacked label="Never In" help="Areas and Area Groups they are never born in.">
        <ChipsField values={(v.avoid ?? []).map(r => ({ key: String(r.id), label: r.n }))}
          offer={[...choicesOf('area', ctx), ...choicesOf('group', ctx)].map(x => ({ key: String(x.id), label: x.name }))} addLabel="Add An Area"
          onAdd={k => { const hit = [...choicesOf('area', ctx), ...choicesOf('group', ctx)].find(x => String(x.id) === k); if (hit) put({ avoid: [...(v.avoid ?? []), { id: hit.id, n: hit.name }] }); }}
          onRemove={k => put({ avoid: (v.avoid ?? []).filter(r => String(r.id) !== k) })} />
      </FieldRow>
    </div>
  );
};

type PlaceV = { w: 'in'; areas: Ref[] | 'plan'; rule?: PlaceRule } | { w: 'subject' } | { w: 'point'; cx: number; cy: number } | { w: 'homeOf'; of: Target };
const PlaceField: React.FC<{ value: PlaceV | undefined; onChange: (v: PlaceV) => void; ctx: EvCtx }> = ({ value, onChange, ctx }) => {
  const v: PlaceV = value ?? { w: 'subject' };
  return (
    <div className="k-ev-form">
      <Segmented<PlaceV['w']> block value={v.w} onChange={w => onChange(w === 'in' ? { w, areas: [] } : w === 'point' ? { w, cx: 0, cy: 0 } : w === 'homeOf' ? { w, of: { w: 'subject' } } : { w })}
        options={[{ value: 'in', label: 'In An Area' }, { value: 'subject', label: 'Where It Is' }, { value: 'point', label: 'At A Point' }, { value: 'homeOf', label: 'Its Home Area' }]} />
      <SwapBox swapKey={v.w}><div className="k-ev-form">
      {v.w === 'in' && <>
        <ChipsField values={(v.areas === 'plan' ? [] : v.areas).map(r => ({ key: String(r.id), label: r.n }))}
          offer={[...choicesOf('area', ctx), ...choicesOf('group', ctx)].map(x => ({ key: String(x.id), label: x.name }))} addLabel="Add An Area"
          onAdd={k => { const hit = [...choicesOf('area', ctx), ...choicesOf('group', ctx)].find(x => String(x.id) === k); if (hit) onChange({ ...v, areas: [...(v.areas === 'plan' ? [] : v.areas), { id: hit.id, n: hit.name }] }); }}
          onRemove={k => onChange({ ...v, areas: (v.areas === 'plan' ? [] : v.areas).filter(r => String(r.id) !== k) })} />
        <PlaceRuleField value={v.rule} ctx={ctx} onChange={rule => onChange({ ...v, rule })} />
      </>}
      {v.w === 'point' && <div className="k-grid-2"> { }
        <SmallNum label="Cell X" help="The map's column, counted in cells." value={v.cx} step={0.5} onChange={x => onChange({ ...v, cx: x ?? 0 })} />
        <SmallNum label="Cell Y" help="The map's row, counted in cells." value={v.cy} step={0.5} onChange={x => onChange({ ...v, cy: x ?? 0 })} />
      </div>}
      {v.w === 'homeOf' && <TargetField value={v.of} only={['subject', 'other', 'self', 'entity']} ctx={ctx} onChange={of => onChange({ ...v, of })} />} { }
      </div></SwapBox>
    </div>
  );
};

const TOKEN_WORDS: Record<string, string> = { wave: 'Wave', seconds: 'Seconds', tier: 'Tier', name: 'Name', tank: 'Tank', team: 'Side', killer: 'Killer', area: 'Area', count: 'Count', special: 'Special Wave' };
export const TextWords: React.FC<{ value: string; tokens: readonly string[]; onChange: (v: string) => void; max?: number; multi?: boolean; ctx?: EvCtx }> = ({ value, tokens, onChange, max, ctx }) => {
  const shown = ctx ? tokensToNames(value, namesOf(ctx.doc, ctx.zones)) : value;
  const write = (v: string) => onChange(ctx ? tokensToIds(v, ctx.doc) : v);
  return (
    <div className="k-ev-text">
      <TextField value={shown} maxLength={max} onChange={write} />
      {tokens.length > 0 && <div className="k-ev-tokens">{tokens.map(t => <button key={t} type="button" className="k-ev-token" title={`Put the ${TOKEN_WORDS[t] ?? t} in the line`} onClick={() => onChange(`${value}{${t}}`)}>{TOKEN_WORDS[t] ?? t}</button>)}</div>} { }
    </div>
  );
};

export const FieldControl: React.FC<{ field: Field; value: unknown; path: Path; ctx: EvCtx; onChange: (v: unknown) => void }> = ({ field, value, path, ctx, onChange }) => {
  switch (field.t) {
    case 'num': return <NumField value={value as Num | undefined ?? field.def} unit={field.unit} min={field.min} max={field.max} onChange={onChange} />;
    case 'int': return <NumberBox className="k-field k-ev-num" value={typeof value === 'number' ? value : field.def} min={field.min} max={field.max} step={1} onChange={e => { const n = num(e.target.value); if (n !== null) onChange(Math.max(field.min, Math.min(field.max, Math.round(n)))); }} />;
    case 'bool': return <Switch checked={value === undefined ? field.def : !!value} onChange={onChange} />;
    case 'enum': return <EvSelect value={typeof value === 'string' ? value : field.def} onChange={onChange} options={field.of.map((w, i) => ({ value: w, label: field.shown?.[i] ?? w }))} />;
    case 'text': return <TextWords value={typeof value === 'string' ? value : field.def} tokens={field.tokens} max={field.max} ctx={ctx} onChange={onChange} />;
    case 'target': return <TargetField value={(value as Target | undefined) ?? field.def} only={field.only} ctx={ctx} onChange={onChange} />;
    case 'ref': return <RefField of={field.of} optional={field.optional} value={value as Ref | undefined} ctx={ctx} onChange={onChange} />;
    case 'refs': { const list = (value as Ref[] | undefined) ?? [];
      return <ChipsField values={list.map(r => ({ key: String(r.id), label: r.n }))} offer={choicesOf(field.of, ctx).map(x => ({ key: String(x.id), label: x.name }))}
        onAdd={k => { const hit = choicesOf(field.of, ctx).find(x => String(x.id) === k); if (hit) onChange([...list, { id: hit.id, n: hit.name }]); }} onRemove={k => onChange(list.filter(r => String(r.id) !== k))} />; }
    case 'tank': return <TankField value={value as string | undefined} ctx={ctx} onChange={onChange} />;
    case 'team': return <TeamSelect value={value as string | undefined} onChange={onChange} />;
    case 'teams': return <TeamsField value={(value as string[] | undefined) ?? []} onChange={onChange} />;
    case 'words': return <WordsField value={(value as string[] | undefined) ?? []} ctx={ctx} onChange={onChange} />;
    case 'walls': { const list = Array.isArray(value) ? (value as number[]) : [...field.def];
      return <ChipsField values={list.filter(t => WALL_RULES[t] !== undefined).map(t => ({ key: String(t), label: WALL_RULES[t].name }))} offer={WALL_RULES.map((r, t) => ({ key: String(t), label: r.name }))} addLabel="Add A Wall Type"
        onAdd={k => onChange([...list, Number(k)])} onRemove={k => onChange(list.filter(t => String(t) !== k))} />; }
    case 'wavetest': return <WaveTestField value={value as WaveTest | undefined} onChange={onChange} />;
    case 'bodytest': return <BodyTestField value={value as BodyTest | undefined} ctx={ctx} onChange={onChange} />;
    case 'cards': return <CardsField value={(value as SpawnCard[] | undefined) ?? []} path={path} ctx={ctx} />;
    case 'place': return <PlaceField value={value as PlaceV | undefined} ctx={ctx} onChange={onChange} />;
    case 'nums': { const list = (value as Num[] | undefined) ?? [];
      return <div className="k-ev-chips-wrap">{list.map((n, i) => <NumField key={i} value={n} onChange={v => { const a = list.slice(); a[i] = v; onChange(a); }} />)}<IconButton size="sm" label="Add A Number" onClick={() => onChange([...list, 0])}><Plus size={13} /></IconButton></div>; }
    case 'ints': return <TextField value={((value as number[] | undefined) ?? []).join(', ')} onChange={s => onChange(s.split(/[^0-9-]+/).filter(Boolean).map(Number))} />;
    case 'rows': return <OrderField value={value as Row | undefined} path={path} ctx={ctx} />;
    case 'steps': return <RowList family="step" list={(value as Row[] | undefined) ?? []} path={path} ctx={ctx} addLabel="Add A Step" />;
    case 'conds': return <RowList family="cond" list={(value as Row[] | undefined) ?? []} path={path} ctx={ctx} addLabel="Add A Test" />;
    case 'json': return <div className="k-ev-none">Set in its own window</div>;
  }
};

export const OrderField: React.FC<{ value: Row | undefined; path: Path; ctx: EvCtx }> = ({ value, path, ctx }) => {
  const options = [{ value: '', label: 'Stands Where It Is' }, ...kindsOf('order').map(d => ({ value: d.kind, label: d.label }))];
  return (
    <div className="k-ev-order">
      <EvSelect value={value?.k ?? ''} options={options} onChange={k => ctx.commit(d => {
        if (!k) return setAt(d, path, undefined);
        const r = withIds(d, id => makeRow(id(), 'order', k));
        return setAt(r.doc, path, r.value);
      })} />
      <Reveal when={value}>{() => <RowFields family="order" row={value!} path={path} ctx={ctx} />}</Reveal>
    </div>
  );
};

const SPAWN_MODES: { value: string; label: string }[] = [{ value: 'timer', label: 'Timer' }, { value: 'replace', label: 'Replace' }, { value: 'maxAlive', label: 'Max Alive' }, { value: 'waves', label: 'Waves' }, { value: 'signal', label: 'On Signal' }];
export const SpawnFields: React.FC<{ row: Row; path: Path; ctx: EvCtx }> = ({ row, path, ctx }) => {
  const base: Path = row.a.settings && typeof row.a.settings === 'object' ? [...path, 'a', 'settings'] : [...path, 'a'];
  const a = (row.a.settings && typeof row.a.settings === 'object' ? row.a.settings : row.a) as Record<string, unknown>;
  const mode = (a.mode as string) ?? 'timer';
  const put = (k: string, v: unknown) => ctx.commit(d => setAt(d, [...base, k], v));
  const field = (label: string, k: string, help: string, unit?: string, def: Num = 1) => <FieldRow label={label} help={help}><NumField value={a[k] as Num | undefined ?? def} unit={unit} onChange={v => put(k, v)} /></FieldRow>;
  const TOTAL = 'After this many it spawns no more. 0: it never stops.';
  const panel = (): React.ReactNode => {
    switch (mode) {
      case 'waves': return <div className="k-ev-fields">
        <FieldRow stacked label="Wave Plan" help="The plan whose lines come out of this area."><RefField of="plan" value={a.plan as Ref | undefined} ctx={ctx} onChange={v => put('plan', v)} /></FieldRow>
      </div>;
      case 'replace': return <div className="k-ev-fields">{field('After A Death', 'delay', 'How long after one dies the next one comes.', 's', 5)}{field('At Most In All', 'total', TOTAL, undefined, 0)}</div>;
      case 'maxAlive': return <div className="k-ev-fields">{field('Keep This Many Alive', 'maxAlive', 'It fills up to this number.', undefined, 1)}{field('Refill Every', 'refillEvery', 'How often it looks for what is missing.', 's', 5)}{field('At Most In All', 'total', TOTAL, undefined, 0)}{field('First After', 'startAfter', 'How long into the match the first one comes.', 's', 0)}</div>;
      case 'signal': return <div className="k-ev-fields">
        <FieldRow stacked label="When Told" help="The Signal that makes it spawn."><RefField of="signal" value={a.signal as Ref | undefined} ctx={ctx} onChange={v => put('signal', v)} /></FieldRow>
        {field('How Many', 'perSpawn', 'How many come each time it is told.', undefined, 1)}
      </div>;
      default: return <div className="k-ev-fields">{field('Every', 'every', 'The time between two spawns.', 's', 30)}{field('How Many Each Time', 'perSpawn', 'How many come each time.', undefined, 1)}{field('No More Than Alive', 'maxAlive', 'It waits while this many of its own are alive. 0: it never waits.', undefined, 1)}{field('At Most In All', 'total', TOTAL, undefined, 0)}{field('First After', 'startAfter', 'How long into the match the first one comes.', 's', 0)}</div>;
    }
  };
  return (
    <div className="k-ev-spawn">
      <Group title="How They Come" foldKey="spawn-how">
        <Segmented<string> value={mode} onChange={v => put('mode', v)} block options={SPAWN_MODES} />
        <SwapBox swapKey={mode}><div>{panel()}</div></SwapBox>
      </Group>
      <Reveal when={mode !== 'waves'}>{() => (<div className="k-ev-spawn">
        <Group title="What" foldKey="spawn-what"><CardsField value={(a.cards as SpawnCard[] | undefined) ?? []} path={[...base, 'cards']} ctx={ctx} /></Group>
        <Group title="How They Are Placed" foldKey="spawn-place"><PlaceRuleField value={a.place as PlaceRule | undefined} ctx={ctx} onChange={v => put('place', v)} /></Group>
        <Group title="Who They Are" foldKey="spawn-who">
          <FieldRow stacked label="Side" help="The side of what comes out."><TeamSelect value={(a.side as { team?: string } | undefined)?.team} none="Against The Player" onChange={v => put('side', v ? { team: v } : undefined)} /></FieldRow>
          <ToggleRow label="On At The Start" help="Off: it waits until a Map Event turns it on." checked={a.enabledAtStart !== false} onChange={v => put('enabledAtStart', v ? undefined : false)} />
          <SelectRow label="Show Name" help="Its name, drawn over it in a match." value={a.showName === undefined ? '' : a.showName ? 'yes' : 'no'} options={[{ value: '', label: 'As Its Type' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={v => put('showName', v === '' ? undefined : v === 'yes')} />
          <FieldRow stacked label="Tags" help="The tags they count under. A wave, a walking order or a count can use them."><FieldControl field={{ t: 'refs', of: 'tag' }} value={a.tags} path={[...base, 'tags']} ctx={ctx} onChange={v => put('tags', v)} /></FieldRow>
        </Group>
      </div>)}</Reveal>
    </div>
  );
};

export const FoodFields: React.FC<{ row: Row; path: Path; ctx: EvCtx }> = ({ row, path, ctx }) => {
  const [open, setOpen] = useState(false);
  const mac = ctx.logic.state.multiAreaConfig;
  const area = mac.enableMultiArea ? mac.areas.find(a => a.id === ctx.areaId) : undefined;
  const base: ShapeSpawnConfig = area ? area.shapeSpawnConfig : ctx.logic.state.shapeSpawnConfig;
  const own = row.a.shapes && typeof row.a.shapes === 'object' && !Array.isArray(row.a.shapes) ? row.a.shapes as Partial<ShapeSpawnConfig> : null;
  const cfg = useMemo(() => (own ? { ...base, ...own } as ShapeSpawnConfig : base), [base, own]);
  const put = (k: string, v: unknown) => ctx.commit(d => setAt(d, [...path, 'a', k], v));
  const update = (patch: Partial<ShapeSpawnConfig>) => put('shapes', { ...cfg, ...patch });
  const rate = typeof row.a.rate === 'number' ? row.a.rate : 50;
  return (
    <div className="k-ev-spawn">
      <Group title="How Many" foldKey="food-how">
        <KitSliderRow label="Shape Spawn Multiplier" help="How fast its shapes come back. 0: none come." value={rate} onChange={v => put('rate', Math.round(v))} min={0} max={100} deferred minLabel="None" maxLabel="Max (x3)" />
        <KitSliderRow label="Food Cap" help="The most of its own shapes inside it at once. The map's shapes never count here, and its shapes never count against the map's cap." value={cfg.foodCap} onChange={v => update({ foodCap: Math.round(v) })} min={0} max={300} deferred minLabel="None" maxLabel="Chaos" />
        <KitSliderRow label="Group Spawn Chance" help="How often its shapes come as a little cluster instead of one, in percent." value={cfg.groupSpawnChance} onChange={v => update({ groupSpawnChance: Math.round(v) })} min={0} max={100} deferred display={`${Math.round(cfg.groupSpawnChance)}%`} minLabel="Never" maxLabel="Always" />
        <KitSliderRow label="Group Max Size" help="The most shapes in one cluster." value={cfg.groupMaxSize} onChange={v => update({ groupMaxSize: Math.round(v) })} min={1} max={10} deferred minLabel="Solo" maxLabel="Cluster" />
      </Group>
      <Group title="Which Shapes" foldKey="food-which">
        <Button block icon={<Shapes size={16} />} onClick={() => setOpen(true)}>Open Farmable Shapes</Button>
        <FieldRow label="Settings" help={own ? 'Its own copy: the map\'s changes do not reach it.' : 'The map\'s own, until you change one here: then it keeps a copy of its own.'}>
          <Chip>{own ? 'Its Own' : 'The Map\'s'}</Chip>
        </FieldRow>
        <Reveal when={own !== null}><Button size="sm" variant="secondary" block onClick={() => put('shapes', undefined)} title="Its own copy goes, and it follows the map's settings again.">Follow The Map Again</Button></Reveal>
      </Group>
      <Group title="The Map's Shapes" foldKey="food-keep">
        <ToggleRow label="Keeps The Map's Shapes Out" help="On: the map's own shapes never appear inside it, so only its own do. Off: both do." checked={row.a.keepOut !== false} onChange={v => put('keepOut', v ? undefined : false)} />
      </Group>
      {open ? <FarmableShapesWindow cfg={cfg} updateSpawnCfg={update} areaName={ctx.zones.find(z => (z.behaviors ?? []).some(b => b.id === row.id))?.name ?? 'This Area'} onClose={() => setOpen(false)} /> : null}
    </div>
  );
};

const PickOptions: React.FC<{ value: { weight: number; do: Row[] }[]; path: Path; ctx: EvCtx }> = ({ value, path, ctx }) => {
  const total = value.reduce((s, o) => s + (o.weight > 0 ? o.weight : 0), 0);
  return (
    <div className="k-ev-list">
      {value.map((o, i) => (
        <div key={i} className="k-ev-nest">
          <div className="k-ev-nest-head">
            <SmallNum label="Share" help="How likely this list is beside the others." value={o.weight} step={0.1} min={0} onChange={v => ctx.commit(d => setAt(d, [...path, i, 'weight'], v ?? 0))} />
            <span className="k-count">{total > 0 ? `${Math.round((o.weight > 0 ? o.weight : 0) / total * 100)}%` : '0%'}</span>
            <IconButton size="sm" label="Remove this list" onClick={() => ctx.commit(d => removeAt(d, path, i))}><Trash2 size={13} /></IconButton>
          </div>
          <RowList family="step" list={o.do ?? []} path={[...path, i, 'do']} ctx={ctx} addLabel="Add A Step" />
        </div>
      ))}
      <Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={() => ctx.commit(d => insertAt(d, path, -1, { weight: 1, do: [] }))}>Add A List</Button>
    </div>
  );
};

const StayStages: React.FC<{ value: { at: Num; steps: Row[] }[]; path: Path; ctx: EvCtx }> = ({ value, path, ctx }) => (
  <div className="k-ev-list">
    {value.map((s, i) => (
      <div key={i} className="k-ev-nest">
        <div className="k-ev-nest-head">
          <RowLabel label="After" help="How long a tank has stayed when these steps run." />
          <NumField value={s.at} unit="s" onChange={v => ctx.commit(d => setAt(d, [...path, i, 'at'], v))} />
          <IconButton size="sm" label="Remove this stage" onClick={() => ctx.commit(d => removeAt(d, path, i))}><Trash2 size={13} /></IconButton>
        </div>
        <RowList family="step" list={s.steps ?? []} path={[...path, i, 'steps']} ctx={ctx} addLabel="Add A Step" />
      </div>
    ))}
    <Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={() => ctx.commit(d => insertAt(d, path, -1, { at: value.length ? 30 : 10, steps: [] }))}>Add A Stage</Button>
  </div>
);

const LinesField: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => (
  <div className="k-ev-list">
    {value.map((l, i) => (
      <div key={i} className="k-ev-b-row">
        <TextField value={l} onChange={v => onChange(value.map((x, k) => (k === i ? v : x)))} />
        <IconButton size="sm" label="Remove" onClick={() => onChange(value.filter((_, k) => k !== i))}><Trash2 size={13} /></IconButton>
      </div>
    ))}
    <Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={() => onChange([...value, ''])}>Add A Line</Button>
  </div>
);

function interestHides(a: Record<string, unknown>, k: string): boolean {
  const how = typeof a.do === 'string' ? a.do : 'stay';
  if (k === 'who' || k === 'do') return false;
  if (how === 'forget') return true;
  if (k === 'giveUp' || k === 'giveUpTo') return false;
  if (how === 'stay') return k === 'thing' || k === 'toward' || (k === 'tag' && a.until !== 'tag') || (k === 'seconds' && a.until === 'tag') || (k === 'seconds' && a.until === 'never');
  if (how === 'destroy') return k !== 'thing';
  if (how === 'through') return true;
  return !(k === 'thing' || k === 'toward' || (k === 'area' && a.toward === 'area'));
}
export const RowFields: React.FC<{ family: Family; row: Row; path: Path; ctx: EvCtx; hide?: readonly string[] }> = ({ family, row, path, ctx, hide }) => {
  const def = kindOf(family, row.k);
  if (!def) return null;
  if (family === 'behavior' && row.k === 'spawn') return <SpawnFields row={row} path={path} ctx={ctx} />;
  if (family === 'behavior' && row.k === 'food') return <FoodFields row={row} path={path} ctx={ctx} />;
  const names = Object.keys(def.fields).filter(k => !hide?.includes(k));
  const shown = family === 'step' && row.k === 'darkness' ? names.filter(k => !darkStepHides(row.a, k)) : family === 'step' && row.k === 'bot.interest' ? names.filter(k => !interestHides(row.a, k)) : family === 'behavior' && row.k === 'kill' ? names.filter(k => (k !== 'dps' || row.a.does !== 'pct' && row.a.does !== 'instant') && (k !== 'pct' || row.a.does === 'pct') && (k !== 'foodPct' || (row.a.food !== undefined && row.a.food !== 'none'))) : names;
  return (
    <div className="k-ev-fields">
      {shown.map(k => {
        const f = def.fields[k];
        const label = f.label ?? k;
        const enumShown = f.t === 'enum' ? (f.shown?.[f.of.indexOf(typeof row.a[k] === 'string' ? (row.a[k] as string) : f.def)] ?? (typeof row.a[k] === 'string' ? (row.a[k] as string) : f.def)) : undefined;
        const help = f.t === 'enum' ? helpWithPick(label, enumShown, enumShown ? OPTION_HELP[enumShown] : undefined)
          : f.t === 'target' ? targetTip(label, (row.a[k] as Target | undefined) ?? f.def)
          : helpOfLabel(label);
        const write = (v: unknown) => ctx.commit(d => setAt(d, [...path, 'a', k], v));
        if (f.t === 'bool') return <ToggleRow key={k} label={label} help={help} checked={row.a[k] === undefined ? f.def : !!row.a[k]} onChange={write} />;
        if (f.t === 'enum') return <SelectRow key={k} label={label} help={help} value={typeof row.a[k] === 'string' ? (row.a[k] as string) : f.def} onChange={write} options={f.of.map((w, i) => ({ value: w, label: f.shown?.[i] ?? w }))} />;
        if (f.t === 'num' || f.t === 'int') return <FieldRow key={k} label={label} help={help}><FieldControl field={f} value={row.a[k]} path={[...path, 'a', k]} ctx={ctx} onChange={write} /></FieldRow>;
        return (
          <FieldRow key={k} stacked label={label} help={help}>
            {f.t === 'json' && k === 'options' ? <PickOptions value={(row.a[k] as { weight: number; do: Row[] }[] | undefined) ?? []} path={[...path, 'a', k]} ctx={ctx} />
              : f.t === 'json' && k === 'stages' ? <StayStages value={(row.a[k] as { at: Num; steps: Row[] }[] | undefined) ?? []} path={[...path, 'a', k]} ctx={ctx} />
              : f.t === 'json' && k === 'lines' ? <LinesField value={(row.a[k] as string[] | undefined) ?? []} onChange={write} />
              : <FieldControl field={f} value={row.a[k]} path={[...path, 'a', k]} ctx={ctx} onChange={write} />}
          </FieldRow>
        );
      })}
    </div>
  );
};

const _kindGroups = new Map<Family, SelectGroup[]>();
export function groupsOfKinds(family: Family): SelectGroup[] {
  const kept = _kindGroups.get(family);
  if (kept) return kept;
  const out = new Map<string, { value: string; label: string }[]>();
  for (const d of kindsOf(family)) {
    if (d.door || d.internal) continue;
    if (!out.has(d.group)) out.set(d.group, []);
    out.get(d.group)!.push({ value: d.kind, label: d.label });
  }
  const made = [...out.entries()].map(([label, options]) => ({ label, options }));
  _kindGroups.set(family, made);
  return made;
}

const _openRows = new Set<number>();
export function useKeptOpen(id: number, justAdded: () => boolean): [boolean, (v: boolean) => void] {
  const [open, set] = useState(() => { if (justAdded()) _openRows.add(id); return _openRows.has(id); });
  return [open, v => { if (v) _openRows.add(id); else _openRows.delete(id); set(v); }];
}

let _justAddedRow = -1;
export const RowCard: React.FC<{ family: Family; row: Row; path: Path; index: number; total: number; listPath: Path; ctx: EvCtx; numbered?: boolean }> = ({ family, row, path, index, total, listPath, ctx, numbered }) => {
  const [open, setOpen] = useKeptOpen(row.id, () => { if (_justAddedRow !== row.id) return false; _justAddedRow = -1; return true; });
  const [noting, setNoting] = useState(false);
  const def: KindDef | undefined = kindOf(family, row.k);
  const swap = (to: number) => ctx.commit(d => { const list = getAt(d, listPath) as Row[]; const a = list.slice(); [a[to], a[index]] = [a[index], a[to]]; return setAt(d, listPath, a); });
  if (!def) return (
    <div className="k-ev-step">
      <div className="k-ev-step-head"><span className="k-ev-newer">Made in a newer version: kept as it is, and not run</span>
        <span className="k-ev-step-actions"><IconButton size="sm" label="Remove" onClick={() => ctx.commit(d => removeAt(d, listPath, index))}><Trash2 size={13} /></IconButton></span></div>
    </div>
  );
  const facts = factsOf(family, row, ctx.doc, ctx.zones, thingNamer(ctx));
  return (
    <div className={open ? 'k-ev-step k-ev-step-open' : 'k-ev-step'}>
      <div className="k-ev-step-head">
        <button type="button" className="k-ev-step-hit" aria-expanded={open} aria-label={def.label} onClick={() => setOpen(!open)} />
        <span className="k-ev-step-title">
          {numbered ? <span className="k-count">{index + 1}</span> : null}
          <RowLabel label={def.label} help={def.tip || undefined} />
        </span>
        <span className="k-ev-step-actions">
          {numbered && total > 1 && <> { }
            <IconButton size="sm" label="Move up" disabled={index === 0} onClick={() => swap(index - 1)}><ChevronDown size={13} className="k-ev-flip" /></IconButton>
            <IconButton size="sm" label="Move down" disabled={index === total - 1} onClick={() => swap(index + 1)}><ChevronDown size={13} /></IconButton>
          </>}
          <IconButton size="sm" label="A note for yourself. It changes nothing in play." onClick={() => { setNoting(n => !n); setOpen(true); }}><Pencil size={13} /></IconButton>
          <IconButton size="sm" label="Remove" onClick={() => ctx.commit(d => removeAt(d, listPath, index))}><Trash2 size={13} /></IconButton>
          <ChevronDown size={14} className={open ? 'k-chevron k-chevron-open' : 'k-chevron'} />
        </span>
      </div>
      <Collapse open={!open && facts.length > 0} reveal="none"><div className="k-ev-step-facts"><Facts items={facts} /></div></Collapse>
      <Collapse open={open} reveal="self">
        <div className="k-ev-step-body">
          <SelectRow label="Change It To" help={helpWithPick('Change It To', def.label, def.tip)} value={row.k} groups={groupsOfKinds(family)} onChange={k => ctx.commit(d => changeRowKind(d!, path, family, k))} />
          <Reveal when={noting || !!row.note}><FieldRow stacked label="Note" help="A note for yourself. It changes nothing in play."><TextField value={row.note ?? ''} placeholder="A Note" onChange={v => ctx.commit(d => setAt(d, [...path, 'note'], v || undefined))} /></FieldRow></Reveal>
          {open ? <RowFields family={family} row={row} path={path} ctx={ctx} /> : null} { }
        </div>
      </Collapse>
    </div>
  );
};

export function addFilledRow(doc: MapEventsDoc, path: Path, family: Family, word: string, ctx: Pick<EvCtx, 'zones'>): MapEventsDoc {
  const made = addRowAt(doc, path, family, word);
  _justAddedRow = made.id;
  const def = kindOf(family, word);
  const list = getAt(made.doc, path) as Row[];
  const i = list.findIndex(r => r.id === made.id);
  if (!def || i < 0) return made.doc;
  const newest = [...ctx.zones].reverse().find(z => typeof z.uid === 'number');
  const area: Ref | null = newest ? { id: newest.uid as number, n: newest.name ?? '' } : null;
  const plan = made.doc.plans?.[made.doc.plans.length - 1];
  let next = made.doc;
  for (const k of Object.keys(def.fields)) {
    const f = def.fields[k];
    if (f.t === 'ref' && f.of === 'area' && area) next = setAt(next, [...path, i, 'a', k], area);
    if (f.t === 'ref' && f.of === 'plan' && !f.optional && plan) next = setAt(next, [...path, i, 'a', k], { id: plan.id, n: plan.name });
    if (f.t === 'place' && area) next = setAt(next, [...path, i, 'a', k], { w: 'in', areas: [area] });
  }
  return next;
}

export const RowList: React.FC<{ family: Family; list: Row[]; path: Path; ctx: EvCtx; addLabel: string; numbered?: boolean; starter?: readonly string[] }> = ({ family, list, path, ctx, addLabel, numbered }) => (
  <div className="k-ev-list k-ev-rowlist">
    <LongList gap={0} estimate={46} className="k-ev-rows" count={list.length} rowKey={i => String(list[i].id)} renderRow={i => <RowCard family={family} row={list[i]} path={[...path, i]} index={i} total={list.length} listPath={path} ctx={ctx} numbered={numbered ?? family === 'step'} />} />
    <EvSelect add={addLabel} groups={groupsOfKinds(family)} onChange={k => ctx.commit(d => addFilledRow(d!, path, family, k, ctx))} />
  </div>
);

export const Note: React.FC<{ when: unknown; children: React.ReactNode }> = ({ when, children }) => <Reveal when={when}><div className="k-ev-note">{children}</div></Reveal>;
void insertAt;
