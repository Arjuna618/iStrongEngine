import React, { useMemo, useState } from 'react';
import type { AreaGroup, EntityType, MapEventsDoc, Named, PlacedEntity, Rule, Sequence, StatusDef, TimerDef, VarDef, WavePlan, ZoneLike } from '../../game/mapEvents/doc';
import { behaviorsOf } from '../../game/mapEvents/doc';
import type { Problem } from '../../game/mapEvents/compile';
import type { Lint } from '../../game/mapEvents/problems';
import { kindOf } from '../../game/mapEvents/registry';
import {
  addAreaGroup, addEntityType, addNamed, addPlan, addRule, addStatus, addTag, addTimer, addVar, duplicateRule, indexOfId, insertAt, messagesOf, moveAt, namesOf,
  factsOf, overviewLines, pasteRule, removeAt, sentenceOf, setAt, tagWords, tokensToIds, tokensToNames, usedBy, withIds, pastePlan, usedByNames, copyForPaste, type NamedList, type Path } from '../../game/mapEvents/docOps';
import { shippedFormOf } from '../../game/mapEvents/presets/index';
import { Button, Crumbs, EmptyState, FieldRow, Group, IconButton, PickRow, RowLabel, SelectRow, Switch, TextField, ToggleRow, emptyArt } from '../kit/kit';
import { Collapse, PageSwap, Reveal } from '../kit/Collapse';
import { DropMenu, useDropMenu } from '../kit/DropMenu';
import { LongList } from '../kit/LongList';
import { NumberBox } from '../kit/NumberBox';
import type { SelectGroup } from '../shared/CustomSelect';
import { ScrollArea } from '../ui/ScrollArea';
import { EvEmpty, pressDoor } from './EvEmpty';
import { EvSelect } from './EvSelect';
import { toast } from '../ui/Toast';
import { sameProjectUndo } from '../shared/sameProjectUndo';
import { addFilledRow, ChipsField, choicesOf, Facts, factsFrom, groupsOfKinds, NumField, RefField, RowFields, RowList, TakeOffTags, TankField, thingNamer, ThingField, useKeptOpen, ZONES_KEY, type EvCtx } from './fields';
import { shownNameOfWord } from '../../game/tankByName';
import { EntityTypePage } from './typePage';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import { WaveEditor } from './waveEditor';
import { ChevronDown, Copy, MevAreas, MevEntities, MevEvents, MevProblems, MevSequences, MevStatuses, MevTimers, MevTypes, MevVars, MevWaves, MoreHorizontal, Pencil, Plus, Trash2, FolderPlus, Tag, Skull, MessageSquareWarning, SearchX } from '../ui/icons';

const num = (s: string): number | undefined => { const v = Number(s); return s.trim() !== '' && Number.isFinite(v) ? v : undefined; };
export const NumBox: React.FC<{ value: number | undefined | null; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string; unit?: string }> = ({ value, onChange, min, max, step, placeholder, unit }) => (
  <span className="k-ev-numbox"><NumberBox className="k-field k-ev-num" value={value ?? ''} min={min} max={max} step={step} placeholder={placeholder} onChange={e => onChange(num(e.target.value))} />{unit ? <span className="k-unit">{unit}</span> : null}</span>
);

export function removeNamedThing(ctx: EvCtx, list: NamedList, id: number, word: string): void {
  const i = indexOfId(ctx.doc, list, id);
  if (i < 0) return;
  const thing = (ctx.doc![list] as Named[])[i];
  const used = usedBy(ctx.doc, ctx.zones, id);
  ctx.commit(d => removeAt(d, [list], i));
  toast('info', `${word} "${thing.name}" removed.${used ? ` ${used} ${used === 1 ? 'link now finds' : 'links now find'} nothing.` : ''}`, { label: 'Undo', run: SMALL_FIX.R908 !== 0 ? sameProjectUndo(ctx.logic, toast, () => ctx.commit(d => insertAt(d, [list], i, thing))) : () => ctx.commit(d => insertAt(d, [list], i, thing)) });
}

export const Bar: React.FC<{ left?: React.ReactNode; children?: React.ReactNode }> = ({ left, children }) => (
  <div className="k-ev-bar"><div className="k-ev-bar-left">{left}</div><div className="k-ev-bar-right">{children}</div></div>
);
export const Split: React.FC<{ bar?: React.ReactNode; list: React.ReactNode; detail?: React.ReactNode; detailKey?: React.Key; empty?: React.ReactNode }> = ({ bar, list, detail, detailKey, empty }) => (
  <PageSwap>
    {empty ? <div key="empty" className="k-ev-whole">{bar}{empty}</div> : (
      <div key="full" className="k-ev-split">
        <div className="k-ev-split-list">
          {bar}
          <ScrollArea className="k-ev-scroll"><div className="k-ev-list-box">{list}</div></ScrollArea>
        </div>
        <div className="k-ev-split-detail">
          <PageSwap><ScrollArea key={detailKey ?? 'none'} className="k-ev-scroll"><div className="k-ev-detail-box">{detail}</div></ScrollArea></PageSwap>
        </div>
      </div>
    )}
  </PageSwap>
);
const NoMatch: React.FC = () => <EmptyState icon={emptyArt(SearchX)} title="Nothing matches" hint="Try another word." />;
export const ROW_EST = 68;
export const DetailHead: React.FC<{ title: React.ReactNode; right?: React.ReactNode }> = ({ title, right }) => (
  <div className="k-ev-detail-head"><span className="k-ev-detail-title">{title}</span><span className="k-ev-detail-right">{right}</span></div>
);
export const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
export const BarWord: React.FC<{ word: string; n: number }> = ({ word, n }) => <span className="k-ev-bar-word">{word}<span className="k-count">{n}</span></span>;

const STATS: { page: string; word: string; Icon: React.ComponentType<{ size?: number }>; of: (d: MapEventsDoc | undefined, zones: readonly ZoneLike[]) => number }[] = [
  { page: 'events', word: 'Map Events', Icon: MevEvents, of: d => d?.rules?.length ?? 0 },
  { page: 'waves', word: 'Wave Plans', Icon: MevWaves, of: d => d?.plans?.length ?? 0 },
  { page: 'types', word: 'Entity Types', Icon: MevTypes, of: d => d?.types?.length ?? 0 },
  { page: 'entities', word: 'Map Entities', Icon: MevEntities, of: d => d?.placed?.length ?? 0 },
  { page: 'areas', word: 'Custom Areas', Icon: MevAreas, of: (_d, z) => z.length },
  { page: 'vars', word: 'Variables', Icon: MevVars, of: d => d?.vars?.length ?? 0 },
  { page: 'timers', word: 'Timers', Icon: MevTimers, of: d => d?.timers?.length ?? 0 },
  { page: 'names', word: 'Signals And Tags', Icon: Tag, of: d => (d?.signals?.length ?? 0) + (d?.tags?.length ?? 0) },
];

export const OverviewPage: React.FC<{ ctx: EvCtx; problems: readonly (Problem | Lint)[]; go: (page: string) => void; onRestore?: () => void; onTemplates: () => void }> = ({ ctx, problems, go, onRestore, onTemplates }) => {
  const lines = overviewLines(ctx.doc);
  const sure = problems.filter(p => !p.warn).length;
  return (
    <Split
      list={<div className="k-ev-page">
        <div className="k-ev-stats">
          {STATS.map(s => (
            <button key={s.page} type="button" className="k-ev-stat" onClick={() => go(s.page)}>
              <span className="k-ev-stat-icon"><s.Icon size={15} /></span>
              <span className="k-ev-stat-num">{s.of(ctx.doc, ctx.zones)}</span>
              <span className="k-ev-stat-word">{s.word}</span>
            </button>
          ))}
        </div>
        <Reveal when={problems.length > 0}>{() => (
          <button type="button" className="k-ev-alert" onClick={() => go('problems')}>
            <MevProblems size={15} />
            <span>{count(problems.length, 'Problem', 'Problems')}{sure ? `, ${sure} of them will not run` : ''}</span>
          </button>
        )}</Reveal>
        <Group title="What It Does">
          {lines.length === 0
            ? <EmptyState title="Nothing yet" hint="Start from a template, or add a Map Event." action={<Button size="sm" variant="secondary" onClick={onTemplates}>Start From A Template</Button>} />
            : <div className="k-ev-says">{lines.map((l, i) => { const at = l.indexOf(': '); return <div key={i} className="k-ev-say">{at > 0 && at < 20 ? <><span className="k-count">{l.slice(0, at)}</span><span>{/^[^ ]+\.$/.test(l.slice(at + 2)) ? l.slice(at + 2, -1) : l.slice(at + 2)}</span></> : <span>{l}</span>}</div>; })}</div>}
        </Group>
      </div>}
      detailKey="map"
      detail={<div className="k-ev-page">
        <DetailHead title="This Map" />
        <Group title="Title And Note">
          <FieldRow stacked label="Title" help="The name of this set of Map Events. A mode saved as a file takes it as its name."><TextField value={ctx.doc?.meta?.title ?? ''} onChange={v => ctx.commit(d => setAt(d, ['meta', 'title'], v || undefined))} /></FieldRow>
          <FieldRow stacked label="Note" help="A note for yourself. It changes nothing in play."><TextField value={ctx.doc?.meta?.note ?? ''} onChange={v => ctx.commit(d => setAt(d, ['meta', 'note'], v || undefined))} /></FieldRow>
        </Group>
        <Group title="Random Rolls">
          <SelectRow label="How Waves Roll" help="New Every Match: the waves roll differently each time. A Fixed Number: every match rolls alike." value={typeof ctx.doc?.meta?.seed === 'number' ? 'fixed' : 'match'} options={[{ value: 'match', label: 'New Every Match' }, { value: 'fixed', label: 'A Fixed Number' }]} onChange={v => ctx.commit(d => setAt(d, ['meta', 'seed'], v === 'fixed' ? 1 : 'match'))} />
          <Reveal when={typeof ctx.doc?.meta?.seed === 'number'}>{() => (
            <FieldRow label="Number" help="Every match with this number rolls its waves alike."><span className="k-ev-numfield">
              <NumBox value={ctx.doc?.meta?.seed as number} min={0} onChange={v => ctx.commit(d => setAt(d, ['meta', 'seed'], v ?? 0))} />
              <Button size="sm" variant="secondary" onClick={() => ctx.commit(d => setAt(d, ['meta', 'seed'], ((ctx.doc?.meta?.seed as number) * 7919 + 13) % 1000000))}>Reroll</Button>
            </span></FieldRow>
          )}</Reveal>
        </Group>
        <div className="k-ev-stack">
          <Button variant="secondary" block onClick={onTemplates}>{lines.length ? 'Add From A Template' : 'Start From A Template'}</Button>
          <Reveal when={!!onRestore}><Button variant="ghost" block onClick={onRestore} title="Puts this mode's Map Events and Custom Areas back as they were shipped. The toast has an Undo.">Restore Shipped</Button></Reveal>
        </div>
      </div>}
    />
  );
};

const COMMON_STARTS = ['match.started', 'body.died', 'body.born', 'wave.started', 'area.entered', 'timer.ended', 'time.every'];

function doorsOf(ctx: EvCtx): SelectGroup[] {
  const label = (k: string) => kindOf('trigger', k)?.label ?? k;
  const out: SelectGroup[] = [{ label: 'A Common Start', options: COMMON_STARTS.map(k => ({ value: `k:${k}`, label: label(k) })) }];
  const things: { value: string; label: string }[] = [];
  for (const x of choicesOf('type', ctx)) { things.push({ value: `t:${x.id}:body.died`, label: `${x.name} dies` }, { value: `t:${x.id}:body.born`, label: `${x.name} is born` }); }
  for (const x of choicesOf('area', ctx)) { things.push({ value: `a:${x.id}:area.entered`, label: `Someone enters ${x.name}` }, { value: `a:${x.id}:area.left`, label: `Someone leaves ${x.name}` }); }
  for (const x of choicesOf('plan', ctx)) things.push({ value: `p:${x.id}:wave.started`, label: `A wave of ${x.name} starts` });
  for (const x of choicesOf('timer', ctx)) things.push({ value: `i:${x.id}:timer.ended`, label: `${x.name} ends` });
  for (const x of choicesOf('signal', ctx)) things.push({ value: `s:${x.id}:signal.got`, label: `Told ${x.name}` });
  if (things.length) out.push({ label: 'Which Thing?', options: things });
  return [...out, ...groupsOfKinds('trigger').map(g => ({ label: `More: ${g.label}`, options: g.options.map(o => ({ value: `k:${o.value}`, label: o.label })) }))];
}
function addFromDoor(ctx: EvCtx, door: string, folder: number | undefined): number {
  const [head, a, b] = door.split(':');
  const word = head === 'k' ? a : b;
  const groups = doorsOf(ctx);
  const shown = groups.flatMap(g => g.options).find(o => o.value === door)?.label ?? kindOf('trigger', word)?.label ?? 'Map Event';
  let made = -1;
  ctx.commit(d => {
    const r = addRule(d, shown, undefined, folder);
    made = r.id;
    const i0 = indexOfId(r.doc, 'rules', r.id);
    let doc = addFilledRow(r.doc, ['rules', i0, 'when'], 'trigger', word, ctx);
    const i = i0, at = ['rules', i, 'when', 0, 'a'];
    const ref = (of: Parameters<typeof choicesOf>[0]) => { const hit = choicesOf(of, ctx).find(x => String(x.id) === a); return hit ? { id: hit.id, n: hit.name } : undefined; };
    if (head === 't') doc = setAt(doc, [...at, 'who'], { types: [ref('type')] });
    if (head === 'a') doc = setAt(doc, [...at, 'area'], ref('area'));
    if (head === 'p') doc = setAt(doc, [...at, 'plan'], ref('plan'));
    if (head === 'i') doc = setAt(doc, [...at, 'timer'], ref('timer'));
    if (head === 's') doc = setAt(doc, [...at, 'signal'], ref('signal'));
    return doc;
  });
  return made;
}

const RuleDetail: React.FC<{ rule: Rule; i: number; ctx: EvCtx }> = ({ rule, i, ctx }) => {
  const path: Path = ['rules', i];
  const put = (k: keyof Rule, v: unknown) => ctx.commit(d => setAt(d, [...path, k], v));
  const was = shippedFormOf(ctx.doc, 'rules', rule.id, ctx.logic.state.gameModeConfig);
  return (
    <div className="k-ev-page">
      <DetailHead title={rule.name} right={<Switch checked={!rule.off} label={rule.off ? 'Off' : 'On'} onChange={v => put('off', v ? undefined : true)} />} />
      <Group title="When"><RowList family="trigger" list={rule.when} path={[...path, 'when']} ctx={ctx} addLabel="Add Another Start" numbered={false} /></Group>
      <Group title="Only If"><RowList family="cond" list={rule.cond} path={[...path, 'cond']} ctx={ctx} addLabel="Add A Test" numbered={false} /></Group>
      <Group title="Do"><RowList family="step" list={rule.then} path={[...path, 'then']} ctx={ctx} addLabel="Add A Step" numbered /></Group>
      <Group title="Name And Folder" foldKey={`rule-name`} collapsible defaultOpen={false}>
        <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={rule.name} onChange={v => put('name', v)} /></FieldRow>
        <FieldRow stacked label="Note" help="A note for yourself. It changes nothing in play."><TextField value={rule.note ?? ''} onChange={v => put('note', v || undefined)} /></FieldRow>
        <SelectRow label="Folder" help="Folders tidy the list. A folder turned off turns off all its events." value={rule.folder === undefined ? '' : String(rule.folder)} onChange={v => put('folder', v ? Number(v) : undefined)} options={[{ value: '', label: 'No Folder' }, ...(ctx.doc?.folders ?? []).map(f => ({ value: String(f.id), label: f.name }))]} />
      </Group>
      <Group title="How It Runs" foldKey={`rule-runs`} collapsible defaultOpen={false}>
        <ToggleRow label="Runs Only Once In A Match" help="After its first run it never starts again in this match." checked={!!rule.once} onChange={v => put('once', v || undefined)} />
        <SelectRow label="If It Starts Again" help="It starts while a run of it still goes. Side By Side: both run. Ignore It: the new start is dropped. Start Over: the old run stops. One After Another: the new one waits its turn." value={rule.run ?? 'parallel'} onChange={v => put('run', v)} options={[{ value: 'parallel', label: 'Side By Side' }, { value: 'single', label: 'Ignore It' }, { value: 'restart', label: 'Start Over' }, { value: 'queue', label: 'One After Another' }]} />
        <ToggleRow label="That Counts For Each Tank" help="On: If It Starts Again looks only at the runs about the same tank. Off: at all its runs together." checked={rule.perSubject !== false} onChange={v => put('perSubject', v ? undefined : false)} />
        <ToggleRow label="Stops If What Started It Dies" help="On: a run ends when the tank it is about dies, unless that run killed it itself. Off: the run goes on." checked={!rule.outlives} onChange={v => put('outlives', v ? undefined : true)} />
        <FieldRow label="Rests Between Runs" help="After a start it takes no new start for this long."><NumBox value={rule.cooldown} min={0} unit="s" onChange={v => put('cooldown', v)} /></FieldRow>
        <FieldRow label="Only Every Nth Time" help="3: only every third start runs."><NumBox value={rule.everyNth} min={1} onChange={v => put('everyNth', v)} /></FieldRow>
        <FieldRow label="At Most This Many At Once" help="Past this many runs at once, a new start is dropped."><NumBox value={rule.maxRuns ?? 16} min={1} onChange={v => put('maxRuns', v)} /></FieldRow>
      </Group>
      <div className="k-ev-stack">
        <Reveal when={rule.shortcut}>{() => <Button variant="ghost" block onClick={() => put('shortcut', undefined)} title="A card of its own Entity Type or Custom Area wrote this event. As a normal one it is only yours to change here.">Make It A Normal Event</Button>}</Reveal>
        <Reveal when={was !== undefined}><Button variant="ghost" block title="This Map Event as the mode ships it. Undo brings yours back." onClick={() => { const w = shippedFormOf(ctx.doc, 'rules', rule.id, ctx.logic.state.gameModeConfig); if (w !== undefined) ctx.commit(d => setAt(d, path, w)); }}>Restore As Shipped</Button></Reveal>
      </div>
    </div>
  );
};

const FolderMenu: React.FC<{ id: number; ctx: EvCtx }> = ({ id, ctx }) => {
  const menu = useDropMenu({ estimatedHeight: 200, estimatedWidth: 280 });
  const f = ctx.doc?.folders?.find(x => x.id === id);
  if (!f) return null;
  const at = (d: MapEventsDoc | undefined) => indexOfId(d, 'folders', id);
  return (
    <>
      <IconButton ref={menu.triggerRef as React.Ref<HTMLButtonElement>} size="sm" label="This Folder" onClick={e => menu.toggle(e.currentTarget.getBoundingClientRect())}><MoreHorizontal size={14} /></IconButton>
      <DropMenu menu={menu} className="k-menu k-ev-pop popup-scrollbar" label="This Folder">
        <div className="k-ev-form">
          <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={f.name} onChange={v => ctx.commit(d => setAt(d, ['folders', at(d), 'name'], v))} /></FieldRow>
          <FieldRow stacked label="Note" help="A note for yourself. It changes nothing in play."><TextField value={f.note ?? ''} onChange={v => ctx.commit(d => setAt(d, ['folders', at(d), 'note'], v || undefined))} /></FieldRow>
          <Button size="sm" variant="ghost" block icon={<Trash2 size={13} />} title="Its events stay, out of any folder" onClick={() => { menu.close(); ctx.commit(d => { let n = removeAt(d, ['folders'], at(d)); (d?.rules ?? []).forEach((r, i) => { if (r.folder === id) n = setAt(n, ['rules', i, 'folder'], undefined); }); return n; }); }}>Remove This Folder</Button>
        </div>
      </DropMenu>
    </>
  );
};

let _copiedRule: Rule | null = null;

const _ruleText = new WeakMap<Rule, string>();
const ruleText = (r: Rule): string => { let t = _ruleText.get(r); if (t === undefined) { t = JSON.stringify(r).toLowerCase(); _ruleText.set(r, t); } return t; };

export const EventsPage: React.FC<{ ctx: EvCtx; search: string; focus?: number | null; onTemplates?: () => void }> = ({ ctx, search, focus, onTemplates }) => {
  const door = React.useRef<HTMLDivElement>(null);
  const rules = ctx.doc?.rules ?? [];
  const folders = ctx.doc?.folders ?? [];
  const [picked, setPicked] = useState<number | null>(focus ?? null);
  const current = picked !== null && rules.some(r => r.id === picked) ? picked : (rules[0]?.id ?? null);
  const live = React.useRef({ ctx, current, rules });
  live.current = { ctx, current, rules };
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const { ctx: c, current: id, rules: list } = live.current;
      const i = id === null ? -1 : list.findIndex(r => r.id === id);
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (mod && key === 'v' && _copiedRule) { e.preventDefault(); const clip = _copiedRule; let made = -1; c.commit(d => { const r = pasteRule(d, c.zones, clip, i >= 0 ? i + 1 : -1); made = r.id; return r.doc; }); setPicked(made); return; }
      if (i < 0) return;
      if (mod && key === 'c') { e.preventDefault(); _copiedRule = copyForPaste(list[i], c.doc, c.zones); toast('info', `"${list[i].name}" copied.`); }
      else if (mod && key === 'd') { e.preventDefault(); c.commit(d => duplicateRule(d!, id!).doc); }
      else if (key === 'delete') { e.preventDefault(); removeNamedThing(c, 'rules', id!, 'Map Event'); setPicked(null); }
      else if (e.altKey && (key === 'arrowup' || key === 'arrowdown')) { e.preventDefault(); c.commit(d => moveAt(d, ['rules'], i, i + (key === 'arrowup' ? -1 : 1))); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const q = search.trim().toLowerCase();
  const seen = (r: Rule) => !q || r.name.toLowerCase().includes(q) || ruleText(r).includes(q);
  const rowOf = (r: Rule, i: number) => (
    <PickRow title={r.name} facts={factsFrom([...(r.when.length ? r.when.map(w => tagWords(sentenceOf('trigger', w, ctx.doc, ctx.zones))) : ['Only When Another Event Calls It']), count(r.then.length, 'Step', 'Steps')])} selected={current === r.id} onPick={() => setPicked(r.id)}
      actions={<>
        <Switch checked={!r.off} label={r.off ? 'Off' : 'On'} onChange={v => ctx.commit(d => setAt(d, ['rules', i, 'off'], v ? undefined : true))} />
        <IconButton size="sm" label="Duplicate" onClick={() => ctx.commit(d => duplicateRule(d!, r.id).doc)}><Copy size={13} /></IconButton>
        <IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, 'rules', r.id, 'Map Event')}><Trash2 size={13} /></IconButton>
      </>} />
  );
  const sections: { id: number | null; name: string; rows: number[] }[] = [
    ...folders.map(f => ({ id: f.id, name: f.name, rows: [] as number[] })),
    { id: null, name: 'No Folder', rows: [] },
  ];
  rules.forEach((r, i) => { if (seen(r)) (sections.find(s => s.id === (r.folder ?? null)) ?? sections[sections.length - 1]).rows.push(i); });
  const listOf = (rows: readonly number[], empty?: React.ReactNode) => <LongList gap={6} estimate={ROW_EST} empty={empty} reveal={current !== null ? String(current) : null} count={rows.length} rowKey={j => String(rules[rows[j]].id)} renderRow={j => rowOf(rules[rows[j]], rows[j])} />;
  const pickedAt = current === null ? -1 : rules.findIndex(r => r.id === current);
  const shownSections = sections.filter(x => x.id !== null || x.rows.length > 0);
  return (
    <Split
      empty={rules.length === 0 && folders.length === 0 ? <EvEmpty icon={MevEvents} name="No Map Events" hints={[{ label: 'New Map Event', onClick: () => pressDoor(door) }, ...(onTemplates ? [{ label: 'Start From A Template', onClick: onTemplates }] : [])]} /> : undefined}
      bar={<Bar left={<BarWord word="Map Events" n={rules.length} />}>
        <IconButton label="New Folder" onClick={() => ctx.commit(d => addNamed(d, 'folders', 'Folder').doc)}><FolderPlus size={15} /></IconButton>
        <div ref={door} className="k-ev-bar-pick"><EvSelect add="New Map Event" groups={doorsOf(ctx)} onChange={v => { const id = addFromDoor(ctx, v, undefined); if (id >= 0) setPicked(id); }} /></div>
      </Bar>}
      list={<div className="k-ev-page">
        {shownSections.map(s => (s.id === null && folders.length === 0 ? <React.Fragment key="none">{listOf(s.rows, q ? <NoMatch /> : undefined)}</React.Fragment> : s.id === null ? (
          <Group key="none" title={s.name} count={s.rows.length} collapsible foldKey="events-none">{listOf(s.rows)}</Group>
        ) : (
          <Group key={s.id} title={s.name} count={s.rows.length} collapsible foldKey={`events-${s.id}`} right={<>
            <Switch checked={!folders.find(f => f.id === s.id)?.off} label={folders.find(f => f.id === s.id)?.off ? 'Off' : 'On'} onChange={v => ctx.commit(d => setAt(d, ['folders', indexOfId(d, 'folders', s.id!), 'off'], v ? undefined : true))} />
            <FolderMenu id={s.id} ctx={ctx} />
          </>}>
            {listOf(s.rows, <div className="k-ev-note">Nothing in this folder.</div>)}
          </Group>
        )))}
      </div>}
      detailKey={current ?? 'none'}
      detail={pickedAt >= 0 ? <RuleDetail rule={rules[pickedAt]} i={pickedAt} ctx={ctx} /> : null}
    />
  );
};

export const TypesPage: React.FC<{ ctx: EvCtx; search: string; focus?: number | null }> = ({ ctx, search, focus }) => {
  const door = React.useRef<HTMLDivElement>(null);
  const types = ctx.doc?.types ?? [];
  const [picked, setPicked] = useState<number | null>(focus ?? null);
  const current = picked !== null && types.some(t => t.id === picked) ? picked : (types[0]?.id ?? null);
  const ti = current === null ? -1 : types.findIndex(t => t.id === current);
  const q = search.trim().toLowerCase();
  const shown = q ? types.filter(t => t.name.toLowerCase().includes(q)) : types;
  const facts = (t: EntityType) => {
    const used = usedBy(ctx.doc, ctx.zones, t.id);
    return [...t.forms.filter(f => f.name !== t.name).map(f => ({ key: `f${f.id}`, text: f.name })), ...(used ? [{ key: 'used', text: `Used By: ${used}` }] : [])];
  };
  return (
    <Split
      empty={types.length === 0 ? <EvEmpty icon={MevTypes} name="No Entity Types" hints={[{ label: 'New Entity Type', onClick: () => pressDoor(door) }]} /> : undefined}
      bar={<Bar left={<BarWord word="Entity Types" n={types.length} />}>
        <div ref={door} className="k-ev-bar-pick"><ThingField value={undefined} add title="New Entity Type" ctx={ctx} onChange={w => { let made = -1; ctx.commit(d => { const r = addEntityType(d, 'Entity Type', w); made = r.ref.id; return r.doc; }); setPicked(made); }} /></div>
      </Bar>}
      list={<LongList gap={6} estimate={ROW_EST} empty={<NoMatch />} reveal={current !== null ? String(current) : null} count={shown.length} rowKey={i => String(shown[i].id)} renderRow={i => { const t = shown[i]; return (
            <PickRow title={t.name} facts={facts(t)} selected={current === t.id} onPick={() => setPicked(t.id)} actions={<IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, 'types', t.id, 'Entity Type')}><Trash2 size={13} /></IconButton>} />
          ); }} />}
      detailKey={current ?? 'none'}
      detail={ti >= 0 ? <EntityTypePage type={types[ti]} ti={ti} ctx={ctx} /> : null}
    />
  );
};

let _copiedPlan: WavePlan | null = null;
export const WavesPage: React.FC<{ ctx: EvCtx; focus?: number | null; search?: string }> = ({ ctx, focus, search = '' }) => {
  const plans = ctx.doc?.plans ?? [];
  const [, bumpCopied] = useState(0);
  const [pick, setPick] = useState<number | null>(focus ?? (plans.length === 1 ? plans[0].id : null));
  const pi = pick === null ? -1 : plans.findIndex(p => p.id === pick);
  if (pi >= 0) return (
    <div className="k-ev-whole">
      <Bar left={<Crumbs items={[{ label: 'Wave Plans', onClick: () => setPick(null) }, { label: plans[pi].name }]} />}>
        <Reveal when={shippedFormOf(ctx.doc, 'plans', plans[pi].id, ctx.logic.state.gameModeConfig) !== undefined}><Button size="sm" variant="ghost" title="This plan as the mode ships it. Undo brings yours back." onClick={() => { const was = shippedFormOf(ctx.doc, 'plans', plans[pi].id, ctx.logic.state.gameModeConfig); if (was !== undefined) ctx.commit(d => setAt(d, ['plans', pi], was)); }}>Restore As Shipped</Button></Reveal>
        <Switch checked={!plans[pi].off} label={plans[pi].off ? 'Off' : 'On'} onChange={v => ctx.commit(d => setAt(d, ['plans', pi, 'off'], v ? undefined : true))} />
      </Bar>
      <WaveEditor plan={plans[pi]} pi={pi} ctx={ctx} search={search} />
    </div>
  );
  const newPlan = () => { let made = -1; ctx.commit(d => { const r = addPlan(d, 'Wave Plan'); made = r.ref.id; return r.doc; }); setPick(made); };
  const pastePlanNow = () => { const c = _copiedPlan; if (c) ctx.commit(d => pastePlan(d, ctx.zones, c).doc); };
  const bar = (
    <Bar left={<BarWord word="Wave Plans" n={plans.length} />}>
      <Button size="sm" variant="ghost" disabled={_copiedPlan === null} onClick={pastePlanNow}>Paste A Plan</Button>
      <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={newPlan}>New Wave Plan</Button>
    </Bar>
  );
  return (
    <PageSwap>
      {plans.length === 0 ? <div key="empty" className="k-ev-whole">{bar}<EvEmpty icon={MevWaves} name="No Wave Plans" hints={[{ label: 'New Wave Plan', onClick: newPlan }, ...(_copiedPlan ? [{ label: 'Paste A Plan', onClick: pastePlanNow }] : [])]} /></div> : (
    <div key="full" className="k-ev-whole">
      {bar}
      <ScrollArea className="k-ev-scroll"><div className="k-ev-list-box">
        <LongList gap={6} estimate={ROW_EST} count={plans.length} rowKey={i => String(plans[i].id)} renderRow={i => { const p: WavePlan = plans[i]; return <PickRow title={p.name} facts={[{ key: 'g', text: count(p.groups.length, 'Line', 'Lines') }, { key: 's', text: `${p.specials?.length ?? 0} Special` }, { key: 'e', text: p.last === null || p.last === undefined ? 'Endless' : `To Wave ${p.last}` }]} onPick={() => setPick(p.id)}
            actions={<><IconButton size="sm" label="Copy this plan, for this map or another" onClick={() => { _copiedPlan = copyForPaste(p, ctx.doc, ctx.zones); bumpCopied(n => n + 1); }}><Copy size={13} /></IconButton><IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, 'plans', p.id, 'Wave Plan')}><Trash2 size={13} /></IconButton></>} />; }} />
      </div></ScrollArea>
    </div>
      )}
    </PageSwap>
  );
};

const EntityDetail: React.FC<{ e: PlacedEntity; i: number; ctx: EvCtx }> = ({ e, i, ctx }) => {
  const put = (k: keyof PlacedEntity, v: unknown) => ctx.commit(d => setAt(d, ['placed', i, k], v));
  const type = ctx.doc?.types?.find(t => t.id === e.type?.id);
  return (
    <div className="k-ev-page">
      <DetailHead title={e.name} right={<Switch checked={!e.off} label={e.off ? 'Off' : 'On'} onChange={v => put('off', v ? undefined : true)} />} />
      <Group title="What It Is">
        <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={e.name} onChange={v => put('name', v)} /></FieldRow>
        <SelectRow label="Entity Type" help="What it is: its tank, how it acts and what it becomes. Many Map Entities can share one." value={String(e.type?.id ?? '')} options={choicesOf('type', ctx).map(x => ({ value: String(x.id), label: x.name }))} onChange={v => { const hit = choicesOf('type', ctx).find(x => String(x.id) === v); if (hit) put('type', { id: hit.id, n: hit.name }); }} />
        <SelectRow label="Starts As" help="Which form of its Entity Type it stands in when the match starts." value={String(e.startForm ?? '')} options={[{ value: '', label: 'Its First Form' }, ...(type?.forms ?? []).map(f => ({ value: String(f.id), label: f.name }))]} onChange={v => put('startForm', v ? Number(v) : undefined)} />
        <SelectRow label="Home Area" help="A rule can say: the home area of this one." value={String(e.home?.id ?? '')} options={[{ value: '', label: 'None' }, ...choicesOf('area', ctx).map(x => ({ value: String(x.id), label: x.name }))]} onChange={v => { const hit = choicesOf('area', ctx).find(x => String(x.id) === v); put('home', hit ? { id: hit.id, n: hit.name } : undefined); }} />
        <SelectRow label="Show Name" help="Its name, drawn over it in a match." value={e.showName === undefined ? '' : e.showName ? 'yes' : 'no'} options={[{ value: '', label: 'As Its Type' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={v => put('showName', v === '' ? undefined : v === 'yes')} />
        <FieldRow stacked label="Note" help="A note for yourself. It changes nothing in play."><TextField value={e.note ?? ''} onChange={v => put('note', v || undefined)} /></FieldRow>
      </Group>
      <Group title="Where It Stands">
        <FieldRow label="Cell X" help="The map's column, counted in cells."><NumBox value={e.cx} step={0.5} onChange={v => { if (v !== undefined) put('cx', v); }} /></FieldRow>
        <FieldRow label="Cell Y" help="The map's row, counted in cells."><NumBox value={e.cy} step={0.5} onChange={v => { if (v !== undefined) put('cy', v); }} /></FieldRow>
        <FieldRow label="Turned (degrees)" help="The way it faces when it is born."><NumBox value={e.angle ?? 0} onChange={v => put('angle', v ?? 0)} /></FieldRow>
      </Group>
      <Reveal when={(type?.forms.length ?? 0) > 1}>{() => (
        <Group title="Where It Stands In Each Form">
          {(type?.forms ?? []).map(f => {
            const at = (e.spots ?? []).findIndex(s => s.form === f.id);
            const spot = at >= 0 ? e.spots![at] : null;
            const set = (k: 'cx' | 'cy', v: number | undefined) => ctx.commit(d => {
              const list = [...(e.spots ?? [])];
              if (v === undefined) { if (at >= 0) list.splice(at, 1); }
              else if (at >= 0) list[at] = { ...list[at], [k]: v };
              else list.push({ form: f.id, cx: k === 'cx' ? v : e.cx, cy: k === 'cy' ? v : e.cy });
              return setAt(d, ['placed', i, 'spots'], list.length > 0 ? list : undefined);
            });
            return (
              <FieldRow key={f.id} label={f.name} help="Where it stands while it is in this form, in cells: a change into this form moves it there. Empty: its own spot above.">
                <div className="k-ev-inline">
                  <NumBox value={spot?.cx} step={0.5} placeholder="Cell X" onChange={v => set('cx', v)} />
                  <NumBox value={spot?.cy} step={0.5} placeholder="Cell Y" onChange={v => set('cy', v)} />
                </div>
              </FieldRow>
            );
          })}
        </Group>
      )}</Reveal>
    </div>
  );
};

export const EntitiesPage: React.FC<{ ctx: EvCtx; search: string; focus?: number | null }> = ({ ctx, search, focus }) => {
  const q = search.trim().toLowerCase();
  const placed = ctx.doc?.placed ?? [];
  const [picked, setPicked] = useState<number | null>(focus ?? null);
  const current = picked !== null && placed.some(e => e.id === picked) ? picked : (placed[0]?.id ?? null);
  const at = current === null ? -1 : placed.findIndex(e => e.id === current);
  const shown = q ? placed.filter(e => e.name.toLowerCase().includes(q)) : placed;
  return (
    <Split
      empty={placed.length === 0 ? <EvEmpty icon={MevEntities} name="No Map Entities" hints={[{ label: 'Place One With The Map Entity Tool Of The Map Designer' }]} /> : undefined}
      bar={<Bar left={<BarWord word="Map Entities" n={placed.length} />} />}
      list={<LongList gap={6} estimate={ROW_EST} empty={<NoMatch />} reveal={current !== null ? String(current) : null} count={shown.length} rowKey={i => String(shown[i].id)} renderRow={i => { const e = shown[i]; return (
            <PickRow title={e.name} facts={factsFrom([e.type?.n ?? ''])} selected={current === e.id} onPick={() => setPicked(e.id)}
              actions={<>
                <Switch checked={!e.off} label={e.off ? 'Off' : 'On'} onChange={v => ctx.commit(d => setAt(d, ['placed', indexOfId(d, 'placed', e.id), 'off'], v ? undefined : true))} />
                <IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, 'placed', e.id, 'Map Entity')}><Trash2 size={13} /></IconButton>
              </>} />
          ); }} />}
      detailKey={current ?? 'none'}
      detail={at >= 0 ? <EntityDetail e={placed[at]} i={at} ctx={ctx} /> : null}
    />
  );
};

export const AreaBehaviors: React.FC<{ z: ZoneLike; i: number; ctx: EvCtx }> = ({ z, i, ctx }) => {
  const list = behaviorsOf(z);
  const path: Path = [ZONES_KEY, i, 'behaviors'];
  const zctx: EvCtx = useMemo(() => ({
    ...ctx,
    commit: edit => ctx.commit(d => {
      if (Array.isArray(z.behaviors) || list.length === 0) return edit(d);
      const r = withIds(d, id => list.map(b => ({ ...b, id: id() })));
      return edit(setAt(r.doc, path, r.value));
    }),
  }), [ctx, z, list]);
  return <RowList family="behavior" list={list} path={path} ctx={zctx} addLabel="Add A Behaviour" numbered={false} />;
};

export const AreasPage: React.FC<{ ctx: EvCtx; search: string; focus?: number | null }> = ({ ctx, search, focus }) => {
  const q = search.trim().toLowerCase();
  const [picked, setPicked] = useState<number | null>(focus ?? null);
  const groups = ctx.doc?.areaGroups ?? [];
  const current = picked !== null && ctx.zones.some(z => z.id === picked) ? picked : (ctx.zones[0]?.id ?? null);
  const at = current === null ? -1 : ctx.zones.findIndex(z => z.id === current);
  const shown = q ? ctx.zones.filter(z => (z.name ?? '').toLowerCase().includes(q)) : ctx.zones;
  return (
    <Split
      empty={ctx.zones.length === 0 && groups.length === 0 ? <EvEmpty icon={MevAreas} name="No Custom Areas" hints={[{ label: 'Draw One With The Custom Area Tool Of The Map Designer' }]} /> : undefined}
      bar={<Bar left={<BarWord word="Custom Areas" n={ctx.zones.length} />}>
        <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => ctx.commit(d => addAreaGroup(d, 'Area Group').doc)}>New Group</Button>
      </Bar>}
      list={<div className="k-ev-page">
        <LongList gap={6} estimate={ROW_EST} empty={ctx.zones.length > 0 ? <NoMatch /> : undefined} reveal={current !== null ? String(current) : null} count={shown.length} rowKey={i => String(shown[i].id)} renderRow={i => { const z = shown[i]; return (
            <PickRow title={z.name ?? 'Custom Area'} facts={behaviorsOf(z).map((b, bi) => ({ key: `b${bi}`, text: kindOf('behavior', b.k)?.label ?? b.k }))} selected={current === z.id} onPick={() => setPicked(z.id)} />
          ); }} />
        <Reveal when={groups.length > 0}>{() => (
          <Group title="Area Groups" count={groups.length}>
            <LongList estimate={130} count={groups.length} rowKey={n => String(groups[n].id)} renderRow={gi => { const g: AreaGroup = groups[gi]; return (
                <div className="k-ev-group-row">
                  <div className="k-ev-group-head">
                    <TextField value={g.name} onChange={v => ctx.commit(d => setAt(d, ['areaGroups', gi, 'name'], v))} />
                    <IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, 'areaGroups', g.id, 'Area Group')}><Trash2 size={13} /></IconButton>
                  </div>
                  <ChipsField values={g.members.map(r => ({ key: String(r.id), label: r.n }))} offer={choicesOf('area', ctx).map(x => ({ key: String(x.id), label: x.name }))} addLabel="Add An Area"
                    onAdd={k => { const hit = choicesOf('area', ctx).find(x => String(x.id) === k); if (hit) ctx.commit(d => setAt(d, ['areaGroups', gi, 'members'], [...g.members, { id: hit.id, n: hit.name }])); }}
                    onRemove={k => ctx.commit(d => setAt(d, ['areaGroups', gi, 'members'], g.members.filter(r => String(r.id) !== k)))} />
                </div>
              ); }} />
          </Group>
        )}</Reveal>
      </div>}
      detailKey={current ?? 'none'}
      detail={at >= 0 ? (
        <div className="k-ev-page">
          <DetailHead title={ctx.zones[at].name ?? 'Custom Area'} />
          <Group title="This Area"><FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={ctx.zones[at].name ?? ''} onChange={v => ctx.commit(d => setAt(d, [ZONES_KEY, at, 'name'], v))} /></FieldRow></Group>
          <Group title="What It Does"><AreaBehaviors z={ctx.zones[at]} i={at} ctx={ctx} /></Group>
        </div>
      ) : null}
    />
  );
};

export const MessagesPage: React.FC<{ ctx: EvCtx; search: string; go: (page: string, focus?: number) => void }> = ({ ctx, search, go }) => {
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => messagesOf(ctx.doc, ctx.zones, i => [ZONES_KEY, i]), [ctx.doc, ctx.zones]);
  const names = namesOf(ctx.doc, ctx.zones);
  const shown = q ? rows.filter(r => r.text.toLowerCase().includes(q) || r.where.toLowerCase().includes(q)) : rows;
  const bar = <Bar left={<BarWord word="Messages" n={rows.length} />} />;
  return (
    <PageSwap>
      {rows.length === 0 ? <div key="empty" className="k-ev-whole">{bar}<EvEmpty icon={MessageSquareWarning} name="No Messages" hints={[{ label: 'What A Map Event, An Entity Type Or A Custom Area Says Appears Here' }]} /></div> : (
    <div key="full" className="k-ev-whole">
      {bar}
      <ScrollArea className="k-ev-scroll">
      <LongList estimate={50} empty={<NoMatch />} count={shown.length} rowKey={i => `${shown[i].where}|${shown[i].field}|${i}`} renderRow={i => {
        const m = shown[i];
        return (
          <div className="k-ev-msg">
            {m.rule !== undefined
              ? <button type="button" className="k-ev-msg-where k-ev-msg-go" onClick={() => go('events', m.rule)} title="Open this Map Event">{m.where}</button>
              : <span className="k-ev-msg-where">{m.where}</span>}
            <TextField value={tokensToNames(m.text, names)} onChange={v => ctx.commit(d => setAt(d, [...m.path, m.field], tokensToIds(v, ctx.doc)))} />
          </div>
        );
      }} />
      </ScrollArea>
    </div>
      )}
    </PageSwap>
  );
};

export const VarsPage: React.FC<{ ctx: EvCtx }> = ({ ctx }) => {
  const list = ctx.doc?.vars ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const current = picked !== null && list.some(v => v.id === picked) ? picked : (list[0]?.id ?? null);
  const i = current === null ? -1 : list.findIndex(v => v.id === current);
  const put = (k: keyof VarDef, x: unknown) => ctx.commit(d => setAt(d, ['vars', i, k], x));
  const scopeWord: Record<string, string> = { match: 'One for the match', team: 'One for each side', body: 'One for each tank' };
  const add = () => { let made = -1; ctx.commit(d => { const r = addVar(d, 'Variable'); made = r.ref.id; return r.doc; }); setPicked(made); };
  return (
    <Split
      empty={list.length === 0 ? <EvEmpty icon={MevVars} name="No Variables" hints={[{ label: 'New Variable', onClick: add }]} /> : undefined}
      bar={<Bar left={<BarWord word="Variables" n={list.length} />}><Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={add}>New Variable</Button></Bar>}
      list={<LongList gap={6} estimate={ROW_EST} reveal={current !== null ? String(current) : null} count={list.length} rowKey={n => String(list[n].id)} renderRow={n => { const v: VarDef = list[n]; return <PickRow title={v.name} facts={[{ key: 'scope', text: scopeWord[v.scope] ?? '' }, { key: 'start', text: `Starts At ${v.start}` }]} selected={current === v.id} onPick={() => setPicked(v.id)} actions={<IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, 'vars', v.id, 'Variable')}><Trash2 size={13} /></IconButton>} />; }} />}
      detailKey={current ?? 'none'}
      detail={i >= 0 ? (
        <div className="k-ev-page">
          <DetailHead title={list[i].name} />
          <Group title="This Variable">
            <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={list[i].name} onChange={x => put('name', x)} /></FieldRow>
            <SelectRow label="Holds" help="A number, or just on and off." value={list[i].kind} onChange={x => put('kind', x)} options={[{ value: 'number', label: 'A Number' }, { value: 'onoff', label: 'On Or Off' }]} />
            <FieldRow label="Starts At" help="Its value when the match starts."><NumBox value={list[i].start} onChange={x => put('start', x ?? 0)} /></FieldRow>
            <SelectRow label="One For" help="The Match: one number for everyone. Each Side, Each Tank: a number of its own for each." value={list[i].scope} onChange={x => put('scope', x)} options={[{ value: 'match', label: 'The Match' }, { value: 'team', label: 'Each Side' }, { value: 'body', label: 'Each Tank' }]} />
            <FieldRow stacked label="Note" help="A note for yourself. It changes nothing in play."><TextField value={list[i].note ?? ''} onChange={x => put('note', x || undefined)} /></FieldRow>
          </Group>
        </div>
      ) : null}
    />
  );
};

export const TimersPage: React.FC<{ ctx: EvCtx }> = ({ ctx }) => {
  const list = ctx.doc?.timers ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const current = picked !== null && list.some(v => v.id === picked) ? picked : (list[0]?.id ?? null);
  const i = current === null ? -1 : list.findIndex(v => v.id === current);
  const put = (k: keyof TimerDef, x: unknown) => ctx.commit(d => setAt(d, ['timers', i, k], x));
  const add = () => { let made = -1; ctx.commit(d => { const r = addTimer(d, 'Timer'); made = r.ref.id; return r.doc; }); setPicked(made); };
  return (
    <Split
      empty={list.length === 0 ? <EvEmpty icon={MevTimers} name="No Timers" hints={[{ label: 'New Timer', onClick: add }]} /> : undefined}
      bar={<Bar left={<BarWord word="Timers" n={list.length} />}><Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={add}>New Timer</Button></Bar>}
      list={<LongList gap={6} estimate={ROW_EST} reveal={current !== null ? String(current) : null} count={list.length} rowKey={n => String(list[n].id)} renderRow={n => { const t: TimerDef = list[n]; return <PickRow title={t.name} facts={[{ key: 'sec', text: typeof t.seconds === 'number' ? `Lasts ${t.seconds} s` : 'By A Formula' }, ...(t.repeat ? [{ key: 'rep', text: 'Starts Over' }] : [])]} selected={current === t.id} onPick={() => setPicked(t.id)} actions={<IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, 'timers', t.id, 'Timer')}><Trash2 size={13} /></IconButton>} />; }} />}
      detailKey={current ?? 'none'}
      detail={i >= 0 ? (
        <div className="k-ev-page">
          <DetailHead title={list[i].name} />
          <Group title="This Timer">
            <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={list[i].name} onChange={x => put('name', x)} /></FieldRow>
            <FieldRow label="Lasts" help="How long it counts down."><NumField value={list[i].seconds} unit="s" onChange={x => put('seconds', x)} /></FieldRow>
            <FieldRow stacked label="Tells At These Seconds Left" help="A Map Event can start at each of these seconds. Numbers with commas."><TextField value={(list[i].marks ?? []).join(', ')} placeholder="30, 10, 5" onChange={x => { const l = x.split(/[^0-9.]+/).filter(Boolean).map(Number); put('marks', l.length ? l : undefined); }} /></FieldRow>
            <ToggleRow label="Starts Over" help="At zero it starts again by itself." checked={!!list[i].repeat} onChange={x => put('repeat', x || undefined)} />
            <ToggleRow label="Shown On Screen" help="Its time stands in the stack above the minimap." checked={!!list[i].showOnHud} onChange={x => put('showOnHud', x || undefined)} />
            <FieldRow stacked label="Note" help="A note for yourself. It changes nothing in play."><TextField value={list[i].note ?? ''} onChange={x => put('note', x || undefined)} /></FieldRow>
          </Group>
        </div>
      ) : null}
    />
  );
};

const NamedList_: React.FC<{ title: string; list: 'signals' | 'tags'; word: string; hint: string; ctx: EvCtx }> = ({ title, list, word, hint, ctx }) => {
  const rows = (ctx.doc?.[list] as Named[] | undefined) ?? [];
  return (
    <Group title={title} count={rows.length} right={<IconButton size="sm" label={`New ${word}`} onClick={() => ctx.commit(d => (list === 'tags' ? addTag(d, word).doc : addNamed(d, 'signals', word).doc))}><Plus size={14} /></IconButton>}>
      <LongList estimate={44} empty={<div className="k-ev-note">{hint}</div>} count={rows.length} rowKey={i => String(rows[i].id)} renderRow={i => { const t = rows[i]; return (
        <div className="k-ev-name-row">
          <TextField value={t.name} onChange={x => ctx.commit(d => setAt(d, [list, i, 'name'], x))} />
          <span className="k-count" title={usedByNames(ctx.doc, ctx.zones, t.id).join(', ') || undefined}>{`Used By: ${usedBy(ctx.doc, ctx.zones, t.id)}`}</span>
          <IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, list, t.id, word)}><Trash2 size={13} /></IconButton>
        </div>
      ); }} />
    </Group>
  );
};
export const NamesPage: React.FC<{ ctx: EvCtx }> = ({ ctx }) => {
  const nothing = (ctx.doc?.signals?.length ?? 0) === 0 && (ctx.doc?.tags?.length ?? 0) === 0;
  return (
    <PageSwap>
      {nothing ? <div key="empty" className="k-ev-whole"><EvEmpty icon={Tag} name="No Signals Or Tags" hints={[{ label: 'New Signal', onClick: () => ctx.commit(d => addNamed(d, 'signals', 'Signal').doc) }, { label: 'New Tag', onClick: () => ctx.commit(d => addTag(d, 'Tag').doc) }]} /></div> : (
        <ScrollArea key="full" className="k-ev-scroll"><div className="k-ev-list-box k-ev-cols">
          <NamedList_ title="Signals" list="signals" word="Signal" hint="One event tells a Signal, and others start from it." ctx={ctx} />
          <NamedList_ title="Tags" list="tags" word="Tag" hint="A Tag names many Entity Types at once: a wave, a walking order or a count can use it." ctx={ctx} />
        </div></ScrollArea>
      )}
    </PageSwap>
  );
};

export const StatusesPage: React.FC<{ ctx: EvCtx }> = ({ ctx }) => {
  const list = ctx.doc?.statuses ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const current = picked !== null && list.some(v => v.id === picked) ? picked : (list[0]?.id ?? null);
  const i = current === null ? -1 : list.findIndex(v => v.id === current);
  const put = (k: keyof StatusDef, x: unknown) => ctx.commit(d => setAt(d, ['statuses', i, k], x));
  const add = () => { let made = -1; ctx.commit(d => { const r = addStatus(d, 'Status'); made = r.ref.id; return r.doc; }); setPicked(made); };
  return (
    <Split
      empty={list.length === 0 ? <EvEmpty icon={MevStatuses} name="No Statuses" hints={[{ label: 'New Status', onClick: add }]} /> : undefined}
      bar={<Bar left={<BarWord word="Statuses" n={list.length} />}><Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={add}>New Status</Button></Bar>}
      list={<LongList gap={6} estimate={ROW_EST} reveal={current !== null ? String(current) : null} count={list.length} rowKey={n => String(list[n].id)} renderRow={n => { const s: StatusDef = list[n]; return <PickRow title={s.name} facts={factsFrom([s.seconds === null ? 'For Ever' : typeof s.seconds === 'number' ? `Lasts ${s.seconds} s` : 'By A Formula', count(s.effects.length, 'Effect', 'Effects')])} selected={current === s.id} onPick={() => setPicked(s.id)} actions={<IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, 'statuses', s.id, 'Status')}><Trash2 size={13} /></IconButton>} />; }} />}
      detailKey={current ?? 'none'}
      detail={i >= 0 ? (
        <div className="k-ev-page">
          <DetailHead title={list[i].name} />
          <Group title="This Status">
            <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={list[i].name} onChange={x => put('name', x)} /></FieldRow>
            <ToggleRow label="For Ever, Until Removed" help="It has no time of its own: it lasts until a step takes it off." checked={list[i].seconds === null} onChange={x => put('seconds', x ? null : 5)} />
            <Reveal when={list[i].seconds !== null}>{() => <FieldRow label="Lasts" help="How long it counts down."><NumField value={list[i].seconds as never} unit="s" onChange={x => put('seconds', x)} /></FieldRow>}</Reveal>
            <SelectRow label="Given Again" help="What happens when a tank that has it is given it again." value={list[i].stack ?? 'restart'} options={[{ value: 'restart', label: 'Starts Its Time Over' }, { value: 'extend', label: 'Adds To Its Time' }, { value: 'ignore', label: 'Does Nothing' }]} onChange={x => put('stack', x)} />
            <SelectRow label="When The Tank Dies" help="It ends with the tank, or it stays for its next body." value={list[i].onDeath ?? 'ends'} options={[{ value: 'ends', label: 'It Ends' }, { value: 'stays', label: 'It Stays' }]} onChange={x => put('onDeath', x)} />
            <SelectRow label="When Its Tank Changes" help="It stays through a Become or a Change Tank, or it ends there." value={list[i].onTankChange ?? 'stays'} options={[{ value: 'stays', label: 'It Stays' }, { value: 'ends', label: 'It Ends' }]} onChange={x => put('onTankChange', x)} />
          </Group>
          <Group title="What It Does"><RowList family="effect" list={list[i].effects} path={['statuses', i, 'effects']} ctx={ctx} addLabel="Add An Effect" numbered={false} /></Group>
        </div>
      ) : null}
    />
  );
};

let _justAddedClip = -1;
const ClipCard: React.FC<{ clip: { id: number; at: number; step: { id: number; k: string; a: Record<string, unknown>; note?: string } }; path: Path; listPath: Path; index: number; ctx: EvCtx }> = ({ clip, path, listPath, index, ctx }) => {
  const [open, setOpen] = useKeptOpen(clip.id, () => { if (_justAddedClip !== clip.id) return false; _justAddedClip = -1; return true; });
  const [noting, setNoting] = useState(false);
  const def = kindOf('step', clip.step.k);
  const facts = factsOf('step', clip.step, ctx.doc, ctx.zones, thingNamer(ctx));
  return (
    <div className={open ? 'k-ev-step k-ev-step-open' : 'k-ev-step'}>
      <div className="k-ev-step-head">
        <button type="button" className="k-ev-step-hit" aria-expanded={open} aria-label={def?.label ?? 'A step'} onClick={() => setOpen(!open)} />
        <span className="k-ev-step-title"><span className="k-count">{`${clip.at} s`}</span><RowLabel label={def?.label ?? 'Made in a newer version'} help={def?.tip || undefined} /></span>
        <span className="k-ev-step-actions">
          <IconButton size="sm" label="A note for yourself. It changes nothing in play." onClick={() => { setNoting(n => !n); setOpen(true); }}><Pencil size={13} /></IconButton>
          <IconButton size="sm" label="Remove" onClick={() => ctx.commit(d => removeAt(d, listPath, index))}><Trash2 size={13} /></IconButton>
          <ChevronDown size={14} className={open ? 'k-chevron k-chevron-open' : 'k-chevron'} />
        </span>
      </div>
      <Collapse open={!open && facts.length > 0} reveal="none"><div className="k-ev-step-facts"><Facts items={facts} /></div></Collapse>
      <Collapse open={open} reveal="self">
        <div className="k-ev-step-body">
          <FieldRow label="At" help="How long after the sequence starts this step runs."><NumBox value={clip.at} min={0} step={0.1} unit="s" onChange={x => ctx.commit(d => setAt(d, [...path, 'at'], x ?? 0))} /></FieldRow>
          <SelectRow label="Change It To" help="Makes this step another one. Its fields start anew." value={clip.step.k} groups={groupsOfKinds('step')} onChange={k => ctx.commit(d => { const r = withIds(d, id => ({ id: id(), k, a: {} })); return setAt(r.doc, [...path, 'step'], r.value); })} />
          <Reveal when={noting || !!clip.step.note}><FieldRow stacked label="Note" help="A note for yourself. It changes nothing in play."><TextField value={clip.step.note ?? ''} placeholder="A Note" onChange={v => ctx.commit(d => setAt(d, [...path, 'step', 'note'], v || undefined))} /></FieldRow></Reveal>
          {open ? <RowFields family="step" row={clip.step} path={[...path, 'step']} ctx={ctx} /> : null} { }
        </div>
      </Collapse>
    </div>
  );
};

export const SequencesPage: React.FC<{ ctx: EvCtx }> = ({ ctx }) => {
  const list = ctx.doc?.sequences ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const current = picked !== null && list.some(v => v.id === picked) ? picked : (list[0]?.id ?? null);
  const i = current === null ? -1 : list.findIndex(v => v.id === current);
  const put = (k: keyof Sequence, x: unknown) => ctx.commit(d => setAt(d, ['sequences', i, k], x));
  const s = i >= 0 ? list[i] : null;
  const add = () => { let made = -1; ctx.commit(d => { const r = withIds(d, (id, base) => ({ id: id(), name: `Sequence ${(base.sequences?.length ?? 0) + 1}`, tracks: [{ id: id(), name: 'Track 1', clips: [] }] } as Sequence)); made = r.value.id; return { ...r.doc, sequences: [...(r.doc.sequences ?? []), r.value] }; }); setPicked(made); };
  return (
    <Split
      empty={list.length === 0 ? <EvEmpty icon={MevSequences} name="No Sequences" hints={[{ label: 'New Sequence', onClick: add }]} /> : undefined}
      bar={<Bar left={<BarWord word="Sequences" n={list.length} />}><Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={add}>New Sequence</Button></Bar>}
      list={<LongList gap={6} estimate={ROW_EST} reveal={current !== null ? String(current) : null} count={list.length} rowKey={n => String(list[n].id)} renderRow={n => { const q: Sequence = list[n]; return <PickRow title={q.name} facts={factsFrom([count(q.tracks.length, 'Track', 'Tracks'), count(q.tracks.reduce((n, t) => n + t.clips.length, 0), 'Step', 'Steps'), q.lockInput ? 'Holds The Player' : '', q.skippable ? 'Can Be Skipped' : '', q.timeout ? `At Most ${q.timeout} s` : ''])} selected={current === q.id} onPick={() => setPicked(q.id)} actions={<IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, 'sequences', q.id, 'Sequence')}><Trash2 size={13} /></IconButton>} />; }} />}
      detailKey={current ?? 'none'}
      detail={s ? (
        <div className="k-ev-page">
          <DetailHead title={s.name} />
          <Group title="This Sequence">
            <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={s.name} onChange={x => put('name', x)} /></FieldRow>
            <ToggleRow label="Player Cannot Act While It Plays" help="On: the player's tank cannot move or shoot until it has ended. Esc and the menus still work. With no time typed below, it ends after 2 minutes at the latest." checked={!!s.lockInput} onChange={x => put('lockInput', x || undefined)} />
            <Reveal when={!!s.lockInput}>
              <SelectRow label="While The Player Is Held" help="Protect The Player: as after a spawn, nothing can hurt it and bots ignore it, while the match goes on. Bots Stop Too: it is protected, and every bot stands and holds its fire, but one this sequence orders to walk still walks. Nothing Special: bots can shoot it and it can die." value={s.whileHeld ?? 'protect'} options={[{ value: 'protect', label: 'Protect The Player' }, { value: 'botsStop', label: 'Bots Stop Too' }, { value: 'nothing', label: 'Nothing Special' }]} onChange={x => put('whileHeld', x === 'protect' ? undefined : x)} />
            </Reveal>
            <ToggleRow label="Player Can Skip It" help="On: Space ends it at once, and the screen says so while it plays. Every step left still happens, with no waiting. Only its messages and speech bubbles are left out." checked={!!s.skippable} onChange={x => put('skippable', x || undefined)} />
            <FieldRow label="Ends At The Latest After" help="It stops after this long, and the steps it has not reached never happen. Empty: it ends when its tracks end."><NumBox value={s.timeout} min={0} unit="s" onChange={x => put('timeout', x)} /></FieldRow>
          </Group>
          {s.tracks.map((t, ti) => (
            <Group key={t.id} title={t.name} foldKey={`track-${t.id}`} collapsible right={<IconButton size="sm" label="Remove this track" disabled={s.tracks.length < 2} onClick={() => ctx.commit(d => removeAt(d, ['sequences', i, 'tracks'], ti))}><Trash2 size={13} /></IconButton>}>
              <FieldRow stacked label="Name" help="Its name, for you. A track plays beside the other tracks."><TextField value={t.name} onChange={x => ctx.commit(d => setAt(d, ['sequences', i, 'tracks', ti, 'name'], x))} /></FieldRow>
              <div className="k-ev-list k-ev-rowlist">
                <LongList gap={0} estimate={46} className="k-ev-rows" count={t.clips.length} rowKey={ci => String(t.clips[ci].id)} renderRow={ci => <ClipCard clip={t.clips[ci]} path={['sequences', i, 'tracks', ti, 'clips', ci]} listPath={['sequences', i, 'tracks', ti, 'clips']} index={ci} ctx={ctx} />} />
                <EvSelect add="Add A Step" groups={groupsOfKinds('step')} onChange={k => ctx.commit(d => { const r = withIds(d, id => ({ id: id(), at: t.clips.length ? t.clips[t.clips.length - 1].at + 1 : 0, step: { id: id(), k, a: {} } })); _justAddedClip = r.value.id; return insertAt(r.doc, ['sequences', i, 'tracks', ti, 'clips'], -1, r.value); })} />
              </div>
            </Group>
          ))}
          <Button variant="secondary" block icon={<Plus size={13} />} onClick={() => ctx.commit(d => { const r = withIds(d, id => ({ id: id(), name: `Track ${s.tracks.length + 1}`, clips: [] })); return insertAt(r.doc, ['sequences', i, 'tracks'], -1, r.value); })}>Add A Track</Button>
        </div>
      ) : null}
    />
  );
};

export const MatchPage: React.FC<{ ctx: EvCtx }> = ({ ctx }) => {
  const m = ctx.doc?.match ?? {};
  const put = (k: string, v: unknown) => ctx.commit(d => setAt(d, ['match', k], v));
  const has = (k: 'ambientBosses' | 'ambientSentries' | 'ambientSentinels' | 'ambientCrashers' | 'food') => m[k] !== false;
  const swaps = m.treeSwaps ?? [], adds = m.treeAdds ?? [];
  return (
    <ScrollArea className="k-ev-scroll"><div className="k-ev-list-box k-ev-cols">
      <div className="k-ev-page">
        <Group title="What Comes By Itself">
          <ToggleRow label="This Mode's Bosses" help="The bosses this mode brings by itself. Off: only what a Map Event spawns." checked={has('ambientBosses')} onChange={v => put('ambientBosses', v ? undefined : false)} />
          <ToggleRow label="This Mode's Sentries" help="The sentries this mode brings by itself. Off: only what a Map Event spawns." checked={has('ambientSentries')} onChange={v => put('ambientSentries', v ? undefined : false)} />
          <ToggleRow label="This Mode's Sentinels" help="The sentinels this mode brings by itself. Off: only what a Map Event spawns." checked={has('ambientSentinels')} onChange={v => put('ambientSentinels', v ? undefined : false)} />
          <ToggleRow label="This Mode's Crashers" help="The crashers this mode brings by itself. Off: only what a Map Event spawns." checked={has('ambientCrashers')} onChange={v => put('ambientCrashers', v ? undefined : false)} />
          <ToggleRow label="Food Shapes" help="The shapes that appear by themselves. Off: none." checked={has('food')} onChange={v => put('food', v ? undefined : false)} />
          <Reveal when={has('food')}><FieldRow stacked label="Shapes Appear Only In" help="A Custom Area, the box round it. None: all over the map."><RefField of="area" optional value={m.foodIn} ctx={ctx} onChange={v => put('foodIn', v)} /></FieldRow></Reveal>
          <SelectRow label="Team Bots" help="As The Mode Says: the team bots this mode brings. None: no team bots." value={m.teamBots ?? 'mode'} options={[{ value: 'mode', label: 'As The Mode Says' }, { value: 'off', label: 'None' }]} onChange={v => put('teamBots', v === 'mode' ? undefined : v)} />
        </Group>
        <Group title="Score">
          <ToggleRow label="A Kill Pays Its Whole Score" help="On: a kill pays the whole score of what it killed. Off: the usual share." checked={!!m.fullScoreOnKills} onChange={v => put('fullScoreOnKills', v || undefined)} />
          <ToggleRow label="Healers Score By Healing" help="On: healing a friend pays score to a healer." checked={!!m.healersScoreByHealing} onChange={v => put('healersScoreByHealing', v || undefined)} />
          <SelectRow label="Which Kills Pay" help="Only Risen Tanks: killing a tank pays nothing, killing one a Copy Of A Tank made (a zombie, a follower) pays as usual." value={m.killsPay ?? 'all'} options={[{ value: 'all', label: 'Every Kill' }, { value: 'risen', label: 'Only Risen Tanks' }]} onChange={v => put('killsPay', v === 'all' ? undefined : v)} />
        </Group>
      </div>
      <div className="k-ev-page">
        <Group title="Room And Respawn">
          <FieldRow label="Max Tanks Alive" help="Bodies past this wait for room and none is lost. Shapes never count."><NumBox value={m.maxTanksAlive} min={1} max={600} placeholder="The Mode's" onChange={v => put('maxTanksAlive', v)} /></FieldRow>
          <FieldRow label="Room Kept For What Holds The Wave" help="The share of Max Tanks Alive that only what holds the next wave may take, so the rest cannot crowd it out."><NumBox value={m.holderShare ?? 60} min={0} max={100} unit="%" onChange={v => put('holderShare', v)} /></FieldRow>
          <ToggleRow label="Every Tank Shares The Room" help="On: Max Tanks Alive counts every tank alike: the mode's own bots, the tanks Map Events make and the player. A bot of the mode comes in only while there is room, and a tank that dies keeps its place for what rises from it. The player can always come back. Off: the mode's bots keep their places and the player counts nowhere." checked={!!m.shareRoom} onChange={v => put('shareRoom', v || undefined)} />
          <SelectRow label="Respawn" help="Only At Spawn Places: when no Player Spawn Place of a side stands, nobody of that side comes back." value={m.respawn ?? 'mode'} options={[{ value: 'mode', label: 'As The Mode Says' }, { value: 'spawnPlacesOnly', label: 'Only At Spawn Places' }]} onChange={v => put('respawn', v === 'mode' ? undefined : v)} />
          <ToggleRow label="A Kill Turns The Victim's Side" help="On: a tank killed by a tank of another side comes back on the killer's side, the player too." checked={!!m.killsTurnSides} onChange={v => put('killsTurnSides', v || undefined)} />
          <ToggleRow label="Clans" help="On: the bots form clans with a tag each, new ones form and old ones die out. A tank fights for its clan and comes back next to one of it. The player joins the clan whose tag his name carries." checked={!!m.clans} onChange={v => put('clans', v ? { min: 2, max: 5 } : undefined)} />
          <Reveal when={!!m.clans}>{() => <div className="k-grid-2">
            <FieldRow label="Fewest Clans" help="The fewest clans a match starts with."><NumBox value={m.clans!.min} min={1} max={m.clans!.max} onChange={v => put('clans', { ...m.clans!, min: v ?? 2 })} /></FieldRow>
            <FieldRow label="Most Clans" help="Never more clans than this at once."><NumBox value={m.clans!.max} min={m.clans!.min} max={8} onChange={v => put('clans', { ...m.clans!, max: v ?? 5 })} /></FieldRow>
          </div>}</Reveal>
          <ToggleRow label="A Set Number Of Tanks At First" help="On: the match holds this many tanks the first time it is visited, whatever the mode would bring." checked={!!m.travellers} onChange={v => put('travellers', v ? { min: 5, max: 15 } : undefined)} />
          <Reveal when={!!m.travellers}>{() => <div className="k-grid-2">
            <FieldRow label="Fewest Tanks" help="The fewest tanks it holds at first."><NumBox value={m.travellers!.min} min={0} max={m.travellers!.max} onChange={v => put('travellers', { ...m.travellers!, min: v ?? 0 })} /></FieldRow>
            <FieldRow label="Most Tanks" help="The most tanks it holds at first."><NumBox value={m.travellers!.max} min={m.travellers!.min} max={120} onChange={v => put('travellers', { ...m.travellers!, max: v ?? 0 })} /></FieldRow>
          </div>}</Reveal>
          <ToggleRow label="Peaceful" help="On: no tank can hurt or aim at another, whatever its side, the player too. The bases hurt nobody." checked={!!m.peaceful} onChange={v => put('peaceful', v || undefined)} />
          <ToggleRow label="Starts As If Time Had Passed" help="On: the match starts as if it had been open for a while: the tanks are spread out and many have grown." checked={!!m.startAged} onChange={v => put('startAged', v ? 5 : undefined)} />
          <Reveal when={!!m.startAged}>{() => <FieldRow label="Minutes Already Passed" help="How long the match has been open when it starts."><NumBox value={m.startAged!} min={1} max={60} unit="min" onChange={v => put('startAged', v ?? 5)} /></FieldRow>}</Reveal>
        </Group>
        <Group title="The Arena">
          <ToggleRow label="The Arena Closes In" help="On: after a while the playable square closes in slowly. Outside it the edge of the map pushes every tank in, and nothing is born there." checked={!!m.shrink} onChange={v => put('shrink', v ? { after: 120, minutes: 5, to: 40 } : undefined)} />
          <Reveal when={!!m.shrink}>{() => <div className="k-grid-2">
            <FieldRow label="Starts After" help="How long the match runs before it starts to close."><NumBox value={m.shrink!.after} min={0} unit="s" onChange={v => put('shrink', { ...m.shrink!, after: v ?? 0 })} /></FieldRow>
            <FieldRow label="Takes" help="How long it closes for."><NumBox value={m.shrink!.minutes} min={0.1} unit="min" onChange={v => put('shrink', { ...m.shrink!, minutes: v ?? 1 })} /></FieldRow>
            <FieldRow label="Closes To" help="The share of its side it keeps at the end."><NumBox value={m.shrink!.to} min={5} max={100} unit="%" onChange={v => put('shrink', { ...m.shrink!, to: v ?? 40 })} /></FieldRow>
          </div>}</Reveal>
          <FieldRow label="Dreadnoughts Among The Bots" help="The share of bots that come in as a Dreadnought. Empty: about 1 in 20 in a normal mode with Nexus Points, none elsewhere."><NumBox value={m.dreadnoughts} min={0} max={100} unit="%" placeholder="The Mode's" onChange={v => put('dreadnoughts', v)} /></FieldRow>
          <ToggleRow label="Every Tank Is A Dreadnought" help="On: the bots come in as Dreadnoughts, and the player becomes one when he arrives." checked={!!m.forge} onChange={v => put('forge', v || undefined)} />
          <ToggleRow label="Dreadnoughts Arrive On Set Tiers" help="On: a bot that comes in as a Dreadnought takes a random tier between these two and a random tank of it, never the plain Dreadnought. Off: any tier, 1 to 5." checked={!!m.dreadTiers} onChange={v => put('dreadTiers', v ? { min: 1, max: 5 } : undefined)} />
          <Reveal when={!!m.dreadTiers}>{() => <div className="k-grid-2">
            <FieldRow label="Lowest Tier" help="1 is the Egg tier, 5 the Hexagon tier."><NumBox value={m.dreadTiers!.min} min={1} max={m.dreadTiers!.max} onChange={v => put('dreadTiers', { ...m.dreadTiers!, min: v ?? 1 })} /></FieldRow>
            <FieldRow label="Highest Tier" help="1 is the Egg tier, 5 the Hexagon tier."><NumBox value={m.dreadTiers!.max} min={m.dreadTiers!.min} max={5} onChange={v => put('dreadTiers', { ...m.dreadTiers!, max: v ?? 5 })} /></FieldRow>
          </div>}</Reveal>
          <SelectRow label="Dreadnought Bots Upgrade" help="Every Tier At Once: a Dreadnought bot takes each tier as soon as its level opens it, picking at random. As Other Bots: as any bot. As The Mode Says: the V2 Dreadnoughts every tier at once, Old Dreadnoughts their own way." value={m.dreadsAlwaysUpgrade === undefined ? 'mode' : m.dreadsAlwaysUpgrade ? 'always' : 'bots'} options={[{ value: 'mode', label: 'As The Mode Says' }, { value: 'always', label: 'Every Tier At Once' }, { value: 'bots', label: 'As Other Bots' }]} onChange={v => put('dreadsAlwaysUpgrade', v === 'mode' ? undefined : v === 'always')} />
          <ToggleRow label="Same Team On Return" help="On: a player who comes back to this match through a black hole is on the team he had here. Off: on whichever team a new arrival gets." checked={m.sameTeamOnReturn !== false} onChange={v => put('sameTeamOnReturn', v ? undefined : false)} />
        </Group>
        <Group title="This Match's Upgrade Tree">
          <LongList estimate={190} count={swaps.length + adds.length} rowKey={n => (n < swaps.length ? String(n) : `a${n - swaps.length}`)} renderRow={n => {
            if (n < swaps.length) { const s = swaps[n], i = n; return (
              <div className="k-ev-group-row">
                <FieldRow stacked label="This Tank" help="The tank of the upgrade tree that changes."><TankField value={s.from} ctx={ctx} onChange={w => ctx.commit(d => setAt(d, ['match', 'treeSwaps', i, 'from'], w))} /></FieldRow>
                <FieldRow stacked label="Becomes" help="The tank that takes its place. Empty: it leaves the tree."><TankField value={s.to} title="Becomes Which Tank" ctx={ctx} onChange={w => ctx.commit(d => setAt(d, ['match', 'treeSwaps', i, 'to'], w))} /></FieldRow>
                <div className="k-ev-group-head">
                  <Button size="sm" variant="ghost" disabled={!s.to} onClick={() => ctx.commit(d => setAt(d, ['match', 'treeSwaps', i, 'to'], undefined))}>Just Remove It</Button>
                  <IconButton size="sm" label="Remove" onClick={() => ctx.commit(d => removeAt(d, ['match', 'treeSwaps'], i))}><Trash2 size={13} /></IconButton>
                </div>
              </div>
            ); }
            const i = n - swaps.length, a = adds[i];
            return (
              <div className="k-ev-group-row">
                <FieldRow stacked label="Under This Tank" help="The tank these open up from."><TankField value={a.parent} ctx={ctx} onChange={w => ctx.commit(d => setAt(d, ['match', 'treeAdds', i, 'parent'], w))} /></FieldRow>
                <FieldRow label="Tier" help="The tier of the upgrade tree they stand on."><NumBox value={a.tier} min={0} max={10} onChange={v => ctx.commit(d => setAt(d, ['match', 'treeAdds', i, 'tier'], v ?? 0))} /></FieldRow>
                <Reveal when={a.tanks.length > 0}><TakeOffTags items={a.tanks.map(t => ({ key: t, label: shownNameOfWord(ctx.logic.state.tankLibrary, t, false) || t }))} onRemove={t => ctx.commit(d => setAt(d, ['match', 'treeAdds', i, 'tanks'], a.tanks.filter(x => x !== t)))} /></Reveal>
                <TankField value={undefined} add title="Add A Tank" ctx={ctx} onChange={w => ctx.commit(d => setAt(d, ['match', 'treeAdds', i, 'tanks'], [...a.tanks, w]))} />
                <div className="k-ev-group-head"><span /><IconButton size="sm" label="Remove" onClick={() => ctx.commit(d => removeAt(d, ['match', 'treeAdds'], i))}><Trash2 size={13} /></IconButton></div>
              </div>
            );
          }} />
          <div className="k-grid-2">
            <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => put('treeSwaps', [...(m.treeSwaps ?? []), { from: 'basic' }])}>Change One</Button>
            <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => put('treeAdds', [...(m.treeAdds ?? []), { parent: 'basic', tier: 2, tanks: [] }])}>Add To One</Button>
          </div>
        </Group>
      </div>
    </div></ScrollArea>
  );
};

export function pageOfProblem(doc: MapEventsDoc | undefined, zones: readonly ZoneLike[], id: number): { page: string; focus: number } | null {
  if (!doc && zones.length === 0) return null;
  const inList = (list: readonly { id: number }[] | undefined) => !!list?.some(x => x.id === id);
  const deep = (v: unknown, depth = 0): boolean => {
    if (depth > 64 || v === null || typeof v !== 'object') return false;
    if (Array.isArray(v)) return v.some(x => deep(x, depth + 1));
    const o = v as Record<string, unknown>;
    if (o.id === id && typeof o.n !== 'string') return true;
    return Object.keys(o).some(k => deep(o[k], depth + 1));
  };
  const some = (list: readonly unknown[]): boolean => (SMALL_FIX.G733 !== 0 ? list.some(x => deep(x)) : list.some(deep as (x: unknown, i: number) => boolean));
  if (doc) {
    if (inList(doc.rules) || some(doc.rules ?? [])) { const r = (doc.rules ?? []).find(x => x.id === id || deep(x)); return { page: 'events', focus: r!.id }; }
    if (inList(doc.types) || some(doc.types ?? [])) { const t = (doc.types ?? []).find(x => x.id === id || deep(x)); return { page: 'types', focus: t!.id }; }
    if (inList(doc.plans) || some(doc.plans ?? [])) { const t = (doc.plans ?? []).find(x => x.id === id || deep(x)); return { page: 'waves', focus: t!.id }; }
    if (inList(doc.placed)) return { page: 'entities', focus: id };
    if (inList(doc.statuses) || some(doc.statuses ?? [])) return { page: 'statuses', focus: id };
    if (inList(doc.areaGroups)) return { page: 'areas', focus: id };
  }
  const z = zones.find(x => x.uid === id || some(x.behaviors ?? []));
  return z ? { page: 'areas', focus: z.id } : null;
}

export const ProblemsPage: React.FC<{ ctx: EvCtx; problems: readonly (Problem | Lint)[]; go: (page: string, focus?: number) => void; stale?: boolean }> = ({ ctx, problems, go, stale }) => {
  const wheres = useMemo(() => new Map<number, ReturnType<typeof pageOfProblem>>(), [ctx.doc, ctx.zones]);
  const whereOf = (id: number) => { if (!wheres.has(id)) wheres.set(id, pageOfProblem(ctx.doc, ctx.zones, id)); return wheres.get(id)!; };
  return (
  <PageSwap>
    {problems.length === 0 ? <div key="empty" className="k-ev-whole"><EvEmpty icon={MevProblems} name="No Problems" hints={[{ label: 'Everything Here Will Run As Written' }]} /></div> : (
  <ScrollArea key="full" className="k-ev-scroll"><div className="k-ev-list-box">
    <LongList gap={6} estimate={46} count={problems.length} rowKey={i => `${problems[i].code}${problems[i].id}${i}`} renderRow={i => {
        const p = problems[i];
        const where = whereOf(p.id);
        return (
          <div className="k-ev-problem">
            <MevProblems size={15} />
            <span className={p.warn ? 'k-ev-problem-soft' : 'k-ev-problem-hard'}>{p.text}</span>
            {where && <Button size="sm" variant="ghost" onClick={() => go(where.page, where.focus)}>Show It</Button>} { }
            {'fix' in p && p.fix && <Button size="sm" variant="secondary" disabled={SMALL_FIX.G721 !== 0 && stale === true} onClick={() => { const f = (p as Lint).fix!; ctx.commit(d => f.apply(d!)); }}>{p.fix.label}</Button>} { }
          </div>
        );
      }} />
  </div></ScrollArea>
    )}
  </PageSwap>
  );
};
void Skull;
