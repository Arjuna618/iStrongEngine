import React, { useEffect, useRef, useState } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import type { EntityType, PlacedEntity, Ref, Row, ZoneLike } from '../../game/mapEvents/doc';
import { behaviorsOf, SIDE_WORDS, zoneShapeOf } from '../../game/mapEvents/doc';
import { kindOf } from '../../game/mapEvents/registry';
import { BASE_AREAS, zoneBaseTeam } from '../../game/baseAreas';
import { editEntities, editZones, findPlacedEntity, findPlacedZone, opDelete, opRemoveZoneRect, setMapEditSelection, clearMapEditSelection, cancelMapEditInteraction, MAP_EDIT_MAX_ENTITIES, MAP_EDIT_MAX_ZONES, MAP_READ_MAX_ZONES, type MapEditorKind } from '../../game/MapEditor';
import { areaRefById, resolveSelection, updateSelectedZone, updateSelectedZoneArea, setPickedAreaShape, setPickedAreaTurn, togglePickedAreaPoints, setPickedAreaFill } from '../../game/MapEditorInput';
import { fillCountOf, fillKindsOf, fillPatternOf, fillVariationOf } from '../../game/MapSystem';
import { MapLibraryWindow } from '../maps/MapLibraryWindow';
import { ROCK_PATTERN_NAMES } from '../maps/rockCatalog';
import { MazeTypeName } from '../maps/mazeTypeName';
import type { AreaFill } from '../../types';
import { AREA_SIDES_MIN, AREA_SIDES_MAX } from '../../game/areaShape';
import type { AreaToolShape } from '../../game/MapEditor';
import { addAreaGroup, addEntityType, duplicatePlaced, duplicateZone, factsOf, indexOfId, insertAt, removeAt, setAt, setBecome, usedBy, usedByNames, withIds, mirrorPlaced, mirrorZone } from '../../game/mapEvents/docOps';
import { builtGridOf } from '../../game/MapSystem';
import { Button, Chip, FieldRow, Group, IconButton, PickRow, SearchField, SelectRow, TextField, ToggleRow } from '../kit/kit';
import { DropMenu, useDropMenu } from '../kit/DropMenu';
import { bringIntoView, FOLD_FADE_MS, FOLD_MS, Reveal, SwapBox, type FoldHandle } from '../kit/Collapse';
import { LongList } from '../kit/LongList';
import { Modal } from '../kit/Modal';
import { NumberBox } from '../kit/NumberBox';
import { isOneOf, usePanelMemory } from '../kit/panelMemory';
import { Tabs } from '../kit/kit';
import { toast } from '../ui/Toast';
import { sameProjectUndo } from '../shared/sameProjectUndo';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import { markOfLastEdit, undoMarkedEdit } from '../shared/markedUndo';
import { ColorMapControl, ColorMapSwitch } from '../shared/ColorMapField';
import { SliderRow } from '../shared/mapDesignerControls';
import { CM_USE } from '../../utils/colorMap';
import { customAreaLook } from '../../game/MapSystem';
import { TEAM_COLORS_DARK, TEAM_COLORS_LIGHT, TEAM_NAMES, type PlacedZone } from '../../types';
import { isGameDark } from '../../utils/gameColors';
import { problemsOf, useEvCtx } from './evCtx';
import { EvSelect } from './EvSelect';
import { ChipsField, choicesOf, groupsOfKinds, NumField, RowFields, TankField, thingNamer, ThingField, ZONES_KEY, type EvCtx } from './fields';
import { openMapEvents } from './mapEventsStore';
import { TemplatesWindow } from './templates';
import { Copy, MevEvents, MevProblems, Plus, Redo2, Trash2, Undo2, FlipHorizontal, MoreHorizontal } from '../ui/icons';

const num = (s: string): number | undefined => { const v = Number(s); return s.trim() !== '' && Number.isFinite(v) ? v : undefined; };

function useFocusName(logic: GameLogic, id: number) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logic.mapEditor.focusNameOf !== id) return;
    logic.mapEditor.focusNameOf = -1;
    const input = box.current?.querySelector('input');
    if (input) { input.focus(); input.select(); }
  }, [logic, id]);
  return box;
}

const BehaviorRow: React.FC<{ b: Row; path: readonly (string | number)[]; ctx: EvCtx; onRemove: () => void; onOpen: () => void }> = ({ b, ctx, onRemove, onOpen }) => {
  return (
    <PickRow title={kindOf('behavior', b.k)?.label ?? 'Made in a newer version'} facts={factsOf('behavior', b, ctx.doc, ctx.zones, thingNamer(ctx))} onPick={onOpen}
      actions={<><Button size="sm" variant="secondary" onClick={onOpen}>Configure</Button><IconButton size="sm" label="Remove" onClick={onRemove}><Trash2 size={13} /></IconButton></>} />
  );
};

const ZoneBehaviors: React.FC<{ z: ZoneLike; i: number; ctx: EvCtx }> = ({ z, i, ctx }) => {
  const list = behaviorsOf(z);
  const path = [ZONES_KEY, i, 'behaviors'];
  const [open, setOpen] = useState<number | null>(null);
  const written = (d: Parameters<EvCtx['commit']>[0] extends (x: infer D) => unknown ? D : never) => {
    if (Array.isArray(z.behaviors) || list.length === 0) return d;
    const r = withIds(d, id => list.map(b => ({ ...b, id: id() })));
    return setAt(r.doc, path, r.value);
  };
  const add = (k: string) => ctx.commit(d => {
    const base = written(d);
    const r = withIds(base, id => ({ id: id(), k, a: {} } as Row));
    const now = (r.doc as Record<string, unknown>)[ZONES_KEY] as ZoneLike[];
    return setAt(r.doc, path, [...(now[i].behaviors ?? []), r.value]);
  });
  const shown = open !== null ? list.findIndex(b => b.id === open) : -1;
  return (
    <div className="k-ev-list">
      <LongList gap={4} estimate={68} empty={<div className="k-ev-note">It only looks. Add what it does.</div>} count={list.length} rowKey={j => String(list[j].id || j)} renderRow={j => { const b = list[j]; return <BehaviorRow b={b} path={[...path, j]} ctx={ctx} onOpen={() => setOpen(b.id)}
          onRemove={() => { const thing = list[j]; ctx.commit(d => removeAt(written(d), path, j)); toast('info', `${kindOf('behavior', b.k)?.label ?? 'Behaviour'} removed.`, { label: 'Undo', run: SMALL_FIX.R908 !== 0 ? sameProjectUndo(ctx.logic, toast, () => ctx.commit(d => insertAt(d, path, j, thing))) : () => ctx.commit(d => insertAt(d, path, j, thing)) }); }} />; }} />
      <EvSelect add="Add A Behaviour" groups={groupsOfKinds('behavior')} onChange={add} />
      {shown >= 0 ? (
        <Modal title={`${kindOf('behavior', list[shown].k)?.label ?? 'Behaviour'} in ${z.name ?? 'this area'}`} size="lg" onClose={() => setOpen(null)}>
          {list[shown].k === 'spawn' || list[shown].k === 'food'
            ? <RowFields family="behavior" row={list[shown]} path={[...path, shown]} ctx={{ ...ctx, commit: edit => ctx.commit(d => edit(written(d))) }} />
            : <Group><RowFields family="behavior" row={list[shown]} path={[...path, shown]} ctx={{ ...ctx, commit: edit => ctx.commit(d => edit(written(d))) }} /></Group>}
        </Modal>
      ) : null}
    </div>
  );
};

const AreaInspector: React.FC<{ logic: GameLogic; ctx: EvCtx; z: PlacedZone; areaId: string; custom: boolean; onUpdate: () => void }> = ({ logic, ctx, z, areaId, custom, onUpdate }) => {
  const i = ctx.zones.findIndex(q => q.id === z.id);
  const nameBox = useFocusName(logic, z.id);
  const isBase = zoneBaseTeam(z as unknown as ZoneLike) >= 0;
  const full = !isBase || BASE_AREAS.ON !== 0;
  const look = { ...customAreaLook(z), colorFree: z.colorFree };
  const palette = isGameDark() ? TEAM_COLORS_DARK : TEAM_COLORS_LIGHT;
  const put = (patch: Parameters<typeof updateSelectedZoneArea>[1]) => { updateSelectedZoneArea(logic, patch); onUpdate(); };
  const groups = ctx.doc?.areaGroups ?? [];
  const inGroups = groups.filter(g => z.uid !== undefined && g.members.some(m => m.id === z.uid));
  const used = z.uid !== undefined ? usedBy(ctx.doc, ctx.zones, z.uid) : 0;
  const addRect = () => { logic.mapEditor.tool = 'zone'; logic.mapEditor.zoneAddTo = z.id; onUpdate(); };
  const sh = zoneShapeOf(z);
  const shapeKind: AreaToolShape = sh === null ? 'rect' : sh.k === 'ellipse' ? 'ellipse' : sh.sides !== undefined ? 'poly' : 'free';
  const turnDeg = sh !== null ? Math.round(((((sh.rot ?? 0) * 180) / Math.PI) % 360 + 540) % 360 - 180) : 0;
  const setName = (v: string) => {
    if (z.uid !== undefined) { put({ name: v }); return; }
    ctx.commit(d => { const r = withIds(d, id => id()); return setAt(setAt(r.doc, [ZONES_KEY, i, 'uid'], r.value), [ZONES_KEY, i, 'name'], v); });
    onUpdate();
  };
  return (
    <div className="k-ev-inspector">
      <div className="k-ev-detail-head"><span className="k-ev-detail-title">{z.name ?? (isBase ? 'Team Base' : 'Custom Area')}</span><span className="k-count">{isBase ? 'Team Base' : 'Custom Area'}</span></div>
      <div ref={nameBox}><FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={z.name ?? ''} placeholder="Give It A Name" onChange={setName} /></FieldRow></div>
      <Reveal when={custom && BASE_AREAS.ON === 0}>
        <SelectRow label="It Is" help="Team Base: a team's safe ground, on a Custom Editor map. Custom Area: what its behaviours say." value={isBase ? 'base' : 'area'} options={[{ value: 'area', label: 'Custom Area' }, { value: 'base', label: 'Team Base' }]} onChange={v => put({ kind: v === 'base' ? 'base' : 'cosmetic' })} />
      </Reveal>
      <Reveal when={isBase && BASE_AREAS.ON === 0}>{() => (
        <FieldRow stacked label="Team" help="Whose safe ground it is.">
          <div className="k-ev-chips">
            {([0, 1, 2, 3] as const).map(t => (
              <button key={t} type="button" className={z.team === t ? 'k-segbtn k-segbtn-on' : 'k-segbtn'} onClick={() => { updateSelectedZone(logic, { team: t }); onUpdate(); }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: palette[t] }} />{TEAM_NAMES[t]}
              </button>
            ))}
          </div>
        </FieldRow>
      )}</Reveal>
      <Reveal when={full}>
        <Group title="Look" foldKey="area-look">
          <ColorMapControl value={look} use={CM_USE.GENERAL} onChange={v => put({ color: v.color, colorMap: v.colorMap, colorFree: v.colorFree })} label="Color" help="The area's color. With Color Map on it is a named color that follows light and dark mode." />
          <ColorMapSwitch value={look} use={CM_USE.GENERAL} compact onChange={v => put({ color: v.color, colorMap: v.colorMap, colorFree: v.colorFree })} />
          <SliderRow label="Opacity" value={Math.round(look.opacity * 100)} onChange={v => put({ opacity: v / 100 })} min={0} max={100} step={1} suffix="%" tooltip="How solid the area looks in a match. In the Map Designer an invisible one still shows its outline and its name." />
          <ToggleRow label="Show Name" help="Its name, drawn on the area in a match." checked={z.showName === true} onChange={v => put({ showName: v })} />
          <ToggleRow label="Clear Walls Under It" help="Any wall this area covers is taken away when the map is built, so a new roll of the maze never stands on it." checked={(z as { clearWalls?: boolean }).clearWalls === true} onChange={v => put({ clearWalls: v || undefined } as Partial<typeof z>)} />
        </Group>
      </Reveal>
      <Reveal when={full}>{() => (
        <Group title="Shape" foldKey="area-shape">
          <FieldRow stacked label="Shape" help="Cells: rectangles on the map's cells. Ellipse and Polygon: drawn in its box (Shift on the map keeps it even). Free Shape: its own points. Drag the handles on the map to stretch it; Shift keeps its proportions, Alt stretches it from its middle.">
            <div className="k-ev-chips">
              {([['rect', 'Cells'], ['ellipse', 'Ellipse'], ['poly', 'Polygon'], ['free', 'Free Shape']] as [AreaToolShape, string][]).map(([k, label]) => (
                <button key={k} type="button" className={shapeKind === k ? 'k-segbtn k-segbtn-on' : 'k-segbtn'} onClick={() => { if (shapeKind !== k) { setPickedAreaShape(logic, k); onUpdate(); } }}>{label}</button>
              ))}
            </div>
          </FieldRow>
          <Reveal when={shapeKind === 'poly'}>{() => (
            <SliderRow label="Sides" value={sh?.sides ?? 6} onChange={v => { setPickedAreaShape(logic, 'poly', v); onUpdate(); }} min={AREA_SIDES_MIN} max={AREA_SIDES_MAX} step={1} tooltip="A regular polygon of this many sides, drawn in its box again (a turn it had starts over)." />
          )}</Reveal>
          <Reveal when={sh !== null}>{() => (
            <SliderRow label="Turn" value={turnDeg} onChange={v => { setPickedAreaTurn(logic, v); onUpdate(); }} min={-180} max={180} step={1} suffix="deg" tooltip="Turns the shape round the middle of its box." />
          )}</Reveal>
          <Reveal when={sh !== null}>{() => (
            <ToggleRow label="Edit Points" help="Shows its points on the map instead of its box. Click a point to pick it, Shift and click to pick more, or draw a box round them, then drag them together (Shift keeps the move straight). Drag a side to move it, Alt and drag a side to pull a new piece out of it, click a side to add a point. Alt and click a point, or press Delete, to take points away; the arrow keys nudge the picked ones. A double click on the area does the same. An ellipse becomes points first." checked={logic.mapEditor.vtxMode} onChange={() => { togglePickedAreaPoints(logic); onUpdate(); }} />
          )}</Reveal>
        </Group>
      )}</Reveal>
      <Reveal when={full}>{() => <AreaFillCard logic={logic} z={z} areaId={areaId} onUpdate={onUpdate} />}</Reveal>
      <Group title="Size" foldKey="area-size">
        <SliderRow label="Width" value={z.cw} onChange={v => { updateSelectedZone(logic, { cw: v }); onUpdate(); }} min={1} max={Math.max(z.cw, areaRefById(logic, areaId)?.state.gridCells ?? z.cw)} step={1} display={v => `${v} cells`} tooltip="Grows from its top left corner. Or drag a corner on the map." />
        <SliderRow label="Height" value={z.ch} onChange={v => { updateSelectedZone(logic, { ch: v }); onUpdate(); }} min={1} max={Math.max(z.ch, areaRefById(logic, areaId)?.state.gridCellsY ?? z.ch)} step={1} display={v => `${v} cells`} tooltip="Grows down from its top left corner. Or drag a corner on the map." />
        <LongList gap={4} estimate={32} count={sh === null ? (z.more?.length ?? 0) : 0} rowKey={k => `${z.more![k].gx},${z.more![k].gy}`} renderRow={k => { const m = z.more![k]; return (
            <div className="k-ev-b-row">
              <span className="k-count">{`${m.cw} by ${m.ch} Cells`}</span>
              <span className="k-ev-grow" />
              <IconButton size="sm" label="Remove this rectangle" onClick={() => { logic.applyMapEdit(areaId, cfg => opRemoveZoneRect(cfg, z.id, k)); onUpdate(); }}><Trash2 size={13} /></IconButton>
            </div>
          ); }} />
        <Reveal when={full && sh === null}><Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={addRect} title="Then drag on the map: one area, as many rectangles as you like.">Add A Rectangle</Button></Reveal>
      </Group>
      <Reveal when={full}>{() => (<div className="k-ev-inspector-part">
        <Group title="In Groups" foldKey="area-groups" count={inGroups.length}>
          <ChipsField values={inGroups.map(g => ({ key: String(g.id), label: g.name }))} offer={[...groups.map(g => ({ key: String(g.id), label: g.name })), { key: 'new', label: 'New Group' }]} addLabel="Add To A Group"
            onRemove={k => { const g = inGroups.find(x => String(x.id) === k); if (g) ctx.commit(d => setAt(d, ['areaGroups', indexOfId(d, 'areaGroups', g.id), 'members'], g.members.filter(m => m.id !== z.uid))); }}
            onAdd={v => {
              if (z.uid === undefined) return;
              const me: Ref = { id: z.uid, n: z.name ?? '' };
              if (v === 'new') ctx.commit(d => addAreaGroup(d, 'Area Group', [me]).doc);
              else ctx.commit(d => { const gi = indexOfId(d, 'areaGroups', Number(v)); return setAt(d, ['areaGroups', gi, 'members'], [...d!.areaGroups![gi].members, me]); });
            }} />
        </Group>
        <Group title="Behaviours" foldKey="area-behaviours" count={behaviorsOf(z as unknown as ZoneLike).length}>{i >= 0 ? <ZoneBehaviors z={z as unknown as ZoneLike} i={i} ctx={ctx} /> : null}</Group>
        <FieldRow label="Used By" help={used ? `Named by: ${usedByNames(ctx.doc, ctx.zones, z.uid ?? -1).join(', ')}.` : 'No Map Event, wave or Entity Type names this area yet.'}>
          <Chip onClick={used ? () => openMapEvents(areaId, 'events') : undefined}>{used === 0 ? 'Nothing' : `${used} ${used === 1 ? 'Link' : 'Links'}`}</Chip>
        </FieldRow>
      </div>)}</Reveal>
    </div>
  );
};

const AreaFillCard: React.FC<{ logic: GameLogic; z: PlacedZone; areaId: string; onUpdate: () => void }> = ({ logic, z, areaId, onUpdate }) => {
  const [lib, setLib] = useState<'maze' | 'rocks' | null>(null);
  const fill = z.fill;
  const cfg = areaRefById(logic, areaId)?.cfg ?? logic.state.mapConfig;
  const put = (f: AreaFill | null) => { setPickedAreaFill(logic, f); onUpdate(); };
  const patch = (p: Partial<AreaFill>) => { if (fill) put({ ...fill, ...p }); };
  const kinds = fill ? fillKindsOf(fill, cfg) : [];
  const fixed = fill !== undefined && typeof fill.seed === 'number';
  return (
    <Group title="Inside It" foldKey="area-fill">
      <FieldRow stacked label="Makes Inside It" help="A maze or a rock pattern of the Map Library, made inside this area when the map is built, as if it were a small map its own size. Bots find their way through it as through any wall or rock of the map.">
        <div className="k-ev-chips">
          {([['none', 'Nothing'], ['maze', 'A Maze'], ['rocks', 'Rocks']] as const).map(([k, label]) => (
            <button key={k} type="button" className={(fill?.k ?? 'none') === k ? 'k-segbtn k-segbtn-on' : 'k-segbtn'}
              onClick={() => { if ((fill?.k ?? 'none') === k) return; put(k === 'none' ? null : k === 'maze' ? { k: 'maze', maze: 21 } : { k: 'rocks', rocks: 'pumpkinPatch' }); }}>{label}</button>
          ))}
        </div>
      </FieldRow>
      <Reveal when={fill?.k === 'maze'}>{() => (
        <div className="k-ev-inspector-part">
          <FieldRow label="Maze" help="Which maze of the Map Library it makes."><Button size="sm" variant="secondary" onClick={() => setLib('maze')}>{MazeTypeName(fill!.maze ?? 21)}</Button></FieldRow>
          <SliderRow label="Erosion" value={fill!.erosion ?? cfg.erosionIntensity ?? 1} onChange={v => patch({ erosion: v })} min={0} max={2} step={0.1} tooltip="How much of the maze's walls is worn away, as the map's own Maze Erosion." />
        </div>
      )}</Reveal>
      <Reveal when={fill?.k === 'rocks'}>{() => (
        <div className="k-ev-inspector-part">
          <FieldRow label="Rock Pattern" help="Which rock pattern of the Map Library it lays. Pumpkin Patch: the Halloween patch, rocks at random, never touching."><Button size="sm" variant="secondary" onClick={() => setLib('rocks')}>{ROCK_PATTERN_NAMES[fillPatternOf(fill!)]}</Button></FieldRow>
          <SliderRow label="How Many" value={fillCountOf(fill!, cfg)} onChange={v => patch({ count: Math.round(v) })} min={0} max={500} step={1} tooltip="How many rocks inside it. Fewer fit where walls or other rocks stand." />
          <SliderRow label="Size Spread" value={fillVariationOf(fill!, cfg)} onChange={v => patch({ variation: v })} min={0} max={100} step={1} suffix="%" tooltip="How much the rocks differ in size around their own size." />
          <FieldRow label="Kinds" help="Which rocks it lays: Rocks are the big ones (and the only pumpkins), Stones and Gravel smaller.">
            <div className="k-ev-chips">
              {(['rock', 'stone', 'gravel'] as const).map(k => (
                <button key={k} type="button" className={kinds.includes(k) ? 'k-segbtn k-segbtn-on' : 'k-segbtn'}
                  onClick={() => { const next = kinds.includes(k) ? kinds.filter(x => x !== k) : [...kinds, k]; if (next.length > 0) patch({ kinds: next }); }}>{k === 'rock' ? 'Rocks' : k === 'stone' ? 'Stones' : 'Gravel'}</button>
              ))}
            </div>
          </FieldRow>
        </div>
      )}</Reveal>
      <Reveal when={fill !== undefined}>{() => (
        <div className="k-ev-inspector-part">
          <SelectRow label="Its Roll" help="The Map's Seed: a new map rolls it anew (each match of a mode). A Fixed Seed: the same every time." value={fixed ? 'fixed' : 'map'}
            options={[{ value: 'map', label: 'The Map\'s Seed' }, { value: 'fixed', label: 'A Fixed Seed' }]}
            onChange={v => { if (v === 'map') { const f = { ...fill! }; delete f.seed; put(f); } else patch({ seed: (cfg.seed >>> 0) % 1000000 }); }} />
          <Reveal when={fixed}>{() => (
            <FieldRow label="Seed" help="The roll of its maze or rocks."><NumberBox className="k-field k-ev-num" value={fill!.seed ?? 0} min={0} onChange={x => { const n = num(x.target.value); if (n !== undefined && n >= 0) patch({ seed: Math.floor(n) }); }} /></FieldRow>
          )}</Reveal>
        </div>
      )}</Reveal>
      {lib !== null ? (
        <MapLibraryWindow logic={logic} config={cfg} library={[]} pickOnly startOnRocks={lib === 'rocks'}
          fillPick={{ tip: `Click to make it inside ${z.name ?? 'this area'}.`, label: 'Make It Inside' }}
          onLoadMaze={type => { setLib(null); put({ ...(fill?.k === 'maze' ? fill : {}), k: 'maze', maze: type } as AreaFill); }}
          onPickRock={pattern => { setLib(null); put({ k: 'rocks', rocks: pattern, ...(fill?.seed !== undefined ? { seed: fill.seed } : {}) }); }}
          onLoadCustom={() => {}} onLoadFile={() => {}} onSaveFile={() => {}} onRemove={() => {}} onImport={() => {}} onSaveCurrent={() => {}} onLoadMode={() => {}}
          onClose={() => setLib(null)} />
      ) : null}
    </Group>
  );
};

const SIDES = [{ value: 'team1', label: 'Blue' }, { value: 'team2', get label() { return SIDE_WORDS[1].shown; } }, { value: 'team3', get label() { return SIDE_WORDS[2].shown; } }, { value: 'team4', label: 'Purple' }, { value: 'team5', label: 'Dreadnoughts' }, { value: 'neutral', label: 'Neutral' }, { value: 'ffa', label: 'Free For All' }, { value: 'player', label: 'The Player\'s Side' }, { value: 'againstPlayer', label: 'Against The Player' }];

const EntityInspector: React.FC<{ logic: GameLogic; ctx: EvCtx; e: PlacedEntity; areaId: string; onUpdate: () => void }> = ({ logic, ctx, e, areaId }) => {
  const pi = (ctx.doc?.placed ?? []).findIndex(x => x.id === e.id);
  const ti = (ctx.doc?.types ?? []).findIndex(x => x.id === e.type?.id);
  const type: EntityType | undefined = ctx.doc?.types?.[ti];
  const nameBox = useFocusName(logic, e.id);
  const putRow = (k: keyof PlacedEntity, v: unknown) => ctx.commit(d => setAt(d, ['placed', pi, k], v));
  const putType = (k: keyof EntityType, v: unknown) => ctx.commit(d => setAt(d, ['types', ti, k], v));
  const form0 = type?.forms[0];
  const second = type?.forms[1];
  const isGuard = type?.brain === 'guard';
  const becomes = !!form0?.onDeath && form0.onDeath.to !== 'none';
  const bothWays = !!second?.onDeath;
  const plans = ctx.doc?.plans?.length ?? 0;
  const sharedBy = (ctx.doc?.placed ?? []).filter(x => x.type?.id === e.type?.id).length;
  const events = (ctx.doc?.rules ?? []).filter(r => r.owner?.id === e.id || (type && JSON.stringify(r.when).includes(`"id":${type.id},`)));
  const makeUnique = () => ctx.commit(d => {
    const r = withIds(d, (id, base) => {
      const copy: EntityType = JSON.parse(JSON.stringify(type));
      copy.id = id();
      copy.name = `${type!.name} (${(base.types?.length ?? 0) + 1})`;
      const map = new Map<number, number>();
      for (const f of copy.forms) { const n = id(); map.set(f.id, n); f.id = n; }
      for (const f of copy.forms) { if (f.onDeath && typeof f.onDeath.to === 'number') f.onDeath.to = map.get(f.onDeath.to) ?? f.onDeath.to; if (f.after) f.after.to = map.get(f.after.to) ?? f.after.to; }
      return copy;
    });
    const withType = { ...r.doc, types: [...(r.doc.types ?? []), r.value] };
    return setAt(withType, ['placed', pi, 'type'], { id: r.value.id, n: r.value.name });
  });
  if (!type || !form0) return (
    <div className="k-ev-inspector">
      <div className="k-ev-note">Its Entity Type "{e.type?.n}" is gone. It does not stand.</div>
      <EvSelect value="" placeholder="Pick An Entity Type" options={choicesOf('type', ctx).map(x => ({ value: String(x.id), label: x.name }))} onChange={v => { const hit = choicesOf('type', ctx).find(x => String(x.id) === v); if (hit) putRow('type', { id: hit.id, n: hit.name }); }} />
    </div>
  );
  return (
    <div className="k-ev-inspector">
      <div className="k-ev-detail-head"><span className="k-ev-detail-title">{e.name}</span><span className="k-count">Map Entity</span></div>
      <div ref={nameBox}><FieldRow stacked label="Name" help="What it is called in every list and menu of this map."><TextField value={e.name} onChange={v => putRow('name', v)} /></FieldRow></div>
      <FieldRow stacked label="Entity Type" help="What it is: its tank, how it acts and what it becomes. Many Map Entities can share one.">
        <EvSelect value={String(type.id)} options={[...choicesOf('type', ctx).map(x => ({ value: String(x.id), label: x.name })), { value: 'new', label: 'New Entity Type' }]} onChange={v => {
          if (v === 'new') { ctx.commit(d => { const r = addEntityType(d, 'Entity Type', typeof form0.tank === 'string' ? form0.tank : 'basic'); return setAt(r.doc, ['placed', pi, 'type'], r.ref); }); return; }
          const hit = choicesOf('type', ctx).find(x => String(x.id) === v); if (hit) putRow('type', { id: hit.id, n: hit.name });
        }} />
      </FieldRow>
      <Reveal when={sharedBy > 1}><div className="k-ev-stack">
        <FieldRow label="Shared By" help="What changes in its Entity Type changes all of these. Make Unique gives this one a copy of its own."><span className="k-count">{`${sharedBy} Map Entities`}</span></FieldRow>
        <Button size="sm" variant="secondary" block onClick={makeUnique}>Make Unique</Button>
      </div></Reveal>
      <FieldRow stacked label="What It Is" help="Anything of the Content Library: a tank, a shape of the food or your own, a ball, a flag."><ThingField value={typeof form0.tank === 'string' ? form0.tank : undefined} ctx={ctx} onChange={w => ctx.commit(d => setAt(d, ['types', ti, 'forms', 0, 'tank'], w))} /></FieldRow>
      <SelectRow label="Side" help={isGuard ? 'The team whose base it guards.' : 'The side it fights for.'} value={type.side.team} options={isGuard ? SIDES.filter(o => ['team1', 'team2', 'team3', 'team4'].includes(o.value)) : SIDES} onChange={v => putType('side', { ...type.side, team: v })} />
      <Reveal when={isGuard}>{() => (
        <Group title="Base Guard" foldKey="entity-guard">
          <ToggleRow label="Pushing Shots" help="Its shots do little damage but shove enemies back hard, the same for every tank size." checked={type.guard?.push !== false} onChange={v => putType('guard', { ...type.guard, push: v })} />
          <Reveal when={type.guard?.push !== false}>
            <SliderRow label="Push Strength" value={type.guard?.strength ?? 100} onChange={v => putType('guard', { ...type.guard, strength: v })} min={0} max={300} step={5} suffix="%" tooltip="How hard its shots shove, in percent of the measured push." />
          </Reveal>
          <SliderRow label="Defends Within" value={type.guard?.range ?? 1225} onChange={v => putType('guard', { ...type.guard, range: v })} min={100} max={3000} step={25} tooltip="How far it defends: its guns and its eyes reach this far." />
        </Group>
      )}</Reveal>
      <SelectRow label="Team Colour" help="As Its File: the colour of its tank file. Its Side's: the colour of its team." value={form0.colour?.use ?? 'file'} options={[{ value: 'file', label: 'As Its File' }, { value: 'team', label: 'Its Side\'s' }, ...(form0.colour?.use === 'slot' ? [{ value: 'slot', label: 'A Colour Of The Map' }] : [])]} onChange={v => ctx.commit(d => setAt(d, ['types', ti, 'forms', 0, 'colour'], v === 'file' ? undefined : v === 'slot' ? form0.colour : { use: v }))} />
      <Reveal when={!isGuard}><ToggleRow label="Stands Still" help="On: it stays where it was placed. Off: it walks by its order or its mind." checked={type.stands !== false} onChange={v => putType('stands', v)} /></Reveal>
      <Reveal when={!isGuard}><ToggleRow label="Become Upon Death" help="At its death a new body stands on the very spot, at full health." checked={becomes} onChange={v => ctx.commit(d => setBecome(d!, type.id, v ? (typeof second?.tank === 'string' ? second.tank : typeof form0.tank === 'string' ? form0.tank : 'basic') : null))} /></Reveal>
      <Reveal when={becomes && !isGuard}>{() => (<div className="k-ev-inspector-part">
        <FieldRow stacked label="Becomes" help="What the new body is."><ThingField value={typeof second?.tank === 'string' ? second.tank : undefined} ctx={ctx} onChange={w => ctx.commit(d => setBecome(d!, type.id, w, bothWays))} /></FieldRow>
        <SelectRow label="On The Side Of" help="Which side the new body fights for." value={form0.onDeath?.team ?? 'form'} options={[{ value: 'form', label: 'Its Own' }, { value: 'killer', label: 'Its Killer' }]} onChange={v => ctx.commit(d => setAt(d, ['types', ti, 'forms', 0, 'onDeath', 'team'], v))} />
        <ToggleRow label="Works Both Ways" help="When that one dies, this one comes back." checked={bothWays} onChange={v => ctx.commit(d => setBecome(d!, type.id, typeof second?.tank === 'string' ? second.tank : 'basic', v))} />
        <FieldRow label="Cannot Be Hurt For" help="For this long after the change nothing can hurt it."><NumField value={form0.onDeath?.grace ?? 0} unit="s" onChange={v => ctx.commit(d => setAt(d, ['types', ti, 'forms', 0, 'onDeath', 'grace'], v))} /></FieldRow>
      </div>)}</Reveal>
      <Reveal when={plans > 0}>{() => (
        <FieldRow stacked label="Evolve At Waves" help="At these waves of a Wave Plan it changes tank, for the bodies born from then on."><div className="k-ev-stack">
        <LongList gap={4} estimate={40} count={form0.evolve?.length ?? 0} rowKey={j => String(form0.evolve![j].id)} renderRow={j => { const ev = form0.evolve![j]; return (
            <div className="k-ev-b-row">
              <NumberBox className="k-field k-ev-num" value={ev.wave} min={1} title="At Wave" onChange={x => { const n = num(x.target.value); if (n !== undefined) ctx.commit(d => setAt(d, ['types', ti, 'forms', 0, 'evolve', j, 'wave'], n)); }} />
              <TankField value={ev.tank} ctx={ctx} onChange={w => ctx.commit(d => setAt(d, ['types', ti, 'forms', 0, 'evolve', j, 'tank'], w))} />
              <IconButton size="sm" label="Remove" onClick={() => ctx.commit(d => removeAt(d, ['types', ti, 'forms', 0, 'evolve'], j))}><Trash2 size={13} /></IconButton>
            </div>
          ); }} />
        <Button size="sm" variant="secondary" block icon={<Plus size={13} />} onClick={() => ctx.commit(d => { const r = withIds(d, (id, base) => ({ id: id(), wave: (form0.evolve?.[form0.evolve.length - 1]?.wave ?? 0) + 5, tank: typeof form0.tank === 'string' ? form0.tank : 'basic', plan: base.plans?.[0] ? { id: base.plans[0].id, n: base.plans[0].name } : undefined })); return setAt(r.doc, ['types', ti, 'forms', 0, 'evolve'], [...(form0.evolve ?? []), r.value]); })}>Add A Wave</Button>
        </div></FieldRow>
      )}</Reveal>
      <Group title="More Details" foldKey="entity-more" collapsible defaultOpen={false}>
        <ToggleRow label="Can Die" help="Off: nothing can kill it." checked={type.canDie !== false} onChange={v => putType('canDie', v)} />
        <ToggleRow label="Can Stand In A Wall" help="On: walls do not push it out, so it can stand half inside one and is drawn under it, as a door's button." checked={type.inWalls === true} onChange={v => putType('inWalls', v)} />   { }
        <ToggleRow label="Counts As A Kill" help="Off: its killer reads no line and no kill is counted, as a door's button or a generator." checked={type.countsAsKill !== false} onChange={v => putType('countsAsKill', v)} />
        <ToggleRow label="Seen By Bots" help="Off: bots act as if it were not there." checked={type.seenByBots !== false} onChange={v => putType('seenByBots', v)} />
        <ToggleRow label="On Leaderboard" help="Whether it stands on the leaderboard." checked={type.onLeaderboard === true} onChange={v => putType('onLeaderboard', v)} />
        <ToggleRow label="On Minimap" help="Whether it shows on the minimap." checked={type.onMinimap !== false} onChange={v => putType('onMinimap', v)} />
        <Reveal when={type.onMinimap !== false}><ToggleRow label="On Everyone's Minimap" help="Every player sees it on the minimap in its colour, whatever its side, as a boss. Off: as a tank of its side." checked={type.minimapAll === true} onChange={v => putType('minimapAll', v)} /></Reveal>
        <SelectRow label="Show Name" help="Its name, drawn over it in a match." value={e.showName === undefined ? '' : e.showName ? 'yes' : 'no'} options={[{ value: '', label: 'As Its Type' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={v => putRow('showName', v === '' ? undefined : v === 'yes')} />
        <FieldRow label="Size" help="How big it is. Empty: its file's."><NumberBox className="k-field k-ev-num" value={form0.size ?? ''} min={1} placeholder="Its File's" onChange={x => ctx.commit(d => setAt(d, ['types', ti, 'forms', 0, 'size'], num(x.target.value)))} /></FieldRow>
        <FieldRow label="Turned (degrees)" help="The way it faces when it is born."><NumberBox className="k-field k-ev-num" value={e.angle ?? 0} onChange={x => putRow('angle', num(x.target.value) ?? 0)} /></FieldRow>
        <SelectRow label="Home Area" help="A rule can say: the home area of this one." value={String(e.home?.id ?? '')} options={[{ value: '', label: 'None' }, ...choicesOf('area', ctx).map(x => ({ value: String(x.id), label: x.name }))]} onChange={v => { const hit = choicesOf('area', ctx).find(x => String(x.id) === v); putRow('home', hit ? { id: hit.id, n: hit.name } : undefined); }} />
      </Group>
      <FieldRow label="Map Events About It" help="The Map Events that name this one or its Entity Type.">
        <Chip onClick={events.length ? () => openMapEvents(areaId, 'events', events[0].id) : undefined}>{events.length === 0 ? 'Nothing' : `${events.length} ${events.length === 1 ? 'Event' : 'Events'}`}</Chip>
      </FieldRow>
      <Button size="sm" variant="secondary" block onClick={() => openMapEvents(areaId, 'types', type.id)}>Open Its Entity Type</Button>
    </div>
  );
};

const RowMenu: React.FC<{ onMirror: () => void; onDuplicate: () => void; onRemove: () => void }> = ({ onMirror, onDuplicate, onRemove }) => {
  const menu = useDropMenu({ estimatedHeight: 130, estimatedWidth: 200 });
  const act = (f: () => void) => () => { menu.close(); f(); };
  return (
    <>
      <IconButton ref={menu.triggerRef as React.Ref<HTMLButtonElement>} size="sm" label="More" onClick={e => menu.toggle(e.currentTarget.getBoundingClientRect())}><MoreHorizontal size={14} /></IconButton>
      <DropMenu menu={menu} className="k-menu" label="This One">
        <button type="button" role="menuitem" className="k-menu-item" title="The same on the other corners of the map" onClick={act(onMirror)}><FlipHorizontal size={14} /> Mirror</button>
        <button type="button" role="menuitem" className="k-menu-item" onClick={act(onDuplicate)}><Copy size={14} /> Duplicate</button>
        <button type="button" role="menuitem" className="k-menu-item" onClick={act(onRemove)}><Trash2 size={14} /> Remove</button>
      </DropMenu>
    </>
  );
};

export const MapObjectsCard: React.FC<{ logic: GameLogic; areaId: string; onUpdate: () => void; fold?: React.MutableRefObject<FoldHandle | null> }> = ({ logic, areaId, onUpdate, fold }) => {
  const ctx = useEvCtx(logic, areaId);
  const me = logic.mapEditor;
  const [tab, setTab] = usePanelMemory<string>('mapObjects.tab', 'areas', isOneOf(['areas', 'entities']));
  const [query, setQuery] = useState('');
  const [templates, setTemplates] = useState(false);
  const view = logic.mapEventsView(areaId);
  const cfg = view?.cfg;
  const zones = cfg ? editZones(cfg) : [];
  const placed = cfg ? editEntities(cfg) : [];
  const q = query.trim().toLowerCase();
  const shownZones = q ? zones.filter(z => (z.name ?? '').toLowerCase().includes(q)) : zones;
  const shownPlaced = q ? placed.filter(e => e.name.toLowerCase().includes(q)) : placed;
  const sel = me.hasSelection && (me.selection.kind === 'zone' || me.selection.kind === 'entity') && me.selection.areaId === areaId ? me.selection : null;
  const selZone = sel && sel.kind === 'zone' && cfg ? findPlacedZone(cfg, sel.id) : null;
  const selEntity = sel && sel.kind === 'entity' && cfg ? findPlacedEntity(cfg, sel.id) : null;
  const selKey = sel ? `${sel.kind}${sel.id}` : '';
  const box = useRef<HTMLDivElement>(null);
  const problems = logic.state.isTestMode ? 0 : problemsOf(logic).length;
  const custom = !!cfg && cfg.customMap !== undefined && view?.cfg === cfg && !!cfg.customMap && (cfg.mazeType === undefined || true) && logic.isCustomMapActive();

  useEffect(() => {
    if (!selKey) return;
    let gone = false;
    const h = fold?.current;
    const opening = !!h && !h.isOpen();
    if (opening) h!.open();
    if (selZone && tab !== 'areas') setTab('areas');
    if (selEntity && tab !== 'entities') setTab('entities');
    const wait = (opening ? FOLD_MS + FOLD_FADE_MS : 0) + FOLD_FADE_MS + FOLD_MS + 60;
    const t = window.setTimeout(() => {
      if (gone) return;
      if (box.current?.isConnected) bringIntoView(box.current);
    }, wait);
    return () => { gone = true; window.clearTimeout(t); };
  }, [selKey]);
  const mods = useRef({ ctrl: false, shift: false });
  const noteMods = (e: React.MouseEvent) => { mods.current.ctrl = e.ctrlKey || e.metaKey; mods.current.shift = e.shiftKey; };
  const pick = (kind: MapEditorKind, id: number) => {
    const ids = kind === 'zone' ? zones.map(z => z.id) : placed.map(e => e.id);
    if (mods.current.ctrl) {
      const was = me.marks.length ? me.marks : (me.hasSelection && me.selection.kind === kind ? [me.selection.id] : []);
      me.marks = was.includes(id) ? was.filter(x => x !== id) : [...was, id];
    } else if (mods.current.shift && me.hasSelection && me.selection.kind === kind) {
      const a = ids.indexOf(me.selection.id), b = ids.indexOf(id);
      me.marks = a >= 0 && b >= 0 ? ids.slice(Math.min(a, b), Math.max(a, b) + 1) : [id];
    } else me.marks = [];
    setMapEditSelection(me, { areaId, kind, id, genKey: '' });
    cancelMapEditInteraction(me);
    const ref = areaRefById(logic, areaId);
    const g = ref ? resolveSelection(ref, me.selection) : null;
    if (ref && g) logic.glideMapDesignerTo(g.lx + ref.offX, g.ly + ref.offY);
    onUpdate();
  };
  const roomFor = (kind: MapEditorKind, n: number): boolean => {
    if ((kind === 'entity' ? placedCount() + n <= MAP_EDIT_MAX_ENTITIES : ctx.zones.length + n <= MAP_READ_MAX_ZONES)) return true;
    toast('info', kind === 'entity' ? 'This map holds as many Map Entities as it can.' : 'This map holds as many Custom Areas as it can.');
    return false;
  };
  const placedCount = () => ctx.doc?.placed?.length ?? 0;
  const duplicate = (kind: MapEditorKind, id: number) => {
    if (!roomFor(kind, 1)) return;
    if (kind === 'entity') ctx.commit(d => duplicatePlaced(d!, id).doc);
    else { const i = ctx.zones.findIndex(z => z.id === id); if (i >= 0) ctx.commit(d => duplicateZone(d!, i).doc); }
    onUpdate();
  };
  const mirror = (kind: MapEditorKind, id: number) => {
    if (!roomFor(kind, 3)) return;
    const grid = builtGridOf(logic.mapEventsView(areaId)!.cfg);
    if (kind === 'entity') ctx.commit(d => mirrorPlaced(d!, id, grid.w, grid.h));
    else { const i = ctx.zones.findIndex(z => z.id === id); if (i >= 0) ctx.commit(d => mirrorZone(d!, i, grid.w, grid.h)); }
    onUpdate();
  };
  const remove = (kind: MapEditorKind, id: number, name: string, used: number) => {
    const sel0 = { areaId, kind, id, genKey: '' };
    logic.applyMapEdit(areaId, c => opDelete(c, sel0));
    if (me.hasSelection && me.selection.kind === kind && me.selection.id === id) clearMapEditSelection(me);
    const mark = markOfLastEdit(logic);
    toast('info', `"${name}" removed.${used ? ` ${used} ${used === 1 ? 'link now finds' : 'links now find'} nothing.` : ''}`, { label: 'Undo', run: () => { undoMarkedEdit(logic, mark); onUpdate(); ctx.refresh?.(); } });
    onUpdate();
  };
  const zoneFacts = (z: PlacedZone) => [
    ...behaviorsOf(z as unknown as ZoneLike).map((b, i) => ({ key: `b${i}`, text: kindOf('behavior', b.k)?.label ?? b.k })),
    ...(z.opacity === 0 ? [{ key: 'hid', text: 'Invisible' }] : []),
  ];
  return (
    <div className="k-ev-card">
      <div className="k-ev-door">
        <Button variant="primary" size="md" icon={<MevEvents size={14} />} onClick={() => openMapEvents(areaId)}>Map Events</Button>
        <Reveal when={problems > 0}><IconButton label={`${problems} ${problems === 1 ? 'Problem' : 'Problems'}`} onClick={() => openMapEvents(areaId, 'problems')}><MevProblems size={15} /></IconButton></Reveal>
      </div>
      <Button variant="secondary" size="sm" block onClick={() => setTemplates(true)}>Start From A Template</Button>
      <div className="k-ev-find">
        <SearchField value={query} onChange={setQuery} placeholder="Search this map" />
        <IconButton size="sm" label="Undo" disabled={!logic.canUndoMapEdit()} onClick={() => { logic.undoMapEdit(); onUpdate(); ctx.refresh?.(); }}><Undo2 size={14} /></IconButton>
        <IconButton size="sm" label="Redo" disabled={!logic.canRedoMapEdit()} onClick={() => { logic.redoMapEdit(); onUpdate(); ctx.refresh?.(); }}><Redo2 size={14} /></IconButton>
      </div>
      <div className="k-ev-tabs-tight"><Tabs<string> value={tab} onChange={setTab} tabs={[{ value: 'areas', label: 'Custom Areas', count: zones.length }, { value: 'entities', label: 'Map Entities', count: placed.length }]} /></div>
      <SwapBox swapKey={tab}>
        <div className="k-ev-list k-ev-obj-list popup-scrollbar">
          {tab === 'areas'
            ? <LongList gap={4} estimate={68} empty={<div className="k-ev-note">Draw one with the Custom Area tool, on the map.</div>} reveal={selZone ? String(selZone.id) : null} count={shownZones.length} rowKey={i => String(shownZones[i].id)} renderRow={i => { const z = shownZones[i]; return (
                  <div onMouseDownCapture={noteMods}><PickRow title={z.name ?? (zoneBaseTeam(z as unknown as ZoneLike) >= 0 ? 'Team Base' : 'Custom Area')} facts={zoneFacts(z)} selected={(!!selZone && selZone.id === z.id) || me.marks.includes(z.id)} onPick={() => pick('zone', z.id)}
                    actions={<RowMenu onMirror={() => mirror('zone', z.id)} onDuplicate={() => duplicate('zone', z.id)} onRemove={() => remove('zone', z.id, z.name ?? 'Custom Area', z.uid !== undefined ? usedBy(ctx.doc, ctx.zones, z.uid) : 0)} />} /></div>
                ); }} />
            : <LongList gap={4} estimate={68} empty={<div className="k-ev-note">Place one with the Map Entity tool, on the map.</div>} reveal={selEntity ? String(selEntity.id) : null} count={shownPlaced.length} rowKey={i => String(shownPlaced[i].id)} renderRow={i => { const e = shownPlaced[i]; return (
                  <div onMouseDownCapture={noteMods}><PickRow title={e.name} facts={[{ key: 't', text: e.type?.n ?? '' }, ...(e.off ? [{ key: 'off', text: 'Off' }] : [])]} selected={(!!selEntity && selEntity.id === e.id) || me.marks.includes(e.id)} onPick={() => pick('entity', e.id)}
                    actions={<RowMenu onMirror={() => mirror('entity', e.id)} onDuplicate={() => duplicate('entity', e.id)} onRemove={() => remove('entity', e.id, e.name, usedBy(ctx.doc, ctx.zones, e.id))} />} /></div>
                ); }} />}
        </div>
      </SwapBox>
      <Reveal when={zones.length >= MAP_EDIT_MAX_ZONES || placed.length >= MAP_EDIT_MAX_ENTITIES}><div className="k-ev-note">{`This map holds as many as it can: ${zones.length} of ${MAP_EDIT_MAX_ZONES} Custom Areas, ${placed.length} of ${MAP_EDIT_MAX_ENTITIES} Map Entities.`}</div></Reveal>
      <div ref={box}>
        <Reveal when={selZone || selEntity}>{() => (
          <SwapBox swapKey={selKey}>
            {selZone ? <AreaInspector logic={logic} ctx={ctx} z={selZone} areaId={areaId} custom={custom} onUpdate={() => { onUpdate(); ctx.refresh?.(); }} /> : null}
            {selEntity ? <EntityInspector logic={logic} ctx={ctx} e={selEntity} areaId={areaId} onUpdate={onUpdate} /> : null}
          </SwapBox>
        )}</Reveal>
      </div>
      {templates ? <TemplatesWindow ctx={ctx} onClose={() => setTemplates(false)} onDone={() => { onUpdate(); }} /> : null}
    </div>
  );
};
void TEAM_NAMES;
