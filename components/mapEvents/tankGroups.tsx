import React, { useMemo, useState } from 'react';
import type { TankGroup } from '../../game/mapEvents/doc';
import { addTankGroup, indexOfId, setAt } from '../../game/mapEvents/docOps';
import { TANK_KINDS, DEBUFF_RESIST_MIN, DEBUFF_HEALTH_MIN, DEBUFF_HEALTH_MAX } from '../../game/tankDebuffs';
import { ALL_MODES } from '../../game/allModesSwitch';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import { BOT_PORTAL_DEFAULTS } from '../../types';
import { shownNameOfWord, findByShownNameOrFileKey, pickWordOf } from '../../game/tankByName';
import { Button, FieldRow, Group, IconButton, PickRow, SelectRow, SliderRow, TextField, ToggleRow } from '../kit/kit';
import { Reveal } from '../kit/Collapse';
import { LongList } from '../kit/LongList';
import { ContentLibrary } from '../library/ContentLibrary';
import { pickManyMode } from '../library/libraryPickTanks';
import { StopChancesRows } from '../StopChancesRows';
import { DebuffBox } from '../TankDebuffsCard';
import { Facts, factsFrom, TakeOffTags, type EvCtx } from './fields';
import { Bar, BarWord, DetailHead, NumBox, ROW_EST, Split, count, removeNamedThing } from './pages';
import { Plus, Trash2 } from '../ui/icons';

const GroupTanksPicker: React.FC<{ ctx: EvCtx; name: string; tanks: readonly string[]; onConfirm: (words: string[]) => void; onClose: () => void }> = ({ ctx, name, tanks, onConfirm, onClose }) => {
  const lib = ctx.logic.state.tankLibrary;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(tanks));
  const pickedIds = useMemo(() => { const ids = new Set<string>(); for (const w of selected) { const it = findByShownNameOrFileKey(lib, w, false); if (it) ids.add(it.id); } return ids; }, [selected, lib]);
  const mode = useMemo(() => pickManyMode({
    place: 'tankGroup', title: `Tanks Of ${name}`,
    subtitle: 'Click a tank to add or remove it. A tank may be in more than one group: the first group holds it.',
    selected,
    toggle: (w) => setSelected(prev => { const next = new Set(prev); if (next.has(w)) next.delete(w); else next.add(w); return next; }),
    onConfirm: () => onConfirm(Array.from(selected)),
    onReturn: onClose,
    chosenTitle: `In ${name}`,
    wordOf: (it) => pickWordOf(lib, it, false),
    isPicked: (e) => !!e.item && pickedIds.has(e.item.id),
  }), [name, selected, onConfirm, onClose, pickedIds, lib]);
  return <ContentLibrary logic={ctx.logic} mode={mode} onClose={onClose} />;
};

function tankTags(ctx: EvCtx, words: readonly string[]): { key: string; label: string }[] {
  const lib = ctx.logic.state.tankLibrary, seen = new Set<string>(), out: { key: string; label: string }[] = [];
  for (const w of words) {
    const label = shownNameOfWord(lib, w, false) || w;
    const one = SMALL_FIX.GH608 !== 0 ? (findByShownNameOrFileKey(lib, w, false)?.id ?? 'word:' + w) : label;
    if (seen.has(one)) continue; seen.add(one); out.push({ key: w, label });
  }
  return out;
}

const MODE_ROW = 'mode';
const kindRow = (id: string) => `kind:${id}`;
const manyOf = (one: string) => (one === 'Sanctuary' ? 'Sanctuaries' : one + 's');

export const TankGroupsPage: React.FC<{ ctx: EvCtx; focus?: number | null }> = ({ ctx, focus }) => {
  const list = ctx.doc?.tankGroups ?? [];
  const logic = ctx.logic;
  const [, bump] = useState(0);
  const cfg = logic.state.gameModeConfig;
  const putMode = (patch: Partial<typeof cfg>) => { logic.updateState({ gameModeConfig: { ...logic.state.gameModeConfig, ...patch } }); bump(n => n + 1); };
  const keys = [MODE_ROW, ...TANK_KINDS.map(k => kindRow(k.id)), ...list.map(g => String(g.id))];
  const [picked, setPicked] = useState<string | null>(focus != null ? String(focus) : null);
  const current = picked !== null && keys.includes(picked) ? picked : MODE_ROW;
  const gi = list.findIndex(g => String(g.id) === current);
  const g: TankGroup | undefined = gi >= 0 ? list[gi] : undefined;
  const kind = TANK_KINDS.find(k => kindRow(k.id) === current);
  const [choosing, setChoosing] = useState(false);
  const put = (k: keyof TankGroup, x: unknown) => { const id = g!.id; ctx.commit(d => setAt(d, ['tankGroups', indexOfId(d, 'tankGroups', id), k], x)); };
  const add = () => { let made = -1; ctx.commit(d => { const r = addTankGroup(d, 'Group'); made = r.ref.id; return r.doc; }); setPicked(String(made)); };
  const rethink = cfg.botPortalRethinkS ?? BOT_PORTAL_DEFAULTS.rethinkS, rest = cfg.botPortalRest ?? BOT_PORTAL_DEFAULTS.rest, restMin = cfg.botPortalRestMin ?? BOT_PORTAL_DEFAULTS.restMin;

  const row = (n: number): React.ReactNode => {
    if (n === 0) return <PickRow title="This Mode" facts={factsFrom(['Every Other Tank'])} selected={current === MODE_ROW} onPick={() => setPicked(MODE_ROW)} />;
    if (n <= TANK_KINDS.length) {
      const k = TANK_KINDS[n - 1], d = cfg.tankDebuffs?.[k.id];
      const weak = !!d && (d.resist !== undefined || d.health !== undefined);
      return <PickRow title={manyOf(k.one)} facts={factsFrom(['Ready Made', weak ? 'Weakened' : ''])} selected={current === kindRow(k.id)} onPick={() => setPicked(kindRow(k.id))} />;
    }
    const x = list[n - 1 - TANK_KINDS.length];
    return <PickRow title={x.name} selected={current === String(x.id)} onPick={() => setPicked(String(x.id))}
      facts={factsFrom([count(x.tanks.length, 'Tank', 'Tanks'), x.debuff ? 'Weakened' : '', x.stop !== undefined ? `Stops: ${x.stop} %` : '', x.portals ? 'Own Portal Rules' : ''])}
      actions={<IconButton size="sm" label="Remove" onClick={() => removeNamedThing(ctx, 'tankGroups', x.id, 'Tank Group')}><Trash2 size={13} /></IconButton>} />;
  };

  const detail = (): React.ReactNode => {
    if (current === MODE_ROW) return (
      <div className="k-ev-page">
        <DetailHead title="This Mode" />
        <Group title="Every Other Tank">
          <p className="k-ev-note">What a tank no group holds does in this mode. A group of the list takes its own rules in the place of these.</p>
        </Group>
        <Reveal when={ALL_MODES.ON !== 0 && cfg.mode !== 'sandbox'}>
          <StopChancesRows config={cfg} onChange={v => putMode({ stopChances: v })} />
        </Reveal>
        <Group title="Bots and Portals">
          <SliderRow label="Wait After Saying No" unit="s" deferred
            help="When a bot sees a portal and decides not to go in, or gives up on the way, it waits this long before it thinks about any portal again."
            value={rethink} onChange={v => putMode({ botPortalRethinkS: v })} min={0} max={120} step={5} inputMax={600} />
          <ToggleRow label="Rest After a Trip"
            help={'After a bot goes through a portal or a wormhole, it ignores every portal and steers clear of them for a while, so it explores the new area instead of going back and forth. It can still fall in by mistake, as you can.'
              + (cfg.mode === 'old-dreadnoughts' ? ' A bot never rests in the Forge: it leaves as before.' : '')}
            checked={rest} onChange={v => putMode({ botPortalRest: v })} />
          <Reveal when={rest}>
            <SliderRow label="Rest Time" unit="min" deferred help="How long the rest after a trip lasts, in minutes."
              value={restMin} onChange={v => putMode({ botPortalRestMin: v })} min={0.5} max={10} step={0.5} inputMin={0.5} inputMax={60} />
          </Reveal>
        </Group>
      </div>
    );
    if (kind) {
      const d = cfg.tankDebuffs?.[kind.id];
      const setK = (patch: { resist?: number; health?: number }) => { logic.setTankDebuff(kind.id, patch); bump(n => n + 1); };
      return (
        <div className="k-ev-page">
          <DetailHead title={manyOf(kind.one)} />
          <Group title="This Group">
            <p className="k-ev-note">Ready made: its tanks are fixed. Make a group of your own for any other tanks.</p>
            <Facts items={tankTags(ctx, kind.words).map(t => ({ key: t.key, text: t.label }))} />
          </Group>
          <Group title="Debuff">
            <FieldRow label="Resist" help={`How much of each hit a ${kind.one} shrugs off in this mode. Empty: its own ${kind.fileResist}, which makes it almost unkillable. At 1 it takes hits like an ordinary tank, and a first hit takes its whole shield.`}>
              <DebuffBox value={d?.resist} min={DEBUFF_RESIST_MIN} max={kind.fileResist} step={0.1} placeholder={String(kind.fileResist)} label={`${kind.one} resist`} onChange={v => setK({ resist: v })} />
            </FieldRow>
            <FieldRow label="Health" help={`How much of its own health a ${kind.one} keeps in this mode. Empty: all of it. Measured on a server: with Resist 1 and 71 %, a full offense Annihilator kills a Dominator in about 13 shots.`}>
              <span className="k-ev-numbox"><DebuffBox value={d?.health} min={DEBUFF_HEALTH_MIN} max={DEBUFF_HEALTH_MAX} placeholder="100" label={`${kind.one} health`} onChange={v => setK({ health: v })} /><span className="k-unit">%</span></span>
            </FieldRow>
          </Group>
        </div>
      );
    }
    if (!g) return null;
    const pp = g.portals ?? {};
    return (
      <div className="k-ev-page">
        <DetailHead title={g.name} />
        <Group title="This Group">
          <FieldRow stacked label="Name" help="What it is called in this list."><TextField value={g.name} onChange={x => put('name', x)} /></FieldRow>
          <Reveal when={g.tanks.length > 0}>{() => <TakeOffTags items={tankTags(ctx, g.tanks)} onRemove={w => put('tanks', g.tanks.filter(t => t !== w))} />}</Reveal>
          <Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={() => setChoosing(true)}>Choose Tanks</Button>
        </Group>
        <Group title="Debuff">
          <ToggleRow label="Weaken These Tanks" help="On: these tanks take the Resist and the Health below in the place of the mode's (a box left empty: the tank's own). A group never makes a tank stronger than its file." checked={!!g.debuff} onChange={v => put('debuff', v ? {} : undefined)} />
          <Reveal when={!!g.debuff}>{() => <>
            <FieldRow label="Resist" help="How much of each hit they shrug off: 1 like an ordinary tank, up to the tank's own. Empty: the tank's own."><NumBox value={g.debuff!.resist} min={1} max={100} step={0.1} placeholder="Its Own" onChange={v => put('debuff', { ...g.debuff, resist: v })} /></FieldRow>
            <FieldRow label="Health" help="How much of its own health each one keeps. Empty: all of it."><NumBox value={g.debuff!.health} min={1} max={100} unit="%" placeholder="100" onChange={v => put('debuff', { ...g.debuff, health: v })} /></FieldRow>
          </>}</Reveal>
        </Group>
        <Group title="Upgrading">
          <ToggleRow label="Their Own Chance To Stop" help="On: a bot that stands on one of these tanks stops upgrading with this chance, in the place of its tier's chance. 0: it never stops on them. 100: it always stops on them." checked={g.stop !== undefined} onChange={v => put('stop', v ? 10 : undefined)} />
          <Reveal when={g.stop !== undefined}>{() => <FieldRow label="Chance To Stop" help="The chance in % that a bot stays on one of these tanks and upgrades no further. A Dreadnought never stops."><NumBox value={g.stop} min={0} max={100} unit="%" onChange={v => put('stop', v ?? 0)} /></FieldRow>}</Reveal>
        </Group>
        <Group title="Portals">
          <ToggleRow label="Their Own Portal Rules" help="On: a bot on one of these tanks treats portals and wormholes by the rules below (a box left empty: the mode's)." checked={!!g.portals} onChange={v => put('portals', v ? {} : undefined)} />
          <Reveal when={!!g.portals}>{() => <>
            <FieldRow label="Wait After Saying No" help="When it decides not to go into a portal, or gives up on the way, it waits this long before it thinks about any portal again. Empty: the mode's."><NumBox value={pp.rethinkS} min={0} max={600} unit="s" placeholder="The Mode's" onChange={v => put('portals', { ...pp, rethinkS: v })} /></FieldRow>
            <SelectRow label="Rest After A Trip" help="After a trip through a portal or a wormhole it ignores every portal for a while. As The Mode Says: the mode's rule." value={pp.rest === undefined ? 'mode' : pp.rest ? 'on' : 'off'} options={[{ value: 'mode', label: 'As The Mode Says' }, { value: 'on', label: 'Always Rests' }, { value: 'off', label: 'Never Rests' }]} onChange={v => put('portals', { ...pp, rest: v === 'mode' ? undefined : v === 'on' })} />
            <Reveal when={pp.rest !== false}>{() => <FieldRow label="Rest Time" help="How long that rest lasts. Empty: the mode's."><NumBox value={pp.restMin} min={0.5} max={60} step={0.5} unit="min" placeholder="The Mode's" onChange={v => put('portals', { ...pp, restMin: v })} /></FieldRow>}</Reveal>
          </>}</Reveal>
        </Group>
        {choosing ? <GroupTanksPicker ctx={ctx} name={g.name} tanks={g.tanks} onConfirm={w => { put('tanks', w); setChoosing(false); }} onClose={() => setChoosing(false)} /> : null} { }
      </div>
    );
  };

  return (
    <Split
      bar={<Bar left={<BarWord word="Tank Groups" n={list.length} />}><Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={add}>New Group</Button></Bar>}
      list={<LongList gap={6} estimate={ROW_EST} reveal={current} count={keys.length} rowKey={n => keys[n]} renderRow={row} />}
      detailKey={current}
      detail={detail()}
    />
  );
};
