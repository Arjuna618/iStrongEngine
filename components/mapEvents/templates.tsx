import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Id, MapEventsDoc, Ref, Row, Rule } from '../../game/mapEvents/doc';
import { DEFAULT_PLACE_RULE, docHasWork } from '../../game/mapEvents/doc';
import { askChoice } from '../project/dialogs';
import { addEntityType, addPlan, addRule, addTimer, insertAt, makeRow, setAt, withIds, indexOfId, addGroup } from '../../game/mapEvents/docOps';
import { buildPresetWorld } from '../../game/mapEvents/presets/index';
import { modeCardEntries } from '../maps/modeCatalog';
import { Modal } from '../kit/Modal';
import { Button, FieldRow, IconButton, Tabs, TextField } from '../kit/kit';
import { SwapBox } from '../kit/Collapse';
import { ThemeSwitch } from '../kit/ThemeSwitch';
import { useEscapeClose } from '../shared/useEscapeClose';
import { NumberBox } from '../kit/NumberBox';
import { useClosing } from '../kit/motion';
import { useWindowFrame } from '../kit/focusScope';
import { toast } from '../ui/Toast';
import { markOfLastEdit, undoMarkedEdit } from '../shared/markedUndo';
import { EvSelect } from './EvSelect';
import { choicesOf, TankField, ZONES_KEY, type EvCtx } from './fields';
import { Target, Flag, Skull, Map as MapIcon, Crown, X, Shield, MevEvents, MevWaves } from '../ui/icons';
import { useBackdropClose } from '../shared/useBackdropClose';
import { usePortalMenuScale as useScale, useFitScale } from '../../utils/useMenuScale';
import { windowSize } from '../library/ContentLibrary';

type Tab = 'simple' | 'objectives' | 'waves' | 'modes';
interface Input { key: string; label: string; unit?: string; kind: 'tank' | 'number' | 'text' | 'area'; def?: string | number; }
const INPUT_HELP: Readonly<Record<string, string>> = {
  'After How Long': 'How long into the match it happens.',
  'After It Falls': 'The tank that takes its place when it dies.',
  'At Most Alive': 'It fills up to this number.',
  'Boss': 'The tank that is the boss. Anything of the Content Library.',
  'Break Between Waves': 'The rest between one wave ending and the next starting.',
  'Custom Area': 'The area it happens in. Draw one on the map first.',
  'Every': 'The time between two spawns.',
  'How Many Each Time': 'How many come each time.',
  'How Many': 'How many there are.',
  'It Says': 'The line the player reads.',
  'More Each Wave': 'How many more come with each new wave.',
  'Refill Every': 'How often it looks for what is missing.',
  'Spawn At': 'The area they come out of. Draw one on the map first.',
  'Tank': 'The tank it uses. Anything of the Content Library.',
  'While It Stands': 'The tank that stands there first.',
};
interface Template {
  id: string; tab: Tab; title: string; text: string; Icon: React.FC<{ size?: number }>;
  inputs: Input[];
  write: (doc: MapEventsDoc, v: Record<string, unknown>, ctx: EvCtx) => MapEventsDoc;
}

const row = (id: Id, k: string, a: Record<string, unknown>): Row => ({ id, k, a });
function addSimpleRule(doc: MapEventsDoc, name: string, when: (id: () => Id) => Row[], cond: (id: () => Id) => Row[], then: (id: () => Id) => Row[], over: Partial<Rule> = {}): MapEventsDoc {
  const r = withIds(doc, id => ({ id: id(), name, when: when(id), cond: cond(id), then: then(id), ...over } as Rule));
  return { ...r.doc, rules: [...(r.doc.rules ?? []), r.value] };
}
const none = (): Row[] => [];
const areaRef = (v: unknown, ctx: EvCtx): Ref | null => { const hit = choicesOf('area', ctx).find(x => String(x.id) === v); return hit ? { id: hit.id, n: hit.name } : null; };
function typeOf(doc: MapEventsDoc, name: string, tank: string, team = 'againstPlayer', stands = false): { doc: MapEventsDoc; ref: Ref } {
  return addEntityType(doc, name, tank, team, stands);
}
function addBehavior(doc: MapEventsDoc, areaId: Id, k: string, a: (id: () => Id) => Record<string, unknown>): MapEventsDoc {
  const zones = (doc as Record<string, unknown>)[ZONES_KEY] as { uid?: number; behaviors?: Row[] }[];
  const i = zones.findIndex(z => z.uid === areaId);
  if (i < 0) return doc;
  const r = withIds(doc, id => row(id(), k, a(id)));
  return setAt(r.doc, [ZONES_KEY, i, 'behaviors'], [...(zones[i].behaviors ?? []), r.value]);
}

export const TEMPLATES: Template[] = [
  { id: 'keepAlive', tab: 'simple', title: 'Keep N Alive', text: 'An area keeps a number of tanks alive: a dead one is replaced.', Icon: Shield,
    inputs: [{ key: 'tank', label: 'Tank', kind: 'tank', def: 'eliteDestroyer' }, { key: 'area', label: 'Custom Area', kind: 'area' }, { key: 'n', label: 'How Many', kind: 'number', def: 5 }, { key: 'every', label: 'Refill Every', unit: 's', kind: 'number', def: 2 }],
    write: (doc, v, ctx) => {
      const area = areaRef(v.area, ctx); if (!area) return doc;
      const t = typeOf(doc, String(v.tank), String(v.tank));
      return addBehavior(t.doc, area.id, 'spawn', id => ({ mode: 'maxAlive', cards: [{ id: id(), type: t.ref, weight: 1 }], maxAlive: Number(v.n), refillEvery: Number(v.every), place: DEFAULT_PLACE_RULE }));
    } },
  { id: 'timerSpawner', tab: 'simple', title: 'Timer Spawner', text: 'An area spawns tanks every so many seconds.', Icon: Target,
    inputs: [{ key: 'tank', label: 'Tank', kind: 'tank', def: 'basic' }, { key: 'area', label: 'Custom Area', kind: 'area' }, { key: 'every', label: 'Every', unit: 's', kind: 'number', def: 10 }, { key: 'n', label: 'How Many Each Time', kind: 'number', def: 1 }, { key: 'max', label: 'At Most Alive', kind: 'number', def: 8 }],
    write: (doc, v, ctx) => {
      const area = areaRef(v.area, ctx); if (!area) return doc;
      const t = typeOf(doc, String(v.tank), String(v.tank));
      return addBehavior(t.doc, area.id, 'spawn', id => ({ mode: 'timer', cards: [{ id: id(), type: t.ref, weight: 1 }], every: Number(v.every), perSpawn: Number(v.n), maxAlive: Number(v.max), place: DEFAULT_PLACE_RULE }));
    } },
  { id: 'messageEnter', tab: 'simple', title: 'Message When Entering', text: 'A message when a player walks into an area.', Icon: MapIcon,
    inputs: [{ key: 'area', label: 'Custom Area', kind: 'area' }, { key: 'text', label: 'It Says', kind: 'text', def: 'You have entered the area.' }],
    write: (doc, v, ctx) => {
      const area = areaRef(v.area, ctx); if (!area) return doc;
      return addSimpleRule(doc, `Message In ${area.n}`, id => [row(id(), 'area.entered', { area, who: { player: true } })], none, id => [row(id(), 'say', { text: String(v.text), to: 'subject' })]);
    } },
  { id: 'winBoss', tab: 'simple', title: 'Win By Killing A Boss', text: 'A boss stands on the map. Kill it and the match is won.', Icon: Crown,
    inputs: [{ key: 'tank', label: 'Boss', kind: 'tank', def: 'eliteDestroyer' }, { key: 'text', label: 'It Says', kind: 'text', def: 'The boss has fallen!' }],
    write: (doc, v) => {
      const t = typeOf(doc, 'Boss', String(v.tank), 'againstPlayer', true);
      let d = setAt(t.doc, ['types', indexOfId(t.doc, 'types', t.ref.id), 'bossTier'], true);
      const r = withIds(d, (id, base) => ({ id: id(), name: `Boss ${(base.placed?.length ?? 0) + 1}`, type: t.ref, cx: 16, cy: 16 }));
      d = { ...r.doc, placed: [...(r.doc.placed ?? []), r.value] };
      return addSimpleRule(d, 'The Boss Falls', id => [row(id(), 'body.died', { who: { types: [t.ref] } })], none, id => [row(id(), 'say', { text: String(v.text), to: 'all' }), row(id(), 'match.end', { result: 'win', team: 'player', then: 'nothing' })]);
    } },
  { id: 'bothWays', tab: 'objectives', title: 'Both Ways Site', text: 'A site that belongs to whoever killed it last.', Icon: Flag,
    inputs: [{ key: 'tank', label: 'While It Stands', kind: 'tank', def: 'sanctuaryTier1' }, { key: 'fallen', label: 'After It Falls', kind: 'tank', def: 'dominator' }],
    write: (doc, v) => {
      const r = withIds(doc, (id, base) => {
        const a = id(), b = id();
        return { id: id(), name: `Site ${(base.types?.length ?? 0) + 1}`, side: { team: 'team1' }, stands: true, forms: [
          { id: a, name: 'Standing', tank: String(v.tank), onDeath: { to: b, team: 'killer' } },
          { id: b, name: 'Fallen', tank: String(v.fallen), onDeath: { to: a, team: 'killer' } },
        ] };
      });
      return { ...r.doc, types: [...(r.doc.types ?? []), r.value as never] };
    } },
  { id: 'loseAllFall', tab: 'objectives', title: 'Lose When All Fall', text: 'The match is lost when none of a Tag stands for a time.', Icon: Skull,
    inputs: [{ key: 'seconds', label: 'After How Long', unit: 's', kind: 'number', def: 60 }, { key: 'text', label: 'It Says', kind: 'text', def: 'Your team has lost.' }],
    write: (doc, v) => {
      const tagName = 'Must Stand';
      const r = withIds(doc, id => ({ id: id(), name: tagName }));
      const d = { ...r.doc, tags: [...(r.doc.tags ?? []), r.value] };
      const tag = { id: r.value.id, n: tagName };
      return addSimpleRule(d, 'All Have Fallen', id => [row(id(), 'count.crossed', { tag, n: 0, dir: 'fallsTo' })], none, id => [row(id(), 'wait', { seconds: Number(v.seconds) }), row(id(), 'say', { text: String(v.text), to: 'all' }), row(id(), 'match.end', { result: 'lose', team: 'player', then: 'closeArena' })]);
    } },
  { id: 'simpleWaves', tab: 'waves', title: 'Simple Waves', text: 'Waves of one tank, each bigger than the last, out of an area.', Icon: MevWaves,
    inputs: [{ key: 'tank', label: 'Tank', kind: 'tank', def: 'basic' }, { key: 'area', label: 'Spawn At', kind: 'area' }, { key: 'per', label: 'More Each Wave', kind: 'number', def: 1 }, { key: 'break', label: 'Break Between Waves', unit: 's', kind: 'number', def: 10 }],
    write: (doc, v, ctx) => {
      const area = areaRef(v.area, ctx); if (!area) return doc;
      const p = addPlan(doc, 'Wave Plan');
      const t = typeOf(p.doc, String(v.tank), String(v.tank));
      const i = indexOfId(t.doc, 'plans', p.ref.id);
      const g = addGroup(setAt(t.doc, ['plans', i, 'advance', 'break'], Number(v.break)), ['plans', i, 'groups'], 'Line 1', [{ type: t.ref, weight: 1 }], { ramp: { per: Number(v.per) } }, [area]);
      return g.doc;
    } },
];
void addRule; void addTimer; void insertAt; void makeRow;

const InputRow: React.FC<{ input: Input; value: unknown; onChange: (v: unknown) => void; ctx: EvCtx }> = ({ input, value, onChange, ctx }) => {
  const help = INPUT_HELP[input.label];
  switch (input.kind) {
    case 'tank': return <FieldRow stacked label={input.label} help={help}><TankField value={value as string} ctx={ctx} onChange={onChange} /></FieldRow>;
    case 'area': { const list = choicesOf('area', ctx);
      return <FieldRow stacked label={input.label} help={help}><EvSelect value={String(value ?? '')} placeholder={list.length ? 'Pick A Custom Area' : 'Draw A Custom Area First'} options={list.map(x => ({ value: String(x.id), label: x.name }))} onChange={onChange} /></FieldRow>; }
    case 'number': return <FieldRow label={input.label} help={help}><span className="k-ev-numbox"><NumberBox className="k-field k-ev-num" value={value as number} min={0} onChange={e => onChange(Number(e.target.value) || 0)} />{input.unit ? <span className="k-unit">{input.unit}</span> : null}</span></FieldRow>;
    default: return <FieldRow stacked label={input.label} help={help}><TextField value={String(value ?? '')} onChange={onChange} /></FieldRow>;
  }
};

const AskInputs: React.FC<{ t: Template; ctx: EvCtx & { refresh?: () => void }; onClose: () => void; onDone: () => void }> = ({ t, ctx, onClose, onDone }) => {
  const [v, setV] = useState<Record<string, unknown>>(() => Object.fromEntries(t.inputs.map(i => [i.key, i.def])));
  const missing = t.inputs.some(i => i.kind === 'area' && !v[i.key]);
  return (
    <Modal title={t.title} size="sm" onClose={onClose} z={2200} footer={close => (
      <Button variant="primary" disabled={missing} onClick={() => close(() => {
        ctx.commit(d => t.write(d!, v, ctx));
        const mark = markOfLastEdit(ctx.logic);
        toast('success', `Added ${t.title}.`, { label: 'Undo', run: () => { undoMarkedEdit(ctx.logic, mark); ctx.refresh?.(); } });
        onDone();
      })}>Add</Button>
    )}>
      <div className="k-ev-page">{t.inputs.map(i => <InputRow key={i.key} input={i} value={v[i.key]} ctx={ctx} onChange={x => setV(o => ({ ...o, [i.key]: x }))} />)}</div>
    </Modal>
  );
};

const TemplateCard: React.FC<{ Icon: React.FC<{ size?: number; className?: string }>; title: string; text: string; onClick: () => void }> = ({ Icon, title, text, onClick }) => (
  <button type="button" className="group relative k-ev-tpl-card text-left" onClick={onClick}>
    <div className="absolute inset-0 rounded-xl border bg-[var(--k-box-bg)] shadow-[var(--k-hub-card-shadow)] border-[var(--alpha-card-border)]" />
    <div className="absolute inset-0 rounded-xl shadow-[var(--shadow-raise)] opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none" />
    <div className="k-hub-bar"><Icon size={14} className="shrink-0" /><span className="k-hub-name">{title}</span></div>
    <div className="relative k-ev-tpl-text">{text}</div>
  </button>
);

export const TemplatesWindow: React.FC<{ ctx: EvCtx & { refresh?: () => void }; onClose: () => void; onDone: () => void }> = ({ ctx, onClose, onDone }) => {
  const [tab, setTab] = useState<Tab>('simple');
  const [asking, setAsking] = useState<Template | null>(null);
  const portalScale = useScale();
  const scrim = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null);
  const fit = useFitScale(card, portalScale, true);
  const { closing, close } = useClosing(onClose);
  useWindowFrame({ scrim, card, closing });
  useEscapeClose(close, !closing && asking === null);
  const backdrop = useBackdropClose(close);
  const size = useMemo(() => { const s = windowSize(); return { w: Math.min(s.w, 1000), h: Math.min(s.h, 640) }; }, []);
  const modes = useMemo(() => modeCardEntries().map(e => ({ m: e.preset!, title: buildPresetWorld(e.preset)?.events.meta?.title ?? e.title })), []);
  const list = TEMPLATES.filter(t => t.tab === tab);
  const whole = async (m: string) => {
    const w = buildPresetWorld(m);
    if (!w) return;
    if (docHasWork(ctx.doc) || ctx.zones.length > 0) {
      const a = await askChoice('This Map Holds Work', `${w.events.meta?.title} takes the place of this map's Map Events and Custom Areas. One Undo brings them back.`, [{ value: 'replace', label: 'Replace This Map', primary: true }, { value: 'cancel', label: 'Cancel' }], 'cancel');
      if (a !== 'replace') return;
    }
    ctx.commit(d => ({ ...w.events, [ZONES_KEY]: w.mapAreas.zones, nextId: Math.max(w.events.nextId, d?.nextId ?? 1) }));
    const mark = markOfLastEdit(ctx.logic);
    toast('info', `This map now holds the rules of ${w.events.meta?.title}. Its walls stay its own.`, { label: 'Undo', run: () => { undoMarkedEdit(ctx.logic, mark); ctx.refresh?.(); } });
    onDone();
    close();
  };
  return createPortal(
    <div ref={scrim} className={`modal-scrim z-[75] animate-fadeIn ${closing ? 'pointer-events-none' : ''}`} {...backdrop}>
      <div style={{ zoom: fit }} onClick={e => e.stopPropagation()}>
        <div ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Start From A Template" className="modal-card k-lib-window k-hub-window flex flex-col outline-none animate-scaleUp" style={{ width: size.w, height: size.h }}>
          <div className="k-win-head shrink-0 flex items-center gap-4 pl-5 pr-3 h-[60px] border-b border-[var(--alpha-divider)]">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <MevEvents size={20} absoluteStrokeWidth className="text-[var(--text-primary)] shrink-0" />
              <h2 className="k-modal-title min-w-0 truncate">Start From A Template</h2>
            </div>
            <ThemeSwitch />
            <IconButton aria-label="Close" title="Close" onClick={close}><X size={16} /></IconButton>
          </div>
          <div className="k-ev-tpl-tabs"><Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'simple', label: 'Simple' }, { value: 'objectives', label: 'Objectives' }, { value: 'waves', label: 'Waves' }, { value: 'modes', label: 'Whole Modes' }]} /></div>
          <div className="k-ev-tpl-grid popup-scrollbar">
            <SwapBox swapKey={tab}>
              <div className="k-ev-tpl-cards">
                {tab === 'modes'
                  ? modes.map(({ m, title }) => <TemplateCard key={m} Icon={Flag} title={title} text="Every rule, wave and Entity Type of this mode, as yours to change." onClick={() => whole(m)} />)
                  : list.map(t => <TemplateCard key={t.id} Icon={t.Icon} title={t.title} text={t.text} onClick={() => setAsking(t)} />)}
              </div>
            </SwapBox>
          </div>
        </div>
      </div>
      {asking !== null ? <AskInputs t={asking} ctx={ctx} onClose={() => setAsking(null)} onDone={() => { setAsking(null); onDone(); close(); }} /> : null}
    </div>,
    document.body,
  );
};
