import React, { useMemo, useRef, useState } from 'react';
import type { Num, Ref, SpawnGroup, WaveCell, WaveOverride, WavePlan, ZoneLike } from '../../game/mapEvents/doc';
import { rectsOf, SIDE_WORDS, zoneShapeOf } from '../../game/mapEvents/doc';
import { tracePoly, shapeCellPoints } from '../../game/areaShape';
import { previewMeans, breakSeconds, rollWave, type WaveRoll } from '../../game/mapEvents/waves';
import { priceOfLine, ROUNDS_HEAVY } from '../../game/mapEvents/priceTank';
import { evalNum } from '../../game/mapEvents/num';
import { addGroup, copyForPaste, fillDown, pasteLine, ramp, removeAt, sentenceOf, setAt, tagWords, typeCell, withIds, wordOfCards, type Path } from '../../game/mapEvents/docOps';
import { Button, Chip, FieldRow, Group, IconButton, PickRow, SelectRow, Tabs, TextField, ToggleRow } from '../kit/kit';
import { Fade, PageSwap, Reveal } from '../kit/Collapse';
import { LongList, useRowWindow } from '../kit/LongList';
import { ScrollArea } from '../ui/ScrollArea';
import { EvEmpty } from './EvEmpty';
import { NumberBox } from '../kit/NumberBox';
import { EvSelect } from './EvSelect';
import { closeMapEvents, runEngineTest } from './mapEventsStore';
import { BodyTestField, CardsField, choicesOf, Facts, factsFrom, FieldControl, NumField, OrderField, PlaceRuleField, RefField, TakeOffTags, thingNamer, WaveTestField, wordOfNum, type EvCtx } from './fields';
import { Plus, Trash2, Copy, ChevronRight, MevEvents, MevProblems, MevWaves } from '../ui/icons';
import { Split, DetailHead } from './pages';

const num = (s: string): number | undefined => { const v = Number(s); return s.trim() !== '' && Number.isFinite(v) ? v : undefined; };
type Tab = 'every' | 'grid' | 'special' | 'exact' | 'timing' | 'actions' | 'where' | 'preview';

export function readsAs(g: SpawnGroup): string {
  const who = g.cards.length === 1 ? (g.cards[0].type?.n ?? g.cards[0].tank ?? g.cards[0].shape ?? 'nothing') : `${g.cards.length} kinds`;
  const test = g.test ? (g.test.from ? ` from wave ${g.test.from}` : '') + (g.test.to ? ` to wave ${g.test.to}` : '') + (g.test.every ? ` every ${g.test.every}` : '') : '';
  const at = g.at === 'plan' ? 'any area of this plan' : g.at.map(a => a.n).join(', ');
  return `In every wave${test}, ${wordOfNum(g.count)} of ${who}, in ${at || 'no place'}${g.blocks === false ? '.' : ', and they must die before the next wave.'}`;
}

export function lineFacts(g: SpawnGroup, thing: (word: string) => string): string[] {
  const test = g.test ? (g.test.list?.length ? `Waves ${g.test.list.join(', ')}` : [g.test.from ? `From Wave ${g.test.from}` : '', g.test.to ? `To Wave ${g.test.to}` : '', g.test.every ? `Every ${g.test.every}` : ''].filter(Boolean).join(', ')) : '';
  const at = g.at === 'plan' ? 'Any Area Of This Plan' : g.at.length === 0 ? 'No Place' : g.at.map(a => a.n).join(', ');
  return [test || 'Every Wave', tagWords(wordOfNum(g.count)), wordOfCards(g.cards, thing), at, g.blocks === false ? '' : 'Holds The Next Wave', g.off ? 'Off' : ''];
}

const SpawnAt: React.FC<{ value: Ref[] | 'plan'; onChange: (v: Ref[] | 'plan') => void; ctx: EvCtx }> = ({ value, onChange, ctx }) => {
  const all = [...choicesOf('area', ctx), ...choicesOf('group', ctx)];
  const list = value === 'plan' ? [] : value;
  return (
    <div className="k-ev-stack">
      <Reveal when={value === 'plan' || list.length > 0}><TakeOffTags items={value === 'plan' ? [{ key: 'plan', label: 'Every Area Of This Plan' }] : list.map(r => ({ key: String(r.id), label: r.n }))} onRemove={k => onChange(k === 'plan' ? [] : list.filter(x => String(x.id) !== k))} /></Reveal>
      <EvSelect add="Add A Place" options={[{ value: 'plan', label: 'Every Area Of This Plan' }, ...all.filter(a => !list.some(r => r.id === a.id)).map(a => ({ value: String(a.id), label: a.name }))]}
        onChange={v => { if (v === 'plan') { onChange('plan'); return; } const hit = all.find(a => String(a.id) === v); if (hit) onChange([...list, { id: hit.id, n: hit.name }]); }} />
    </div>
  );
};

const LineDetail: React.FC<{ g: SpawnGroup; path: Path; ctx: EvCtx }> = ({ g, path, ctx }) => {
  const put = (k: string, v: unknown) => ctx.commit(d => setAt(d, [...path, k], v));
  const yesNo = [{ value: '', label: 'As Its Type' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  return (
    <div className="k-ev-page">
      <DetailHead title={g.name} />
      <Group title="This Line">
        <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={g.name} onChange={v => put('name', v)} /></FieldRow>
        <Facts items={factsFrom(lineFacts(g, thingNamer(ctx)))} />
        <FieldRow label="How Many" help="How many of this line come in a wave. It can grow with the wave."><NumField value={g.count} onChange={v => put('count', v)} /></FieldRow>
        <FieldRow label="Random, More Or Less" help="0.2: up to a fifth more or less."><NumberBox className="k-field k-ev-num" value={g.spread ?? 0} step={0.05} min={0} max={1} onChange={e => put('spread', num(e.target.value) ?? 0)} /></FieldRow>
        <SelectRow label="Rounding" help="How a count like 2.5 becomes whole: by chance 2 or 3, down to 2, or to the nearest." value={g.round ?? 'chance'} onChange={v => put('round', v)} options={[{ value: 'chance', label: 'By Chance' }, { value: 'floor', label: 'Down' }, { value: 'nearest', label: 'Nearest' }]} />
        <ToggleRow label="Holds The Next Wave" help="On: the next wave waits until these are gone. Off: they do not count." checked={g.blocks !== false} onChange={v => put('blocks', v)} />
        <ToggleRow label="On" help="Off: this line brings nothing." checked={!g.off} onChange={v => put('off', v ? undefined : true)} />
      </Group>
      <Group title="Spawn At"><SpawnAt value={g.at} onChange={v => put('at', v)} ctx={ctx} /></Group>
      <Group title="What" count={g.cards.length}><CardsField value={g.cards} path={[...path, 'cards']} ctx={ctx} /></Group>
      <Group title="Which Waves" foldKey="line-waves" collapsible defaultOpen={false}>
        <WaveTestField value={g.test} onChange={v => put('test', v)} />
        <FieldRow label="Its Own Chance In A Wave" help="How often this line comes at all."><NumField value={g.chance ?? 100} unit="%" onChange={v => put('chance', v)} /></FieldRow>
        <SelectRow label="Places" help="With several places: the count shared among them, or this many in each." value={g.split ?? 'shared'} onChange={v => put('split', v)} options={[{ value: 'shared', label: 'Shared Among The Places' }, { value: 'each', label: 'This Many In Each Place' }]} />
        <SelectRow label="How They Come" help="As The Plan Says, spread evenly over a time, or all at once." value={g.pace?.how ?? ''} onChange={v => put('pace', v ? { ...g.pace, how: v } : undefined)} options={[{ value: '', label: 'As The Plan Says' }, { value: 'even', label: 'Evenly' }, { value: 'burst', label: 'All At Once' }]} />
        <Reveal when={g.pace}>{() => (<>
          <FieldRow label="Over" help="How long they take to come."><NumField value={g.pace!.seconds ?? 0} unit="s" onChange={v => put('pace', { ...g.pace, seconds: v })} /></FieldRow>
          <FieldRow label="From" help="How long into the wave the first one comes."><NumField value={g.pace!.startAt ?? 0} unit="s" onChange={v => put('pace', { ...g.pace, startAt: v })} /></FieldRow>
        </>)}</Reveal>
      </Group>
      <Group title="Placement" foldKey="line-place" collapsible defaultOpen={false}><PlaceRuleField value={g.place} ctx={ctx} onChange={v => put('place', v)} /></Group>
      <Group title="What They Are" foldKey="line-body" collapsible defaultOpen={false}>
        <SelectRow label="Side" help="The side they fight for." value={g.side?.team ?? ''} onChange={v => put('side', v ? { team: v, camp: g.side?.camp } : undefined)} options={[{ value: '', label: 'The Plan\'s' }, ...SIDE_WORDS.map(s => ({ value: s.word, label: s.shown }))]} />
        <SelectRow label="Mind" help="Thinks For Itself: as any bot. Follows Its Order: walks by How They Move and shoots what it sees. None: it does nothing." value={g.body?.brain ?? ''} onChange={v => put('body', { ...g.body, brain: v || undefined })} options={[{ value: '', label: 'Thinks For Itself' }, { value: 'order', label: 'Follows Its Order' }, { value: 'none', label: 'None' }]} />
        <FieldRow stacked label="How They Move" help="A walking order. Stands Where It Is: none."><OrderField value={g.body?.order} path={[...path, 'body', 'order']} ctx={ctx} /></FieldRow>
        <ToggleRow label="Counts As A Boss" help="In kill counts and in how others decide to hunt it." checked={!!g.body?.bossTier} onChange={v => put('body', { ...g.body, bossTier: v || undefined })} />
        <FieldRow label="Score" help="The score it carries. Empty: its file's."><NumberBox className="k-field k-ev-num" value={g.body?.score ?? ''} min={0} onChange={e => put('body', { ...g.body, score: num(e.target.value) })} /></FieldRow>
        <SelectRow label="Worth" help="What its killer gets: its score, or nothing." value={g.body?.worth ?? 'score'} onChange={v => put('body', { ...g.body, worth: v })} options={[{ value: 'score', label: 'Its Score' }, { value: 'none', label: 'Nothing' }]} />
        <FieldRow label="Sight" help="How far it sees, in world units. Empty: its file's."><NumberBox className="k-field k-ev-num" value={g.body?.sight ?? ''} min={0} onChange={e => put('body', { ...g.body, sight: num(e.target.value) })} /></FieldRow>
        <FieldRow stacked label="Kill Line" help="The line its killer reads."><TextField value={g.body?.killLine ?? ''} onChange={v => put('body', { ...g.body, killLine: v || undefined })} /></FieldRow>
        <SelectRow label="Show Name" help="Its name, drawn over it in a match." value={g.showName === undefined ? '' : g.showName ? 'yes' : 'no'} onChange={v => put('showName', v === '' ? undefined : v === 'yes')} options={yesNo} />
        <SelectRow label="On Leaderboard" help="Whether it stands on the leaderboard." value={g.body?.onLeaderboard === undefined ? '' : g.body.onLeaderboard ? 'yes' : 'no'} onChange={v => put('body', { ...g.body, onLeaderboard: v === '' ? undefined : v === 'yes' })} options={yesNo} />
        <SelectRow label="On Minimap" help="Whether it shows on the minimap." value={g.body?.onMinimap === undefined ? '' : g.body.onMinimap ? 'yes' : 'no'} onChange={v => put('body', { ...g.body, onMinimap: v === '' ? undefined : v === 'yes' })} options={yesNo} />
        <FieldRow stacked label="Tags" help="The tags they count under. A wave, a walking order or a count can use them."><FieldControl field={{ t: 'refs', of: 'tag' }} value={g.tags} path={[...path, 'tags']} ctx={ctx} onChange={v => put('tags', v)} /></FieldRow>
        <FieldRow stacked label="Note" help="A note for yourself. It changes nothing in play."><TextField value={g.note ?? ''} onChange={v => put('note', v || undefined)} /></FieldRow>
      </Group>
    </div>
  );
};

let _copiedLine: SpawnGroup | null = null;
const lineSays = (g: SpawnGroup, q: string): boolean => g.name.toLowerCase().includes(q) || g.cards.some(c => (c.tank ?? c.shape ?? c.type?.n ?? '').toLowerCase().includes(q));
interface LinePick { path: Path; id: number }
const LinesTable: React.FC<{ groups: SpawnGroup[]; path: Path; ctx: EvCtx; firstPlace?: Ref[] | 'plan'; search?: string; picked?: number | null; onPick?: (p: LinePick) => void }> = ({ groups, path, ctx, search = '', picked = null, onPick }) => {
  const [, bump] = useState(0);
  const q = search.trim().toLowerCase();
  const shown: number[] = [];
  groups.forEach((g, i) => { if (q === '' || lineSays(g, q)) shown.push(i); });
  return (
    <div className="k-ev-list">
      <LongList gap={6} estimate={68} reveal={picked !== null ? String(picked) : null} count={shown.length} rowKey={n => String(groups[shown[n]].id)} renderRow={n => { const i = shown[n], g = groups[i]; return (
          <PickRow title={g.name} facts={factsFrom(lineFacts(g, thingNamer(ctx)))} selected={picked === g.id} onPick={() => onPick?.({ path: [...path, i], id: g.id })}
            actions={<>
              <IconButton size="sm" label="Copy this line" onClick={() => { _copiedLine = copyForPaste(g, ctx.doc, ctx.zones); bump(n2 => n2 + 1); }}><Copy size={13} /></IconButton>
              <IconButton size="sm" label="Remove this line" onClick={() => ctx.commit(d => removeAt(d, path, i))}><Trash2 size={13} /></IconButton>
            </>} />
        ); }} />
      <div className="k-grid-2">
        <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => { ctx.commit(d => addGroup(d!, path, `Line ${groups.length + 1}`, [], 1, 'plan').doc); }}>Add A Line</Button>
        <Button size="sm" variant="ghost" disabled={_copiedLine === null} onClick={() => { const c = _copiedLine; if (c) ctx.commit(d => pasteLine(d!, ctx.zones, path, c)); }}>Paste A Line</Button>
      </div>
    </div>
  );
};

const WaveGrid: React.FC<{ plan: WavePlan; pi: number; ctx: EvCtx }> = ({ plan, pi, ctx }) => {
  const [from, setFrom] = useState(1);
  const waves = Array.from({ length: 12 }, (_, i) => from + i);
  const cells = plan.cells ?? [];
  const typedCells = useMemo(() => { const m = new Map<string, WaveCell>(); for (const c of cells) m.set(`${c.g}:${c.w}`, c); return m; }, [cells]);
  const shown = (g: SpawnGroup, w: number): number => { const v = evalNum(g.count, w); return Number.isFinite(v) ? v : 0; };
  const write = (g: SpawnGroup, w: number, raw: string) => ctx.commit(d => typeCell(d!, pi, g.id, w, raw));
  const win = useRowWindow(plan.groups.length, i => String(plan.groups[i].id), 31);
  return (
    <div className="k-ev-whole">
      <div className="k-ev-inline k-ev-grid-top">
        <Button size="sm" variant="secondary" disabled={from <= 1} onClick={() => setFrom(f => Math.max(1, f - 12))}>Earlier Waves</Button>
        <Button size="sm" variant="secondary" onClick={() => setFrom(f => f + 12)}>Later Waves</Button>
      </div>
      <div className="k-ev-grid-wrap popup-scrollbar">
      <table className="k-ev-grid">
        <thead><tr><th>Line</th>{waves.map(w => <th key={w}>{w}</th>)}</tr></thead>
        <tbody ref={el => { win.box.current = el; win.rows.current = el; }}>
          {win.above > 0 ? <tr key="above" aria-hidden="true"><td colSpan={13} style={{ height: win.above, padding: 0, border: 0 }} /></tr> : null}
          {plan.groups.slice(win.a, win.b).map(g => (
            <tr key={g.id} data-ll={String(g.id)}>
              <td className="k-ev-grid-name">{g.name}</td>
              {waves.map(w => {
                const t = typedCells.get(`${g.id}:${w}`);
                return <td key={w}><input className={t ? 'k-ev-cell k-ev-cell-typed' : 'k-ev-cell'} aria-label={`${g.name}, wave ${w}`} value={t ? t.n : Math.round(shown(g, w) * 100) / 100} inputMode="decimal" onChange={e => write(g, w, e.target.value)} /></td>;
              })}
            </tr>
          ))}
          {win.below > 0 ? <tr key="below" aria-hidden="true"><td colSpan={13} style={{ height: win.below, padding: 0, border: 0 }} /></tr> : null}
        </tbody>
      </table>
      </div>
    </div>
  );
};

const Preview: React.FC<{ plan: WavePlan; ctx: EvCtx }> = ({ plan, ctx }) => {
  const [wave, setWave] = useState(25);
  const [roll, setRoll] = useState<WaveRoll | null>(null);
  const [seed, setSeed] = useState(1);
  const [ten, setTen] = useState<number[] | null>(null);
  const means = useMemo(() => previewMeans(plan, wave, 40, seed), [plan, wave, seed]);
  const room = ctx.doc?.match?.maxTanksAlive ?? ctx.logic.state.gameModeConfig.maxTanksAlive ?? 50;
  const box = useRef<HTMLCanvasElement>(null);
  const series = useMemo(() => {
    const out: number[] = [];
    for (let w = 1; w <= 150; w += 3) { const m = previewMeans(plan, w, 6, seed); out.push(m.filter(x => x.holds).reduce((s, x) => s + x.mean, 0)); }
    return out;
  }, [plan, seed]);
  React.useLayoutEffect(() => {
    const c = box.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    const W = c.width, H = c.height, top = Math.max(room, ...series, 1);
    g.clearRect(0, 0, W, H);
    const css = getComputedStyle(c);
    g.strokeStyle = css.getPropertyValue('--text-tertiary') || 'gray';
    g.beginPath(); g.moveTo(0, H - room / top * H); g.lineTo(W, H - room / top * H); g.stroke();
    g.strokeStyle = css.getPropertyValue('--text-primary') || 'gray';
    g.beginPath(); series.forEach((v, i) => { const x = i / (series.length - 1) * W, y = H - v / top * H; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }); g.stroke();
  }, [series, room]);
  const over = series.findIndex(v => v > room);
  const lineOf = (name: string): SpawnGroup | undefined => plan.groups.find(g => g.name === name) ?? (plan.specials ?? []).flatMap(s => s.groups).find(g => g.name === name) ?? (plan.overrides ?? []).flatMap(o => o.groups).find(g => g.name === name);
  const priced = useMemo(() => means.map(m => { const p = priceOfLine(lineOf(m.name), ctx.doc, ctx.logic.state.tankLibrary); return { ...m, rounds: m.mean * p.rounds, shapes: m.mean * p.shapes }; }), [means, ctx.doc, ctx.logic.state.tankLibrary]);
  const sumOf = priced.reduce((s, m) => ({ bodies: s.bodies + m.mean, shapes: s.shapes + m.shapes, rounds: s.rounds + m.rounds }), { bodies: 0, shapes: 0, rounds: 0 });
  return (
    <div className="k-ev-page">
      <Group title="One Wave">
        <FieldRow label="Wave" help="The wave these numbers are for."><NumberBox className="k-field k-ev-num" value={wave} min={1} onChange={e => setWave(Math.max(1, num(e.target.value) ?? 1))} /></FieldRow>
        <div className="k-ev-inline">
          <Button size="sm" variant="secondary" onClick={() => setRoll(rollWave(plan, wave, seed))}>Roll This Wave</Button>
          <Button size="sm" variant="secondary" onClick={() => { const all = []; for (let k = 0; k < 10; k++) all.push(rollWave(plan, wave, seed + k).total); setTen(all); }}>Roll 10 Times</Button>
          <Button size="sm" variant="ghost" onClick={() => setSeed(s => s + 1)}>Another Roll</Button>
          <Button size="sm" variant="ghost" title="Plays a match from this wave. Nothing is written to the map." onClick={() => { ctx.logic.mevTestStart = { planId: plan.id, wave }; closeMapEvents(); runEngineTest(); }}>Test This Wave</Button>
        </div>
        <Reveal when={ten}>{() => <FieldRow stacked label="Ten Rolls Of This Wave" help="How many bodies each of ten rolls brought."><Facts items={ten!.map((n, k) => ({ key: String(k), text: String(n) }))} /></FieldRow>}</Reveal>
        <table className="k-ev-preview"><thead><tr><th>Line</th><th>About</th><th>Holds</th><th title="About how many rounds these keep in the air, by their tank files">Rounds</th></tr></thead>
          <tbody>{priced.map(m => <tr key={m.name}><td>{m.name}</td><td>{m.mean.toFixed(1)}</td><td>{m.holds ? 'Yes' : 'No'}</td><td>{Math.round(m.rounds)}</td></tr>)}</tbody></table>
        <FieldRow stacked label="All Of Them At Once" help="About how much stands at the same time, with nothing else alive and no limit of room."><Facts items={factsFrom([`${Math.round(sumOf.bodies - sumOf.shapes)} Tanks`, `${Math.round(sumOf.shapes)} Shapes`, `${Math.round(sumOf.rounds)} Rounds In The Air`])} /></FieldRow>
        <Reveal when={sumOf.rounds > ROUNDS_HEAVY}><div className="k-note"><MevProblems size={14} />That many rounds may slow the game down on many computers.</div></Reveal>
        <Reveal when={roll}>{() => <FieldRow stacked label="This Roll" help="What one roll of this wave brought."><Facts items={factsFrom([roll!.special ? `Special: ${roll!.special.name}` : '', ...roll!.streams.map(l => `${l.group.name}: ${l.k}`)])} /></FieldRow>}</Reveal>
      </Group>
      <Group title="Bodies That Hold The Wave, Waves 1 To 150">
        <canvas ref={box} width={720} height={150} className="k-ev-chart" />
        <Facts items={factsFrom([`Flat Line: Max Tanks Alive ${room}`, over >= 0 ? `Past It From About Wave ${over * 3 + 1}` : 'No Wave Goes Past It'])} />
        <Reveal when={over >= 0}><div className="k-ev-note">Past the flat line a wave's bodies wait for room and none is lost.</div></Reveal>
      </Group>
    </div>
  );
};

const WaveActions: React.FC<{ plan: WavePlan; ctx: EvCtx }> = ({ plan, ctx }) => {
  const rules = (ctx.doc?.rules ?? []).filter(r => r.when.some(w => w.k.startsWith('wave.') || w.k === 'plan.finished') && r.when.some(w => { const q = w.a.plan as Ref | undefined; return !q || q.id === plan.id; }));
  if (rules.length === 0) return <div className="k-ev-whole"><EvEmpty icon={MevEvents} name="No Map Event starts from this plan" hints={[{ label: 'Make One On The Map Events Page, From A Wave Starts' }]} /></div>;
  return (
    <ScrollArea className="k-ev-scroll"><div className="k-ev-list-box">
      <LongList gap={6} estimate={68} count={rules.length} rowKey={i => String(rules[i].id)} renderRow={i => <PickRow title={rules[i].name} facts={factsFrom(rules[i].when.map(w => tagWords(sentenceOf('trigger', w, ctx.doc, ctx.zones))))} onPick={() => {}} />} />
    </div></ScrollArea>
  );
};

const WhereTheySpawn: React.FC<{ plan: WavePlan; ctx: EvCtx }> = ({ plan, ctx }) => {
  const box = useRef<HTMLCanvasElement>(null);
  const zones = ctx.zones;
  const inPlan = (z: ZoneLike) => z.uid !== undefined && plan.groups.some(g => g.at === 'plan' ? (z.behaviors ?? []).some(b => b.k === 'spawn' && ((b.a.settings ?? b.a) as { mode?: string; plan?: Ref }).mode === 'waves' && (((b.a.settings ?? b.a) as { plan?: Ref }).plan?.id ?? plan.id) === plan.id)
    : g.at.some(r => r.id === z.uid || (ctx.doc?.areaGroups ?? []).some(ag => ag.id === r.id && ag.members.some(m => m.id === z.uid))));
  React.useLayoutEffect(() => {
    const c = box.current, st = ctx.logic.selectionStateOf(ctx.areaId);
    if (!c || !st) return;
    const g = c.getContext('2d'); if (!g) return;
    const W = c.width, H = c.height, s = Math.min(W / st.gridCells, H / st.gridCellsY);
    const css = getComputedStyle(c);
    const wall = css.getPropertyValue('--text-tertiary') || 'gray', on = css.getPropertyValue('--toggle-on') || 'gray';
    g.clearRect(0, 0, W, H);
    g.fillStyle = wall; g.globalAlpha = 0.35;
    for (let x = 0; x < st.gridCells; x++) for (let y = 0; y < st.gridCellsY; y++) if (st.wallGrid[x * st.gridCellsY + y] >= 0) g.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
    for (const z of zones) {
      const yes = inPlan(z);
      if (!yes) continue;
      g.globalAlpha = 0.6;
      g.fillStyle = on;
      const sh = zoneShapeOf(z);
      if (sh !== null) { g.beginPath(); tracePoly(g, shapeCellPoints(sh), 0, 0, s); g.fill(); }
      else for (const r of rectsOf(z)) g.fillRect(r.gx * s, r.gy * s, r.cw * s, r.ch * s);
    }
    g.globalAlpha = 1;
  }, [ctx.logic, ctx.areaId, zones, plan]);
  const names = zones.filter(inPlan).map(z => z.name ?? 'Custom Area');
  return (
    <div className="k-ev-page">
      <Group title="Where They Spawn" count={names.length}>
        <canvas ref={box} width={840} height={840} className="k-ev-map" />
        <div className="k-ev-chips">{names.map(n => <span key={n} className="k-chip">{n}</span>)}</div> { }
        <Reveal when={names.length === 0}><div className="k-ev-note">No area of this map spawns this plan yet: give an area the behaviour Spawn Entities, in Waves.</div></Reveal>
      </Group>
    </div>
  );
};

export const WaveEditor: React.FC<{ plan: WavePlan; pi: number; ctx: EvCtx; search?: string }> = ({ plan, pi, ctx, search = '' }) => {
  const [tab, setTab] = useState<Tab>('every');
  const [line, setLine] = useState<LinePick | null>(null);
  const put = (k: keyof WavePlan, v: unknown) => ctx.commit(d => setAt(d, ['plans', pi, k], v));
  const specialTotal = (plan.specials ?? []).reduce((s, x) => s + (x.off ? 0 : x.weight), 0);
  const chance = typeof plan.specialChance === 'number' ? plan.specialChance : 0;
  const endless = plan.last === null || plan.last === undefined;
  const firstLineOf = (): LinePick | null => {
    if (tab === 'every') return plan.groups[0] ? { path: ['plans', pi, 'groups', 0], id: plan.groups[0].id } : null;
    const list = tab === 'special' ? plan.specials : tab === 'exact' ? plan.overrides : undefined;
    const key = tab === 'special' ? 'specials' : 'overrides';
    const i = (list ?? []).findIndex(x => x.groups.length > 0);
    return i >= 0 ? { path: ['plans', pi, key, i, 'groups', 0], id: list![i].groups[0].id } : null;
  };
  const pickNow = line ?? firstLineOf();
  const shownLine = (): SpawnGroup | undefined => {
    if (!pickNow) return undefined;
    let v: unknown = ctx.doc;
    for (const k of pickNow.path) v = (v as Record<string | number, unknown> | undefined)?.[k];
    const g = v as SpawnGroup | undefined;
    return g && g.id === pickNow.id ? g : undefined;
  };
  const g = shownLine();
  const lineSide = g
    ? <LineDetail g={g} path={pickNow!.path} ctx={ctx} />
    : null;
  const addExact = () => ctx.commit(d => { const last = plan.overrides?.[plan.overrides.length - 1]?.test.list?.[0] ?? 0; const r = withIds(d, id => ({ id: id(), test: { list: [last + 1] }, mode: 'replace' as const, groups: [] })); return setAt(r.doc, ['plans', pi, 'overrides'], [...(plan.overrides ?? []), r.value]); });
  return (
    <div className="k-ev-whole">
      <div className="k-ev-tabbar">
        <Tabs<Tab> value={tab} onChange={t => { setTab(t); setLine(null); }} tabs={[{ value: 'every', label: 'Every Wave', count: plan.groups.length }, { value: 'grid', label: 'Wave By Wave' }, { value: 'special', label: 'Special Waves', count: plan.specials?.length ?? 0 }, { value: 'exact', label: 'Exact Waves', count: plan.overrides?.length ?? 0 }, { value: 'timing', label: 'Timing' }, { value: 'actions', label: 'Wave Actions' }, { value: 'where', label: 'Where They Spawn' }, { value: 'preview', label: 'Preview' }]} />
      </div>
      <PageSwap><div key={tab} className="k-ev-whole">
      {tab === 'every' ? <Split empty={plan.groups.length === 0 ? <EvEmpty icon={MevWaves} name="No Lines" hints={[{ label: 'Add A Line', onClick: () => ctx.commit(d => addGroup(d!, ['plans', pi, 'groups'], 'Line 1', [], 1, 'plan').doc) }]} /> : undefined} list={<LinesTable groups={plan.groups} path={['plans', pi, 'groups']} ctx={ctx} search={search} picked={pickNow?.id ?? null} onPick={setLine} />} detailKey={pickNow?.id ?? 'none'} detail={lineSide} />
      : tab === 'grid' ? <WaveGrid plan={plan} pi={pi} ctx={ctx} />
      : tab === 'special' ? <Split
          list={<div className="k-ev-page">
            <Group title="How Often">
              <FieldRow label="Chance Of One, Each Wave" help="How often a wave is a special one. A special wave replaces every line of that wave."><NumField value={plan.specialChance ?? 0} unit="%" onChange={v => put('specialChance', v)} /></FieldRow>
                          </Group>
            <LongList gap={12} estimate={420} reveal={null} count={plan.specials?.length ?? 0} rowKey={n => String(plan.specials![n].id)} renderRow={i => { const s = plan.specials![i]; return (
                <Group title={s.name} foldKey={`special-${s.id}`} collapsible count={s.groups.length} right={<IconButton size="sm" label="Remove this special wave" onClick={() => ctx.commit(d => removeAt(d, ['plans', pi, 'specials'], i))}><Trash2 size={13} /></IconButton>}>
                  <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={s.name} onChange={v => ctx.commit(d => setAt(d, ['plans', pi, 'specials', i, 'name'], v))} /></FieldRow>
                  <FieldRow label="Share" help="How likely this special wave is beside the others." note={specialTotal > 0 ? <Facts items={factsFrom([`${Math.round(s.weight / specialTotal * 100)}% Of Special Waves`, `${(s.weight / specialTotal * chance).toFixed(2)}% Of All Waves`])} /> : undefined}>
                    <NumberBox className="k-field k-ev-num" value={s.weight} step={0.1} min={0} onChange={e => ctx.commit(d => setAt(d, ['plans', pi, 'specials', i, 'weight'], num(e.target.value) ?? 0))} />
                  </FieldRow>
                  <FieldRow stacked label="Which Waves" help="Which waves this applies to."><WaveTestField value={s.test} onChange={v => ctx.commit(d => setAt(d, ['plans', pi, 'specials', i, 'test'], v))} /></FieldRow>
                  <LinesTable groups={s.groups} path={['plans', pi, 'specials', i, 'groups']} ctx={ctx} search={search} picked={pickNow?.id ?? null} onPick={setLine} />
                </Group>
              ); }} />
            <Button variant="secondary" block icon={<Plus size={13} />} onClick={() => ctx.commit(d => { const r = withIds(d, id => ({ id: id(), name: `Special ${(plan.specials?.length ?? 0) + 1}`, weight: 1, groups: [] })); return setAt(r.doc, ['plans', pi, 'specials'], [...(plan.specials ?? []), r.value]); })}>Add A Special Wave</Button>
          </div>}
          detailKey={pickNow?.id ?? 'none'} detail={lineSide} />
      : tab === 'exact' ? <Split
          empty={(plan.overrides?.length ?? 0) === 0 ? <EvEmpty icon={MevWaves} name="No Exact Waves" hints={[{ label: 'Add A Wave By Hand', onClick: addExact }]} /> : undefined}
          list={<div className="k-ev-page">
            <LongList gap={12} estimate={260} reveal={null} count={plan.overrides?.length ?? 0} rowKey={n => String(plan.overrides![n].id)} renderRow={i => { const o: WaveOverride = plan.overrides![i]; return (
                <Group title={o.test.list ? `Waves ${o.test.list.join(', ')}` : o.test.from ? `From Wave ${o.test.from}` : 'Exact Wave'} foldKey={`exact-${o.id}`} collapsible right={<>
                  <IconButton size="sm" label="Copy this wave onto the next one" onClick={() => ctx.commit(d => fillDown(d!, ['plans', pi, 'overrides'], i, 1))}><Copy size={13} /></IconButton>
                  <Button size="sm" variant="secondary" title="Copies this wave onto the next ten that are not written yet" onClick={() => ctx.commit(d => fillDown(d!, ['plans', pi, 'overrides'], i, 10))}>Fill Down</Button>
                  <Button size="sm" variant="secondary" title="Every count of the waves after this one grows by one per wave" onClick={() => ctx.commit(d => ramp(d!, ['plans', pi, 'overrides'], i, 1))}>Ramp</Button>
                  <IconButton size="sm" label="Remove" onClick={() => ctx.commit(d => removeAt(d, ['plans', pi, 'overrides'], i))}><Trash2 size={13} /></IconButton>
                </>}>
                  <FieldRow stacked label="Which Waves" help="Which waves this applies to."><WaveTestField value={o.test} onChange={v => ctx.commit(d => setAt(d, ['plans', pi, 'overrides', i, 'test'], v ?? {}))} /></FieldRow>
                  <SelectRow label="These Lines" help="Replace The Wave: only these come. Come On Top Of It: these and the usual lines." value={o.mode} options={[{ value: 'replace', label: 'Replace The Wave' }, { value: 'add', label: 'Come On Top Of It' }]} onChange={v => ctx.commit(d => setAt(d, ['plans', pi, 'overrides', i, 'mode'], v))} />
                  <LinesTable groups={o.groups} path={['plans', pi, 'overrides', i, 'groups']} ctx={ctx} picked={pickNow?.id ?? null} onPick={setLine} />
                </Group>
              ); }} />
            <Button variant="secondary" block icon={<Plus size={13} />} onClick={addExact}>Add A Wave By Hand</Button>
          </div>}
          detailKey={pickNow?.id ?? 'none'} detail={lineSide} />
      : tab === 'timing' ? <ScrollArea className="k-ev-scroll"><div className="k-ev-list-box k-ev-cols">
          <div className="k-ev-page">
            <Group title="This Plan">
              <FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={plan.name} onChange={v => put('name', v)} /></FieldRow>
              <SelectRow label="Starts" help="With the match, or when a Map Event sends its Signal." value={plan.start.on} options={[{ value: 'match', label: 'With The Match' }, { value: 'signal', label: 'When Told' }]} onChange={v => put('start', { ...plan.start, on: v })} />
              <Reveal when={plan.start.on === 'signal'}>{() => <FieldRow stacked label="Signal" help="The Signal that starts this plan."><RefField of="signal" value={plan.start.signal} ctx={ctx} onChange={v => put('start', { ...plan.start, signal: v })} /></FieldRow>}</Reveal>
              <FieldRow label="First Wave After" help="How long after its start the first wave comes."><NumField value={plan.start.delay} unit="s" onChange={v => put('start', { ...plan.start, delay: v })} /></FieldRow>
              <FieldRow label="Number Of The First Wave" help="The number it begins counting from."><NumberBox className="k-field k-ev-num" value={plan.first ?? 1} min={1} onChange={e => put('first', num(e.target.value) ?? 1)} /></FieldRow>
              <ToggleRow label="Endless" help="No list of waves: its numbers go on for ever." checked={endless} onChange={v => put('last', v ? null : (plan.first ?? 1) + 19)} />
              <Reveal when={!endless}>{() => <FieldRow label="Last Wave" help="Once this wave is cleared the plan finishes."><NumberBox className="k-field k-ev-num" value={plan.last ?? 1} min={1} onChange={e => put('last', num(e.target.value) ?? 1)} /></FieldRow>}</Reveal>
            </Group>
            <Group title="Who They Are">
              <SelectRow label="Side Of What It Spawns" help="The side its lines fight for, unless a line says otherwise." value={plan.side.team} options={SIDE_WORDS.map(s => ({ value: s.word, label: s.shown }))} onChange={v => put('side', { ...plan.side, team: v })} />
              <SelectRow label="They Stand With" help="With The Bosses: a boss class, whom others of that class never hurt. With The Shapes: as the food is." value={plan.side.camp ?? 'none'} options={[{ value: 'none', label: 'Their Side Alone' }, { value: 'boss', label: 'The Bosses' }, { value: 'shape', label: 'The Shapes' }]} onChange={v => put('side', { ...plan.side, camp: v })} />
              <ToggleRow label="What It Spawns Can Grow" help="In a mode with growth. On: what its waves bring grows with its score, as the players do. Off: it keeps the size and strength of its tank." checked={plan.canGrow === true} onChange={v => put('canGrow', v || undefined)} />
            </Group>
          </div>
          <div className="k-ev-page">
            <Group title="How A Wave Goes">
              <SelectRow label="How A Wave Is Filled" help="By Its Lines: each line's count says how many come. By Points: each wave has points to spend, every unit picks a card it can still afford, and a card's Cost says what it takes." value={plan.compose?.mode ?? 'counts'} onChange={v => put('compose', { ...(plan.compose ?? {}), mode: v as 'counts' | 'budget' })} options={[{ value: 'counts', label: 'By Its Lines' }, { value: 'budget', label: 'By Points' }]} />
              <Reveal when={plan.compose?.mode === 'budget'}>
                <FieldRow label="Points For Each Wave" help="A number, or a formula of the wave."><NumField value={plan.compose?.budget ?? 0} onChange={v => put('compose', { ...(plan.compose ?? { mode: 'budget' as const }), budget: v })} /></FieldRow>
              </Reveal>
              <FieldRow label="A Wave Comes Over" help="How long one wave takes to come out, from its first body to its last."><NumField value={plan.stream} unit="s" onChange={v => put('stream', v)} /></FieldRow>
              <SelectRow label="Next Wave When" help="What ends a wave." value={plan.advance.on} options={[{ value: 'cleared', label: 'What Holds It Is Gone' }, { value: 'timer', label: 'By The Clock' }, { value: 'clearedOrTimer', label: 'Whichever Comes First' }, { value: 'aliveBelow', label: 'Few Are Left' }, { value: 'manual', label: 'When Told' }]} onChange={v => put('advance', { ...plan.advance, on: v })} />
              <Reveal when={plan.advance.on === 'timer' || plan.advance.on === 'clearedOrTimer'}>{() => <FieldRow label="A Wave Lasts" help="The time by the clock."><NumField value={plan.advance.seconds ?? 30} unit="s" onChange={v => put('advance', { ...plan.advance, seconds: v })} /></FieldRow>}</Reveal>
              <Reveal when={plan.advance.on === 'aliveBelow'}>{() => <FieldRow label="Fewer Than" help="The next wave comes when fewer than this many are alive."><NumField value={plan.advance.aliveBelow ?? 1} onChange={v => put('advance', { ...plan.advance, aliveBelow: v })} /></FieldRow>}</Reveal>
              <FieldRow label="Break Between Waves" help="The rest between one wave ending and the next starting." note={<Facts items={factsFrom([2, 16, 100].map(w => `Wave ${w}: ${breakSeconds(plan, w, false).toFixed(1)} s`))} />}><NumField value={plan.advance.break} unit="s" onChange={v => put('advance', { ...plan.advance, break: v })} /></FieldRow>
              <FieldRow label="After A Wave With Nothing To Hold It, Times" help="A wave with nothing that holds the next one: its break is the usual break times this."><NumberBox className="k-field k-ev-num" value={plan.advance.emptyBreakMult ?? 1} step={0.01} min={0} onChange={e => put('advance', { ...plan.advance, emptyBreakMult: num(e.target.value) })} /></FieldRow>
            </Group>
            <Group title="Placement Of Every Line"><PlaceRuleField value={plan.place} ctx={ctx} onChange={v => put('place', v)} /></Group>
          </div>
        </div></ScrollArea>
      : tab === 'actions' ? <WaveActions plan={plan} ctx={ctx} />
      : tab === 'where' ? <ScrollArea className="k-ev-scroll"><div className="k-ev-list-box"><WhereTheySpawn plan={plan} ctx={ctx} /></div></ScrollArea>
      : <ScrollArea className="k-ev-scroll"><div className="k-ev-list-box"><Preview plan={plan} ctx={ctx} /></div></ScrollArea>}
      </div></PageSwap>
    </div>
  );
};
void BodyTestField; void (0 as unknown as Num); void ChevronRight;
